/**
 * Created by tlopez on 6/13/17.
 */

var path = require('path');
var webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
  entry: {
    ExperimentDescHelp: "./edd/typescript/src/Experiment-Desc-Help.ts",
    Export: "./edd/typescript/src/Export.ts",
    Import: "./edd/typescript/src/Import.ts",
    index: "./edd/typescript/src/index.ts",
    RNASeq: "./edd/typescript/src/RNASeq.ts",
    StudyData: "./edd/typescript/src/Study-Data.ts",
    StudyLines: "./edd/typescript/src/Study-Lines.ts",
    StudyOverview: "./edd/typescript/src/Study-Overview.ts"
  },
  output: {
    path: path.resolve(__dirname, './edd/main/static/dist'),
    filename: '[name].js'
  },
  resolve: {
    modules: [
      "node_modules",
      path.resolve(__dirname, "edd/typescript/modules")
    ],
    extensions: ['.js', '.json', '.jsx', '.css', '.ts', '.vue'],
    alias: {
      'handsontable': path.resolve(
        __dirname,
        'node_modules/handsontable/dist/handsontable.full.js'
      ),
      'handsontable.css': path.resolve(
        __dirname,
        'node_modules/handsontable/dist/handsontable.full.css'
      )
    }
  },
  module: {
    rules: [
      // define loader for Typescript files
      {
        test: /\.tsx?$/,
        loader: 'ts-loader'
      },
      // define loader for stylesheets
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          fallback: "style-loader",
          use: "css-loader"
        })
      },
      // define loader for images
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        loader: 'file-loader'
      }
    ],
    noParse: [
      /handsontable\.full(\.min)?\.js/
    ]
  },
  devtool: 'source-map',
  plugins: [
    new webpack.ProvidePlugin({
      "jQuery": "jquery",
      "$": "jquery",
      "window.jQuery": "jquery",
      "window.$": "jquery"
    }),
    new ExtractTextPlugin("styles.css")
  ]
};
