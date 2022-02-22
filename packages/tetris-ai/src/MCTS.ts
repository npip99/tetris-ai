import { AbstractGame, GameState } from './AbstractGame';
import * as tf from '@tensorflow/tfjs-node-gpu';
import { createCanvas } from 'canvas';
import * as fs from 'fs';

interface MCTSArgs {
    // 50 for Atari, 800 for Go/Chess/Shogi
    numMCTSSims: number,
    // 0.95-1.0, decay factor
    gamma: number,
    // 0.0-infinity, temperature
    temperature: number,
};

interface TrainingData {
    input: tf.Tensor3D;
    value: number;
    policy: number[];
};

class Node {
    // Current State at this node
    gameState: GameState;
    isFinalState: Boolean;
    // N = Number of visits through and including the node
    numVisits: number;
    // The original NN value
    originalValue: number;
    // Q = originalValue / N + Sum_i (N_i / N) * Q_i
    avgValue: number;
    // Children Data [Only set when numVisits > 0, and !isFinalState]
    validActions: Boolean[];
    priorPolicy: number[];
    children: ChanceNode[];

    constructor(gameState: GameState, unexploredValue: number, isFinalState: Boolean) {
        this.gameState = gameState;
        this.isFinalState = isFinalState;
        this.numVisits = 0;
        this.avgValue = unexploredValue;
    }
};

class ChanceNode {
    // N = Number of visits through and including the node
    numVisits: number;
    // Q = Weighted average of Q values of children Nodes
    avgValue: number;

    // Number of possibilities in this chance node
    numPossibilities: number;
    // Probability and Node of each possibility
    probabilities: number[];
    immediateRewards: (number | null)[];
    childNodes: Node[];
}

type getNNResultLambda = (_: tf.Tensor3D) => Promise<number[][]>;

class MCTS {
    game: AbstractGame;
    rootNode: Node;
    decisionPath: Node[];
    getNNetResult: getNNResultLambda;
    args: MCTSArgs;
    trainingData: TrainingData[];

    constructor(game: AbstractGame, rootGameState: GameState, getNNetResult: getNNResultLambda, args: MCTSArgs) {
        this.game = game;
        this.rootNode = new Node(rootGameState, 0.0, this.game.getGameEnded(rootGameState));
        //this.decisionPath = [this.rootNode];
        this.getNNetResult = getNNetResult;
        this.args = args;
        this.trainingData = [];
    }

    async simulate(cPuctInit: number, cPuctBase: number) {
        // Simulate a MCTS path
        let currentNode = this.rootNode;

        // (Node, ActionNumber)
        let path = [];

        // While we're not on a leaf node,
        while(currentNode.numVisits > 0 && !currentNode.isFinalState) {
            // ================
            // Selection
            // ================
    
            // Original AlphaZero U function
            // PUCT(s,a) = Q(s,a) + U(s,a),
            // Q(s, a) = Average value from all MCTS sims into that node
            // U(s, a) = cPuct * sqrt(Sum N(s, b) / (1 + N(s, a))) * P(s, a),
            //    With N giving the number of paths taken down that branch,
            //    And P being the policy network softmax value
    
            // MuZero Q function with delayed rewards
            // Q(s,a) = r(s,a) + γ*Q(s')
            //    With r(s,a) giving the reward of taking that action,
            //    and Q(s') giving the average value from all MCTS sims into that node
            // Normalizing Q over the min/max found in the entire search tree
            // Q(s, a) = (r(s, a) + γ*Q(s') - q_min) / (q_max - q_min)

            // Find the highest puct
            let bestAction = -1;
            let bestPUCT = -1;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (currentNode.validActions[i]) {
                    let childChanceNode = currentNode.children[i];
                    // cPuct, from Init and Base
                    let cPuct = cPuctInit + Math.log( 1.0 + currentNode.numVisits / cPuctBase );
                    // Q(s, a)
                    let avgDiscountedReward = childChanceNode.avgValue;
                    // U(s, a)
                    let uFactor = cPuct * currentNode.priorPolicy[i] * Math.sqrt(currentNode.numVisits) / (childChanceNode.numVisits + 1);
                    // PUCTvalue = Q(s, a) + U(s, a)
                    let PUCT = avgDiscountedReward + uFactor;
                    // Select the action with the highest PUCT
                    if (bestAction == -1 || PUCT > bestPUCT) {
                        bestAction = i;
                        bestPUCT = PUCT;
                    }
                }
            }

            // Go down the path from that action, and track all the nodes/edges we've taken
            let nextChanceNode = currentNode.children[bestAction];

            // Get the probabilitiy of a Non-Final-State childnodes
            let cumulativeNonFinalProb = 0.0;
            for(let i = 0; i < nextChanceNode.numPossibilities; i++) {
                if (!nextChanceNode.childNodes[i].isFinalState) {
                    cumulativeNonFinalProb += nextChanceNode.probabilities[i];
                }
            }

            // Sample from the chance node
            let nextChanceChoice = 0;
            for(let i = 0; i < nextChanceNode.numPossibilities; i++) {
                let childNode = nextChanceNode.childNodes[i];
                // The number of expected visits this node should have,
                // After we finish visiting nextChanceNode
                let expectedVisits: number;
                if (cumulativeNonFinalProb > 0.0) {
                    // Final states are final, we don't need to visit them
                    if (childNode.isFinalState) {
                        expectedVisits = 0;
                    } else {
                        // Weight visits by the probability among non-final-nodes
                        // TODO?: Maybe make this be based on the expected variance of the child
                        // (Situations with low variance don't need to be explored as much)
                        expectedVisits = (nextChanceNode.numVisits + 1.0) * (nextChanceNode.probabilities[i] / cumulativeNonFinalProb);
                    }
                } else {
                    // If all states are final, it's fine pick one
                    expectedVisits = (nextChanceNode.numVisits + 1.0) * nextChanceNode.probabilities[i];
                }
                // If this node hasn't been visited it's proportioned number of times, choose it
                if (childNode.numVisits < expectedVisits) {
                    nextChanceChoice = i;
                    break;
                }
            }

            // Go down that sampled path
            path.push([currentNode, bestAction, nextChanceChoice]);
            currentNode = nextChanceNode.childNodes[nextChanceChoice];
        }

