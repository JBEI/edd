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
    Admin: "./src/Admin.ts",
    Common: "./src/Common.ts",
    Cytometry: "./src/Cytometry.ts",
    ExperimentDescHelp: "./src/Experiment-Desc-Help.ts",
    Export: "./src/Export.ts",
    GCMS_Workbench: "./src/GCMS_Workbench.ts",
    Import: "./src/Import.ts",
    Import2: "./src/Import2.tsx",
    index: "./src/index.ts",
    RNASeq: "./src/RNASeq.ts",
    Skyline_Convert: "./src/Skyline_Convert.ts",
    StudyData: "./src/Study-Data.ts",
    StudyLines: "./src/Study-Lines.ts",
    StudyLinesAddCombos: "./src/Study-Lines-Add-Combos.ts",
    StudyOverview: "./src/Study-Overview.ts",
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
      "react",
      "react-dom",
      "react-dropzone",
      "react-stepzilla",
      "react-stepzilla.css",
      "select2",
      "tinymce",
      "underscore"
    ]
  },
  output: {
    // TODO: this changes after re-org again, to '../server/main/static/dist'
    path: path.resolve(__dirname, '../main/static/dist'),
    filename: '[name].js',
    publicPath: '/static/dist/'
  },
  resolve: {
    modules: [
      "node_modules",
      path.resolve(__dirname, "modules")
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
      ),
      'react-stepzilla.css': path.resolve(
        __dirname,
        'node_modules/react-stepzilla/src/css/main.css'
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
