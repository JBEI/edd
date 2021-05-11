"use strict";

// This module encapsulates all the custom code for the data import page.
// It consists primarily of a series of classes, each corresponding to a step in the import
// process, with a corresponding chunk of UI on the import page.
// Each class pulls data from one or more previous steps, does some internal processing,
// then triggers a callback function, announcing the availability of its own new data.
// The callback function triggers the instance of the next step.

import * as $ from "jquery";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/progressbar";

import * as EDDAuto from "../modules/EDDAutocomplete";
import * as Utl from "../modules/Utl";

import "../modules/Styles";

// Type name for the grid of values pasted in
type RawInput = string[][];
// type for the stats generated from parsing input text
interface RawInputStat {
    input: RawInput;
    columns: number;
}
type XYPair = [string | number, string | number];
interface MeasurementValueSequence {
    // may be received as string, should insert as number
    data: XYPair[];
}

interface EDDWindow extends Window {
    ATData: any;
    EDDData: EDDData;
}

declare let window: EDDWindow;
window.ATData = window.ATData || {};
window.EDDData = window.EDDData || ({} as EDDData);

// During initialization we will allocate one instance of each of the classes
// that handle the major steps of the import process.
// These are specified in the order they are called, and the order they appear on the page:
let selectMajorKindStep: SelectMajorKindStep;
let rawInputStep: RawInputStep;
let identifyStructuresStep: IdentifyStructuresStep;
let typeDisambiguationStep: TypeDisambiguationStep;
let reviewStep: ReviewStep;

interface RawModeProcessor {
    parse(step: RawInputStep, rawData: string): RawInputStat;
    process(step: RawInputStep, stat: RawInputStat): void;
}

// These are returned by the server after parsing a dropped file
interface RawImportSet extends MeasurementValueSequence {
    kind: string; // the type of import selected in step 1
    hint: string; // any additional hints about type of data
    line_name: string;
    assay_name: string;
    measurement_name: string;
    metadata_by_name?: { [id: string]: string };
}

// This information is added post-disambiguation, in addition to the fields from RawImportSet,
// and sent to the server
interface ResolvedImportSet extends RawImportSet {
    protocol_id: number;
    // Value of 'null' or string 'new' indicates new Line should be created with
    // name line_name.
    line_id: string | number;
    assay_id: string | number;
    measurement_id: string;
    compartment_id: string;
    units_id: string;
    metadata_by_id: { [id: string]: string };
}

// Captures important information to be reviewed by the user in the final import step
class ImportMessage {
    message: string;

    // optional. for possible future use in highlighting / scrolling to / etc.
    relatedControlSelector: string;

    // optional. no-input function to call to reevaluate the error/warning and then update
    // the UI with the result (e.g. by re-querying a REST resource).
    reevaluateFunction: any;

    constructor(
        message: string,
        relatedControlSelector: string = null,
        reevaluateFunction: any = null,
    ) {
        this.message = message;
        this.relatedControlSelector = relatedControlSelector;
        this.reevaluateFunction = reevaluateFunction;
    }
}

// Defines common methods of all import steps prior to the ReviewStep (#5). The ReviewStep
// uses the function calls defined here to poll prior steps for error/ warning messages that
// should be summarized for the user in the UI prior to the import. Any error messages will
// prevent the import from proceeding until they are resolved. Warnings must be acknowledged
// by checking a checkbox before the import can proceed.
interface ImportStep {
    getUserWarnings(): ImportMessage[];
    getUserErrors(): ImportMessage[];

    // tests whether all required input controls have a value
    // (not whether values are compatible / consistent)
    requiredInputsProvided(): boolean;

    // called to inform this step that the previous step has completed its processing as a
    // result of input changes somewhere upstream
    previousStepChanged(): void;
}

function setupHelp(helpId: string): void {
    const buttonSelector: string = ["#step", "-help-btn"].join(helpId);
    const contentSelector: string = ["#step", "-help-content"].join(helpId);
    const title: string = ["Step ", " Help"].join(helpId);
    const dialog = $(contentSelector).dialog({
        "title": title,
        "autoOpen": false,
        "position": {
            "my": "right top",
            "at": "right bottom+10",
            "of": buttonSelector,
        },
    });
    $(buttonSelector).on("click", () => dialog.dialog("open"));
}

// As soon as the window load signal is sent, call back to the server for the set of reference
// records that will be used to disambiguate labels in imported data.
function onWindowLoad(): void {
    // turn on dialogs for the help buttons in each section
    ["1", "2", "3", "4", "5"].forEach(setupHelp);
    // send CSRF header on each AJAX request from this page
    $.ajaxSetup({
        "beforeSend": function (xhr) {
            const csrfToken = Utl.EDD.findCSRFToken();
            xhr.setRequestHeader("X-CSRFToken", csrfToken);
        },
    });
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on("focus", ".autocomp", (ev) => {
        $(ev.target).addClass("autocomp_search").mcautocomplete("search");
    });

    $(".disclose").find("a.discloseLink").on("click", disclose);

    // Populate ATData and EDDData objects via AJAX calls
    const datalink = $("#datalink");
    const assaylink = $("#assaylink");
    $.when(
        $.ajax({
            "url": datalink.attr("href"),
            "type": "GET",
            "success": (data) => {
                $.extend(window.EDDData, data);
            },
        }),
        $.ajax({
            "url": assaylink.attr("href"),
            "type": "GET",
            "success": (data) => {
                $.extend(window.ATData, data.ATData);
                $.extend(window.EDDData, data.EDDData);
            },
        }),
    ).then(onReferenceRecordsLoad, (x, s) => alert(s));
}

// As soon as we've got and parsed the reference data, we can set up all the callbacks for the
// UI, effectively turning the page "on".
function onReferenceRecordsLoad(): void {
    // TODO: clarify reflected GUI state when waiting for large dataset from the server.
    // in several test cases with large #'s of lines, there's time for the user to reach a
    // later / confusing step in the process while waiting on this data to be returned.
    // Probably should fix this in EDD-182.
    $("#waitingForServerLabel").addClass("off");

    // Allocate one instance of each step, providing references to the previous steps
    // as needed.
    const step1 = new SelectMajorKindStep(selectMajorKindCallback);
    const step2 = new RawInputStep(step1, rawInputCallback, processingFileCallback);
    const step3 = new IdentifyStructuresStep(step1, step2, identifyStructuresCallback);
    const step4 = new TypeDisambiguationStep(step1, step3, typeDisambiguationCallback);
    const step5 = new ReviewStep(step1, step2, step3, step4, reviewStepCallback);

    selectMajorKindStep = step1;
    rawInputStep = step2;
    identifyStructuresStep = step3;
    typeDisambiguationStep = step4;
    reviewStep = step5;

    // Wire up the function that submits the page
    // on a timeout to allow autocomplete events to finish
    $("#submit-btn").on("click", () => {
        window.setTimeout(() => reviewStep.startImport(), 10);
    });

    // We need to manually trigger this, after all our steps are constructed.
    // This will cascade calls through the rest of the steps and configure them too.
    step1.queueReconfigure();
}

// This is called by our instance of selectMajorKindStep to announce changes.
function selectMajorKindCallback(): void {
    // This is a bit of a hack.  We want to change the pulldown settings in Step 3 if the mode
    // in Step 1 is changed, but leave the pulldown alone otherwise (including when Step 2
    // announces its own changes.)
    // TODO: Make Step 3 track this with an internal variable.
    if (selectMajorKindStep.interpretationMode === "mdv") {
        // A default set of pulldown settings for this mode
        identifyStructuresStep.pulldownSettings = [
            TypeEnum.Line_Names,
            TypeEnum.Measurement_Type,
        ];
    }
    rawInputStep.previousStepChanged();
}

// This is called by our instance of Step 2, RawInputStep to announce changes.
// We just pass the signal along to Step 3: IdentifyStructuresStep.
function rawInputCallback(): void {
    identifyStructuresStep.previousStepChanged();
}

// This is called by our instance of Step 3, IdentifyStructuresStep to announce changes.
// We just pass the signal along to Step 4: TypeDisambiguationStep.
function identifyStructuresCallback(): void {
    typeDisambiguationStep.previousStepChanged();
}

// This is called by our instance of TypeDisambiguationStep to announce changes.
// All we do currently is repopulate the debug area.
function typeDisambiguationCallback(): void {
    reviewStep.previousStepChanged();
}

// tells step 3 that step 2 has just begun processing file input
function processingFileCallback(): void {
    identifyStructuresStep.processingFileInPreviousStep();
}

function reviewStepCallback(): void {
    // nothing to do! no subsequent steps
}

// The usual click-to-disclose callback.  Perhaps this should be in Utl.ts?
function disclose(): boolean {
    $(this).closest(".disclose").toggleClass("discloseHide");
    return false;
}

// The class responsible for everything in the "Step 1" box that you see on the data import
// page. Here we provide UI for selecting the major kind of import, and the Protocol that the
// data should be stored under. These choices affect the behavior of all subsequent steps.
class SelectMajorKindStep {
    // The Protocol for which we will be importing data.
    masterProtocol: number;
    // The main mode we are interpreting data in.
    // Valid values sofar are "std", "mdv", "tr", "hplc", "pr", and "biolector".
    interpretationMode: string | any;
    inputRefreshTimerID: number;

    nextStepCallback: () => void;

    constructor(nextStepCallback: () => void) {
        this.masterProtocol = 0;
        // We rely on a separate call to reconfigure() to set this properly.
        this.interpretationMode = null;
        this.inputRefreshTimerID = null;
        this.nextStepCallback = nextStepCallback;

        // This is rather a lot of callbacks, but we need to make sure we're tracking the
        // minimum number of elements with this call, since the function called has such
        // strong effects on the rest of the page.
        // For example, a user should be free to change "merge" to "replace" without having
        // their edits in Step 2 erased.
        $("#masterProtocol").on("change", this.queueReconfigure.bind(this));

        // Using "change" for these because it's more efficient AND because it works around an
        // irritating Chrome inconsistency
        // For some of these, changing them shouldn't actually affect processing until we
        // implement an overwrite-checking feature or something similar
        $("#selectMajorKindStep :radio[name=datalayout]").on(
            "change",
            this.queueReconfigure.bind(this),
        );
    }

    // Start a timer to wait before calling the reconfigure routine. This way we condense
    // multiple possible events from the radio buttons and/or pulldown into one.
    queueReconfigure(): void {
        if (this.inputRefreshTimerID) {
            window.clearTimeout(this.inputRefreshTimerID);
        }
        this.inputRefreshTimerID = window.setTimeout(this.reconfigure.bind(this), 250);
    }

    // Read the settings out of the UI and pass along.
    // If the interpretation mode has changed, all the subsequent steps will need a refresh.
    // If the master Protocol pulldown has changed, Step 4 will need a refresh,
    // specifically the master Assay pulldown and Assay/Line disambiguation section.
    reconfigure(): void {
        // Don't inline these into the if statement or the second one might not be called!
        const a: boolean = this.checkInterpretationMode();
        const b: boolean = this.checkMasterProtocol();
        if (a || b) {
            this.nextStepCallback();
        }
    }

    // If the interpretation mode value has changed, note the change and return 'true'.
    // Otherwise return 'false'.
    checkInterpretationMode(): boolean {
        // Find every input element with the name attribute of 'datalayout' that is checked.
        // Should return 0 or 1 elements.
        const modeRadio = $("[name='datalayout']:checked");
        // If none of them are checked, we don't have enough information to handle any
        // next steps.
        if (modeRadio.length < 1) {
            return false;
        }
        const radioValue = modeRadio.val();
        if (this.interpretationMode === radioValue) {
            return false;
        }
        this.interpretationMode = radioValue;
        return true;
    }

    // If the master Protocol pulldown value has changed, note the change and return 'true'.
    // Otherwise return 'false'.
    checkMasterProtocol(): boolean {
        const protocolRaw: string = $("#masterProtocol").val() as string;
        const p: number = parseInt(protocolRaw, 10);
        if (this.masterProtocol === p) {
            return false;
        }
        this.masterProtocol = p;
        return true;
    }

    getUserWarnings(): ImportMessage[] {
        return [];
    }

    getUserErrors(): ImportMessage[] {
        return [];
    }

    requiredInputsProvided(): boolean {
        return this.masterProtocol !== 0;
    }

    previousStepChanged(): void {
        // no-op. no previous steps!
    }
}

class NullProcessor implements RawModeProcessor {
    /// RawInputStep processor that does nothing.

    parse(step: RawInputStep, rawData: string): RawInputStat {
        return {
            "input": [],
            "columns": 0,
        };
    }

    process(step: RawInputStep, input: RawInputStat): void {
        return;
    }
}

abstract class BaseRawTableProcessor implements RawModeProcessor {
    /// Base processor for RawInputStep handles parsing a string into a 2D array

    parse(step: RawInputStep, rawData: string): RawInputStat {
        const rawText: string = step.rawText();
        const delimiter: string = step.separatorType() === "csv" ? "," : "\t";
        const rows: RawInput = [];
        const longestRow: number = rawText.split(/[ \r]*\n/).reduce(
            (prev: number, rawRow: string): number => {
                if (rawRow !== "") {
                    const row: string[] = rawRow.split(delimiter);
                    rows.push(row);
                    return Math.max(prev, row.length);
                }
                return prev;
            },
            // initial value for reduce
            0,
        );

        // pad out rows so it is rectangular
        rows.forEach((row: string[]): void => {
            while (row.length < longestRow) {
                row.push("");
            }
        });

        return {
            "input": rows,
            "columns": longestRow,
        };
    }

    process(step: RawInputStep, input: RawInputStat): void {
        return;
    }
}

class MdvProcessor extends BaseRawTableProcessor {
    /// RawInputStep processor for MDV-formatted spreadsheets

    process(step: RawInputStep, parsed: RawInputStat): void {
        let colLabels: string[] = [];
        const compounds: any = {};
        const orderedComp: string[] = [];
        const rows = parsed.input.slice(0); // copy
        // If this word fragment is in the first row, drop the whole row.
        if (rows[0].join("").match(/quantitation/gi)) {
            rows.shift();
        }
        rows.forEach((row: string[]): void => {
            const first = row.shift();
            // If we happen to encounter an occurrence of a row with 'Compound' in
            // the first column, we treat it as a row of column identifiers.
            if (first === "Compound") {
                colLabels = row;
                return;
            }
            const marked = first.split(" M = ");
            if (marked.length === 2) {
                const name = marked[0];
                const index = parseInt(marked[1], 10);
                if (!compounds[name]) {
                    compounds[name] = { "originalRows": {}, "processedAssayCols": {} };
                    orderedComp.push(name);
                }
                compounds[name].originalRows[index] = row.slice(0);
            }
        });
        $.each(compounds, (name: string, value: any): void => {
            // First gather up all the marker indexes given for this compound
            const indices = $.map(value.originalRows, (_, index: string): number =>
                parseInt(index, 10),
            );
            indices.sort((a, b) => a - b); // sort ascending
            // Run through the set of columnLabels above, assembling a marking number for each,
            // by drawing - in order - from this collected row data.
            colLabels.forEach((label: string, index: number): void => {
                const parts: string[] = [];
                indices.forEach((ri: number): void => {
                    const original = value.originalRows[ri];
                    let cell = original[index];
                    if (cell) {
                        cell = cell.replace(/,/g, "");
                        if (!isNaN(parseFloat(cell))) {
                            parts.push(cell);
                        }
                    }
                });
                // Assembled a full carbon marker number, grab the column label, and place
                // the marker in the appropriate section.
                value.processedAssayCols[index] = parts.join("/");
            });
        });
        // Start the set of row markers with a generic label
        step.gridRowMarkers = ["Assay"];
        // The first row is our label collection
        step.gridFromTextField[0] = colLabels.slice(0);
        // push the rest of the rows generated from ordered list of compounds
        Array.prototype.push.apply(
            step.gridFromTextField,
            orderedComp.map((name: string): string[] => {
                step.gridRowMarkers.push(name);
                const compound = compounds[name];
                const row = [];
                const colLookup = compound.processedAssayCols;
                // generate row cells by mapping column labels to processed columns
                Array.prototype.push.apply(
                    row,
                    colLabels.map((_, index: number): string => colLookup[index] || ""),
                );
                return row;
            }),
        );
    }
}

class StandardProcessor extends BaseRawTableProcessor {
    /// RawInputStep processor for standard tables with one header row and column

    process(step: RawInputStep, parsed: RawInputStat): void {
        // If the user hasn't deliberately chosen a setting for 'transpose', we will do
        // some analysis to attempt to guess which orientation the data needs to have.
        if (!step.userClickedOnTranspose) {
            step.inferTransposeSetting(parsed.input);
        }
        // If the user hasn't deliberately chosen to ignore, or accept, gaps in the data,
        // do a basic analysis to guess which setting makes more sense.
        if (!step.userClickedOnIgnoreDataGaps) {
            step.inferGapsSetting();
        }

        // Collect the data based on the settings
        if (step.transpose()) {
            // first row becomes Y-markers as-is
            step.gridRowMarkers = parsed.input.shift() || [];
            step.gridFromTextField = (parsed.input[0] || []).map(
                (_, i: number): string[] => {
                    return parsed.input.map((row: string[]): string => row[i] || "");
                },
            );
        } else {
            step.gridRowMarkers = [];
            step.gridFromTextField = (parsed.input || []).map(
                (row: string[]): string[] => {
                    step.gridRowMarkers.push(row.shift());
                    return row;
                },
            );
        }
    }
}

