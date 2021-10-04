"use strict";

import * as React from "react";

import * as StepBase from "./StepBase";
import * as Step1 from "./Step1";
import * as Step2 from "./Step2";
import * as Step3 from "./Step3";
import * as Summary from "./Summary";

// Step4 has pre-rendered messages
export interface Strings extends StepBase.Strings {
    messages: Summary.MessageLookup;
}

interface Props extends Strings, StepBase.Props {
    // expect status from parent
    status: string;
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

export class Step extends React.Component<Props, unknown> {
    componentDidMount(): void {
        if (this.props.status !== "Completed") {
            this.sendSubmit(this.props.step1.uploadUrl);
        }
    }

    componentDidUpdate(prevProps: Props, prevState: unknown): void {
        // get notified of parent changes to props here
        if (this.checkStatusTransition(prevProps, "Failed")) {
            this.setShowMessages(["error"], ["wait"]);
        } else if (this.checkStatusTransition(prevProps, "Completed")) {
            this.setShowMessages(["success"], ["wait"]);
        }
    }

    render(): JSX.Element {
        return (
            <div className="stepDiv">
                <Summary.Status {...this.props.statusProps} />
                <Summary.Messages
                    ackButtonLabel={this.props.ackButtonLabel}
                    errors={this.props.errors}
                    messages={this.props.messages}
                    onAck={(category) => this.props.onAck(category)}
                    show={this.props.step4.show}
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
        this.props.onUpdate("step4", Summary.Messages.curryUpdateFn(on, off));
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
        request.set("category", `${this.props.step1.category.pk}`);
        request.set("layout", `${this.props.step1.layout.pk}`);
        // value of status does not matter, only existence
        request.set("status", "");
        return request;
    }
}
