import React, { Component, CSSProperties, createRef } from 'react';
import { NESTetrisGame } from 'tetris-game';

// NES Color Palette
const nesColors = [[0x7C, 0x7C, 0x7C],[0x00, 0x00, 0xFC],[0x00, 0x00, 0xBC],[0x44, 0x28, 0xBC],[0x94, 0x00, 0x84],[0xA8, 0x00, 0x20],[0xA8, 0x10, 0x00],[0x88, 0x14, 0x00],[0x50, 0x30, 0x00],[0x00, 0x78, 0x00],[0x00, 0x68, 0x00],[0x00, 0x58, 0x00],[0x00, 0x40, 0x58],[0x00, 0x00, 0x00],[0x00, 0x00, 0x00],[0x00, 0x00, 0x00],[0xBC, 0xBC, 0xBC],[0x00, 0x78, 0xF8],[0x00, 0x58, 0xF8],[0x68, 0x44, 0xFC],[0xD8, 0x00, 0xCC],[0xE4, 0x00, 0x58],[0xF8, 0x38, 0x00],[0xE4, 0x5C, 0x10],[0xAC, 0x7C, 0x00],[0x00, 0xB8, 0x00],[0x00, 0xA8, 0x00],[0x00, 0xA8, 0x44],[0x00, 0x88, 0x88],[0x00, 0x00, 0x00],[0x00, 0x00, 0x00],[0x00, 0x00, 0x00],[0xF8, 0xF8, 0xF8],[0x3C, 0xBC, 0xFC],[0x68, 0x88, 0xFC],[0x98, 0x78, 0xF8],[0xF8, 0x78, 0xF8],[0xF8, 0x58, 0x98],[0xF8, 0x78, 0x58],[0xFC, 0xA0, 0x44],[0xF8, 0xB8, 0x00],[0xB8, 0xF8, 0x18],[0x58, 0xD8, 0x54],[0x58, 0xF8, 0x98],[0x00, 0xE8, 0xD8],[0x78, 0x78, 0x78],[0x00, 0x00, 0x00],[0x00, 0x00, 0x00],[0xFC, 0xFC, 0xFC],[0xA4, 0xE4, 0xFC],[0xB8, 0xB8, 0xF8],[0xD8, 0xB8, 0xF8],[0xF8, 0xB8, 0xF8],[0xF8, 0xA4, 0xC0],[0xF0, 0xD0, 0xB0],[0xFC, 0xE0, 0xA8],[0xF8, 0xD8, 0x78],[0xD8, 0xF8, 0x78],[0xB8, 0xF8, 0xB8],[0xB8, 0xF8, 0xD8],[0x00, 0xFC, 0xFC],[0xF8, 0xD8, 0xF8],[0x00, 0x00, 0x00],[0x00, 0x00, 0x00]];

// Color A and Color B for all levels (mod 10)
// Stored as an NES color
const levelColors = [
    [0x21, 0x12],
    [0x29, 0x1A],
    [0x24, 0x14],
    [0x2A, 0x12],
    [0x2B, 0x15],
    [0x22, 0x2B],
    [0x00, 0x16],
    [0x05, 0x13],
    [0x16, 0x12],
    [0x27, 0x16],
];

enum ColorPalette {
    COLOR_PALETTE_BLACK = 0,
    COLOR_PALETTE_WHITE = 1,
    COLOR_PALETTE_A = 2,
    COLOR_PALETTE_B = 3,
};

