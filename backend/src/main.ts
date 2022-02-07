import express from  'express';
import session from 'express-session';
import { NN } from 'tetris-ai';

let MyNN = new NN();

const PORT = 8081;

const app = express();

const secret = '0123456789';

// Format json response
app.set('json spaces', 2);
// Get POST/GETs as JSON
app.use(express.json());
// Does a few other useful things
app.use(express.urlencoded({extended: true}));
// Session handling
app.use(session({
	resave: true,
	saveUninitialized: true,
	secret: secret,
	// Including behind Cloudeflare proxy
	proxy: true,
}));

// Allow Cross Origin Requests, this is an API
app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.get('/test', async function(req, res) {
  console.log("TEST HIT!")
});

app.listen(PORT, () => {
  console.log("NodeJS Backend running on port " + PORT);
});
