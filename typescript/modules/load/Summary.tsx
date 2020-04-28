"use strict";

import classNames from "classnames";
import * as React from "react";

import * as Utl from "../Utl";

//
// definitions mapping to edd/load/rest/serializers.py
//

export interface Choice {
    pk: number;
    name: string;
}

export interface Parser {
    extension: string;
    mime_type: string;
}

export interface Layout extends Choice {
    description: string;
    parsers: Parser[];
}

export interface Protocol extends Choice {
    description: string;
    uuid: string;
    // default serializer has more fields,
    // but we don't care in this setting
}

export interface Category extends Choice {
    layouts: Layout[];
    protocols: Choice[];
}

//
// definitions for static message text loaded from template
//

export interface MessageStrings {
    classNames: string;
    message?: string;
    title: string;
}

export interface MessageLookup {
    [key: string]: MessageStrings;
}

//
// definitions mapping to edd/load/exceptions/core.py
//

export interface ProblemMessage {
    // required keys
    category: string;
    summary: string;
    // optional keys
    detail?: string;
    docs_link?: string;
    id?: string;
    resolution?: string;
    subcategory?: string;
    workaround_text?: string;
}

//
// Components for reporting summary and error information
//

export interface StatusStrings {
    categoryLabel: string;
    fileLabel: string;
    layoutLabel: string;
    protocolLabel: string;
}

export interface StatusProps extends StatusStrings {
    category?: string;
    file?: string;
    layout?: string;
    protocol?: string;
}

/**
 * Component displays summary status of selected options thus far.
 */
export class Status extends React.Component<StatusProps> {
    render() {
        const category = this.props.category && (
            <span>
                <u>{this.props.categoryLabel}</u>: {this.props.category}
            </span>
        );
        const protocol = this.props.protocol && (
            <span>
                <u>{this.props.protocolLabel}</u>: {this.props.protocol}
            </span>
        );
        const layout = this.props.layout && (
            <span>
                <u>{this.props.layoutLabel}</u>: {this.props.layout}
            </span>
        );
        const file = this.props.file && (
            <span>
                <u>{this.props.fileLabel}</u>: {this.props.file}
            </span>
        );
        return (
            <div className="summary-display">
                {category}
                {protocol}
                {layout}
                {file}
            </div>
        );
    }
}

interface MessagesProps {
    errors?: ProblemMessage[];
    messages?: MessageLookup;
    show?: string[];
    warnings?: ProblemMessage[];
}

/**
 * Component displays messages or notices as banners.
 *
 * Messages can be pre-fab from HTML template, received via AJAX response,
 * and/or received in websocket frame payload.
 */
export class Messages extends React.Component<MessagesProps> {
    render() {
        const show = this.props.show || [];
        const lookup = this.props.messages || {};
        const messages = show.map((key) => <Message {...lookup[key]} />);
        const groupedProblems = Utl.groupBy(this.props.errors, "category");
        const groupedWarnings = Utl.groupBy(this.props.warnings, "category");
        const problems = Object.entries(groupedProblems).map(([key, value]) => (
            <Problem category={key} classNames={"alert-danger"} items={value} />
        ));
        const warnings = Object.entries(groupedWarnings).map(([key, value]) => (
            <Problem category={key} classNames={"alert-warning"} items={value} />
        ));
        return (
            <div>
                {...messages}
                {...problems}
                {...warnings}
            </div>
        );
    }
}

class Message extends React.Component<MessageStrings> {
    render() {
        return (
            <div className={classNames("alert", this.props.classNames)}>
                <h4>{this.props.title}</h4>
                <p dangerouslySetInnerHTML={{ "__html": this.props.message }} />
            </div>
        );
    }
}

interface ProblemProps {
    category: string;
    classNames: string;
    items: ProblemMessage[];
}

class Problem extends React.Component<ProblemProps> {
    render() {
        let items = this.props.items.map((item) => {
            const subcategory = item.subcategory && (
                <>
                    <span> &ndash; </span>
                    <span>{item.subcategory}</span>
                </>
            );
            const detail = item.detail && (
                <>
                    <span>: </span>
                    <span>{item.detail}</span>
                </>
            );
            const resolution = item.resolution && <p>{item.resolution}</p>;
            const docs = item.docs_link && (
                <div dangerouslySetInnerHTML={{ "__html": item.docs_link }} />
            );
            return (
                <div>
                    <u>{item.summary}</u>
                    {subcategory}
                    {detail}
                    {resolution}
                    {docs}
                </div>
            );
        });
        // wrap in UL when more than one
        if (items.length > 1) {
            items = [
                <ul className="errorlist">
                    {items.map((item) => (
                        <li>{item}</li>
                    ))}
                </ul>,
            ];
        }
        return (
            <div className={classNames("alert", this.props.classNames)}>
                <h4>{this.props.category}</h4>
                {...items}
            </div>
        );
    }
}
