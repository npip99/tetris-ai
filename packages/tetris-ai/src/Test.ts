import { MCTS } from "./MCTS";
import { NN, NNBatcher } from "./NN";
import { FallingStarAbstractGame, FallingStarState } from "./FallingStarAbstractGame";
import promptSync from 'prompt-sync';
import * as tf from '@tensorflow/tfjs-node-gpu';

setTimeout(async () => {
    const prompt = promptSync({sigint: true});

    let fallingStarGame = new FallingStarAbstractGame();

    // Get the shape of the tensor, and make a NN from it
    let shape = fallingStarGame.getInitialState().toTensor().shape;
    let fallingStarNN = new NN(shape[2], shape[1], shape[0], fallingStarGame.getNumActions());

    // Get batched NN results
    const NUM_SIMULTANEOUS_MCTS = 64;
    const BATCH_SIZE = 64;

    let nnBatcher = new NNBatcher(await fallingStarNN.getNNModel(), BATCH_SIZE, 1.0);

    let numEvaluations = 0;
    let getNNResult = async (inputTensor: tf.Tensor3D): Promise<number[][]> => {
        // Await on the calculation to finish
        numEvaluations++;
        let result = await nnBatcher.getNNResult(inputTensor);
        return result;
    };

    let startTime = performance.now();

    let MCTSPromises: Promise<void>[] = [];
    for(let i = 0; i < NUM_SIMULTANEOUS_MCTS; i++) {
        MCTSPromises.push((async () => {
            let fallingStarInitState = fallingStarGame.getInitialState();

            // Run a MCTS from the initial state
            let fallingStarMCTS = new MCTS(fallingStarGame, fallingStarInitState, getNNResult, {
                numMCTSSims: 100,
                gamma: 0.99,
                // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
                temperature: 1.0,
            });

            // Run 10 steps of the simulation
            for(let step = 0; step < 3 && !fallingStarMCTS.isGameOver(); step++) {
                await fallingStarMCTS.iterate();
                // console.log("Step: %d", step);
                // fallingStarMCTS.print();
                fallingStarMCTS.sampleMove();
            }
            // console.log("Done!");
            // fallingStarMCTS.print();
            // console.log(fallingStarMCTS.trainingData.length);
            /*for(let trainingDatum of fallingStarMCTS.trainingData) {
                fallingStarNN.getNNModel().evaluate(
                    tf.tensor4d([trainingDatum.input.arraySync()]),
                    [
                        tf.tensor2d([
                            [trainingDatum.value],
                        ]),
                        tf.tensor2d([
                            trainingDatum.policy,
                        ]),
                    ],
                );
            }*/
        })());
    }

    // Wait for them all to finish
    await Promise.all(MCTSPromises);

    let totalTime = (performance.now() - startTime);
    console.log("Avg Evaluation Time: %dms (%d Evaluations)", (totalTime/numEvaluations).toPrecision(3), numEvaluations);
}, 0);
