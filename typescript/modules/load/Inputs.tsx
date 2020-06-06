"use strict";

// input components used in the data loading wizard

import classNames from "classnames";
import * as React from "react";

import * as Summary from "./Summary.tsx";

interface MBSProps {
    options: Summary.Choice[];
    placeholder: string;
    selected: Summary.Choice;
    onSelect: (choice) => void;
}

export class MultiButtonSelect extends React.Component<MBSProps> {
    componentDidUpdate(prevProps, prevState) {
        const options = this.props.options || [];
        if (!prevProps.selected && options.length === 1) {
            // auto-select only option
            this.props.onSelect(options[0]);
        }
    }

    render() {
        const options = this.props.options || [];
        const buttons = options.map((o) => {
            const active = this.props.selected && this.props.selected.pk === o.pk;
            const classes = classNames("btn", "btn-default", { "active": active });
            return (
                <button className={classes} onClick={() => this.props.onSelect(o)}>
                    {o.name}
                </button>
            );
        });
        // output either buttons from options, or the placeholder
        const contents = options.length
            ? buttons
            : [<span className="placeholder">{this.props.placeholder}</span>];
        return <div className="multiSelect">{...contents}</div>;
    }
}

interface TOProps {
    original: JQuery;
    on: Set<string>;
    onChange: (name: string, set: boolean) => void;
}

export class ToggleOption extends React.Component<TOProps> {
    render() {
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
