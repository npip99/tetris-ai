import { TetrisBoard, TetrisPiece, TetrisRotation } from "./TetrisBoard";
import { TETRIS_PIECES } from "./TetrisPiece";

const TETRIS_PIECE_SPAWN_LOCATION = {
    y: 0,
    x: 5,
};

function getRandomAbstractPiece() {
    const TOTAL_CUMULATIVE_PROBABILITY = 224;
    const PROBABILITIES = [
        33,
        32,
        32,
        32,
        33,
        31,
        31,
    ];

    // Get a random num within the total cumulative probability, exclusive on the right
    let randomPieceNum = Math.floor(Math.random() * TOTAL_CUMULATIVE_PROBABILITY);

    // Get the chosen piece and it's cumulative probability
    let chosenPiece = 0;
    let cumulativeProbability = PROBABILITIES[0];

    // While randomPieceNum is not yet inside of the cumulative probability,
    while(cumulativeProbability < randomPieceNum) {
        // Include the next chosen piece,
        // to see if randomPieceNum will be within the cumulative probability now
        chosenPiece += 1;
        cumulativeProbability += PROBABILITIES[chosenPiece];
    }

    // Return the chosen piece
    return TETRIS_PIECES[chosenPiece];
}

class TetrisState {
    board: TetrisBoard;
    current_piece: TetrisPiece;
    next_piece: TetrisPiece;
    game_over: Boolean;

    constructor() {
        this.board = new TetrisBoard();
        this.current_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece());
        this.next_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece());
        this.game_over = false;
    }

    // Get board
    getRenderableBlock(x: number, y: number): number {
        for(let square_locations of this.current_piece.getCells()) {
            // Get the actual x/y of this gridcell, relative to the piece x/y
            let block_x = this.current_piece.x + square_locations[0];
            let block_y = this.current_piece.y + square_locations[1];

            // If this block is from the current piece, return the current piece's ID
            if (block_x == x && block_y == y) {
                return this.current_piece.abstractTetrisPiece.pieceID;
            }
        }

        // Otherwise, return the underlying board
        return this.board.getSquare(x, y);
    }

    // Try to move the current piece left
    left() {
        this.board.tryMovePiece(this.current_piece, -1, 0);
    }

    // Try to move the current piece right
    right() {
        this.board.tryMovePiece(this.current_piece, 1, 0);
    }

    // Try to rotate the current piece CW
    rotateCW() {
        this.board.tryRotatePiece(this.current_piece, TetrisRotation.ROTATE_CW);
    }

    // Try to rotate the current piece CCW
    rotateCCW() {
        this.board.tryRotatePiece(this.current_piece, TetrisRotation.ROTATE_CCW);
    }

    // Try to drop the current piece by 1 unit
    drop() {
        let could_drop: Boolean = this.board.tryMovePiece(this.current_piece, 0, 1);
        // If it wasn't possible to drop the piece,
        if (!could_drop) {
            // We play the current piece where it is
            this.board.placePiece(this.current_piece);
            // And iterate the current/next pieces
            this.current_piece = this.next_piece;
            this.next_piece = new TetrisPiece(TETRIS_PIECE_SPAWN_LOCATION.x, TETRIS_PIECE_SPAWN_LOCATION.y, getRandomAbstractPiece());
            // If the new current piece isn't in a valid location, the game is over
            if (!this.board.isValidPiece(this.current_piece)) {
                this.game_over = true;
            }
        }
    }
};

export {
    TetrisState
};
