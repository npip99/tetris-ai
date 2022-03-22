import { MCTS, MCTSArgs, MCTSTrainingData } from "./MCTS";
import { NN, NNTrainingData } from "./NN";
import { AbstractGame, GameInputTensor } from "./AbstractGame";
import { TetrisAbstractGame, TetrisState } from "./TetrisAbstractGame";
import promptSync from 'prompt-sync';
import clone from 'clone';

interface TrainingParameters {
    // ===================
    // Neural Network Parameters
    // ===================

    // Size of each batch when making efficient NN evaluations
    nnBatchSize: number,
    // Number of filters in each convolution
    nnNumFilters: number,
    // Number of residual blocks deep to make the NN
    nnNumResidualBlocks: number,
    // Batch size when training the NN
    nnTrainingBatchSize: number,

    // ===================
    // Generation parameters
    // ===================

    // Number of generations to train for
    numGenerations: number,
    // Number of games per generation
    gamesPerGeneration: number,
    // Maximum number of turns before ending the game
    maxTurns: number,
    // Number of simulations per move in a game
    // Affects the quality of each root node / training sample
    mctsSims: number, // 800 for Chess/Go, 50 for Atari

    // Number of simulations to do in parallel, for each MCTS tree
    // Increases MCTS breadth slightly, and allows final games to saturate their batches
    // Reduces maximum RAM usage, from fewer active MCTS's
    mctsParallelSims: number,
    // Number of NN batches to keep on standby
    // Increases maximum RAM usage, from more active MCTS's
    mctsNumStandbyBatches: number,

    // ===================
    // Training parameters
    // ===================

    // Size of the sliding window of game samples, based on the generation
    slidingWindowSize: (_: number) => number,
    // Number of epochs when training the NN
    nnNumEpochs: number,

    // ===================
    // Evaluation parameters
    // ===================

    // Number of games used to evaluate model quality
    evaluationNumGames: number,
    // Number of simulations per move during match-play
    evaluationMCTSSims: number,
    // Maximum number of turns before ending the game
    evaluationMaxTurns: number,

    // Number of evaluations simulations to do in parallel, for each MCTS tree
    evaluationMCTSParallelSims: number,
};

let defaultTrainingParameters: TrainingParameters = {
    nnBatchSize: 128,
    nnNumFilters: 64,
    nnNumResidualBlocks: 10,
    nnTrainingBatchSize: 64,

    numGenerations: 5,
    gamesPerGeneration: 128,
    maxTurns: 24,
    mctsSims: 32,
    mctsParallelSims: 4,
    mctsNumStandbyBatches: 1,

    slidingWindowSize: (gen: number) => (4 + Math.floor( Math.max(gen - 4, 0)/2 )),
    nnNumEpochs: 2,

    evaluationNumGames: 1,
    evaluationMCTSSims: 32,
    evaluationMaxTurns: 256,

    evaluationMCTSParallelSims: 16,
};

let realTrainingParameters: TrainingParameters = {
    nnBatchSize: 512,
    nnNumFilters: 128,
    nnNumResidualBlocks: 20,
    nnTrainingBatchSize: 128,

    numGenerations: 30,
    gamesPerGeneration: 512,
    maxTurns: 64,
    mctsSims: 256,
    mctsParallelSims: 4,
    mctsNumStandbyBatches: 2,

    slidingWindowSize: (gen: number) => (4 + Math.floor( Math.max(gen - 4, 0)/2 )),
    nnNumEpochs: 2,

    evaluationNumGames: 32,
    evaluationMCTSSims: 128,
    evaluationMaxTurns: 128,

    evaluationMCTSParallelSims: 4,
};

