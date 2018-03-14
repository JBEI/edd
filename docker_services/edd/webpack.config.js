/**
 * Created by tlopez on 6/13/17.
 */

var path = require('path');
var webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

var css_extract = new ExtractTextPlugin({
  "filename": "styles.css",
  "disable": false,
  "allChunks": true
});

module.exports = {
  entry: {
    Admin: "./code/typescript/src/Admin.ts",
    Cytometry: "./code/typescript/src/Cytometry.ts",
    ExperimentDescHelp: "./code/typescript/src/Experiment-Desc-Help.ts",
    Export: "./code/typescript/src/Export.ts",
    GCMS_Workbench: "./code/typescript/src/GCMS_Workbench.ts",
    Import: "./code/typescript/src/Import.ts",
    index: "./code/typescript/src/index.ts",
    Notification: "./code/typescript/src/Notification.ts",
    RNASeq: "./code/typescript/src/RNASeq.ts",
    Skyline_Convert: "./code/typescript/src/Skyline_Convert.ts",
    StudyData: "./code/typescript/src/Study-Data.ts",
    StudyLines: "./code/typescript/src/Study-Lines.ts",
    StudyLinesAddCombos: "./code/typescript/src/Study-Lines-Add-Combos.ts",
    StudyOverview: "./code/typescript/src/Study-Overview.ts",
    vendor: [
      "bootstrap",
      "d3",
      "dropzone",
      "handsontable",
      "handsontable.css",
      "jquery",
      "jquery-ui",
      "jquery.cookie",
      "qtip2",
      "select2",
      "tinymce",
      "underscore"
    ]
  },
  output: {
    path: path.resolve(__dirname, 'code/main/static/dist'),
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
        use: css_extract.extract({
          fallback: "style-loader",
          use: "css-loader"
        })
      },
      // define loader for images
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        loader: 'file-loader'
      },
      // define loader for fonts, etc
      {
        test: /\.(woff|woff2|eot|ttf|svg)$/,
        loader: 'url-loader',
        options: {
          limit: 8192
        }
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
    css_extract,
    new webpack.optimize.CommonsChunkPlugin({
      "name": "vendor",
      "filename": "vendor.js",
      "minChunks": 2
    })
  ]
};
