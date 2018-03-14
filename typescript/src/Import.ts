import { EDDATDGraphing } from "../modules/AssayTableDataGraphing"
import { Utl } from "../modules/Utl"
import { EDDAuto } from "../modules/EDDAutocomplete"
import { EDDGraphingTools } from "../modules/EDDGraphingTools"
import "bootstrap-loader"
declare var ATData: any; // Setup by the server.

// Doing this bullshit because TypeScript/InternetExplorer do not recognize static methods
// on Number
var JSNumber: any;
JSNumber = Number;
JSNumber.isFinite = JSNumber.isFinite || function (value: any) {
    return typeof value === 'number' && isFinite(value);
};
JSNumber.isNaN = JSNumber.isNaN || function (value: any) {
    return value !== value;
};

// Type name for the grid of values pasted in
interface RawInput extends Array<string[]> { }
// type for the stats generated from parsing input text
interface RawInputStat {
    input: RawInput;
    columns: number;
}

// This module encapsulates all the custom code for the data import page.
// It consists primarily of a series of classes, each corresponding to a step in the import
// process, with a corresponding chunk of UI on the import page.
// Each class pulls data from one or more previous steps, does some internal processing,
// then triggers a callback function, announcing the availability of its own new data.
// The callback function triggers the instance of the next step.
module EDDTableImport {
    'use strict';
    // During initialization we will allocate one instance of each of the classes
    // that handle the major steps of the import process.
    // These are specified in the order they are called, and the order they appear on the page:
    export var selectMajorKindStep: SelectMajorKindStep;
    export var rawInputStep: RawInputStep;
    export var identifyStructuresStep: IdentifyStructuresStep;
    export var typeDisambiguationStep: TypeDisambiguationStep;
    export var reviewStep: ReviewStep;
    export var atdGraphing: EDDATDGraphing;

    export interface RawModeProcessor {
        parse(rawInputStep: RawInputStep, rawData: string): RawInputStat;
        process(rawInputStep: RawInputStep, stat: RawInputStat): void;
    }


    export interface MeasurementValueSequence {
        data: (string | number)[][];  // may be received as string, should insert as number
    }

    export interface GraphingSet extends MeasurementValueSequence {
        label: string;
        name: string;
        units: string;
        color?: string;
        tags?: any;
    }
    // These are returned by the server after parsing a dropped file
    export interface RawImportSet extends MeasurementValueSequence {
        kind: string;  // the type of import selected in step 1
        hint: string;  // any additional hints about type of data
        line_name: string;
        assay_name: string;
        measurement_name: string;
        metadata_by_name?: {[id:string]: string};
    }
    // This information is added post-disambiguation, in addition to the fields from RawImportSet,
    // and sent to the server
    export interface ResolvedImportSet extends RawImportSet {
        protocol_id:number;
        // Value of 'null' or string 'new' indicates new Line should be created with
        // name line_name.
        line_id:string | number;
        assay_id:string | number;
        measurement_id:string ;
        compartment_id:string;
        units_id:string;
        metadata_by_id:{[id:string]: string};
    }

    // Captures important information to be reviewed by the user in the final import step
    export class ImportMessage {
        message:string;

        //optional. for possible future use in highlighting / scrolling to / etc.
        relatedControlSelector:string;

        // optional. no-input function to call to reevaluate the error/warning and then update
        // the UI with the result (e.g. by re-querying a REST resource).
        reevaluateFunction:any;

        constructor(message:string,
                relatedControlSelector:string=null,
                reevaluateFunction:any=null) {
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
    export interface ImportStep {
        getUserWarnings():ImportMessage[];
        getUserErrors():ImportMessage[];

        // tests whether all required input controls have a value
        // (not whether values are compatible / consistent)
        requiredInputsProvided():boolean;

        // called to inform this step that the previous step has completed its processing as a
        // result of input changes somewhere upstream
        previousStepChanged():void;
    }

    // As soon as the window load signal is sent, call back to the server for the set of reference
    // records that will be used to disambiguate labels in imported data.
    export function onWindowLoad(): void {
        var atdata_url:string;

        atdata_url = "/study/" + EDDData.currentStudyID + "/assaydata/";

        EDDAuto.BaseAuto.initPreexisting();
        // this makes the autocomplete work like a dropdown box
        // fires off a search as soon as the element gains focus
        $(document).on('focus', '.autocomp', function (ev) {
            $(ev.target).addClass('autocomp_search').mcautocomplete('search');
        });

        $('.disclose').find('a.discloseLink').on('click', EDDTableImport.disclose);
        // Populate ATData and EDDData objects via AJAX calls
        jQuery.ajax(atdata_url, {
            "success": function(data) {
                $.extend(ATData, data.ATData);
                $.extend(EDDData, data.EDDData);
                EDDTableImport.onReferenceRecordsLoad();
            },
            // pass along extra parameter "active"
            "data": { "active": true }
        }).fail(function(x, s, e) {
            alert(s);
        });
    }


    // As soon as we've got and parsed the reference data, we can set up all the callbacks for the
    // UI, effectively turning the page "on".
    export function onReferenceRecordsLoad(): void {
        var step1, step2, step3, step4, step5;

        //TODO: clarify reflected GUI state when waiting for large dataset from the server.
        // in several test cases with large #'s of lines, there's time for the user to reach a
        // later / confusing step in the process while waiting on this data to be returned.
        // Probably should fix this in EDD-182.
        $('#waitingForServerLabel').addClass('off');

        // Allocate one instance of each step, providing references to the previous steps
        // as needed.
        step1 = new SelectMajorKindStep(EDDTableImport.selectMajorKindCallback);
        step2 = new RawInputStep(step1, EDDTableImport.rawInputCallback,
            EDDTableImport.processingFileCallback);
        step3 = new IdentifyStructuresStep(step1, step2,
            EDDTableImport.identifyStructuresCallback);
        step4 = new TypeDisambiguationStep(step1, step3,
            EDDTableImport.typeDisambiguationCallback);
        step5 = new ReviewStep(step1, step2, step3, step4, EDDTableImport.reviewStepCallback);

        EDDTableImport.selectMajorKindStep = step1;
        EDDTableImport.rawInputStep = step2;
        EDDTableImport.identifyStructuresStep = step3;
        EDDTableImport.typeDisambiguationStep = step4;
        EDDTableImport.reviewStep = step5;

        // Wire up the function that submits the page
        $('#submitForImport').on('click', EDDTableImport.submitForImport);

        // We need to manually trigger this, after all our steps are constructed.
        // This will cascade calls through the rest of the steps and configure them too.
        step1.queueReconfigure();
    }


    // This is called by our instance of selectMajorKindStep to announce changes.
    export function selectMajorKindCallback(): void {
        // This is a bit of a hack.  We want to change the pulldown settings in Step 3 if the mode
        // in Step 1 is changed, but leave the pulldown alone otherwise (including when Step 2
        // announces its own changes.)
        // TODO: Make Step 3 track this with an internal variable.
        if (EDDTableImport.selectMajorKindStep.interpretationMode == 'mdv') {
            // A default set of pulldown settings for this mode
            EDDTableImport.identifyStructuresStep.pulldownSettings = [
                TypeEnum.Line_Names,
                TypeEnum.Measurement_Type
            ];
        }
        EDDTableImport.rawInputStep.previousStepChanged();
    }


    // This is called by our instance of Step 2, RawInputStep to announce changes.
    // We just pass the signal along to Step 3: IdentifyStructuresStep.
    export function rawInputCallback(): void {
        EDDTableImport.identifyStructuresStep.previousStepChanged();
    }


    // This is called by our instance of Step 3, IdentifyStructuresStep to announce changes.
    // We just pass the signal along to Step 4: TypeDisambiguationStep.
    export function identifyStructuresCallback(): void {
        EDDTableImport.typeDisambiguationStep.previousStepChanged();
    }


    // This is called by our instance of TypeDisambiguationStep to announce changes.
    // All we do currently is repopulate the debug area.
    export function typeDisambiguationCallback(): void {
        EDDTableImport.reviewStep.previousStepChanged();
    }

    // tells step 3 that step 2 has just begun processing file input
    export function processingFileCallback(): void {
        EDDTableImport.identifyStructuresStep.processingFileInPreviousStep();
    }

    export function reviewStepCallback(): void {
        // nothing to do! no subsequent steps
    }


    // When the submit button is pushed, fetch the most recent record sets from our
    // IdentifyStructuresStep instance, and embed them in the hidden form field that will be
    // submitted to the server.
    // Note that this is not all that the server needs, in order to successfully process an
    // import. It also reads other form elements from the page, created by SelectMajorKindStep
    // and TypeDisambiguationStep.
    export function submitForImport(): void {
        var json: string, resolvedSets;
        resolvedSets = EDDTableImport.typeDisambiguationStep.createSetsForSubmission();
        json = JSON.stringify(resolvedSets);
        $('#jsonoutput').val(json);
        $('#jsondebugarea').val(json);
    }


    // The usual click-to-disclose callback.  Perhaps this should be in Utl.ts?
    export function disclose(): boolean {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }

    var DEFAULT_MASTER_PROTOCOL:string = 'unspecified_protocol';


    // The class responsible for everything in the "Step 1" box that you see on the data import
    // page. Here we provide UI for selecting the major kind of import, and the Protocol that the
    // data should be stored under. These choices affect the behavior of all subsequent steps.
    export class SelectMajorKindStep {

        // The Protocol for which we will be importing data.
        masterProtocol: number;
        // The main mode we are interpreting data in.
        // Valid values sofar are "std", "mdv", "tr", "hplc", "pr", and "biolector".
        interpretationMode: string | any;
        inputRefreshTimerID: number;

        nextStepCallback: any;


        constructor(nextStepCallback: any) {
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
            $("#masterProtocol").on('change', this.queueReconfigure.bind(this));

            // Using "change" for these because it's more efficient AND because it works around an
            // irritating Chrome inconsistency
            // For some of these, changing them shouldn't actually affect processing until we
            // implement an overwrite-checking feature or something similar
            $(':radio[name=datalayout]', '#selectMajorKindStep').on(
                'change', this.queueReconfigure.bind(this)
            );
        }


        // Start a timer to wait before calling the reconfigure routine. This way we condense
        // multiple possible events from the radio buttons and/or pulldown into one.
        queueReconfigure(): void {
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }
            this.inputRefreshTimerID = setTimeout(this.reconfigure.bind(this), 250);
        }


        // Read the settings out of the UI and pass along.
        // If the interpretation mode has changed, all the subsequent steps will need a refresh.
        // If the master Protocol pulldown has changed, Step 4 will need a refresh,
        // specifically the master Assay pulldown and Assay/Line disambiguation section.
        reconfigure(): void {
            // Don't inline these into the if statement or the second one might not be called!
            var a:boolean = this.checkInterpretationMode();
            var b:boolean = this.checkMasterProtocol();
            if (a || b) { this.nextStepCallback(); }
        }


        // If the interpretation mode value has changed, note the change and return 'true'.
        // Otherwise return 'false'.
        checkInterpretationMode(): boolean {
            // Find every input element with the name attribute of 'datalayout' that is checked.
            // Should return 0 or 1 elements.
            var modeRadio = $("[name='datalayout']:checked");
            // If none of them are checked, we don't have enough information to handle any
            // next steps.
            if (modeRadio.length < 1) { return false; }
            var radioValue = modeRadio.val();
            if (this.interpretationMode == radioValue) { return false; }
            this.interpretationMode = radioValue;
            return true;
        }


        // If the master Protocol pulldown value has changed, note the change and return 'true'.
        // Otherwise return 'false'.
        checkMasterProtocol():boolean {
            var protocolRaw = $('#masterProtocol').val();
            var p:any = (protocolRaw == DEFAULT_MASTER_PROTOCOL) ? 0 : parseInt(protocolRaw, 10);
            if (this.masterProtocol === p) { return false; }
            this.masterProtocol = p;
            return true;
        }

        getUserWarnings():ImportMessage[] {
            return [];
        }

        getUserErrors():ImportMessage[] {
            return [];
        }

        requiredInputsProvided():boolean {
            return this.masterProtocol != 0;
        }

        previousStepChanged(): void {
            // no-op. no previous steps!
        }
    }


    class NullProcessor implements RawModeProcessor {
        /// RawInputStep processor that does nothing.

        parse(rawInputStep: RawInputStep, rawData: string): RawInputStat {
            return {
                'input': [],
                'columns': 0
            }
        }

        process(rawInputStep: RawInputStep, input: RawInputStat): void {
        }

    }


    abstract class BaseRawTableProcessor implements RawModeProcessor {
        /// Base processor for RawInputStep handles parsing a string into a 2D array

        parse(rawInputStep: RawInputStep, rawData: string): RawInputStat {
            var rawText: string,
                delimiter: string,
                longestRow: number,
                rows: RawInput,
                multiColumn: boolean;

            rawText = rawInputStep.rawText();
            delimiter = rawInputStep.separatorType() == 'csv' ? ',' : '\t';
            rows = [];
            // find the highest number of columns in a row
            longestRow = rawText.split(/[ \r]*\n/).reduce(
                (prev: number, rawRow: string): number => {
                    var row: string[];
                    if (rawRow !== '') {
                        row = rawRow.split(delimiter);
                        rows.push(row);
                        return Math.max(prev, row.length);
                    }
                    return prev;
                },
                0  // initial value for reduce
            );

            // pad out rows so it is rectangular
            rows.forEach((row: string[]): void => {
                while (row.length < longestRow) {
                    row.push('');
                }
            });

            return {
                'input': rows,
                'columns': longestRow
            };
        }

        process(rawInputStep: RawInputStep, input: RawInputStat): void {
        }

    }


    class MdvProcessor extends BaseRawTableProcessor {
        /// RawInputStep processor for MDV-formatted spreadsheets

