module.exports = {
    "overrides": [
        // all markdown is already wrapped before 100, keep consistent
        {
            "files": "*.md",
            "options": {
                "printWidth": 99,
            },
        },
        // html is already (mostly) using two-space indents
        {
            "files": "*.html",
            "options": {
                "tabWidth": 2,
            },
        },
        // yaml is also (mostly) using two-space indents
        {
            "files": ["*.yml", "*.yaml"],
            "options": {
                "tabWidth": 2,
            },
        },
    ],
    // prettier removes parens from single-argument arrow functions
    // and AFAICT, this is the *only* case where parens on arrow functions are optional
    // so let's not do that and keep consistency
    "arrowParens": "always",
    // consistent with black / python code
    "printWidth": 88,
    // eslint set to always quote props,
    // so prettier must preserve
    "quoteProps": "preserve",
    // default is 2, we already used 4 everywhere
    "tabWidth": 4,
    // always use trailing commas where possible
    "trailingComma": "all",
};
