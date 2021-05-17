"use strict";

import * as $ from "jquery";
import * as React from "react";
import * as ReactDOM from "react-dom";
import StepZilla from "react-stepzilla";

import * as Notification from "../modules/Notification";
import * as Step1 from "../modules/load/Step1.tsx";
import * as Step2 from "../modules/load/Step2.tsx";
import * as Step3 from "../modules/load/Step3.tsx";
import * as Step4 from "../modules/load/Step4.tsx";
import * as Summary from "../modules/load/Summary.tsx";
import * as Utl from "../modules/Utl";

import "../modules/Styles";
import "react-stepzilla.css";

/**
 * Top-level properties of Wizard component.
 *
 * Generally, i18n strings and pre-fab HTML from the page template.
 */
interface Props {
    actions: {
        "back": string;
        "next": string;
        "save": string;
    };
    statusLabels: Summary.StatusStrings;
    step1: Step1.Strings;
    step2: Step2.Strings;
    step3: Step3.Strings;
    step4: Step4.Strings;
}

/**
 * Top-level state of Wizard component.
 *
 * As the Wizard itself consists only of its steps, the state coordinates the
 * properties of the sub-component steps, and the step sub-components.
 */
class State {
    errors: Summary.ProblemMessage[] = [];
    // status for current data loading workflow
    status: string = null;
    statusProps: Summary.StatusProps;
    step1: Step1.SubState = new Step1.SubState();
    step2: Step2.SubState = new Step2.SubState();
    step3: Step3.SubState = new Step3.SubState();
    step4: Step4.SubState = new Step4.SubState();
    warnings: Summary.ProblemMessage[] = [];

    constructor(props) {
        this.statusProps = { ...props.statusLabels };
    }
}

class Wizard extends React.Component<Props, State> {
    constructor(props) {
        super(props);
        this.state = new State(props);
    }

    // React methods

    componentDidMount(): void {
        const socket = new Notification.NotificationSocket({ "path": "/ws/load/" });
        socket.subscribe((messages, count) => this.onMessage(messages));
    }

    render(): JSX.Element {
        const ackFn = (category) => this.onAck(category);
        const updateFn = (stepName, stepState, callback?) =>
            this.onUpdate(stepName, stepState, callback);
        const props1 = { ...this.props.step1, ...this.state };
        const props2 = { ...this.props.step2, ...this.state };
        const props3 = { ...this.props.step3, ...this.state };
        const props4 = { ...this.props.step4, ...this.state };
        const components = {
            "step1": <Step1.Step {...props1} onAck={ackFn} onUpdate={updateFn} />,
            "step2": <Step2.Step {...props2} onAck={ackFn} onUpdate={updateFn} />,
            "step3": <Step3.Step {...props3} onAck={ackFn} onUpdate={updateFn} />,
            "step4": <Step4.Step {...props4} onAck={ackFn} onUpdate={updateFn} />,
        };
        const stepsDef = [
            { "name": this.props.step1.title, "component": components.step1 },
            { "name": this.props.step2.title, "component": components.step2 },
            { "name": this.props.step3.title, "component": components.step3 },
            { "name": this.props.step4.title, "component": components.step4 },
        ];
        return (
            <StepZilla
                steps={stepsDef}
                stepsNavigation={false}
                backButtonText={this.props.actions.back}
                nextButtonText={this.props.actions.next}
                nextTextOnFinalActionStep={this.props.actions.save}
            />
        );
    }

    // custom methods

    /**
     * Callback for (warning) messages acknowledged and dismissed.
     */
    private onAck(category: string) {
        // filter out any warnings matching acknowledged category
        const toKeep = (item: Summary.ProblemMessage) => item.category !== category;
        this.setState((state, props) => ({
            "warnings": state.warnings.filter(toKeep),
        }));
    }

