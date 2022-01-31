import React, { Component, CSSProperties, createRef, useEffect } from 'react';
import NavBar from '../components/NavBar';
import { NESTetrisGame } from 'tetris-game';
import TetrisRenderer from '../components/TetrisRenderer';

const styles: Record<string, CSSProperties> = {
  root: {},

  main: {
    margin: "0",
    padding: "10pt 20pt",
    width: "100%",
    height: "100%",

    boxShadow: "0px 3px 5px 0px #ddd, 10px 3px 5px 0px #ddd, -10px 3px 5px 0px #ddd",
  },
};

class Tetris extends Component {
  current_keypresses: Record<string, Boolean>;

  constructor(props) {
    super(props);
    this.state = {
      tetris_state: new NESTetrisGame(4),
    };

    this.current_keypresses = {};

    let interval_iterate = setInterval(() => {
      this.setState((state, props) => {
        let tetris_state = this.state.tetris_state;

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
        tetris_state.iterate();
        return {
          tetris_state
        };
      });
    }, 16.66);
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
          <div
            onKeyDown={this.onKeyDown.bind(this)}
            onKeyUp={this.onKeyUp.bind(this)}
            tabIndex={-1}
          >
            <TetrisRenderer tetris_state={this.state.tetris_state}/>
          </div>
        </div>
      </div>
    );
  }
}

export default Tetris;
