"use strict";

import * as React from "react";
import classNames from "classnames";
import Dropzone from "react-dropzone";

import * as StepBase from "./StepBase";
import * as Step1 from "./Step1.tsx";
import * as Summary from "./Summary.tsx";

export interface Strings extends StepBase.Strings {
    directions: string;
    messages: Summary.MessageLookup;
}

interface Props extends Strings, StepBase.Props {
    // expect status from parent
    status: string;
    // expect to get props of parent state with our and previous SubState
    step1: Step1.SubState;
    step2: SubState;
}

export class SubState {
    // user-provided upload containing data to load
    file: File = null;
    // flag indicating a request to parse file was sent
    parseSent = false;
    // ordered listing of messages to display
    show: string[] = [];
}

export class Step extends React.Component<Props, unknown> {
    componentDidUpdate(prevProps: Props, prevState: unknown): void {
        // get notified of parent changes to props here
        if (this.isFileReady() && !this.props.step2.parseSent) {
            this.props.onUpdate("step2", { "parseSent": true }, () => {
                this.sendParse(this.props.step1.uploadUrl, this.props.step2.file);
            });
        }
        // clear out accepted message whenever there are new errors or warnings
        else if (this.addingErrors(prevProps) || this.addingWarnings(prevProps)) {
            this.setShowMessages([], ["accepted"]);
        }
        // auto-transition to next step when status moves to "Ready"
        else if (this.checkStatusTransition(prevProps, "Ready")) {
            this.setShowMessages([], ["accepted"]);
            this.props.jumpToStep(2);
        }
    }

    isValidated(): boolean {
        return this.isStatusSet() && this.isErrorFree();
    }

    render(): JSX.Element {
        const accept = this.accept();
        // TODO: set "excel" class based on accept value
        const baseClasses = [
            "dropZone",
            "dz-clickable",
            "excel",
            "fd-zone",
            "overviewDropZone",
        ];
        return (
            <div className="stepDiv">
                <Summary.Status {...this.props.statusProps} />
                <Summary.Messages
                    ackButtonLabel={this.props.ackButtonLabel}
                    errors={this.props.errors}
                    messages={this.props.messages}
                    onAck={(category) => this.props.onAck(category)}
                    show={this.props.step2.show}
                    warnings={this.props.warnings}
                />
                <Dropzone
                    accept={accept}
                    disabled={false}
                    multiple={false}
                    onDrop={(...args) => this.onDrop(...args)}
                >
                    {({
                        getRootProps,
                        getInputProps,
                        isDragActive,
                        isDragAccept,
                        isDragReject,
                    }) => (
                        <div
                            {...getRootProps()}
                            className={classNames(...baseClasses, {
                                "dz-drag-hover": isDragActive && isDragAccept,
                                "dz-drag-reject": isDragActive && isDragReject,
                            })}
                        >
                            <input {...getInputProps()} />
                            {this.props.directions}
                        </div>
                    )}
                </Dropzone>
            </div>
        );
    }

    private accept(): string[] {
        if (this.isPreviousValidated()) {
            const parsers = this.props.step1.layout.parsers || [];
            return parsers.map((p) => p.mime_type);
        }
        return [];
    }

    private addingErrors(prevProps) {
        return prevProps.errors.length === 0 && this.props.errors.length;
    }

    private addingWarnings(prevProps) {
        return prevProps.warnings.length === 0 && this.props.warnings.length;
    }

    private checkStatusTransition(prevProps, status) {
        return prevProps.status !== status && this.props.status === status;
    }

    private isErrorFree() {
        return this.props.errors.length === 0 && this.props.warnings.length === 0;
    }

    private isFileReady() {
        return (
            this.isPreviousValidated() &&
            this.props.step1.uploadUrl &&
            this.props.step2.file
        );
    }

    private isPreviousValidated() {
        // got all the stuff we need from previous step
        return (
            this.props.step1.category &&
            this.props.step1.protocol &&
            this.props.step1.layout
        );
    }

    private isStatusSet() {
        return this.props.status !== null;
    }

    private onDrop(accepted: File[], rejected: File[], event) {
        if (accepted.length) {
            this.props.onUpdate("step2", { "file": accepted[0], "parseSent": false });
        }
        if (rejected.length) {
            // TODO: show message if rejected because MIME not in this.accept()
            // if (reject.type not in this.accept()) { Summary.ProblemMessage() }
            this.setShowMessages(["error"]);
        }
    }

    private parseError(jqXHR, status, error) {
        const showOn: string[] = [];
        const showOff: string[] = ["wait"];
        if (jqXHR.responseJSON && jqXHR.responseJSON.errors) {
            this.props.onUpdate("errors", jqXHR.responseJSON.errors);
        } else if (status === "timeout") {
            showOn.push("timeout");
        } else {
            showOn.push("error");
        }
        this.setShowMessages(showOn, showOff);
    }

    private parseRequest(file) {
        const request = new FormData();
        request.set("category", `${this.props.step1.category.pk}`);
        request.set("file", file);
        request.set("layout", `${this.props.step1.layout.pk}`);
        request.set("protocol", this.props.step1.protocol.uuid);
        this.props.step1.options.forEach((k) => request.set(k, ""));
        return request;
    }

    private parseResponse(response) {
        this.setShowMessages(["accepted"], ["wait"]);
    }

    private sendParse(url, file) {
        this.setShowMessages(["wait"]);
        $.ajax({
            "url": url,
            "method": "PATCH",
            "contentType": false,
            "data": this.parseRequest(file),
            "dataType": "json",
            "processData": false,
            "success": (response) => this.parseResponse(response),
            "error": (...args) => this.parseError(...args),
        });
    }

    private setShowMessages(on: string[], off?: string[]) {
        this.props.onUpdate("step2", Summary.Messages.curryUpdateFn(on, off));
    }
}
