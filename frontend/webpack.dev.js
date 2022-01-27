const path = require('path');
const HTMLWebpackPlugin = require('html-webpack-plugin');
const HTMLWebpackPluginConfig = new HTMLWebpackPlugin({
  template: __dirname + '/app/index.html',
  filename: 'index.html',
  inject: 'body',
});
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CopyWebpackPluginConfig = new CopyWebpackPlugin({
  patterns: [
    {from:'images', to:'images', noErrorOnMissing: true}
  ],
});

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: __dirname + '/app/index.tsx',
  module: {
    rules: [
      {
        test: /\.tsx$/,
        include: __dirname + '/app',
        use: ['babel-loader'],
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
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        pathRewrite: { '^/api': '' },
      }
    },
    historyApiFallback: true,
    allowedHosts: 'all',
  },
  plugins: [
    HTMLWebpackPluginConfig,
    CopyWebpackPluginConfig
  ],
};

