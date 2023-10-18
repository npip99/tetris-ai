import React, { Component, CSSProperties } from 'react';
import NavBar from '../components/NavBar';

const styles: Record<string, CSSProperties> = {
  root: {},

  main: {
    padding: "10pt 20pt",
  },
}

class About extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <div style={styles.root}>
        <NavBar title="About"/>
        <div style={styles.main}>
          <h1>About Page!</h1>
          <p>This is the about page</p>
        </div>
      </div>
    );
  }
}

export default About;
