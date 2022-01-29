const TETRIS_PIECE_HOTSPOT = {
    x: 2,
    y: 2,
};

const TETRIS_PIECE_DIMENSIONS = 5;

// GLOBAL
// TODO: Remove
let TotalNumAbstractPieces = 0;

class AbstractTetrisPiece {
    squareLocations: number[][][];
    defaultOrientation: number;
    pieceID: number;

    constructor(defaultOrientation: number, data_2d: number[][][]) {
        this.defaultOrientation = defaultOrientation;

        // Populate squareLocations
        this.squareLocations = [];
        for(let orientation = 0; orientation < data_2d.length; orientation++) {
            // Initialize this orientation as having no pieces so far
            this.squareLocations.push([]);
            for(let x = 0; x < TETRIS_PIECE_DIMENSIONS; x++) {
                for(let y = 0; y < TETRIS_PIECE_DIMENSIONS; y++) {
                    // Find the four tetromino squares,
                    // and push their relative locations into the array
                    if (data_2d[orientation][y][x] == 1) {
                        this.squareLocations[orientation].push([x - TETRIS_PIECE_HOTSPOT.x, y - TETRIS_PIECE_HOTSPOT.y]);
                    }
                }
            }
        }

        // Give this abstract piece a Unique ID
        this.pieceID = TotalNumAbstractPieces;
        TotalNumAbstractPieces += 1;
    }

    getDefaultOrientation() {
        return this.defaultOrientation;
    }

    getCells(orientation: number) {
        return this.squareLocations[orientation];
    }

    numOrientations() {
        return this.squareLocations.length;
    }
};

const T_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(2, [
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
]);

const J_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(3, [
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0],
    ],
]);

const Z_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(0, [
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
]);


const O_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(0, [
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
]);

const S_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(0, [
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 1, 1, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0],
    ],
]);


const L_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(1, [
    [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
    ],
]);

const I_PIECE: AbstractTetrisPiece = new AbstractTetrisPiece(1, [
    [
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
    ],
    [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
    ],
]);

const TETRIS_PIECES: AbstractTetrisPiece[] = [
    T_PIECE,
    J_PIECE,
    Z_PIECE,
    O_PIECE,
    S_PIECE,
    L_PIECE,
    I_PIECE,
];

export {
    AbstractTetrisPiece,
    TETRIS_PIECES,
};
