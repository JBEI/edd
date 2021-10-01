module.exports = {
    "clearMocks": true,
    "collectCoverage": true,
    "collectCoverageFrom": [
        "**/modules/**/*.{js,jsx,ts,tsx}",
        "**/src/**/*.{js,jsx,ts,tsx}",
        "!**/node_modules/**",
        "!**/*.d.ts",
    ],
    "coverageDirectory": ".coverage",
    "coveragePathIgnorePatterns": ["/node_modules/"],
    "moduleNameMapper": {
        "\\.(s?css|less)$": "identity-obj-proxy",
    },
    "preset": "ts-jest",
    "testEnvironment": "jsdom",
    "testMatch": null,
    "testRegex": ["(\\.|/)test\\.[jt]sx?$"],
    "testURL": "http://edd.lvh.me",
    "transform": {
        "^.+\\.(tsx?)$": "ts-jest",
    },
};
