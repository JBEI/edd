"use strict";

import * as $ from "jquery";
import * as React from "react";
import * as ReactDOM from "react-dom";
import ReactTooltip from "react-tooltip";
import ReconnectingWebSocket from "reconnecting-websocket";

import classNames from "classnames";
import DropZone from "react-dropzone";
import StepZilla from "react-stepzilla";

import * as Utl from "../modules/Utl";
import { notificationSocket } from "./Common";

import "../modules/Styles";

import "react-stepzilla.css";

type MessageListener = (message: Message) => void;

interface Message {
    message: string;
    tags: string[];
    payload: any;
    time: Date;
    uuid: string;
}

export interface SocketOptions {
    path?: string;
}

/**
 * A thin layer on top of ReconnectingWebSocket that forwards messages to subscribers.
 */
class ImportSocket {
    private socket: ReconnectingWebSocket;
    private subscribers: MessageListener[];
    private tagActions: { [tag: string]: MessageListener[] };

    constructor(options?: SocketOptions) {
        options = options || {};
        const path: string = options.path || "ws/import/";
        const url: URL = this.buildWebsocketURL(path);
        this.subscribers = [];
        this.tagActions = {};

        this.socket = new ReconnectingWebSocket(url.toString());
        this.socket.onopen = (evt) => this.opened(evt);
        this.socket.onclose = (evt) => this.closed(evt);
        this.socket.onmessage = (evt) => this.receive(evt);
    }

    private opened(event) {
        return;
    }

    private closed(event) {
        return;
    }

    private receive(event) {
        const payload = JSON.parse(event.data);
        if (Object.prototype.hasOwnProperty.call(payload, "message")) {
            this.processMessage(payload);
        }
    }

    private loadMessage(msg: any[]): Message {
        return {
            "message": msg[0],
            "tags": msg[1],
            "payload": msg[2],
            "time": new Date(msg[3] * 1000), // comes in sec instead of ms
            "uuid": msg[4],
        };
    }

    private buildWebsocketURL(path: string): URL {
        const relativeURL = Utl.relativeURL(path, new URL(window.location.origin));
        relativeURL.protocol = "https:" === relativeURL.protocol ? "wss:" : "ws:";
        return relativeURL;
    }

    subscribe(callback: MessageListener): void {
        this.subscribers.push(callback);
    }

    // adds a callback to be invoked any time a message with the provided tag
    // is received.  Callbacks are invoked in the order in which listeners are registered,
    // and will be invoked multiple times for the same message if it has multiple registered tags.
    addTagAction(tag: string, callback: MessageListener): void {
        let actions: MessageListener[] = [];
        if (Object.prototype.hasOwnProperty.call(this.tagActions, tag)) {
            actions = this.tagActions[tag];
        } else {
            this.tagActions[tag] = actions;
        }

        actions.push(callback);
    }

    private processMessage(payload) {
        const message = this.loadMessage(payload.message);

        // notify listeners for specific tags
        for (const tag of message.tags) {
            const tagCallbacks: MessageListener[] = this.tagActions[tag];
            if (!tagCallbacks) {
                continue;
            }
            $.map(tagCallbacks, (callback) => {
                callback(message);
            });
        }

        // notify general-purpose listeners
        $.map(this.subscribers, (callback) => {
            callback(message);
        });
    }
}

export interface HelpProps {
    toolTipId: string;
    url: string;
    toolTipContent: string;
}

class HelpButton extends React.Component<HelpProps> {
    render() {
        // note we only use dangerouslySetInnerHTML to set translated / hyperlinked tooltip
        // from the trusted server.  contains zero user-provided content, so should be safe
        // from XSS
        return (
            <a href={this.props.url} target="_blank" className="helpButton">
                <div
                    data-tip
                    data-for={this.props.toolTipId}
                    className="glyphicon glyphicon-question-sign"
                />
                <ReactTooltip
                    id={this.props.toolTipId}
                    className="toolTipContent"
                    delayHide={500}
                    effect="solid"
                    place="bottom"
                >
                    <div
                        dangerouslySetInnerHTML={{
                            "__html": this.props.toolTipContent,
                        }}
                    />
                </ReactTooltip>
            </a>
        );
    }
}

export interface Selectable {
    name: string;
    pk: number;
    active: boolean;
}

export interface Category extends Selectable {
    protocols: Selectable[];
    file_formats: Format[];
}

export interface Parser extends Selectable {
    mime_type: string;
    extension: string;
}

export interface Format extends Selectable {
    parsers: Parser[];
}

export interface SelectProps<T extends Selectable> {
    options: T[];
    selected: T;
    selectionCallback: any;
}

class MultiButtonSelect<T extends Selectable> extends React.Component<
    SelectProps<T>,
    any
> {
    constructor(props) {
        super(props);
    }

    render() {
        const options: T[] = this.props.options || [];
        const selectionCallback = this.props.selectionCallback;
        const optBtns = options.map((option: T) => {
            const selected: T = this.props.selected;
            let classes = "btn btn-default";
            if (selected && selected.pk === option.pk) {
                classes += " active";
            }

            // omit options that don't have the active flag set
            if (!option.active) {
                return "";
            }

            return (
                <button className={classes} onClick={() => selectionCallback(option)}>
                    {option.name}
                </button>
            );
        });

        return <div className="multiSelect">{optBtns}</div>;
    }
}

export interface Step2State extends ImportContextProps {
    fileSizeLimit: number;
    uploadWait: boolean;
    uploadProcessingWait: boolean;
    uploadedFileName: string;
    postUploadStep: number;
    uploadErrors: ErrorSummary[];
    uploadWarnings: ErrorSummary[];
    requiredValues: string[];
    submitPending: boolean;
    submitWait: boolean;
}

export interface Step2Props extends Step2State {
    onDropCallback: <T extends File>(
        acceptedFiles: T[],
        rejectedFiles: T[],
        event,
    ) => void;
    errorCallback: (state: any) => void;
    clearFeedbackFn: () => void;
    overwrite: boolean;
    jumpToStep: (step: number) => void; // injected by StepZilla
    // hacky way of giving the Import component access to change steps via StepZilla API
    stepChangeFnCallback: (stepChgFn: (number) => void) => void;
    warningWorkarounds: any;
    format: Format;
}

// TODO: merge with similar TS class in Study-Lines-Add-Combos.ts
export interface ErrorSummary {
    category: string;
    summary: string;
    subcategory?: string;
    detail?: string[];
    resolution?: string;
    docs_link?: string;
    id?: string;
    workaround_text?: string;
}

export interface BgProcessingProps extends SuccessProps {
    synchRequestWait: boolean;
    asynchProcessingWait: boolean;
    errors: ErrorSummary[];
    warnings: ErrorSummary[];
    uploadedFileName: string;
    processingComplete: boolean;
    clearFeedbackFn: any;
    waitTitle: string;
    waitMsg: any;
    warningWorkarounds: any;
    showSuccessOnWarnings: boolean;
}