interface ParseRecord {
    kind: string;
    line_name: string;
    assay_name: string;
    measurement_name: string;
    metadata_by_name: Record<string, string>;
    data: any;
}

interface ParseTable {
    headers: string[];
    values: string[][];
}

interface ParseWorksheets {
    worksheets: ParseTable[];
}

interface ParseResponse {
    /** (optional) if there is any error, a message is sent in this key */
    python_error?: string;
    /** (optional) if the parse was successful, detected file type is sent */
    file_type?: "csv" | "xlsx" | "txt" | "xml";
    file_data?: string | ParseRecord[] | ParseWorksheets;
}

// The class responsible for everything in the "Step 2" box that you see on the data import
// page. It needs to parse the raw data from typing or pasting in the input box, or a
// dragged-in file, into a null-padded rectangular grid that can be easily used by the next
// step. Depending on the kind of import chosen in Step 1, this step will accept different
// kinds of files, and handle the file drag in different ways.
// For example, when the import kind is "Standard" and the user drags in a CSV file, the file
// is parsed in-browser and the contents are placed in the text box.  When the import kind is
// "biolector" and the user drags in an XML file, the file is sent to the server and parsed
// there, and the resulting data is passed back to the browser and placed in the text box.
class RawInputStep {
    // This is where we organize raw data pasted into the text box by the user,
    // or placed there as a result of server-side processing - like taking apart
    // a dropped Excel file.

    gridFromTextField: any[];
    gridRowMarkers: any[];

    // This is where we handle dropped files, and the semi-processed record sets
    // that the server returns, from interpreting an XML Biolector file for example.

    activeDraggedFile: any;
    processedSetsFromFile: any[];
    processedSetsAvailable: boolean;

    // Additional options for interpreting text box data, exposed in the UI for the user to
    // tweak. Sometimes set automatically by certain import modes, like the "mdv" mode.

    transposed: boolean;
    // If the user deliberately chose to transpose or not transpose, disable the attempt
    // to auto-determine transposition.
    userClickedOnTranspose: boolean;
    // Whether to interpret the pasted data row-wise or column-wise, when importing
    // either measurements or metadata.
    ignoreDataGaps: boolean;
    userClickedOnIgnoreDataGaps: boolean;
    separator: string | number;

    inputRefreshTimerID: any;

    selectMajorKindStep: SelectMajorKindStep;
    processingFileCallback: () => void;
    nextStepCallback: () => void;

    haveInputData = false;

    processingFile = false; // true while the input is being processed (locally or remotely)

    constructor(
        step: SelectMajorKindStep,
        nextStepCallback: () => void,
        processingFileCallBack: () => void,
    ) {
        this.selectMajorKindStep = step;

        this.gridFromTextField = [];
        this.processedSetsFromFile = [];
        this.processedSetsAvailable = false;
        this.gridRowMarkers = [];
        this.transposed = false;
        this.userClickedOnTranspose = false;
        this.ignoreDataGaps = false;
        this.userClickedOnIgnoreDataGaps = false;
        this.separator = "csv";
        this.inputRefreshTimerID = null;

        $("#step2textarea")
            .on("paste", this.pastedRawData.bind(this))
            .on("keyup", this.queueReprocessRawData.bind(this))
            .on("keydown", this.suppressNormalTab.bind(this));

        // Using "change" for these because it's more efficient AND because it works around an
        // irritating Chrome inconsistency. For some of these, changing them should not
        // actually affect processing until we implement an overwrite-checking feature or
        // something similar

        $("#rawdataformatp").on("change", this.queueReprocessRawData.bind(this));
        $("#ignoreGaps").on("change", this.clickedOnIgnoreDataGaps.bind(this));
        $("#transpose").on("change", this.clickedOnTranspose.bind(this));
        $("#resetstep2").on("click", this.reset.bind(this));

        Utl.FileDropZone.create({
            "elementId": "importDropZone",
            "fileInitFn": this.fileDropped.bind(this),
            // TODO: fix hard-coded URL
            "url": "/load/parse/",
            "processResponseFn": this.fileReturnedFromServer.bind(this),
            "processErrorFn": this.fileUploadError.bind(this),
            "clickable": false,
        });

        this.processingFileCallback = processingFileCallback;
        this.nextStepCallback = nextStepCallback;
    }

    // In practice, the only time this will be called is when Step 1 changes,
    // which may call for a reconfiguration of the controls in this step.
    previousStepChanged(): void {
        const mode = this.selectMajorKindStep.interpretationMode;
        // update input visibility based on user selection in step 1
        this.updateInputVisible();

        // By default, our drop zone wants excel or csv files, so we clear the
        // additional classes:
        $("#step2textarea").removeClass("xml text");

        if (mode === "biolector") {
            // Biolector data is expected in XML format.
            $("#step2textarea").addClass("xml");
            $("#gcmsSampleFile").hide();
            // show example biolector file
            $("#biolectorFile").show();
            // It is also expected to be dropped from a file. So, either we are already in
            // file mode and there are already parsed sets available, or we are in text entry
            // mode waiting for a file drop. Either way there's no need to call
            // reprocessRawData(), so we just push on to the next step.
            this.nextStepCallback();
            return;
        } else {
            // hide example biolector file
            $("#biolectorFile").hide();
        }
        if (mode === "hplc") {
            // HPLC data is expected as a text file.
            $("#step2textarea").addClass("text");
            $("#hplcExample").show();
            $("#gcmsSampleFile").hide();
            this.nextStepCallback();
            return;
        } else {
            $("#hplcExample").hide();
        }
        if (mode === "skyline") {
            this.nextStepCallback();
            $("#gcmsSampleFile").hide();
            // show skyline example file
            $("#skylineSample").show();
            return;
        } else {
            $("#skylineSample").hide();
        }
        if (mode === "mdv") {
            // When JBEI MDV format documents are pasted in, it's always from Excel, so they
            // are always tab-separated.
            this.separatorType("tab");
            // We also never ignore gaps, or transpose, for MDV documents.
            this.ignoreGaps(false);
            this.transpose(false);
            // Proceed through to the dropzone check.
        }

        // for std use GC-MS file
        if (mode === "std") {
            $("#prSampleFile").hide();
            $("#gcmsSampleFile").show();
        } else {
            $("#gcmsSampleFile").hide();
        }
        if (mode === "std" || mode === "tr" || mode === "mdv") {
            // If an excel file was dropped in, its content was pulled out and dropped into
            // the text box. The only reason we would want to still show the file info area is
            // if we are currently in the middle of processing a file and haven't yet received
            // its worksheets from the server. We can determine that by checking the status of
            // any existing FileDropZoneFileContainer. If it's stale, we clear it so the user
            // can drop in another file.
            if (this.activeDraggedFile) {
                if (this.activeDraggedFile.allWorkFinished) {
                    this.clearDropZone();
                }
            }
            this.queueReprocessRawData();
        }
    }

    // Start a timer to wait before calling the routine that remakes the graph.
    // This way we're not bothering the user with the long redraw process when
    // they are making fast edits.
    queueReprocessRawData(): void {
        if (this.haveInputData) {
            processingFileCallback();
        }
        if (this.inputRefreshTimerID) {
            window.clearTimeout(this.inputRefreshTimerID);
        }

        // Wait at least 1/2 second, at most 3 seconds,
        // with a range in between based on the length of the input data.
        // This way a person making a minor correction to a small data set can see
        // their results more quickly, but we don't overload when working on large sets.
        const pasted = $("#step2textarea").val() as string;
        const delay = Math.max(500, Math.min(3000, pasted.length));

        this.inputRefreshTimerID = window.setTimeout(
            this.reprocessRawData.bind(this),
            delay,
        );
    }

    getProcessorForMode(mode: string): RawModeProcessor {
        let processor: RawModeProcessor;
        if (["std", "tr"].indexOf(mode) !== -1) {
            processor = new StandardProcessor();
        } else if ("mdv" === mode) {
            processor = new MdvProcessor();
        } else {
            processor = new NullProcessor();
        }
        return processor;
    }

    // processes raw user input entered directly into the text area
    reprocessRawData(): void {
        const mode = this.selectMajorKindStep.interpretationMode;

        this.ignoreGaps(); // TODO: Are these necessary?
        this.transpose();
        this.separatorType();

        this.gridFromTextField = [];
        this.gridRowMarkers = [];

        const processor = this.getProcessorForMode(mode);
        const input = processor.parse(this, this.rawText());
        processor.process(this, input);

        this.processingFile = false;
        this.nextStepCallback();
    }

    // Here, we take a look at the type of the dropped file and add extra headers
    fileDropped(file: Dropzone.DropzoneFile, formData: FormData): void {
        this.haveInputData = true;
        processingFileCallback();
        formData.set("import_mode", this.selectMajorKindStep.interpretationMode);
    }

    fileReturnedFromServer(file: Dropzone.DropzoneFile, response: ParseResponse): void {
        const mode = this.selectMajorKindStep.interpretationMode;

        if (mode === "biolector" || mode === "hplc" || mode === "skyline") {
            const data = response.file_data as ParseRecord[];
            const count: number = data.length;
            const points: number = data
                .map((set): number => set.data.length)
                .reduce((acc, n) => acc + n, 0);
            const label =
                "Found " +
                count +
                " measurements with " +
                points +
                " total data points.";
            $("<p>").text(label).appendTo($(".dz-preview"));
            this.processedSetsFromFile = data;
            this.processedSetsAvailable = true;
            this.processingFile = false;
            // Call this directly, skipping over reprocessRawData() since we don't need it.
            this.nextStepCallback();
            return;
        }

        if (response.file_type === "csv") {
            // Since we're handling this format entirely client-side, we can get rid of the
            // drop zone immediately.
            this.clearDropZone();
            this.rawText(response.file_data as string);
            this.inferSeparatorType();
            this.reprocessRawData();
            return;
        }

        if (response.file_type === "xlsx") {
            this.clearDropZone();
            const data = response.file_data as ParseWorksheets;
            const ws = data.worksheets[0];
            const table = ws[0];
            let csv = [];
            if (table.headers) {
                csv.push(table.headers.join());
            }
            csv = csv.concat(table.values.map((row: string[]) => row.join()));
            this.separatorType("csv");
            this.rawText(csv.join("\n"));
            this.reprocessRawData();
            return;
        }
    }

    fileUploadError(dropZone: Utl.FileDropZone, file, msg, xhr): void {
        let text: string;
        $(".dz-error-mark").removeClass("off");

        text = "File Upload Error";
        if (xhr.status === 413) {
            text = "File is too large";
        } else if (xhr.status === 504) {
            text = "Time out uploading file.  Please try again.";
        }
        $(".dz-error-message").text(text).removeClass("off");

        // update step 2 feedback so it no longer looks like we're waiting on the file upload
        $("#processingStep2ResultsLabel").addClass("off");
        $("#enterDataInStep2").removeClass("off");
    }

    updateInputVisible(): void {
        const missingStep1Inputs = !this.selectMajorKindStep.requiredInputsProvided();

        $("#completeStep1Label").toggleClass("off", !missingStep1Inputs);
        $("#importDropZone").toggleClass("off", missingStep1Inputs);
        $("#step2textarea").toggleClass("off", missingStep1Inputs);
    }

    // Reset and hide the info box that appears when a file is dropped,
    // and reveal the text entry area
    // This also clears the "processedSetsAvailable" flag because it assumes that
    // the text entry area is now the preferred data source for subsequent steps.
    clearDropZone(): void {
        this.updateInputVisible();

        $("#dz-error-mark").addClass("off");
        $("#dz-error-message").addClass("off");

        $("#fileDropInfoArea").addClass("off");
        $("#fileDropInfoSending").addClass("off");
        $("#fileDropInfoName").empty();
        $("#fileDropInfoLog").empty();

        // If we have a currently tracked dropped file, set its flags so we ignore any
        // callbacks, before we forget about it.
        if (this.activeDraggedFile) {
            this.activeDraggedFile.stopProcessing = true;
        }
        this.activeDraggedFile = null;
        this.processedSetsAvailable = false;
    }

    reset(): void {
        this.haveInputData = false;
        this.clearDropZone();
        this.rawText("");
        this.reprocessRawData();
    }

    inferTransposeSetting(rows: RawInput): void {
        // The most straightforward method is to take the top row, and the first column,
        // and analyze both to see which one most likely contains a run of timestamps.
        // We'll also do the same for the second row and the second column, in case the
        // timestamps are underneath some other header.

        // Note that with empty or too-small source data, these arrays will either remain
        // empty, or become 'null'
        const arraysToAnalyze = [
            rows[0] || [], // First row
            rows[1] || [], // Second row
            (rows || []).map((row: string[]): string => row[0]), // First column
            (rows || []).map((row: string[]): string => row[1]), // Second column
        ];
        const arraysScores = arraysToAnalyze.map((row: string[], i: number): number => {
            let score = 0,
                prev: number,
                nnPrev: number;
            if (!row || row.length === 0) {
                return 0;
            }
            prev = nnPrev = undefined;
            row.forEach((value: string, j: number, r: string[]): void => {
                let t: number;
                if (value) {
                    t = parseFloat(value.replace(/,/g, ""));
                }
                if (!isNaN(t)) {
                    if (!isNaN(prev) && t > prev) {
                        score += 2;
                    } else if (!isNaN(nnPrev) && t > nnPrev) {
                        score += 1;
                    }
                    nnPrev = t;
                }
                prev = t;
            });
            return score / row.length;
        });
        // If the first row and column scored differently, judge based on them.
        // Only if they scored the same do we judge based on the second row and second column.
        if (arraysScores[0] !== arraysScores[2]) {
            this.transpose(arraysScores[0] > arraysScores[2]);
        } else {
            this.transpose(arraysScores[1] > arraysScores[3]);
        }
    }

    inferGapsSetting(): void {
        // Count the number of blank values at the end of each column
        // Count the number of blank values in between non-blank data
        // If more than three times as many as at the end, default to ignore gaps
        let intra = 0,
            extra = 0;
        this.gridFromTextField.forEach((row: string[]): void => {
            let notNull = false;
            // copy and reverse to loop from the end
            row.slice(0)
                .reverse()
                .forEach((value: string): void => {
                    if (!value) {
                        if (notNull) ++extra;
                        else ++intra;
                    } else {
                        notNull = true;
                    }
                });
        });
        const result: boolean = extra > intra * 3;
        this.ignoreGaps(result);
    }

    // This gets called when there is a paste event.
    pastedRawData(): void {
        // We do this using a timeout so the rest of the paste events fire, and get the
        // pasted result.
        this.haveInputData = true;
        window.window.setTimeout(this.inferSeparatorType.bind(this), 1);
    }

    inferSeparatorType(): void {
        if (this.selectMajorKindStep.interpretationMode !== "mdv") {
            const text = this.rawText() || "";
            const test = text.split("\t").length >= text.split(",").length;
            this.separatorType(test ? "tab" : "csv");
        }
    }

    ignoreGaps(value?: boolean): boolean {
        const ignoreGaps = $("#ignoreGaps");
        if (value === undefined) {
            value = ignoreGaps.prop("checked");
        } else {
            ignoreGaps.prop("checked", value);
        }
        return (this.ignoreDataGaps = value);
    }

    transpose(value?: boolean): boolean {
        const transpose = $("#transpose");
        if (value === undefined) {
            value = transpose.prop("checked");
        } else {
            transpose.prop("checked", value);
        }
        return (this.transposed = value);
    }

    separatorType(value?: any): string {
        const separatorPulldown = $("#rawdataformatp");
        if (value === undefined) {
            value = separatorPulldown.val();
        } else {
            separatorPulldown.val(value);
        }
        return (this.separator = value);
    }

    rawText(value?: any): string {
        const rawArea: JQuery = $("#step2textarea");
        if (value === undefined) {
            value = rawArea.val();
        } else {
            rawArea.val(value);
        }
        return value;
    }

    clickedOnIgnoreDataGaps(): void {
        this.userClickedOnIgnoreDataGaps = true;
        // This will take care of reading the status of the checkbox
        this.reprocessRawData();
    }

    clickedOnTranspose(): void {
        this.userClickedOnTranspose = true;
        this.reprocessRawData();
    }

