"use strict";

import * as React from "react";

import * as StepBase from "./StepBase";
import * as Step1 from "./Step1.tsx";
import * as Step2 from "./Step2.tsx";
import * as Summary from "./Summary.tsx";

export interface Strings extends StepBase.Strings {
    directions: string;
}

interface Props extends Strings, StepBase.Props {
    // expect to get props of parent state with our and previous SubState
    step1: Step1.SubState;
    step2: Step2.SubState;
    step3: SubState;
}

export class SubState {}

export class Step extends React.Component<Props> {
    componentDidMount() {
        // wait a bit then move to next step if everything OK
        if (this.isValidated()) {
            window.setTimeout(() => this.props.jumpToStep(3), 5000);
        }
    }

    isValidated() {
        return this.props.errors.length === 0 && this.props.warnings.length === 0;
    }

    render() {
        return (
            <div className="stepDiv">
                <Summary.Status {...this.props.statusProps} />
                <Summary.Messages
                    errors={this.props.errors}
                    warnings={this.props.warnings}
                />
                <p>{this.props.directions}</p>
            </div>
        );
    }
}
