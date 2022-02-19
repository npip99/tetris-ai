import * as tf from '@tensorflow/tfjs-node';

class GameState {
    toTensor(): tf.Tensor3D {
        return tf.tensor3d([]);
    }

    toString(): string {
        return "";
    }
};

class GameTransition {
    immediateReward: number;
    probability: number;
    gameState: GameState;
}

class AbstractGame {
    getInitialState(): GameState {
        return null;
    }

    duplicateState(state: GameState): GameState {
        return null;
    }

    getGameEnded(state: GameState): Boolean {
        return false;
    }

    getTotalScore(state: GameState): number {
        return 0;
    }

    // Get the number of possible actions
    getNumActions(): number {
        return 0;   
    }

    // Returns a 1-hot encoding of valid moves
    getValidActions(state: GameState): Boolean[] {
        return [];
    }

    // Progresses the game state, returning all possible
    // GameTransitions, and their normalized probabilities of occuring
    getNextStates(state: GameState, actionNumber: number): GameTransition[] {
        return [];
    }
};

export {
    GameState,
    GameTransition,
    AbstractGame
};