    // This handles insertion of a tab into the textarea.
    // May be glitchy.
    suppressNormalTab(e: JQueryKeyEventObject): boolean {
        this.haveInputData = true;
        if (e.which === 9) {
            const input = e.target as HTMLInputElement;
            // These need to be read out before they are destroyed by altering the value of
            // the element.
            const selStart = input.selectionStart;
            const selEnd = input.selectionEnd;
            const text = $(input).val() as string;
            // set value to itself with selection replaced by a tab character
            $(input).val(
                [text.substring(0, selStart), text.substring(selEnd)].join("\t"),
            );
            // put caret at right position again
            const position = selStart + 1;
            input.selectionStart = position;
            input.selectionEnd = position;
            return false;
        }
        return true;
    }

    getGrid(): any[] {
        return this.gridFromTextField;
    }

    getUserWarnings(): ImportMessage[] {
        return [];
    }

    getUserErrors(): ImportMessage[] {
        return [];
    }

    requiredInputsProvided(): boolean {
        return this.selectMajorKindStep.requiredInputsProvided() && this.haveInputData;
    }
}

// type for the options in row pulldowns
interface RowPulldownOption extends Array<string | number | RowPulldownOption[]> {
    0: string;
    1: number | RowPulldownOption[];
}

// Magic numbers used in pulldowns to assign types to rows/fields.
class TypeEnum {
    static Gene_Name = 14; // singular!
    static Gene_Names = 10; // plural!
    static Line_Names = 1;
    static Measurement_Type = 5; // singular!
    static Measurement_Types = 2; // plural!
    static Metadata_Name = 4;
    static Protein_Name = 12; // singular!
    static Protein_Names = 20; // plural!
    static Pubchem_Name = 13; // singular!
    static Pubchem_Names = 21; // plural!
    static RPKM_Values = 11;
    static Timestamp = 3;
}

// The class responsible for everything in the "Step 3" box that you see on the data import
// page. Get the grid from the previous step, and draw it as a table with puldowns for
// specifying the content of the rows and columns, as well as checkboxes to enable or disable
// rows or columns. Interpret the current grid and the settings on the current table into
// EDD-friendly sets.
class IdentifyStructuresStep implements ImportStep {
    rowLabelCells: any[];
    colCheckboxCells: any[];
    // Note: this is built, but never referenced...  Might as well cut it.
    rowCheckboxCells: any[];

    colObjects: any[];
    dataCells: any[];

    // We keep a single flag for each data point [y,x]
    // as well as two linear sets of flags for enabling or disabling
    // entire columns/rows.
    activeColFlags: any[];
    activeRowFlags: any[];
    activeFlags: any[];

    // Arrays for the pulldown menus on the left side of the table.
    // These pulldowns are used to specify the data type - or types - contained in each
    // row of the pasted data.
    pulldownObjects: any[];
    pulldownSettings: any[];
    // We also keep a set of flags to track whether a pulldown was changed by a user and
    // will not be recalculated.
    pulldownUserChangedFlags: any[];

    graphEnabled: boolean;
    graphRefreshTimerID: any;

    // Data structures pulled from the Step 2 grid or server response,
    // and composed into sets suitable for submission to the server.
    parsedSets: RawImportSet[];
    uniqueLineNames: any[];
    uniqueAssayNames: string[];
    uniqueMeasurementNames: any[];
    uniqueUniprot: string[];
    uniquePubchem: string[];
    uniqueGenbank: string[];
    uniqueMetadataNames: any[];
    // A flag to indicate whether we have seen any timestamps specified in the import data
    seenAnyTimestamps: boolean;

    rawInputStep: RawInputStep;
    selectMajorKindStep: SelectMajorKindStep;
    nextStepCallback: () => void;

    warningMessages: ImportMessage[];
    errorMessages: ImportMessage[];

    // Step 1 modes in which the data table gets displayed
    static MODES_WITH_DATA_TABLE: string[] = ["std", "tr", "mdv"];
    static MODES_WITH_GRAPH: string[] = ["std", "biolector", "hplc"];

    static DISABLED_PULLDOWN_LABEL = "--";
    static DEFAULT_PULLDOWN_VALUE = 0;

    static DUPLICATE_LEGEND_THRESHOLD = 10;

    constructor(
        mkStep: SelectMajorKindStep,
        riStep: RawInputStep,
        nextStepCallback: () => void,
    ) {
        this.rawInputStep = riStep;

        this.rowLabelCells = [];
        this.colCheckboxCells = [];
        this.colObjects = [];
        this.dataCells = [];

        // We keep a single flag for each data point [y,x]
        // as well as two linear sets of flags for enabling or disabling
        // entire columns/rows.
        this.activeColFlags = [];
        this.activeRowFlags = [];
        this.activeFlags = [];

        // Arrays for the pulldown menus on the left side of the table.
        // These pulldowns are used to specify the data type - or types - contained in each
        // row of the pasted data.
        this.pulldownObjects = [];
        this.pulldownSettings = [];
        // We also keep a set of flags to track whether a pulldown was changed by a user and
        // will not be recalculated.
        this.pulldownUserChangedFlags = [];

        this.graphEnabled = true;
        this.graphRefreshTimerID = null;

        this.parsedSets = [];
        this.uniqueLineNames = [];
        this.uniqueAssayNames = [];
        this.uniqueMeasurementNames = [];
        this.uniqueUniprot = [];
        this.uniquePubchem = [];
        this.uniqueGenbank = [];
        this.uniqueMetadataNames = [];
        // A flag to indicate whether we have seen any timestamps specified in the import data
        this.seenAnyTimestamps = false;

        this.selectMajorKindStep = mkStep;
        this.nextStepCallback = nextStepCallback;

        this.warningMessages = [];
        this.errorMessages = [];

        $("#dataTableDiv")
            .on("mouseover mouseout", "td", this.highlighterF.bind(this))
            .on("dblclick", "td", this.singleValueDisablerF.bind(this));

        $("#resetstep3").on("click", this.resetEnabledFlagMarkers.bind(this));
    }

    // called to inform this step that the immediately preceding step has begun processing
    // its inputs. The assumption is that the processing is taking place until the next call to
    // previousStepChanged().
    processingFileInPreviousStep(): void {
        $("#processingStep2ResultsLabel").removeClass("off");
        $("#enterDataInStep2").addClass("off");
        $("#dataTableDiv")
            .find("input,button,textarea,select")
            .attr("disabled", "disabled");
    }

    previousStepChanged(): void {
        const prevStepComplete = this.rawInputStep.requiredInputsProvided();
        $("#processingStep2ResultsLabel").toggleClass("off", !prevStepComplete);
        $("#enterDataInStep2").toggleClass("off", prevStepComplete);
        $("#dataTableDiv").toggleClass("off", !prevStepComplete);

        const mode = this.selectMajorKindStep.interpretationMode;
        const graph = $("#graphDiv");
        this.graphEnabled = IdentifyStructuresStep.MODES_WITH_GRAPH.indexOf(mode) >= 0;
        const showGraph = this.graphEnabled && prevStepComplete;
        graph.toggleClass("off", !showGraph);

        const gridRowMarkers = this.rawInputStep.gridRowMarkers;
        const grid = this.rawInputStep.getGrid();
        const ignoreDataGaps = this.rawInputStep.ignoreDataGaps;

        // Empty the data table whether we remake it or not...
        $("#dataTableDiv").empty();

        const showDataTable =
            IdentifyStructuresStep.MODES_WITH_DATA_TABLE.indexOf(mode) >= 0;
        $("#step3UpperLegend").toggleClass("off", !showDataTable);

        if (showDataTable) {
            gridRowMarkers.forEach((value: string, i: number): void => {
                let type: any;
                if (!this.pulldownUserChangedFlags[i]) {
                    type = this.figureOutThisRowsDataType(mode, value, grid[i] || []);
                    // If we can no longer guess the type, but this pulldown was previously
                    // set to a non-zero value automatically or by an auto-fill operation,
                    // we preserve the old setting.  This prevents in-place edits from
                    // blanking out previous selections in Step 3.
                    this.pulldownSettings[i] = type || this.pulldownSettings[i] || 0;
                }
            });
            // Create a map of enabled/disabled flags for our data,
            // but only fill the areas that do not already exist.
            this.inferActiveFlags(grid);
            // Construct table cell objects for the page, based on our extracted data
            this.constructDataTable(mode, grid, gridRowMarkers);
            // and leaving out any values that have been individually flagged.
            // Update the styles of the new table to reflect the
            // (possibly previously set) flag markers and the "ignore gaps" setting.
            this.redrawIgnoredGapMarkers(ignoreDataGaps);
            this.redrawEnabledFlagMarkers();
        } else if (!showGraph) {
            $("#dataTableDiv").text(
                "This step is not needed for the current import. " +
                    "Nothing to see here, proceed to Step 4.",
            );
        }
        // Either we're interpreting some pre-processed data sets from a server response,
        // or we are interpreting the data table we just laid out above, which involves
        // skipping disabled rows or columns, optionally ignoring blank values, etc.
        this.interpretDataTable();

        // Start a delay timer that redraws the graph from the interpreted data. This is
        // rather resource intensive, so we're delaying a bit, and restarting the delay
        // if the user makes additional edits to the data within the delay period.
        this.queueGraphRemake();
        $("#processingStep2ResultsLabel").addClass("off");

        this.nextStepCallback();
    }

    figureOutThisRowsDataType(mode: string, label: string, row: string[]): number {
        let strings: number;
        if (mode === "tr") {
            if (label.match(/gene/i)) {
                return TypeEnum.Gene_Names;
            }
            if (label.match(/rpkm/i)) {
                return TypeEnum.RPKM_Values;
            }
            // If we can't match to the above two, set the row to 'undefined' so it is
            // ignored by default
            return 0;
        }
        // Take care of some braindead guesses
        if (label.match(/assay/i) || label.match(/line/i)) {
            return TypeEnum.Line_Names;
        }
        // Things we'll be counting to hazard a guess at the row contents
        strings = 0;
        // A condensed version of the row, with no nulls or blank values
        const condensed = row.filter((v: string): boolean => !!v);
        condensed.forEach((v: string): void => {
            v = v.replace(/,/g, "");
            if (isNaN(parseFloat(v))) {
                ++strings;
            }
        });
        // If the label parses into a number and the data contains no strings, call it a
        // timestamp for data
        if (!isNaN(parseFloat(label)) && strings === 0) {
            return TypeEnum.Timestamp;
        }
        // No choice by default
        return 0;
    }

    inferActiveFlags(grid: any): void {
        // An important thing to note here is that this data is in row major format
        // format - that is, it goes by row, then by column, when referencing (i.e.
        // [row][column]). This matches Grid.data and Table.dataCells.

        // infer column active status
        (grid[0] || []).forEach((_, colIndex: number): void => {
            if (this.activeColFlags[colIndex] === undefined) {
                this.activeColFlags[colIndex] = true;
            }
        });

        // infer row active status
        grid.forEach((row: string[], rowIndex: number): void => {
            if (this.activeRowFlags[rowIndex] === undefined) {
                this.activeRowFlags[rowIndex] = true;
            }
            this.activeFlags[rowIndex] = this.activeFlags[rowIndex] || [];
            row.forEach((_, colIndex: number) => {
                if (this.activeFlags[rowIndex][colIndex] === undefined) {
                    this.activeFlags[rowIndex][colIndex] = true;
                }
            });
        });
    }

    constructDataTable(mode: string, grid: any, gridRowMarkers: any): void {
        let pulldownOptions: RowPulldownOption[];

        this.dataCells = [];
        this.colCheckboxCells = [];
        this.colObjects = [];
        this.rowLabelCells = [];
        this.rowCheckboxCells = [];
        const controlCols = ["checkbox", "pulldown", "label"];
        if (mode === "tr") {
            pulldownOptions = [
                [
                    IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL,
                    IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE,
                ],
                [
                    "Entire Row Is...",
                    [
                        ["Gene Names", TypeEnum.Gene_Names],
                        ["RPKM Values", TypeEnum.RPKM_Values],
                    ],
                ],
            ];
        } else {
            pulldownOptions = [
                [
                    IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL,
                    IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE,
                ],
                [
                    "Entire Row Is...",
                    [
                        ["Line Names", TypeEnum.Line_Names],
                        ["Measurement Types", TypeEnum.Measurement_Types],
                        ["Protein IDs", TypeEnum.Protein_Names],
                        ["PubChem CIDs", TypeEnum.Pubchem_Names],
                        ["Gene IDs", TypeEnum.Gene_Names],
                    ],
                ],
                [
                    "First Column Is...",
                    [
                        ["Time (in hours)", TypeEnum.Timestamp],
                        ["Metadata Name", TypeEnum.Metadata_Name],
                        ["Measurement Type", TypeEnum.Measurement_Type],
                        ["Protein ID", TypeEnum.Protein_Name],
                        ["PubChem CID", TypeEnum.Pubchem_Name],
                        ["Gene ID", TypeEnum.Gene_Name],
                    ],
                ],
            ];
        }

        // attach all event handlers to the table itself
        const table = $("<table>")
            .attr("cellspacing", "0")
            .appendTo($("#dataTableDiv"))
            .on("click", "[name=enableColumn]", (ev: JQueryMouseEventObject) => {
                this.toggleTableColumn(ev.target as HTMLElement);
            })
            .on("click", "[name=enableRow]", (ev: JQueryMouseEventObject) => {
                this.toggleTableRow(ev.target as HTMLElement);
            })
            .on("change", ".pulldownCell > select", (ev: JQueryInputEventObject) => {
                const targ: JQuery = $(ev.target as HTMLElement);
                const i: number = parseInt(targ.attr("i"), 10);
                const val: number = parseInt(targ.val() as string, 10);
                $("body").addClass("waitCursor");
                this.changedRowDataTypePulldown(i, val);
                $("body").removeClass("waitCursor");
            })[0] as HTMLTableElement;
        // One of the objects here will be a column group, with col objects in it.
        // This is an interesting twist on DOM behavior that you should probably google.
        const colgroup = $("<colgroup>").appendTo(table);
        controlCols.forEach((): void => {
            $("<col>").appendTo(colgroup);
        });
        const body = $("<tbody>").appendTo(table)[0] as HTMLTableElement;
        // Start with three columns, for the checkboxes, pulldowns, and labels.
        // (These will not be tracked in Table.colObjects.)

        // add col elements for each data column
        (grid[0] || []).forEach((): void => {
            this.colObjects.push($("<col>").appendTo(colgroup)[0]);
        });

        ///////////////////////////////////////////////////////////////////////////////////////
        // First row: spacer cells, followed by checkbox cells for each data column
        ///////////////////////////////////////////////////////////////////////////////////////
        const firstRow = body.insertRow() as HTMLTableRowElement;
        // spacer cells have x and y set to 0 to remove from highlight grid
        controlCols.forEach((): void => {
            $(firstRow.insertCell()).attr({ "x": "0", "y": 0 });
        });
        (grid[0] || []).forEach((_, i: number): void => {
            const cell = $(firstRow.insertCell())
                .attr({ "id": "colCBCell" + i, "x": 1 + i, "y": 0 })
                .addClass("checkBoxCell");
            $('<input type="checkbox"/>')
                .appendTo(cell)
                .val(i.toString())
                .attr({ "id": "enableColumn" + i, "name": "enableColumn" })
                .prop("checked", this.activeColFlags[i]);
            this.colCheckboxCells.push(cell[0]);
        });
        this.pulldownObjects = []; // We don't want any lingering old objects in this

        ///////////////////////////////////////////////////////////////////////////////////////
        // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
        ///////////////////////////////////////////////////////////////////////////////////////
        grid.forEach((values: string[], i: number): void => {
            let cell: JQuery;
            const row = body.insertRow();
            // checkbox cell
            cell = $(row.insertCell())
                .addClass("checkBoxCell")
                .attr({ "id": "rowCBCell" + i, "x": 0, "y": i + 1 });
            $('<input type="checkbox"/>')
                .attr({ "id": "enableRow" + i, "name": "enableRow" })
                .val(i.toString())
                .prop("checked", this.activeRowFlags[i])
                .appendTo(cell);
            this.rowCheckboxCells.push(cell[0]);

            ////////////////////
            // pulldown cell
            ////////////////////
            cell = $(row.insertCell())
                .addClass("pulldownCell")
                .attr({ "id": "rowPCell" + i, "x": 0, "y": i + 1 });
            // use existing setting, or use the last if rows.length > settings.length, or blank
            this.pulldownSettings[i] =
                this.pulldownSettings[i] || this.pulldownSettings.slice(-1)[0] || 0;
            this.populatePulldown(
                (cell = $("<select>")
                    .attr({
                        "id": "row" + i + "type",
                        "name": "row" + i + "type",
                        "i": i,
                    })
                    .appendTo(cell)),
                pulldownOptions,
                this.pulldownSettings[i],
            );
            this.pulldownObjects.push(cell[0]);

            /////////////////////
            // label cell
            ////////////////////
            cell = $(row.insertCell()).attr({
                "id": "rowMCell" + i,
                "x": 0,
                "y": i + 1,
            });
            $("<div>").text(gridRowMarkers[i]).appendTo(cell);
            this.rowLabelCells.push(cell[0]);

            /////////////////////////
            // the table data itself
            /////////////////////////
            this.dataCells[i] = [];
            values.forEach((value: string, x: number): void => {
                let short: string;
                value = short = value || "";
                if (value.length > 32) {
                    short = value.substr(0, 31) + "…";
                }
                cell = $(row.insertCell()).attr({
                    "id": "valCell" + x + "-" + i,
                    "x": x + 1,
                    "y": i + 1,
                    "title": value,
                    "isblank": value === "" ? 1 : undefined,
                });
                $("<div>").text(short).appendTo(cell);
                this.dataCells[i].push(cell[0]);
            });
        });

        const lowerLegend = $("#step3LowerLegend");
        if (grid.length > IdentifyStructuresStep.DUPLICATE_LEGEND_THRESHOLD) {
            if (!lowerLegend.length) {
                $("#step3UpperLegend")
                    .clone()
                    .attr("id", "step3LowerLegend")
                    .insertAfter("#dataTableDiv");
            }
        } else {
            lowerLegend.remove();
        }
        $(".step3Legend").toggleClass("off", grid.length === 0);
        this.applyTableDataTypeStyling(grid);
    }

