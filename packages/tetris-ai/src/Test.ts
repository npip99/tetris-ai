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
            numMCTSSims: 2000,
            gamma: 0.99,
        });

        while(!fallingStarMCTS.isGameOver()) {
            let rootNode = fallingStarMCTS.rootNode;
            fallingStarMCTS.iterate();
            fallingStarMCTS.print();
            fallingStarMCTS.sampleMove();
            if (fallingStarMCTS.isGameOver()) {
                fallingStarMCTS.drawTree(rootNode);
            }
        }
        fallingStarMCTS.print();

        console.log(fallingStarMCTS.trainingData.length);
    }
}

export {
    Tester,
};
