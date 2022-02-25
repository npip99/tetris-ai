import * as tf from '@tensorflow/tfjs-node-gpu';
import { GameState, GameTransition, AbstractGame, GameInputTensor } from './AbstractGame';

const BOARD_WIDTH = 5;
const BOARD_HEIGHT = 10;
const NUM_FALLING_STAR_ACTIONS = 3;

enum FallingStarActionType {
    ACTION_LEFT,
    ACTION_NONE,
    ACTION_RIGHT,
};

enum FallingStarItemType {
    NONE,
    STAR,
    ENEMY,
};

class FallingStarState extends GameState {
    board: FallingStarItemType[][];
    playerLocation: number;
    frame: number;
    currentlyTeleporting: Boolean;
    totalNumRewards: number;
    totalScore: number;
    // y coordinate of what enemy lazered the player
    lazeredFrom: number;
    gameOver: Boolean;

    toTensor(): GameInputTensor {
        let inputTensor: number[][][] = [];
        for(let y = 0; y < BOARD_HEIGHT; y++) {
            inputTensor.push([]);
            for(let x = 0; x < BOARD_WIDTH; x++) {
                inputTensor[y].push([null, null, null, null]);

                // Player location channel
                inputTensor[y][x][0] = y == BOARD_HEIGHT - 1 && x == this.playerLocation ? 1.0 : 0.0;

                // Star location channel
                inputTensor[y][x][1] = this.board[y][x] == FallingStarItemType.STAR ? 1.0 : 0.0;

                // Enemy location channel
                inputTensor[y][x][2] = this.board[y][x] == FallingStarItemType.ENEMY ? 1.0 : 0.0;

                // Teleporting channel
                inputTensor[y][x][3] = this.currentlyTeleporting ? 1.0 : 0.0;
            }
        }
        return inputTensor;
    }

    toString() {
        let ret = "";
        for(let y = 0; y < BOARD_HEIGHT; y++) {
            let rowStr = "[";
            for(let x = 0; x < BOARD_WIDTH; x++) {
                if (this.gameOver && y > this.lazeredFrom && x == this.playerLocation) {
                    rowStr += "*";
                } else if (y == BOARD_HEIGHT - 1 && x == this.playerLocation && !this.gameOver) {
                    rowStr += "P";
                } else {
                    if (this.board[y][x] == FallingStarItemType.STAR) {
                        rowStr += "O";
                    } else if (this.board[y][x] == FallingStarItemType.ENEMY) {
                        rowStr += "X";
                    } else {
                        rowStr += " ";
                    }
                }
            }
            ret += rowStr + "]\n";
        }
        return ret;
    }
};

class FallingStarTransition extends GameTransition {
    immediateReward: number | null;
    probability: number;
    gameState: FallingStarState;
}

function getFallingStarAction(action_number: number): FallingStarActionType {
    if (action_number == 0) {
        return FallingStarActionType.ACTION_LEFT;
    } else if (action_number == 1) {
        return FallingStarActionType.ACTION_NONE;
    } else {
        return FallingStarActionType.ACTION_RIGHT;
    }
}

class FallingStarAbstractGame extends AbstractGame {
    getInitialState(): FallingStarState {
        let ret = new FallingStarState();
        ret.board = [];
        for(let y = 0; y < BOARD_HEIGHT; y++) {
            ret.board.push([]);
            for(let x = 0; x < BOARD_WIDTH; x++) {
                ret.board[y].push(FallingStarItemType.NONE);
            }
        }
        ret.playerLocation = Math.floor(BOARD_WIDTH / 2);
        ret.frame = 0;
        ret.currentlyTeleporting = false;
        ret.totalNumRewards = 0;
        ret.totalScore = 0;
        ret.lazeredFrom = -1;
        ret.gameOver = false;
        return ret;
    }

    duplicateState(state: FallingStarState): FallingStarState {
        let ret = new FallingStarState();
        ret.board = [];
        for(let y = 0; y < BOARD_HEIGHT; y++) {
            ret.board.push([]);
            for(let x = 0; x < BOARD_WIDTH; x++) {
                ret.board[y].push(state.board[y][x]);
            }
        }
        ret.playerLocation = state.playerLocation;
        ret.frame = state.frame;
        ret.currentlyTeleporting = state.currentlyTeleporting;
        ret.totalNumRewards = state.totalNumRewards;
        ret.totalScore = state.totalScore;
        ret.lazeredFrom = state.lazeredFrom;
        ret.gameOver = state.gameOver;
        return ret;
    }

    getGameEnded(state: FallingStarState): Boolean {
        return state.gameOver;
    }

    getTotalScore(state: FallingStarState): number {
        return state.totalScore;
    }

    getNumActions(): number {
        return NUM_FALLING_STAR_ACTIONS;
    }

