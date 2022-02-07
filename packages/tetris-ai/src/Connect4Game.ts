import { GameState, AbstractGame } from './AbstractGame';

class Connect4State extends GameState {

};

class Connect4AbstractGame extends AbstractGame {
    getInitialState(): Connect4State {
        return;
    }

    getGameEnded(state: Connect4State): Boolean {
        return false;
    }

    getValidMoves(state: Connect4State): any {
        return;
    }

    getNextState(state: Connect4State, action: any): number {
        return 0;
    }
};