        // ================
        // Expand the leaf
        // ================

        // Values needed for backpropagation
        let expectedValue: number;

        if (currentNode.isFinalState) {
            expectedValue = 0.0;
        } else {
            // Query the Neural Network
            let inputTensor: tf.Tensor3D = currentNode.gameState.toTensor().transpose([1, 2, 0]);
            let outputResult = await this.getNNetResult(inputTensor);
            let NNValue = outputResult[0][0];
            let NNPriors = outputResult[1];

            // Get the expected value of this node, from the NN
            expectedValue = NNValue;

            // Get the Boolean[] of valid actions from this state
            let validActions = this.game.getValidActions(currentNode.gameState);

            // Get the total probability sum over valid actions,
            // to later renomalize NN prior probabilities
            let priorValidSum = 0;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (validActions[i]) {
                    priorValidSum += NNPriors[i];
                }
            }
            if (priorValidSum == 0) {
                priorValidSum = 1.0;
            }

            // Expand children metadata
            currentNode.priorPolicy = new Array(this.game.getNumActions());
            currentNode.validActions = validActions;
            currentNode.children = new Array(this.game.getNumActions());
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (currentNode.validActions[i]) {
                    // Initialize that child
                    let nextStates = this.game.getNextStates(currentNode.gameState, i);
                    let priorPolicy = NNPriors[i] / priorValidSum;

                    // Populate the child chance node
                    let childChanceNode = new ChanceNode();
                    childChanceNode.numVisits = 0.0;
                    childChanceNode.avgValue = 0.0; // Calculate avgValue below
                    childChanceNode.numPossibilities = nextStates.length;
                    childChanceNode.probabilities = new Array(nextStates.length);
                    childChanceNode.immediateRewards = new Array(nextStates.length);
                    childChanceNode.childNodes = new Array(nextStates.length);

                    // Populate the ChanceNode's children
                    for(let j = 0; j < nextStates.length; j++) {
                        childChanceNode.probabilities[j] = nextStates[j].probability;
                        childChanceNode.immediateRewards[j] = nextStates[j].immediateReward;
                        let nextGameState = nextStates[j].gameState;

                        // Get a rough estimated of the EV of the unexplored Node
                        // expectedValue = Sum_j probabilities[j] * (immediateRewards[j] + gamma * childNodeEV)
                        // childNodeEV = (expectedValue - immediateRewards[j]) / gamma
                        let childNodeEV = expectedValue;
                        let childNodeGameOver = this.game.getGameEnded(nextGameState);
                        if (childNodeGameOver) {
                            childNodeEV = 0.0;
                        }

                        // Create the new child
                        childChanceNode.childNodes[j] = new Node(nextGameState, childNodeEV, childNodeGameOver);

                        // Update avgValue of the chanceNode, based off the child node
                        let childNodeEV_POVChanceNode: number;
                        if (childChanceNode.immediateRewards[j] != null) {
                            childNodeEV_POVChanceNode = (1.0 - this.args.gamma) * childChanceNode.immediateRewards[j]! + this.args.gamma * childChanceNode.childNodes[j].avgValue;
                        } else {
                            childNodeEV_POVChanceNode = childChanceNode.childNodes[j].avgValue;
                        }
                        childChanceNode.avgValue += childChanceNode.probabilities[j] * childNodeEV_POVChanceNode;
                    }

                    // Populate child data on currentNode
                    currentNode.priorPolicy[i] = priorPolicy;
                    currentNode.children[i] = childChanceNode;
                }
            }
        };

        // Mark as visited
        currentNode.numVisits++;
        currentNode.originalValue = expectedValue;
        currentNode.avgValue = expectedValue;

        // ================
        // Backpropagate the leaf's value
        // ================

        while(path.length > 0) {
            // Get the previous node, from bottom to root
            let prevNodeActionSample = path.pop();
            let prevNode = prevNodeActionSample[0] as Node;
            let prevAction = prevNodeActionSample[1] as number;
            let prevChanceNode = prevNode.children[prevAction];
            let prevSample = prevNodeActionSample[2] as number;
            let propagatingNode = prevChanceNode.childNodes[prevSample];
            // propagatingNode == previous's prevNode, or currentNode on the first iteration

            // Chance Node's Q = Weighted probability of Q values over all child Nodes
            let newChandeNodeQ = 0.0;
            for(let i = 0; i < prevChanceNode.numPossibilities; i++) {
                // EV of that Child
                let expectedValue: number;
                if (prevChanceNode.immediateRewards[i] != null) {
                    expectedValue = (1.0 - this.args.gamma) * prevChanceNode.immediateRewards[i]! + this.args.gamma * prevChanceNode.childNodes[i].avgValue;
                } else {
                    expectedValue = prevChanceNode.childNodes[i].avgValue;
                }
                newChandeNodeQ += prevChanceNode.probabilities[i] * expectedValue;
            }
            // Update that ChanceNode
            prevChanceNode.avgValue = newChandeNodeQ;
            prevChanceNode.numVisits++;
            
            // Node's Q = OriginalValue / N + Sum (N_i / N) * Q_i, over all child ChanceNodes
            let newNodeN = prevNode.numVisits + 1;
            let newNodeQ = prevNode.originalValue / newNodeN;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (prevNode.validActions[i]) {
                    newNodeQ += (prevNode.children[i].numVisits / newNodeN) * prevNode.children[i].avgValue;
                }
            }
            // Update that previous Node
            prevNode.avgValue = newNodeQ;
            prevNode.numVisits = newNodeN;
        }
    }

    isGameOver() {
        return this.rootNode.isFinalState;
    }

    async iterate() {
        const cPuctInit = 1.25; // Training
        const cPuctBase = 18000;
        // const cPuctInit = 2.4; // MatchPlay

        if (this.rootNode.isFinalState) {
            throw new Error("Tried to iterate a completed MCTS!");
        }

        // ==============
        // Adjust PriorPolicy of the Root Node
        // ==============

        // Make sure the rootNode has been visited at least once,
        // So that its childrens' data is initialized
        if (this.rootNode.numVisits == 0) {
            await this.simulate(cPuctInit, cPuctBase);
        }

        // Adjust the prior probabilities of the rootnode, using Dirichlet Noise
        let numValidActions = this.rootNode.validActions.reduce((a, b) => a + (b ? 1.0 : 0.0), 0.0);
        for(let i = 0; i < this.game.getNumActions(); i++) {
            if (this.rootNode.validActions[i]) {
                this.rootNode.priorPolicy[i] = 0.75 * this.rootNode.priorPolicy[i] + 0.25 * (1.0 / numValidActions);
            }
        }

        // ==============
        // Run a set number of simulations
        // ==============

        // Run many simulations, as part of MCTS evaluation of the root node
        while(this.rootNode.numVisits < this.args.numMCTSSims) {
            await this.simulate(cPuctInit, cPuctBase);
        }
    }
    
    sampleMove() {
        // ==============
        // Save the result for future training of the NN
        // ==============

        // Save the training data from this iteration,
        // to train the next iteration of the neural network
        this.trainingData.push({
            input: this.rootNode.gameState.toTensor().transpose([1, 2, 0]),
            value: this.rootNode.avgValue,
            policy: (new Array(this.game.getNumActions())).map((_, i) => {
                if (this.rootNode.validActions[i]) {
                    return this.rootNode.children[i].numVisits / (this.rootNode.numVisits - 1);
                } else {
                    return 0.0;
                }
            }),
        });

        // ==============
        // Sample the probability distribution to get the next action
        // ==============

        let chosenAction = -1;

        if (this.args.temperature < 0.01) {
            // If Temperature is small enough, just sample the best move
            let bestN = -1;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (this.rootNode.validActions[i]) {
                    if (this.rootNode.children[i].numVisits > bestN) {
                        bestN = this.rootNode.children[i].numVisits;
                        chosenAction = i;
                    }
                }
            }
        } else {
            // Otherwise, weight by temperature

            // Construct the probability distribution that we'll sample from
            let probabilityDistribution = new Array(this.game.getNumActions());

            // Set temperature-weighted probability distribution, tracking the total sum
            let probSum = 0;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (this.rootNode.validActions[i]) {
                    probabilityDistribution[i] = Math.pow(this.rootNode.children[i].numVisits, 1.0/this.args.temperature);
                    probSum += probabilityDistribution[i];
                }
            }
            // Normalize the probabilities using the total sum
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (this.rootNode.validActions[i]) {
                    probabilityDistribution[i] /= probSum;
                }
            }

            // Randomly sample from the probability distribution of valid actions
            let randomSample = Math.random();
            let cumulativeSum = 0.0;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (this.rootNode.validActions[i]) {
                    cumulativeSum += probabilityDistribution[i];
                    // Set chosenAction outside of if-statement,
                    // In-case float rounding errors make total cumulative sum < 1.0
                    chosenAction = i;
                    if (randomSample < cumulativeSum) {
                        break;
                    }
                }
            }
        }

        // Select that action to be the new root node
        let chosenChanceNode = this.rootNode.children[chosenAction];
        // Sample from possibilities to get back to a deterministic Node
        let randomSample = Math.random();
        let cumulativeSum = 0.0;
        let chosenSample = 0; // 0 just in case it doesn't sum to exactly 1.0
        for(let i = 0; i < chosenChanceNode.numPossibilities; i++) {
            cumulativeSum += chosenChanceNode.probabilities[i];
            if (randomSample < cumulativeSum) {
                chosenSample = i;
                break;
            }
        }

        // If true, chose the unlucky branch if one branch can kill you
        const punishQuickly = false;
        if (punishQuickly) {
            for(let i = 0; i < chosenChanceNode.numPossibilities; i++) {
                if (chosenChanceNode.childNodes[i].isFinalState) {
                    chosenSample = i;
                    break;
                }
            }
        }

        // Set the rootNode to this new Node
        this.rootNode = chosenChanceNode.childNodes[chosenSample];
    }

    drawTree(rootNode: Node) {
        // Image
        const NODE_WIDTH = 75;
        const NODE_PADDING = 10;
        // The first drawing will be small, then we later draw on the larger canvas
        let image = createCanvas(1, 1);
        let ctx = image.getContext('2d');
        // Track the max column/row of what we've drawn
        let maxRow = 0;

        // Statistics
        let numExploredNodesDrawn = 0;
        let numNodesDrawn = 0;
        let numChanceNodesDrawn = 0;

        let drawNode = (node: Node, column: number, row: number) => {
            let x = column * NODE_WIDTH;
            let y = row * NODE_WIDTH;

            numNodesDrawn++;
            if (node.numVisits > 0) {
                numExploredNodesDrawn++;
            }
            // Draw Circle
            ctx.strokeStyle = 'red';
            ctx.beginPath();
            ctx.arc(x + NODE_WIDTH / 2, y + NODE_WIDTH / 2, NODE_WIDTH / 2 - NODE_PADDING, 0, 2 * Math.PI);
            ctx.stroke();
            // Prepare Text
            let height = Math.floor(NODE_WIDTH / 6);
            ctx.font = height + "px sans-serif";
            // Draw N
            let text = 'N = ' + node.numVisits;
            let textMetrics = ctx.measureText(text);
            ctx.fillText(text, x + NODE_WIDTH / 2 - textMetrics.width / 2, y + NODE_WIDTH / 2 - height / 2);
            // Draw Q
            text = 'Q = ' + node.avgValue.toFixed(2);
            if (node.isFinalState) {
                text += "~";
            }
            textMetrics = ctx.measureText(text);
            ctx.fillText(text, x + NODE_WIDTH / 2 - textMetrics.width / 2, y + NODE_WIDTH / 2 + height / 2);
        }

        let drawChanceNode = (chanceNode: ChanceNode, column: number, row: number) => {
            let x = column * NODE_WIDTH;
            let y = row * NODE_WIDTH;

            numChanceNodesDrawn++;
            // Draw Circle
            ctx.strokeStyle = 'blue';
            ctx.beginPath();
            ctx.arc(x + NODE_WIDTH / 2, y + NODE_WIDTH / 2, NODE_WIDTH / 2 - NODE_PADDING, 0, 2 * Math.PI);
            ctx.stroke();
            // Prepare Text
            let height = Math.floor(NODE_WIDTH / 6);
            ctx.font = height + "px sans-serif";
            // Draw N
            let text = 'N = ' + chanceNode.numVisits;
            let textMetrics = ctx.measureText(text);
            ctx.fillText(text, x + NODE_WIDTH / 2 - textMetrics.width / 2, y + NODE_WIDTH / 2 - height / 2);
            // Draw Q
            text = 'Q = ' + chanceNode.avgValue.toFixed(2);
            textMetrics = ctx.measureText(text);
            ctx.fillText(text, x + NODE_WIDTH / 2 - textMetrics.width / 2, y + NODE_WIDTH / 2 + height / 2);
        }

        let drawPath = (c1: number, r1: number, c2: number, r2: number, text: string) => {
            let x1 = c1 * NODE_WIDTH + NODE_WIDTH / 2;
            let y1 = r1 * NODE_WIDTH + NODE_WIDTH - NODE_PADDING;
            let x2 = c2 * NODE_WIDTH + NODE_WIDTH / 2;
            let y2 = r2 * NODE_WIDTH + NODE_PADDING;

            ctx.strokeStyle = 'grey';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            // Prepare Text
            let height = Math.floor(NODE_WIDTH / 6);
            ctx.font = height + "px sans-serif";
            // Draw Text
            ctx.strokeStyle = 'black';
            let textMetrics = ctx.measureText(text);
            let numLines = (text.match(/\n/g) || []).length + 1;
            ctx.fillText(text, (x1 + x2) / 2 + 5, (y1 + y2) / 2 - height * numLines / 2 + height);
        };

        // Returns the largest width of its children layers
        let dfs = (node: Node, column: number, row: number): number => {
            drawNode(node, column, row);
            if (node.isFinalState || node.numVisits == 0 || row > 14) {
                // Track maxrow of leaves
                maxRow = Math.max(maxRow, row);
                return 1;
            }
            let totalWidth = 0;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (node.validActions[i]) {
                    let chanceNode = node.children[i];
                    let chanceNodeColumn = column + totalWidth;
                    let msg = "a=" + i + "\n";
                    msg += "pr=" + node.priorPolicy[i].toFixed(2);
                    drawPath(column, row, chanceNodeColumn, row + 1, msg);
                    drawChanceNode(chanceNode, chanceNodeColumn, row + 1);
                    for(let j = 0; j < chanceNode.numPossibilities; j++) {
                        let childNode = chanceNode.childNodes[j];
                        let msg =  "p=" + chanceNode.probabilities[j].toFixed(2) + "\n";
                        msg += "r=" + (chanceNode.immediateRewards[j] == null ? "none" : chanceNode.immediateRewards[j]!.toFixed(2));
                        drawPath(chanceNodeColumn, row + 1, column + totalWidth, row + 2, msg);
                        let childWidth = dfs(childNode, column + totalWidth, row + 2);
                        totalWidth += childWidth;
                    }
                }
            }
            // Either the single node, or the total width of its children
            return Math.max(1, totalWidth);
        }

        // Draw once, to get width/maxRow
        let width = dfs(rootNode, 0, 0);
        // Draw again on the larger canvas
        image = createCanvas(width * NODE_WIDTH, (maxRow + 1) * NODE_WIDTH, 'svg');
        ctx = image.getContext('2d');
        dfs(rootNode, 0, 0);

        // Write the image to a png file
        fs.writeFileSync('out.svg', image.toBuffer());
    }

    print() {
        console.log(this.rootNode.gameState.toString());
        if (this.rootNode.isFinalState) {
            console.log("Terminal State ~ Total Score: %d", this.game.getTotalScore(this.rootNode.gameState));
        } else {
            let str = "";
            str += " => ";
            let priorLen = str.length;
            let first = true;
            for(let j = 0; j < this.game.getNumActions(); j++) {
                if (this.rootNode.validActions[j]) {
                    let childValue = this.rootNode.children[j].avgValue;
                    if (first) {
                        first = false;
                    } else {
                        for(let k = 0; k < priorLen; k++) {
                            str += " ";
                        }
                    }
                    str += "[" + j + " | " + childValue + "]\n";
                }
            }
            console.log(str);
        }
    }
};

export {
    MCTS
};
