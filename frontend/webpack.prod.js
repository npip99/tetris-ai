let HTMLWebpackPlugin = require('html-webpack-plugin');
let HTMLWebpackPluginConfig = new HTMLWebpackPlugin({
  template: __dirname + '/app/index.html',
  filename: 'index.html',
  inject: 'body',
});
let CopyWebpackPlugin = require('copy-webpack-plugin');
let CopyWebpackPluginConfig = new CopyWebpackPlugin({
  patterns: [
    {from:'assets', to:'assets'}
  ],
});

module.exports = {
  mode: 'production',
  devtool: 'sourcemap',
  entry: __dirname + '/app/index.tsx',
  module: {
    rules: [
      {
        test: /\.tsx$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.js']
  },
  output: {
    path: __dirname + '/build',
    filename: 'js/bundle.js',
  },
  devServer: {
    historyApiFallback: true,
    publicPath: '/',
  },
  plugins: [
    HTMLWebpackPluginConfig,
    CopyWebpackPluginConfig
  ],
};

