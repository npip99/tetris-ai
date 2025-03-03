import React, { Component, CSSProperties } from 'react';
import NavBar from '../components/NavBar';

const styles: Record<string, CSSProperties> = {
  root: {},

  main: {
    padding: "10pt 20pt",
  },
}

class Atoms extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <div style={styles.root}>
        <NavBar title="Atoms"/>
        <div style={styles.main}>
          <h1><i>Atom Simulator</i></h1>
          <p>V for Vectorfield, R for Reset</p>
          <br/>
        </div>
      </div>
    );
  }
}

export default Atoms;
