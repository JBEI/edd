import "colors";

const typeColors = {
    "notice": "green",
    "warning": "yellow",
    "error": "red",
};

export const getArguments = (allowedArguments) => {
    let args = {};

    process.argv.forEach((argument) => {
        const [key, value] = argument.split("=");
        if (allowedArguments.includes(key)) {
            args[key] = value || true;
        }
    });

    return args;
};

const formatIssueHeader = (index, issue, name) => {
    return `${`Issue #${index + 1} - ${issue.type} - ${name}`[typeColors[issue.type]]}
    `;
};

const formatIssueLine = (property, issue) => {
    return `${`${property}: `.underline.grey} ${
        issue[property] ? issue[property].cyan : "null".cyan
    }
    `;
};

const formatIssueLines = (issue) =>
    ["code", "context", "message", "selector"]
        .map((property) => formatIssueLine(property, issue))
        .join("");

export const logIssues = (results, name) => {
    results.issues.map((issue, index) => {
        console.warn(`
                ${formatIssueHeader(index, issue, name)}
                ${formatIssueLines(issue)}
            `);
    });
};

const formatSummaryLine = (key, value) => {
    return `${key[0].toUpperCase() + key.substring(1)}s: ${value}`[typeColors[key]];
};

const logSummaryLine = (key, value) => console.warn(formatSummaryLine(key, value));

export const updateSummary = (results, summary) => {
    results.issues.map((issue) => {
        summary[issue.type] = summary[issue.type] ? summary[issue.type] + 1 : 1;
    });
    return summary;
};

export const processSummary = (summary, suppressErrors = false) => {
    const total = Object.values(summary).reduce((acc, current) => acc + current, 0);
    if (total > 0) {
        const report = `Total issues: ${total}`;
        Object.entries(summary).map(([key, value]) => logSummaryLine(key, value));
        if (suppressErrors) {
            console.warn(report.cyan);
        } else {
            throw new Error(report);
        }
    } else {
        console.log("No issues found".cyan);
    }
    process.exit();
};
