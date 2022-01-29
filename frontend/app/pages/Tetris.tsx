import React, { Component, CSSProperties } from 'react';
import NavBar from '../components/NavBar';
import { TetrisState } from 'tetris-game';

const styles: Record<string, CSSProperties> = {
  root: {},

  main: {
    margin: "0",
    padding: "10pt 20pt",
    width: "100%",
    height: "305pt",

    boxShadow: "0px 3px 5px 0px #ddd, 10px 3px 5px 0px #ddd, -10px 3px 5px 0px #ddd",
  },
};

class TetrisRenderer extends Component {
  render() {
    let rows = [];

    console.log("RERENDER");

    let tetris_state: TetrisState = this.props.tetris_state;
    for(let y = 0; y < 20; y++) {
      let res = "";
      for(let x = 0; x < 10; x++) {
        res += tetris_state.getRenderableBlock(x, y) + " ";
      }
      rows.push((
        <p>
          {res}
        </p>
      ));
    }

    return (
      <p>
        {rows}
      </p>
    );
  }
}

class Tetris extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tetris_state: new TetrisState(),
    };
  }

  on_left() {
    this.setState((state, props) => {
      state.tetris_state.left();
      return {
        tetris_state: state.tetris_state,
      };
    });
  }

  on_right() {
    this.setState((state, props) => {
      state.tetris_state.right();
      return {
        tetris_state: state.tetris_state,
      };
    });
  }

  on_ccw() {
    this.setState((state, props) => {
      state.tetris_state.rotateCCW();
      return {
        tetris_state: state.tetris_state,
      };
    });
  }

  on_cw() {
    this.setState((state, props) => {
      state.tetris_state.rotateCW();
      return {
        tetris_state: state.tetris_state,
      };
    });
  }

  on_down() {
    this.setState((state, props) => {
      state.tetris_state.drop();
      return {
        tetris_state: state.tetris_state,
      };
    });
  }

  render() {
    return (
      <div style={styles.root}>
        <NavBar title="Tetris"/>
        <div style={styles.main}>
          <h1>Tetris Page!</h1>
          <button onClick={this.on_left.bind(this)}>Left</button>
          <button onClick={this.on_right.bind(this)}>Right</button>
          <button onClick={this.on_ccw.bind(this)}>CCW</button>
          <button onClick={this.on_cw.bind(this)}>CW</button>
          <button onClick={this.on_down.bind(this)}>Down</button>
          <TetrisRenderer tetris_state={this.state.tetris_state}/>
        </div>
      </div>
    );
  }
}

export default Tetris;
