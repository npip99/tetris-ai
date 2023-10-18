import React, { Component, CSSProperties } from 'react';
import NavBar from '../components/NavBar';

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

class Home extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <div style={styles.root}>
        <NavBar title="Home"/>
        <div style={styles.main}>
          <h1>Home Page!</h1>
          <p>This is the home page</p>
        </div>
      </div>
    );
  }
}

export default Home;
