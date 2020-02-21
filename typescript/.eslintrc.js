module.exports = {
    "env": {
        "browser": true,
        "node": true,
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "edd/typescript/tsconfig.json",
        "ecmaVersion": 6,
        "sourceType": "module",
        "ecmaFeatures": {
            "modules": true,
        },
    },
    "plugins": ["@typescript-eslint", "react"],
    "extends": ["plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
    "rules": {
        // Severity should be one of the following: 0 = off, 1 = warn, 2 = error

        // -----
        // The rules below are moved out of alpha-order
        // and should be switched from off -> warn to fix eventually
        // then from warn -> error to enforce
        // -----
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-unused-vars": [
            "warn",
            {
                "args": "none",
            },
        ],
        "no-var": "warn",
        "prefer-spread": "off",
        // -----
        // The rules here should eventually be modified
        // -----
        "@typescript-eslint/no-use-before-define": "off", // : ["warn", "nofunc"]
        // -----
        // The rules here should stick around
        // -----
        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/array-type": "warn",
        "@typescript-eslint/ban-types": "error",
        "@typescript-eslint/camelcase": "off",
        "@typescript-eslint/class-name-casing": "error",
        "@typescript-eslint/consistent-type-assertions": "error",
        "@typescript-eslint/explicit-member-accessibility": [
            "off",
            {
                "accessibility": "explicit",
            },
        ],
        "@typescript-eslint/interface-name-prefix": "off",
        "@typescript-eslint/member-ordering": "off",
        "@typescript-eslint/no-empty-function": "error",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "error",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-for-of": "warn",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/quotes": "off",
        "@typescript-eslint/triple-slash-reference": "error",
        "@typescript-eslint/unified-signatures": "error",
        "camelcase": "off",
        "comment-format": "off",
        "complexity": "off",
        "constructor-super": "error",
        "dot-notation": "warn",
        "eqeqeq": ["error", "smart"],
        "guard-for-in": "error",
        "id-blacklist": "off",
        "id-match": "off",
        "max-classes-per-file": "off",
        "max-len": [
            "warn",
            {
                "code": 99,
                "ignoreUrls": true,
            },
        ],
        "new-parens": "error",
        "no-bitwise": "error",
        "no-caller": "error",
        "no-cond-assign": "error",
        "no-console": "warn",
        "no-debugger": "error",
        "no-empty": "error",
        "no-eval": "error",
        "no-fallthrough": "off",
        "no-invalid-this": "off",
        "no-multiple-empty-lines": "off",
        "no-new-wrappers": "error",
        "no-prototype-builtins": "error",
        "no-shadow": [
            "error",
            {
                "hoist": "all",
            },
        ],
        "no-throw-literal": "warn",
        "no-trailing-spaces": "error",
        "no-undef-init": "error",
        "no-underscore-dangle": "off",
        "no-unsafe-finally": "error",
        "no-unused-expressions": "error",
        "no-unused-labels": "error",
        "no-unused-vars": "off",
        "object-shorthand": "off",
        "one-var": ["off", "never"],
        "prefer-arrow/prefer-arrow-functions": "off",
        "prefer-const": "error",
        "quote-props": ["error", "always"],
        "radix": "error",
        "react/jsx-uses-react": "error",
        "react/jsx-uses-vars": "error",
        "space-before-function-paren": "off",
        "spaced-comment": "off",
        "use-isnan": "error",
        "valid-typeof": "off",
    },
};
