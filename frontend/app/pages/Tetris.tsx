import React, { Component, CSSProperties, createRef, useEffect } from 'react';
import NavBar from '../components/NavBar';
import { NESTetrisGame } from 'tetris-game';
import TetrisRenderer from '../components/TetrisRenderer';

const styles: Record<string, CSSProperties> = {
  root: {},

  main: {
    margin: "0",
    padding: "10pt 20pt",
    width: "80%",
    height: "100%",
  },

  levelSelect: {
    width: "50px",
    textIndent: "10px",
  },
};

class Tetris extends Component {
  current_keypresses: Record<string, Boolean>;

  constructor(props) {
    super(props);
    this.state = {
      tetris_state: new NESTetrisGame(7),
      paused: false,
    };

    this.current_keypresses = {};

    const NES_FPS = 60.0988;

    let number_of_frames = 0;
    let start_of_timer = -1;

    const nes_tetris_frame = () => {
      // Track FPS every 10 seconds
      if (start_of_timer == -1 || performance.now() - start_of_timer > 10 * 1000.0) {
        start_of_timer = performance.now();
        number_of_frames = 0;
      }
      let current_fps = number_of_frames / ((performance.now() - start_of_timer) / 1000.0);
      if (number_of_frames > 10 && current_fps > NES_FPS) {
        // Hmm our FPS is too high, try again later
        setTimeout(nes_tetris_frame, 1);
        return;
      }
      number_of_frames++;

      // Use setState to propagate to TetrisRenderer
      this.setState((state, props) => {
        let tetris_state = state.tetris_state;

        // Go through all the current keypresses,
        for(let key in this.current_keypresses) {
          // If the key is pressed, pass it to the tetris state
          if (this.current_keypresses[key]) {
            switch(key) {
              case 'ArrowLeft':
                tetris_state.pressLeft();
                break;
              case 'ArrowRight':
                tetris_state.pressRight();
                break;
              case 'ArrowDown':
                tetris_state.pressDown();
                break;
              case 'z':
                tetris_state.pressCCW();
                break;
              case 'x':
                tetris_state.pressCW();
                break;
            }
          }
        }

        // Iterate the tetris state
        if (!state.paused) {
          tetris_state.iterate();
        }
        return {
          tetris_state
        };
      });

      // Call the next NES Frame when we get a VSYNC
      window.requestAnimationFrame(nes_tetris_frame);
    };

    // Call the first NES frame to start
    window.requestAnimationFrame(nes_tetris_frame);
  }

  onLoseFocus() {
    this.setState(() => {
      return {
        paused: true,
      }
    });
  }

  onNewLevel(e) {
    this.setState(() => {
      return {
        paused: false,
        tetris_state: new NESTetrisGame(e.target.value),
      };
    });
  }

  onKeyDown(e) {
    switch(e.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowDown':
    case 'z':
    case 'x':
      e.preventDefault();
      this.current_keypresses[e.key] = true;
      break;
    case 'Enter':
      e.preventDefault();
      this.setState((state, props) => {
        return {
          paused: !state.paused,
        };
      });
      break;
    default:
      break;
    }
  }

  onKeyUp(e) {
    switch(e.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowDown':
    case 'z':
    case 'x':
      e.preventDefault();
      this.current_keypresses[e.key] = false;
      break;
    default:
      break;
    }
  }

  render() {
    return (
      <div style={styles.root}>
        <NavBar title="Tetris"/>
        <div style={styles.main}>
          <h1>Tetris Page!</h1>
          <p>
            Level:&nbsp;
            <select name="level" id="level-select" style={styles.levelSelect} onChange={this.onNewLevel.bind(this)}>
              {Array(20).fill(0).map((val, i) => <option value={i}>{i}</option>)}
            </select>
          </p>
          <div
            onKeyDown={this.onKeyDown.bind(this)}
            onKeyUp={this.onKeyUp.bind(this)}
            onBlur={this.onLoseFocus.bind(this)}
            tabIndex={-1}
          >
            <TetrisRenderer tetris_state={this.state.tetris_state} paused={this.state.paused}/>
          </div>
        </div>
      </div>
    );
  }
}

export default Tetris;
