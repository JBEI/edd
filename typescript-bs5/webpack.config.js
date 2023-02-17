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
    "chunkFilename": "[name].css",
    "filename": "[name].css",
    "ignoreOrder": false,
});

module.exports = {
    "entry": {
        "common": [
            path.resolve("node_modules/@fortawesome/fontawesome-free/js/all.min.js"),
            path.resolve("node_modules/@fortawesome/fontawesome-free/css/all.min.css"),
            path.resolve(__dirname, "./src/common.ts"),
        ],
        "index": path.resolve(__dirname, "./src/index.ts"),
        "login": path.resolve(__dirname, "./src/login.ts"),
        "overview": path.resolve(__dirname, "./src/overview.ts"),
    },
    "output": {
        "filename": "[name].js",
        "path": path.resolve("dist"),
        "publicPath": "/static/bs5/",
    },
    "optimization": {
        "splitChunks": {
            "cacheGroups": {
                "defaultVendors": {
                    "chunks": "all",
                    "name": "vendor",
                    "test": /[\\/]node_modules[\\/](?!react*).*/,
                },
            },
        },
    },
    "resolve": {
        "modules": [path.resolve("node_modules")],
        "extensions": [".js", ".json", ".jsx", ".css", ".ts", ".tsx", ".vue"],
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
                "test": /\.(woff|woff2|ttf)$/i,
                "type": "asset",
                "dependency": { "not": ["url"] },
            },
        ],
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
