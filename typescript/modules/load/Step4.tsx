"use strict";

import * as React from "react";

import * as StepBase from "./StepBase";
import * as Step1 from "./Step1.tsx";
import * as Step2 from "./Step2.tsx";
import * as Step3 from "./Step3.tsx";
import * as Summary from "./Summary.tsx";

// Step4 has pre-rendered messages
export interface Strings extends StepBase.Strings {
    messages: Summary.MessageLookup;
}

interface Props extends Strings, StepBase.Props {
    // expect to get props of parent state with our and previous SubState
    step1: Step1.SubState;
    step2: Step2.SubState;
    step3: Step3.SubState;
    step4: SubState;
}

export class SubState {
    // ordered listing of messages to display
    show: string[] = [];
}

export class Step extends React.Component<Props> {
    componentDidMount() {
        this.sendSubmit(this.props.step1.uploadUrl);
    }

    componentDidUpdate(prevProps, prevState) {
        // get notified of parent changes to props here
        if (this.checkStatusTransition(prevProps, "Failed")) {
            this.setShowMessages(["error"], ["wait"]);
        } else if (this.checkStatusTransition(prevProps, "Completed")) {
            this.setShowMessages(["success"], ["wait"]);
        }
    }

    render() {
        return (
            <div className="stepDiv">
                <Summary.Status {...this.props.statusProps} />
                <Summary.Messages
                    errors={this.props.errors}
                    messages={this.props.messages}
                    show={this.props.step2.show}
                    warnings={this.props.warnings}
                />
            </div>
        );
    }

    private checkStatusTransition(prevProps, status) {
        return prevProps.status !== status && this.props.status === status;
    }

    private sendSubmit(url) {
        this.setShowMessages(["wait"]);
        $.ajax({
            "url": url,
            "method": "PATCH",
            "contentType": false,
            "data": this.submitRequest(),
            "dataType": "json",
            "processData": false,
            "error": (...args) => this.submitError(...args),
        });
    }

    private setShowMessages(on: string[], off?: string[]) {
        this.props.onUpdate("step4", (state, props) => {
            const original: Set<string> = new Set(state.show);
            const toAdd: Set<string> = new Set(on);
            original.forEach((item) => toAdd.delete(item));
            const toDelete: Set<string> = new Set(off || []);
            const replacement = [
                // original ordering, with things in off filtered out
                ...state.show.filter((item) => !toDelete.has(item)),
                // append things in on only if not already in original
                ...on.filter((item) => toAdd.has(item)),
            ];
            return { "show": replacement };
        });
    }

    private submitError(jqXHR, status, error) {
        const showOn: string[] = [];
        const showOff: string[] = ["wait"];
        if (jqXHR.responseJSON && jqXHR.responseJSON.errors) {
            this.props.onUpdate("errors", jqXHR.responseJSON.errors);
        } else {
            showOn.push("error");
        }
        this.setShowMessages(showOn, showOff);
    }

    private submitRequest() {
        const request = new FormData();
        // TODO: currently required to re-submit these, should fix to make optional
        request.set("category", `${this.props.step1.category.pk}`);
        request.set("layout", `${this.props.step1.layout.pk}`);
        request.set("protocol", this.props.step1.protocol.uuid);
        // value of status does not matter, only existence
        request.set("status", "");
        this.props.step1.options.forEach((k) => request.set(k, ""));
        return request;
    }
}
