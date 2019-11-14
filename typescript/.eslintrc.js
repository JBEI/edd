module.exports = {
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "edd/typescript/tsconfig.json",
        "ecmaVersion": 6,
        "sourceType": "module",
        "ecmaFeatures": {
            "modules": true,
        },
    },
    "plugins": ["@typescript-eslint/tslint"],
    "extends": ["plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
    "rules": {
        // Severity should be one of the following: 0 = off, 1 = warn, 2 = error

        // line length
        "max-len": [
            1,
            {
                "code": 99,
                "ignoreUrls": true,
            },
        ],
        // -----
        // The rules here should eventually go away
        // -----
        // warn only for use of 'var' keyword (for now)
        "no-var": 1,
        // warn only for not using const
        "prefer-const": 1,
        // disable errors for using Function.apply()
        "prefer-spread": 0,
        // types stuff
        "@typescript-eslint/explicit-function-return-type": 0,
        "@typescript-eslint/no-explicit-any": 0,
        "@typescript-eslint/no-unused-vars": [0, { "args": "none" }],
        // -----
        // The rules here should eventually be modified
        // -----
        // disable use-before-define for functions
        //"@typescript-eslint/no-use-before-define": [1, "nofunc"],
        "@typescript-eslint/no-use-before-define": 0,
        // -----
        // The rules here should stick around
        // -----
        // disable checks on camelCase
        "@typescript-eslint/camelcase": 0,
        // ignore naming nitpicks on interfaces
        "@typescript-eslint/interface-name-prefix": 0,
        // we are ok with empty interfaces
        "@typescript-eslint/no-empty-interface": 0,
        // consistent quote characters
        "quotes": [1, "double", { "avoidEscape": true }],
        // require quotes on object literals
        "quote-props": [1, "always"],
    },
};
