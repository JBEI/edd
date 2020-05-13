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

export class SubState {
    autoAdvanced: Set<string> = new Set<string>();
}

export class Step extends React.Component<Props> {
    componentDidMount() {
        // wait a bit then move to next step if everything OK
        if (this.isValidated() && !this.hasAutoAdvanced()) {
            window.setTimeout(() => this.props.jumpToStep(3), 5000);
        }
        // track which IDs have already been advanced to next step
        this.markAutoAdvanced();
    }

    isValidated() {
        return this.props.errors.length === 0 && this.props.warnings.length === 0;
    }

    render() {
        return (
            <div className="stepDiv">
                <Summary.Status {...this.props.statusProps} />
                <Summary.Messages
                    ackButtonLabel={this.props.ackButtonLabel}
                    errors={this.props.errors}
                    onAck={(category) => this.props.onAck(category)}
                    warnings={this.props.warnings}
                />
                <p>{this.props.directions}</p>
            </div>
        );
    }

    private hasAutoAdvanced(): boolean {
        return this.props.step3.autoAdvanced.has(this.props.step1.uuid);
    }

    private markAutoAdvanced(): void {
        this.props.onUpdate("step3", (state, props) => {
            const replacement = new Set(props.autoAdvanced);
            replacement.add(this.props.step1.uuid);
            return { "autoAdvanced": replacement };
        });
    }
}
