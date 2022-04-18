# EDD Pa11y

This script runs accessibility tests against a webpage, produces a report, and optionally throws an error if any issues exist.

## Setup

`npm install` or `yarn`

Copy the `.env.example` to `.env`. Environment variables are:

-   `EDD_USERNAME`: (required) the username to log into the platform
-   `EDD_PASSWORD`: (required) the password to log into the platform
-   `EDD_HOMEPAGE_URL`: (required) the URL to platform's homepage
-   `EDD_STUDY_URI`: the URI to a study that tests with be run against
-   `EDD_IMPORT_DATA_URI`: the URI to the import data form

`node index.js`

## Arguments

Available arguments are:

-   `action=`: which set of actions to perform before running the test. Defaults to all actions.
-   `includeNotices`: whether to test for notices, low-level accessibility guidelines. Defaults to false.
-   `includeWarnings`: whether to test for warnings, mid-level accessibility guidelines. Defaults to false.
-   `listActions`: whether to list the available sets of actions, and quit. Defaults to false.
-   `suppressErrors`: whether an error should not be thrown if any issues are found. Defaults to false.
-   `useAxe`: whether to include [Axe](https://www.axe-core.org/) as a test runner as well as [HTML CodeSniffer](https://squizlabs.github.io/HTML_CodeSniffer/). Defaults to false; HTML CodeSniffer will still be used.

## Actions

Actions are the steps that are taken in the headless Chrome instance before a test is run. No action is required to test the homepage. From there, however, logging in, navigating, clicking, etc., might be necessary to bring the page to the desired state to test.

Actions are written to the `actions.js` and are formatted according to the [pa11y documentation](https://github.com/pa11y/pa11y#actions).

To see a list of available actions, include the `listActions` argument.