// black = 0
// white = 1
// Color A = 2 (Default blue)
// Color B = 3 (Default red)
const image_pixels = [
    [
        [1, 3, 3, 3, 3, 3, 3, 0],
        [3, 1, 1, 1, 1, 1, 3, 0],
        [3, 1, 1, 1, 1, 1, 3, 0],
        [3, 1, 1, 1, 1, 1, 3, 0],
        [3, 1, 1, 1, 1, 1, 3, 0],
        [3, 1, 1, 1, 1, 1, 3, 0],
        [3, 3, 3, 3, 3, 3, 3, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
        [1, 3, 3, 3, 3, 3, 3, 0],
        [3, 1, 1, 3, 3, 3, 3, 0],
        [3, 1, 3, 3, 3, 3, 3, 0],
        [3, 3, 3, 3, 3, 3, 3, 0],
        [3, 3, 3, 3, 3, 3, 3, 0],
        [3, 3, 3, 3, 3, 3, 3, 0],
        [3, 3, 3, 3, 3, 3, 3, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
    ],
];

// Add a Color A variant of the 2nd image
image_pixels.push(image_pixels[1].map(ar => ar.map(val => val == ColorPalette.COLOR_PALETTE_B ? ColorPalette.COLOR_PALETTE_A : val)));

// The statistics background pixeldata,
// As a ColorPalette array
let statistics_background_pixeldata = [[ColorPalette.COLOR_PALETTE_BLACK]];

class TetrisRenderer extends Component {
  images: Record<string, HTMLImageElement>;

  constructor(props) {
    super(props);

    let image_paths = {
        background_image: "images/tetris_background.png",
        numbers: "images/numbers.png",
    };

    this.images = {};
    for(let image_name in image_paths) {
        // Load the image
        let image = new Image();
        image.onload = () => {
            this.forceUpdate();
        };
        image.src = image_paths[image_name];
        // And save it
        this.images[image_name] = image;
    }

    let stats_image = new Image();
    stats_image.onload = () => {
        let tmp_canvas: HTMLCanvasElement = document.createElement('canvas');
        tmp_canvas.width = stats_image.width;
        tmp_canvas.height = stats_image.height;
        let tmp_ctx = tmp_canvas.getContext('2d');
        tmp_ctx.drawImage(stats_image, 0, 0);

        // Get pixeldata from the canvas
        let pixel_data = tmp_ctx.getImageData(0, 0, stats_image.width, stats_image.height).data;

        // Update statistics_background_pixeldata with colorpalette data
        statistics_background_pixeldata = Array(stats_image.height);
        for(let y = 0; y < stats_image.height; y++) {
            statistics_background_pixeldata[y] = Array(stats_image.width);
            for(let x = 0; x < stats_image.width; x++) {
                let red = pixel_data[4 * (y * stats_image.width + x) + 0] != 0;
                let blue = pixel_data[4 * (y * stats_image.width + x) + 2] != 0;

                let color_palette_value: ColorPalette;
                if (red && blue) {
                    color_palette_value = ColorPalette.COLOR_PALETTE_WHITE;
                } else if (red) {
                    color_palette_value = ColorPalette.COLOR_PALETTE_B;
                } else if (blue) {
                    color_palette_value = ColorPalette.COLOR_PALETTE_A;
                } else {
                    color_palette_value = ColorPalette.COLOR_PALETTE_BLACK;
                }
                statistics_background_pixeldata[y][x] = color_palette_value;
            }
        }

        this.forceUpdate();
    };
    stats_image.src = "images/statistics_background.png";

    this.state = {
      canvasRef: createRef(),
      canvasWidth: window.innerWidth * 0.8,
      canvasHeight: window.innerHeight,
    };
  }
  
  // Updates the canvas
  updateCanvas() {
    // How much to scale each pixel by
    const SCALING_FACTOR = 3;

    // Use canvasRef to get the canvas
    const canvasObj = this.state.canvasRef.current;
    const ctx = canvasObj.getContext('2d');

    // Render the provided number at the given x/y,
    // with the provided number of digits and colors
    const renderNumber = (x: number, y: number, digits: number, val: number, is_red: Boolean) => {
        const INPUT_NUMBER_WIDTH = 8;
        const OUTPUT_NUMBER_WIDTH = 8 * SCALING_FACTOR;

        // Populate the digits array, with the first `digits` digits
        // We truncate any leading digits that can't fit, so it will loop instead
        let actual_digits = [];
        while(actual_digits.length < digits) {
            actual_digits.push(val % 10);
            val = Math.floor(val / 10);
        }
        // Reverse the array so that it shows in order
        actual_digits.reverse();

        // Draw out all of the digits
        for(let i = 0; i < digits; i++) {
            ctx.drawImage(this.images.numbers, INPUT_NUMBER_WIDTH * actual_digits[i], (is_red ? INPUT_NUMBER_WIDTH : 0), INPUT_NUMBER_WIDTH, INPUT_NUMBER_WIDTH, x + OUTPUT_NUMBER_WIDTH * i, y, OUTPUT_NUMBER_WIDTH, OUTPUT_NUMBER_WIDTH);
        }
    }

    // The color palette to use for the tetris blocks
    const palette = [
        // Black
        [0, 0, 0],
        // White
        [255, 255, 255],
        // Color A
        nesColors[levelColors[this.props.tetris_state.level % levelColors.length][0]],
        // Color B
        nesColors[levelColors[this.props.tetris_state.level % levelColors.length][1]],
    ];

    // Create a canvas image, by filtering the 2D array by the palette
    const createPaletteImage = (data: number[][]): HTMLCanvasElement => {
        let height = data.length;
        let width = data[0].length;

        // Copy data into a new imagedata buffer, using the palette
        let new_image_data = ctx.createImageData(width, height);
        let new_data_buffer = new_image_data.data;
        for(let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                // RGBA
                new_data_buffer[4 * (y * width + x) + 0] = palette[data[y][x]][0];
                new_data_buffer[4 * (y * width + x) + 1] = palette[data[y][x]][1];
                new_data_buffer[4 * (y * width + x) + 2] = palette[data[y][x]][2];
                new_data_buffer[4 * (y * width + x) + 3] = 255;
            }
        }

        // Make a canvas to hold the new Image
        let new_canvas = document.createElement('canvas');
        let inner_ctx = new_canvas.getContext('2d');
        new_canvas.width = width;
        new_canvas.height = height;
        inner_ctx.putImageData(new_image_data, 0, 0);
        
        // Return the new canvas
        return new_canvas;
    };
  
    // Clear the drawing area
    ctx.clearRect(0, 0, this.state.canvasWidth, this.state.canvasHeight);
    ctx.imageSmoothingEnabled = false;

    // Draw the backround image
    ctx.drawImage(this.images.background_image, 0, 0, this.images.background_image.width * SCALING_FACTOR, this.images.background_image.height * SCALING_FACTOR);

    // Dimensions of the tetris blocks and play area
    let tetris_block_width = 8 * SCALING_FACTOR;
    let tetris_pixel = SCALING_FACTOR;
    let tetris_rect = {
        x: 95 * SCALING_FACTOR,
        y: 40 * SCALING_FACTOR,
        width: tetris_pixel + tetris_block_width * this.props.tetris_state.width,
        height: tetris_block_width * this.props.tetris_state.height,
    };

    // Create the tetris blocks
    let block_images = [];
    for(let image_datum of image_pixels) {
        block_images.push(createPaletteImage(image_datum));
    }
  
    // Clear out the playing area
    ctx.beginPath();
    ctx.fillStyle = 'black';
    ctx.rect(tetris_rect.x, tetris_rect.y, tetris_rect.width, tetris_rect.height);
    ctx.fill();

    // Draw each Tetris Block in the playing area
    let tetris_state: NESTetrisGame = this.props.tetris_state;
    for(let y = 0; y < 20; y++) {
      for(let x = 0; x < 10; x++) {
        let id = tetris_state.getRenderableBlock(x, y);
        if (id != 0) {
            // Draw an Image for the blocks
            ctx.drawImage(block_images[(id - 1) % block_images.length], tetris_rect.x + tetris_pixel + x * tetris_block_width, tetris_rect.y + y * tetris_block_width, tetris_block_width, tetris_block_width);
        }
      }
    }

    // Mark the 4x4 rectangle where the next piece will go
    let next_piece_rect = {
        x: 192 * SCALING_FACTOR,
        y: 104 * SCALING_FACTOR,
        width: tetris_block_width * 4, // 32
        height: tetris_block_width * 4, // 32
    };

    // How much to offset the piece, to place it correctly in the 4x4 grid
    let next_piece_offset = {
        x: next_piece_rect.x + tetris_block_width * 2,
        y: next_piece_rect.y + tetris_block_width,
    };
    
    // Get the width of the Next Piece
    let min_x = 10;
    let max_x = -10;
    for(let square_location of tetris_state.next_piece.getCells()) {
        let x = square_location[0];
        min_x = Math.min(min_x, x);
        max_x = Math.max(max_x, x);
    }
    let piece_width = max_x - min_x + 1;
    // For pieces that are three-wide in width,
    // it's offset by half a square, to center it
    if (piece_width == 3) {
        next_piece_offset.x -= tetris_block_width / 2;
    }

    // Draw the Next Piece itself
    for(let square_location of tetris_state.next_piece.getCells()) {
        let x = square_location[0];
        let y = square_location[1];
        let id = tetris_state.next_piece.abstractTetrisPiece.pieceID;

        ctx.drawImage(block_images[(id - 1) % block_images.length], next_piece_offset.x + x * tetris_block_width, next_piece_offset.y + y * tetris_block_width, tetris_block_width, tetris_block_width);
    }

    // Draw the statistics area
    let statistics_background_image = createPaletteImage(statistics_background_pixeldata);
    ctx.drawImage(statistics_background_image, 24 * SCALING_FACTOR, 83 * SCALING_FACTOR, statistics_background_image.width * SCALING_FACTOR, statistics_background_image.height * SCALING_FACTOR);

    // Draw the statistics numbers
    for(let i = 0; i < 7; i++) {
        renderNumber(48 * SCALING_FACTOR, 88 * SCALING_FACTOR + 16 * SCALING_FACTOR * i, 3, this.props.tetris_state.pieceCount[i], true);
    }

    // Number of Lines Cleared
    renderNumber(152 * SCALING_FACTOR, 16 * SCALING_FACTOR, 3, this.props.tetris_state.totalLinesCleared, false);
    // Top Score
    renderNumber(192 * SCALING_FACTOR, 32 * SCALING_FACTOR, 6, 180610, false);
    // Current Score
    renderNumber(192 * SCALING_FACTOR, 56 * SCALING_FACTOR, 6, this.props.tetris_state.score, false);
    // Current Level
    renderNumber(208 * SCALING_FACTOR, 160 * SCALING_FACTOR, 2, this.props.tetris_state.level, false);
  }
  
  componentDidMount(): void {
    // Update the canvas after the first render
    this.updateCanvas();
  } 
  
  componentDidUpdate(prevProps: Readonly<{}>, prevState: Readonly<{}>, snapshot?: any): void {
    // Update the canvas after every subsequent render
    this.updateCanvas();
  }
  
  render() {
    // Create the canvas element, but link it to canvasRef
    // so that updateCanvas() can access the element later
    return (
      <canvas
        className="tetris-canvas"
        ref={this.state.canvasRef}
        width={this.state.canvasWidth}
        height={this.state.canvasHeight}
      />
    );
  }
}

export default TetrisRenderer;