/*
 * Takes the flat list of errors returned by the back end and breaks it into sublists that fall
 * within the same category.
 */
function categorizeErrs(errors: ErrorSummary[]): ErrorSummary[][] {
    let prevCategory = "";
    const errsByCategory: ErrorSummary[][] = [];
    let currentCat: ErrorSummary[] = [];

    // break down errors into sub-lists of those that fall under the same category
    errors.map((error: ErrorSummary) => {
        const newCategory: boolean = error.category !== prevCategory;

        if (newCategory && currentCat.length) {
            errsByCategory.push(currentCat);
            currentCat = [];
        }
        currentCat.push(error);
        prevCategory = error.category;
    });

    if (currentCat.length) {
        errsByCategory.push(currentCat);
    }

    return errsByCategory;
}

/*
 *  Displays file upload feedback for either success or error.
 */
class BgTaskFeedback extends React.Component<BgProcessingProps, any> {
    render() {
        if (this.props.synchRequestWait || this.props.asynchProcessingWait) {
            return (
                <div className="alert alert-info">
                    <h4>
                        {this.props.waitTitle} <span className="wait step2-wait" />
                    </h4>
                    <div className="alertMessagesContent">{this.props.waitMsg}</div>
                </div>
            );
        }
        let successAlert = <div />;
        if (
            (!this.props.errors || !this.props.errors.length) &&
            (this.props.showSuccessOnWarnings ||
                !this.props.warnings ||
                !this.props.warnings.length)
        ) {
            if (this.props.processingComplete) {
                successAlert = (
                    <SuccessAlert
                        successTitle={this.props.successTitle}
                        successMsg={this.props.successMsg}
                        successActions={this.props.successActions}
                        uploadedFileName={this.props.uploadedFileName}
                    />
                );
            }
        }

        // show errors, if any
        const errsByCategory: ErrorSummary[][] = categorizeErrs(this.props.errors);
        const errorAlerts = errsByCategory.map((categoryErrors: ErrorSummary[]) => {
            return (
                <ErrCategoryAlert
                    allowHide={true}
                    errs={categoryErrors}
                    workaroundCallbacks={{}}
                    alertClass="alert alert-danger"
                    dismissAllFn={this.props.clearFeedbackFn}
                />
            );
        });

        // show warnings, if any
        const warningsByCategory: ErrorSummary[][] = categorizeErrs(
            this.props.warnings,
        );
        const warningAlerts = warningsByCategory.map(
            (categoryWarnings: ErrorSummary[]) => {
                return (
                    <ErrCategoryAlert
                        allowHide={true}
                        errs={categoryWarnings}
                        workaroundCallbacks={this.props.warningWorkarounds}
                        alertClass="alert alert-warning"
                        dismissAllFn={this.props.clearFeedbackFn}
                    />
                );
            },
        );

        const total: number = errorAlerts.length + warningAlerts.length;
        let dismissBtn = <div />;
        if (total > 3) {
            dismissBtn = (
                <div className="dismissAll">
                    <button
                        className="btn btn-info"
                        onClick={this.props.clearFeedbackFn}
                    >
                        Dismiss
                    </button>
                </div>
            );
        }
        return (
            <div>
                {successAlert}
                {dismissBtn}
                {errorAlerts}
                {warningAlerts}
            </div>
        );
    }
}

export interface SubmitStatusProps {
    errors: ErrorSummary[];
    warnings: ErrorSummary[];
    clearFeedbackFn?: any;
}

export interface ErrSequenceProps {
    errs: ErrorSummary[];
    alertClass: string;
    workaroundCallbacks: any;
    allowHide: boolean;
    dismissAllFn?: any;
}

// essentially a workaround for the fact that bootstrap's dismissable alerts don't play well with
// React.
export interface ErrSequenceState {
    hide: boolean;
}

export interface ImportContextProps {
    category: Category;
    protocol: Selectable;
    format: Format;
    uploadedFileName: string;
    submitSuccess: boolean;
    submitWait: boolean;
}

// Displays user feedback re: import context selected in step 1 and file uploaded in step 2
class ContextFeedback extends React.Component<ImportContextProps, any> {
    render() {
        const category = this.props.category;
        const protocol = this.props.protocol;
        const fmt = this.props.format;
        const fileName = this.props.uploadedFileName;
        const cat = category && (
            <div className="contextBreadcrumbs">
                <span className="contextSectionHeader">Category:</span> {category.name}
            </div>
        );
        const prot = protocol && (
            <div className="contextBreadcrumbs">
                <span className="contextSectionHeader">Protocol:</span> {protocol.name}
            </div>
        );
        const fileFormat = fmt && (
            <div className="contextBreadcrumbs">
                <span className="contextSectionHeader">Format:</span> {fmt.name}
            </div>
        );
        const file = fileName && (
            <div className="contextBreadcrumbs">
                <span className="contextSectionHeader">File:</span> {fileName}
            </div>
        );

        return (
            <div>
                {cat}
                {prot}
                {fileFormat}
                {file}
            </div>
        );
    }
}

interface SuccessActions {
    [label: string]: any;
}

export interface SuccessProps {
    uploadedFileName: string;
    successTitle: string;
    successMsg: string;
    successActions: SuccessActions;
}

class SuccessAlert extends React.Component<SuccessProps, any> {
    render() {
        const buttons = Object.keys(this.props.successActions).map((label: string) => {
            return (
                <button
                    onClick={this.props.successActions[label]}
                    className="bg-task-callback-btn"
                >
                    {label}
                </button>
            );
        });
        return (
            <div className="alert alert-success">
                <h4>{this.props.successTitle}</h4>
                <div className="alertMessageContent">{this.props.successMsg}</div>
                <div> {buttons} </div>
            </div>
        );
    }
}

/*
 * Displays user feedback for errors returned by the back end.  Takes as input a list of errors
 * that all fall under the same category.  They are displayed in a single alert with styling
 * to help differentiate them from each other.
 */
class ErrCategoryAlert extends React.Component<ErrSequenceProps, any> {
    constructor(props) {
        super(props);
        this.state = {
            "hide": false,
        };
    }

    render() {
        const contentDivs = this.buildContentDivs();
        let content;
        if (this.props.errs.length > 1) {
            content = (
                <ul>
                    {" "}
                    {contentDivs.map((val) => {
                        return <li className="alertMessageContent">{val}</li>;
                    })}
                </ul>
            );
        } else {
            content = contentDivs;
        }

        return (
            !this.state.hide &&
            this.props.errs.length && (
                <div className={this.props.alertClass}>
                    {this.props.allowHide && (
                        <a
                            href="#"
                            className="close"
                            onClick={(...args) => this.hide(...args)}
                        >
                            &times;
                        </a>
                    )}
                    <h4 className="alertSubject">{this.props.errs[0].category}</h4>
                    {content}
                </div>
            )
        );
    }