let runGames = async (game: AbstractGame, gamesPerGeneration: number, batchSize: number, mctsNumStandbyBatches: number, maxTurns: number, getNNResults: (inputTensor: GameInputTensor[]) => Promise<number[][][]>, mctsArgs: MCTSArgs): Promise<MCTSTrainingData[][]> => {
    let trainingData: MCTSTrainingData[][] = [];

    // Info on each running MCTS
    interface MCTSInfo {
        mcts: MCTS;
        pendingInputs: GameInputTensor[];
        receivedOutputs: (number[][])[],
        totalStepsMade: number,
        finishedPlaying: Boolean,
    }

    // Create all the simultaneous MCTS's
    let simultaneousMCTSs: MCTSInfo[] = [];
    for(let i = 0; i < gamesPerGeneration; i++) {
        let initialState = game.getInitialState();
        let mcts = new MCTS(game, initialState, mctsArgs);
        simultaneousMCTSs.push({
            mcts: mcts,
            pendingInputs: [],
            receivedOutputs: [],
            totalStepsMade: 0,
            finishedPlaying: false,
        });
    }

    // Evaluation Info
    interface PendingBatch {
        allInputs: GameInputTensor[],
        pendingMCTSs: MCTSInfo[],
    };
    // Promises for the pending batches
    let pendingBatches: Promise<void>[] = [];

    let currentlyConstructingBatch: PendingBatch = {
        allInputs: [],
        pendingMCTSs: [],
    };

    let dispatchMCTS = (mctsInfo: MCTSInfo) => {
        currentlyConstructingBatch.allInputs.push(...mctsInfo.pendingInputs);
        currentlyConstructingBatch.pendingMCTSs.push(mctsInfo);
    };

    let evaluateCurrentlyConstructingBatch = async () => {
        let batchToEvaluate = currentlyConstructingBatch;

        // Only evaluate at most the first batchSize inputs
        let numEvals = Math.min(batchToEvaluate.allInputs.length, batchSize);
        let desiredEvals = batchToEvaluate.allInputs.slice(0, numEvals);

        // Updated currentlyConstructingBatch, to contained MCTS's that we aren't evaluating right now
        let pendingMCTSs = batchToEvaluate.pendingMCTSs;
        let cumulativeEvals = 0;
        for(let i = 0; true; i++) {
            cumulativeEvals += pendingMCTSs[i].pendingInputs.length;
            if (cumulativeEvals >= numEvals) {
                // Leave unused values in the currently constructing batch
                let remainingMCTSs = pendingMCTSs.splice(i + 1, pendingMCTSs.length - 1 - i);
                currentlyConstructingBatch = {
                    allInputs: batchToEvaluate.allInputs.slice(cumulativeEvals, batchToEvaluate.allInputs.length),
                    pendingMCTSs: remainingMCTSs,
                };
                break;
            }
        }

        // Evaluate the NN
        let nnResults = await getNNResults(desiredEvals);

        // Pass the evaluations to the MCTS's
        let nnResultsIndex = 0;
        for(let i = 0; i < pendingMCTSs.length; i++) {
            let pendingMCTS = pendingMCTSs[i];
            let evaluatedOutputs = nnResults.slice(nnResultsIndex, nnResultsIndex + Math.min(pendingMCTS.pendingInputs.length, numEvals - nnResultsIndex));
            pendingMCTS.pendingInputs.splice(0, evaluatedOutputs.length);
            pendingMCTS.receivedOutputs.push(...evaluatedOutputs);
            if (pendingMCTS.pendingInputs.length == 0) {
                // Commit the result, if the MCTS is done pending
                pendingMCTS.mcts.commitNNResults(pendingMCTS.receivedOutputs);
                pendingMCTS.receivedOutputs = [];
            } else {
                // Otherwise, push it back to the currently constructing batch
                dispatchMCTS(pendingMCTS);
            }
        }

        // We're done now
        return;
    };

    // Loop until GAMES_PER_GENERATION games have been played
    let numGamesPlayed = 0;
    while(numGamesPlayed < gamesPerGeneration) {
        // Accumulate pending evaluations, until currentlyConstructingBatch is full
        for(let i = 0; i < simultaneousMCTSs.length && currentlyConstructingBatch.allInputs.length < batchSize; i++) {
            let mctsInfo = simultaneousMCTSs[i];
            // Ignore finished MCTS's, or pending MCTS's
            if (mctsInfo.finishedPlaying || mctsInfo.pendingInputs.length > 0) {
                continue;
            }

            // Gather any inputs the mcts wants evaluated
            let desiredEvals: GameInputTensor[] = [];
            while (desiredEvals.length == 0 && !mctsInfo.mcts.isGameOver() && mctsInfo.totalStepsMade < maxTurns) {
                desiredEvals = mctsInfo.mcts.iterate();
                // If the mcts doesn't want any further evaluations, sample a move
                if (desiredEvals.length == 0) {
                    mctsInfo.mcts.sampleMove();
                    mctsInfo.totalStepsMade++;
                }
            }

            // If the MCTS doesn't want any more evaluations, it's finished
            if (desiredEvals.length == 0) {
                trainingData.push(mctsInfo.mcts.getTrainingData());
                numGamesPlayed++;
                mctsInfo.finishedPlaying = true;
                continue;
            }

            // Mark the pending inputs
            mctsInfo.pendingInputs = desiredEvals;
            // Dispatch onto the currentlyConstructingBatch
            dispatchMCTS(mctsInfo);
        }

        // If there's nothing left pending, exit
        if (currentlyConstructingBatch.allInputs.length == 0 && pendingBatches.length == 0) {
            break;
        }

        // Evaluate the batch asynchronously, if either the batch is full, or there's no pending batches
        if (currentlyConstructingBatch.allInputs.length > 0
            && (currentlyConstructingBatch.allInputs.length >= batchSize || pendingBatches.length == 0)) {
            pendingBatches.push(evaluateCurrentlyConstructingBatch());
            // Try to keep a few pending batches on standby, if we can
            if (pendingBatches.length < 1 + mctsNumStandbyBatches) {
                continue;
            }
        }

        // Wait for a batch to finish before continuing
        let resultIndex = await Promise.race(pendingBatches.map(async (promise, i) => {
            await promise;
            return i;
        }));
        // Remove the completed batch
        pendingBatches.splice(resultIndex, 1);
    }

    return trainingData;
}