        process(rawInputStep: RawInputStep, parsed: RawInputStat): void {
            var rows: RawInput, colLabels: string[], compounds: any, orderedComp: string[];
            colLabels = [];
            rows = parsed.input.slice(0); // copy
            // If this word fragment is in the first row, drop the whole row.
            // (Ignoring a Q of unknown capitalization)
            if (rows[0].join('').match(/uantitation/g)) {
                rows.shift();
            }
            compounds = {};
            orderedComp = [];
            rows.forEach((row: string[]): void => {
                var first: string, marked: string[], name: string, index: number;
                first = row.shift();
                // If we happen to encounter an occurrence of a row with 'Compound' in
                // the first column, we treat it as a row of column identifiers.
                if (first === 'Compound') {
                    colLabels = row;
                    return;
                }
                marked = first.split(' M = ');
                if (marked.length === 2) {
                    name = marked[0];
                    index = parseInt(marked[1], 10);
                    if (!compounds[name]) {
                        compounds[name] = { 'originalRows': {}, 'processedAssayCols': {} }
                        orderedComp.push(name);
                    }
                    compounds[name].originalRows[index] = row.slice(0);
                }
            });
            $.each(compounds, (name: string, value: any): void => {
                var indices: number[];
                // First gather up all the marker indexes given for this compound
                indices = $.map(
                    value.originalRows,
                    (_, index: string): number => parseInt(index, 10)
                );
                indices.sort((a, b) => a - b); // sort ascending
                // Run through the set of columnLabels above, assembling a marking number for each,
                // by drawing - in order - from this collected row data.
                colLabels.forEach((label: string, index: number): void => {
                    var parts: string[], anyFloat: boolean;
                    parts = [];
                    anyFloat = false;
                    indices.forEach((ri: number): void => {
                        var original: string[], cell: string;
                        original = value.originalRows[ri];
                        cell = original[index];
                        if (cell) {
                            cell = cell.replace(/,/g, '');
                            if (isNaN(parseFloat(cell))) {
                                if (anyFloat) {
                                    parts.push('');
                                }
                            } else {
                                parts.push(cell);
                            }
                        }
                    });
                    // Assembled a full carbon marker number, grab the column label, and place
                    // the marker in the appropriate section.
                    value.processedAssayCols[index] = parts.join('/');
                });
            });
            // Start the set of row markers with a generic label
            rawInputStep.gridRowMarkers = ['Assay'];
            // The first row is our label collection
            rawInputStep.gridFromTextField[0] = colLabels.slice(0);
            // push the rest of the rows generated from ordered list of compounds
            Array.prototype.push.apply(
                rawInputStep.gridFromTextField,
                orderedComp.map((name: string): string[] => {
                    var compound: any, row: string[], colLookup: any;
                    rawInputStep.gridRowMarkers.push(name);
                    compound = compounds[name];
                    row = [];
                    colLookup = compound.processedAssayCols;
                    // generate row cells by mapping column labels to processed columns
                    Array.prototype.push.apply(row,
                        colLabels.map((_, index: number): string => colLookup[index] || '')
                    );
                    return row;
                })
            );
        }

    }


    class StandardProcessor extends BaseRawTableProcessor {
        /// RawInputStep processor for standard tables with one header row and column

        process(rawInputStep: RawInputStep, parsed: RawInputStat): void {
            // If the user hasn't deliberately chosen a setting for 'transpose', we will do
            // some analysis to attempt to guess which orientation the data needs to have.
            if (!rawInputStep.userClickedOnTranspose) {
                rawInputStep.inferTransposeSetting(parsed.input);
            }
            // If the user hasn't deliberately chosen to ignore, or accept, gaps in the data,
            // do a basic analysis to guess which setting makes more sense.
            if (!rawInputStep.userClickedOnIgnoreDataGaps) {
                rawInputStep.inferGapsSetting();
            }

            // Collect the data based on the settings
            if (rawInputStep.transpose()) {
                // first row becomes Y-markers as-is
                rawInputStep.gridRowMarkers = parsed.input.shift() || [];
                rawInputStep.gridFromTextField = (parsed.input[0] || []).map(
                    (_, i: number): string[] => {
                        return parsed.input.map((row: string[]): string => row[i] || '');
                    }
                );
            } else {
                rawInputStep.gridRowMarkers = [];
                rawInputStep.gridFromTextField = (parsed.input || []).map(
                    (row: string[]): string[] => {
                        rawInputStep.gridRowMarkers.push(row.shift());
                        return row;
                    }
                );
            }

        }

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
    export class RawInputStep {

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
        processingFileCallback: any;
        nextStepCallback: any;

        haveInputData:boolean = false;

        processingFile = false; //true while the input is being processed (locally or remotely)

        constructor(selectMajorKindStep: SelectMajorKindStep,
                nextStepCallback: any,
                processingFileCallBack: any) {

            this.selectMajorKindStep = selectMajorKindStep;

            this.gridFromTextField = [];
            this.processedSetsFromFile = [];
            this.processedSetsAvailable = false;
            this.gridRowMarkers = [];
            this.transposed = false;
            this.userClickedOnTranspose = false;
            this.ignoreDataGaps = false;
            this.userClickedOnIgnoreDataGaps = false;
            this.separator = 'csv';
            this.inputRefreshTimerID = null;

            $('#step2textarea')
                .on('paste', this.pastedRawData.bind(this))
                .on('keyup', this.queueReprocessRawData.bind(this))
                .on('keydown', this.suppressNormalTab.bind(this));

            // Using "change" for these because it's more efficient AND because it works around an
            // irritating Chrome inconsistency. For some of these, changing them should not
            // actually affect processing until we implement an overwrite-checking feature or
            // something similar

            $('#rawdataformatp').on('change', this.queueReprocessRawData.bind(this));
            $('#ignoreGaps').on('change', this.clickedOnIgnoreDataGaps.bind(this));
            $('#transpose').on('change', this.clickedOnTranspose.bind(this));
            $('#resetstep2').on('click', this.reset.bind(this));

            Utl.FileDropZone.create({
                elementId: "importDropZone",
                fileInitFn: this.fileDropped.bind(this),
                url: "/utilities/parsefile/",
                processResponseFn: this.fileReturnedFromServer.bind(this),
                clickable: false
            });

            this.processingFileCallback = processingFileCallback;
            this.nextStepCallback = nextStepCallback;
        }


        // In practice, the only time this will be called is when Step 1 changes,
        // which may call for a reconfiguration of the controls in this step.
        previousStepChanged(): void {
            var mode = this.selectMajorKindStep.interpretationMode;
            // update input visibility based on user selection in step 1
            this.updateInputVisible();

            // By default, our drop zone wants excel or csv files, so we clear the
            // additional classes:
            $('#step2textarea').removeClass('xml text');

            if (mode === 'biolector') {
                // Biolector data is expected in XML format.
                $('#step2textarea').addClass('xml');
                $('#gcmsSampleFile').hide();
                //show example biolector file
                $('#biolectorFile').show();
                // It is also expected to be dropped from a file. So, either we are already in
                // file mode and there are already parsed sets available, or we are in text entry
                // mode waiting for a file drop. Either way there's no need to call
                // reprocessRawData(), so we just push on to the next step.
                this.nextStepCallback();
                return;
            } else {
                //hide example biolector file
                $('#biolectorFile').hide();
            }
            if (mode === 'hplc') {
                // HPLC data is expected as a text file.
                $('#step2textarea').addClass('text');
                $('#hplcExample').show();
                $('#gcmsSampleFile').hide();
                this.nextStepCallback();
                return;
            } else {
                $('#hplcExample').hide();
            }
            if (mode === 'skyline') {
                this.nextStepCallback();
                $('#gcmsSampleFile').hide();
                //show skyline example file
                $('#skylineSample').show();
                return;
            } else {
                $('#skylineSample').hide();
            }
            if (mode === 'mdv') {
                // When JBEI MDV format documents are pasted in, it's always from Excel, so they
                // are always tab-separated.
                this.separatorType('tab');
                // We also never ignore gaps, or transpose, for MDV documents.
                this.ignoreGaps(false);
                this.transpose(false);
                // Proceed through to the dropzone check.
            }

            //for std use GC-MS file
            if (mode === 'std') {
                 $('#prSampleFile').hide();
                $('#gcmsSampleFile').show();
            } else {
                $('#gcmsSampleFile').hide();
            }
            if (mode === 'std' || mode === 'tr' || mode === 'mdv') {
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
            var delay: string | number;

            if (this.haveInputData) {
                processingFileCallback();
            }
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }

            // Wait at least 1/2 second, at most 3 seconds,
            // with a range in between based on the length of the input data.
            // This way a person making a minor correction to a small data set can see
            // their results more quickly, but we don't overload when working on large sets.
            delay = Math.max(500, Math.min(3000, $('#step2textarea').val().length));

            this.inputRefreshTimerID = setTimeout(this.reprocessRawData.bind(this), delay);
        }

        getProcessorForMode(mode: string): RawModeProcessor {
            var processor: RawModeProcessor;
            if (['std', 'tr'].indexOf(mode) != -1) {
                processor = new StandardProcessor();
            } else if ('mdv' === mode) {
                processor = new MdvProcessor();
            } else {
                processor = new NullProcessor();
            }
            return processor;
        }

        // processes raw user input entered directly into the text area
        reprocessRawData(): void {

            var mode: string,
                delimiter: string,
                processor: RawModeProcessor,
                input: RawInputStat;

            mode = this.selectMajorKindStep.interpretationMode;

            this.ignoreGaps();    // TODO: Are these necessary?
            this.transpose();
            this.separatorType();

            this.gridFromTextField = [];
            this.gridRowMarkers = [];

            processor = this.getProcessorForMode(mode);
            input = processor.parse(this, this.rawText());
            processor.process(this, input);

            this.processingFile = false;
            this.nextStepCallback();
        }


        // Here, we take a look at the type of the dropped file and add extra headers
        fileDropped(file, formData): void {
            this.haveInputData = true;
            processingFileCallback();
            formData.set('import_mode', this.selectMajorKindStep.interpretationMode);
        }

        // This is called upon receiving a response from a file upload operation, and unlike
        // fileRead() above, is passed a processed result from the server as a second argument,
        // rather than the raw contents of the file.
        fileReturnedFromServer(fileContainer, result, response): void {
            var mode = this.selectMajorKindStep.interpretationMode;

            if (mode === 'biolector' || mode === 'hplc' || mode === 'skyline') {
                var data: any[], count: number, points: number;
                data = response.file_data;
                count = data.length;
                points = data.map((set): number => set.data.length).reduce((acc, n) => acc + n, 0);
                $('<p>').text(
                    'Found ' + count + ' measurements with ' + points + ' total data points.'
                ).appendTo($(".dz-preview"));
                this.processedSetsFromFile = data;
                this.processedSetsAvailable = true;
                this.processingFile = false;
                // Call this directly, skipping over reprocessRawData() since we don't need it.
                this.nextStepCallback();
                return;
            }

            if (response.file_type === 'csv') {
                // Since we're handling this format entirely client-side, we can get rid of the
                // drop zone immediately.
                this.clearDropZone();
                this.rawText(response.file_data);
                this.inferSeparatorType();
                this.reprocessRawData();
                return;
            }

            if (response.file_type == "xlsx") {
                this.clearDropZone();
                var ws = response.file_data["worksheets"][0];
                var table = ws[0];
                var csv = [];
                if (table.headers) {
                    csv.push(table.headers.join());
                }
                csv = csv.concat(table.values.map((row: string[]) => row.join()));
                this.separatorType('csv');
                this.rawText(csv.join('\n'));
                this.reprocessRawData();
                return;
            }
        }

        updateInputVisible():void {
            var missingStep1Inputs = !this.selectMajorKindStep.requiredInputsProvided();

            $('#completeStep1Label').toggleClass('off', !missingStep1Inputs);
            $('#importDropZone').toggleClass('off', missingStep1Inputs);
            $('#step2textarea').toggleClass('off', missingStep1Inputs);
        }


        // Reset and hide the info box that appears when a file is dropped,
        // and reveal the text entry area
        // This also clears the "processedSetsAvailable" flag because it assumes that
        // the text entry area is now the preferred data source for subsequent steps.
        clearDropZone(): void {

            this.updateInputVisible();

            $('#fileDropInfoArea').addClass('off');
            $('#fileDropInfoSending').addClass('off');
            $('#fileDropInfoName').empty();
            $('#fileDropInfoLog').empty();


            // If we have a currently tracked dropped file, set its flags so we ignore any
            // callbacks, before we forget about it.
            if (this.activeDraggedFile) {
                this.activeDraggedFile.stopProcessing = true;
            }
            this.activeDraggedFile = null;
            this.processedSetsAvailable = false;
        }


        reset(): void {
            this.haveInputData=false;
            this.clearDropZone();
            this.rawText('');
            this.reprocessRawData();
        }