    // builds a list of <divs> where each contains the content of a single error.
    // styling depends on the number of errors that need to be displayed in sequence, and also
    // on whether any have a subcategory
    buildContentDivs() {
        return this.props.errs.map((err: ErrorSummary) => {
            const cls = this.props.errs.length > 1 ? " emphasizeErrorSubject" : "";
            const summarySpan = <span className={cls}>{err.summary}</span>;
            const detail = err.detail ? ": " + err.detail : "";
            const resolution = err.resolution ? <div>{err.resolution}</div> : <span />;
            // set translated / hyperlinked help text from the trusted server.  contains zero
            // user-provided content, so should be safe from XSS
            const docs = err.docs_link ? (
                <div dangerouslySetInnerHTML={{ "__html": err.docs_link }} />
            ) : (
                <div />
            );

            const subcategorySpan = err.subcategory && (
                <span>
                    <span className="alertSubcategoryDelim">-</span>
                    <span className="alertSubcategory">{err.subcategory}</span>
                </span>
            );

            // if this error provides a workaround, add buttons to execute it or cancel the import
            // entirely
            let workaround = <span />;
            if (err.id && this.props.workaroundCallbacks[err.id]) {
                const cancelBtn = this.props.allowHide && this.props.dismissAllFn && (
                    <button onClick={this.props.dismissAllFn}>Cancel</button>
                );
                workaround = (
                    <div>
                        {cancelBtn}
                        <button
                            onClick={this.props.workaroundCallbacks[err.id]}
                            className="bg-task-callback-btn"
                        >
                            {err.workaround_text}
                        </button>
                    </div>
                );
            }
            return (
                <div className="alertMessageContent">
                    {summarySpan}
                    {subcategorySpan}
                    {detail}
                    {resolution}
                    {docs}
                    {workaround}
                </div>
            );
        });
    }

    hide(event: React.MouseEvent<HTMLAnchorElement>) {
        this.setState({ "hide": true });
    }
}

// implements step 2 of the import -- file upload (and if format is known, submission)
class Step2 extends React.Component<Step2Props, any> {
    render() {
        const disableDrop: boolean =
            this.props.uploadWait ||
            this.props.uploadProcessingWait ||
            this.props.submitPending ||
            this.props.submitSuccess ||
            this.props.submitWait;
        const directions: any = !disableDrop && (
            <div>Click or click-and-drag to upload a file</div>
        );
        const successMsg =
            'Your file has been accepted for import. Press "Next" to complete' +
            " your import.";

        // build the list of accepted mime types
        let accept = "";
        const format: any = this.props.format;
        if (format) {
            accept = format.parsers.map((parser) => parser.mime_type).join(",");
        }

        return (
            <div id="step2" className="stepDiv">
                <ContextFeedback
                    category={this.props.category}
                    protocol={this.props.protocol}
                    format={this.props.format}
                    uploadedFileName={this.props.uploadedFileName}
                    submitSuccess={this.props.submitSuccess}
                    submitWait={this.props.submitWait}
                />
                <BgTaskFeedback
                    showSuccessOnWarnings={false}
                    synchRequestWait={this.props.uploadWait}
                    asynchProcessingWait={this.props.uploadProcessingWait}
                    errors={this.props.uploadErrors}
                    warnings={this.props.uploadWarnings}
                    clearFeedbackFn={this.props.clearFeedbackFn}
                    uploadedFileName={this.props.uploadedFileName}
                    processingComplete={this.props.postUploadStep !== 0}
                    waitTitle="Checking file"
                    waitMsg="Please hang tight..."
                    successTitle="File accepted"
                    successMsg={successMsg}
                    warningWorkarounds={this.props.warningWorkarounds}
                    successActions={{} as SuccessActions}
                />

                <DropZone
                    accept={accept}
                    multiple={false}
                    maxSize={this.props.fileSizeLimit}
                    onDrop={this.props.onDropCallback}
                    disabled={disableDrop}
                >
                    {({
                        getRootProps,
                        getInputProps,
                        isDragActive,
                        isDragAccept,
                        isDragReject,
                    }) => {
                        return (
                            <div
                                {...getRootProps()}
                                className={classNames(
                                    "dropZone",
                                    "overviewDropZone",
                                    "fd-zone",
                                    "excel",
                                    "dz-clickable",
                                    { "dropzone--iActive": isDragActive },
                                    { "dz-drag-hover": isDragActive && isDragAccept },
                                    { "dz-drag-reject": isDragActive && isDragReject },
                                )}
                            >
                                <input {...getInputProps()} />
                                {directions}
                            </div>
                        );
                    }}
                </DropZone>
            </div>
        );
    }

    componentDidMount() {
        // pass the parent component a reference to StepZilla's injected jumpToStep() method. Hack!
        this.props.stepChangeFnCallback(this.props.jumpToStep);
    }

    isValidated() {
        if (!this.props.postUploadStep) {
            this.props.errorCallback({
                "uploadErrors": [
                    {
                        "category": "Data file required",
                        "summary": "Upload a file to continue",
                    },
                ],
                "uploadWarnings": [],
            });
        } else if (this.props.requiredValues.length > 0) {
            return false;
        } else {
            // jump to the next required step (usually not step 3!!)
            this.props.jumpToStep(this.props.postUploadStep);
        }

        // always return false to prevent skip-forward navigation above from getting undone
        return false;
    }
}

export interface Step5State extends ImportContextProps {
    submitWait: boolean;
    submitProcessingWait: boolean;
    submitSuccess: boolean;
    submitErrors: ErrorSummary[];
    submitWarnings: ErrorSummary[];
}

export interface Step5Props extends Step5State {
    submitCallback: any;
    clearFeedbackFn: any;
    successMsg: string;
    successActions: SuccessActions;
}

class Step5 extends React.Component<Step5Props, any> {
    render() {
        const waitMsg = (
            <div>
                <div>
                    You can wait here to monitor its progress, or continue using EDD.
                </div>
                <div>
                    You'll get a message at top right when your import is finished.
                </div>
            </div>
        );
        return (
            <div>
                <ContextFeedback
                    category={this.props.category}
                    protocol={this.props.protocol}
                    format={this.props.format}
                    uploadedFileName={this.props.uploadedFileName}
                    submitSuccess={this.props.submitSuccess}
                    submitWait={this.props.submitWait}
                />
                <BgTaskFeedback
                    showSuccessOnWarnings={true}
                    synchRequestWait={this.props.submitWait}
                    asynchProcessingWait={this.props.submitProcessingWait}
                    errors={this.props.submitErrors}
                    warnings={this.props.submitWarnings}
                    clearFeedbackFn={this.props.clearFeedbackFn}
                    uploadedFileName={this.props.uploadedFileName}
                    processingComplete={this.props.submitSuccess}
                    waitTitle="Processing import"
                    waitMsg={waitMsg}
                    successTitle="Import complete"
                    successMsg={this.props.successMsg}
                    warningWorkarounds={{}}
                    successActions={this.props.successActions}
                />
            </div>
        );
    }
}

