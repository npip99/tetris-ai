import { MCTS, MCTSTrainingData } from "./MCTS";
import { NN, NNTrainingData, NNBatcher } from "./NN";
import { GameInputTensor } from "./AbstractGame";
import { FallingStarAbstractGame, FallingStarState } from "./FallingStarAbstractGame";
import promptSync from 'prompt-sync';

setTimeout(async () => {
    const prompt = promptSync({sigint: true});

    let fallingStarGame = new FallingStarAbstractGame();

    // Get the shape of the tensor, and make a NN from it
    let initInputTensor = fallingStarGame.getInitialState().toTensor();
    // Create the neural network
    let fallingStarNN = new NN(initInputTensor, fallingStarGame.getNumActions());
    // Warm the model
    let initOutputBatch = await fallingStarNN.evaluateBatch([initInputTensor]);
    let initOutputTensor = [initOutputBatch[0][0], initOutputBatch[1][0]];

    // Size of NN evaluation batches
    const BATCH_SIZE = 128;
    // Create the NN Batcher
    let nnBatcher = new NNBatcher(fallingStarNN, BATCH_SIZE, 5.0);

    // Generation parameters

    // Number of generations to train for
    const NUM_GENERATIONS = 5; // 30-60 for Connect4
    // Number of games per generation
    const GAMES_PER_GENERATION = 64; // 8k for Connect4
    // Number of simulations per sample in a game
    const MCTS_SIMULATIONS = 32; // 800 for Chess/Go, 50 for Atari
    // Maximum number of turns before ending the game
    const MAX_MCTS_TURNS = 16;

    // Training parameters

    // Size of the sliding window of game samples, based on the generation
    const slidingWindowSize = (gen: number) => (4 + Math.floor( Math.max(gen - 4, 0)/2 ));
    // Training batch size
    const TRAINING_BATCH_SIZE = 128;
    // Number of epochs to train for
    const NUM_EPOCHS = 2;

    // Main loop over all generations
    let generationTrainingData = [];
    for(let generation = 0; generation <= NUM_GENERATIONS; generation++) {
        console.log("=============\n");
        console.log("Beginning Generation %d\n", generation);

        // Number of simulations to do in parallel, for each MCTS tree
        const MCTS_BATCH_SIZE = 4;

        let numEvaluations = 0;
        let getNNResult = async (inputTensor: GameInputTensor): Promise<number[][]> => {
            // Await on the calculation to finish
            numEvaluations++;
            if (numEvaluations % 15000 == 0) {
                console.log("%d Evaluations (%dms per eval)", numEvaluations, ((performance.now() - startTime) / numEvaluations).toPrecision(3));
            }
            if (generation == 0) {
                // On the 0th evaluation, all outputs will be approximately the same anyway
                return initOutputTensor;
            } else {
                return await nnBatcher.getNNResult(inputTensor);
            }
        };

        let startTime = performance.now();
        let trainingData: MCTSTrainingData[] = [];

        // Loop for all of the games happening simultaneously
        let MCTSPromises: Promise<void>[] = [];
        for(let i = 0; i < GAMES_PER_GENERATION; i++) {
            MCTSPromises.push((async () => {
                let fallingStarInitState = fallingStarGame.getInitialState();

                // Run a MCTS from the initial state
                let fallingStarMCTS = new MCTS(fallingStarGame, fallingStarInitState, getNNResult, {
                    numMCTSSims: MCTS_SIMULATIONS,
                    numParallelSims: MCTS_BATCH_SIZE,
                    gamma: 0.98,
                    // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
                    temperature: 1.0,
                });

                // Run several steps of the simulation
                for(let step = 0; step < MAX_MCTS_TURNS && !fallingStarMCTS.isGameOver(); step++) {
                    fallingStarMCTS.rootNode.numVisits;
                    await fallingStarMCTS.iterate();
                    fallingStarMCTS.sampleMove();
                }

                // Accumulate the training data
                trainingData = trainingData.concat(fallingStarMCTS.getTrainingData());
            })());
        }

        // Wait for them all to finish
        await Promise.all(MCTSPromises);

        // Log time for this generation
        let totalTime = (performance.now() - startTime);
        console.log("Avg Evaluation Time: %dms (%d Evaluations)\n", (totalTime/numEvaluations).toPrecision(3), numEvaluations);
        console.log("-------\n");

        // Construct the NN training data from this generation
        let nnTrainingData: NNTrainingData[] = [];
        for(let trainingDatum of trainingData) {
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
    }

    fallingStarNN.destroy();
}, 0);
