import React, { Component, CSSProperties } from 'react';
import Colors from '../constants/colors';

const styles: Record<string, CSSProperties> = {
  root: {
    margin: "0",
    width: "100%",
    height: "65pt",
    display: "flex",
    alignItems: "center",

    boxShadow: "0px 3px 5px 0px #ddd, 10px 3px 5px 0px #ddd, -10px 3px 5px 0px #ddd",
  },

  logo: {
    fontFamily: "Orbitron",
    color: Colors.primary,
    margin: "0px 25px",
    fontSize: "1.5em",
  },

  left: {
  },

  right: {
    flexGrow: 1,

    display: "flex",
    marginRight: "15pt",
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  navbar_option: {
    marginLeft: "15pt",
    marginRight: "15pt",
  },

  navbar_title: {
    fontFamily: "CenturyGothic, sans-serif",
    fontWeight: "normal",
    fontSize: "15pt",
    textTransform: "uppercase",
  },

  navbar_selected: {
    color: Colors.primary,
  },

  navbar_link: {
    textDecoration: "inherit",
    color: "inherit",
  },
};

class NavBar extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    let navbar_items = [
      {
        title: "Home",
        link: "/home",
      },
      {
        title: "About",
        link: "/about",
      },
    ];

    return (
      <div style={styles.root}>
        <div style={styles.left}>
          <div>
            <h2 style={styles.logo}>Tetris AI</h2>
          </div>
        </div>
        <div style={styles.right}>
        {navbar_items.map(navbar_item => {
          const title_style = Object.assign({}, styles.navbar_title, navbar_item.title == this.props.title ? styles.navbar_selected : {});
          return (
            <div style={styles.navbar_option} key={navbar_item.title}>
              <h1 style={title_style}><a style={styles.navbar_link} href={navbar_item.link}>{navbar_item.title}</a></h1>
            </div>
          );
        })}
        </div>
      </div>
    );
  }
}

export default NavBar;
