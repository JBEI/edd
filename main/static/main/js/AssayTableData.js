// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="../typings/d3/d3.d.ts"/>
/// <reference path="AssayTableDataGraphing.ts" />
/// <reference path="EDDAutocomplete.ts" />
/// <reference path="Utl.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
JSNumber = Number;
JSNumber.isFinite = JSNumber.isFinite || function (value) {
    return typeof value === 'number' && isFinite(value);
};
JSNumber.isNaN = JSNumber.isNaN || function (value) {
    return value !== value;
};
// This module encapsulates all the custom code for the data import page.
// It consists primarily of a series of classes, each corresponding to a step in the import process,
// with a corresponding chunk of UI on the import page.
// Each class pulls data from one or more previous steps, does some internal processing,
// then triggers a callback function, announcing the availability of its own new data.
// The callback function triggers the instance of the next step.
var EDDTableImport;
(function (EDDTableImport) {
    'use strict';
    // Captures important information to be reviewed by the user in the final import step
    var ImportMessage = (function () {
        function ImportMessage(message, relatedControlSelector, reevaluateFunction) {
            if (relatedControlSelector === void 0) { relatedControlSelector = null; }
            if (reevaluateFunction === void 0) { reevaluateFunction = null; }
            this.message = message;
            this.relatedControlSelector = relatedControlSelector;
            this.reevaluateFunction = reevaluateFunction;
        }
        return ImportMessage;
    }());
    EDDTableImport.ImportMessage = ImportMessage;
    // As soon as the window load signal is sent, call back to the server for the set of reference records
    // that will be used to disambiguate labels in imported data.
    function onWindowLoad() {
        var atdata_url;
        atdata_url = "/study/" + EDDData.currentStudyID + "/assaydata";
        $('.disclose').find('a.discloseLink').on('click', EDDTableImport.disclose);
        // Populate ATData and EDDData objects via AJAX calls
        jQuery.ajax(atdata_url, {
            "success": function (data) {
                $.extend(ATData, data.ATData);
                $.extend(EDDData, data.EDDData);
                EDDTableImport.onReferenceRecordsLoad();
            }
        }).fail(function (x, s, e) {
            alert(s);
        });
    }
    EDDTableImport.onWindowLoad = onWindowLoad;
    // As soon as we've got and parsed the reference data, we can set up all the callbacks for the UI,
    // effectively turning the page "on".
    function onReferenceRecordsLoad() {
        var step1, step2, step3, step4, step5;
        //TODO: clarify reflected GUI state when waiting for large dataset from the server.
        // in several test cases with large #'s of lines, there's time for the user to reach a
        // later / confusing step in the process while waiting on this data to be returned.
        // Probably should fix this in EDD-182.
        $('#waitingForServerLabel').addClass('off');
        // Allocate one instance of each step, providing references to the previous steps as needed.
        step1 = new SelectMajorKindStep(EDDTableImport.selectMajorKindCallback);
        step2 = new RawInputStep(step1, EDDTableImport.rawInputCallback, EDDTableImport.processingFileCallback);
        step3 = new IdentifyStructuresStep(step1, step2, EDDTableImport.identifyStructuresCallback);
        step4 = new TypeDisambiguationStep(step1, step3, EDDTableImport.typeDisambiguationCallback);
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
    EDDTableImport.onReferenceRecordsLoad = onReferenceRecordsLoad;
    // This is called by our instance of selectMajorKindStep to announce changes.
    function selectMajorKindCallback() {
        // This is a bit of a hack.  We want to change the pulldown settings in Step 3 if the mode
        // in Step 1 is changed, but leave the pulldown alone otherwise (including when Step 2
        // announces its own changes.)
        // TODO: Make Step 3 track this with an internal variable.
        if (EDDTableImport.selectMajorKindStep.interpretationMode == 'mdv') {
            // A default set of pulldown settings for this mode
            EDDTableImport.identifyStructuresStep.pulldownSettings = [
                TypeEnum.Assay_Line_Names,
                TypeEnum.Measurement_Type
            ];
        }
        EDDTableImport.rawInputStep.previousStepChanged();
    }
    EDDTableImport.selectMajorKindCallback = selectMajorKindCallback;
    // This is called by our instance of Step 2, RawInputStep to announce changes.
    // We just pass the signal along to Step 3: IdentifyStructuresStep.
    function rawInputCallback() {
        EDDTableImport.identifyStructuresStep.previousStepChanged();
    }
    EDDTableImport.rawInputCallback = rawInputCallback;
    // This is called by our instance of Step 3, IdentifyStructuresStep to announce changes.
    // We just pass the signal along to Step 4: TypeDisambiguationStep.
    function identifyStructuresCallback() {
        EDDTableImport.typeDisambiguationStep.previousStepChanged();
    }
    EDDTableImport.identifyStructuresCallback = identifyStructuresCallback;
    // This is called by our instance of TypeDisambiguationStep to announce changes.
    // All we do currently is repopulate the debug area.
    function typeDisambiguationCallback() {
        EDDTableImport.reviewStep.previousStepChanged();
    }
    EDDTableImport.typeDisambiguationCallback = typeDisambiguationCallback;
    // tells step 3 that step 2 has just begun processing file input
    function processingFileCallback() {
        EDDTableImport.identifyStructuresStep.processingFileInPreviousStep();
    }
    EDDTableImport.processingFileCallback = processingFileCallback;
    function reviewStepCallback() {
        // nothing to do! no subsequent steps
    }
    EDDTableImport.reviewStepCallback = reviewStepCallback;
    // When the submit button is pushed, fetch the most recent record sets from our
    // IdentifyStructuresStep instance, and embed them in the hidden form field that will be
    // submitted to the server.
    // Note that this is not all that the server needs, in order to successfully process an
    // import. It also reads other form elements from the page, created by SelectMajorKindStep
    // and TypeDisambiguationStep.
    function submitForImport() {
        var json, resolvedSets;
        resolvedSets = EDDTableImport.typeDisambiguationStep.createSetsForSubmission();
        json = JSON.stringify(resolvedSets);
        $('#jsonoutput').val(json);
        $('#jsondebugarea').val(json);
    }
    EDDTableImport.submitForImport = submitForImport;
    // The usual click-to-disclose callback.  Perhaps this should be in Utl.ts?
    function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }
    EDDTableImport.disclose = disclose;
    var DEFAULT_MASTER_PROTOCOL = 'unspecified_protocol';
    // The class responsible for everything in the "Step 1" box that you see on the data import
    // page. Here we provide UI for selecting the major kind of import, and the Protocol that the
    // data should be stored under. These choices affect the behavior of all subsequent steps.
    var SelectMajorKindStep = (function () {
        function SelectMajorKindStep(nextStepCallback) {
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
            $(':radio[name=datalayout]', '#selectMajorKindStep').on('change', this.queueReconfigure.bind(this));
        }
        // Start a timer to wait before calling the reconfigure routine.
        // This way we condense multiple possible events from the radio buttons and/or pulldown into one.
        SelectMajorKindStep.prototype.queueReconfigure = function () {
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }
            this.inputRefreshTimerID = setTimeout(this.reconfigure.bind(this), 250);
        };
        // Read the settings out of the UI and pass along.
        // If the interpretation mode has changed, all the subsequent steps will need a refresh.
        // If the master Protocol pulldown has changed, Step 4 will need a refresh,
        // specifically the master Assay pulldown and Assay/Line disambiguation section.
        SelectMajorKindStep.prototype.reconfigure = function () {
            // Don't inline these into the if statement or the second one might not be called!
            var a = this.checkInterpretationMode();
            var b = this.checkMasterProtocol();
            if (a || b) {
                this.nextStepCallback();
            }
        };
        // If the interpretation mode value has changed, note the change and return 'true'.
        // Otherwise return 'false'.
        SelectMajorKindStep.prototype.checkInterpretationMode = function () {
            // Find every input element with the name attribute of 'datalayout' that's checked.
            // Should return 0 or 1 elements.
            var modeRadio = $("[name='datalayout']:checked");
            // If none of them are checked, we don't have enough information to handle any next steps.
            if (modeRadio.length < 1) {
                return false;
            }
            var radioValue = modeRadio.val();
            if (this.interpretationMode == radioValue) {
                return false;
            }
            this.interpretationMode = radioValue;
            return true;
        };
        // If the master Protocol pulldown value has changed, note the change and return 'true'.
        // Otherwise return 'false'.
        SelectMajorKindStep.prototype.checkMasterProtocol = function () {
            var protocolRaw = $('#masterProtocol').val();
            var p = (protocolRaw == DEFAULT_MASTER_PROTOCOL) ? 0 : parseInt(protocolRaw, 10);
            if (this.masterProtocol === p) {
                return false;
            }
            this.masterProtocol = p;
            return true;
        };
        SelectMajorKindStep.prototype.getUserWarnings = function () {
            return [];
        };
        SelectMajorKindStep.prototype.getUserErrors = function () {
            return [];
        };
        SelectMajorKindStep.prototype.requiredInputsProvided = function () {
            return this.masterProtocol != 0;
        };
        SelectMajorKindStep.prototype.previousStepChanged = function () {
            // no-op. no previous steps!
        };
        return SelectMajorKindStep;
    }());
    EDDTableImport.SelectMajorKindStep = SelectMajorKindStep;
    var NullProcessor = (function () {
        function NullProcessor() {
        }
        /// RawInputStep processor that does nothing.
        NullProcessor.prototype.parse = function (rawInputStep, rawData) {
            return {
                'input': [],
                'columns': 0
            };
        };
        NullProcessor.prototype.process = function (rawInputStep, input) {
        };
        return NullProcessor;
    }());
    var BaseRawTableProcessor = (function () {
        function BaseRawTableProcessor() {
        }
        /// Base processor for RawInputStep handles parsing a string into a 2D array
        BaseRawTableProcessor.prototype.parse = function (rawInputStep, rawData) {
            var rawText, delimiter, longestRow, rows, multiColumn;
            rawText = rawInputStep.rawText();
            delimiter = rawInputStep.separatorType() == 'csv' ? ',' : '\t';
            rows = [];
            // find the highest number of columns in a row
            longestRow = rawText.split(/[ \r]*\n/).reduce(function (prev, rawRow) {
                var row;
                if (rawRow !== '') {
                    row = rawRow.split(delimiter);
                    rows.push(row);
                    return Math.max(prev, row.length);
                }
                return prev;
            }, 0);
            // pad out rows so it is rectangular
            rows.forEach(function (row) {
                while (row.length < longestRow) {
                    row.push('');
                }
            });
            return {
                'input': rows,
                'columns': longestRow
            };
        };
        BaseRawTableProcessor.prototype.process = function (rawInputStep, input) {
        };
        return BaseRawTableProcessor;
    }());
    var MdvProcessor = (function (_super) {
        __extends(MdvProcessor, _super);
        function MdvProcessor() {
            _super.apply(this, arguments);
        }
        /// RawInputStep processor for MDV-formatted spreadsheets
        MdvProcessor.prototype.process = function (rawInputStep, parsed) {
            var rows, colLabels, compounds, orderedComp;
            colLabels = [];
            rows = parsed.input.slice(0); // copy
            // If this word fragment is in the first row, drop the whole row.
            // (Ignoring a Q of unknown capitalization)
            if (rows[0].join('').match(/uantitation/g)) {
                rows.shift();
            }
            compounds = {};
            orderedComp = [];
            rows.forEach(function (row) {
                var first, marked, name, index;
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
                        compounds[name] = { 'originalRows': {}, 'processedAssayCols': {} };
                        orderedComp.push(name);
                    }
                    compounds[name].originalRows[index] = row.slice(0);
                }
            });
            $.each(compounds, function (name, value) {
                var indices;
                // First gather up all the marker indexes given for this compound
                indices = $.map(value.originalRows, function (_, index) { return parseInt(index, 10); });
                indices.sort(function (a, b) { return a - b; }); // sort ascending
                // Run through the set of columnLabels above, assembling a marking number for each,
                // by drawing - in order - from this collected row data.
                colLabels.forEach(function (label, index) {
                    var parts, anyFloat;
                    parts = [];
                    anyFloat = false;
                    indices.forEach(function (ri) {
                        var original, cell;
                        original = value.originalRows[ri];
                        cell = original[index];
                        if (cell) {
                            cell = cell.replace(/,/g, '');
                            if (isNaN(parseFloat(cell))) {
                                if (anyFloat) {
                                    parts.push('');
                                }
                            }
                            else {
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
            Array.prototype.push.apply(rawInputStep.gridFromTextField, orderedComp.map(function (name) {
                var compound, row, colLookup;
                rawInputStep.gridRowMarkers.push(name);
                compound = compounds[name];
                row = [];
                colLookup = compound.processedAssayCols;
                // generate row cells by mapping column labels to processed columns
                Array.prototype.push.apply(row, colLabels.map(function (_, index) { return colLookup[index] || ''; }));
                return row;
            }));
        };
        return MdvProcessor;
    }(BaseRawTableProcessor));
    var StandardProcessor = (function (_super) {
        __extends(StandardProcessor, _super);
        function StandardProcessor() {
            _super.apply(this, arguments);
        }
        /// RawInputStep processor for standard tables with one header row and column
        StandardProcessor.prototype.process = function (rawInputStep, parsed) {
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
                rawInputStep.gridFromTextField = (parsed.input[0] || []).map(function (_, i) {
                    return parsed.input.map(function (row) { return row[i] || ''; });
                });
            }
            else {
                rawInputStep.gridRowMarkers = [];
                rawInputStep.gridFromTextField = (parsed.input || []).map(function (row) {
                    rawInputStep.gridRowMarkers.push(row.shift());
                    return row;
                });
            }
        };
        return StandardProcessor;
    }(BaseRawTableProcessor));
    // The class responsible for everything in the "Step 2" box that you see on the data import
    // page. It needs to parse the raw data from typing or pasting in the input box, or a
    // dragged-in file, into a null-padded rectangular grid that can be easily used by the next
    // step. Depending on the kind of import chosen in Step 1, this step will accept different
    // kinds of files, and handle the file drag in different ways.
    // For example, when the import kind is "Standard" and the user drags in a CSV file, the file
    // is parsed in-browser and the contents are placed in the text box.  When the import kind is
    // "biolector" and the user drags in an XML file, the file is sent to the server and parsed
    // there, and the resulting data is passed back to the browser and placed in the text box.
    var RawInputStep = (function () {
        function RawInputStep(selectMajorKindStep, nextStepCallback, processingFileCallBack) {
            this.haveInputData = false;
            this.processingFile = false; //true while the input is being processed (locally or remotely)
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
            // irritating Chrome inconsistency
            // For some of these, changing them shouldn't actually affect processing until we implement
            // an overwrite-checking feature or something similar
            $('#rawdataformatp').on('change', this.queueReprocessRawData.bind(this));
            $('#ignoreGaps').on('change', this.clickedOnIgnoreDataGaps.bind(this));
            $('#transpose').on('change', this.clickedOnTranspose.bind(this));
            $('#resetstep2').on('click', this.reset.bind(this));
            this.fileUploadProgressBar = new Utl.ProgressBar('fileUploadProgressBar');
            Utl.FileDropZone.create({
                elementId: "step2textarea",
                fileInitFn: this.fileDropped.bind(this),
                processRawFn: this.fileRead.bind(this),
                url: "/utilities/parsefile",
                processResponseFn: this.fileReturnedFromServer.bind(this),
                progressBar: this.fileUploadProgressBar
            });
            this.processingFileCallback = processingFileCallback;
            this.nextStepCallback = nextStepCallback;
        }
        // In practice, the only time this will be called is when Step 1 changes,
        // which may call for a reconfiguration of the controls in this step.
        RawInputStep.prototype.previousStepChanged = function () {
            var mode = this.selectMajorKindStep.interpretationMode;
            // update input visibility based on user selection in step 1
            this.updateInputVisible();
            // By default, our drop zone wants excel or csv files, so we clear the additional classes:
            $('#step2textarea').removeClass('xml text');
            if (mode === 'biolector') {
                // Biolector data is expected in XML format.
                $('#step2textarea').addClass('xml');
                // It is also expected to be dropped from a file.
                // So either we're already in file mode and there are already parsed sets available,
                // Or we are in text entry mode waiting for a file drop.
                // Either way there's no need to call reprocessRawData(), so we just push on to the next step.
                this.nextStepCallback();
                return;
            }
            if (mode === 'hplc') {
                // HPLC data is expected as a text file.
                $('#step2textarea').addClass('text');
                this.nextStepCallback();
                return;
            }
            if (mode === 'skyline') {
                this.nextStepCallback();
                return;
            }
            if (mode === 'mdv') {
                // When JBEI MDV format documents are pasted in, it's always from Excel, so they're always tab-separated.
                this.separatorType('tab');
                // We also never ignore gaps, or transpose, for MDV documents.
                this.ignoreGaps(false);
                this.transpose(false);
            }
            if (mode === 'std' || mode === 'tr' || mode === 'pr' || mode === 'mdv') {
                // If an excel file was dropped in, its content was pulled out and dropped into the text box.
                // The only reason we would want to still show the file info area is if we are currently in the middle
                // of processing a file and haven't yet received its worksheets from the server.
                // We can determine that by checking the status of any existing FileDropZoneFileContainer.
                // If it's stale, we clear it so the user can drop in another file.
                if (this.activeDraggedFile) {
                    if (this.activeDraggedFile.allWorkFinished) {
                        this.clearDropZone();
                    }
                }
                this.queueReprocessRawData();
            }
        };
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        RawInputStep.prototype.queueReprocessRawData = function () {
            var delay;
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
        };
        RawInputStep.prototype.getProcessorForMode = function (mode) {
            var processor;
            if (['std', 'tr', 'pr'].indexOf(mode) != -1) {
                processor = new StandardProcessor();
            }
            else if ('mdv' === mode) {
                processor = new MdvProcessor();
            }
            else {
                processor = new NullProcessor();
            }
            return processor;
        };
        // processes raw user input entered directly into the text area
        RawInputStep.prototype.reprocessRawData = function () {
            var mode, delimiter, processor, input;
            mode = this.selectMajorKindStep.interpretationMode;
            this.ignoreGaps(); // TODO: Are these necessary?
            this.transpose();
            this.separatorType();
            this.gridFromTextField = [];
            this.gridRowMarkers = [];
            processor = this.getProcessorForMode(mode);
            input = processor.parse(this, this.rawText());
            processor.process(this, input);
            this.processingFile = false;
            this.nextStepCallback();
        };
        // Here, we take a look at the type of the dropped file and decide whether to
        // send it to the server, or process it locally.
        // We inform the FileDropZone of our decision by setting flags in the fileContiner object,
        // which will be inspected when this function returns.
        RawInputStep.prototype.fileDropped = function (fileContainer) {
            this.haveInputData = true;
            processingFileCallback();
            var mode = this.selectMajorKindStep.interpretationMode;
            fileContainer.extraHeaders['Import-Mode'] = mode;
            var ft = fileContainer.fileType;
            // We'll process csv files locally.
            if ((ft === 'csv' || ft === 'txt') &&
                (mode === 'std' || mode === 'tr' || mode === 'pr')) {
                fileContainer.skipProcessRaw = false;
                fileContainer.skipUpload = true;
            }
            else if ((ft === 'csv' || ft === 'txt') && (mode === 'skyline')) {
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
            }
            else if ((ft === 'xlsx') && (mode === 'std' ||
                mode === 'tr' ||
                mode === 'pr' ||
                mode === 'mdv' ||
                mode === 'skyline')) {
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
            }
            else if ((ft === 'csv' || ft === 'txt') &&
                (mode === 'hplc')) {
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
            }
            else if (ft === 'xml' && mode === 'biolector') {
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
            }
            else {
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = true;
            }
            if (!fileContainer.skipProcessRaw || !fileContainer.skipUpload) {
                this.showFileDropped(fileContainer);
            }
        };
        // This function is passed the usual fileContainer object, but also a reference to the
        // full content of the dropped file.  So, for example, in the case of parsing a csv file,
        // we just drop that content into the text box and we're done.
        RawInputStep.prototype.fileRead = function (fileContainer, result) {
            this.haveInputData = true;
            processingFileCallback();
            if (fileContainer.fileType === 'csv') {
                // Since we're handling this format entirely client-side, we can get rid of the
                // drop zone immediately.
                fileContainer.skipUpload = true;
                this.clearDropZone();
                this.rawText(result);
                this.inferSeparatorType();
                this.reprocessRawData();
                return;
            }
        };
        // This is called upon receiving a response from a file upload operation, and unlike
        // fileRead() above, is passed a processed result from the server as a second argument,
        // rather than the raw contents of the file.
        RawInputStep.prototype.fileReturnedFromServer = function (fileContainer, result) {
            var mode = this.selectMajorKindStep.interpretationMode;
            // Whether we clear the file info area entirely, or just update its status,
            // we know we no longer need the 'sending' status.
            $('#fileDropInfoSending').addClass('off');
            if (mode === 'biolector' || mode === 'hplc' || mode === 'skyline') {
                var data, count, points;
                data = result.file_data;
                count = data.length;
                points = data.map(function (set) { return set.data.length; }).reduce(function (acc, n) { return acc + n; }, 0);
                $('<p>').text('Found ' + count + ' measurements with ' + points + ' total data points.').appendTo($("#fileDropInfoLog"));
                this.processedSetsFromFile = data;
                this.processedSetsAvailable = true;
                this.processingFile = false;
                // Call this directly, skipping over reprocessRawData() since we don't need it.
                this.nextStepCallback();
                return;
            }
            if (fileContainer.fileType == "xlsx") {
                this.clearDropZone();
                var ws = result.file_data["worksheets"][0];
                var table = ws[0];
                var csv = [];
                if (table.headers) {
                    csv.push(table.headers.join());
                }
                csv = csv.concat(table.values.map(function (row) { return row.join(); }));
                this.separatorType('csv');
                this.rawText(csv.join('\n'));
                this.reprocessRawData();
                return;
            }
        };
        RawInputStep.prototype.updateInputVisible = function () {
            var missingStep1Inputs = !this.selectMajorKindStep.requiredInputsProvided();
            $('#completeStep1Label').toggleClass('off', !missingStep1Inputs);
            $('#step2textarea').toggleClass('off', missingStep1Inputs);
        };
        // Reset and hide the info box that appears when a file is dropped,
        // and reveal the text entry area
        // This also clears the "processedSetsAvailable" flag because it assumes that
        // the text entry area is now the preferred data source for subsequent steps.
        RawInputStep.prototype.clearDropZone = function () {
            this.updateInputVisible();
            $('#fileDropInfoArea').addClass('off');
            $('#fileDropInfoSending').addClass('off');
            $('#fileDropInfoName').empty();
            $('#fileDropInfoLog').empty();
            // If we have a currently tracked dropped file, set its flags so we ignore any callbacks,
            // before we forget about it.
            if (this.activeDraggedFile) {
                this.activeDraggedFile.stopProcessing = true;
            }
            this.activeDraggedFile = null;
            this.processedSetsAvailable = false;
        };
        // Reset and show the info box that appears when a file is dropped,
        // and reveal the text entry area.
        RawInputStep.prototype.showFileDropped = function (fileContainer) {
            var processingMessage = '';
            // Set the icon image properly
            $('#fileDropInfoIcon').removeClass('xml');
            $('#fileDropInfoIcon').removeClass('text');
            $('#fileDropInfoIcon').removeClass('excel');
            if (fileContainer.fileType === 'xml') {
                $('#fileDropInfoIcon').addClass('xml');
            }
            else if (fileContainer.fileType === 'xlsx') {
                $('#fileDropInfoIcon').addClass('excel');
            }
            else if (fileContainer.fileType === 'plaintext') {
                $('#fileDropInfoIcon').addClass('text');
            }
            $('#step2textarea').addClass('off');
            $('#fileDropInfoArea').removeClass('off');
            $('#fileDropInfoSending').removeClass('off');
            $('#fileDropInfoName').text(fileContainer.file.name);
            if (!fileContainer.skipUpload) {
                processingMessage = 'Sending ' + Utl.JS.sizeToString(fileContainer.file.size) + ' To Server...';
                $('#fileDropInfoLog').empty();
            }
            else if (!fileContainer.skipProcessRaw) {
                processingMessage = 'Processing ' + Utl.JS.sizeToString(fileContainer.file.size) + '...';
                $('#fileDropInfoLog').empty();
            }
            $('#fileUploadMessage').text(processingMessage);
            this.activeDraggedFile = fileContainer;
        };
        RawInputStep.prototype.reset = function () {
            this.haveInputData = false;
            this.clearDropZone();
            this.rawText('');
            this.reprocessRawData();
        };
        RawInputStep.prototype.inferTransposeSetting = function (rows) {
            // as a user convenience, support the only known use-case for proteomics -- taking
            // "short and fat" output from the skyline import tool as input. TODO: reconsider
            // this when integrating the Skyline tool into the import page (EDD-240).
            if (this.selectMajorKindStep.interpretationMode === 'pr') {
                this.transpose(true);
                return;
            }
            // The most straightforward method is to take the top row, and the first column,
            // and analyze both to see which one most likely contains a run of timestamps.
            // We'll also do the same for the second row and the second column, in case the
            // timestamps are underneath some other header.
            var arraysToAnalyze, arraysScores, setTranspose;
            // Note that with empty or too-small source data, these arrays will either remain
            // empty, or become 'null'
            arraysToAnalyze = [
                rows[0] || [],
                rows[1] || [],
                (rows || []).map(function (row) { return row[0]; }),
                (rows || []).map(function (row) { return row[1]; }) // Second column
            ];
            arraysScores = arraysToAnalyze.map(function (row, i) {
                var score = 0, prev, nnPrev;
                if (!row || row.length === 0) {
                    return 0;
                }
                prev = nnPrev = undefined;
                row.forEach(function (value, j, r) {
                    var t;
                    if (value) {
                        t = parseFloat(value.replace(/,/g, ''));
                    }
                    if (!isNaN(t)) {
                        if (!isNaN(prev) && t > prev) {
                            score += 2;
                        }
                        else if (!isNaN(nnPrev) && t > nnPrev) {
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
            }
            else {
                setTranspose = arraysScores[1] > arraysScores[3];
            }
            this.transpose(setTranspose);
        };
        RawInputStep.prototype.inferGapsSetting = function () {
            // Count the number of blank values at the end of each column
            // Count the number of blank values in between non-blank data
            // If more than three times as many as at the end, default to ignore gaps
            var intra = 0, extra = 0;
            this.gridFromTextField.forEach(function (row) {
                var notNull = false;
                // copy and reverse to loop from the end
                row.slice(0).reverse().forEach(function (value) {
                    if (!value) {
                        notNull ? ++extra : ++intra;
                    }
                    else {
                        notNull = true;
                    }
                });
            });
            var result = extra > (intra * 3);
            this.ignoreGaps(result);
        };
        // This gets called when there is a paste event.
        RawInputStep.prototype.pastedRawData = function () {
            // We do this using a timeout so the rest of the paste events fire, and get the pasted result.
            this.haveInputData = true;
            window.setTimeout(this.inferSeparatorType.bind(this), 1);
        };
        RawInputStep.prototype.inferSeparatorType = function () {
            if (this.selectMajorKindStep.interpretationMode !== "mdv") {
                var text, test;
                text = this.rawText() || '';
                test = text.split('\t').length >= text.split(',').length;
                this.separatorType(test ? 'tab' : 'csv');
            }
        };
        RawInputStep.prototype.ignoreGaps = function (value) {
            var ignoreGaps = $('#ignoreGaps');
            if (value === undefined) {
                value = ignoreGaps.prop('checked');
            }
            else {
                ignoreGaps.prop('checked', value);
            }
            return (this.ignoreDataGaps = value);
        };
        RawInputStep.prototype.transpose = function (value) {
            var transpose = $('#transpose');
            if (value === undefined) {
                value = transpose.prop('checked');
            }
            else {
                transpose.prop('checked', value);
            }
            return (this.transposed = value);
        };
        RawInputStep.prototype.separatorType = function (value) {
            var separatorPulldown = $('#rawdataformatp');
            if (value === undefined) {
                value = separatorPulldown.val();
            }
            else {
                separatorPulldown.val(value);
            }
            return (this.separator = value);
        };
        RawInputStep.prototype.rawText = function (value) {
            var rawArea = $('#step2textarea');
            if (value === undefined) {
                value = rawArea.val();
            }
            else {
                rawArea.val(value);
            }
            return value;
        };
        RawInputStep.prototype.clickedOnIgnoreDataGaps = function () {
            this.userClickedOnIgnoreDataGaps = true;
            this.reprocessRawData(); // This will take care of reading the status of the checkbox
        };
        RawInputStep.prototype.clickedOnTranspose = function () {
            this.userClickedOnTranspose = true;
            this.reprocessRawData();
        };
        // This handles insertion of a tab into the textarea.
        // May be glitchy.
        RawInputStep.prototype.suppressNormalTab = function (e) {
            var input, text, selStart, selEnd;
            this.haveInputData = true;
            if (e.which === 9) {
                input = e.target;
                // These need to be read out before they are destroyed by altering the value of the element.
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
        };
        RawInputStep.prototype.getGrid = function () {
            return this.gridFromTextField;
        };
        RawInputStep.prototype.getUserWarnings = function () {
            return [];
        };
        RawInputStep.prototype.getUserErrors = function () {
            return [];
        };
        RawInputStep.prototype.requiredInputsProvided = function () {
            return this.selectMajorKindStep.requiredInputsProvided() && this.haveInputData;
        };
        return RawInputStep;
    }());
    EDDTableImport.RawInputStep = RawInputStep;
    // Magic numbers used in pulldowns to assign types to rows/fields.
    var TypeEnum = (function () {
        function TypeEnum() {
        }
        TypeEnum.Gene_Names = 10;
        TypeEnum.RPKM_Values = 11;
        TypeEnum.Assay_Line_Names = 1;
        TypeEnum.Protein_Name = 12;
        TypeEnum.Measurement_Types = 2; // plural!!
        TypeEnum.Timestamp = 3;
        TypeEnum.Metadata_Name = 4;
        TypeEnum.Measurement_Type = 5; // singular!!
        return TypeEnum;
    }());
    EDDTableImport.TypeEnum = TypeEnum;
    // The class responsible for everything in the "Step 3" box that you see on the data import page.
    // Get the grid from the previous step, and draw it as a table with puldowns for specifying the content
    // of the rows and columns, as well as checkboxes to enable or disable rows or columns.
    // Interpret the current grid and the settings on the current table into EDD-friendly sets.
    var IdentifyStructuresStep = (function () {
        function IdentifyStructuresStep(selectMajorKindStep, rawInputStep, nextStepCallback) {
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
            this.uniqueMetadataNames = [];
            // A flag to indicate whether we have seen any timestamps specified in the import data
            this.seenAnyTimestamps = false;
            this.selectMajorKindStep = selectMajorKindStep;
            this.nextStepCallback = nextStepCallback;
            this.warningMessages = [];
            this.errorMessages = [];
            $('#dataTableDiv')
                .on('mouseover mouseout', 'td', this.highlighterF.bind(this))
                .on('dblclick', 'td', this.singleValueDisablerF.bind(this));
            $('#resetstep3').on('click', this.resetEnabledFlagMarkers.bind(this));
        }
        // called to inform this step that the immediately preceding step has begun processing
        // its inputs. The assumption is that the processing is taking place until the next call to
        // previousStepChanged().
        IdentifyStructuresStep.prototype.processingFileInPreviousStep = function () {
            $('#processingStep2ResultsLabel').removeClass('off');
            $('#enterDataInStep2').addClass('off');
            $('#dataTableDiv').find("input,button,textarea,select").attr("disabled", "disabled");
        };
        IdentifyStructuresStep.prototype.previousStepChanged = function () {
            var _this = this;
            var prevStepComplete, ignoreDataGaps, showDataTable, showGraph, mode, graph, gridRowMarkers, grid;
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
                gridRowMarkers.forEach(function (value, i) {
                    var type;
                    if (!_this.pulldownUserChangedFlags[i]) {
                        type = _this.figureOutThisRowsDataType(mode, value, grid[i] || []);
                        // If we can no longer guess the type, but this pulldown was previously set
                        // to a non-zero value automatically or by an auto-fill operation,
                        // we preserve the old setting.  This prevents in-place edits from
                        // blanking out previous selections in Step 3.
                        _this.pulldownSettings[i] = type || _this.pulldownSettings[i] || 0;
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
            }
            else if (!showGraph) {
                $('#dataTableDiv').text('This step is not needed for the current import. ' +
                    'Nothing to see here, proceed to Step 4.');
            }
            // Either we're interpreting some pre-processed data sets from a server response,
            // or we're interpreting the data table we just laid out above,
            // which involves skipping disabled rows or columns, optionally ignoring blank values, etc.
            this.interpretDataTable();
            // Start a delay timer that redraws the graph from the interpreted data.
            // This is rather resource intensive, so we're delaying a bit, and restarting the delay
            // if the user makes additional edits to the data within the delay period.
            this.queueGraphRemake();
            $('#processingStep2ResultsLabel').addClass('off');
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.figureOutThisRowsDataType = function (mode, label, row) {
            var blank, strings, condensed;
            if (mode == 'tr') {
                if (label.match(/gene/i)) {
                    return TypeEnum.Gene_Names;
                }
                if (label.match(/rpkm/i)) {
                    return TypeEnum.RPKM_Values;
                }
                // If we can't match to the above two, set the row to 'undefined' so it's ignored by default
                return 0;
            }
            // Take care of some braindead guesses
            if (label.match(/assay/i) || label.match(/line/i)) {
                return TypeEnum.Assay_Line_Names;
            }
            if (mode == 'pr') {
                if (label.match(/protein/i)) {
                    return TypeEnum.Protein_Name;
                }
                // No point in continuing, only line and protein are relevant
                return 0;
            }
            // Things we'll be counting to hazard a guess at the row contents
            blank = strings = 0;
            // A condensed version of the row, with no nulls or blank values
            condensed = row.filter(function (v) { return !!v; });
            blank = row.length - condensed.length;
            condensed.forEach(function (v) {
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
        };
        IdentifyStructuresStep.prototype.inferActiveFlags = function (grid) {
            // An important thing to note here is that this data is in row major format
            // format - that is, it goes by row, then by column, when referencing (i.e.
            // [row][column]). This matches Grid.data and Table.dataCells.
            var _this = this;
            // infer column active status
            (grid[0] || []).forEach(function (_, colIndex) {
                if (_this.activeColFlags[colIndex] === undefined) {
                    _this.activeColFlags[colIndex] = true;
                }
            });
            // infer row active status
            grid.forEach(function (row, rowIndex) {
                if (_this.activeRowFlags[rowIndex] === undefined) {
                    _this.activeRowFlags[rowIndex] = true;
                }
                _this.activeFlags[rowIndex] = _this.activeFlags[rowIndex] || [];
                row.forEach(function (_, colIndex) {
                    if (_this.activeFlags[rowIndex][colIndex] === undefined) {
                        _this.activeFlags[rowIndex][colIndex] = true;
                    }
                });
            });
        };
        IdentifyStructuresStep.prototype.constructDataTable = function (mode, grid, gridRowMarkers) {
            var _this = this;
            var body, colgroup, controlCols, legendCopy, lowerLegend, lowerLegendId, pulldownOptions, row, that, table;
            this.dataCells = [];
            this.colCheckboxCells = [];
            this.colObjects = [];
            this.rowLabelCells = [];
            this.rowCheckboxCells = [];
            controlCols = ['checkbox', 'pulldown', 'label'];
            if (mode === 'tr') {
                pulldownOptions = [
                    [IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL, IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE],
                    ['Entire Row Is...', [
                            ['Gene Names', TypeEnum.Gene_Names],
                            ['RPKM Values', TypeEnum.RPKM_Values]
                        ]
                    ]
                ];
            }
            else if (mode === 'pr') {
                pulldownOptions = [
                    [IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL, IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE],
                    ['Entire Row Is...', [
                            ['Assay/Line Names', TypeEnum.Assay_Line_Names],
                        ]
                    ],
                    ['First Column Is...', [
                            ['Protein Name', TypeEnum.Protein_Name]
                        ]
                    ]
                ];
            }
            else {
                pulldownOptions = [
                    [IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL, IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE],
                    ['Entire Row Is...', [
                            ['Assay/Line Names', TypeEnum.Assay_Line_Names],
                            ['Measurement Types', TypeEnum.Measurement_Types]
                        ]
                    ],
                    ['First Column Is...', [
                            ['Time (in hours)', TypeEnum.Timestamp],
                            ['Metadata Name', TypeEnum.Metadata_Name],
                            ['Measurement Type', TypeEnum.Measurement_Type]
                        ]
                    ]
                ];
            }
            // attach all event handlers to the table itself
            that = this;
            table = $('<table>').attr('cellspacing', '0').appendTo($('#dataTableDiv'))
                .on('click', '[name=enableColumn]', function (ev) {
                that.toggleTableColumn(ev.target);
            }).on('click', '[name=enableRow]', function (ev) {
                that.toggleTableRow(ev.target);
            }).on('change', '.pulldownCell > select', function (ev) {
                var targ = $(ev.target), i = parseInt(targ.attr('i'), 10), val = parseInt(targ.val(), 10);
                that.changedRowDataTypePulldown(i, val);
            })[0];
            // One of the objects here will be a column group, with col objects in it.
            // This is an interesting twist on DOM behavior that you should probably google.
            colgroup = $('<colgroup>').appendTo(table);
            controlCols.forEach(function () {
                $('<col>').appendTo(colgroup);
            });
            body = $('<tbody>').appendTo(table)[0];
            // Start with three columns, for the checkboxes, pulldowns, and labels.
            // (These will not be tracked in Table.colObjects.)
            // add col elements for each data column
            var nColumns = 0;
            (grid[0] || []).forEach(function () {
                _this.colObjects.push($('<col>').appendTo(colgroup)[0]);
                nColumns++;
            });
            ///////////////////////////////////////////////////////////////////////////////////////
            // First row: spacer cells, followed by checkbox cells for each data column
            ///////////////////////////////////////////////////////////////////////////////////////
            row = body.insertRow();
            // spacer cells have x and y set to 0 to remove from highlight grid
            controlCols.forEach(function () {
                $(row.insertCell()).attr({ 'x': '0', 'y': 0 });
            });
            (grid[0] || []).forEach(function (_, i) {
                var cell, box;
                cell = $(row.insertCell()).attr({ 'id': 'colCBCell' + i, 'x': 1 + i, 'y': 0 })
                    .addClass('checkBoxCell');
                box = $('<input type="checkbox"/>').appendTo(cell)
                    .val(i.toString())
                    .attr({ 'id': 'enableColumn' + i, 'name': 'enableColumn' })
                    .prop('checked', _this.activeColFlags[i]);
                _this.colCheckboxCells.push(cell[0]);
            });
            this.pulldownObjects = []; // We don't want any lingering old objects in this
            ///////////////////////////////////////////////////////////////////////////////////////
            // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
            ///////////////////////////////////////////////////////////////////////////////////////
            grid.forEach(function (values, i) {
                var cell;
                row = body.insertRow();
                // checkbox cell
                cell = $(row.insertCell()).addClass('checkBoxCell')
                    .attr({ 'id': 'rowCBCell' + i, 'x': 0, 'y': i + 1 });
                $('<input type="checkbox"/>')
                    .attr({ 'id': 'enableRow' + i, 'name': 'enableRow', })
                    .val(i.toString())
                    .prop('checked', _this.activeRowFlags[i])
                    .appendTo(cell);
                _this.rowCheckboxCells.push(cell[0]);
                ////////////////////
                // pulldown cell
                ////////////////////
                cell = $(row.insertCell()).addClass('pulldownCell')
                    .attr({ 'id': 'rowPCell' + i, 'x': 0, 'y': i + 1 });
                // use existing setting, or use the last if rows.length > settings.length, or blank
                _this.pulldownSettings[i] = _this.pulldownSettings[i]
                    || _this.pulldownSettings.slice(-1)[0] || 0;
                _this.populatePulldown(cell = $('<select>')
                    .attr({ 'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i })
                    .appendTo(cell), pulldownOptions, _this.pulldownSettings[i]);
                _this.pulldownObjects.push(cell[0]);
                /////////////////////
                // label cell
                ////////////////////
                cell = $(row.insertCell()).attr({ 'id': 'rowMCell' + i, 'x': 0, 'y': i + 1 });
                $('<div>').text(gridRowMarkers[i]).appendTo(cell);
                _this.rowLabelCells.push(cell[0]);
                /////////////////////////
                // the table data itself
                /////////////////////////
                _this.dataCells[i] = [];
                values.forEach(function (value, x) {
                    var short;
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
                    _this.dataCells[i].push(cell[0]);
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
            }
            else {
                lowerLegend.remove();
            }
            $('.step3Legend').toggleClass('off', grid.length === 0);
            this.applyTableDataTypeStyling(grid);
        };
        // A recursive function to populate a pulldown with optional optiongroups,
        // and a default selection
        IdentifyStructuresStep.prototype.populatePulldown = function (select, options, value) {
            var _this = this;
            options.forEach(function (option) {
                if (typeof option[1] === 'number') {
                    $('<option>').text(option[0]).val(option[1])
                        .prop('selected', option[1] === value)
                        .appendTo(select);
                }
                else {
                    _this.populatePulldown($('<optgroup>').attr('label', option[0]).appendTo(select), option[1], value);
                }
            });
        };
        // This routine does a bit of additional styling to the Step 3 data table.
        // It removes and re-adds the dataTypeCell css classes according to the pulldown settings for each row.
        IdentifyStructuresStep.prototype.applyTableDataTypeStyling = function (grid) {
            var _this = this;
            grid.forEach(function (row, index) {
                var pulldown, hlLabel, hlRow;
                pulldown = _this.pulldownSettings[index] || 0;
                hlLabel = hlRow = false;
                if (pulldown === TypeEnum.Assay_Line_Names || pulldown === TypeEnum.Measurement_Types) {
                    hlRow = true;
                }
                else if (pulldown === TypeEnum.Timestamp ||
                    pulldown === TypeEnum.Metadata_Name ||
                    pulldown === TypeEnum.Protein_Name ||
                    pulldown === TypeEnum.Measurement_Type) {
                    hlLabel = true;
                }
                $(_this.rowLabelCells[index]).toggleClass('dataTypeCell', hlLabel);
                row.forEach(function (_, col) {
                    $(_this.dataCells[index][col]).toggleClass('dataTypeCell', hlRow);
                });
            });
        };
        IdentifyStructuresStep.prototype.redrawIgnoredGapMarkers = function (ignoreDataGaps) {
            this.dataCells.forEach(function (row) {
                row.forEach(function (cell) {
                    var disabled = !ignoreDataGaps && !!cell.getAttribute('isblank');
                    $(cell).toggleClass('disabledInput', disabled);
                });
            });
        };
        IdentifyStructuresStep.prototype.redrawEnabledFlagMarkers = function () {
            var _this = this;
            // loop over cells in the table, styling them as needed to show
            // ignored/interpretation-needed status
            this.dataCells.forEach(function (row, rowIndex) {
                var rowLabelCell, pulldown, disableRow, ignoreRow;
                pulldown = _this.pulldownSettings[rowIndex];
                disableRow = !_this.activeRowFlags[rowIndex];
                rowLabelCell = $(_this.rowLabelCells[rowIndex]);
                rowLabelCell.toggleClass('disabledInput', disableRow);
                row.forEach(function (cell, colIndex) {
                    var cellJQ, disableCell, ignoreCell;
                    disableCell = !_this.activeFlags[rowIndex][colIndex]
                        || !_this.activeColFlags[colIndex]
                        || !_this.activeRowFlags[rowIndex];
                    cellJQ = $(cell);
                    cellJQ.toggleClass('disabledInput', disableCell);
                    // if the cell will be ignored because no selection has been made for its row,
                    // change the background so it's obvious that it won't be used
                    ignoreRow = (pulldown === IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE) && !disableCell;
                    cellJQ.toggleClass('missingInterpretationRow', ignoreRow);
                    rowLabelCell.toggleClass('missingInterpretationRow', ignoreRow);
                });
            });
            // style table cells containing column checkboxes in the same way their content was
            // styled above
            this.colCheckboxCells.forEach(function (box, x) {
                var toggle = !_this.activeColFlags[x];
                $(box).toggleClass('disabledInput', toggle);
            });
        };
        IdentifyStructuresStep.prototype.changedRowDataTypePulldown = function (index, value) {
            var _this = this;
            var selected;
            var grid = this.rawInputStep.getGrid();
            // The value does not necessarily match the selectedIndex.
            selected = this.pulldownObjects[index].selectedIndex;
            this.pulldownSettings[index] = value;
            this.pulldownUserChangedFlags[index] = true;
            if (value === TypeEnum.Timestamp ||
                value === TypeEnum.Metadata_Name ||
                value === TypeEnum.Measurement_Type ||
                value === TypeEnum.Protein_Name) {
                // "Timestamp", "Metadata", or other single-table-cell types
                // Set all the rest of the pulldowns to this,
                // based on the assumption that the first is followed by many others
                this.pulldownObjects.slice(index + 1).every(function (pulldown) {
                    var select, i;
                    select = $(pulldown);
                    i = parseInt(select.attr('i'), 10);
                    // if user changed value for this pulldown, stop auto-selecting values for
                    // this and subsequent pulldowns
                    if (_this.pulldownUserChangedFlags[i]
                        && _this.pulldownSettings[i] !== 0) {
                        return false; // break out of loop
                    }
                    select.val(value.toString());
                    _this.pulldownSettings[i] = value;
                    return true; // continue looping
                });
                // In addition to the above action, we also need to do some checking on the entire set of
                // pulldowns, to enforce a division between the "Measurement Type" single data type
                // and the
                // other single data types. If the user uses even one "Measurement Type"
                // pulldown, we can't
                // allow any of the other types, and vice-versa.
                //   Why?  Because "Measurement Type" is used to label the specific case of a table
                // that
                // does not contain a timestamp on either axis.  In that case, the table is meant to
                // provide data for multiple Measurements and Assays for a single unspecified time point.
                // (That time point is requested later in the UI.)
                //   If we allow a single timestamp row, that creates an inconsistent table that is
                // impossible to interpret.
                //   If we allow a single metadata row, that leaves the metadata unconnected to a specific
                // measurement, meaning that the only valid way to interpret it is as Line metadata.  We
                // could potentially support that, but it would be the only case where data imported on
                // this page does not end up in Assays ... and that case doesn't make much sense given
                // that this is the Assay Data Import page!
                //   Anyway, here we run through the pulldowns, making sure that if the user selected
                // "Measurement Type", we blank out all references to "Timestamp" and
                // "Metadata", and
                // vice-versa.
                if (value === TypeEnum.Measurement_Type || value === TypeEnum.Timestamp || value === TypeEnum.Metadata_Name) {
                    grid.forEach(function (_, i) {
                        var c = _this.pulldownSettings[i];
                        if (value === TypeEnum.Measurement_Type) {
                            if (c === TypeEnum.Timestamp || c === TypeEnum.Metadata_Name) {
                                _this.pulldownObjects[i].selectedIndex = 0;
                                _this.pulldownSettings[i] = 0;
                            }
                            else if (c === TypeEnum.Measurement_Types) {
                                _this.pulldownObjects[i].selectedIndex = TypeEnum.Assay_Line_Names;
                                _this.pulldownSettings[i] = TypeEnum.Assay_Line_Names;
                            }
                        }
                        else if ((value === TypeEnum.Timestamp || value === TypeEnum.Metadata_Name) && c === TypeEnum.Measurement_Type) {
                            _this.pulldownObjects[i].selectedIndex = 0;
                            _this.pulldownSettings[i] = 0;
                        }
                    });
                }
            }
            this.interpretRowDataTypePulldowns();
        };
        // update state as a result of row datatype pulldown selection
        IdentifyStructuresStep.prototype.interpretRowDataTypePulldowns = function () {
            var grid = this.rawInputStep.getGrid();
            this.applyTableDataTypeStyling(grid);
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.toggleTableRow = function (box) {
            var input, checkbox, pulldown;
            checkbox = $(box);
            pulldown = checkbox.next();
            input = parseInt(checkbox.val(), 10);
            var active = checkbox.prop('checked');
            this.activeRowFlags[input] = active;
            if (active) {
                pulldown.removeAttr('disabled');
            }
            else {
                pulldown.attr('disabled', 'disabled');
            }
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            // Resetting a disabled row may change the number of rows listed in the Info table.
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.toggleTableColumn = function (box) {
            var value, input;
            input = $(box);
            value = parseInt(input.val(), 10);
            this.activeColFlags[value] = input.prop('checked');
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            // Resetting a disabled column may change the rows listed in the Info table.
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.resetEnabledFlagMarkers = function () {
            var _this = this;
            var grid = this.rawInputStep.getGrid();
            grid.forEach(function (row, y) {
                _this.activeFlags[y] = _this.activeFlags[y] || [];
                row.forEach(function (_, x) {
                    _this.activeFlags[y][x] = true;
                });
                _this.activeRowFlags[y] = true;
            });
            (grid[0] || []).forEach(function (_, x) {
                _this.activeColFlags[x] = true;
            });
            // Flip all the checkboxes on in the header cells for the data columns
            $('#dataTableDiv').find('[name=enableColumn]').prop('checked', true);
            // Same for the checkboxes in the row label cells
            $('#dataTableDiv').find('[name=enableRow]').prop('checked', true);
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.interpretDataTable = function () {
            var _this = this;
            // This mode means we make a new "set" for each cell in the table, rather than
            // the standard method of making a new "set" for each column in the table.
            var singleMode;
            var singleCompatibleCount, singleNotCompatibleCount, earliestName;
            var grid = this.rawInputStep.getGrid();
            var gridRowMarkers = this.rawInputStep.gridRowMarkers;
            var ignoreDataGaps = this.rawInputStep.ignoreDataGaps;
            // We'll be accumulating these for disambiguation.
            var seenLineNames = {};
            var seenAssayNames = {};
            var seenMeasurementNames = {};
            var seenMetadataNames = {};
            var disamRawSets = [];
            // Here are the arrays we will use later
            this.parsedSets = [];
            this.graphSets = [];
            this.uniqueLineNames = [];
            this.uniqueAssayNames = [];
            this.uniqueMeasurementNames = [];
            this.uniqueMetadataNames = [];
            this.seenAnyTimestamps = false;
            // If we've got pre-processed sets from the server available, use those instead of any
            // table contents.
            if (this.rawInputStep.processedSetsAvailable) {
                this.rawInputStep.processedSetsFromFile.forEach(function (rawSet, c) {
                    var set, graphSet, uniqueTimes, times, foundMeta, ln = rawSet.line_name, an = rawSet.assay_name, mn = rawSet.measurement_name;
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
                        _this.uniqueLineNames.push(ln);
                    }
                    if (!seenAssayNames[an]) {
                        seenAssayNames[an] = true;
                        _this.uniqueAssayNames.push(an);
                    }
                    if (!seenMeasurementNames[mn]) {
                        seenMeasurementNames[mn] = true;
                        _this.uniqueMeasurementNames.push(mn);
                    }
                    var reassembledData = [];
                    // Slightly different procedure for metadata, but same idea:
                    Object.keys(rawSet.metadata_by_name).forEach(function (key) {
                        var value = rawSet.metadata_by_name[key];
                        if (!seenMetadataNames[key]) {
                            seenMetadataNames[key] = true;
                            _this.uniqueMetadataNames.push(key);
                        }
                        foundMeta = true;
                    });
                    // Validate the provided set of time/value points
                    rawSet.data.forEach(function (xy) {
                        var time, value;
                        if (!JSNumber.isFinite(xy[0])) {
                            // Sometimes people - or Excel docs - drop commas into large numbers.
                            time = parseFloat((xy[0] || '0').replace(/,/g, ''));
                        }
                        else {
                            time = xy[0];
                        }
                        // If we can't get a usable timestamp, discard this point.
                        if (JSNumber.isNaN(time)) {
                            return;
                        }
                        if (!xy[1] && xy[1] !== 0) {
                            // If we're ignoring gaps, skip any undefined/null values.
                            //if (ignoreDataGaps) { return; }    // Note: Forced always-off for now
                            // A null is our standard placeholder value
                            value = null;
                        }
                        else if (!JSNumber.isFinite(xy[1])) {
                            value = parseFloat((xy[1] || '').replace(/,/g, ''));
                        }
                        else {
                            value = xy[1];
                        }
                        if (!times[time]) {
                            times[time] = value;
                            uniqueTimes.push(time);
                            _this.seenAnyTimestamps = true;
                        }
                    });
                    uniqueTimes.sort(function (a, b) { return a - b; }).forEach(function (time) {
                        reassembledData.push([time, times[time]]);
                    });
                    // Only save if we accumulated some data or metadata
                    if (!uniqueTimes.length && !foundMeta) {
                        return;
                    }
                    set = {
                        // Copy across the fields from the RawImportSet record
                        kind: rawSet.kind,
                        line_name: rawSet.line_name,
                        assay_name: an,
                        measurement_name: rawSet.measurement_name,
                        metadata_by_name: rawSet.metadata_by_name,
                        data: reassembledData
                    };
                    _this.parsedSets.push(set);
                    graphSet = {
                        'label': (ln ? ln + ': ' : '') + an + ': ' + mn,
                        'name': mn,
                        'units': 'units',
                        'data': reassembledData
                    };
                    _this.graphSets.push(graphSet);
                });
                return;
            }
            // If we're not using pre-processed records, we need to use the pulldown settings in this step
            // (usually set by the user) to determine what mode we're in.
            singleCompatibleCount = 0;
            singleNotCompatibleCount = 0;
            earliestName = null;
            // Look for the presence of "single measurement type" rows, and rows of all other single-item types
            grid.forEach(function (_, y) {
                var pulldown;
                if (!_this.activeRowFlags[y]) {
                    return;
                } // Skip inactive rows
                pulldown = _this.pulldownSettings[y];
                if (pulldown === TypeEnum.Measurement_Type || pulldown === TypeEnum.Protein_Name) {
                    singleCompatibleCount++; // Single Measurement Name or Single Protein Name
                }
                else if (pulldown === TypeEnum.Metadata_Name || pulldown === TypeEnum.Timestamp) {
                    singleNotCompatibleCount++;
                }
                else if (pulldown === TypeEnum.Assay_Line_Names && earliestName === null) {
                    earliestName = y;
                }
            });
            // Only use this mode if the table is entirely free of single-timestamp and
            // single-metadata rows, and has at least one "single measurement" or "single protein" row, and at
            // least one "Assay/Line names" row.
            // (Note that requirement of an "Assay/Line names" row prevents this mode from being
            // enabled when the page is in 'Transcriptomics' mode.)
            singleMode = (singleCompatibleCount > 0 && singleNotCompatibleCount === 0 && earliestName !== null) ? true : false;
            // A "set" for every cell of the table, with the timestamp to be determined later.
            if (singleMode) {
                this.colObjects.forEach(function (_, c) {
                    var cellValue;
                    if (!_this.activeColFlags[c]) {
                        return;
                    }
                    cellValue = grid[earliestName][c] || '';
                    if (!cellValue) {
                        return;
                    }
                    // If haven't seen cellValue before, increment and store uniqueness index
                    if (!seenAssayNames[cellValue]) {
                        seenAssayNames[cellValue] = true;
                        _this.uniqueAssayNames.push(cellValue);
                    }
                    grid.forEach(function (row, r) {
                        var pulldown, label, value, timestamp;
                        var rawSet;
                        if (!_this.activeRowFlags[r] || !_this.activeFlags[r][c]) {
                            return;
                        }
                        pulldown = _this.pulldownSettings[r];
                        label = gridRowMarkers[r] || '';
                        value = row[c] || '';
                        if (!pulldown || !label || !value) {
                            return;
                        }
                        var m_name = null;
                        if (pulldown === TypeEnum.Measurement_Type) {
                            if (!seenMeasurementNames[label]) {
                                seenMeasurementNames[label] = true;
                                _this.uniqueMeasurementNames.push(label);
                            }
                            m_name = label;
                        }
                        else if (pulldown === TypeEnum.Protein_Name) {
                            m_name = label;
                        }
                        else {
                            // If we aren't on a row that's labeled as either a metabolite value
                            // or a protein value, return without making a set.
                            return;
                        }
                        rawSet = {
                            kind: _this.selectMajorKindStep.interpretationMode,
                            line_name: null,
                            assay_name: cellValue,
                            measurement_name: m_name,
                            metadata_by_name: {},
                            data: [[null, value]]
                        };
                        _this.parsedSets.push(rawSet);
                    });
                });
                return;
            }
            // The standard method: Make a "set" for each column of the table
            this.colObjects.forEach(function (_, col) {
                var set, graphSet, uniqueTimes, times, foundMeta;
                // Skip it if the whole column is deactivated
                if (!_this.activeColFlags[col]) {
                    return;
                }
                var reassembledData = []; // We'll fill this out as we go
                set = {
                    kind: _this.selectMajorKindStep.interpretationMode,
                    line_name: null,
                    assay_name: null,
                    measurement_name: null,
                    metadata_by_name: {},
                    data: reassembledData,
                };
                uniqueTimes = [];
                times = {};
                foundMeta = false;
                grid.forEach(function (row, r) {
                    var pulldown, label, value, timestamp;
                    if (!_this.activeRowFlags[r] || !_this.activeFlags[r][col]) {
                        return;
                    }
                    pulldown = _this.pulldownSettings[r];
                    label = gridRowMarkers[r] || '';
                    value = row[col] || '';
                    if (!pulldown) {
                        return; // skip row if there's nothing selected in the pulldown
                    }
                    else if (pulldown === TypeEnum.RPKM_Values) {
                        value = value.replace(/,/g, '');
                        if (value) {
                            reassembledData = [[null, value]];
                        }
                        return;
                    }
                    else if (pulldown === TypeEnum.Gene_Names) {
                        if (value) {
                            set.measurement_name = value;
                        }
                        return;
                    }
                    else if (pulldown === TypeEnum.Timestamp) {
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
                                _this.seenAnyTimestamps = true;
                            }
                        }
                        return;
                    }
                    else if (label === '' || value === '') {
                        // Now that we've dealt with timestamps, we proceed on to other data types.
                        // All the other data types do not accept a blank value, so we weed them out now.
                        return;
                    }
                    else if (pulldown === TypeEnum.Assay_Line_Names) {
                        // If haven't seen value before, increment and store uniqueness index
                        if (!seenAssayNames[value]) {
                            seenAssayNames[value] = true;
                            _this.uniqueAssayNames.push(value);
                        }
                        set.assay_name = value;
                        return;
                    }
                    else if (pulldown === TypeEnum.Measurement_Types) {
                        // If haven't seen value before, increment and store uniqueness index
                        if (!seenMeasurementNames[value]) {
                            seenMeasurementNames[value] = true;
                            _this.uniqueMeasurementNames.push(value);
                        }
                        set.measurement_name = value;
                        return;
                    }
                    else if (pulldown === TypeEnum.Metadata_Name) {
                        if (!seenMetadataNames[label]) {
                            seenMetadataNames[label] = true;
                            _this.uniqueMetadataNames.push(label);
                        }
                        set.metadata_by_name[label] = value;
                        foundMeta = true;
                    }
                });
                uniqueTimes.sort(function (a, b) { return a - b; }).forEach(function (time) {
                    reassembledData.push([time, times[time]]);
                });
                // only save if accumulated some data or metadata
                if (!uniqueTimes.length && !foundMeta && !reassembledData[0]) {
                    return;
                }
                _this.parsedSets.push(set);
                graphSet = {
                    'label': 'Column ' + col,
                    'name': 'Column ' + col,
                    'units': 'units',
                    'data': reassembledData
                };
                _this.graphSets.push(graphSet);
            });
        };
        IdentifyStructuresStep.prototype.highlighterF = function (e) {
            var cell, x, y;
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
        };
        IdentifyStructuresStep.prototype.singleValueDisablerF = function (e) {
            var cell, x, y;
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
            }
            else {
                this.activeFlags[y][x] = true;
            }
            this.interpretDataTable();
            this.redrawEnabledFlagMarkers();
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.queueGraphRemake = function () {
            // Start a timer to wait before calling the routine that remakes the graph.
            // This way we're not bothering the user with the long redraw process when
            // they are making fast edits.
            // TODO: as a future improvement, it would be better UI to mark the graph as being
            // rebuilt in case there's a lot of data and it takes a while to update it. In that
            // case, also maybe best to defer all updates to subsequent steps until after the graph
            // update is complete.
            //
            if (this.graphRefreshTimerID) {
                clearTimeout(this.graphRefreshTimerID);
            }
            if (this.graphEnabled) {
                this.graphRefreshTimerID = setTimeout(this.remakeGraphArea.bind(this), 700);
            }
        };
        IdentifyStructuresStep.prototype.remakeGraphArea = function () {
            var graphHelper = Object.create(GraphHelperMethods);
            var mode = this.selectMajorKindStep.interpretationMode;
            var sets = this.graphSets;
            var graph = $('#graphDiv');
            this.graphRefreshTimerID = 0;
            if (!EDDATDGraphing || !this.graphEnabled) {
                return;
            }
            $('#processingStep2ResultsLabel').removeClass('off');
            EDDATDGraphing.clearAllSets();
            var sets = this.graphSets;
            var dataSets = [];
            // If we're not in either of these modes, drawing a graph is nonsensical.
            if ((mode === "std" || mode === 'biolector' || mode === 'hplc') && (sets.length > 0)) {
                graph.removeClass('off');
                sets.forEach(function (set) {
                    var singleAssayObj = graphHelper.transformNewLineItem(EDDData, set);
                    dataSets.push(singleAssayObj);
                });
                EDDATDGraphing.addNewSet(dataSets);
            }
            else {
                graph.addClass('off');
            }
            $('#processingStep2ResultsLabel').addClass('off');
        };
        IdentifyStructuresStep.prototype.getUserWarnings = function () {
            return this.warningMessages;
        };
        IdentifyStructuresStep.prototype.getUserErrors = function () {
            return this.errorMessages;
        };
        IdentifyStructuresStep.prototype.requiredInputsProvided = function () {
            var mode, hadInput;
            var mode = this.selectMajorKindStep.interpretationMode;
            // if the current mode doesn't require input from this step, just return true
            // if the previous step had input
            if (IdentifyStructuresStep.MODES_WITH_DATA_TABLE.indexOf(mode) < 0) {
                return this.rawInputStep.haveInputData;
            }
            // otherwise, require user input for every non-ignored row
            for (var row in this.pulldownObjects) {
                var rowInactivated = !this.activeRowFlags[row];
                if (rowInactivated) {
                    continue;
                }
                var inputSelector = this.pulldownObjects[row];
                var comboBox = $(inputSelector);
                if (comboBox.val() == IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE) {
                    $('#missingStep3InputDiv').removeClass('off');
                    return false;
                }
            }
            $('#missingStep3InputDiv').addClass('off');
            return this.parsedSets.length > 0;
        };
        IdentifyStructuresStep.MODES_WITH_DATA_TABLE = ['std', 'tr', 'pr', 'mdv']; // Step 1 modes in which the data table gets displayed
        IdentifyStructuresStep.MODES_WITH_GRAPH = ['std', 'biolector', 'hplc'];
        IdentifyStructuresStep.DISABLED_PULLDOWN_LABEL = '--';
        IdentifyStructuresStep.DEFAULT_PULLDOWN_VALUE = 0;
        IdentifyStructuresStep.DUPLICATE_LEGEND_THRESHOLD = 10;
        return IdentifyStructuresStep;
    }());
    EDDTableImport.IdentifyStructuresStep = IdentifyStructuresStep;
    // The class responsible for everything in the "Step 4" box that you see on the data import page.
    var TypeDisambiguationStep = (function () {
        function TypeDisambiguationStep(selectMajorKindStep, identifyStructuresStep, nextStepCallback) {
            this.TOGGLE_ALL_THREASHOLD = 4;
            this.DUPLICATE_CONTROLS_THRESHOLD = 10;
            var reDoStepOnChange, masterInputSelectors;
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
            reDoStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType', '#masterMUnits'];
            $(reDoStepOnChange.join(',')).on('input', this.changedAnyMasterPulldown.bind(this));
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
            //EDDAuto.BaseAuto.createFromElements('#masterMComp', 'MeasurementCompartment');
            //EDDAuto.BaseAuto.createFromElements('#masterMType', 'GenericOrMetabolite', EDDData.MetaboliteTypes || {});
            //EDDAuto.BaseAuto.createFromElements('#masterMUnits', 'MeasurementUnit');
            //EDDAuto.BaseAuto.createFromElements('#masterUnits', 'MeasurementUnit');
        }
        TypeDisambiguationStep.prototype.setAllInputsEnabled = function (enabled) {
            var allUserInputs = $("." + TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
            allUserInputs.each(function (index, domElement) {
                var input = $(domElement);
                if (enabled) {
                    input.removeAttr('disabled');
                }
                else {
                    input.attr('disabled', 'disabled');
                }
            });
        };
        TypeDisambiguationStep.prototype.previousStepChanged = function () {
            this.disableInputDuringProcessing();
            var assayIn;
            var currentAssays;
            var masterP = this.selectMajorKindStep.masterProtocol; // Shout-outs to a mid-grade rapper
            // Recreate the master assay pulldown here instead of in remakeAssaySection()
            // because its options are NOT affected by changes to steps after #1, so it would be
            // pointless to remake it in response to them. We may show/hide
            // it based on other state, but its content won't change. RemakeAssaySection() is
            // called by reconfigure(), which is called when other UI in this step changes.
            if (this.masterAssaysOptionsDisplayedForProtocol != masterP) {
                this.masterAssaysOptionsDisplayedForProtocol = masterP;
                assayIn = $('#masterAssay').empty();
                $('<option>').text('(Create New)').appendTo(assayIn).val('named_or_new').prop('selected', true);
                currentAssays = ATData.existingAssays[masterP] || [];
                currentAssays.forEach(function (id) {
                    var assay = EDDData.Assays[id], line = EDDData.Lines[assay.lid], protocol = EDDData.Protocols[assay.pid];
                    $('<option>').appendTo(assayIn).val('' + id).text([
                        line.name, protocol.name, assay.name].join('-'));
                });
                // Always reveal this, since the default for the Assay pulldown is always 'new'.
                $('#masterLineSpan').removeClass('off');
            }
            this.queueReconfigure();
        };
        // Start a timer to wait before calling the reconfigure routine.
        // This way we condense multiple possible events from the radio buttons and/or pulldown into one.
        TypeDisambiguationStep.prototype.queueReconfigure = function () {
            this.disableInputDuringProcessing();
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }
            // long timeout so we don't interfere with ongoing user edits
            this.inputRefreshTimerID = setTimeout(this.reconfigure.bind(this), 500);
        };
        TypeDisambiguationStep.prototype.queueReparseThisStep = function () {
            if (this.thisStepInputTimerID) {
                clearTimeout(this.thisStepInputTimerID);
            }
            this.thisStepInputTimerID = setTimeout(this.reparseThisStep.bind(this), 500);
        };
        // re-parses user inputs from this step to determine whether they've all been provided
        TypeDisambiguationStep.prototype.reparseThisStep = function () {
            this.createSetsForSubmission();
            this.nextStepCallback();
        };
        TypeDisambiguationStep.prototype.disableInputDuringProcessing = function () {
            var hasRequiredInitialInputs = this.identifyStructuresStep.requiredInputsProvided();
            if (hasRequiredInitialInputs) {
                $('#emptyDisambiguationLabel').addClass('off');
            }
            $('#processingStep3Label').toggleClass('off', !hasRequiredInitialInputs);
            this.setAllInputsEnabled(false);
        };
        // Create the Step 4 tables:  Sets of rows, one for each y-axis column of values,
        // where the user can fill out additional information for the pasted table.
        TypeDisambiguationStep.prototype.reconfigure = function () {
            var _this = this;
            var mode, parsedSets, seenAnyTimestamps, hideMasterTimestamp, hasRequiredInitialInput;
            mode = this.selectMajorKindStep.interpretationMode;
            seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            // Hide all the subsections by default
            $('#masterTimestampDiv').addClass('off');
            $('#masterLineDiv').addClass('off');
            $('#masterAssayLineDiv').addClass('off');
            $('#masterMTypeDiv').addClass('off');
            $('#masterUnitDiv').addClass('off');
            $('#disambiguateLinesSection').addClass('off');
            $('#disambiguateAssaysSection').addClass('off');
            $('#disambiguateMeasurementsSection').addClass('off');
            $('#disambiguateMetadataSection').addClass('off');
            // remove toggle buttons and labels dynamically added for some subsections
            // (easier than leaving them in place)
            $('.' + TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS).remove();
            $('.' + TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS).remove();
            hasRequiredInitialInput = this.identifyStructuresStep.requiredInputsProvided();
            // If parsed data exists, but we haven't seen a single timestamp, show the "master
            // timestamp" input.
            hideMasterTimestamp = (!hasRequiredInitialInput) || seenAnyTimestamps ||
                (this.identifyStructuresStep.parsedSets.length === 0);
            $('#masterTimestampDiv').toggleClass('off', hideMasterTimestamp);
            // Call subroutines for each of the major sections
            if (mode === "biolector") {
                this.remakeLineSection();
            }
            else {
                this.remakeAssaySection();
            }
            this.remakeMeasurementSection();
            this.remakeMetadataSection();
            // add a listener to all the required input fields so we can detect when they're changed
            // and know whether or not to allow continuation to the subsequent step
            $('.' + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS).on('input', function () {
                _this.queueReparseThisStep();
            });
            $('#emptyDisambiguationLabel').toggleClass('off', hasRequiredInitialInput);
            $('#processingStep3Label').addClass('off');
            this.setAllInputsEnabled(true);
            this.reparseThisStep();
        };
        // TODO: This function should reset all the disambiguation fields to the values
        // that were auto-detected in the last refresh of the object.
        TypeDisambiguationStep.prototype.resetDisambiguationFields = function () {
            // Get to work!!
        };
        TypeDisambiguationStep.prototype.addToggleAllButton = function (parent, objectsLabel) {
            return this.makeToggleAllButton(objectsLabel)
                .appendTo($(parent));
        };
        TypeDisambiguationStep.prototype.makeToggleAllButton = function (objectsLabel) {
            return $('<button type="button">')
                .text('Select All ' + objectsLabel)
                .addClass(TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS)
                .on('click', this.toggleAllSubsectionItems.bind(this));
        };
        TypeDisambiguationStep.prototype.toggleAllSubsectionItems = function (ev) {
            var allSelected, checkboxes, parentDiv;
            parentDiv = $(ev.target).parent();
            allSelected = true;
            checkboxes = $(parentDiv).find('.' + TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX);
            checkboxes.toArray().some(function (elt) {
                var checkbox = $(elt);
                if (!checkbox.prop('checked')) {
                    allSelected = false;
                    return true; // break; for the Array.some() loop
                }
                return false;
            });
            // un/check all checkboxes based on their previous state
            checkboxes.each(function (index, elt) {
                var checkbox = $(elt);
                checkbox.prop('checked', !allSelected);
                DisambiguationRow.toggleTableRowEnabled(checkbox);
            });
            this.queueReparseThisStep();
        };
        // If the previous step found Line names that need resolving, and the interpretation mode in Step 1
        // warrants resolving Lines independent of Assays, we create this section.
        // The point is that if we connect unresolved Line strings on their own, the unresolved Assay strings
        // can be used to create multiple new Assays with identical names under a range of Lines.
        // This means users can create a matrix of Line/Assay combinations, rather than a one-dimensional
        // resolution where unique Assay names must always point to one unique Assay record.
        TypeDisambiguationStep.prototype.remakeLineSection = function () {
            var _this = this;
            var body, table, hasRequiredInitialInputs, requiredInputText, uniqueLineNames, parentDiv;
            uniqueLineNames = this.identifyStructuresStep.uniqueLineNames;
            this.currentlyVisibleLineObjSets.forEach(function (disam) {
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
            if (uniqueLineNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.addToggleAllButton(parentDiv, 'Lines');
            }
            ////////////////////////////////////////////////////////////////////////////////////////
            // Set up the table and column headers
            ////////////////////////////////////////////////////////////////////////////////////////
            table = $('<table>')
                .attr({ 'id': 'disambiguateLinesTable', 'cellspacing': 0 })
                .appendTo(parentDiv.removeClass('off'))
                .on('change', 'select', function (ev) {
                _this.userChangedLineDisam(ev.target);
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            uniqueLineNames.forEach(function (name, i) {
                var disam, row, defaultSel, cell, select, disam = _this.lineObjSets[name];
                if (!disam) {
                    disam = new LineDisambiguationRow(body, name, i);
                    _this.lineObjSets[name] = disam;
                }
                disam.appendTo(body);
                _this.currentlyVisibleLineObjSets.push(disam);
            });
            if (uniqueLineNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                this.addToggleAllButton(parentDiv, 'Lines');
                this.addRequiredInputLabel(parentDiv, requiredInputText);
            }
        };
        // If the previous step found Line or Assay names that need resolving, put together a disambiguation section
        // for Assays/Lines.
        // Keep a separate set of correlations between strings and pulldowns for each Protocol,
        // since the same string can match different Assays, and the pulldowns will have different content, in each Protocol.
        // If the previous step didn't find any Line or Assay names that need resolving,
        // reveal the pulldowns for selecting a master Line/Assay, leaving the table empty, and return.
        TypeDisambiguationStep.prototype.remakeAssaySection = function () {
            var _this = this;
            var avgRowCreationSeconds, maxRowCreationSeconds, masterProtocol, nColumns, nControls, nRows, parentDiv, requiredInputText, table, tableBody, uniqueAssayNames, totalRowCreationSeconds;
            // gather up inputs from this and previous steps
            uniqueAssayNames = this.identifyStructuresStep.uniqueAssayNames;
            masterProtocol = this.selectMajorKindStep.masterProtocol;
            // remove stale data from previous run of this step
            this.currentlyVisibleAssayObjSets.forEach(function (disam) {
                disam.detach();
            });
            this.currentlyVisibleAssayObjSets = [];
            $('#disambiguateAssaysTable').remove();
            this.assayObjSets = {};
            //end early if there's nothing to display in this section
            if ((!this.identifyStructuresStep.requiredInputsProvided()) ||
                this.identifyStructuresStep.parsedSets.length === 0) {
                return;
            }
            parentDiv = $('#disambiguateAssaysSection');
            if (uniqueAssayNames.length === 0) {
                $('#masterAssayLineDiv').removeClass('off');
                return;
            }
            requiredInputText = 'At least one valid assay / line combination is required.';
            this.addRequiredInputLabel(parentDiv, requiredInputText);
            if (uniqueAssayNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.addToggleAllButton(parentDiv, 'Assays');
            }
            ////////////////////////////////////////////////////////////////////////////////////////
            // Create the table
            ////////////////////////////////////////////////////////////////////////////////////////
            table = $('<table>')
                .attr({ 'id': 'disambiguateAssaysTable', 'cellspacing': 0 })
                .appendTo(parentDiv.removeClass('off'))
                .on('change', 'select', function (ev) {
                _this.userChangedAssayDisam(ev.target);
            })[0];
            tableBody = $('<tbody>').appendTo(table)[0];
            ////////////////////////////////////////////////////////////////////////////////////////
            // Create a table row for each unique assay name
            ////////////////////////////////////////////////////////////////////////////////////////
            nRows = 0;
            nControls = 4;
            nColumns = 5;
            maxRowCreationSeconds = 0;
            totalRowCreationSeconds = 0;
            uniqueAssayNames.forEach(function (assayName, i) {
                var assayId, disam, row, defaultSelection, cell, aSelect, disam = _this.assayObjSets[assayName];
                if (!disam) {
                    disam = new AssayDisambiguationRow(tableBody, assayName, i);
                    nRows++;
                    _this.assayObjSets[assayName] = disam;
                }
                disam.selectAssayJQElement.data({ 'visibleIndex': i });
                disam.appendTo(tableBody);
                _this.currentlyVisibleAssayObjSets.push(disam);
            });
            if (uniqueAssayNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                var warningText;
                this.addToggleAllButton(parentDiv, 'Assays');
                this.addRequiredInputLabel(parentDiv, requiredInputText);
            }
        };
        TypeDisambiguationStep.prototype.addRequiredInputLabel = function (parentDiv, text) {
            var adding = [TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS, 'off', 'missingSingleFormInput'];
            return $('<div>').text(text)
                .addClass(adding.join(' '))
                .appendTo(parentDiv);
        };
        TypeDisambiguationStep.prototype.remakeMeasurementSection = function () {
            var _this = this;
            var body, row, bodyJq, hasRequiredInitialInput, seenAnyTimestamps, mode, parentDiv, uniqueMeasurementNames, that = this;
            mode = this.selectMajorKindStep.interpretationMode;
            uniqueMeasurementNames = this.identifyStructuresStep.uniqueMeasurementNames;
            seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            hasRequiredInitialInput = this.identifyStructuresStep.requiredInputsProvided();
            parentDiv = $('#disambiguateMeasurementsSection');
            parentDiv.addClass('off');
            $('#masterMTypeDiv').addClass('off');
            bodyJq = $('#disambiguateMeasurementsTable tbody');
            bodyJq.children().detach();
            this.currentlyVisibleMeasurementObjSets.forEach(function (disam) {
                disam.rowElementJQ.detach();
            });
            // If in 'Transcription' or 'Proteomics' mode, there are no measurement types needing
            // explicit disambiguation. Skip the measurement section, and provide statistics about
            // the gathered records.
            // TODO: sometimes skyline will target metabolites instead of proteins; in those cases
            //  do not abort section
            if (mode === "tr" || mode === "pr") {
                return;
            }
            // No measurements for disambiguation, have timestamp data:  That means we need to
            // choose one measurement. You might think that we should display this even without
            // timestamp data, to handle the case where we're importing a single measurement type
            // for a single timestamp...  But that would be a 1-dimensional import, since there
            // is only one other object with multiple types to work with (lines/assays).  We're
            // not going to bother supporting that.
            if (hasRequiredInitialInput && uniqueMeasurementNames.length === 0 && seenAnyTimestamps) {
                $('#masterMTypeDiv').removeClass('off');
                return;
            }
            // If in Skyline mode, need to specify the units to import
            if (mode === 'skyline') {
                $('#masterUnitDiv').removeClass('off')
                    .find('[name=masterUnits]')
                    .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                    .end()
                    .find('[name=masterUnitsValue]')
                    .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS)
                    .end();
                return;
            }
            if (uniqueMeasurementNames.length > this.TOGGLE_ALL_THREASHOLD) {
                this.makeToggleAllButton('Measurement Types')
                    .insertBefore($('#disambiguateMeasurementsTable'));
            }
            // put together a disambiguation section for measurement types
            body = (bodyJq[0]);
            this.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
            uniqueMeasurementNames.forEach(function (name, i) {
                var disam, isMdv;
                disam = _this.measurementObjSets[name];
                if (disam && disam.rowElementJQ) {
                    disam.appendTo(body);
                }
                else {
                    disam = new MeasurementDisambiguationRow(body, name, i);
                    _this.measurementObjSets[name] = disam;
                }
                // TODO sizing should be handled in CSS
                disam.compAuto.visibleInput.data('visibleIndex', i);
                disam.typeAuto.visibleInput.data('visibleIndex', i);
                disam.unitsAuto.visibleInput.data('visibleIndex', i);
                // If we're in MDV mode, the units pulldowns are irrelevant. Toggling
                // the hidden unit input controls whether it's treated as required.
                isMdv = mode === 'mdv';
                disam.unitsAuto.visibleInput.toggleClass('off', isMdv);
                disam.unitsAuto.hiddenInput.toggleClass('off', isMdv);
                // Set required inputs as required
                disam.compAuto.hiddenInput.addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
                disam.typeAuto.hiddenInput.addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
                disam.unitsAuto.hiddenInput.toggleClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS, !isMdv);
                _this.currentlyVisibleMeasurementObjSets.push(disam);
            });
            if (uniqueMeasurementNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                this.addToggleAllButton(parentDiv, 'Measurement Types');
            }
            this.checkAllMeasurementCompartmentDisam();
            $('#disambiguateMeasurementsSection').toggleClass('off', uniqueMeasurementNames.length === 0 || !hasRequiredInitialInput);
        };
        TypeDisambiguationStep.prototype.remakeMetadataSection = function () {
            var _this = this;
            var body, parentDiv, row, table;
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
            table = $('<table>')
                .attr({ 'id': 'disambiguateMetadataTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateMetadataSection').removeClass('off'))
                .on('change', 'input', function (ev) {
                // should there be event handling here ?
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            uniqueMetadataNames.forEach(function (name, i) {
                var cell, disam, ignoreLabel, ignoreChkbx, typeDisambiguationStep;
                disam = _this.metadataObjSets[name];
                if (disam && disam.rowElementJQ) {
                    disam.appendTo(body);
                }
                else {
                    disam = new MetadataDisambiguationRow(body, name, i);
                    _this.metadataObjSets[name] = disam;
                }
                disam.metaAuto.visibleInput.attr('name', 'disamMeta' + i)
                    .addClass('autocomp_altype');
                disam.metaAuto.hiddenInput.attr('name', 'disamMetaHidden' + i);
            });
            if (uniqueMetadataNames.length > this.DUPLICATE_CONTROLS_THRESHOLD) {
                this.addToggleAllButton(parentDiv, 'Metadata Types');
            }
        };
        // We call this when any of the 'master' pulldowns are changed in Step 4.
        // Such changes may affect the available contents of some of the pulldowns in the step.
        TypeDisambiguationStep.prototype.changedAnyMasterPulldown = function () {
            // Show the master line dropdown if the master assay dropdown is set to new
            $('#masterLineSpan').toggleClass('off', $('#masterAssay').val() !== 'named_or_new');
            this.queueReconfigure();
        };
        // If the pulldown is being set to 'new', walk down the remaining pulldowns in the section,
        // in order, setting them to 'new' as well, stopping just before any pulldown marked as
        // being 'set by the user'.
        TypeDisambiguationStep.prototype.userChangedLineDisam = function (lineEl) {
            var changed, v;
            changed = $(lineEl).data('setByUser', true);
            if (changed.val() !== 'new') {
                // stop here for anything other than 'new'; only 'new' cascades to following pulldowns
                return false;
            }
            v = changed.data('visibleIndex') || 0;
            this.currentlyVisibleLineObjSets.slice(v).forEach(function (obj) {
                var textInput = obj.lineAuto.visibleInput;
                if (textInput.data('setByUser')) {
                    return;
                }
                // set dropdown to 'new' and reveal the line autoselect
                textInput.val('new').next().removeClass('off');
            });
            return false;
        };
        // This function serves two purposes.
        // 1. If the given Assay disambiguation pulldown is being set to 'new', reveal the adjacent
        //    Line pulldown, otherwise hide it.
        // 2. If the pulldown is being set to 'new', walk down the remaining pulldowns in the section,
        //    in order, setting them to 'new' as well, stopping just before any pulldown marked as
        //    being 'set by the user'.
        TypeDisambiguationStep.prototype.userChangedAssayDisam = function (assayEl) {
            var changed, v;
            changed = $(assayEl).data('setByUser', true);
            // The span with the corresponding Line pulldown is always right next to the Assay pulldown
            changed.next().toggleClass('off', changed.val() !== 'named_or_new');
            if (changed.val() !== 'named_or_new') {
                // stop here for anything other than 'new'; only 'new' cascades to following pulldowns
                return false;
            }
            v = changed.data('visibleIndex') || 0;
            this.currentlyVisibleAssayObjSets.slice(v).forEach(function (obj) {
                var assaySelect = obj.selectAssayJQElement;
                if (assaySelect.data('setByUser')) {
                    return;
                }
                // set assay dropdown to 'new' and reveal the line autocomplete
                assaySelect.val('named_or_new').next().removeClass('off');
            });
            return false;
        };
        TypeDisambiguationStep.prototype.userChangedMeasurementDisam = function (element) {
            var auto, hiddenInput, textInput, type, rowIndex, nextSets;
            hiddenInput = $(element);
            auto = hiddenInput.data('edd').autocompleteobj; // If this is missing we might as well throw an error
            textInput = auto.visibleInput;
            type = auto.modelName;
            if (type === 'MeasurementCompartment' || type === 'MeasurementUnit') {
                rowIndex = textInput.data('setByUser', true).data('visibleIndex') || 0;
                if (rowIndex < this.currentlyVisibleMeasurementObjSets.length - 1) {
                    nextSets = this.currentlyVisibleMeasurementObjSets.slice(rowIndex + 1);
                    nextSets.some(function (obj) {
                        var following = $(obj[type]);
                        if (following.length === 0 || following.data('setByUser')) {
                            return true; // break; for the Array.some() loop
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
        };
        // Run through the list of currently visible measurement disambiguation form elements,
        // checking to see if any of the 'compartment' elements are set to a non-blank value.
        // If any are, and we're in MDV document mode, display a warning that the user should
        // specify compartments for all their measurements.
        TypeDisambiguationStep.prototype.checkAllMeasurementCompartmentDisam = function () {
            var allSet, mode;
            mode = this.selectMajorKindStep.interpretationMode;
            allSet = this.currentlyVisibleMeasurementObjSets.every(function (obj) {
                var compAuto = obj.compAuto;
                if (compAuto.visibleInput.data('setByUser') || (compAuto.visibleInput.val() && compAuto.val() !== '0')) {
                    return true;
                }
                return false;
            });
            $('#noCompartmentWarning').toggleClass('off', mode !== 'mdv' || allSet);
        };
        /**
         * Reviews parsed data from Step 3 and applies decisions made in Step 4 to create the final
         * dataset for submission to the server. Note that some data may be omitted from submission
         * if the user has chosen to omit them (e.g. because of an undefined metadata type that
         * isn't required).
         * @returns {ResolvedImportSet[]}
         */
        TypeDisambiguationStep.prototype.createSetsForSubmission = function () {
            var _this = this;
            var mode, masterProtocol, seenAnyTimestamps, droppedDatasetsForMissingTime, parsedSets, resolvedSets, masterTime, masterLine, masterAssayLine, masterAssay, masterMType, masterMComp, masterMUnits, masterUnits;
            this.errorMessages = [];
            this.warningMessages = [];
            // From Step 1
            mode = this.selectMajorKindStep.interpretationMode;
            masterProtocol = this.selectMajorKindStep.masterProtocol || null; // Cast 0 to null
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
            resolvedSets = [];
            droppedDatasetsForMissingTime = 0;
            parsedSets.forEach(function (set, setIndex) {
                var assayDisam, // TODO: need types for the disam objects
                assay_id, assaySelect, compartmentId, lineDisam, lineId, lineIdInput, measDisam, metaDisam, measurementTypeId, unitsId, resolvedData, metaDataById, metaDataByName, metaDataPresent, metaId, resolvedSet;
                lineId = 'new'; // A convenient default
                assay_id = 'named_or_new';
                measurementTypeId = null;
                compartmentId = null;
                unitsId = null;
                // In modes where we resolve measurement types in the client UI, go with the
                // master values by default.
                if (mode === "biolector" || mode === "std" || mode === "mdv" || mode === "hplc") {
                    measurementTypeId = masterMType;
                    compartmentId = masterMComp;
                    unitsId = masterMUnits;
                }
                else if (mode === 'skyline') {
                    unitsId = masterUnits;
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
                        lineDisam = _this.lineObjSets[set.line_name];
                        if (lineDisam) {
                            lineIdInput = lineDisam.lineAuto.hiddenInput;
                            // if we've disabled import for the associated line, skip adding this
                            // measurement to the list
                            if (lineIdInput.prop('disabled')) {
                                return; // continue to the next loop iteration parsedSets.forEach
                            }
                            lineId = lineIdInput.val();
                        }
                    }
                }
                else {
                    lineId = masterAssayLine;
                    assay_id = masterAssay;
                    if (set.assay_name !== null && masterProtocol) {
                        assayDisam = _this.assayObjSets[set.assay_name];
                        if (assayDisam) {
                            assaySelect = assayDisam.selectAssayJQElement;
                            // if we've disabled import for this assay, skip adding this
                            // measurement to the list
                            if (assaySelect.is(':disabled')) {
                                return; // continue to the next loop iteration parsedSets.forEach
                            }
                            assay_id = assaySelect.val();
                            lineIdInput = assayDisam.lineAuto.hiddenInput;
                            lineId = lineIdInput.val();
                        }
                    }
                }
                // Same for measurement name, but resolve all three measurement fields if we find
                // a match, and only if we are resolving measurement types client-side.
                if (mode === "biolector" || mode === "std" || mode === "mdv" || mode === 'hplc') {
                    if (set.measurement_name !== null) {
                        measDisam = _this.measurementObjSets[set.measurement_name];
                        if (measDisam) {
                            measurementTypeId = measDisam.typeAuto.val();
                            compartmentId = measDisam.compAuto.val() || "0";
                            unitsId = measDisam.unitsAuto.val() || "1";
                            // If we've disabled import for measurements of this type, skip adding
                            // this measurement to the list
                            if (measDisam.typeAuto.hiddenInput.is(':disabled')) {
                                return; // continue to the next loop iteration parsedSets.forEach
                            }
                        }
                    }
                }
                // Any metadata disambiguation fields that are left unresolved, will have their
                // metadata dropped from the import in this step, because this loop is building
                // key-value pairs where the key is the chosen database id of the metadata type.
                // No id == not added.
                metaDataById = {};
                metaDataByName = {};
                Object.keys(set.metadata_by_name).forEach(function (name) {
                    metaDisam = _this.metadataObjSets[name];
                    if (metaDisam) {
                        metaId = metaDisam.metaAuto.val();
                        if (metaId && (!metaDisam.metaAuto.hiddenInput.is(':disabled'))) {
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
                    }
                    else {
                        resolvedData = [];
                        droppedDatasetsForMissingTime++;
                    }
                }
                // If we have no data, and no metadata that survived resolving, don't make the set.
                // (return continues to the next loop iteration)
                if (resolvedData.length < 1 && !metaDataPresent) {
                    return;
                }
                resolvedSet = {
                    // Copy across the fields from the RawImportSet record
                    kind: set.kind,
                    line_name: set.line_name,
                    assay_name: set.assay_name,
                    measurement_name: set.measurement_name,
                    metadata_by_name: metaDataByName,
                    data: resolvedData,
                    // Add new disambiguation-specific fields
                    protocol_id: masterProtocol,
                    line_id: lineId,
                    assay_id: assay_id,
                    measurement_id: measurementTypeId,
                    compartment_id: compartmentId,
                    units_id: unitsId,
                    metadata_by_id: metaDataById
                };
                resolvedSets.push(resolvedSet);
            });
            if (resolvedSets.length === 0) {
                this.errorMessages.push(new ImportMessage('All of the measurements and ' +
                    ' metadata have been excluded from import. Please select some data to' +
                    ' import.'));
            }
            // log some debugging output if any data get dropped because of a missing timestamp
            if (droppedDatasetsForMissingTime) {
                if (parsedSets.length === droppedDatasetsForMissingTime) {
                    $("#masterTimestampRequiredPrompt").removeClass('off');
                }
                else {
                    var percentDropped = (droppedDatasetsForMissingTime / parsedSets.length) * 100;
                    var warningMessage = droppedDatasetsForMissingTime + " parsed datasets (" +
                        percentDropped + "%) were dropped because they were missing a timestamp.";
                    console.warn(warningMessage);
                    this.warningMessages.push(new ImportMessage(warningMessage));
                }
            }
            else {
                $("#masterTimestampRequiredPrompt").addClass('off');
            }
            return resolvedSets;
        };
        TypeDisambiguationStep.prototype.getUserWarnings = function () {
            return this.warningMessages;
        };
        TypeDisambiguationStep.prototype.getUserErrors = function () {
            return this.errorMessages;
        };
        TypeDisambiguationStep.prototype.requiredInputsProvided = function () {
            var subsection, requiredInputSubsectionSelectors, allRequiredInputs, sectionRequiredInputs;
            // loop over subsections that must have at least one input, making sure that all the
            // visible ones have at least one required input that isn't ignored.
            requiredInputSubsectionSelectors = ['#disambiguateAssaysSection', '#disambiguateLinesSection'];
            for (var _i = 0, requiredInputSubsectionSelectors_1 = requiredInputSubsectionSelectors; _i < requiredInputSubsectionSelectors_1.length; _i++) {
                var selector = requiredInputSubsectionSelectors_1[_i];
                var hasEnabledInputs;
                subsection = $(selector);
                if (subsection.hasClass('off')) {
                    continue;
                }
                sectionRequiredInputs = subsection.find('.' + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS).toArray();
                for (var _a = 0, sectionRequiredInputs_1 = sectionRequiredInputs; _a < sectionRequiredInputs_1.length; _a++) {
                    var input_id = sectionRequiredInputs_1[_a];
                    var input = $(input_id);
                    if ((!input.val()) && !(input.prop('disabled') || input.hasClass('off'))) {
                        return false;
                    }
                }
                hasEnabledInputs = sectionRequiredInputs.length !== 0;
                subsection.find('.' + TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS).toggleClass('off', hasEnabledInputs);
                if (!hasEnabledInputs) {
                    return false;
                }
            }
            // test that all required inputs currently visible / enabled on the form have a valid
            // value. Note: this check is very similar to, but distinct from, the one above.
            var allRequiredInputs = $('.' + TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            for (var _b = 0, _c = allRequiredInputs.toArray(); _b < _c.length; _b++) {
                var input_id = _c[_b];
                var input = $(input_id);
                // if the input has no value, but wasn't hidden from the display by the 'off'
                // class, it's missing required data. Note that the "hidden" check below
                // will still allow <input type="hidden">, but will ignore inputs that have been
                // "hidden" by the "off" class directly to the input or one of its parents.
                if ((!input.val()) && !(input.prop('disabled') || input.hasClass('off')
                    || input.parents('.off').length > 0)) {
                    return false;
                }
            }
            return allRequiredInputs.length > 0;
        };
        TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS = "step4_user_input";
        TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS = "step4_required_input";
        TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX = 'toggleAllButton';
        TypeDisambiguationStep.STEP_4_TOGGLE_SUBSECTION_CLASS = 'step4SubsectionToggle';
        TypeDisambiguationStep.STEP_4_SUBSECTION_REQUIRED_CLASS = 'step4RequiredSubsectionLabel';
        return TypeDisambiguationStep;
    }());
    EDDTableImport.TypeDisambiguationStep = TypeDisambiguationStep;
    var DisambiguationRow = (function () {
        function DisambiguationRow(body, name, i) {
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
        DisambiguationRow.prototype.build = function (body, name, i) {
        };
        DisambiguationRow.prototype.detach = function () {
            this.rowElementJQ.detach();
        };
        DisambiguationRow.prototype.appendTo = function (body) {
            this.rowElementJQ.appendTo(body);
        };
        DisambiguationRow.prototype.addIgnoreCheckbox = function () {
            // ignore checkbox. allows import for buttoned up file formats (e.g. biolector,
            // HPLC) to selectively ignore parts of the input file that aren't necessary
            this.ignoreCheckbox = $('<input type="checkbox">')
                .prop('checked', true)
                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                .addClass(TypeDisambiguationStep.STEP_4_TOGGLE_ROW_CHECKBOX)
                .appendTo(this.row.insertCell())
                .on('change', this.userChangedRowEnabled.bind(this));
        };
        DisambiguationRow.prototype.userChangedRowEnabled = function () {
            DisambiguationRow.toggleTableRowEnabled(this.ignoreCheckbox);
            EDDTableImport.typeDisambiguationStep.queueReparseThisStep();
        };
        // get paired hidden / visible autocomplete inputs in the same table row as the checkbox
        // and enable/disable/require them as appropriate
        DisambiguationRow.toggleTableRowEnabled = function (checkbox) {
            var enabled = checkbox.is(':checked');
            // iterate over cells in the row
            checkbox.parent().nextAll().each(function (index, elt) {
                var tableCell = $(elt);
                tableCell.toggleClass('disabledTextLabel', !enabled);
                // manage text input(s)
                // clear / disable the visible input so it doesn't get submitted with the form
                tableCell.find(':input').prop('disabled', !enabled);
                // manage hidden input(s)
                tableCell.find(':hidden').toggleClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS, enabled);
                // manage dropdowns
                tableCell.find('select').toggleClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS, enabled);
            });
        };
        return DisambiguationRow;
    }());
    EDDTableImport.DisambiguationRow = DisambiguationRow;
    var MetadataDisambiguationRow = (function (_super) {
        __extends(MetadataDisambiguationRow, _super);
        function MetadataDisambiguationRow() {
            _super.apply(this, arguments);
        }
        MetadataDisambiguationRow.prototype.build = function (body, name, i) {
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
        };
        // Cache for re-use of autocomplete objects
        MetadataDisambiguationRow.autoCache = {};
        return MetadataDisambiguationRow;
    }(DisambiguationRow));
    EDDTableImport.MetadataDisambiguationRow = MetadataDisambiguationRow;
    var MeasurementDisambiguationRow = (function (_super) {
        __extends(MeasurementDisambiguationRow, _super);
        function MeasurementDisambiguationRow() {
            _super.apply(this, arguments);
        }
        MeasurementDisambiguationRow.prototype.build = function (body, name, i) {
            var _this = this;
            this.compAuto = new EDDAuto.MeasurementCompartment({
                container: $(this.row.insertCell()),
                cache: MeasurementDisambiguationRow.compAutoCache
            });
            this.typeAuto = new EDDAuto.GenericOrMetabolite({
                container: $(this.row.insertCell()),
                cache: MeasurementDisambiguationRow.metaboliteAutoCache
            });
            this.unitsAuto = new EDDAuto.MeasurementUnit({
                container: $(this.row.insertCell()),
                cache: MeasurementDisambiguationRow.unitAutoCache
            });
            // create autocompletes
            [this.compAuto, this.typeAuto, this.unitsAuto].forEach(function (auto) {
                var cell = $(_this.row.insertCell()).addClass('disamDataCell');
                auto.container.addClass('disamDataCell');
                auto.visibleInput.addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
                auto.hiddenInput.addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
            });
            $(this.row).on('change', 'input[type=hidden]', function (ev) {
                // only watch for changes on the hidden portion, let autocomplete work
                EDDTableImport.typeDisambiguationStep.userChangedMeasurementDisam(ev.target);
            });
            EDD_auto.initial_search(this.typeAuto, name);
        };
        // Caches for re-use of autocomplete fields
        MeasurementDisambiguationRow.compAutoCache = {};
        MeasurementDisambiguationRow.metaboliteAutoCache = {};
        MeasurementDisambiguationRow.unitAutoCache = {};
        return MeasurementDisambiguationRow;
    }(DisambiguationRow));
    EDDTableImport.MeasurementDisambiguationRow = MeasurementDisambiguationRow;
    var LineDisambiguationRow = (function (_super) {
        __extends(LineDisambiguationRow, _super);
        function LineDisambiguationRow() {
            _super.apply(this, arguments);
        }
        LineDisambiguationRow.prototype.build = function (body, name, i) {
            var defaultSel, cell;
            cell = $(this.row.insertCell()).css('text-align', 'left');
            defaultSel = LineDisambiguationRow.disambiguateAnAssayOrLine(name, i);
            this.appendLineAutoselect(cell, defaultSel);
            this.lineAuto.visibleInput.data('visibleIndex', i);
        };
        LineDisambiguationRow.prototype.appendLineAutoselect = function (parentElement, defaultSelection) {
            // create a text input to gather user input
            var lineInputId = 'disamLineInput' + this.visibleIndex;
            this.lineAuto = new EDDAuto.StudyLine({
                container: parentElement,
                hiddenValue: defaultSelection.lineID,
                emptyCreatesNew: true,
                nonEmptyRequired: false
            });
            this.lineAuto.visibleInput.data('setByUser', false)
                .attr('id', lineInputId)
                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS);
            // create a hidden form field to store the selected value
            this.lineAuto.hiddenInput.attr('id', 'disamLine' + this.visibleIndex)
                .attr('name', 'disamLine' + this.visibleIndex)
                .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            // auto-select the line name if possible
            //if (defaultSelection.lineID) {
            //    // search for the line ID corresponding to this name.
            // ATData.existingLines is of type {id: number; n: string;}[]
            //    (ATData.existingLines || []).forEach((line: any) => {  // TODO: possible optimization here -- no need for linear search
            //        if (defaultSelection.lineID === line.id) {
            //            lineNameInput.val(line.n);
            //            selectedLineIdInput.val(line.id.toString());
            //            return false; // stop looping
            //        }
            //    });
            //}
        };
        LineDisambiguationRow.disambiguateAnAssayOrLine = function (assayOrLine, currentIndex) {
            var startTime = new Date();
            var selections, highest, assays;
            selections = {
                lineID: 0,
                assayID: 0
            };
            highest = 0;
            // ATData.existingAssays is type {[index: string]: number[]}
            assays = ATData.existingAssays[EDDTableImport.selectMajorKindStep.masterProtocol] || [];
            assays.every(function (id, i) {
                var assay, line, protocol, name;
                assay = EDDData.Assays[id];
                line = EDDData.Lines[assay.lid];
                protocol = EDDData.Protocols[assay.pid];
                name = [line.name, protocol.name, assay.name].join('-');
                if (assayOrLine.toLowerCase() === name.toLowerCase()) {
                    // The full Assay name, even case-insensitive, is the best match
                    selections.assayID = id;
                    return false; // do not need to continue
                }
                else if (highest < 0.8 && assayOrLine === assay.name) {
                    // An exact-case match with the Assay name fragment alone is second-best.
                    highest = 0.8;
                    selections.assayID = id;
                }
                else if (highest < 0.7 && assay.name.indexOf(assayOrLine) >= 0) {
                    // Finding the whole string inside the Assay name fragment is pretty good
                    highest = 0.7;
                    selections.assayID = id;
                }
                else if (highest < 0.6 && line.name.indexOf(assayOrLine) >= 0) {
                    // Finding the whole string inside the originating Line name is good too.
                    // It means that the user may intend to pair with this Assay even though the
                    // Assay name is different.
                    highest = 0.6;
                    selections.assayID = id;
                }
                else if (highest < 0.4 &&
                    (new RegExp('(^|\\W)' + assay.name + '(\\W|$)', 'g')).test(assayOrLine)) {
                    // Finding the Assay name fragment within the whole string, as a whole word, is our
                    // last option.
                    highest = 0.4;
                    selections.assayID = id;
                }
                else if (highest < 0.3 && currentIndex === i) {
                    // If all else fails, choose Assay of current index in sorted order.
                    highest = 0.3;
                    selections.assayID = id;
                }
                return true;
            });
            // Now we repeat the practice, separately, for the Line pulldown.
            highest = 0;
            // ATData.existingLines is type {id: number; n: string;}[]
            (ATData.existingLines || []).every(function (line, i) {
                if (assayOrLine === line.n) {
                    // The Line name, case-sensitive, is the best match
                    selections.lineID = line.id;
                    return false; // do not need to continue
                }
                else if (highest < 0.8 && assayOrLine.toLowerCase() === line.n.toLowerCase()) {
                    // The same thing case-insensitive is second best.
                    highest = 0.8;
                    selections.lineID = line.id;
                }
                else if (highest < 0.7 && assayOrLine.indexOf(line.n) >= 0) {
                    // Finding the Line name within the string is odd, but good.
                    highest = 0.7;
                    selections.lineID = line.id;
                }
                else if (highest < 0.6 && line.n.indexOf(assayOrLine) >= 0) {
                    // Finding the string within the Line name is also good.
                    highest = 0.6;
                    selections.lineID = line.id;
                }
                else if (highest < 0.5 && currentIndex === i) {
                    // Again, if all else fails, just choose the Line that matches the current index
                    // in sorted order, in a loop.
                    highest = 0.5;
                    selections.lineID = line.id;
                }
                return true;
            });
            return selections;
        };
        return LineDisambiguationRow;
    }(DisambiguationRow));
    EDDTableImport.LineDisambiguationRow = LineDisambiguationRow;
    var AssayDisambiguationRow = (function (_super) {
        __extends(AssayDisambiguationRow, _super);
        function AssayDisambiguationRow() {
            _super.apply(this, arguments);
        }
        AssayDisambiguationRow.prototype.build = function (body, name, i) {
            var defaultSel, cell, aSelect;
            defaultSel = LineDisambiguationRow.disambiguateAnAssayOrLine(name, i);
            /////////////////////////////////////////////////////////////////////////////
            // Set up a combo box for selecting the assay
            /////////////////////////////////////////////////////////////////////////////
            cell = $(this.row.insertCell()).css('text-align', 'left');
            aSelect = $('<select>').appendTo(cell)
                .data({ 'setByUser': false })
                .attr('name', 'disamAssay' + i)
                .attr('id', 'disamAssay' + i)
                .addClass(TypeDisambiguationStep.STEP_4_USER_INPUT_CLASS)
                .addClass(TypeDisambiguationStep.STEP_4_REQUIRED_INPUT_CLASS);
            this.selectAssayJQElement = aSelect;
            $('<option>').text('(Create New Assay)').appendTo(aSelect).val('named_or_new')
                .prop('selected', !defaultSel.assayID);
            // add options to the assay combo box
            (ATData.existingAssays[EDDTableImport.selectMajorKindStep.masterProtocol] || []).forEach(function (id) {
                var assay, line, protocol;
                assay = EDDData.Assays[id];
                line = EDDData.Lines[assay.lid];
                protocol = EDDData.Protocols[assay.pid];
                $('<option>').text([line.name, protocol.name, assay.name].join('-'))
                    .appendTo(aSelect).val(id.toString())
                    .prop('selected', defaultSel.assayID === id);
            });
            // a span to contain the text label for the Line pulldown, and the pulldown itself
            cell = $('<span>').text('for Line: ').toggleClass('off', !!defaultSel.assayID)
                .appendTo(cell);
            /////////////////////////////////////////////////////////////////////////////
            // Set up an autocomplete for the line (autocomplete is important for
            // efficiency for studies with many lines).
            /////////////////////////////////////////////////////////////////////////////
            this.appendLineAutoselect(cell, defaultSel);
        };
        return AssayDisambiguationRow;
    }(LineDisambiguationRow));
    EDDTableImport.AssayDisambiguationRow = AssayDisambiguationRow;
    // The class responsible for everything in the "Step 4" box that you see on the data import page.
    // Aggregates & displays a user-relevant/actionable summary of the import process prior to final
    // submission.
    var ReviewStep = (function () {
        function ReviewStep(step1, step2, step3, step4, nextStepCallback) {
            var _this = this;
            this.step1 = step1;
            this.step2 = step2;
            this.step3 = step3;
            this.step4 = step4;
            this.prevSteps = [step1, step2, step3, step4];
            this.nextStepCallback = nextStepCallback;
            this.errorMessages = [];
            this.warningMessages = [];
            this.warningInputs = [];
            this.prevSteps.forEach(function (step, stepIndex) {
                _this.warningInputs[stepIndex] = [];
            });
        }
        ReviewStep.prototype.previousStepChanged = function () {
            var _this = this;
            // re-query each preceding step to get any errorMessages or warningMessages that should be displayed
            // to the user
            this.prevSteps.forEach(function (prevStep, stepIndex) {
                _this.warningMessages[stepIndex] = [].concat(prevStep.getUserWarnings());
                _this.errorMessages[stepIndex] = [].concat(prevStep.getUserErrors());
                _this.warningInputs[stepIndex] = [];
            });
            // build up a short summary section to describe the (potentially large) number of
            // errors / warnings, as well as to give some generally helpful summary (e.g. counts).
            // for starters, we'll only show the summary section with a minimal one-sentence
            // that has directions, though clearly more stuff could be helpful later.
            var totalErrorsCount = this.getMessageCount(this.errorMessages);
            var totalWarningsCount = this.getMessageCount(this.warningMessages);
            var totalMessagesCount = totalErrorsCount + totalWarningsCount;
            var summaryDiv = $('#summaryContentDiv');
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
            this.remakeErrorOrWarningSection(errorsWrapperDiv, errorsDiv, this.errorMessages, totalErrorsCount, "errorMessage", [], false);
            var warningsWrapperDiv = $('#reviewWarningsSection');
            var warningsDiv = $('#reviewWarningsContentDiv');
            this.remakeErrorOrWarningSection(warningsWrapperDiv, warningsDiv, this.warningMessages, totalWarningsCount, "warningMessage", this.warningInputs, true);
            this.updateSubmitEnabled();
        };
        ReviewStep.prototype.arePrevStepRequiredInputsProvided = function () {
            for (var _i = 0, _a = this.prevSteps; _i < _a.length; _i++) {
                var prevStep = _a[_i];
                if (!prevStep.requiredInputsProvided()) {
                    return false;
                }
            }
            return true;
        };
        // enable / disable the submit button, depending on whether submission is expected
        // to succeed based on data available in the UI
        ReviewStep.prototype.updateSubmitEnabled = function () {
            var allPrevStepInputsProvided = this.arePrevStepRequiredInputsProvided();
            var allWarningsAcknowledged = this.areAllWarningsAcknowledged();
            var totalErrorsCount = this.getMessageCount(this.errorMessages);
            var submitButton = $('#submitForImport');
            var wasDisabled = submitButton.prop('disabled');
            var disableSubmit = !(allPrevStepInputsProvided && (totalErrorsCount === 0) && allWarningsAcknowledged);
            submitButton.prop('disabled', disableSubmit);
            // TODO: re-enable me after upgrading to JQuery-UI 1.12+
            // briefly highlight the button if it was enabled/disabled
            // if((wasDisabled != disableSubmit) && allPrevStepInputsProvided) {
            //     submitButton.effect("bounce");
            // }
        };
        ReviewStep.prototype.areAllWarningsAcknowledged = function () {
            for (var _i = 0, _a = this.warningInputs; _i < _a.length; _i++) {
                var stepWarningInputs = _a[_i];
                for (var _b = 0, stepWarningInputs_1 = stepWarningInputs; _b < stepWarningInputs_1.length; _b++) {
                    var warningChkbx = stepWarningInputs_1[_b];
                    if (!warningChkbx.is(':checked')) {
                        return false;
                    }
                }
            }
            return true;
        };
        ReviewStep.prototype.getMessageCount = function (messagesByStep) {
            var messageCount = 0;
            for (var _i = 0, messagesByStep_1 = messagesByStep; _i < messagesByStep_1.length; _i++) {
                var stepMessages = messagesByStep_1[_i];
                messageCount += stepMessages.length;
            }
            return messageCount;
        };
        ReviewStep.prototype.remakeErrorOrWarningSection = function (wrapperDivSelector, contentDivSelector, userMessages, messageCount, messageCssClass, inputs, createCheckboxes) {
            var _this = this;
            var hasRequiredInitialInputs, toggleOff, showAcknowledgeAllBtn, table, tableBody, header, headerCell;
            contentDivSelector.empty();
            hasRequiredInitialInputs = this.arePrevStepRequiredInputsProvided();
            toggleOff = (messageCount === 0) || !hasRequiredInitialInputs;
            wrapperDivSelector.toggleClass('off', toggleOff);
            // clear all the subarrays containing input controls for prior steps
            // TODO: as a future enhancement, we could keep track of which are already acknowledged
            // and keep them checked
            for (var _i = 0, inputs_1 = inputs; _i < inputs_1.length; _i++) {
                var stepMsgInputs = inputs_1[_i];
                stepMsgInputs = [];
            }
            // remove all the inputs from the DOM
            contentDivSelector.empty();
            if ((!hasRequiredInitialInputs) || (!messageCount)) {
                return;
            }
            // if showing checkboxes to acknowledge messages, add a button to ak all of them after
            // a reasonable number
            showAcknowledgeAllBtn = createCheckboxes && (messageCount >= 5);
            if (showAcknowledgeAllBtn) {
                this.addAcknowledgeAllButton(contentDivSelector);
            }
            table = $('<table>').appendTo(contentDivSelector);
            // if we'll be adding checkboxes to the table, set headers to describe what they're for
            if (createCheckboxes) {
                header = $('<thead>').appendTo(table);
                headerCell = $('<th>').text('Warning').appendTo(header);
                headerCell = $('<th>').text('Acknowledge').appendTo(header);
            }
            tableBody = $('<tbody>').appendTo(table)[0];
            userMessages.forEach(function (stepMessages, stepIndex) {
                stepMessages.forEach(function (message) {
                    var row, cell, div, span, msgSpan, checkbox;
                    row = $('<tr>').appendTo(tableBody);
                    cell = $('<td>').css('text-align', 'left').appendTo(row);
                    div = $('<div>').attr('class', messageCssClass).appendTo(cell);
                    span = $('<span class="warningStepLabel">').text("Step " + (stepIndex + 1)).appendTo(div);
                    msgSpan = $('<span>').text(": " + message.message).appendTo(div);
                    if (!createCheckboxes) {
                        return;
                    }
                    cell = $('<td>').css('text-align', 'center').toggleClass('errorMessage', !createCheckboxes).appendTo(row);
                    checkbox = $('<input type="checkbox">').appendTo(cell);
                    _this.warningInputs[stepIndex].push(checkbox);
                    checkbox.on('click', null, {
                        'div': div,
                        'checkbox': checkbox
                    }, function (ev) {
                        var div, checkbox;
                        div = ev.data.div;
                        checkbox = ev.data.checkbox;
                        _this.userSelectedWarningButton(div, checkbox);
                    });
                }, _this);
            });
            // if showing an 'Acknowledge All' button, repeat it at the bottom of the list
            if (showAcknowledgeAllBtn) {
                this.addAcknowledgeAllButton(contentDivSelector);
            }
        };
        ReviewStep.prototype.addAcknowledgeAllButton = function (contentDivSelector) {
            var button = $('<input type="button">')
                .addClass("acknowledgeAllButton")
                .val('Acknowledge  All')
                .click(this.userSelectedAcknowledgeAllButton.bind(this));
            button.appendTo(contentDivSelector);
        };
        ReviewStep.prototype.userSelectedWarningButton = function (div, checkbox) {
            // make the message text appear disabled (note it's purposefully distinct
            // from the checkbox to allow flexibility in expanding table contents)
            div.toggleClass('disabledTextLabel', checkbox.is(':checked'));
            //update the submit button
            this.updateSubmitEnabled();
        };
        ReviewStep.prototype.userSelectedAcknowledgeAllButton = function () {
            // check whether all of the boxes are already checked
            var allSelected = true;
            for (var _i = 0, _a = this.warningInputs; _i < _a.length; _i++) {
                var stepCheckboxes = _a[_i];
                for (var _b = 0, stepCheckboxes_1 = stepCheckboxes; _b < stepCheckboxes_1.length; _b++) {
                    var checkbox = stepCheckboxes_1[_b];
                    if (!checkbox.is(':checked')) {
                        allSelected = false;
                        break;
                    }
                }
            }
            // check or uncheck all of the boxes (some checked will result in all being checked)
            for (var _c = 0, _d = this.warningInputs; _c < _d.length; _c++) {
                var stepCheckboxes = _d[_c];
                for (var _e = 0, stepCheckboxes_2 = stepCheckboxes; _e < stepCheckboxes_2.length; _e++) {
                    var checkbox = stepCheckboxes_2[_e];
                    checkbox.prop('checked', !allSelected);
                }
            }
            this.updateSubmitEnabled();
        };
        return ReviewStep;
    }());
    EDDTableImport.ReviewStep = ReviewStep;
})(EDDTableImport || (EDDTableImport = {}));
$(window).on('load', function () {
    EDDTableImport.onWindowLoad();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzYXlUYWJsZURhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJBc3NheVRhYmxlRGF0YS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELDZDQUE2QztBQUM3QyxrREFBa0Q7QUFDbEQsMkNBQTJDO0FBQzNDLCtCQUErQjs7Ozs7O0FBVS9CLFFBQVEsR0FBRyxNQUFNLENBQUM7QUFDbEIsUUFBUSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsUUFBUSxJQUFJLFVBQVUsS0FBVTtJQUN6RCxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN4RCxDQUFDLENBQUM7QUFDRixRQUFRLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLElBQUksVUFBVSxLQUFVO0lBQ25ELE1BQU0sQ0FBQyxLQUFLLEtBQUssS0FBSyxDQUFDO0FBQzNCLENBQUMsQ0FBQztBQVdGLHlFQUF5RTtBQUN6RSxvR0FBb0c7QUFDcEcsdURBQXVEO0FBQ3ZELHdGQUF3RjtBQUN4RixzRkFBc0Y7QUFDdEYsZ0VBQWdFO0FBQ2hFLElBQU8sY0FBYyxDQXF4SHBCO0FBcnhIRCxXQUFPLGNBQWMsRUFBQyxDQUFDO0lBQ25CLFlBQVksQ0FBQztJQWtEYixxRkFBcUY7SUFDckY7UUFVSSx1QkFBWSxPQUFjLEVBQUUsc0JBQWtDLEVBQUUsa0JBQTJCO1lBQS9ELHNDQUFrQyxHQUFsQyw2QkFBa0M7WUFBRSxrQ0FBMkIsR0FBM0IseUJBQTJCO1lBQ3ZGLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxzQkFBc0IsQ0FBQztZQUNyRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsa0JBQWtCLENBQUM7UUFDakQsQ0FBQztRQUNMLG9CQUFDO0lBQUQsQ0FBQyxBQWZELElBZUM7SUFmWSw0QkFBYSxnQkFlekIsQ0FBQTtJ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Q0FBQztvQkFDVixDQUFDO2lCQUNKO2FBQ0o7WUFDRCxvRkFBb0Y7WUFDcEYsR0FBRyxDQUFDLENBQXVCLFVBQWtCLEVBQWxCLEtBQUEsSUFBSSxDQUFDLGFBQWEsRUFBbEIsY0FBa0IsRUFBbEIsSUFBa0IsQ0FBQztnQkFBekMsSUFBSSxjQUFjLFNBQUE7Z0JBQ25CLEdBQUcsQ0FBQyxDQUFpQixVQUFjLEVBQWQsaUNBQWMsRUFBZCw0QkFBYyxFQUFkLElBQWMsQ0FBQztvQkFBL0IsSUFBSSxRQUFRLHVCQUFBO29CQUNiLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUM7aUJBQzFDO2FBQ0o7WUFFRCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUMvQixDQUFDO1FBQ0wsaUJBQUM7SUFBRCxDQUFDLEFBNU9ELElBNE9DO0lBNU9ZLHlCQUFVLGFBNE90QixDQUFBO0FBQ0wsQ0FBQyxFQXJ4SE0sY0FBYyxLQUFkLGNBQWMsUUFxeEhwQjtBQUdELENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFO0lBQ2pCLGNBQWMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUNsQyxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGUgbGFzdCBtb2RpZmllZCBvbjogV2VkIERlYyAyMSAyMDE2IDE0OjUzOjM1ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL2QzL2QzLmQudHNcIi8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQXNzYXlUYWJsZURhdGFHcmFwaGluZy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRUREQXV0b2NvbXBsZXRlLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJVdGwudHNcIiAvPlxuXG5cblxuZGVjbGFyZSB2YXIgQVREYXRhOiBhbnk7IC8vIFNldHVwIGJ5IHRoZSBzZXJ2ZXIuXG5kZWNsYXJlIHZhciBFRERBVERHcmFwaGluZzogYW55O1xuZGVjbGFyZSB2YXIgRUREX2F1dG86IGFueTtcblxuLy8gRG9pbmcgdGhpcyBidWxsc2hpdCBiZWNhdXNlIFR5cGVTY3JpcHQvSW50ZXJuZXRFeHBsb3JlciBkbyBub3QgcmVjb2duaXplIHN0YXRpYyBtZXRob2RzIG9uIE51bWJlclxuZGVjbGFyZSB2YXIgSlNOdW1iZXI6IGFueTtcbkpTTnVtYmVyID0gTnVtYmVyO1xuSlNOdW1iZXIuaXNGaW5pdGUgPSBKU051bWJlci5pc0Zpbml0ZSB8fCBmdW5jdGlvbiAodmFsdWU6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIGlzRmluaXRlKHZhbHVlKTtcbn07XG5KU051bWJlci5pc05hTiA9IEpTTnVtYmVyLmlzTmFOIHx8IGZ1bmN0aW9uICh2YWx1ZTogYW55KSB7XG4gICAgcmV0dXJuIHZhbHVlICE9PSB2YWx1ZTtcbn07XG5cblxuLy8gVHlwZSBuYW1lIGZvciB0aGUgZ3JpZCBvZiB2YWx1ZXMgcGFzdGVkIGluXG5pbnRlcmZhY2UgUmF3SW5wdXQgZXh0ZW5kcyBBcnJheTxzdHJpbmdbXT4geyB9XG4vLyB0eXBlIGZvciB0aGUgc3RhdHMgZ2VuZXJhdGVkIGZyb20gcGFyc2luZyBpbnB1dCB0ZXh0XG5pbnRlcmZhY2UgUmF3SW5wdXRTdGF0IHtcbiAgICBpbnB1dDogUmF3SW5wdXQ7XG4gICAgY29sdW1uczogbnVtYmVyO1xufVxuXG4vLyBUaGlzIG1vZHVsZSBlbmNhcHN1bGF0ZXMgYWxsIHRoZSBjdXN0b20gY29kZSBmb3IgdGhlIGRhdGEgaW1wb3J0IHBhZ2UuXG4vLyBJdCBjb25zaXN0cyBwcmltYXJpbHkgb2YgYSBzZXJpZXMgb2YgY2xhc3NlcywgZWFjaCBjb3JyZXNwb25kaW5nIHRvIGEgc3RlcCBpbiB0aGUgaW1wb3J0IHByb2Nlc3MsXG4vLyB3aXRoIGEgY29ycmVzcG9uZGluZyBjaHVuayBvZiBVSSBvbiB0aGUgaW1wb3J0IHBhZ2UuXG4vLyBFYWNoIGNsYXNzIHB1bGxzIGRhdGEgZnJvbSBvbmUgb3IgbW9yZSBwcmV2aW91cyBzdGVwcywgZG9lcyBzb21lIGludGVybmFsIHByb2Nlc3NpbmcsXG4vLyB0aGVuIHRyaWdnZXJzIGEgY2FsbGJhY2sgZnVuY3Rpb24sIGFubm91bmNpbmcgdGhlIGF2YWlsYWJpbGl0eSBvZiBpdHMgb3duIG5ldyBkYXRhLlxuLy8gVGhlIGNhbGxiYWNrIGZ1bmN0aW9uIHRyaWdnZXJzIHRoZSBpbnN0YW5jZSBvZiB0aGUgbmV4dCBzdGVwLlxubW9kdWxlIEVERFRhYmxlSW1wb3J0IHtcbiAgICAndXNlIHN0cmljdCc7XG4gICAgLy8gRHVyaW5nIGluaXRpYWxpemF0aW9uIHdlIHdpbGwgYWxsb2NhdGUgb25lIGluc3RhbmNlIG9mIGVhY2ggb2YgdGhlIGNsYXNzZXNcbiAgICAvLyB0aGF0IGhhbmRsZSB0aGUgbWFqb3Igc3RlcHMgb2YgdGhlIGltcG9ydCBwcm9jZXNzLlxuICAgIC8vIFRoZXNlIGFyZSBzcGVjaWZpZWQgaW4gdGhlIG9yZGVyIHRoZXkgYXJlIGNhbGxlZCwgYW5kIHRoZSBvcmRlciB0aGV5IGFwcGVhciBvbiB0aGUgcGFnZTpcbiAgICBleHBvcnQgdmFyIHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXA7XG4gICAgZXhwb3J0IHZhciByYXdJbnB1dFN0ZXA6IFJhd0lucHV0U3RlcDtcbiAgICBleHBvcnQgdmFyIGlkZW50aWZ5U3RydWN0dXJlc1N0ZXA6IElkZW50aWZ5U3RydWN0dXJlc1N0ZXA7XG4gICAgZXhwb3J0IHZhciB0eXBlRGlzYW1iaWd1YXRpb25TdGVwOiBUeXBlRGlzYW1iaWd1YXRpb25TdGVwO1xuICAgIGV4cG9ydCB2YXIgcmV2aWV3U3RlcDogUmV2aWV3U3RlcDtcblxuXG4gICAgaW50ZXJmYWNlIFJhd01vZGVQcm9jZXNzb3Ige1xuICAgICAgICBwYXJzZShyYXdJbnB1dFN0ZXA6IFJhd0lucHV0U3RlcCwgcmF3RGF0YTogc3RyaW5nKTogUmF3SW5wdXRTdGF0O1xuICAgICAgICBwcm9jZXNzKHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCBzdGF0OiBSYXdJbnB1dFN0YXQpOiB2b2lkO1xuICAgIH1cblxuXG4gICAgaW50ZXJmYWNlIE1lYXN1cmVtZW50VmFsdWVTZXF1ZW5jZSB7XG4gICAgICAgIGRhdGE6IChzdHJpbmcgfCBudW1iZXIpW11bXTsgIC8vIG1heSBiZSByZWNlaXZlZCBhcyBzdHJpbmcsIHNob3VsZCBpbnNlcnQgYXMgbnVtYmVyXG4gICAgfVxuXG4gICAgaW50ZXJmYWNlIEdyYXBoaW5nU2V0IGV4dGVuZHMgTWVhc3VyZW1lbnRWYWx1ZVNlcXVlbmNlIHtcbiAgICAgICAgbGFiZWw6IHN0cmluZztcbiAgICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgICB1bml0czogc3RyaW5nO1xuICAgICAgICBjb2xvcj86IHN0cmluZztcbiAgICAgICAgdGFncz86IGFueTtcbiAgICB9XG4gICAgLy8gVGhlc2UgYXJlIHJldHVybmVkIGJ5IHRoZSBzZXJ2ZXIgYWZ0ZXIgcGFyc2luZyBhIGRyb3BwZWQgZmlsZVxuICAgIGludGVyZmFjZSBSYXdJbXBvcnRTZXQgZXh0ZW5kcyBNZWFzdXJlbWVudFZhbHVlU2VxdWVuY2Uge1xuICAgICAgICBraW5kOiBzdHJpbmc7XG4gICAgICAgIGxpbmVfbmFtZTogc3RyaW5nO1xuICAgICAgICBhc3NheV9uYW1lOiBzdHJpbmc7XG4gICAgICAgIG1lYXN1cmVtZW50X25hbWU6IHN0cmluZztcbiAgICAgICAgbWV0YWRhdGFfYnlfbmFtZT86IHtbaWQ6c3RyaW5nXTogc3RyaW5nfTtcbiAgICB9XG4gICAgLy8gVGhpcyBpbmZvcm1hdGlvbiBpcyBhZGRlZCBwb3N0LWRpc2FtYmlndWF0aW9uLCBpbiBhZGRpdGlvbiB0byB0aGUgZmllbGRzIGZyb20gUmF3SW1wb3J0U2V0LFxuICAgIC8vIGFuZCBzZW50IHRvIHRoZSBzZXJ2ZXJcbiAgICBpbnRlcmZhY2UgUmVzb2x2ZWRJbXBvcnRTZXQgZXh0ZW5kcyBSYXdJbXBvcnRTZXQge1xuICAgICAgICBwcm90b2NvbF9pZDpudW1iZXI7XG4gICAgICAgIC8vIFZhbHVlIG9mICdudWxsJyBvciBzdHJpbmcgJ25ldycgaW5kaWNhdGVzIG5ldyBMaW5lIHNob3VsZCBiZSBjcmVhdGVkIHdpdGhcbiAgICAgICAgLy8gbmFtZSBsaW5lX25hbWUuXG4gICAgICAgIGxpbmVfaWQ6c3RyaW5nO1xuICAgICAgICBhc3NheV9pZDpzdHJpbmc7XG4gICAgICAgIG1lYXN1cmVtZW50X2lkOnN0cmluZztcbiAgICAgICAgY29tcGFydG1lbnRfaWQ6c3RyaW5nO1xuICAgICAgICB1bml0c19pZDpzdHJpbmc7XG4gICAgICAgIG1ldGFkYXRhX2J5X2lkOntbaWQ6c3RyaW5nXTogc3RyaW5nfTtcbiAgICB9XG5cbiAgICAvLyBDYXB0dXJlcyBpbXBvcnRhbnQgaW5mb3JtYXRpb24gdG8gYmUgcmV2aWV3ZWQgYnkgdGhlIHVzZXIgaW4gdGhlIGZpbmFsIGltcG9ydCBzdGVwXG4gICAgZXhwb3J0IGNsYXNzIEltcG9ydE1lc3NhZ2Uge1xuICAgICAgICBtZXNzYWdlOnN0cmluZztcblxuICAgICAgICAvL29wdGlvbmFsLiBmb3IgcG9zc2libGUgZnV0dXJlIHVzZSBpbiBoaWdobGlnaHRpbmcgLyBzY3JvbGxpbmcgdG8gLyBldGMuXG4gICAgICAgIHJlbGF0ZWRDb250cm9sU2VsZWN0b3I6c3RyaW5nO1xuXG4gICAgICAgIC8vIG9wdGlvbmFsLiBuby1pbnB1dCBmdW5jdGlvbiB0byBjYWxsIHRvIHJlZXZhbHVhdGUgdGhlIGVycm9yL3dhcm5pbmcgYW5kIHRoZW4gdXBkYXRlXG4gICAgICAgIC8vIHRoZSBVSSB3aXRoIHRoZSByZXN1bHQgKGUuZy4gYnkgcmUtcXVlcnlpbmcgYSBSRVNUIHJlc291cmNlKS5cbiAgICAgICAgcmVldmFsdWF0ZUZ1bmN0aW9uOmFueTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihtZXNzYWdlOnN0cmluZywgcmVsYXRlZENvbnRyb2xTZWxlY3RvcjpzdHJpbmc9bnVsbCwgcmVldmFsdWF0ZUZ1bmN0aW9uOmFueT1udWxsKSB7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgICAgICAgICAgdGhpcy5yZWxhdGVkQ29udHJvbFNlbGVjdG9yID0gcmVsYXRlZENvbnRyb2xTZWxlY3RvcjtcbiAgICAgICAgICAgIHRoaXMucmVldmFsdWF0ZUZ1bmN0aW9uID0gcmVldmFsdWF0ZUZ1bmN0aW9uO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8vIGRlZmluZXMgY29tbW9uIG1ldGhvZHMgb2YgYWxsIGltcG9ydCBzdGVwcyBwcmlvciB0byB0aGUgUmV2aWV3U3RlcCAoIzUpLiBUaGUgUmV2aWV3U3RlcCB1c2VzXG4gICAgLy8gdGhlIGZ1bmN0aW9uIGNhbGxzIGRlZmluZWQgaGVyZSB0byBwb2xsIHByaW9yIHN0ZXBzIGZvciBlcnJvci8gd2FybmluZyBtZXNzYWdlcyB0aGF0IHNob3VsZCBiZVxuICAgIC8vIHN1bW1hcml6ZWQgZm9yIHRoZSB1c2VyIGluIHRoZSBVSSBwcmlvciB0byB0aGUgaW1wb3J0LiBBbnkgZXJyb3IgbWVzc2FnZXMgd2lsbCBwcmV2ZW50IHRoZSBpbXBvcnRcbiAgICAvLyBmcm9tIHByb2NlZWRpbmcgdW50aWwgdGhleSdyZSByZXNvbHZlZC4gV2FybmluZ3MgbXVzdCBiZSBhY2tub3dsZWRnZWQgYnkgY2hlY2tpbmcgYSBjaGVja2JveFxuICAgIC8vIGJlZm9yZSB0aGUgaW1wb3J0IGNhbiBwcm9jZWVkLlxuICAgIGludGVyZmFjZSBJbXBvcnRTdGVwIHtcbiAgICAgICAgZ2V0VXNlcldhcm5pbmdzKCk6SW1wb3J0TWVzc2FnZVtdO1xuICAgICAgICBnZXRVc2VyRXJyb3JzKCk6SW1wb3J0TWVzc2FnZVtdO1xuICAgICAgICByZXF1aXJlZElucHV0c1Byb3ZpZGVkKCk6Ym9vbGVhbjsgLy8gdGVzdHMgd2hldGhlciBhbGwgcmVxdWlyZWQgaW5wdXQgY29udHJvbHMgaGF2ZSBhIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAobm90IHdoZXRoZXIgdmFsdWVzIGFyZSBjb21wYXRpYmxlIC8gY29uc2lzdGVudClcblxuICAgICAgICAvLyBjYWxsZWQgdG8gaW5mb3JtIHRoaXMgc3RlcCB0aGF0IHRoZSBwcmV2aW91cyBzdGVwIGhhcyBjb21wbGV0ZWQgaXRzIHByb2Nlc3NpbmcgYXMgYVxuICAgICAgICAvLyByZXN1bHQgb2YgaW5wdXQgY2hhbmdlcyBzb21ld2hlcmUgdXBzdHJlYW1cbiAgICAgICAgcHJldmlvdXNTdGVwQ2hhbmdlZCgpOnZvaWQ7XG4gICAgfVxuXG4gICAgLy8gQXMgc29vbiBhcyB0aGUgd2luZG93IGxvYWQgc2lnbmFsIGlzIHNlbnQsIGNhbGwgYmFjayB0byB0aGUgc2VydmVyIGZvciB0aGUgc2V0IG9mIHJlZmVyZW5jZSByZWNvcmRzXG4gICAgLy8gdGhhdCB3aWxsIGJlIHVzZWQgdG8gZGlzYW1iaWd1YXRlIGxhYmVscyBpbiBpbXBvcnRlZCBkYXRhLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBvbldpbmRvd0xvYWQoKTogdm9pZCB7XG4gICAgICAgIHZhciBhdGRhdGFfdXJsOnN0cmluZztcblxuICAgICAgICBhdGRhdGFfdXJsID0gXCIvc3R1ZHkvXCIgKyBFREREYXRhLmN1cnJlbnRTdHVkeUlEICsgXCIvYXNzYXlkYXRhXCI7XG5cbiAgICAgICAgJCgnLmRpc2Nsb3NlJykuZmluZCgnYS5kaXNjbG9zZUxpbmsnKS5vbignY2xpY2snLCBFRERUYWJsZUltcG9ydC5kaXNjbG9zZSk7XG4gICAgICAgIC8vIFBvcHVsYXRlIEFURGF0YSBhbmQgRURERGF0YSBvYmplY3RzIHZpYSBBSkFYIGNhbGxzXG4gICAgICAgIGpRdWVyeS5hamF4KGF0ZGF0YV91cmwsIHtcbiAgICAgICAgICAgIFwic3VjY2Vzc1wiOiBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICAgICAgJC5leHRlbmQoQVREYXRhLCBkYXRhLkFURGF0YSk7XG4gICAgICAgICAgICAgICAgJC5leHRlbmQoRURERGF0YSwgZGF0YS5FREREYXRhKTtcbiAgICAgICAgICAgICAgICBFRERUYWJsZUltcG9ydC5vblJlZmVyZW5jZVJlY29yZHNMb2FkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLmZhaWwoZnVuY3Rpb24oeCwgcywgZSkge1xuICAgICAgICAgICAgYWxlcnQocyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gQXMgc29vbiBhcyB3ZSd2ZSBnb3QgYW5kIHBhcnNlZCB0aGUgcmVmZXJlbmNlIGRhdGEsIHdlIGNhbiBzZXQgdXAgYWxsIHRoZSBjYWxsYmFja3MgZm9yIHRoZSBVSSxcbiAgICAvLyBlZmZlY3RpdmVseSB0dXJuaW5nIHRoZSBwYWdlIFwib25cIi5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25SZWZlcmVuY2VSZWNvcmRzTG9hZCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIHN0ZXAxLCBzdGVwMiwgc3RlcDMsIHN0ZXA0LCBzdGVwNTtcblxuICAgICAgICAvL1RPRE86IGNsYXJpZnkgcmVmbGVjdGVkIEdVSSBzdGF0ZSB3aGVuIHdhaXRpbmcgZm9yIGxhcmdlIGRhdGFzZXQgZnJvbSB0aGUgc2VydmVyLlxuICAgICAgICAvLyBpbiBzZXZlcmFsIHRlc3QgY2FzZXMgd2l0aCBsYXJnZSAjJ3Mgb2YgbGluZXMsIHRoZXJlJ3MgdGltZSBmb3IgdGhlIHVzZXIgdG8gcmVhY2ggYVxuICAgICAgICAvLyBsYXRlciAvIGNvbmZ1c2luZyBzdGVwIGluIHRoZSBwcm9jZXNzIHdoaWxlIHdhaXRpbmcgb24gdGhpcyBkYXRhIHRvIGJlIHJldHVybmVkLlxuICAgICAgICAvLyBQcm9iYWJseSBzaG91bGQgZml4IHRoaXMgaW4gRURELTE4Mi5cbiAgICAgICAgJCgnI3dhaXRpbmdGb3JTZXJ2ZXJMYWJlbCcpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICAvLyBBbGxvY2F0ZSBvbmUgaW5zdGFuY2Ugb2YgZWFjaCBzdGVwLCBwcm92aWRpbmcgcmVmZXJlbmNlcyB0byB0aGUgcHJldmlvdXMgc3RlcHMgYXMgbmVlZGVkLlxuICAgICAgICBzdGVwMSA9IG5ldyBTZWxlY3RNYWpvcktpbmRTdGVwKEVERFRhYmxlSW1wb3J0LnNlbGVjdE1ham9yS2luZENhbGxiYWNrKTtcbiAgICAgICAgc3RlcDIgPSBuZXcgUmF3SW5wdXRTdGVwKHN0ZXAxLCBFRERUYWJsZUltcG9ydC5yYXdJbnB1dENhbGxiYWNrLCBFRERUYWJsZUltcG9ydC5wcm9jZXNzaW5nRmlsZUNhbGxiYWNrKTtcbiAgICAgICAgc3RlcDMgPSBuZXcgSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcChzdGVwMSwgc3RlcDIsIEVERFRhYmxlSW1wb3J0LmlkZW50aWZ5U3RydWN0dXJlc0NhbGxiYWNrKTtcbiAgICAgICAgc3RlcDQgPSBuZXcgVHlwZURpc2FtYmlndWF0aW9uU3RlcChzdGVwMSwgc3RlcDMsIEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvbkNhbGxiYWNrKTtcbiAgICAgICAgc3RlcDUgPSBuZXcgUmV2aWV3U3RlcChzdGVwMSwgc3RlcDIsIHN0ZXAzLCBzdGVwNCwgRUREVGFibGVJbXBvcnQucmV2aWV3U3RlcENhbGxiYWNrKTtcblxuICAgICAgICBFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRTdGVwID0gc3RlcDE7XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnJhd0lucHV0U3RlcCA9IHN0ZXAyO1xuICAgICAgICBFRERUYWJsZUltcG9ydC5pZGVudGlmeVN0cnVjdHVyZXNTdGVwID0gc3RlcDM7XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAgPSBzdGVwNDtcbiAgICAgICAgRUREVGFibGVJbXBvcnQucmV2aWV3U3RlcCA9IHN0ZXA1O1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlIGZ1bmN0aW9uIHRoYXQgc3VibWl0cyB0aGUgcGFnZVxuICAgICAgICAkKCcjc3VibWl0Rm9ySW1wb3J0Jykub24oJ2NsaWNrJywgRUREVGFibGVJbXBvcnQuc3VibWl0Rm9ySW1wb3J0KTtcblxuICAgICAgICAvLyBXZSBuZWVkIHRvIG1hbnVhbGx5IHRyaWdnZXIgdGhpcywgYWZ0ZXIgYWxsIG91ciBzdGVwcyBhcmUgY29uc3RydWN0ZWQuXG4gICAgICAgIC8vIFRoaXMgd2lsbCBjYXNjYWRlIGNhbGxzIHRocm91Z2ggdGhlIHJlc3Qgb2YgdGhlIHN0ZXBzIGFuZCBjb25maWd1cmUgdGhlbSB0b28uXG4gICAgICAgIHN0ZXAxLnF1ZXVlUmVjb25maWd1cmUoKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGJ5IG91ciBpbnN0YW5jZSBvZiBzZWxlY3RNYWpvcktpbmRTdGVwIHRvIGFubm91bmNlIGNoYW5nZXMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdE1ham9yS2luZENhbGxiYWNrKCk6IHZvaWQge1xuICAgICAgICAvLyBUaGlzIGlzIGEgYml0IG9mIGEgaGFjay4gIFdlIHdhbnQgdG8gY2hhbmdlIHRoZSBwdWxsZG93biBzZXR0aW5ncyBpbiBTdGVwIDMgaWYgdGhlIG1vZGVcbiAgICAgICAgLy8gaW4gU3RlcCAxIGlzIGNoYW5nZWQsIGJ1dCBsZWF2ZSB0aGUgcHVsbGRvd24gYWxvbmUgb3RoZXJ3aXNlIChpbmNsdWRpbmcgd2hlbiBTdGVwIDJcbiAgICAgICAgLy8gYW5ub3VuY2VzIGl0cyBvd24gY2hhbmdlcy4pXG4gICAgICAgIC8vIFRPRE86IE1ha2UgU3RlcCAzIHRyYWNrIHRoaXMgd2l0aCBhbiBpbnRlcm5hbCB2YXJpYWJsZS5cbiAgICAgICAgaWYgKEVERFRhYmxlSW1wb3J0LnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlID09ICdtZHYnKSB7XG4gICAgICAgICAgICAvLyBBIGRlZmF1bHQgc2V0IG9mIHB1bGxkb3duIHNldHRpbmdzIGZvciB0aGlzIG1vZGVcbiAgICAgICAgICAgIEVERFRhYmxlSW1wb3J0LmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucHVsbGRvd25TZXR0aW5ncyA9IFtcbiAgICAgICAgICAgICAgICBUeXBlRW51bS5Bc3NheV9MaW5lX05hbWVzLFxuICAgICAgICAgICAgICAgIFR5cGVFbnVtLk1lYXN1cmVtZW50X1R5cGVcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICAgICAgRUREVGFibGVJbXBvcnQucmF3SW5wdXRTdGVwLnByZXZpb3VzU3RlcENoYW5nZWQoKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGJ5IG91ciBpbnN0YW5jZSBvZiBTdGVwIDIsIFJhd0lucHV0U3RlcCB0byBhbm5vdW5jZSBjaGFuZ2VzLlxuICAgIC8vIFdlIGp1c3QgcGFzcyB0aGUgc2lnbmFsIGFsb25nIHRvIFN0ZXAgMzogSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmF3SW5wdXRDYWxsYmFjaygpOiB2b2lkIHtcbiAgICAgICAgRUREVGFibGVJbXBvcnQuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkKCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBieSBvdXIgaW5zdGFuY2Ugb2YgU3RlcCAzLCBJZGVudGlmeVN0cnVjdHVyZXNTdGVwIHRvIGFubm91bmNlIGNoYW5nZXMuXG4gICAgLy8gV2UganVzdCBwYXNzIHRoZSBzaWduYWwgYWxvbmcgdG8gU3RlcCA0OiBUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBpZGVudGlmeVN0cnVjdHVyZXNDYWxsYmFjaygpOiB2b2lkIHtcbiAgICAgICAgRUREVGFibGVJbXBvcnQudHlwZURpc2FtYmlndWF0aW9uU3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkKCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBieSBvdXIgaW5zdGFuY2Ugb2YgVHlwZURpc2FtYmlndWF0aW9uU3RlcCB0byBhbm5vdW5jZSBjaGFuZ2VzLlxuICAgIC8vIEFsbCB3ZSBkbyBjdXJyZW50bHkgaXMgcmVwb3B1bGF0ZSB0aGUgZGVidWcgYXJlYS5cbiAgICBleHBvcnQgZnVuY3Rpb24gdHlwZURpc2FtYmlndWF0aW9uQ2FsbGJhY2soKTogdm9pZCB7XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnJldmlld1N0ZXAucHJldmlvdXNTdGVwQ2hhbmdlZCgpO1xuICAgIH1cblxuICAgIC8vIHRlbGxzIHN0ZXAgMyB0aGF0IHN0ZXAgMiBoYXMganVzdCBiZWd1biBwcm9jZXNzaW5nIGZpbGUgaW5wdXRcbiAgICBleHBvcnQgZnVuY3Rpb24gcHJvY2Vzc2luZ0ZpbGVDYWxsYmFjaygpOiB2b2lkIHtcbiAgICAgICAgRUREVGFibGVJbXBvcnQuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wcm9jZXNzaW5nRmlsZUluUHJldmlvdXNTdGVwKCk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJldmlld1N0ZXBDYWxsYmFjaygpOiB2b2lkIHtcbiAgICAgICAgLy8gbm90aGluZyB0byBkbyEgbm8gc3Vic2VxdWVudCBzdGVwc1xuICAgIH1cblxuXG4gICAgLy8gV2hlbiB0aGUgc3VibWl0IGJ1dHRvbiBpcyBwdXNoZWQsIGZldGNoIHRoZSBtb3N0IHJlY2VudCByZWNvcmQgc2V0cyBmcm9tIG91clxuICAgIC8vIElkZW50aWZ5U3RydWN0dXJlc1N0ZXAgaW5zdGFuY2UsIGFuZCBlbWJlZCB0aGVtIGluIHRoZSBoaWRkZW4gZm9ybSBmaWVsZCB0aGF0IHdpbGwgYmVcbiAgICAvLyBzdWJtaXR0ZWQgdG8gdGhlIHNlcnZlci5cbiAgICAvLyBOb3RlIHRoYXQgdGhpcyBpcyBub3QgYWxsIHRoYXQgdGhlIHNlcnZlciBuZWVkcywgaW4gb3JkZXIgdG8gc3VjY2Vzc2Z1bGx5IHByb2Nlc3MgYW5cbiAgICAvLyBpbXBvcnQuIEl0IGFsc28gcmVhZHMgb3RoZXIgZm9ybSBlbGVtZW50cyBmcm9tIHRoZSBwYWdlLCBjcmVhdGVkIGJ5IFNlbGVjdE1ham9yS2luZFN0ZXBcbiAgICAvLyBhbmQgVHlwZURpc2FtYmlndWF0aW9uU3RlcC5cbiAgICBleHBvcnQgZnVuY3Rpb24gc3VibWl0Rm9ySW1wb3J0KCk6IHZvaWQge1xuICAgICAgICB2YXIganNvbjogc3RyaW5nLCByZXNvbHZlZFNldHM7XG4gICAgICAgIHJlc29sdmVkU2V0cyA9IEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuY3JlYXRlU2V0c0ZvclN1Ym1pc3Npb24oKTtcbiAgICAgICAganNvbiA9IEpTT04uc3RyaW5naWZ5KHJlc29sdmVkU2V0cyk7XG4gICAgICAgICQoJyNqc29ub3V0cHV0JykudmFsKGpzb24pO1xuICAgICAgICAkKCcjanNvbmRlYnVnYXJlYScpLnZhbChqc29uKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1c3VhbCBjbGljay10by1kaXNjbG9zZSBjYWxsYmFjay4gIFBlcmhhcHMgdGhpcyBzaG91bGQgYmUgaW4gVXRsLnRzP1xuICAgIGV4cG9ydCBmdW5jdGlvbiBkaXNjbG9zZSgpOiBib29sZWFuIHtcbiAgICAgICAgJCh0aGlzKS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB2YXIgREVGQVVMVF9NQVNURVJfUFJPVE9DT0w6c3RyaW5nID0gJ3Vuc3BlY2lmaWVkX3Byb3RvY29sJztcblxuXG4gICAgLy8gVGhlIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBldmVyeXRoaW5nIGluIHRoZSBcIlN0ZXAgMVwiIGJveCB0aGF0IHlvdSBzZWUgb24gdGhlIGRhdGEgaW1wb3J0XG4gICAgLy8gcGFnZS4gSGVyZSB3ZSBwcm92aWRlIFVJIGZvciBzZWxlY3RpbmcgdGhlIG1ham9yIGtpbmQgb2YgaW1wb3J0LCBhbmQgdGhlIFByb3RvY29sIHRoYXQgdGhlXG4gICAgLy8gZGF0YSBzaG91bGQgYmUgc3RvcmVkIHVuZGVyLiBUaGVzZSBjaG9pY2VzIGFmZmVjdCB0aGUgYmVoYXZpb3Igb2YgYWxsIHN1YnNlcXVlbnQgc3RlcHMuXG4gICAgZXhwb3J0IGNsYXNzIFNlbGVjdE1ham9yS2luZFN0ZXAge1xuXG4gICAgICAgIC8vIFRoZSBQcm90b2NvbCBmb3Igd2hpY2ggd2Ugd2lsbCBiZSBpbXBvcnRpbmcgZGF0YS5cbiAgICAgICAgbWFzdGVyUHJvdG9jb2w6IG51bWJlcjtcbiAgICAgICAgLy8gVGhlIG1haW4gbW9kZSB3ZSBhcmUgaW50ZXJwcmV0aW5nIGRhdGEgaW4uXG4gICAgICAgIC8vIFZhbGlkIHZhbHVlcyBzb2ZhciBhcmUgXCJzdGRcIiwgXCJtZHZcIiwgXCJ0clwiLCBcImhwbGNcIiwgXCJwclwiLCBhbmQgXCJiaW9sZWN0b3JcIi5cbiAgICAgICAgaW50ZXJwcmV0YXRpb25Nb2RlOiBzdHJpbmc7XG4gICAgICAgIGlucHV0UmVmcmVzaFRpbWVySUQ6IG51bWJlcjtcblxuICAgICAgICBuZXh0U3RlcENhbGxiYWNrOiBhbnk7XG5cblxuICAgICAgICBjb25zdHJ1Y3RvcihuZXh0U3RlcENhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgICAgIHRoaXMubWFzdGVyUHJvdG9jb2wgPSAwO1xuICAgICAgICAgICAgLy8gV2UgcmVseSBvbiBhIHNlcGFyYXRlIGNhbGwgdG8gcmVjb25maWd1cmUoKSB0byBzZXQgdGhpcyBwcm9wZXJseS5cbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0YXRpb25Nb2RlID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuaW5wdXRSZWZyZXNoVGltZXJJRCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2sgPSBuZXh0U3RlcENhbGxiYWNrO1xuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJhdGhlciBhIGxvdCBvZiBjYWxsYmFja3MsIGJ1dCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSdyZSB0cmFja2luZyB0aGVcbiAgICAgICAgICAgIC8vIG1pbmltdW0gbnVtYmVyIG9mIGVsZW1lbnRzIHdpdGggdGhpcyBjYWxsLCBzaW5jZSB0aGUgZnVuY3Rpb24gY2FsbGVkIGhhcyBzdWNoXG4gICAgICAgICAgICAvLyBzdHJvbmcgZWZmZWN0cyBvbiB0aGUgcmVzdCBvZiB0aGUgcGFnZS5cbiAgICAgICAgICAgIC8vIEZvciBleGFtcGxlLCBhIHVzZXIgc2hvdWxkIGJlIGZyZWUgdG8gY2hhbmdlIFwibWVyZ2VcIiB0byBcInJlcGxhY2VcIiB3aXRob3V0IGhhdmluZ1xuICAgICAgICAgICAgLy8gdGhlaXIgZWRpdHMgaW4gU3RlcCAyIGVyYXNlZC5cbiAgICAgICAgICAgICQoXCIjbWFzdGVyUHJvdG9jb2xcIikub24oJ2NoYW5nZScsIHRoaXMucXVldWVSZWNvbmZpZ3VyZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAgICAgLy8gVXNpbmcgXCJjaGFuZ2VcIiBmb3IgdGhlc2UgYmVjYXVzZSBpdCdzIG1vcmUgZWZmaWNpZW50IEFORCBiZWNhdXNlIGl0IHdvcmtzIGFyb3VuZCBhblxuICAgICAgICAgICAgLy8gaXJyaXRhdGluZyBDaHJvbWUgaW5jb25zaXN0ZW5jeVxuICAgICAgICAgICAgLy8gRm9yIHNvbWUgb2YgdGhlc2UsIGNoYW5naW5nIHRoZW0gc2hvdWxkbid0IGFjdHVhbGx5IGFmZmVjdCBwcm9jZXNzaW5nIHVudGlsIHdlXG4gICAgICAgICAgICAvLyBpbXBsZW1lbnQgYW4gb3ZlcndyaXRlLWNoZWNraW5nIGZlYXR1cmUgb3Igc29tZXRoaW5nIHNpbWlsYXJcbiAgICAgICAgICAgICQoJzpyYWRpb1tuYW1lPWRhdGFsYXlvdXRdJywgJyNzZWxlY3RNYWpvcktpbmRTdGVwJykub24oXG4gICAgICAgICAgICAgICAgJ2NoYW5nZScsIHRoaXMucXVldWVSZWNvbmZpZ3VyZS5iaW5kKHRoaXMpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJlY29uZmlndXJlIHJvdXRpbmUuXG4gICAgICAgIC8vIFRoaXMgd2F5IHdlIGNvbmRlbnNlIG11bHRpcGxlIHBvc3NpYmxlIGV2ZW50cyBmcm9tIHRoZSByYWRpbyBidXR0b25zIGFuZC9vciBwdWxsZG93biBpbnRvIG9uZS5cbiAgICAgICAgcXVldWVSZWNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaW5wdXRSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQodGhpcy5yZWNvbmZpZ3VyZS5iaW5kKHRoaXMpLCAyNTApO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZWFkIHRoZSBzZXR0aW5ncyBvdXQgb2YgdGhlIFVJIGFuZCBwYXNzIGFsb25nLlxuICAgICAgICAvLyBJZiB0aGUgaW50ZXJwcmV0YXRpb24gbW9kZSBoYXMgY2hhbmdlZCwgYWxsIHRoZSBzdWJzZXF1ZW50IHN0ZXBzIHdpbGwgbmVlZCBhIHJlZnJlc2guXG4gICAgICAgIC8vIElmIHRoZSBtYXN0ZXIgUHJvdG9jb2wgcHVsbGRvd24gaGFzIGNoYW5nZWQsIFN0ZXAgNCB3aWxsIG5lZWQgYSByZWZyZXNoLFxuICAgICAgICAvLyBzcGVjaWZpY2FsbHkgdGhlIG1hc3RlciBBc3NheSBwdWxsZG93biBhbmQgQXNzYXkvTGluZSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uLlxuICAgICAgICByZWNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIERvbid0IGlubGluZSB0aGVzZSBpbnRvIHRoZSBpZiBzdGF0ZW1lbnQgb3IgdGhlIHNlY29uZCBvbmUgbWlnaHQgbm90IGJlIGNhbGxlZCFcbiAgICAgICAgICAgIHZhciBhOmJvb2xlYW4gPSB0aGlzLmNoZWNrSW50ZXJwcmV0YXRpb25Nb2RlKCk7XG4gICAgICAgICAgICB2YXIgYjpib29sZWFuID0gdGhpcy5jaGVja01hc3RlclByb3RvY29sKCk7XG4gICAgICAgICAgICBpZiAoYSB8fCBiKSB7IHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpOyB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIElmIHRoZSBpbnRlcnByZXRhdGlvbiBtb2RlIHZhbHVlIGhhcyBjaGFuZ2VkLCBub3RlIHRoZSBjaGFuZ2UgYW5kIHJldHVybiAndHJ1ZScuXG4gICAgICAgIC8vIE90aGVyd2lzZSByZXR1cm4gJ2ZhbHNlJy5cbiAgICAgICAgY2hlY2tJbnRlcnByZXRhdGlvbk1vZGUoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAvLyBGaW5kIGV2ZXJ5IGlucHV0IGVsZW1lbnQgd2l0aCB0aGUgbmFtZSBhdHRyaWJ1dGUgb2YgJ2RhdGFsYXlvdXQnIHRoYXQncyBjaGVja2VkLlxuICAgICAgICAgICAgLy8gU2hvdWxkIHJldHVybiAwIG9yIDEgZWxlbWVudHMuXG4gICAgICAgICAgICB2YXIgbW9kZVJhZGlvID0gJChcIltuYW1lPSdkYXRhbGF5b3V0J106Y2hlY2tlZFwiKTtcbiAgICAgICAgICAgIC8vIElmIG5vbmUgb2YgdGhlbSBhcmUgY2hlY2tlZCwgd2UgZG9uJ3QgaGF2ZSBlbm91Z2ggaW5mb3JtYXRpb24gdG8gaGFuZGxlIGFueSBuZXh0IHN0ZXBzLlxuICAgICAgICAgICAgaWYgKG1vZGVSYWRpby5sZW5ndGggPCAxKSB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgdmFyIHJhZGlvVmFsdWUgPSBtb2RlUmFkaW8udmFsKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5pbnRlcnByZXRhdGlvbk1vZGUgPT0gcmFkaW9WYWx1ZSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0YXRpb25Nb2RlID0gcmFkaW9WYWx1ZTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgbWFzdGVyIFByb3RvY29sIHB1bGxkb3duIHZhbHVlIGhhcyBjaGFuZ2VkLCBub3RlIHRoZSBjaGFuZ2UgYW5kIHJldHVybiAndHJ1ZScuXG4gICAgICAgIC8vIE90aGVyd2lzZSByZXR1cm4gJ2ZhbHNlJy5cbiAgICAgICAgY2hlY2tNYXN0ZXJQcm90b2NvbCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHByb3RvY29sUmF3ID0gJCgnI21hc3RlclByb3RvY29sJykudmFsKCk7XG4gICAgICAgICAgICB2YXIgcCA9IChwcm90b2NvbFJhdyA9PSBERUZBVUxUX01BU1RFUl9QUk9UT0NPTCkgPyAwIDogcGFyc2VJbnQocHJvdG9jb2xSYXcsIDEwKTtcbiAgICAgICAgICAgIGlmICh0aGlzLm1hc3RlclByb3RvY29sID09PSBwKSB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgdGhpcy5tYXN0ZXJQcm90b2NvbCA9IHA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldFVzZXJXYXJuaW5ncygpOkltcG9ydE1lc3NhZ2VbXSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cblxuICAgICAgICBnZXRVc2VyRXJyb3JzKCk6SW1wb3J0TWVzc2FnZVtdIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1hc3RlclByb3RvY29sICE9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBwcmV2aW91c1N0ZXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gbm8tb3AuIG5vIHByZXZpb3VzIHN0ZXBzIVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBjbGFzcyBOdWxsUHJvY2Vzc29yIGltcGxlbWVudHMgUmF3TW9kZVByb2Nlc3NvciB7XG4gICAgICAgIC8vLyBSYXdJbnB1dFN0ZXAgcHJvY2Vzc29yIHRoYXQgZG9lcyBub3RoaW5nLlxuXG4gICAgICAgIHBhcnNlKHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCByYXdEYXRhOiBzdHJpbmcpOiBSYXdJbnB1dFN0YXQge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnaW5wdXQnOiBbXSxcbiAgICAgICAgICAgICAgICAnY29sdW1ucyc6IDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHByb2Nlc3MocmF3SW5wdXRTdGVwOiBSYXdJbnB1dFN0ZXAsIGlucHV0OiBSYXdJbnB1dFN0YXQpOiB2b2lkIHtcbiAgICAgICAgfVxuXG4gICAgfVxuXG5cbiAgICBhYnN0cmFjdCBjbGFzcyBCYXNlUmF3VGFibGVQcm9jZXNzb3IgaW1wbGVtZW50cyBSYXdNb2RlUHJvY2Vzc29yIHtcbiAgICAgICAgLy8vIEJhc2UgcHJvY2Vzc29yIGZvciBSYXdJbnB1dFN0ZXAgaGFuZGxlcyBwYXJzaW5nIGEgc3RyaW5nIGludG8gYSAyRCBhcnJheVxuXG4gICAgICAgIHBhcnNlKHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCByYXdEYXRhOiBzdHJpbmcpOiBSYXdJbnB1dFN0YXQge1xuICAgICAgICAgICAgdmFyIHJhd1RleHQ6IHN0cmluZyxcbiAgICAgICAgICAgICAgICBkZWxpbWl0ZXI6IHN0cmluZyxcbiAgICAgICAgICAgICAgICBsb25nZXN0Um93OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgcm93czogUmF3SW5wdXQsXG4gICAgICAgICAgICAgICAgbXVsdGlDb2x1bW46IGJvb2xlYW47XG5cbiAgICAgICAgICAgIHJhd1RleHQgPSByYXdJbnB1dFN0ZXAucmF3VGV4dCgpO1xuICAgICAgICAgICAgZGVsaW1pdGVyID0gcmF3SW5wdXRTdGVwLnNlcGFyYXRvclR5cGUoKSA9PSAnY3N2JyA/ICcsJyA6ICdcXHQnO1xuICAgICAgICAgICAgcm93cyA9IFtdO1xuICAgICAgICAgICAgLy8gZmluZCB0aGUgaGlnaGVzdCBudW1iZXIgb2YgY29sdW1ucyBpbiBhIHJvd1xuICAgICAgICAgICAgbG9uZ2VzdFJvdyA9IHJhd1RleHQuc3BsaXQoL1sgXFxyXSpcXG4vKS5yZWR1Y2UoKHByZXY6IG51bWJlciwgcmF3Um93OiBzdHJpbmcpOiBudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByb3c6IHN0cmluZ1tdO1xuICAgICAgICAgICAgICAgIGlmIChyYXdSb3cgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9IHJhd1Jvdy5zcGxpdChkZWxpbWl0ZXIpO1xuICAgICAgICAgICAgICAgICAgICByb3dzLnB1c2gocm93KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHJvdy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcbiAgICAgICAgICAgIH0sIDApO1xuXG4gICAgICAgICAgICAvLyBwYWQgb3V0IHJvd3Mgc28gaXQgaXMgcmVjdGFuZ3VsYXJcbiAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHdoaWxlIChyb3cubGVuZ3RoIDwgbG9uZ2VzdFJvdykge1xuICAgICAgICAgICAgICAgICAgICByb3cucHVzaCgnJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgJ2lucHV0Jzogcm93cyxcbiAgICAgICAgICAgICAgICAnY29sdW1ucyc6IGxvbmdlc3RSb3dcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBwcm9jZXNzKHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCBpbnB1dDogUmF3SW5wdXRTdGF0KTogdm9pZCB7XG4gICAgICAgIH1cblxuICAgIH1cblxuXG4gICAgY2xhc3MgTWR2UHJvY2Vzc29yIGV4dGVuZHMgQmFzZVJhd1RhYmxlUHJvY2Vzc29yIHtcbiAgICAgICAgLy8vIFJhd0lucHV0U3RlcCBwcm9jZXNzb3IgZm9yIE1EVi1mb3JtYXR0ZWQgc3ByZWFkc2hlZXRzXG5cbiAgICAgICAgcHJvY2VzcyhyYXdJbnB1dFN0ZXA6IFJhd0lucHV0U3RlcCwgcGFyc2VkOiBSYXdJbnB1dFN0YXQpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciByb3dzOiBSYXdJbnB1dCwgY29sTGFiZWxzOiBzdHJpbmdbXSwgY29tcG91bmRzOiBhbnksIG9yZGVyZWRDb21wOiBzdHJpbmdbXTtcbiAgICAgICAgICAgIGNvbExhYmVscyA9IFtdO1xuICAgICAgICAgICAgcm93cyA9IHBhcnNlZC5pbnB1dC5zbGljZSgwKTsgLy8gY29weVxuICAgICAgICAgICAgLy8gSWYgdGhpcyB3b3JkIGZyYWdtZW50IGlzIGluIHRoZSBmaXJzdCByb3csIGRyb3AgdGhlIHdob2xlIHJvdy5cbiAgICAgICAgICAgIC8vIChJZ25vcmluZyBhIFEgb2YgdW5rbm93biBjYXBpdGFsaXphdGlvbilcbiAgICAgICAgICAgIGlmIChyb3dzWzBdLmpvaW4oJycpLm1hdGNoKC91YW50aXRhdGlvbi9nKSkge1xuICAgICAgICAgICAgICAgIHJvd3Muc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbXBvdW5kcyA9IHt9O1xuICAgICAgICAgICAgb3JkZXJlZENvbXAgPSBbXTtcbiAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBmaXJzdDogc3RyaW5nLCBtYXJrZWQ6IHN0cmluZ1tdLCBuYW1lOiBzdHJpbmcsIGluZGV4OiBudW1iZXI7XG4gICAgICAgICAgICAgICAgZmlyc3QgPSByb3cuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXBwZW4gdG8gZW5jb3VudGVyIGFuIG9jY3VycmVuY2Ugb2YgYSByb3cgd2l0aCAnQ29tcG91bmQnIGluXG4gICAgICAgICAgICAgICAgLy8gdGhlIGZpcnN0IGNvbHVtbiwgd2UgdHJlYXQgaXQgYXMgYSByb3cgb2YgY29sdW1uIGlkZW50aWZpZXJzLlxuICAgICAgICAgICAgICAgIGlmIChmaXJzdCA9PT0gJ0NvbXBvdW5kJykge1xuICAgICAgICAgICAgICAgICAgICBjb2xMYWJlbHMgPSByb3c7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbWFya2VkID0gZmlyc3Quc3BsaXQoJyBNID0gJyk7XG4gICAgICAgICAgICAgICAgaWYgKG1hcmtlZC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZSA9IG1hcmtlZFswXTtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBwYXJzZUludChtYXJrZWRbMV0sIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb21wb3VuZHNbbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvdW5kc1tuYW1lXSA9IHsgJ29yaWdpbmFsUm93cyc6IHt9LCAncHJvY2Vzc2VkQXNzYXlDb2xzJzoge30gfVxuICAgICAgICAgICAgICAgICAgICAgICAgb3JkZXJlZENvbXAucHVzaChuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb21wb3VuZHNbbmFtZV0ub3JpZ2luYWxSb3dzW2luZGV4XSA9IHJvdy5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQuZWFjaChjb21wb3VuZHMsIChuYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgaW5kaWNlczogbnVtYmVyW107XG4gICAgICAgICAgICAgICAgLy8gRmlyc3QgZ2F0aGVyIHVwIGFsbCB0aGUgbWFya2VyIGluZGV4ZXMgZ2l2ZW4gZm9yIHRoaXMgY29tcG91bmRcbiAgICAgICAgICAgICAgICBpbmRpY2VzID0gJC5tYXAoXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlLm9yaWdpbmFsUm93cyxcbiAgICAgICAgICAgICAgICAgICAgKF8sIGluZGV4OiBzdHJpbmcpOiBudW1iZXIgPT4gcGFyc2VJbnQoaW5kZXgsIDEwKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaW5kaWNlcy5zb3J0KChhLCBiKSA9PiBhIC0gYik7IC8vIHNvcnQgYXNjZW5kaW5nXG4gICAgICAgICAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIHNldCBvZiBjb2x1bW5MYWJlbHMgYWJvdmUsIGFzc2VtYmxpbmcgYSBtYXJraW5nIG51bWJlciBmb3IgZWFjaCxcbiAgICAgICAgICAgICAgICAvLyBieSBkcmF3aW5nIC0gaW4gb3JkZXIgLSBmcm9tIHRoaXMgY29sbGVjdGVkIHJvdyBkYXRhLlxuICAgICAgICAgICAgICAgIGNvbExhYmVscy5mb3JFYWNoKChsYWJlbDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJ0czogc3RyaW5nW10sIGFueUZsb2F0OiBib29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBhbnlGbG9hdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpbmRpY2VzLmZvckVhY2goKHJpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBvcmlnaW5hbDogc3RyaW5nW10sIGNlbGw6IHN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsID0gdmFsdWUub3JpZ2luYWxSb3dzW3JpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwgPSBvcmlnaW5hbFtpbmRleF07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwgPSBjZWxsLnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc05hTihwYXJzZUZsb2F0KGNlbGwpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYW55RmxvYXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaChjZWxsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBBc3NlbWJsZWQgYSBmdWxsIGNhcmJvbiBtYXJrZXIgbnVtYmVyLCBncmFiIHRoZSBjb2x1bW4gbGFiZWwsIGFuZCBwbGFjZVxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgbWFya2VyIGluIHRoZSBhcHByb3ByaWF0ZSBzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICB2YWx1ZS5wcm9jZXNzZWRBc3NheUNvbHNbaW5kZXhdID0gcGFydHMuam9pbignLycpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBTdGFydCB0aGUgc2V0IG9mIHJvdyBtYXJrZXJzIHdpdGggYSBnZW5lcmljIGxhYmVsXG4gICAgICAgICAgICByYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnMgPSBbJ0Fzc2F5J107XG4gICAgICAgICAgICAvLyBUaGUgZmlyc3Qgcm93IGlzIG91ciBsYWJlbCBjb2xsZWN0aW9uXG4gICAgICAgICAgICByYXdJbnB1dFN0ZXAuZ3JpZEZyb21UZXh0RmllbGRbMF0gPSBjb2xMYWJlbHMuc2xpY2UoMCk7XG4gICAgICAgICAgICAvLyBwdXNoIHRoZSByZXN0IG9mIHRoZSByb3dzIGdlbmVyYXRlZCBmcm9tIG9yZGVyZWQgbGlzdCBvZiBjb21wb3VuZHNcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KFxuICAgICAgICAgICAgICAgIHJhd0lucHV0U3RlcC5ncmlkRnJvbVRleHRGaWVsZCxcbiAgICAgICAgICAgICAgICBvcmRlcmVkQ29tcC5tYXAoKG5hbWU6IHN0cmluZyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbXBvdW5kOiBhbnksIHJvdzogc3RyaW5nW10sIGNvbExvb2t1cDogYW55O1xuICAgICAgICAgICAgICAgICAgICByYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnMucHVzaChuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgY29tcG91bmQgPSBjb21wb3VuZHNbbmFtZV07XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBjb2xMb29rdXAgPSBjb21wb3VuZC5wcm9jZXNzZWRBc3NheUNvbHM7XG4gICAgICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIHJvdyBjZWxscyBieSBtYXBwaW5nIGNvbHVtbiBsYWJlbHMgdG8gcHJvY2Vzc2VkIGNvbHVtbnNcbiAgICAgICAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkocm93LFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sTGFiZWxzLm1hcCgoXywgaW5kZXg6IG51bWJlcik6IHN0cmluZyA9PiBjb2xMb29rdXBbaW5kZXhdIHx8ICcnKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcm93O1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICB9XG5cblxuICAgIGNsYXNzIFN0YW5kYXJkUHJvY2Vzc29yIGV4dGVuZHMgQmFzZVJhd1RhYmxlUHJvY2Vzc29yIHtcbiAgICAgICAgLy8vIFJhd0lucHV0U3RlcCBwcm9jZXNzb3IgZm9yIHN0YW5kYXJkIHRhYmxlcyB3aXRoIG9uZSBoZWFkZXIgcm93IGFuZCBjb2x1bW5cblxuICAgICAgICBwcm9jZXNzKHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCBwYXJzZWQ6IFJhd0lucHV0U3RhdCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgaGFzbid0IGRlbGliZXJhdGVseSBjaG9zZW4gYSBzZXR0aW5nIGZvciAndHJhbnNwb3NlJywgd2Ugd2lsbCBkb1xuICAgICAgICAgICAgLy8gc29tZSBhbmFseXNpcyB0byBhdHRlbXB0IHRvIGd1ZXNzIHdoaWNoIG9yaWVudGF0aW9uIHRoZSBkYXRhIG5lZWRzIHRvIGhhdmUuXG4gICAgICAgICAgICBpZiAoIXJhd0lucHV0U3RlcC51c2VyQ2xpY2tlZE9uVHJhbnNwb3NlKSB7XG4gICAgICAgICAgICAgICAgcmF3SW5wdXRTdGVwLmluZmVyVHJhbnNwb3NlU2V0dGluZyhwYXJzZWQuaW5wdXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgaGFzbid0IGRlbGliZXJhdGVseSBjaG9zZW4gdG8gaWdub3JlLCBvciBhY2NlcHQsIGdhcHMgaW4gdGhlIGRhdGEsXG4gICAgICAgICAgICAvLyBkbyBhIGJhc2ljIGFuYWx5c2lzIHRvIGd1ZXNzIHdoaWNoIHNldHRpbmcgbWFrZXMgbW9yZSBzZW5zZS5cbiAgICAgICAgICAgIGlmICghcmF3SW5wdXRTdGVwLnVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2Fwcykge1xuICAgICAgICAgICAgICAgIHJhd0lucHV0U3RlcC5pbmZlckdhcHNTZXR0aW5nKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENvbGxlY3QgdGhlIGRhdGEgYmFzZWQgb24gdGhlIHNldHRpbmdzXG4gICAgICAgICAgICBpZiAocmF3SW5wdXRTdGVwLnRyYW5zcG9zZSgpKSB7XG4gICAgICAgICAgICAgICAgLy8gZmlyc3Qgcm93IGJlY29tZXMgWS1tYXJrZXJzIGFzLWlzXG4gICAgICAgICAgICAgICAgcmF3SW5wdXRTdGVwLmdyaWRSb3dNYXJrZXJzID0gcGFyc2VkLmlucHV0LnNoaWZ0KCkgfHwgW107XG4gICAgICAgICAgICAgICAgcmF3SW5wdXRTdGVwLmdyaWRGcm9tVGV4dEZpZWxkID0gKHBhcnNlZC5pbnB1dFswXSB8fCBbXSkubWFwKFxuICAgICAgICAgICAgICAgICAgICAoXywgaTogbnVtYmVyKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlZC5pbnB1dC5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmcgPT4gcm93W2ldIHx8ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJhd0lucHV0U3RlcC5ncmlkUm93TWFya2VycyA9IFtdO1xuICAgICAgICAgICAgICAgIHJhd0lucHV0U3RlcC5ncmlkRnJvbVRleHRGaWVsZCA9IChwYXJzZWQuaW5wdXQgfHwgW10pLm1hcChcbiAgICAgICAgICAgICAgICAgICAgKHJvdzogc3RyaW5nW10pOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnMucHVzaChyb3cuc2hpZnQoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcm93O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG5cbiAgICB9XG5cblxuICAgIC8vIFRoZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgZXZlcnl0aGluZyBpbiB0aGUgXCJTdGVwIDJcIiBib3ggdGhhdCB5b3Ugc2VlIG9uIHRoZSBkYXRhIGltcG9ydFxuICAgIC8vIHBhZ2UuIEl0IG5lZWRzIHRvIHBhcnNlIHRoZSByYXcgZGF0YSBmcm9tIHR5cGluZyBvciBwYXN0aW5nIGluIHRoZSBpbnB1dCBib3gsIG9yIGFcbiAgICAvLyBkcmFnZ2VkLWluIGZpbGUsIGludG8gYSBudWxsLXBhZGRlZCByZWN0YW5ndWxhciBncmlkIHRoYXQgY2FuIGJlIGVhc2lseSB1c2VkIGJ5IHRoZSBuZXh0XG4gICAgLy8gc3RlcC4gRGVwZW5kaW5nIG9uIHRoZSBraW5kIG9mIGltcG9ydCBjaG9zZW4gaW4gU3RlcCAxLCB0aGlzIHN0ZXAgd2lsbCBhY2NlcHQgZGlmZmVyZW50XG4gICAgLy8ga2luZHMgb2YgZmlsZXMsIGFuZCBoYW5kbGUgdGhlIGZpbGUgZHJhZyBpbiBkaWZmZXJlbnQgd2F5cy5cbiAgICAvLyBGb3IgZXhhbXBsZSwgd2hlbiB0aGUgaW1wb3J0IGtpbmQgaXMgXCJTdGFuZGFyZFwiIGFuZCB0aGUgdXNlciBkcmFncyBpbiBhIENTViBmaWxlLCB0aGUgZmlsZVxuICAgIC8vIGlzIHBhcnNlZCBpbi1icm93c2VyIGFuZCB0aGUgY29udGVudHMgYXJlIHBsYWNlZCBpbiB0aGUgdGV4dCBib3guICBXaGVuIHRoZSBpbXBvcnQga2luZCBpc1xuICAgIC8vIFwiYmlvbGVjdG9yXCIgYW5kIHRoZSB1c2VyIGRyYWdzIGluIGFuIFhNTCBmaWxlLCB0aGUgZmlsZSBpcyBzZW50IHRvIHRoZSBzZXJ2ZXIgYW5kIHBhcnNlZFxuICAgIC8vIHRoZXJlLCBhbmQgdGhlIHJlc3VsdGluZyBkYXRhIGlzIHBhc3NlZCBiYWNrIHRvIHRoZSBicm93c2VyIGFuZCBwbGFjZWQgaW4gdGhlIHRleHQgYm94LlxuICAgIGV4cG9ydCBjbGFzcyBSYXdJbnB1dFN0ZXAge1xuXG4gICAgICAgIC8vIFRoaXMgaXMgd2hlcmUgd2Ugb3JnYW5pemUgcmF3IGRhdGEgcGFzdGVkIGludG8gdGhlIHRleHQgYm94IGJ5IHRoZSB1c2VyLFxuICAgICAgICAvLyBvciBwbGFjZWQgdGhlcmUgYXMgYSByZXN1bHQgb2Ygc2VydmVyLXNpZGUgcHJvY2Vzc2luZyAtIGxpa2UgdGFraW5nIGFwYXJ0XG4gICAgICAgIC8vIGEgZHJvcHBlZCBFeGNlbCBmaWxlLlxuXG4gICAgICAgIGdyaWRGcm9tVGV4dEZpZWxkOiBhbnlbXTtcbiAgICAgICAgZ3JpZFJvd01hcmtlcnM6IGFueVtdO1xuXG4gICAgICAgIC8vIFRoaXMgaXMgd2hlcmUgd2UgaGFuZGxlIGRyb3BwZWQgZmlsZXMsIGFuZCB0aGUgc2VtaS1wcm9jZXNzZWQgcmVjb3JkIHNldHNcbiAgICAgICAgLy8gdGhhdCB0aGUgc2VydmVyIHJldHVybnMsIGZyb20gaW50ZXJwcmV0aW5nIGFuIFhNTCBCaW9sZWN0b3IgZmlsZSBmb3IgZXhhbXBsZS5cblxuICAgICAgICBhY3RpdmVEcmFnZ2VkRmlsZTogYW55O1xuICAgICAgICBwcm9jZXNzZWRTZXRzRnJvbUZpbGU6IGFueVtdO1xuICAgICAgICBwcm9jZXNzZWRTZXRzQXZhaWxhYmxlOiBib29sZWFuO1xuICAgICAgICBmaWxlVXBsb2FkUHJvZ3Jlc3NCYXI6IFV0bC5Qcm9ncmVzc0JhcjtcblxuICAgICAgICAvLyBBZGRpdGlvbmFsIG9wdGlvbnMgZm9yIGludGVycHJldGluZyB0ZXh0IGJveCBkYXRhLCBleHBvc2VkIGluIHRoZSBVSSBmb3IgdGhlIHVzZXIgdG8gdHdlYWsuXG4gICAgICAgIC8vIFNvbWV0aW1lcyBzZXQgYXV0b21hdGljYWxseSBieSBjZXJ0YWluIGltcG9ydCBtb2RlcywgbGlrZSB0aGUgXCJtZHZcIiBtb2RlLlxuXG4gICAgICAgIHRyYW5zcG9zZWQ6IGJvb2xlYW47XG4gICAgICAgIC8vIElmIHRoZSB1c2VyIGRlbGliZXJhdGVseSBjaG9zZSB0byB0cmFuc3Bvc2Ugb3Igbm90IHRyYW5zcG9zZSwgZGlzYWJsZSB0aGUgYXR0ZW1wdFxuICAgICAgICAvLyB0byBhdXRvLWRldGVybWluZSB0cmFuc3Bvc2l0aW9uLlxuICAgICAgICB1c2VyQ2xpY2tlZE9uVHJhbnNwb3NlOiBib29sZWFuO1xuICAgICAgICAvLyBXaGV0aGVyIHRvIGludGVycHJldCB0aGUgcGFzdGVkIGRhdGEgcm93LXdpc2Ugb3IgY29sdW1uLXdpc2UsIHdoZW4gaW1wb3J0aW5nXG4gICAgICAgIC8vIGVpdGhlciBtZWFzdXJlbWVudHMgb3IgbWV0YWRhdGEuXG4gICAgICAgIGlnbm9yZURhdGFHYXBzOiBib29sZWFuO1xuICAgICAgICB1c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHM6IGJvb2xlYW47XG4gICAgICAgIHNlcGFyYXRvcjogc3RyaW5nO1xuXG4gICAgICAgIGlucHV0UmVmcmVzaFRpbWVySUQ6IGFueTtcblxuICAgICAgICBzZWxlY3RNYWpvcktpbmRTdGVwOiBTZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICBwcm9jZXNzaW5nRmlsZUNhbGxiYWNrOiBhbnk7XG4gICAgICAgIG5leHRTdGVwQ2FsbGJhY2s6IGFueTtcblxuICAgICAgICBoYXZlSW5wdXREYXRhOmJvb2xlYW4gPSBmYWxzZTtcblxuICAgICAgICBwcm9jZXNzaW5nRmlsZSA9IGZhbHNlOyAvL3RydWUgd2hpbGUgdGhlIGlucHV0IGlzIGJlaW5nIHByb2Nlc3NlZCAobG9jYWxseSBvciByZW1vdGVseSlcblxuICAgICAgICBjb25zdHJ1Y3RvcihzZWxlY3RNYWpvcktpbmRTdGVwOiBTZWxlY3RNYWpvcktpbmRTdGVwLCBuZXh0U3RlcENhbGxiYWNrOiBhbnksIHByb2Nlc3NpbmdGaWxlQ2FsbEJhY2s6IGFueSkge1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAgPSBzZWxlY3RNYWpvcktpbmRTdGVwO1xuXG4gICAgICAgICAgICB0aGlzLmdyaWRGcm9tVGV4dEZpZWxkID0gW107XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZFNldHNGcm9tRmlsZSA9IFtdO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRTZXRzQXZhaWxhYmxlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdyaWRSb3dNYXJrZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnRyYW5zcG9zZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudXNlckNsaWNrZWRPblRyYW5zcG9zZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pZ25vcmVEYXRhR2FwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy51c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuc2VwYXJhdG9yID0gJ2Nzdic7XG4gICAgICAgICAgICB0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQgPSBudWxsO1xuXG4gICAgICAgICAgICAkKCcjc3RlcDJ0ZXh0YXJlYScpXG4gICAgICAgICAgICAgICAgLm9uKCdwYXN0ZScsIHRoaXMucGFzdGVkUmF3RGF0YS5iaW5kKHRoaXMpKVxuICAgICAgICAgICAgICAgIC5vbigna2V5dXAnLCB0aGlzLnF1ZXVlUmVwcm9jZXNzUmF3RGF0YS5iaW5kKHRoaXMpKVxuICAgICAgICAgICAgICAgIC5vbigna2V5ZG93bicsIHRoaXMuc3VwcHJlc3NOb3JtYWxUYWIuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgICAgIC8vIFVzaW5nIFwiY2hhbmdlXCIgZm9yIHRoZXNlIGJlY2F1c2UgaXQncyBtb3JlIGVmZmljaWVudCBBTkQgYmVjYXVzZSBpdCB3b3JrcyBhcm91bmQgYW5cbiAgICAgICAgICAgIC8vIGlycml0YXRpbmcgQ2hyb21lIGluY29uc2lzdGVuY3lcbiAgICAgICAgICAgIC8vIEZvciBzb21lIG9mIHRoZXNlLCBjaGFuZ2luZyB0aGVtIHNob3VsZG4ndCBhY3R1YWxseSBhZmZlY3QgcHJvY2Vzc2luZyB1bnRpbCB3ZSBpbXBsZW1lbnRcbiAgICAgICAgICAgIC8vIGFuIG92ZXJ3cml0ZS1jaGVja2luZyBmZWF0dXJlIG9yIHNvbWV0aGluZyBzaW1pbGFyXG5cbiAgICAgICAgICAgICQoJyNyYXdkYXRhZm9ybWF0cCcpLm9uKCdjaGFuZ2UnLCB0aGlzLnF1ZXVlUmVwcm9jZXNzUmF3RGF0YS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgICQoJyNpZ25vcmVHYXBzJykub24oJ2NoYW5nZScsIHRoaXMuY2xpY2tlZE9uSWdub3JlRGF0YUdhcHMuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAkKCcjdHJhbnNwb3NlJykub24oJ2NoYW5nZScsIHRoaXMuY2xpY2tlZE9uVHJhbnNwb3NlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgJCgnI3Jlc2V0c3RlcDInKS5vbignY2xpY2snLCB0aGlzLnJlc2V0LmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICB0aGlzLmZpbGVVcGxvYWRQcm9ncmVzc0JhciA9IG5ldyBVdGwuUHJvZ3Jlc3NCYXIoJ2ZpbGVVcGxvYWRQcm9ncmVzc0JhcicpO1xuXG4gICAgICAgICAgICBVdGwuRmlsZURyb3Bab25lLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgZWxlbWVudElkOiBcInN0ZXAydGV4dGFyZWFcIixcbiAgICAgICAgICAgICAgICBmaWxlSW5pdEZuOiB0aGlzLmZpbGVEcm9wcGVkLmJpbmQodGhpcyksXG4gICAgICAgICAgICAgICAgcHJvY2Vzc1Jhd0ZuOiB0aGlzLmZpbGVSZWFkLmJpbmQodGhpcyksXG4gICAgICAgICAgICAgICAgdXJsOiBcIi91dGlsaXRpZXMvcGFyc2VmaWxlXCIsXG4gICAgICAgICAgICAgICAgcHJvY2Vzc1Jlc3BvbnNlRm46IHRoaXMuZmlsZVJldHVybmVkRnJvbVNlcnZlci5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgIHByb2dyZXNzQmFyOiB0aGlzLmZpbGVVcGxvYWRQcm9ncmVzc0JhclxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2luZ0ZpbGVDYWxsYmFjayA9IHByb2Nlc3NpbmdGaWxlQ2FsbGJhY2s7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2sgPSBuZXh0U3RlcENhbGxiYWNrO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJbiBwcmFjdGljZSwgdGhlIG9ubHkgdGltZSB0aGlzIHdpbGwgYmUgY2FsbGVkIGlzIHdoZW4gU3RlcCAxIGNoYW5nZXMsXG4gICAgICAgIC8vIHdoaWNoIG1heSBjYWxsIGZvciBhIHJlY29uZmlndXJhdGlvbiBvZiB0aGUgY29udHJvbHMgaW4gdGhpcyBzdGVwLlxuICAgICAgICBwcmV2aW91c1N0ZXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuXG4gICAgICAgICAgICAvLyB1cGRhdGUgaW5wdXQgdmlzaWJpbGl0eSBiYXNlZCBvbiB1c2VyIHNlbGVjdGlvbiBpbiBzdGVwIDFcbiAgICAgICAgICAgIHRoaXMudXBkYXRlSW5wdXRWaXNpYmxlKCk7XG5cbiAgICAgICAgICAgIC8vIEJ5IGRlZmF1bHQsIG91ciBkcm9wIHpvbmUgd2FudHMgZXhjZWwgb3IgY3N2IGZpbGVzLCBzbyB3ZSBjbGVhciB0aGUgYWRkaXRpb25hbCBjbGFzc2VzOlxuICAgICAgICAgICAgJCgnI3N0ZXAydGV4dGFyZWEnKS5yZW1vdmVDbGFzcygneG1sIHRleHQnKTtcblxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdiaW9sZWN0b3InKSB7XG4gICAgICAgICAgICAgICAgLy8gQmlvbGVjdG9yIGRhdGEgaXMgZXhwZWN0ZWQgaW4gWE1MIGZvcm1hdC5cbiAgICAgICAgICAgICAgICAkKCcjc3RlcDJ0ZXh0YXJlYScpLmFkZENsYXNzKCd4bWwnKTtcbiAgICAgICAgICAgICAgICAvLyBJdCBpcyBhbHNvIGV4cGVjdGVkIHRvIGJlIGRyb3BwZWQgZnJvbSBhIGZpbGUuXG4gICAgICAgICAgICAgICAgLy8gU28gZWl0aGVyIHdlJ3JlIGFscmVhZHkgaW4gZmlsZSBtb2RlIGFuZCB0aGVyZSBhcmUgYWxyZWFkeSBwYXJzZWQgc2V0cyBhdmFpbGFibGUsXG4gICAgICAgICAgICAgICAgLy8gT3Igd2UgYXJlIGluIHRleHQgZW50cnkgbW9kZSB3YWl0aW5nIGZvciBhIGZpbGUgZHJvcC5cbiAgICAgICAgICAgICAgICAvLyBFaXRoZXIgd2F5IHRoZXJlJ3Mgbm8gbmVlZCB0byBjYWxsIHJlcHJvY2Vzc1Jhd0RhdGEoKSwgc28gd2UganVzdCBwdXNoIG9uIHRvIHRoZSBuZXh0IHN0ZXAuXG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdocGxjJykge1xuICAgICAgICAgICAgICAgIC8vIEhQTEMgZGF0YSBpcyBleHBlY3RlZCBhcyBhIHRleHQgZmlsZS5cbiAgICAgICAgICAgICAgICAkKCcjc3RlcDJ0ZXh0YXJlYScpLmFkZENsYXNzKCd0ZXh0Jyk7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdza3lsaW5lJykge1xuICAgICAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtb2RlID09PSAnbWR2Jykge1xuICAgICAgICAgICAgICAgIC8vIFdoZW4gSkJFSSBNRFYgZm9ybWF0IGRvY3VtZW50cyBhcmUgcGFzdGVkIGluLCBpdCdzIGFsd2F5cyBmcm9tIEV4Y2VsLCBzbyB0aGV5J3JlIGFsd2F5cyB0YWItc2VwYXJhdGVkLlxuICAgICAgICAgICAgICAgIHRoaXMuc2VwYXJhdG9yVHlwZSgndGFiJyk7XG4gICAgICAgICAgICAgICAgLy8gV2UgYWxzbyBuZXZlciBpZ25vcmUgZ2Fwcywgb3IgdHJhbnNwb3NlLCBmb3IgTURWIGRvY3VtZW50cy5cbiAgICAgICAgICAgICAgICB0aGlzLmlnbm9yZUdhcHMoZmFsc2UpO1xuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNwb3NlKGZhbHNlKTtcbiAgICAgICAgICAgICAgICAvLyBQcm9jZWVkIHRocm91Z2ggdG8gdGhlIGRyb3B6b25lIGNoZWNrLlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdzdGQnIHx8IG1vZGUgPT09ICd0cicgfHwgbW9kZSA9PT0gJ3ByJyB8fCBtb2RlID09PSAnbWR2Jykge1xuICAgICAgICAgICAgICAgIC8vIElmIGFuIGV4Y2VsIGZpbGUgd2FzIGRyb3BwZWQgaW4sIGl0cyBjb250ZW50IHdhcyBwdWxsZWQgb3V0IGFuZCBkcm9wcGVkIGludG8gdGhlIHRleHQgYm94LlxuICAgICAgICAgICAgICAgIC8vIFRoZSBvbmx5IHJlYXNvbiB3ZSB3b3VsZCB3YW50IHRvIHN0aWxsIHNob3cgdGhlIGZpbGUgaW5mbyBhcmVhIGlzIGlmIHdlIGFyZSBjdXJyZW50bHkgaW4gdGhlIG1pZGRsZVxuICAgICAgICAgICAgICAgIC8vIG9mIHByb2Nlc3NpbmcgYSBmaWxlIGFuZCBoYXZlbid0IHlldCByZWNlaXZlZCBpdHMgd29ya3NoZWV0cyBmcm9tIHRoZSBzZXJ2ZXIuXG4gICAgICAgICAgICAgICAgLy8gV2UgY2FuIGRldGVybWluZSB0aGF0IGJ5IGNoZWNraW5nIHRoZSBzdGF0dXMgb2YgYW55IGV4aXN0aW5nIEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIuXG4gICAgICAgICAgICAgICAgLy8gSWYgaXQncyBzdGFsZSwgd2UgY2xlYXIgaXQgc28gdGhlIHVzZXIgY2FuIGRyb3AgaW4gYW5vdGhlciBmaWxlLlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZURyYWdnZWRGaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZURyYWdnZWRGaWxlLmFsbFdvcmtGaW5pc2hlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGVhckRyb3Bab25lKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5xdWV1ZVJlcHJvY2Vzc1Jhd0RhdGEoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgICAgIC8vIFRoaXMgd2F5IHdlJ3JlIG5vdCBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuXG4gICAgICAgIC8vIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgICAgICBxdWV1ZVJlcHJvY2Vzc1Jhd0RhdGEoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgZGVsYXk6IG51bWJlcjtcblxuICAgICAgICAgICAgaWYgKHRoaXMuaGF2ZUlucHV0RGF0YSkge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NpbmdGaWxlQ2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gV2FpdCBhdCBsZWFzdCAxLzIgc2Vjb25kLCBhdCBtb3N0IDMgc2Vjb25kcyxcbiAgICAgICAgICAgIC8vIHdpdGggYSByYW5nZSBpbiBiZXR3ZWVuIGJhc2VkIG9uIHRoZSBsZW5ndGggb2YgdGhlIGlucHV0IGRhdGEuXG4gICAgICAgICAgICAvLyBUaGlzIHdheSBhIHBlcnNvbiBtYWtpbmcgYSBtaW5vciBjb3JyZWN0aW9uIHRvIGEgc21hbGwgZGF0YSBzZXQgY2FuIHNlZVxuICAgICAgICAgICAgLy8gdGhlaXIgcmVzdWx0cyBtb3JlIHF1aWNrbHksIGJ1dCB3ZSBkb24ndCBvdmVybG9hZCB3aGVuIHdvcmtpbmcgb24gbGFyZ2Ugc2V0cy5cbiAgICAgICAgICAgIGRlbGF5ID0gTWF0aC5tYXgoNTAwLCBNYXRoLm1pbigzMDAwLCAkKCcjc3RlcDJ0ZXh0YXJlYScpLnZhbCgpLmxlbmd0aCkpO1xuXG4gICAgICAgICAgICB0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KHRoaXMucmVwcm9jZXNzUmF3RGF0YS5iaW5kKHRoaXMpLCBkZWxheSk7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRQcm9jZXNzb3JGb3JNb2RlKG1vZGU6IHN0cmluZyk6IFJhd01vZGVQcm9jZXNzb3Ige1xuICAgICAgICAgICAgdmFyIHByb2Nlc3NvcjogUmF3TW9kZVByb2Nlc3NvcjtcbiAgICAgICAgICAgIGlmIChbJ3N0ZCcsICd0cicsICdwciddLmluZGV4T2YobW9kZSkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBwcm9jZXNzb3IgPSBuZXcgU3RhbmRhcmRQcm9jZXNzb3IoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoJ21kdicgPT09IG1vZGUpIHtcbiAgICAgICAgICAgICAgICBwcm9jZXNzb3IgPSBuZXcgTWR2UHJvY2Vzc29yKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NvciA9IG5ldyBOdWxsUHJvY2Vzc29yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcHJvY2Vzc29yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcHJvY2Vzc2VzIHJhdyB1c2VyIGlucHV0IGVudGVyZWQgZGlyZWN0bHkgaW50byB0aGUgdGV4dCBhcmVhXG4gICAgICAgIHJlcHJvY2Vzc1Jhd0RhdGEoKTogdm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBtb2RlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgZGVsaW1pdGVyOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcHJvY2Vzc29yOiBSYXdNb2RlUHJvY2Vzc29yLFxuICAgICAgICAgICAgICAgIGlucHV0OiBSYXdJbnB1dFN0YXQ7XG5cbiAgICAgICAgICAgIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuXG4gICAgICAgICAgICB0aGlzLmlnbm9yZUdhcHMoKTsgICAgLy8gVE9ETzogQXJlIHRoZXNlIG5lY2Vzc2FyeT9cbiAgICAgICAgICAgIHRoaXMudHJhbnNwb3NlKCk7XG4gICAgICAgICAgICB0aGlzLnNlcGFyYXRvclR5cGUoKTtcblxuICAgICAgICAgICAgdGhpcy5ncmlkRnJvbVRleHRGaWVsZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy5ncmlkUm93TWFya2VycyA9IFtdO1xuXG4gICAgICAgICAgICBwcm9jZXNzb3IgPSB0aGlzLmdldFByb2Nlc3NvckZvck1vZGUobW9kZSk7XG4gICAgICAgICAgICBpbnB1dCA9IHByb2Nlc3Nvci5wYXJzZSh0aGlzLCB0aGlzLnJhd1RleHQoKSk7XG4gICAgICAgICAgICBwcm9jZXNzb3IucHJvY2Vzcyh0aGlzLCBpbnB1dCk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2luZ0ZpbGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBIZXJlLCB3ZSB0YWtlIGEgbG9vayBhdCB0aGUgdHlwZSBvZiB0aGUgZHJvcHBlZCBmaWxlIGFuZCBkZWNpZGUgd2hldGhlciB0b1xuICAgICAgICAvLyBzZW5kIGl0IHRvIHRoZSBzZXJ2ZXIsIG9yIHByb2Nlc3MgaXQgbG9jYWxseS5cbiAgICAgICAgLy8gV2UgaW5mb3JtIHRoZSBGaWxlRHJvcFpvbmUgb2Ygb3VyIGRlY2lzaW9uIGJ5IHNldHRpbmcgZmxhZ3MgaW4gdGhlIGZpbGVDb250aW5lciBvYmplY3QsXG4gICAgICAgIC8vIHdoaWNoIHdpbGwgYmUgaW5zcGVjdGVkIHdoZW4gdGhpcyBmdW5jdGlvbiByZXR1cm5zLlxuICAgICAgICBmaWxlRHJvcHBlZChmaWxlQ29udGFpbmVyKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmhhdmVJbnB1dERhdGEgPSB0cnVlO1xuICAgICAgICAgICAgcHJvY2Vzc2luZ0ZpbGVDYWxsYmFjaygpO1xuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5leHRyYUhlYWRlcnNbJ0ltcG9ydC1Nb2RlJ10gPSBtb2RlO1xuICAgICAgICAgICAgdmFyIGZ0ID0gZmlsZUNvbnRhaW5lci5maWxlVHlwZTtcbiAgICAgICAgICAgIC8vIFdlJ2xsIHByb2Nlc3MgY3N2IGZpbGVzIGxvY2FsbHkuXG4gICAgICAgICAgICBpZiAoKGZ0ID09PSAnY3N2JyB8fCBmdCA9PT0gJ3R4dCcpICYmXG4gICAgICAgICAgICAgICAgICAgIChtb2RlID09PSAnc3RkJyB8fCBtb2RlID09PSAndHInIHx8IG1vZGUgPT09ICdwcicpKSB7XG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1JhdyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBFeGNlcHQgZm9yIHNreWxpbmUgZmlsZXMsIHdoaWNoIHNob3VsZCBiZSBzdW1tZWQgc2VydmVyLXNpZGVcbiAgICAgICAgICAgIGVsc2UgaWYgKChmdCA9PT0gJ2NzdicgfHwgZnQgPT09ICd0eHQnKSAmJiAobW9kZSA9PT0gJ3NreWxpbmUnKSkge1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFByb2Nlc3NSYXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gV2l0aCBFeGNlbCBkb2N1bWVudHMsIHdlIG5lZWQgc29tZSBzZXJ2ZXItc2lkZSB0b29scy5cbiAgICAgICAgICAgIC8vIFdlJ2xsIHNpZ25hbCB0aGUgZHJvcHpvbmUgdG8gdXBsb2FkIHRoaXMsIGFuZCByZWNlaXZlIHByb2Nlc3NlZCByZXN1bHRzLlxuICAgICAgICAgICAgZWxzZSBpZiAoKGZ0ID09PSAneGxzeCcpICYmIChtb2RlID09PSAnc3RkJyB8fFxuICAgICAgICAgICAgICAgICAgICBtb2RlID09PSAndHInIHx8XG4gICAgICAgICAgICAgICAgICAgIG1vZGUgPT09ICdwcicgfHxcbiAgICAgICAgICAgICAgICAgICAgbW9kZSA9PT0gJ21kdicgfHxcbiAgICAgICAgICAgICAgICAgICAgbW9kZSA9PT0gJ3NreWxpbmUnKSkge1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFByb2Nlc3NSYXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSFBMQyByZXBvcnRzIG5lZWQgdG8gYmUgc2VudCBmb3Igc2VydmVyLXNpZGUgcHJvY2Vzc2luZ1xuICAgICAgICAgICAgZWxzZSBpZiAoKGZ0ID09PSAnY3N2JyB8fCBmdCA9PT0gJ3R4dCcpICYmXG4gICAgICAgICAgICAgICAgICAgIChtb2RlID09PSAnaHBsYycpKSB7XG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1JhdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwVXBsb2FkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBCaW9sZWN0b3IgWE1MIGFsc28gbmVlZHMgdG8gYmUgc2VudCBmb3Igc2VydmVyLXNpZGUgcHJvY2Vzc2luZ1xuICAgICAgICAgICAgZWxzZSBpZiAoZnQgPT09ICd4bWwnICYmIG1vZGUgPT09ICdiaW9sZWN0b3InKSB7XG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1JhdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwVXBsb2FkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBCeSBkZWZhdWx0LCBza2lwIGFueSBmdXJ0aGVyIHByb2Nlc3NpbmdcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFByb2Nlc3NSYXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1JhdyB8fCAhZmlsZUNvbnRhaW5lci5za2lwVXBsb2FkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93RmlsZURyb3BwZWQoZmlsZUNvbnRhaW5lcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gaXMgcGFzc2VkIHRoZSB1c3VhbCBmaWxlQ29udGFpbmVyIG9iamVjdCwgYnV0IGFsc28gYSByZWZlcmVuY2UgdG8gdGhlXG4gICAgICAgIC8vIGZ1bGwgY29udGVudCBvZiB0aGUgZHJvcHBlZCBmaWxlLiAgU28sIGZvciBleGFtcGxlLCBpbiB0aGUgY2FzZSBvZiBwYXJzaW5nIGEgY3N2IGZpbGUsXG4gICAgICAgIC8vIHdlIGp1c3QgZHJvcCB0aGF0IGNvbnRlbnQgaW50byB0aGUgdGV4dCBib3ggYW5kIHdlJ3JlIGRvbmUuXG4gICAgICAgIGZpbGVSZWFkKGZpbGVDb250YWluZXIsIHJlc3VsdCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5oYXZlSW5wdXREYXRhID0gdHJ1ZTtcbiAgICAgICAgICAgIHByb2Nlc3NpbmdGaWxlQ2FsbGJhY2soKTtcbiAgICAgICAgICAgIGlmIChmaWxlQ29udGFpbmVyLmZpbGVUeXBlID09PSAnY3N2Jykge1xuICAgICAgICAgICAgICAgIC8vIFNpbmNlIHdlJ3JlIGhhbmRsaW5nIHRoaXMgZm9ybWF0IGVudGlyZWx5IGNsaWVudC1zaWRlLCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGVcbiAgICAgICAgICAgICAgICAvLyBkcm9wIHpvbmUgaW1tZWRpYXRlbHkuXG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwVXBsb2FkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmNsZWFyRHJvcFpvbmUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJhd1RleHQocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB0aGlzLmluZmVyU2VwYXJhdG9yVHlwZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVwcm9jZXNzUmF3RGF0YSgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBpcyBjYWxsZWQgdXBvbiByZWNlaXZpbmcgYSByZXNwb25zZSBmcm9tIGEgZmlsZSB1cGxvYWQgb3BlcmF0aW9uLCBhbmQgdW5saWtlXG4gICAgICAgIC8vIGZpbGVSZWFkKCkgYWJvdmUsIGlzIHBhc3NlZCBhIHByb2Nlc3NlZCByZXN1bHQgZnJvbSB0aGUgc2VydmVyIGFzIGEgc2Vjb25kIGFyZ3VtZW50LFxuICAgICAgICAvLyByYXRoZXIgdGhhbiB0aGUgcmF3IGNvbnRlbnRzIG9mIHRoZSBmaWxlLlxuICAgICAgICBmaWxlUmV0dXJuZWRGcm9tU2VydmVyKGZpbGVDb250YWluZXIsIHJlc3VsdCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgLy8gV2hldGhlciB3ZSBjbGVhciB0aGUgZmlsZSBpbmZvIGFyZWEgZW50aXJlbHksIG9yIGp1c3QgdXBkYXRlIGl0cyBzdGF0dXMsXG4gICAgICAgICAgICAvLyB3ZSBrbm93IHdlIG5vIGxvbmdlciBuZWVkIHRoZSAnc2VuZGluZycgc3RhdHVzLlxuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb1NlbmRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG5cbiAgICAgICAgICAgIGlmIChtb2RlID09PSAnYmlvbGVjdG9yJyB8fCBtb2RlID09PSAnaHBsYycgfHwgbW9kZSA9PT0gJ3NreWxpbmUnKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGE6IGFueVtdLCBjb3VudDogbnVtYmVyLCBwb2ludHM6IG51bWJlcjtcbiAgICAgICAgICAgICAgICBkYXRhID0gcmVzdWx0LmZpbGVfZGF0YTtcbiAgICAgICAgICAgICAgICBjb3VudCA9IGRhdGEubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHBvaW50cyA9IGRhdGEubWFwKChzZXQpOiBudW1iZXIgPT4gc2V0LmRhdGEubGVuZ3RoKS5yZWR1Y2UoKGFjYywgbikgPT4gYWNjICsgbiwgMCk7XG4gICAgICAgICAgICAgICAgJCgnPHA+JykudGV4dChcbiAgICAgICAgICAgICAgICAgICAgJ0ZvdW5kICcgKyBjb3VudCArICcgbWVhc3VyZW1lbnRzIHdpdGggJyArIHBvaW50cyArICcgdG90YWwgZGF0YSBwb2ludHMuJ1xuICAgICAgICAgICAgICAgICkuYXBwZW5kVG8oJChcIiNmaWxlRHJvcEluZm9Mb2dcIikpO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkU2V0c0Zyb21GaWxlID0gZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NlZFNldHNBdmFpbGFibGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc2luZ0ZpbGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBDYWxsIHRoaXMgZGlyZWN0bHksIHNraXBwaW5nIG92ZXIgcmVwcm9jZXNzUmF3RGF0YSgpIHNpbmNlIHdlIGRvbid0IG5lZWQgaXQuXG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZmlsZUNvbnRhaW5lci5maWxlVHlwZSA9PSBcInhsc3hcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJEcm9wWm9uZSgpO1xuICAgICAgICAgICAgICAgIHZhciB3cyA9IHJlc3VsdC5maWxlX2RhdGFbXCJ3b3Jrc2hlZXRzXCJdWzBdO1xuICAgICAgICAgICAgICAgIHZhciB0YWJsZSA9IHdzWzBdO1xuICAgICAgICAgICAgICAgIHZhciBjc3YgPSBbXTtcbiAgICAgICAgICAgICAgICBpZiAodGFibGUuaGVhZGVycykge1xuICAgICAgICAgICAgICAgICAgICBjc3YucHVzaCh0YWJsZS5oZWFkZXJzLmpvaW4oKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNzdiA9IGNzdi5jb25jYXQodGFibGUudmFsdWVzLm1hcCgocm93OiBzdHJpbmdbXSkgPT4gcm93LmpvaW4oKSkpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2VwYXJhdG9yVHlwZSgnY3N2Jyk7XG4gICAgICAgICAgICAgICAgdGhpcy5yYXdUZXh0KGNzdi5qb2luKCdcXG4nKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlSW5wdXRWaXNpYmxlKCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgbWlzc2luZ1N0ZXAxSW5wdXRzID0gIXRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5yZXF1aXJlZElucHV0c1Byb3ZpZGVkKCk7XG5cbiAgICAgICAgICAgICQoJyNjb21wbGV0ZVN0ZXAxTGFiZWwnKS50b2dnbGVDbGFzcygnb2ZmJywgIW1pc3NpbmdTdGVwMUlucHV0cyk7XG4gICAgICAgICAgICAkKCcjc3RlcDJ0ZXh0YXJlYScpLnRvZ2dsZUNsYXNzKCdvZmYnLCBtaXNzaW5nU3RlcDFJbnB1dHMpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXNldCBhbmQgaGlkZSB0aGUgaW5mbyBib3ggdGhhdCBhcHBlYXJzIHdoZW4gYSBmaWxlIGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGFuZCByZXZlYWwgdGhlIHRleHQgZW50cnkgYXJlYVxuICAgICAgICAvLyBUaGlzIGFsc28gY2xlYXJzIHRoZSBcInByb2Nlc3NlZFNldHNBdmFpbGFibGVcIiBmbGFnIGJlY2F1c2UgaXQgYXNzdW1lcyB0aGF0XG4gICAgICAgIC8vIHRoZSB0ZXh0IGVudHJ5IGFyZWEgaXMgbm93IHRoZSBwcmVmZXJyZWQgZGF0YSBzb3VyY2UgZm9yIHN1YnNlcXVlbnQgc3RlcHMuXG4gICAgICAgIGNsZWFyRHJvcFpvbmUoKTogdm9pZCB7XG5cbiAgICAgICAgICAgIHRoaXMudXBkYXRlSW5wdXRWaXNpYmxlKCk7XG5cbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9BcmVhJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb1NlbmRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvTmFtZScpLmVtcHR5KCk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvTG9nJykuZW1wdHkoKTtcblxuXG4gICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGEgY3VycmVudGx5IHRyYWNrZWQgZHJvcHBlZCBmaWxlLCBzZXQgaXRzIGZsYWdzIHNvIHdlIGlnbm9yZSBhbnkgY2FsbGJhY2tzLFxuICAgICAgICAgICAgLy8gYmVmb3JlIHdlIGZvcmdldCBhYm91dCBpdC5cbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZURyYWdnZWRGaWxlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVEcmFnZ2VkRmlsZS5zdG9wUHJvY2Vzc2luZyA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyYWdnZWRGaWxlID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkU2V0c0F2YWlsYWJsZSA9IGZhbHNlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXNldCBhbmQgc2hvdyB0aGUgaW5mbyBib3ggdGhhdCBhcHBlYXJzIHdoZW4gYSBmaWxlIGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGFuZCByZXZlYWwgdGhlIHRleHQgZW50cnkgYXJlYS5cbiAgICAgICAgc2hvd0ZpbGVEcm9wcGVkKGZpbGVDb250YWluZXIpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBwcm9jZXNzaW5nTWVzc2FnZTpzdHJpbmcgPSAnJztcbiAgICAgICAgICAgIC8vIFNldCB0aGUgaWNvbiBpbWFnZSBwcm9wZXJseVxuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5yZW1vdmVDbGFzcygneG1sJyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvSWNvbicpLnJlbW92ZUNsYXNzKCd0ZXh0Jyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvSWNvbicpLnJlbW92ZUNsYXNzKCdleGNlbCcpO1xuICAgICAgICAgICAgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT09ICd4bWwnKSB7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5hZGRDbGFzcygneG1sJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT09ICd4bHN4Jykge1xuICAgICAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9JY29uJykuYWRkQ2xhc3MoJ2V4Y2VsJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT09ICdwbGFpbnRleHQnKSB7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5hZGRDbGFzcygndGV4dCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJCgnI3N0ZXAydGV4dGFyZWEnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvQXJlYScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9TZW5kaW5nJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb05hbWUnKS50ZXh0KGZpbGVDb250YWluZXIuZmlsZS5uYW1lKVxuXG4gICAgICAgICAgICBpZiAoIWZpbGVDb250YWluZXIuc2tpcFVwbG9hZCkge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NpbmdNZXNzYWdlID0gJ1NlbmRpbmcgJyArIFV0bC5KUy5zaXplVG9TdHJpbmcoZmlsZUNvbnRhaW5lci5maWxlLnNpemUpICsgJyBUbyBTZXJ2ZXIuLi4nO1xuICAgICAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9Mb2cnKS5lbXB0eSgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1Jhdykge1xuICAgICAgICAgICAgICAgIHByb2Nlc3NpbmdNZXNzYWdlID0gJ1Byb2Nlc3NpbmcgJyArIFV0bC5KUy5zaXplVG9TdHJpbmcoZmlsZUNvbnRhaW5lci5maWxlLnNpemUpICsgJy4uLic7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0xvZycpLmVtcHR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKCcjZmlsZVVwbG9hZE1lc3NhZ2UnKS50ZXh0KHByb2Nlc3NpbmdNZXNzYWdlKTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJhZ2dlZEZpbGUgPSBmaWxlQ29udGFpbmVyO1xuICAgICAgICB9XG5cblxuICAgICAgICByZXNldCgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuaGF2ZUlucHV0RGF0YT1mYWxzZTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJEcm9wWm9uZSgpO1xuICAgICAgICAgICAgdGhpcy5yYXdUZXh0KCcnKTtcbiAgICAgICAgICAgIHRoaXMucmVwcm9jZXNzUmF3RGF0YSgpO1xuICAgICAgICB9XG5cblxuICAgICAgICBpbmZlclRyYW5zcG9zZVNldHRpbmcocm93czogUmF3SW5wdXQpOnZvaWQgIHtcbiAgICAgICAgICAgIC8vIGFzIGEgdXNlciBjb252ZW5pZW5jZSwgc3VwcG9ydCB0aGUgb25seSBrbm93biB1c2UtY2FzZSBmb3IgcHJvdGVvbWljcyAtLSB0YWtpbmdcbiAgICAgICAgICAgIC8vIFwic2hvcnQgYW5kIGZhdFwiIG91dHB1dCBmcm9tIHRoZSBza3lsaW5lIGltcG9ydCB0b29sIGFzIGlucHV0LiBUT0RPOiByZWNvbnNpZGVyXG4gICAgICAgICAgICAvLyB0aGlzIHdoZW4gaW50ZWdyYXRpbmcgdGhlIFNreWxpbmUgdG9vbCBpbnRvIHRoZSBpbXBvcnQgcGFnZSAoRURELTI0MCkuXG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSA9PT0gJ3ByJykge1xuICAgICAgICAgICAgICAgIHRoaXMudHJhbnNwb3NlKHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVGhlIG1vc3Qgc3RyYWlnaHRmb3J3YXJkIG1ldGhvZCBpcyB0byB0YWtlIHRoZSB0b3Agcm93LCBhbmQgdGhlIGZpcnN0IGNvbHVtbixcbiAgICAgICAgICAgIC8vIGFuZCBhbmFseXplIGJvdGggdG8gc2VlIHdoaWNoIG9uZSBtb3N0IGxpa2VseSBjb250YWlucyBhIHJ1biBvZiB0aW1lc3RhbXBzLlxuICAgICAgICAgICAgLy8gV2UnbGwgYWxzbyBkbyB0aGUgc2FtZSBmb3IgdGhlIHNlY29uZCByb3cgYW5kIHRoZSBzZWNvbmQgY29sdW1uLCBpbiBjYXNlIHRoZVxuICAgICAgICAgICAgLy8gdGltZXN0YW1wcyBhcmUgdW5kZXJuZWF0aCBzb21lIG90aGVyIGhlYWRlci5cbiAgICAgICAgICAgIHZhciBhcnJheXNUb0FuYWx5emU6IHN0cmluZ1tdW10sIGFycmF5c1Njb3JlczogbnVtYmVyW10sIHNldFRyYW5zcG9zZTogYm9vbGVhbjtcblxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdpdGggZW1wdHkgb3IgdG9vLXNtYWxsIHNvdXJjZSBkYXRhLCB0aGVzZSBhcnJheXMgd2lsbCBlaXRoZXIgcmVtYWluXG4gICAgICAgICAgICAvLyBlbXB0eSwgb3IgYmVjb21lICdudWxsJ1xuICAgICAgICAgICAgYXJyYXlzVG9BbmFseXplID0gW1xuICAgICAgICAgICAgICAgIHJvd3NbMF0gfHwgW10sICAgLy8gRmlyc3Qgcm93XG4gICAgICAgICAgICAgICAgcm93c1sxXSB8fCBbXSwgICAvLyBTZWNvbmQgcm93XG4gICAgICAgICAgICAgICAgKHJvd3MgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbMF0pLCAgIC8vIEZpcnN0IGNvbHVtblxuICAgICAgICAgICAgICAgIChyb3dzIHx8IFtdKS5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmcgPT4gcm93WzFdKSAgICAvLyBTZWNvbmQgY29sdW1uXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgYXJyYXlzU2NvcmVzID0gYXJyYXlzVG9BbmFseXplLm1hcCgocm93OiBzdHJpbmdbXSwgaTogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2NvcmUgPSAwLCBwcmV2OiBudW1iZXIsIG5uUHJldjogbnVtYmVyO1xuICAgICAgICAgICAgICAgIGlmICghcm93IHx8IHJvdy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXYgPSBublByZXYgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgcm93LmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIGo6IG51bWJlciwgcjogc3RyaW5nW10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHQ6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ID0gcGFyc2VGbG9hdCh2YWx1ZS5yZXBsYWNlKC8sL2csICcnKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTih0KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTihwcmV2KSAmJiB0ID4gcHJldikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFpc05hTihublByZXYpICYmIHQgPiBublByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29yZSArPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgbm5QcmV2ID0gdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcmV2ID0gdDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcmUgLyByb3cubGVuZ3RoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB0aGUgZmlyc3Qgcm93IGFuZCBjb2x1bW4gc2NvcmVkIGRpZmZlcmVudGx5LCBqdWRnZSBiYXNlZCBvbiB0aGVtLlxuICAgICAgICAgICAgLy8gT25seSBpZiB0aGV5IHNjb3JlZCB0aGUgc2FtZSBkbyB3ZSBqdWRnZSBiYXNlZCBvbiB0aGUgc2Vjb25kIHJvdyBhbmQgc2Vjb25kIGNvbHVtbi5cbiAgICAgICAgICAgIGlmIChhcnJheXNTY29yZXNbMF0gIT09IGFycmF5c1Njb3Jlc1syXSkge1xuICAgICAgICAgICAgICAgIHNldFRyYW5zcG9zZSA9IGFycmF5c1Njb3Jlc1swXSA+IGFycmF5c1Njb3Jlc1syXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2V0VHJhbnNwb3NlID0gYXJyYXlzU2NvcmVzWzFdID4gYXJyYXlzU2NvcmVzWzNdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50cmFuc3Bvc2Uoc2V0VHJhbnNwb3NlKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaW5mZXJHYXBzU2V0dGluZygpOnZvaWQge1xuICAgICAgICAgICAgLy8gQ291bnQgdGhlIG51bWJlciBvZiBibGFuayB2YWx1ZXMgYXQgdGhlIGVuZCBvZiBlYWNoIGNvbHVtblxuICAgICAgICAgICAgLy8gQ291bnQgdGhlIG51bWJlciBvZiBibGFuayB2YWx1ZXMgaW4gYmV0d2VlbiBub24tYmxhbmsgZGF0YVxuICAgICAgICAgICAgLy8gSWYgbW9yZSB0aGFuIHRocmVlIHRpbWVzIGFzIG1hbnkgYXMgYXQgdGhlIGVuZCwgZGVmYXVsdCB0byBpZ25vcmUgZ2Fwc1xuICAgICAgICAgICAgdmFyIGludHJhOiBudW1iZXIgPSAwLCBleHRyYTogbnVtYmVyID0gMDtcbiAgICAgICAgICAgIHRoaXMuZ3JpZEZyb21UZXh0RmllbGQuZm9yRWFjaCgocm93OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBub3ROdWxsOiBib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgLy8gY29weSBhbmQgcmV2ZXJzZSB0byBsb29wIGZyb20gdGhlIGVuZFxuICAgICAgICAgICAgICAgIHJvdy5zbGljZSgwKS5yZXZlcnNlKCkuZm9yRWFjaCgodmFsdWU6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub3ROdWxsID8gKytleHRyYSA6ICsraW50cmE7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub3ROdWxsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB2YXIgcmVzdWx0OmJvb2xlYW4gPSBleHRyYSA+IChpbnRyYSAqIDMpO1xuICAgICAgICAgICAgdGhpcy5pZ25vcmVHYXBzKHJlc3VsdCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgZ2V0cyBjYWxsZWQgd2hlbiB0aGVyZSBpcyBhIHBhc3RlIGV2ZW50LlxuICAgICAgICBwYXN0ZWRSYXdEYXRhKCk6dm9pZCB7XG4gICAgICAgICAgICAvLyBXZSBkbyB0aGlzIHVzaW5nIGEgdGltZW91dCBzbyB0aGUgcmVzdCBvZiB0aGUgcGFzdGUgZXZlbnRzIGZpcmUsIGFuZCBnZXQgdGhlIHBhc3RlZCByZXN1bHQuXG4gICAgICAgICAgICB0aGlzLmhhdmVJbnB1dERhdGEgPSB0cnVlO1xuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQodGhpcy5pbmZlclNlcGFyYXRvclR5cGUuYmluZCh0aGlzKSwgMSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGluZmVyU2VwYXJhdG9yVHlwZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlICE9PSBcIm1kdlwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRleHQ6IHN0cmluZywgdGVzdDogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICB0ZXh0ID0gdGhpcy5yYXdUZXh0KCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgdGVzdCA9IHRleHQuc3BsaXQoJ1xcdCcpLmxlbmd0aCA+PSB0ZXh0LnNwbGl0KCcsJykubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHRoaXMuc2VwYXJhdG9yVHlwZSh0ZXN0ID8gJ3RhYicgOiAnY3N2Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlnbm9yZUdhcHModmFsdWU/OiBib29sZWFuKTogYm9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgaWdub3JlR2FwcyA9ICQoJyNpZ25vcmVHYXBzJyk7XG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gaWdub3JlR2Fwcy5wcm9wKCdjaGVja2VkJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlnbm9yZUdhcHMucHJvcCgnY2hlY2tlZCcsIHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGhpcy5pZ25vcmVEYXRhR2FwcyA9IHZhbHVlKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdHJhbnNwb3NlKHZhbHVlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHRyYW5zcG9zZSA9ICQoJyN0cmFuc3Bvc2UnKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0cmFuc3Bvc2UucHJvcCgnY2hlY2tlZCcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmFuc3Bvc2UucHJvcCgnY2hlY2tlZCcsIHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGhpcy50cmFuc3Bvc2VkID0gdmFsdWUpO1xuICAgICAgICB9XG5cblxuICAgICAgICBzZXBhcmF0b3JUeXBlKHZhbHVlPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHZhciBzZXBhcmF0b3JQdWxsZG93biA9ICQoJyNyYXdkYXRhZm9ybWF0cCcpO1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHNlcGFyYXRvclB1bGxkb3duLnZhbCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZXBhcmF0b3JQdWxsZG93bi52YWwodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnNlcGFyYXRvciA9IHZhbHVlKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmF3VGV4dCh2YWx1ZT86IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgICAgICB2YXIgcmF3QXJlYTogSlF1ZXJ5ID0gJCgnI3N0ZXAydGV4dGFyZWEnKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSByYXdBcmVhLnZhbCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYXdBcmVhLnZhbCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNsaWNrZWRPbklnbm9yZURhdGFHYXBzKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2FwcyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnJlcHJvY2Vzc1Jhd0RhdGEoKTsgICAgLy8gVGhpcyB3aWxsIHRha2UgY2FyZSBvZiByZWFkaW5nIHRoZSBzdGF0dXMgb2YgdGhlIGNoZWNrYm94XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNsaWNrZWRPblRyYW5zcG9zZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy51c2VyQ2xpY2tlZE9uVHJhbnNwb3NlID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMucmVwcm9jZXNzUmF3RGF0YSgpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUaGlzIGhhbmRsZXMgaW5zZXJ0aW9uIG9mIGEgdGFiIGludG8gdGhlIHRleHRhcmVhLlxuICAgICAgICAvLyBNYXkgYmUgZ2xpdGNoeS5cbiAgICAgICAgc3VwcHJlc3NOb3JtYWxUYWIoZTogSlF1ZXJ5S2V5RXZlbnRPYmplY3QpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBpbnB1dDogSFRNTElucHV0RWxlbWVudCwgdGV4dDogc3RyaW5nLCBzZWxTdGFydDogbnVtYmVyLCBzZWxFbmQ6IG51bWJlcjtcbiAgICAgICAgICAgIHRoaXMuaGF2ZUlucHV0RGF0YSA9IHRydWU7XG4gICAgICAgICAgICBpZiAoZS53aGljaCA9PT0gOSkge1xuICAgICAgICAgICAgICAgIGlucHV0ID0gPEhUTUxJbnB1dEVsZW1lbnQ+ZS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgLy8gVGhlc2UgbmVlZCB0byBiZSByZWFkIG91dCBiZWZvcmUgdGhleSBhcmUgZGVzdHJveWVkIGJ5IGFsdGVyaW5nIHRoZSB2YWx1ZSBvZiB0aGUgZWxlbWVudC5cbiAgICAgICAgICAgICAgICB2YXIgc2VsU3RhcnQgPSBpbnB1dC5zZWxlY3Rpb25TdGFydDtcbiAgICAgICAgICAgICAgICB2YXIgc2VsRW5kID0gaW5wdXQuc2VsZWN0aW9uRW5kO1xuICAgICAgICAgICAgICAgIHRleHQgPSAkKGlucHV0KS52YWwoKTtcbiAgICAgICAgICAgICAgICAvLyBzZXQgdmFsdWUgdG8gaXRzZWxmIHdpdGggc2VsZWN0aW9uIHJlcGxhY2VkIGJ5IGEgdGFiIGNoYXJhY3RlclxuICAgICAgICAgICAgICAgICQoaW5wdXQpLnZhbChbXG4gICAgICAgICAgICAgICAgICAgIHRleHQuc3Vic3RyaW5nKDAsIHNlbFN0YXJ0KSxcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zdWJzdHJpbmcoc2VsRW5kKVxuICAgICAgICAgICAgICAgIF0uam9pbignXFx0JykpO1xuICAgICAgICAgICAgICAgIC8vIHB1dCBjYXJldCBhdCByaWdodCBwb3NpdGlvbiBhZ2FpblxuICAgICAgICAgICAgICAgIHNlbEVuZCA9IHNlbFN0YXJ0ICsgMTtcbiAgICAgICAgICAgICAgICBpbnB1dC5zZWxlY3Rpb25TdGFydCA9IHNlbEVuZDtcbiAgICAgICAgICAgICAgICBpbnB1dC5zZWxlY3Rpb25FbmQgPSBzZWxFbmQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGdldEdyaWQoKTogYW55W10ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ3JpZEZyb21UZXh0RmllbGQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRVc2VyV2FybmluZ3MoKTpJbXBvcnRNZXNzYWdlW10ge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0VXNlckVycm9ycygpOkltcG9ydE1lc3NhZ2VbXSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cblxuICAgICAgICByZXF1aXJlZElucHV0c1Byb3ZpZGVkKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLnJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKSAmJiB0aGlzLmhhdmVJbnB1dERhdGE7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgLy8gdHlwZSBmb3IgdGhlIG9wdGlvbnMgaW4gcm93IHB1bGxkb3duc1xuICAgIC8vIFRPRE8gdXBkYXRlIHRvIHVzZSB1bmlvbnMgd2hlbiBtaWdyYXRpbmcgdG8gVHlwZXNjcmlwdCAxLjQrXG4gICAgaW50ZXJmYWNlIFJvd1B1bGxkb3duT3B0aW9uIGV4dGVuZHMgQXJyYXk8YW55PiB7IC8vIEFycmF5PHN0cmluZ3xudW1iZXJ8Um93UHVsbGRvd25PcHRpb25bXT5cbiAgICAgICAgMDogc3RyaW5nO1xuICAgICAgICAxOiBhbnk7IC8vIG51bWJlciB8IFJvd1B1bGxkb3duT3B0aW9uW11cbiAgICB9XG5cblxuICAgIC8vIE1hZ2ljIG51bWJlcnMgdXNlZCBpbiBwdWxsZG93bnMgdG8gYXNzaWduIHR5cGVzIHRvIHJvd3MvZmllbGRzLlxuICAgIGV4cG9ydCBjbGFzcyBUeXBlRW51bSB7XG4gICAgICAgIHN0YXRpYyBHZW5lX05hbWVzID0gMTA7XG4gICAgICAgIHN0YXRpYyBSUEtNX1ZhbHVlcyA9IDExO1xuICAgICAgICBzdGF0aWMgQXNzYXlfTGluZV9OYW1lcyA9IDE7XG4gICAgICAgIHN0YXRpYyBQcm90ZWluX05hbWUgPSAxMjtcbiAgICAgICAgc3RhdGljIE1lYXN1cmVtZW50X1R5cGVzID0gMjsgLy8gcGx1cmFsISFcbiAgICAgICAgc3RhdGljIFRpbWVzdGFtcCA9IDM7XG4gICAgICAgIHN0YXRpYyBNZXRhZGF0YV9OYW1lID0gNDtcbiAgICAgICAgc3RhdGljIE1lYXN1cmVtZW50X1R5cGUgPSA1OyAvLyBzaW5ndWxhciEhXG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGV2ZXJ5dGhpbmcgaW4gdGhlIFwiU3RlcCAzXCIgYm94IHRoYXQgeW91IHNlZSBvbiB0aGUgZGF0YSBpbXBvcnQgcGFnZS5cbiAgICAvLyBHZXQgdGhlIGdyaWQgZnJvbSB0aGUgcHJldmlvdXMgc3RlcCwgYW5kIGRyYXcgaXQgYXMgYSB0YWJsZSB3aXRoIHB1bGRvd25zIGZvciBzcGVjaWZ5aW5nIHRoZSBjb250ZW50XG4gICAgLy8gb2YgdGhlIHJvd3MgYW5kIGNvbHVtbnMsIGFzIHdlbGwgYXMgY2hlY2tib3hlcyB0byBlbmFibGUgb3IgZGlzYWJsZSByb3dzIG9yIGNvbHVtbnMuXG4gICAgLy8gSW50ZXJwcmV0IHRoZSBjdXJyZW50IGdyaWQgYW5kIHRoZSBzZXR0aW5ncyBvbiB0aGUgY3VycmVudCB0YWJsZSBpbnRvIEVERC1mcmllbmRseSBzZXRzLlxuICAgIGV4cG9ydCBjbGFzcyBJZGVudGlmeVN0cnVjdHVyZXNTdGVwIGltcGxlbWVudHMgSW1wb3J0U3RlcCB7XG5cbiAgICAgICAgcm93TGFiZWxDZWxsczogYW55W107XG4gICAgICAgIGNvbENoZWNrYm94Q2VsbHM6IGFueVtdO1xuICAgICAgICByb3dDaGVja2JveENlbGxzOiBhbnlbXTsgICAgLy8gTm90ZTogdGhpcyBpcyBidWlsdCwgYnV0IG5ldmVyIHJlZmVyZW5jZWQuLi4gIE1pZ2h0IGFzIHdlbGwgY3V0IGl0LlxuXG4gICAgICAgIGNvbE9iamVjdHM6IGFueVtdO1xuICAgICAgICBkYXRhQ2VsbHM6IGFueVtdO1xuXG4gICAgICAgIC8vIFdlIGtlZXAgYSBzaW5nbGUgZmxhZyBmb3IgZWFjaCBkYXRhIHBvaW50IFt5LHhdXG4gICAgICAgIC8vIGFzIHdlbGwgYXMgdHdvIGxpbmVhciBzZXRzIG9mIGZsYWdzIGZvciBlbmFibGluZyBvciBkaXNhYmxpbmdcbiAgICAgICAgLy8gZW50aXJlIGNvbHVtbnMvcm93cy5cbiAgICAgICAgYWN0aXZlQ29sRmxhZ3M6IGFueVtdO1xuICAgICAgICBhY3RpdmVSb3dGbGFnczogYW55W107XG4gICAgICAgIGFjdGl2ZUZsYWdzOiBhbnlbXTtcblxuICAgICAgICAvLyBBcnJheXMgZm9yIHRoZSBwdWxsZG93biBtZW51cyBvbiB0aGUgbGVmdCBzaWRlIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgLy8gVGhlc2UgcHVsbGRvd25zIGFyZSB1c2VkIHRvIHNwZWNpZnkgdGhlIGRhdGEgdHlwZSAtIG9yIHR5cGVzIC0gY29udGFpbmVkIGluIGVhY2hcbiAgICAgICAgLy8gcm93IG9mIHRoZSBwYXN0ZWQgZGF0YS5cbiAgICAgICAgcHVsbGRvd25PYmplY3RzOiBhbnlbXTtcbiAgICAgICAgcHVsbGRvd25TZXR0aW5nczogYW55W107XG4gICAgICAgIC8vIFdlIGFsc28ga2VlcCBhIHNldCBvZiBmbGFncyB0byB0cmFjayB3aGV0aGVyIGEgcHVsbGRvd24gd2FzIGNoYW5nZWQgYnkgYSB1c2VyIGFuZFxuICAgICAgICAvLyB3aWxsIG5vdCBiZSByZWNhbGN1bGF0ZWQuXG4gICAgICAgIHB1bGxkb3duVXNlckNoYW5nZWRGbGFnczogYW55W107XG5cbiAgICAgICAgZ3JhcGhFbmFibGVkOiBib29sZWFuO1xuICAgICAgICBncmFwaFJlZnJlc2hUaW1lcklEOiBhbnk7XG5cbiAgICAgICAgLy8gRGF0YSBzdHJ1Y3R1cmVzIHB1bGxlZCBmcm9tIHRoZSBTdGVwIDIgZ3JpZCBvciBzZXJ2ZXIgcmVzcG9uc2UsXG4gICAgICAgIC8vIGFuZCBjb21wb3NlZCBpbnRvIHNldHMgc3VpdGFibGUgZm9yIHN1Ym1pc3Npb24gdG8gdGhlIHNlcnZlci5cbiAgICAgICAgcGFyc2VkU2V0czogUmF3SW1wb3J0U2V0W107XG4gICAgICAgIGdyYXBoU2V0czogR3JhcGhpbmdTZXRbXTtcbiAgICAgICAgdW5pcXVlTGluZU5hbWVzOiBhbnlbXTtcbiAgICAgICAgdW5pcXVlQXNzYXlOYW1lczogYW55W107XG4gICAgICAgIHVuaXF1ZU1lYXN1cmVtZW50TmFtZXM6IGFueVtdO1xuICAgICAgICB1bmlxdWVNZXRhZGF0YU5hbWVzOiBhbnlbXTtcbiAgICAgICAgLy8gQSBmbGFnIHRvIGluZGljYXRlIHdoZXRoZXIgd2UgaGF2ZSBzZWVuIGFueSB0aW1lc3RhbXBzIHNwZWNpZmllZCBpbiB0aGUgaW1wb3J0IGRhdGFcbiAgICAgICAgc2VlbkFueVRpbWVzdGFtcHM6IGJvb2xlYW47XG5cbiAgICAgICAgcmF3SW5wdXRTdGVwOiBSYXdJbnB1dFN0ZXA7XG4gICAgICAgIHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXA7XG4gICAgICAgIG5leHRTdGVwQ2FsbGJhY2s6IGFueTtcblxuICAgICAgICB3YXJuaW5nTWVzc2FnZXM6SW1wb3J0TWVzc2FnZVtdO1xuICAgICAgICBlcnJvck1lc3NhZ2VzOkltcG9ydE1lc3NhZ2VbXTtcblxuICAgICAgICBzdGF0aWMgTU9ERVNfV0lUSF9EQVRBX1RBQkxFOiBzdHJpbmdbXSA9IFsnc3RkJywgJ3RyJywgJ3ByJywgJ21kdiddOyAvLyBTdGVwIDEgbW9kZXMgaW4gd2hpY2ggdGhlIGRhdGEgdGFibGUgZ2V0cyBkaXNwbGF5ZWRcbiAgICAgICAgc3RhdGljIE1PREVTX1dJVEhfR1JBUEg6IHN0cmluZ1tdID0gWydzdGQnLCAnYmlvbGVjdG9yJywgJ2hwbGMnXTtcblxuICAgICAgICBzdGF0aWMgRElTQUJMRURfUFVMTERPV05fTEFCRUw6IHN0cmluZyA9ICctLSc7XG4gICAgICAgIHN0YXRpYyBERUZBVUxUX1BVTExET1dOX1ZBTFVFOiBudW1iZXIgPSAwO1xuXG4gICAgICAgIHN0YXRpYyBEVVBMSUNBVEVfTEVHRU5EX1RIUkVTSE9MRDpudW1iZXIgPSAxMDtcblxuXG4gICAgICAgIGNvbnN0cnVjdG9yKHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXAsIHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCBuZXh0U3RlcENhbGxiYWNrOiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5yYXdJbnB1dFN0ZXAgPSByYXdJbnB1dFN0ZXA7XG5cbiAgICAgICAgICAgIHRoaXMucm93TGFiZWxDZWxscyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5jb2xDaGVja2JveENlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLmNvbE9iamVjdHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzID0gW107XG5cbiAgICAgICAgICAgIC8vIFdlIGtlZXAgYSBzaW5nbGUgZmxhZyBmb3IgZWFjaCBkYXRhIHBvaW50IFt5LHhdXG4gICAgICAgICAgICAvLyBhcyB3ZWxsIGFzIHR3byBsaW5lYXIgc2V0cyBvZiBmbGFncyBmb3IgZW5hYmxpbmcgb3IgZGlzYWJsaW5nXG4gICAgICAgICAgICAvLyBlbnRpcmUgY29sdW1ucy9yb3dzLlxuICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFncyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFncyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFncyA9IFtdO1xuXG4gICAgICAgICAgICAvLyBBcnJheXMgZm9yIHRoZSBwdWxsZG93biBtZW51cyBvbiB0aGUgbGVmdCBzaWRlIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgICAgIC8vIFRoZXNlIHB1bGxkb3ducyBhcmUgdXNlZCB0byBzcGVjaWZ5IHRoZSBkYXRhIHR5cGUgLSBvciB0eXBlcyAtIGNvbnRhaW5lZCBpbiBlYWNoXG4gICAgICAgICAgICAvLyByb3cgb2YgdGhlIHBhc3RlZCBkYXRhLlxuICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5ncyA9IFtdO1xuICAgICAgICAgICAgLy8gV2UgYWxzbyBrZWVwIGEgc2V0IG9mIGZsYWdzIHRvIHRyYWNrIHdoZXRoZXIgYSBwdWxsZG93biB3YXMgY2hhbmdlZCBieSBhIHVzZXIgYW5kXG4gICAgICAgICAgICAvLyB3aWxsIG5vdCBiZSByZWNhbGN1bGF0ZWQuXG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duVXNlckNoYW5nZWRGbGFncyA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLmdyYXBoRW5hYmxlZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQgPSBudWxsO1xuXG4gICAgICAgICAgICB0aGlzLnBhcnNlZFNldHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhTZXRzID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUxpbmVOYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVBc3NheU5hbWVzID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTWV0YWRhdGFOYW1lcyA9IFtdO1xuICAgICAgICAgICAgLy8gQSBmbGFnIHRvIGluZGljYXRlIHdoZXRoZXIgd2UgaGF2ZSBzZWVuIGFueSB0aW1lc3RhbXBzIHNwZWNpZmllZCBpbiB0aGUgaW1wb3J0IGRhdGFcbiAgICAgICAgICAgIHRoaXMuc2VlbkFueVRpbWVzdGFtcHMgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwID0gc2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjayA9IG5leHRTdGVwQ2FsbGJhY2s7XG5cbiAgICAgICAgICAgIHRoaXMud2FybmluZ01lc3NhZ2VzPVtdO1xuICAgICAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VzPVtdO1xuXG4gICAgICAgICAgICAkKCcjZGF0YVRhYmxlRGl2JylcbiAgICAgICAgICAgICAgICAub24oJ21vdXNlb3ZlciBtb3VzZW91dCcsICd0ZCcsIHRoaXMuaGlnaGxpZ2h0ZXJGLmJpbmQodGhpcykpXG4gICAgICAgICAgICAgICAgLm9uKCdkYmxjbGljaycsICd0ZCcsIHRoaXMuc2luZ2xlVmFsdWVEaXNhYmxlckYuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgICAgICQoJyNyZXNldHN0ZXAzJykub24oJ2NsaWNrJywgdGhpcy5yZXNldEVuYWJsZWRGbGFnTWFya2Vycy5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gY2FsbGVkIHRvIGluZm9ybSB0aGlzIHN0ZXAgdGhhdCB0aGUgaW1tZWRpYXRlbHkgcHJlY2VkaW5nIHN0ZXAgaGFzIGJlZ3VuIHByb2Nlc3NpbmdcbiAgICAgICAgLy8gaXRzIGlucHV0cy4gVGhlIGFzc3VtcHRpb24gaXMgdGhhdCB0aGUgcHJvY2Vzc2luZyBpcyB0YWtpbmcgcGxhY2UgdW50aWwgdGhlIG5leHQgY2FsbCB0b1xuICAgICAgICAvLyBwcmV2aW91c1N0ZXBDaGFuZ2VkKCkuXG4gICAgICAgIHByb2Nlc3NpbmdGaWxlSW5QcmV2aW91c1N0ZXAoKTogdm9pZCB7XG4gICAgICAgICAgICAkKCcjcHJvY2Vzc2luZ1N0ZXAyUmVzdWx0c0xhYmVsJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2VudGVyRGF0YUluU3RlcDInKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZGF0YVRhYmxlRGl2JykuZmluZChcImlucHV0LGJ1dHRvbix0ZXh0YXJlYSxzZWxlY3RcIikuYXR0cihcImRpc2FibGVkXCIsIFwiZGlzYWJsZWRcIik7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHByZXZpb3VzU3RlcENoYW5nZWQoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgcHJldlN0ZXBDb21wbGV0ZTogYm9vbGVhbixcbiAgICAgICAgICAgICAgICBpZ25vcmVEYXRhR2Fwczpib29sZWFuLFxuICAgICAgICAgICAgICAgIHNob3dEYXRhVGFibGU6Ym9vbGVhbixcbiAgICAgICAgICAgICAgICBzaG93R3JhcGg6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgbW9kZTogc3RyaW5nLFxuICAgICAgICAgICAgICAgIGdyYXBoOiBKUXVlcnksXG4gICAgICAgICAgICAgICAgZ3JpZFJvd01hcmtlcnM6YW55W10sXG4gICAgICAgICAgICAgICAgZ3JpZDphbnlbXTtcbiAgICAgICAgICAgIHByZXZTdGVwQ29tcGxldGUgPSB0aGlzLnJhd0lucHV0U3RlcC5yZXF1aXJlZElucHV0c1Byb3ZpZGVkKCk7XG4gICAgICAgICAgICAkKCcjcHJvY2Vzc2luZ1N0ZXAyUmVzdWx0c0xhYmVsJykudG9nZ2xlQ2xhc3MoJ29mZicsICFwcmV2U3RlcENvbXBsZXRlKTtcbiAgICAgICAgICAgICQoJyNlbnRlckRhdGFJblN0ZXAyJykudG9nZ2xlQ2xhc3MoJ29mZicsIHByZXZTdGVwQ29tcGxldGUpO1xuICAgICAgICAgICAgJCgnI2RhdGFUYWJsZURpdicpLnRvZ2dsZUNsYXNzKCdvZmYnLCAhcHJldlN0ZXBDb21wbGV0ZSk7XG5cbiAgICAgICAgICAgIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgZ3JhcGggPSAkKCcjZ3JhcGhEaXYnKTtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhFbmFibGVkID0gSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5NT0RFU19XSVRIX0dSQVBILmluZGV4T2YobW9kZSkgPj0gMDtcbiAgICAgICAgICAgIHNob3dHcmFwaCA9IHRoaXMuZ3JhcGhFbmFibGVkICYmIHByZXZTdGVwQ29tcGxldGU7XG4gICAgICAgICAgICBncmFwaC50b2dnbGVDbGFzcygnb2ZmJywgIXNob3dHcmFwaCk7XG5cbiAgICAgICAgICAgIGdyaWRSb3dNYXJrZXJzID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnM7XG4gICAgICAgICAgICBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuICAgICAgICAgICAgaWdub3JlRGF0YUdhcHMgPSB0aGlzLnJhd0lucHV0U3RlcC5pZ25vcmVEYXRhR2FwcztcblxuICAgICAgICAgICAgLy8gRW1wdHkgdGhlIGRhdGEgdGFibGUgd2hldGhlciB3ZSByZW1ha2UgaXQgb3Igbm90Li4uXG4gICAgICAgICAgICAkKCcjZGF0YVRhYmxlRGl2JykuZW1wdHkoKTtcblxuICAgICAgICAgICAgc2hvd0RhdGFUYWJsZSA9IElkZW50aWZ5U3RydWN0dXJlc1N0ZXAuTU9ERVNfV0lUSF9EQVRBX1RBQkxFLmluZGV4T2YobW9kZSkgPj0gMDtcbiAgICAgICAgICAgICQoJyNzdGVwM1VwcGVyTGVnZW5kJykudG9nZ2xlQ2xhc3MoJ29mZicsICFzaG93RGF0YVRhYmxlKTtcblxuICAgICAgICAgICAgaWYgKHNob3dEYXRhVGFibGUpIHtcbiAgICAgICAgICAgICAgICBncmlkUm93TWFya2Vycy5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHR5cGU6IGFueTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSA9IHRoaXMuZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZShtb2RlLCB2YWx1ZSwgZ3JpZFtpXSB8fCBbXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSBjYW4gbm8gbG9uZ2VyIGd1ZXNzIHRoZSB0eXBlLCBidXQgdGhpcyBwdWxsZG93biB3YXMgcHJldmlvdXNseSBzZXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRvIGEgbm9uLXplcm8gdmFsdWUgYXV0b21hdGljYWxseSBvciBieSBhbiBhdXRvLWZpbGwgb3BlcmF0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgcHJlc2VydmUgdGhlIG9sZCBzZXR0aW5nLiAgVGhpcyBwcmV2ZW50cyBpbi1wbGFjZSBlZGl0cyBmcm9tXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBibGFua2luZyBvdXQgcHJldmlvdXMgc2VsZWN0aW9ucyBpbiBTdGVwIDMuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSB0eXBlIHx8IHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGEgbWFwIG9mIGVuYWJsZWQvZGlzYWJsZWQgZmxhZ3MgZm9yIG91ciBkYXRhLFxuICAgICAgICAgICAgICAgIC8vIGJ1dCBvbmx5IGZpbGwgdGhlIGFyZWFzIHRoYXQgZG8gbm90IGFscmVhZHkgZXhpc3QuXG4gICAgICAgICAgICAgICAgdGhpcy5pbmZlckFjdGl2ZUZsYWdzKGdyaWQpO1xuICAgICAgICAgICAgICAgIC8vIENvbnN0cnVjdCB0YWJsZSBjZWxsIG9iamVjdHMgZm9yIHRoZSBwYWdlLCBiYXNlZCBvbiBvdXIgZXh0cmFjdGVkIGRhdGFcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnN0cnVjdERhdGFUYWJsZShtb2RlLCBncmlkLCBncmlkUm93TWFya2Vycyk7XG4gICAgICAgICAgICAgICAgLy8gYW5kIGxlYXZpbmcgb3V0IGFueSB2YWx1ZXMgdGhhdCBoYXZlIGJlZW4gaW5kaXZpZHVhbGx5IGZsYWdnZWQuXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBzdHlsZXMgb2YgdGhlIG5ldyB0YWJsZSB0byByZWZsZWN0IHRoZVxuICAgICAgICAgICAgICAgIC8vIChwb3NzaWJseSBwcmV2aW91c2x5IHNldCkgZmxhZyBtYXJrZXJzIGFuZCB0aGUgXCJpZ25vcmUgZ2Fwc1wiIHNldHRpbmcuXG4gICAgICAgICAgICAgICAgdGhpcy5yZWRyYXdJZ25vcmVkR2FwTWFya2VycyhpZ25vcmVEYXRhR2Fwcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIXNob3dHcmFwaCkge1xuICAgICAgICAgICAgICAgICQoJyNkYXRhVGFibGVEaXYnKS50ZXh0KCdUaGlzIHN0ZXAgaXMgbm90IG5lZWRlZCBmb3IgdGhlIGN1cnJlbnQgaW1wb3J0LiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ05vdGhpbmcgdG8gc2VlIGhlcmUsIHByb2NlZWQgdG8gU3RlcCA0LicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRWl0aGVyIHdlJ3JlIGludGVycHJldGluZyBzb21lIHByZS1wcm9jZXNzZWQgZGF0YSBzZXRzIGZyb20gYSBzZXJ2ZXIgcmVzcG9uc2UsXG4gICAgICAgICAgICAvLyBvciB3ZSdyZSBpbnRlcnByZXRpbmcgdGhlIGRhdGEgdGFibGUgd2UganVzdCBsYWlkIG91dCBhYm92ZSxcbiAgICAgICAgICAgIC8vIHdoaWNoIGludm9sdmVzIHNraXBwaW5nIGRpc2FibGVkIHJvd3Mgb3IgY29sdW1ucywgb3B0aW9uYWxseSBpZ25vcmluZyBibGFuayB2YWx1ZXMsIGV0Yy5cbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG5cbiAgICAgICAgICAgIC8vIFN0YXJ0IGEgZGVsYXkgdGltZXIgdGhhdCByZWRyYXdzIHRoZSBncmFwaCBmcm9tIHRoZSBpbnRlcnByZXRlZCBkYXRhLlxuICAgICAgICAgICAgLy8gVGhpcyBpcyByYXRoZXIgcmVzb3VyY2UgaW50ZW5zaXZlLCBzbyB3ZSdyZSBkZWxheWluZyBhIGJpdCwgYW5kIHJlc3RhcnRpbmcgdGhlIGRlbGF5XG4gICAgICAgICAgICAvLyBpZiB0aGUgdXNlciBtYWtlcyBhZGRpdGlvbmFsIGVkaXRzIHRvIHRoZSBkYXRhIHdpdGhpbiB0aGUgZGVsYXkgcGVyaW9kLlxuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICAkKCcjcHJvY2Vzc2luZ1N0ZXAyUmVzdWx0c0xhYmVsJykuYWRkQ2xhc3MoJ29mZicpO1xuXG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZShtb2RlOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHJvdzogc3RyaW5nW10pOiBudW1iZXIge1xuICAgICAgICAgICAgdmFyIGJsYW5rOiBudW1iZXIsIHN0cmluZ3M6IG51bWJlciwgY29uZGVuc2VkOiBzdHJpbmdbXTtcbiAgICAgICAgICAgIGlmIChtb2RlID09ICd0cicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGFiZWwubWF0Y2goL2dlbmUvaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFR5cGVFbnVtLkdlbmVfTmFtZXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsYWJlbC5tYXRjaCgvcnBrbS9pKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gVHlwZUVudW0uUlBLTV9WYWx1ZXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIElmIHdlIGNhbid0IG1hdGNoIHRvIHRoZSBhYm92ZSB0d28sIHNldCB0aGUgcm93IHRvICd1bmRlZmluZWQnIHNvIGl0J3MgaWdub3JlZCBieSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBUYWtlIGNhcmUgb2Ygc29tZSBicmFpbmRlYWQgZ3Vlc3Nlc1xuICAgICAgICAgICAgaWYgKGxhYmVsLm1hdGNoKC9hc3NheS9pKSB8fCBsYWJlbC5tYXRjaCgvbGluZS9pKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBUeXBlRW51bS5Bc3NheV9MaW5lX05hbWVzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1vZGUgPT0gJ3ByJykge1xuICAgICAgICAgICAgICAgIGlmIChsYWJlbC5tYXRjaCgvcHJvdGVpbi9pKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gVHlwZUVudW0uUHJvdGVpbl9OYW1lO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBObyBwb2ludCBpbiBjb250aW51aW5nLCBvbmx5IGxpbmUgYW5kIHByb3RlaW4gYXJlIHJlbGV2YW50XG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBUaGluZ3Mgd2UnbGwgYmUgY291bnRpbmcgdG8gaGF6YXJkIGEgZ3Vlc3MgYXQgdGhlIHJvdyBjb250ZW50c1xuICAgICAgICAgICAgYmxhbmsgPSBzdHJpbmdzID0gMDtcbiAgICAgICAgICAgIC8vIEEgY29uZGVuc2VkIHZlcnNpb24gb2YgdGhlIHJvdywgd2l0aCBubyBudWxscyBvciBibGFuayB2YWx1ZXNcbiAgICAgICAgICAgIGNvbmRlbnNlZCA9IHJvdy5maWx0ZXIoKHY6IHN0cmluZyk6IGJvb2xlYW4gPT4gISF2KTtcbiAgICAgICAgICAgIGJsYW5rID0gcm93Lmxlbmd0aCAtIGNvbmRlbnNlZC5sZW5ndGg7XG4gICAgICAgICAgICBjb25kZW5zZWQuZm9yRWFjaCgodjogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdiA9IHYucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKHBhcnNlRmxvYXQodikpKSB7XG4gICAgICAgICAgICAgICAgICAgICsrc3RyaW5ncztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHRoZSBsYWJlbCBwYXJzZXMgaW50byBhIG51bWJlciBhbmQgdGhlIGRhdGEgY29udGFpbnMgbm8gc3RyaW5ncywgY2FsbCBpdCBhXG4gICAgICAgICAgICAvLyB0aW1lc3RhbXAgZm9yIGRhdGFcbiAgICAgICAgICAgIGlmICghaXNOYU4ocGFyc2VGbG9hdChsYWJlbCkpICYmIChzdHJpbmdzID09PSAwKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBUeXBlRW51bS5UaW1lc3RhbXA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBObyBjaG9pY2UgYnkgZGVmYXVsdFxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGluZmVyQWN0aXZlRmxhZ3MoZ3JpZDogYW55KTogdm9pZCB7XG4gICAgICAgICAgICAvLyBBbiBpbXBvcnRhbnQgdGhpbmcgdG8gbm90ZSBoZXJlIGlzIHRoYXQgdGhpcyBkYXRhIGlzIGluIHJvdyBtYWpvciBmb3JtYXRcbiAgICAgICAgICAgIC8vIGZvcm1hdCAtIHRoYXQgaXMsIGl0IGdvZXMgYnkgcm93LCB0aGVuIGJ5IGNvbHVtbiwgd2hlbiByZWZlcmVuY2luZyAoaS5lLlxuICAgICAgICAgICAgLy8gW3Jvd11bY29sdW1uXSkuIFRoaXMgbWF0Y2hlcyBHcmlkLmRhdGEgYW5kIFRhYmxlLmRhdGFDZWxscy5cblxuICAgICAgICAgICAgLy8gaW5mZXIgY29sdW1uIGFjdGl2ZSBzdGF0dXNcbiAgICAgICAgICAgIChncmlkWzBdIHx8IFtdKS5mb3JFYWNoKChfLCBjb2xJbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlQ29sRmxhZ3NbY29sSW5kZXhdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1tjb2xJbmRleF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBpbmZlciByb3cgYWN0aXZlIHN0YXR1c1xuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCByb3dJbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUm93RmxhZ3Nbcm93SW5kZXhdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFnc1tyb3dJbmRleF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzW3Jvd0luZGV4XSA9IHRoaXMuYWN0aXZlRmxhZ3Nbcm93SW5kZXhdIHx8IFtdO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChfLCBjb2xJbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUZsYWdzW3Jvd0luZGV4XVtjb2xJbmRleF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFnc1tyb3dJbmRleF1bY29sSW5kZXhdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNvbnN0cnVjdERhdGFUYWJsZShtb2RlOiBzdHJpbmcsIGdyaWQ6IGFueSwgZ3JpZFJvd01hcmtlcnM6IGFueSk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsXG4gICAgICAgICAgICAgICAgY29sZ3JvdXA6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICBjb250cm9sQ29sczogc3RyaW5nW10sXG4gICAgICAgICAgICAgICAgbGVnZW5kQ29weTogSlF1ZXJ5LFxuICAgICAgICAgICAgICAgIGxvd2VyTGVnZW5kOiBKUXVlcnksXG4gICAgICAgICAgICAgICAgbG93ZXJMZWdlbmRJZDogc3RyaW5nLFxuICAgICAgICAgICAgICAgIHB1bGxkb3duT3B0aW9uczogUm93UHVsbGRvd25PcHRpb25bXSxcbiAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsXG4gICAgICAgICAgICAgICAgdGhhdDogSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCxcbiAgICAgICAgICAgICAgICB0YWJsZTogSFRNTFRhYmxlRWxlbWVudDtcblxuICAgICAgICAgICAgdGhpcy5kYXRhQ2VsbHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuY29sQ2hlY2tib3hDZWxscyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5jb2xPYmplY3RzID0gW107XG4gICAgICAgICAgICB0aGlzLnJvd0xhYmVsQ2VsbHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucm93Q2hlY2tib3hDZWxscyA9IFtdO1xuICAgICAgICAgICAgY29udHJvbENvbHMgPSBbJ2NoZWNrYm94JywgJ3B1bGxkb3duJywgJ2xhYmVsJ107XG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3RyJykge1xuICAgICAgICAgICAgICAgIHB1bGxkb3duT3B0aW9ucyA9IFtcbiAgICAgICAgICAgICAgICAgICAgWyBJZGVudGlmeVN0cnVjdHVyZXNTdGVwLkRJU0FCTEVEX1BVTExET1dOX0xBQkVMLCBJZGVudGlmeVN0cnVjdHVyZXNTdGVwLkRFRkFVTFRfUFVMTERPV05fVkFMVUVdLFxuICAgICAgICAgICAgICAgICAgICBbJ0VudGlyZSBSb3cgSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydHZW5lIE5hbWVzJywgVHlwZUVudW0uR2VuZV9OYW1lc10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydSUEtNIFZhbHVlcycsIFR5cGVFbnVtLlJQS01fVmFsdWVzXVxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ3ByJykge1xuICAgICAgICAgICAgICAgIHB1bGxkb3duT3B0aW9ucyA9IFtcbiAgICAgICAgICAgICAgICAgICAgWyBJZGVudGlmeVN0cnVjdHVyZXNTdGVwLkRJU0FCTEVEX1BVTExET1dOX0xBQkVMLCBJZGVudGlmeVN0cnVjdHVyZXNTdGVwLkRFRkFVTFRfUFVMTERPV05fVkFMVUVdLFxuICAgICAgICAgICAgICAgICAgICBbJ0VudGlyZSBSb3cgSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydBc3NheS9MaW5lIE5hbWVzJywgVHlwZUVudW0uQXNzYXlfTGluZV9OYW1lc10sXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgIFsnRmlyc3QgQ29sdW1uIElzLi4uJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnUHJvdGVpbiBOYW1lJywgVHlwZUVudW0uUHJvdGVpbl9OYW1lXVxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHVsbGRvd25PcHRpb25zID0gW1xuICAgICAgICAgICAgICAgICAgICBbIElkZW50aWZ5U3RydWN0dXJlc1N0ZXAuRElTQUJMRURfUFVMTERPV05fTEFCRUwsIElkZW50aWZ5U3RydWN0dXJlc1N0ZXAuREVGQVVMVF9QVUxMRE9XTl9WQUxVRV0sXG4gICAgICAgICAgICAgICAgICAgIFsnRW50aXJlIFJvdyBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ0Fzc2F5L0xpbmUgTmFtZXMnLCBUeXBlRW51bS5Bc3NheV9MaW5lX05hbWVzXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ01lYXN1cmVtZW50IFR5cGVzJywgVHlwZUVudW0uTWVhc3VyZW1lbnRfVHlwZXNdXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgIFsnRmlyc3QgQ29sdW1uIElzLi4uJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgWydUaW1lIChpbiBob3VycyknLCBUeXBlRW51bS5UaW1lc3RhbXBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnTWV0YWRhdGEgTmFtZScsIFR5cGVFbnVtLk1ldGFkYXRhX05hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnTWVhc3VyZW1lbnQgVHlwZScsIFR5cGVFbnVtLk1lYXN1cmVtZW50X1R5cGVdXG4gICAgICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBhdHRhY2ggYWxsIGV2ZW50IGhhbmRsZXJzIHRvIHRoZSB0YWJsZSBpdHNlbGZcbiAgICAgICAgICAgIHRoYXQgPSB0aGlzO1xuICAgICAgICAgICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGFibGU+JykuYXR0cignY2VsbHNwYWNpbmcnLCAnMCcpLmFwcGVuZFRvKCQoJyNkYXRhVGFibGVEaXYnKSlcbiAgICAgICAgICAgICAgICAub24oJ2NsaWNrJywgJ1tuYW1lPWVuYWJsZUNvbHVtbl0nLCAoZXY6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC50b2dnbGVUYWJsZUNvbHVtbihldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgIH0pLm9uKCdjbGljaycsICdbbmFtZT1lbmFibGVSb3ddJywgKGV2OiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQudG9nZ2xlVGFibGVSb3coZXYudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9KS5vbignY2hhbmdlJywgJy5wdWxsZG93bkNlbGwgPiBzZWxlY3QnLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmc6IEpRdWVyeSA9ICQoZXYudGFyZ2V0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGk6IG51bWJlciA9IHBhcnNlSW50KHRhcmcuYXR0cignaScpLCAxMCksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWw6IG51bWJlciA9IHBhcnNlSW50KHRhcmcudmFsKCksIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5jaGFuZ2VkUm93RGF0YVR5cGVQdWxsZG93bihpLCB2YWwpO1xuICAgICAgICAgICAgICAgIH0pWzBdO1xuICAgICAgICAgICAgLy8gT25lIG9mIHRoZSBvYmplY3RzIGhlcmUgd2lsbCBiZSBhIGNvbHVtbiBncm91cCwgd2l0aCBjb2wgb2JqZWN0cyBpbiBpdC5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgYW4gaW50ZXJlc3RpbmcgdHdpc3Qgb24gRE9NIGJlaGF2aW9yIHRoYXQgeW91IHNob3VsZCBwcm9iYWJseSBnb29nbGUuXG4gICAgICAgICAgICBjb2xncm91cCA9ICQoJzxjb2xncm91cD4nKS5hcHBlbmRUbyh0YWJsZSk7XG4gICAgICAgICAgICBjb250cm9sQ29scy5mb3JFYWNoKCgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkKCc8Y29sPicpLmFwcGVuZFRvKGNvbGdyb3VwKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgICAgICAgICAvLyBTdGFydCB3aXRoIHRocmVlIGNvbHVtbnMsIGZvciB0aGUgY2hlY2tib3hlcywgcHVsbGRvd25zLCBhbmQgbGFiZWxzLlxuICAgICAgICAgICAgLy8gKFRoZXNlIHdpbGwgbm90IGJlIHRyYWNrZWQgaW4gVGFibGUuY29sT2JqZWN0cy4pXG5cbiAgICAgICAgICAgIC8vIGFkZCBjb2wgZWxlbWVudHMgZm9yIGVhY2ggZGF0YSBjb2x1bW5cbiAgICAgICAgICAgIHZhciBuQ29sdW1ucyA9IDA7XG4gICAgICAgICAgICAoZ3JpZFswXSB8fCBbXSkuZm9yRWFjaCgoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xPYmplY3RzLnB1c2goJCgnPGNvbD4nKS5hcHBlbmRUbyhjb2xncm91cClbMF0pO1xuICAgICAgICAgICAgICAgIG5Db2x1bW5zKys7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAvLyBGaXJzdCByb3c6IHNwYWNlciBjZWxscywgZm9sbG93ZWQgYnkgY2hlY2tib3ggY2VsbHMgZm9yIGVhY2ggZGF0YSBjb2x1bW5cbiAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+Ym9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgIC8vIHNwYWNlciBjZWxscyBoYXZlIHggYW5kIHkgc2V0IHRvIDAgdG8gcmVtb3ZlIGZyb20gaGlnaGxpZ2h0IGdyaWRcbiAgICAgICAgICAgIGNvbnRyb2xDb2xzLmZvckVhY2goKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7J3gnOiAnMCcsICd5JzogMH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAoZ3JpZFswXSB8fCBbXSkuZm9yRWFjaCgoXywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSwgYm94OiBKUXVlcnk7XG4gICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7J2lkJzogJ2NvbENCQ2VsbCcgKyBpLCAneCc6IDEgKyBpLCAneSc6IDB9KVxuICAgICAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2NoZWNrQm94Q2VsbCcpO1xuICAgICAgICAgICAgICAgIGJveCA9ICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIi8+JykuYXBwZW5kVG8oY2VsbClcbiAgICAgICAgICAgICAgICAgICAgLnZhbChpLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsnaWQnOiAnZW5hYmxlQ29sdW1uJyArIGksICduYW1lJzogJ2VuYWJsZUNvbHVtbid9KVxuICAgICAgICAgICAgICAgICAgICAucHJvcCgnY2hlY2tlZCcsIHRoaXMuYWN0aXZlQ29sRmxhZ3NbaV0pO1xuICAgICAgICAgICAgICAgIHRoaXMuY29sQ2hlY2tib3hDZWxscy5wdXNoKGNlbGxbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duT2JqZWN0cyA9IFtdOyAgLy8gV2UgZG9uJ3Qgd2FudCBhbnkgbGluZ2VyaW5nIG9sZCBvYmplY3RzIGluIHRoaXNcblxuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAvLyBUaGUgcmVzdCBvZiB0aGUgcm93czogQSBwdWxsZG93biwgYSBjaGVja2JveCwgYSByb3cgbGFiZWwsIGFuZCBhIHJvdyBvZiBkYXRhLlxuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICBncmlkLmZvckVhY2goKHZhbHVlczogc3RyaW5nW10sIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnk7XG4gICAgICAgICAgICAgICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+Ym9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAvLyBjaGVja2JveCBjZWxsXG4gICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ2NoZWNrQm94Q2VsbCcpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsnaWQnOiAncm93Q0JDZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMX0pO1xuICAgICAgICAgICAgICAgICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIi8+JylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoeydpZCc6ICdlbmFibGVSb3cnICsgaSwgJ25hbWUnOiAnZW5hYmxlUm93Jyx9KVxuICAgICAgICAgICAgICAgICAgICAudmFsKGkudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgLnByb3AoJ2NoZWNrZWQnLCB0aGlzLmFjdGl2ZVJvd0ZsYWdzW2ldKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yb3dDaGVja2JveENlbGxzLnB1c2goY2VsbFswXSk7XG5cbiAgICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAgIC8vIHB1bGxkb3duIGNlbGxcbiAgICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdwdWxsZG93bkNlbGwnKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7J2lkJzogJ3Jvd1BDZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMX0pO1xuICAgICAgICAgICAgICAgIC8vIHVzZSBleGlzdGluZyBzZXR0aW5nLCBvciB1c2UgdGhlIGxhc3QgaWYgcm93cy5sZW5ndGggPiBzZXR0aW5ncy5sZW5ndGgsIG9yIGJsYW5rXG4gICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93blNldHRpbmdzW2ldID0gdGhpcy5wdWxsZG93blNldHRpbmdzW2ldXG4gICAgICAgICAgICAgICAgICAgIHx8IHRoaXMucHVsbGRvd25TZXR0aW5ncy5zbGljZSgtMSlbMF0gfHwgMDtcbiAgICAgICAgICAgICAgICB0aGlzLnBvcHVsYXRlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgICAgIGNlbGwgPSAkKCc8c2VsZWN0PicpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXR0cih7J2lkJzogJ3JvdycgKyBpICsgJ3R5cGUnLCAnbmFtZSc6ICdyb3cnICsgaSArICd0eXBlJywgJ2knOiBpfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKSxcbiAgICAgICAgICAgICAgICAgICAgcHVsbGRvd25PcHRpb25zLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzLnB1c2goY2VsbFswXSk7XG5cbiAgICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgICAvLyBsYWJlbCBjZWxsXG4gICAgICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hdHRyKHsnaWQnOiAncm93TUNlbGwnICsgaSwgJ3gnOiAwLCAneSc6IGkgKyAxfSk7XG4gICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KGdyaWRSb3dNYXJrZXJzW2ldKS5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJvd0xhYmVsQ2VsbHMucHVzaChjZWxsWzBdKTtcblxuICAgICAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgICAgICAvLyB0aGUgdGFibGUgZGF0YSBpdHNlbGZcbiAgICAgICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhQ2VsbHNbaV0gPSBbXTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzaG9ydDogc3RyaW5nO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHNob3J0ID0gdmFsdWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAzMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2hvcnQgPSB2YWx1ZS5zdWJzdHIoMCwgMzEpICsgJ+KApic7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7XG4gICAgICAgICAgICAgICAgICAgICAgICAnaWQnOiAndmFsQ2VsbCcgKyB4ICsgJy0nICsgaSxcbiAgICAgICAgICAgICAgICAgICAgICAgICd4JzogeCArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICAneSc6IGkgKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3RpdGxlJzogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAnaXNibGFuayc6IHZhbHVlID09PSAnJyA/IDEgOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChzaG9ydCkuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzW2ldLnB1c2goY2VsbFswXSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG93ZXJMZWdlbmRJZCA9ICdzdGVwM0xvd2VyTGVnZW5kJztcbiAgICAgICAgICAgIGxvd2VyTGVnZW5kID0gJCgnIycgKyBsb3dlckxlZ2VuZElkKTtcbiAgICAgICAgICAgIGlmIChncmlkLmxlbmd0aCA+IElkZW50aWZ5U3RydWN0dXJlc1N0ZXAuRFVQTElDQVRFX0xFR0VORF9USFJFU0hPTEQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWxvd2VyTGVnZW5kLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAkKCcjc3RlcDNVcHBlckxlZ2VuZCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2xvbmUoKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2lkJywgbG93ZXJMZWdlbmRJZClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5pbnNlcnRBZnRlcignI2RhdGFUYWJsZURpdicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbG93ZXJMZWdlbmQucmVtb3ZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKCcuc3RlcDNMZWdlbmQnKS50b2dnbGVDbGFzcygnb2ZmJywgZ3JpZC5sZW5ndGggPT09IDApO1xuICAgICAgICAgICAgdGhpcy5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nKGdyaWQpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBBIHJlY3Vyc2l2ZSBmdW5jdGlvbiB0byBwb3B1bGF0ZSBhIHB1bGxkb3duIHdpdGggb3B0aW9uYWwgb3B0aW9uZ3JvdXBzLFxuICAgICAgICAvLyBhbmQgYSBkZWZhdWx0IHNlbGVjdGlvblxuICAgICAgICBwb3B1bGF0ZVB1bGxkb3duKHNlbGVjdDogSlF1ZXJ5LCBvcHRpb25zOiBSb3dQdWxsZG93bk9wdGlvbltdLCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgICAgICBvcHRpb25zLmZvckVhY2goKG9wdGlvbjogUm93UHVsbGRvd25PcHRpb24pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvblsxXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KG9wdGlvblswXSkudmFsKG9wdGlvblsxXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsIG9wdGlvblsxXSA9PT0gdmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oc2VsZWN0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvcHVsYXRlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8b3B0Z3JvdXA+JykuYXR0cignbGFiZWwnLCBvcHRpb25bMF0pLmFwcGVuZFRvKHNlbGVjdCksXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25bMV0sIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyByb3V0aW5lIGRvZXMgYSBiaXQgb2YgYWRkaXRpb25hbCBzdHlsaW5nIHRvIHRoZSBTdGVwIDMgZGF0YSB0YWJsZS5cbiAgICAgICAgLy8gSXQgcmVtb3ZlcyBhbmQgcmUtYWRkcyB0aGUgZGF0YVR5cGVDZWxsIGNzcyBjbGFzc2VzIGFjY29yZGluZyB0byB0aGUgcHVsbGRvd24gc2V0dGluZ3MgZm9yIGVhY2ggcm93LlxuICAgICAgICBhcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nKGdyaWQ6IGFueSk6IHZvaWQge1xuXG4gICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIGluZGV4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlciwgaGxMYWJlbDogYm9vbGVhbiwgaGxSb3c6IGJvb2xlYW47XG4gICAgICAgICAgICAgICAgcHVsbGRvd24gPSB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaW5kZXhdIHx8IDA7XG4gICAgICAgICAgICAgICAgaGxMYWJlbCA9IGhsUm93ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKHB1bGxkb3duID09PSBUeXBlRW51bS5Bc3NheV9MaW5lX05hbWVzIHx8IHB1bGxkb3duID09PSBUeXBlRW51bS5NZWFzdXJlbWVudF9UeXBlcykge1xuICAgICAgICAgICAgICAgICAgICBobFJvdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uVGltZXN0YW1wIHx8XG4gICAgICAgICAgICAgICAgICAgIHB1bGxkb3duID09PSBUeXBlRW51bS5NZXRhZGF0YV9OYW1lIHx8XG4gICAgICAgICAgICAgICAgICAgIHB1bGxkb3duID09PSBUeXBlRW51bS5Qcm90ZWluX05hbWUgfHxcbiAgICAgICAgICAgICAgICAgICAgcHVsbGRvd24gPT09IFR5cGVFbnVtLk1lYXN1cmVtZW50X1R5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgaGxMYWJlbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICQodGhpcy5yb3dMYWJlbENlbGxzW2luZGV4XSkudG9nZ2xlQ2xhc3MoJ2RhdGFUeXBlQ2VsbCcsIGhsTGFiZWwpO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChfLCBjb2w6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAkKHRoaXMuZGF0YUNlbGxzW2luZGV4XVtjb2xdKS50b2dnbGVDbGFzcygnZGF0YVR5cGVDZWxsJywgaGxSb3cpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlZHJhd0lnbm9yZWRHYXBNYXJrZXJzKGlnbm9yZURhdGFHYXBzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmRhdGFDZWxscy5mb3JFYWNoKChyb3c6IEhUTUxFbGVtZW50W10pOiB2b2lkID0+IHtcblxuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChjZWxsOiBIVE1MRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGlzYWJsZWQ6IGJvb2xlYW4gPSAgIWlnbm9yZURhdGFHYXBzICYmICEhY2VsbC5nZXRBdHRyaWJ1dGUoJ2lzYmxhbmsnKTtcbiAgICAgICAgICAgICAgICAgICAgJChjZWxsKS50b2dnbGVDbGFzcygnZGlzYWJsZWRJbnB1dCcsIGRpc2FibGVkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICByZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTogdm9pZCB7XG4gICAgICAgICAgICAvLyBsb29wIG92ZXIgY2VsbHMgaW4gdGhlIHRhYmxlLCBzdHlsaW5nIHRoZW0gYXMgbmVlZGVkIHRvIHNob3dcbiAgICAgICAgICAgIC8vIGlnbm9yZWQvaW50ZXJwcmV0YXRpb24tbmVlZGVkIHN0YXR1c1xuICAgICAgICAgICAgdGhpcy5kYXRhQ2VsbHMuZm9yRWFjaCgocm93OiBIVE1MRWxlbWVudFtdLCByb3dJbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHJvd0xhYmVsQ2VsbDogSlF1ZXJ5LCBwdWxsZG93bjogbnVtYmVyLCBkaXNhYmxlUm93OmJvb2xlYW4sIGlnbm9yZVJvdzpib29sZWFuO1xuICAgICAgICAgICAgICAgIHB1bGxkb3duID0gdGhpcy5wdWxsZG93blNldHRpbmdzW3Jvd0luZGV4XTtcbiAgICAgICAgICAgICAgICBkaXNhYmxlUm93ID0gIXRoaXMuYWN0aXZlUm93RmxhZ3Nbcm93SW5kZXhdO1xuICAgICAgICAgICAgICAgIHJvd0xhYmVsQ2VsbCA9ICQodGhpcy5yb3dMYWJlbENlbGxzW3Jvd0luZGV4XSk7XG4gICAgICAgICAgICAgICAgcm93TGFiZWxDZWxsLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZElucHV0JywgZGlzYWJsZVJvdyk7XG5cbiAgICAgICAgICAgICAgICByb3cuZm9yRWFjaCgoY2VsbDogSFRNTEVsZW1lbnQsIGNvbEluZGV4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNlbGxKUTpKUXVlcnksIGRpc2FibGVDZWxsOiBib29sZWFuLCBpZ25vcmVDZWxsOiBib29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBkaXNhYmxlQ2VsbCA9ICF0aGlzLmFjdGl2ZUZsYWdzW3Jvd0luZGV4XVtjb2xJbmRleF1cbiAgICAgICAgICAgICAgICAgICAgICAgIHx8ICF0aGlzLmFjdGl2ZUNvbEZsYWdzW2NvbEluZGV4XVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIXRoaXMuYWN0aXZlUm93RmxhZ3Nbcm93SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBjZWxsSlEgPSAkKGNlbGwpO1xuICAgICAgICAgICAgICAgICAgICBjZWxsSlEudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkSW5wdXQnLCBkaXNhYmxlQ2VsbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIGNlbGwgd2lsbCBiZSBpZ25vcmVkIGJlY2F1c2Ugbm8gc2VsZWN0aW9uIGhhcyBiZWVuIG1hZGUgZm9yIGl0cyByb3csXG4gICAgICAgICAgICAgICAgICAgIC8vIGNoYW5nZSB0aGUgYmFja2dyb3VuZCBzbyBpdCdzIG9idmlvdXMgdGhhdCBpdCB3b24ndCBiZSB1c2VkXG4gICAgICAgICAgICAgICAgICAgIGlnbm9yZVJvdyA9IChwdWxsZG93biA9PT0gSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5ERUZBVUxUX1BVTExET1dOX1ZBTFVFKSAmJiAhZGlzYWJsZUNlbGw7XG4gICAgICAgICAgICAgICAgICAgIGNlbGxKUS50b2dnbGVDbGFzcygnbWlzc2luZ0ludGVycHJldGF0aW9uUm93JywgaWdub3JlUm93KTtcbiAgICAgICAgICAgICAgICAgICAgcm93TGFiZWxDZWxsLnRvZ2dsZUNsYXNzKCdtaXNzaW5nSW50ZXJwcmV0YXRpb25Sb3cnLCBpZ25vcmVSb3cpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIHN0eWxlIHRhYmxlIGNlbGxzIGNvbnRhaW5pbmcgY29sdW1uIGNoZWNrYm94ZXMgaW4gdGhlIHNhbWUgd2F5IHRoZWlyIGNvbnRlbnQgd2FzXG4gICAgICAgICAgICAvLyBzdHlsZWQgYWJvdmVcbiAgICAgICAgICAgIHRoaXMuY29sQ2hlY2tib3hDZWxscy5mb3JFYWNoKChib3g6IEhUTUxFbGVtZW50LCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIXRoaXMuYWN0aXZlQ29sRmxhZ3NbeF07XG4gICAgICAgICAgICAgICAgJChib3gpLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZElucHV0JywgdG9nZ2xlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBjaGFuZ2VkUm93RGF0YVR5cGVQdWxsZG93bihpbmRleDogbnVtYmVyLCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWQ6IG51bWJlcjtcblxuICAgICAgICAgICAgdmFyIGdyaWQgPSB0aGlzLnJhd0lucHV0U3RlcC5nZXRHcmlkKCk7XG5cbiAgICAgICAgICAgIC8vIFRoZSB2YWx1ZSBkb2VzIG5vdCBuZWNlc3NhcmlseSBtYXRjaCB0aGUgc2VsZWN0ZWRJbmRleC5cbiAgICAgICAgICAgIHNlbGVjdGVkID0gdGhpcy5wdWxsZG93bk9iamVjdHNbaW5kZXhdLnNlbGVjdGVkSW5kZXg7XG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaW5kZXhdID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpbmRleF0gPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBUeXBlRW51bS5UaW1lc3RhbXAgfHxcbiAgICAgICAgICAgICAgICB2YWx1ZSA9PT0gVHlwZUVudW0uTWV0YWRhdGFfTmFtZSB8fFxuICAgICAgICAgICAgICAgIHZhbHVlID09PSBUeXBlRW51bS5NZWFzdXJlbWVudF9UeXBlIHx8XG4gICAgICAgICAgICAgICAgdmFsdWUgPT09IFR5cGVFbnVtLlByb3RlaW5fTmFtZSkge1xuICAgICAgICAgICAgICAgIC8vIFwiVGltZXN0YW1wXCIsIFwiTWV0YWRhdGFcIiwgb3Igb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXNcbiAgICAgICAgICAgICAgICAvLyBTZXQgYWxsIHRoZSByZXN0IG9mIHRoZSBwdWxsZG93bnMgdG8gdGhpcyxcbiAgICAgICAgICAgICAgICAvLyBiYXNlZCBvbiB0aGUgYXNzdW1wdGlvbiB0aGF0IHRoZSBmaXJzdCBpcyBmb2xsb3dlZCBieSBtYW55IG90aGVyc1xuICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzLnNsaWNlKGluZGV4ICsgMSkuZXZlcnkoXG4gICAgICAgICAgICAgICAgICAgIChwdWxsZG93bjogSFRNTFNlbGVjdEVsZW1lbnQpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzZWxlY3Q6IEpRdWVyeSwgaTogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0ID0gJChwdWxsZG93bik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpID0gcGFyc2VJbnQoc2VsZWN0LmF0dHIoJ2knKSwgMTApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB1c2VyIGNoYW5nZWQgdmFsdWUgZm9yIHRoaXMgcHVsbGRvd24sIHN0b3AgYXV0by1zZWxlY3RpbmcgdmFsdWVzIGZvclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBhbmQgc3Vic2VxdWVudCBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gYnJlYWsgb3V0IG9mIGxvb3BcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdC52YWwodmFsdWUudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBjb250aW51ZSBsb29waW5nXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIEluIGFkZGl0aW9uIHRvIHRoZSBhYm92ZSBhY3Rpb24sIHdlIGFsc28gbmVlZCB0byBkbyBzb21lIGNoZWNraW5nIG9uIHRoZSBlbnRpcmUgc2V0IG9mXG4gICAgICAgICAgICAgICAgLy8gcHVsbGRvd25zLCB0byBlbmZvcmNlIGEgZGl2aXNpb24gYmV0d2VlbiB0aGUgXCJNZWFzdXJlbWVudCBUeXBlXCIgc2luZ2xlIGRhdGEgdHlwZVxuICAgICAgICAgICAgICAgIC8vIGFuZCB0aGVcbiAgICAgICAgICAgICAgICAvLyBvdGhlciBzaW5nbGUgZGF0YSB0eXBlcy4gSWYgdGhlIHVzZXIgdXNlcyBldmVuIG9uZSBcIk1lYXN1cmVtZW50IFR5cGVcIlxuICAgICAgICAgICAgICAgIC8vIHB1bGxkb3duLCB3ZSBjYW4ndFxuICAgICAgICAgICAgICAgIC8vIGFsbG93IGFueSBvZiB0aGUgb3RoZXIgdHlwZXMsIGFuZCB2aWNlLXZlcnNhLlxuICAgICAgICAgICAgICAgIC8vICAgV2h5PyAgQmVjYXVzZSBcIk1lYXN1cmVtZW50IFR5cGVcIiBpcyB1c2VkIHRvIGxhYmVsIHRoZSBzcGVjaWZpYyBjYXNlIG9mIGEgdGFibGVcbiAgICAgICAgICAgICAgICAvLyB0aGF0XG4gICAgICAgICAgICAgICAgLy8gZG9lcyBub3QgY29udGFpbiBhIHRpbWVzdGFtcCBvbiBlaXRoZXIgYXhpcy4gIEluIHRoYXQgY2FzZSwgdGhlIHRhYmxlIGlzIG1lYW50IHRvXG4gICAgICAgICAgICAgICAgLy8gcHJvdmlkZSBkYXRhIGZvciBtdWx0aXBsZSBNZWFzdXJlbWVudHMgYW5kIEFzc2F5cyBmb3IgYSBzaW5nbGUgdW5zcGVjaWZpZWQgdGltZSBwb2ludC5cbiAgICAgICAgICAgICAgICAvLyAoVGhhdCB0aW1lIHBvaW50IGlzIHJlcXVlc3RlZCBsYXRlciBpbiB0aGUgVUkuKVxuICAgICAgICAgICAgICAgIC8vICAgSWYgd2UgYWxsb3cgYSBzaW5nbGUgdGltZXN0YW1wIHJvdywgdGhhdCBjcmVhdGVzIGFuIGluY29uc2lzdGVudCB0YWJsZSB0aGF0IGlzXG4gICAgICAgICAgICAgICAgLy8gaW1wb3NzaWJsZSB0byBpbnRlcnByZXQuXG4gICAgICAgICAgICAgICAgLy8gICBJZiB3ZSBhbGxvdyBhIHNpbmdsZSBtZXRhZGF0YSByb3csIHRoYXQgbGVhdmVzIHRoZSBtZXRhZGF0YSB1bmNvbm5lY3RlZCB0byBhIHNwZWNpZmljXG4gICAgICAgICAgICAgICAgLy8gbWVhc3VyZW1lbnQsIG1lYW5pbmcgdGhhdCB0aGUgb25seSB2YWxpZCB3YXkgdG8gaW50ZXJwcmV0IGl0IGlzIGFzIExpbmUgbWV0YWRhdGEuICBXZVxuICAgICAgICAgICAgICAgIC8vIGNvdWxkIHBvdGVudGlhbGx5IHN1cHBvcnQgdGhhdCwgYnV0IGl0IHdvdWxkIGJlIHRoZSBvbmx5IGNhc2Ugd2hlcmUgZGF0YSBpbXBvcnRlZCBvblxuICAgICAgICAgICAgICAgIC8vIHRoaXMgcGFnZSBkb2VzIG5vdCBlbmQgdXAgaW4gQXNzYXlzIC4uLiBhbmQgdGhhdCBjYXNlIGRvZXNuJ3QgbWFrZSBtdWNoIHNlbnNlIGdpdmVuXG4gICAgICAgICAgICAgICAgLy8gdGhhdCB0aGlzIGlzIHRoZSBBc3NheSBEYXRhIEltcG9ydCBwYWdlIVxuICAgICAgICAgICAgICAgIC8vICAgQW55d2F5LCBoZXJlIHdlIHJ1biB0aHJvdWdoIHRoZSBwdWxsZG93bnMsIG1ha2luZyBzdXJlIHRoYXQgaWYgdGhlIHVzZXIgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICAvLyBcIk1lYXN1cmVtZW50IFR5cGVcIiwgd2UgYmxhbmsgb3V0IGFsbCByZWZlcmVuY2VzIHRvIFwiVGltZXN0YW1wXCIgYW5kXG4gICAgICAgICAgICAgICAgLy8gXCJNZXRhZGF0YVwiLCBhbmRcbiAgICAgICAgICAgICAgICAvLyB2aWNlLXZlcnNhLlxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gVHlwZUVudW0uTWVhc3VyZW1lbnRfVHlwZSB8fCB2YWx1ZSA9PT0gVHlwZUVudW0uVGltZXN0YW1wIHx8IHZhbHVlID09PSBUeXBlRW51bS5NZXRhZGF0YV9OYW1lKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChfLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjOiBudW1iZXIgPSB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgPT09IFR5cGVFbnVtLk1lYXN1cmVtZW50X1R5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYyA9PT0gVHlwZUVudW0uVGltZXN0YW1wIHx8IGMgPT09IFR5cGVFbnVtLk1ldGFkYXRhX05hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHNbaV0uc2VsZWN0ZWRJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSBUeXBlRW51bS5NZWFzdXJlbWVudF9UeXBlcykgeyAvLyBDYW4ndCBhbGxvdyBcIk1lYXN1cmVtZW50IFR5cGVzXCIgc2V0dGluZyBlaXRoZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHNbaV0uc2VsZWN0ZWRJbmRleCA9IFR5cGVFbnVtLkFzc2F5X0xpbmVfTmFtZXM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IFR5cGVFbnVtLkFzc2F5X0xpbmVfTmFtZXM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICgodmFsdWUgPT09IFR5cGVFbnVtLlRpbWVzdGFtcCB8fCB2YWx1ZSA9PT0gVHlwZUVudW0uTWV0YWRhdGFfTmFtZSkgJiYgYyA9PT0gVHlwZUVudW0uTWVhc3VyZW1lbnRfVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzW2ldLnNlbGVjdGVkSW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBJdCB3b3VsZCBzZWVtIGxvZ2ljYWwgdG8gcmVxdWlyZSBhIHNpbWlsYXIgY2hlY2sgZm9yIFwiUHJvdGVpbiBOYW1lXCIsIGJ1dCBpbiBwcmFjdGljZVxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgdXNlciBpcyBkaXNhbGxvd2VkIGZyb20gc2VsZWN0aW5nIGFueSBvZiB0aGUgb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXMgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFnZSBpcyBpbiBQcm90ZW9taWNzIG1vZGUuICBTbyB0aGUgY2hlY2sgaXMgcmVkdW5kYW50LlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXRSb3dEYXRhVHlwZVB1bGxkb3ducygpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyB1cGRhdGUgc3RhdGUgYXMgYSByZXN1bHQgb2Ygcm93IGRhdGF0eXBlIHB1bGxkb3duIHNlbGVjdGlvblxuICAgICAgICBpbnRlcnByZXRSb3dEYXRhVHlwZVB1bGxkb3ducygpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuICAgICAgICAgICAgdGhpcy5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nKGdyaWQpO1xuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICAgICAgICAgIHRoaXMucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICB9XG5cblxuICAgICAgICB0b2dnbGVUYWJsZVJvdyhib3g6IEVsZW1lbnQpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBpbnB1dDogbnVtYmVyLCBjaGVja2JveDogSlF1ZXJ5LCBwdWxsZG93bjpKUXVlcnk7XG4gICAgICAgICAgICBjaGVja2JveCA9ICQoYm94KTtcbiAgICAgICAgICAgIHB1bGxkb3duID0gY2hlY2tib3gubmV4dCgpO1xuICAgICAgICAgICAgaW5wdXQgPSBwYXJzZUludChjaGVja2JveC52YWwoKSwgMTApO1xuICAgICAgICAgICAgdmFyIGFjdGl2ZSA9IGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlUm93RmxhZ3NbaW5wdXRdID0gYWN0aXZlO1xuICAgICAgICAgICAgaWYoYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgcHVsbGRvd24ucmVtb3ZlQXR0cignZGlzYWJsZWQnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHVsbGRvd24uYXR0cignZGlzYWJsZWQnLCAnZGlzYWJsZWQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICAgICAgICAgIHRoaXMucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgICAgICAgICAvLyBSZXNldHRpbmcgYSBkaXNhYmxlZCByb3cgbWF5IGNoYW5nZSB0aGUgbnVtYmVyIG9mIHJvd3MgbGlzdGVkIGluIHRoZSBJbmZvIHRhYmxlLlxuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdG9nZ2xlVGFibGVDb2x1bW4oYm94OiBFbGVtZW50KTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdmFsdWU6IG51bWJlciwgaW5wdXQ6IEpRdWVyeTtcbiAgICAgICAgICAgIGlucHV0ID0gJChib3gpO1xuICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludChpbnB1dC52YWwoKSwgMTApO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1t2YWx1ZV0gPSBpbnB1dC5wcm9wKCdjaGVja2VkJyk7XG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgdGhpcy5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAgICAgICAgIC8vIFJlc2V0dGluZyBhIGRpc2FibGVkIGNvbHVtbiBtYXkgY2hhbmdlIHRoZSByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgZ3JpZCA9IHRoaXMucmF3SW5wdXRTdGVwLmdldEdyaWQoKTtcblxuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzW3ldID0gdGhpcy5hY3RpdmVGbGFnc1t5XSB8fCBbXTtcbiAgICAgICAgICAgICAgICByb3cuZm9yRWFjaCgoXywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlUm93RmxhZ3NbeV0gPSB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAoZ3JpZFswXSB8fCBbXSkuZm9yRWFjaCgoXywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1t4XSA9IHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIEZsaXAgYWxsIHRoZSBjaGVja2JveGVzIG9uIGluIHRoZSBoZWFkZXIgY2VsbHMgZm9yIHRoZSBkYXRhIGNvbHVtbnNcbiAgICAgICAgICAgICQoJyNkYXRhVGFibGVEaXYnKS5maW5kKCdbbmFtZT1lbmFibGVDb2x1bW5dJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgLy8gU2FtZSBmb3IgdGhlIGNoZWNrYm94ZXMgaW4gdGhlIHJvdyBsYWJlbCBjZWxsc1xuICAgICAgICAgICAgJCgnI2RhdGFUYWJsZURpdicpLmZpbmQoJ1tuYW1lPWVuYWJsZVJvd10nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgdGhpcy5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGludGVycHJldERhdGFUYWJsZSgpOiB2b2lkIHtcblxuICAgICAgICAgICAgLy8gVGhpcyBtb2RlIG1lYW5zIHdlIG1ha2UgYSBuZXcgXCJzZXRcIiBmb3IgZWFjaCBjZWxsIGluIHRoZSB0YWJsZSwgcmF0aGVyIHRoYW5cbiAgICAgICAgICAgIC8vIHRoZSBzdGFuZGFyZCBtZXRob2Qgb2YgbWFraW5nIGEgbmV3IFwic2V0XCIgZm9yIGVhY2ggY29sdW1uIGluIHRoZSB0YWJsZS5cbiAgICAgICAgICAgIHZhciBzaW5nbGVNb2RlOiBib29sZWFuO1xuICAgICAgICAgICAgdmFyIHNpbmdsZUNvbXBhdGlibGVDb3VudDogbnVtYmVyLCBzaW5nbGVOb3RDb21wYXRpYmxlQ291bnQ6IG51bWJlciwgZWFybGllc3ROYW1lOiBudW1iZXI7XG5cbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuICAgICAgICAgICAgdmFyIGdyaWRSb3dNYXJrZXJzID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnM7XG4gICAgICAgICAgICB2YXIgaWdub3JlRGF0YUdhcHMgPSB0aGlzLnJhd0lucHV0U3RlcC5pZ25vcmVEYXRhR2FwcztcblxuICAgICAgICAgICAgLy8gV2UnbGwgYmUgYWNjdW11bGF0aW5nIHRoZXNlIGZvciBkaXNhbWJpZ3VhdGlvbi5cbiAgICAgICAgICAgIHZhciBzZWVuTGluZU5hbWVzOiB7W2lkOiBzdHJpbmddOiBib29sZWFufSA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5Bc3NheU5hbWVzOiB7W2lkOiBzdHJpbmddOiBib29sZWFufSA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5NZWFzdXJlbWVudE5hbWVzOiB7W2lkOiBzdHJpbmddOiBib29sZWFufSA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5NZXRhZGF0YU5hbWVzOiB7W2lkOiBzdHJpbmddOiBib29sZWFufSA9IHt9O1xuICAgICAgICAgICAgdmFyIGRpc2FtUmF3U2V0czogYW55W10gPSBbXTtcblxuICAgICAgICAgICAgLy8gSGVyZSBhcmUgdGhlIGFycmF5cyB3ZSB3aWxsIHVzZSBsYXRlclxuICAgICAgICAgICAgdGhpcy5wYXJzZWRTZXRzID0gW107XG4gICAgICAgICAgICB0aGlzLmdyYXBoU2V0cyA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUxpbmVOYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVBc3NheU5hbWVzID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTWV0YWRhdGFOYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5zZWVuQW55VGltZXN0YW1wcyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBnb3QgcHJlLXByb2Nlc3NlZCBzZXRzIGZyb20gdGhlIHNlcnZlciBhdmFpbGFibGUsIHVzZSB0aG9zZSBpbnN0ZWFkIG9mIGFueVxuICAgICAgICAgICAgLy8gdGFibGUgY29udGVudHMuXG5cbiAgICAgICAgICAgIGlmICh0aGlzLnJhd0lucHV0U3RlcC5wcm9jZXNzZWRTZXRzQXZhaWxhYmxlKSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJhd0lucHV0U3RlcC5wcm9jZXNzZWRTZXRzRnJvbUZpbGUuZm9yRWFjaCgocmF3U2V0LCBjOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNldDogUmF3SW1wb3J0U2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgZ3JhcGhTZXQ6IEdyYXBoaW5nU2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgdW5pcXVlVGltZXM6IG51bWJlcltdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZXM6IGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kTWV0YTogYm9vbGVhbixcbiAgICAgICAgICAgICAgICAgICAgICAgIGxuID0gcmF3U2V0LmxpbmVfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuID0gcmF3U2V0LmFzc2F5X25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtbiA9IHJhd1NldC5tZWFzdXJlbWVudF9uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgIHVuaXF1ZVRpbWVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHRpbWVzID0ge307XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kTWV0YSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBwcm9jZWR1cmUgZm9yIEFzc2F5cywgTWVhc3VyZW1lbnRzLCBldGMgaXMgdGhlIHNhbWU6XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSB2YWx1ZSBpcyBibGFuaywgd2UgY2FuJ3QgYnVpbGQgYSB2YWxpZCBzZXQsIHNvIHNraXAgdG8gdGhlIG5leHQgc2V0LlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgdmFsdWUgaXMgdmFsaWQgYnV0IHdlIGhhdmVuJ3Qgc2VlbiBpdCBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgYVxuICAgICAgICAgICAgICAgICAgICAvLyB1bmlxdWVuZXNzIGluZGV4LlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWxuICYmIGxuICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFtbiAmJiBtbiAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICghYW4gJiYgYW4gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGp1c3QgdGhlIGFzc2F5IG5hbWUgaXMgbWlzc2luZywgc2V0IGl0IHRvIHRoZSBsaW5lIG5hbWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuID0gbG47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTGluZU5hbWVzW2xuXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VlbkxpbmVOYW1lc1tsbl0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVMaW5lTmFtZXMucHVzaChsbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuQXNzYXlOYW1lc1thbl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5Bc3NheU5hbWVzW2FuXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUFzc2F5TmFtZXMucHVzaChhbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWVhc3VyZW1lbnROYW1lc1ttbl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW21uXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMucHVzaChtbik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVhc3NlbWJsZWREYXRhID0gW107XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU2xpZ2h0bHkgZGlmZmVyZW50IHByb2NlZHVyZSBmb3IgbWV0YWRhdGEsIGJ1dCBzYW1lIGlkZWE6XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHJhd1NldC5tZXRhZGF0YV9ieV9uYW1lKS5mb3JFYWNoKChrZXkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHJhd1NldC5tZXRhZGF0YV9ieV9uYW1lW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZXRhZGF0YU5hbWVzW2tleV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWV0YWRhdGFOYW1lc1trZXldID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZU1ldGFkYXRhTmFtZXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmRNZXRhID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgdGhlIHByb3ZpZGVkIHNldCBvZiB0aW1lL3ZhbHVlIHBvaW50c1xuICAgICAgICAgICAgICAgICAgICByYXdTZXQuZGF0YS5mb3JFYWNoKCh4eTogYW55W10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0aW1lOiBudW1iZXIsIHZhbHVlOiBudW1iZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIUpTTnVtYmVyLmlzRmluaXRlKHh5WzBdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNvbWV0aW1lcyBwZW9wbGUgLSBvciBFeGNlbCBkb2NzIC0gZHJvcCBjb21tYXMgaW50byBsYXJnZSBudW1iZXJzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWUgPSBwYXJzZUZsb2F0KCh4eVswXSB8fCAnMCcpLnJlcGxhY2UoLywvZywgJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZSA9IDxudW1iZXI+eHlbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSBjYW4ndCBnZXQgYSB1c2FibGUgdGltZXN0YW1wLCBkaXNjYXJkIHRoaXMgcG9pbnQuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoSlNOdW1iZXIuaXNOYU4odGltZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXh5WzFdICYmIDxOdW1iZXI+eHlbMV0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSdyZSBpZ25vcmluZyBnYXBzLCBza2lwIGFueSB1bmRlZmluZWQvbnVsbCB2YWx1ZXMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9pZiAoaWdub3JlRGF0YUdhcHMpIHsgcmV0dXJuOyB9ICAgIC8vIE5vdGU6IEZvcmNlZCBhbHdheXMtb2ZmIGZvciBub3dcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBIG51bGwgaXMgb3VyIHN0YW5kYXJkIHBsYWNlaG9sZGVyIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghSlNOdW1iZXIuaXNGaW5pdGUoeHlbMV0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUZsb2F0KCh4eVsxXSB8fCAnJykucmVwbGFjZSgvLC9nLCAnJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IDxudW1iZXI+eHlbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRpbWVzW3RpbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZXNbdGltZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcy5wdXNoKHRpbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2VlbkFueVRpbWVzdGFtcHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdW5pcXVlVGltZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpLmZvckVhY2goKHRpbWU6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVhc3NlbWJsZWREYXRhLnB1c2goW3RpbWUsIHRpbWVzW3RpbWVdXSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgc2F2ZSBpZiB3ZSBhY2N1bXVsYXRlZCBzb21lIGRhdGEgb3IgbWV0YWRhdGFcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF1bmlxdWVUaW1lcy5sZW5ndGggJiYgIWZvdW5kTWV0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29weSBhY3Jvc3MgdGhlIGZpZWxkcyBmcm9tIHRoZSBSYXdJbXBvcnRTZXQgcmVjb3JkXG4gICAgICAgICAgICAgICAgICAgICAgICBraW5kOiByYXdTZXQua2luZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVfbmFtZTogcmF3U2V0LmxpbmVfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2F5X25hbWU6IGFuLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRfbmFtZTogcmF3U2V0Lm1lYXN1cmVtZW50X25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXRhZGF0YV9ieV9uYW1lOiByYXdTZXQubWV0YWRhdGFfYnlfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHJlYXNzZW1ibGVkRGF0YVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcnNlZFNldHMucHVzaChzZXQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGdyYXBoU2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2xhYmVsJzogKGxuID8gbG4gKyAnOiAnIDogJycpICsgYW4gKyAnOiAnICsgbW4sXG4gICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6IG1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3VuaXRzJzogJ3VuaXRzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdkYXRhJzogcmVhc3NlbWJsZWREYXRhXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhTZXRzLnB1c2goZ3JhcGhTZXQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgd2UncmUgbm90IHVzaW5nIHByZS1wcm9jZXNzZWQgcmVjb3Jkcywgd2UgbmVlZCB0byB1c2UgdGhlIHB1bGxkb3duIHNldHRpbmdzIGluIHRoaXMgc3RlcFxuICAgICAgICAgICAgLy8gKHVzdWFsbHkgc2V0IGJ5IHRoZSB1c2VyKSB0byBkZXRlcm1pbmUgd2hhdCBtb2RlIHdlJ3JlIGluLlxuXG4gICAgICAgICAgICBzaW5nbGVDb21wYXRpYmxlQ291bnQgPSAwO1xuICAgICAgICAgICAgc2luZ2xlTm90Q29tcGF0aWJsZUNvdW50ID0gMDtcbiAgICAgICAgICAgIGVhcmxpZXN0TmFtZSA9IG51bGw7XG4gICAgICAgICAgICAvLyBMb29rIGZvciB0aGUgcHJlc2VuY2Ugb2YgXCJzaW5nbGUgbWVhc3VyZW1lbnQgdHlwZVwiIHJvd3MsIGFuZCByb3dzIG9mIGFsbCBvdGhlciBzaW5nbGUtaXRlbSB0eXBlc1xuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChfLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlUm93RmxhZ3NbeV0pIHsgcmV0dXJuOyB9ICAgIC8vIFNraXAgaW5hY3RpdmUgcm93c1xuICAgICAgICAgICAgICAgIHB1bGxkb3duID0gdGhpcy5wdWxsZG93blNldHRpbmdzW3ldO1xuICAgICAgICAgICAgICAgIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uTWVhc3VyZW1lbnRfVHlwZSB8fCBwdWxsZG93biA9PT0gVHlwZUVudW0uUHJvdGVpbl9OYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHNpbmdsZUNvbXBhdGlibGVDb3VudCsrOyAvLyBTaW5nbGUgTWVhc3VyZW1lbnQgTmFtZSBvciBTaW5nbGUgUHJvdGVpbiBOYW1lXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uTWV0YWRhdGFfTmFtZSB8fCBwdWxsZG93biA9PT0gVHlwZUVudW0uVGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgICAgIHNpbmdsZU5vdENvbXBhdGlibGVDb3VudCsrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLkFzc2F5X0xpbmVfTmFtZXMgJiYgZWFybGllc3ROYW1lID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGVhcmxpZXN0TmFtZSA9IHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoaXMgbW9kZSBpZiB0aGUgdGFibGUgaXMgZW50aXJlbHkgZnJlZSBvZiBzaW5nbGUtdGltZXN0YW1wIGFuZFxuICAgICAgICAgICAgLy8gc2luZ2xlLW1ldGFkYXRhIHJvd3MsIGFuZCBoYXMgYXQgbGVhc3Qgb25lIFwic2luZ2xlIG1lYXN1cmVtZW50XCIgb3IgXCJzaW5nbGUgcHJvdGVpblwiIHJvdywgYW5kIGF0XG4gICAgICAgICAgICAvLyBsZWFzdCBvbmUgXCJBc3NheS9MaW5lIG5hbWVzXCIgcm93LlxuICAgICAgICAgICAgLy8gKE5vdGUgdGhhdCByZXF1aXJlbWVudCBvZiBhbiBcIkFzc2F5L0xpbmUgbmFtZXNcIiByb3cgcHJldmVudHMgdGhpcyBtb2RlIGZyb20gYmVpbmdcbiAgICAgICAgICAgIC8vIGVuYWJsZWQgd2hlbiB0aGUgcGFnZSBpcyBpbiAnVHJhbnNjcmlwdG9taWNzJyBtb2RlLilcbiAgICAgICAgICAgIHNpbmdsZU1vZGUgPSAoc2luZ2xlQ29tcGF0aWJsZUNvdW50ID4gMCAmJiBzaW5nbGVOb3RDb21wYXRpYmxlQ291bnQgPT09IDAgJiYgZWFybGllc3ROYW1lICE9PSBudWxsKSA/IHRydWUgOiBmYWxzZTtcblxuICAgICAgICAgICAgLy8gQSBcInNldFwiIGZvciBldmVyeSBjZWxsIG9mIHRoZSB0YWJsZSwgd2l0aCB0aGUgdGltZXN0YW1wIHRvIGJlIGRldGVybWluZWQgbGF0ZXIuXG4gICAgICAgICAgICBpZiAoc2luZ2xlTW9kZSkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xPYmplY3RzLmZvckVhY2goKF8sIGM6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2VsbFZhbHVlOiBzdHJpbmc7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFjdGl2ZUNvbEZsYWdzW2NdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2VsbFZhbHVlID0gZ3JpZFtlYXJsaWVzdE5hbWVdW2NdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNlbGxWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgaGF2ZW4ndCBzZWVuIGNlbGxWYWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5Bc3NheU5hbWVzW2NlbGxWYWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5Bc3NheU5hbWVzW2NlbGxWYWx1ZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVBc3NheU5hbWVzLnB1c2goY2VsbFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHI6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJhd1NldDogUmF3SW1wb3J0U2V0O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFjdGl2ZVJvd0ZsYWdzW3JdIHx8ICF0aGlzLmFjdGl2ZUZsYWdzW3JdW2NdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcHVsbGRvd24gPSB0aGlzLnB1bGxkb3duU2V0dGluZ3Nbcl07XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbCA9IGdyaWRSb3dNYXJrZXJzW3JdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSByb3dbY10gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXB1bGxkb3duIHx8ICFsYWJlbCB8fCAhdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtX25hbWU6IHN0cmluZyA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLk1lYXN1cmVtZW50X1R5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZWFzdXJlbWVudE5hbWVzW2xhYmVsXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWVhc3VyZW1lbnROYW1lc1tsYWJlbF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMucHVzaChsYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1fbmFtZSA9IGxhYmVsO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uUHJvdGVpbl9OYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbV9uYW1lID0gbGFiZWw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHdlIGFyZW4ndCBvbiBhIHJvdyB0aGF0J3MgbGFiZWxlZCBhcyBlaXRoZXIgYSBtZXRhYm9saXRlIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgYSBwcm90ZWluIHZhbHVlLCByZXR1cm4gd2l0aG91dCBtYWtpbmcgYSBzZXQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICByYXdTZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2luZDogdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lX25hbWU6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzYXlfbmFtZTogY2VsbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50X25hbWU6IG1fbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXRhZGF0YV9ieV9uYW1lOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOltbbnVsbCwgdmFsdWVdXVxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJzZWRTZXRzLnB1c2gocmF3U2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUaGUgc3RhbmRhcmQgbWV0aG9kOiBNYWtlIGEgXCJzZXRcIiBmb3IgZWFjaCBjb2x1bW4gb2YgdGhlIHRhYmxlXG5cbiAgICAgICAgICAgIHRoaXMuY29sT2JqZWN0cy5mb3JFYWNoKChfLCBjb2w6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzZXQ6IFJhd0ltcG9ydFNldCwgZ3JhcGhTZXQ6IEdyYXBoaW5nU2V0LCB1bmlxdWVUaW1lczogbnVtYmVyW10sIHRpbWVzOiBhbnksIGZvdW5kTWV0YTogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGl0IGlmIHRoZSB3aG9sZSBjb2x1bW4gaXMgZGVhY3RpdmF0ZWRcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlQ29sRmxhZ3NbY29sXSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIHJlYXNzZW1ibGVkRGF0YSA9IFtdOyAgICAvLyBXZSdsbCBmaWxsIHRoaXMgb3V0IGFzIHdlIGdvXG5cbiAgICAgICAgICAgICAgICBzZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGUsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVfbmFtZTogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgYXNzYXlfbmFtZTogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRfbmFtZTogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGFfYnlfbmFtZToge30sXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHJlYXNzZW1ibGVkRGF0YSxcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgdW5pcXVlVGltZXMgPSBbXTtcbiAgICAgICAgICAgICAgICB0aW1lcyA9IHt9O1xuICAgICAgICAgICAgICAgIGZvdW5kTWV0YSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGdyaWQuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgcjogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBsYWJlbDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFjdGl2ZVJvd0ZsYWdzW3JdIHx8ICF0aGlzLmFjdGl2ZUZsYWdzW3JdW2NvbF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwdWxsZG93biA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1tyXTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBncmlkUm93TWFya2Vyc1tyXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSByb3dbY29sXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwdWxsZG93bikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBza2lwIHJvdyBpZiB0aGVyZSdzIG5vdGhpbmcgc2VsZWN0ZWQgaW4gdGhlIHB1bGxkb3duXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLlJQS01fVmFsdWVzKSB7ICAvLyBUcmFuc2NyaXB0b21pY3M6IFJQS00gdmFsdWVzXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVhc3NlbWJsZWREYXRhID0gW1tudWxsLCB2YWx1ZV1dO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSBUeXBlRW51bS5HZW5lX05hbWVzKSB7ICAvLyBUcmFuc2NyaXB0b21pY3M6IEdlbmUgbmFtZXNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudF9uYW1lID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLlRpbWVzdGFtcCkgeyAgIC8vIFRpbWVzdGFtcHNcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsID0gbGFiZWwucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXAgPSBwYXJzZUZsb2F0KGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaXNOYU4odGltZXN0YW1wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgaWdub3JpbmcgZ2Fwcywgc2tpcCBvdXQgb24gcmVjb3JkaW5nIHRoaXMgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlnbm9yZURhdGFHYXBzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgYWN0dWFsbHkgcHJlZmVyIG51bGwgaGVyZSwgdG8gaW5kaWNhdGUgYSBwbGFjZWhvbGRlciB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGltZXNbdGltZXN0YW1wXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lc1t0aW1lc3RhbXBdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXF1ZVRpbWVzLnB1c2godGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWVuQW55VGltZXN0YW1wcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxhYmVsID09PSAnJyB8fCB2YWx1ZSA9PT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vdyB0aGF0IHdlJ3ZlIGRlYWx0IHdpdGggdGltZXN0YW1wcywgd2UgcHJvY2VlZCBvbiB0byBvdGhlciBkYXRhIHR5cGVzLlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWxsIHRoZSBvdGhlciBkYXRhIHR5cGVzIGRvIG5vdCBhY2NlcHQgYSBibGFuayB2YWx1ZSwgc28gd2Ugd2VlZCB0aGVtIG91dCBub3cuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLkFzc2F5X0xpbmVfTmFtZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiB2YWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuQXNzYXlOYW1lc1t2YWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuQXNzYXlOYW1lc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlQXNzYXlOYW1lcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5hc3NheV9uYW1lID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLk1lYXN1cmVtZW50X1R5cGVzKSB7ICAgLy8gTWV0YWJvbGl0ZSBOYW1lc1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgaGF2ZW4ndCBzZWVuIHZhbHVlIGJlZm9yZSwgaW5jcmVtZW50IGFuZCBzdG9yZSB1bmlxdWVuZXNzIGluZGV4XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZWFzdXJlbWVudE5hbWVzW3ZhbHVlXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW3ZhbHVlXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVNZWFzdXJlbWVudE5hbWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50X25hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uTWV0YWRhdGFfTmFtZSkgeyAgIC8vIE1ldGFkYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZXRhZGF0YU5hbWVzW2xhYmVsXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZXRhZGF0YU5hbWVzW2xhYmVsXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVNZXRhZGF0YU5hbWVzLnB1c2gobGFiZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1ldGFkYXRhX2J5X25hbWVbbGFiZWxdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZE1ldGEgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdW5pcXVlVGltZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpLmZvckVhY2goKHRpbWU6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZWFzc2VtYmxlZERhdGEucHVzaChbdGltZSwgdGltZXNbdGltZV1dKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBvbmx5IHNhdmUgaWYgYWNjdW11bGF0ZWQgc29tZSBkYXRhIG9yIG1ldGFkYXRhXG4gICAgICAgICAgICAgICAgaWYgKCF1bmlxdWVUaW1lcy5sZW5ndGggJiYgIWZvdW5kTWV0YSAmJiAhcmVhc3NlbWJsZWREYXRhWzBdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLnBhcnNlZFNldHMucHVzaChzZXQpO1xuXG4gICAgICAgICAgICAgICAgZ3JhcGhTZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICdsYWJlbCc6ICdDb2x1bW4gJyArIGNvbCxcbiAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiAnQ29sdW1uICcgKyBjb2wsXG4gICAgICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzogcmVhc3NlbWJsZWREYXRhXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoU2V0cy5wdXNoKGdyYXBoU2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBoaWdobGlnaHRlckYoZTogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSwgeDogbnVtYmVyLCB5OiBudW1iZXI7XG4gICAgICAgICAgICAvLyBXYWxrIHVwIHRoZSBpdGVtIHRyZWUgdW50aWwgd2UgYXJyaXZlIGF0IGEgdGFibGUgY2VsbCxcbiAgICAgICAgICAgIC8vIHNvIHdlIGNhbiBnZXQgdGhlIGluZGV4IG9mIHRoZSB0YWJsZSBjZWxsIGluIHRoZSB0YWJsZS5cbiAgICAgICAgICAgIGNlbGwgPSAkKGUudGFyZ2V0KS5jbG9zZXN0KCd0ZCcpO1xuICAgICAgICAgICAgaWYgKGNlbGwubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgeCA9IHBhcnNlSW50KGNlbGwuYXR0cigneCcpLCAxMCk7XG4gICAgICAgICAgICAgICAgeSA9IHBhcnNlSW50KGNlbGwuYXR0cigneScpLCAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzLmNvbE9iamVjdHNbeCAtIDFdKS50b2dnbGVDbGFzcygnaG92ZXJMaW5lcycsIGUudHlwZSA9PT0gJ21vdXNlb3ZlcicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoeSkge1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmNsb3Nlc3QoJ3RyJykudG9nZ2xlQ2xhc3MoJ2hvdmVyTGluZXMnLCBlLnR5cGUgPT09ICdtb3VzZW92ZXInKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIHNpbmdsZVZhbHVlRGlzYWJsZXJGKGU6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgICAgICAgICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgICAgICAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgICAgICAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICAgICAgICAgIGlmICghY2VsbC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB4ID0gcGFyc2VJbnQoY2VsbC5hdHRyKCd4JyksIDEwKTtcbiAgICAgICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICAgICAgaWYgKCF4IHx8ICF5IHx8IHggPCAxIHx8IHkgPCAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLS14O1xuICAgICAgICAgICAgLS15O1xuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzW3ldW3hdID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0gPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICAgICAgICAgIHRoaXMucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICB9XG5cblxuICAgICAgICBxdWV1ZUdyYXBoUmVtYWtlKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgICAgICAgICAvLyBUaGlzIHdheSB3ZSdyZSBub3QgYm90aGVyaW5nIHRoZSB1c2VyIHdpdGggdGhlIGxvbmcgcmVkcmF3IHByb2Nlc3Mgd2hlblxuICAgICAgICAgICAgLy8gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgICAgICAgICAvLyBUT0RPOiBhcyBhIGZ1dHVyZSBpbXByb3ZlbWVudCwgaXQgd291bGQgYmUgYmV0dGVyIFVJIHRvIG1hcmsgdGhlIGdyYXBoIGFzIGJlaW5nXG4gICAgICAgICAgICAvLyByZWJ1aWx0IGluIGNhc2UgdGhlcmUncyBhIGxvdCBvZiBkYXRhIGFuZCBpdCB0YWtlcyBhIHdoaWxlIHRvIHVwZGF0ZSBpdC4gSW4gdGhhdFxuICAgICAgICAgICAgLy8gY2FzZSwgYWxzbyBtYXliZSBiZXN0IHRvIGRlZmVyIGFsbCB1cGRhdGVzIHRvIHN1YnNlcXVlbnQgc3RlcHMgdW50aWwgYWZ0ZXIgdGhlIGdyYXBoXG4gICAgICAgICAgICAvLyB1cGRhdGUgaXMgY29tcGxldGUuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgaWYgKHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ3JhcGhFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dCh0aGlzLnJlbWFrZUdyYXBoQXJlYS5iaW5kKHRoaXMpLCA3MDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVtYWtlR3JhcGhBcmVhKCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgZ3JhcGhIZWxwZXIgPSBPYmplY3QuY3JlYXRlKEdyYXBoSGVscGVyTWV0aG9kcyk7XG4gICAgICAgICAgICB2YXIgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG4gICAgICAgICAgICB2YXIgc2V0cyA9IHRoaXMuZ3JhcGhTZXRzO1xuICAgICAgICAgICAgdmFyIGdyYXBoID0gJCgnI2dyYXBoRGl2Jyk7XG5cbiAgICAgICAgICAgIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IDA7XG4gICAgICAgICAgICBpZiAoIUVEREFUREdyYXBoaW5nIHx8ICF0aGlzLmdyYXBoRW5hYmxlZCkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgJCgnI3Byb2Nlc3NpbmdTdGVwMlJlc3VsdHNMYWJlbCcpLnJlbW92ZUNsYXNzKCdvZmYnKTtcblxuICAgICAgICAgICAgRUREQVRER3JhcGhpbmcuY2xlYXJBbGxTZXRzKCk7XG4gICAgICAgICAgICB2YXIgc2V0cyA9IHRoaXMuZ3JhcGhTZXRzO1xuICAgICAgICAgICAgdmFyIGRhdGFTZXRzID0gW107XG4gICAgICAgICAgICAvLyBJZiB3ZSdyZSBub3QgaW4gZWl0aGVyIG9mIHRoZXNlIG1vZGVzLCBkcmF3aW5nIGEgZ3JhcGggaXMgbm9uc2Vuc2ljYWwuXG4gICAgICAgICAgICBpZiAoKG1vZGUgPT09IFwic3RkXCIgfHwgbW9kZSA9PT0gJ2Jpb2xlY3RvcicgfHwgbW9kZSA9PT0gJ2hwbGMnKSAmJiAoc2V0cy5sZW5ndGggPiAwKSkge1xuICAgICAgICAgICAgICAgIGdyYXBoLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICAgICBzZXRzLmZvckVhY2goZnVuY3Rpb24oc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzaW5nbGVBc3NheU9iaiA9IGdyYXBoSGVscGVyLnRyYW5zZm9ybU5ld0xpbmVJdGVtKEVERERhdGEsIHNldCk7XG4gICAgICAgICAgICAgICAgICAgIGRhdGFTZXRzLnB1c2goc2luZ2xlQXNzYXlPYmopO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIEVEREFUREdyYXBoaW5nLmFkZE5ld1NldChkYXRhU2V0cyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGdyYXBoLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgJCgnI3Byb2Nlc3NpbmdTdGVwMlJlc3VsdHNMYWJlbCcpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldFVzZXJXYXJuaW5ncygpOiBJbXBvcnRNZXNzYWdlW10ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMud2FybmluZ01lc3NhZ2VzO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0VXNlckVycm9ycygpOiBJbXBvcnRNZXNzYWdlW10ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZXJyb3JNZXNzYWdlcztcbiAgICAgICAgfVxuXG4gICAgICAgIHJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgbW9kZTogc3RyaW5nLCBoYWRJbnB1dDogYm9vbGVhbjtcbiAgICAgICAgICAgIHZhciBtb2RlID0gdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZTtcblxuICAgICAgICAgICAgLy8gaWYgdGhlIGN1cnJlbnQgbW9kZSBkb2Vzbid0IHJlcXVpcmUgaW5wdXQgZnJvbSB0aGlzIHN0ZXAsIGp1c3QgcmV0dXJuIHRydWVcbiAgICAgICAgICAgIC8vIGlmIHRoZSBwcmV2aW91cyBzdGVwIGhhZCBpbnB1dFxuICAgICAgICAgICAgaWYgKElkZW50aWZ5U3RydWN0dXJlc1N0ZXAuTU9ERVNfV0lUSF9EQVRBX1RBQkxFLmluZGV4T2YobW9kZSkgPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucmF3SW5wdXRTdGVwLmhhdmVJbnB1dERhdGE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgcmVxdWlyZSB1c2VyIGlucHV0IGZvciBldmVyeSBub24taWdub3JlZCByb3dcbiAgICAgICAgICAgIGZvcihsZXQgcm93IGluIHRoaXMucHVsbGRvd25PYmplY3RzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvd0luYWN0aXZhdGVkID0gIXRoaXMuYWN0aXZlUm93RmxhZ3Nbcm93XTtcblxuICAgICAgICAgICAgICAgIGlmKHJvd0luYWN0aXZhdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgaW5wdXRTZWxlY3RvciA9IHRoaXMucHVsbGRvd25PYmplY3RzW3Jvd107XG4gICAgICAgICAgICAgICAgdmFyIGNvbWJvQm94ID0gJChpbnB1dFNlbGVjdG9yKTtcbiAgICAgICAgICAgICAgICBpZihjb21ib0JveC52YWwoKSA9PSBJZGVudGlmeVN0cnVjdHVyZXNTdGVwLkRFRkFVTFRfUFVMTERPV05fVkFMVUUpIHsgLy8gTk9URTogdHlwZWNvbXBhcmlzb24gYnJlYWtzIGl0IVxuICAgICAgICAgICAgICAgICAgICAkKCcjbWlzc2luZ1N0ZXAzSW5wdXREaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICQoJyNtaXNzaW5nU3RlcDNJbnB1dERpdicpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyc2VkU2V0cy5sZW5ndGggPiAwO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGV2ZXJ5dGhpbmcgaW4gdGhlIFwiU3RlcCA0XCIgYm94IHRoYXQgeW91IHNlZSBvbiB0aGUgZGF0YSBpbXBvcnQgcGFnZS5cbiAgICBleHBvcnQgY2xhc3MgVHlwZURpc2FtYmlndWF0aW9uU3RlcCB7XG5cbiAgICAgICAgaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDogSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDtcblxuICAgICAgICAvLyBUaGVzZSBvYmplY3RzIGhvbGQgc3RyaW5nIGtleXMgdGhhdCBjb3JyZXNwb25kIHRvIHVuaXF1ZSBuYW1lcyBmb3VuZCBkdXJpbmcgcGFyc2luZy5cbiAgICAgICAgLy8gVGhlIHN0cmluZyBrZXlzIHBvaW50IHRvIGV4aXN0aW5nIGF1dG9jb21wbGV0ZSBvYmplY3RzIGNyZWF0ZWQgc3BlY2lmaWNhbGx5IGZvclxuICAgICAgICAvLyB0aG9zZSBzdHJpbmdzLiAgQW55IHNlbGVjdGlvbnMgdGhlIHVzZXIgaGFzIGFscmVhZHkgc2V0IHdpbGwgYmUgcHJlc2VydmVkLFxuICAgICAgICAvLyBldmVuIGFzIHRoZSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGlzIGRlc3Ryb3llZCBhbmQgcmVtYWRlLlxuXG4gICAgICAgIG1hc3RlckFzc2F5c09wdGlvbnNEaXNwbGF5ZWRGb3JQcm90b2NvbDogbnVtYmVyO1xuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgTGluZXNcbiAgICAgICAgbGluZU9ialNldHM6IHsgW2luZGV4OnN0cmluZ106IExpbmVEaXNhbWJpZ3VhdGlvblJvd307XG4gICAgICAgIGN1cnJlbnRseVZpc2libGVMaW5lT2JqU2V0czogTGluZURpc2FtYmlndWF0aW9uUm93W107XG4gICAgICAgIC8vIEZvciBkaXNhbWJ1Z3VhdGluZyBBc3NheXMgKHJlYWxseSBBc3NheS9MaW5lIGNvbWJpbmF0aW9ucylcbiAgICAgICAgYXNzYXlPYmpTZXRzOiB7IFtpbmRleDpzdHJpbmddOiBBc3NheURpc2FtYmlndWF0aW9uUm93fTtcbiAgICAgICAgY3VycmVudGx5VmlzaWJsZUFzc2F5T2JqU2V0czogQXNzYXlEaXNhbWJpZ3VhdGlvblJvd1tdO1xuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgbWVhc3VyZW1lbnQgdHlwZXNcbiAgICAgICAgbWVhc3VyZW1lbnRPYmpTZXRzOiBhbnk7XG4gICAgICAgIGN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHM6IGFueVtdO1xuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgbWV0YWRhdGFcbiAgICAgICAgbWV0YWRhdGFPYmpTZXRzOiB7IFtpbmRleDpzdHJpbmddOiBNZXRhZGF0YURpc2FtYmlndWF0aW9uUm93fTtcblxuICAgICAgICBzZWxlY3RNYWpvcktpbmRTdGVwOiBTZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICBuZXh0U3RlcENhbGxiYWNrOiBhbnk7XG5cbiAgICAgICAgaW5wdXRSZWZyZXNoVGltZXJJRDogbnVtYmVyO1xuXG4gICAgICAgIHRoaXNTdGVwSW5wdXRUaW1lcklEOm51bWJlcjtcblxuICAgICAgICBlcnJvck1lc3NhZ2VzOkltcG9ydE1lc3NhZ2VbXTtcbiAgICAgICAgd2FybmluZ01lc3NhZ2VzOkltcG9ydE1lc3NhZ2VbXTtcblxuICAgICAgICBzdGF0aWMgU1RFUF80X1VTRVJfSU5QVVRfQ0xBU1M6IHN0cmluZyA9IFwic3RlcDRfdXNlcl9pbnB1dFwiO1xuICAgICAgICBzdGF0aWMgU1RFUF80X1JFUVVJUkVEX0lOUFVUX0NMQVNTOiBzdHJpbmcgPSBcInN0ZXA0X3JlcXVpcmVkX2lucHV0XCI7XG4gICAgICAgIHN0YXRpYyBTVEVQXzRfVE9HR0xFX1JPV19DSEVDS0JPWDogc3RyaW5nID0gJ3RvZ2dsZUFsbEJ1dHRvbic7XG4gICAgICAgIHN0YXRpYyBTVEVQXzRfVE9HR0xFX1NVQlNFQ1RJT05fQ0xBU1M6IHN0cmluZyA9ICdzdGVwNFN1YnNlY3Rpb25Ub2dnbGUnO1xuICAgICAgICBzdGF0aWMgU1RFUF80X1NVQlNFQ1RJT05fUkVRVUlSRURfQ0xBU1M6IHN0cmluZyA9ICdzdGVwNFJlcXVpcmVkU3Vic2VjdGlvbkxhYmVsJztcblxuICAgICAgICBUT0dHTEVfQUxMX1RIUkVBU0hPTEQ6bnVtYmVyID0gNDtcbiAgICAgICAgRFVQTElDQVRFX0NPTlRST0xTX1RIUkVTSE9MRDpudW1iZXIgPSAxMDtcblxuXG4gICAgICAgIGNvbnN0cnVjdG9yKHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXAsIGlkZW50aWZ5U3RydWN0dXJlc1N0ZXA6IElkZW50aWZ5U3RydWN0dXJlc1N0ZXAsIG5leHRTdGVwQ2FsbGJhY2s6IGFueSkge1xuICAgICAgICAgICAgdmFyIHJlRG9TdGVwT25DaGFuZ2U6IHN0cmluZ1tdLCBtYXN0ZXJJbnB1dFNlbGVjdG9yczpzdHJpbmdbXTtcbiAgICAgICAgICAgIHRoaXMubGluZU9ialNldHMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlPYmpTZXRzID0ge307XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVMaW5lT2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlPYmpTZXRzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50T2JqU2V0cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFkYXRhT2JqU2V0cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5tYXN0ZXJBc3NheXNPcHRpb25zRGlzcGxheWVkRm9yUHJvdG9jb2wgPSAwO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAgPSBzZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICAgICAgdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwID0gaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjayA9IG5leHRTdGVwQ2FsbGJhY2s7XG4gICAgICAgICAgICB0aGlzLmVycm9yTWVzc2FnZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMud2FybmluZ01lc3NhZ2VzID0gW107XG5cbiAgICAgICAgICAgIC8vIHNldCB1cCBhIGxpc3RlbmVyIHRvIHJlY3JlYXRlIHRoZSBjb250cm9scyBmb3IgdGhpcyBzdGVwIGJhc2VkIG9uIGEgY2hhbmdlIHRvIGFueVxuICAgICAgICAgICAgLy8gb2YgdGhlIFwibWFzdGVyXCIgaW5wdXRzIHRoYXQgcmVxdWlyZXMgcmVidWlsZGluZyB0aGUgZm9ybSBmb3IgdGhpcyBzdGVwLlxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IGhlcmUgYW5kIGJlbG93IHdlIHVzZSAnaW5wdXQnIHNpbmNlIGl0IG1ha2VzIHRoZSBHVUkgbW9yZSByZXNwb25zaXZlXG4gICAgICAgICAgICAvLyB0byB1c2VyIGNoYW5nZXMuIEEgc2VwYXJhdGUgdGltZXIgd2UndmUgYWRkZWQgcHJldmVudHMgcmVwcm9jZXNzaW5nIHRoZSBmb3JtIHRvb1xuICAgICAgICAgICAgLy8gbWFueSB0aW1lcy5cbiAgICAgICAgICAgIHJlRG9TdGVwT25DaGFuZ2UgPSBbJyNtYXN0ZXJBc3NheScsICcjbWFzdGVyTGluZScsICcjbWFzdGVyTUNvbXAnLCAnI21hc3Rlck1UeXBlJywgJyNtYXN0ZXJNVW5pdHMnXTtcbiAgICAgICAgICAgICQocmVEb1N0ZXBPbkNoYW5nZS5qb2luKCcsJykpLm9uKCdpbnB1dCcsIHRoaXMuY2hhbmdlZEFueU1hc3RlclB1bGxkb3duLmJpbmQodGhpcykpO1xuXG5cbiAgICAgICAgICAgIG1hc3RlcklucHV0U2VsZWN0b3JzID0gWycjbWFzdGVyVGltZXN0YW1wJ10uY29uY2F0KHJlRG9TdGVwT25DaGFuZ2UpO1xuICAgICAgICAgICAgJCgnI21hc3RlclRpbWVzdGFtcCcpLm9uKCdpbnB1dCcsIHRoaXMucXVldWVSZXBhcnNlVGhpc1N0ZXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAkKCcjcmVzZXRzdGVwNCcpLm9uKCdjbGljaycsIHRoaXMucmVzZXREaXNhbWJpZ3VhdGlvbkZpZWxkcy5iaW5kKHRoaXMpKTtcblxuICAgICAgICAgICAgJChtYXN0ZXJJbnB1dFNlbGVjdG9ycykuYWRkQ2xhc3MoVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfVVNFUl9JTlBVVF9DTEFTUyk7XG5cbiAgICAgICAgICAgIC8vIG1hcmsgYWxsIHRoZSBcIm1hc3RlclwiIGlucHV0cyAob3IgZm9yIGF1dG9jb21wbGV0ZXMsIHRoZWlyIHBhaXJlZCBoaWRkZW4gaW5wdXQpIGFzXG4gICAgICAgICAgICAvLyByZXF1aXJlZCBpbnB1dCBmb3IgdGhpcyBzdGVwLiBOb3RlIHRoYXQgc29tZSBvZiB0aGUgY29udHJvbHMgcmVmZXJlbmNlZCBoZXJlIGFyZVxuICAgICAgICAgICAgLy8gaGlkZGVuIGlucHV0cyB0aGF0IGFyZSBkaWZmZXJlbnQgZnJvbSBcIm1hc3RlcklucHV0U2VsZWN0b3JzXCIgc3BlY2lmaWVkIGFib3ZlLlxuICAgICAgICAgICAgLy8gQWxzbyBub3RlIHRoYXQgdGhlICdyZXF1aXJlZCBpbnB1dCcgbWFya2luZyB3aWxsIGJlIGlnbm9yZWQgd2hlbiBlYWNoIGlzXG4gICAgICAgICAgICAvLyBtYXJrZWQgYXMgaW52aXNpYmxlIChldmVuIHRoZSB0eXBlPVwiaGlkZGVuXCIgb25lcylcbiAgICAgICAgICAgICQoJyNtYXN0ZXJUaW1lc3RhbXAnKS5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9SRVFVSVJFRF9JTlBVVF9DTEFTUyk7XG4gICAgICAgICAgICAkKFwiI21hc3RlckxpbmVcIikuYWRkQ2xhc3MoVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpO1xuICAgICAgICAgICAgJCgnI21hc3RlckFzc2F5JykuYWRkQ2xhc3MoVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpO1xuICAgICAgICAgICAgJCgnI21hc3RlckFzc2F5TGluZScpLmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1JFUVVJUkVEX0lOUFVUX0NMQVNTKTtcbiAgICAgICAgICAgICQoJyNtYXN0ZXJNQ29tcFZhbHVlJykuYWRkQ2xhc3MoVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpO1xuICAgICAgICAgICAgJCgnI21hc3Rlck1UeXBlVmFsdWUnKS5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9SRVFVSVJFRF9JTlBVVF9DTEFTUyk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyTVVuaXRzVmFsdWUnKS5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9SRVFVSVJFRF9JTlBVVF9DTEFTUyk7XG5cbiAgICAgICAgICAgIC8vIGVuYWJsZSBhdXRvY29tcGxldGUgb24gc3RhdGljYWxseSBkZWZpbmVkIGZpZWxkc1xuICAgICAgICAgICAgLy9FRERBdXRvLkJhc2VBdXRvLmNyZWF0ZUZyb21FbGVtZW50cygnI21hc3Rlck1Db21wJywgJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnKTtcbiAgICAgICAgICAgIC8vRUREQXV0by5CYXNlQXV0by5jcmVhdGVGcm9tRWxlbWVudHMoJyNtYXN0ZXJNVHlwZScsICdHZW5lcmljT3JNZXRhYm9saXRlJywgRURERGF0YS5NZXRhYm9saXRlVHlwZXMgfHwge30pO1xuICAgICAgICAgICAgLy9FRERBdXRvLkJhc2VBdXRvLmNyZWF0ZUZyb21FbGVtZW50cygnI21hc3Rlck1Vbml0cycsICdNZWFzdXJlbWVudFVuaXQnKTtcbiAgICAgICAgICAgIC8vRUREQXV0by5CYXNlQXV0by5jcmVhdGVGcm9tRWxlbWVudHMoJyNtYXN0ZXJVbml0cycsICdNZWFzdXJlbWVudFVuaXQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNldEFsbElucHV0c0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICAgICAgdmFyIGFsbFVzZXJJbnB1dHM6IEpRdWVyeSA9ICQoXCIuXCIgKyBUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9VU0VSX0lOUFVUX0NMQVNTKTtcblxuICAgICAgICAgICAgYWxsVXNlcklucHV0cy5lYWNoKGZ1bmN0aW9uIChpbmRleDogbnVtYmVyLCBkb21FbGVtZW50OiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGlucHV0ID0gJChkb21FbGVtZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICBpbnB1dC5yZW1vdmVBdHRyKCdkaXNhYmxlZCcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlucHV0LmF0dHIoJ2Rpc2FibGVkJywgJ2Rpc2FibGVkJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBwcmV2aW91c1N0ZXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5kaXNhYmxlSW5wdXREdXJpbmdQcm9jZXNzaW5nKCk7XG5cbiAgICAgICAgICAgIHZhciBhc3NheUluOiBKUXVlcnk7XG4gICAgICAgICAgICB2YXIgY3VycmVudEFzc2F5czogbnVtYmVyW107XG4gICAgICAgICAgICB2YXIgbWFzdGVyUCA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5tYXN0ZXJQcm90b2NvbDsgICAgLy8gU2hvdXQtb3V0cyB0byBhIG1pZC1ncmFkZSByYXBwZXJcblxuICAgICAgICAgICAgLy8gUmVjcmVhdGUgdGhlIG1hc3RlciBhc3NheSBwdWxsZG93biBoZXJlIGluc3RlYWQgb2YgaW4gcmVtYWtlQXNzYXlTZWN0aW9uKClcbiAgICAgICAgICAgIC8vIGJlY2F1c2UgaXRzIG9wdGlvbnMgYXJlIE5PVCBhZmZlY3RlZCBieSBjaGFuZ2VzIHRvIHN0ZXBzIGFmdGVyICMxLCBzbyBpdCB3b3VsZCBiZVxuICAgICAgICAgICAgLy8gcG9pbnRsZXNzIHRvIHJlbWFrZSBpdCBpbiByZXNwb25zZSB0byB0aGVtLiBXZSBtYXkgc2hvdy9oaWRlXG4gICAgICAgICAgICAvLyBpdCBiYXNlZCBvbiBvdGhlciBzdGF0ZSwgYnV0IGl0cyBjb250ZW50IHdvbid0IGNoYW5nZS4gUmVtYWtlQXNzYXlTZWN0aW9uKCkgaXNcbiAgICAgICAgICAgIC8vIGNhbGxlZCBieSByZWNvbmZpZ3VyZSgpLCB3aGljaCBpcyBjYWxsZWQgd2hlbiBvdGhlciBVSSBpbiB0aGlzIHN0ZXAgY2hhbmdlcy5cbiAgICAgICAgICAgIGlmICh0aGlzLm1hc3RlckFzc2F5c09wdGlvbnNEaXNwbGF5ZWRGb3JQcm90b2NvbCAhPSBtYXN0ZXJQKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXN0ZXJBc3NheXNPcHRpb25zRGlzcGxheWVkRm9yUHJvdG9jb2wgPSBtYXN0ZXJQO1xuXG4gICAgICAgICAgICAgICAgYXNzYXlJbiA9ICQoJyNtYXN0ZXJBc3NheScpLmVtcHR5KCk7XG4gICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KCcoQ3JlYXRlIE5ldyknKS5hcHBlbmRUbyhhc3NheUluKS52YWwoJ25hbWVkX29yX25ldycpLnByb3AoJ3NlbGVjdGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgY3VycmVudEFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1ttYXN0ZXJQXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBjdXJyZW50QXNzYXlzLmZvckVhY2goKGlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS5hcHBlbmRUbyhhc3NheUluKS52YWwoJycgKyBpZCkudGV4dChbXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gQWx3YXlzIHJldmVhbCB0aGlzLCBzaW5jZSB0aGUgZGVmYXVsdCBmb3IgdGhlIEFzc2F5IHB1bGxkb3duIGlzIGFsd2F5cyAnbmV3Jy5cbiAgICAgICAgICAgICAgICAkKCcjbWFzdGVyTGluZVNwYW4nKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnF1ZXVlUmVjb25maWd1cmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcmVjb25maWd1cmUgcm91dGluZS5cbiAgICAgICAgLy8gVGhpcyB3YXkgd2UgY29uZGVuc2UgbXVsdGlwbGUgcG9zc2libGUgZXZlbnRzIGZyb20gdGhlIHJhZGlvIGJ1dHRvbnMgYW5kL29yIHB1bGxkb3duIGludG8gb25lLlxuICAgICAgICBxdWV1ZVJlY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICB0aGlzLmRpc2FibGVJbnB1dER1cmluZ1Byb2Nlc3NpbmcoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbG9uZyB0aW1lb3V0IHNvIHdlIGRvbid0IGludGVyZmVyZSB3aXRoIG9uZ29pbmcgdXNlciBlZGl0c1xuICAgICAgICAgICAgdGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dCh0aGlzLnJlY29uZmlndXJlLmJpbmQodGhpcyksIDUwMCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHF1ZXVlUmVwYXJzZVRoaXNTdGVwKCk6IHZvaWQge1xuICAgICAgICAgICAgaWYgKHRoaXMudGhpc1N0ZXBJbnB1dFRpbWVySUQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50aGlzU3RlcElucHV0VGltZXJJRCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRoaXNTdGVwSW5wdXRUaW1lcklEID0gc2V0VGltZW91dCh0aGlzLnJlcGFyc2VUaGlzU3RlcC5iaW5kKHRoaXMpLCA1MDApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmUtcGFyc2VzIHVzZXIgaW5wdXRzIGZyb20gdGhpcyBzdGVwIHRvIGRldGVybWluZSB3aGV0aGVyIHRoZXkndmUgYWxsIGJlZW4gcHJvdmlkZWRcbiAgICAgICAgcmVwYXJzZVRoaXNTdGVwKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVTZXRzRm9yU3VibWlzc2lvbigpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuICAgICAgICBkaXNhYmxlSW5wdXREdXJpbmdQcm9jZXNzaW5nKCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgaGFzUmVxdWlyZWRJbml0aWFsSW5wdXRzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKTtcbiAgICAgICAgICAgIGlmKGhhc1JlcXVpcmVkSW5pdGlhbElucHV0cykge1xuICAgICAgICAgICAgICAgICQoJyNlbXB0eURpc2FtYmlndWF0aW9uTGFiZWwnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKCcjcHJvY2Vzc2luZ1N0ZXAzTGFiZWwnKS50b2dnbGVDbGFzcygnb2ZmJywgIWhhc1JlcXVpcmVkSW5pdGlhbElucHV0cyk7XG4gICAgICAgICAgICB0aGlzLnNldEFsbElucHV0c0VuYWJsZWQoZmFsc2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ3JlYXRlIHRoZSBTdGVwIDQgdGFibGVzOiAgU2V0cyBvZiByb3dzLCBvbmUgZm9yIGVhY2ggeS1heGlzIGNvbHVtbiBvZiB2YWx1ZXMsXG4gICAgICAgIC8vIHdoZXJlIHRoZSB1c2VyIGNhbiBmaWxsIG91dCBhZGRpdGlvbmFsIGluZm9ybWF0aW9uIGZvciB0aGUgcGFzdGVkIHRhYmxlLlxuICAgICAgICByZWNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBtb2RlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcGFyc2VkU2V0czogUmF3SW1wb3J0U2V0W10sXG4gICAgICAgICAgICAgICAgc2VlbkFueVRpbWVzdGFtcHM6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgaGlkZU1hc3RlclRpbWVzdGFtcDogYm9vbGVhbixcbiAgICAgICAgICAgICAgICBoYXNSZXF1aXJlZEluaXRpYWxJbnB1dDogYm9vbGVhbjtcblxuICAgICAgICAgICAgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG4gICAgICAgICAgICBzZWVuQW55VGltZXN0YW1wcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5zZWVuQW55VGltZXN0YW1wcztcblxuICAgICAgICAgICAgLy8gSGlkZSBhbGwgdGhlIHN1YnNlY3Rpb25zIGJ5IGRlZmF1bHRcbiAgICAgICAgICAgICQoJyNtYXN0ZXJUaW1lc3RhbXBEaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyTGluZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNtYXN0ZXJBc3NheUxpbmVEaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyTVR5cGVEaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyVW5pdERpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVMaW5lc1NlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZGlzYW1iaWd1YXRlQXNzYXlzU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNTZWN0aW9uJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICAgICAgLy8gcmVtb3ZlIHRvZ2dsZSBidXR0b25zIGFuZCBsYWJlbHMgZHluYW1pY2FsbHkgYWRkZWQgZm9yIHNvbWUgc3Vic2VjdGlvbnNcbiAgICAgICAgICAgIC8vIChlYXNpZXIgdGhhbiBsZWF2aW5nIHRoZW0gaW4gcGxhY2UpXG4gICAgICAgICAgICAkKCcuJyArIFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1RPR0dMRV9TVUJTRUNUSU9OX0NMQVNTKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICQoJy4nICsgVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfU1VCU0VDVElPTl9SRVFVSVJFRF9DTEFTUykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAgIGhhc1JlcXVpcmVkSW5pdGlhbElucHV0ID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKTtcblxuICAgICAgICAgICAgLy8gSWYgcGFyc2VkIGRhdGEgZXhpc3RzLCBidXQgd2UgaGF2ZW4ndCBzZWVuIGEgc2luZ2xlIHRpbWVzdGFtcCwgc2hvdyB0aGUgXCJtYXN0ZXJcbiAgICAgICAgICAgIC8vIHRpbWVzdGFtcFwiIGlucHV0LlxuICAgICAgICAgICAgaGlkZU1hc3RlclRpbWVzdGFtcCA9ICghaGFzUmVxdWlyZWRJbml0aWFsSW5wdXQpIHx8IHNlZW5BbnlUaW1lc3RhbXBzIHx8XG4gICAgICAgICAgICAgICAgKHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wYXJzZWRTZXRzLmxlbmd0aCA9PT0gMCk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyVGltZXN0YW1wRGl2JykudG9nZ2xlQ2xhc3MoJ29mZicsIGhpZGVNYXN0ZXJUaW1lc3RhbXApO1xuICAgICAgICAgICAgLy8gQ2FsbCBzdWJyb3V0aW5lcyBmb3IgZWFjaCBvZiB0aGUgbWFqb3Igc2VjdGlvbnNcbiAgICAgICAgICAgIGlmIChtb2RlID09PSBcImJpb2xlY3RvclwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1ha2VMaW5lU2VjdGlvbigpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbWFrZUFzc2F5U2VjdGlvbigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnJlbWFrZU1lYXN1cmVtZW50U2VjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5yZW1ha2VNZXRhZGF0YVNlY3Rpb24oKTtcblxuICAgICAgICAgICAgLy8gYWRkIGEgbGlzdGVuZXIgdG8gYWxsIHRoZSByZXF1aXJlZCBpbnB1dCBmaWVsZHMgc28gd2UgY2FuIGRldGVjdCB3aGVuIHRoZXkncmUgY2hhbmdlZFxuICAgICAgICAgICAgLy8gYW5kIGtub3cgd2hldGhlciBvciBub3QgdG8gYWxsb3cgY29udGludWF0aW9uIHRvIHRoZSBzdWJzZXF1ZW50IHN0ZXBcbiAgICAgICAgICAgICQoJy4nICsgVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpLm9uKCdpbnB1dCcsICgpPT4ge1xuICAgICAgICAgICAgICAgdGhpcy5xdWV1ZVJlcGFyc2VUaGlzU3RlcCgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICQoJyNlbXB0eURpc2FtYmlndWF0aW9uTGFiZWwnKS50b2dnbGVDbGFzcygnb2ZmJywgaGFzUmVxdWlyZWRJbml0aWFsSW5wdXQpO1xuICAgICAgICAgICAgJCgnI3Byb2Nlc3NpbmdTdGVwM0xhYmVsJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdGhpcy5zZXRBbGxJbnB1dHNFbmFibGVkKHRydWUpO1xuXG4gICAgICAgICAgICB0aGlzLnJlcGFyc2VUaGlzU3RlcCgpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUT0RPOiBUaGlzIGZ1bmN0aW9uIHNob3VsZCByZXNldCBhbGwgdGhlIGRpc2FtYmlndWF0aW9uIGZpZWxkcyB0byB0aGUgdmFsdWVzXG4gICAgICAgIC8vIHRoYXQgd2VyZSBhdXRvLWRldGVjdGVkIGluIHRoZSBsYXN0IHJlZnJlc2ggb2YgdGhlIG9iamVjdC5cbiAgICAgICAgcmVzZXREaXNhbWJpZ3VhdGlvbkZpZWxkcygpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIEdldCB0byB3b3JrISFcbiAgICAgICAgfVxuXG4gICAgICAgIGFkZFRvZ2dsZUFsbEJ1dHRvbihwYXJlbnQ6IEpRdWVyeSwgb2JqZWN0c0xhYmVsOiBzdHJpbmcpOiBKUXVlcnkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubWFrZVRvZ2dsZUFsbEJ1dHRvbihvYmplY3RzTGFiZWwpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKCQocGFyZW50KSk7XG4gICAgICAgIH1cblxuICAgICAgICBtYWtlVG9nZ2xlQWxsQnV0dG9uKG9iamVjdHNMYWJlbDogc3RyaW5nKTogSlF1ZXJ5IHtcbiAgICAgICAgICAgIHJldHVybiAkKCc8YnV0dG9uIHR5cGU9XCJidXR0b25cIj4nKVxuICAgICAgICAgICAgICAgIC50ZXh0KCdTZWxlY3QgQWxsICcgKyBvYmplY3RzTGFiZWwpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1RPR0dMRV9TVUJTRUNUSU9OX0NMQVNTKVxuICAgICAgICAgICAgICAgIC5vbignY2xpY2snLCB0aGlzLnRvZ2dsZUFsbFN1YnNlY3Rpb25JdGVtcy5iaW5kKHRoaXMpKVxuICAgICAgICB9XG5cbiAgICAgICAgdG9nZ2xlQWxsU3Vic2VjdGlvbkl0ZW1zKGV2OiBKUXVlcnlFdmVudE9iamVjdCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGFsbFNlbGVjdGVkOiBib29sZWFuLCBjaGVja2JveGVzOiBKUXVlcnksIHBhcmVudERpdjogSlF1ZXJ5O1xuXG4gICAgICAgICAgICBwYXJlbnREaXYgPSAkKGV2LnRhcmdldCkucGFyZW50KCk7XG4gICAgICAgICAgICBhbGxTZWxlY3RlZCA9IHRydWU7XG4gICAgICAgICAgICBjaGVja2JveGVzID0gJChwYXJlbnREaXYpLmZpbmQoJy4nICsgVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfVE9HR0xFX1JPV19DSEVDS0JPWCk7XG5cbiAgICAgICAgICAgIGNoZWNrYm94ZXMudG9BcnJheSgpLnNvbWUoKGVsdDogYW55KTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94ID0gJChlbHQpO1xuICAgICAgICAgICAgICAgIGlmICghY2hlY2tib3gucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFsbFNlbGVjdGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAgLy8gYnJlYWs7IGZvciB0aGUgQXJyYXkuc29tZSgpIGxvb3BcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG5cblxuICAgICAgICAgICAgLy8gdW4vY2hlY2sgYWxsIGNoZWNrYm94ZXMgYmFzZWQgb24gdGhlaXIgcHJldmlvdXMgc3RhdGVcbiAgICAgICAgICAgIGNoZWNrYm94ZXMuZWFjaCgoaW5kZXg6IG51bWJlciwgZWx0OiBFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94ID0gJChlbHQpO1xuICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnLCAhYWxsU2VsZWN0ZWQpO1xuICAgICAgICAgICAgICAgIERpc2FtYmlndWF0aW9uUm93LnRvZ2dsZVRhYmxlUm93RW5hYmxlZChjaGVja2JveCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5xdWV1ZVJlcGFyc2VUaGlzU3RlcCgpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgcHJldmlvdXMgc3RlcCBmb3VuZCBMaW5lIG5hbWVzIHRoYXQgbmVlZCByZXNvbHZpbmcsIGFuZCB0aGUgaW50ZXJwcmV0YXRpb24gbW9kZSBpbiBTdGVwIDFcbiAgICAgICAgLy8gd2FycmFudHMgcmVzb2x2aW5nIExpbmVzIGluZGVwZW5kZW50IG9mIEFzc2F5cywgd2UgY3JlYXRlIHRoaXMgc2VjdGlvbi5cbiAgICAgICAgLy8gVGhlIHBvaW50IGlzIHRoYXQgaWYgd2UgY29ubmVjdCB1bnJlc29sdmVkIExpbmUgc3RyaW5ncyBvbiB0aGVpciBvd24sIHRoZSB1bnJlc29sdmVkIEFzc2F5IHN0cmluZ3NcbiAgICAgICAgLy8gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIG11bHRpcGxlIG5ldyBBc3NheXMgd2l0aCBpZGVudGljYWwgbmFtZXMgdW5kZXIgYSByYW5nZSBvZiBMaW5lcy5cbiAgICAgICAgLy8gVGhpcyBtZWFucyB1c2VycyBjYW4gY3JlYXRlIGEgbWF0cml4IG9mIExpbmUvQXNzYXkgY29tYmluYXRpb25zLCByYXRoZXIgdGhhbiBhIG9uZS1kaW1lbnNpb25hbFxuICAgICAgICAvLyByZXNvbHV0aW9uIHdoZXJlIHVuaXF1ZSBBc3NheSBuYW1lcyBtdXN0IGFsd2F5cyBwb2ludCB0byBvbmUgdW5pcXVlIEFzc2F5IHJlY29yZC5cbiAgICAgICAgcmVtYWtlTGluZVNlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgYm9keTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgICAgICAgICB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgICAgICAgICBoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHM6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgcmVxdWlyZWRJbnB1dFRleHQ6IHN0cmluZyxcbiAgICAgICAgICAgICAgICB1bmlxdWVMaW5lTmFtZXMsXG4gICAgICAgICAgICAgICAgcGFyZW50RGl2O1xuICAgICAgICAgICAgdW5pcXVlTGluZU5hbWVzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnVuaXF1ZUxpbmVOYW1lcztcblxuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTGluZU9ialNldHMuZm9yRWFjaCgoZGlzYW06TGluZURpc2FtYmlndWF0aW9uUm93KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGlzYW0uZGV0YWNoKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVMaW5lc1RhYmxlJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAgIHRoaXMubGluZU9ialNldHMgPSB7fTtcblxuICAgICAgICAgICAgaWYgKHVuaXF1ZUxpbmVOYW1lcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucmVxdWlyZWRJbnB1dHNQcm92aWRlZCgpO1xuICAgICAgICAgICAgICAgICQoJyNtYXN0ZXJMaW5lRGl2JykudG9nZ2xlQ2xhc3MoJ29mZicsICFoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTGluZU9ialNldHMgPSBbXTtcblxuICAgICAgICAgICAgcGFyZW50RGl2ID0gJCgnI2Rpc2FtYmlndWF0ZUxpbmVzU2VjdGlvbicpO1xuICAgICAgICAgICAgcmVxdWlyZWRJbnB1dFRleHQgPSAnQXQgbGVhc3Qgb25lIGxpbmUgaXMgcmVxdWlyZWQuJztcbiAgICAgICAgICAgIHRoaXMuYWRkUmVxdWlyZWRJbnB1dExhYmVsKHBhcmVudERpdiwgcmVxdWlyZWRJbnB1dFRleHQpO1xuXG4gICAgICAgICAgICBpZih1bmlxdWVMaW5lTmFtZXMubGVuZ3RoID4gdGhpcy5UT0dHTEVfQUxMX1RIUkVBU0hPTEQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFRvZ2dsZUFsbEJ1dHRvbihwYXJlbnREaXYsICdMaW5lcycpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAvLyBTZXQgdXAgdGhlIHRhYmxlIGFuZCBjb2x1bW4gaGVhZGVyc1xuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGFibGU+JylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVMaW5lc1RhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhwYXJlbnREaXYucmVtb3ZlQ2xhc3MoJ29mZicpKVxuICAgICAgICAgICAgICAgIC5vbignY2hhbmdlJywgJ3NlbGVjdCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVzZXJDaGFuZ2VkTGluZURpc2FtKGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgfSlbMF07XG4gICAgICAgICAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAgICAgICAgIHVuaXF1ZUxpbmVOYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBkaXNhbTogTGluZURpc2FtYmlndWF0aW9uUm93LFxuICAgICAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRTZWw6IGFueSxcbiAgICAgICAgICAgICAgICAgICAgY2VsbDogSlF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBzZWxlY3Q6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMubGluZU9ialNldHNbbmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKCFkaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICBkaXNhbSA9IG5ldyBMaW5lRGlzYW1iaWd1YXRpb25Sb3coYm9keSwgbmFtZSwgaSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGluZU9ialNldHNbbmFtZV0gPSBkaXNhbTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGlzYW0uYXBwZW5kVG8oYm9keSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTGluZU9ialNldHMucHVzaChkaXNhbSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKHVuaXF1ZUxpbmVOYW1lcy5sZW5ndGggPiB0aGlzLkRVUExJQ0FURV9DT05UUk9MU19USFJFU0hPTEQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFRvZ2dsZUFsbEJ1dHRvbihwYXJlbnREaXYsICdMaW5lcycpO1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkUmVxdWlyZWRJbnB1dExhYmVsKHBhcmVudERpdiwgcmVxdWlyZWRJbnB1dFRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgcHJldmlvdXMgc3RlcCBmb3VuZCBMaW5lIG9yIEFzc2F5IG5hbWVzIHRoYXQgbmVlZCByZXNvbHZpbmcsIHB1dCB0b2dldGhlciBhIGRpc2FtYmlndWF0aW9uIHNlY3Rpb25cbiAgICAgICAgLy8gZm9yIEFzc2F5cy9MaW5lcy5cbiAgICAgICAgLy8gS2VlcCBhIHNlcGFyYXRlIHNldCBvZiBjb3JyZWxhdGlvbnMgYmV0d2VlbiBzdHJpbmdzIGFuZCBwdWxsZG93bnMgZm9yIGVhY2ggUHJvdG9jb2wsXG4gICAgICAgIC8vIHNpbmNlIHRoZSBzYW1lIHN0cmluZyBjYW4gbWF0Y2ggZGlmZmVyZW50IEFzc2F5cywgYW5kIHRoZSBwdWxsZG93bnMgd2lsbCBoYXZlIGRpZmZlcmVudCBjb250ZW50LCBpbiBlYWNoIFByb3RvY29sLlxuICAgICAgICAvLyBJZiB0aGUgcHJldmlvdXMgc3RlcCBkaWRuJ3QgZmluZCBhbnkgTGluZSBvciBBc3NheSBuYW1lcyB0aGF0IG5lZWQgcmVzb2x2aW5nLFxuICAgICAgICAvLyByZXZlYWwgdGhlIHB1bGxkb3ducyBmb3Igc2VsZWN0aW5nIGEgbWFzdGVyIExpbmUvQXNzYXksIGxlYXZpbmcgdGhlIHRhYmxlIGVtcHR5LCBhbmQgcmV0dXJuLlxuICAgICAgICByZW1ha2VBc3NheVNlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgYXZnUm93Q3JlYXRpb25TZWNvbmRzOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgbWF4Um93Q3JlYXRpb25TZWNvbmRzOm51bWJlcixcbiAgICAgICAgICAgICAgICBtYXN0ZXJQcm90b2NvbDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIG5Db2x1bW5zOm51bWJlcixcbiAgICAgICAgICAgICAgICBuQ29udHJvbHM6bnVtYmVyLFxuICAgICAgICAgICAgICAgIG5Sb3dzOm51bWJlcixcbiAgICAgICAgICAgICAgICBwYXJlbnREaXY6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICByZXF1aXJlZElucHV0VGV4dDogc3RyaW5nLFxuICAgICAgICAgICAgICAgIHRhYmxlOiBIVE1MVGFibGVFbGVtZW50LFxuICAgICAgICAgICAgICAgIHRhYmxlQm9keTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgICAgICAgICB1bmlxdWVBc3NheU5hbWVzLFxuICAgICAgICAgICAgICAgIHRvdGFsUm93Q3JlYXRpb25TZWNvbmRzOiBudW1iZXI7XG5cbiAgICAgICAgICAgIC8vIGdhdGhlciB1cCBpbnB1dHMgZnJvbSB0aGlzIGFuZCBwcmV2aW91cyBzdGVwc1xuICAgICAgICAgICAgdW5pcXVlQXNzYXlOYW1lcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC51bmlxdWVBc3NheU5hbWVzO1xuICAgICAgICAgICAgbWFzdGVyUHJvdG9jb2wgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAubWFzdGVyUHJvdG9jb2w7XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBzdGFsZSBkYXRhIGZyb20gcHJldmlvdXMgcnVuIG9mIHRoaXMgc3RlcFxuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlPYmpTZXRzLmZvckVhY2goKGRpc2FtOkFzc2F5RGlzYW1iaWd1YXRpb25Sb3cpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBkaXNhbS5kZXRhY2goKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlPYmpTZXRzID0gW107XG4gICAgICAgICAgICAkKCcjZGlzYW1iaWd1YXRlQXNzYXlzVGFibGUnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlPYmpTZXRzID0ge307XG5cbiAgICAgICAgICAgIC8vZW5kIGVhcmx5IGlmIHRoZXJlJ3Mgbm90aGluZyB0byBkaXNwbGF5IGluIHRoaXMgc2VjdGlvblxuICAgICAgICAgICAgaWYgKCghdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnBhcnNlZFNldHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwYXJlbnREaXYgPSAkKCcjZGlzYW1iaWd1YXRlQXNzYXlzU2VjdGlvbicpO1xuXG4gICAgICAgICAgICBpZiAodW5pcXVlQXNzYXlOYW1lcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAkKCcjbWFzdGVyQXNzYXlMaW5lRGl2JykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVxdWlyZWRJbnB1dFRleHQgPSAnQXQgbGVhc3Qgb25lIHZhbGlkIGFzc2F5IC8gbGluZSBjb21iaW5hdGlvbiBpcyByZXF1aXJlZC4nO1xuICAgICAgICAgICAgdGhpcy5hZGRSZXF1aXJlZElucHV0TGFiZWwocGFyZW50RGl2LCByZXF1aXJlZElucHV0VGV4dCk7XG5cbiAgICAgICAgICAgIGlmKHVuaXF1ZUFzc2F5TmFtZXMubGVuZ3RoID4gdGhpcy5UT0dHTEVfQUxMX1RIUkVBU0hPTEQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFRvZ2dsZUFsbEJ1dHRvbihwYXJlbnREaXYsICdBc3NheXMnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSB0YWJsZVxuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGFibGU+JylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVBc3NheXNUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8ocGFyZW50RGl2LnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgICAgICAgICAub24oJ2NoYW5nZScsICdzZWxlY3QnLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51c2VyQ2hhbmdlZEFzc2F5RGlzYW0oZXYudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9KVswXTtcbiAgICAgICAgICAgIHRhYmxlQm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG5cbiAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIHRhYmxlIHJvdyBmb3IgZWFjaCB1bmlxdWUgYXNzYXkgbmFtZVxuICAgICAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgICAgICAgICBuUm93cyA9IDA7XG4gICAgICAgICAgICBuQ29udHJvbHMgPSA0O1xuICAgICAgICAgICAgbkNvbHVtbnMgPSA1O1xuICAgICAgICAgICAgbWF4Um93Q3JlYXRpb25TZWNvbmRzID0gMDtcbiAgICAgICAgICAgIHRvdGFsUm93Q3JlYXRpb25TZWNvbmRzID0gMDtcbiAgICAgICAgICAgIHVuaXF1ZUFzc2F5TmFtZXMuZm9yRWFjaCgoYXNzYXlOYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheUlkOnN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgZGlzYW06IEFzc2F5RGlzYW1iaWd1YXRpb25Sb3csXG4gICAgICAgICAgICAgICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdFNlbGVjdGlvbjogYW55LFxuICAgICAgICAgICAgICAgICAgICBjZWxsOiBKUXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFTZWxlY3Q6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMuYXNzYXlPYmpTZXRzW2Fzc2F5TmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKCFkaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICBkaXNhbSA9IG5ldyBBc3NheURpc2FtYmlndWF0aW9uUm93KHRhYmxlQm9keSwgYXNzYXlOYW1lLCBpKTtcbiAgICAgICAgICAgICAgICAgICAgblJvd3MrKztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheU9ialNldHNbYXNzYXlOYW1lXSA9IGRpc2FtO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkaXNhbS5zZWxlY3RBc3NheUpRRWxlbWVudC5kYXRhKHsgJ3Zpc2libGVJbmRleCc6IGkgfSk7XG4gICAgICAgICAgICAgICAgZGlzYW0uYXBwZW5kVG8odGFibGVCb2R5KTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVBc3NheU9ialNldHMucHVzaChkaXNhbSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKHVuaXF1ZUFzc2F5TmFtZXMubGVuZ3RoID4gdGhpcy5EVVBMSUNBVEVfQ09OVFJPTFNfVEhSRVNIT0xEKSB7XG4gICAgICAgICAgICAgICAgdmFyIHdhcm5pbmdUZXh0OiBzdHJpbmc7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUb2dnbGVBbGxCdXR0b24ocGFyZW50RGl2LCAnQXNzYXlzJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRSZXF1aXJlZElucHV0TGFiZWwocGFyZW50RGl2LCByZXF1aXJlZElucHV0VGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIGFkZFJlcXVpcmVkSW5wdXRMYWJlbChwYXJlbnREaXY6IEpRdWVyeSwgdGV4dDogc3RyaW5nKTogSlF1ZXJ5IHtcbiAgICAgICAgICAgIHZhciBhZGRpbmcgPSBbVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfU1VCU0VDVElPTl9SRVFVSVJFRF9DTEFTUywgJ29mZicsICdtaXNzaW5nU2luZ2xlRm9ybUlucHV0J107XG4gICAgICAgICAgICByZXR1cm4gJCgnPGRpdj4nKS50ZXh0KHRleHQpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKGFkZGluZy5qb2luKCcgJykpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKHBhcmVudERpdik7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlbWFrZU1lYXN1cmVtZW50U2VjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBib2R5OiBIVE1MVGFibGVFbGVtZW50LFxuICAgICAgICAgICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCxcbiAgICAgICAgICAgICAgICBib2R5SnE6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICBoYXNSZXF1aXJlZEluaXRpYWxJbnB1dDogYm9vbGVhbixcbiAgICAgICAgICAgICAgICBzZWVuQW55VGltZXN0YW1wczogYm9vbGVhbixcbiAgICAgICAgICAgICAgICBtb2RlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcGFyZW50RGl2OiBKUXVlcnksXG4gICAgICAgICAgICAgICAgdW5pcXVlTWVhc3VyZW1lbnROYW1lczogYW55W10sXG4gICAgICAgICAgICAgICAgdGhhdDogVHlwZURpc2FtYmlndWF0aW9uU3RlcCA9IHRoaXM7XG5cbiAgICAgICAgICAgIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgdW5pcXVlTWVhc3VyZW1lbnROYW1lcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC51bmlxdWVNZWFzdXJlbWVudE5hbWVzO1xuICAgICAgICAgICAgc2VlbkFueVRpbWVzdGFtcHMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAuc2VlbkFueVRpbWVzdGFtcHM7XG5cbiAgICAgICAgICAgIGhhc1JlcXVpcmVkSW5pdGlhbElucHV0ID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKTtcblxuICAgICAgICAgICAgcGFyZW50RGl2ID0gJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1NlY3Rpb24nKVxuXG4gICAgICAgICAgICBwYXJlbnREaXYuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI21hc3Rlck1UeXBlRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuXG4gICAgICAgICAgICBib2R5SnEgPSAkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzVGFibGUgdGJvZHknKTtcbiAgICAgICAgICAgIGJvZHlKcS5jaGlsZHJlbigpLmRldGFjaCgpO1xuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHMuZm9yRWFjaCgoZGlzYW06YW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGlzYW0ucm93RWxlbWVudEpRLmRldGFjaCgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIElmIGluICdUcmFuc2NyaXB0aW9uJyBvciAnUHJvdGVvbWljcycgbW9kZSwgdGhlcmUgYXJlIG5vIG1lYXN1cmVtZW50IHR5cGVzIG5lZWRpbmdcbiAgICAgICAgICAgIC8vIGV4cGxpY2l0IGRpc2FtYmlndWF0aW9uLiBTa2lwIHRoZSBtZWFzdXJlbWVudCBzZWN0aW9uLCBhbmQgcHJvdmlkZSBzdGF0aXN0aWNzIGFib3V0XG4gICAgICAgICAgICAvLyB0aGUgZ2F0aGVyZWQgcmVjb3Jkcy5cbiAgICAgICAgICAgIC8vIFRPRE86IHNvbWV0aW1lcyBza3lsaW5lIHdpbGwgdGFyZ2V0IG1ldGFib2xpdGVzIGluc3RlYWQgb2YgcHJvdGVpbnM7IGluIHRob3NlIGNhc2VzXG4gICAgICAgICAgICAvLyAgZG8gbm90IGFib3J0IHNlY3Rpb25cbiAgICAgICAgICAgIGlmIChtb2RlID09PSBcInRyXCIgfHwgbW9kZSA9PT0gXCJwclwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBtZWFzdXJlbWVudHMgZm9yIGRpc2FtYmlndWF0aW9uLCBoYXZlIHRpbWVzdGFtcCBkYXRhOiAgVGhhdCBtZWFucyB3ZSBuZWVkIHRvXG4gICAgICAgICAgICAvLyBjaG9vc2Ugb25lIG1lYXN1cmVtZW50LiBZb3UgbWlnaHQgdGhpbmsgdGhhdCB3ZSBzaG91bGQgZGlzcGxheSB0aGlzIGV2ZW4gd2l0aG91dFxuICAgICAgICAgICAgLy8gdGltZXN0YW1wIGRhdGEsIHRvIGhhbmRsZSB0aGUgY2FzZSB3aGVyZSB3ZSdyZSBpbXBvcnRpbmcgYSBzaW5nbGUgbWVhc3VyZW1lbnQgdHlwZVxuICAgICAgICAgICAgLy8gZm9yIGEgc2luZ2xlIHRpbWVzdGFtcC4uLiAgQnV0IHRoYXQgd291bGQgYmUgYSAxLWRpbWVuc2lvbmFsIGltcG9ydCwgc2luY2UgdGhlcmVcbiAgICAgICAgICAgIC8vIGlzIG9ubHkgb25lIG90aGVyIG9iamVjdCB3aXRoIG11bHRpcGxlIHR5cGVzIHRvIHdvcmsgd2l0aCAobGluZXMvYXNzYXlzKS4gIFdlJ3JlXG4gICAgICAgICAgICAvLyBub3QgZ29pbmcgdG8gYm90aGVyIHN1cHBvcnRpbmcgdGhhdC5cbiAgICAgICAgICAgIGlmIChoYXNSZXF1aXJlZEluaXRpYWxJbnB1dCAmJiB1bmlxdWVNZWFzdXJlbWVudE5hbWVzLmxlbmd0aCA9PT0gMCAmJiBzZWVuQW55VGltZXN0YW1wcykge1xuICAgICAgICAgICAgICAgICQoJyNtYXN0ZXJNVHlwZURpdicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIElmIGluIFNreWxpbmUgbW9kZSwgbmVlZCB0byBzcGVjaWZ5IHRoZSB1bml0cyB0byBpbXBvcnRcbiAgICAgICAgICAgIGlmIChtb2RlID09PSAnc2t5bGluZScpIHtcbiAgICAgICAgICAgICAgICAkKCcjbWFzdGVyVW5pdERpdicpLnJlbW92ZUNsYXNzKCdvZmYnKVxuICAgICAgICAgICAgICAgICAgICAuZmluZCgnW25hbWU9bWFzdGVyVW5pdHNdJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9VU0VSX0lOUFVUX0NMQVNTKVxuICAgICAgICAgICAgICAgICAgICAuZW5kKClcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoJ1tuYW1lPW1hc3RlclVuaXRzVmFsdWVdJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9SRVFVSVJFRF9JTlBVVF9DTEFTUylcbiAgICAgICAgICAgICAgICAgICAgLmVuZCgpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih1bmlxdWVNZWFzdXJlbWVudE5hbWVzLmxlbmd0aCA+IHRoaXMuVE9HR0xFX0FMTF9USFJFQVNIT0xEKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYWtlVG9nZ2xlQWxsQnV0dG9uKCdNZWFzdXJlbWVudCBUeXBlcycpXG4gICAgICAgICAgICAgICAgICAgIC5pbnNlcnRCZWZvcmUoJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1RhYmxlJykpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBwdXQgdG9nZXRoZXIgYSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGZvciBtZWFzdXJlbWVudCB0eXBlc1xuICAgICAgICAgICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50Pihib2R5SnFbMF0pO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzID0gW107ICAgLy8gRm9yIHVzZSBpbiBjYXNjYWRpbmcgdXNlciBzZXR0aW5nc1xuICAgICAgICAgICAgdW5pcXVlTWVhc3VyZW1lbnROYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBkaXNhbTogYW55LCBpc01kdjogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMubWVhc3VyZW1lbnRPYmpTZXRzW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChkaXNhbSAmJiBkaXNhbS5yb3dFbGVtZW50SlEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0uYXBwZW5kVG8oYm9keSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0gPSBuZXcgTWVhc3VyZW1lbnREaXNhbWJpZ3VhdGlvblJvdyhib2R5LCBuYW1lLCBpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudE9ialNldHNbbmFtZV0gPSBkaXNhbTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gVE9ETyBzaXppbmcgc2hvdWxkIGJlIGhhbmRsZWQgaW4gQ1NTXG4gICAgICAgICAgICAgICAgZGlzYW0uY29tcEF1dG8udmlzaWJsZUlucHV0LmRhdGEoJ3Zpc2libGVJbmRleCcsIGkpO1xuICAgICAgICAgICAgICAgIGRpc2FtLnR5cGVBdXRvLnZpc2libGVJbnB1dC5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKTtcbiAgICAgICAgICAgICAgICBkaXNhbS51bml0c0F1dG8udmlzaWJsZUlucHV0LmRhdGEoJ3Zpc2libGVJbmRleCcsIGkpO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgaW4gTURWIG1vZGUsIHRoZSB1bml0cyBwdWxsZG93bnMgYXJlIGlycmVsZXZhbnQuIFRvZ2dsaW5nXG4gICAgICAgICAgICAgICAgLy8gdGhlIGhpZGRlbiB1bml0IGlucHV0IGNvbnRyb2xzIHdoZXRoZXIgaXQncyB0cmVhdGVkIGFzIHJlcXVpcmVkLlxuICAgICAgICAgICAgICAgIGlzTWR2ID0gbW9kZSA9PT0gJ21kdic7XG4gICAgICAgICAgICAgICAgZGlzYW0udW5pdHNBdXRvLnZpc2libGVJbnB1dC50b2dnbGVDbGFzcygnb2ZmJywgaXNNZHYpO1xuICAgICAgICAgICAgICAgIGRpc2FtLnVuaXRzQXV0by5oaWRkZW5JbnB1dC50b2dnbGVDbGFzcygnb2ZmJywgaXNNZHYpO1xuXG4gICAgICAgICAgICAgICAgLy8gU2V0IHJlcXVpcmVkIGlucHV0cyBhcyByZXF1aXJlZFxuICAgICAgICAgICAgICAgIGRpc2FtLmNvbXBBdXRvLmhpZGRlbklucHV0LmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1JFUVVJUkVEX0lOUFVUX0NMQVNTKTtcbiAgICAgICAgICAgICAgICBkaXNhbS50eXBlQXV0by5oaWRkZW5JbnB1dC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9SRVFVSVJFRF9JTlBVVF9DTEFTUyk7XG4gICAgICAgICAgICAgICAgZGlzYW0udW5pdHNBdXRvLmhpZGRlbklucHV0LnRvZ2dsZUNsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1JFUVVJUkVEX0lOUFVUX0NMQVNTLCAhaXNNZHYpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzLnB1c2goZGlzYW0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmKHVuaXF1ZU1lYXN1cmVtZW50TmFtZXMubGVuZ3RoID4gdGhpcy5EVVBMSUNBVEVfQ09OVFJPTFNfVEhSRVNIT0xEKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUb2dnbGVBbGxCdXR0b24ocGFyZW50RGl2LCAnTWVhc3VyZW1lbnQgVHlwZXMnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSgpO1xuICAgICAgICAgICAgJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1NlY3Rpb24nKS50b2dnbGVDbGFzcyhcbiAgICAgICAgICAgICAgICAnb2ZmJywgdW5pcXVlTWVhc3VyZW1lbnROYW1lcy5sZW5ndGggPT09IDAgfHwgIWhhc1JlcXVpcmVkSW5pdGlhbElucHV0XG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cblxuICAgICAgICByZW1ha2VNZXRhZGF0YVNlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgYm9keTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgICAgICAgICBwYXJlbnREaXY6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsXG4gICAgICAgICAgICAgICAgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQ7XG5cbiAgICAgICAgICAgIHZhciB1bmlxdWVNZXRhZGF0YU5hbWVzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnVuaXF1ZU1ldGFkYXRhTmFtZXM7XG4gICAgICAgICAgICBpZiAodW5pcXVlTWV0YWRhdGFOYW1lcy5sZW5ndGggPCAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkKCcjZGlzYW1iaWd1YXRlTWV0YWRhdGFUYWJsZScpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgICBwYXJlbnREaXYgPSAkKCcjZGlzYW1iaWd1YXRlTWV0YWRhdGFTZWN0aW9uJyk7XG5cbiAgICAgICAgICAgIGlmICh1bmlxdWVNZXRhZGF0YU5hbWVzLmxlbmd0aCA+IHRoaXMuVE9HR0xFX0FMTF9USFJFQVNIT0xEKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRUb2dnbGVBbGxCdXR0b24ocGFyZW50RGl2LCAnTWV0YWRhdGEgVHlwZXMnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgbWV0YWRhdGFcbiAgICAgICAgICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRhYmxlPicpXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZGlzYW1iaWd1YXRlTWV0YWRhdGFUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8oJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgICAgICAgICAub24oJ2NoYW5nZScsICdpbnB1dCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyBzaG91bGQgdGhlcmUgYmUgZXZlbnQgaGFuZGxpbmcgaGVyZSA/XG4gICAgICAgICAgICAgICAgfSlbMF07XG4gICAgICAgICAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAgICAgICAgIHVuaXF1ZU1ldGFkYXRhTmFtZXMuZm9yRWFjaCgobmFtZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2VsbDogSFRNTFRhYmxlQ2VsbEVsZW1lbnQsIGRpc2FtOiBhbnksIGlnbm9yZUxhYmVsOiBKUXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGlnbm9yZUNoa2J4OiBKUXVlcnksIHR5cGVEaXNhbWJpZ3VhdGlvblN0ZXA6IFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXA7XG4gICAgICAgICAgICAgICAgZGlzYW0gPSB0aGlzLm1ldGFkYXRhT2JqU2V0c1tuYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoZGlzYW0gJiYgZGlzYW0ucm93RWxlbWVudEpRKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtLmFwcGVuZFRvKGJvZHkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtID0gbmV3IE1ldGFkYXRhRGlzYW1iaWd1YXRpb25Sb3coYm9keSwgbmFtZSwgaSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWV0YWRhdGFPYmpTZXRzW25hbWVdID0gZGlzYW07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRpc2FtLm1ldGFBdXRvLnZpc2libGVJbnB1dC5hdHRyKCduYW1lJywgJ2Rpc2FtTWV0YScgKyBpKVxuICAgICAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2F1dG9jb21wX2FsdHlwZScpO1xuICAgICAgICAgICAgICAgIGRpc2FtLm1ldGFBdXRvLmhpZGRlbklucHV0LmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhSGlkZGVuJyArIGkpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICh1bmlxdWVNZXRhZGF0YU5hbWVzLmxlbmd0aCA+IHRoaXMuRFVQTElDQVRFX0NPTlRST0xTX1RIUkVTSE9MRCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkVG9nZ2xlQWxsQnV0dG9uKHBhcmVudERpdiwgJ01ldGFkYXRhIFR5cGVzJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gV2UgY2FsbCB0aGlzIHdoZW4gYW55IG9mIHRoZSAnbWFzdGVyJyBwdWxsZG93bnMgYXJlIGNoYW5nZWQgaW4gU3RlcCA0LlxuICAgICAgICAvLyBTdWNoIGNoYW5nZXMgbWF5IGFmZmVjdCB0aGUgYXZhaWxhYmxlIGNvbnRlbnRzIG9mIHNvbWUgb2YgdGhlIHB1bGxkb3ducyBpbiB0aGUgc3RlcC5cbiAgICAgICAgY2hhbmdlZEFueU1hc3RlclB1bGxkb3duKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gU2hvdyB0aGUgbWFzdGVyIGxpbmUgZHJvcGRvd24gaWYgdGhlIG1hc3RlciBhc3NheSBkcm9wZG93biBpcyBzZXQgdG8gbmV3XG4gICAgICAgICAgICAkKCcjbWFzdGVyTGluZVNwYW4nKS50b2dnbGVDbGFzcygnb2ZmJywgJCgnI21hc3RlckFzc2F5JykudmFsKCkgIT09ICduYW1lZF9vcl9uZXcnKTtcbiAgICAgICAgICAgIHRoaXMucXVldWVSZWNvbmZpZ3VyZSgpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgcHVsbGRvd24gaXMgYmVpbmcgc2V0IHRvICduZXcnLCB3YWxrIGRvd24gdGhlIHJlbWFpbmluZyBwdWxsZG93bnMgaW4gdGhlIHNlY3Rpb24sXG4gICAgICAgIC8vIGluIG9yZGVyLCBzZXR0aW5nIHRoZW0gdG8gJ25ldycgYXMgd2VsbCwgc3RvcHBpbmcganVzdCBiZWZvcmUgYW55IHB1bGxkb3duIG1hcmtlZCBhc1xuICAgICAgICAvLyBiZWluZyAnc2V0IGJ5IHRoZSB1c2VyJy5cbiAgICAgICAgdXNlckNoYW5nZWRMaW5lRGlzYW0obGluZUVsOiBFbGVtZW50KTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOiBKUXVlcnksIHY6IG51bWJlcjtcbiAgICAgICAgICAgIGNoYW5nZWQgPSAkKGxpbmVFbCkuZGF0YSgnc2V0QnlVc2VyJywgdHJ1ZSk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlZC52YWwoKSAhPT0gJ25ldycpIHtcbiAgICAgICAgICAgICAgICAvLyBzdG9wIGhlcmUgZm9yIGFueXRoaW5nIG90aGVyIHRoYW4gJ25ldyc7IG9ubHkgJ25ldycgY2FzY2FkZXMgdG8gZm9sbG93aW5nIHB1bGxkb3duc1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHYgPSBjaGFuZ2VkLmRhdGEoJ3Zpc2libGVJbmRleCcpIHx8IDA7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVMaW5lT2JqU2V0cy5zbGljZSh2KS5mb3JFYWNoKChvYmo6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0SW5wdXQ6IEpRdWVyeSA9IG9iai5saW5lQXV0by52aXNpYmxlSW5wdXQ7XG4gICAgICAgICAgICAgICAgaWYgKHRleHRJbnB1dC5kYXRhKCdzZXRCeVVzZXInKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHNldCBkcm9wZG93biB0byAnbmV3JyBhbmQgcmV2ZWFsIHRoZSBsaW5lIGF1dG9zZWxlY3RcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQudmFsKCduZXcnKS5uZXh0KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gc2VydmVzIHR3byBwdXJwb3Nlcy5cbiAgICAgICAgLy8gMS4gSWYgdGhlIGdpdmVuIEFzc2F5IGRpc2FtYmlndWF0aW9uIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3JywgcmV2ZWFsIHRoZSBhZGphY2VudFxuICAgICAgICAvLyAgICBMaW5lIHB1bGxkb3duLCBvdGhlcndpc2UgaGlkZSBpdC5cbiAgICAgICAgLy8gMi4gSWYgdGhlIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3Jywgd2FsayBkb3duIHRoZSByZW1haW5pbmcgcHVsbGRvd25zIGluIHRoZSBzZWN0aW9uLFxuICAgICAgICAvLyAgICBpbiBvcmRlciwgc2V0dGluZyB0aGVtIHRvICduZXcnIGFzIHdlbGwsIHN0b3BwaW5nIGp1c3QgYmVmb3JlIGFueSBwdWxsZG93biBtYXJrZWQgYXNcbiAgICAgICAgLy8gICAgYmVpbmcgJ3NldCBieSB0aGUgdXNlcicuXG4gICAgICAgIHVzZXJDaGFuZ2VkQXNzYXlEaXNhbShhc3NheUVsOiBFbGVtZW50KTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOiBKUXVlcnksXG4gICAgICAgICAgICAgICAgdjogbnVtYmVyO1xuICAgICAgICAgICAgY2hhbmdlZCA9ICQoYXNzYXlFbCkuZGF0YSgnc2V0QnlVc2VyJywgdHJ1ZSk7XG4gICAgICAgICAgICAvLyBUaGUgc3BhbiB3aXRoIHRoZSBjb3JyZXNwb25kaW5nIExpbmUgcHVsbGRvd24gaXMgYWx3YXlzIHJpZ2h0IG5leHQgdG8gdGhlIEFzc2F5IHB1bGxkb3duXG4gICAgICAgICAgICBjaGFuZ2VkLm5leHQoKS50b2dnbGVDbGFzcygnb2ZmJywgY2hhbmdlZC52YWwoKSAhPT0gJ25hbWVkX29yX25ldycpO1xuICAgICAgICAgICAgaWYgKGNoYW5nZWQudmFsKCkgIT09ICduYW1lZF9vcl9uZXcnKSB7XG4gICAgICAgICAgICAgICAgLy8gc3RvcCBoZXJlIGZvciBhbnl0aGluZyBvdGhlciB0aGFuICduZXcnOyBvbmx5ICduZXcnIGNhc2NhZGVzIHRvIGZvbGxvd2luZyBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2ID0gY2hhbmdlZC5kYXRhKCd2aXNpYmxlSW5kZXgnKSB8fCAwO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlPYmpTZXRzLnNsaWNlKHYpLmZvckVhY2goKG9iajogYW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5U2VsZWN0OiBKUXVlcnkgPSBvYmouc2VsZWN0QXNzYXlKUUVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5U2VsZWN0LmRhdGEoJ3NldEJ5VXNlcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gc2V0IGFzc2F5IGRyb3Bkb3duIHRvICduZXcnIGFuZCByZXZlYWwgdGhlIGxpbmUgYXV0b2NvbXBsZXRlXG4gICAgICAgICAgICAgICAgYXNzYXlTZWxlY3QudmFsKCduYW1lZF9vcl9uZXcnKS5uZXh0KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbShlbGVtZW50OiBFbGVtZW50KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBhdXRvOkVEREF1dG8uQmFzZUF1dG8sXG4gICAgICAgICAgICAgICAgaGlkZGVuSW5wdXQ6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQ6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICB0eXBlOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgcm93SW5kZXg6IG51bWJlcixcbiAgICAgICAgICAgICAgICBuZXh0U2V0czogYW55W107XG4gICAgICAgICAgICBoaWRkZW5JbnB1dCA9ICQoZWxlbWVudCk7XG4gICAgICAgICAgICBhdXRvID0gaGlkZGVuSW5wdXQuZGF0YSgnZWRkJykuYXV0b2NvbXBsZXRlb2JqOyAgICAvLyBJZiB0aGlzIGlzIG1pc3Npbmcgd2UgbWlnaHQgYXMgd2VsbCB0aHJvdyBhbiBlcnJvclxuICAgICAgICAgICAgdGV4dElucHV0ID0gYXV0by52aXNpYmxlSW5wdXQ7XG4gICAgICAgICAgICB0eXBlID0gYXV0by5tb2RlbE5hbWU7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnIHx8IHR5cGUgPT09ICdNZWFzdXJlbWVudFVuaXQnKSB7XG4gICAgICAgICAgICAgICAgcm93SW5kZXggPSB0ZXh0SW5wdXQuZGF0YSgnc2V0QnlVc2VyJywgdHJ1ZSkuZGF0YSgndmlzaWJsZUluZGV4JykgfHwgMDtcblxuICAgICAgICAgICAgICAgIGlmIChyb3dJbmRleCA8IHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIG5leHRTZXRzID0gdGhpcy5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzLnNsaWNlKHJvd0luZGV4ICsgMSk7XG4gICAgICAgICAgICAgICAgICAgIG5leHRTZXRzLnNvbWUoKG9iajogYW55KTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZm9sbG93aW5nOiBKUXVlcnkgPSAkKG9ialt0eXBlXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZm9sbG93aW5nLmxlbmd0aCA9PT0gMCB8fCBmb2xsb3dpbmcuZGF0YSgnc2V0QnlVc2VyJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIGJyZWFrOyBmb3IgdGhlIEFycmF5LnNvbWUoKSBsb29wXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB1c2luZyBwbGFjZWhvbGRlciBpbnN0ZWFkIG9mIHZhbCB0byBhdm9pZCB0cmlnZ2VyaW5nIGF1dG9jb21wbGV0ZSBjaGFuZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGxvd2luZy5hdHRyKCdwbGFjZWhvbGRlcicsIHRleHRJbnB1dC52YWwoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xsb3dpbmcubmV4dCgpLnZhbChoaWRkZW5JbnB1dC52YWwoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIG5vdCBjaGVja2luZyB0eXBlQXV0bzsgZm9ybSBzdWJtaXQgc2VuZHMgc2VsZWN0ZWQgdHlwZXNcbiAgICAgICAgICAgIHRoaXMuY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW0oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGxpc3Qgb2YgY3VycmVudGx5IHZpc2libGUgbWVhc3VyZW1lbnQgZGlzYW1iaWd1YXRpb24gZm9ybSBlbGVtZW50cyxcbiAgICAgICAgLy8gY2hlY2tpbmcgdG8gc2VlIGlmIGFueSBvZiB0aGUgJ2NvbXBhcnRtZW50JyBlbGVtZW50cyBhcmUgc2V0IHRvIGEgbm9uLWJsYW5rIHZhbHVlLlxuICAgICAgICAvLyBJZiBhbnkgYXJlLCBhbmQgd2UncmUgaW4gTURWIGRvY3VtZW50IG1vZGUsIGRpc3BsYXkgYSB3YXJuaW5nIHRoYXQgdGhlIHVzZXIgc2hvdWxkXG4gICAgICAgIC8vIHNwZWNpZnkgY29tcGFydG1lbnRzIGZvciBhbGwgdGhlaXIgbWVhc3VyZW1lbnRzLlxuICAgICAgICBjaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSgpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGFsbFNldDogYm9vbGVhbiwgbW9kZTogc3RyaW5nO1xuICAgICAgICAgICAgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG5cbiAgICAgICAgICAgIGFsbFNldCA9IHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5ldmVyeSgob2JqOiBhbnkpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY29tcEF1dG86IEVEREF1dG8uTWVhc3VyZW1lbnRDb21wYXJ0bWVudCA9IG9iai5jb21wQXV0bztcbiAgICAgICAgICAgICAgICBpZiAoY29tcEF1dG8udmlzaWJsZUlucHV0LmRhdGEoJ3NldEJ5VXNlcicpIHx8IChjb21wQXV0by52aXNpYmxlSW5wdXQudmFsKCkgJiYgY29tcEF1dG8udmFsKCkgIT09ICcwJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJCgnI25vQ29tcGFydG1lbnRXYXJuaW5nJykudG9nZ2xlQ2xhc3MoJ29mZicsIG1vZGUgIT09ICdtZHYnIHx8IGFsbFNldCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZXZpZXdzIHBhcnNlZCBkYXRhIGZyb20gU3RlcCAzIGFuZCBhcHBsaWVzIGRlY2lzaW9ucyBtYWRlIGluIFN0ZXAgNCB0byBjcmVhdGUgdGhlIGZpbmFsXG4gICAgICAgICAqIGRhdGFzZXQgZm9yIHN1Ym1pc3Npb24gdG8gdGhlIHNlcnZlci4gTm90ZSB0aGF0IHNvbWUgZGF0YSBtYXkgYmUgb21pdHRlZCBmcm9tIHN1Ym1pc3Npb25cbiAgICAgICAgICogaWYgdGhlIHVzZXIgaGFzIGNob3NlbiB0byBvbWl0IHRoZW0gKGUuZy4gYmVjYXVzZSBvZiBhbiB1bmRlZmluZWQgbWV0YWRhdGEgdHlwZSB0aGF0XG4gICAgICAgICAqIGlzbid0IHJlcXVpcmVkKS5cbiAgICAgICAgICogQHJldHVybnMge1Jlc29sdmVkSW1wb3J0U2V0W119XG4gICAgICAgICAqL1xuICAgICAgICBjcmVhdGVTZXRzRm9yU3VibWlzc2lvbigpOlJlc29sdmVkSW1wb3J0U2V0W10ge1xuICAgICAgICAgICAgdmFyIG1vZGU6IHN0cmluZyxcbiAgICAgICAgICAgICAgICBtYXN0ZXJQcm90b2NvbDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHNlZW5BbnlUaW1lc3RhbXBzOiBib29sZWFuLFxuICAgICAgICAgICAgICAgIGRyb3BwZWREYXRhc2V0c0Zvck1pc3NpbmdUaW1lOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgcGFyc2VkU2V0czogUmF3SW1wb3J0U2V0W10sXG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRTZXRzOiBSZXNvbHZlZEltcG9ydFNldFtdLFxuICAgICAgICAgICAgICAgIG1hc3RlclRpbWU6IG51bWJlcixcbiAgICAgICAgICAgICAgICBtYXN0ZXJMaW5lOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWFzdGVyQXNzYXlMaW5lOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWFzdGVyQXNzYXk6IHN0cmluZyxcbiAgICAgICAgICAgICAgICBtYXN0ZXJNVHlwZTogc3RyaW5nLFxuICAgICAgICAgICAgICAgIG1hc3Rlck1Db21wOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWFzdGVyTVVuaXRzOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWFzdGVyVW5pdHM6IHN0cmluZztcbiAgICAgICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy53YXJuaW5nTWVzc2FnZXMgPSBbXTtcblxuICAgICAgICAgICAgLy8gRnJvbSBTdGVwIDFcbiAgICAgICAgICAgIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgbWFzdGVyUHJvdG9jb2wgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAubWFzdGVyUHJvdG9jb2wgfHwgbnVsbDsgICAgLy8gQ2FzdCAwIHRvIG51bGxcblxuICAgICAgICAgICAgLy8gRnJvbSBTdGVwIDNcbiAgICAgICAgICAgIHNlZW5BbnlUaW1lc3RhbXBzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnNlZW5BbnlUaW1lc3RhbXBzO1xuICAgICAgICAgICAgcGFyc2VkU2V0cyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wYXJzZWRTZXRzO1xuXG4gICAgICAgICAgICAvLyBGcm9tIHRoaXMgU3RlcFxuICAgICAgICAgICAgbWFzdGVyVGltZSA9IHBhcnNlRmxvYXQoJCgnI21hc3RlclRpbWVzdGFtcCcpLnZhbCgpKTtcbiAgICAgICAgICAgIG1hc3RlckxpbmUgPSAkKCcjbWFzdGVyTGluZScpLnZhbCgpO1xuICAgICAgICAgICAgbWFzdGVyQXNzYXlMaW5lID0gJCgnI21hc3RlckFzc2F5TGluZScpLnZhbCgpO1xuICAgICAgICAgICAgbWFzdGVyQXNzYXkgPSAkKCcjbWFzdGVyQXNzYXknKS52YWwoKTtcbiAgICAgICAgICAgIG1hc3Rlck1UeXBlID0gJCgnI21hc3Rlck1UeXBlVmFsdWUnKS52YWwoKTtcbiAgICAgICAgICAgIG1hc3Rlck1Db21wID0gJCgnI21hc3Rlck1Db21wVmFsdWUnKS52YWwoKTtcbiAgICAgICAgICAgIG1hc3Rlck1Vbml0cyA9ICQoJyNtYXN0ZXJNVW5pdHNWYWx1ZScpLnZhbCgpO1xuXG4gICAgICAgICAgICByZXNvbHZlZFNldHMgPSBbXTtcbiAgICAgICAgICAgIGRyb3BwZWREYXRhc2V0c0Zvck1pc3NpbmdUaW1lID0gMDtcblxuICAgICAgICAgICAgcGFyc2VkU2V0cy5mb3JFYWNoKChzZXQ6IFJhd0ltcG9ydFNldCwgc2V0SW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheURpc2FtOiBhbnksICAvLyBUT0RPOiBuZWVkIHR5cGVzIGZvciB0aGUgZGlzYW0gb2JqZWN0c1xuICAgICAgICAgICAgICAgICAgICBhc3NheV9pZDogc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICBhc3NheVNlbGVjdDogSlF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBjb21wYXJ0bWVudElkOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVEaXNhbTogYW55LFxuICAgICAgICAgICAgICAgICAgICBsaW5lSWQ6IHN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgbGluZUlkSW5wdXQ6IEpRdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgbWVhc0Rpc2FtOiBhbnksXG4gICAgICAgICAgICAgICAgICAgIG1ldGFEaXNhbTogYW55LFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudFR5cGVJZDogc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICB1bml0c0lkOiBzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVkRGF0YTogKHN0cmluZyB8IG51bWJlcilbXVtdLFxuICAgICAgICAgICAgICAgICAgICBtZXRhRGF0YUJ5SWQ6IHtbaWQ6c3RyaW5nXTogc3RyaW5nfSxcbiAgICAgICAgICAgICAgICAgICAgbWV0YURhdGFCeU5hbWU6IHtbbmFtZTpzdHJpbmddOiBzdHJpbmd9LFxuICAgICAgICAgICAgICAgICAgICBtZXRhRGF0YVByZXNlbnQ6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgICAgIG1ldGFJZDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlZFNldDogUmVzb2x2ZWRJbXBvcnRTZXQ7XG5cbiAgICAgICAgICAgICAgICBsaW5lSWQgPSAnbmV3JzsgICAgLy8gQSBjb252ZW5pZW50IGRlZmF1bHRcbiAgICAgICAgICAgICAgICBhc3NheV9pZCA9ICduYW1lZF9vcl9uZXcnO1xuXG4gICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRUeXBlSWQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGNvbXBhcnRtZW50SWQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHVuaXRzSWQgPSBudWxsO1xuICAgICAgICAgICAgICAgIC8vIEluIG1vZGVzIHdoZXJlIHdlIHJlc29sdmUgbWVhc3VyZW1lbnQgdHlwZXMgaW4gdGhlIGNsaWVudCBVSSwgZ28gd2l0aCB0aGVcbiAgICAgICAgICAgICAgICAvLyBtYXN0ZXIgdmFsdWVzIGJ5IGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgaWYgKG1vZGUgPT09IFwiYmlvbGVjdG9yXCIgfHwgbW9kZSA9PT0gXCJzdGRcIiB8fCBtb2RlID09PSBcIm1kdlwiIHx8IG1vZGUgPT09IFwiaHBsY1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50VHlwZUlkID0gbWFzdGVyTVR5cGU7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBhcnRtZW50SWQgPSBtYXN0ZXJNQ29tcDtcbiAgICAgICAgICAgICAgICAgICAgdW5pdHNJZCA9IG1hc3Rlck1Vbml0cztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdza3lsaW5lJykge1xuICAgICAgICAgICAgICAgICAgICB1bml0c0lkID0gbWFzdGVyVW5pdHM7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbWV0YURhdGFQcmVzZW50ID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBpZiAobW9kZSA9PT0gXCJiaW9sZWN0b3JcIikge1xuICAgICAgICAgICAgICAgICAgICBsaW5lSWQgPSBtYXN0ZXJMaW5lO1xuICAgICAgICAgICAgICAgICAgICAvLyBUZWxscyB0aGUgc2VydmVyIHRvIGF0dGVtcHQgdG8gcmVzb2x2ZSBkaXJlY3RseSBhZ2FpbnN0IHRoZSBuYW1lLCBvciBtYWtlXG4gICAgICAgICAgICAgICAgICAgIC8vIGEgbmV3IEFzc2F5XG4gICAgICAgICAgICAgICAgICAgIGFzc2F5X2lkID0gXCJuYW1lZF9vcl9uZXdcIjtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBhIHZhbGlkLCBzcGVjaWZpYyBMaW5lIG5hbWUsIGxvb2sgZm9yIGEgZGlzYW1iaWd1YXRpb24gZmllbGRcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhhdCBtYXRjaGVzIGl0LlxuICAgICAgICAgICAgICAgICAgICBpZiAoc2V0LmxpbmVfbmFtZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZURpc2FtID0gdGhpcy5saW5lT2JqU2V0c1tzZXQubGluZV9uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaW5lRGlzYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lSWRJbnB1dCA9IGxpbmVEaXNhbS5saW5lQXV0by5oaWRkZW5JbnB1dDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlJ3ZlIGRpc2FibGVkIGltcG9ydCBmb3IgdGhlIGFzc29jaWF0ZWQgbGluZSwgc2tpcCBhZGRpbmcgdGhpc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1lYXN1cmVtZW50IHRvIHRoZSBsaXN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpbmVJZElucHV0LnByb3AoJ2Rpc2FibGVkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuOyAgLy8gY29udGludWUgdG8gdGhlIG5leHQgbG9vcCBpdGVyYXRpb24gcGFyc2VkU2V0cy5mb3JFYWNoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVJZCA9IGxpbmVJZElucHV0LnZhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZUlkID0gbWFzdGVyQXNzYXlMaW5lO1xuICAgICAgICAgICAgICAgICAgICBhc3NheV9pZCA9IG1hc3RlckFzc2F5O1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2V0LmFzc2F5X25hbWUgIT09IG51bGwgJiYgbWFzdGVyUHJvdG9jb2wpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2F5RGlzYW0gPSB0aGlzLmFzc2F5T2JqU2V0c1tzZXQuYXNzYXlfbmFtZV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzYXlEaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzc2F5U2VsZWN0ID0gYXNzYXlEaXNhbS5zZWxlY3RBc3NheUpRRWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSd2ZSBkaXNhYmxlZCBpbXBvcnQgZm9yIHRoaXMgYXNzYXksIHNraXAgYWRkaW5nIHRoaXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBtZWFzdXJlbWVudCB0byB0aGUgbGlzdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NheVNlbGVjdC5pcygnOmRpc2FibGVkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuOyAgLy8gY29udGludWUgdG8gdGhlIG5leHQgbG9vcCBpdGVyYXRpb24gcGFyc2VkU2V0cy5mb3JFYWNoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzc2F5X2lkID0gYXNzYXlTZWxlY3QudmFsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZUlkSW5wdXQgPSBhc3NheURpc2FtLmxpbmVBdXRvLmhpZGRlbklucHV0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVJZCA9IGxpbmVJZElucHV0LnZhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gU2FtZSBmb3IgbWVhc3VyZW1lbnQgbmFtZSwgYnV0IHJlc29sdmUgYWxsIHRocmVlIG1lYXN1cmVtZW50IGZpZWxkcyBpZiB3ZSBmaW5kXG4gICAgICAgICAgICAgICAgLy8gYSBtYXRjaCwgYW5kIG9ubHkgaWYgd2UgYXJlIHJlc29sdmluZyBtZWFzdXJlbWVudCB0eXBlcyBjbGllbnQtc2lkZS5cbiAgICAgICAgICAgICAgICBpZiAobW9kZSA9PT0gXCJiaW9sZWN0b3JcIiB8fCBtb2RlID09PSBcInN0ZFwiIHx8IG1vZGUgPT09IFwibWR2XCIgfHwgbW9kZSA9PT0gJ2hwbGMnKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZXQubWVhc3VyZW1lbnRfbmFtZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVhc0Rpc2FtID0gdGhpcy5tZWFzdXJlbWVudE9ialNldHNbc2V0Lm1lYXN1cmVtZW50X25hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1lYXNEaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50VHlwZUlkID0gbWVhc0Rpc2FtLnR5cGVBdXRvLnZhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBhcnRtZW50SWQgPSBtZWFzRGlzYW0uY29tcEF1dG8udmFsKCkgfHwgXCIwXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5pdHNJZCA9IG1lYXNEaXNhbS51bml0c0F1dG8udmFsKCkgfHwgXCIxXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UndmUgZGlzYWJsZWQgaW1wb3J0IGZvciBtZWFzdXJlbWVudHMgb2YgdGhpcyB0eXBlLCBza2lwIGFkZGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgbWVhc3VyZW1lbnQgdG8gdGhlIGxpc3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWVhc0Rpc2FtLnR5cGVBdXRvLmhpZGRlbklucHV0LmlzKCc6ZGlzYWJsZWQnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47ICAvLyBjb250aW51ZSB0byB0aGUgbmV4dCBsb29wIGl0ZXJhdGlvbiBwYXJzZWRTZXRzLmZvckVhY2hcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBbnkgbWV0YWRhdGEgZGlzYW1iaWd1YXRpb24gZmllbGRzIHRoYXQgYXJlIGxlZnQgdW5yZXNvbHZlZCwgd2lsbCBoYXZlIHRoZWlyXG4gICAgICAgICAgICAgICAgLy8gbWV0YWRhdGEgZHJvcHBlZCBmcm9tIHRoZSBpbXBvcnQgaW4gdGhpcyBzdGVwLCBiZWNhdXNlIHRoaXMgbG9vcCBpcyBidWlsZGluZ1xuICAgICAgICAgICAgICAgIC8vIGtleS12YWx1ZSBwYWlycyB3aGVyZSB0aGUga2V5IGlzIHRoZSBjaG9zZW4gZGF0YWJhc2UgaWQgb2YgdGhlIG1ldGFkYXRhIHR5cGUuXG4gICAgICAgICAgICAgICAgLy8gTm8gaWQgPT0gbm90IGFkZGVkLlxuICAgICAgICAgICAgICAgIG1ldGFEYXRhQnlJZCA9IHt9O1xuICAgICAgICAgICAgICAgIG1ldGFEYXRhQnlOYW1lID0ge307XG4gICAgICAgICAgICAgICAgT2JqZWN0LmtleXMoc2V0Lm1ldGFkYXRhX2J5X25hbWUpLmZvckVhY2goKG5hbWUpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICBtZXRhRGlzYW0gPSB0aGlzLm1ldGFkYXRhT2JqU2V0c1tuYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGFEaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWV0YUlkID0gbWV0YURpc2FtLm1ldGFBdXRvLnZhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGFJZCAmJiAoIW1ldGFEaXNhbS5tZXRhQXV0by5oaWRkZW5JbnB1dC5pcygnOmRpc2FibGVkJykpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0YURhdGFCeUlkW21ldGFJZF0gPSBzZXQubWV0YWRhdGFfYnlfbmFtZVtuYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXRhRGF0YUJ5TmFtZVtuYW1lXSA9IHNldC5tZXRhZGF0YV9ieV9uYW1lW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFEYXRhUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHJlc29sdmVkRGF0YSA9IHNldC5kYXRhOyAgICAvLyBJZGVhbGx5IHdlIHdvdWxkIGNsb25lIHRoaXMuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZW4ndCBzZWVuIGFueSB0aW1lc3RhbXBzIGR1cmluZyBkYXRhIGFjY3VtdWxhdGlvbiwgaXQgbWVhbnMgd2UgbmVlZFxuICAgICAgICAgICAgICAgIC8vIHRoZSB1c2VyIHRvIHBpY2sgYSBtYXN0ZXIgdGltZXN0YW1wLiAgSW4gdGhhdCBzaXR1YXRpb24sIGFueSBnaXZlbiBzZXQgd2lsbFxuICAgICAgICAgICAgICAgIC8vIGhhdmUgYXQgbW9zdCBvbmUgZGF0YSBwb2ludCBpbiBpdCwgd2l0aCB0aGUgdGltZXN0YW1wIGluIHRoZSBkYXRhIHBvaW50IHNldCB0b1xuICAgICAgICAgICAgICAgIC8vICdudWxsJy4gIEhlcmUgd2UgcmVzb2x2ZSBpdCB0byBhIHZhbGlkIHRpbWVzdGFtcC4gSWYgdGhlcmUgaXMgbm8gbWFzdGVyXG4gICAgICAgICAgICAgICAgLy8gdGltZXN0YW1wIHNlbGVjdGVkLCB3ZSBkcm9wIHRoZSBkYXRhIHBvaW50LCBidXQgbWFrZSB0aGUgc2V0IGFueXdheSBzaW5jZSBpdFxuICAgICAgICAgICAgICAgIC8vIG1pZ2h0IGNhcnJ5IG1ldGFkYXRhLlxuICAgICAgICAgICAgICAgIGlmICghc2VlbkFueVRpbWVzdGFtcHMgJiYgcmVzb2x2ZWREYXRhWzBdKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNOYU4obWFzdGVyVGltZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVkRGF0YVswXVswXSA9IG1hc3RlclRpbWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlZERhdGEgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyb3BwZWREYXRhc2V0c0Zvck1pc3NpbmdUaW1lKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIG5vIGRhdGEsIGFuZCBubyBtZXRhZGF0YSB0aGF0IHN1cnZpdmVkIHJlc29sdmluZywgZG9uJ3QgbWFrZSB0aGUgc2V0LlxuICAgICAgICAgICAgICAgIC8vIChyZXR1cm4gY29udGludWVzIHRvIHRoZSBuZXh0IGxvb3AgaXRlcmF0aW9uKVxuICAgICAgICAgICAgICAgIGlmIChyZXNvbHZlZERhdGEubGVuZ3RoIDwgMSAmJiAhbWV0YURhdGFQcmVzZW50KSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRTZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENvcHkgYWNyb3NzIHRoZSBmaWVsZHMgZnJvbSB0aGUgUmF3SW1wb3J0U2V0IHJlY29yZFxuICAgICAgICAgICAgICAgICAgICBraW5kOiAgICAgICAgICAgICAgc2V0LmtpbmQsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVfbmFtZTogICAgICAgICBzZXQubGluZV9uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhc3NheV9uYW1lOiAgICAgICAgc2V0LmFzc2F5X25hbWUsXG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50X25hbWU6ICBzZXQubWVhc3VyZW1lbnRfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGFfYnlfbmFtZTogIG1ldGFEYXRhQnlOYW1lLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiAgICAgICAgICAgICAgcmVzb2x2ZWREYXRhLFxuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgbmV3IGRpc2FtYmlndWF0aW9uLXNwZWNpZmljIGZpZWxkc1xuICAgICAgICAgICAgICAgICAgICBwcm90b2NvbF9pZDogICAgICAgbWFzdGVyUHJvdG9jb2wsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVfaWQ6ICAgICAgICAgICBsaW5lSWQsXG4gICAgICAgICAgICAgICAgICAgIGFzc2F5X2lkOiAgICAgICAgICBhc3NheV9pZCxcbiAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRfaWQ6ICAgIG1lYXN1cmVtZW50VHlwZUlkLFxuICAgICAgICAgICAgICAgICAgICBjb21wYXJ0bWVudF9pZDogICAgY29tcGFydG1lbnRJZCxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHNfaWQ6ICAgICAgICAgIHVuaXRzSWQsXG4gICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhX2J5X2lkOiAgICBtZXRhRGF0YUJ5SWRcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmVkU2V0cy5wdXNoKHJlc29sdmVkU2V0KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAocmVzb2x2ZWRTZXRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlcy5wdXNoKG5ldyBJbXBvcnRNZXNzYWdlKCdBbGwgb2YgdGhlIG1lYXN1cmVtZW50cyBhbmQgJyArXG4gICAgICAgICAgICAgICAgICAgICcgbWV0YWRhdGEgaGF2ZSBiZWVuIGV4Y2x1ZGVkIGZyb20gaW1wb3J0LiBQbGVhc2Ugc2VsZWN0IHNvbWUgZGF0YSB0bycgK1xuICAgICAgICAgICAgICAgICAgICAnIGltcG9ydC4nKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGxvZyBzb21lIGRlYnVnZ2luZyBvdXRwdXQgaWYgYW55IGRhdGEgZ2V0IGRyb3BwZWQgYmVjYXVzZSBvZiBhIG1pc3NpbmcgdGltZXN0YW1wXG4gICAgICAgICAgICBpZiAoZHJvcHBlZERhdGFzZXRzRm9yTWlzc2luZ1RpbWUpIHtcbiAgICAgICAgICAgICAgICBpZiAocGFyc2VkU2V0cy5sZW5ndGggPT09IGRyb3BwZWREYXRhc2V0c0Zvck1pc3NpbmdUaW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICQoXCIjbWFzdGVyVGltZXN0YW1wUmVxdWlyZWRQcm9tcHRcIikucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwZXJjZW50RHJvcHBlZCA9IChkcm9wcGVkRGF0YXNldHNGb3JNaXNzaW5nVGltZSAvIHBhcnNlZFNldHMubGVuZ3RoKSAqIDEwMDtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdhcm5pbmdNZXNzYWdlID0gZHJvcHBlZERhdGFzZXRzRm9yTWlzc2luZ1RpbWUgKyBcIiBwYXJzZWQgZGF0YXNldHMgKFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBlcmNlbnREcm9wcGVkICsgXCIlKSB3ZXJlIGRyb3BwZWQgYmVjYXVzZSB0aGV5IHdlcmUgbWlzc2luZyBhIHRpbWVzdGFtcC5cIjtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKHdhcm5pbmdNZXNzYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy53YXJuaW5nTWVzc2FnZXMucHVzaChuZXcgSW1wb3J0TWVzc2FnZSh3YXJuaW5nTWVzc2FnZSkpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkKFwiI21hc3RlclRpbWVzdGFtcFJlcXVpcmVkUHJvbXB0XCIpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlZFNldHM7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRVc2VyV2FybmluZ3MoKTpJbXBvcnRNZXNzYWdlW10ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMud2FybmluZ01lc3NhZ2VzO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0VXNlckVycm9ycygpOkltcG9ydE1lc3NhZ2VbXSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lcnJvck1lc3NhZ2VzO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVxdWlyZWRJbnB1dHNQcm92aWRlZCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHN1YnNlY3Rpb246IEpRdWVyeSwgcmVxdWlyZWRJbnB1dFN1YnNlY3Rpb25TZWxlY3RvcnM6IHN0cmluZ1tdLFxuICAgICAgICAgICAgICAgIGFsbFJlcXVpcmVkSW5wdXRzOiBKUXVlcnksIHNlY3Rpb25SZXF1aXJlZElucHV0czogSlF1ZXJ5W107XG5cbiAgICAgICAgICAgIC8vIGxvb3Agb3ZlciBzdWJzZWN0aW9ucyB0aGF0IG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgaW5wdXQsIG1ha2luZyBzdXJlIHRoYXQgYWxsIHRoZVxuICAgICAgICAgICAgLy8gdmlzaWJsZSBvbmVzIGhhdmUgYXQgbGVhc3Qgb25lIHJlcXVpcmVkIGlucHV0IHRoYXQgaXNuJ3QgaWdub3JlZC5cbiAgICAgICAgICAgIHJlcXVpcmVkSW5wdXRTdWJzZWN0aW9uU2VsZWN0b3JzID0gWycjZGlzYW1iaWd1YXRlQXNzYXlzU2VjdGlvbicsICcjZGlzYW1iaWd1YXRlTGluZXNTZWN0aW9uJ107XG4gICAgICAgICAgICBmb3IgKGxldCBzZWxlY3RvciBvZiByZXF1aXJlZElucHV0U3Vic2VjdGlvblNlbGVjdG9ycykge1xuICAgICAgICAgICAgICAgIHZhciBoYXNFbmFibGVkSW5wdXRzO1xuICAgICAgICAgICAgICAgIHN1YnNlY3Rpb24gPSAkKHNlbGVjdG9yKTtcblxuICAgICAgICAgICAgICAgIGlmIChzdWJzZWN0aW9uLmhhc0NsYXNzKCdvZmYnKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzZWN0aW9uUmVxdWlyZWRJbnB1dHMgPSBzdWJzZWN0aW9uLmZpbmQoJy4nICsgVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpLnRvQXJyYXkoKTtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGlucHV0X2lkIG9mIHNlY3Rpb25SZXF1aXJlZElucHV0cykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgaW5wdXQgPSAkKGlucHV0X2lkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoKCFpbnB1dC52YWwoKSkgJiYgIShpbnB1dC5wcm9wKCdkaXNhYmxlZCcpIHx8IGlucHV0Lmhhc0NsYXNzKCdvZmYnKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGhhc0VuYWJsZWRJbnB1dHMgPSBzZWN0aW9uUmVxdWlyZWRJbnB1dHMubGVuZ3RoICE9PSAwO1xuICAgICAgICAgICAgICAgIHN1YnNlY3Rpb24uZmluZCgnLicgKyBUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9TVUJTRUNUSU9OX1JFUVVJUkVEX0NMQVNTKS50b2dnbGVDbGFzcygnb2ZmJywgaGFzRW5hYmxlZElucHV0cyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWhhc0VuYWJsZWRJbnB1dHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdGVzdCB0aGF0IGFsbCByZXF1aXJlZCBpbnB1dHMgY3VycmVudGx5IHZpc2libGUgLyBlbmFibGVkIG9uIHRoZSBmb3JtIGhhdmUgYSB2YWxpZFxuICAgICAgICAgICAgLy8gdmFsdWUuIE5vdGU6IHRoaXMgY2hlY2sgaXMgdmVyeSBzaW1pbGFyIHRvLCBidXQgZGlzdGluY3QgZnJvbSwgdGhlIG9uZSBhYm92ZS5cbiAgICAgICAgICAgIHZhciBhbGxSZXF1aXJlZElucHV0cyA9ICQoJy4nICsgVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpO1xuICAgICAgICAgICAgZm9yIChsZXQgaW5wdXRfaWQgb2YgYWxsUmVxdWlyZWRJbnB1dHMudG9BcnJheSgpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGlucHV0ID0gJChpbnB1dF9pZCk7XG5cbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgaW5wdXQgaGFzIG5vIHZhbHVlLCBidXQgd2Fzbid0IGhpZGRlbiBmcm9tIHRoZSBkaXNwbGF5IGJ5IHRoZSAnb2ZmJ1xuICAgICAgICAgICAgICAgIC8vIGNsYXNzLCBpdCdzIG1pc3NpbmcgcmVxdWlyZWQgZGF0YS4gTm90ZSB0aGF0IHRoZSBcImhpZGRlblwiIGNoZWNrIGJlbG93XG4gICAgICAgICAgICAgICAgLy8gd2lsbCBzdGlsbCBhbGxvdyA8aW5wdXQgdHlwZT1cImhpZGRlblwiPiwgYnV0IHdpbGwgaWdub3JlIGlucHV0cyB0aGF0IGhhdmUgYmVlblxuICAgICAgICAgICAgICAgIC8vIFwiaGlkZGVuXCIgYnkgdGhlIFwib2ZmXCIgY2xhc3MgZGlyZWN0bHkgdG8gdGhlIGlucHV0IG9yIG9uZSBvZiBpdHMgcGFyZW50cy5cbiAgICAgICAgICAgICAgICBpZigoIWlucHV0LnZhbCgpKSAmJiAhKGlucHV0LnByb3AoJ2Rpc2FibGVkJykgfHwgaW5wdXQuaGFzQ2xhc3MoJ29mZicpXG4gICAgICAgICAgICAgICAgICAgIHx8IGlucHV0LnBhcmVudHMoJy5vZmYnKS5sZW5ndGggPiAwKSApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBhbGxSZXF1aXJlZElucHV0cy5sZW5ndGggPiAwO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBEaXNhbWJpZ3VhdGlvblJvdyB7XG5cbiAgICAgICAgcm93OkhUTUxUYWJsZVJvd0VsZW1lbnQ7XG4gICAgICAgIHJvd0VsZW1lbnRKUTpKUXVlcnk7XG4gICAgICAgIGlnbm9yZUNoZWNrYm94OkpRdWVyeTtcbiAgICAgICAgdmlzaWJsZUluZGV4Om51bWJlcjtcblxuXG4gICAgICAgIGNvbnN0cnVjdG9yKGJvZHk6SFRNTFRhYmxlRWxlbWVudCwgbmFtZSwgaSkge1xuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5kZXggPSBpO1xuXG4gICAgICAgICAgICAvLyBGaXJzdCBtYWtlIGEgdGFibGUgcm93LCBhbmQgc2F2ZSBhIHJlZmVyZW5jZSB0byBpdFxuICAgICAgICAgICAgdGhpcy5yb3cgPSBib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50SlEgPSAkKHRoaXMucm93KTtcbiAgICAgICAgICAgIHRoaXMuYWRkSWdub3JlQ2hlY2tib3goKTtcblxuICAgICAgICAgICAgLy8gTmV4dCwgYWRkIGEgdGFibGUgY2VsbCB3aXRoIHRoZSBzdHJpbmcgd2UgYXJlIGRpc2FtYmlndWF0aW5nXG4gICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8odGhpcy5yb3cuaW5zZXJ0Q2VsbCgpKTtcblxuICAgICAgICAgICAgdGhpcy5idWlsZChib2R5LCBuYW1lLCBpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gRW1wdHkgYmFzZSBpbXBsZW1lbnRhdGlvbiBmb3IgY2hpbGRyZW4gdG8gb3ZlcnJpZGVcbiAgICAgICAgYnVpbGQoYm9keTpIVE1MVGFibGVFbGVtZW50LCBuYW1lLCBpKSB7XG5cblxuICAgICAgICB9XG5cblxuICAgICAgICBkZXRhY2goKSB7XG4gICAgICAgICAgICB0aGlzLnJvd0VsZW1lbnRKUS5kZXRhY2goKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgYXBwZW5kVG8oYm9keTpIVE1MVGFibGVFbGVtZW50KSB7XG4gICAgICAgICAgICB0aGlzLnJvd0VsZW1lbnRKUS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgYWRkSWdub3JlQ2hlY2tib3goKSB7XG4gICAgICAgICAgICAvLyBpZ25vcmUgY2hlY2tib3guIGFsbG93cyBpbXBvcnQgZm9yIGJ1dHRvbmVkIHVwIGZpbGUgZm9ybWF0cyAoZS5nLiBiaW9sZWN0b3IsXG4gICAgICAgICAgICAvLyBIUExDKSB0byBzZWxlY3RpdmVseSBpZ25vcmUgcGFydHMgb2YgdGhlIGlucHV0IGZpbGUgdGhhdCBhcmVuJ3QgbmVjZXNzYXJ5XG4gICAgICAgICAgICB0aGlzLmlnbm9yZUNoZWNrYm94ID0gJCgnPGlucHV0IHR5cGU9XCJjaGVja2JveFwiPicpXG4gICAgICAgICAgICAgICAgLnByb3AoJ2NoZWNrZWQnLCB0cnVlKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9VU0VSX0lOUFVUX0NMQVNTKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9UT0dHTEVfUk9XX0NIRUNLQk9YKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aGlzLnJvdy5pbnNlcnRDZWxsKCkpXG4gICAgICAgICAgICAgICAgLm9uKCdjaGFuZ2UnLCB0aGlzLnVzZXJDaGFuZ2VkUm93RW5hYmxlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXNlckNoYW5nZWRSb3dFbmFibGVkKCk6IHZvaWQge1xuICAgICAgICAgICAgRGlzYW1iaWd1YXRpb25Sb3cudG9nZ2xlVGFibGVSb3dFbmFibGVkKHRoaXMuaWdub3JlQ2hlY2tib3gpO1xuICAgICAgICAgICAgRUREVGFibGVJbXBvcnQudHlwZURpc2FtYmlndWF0aW9uU3RlcC5xdWV1ZVJlcGFyc2VUaGlzU3RlcCgpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBnZXQgcGFpcmVkIGhpZGRlbiAvIHZpc2libGUgYXV0b2NvbXBsZXRlIGlucHV0cyBpbiB0aGUgc2FtZSB0YWJsZSByb3cgYXMgdGhlIGNoZWNrYm94XG4gICAgICAgIC8vIGFuZCBlbmFibGUvZGlzYWJsZS9yZXF1aXJlIHRoZW0gYXMgYXBwcm9wcmlhdGVcbiAgICAgICAgc3RhdGljIHRvZ2dsZVRhYmxlUm93RW5hYmxlZChjaGVja2JveDogSlF1ZXJ5KSB7XG4gICAgICAgICAgICB2YXIgZW5hYmxlZCA9IGNoZWNrYm94LmlzKCc6Y2hlY2tlZCcpO1xuXG4gICAgICAgICAgICAvLyBpdGVyYXRlIG92ZXIgY2VsbHMgaW4gdGhlIHJvd1xuICAgICAgICAgICAgY2hlY2tib3gucGFyZW50KCkubmV4dEFsbCgpLmVhY2goKGluZGV4OiBudW1iZXIsIGVsdDogRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB0YWJsZUNlbGw6IEpRdWVyeSA9ICQoZWx0KTtcbiAgICAgICAgICAgICAgICB0YWJsZUNlbGwudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkVGV4dExhYmVsJywgIWVuYWJsZWQpO1xuXG4gICAgICAgICAgICAgICAgLy8gbWFuYWdlIHRleHQgaW5wdXQocylcbiAgICAgICAgICAgICAgICAvLyBjbGVhciAvIGRpc2FibGUgdGhlIHZpc2libGUgaW5wdXQgc28gaXQgZG9lc24ndCBnZXQgc3VibWl0dGVkIHdpdGggdGhlIGZvcm1cbiAgICAgICAgICAgICAgICB0YWJsZUNlbGwuZmluZCgnOmlucHV0JykucHJvcCgnZGlzYWJsZWQnLCAhZW5hYmxlZCk7XG5cbiAgICAgICAgICAgICAgICAvLyBtYW5hZ2UgaGlkZGVuIGlucHV0KHMpXG4gICAgICAgICAgICAgICAgdGFibGVDZWxsLmZpbmQoJzpoaWRkZW4nKS50b2dnbGVDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9SRVFVSVJFRF9JTlBVVF9DTEFTUywgZW5hYmxlZCk7XG5cbiAgICAgICAgICAgICAgICAvLyBtYW5hZ2UgZHJvcGRvd25zXG4gICAgICAgICAgICAgICAgdGFibGVDZWxsLmZpbmQoJ3NlbGVjdCcpLnRvZ2dsZUNsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1JFUVVJUkVEX0lOUFVUX0NMQVNTLCBlbmFibGVkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhZGF0YURpc2FtYmlndWF0aW9uUm93IGV4dGVuZHMgRGlzYW1iaWd1YXRpb25Sb3cge1xuXG4gICAgICAgIG1ldGFBdXRvOkVEREF1dG8uQXNzYXlMaW5lTWV0YWRhdGFUeXBlO1xuXG4gICAgICAgIC8vIENhY2hlIGZvciByZS11c2Ugb2YgYXV0b2NvbXBsZXRlIG9iamVjdHNcbiAgICAgICAgc3RhdGljIGF1dG9DYWNoZTphbnkgPSB7fTtcblxuXG4gICAgICAgIGJ1aWxkKGJvZHk6SFRNTFRhYmxlRWxlbWVudCwgbmFtZSwgaSkge1xuXG4gICAgICAgICAgICB0aGlzLm1ldGFBdXRvID0gbmV3IEVEREF1dG8uQXNzYXlMaW5lTWV0YWRhdGFUeXBlKHtcbiAgICAgICAgICAgICAgICBjb250YWluZXI6ICQodGhpcy5yb3cuaW5zZXJ0Q2VsbCgpKSxcbiAgICAgICAgICAgICAgICB2aXNpYmxlVmFsdWU6IG5hbWUsXG4gICAgICAgICAgICAgICAgY2FjaGU6IE1ldGFkYXRhRGlzYW1iaWd1YXRpb25Sb3cuYXV0b0NhY2hlXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMubWV0YUF1dG8udmlzaWJsZUlucHV0LmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1VTRVJfSU5QVVRfQ0xBU1MpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhJyArIGkpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKCdhdXRvY29tcF9hbHR5cGUnKTtcbiAgICAgICAgICAgIHRoaXMubWV0YUF1dG8uaGlkZGVuSW5wdXQuYWRkQ2xhc3MoVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfVVNFUl9JTlBVVF9DTEFTUylcbiAgICAgICAgICAgICAgICAuYXR0cignbmFtZScsICdkaXNhbU1ldGFIaWRkZW4nICsgaSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1lYXN1cmVtZW50RGlzYW1iaWd1YXRpb25Sb3cgZXh0ZW5kcyBEaXNhbWJpZ3VhdGlvblJvdyB7XG5cbiAgICAgICAgY29tcEF1dG86RUREQXV0by5Bc3NheUxpbmVNZXRhZGF0YVR5cGU7XG4gICAgICAgIHR5cGVBdXRvOkVEREF1dG8uR2VuZXJpY09yTWV0YWJvbGl0ZTtcbiAgICAgICAgdW5pdHNBdXRvOkVEREF1dG8uTWVhc3VyZW1lbnRVbml0O1xuXG4gICAgICAgIC8vIENhY2hlcyBmb3IgcmUtdXNlIG9mIGF1dG9jb21wbGV0ZSBmaWVsZHNcbiAgICAgICAgc3RhdGljIGNvbXBBdXRvQ2FjaGU6YW55ID0ge307XG4gICAgICAgIHN0YXRpYyBtZXRhYm9saXRlQXV0b0NhY2hlOmFueSA9IHt9O1xuICAgICAgICBzdGF0aWMgdW5pdEF1dG9DYWNoZTphbnkgPSB7fTtcblxuXG4gICAgICAgIGJ1aWxkKGJvZHk6SFRNTFRhYmxlRWxlbWVudCwgbmFtZSwgaSkge1xuXG4gICAgICAgICAgICB0aGlzLmNvbXBBdXRvID0gbmV3IEVEREF1dG8uTWVhc3VyZW1lbnRDb21wYXJ0bWVudCh7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyOiQodGhpcy5yb3cuaW5zZXJ0Q2VsbCgpKSxcbiAgICAgICAgICAgICAgICBjYWNoZTpNZWFzdXJlbWVudERpc2FtYmlndWF0aW9uUm93LmNvbXBBdXRvQ2FjaGVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy50eXBlQXV0byA9IG5ldyBFRERBdXRvLkdlbmVyaWNPck1ldGFib2xpdGUoe1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lcjokKHRoaXMucm93Lmluc2VydENlbGwoKSksXG4gICAgICAgICAgICAgICAgY2FjaGU6TWVhc3VyZW1lbnREaXNhbWJpZ3VhdGlvblJvdy5tZXRhYm9saXRlQXV0b0NhY2hlXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMudW5pdHNBdXRvID0gbmV3IEVEREF1dG8uTWVhc3VyZW1lbnRVbml0KHtcbiAgICAgICAgICAgICAgICBjb250YWluZXI6JCh0aGlzLnJvdy5pbnNlcnRDZWxsKCkpLFxuICAgICAgICAgICAgICAgIGNhY2hlOk1lYXN1cmVtZW50RGlzYW1iaWd1YXRpb25Sb3cudW5pdEF1dG9DYWNoZVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhdXRvY29tcGxldGVzXG4gICAgICAgICAgICBbdGhpcy5jb21wQXV0bywgdGhpcy50eXBlQXV0bywgdGhpcy51bml0c0F1dG9dLmZvckVhY2goKGF1dG86IEVEREF1dG8uQmFzZUF1dG8pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2VsbDogSlF1ZXJ5ID0gJCh0aGlzLnJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdkaXNhbURhdGFDZWxsJyk7XG4gICAgICAgICAgICAgICAgYXV0by5jb250YWluZXIuYWRkQ2xhc3MoJ2Rpc2FtRGF0YUNlbGwnKTtcbiAgICAgICAgICAgICAgICBhdXRvLnZpc2libGVJbnB1dC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9VU0VSX0lOUFVUX0NMQVNTKTtcbiAgICAgICAgICAgICAgICBhdXRvLmhpZGRlbklucHV0LmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1VTRVJfSU5QVVRfQ0xBU1MpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICQodGhpcy5yb3cpLm9uKCdjaGFuZ2UnLCAnaW5wdXRbdHlwZT1oaWRkZW5dJywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgLy8gb25seSB3YXRjaCBmb3IgY2hhbmdlcyBvbiB0aGUgaGlkZGVuIHBvcnRpb24sIGxldCBhdXRvY29tcGxldGUgd29ya1xuICAgICAgICAgICAgICAgIEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAudXNlckNoYW5nZWRNZWFzdXJlbWVudERpc2FtKGV2LnRhcmdldCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIEVERF9hdXRvLmluaXRpYWxfc2VhcmNoKHRoaXMudHlwZUF1dG8sIG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBMaW5lRGlzYW1iaWd1YXRpb25Sb3cgZXh0ZW5kcyBEaXNhbWJpZ3VhdGlvblJvdyB7XG5cbiAgICAgICAgbGluZUF1dG86RUREQXV0by5TdHVkeUxpbmU7XG5cblxuICAgICAgICBidWlsZChib2R5OkhUTUxUYWJsZUVsZW1lbnQsIG5hbWUsIGkpIHtcbiAgICAgICAgICAgIHZhciBkZWZhdWx0U2VsOmFueSwgY2VsbDpKUXVlcnk7XG4gICAgICAgICAgICBjZWxsID0gJCh0aGlzLnJvdy5pbnNlcnRDZWxsKCkpLmNzcygndGV4dC1hbGlnbicsICdsZWZ0Jyk7XG4gICAgICAgICAgICBkZWZhdWx0U2VsID0gTGluZURpc2FtYmlndWF0aW9uUm93LmRpc2FtYmlndWF0ZUFuQXNzYXlPckxpbmUobmFtZSwgaSk7XG5cbiAgICAgICAgICAgIHRoaXMuYXBwZW5kTGluZUF1dG9zZWxlY3QoY2VsbCwgZGVmYXVsdFNlbCk7XG4gICAgICAgICAgICB0aGlzLmxpbmVBdXRvLnZpc2libGVJbnB1dC5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgYXBwZW5kTGluZUF1dG9zZWxlY3QocGFyZW50RWxlbWVudDpKUXVlcnksIGRlZmF1bHRTZWxlY3Rpb24pOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIHRleHQgaW5wdXQgdG8gZ2F0aGVyIHVzZXIgaW5wdXRcbiAgICAgICAgICAgIHZhciBsaW5lSW5wdXRJZCA9ICdkaXNhbUxpbmVJbnB1dCcgKyB0aGlzLnZpc2libGVJbmRleDtcblxuICAgICAgICAgICAgdGhpcy5saW5lQXV0byA9IG5ldyBFRERBdXRvLlN0dWR5TGluZSh7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyOnBhcmVudEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgaGlkZGVuVmFsdWU6ZGVmYXVsdFNlbGVjdGlvbi5saW5lSUQsXG4gICAgICAgICAgICAgICAgZW1wdHlDcmVhdGVzTmV3OnRydWUsXG4gICAgICAgICAgICAgICAgbm9uRW1wdHlSZXF1aXJlZDpmYWxzZVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMubGluZUF1dG8udmlzaWJsZUlucHV0LmRhdGEoJ3NldEJ5VXNlcicsIGZhbHNlKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIGxpbmVJbnB1dElkKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcyhUeXBlRGlzYW1iaWd1YXRpb25TdGVwLlNURVBfNF9VU0VSX0lOUFVUX0NMQVNTKVxuXG4gICAgICAgICAgICAvLyBjcmVhdGUgYSBoaWRkZW4gZm9ybSBmaWVsZCB0byBzdG9yZSB0aGUgc2VsZWN0ZWQgdmFsdWVcbiAgICAgICAgICAgIHRoaXMubGluZUF1dG8uaGlkZGVuSW5wdXQuYXR0cignaWQnLCAnZGlzYW1MaW5lJyArIHRoaXMudmlzaWJsZUluZGV4KVxuICAgICAgICAgICAgICAgIC5hdHRyKCduYW1lJywgJ2Rpc2FtTGluZScgKyB0aGlzLnZpc2libGVJbmRleClcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoVHlwZURpc2FtYmlndWF0aW9uU3RlcC5TVEVQXzRfUkVRVUlSRURfSU5QVVRfQ0xBU1MpO1xuXG4gICAgICAgICAgICAvLyBhdXRvLXNlbGVjdCB0aGUgbGluZSBuYW1lIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAvL2lmIChkZWZhdWx0U2VsZWN0aW9uLmxpbmVJRCkge1xuICAgICAgICAgICAgLy8gICAgLy8gc2VhcmNoIGZvciB0aGUgbGluZSBJRCBjb3JyZXNwb25kaW5nIHRvIHRoaXMgbmFtZS5cbiAgICAgICAgICAgICAgICAvLyBBVERhdGEuZXhpc3RpbmdMaW5lcyBpcyBvZiB0eXBlIHtpZDogbnVtYmVyOyBuOiBzdHJpbmc7fVtdXG4gICAgICAgICAgICAvLyAgICAoQVREYXRhLmV4aXN0aW5nTGluZXMgfHwgW10pLmZvckVhY2goKGxpbmU6IGFueSkgPT4geyAgLy8gVE9ETzogcG9zc2libGUgb3B0aW1pemF0aW9uIGhlcmUgLS0gbm8gbmVlZCBmb3IgbGluZWFyIHNlYXJjaFxuICAgICAgICAgICAgLy8gICAgICAgIGlmIChkZWZhdWx0U2VsZWN0aW9uLmxpbmVJRCA9PT0gbGluZS5pZCkge1xuICAgICAgICAgICAgLy8gICAgICAgICAgICBsaW5lTmFtZUlucHV0LnZhbChsaW5lLm4pO1xuICAgICAgICAgICAgLy8gICAgICAgICAgICBzZWxlY3RlZExpbmVJZElucHV0LnZhbChsaW5lLmlkLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgLy8gICAgICAgICAgICByZXR1cm4gZmFsc2U7IC8vIHN0b3AgbG9vcGluZ1xuICAgICAgICAgICAgLy8gICAgICAgIH1cbiAgICAgICAgICAgIC8vICAgIH0pO1xuICAgICAgICAgICAgLy99XG4gICAgICAgIH1cblxuXG4gICAgICAgIHN0YXRpYyBkaXNhbWJpZ3VhdGVBbkFzc2F5T3JMaW5lKGFzc2F5T3JMaW5lOiBzdHJpbmcsIGN1cnJlbnRJbmRleDogbnVtYmVyKTphbnkge1xuICAgICAgICAgICAgdmFyIHN0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uczogYW55LCBoaWdoZXN0OiBudW1iZXIsIGFzc2F5czogbnVtYmVyW107XG4gICAgICAgICAgICBzZWxlY3Rpb25zID0ge1xuICAgICAgICAgICAgICAgIGxpbmVJRDogMCxcbiAgICAgICAgICAgICAgICBhc3NheUlEOiAwXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaGlnaGVzdCA9IDA7XG4gICAgICAgICAgICAvLyBBVERhdGEuZXhpc3RpbmdBc3NheXMgaXMgdHlwZSB7W2luZGV4OiBzdHJpbmddOiBudW1iZXJbXX1cbiAgICAgICAgICAgIGFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1tFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRTdGVwLm1hc3RlclByb3RvY29sXSB8fCBbXTtcbiAgICAgICAgICAgIGFzc2F5cy5ldmVyeSgoaWQ6IG51bWJlciwgaTogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBBc3NheVJlY29yZCwgbGluZTogTGluZVJlY29yZCwgcHJvdG9jb2w6IGFueSwgbmFtZTogc3RyaW5nO1xuICAgICAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5T3JMaW5lLnRvTG93ZXJDYXNlKCkgPT09IG5hbWUudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZnVsbCBBc3NheSBuYW1lLCBldmVuIGNhc2UtaW5zZW5zaXRpdmUsIGlzIHRoZSBiZXN0IG1hdGNoXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7ICAvLyBkbyBub3QgbmVlZCB0byBjb250aW51ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuOCAmJiBhc3NheU9yTGluZSA9PT0gYXNzYXkubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBbiBleGFjdC1jYXNlIG1hdGNoIHdpdGggdGhlIEFzc2F5IG5hbWUgZnJhZ21lbnQgYWxvbmUgaXMgc2Vjb25kLWJlc3QuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjg7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNyAmJiBhc3NheS5uYW1lLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgd2hvbGUgc3RyaW5nIGluc2lkZSB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCBpcyBwcmV0dHkgZ29vZFxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC43O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjYgJiYgbGluZS5uYW1lLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgd2hvbGUgc3RyaW5nIGluc2lkZSB0aGUgb3JpZ2luYXRpbmcgTGluZSBuYW1lIGlzIGdvb2QgdG9vLlxuICAgICAgICAgICAgICAgICAgICAvLyBJdCBtZWFucyB0aGF0IHRoZSB1c2VyIG1heSBpbnRlbmQgdG8gcGFpciB3aXRoIHRoaXMgQXNzYXkgZXZlbiB0aG91Z2ggdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc2F5IG5hbWUgaXMgZGlmZmVyZW50LlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC42O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjQgJiZcbiAgICAgICAgICAgICAgICAgICAgKG5ldyBSZWdFeHAoJyhefFxcXFxXKScgKyBhc3NheS5uYW1lICsgJyhcXFxcV3wkKScsICdnJykpLnRlc3QoYXNzYXlPckxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIEFzc2F5IG5hbWUgZnJhZ21lbnQgd2l0aGluIHRoZSB3aG9sZSBzdHJpbmcsIGFzIGEgd2hvbGUgd29yZCwgaXMgb3VyXG4gICAgICAgICAgICAgICAgICAgIC8vIGxhc3Qgb3B0aW9uLlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC40O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjMgJiYgY3VycmVudEluZGV4ID09PSBpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGFsbCBlbHNlIGZhaWxzLCBjaG9vc2UgQXNzYXkgb2YgY3VycmVudCBpbmRleCBpbiBzb3J0ZWQgb3JkZXIuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjM7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gTm93IHdlIHJlcGVhdCB0aGUgcHJhY3RpY2UsIHNlcGFyYXRlbHksIGZvciB0aGUgTGluZSBwdWxsZG93bi5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwO1xuICAgICAgICAgICAgLy8gQVREYXRhLmV4aXN0aW5nTGluZXMgaXMgdHlwZSB7aWQ6IG51bWJlcjsgbjogc3RyaW5nO31bXVxuICAgICAgICAgICAgKEFURGF0YS5leGlzdGluZ0xpbmVzIHx8IFtdKS5ldmVyeSgobGluZTogYW55LCBpOiBudW1iZXIpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXlPckxpbmUgPT09IGxpbmUubikge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgTGluZSBuYW1lLCBjYXNlLXNlbnNpdGl2ZSwgaXMgdGhlIGJlc3QgbWF0Y2hcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7ICAvLyBkbyBub3QgbmVlZCB0byBjb250aW51ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuOCAmJiBhc3NheU9yTGluZS50b0xvd2VyQ2FzZSgpID09PSBsaW5lLm4udG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgc2FtZSB0aGluZyBjYXNlLWluc2Vuc2l0aXZlIGlzIHNlY29uZCBiZXN0LlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC44O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC43ICYmIGFzc2F5T3JMaW5lLmluZGV4T2YobGluZS5uKSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIExpbmUgbmFtZSB3aXRoaW4gdGhlIHN0cmluZyBpcyBvZGQsIGJ1dCBnb29kLlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC43O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC42ICYmIGxpbmUubi5pbmRleE9mKGFzc2F5T3JMaW5lKSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIHN0cmluZyB3aXRoaW4gdGhlIExpbmUgbmFtZSBpcyBhbHNvIGdvb2QuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjY7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjUgJiYgY3VycmVudEluZGV4ID09PSBpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFnYWluLCBpZiBhbGwgZWxzZSBmYWlscywganVzdCBjaG9vc2UgdGhlIExpbmUgdGhhdCBtYXRjaGVzIHRoZSBjdXJyZW50IGluZGV4XG4gICAgICAgICAgICAgICAgICAgIC8vIGluIHNvcnRlZCBvcmRlciwgaW4gYSBsb29wLlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC41O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gc2VsZWN0aW9ucztcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgQXNzYXlEaXNhbWJpZ3VhdGlvblJvdyBleHRlbmRzIExpbmVEaXNhbWJpZ3VhdGlvblJvdyB7XG5cbiAgICAgICAgc2VsZWN0QXNzYXlKUUVsZW1lbnQ6SlF1ZXJ5O1xuXG4gICAgICAgIGJ1aWxkKGJvZHk6SFRNTFRhYmxlRWxlbWVudCwgbmFtZSwgaSkge1xuICAgICAgICAgICAgdmFyIGRlZmF1bHRTZWw6YW55LCBjZWxsOkpRdWVyeSwgYVNlbGVjdDogSlF1ZXJ5O1xuXG4gICAgICAgICAgICBkZWZhdWx0U2VsID0gTGluZURpc2FtYmlndWF0aW9uUm93LmRpc2FtYmlndWF0ZUFuQXNzYXlPckxpbmUobmFtZSwgaSk7XG5cbiAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICAvLyBTZXQgdXAgYSBjb21ibyBib3ggZm9yIHNlbGVjdGluZyB0aGUgYXNzYXlcbiAgICAgICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgICAgICBjZWxsID0gJCh0aGlzLnJvdy5pbnNlcnRDZWxsKCkpLmNzcygndGV4dC1hbGlnbicsICdsZWZ0Jyk7XG4gICAgICAgICAgICBhU2VsZWN0ID0gJCgnPHNlbGVjdD4nKS5hcHBlbmRUbyhjZWxsKVxuICAgICAgICAgICAgICAgIC5kYXRhKHsgJ3NldEJ5VXNlcic6IGZhbHNlIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoJ25hbWUnLCAnZGlzYW1Bc3NheScgKyBpKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsICdkaXNhbUFzc2F5JyArIGkpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1VTRVJfSU5QVVRfQ0xBU1MpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuU1RFUF80X1JFUVVJUkVEX0lOUFVUX0NMQVNTKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QXNzYXlKUUVsZW1lbnQgPSBhU2VsZWN0O1xuICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KCcoQ3JlYXRlIE5ldyBBc3NheSknKS5hcHBlbmRUbyhhU2VsZWN0KS52YWwoJ25hbWVkX29yX25ldycpXG4gICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgIWRlZmF1bHRTZWwuYXNzYXlJRCk7XG5cbiAgICAgICAgICAgIC8vIGFkZCBvcHRpb25zIHRvIHRoZSBhc3NheSBjb21ibyBib3hcbiAgICAgICAgICAgIChBVERhdGEuZXhpc3RpbmdBc3NheXNbRUREVGFibGVJbXBvcnQuc2VsZWN0TWFqb3JLaW5kU3RlcC5tYXN0ZXJQcm90b2NvbF0gfHwgW10pLmZvckVhY2goKGlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IEFzc2F5UmVjb3JkLCBsaW5lOiBMaW5lUmVjb3JkLCBwcm90b2NvbDogYW55O1xuICAgICAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJykpXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhhU2VsZWN0KS52YWwoaWQudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgZGVmYXVsdFNlbC5hc3NheUlEID09PSBpZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gYSBzcGFuIHRvIGNvbnRhaW4gdGhlIHRleHQgbGFiZWwgZm9yIHRoZSBMaW5lIHB1bGxkb3duLCBhbmQgdGhlIHB1bGxkb3duIGl0c2VsZlxuICAgICAgICAgICAgY2VsbCA9ICQoJzxzcGFuPicpLnRleHQoJ2ZvciBMaW5lOiAnKS50b2dnbGVDbGFzcygnb2ZmJywgISFkZWZhdWx0U2VsLmFzc2F5SUQpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuXG4gICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgLy8gU2V0IHVwIGFuIGF1dG9jb21wbGV0ZSBmb3IgdGhlIGxpbmUgKGF1dG9jb21wbGV0ZSBpcyBpbXBvcnRhbnQgZm9yXG4gICAgICAgICAgICAvLyBlZmZpY2llbmN5IGZvciBzdHVkaWVzIHdpdGggbWFueSBsaW5lcykuXG4gICAgICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAgICAgdGhpcy5hcHBlbmRMaW5lQXV0b3NlbGVjdChjZWxsLCBkZWZhdWx0U2VsKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyBUaGUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGV2ZXJ5dGhpbmcgaW4gdGhlIFwiU3RlcCA0XCIgYm94IHRoYXQgeW91IHNlZSBvbiB0aGUgZGF0YSBpbXBvcnQgcGFnZS5cbiAgICAvLyBBZ2dyZWdhdGVzICYgZGlzcGxheXMgYSB1c2VyLXJlbGV2YW50L2FjdGlvbmFibGUgc3VtbWFyeSBvZiB0aGUgaW1wb3J0IHByb2Nlc3MgcHJpb3IgdG8gZmluYWxcbiAgICAvLyBzdWJtaXNzaW9uLlxuICAgIGV4cG9ydCBjbGFzcyBSZXZpZXdTdGVwIHtcbiAgICAgICAgc3RlcDE6IFNlbGVjdE1ham9yS2luZFN0ZXA7XG4gICAgICAgIHN0ZXAyOiBSYXdJbnB1dFN0ZXA7XG4gICAgICAgIHN0ZXAzOiBJZGVudGlmeVN0cnVjdHVyZXNTdGVwO1xuICAgICAgICBzdGVwNDogVHlwZURpc2FtYmlndWF0aW9uU3RlcDtcbiAgICAgICAgcHJldlN0ZXBzOiBJbXBvcnRTdGVwW107XG4gICAgICAgIG5leHRTdGVwQ2FsbGJhY2s6IGFueTtcblxuICAgICAgICB3YXJuaW5nTWVzc2FnZXM6IEltcG9ydE1lc3NhZ2VbXVtdO1xuICAgICAgICB3YXJuaW5nSW5wdXRzOiBKUXVlcnlbXVtdO1xuXG4gICAgICAgIGVycm9yTWVzc2FnZXM6IEltcG9ydE1lc3NhZ2VbXVtdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKHN0ZXAxOiBTZWxlY3RNYWpvcktpbmRTdGVwLCBzdGVwMjpSYXdJbnB1dFN0ZXAsXG4gICAgICAgICAgICAgICAgICAgIHN0ZXAzOiBJZGVudGlmeVN0cnVjdHVyZXNTdGVwLFxuICAgICAgICAgICAgICAgICAgICBzdGVwNDogVHlwZURpc2FtYmlndWF0aW9uU3RlcCwgbmV4dFN0ZXBDYWxsYmFjazogYW55KSB7XG4gICAgICAgICAgICB0aGlzLnN0ZXAxID0gc3RlcDE7XG4gICAgICAgICAgICB0aGlzLnN0ZXAyID0gc3RlcDI7XG4gICAgICAgICAgICB0aGlzLnN0ZXAzID0gc3RlcDM7XG4gICAgICAgICAgICB0aGlzLnN0ZXA0ID0gc3RlcDQ7XG4gICAgICAgICAgICB0aGlzLnByZXZTdGVwcyA9IFtzdGVwMSwgc3RlcDIsIHN0ZXAzLCBzdGVwNF07XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2sgPSBuZXh0U3RlcENhbGxiYWNrO1xuXG4gICAgICAgICAgICB0aGlzLmVycm9yTWVzc2FnZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMud2FybmluZ01lc3NhZ2VzID0gW107XG4gICAgICAgICAgICB0aGlzLndhcm5pbmdJbnB1dHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJldlN0ZXBzLmZvckVhY2goKHN0ZXA6SW1wb3J0U3RlcCwgc3RlcEluZGV4Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy53YXJuaW5nSW5wdXRzW3N0ZXBJbmRleF0gPVtdO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBwcmV2aW91c1N0ZXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gcmUtcXVlcnkgZWFjaCBwcmVjZWRpbmcgc3RlcCB0byBnZXQgYW55IGVycm9yTWVzc2FnZXMgb3Igd2FybmluZ01lc3NhZ2VzIHRoYXQgc2hvdWxkIGJlIGRpc3BsYXllZFxuICAgICAgICAgICAgLy8gdG8gdGhlIHVzZXJcbiAgICAgICAgICAgIHRoaXMucHJldlN0ZXBzLmZvckVhY2goKHByZXZTdGVwLCBzdGVwSW5kZXg6bnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy53YXJuaW5nTWVzc2FnZXNbc3RlcEluZGV4XSA9IFtdLmNvbmNhdChwcmV2U3RlcC5nZXRVc2VyV2FybmluZ3MoKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VzW3N0ZXBJbmRleF0gPSBbXS5jb25jYXQocHJldlN0ZXAuZ2V0VXNlckVycm9ycygpKTtcbiAgICAgICAgICAgICAgICB0aGlzLndhcm5pbmdJbnB1dHNbc3RlcEluZGV4XSA9W107XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gYnVpbGQgdXAgYSBzaG9ydCBzdW1tYXJ5IHNlY3Rpb24gdG8gZGVzY3JpYmUgdGhlIChwb3RlbnRpYWxseSBsYXJnZSkgbnVtYmVyIG9mXG4gICAgICAgICAgICAvLyBlcnJvcnMgLyB3YXJuaW5ncywgYXMgd2VsbCBhcyB0byBnaXZlIHNvbWUgZ2VuZXJhbGx5IGhlbHBmdWwgc3VtbWFyeSAoZS5nLiBjb3VudHMpLlxuICAgICAgICAgICAgLy8gZm9yIHN0YXJ0ZXJzLCB3ZSdsbCBvbmx5IHNob3cgdGhlIHN1bW1hcnkgc2VjdGlvbiB3aXRoIGEgbWluaW1hbCBvbmUtc2VudGVuY2VcbiAgICAgICAgICAgIC8vIHRoYXQgaGFzIGRpcmVjdGlvbnMsIHRob3VnaCBjbGVhcmx5IG1vcmUgc3R1ZmYgY291bGQgYmUgaGVscGZ1bCBsYXRlci5cbiAgICAgICAgICAgIHZhciB0b3RhbEVycm9yc0NvdW50ID0gdGhpcy5nZXRNZXNzYWdlQ291bnQodGhpcy5lcnJvck1lc3NhZ2VzKTtcbiAgICAgICAgICAgIHZhciB0b3RhbFdhcm5pbmdzQ291bnQgPSB0aGlzLmdldE1lc3NhZ2VDb3VudCh0aGlzLndhcm5pbmdNZXNzYWdlcyk7XG4gICAgICAgICAgICB2YXIgdG90YWxNZXNzYWdlc0NvdW50ID0gdG90YWxFcnJvcnNDb3VudCArIHRvdGFsV2FybmluZ3NDb3VudDtcblxuICAgICAgICAgICAgdmFyIHN1bW1hcnlEaXY9JCgnI3N1bW1hcnlDb250ZW50RGl2Jyk7XG4gICAgICAgICAgICBzdW1tYXJ5RGl2LmVtcHR5KCk7XG5cbiAgICAgICAgICAgIHZhciBoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHMgPSB0aGlzLmFyZVByZXZTdGVwUmVxdWlyZWRJbnB1dHNQcm92aWRlZCgpO1xuXG4gICAgICAgICAgICB2YXIgc3VtbWFyeVdyYXBwZXJEaXYgPSAkKCcjcmV2aWV3U3VtbWFyeVNlY3Rpb24nKTtcbiAgICAgICAgICAgIGlmIChoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHMgJiYgIXRvdGFsTWVzc2FnZXNDb3VudCkge1xuICAgICAgICAgICAgICAgICQoJzxwPicpLnRleHQoJ05vIGVycm9ycyBvciB3YXJuaW5ncyEgR28gYWhlYWQgYW5kIGltcG9ydCEnKS5hcHBlbmRUbyhzdW1tYXJ5RGl2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICQoJyNjb21wbGV0ZUFsbFN0ZXBzRmlyc3RMYWJlbCcpLnRvZ2dsZUNsYXNzKCdvZmYnLCBoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHMpO1xuICAgICAgICAgICAgJCgnI3N1Ym1pdEZvckltcG9ydCcpLnRvZ2dsZUNsYXNzKCdvZmYnLCAhaGFzUmVxdWlyZWRJbml0aWFsSW5wdXRzKTtcblxuICAgICAgICAgICAgLy8gcmVtYWtlIGVycm9yIC8gd2FybmluZyBzdWJzZWN0aW9ucyBiYXNlZCBvbiBpbnB1dCBmcm9tIHByZXZpb3VzIHN0ZXBzXG4gICAgICAgICAgICB2YXIgZXJyb3JzV3JhcHBlckRpdiA9ICQoJyNyZXZpZXdFcnJvcnNTZWN0aW9uJyk7XG4gICAgICAgICAgICB2YXIgZXJyb3JzRGl2ID0gJCgnI3Jldmlld0Vycm9yc0NvbnRlbnREaXYnKTtcbiAgICAgICAgICAgIHRoaXMucmVtYWtlRXJyb3JPcldhcm5pbmdTZWN0aW9uKGVycm9yc1dyYXBwZXJEaXYsIGVycm9yc0RpdiwgdGhpcy5lcnJvck1lc3NhZ2VzLFxuICAgICAgICAgICAgICAgIHRvdGFsRXJyb3JzQ291bnQsIFwiZXJyb3JNZXNzYWdlXCIsIFtdLCBmYWxzZSk7XG5cbiAgICAgICAgICAgIHZhciB3YXJuaW5nc1dyYXBwZXJEaXYgPSAkKCcjcmV2aWV3V2FybmluZ3NTZWN0aW9uJyk7XG4gICAgICAgICAgICB2YXIgd2FybmluZ3NEaXYgPSAkKCcjcmV2aWV3V2FybmluZ3NDb250ZW50RGl2Jyk7XG4gICAgICAgICAgICB0aGlzLnJlbWFrZUVycm9yT3JXYXJuaW5nU2VjdGlvbih3YXJuaW5nc1dyYXBwZXJEaXYsIHdhcm5pbmdzRGl2LCB0aGlzLndhcm5pbmdNZXNzYWdlcyxcbiAgICAgICAgICAgICAgICB0b3RhbFdhcm5pbmdzQ291bnQsIFwid2FybmluZ01lc3NhZ2VcIiwgdGhpcy53YXJuaW5nSW5wdXRzLCB0cnVlKTtcblxuICAgICAgICAgICAgdGhpcy51cGRhdGVTdWJtaXRFbmFibGVkKCk7XG4gICAgICAgIH1cblxuICAgICAgICBhcmVQcmV2U3RlcFJlcXVpcmVkSW5wdXRzUHJvdmlkZWQoKTpib29sZWFuIHtcbiAgICAgICAgICAgIGZvcihsZXQgcHJldlN0ZXAgb2YgdGhpcy5wcmV2U3RlcHMpIHtcbiAgICAgICAgICAgICAgICBpZighcHJldlN0ZXAucmVxdWlyZWRJbnB1dHNQcm92aWRlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVuYWJsZSAvIGRpc2FibGUgdGhlIHN1Ym1pdCBidXR0b24sIGRlcGVuZGluZyBvbiB3aGV0aGVyIHN1Ym1pc3Npb24gaXMgZXhwZWN0ZWRcbiAgICAgICAgLy8gdG8gc3VjY2VlZCBiYXNlZCBvbiBkYXRhIGF2YWlsYWJsZSBpbiB0aGUgVUlcbiAgICAgICAgdXBkYXRlU3VibWl0RW5hYmxlZCgpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGFsbFByZXZTdGVwSW5wdXRzUHJvdmlkZWQgPSB0aGlzLmFyZVByZXZTdGVwUmVxdWlyZWRJbnB1dHNQcm92aWRlZCgpO1xuICAgICAgICAgICAgdmFyIGFsbFdhcm5pbmdzQWNrbm93bGVkZ2VkID0gdGhpcy5hcmVBbGxXYXJuaW5nc0Fja25vd2xlZGdlZCgpO1xuICAgICAgICAgICAgdmFyIHRvdGFsRXJyb3JzQ291bnQgPSB0aGlzLmdldE1lc3NhZ2VDb3VudCh0aGlzLmVycm9yTWVzc2FnZXMpO1xuXG4gICAgICAgICAgICB2YXIgc3VibWl0QnV0dG9uID0gJCgnI3N1Ym1pdEZvckltcG9ydCcpO1xuICAgICAgICAgICAgdmFyIHdhc0Rpc2FibGVkID0gc3VibWl0QnV0dG9uLnByb3AoJ2Rpc2FibGVkJyk7XG5cbiAgICAgICAgICAgIHZhciBkaXNhYmxlU3VibWl0ID0gIShhbGxQcmV2U3RlcElucHV0c1Byb3ZpZGVkICYmICh0b3RhbEVycm9yc0NvdW50ID09PSAwKSAmJiBhbGxXYXJuaW5nc0Fja25vd2xlZGdlZCk7XG4gICAgICAgICAgICBzdWJtaXRCdXR0b24ucHJvcCgnZGlzYWJsZWQnLCBkaXNhYmxlU3VibWl0KTtcblxuICAgICAgICAgICAgLy8gVE9ETzogcmUtZW5hYmxlIG1lIGFmdGVyIHVwZ3JhZGluZyB0byBKUXVlcnktVUkgMS4xMitcbiAgICAgICAgICAgIC8vIGJyaWVmbHkgaGlnaGxpZ2h0IHRoZSBidXR0b24gaWYgaXQgd2FzIGVuYWJsZWQvZGlzYWJsZWRcbiAgICAgICAgICAgIC8vIGlmKCh3YXNEaXNhYmxlZCAhPSBkaXNhYmxlU3VibWl0KSAmJiBhbGxQcmV2U3RlcElucHV0c1Byb3ZpZGVkKSB7XG4gICAgICAgICAgICAvLyAgICAgc3VibWl0QnV0dG9uLmVmZmVjdChcImJvdW5jZVwiKTtcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGFyZUFsbFdhcm5pbmdzQWNrbm93bGVkZ2VkKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgZm9yKGxldCBzdGVwV2FybmluZ0lucHV0cyBvZiB0aGlzLndhcm5pbmdJbnB1dHMpIHtcbiAgICAgICAgICAgICAgICBmb3IobGV0IHdhcm5pbmdDaGtieCBvZiBzdGVwV2FybmluZ0lucHV0cykge1xuICAgICAgICAgICAgICAgICAgICBpZighd2FybmluZ0Noa2J4LmlzKCc6Y2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldE1lc3NhZ2VDb3VudChtZXNzYWdlc0J5U3RlcDpJbXBvcnRNZXNzYWdlW11bXSk6bnVtYmVyIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlQ291bnQgPSAwO1xuICAgICAgICAgICAgZm9yIChsZXQgc3RlcE1lc3NhZ2VzIG9mIG1lc3NhZ2VzQnlTdGVwKSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZUNvdW50ICs9IHN0ZXBNZXNzYWdlcy5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWVzc2FnZUNvdW50O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVtYWtlRXJyb3JPcldhcm5pbmdTZWN0aW9uKHdyYXBwZXJEaXZTZWxlY3RvcjpKUXVlcnksIGNvbnRlbnREaXZTZWxlY3RvcjpKUXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VyTWVzc2FnZXM6SW1wb3J0TWVzc2FnZVtdW10sIG1lc3NhZ2VDb3VudDpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlQ3NzQ2xhc3M6c3RyaW5nLCBpbnB1dHM6SlF1ZXJ5W11bXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZUNoZWNrYm94ZXM6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgICAgICB2YXIgaGFzUmVxdWlyZWRJbml0aWFsSW5wdXRzLCB0b2dnbGVPZmYsIHNob3dBY2tub3dsZWRnZUFsbEJ0bjogYm9vbGVhbiwgdGFibGUsIHRhYmxlQm9keSxcbiAgICAgICAgICAgICAgICBoZWFkZXIsIGhlYWRlckNlbGw7XG4gICAgICAgICAgICBjb250ZW50RGl2U2VsZWN0b3IuZW1wdHkoKTtcbiAgICAgICAgICAgIGhhc1JlcXVpcmVkSW5pdGlhbElucHV0cyA9IHRoaXMuYXJlUHJldlN0ZXBSZXF1aXJlZElucHV0c1Byb3ZpZGVkKCk7XG4gICAgICAgICAgICB0b2dnbGVPZmYgPSAobWVzc2FnZUNvdW50ID09PSAwKSB8fCAhaGFzUmVxdWlyZWRJbml0aWFsSW5wdXRzO1xuICAgICAgICAgICAgd3JhcHBlckRpdlNlbGVjdG9yLnRvZ2dsZUNsYXNzKCdvZmYnLCB0b2dnbGVPZmYpO1xuXG4gICAgICAgICAgICAvLyBjbGVhciBhbGwgdGhlIHN1YmFycmF5cyBjb250YWluaW5nIGlucHV0IGNvbnRyb2xzIGZvciBwcmlvciBzdGVwc1xuICAgICAgICAgICAgLy8gVE9ETzogYXMgYSBmdXR1cmUgZW5oYW5jZW1lbnQsIHdlIGNvdWxkIGtlZXAgdHJhY2sgb2Ygd2hpY2ggYXJlIGFscmVhZHkgYWNrbm93bGVkZ2VkXG4gICAgICAgICAgICAvLyBhbmQga2VlcCB0aGVtIGNoZWNrZWRcbiAgICAgICAgICAgIGZvciAobGV0IHN0ZXBNc2dJbnB1dHMgb2YgaW5wdXRzKSB7XG4gICAgICAgICAgICAgICAgc3RlcE1zZ0lucHV0cyA9IFtdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBhbGwgdGhlIGlucHV0cyBmcm9tIHRoZSBET01cbiAgICAgICAgICAgIGNvbnRlbnREaXZTZWxlY3Rvci5lbXB0eSgpO1xuXG4gICAgICAgICAgICBpZiAoKCFoYXNSZXF1aXJlZEluaXRpYWxJbnB1dHMpIHx8ICghbWVzc2FnZUNvdW50KSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgc2hvd2luZyBjaGVja2JveGVzIHRvIGFja25vd2xlZGdlIG1lc3NhZ2VzLCBhZGQgYSBidXR0b24gdG8gYWsgYWxsIG9mIHRoZW0gYWZ0ZXJcbiAgICAgICAgICAgIC8vIGEgcmVhc29uYWJsZSBudW1iZXJcbiAgICAgICAgICAgIHNob3dBY2tub3dsZWRnZUFsbEJ0biA9IGNyZWF0ZUNoZWNrYm94ZXMgJiYgKG1lc3NhZ2VDb3VudCA+PSA1KTtcbiAgICAgICAgICAgICBpZihzaG93QWNrbm93bGVkZ2VBbGxCdG4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEFja25vd2xlZGdlQWxsQnV0dG9uKGNvbnRlbnREaXZTZWxlY3Rvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRhYmxlID0gJCgnPHRhYmxlPicpLmFwcGVuZFRvKGNvbnRlbnREaXZTZWxlY3Rvcik7XG5cbiAgICAgICAgICAgIC8vIGlmIHdlJ2xsIGJlIGFkZGluZyBjaGVja2JveGVzIHRvIHRoZSB0YWJsZSwgc2V0IGhlYWRlcnMgdG8gZGVzY3JpYmUgd2hhdCB0aGV5J3JlIGZvclxuICAgICAgICAgICAgaWYgKGNyZWF0ZUNoZWNrYm94ZXMpIHtcbiAgICAgICAgICAgICAgICBoZWFkZXIgPSAkKCc8dGhlYWQ+JykuYXBwZW5kVG8odGFibGUpO1xuICAgICAgICAgICAgICAgIGhlYWRlckNlbGwgPSAkKCc8dGg+JykudGV4dCgnV2FybmluZycpLmFwcGVuZFRvKGhlYWRlcik7XG4gICAgICAgICAgICAgICAgaGVhZGVyQ2VsbCA9ICQoJzx0aD4nKS50ZXh0KCdBY2tub3dsZWRnZScpLmFwcGVuZFRvKGhlYWRlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0YWJsZUJvZHkgPSAkKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuXG4gICAgICAgICAgICB1c2VyTWVzc2FnZXMuZm9yRWFjaCgoc3RlcE1lc3NhZ2VzOkltcG9ydE1lc3NhZ2VbXSwgc3RlcEluZGV4Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgc3RlcE1lc3NhZ2VzLmZvckVhY2goKG1lc3NhZ2U6SW1wb3J0TWVzc2FnZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByb3csIGNlbGwsIGRpdiwgc3BhbiwgbXNnU3BhbiwgY2hlY2tib3g7XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9ICQoJzx0cj4nKS5hcHBlbmRUbyh0YWJsZUJvZHkpO1xuICAgICAgICAgICAgICAgICAgICBjZWxsID0gJCgnPHRkPicpLmNzcygndGV4dC1hbGlnbicsICdsZWZ0JykuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgICAgICAgICAgICAgZGl2ID0gICQoJzxkaXY+JykuYXR0cignY2xhc3MnLCBtZXNzYWdlQ3NzQ2xhc3MpLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgICAgICBzcGFuID0gJCgnPHNwYW4gY2xhc3M9XCJ3YXJuaW5nU3RlcExhYmVsXCI+JykudGV4dChcIlN0ZXAgXCIgKyAoc3RlcEluZGV4ICsgMSkpLmFwcGVuZFRvKGRpdik7XG4gICAgICAgICAgICAgICAgICAgIG1zZ1NwYW4gPSAkKCc8c3Bhbj4nKS50ZXh0KFwiOiBcIiArIG1lc3NhZ2UubWVzc2FnZSkuYXBwZW5kVG8oZGl2KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNyZWF0ZUNoZWNrYm94ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjZWxsID0gJCgnPHRkPicpLmNzcygndGV4dC1hbGlnbicsICdjZW50ZXInKS50b2dnbGVDbGFzcygnZXJyb3JNZXNzYWdlJywgIWNyZWF0ZUNoZWNrYm94ZXMpLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgICAgICAgICAgICAgY2hlY2tib3ggPSAkKCc8aW5wdXQgdHlwZT1cImNoZWNrYm94XCI+JykuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMud2FybmluZ0lucHV0c1tzdGVwSW5kZXhdLnB1c2goY2hlY2tib3gpO1xuICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5vbignY2xpY2snLCBudWxsLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnZGl2JzogZGl2LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94JzogY2hlY2tib3hcbiAgICAgICAgICAgICAgICAgICAgfSwgKGV2OiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZGl2LCBjaGVja2JveDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpdiA9IGV2LmRhdGEuZGl2O1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3ggPSBldi5kYXRhLmNoZWNrYm94O1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51c2VyU2VsZWN0ZWRXYXJuaW5nQnV0dG9uKGRpdiwgY2hlY2tib3gpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCB0aGlzKVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGlmIHNob3dpbmcgYW4gJ0Fja25vd2xlZGdlIEFsbCcgYnV0dG9uLCByZXBlYXQgaXQgYXQgdGhlIGJvdHRvbSBvZiB0aGUgbGlzdFxuICAgICAgICAgICAgaWYoc2hvd0Fja25vd2xlZGdlQWxsQnRuKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRBY2tub3dsZWRnZUFsbEJ1dHRvbihjb250ZW50RGl2U2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYWRkQWNrbm93bGVkZ2VBbGxCdXR0b24oY29udGVudERpdlNlbGVjdG9yOkpRdWVyeSk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGJ1dHRvbiA9ICQoJzxpbnB1dCB0eXBlPVwiYnV0dG9uXCI+JylcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoXCJhY2tub3dsZWRnZUFsbEJ1dHRvblwiKVxuICAgICAgICAgICAgICAgIC52YWwoJ0Fja25vd2xlZGdlICBBbGwnKVxuICAgICAgICAgICAgICAgIC5jbGljayggdGhpcy51c2VyU2VsZWN0ZWRBY2tub3dsZWRnZUFsbEJ1dHRvbi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIGJ1dHRvbi5hcHBlbmRUbyhjb250ZW50RGl2U2VsZWN0b3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXNlclNlbGVjdGVkV2FybmluZ0J1dHRvbihkaXYsIGNoZWNrYm94KTp2b2lkIHtcblxuICAgICAgICAgICAgLy8gbWFrZSB0aGUgbWVzc2FnZSB0ZXh0IGFwcGVhciBkaXNhYmxlZCAobm90ZSBpdCdzIHB1cnBvc2VmdWxseSBkaXN0aW5jdFxuICAgICAgICAgICAgLy8gZnJvbSB0aGUgY2hlY2tib3ggdG8gYWxsb3cgZmxleGliaWxpdHkgaW4gZXhwYW5kaW5nIHRhYmxlIGNvbnRlbnRzKVxuICAgICAgICAgICAgZGl2LnRvZ2dsZUNsYXNzKCdkaXNhYmxlZFRleHRMYWJlbCcsIGNoZWNrYm94LmlzKCc6Y2hlY2tlZCcpKTtcblxuICAgICAgICAgICAgLy91cGRhdGUgdGhlIHN1Ym1pdCBidXR0b25cbiAgICAgICAgICAgIHRoaXMudXBkYXRlU3VibWl0RW5hYmxlZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXNlclNlbGVjdGVkQWNrbm93bGVkZ2VBbGxCdXR0b24oKTp2b2lkIHtcbiAgICAgICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgYWxsIG9mIHRoZSBib3hlcyBhcmUgYWxyZWFkeSBjaGVja2VkXG4gICAgICAgICAgICB2YXIgYWxsU2VsZWN0ZWQ6Ym9vbGVhbiA9IHRydWU7XG4gICAgICAgICAgICBmb3IgKGxldCBzdGVwQ2hlY2tib3hlcyBvZiB0aGlzLndhcm5pbmdJbnB1dHMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBjaGVja2JveCBvZiBzdGVwQ2hlY2tib3hlcykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNoZWNrYm94LmlzKCc6Y2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhbGxTZWxlY3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBjaGVjayBvciB1bmNoZWNrIGFsbCBvZiB0aGUgYm94ZXMgKHNvbWUgY2hlY2tlZCB3aWxsIHJlc3VsdCBpbiBhbGwgYmVpbmcgY2hlY2tlZClcbiAgICAgICAgICAgIGZvciAobGV0IHN0ZXBDaGVja2JveGVzIG9mIHRoaXMud2FybmluZ0lucHV0cykge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGNoZWNrYm94IG9mIHN0ZXBDaGVja2JveGVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnLCAhYWxsU2VsZWN0ZWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy51cGRhdGVTdWJtaXRFbmFibGVkKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuJCh3aW5kb3cpLm9uKCdsb2FkJywgZnVuY3Rpb24oKSB7XG4gICAgRUREVGFibGVJbXBvcnQub25XaW5kb3dMb2FkKCk7XG59KTtcbiJdfQ==