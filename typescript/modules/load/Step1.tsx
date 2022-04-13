"use strict";

import * as React from "react";

import * as Inputs from "./Inputs";
import * as StepBase from "./StepBase";
import * as Summary from "./Summary";

export interface Strings extends StepBase.Strings {
    categoryUrl: string;
    createUrl: string;
    fields: JQuery;
}

interface Props extends Strings, StepBase.Props {
    // expect to get props of parent state with our SubState
    step1: SubState;
}

export class SubState {
    // user-selected category for data to load
    category: Summary.Category = null;
    // user-selected layout of data to load
    layout: Summary.Layout = null;
    // user-selected options; exists = on, absent = off
    options: Set<string> = new Set<string>();
    // user-selected protocol used to generate data being loaded
    protocol: Summary.Protocol = null;
    // selection values available, loaded via AJAX call
    selections: Summary.Category[] = [];
    // endpoint used to write data for loading
    uploadUrl: string = null;
    // identifier for current data loading workflow
    uuid: string = null;
}

export class Step extends React.Component<Props, unknown> {
    componentDidMount(): void {
        $.get(
            this.props.categoryUrl,
            (payload) => {
                this.props.onUpdate("step1", { "selections": payload.results });
            },
            "json",
        );
    }

    componentWillUnmount(): void {
        if (this.isValidated()) {
            this.sendCreate();
        }
    }

    isValidated(): boolean {
        return (
            this.props.step1.category &&
            this.props.step1.protocol &&
            this.props.step1.layout !== null
        );
    }

    render(): JSX.Element {
        return (
            <div className="stepDiv">
                <Summary.Messages
                    ackButtonLabel={this.props.ackButtonLabel}
                    errors={this.props.errors}
                    onAck={(category) => this.props.onAck(category)}
                    warnings={this.props.warnings}
                />
                {...this.convertFieldsets()}
            </div>
        );
    }

    private categoryInput(original: JQuery) {
        const placeholder = original.find("._placeholder").text();
        return (
            <Inputs.MultiButtonSelect
                options={this.props.step1.selections}
                placeholder={placeholder}
                selected={this.props.step1.category}
                onSelect={(selected) => this.categorySelect(selected)}
                describedby="categoryDescription"
            />
        );
    }

    private categorySelect(selected) {
        this.props.onUpdate("step1", { "category": selected });
    }

    private convertFieldsets() {
        const copies = this.props.fields.clone().get();
        const inputs = [
            this.categoryInput.bind(this),
            this.protocolInput.bind(this),
            this.layoutInput.bind(this),
            this.optionInput.bind(this),
        ];
        return copies.map((element, i) => {
            const original = $(element);
            const legend_text = original.children("legend").text();
            const aside_html = original.children("aside").html();
            const aside_id = original.children("aside").attr("id");
            const input = inputs[i](original);
            // return the rendered template with our extras
            return (
                <fieldset role="radiogroup" aria-required="true">
                    <legend>
                        <h2>{legend_text}</h2>
                    </legend>
                    <aside
                        id={aside_id}
                        dangerouslySetInnerHTML={{ "__html": aside_html }}
                    />
                    {input}
                </fieldset>
            );
        });
    }

    private createRequest() {
        const request = {
            "category": this.props.step1.category.pk,
            "layout": this.props.step1.layout.pk,
            "protocol": this.props.step1.protocol.pk,
        };
        this.props.step1.options.forEach((k) => {
            request[k] = "";
        });
        return request;
    }

    private createResponse(response) {
        this.props.onUpdate("step1", response);
    }

    private layoutInput(original) {
        const options = this.props.step1.category?.layouts || [];
        const placeholder = original.find("._placeholder").text();
        return (
            <Inputs.MultiButtonSelect
                options={options}
                placeholder={placeholder}
                selected={this.props.step1.layout}
                onSelect={(selected) => this.layoutSelect(selected)}
                describedby="layoutDescription"
            />
        );
    }

    private layoutSelect(selected) {
        this.props.onUpdate("step1", { "layout": selected });
    }

    private optionInput(original: JQuery) {
        // convert DIV with checkbox+label into custom element
        const convert = (element) => {
            return (
                <Inputs.ToggleOption
                    original={$(element)}
                    on={this.props.step1.options}
                    onChange={(name, on) => this.optionSelect(name, on)}
                />
            );
        };
        // template has DIVs with checkbox+label for basic;
        const basic_in = original.children("div").get();
        const basic_out = basic_in.map(convert);
        // also DETAILS with same for advanced;
        const details = original.children("details");
        const summary = details.children("summary").text();
        const advanced_in = details.children("div").get();
        const advanced_out = advanced_in.map(convert);
        return (
            <>
                {basic_out}
                <details>
                    <summary>{summary}</summary>
                    {advanced_out}
                </details>
            </>
        );
    }

    private optionSelect(name: string, on: boolean) {
        this.props.onUpdate("step1", (state, props) => {
            const options = state.options || new Set<string>();
            if (on) {
                options.add(name);
            } else {
                options.delete(name);
            }
            return { "options": options };
        });
    }

    private protocolInput(original) {
        const protocols = this.props.step1.category?.protocols || [];
        const placeholder = original.find("._placeholder").text();
        return (
            <Inputs.MultiButtonSelect
                options={protocols}
                placeholder={placeholder}
                selected={this.props.step1.protocol}
                onSelect={(selected) => this.protocolSelect(selected)}
                describedby="protocolDescription"
            />
        );
    }

    private protocolSelect(selected) {
        this.props.onUpdate("step1", { "protocol": selected });
    }

    private sendCreate() {
        $.ajax({
            "url": this.props.createUrl,
            "method": "POST",
            "contentType": "application/json",
            "data": JSON.stringify(this.createRequest()),
            "dataType": "json",
            "success": (response) => this.createResponse(response),
        });
    }
}