    // A recursive function to populate a pulldown with optional optiongroups,
    // and a default selection
    populatePulldown(
        select: JQuery,
        options: RowPulldownOption[],
        value: number,
    ): void {
        options.forEach((option: RowPulldownOption): void => {
            if (typeof option[1] === "number") {
                const opt: number = option[1] as number;
                $("<option>")
                    .text(option[0])
                    .val(opt)
                    .prop("selected", option[1] === value)
                    .appendTo(select);
            } else {
                const opts: RowPulldownOption[] = option[1] as RowPulldownOption[];
                this.populatePulldown(
                    $("<optgroup>").attr("label", option[0]).appendTo(select),
                    opts,
                    value,
                );
            }
        });
    }

    // This routine does a bit of additional styling to the Step 3 data table.
    // It removes and re-adds the dataTypeCell css classes according to the pulldown settings
    // for each row.
    applyTableDataTypeStyling(grid: any): void {
        grid.forEach((row: string[], index: number): void => {
            let hlLabel: boolean, hlRow: boolean;
            const pulldown = this.pulldownSettings[index] || 0;
            hlLabel = hlRow = false;
            if (
                pulldown === TypeEnum.Line_Names ||
                pulldown === TypeEnum.Measurement_Types ||
                pulldown === TypeEnum.Pubchem_Names ||
                pulldown === TypeEnum.Gene_Names ||
                pulldown === TypeEnum.Protein_Names
            ) {
                hlRow = true;
            } else if (
                pulldown === TypeEnum.Timestamp ||
                pulldown === TypeEnum.Metadata_Name ||
                pulldown === TypeEnum.Protein_Name ||
                pulldown === TypeEnum.Pubchem_Name ||
                pulldown === TypeEnum.Gene_Name ||
                pulldown === TypeEnum.Measurement_Type
            ) {
                hlLabel = true;
            }
            $(this.rowLabelCells[index]).toggleClass("dataTypeCell", hlLabel);
            row.forEach((_, col: number): void => {
                $(this.dataCells[index][col]).toggleClass("dataTypeCell", hlRow);
            });
        });
    }

    redrawIgnoredGapMarkers(ignoreDataGaps: boolean): void {
        this.dataCells.forEach((row: HTMLElement[]): void => {
            row.forEach((cell: HTMLElement): void => {
                const disabled: boolean =
                    !ignoreDataGaps && !!cell.getAttribute("isblank");
                $(cell).toggleClass("disabledInput", disabled);
            });
        });
    }

    redrawEnabledFlagMarkers(): void {
        // loop over cells in the table, styling them as needed to show
        // ignored/interpretation-needed status
        this.dataCells.forEach((row: HTMLElement[], rowIndex: number): void => {
            const pulldown = this.pulldownSettings[rowIndex];
            const disableRow = !this.activeRowFlags[rowIndex];
            const rowLabelCell = $(this.rowLabelCells[rowIndex]);
            rowLabelCell.toggleClass("disabledInput", disableRow);

            row.forEach((cell: HTMLElement, colIndex: number): void => {
                const disableCell =
                    !this.activeFlags[rowIndex][colIndex] ||
                    !this.activeColFlags[colIndex] ||
                    !this.activeRowFlags[rowIndex];
                const cellJQ = $(cell);
                cellJQ.toggleClass("disabledInput", disableCell);

                // if the cell will be ignored because no selection has been made for its row,
                // change the background so it's obvious that it won't be used
                const ignoreRow =
                    pulldown === IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE &&
                    !disableCell;
                cellJQ.toggleClass("missingInterpretationRow", ignoreRow);
                rowLabelCell.toggleClass("missingInterpretationRow", ignoreRow);
            });
        });

        // style table cells containing column checkboxes in the same way their content was
        // styled above
        this.colCheckboxCells.forEach((box: HTMLElement, x: number): void => {
            const toggle = !this.activeColFlags[x];
            $(box).toggleClass("disabledInput", toggle);
        });
    }

    changedRowDataTypePulldown(index: number, value: number): void {
        const grid = this.rawInputStep.getGrid();
        this.pulldownSettings[index] = value;
        this.pulldownUserChangedFlags[index] = true;
        if (
            value === TypeEnum.Timestamp ||
            value === TypeEnum.Metadata_Name ||
            value === TypeEnum.Measurement_Type ||
            value === TypeEnum.Protein_Name ||
            value === TypeEnum.Pubchem_Name ||
            value === TypeEnum.Gene_Name
        ) {
            // "Timestamp", "Metadata", or other single-table-cell types
            // Set all the rest of the pulldowns to this,
            // based on the assumption that the first is followed by many others
            this.pulldownObjects
                .slice(index + 1)
                .every((pulldown: HTMLSelectElement): boolean => {
                    const select = $(pulldown);
                    const i = parseInt(select.attr("i"), 10);
                    // if user changed value for this pulldown, stop auto-selecting values for
                    // this and subsequent pulldowns
                    if (
                        this.pulldownUserChangedFlags[i] &&
                        this.pulldownSettings[i] !== 0
                    ) {
                        return false; // break out of loop
                    }
                    select.val(value.toString());
                    this.pulldownSettings[i] = value;
                    return true; // continue looping
                });
            // In addition to the above action, we also need to do some checking on the entire
            // set of pulldowns, to enforce a division between the "Measurement Type" single
            // data type and the other single data types. If the user uses even one
            // "Measurement Type" pulldown, we can't allow any of the other types,
            // and vice-versa.
            //   Why?  Because "Measurement Type" is used to label the specific case of a
            // table that does not contain a timestamp on either axis. In that case, the
            // table is meant to provide data for multiple Measurements and Assays for a
            // single unspecified time point. (That time point is requested later in the UI.)
            //   If we allow a single timestamp row, that creates an inconsistent table that
            // is impossible to interpret.
            //   If we allow a single metadata row, that leaves the metadata unconnected to a
            // specific measurement, meaning that the only valid way to interpret it is as
            // Line metadata. We could potentially support that, but it would be the only case
            // where data imported on this page does not end up in Assays ... and that case
            // does not make much sense given that this is the Assay Data Import page!
            //   Anyway, here we run through the pulldowns, making sure that if the user
            // selected "Measurement Type", we blank out all references to "Timestamp" and
            // "Metadata", and vice-versa.
            if (
                value === TypeEnum.Measurement_Type ||
                value === TypeEnum.Timestamp ||
                value === TypeEnum.Metadata_Name
            ) {
                grid.forEach((_, i: number): void => {
                    const c: number = this.pulldownSettings[i];
                    if (value === TypeEnum.Measurement_Type) {
                        if (c === TypeEnum.Timestamp || c === TypeEnum.Metadata_Name) {
                            this.pulldownObjects[i].selectedIndex = 0;
                            this.pulldownSettings[i] = 0;
                        } else if (c === TypeEnum.Measurement_Types) {
                            // Can't allow "Measurement Types" setting either
                            this.pulldownObjects[i].selectedIndex = TypeEnum.Line_Names;
                            this.pulldownSettings[i] = TypeEnum.Line_Names;
                        }
                    } else if (
                        c === TypeEnum.Measurement_Type &&
                        (value === TypeEnum.Timestamp ||
                            value === TypeEnum.Metadata_Name)
                    ) {
                        this.pulldownObjects[i].selectedIndex = 0;
                        this.pulldownSettings[i] = 0;
                    }
                });
                // It would seem logical to require a similar check for "Protein Name", but in
                // practice the user is disallowed from selecting any of the other
                // single-table-cell types when the page is in Proteomics mode. So, the check
                // is redundant.
            }
        }

        this.interpretRowDataTypePulldowns();
    }

    // update state as a result of row datatype pulldown selection
    interpretRowDataTypePulldowns(): void {
        const grid = this.rawInputStep.getGrid();
        this.applyTableDataTypeStyling(grid);
        this.interpretDataTable();
        this.redrawEnabledFlagMarkers();
        this.queueGraphRemake();
        this.nextStepCallback();
    }

    toggleTableRow(box: HTMLElement): void {
        const checkbox: JQuery = $(box);
        const pulldown: JQuery = checkbox.next();
        const input: number = parseInt(checkbox.val() as string, 10);
        const active = checkbox.prop("checked");
        this.activeRowFlags[input] = active;
        if (active) {
            pulldown.removeAttr("disabled");
        } else {
            pulldown.attr("disabled", "disabled");
        }

        this.interpretDataTable();
        this.redrawEnabledFlagMarkers();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        this.queueGraphRemake();
        this.nextStepCallback();
    }

    toggleTableColumn(box: HTMLElement): void {
        $("body").addClass("waitCursor");
        const input = $(box);
        const value = parseInt(input.val() as string, 10);
        this.activeColFlags[value] = input.prop("checked");
        this.interpretDataTable();
        this.redrawEnabledFlagMarkers();
        $("body").removeClass("waitCursor");

        // Resetting a disabled column may change the rows listed in the Info table.
        this.queueGraphRemake();
        this.nextStepCallback();
    }

    resetEnabledFlagMarkers(): void {
        const grid = this.rawInputStep.getGrid();
        grid.forEach((row: string[], y: number): void => {
            this.activeFlags[y] = this.activeFlags[y] || [];
            row.forEach((_, x: number): void => {
                this.activeFlags[y][x] = true;
            });
            this.activeRowFlags[y] = true;
        });
        (grid[0] || []).forEach((_, x: number): void => {
            this.activeColFlags[x] = true;
        });
        // Flip all the checkboxes on in the header cells for the data columns
        $("#dataTableDiv").find("[name=enableColumn]").prop("checked", true);
        // Same for the checkboxes in the row label cells
        $("#dataTableDiv").find("[name=enableRow]").prop("checked", true);
        this.interpretDataTable();
        this.redrawEnabledFlagMarkers();
        this.queueGraphRemake();
        this.nextStepCallback();
    }