class StepPlaceHolder extends React.Component<ImportContextProps, any> {
    render() {
        return (
            <div>
                <ContextFeedback
                    category={this.props.category}
                    protocol={this.props.protocol}
                    format={this.props.format}
                    uploadedFileName={this.props.uploadedFileName}
                    submitSuccess={this.props.submitSuccess}
                    submitWait={this.props.submitWait}
                />
                Not implemented yet
            </div>
        );
    }
}

export interface Step1State {
    categories: any[];
    category: Category;
    protocol: Selectable;
    format: Format;
    emailWhenComplete: any;
    creationErrs: ErrorSummary[];
    categoryHelpContent: string;
    protocolHelpContent: string;
    formatHelpContent: string;
}

export interface Step1Props extends Step1State {
    categorySelectedCallback: (category: Category) => void;
    protocolSelectedCallback: (protocol: Selectable) => void;
    formatSelectedCallback: (format: Format) => void;
    emailSelectedCallback: (event: React.MouseEvent) => void;
    importUUID: string;
    overwriteSelectedCallback: (event: React.MouseEvent) => void;
    duplicateSelectedCallback: (event: React.MouseEvent) => void;
    createNewImportCallback: (event) => void;
    allowOverwrite: boolean;
    allowDuplication: boolean;
    helpUrl: string;
}

export interface Step1InternalState {
    showAdvancedOpts: boolean;
}

// implements step 1 of the import, where user selects data category, protocol, & file format
class Step1 extends React.Component<Step1Props, Step1InternalState> {
    constructor(props) {
        super(props);
        this.state = {
            "showAdvancedOpts": false,
        };
    }

    isValidated() {
        return (
            this.props.category &&
            this.props.protocol &&
            this.props.format &&
            this.props.importUUID
        );
    }

    toggleAdvancedOpts(event) {
        event.preventDefault();
        this.setState({
            "showAdvancedOpts": !this.state.showAdvancedOpts,
        });
    }

