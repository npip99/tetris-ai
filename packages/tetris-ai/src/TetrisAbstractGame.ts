import { GameState, GameTransition, AbstractGame, GameInputTensor } from './AbstractGame';
import { NESTetrisGame, NESTetrisAudioType } from 'tetris-game';

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
// 4 rotations, for each location
const NUM_TETRIS_ACTIONS = /* BOARD_HEIGHT * */ BOARD_WIDTH * 4;

interface TetrisActionType {
    x: number,
    y: number,
    orientation: number,
};

enum TetrisItemType {
    NONE,
    STAR,
    ENEMY,
};

class TetrisState extends GameState {
    nesTetrisGame: NESTetrisGame;
    totalScore: number;

    toTensor(): GameInputTensor {
        let numPieceTypes = this.nesTetrisGame.numPieceTypes;
        let inputTensor: number[][][] = [];
        for(let y = 0; y < BOARD_HEIGHT; y++) {
            inputTensor.push([]);
            for(let x = 0; x < BOARD_WIDTH; x++) {
                inputTensor[y].push(new Array(1 + numPieceTypes + numPieceTypes));

                // Tetris Board channel
                inputTensor[y][x][0] = this.nesTetrisGame.board.getSquareTaken(x, y) ? 1.0 : 0.0;

                // Current-piece channels
                let pieceID = this.nesTetrisGame.current_piece.abstractTetrisPiece.pieceID - 1;
                for(let i = 0; i < numPieceTypes; i++) {
                    inputTensor[y][x][1 + i] = pieceID == i ? 1.0 : 0.0;
                }

                // Next-piece channels
                let nextPieceID = this.nesTetrisGame.next_piece.abstractTetrisPiece.pieceID - 1;
                for(let i = 0; i < numPieceTypes; i++) {
                    inputTensor[y][x][1 + numPieceTypes + i] = nextPieceID == i ? 1.0 : 0.0;
                }
            }
        }
        return inputTensor;
    }

    toString() {
        let ret = "";
        if (this.nesTetrisGame.game_over) {
            ret += "GAME OVER\n";
            ret += "Could not place: " + this.nesTetrisGame.current_piece.abstractTetrisPiece.name + "\n";
        } else {
            ret += "Current Piece: " + this.nesTetrisGame.current_piece.abstractTetrisPiece.name + "\n";
            ret += "Next Piece: " + this.nesTetrisGame.next_piece.abstractTetrisPiece.name + "\n";
        }
        for(let y = 0; y < BOARD_HEIGHT; y++) {
            let rowStr = "[";
            for(let x = 0; x < BOARD_WIDTH; x++) {
                if (this.nesTetrisGame.board.getSquareTaken(x, y)) {
                    rowStr += "*";
                } else {
                    rowStr += " ";
                }
                // TODO: Print out current piece, next piece, game-over status
            }
            ret += rowStr + "]\n";
        }
        return ret;
    }
};

class TetrisTransition extends GameTransition {
    immediateReward: number | null;
    probability: number;
    gameState: TetrisState;
}

function getTetrisAction(action_number: number): TetrisActionType {
    // Uniquely map each action number, to an x/y/orientation
    return {
        y: Math.floor(Math.floor(action_number / 4) / BOARD_WIDTH),
        x: Math.floor(action_number / 4) % BOARD_WIDTH,
        orientation: action_number % 4,
    };
}

function getTetrisActionNumber(x: number, y: number, orientation: number): number {
    let action_number = 0;
    if (y != 0) {
        throw "Can't tuck yet";
    }
    action_number += y * BOARD_WIDTH * 4;
    action_number += x * 4;
    action_number += orientation;
    return action_number;
}

class TetrisAbstractGame extends AbstractGame {
    getInitialState(): TetrisState {
        let ret = new TetrisState();
        ret.nesTetrisGame = new NESTetrisGame(0, false);
        ret.totalScore = 0;
        return ret;
    }

    duplicateState(state: TetrisState): TetrisState {
        let ret = new TetrisState();
        ret.nesTetrisGame = state.nesTetrisGame.clone();
        ret.totalScore = state.totalScore;
        return ret;
    }

    getGameEnded(state: TetrisState): Boolean {
        return state.nesTetrisGame.game_over;
    }

    getTotalScore(state: TetrisState): number {
        return state.totalScore;
    }

    getNumActions(): number {
        return NUM_TETRIS_ACTIONS;
    }

    getValidActions(state: TetrisState): Boolean[] {
        if (this.getGameEnded(state)) {
            throw new Error("Game is over!");
        }

        let validMoves: Boolean[] = new Array(this.getNumActions());
        for(let i = 0; i < this.getNumActions(); i++) {
            validMoves[i] = false;
        }
        for(let x = 0; x < BOARD_WIDTH; x++) {
            validMoves[getTetrisActionNumber(x, 0, 0)] = true;
            validMoves[getTetrisActionNumber(x, 0, 1)] = true;
            validMoves[getTetrisActionNumber(x, 0, 2)] = true;
            validMoves[getTetrisActionNumber(x, 0, 3)] = true;
        }

        return validMoves;
    }

    getNextStates(state: TetrisState, actionNumber: number): TetrisTransition[] {
        if (!this.getValidActions(state)[actionNumber]) {
            throw new Error("Invalid action: " + actionNumber);
        }
        if (this.getGameEnded(state)) {
            throw new Error("Game is over!");
        }

        // Duplicate the state
        let originalLineCount = state.nesTetrisGame.totalLinesCleared;
        let newState = this.duplicateState(state);

        // Get the chosen action
        let tetrisAction = getTetrisAction(actionNumber);

        // Rotate the piece
        for(let i = 0; i < tetrisAction.orientation; i++) {
            // Rotate CW the correct number of times
            if (tetrisAction.orientation == 3) {
                // Quickskip for CCW
                if (!newState.nesTetrisGame.hardCCW()) {
                    newState.nesTetrisGame.game_over = true;
                }
                break;
            }
            if (!newState.nesTetrisGame.hardCW()) {
                newState.nesTetrisGame.game_over = true;
            }
        }

        // Move the piece into place at 30Hz
        let tetrisPieceSpawnLocation = 5;
        if (tetrisAction.x != tetrisPieceSpawnLocation) {
            if (!newState.nesTetrisGame.board.tryMovePiece(newState.nesTetrisGame.current_piece, tetrisAction.x - tetrisPieceSpawnLocation, 0)) {
                newState.nesTetrisGame.game_over = true;
            }
        }

        // Now hard-drop
        let distribution = newState.nesTetrisGame.hardDrop();

        // If it's over, it's over
        if (newState.nesTetrisGame.game_over) {
            return [{
                immediateReward: 0,
                probability: 1.0,
                gameState: newState,
            }];
        }

        let newLineCount = newState.nesTetrisGame.totalLinesCleared;
        let linesCleared = newLineCount - originalLineCount;
        // immediateReward based on tetris rate
        let immediateReward = linesCleared > 0 ? Math.min(linesCleared / 4, 1.0) : null;

        // Generate the possible transitions, based on each piece type randomly selected
        let possibleTransitions: TetrisTransition[] = [];
        for(let i = 0; i < newState.nesTetrisGame.numPieceTypes; i++) {
            let particularGameState = this.duplicateState(newState);
            particularGameState.nesTetrisGame.spawnParticularPiece(i);
            possibleTransitions.push({
                immediateReward: immediateReward,
                probability: distribution[i],
                gameState: particularGameState,
            });
        }

        return possibleTransitions;
    }
};

export {
    TetrisState,
    TetrisAbstractGame,
};