    /**
     * Callback for messages received over websocket.
     *
     * All work done in background tasks (i.e. Celery) cannot communicate using
     * normal HTTP. Messages from a websocket allow for async updates to the
     * page state from those background tasks.
     */
    private onMessage(messages: Notification.Message[]) {
        for (const message of messages) {
            const uuid = message.payload.uuid;
            if (uuid === this.state.step1.uuid) {
                const errors = message.payload.errors || [];
                const warnings = message.payload.warnings || [];
                // replace any existing messages with incoming messages
                this.setState((state, props) => ({
                    "errors": [...errors],
                    "status": message.payload.status,
                    "warnings": [...warnings],
                }));
            }
        }
    }

    /**
     * Callback registered to steps, allowing updates of overall Wizard state.
     *
     * Steps trigger onUpdate() callback similar to use of React's setState().
     * It handles updating sub-states contained on the parent.
     */
    private onUpdate(stepName: string, stepState: any, callback?: () => void) {
        this.setState((state, props) => {
            // every update resets Summary.Status, and Summary.Messages
            const toSet = { "statusProps": { ...state.statusProps } };
            const nestedState = state[stepName] || {};
            if (typeof stepState === "function") {
                const nestedProps = props[stepName] || {};
                toSet[stepName] = {
                    ...nestedState,
                    ...stepState(nestedState, nestedProps),
                };
            } else {
                toSet[stepName] = { ...nestedState, ...stepState };
            }
            // update Summary.Status with the current values from steps
            toSet.statusProps = {
                ...state.statusProps,
                "category": state.step1.category && state.step1.category.name,
                "file": state.step2.file && state.step2.file.name,
                "layout": state.step1.layout && state.step1.layout.name,
                "protocol": state.step1.protocol && state.step1.protocol.name,
            };
            return toSet;
        }, callback);
    }
}

function readStrings(root: JQuery): Props {
    const step1 = root.children("#_step1");
    const step2 = root.children("#_step2");
    const step3 = root.children("#_step3");
    const step4 = root.children("#_step4");
    const ackButtonLabel = root.children("span._ack").text();
    const actions = { "back": "", "next": "", "save": "" };
    root.children("#_actions")
        .children("label")
        .each((i, element) => {
            const label = $(element);
            actions[label.attr("for")] = label.text();
        });
    return {
        "actions": actions,
        "statusLabels": {
            "categoryLabel": root.children("span._category").text(),
            "fileLabel": root.children("span._file").text(),
            "layoutLabel": root.children("span._layout").text(),
            "protocolLabel": root.children("span._protocol").text(),
        },
        "step1": {
            "ackButtonLabel": ackButtonLabel,
            "categoryUrl": step1.children("._data").attr("href"),
            "createUrl": $("form#create_load").attr("action"),
            "fields": step1.children("fieldset").clone(),
            "title": step1.children("._title").text(),
        },
        "step2": {
            "ackButtonLabel": ackButtonLabel,
            "directions": step2.children("span._directions").text(),
            "messages": readMessageStrings(step2),
            "title": step2.children("span._title").text(),
        },
        "step3": {
            "ackButtonLabel": ackButtonLabel,
            "directions": step3.children("p._directions").text(),
            "title": step3.children("._title").text(),
        },
        "step4": {
            "ackButtonLabel": ackButtonLabel,
            "messages": readMessageStrings(step4),
            "title": step4.children("._title").text(),
        },
    };
}

function readMessageStrings(stepElement: JQuery): Summary.MessageLookup {
    const messages: Summary.MessageLookup = {};
    stepElement.children("div._message").each((i, element) => {
        const div = $(element);
        const match = div.attr("id").match(/_step\d_(\w+)/);
        if (match) {
            const id = match[1];
            messages[id] = {
                "classNames": div.attr("data-class"),
                "message": $("p._message", div).html(),
                "title": $("span._title", div).text(),
            };
        }
    });
    return messages;
}

$(() => {
    // send CSRF header on each AJAX request from this page
    $.ajaxSetup({
        "beforeSend": (xhr) => {
            xhr.setRequestHeader("X-CSRFToken", Utl.EDD.findCSRFToken());
        },
    });
    const wizardRoot = $("#wizard");
    const props = readStrings(wizardRoot);
    const wizardElement = wizardRoot.empty().removeClass("off").get(0);
    ReactDOM.render(<Wizard {...props} />, wizardElement);
});