    render() {
        const categories = this.props.categories;
        const category = this.props.category;
        const protocol = this.props.protocol;
        const format = this.props.format;

        const workaroundCallbacks = {
            "creation_error": this.props.createNewImportCallback,
        };
        const creationErrs = this.props.creationErrs;
        const advancedClass = this.state.showAdvancedOpts
            ? "disclose"
            : "disclose discloseHide";
        const categoryHelpUri: string = this.props.helpUrl + "#category";
        const protocolHelpUri: string = this.props.helpUrl + "#protocol";
        const formatHelpUri: string = this.props.helpUrl + "#format";

        return (
            <div className="pageSection stepBorder">
                {creationErrs != null && creationErrs.length > 0 && (
                    <ErrCategoryAlert
                        allowHide={false}
                        errs={this.props.creationErrs}
                        workaroundCallbacks={workaroundCallbacks}
                        alertClass="alert alert-danger"
                    />
                )}
                <div className="step1Section">
                    <div className="import2SectionHead">
                        <h2>What category of data do you have?</h2>
                        <HelpButton
                            url={categoryHelpUri}
                            toolTipId="categoryHelp"
                            toolTipContent={this.props.categoryHelpContent}
                        />
                    </div>
                    <MultiButtonSelect
                        options={categories}
                        selectionCallback={this.props.categorySelectedCallback}
                        selected={this.props.category}
                    />
                </div>
                {category !== null && (
                    <div className="step1Section">
                        <div className="import2SectionHead">
                            <h2>What lab protocol did you use?</h2>
                            <HelpButton
                                url={protocolHelpUri}
                                toolTipId="protocolHelp"
                                toolTipContent={this.props.protocolHelpContent}
                            />
                        </div>
                        <MultiButtonSelect
                            options={category.protocols}
                            selectionCallback={this.props.protocolSelectedCallback}
                            selected={this.props.protocol}
                        />
                    </div>
                )}
                {protocol !== null && (
                    <div className="step1Section">
                        <div className="import2SectionHead">
                            <h2>What file format is your data in?</h2>
                            <HelpButton
                                url={formatHelpUri}
                                toolTipId="formatHelp"
                                toolTipContent={this.props.formatHelpContent}
                            />
                        </div>
                        <MultiButtonSelect
                            options={category.file_formats}
                            selectionCallback={this.props.formatSelectedCallback}
                            selected={this.props.format}
                        />
                    </div>
                )}
                {format !== null && format.name === "Table of Data" && (
                    <div>
                        <h4>Unsupported file format</h4>
                        Custom file formatting is not yet supported. To import
                        nonstandard files, use EDD's
                        <a href="../import/">
                            <button
                                type="button"
                                className="actionButton primary larger"
                            >
                                <span className="glyphicon glyphicon-cloud-upload" />
                                Legacy Import
                            </button>
                        </a>
                    </div>
                )}
                {format !== null && (
                    <div className="step1Section">
                        <div>
                            <div className="import2SectionHead">
                                <h2>Options</h2>
                            </div>
                            <input
                                id="emailWhenComplete"
                                type="checkbox"
                                checked={this.props.emailWhenComplete}
                                onClick={this.props.emailSelectedCallback}
                            />
                            <label htmlFor="emailWhenComplete">
                                Email me when finished
                            </label>
                        </div>
                        <div id="advancedDiv" className={advancedClass}>
                            <span>
                                <a
                                    href="#"
                                    id="advancedLink"
                                    className="discloseLink"
                                    onClick={(...args) =>
                                        this.toggleAdvancedOpts(...args)
                                    }
                                >
                                    Advanced
                                </a>
                            </span>
                            <div id="advancedControls" className="discloseBody">
                                <div>
                                    <input
                                        id="overwrite"
                                        type="checkbox"
                                        checked={this.props.allowOverwrite}
                                        onClick={this.props.overwriteSelectedCallback}
                                    />
                                    <label htmlFor="overwrite">
                                        Allow value overwrite (assay ID's only)
                                    </label>
                                </div>
                                <div>
                                    <input
                                        id="allow_duplicates"
                                        type="checkbox"
                                        checked={this.props.allowDuplication}
                                        onClick={this.props.duplicateSelectedCallback}
                                    />
                                    <label htmlFor="allow_duplicates">
                                        Allow duplicate values (line ID's only)
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

// TODO: now that state is better-defined, condense boolean-level variables here and elsewhere in
// the file into an enum
export interface ImportState extends Step1State, Step2State, Step5State {
    "importSocket": ImportSocket;
    "fileSizeLimit": number;
    "nextButtonText": string;
    "importPk": number;
    "importUUID": string;
    "importStatus": string;
    "helpUrl": string;
    "jumpToStep": any;
    // file can be autosubmitted without additional user input. (it's not Table of Data)
    "autoSubmit": boolean;
    "allowOverwrite": boolean; // modifiable in steps 1 and 2
    "allowDuplication": boolean; // step 2 only
    "submitPending": boolean;

    "submitSuccessMsg": string;
}

// parent component for the import
class Import extends React.Component<any, ImportState> {
    constructor(props) {
        super(props);
        const initValues: ImportState = this.buildResetDict();

        // set values that don't get reset after successful import
        initValues.categories = [];
        initValues.jumpToStep = null;
        initValues.fileSizeLimit = 0;
        initValues.helpUrl = null;
        initValues.importSocket = null;
        this.state = initValues;
    }

    buildResetDict(): ImportState {
        // builds a dict of the subset of values defined in ImportState that should be
        // reset when a new import is begun
        return {
            "importPk": null,
            "importUUID": null,
            "importStatus": null,
            "nextButtonText": "Next",

            /* Step 1 state */
            "category": null,
            "protocol": null,
            "format": null,
            "emailWhenComplete": false,

            /* Step 2 state */
            "uploadedFileName": null,
            "uploadWait": false,
            "uploadProcessingWait": false,
            "postUploadStep": 0,
            "uploadErrors": [],
            "uploadWarnings": [],
            "autoSubmit": false,
            "allowOverwrite": false,
            "allowDuplication": false,
            "requiredValues": [],

            /* Step 5 state */
            "submitPending": false,
            "submitWait": false,
            "submitProcessingWait": false,
            "submitSuccess": false,
            "submitErrors": [],
            "submitWarnings": [],
            "submitSuccessMsg": null,
        } as ImportState;
    }

    createNewImport() {
        // create the new import so we can get its UUID to avoid race conditions in processing
        // WS messages following file upload.   If protocol/file format aren't selected yet, we'll
        // select them arbitrarily for now and replace with user selections later in the upload
        // request

        if (!this.state.categories) {
            return;
        }

        const category = this.state.category || this.state.categories[0];
        const protocol = this.state.protocol || category.protocols[0];
        const format = this.state.format || category.file_formats[0];
        $.ajax("/rest/studies/" + EDDData.currentStudyID + "/imports/", {
            "method": "POST",
            "cache": false,
            "contentType": "application/json",
            "data": JSON.stringify({
                "category": category.pk,
                "protocol": protocol.pk,
                "file_format": format.pk,
                "email_when_complete": this.state.emailWhenComplete,
                "allow_overwrite": this.state.allowOverwrite,
                "allow_duplication": this.state.allowDuplication,
            }),
            "dataType": "json",
            "processData": false,
            "success": (...args) => this.createSuccess(...args),
            "error": (...args) => this.createErr(...args),
        });
    }

    createSuccess(result: any, textStatus: string, jqXHR: JQueryXHR): void {
        this.setState({
            "creationErrs": [],
            "importUUID": result.uuid,
            "importPk": result.pk,
        });
    }

    createErr(jqXHR, textStatus: string, errorThrown: string): void {
        this.setState({
            "creationErrs": [
                {
                    "category": "Error creating import",
                    "summary": "",
                    "resolution": "",
                    "id": "creation_error",
                    "workaround_text": "Retry",
                },
            ],
        });
    }

    setEmailWhenComplete(evt) {
        this.setState({ "emailWhenComplete": evt.target.checked });
    }

    overwriteChecked(evt) {
        this.setState({ "allowOverwrite": evt.target.checked });
    }

    duplicateChecked(evt) {
        this.setState({ "allowDuplication": evt.target.checked });
    }

    submitWithOverwrite() {
        this.setState({
            "allowOverwrite": true,
            "submitPending": true,
        });
        this.state.jumpToStep(3);
    }

    submitWithDuplication() {
        this.setState({
            "allowDuplication": true,
            "submitPending": true,
        });
        this.state.jumpToStep(3);
    }

    reset() {
        const params = this.buildResetDict();
        params.categories = this.state.categories;
        this.autoSelectCategory(params);
        this.setState(params);
        this.state.jumpToStep(0);
        this.createNewImport();
    }

    backToStudy() {
        window.location.href = "../";
    }

    render() {
        const step2Workarounds = {
            "overwrite_warning": () => this.submitWithOverwrite(),
            "duplication_warning": () => this.submitWithDuplication(),
        };

        const successActions = {
            "Import Another File": () => this.reset(),
            "Back to Study": () => this.backToStudy(),
        } as SuccessActions;
        const steps = [
            {
                "name": "1. Identify",
                "component": (
                    <Step1
                        categories={this.state.categories}
                        category={this.state.category}
                        creationErrs={this.state.creationErrs}
                        categoryHelpContent={this.state.categoryHelpContent}
                        protocol={this.state.protocol}
                        format={this.state.format}
                        formatHelpContent={this.state.formatHelpContent}
                        helpUrl={this.state.helpUrl}
                        importUUID={this.state.importUUID}
                        categorySelectedCallback={(...args) =>
                            this.categorySelected(...args)
                        }
                        protocolHelpContent={this.state.protocolHelpContent}
                        protocolSelectedCallback={(...args) =>
                            this.protocolSelected(...args)
                        }
                        formatSelectedCallback={(...args) =>
                            this.formatSelected(...args)
                        }
                        emailSelectedCallback={(...args) =>
                            this.setEmailWhenComplete(...args)
                        }
                        emailWhenComplete={this.state.emailWhenComplete}
                        overwriteSelectedCallback={(...args) =>
                            this.overwriteChecked(...args)
                        }
                        createNewImportCallback={() => this.createNewImport()}
                        duplicateSelectedCallback={(...args) =>
                            this.duplicateChecked(...args)
                        }
                        allowOverwrite={this.state.allowOverwrite}
                        allowDuplication={this.state.allowDuplication}
                    />
                ),
            },
            {
                "name": "2. Upload",
                "component": (
                    <Step2
                        fileSizeLimit={this.state.fileSizeLimit}
                        category={this.state.category}
                        protocol={this.state.protocol}
                        format={this.state.format}
                        uploadWait={this.state.uploadWait}
                        uploadProcessingWait={this.state.uploadProcessingWait}
                        uploadedFileName={this.state.uploadedFileName}
                        postUploadStep={this.state.postUploadStep}
                        uploadErrors={this.state.uploadErrors}
                        uploadWarnings={this.state.uploadWarnings}
                        errorCallback={(...args) => this.setState(...args)}
                        onDropCallback={(...args) => this.onFileDrop(...args)}
                        clearFeedbackFn={() => this.clearUploadErrors(true)}
                        overwrite={this.state.allowOverwrite}
                        requiredValues={this.state.requiredValues}
                        submitPending={this.state.submitPending}
                        submitSuccess={this.state.submitSuccess}
                        submitWait={this.state.submitWait}
                        jumpToStep={null}
                        stepChangeFnCallback={(...args) => this.setJumpToStep(...args)}
                        warningWorkarounds={step2Workarounds}
                    />
                ),
            },
            {
                "name": "3. Interpret",
                "component": (
                    <StepPlaceHolder
                        category={this.state.category}
                        protocol={this.state.protocol}
                        format={this.state.format}
                        uploadedFileName={this.state.uploadedFileName}
                        submitSuccess={this.state.submitSuccess}
                        submitWait={this.state.submitWait}
                    />
                ),
            },
            {
                "name": "4. Import",
                "component": (
                    <Step5
                        category={this.state.category}
                        protocol={this.state.protocol}
                        format={this.state.format}
                        uploadedFileName={this.state.uploadedFileName}
                        submitCallback={() => this.enqueueSubmit()}
                        submitWait={this.state.submitWait}
                        submitProcessingWait={this.state.submitProcessingWait}
                        submitSuccess={this.state.submitSuccess}
                        successMsg={this.state.submitSuccessMsg}
                        submitErrors={this.state.submitErrors}
                        submitWarnings={this.state.submitWarnings}
                        clearFeedbackFn={() => this.clearSubmitErrors()}
                        successActions={successActions}
                    />
                ),
            },
        ];
        return (
            <StepZilla
                steps={steps}
                stepsNavigation={false}
                // Note: only applied @ step transition...too late for initial prototype
                nextButtonText={this.state.nextButtonText}
                onStepChange={(step) => this.onStepChange(step)}
            />
        );
    }

    categoriesLookupSuccess(
        result_json: any,
        textStatus: string,
        jqXHR: JQueryXHR,
    ): void {
        // filter out any categories that don't have sufficient configuration to make them useful
        const useableCategories = result_json.results.filter((category) => {
            return category.protocols.length > 0 && category.file_formats.length > 0;
        });

        // auto-select the category if there's only one
        const state = { "categories": useableCategories } as any;
        this.autoSelectCategory(state);
        this.setState(state);

        // create the new import record so we can get its UUID
        this.createNewImport();
    }

    autoSelectCategory(state: any) {
        if (state.categories.length === 1) {
            state.category = state.categories[0];
            this.autoSelectProtocolAndFormat(state.category, state);
        }
    }

    setJumpToStep(jumpToStepFn: (step: number) => void) {
        // hacky function to get a reference to StepZilla's injected jumpToStep() function
        this.setState({ "jumpToStep": jumpToStepFn });
    }

    autoSelectProtocolAndFormat(category: Category, state: any) {
        if (category && category.protocols.length === 1) {
            state.protocol = category.protocols[0];
        }

        if (category.file_formats && category.file_formats.length === 1) {
            state.format = category.file_formats[0];
            // TODO: can't always auto-submit, but this works as a stopgap.
            // unknown (step 3) or data-incomplete file formats can't use this option
            state.autoSubmit = true;
        } else {
            // auto-remove prior selection, even if it's still available.  we
            // don't want to allow user to proceed without making a purposeful selection
            state.format = null;
        }
    }

    categoriesLookupErr(
        jqXHR: JQueryXHR,
        textStatus: string,
        errorThrown: string,
    ): void {
        this.setState({ "categories": [] });
    }

    categorySelected(category: Category) {
        if (category === this.state.category) {
            return;
        }
        const state = { category };
        this.autoSelectProtocolAndFormat(category, state);

        this.setState(state);
        this.clearUploadErrors(true);
    }

    protocolSelected(protocol) {
        if (protocol === this.state.protocol) {
            return;
        }

        const format = null; // clear file format when protocol is changed
        this.setState({
            protocol,
            format,
        });
        this.clearUploadErrors(true);
    }

    formatSelected(format: Format) {
        if (format === this.state.format) {
            return;
        }
        // TODO: can't always auto-submit, but this works as a stopgap
        // unknown (step 3) or data-incomplete file formats can't use this option
        const autoSubmit = true;
        this.setState({
            format,
            autoSubmit,
        });
        this.clearUploadErrors(true);
    }

    uploadSuccess(result: any, textStatus: string, jqXHR: JQueryXHR): void {
        const newImport = !this.state.importUUID;

        // save the import identifiers so we can monitor further status updates to the import and
        // ignore status updates for any others
        this.setState({
            "importPk": result.pk,
            "importUUID": result.uuid,
            "uploadWait": false,
            "uploadProcessingWait": true,
        });

        if (newImport && this.state.autoSubmit) {
            // if the import was just created by the file upload, schedule a second HTTP request to
            // submit it. this sequencing prevents race conditions where the WS status updates,
            // which come over a different TCP connection, could be delivered before the upload
            // POST response, causing the UI to hang even though the import was processed
            this.enqueueSubmit();
        }
    }

    uploadErr(jqXHR, textStatus: string, errorThrown: string): void {
        const contentType = jqXHR.getResponseHeader("Content-Type");
        const vals = {
            "uploadWait": false,
            "uploadWarnings": [],
            "postUploadStep": 0,
        } as any;

        if (jqXHR.status === 504) {
            // TODO: need a workaround for large file uploads that take longer to process, e.g.
            // transcriptomics where GeneIdentifiers are resolved during this step.
            vals.uploadErrors = [
                {
                    "category": "Upload Error",
                    "summary": "Request timed out",
                    "detail": [
                        "Please retry your upload or contact system administrators",
                    ],
                } as ErrorSummary,
            ];
            this.setState(vals);
        } else if (jqXHR.status === 413) {
            const limitMB = this.getUploadLimit();
            vals.uploadErrors = [
                {
                    "category": "Upload Error",
                    "summary": "File too large",
                    "detail": [
                        "Please break your file into parts or contact system" +
                            " administrators. The maximum size for uploaded files is " +
                            limitMB +
                            " MB",
                    ],
                } as ErrorSummary,
            ];
            this.setState(vals);
        } else if (contentType === "application/json") {
            // TODO: add special-case support for working around ICE access errors
            // (Transcriptomics, Proteomics - custom proteins)
            const json = JSON.parse(jqXHR.responseText);
            vals.uploadErrors = json.errors;
            vals.uploadWarnings = json.warnings;
            this.setState(vals);
        } else {
            // if there is a back end or proxy error (likely html response), show this
            vals.uploadErrors = [
                {
                    "category": "Unexpected error",
                    "summary":
                        "There was an unexpected error during your upload. Please try" +
                        " again.  If your upload still fails, please contact" +
                        " system administrators to confirm that they're aware of this problem.",
                },
            ];
            this.setState(vals);
        }
    }

    clearUploadErrors(removeFile = false) {
        const vals = {
            "uploadErrors": [],
            "uploadWarnings": [],
        } as any;
        if (removeFile) {
            vals.uploadedFileName = null;
            vals.postUploadStep = 0;
        }
        this.setState(vals);

        this.markCurrentStepRetry();
    }

    clearSubmitErrors() {
        this.setState({
            "submitErrors": [],
            "submitWarnings": [],
        });
    }

    onFileDrop(acceptedFiles: File[], rejectedFiles: File[], evt) {
        this.clearUploadErrors(true);

        if (acceptedFiles.length) {
            // build form data to submit to the back end, updating all the config that may have
            // been updated since initial record creation
            const data: FormData = new FormData();
            const file: File = acceptedFiles[0]; // DZ is configured to only accept one
            data.set("category", "" + this.state.category.pk);
            data.set("protocol", "" + this.state.protocol.pk);
            data.set("file_format", "" + this.state.format.pk);
            data.set("file", file);
            data.set("email_when_complete", "" + this.state.emailWhenComplete);
            data.set("allow_overwrite", "" + this.state.allowOverwrite);
            data.set("allow_duplication", "" + this.state.allowDuplication);

            if (this.state.autoSubmit) {
                data.set("status", "Submitted");
            }

            // if we're re-uploading a file after the import is created, but before
            // submission, creating new DB records for re-uploads
            let method = "POST";
            let url = "/rest/studies/" + EDDData.currentStudyID + "/imports/";
            if (this.state.importPk) {
                method = "PATCH";
                url += this.state.importPk + "/";
            }

            this.setState({
                "uploadWait": true,
                "uploadedFileName": file.name,
                "submitWait": false,
                "submitSuccess": false,
                "submitErrors": [],
            });
            $.ajax(url, {
                "method": method,
                "cache": false,
                "contentType": false, // Note: 'multipart/form-data' doesn't work w/ file
                "data": data,
                "dataType": "json",
                "processData": false,
                "success": (...args) => this.uploadSuccess(...args),
                "error": (...args) => this.uploadErr(...args),
            });
        } else {
            const file = rejectedFiles[0];
            const errs: ErrorSummary[] = [];
            if (file.size > this.state.fileSizeLimit) {
                const limitMB = this.getUploadLimit();
                errs.push({
                    "category": "File too large",
                    "summary": `File "${rejectedFiles[0].name}" is larger than the upload limit of
                        ${limitMB} MB.`,
                    "resolution": "Please break up your file for upload",
                });
            }
            const format: Format = this.state.format;
            const supportedType = format.parsers.some(
                (parser) => parser.mime_type === file.type,
            );
            if (!supportedType) {
                // if we don't have a parser for this mime type, build a helpful error message for
                // the user
                const uniqueExtensions = format.parsers
                    .map((parser) => parser.extension)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .sort();
                errs.push({
                    "category": "Unsupported file format",
                    "summary": `File "${rejectedFiles[0].name}" does not match format
                        "${format.name}", or the file's format was not detected correctly`,
                    "detail": [
                        `Files in the ${
                            format.name
                        } format should have one of the following
                         extensions ${uniqueExtensions.join(
                             ", ",
                         )}. The root cause is that your  +
                         browser reported unsupported MIME type "${file.type}"`,
                    ],
                    "resolution":
                        "Go back to Step 1 and select the correct format for this" +
                        " file, or reformat your data in a supported format.",
                });
            }

            if (!errs.length) {
                errs.push({
                    "category": "Unexpected error",
                    "summary": `Your file "${rejectedFiles[0].name}" was rejected.`,
                    "resolution":
                        "Please contact administrators for help resolving this" +
                        " problem",
                });
            }
            this.setState({
                "uploadErrors": errs,
            });
        }
    }

    // gets the configured file size limit in MB for user display
    getUploadLimit() {
        return (this.state.fileSizeLimit / (1024 * 1024)).toFixed(2);
    }

    onStepChange(stepIndex: number) {
        if (stepIndex === 3) {
            if (
                this.state.submitErrors &&
                this.state.submitErrors.length === 0 &&
                !this.state.submitWait &&
                !this.state.submitProcessingWait &&
                !this.state.submitSuccess
            ) {
                this.enqueueSubmit();
            }
        } else if (stepIndex === 2) {
            // don't allow the user to use the "prev" button to go back to step 3, which isn't
            // implemented yet, so was never used
            if (this.state.postUploadStep === 3) {
                this.state.jumpToStep(1);
            }
        } else if (stepIndex === 0) {
            // if user goes back to step 1 after a failed upload, e.g. because the wrong
            // format was chosen, remove errors so step 2 starts fresh
            this.clearUploadErrors(true);
        }
    }

    markCurrentWizardStepComplete() {
        // override styling on the StepZilla step header so it's marked "done" when the process
        // is complete
        $(".progtrckr-doing")
            .addClass("progtrckr-done")
            .removeClass("progtrckr-doing")
            .removeClass("progtrckr-warned")
            .removeClass("progtrckr-failed");
    }

    markCurrentWizardStepFailed() {
        // override styling on the StepZilla step header so it looks failed. Uses custom styles
        // in import2.css
        $(".progtrckr-doing")
            .addClass("progtrckr-failed")
            .removeClass("progtrkr-warned")
            .removeClass("progtrckr-done");
    }

    markCurrentWizardStepWarned() {
        // override styling on the StepZilla step header so it looks failed. Uses custom styles
        // in import2.css
        $(".progtrckr-doing")
            .addClass("progtrckr-warned")
            .removeClass("progtrckr-failed")
            .removeClass("progtrckr-done");
    }

    markCurrentStepRetry() {
        // override styling on the StepZilla step header so a previously failed step (e.g. #2)
        // has its "failed" styling removed
        $(".progtrckr-doing")
            .removeClass("progtrckr-warned")
            .removeClass("progtrckr-failed");
    }

    enqueueSubmit() {
        this.setState({ "submitPending": true });
    }

    submitImport() {
        // sends an AJAX request to submit the import independently of a file upload. To see
        // client code that triggers this submit, look for usages of enqueueSubmit().
        // All simple  parameters from step 1 are always included.

        // TODO: disable changes in previous steps, short of clearing all the state...otherwise
        // subsequent use of the form to upload new files risks overwriting records of previous
        // imports performed without reloading the page

        // TODO: provide required values entered in earlier steps, if any
        this.setState({
            "uploadProcessingWait": false,
            "submitPending": false,
            "submitWait": true,
            "submitSuccess": false,
            "submitWarnings": [],
            "submitErrors": [],
        });
        $.ajax(
            "/rest/studies/" +
                EDDData.currentStudyID +
                "/imports/" +
                this.state.importPk +
                "/",
            {
                "method": "PATCH",
                "cache": false,
                "contentType": "application/json",
                "data": JSON.stringify({
                    "category": this.state.category.pk,
                    "protocol": this.state.protocol.pk,
                    "file_format": this.state.format.pk,
                    "status": "Submitted",
                    "email_when_complete": this.state.emailWhenComplete,
                    "allow_overwrite": this.state.allowOverwrite,
                    "allow_duplication": this.state.allowDuplication,
                }),
                "dataType": "json",
                "processData": false,
                "success": (...args) => this.submitSuccess(...args),
                "error": (...args) => this.submitErr(...args),
            },
        );
    }

    componentDidUpdate() {
        // per React documentation, do AJAX requests outside of the render phase, which
        // shouldn't have side effects and which React may abort, pause, or restart
        if (this.state.submitPending) {
            this.submitImport();
        }
    }

    submitSuccess(result_json: any, textStatus: string, jqXHR: JQueryXHR) {
        this.setState({
            "submitSuccess": true,
            "submitErrors": [],
            "submitWait": false,
            "submitProcessingWait": true,
        });
    }

    submitErr(jqXHR, textStatus: string, errorThrown: string): void {
        const contentType = jqXHR.getResponseHeader("Content-Type");

        const vals = {
            "submitWait": false,
        } as any;

        if (contentType === "application/json") {
            const json = JSON.parse(jqXHR.responseText);
            vals.submitErrors = json.errors;
            this.setState(vals);
            this.markCurrentWizardStepFailed();
        } else {
            // if there is a back end or proxy error (likely html response), show this
            vals.submitErrors = [
                {
                    "category": "Unexpected error",
                    "summary":
                        "There was an unexpected error submitting your import. Please try" +
                        " again.  If your upload still fails, please contact" +
                        " system administrators to confirm that they're aware of this problem.",
                } as ErrorSummary,
            ];
            this.setState(vals);
            this.markCurrentWizardStepFailed();
        }
    }

    importMsgReceived(msg: Message) {
        // processes incoming WS messages from the import.  Note that messages will include all
        // imports for this user ID, which could potentially be many in parallel.
        if (!Object.prototype.hasOwnProperty.call(msg, "payload")) {
            return;
        }
        const json = msg.payload;

        // ignore notifications for other simultaneous imports by this user (e.g. from another
        // tab).  Depending on unprdictable delivery order of the initial CREATED WS message vs the
        // synchronous HTTP response from uploading the file, we may ignore the initial CREATED msg
        if (json.uuid !== this.state.importUUID) {
            return;
        }

        let state: any;

        // do processing based on the latest status of this import as determined by the back end.
        // note this is the ONLY place in the code where the import's status should be modified.
        // Otherwise, we risk race conditions in message delivery, e.g. when re-uploading a
        // corrected file
        switch (msg.payload.status) {
            case "Created":
                // we can't depend on this message, since we have no way of knowing it's for
                // this import unless it happens to be delivered *after* the sync HTTP request
                // for the upload
                break;
            case "Resolved":
                this.setState({
                    "importStatus": msg.payload.status,
                    "postUploadStep": 2,
                    "uploadWait": false,
                    "uploadProcessingWait": false,
                    // note this can happen! e.g. missing inputs
                    "uploadErrors": json.errors || [],
                    "uploadWarnings": json.warnings || [],
                    "nextButtonText": "Next", // StepZilla bug?
                    "requiredValues": json.required_inputs || [],
                    "submitProcessingWait": false,
                });
                // TODO: doesn't hold after resolve step is implemented
                this.state.jumpToStep(1);
                if (json.errors && json.errors.length > 0) {
                    this.markCurrentWizardStepFailed();
                } else {
                    this.markCurrentWizardStepWarned();
                }

                break;
            case "Ready":
                state = {
                    "importStatus": msg.payload.status,
                    "postUploadStep": 3,
                    "uploadWait": false,
                    "uploadProcessingWait": false,
                    "uploadWarnings": json.warnings || [],
                    "requiredValues": json.required_inputs || [],
                    "nextButtonText": "Submit Import", // StepZilla bug?
                } as any;

                // if import was auto-submitted, set state that indicates we're waiting for it to
                // process
                if (this.state.autoSubmit) {
                    state.submitProcessingWait = true;
                }
                this.setState(state);

                if (this.state.autoSubmit) {
                    this.state.jumpToStep(3);
                }
                break;
            case "Failed":
                state = {
                    "importStatus": msg.payload.status,
                    "uploadWait": false,
                    "uploadProcessingWait": false,
                    "submitWait": false,
                    "submitProcessingWait": false,
                    // TODO: should be more nuanced here, depending on which step failed..e.g.
                    // final processing failure should stay "submit"
                    "nextButtonText": "Next",
                } as any;

                if (this.state.uploadWait || this.state.uploadProcessingWait) {
                    state.uploadErrors = json.errors || [];
                    state.uploadWarnings = json.warnings || [];
                } else {
                    state.submitErrors = json.errors || [];
                    state.submitWarnings = json.warnings || [];
                }
                this.setState(state);
                this.markCurrentWizardStepFailed();
                break;
            case "Submitted":
                this.setState({
                    "importStatus": msg.payload.status,
                    "submitProcessingWait": true,
                    "submitWait": false,
                    "submitSuccess": false,
                    "submitWarnings": [],
                    "submitErrors": [],
                    "uploadWait": false,
                    "uploadProcessingWait": false,
                });
                // jump to the final step to cover cases where
                this.state.jumpToStep(3);
                break;
            case "Completed":
                this.setState({
                    "importStatus": msg.payload.status,
                    "submitSuccess": true,
                    "submitSuccessMsg": msg.message,
                    "submitErrors": json.errors || [],
                    "submitWarnings": json.warnings || [],
                    "submitWait": false,
                    "submitProcessingWait": false,
                    "nextButtonText": "Next",
                });
                this.markCurrentWizardStepComplete();
        }
    }

    componentDidMount() {
        // send CSRF header on each AJAX request from this page
        $.ajaxSetup({
            "beforeSend": (xhr) => {
                xhr.setRequestHeader("X-CSRFToken", Utl.EDD.findCSRFToken());
            },
        });

        // get categories and associated protocols & file formats
        $.ajax("/rest/import_categories/?ordering=display_order", {
            "headers": { "Content-Type": "application/json" },
            "method": "GET",
            "dataType": "json",
            "success": (...args) => this.categoriesLookupSuccess(...args),
            "error": (...args) => this.categoriesLookupErr(...args),
        });

        // get server-side configuration passed via hidden form inputs
        const helpUrl: string = $("#helpURL").val();
        const uploadLimit: number = $("#uploadSizeLimit").val();

        // open a websocket for page-specific intermediate status notifications, as well as
        // final disposition so we're guaranteed delivery order over a single channel
        const importSocket = new ImportSocket();
        importSocket.subscribe((...args) => this.importMsgReceived(...args));

        // subscribe to import-related pass/fail notifications from the main notification menu
        notificationSocket.addTagAction("import-status-update", (msg) => {
            if (document.hasFocus()) {
                // mark the user-notification as read since we're already displaying that state
                // on this page. notification is only needed when user is on other pages
                notificationSocket.markRead(msg.uuid);
            }
        });

        // get translated help content from the template for use in step 1 rendering
        const categoryHelpContent: string = $("#categoryHelpContent")
            .remove()
            .removeClass("hide")
            .html();

        const protocolHelpContent: string = $("#protocolHelpContent")
            .remove()
            .removeClass("hide")
            .html();

        const formatHelpContent: string = $("#formatHelpContent")
            .remove()
            .removeClass("hide")
            .html();

        this.setState({
            categoryHelpContent,
            formatHelpContent,
            protocolHelpContent,
            "fileSizeLimit": uploadLimit,
            importSocket,
            helpUrl,
        });
    }
}

ReactDOM.render(<Import />, document.getElementById("importWizard"));
