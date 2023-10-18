import React, { Component, CSSProperties } from 'react';
import NavBar from '../components/NavBar';

const styles: Record<string, CSSProperties> = {
  root: {},

  main: {
    padding: "10pt 20pt",
  },
}

class NotFound extends Component {
  render() {
    return (
      <div style={styles.root}>
        <NavBar/>
        <div style={styles.main}>
          <h2>Error 404: Not Found</h2>
          <p><a href="/home">Return Home</a></p>
        </div>
      </div>
    );
  }
}

export default NotFound;
