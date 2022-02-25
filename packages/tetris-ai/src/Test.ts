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
    const BATCH_SIZE = 256;
    const NUM_SIMULTANEOUS_MCTS = 64;
    const MCTS_BATCH_SIZE = 4;

    let nnBatcher = new NNBatcher(await fallingStarNN.getNNModel(), BATCH_SIZE, 1.0);

    let startTime = performance.now();

    let numEvaluations = 0;
    let getNNResult = (inputTensor: tf.Tensor3D): number[][] => {
        numEvaluations++;
        if (numEvaluations % 5000 == 0) {
            console.log("Avg Eval %dms (%d Evaluations)", (performance.now() - startTime) / numEvaluations, numEvaluations);
        }
        // Await on the calculation to finish
        const USING_NN = false;
        if (USING_NN) {
            //let result = await nnBatcher.getNNResult(inputTensor);
            return [];
        } else {
            return [
                [1/2],
                [1/3, 1/3, 1/3],
            ];
        }
    };

    let simultaneousMCTSs: MCTS[] = [];
    for(let i = 0; i < NUM_SIMULTANEOUS_MCTS; i++) {
        let fallingStarInitState = fallingStarGame.getInitialState();
        simultaneousMCTSs.push(new MCTS(fallingStarGame, fallingStarInitState, {
            numMCTSSims: 100,
            numParallelSims: MCTS_BATCH_SIZE,
            gamma: 0.99,
            // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
            temperature: 1.0,
        }));
    }

    while(simultaneousMCTSs.filter(mcts => mcts != null).length > 0) {
        for(let i = 0; i < simultaneousMCTSs.length; i++) {
            let mcts = simultaneousMCTSs[i];
            if (mcts == null) {
                continue;
            }

            // Get the tensors that the MCTS wants
            let desiredTensors = mcts.iterate();
            // If the MCTS isn't desiring any more simulations, it's time to sample a move first
            if (desiredTensors.length == 0) {
                mcts.sampleMove();
                // If the game is over now,
                // null it from the list and continue
                if (mcts.isGameOver()) {
                    simultaneousMCTSs[i] = null;
                    continue;
                }
                desiredTensors = mcts.iterate();
            }

            // Get the NN results
            let resultTensors = [];
            for(let i = 0; i < desiredTensors.length; i++) {
                resultTensors.push(getNNResult(desiredTensors[i]));
            }

            // Commit them to the MCTS
            mcts.commitNNResults(resultTensors);

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
        }
    }

    let totalTime = (performance.now() - startTime);
    console.log("Avg Evaluation Time: %dms (%d Evaluations)", (totalTime/numEvaluations).toPrecision(3), numEvaluations);
}, 0);