let playGame = async (game: AbstractGame, maxTurns: number, getNNResults: (inputTensor: GameInputTensor[]) => Promise<number[][][]>, mctsArgs: MCTSArgs): Promise<void> => {
    let initialState = game.getInitialState();
    let mcts = new MCTS(game, initialState, mctsArgs);
    let totalStepsMade = 0;

    console.log("Initial State\n%s\n", initialState.toString());

    while(true) {
        // Gather any inputs the mcts wants evaluated
        let desiredEvals: GameInputTensor[] = [];
        while (desiredEvals.length == 0 && !mcts.isGameOver() && totalStepsMade < maxTurns) {
            desiredEvals = mcts.iterate();
            // If the mcts doesn't want any further evaluations, sample a move
            if (desiredEvals.length == 0) {
                let Ns = [];
                let validActions = game.getValidActions(mcts.rootNode.gameState);
                for(let i = 0; i < game.getNumActions(); i++) {
                    if (validActions[i]) {
                        Ns[i] = mcts.rootNode.children[i].numVisits / (mcts.rootNode.numVisits - 1);
                    }
                }
                console.log("\nNumSims: %d", mcts.rootNode.numVisits);
                console.log("Value: %d\n", mcts.rootNode.avgValue);
                for(let orientation = 0; orientation < 4; orientation++) {
                    let priorRow = "";
                    for(let x = 0; x < 10; x++) {
                        priorRow += " " + mcts.rootNode.priorPolicy[x * 4 + orientation].toFixed(3);
                    }
                    let row = "";
                    for(let x = 0; x < 10; x++) {
                        row += " " + Ns[x * 4 + orientation].toFixed(3);
                    }
                    console.log("Orientation %d [Prior]: %s", orientation, priorRow);
                    console.log("Orientation %d  [MCTS]: %s\n", orientation, row);
                }
                let chosenMove = mcts.sampleMove();
                totalStepsMade++;
                console.log("Move %d: Chose x=%d, orientation=%d\n", totalStepsMade, Math.floor(chosenMove / 4), chosenMove % 4);
                console.log("%s\n", mcts.rootNode.gameState.toString());
            }
        }

        // If the MCTS doesn't want any more evaluations, it's finished
        if (desiredEvals.length == 0) {
            break;
        }

        // Evaluate and commit
        let nnResults = await getNNResults(desiredEvals);
        mcts.commitNNResults(nnResults);
    }

    console.log("Done playing game\n");
}

function toHumanReadableStr(num: number, precision: number) {
    let isThousand = false;
    if (num > 1000) {
        num /= 1000;
        isThousand = true;
    }
    let isMillion = false;
    if (num > 1000) {
        num /= 1000;
        isMillion = true;
    }
    let numStr = num.toPrecision(precision);
    if (isMillion) {
        numStr += " Million";
    } else if (isThousand) {
        numStr += " Thousand";
    }
    return numStr;
}