        inferTransposeSetting(rows: RawInput):void  {

            // The most straightforward method is to take the top row, and the first column,
            // and analyze both to see which one most likely contains a run of timestamps.
            // We'll also do the same for the second row and the second column, in case the
            // timestamps are underneath some other header.
            var arraysToAnalyze: string[][], arraysScores: number[], setTranspose: boolean;

            // Note that with empty or too-small source data, these arrays will either remain
            // empty, or become 'null'
            arraysToAnalyze = [
                rows[0] || [],   // First row
                rows[1] || [],   // Second row
                (rows || []).map((row: string[]): string => row[0]),   // First column
                (rows || []).map((row: string[]): string => row[1])    // Second column
            ];
            arraysScores = arraysToAnalyze.map((row: string[], i: number): number => {
                var score = 0, prev: number, nnPrev: number;
                if (!row || row.length === 0) {
                    return 0;
                }
                prev = nnPrev = undefined;
                row.forEach((value: string, j: number, r: string[]): void => {
                    var t: number;
                    if (value) {
                        t = parseFloat(value.replace(/,/g, ''));
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
                setTranspose = arraysScores[0] > arraysScores[2];
            } else {
                setTranspose = arraysScores[1] > arraysScores[3];
            }
            this.transpose(setTranspose);
        }


        inferGapsSetting():void {
            // Count the number of blank values at the end of each column
            // Count the number of blank values in between non-blank data
            // If more than three times as many as at the end, default to ignore gaps
            var intra: number = 0, extra: number = 0;
            this.gridFromTextField.forEach((row: string[]): void => {
                var notNull: boolean = false;
                // copy and reverse to loop from the end
                row.slice(0).reverse().forEach((value: string): void => {
                    if (!value) {
                        notNull ? ++extra : ++intra;
                    } else {
                        notNull = true;
                    }
                });
            });
            var result:boolean = extra > (intra * 3);
            this.ignoreGaps(result);
        }


        // This gets called when there is a paste event.
        pastedRawData():void {
            // We do this using a timeout so the rest of the paste events fire, and get the
            // pasted result.
            this.haveInputData = true;
            window.setTimeout(this.inferSeparatorType.bind(this), 1);
        }


        inferSeparatorType(): void {
            if (this.selectMajorKindStep.interpretationMode !== "mdv") {
                var text: string, test: boolean;
                text = this.rawText() || '';
                test = text.split('\t').length >= text.split(',').length;
                this.separatorType(test ? 'tab' : 'csv');
            }
        }


        ignoreGaps(value?: boolean): boolean {
            var ignoreGaps = $('#ignoreGaps');
            if (value === undefined) {
                value = ignoreGaps.prop('checked');
            } else {
                ignoreGaps.prop('checked', value);
            }
            return (this.ignoreDataGaps = value);
        }


        transpose(value?: boolean): boolean {
            var transpose = $('#transpose');
            if (value === undefined) {
                value = transpose.prop('checked');
            } else {
                transpose.prop('checked', value);
            }
            return (this.transposed = value);
        }


        separatorType(value?: any): string {
            var separatorPulldown = $('#rawdataformatp');
            if (value === undefined) {
                value = separatorPulldown.val();
            } else {
                separatorPulldown.val(value);
            }
            return (this.separator = value);
        }


        rawText(value?: any): string {
            var rawArea: JQuery = $('#step2textarea');
            if (value === undefined) {
                value = rawArea.val();
            } else {
                rawArea.val(value);
            }
            return value;
        }


        clickedOnIgnoreDataGaps():void {
            this.userClickedOnIgnoreDataGaps = true;
            // This will take care of reading the status of the checkbox
            this.reprocessRawData();
        }


        clickedOnTranspose():void {
            this.userClickedOnTranspose = true;
            this.reprocessRawData();
        }


        // This handles insertion of a tab into the textarea.
        // May be glitchy.
        suppressNormalTab(e: JQueryKeyEventObject): boolean {
            var input: HTMLInputElement, text: any, selStart: number, selEnd: number;
            this.haveInputData = true;
            if (e.which === 9) {
                input = <HTMLInputElement>e.target;
                // These need to be read out before they are destroyed by altering the value of
                // the element.
                var selStart = input.selectionStart;
                var selEnd = input.selectionEnd;
                text = $(input).val();
                // set value to itself with selection replaced by a tab character
                $(input).val([
                    text.substring(0, selStart),
                    text.substring(selEnd)
                ].join('\t'));
                // put caret at right position again
                selEnd = selStart + 1;
                input.selectionStart = selEnd;
                input.selectionEnd = selEnd;
                return false;
            }
            return true;
        }


        getGrid(): any[] {
            return this.gridFromTextField;
        }

        getUserWarnings():ImportMessage[] {
            return [];
        }

        getUserErrors():ImportMessage[] {
            return [];
        }

        requiredInputsProvided():boolean {
            return this.selectMajorKindStep.requiredInputsProvided() && this.haveInputData;
        }
    }



    // type for the options in row pulldowns
    export interface RowPulldownOption extends Array<string|number|RowPulldownOption[]> {
        0: string;
        1: number | RowPulldownOption[];
    }


    // Magic numbers used in pulldowns to assign types to rows/fields.
    export class TypeEnum {
        static Gene_Names = 10;  // plural!
        static RPKM_Values = 11;
        static Line_Names = 1;
        static Protein_Name = 12;
        static Pubchem_Name = 13;
        static Gene_Name = 14;  // singular!
        static Measurement_Types = 2; // plural!!
        static Timestamp = 3;
        static Metadata_Name = 4;
        static Measurement_Type = 5; // singular!!
    }


    // The class responsible for everything in the "Step 3" box that you see on the data import
    // page. Get the grid from the previous step, and draw it as a table with puldowns for
    // specifying the content of the rows and columns, as well as checkboxes to enable or disable
    // rows or columns. Interpret the current grid and the settings on the current table into
    // EDD-friendly sets.
    export class IdentifyStructuresStep implements ImportStep {

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
        graphSets: GraphingSet[];
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
        nextStepCallback: any;

        warningMessages:ImportMessage[];
        errorMessages:ImportMessage[];

        // Step 1 modes in which the data table gets displayed
        static MODES_WITH_DATA_TABLE: string[] = ['std', 'tr','mdv'];
        static MODES_WITH_GRAPH: string[] = ['std', 'biolector', 'hplc'];

        static DISABLED_PULLDOWN_LABEL: string = '--';
        static DEFAULT_PULLDOWN_VALUE: number = 0;

        static DUPLICATE_LEGEND_THRESHOLD:number = 10;


        constructor(selectMajorKindStep: SelectMajorKindStep,
                rawInputStep: RawInputStep,
                nextStepCallback: any) {

            this.rawInputStep = rawInputStep;

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
            this.graphSets = [];
            this.uniqueLineNames = [];
            this.uniqueAssayNames = [];
            this.uniqueMeasurementNames = [];
            this.uniqueUniprot = [];
            this.uniquePubchem = [];
            this.uniqueGenbank = [];
            this.uniqueMetadataNames = [];
            // A flag to indicate whether we have seen any timestamps specified in the import data
            this.seenAnyTimestamps = false;

            this.selectMajorKindStep = selectMajorKindStep;
            this.nextStepCallback = nextStepCallback;

            this.warningMessages=[];
            this.errorMessages=[];

            $('#dataTableDiv')
                .on('mouseover mouseout', 'td', this.highlighterF.bind(this))
                .on('dblclick', 'td', this.singleValueDisablerF.bind(this));

            $('#resetstep3').on('click', this.resetEnabledFlagMarkers.bind(this));
        }


        // called to inform this step that the immediately preceding step has begun processing
        // its inputs. The assumption is that the processing is taking place until the next call to
        // previousStepChanged().
        processingFileInPreviousStep(): void {
            $('#processingStep2ResultsLabel').removeClass('off');
            $('#enterDataInStep2').addClass('off');
            $('#dataTableDiv').find("input,button,textarea,select").attr("disabled", "disabled");
        }


        previousStepChanged(): void {
            var prevStepComplete: boolean,
                ignoreDataGaps:boolean,
                showDataTable:boolean,
                showGraph: boolean,
                mode: string,
                graph: JQuery,
                gridRowMarkers:any[],
                grid:any[];
            prevStepComplete = this.rawInputStep.requiredInputsProvided();
            $('#processingStep2ResultsLabel').toggleClass('off', !prevStepComplete);
            $('#enterDataInStep2').toggleClass('off', prevStepComplete);
            $('#dataTableDiv').toggleClass('off', !prevStepComplete);

            mode = this.selectMajorKindStep.interpretationMode;
            graph = $('#graphDiv');
            this.graphEnabled = IdentifyStructuresStep.MODES_WITH_GRAPH.indexOf(mode) >= 0;
            showGraph = this.graphEnabled && prevStepComplete;
            graph.toggleClass('off', !showGraph);

            gridRowMarkers = this.rawInputStep.gridRowMarkers;
            grid = this.rawInputStep.getGrid();
            ignoreDataGaps = this.rawInputStep.ignoreDataGaps;

            // Empty the data table whether we remake it or not...
            $('#dataTableDiv').empty();

            showDataTable = IdentifyStructuresStep.MODES_WITH_DATA_TABLE.indexOf(mode) >= 0;
            $('#step3UpperLegend').toggleClass('off', !showDataTable);

            if (showDataTable) {
                gridRowMarkers.forEach((value: string, i: number): void => {
                    var type: any;
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
                $('#dataTableDiv').text('This step is not needed for the current import. ' +
                    'Nothing to see here, proceed to Step 4.');
            }
            // Either we're interpreting some pre-processed data sets from a server response,
            // or we are interpreting the data table we just laid out above, which involves
            // skipping disabled rows or columns, optionally ignoring blank values, etc.
            this.interpretDataTable();

            // Start a delay timer that redraws the graph from the interpreted data. This is
            // rather resource intensive, so we're delaying a bit, and restarting the delay
            // if the user makes additional edits to the data within the delay period.
            this.queueGraphRemake();
            $('#processingStep2ResultsLabel').addClass('off');

            this.nextStepCallback();
        }


        figureOutThisRowsDataType(mode: string, label: string, row: string[]): number {
            var blank: number, strings: number, condensed: string[];
            if (mode == 'tr') {
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
            blank = strings = 0;
            // A condensed version of the row, with no nulls or blank values
            condensed = row.filter((v: string): boolean => !!v);
            blank = row.length - condensed.length;
            condensed.forEach((v: string): void => {
                v = v.replace(/,/g, '');
                if (isNaN(parseFloat(v))) {
                    ++strings;
                }
            });
            // If the label parses into a number and the data contains no strings, call it a
            // timestamp for data
            if (!isNaN(parseFloat(label)) && (strings === 0)) {
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
            var body: HTMLTableElement,
                colgroup: JQuery,
                controlCols: string[],
                legendCopy: JQuery,
                lowerLegend: JQuery,
                lowerLegendId: string,
                pulldownOptions: RowPulldownOption[],
                row: HTMLTableRowElement,
                that: IdentifyStructuresStep,
                table: HTMLTableElement;

            this.dataCells = [];
            this.colCheckboxCells = [];
            this.colObjects = [];
            this.rowLabelCells = [];
            this.rowCheckboxCells = [];
            controlCols = ['checkbox', 'pulldown', 'label'];
            if (mode === 'tr') {
                pulldownOptions = [
                    [
                        IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL,
                        IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE
                    ],
                    ['Entire Row Is...', [
                            ['Gene Names', TypeEnum.Gene_Names],
                            ['RPKM Values', TypeEnum.RPKM_Values]
                        ]
                    ]
                ];
            } else {
                pulldownOptions = [
                    [
                        IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL,
                        IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE
                    ],
                    ['Entire Row Is...', [
                            ['Line Names', TypeEnum.Line_Names],
                            ['Measurement Types', TypeEnum.Measurement_Types]
                        ]
                    ],
                    ['First Column Is...', [
                        ['Time (in hours)', TypeEnum.Timestamp],
                            ['Metadata Name', TypeEnum.Metadata_Name],
                            ['Measurement Type', TypeEnum.Measurement_Type],
                            ['Protein ID', TypeEnum.Protein_Name],
                            ['PubChem CID', TypeEnum.Pubchem_Name],
                            ['Gene ID', TypeEnum.Gene_Name]
                        ]
                    ]
                ];
            }

            // attach all event handlers to the table itself
            that = this;
            table = <HTMLTableElement>$('<table>').attr('cellspacing', '0')
                .appendTo($('#dataTableDiv'))
                .on('click', '[name=enableColumn]', (ev: JQueryMouseEventObject) => {
                    that.toggleTableColumn(ev.target);
                }).on('click', '[name=enableRow]', (ev: JQueryMouseEventObject) => {
                    that.toggleTableRow(ev.target);
                }).on('change', '.pulldownCell > select', (ev: JQueryInputEventObject) => {
                    var targ: JQuery = $(ev.target),
                        i: any = parseInt(targ.attr('i'), 10),
                        val: any = parseInt(targ.val(), 10);
                    that.changedRowDataTypePulldown(i, val);
                })[0];
            // One of the objects here will be a column group, with col objects in it.
            // This is an interesting twist on DOM behavior that you should probably google.
            colgroup = $('<colgroup>').appendTo(table);
            controlCols.forEach((): void => {
                $('<col>').appendTo(colgroup);
            });
            body = <HTMLTableElement>$('<tbody>').appendTo(table)[0];
            // Start with three columns, for the checkboxes, pulldowns, and labels.
            // (These will not be tracked in Table.colObjects.)

            // add col elements for each data column
            var nColumns = 0;
            (grid[0] || []).forEach((): void => {
                this.colObjects.push($('<col>').appendTo(colgroup)[0]);
                nColumns++;
            });

            ///////////////////////////////////////////////////////////////////////////////////////
            // First row: spacer cells, followed by checkbox cells for each data column
            ///////////////////////////////////////////////////////////////////////////////////////
            row = <HTMLTableRowElement>body.insertRow();
            // spacer cells have x and y set to 0 to remove from highlight grid
            controlCols.forEach((): void => {
                $(row.insertCell()).attr({'x': '0', 'y': 0});
            });
            (grid[0] || []).forEach((_, i: number): void => {
                var cell: JQuery, box: JQuery;
                cell = $(row.insertCell()).attr({'id': 'colCBCell' + i, 'x': 1 + i, 'y': 0})
                    .addClass('checkBoxCell');
                box = $('<input type="checkbox"/>').appendTo(cell)
                    .val(i.toString())
                    .attr({'id': 'enableColumn' + i, 'name': 'enableColumn'})
                    .prop('checked', this.activeColFlags[i]);
                this.colCheckboxCells.push(cell[0]);
            });
            this.pulldownObjects = [];  // We don't want any lingering old objects in this

            ///////////////////////////////////////////////////////////////////////////////////////
            // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
            ///////////////////////////////////////////////////////////////////////////////////////
            grid.forEach((values: string[], i: number): void => {
                var cell: JQuery;
                row = <HTMLTableRowElement>body.insertRow();
                // checkbox cell
                cell = $(row.insertCell()).addClass('checkBoxCell')
                    .attr({'id': 'rowCBCell' + i, 'x': 0, 'y': i + 1});
                $('<input type="checkbox"/>')
                    .attr({'id': 'enableRow' + i, 'name': 'enableRow',})
                    .val(i.toString())
                    .prop('checked', this.activeRowFlags[i])
                    .appendTo(cell);
                this.rowCheckboxCells.push(cell[0]);

                ////////////////////
                // pulldown cell
                ////////////////////
                cell = $(row.insertCell()).addClass('pulldownCell')
                    .attr({'id': 'rowPCell' + i, 'x': 0, 'y': i + 1});
                // use existing setting, or use the last if rows.length > settings.length, or blank
                this.pulldownSettings[i] = this.pulldownSettings[i]
                    || this.pulldownSettings.slice(-1)[0] || 0;
                this.populatePulldown(
                    cell = $('<select>')
                        .attr({'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i})
                        .appendTo(cell),
                    pulldownOptions,
                    this.pulldownSettings[i]
                );
                this.pulldownObjects.push(cell[0]);

                /////////////////////
                // label cell
                ////////////////////
                cell = $(row.insertCell()).attr({'id': 'rowMCell' + i, 'x': 0, 'y': i + 1});
                $('<div>').text(gridRowMarkers[i]).appendTo(cell);
                this.rowLabelCells.push(cell[0]);

                /////////////////////////
                // the table data itself
                /////////////////////////
                this.dataCells[i] = [];
                values.forEach((value: string, x: number): void => {
                    var short: string;
                    value = short = value || '';
                    if (value.length > 32) {
                        short = value.substr(0, 31) + '…';
                    }
                    cell = $(row.insertCell()).attr({
                        'id': 'valCell' + x + '-' + i,
                        'x': x + 1,
                        'y': i + 1,
                        'title': value,
                        'isblank': value === '' ? 1 : undefined
                    });
                    $('<div>').text(short).appendTo(cell);
                    this.dataCells[i].push(cell[0]);
                });
            });

            lowerLegendId = 'step3LowerLegend';
            lowerLegend = $('#' + lowerLegendId);
            if (grid.length > IdentifyStructuresStep.DUPLICATE_LEGEND_THRESHOLD) {
                if (!lowerLegend.length) {
                    $('#step3UpperLegend')
                        .clone()
                        .attr('id', lowerLegendId)
                        .insertAfter('#dataTableDiv');
                }
            } else {
                lowerLegend.remove();
            }
            $('.step3Legend').toggleClass('off', grid.length === 0);
            this.applyTableDataTypeStyling(grid);
        }


        // A recursive function to populate a pulldown with optional optiongroups,
        // and a default selection
        populatePulldown(select: JQuery, options: RowPulldownOption[], value: number): void {
            options.forEach((option: RowPulldownOption): void => {
                if (typeof option[1] === 'number') {
                    let opt: number = <number> option[1];
                    $('<option>').text(option[0]).val(opt)
                        .prop('selected', option[1] === value)
                        .appendTo(select);
                } else {
                    let opts: RowPulldownOption[] = <RowPulldownOption[]>option[1];
                    this.populatePulldown(
                        $('<optgroup>').attr('label', option[0]).appendTo(select),
                        opts,
                        value
                    );
                }
            });
        }


        // This routine does a bit of additional styling to the Step 3 data table.
        // It removes and re-adds the dataTypeCell css classes according to the pulldown settings
        // for each row.
        applyTableDataTypeStyling(grid: any): void {

            grid.forEach((row: string[], index: number): void => {
                var pulldown: number, hlLabel: boolean, hlRow: boolean;
                pulldown = this.pulldownSettings[index] || 0;
                hlLabel = hlRow = false;
                if (pulldown === TypeEnum.Line_Names || pulldown === TypeEnum.Measurement_Types) {
                    hlRow = true;
                } else if (pulldown === TypeEnum.Timestamp ||
                    pulldown === TypeEnum.Metadata_Name ||
                    pulldown === TypeEnum.Protein_Name ||
                    pulldown === TypeEnum.Pubchem_Name ||
                    pulldown === TypeEnum.Gene_Name ||
                    pulldown === TypeEnum.Measurement_Type) {
                    hlLabel = true;
                }
                $(this.rowLabelCells[index]).toggleClass('dataTypeCell', hlLabel);
                row.forEach((_, col: number): void => {
                    $(this.dataCells[index][col]).toggleClass('dataTypeCell', hlRow);
                });
            });
        }


        redrawIgnoredGapMarkers(ignoreDataGaps: boolean): void {
            this.dataCells.forEach((row: HTMLElement[]): void => {

                row.forEach((cell: HTMLElement): void => {
                    var disabled: boolean =  !ignoreDataGaps && !!cell.getAttribute('isblank');
                    $(cell).toggleClass('disabledInput', disabled);
                });
            });
        }


        redrawEnabledFlagMarkers(): void {
            // loop over cells in the table, styling them as needed to show
            // ignored/interpretation-needed status
            this.dataCells.forEach((row: HTMLElement[], rowIndex: number): void => {
                var rowLabelCell: JQuery, pulldown: number, disableRow:boolean, ignoreRow:boolean;
                pulldown = this.pulldownSettings[rowIndex];
                disableRow = !this.activeRowFlags[rowIndex];
                rowLabelCell = $(this.rowLabelCells[rowIndex]);
                rowLabelCell.toggleClass('disabledInput', disableRow);

                row.forEach((cell: HTMLElement, colIndex: number): void => {
                    var cellJQ:JQuery, disableCell: boolean, ignoreCell: boolean;
                    disableCell = !this.activeFlags[rowIndex][colIndex]
                        || !this.activeColFlags[colIndex]
                        || !this.activeRowFlags[rowIndex];
                    cellJQ = $(cell);
                    cellJQ.toggleClass('disabledInput', disableCell);

                    // if the cell will be ignored because no selection has been made for its row,
                    // change the background so it's obvious that it won't be used
                    ignoreRow = (pulldown === IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE &&
                        !disableCell);
                    cellJQ.toggleClass('missingInterpretationRow', ignoreRow);
                    rowLabelCell.toggleClass('missingInterpretationRow', ignoreRow);
                });
            });

            // style table cells containing column checkboxes in the same way their content was
            // styled above
            this.colCheckboxCells.forEach((box: HTMLElement, x: number): void => {
                var toggle: boolean = !this.activeColFlags[x];
                $(box).toggleClass('disabledInput', toggle);
            });
        }


        changedRowDataTypePulldown(index: number, value: number): void {
            var selected: number;

            var grid = this.rawInputStep.getGrid();

            // The value does not necessarily match the selectedIndex.
            selected = this.pulldownObjects[index].selectedIndex;
            this.pulldownSettings[index] = value;
            this.pulldownUserChangedFlags[index] = true;
            if (value === TypeEnum.Timestamp ||
                value === TypeEnum.Metadata_Name ||
                value === TypeEnum.Measurement_Type ||
                value === TypeEnum.Protein_Name ||
                value === TypeEnum.Pubchem_Name ||
                value === TypeEnum.Gene_Name) {
                // "Timestamp", "Metadata", or other single-table-cell types
                // Set all the rest of the pulldowns to this,
                // based on the assumption that the first is followed by many others
                this.pulldownObjects.slice(index + 1).every(
                    (pulldown: HTMLSelectElement): boolean => {
                        var select: JQuery, i: number;
                        select = $(pulldown);
                        i = parseInt(select.attr('i'), 10);

                        // if user changed value for this pulldown, stop auto-selecting values for
                        // this and subsequent pulldowns
                        if (this.pulldownUserChangedFlags[i]
                            && this.pulldownSettings[i] !== 0) {
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
                if (value === TypeEnum.Measurement_Type ||
                    value === TypeEnum.Timestamp ||
                    value === TypeEnum.Metadata_Name) {

                    grid.forEach((_, i: number): void => {
                        var c: number = this.pulldownSettings[i];
                        if (value === TypeEnum.Measurement_Type) {
                            if (c === TypeEnum.Timestamp || c === TypeEnum.Metadata_Name) {
                                this.pulldownObjects[i].selectedIndex = 0;
                                this.pulldownSettings[i] = 0;
                            } else if (c === TypeEnum.Measurement_Types) {
                                // Can't allow "Measurement Types" setting either
                                this.pulldownObjects[i].selectedIndex = TypeEnum.Line_Names;
                                this.pulldownSettings[i] = TypeEnum.Line_Names;
                            }
                        } else if (c === TypeEnum.Measurement_Type &&
                            (value === TypeEnum.Timestamp || value === TypeEnum.Metadata_Name)) {
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
            var grid = this.rawInputStep.getGrid();
            this.applyTableDataTypeStyling(grid);
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            this.queueGraphRemake();
            this.nextStepCallback();
        }


        toggleTableRow(box: Element): void {
            var input: number | string, checkbox: JQuery, pulldown:JQuery;
            checkbox = $(box);
            pulldown = checkbox.next();
            input = parseInt(checkbox.val(), 10);
            var active = checkbox.prop('checked');
            this.activeRowFlags[input] = active;
            if(active) {
                pulldown.removeAttr('disabled');
            } else {
                pulldown.attr('disabled', 'disabled');
            }

            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            // Resetting a disabled row may change the number of rows listed in the Info table.
            this.queueGraphRemake();
            this.nextStepCallback();
        }


        toggleTableColumn(box: Element): void {
            var value: number | string, input: JQuery;
            input = $(box);
            value = parseInt(input.val(), 10);
            this.activeColFlags[value] = input.prop('checked');
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            // Resetting a disabled column may change the rows listed in the Info table.
            this.queueGraphRemake();
            this.nextStepCallback();
        }


        resetEnabledFlagMarkers(): void {

            var grid = this.rawInputStep.getGrid();

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
            $('#dataTableDiv').find('[name=enableColumn]').prop('checked', true);
            // Same for the checkboxes in the row label cells
            $('#dataTableDiv').find('[name=enableRow]').prop('checked', true);
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            this.queueGraphRemake();
            this.nextStepCallback();
        }


        interpretDataTable(): void {

            // This mode means we make a new "set" for each cell in the table, rather than
            // the standard method of making a new "set" for each column in the table.
            var singleMode: boolean;
            var singleCompatibleCount: number;
            var singleNotCompatibleCount: number;
            var earliestName: number;

            var grid = this.rawInputStep.getGrid();
            var gridRowMarkers = this.rawInputStep.gridRowMarkers;
            var ignoreDataGaps = this.rawInputStep.ignoreDataGaps;

            // We'll be accumulating these for disambiguation.
            var seenLineNames: {[id: string]: boolean} = {};
            var seenAssayNames: {[id: string]: boolean} = {};
            var seenMeasurementNames: {[id: string]: boolean} = {};
            var seenMetadataNames: {[id: string]: boolean} = {};
            var disamRawSets: any[] = [];

            // Here are the arrays we will use later
            this.parsedSets = [];
            this.graphSets = [];

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

                this.rawInputStep.processedSetsFromFile.forEach((rawSet, c: number): void => {
                    var set: RawImportSet,
                        graphSet: GraphingSet,
                        uniqueTimes: number[],
                        times: any,
                        foundMeta: boolean,
                        ln = rawSet.line_name,
                        an = rawSet.assay_name,
                        mn = rawSet.measurement_name;

                    uniqueTimes = [];
                    times = {};
                    foundMeta = false;

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

                    var reassembledData = [];

                    // Slightly different procedure for metadata, but same idea:
                    Object.keys(rawSet.metadata_by_name).forEach((key): void => {
                        var value = rawSet.metadata_by_name[key];
                        if (!seenMetadataNames[key]) {
                            seenMetadataNames[key] = true;
                            this.uniqueMetadataNames.push(key);
                        }
                        foundMeta = true;
                    });

                    // Validate the provided set of time/value points
                    rawSet.data.forEach((xy: any[]): void => {
                        var time: number, value: number;
                        if (xy[0] === null) {
                            // keep explicit null values
                            time = null;
                        } else if (!JSNumber.isFinite(xy[0])) {
                            // Sometimes people - or Excel docs - drop commas into large numbers.
                            time = parseFloat((xy[0] || '0').replace(/,/g, ''));
                        } else {
                            time = <number>xy[0];
                        }
                        // If we can't parse a usable timestamp, discard this point.
                        // NOTE: JSNumber.isNaN(null) === false
                        if (JSNumber.isNaN(time)) {
                            return;
                        }
                        if (!xy[1] && <Number>xy[1] !== 0) {
                            // If we're ignoring gaps, skip any undefined/null values.
                            // A null is our standard placeholder value
                            value = null;
                        } else if (!JSNumber.isFinite(xy[1])) {
                            value = parseFloat((xy[1] || '').replace(/,/g, ''));
                        } else {
                            value = <number>xy[1];
                        }
                        if (times[time] === undefined) {
                            times[time] = value;
                            uniqueTimes.push(time);
                            this.seenAnyTimestamps = time !== null;
                        }
                    });
                    uniqueTimes.sort((a, b) => a - b).forEach((time: number): void => {
                        reassembledData.push([time, times[time]]);
                    });

                    set = {
                        // Copy across the fields from the RawImportSet record
                        kind: rawSet.kind,
                        hint: rawSet.hint,
                        line_name: rawSet.line_name,
                        assay_name: an,
                        measurement_name: rawSet.measurement_name,
                        metadata_by_name: rawSet.metadata_by_name,
                        data: reassembledData
                    };
                    this.parsedSets.push(set);

                    graphSet = {
                        'label': (ln ? ln + ': ' : '') + an + ': ' + mn,
                        'name': mn,
                        'units': 'units',
                        'data': reassembledData
                    };
                    this.graphSets.push(graphSet);
                });
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
                var pulldown: number;
                if (!this.activeRowFlags[y]) { return; }    // Skip inactive rows
                pulldown = this.pulldownSettings[y];
                if (pulldown === TypeEnum.Measurement_Type ||
                        pulldown === TypeEnum.Protein_Name ||
                        pulldown === TypeEnum.Pubchem_Name ||
                        pulldown === TypeEnum.Gene_Name) {
                    singleCompatibleCount++; // Single Measurement Name or Single Protein Name
                } else if (pulldown === TypeEnum.Metadata_Name ||
                        pulldown === TypeEnum.Timestamp) {
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
            singleMode = (
                singleCompatibleCount > 0 &&
                singleNotCompatibleCount === 0 &&
                earliestName !== null
            );

            // A "set" for every cell of the table, with the timestamp to be determined later.
            if (singleMode) {

                this.colObjects.forEach((_, c: number): void => {
                    var cellValue: string;

                    if (!this.activeColFlags[c]) {
                        return;
                    }
                    cellValue = grid[earliestName][c] || '';
                    if (!cellValue) {
                        return;
                    }

                    // If haven't seen cellValue before, increment and store uniqueness index
                    if (!seenAssayNames[cellValue]) {
                        seenAssayNames[cellValue] = true;
                        this.uniqueAssayNames.push(cellValue);
                    }
                    grid.forEach((row: string[], r: number): void => {
                        var pulldown: number, label: string, value: string, timestamp: number;
                        var rawSet: RawImportSet;
                        var hint: string;
                        if (!this.activeRowFlags[r] || !this.activeFlags[r][c]) {
                            return;
                        }
                        pulldown = this.pulldownSettings[r];
                        label = gridRowMarkers[r] || '';
                        value = row[c] || '';
                        if (!pulldown || !label || !value) {
                            return;
                        }

                        var m_name: string = null;
                        if (pulldown === TypeEnum.Measurement_Type) {
                            if (!seenMeasurementNames[label]) {
                                seenMeasurementNames[label] = true;
                                this.uniqueMeasurementNames.push(label);
                            }
                            m_name = label;
                        } else if (pulldown === TypeEnum.Protein_Name ||
                                pulldown === TypeEnum.Pubchem_Name ||
                                pulldown === TypeEnum.Gene_Name) {
                            m_name = label;
                        } else {
                            // If we aren't on a row that's labeled as either a metabolite value
                            // or a protein value, return without making a set.
                            return;
                        }
                        switch (pulldown) {
                            case TypeEnum.Pubchem_Name:
                                hint = 'm';
                                this.uniquePubchem.push(m_name);
                                break;
                            case TypeEnum.Protein_Name:
                                hint = 'p';
                                this.uniqueUniprot.push(m_name);
                                break;
                            case TypeEnum.Gene_Name:
                                hint = 'g';
                                this.uniqueGenbank.push(m_name);
                                break;
                            default:
                                hint = null;
                                break;
                        }

                        rawSet = {
                            kind: this.selectMajorKindStep.interpretationMode,
                            hint: hint,
                            line_name: null,
                            assay_name: cellValue,
                            measurement_name: m_name,
                            metadata_by_name: {},
                            data:[[null, value]]
                        };

                        this.parsedSets.push(rawSet);
                    });
                });
                return;
            }

            // The standard method: Make a "set" for each column of the table

            this.colObjects.forEach((_, col: number): void => {
                var set: RawImportSet;
                var graphSet: GraphingSet;
                var uniqueTimes: number[];
                var times: any;
                var foundMeta: boolean;
                // Skip it if the whole column is deactivated
                if (!this.activeColFlags[col]) {
                    return;
                }

                var reassembledData = [];    // We'll fill this out as we go

                set = {
                    kind: this.selectMajorKindStep.interpretationMode,
                    hint: null,
                    line_name: null,
                    assay_name: null,
                    measurement_name: null,
                    metadata_by_name: {},
                    data: reassembledData,
                };

                uniqueTimes = [];
                times = {};
                foundMeta = false;
                grid.forEach((row: string[], r: number): void => {
                    var pulldown: number, label: string, value: string, timestamp: number;
                    if (!this.activeRowFlags[r] || !this.activeFlags[r][col]) {
                        return;
                    }
                    pulldown = this.pulldownSettings[r];
                    label = gridRowMarkers[r] || '';
                    value = row[col] || '';
                    if (!pulldown) {
                        return; // skip row if there's nothing selected in the pulldown
                    } else if (pulldown === TypeEnum.RPKM_Values) {
                        // Transcriptomics: RPKM values
                        value = value.replace(/,/g, '');
                        if (value) {
                            reassembledData.push([null, value]);
                        }
                        return;
                    } else if (pulldown === TypeEnum.Gene_Names) {
                        // Transcriptomics: Gene names
                        if (value) {
                            set.hint = 'g';
                            set.measurement_name = value;
                            this.uniqueGenbank.push(value);
                        }
                        return;
                    } else if (pulldown === TypeEnum.Timestamp) {
                        // Timestamps
                        label = label.replace(/,/g, '');
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
                    } else if (value === '') {
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
                    } else if (pulldown === TypeEnum.Measurement_Types) {   // Metabolite Names
                        // If haven't seen value before, increment and store uniqueness index
                        if (!seenMeasurementNames[value]) {
                            seenMeasurementNames[value] = true;
                            this.uniqueMeasurementNames.push(value);
                        }
                        set.measurement_name = value;
                        return;
                    } else if (label === '') {
                        return;
                    } else if (pulldown === TypeEnum.Metadata_Name) {   // Metadata
                        if (!seenMetadataNames[label]) {
                            seenMetadataNames[label] = true;
                            this.uniqueMetadataNames.push(label);
                        }
                        set.metadata_by_name[label] = value;
                        foundMeta = true;
                    }
                });
                uniqueTimes.sort((a, b) => a - b).forEach((time: number): void => {
                    reassembledData.push([time, times[time]]);
                });
                // only save if accumulated some data or metadata
                if (!uniqueTimes.length && !foundMeta && !reassembledData[0]) {
                    return;
                }

                this.parsedSets.push(set);

                graphSet = {
                    'label': 'Column ' + col,
                    'name': 'Column ' + col,
                    'units': 'units',
                    'data': reassembledData
                };
                this.graphSets.push(graphSet);
            });
        }


        highlighterF(e: JQueryMouseEventObject): void {
            var cell: JQuery, x: number, y: number;
            // Walk up the item tree until we arrive at a table cell,
            // so we can get the index of the table cell in the table.
            cell = $(e.target).closest('td');
            if (cell.length) {
                x = parseInt(cell.attr('x'), 10);
                y = parseInt(cell.attr('y'), 10);
                if (x) {
                    $(this.colObjects[x - 1]).toggleClass('hoverLines', e.type === 'mouseover');
                }
                if (y) {
                    cell.closest('tr').toggleClass('hoverLines', e.type === 'mouseover');
                }
            }
        }


        singleValueDisablerF(e: JQueryMouseEventObject): void {
            var cell: JQuery, x: number, y: number;
            // Walk up the item tree until we arrive at a table cell,
            // so we can get the index of the table cell in the table.
            cell = $(e.target).closest('td');
            if (!cell.length) {
                return;
            }
            x = parseInt(cell.attr('x'), 10);
            y = parseInt(cell.attr('y'), 10);
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
                clearTimeout(this.graphRefreshTimerID);
            }
            if (this.graphEnabled) {
                this.graphRefreshTimerID = setTimeout(this.remakeGraphArea.bind(this), 700);
            }
        }

        remakeGraphArea():void {
            let eddGraphing = new EDDGraphingTools(),
                mode = this.selectMajorKindStep.interpretationMode,
                sets = this.graphSets,
                graph = $('#graphDiv'),
                dataSets = []
                atdGraphing = new EDDATDGraphing();

            this.graphRefreshTimerID = 0;
            if (!atdGraphing || !this.graphEnabled) { return; }

            $('#processingStep2ResultsLabel').removeClass('off');

            atdGraphing.clearAllSets();

            // If we're not in either of these modes, drawing a graph is nonsensical.
            if ((mode === "std" || mode === 'biolector' || mode === 'hplc') && (sets.length > 0)) {
                graph.removeClass('off');
                sets.forEach(function(set) {
                    var singleAssayObj = eddGraphing.transformNewLineItem(EDDData, set);
                    dataSets.push(singleAssayObj);
                });
                atdGraphing.addNewSet(dataSets);
            } else {
                graph.addClass('off');
            }

            $('#processingStep2ResultsLabel').addClass('off');
        }

        getUserWarnings(): ImportMessage[] {
            return this.warningMessages;
        }

        getUserErrors(): ImportMessage[] {
            return this.errorMessages;
        }

        requiredInputsProvided(): boolean {
            var needPulldownSet: boolean;
            // require user input for every non-ignored row
            needPulldownSet = this.pulldownObjects.some((p: HTMLElement, row: number): boolean => {
                if (!this.activeRowFlags[row]) {
                    return false;
                } else {
                    return $(p).val() == IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE;
                }
            });
            $('#missingStep3InputDiv').toggleClass('off', !needPulldownSet);
            return !needPulldownSet && this.parsedSets.length > 0;
        }
    }


    // The class responsible for everything in the "Step 4" box that you see on the data
    // import page.
    export class TypeDisambiguationStep {

        identifyStructuresStep: IdentifyStructuresStep;

        // These objects hold string keys that correspond to unique names found during parsing.
        // The string keys point to existing autocomplete objects created specifically for
        // those strings.  Any selections the user has already set will be preserved,
        // even as the disambiguation section is destroyed and remade.

        masterAssaysOptionsDisplayedForProtocol: number;
        // For disambuguating Lines
        lineObjSets: { [index:string]: LineDisambiguationRow};
        currentlyVisibleLineObjSets: LineDisambiguationRow[];
        // For disambuguating Assays (really Assay/Line combinations)
        assayObjSets: { [index:string]: AssayDisambiguationRow};
        currentlyVisibleAssayObjSets: AssayDisambiguationRow[];
        // For disambuguating measurement types
        measurementObjSets: any;
        currentlyVisibleMeasurementObjSets: any[];
        // For disambuguating metadata
        metadataObjSets: { [index:string]: MetadataDisambiguationRow};

        selectMajorKindStep: SelectMajorKindStep;
        nextStepCallback: any;

        inputRefreshTimerID: number;

        thisStepInputTimerID:number;

        errorMessages:ImportMessage[];
        warningMessages:ImportMessage[];

        static STEP_4_USER_INPUT_CLASS: string = "step4_user_input";
        static STEP_4_REQUIRED_INPUT_CLASS: string = "step4_required_input";
        static STEP_4_TOGGLE_ROW_CHECKBOX: string = 'toggleAllButton';
        static STEP_4_TOGGLE_SUBSECTION_CLASS: string = 'step4SubsectionToggle';
        static STEP_4_SUBSECTION_REQUIRED_CLASS: string = 'step4RequiredSubsectionLabel';

        TOGGLE_ALL_THREASHOLD:number = 4;
        DUPLICATE_CONTROLS_THRESHOLD:number = 10;


        constructor(selectMajorKindStep: SelectMajorKindStep,
                identifyStructuresStep: IdentifyStructuresStep,
                nextStepCallback: any) {
            var reDoStepOnChange: string[], masterInputSelectors:string[];
            this.lineObjSets = {};
            this.assayObjSets = {};
            this.currentlyVisibleLineObjSets = [];
            this.currentlyVisibleAssayObjSets = [];
            this.measurementObjSets = {};
            this.currentlyVisibleMeasurementObjSets = [];
            this.metadataObjSets = {};
            this.masterAssaysOptionsDisplayedForProtocol = 0;

            this.selectMajorKindStep = selectMajorKindStep;
            this.identifyStructuresStep = identifyStructuresStep;
            this.nextStepCallback = nextStepCallback;
            this.errorMessages = [];
            this.warningMessages = [];

            // set up a listener to recreate the controls for this step based on a change to any
            // of the "master" inputs that requires rebuilding the form for this step.
            // Note that here and below we use 'input' since it makes the GUI more responsive
            // to user changes. A separate timer we've added prevents reprocessing the form too
            // many times.
            reDoStepOnChange = [
                '#masterAssay',
                '#masterLine',
                '#masterMComp',
                '#masterMType',
                '#masterMUnits'
            ];
            $(reDoStepOnChange.join(',')).on('input', this.changedAnyMasterPulldown.bind(this));

            //toggle matched assay section
            $('#matchedAssaysSection .discloseLink').on('click', function(e) {
                $(e.target).closest('.disclose').toggleClass('discloseHide');
            });

            masterInputSelectors = ['#masterTimestamp'].concat(reDoStepOnChange);
            $('#masterTimestamp').on('input', this.queueReparseThisStep.bind(this));
            $('#resetstep4').on('click', this.resetDisambiguationFields.bind(this));
            $(masterInputSelectors).addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);

            // mark all the "master" inputs (or for autocompletes, their paired hidden input) as
            // required input for this step. Note that some of the controls referenced here are
            // hidden inputs that are different from "masterInputSelectors" specified above.
            // Also note that the 'required input' marking will be ignored when each is
            // marked as invisible (even the type="hidden" ones)
            $('#masterTimestamp').addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            $("#masterLine").addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            $('#masterAssay').addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            $('#masterAssayLine').addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            $('#masterMCompValue').addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            $('#masterMTypeValue').addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            $('#masterMUnitsValue').addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);

            // enable autocomplete on statically defined fields
            EDDAuto.BaseAuto.initPreexisting($('#typeDisambiguationStep'));

            // set autofill callback for compartment/units
            ['.autocomp_compartment', '.autocomp_unit'].forEach((selector) => {
                var table: JQuery = $('#disambiguateMeasurementsTable');
                // when an autocomplete changes
                table.on('autochange', selector, (ev, visibleValue, hiddenValue) => {
                    var visibleInput: JQuery = $(ev.target);
                    // mark the changed autocomplete as user-set
                    visibleInput.data('userSetValue', true);
                    // then fill in all following autocompletes of same type
                    // until one is user-set
                    visibleInput.closest('tr').nextAll('tr').find(selector).each((i, element) => {
                        var following = $(element);
                        if (following.data('userSetValue')) {
                            return false;
                        }
                        following.val(visibleValue).next('input').val(hiddenValue);
                    });
                });
            });
        }

        setAllInputsEnabled(enabled: boolean) {
            var allUserInputs: JQuery = $("." + TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);

            allUserInputs.each(function (index: number, domElement: Element) {
                var input = $(domElement);
                if (enabled) {
                    input.removeAttr('disabled');
                } else {
                    input.attr('disabled', 'disabled');
                }
            });
        }

        previousStepChanged(): void {
            this.disableInputDuringProcessing();

            var assayIn: JQuery;
            var currentAssays: number[];
            var masterP = this.selectMajorKindStep.masterProtocol;

            // Recreate the master assay pulldown here instead of in remakeAssaySection()
            // because its options are NOT affected by changes to steps after #1, so it would be
            // pointless to remake it in response to them. We may show/hide
            // it based on other state, but its content won't change. RemakeAssaySection() is
            // called by reconfigure(), which is called when other UI in this step changes.
            if (this.masterAssaysOptionsDisplayedForProtocol != masterP) {
                this.masterAssaysOptionsDisplayedForProtocol = masterP;

                assayIn = $('#masterAssay').empty();
                $('<option>').text('(Create New)')
                    .appendTo(assayIn)
                    .val('named_or_new')
                    .prop('selected', true);
                currentAssays = ATData.existingAssays[masterP] || [];
                currentAssays.forEach((id: number): void => {
                    var assay = EDDData.Assays[id];
                    $('<option>').appendTo(assayIn).val('' + id).text(assay.name);
                });
                // Always reveal this, since the default for the Assay pulldown is always 'new'.
                $('#masterLineSpan').removeClass('off');
            }
            this.queueReconfigure();
        }

        // Start a timer to wait before calling the reconfigure routine. This way we condense
        // multiple possible events from the radio buttons and/or pulldown into one.
        queueReconfigure(): void {
           this.disableInputDuringProcessing();
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }

            // long timeout so we don't interfere with ongoing user edits
            this.inputRefreshTimerID = setTimeout(this.reconfigure.bind(this), 500);
        }


        queueReparseThisStep(): void {
            if (this.thisStepInputTimerID) {
                clearTimeout(this.thisStepInputTimerID);
            }
            this.thisStepInputTimerID = setTimeout(this.reparseThisStep.bind(this), 500);
        }

        // re-parses user inputs from this step to determine whether they've all been provided
        reparseThisStep(): void {
            this.createSetsForSubmission();
            this.nextStepCallback();
        }

        disableInputDuringProcessing():void {
            var hasRequiredInitialInputs = this.identifyStructuresStep.requiredInputsProvided();
            $('#emptyDisambiguationLabel').toggleClass('off', hasRequiredInitialInputs);
            $('#processingStep3Label').toggleClass('off', !hasRequiredInitialInputs);
            this.setAllInputsEnabled(false);
        }

        // Create the Step 4 tables:  Sets of rows, one for each y-axis column of values,
        // where the user can fill out additional information for the pasted table.
        reconfigure(): void {
            var mode: string,
                seenAnyTimestamps: boolean,
                hideMasterTimestamp: boolean,
                hasRequiredInitialInput: boolean;

            mode = this.selectMajorKindStep.interpretationMode;
            seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            hasRequiredInitialInput = this.identifyStructuresStep.requiredInputsProvided();

            // Hide all the subsections by default
            $('#masterTimestampDiv').addClass('off');
            $('#masterLineDiv').addClass('off');
            $('#masterAssayLineDiv').addClass('off');
            $('#masterMTypeDiv').addClass('off');
            $('#masterUnitDiv').addClass('off');
            $('#disambiguateLinesSection').addClass('off');
            $('#disambiguateAssaysSection').addClass('off');
            $('#matchedAssaysSection').addClass('off');
            $('#disambiguateMeasurementsSection').addClass('off');
            $('#disambiguateMetadataSection').addClass('off');

            // remove toggle buttons and labels dynamically added for some subsections
            // (easier than leaving them in place)
            $('.' + TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS).remove();
            $('.' + TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS).remove();

            // If parsed data exists, but we haven't seen a single timestamp, show the "master
            // timestamp" input.
            hideMasterTimestamp = !hasRequiredInitialInput || seenAnyTimestamps;
            $('#masterTimestampDiv').toggleClass('off', hideMasterTimestamp);
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
            $('.' + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS).on('input', ()=> {
               this.queueReparseThisStep();
            });

            $('#emptyDisambiguationLabel').toggleClass('off', hasRequiredInitialInput);
            $('#processingStep3Label').addClass('off');
            this.setAllInputsEnabled(true);

            this.reparseThisStep();
        }


        // TODO: This function should reset all the disambiguation fields to the values
        // that were auto-detected in the last refresh of the object.
        resetDisambiguationFields(): void {
            // Get to work!!
        }

        addToggleAllButton(parent: JQuery, objectsLabel: string): JQuery {
            return this.makeToggleAllButton(objectsLabel)
                .appendTo($(parent));
        }

        makeToggleAllButton(objectsLabel: string): JQuery {
            return $('<button type="button">')
                .text('Select None')
                .addClass(TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS)
                .on('click', this.toggleAllSubsectionItems.bind(this))
        }

        toggleAllSubsectionItems(ev: JQueryEventObject): void {
            var allSelected: boolean, checkboxes: JQuery, parentDiv: JQuery;

            parentDiv = $(ev.target).parent();
            allSelected = true;
            checkboxes = ($(parentDiv)
                .find('.' + TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX));

            checkboxes.toArray().some((elt: any): boolean => {
                var checkbox = $(elt);
                if (!checkbox.prop('checked')) {
                    allSelected = false;
                    return true;  // break; for the Array.some() loop
                }
                return false;
            });

            if (allSelected) {
                $(event.target).text('Select All')
            } else {
                $(event.target).text('Select None')
            }


            // un/check all checkboxes based on their previous state
            checkboxes.each((index: number, elt: Element) => {
                var checkbox = $(elt);
                checkbox.prop('checked', !allSelected);
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
            var body: HTMLTableElement,
                table: HTMLTableElement,
                hasRequiredInitialInputs: boolean,
                requiredInputText: string,
                uniqueLineNames,
                parentDiv;
            uniqueLineNames = this.identifyStructuresStep.uniqueLineNames;

            this.currentlyVisibleLineObjSets.forEach((disam:LineDisambiguationRow): void => {
                disam.detach();
            });
            $('#disambiguateLinesTable').remove();

            this.lineObjSets = {};

            if (uniqueLineNames.length === 0) {
                hasRequiredInitialInputs = this.identifyStructuresStep.requiredInputsProvided();
                $('#masterLineDiv').toggleClass('off', !hasRequiredInitialInputs);
                return;
            }

            this.currentlyVisibleLineObjSets = [];

            parentDiv = $('#disambiguateLinesSection');
            requiredInputText = 'At least one line is required.';
            this.addRequiredInputLabel(parentDiv, requiredInputText);

            if(uniqueLineNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.addToggleAllButton(parentDiv, 'Lines');
            }

            ///////////////////////////////////////////////////////////////////////////////////////
            // Set up the table and column headers
            ///////////////////////////////////////////////////////////////////////////////////////
            table = <HTMLTableElement>$('<table>')
                .attr({ 'id': 'disambiguateLinesTable', 'cellspacing': 0 })
                .appendTo(parentDiv.removeClass('off'))
                .on('change', 'select', (ev: JQueryInputEventObject): void => {
                    this.userChangedLineDisam(ev.target);
                })[0];
            let header = $('<thead>').appendTo(table);
            let headerCell = $('<th>').text('Line Imported').appendTo(header);
                headerCell = $('<th>').text('Line').appendTo(header);
                headerCell = $('<th>').text('Assays').appendTo(header);
            body = <HTMLTableElement>$('<tbody>').appendTo(table)[0];
            uniqueLineNames.forEach((name: string, i: number): void => {
                var disam: LineDisambiguationRow,
                    row: HTMLTableRowElement,
                    defaultSel: any,
                    cell: JQuery,
                    select: JQuery,
                disam = this.lineObjSets[name];
                if (!disam) {
                    disam = new LineDisambiguationRow(body, name, i);
                    this.lineObjSets[name] = disam;
                }
                disam.appendTo(body);
                this.currentlyVisibleLineObjSets.push(disam);
            });

            if (uniqueLineNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                this.addToggleAllButton(parentDiv, 'Lines');
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
            var avgRowCreationSeconds: number,
                maxRowCreationSeconds:number,
                masterProtocol: number,
                nColumns:number,
                nControls:number,
                nRows:number,
                parentDivMatched: JQuery,
                parentDivDisambiguate: JQuery,
                requiredInputText: string,
                tableMatched: HTMLTableElement,
                tableBodyMatched: HTMLTableElement,
                uniqueAssayNames: string[],
                totalRowCreationSeconds: number,
                childDivMatched: JQuery,
                matched: number,

            // gather up inputs from this and previous steps
            uniqueAssayNames = this.identifyStructuresStep.uniqueAssayNames;
            masterProtocol = this.selectMajorKindStep.masterProtocol;

            // remove stale data from previous run of this step
            this.currentlyVisibleAssayObjSets.forEach((disam:AssayDisambiguationRow): void => {
                disam.detach();
            });
            this.currentlyVisibleAssayObjSets = [];
            this.assayObjSets = {};

            //end early if there's nothing to display in this section
            if ((!this.identifyStructuresStep.requiredInputsProvided()) ||
                    this.identifyStructuresStep.parsedSets.length === 0) {
                return;
            }

            parentDivMatched = $('#matchedAssaysSection');
            childDivMatched = $('#matchedAssaysSectionBody');

            if (uniqueAssayNames.length === 0) {
                $('#masterAssayLineDiv').removeClass('off');
                return;
            }

            requiredInputText = 'At least one valid assay / line combination is required.';
            this.addRequiredInputLabel(childDivMatched, requiredInputText);

            if(uniqueAssayNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.addToggleAllButton(childDivMatched, 'Assays');
            }

            ///////////////////////////////////////////////////////////////////////////////////////
            // Create the table
            ///////////////////////////////////////////////////////////////////////////////////////

            // if there's already a table, remove it
            $('#matchedAssaysTable').remove();
            // remove rows of disambiguation table
            $('#disambiguateAssaysTable tbody').find('tr').remove();

            tableMatched = <HTMLTableElement>$('<table>')
                .attr({ 'id': 'matchedAssaysTable', 'cellspacing': 0 })
                .appendTo(childDivMatched)
                .on('change', 'select', (ev: JQueryInputEventObject): void => {
                    this.userChangedAssayDisam(ev.target);
                })[0];
            parentDivMatched.removeClass('off');
            let thead = $('<thead>');
            let tr = $('<tr>');
            $(tableMatched).append(thead);
            $(thead).append(tr);
            $(tr).append('<th></th>');
            $(tr).append('<th>User Input</th>');
            $(tr).append('<th>Line Name</th>');
            $(tr).append('<th>Assay Name</th>');

            tableBodyMatched = <HTMLTableElement>$('<tbody>').appendTo(tableMatched)[0];

            ///////////////////////////////////////////////////////////////////////////////////////
            // Create a table row for each unique assay name
            ///////////////////////////////////////////////////////////////////////////////////////

            nRows = 0;

            uniqueAssayNames.forEach((assayName: string, i: number): void => {
                var disam: AssayDisambiguationRow;
                disam = this.assayObjSets[assayName];
                if (!disam) {
                    disam = new AssayDisambiguationRow(tableBodyMatched, assayName, i);
                    nRows++;
                    this.assayObjSets[assayName] = disam;
                }
                if (disam.selectAssayJQElement) {
                    disam.selectAssayJQElement.data({ 'visibleIndex': i });
                    this.currentlyVisibleAssayObjSets.push(disam);
                }
            });

            if (uniqueAssayNames.length - 1) {
                let matched:number = $('#matchedAssaysSectionBody tr').length -1;
                let matchedLines:number = $('#matchedAssaysSectionBody tr option:selected')
                                            .text().split('Create New Assay').length -1;
                let matchedAssays:number = matched - matchedLines;
                if (matched === 0) {
                    $('#matchedAssaysSection').hide();
                } else {
                    $('#matchedAssaysSection').show();
                    if (matchedLines === 0) {
                        $('#matchedAssaysSection').find('.discloseLink')
                            .text(' Matched '+ matchedAssays + ' Assays')
                    } else if (matchedAssays === 0) {
                        $('#matchedAssaysSection').find('.discloseLink')
                            .text(' Matched '+ matchedLines + ' Lines')
                    } else {
                        $('#matchedAssaysSection').find('.discloseLink')
                            .text(' Matched ' + matchedLines + ' Lines and '
                                + matchedAssays + ' Assays')
                    }
                }
            }
        }


        addRequiredInputLabel(parentDiv: JQuery, text: string): JQuery {
            var adding = [
                TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS,
                'off',
                'missingSingleFormInput'
            ];
            return $('<div>').text(text)
                .addClass(adding.join(' '))
                .appendTo(parentDiv);
        }


        remakeMeasurementSection(): void {
            var body: HTMLTableElement,
                row: HTMLTableRowElement,
                bodyJq: JQuery,
                hasRequiredInitialInput: boolean,
                seenAnyTimestamps: boolean,
                mode: string,
                parentDiv: JQuery,
                uniqueMeasurementNames: any[],
                that: TypeDisambiguationStep = this;

            mode = this.selectMajorKindStep.interpretationMode;
            uniqueMeasurementNames = this.identifyStructuresStep.uniqueMeasurementNames;
            seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;

            hasRequiredInitialInput = this.identifyStructuresStep.requiredInputsProvided();

            parentDiv = $('#disambiguateMeasurementsSection')

            parentDiv.addClass('off');
            $('#masterMTypeDiv, #masterCompDiv, #masterUnitDiv').addClass('off');

            bodyJq = $('#disambiguateMeasurementsTable tbody');
            bodyJq.children().detach();

            this.currentlyVisibleMeasurementObjSets.forEach((disam:any): void => {
                disam.rowElementJQ.detach();
            });

            // If in 'Transcription' or 'Proteomics' mode, there are no measurement types needing
            // explicit disambiguation. Skip the measurement section, and provide statistics about
            // the gathered records.
            if (mode === "tr" || mode === "pr" || mode === "skyline") {
                return;
            }

            // If using the implicit IDs for measurements, need to specify units
            var needUnits: boolean = this.identifyStructuresStep.uniquePubchem.length > 0 ||
                    this.identifyStructuresStep.uniqueUniprot.length > 0 ||
                    this.identifyStructuresStep.uniqueGenbank.length > 0;
            // If using pubchem IDs, need to specify compartment
            var needComp: boolean = this.identifyStructuresStep.uniquePubchem.length > 0;
            if (hasRequiredInitialInput) {
                if (needUnits) {
                    $('#masterUnitDiv').removeClass('off')
                        .find('[name=masterUnits]')
                            .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                        .end()
                        .find('[name=masterUnitsValue]')
                            .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS)
                        .end();
                    if (needComp) {
                        $('#masterCompDiv').removeClass('off')
                            .find('[name=masterComp]')
                                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                            .end()
                            .find('[name=masterCompValue]')
                                .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS)
                            .end();
                    }
                    return;
                } else if (uniqueMeasurementNames.length === 0 && seenAnyTimestamps) {
                    // No measurements for disambiguation, have timestamp data: That means we
                    // need to choose one measurement. You might think that we should display
                    // this even without timestamp data, to handle the case where we are
                    // importing a single measurement type  for a single timestamp... But
                    // that would be a 1-dimensional import, since there is only one other
                    // object with multiple types to work with (lines/assays). We are not
                    // going to bother supporting that.
                    $('#masterMTypeDiv').removeClass('off');
                    return;
                }
            }

            if (uniqueMeasurementNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.makeToggleAllButton('Measurement Types')
                    .insertBefore($('#disambiguateMeasurementsTable'));
            }

            // put together a disambiguation section for measurement types
            body = <HTMLTableElement>(bodyJq[0]);
            this.currentlyVisibleMeasurementObjSets = [];   // For use in cascading user settings
            uniqueMeasurementNames.forEach((name: string, i: number): void => {
                var disam: any;
                var isMdv: boolean;
                var cls: string;
                disam = this.measurementObjSets[name];
                if (disam && disam.rowElementJQ) {
                    disam.appendTo(body);
                } else {
                    disam = new MeasurementDisambiguationRow(body, name, i);
                    this.measurementObjSets[name] = disam;
                }

                // If we're in MDV mode, the units pulldowns are irrelevant. Toggling
                // the hidden unit input controls whether it's treated as required.
                isMdv = mode === 'mdv';
                disam.unitsAuto.visibleInput.toggleClass('off', isMdv);
                disam.unitsAuto.hiddenInput.toggleClass('off', isMdv);

                // Set required inputs as required
                cls = TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS;
                disam.compAuto.hiddenInput.addClass(cls);
                disam.typeAuto.hiddenInput.addClass(cls);
                disam.unitsAuto.hiddenInput.toggleClass(cls, !isMdv);

                this.currentlyVisibleMeasurementObjSets.push(disam);
            });

            if(uniqueMeasurementNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                this.addToggleAllButton(parentDiv, 'Measurement Types');
            }

            this.checkAllMeasurementCompartmentDisam();
            $('#disambiguateMeasurementsSection').toggleClass(
                'off', uniqueMeasurementNames.length === 0 || !hasRequiredInitialInput
            );
        }


        remakeMetadataSection(): void {
            var body: HTMLTableElement,
                parentDiv: JQuery,
                row: HTMLTableRowElement,
                table: HTMLTableElement;

            var uniqueMetadataNames = this.identifyStructuresStep.uniqueMetadataNames;
            if (uniqueMetadataNames.length < 1) {
                return;
            }

            $('#disambiguateMetadataTable').remove();

            parentDiv = $('#disambiguateMetadataSection');

            if (uniqueMetadataNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.addToggleAllButton(parentDiv, 'Metadata Types');
            }

            // put together a disambiguation section for metadata
            table = <HTMLTableElement>$('<table>')
                .attr({ 'id': 'disambiguateMetadataTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateMetadataSection').removeClass('off'))
                .on('change', 'input', (ev: JQueryInputEventObject): void => {
                    // should there be event handling here ?
                })[0];
            body = <HTMLTableElement>$('<tbody>').appendTo(table)[0];
            uniqueMetadataNames.forEach((name: string, i: number): void => {
                var cell: HTMLTableCellElement, disam: any, ignoreLabel: JQuery,
                    ignoreChkbx: JQuery, typeDisambiguationStep: TypeDisambiguationStep;
                disam = this.metadataObjSets[name];
                if (disam && disam.rowElementJQ) {
                    disam.appendTo(body);
                } else {
                    disam = new MetadataDisambiguationRow(body, name, i);
                    this.metadataObjSets[name] = disam;
                }
                disam.metaAuto.visibleInput.attr('name', 'disamMeta' + i)
                    .addClass('autocomp_altype');
                disam.metaAuto.hiddenInput.attr('name', 'disamMetaHidden' + i);
            });

            if (uniqueMetadataNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                this.addToggleAllButton(parentDiv, 'Metadata Types');
            }

        }


        // We call this when any of the 'master' pulldowns are changed in Step 4.
        // Such changes may affect the available contents of some of the pulldowns in the step.
        changedAnyMasterPulldown(): void {
            // Show the master line dropdown if the master assay dropdown is set to new
            $('#masterLineSpan').toggleClass('off', $('#masterAssay').val() !== 'named_or_new');
            this.queueReconfigure();
        }


        // If the pulldown is being set to 'new', walk down the remaining pulldowns in the section,
        // in order, setting them to 'new' as well, stopping just before any pulldown marked as
        // being 'set by the user'.
        userChangedLineDisam(lineEl: Element):boolean {
            var changed: JQuery, v: number;
            changed = $(lineEl).data('setByUser', true);
            if (changed.val() !== 'new') {
                // stop here for anything other than 'new'; only 'new' cascades to
                // following pulldowns
                return false;
            }
            v = changed.data('visibleIndex') || 0;
            this.currentlyVisibleLineObjSets.slice(v).forEach((obj: any): void => {
                var textInput: JQuery = obj.lineAuto.visibleInput;
                if (textInput.data('setByUser')) {
                    return;
                }
                // set dropdown to 'new' and reveal the line autoselect
                textInput.val('new').next().removeClass('off');
            });
            return false;
        }


        // This function serves two purposes.
        // 1. If the given Assay disambiguation pulldown is being set to 'new', reveal the
        //    adjacent Line pulldown, otherwise hide it.
        // 2. If the pulldown is being set to 'new', walk down the remaining pulldowns in the
        //    section, in order, setting them to 'new' as well, stopping just before any pulldown
        //    marked as being 'set by the user'.
        userChangedAssayDisam(assayEl: Element):boolean {
            var changed: JQuery,
                v: number;
            changed = $(assayEl).data('setByUser', true);
            // The span with the corresponding Line pulldown is always right next to the
            // Assay pulldown
            changed.next().toggleClass('off', changed.val() !== 'named_or_new');
            if (changed.val() !== 'named_or_new') {
                // stop here for anything other than 'new'; only 'new' cascades to
                // following pulldowns
                return false;
            }
            v = changed.data('visibleIndex') || 0;
            this.currentlyVisibleAssayObjSets.slice(v).forEach((obj: any): void => {
                var assaySelect: JQuery = obj.selectAssayJQElement;
                if (assaySelect.data('setByUser')) {
                    return;
                }
                // set assay dropdown to 'new' and reveal the line autocomplete
                assaySelect.val('named_or_new').next().removeClass('off');
            });
            return false;
        }


        userChangedMeasurementDisam(element: Element):void {
            var auto:EDDAuto.BaseAuto;
            var hiddenInput: JQuery;
            var textInput: JQuery;
            var type: string;
            var rowIndex: number;
            var nextSets: any[];
            hiddenInput = $(element);
            // If this is missing we might as well throw an error
            auto = hiddenInput.data('edd').autocompleteobj;
            textInput = auto.visibleInput;
            type = auto.modelName;
            if (type === 'MeasurementCompartment' || type === 'MeasurementUnit') {
                rowIndex = textInput.data('setByUser', true).data('visibleIndex') || 0;

                if (rowIndex < this.currentlyVisibleMeasurementObjSets.length - 1) {
                    nextSets = this.currentlyVisibleMeasurementObjSets.slice(rowIndex + 1);
                    nextSets.some((obj: any): boolean => {
                        var following: any = $(obj[type]);
                        if (following.length === 0 || following.data('setByUser')) {
                            return true;  // break; for the Array.some() loop
                        }
                        // using placeholder instead of val to avoid triggering autocomplete change
                        following.attr('placeholder', textInput.val());
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
        checkAllMeasurementCompartmentDisam():void {
            var allSet: boolean, mode: string;
            mode = this.selectMajorKindStep.interpretationMode;

            allSet = this.currentlyVisibleMeasurementObjSets.every((obj: any): boolean => {
                var compAuto: EDDAuto.MeasurementCompartment = obj.compAuto;
                if (compAuto.visibleInput.data('setByUser')
                        || (compAuto.visibleInput.val() && compAuto.val() !== '0')) {
                    return true;
                }
                return false;
            });
            $('#noCompartmentWarning').toggleClass('off', mode !== 'mdv' || allSet);
        }


        /**
         * Reviews parsed data from Step 3 and applies decisions made in Step 4 to create the final
         * dataset for submission to the server. Note that some data may be omitted from submission
         * if the user has chosen to omit them (e.g. because of an undefined metadata type that
         * isn't required).
         * @returns {ResolvedImportSet[]}
         */
        createSetsForSubmission():ResolvedImportSet[] {
            var mode: string,
                masterProtocol: number,
                seenAnyTimestamps: boolean,
                droppedDatasetsForMissingTime: number,
                parsedSets: RawImportSet[],
                resolvedSets: ResolvedImportSet[],
                masterTime: any,
                masterLine: any,
                masterAssayLine: any,
                masterAssay: any,
                masterMType: any,
                masterMComp: any,
                masterMUnits: any,
                masterUnits: any,
                masterComp: any;
            this.errorMessages = [];
            this.warningMessages = [];

            // From Step 1
            mode = this.selectMajorKindStep.interpretationMode;
            // Cast 0 to null
            masterProtocol = this.selectMajorKindStep.masterProtocol || null;

            // From Step 3
            seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            parsedSets = this.identifyStructuresStep.parsedSets;

            // From this Step
            masterTime = parseFloat($('#masterTimestamp').val());
            masterLine = $('#masterLine').val();
            masterAssayLine = $('#masterAssayLine').val();
            masterAssay = $('#masterAssay').val();
            masterMType = $('#masterMTypeValue').val();
            masterMComp = $('#masterMCompValue').val();
            masterMUnits = $('#masterMUnitsValue').val();
            masterComp = $('#masterCompValue').val();
            masterUnits = $('#masterUnitsValue').val();

            resolvedSets = [];
            droppedDatasetsForMissingTime = 0;

            parsedSets.forEach((set: RawImportSet, setIndex: number): void => {
                var assayDisam: any,  // TODO: need types for the disam objects
                    assay_id: number | string,
                    assaySelect: JQuery,
                    compartmentId: string,
                    lineDisam: any,
                    lineId: number | string,
                    lineIdInput: JQuery,
                    measDisam: any,
                    metaDisam: any,
                    measurementTypeId: string,
                    unitsId: string,
                    resolvedData: (string | number)[][],
                    metaDataById: {[id:string]: string},
                    metaDataByName: {[name:string]: string},
                    metaDataPresent: boolean,
                    metaId: number,
                    resolvedSet: ResolvedImportSet;

                lineId = 'new';    // A convenient default
                assay_id = 'named_or_new';

                // In modes where we resolve measurement types in the client UI, go with the
                // master values by default.
                measurementTypeId = null;
                compartmentId = null;
                unitsId = null;
                if (this.identifyStructuresStep.uniquePubchem.length > 0 ||
                        this.identifyStructuresStep.uniqueUniprot.length > 0 ||
                        this.identifyStructuresStep.uniqueGenbank.length > 0) {
                    unitsId = masterUnits;
                    if (this.identifyStructuresStep.uniquePubchem.length > 0) {
                        compartmentId = masterComp;
                    }
                } else if (this.identifyStructuresStep.uniqueMeasurementNames.length === 0) {
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
                        lineDisam = this.lineObjSets[set.line_name];
                        if (lineDisam) {
                            lineIdInput = lineDisam.lineAuto.hiddenInput;

                            // if we've disabled import for the associated line, skip adding this
                            // measurement to the list
                            if (lineIdInput.prop('disabled')) {
                                return;  // continue to the next loop iteration parsedSets.forEach
                            }
                            lineId = lineIdInput.val();
                        }
                    }
                } else {
                    lineId = masterAssayLine;
                    assay_id = masterAssay;
                    if (set.assay_name !== null && masterProtocol) {
                        assayDisam = this.assayObjSets[set.assay_name];
                        if (assayDisam) {
                            assaySelect = assayDisam.selectAssayJQElement;
                            // if there is no assaySeelct, skip.
                            if (!assaySelect) {
                                return;
                            }
                            // if we've disabled import for this assay, skip adding this
                            // measurement to the list
                            if (assaySelect.is(':disabled')) {
                                return;  // continue to the next loop iteration parsedSets.forEach
                            }
                            assay_id = assaySelect.val();
                            lineIdInput = assayDisam.lineAuto.hiddenInput;
                            lineId = lineIdInput.val();
                        }
                    }
                }

                // Same for measurement name, but resolve all three measurement fields if we find
                // a match, and only if we are resolving measurement types client-side.
                measDisam = this.measurementObjSets[set.measurement_name];
                if (measDisam) {
                    measurementTypeId = measDisam.typeAuto.val();
                    compartmentId = measDisam.compAuto.val() || "0";
                    unitsId = measDisam.unitsAuto.val() || "1";
                    // If we've disabled import for measurements of this type, skip adding
                    // this measurement to the list
                    if (measDisam.typeAuto.hiddenInput.is(':disabled')) {
                        return;  // continue to the next loop iteration parsedSets.forEach
                    }
                }

                // Any metadata disambiguation fields that are left unresolved, will have their
                // metadata dropped from the import in this step, because this loop is building
                // key-value pairs where the key is the chosen database id of the metadata type.
                // No id == not added.
                metaDataById = {};
                metaDataByName = {};
                Object.keys(set.metadata_by_name).forEach((name):void => {
                    metaDisam = this.metadataObjSets[name];
                    if (metaDisam) {
                        metaId = metaDisam.metaAuto.val();
                        if (metaId && (!metaDisam.metaAuto.hiddenInput.is(':disabled'))) {
                            metaDataById[metaId] = set.metadata_by_name[name];
                            metaDataByName[name] = set.metadata_by_name[name];
                            metaDataPresent = true;
                        }
                    }
                });

                resolvedData = set.data;    // Ideally we would clone this.
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
                if (resolvedData.length < 1 && !metaDataPresent) { return; }

                resolvedSet = {
                    // Copy across the fields from the RawImportSet record
                    kind:              set.kind,
                    hint:              set.hint,
                    line_name:         set.line_name,
                    assay_name:        set.assay_name,
                    measurement_name:  set.measurement_name,
                    metadata_by_name:  metaDataByName,
                    data:              resolvedData,
                    // Add new disambiguation-specific fields
                    protocol_id:       masterProtocol,
                    line_id:           lineId,
                    assay_id:          assay_id,
                    measurement_id:    measurementTypeId,
                    compartment_id:    compartmentId,
                    units_id:          unitsId,
                    metadata_by_id:    metaDataById
                };
                resolvedSets.push(resolvedSet);
            });

            // log some debugging output if any data get dropped because of a missing timestamp
            if (droppedDatasetsForMissingTime) {
                if (parsedSets.length === droppedDatasetsForMissingTime) {
                    $("#masterTimestampRequiredPrompt").removeClass('off');
                } else {
                    var percentDropped = (droppedDatasetsForMissingTime / parsedSets.length) * 100;
                    var warningMessage = droppedDatasetsForMissingTime + " parsed datasets (" +
                        percentDropped + "%) were dropped because they were missing a timestamp.";
                    console.warn(warningMessage);
                    this.warningMessages.push(new ImportMessage(warningMessage))
                }
            } else {
                $("#masterTimestampRequiredPrompt").addClass('off');
            }
            return resolvedSets;
        }

        getUserWarnings():ImportMessage[] {
            return this.warningMessages;
        }

        getUserErrors():ImportMessage[] {
            return this.errorMessages;
        }

        requiredInputsProvided():boolean {
            var subsection: JQuery, requiredInputSubsectionSelectors: string[];
            // test that all required inputs currently visible / enabled on the form have a valid
            // value. Note: this check is very similar to, but distinct from, the one above.
            var allRequiredInputs = $('.' + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            for (let input_id of allRequiredInputs.toArray()) {
                var input = $(input_id);

                // if the input has no value, but wasn't hidden from the display by the 'off'
                // class, it's missing required data. Note that the "hidden" check below
                // will still allow <input type="hidden">, but will ignore inputs that have been
                // "hidden" by the "off" class directly to the input or one of its parents.
                if((!input.val()) && !(input.prop('disabled') || input.hasClass('off')
                    || input.parents('.off').length > 0) ) {
                    return false;
                }
            }
            return allRequiredInputs.length > 0;
        }
    }



    export class DisambiguationRow {

        row:HTMLTableRowElement;
        rowElementJQ:JQuery;
        ignoreCheckbox:JQuery;
        visibleIndex:number;

        constructor(body:HTMLTableElement, name, i) {
            this.visibleIndex = i;
            // First make a table row, and save a reference to it
            this.row = body.insertRow();
            this.rowElementJQ = $(this.row);
            this.addIgnoreCheckbox();

            // Next, add a table cell with the string we are disambiguating
            $('<div>').text(name).appendTo(this.row.insertCell());

            this.build(body, name, i);
        }


        // Empty base implementation for children to override
        build(body:HTMLTableElement, name, i) {


        }


        detach() {
            this.rowElementJQ.detach();
        }


        appendTo(body:HTMLTableElement) {
            this.rowElementJQ.appendTo(body);
        }


        addIgnoreCheckbox() {
            // ignore checkbox. allows import for buttoned up file formats (e.g. biolector,
            // HPLC) to selectively ignore parts of the input file that aren't necessary
            this.ignoreCheckbox = $('<input type="checkbox">')
                .prop('checked', true)
                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                .addClass(TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX)
                .appendTo(this.row.insertCell())
                .on('change', this.userChangedRowEnabled.bind(this));
        }


        userChangedRowEnabled(): void {
            DisambiguationRow.toggleTableRowEnabled(this.ignoreCheckbox);
            EDDTableImport.typeDisambiguationStep.queueReparseThisStep();
        }


        // get paired hidden / visible autocomplete inputs in the same table row as the checkbox
        // and enable/disable/require them as appropriate
        static toggleTableRowEnabled(checkbox: JQuery) {
            var enabled = checkbox.is(':checked');

            // iterate over cells in the row
            checkbox.parent().nextAll().each((index: number, elt: Element): void => {
                var tableCell: JQuery = $(elt);
                var cls: string = TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS;
                tableCell.toggleClass('disabledTextLabel', !enabled);

                // manage text input(s)
                // clear / disable the visible input so it doesn't get submitted with the form
                tableCell.find(':input').prop('disabled', !enabled);

                // manage hidden input(s)
                tableCell.find(':hidden').toggleClass(cls, enabled);

                // manage dropdowns
                tableCell.find('select').toggleClass(cls, enabled);
            });
        }
    }



    export class MetadataDisambiguationRow extends DisambiguationRow {

        metaAuto:EDDAuto.AssayLineMetadataType;

        // Cache for re-use of autocomplete objects
        static autoCache:any = {};


        build(body:HTMLTableElement, name, i) {

            this.metaAuto = new EDDAuto.AssayLineMetadataType({
                container: $(this.row.insertCell()),
                visibleValue: name,
                cache: MetadataDisambiguationRow.autoCache
            });
            this.metaAuto.visibleInput.addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                .attr('name', 'disamMeta' + i)
                .addClass('autocomp_altype');
            this.metaAuto.hiddenInput.addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                .attr('name', 'disamMetaHidden' + i);
        }
    }



    export class MeasurementDisambiguationRow extends DisambiguationRow {

        compAuto:EDDAuto.AssayLineMetadataType;
        typeAuto:EDDAuto.GenericOrMetabolite;
        unitsAuto:EDDAuto.MeasurementUnit;

        // Caches for re-use of autocomplete fields
        static compAutoCache:any = {};
        static metaboliteAutoCache:any = {};
        static unitAutoCache:any = {};


        build(body:HTMLTableElement, name, i) {

            this.compAuto = new EDDAuto.MeasurementCompartment({
                container:$(this.row.insertCell()),
                cache:MeasurementDisambiguationRow.compAutoCache
            });
            this.compAuto.visibleInput.addClass('autocomp_compartment');
            this.typeAuto = new EDDAuto.GenericOrMetabolite({
                container:$(this.row.insertCell()),
                cache:MeasurementDisambiguationRow.metaboliteAutoCache
            });
            this.unitsAuto = new EDDAuto.MeasurementUnit({
                container:$(this.row.insertCell()),
                cache:MeasurementDisambiguationRow.unitAutoCache
            });
            this.unitsAuto.visibleInput.addClass('autocomp_unit');

            // create autocompletes
            [this.compAuto, this.typeAuto, this.unitsAuto].forEach(
                (auto: EDDAuto.BaseAuto): void => {
                    auto.container.addClass('disamDataCell');
                    auto.visibleInput.addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
                    auto.hiddenInput.addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
                }
            );

            $(this.row).on('change', 'input[type=hidden]', (ev: JQueryInputEventObject): void => {
                // only watch for changes on the hidden portion, let autocomplete work
                EDDTableImport.typeDisambiguationStep.userChangedMeasurementDisam(ev.target);
            });
            EDDAuto.BaseAuto.initial_search(this.typeAuto, name);
        }
    }



    export class LineDisambiguationRow extends DisambiguationRow {

        lineAuto:EDDAuto.StudyLine;


        build(body:HTMLTableElement, name, i) {
            var defaultSel:any, cell:JQuery;
            cell = $(this.row.insertCell()).css('text-align', 'left');
            defaultSel = LineDisambiguationRow.disambiguateAnAssayOrLine(name, i);

            this.appendLineAutoselect(cell, defaultSel);
            this.lineAuto.visibleInput.data('visibleIndex', i);
        }


        appendLineAutoselect(parentElement:JQuery, defaultSelection): void {
            // create a text input to gather user input
            var lineInputId: string = 'disamLineInput' + this.visibleIndex,
                autoOptions: EDDAuto.AutocompleteOptions;

            autoOptions = {
                "container": parentElement,
                "hiddenValue": defaultSelection.lineID,
                "emptyCreatesNew": true,
                "nonEmptyRequired": false
            };
            // passes extra "active" parameter to line search
            this.lineAuto = new EDDAuto.StudyLine(autoOptions, {
                "active": 'true',
                "study": '' + EDDData.currentStudyID
            });

            //if there is a line name, auto fill line.
            $(this.lineAuto.container[0]).children('.autocomp').val(defaultSelection.name);

            this.lineAuto.visibleInput.data('setByUser', false)
                .attr('id', lineInputId)
                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);

            // create a hidden form field to store the selected value
            this.lineAuto.hiddenInput.attr('id', 'disamLine' + this.visibleIndex)
                .attr('name', 'disamLine' + this.visibleIndex)
                .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
        }


        static disambiguateAnAssayOrLine(assayOrLine: string, currentIndex: number):any {
            var startTime = new Date();
            var selections: any;
            var highest: number;
            var assays: number[];
            var protocol: number;
            selections = {
                lineID: 'new',
                assayID: 'named_or_new',
                match: false
            };
            highest = 0;
            // ATData.existingAssays is type {[index: string]: number[]}
            protocol = EDDTableImport.selectMajorKindStep.masterProtocol;
            assays = ATData.existingAssays[protocol] || [];
            assays.every((id: number): boolean => {
                var assay: AssayRecord = EDDData.Assays[id];
                if (assayOrLine.toLowerCase() === assay.name.toLowerCase()) {
                    // The full Assay name, even case-insensitive, is the best match
                    selections.assayID = id;
                    return false;  // do not need to continue
                }
                return true;
            });
            // Now we repeat the practice, separately, for the Line pulldown.
            highest = 0;
            // ATData.existingLines is type {id: number; name: string;}[]
            (ATData.existingLines || []).every((line: any): boolean => {
                if (assayOrLine.toLowerCase() === line.name.toLowerCase()) {
                    // The Line name, case-insensitive, is the best match
                    selections.lineID = line.id;
                    selections.name = line.name;
                    return false;  // do not need to continue
                }
                return true;
            });
            return selections;
        }
    }



    export class AssayDisambiguationRow extends LineDisambiguationRow {

        selectAssayJQElement:JQuery;

        build(body:HTMLTableElement, name, i) {
            var defaultSel:any, cell:JQuery, aSelect: JQuery;

            defaultSel = LineDisambiguationRow.disambiguateAnAssayOrLine(name, i);

            /////////////////////////////////////////////////////////////////////////////
            // Set up an autocomplete for the line (autocomplete is important for
            // efficiency for studies with many lines). Also add rows to disambiguated section
            /////////////////////////////////////////////////////////////////////////////
            if (!defaultSel.name) {
                var parentDiv = $('#disambiguateAssaysSection');
                var table = $('#disambiguateAssaysSection table');
                $(parentDiv).removeClass('off');
                $(this.row).find('input[type=checkbox]').prop('checked', false);
                $(table).append(this.row);
            } else {
                 /////////////////////////////////////////////////////////////////////////////
                // Set up a combo box for selecting the assay
                /////////////////////////////////////////////////////////////////////////////
                cell = $(this.row.insertCell()).css('text-align', 'left');

                // a table column to contain the text label for the Line pulldown, and the
                // pulldown itself
                cell = $('<td>').appendTo(cell);
                this.appendLineAutoselect(cell, defaultSel);
                //create another column
                let td = $(this.row.insertCell()).css('text-align', 'left');
                td = $('<td>').appendTo(td);
                aSelect = $('<select>').appendTo(td)
                    .data({ 'setByUser': false })
                    .attr('name', 'disamAssay' + i)
                    .attr('id', 'disamAssay' + i)
                    .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                    .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
                this.selectAssayJQElement = aSelect;
                $('<option>').text('(Create New Assay)').appendTo(aSelect).val('named_or_new')
                    .prop('selected', !defaultSel.assayID);

                // add options to the assay combo box
                let protocol: number = EDDTableImport.selectMajorKindStep.masterProtocol;
                (ATData.existingAssays[protocol] || []).forEach((id: any): void => {
                    var assay: AssayRecord, line: LineRecord, protocol: any;
                    assay = EDDData.Assays[id];
                    if (assay.id === defaultSel.assayID && defaultSel.lineID != 'new') {
                         $('<option>').text(assay.name)
                        .appendTo(aSelect).val(defaultSel.assayID.toString())
                        .prop('selected', defaultSel.assayID === defaultSel.assayID);
                    }
                });
            }
        }
    }



    // The class responsible for everything in the "Step 4" box that you see on the data import
    // page. Aggregates & displays a user-relevant/actionable summary of the import process prior
    // to final submission.
    export class ReviewStep {
        step1: SelectMajorKindStep;
        step2: RawInputStep;
        step3: IdentifyStructuresStep;
        step4: TypeDisambiguationStep;
        prevSteps: ImportStep[];
        nextStepCallback: any;

        warningMessages: ImportMessage[][];
        warningInputs: JQuery[][];

        errorMessages: ImportMessage[][];

        constructor(step1: SelectMajorKindStep, step2:RawInputStep,
                    step3: IdentifyStructuresStep,
                    step4: TypeDisambiguationStep, nextStepCallback: any) {
            this.step1 = step1;
            this.step2 = step2;
            this.step3 = step3;
            this.step4 = step4;
            this.prevSteps = [step1, step2, step3, step4];
            this.nextStepCallback = nextStepCallback;

            this.errorMessages = [];
            this.warningMessages = [];
            this.warningInputs = [];
            this.prevSteps.forEach((step:ImportStep, stepIndex:number):void => {
                this.warningInputs[stepIndex] =[];
            });
        }

        previousStepChanged(): void {
            // re-query each preceding step to get any errorMessages or warningMessages that
            // should be displayed to the user
            this.prevSteps.forEach((prevStep, stepIndex:number): void => {
                this.warningMessages[stepIndex] = [].concat(prevStep.getUserWarnings());
                this.errorMessages[stepIndex] = [].concat(prevStep.getUserErrors());
                this.warningInputs[stepIndex] =[];
            });

            // build up a short summary section to describe the (potentially large) number of
            // errors / warnings, as well as to give some generally helpful summary (e.g. counts).
            // for starters, we'll only show the summary section with a minimal one-sentence
            // that has directions, though clearly more stuff could be helpful later.
            var totalErrorsCount = this.getMessageCount(this.errorMessages);
            var totalWarningsCount = this.getMessageCount(this.warningMessages);
            var totalMessagesCount = totalErrorsCount + totalWarningsCount;

            var summaryDiv=$('#summaryContentDiv');
            summaryDiv.empty();

            var hasRequiredInitialInputs = this.arePrevStepRequiredInputsProvided();

            var summaryWrapperDiv = $('#reviewSummarySection');
            if (hasRequiredInitialInputs && !totalMessagesCount) {
                $('<p>').text('No errors or warnings! Go ahead and import!').appendTo(summaryDiv);
            }
            $('#completeAllStepsFirstLabel').toggleClass('off', hasRequiredInitialInputs);
            $('#submitForImport').toggleClass('off', !hasRequiredInitialInputs);

            // remake error / warning subsections based on input from previous steps
            var errorsWrapperDiv = $('#reviewErrorsSection');
            var errorsDiv = $('#reviewErrorsContentDiv');
            this.remakeErrorOrWarningSection(errorsWrapperDiv, errorsDiv, this.errorMessages,
                totalErrorsCount, "errorMessage", [], false);

            var warningsWrapperDiv = $('#reviewWarningsSection');
            var warningsDiv = $('#reviewWarningsContentDiv');
            this.remakeErrorOrWarningSection(warningsWrapperDiv, warningsDiv, this.warningMessages,
                totalWarningsCount, "warningMessage", this.warningInputs, true);

            this.updateSubmitEnabled();
        }

        arePrevStepRequiredInputsProvided():boolean {
            for(let prevStep of this.prevSteps) {
                if(!prevStep.requiredInputsProvided()) {
                    return false;
                }
            }
            return true;
        }

        // enable / disable the submit button, depending on whether submission is expected
        // to succeed based on data available in the UI
        updateSubmitEnabled():void {
            var allPrevStepInputsProvided = this.arePrevStepRequiredInputsProvided();
            var allWarningsAcknowledged = this.areAllWarningsAcknowledged();
            var totalErrorsCount = this.getMessageCount(this.errorMessages);

            var submitButton = $('#submitForImport');
            var wasDisabled = submitButton.prop('disabled');

            var disableSubmit = !(allPrevStepInputsProvided
                && totalErrorsCount === 0
                && allWarningsAcknowledged
            );
            submitButton.prop('disabled', disableSubmit);

            // TODO: re-enable me after upgrading to JQuery-UI 1.12+
            // briefly highlight the button if it was enabled/disabled
            // if((wasDisabled != disableSubmit) && allPrevStepInputsProvided) {
            //     submitButton.effect("bounce");
            // }
        }

        areAllWarningsAcknowledged(): boolean {
            for(let stepWarningInputs of this.warningInputs) {
                for(let warningChkbx of stepWarningInputs) {
                    if(!warningChkbx.is(':checked')) {
                        return false;
                    }
                }
            }
            return true;
        }

        getMessageCount(messagesByStep:ImportMessage[][]):number {
            var messageCount = 0;
            for (let stepMessages of messagesByStep) {
                messageCount += stepMessages.length;
            }
            return messageCount;
        }

        remakeErrorOrWarningSection(wrapperDivSelector:JQuery,
                contentDivSelector:JQuery,
                userMessages:ImportMessage[][],
                messageCount:number,
                messageCssClass:string,
                inputs:JQuery[][],
                createCheckboxes:boolean):void {
            var hasRequiredInitialInputs;
            var toggleOff;
            var showAcknowledgeAllBtn: boolean;
            var table;
            var tableBody;
            var header;
            var headerCell;
            contentDivSelector.empty();
            hasRequiredInitialInputs = this.arePrevStepRequiredInputsProvided();
            toggleOff = (messageCount === 0) || !hasRequiredInitialInputs;
            wrapperDivSelector.toggleClass('off', toggleOff);

            // clear all the subarrays containing input controls for prior steps
            // TODO: as a future enhancement, we could keep track of which are already
            // acknowledged and keep them checked
            for (let stepMsgInputs of inputs) {
                stepMsgInputs = []
            }

            // remove all the inputs from the DOM
            contentDivSelector.empty();

            if ((!hasRequiredInitialInputs) || (!messageCount)) {
                return;
            }

            // if showing checkboxes to acknowledge messages, add a button to ak all of them after
            // a reasonable number
            showAcknowledgeAllBtn = createCheckboxes && (messageCount >= 5);
             if(showAcknowledgeAllBtn) {
                this.addAcknowledgeAllButton(contentDivSelector);
            }

            table = $('<table>').appendTo(contentDivSelector);

            // if we will be adding checkboxes to the table, set headers to describe what
            // they are for
            if (createCheckboxes) {
                header = $('<thead>').appendTo(table);
                headerCell = $('<th>').text('Warning').appendTo(header);
                headerCell = $('<th>').text('Acknowledge').appendTo(header);
            }
            tableBody = $('<tbody>').appendTo(table)[0];

            userMessages.forEach((stepMessages:ImportMessage[], stepIndex:number):void => {
                stepMessages.forEach((message:ImportMessage):void => {
                    var row, cell, div, span, msgSpan, checkbox;
                    row = $('<tr>').appendTo(tableBody);
                    cell = $('<td>').css('text-align', 'left').appendTo(row);
                    div =  $('<div>').attr('class', messageCssClass).appendTo(cell);
                    span = $('<span class="warningStepLabel">').text("Step " + (stepIndex + 1))
                        .appendTo(div);
                    msgSpan = $('<span>').text(": " + message.message).appendTo(div);

                    if (!createCheckboxes) {
                        return;
                    }
                    cell = $('<td>').css('text-align', 'center')
                        .toggleClass('errorMessage', !createCheckboxes)
                        .appendTo(row);

                    checkbox = $('<input type="checkbox">').appendTo(cell);
                    this.warningInputs[stepIndex].push(checkbox);
                    checkbox.on('click', null, {
                        'div': div,
                        'checkbox': checkbox
                    }, (ev: JQueryMouseEventObject) => {
                        var div, checkbox;
                        div = ev.data.div;
                        checkbox = ev.data.checkbox;
                        this.userSelectedWarningButton(div, checkbox);
                    });
                }, this)
            });

            // if showing an 'Acknowledge All' button, repeat it at the bottom of the list
            if(showAcknowledgeAllBtn) {
                this.addAcknowledgeAllButton(contentDivSelector);
            }
        }

        addAcknowledgeAllButton(contentDivSelector:JQuery): void {
            var button = $('<input type="button">')
                .addClass("acknowledgeAllButton")
                .val('Acknowledge  All')
                .click( this.userSelectedAcknowledgeAllButton.bind(this));
            button.appendTo(contentDivSelector);
        }

        userSelectedWarningButton(div, checkbox):void {

            // make the message text appear disabled (note it's purposefully distinct
            // from the checkbox to allow flexibility in expanding table contents)
            div.toggleClass('disabledTextLabel', checkbox.is(':checked'));

            //update the submit button
            this.updateSubmitEnabled();
        }

        userSelectedAcknowledgeAllButton():void {
            // check whether all of the boxes are already checked
            var allSelected:boolean = true;
            for (let stepCheckboxes of this.warningInputs) {
                for (let checkbox of stepCheckboxes) {
                    if (!checkbox.is(':checked')) {
                        allSelected = false;
                        break;
                    }
                }
            }
            // check or uncheck all of the boxes (some checked will result in all being checked)
            for (let stepCheckboxes of this.warningInputs) {
                for (let checkbox of stepCheckboxes) {
                    checkbox.prop('checked', !allSelected);
                }
            }

            this.updateSubmitEnabled();
        }
    }
}


$(window).on('load', function() {
    EDDTableImport.onWindowLoad();
});
