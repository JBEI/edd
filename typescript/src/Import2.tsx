"use strict";

import {Message} from "../modules/Notification";
import {notificationSocket} from "./Common";
import * as $ from "jquery";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as Utl from "../modules/Utl";
import DropZone from "react-dropzone";
import StepZilla from "react-stepzilla";


/* tslint:disable */
declare function require(name: string): any;  // avoiding warnings for require calls below
require("react-stepzilla.css");
/* tslint:enable */

class HelpButton extends React.Component {
    render() {
        return <span className="helpButton"/>;
    }
}

export interface Selectable {
    name: string;
    pk: number;
}

export interface Category extends Selectable {
    protocols: Selectable[];
    file_formats: Selectable[];
}

export interface SelectProps<T extends Selectable> {
    options: T[];
    selected: T;
    selectionCallback: any;
}

class MultiButtonSelect<T extends Selectable> extends React.Component<SelectProps<T>, any> {
    constructor(props) {
        super(props);
    }

    render() {
        const options: T[] = this.props.options || [];
        const selectionCallback = this.props.selectionCallback;

        return <div>
            {
                options.map((option: T) => {
                    const selected: T = this.props.selected;
                    let classes = "btn btn-default";
                    if (selected && (selected.pk === option.pk)) {
                        classes += " active";
                    }

                    return <button className={classes}
                                   onClick={() => selectionCallback(option)}>{option.name}
                                </button>;
                })
            }
            </div>;
    }
}

export interface Step2State extends ImportContextProps {
    acceptMimeTypes: string;
    uploadWait: boolean;
    uploadProcessingWait: boolean;
    uploadedFileName: string;
    postUploadStep: number;
    uploadErrors: ErrorSummary[];
    uploadWarnings: ErrorSummary[];
}

export interface Step2Props extends Step2State {
    onDropCallback: any;
    errorCallback: any;
    clearFeedbackFn: any;
    submitCallback: any;
    jumpToStep: any; // injected by StepZilla
    stepChangeFnCallback: any; // hacky way of giving the Import component access to change steps
}

// TODO: merge with similar TS class in Study-Lines-Add-Combos.ts
export interface ErrorSummary {
    category: string;
    summary: string;
    subcategory?: string;
    detail?: string[];
    resolution?: string;
    doc_url?: string;
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
    waitMsg: string;
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
        const newCategory: boolean = (error.category !== prevCategory);

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
            return <div className="alert alert-info">
                        <h4>{this.props.waitTitle} <span className="wait step2-wait"/></h4>
                        { this.props.waitMsg }
                        </div>;
        }
        if ((!this.props.errors || !this.props.warnings) ||
            !(this.props.errors.length || this.props.warnings.length)) {
            if (this.props.processingComplete) {
                return <SuccessAlert successTitle={this.props.successTitle}
                                     successMsg={this.props.successMsg}
                                     uploadedFileName={this.props.uploadedFileName}/>;
            }
            return <div/>;
        }

        const total: number = this.props.errors.length + this.props.warnings.length;

        // show errors, if any
        const errsByCategory: ErrorSummary[][] = categorizeErrs(this.props.errors);
        const errorAlerts = errsByCategory.map((categoryErrors: ErrorSummary[]) => {
            return <ErrCategoryAlert errs={categoryErrors} alertClass="alert alert-danger"/>;
        });

        // show warnings, if any
        const warningsByCategory: ErrorSummary[][] = categorizeErrs(this.props.warnings);
        const warningAlerts = warningsByCategory.map(
            (categoryWarnings: ErrorSummary[]) => {
                return <ErrCategoryAlert errs={categoryWarnings}
                                         alertClass="alert alert-warning"/>;
            });

        return <div>
                    {total > 4 &&
                        <button className="btn btn-info"
                                onClick={this.props.clearFeedbackFn(false)}>Dismiss
                        </button>
                    }
                    {errorAlerts}{warningAlerts}
                    </div>;
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
}

