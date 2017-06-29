/**
 * Created by tlopez on 6/13/17.
 */

var path = require('path');
var webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
  entry: {
    ExperimentDescHelp: "./code/typescript/src/Experiment-Desc-Help.ts",
    Export: "./code/typescript/src/Export.ts",
    Import: "./code/typescript/src/Import.ts",
    index: "./code/typescript/src/index.ts",
    RNASeq: "./code/typescript/src/RNASeq.ts",
    StudyData: "./code/typescript/src/Study-Data.ts",
    StudyLines: "./code/typescript/src/Study-Lines.ts",
    StudyOverview: "./code/typescript/src/Study-Overview.ts"
  },
  output: {
    path: path.resolve(__dirname, './code/main/static/dist'),
    filename: '[name].js',
    publicPath: '/static/dist/'
  },
  resolve: {
    modules: [
      "node_modules",
      path.resolve(__dirname, "code/typescript/modules")
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
