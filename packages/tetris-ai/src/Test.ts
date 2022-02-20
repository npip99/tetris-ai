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
            numMCTSSims: 10000,
            gamma: 0.97,
        });

        while(!fallingStarMCTS.isGameOver()) {
            fallingStarMCTS.iterate();
            let rootNode = fallingStarMCTS.rootNode;
            console.log((rootNode.gameState as any).frame);
            fallingStarMCTS.print();
            fallingStarMCTS.sampleMove();
            if (fallingStarMCTS.isGameOver()) {
                //fallingStarMCTS.drawTree(rootNode);
            }
        }
        fallingStarMCTS.print();

        console.log(fallingStarMCTS.trainingData.length);
    }
}

export {
    Tester,
};
