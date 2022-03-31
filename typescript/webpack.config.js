/**
 * Created by tlopez on 6/13/17.
 */
/* eslint @typescript-eslint/no-var-requires: off */
// NOTE: to get a path relative to package.json, use path.resolve("node_modules")
//  to get a path relative to webpack.config.js, use path.resolve(__dirname, "rel/path")
const path = require("path");
const webpack = require("webpack");

const ESLintPlugin = require("eslint-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const eslint = new ESLintPlugin({
    "extensions": ["js", "jsx", "ts", "tsx"],
    // uncomment below to do auto-fix in local builds
    // "fix": true,
});
const css_extract = new MiniCssExtractPlugin({
    "allChunks": true,
    "chunkFilename": "[name].css",
    "filename": "styles.css",
});

module.exports = {
    "entry": {
        "Admin": path.resolve(__dirname, "./src/Admin.ts"),
        "Campaign": path.resolve(__dirname, "./src/Campaign.ts"),
        "CampaignIndex": path.resolve(__dirname, "./src/Campaign-Index.ts"),
        "Common": [
            path.resolve("node_modules/bootstrap/dist/js/bootstrap"),
            path.resolve("node_modules/bootstrap/dist/css/bootstrap.min.css"),
            path.resolve("node_modules/@fortawesome/fontawesome-free/js/all.min.js"),
            path.resolve("node_modules/@fortawesome/fontawesome-free/css/all.min.css"),
            path.resolve(__dirname, "./src/Common.ts"),
        ],
        "ExperimentDescHelp": path.resolve(__dirname, "./src/Experiment-Desc-Help.ts"),
        "Export": path.resolve(__dirname, "./src/Export.ts"),
        "Import": path.resolve(__dirname, "./src/Import.ts"),
        "index": path.resolve(__dirname, "./src/index.ts"),
        "LoadWizard": [
            "react",
            "react-dom",
            "react-dropzone",
            "react-stepzilla",
            "react-stepzilla.css",
            path.resolve(__dirname, "./src/LoadWizard.tsx"),
        ],
        "Login": path.resolve(__dirname, "./src/Login.ts"),
        "StudyData": path.resolve(__dirname, "./src/Study-Data.ts"),
        "StudyLines": path.resolve(__dirname, "./src/Study-Lines.ts"),
        "StudyLinesAddCombos": path.resolve(
            __dirname,
            "./src/Study-Lines-Add-Combos.ts",
        ),
        "StudyOverview": path.resolve(__dirname, "./src/Study-Overview.ts"),
        "WizardHelp": path.resolve(__dirname, "./src/WizardHelp.ts"),
    },
    "output": {
        "filename": "[name].js",
        "path": path.resolve("dist"),
        "publicPath": "/static/dist/",
    },
    "optimization": {
        "splitChunks": {
            "cacheGroups": {
                "vendor": {
                    "chunks": "all",
                    "name": "vendor",
                    "test": /[\\/]node_modules[\\/](?!react*).*/,
                },
            },
        },
    },
    "resolve": {
        "modules": [path.resolve("node_modules"), path.resolve(__dirname, "modules")],
        "extensions": [".js", ".json", ".jsx", ".css", ".ts", ".tsx", ".vue"],
        "alias": {
            "handsontable": path.resolve(
                "node_modules/handsontable/dist/handsontable.full.js",
            ),
            "handsontable.css": path.resolve(
                "node_modules/handsontable/dist/handsontable.full.css",
            ),
            "react-stepzilla.css": path.resolve(
                "node_modules/react-stepzilla/src/css/main.css",
            ),
        },
    },
    "module": {
        "rules": [
            // define loader for Typescript files
            {
                "test": /\.tsx?$/,
                "loader": "ts-loader",
            },
            // define loader for stylesheets
            {
                "test": /\.css$/,
                "use": [MiniCssExtractPlugin.loader, "css-loader"],
            },
            // define loader for images
            {
                "test": /\.(jpe?g|png|gif|ico)$/,
                "loader": "file-loader",
            },
            // define loader for fonts, etc
            {
                "test": /\.(woff|woff2|eot|ttf|svg)$/,
                "loader": "url-loader",
                "options": {
                    "limit": 8192,
                },
            },
        ],
        "noParse": [/handsontable\.full(\.min)?\.js/],
    },
    "devtool": "source-map",
    "plugins": [
        eslint,
        new webpack.DefinePlugin({
            "process.env.NODE_ENV": '"production"',
        }),
        new webpack.ProvidePlugin({
            "jQuery": "jquery",
            "$": "jquery",
            "window.jQuery": "jquery",
            "window.$": "jquery",
        }),
        css_extract,
    ],
};
