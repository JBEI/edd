"use strict";

// input components used in the data loading wizard

import * as React from "react";

import * as Summary from "./Summary";

interface MBSProps {
    options: Summary.Choice[];
    placeholder: string;
    selected: Summary.Choice;
    onSelect: (choice) => void;
    describedby?: string;
}

export class MultiButtonSelect extends React.Component<MBSProps, unknown> {
    componentDidUpdate(prevProps: MBSProps, prevState: unknown): void {
        const options = this.props.options || [];
        if (!prevProps.selected && options.length === 1) {
            // auto-select only option
            this.props.onSelect(options[0]);
        }
    }

    render(): JSX.Element {
        const options = this.props.options || [];
        const buttons = options.map((o) => {
            const active = this.props.selected && this.props.selected.pk === o.pk;
            return (
                <div className="radio">
                    <label>
                        <input
                            type="radio"
                            onClick={() => this.props.onSelect(o)}
                            checked={active}
                            aria-describedby={this.props.describedby}
                        />
                        {o.name}
                    </label>
                </div>
            );
        });
        // output either radio buttons from options, or the placeholder
        // using aria-disabled preserves a user's ability to discover and focus the control
        // while communicating the information that they need to complete a previous step
        const contents = options.length
            ? buttons
            : [
                  <button className="placeholder" aria-disabled="true">
                      {this.props.placeholder}
                  </button>,
              ];
        return <div className="multiSelect">{...contents}</div>;
    }
}

interface TOProps {
    original: JQuery;
    on: Set<string>;
    onChange: (name: string, set: boolean) => void;
}

export class ToggleOption extends React.Component<TOProps, unknown> {
    render(): JSX.Element {
        const name = this.props.original.children("input").attr("name");
        const label = this.props.original.children("label").text();
        const on = this.props.on || new Set<string>();
        return (
            <div>
                <input
                    id={name}
                    defaultChecked={on.has(name)}
                    type="checkbox"
                    onChange={(event) =>
                        this.props.onChange(name, event.target.checked)
                    }
                />
                <label htmlFor={name}>{label}</label>
            </div>
        );
    }
}