    interpretDataTable(): void {
        // This mode means we make a new "set" for each cell in the table, rather than
        // the standard method of making a new "set" for each column in the table.
        let singleCompatibleCount: number;
        let singleNotCompatibleCount: number;
        let earliestName: number;

        const grid = this.rawInputStep.getGrid();
        const gridRowMarkers = this.rawInputStep.gridRowMarkers;
        const ignoreDataGaps = this.rawInputStep.ignoreDataGaps;

        // We'll be accumulating these for disambiguation.
        const seenLineNames: { [id: string]: boolean } = {};
        const seenAssayNames: { [id: string]: boolean } = {};
        const seenMeasurementNames: { [id: string]: boolean } = {};
        const seenMetadataNames: { [id: string]: boolean } = {};

        // Here are the arrays we will use later
        this.parsedSets = [];

        this.uniqueLineNames = [];
        this.uniqueAssayNames = [];
        this.uniqueMeasurementNames = [];
        this.uniqueUniprot = [];
        this.uniquePubchem = [];
        this.uniqueGenbank = [];
        this.uniqueMetadataNames = [];
        this.seenAnyTimestamps = false;

        // If we've got pre-processed sets from the server available, use those instead of any
        // table contents.

        if (this.rawInputStep.processedSetsAvailable) {
            this.rawInputStep.processedSetsFromFile.forEach(
                (rawSet, c: number): void => {
                    let an = rawSet.assay_name;
                    const ln = rawSet.line_name;
                    const mn = rawSet.measurement_name;

                    const uniqueTimes: number[] = [];
                    const times = {};

                    // The procedure for Assays, Measurements, etc is the same:
                    // If the value is blank, we can't build a valid set, so skip to the next set.
                    // If the value is valid but we haven't seen it before, increment and store a
                    // uniqueness index.
                    if (!ln && ln !== 0) {
                        return;
                    }
                    if (!mn && mn !== 0) {
                        return;
                    }
                    if (!an && an !== 0) {
                        // if just the assay name is missing, set it to the line name
                        an = ln;
                    }
                    if (!seenLineNames[ln]) {
                        seenLineNames[ln] = true;
                        this.uniqueLineNames.push(ln);
                    }
                    if (!seenAssayNames[an]) {
                        seenAssayNames[an] = true;
                        this.uniqueAssayNames.push(an);
                    }
                    if (!seenMeasurementNames[mn]) {
                        seenMeasurementNames[mn] = true;
                        this.uniqueMeasurementNames.push(mn);
                    }

                    const reassembledData: [number, number][] = [];

                    // Slightly different procedure for metadata, but same idea:
                    Object.keys(rawSet.metadata_by_name).forEach((key): void => {
                        if (!seenMetadataNames[key]) {
                            seenMetadataNames[key] = true;
                            this.uniqueMetadataNames.push(key);
                        }
                    });

                    // Validate the provided set of time/value points
                    rawSet.data.forEach((xy: any[]): void => {
                        let time: number;
                        let value: number;
                        if (xy[0] === null) {
                            // keep explicit null values
                            time = null;
                        } else if (!Number.isFinite(xy[0])) {
                            // Sometimes people - or Excel docs - drop commas into large numbers.
                            time = parseFloat((xy[0] || "0").replace(/,/g, ""));
                        } else {
                            time = xy[0] as number;
                        }
                        // If we can't parse a usable timestamp, discard this point.
                        // NOTE: Number.isNaN(null) === false
                        if (Number.isNaN(time)) {
                            return;
                        }
                        if (!xy[1] && xy[1] !== 0) {
                            // If we're ignoring gaps, skip any undefined/null values.
                            // A null is our standard placeholder value
                            value = null;
                        } else if (!Number.isFinite(xy[1])) {
                            value = parseFloat((xy[1] || "").replace(/,/g, ""));
                        } else {
                            value = xy[1] as number;
                        }
                        if (times[time] === undefined) {
                            times[time] = value;
                            uniqueTimes.push(time);
                            this.seenAnyTimestamps = time !== null;
                        }
                    });
                    uniqueTimes
                        .sort((a, b) => a - b)
                        .forEach((time: number): void => {
                            reassembledData.push([time, times[time]]);
                        });

                    const set = {
                        // Copy across the fields from the RawImportSet record
                        "kind": rawSet.kind,
                        "hint": rawSet.hint,
                        "line_name": rawSet.line_name,
                        "assay_name": an,
                        "measurement_name": rawSet.measurement_name,
                        "metadata_by_name": rawSet.metadata_by_name,
                        "data": reassembledData,
                    };
                    this.parsedSets.push(set);
                },
            );
            return;
        }

        // If we are not using pre-processed records, we need to use the pulldown settings in
        // this step (usually set by the user) to determine what mode we're in.

        singleCompatibleCount = 0;
        singleNotCompatibleCount = 0;
        earliestName = null;
        // Look for the presence of "single measurement type" rows, and rows of all other
        // single-item types
        grid.forEach((_, y: number): void => {
            // Skip inactive rows
            if (!this.activeRowFlags[y]) {
                return;
            }
            const pulldown = this.pulldownSettings[y];
            if (
                pulldown === TypeEnum.Measurement_Type ||
                pulldown === TypeEnum.Protein_Name ||
                pulldown === TypeEnum.Pubchem_Name ||
                pulldown === TypeEnum.Gene_Name
            ) {
                singleCompatibleCount++; // Single Measurement Name or Single Protein Name
            } else if (
                pulldown === TypeEnum.Metadata_Name ||
                pulldown === TypeEnum.Timestamp
            ) {
                singleNotCompatibleCount++;
            } else if (pulldown === TypeEnum.Line_Names && earliestName === null) {
                earliestName = y;
            }
        });

        // Only use this mode if the table is entirely free of single-timestamp and
        // single-metadata rows, and has at least one "single measurement" or "single protein"
        // row, and at least one "Assay/Line names" row.
        // (Note that requirement of an "Assay/Line names" row prevents this mode from being
        // enabled when the page is in 'Transcriptomics' mode.)
        const singleMode =
            singleCompatibleCount > 0 &&
            singleNotCompatibleCount === 0 &&
            earliestName !== null;

        // A "set" for every cell of the table, with the timestamp to be determined later.
        if (singleMode) {
            this.colObjects.forEach((_, c: number): void => {
                if (!this.activeColFlags[c]) {
                    return;
                }
                const cellValue = grid[earliestName][c] || "";
                if (!cellValue) {
                    return;
                }

                // If haven't seen cellValue before, increment and store uniqueness index
                if (!seenAssayNames[cellValue]) {
                    seenAssayNames[cellValue] = true;
                    this.uniqueAssayNames.push(cellValue);
                }
                grid.forEach((row: string[], r: number): void => {
                    let hint: string;
                    if (!this.activeRowFlags[r] || !this.activeFlags[r][c]) {
                        return;
                    }
                    const pulldown = this.pulldownSettings[r];
                    const label = gridRowMarkers[r] || "";
                    const value = row[c] || "";
                    if (!pulldown || !label || !value) {
                        return;
                    }

                    let m_name: string = null;
                    if (pulldown === TypeEnum.Measurement_Type) {
                        if (!seenMeasurementNames[label]) {
                            seenMeasurementNames[label] = true;
                            this.uniqueMeasurementNames.push(label);
                        }
                        m_name = label;
                    } else if (
                        pulldown === TypeEnum.Protein_Name ||
                        pulldown === TypeEnum.Pubchem_Name ||
                        pulldown === TypeEnum.Gene_Name
                    ) {
                        m_name = label;
                    } else {
                        // If we aren't on a row that's labeled as either a metabolite value
                        // or a protein value, return without making a set.
                        return;
                    }
                    switch (pulldown) {
                        case TypeEnum.Pubchem_Name:
                            hint = "m";
                            this.uniquePubchem.push(m_name);
                            break;
                        case TypeEnum.Protein_Name:
                            hint = "p";
                            this.uniqueUniprot.push(m_name);
                            break;
                        case TypeEnum.Gene_Name:
                            hint = "g";
                            this.uniqueGenbank.push(m_name);
                            break;
                        default:
                            hint = null;
                            break;
                    }

                    const rawSet: RawImportSet = {
                        "kind": this.selectMajorKindStep.interpretationMode,
                        "hint": hint,
                        "line_name": null,
                        "assay_name": cellValue,
                        "measurement_name": m_name,
                        "metadata_by_name": {},
                        "data": [[null, value]],
                    };

                    this.parsedSets.push(rawSet);
                });
            });
            return;
        }

        // The standard method: Make a "set" for each column of the table

        this.colObjects.forEach((_, col: number): void => {
            let foundMeta: boolean;
            // Skip it if the whole column is deactivated
            if (!this.activeColFlags[col]) {
                return;
            }

            // We'll fill this out as we go
            const reassembledData = [];

            const set: RawImportSet = {
                "kind": this.selectMajorKindStep.interpretationMode,
                "hint": null,
                "line_name": null,
                "assay_name": null,
                "measurement_name": null,
                "metadata_by_name": {},
                "data": reassembledData,
            };

            const uniqueTimes: number[] = [];
            const times = {};
            foundMeta = false;
            grid.forEach((row: string[], r: number): void => {
                let label: string, value: string, timestamp: number;
                if (!this.activeRowFlags[r] || !this.activeFlags[r][col]) {
                    return;
                }
                const pulldown = this.pulldownSettings[r];
                label = gridRowMarkers[r] || "";
                value = row[col] || "";
                if (!pulldown) {
                    return; // skip row if there's nothing selected in the pulldown
                } else if (pulldown === TypeEnum.RPKM_Values) {
                    // Transcriptomics: RPKM values
                    value = value.replace(/,/g, "");
                    if (value) {
                        reassembledData.push([null, value]);
                    }
                    return;
                } else if (pulldown === TypeEnum.Gene_Names) {
                    // Transcriptomics: Gene names
                    if (value) {
                        set.hint = "g";
                        set.measurement_name = value;
                        this.uniqueGenbank.push(value);
                    }
                    return;
                } else if (pulldown === TypeEnum.Timestamp) {
                    // Timestamps
                    label = label.replace(/,/g, "");
                    timestamp = parseFloat(label);
                    if (!isNaN(timestamp)) {
                        if (!value) {
                            // If we're ignoring gaps, skip out on recording this value
                            if (ignoreDataGaps) {
                                return;
                            }
                            // We actually prefer null here, to indicate a placeholder value
                            value = null;
                        }
                        if (!times[timestamp]) {
                            times[timestamp] = value;
                            uniqueTimes.push(timestamp);
                            this.seenAnyTimestamps = true;
                        }
                    }
                    return;
                } else if (value === "") {
                    // Now that we have dealt with timestamps, we proceed on to other data
                    // types. All the other data types do not accept a blank value, so we weed
                    // them out now.
                    return;
                } else if (pulldown === TypeEnum.Line_Names) {
                    // If haven't seen value before, increment and store uniqueness index
                    if (!seenAssayNames[value]) {
                        seenAssayNames[value] = true;
                        this.uniqueAssayNames.push(value);
                    }
                    set.assay_name = value;
                    return;
                } else if (pulldown === TypeEnum.Measurement_Types) {
                    // Metabolite Names
                    // If haven't seen value before, increment and store uniqueness index
                    if (!seenMeasurementNames[value]) {
                        seenMeasurementNames[value] = true;
                        this.uniqueMeasurementNames.push(value);
                    }
                    set.measurement_name = value;
                    return;
                } else if (pulldown === TypeEnum.Pubchem_Names) {
                    if (!seenMeasurementNames[value]) {
                        seenMeasurementNames[value] = true;
                        this.uniquePubchem.push(value);
                    }
                    set.hint = "m";
                    set.measurement_name = value;
                    return;
                } else if (pulldown === TypeEnum.Protein_Names) {
                    if (!seenMeasurementNames[value]) {
                        seenMeasurementNames[value] = true;
                        this.uniqueUniprot.push(value);
                    }
                    set.hint = "p";
                    set.measurement_name = value;
                    return;
                } else if (label === "") {
                    return;
                } else if (pulldown === TypeEnum.Metadata_Name) {
                    // Metadata
                    if (!seenMetadataNames[label]) {
                        seenMetadataNames[label] = true;
                        this.uniqueMetadataNames.push(label);
                    }
                    set.metadata_by_name[label] = value;
                    foundMeta = true;
                }
            });
            uniqueTimes
                .sort((a, b) => a - b)
                .forEach((time: number): void => {
                    reassembledData.push([time, times[time]]);
                });
            // only save if accumulated some data or metadata
            if (!uniqueTimes.length && !foundMeta && !reassembledData[0]) {
                return;
            }

            this.parsedSets.push(set);
        });
    }

    highlighterF(e: JQueryMouseEventObject): void {
        // Walk up the item tree until we arrive at a table cell,
        // so we can get the index of the table cell in the table.
        const cell = $(e.target).closest("td");
        if (cell.length) {
            const x = parseInt(cell.attr("x"), 10);
            const y = parseInt(cell.attr("y"), 10);
            if (x) {
                $(this.colObjects[x - 1]).toggleClass(
                    "hoverLines",
                    e.type === "mouseover",
                );
            }
            if (y) {
                cell.closest("tr").toggleClass("hoverLines", e.type === "mouseover");
            }
        }
    }

    singleValueDisablerF(e: JQueryMouseEventObject): void {
        // Walk up the item tree until we arrive at a table cell,
        // so we can get the index of the table cell in the table.
        const cell = $(e.target).closest("td");
        if (!cell.length) {
            return;
        }
        let x = parseInt(cell.attr("x"), 10);
        let y = parseInt(cell.attr("y"), 10);
        if (!x || !y || x < 1 || y < 1) {
            return;
        }
        --x;
        --y;
        if (this.activeFlags[y][x]) {
            this.activeFlags[y][x] = false;
        } else {
            this.activeFlags[y][x] = true;
        }
        this.interpretDataTable();
        this.redrawEnabledFlagMarkers();
        this.queueGraphRemake();
        this.nextStepCallback();
    }

    queueGraphRemake(): void {
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        // TODO: as a future improvement, it would be better UI to mark the graph as being
        // rebuilt in case there's a lot of data and it takes a while to update it. In that
        // case, also maybe best to defer all updates to subsequent steps until after the
        // graph update is complete.
        if (this.graphRefreshTimerID) {
            window.clearTimeout(this.graphRefreshTimerID);
        }
        if (this.graphEnabled) {
            this.graphRefreshTimerID = window.setTimeout(
                this.remakeGraphArea.bind(this),
                700,
            );
        }
    }

    remakeGraphArea(): void {
        // do nothing; deprecated
    }

    getUserWarnings(): ImportMessage[] {
        return this.warningMessages;
    }

    getUserErrors(): ImportMessage[] {
        return this.errorMessages;
    }

    requiredInputsProvided(): boolean {
        // require user input for every non-ignored row
        const needPulldownSet = this.pulldownObjects.some(
            (pulldown: HTMLElement, row: number): boolean => {
                if (!this.activeRowFlags[row]) {
                    return false;
                } else {
                    const value = parseInt($(pulldown).val() as string, 10);
                    return value === IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE;
                }
            },
        );
        $("#missingStep3InputDiv").toggleClass("off", !needPulldownSet);
        return !needPulldownSet && this.parsedSets.length > 0;
    }
}

// The class responsible for everything in the "Step 4" box that you see on the data
// import page.
class TypeDisambiguationStep {
    identifyStructuresStep: IdentifyStructuresStep;

    // These objects hold string keys that correspond to unique names found during parsing.
    // The string keys point to existing autocomplete objects created specifically for
    // those strings.  Any selections the user has already set will be preserved,
    // even as the disambiguation section is destroyed and remade.

    masterAssaysOptionsDisplayedForProtocol: number;
    // For disambuguating Lines
    lineObjSets: { [index: string]: LineDisambiguationRow };
    currentlyVisibleLineObjSets: LineDisambiguationRow[];
    // For disambuguating Assays (really Assay/Line combinations)
    assayObjSets: { [index: string]: AssayDisambiguationRow };
    currentlyVisibleAssayObjSets: AssayDisambiguationRow[];
    // For disambuguating measurement types
    measurementObjSets: any;
    currentlyVisibleMeasurementObjSets: any[];
    // For disambuguating metadata
    metadataObjSets: { [index: string]: MetadataDisambiguationRow };

    selectMajorKindStep: SelectMajorKindStep;
    nextStepCallback: () => void;

    inputRefreshTimerID: number;
    thisStepInputTimerID: number;

    errorMessages: ImportMessage[];
    warningMessages: ImportMessage[];

    static STEP_4_USER_INPUT_CLASS = "step4_user_input";
    static STEP_4_REQUIRED_INPUT_CLASS = "step4_required_input";
    static STEP_4_TOGGLE_ROW_CHECKBOX = "toggleAllButton";
    static STEP_4_TOGGLE_SUBSECTION_CLASS = "step4SubsectionToggle";
    static STEP_4_SUBSECTION_REQUIRED_CLASS = "step4RequiredSubsectionLabel";

    TOGGLE_ALL_THREASHOLD = 4;
    DUPLICATE_CONTROLS_THRESHOLD = 10;

    constructor(
        mkStep: SelectMajorKindStep,
        isStep: IdentifyStructuresStep,
        nextStepCallback: () => void,
    ) {
        this.lineObjSets = {};
        this.assayObjSets = {};
        this.currentlyVisibleLineObjSets = [];
        this.currentlyVisibleAssayObjSets = [];
        this.measurementObjSets = {};
        this.currentlyVisibleMeasurementObjSets = [];
        this.metadataObjSets = {};
        this.masterAssaysOptionsDisplayedForProtocol = 0;

        this.selectMajorKindStep = mkStep;
        this.identifyStructuresStep = isStep;
        this.nextStepCallback = nextStepCallback;
        this.errorMessages = [];
        this.warningMessages = [];

        // set up a listener to recreate the controls for this step based on a change to any
        // of the "master" inputs that requires rebuilding the form for this step.
        // Note that here and below we use 'input' since it makes the GUI more responsive
        // to user changes. A separate timer we've added prevents reprocessing the form too
        // many times.
        const reDoStepOnChange = [
            "#masterAssay",
            "#masterLine",
            "#masterMComp",
            "#masterMType",
            "#masterMUnits",
        ];
        $(reDoStepOnChange.join(",")).on(
            "input",
            this.changedAnyMasterPulldown.bind(this),
        );

        // toggle matched assay section
        $("#matchedAssaysSection .discloseLink").on("click", function (e) {
            $(e.target).closest(".disclose").toggleClass("discloseHide");
        });

        const masterInputSelectors = ["#masterTimestamp"].concat(reDoStepOnChange);
        $("#masterTimestamp").on("input", this.queueReparseThisStep.bind(this));
        $("#resetstep4").on("click", this.resetDisambiguationFields.bind(this));
        $(masterInputSelectors).addClass(
            TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS,
        );

        // enable autocomplete on statically defined fields
        EDDAuto.BaseAuto.initPreexisting($("#typeDisambiguationStep"));

        // set autofill callback for compartment/units
        [".autocomp_compartment", ".autocomp_unit"].forEach((selector) => {
            const table: JQuery = $("#disambiguateMeasurementsTable");
            // when an autocomplete changes
            table.on("autochange", selector, (ev, visibleValue, hiddenValue) => {
                const visibleInput: JQuery = $(ev.target);
                // mark the changed autocomplete as user-set
                visibleInput.data("userSetValue", true);
                // then fill in all following autocompletes of same type
                // until one is user-set
                visibleInput
                    .closest("tr")
                    .nextAll("tr")
                    .find(selector)
                    .each((i, element) => {
                        const following = $(element);
                        if (following.data("userSetValue")) {
                            return false;
                        }
                        following.val(visibleValue).next("input").val(hiddenValue);
                    });
            });
        });
    }

    setAllInputsEnabled(enabled: boolean) {
        const allUserInputs: JQuery = $(
            "." + TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS,
        );

        allUserInputs.each(function (index: number, domElement: HTMLElement) {
            const input = $(domElement);
            if (enabled) {
                input.removeAttr("disabled");
            } else {
                input.attr("disabled", "disabled");
            }
        });
    }

    previousStepChanged(): void {
        this.disableInputDuringProcessing();
        const masterP = this.selectMajorKindStep.masterProtocol;

        // Recreate the master assay pulldown here instead of in remakeAssaySection()
        // because its options are NOT affected by changes to steps after #1, so it would be
        // pointless to remake it in response to them. We may show/hide
        // it based on other state, but its content won't change. RemakeAssaySection() is
        // called by reconfigure(), which is called when other UI in this step changes.
        if (this.masterAssaysOptionsDisplayedForProtocol !== masterP) {
            this.masterAssaysOptionsDisplayedForProtocol = masterP;

            const assayIn: JQuery = $("#masterAssay").empty();
            $("<option>")
                .text("(Create New)")
                .appendTo(assayIn)
                .val("named_or_new")
                .prop("selected", true);
            const currentAssays: number[] = window.ATData.existingAssays[masterP] || [];
            currentAssays.forEach((id: number): void => {
                const assay = window.EDDData.Assays[id];
                $("<option>")
                    .appendTo(assayIn)
                    .val("" + id)
                    .text(assay.name);
            });
            // Always reveal this, since the default for the Assay pulldown is always 'new'.
            $("#masterLineSpan").removeClass("off");
        }
        this.queueReconfigure();
    }

    // Start a timer to wait before calling the reconfigure routine. This way we condense
    // multiple possible events from the radio buttons and/or pulldown into one.
    queueReconfigure(): void {
        this.disableInputDuringProcessing();
        if (this.inputRefreshTimerID) {
            window.clearTimeout(this.inputRefreshTimerID);
        }

        // long timeout so we don't interfere with ongoing user edits
        this.inputRefreshTimerID = window.setTimeout(this.reconfigure.bind(this), 500);
    }

    queueReparseThisStep(): void {
        if (this.thisStepInputTimerID) {
            window.clearTimeout(this.thisStepInputTimerID);
        }
        $("body").addClass("waitCursor");
        this.thisStepInputTimerID = window.setTimeout(
            this.reparseThisStep.bind(this),
            500,
        );
    }

    // re-parses user inputs from this step to determine whether they've all been provided
    reparseThisStep(): void {
        this.createSetsForSubmission();
        this.nextStepCallback();
    }

    disableInputDuringProcessing(): void {
        const hasRequiredInitialInputs =
            this.identifyStructuresStep.requiredInputsProvided();
        $("#emptyDisambiguationLabel").toggleClass("off", hasRequiredInitialInputs);
        $("#processingStep3Label").toggleClass("off", !hasRequiredInitialInputs);
        this.setAllInputsEnabled(false);
    }