// essentially a workaround for the fact that bootstrap's dismissable alerts don't play well with
// React.
export interface ErrSequenceState {
    hide: boolean;
}

export interface ImportContextProps {
    category: Category;
    protocol: Selectable;
    format: Selectable;
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
        const cat = category && <div className="contextBreadcrumbs">
            <span className="contextSectionHeader">Category:</span> {category.name}
        </div>;
        const prot = protocol && <div className="contextBreadcrumbs">
            <span className="contextSectionHeader">Protocol:</span> {protocol.name}
        </div>;
        const fileFormat = fmt && <div className="contextBreadcrumbs">
            <span className="contextSectionHeader">Format:</span>{fmt.name}</div>;
        const file = (fileName) && <div className="contextBreadcrumbs">
            <span className="contextSectionHeader">File:</span> {fileName}
        </div>;

        return <div>{cat}{prot}{fileFormat}{file}</div>;
    }
}

export interface SuccessProps {
    uploadedFileName: string;
    successTitle: string;
    successMsg: string;
}

class SuccessAlert extends React.Component<SuccessProps, any> {
    render() {
        return <div className="alert alert-success">
                    <h4>{this.props.successTitle}</h4>
                    {this.props.successMsg}
                    </div>;
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
            hide: false,
        };
    }

    render() {
        const contentDivs = this.buildContentDivs();
        let content;
        if (this.props.errs.length > 1) {
            content = <ul> {
                contentDivs.map((val) => {
                    return <li className="errorMessageContent">{val}</li>;
                })
            }
            </ul>;
        } else {
            content = contentDivs;
        }

        return ((!this.state.hide) && this.props.errs.length &&
            <div className={this.props.alertClass}>
                <a href="#" className="close" onClick={this.hide.bind(this)}>&times;</a>
                <h4 className="alertSubject">{this.props.errs[0].category}</h4>
                {content}
            </div>
        );
    }

    // builds a list of <divs> where each contains the content of a single error.
    // styling depends on the number of errors that need to be displayed in sequence, and also
    // on whether any have a subcategory
    buildContentDivs() {
        return this.props.errs.map((err: ErrorSummary) => {
            const cls = this.props.errs.length > 1 ? ' emphasizeErrorSubject' : '';
            const summaryTxt = (err.subcategory ? (err.summary + ' -- ' + err.subcategory)
                                                : err.summary);
            const summarySpan = <span className={cls}>{summaryTxt}</span>;
            if (!err.detail) {
                return <div className="errorMessageContent">{summarySpan}</div>;
            }
            const detail = err.detail ? ": " + err.detail : "";
            return <div className="errorMessageContent">
                {summarySpan}{detail}
            </div>;
        });
    }

    hide(event: React.MouseEvent<HTMLAnchorElement>) {
        this.setState({hide: true});
    }
}

// implements step 2 of the import -- file upload (and if format is known, submission)
class Step2 extends React.Component<Step2Props, any> {
    render() {
        const tenMB: number = 1048576;
        const disableDrop: boolean = (this.props.uploadWait || this.props.uploadProcessingWait ||
            this.props.submitSuccess || this.props.submitWait);
        const directions = (!disableDrop) && <div>Click or click-and-drag to upload a file</div>;
        const successMsg = 'Your file has been accepted for import. Press "Next" to complete' +
                           ' your import.';

        return <div className="stepDiv">
                    <ContextFeedback category={this.props.category} protocol={this.props.protocol}
                                     format={this.props.format}
                                     uploadedFileName={this.props.uploadedFileName}
                                     submitSuccess={this.props.submitSuccess}
                                     submitWait={this.props.submitWait}/>
                    <BgTaskFeedback
                        synchRequestWait={this.props.uploadWait}
                        asynchProcessingWait={this.props.uploadProcessingWait}
                        errors={this.props.uploadErrors}
                        warnings={this.props.uploadWarnings}
                        clearFeedbackFn={this.props.clearFeedbackFn}
                        uploadedFileName={this.props.uploadedFileName}
                        processingComplete={this.props.postUploadStep !== 0}
                        waitTitle="Processing file"
                        waitMsg="Please hang tight while your file is processed..."
                        successTitle="File accepted"
                        successMsg={successMsg}/>
                    <DropZone accept={this.props.acceptMimeTypes} multiple={false} maxSize={tenMB}
                              onDrop={this.props.onDropCallback} disabled={disableDrop}
                              className="overviewDropZone dropzone fd-zone excel dz-clickable"
                              acceptClassName="dz-drag-hover">
                        {directions}
                    </DropZone>
                    </div>;
    }