setTimeout(async () => {
    const prompt = promptSync({sigint: true});

    let abstractGame = new TetrisAbstractGame();
    let trainingParameters = defaultTrainingParameters;

    // Get the shape of the tensor, and make a NN from it
    let initInputTensor = abstractGame.getInitialState().toTensor();
    // Create the neural network
    let gameNN = new NN(initInputTensor, abstractGame.getNumActions(), {
        numFilters: trainingParameters.nnNumFilters,
        numResidualBlocks: trainingParameters.nnNumResidualBlocks,
    });
    // Warm the model
    let initOutputTensor = (await gameNN.evaluateBatch([initInputTensor]))[0];
    // The tensor to use for Generation 0
    let gen0Tensor = clone(initOutputTensor);
    gen0Tensor[0][0] = 0.01;
    for(let i = 0; i < gen0Tensor[1].length; i++) {
        gen0Tensor[1][i] = 1 / gen0Tensor[1].length;
    }

    // Log training information
    console.log("=============\n=============\n");
    console.log("Training NN on %d outputs", gen0Tensor[0].length + gen0Tensor[1].length);
    // Total number of simulations is Games per generation * Max turns per game * Simulations per turn
    let maxNumSims = trainingParameters.gamesPerGeneration * trainingParameters.maxTurns * trainingParameters.mctsSims;
    // Each move is a training sample
    let maxTrainingSamples = trainingParameters.gamesPerGeneration * trainingParameters.maxTurns;
    console.log("Maximum of %s evaluations per generation", toHumanReadableStr(maxNumSims, 2));
    console.log("Maximum of %s training samples per generation", toHumanReadableStr(maxTrainingSamples, 2));
    console.log("");

    // Main loop over all generations
    let generationTrainingData = [];
    let generationTrainingDataLengths = [];
    for(let generation = 0; generation <= trainingParameters.numGenerations; generation++) {
        // Tracking periodic time statistics
        let startTime = performance.now();
        let numEvaluations = 0;
        let lastNumEvaluationsPrint = 0;

        // Get NN Results, as a batch
        let getNNResults = async (inputTensor: GameInputTensor[]): Promise<(number[][])[]> => {
            // Await on the calculation to finish
            let results: (number[][])[];
            if (generation == 0) {
                // On the 0th evaluation, all outputs will be approximately the same anyway
                results = inputTensor.map(() => gen0Tensor);
            } else {
                results = await gameNN.evaluateBatch(inputTensor, trainingParameters.nnBatchSize);
            }
            // Print periodic time statistics
            numEvaluations += inputTensor.length;
            if (Math.floor(numEvaluations/1000) > Math.floor(lastNumEvaluationsPrint/1000)) {
                console.log("%d Evaluations (%dms per eval)", numEvaluations, ((performance.now() - startTime) / numEvaluations).toPrecision(3));
                lastNumEvaluationsPrint = numEvaluations;
            }
            // Return the results
            return results;
        };

        // ===============
        // Play Games for training data
        // ===============

        console.log("=============\n=============\n");
        console.log("Beginning Generation %d\n", generation);

        // Accumulate the training data
        let trainingData = await runGames(abstractGame, trainingParameters.gamesPerGeneration, trainingParameters.nnBatchSize, trainingParameters.mctsNumStandbyBatches, trainingParameters.evaluationMaxTurns, getNNResults, {
            numMCTSSims: trainingParameters.mctsSims,
            numParallelSims: trainingParameters.mctsParallelSims,
            gamma: 0.9,
            // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
            temperature: 1.0,
            // 1.25 for training, 2.5 for match play
            cPuctInit: 1.25,
            cPuctBase: 18000,
            noise: true,
        });

        // Log time for this generation
        let totalTime = (performance.now() - startTime);
        console.log("Avg Evaluation Time: %dms (%d Evaluations)\n", (totalTime/numEvaluations).toPrecision(3), numEvaluations);
        console.log("-------\n");

        // Construct the NN training data from this generation
        let nnTrainingData: NNTrainingData[] = [];
        for(let trainingDatum of trainingData.flat()) {
            let actualRatio = Math.max(1.0 - 0.1 * generation, 0.5);
            nnTrainingData.push({
                input: trainingDatum.input,
                output: [
                    [trainingDatum.actualValue * actualRatio + trainingDatum.expectedValue * (1.0 - actualRatio)],
                    trainingDatum.policy,
                ],
            });
        }
        // Add to the list of the generation's training data
        generationTrainingData.push(...nnTrainingData);
        generationTrainingDataLengths.push(nnTrainingData.length);
        // Check if we have too many generations' worth of training data
        while (generationTrainingDataLengths.length > trainingParameters.slidingWindowSize(generation)) {
            // Remove the oldest generations' training data
            generationTrainingData.splice(0, generationTrainingDataLengths[0]);
            generationTrainingDataLengths.splice(0, 1);
        }

        // ===============
        // Train the NN
        // ===============

        // Train the neural network on this data
        startTime = performance.now();
        console.log("Begin Training on %d inputs", generationTrainingData.length);
        let loss = await gameNN.trainBatch(generationTrainingData, trainingParameters.nnTrainingBatchSize, trainingParameters.nnNumEpochs);
        let totalSeconds = ((performance.now() - startTime) / 1000);
        console.log("Done Training: %s seconds for %d inputs (%d samples / second)\n", totalSeconds, generationTrainingData.length, generationTrainingData.length * trainingParameters.nnNumEpochs / totalSeconds);

        // Display loss statistics
        console.log("Value MSE Loss: %d", loss[0].toFixed(5));
        console.log("Policy Cross-Entropy Loss: %d\n", loss[1].toFixed(5));

        // Print how the NN evaluates the initial state
        let generationOutputTensor = (await gameNN.evaluateBatch([initInputTensor]))[0];
        console.log("Output from initial state: ", generationOutputTensor, "\n");
        console.log("-------\n");

        // ===============
        // Evaluate the NN
        // ===============

        console.log("Begin Evaluating the new NN\n");

        // Reset evaluation statistics
        startTime = performance.now();
        numEvaluations = 0;
        lastNumEvaluationsPrint = 0;

        // Run evaluation games
        let evaluationTrainingData = await runGames(abstractGame, trainingParameters.evaluationNumGames, trainingParameters.nnBatchSize, trainingParameters.mctsNumStandbyBatches, trainingParameters.evaluationMaxTurns, getNNResults, {
            numMCTSSims: trainingParameters.evaluationMCTSSims,
            numParallelSims: trainingParameters.evaluationMCTSParallelSims,
            gamma: 0.9,
            // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
            temperature: 0.05,
            // 1.25 for training, 2.5 for match play
            cPuctInit: 2.5,
            cPuctBase: 18000,
        });
        console.log("Avg Evaluation Time: %dms (%d Evaluations)\n", (totalTime/numEvaluations).toPrecision(3), numEvaluations);

        // Print the evaluation score of the NN
        let scores = evaluationTrainingData.map(trainingData => trainingData[0].actualValue);
        let averageScore = scores.reduce((acc, c) => acc + c, 0) / scores.length;
        let ScoreStandardDeviation = Math.sqrt(scores.reduce((acc, c) => acc + Math.pow(c - averageScore, 2), 0) / scores.length);
        console.log("Average Score: %d (+/- %d)", averageScore.toFixed(3), ScoreStandardDeviation.toFixed(2));

        // Compare Q-Value with the score
        let Q = evaluationTrainingData.map(trainingData => trainingData[0].expectedValue);
        let averageQ = Q.reduce((acc, c) => acc + c, 0) / Q.length;
        let QStandardDeviation = Math.sqrt(Q.reduce((acc, c) => acc + Math.pow(c - averageQ, 2), 0) / Q.length);
        console.log("Average Q-Value: %d (+/- %d)\n", averageQ.toFixed(3), QStandardDeviation.toFixed(2));

        // ===============
        // Play the NN
        // ===============

        // Play the game, this will output the game as well
        await playGame(abstractGame, trainingParameters.evaluationMaxTurns, getNNResults, {
            numMCTSSims: trainingParameters.evaluationMCTSSims,
            numParallelSims: trainingParameters.evaluationMCTSParallelSims,
            gamma: 0.9,
            // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
            temperature: 0.05,
            // 1.25 for training, 2.5 for match play
            cPuctInit: 2.5,
            cPuctBase: 18000,
        });
    }

    gameNN.destroy();
}, 0);