    // Create the Step 4 tables:  Sets of rows, one for each y-axis column of values,
    // where the user can fill out additional information for the pasted table.
    reconfigure(): void {
        const mode = this.selectMajorKindStep.interpretationMode;
        const hasRequiredInitialInput =
            this.identifyStructuresStep.requiredInputsProvided();

        // Hide all the subsections by default
        $(".disambiguationSections > .sectionContent").addClass("off");

        // remove toggle buttons and labels dynamically added for some subsections
        // (easier than leaving them in place)
        $("." + TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS).remove();
        $("." + TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS).remove();

        // If parsed data exists, but we haven't seen a single timestamp, show the "master
        // timestamp" input.
        this.remakeTimestampSection();

        // Call subroutines for each of the major sections
        if (mode === "biolector") {
            this.remakeLineSection();
        } else {
            this.remakeAssaySection();
        }

        this.remakeMeasurementSection();
        this.remakeMetadataSection();

        // add a listener to all the required input fields so we can detect when they are
        // changed and know whether or not to allow continuation to the subsequent step
        $("." + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS).on("input", () => {
            this.queueReparseThisStep();
        });

        $("#emptyDisambiguationLabel").toggleClass("off", hasRequiredInitialInput);
        $("#processingStep3Label").addClass("off");
        this.setAllInputsEnabled(true);

        this.reparseThisStep();
    }

    static requireInput(input: JQuery, required: boolean) {
        input.toggleClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS, required);
    }

    private remakeTimestampSection() {
        const seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
        const hasRequiredInitialInput =
            this.identifyStructuresStep.requiredInputsProvided();
        const showMasterTimestamp = hasRequiredInitialInput && !seenAnyTimestamps;
        $("#masterTimestampDiv").toggleClass("off", !showMasterTimestamp);
        TypeDisambiguationStep.requireInput($("#masterTimestamp"), showMasterTimestamp);
    }

    // TODO: This function should reset all the disambiguation fields to the values
    // that were auto-detected in the last refresh of the object.
    resetDisambiguationFields(): void {
        // Get to work!!
    }

    addToggleAllButton(parent: JQuery, objectsLabel: string): JQuery {
        return this.makeToggleAllButton(objectsLabel).appendTo($(parent));
    }

    makeToggleAllButton(objectsLabel: string): JQuery {
        return $('<button type="button">')
            .text("Select None")
            .addClass(TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS)
            .on("click", this.toggleAllSubsectionItems.bind(this));
    }

    toggleAllSubsectionItems(ev: JQueryEventObject): void {
        let allSelected = true;
        const parentDiv: JQuery = $(ev.target as HTMLElement).parent();
        const cb_filter = "." + TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX;
        const checkboxes: JQuery = $(parentDiv).find(cb_filter);

        checkboxes.toArray().some((elt: any): boolean => {
            const checkbox = $(elt);
            if (!checkbox.prop("checked")) {
                allSelected = false;
                return true; // break; for the Array.some() loop
            }
            return false;
        });

        if (allSelected) {
            $(event.target).text("Select All");
        } else {
            $(event.target).text("Select None");
        }

        // un/check all checkboxes based on their previous state
        checkboxes.each((index: number, elt: HTMLElement) => {
            const checkbox = $(elt);
            checkbox.prop("checked", !allSelected);
            DisambiguationRow.toggleTableRowEnabled(checkbox);
        });

        this.queueReparseThisStep();
    }

    // If the previous step found Line names that need resolving, and the interpretation mode
    // in Step 1 warrants resolving Lines independent of Assays, we create this section.
    // The point is that if we connect unresolved Line strings on their own, the unresolved
    // Assay strings can be used to create multiple new Assays with identical names under a
    // range of Lines. This means users can create a matrix of Line/Assay combinations, rather
    // than a one-dimensional resolution where unique Assay names must always point to one
    // unique Assay record.
    remakeLineSection(): void {
        const uniqueLineNames = this.identifyStructuresStep.uniqueLineNames;
        this.currentlyVisibleLineObjSets.forEach(
            (disam: LineDisambiguationRow): void => {
                disam.detach();
            },
        );
        $("#disambiguateLinesTable").remove();
        this.lineObjSets = {};
        if (uniqueLineNames.length === 0) {
            const hasRequiredInputs =
                this.identifyStructuresStep.requiredInputsProvided();
            $("#masterLineDiv").toggleClass("off", !hasRequiredInputs);
            TypeDisambiguationStep.requireInput($("#masterLine"), hasRequiredInputs);
            return;
        }
        this.currentlyVisibleLineObjSets = [];
        const parentDiv = $("#disambiguateLinesSection");
        const requiredInputText = "At least one line is required.";
        this.addRequiredInputLabel(parentDiv, requiredInputText);
        if (uniqueLineNames.length > this.TOGGLE_ALL_THREASHOLD) {
            this.addToggleAllButton(parentDiv, "Lines");
        }
        ///////////////////////////////////////////////////////////////////////////////////////
        // Set up the table and column headers
        ///////////////////////////////////////////////////////////////////////////////////////
        const table = $("<table>")
            .attr({ "id": "disambiguateLinesTable", "cellspacing": 0 })
            .appendTo(parentDiv.removeClass("off"))
            .on("change", "select", (ev: JQueryInputEventObject): void => {
                this.userChangedLineDisam(ev.target as HTMLElement);
            })[0] as HTMLTableElement;
        const header = $("<thead>").appendTo(table);
        $("<th>").text("Line Imported").appendTo(header);
        $("<th>").text("Line").appendTo(header);
        $("<th>").text("Assays").appendTo(header);
        const body = $("<tbody>").appendTo(table)[0] as HTMLTableElement;
        uniqueLineNames.forEach((name: string, i: number): void => {
            let disam: LineDisambiguationRow = this.lineObjSets[name];
            if (!disam) {
                disam = new LineDisambiguationRow(body, name, i);
                this.lineObjSets[name] = disam;
            }
            disam.appendTo(body);
            this.currentlyVisibleLineObjSets.push(disam);
        });

        if (uniqueLineNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
            this.addToggleAllButton(parentDiv, "Lines");
            this.addRequiredInputLabel(parentDiv, requiredInputText);
        }
    }

    // If the previous step found Line or Assay names that need resolving, put together a
    // disambiguation section for Assays/Lines.
    // Keep a separate set of correlations between strings and pulldowns for each Protocol,
    // since the same string can match different Assays, and the pulldowns will have different
    // content, in each Protocol. If the previous step didn't find any Line or Assay names
    // that need resolving, reveal the pulldowns for selecting a master Line/Assay, leaving
    // the table empty, and return.
    remakeAssaySection(): void {
        // gather up inputs from this and previous steps
        const uniqueAssayNames = this.identifyStructuresStep.uniqueAssayNames;

        // remove stale data from previous run of this step
        this.currentlyVisibleAssayObjSets.forEach(
            (disam: AssayDisambiguationRow): void => {
                disam.detach();
            },
        );
        this.currentlyVisibleAssayObjSets = [];
        this.assayObjSets = {};

        // end early if there's nothing to display in this section
        if (
            !this.identifyStructuresStep.requiredInputsProvided() ||
            this.identifyStructuresStep.parsedSets.length === 0
        ) {
            return;
        }

        const showMasterAssays = uniqueAssayNames.length === 0;
        $("#masterAssayLineDiv").toggleClass("off", !showMasterAssays);
        TypeDisambiguationStep.requireInput($("#masterAssay"), showMasterAssays);
        if (showMasterAssays) {
            return;
        }

        const parentDivMatched = $("#matchedAssaysSection");
        const childDivMatched = $("#matchedAssaysSectionBody");

        const requiredInputText =
            "At least one valid assay / line combination is required.";
        this.addRequiredInputLabel(childDivMatched, requiredInputText);

        if (uniqueAssayNames.length > this.TOGGLE_ALL_THREASHOLD) {
            this.addToggleAllButton(childDivMatched, "Assays");
        }

        ///////////////////////////////////////////////////////////////////////////////////////
        // Create the table
        ///////////////////////////////////////////////////////////////////////////////////////

        // if there's already a table, remove it
        $("#matchedAssaysTable").remove();
        // remove rows of disambiguation table
        $("#disambiguateAssaysTable tbody").find("tr").remove();

        const tableMatched = $("<table>")
            .attr({ "id": "matchedAssaysTable", "cellspacing": 0 })
            .appendTo(childDivMatched)
            .on("change", "select", (ev: JQueryInputEventObject): void => {
                this.userChangedAssayDisam(ev.target as HTMLElement);
            })[0] as HTMLTableElement;
        parentDivMatched.removeClass("off");
        const thead = $("<thead>");
        const tr = $("<tr>");
        $(tableMatched).append(thead);
        $(thead).append(tr);
        $(tr).append("<th></th>");
        $(tr).append("<th>User Input</th>");
        $(tr).append("<th>Line Name</th>");
        $(tr).append("<th>Assay Name</th>");

        const tableBodyMatched = $("<tbody>").appendTo(
            tableMatched,
        )[0] as HTMLTableElement;

        ///////////////////////////////////////////////////////////////////////////////////////
        // Create a table row for each unique assay name
        ///////////////////////////////////////////////////////////////////////////////////////

        uniqueAssayNames.forEach((assayName: string, i: number): void => {
            let disam: AssayDisambiguationRow;
            disam = this.assayObjSets[assayName];
            if (!disam) {
                disam = new AssayDisambiguationRow(tableBodyMatched, assayName, i);
                this.assayObjSets[assayName] = disam;
            }
            if (disam.selectAssayJQElement) {
                disam.selectAssayJQElement.data({ "visibleIndex": i });
                this.currentlyVisibleAssayObjSets.push(disam);
            }
        });

        if (uniqueAssayNames.length - 1) {
            const matched: number = $("#matchedAssaysSectionBody tr").length - 1;
            const matchedLines: number =
                $("#matchedAssaysSectionBody tr option:selected")
                    .text()
                    .split("Create New Assay").length - 1;
            const matchedAssays: number = matched - matchedLines;
            if (matched === 0) {
                $("#matchedAssaysSection").hide();
            } else {
                $("#matchedAssaysSection").show();
                if (matchedLines === 0) {
                    $("#matchedAssaysSection")
                        .find(".discloseLink")
                        .text(" Matched " + matchedAssays + " Assays");
                } else if (matchedAssays === 0) {
                    $("#matchedAssaysSection")
                        .find(".discloseLink")
                        .text(" Matched " + matchedLines + " Lines");
                } else {
                    $("#matchedAssaysSection")
                        .find(".discloseLink")
                        .text(
                            " Matched " +
                                matchedLines +
                                " Lines and " +
                                matchedAssays +
                                " Assays",
                        );
                }
            }
        }
    }

    addRequiredInputLabel(parentDiv: JQuery, text: string): JQuery {
        const adding = [
            TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS,
            "off",
            "missingSingleFormInput",
        ];
        return $("<div>").text(text).addClass(adding.join(" ")).appendTo(parentDiv);
    }

    remakeMeasurementSection(): void {
        const mode = this.selectMajorKindStep.interpretationMode;
        const uniqueMeasurementNames =
            this.identifyStructuresStep.uniqueMeasurementNames;
        const seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;

        const hasRequiredInitialInput =
            this.identifyStructuresStep.requiredInputsProvided();

        const parentDiv = $("#disambiguateMeasurementsSection");

        parentDiv.addClass("off");
        $("#masterMTypeDiv, #masterCompDiv, #masterUnitDiv").addClass("off");

        const bodyJq = $("#disambiguateMeasurementsTable tbody");
        bodyJq.children().detach();

        this.currentlyVisibleMeasurementObjSets.forEach((disam: any): void => {
            disam.rowElementJQ.detach();
        });

        // If in 'Transcription' or 'Proteomics' mode, there are no measurement types needing
        // explicit disambiguation. Skip the measurement section, and provide statistics about
        // the gathered records.
        if (mode === "tr" || mode === "pr" || mode === "skyline") {
            // do need to provide units
            if (hasRequiredInitialInput) {
                $("#masterUnitDiv").removeClass("off");
                TypeDisambiguationStep.requireInput($("#masterUnitsValue"), true);
            }
            return;
        }

        // If using the implicit IDs for measurements, need to specify units
        const needUnits: boolean =
            this.identifyStructuresStep.uniquePubchem.length > 0 ||
            this.identifyStructuresStep.uniqueUniprot.length > 0 ||
            this.identifyStructuresStep.uniqueGenbank.length > 0;
        // If using pubchem IDs, need to specify compartment
        const needComp: boolean = this.identifyStructuresStep.uniquePubchem.length > 0;
        const showMasterType =
            seenAnyTimestamps && !needUnits && uniqueMeasurementNames.length === 0;
        if (hasRequiredInitialInput) {
            $("#masterUnitDiv").toggleClass("off", !needUnits);
            TypeDisambiguationStep.requireInput($("#masterUnitsValue"), needUnits);
            $("#masterCompDiv").toggleClass("off", !needComp);
            TypeDisambiguationStep.requireInput($("#masterCompValue"), needComp);
            $("#masterMTypeDiv").toggleClass("off", !showMasterType);
            TypeDisambiguationStep.requireInput($("#masterMCompValue"), showMasterType);
            TypeDisambiguationStep.requireInput($("#masterMTypeValue"), showMasterType);
            TypeDisambiguationStep.requireInput(
                $("#masterMUnitsValue"),
                showMasterType,
            );
            // skip initializing everything else if master values are shown
            if (showMasterType || needUnits || needComp) {
                return;
            }
        }

        if (uniqueMeasurementNames.length > this.TOGGLE_ALL_THREASHOLD) {
            this.makeToggleAllButton("Measurement Types").insertBefore(
                $("#disambiguateMeasurementsTable"),
            );
        }

        // put together a disambiguation section for measurement types
        const body = bodyJq[0] as HTMLTableElement;
        this.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
        uniqueMeasurementNames.forEach((name: string, i: number): void => {
            let disam: MeasurementDisambiguationRow;
            disam = this.measurementObjSets[name];
            if (disam && disam.rowElementJQ) {
                disam.appendTo(body);
            } else {
                disam = new MeasurementDisambiguationRow(body, name, i);
                this.measurementObjSets[name] = disam;
            }

            // If we're in MDV mode, the units pulldowns are irrelevant. Toggling
            // the hidden unit input controls whether it's treated as required.
            const isMdv = mode === "mdv";
            disam.unitsAuto.visibleInput.toggleClass("off", isMdv);
            disam.unitsAuto.hiddenInput.toggleClass("off", isMdv);

            // Set required inputs as required
            TypeDisambiguationStep.requireInput(disam.compAuto.hiddenInput, true);
            TypeDisambiguationStep.requireInput(disam.typeAuto.hiddenInput, true);
            TypeDisambiguationStep.requireInput(disam.unitsAuto.hiddenInput, !isMdv);

            this.currentlyVisibleMeasurementObjSets.push(disam);
        });

        if (uniqueMeasurementNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
            this.addToggleAllButton(parentDiv, "Measurement Types");
        }

        this.checkAllMeasurementCompartmentDisam();
        const hideMeasurements =
            uniqueMeasurementNames.length === 0 || !hasRequiredInitialInput;
        $("#disambiguateMeasurementsSection").toggleClass("off", hideMeasurements);
    }

    remakeMetadataSection(): void {
        const uniqueMetadataNames = this.identifyStructuresStep.uniqueMetadataNames;
        if (uniqueMetadataNames.length < 1) {
            return;
        }
        $("#disambiguateMetadataTable").remove();
        const parentDiv = $("#disambiguateMetadataSection");
        if (uniqueMetadataNames.length > this.TOGGLE_ALL_THREASHOLD) {
            this.addToggleAllButton(parentDiv, "Metadata Types");
        }
        // put together a disambiguation section for metadata
        const table = $("<table>")
            .attr({ "id": "disambiguateMetadataTable", "cellspacing": 0 })
            .appendTo($("#disambiguateMetadataSection").removeClass("off"))
            .on("change", "input", (ev: JQueryInputEventObject): void => {
                // should there be event handling here ?
            })[0] as HTMLTableElement;
        const body = $("<tbody>").appendTo(table)[0] as HTMLTableElement;
        uniqueMetadataNames.forEach((name: string, i: number): void => {
            let disam: MetadataDisambiguationRow = this.metadataObjSets[name];
            if (disam && disam.rowElementJQ) {
                disam.appendTo(body);
            } else {
                disam = new MetadataDisambiguationRow(body, name, i);
                this.metadataObjSets[name] = disam;
            }
            disam.metaAuto.visibleInput
                .attr("name", "disamMeta" + i)
                .addClass("autocomp_altype");
            disam.metaAuto.hiddenInput.attr("name", "disamMetaHidden" + i);
        });
        if (uniqueMetadataNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
            this.addToggleAllButton(parentDiv, "Metadata Types");
        }
    }

    // We call this when any of the 'master' pulldowns are changed in Step 4.
    // Such changes may affect the available contents of some of the pulldowns in the step.
    changedAnyMasterPulldown(): void {
        // Show the master line dropdown if the master assay dropdown is set to new
        const assay = $("#masterAssay").val() as string;
        $("#masterLineSpan").toggleClass("off", assay !== "named_or_new");
        this.queueReconfigure();
    }

    // If the pulldown is being set to 'new', walk down the remaining pulldowns in the section,
    // in order, setting them to 'new' as well, stopping just before any pulldown marked as
    // being 'set by the user'.
    userChangedLineDisam(lineEl: HTMLElement): boolean {
        const changed: JQuery = $(lineEl).data("setByUser", true);
        const lineId = changed.val() as string;
        if (lineId !== "new") {
            // stop here for anything other than 'new'; only 'new' cascades to
            // following pulldowns
            return false;
        }
        const v: number = changed.data("visibleIndex") || 0;
        this.currentlyVisibleLineObjSets.slice(v).forEach((obj: any): void => {
            const textInput: JQuery = obj.lineAuto.visibleInput;
            if (textInput.data("setByUser")) {
                return;
            }
            // set dropdown to 'new' and reveal the line autoselect
            textInput.val("new").next().removeClass("off");
        });
        return false;
    }

    // This function serves two purposes.
    // 1. If the given Assay disambiguation pulldown is being set to 'new', reveal the
    //    adjacent Line pulldown, otherwise hide it.
    // 2. If the pulldown is being set to 'new', walk down the remaining pulldowns in the
    //    section, in order, setting them to 'new' as well, stopping just before any pulldown
    //    marked as being 'set by the user'.
    userChangedAssayDisam(assayEl: HTMLElement): boolean {
        const changed = $(assayEl).data("setByUser", true);
        // The span with the corresponding Line pulldown is always right next to the
        // Assay pulldown
        const assayId = changed.val() as string;
        changed.next().toggleClass("off", assayId !== "named_or_new");
        if (assayId !== "named_or_new") {
            // stop here for anything other than 'new'; only 'new' cascades to
            // following pulldowns
            return false;
        }
        const v = changed.data("visibleIndex") || 0;
        this.currentlyVisibleAssayObjSets.slice(v).forEach((obj: any): void => {
            const assaySelect: JQuery = obj.selectAssayJQElement;
            if (assaySelect.data("setByUser")) {
                return;
            }
            // set assay dropdown to 'new' and reveal the line autocomplete
            assaySelect.val("named_or_new").next().removeClass("off");
        });
        return false;
    }

    userChangedMeasurementDisam(element: HTMLElement): void {
        const hiddenInput = $(element);
        // If this is missing we might as well throw an error
        const auto = hiddenInput.data("edd").autocompleteobj;
        const textInput = auto.visibleInput;
        const type = auto.modelName;
        if (type === "MeasurementCompartment" || type === "MeasurementUnit") {
            const rowIndex: number =
                textInput.data("setByUser", true).data("visibleIndex") || 0;
            if (rowIndex < this.currentlyVisibleMeasurementObjSets.length - 1) {
                const nextSets = this.currentlyVisibleMeasurementObjSets.slice(
                    rowIndex + 1,
                );
                nextSets.some((obj: any): boolean => {
                    const following: any = $(obj[type]);
                    if (following.length === 0 || following.data("setByUser")) {
                        return true; // break; for the Array.some() loop
                    }
                    // using placeholder instead of val to avoid triggering autocomplete change
                    following.attr("placeholder", textInput.val());
                    following.next().val(hiddenInput.val());
                    return false;
                });
            }
        }
        // not checking typeAuto; form submit sends selected types
        this.checkAllMeasurementCompartmentDisam();
    }

    // Run through the list of currently visible measurement disambiguation form elements,
    // checking to see if any of the 'compartment' elements are set to a non-blank value.
    // If any are, and we're in MDV document mode, display a warning that the user should
    // specify compartments for all their measurements.
    checkAllMeasurementCompartmentDisam(): void {
        const mode: string = this.selectMajorKindStep.interpretationMode;

        const allSet: boolean = this.currentlyVisibleMeasurementObjSets.every(
            (obj: any): boolean => {
                const compAuto: EDDAuto.MeasurementCompartment = obj.compAuto;
                const label = compAuto.visibleInput.val() as string;
                const id = compAuto.val() as string;
                if (
                    compAuto.visibleInput.data("setByUser") ||
                    (!!label && id !== "0")
                ) {
                    return true;
                }
                return false;
            },
        );
        $("#noCompartmentWarning").toggleClass("off", mode !== "mdv" || allSet);
    }

    /**
     * Reviews parsed data from Step 3 and applies decisions made in Step 4 to create the final
     * dataset for submission to the server. Note that some data may be omitted from submission
     * if the user has chosen to omit them (e.g. because of an undefined metadata type that
     * isn't required).
     * @returns {ResolvedImportSet[]}
     */
    createSetsForSubmission(): ResolvedImportSet[] {
        let droppedDatasetsForMissingTime: number;

        // From this Step
        const masterAssay: string = $("#masterAssay").val() as string;
        const masterAssayLine: string = $("#masterAssayLine").val() as string;
        const masterComp: string = $("#masterCompValue").val() as string;
        const masterLine: string = $("#masterLine").val() as string;
        const masterMComp: string = $("#masterMCompValue").val() as string;
        const masterMType: string = $("#masterMTypeValue").val() as string;
        const masterMUnits: string = $("#masterMUnitsValue").val() as string;
        const masterTime: number = parseFloat($("#masterTimestamp").val() as string);
        const masterUnits: string = $("#masterUnitsValue").val() as string;
        this.errorMessages = [];
        this.warningMessages = [];

        // From Step 1
        const mode = this.selectMajorKindStep.interpretationMode;
        // Cast 0 to null
        const masterProtocol = this.selectMajorKindStep.masterProtocol || null;

        // From Step 3
        const seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
        const parsedSets = this.identifyStructuresStep.parsedSets;

        const resolvedSets: ResolvedImportSet[] = [];
        droppedDatasetsForMissingTime = 0;

        parsedSets.forEach((set: RawImportSet, setIndex: number): void => {
            let assay_id: number | string;
            let compartmentId: string;
            let lineId: number | string;
            let measurementTypeId: string;
            let unitsId: string;
            let resolvedData: XYPair[];
            let metaDataPresent: boolean;

            lineId = "new"; // A convenient default
            assay_id = "named_or_new";

            // In modes where we resolve measurement types in the client UI, go with the
            // master values by default.
            measurementTypeId = null;
            compartmentId = null;
            unitsId = null;
            if (mode === "tr" || mode === "pr" || mode === "skyline") {
                unitsId = masterUnits;
            } else if (
                this.identifyStructuresStep.uniquePubchem.length > 0 ||
                this.identifyStructuresStep.uniqueUniprot.length > 0 ||
                this.identifyStructuresStep.uniqueGenbank.length > 0
            ) {
                unitsId = masterUnits;
                if (this.identifyStructuresStep.uniquePubchem.length > 0) {
                    compartmentId = masterComp;
                }
            } else if (
                this.identifyStructuresStep.uniqueMeasurementNames.length === 0
            ) {
                measurementTypeId = masterMType;
                compartmentId = masterMComp;
                unitsId = masterMUnits;
            }

            metaDataPresent = false;

            if (mode === "biolector") {
                lineId = masterLine;
                // Tells the server to attempt to resolve directly against the name, or make
                // a new Assay
                assay_id = "named_or_new";
                // If we have a valid, specific Line name, look for a disambiguation field
                // that matches it.
                if (set.line_name !== null) {
                    const lineDisam = this.lineObjSets[set.line_name];
                    if (lineDisam) {
                        const lineIdInput = lineDisam.lineAuto.hiddenInput;
                        // if we've disabled import for the associated line, skip adding this
                        // measurement to the list
                        if (lineIdInput.prop("disabled")) {
                            return; // continue to the next loop iteration parsedSets.forEach
                        }
                        lineId = lineIdInput.val() as string;
                    }
                }
            } else {
                lineId = masterAssayLine;
                assay_id = masterAssay;
                if (set.assay_name !== null && masterProtocol) {
                    const assayDisam = this.assayObjSets[set.assay_name];
                    if (assayDisam) {
                        const assaySelect = assayDisam.selectAssayJQElement;
                        // if there is no assaySeelct, skip.
                        if (!assaySelect) {
                            return;
                        }
                        // if we've disabled import for this assay, skip adding this
                        // measurement to the list
                        if (assaySelect.is(":disabled")) {
                            return; // continue to the next loop iteration parsedSets.forEach
                        }
                        assay_id = assaySelect.val() as string;
                        const lineIdInput = assayDisam.lineAuto.hiddenInput;
                        lineId = lineIdInput.val() as string;
                    }
                }
            }

            // Same for measurement name, but resolve all three measurement fields if we find
            // a match, and only if we are resolving measurement types client-side.
            const measDisam = this.measurementObjSets[set.measurement_name];
            if (measDisam) {
                measurementTypeId = measDisam.typeAuto.val();
                compartmentId = measDisam.compAuto.val() || "0";
                unitsId = measDisam.unitsAuto.val() || "1";
                // If we've disabled import for measurements of this type, skip adding
                // this measurement to the list
                if (measDisam.typeAuto.hiddenInput.is(":disabled")) {
                    return; // continue to the next loop iteration parsedSets.forEach
                }
            }

            // Any metadata disambiguation fields that are left unresolved, will have their
            // metadata dropped from the import in this step, because this loop is building
            // key-value pairs where the key is the chosen database id of the metadata type.
            // No id == not added.
            const metaDataById: { [id: string]: string } = {};
            const metaDataByName: { [name: string]: string } = {};
            Object.keys(set.metadata_by_name).forEach((name): void => {
                const metaDisam = this.metadataObjSets[name];
                if (metaDisam) {
                    const metaId = metaDisam.metaAuto.val();
                    if (metaId && !metaDisam.metaAuto.hiddenInput.is(":disabled")) {
                        metaDataById[metaId] = set.metadata_by_name[name];
                        metaDataByName[name] = set.metadata_by_name[name];
                        metaDataPresent = true;
                    }
                }
            });

            resolvedData = set.data; // Ideally we would clone this.
            // If we haven't seen any timestamps during data accumulation, it means we need
            // the user to pick a master timestamp.  In that situation, any given set will
            // have at most one data point in it, with the timestamp in the data point set to
            // 'null'.  Here we resolve it to a valid timestamp. If there is no master
            // timestamp selected, we drop the data point, but make the set anyway since it
            // might carry metadata.
            if (!seenAnyTimestamps && resolvedData[0]) {
                if (!isNaN(masterTime)) {
                    resolvedData[0][0] = masterTime;
                } else {
                    resolvedData = [];
                    droppedDatasetsForMissingTime++;
                }
            }

            // If we have no data, and no metadata that survived resolving, don't make the set.
            // (return continues to the next loop iteration)
            if (resolvedData.length < 1 && !metaDataPresent) {
                return;
            }

            const resolvedSet: ResolvedImportSet = {
                // Copy across the fields from the RawImportSet record
                "kind": set.kind,
                "hint": set.hint,
                "line_name": set.line_name,
                "assay_name": set.assay_name,
                "measurement_name": set.measurement_name,
                "metadata_by_name": metaDataByName,
                "data": resolvedData,
                // Add new disambiguation-specific fields
                "protocol_id": masterProtocol,
                "line_id": lineId,
                "assay_id": assay_id,
                "measurement_id": measurementTypeId,
                "compartment_id": compartmentId,
                "units_id": unitsId,
                "metadata_by_id": metaDataById,
            };
            resolvedSets.push(resolvedSet);
        });

        // log some debugging output if any data get dropped because of a missing timestamp
        if (droppedDatasetsForMissingTime) {
            if (parsedSets.length === droppedDatasetsForMissingTime) {
                $("#masterTimestampRequiredPrompt").removeClass("off");
            } else {
                const percentDropped =
                    (droppedDatasetsForMissingTime / parsedSets.length) * 100;
                const warningMessage =
                    droppedDatasetsForMissingTime +
                    " parsed datasets (" +
                    percentDropped +
                    "%) were dropped because they were missing a timestamp.";
                this.warningMessages.push(new ImportMessage(warningMessage));
            }
        } else {
            $("#masterTimestampRequiredPrompt").addClass("off");
        }
        return resolvedSets;
    }

    getUserWarnings(): ImportMessage[] {
        return this.warningMessages;
    }

    getUserErrors(): ImportMessage[] {
        return this.errorMessages;
    }

    requiredInputsProvided(): boolean {
        // check all required/enabled inputs have a valid value
        const requiredClass = "." + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS;
        // required inputs have the required class and are not disabled
        const allRequiredInputs = $(requiredClass).not(":disabled");
        // cannot filter on value attributes because SELECT element value is on child options
        let missing = false;
        allRequiredInputs.each((i, input) => {
            missing = $(input).val() === "";
            if (missing) {
                return false;
            } // break
        });
        return allRequiredInputs.length > 0 && !missing;
    }
}

