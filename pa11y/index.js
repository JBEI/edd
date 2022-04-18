import "dotenv/config";
import pa11y from "pa11y";
import allActions from "./actions.js";
import { logIssues, processSummary, updateSummary } from "./utilities.js";

const allowedArguments = [
    "action",
    "ignore",
    "includeNotices",
    "includeWarnings",
    "listActions",
    "suppressErrors",
    "useAxe",
];

let args = {};

process.argv.forEach((argument) => {
    const [key, value] = argument.split("=");
    if (allowedArguments.includes(key)) {
        args[key] = value || true;
    }
});

if (args.listActions) {
    Object.keys(allActions).map((key) => console.log(key));
    process.exit();
}

const getRunners = () => {
    let runners = ["htmlcs"];
    if (args.useAxe) {
        runners.push("axe");
    }
    return runners;
};

const testWithActions = async (name, actions) => {
    // retries if a timeout exception is thrown
    try {
        const runners = getRunners();
        const results = await pa11y(`${process.env.EDD_HOMEPAGE_URL}${actions.url}`, {
            runners,
            includeWarnings: args.includeWarnings == "true" || false,
            includeNotices: args.includeNotices == "true" || false,
            actions: actions.actions,
        });
        logIssues(results, name);
        summary = updateSummary(results, summary);
    } catch (e) {
        testWithActions(name, actions, summary);
    }
};

const validateActions = (actions) => {
    if (args.action && !actions.includes(args.action)) {
        throw `No such action exists: ${args.action}`;
    }
};

validateActions(Object.keys(allActions));

// either pass in the variable name of actions to test, or test all actions
const actionsToTest = args.action
    ? { [args.action]: allActions[args.action] }
    : allActions;

// removes a warning about max listeners when there are > 10
process.setMaxListeners(0);

let summary = {};

await Promise.all(
    Object.entries(actionsToTest).map(([name, actions]) =>
        testWithActions(name, actions),
    ),
);

processSummary(summary, args.suppressErrors);
