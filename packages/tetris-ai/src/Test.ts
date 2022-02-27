import { MCTS, MCTSArgs, MCTSTrainingData } from "./MCTS";
import { NN, NNTrainingData } from "./NN";
import { AbstractGame, GameInputTensor } from "./AbstractGame";
import { FallingStarAbstractGame, FallingStarState } from "./FallingStarAbstractGame";
import promptSync from 'prompt-sync';

let runGames = async (game: AbstractGame, gamesPerGeneration: number, batchSize: number, maxTurns: number, getNNResults: (inputTensor: GameInputTensor[]) => Promise<number[][][]>, mctsArgs: MCTSArgs): Promise<MCTSTrainingData[][]> => {
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
        let fallingStarInitState = game.getInitialState();
        let fallingStarMCTS = new MCTS(game, fallingStarInitState, mctsArgs);
        simultaneousMCTSs.push({
            mcts: fallingStarMCTS,
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
            // Try to keep a second pending batch on standby, if we can
            if (pendingBatches.length < 2) {
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

setTimeout(async () => {
    const prompt = promptSync({sigint: true});

    let fallingStarGame = new FallingStarAbstractGame();

    // Get the shape of the tensor, and make a NN from it
    let initInputTensor = fallingStarGame.getInitialState().toTensor();
    // Create the neural network
    let fallingStarNN = new NN(initInputTensor, fallingStarGame.getNumActions());
    // Warm the model
    let initOutputTensor = (await fallingStarNN.evaluateBatch([initInputTensor]))[0];

    // ===================
    // Neural Network Parameters
    // ===================

    // Size of NN evaluation batches
    const BATCH_SIZE = 128;

    // ===================
    // Generation parameters
    // ===================

    // Number of generations to train for
    const NUM_GENERATIONS = 5; // 30-60 for Connect4
    // Number of games per generation
    const GAMES_PER_GENERATION = 128; // 8k for Connect4
    // Number of simulations per sample in a game
    const MCTS_SIMULATIONS = 32; // 800 for Chess/Go, 50 for Atari
    // Number of simulations to do in parallel, for each MCTS tree
    const MCTS_BATCH_SIZE = 4;
    // Maximum number of turns before ending the game
    const MAX_MCTS_TURNS = 24;

    // ===================
    // Training parameters
    // ===================

    // Size of the sliding window of game samples, based on the generation
    const slidingWindowSize = (gen: number) => (4 + Math.floor( Math.max(gen - 4, 0)/2 ));
    // Training batch size
    const TRAINING_BATCH_SIZE = 128;
    // Number of epochs to train for
    const NUM_EPOCHS = 2;

    // ===================
    // Evaluation parameters
    // ===================

    // Number of games used to evaluate model quality
    const NUM_EVALUATION_GAMES = 1;
    // Number of simulations per move during match-play
    const EVALUATION_MCTS_SIMULATIONS = 32;
    // Number of evaluations simulations to do in parallel, for each MCTS tree
    const EVALUATION_MCTS_BATCH_SIZE = 16;
    // Maximum number of turns before ending the game
    const EVALUATION_MAX_MCTS_TURNS = 256;

    // Main loop over all generations
    let generationTrainingData = [];
    for(let generation = 0; generation <= NUM_GENERATIONS; generation++) {
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
                results = inputTensor.map(() => initOutputTensor);
            } else {
                results = await fallingStarNN.evaluateBatch(inputTensor, BATCH_SIZE);
            }
            // Print periodic time statistics
            numEvaluations += inputTensor.length;
            if (Math.floor(numEvaluations/15000) > Math.floor(lastNumEvaluationsPrint/15000)) {
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
        let trainingData = await runGames(fallingStarGame, GAMES_PER_GENERATION, BATCH_SIZE, MAX_MCTS_TURNS, getNNResults, {
            numMCTSSims: MCTS_SIMULATIONS,
            numParallelSims: MCTS_BATCH_SIZE,
            gamma: 0.98,
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
            nnTrainingData.push({
                input: trainingDatum.input,
                output: [
                    [trainingDatum.expectedValue * 0.5 + trainingDatum.actualValue * 0.5],
                    trainingDatum.policy,
                ],
            });
        }
        // Add to the list of the generation's training data
        generationTrainingData.push(nnTrainingData);
        while (generationTrainingData.length > slidingWindowSize(generation)) {
            generationTrainingData.splice(0, 1);
        }

        // ===============
        // Train the NN
        // ===============

        // Train the neural network on this data
        startTime = performance.now();
        let currentBatchTrainingData = generationTrainingData.flat();
        console.log("Begin Training on %d inputs", currentBatchTrainingData.length);
        let loss = await fallingStarNN.trainBatch(currentBatchTrainingData, TRAINING_BATCH_SIZE, NUM_EPOCHS);
        let totalSeconds = ((performance.now() - startTime) / 1000);
        console.log("Done Training: %s seconds for %d inputs (%d samples / second)\n", totalSeconds, currentBatchTrainingData.length, currentBatchTrainingData.length * NUM_EPOCHS / totalSeconds);

        // Display loss statistics
        console.log("Value MSE Loss: %d", loss[0].toFixed(5));
        console.log("Policy Cross-Entropy Loss: %d\n", loss[1].toFixed(5));

        // Print how the NN evaluates the initial state
        let generationOutputTensor = (await fallingStarNN.evaluateBatch([initInputTensor]))[0];
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
        let evaluationTrainingData = await runGames(fallingStarGame, NUM_EVALUATION_GAMES, BATCH_SIZE, EVALUATION_MAX_MCTS_TURNS, getNNResults, {
            numMCTSSims: EVALUATION_MCTS_SIMULATIONS,
            numParallelSims: EVALUATION_MCTS_BATCH_SIZE,
            gamma: 0.98,
            // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
            temperature: 0.0,
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
    }

    fallingStarNN.destroy();
}, 0);
