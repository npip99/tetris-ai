import React, { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import {
  BrowserRouter,
  Switch,
  Route,
  Redirect
} from "react-router-dom";
import Home from './pages/Home';
import About from './pages/About';
import NotFound from './pages/NotFound';

const root_style: CSSProperties = {
  fontFamily: "Sans-Serif",
  margin: "0px",
};

ReactDOM.render(
  <div style={root_style}>
    <BrowserRouter>
      <Switch>
        <Redirect exact from="/" to="/home"/>
        <Route exact path="/home" component={Home}/>
        <Route exact path="/about" component={About}/>
        <Route component={NotFound}/>
      </Switch>
    </BrowserRouter>
  </div>,
  document.getElementById('root'),
);
