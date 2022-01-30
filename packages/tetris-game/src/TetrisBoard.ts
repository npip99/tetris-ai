import { AbstractTetrisPiece } from "./TetrisPiece";

enum TetrisRotation {
    ROTATE_CW,
    ROTATE_CCW,
};

class TetrisPiece {
    abstractTetrisPiece: AbstractTetrisPiece;
    orientation: number;
    // Public Variables
    x: number;
    y: number;

    constructor(x: number, y: number, abstractTetrisPiece: AbstractTetrisPiece) {
        this.x = x;
        this.y = y;
        this.orientation = abstractTetrisPiece.getDefaultOrientation();
        this.abstractTetrisPiece = abstractTetrisPiece;
    }

    // Returns the cells, relative to the (x, y) center of the piece
    getCells() {
        return this.abstractTetrisPiece.getCells(this.orientation);
    }

    // Rotate the piece
    rotate(rotation: TetrisRotation) {
        if (rotation == TetrisRotation.ROTATE_CW) {
            this.orientation = (this.orientation + 1) % this.abstractTetrisPiece.numOrientations();
        } else {
            this.orientation = (this.orientation - 1 + this.abstractTetrisPiece.numOrientations()) % this.abstractTetrisPiece.numOrientations();
        }
    }
}

class TetrisBoard {
    board: Uint8Array;
    width: number;
    height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.board = new Uint8Array(width * height);
    }

    placePiece(piece: TetrisPiece) {
        // For each square in the tetronimo,
        for(let square_locations of piece.getCells()) {
            // Get the actual x/y of this gridcell, relative to the piece x/y
            let x = piece.x + square_locations[0];
            let y = piece.y + square_locations[1];

            // If this square is in-bounds, mark the square as taken
            if (this.inBounds(x, y)) {
                this.setSquare(x, y, piece.abstractTetrisPiece.pieceID);
            }
        }
    }

    // Check if the location is valid (Including the 2line buffer)
    isValidLocation(x: number, y: number) {
        return 0 <= x && x < this.width && -2 <= y && y < this.height;
    }

    // Check if the location is in-bounds (i.e., a visible gridcell)
    inBounds(x: number, y: number) {
        return 0 <= x && x < this.width && 0 <= y && y < this.height;
    }

    // Check if the piece is valid
    // i.e., if all squares are in valid locations and not overlapping existant squares
    isValidPiece(piece: TetrisPiece) {
        for(let square_locations of piece.getCells()) {
            // Get the actual x/y of this gridcell, relative to the piece x/y
            let x = piece.x + square_locations[0];
            let y = piece.y + square_locations[1];

            // If the location isn't valid at all, the piece isn't valid
            if (!this.isValidLocation(x, y)) {
                return false;
            }

            // If the location is in bounds, but the square is taken, the piece isn't valid
            if (this.inBounds(x, y) && this.getSquareTaken(x, y)) {
                return false;
            }
        }

        // Otherwise, it's valid
        return true;
    }

    // Try moving the piece, if it can be moved
    tryMovePiece(piece: TetrisPiece, delta_x: number, delta_y: number) {
        piece.x += delta_x;
        piece.y += delta_y;

        // If the piece is not valid, put the piece back and then give up
        if (!this.isValidPiece(piece)) {
            piece.x -= delta_x;
            piece.y -= delta_y;
            return false;
        }

        // Otherwise, the move was successful!
        return true;
    }

    // Try rotating the piece, if it can be rotated
    tryRotatePiece(piece: TetrisPiece, rotation: TetrisRotation) {
        piece.rotate(rotation);

        // If the piece is not valid, rotate it the other direction and then give up
        if (!this.isValidPiece(piece)) {
            piece.rotate(rotation == TetrisRotation.ROTATE_CW ? TetrisRotation.ROTATE_CCW : TetrisRotation.ROTATE_CW);
            return false;
        }

        // Otherwise, the rotate was successful!
        return true;
    }

    // Access the board
    getSquareTaken(x: number, y: number) {
        return this.board[y * this.width + x] != 0;
    }

    // Access the board
    getSquare(x: number, y: number) {
        return this.board[y * this.width + x];
    }

    // Access the board
    setSquare(x: number, y: number, id: number) {
        this.board[y * this.width + x] = id;
    }

    // Clear any lines, returning the number of lines cleared
    clearLines() {
        let num_lines_cleared = 0;

        // The line to start trying to clear lines from
        let starting_line = this.height - 1;

        // We want to read from a higher line,
        // And write to a lower line, when clearing lines
        let reading_line = starting_line;
        let writing_line = starting_line;

        // Writes a writing_line happen one at a time,
        // starting from the bottom
        while(writing_line >= 0) {
            if (reading_line >= 0) {
                // Check if the reading line's row is full
                let is_row_full = true;
                for(let x = 0; x < this.width; x++) {
                    // If any square isn't taken, the row isn't full
                    if (!this.getSquareTaken(x, reading_line)) {
                        is_row_full = false;
                    }
                }

                // If the row was full, skip to scan the next reading_line,
                // since that line is considered "cleared"
                if (is_row_full) {
                    reading_line--;
                    num_lines_cleared++;
                    continue;
                }
            }

            // If the reading line, is above the writing_line
            if (reading_line < 0) {
                // Wipe the line if we've run out of lines to read from
                for(let x = 0; x < this.width; x++) {
                    this.setSquare(x, writing_line, 0);
                }
                writing_line--;
            } else if (reading_line < writing_line) {
                // if we're still readling lines,
                // memcpy from reading_line to writing_line to shift it down
                for(let x = 0; x < this.width; x++) {
                    this.setSquare(x, writing_line, this.getSquare(x, reading_line));
                }
                reading_line--;
                writing_line--;
            } else {
                // reading_line == writing_line, the memcpy is identity
                reading_line--;
                writing_line--;
            }
        }

        // Return the # of lines cleared
        return num_lines_cleared;
    }
};

export {
    TetrisRotation,
    TetrisPiece,
    TetrisBoard
};
