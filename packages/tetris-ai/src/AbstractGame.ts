class GameState {

};

class AbstractGame {
    getInitialState(): GameState {
        return;
    }

    getGameEnded(state: GameState): Boolean {
        return false;
    }

    // Returns 
    getValidMoves(state: GameState): any {
        return;
    }

    getNextState(state: GameState, action: any): number {
        return 0;
    }
};

export {
    GameState,
    AbstractGame
};