    componentDidMount() {
        // pass the parent component a reference to StepZilla's injected jumpToStep() method. Hack!
        this.props.stepChangeFnCallback(this.props.jumpToStep)
    }

    isValidated() {
        if (!this.props.postUploadStep) {
            this.props.errorCallback({
                uploadErrors: [{
                    category: 'Data file required',
                    summary: 'Upload a file to continue',
                }],
                uploadWarnings: [],
            });
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
}

class Step5 extends React.Component<Step5Props, any> {
    render() {
        const waitMsg = ("You can wait here to monitor its progress, or continue using EDD. " +
                         "You'll get a message at top right when your import is finished.");
        return <BgTaskFeedback
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
                        successMsg=""/>
    }
}

class StepPlaceHolder extends React.Component<ImportContextProps, any> {
    render() {
        return <div>
                    <ContextFeedback category={this.props.category}
                                     protocol={this.props.protocol}
                                     format={this.props.format}
                                     uploadedFileName={this.props.uploadedFileName}
                                     submitSuccess={this.props.submitSuccess}
                                     submitWait={this.props.submitWait}/>
                    Not implemented yet
               </div>;
    }
}

export interface Step1State {
    categories: any[];
    category: Category;
    protocol: Selectable;
    format: Selectable;
}

export interface Step1Props extends Step1State {
    categorySelectedCallback: any;
    protocolSelectedCallback: any;
    formatSelectedCallback: any;
}

// implements step 1 of the import, where user selects data catagory, protocol, & file format
class Step1 extends React.Component<Step1Props, any> {
    constructor(props) {
        super(props);
    }

    isValidated() {
        return this.props.category && this.props.protocol && this.props.format;
    }

    render() {
        const categories = this.props.categories;
        const category = this.props.category;
        const protocol = this.props.protocol;
        const format = this.props.format;

        return <div className="pageSection stepBorder">
                    <div className="import2SectionHead">
                        <h2>What category of data do you have?</h2>
                    </div>
                    <div className="import2SectionContent">
                        <div>
                            <MultiButtonSelect
                                options={categories}
                                selectionCallback={this.props.categorySelectedCallback}
                                selected={this.props.category}/>
                        </div>
                        {
                            category !== null &&
                            <div className="pageSection stepBorder">
                                <h2>What lab protocol did you use?</h2>
                                <MultiButtonSelect
                                    options={category.protocols}
                                    selectionCallback={this.props.protocolSelectedCallback}
                                    selected={this.props.protocol}/>
                            </div>
                        }
                        {
                            protocol !== null &&
                            <div className="pageSection stepBorder">
                                <h2>What file format is your data in?</h2>
                                <MultiButtonSelect
                                    options={category.file_formats}
                                    selectionCallback={this.props.formatSelectedCallback}
                                    selected={this.props.format}/>
                            </div>
                        }
                        {
                            format !== null && format.name === 'Table of Data' &&
                            <div>
                                <h4>Unsupported file format</h4>
                                Custom file formatting is not yet supported. To import nonstandard
                                files, use EDD's
                                <a href="../import/">
                                    <button type="button" className="actionButton primary larger">
                                        <span className="glyphicon glyphicon-cloud-upload"/>
                                        Legacy Import
                                    </button>
                                </a>
                            </div>
                        }
            </div>
        </div>;
    }
}

export interface ImportState extends Step1State, Step2State, Step5State {
    nextButtonText: string;
    importPk: number;
    importUUID: string;
    jumpToStep: any;
    autoSubmit: boolean;
}

// parent component for the import
class Import extends React.Component<any, ImportState> {
    constructor(props) {
        super(props);
        /* TODO: mime types should eventually depend on user-selected file format */
        const mimeTypes = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
            "text/csv";
        this.state = {
            importPk: null,
            importUUID: null,
            nextButtonText: 'Next',

            /* Step 1 state */
            categories: [],
            category: null,
            protocol: null,
            format: null,

            /* Step 2 state */
            acceptMimeTypes: mimeTypes,
            uploadedFileName: null,
            uploadWait: false,
            uploadProcessingWait: false,
            postUploadStep: 0,
            uploadErrors: [],
            uploadWarnings: [],
            autoSubmit: false,

            /* Step 5 state */
            submitWait: false,
            submitProcessingWait: false,
            submitSuccess: false,
            submitErrors: [],
            submitWarnings: [],

            jumpToStep: null,
        };
    }

    render() {
        const steps =
            [
                {
                    name: '1. Identify',
                    component: <Step1 categories={this.state.categories}
                                      category={this.state.category}
                                      protocol={this.state.protocol}
                                      format={this.state.format}
                                      categorySelectedCallback={this.categorySelected.bind(this)}
                                      protocolSelectedCallback={this.protocolSelected.bind(this)}
                                      formatSelectedCallback={this.formatSelected.bind(this)}/>,
                },
                {
                    name: '2. Upload',
                    component: <Step2 acceptMimeTypes={this.state.acceptMimeTypes}
                                      category={this.state.category}
                                      protocol={this.state.protocol}
                                      format={this.state.format}
                                      uploadWait={this.state.uploadWait}
                                      uploadProcessingWait={this.state.uploadProcessingWait}
                                      uploadedFileName={this.state.uploadedFileName}
                                      postUploadStep={this.state.postUploadStep}
                                      uploadErrors={this.state.uploadErrors}
                                      uploadWarnings={this.state.uploadWarnings}
                                      errorCallback={this.setState.bind(this)}
                                      onDropCallback={this.onFileDrop.bind(this)}
                                      clearFeedbackFn={this.clearUploadErrors.bind(this)}
                                      submitCallback={this.submitImport.bind(this)}
                                      submitSuccess={this.state.submitSuccess}
                                      submitWait={this.state.submitWait}
                                      jumpToStep={null}
                                      stepChangeFnCallback={this.setJumpToStep.bind(this)}/>,
                },
                {
                    name: '3. Interpret',
                    component: <StepPlaceHolder category={this.state.category}
                                                protocol={this.state.protocol}
                                                format={this.state.format}
                                                uploadedFileName={this.state.uploadedFileName}
                                                submitSuccess={this.state.submitSuccess}
                                                submitWait={this.state.submitWait}/>,
                },
                {
                    name: '4. Import',
                    component: <Step5 category={this.state.category}
                                      protocol={this.state.protocol}
                                      format={this.state.format}
                                      uploadedFileName={this.state.uploadedFileName}
                                      submitCallback={this.submitImport.bind(this)}
                                      submitWait={this.state.submitWait}
                                      submitProcessingWait={this.state.submitProcessingWait}
                                      submitSuccess={this.state.submitSuccess}
                                      submitErrors={this.state.submitErrors}
                                      submitWarnings={this.state.submitWarnings}
                                      clearFeedbackFn={this.clearSubmitErrors.bind(this)}/>,
                },
            ];
        return <StepZilla steps={steps}
                          stepsNavigation={false}
            // Note: only applied @ step transition...too late for initial prototype
                          nextButtonText={this.state.nextButtonText}
                          onStepChange={this.onStepChange.bind(this)}/>;
    }

    categoriesLookupSuccess(result_json: any, textStatus: string, jqXHR: JQueryXHR): void {
        // filter out any categories that don't have sufficient configuration to make them useful
        const configuredCategories = result_json.results.filter((category) => {
                return (category.protocols.length > 0) && (category.file_formats.length > 0);
        });

        // auto-select the category if there's only one
        const state = {"categories": configuredCategories} as any;
        if (configuredCategories.length === 1) {
            const category = configuredCategories[0];
            state.category = category;
            this.autoSelectProtocolAndFormat(category, state);
        }
        this.setState(state);
    }

    setJumpToStep(jumpToStepFn: any) {
        // hacky function to get a reference to StepZilla's injected jumpToStep() function
        this.setState({'jumpToStep': jumpToStepFn });
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
        }
    }

    categoriesLookupErr(jqXHR: JQueryXHR, textStatus: string, errorThrown: string): void {
        this.setState({categories: []});
    }

    categorySelected(category) {
        if (category === this.state.category) {
            return;
        }
        const state = {category: category};
        this.autoSelectProtocolAndFormat(category, state);

        this.setState(state);
        this.clearUploadErrors(true);
    }

    protocolSelected(protocol) {
        if (protocol === this.state.protocol) {
            return;
        }

        this.setState({
            protocol: protocol,
            format: null,
        });
        this.clearUploadErrors(true);
    }

    formatSelected(format) {
        if (format === this.state.format) {
            return;
        }
        this.setState({
            format: format,
            // TODO: can't always auto-submit, but this works as a stopgap
            // unknown (step 3) or data-incomplete file formats can't use this option
            autoSubmit: true,
        });
        this.clearUploadErrors(true);
    }

    uploadSuccess(result: any, textStatus: string, jqXHR: JQueryXHR): void {
        this.setState({
            importPk: result.pk,
            uploadWait: false,
            uploadProcessingWait: true,

        });
    }

    uploadErr(jqXHR, textStatus: string, errorThrown: string): void {

        const contentType = jqXHR.getResponseHeader('Content-Type');
        const vals = {
            uploadWait: false,
            uploadWarnings: [],
            postUploadStep: 0,
        } as any;

        if (jqXHR.status === 504) {
            // TODO: need a workaround for large file uploads that take longer to process, e.g.
            // transcriptomics where GeneIdentifiers are resolved during this step.
            vals.uploadErrors = [{
                category: "Upload Error",
                summary: "Request timed out",
                detail: ["Please retry your upload or contact system administrators"],
            } as ErrorSummary];
            this.setState(vals);
        } else if (jqXHR.status === 413) {
            vals.uploadErrors = [{
                category: "Upload Error",
                summary: "File too large",
                detail: ["Please break your file into parts or contact system" +
                         " administrators."],
            } as ErrorSummary];
            this.setState(vals);
        } else if (contentType === 'application/json') {
            // TODO: add special-case support for working around ICE access errors
            // (Transcriptomics, Proteomics - custom proteins)
            const json = JSON.parse(jqXHR.responseText);
            vals.uploadErrors = json.errors;
            vals.uploadWarnings = json.warnings;
            this.setState(vals);
        } else {
            // if there is a back end or proxy error (likely html response), show this
            vals.uploadErrors = [{
                category: "Unexpected error",
                summary: "There was an unexpected error during your upload. Please try" +
                    " again.  If your upload still fails, please contact" +
                    " system administrators to confirm that they're aware of this problem.",
            }];
            this.setState(vals);
        }
    }

    clearUploadErrors(removeFile: boolean) {
        const vals = {
            uploadErrors: [],
            uploadWarnings: [],
        } as any;
        if (removeFile) {
            vals.uploadedFileName = null;
            vals.postUploadStep = 0;
        }
        this.setState(vals);
    }

    clearSubmitErrors() {
        this.setState({
            submitErrors: [],
            submitWarnings: [],
        });
    }

    onFileDrop(acceptedFiles, rejectedFiles) {
        this.clearUploadErrors(true);

        if (acceptedFiles.length) {
            const data: FormData = new FormData();
            const file: File = acceptedFiles[0];  // DZ is configured to only accept one
            data.append('category', "" + this.state.category.pk);
            data.append('protocol', "" + this.state.protocol.pk);
            data.append('file_format', "" + this.state.format.pk);
            data.append('file', file);
            data.append('uuid', this.state.importUUID);

            if(this.state.autoSubmit) {
                data.append('status', 'Submitted');
            }

            // if we're re-uploading a file after the import is created, but before
            // submission, creating new DB records for re-uploads
            let method = 'POST';
            let url = '/rest/studies/' + EDDData.currentStudyID + '/imports/';
            if(this.state.importPk) {
                method = 'PATCH';
                url += this.state.importPk + '/'
            }

            this.setState({
                uploadWait: true,
                uploadedFileName: file.name,
                submitWait: false,
                submitSuccess: false,
                submitErrors: [],
            });
            $.ajax(url,
                {
                    method: method,
                    cache: false,
                    contentType: false,  // Note: 'multipart/form-data' doesn't work w/ file
                    data: data,
                    dataType: 'json',
                    processData: false,
                    success: this.uploadSuccess.bind(this),
                    error: this.uploadErr.bind(this),
                },
            );
        } else {
            this.setState({
                uploadErrors: [{
                    category: 'Unsupported file format',
                    summary: ('File "' + rejectedFiles[0].filename + '" is the wrong format.' +
                              ' Only .XLSX and .CSV files are supported'),
                } as ErrorSummary],
            });
        }
    }

    onStepChange(stepIndex: number) {
        if (stepIndex === 3 &&
            (this.state.submitErrors && this.state.submitErrors.length === 0) &&
            (!this.state.submitWait) &&
            (!this.state.submitProcessingWait) &&
            (!this.state.submitSuccess)) {
            this.submitImport();
        }
    }

    submitImport() {
        // TODO: disable changes in previous steps, short of clearing all the state...otherwise
        // subsequent use of the form to upload new files risks overwriting records of previous
        // imports performed without reloading the page

        // TODO: provide required values entered in earlier steps, if any
        this.setState({
            submitWait: true,
            submitSuccess: false,
            submitWarnings: [],
            submitErrors: [],
        });
        $.ajax('/rest/studies/' + EDDData.currentStudyID + '/imports/' + this.state.importPk + '/',
            {
                method: 'PATCH',
                cache: false,
                contentType: 'application/json',
                data: JSON.stringify({
                    status: 'Submitted',
                }),
                dataType: 'json',
                processData: false,
                success: this.submitSuccess.bind(this),
                error: this.submitErr.bind(this),
            },
        );
    }

    submitSuccess(result_json: any, textStatus: string, jqXHR: JQueryXHR) {
        this.setState({
            submitSuccess: true,
            submitErrors: [],
            submitWait: false,
        });
    }

    submitErr(jqXHR, textStatus: string, errorThrown: string): void {
        const contentType = jqXHR.getResponseHeader('Content-Type');

        const vals = {
            submitWait: false,
        } as any;

        if (contentType === 'application/json') {
            const json = JSON.parse(jqXHR.responseText);
            vals.submitErrors = json.errors;
            this.setState(vals);
        } else {
            // if there is a back end or proxy error (likely html response), show this
            vals.submitErrors = [{
                category: "Unexpected error",
                summary: "There was an unexpected error submitting your import. Please try" +
                    " again.  If your upload still fails, please contact" +
                    " system administrators to confirm that they're aware of this problem.",
            } as ErrorSummary];
            this.setState(vals);
        }
    }

    importMessageReceived(message: Message) {
        if (!message.hasOwnProperty("payload")) {
            console.log("Skipping message that has no payload");
            return;
        }
        const json = message.payload;
        console.log('Processing import ' + json.uuid + ' message ' + message.uuid);

        // skip notifications for other simultaneous imports by this user
        if (json.uuid !== this.state.importUUID) {
            console.log('Ignoring status update for import ' + json.uuid +
                ', Looking for ' + this.state.importUUID);
            return;
        }

        let state: any;

        switch (message.payload.status) {
            case 'Created':
                // handled by the upload request
                break;
            case 'Resolved':
                this.setState({
                    postUploadStep: 2,
                    uploadWait: false,
                    uploadProcessingWait: false,
                    uploadWarnings: json.warnings || [],
                    nextButtonText: 'Next',  // StepZilla bug?
                });
                break;
            case  'Ready':
                state = {
                    postUploadStep: 3,
                    uploadWait: false,
                    uploadProcessingWait: false,
                    uploadWarnings: json.warnings || [],
                    nextButtonText: 'Submit Import',  // StepZilla bug?
                } as any;

                // if import matched a known, data-complete file format, skip past user feedback
                // for the "ready" state
                if(this.state.autoSubmit) {
                    state.submitProcessingWait = true;
                }
                this.setState(state);

                if(this.state.autoSubmit) {
                    this.state.jumpToStep(3);
                }
                break;
            case 'Failed':
                state = {
                    uploadWait: false,
                    uploadProcessingWait: false,
                    submitWait: false,
                    submitProcessingWait: false,
                } as any;

                if (this.state.uploadWait || this.state.uploadProcessingWait) {
                    state.uploadErrors = json.errors || [];
                    state.uploadWarnings = json.warnings || [];
                } else {
                    state.submitErrors = json.errors || [];
                    state.submitWarnings = json.warnings || [];
                }
                this.setState(state);
                break;
            case 'Submitted':
                this.setState({
                    submitProcessingWait: true,
                    submitWait: false,
                    submitSuccess: false,
                    submitWarnings: [],
                    submitErrors: [],
                    uploadWait: false,
                    uploadProcessingWait: false,
                });
                // jump to the final step to cover cases where
                this.state.jumpToStep(3);
                break;
            case 'Completed':
                this.setState({
                    submitSuccess: true,
                    submitErrors: json.errors || [],
                    submitWarnings: json.warnings || [],
                    submitWait: false,
                    submitProcessingWait: false,
                });
        }
    }

    componentDidMount() {

        // send CSRF header on each AJAX request from this page
        $.ajaxSetup({
            beforeSend: (xhr) => {
                xhr.setRequestHeader('X-CSRFToken', Utl.EDD.findCSRFToken());
            },
        });

        // get categories and associated protocols, file formats
        $.ajax('/rest/import_categories/?ordering=display_order',
            {
                headers: {'Content-Type': 'application/json'},
                method: 'GET',
                dataType: 'json',
                success: this.categoriesLookupSuccess.bind(this),
                error: this.categoriesLookupErr.bind(this),
            },
        );

        // get UUID assigned by the server...we'll need this to compare against incoming
        // notifications so we only display those for this import (e.g. for this tab)
        const uuid: string = $('#importUUID').val();
        this.setState({importUUID: uuid});

        notificationSocket.addTagAction('import-status-update',
            this.importMessageReceived.bind(this));

        // silence notifications from the legacy import while this page is visible.
        // the new import's UI will provide feedback, so displaying notifications in the menu
        // bar is only useful when user has navigated away from this page
        notificationSocket.addTagAction('legacy-import-message', (message) => {
            notificationSocket.markRead(message.uuid);
        });

    }
}

ReactDOM.render(<Import/>, document.getElementById("importWizard"));
