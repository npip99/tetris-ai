import { TetrisBoard, TetrisPiece, TetrisRotation } from "./TetrisBoard";
import { TETRIS_PIECES } from "./TetrisPiece";
import clone from 'clone';

enum NESTetrisAudioType {
    NONE,
    SHIFT,
    ROTATION,
    LEVEL_UP,
    LOCK_PIECE,
    TETRIS,
    LINECLEAR,
    GAMEOVER_CRASH,
};

const TETRIS_PIECE_SPAWN_LOCATION = {
    y: 0,
    x: 5,
};

function getRandomAbstractPieceDistribution(avoid_piece: number): number[] {
    // First, a number from 0 to 7 inclusive is chosen
    const FIRST_PROBABILITIES = [
        1/8,
        1/8,
        1/8,
        1/8,
        1/8,
        1/8,
        1/8,
        1/8, 
    ];

    // If 7 or avoid_piece, sample a second time from this distribution
    const SECOND_PROBABILITIES = [
        9,
        8,
        8,
        8,
        9,
        7,
        7, 
    ];
    const CUMULATIVE_SECOND_PROBABILITIES = SECOND_PROBABILITIES.reduce((a, b) => a + b, 0);

    let finalProbabilities = new Array(7);
    for(let i = 0; i < 7; i++) {
        // Include the probability of selecting "i" from the first draw
        if (i == avoid_piece) {
            // Can't select the avoid_piece first
            finalProbabilities[i] = 0.0;
        } else {
            finalProbabilities[i] = FIRST_PROBABILITIES[i];
        }
        // Also include the odds of selecting "i" on the second draw
        finalProbabilities[i] += (FIRST_PROBABILITIES[avoid_piece] + FIRST_PROBABILITIES[7]) * SECOND_PROBABILITIES[i] / CUMULATIVE_SECOND_PROBABILITIES;
    }

    return finalProbabilities;
}

function getRandomAbstractPiece(avoid_piece: number) {
    // Get the distribution of selecting the tetris pieces
    let probabilities = getRandomAbstractPieceDistribution(avoid_piece);

    // Get a random num within the total cumulative probability, exclusive on the right
    let randomPieceSample = Math.random();

    // Get the chosen piece and it's cumulative probability
    let chosenPiece = 0;
    let cumulativeProbability = probabilities[0];

    // While randomPieceSample is not yet inside of the cumulative probability,
    // Explicit check chosenPiece + 1 < 7, in-case cumulativeProbability doesn't quite add up to 1.0
    while(!(randomPieceSample < cumulativeProbability) && chosenPiece + 1 < 7) {
        // Include the next chosen piece,
        // to see if randomPieceNum will be within the now larger cumulative probability
        chosenPiece += 1;
        cumulativeProbability += probabilities[chosenPiece];
    }

    // Return the chosen piece
    return TETRIS_PIECES[chosenPiece];
}

enum ButtonState {
    PRESSED,
    NEWLY_PRESSED,
    RELEASED,
};

enum Buttons {
    LEFT,
    RIGHT,
    DOWN,
    ROTATE_CCW,
    ROTATE_CW,
};

class NESTetrisGame {
    // The Tetris State
    board: TetrisBoard;
    current_piece: TetrisPiece;
    next_piece: TetrisPiece;
    width: number = 10;
    height: number = 20;
    // Game State
    game_over: Boolean;
    initial_level: number;
    level: number;
    score: number;
    // Temporary Game State
    failedToDrop: Boolean;
    lastClearedLines: number;
    // Logic for ARE and precise rendering
    AREState: number; // The AREState that we're in
    is_animating: Boolean;
    frameCounter: number;
    pendingAudio: NESTetrisAudioType;
    AREAuxData: any; // An auxillary counter for tracking progression
    vram: number[][];
    vramRow: number;
    gameboardFlashing: Boolean;
    // DAS
    dasHorizontal: number;
    dasVertical: number;
    pushdownPoints: number;
    fallTimer: number;
    
    // Statistics
    totalLinesCleared: number;
    pieceCount: number[];

    // ButtonState
    buttonState: Record<Buttons, ButtonState>;
    previousButtonState: Record<Buttons, ButtonState>;

