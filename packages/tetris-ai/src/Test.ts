import { MCTS } from "./MCTS";
import { NN } from "./NN";
import { FallingStarAbstractGame, FallingStarState } from "./FallingStar";
import promptSync from 'prompt-sync';
import * as tf from '@tensorflow/tfjs-node';

const prompt = promptSync({sigint: true});

class Tester {
    constructor() {
        let fallingStarGame = new FallingStarAbstractGame();
        let fallingStarInitState = fallingStarGame.getInitialState();
        let fallingStarTensor = fallingStarInitState.toTensor();

        let shape = fallingStarTensor.shape;

        let fallingStarNN = new NN(shape[2], shape[1], shape[0], fallingStarGame.getNumActions());

        let fallingStarMCTS = new MCTS(fallingStarGame, fallingStarInitState, fallingStarNN.model, {
            numMCTSSims: 2,
            gamma: 1.0,
        });

        while(!fallingStarMCTS.isGameOver()) {
            fallingStarMCTS.iterate();
            break;
        }

        console.log(fallingStarMCTS.trainingData.length);

        fallingStarMCTS.print();
    }
}

export {
    Tester,
};