class DisambiguationRow {
    row: HTMLTableRowElement;
    rowElementJQ: JQuery;
    ignoreCheckbox: JQuery;
    visibleIndex: number;

    constructor(body: HTMLTableElement, name, i) {
        this.visibleIndex = i;
        // First make a table row, and save a reference to it
        this.row = body.insertRow();
        this.rowElementJQ = $(this.row);
        this.addIgnoreCheckbox();

        // Next, add a table cell with the string we are disambiguating
        $("<div>").text(name).appendTo(this.row.insertCell());

        this.build(body, name, i);
    }

    // Empty base implementation for children to override
    build(body: HTMLTableElement, name, i) {
        return;
    }

    detach() {
        this.rowElementJQ.detach();
    }

    appendTo(body: HTMLTableElement) {
        this.rowElementJQ.appendTo(body);
    }

    addIgnoreCheckbox() {
        // ignore checkbox. allows import for buttoned up file formats (e.g. biolector,
        // HPLC) to selectively ignore parts of the input file that aren't necessary
        this.ignoreCheckbox = $('<input type="checkbox">')
            .prop("checked", true)
            .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
            .addClass(TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX)
            .appendTo(this.row.insertCell())
            .on("change", this.userChangedRowEnabled.bind(this));
    }

    userChangedRowEnabled(): void {
        DisambiguationRow.toggleTableRowEnabled(this.ignoreCheckbox);
        typeDisambiguationStep.queueReparseThisStep();
    }

    // get paired hidden / visible autocomplete inputs in the same table row as the checkbox
    // and enable/disable/require them as appropriate
    static toggleTableRowEnabled(checkbox: JQuery) {
        const enabled = checkbox.is(":checked");

        // iterate over cells in the row
        checkbox
            .parent()
            .nextAll()
            .each((index: number, elt: HTMLElement): void => {
                const tableCell: JQuery = $(elt);
                tableCell.toggleClass("disabledTextLabel", !enabled);
                // manage text input(s)
                // clear / disable the visible input so it doesn't get submitted with the form
                tableCell.find(":input").prop("disabled", !enabled);
                // manage hidden input(s)
                TypeDisambiguationStep.requireInput(tableCell.find(":hidden"), enabled);
                // manage dropdowns
                TypeDisambiguationStep.requireInput(tableCell.find("select"), enabled);
            });
    }
}

class MetadataDisambiguationRow extends DisambiguationRow {
    metaAuto: EDDAuto.AssayLineMetadataType;

    // Cache for re-use of autocomplete objects
    static autoCache: any = {};

    build(body: HTMLTableElement, name, i) {
        this.metaAuto = new EDDAuto.AssayLineMetadataType({
            "container": $(this.row.insertCell()),
            "visibleValue": name,
            "cache": MetadataDisambiguationRow.autoCache,
        });
        this.metaAuto.init();
        this.metaAuto.visibleInput
            .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
            .attr("name", "disamMeta" + i)
            .addClass("autocomp_altype");
        this.metaAuto.hiddenInput
            .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
            .attr("name", "disamMetaHidden" + i);
    }
}

class MeasurementDisambiguationRow extends DisambiguationRow {
    compAuto: EDDAuto.MeasurementCompartment;
    typeAuto: EDDAuto.GenericOrMetabolite;
    unitsAuto: EDDAuto.MeasurementUnit;

    // Caches for re-use of autocomplete fields
    static compAutoCache: any = {};
    static metaboliteAutoCache: any = {};
    static unitAutoCache: any = {};

    build(body: HTMLTableElement, name, i) {
        this.compAuto = new EDDAuto.MeasurementCompartment({
            "container": $(this.row.insertCell()),
            "cache": MeasurementDisambiguationRow.compAutoCache,
        });
        this.compAuto.init();
        this.compAuto.visibleInput.addClass("autocomp_compartment");
        this.typeAuto = new EDDAuto.GenericOrMetabolite({
            "container": $(this.row.insertCell()),
            "cache": MeasurementDisambiguationRow.metaboliteAutoCache,
        });
        this.typeAuto.init();
        this.unitsAuto = new EDDAuto.MeasurementUnit({
            "container": $(this.row.insertCell()),
            "cache": MeasurementDisambiguationRow.unitAutoCache,
        });
        this.unitsAuto.init();
        this.unitsAuto.visibleInput.addClass("autocomp_unit");

        // create autocompletes
        [this.compAuto, this.typeAuto, this.unitsAuto].forEach(
            (auto: EDDAuto.BaseAuto): void => {
                auto.container.addClass("disamDataCell");
                auto.visibleInput.addClass(
                    TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS,
                );
                auto.hiddenInput.addClass(
                    TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS,
                );
            },
        );

        $(this.row).on(
            "change",
            "input[type=hidden]",
            (ev: JQueryInputEventObject): void => {
                // only watch for changes on the hidden portion, let autocomplete work
                typeDisambiguationStep.userChangedMeasurementDisam(
                    ev.target as HTMLElement,
                );
            },
        );
        EDDAuto.BaseAuto.initial_search(this.typeAuto, name);
    }
}

