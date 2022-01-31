import { TetrisBoard, TetrisPiece, TetrisRotation } from "./TetrisBoard";
import { TETRIS_PIECES } from "./TetrisPiece";

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

function getRandomAbstractPiece(avoid_piece: number) {
    // Get a random num from 0->7 inclusive
    let firstAttempt = Math.floor(Math.random() * 8);

    // If we picked an invalid index (Either 7 or the piece we're trying to avoid),
    if (firstAttempt == 7 || firstAttempt == avoid_piece) {
        // Use this oddly biased sample distribution
        const PROBABILITIES = [
            9,
            8,
            8,
            8,
            9,
            7,
            7, 
        ];
        const TOTAL_CUMULATIVE_PROBABILITY = PROBABILITIES.reduce((a, b) => a + b, 0);

        // Get a random num within the total cumulative probability, exclusive on the right
        let randomPieceNum = Math.floor(Math.random() * TOTAL_CUMULATIVE_PROBABILITY);

        // Get the chosen piece and it's cumulative probability
        let chosenPiece = 0;
        let cumulativeProbability = PROBABILITIES[0];

        // While randomPieceNum is not yet inside of the cumulative probability,
        while(!(randomPieceNum < cumulativeProbability)) {
            // Include the next chosen piece,
            // to see if randomPieceNum will be within the now larger cumulative probability
            chosenPiece += 1;
            cumulativeProbability += PROBABILITIES[chosenPiece];
        }

        // Return the chosen piece
        return TETRIS_PIECES[chosenPiece];
    } else {
        // Otherwise, return the first index
        return TETRIS_PIECES[firstAttempt];
    }
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
    frameCounter: number;
    // Logic for ARE
    pendingAudio: NESTetrisAudioType;
    ARE_counter: number;
    ARE_aux_counter: number;
    vramRow: number;
    vram: number[][];
    lastClearedLines: number;
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

    constructor(initial_level: number) {
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
        // ARE Region of code
        this.frameCounter = 0;
        this.ARE_counter = 1;
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

    spawnPiece() {
        // Reset some variables
        this.fallTimer = 0;
        this.dasVertical = 0;

        // Iterate the current/next pieces
        this.current_piece = this.next_piece;
        this.next_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece(this.current_piece.abstractTetrisPiece.pieceID - 1));
        // Track statistics including this newly current piece
        this.pieceCount[this.current_piece.abstractTetrisPiece.pieceID - 1]++;
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

    // Get board value at x, y
    getRenderableBlock(x: number, y: number): number {
        // Between normal playtime, and when we actually lock the piece,
        // we render the current piece as a sprite since we want to see it
        if (this.ARE_counter == 1 || this.ARE_counter == 2) {
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

        // If we're clearing lines, do so
        if (this.ARE_counter == 4) {
            let is_line_full = this.vram[y].reduce((a, b) => a && b != 0, true);
            if (is_line_full) {
                // 0 1 2 3 4 | 5 6 7 8 9
                let lower_bound = 4 - this.ARE_aux_counter;
                let upper_bound = 5 + this.ARE_aux_counter;
                if (lower_bound < x && x < upper_bound) {
                    return 0;
                }
            }
        }

        // Otherwise, return what's in our VRAM
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
    lockCurrentPiece() {
        // If the piece is not in a valid location, it's game-over
        if (!this.board.isValidPiece(this.current_piece)) {
            // Yes, this makes a funny bug where a spawned piece that
            // intersects the board, can be "moved" over before it causes the game to end.
            this.game_over = true;
            return;
        }
        // Otherwise, lock the piece onto the board at its current location
        this.board.placePiece(this.current_piece);
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
                // Mark the ARE counter state
                this.ARE_counter = 2;
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

    iterate() {
        this.pendingAudio = NESTetrisAudioType.NONE;
        this.gameboardFlashing = false;
        // The original NES also iterates the PRNG at this point
        this.frameCounter++;
        this.fallTimer++;

        // Do nothing if the game is over
        if (this.game_over) {
            return;
        }

        // Original NES Logic, including ARE
        // 1 Core game logic, may set to state 2 and VRAMrow should be SET when that happens
        // 2 Waits for VRAM to be okay, and then SETS the vramRow again
        // 3 Waits for VRAM to be okay, and then takes 4 Frames, then sets vram=0
        // 4 is only for lineclears. If a lineclear happens, we wait for "five" iterations, on only frame_counts of multiples of 4
        // 5 happens once in parallel,
        // 6 happens once in parallel,
        // 7 happens once in parallel,
        // 8 waits for VRAM to be okay, and then takes 1Frame, after which the current piece is ready-to-render and it goes back to 1

        // Calculating VRAM Delay, based off of a partial copy
        // Some PlayStates will update vramRow to be max(y-2, 0)
        // VRAM will copy data over, 4 rows at a time, until vramRow >= 20
        // Some PlayStates will wait for VRAM to be copied, before acting
        // 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19   y
        // 0 0 0 1 2 3 4 5 6 7 8  9  10 11 12 13 14 15 16 17   max(y-2, 0)
        // ^----------^ ^-----^ ^---------^ ^---------^ ^---^
        //      4          3        2            1        0     <- Starts at 0, since it gets copied on that very frame
        //
        // Thus, partial_vram_delay(y) = 4 - Math.floor(max(y - 2, 0) / 4)

        // PlayState1: When a piece failed to drop, sets vramRow = max(y-2, 0), and iterates PlayState
        //  ~ Waiting for partial_vram_delay(y) Dead Frames
        // PlayState2: 1 Frame, sets vramRow = max(y-2, 0)
        //  ~ Waiting for partial_vram_delay(y) Dead Frames
        // PlayState3: 4 Frames, sets vramRow = 0
        //             [vramRow += 4 at the end of this frame, 4 left]
        // if LineClearingAnimation:
        //   PlayState4: 5 Frame animation, iteration only on %4 == 0-Frames, which can overlap with End of PlayState3
        //             vramRow does not get iterated during LineClearingAnimation
        //             [vramRow = 0 at the end of this frame, 5 left]
        //
        // else:
        //   Skip this PlayState entirely
        // PlayState5: 1 [If LineClearingAnimation, Frame 1, else Frame 2]
        // PlayState6: 1 [If LineClearingAnimation, Frame 2, else Frame 3]
        // PlayState7: 1 [If LineClearingAnimation, Frame 3, else Frame 4]
        //  ~ If LineClearingAnimation, waiting for Frame 4 / Frame 5 of copy
        //    Else, waiting for Frame 5 of copy
        // PlayState8: 1 Frame, Ready to render nextpiece on playfield, with a new nextpiece

        // Total Delay Math:
        // Do Nothing 2 * f_delay(x) + 5
        // On Lineclear: Go through 5 states of LineClearingAnimation, make progress only on %4==0 indices
        // If LineClearingAnimation:
        //     Copy from board, to VRAM, starting at row=0, in groups of 4 [Will take 5 frames]
        // Else:
        //     Do Nothing for 4 Frames
        // On the last frame, make the spawn piece ready-to-render


        // Iterate gamelogic
        if (this.ARE_counter == 1) {
            this.iterateGameLogic();
            // If we got an ARE state of 2, SET the VRAM row
            // @ts-ignore
            if (this.ARE_counter == 2) {
                // Sync the VRAM, without the lineclears
                this.lockCurrentPiece();
                for(let y = 0; y < this.height; y++) {
                    for(let x = 0; x < this.width; x++) {
                        this.vram[y][x] = this.board.getSquare(x, y);
                    }
                }
                this.vramRow = Math.max(this.current_piece.y - 2, 0);
            }
        } else if (this.ARE_counter == 2) {
            if (this.vramRow >= this.height) {
                // Wait till vram syncs,
                // Then lock the piece and mark vramRow
                this.vramRow = Math.max(this.current_piece.y - 2, 0);
                // Number of real ARE3 runs will start at 0
                this.ARE_counter = 3;
                this.ARE_aux_counter = 0;
            }
        } else if (this.ARE_counter == 3) {
            if (this.vramRow >= this.height) {
                // Number of real runs on ARE3
                this.ARE_aux_counter++;
                // On the 4th check, clear lines and reset vramRow entirely
                if (this.ARE_aux_counter == 4) {
                    // Clear any complete lines, if any exist
                    this.lastClearedLines = this.board.clearLines();
                    this.vramRow = 0;
                    if (this.lastClearedLines > 0) {
                        // Show the line clearing animation, starting with 0 blocks obscured
                        if (this.lastClearedLines == 4) {
                            this.pendingAudio = NESTetrisAudioType.TETRIS;
                        } else {
                            this.pendingAudio = NESTetrisAudioType.LINECLEAR;
                        }
                        this.ARE_aux_counter = 0;
                        this.ARE_counter = 4;
                    } else {
                        this.pendingAudio = NESTetrisAudioType.LOCK_PIECE;
                        this.ARE_counter = 5;
                    }
                }
            }
        } else if (this.ARE_counter == 4) {
            // Line Clearing Animation
        } else if (this.ARE_counter == 5) {
            // Update level and statistics

            // Track total lines cleared
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

            this.ARE_counter++;
        } else if (this.ARE_counter == 6 || this.ARE_counter == 7) {
            // These frames do nothing in particular
            this.ARE_counter++;
        } else if (this.ARE_counter == 8) {
            if (this.vramRow >= this.height) {
                // ARE8 will spawn the new piece
                this.spawnPiece();
                this.ARE_counter = 1;
            }
        }

        if (this.game_over) {
            this.pendingAudio = NESTetrisAudioType.GAMEOVER_CRASH;
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

        // ===
        // Video Processing NES Code
        // ===

        // On ARE 4, that's the line clear animation
        if (this.ARE_counter == 4) {
            // Only on mod 4, do we progress it
            if (this.frameCounter % 4 == 0) {
                this.ARE_aux_counter++;
                // If this was a tetris, we should flash the board on each progression too
                if (this.lastClearedLines == 4) {
                    this.gameboardFlashing = true;
                }

                // On the 5th iteration, we're done!
                if (this.ARE_aux_counter == 5) {
                    // When we're done, we progress to ARE5 and reset VRAM copy entirely
                    this.ARE_counter = 5;

                    // Commit the blank linkes into VRAM
                    for(let y = 0; y < this.height; y++) {
                        let is_line_full = this.vram[y].reduce((a, b) => a && b != 0, true);
                        if (is_line_full) {
                            this.vram[y] = this.vram[y].map(_ => 0);
                        }
                    }
                    // And then signal a board->VRAM copy
                    this.vramRow = 0;
                }
            }
        }
        // If the line clearing animation isn't happening,
        // Copy 4 rows of VRAM over, if vramRow hasn't caught up yet
        else if (this.vramRow < this.height) {
            for(let i = 0; i < 4 && this.vramRow < this.height; i++) {
                // Only actually copy vramRow over, if ARE is >= 5, to animate the "shift down" operation after line clears
                if (this.ARE_counter >= 5) {
                    for(let x = 0; x < this.width; x++) {
                        this.vram[this.vramRow][x] = this.board.getSquare(x, this.vramRow);
                    }
                }
                this.vramRow++;
            }
        }
    }
};

export {
    NESTetrisAudioType,
    NESTetrisGame
};
