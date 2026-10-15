const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { container } = require('webpack');

const { ModuleFederationPlugin } = container;
const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  entry: './src/index.js',
  output: {
    publicPath: 'auto',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  devServer: {
    port: 3000,
    historyApiFallback: true,
    hot: true
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: [isProd ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader']
      }
    ]
  },
  optimization: {
    minimizer: ['...', new CssMinimizerPlugin()]
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'frontend_shell',
      remotes: {
        auth_mfe: 'auth_mfe@http://localhost:3001/remoteEntry.js',
        catalog_mfe: 'catalog_mfe@http://localhost:3002/remoteEntry.js',
        checkout_mfe: 'checkout_mfe@http://localhost:3003/remoteEntry.js',
        orders_mfe: 'orders_mfe@http://localhost:3004/remoteEntry.js'
      },
      shared: {
        react: { singleton: true, eager: true, requiredVersion: false },
        'react-dom': { singleton: true, eager: true, requiredVersion: false },
        'react-router-dom': { singleton: true, eager: true, requiredVersion: false }
      }
    }),
    new HtmlWebpackPlugin({ template: './public/index.html' }),
    new MiniCssExtractPlugin()
  ]
};