    constructor(initial_level: number, is_animating: Boolean = true) {
        // Used to make an uninitialized NESTetris (see clone())
        if (initial_level == -1) {
            return;
        }
        // NESTetris is 10x20
        this.board = new TetrisBoard(this.width, this.height);
        // Yes, the very first piece of the game slightly avoids index 0 (T-Piece).
        this.current_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece(0));
        this.next_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece(this.current_piece.abstractTetrisPiece.pieceID - 1));
        // Game State
        this.game_over = false;
        this.initial_level = initial_level;
        this.level = this.initial_level;
        this.score = 0;
        // Temporary game state
        this.failedToDrop = false;
        // ARE Region of code
        this.AREState = 1;
        this.is_animating = is_animating;
        this.frameCounter = 0;
        this.vramRow = 32;
        this.vram = Array(this.height);
        for(let y = 0; y < this.height; y++) {
            this.vram[y] = Array(this.width);
            for(let x = 0; x < this.width; x++) {
                this.vram[y][x] = 0;
            }
        }
        this.pendingAudio = NESTetrisAudioType.NONE;
        this.gameboardFlashing = false;
        // DAS
        this.dasHorizontal = 0;
        this.dasVertical = -96; // For initial starting delay
        this.pushdownPoints = 0;
        this.fallTimer = 0;
        // Statistics
        this.pieceCount = Array(TETRIS_PIECES.length);
        for(let i = 0; i < TETRIS_PIECES.length; i++) {
            this.pieceCount[i] = 0;
        }
        this.pieceCount[this.current_piece.abstractTetrisPiece.pieceID - 1]++;
        this.totalLinesCleared = 0;
        // ButtonState
        this.buttonState = {
            [Buttons.LEFT]: ButtonState.RELEASED,
            [Buttons.RIGHT]: ButtonState.RELEASED,
            [Buttons.DOWN]: ButtonState.RELEASED,
            [Buttons.ROTATE_CCW]: ButtonState.RELEASED,
            [Buttons.ROTATE_CW]: ButtonState.RELEASED,
        };
        // Create a `copy` of the previous button state
        this.previousButtonState = {...this.buttonState};
    }

    clone(): NESTetrisGame {
        let ret = new NESTetrisGame(-1);
        // Board
        ret.board = this.board.clone();
        // Pieces
        ret.current_piece = new TetrisPiece(this.current_piece.x, this.current_piece.y, this.current_piece.abstractTetrisPiece);
        ret.next_piece = new TetrisPiece(this.next_piece.x, this.next_piece.y, this.next_piece.abstractTetrisPiece);
        // Game State
        ret.game_over = this.game_over;
        ret.initial_level = this.initial_level;
        ret.level = this.level;
        ret.score = this.score;
        // Temporary game state
        ret.failedToDrop = this.failedToDrop;
        ret.lastClearedLines  = this.lastClearedLines;
        // ARE Region of code
        ret.AREState = this.AREState;
        ret.is_animating = this.is_animating;
        if (ret.is_animating) {
            ret.frameCounter = this.frameCounter;
            ret.vramRow = this.vramRow;
            ret.vram = clone(this.vram);
            ret.pendingAudio = this.pendingAudio;
            ret.gameboardFlashing = this.gameboardFlashing;
            // DAS
            ret.dasHorizontal = this.dasHorizontal;
            ret.dasVertical = this.dasVertical;
            ret.pushdownPoints = this.pushdownPoints;
            ret.fallTimer = this.fallTimer;
            // Statistics
            ret.totalLinesCleared = this.totalLinesCleared;
            ret.pieceCount = [...this.pieceCount];
            // ButtonState
            ret.buttonState = {...this.buttonState};
            ret.previousButtonState = this.previousButtonState;
        } else {
            ret.totalLinesCleared = this.totalLinesCleared;
        }
        return ret;
    }

    spawnPieceDistribution() {
        // Reset some variables
        this.fallTimer = 0;
        this.dasVertical = 0;

        // Iterate the current/next pieces
        this.current_piece = this.next_piece;
        // Track statistics including this newly current piece
        this.pieceCount && this.pieceCount[this.current_piece.abstractTetrisPiece.pieceID - 1]++;

        // Return the distribution of valid next pieces
        return getRandomAbstractPieceDistribution(this.current_piece.abstractTetrisPiece.pieceID - 1);
    }

    spawnParticularPiece(rawPieceID: number) {
        this.next_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, TETRIS_PIECES[rawPieceID]);
    }

    spawnRandomizedPiece() {
        // Reset some variables
        this.fallTimer = 0;
        this.dasVertical = 0;

        // Iterate the current/next pieces
        this.current_piece = this.next_piece;
        // Track statistics including this newly current piece
        this.pieceCount && this.pieceCount[this.current_piece.abstractTetrisPiece.pieceID - 1]++;

        // Sample a random piece
        this.next_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece(this.current_piece.abstractTetrisPiece.pieceID - 1));
    }

    // Frames per automatic drop
    getCurrentFramesPerDrop() {
        if (this.level >= 29) {
            return 1;
        } else if (this.level >= 19) {
            return 2;
        } else if (this.level >= 18) {
            return 3;
        } else {
            // Table look-up for the lower levels
            return [
                48, 43, 38, 33, 28, 23, 18, 13, 8, 6,
                5, 5, 5, 4, 4, 4, 3, 3,
            ][this.level];
        }
    }

    // Lines left in initial level
    shouldLevelUp() {
        let lines_in_initial_level = 0;
        if (this.initial_level <= 9) {
            lines_in_initial_level = 10 * (this.initial_level + 1);
        } else if (this.initial_level <= 15) {
            lines_in_initial_level = 100;
        } else {
            lines_in_initial_level = 100 + 10 * (this.initial_level - 15);
        }

        let lines_in_other_levels = 10 * (this.level - this.initial_level);

        let cutoff_for_this_level = lines_in_initial_level + lines_in_other_levels;
        
        if (this.totalLinesCleared >= cutoff_for_this_level) {
            return true;
        } else {
            return false;
        }
    }

    // Get VRAM/Sprite data for what block to render at that x/y
    getRenderableBlock(x: number, y: number): number {
        // During ARE1 (Gamelogic), and ARE2 (Lock Tetromino Logic),
        // We render the current piece as a Sprite. We want to still see it,
        // even though it's not locked into this.board yet
        if (this.AREState == 1 || this.AREState == 2) {
            for(let square_locations of this.current_piece.getCells()) {
                // Get the actual x/y of this gridcell, relative to the piece x/y
                let block_x = this.current_piece.x + square_locations[0];
                let block_y = this.current_piece.y + square_locations[1];

                // If this block is from the current piece, return the current piece's ID
                if (block_x == x && block_y == y) {
                    return this.current_piece.abstractTetrisPiece.pieceID;
                }
            }
        }

        // Otherwise, just return what's in our VRAM
        return this.vram[y][x];
    }

    // Button Presses

    pressLeft() {
        this.buttonState[Buttons.LEFT] = ButtonState.PRESSED;
    }

    pressRight() {
        this.buttonState[Buttons.RIGHT] = ButtonState.PRESSED;
    }

    pressDown() {
        this.buttonState[Buttons.DOWN] = ButtonState.PRESSED;
    }

    pressCCW() {
        this.buttonState[Buttons.ROTATE_CCW] = ButtonState.PRESSED;
    }

    pressCW() {
        this.buttonState[Buttons.ROTATE_CW] = ButtonState.PRESSED;
    }

    // Lock the current piece into its current position
    // Returns false if it cannot be locked
    lockCurrentPiece() {
        // If the piece is not in a valid location, we can't lock it
        if (!this.board.isValidPiece(this.current_piece)) {
            return false;
        }
        // Otherwise, lock the piece onto the board at its current location
        this.board.placePiece(this.current_piece);
        return true;
    }

    // Updates lastClearedLines, for usage later
    clearLines() {
        this.lastClearedLines = this.board.clearLines();
    }

    // Adds the score of lastClearedLines,
    // consumes lastClearedLines
    updateScore() {
        this.totalLinesCleared += this.lastClearedLines;

        // Level Up, before counting the score for this line
        if (this.shouldLevelUp()) {
            this.level++;
            this.pendingAudio = NESTetrisAudioType.LEVEL_UP;
        }

        // Track the score
        this.score += [0, 40, 100, 300, 1200][this.lastClearedLines] * (this.level + 1);
        if (this.pushdownPoints >= 2) {
            this.pushdownPoints -= 1;

            // Because pushdown points don't get converted into Decimal,
            // This is how the logic works
            let pushdown_ones_place = this.pushdownPoints % 16;
            let pushdown_tens_place = Math.floor(this.pushdownPoints / 16) % 16;
            this.score += pushdown_tens_place * 10 + pushdown_ones_place;
        }
        this.pushdownPoints = 0;

        this.lastClearedLines = 0;
    }

    handleShift() {
        // If we're holding down, skip the shift logic
        if (this.buttonState[Buttons.DOWN] != ButtonState.RELEASED) {
            return;
        }

        // If we're not pressing left/right, skip the shift logic
        if (this.buttonState[Buttons.LEFT] == ButtonState.RELEASED && this.buttonState[Buttons.RIGHT] == ButtonState.RELEASED) {
            return;
        }

        let just_pressed = this.buttonState[Buttons.LEFT] == ButtonState.NEWLY_PRESSED || this.buttonState[Buttons.RIGHT] == ButtonState.NEWLY_PRESSED;

        let will_try_to_shift_piece = false;

        if (just_pressed) {
            this.dasHorizontal = 0;
            will_try_to_shift_piece = true;
        } else {
            this.dasHorizontal++;
            if (this.dasHorizontal >= 16) {
                this.dasHorizontal = 10;
                will_try_to_shift_piece = true;
            }
        }

        if (will_try_to_shift_piece) {
            let did_shift_piece = false;
            if (this.buttonState[Buttons.LEFT] != ButtonState.RELEASED) {
                if (this.board.tryMovePiece(this.current_piece, -1, 0)) {
                    did_shift_piece = true;
                }
            } else if (this.buttonState[Buttons.RIGHT] != ButtonState.RELEASED) {
                if (this.board.tryMovePiece(this.current_piece, 1, 0)) {
                    did_shift_piece = true;
                }
            }
            if (did_shift_piece) {
                this.pendingAudio = NESTetrisAudioType.SHIFT;
            } else {
                // If it can't move, prime DAS
                this.dasHorizontal = 16;
            }
        }
    }

    // Handles the down key (Or down motion of the piece)
    handleDown() {
        // If we're still in the starting animation,
        if (this.dasVertical < 0) {
            // Let the DOWN button interrupt the animation
            if (this.buttonState[Buttons.DOWN] == ButtonState.NEWLY_PRESSED) {
                this.dasVertical = 0;
            } else {
                // Otherwise, keep it going and don't process DOWN for the time being
                this.dasVertical++;
                return;
            }
        }

        let holding_leftright = this.buttonState[Buttons.LEFT] != ButtonState.RELEASED || this.buttonState[Buttons.RIGHT] != ButtonState.RELEASED;

        let das_drop = false;

        // If we're autorepeating down
        if (this.dasVertical > 0) {
            if (this.buttonState[Buttons.DOWN] == ButtonState.RELEASED || holding_leftright) {
                // Stop autorepeating once we're not holding exclusively down
                this.dasVertical = 0;
                this.pushdownPoints = 0;
            } else {
                this.dasVertical++;
                // Autorepeat with 1 -> 2 -> 3/1 -> 2 -> 3/1,
                // DAS dropping on the 3's
                if (this.dasVertical >= 3) {
                    this.dasVertical = 1;
                    this.pushdownPoints++;
                    das_drop = true;
                }
            }
        } else {
            // If we've just started to hold exclusively down,
            // start autorepeating on down
            if (this.buttonState[Buttons.DOWN] == ButtonState.NEWLY_PRESSED && !holding_leftright) {
                this.dasVertical = 1;
            }
        }

        if (das_drop || this.fallTimer >= this.getCurrentFramesPerDrop()) {
            this.fallTimer = 0;

            // Try to simply drop the piece
            let could_drop: Boolean = this.board.tryMovePiece(this.current_piece, 0, 1);

            // If we couldn't drop the piece, we should lock the piece into place
            if (!could_drop) {
                // Mark that we failed to drop the piece
                this.failedToDrop = true;
            }
        }
    }

    iterateGameLogic() {
        // Only now, do we actually read input from the user

        // Mark PRESSED as NEWLY_PRESSED, if it's the first frame of the press
        for(let button_type in this.previousButtonState) {
            if (this.previousButtonState[button_type] == ButtonState.RELEASED && this.buttonState[button_type] == ButtonState.PRESSED) {
                this.buttonState[button_type] = ButtonState.NEWLY_PRESSED;
            }
        }

        // First handle shifts
        this.handleShift();

        // Then handle rotations
        let prev_orientation = this.current_piece.orientation;
        if (this.buttonState[Buttons.ROTATE_CCW] == ButtonState.NEWLY_PRESSED) {
            this.board.tryRotatePiece(this.current_piece, TetrisRotation.ROTATE_CCW);
        }
        if (this.buttonState[Buttons.ROTATE_CW] == ButtonState.NEWLY_PRESSED) {
            this.board.tryRotatePiece(this.current_piece, TetrisRotation.ROTATE_CW);
        }
        // Check for an actual orientation, to handle non-rotation pieces like O,
        // And to only play the sound when something actually rotates
        if (prev_orientation != this.current_piece.orientation) {
            this.pendingAudio = NESTetrisAudioType.ROTATION;
        }

        // Then handle drops
        this.handleDown(); // Might end the game, if the next piece has nowhere to go
    }

    hardCCW() {
        return this.board.tryRotatePiece(this.current_piece, TetrisRotation.ROTATE_CCW);
    }

    hardCW() {
        return this.board.tryRotatePiece(this.current_piece, TetrisRotation.ROTATE_CW);
    }

    // Harddrop, simulates many iterations until the drop,
    // And then returns the distribution of next pieces
    hardDrop() {
        // Do nothing if the game is over
        if (this.game_over) {
            return;
        }

        let distribution = null;
        while(true) {
            let could_drop: Boolean = this.board.tryMovePiece(this.current_piece, 0, 1);
            if (!could_drop) {
                let canLockPiece = this.lockCurrentPiece();
                if (!canLockPiece) {
                    this.game_over = true;
                } else {
                    // Clear the lines, update the score, then spawn a new piece
                    this.clearLines();
                    this.updateScore();
                    distribution = this.spawnPieceDistribution();
                }
                break;
            }
        }
        return distribution;
    }

    iterate() {
        // The original NES also iterates the PRNG at this point
        this.frameCounter++;
        this.fallTimer++;
        this.pendingAudio = NESTetrisAudioType.NONE;

        // Do nothing if the game is over
        if (this.game_over) {
            return;
        }

        if (this.AREState == 1) {
            // Iterate gamelogic
            this.iterateGameLogic();

            // If the gamestate has had a failure to drop, handle it
            if (this.failedToDrop) {
                this.failedToDrop = false;

                if (this.is_animating) {
                    // If we wish to have Animations Enabled,
                    // Progress to ARE Logic
                    this.AREState = 2;
                } else {
                    // Yes, this makes a funny bug where a spawned piece that
                    // intersects the board, can be "moved" over before it causes the game to end.
                    // Since, the game only ends when "lock" fails, not when "spawn" fails
                    let canLockPiece = this.lockCurrentPiece();
                    if (!canLockPiece) {
                        this.game_over = true;
                    } else {
                        // Clear the lines, update the score, then spawn a new piece
                        this.clearLines();
                        this.updateScore();
                        this.spawnRandomizedPiece();
                    }
                }
            }
        } else {
            // Iterate ARE logic
            this.iterateARELogic();
        }

        // Reset ButtonState, but saving the previous one
        this.previousButtonState = this.buttonState;
        this.buttonState = {
            [Buttons.LEFT]: ButtonState.RELEASED,
            [Buttons.RIGHT]: ButtonState.RELEASED,
            [Buttons.DOWN]: ButtonState.RELEASED,
            [Buttons.ROTATE_CCW]: ButtonState.RELEASED,
            [Buttons.ROTATE_CW]: ButtonState.RELEASED,
        };
    }

    iterateARELogic() {
        // Explanation of this code (Look for vramRow and playState in the assembly)
        // https://pastebin.com/KS7uDzdF
        // https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm

        if (this.AREState == 2) {
            // Wait until vram finishes
            if (this.vramRow >= this.height) {
                // Then lock the piece
                let could_lock = this.lockCurrentPiece();
                // Handle game-over state
                if (!could_lock) {
                    this.pendingAudio = NESTetrisAudioType.GAMEOVER_CRASH;
                    this.game_over = true;
                    return;
                }
                // Partially update VRAM
                this.vramRow = Math.max(this.current_piece.y - 2, 0);
                // Go to AREState 3
                this.AREState = 3;
                // Number of times AREState 3 ran, starts at 0
                this.AREAuxData = 0;
            }
        } else if (this.AREState == 3) {
            // Wait until vram finishes
            if (this.vramRow >= this.height) {
                // Number of times we've run AREState 3
                this.AREAuxData++;
                // On the 4th check, we're done
                if (this.AREAuxData == 4) {
                    // Get the indices of the complete rows, if any exist
                    let completeRows = [];
                    for(let y = 0; y < this.height; y++) {
                        let isRowComplete = true;
                        for(let x = 0; x < this.width; x++) {
                            if (!this.board.getSquareTaken(x, y)) {
                                isRowComplete = false;
                            }
                        }
                        if (isRowComplete) {
                            completeRows.push(y);
                        }
                    }
                    // Clear any complete lines, if any exist
                    this.clearLines();
                    // Completely reset vram
                    this.vramRow = 0;
                    if (this.lastClearedLines > 0) {
                        // Show the line clearing animation, starting with 0 blocks obscured
                        if (this.lastClearedLines == 4) {
                            this.pendingAudio = NESTetrisAudioType.TETRIS;
                        } else {
                            this.pendingAudio = NESTetrisAudioType.LINECLEAR;
                        }
                        // Set to lineclear animation
                        this.AREState = 4;
                        this.AREAuxData = {
                            numProgressions: 0,
                            completeRows: completeRows,
                        };
                    } else {
                        this.pendingAudio = NESTetrisAudioType.LOCK_PIECE;
                        // Skip lineclear animation, since there isn't any
                        this.AREState = 5;
                    }
                }
            }
        } else if (this.AREState == 4) {
            // Line Clearing Animation, do nothing in main switch-case
        } else if (this.AREState == 5) {
            // Update level and statistics
            this.updateScore();
            this.AREState++;
        } else if (this.AREState == 6 || this.AREState == 7) {
            // These frames do nothing in particular
            this.AREState++;
        } else if (this.AREState == 8) {
            // Wait until vram finishes
            if (this.vramRow >= this.height) {
                // ARE8 will spawn the new piece,
                // setting current_piece to a new piece up done
                this.spawnRandomizedPiece();
                // And, we're ready to go back into gamestate logic
                this.AREState = 1;
            }
        }

        // =========
        // Video Rendering Logic
        // =========

        // The gameboard isn't flashing, unless something says otherwise
        this.gameboardFlashing = false;

        // On ARE 4, that's the lineclear animation
        if (this.AREState == 4) {
            // Only on mod 4, do we progress it
            // (This progression might happen on the same frame we computed AREState 3. That's what the NES does)
            if (this.frameCounter % 4 == 0) {
                // The number of times we've progressed the lineclear animation
                this.AREAuxData.numProgressions++;

                // Mark some squares of the completeRows as black, as part of the line clear animation
                for(let y of this.AREAuxData.completeRows) {
                    // 0 1 2 3 4 | 5 6 7 8 9
                    let left_square = 4 - this.AREAuxData.numProgressions + 1;
                    let right_square = 5 + this.AREAuxData.numProgressions - 1;
                    
                    // Wipe the VRAM squares for that iteration of the line clearing animation
                    this.vram[y][left_square] = 0;
                    this.vram[y][right_square] = 0;
                }

                // If this was a tetris, we should flash the board on each progression too
                if (this.lastClearedLines == 4) {
                    this.gameboardFlashing = true;
                }

                // On the 5th iteration, we're done!
                if (this.AREAuxData.numProgressions == 5) {
                    // When we're done, we progress to ARE5 and reset VRAM copy entirely
                    this.AREState = 5;

                    // And then signal a board->VRAM copy
                    this.vramRow = 0;
                }
            }
        }
        // If the line clearing animation isn't happening,
        // So we handle board->vram updating
        else {
            // as long as vramRow < height,
            // Copy (at most) 4 rows, from the board, to the VRAM
            for(let i = 0; i < 4 && this.vramRow < this.height; i++) {
                // Copy the vramRow from the board into the vram
                for(let x = 0; x < this.width; x++) {
                    this.vram[this.vramRow][x] = this.board.getSquare(x, this.vramRow);
                }
                // Inc vramRow
                this.vramRow++;
            }
        }
    }
};

export {
    NESTetrisAudioType,
    NESTetrisGame
};
