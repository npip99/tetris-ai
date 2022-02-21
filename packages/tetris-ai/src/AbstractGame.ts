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
    immediateReward: number | null;
    probability: number;
    gameState: GameState;
}

class AbstractGame {
    getInitialState(): GameState {
        throw new Error("Unimplemented!");
    }

    duplicateState(state: GameState): GameState {
        throw new Error("Unimplemented!");
    }

    getGameEnded(state: GameState): Boolean {
        throw new Error("Unimplemented!");
    }

    getTotalScore(state: GameState): number {
        throw new Error("Unimplemented!");
    }

    // Get the number of possible actions
    getNumActions(): number {
        throw new Error("Unimplemented!");
    }

    // Returns a 1-hot encoding of valid moves
    getValidActions(state: GameState): Boolean[] {
        throw new Error("Unimplemented!");
    }

    // Progresses the game state, returning all possible
    // GameTransitions, and their normalized probabilities of occuring
    getNextStates(state: GameState, actionNumber: number): GameTransition[] {
        throw new Error("Unimplemented!");
    }
};

export {
    GameState,
    GameTransition,
    AbstractGame
};
