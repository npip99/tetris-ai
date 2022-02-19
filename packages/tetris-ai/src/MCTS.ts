import { AbstractGame, GameState } from './AbstractGame';
import * as tf from '@tensorflow/tfjs-node';
import * as PImage from 'pureimage';
import * as fs from 'fs';

interface MCTSArgs {
    numMCTSSims: number,
    gamma: number,
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
    // Q = Sum_i (N_i / N) * Q_i
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
    immediateRewards: number[];
    childNodes: Node[];
}

class MCTS {
    game: AbstractGame;
    rootNode: Node;
    decisionPath: Node[];
    nnet: tf.LayersModel;
    args: MCTSArgs;
    trainingData: TrainingData[];

    constructor(game: AbstractGame, rootGameState: GameState, nnet: tf.LayersModel, args: MCTSArgs) {
        this.game = game;
        this.rootNode = new Node(rootGameState, 0.0, this.game.getGameEnded(rootGameState));
        //this.decisionPath = [this.rootNode];
        this.nnet = nnet;
        this.args = args;
        this.trainingData = [];
    }

    simulate(cPuct: number) {
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
                    // Q(s, a)
                    let avgDiscountedReward = childChanceNode.avgValue;
                    // U(s, a)
                    let uFactor = cPuct * currentNode.priorPolicy[i] * Math.sqrt(currentNode.numVisits / (1 + childChanceNode.numVisits));
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

            // Sample from the chance node
            let nextChanceChoice = 0;
            for(let i = 0; i < nextChanceNode.numPossibilities; i++) {
                // If this node hasn't been visited it's proportioned number of times, choose it
                if (nextChanceNode.childNodes[i].numVisits <= nextChanceNode.numVisits * nextChanceNode.probabilities[i]) {
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
            let NNValue;
            let NNPriors;

            const USING_NN = false;
            if (USING_NN) {
                let inputTensor: tf.Tensor3D = currentNode.gameState.toTensor().transpose([1, 2, 0]);
                let batchedInputTensor: tf.Tensor4D = tf.tensor4d([
                    inputTensor.arraySync()
                ]);
                let resultTensor: tf.Tensor2D[] = this.nnet.predict(batchedInputTensor) as tf.Tensor2D[];
                NNValue = resultTensor[0].arraySync()[0][0];
                NNPriors = resultTensor[1].arraySync()[0];
            } else {
                NNValue = 0.5;
                NNPriors = new Array(this.game.getNumActions());
                for(let i = 0; i < this.game.getNumActions(); i++) {
                    NNPriors[i] = 1.0 / this.game.getNumActions();
                }
            }

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
                        let childNodeEV = NNValue * 0.5;
                        let childNodeGameOver = this.game.getGameEnded(nextGameState);
                        if (childNodeGameOver) {
                            childNodeEV = 0.0;
                        }

                        // Create the new child
                        childChanceNode.childNodes[j] = new Node(nextGameState, childNodeEV, childNodeGameOver);

                        // Update avgValue of the chanceNode
                        let expectedValue = childChanceNode.immediateRewards[j] + this.args.gamma * childChanceNode.childNodes[j].avgValue;
                        childChanceNode.avgValue += childChanceNode.probabilities[j] * expectedValue;
                    }

                    // Populate child data on currentNode
                    currentNode.priorPolicy[i] = priorPolicy;
                    currentNode.children[i] = childChanceNode;
                }
            }
        };

        // Mark as visited
        currentNode.numVisits++;
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
                let expectedValue = prevChanceNode.immediateRewards[i] + this.args.gamma * prevChanceNode.childNodes[i].avgValue;
                newChandeNodeQ += prevChanceNode.probabilities[i] * expectedValue;
            }
            // Update that ChanceNode
            prevChanceNode.avgValue = newChandeNodeQ;
            prevChanceNode.numVisits++;
            
            // Node's Q = Sum (N_i / N) * Q_i, over all child ChanceNodes
            let newNodeQ = 0.0;
            let newNodeN = prevNode.numVisits + 1;
            for(let i = 0; i < this.game.getNumActions(); i++) {
                if (prevNode.validActions[i]) {
                    newNodeQ += (prevNode.children[i].numVisits / newNodeN) * prevNode.children[i].avgValue;
                }
            }
            // Update that previous Node
            prevNode.avgValue = newNodeQ;
            prevNode.numVisits++;
        }
    }

    isGameOver() {
        return this.rootNode.isFinalState;
    }

    iterate() {
        const cPuct = 1.25; // Training
        const Temperature = 0.0; // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
        // const cPuct = 2.4; // MatchPlay
        // const Temperature = 0.0; // MatchPlay
        const numSimulations = 200; // 50 for Atari, 800 for Go/Chess/Shogi

        if (this.rootNode.isFinalState) {
            throw new Error("Tried to iterate a completed MCTS!");
        }

        console.log(this.rootNode.gameState.toString());
        console.log("Score: %d", this.game.getTotalScore(this.rootNode.gameState));

        // ==============
        // Adjust PriorPolicy of the Root Node
        // ==============

        // Make sure the rootNode has been visited at least once,
        // So that its childrens' data is initialized
        if (this.rootNode.numVisits == 0) {
            this.simulate(cPuct);
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
        for(let i = 0; i < numSimulations; i++) {
            this.simulate(cPuct);
        }

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

        if (Temperature < 0.01) {
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
                    probabilityDistribution[i] = Math.pow(this.rootNode.children[i].numVisits, 1.0/Temperature);
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

        let str = " => ";
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
                str += "[" + j + " | " + childValue + "]" + (j == chosenAction ? "*" : "") + "\n";
            }
        }
        console.log(str);
        this.drawTree();

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
        this.rootNode = chosenChanceNode.childNodes[chosenSample];
        //this.decisionPath.push(this.rootNode);

        if (this.rootNode.isFinalState) {
            console.log("\nGame Over!");
            console.log(this.rootNode.gameState.toString());
            console.log("Final Score: %d", this.game.getTotalScore(this.rootNode.gameState));
        }
    }

    drawTree() {
        // Generate Layers
        let currentNodes = [this.rootNode];
        let layers: Node[][] = [];
        let chanceLayers: ChanceNode[][] = [];
        let widestLayer = 0;
        while(currentNodes.length > 0) {
            layers.push(currentNodes);
            widestLayer = Math.max(widestLayer, currentNodes.length);
            // Generate ChanceNodes from current Nodes
            let chanceNodes: ChanceNode[] = [];
            for(let i = 0; i < currentNodes.length; i++) {
                // Get the node
                let node = currentNodes[i];
                if (!node.isFinalState && node.numVisits > 0) {
                    // Get the chance nodes from it
                    for(let j = 0; j < this.game.getNumActions(); j++) {
                        if (node.validActions[j]) {
                            chanceNodes.push(node.children[j]);
                        }
                    }
                }
            }
            chanceLayers.push(chanceNodes);
            widestLayer = Math.max(widestLayer, chanceNodes.length);

            // Get num next nodes (So edges can be drawn with position)
            let numNextNodes = 0;
            for(let i = 0; i < chanceNodes.length; i++) {
                numNextNodes += chanceNodes[i].numPossibilities;
            }

            // Generate next Nodes from ChanceNodes
            let nextNodes: Node[] = [];
            for(let i = 0; i < chanceNodes.length; i++) {
                let chanceNode = chanceNodes[i];
                for(let j = 0; j < chanceNode.numPossibilities; j++) {
                    let node = chanceNode.childNodes[j];
                    nextNodes.push(node);
                }
            }

            // Start the next layer with the bottom of the previous layer
            currentNodes = nextNodes;
        }

        // Image
        const image = PImage.make(100 * widestLayer, 100 * layers.length, {});
        const ctx = image.getContext('2d');

        // Statistics
        let numExploredNodesDrawn = 0;
        let numNodesDrawn = 0;
        let numChanceNodesDrawn = 0;

        let drawNode = (node: Node) => {
            numNodesDrawn++;
            if (node.numVisits > 0) {
                numExploredNodesDrawn++;
            }
            ctx.fillStyle = 'red';
            ctx.fillRect(10, 10, 20, 20);
        }

        let drawChanceNode = (chanceNode: ChanceNode) => {
            numChanceNodesDrawn++;
            ctx.fillStyle = 'blue';
            ctx.fillRect(10, 10, 20, 20);
        }

        console.log("%d Layers tall, %d nodes wide", layers.length, widestLayer);
        for(let layer = 0; layer < layers.length; layer++) {
            console.log("Layer: %d (NumNodes: (%d/%d) / NumChanceNodes: %d)", layers.length, numExploredNodesDrawn, numNodesDrawn, numChanceNodesDrawn);
            let nodes = layers[layer];
            let chanceNodes = chanceLayers[layer];
            for(let i = 0; i < nodes.length; i++) {

            }
        }

        // Write the image to a png file
        PImage.encodePNGToStream(image, fs.createWriteStream('out.png')).then(() => {
            console.log("wrote out the png file to out.png");
        }).catch((e)=>{
            console.log("there was an error writing");
        });
    }

    print() {
        return;
        for(let i = 0; i < this.decisionPath.length; i++) {
            let chosenNode = this.decisionPath[i];
            console.log(chosenNode.gameState.toString());
            if (chosenNode.isFinalState) {
                console.log("Terminal State ~ Total Score: %d", this.game.getTotalScore(chosenNode.gameState));
            } else {
                let str = "";
                str += i + " => ";
                let priorLen = str.length;
                let first = true;
                for(let j = 0; j < this.game.getNumActions(); j++) {
                    if (chosenNode.validActions[j]) {
                        let childValue = chosenNode.children[j].avgValue;
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
    }
};

export {
    MCTS
};