class LineDisambiguationRow extends DisambiguationRow {
    lineAuto: EDDAuto.StudyLine;

    build(body: HTMLTableElement, name, i) {
        const cell = $(this.row.insertCell()).css("text-align", "left");
        const defaultSel = LineDisambiguationRow.disambiguateAnAssayOrLine(name, i);
        this.appendLineAutoselect(cell, defaultSel);
        this.lineAuto.visibleInput.data("visibleIndex", i);
    }

    appendLineAutoselect(parentElement: JQuery, defaultSelection): void {
        // create a text input to gather user input
        const lineInputId: string = "disamLineInput" + this.visibleIndex;
        const autoOptions: EDDAuto.AutocompleteOptions = {
            "container": parentElement,
            "hiddenValue": defaultSelection.lineID,
            "emptyCreatesNew": true,
            "nonEmptyRequired": false,
        };
        // passes extra "active" parameter to line search
        this.lineAuto = new EDDAuto.StudyLine(autoOptions, {
            "active": "true",
            "study": "" + window.EDDData.currentStudyID,
        });
        this.lineAuto.init();

        // if there is a line name, auto fill line.
        $(this.lineAuto.container[0]).children(".autocomp").val(defaultSelection.name);

        this.lineAuto.visibleInput
            .data("setByUser", false)
            .attr("id", lineInputId)
            .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);

        // create a hidden form field to store the selected value
        this.lineAuto.hiddenInput
            .attr("id", "disamLine" + this.visibleIndex)
            .attr("name", "disamLine" + this.visibleIndex);
        TypeDisambiguationStep.requireInput(this.lineAuto.hiddenInput, true);
    }

    static disambiguateAnAssayOrLine(assayOrLine: string, currentIndex: number): any {
        const selections: any = {
            "lineID": "new",
            "assayID": "named_or_new",
            "match": false,
        };
        // ATData.existingAssays is type {[index: string]: number[]}
        const protocol: number = selectMajorKindStep.masterProtocol;
        const assays: number[] = window.ATData.existingAssays[protocol] || [];
        assays.every((id: number): boolean => {
            const assay: AssayRecord = window.EDDData.Assays[id];
            if (assayOrLine.toLowerCase() === assay.name.toLowerCase()) {
                // The full Assay name, even case-insensitive, is the best match
                selections.assayID = id;
                return false; // do not need to continue
            }
            return true;
        });
        // Now we repeat the practice, separately, for the Line pulldown.
        // ATData.existingLines is type {id: number; name: string;}[]
        (window.ATData.existingLines || []).every((line: any): boolean => {
            if (assayOrLine.toLowerCase() === line.name.toLowerCase()) {
                // The Line name, case-insensitive, is the best match
                selections.lineID = line.id;
                selections.name = line.name;
                return false; // do not need to continue
            }
            return true;
        });
        return selections;
    }
}

class AssayDisambiguationRow extends LineDisambiguationRow {
    selectAssayJQElement: JQuery;

    build(body: HTMLTableElement, name, i) {
        const defaultSel: any = LineDisambiguationRow.disambiguateAnAssayOrLine(
            name,
            i,
        );
        let cell: JQuery;
        let aSelect: JQuery;

        /////////////////////////////////////////////////////////////////////////////
        // Set up an autocomplete for the line (autocomplete is important for
        // efficiency for studies with many lines). Also add rows to disambiguated section
        /////////////////////////////////////////////////////////////////////////////
        if (!defaultSel.name) {
            const parentDiv = $("#disambiguateAssaysSection");
            const table = $("#disambiguateAssaysSection table");
            $(parentDiv).removeClass("off");
            $(this.row).find("input[type=checkbox]").prop("checked", false);
            $(table).append(this.row);
        } else {
            /////////////////////////////////////////////////////////////////////////////
            // Set up a combo box for selecting the assay
            /////////////////////////////////////////////////////////////////////////////
            cell = $(this.row.insertCell()).css("text-align", "left");

            // a table column to contain the text label for the Line pulldown, and the
            // pulldown itself
            this.appendLineAutoselect(cell, defaultSel);
            // create another column
            const td = $(this.row.insertCell()).css("text-align", "left");
            aSelect = $("<select>")
                .appendTo(td)
                .data({ "setByUser": false })
                .attr("name", "disamAssay" + i)
                .attr("id", "disamAssay" + i)
                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
            TypeDisambiguationStep.requireInput(aSelect, true);
            this.selectAssayJQElement = aSelect;
            $("<option>")
                .text("(Create New Assay)")
                .appendTo(aSelect)
                .val("named_or_new")
                .prop("selected", !defaultSel.assayID);

            // add options to the assay combo box
            const protocol: number = selectMajorKindStep.masterProtocol;
            (window.ATData.existingAssays[protocol] || []).forEach((id: any): void => {
                const assay: AssayRecord = window.EDDData.Assays[id];
                if (assay.id === defaultSel.assayID && defaultSel.lineID !== "new") {
                    $("<option>")
                        .text(assay.name)
                        .appendTo(aSelect)
                        .val(defaultSel.assayID.toString())
                        .prop("selected", defaultSel.assayID === defaultSel.assayID);
                }
            });
        }
    }
}

// The class responsible for everything in the "Step 4" box that you see on the data import
// page. Aggregates & displays a user-relevant/actionable summary of the import process prior
// to final submission.
class ReviewStep {
    step1: SelectMajorKindStep;
    step2: RawInputStep;
    step3: IdentifyStructuresStep;
    step4: TypeDisambiguationStep;
    prevSteps: ImportStep[];

    beginSubmitTimerId: number;
    submitPageTimerId: number;
    nextStepCallback: () => void;

    warningMessages: ImportMessage[][];
    warningInputs: JQuery[][];

    errorMessages: ImportMessage[][];

    constructor(
        step1: SelectMajorKindStep,
        step2: RawInputStep,
        step3: IdentifyStructuresStep,
        step4: TypeDisambiguationStep,
        nextStepCallback: () => void,
    ) {
        this.step1 = step1;
        this.step2 = step2;
        this.step3 = step3;
        this.step4 = step4;
        this.prevSteps = [step1, step2, step3, step4];
        this.nextStepCallback = nextStepCallback;

        this.errorMessages = [];
        this.warningMessages = [];
        this.warningInputs = [];
        this.prevSteps.forEach((step: ImportStep, stepIndex: number): void => {
            this.warningInputs[stepIndex] = [];
        });

        $("#retry-button").on("click", () => {
            this.retryImport();
            return false; // prevent following link to #
        });
    }

    previousStepChanged(): void {
        // re-query each preceding step to get any errorMessages or warningMessages that
        // should be displayed to the user
        this.prevSteps.forEach((prevStep, stepIndex: number): void => {
            this.warningMessages[stepIndex] = [].concat(prevStep.getUserWarnings());
            this.errorMessages[stepIndex] = [].concat(prevStep.getUserErrors());
            this.warningInputs[stepIndex] = [];
        });

        // build up a short summary section to describe the (potentially large) number of
        // errors / warnings, as well as to give some generally helpful summary (e.g. counts).
        // for starters, we'll only show the summary section with a minimal one-sentence
        // that has directions, though clearly more stuff could be helpful later.
        const totalErrorsCount = this.getMessageCount(this.errorMessages);
        const totalWarningsCount = this.getMessageCount(this.warningMessages);
        const totalMessagesCount = totalErrorsCount + totalWarningsCount;

        const hasRequiredInitialInputs = this.arePrevStepRequiredInputsProvided();
        const showComplete = hasRequiredInitialInputs && totalMessagesCount === 0;

        $("#reviewSummaryNoWarnings").toggleClass("off", !showComplete);
        $("#completeAllStepsFirstLabel").toggleClass("off", hasRequiredInitialInputs);
        $("#submit-div").toggleClass("off", !hasRequiredInitialInputs);

        // remake error / warning subsections based on input from previous steps
        const errorsWrapperDiv = $("#reviewErrorsSection");
        const errorsDiv = $("#reviewErrorsContentDiv");
        this.remakeErrorOrWarningSection(
            errorsWrapperDiv,
            errorsDiv,
            this.errorMessages,
            totalErrorsCount,
            "errorMessage",
            [],
            false,
        );

        const warningsWrapperDiv = $("#reviewWarningsSection");
        const warningsDiv = $("#reviewWarningsContentDiv");
        this.remakeErrorOrWarningSection(
            warningsWrapperDiv,
            warningsDiv,
            this.warningMessages,
            totalWarningsCount,
            "warningMessage",
            this.warningInputs,
            true,
        );

        this.updateSubmitEnabled();
    }

    arePrevStepRequiredInputsProvided(): boolean {
        return this.prevSteps.every((step) => step.requiredInputsProvided());
    }

    // enable / disable the submit button, depending on whether submission is expected
    // to succeed based on data available in the UI
    updateSubmitEnabled(): void {
        const allPrevStepInputsProvided = this.arePrevStepRequiredInputsProvided();
        const allWarningsAcknowledged = this.areAllWarningsAcknowledged();
        const totalErrorsCount = this.getMessageCount(this.errorMessages);

        const submitButton = $("#submit-btn");

        const disableSubmit = !(
            allPrevStepInputsProvided &&
            totalErrorsCount === 0 &&
            allWarningsAcknowledged
        );
        submitButton.prop("disabled", disableSubmit);
    }

    areAllWarningsAcknowledged(): boolean {
        return this.warningInputs.every((warningInput) =>
            warningInput.every((checkbox) => checkbox.prop("checked")),
        );
    }

    getMessageCount(messagesByStep: ImportMessage[][]): number {
        return messagesByStep
            .map((messages) => messages.length)
            .reduce((a, b) => a + b);
    }

    remakeErrorOrWarningSection(
        wrapperDivSelector: JQuery,
        contentDivSelector: JQuery,
        userMessages: ImportMessage[][],
        messageCount: number,
        messageCssClass: string,
        inputs: JQuery[][],
        createCheckboxes: boolean,
    ): void {
        let header;
        contentDivSelector.empty();
        const hasRequiredInitialInputs = this.arePrevStepRequiredInputsProvided();
        const toggleOff = messageCount === 0 || !hasRequiredInitialInputs;
        wrapperDivSelector.toggleClass("off", toggleOff);

        // remove all the inputs from the DOM
        contentDivSelector.empty();

        if (!hasRequiredInitialInputs || !messageCount) {
            return;
        }
        // if showing checkboxes to acknowledge messages, add a button to ak all of them after
        // a reasonable number
        const showAcknowledgeAllBtn = createCheckboxes && messageCount >= 5;
        if (showAcknowledgeAllBtn) {
            this.addAcknowledgeAllButton(contentDivSelector);
        }
        const table = $("<table>").appendTo(contentDivSelector);

        // if we will be adding checkboxes to the table, set headers to describe what
        // they are for
        if (createCheckboxes) {
            header = $("<thead>").appendTo(table);
            $("<th>").text("Warning").appendTo(header);
            $("<th>").text("Acknowledge").appendTo(header);
        }
        const tableBody = $("<tbody>").appendTo(table)[0];

        userMessages.forEach(
            (stepMessages: ImportMessage[], stepIndex: number): void => {
                stepMessages.forEach((message: ImportMessage): void => {
                    const row = $("<tr>").appendTo(tableBody);
                    const cell = $("<td>").css("text-align", "left").appendTo(row);
                    const div = $("<div>")
                        .attr("class", messageCssClass)
                        .appendTo(cell);
                    $('<span class="warningStepLabel">')
                        .text("Step " + (stepIndex + 1))
                        .appendTo(div);
                    $("<span>")
                        .text(": " + message.message)
                        .appendTo(div);

                    if (!createCheckboxes) {
                        return;
                    }
                    const cbCell = $("<td>")
                        .css("text-align", "center")
                        .toggleClass("errorMessage", !createCheckboxes)
                        .appendTo(row);
                    const checkbox = $('<input type="checkbox">').appendTo(cbCell);
                    this.warningInputs[stepIndex].push(checkbox);
                    checkbox.on(
                        "click",
                        null,
                        { "div": div, "checkbox": checkbox },
                        (ev: JQueryMouseEventObject) => {
                            this.userSelectedWarningButton(
                                ev.data.div,
                                ev.data.checkbox,
                            );
                        },
                    );
                }, this);
            },
        );

        // if showing an 'Acknowledge All' button, repeat it at the bottom of the list
        if (showAcknowledgeAllBtn) {
            this.addAcknowledgeAllButton(contentDivSelector);
        }
    }

    addAcknowledgeAllButton(contentDivSelector: JQuery): void {
        const button = $('<input type="button">')
            .addClass("acknowledgeAllButton")
            .val("Acknowledge  All")
            .click(this.userSelectedAcknowledgeAllButton.bind(this));
        button.appendTo(contentDivSelector);
    }

    userSelectedWarningButton(div, checkbox): void {
        // make the message text appear disabled (note it's purposefully distinct
        // from the checkbox to allow flexibility in expanding table contents)
        div.toggleClass("disabledTextLabel", checkbox.is(":checked"));

        // update the submit button
        this.updateSubmitEnabled();
    }

    userSelectedAcknowledgeAllButton(): void {
        // check whether all of the boxes are already checked
        let allSelected = true;
        for (const stepCheckboxes of this.warningInputs) {
            for (const checkbox of stepCheckboxes) {
                if (!checkbox.is(":checked")) {
                    allSelected = false;
                    break;
                }
            }
        }
        // check or uncheck all of the boxes (some checked will result in all being checked)
        for (const stepCheckboxes of this.warningInputs) {
            for (const checkbox of stepCheckboxes) {
                checkbox.prop("checked", !allSelected);
            }
        }

        this.updateSubmitEnabled();
    }

    // When the submit button is pushed, fetch the most recent record sets from our
    // IdentifyStructuresStep instance, and construct JSON to send to the server
    startImport(): void {
        $("#submit-btn").prop("disabled", true);

        const progressbar = $("#submit-progress-bar").progressbar({ "value": false });
        $("#submit-div").addClass("off");
        $("#importWaitingDiv, #submit-result").removeClass("off");
        const resolvedSets = this.step4.createSetsForSubmission();
        // make sure to parse string value from #pageSizeLimit to a number
        const pageSizeLimit: number =
            parseInt($("#pageSizeLimit").val() as string, 10) || 1000;
        const pageCount: number = Math.ceil(resolvedSets.length / pageSizeLimit);
        let begin = 0;
        let currentPage = 0;
        const requests: JQueryPromise<any>[] = [];
        progressbar.progressbar({ "max": resolvedSets.length, "value": 0 });
        while (begin < resolvedSets.length) {
            const series = resolvedSets.slice(begin, (begin += pageSizeLimit));
            const payload = {
                "importId": $("#importId").val(),
                "page": ++currentPage,
                "totalPages": pageCount,
                "series": series,
            };
            // include import context parameters in the first page
            if (begin === 0) {
                $.extend(payload, {
                    "writemode": $("input[name=writemode]:checked").val(),
                    "datalayout": $("input[name=datalayout]:checked").val(),
                    "masterMCompValue": $("#masterMCompValue").val(),
                    "masterMTypeValue": $("#masterMTypeValue").val(),
                    "masterMUnitsValue": $("#masterMUnitsValue").val(),
                    "emailWhenComplete": $("#emailChkbx").prop("checked"),
                });
            }
            requests.push(
                $.ajax({
                    "headers": { "Content-Type": "application/json" },
                    "method": "POST",
                    "dataType": "json",
                    "data": JSON.stringify(payload),
                    "processData": false,
                }).done(() => {
                    const current = progressbar.progressbar("option", "value");
                    progressbar.progressbar("option", "value", current + series.length);
                }),
            );
        }
        // await all the POST requests finishing
        $.when
            .apply($, requests)
            .always(() => {
                $("#importWaitingDiv").addClass("off");
            })
            .done(() => {
                $("#importSubmitSuccessDiv").removeClass("off");
            })
            .fail(() => {
                $("#importSubmitErrorDiv").removeClass("off");
            });
    }

    retryImport(): void {
        const progressbar = $("#submit-progress-bar");
        $("#importSubmitErrorDiv").addClass("off");
        $("#importWaitingDiv").removeClass("off");
        progressbar.progressbar("option", "value", false);
        // first attempt to delete any state cached during the previous import attempt.
        $.ajax("", {
            "headers": { "Content-Type": "application/json" },
            "method": "DELETE",
            "data": $("#importId").val() as string,
            "processData": false,
        })
            .done(() => {
                window.setTimeout(() => this.startImport(), 0);
            })
            .fail(() => {
                $("#importSubmitErrorDiv").removeClass("off");
            });
    }
}

$(onWindowLoad);