    getValidActions(state: FallingStarState): Boolean[] {
        if (this.getGameEnded(state)) {
            throw new Error("Game is over!");
        }

        let validMoves = [true, true, true];
        if (state.playerLocation == 0) {
            validMoves[0] = false;
        } else if (state.playerLocation == BOARD_WIDTH - 1) {
            validMoves[2] = false;
        }
        return validMoves;
    }

    getNextStates(state: FallingStarState, actionNumber: number): FallingStarTransition[] {
        if (!this.getValidActions(state)[actionNumber]) {
            throw new Error("Invalid action: " + actionNumber);
        }
        if (this.getGameEnded(state)) {
            throw new Error("Game is over!");
        }

        // Duplicate the state
        let newState = this.duplicateState(state);

        // Progress the frame
        newState.frame++;

        // Move the current player
        let fallingStarAction = getFallingStarAction(actionNumber);
        if (fallingStarAction == FallingStarActionType.ACTION_LEFT) {
            newState.playerLocation--;
        } else if (fallingStarAction == FallingStarActionType.ACTION_RIGHT) {
            newState.playerLocation++;
        }

        // Lower the board down
        for(let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            for(let x = 0; x < BOARD_WIDTH; x++) {
                if (y == 0) {
                    newState.board[y][x] = FallingStarItemType.NONE;
                } else {
                    newState.board[y][x] = newState.board[y-1][x];
                }
            }
        }

        // Check if a score was made, by intersecting a star
        let immediateReward: number | null = null;
        // Mark immediate reward, if it was possible to receive one
        for(let i = 0; i < BOARD_WIDTH; i++) {
            if (newState.board[BOARD_HEIGHT - 1][i] == FallingStarItemType.STAR) {
                immediateReward = 0.0;
            }
        }
        // Mark as 1.0, if the reward was received
        if (newState.board[BOARD_HEIGHT - 1][newState.playerLocation] == FallingStarItemType.STAR) {
            immediateReward = 1.0;
        }

        // Check if the game is over, by intersecting an enemy
        if (newState.board[BOARD_HEIGHT - 1][newState.playerLocation] == FallingStarItemType.ENEMY) {
            newState.lazeredFrom = BOARD_HEIGHT - 1;
            newState.gameOver = true;
        }

        if (immediateReward != null) {
            // newTotalScore = (prevTotalScore * prevNum + reward) / (prevNum + 1)
            // newTotalScore = prevTotalScore * ((prevNum + 1) - 1) / (prevNum + 1) + reward / (prevNum + 1)
            // newTotalScore = prevTotalScore * (1 - 1 / (prevNum + 1)) + reward / (prevNum + 1)
            // newTotalScore = prevTotalScore - prevTotalScore / (prevNum + 1) + reward / (prevNum + 1)
            // newTotalScore = prevTotalScore + (reward - prevTotalScore) / (prevNum + 1)
            newState.totalScore += (immediateReward - newState.totalScore) / (newState.totalNumRewards + 1);
            newState.totalNumRewards++;
        }
        let possibleTransitions: FallingStarTransition[] = [];
        
        // Try spawning a new Star
        if (newState.frame % 5 == 0 && !newState.gameOver) {
            // Spawn a new star, in a deterministic location
            let newStarLocation = ((newState.frame / 5) * 2 + 3) % BOARD_WIDTH;
            newState.board[0][newStarLocation] = FallingStarItemType.STAR;
        }

        // Else, try spawning a new enemy
        else if (newState.frame % 4 == 0 && !newState.gameOver) {
            // Spawn a new enemy, in a deterministic location, not over the player
            let newEnemyLocation = ((newState.frame / 4) * 3 + 2) % BOARD_WIDTH;
            if (newEnemyLocation == newState.playerLocation) {
                newEnemyLocation = (newEnemyLocation + 3) % BOARD_WIDTH;
            }
            newState.board[0][newEnemyLocation] = FallingStarItemType.ENEMY;
        }

        // Consider the gamestate of an enemy lazering the player from above
        let remainingProbability = 1.0;
        for(let y = BOARD_HEIGHT - 2; y >= 1; y--) {
            // Only consider the lowest enemy above the player
            if (newState.board[y][newState.playerLocation] == FallingStarItemType.ENEMY && !newState.gameOver) {
                let probabilityOfDying = y / (BOARD_HEIGHT - 1);
                let badGameState = this.duplicateState(newState);
                badGameState.lazeredFrom = y;
                badGameState.gameOver = true;
                possibleTransitions.push({
                    immediateReward: immediateReward,
                    probability: probabilityOfDying,
                    gameState: badGameState,
                });
                remainingProbability -= probabilityOfDying;
                break;
            }
        }

        // Push the probability that the player doesn't get lazered from above
        possibleTransitions.push({
            immediateReward: immediateReward,
            probability: remainingProbability,
            gameState: newState,
        });

        return possibleTransitions;
    }
};

export {
    FallingStarState,
    FallingStarAbstractGame,
};
