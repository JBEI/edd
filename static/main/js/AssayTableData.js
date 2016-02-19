// Compiled to JS on: Fri Feb 19 2016 15:04:53  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
// This module encapsulates all the custom code for the data import page.
// It consists primarily of a series of classes, each corresponding to a step in the import process,
// with a corresponding chunk of UI on the import page.
// Each class pulls data from one or more previous steps, does some internal processing,
// then triggers a callback function, announcing the availability of its own new data.
// The callback function triggers the instance of the next step.
var EDDTableImport;
(function (EDDTableImport) {
    'use strict';
    // As soon as the window load signal is sent, call back to the server for the set of reference records
    // that will be used to disambiguate labels in imported data.
    function onWindowLoad() {
        var atdata_url = "/study/" + EDDData.currentStudyID + "/assaydata";
        $('.disclose').find('a.discloseLink').on('click', EDDTableImport.disclose);
        // Populate ATData and EDDData objects via AJAX calls
        jQuery.ajax(atdata_url, {
            "success": function (data) {
                ATData = data.ATData;
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
        // Allocate one instance of each step, providing references to the previous steps as needed.
        var a = new SelectMajorKindStep(EDDTableImport.selectMajorKindCallback);
        var b = new RawInputStep(a, EDDTableImport.rawInputCallback);
        var c = new IdentifyStructuresStep(a, b, EDDTableImport.identifyStructuresCallback);
        var d = new TypeDisambiguationStep(a, c, EDDTableImport.typeDisambiguationCallback);
        EDDTableImport.selectMajorKindStep = a;
        EDDTableImport.rawInputStep = b;
        EDDTableImport.identifyStructuresStep = c;
        EDDTableImport.typeDisambiguationStep = d;
        // Wire up the function that submits the page
        $('#submitForImport').on('click', EDDTableImport.submitForImport);
        // We need to manually trigger this, after all our steps are constructed.
        // This will cascade calls through the rest of the steps and configure them too.
        a.reconfigure();
    }
    EDDTableImport.onReferenceRecordsLoad = onReferenceRecordsLoad;
    // This is called by our instance of selectMajorKindStep to announce changes.
    function selectMajorKindCallback() {
        // This is a bit of a hack.  We want to change the pulldown settings in Step 3 if the mode in Step 1 is changed,
        // but leave the pulldown alone otherwise (including when Step 2 announces its own changes.)
        // TODO: Make Step 3 track this with an internal variable.
        if (EDDTableImport.selectMajorKindStep.interpretationMode == 'mdv') {
            // A default set of pulldown settings for this mode
            EDDTableImport.identifyStructuresStep.pulldownSettings = [TypeEnum.Assay_Line_Names, TypeEnum.Metabolite_Name];
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
        //        var parsedSets = EDDTableImport.identifyStructuresStep.parsedSets;
        var resolvedSets = EDDTableImport.typeDisambiguationStep.createSetsForSubmission();
        // if the debug area is there, set its value to JSON of parsed sets
        //        $('#jsondebugarea').val(JSON.stringify(resolvedSets));
    }
    EDDTableImport.typeDisambiguationCallback = typeDisambiguationCallback;
    // When the submit button is pushed, fetch the most recent record sets from our IdentifyStructuresStep instance,
    // and embed them in the hidden form field that will be submitted to the server.
    // Note that this is not all that the server needs, in order to successfully process an import.
    // It also reads other form elements from the page, created by SelectMajorKindStep and TypeDisambiguationStep.
    function submitForImport() {
        var json;
        var resolvedSets = EDDTableImport.typeDisambiguationStep.createSetsForSubmission();
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
    // The class responsible for everything in the "Step 1" box that you see on the data import page.
    // Here we provide UI for selecting the major kind of import, and the Protocol that the data should be stored under.
    // These choices affect the behavior of all subsequent steps.
    var SelectMajorKindStep = (function () {
        function SelectMajorKindStep(nextStepCallback) {
            this.masterProtocol = 0;
            this.interpretationMode = null; // We rely on a separate call to reconfigure() to set this properly.
            this.inputRefreshTimerID = null;
            this.nextStepCallback = nextStepCallback;
            var reProcessOnChange;
            reProcessOnChange = ['#stdlayout', '#trlayout', '#prlayout', '#mdvlayout', '#biolectorlayout'];
            // This is rather a lot of callbacks, but we need to make sure we're
            // tracking the minimum number of elements with this call, since the
            // function called has such strong effects on the rest of the page.
            // For example, a user should be free to change "merge" to "replace" without having
            // their edits in Step 2 erased.
            $("#masterProtocol").change(this.reconfigure.bind(this));
            // Using "change" for these because it's more efficient AND because it works around an
            // irritating Chrome inconsistency
            // For some of these, changing them shouldn't actually affect processing until we implement
            // an overwrite-checking feature or something similar
            $(reProcessOnChange.join(',')).on('click', this.queueReconfigure.bind(this));
        }
        // Start a timer to wait before calling the reconfigure routine.
        // This way we condense multiple possible events from the radio buttons and/or pulldown into one.
        SelectMajorKindStep.prototype.queueReconfigure = function () {
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }
            this.inputRefreshTimerID = setTimeout(this.reconfigure.bind(this), 5);
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
            // Find every input element of type 'radio' with the name attribute of 'datalayout' that's checked.
            // Should return 0 or 1 elements.
            var modeRadio = $("input[type='radio'][name='datalayout']:checked");
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
            var protocolIn = $('#masterProtocol');
            var p = parseInt(protocolIn.val(), 10);
            if (this.masterProtocol === p) {
                return false;
            }
            this.masterProtocol = p;
            return true;
        };
        return SelectMajorKindStep;
    })();
    EDDTableImport.SelectMajorKindStep = SelectMajorKindStep;
    // The class responsible for everything in the "Step 2" box that you see on the data import page.
    // It needs to parse the raw data from typing or pasting in the input box, or a dragged-in file,
    // into a null-padded rectangular grid that can be easily used by the next step.
    // Depending on the kind of import chosen in Step 1, this step will accept different kinds of files,
    // and handle the file drag in different ways.
    // For example, when the import kind is "Standard" and the user drags in a CSV file, the file is parsed
    // in-browser and the contents are placed in the text box.  When the import kind is "biolector" and the user
    // drags in an XML file, the file is sent to the server and parsed there, and the resulting data is passed
    // back to the browser and placed in the text box.
    var RawInputStep = (function () {
        function RawInputStep(selectMajorKindStep, nextStepCallback) {
            this.selectMajorKindStep = selectMajorKindStep;
            this.gridFromTextField = [];
            this.processedSetsFromFile = [];
            this.processedSetsAvailable = false;
            this.gridRowMarkers = [];
            this.transpose = false;
            this.userClickedOnTranspose = false;
            this.ignoreDataGaps = false;
            this.userClickedOnIgnoreDataGaps = false;
            this.separatorType = 'csv';
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
            this.clearDropZone();
            this.queueReprocessRawData();
            this.nextStepCallback = nextStepCallback;
        }
        // In practice, the only time this will be called is when Step 1 changes,
        // which may call for a reconfiguration of the controls in this step.
        RawInputStep.prototype.previousStepChanged = function () {
            var mode = this.selectMajorKindStep.interpretationMode;
            // By default, our drop zone wants excel or csv files, so we clear additional class:
            $('#step2textarea').removeClass('xml');
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
            if (mode === 'mdv') {
                // When JBEI MDV format documents are pasted in, it's always from Excel, so they're always tab-separated.
                this.setSeparatorType('tab');
                // We also never ignore gaps, or transpose, for MDV documents.
                this.setIgnoreGaps(false);
                this.setTranspose(false);
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
        RawInputStep.prototype.queueReprocessRawData = function () {
            // Start a timer to wait before calling the routine that remakes the graph.
            // This way we're not bothering the user with the long redraw process when
            // they are making fast edits.
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }
            this.inputRefreshTimerID = setTimeout(this.reprocessRawData.bind(this), 350);
        };
        RawInputStep.prototype.reprocessRawData = function () {
            var _this = this;
            var mode, delimiter, input;
            mode = this.selectMajorKindStep.interpretationMode;
            this.setIgnoreGaps();
            this.setTranspose();
            this.setSeparatorType();
            this.gridFromTextField = [];
            this.gridRowMarkers = [];
            delimiter = '\t';
            if (this.separatorType === 'csv') {
                delimiter = ',';
            }
            input = this.parseRawInput(delimiter, mode);
            // We meed at least 2 rows and columns for MDV format to make any sense
            if (mode === "mdv") {
                // MDV format is quite different, so we parse it in its own subroutine.
                if ((input.input.length > 1) && (input.columns > 1)) {
                    this.processMdv(input.input);
                }
            }
            else {
                // All other formats (so far) are interpreted from a grid.
                // Even biolector XML - which is converted to a grid on the server, then passed back.
                // Note that biolector is left out here - we don't want to do any "inferring" with that data.
                if (mode === 'std' || mode === 'tr' || mode === 'pr') {
                    // If the user hasn't deliberately chosen a setting for 'transpose', we will do
                    // some analysis to attempt to guess which orientation the data needs to have.
                    if (!this.userClickedOnTranspose) {
                        this.inferTransposeSetting(input.input);
                    }
                    // If the user hasn't deliberately chosen to ignore, or accept, gaps in the data,
                    // do a basic analysis to guess which setting makes more sense.
                    if (!this.userClickedOnIgnoreDataGaps) {
                        this.inferGapsSetting();
                    }
                }
                // Collect the data based on the settings
                if (this.transpose) {
                    // first row becomes Y-markers as-is
                    this.gridRowMarkers = input.input.shift() || [];
                    this.gridFromTextField = (input.input[0] || []).map(function (_, i) {
                        return input.input.map(function (row) { return row[i] || ''; });
                    });
                }
                else {
                    this.gridRowMarkers = [];
                    this.gridFromTextField = (input.input || []).map(function (row) {
                        _this.gridRowMarkers.push(row.shift());
                        return row;
                    });
                }
                // Give labels to any header positions that got 'null' for a value.
                this.gridRowMarkers = this.gridRowMarkers.map(function (value) { return value || '?'; });
            }
            this.nextStepCallback();
        };
        // Here, we take a look at the type of the dropped file and decide whether to
        // send it to the server, or process it locally.
        // We inform the FileDropZone of our decision by setting flags in the fileContiner object,
        // which will be inspected when this function returns.
        RawInputStep.prototype.fileDropped = function (fileContainer) {
            var mode = this.selectMajorKindStep.interpretationMode;
            // We'll process csv files locally.
            if ((fileContainer.fileType === 'csv') &&
                (mode === 'std' || mode === 'tr' || mode === 'pr')) {
                fileContainer.skipProcessRaw = false;
                fileContainer.skipUpload = true;
                return;
            }
            // With Excel documents, we need some server-side tools.
            // We'll signal the dropzone to upload this, and receive processed results.
            if ((fileContainer.fileType === 'excel') &&
                (mode === 'std' || mode === 'tr' || mode === 'pr' || mode === 'mdv')) {
                this.showDropZone(fileContainer);
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
                return;
            }
            if (fileContainer.fileType === 'xml' && mode === 'biolector') {
                this.showDropZone(fileContainer);
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
                return;
            }
            // By default, skip any further processing
            fileContainer.skipProcessRaw = true;
            fileContainer.skipUpload = true;
        };
        // This function is passed the usual fileContainer object, but also a reference to the
        // full content of the dropped file.  So, for example, in the case of parsing a csv file,
        // we just drop that content into the text box and we're done.
        RawInputStep.prototype.fileRead = function (fileContainer, result) {
            if (fileContainer.fileType === 'csv') {
                // Since we're handling this format entirely client-side, we can get rid of the
                // drop zone immediately.
                fileContainer.skipUpload = true;
                this.clearDropZone();
                $("#step2textarea").val(result);
                this.inferSeparatorType();
                this.reprocessRawData();
                return;
            }
        };
        // This is called upon receiving a response from a file upload operation,
        // and unlike fileRead() above, is passed a processed result from the server as a second argument,
        // rather than the raw contents of the file.
        RawInputStep.prototype.fileReturnedFromServer = function (fileContainer, result) {
            // Whether we clear the file info area entirely, or just update its status,
            // we know we no longer need the 'sending' status.
            $('#fileDropInfoSending').addClass('off');
            if (fileContainer.fileType == "excel") {
                this.clearDropZone();
                var ws = result.file_data["worksheets"][0];
                var table = ws[0];
                var csv = [];
                if (table.headers) {
                    csv.push(table.headers.join());
                }
                for (var i = 0; i < table.values.length; i++) {
                    csv.push(table.values[i].join());
                }
                this.setSeparatorType('csv');
                $("#step2textarea").val(csv.join("\n"));
                this.reprocessRawData();
                return;
            }
            if (fileContainer.fileType == "xml") {
                var d = result.file_data;
                var t = 0;
                d.forEach(function (set) { t += set.data.length; });
                $('<p>').text('Found ' + d.length + ' measurements with ' + t + ' total data points.').appendTo($("#fileDropInfoLog"));
                this.processedSetsFromFile = d;
                this.processedSetsAvailable = true;
                // Call this directly, skipping over reprocessRawData() since we don't need it.
                this.nextStepCallback();
                return;
            }
        };
        RawInputStep.prototype.parseRawInput = function (delimiter, mode) {
            var rawText, longestRow, rows, multiColumn;
            rawText = $('#step2textarea').val();
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
            if (mode === 'std' || mode === 'tr' || mode === 'pr') {
                rows.forEach(function (row) {
                    while (row.length < longestRow) {
                        row.push('');
                    }
                });
            }
            return {
                'input': rows,
                'columns': longestRow
            };
        };
        // Reset and hide the info box that appears when a file is dropped,
        // and reveal the text entry area.
        // This also clears the "processedSetsAvailable" flag because it assumes that
        // the text entry area is now the preferred data source for subsequent steps.
        RawInputStep.prototype.clearDropZone = function () {
            $('#step2textarea').removeClass('off');
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
        // Reset and hide the info box that appears when a file is dropped,
        // and reveal the text entry area.
        RawInputStep.prototype.showDropZone = function (fileContainer) {
            // Set the icon image properly
            $('#fileDropInfoIcon').removeClass('xml');
            $('#fileDropInfoIcon').removeClass('excel');
            if (fileContainer.fileType === 'xml') {
                $('#fileDropInfoIcon').addClass('xml');
            }
            else if (fileContainer.fileType === 'excel') {
                $('#fileDropInfoIcon').addClass('excel');
            }
            $('#step2textarea').addClass('off');
            $('#fileDropInfoArea').removeClass('off');
            $('#fileDropInfoSending').removeClass('off');
            $('#fileDropInfoName').text(fileContainer.file.name);
            $('#fileUploadMessage').text('Sending ' + Utl.JS.sizeToString(fileContainer.file.size) + ' To Server...');
            //            $('#fileDropInfoLog').empty();
            this.activeDraggedFile = fileContainer;
        };
        RawInputStep.prototype.reset = function () {
            this.clearDropZone();
            $('#step2textarea').val('');
            this.reprocessRawData();
        };
        RawInputStep.prototype.inferTransposeSetting = function (rows) {
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
            this.setTranspose(setTranspose);
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
            this.setIgnoreGaps(result);
        };
        RawInputStep.prototype.processMdv = function (input) {
            var _this = this;
            var rows, colLabels, compounds, orderedComp;
            colLabels = [];
            rows = input.slice(0); // copy
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
            this.gridRowMarkers = ['Assay'];
            // The first row is our label collection
            this.gridFromTextField[0] = colLabels.slice(0);
            // push the rest of the rows generated from ordered list of compounds
            Array.prototype.push.apply(this.gridFromTextField, orderedComp.map(function (name) {
                var compound, row, colLookup;
                _this.gridRowMarkers.push(name);
                compound = compounds[name];
                row = [];
                colLookup = compound.processedAssayCols;
                // generate row cells by mapping column labels to processed columns
                Array.prototype.push.apply(row, colLabels.map(function (_, index) { return colLookup[index] || ''; }));
                return row;
            }));
        };
        // This gets called when there is a paste event.
        RawInputStep.prototype.pastedRawData = function () {
            // We do this using a timeout so the rest of the paste events fire, and get the pasted result.
            window.setTimeout(this.inferSeparatorType.bind(this), 1);
        };
        RawInputStep.prototype.inferSeparatorType = function () {
            if (this.selectMajorKindStep.interpretationMode !== "mdv") {
                var text = $('#step2textarea').val() || '', test;
                test = text.split('\t').length >= text.split(',').length;
                this.setSeparatorType(test ? 'tab' : 'csv');
            }
        };
        RawInputStep.prototype.setIgnoreGaps = function (value) {
            var ignoreGaps = $('#ignoreGaps');
            if (value === undefined) {
                value = ignoreGaps.prop('checked');
            }
            else {
                ignoreGaps.prop('checked', value);
            }
            this.ignoreDataGaps = value;
        };
        RawInputStep.prototype.setTranspose = function (value) {
            var transpose = $('#transpose');
            if (value === undefined) {
                value = transpose.prop('checked');
            }
            else {
                transpose.prop('checked', value);
            }
            this.transpose = value;
        };
        RawInputStep.prototype.setSeparatorType = function (value) {
            var separatorPulldown = $('#rawdataformatp');
            if (value === undefined) {
                value = separatorPulldown.val();
            }
            else {
                separatorPulldown.val(value);
            }
            this.separatorType = value;
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
            var input, text;
            if (e.which === 9) {
                input = e.target;
                text = $(input).val();
                // set value to itself with selection replaced by a tab character
                $(input).val([
                    text.substring(0, input.selectionStart),
                    text.substring(input.selectionEnd)
                ].join('\t'));
                // put caret at right position again
                input.selectionStart = input.selectionEnd = input.selectionStart + 1;
                return false;
            }
            return true;
        };
        RawInputStep.prototype.getGrid = function () {
            return this.gridFromTextField;
        };
        return RawInputStep;
    })();
    EDDTableImport.RawInputStep = RawInputStep;
    // Magic numbers used in pulldowns to assign types to rows/fields.
    var TypeEnum = (function () {
        function TypeEnum() {
        }
        TypeEnum.Gene_Names = 10;
        TypeEnum.RPKM_Values = 11;
        TypeEnum.Assay_Line_Names = 1;
        TypeEnum.Protein_Name = 12;
        TypeEnum.Metabolite_Names = 2;
        TypeEnum.Timestamp = 3;
        TypeEnum.Metadata_Name = 4;
        TypeEnum.Metabolite_Name = 5;
        return TypeEnum;
    })();
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
            $('#dataTableDiv')
                .on('mouseover mouseout', 'td', this.highlighterF.bind(this))
                .on('dblclick', 'td', this.singleValueDisablerF.bind(this));
            $('#resetstep3').on('click', this.resetEnabledFlagMarkers.bind(this));
        }
        IdentifyStructuresStep.prototype.previousStepChanged = function () {
            var _this = this;
            var mode = this.selectMajorKindStep.interpretationMode;
            var graph = $('#graphDiv');
            if (mode === 'std' || mode === 'biolector') {
                this.graphEnabled = true;
            }
            else {
                this.graphEnabled = false;
            }
            graph.toggleClass('off', !this.graphEnabled);
            var gridRowMarkers = this.rawInputStep.gridRowMarkers;
            var grid = this.rawInputStep.getGrid();
            var ignoreDataGaps = this.rawInputStep.ignoreDataGaps;
            if (mode === 'std' || mode === 'tr' || mode === 'pr') {
                gridRowMarkers.forEach(function (value, i) {
                    var type;
                    if (!_this.pulldownUserChangedFlags[i]) {
                        type = _this.figureOutThisRowsDataType(mode, value, grid[i] || []);
                        _this.pulldownSettings[i] = type;
                    }
                });
            }
            // We're emptying the data table whether we remake it or not...
            $('#dataTableDiv').empty();
            if (mode === 'std' || mode === 'tr' || mode === 'pr' || mode === 'mdv') {
                // Create a map of enabled/disabled flags for our data,
                // but only fill the areas that do not already exist.
                this.inferActiveFlags(grid);
                // Construct table cell objects for the page, based on our extracted data
                this.constructDataTable(mode, grid, gridRowMarkers);
                // and leaving out any values that have been individually flagged.
                // Update the styles of the new table to reflect the
                // (possibly previously set) flag markers and the "ignore gaps" setting.
                this.redrawIgnoredValueMarkers(ignoreDataGaps);
                this.redrawEnabledFlagMarkers();
            }
            // Either we're interpreting some pre-processed data sets from a server response,
            // or we're interpreting the data table we just laid out above,
            // which involves skipping disabled rows or columns, optionally ignoring blank values, etc.
            this.interpretDataTable();
            // Start a delay timer that redraws the graph from the interpreted data.
            // This is rather resource intensive, so we're delaying a bit, and restarting the delay
            // if the user makes additional edits to the data within the delay period.
            this.queueGraphRemake();
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
            // If the label parses into a number and the data contains no strings, call it a timsetamp for data
            if (!isNaN(parseFloat(label)) && (strings === 0)) {
                return TypeEnum.Timestamp;
            }
            // No choice by default
            return 0;
        };
        IdentifyStructuresStep.prototype.inferActiveFlags = function (grid) {
            var _this = this;
            // An important thing to note here is that this data is in [y][x] format -
            // that is, it goes by row, then by column, when referencing.
            // This matches Grid.data and Table.dataCells.
            var x, y;
            (grid[0] || []).forEach(function (_, x) {
                if (_this.activeColFlags[x] === undefined) {
                    _this.activeColFlags[x] = true;
                }
            });
            grid.forEach(function (row, y) {
                if (_this.activeRowFlags[y] === undefined) {
                    _this.activeRowFlags[y] = true;
                }
                _this.activeFlags[y] = _this.activeFlags[y] || [];
                row.forEach(function (_, x) {
                    if (_this.activeFlags[y][x] === undefined) {
                        _this.activeFlags[y][x] = true;
                    }
                });
            });
        };
        IdentifyStructuresStep.prototype.constructDataTable = function (mode, grid, gridRowMarkers) {
            var _this = this;
            var controlCols, pulldownOptions, table, colgroup, body, row;
            this.dataCells = [];
            this.colCheckboxCells = [];
            this.colObjects = [];
            this.rowLabelCells = [];
            this.rowCheckboxCells = [];
            controlCols = ['checkbox', 'pulldown', 'label'];
            if (mode === 'tr') {
                pulldownOptions = [
                    ['--', 0],
                    ['Entire Row Is...', [
                            ['Gene Names', TypeEnum.Gene_Names],
                            ['RPKM Values', TypeEnum.RPKM_Values]
                        ]
                    ]
                ];
            }
            else if (mode === 'pr') {
                pulldownOptions = [
                    ['--', 0],
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
                    ['--', 0],
                    ['Entire Row Is...', [
                            ['Assay/Line Names', TypeEnum.Assay_Line_Names],
                            ['Metabolite Names', TypeEnum.Metabolite_Names]
                        ]
                    ],
                    ['First Column Is...', [
                            ['Timestamp', TypeEnum.Timestamp],
                            ['Metadata Name', TypeEnum.Metadata_Name],
                            ['Metabolite Name', TypeEnum.Metabolite_Name]
                        ]
                    ]
                ];
            }
            // attach all event handlers to the table itself
            var t = this;
            table = $('<table>').attr('cellspacing', '0').appendTo($('#dataTableDiv'))
                .on('click', '[name=enableColumn]', function (ev) {
                t.toggleTableColumn(ev.target);
            }).on('click', '[name=enableRow]', function (ev) {
                t.toggleTableRow(ev.target);
            }).on('change', '.pulldownCell > select', function (ev) {
                var targ = $(ev.target);
                t.changedRowDataTypePulldown(parseInt(targ.attr('i'), 10), parseInt(targ.val(), 10));
            })[0];
            // One of the objects here will be a column group, with col objects in it.
            // This is an interesting twist on DOM behavior that you should probably google.
            colgroup = $('<colgroup>').appendTo(table);
            body = $('<tbody>').appendTo(table)[0];
            // Start with three columns, for the checkboxes, pulldowns, and labels.
            // (These will not be tracked in Table.colObjects.)
            controlCols.forEach(function () {
                $('<col>').appendTo(colgroup);
            });
            // add col elements for each data column
            (grid[0] || []).forEach(function () {
                _this.colObjects.push($('<col>').appendTo(colgroup)[0]);
            });
            // First row: spacer cells, followed by checkbox cells for each data column
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
            // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
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
                // pulldown cell
                cell = $(row.insertCell()).addClass('pulldownCell')
                    .attr({ 'id': 'rowPCell' + i, 'x': 0, 'y': i + 1 });
                // use existing setting, or use the last if rows.length > settings.length, or blank
                _this.pulldownSettings[i] = _this.pulldownSettings[i]
                    || _this.pulldownSettings.slice(-1)[0] || 0;
                _this.populatePulldown(cell = $('<select>')
                    .attr({ 'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i })
                    .appendTo(cell), pulldownOptions, _this.pulldownSettings[i]);
                _this.pulldownObjects.push(cell[0]);
                // label cell
                cell = $(row.insertCell()).attr({ 'id': 'rowMCell' + i, 'x': 0, 'y': i + 1 });
                $('<div>').text(gridRowMarkers[i]).appendTo(cell);
                _this.rowLabelCells.push(cell[0]);
                // the table data itself
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
                if (pulldown === TypeEnum.Assay_Line_Names || pulldown === TypeEnum.Metabolite_Names) {
                    hlRow = true;
                }
                else if (pulldown === TypeEnum.Timestamp ||
                    pulldown === TypeEnum.Metadata_Name ||
                    pulldown === TypeEnum.Metabolite_Name) {
                    hlLabel = true;
                }
                $(_this.rowLabelCells[index]).toggleClass('dataTypeCell', hlLabel);
                row.forEach(function (_, col) {
                    $(_this.dataCells[index][col]).toggleClass('dataTypeCell', hlRow);
                });
            });
        };
        IdentifyStructuresStep.prototype.redrawIgnoredValueMarkers = function (ignoreDataGaps) {
            this.dataCells.forEach(function (row) {
                row.forEach(function (cell) {
                    var toggle = !ignoreDataGaps && !!cell.getAttribute('isblank');
                    $(cell).toggleClass('ignoredLine', toggle);
                });
            });
        };
        IdentifyStructuresStep.prototype.redrawEnabledFlagMarkers = function () {
            var _this = this;
            this.dataCells.forEach(function (row, y) {
                var toggle = !_this.activeRowFlags[y];
                $(_this.rowLabelCells[y]).toggleClass('disabledLine', toggle);
                row.forEach(function (cell, x) {
                    toggle = !_this.activeFlags[y][x]
                        || !_this.activeColFlags[x]
                        || !_this.activeRowFlags[y];
                    $(cell).toggleClass('disabledLine', toggle);
                });
            });
            this.colCheckboxCells.forEach(function (box, x) {
                var toggle = !_this.activeColFlags[x];
                $(box).toggleClass('disabledLine', toggle);
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
                value === TypeEnum.Metabolite_Name ||
                value === TypeEnum.Protein_Name) {
                // "Timestamp", "Metadata", or other single-table-cell types
                // Set all the rest of the pulldowns to this,
                // based on the assumption that the first is followed by many others
                this.pulldownObjects.slice(index + 1).every(function (pulldown) {
                    var select, i;
                    select = $(pulldown);
                    i = parseInt(select.attr('i'), 10);
                    if (_this.pulldownUserChangedFlags[i]
                        && _this.pulldownSettings[i] !== 0) {
                        return false; // false for break
                    }
                    select.val(value.toString());
                    _this.pulldownSettings[i] = value;
                    return true;
                });
                // In addition to the above action, we also need to do some checking on the entire set of
                // pulldowns, to enforce a division between the "Metabolite Name" single data type and the
                // other single data types. If the user uses even one "Metabolite Name" pulldown, we can't
                // allow any of the other types, and vice-versa.
                //   Why?  Because "Metabolite Name" is used to label the specific case of a table that
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
                // "Metabolite Name", we blank out all references to "Timestamp" and "Metadata", and
                // vice-versa.
                grid.forEach(function (_, i) {
                    var c = _this.pulldownSettings[i];
                    if (value === TypeEnum.Metabolite_Name) {
                        if (c === TypeEnum.Timestamp || c === TypeEnum.Metadata_Name) {
                            _this.pulldownObjects[i].selectedIndex = 0;
                            _this.pulldownSettings[i] = 0;
                        }
                        else if (c === TypeEnum.Metabolite_Names) {
                            _this.pulldownObjects[i].selectedIndex = TypeEnum.Assay_Line_Names;
                            _this.pulldownSettings[i] = TypeEnum.Assay_Line_Names;
                        }
                    }
                    else if ((value === TypeEnum.Timestamp || value === TypeEnum.Metadata_Name) && c === TypeEnum.Metabolite_Name) {
                        _this.pulldownObjects[i].selectedIndex = 0;
                        _this.pulldownSettings[i] = 0;
                    }
                });
            }
            this.applyTableDataTypeStyling(grid);
            this.interpretDataTable();
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        IdentifyStructuresStep.prototype.toggleTableRow = function (box) {
            var value, input;
            input = $(box);
            value = parseInt(input.val(), 10);
            this.activeRowFlags[value] = input.prop('checked');
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
            var single, nonSingle, earliestName;
            var grid = this.rawInputStep.getGrid();
            var gridRowMarkers = this.rawInputStep.gridRowMarkers;
            var ignoreDataGaps = this.rawInputStep.ignoreDataGaps;
            // We'll be accumulating these for disambiguation.
            var seenLineNames = {};
            var seenAssayNames = {};
            var seenMeasurementNames = {};
            var seenMetadataNames = {};
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
                    var set, graphSet, uniqueTimes, times, foundMeta;
                    var ln = rawSet.line_name;
                    var an = rawSet.assay_name;
                    var mn = rawSet.measurement_name;
                    uniqueTimes = [];
                    times = {};
                    foundMeta = false;
                    // The procedure for Assays, Measurements, etc is the same:
                    // If the value is blank, we can't build a valid set, so skip to the next set.
                    // If the value is valid but we haven't seen it before, increment and store a uniqueness index.
                    if (!ln && ln !== 0) {
                        return;
                    }
                    if (!an && an !== 0) {
                        return;
                    }
                    if (!mn && mn !== 0) {
                        return;
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
                        var time = xy[0] || '';
                        var value = xy[1];
                        // Sometimes people - or Excel docs - drop commas into large numbers.
                        var timeFloat = parseFloat(time.replace(/,/g, ''));
                        // If we can't get a usable timestamp, discard this point.
                        if (isNaN(timeFloat)) {
                            return;
                        }
                        if (!value && value !== 0) {
                            // If we're ignoring gaps, skip any undefined/null values.
                            //if (ignoreDataGaps) { return; }    // Note: Forced always-off for now
                            // A null is our standard placeholder value
                            value = null;
                        }
                        if (!times[timeFloat]) {
                            times[timeFloat] = value;
                            uniqueTimes.push(timeFloat);
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
                        assay_name: rawSet.assay_name,
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
            single = 0;
            nonSingle = 0;
            earliestName = null;
            // Look for the presence of "single measurement type" rows, and rows of all other single-item types
            grid.forEach(function (_, y) {
                var pulldown;
                if (_this.activeRowFlags[y]) {
                    pulldown = _this.pulldownSettings[y];
                    if (pulldown === TypeEnum.Metabolite_Name || pulldown === TypeEnum.Protein_Name) {
                        single++; // Single Measurement Name or Single Protein Name
                    }
                    else if (pulldown === TypeEnum.Metadata_Name || pulldown === TypeEnum.Timestamp) {
                        nonSingle++;
                    }
                    else if (pulldown === TypeEnum.Assay_Line_Names && earliestName === null) {
                        earliestName = y;
                    }
                }
            });
            // Only use this mode if the table is entirely free of single-timestamp and
            // single-metadata rows, and has at least one "single measurement" row, and at
            // least one "Assay/Line names" row.
            // (Note that requirement of an "Assay/Line names" row prevents this mode from being
            // enabled when the page is in 'Transcriptomics' or 'Proteomics' mode.)
            singleMode = (single > 0 && nonSingle === 0 && earliestName !== null) ? true : false;
            // A "set" for every cell of the table, with the timestamp to be determined later.
            if (singleMode) {
                this.colObjects.forEach(function (_, c) {
                    var cellValue, set;
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
                        if (pulldown === TypeEnum.Metabolite_Name) {
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
                            // If we aren't on a row that's labeled as either a metabolite valye or a protein value,
                            // return without making a set.
                            return;
                        }
                        set = {
                            kind: _this.selectMajorKindStep.interpretationMode,
                            line_name: null,
                            assay_name: cellValue,
                            measurement_name: m_name,
                            metadata_by_name: {},
                            data: [[null, value]]
                        };
                        _this.parsedSets.push(set);
                    });
                });
                return;
            }
            // The standard method: Make a "set" for each column of the table
            this.colObjects.forEach(function (_, c) {
                var set, graphSet, uniqueTimes, times, foundMeta;
                // Skip it if the whole column is deactivated
                if (!_this.activeColFlags[c]) {
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
                    if (!_this.activeRowFlags[r] || !_this.activeFlags[r][c]) {
                        return;
                    }
                    pulldown = _this.pulldownSettings[r];
                    label = gridRowMarkers[r] || '';
                    value = row[c] || '';
                    if (!pulldown) {
                        return;
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
                    else if (pulldown === TypeEnum.Metabolite_Names) {
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
                    'label': 'Column ' + c,
                    'name': 'Column ' + c,
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
            if (this.graphRefreshTimerID) {
                clearTimeout(this.graphRefreshTimerID);
            }
            if (this.graphEnabled) {
                this.graphRefreshTimerID = setTimeout(this.remakeGraphArea.bind(this), 700);
            }
        };
        IdentifyStructuresStep.prototype.remakeGraphArea = function () {
            var mode = this.selectMajorKindStep.interpretationMode;
            this.graphRefreshTimerID = 0;
            if (!EDDATDGraphing || !this.graphEnabled) {
                return;
            }
            EDDATDGraphing.clearAllSets();
            var sets = this.graphSets;
            // If we're not in either of these modes, drawing a graph is nonsensical.
            if (mode === "std" || mode === 'biolector') {
                sets.forEach(function (set) { return EDDATDGraphing.addNewSet(set); });
            }
            EDDATDGraphing.drawSets();
        };
        return IdentifyStructuresStep;
    })();
    EDDTableImport.IdentifyStructuresStep = IdentifyStructuresStep;
    // The class responsible for everything in the "Step 4" box that you see on the data import page.
    var TypeDisambiguationStep = (function () {
        function TypeDisambiguationStep(selectMajorKindStep, identifyStructuresStep, nextStepCallback) {
            this.lineObjSets = {};
            this.assayObjSets = {};
            this.currentlyVisibleLineObjSets = [];
            this.currentlyVisibleAssayObjSets = [];
            this.measurementObjSets = {};
            this.currentlyVisibleMeasurementObjSets = [];
            this.metadataObjSets = {};
            this.autoCompUID = 0;
            this.protocolCurrentlyDisplayed = 0;
            this.autoCache = {
                comp: {},
                meta: {},
                unit: {},
                metabolite: {}
            };
            this.selectMajorKindStep = selectMajorKindStep;
            this.identifyStructuresStep = identifyStructuresStep;
            this.nextStepCallback = nextStepCallback;
            var reDoStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType', '#masterMUnits'];
            $(reDoStepOnChange.join(',')).on('change', this.changedAnyMasterPulldown.bind(this));
            $('#resetstep4').on('click', this.resetDisambiguationFields.bind(this));
            // enable autocomplete on statically defined fields
            EDD_auto.setup_field_autocomplete('#masterMComp', 'MeasurementCompartment');
            EDD_auto.setup_field_autocomplete('#masterMType', 'GenericOrMetabolite', EDDData.MetaboliteTypes || {});
            EDD_auto.setup_field_autocomplete('#masterMUnits', 'MeasurementUnit');
        }
        TypeDisambiguationStep.prototype.previousStepChanged = function () {
            var assayIn;
            var currentAssays;
            var masterP = this.selectMajorKindStep.masterProtocol; // Shout-outs to a mid-grade rapper
            if (this.protocolCurrentlyDisplayed != masterP) {
                this.protocolCurrentlyDisplayed = masterP;
                // We deal with recreating this pulldown here, instead of in remakeAssaySection(),
                // because remakeAssaySection() is called by reconfigure(), which is called
                // when other UI in this step changes.  This pulldown is NOT affected by changes to
                // the other UI, so it would be pointless to remake it in response to them.
                assayIn = $('#masterAssay').empty();
                $('<option>').text('(Create New)').appendTo(assayIn).val('new').prop('selected', true);
                currentAssays = ATData.existingAssays[masterP] || [];
                currentAssays.forEach(function (id) {
                    var assay = EDDData.Assays[id], line = EDDData.Lines[assay.lid], protocol = EDDData.Protocols[assay.pid];
                    $('<option>').appendTo(assayIn).val('' + id).text([
                        line.name, protocol.name, assay.name].join('-'));
                });
                // Always reveal this, since the default for the Assay pulldown is always 'new'.
                $('#masterLineSpan').removeClass('off');
            }
            this.reconfigure();
        };
        // Create the Step 4 tables:  Sets of rows, one for each y-axis column of values,
        // where the user can fill out additional information for the pasted table.
        TypeDisambiguationStep.prototype.reconfigure = function () {
            var mode = this.selectMajorKindStep.interpretationMode;
            var parsedSets = this.identifyStructuresStep.parsedSets;
            var seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            // Hide all the subsections by default
            $('#masterTimestampDiv').addClass('off');
            $('#disambiguateLinesSection').addClass('off');
            $('#masterLineDiv').addClass('off');
            $('#disambiguateAssaysSection').addClass('off');
            $('#masterAssayLineDiv').addClass('off');
            $('#disambiguateMeasurementsSection').addClass('off');
            $('#masterMTypeDiv').addClass('off');
            $('#disambiguateMetadataSection').addClass('off');
            // If no sets to show, leave the area blank and show the 'enter some data!' banner
            if (parsedSets.length === 0) {
                $('#emptyDisambiguationLabel').removeClass('off');
                return;
            }
            $('#emptyDisambiguationLabel').addClass('off');
            // If parsed data exists, but we haven't seen a single timestamp, show the "master timestamp" UI.
            $('#masterTimestampDiv').toggleClass('off', seenAnyTimestamps);
            // Call subroutines for each of the major sections
            if (mode === "biolector") {
                this.remakeLineSection();
            }
            else {
                this.remakeAssaySection();
            }
            this.remakeMeasurementSection();
            this.remakeMetadataSection();
            this.nextStepCallback();
        };
        // TODO: This function should reset all the disambiguation fields to the values
        // that were auto-detected in the last refresh of the object.
        TypeDisambiguationStep.prototype.resetDisambiguationFields = function () {
            // Get to work!!
        };
        // If the previous step found Line names that need resolving, and the interpretation mode in Step 1
        // warrants resolving Lines independent of Assays, we create this section.
        // The point is that if we connect unresolved Line strings on their own, the unresolved Assay strings
        // can be used to create multiple new Assays with identical names under a range of Lines.
        // This means users can create a matrix of Line/Assay combinations, rather than a one-dimensional
        // resolution where unique Assay names must always point to one unique Assay record.
        TypeDisambiguationStep.prototype.remakeLineSection = function () {
            var _this = this;
            var table, body;
            var uniqueLineNames = this.identifyStructuresStep.uniqueLineNames;
            this.currentlyVisibleLineObjSets.forEach(function (disam) {
                disam.rowElementJQ.detach();
            });
            $('#disambiguateLinesTable').remove();
            if (uniqueLineNames.length === 0) {
                $('#masterLineDiv').removeClass('off');
                return;
            }
            this.currentlyVisibleLineObjSets = [];
            var t = this;
            table = $('<table>')
                .attr({ 'id': 'disambiguateLinesTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateLinesSection').removeClass('off'))
                .on('change', 'select', function (ev) {
                t.userChangedLineDisam(ev.target);
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            uniqueLineNames.forEach(function (name, i) {
                var disam, row, defaultSel, cell, select;
                disam = _this.lineObjSets[name];
                if (!disam) {
                    disam = {};
                    defaultSel = _this.disambiguateAnAssayOrLine(name, i);
                    // First make a table row, and save a reference to it
                    row = body.insertRow();
                    disam.rowElementJQ = $(row);
                    // Next, add a table cell with the string we are disambiguating
                    $('<div>').text(name).appendTo(row.insertCell());
                    // Now build another table cell that will contain the pulldowns
                    cell = $(row.insertCell()).css('text-align', 'left');
                    select = $('<select>').appendTo(cell)
                        .data({ 'setByUser': false })
                        .attr('name', 'disamLine' + i);
                    disam.selectLineJQElement = select;
                    $('<option>').text('(Create New)').appendTo(select).val('new')
                        .prop('selected', !defaultSel.lineID);
                    (ATData.existingLines || []).forEach(function (line) {
                        $('<option>').text(line.n)
                            .appendTo(select).val(line.id.toString())
                            .prop('selected', defaultSel.lineID === line.id);
                    });
                    _this.lineObjSets[name] = disam;
                }
                disam.selectLineJQElement.data({ 'visibleIndex': i });
                disam.rowElementJQ.appendTo(body);
                _this.currentlyVisibleLineObjSets.push(disam);
            });
        };
        // If the previous step found Line or Assay names that need resolving, put together a disambiguation section
        // for Assays/Lines.
        // Keep a separate set of correlations between strings and pulldowns for each Protocol,
        // since the same string can match different Assays, and the pulldowns will have different content, in each Protocol.
        // If the previous step didn't find any Line or Assay names that need resolving,
        // reveal the pulldowns for selecting a master Line/Assay, leaving the table empty, and return.
        TypeDisambiguationStep.prototype.remakeAssaySection = function () {
            var _this = this;
            var table, body;
            var uniqueAssayNames = this.identifyStructuresStep.uniqueAssayNames;
            var masterP = this.protocolCurrentlyDisplayed;
            this.currentlyVisibleAssayObjSets.forEach(function (disam) {
                disam.rowElementJQ.detach();
            });
            $('#disambiguateAssaysTable').remove();
            this.assayObjSets[masterP] = this.assayObjSets[masterP] || {};
            if (uniqueAssayNames.length === 0) {
                $('#masterAssayLineDiv').removeClass('off');
                return;
            }
            this.currentlyVisibleAssayObjSets = [];
            var t = this;
            table = $('<table>')
                .attr({ 'id': 'disambiguateAssaysTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateAssaysSection').removeClass('off'))
                .on('change', 'select', function (ev) {
                t.userChangedAssayDisam(ev.target);
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            uniqueAssayNames.forEach(function (name, i) {
                var disam, row, defaultSel, cell, aSelect, lSelect;
                disam = _this.assayObjSets[masterP][name];
                if (!disam) {
                    disam = {};
                    defaultSel = _this.disambiguateAnAssayOrLine(name, i);
                    // First make a table row, and save a reference to it
                    row = body.insertRow();
                    disam.rowElementJQ = $(row);
                    // Next, add a table cell with the string we are disambiguating
                    $('<div>').text(name).appendTo(row.insertCell());
                    // Now build another table cell that will contain the pulldowns
                    cell = $(row.insertCell()).css('text-align', 'left');
                    aSelect = $('<select>').appendTo(cell)
                        .data({ 'setByUser': false })
                        .attr('name', 'disamAssay' + i);
                    disam.selectAssayJQElement = aSelect;
                    $('<option>').text('(Create New)').appendTo(aSelect).val('named_or_new')
                        .prop('selected', !defaultSel.assayID);
                    (ATData.existingAssays[masterP] || []).forEach(function (id) {
                        var assay, line, protocol;
                        assay = EDDData.Assays[id];
                        line = EDDData.Lines[assay.lid];
                        protocol = EDDData.Protocols[assay.pid];
                        $('<option>').text([line.name, protocol.name, assay.name].join('-'))
                            .appendTo(aSelect).val(id.toString())
                            .prop('selected', defaultSel.assayID === id);
                    });
                    // a span to contain the text label for the Line pulldown, and the pulldown itself
                    cell = $('<span>').text('for Line:').toggleClass('off', !!defaultSel.assayID)
                        .appendTo(cell);
                    lSelect = $('<select>').appendTo(cell).data('setByUser', false)
                        .attr('name', 'disamLine' + i);
                    disam.selectLineJQElement = lSelect;
                    $('<option>').text('(Create New)').appendTo(lSelect).val('new')
                        .prop('selected', !defaultSel.lineID);
                    // ATData.existingLines is of type {id: number; n: string;}[]
                    (ATData.existingLines || []).forEach(function (line) {
                        $('<option>').text(line.n).appendTo(lSelect).val(line.id.toString())
                            .prop('selected', defaultSel.lineID === line.id);
                    });
                    _this.assayObjSets[masterP][name] = disam;
                }
                disam.selectAssayJQElement.data({ 'visibleIndex': i });
                disam.rowElementJQ.appendTo(body);
                _this.currentlyVisibleAssayObjSets.push(disam);
            });
        };
        TypeDisambiguationStep.prototype.remakeMeasurementSection = function () {
            var _this = this;
            var body, row;
            var mode = this.selectMajorKindStep.interpretationMode;
            var uniqueMeasurementNames = this.identifyStructuresStep.uniqueMeasurementNames;
            var seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            $('#disambiguateMeasurementsSection').addClass('off');
            $('#masterMTypeDiv').addClass('off');
            // If in 'Transcription' or 'Proteomics' mode, there are no measurement types involved.
            // skip the measurement section, and provide statistics about the gathered records.
            if (mode === "tr" || mode === "pr") {
                return;
            }
            // No measurements for disambiguation, have timestamp data:  That means we need to choose one measurement.
            // You might think that we should display this even without timestamp data, to handle the case where we're importing
            // a single measurement type for a single timestamp...  But that would be a 1-dimensional import, since there is only
            // one other object with multiple types to work with (lines/assays).  We're not going to bother supporting that.
            if (uniqueMeasurementNames.length === 0 && seenAnyTimestamps) {
                $('#masterMTypeDiv').removeClass('off');
                return;
            }
            this.currentlyVisibleMeasurementObjSets.forEach(function (disam) {
                disam.rowElementJQ.detach();
            });
            $('#disambiguateMeasurementsSection').removeClass('off');
            // put together a disambiguation section for measurement types
            var t = this;
            body = ($('#disambiguateMeasurementsTable').children().first()[0]);
            this.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
            uniqueMeasurementNames.forEach(function (name, i) {
                var disam;
                disam = _this.measurementObjSets[name];
                if (disam && disam.rowElementJQ) {
                    disam.rowElementJQ.appendTo(body);
                }
                else {
                    disam = {};
                    row = body.insertRow();
                    disam.rowElementJQ = $(row);
                    $('<div>').text(name).appendTo(row.insertCell());
                    ['compObj', 'typeObj', 'unitsObj'].forEach(function (auto) {
                        var cell = $(row.insertCell()).addClass('disamDataCell');
                        disam[auto] = EDD_auto.create_autocomplete(cell).data('type', auto);
                    });
                    disam.typeHiddenObj = disam.typeObj.attr('size', 45).next();
                    disam.compHiddenObj = disam.compObj.attr('size', 4).next();
                    disam.unitsHiddenObj = disam.unitsObj.attr('size', 10).next();
                    $(row).on('change', 'input[type=hidden]', function (ev) {
                        // only watch for changes on the hidden portion, let autocomplete work
                        t.userChangedMeasurementDisam(ev.target);
                    });
                    EDD_auto.setup_field_autocomplete(disam.compObj, 'MeasurementCompartment', _this.autoCache.comp);
                    EDD_auto.setup_field_autocomplete(disam.typeObj, 'GenericOrMetabolite', _this.autoCache.metabolite);
                    EDD_auto.initial_search(disam.typeObj, name);
                    EDD_auto.setup_field_autocomplete(disam.unitsObj, 'MeasurementUnit', _this.autoCache.unit);
                    _this.measurementObjSets[name] = disam;
                }
                // TODO sizing should be handled in CSS
                disam.compObj.data('visibleIndex', i);
                disam.typeObj.data('visibleIndex', i);
                disam.unitsObj.data('visibleIndex', i);
                // If we're in MDV mode, the units pulldowns are irrelevant.
                disam.unitsObj.toggleClass('off', mode === 'mdv');
                _this.currentlyVisibleMeasurementObjSets.push(disam);
            });
            this.checkAllMeasurementCompartmentDisam();
        };
        TypeDisambiguationStep.prototype.remakeMetadataSection = function () {
            var _this = this;
            var table, body, row;
            var uniqueMetadataNames = this.identifyStructuresStep.uniqueMetadataNames;
            if (uniqueMetadataNames.length < 1) {
                return;
            }
            $('#disambiguateMetadataTable').remove();
            // put together a disambiguation section for metadata
            table = $('<table>')
                .attr({ 'id': 'disambiguateMetadataTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateMetadataSection').removeClass('off'))
                .on('change', 'input', function (ev) {
                // should there be event handling here ?
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            uniqueMetadataNames.forEach(function (name, i) {
                var disam;
                disam = _this.metadataObjSets[name];
                if (disam && disam.rowElementJQ) {
                    disam.rowElementJQ.appendTo(body);
                }
                else {
                    disam = {};
                    row = body.insertRow();
                    disam.rowElementJQ = $(row);
                    $('<div>').text(name).appendTo(row.insertCell());
                    disam.metaObj = EDD_auto.create_autocomplete(row.insertCell()).val(name);
                    disam.metaHiddenObj = disam.metaObj.next();
                    _this.metadataObjSets[name] = disam;
                }
                disam.metaObj.attr('name', 'disamMeta' + i).addClass('autocomp_altype')
                    .next().attr('name', 'disamMetaHidden' + i);
                EDD_auto.setup_field_autocomplete(disam.metaObj, 'AssayLineMetadataType', _this.autoCache.meta);
            });
        };
        // We call this when any of the 'master' pulldowns are changed in Step 4.
        // Such changes may affect the available contents of some of the pulldowns in the step.
        TypeDisambiguationStep.prototype.changedAnyMasterPulldown = function () {
            // Show the master line dropdown if the master assay dropdown is set to new
            $('#masterLineSpan').toggleClass('off', $('#masterAssay').val() !== 'new');
            this.reconfigure();
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
                var select = obj.selectLineJQElement;
                if (select.data('setByUser')) {
                    return;
                }
                // set dropdown to 'new' and reveal the line pulldown
                select.val('new').next().removeClass('off');
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
            changed.next().toggleClass('off', changed.val() !== 'new');
            if (changed.val() !== 'new') {
                // stop here for anything other than 'new'; only 'new' cascades to following pulldowns
                return false;
            }
            v = changed.data('visibleIndex') || 0;
            this.currentlyVisibleAssayObjSets.slice(v).forEach(function (obj) {
                var select = obj.selectAssayJQElement;
                if (select.data('setByUser')) {
                    return;
                }
                // set dropdown to 'new' and reveal the line pulldown
                select.val('new').next().removeClass('off');
            });
            return false;
        };
        TypeDisambiguationStep.prototype.userChangedMeasurementDisam = function (element) {
            console.log('changed');
            var hidden, auto, type, i;
            hidden = $(element);
            auto = hidden.prev();
            type = auto.data('type');
            if (type === 'compObj' || type === 'unitsObj') {
                i = auto.data('setByUser', true).data('visibleIndex') || 0;
                this.currentlyVisibleMeasurementObjSets.slice(i).some(function (obj) {
                    var following = $(obj[type]);
                    if (following.length === 0 || following.data('setByUser')) {
                        return true; // break; for the Array.some() loop
                    }
                    // using placeholder instead of val to avoid triggering autocomplete change
                    following.attr('placeholder', auto.val());
                    following.next().val(hidden.val());
                    return false;
                });
            }
            // not checking typeObj; form submit sends selected types
            this.checkAllMeasurementCompartmentDisam();
        };
        // Run through the list of currently visible measurement disambiguation form elements,
        // checking to see if any of the 'compartment' elements are set to a non-blank value.
        // If any are, and we're in MDV document mode, display a warning that the user should
        // specify compartments for all their measurements.
        TypeDisambiguationStep.prototype.checkAllMeasurementCompartmentDisam = function () {
            var allSet;
            var mode = this.selectMajorKindStep.interpretationMode;
            allSet = this.currentlyVisibleMeasurementObjSets.every(function (obj) {
                var hidden = obj.compHiddenObj;
                if (obj.compObj.data('setByUser') || (hidden.val() && hidden.val() !== '0')) {
                    return true;
                }
                return false;
            });
            $('#noCompartmentWarning').toggleClass('off', mode !== 'mdv' || allSet);
        };
        TypeDisambiguationStep.prototype.disambiguateAnAssayOrLine = function (assayOrLine, currentIndex) {
            var selections, highest, assays;
            selections = {
                lineID: 0,
                assayID: 0
            };
            highest = 0;
            // ATData.existingAssays is type {[index: string]: number[]}
            assays = ATData.existingAssays[this.selectMajorKindStep.masterProtocol] || [];
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
        TypeDisambiguationStep.prototype.createSetsForSubmission = function () {
            var _this = this;
            // From Step 1
            var mode = this.selectMajorKindStep.interpretationMode;
            var masterProtocol = $("#masterProtocol").val();
            // From Step 3
            var seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            var parsedSets = this.identifyStructuresStep.parsedSets;
            // From this Step
            var masterTime = parseFloat($('#masterTimestamp').val());
            var masterLine = $('#masterLine').val();
            var masterAssayLine = $('#masterAssayLine').val();
            var masterAssay = $('#masterAssay').val();
            var masterMType = $('#masterMType').val();
            var masterMComp = $('#masterMComp').val();
            var masterMUnits = $('#masterMUnits').val();
            var resolvedSets = [];
            parsedSets.forEach(function (set, c) {
                var resolvedSet;
                var line_id = 'new'; // A convenient default
                var assay_id = 'new';
                var measurement_id = null;
                var compartment_id = null;
                var units_id = null;
                // In modes where we resolve measurement types in the client UI, go with the master values by default.
                if (mode === "biolector" || mode === "std" || mode === "mdv") {
                    measurement_id = masterMType;
                    compartment_id = masterMComp || "0";
                    units_id = masterMUnits || "1";
                }
                var data = set.data;
                var metaData = {};
                var metaDataPresent = false;
                if (mode === "biolector") {
                    line_id = masterLine;
                    assay_id = "named_or_new"; // Tells the server to attempt to resolve directly against the name, or make a new Assay
                    // If we have a valid, specific Line name, look for a disambiguation field that matches it.
                    if (set.line_name !== null) {
                        var disam = _this.lineObjSets[set.line_name];
                        if (disam) {
                            line_id = disam.selectLineJQElement.val();
                        }
                    }
                }
                else {
                    line_id = masterAssayLine;
                    assay_id = masterAssay;
                    if (set.assay_name !== null && masterProtocol) {
                        var disam = _this.assayObjSets[masterProtocol][set.assay_name];
                        if (disam) {
                            assay_id = disam.selectAssayJQElement.val();
                            line_id = disam.selectLineJQElement.val();
                        }
                    }
                }
                // Same for measurement name, but resolve all three measurement fields if we find a match,
                // and only if we are resolving measurement types client-side.
                if (mode === "biolector" || mode === "std" || mode === "mdv") {
                    if (set.measurement_name !== null) {
                        var disam = _this.measurementObjSets[set.measurement_name];
                        if (disam) {
                            measurement_id = disam.typeHiddenObj.val();
                            compartment_id = disam.compHiddenObj.val() || "0";
                            units_id = disam.unitsHiddenObj.val() || "1";
                        }
                    }
                }
                // Any metadata disambiguation fields that are left unresolved, will have their metadata
                // dropped from the import in this step, because this loop is building key-value pairs where
                // the key is the chosen database id of the metadata type.  No id == not added.
                Object.keys(set.metadata_by_name).forEach(function (name) {
                    var disam = _this.metadataObjSets[name];
                    if (disam) {
                        var id = disam.metaHiddenObj.val();
                        if (id) {
                            metaData[id] = set.metadata_by_name[name];
                            metaDataPresent = true;
                        }
                    }
                });
                // If we haven't seen any timestamps during data accumulation, it means we need the user to pick
                // a master timestamp.  In that situation, any given set will have at most one data point in it,
                // with the timestamp in the data point set to 'null'.  Here we resolve it to a valid timestamp.
                // If there is no master timestamp selected, we drop the data point, but make the set anyway since
                // it might carry metadata.
                if (!seenAnyTimestamps && set.data[0]) {
                    if (!isNaN(masterTime)) {
                        data[0][0] = masterTime;
                    }
                    else {
                        data = [];
                    }
                }
                // If we have no data, and no metadata that survived resolving, don't make the set.
                if (data.length < 1 && !metaDataPresent) {
                    return;
                }
                resolvedSet = {
                    // Copy across the fields from the RawImportSet record
                    kind: set.kind,
                    line_name: set.line_name,
                    assay_name: set.assay_name,
                    measurement_name: set.measurement_name,
                    metadata_by_name: set.metadata_by_name,
                    data: data,
                    // Add new disambiguation-specific fields
                    protocol_id: masterProtocol,
                    line_id: line_id,
                    assay_id: assay_id,
                    measurement_id: measurement_id,
                    compartment_id: compartment_id,
                    units_id: units_id,
                    metadata_by_id: metaData
                };
                resolvedSets.push(resolvedSet);
            });
            return resolvedSets;
        };
        return TypeDisambiguationStep;
    })();
    EDDTableImport.TypeDisambiguationStep = TypeDisambiguationStep;
})(EDDTableImport || (EDDTableImport = {}));
$(window).load(function () {
    EDDTableImport.onWindowLoad();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzYXlUYWJsZURhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJBc3NheVRhYmxlRGF0YS50cyJdLCJuYW1lcyI6WyJFRERUYWJsZUltcG9ydCIsIkVERFRhYmxlSW1wb3J0Lm9uV2luZG93TG9hZCIsIkVERFRhYmxlSW1wb3J0Lm9uUmVmZXJlbmNlUmVjb3Jkc0xvYWQiLCJFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRDYWxsYmFjayIsIkVERFRhYmxlSW1wb3J0LnJhd0lucHV0Q2FsbGJhY2siLCJFRERUYWJsZUltcG9ydC5pZGVudGlmeVN0cnVjdHVyZXNDYWxsYmFjayIsIkVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvbkNhbGxiYWNrIiwiRUREVGFibGVJbXBvcnQuc3VibWl0Rm9ySW1wb3J0IiwiRUREVGFibGVJbXBvcnQuZGlzY2xvc2UiLCJFRERUYWJsZUltcG9ydC5TZWxlY3RNYWpvcktpbmRTdGVwIiwiRUREVGFibGVJbXBvcnQuU2VsZWN0TWFqb3JLaW5kU3RlcC5jb25zdHJ1Y3RvciIsIkVERFRhYmxlSW1wb3J0LlNlbGVjdE1ham9yS2luZFN0ZXAucXVldWVSZWNvbmZpZ3VyZSIsIkVERFRhYmxlSW1wb3J0LlNlbGVjdE1ham9yS2luZFN0ZXAucmVjb25maWd1cmUiLCJFRERUYWJsZUltcG9ydC5TZWxlY3RNYWpvcktpbmRTdGVwLmNoZWNrSW50ZXJwcmV0YXRpb25Nb2RlIiwiRUREVGFibGVJbXBvcnQuU2VsZWN0TWFqb3JLaW5kU3RlcC5jaGVja01hc3RlclByb3RvY29sIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLmNvbnN0cnVjdG9yIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnByZXZpb3VzU3RlcENoYW5nZWQiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAucXVldWVSZXByb2Nlc3NSYXdEYXRhIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnJlcHJvY2Vzc1Jhd0RhdGEiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuZmlsZURyb3BwZWQiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuZmlsZVJlYWQiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuZmlsZVJldHVybmVkRnJvbVNlcnZlciIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5wYXJzZVJhd0lucHV0IiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLmNsZWFyRHJvcFpvbmUiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuc2hvd0Ryb3Bab25lIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnJlc2V0IiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLmluZmVyVHJhbnNwb3NlU2V0dGluZyIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5pbmZlckdhcHNTZXR0aW5nIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnByb2Nlc3NNZHYiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAucGFzdGVkUmF3RGF0YSIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5pbmZlclNlcGFyYXRvclR5cGUiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuc2V0SWdub3JlR2FwcyIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5zZXRUcmFuc3Bvc2UiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuc2V0U2VwYXJhdG9yVHlwZSIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5jbGlja2VkT25JZ25vcmVEYXRhR2FwcyIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5jbGlja2VkT25UcmFuc3Bvc2UiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuc3VwcHJlc3NOb3JtYWxUYWIiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuZ2V0R3JpZCIsIkVERFRhYmxlSW1wb3J0LlR5cGVFbnVtIiwiRUREVGFibGVJbXBvcnQuVHlwZUVudW0uY29uc3RydWN0b3IiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5jb25zdHJ1Y3RvciIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAucHJldmlvdXNTdGVwQ2hhbmdlZCIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZSIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuaW5mZXJBY3RpdmVGbGFncyIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuY29uc3RydWN0RGF0YVRhYmxlIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wb3B1bGF0ZVB1bGxkb3duIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5yZWRyYXdJZ25vcmVkVmFsdWVNYXJrZXJzIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLmNoYW5nZWRSb3dEYXRhVHlwZVB1bGxkb3duIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC50b2dnbGVUYWJsZVJvdyIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAudG9nZ2xlVGFibGVDb2x1bW4iLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5pbnRlcnByZXREYXRhVGFibGUiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLmhpZ2hsaWdodGVyRiIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuc2luZ2xlVmFsdWVEaXNhYmxlckYiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLnF1ZXVlR3JhcGhSZW1ha2UiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlbWFrZUdyYXBoQXJlYSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAiLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLmNvbnN0cnVjdG9yIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5yZWNvbmZpZ3VyZSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucmVzZXREaXNhbWJpZ3VhdGlvbkZpZWxkcyIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucmVtYWtlTGluZVNlY3Rpb24iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLnJlbWFrZUFzc2F5U2VjdGlvbiIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucmVtYWtlTWVhc3VyZW1lbnRTZWN0aW9uIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5yZW1ha2VNZXRhZGF0YVNlY3Rpb24iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLmNoYW5nZWRBbnlNYXN0ZXJQdWxsZG93biIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAudXNlckNoYW5nZWRMaW5lRGlzYW0iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLnVzZXJDaGFuZ2VkQXNzYXlEaXNhbSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAudXNlckNoYW5nZWRNZWFzdXJlbWVudERpc2FtIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuZGlzYW1iaWd1YXRlQW5Bc3NheU9yTGluZSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuY3JlYXRlU2V0c0ZvclN1Ym1pc3Npb24iXSwibWFwcGluZ3MiOiJBQUFBLGdEQUFnRDtBQUNoRCxxREFBcUQ7QUFDckQsK0JBQStCO0FBaUIvQix5RUFBeUU7QUFDekUsb0dBQW9HO0FBQ3BHLHVEQUF1RDtBQUN2RCx3RkFBd0Y7QUFDeEYsc0ZBQXNGO0FBQ3RGLGdFQUFnRTtBQUNoRSxJQUFPLGNBQWMsQ0FrK0VwQjtBQWwrRUQsV0FBTyxjQUFjLEVBQUMsQ0FBQztJQUNuQkEsWUFBWUEsQ0FBQ0E7SUEwQ2JBLHNHQUFzR0E7SUFDdEdBLDZEQUE2REE7SUFDN0RBO1FBQ0lDLElBQUlBLFVBQVVBLEdBQUdBLFNBQVNBLEdBQUdBLE9BQU9BLENBQUNBLGNBQWNBLEdBQUdBLFlBQVlBLENBQUNBO1FBRW5FQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLEVBQUVBLGNBQWNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBRTNFQSxxREFBcURBO1FBQ3JEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQTtZQUNwQkEsU0FBU0EsRUFBRUEsVUFBU0EsSUFBSUE7Z0JBQ3BCLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFB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bnQiOlsiLy8gQ29tcGlsZWQgdG8gSlMgb246IEZyaSBGZWIgMTkgMjAxNiAxNTowNDo1MyAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cblxuXG5kZWNsYXJlIHZhciBBVERhdGE6IGFueTsgLy8gU2V0dXAgYnkgdGhlIHNlcnZlci5cbmRlY2xhcmUgdmFyIEVEREFUREdyYXBoaW5nOiBhbnk7XG5kZWNsYXJlIHZhciBFRERfYXV0bzogYW55O1xuXG5cbi8vIFR5cGUgbmFtZSBmb3IgdGhlIGdyaWQgb2YgdmFsdWVzIHBhc3RlZCBpblxuaW50ZXJmYWNlIFJhd0lucHV0IGV4dGVuZHMgQXJyYXk8c3RyaW5nW10+IHsgfVxuLy8gdHlwZSBmb3IgdGhlIHN0YXRzIGdlbmVyYXRlZCBmcm9tIHBhcnNpbmcgaW5wdXQgdGV4dFxuaW50ZXJmYWNlIFJhd0lucHV0U3RhdCB7XG4gICAgaW5wdXQ6IFJhd0lucHV0O1xuICAgIGNvbHVtbnM6IG51bWJlcjtcbn1cblxuXG4vLyBUaGlzIG1vZHVsZSBlbmNhcHN1bGF0ZXMgYWxsIHRoZSBjdXN0b20gY29kZSBmb3IgdGhlIGRhdGEgaW1wb3J0IHBhZ2UuXG4vLyBJdCBjb25zaXN0cyBwcmltYXJpbHkgb2YgYSBzZXJpZXMgb2YgY2xhc3NlcywgZWFjaCBjb3JyZXNwb25kaW5nIHRvIGEgc3RlcCBpbiB0aGUgaW1wb3J0IHByb2Nlc3MsXG4vLyB3aXRoIGEgY29ycmVzcG9uZGluZyBjaHVuayBvZiBVSSBvbiB0aGUgaW1wb3J0IHBhZ2UuXG4vLyBFYWNoIGNsYXNzIHB1bGxzIGRhdGEgZnJvbSBvbmUgb3IgbW9yZSBwcmV2aW91cyBzdGVwcywgZG9lcyBzb21lIGludGVybmFsIHByb2Nlc3NpbmcsXG4vLyB0aGVuIHRyaWdnZXJzIGEgY2FsbGJhY2sgZnVuY3Rpb24sIGFubm91bmNpbmcgdGhlIGF2YWlsYWJpbGl0eSBvZiBpdHMgb3duIG5ldyBkYXRhLlxuLy8gVGhlIGNhbGxiYWNrIGZ1bmN0aW9uIHRyaWdnZXJzIHRoZSBpbnN0YW5jZSBvZiB0aGUgbmV4dCBzdGVwLlxubW9kdWxlIEVERFRhYmxlSW1wb3J0IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyBEdXJpbmcgaW5pdGlhbGl6YXRpb24gd2Ugd2lsbCBhbGxvY2F0ZSBvbmUgaW5zdGFuY2Ugb2YgZWFjaCBvZiB0aGUgY2xhc3Nlc1xuICAgIC8vIHRoYXQgaGFuZGxlIHRoZSBtYWpvciBzdGVwcyBvZiB0aGUgaW1wb3J0IHByb2Nlc3MuXG4gICAgLy8gVGhlc2UgYXJlIHNwZWNpZmllZCBpbiB0aGUgb3JkZXIgdGhleSBhcmUgY2FsbGVkLCBhbmQgdGhlIG9yZGVyIHRoZXkgYXBwZWFyIG9uIHRoZSBwYWdlOlxuICAgIGV4cG9ydCB2YXIgc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICBleHBvcnQgdmFyIHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwO1xuICAgIGV4cG9ydCB2YXIgaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDogSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDtcbiAgICBleHBvcnQgdmFyIHR5cGVEaXNhbWJpZ3VhdGlvblN0ZXA6IFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXA7XG5cblxuICAgIGludGVyZmFjZSBNZWFzdXJlbWVudFZhbHVlU2VxdWVuY2Uge1xuICAgICAgICBkYXRhOnN0cmluZ1tdW107XG4gICAgfVxuXG4gICAgaW50ZXJmYWNlIEdyYXBoaW5nU2V0IGV4dGVuZHMgTWVhc3VyZW1lbnRWYWx1ZVNlcXVlbmNlIHtcbiAgICAgICAgbGFiZWw6IHN0cmluZztcbiAgICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgICB1bml0czogc3RyaW5nO1xuICAgICAgICBjb2xvcj86IHN0cmluZztcbiAgICAgICAgdGFncz86IGFueTtcbiAgICB9XG4gICAgLy8gVGhlc2UgYXJlIHJldHVybmVkIGJ5IHRoZSBzZXJ2ZXIgYWZ0ZXIgcGFyc2luZyBhIGRyb3BwZWQgZmlsZVxuICAgIGludGVyZmFjZSBSYXdJbXBvcnRTZXQgZXh0ZW5kcyBNZWFzdXJlbWVudFZhbHVlU2VxdWVuY2Uge1xuICAgICAgICBraW5kOiBzdHJpbmc7XG4gICAgICAgIGxpbmVfbmFtZTogc3RyaW5nO1xuICAgICAgICBhc3NheV9uYW1lOiBzdHJpbmc7XG4gICAgICAgIG1lYXN1cmVtZW50X25hbWU6IHN0cmluZztcbiAgICAgICAgbWV0YWRhdGFfYnlfbmFtZT86IHtbaWQ6c3RyaW5nXTogc3RyaW5nfSxcbiAgICB9XG4gICAgLy8gVGhpcyBpbmZvcm1hdGlvbiBpcyBhZGRlZCBwb3N0LWRpc2FtYmlndWF0aW9uLCBpbiBhZGRpdGlvbiB0byB0aGUgZmllbGRzIGZyb20gUmF3SW1wb3J0U2V0LCBhbmQgc2VudCB0byB0aGUgc2VydmVyXG4gICAgaW50ZXJmYWNlIFJlc29sdmVkSW1wb3J0U2V0IGV4dGVuZHMgUmF3SW1wb3J0U2V0IHtcbiAgICAgICAgcHJvdG9jb2xfaWQ6c3RyaW5nO1xuICAgICAgICBsaW5lX2lkOnN0cmluZzsgICAgLy8gVmFsdWUgb2YgJ251bGwnIG9yIHN0cmluZyAnbmV3JyBpbmRpY2F0ZXMgbmV3IExpbmUgc2hvdWxkIGJlIGNyZWF0ZWQgd2l0aCBuYW1lIGxpbmVfbmFtZS4gXG4gICAgICAgIGFzc2F5X2lkOnN0cmluZztcbiAgICAgICAgbWVhc3VyZW1lbnRfaWQ6c3RyaW5nO1xuICAgICAgICBjb21wYXJ0bWVudF9pZDpzdHJpbmc7XG4gICAgICAgIHVuaXRzX2lkOnN0cmluZztcbiAgICAgICAgbWV0YWRhdGFfYnlfaWQ6e1tpZDpzdHJpbmddOiBzdHJpbmd9O1xuICAgIH1cblxuXG4gICAgLy8gQXMgc29vbiBhcyB0aGUgd2luZG93IGxvYWQgc2lnbmFsIGlzIHNlbnQsIGNhbGwgYmFjayB0byB0aGUgc2VydmVyIGZvciB0aGUgc2V0IG9mIHJlZmVyZW5jZSByZWNvcmRzXG4gICAgLy8gdGhhdCB3aWxsIGJlIHVzZWQgdG8gZGlzYW1iaWd1YXRlIGxhYmVscyBpbiBpbXBvcnRlZCBkYXRhLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBvbldpbmRvd0xvYWQoKTogdm9pZCB7XG4gICAgICAgIHZhciBhdGRhdGFfdXJsID0gXCIvc3R1ZHkvXCIgKyBFREREYXRhLmN1cnJlbnRTdHVkeUlEICsgXCIvYXNzYXlkYXRhXCI7XG5cbiAgICAgICAgJCgnLmRpc2Nsb3NlJykuZmluZCgnYS5kaXNjbG9zZUxpbmsnKS5vbignY2xpY2snLCBFRERUYWJsZUltcG9ydC5kaXNjbG9zZSk7XG5cbiAgICAgICAgLy8gUG9wdWxhdGUgQVREYXRhIGFuZCBFREREYXRhIG9iamVjdHMgdmlhIEFKQVggY2FsbHNcbiAgICAgICAgalF1ZXJ5LmFqYXgoYXRkYXRhX3VybCwge1xuICAgICAgICAgICAgXCJzdWNjZXNzXCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICBBVERhdGEgPSBkYXRhLkFURGF0YTtcbiAgICAgICAgICAgICAgICAkLmV4dGVuZChFREREYXRhLCBkYXRhLkVERERhdGEpO1xuICAgICAgICAgICAgICAgIEVERFRhYmxlSW1wb3J0Lm9uUmVmZXJlbmNlUmVjb3Jkc0xvYWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkuZmFpbChmdW5jdGlvbih4LCBzLCBlKSB7XG4gICAgICAgICAgICBhbGVydChzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBBcyBzb29uIGFzIHdlJ3ZlIGdvdCBhbmQgcGFyc2VkIHRoZSByZWZlcmVuY2UgZGF0YSwgd2UgY2FuIHNldCB1cCBhbGwgdGhlIGNhbGxiYWNrcyBmb3IgdGhlIFVJLFxuICAgIC8vIGVmZmVjdGl2ZWx5IHR1cm5pbmcgdGhlIHBhZ2UgXCJvblwiLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBvblJlZmVyZW5jZVJlY29yZHNMb2FkKCk6IHZvaWQge1xuXG4gICAgICAgIC8vIEFsbG9jYXRlIG9uZSBpbnN0YW5jZSBvZiBlYWNoIHN0ZXAsIHByb3ZpZGluZyByZWZlcmVuY2VzIHRvIHRoZSBwcmV2aW91cyBzdGVwcyBhcyBuZWVkZWQuXG4gICAgICAgIHZhciBhID0gbmV3IFNlbGVjdE1ham9yS2luZFN0ZXAoRUREVGFibGVJbXBvcnQuc2VsZWN0TWFqb3JLaW5kQ2FsbGJhY2spO1xuICAgICAgICB2YXIgYiA9IG5ldyBSYXdJbnB1dFN0ZXAoYSwgRUREVGFibGVJbXBvcnQucmF3SW5wdXRDYWxsYmFjayk7XG4gICAgICAgIHZhciBjID0gbmV3IElkZW50aWZ5U3RydWN0dXJlc1N0ZXAoYSwgYiwgRUREVGFibGVJbXBvcnQuaWRlbnRpZnlTdHJ1Y3R1cmVzQ2FsbGJhY2spO1xuICAgICAgICB2YXIgZCA9IG5ldyBUeXBlRGlzYW1iaWd1YXRpb25TdGVwKGEsIGMsIEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvbkNhbGxiYWNrKTtcblxuICAgICAgICBFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRTdGVwID0gYTtcbiAgICAgICAgRUREVGFibGVJbXBvcnQucmF3SW5wdXRTdGVwID0gYjtcbiAgICAgICAgRUREVGFibGVJbXBvcnQuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCA9IGM7XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAgPSBkO1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlIGZ1bmN0aW9uIHRoYXQgc3VibWl0cyB0aGUgcGFnZVxuICAgICAgICAkKCcjc3VibWl0Rm9ySW1wb3J0Jykub24oJ2NsaWNrJywgRUREVGFibGVJbXBvcnQuc3VibWl0Rm9ySW1wb3J0KTtcblxuICAgICAgICAvLyBXZSBuZWVkIHRvIG1hbnVhbGx5IHRyaWdnZXIgdGhpcywgYWZ0ZXIgYWxsIG91ciBzdGVwcyBhcmUgY29uc3RydWN0ZWQuXG4gICAgICAgIC8vIFRoaXMgd2lsbCBjYXNjYWRlIGNhbGxzIHRocm91Z2ggdGhlIHJlc3Qgb2YgdGhlIHN0ZXBzIGFuZCBjb25maWd1cmUgdGhlbSB0b28uXG4gICAgICAgIGEucmVjb25maWd1cmUoKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGJ5IG91ciBpbnN0YW5jZSBvZiBzZWxlY3RNYWpvcktpbmRTdGVwIHRvIGFubm91bmNlIGNoYW5nZXMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdE1ham9yS2luZENhbGxiYWNrKCk6IHZvaWQge1xuICAgICAgICAvLyBUaGlzIGlzIGEgYml0IG9mIGEgaGFjay4gIFdlIHdhbnQgdG8gY2hhbmdlIHRoZSBwdWxsZG93biBzZXR0aW5ncyBpbiBTdGVwIDMgaWYgdGhlIG1vZGUgaW4gU3RlcCAxIGlzIGNoYW5nZWQsXG4gICAgICAgIC8vIGJ1dCBsZWF2ZSB0aGUgcHVsbGRvd24gYWxvbmUgb3RoZXJ3aXNlIChpbmNsdWRpbmcgd2hlbiBTdGVwIDIgYW5ub3VuY2VzIGl0cyBvd24gY2hhbmdlcy4pXG4gICAgICAgIC8vIFRPRE86IE1ha2UgU3RlcCAzIHRyYWNrIHRoaXMgd2l0aCBhbiBpbnRlcm5hbCB2YXJpYWJsZS5cbiAgICAgICAgaWYgKEVERFRhYmxlSW1wb3J0LnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlID09ICdtZHYnKSB7XG4gICAgICAgICAgICAvLyBBIGRlZmF1bHQgc2V0IG9mIHB1bGxkb3duIHNldHRpbmdzIGZvciB0aGlzIG1vZGVcbiAgICAgICAgICAgIEVERFRhYmxlSW1wb3J0LmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucHVsbGRvd25TZXR0aW5ncyA9IFtUeXBlRW51bS5Bc3NheV9MaW5lX05hbWVzLCBUeXBlRW51bS5NZXRhYm9saXRlX05hbWVdO1xuICAgICAgICB9XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnJhd0lucHV0U3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkKCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBieSBvdXIgaW5zdGFuY2Ugb2YgU3RlcCAyLCBSYXdJbnB1dFN0ZXAgdG8gYW5ub3VuY2UgY2hhbmdlcy5cbiAgICAvLyBXZSBqdXN0IHBhc3MgdGhlIHNpZ25hbCBhbG9uZyB0byBTdGVwIDM6IElkZW50aWZ5U3RydWN0dXJlc1N0ZXAuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJhd0lucHV0Q2FsbGJhY2soKTogdm9pZCB7XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucHJldmlvdXNTdGVwQ2hhbmdlZCgpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYnkgb3VyIGluc3RhbmNlIG9mIFN0ZXAgMywgSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCB0byBhbm5vdW5jZSBjaGFuZ2VzLlxuICAgIC8vIFdlIGp1c3QgcGFzcyB0aGUgc2lnbmFsIGFsb25nIHRvIFN0ZXAgNDogVHlwZURpc2FtYmlndWF0aW9uU3RlcC5cbiAgICBleHBvcnQgZnVuY3Rpb24gaWRlbnRpZnlTdHJ1Y3R1cmVzQ2FsbGJhY2soKTogdm9pZCB7XG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucHJldmlvdXNTdGVwQ2hhbmdlZCgpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYnkgb3VyIGluc3RhbmNlIG9mIFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAgdG8gYW5ub3VuY2UgY2hhbmdlcy5cbiAgICAvLyBBbGwgd2UgZG8gY3VycmVudGx5IGlzIHJlcG9wdWxhdGUgdGhlIGRlYnVnIGFyZWEuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHR5cGVEaXNhbWJpZ3VhdGlvbkNhbGxiYWNrKCk6IHZvaWQge1xuLy8gICAgICAgIHZhciBwYXJzZWRTZXRzID0gRUREVGFibGVJbXBvcnQuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wYXJzZWRTZXRzO1xuICAgICAgICB2YXIgcmVzb2x2ZWRTZXRzID0gRUREVGFibGVJbXBvcnQudHlwZURpc2FtYmlndWF0aW9uU3RlcC5jcmVhdGVTZXRzRm9yU3VibWlzc2lvbigpO1xuICAgICAgICAvLyBpZiB0aGUgZGVidWcgYXJlYSBpcyB0aGVyZSwgc2V0IGl0cyB2YWx1ZSB0byBKU09OIG9mIHBhcnNlZCBzZXRzXG4vLyAgICAgICAgJCgnI2pzb25kZWJ1Z2FyZWEnKS52YWwoSlNPTi5zdHJpbmdpZnkocmVzb2x2ZWRTZXRzKSk7XG4gICAgfVxuXG5cbiAgICAvLyBXaGVuIHRoZSBzdWJtaXQgYnV0dG9uIGlzIHB1c2hlZCwgZmV0Y2ggdGhlIG1vc3QgcmVjZW50IHJlY29yZCBzZXRzIGZyb20gb3VyIElkZW50aWZ5U3RydWN0dXJlc1N0ZXAgaW5zdGFuY2UsXG4gICAgLy8gYW5kIGVtYmVkIHRoZW0gaW4gdGhlIGhpZGRlbiBmb3JtIGZpZWxkIHRoYXQgd2lsbCBiZSBzdWJtaXR0ZWQgdG8gdGhlIHNlcnZlci5cbiAgICAvLyBOb3RlIHRoYXQgdGhpcyBpcyBub3QgYWxsIHRoYXQgdGhlIHNlcnZlciBuZWVkcywgaW4gb3JkZXIgdG8gc3VjY2Vzc2Z1bGx5IHByb2Nlc3MgYW4gaW1wb3J0LlxuICAgIC8vIEl0IGFsc28gcmVhZHMgb3RoZXIgZm9ybSBlbGVtZW50cyBmcm9tIHRoZSBwYWdlLCBjcmVhdGVkIGJ5IFNlbGVjdE1ham9yS2luZFN0ZXAgYW5kIFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHN1Ym1pdEZvckltcG9ydCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIGpzb246IHN0cmluZztcbiAgICAgICAgdmFyIHJlc29sdmVkU2V0cyA9IEVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuY3JlYXRlU2V0c0ZvclN1Ym1pc3Npb24oKTtcbiAgICAgICAganNvbiA9IEpTT04uc3RyaW5naWZ5KHJlc29sdmVkU2V0cyk7XG4gICAgICAgICQoJyNqc29ub3V0cHV0JykudmFsKGpzb24pO1xuICAgICAgICAkKCcjanNvbmRlYnVnYXJlYScpLnZhbChqc29uKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1c3VhbCBjbGljay10by1kaXNjbG9zZSBjYWxsYmFjay4gIFBlcmhhcHMgdGhpcyBzaG91bGQgYmUgaW4gVXRsLnRzP1xuICAgIGV4cG9ydCBmdW5jdGlvbiBkaXNjbG9zZSgpOiBib29sZWFuIHtcbiAgICAgICAgJCh0aGlzKS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgZXZlcnl0aGluZyBpbiB0aGUgXCJTdGVwIDFcIiBib3ggdGhhdCB5b3Ugc2VlIG9uIHRoZSBkYXRhIGltcG9ydCBwYWdlLlxuICAgIC8vIEhlcmUgd2UgcHJvdmlkZSBVSSBmb3Igc2VsZWN0aW5nIHRoZSBtYWpvciBraW5kIG9mIGltcG9ydCwgYW5kIHRoZSBQcm90b2NvbCB0aGF0IHRoZSBkYXRhIHNob3VsZCBiZSBzdG9yZWQgdW5kZXIuXG4gICAgLy8gVGhlc2UgY2hvaWNlcyBhZmZlY3QgdGhlIGJlaGF2aW9yIG9mIGFsbCBzdWJzZXF1ZW50IHN0ZXBzLlxuICAgIGV4cG9ydCBjbGFzcyBTZWxlY3RNYWpvcktpbmRTdGVwIHtcblxuICAgICAgICAvLyBUaGUgUHJvdG9jb2wgZm9yIHdoaWNoIHdlIHdpbGwgYmUgaW1wb3J0aW5nIGRhdGEuXG4gICAgICAgIG1hc3RlclByb3RvY29sOiBudW1iZXI7XG4gICAgICAgIC8vIFRoZSBtYWluIG1vZGUgd2UgYXJlIGludGVycHJldGluZyBkYXRhIGluLlxuICAgICAgICAvLyBWYWxpZCB2YWx1ZXMgc29mYXIgYXJlIFwic3RkXCIsIFwibWR2XCIsIFwidHJcIiwgXCJwclwiLCBhbmQgXCJiaW9sZWN0b3JcIi5cbiAgICAgICAgaW50ZXJwcmV0YXRpb25Nb2RlOiBzdHJpbmc7XG4gICAgICAgIGlucHV0UmVmcmVzaFRpbWVySUQ6IG51bWJlcjtcblxuICAgICAgICBuZXh0U3RlcENhbGxiYWNrOiBhbnk7XG5cblxuICAgICAgICBjb25zdHJ1Y3RvcihuZXh0U3RlcENhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgICAgIHRoaXMubWFzdGVyUHJvdG9jb2wgPSAwO1xuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXRhdGlvbk1vZGUgPSBudWxsOyAgICAvLyBXZSByZWx5IG9uIGEgc2VwYXJhdGUgY2FsbCB0byByZWNvbmZpZ3VyZSgpIHRvIHNldCB0aGlzIHByb3Blcmx5LlxuICAgICAgICAgICAgdGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEID0gbnVsbDtcblxuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrID0gbmV4dFN0ZXBDYWxsYmFjaztcblxuICAgICAgICAgICAgdmFyIHJlUHJvY2Vzc09uQ2hhbmdlOiBzdHJpbmdbXTtcblxuICAgICAgICAgICAgcmVQcm9jZXNzT25DaGFuZ2UgPSBbJyNzdGRsYXlvdXQnLCAnI3RybGF5b3V0JywgJyNwcmxheW91dCcsICcjbWR2bGF5b3V0JywgJyNiaW9sZWN0b3JsYXlvdXQnXTtcblxuICAgICAgICAgICAgLy8gVGhpcyBpcyByYXRoZXIgYSBsb3Qgb2YgY2FsbGJhY2tzLCBidXQgd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UncmVcbiAgICAgICAgICAgIC8vIHRyYWNraW5nIHRoZSBtaW5pbXVtIG51bWJlciBvZiBlbGVtZW50cyB3aXRoIHRoaXMgY2FsbCwgc2luY2UgdGhlXG4gICAgICAgICAgICAvLyBmdW5jdGlvbiBjYWxsZWQgaGFzIHN1Y2ggc3Ryb25nIGVmZmVjdHMgb24gdGhlIHJlc3Qgb2YgdGhlIHBhZ2UuXG4gICAgICAgICAgICAvLyBGb3IgZXhhbXBsZSwgYSB1c2VyIHNob3VsZCBiZSBmcmVlIHRvIGNoYW5nZSBcIm1lcmdlXCIgdG8gXCJyZXBsYWNlXCIgd2l0aG91dCBoYXZpbmdcbiAgICAgICAgICAgIC8vIHRoZWlyIGVkaXRzIGluIFN0ZXAgMiBlcmFzZWQuXG4gICAgICAgICAgICAkKFwiI21hc3RlclByb3RvY29sXCIpLmNoYW5nZSh0aGlzLnJlY29uZmlndXJlLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAvLyBVc2luZyBcImNoYW5nZVwiIGZvciB0aGVzZSBiZWNhdXNlIGl0J3MgbW9yZSBlZmZpY2llbnQgQU5EIGJlY2F1c2UgaXQgd29ya3MgYXJvdW5kIGFuXG4gICAgICAgICAgICAvLyBpcnJpdGF0aW5nIENocm9tZSBpbmNvbnNpc3RlbmN5XG4gICAgICAgICAgICAvLyBGb3Igc29tZSBvZiB0aGVzZSwgY2hhbmdpbmcgdGhlbSBzaG91bGRuJ3QgYWN0dWFsbHkgYWZmZWN0IHByb2Nlc3NpbmcgdW50aWwgd2UgaW1wbGVtZW50XG4gICAgICAgICAgICAvLyBhbiBvdmVyd3JpdGUtY2hlY2tpbmcgZmVhdHVyZSBvciBzb21ldGhpbmcgc2ltaWxhclxuICAgICAgICAgICAgJChyZVByb2Nlc3NPbkNoYW5nZS5qb2luKCcsJykpLm9uKCdjbGljaycsIHRoaXMucXVldWVSZWNvbmZpZ3VyZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByZWNvbmZpZ3VyZSByb3V0aW5lLlxuICAgICAgICAvLyBUaGlzIHdheSB3ZSBjb25kZW5zZSBtdWx0aXBsZSBwb3NzaWJsZSBldmVudHMgZnJvbSB0aGUgcmFkaW8gYnV0dG9ucyBhbmQvb3IgcHVsbGRvd24gaW50byBvbmUuXG4gICAgICAgIHF1ZXVlUmVjb25maWd1cmUoKTogdm9pZCB7XG4gICAgICAgICAgICBpZiAodGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaW5wdXRSZWZyZXNoVGltZXJJRCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KHRoaXMucmVjb25maWd1cmUuYmluZCh0aGlzKSwgNSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJlYWQgdGhlIHNldHRpbmdzIG91dCBvZiB0aGUgVUkgYW5kIHBhc3MgYWxvbmcuXG4gICAgICAgIC8vIElmIHRoZSBpbnRlcnByZXRhdGlvbiBtb2RlIGhhcyBjaGFuZ2VkLCBhbGwgdGhlIHN1YnNlcXVlbnQgc3RlcHMgd2lsbCBuZWVkIGEgcmVmcmVzaC5cbiAgICAgICAgLy8gSWYgdGhlIG1hc3RlciBQcm90b2NvbCBwdWxsZG93biBoYXMgY2hhbmdlZCwgU3RlcCA0IHdpbGwgbmVlZCBhIHJlZnJlc2gsXG4gICAgICAgIC8vIHNwZWNpZmljYWxseSB0aGUgbWFzdGVyIEFzc2F5IHB1bGxkb3duIGFuZCBBc3NheS9MaW5lIGRpc2FtYmlndWF0aW9uIHNlY3Rpb24uXG4gICAgICAgIHJlY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gRG9uJ3QgaW5saW5lIHRoZXNlIGludG8gdGhlIGlmIHN0YXRlbWVudCBvciB0aGUgc2Vjb25kIG9uZSBtaWdodCBub3QgYmUgY2FsbGVkIVxuICAgICAgICAgICAgdmFyIGE6Ym9vbGVhbiA9IHRoaXMuY2hlY2tJbnRlcnByZXRhdGlvbk1vZGUoKTtcbiAgICAgICAgICAgIHZhciBiOmJvb2xlYW4gPSB0aGlzLmNoZWNrTWFzdGVyUHJvdG9jb2woKTtcbiAgICAgICAgICAgIGlmIChhIHx8IGIpIHsgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7IH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSWYgdGhlIGludGVycHJldGF0aW9uIG1vZGUgdmFsdWUgaGFzIGNoYW5nZWQsIG5vdGUgdGhlIGNoYW5nZSBhbmQgcmV0dXJuICd0cnVlJy5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHJldHVybiAnZmFsc2UnLlxuICAgICAgICBjaGVja0ludGVycHJldGF0aW9uTW9kZSgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIC8vIEZpbmQgZXZlcnkgaW5wdXQgZWxlbWVudCBvZiB0eXBlICdyYWRpbycgd2l0aCB0aGUgbmFtZSBhdHRyaWJ1dGUgb2YgJ2RhdGFsYXlvdXQnIHRoYXQncyBjaGVja2VkLlxuICAgICAgICAgICAgLy8gU2hvdWxkIHJldHVybiAwIG9yIDEgZWxlbWVudHMuXG4gICAgICAgICAgICB2YXIgbW9kZVJhZGlvID0gJChcImlucHV0W3R5cGU9J3JhZGlvJ11bbmFtZT0nZGF0YWxheW91dCddOmNoZWNrZWRcIik7XG4gICAgICAgICAgICAvLyBJZiBub25lIG9mIHRoZW0gYXJlIGNoZWNrZWQsIHdlIGRvbid0IGhhdmUgZW5vdWdoIGluZm9ybWF0aW9uIHRvIGhhbmRsZSBhbnkgbmV4dCBzdGVwcy5cbiAgICAgICAgICAgIGlmIChtb2RlUmFkaW8ubGVuZ3RoIDwgMSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgIHZhciByYWRpb1ZhbHVlID0gbW9kZVJhZGlvLnZhbCgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJwcmV0YXRpb25Nb2RlID09IHJhZGlvVmFsdWUpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICB0aGlzLmludGVycHJldGF0aW9uTW9kZSA9IHJhZGlvVmFsdWU7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSWYgdGhlIG1hc3RlciBQcm90b2NvbCBwdWxsZG93biB2YWx1ZSBoYXMgY2hhbmdlZCwgbm90ZSB0aGUgY2hhbmdlIGFuZCByZXR1cm4gJ3RydWUnLlxuICAgICAgICAvLyBPdGhlcndpc2UgcmV0dXJuICdmYWxzZScuXG4gICAgICAgIGNoZWNrTWFzdGVyUHJvdG9jb2woKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbEluID0gJCgnI21hc3RlclByb3RvY29sJyk7XG4gICAgICAgICAgICB2YXIgcCA9IHBhcnNlSW50KHByb3RvY29sSW4udmFsKCksIDEwKTtcbiAgICAgICAgICAgIGlmICh0aGlzLm1hc3RlclByb3RvY29sID09PSBwKSB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgdGhpcy5tYXN0ZXJQcm90b2NvbCA9IHA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyBUaGUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGV2ZXJ5dGhpbmcgaW4gdGhlIFwiU3RlcCAyXCIgYm94IHRoYXQgeW91IHNlZSBvbiB0aGUgZGF0YSBpbXBvcnQgcGFnZS5cbiAgICAvLyBJdCBuZWVkcyB0byBwYXJzZSB0aGUgcmF3IGRhdGEgZnJvbSB0eXBpbmcgb3IgcGFzdGluZyBpbiB0aGUgaW5wdXQgYm94LCBvciBhIGRyYWdnZWQtaW4gZmlsZSxcbiAgICAvLyBpbnRvIGEgbnVsbC1wYWRkZWQgcmVjdGFuZ3VsYXIgZ3JpZCB0aGF0IGNhbiBiZSBlYXNpbHkgdXNlZCBieSB0aGUgbmV4dCBzdGVwLlxuICAgIC8vIERlcGVuZGluZyBvbiB0aGUga2luZCBvZiBpbXBvcnQgY2hvc2VuIGluIFN0ZXAgMSwgdGhpcyBzdGVwIHdpbGwgYWNjZXB0IGRpZmZlcmVudCBraW5kcyBvZiBmaWxlcyxcbiAgICAvLyBhbmQgaGFuZGxlIHRoZSBmaWxlIGRyYWcgaW4gZGlmZmVyZW50IHdheXMuXG4gICAgLy8gRm9yIGV4YW1wbGUsIHdoZW4gdGhlIGltcG9ydCBraW5kIGlzIFwiU3RhbmRhcmRcIiBhbmQgdGhlIHVzZXIgZHJhZ3MgaW4gYSBDU1YgZmlsZSwgdGhlIGZpbGUgaXMgcGFyc2VkXG4gICAgLy8gaW4tYnJvd3NlciBhbmQgdGhlIGNvbnRlbnRzIGFyZSBwbGFjZWQgaW4gdGhlIHRleHQgYm94LiAgV2hlbiB0aGUgaW1wb3J0IGtpbmQgaXMgXCJiaW9sZWN0b3JcIiBhbmQgdGhlIHVzZXJcbiAgICAvLyBkcmFncyBpbiBhbiBYTUwgZmlsZSwgdGhlIGZpbGUgaXMgc2VudCB0byB0aGUgc2VydmVyIGFuZCBwYXJzZWQgdGhlcmUsIGFuZCB0aGUgcmVzdWx0aW5nIGRhdGEgaXMgcGFzc2VkXG4gICAgLy8gYmFjayB0byB0aGUgYnJvd3NlciBhbmQgcGxhY2VkIGluIHRoZSB0ZXh0IGJveC5cbiAgICBleHBvcnQgY2xhc3MgUmF3SW5wdXRTdGVwIHtcblxuICAgICAgICAvLyBUaGlzIGlzIHdoZXJlIHdlIG9yZ2FuaXplIHJhdyBkYXRhIHBhc3RlZCBpbnRvIHRoZSB0ZXh0IGJveCBieSB0aGUgdXNlcixcbiAgICAgICAgLy8gb3IgcGxhY2VkIHRoZXJlIGFzIGEgcmVzdWx0IG9mIHNlcnZlci1zaWRlIHByb2Nlc3NpbmcgLSBsaWtlIHRha2luZyBhcGFydCBhIGRyb3BwZWQgRXhjZWwgZmlsZS5cblxuICAgICAgICBwcml2YXRlIGdyaWRGcm9tVGV4dEZpZWxkOiBhbnlbXTtcbiAgICAgICAgZ3JpZFJvd01hcmtlcnM6IGFueVtdO1xuXG4gICAgICAgIC8vIFRoaXMgaXMgd2hlcmUgd2UgaGFuZGxlIGRyb3BwZWQgZmlsZXMsIGFuZCB0aGUgc2VtaS1wcm9jZXNzZWQgcmVjb3JkIHNldHMgdGhhdCB0aGUgc2VydmVyIHJldHVybnMsXG4gICAgICAgIC8vIGZyb20gaW50ZXJwcmV0aW5nIGFuIFhNTCBCaW9sZWN0b3IgZmlsZSBmb3IgZXhhbXBsZS5cblxuICAgICAgICBhY3RpdmVEcmFnZ2VkRmlsZTogYW55O1xuICAgICAgICBwcm9jZXNzZWRTZXRzRnJvbUZpbGU6IGFueVtdO1xuICAgICAgICBwcm9jZXNzZWRTZXRzQXZhaWxhYmxlOiBib29sZWFuO1xuICAgICAgICBmaWxlVXBsb2FkUHJvZ3Jlc3NCYXI6IFV0bC5Qcm9ncmVzc0JhcjtcblxuICAgICAgICAvLyBBZGRpdGlvbmFsIG9wdGlvbnMgZm9yIGludGVycHJldGluZyB0ZXh0IGJveCBkYXRhLCBleHBvc2VkIGluIHRoZSBVSSBmb3IgdGhlIHVzZXIgdG8gdHdlYWsuXG4gICAgICAgIC8vIFNvbWV0aW1lcyBzZXQgYXV0b21hdGljYWxseSBieSBjZXJ0YWluIGltcG9ydCBtb2RlcywgbGlrZSB0aGUgXCJtZHZcIiBtb2RlLlxuXG4gICAgICAgIHRyYW5zcG9zZTogYm9vbGVhbjtcbiAgICAgICAgLy8gSWYgdGhlIHVzZXIgZGVsaWJlcmF0ZWx5IGNob3NlIHRvIHRyYW5zcG9zZSBvciBub3QgdHJhbnNwb3NlLCBkaXNhYmxlIHRoZSBhdHRlbXB0XG4gICAgICAgIC8vIHRvIGF1dG8tZGV0ZXJtaW5lIHRyYW5zcG9zaXRpb24uXG4gICAgICAgIHVzZXJDbGlja2VkT25UcmFuc3Bvc2U6IGJvb2xlYW47XG4gICAgICAgIC8vIFdoZXRoZXIgdG8gaW50ZXJwcmV0IHRoZSBwYXN0ZWQgZGF0YSByb3ctd2lzZSBvciBjb2x1bW4td2lzZSwgd2hlbiBpbXBvcnRpbmdcbiAgICAgICAgLy8gZWl0aGVyIG1lYXN1cmVtZW50cyBvciBtZXRhZGF0YS5cbiAgICAgICAgaWdub3JlRGF0YUdhcHM6IGJvb2xlYW47XG4gICAgICAgIHVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2FwczogYm9vbGVhbjtcbiAgICAgICAgc2VwYXJhdG9yVHlwZTogc3RyaW5nO1xuXG4gICAgICAgIGlucHV0UmVmcmVzaFRpbWVySUQ6IGFueTtcblxuICAgICAgICBzZWxlY3RNYWpvcktpbmRTdGVwOiBTZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICBuZXh0U3RlcENhbGxiYWNrOiBhbnk7XG5cblxuICAgICAgICBjb25zdHJ1Y3RvcihzZWxlY3RNYWpvcktpbmRTdGVwOiBTZWxlY3RNYWpvcktpbmRTdGVwLCBuZXh0U3RlcENhbGxiYWNrOiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwID0gc2VsZWN0TWFqb3JLaW5kU3RlcDtcblxuICAgICAgICAgICAgdGhpcy5ncmlkRnJvbVRleHRGaWVsZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRTZXRzRnJvbUZpbGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkU2V0c0F2YWlsYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5ncmlkUm93TWFya2VycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy50cmFuc3Bvc2UgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudXNlckNsaWNrZWRPblRyYW5zcG9zZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pZ25vcmVEYXRhR2FwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy51c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuc2VwYXJhdG9yVHlwZSA9ICdjc3YnO1xuICAgICAgICAgICAgdGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEID0gbnVsbDtcblxuICAgICAgICAgICAgJCgnI3N0ZXAydGV4dGFyZWEnKVxuICAgICAgICAgICAgICAgIC5vbigncGFzdGUnLCB0aGlzLnBhc3RlZFJhd0RhdGEuYmluZCh0aGlzKSlcbiAgICAgICAgICAgICAgICAub24oJ2tleXVwJywgdGhpcy5xdWV1ZVJlcHJvY2Vzc1Jhd0RhdGEuYmluZCh0aGlzKSlcbiAgICAgICAgICAgICAgICAub24oJ2tleWRvd24nLCB0aGlzLnN1cHByZXNzTm9ybWFsVGFiLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAvLyBVc2luZyBcImNoYW5nZVwiIGZvciB0aGVzZSBiZWNhdXNlIGl0J3MgbW9yZSBlZmZpY2llbnQgQU5EIGJlY2F1c2UgaXQgd29ya3MgYXJvdW5kIGFuXG4gICAgICAgICAgICAvLyBpcnJpdGF0aW5nIENocm9tZSBpbmNvbnNpc3RlbmN5XG4gICAgICAgICAgICAvLyBGb3Igc29tZSBvZiB0aGVzZSwgY2hhbmdpbmcgdGhlbSBzaG91bGRuJ3QgYWN0dWFsbHkgYWZmZWN0IHByb2Nlc3NpbmcgdW50aWwgd2UgaW1wbGVtZW50XG4gICAgICAgICAgICAvLyBhbiBvdmVyd3JpdGUtY2hlY2tpbmcgZmVhdHVyZSBvciBzb21ldGhpbmcgc2ltaWxhclxuXG4gICAgICAgICAgICAkKCcjcmF3ZGF0YWZvcm1hdHAnKS5vbignY2hhbmdlJywgdGhpcy5xdWV1ZVJlcHJvY2Vzc1Jhd0RhdGEuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAkKCcjaWdub3JlR2FwcycpLm9uKCdjaGFuZ2UnLCB0aGlzLmNsaWNrZWRPbklnbm9yZURhdGFHYXBzLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgJCgnI3RyYW5zcG9zZScpLm9uKCdjaGFuZ2UnLCB0aGlzLmNsaWNrZWRPblRyYW5zcG9zZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgICQoJyNyZXNldHN0ZXAyJykub24oJ2NsaWNrJywgdGhpcy5yZXNldC5iaW5kKHRoaXMpKTtcblxuICAgICAgICAgICAgdGhpcy5maWxlVXBsb2FkUHJvZ3Jlc3NCYXIgPSBuZXcgVXRsLlByb2dyZXNzQmFyKCdmaWxlVXBsb2FkUHJvZ3Jlc3NCYXInKTtcblxuICAgICAgICAgICAgVXRsLkZpbGVEcm9wWm9uZS5jcmVhdGUoe1xuICAgICAgICAgICAgICAgIGVsZW1lbnRJZDogXCJzdGVwMnRleHRhcmVhXCIsXG4gICAgICAgICAgICAgICAgZmlsZUluaXRGbjogdGhpcy5maWxlRHJvcHBlZC5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgIHByb2Nlc3NSYXdGbjogdGhpcy5maWxlUmVhZC5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgIHVybDogXCIvdXRpbGl0aWVzL3BhcnNlZmlsZVwiLFxuICAgICAgICAgICAgICAgIHByb2Nlc3NSZXNwb25zZUZuOiB0aGlzLmZpbGVSZXR1cm5lZEZyb21TZXJ2ZXIuYmluZCh0aGlzKSxcbiAgICAgICAgICAgICAgICBwcm9ncmVzc0JhcjogdGhpcy5maWxlVXBsb2FkUHJvZ3Jlc3NCYXJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5jbGVhckRyb3Bab25lKCk7XG4gICAgICAgICAgICB0aGlzLnF1ZXVlUmVwcm9jZXNzUmF3RGF0YSgpO1xuXG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2sgPSBuZXh0U3RlcENhbGxiYWNrO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJbiBwcmFjdGljZSwgdGhlIG9ubHkgdGltZSB0aGlzIHdpbGwgYmUgY2FsbGVkIGlzIHdoZW4gU3RlcCAxIGNoYW5nZXMsXG4gICAgICAgIC8vIHdoaWNoIG1heSBjYWxsIGZvciBhIHJlY29uZmlndXJhdGlvbiBvZiB0aGUgY29udHJvbHMgaW4gdGhpcyBzdGVwLlxuICAgICAgICBwcmV2aW91c1N0ZXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuXG4gICAgICAgICAgICAvLyBCeSBkZWZhdWx0LCBvdXIgZHJvcCB6b25lIHdhbnRzIGV4Y2VsIG9yIGNzdiBmaWxlcywgc28gd2UgY2xlYXIgYWRkaXRpb25hbCBjbGFzczpcbiAgICAgICAgICAgICQoJyNzdGVwMnRleHRhcmVhJykucmVtb3ZlQ2xhc3MoJ3htbCcpO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ2Jpb2xlY3RvcicpIHtcbiAgICAgICAgICAgICAgICAvLyBCaW9sZWN0b3IgZGF0YSBpcyBleHBlY3RlZCBpbiBYTUwgZm9ybWF0LlxuICAgICAgICAgICAgICAgICQoJyNzdGVwMnRleHRhcmVhJykuYWRkQ2xhc3MoJ3htbCcpO1xuICAgICAgICAgICAgICAgIC8vIEl0IGlzIGFsc28gZXhwZWN0ZWQgdG8gYmUgZHJvcHBlZCBmcm9tIGEgZmlsZS5cbiAgICAgICAgICAgICAgICAvLyBTbyBlaXRoZXIgd2UncmUgYWxyZWFkeSBpbiBmaWxlIG1vZGUgYW5kIHRoZXJlIGFyZSBhbHJlYWR5IHBhcnNlZCBzZXRzIGF2YWlsYWJsZSxcbiAgICAgICAgICAgICAgICAvLyBPciB3ZSBhcmUgaW4gdGV4dCBlbnRyeSBtb2RlIHdhaXRpbmcgZm9yIGEgZmlsZSBkcm9wLlxuICAgICAgICAgICAgICAgIC8vIEVpdGhlciB3YXkgdGhlcmUncyBubyBuZWVkIHRvIGNhbGwgcmVwcm9jZXNzUmF3RGF0YSgpLCBzbyB3ZSBqdXN0IHB1c2ggb24gdG8gdGhlIG5leHQgc3RlcC5cbiAgICAgICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ21kdicpIHtcbiAgICAgICAgICAgICAgICAvLyBXaGVuIEpCRUkgTURWIGZvcm1hdCBkb2N1bWVudHMgYXJlIHBhc3RlZCBpbiwgaXQncyBhbHdheXMgZnJvbSBFeGNlbCwgc28gdGhleSdyZSBhbHdheXMgdGFiLXNlcGFyYXRlZC5cbiAgICAgICAgICAgICAgICB0aGlzLnNldFNlcGFyYXRvclR5cGUoJ3RhYicpO1xuICAgICAgICAgICAgICAgIC8vIFdlIGFsc28gbmV2ZXIgaWdub3JlIGdhcHMsIG9yIHRyYW5zcG9zZSwgZm9yIE1EViBkb2N1bWVudHMuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRJZ25vcmVHYXBzKGZhbHNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFRyYW5zcG9zZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgLy8gUHJvY2VlZCB0aHJvdWdoIHRvIHRoZSBkcm9wem9uZSBjaGVjay5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtb2RlID09PSAnc3RkJyB8fCBtb2RlID09PSAndHInIHx8IG1vZGUgPT09ICdwcicgfHwgbW9kZSA9PT0gJ21kdicpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiBhbiBleGNlbCBmaWxlIHdhcyBkcm9wcGVkIGluLCBpdHMgY29udGVudCB3YXMgcHVsbGVkIG91dCBhbmQgZHJvcHBlZCBpbnRvIHRoZSB0ZXh0IGJveC5cbiAgICAgICAgICAgICAgICAvLyBUaGUgb25seSByZWFzb24gd2Ugd291bGQgd2FudCB0byBzdGlsbCBzaG93IHRoZSBmaWxlIGluZm8gYXJlYSBpcyBpZiB3ZSBhcmUgY3VycmVudGx5IGluIHRoZSBtaWRkbGVcbiAgICAgICAgICAgICAgICAvLyBvZiBwcm9jZXNzaW5nIGEgZmlsZSBhbmQgaGF2ZW4ndCB5ZXQgcmVjZWl2ZWQgaXRzIHdvcmtzaGVldHMgZnJvbSB0aGUgc2VydmVyLlxuICAgICAgICAgICAgICAgIC8vIFdlIGNhbiBkZXRlcm1pbmUgdGhhdCBieSBjaGVja2luZyB0aGUgc3RhdHVzIG9mIGFueSBleGlzdGluZyBGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyLlxuICAgICAgICAgICAgICAgIC8vIElmIGl0J3Mgc3RhbGUsIHdlIGNsZWFyIGl0IHNvIHRoZSB1c2VyIGNhbiBkcm9wIGluIGFub3RoZXIgZmlsZS5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVEcmFnZ2VkRmlsZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVEcmFnZ2VkRmlsZS5hbGxXb3JrRmluaXNoZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJEcm9wWm9uZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMucXVldWVSZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIHF1ZXVlUmVwcm9jZXNzUmF3RGF0YSgpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgdGhlIGdyYXBoLlxuICAgICAgICAgICAgLy8gVGhpcyB3YXkgd2UncmUgbm90IGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW5cbiAgICAgICAgICAgIC8vIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXRSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dCh0aGlzLnJlcHJvY2Vzc1Jhd0RhdGEuYmluZCh0aGlzKSwgMzUwKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVwcm9jZXNzUmF3RGF0YSgpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIG1vZGU6IHN0cmluZywgZGVsaW1pdGVyOiBzdHJpbmcsIGlucHV0OiBSYXdJbnB1dFN0YXQ7XG5cbiAgICAgICAgICAgIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuXG4gICAgICAgICAgICB0aGlzLnNldElnbm9yZUdhcHMoKTtcbiAgICAgICAgICAgIHRoaXMuc2V0VHJhbnNwb3NlKCk7XG4gICAgICAgICAgICB0aGlzLnNldFNlcGFyYXRvclR5cGUoKTtcblxuICAgICAgICAgICAgdGhpcy5ncmlkRnJvbVRleHRGaWVsZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy5ncmlkUm93TWFya2VycyA9IFtdO1xuXG4gICAgICAgICAgICBkZWxpbWl0ZXIgPSAnXFx0JztcbiAgICAgICAgICAgIGlmICh0aGlzLnNlcGFyYXRvclR5cGUgPT09ICdjc3YnKSB7XG4gICAgICAgICAgICAgICAgZGVsaW1pdGVyID0gJywnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaW5wdXQgPSB0aGlzLnBhcnNlUmF3SW5wdXQoZGVsaW1pdGVyLCBtb2RlKTtcblxuICAgICAgICAgICAgLy8gV2UgbWVlZCBhdCBsZWFzdCAyIHJvd3MgYW5kIGNvbHVtbnMgZm9yIE1EViBmb3JtYXQgdG8gbWFrZSBhbnkgc2Vuc2VcblxuICAgICAgICAgICAgaWYgKG1vZGUgPT09IFwibWR2XCIpIHtcbiAgICAgICAgICAgICAgICAvLyBNRFYgZm9ybWF0IGlzIHF1aXRlIGRpZmZlcmVudCwgc28gd2UgcGFyc2UgaXQgaW4gaXRzIG93biBzdWJyb3V0aW5lLlxuICAgICAgICAgICAgICAgIGlmICgoaW5wdXQuaW5wdXQubGVuZ3RoID4gMSkgJiYgKGlucHV0LmNvbHVtbnMgPiAxKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NNZHYoaW5wdXQuaW5wdXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQWxsIG90aGVyIGZvcm1hdHMgKHNvIGZhcikgYXJlIGludGVycHJldGVkIGZyb20gYSBncmlkLlxuICAgICAgICAgICAgICAgIC8vIEV2ZW4gYmlvbGVjdG9yIFhNTCAtIHdoaWNoIGlzIGNvbnZlcnRlZCB0byBhIGdyaWQgb24gdGhlIHNlcnZlciwgdGhlbiBwYXNzZWQgYmFjay5cblxuICAgICAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBiaW9sZWN0b3IgaXMgbGVmdCBvdXQgaGVyZSAtIHdlIGRvbid0IHdhbnQgdG8gZG8gYW55IFwiaW5mZXJyaW5nXCIgd2l0aCB0aGF0IGRhdGEuXG4gICAgICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdzdGQnIHx8IG1vZGUgPT09ICd0cicgfHwgbW9kZSA9PT0gJ3ByJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBoYXNuJ3QgZGVsaWJlcmF0ZWx5IGNob3NlbiBhIHNldHRpbmcgZm9yICd0cmFuc3Bvc2UnLCB3ZSB3aWxsIGRvXG4gICAgICAgICAgICAgICAgICAgIC8vIHNvbWUgYW5hbHlzaXMgdG8gYXR0ZW1wdCB0byBndWVzcyB3aGljaCBvcmllbnRhdGlvbiB0aGUgZGF0YSBuZWVkcyB0byBoYXZlLlxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMudXNlckNsaWNrZWRPblRyYW5zcG9zZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbmZlclRyYW5zcG9zZVNldHRpbmcoaW5wdXQuaW5wdXQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSB1c2VyIGhhc24ndCBkZWxpYmVyYXRlbHkgY2hvc2VuIHRvIGlnbm9yZSwgb3IgYWNjZXB0LCBnYXBzIGluIHRoZSBkYXRhLFxuICAgICAgICAgICAgICAgICAgICAvLyBkbyBhIGJhc2ljIGFuYWx5c2lzIHRvIGd1ZXNzIHdoaWNoIHNldHRpbmcgbWFrZXMgbW9yZSBzZW5zZS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2Fwcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbmZlckdhcHNTZXR0aW5nKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBDb2xsZWN0IHRoZSBkYXRhIGJhc2VkIG9uIHRoZSBzZXR0aW5nc1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRyYW5zcG9zZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCByb3cgYmVjb21lcyBZLW1hcmtlcnMgYXMtaXNcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkUm93TWFya2VycyA9IGlucHV0LmlucHV0LnNoaWZ0KCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JpZEZyb21UZXh0RmllbGQgPSAoaW5wdXQuaW5wdXRbMF0gfHwgW10pLm1hcCgoXywgaTogbnVtYmVyKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0LmlucHV0Lm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbaV0gfHwgJycpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRSb3dNYXJrZXJzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JpZEZyb21UZXh0RmllbGQgPSAoaW5wdXQuaW5wdXQgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFJvd01hcmtlcnMucHVzaChyb3cuc2hpZnQoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcm93O1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBHaXZlIGxhYmVscyB0byBhbnkgaGVhZGVyIHBvc2l0aW9ucyB0aGF0IGdvdCAnbnVsbCcgZm9yIGEgdmFsdWUuXG4gICAgICAgICAgICAgICAgdGhpcy5ncmlkUm93TWFya2VycyA9IHRoaXMuZ3JpZFJvd01hcmtlcnMubWFwKCh2YWx1ZTogc3RyaW5nKSA9PiB2YWx1ZSB8fCAnPycpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSGVyZSwgd2UgdGFrZSBhIGxvb2sgYXQgdGhlIHR5cGUgb2YgdGhlIGRyb3BwZWQgZmlsZSBhbmQgZGVjaWRlIHdoZXRoZXIgdG9cbiAgICAgICAgLy8gc2VuZCBpdCB0byB0aGUgc2VydmVyLCBvciBwcm9jZXNzIGl0IGxvY2FsbHkuXG4gICAgICAgIC8vIFdlIGluZm9ybSB0aGUgRmlsZURyb3Bab25lIG9mIG91ciBkZWNpc2lvbiBieSBzZXR0aW5nIGZsYWdzIGluIHRoZSBmaWxlQ29udGluZXIgb2JqZWN0LFxuICAgICAgICAvLyB3aGljaCB3aWxsIGJlIGluc3BlY3RlZCB3aGVuIHRoaXMgZnVuY3Rpb24gcmV0dXJucy5cbiAgICAgICAgZmlsZURyb3BwZWQoZmlsZUNvbnRhaW5lcik6IHZvaWQge1xuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgLy8gV2UnbGwgcHJvY2VzcyBjc3YgZmlsZXMgbG9jYWxseS5cbiAgICAgICAgICAgIGlmICgoZmlsZUNvbnRhaW5lci5maWxlVHlwZSA9PT0gJ2NzdicpICYmXG4gICAgICAgICAgICAgICAgICAgIChtb2RlID09PSAnc3RkJyB8fCBtb2RlID09PSAndHInIHx8IG1vZGUgPT09ICdwcicpKSB7XG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1JhdyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gV2l0aCBFeGNlbCBkb2N1bWVudHMsIHdlIG5lZWQgc29tZSBzZXJ2ZXItc2lkZSB0b29scy5cbiAgICAgICAgICAgIC8vIFdlJ2xsIHNpZ25hbCB0aGUgZHJvcHpvbmUgdG8gdXBsb2FkIHRoaXMsIGFuZCByZWNlaXZlIHByb2Nlc3NlZCByZXN1bHRzLlxuICAgICAgICAgICAgaWYgKChmaWxlQ29udGFpbmVyLmZpbGVUeXBlID09PSAnZXhjZWwnKSAmJlxuICAgICAgICAgICAgICAgICAgICAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInIHx8IG1vZGUgPT09ICdtZHYnKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd0Ryb3Bab25lKGZpbGVDb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFByb2Nlc3NSYXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWxlQ29udGFpbmVyLmZpbGVUeXBlID09PSAneG1sJyAmJiBtb2RlID09PSAnYmlvbGVjdG9yJykge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd0Ryb3Bab25lKGZpbGVDb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFByb2Nlc3NSYXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEJ5IGRlZmF1bHQsIHNraXAgYW55IGZ1cnRoZXIgcHJvY2Vzc2luZ1xuICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1JhdyA9IHRydWU7XG4gICAgICAgICAgICBmaWxlQ29udGFpbmVyLnNraXBVcGxvYWQgPSB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHBhc3NlZCB0aGUgdXN1YWwgZmlsZUNvbnRhaW5lciBvYmplY3QsIGJ1dCBhbHNvIGEgcmVmZXJlbmNlIHRvIHRoZVxuICAgICAgICAvLyBmdWxsIGNvbnRlbnQgb2YgdGhlIGRyb3BwZWQgZmlsZS4gIFNvLCBmb3IgZXhhbXBsZSwgaW4gdGhlIGNhc2Ugb2YgcGFyc2luZyBhIGNzdiBmaWxlLFxuICAgICAgICAvLyB3ZSBqdXN0IGRyb3AgdGhhdCBjb250ZW50IGludG8gdGhlIHRleHQgYm94IGFuZCB3ZSdyZSBkb25lLlxuICAgICAgICBmaWxlUmVhZChmaWxlQ29udGFpbmVyLCByZXN1bHQpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmIChmaWxlQ29udGFpbmVyLmZpbGVUeXBlID09PSAnY3N2Jykge1xuICAgICAgICAgICAgICAgIC8vIFNpbmNlIHdlJ3JlIGhhbmRsaW5nIHRoaXMgZm9ybWF0IGVudGlyZWx5IGNsaWVudC1zaWRlLCB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGVcbiAgICAgICAgICAgICAgICAvLyBkcm9wIHpvbmUgaW1tZWRpYXRlbHkuXG4gICAgICAgICAgICAgICAgZmlsZUNvbnRhaW5lci5za2lwVXBsb2FkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmNsZWFyRHJvcFpvbmUoKTtcbiAgICAgICAgICAgICAgICAkKFwiI3N0ZXAydGV4dGFyZWFcIikudmFsKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgdGhpcy5pbmZlclNlcGFyYXRvclR5cGUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlcHJvY2Vzc1Jhd0RhdGEoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgaXMgY2FsbGVkIHVwb24gcmVjZWl2aW5nIGEgcmVzcG9uc2UgZnJvbSBhIGZpbGUgdXBsb2FkIG9wZXJhdGlvbixcbiAgICAgICAgLy8gYW5kIHVubGlrZSBmaWxlUmVhZCgpIGFib3ZlLCBpcyBwYXNzZWQgYSBwcm9jZXNzZWQgcmVzdWx0IGZyb20gdGhlIHNlcnZlciBhcyBhIHNlY29uZCBhcmd1bWVudCxcbiAgICAgICAgLy8gcmF0aGVyIHRoYW4gdGhlIHJhdyBjb250ZW50cyBvZiB0aGUgZmlsZS5cbiAgICAgICAgZmlsZVJldHVybmVkRnJvbVNlcnZlcihmaWxlQ29udGFpbmVyLCByZXN1bHQpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIFdoZXRoZXIgd2UgY2xlYXIgdGhlIGZpbGUgaW5mbyBhcmVhIGVudGlyZWx5LCBvciBqdXN0IHVwZGF0ZSBpdHMgc3RhdHVzLFxuICAgICAgICAgICAgLy8gd2Uga25vdyB3ZSBubyBsb25nZXIgbmVlZCB0aGUgJ3NlbmRpbmcnIHN0YXR1cy5cbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9TZW5kaW5nJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT0gXCJleGNlbFwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jbGVhckRyb3Bab25lKCk7XG4gICAgICAgICAgICAgICAgdmFyIHdzID0gcmVzdWx0LmZpbGVfZGF0YVtcIndvcmtzaGVldHNcIl1bMF07XG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlID0gd3NbMF07XG4gICAgICAgICAgICAgICAgdmFyIGNzdiA9IFtdO1xuICAgICAgICAgICAgICAgIGlmICh0YWJsZS5oZWFkZXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNzdi5wdXNoKHRhYmxlLmhlYWRlcnMuam9pbigpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS52YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY3N2LnB1c2godGFibGUudmFsdWVzW2ldLmpvaW4oKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U2VwYXJhdG9yVHlwZSgnY3N2Jyk7XG4gICAgICAgICAgICAgICAgJChcIiNzdGVwMnRleHRhcmVhXCIpLnZhbChjc3Yuam9pbihcIlxcblwiKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT0gXCJ4bWxcIikge1xuICAgICAgICAgICAgICAgIHZhciBkID0gcmVzdWx0LmZpbGVfZGF0YTtcbiAgICAgICAgICAgICAgICB2YXIgdCA9IDA7XG4gICAgICAgICAgICAgICAgZC5mb3JFYWNoKChzZXQ6YW55KTogdm9pZCA9PiB7IHQgKz0gc2V0LmRhdGEubGVuZ3RoOyB9KTtcbiAgICAgICAgICAgICAgICAkKCc8cD4nKS50ZXh0KCdGb3VuZCAnICsgZC5sZW5ndGggKyAnIG1lYXN1cmVtZW50cyB3aXRoICcgKyB0ICsgJyB0b3RhbCBkYXRhIHBvaW50cy4nKS5hcHBlbmRUbygkKFwiI2ZpbGVEcm9wSW5mb0xvZ1wiKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRTZXRzRnJvbUZpbGUgPSBkO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkU2V0c0F2YWlsYWJsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgLy8gQ2FsbCB0aGlzIGRpcmVjdGx5LCBza2lwcGluZyBvdmVyIHJlcHJvY2Vzc1Jhd0RhdGEoKSBzaW5jZSB3ZSBkb24ndCBuZWVkIGl0LlxuICAgICAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgcGFyc2VSYXdJbnB1dChkZWxpbWl0ZXI6IHN0cmluZywgbW9kZTogc3RyaW5nKTpSYXdJbnB1dFN0YXQge1xuICAgICAgICAgICAgdmFyIHJhd1RleHQ6IHN0cmluZywgbG9uZ2VzdFJvdzogbnVtYmVyLCByb3dzOiBSYXdJbnB1dCwgbXVsdGlDb2x1bW46IGJvb2xlYW47XG4gICAgICAgICAgICByYXdUZXh0ID0gJCgnI3N0ZXAydGV4dGFyZWEnKS52YWwoKTtcbiAgICAgICAgICAgIHJvd3MgPSBbXTtcbiAgICAgICAgICAgIC8vIGZpbmQgdGhlIGhpZ2hlc3QgbnVtYmVyIG9mIGNvbHVtbnMgaW4gYSByb3dcbiAgICAgICAgICAgIGxvbmdlc3RSb3cgPSByYXdUZXh0LnNwbGl0KC9bIFxccl0qXFxuLykucmVkdWNlKChwcmV2OiBudW1iZXIsIHJhd1Jvdzogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcm93OiBzdHJpbmdbXTtcbiAgICAgICAgICAgICAgICBpZiAocmF3Um93ICE9PSAnJykge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSByYXdSb3cuc3BsaXQoZGVsaW1pdGVyKTtcbiAgICAgICAgICAgICAgICAgICAgcm93cy5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCByb3cubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZXY7XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgIC8vIHBhZCBvdXQgcm93cyBzbyBpdCBpcyByZWN0YW5ndWxhclxuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdzdGQnIHx8IG1vZGUgPT09ICd0cicgfHwgbW9kZSA9PT0gJ3ByJykge1xuICAgICAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAocm93Lmxlbmd0aCA8IGxvbmdlc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5wdXNoKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnaW5wdXQnOiByb3dzLFxuICAgICAgICAgICAgICAgICdjb2x1bW5zJzogbG9uZ2VzdFJvd1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmVzZXQgYW5kIGhpZGUgdGhlIGluZm8gYm94IHRoYXQgYXBwZWFycyB3aGVuIGEgZmlsZSBpcyBkcm9wcGVkLFxuICAgICAgICAvLyBhbmQgcmV2ZWFsIHRoZSB0ZXh0IGVudHJ5IGFyZWEuXG4gICAgICAgIC8vIFRoaXMgYWxzbyBjbGVhcnMgdGhlIFwicHJvY2Vzc2VkU2V0c0F2YWlsYWJsZVwiIGZsYWcgYmVjYXVzZSBpdCBhc3N1bWVzIHRoYXRcbiAgICAgICAgLy8gdGhlIHRleHQgZW50cnkgYXJlYSBpcyBub3cgdGhlIHByZWZlcnJlZCBkYXRhIHNvdXJjZSBmb3Igc3Vic2VxdWVudCBzdGVwcy5cblxuICAgICAgICBjbGVhckRyb3Bab25lKCk6IHZvaWQge1xuICAgICAgICAgICAgJCgnI3N0ZXAydGV4dGFyZWEnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvQXJlYScpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9TZW5kaW5nJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb05hbWUnKS5lbXB0eSgpO1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0xvZycpLmVtcHR5KCk7XG4gICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGEgY3VycmVudGx5IHRyYWNrZWQgZHJvcHBlZCBmaWxlLCBzZXQgaXRzIGZsYWdzIHNvIHdlIGlnbm9yZSBhbnkgY2FsbGJhY2tzLFxuICAgICAgICAgICAgLy8gYmVmb3JlIHdlIGZvcmdldCBhYm91dCBpdC5cbiAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZURyYWdnZWRGaWxlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVEcmFnZ2VkRmlsZS5zdG9wUHJvY2Vzc2luZyA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyYWdnZWRGaWxlID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkU2V0c0F2YWlsYWJsZSA9IGZhbHNlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXNldCBhbmQgaGlkZSB0aGUgaW5mbyBib3ggdGhhdCBhcHBlYXJzIHdoZW4gYSBmaWxlIGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGFuZCByZXZlYWwgdGhlIHRleHQgZW50cnkgYXJlYS5cbiAgICAgICAgc2hvd0Ryb3Bab25lKGZpbGVDb250YWluZXIpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIFNldCB0aGUgaWNvbiBpbWFnZSBwcm9wZXJseVxuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5yZW1vdmVDbGFzcygneG1sJyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvSWNvbicpLnJlbW92ZUNsYXNzKCdleGNlbCcpO1xuICAgICAgICAgICAgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT09ICd4bWwnKSB7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5hZGRDbGFzcygneG1sJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT09ICdleGNlbCcpIHtcbiAgICAgICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvSWNvbicpLmFkZENsYXNzKCdleGNlbCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJCgnI3N0ZXAydGV4dGFyZWEnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvQXJlYScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9TZW5kaW5nJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb05hbWUnKS50ZXh0KGZpbGVDb250YWluZXIuZmlsZS5uYW1lKVxuICAgICAgICAgICAgJCgnI2ZpbGVVcGxvYWRNZXNzYWdlJykudGV4dCgnU2VuZGluZyAnICsgVXRsLkpTLnNpemVUb1N0cmluZyhmaWxlQ29udGFpbmVyLmZpbGUuc2l6ZSkgKyAnIFRvIFNlcnZlci4uLicpO1xuLy8gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvTG9nJykuZW1wdHkoKTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJhZ2dlZEZpbGUgPSBmaWxlQ29udGFpbmVyO1xuICAgICAgICB9XG5cblxuICAgICAgICByZXNldCgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJEcm9wWm9uZSgpO1xuICAgICAgICAgICAgJCgnI3N0ZXAydGV4dGFyZWEnKS52YWwoJycpO1xuICAgICAgICAgICAgdGhpcy5yZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGluZmVyVHJhbnNwb3NlU2V0dGluZyhyb3dzOiBSYXdJbnB1dCk6dm9pZCAge1xuICAgICAgICAgICAgLy8gVGhlIG1vc3Qgc3RyYWlnaHRmb3J3YXJkIG1ldGhvZCBpcyB0byB0YWtlIHRoZSB0b3Agcm93LCBhbmQgdGhlIGZpcnN0IGNvbHVtbixcbiAgICAgICAgICAgIC8vIGFuZCBhbmFseXplIGJvdGggdG8gc2VlIHdoaWNoIG9uZSBtb3N0IGxpa2VseSBjb250YWlucyBhIHJ1biBvZiB0aW1lc3RhbXBzLlxuICAgICAgICAgICAgLy8gV2UnbGwgYWxzbyBkbyB0aGUgc2FtZSBmb3IgdGhlIHNlY29uZCByb3cgYW5kIHRoZSBzZWNvbmQgY29sdW1uLCBpbiBjYXNlIHRoZVxuICAgICAgICAgICAgLy8gdGltZXN0YW1wcyBhcmUgdW5kZXJuZWF0aCBzb21lIG90aGVyIGhlYWRlci5cbiAgICAgICAgICAgIHZhciBhcnJheXNUb0FuYWx5emU6IHN0cmluZ1tdW10sIGFycmF5c1Njb3JlczogbnVtYmVyW10sIHNldFRyYW5zcG9zZTogYm9vbGVhbjtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgd2l0aCBlbXB0eSBvciB0b28tc21hbGwgc291cmNlIGRhdGEsIHRoZXNlIGFycmF5cyB3aWxsIGVpdGhlciByZW1haW5cbiAgICAgICAgICAgIC8vIGVtcHR5LCBvciBiZWNvbWUgJ251bGwnXG4gICAgICAgICAgICBhcnJheXNUb0FuYWx5emUgPSBbXG4gICAgICAgICAgICAgICAgcm93c1swXSB8fCBbXSwgICAvLyBGaXJzdCByb3dcbiAgICAgICAgICAgICAgICByb3dzWzFdIHx8IFtdLCAgIC8vIFNlY29uZCByb3dcbiAgICAgICAgICAgICAgICAocm93cyB8fCBbXSkubWFwKChyb3c6IHN0cmluZ1tdKTogc3RyaW5nID0+IHJvd1swXSksICAgLy8gRmlyc3QgY29sdW1uXG4gICAgICAgICAgICAgICAgKHJvd3MgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbMV0pICAgIC8vIFNlY29uZCBjb2x1bW5cbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBhcnJheXNTY29yZXMgPSBhcnJheXNUb0FuYWx5emUubWFwKChyb3c6IHN0cmluZ1tdLCBpOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzY29yZSA9IDAsIHByZXY6IG51bWJlciwgbm5QcmV2OiBudW1iZXI7XG4gICAgICAgICAgICAgICAgaWYgKCFyb3cgfHwgcm93Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldiA9IG5uUHJldiA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICByb3cuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgajogbnVtYmVyLCByOiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBwYXJzZUZsb2F0KHZhbHVlLnJlcGxhY2UoLywvZywgJycpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKHQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKHByZXYpICYmIHQgPiBwcmV2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcmUgKz0gMjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzTmFOKG5uUHJldikgJiYgdCA+IG5uUHJldikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBublByZXYgPSB0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHByZXYgPSB0O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29yZSAvIHJvdy5sZW5ndGg7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHRoZSBmaXJzdCByb3cgYW5kIGNvbHVtbiBzY29yZWQgZGlmZmVyZW50bHksIGp1ZGdlIGJhc2VkIG9uIHRoZW0uXG4gICAgICAgICAgICAvLyBPbmx5IGlmIHRoZXkgc2NvcmVkIHRoZSBzYW1lIGRvIHdlIGp1ZGdlIGJhc2VkIG9uIHRoZSBzZWNvbmQgcm93IGFuZCBzZWNvbmQgY29sdW1uLlxuICAgICAgICAgICAgaWYgKGFycmF5c1Njb3Jlc1swXSAhPT0gYXJyYXlzU2NvcmVzWzJdKSB7XG4gICAgICAgICAgICAgICAgc2V0VHJhbnNwb3NlID0gYXJyYXlzU2NvcmVzWzBdID4gYXJyYXlzU2NvcmVzWzJdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZXRUcmFuc3Bvc2UgPSBhcnJheXNTY29yZXNbMV0gPiBhcnJheXNTY29yZXNbM107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNldFRyYW5zcG9zZShzZXRUcmFuc3Bvc2UpO1xuICAgICAgICB9XG5cblxuICAgICAgICBpbmZlckdhcHNTZXR0aW5nKCk6dm9pZCB7XG4gICAgICAgICAgICAvLyBDb3VudCB0aGUgbnVtYmVyIG9mIGJsYW5rIHZhbHVlcyBhdCB0aGUgZW5kIG9mIGVhY2ggY29sdW1uXG4gICAgICAgICAgICAvLyBDb3VudCB0aGUgbnVtYmVyIG9mIGJsYW5rIHZhbHVlcyBpbiBiZXR3ZWVuIG5vbi1ibGFuayBkYXRhXG4gICAgICAgICAgICAvLyBJZiBtb3JlIHRoYW4gdGhyZWUgdGltZXMgYXMgbWFueSBhcyBhdCB0aGUgZW5kLCBkZWZhdWx0IHRvIGlnbm9yZSBnYXBzXG4gICAgICAgICAgICB2YXIgaW50cmE6IG51bWJlciA9IDAsIGV4dHJhOiBudW1iZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy5ncmlkRnJvbVRleHRGaWVsZC5mb3JFYWNoKChyb3c6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG5vdE51bGw6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBjb3B5IGFuZCByZXZlcnNlIHRvIGxvb3AgZnJvbSB0aGUgZW5kXG4gICAgICAgICAgICAgICAgcm93LnNsaWNlKDApLnJldmVyc2UoKS5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vdE51bGwgPyArK2V4dHJhIDogKytpbnRyYTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vdE51bGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHZhciByZXN1bHQ6Ym9vbGVhbiA9IGV4dHJhID4gKGludHJhICogMyk7XG4gICAgICAgICAgICB0aGlzLnNldElnbm9yZUdhcHMocmVzdWx0KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcHJvY2Vzc01kdihpbnB1dDogUmF3SW5wdXQpOnZvaWQge1xuICAgICAgICAgICAgdmFyIHJvd3M6IFJhd0lucHV0LCBjb2xMYWJlbHM6IHN0cmluZ1tdLCBjb21wb3VuZHM6IGFueSwgb3JkZXJlZENvbXA6IHN0cmluZ1tdO1xuICAgICAgICAgICAgY29sTGFiZWxzID0gW107XG4gICAgICAgICAgICByb3dzID0gaW5wdXQuc2xpY2UoMCk7IC8vIGNvcHlcbiAgICAgICAgICAgIC8vIElmIHRoaXMgd29yZCBmcmFnbWVudCBpcyBpbiB0aGUgZmlyc3Qgcm93LCBkcm9wIHRoZSB3aG9sZSByb3cuXG4gICAgICAgICAgICAvLyAoSWdub3JpbmcgYSBRIG9mIHVua25vd24gY2FwaXRhbGl6YXRpb24pXG4gICAgICAgICAgICBpZiAocm93c1swXS5qb2luKCcnKS5tYXRjaCgvdWFudGl0YXRpb24vZykpIHtcbiAgICAgICAgICAgICAgICByb3dzLnNoaWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb21wb3VuZHMgPSB7fTtcbiAgICAgICAgICAgIG9yZGVyZWRDb21wID0gW107XG4gICAgICAgICAgICByb3dzLmZvckVhY2goKHJvdzogc3RyaW5nW10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3Q6IHN0cmluZywgbWFya2VkOiBzdHJpbmdbXSwgbmFtZTogc3RyaW5nLCBpbmRleDogbnVtYmVyO1xuICAgICAgICAgICAgICAgIGZpcnN0ID0gcm93LnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgaGFwcGVuIHRvIGVuY291bnRlciBhbiBvY2N1cnJlbmNlIG9mIGEgcm93IHdpdGggJ0NvbXBvdW5kJyBpblxuICAgICAgICAgICAgICAgIC8vIHRoZSBmaXJzdCBjb2x1bW4sIHdlIHRyZWF0IGl0IGFzIGEgcm93IG9mIGNvbHVtbiBpZGVudGlmaWVycy5cbiAgICAgICAgICAgICAgICBpZiAoZmlyc3QgPT09ICdDb21wb3VuZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sTGFiZWxzID0gcm93O1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1hcmtlZCA9IGZpcnN0LnNwbGl0KCcgTSA9ICcpO1xuICAgICAgICAgICAgICAgIGlmIChtYXJrZWQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWUgPSBtYXJrZWRbMF07XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ID0gcGFyc2VJbnQobWFya2VkWzFdLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29tcG91bmRzW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb3VuZHNbbmFtZV0gPSB7ICdvcmlnaW5hbFJvd3MnOiB7fSwgJ3Byb2Nlc3NlZEFzc2F5Q29scyc6IHt9IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9yZGVyZWRDb21wLnB1c2gobmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29tcG91bmRzW25hbWVdLm9yaWdpbmFsUm93c1tpbmRleF0gPSByb3cuc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmVhY2goY29tcG91bmRzLCAobmFtZTogc3RyaW5nLCB2YWx1ZTogYW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGluZGljZXM6IG51bWJlcltdO1xuICAgICAgICAgICAgICAgIC8vIEZpcnN0IGdhdGhlciB1cCBhbGwgdGhlIG1hcmtlciBpbmRleGVzIGdpdmVuIGZvciB0aGlzIGNvbXBvdW5kXG4gICAgICAgICAgICAgICAgaW5kaWNlcyA9ICQubWFwKHZhbHVlLm9yaWdpbmFsUm93cywgKF8sIGluZGV4OiBzdHJpbmcpOiBudW1iZXIgPT4gcGFyc2VJbnQoaW5kZXgsIDEwKSk7XG4gICAgICAgICAgICAgICAgaW5kaWNlcy5zb3J0KChhLCBiKSA9PiBhIC0gYik7IC8vIHNvcnQgYXNjZW5kaW5nXG4gICAgICAgICAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIHNldCBvZiBjb2x1bW5MYWJlbHMgYWJvdmUsIGFzc2VtYmxpbmcgYSBtYXJraW5nIG51bWJlciBmb3IgZWFjaCxcbiAgICAgICAgICAgICAgICAvLyBieSBkcmF3aW5nIC0gaW4gb3JkZXIgLSBmcm9tIHRoaXMgY29sbGVjdGVkIHJvdyBkYXRhLlxuICAgICAgICAgICAgICAgIGNvbExhYmVscy5mb3JFYWNoKChsYWJlbDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJ0czogc3RyaW5nW10sIGFueUZsb2F0OiBib29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBhbnlGbG9hdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpbmRpY2VzLmZvckVhY2goKHJpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBvcmlnaW5hbDogc3RyaW5nW10sIGNlbGw6IHN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsID0gdmFsdWUub3JpZ2luYWxSb3dzW3JpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwgPSBvcmlnaW5hbFtpbmRleF07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwgPSBjZWxsLnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc05hTihwYXJzZUZsb2F0KGNlbGwpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYW55RmxvYXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaChjZWxsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBBc3NlbWJsZWQgYSBmdWxsIGNhcmJvbiBtYXJrZXIgbnVtYmVyLCBncmFiIHRoZSBjb2x1bW4gbGFiZWwsIGFuZCBwbGFjZVxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgbWFya2VyIGluIHRoZSBhcHByb3ByaWF0ZSBzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICB2YWx1ZS5wcm9jZXNzZWRBc3NheUNvbHNbaW5kZXhdID0gcGFydHMuam9pbignLycpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBTdGFydCB0aGUgc2V0IG9mIHJvdyBtYXJrZXJzIHdpdGggYSBnZW5lcmljIGxhYmVsXG4gICAgICAgICAgICB0aGlzLmdyaWRSb3dNYXJrZXJzID0gWydBc3NheSddO1xuICAgICAgICAgICAgLy8gVGhlIGZpcnN0IHJvdyBpcyBvdXIgbGFiZWwgY29sbGVjdGlvblxuICAgICAgICAgICAgdGhpcy5ncmlkRnJvbVRleHRGaWVsZFswXSA9IGNvbExhYmVscy5zbGljZSgwKTtcbiAgICAgICAgICAgIC8vIHB1c2ggdGhlIHJlc3Qgb2YgdGhlIHJvd3MgZ2VuZXJhdGVkIGZyb20gb3JkZXJlZCBsaXN0IG9mIGNvbXBvdW5kc1xuICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoXG4gICAgICAgICAgICAgICAgdGhpcy5ncmlkRnJvbVRleHRGaWVsZCxcbiAgICAgICAgICAgICAgICBvcmRlcmVkQ29tcC5tYXAoKG5hbWU6IHN0cmluZyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbXBvdW5kOiBhbnksIHJvdzogc3RyaW5nW10sIGNvbExvb2t1cDogYW55O1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRSb3dNYXJrZXJzLnB1c2gobmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvdW5kID0gY29tcG91bmRzW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgY29sTG9va3VwID0gY29tcG91bmQucHJvY2Vzc2VkQXNzYXlDb2xzO1xuICAgICAgICAgICAgICAgICAgICAvLyBnZW5lcmF0ZSByb3cgY2VsbHMgYnkgbWFwcGluZyBjb2x1bW4gbGFiZWxzIHRvIHByb2Nlc3NlZCBjb2x1bW5zXG4gICAgICAgICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KHJvdyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbExhYmVscy5tYXAoKF8sIGluZGV4OiBudW1iZXIpOiBzdHJpbmcgPT4gY29sTG9va3VwW2luZGV4XSB8fCAnJylcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBnZXRzIGNhbGxlZCB3aGVuIHRoZXJlIGlzIGEgcGFzdGUgZXZlbnQuXG4gICAgICAgIHBhc3RlZFJhd0RhdGEoKTp2b2lkIHtcbiAgICAgICAgICAgIC8vIFdlIGRvIHRoaXMgdXNpbmcgYSB0aW1lb3V0IHNvIHRoZSByZXN0IG9mIHRoZSBwYXN0ZSBldmVudHMgZmlyZSwgYW5kIGdldCB0aGUgcGFzdGVkIHJlc3VsdC5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHRoaXMuaW5mZXJTZXBhcmF0b3JUeXBlLmJpbmQodGhpcyksIDEpO1xuICAgICAgICB9XG5cblxuICAgICAgICBpbmZlclNlcGFyYXRvclR5cGUoKTogdm9pZCB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSAhPT0gXCJtZHZcIikge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0OiBzdHJpbmcgPSAkKCcjc3RlcDJ0ZXh0YXJlYScpLnZhbCgpIHx8ICcnLCB0ZXN0OiBib29sZWFuO1xuICAgICAgICAgICAgICAgIHRlc3QgPSB0ZXh0LnNwbGl0KCdcXHQnKS5sZW5ndGggPj0gdGV4dC5zcGxpdCgnLCcpLmxlbmd0aDtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFNlcGFyYXRvclR5cGUodGVzdCA/ICd0YWInIDogJ2NzdicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBzZXRJZ25vcmVHYXBzKHZhbHVlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGlnbm9yZUdhcHMgPSAkKCcjaWdub3JlR2FwcycpO1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGlnbm9yZUdhcHMucHJvcCgnY2hlY2tlZCcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZ25vcmVHYXBzLnByb3AoJ2NoZWNrZWQnLCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmlnbm9yZURhdGFHYXBzID0gdmFsdWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHNldFRyYW5zcG9zZSh2YWx1ZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciB0cmFuc3Bvc2UgPSAkKCcjdHJhbnNwb3NlJyk7XG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gdHJhbnNwb3NlLnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJhbnNwb3NlLnByb3AoJ2NoZWNrZWQnLCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRyYW5zcG9zZSA9IHZhbHVlO1xuICAgICAgICB9XG5cblxuICAgICAgICBzZXRTZXBhcmF0b3JUeXBlKHZhbHVlPzogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgc2VwYXJhdG9yUHVsbGRvd24gPSAkKCcjcmF3ZGF0YWZvcm1hdHAnKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBzZXBhcmF0b3JQdWxsZG93bi52YWwoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VwYXJhdG9yUHVsbGRvd24udmFsKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2VwYXJhdG9yVHlwZSA9IHZhbHVlO1xuICAgICAgICB9XG5cblxuICAgICAgICBjbGlja2VkT25JZ25vcmVEYXRhR2FwcygpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy51c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHMgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5yZXByb2Nlc3NSYXdEYXRhKCk7ICAgIC8vIFRoaXMgd2lsbCB0YWtlIGNhcmUgb2YgcmVhZGluZyB0aGUgc3RhdHVzIG9mIHRoZSBjaGVja2JveFxuICAgICAgICB9XG5cblxuICAgICAgICBjbGlja2VkT25UcmFuc3Bvc2UoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudXNlckNsaWNrZWRPblRyYW5zcG9zZSA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnJlcHJvY2Vzc1Jhd0RhdGEoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBoYW5kbGVzIGluc2VydGlvbiBvZiBhIHRhYiBpbnRvIHRoZSB0ZXh0YXJlYS5cbiAgICAgICAgLy8gTWF5IGJlIGdsaXRjaHkuXG4gICAgICAgIHN1cHByZXNzTm9ybWFsVGFiKGU6IEpRdWVyeUtleUV2ZW50T2JqZWN0KTogYm9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQsIHRleHQ6IHN0cmluZztcbiAgICAgICAgICAgIGlmIChlLndoaWNoID09PSA5KSB7XG4gICAgICAgICAgICAgICAgaW5wdXQgPSA8SFRNTElucHV0RWxlbWVudD5lLnRhcmdldDtcbiAgICAgICAgICAgICAgICB0ZXh0ID0gJChpbnB1dCkudmFsKCk7XG4gICAgICAgICAgICAgICAgLy8gc2V0IHZhbHVlIHRvIGl0c2VsZiB3aXRoIHNlbGVjdGlvbiByZXBsYWNlZCBieSBhIHRhYiBjaGFyYWN0ZXJcbiAgICAgICAgICAgICAgICAkKGlucHV0KS52YWwoW1xuICAgICAgICAgICAgICAgICAgICB0ZXh0LnN1YnN0cmluZygwLCBpbnB1dC5zZWxlY3Rpb25TdGFydCksXG4gICAgICAgICAgICAgICAgICAgIHRleHQuc3Vic3RyaW5nKGlucHV0LnNlbGVjdGlvbkVuZClcbiAgICAgICAgICAgICAgICBdLmpvaW4oJ1xcdCcpKTtcbiAgICAgICAgICAgICAgICAvLyBwdXQgY2FyZXQgYXQgcmlnaHQgcG9zaXRpb24gYWdhaW5cbiAgICAgICAgICAgICAgICBpbnB1dC5zZWxlY3Rpb25TdGFydCA9IGlucHV0LnNlbGVjdGlvbkVuZCA9IGlucHV0LnNlbGVjdGlvblN0YXJ0ICsgMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgZ2V0R3JpZCgpOiBhbnlbXSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5ncmlkRnJvbVRleHRGaWVsZDtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyB0eXBlIGZvciB0aGUgb3B0aW9ucyBpbiByb3cgcHVsbGRvd25zXG4gICAgLy8gVE9ETyB1cGRhdGUgdG8gdXNlIHVuaW9ucyB3aGVuIG1pZ3JhdGluZyB0byBUeXBlc2NyaXB0IDEuNCtcbiAgICBpbnRlcmZhY2UgUm93UHVsbGRvd25PcHRpb24gZXh0ZW5kcyBBcnJheTxhbnk+IHsgLy8gQXJyYXk8c3RyaW5nfG51bWJlcnxSb3dQdWxsZG93bk9wdGlvbltdPlxuICAgICAgICAwOiBzdHJpbmc7XG4gICAgICAgIDE6IGFueTsgLy8gbnVtYmVyIHwgUm93UHVsbGRvd25PcHRpb25bXVxuICAgIH1cblxuXG4gICAgLy8gTWFnaWMgbnVtYmVycyB1c2VkIGluIHB1bGxkb3ducyB0byBhc3NpZ24gdHlwZXMgdG8gcm93cy9maWVsZHMuXG4gICAgZXhwb3J0IGNsYXNzIFR5cGVFbnVtIHtcbiAgICAgICAgc3RhdGljIEdlbmVfTmFtZXMgPSAxMDtcbiAgICAgICAgc3RhdGljIFJQS01fVmFsdWVzID0gMTE7XG4gICAgICAgIHN0YXRpYyBBc3NheV9MaW5lX05hbWVzID0gMTtcbiAgICAgICAgc3RhdGljIFByb3RlaW5fTmFtZSA9IDEyO1xuICAgICAgICBzdGF0aWMgTWV0YWJvbGl0ZV9OYW1lcyA9IDI7XG4gICAgICAgIHN0YXRpYyBUaW1lc3RhbXAgPSAzO1xuICAgICAgICBzdGF0aWMgTWV0YWRhdGFfTmFtZSA9IDQ7XG4gICAgICAgIHN0YXRpYyBNZXRhYm9saXRlX05hbWUgPSA1O1xuICAgIH1cblxuXG4gICAgLy8gVGhlIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBldmVyeXRoaW5nIGluIHRoZSBcIlN0ZXAgM1wiIGJveCB0aGF0IHlvdSBzZWUgb24gdGhlIGRhdGEgaW1wb3J0IHBhZ2UuXG4gICAgLy8gR2V0IHRoZSBncmlkIGZyb20gdGhlIHByZXZpb3VzIHN0ZXAsIGFuZCBkcmF3IGl0IGFzIGEgdGFibGUgd2l0aCBwdWxkb3ducyBmb3Igc3BlY2lmeWluZyB0aGUgY29udGVudFxuICAgIC8vIG9mIHRoZSByb3dzIGFuZCBjb2x1bW5zLCBhcyB3ZWxsIGFzIGNoZWNrYm94ZXMgdG8gZW5hYmxlIG9yIGRpc2FibGUgcm93cyBvciBjb2x1bW5zLlxuICAgIC8vIEludGVycHJldCB0aGUgY3VycmVudCBncmlkIGFuZCB0aGUgc2V0dGluZ3Mgb24gdGhlIGN1cnJlbnQgdGFibGUgaW50byBFREQtZnJpZW5kbHkgc2V0cy5cbiAgICBleHBvcnQgY2xhc3MgSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCB7XG5cbiAgICAgICAgcm93TGFiZWxDZWxsczogYW55W107XG4gICAgICAgIGNvbENoZWNrYm94Q2VsbHM6IGFueVtdO1xuICAgICAgICByb3dDaGVja2JveENlbGxzOiBhbnlbXTsgICAgLy8gTm90ZTogdGhpcyBpcyBidWlsdCwgYnV0IG5ldmVyIHJlZmVyZW5jZWQuLi4gIE1pZ2h0IGFzIHdlbGwgY3V0IGl0LlxuXG4gICAgICAgIGNvbE9iamVjdHM6IGFueVtdO1xuICAgICAgICBkYXRhQ2VsbHM6IGFueVtdO1xuXG4gICAgICAgIC8vIFdlIGtlZXAgYSBzaW5nbGUgZmxhZyBmb3IgZWFjaCBkYXRhIHBvaW50IFt5LHhdXG4gICAgICAgIC8vIGFzIHdlbGwgYXMgdHdvIGxpbmVhciBzZXRzIG9mIGZsYWdzIGZvciBlbmFibGluZyBvciBkaXNhYmxpbmdcbiAgICAgICAgLy8gZW50aXJlIGNvbHVtbnMvcm93cy5cbiAgICAgICAgYWN0aXZlQ29sRmxhZ3M6IGFueVtdO1xuICAgICAgICBhY3RpdmVSb3dGbGFnczogYW55W107XG4gICAgICAgIGFjdGl2ZUZsYWdzOiBhbnlbXTtcblxuICAgICAgICAvLyBBcnJheXMgZm9yIHRoZSBwdWxsZG93biBtZW51cyBvbiB0aGUgbGVmdCBzaWRlIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgLy8gVGhlc2UgcHVsbGRvd25zIGFyZSB1c2VkIHRvIHNwZWNpZnkgdGhlIGRhdGEgdHlwZSAtIG9yIHR5cGVzIC0gY29udGFpbmVkIGluIGVhY2hcbiAgICAgICAgLy8gcm93IG9mIHRoZSBwYXN0ZWQgZGF0YS5cbiAgICAgICAgcHVsbGRvd25PYmplY3RzOiBhbnlbXTtcbiAgICAgICAgcHVsbGRvd25TZXR0aW5nczogYW55W107XG4gICAgICAgIC8vIFdlIGFsc28ga2VlcCBhIHNldCBvZiBmbGFncyB0byB0cmFjayB3aGV0aGVyIGEgcHVsbGRvd24gd2FzIGNoYW5nZWQgYnkgYSB1c2VyIGFuZFxuICAgICAgICAvLyB3aWxsIG5vdCBiZSByZWNhbGN1bGF0ZWQuXG4gICAgICAgIHB1bGxkb3duVXNlckNoYW5nZWRGbGFnczogYW55W107XG5cbiAgICAgICAgZ3JhcGhFbmFibGVkOmJvb2xlYW47XG4gICAgICAgIGdyYXBoUmVmcmVzaFRpbWVySUQ6IGFueTtcblxuICAgICAgICAvLyBEYXRhIHN0cnVjdHVyZXMgcHVsbGVkIGZyb20gdGhlIFN0ZXAgMiBncmlkIG9yIHNlcnZlciByZXNwb25zZSxcbiAgICAgICAgLy8gYW5kIGNvbXBvc2VkIGludG8gc2V0cyBzdWl0YWJsZSBmb3Igc3VibWlzc2lvbiB0byB0aGUgc2VydmVyLlxuICAgICAgICBwYXJzZWRTZXRzOiBSYXdJbXBvcnRTZXRbXTtcbiAgICAgICAgZ3JhcGhTZXRzOiBHcmFwaGluZ1NldFtdO1xuICAgICAgICB1bmlxdWVMaW5lTmFtZXM6IGFueVtdO1xuICAgICAgICB1bmlxdWVBc3NheU5hbWVzOiBhbnlbXTtcbiAgICAgICAgdW5pcXVlTWVhc3VyZW1lbnROYW1lczogYW55W107XG4gICAgICAgIHVuaXF1ZU1ldGFkYXRhTmFtZXM6IGFueVtdO1xuICAgICAgICAvLyBBIGZsYWcgdG8gaW5kaWNhdGUgd2hldGhlciB3ZSBoYXZlIHNlZW4gYW55IHRpbWVzdGFtcHMgc3BlY2lmaWVkIGluIHRoZSBpbXBvcnQgZGF0YVxuICAgICAgICBzZWVuQW55VGltZXN0YW1wczogYm9vbGVhbjtcblxuICAgICAgICByYXdJbnB1dFN0ZXA6IFJhd0lucHV0U3RlcDtcbiAgICAgICAgc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICAgICAgbmV4dFN0ZXBDYWxsYmFjazogYW55O1xuXG5cbiAgICAgICAgY29uc3RydWN0b3Ioc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcCwgcmF3SW5wdXRTdGVwOiBSYXdJbnB1dFN0ZXAsIG5leHRTdGVwQ2FsbGJhY2s6IGFueSkge1xuXG4gICAgICAgICAgICB0aGlzLnJhd0lucHV0U3RlcCA9IHJhd0lucHV0U3RlcDtcblxuICAgICAgICAgICAgdGhpcy5yb3dMYWJlbENlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLmNvbENoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuY29sT2JqZWN0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5kYXRhQ2VsbHMgPSBbXTtcblxuICAgICAgICAgICAgLy8gV2Uga2VlcCBhIHNpbmdsZSBmbGFnIGZvciBlYWNoIGRhdGEgcG9pbnQgW3kseF1cbiAgICAgICAgICAgIC8vIGFzIHdlbGwgYXMgdHdvIGxpbmVhciBzZXRzIG9mIGZsYWdzIGZvciBlbmFibGluZyBvciBkaXNhYmxpbmdcbiAgICAgICAgICAgIC8vIGVudGlyZSBjb2x1bW5zL3Jvd3MuXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUNvbEZsYWdzID0gW107XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVJvd0ZsYWdzID0gW107XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzID0gW107XG5cbiAgICAgICAgICAgIC8vIEFycmF5cyBmb3IgdGhlIHB1bGxkb3duIG1lbnVzIG9uIHRoZSBsZWZ0IHNpZGUgb2YgdGhlIHRhYmxlLlxuICAgICAgICAgICAgLy8gVGhlc2UgcHVsbGRvd25zIGFyZSB1c2VkIHRvIHNwZWNpZnkgdGhlIGRhdGEgdHlwZSAtIG9yIHR5cGVzIC0gY29udGFpbmVkIGluIGVhY2hcbiAgICAgICAgICAgIC8vIHJvdyBvZiB0aGUgcGFzdGVkIGRhdGEuXG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duT2JqZWN0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5wdWxsZG93blNldHRpbmdzID0gW107XG4gICAgICAgICAgICAvLyBXZSBhbHNvIGtlZXAgYSBzZXQgb2YgZmxhZ3MgdG8gdHJhY2sgd2hldGhlciBhIHB1bGxkb3duIHdhcyBjaGFuZ2VkIGJ5IGEgdXNlciBhbmRcbiAgICAgICAgICAgIC8vIHdpbGwgbm90IGJlIHJlY2FsY3VsYXRlZC5cbiAgICAgICAgICAgIHRoaXMucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzID0gW107XG5cbiAgICAgICAgICAgIHRoaXMuZ3JhcGhFbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IG51bGw7XG5cbiAgICAgICAgICAgIHRoaXMucGFyc2VkU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5ncmFwaFNldHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTGluZU5hbWVzID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUFzc2F5TmFtZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTWVhc3VyZW1lbnROYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVNZXRhZGF0YU5hbWVzID0gW107XG4gICAgICAgICAgICAvLyBBIGZsYWcgdG8gaW5kaWNhdGUgd2hldGhlciB3ZSBoYXZlIHNlZW4gYW55IHRpbWVzdGFtcHMgc3BlY2lmaWVkIGluIHRoZSBpbXBvcnQgZGF0YVxuICAgICAgICAgICAgdGhpcy5zZWVuQW55VGltZXN0YW1wcyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAgPSBzZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrID0gbmV4dFN0ZXBDYWxsYmFjaztcblxuICAgICAgICAgICAgJCgnI2RhdGFUYWJsZURpdicpXG4gICAgICAgICAgICAgICAgLm9uKCdtb3VzZW92ZXIgbW91c2VvdXQnLCAndGQnLCB0aGlzLmhpZ2hsaWdodGVyRi5iaW5kKHRoaXMpKVxuICAgICAgICAgICAgICAgIC5vbignZGJsY2xpY2snLCAndGQnLCB0aGlzLnNpbmdsZVZhbHVlRGlzYWJsZXJGLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAkKCcjcmVzZXRzdGVwMycpLm9uKCdjbGljaycsIHRoaXMucmVzZXRFbmFibGVkRmxhZ01hcmtlcnMuYmluZCh0aGlzKSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHByZXZpb3VzU3RlcENoYW5nZWQoKTogdm9pZCB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBtb2RlID0gdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZTtcblxuICAgICAgICAgICAgdmFyIGdyYXBoID0gJCgnI2dyYXBoRGl2Jyk7XG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ2Jpb2xlY3RvcicpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoRW5hYmxlZCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhFbmFibGVkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBncmFwaC50b2dnbGVDbGFzcygnb2ZmJywgIXRoaXMuZ3JhcGhFbmFibGVkKTtcblxuICAgICAgICAgICAgdmFyIGdyaWRSb3dNYXJrZXJzID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnM7XG4gICAgICAgICAgICB2YXIgZ3JpZCA9IHRoaXMucmF3SW5wdXRTdGVwLmdldEdyaWQoKTtcbiAgICAgICAgICAgIHZhciBpZ25vcmVEYXRhR2FwcyA9IHRoaXMucmF3SW5wdXRTdGVwLmlnbm9yZURhdGFHYXBzO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInKSB7XG4gICAgICAgICAgICAgICAgZ3JpZFJvd01hcmtlcnMuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0eXBlOiBhbnk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5wdWxsZG93blVzZXJDaGFuZ2VkRmxhZ3NbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgPSB0aGlzLmZpZ3VyZU91dFRoaXNSb3dzRGF0YVR5cGUobW9kZSwgdmFsdWUsIGdyaWRbaV0gfHwgW10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93blNldHRpbmdzW2ldID0gdHlwZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSdyZSBlbXB0eWluZyB0aGUgZGF0YSB0YWJsZSB3aGV0aGVyIHdlIHJlbWFrZSBpdCBvciBub3QuLi5cbiAgICAgICAgICAgICQoJyNkYXRhVGFibGVEaXYnKS5lbXB0eSgpO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInIHx8IG1vZGUgPT09ICdtZHYnKSB7XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGEgbWFwIG9mIGVuYWJsZWQvZGlzYWJsZWQgZmxhZ3MgZm9yIG91ciBkYXRhLFxuICAgICAgICAgICAgICAgIC8vIGJ1dCBvbmx5IGZpbGwgdGhlIGFyZWFzIHRoYXQgZG8gbm90IGFscmVhZHkgZXhpc3QuXG4gICAgICAgICAgICAgICAgdGhpcy5pbmZlckFjdGl2ZUZsYWdzKGdyaWQpO1xuICAgICAgICAgICAgICAgIC8vIENvbnN0cnVjdCB0YWJsZSBjZWxsIG9iamVjdHMgZm9yIHRoZSBwYWdlLCBiYXNlZCBvbiBvdXIgZXh0cmFjdGVkIGRhdGFcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnN0cnVjdERhdGFUYWJsZShtb2RlLCBncmlkLCBncmlkUm93TWFya2Vycyk7XG4gICAgICAgICAgICAgICAgLy8gYW5kIGxlYXZpbmcgb3V0IGFueSB2YWx1ZXMgdGhhdCBoYXZlIGJlZW4gaW5kaXZpZHVhbGx5IGZsYWdnZWQuXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBzdHlsZXMgb2YgdGhlIG5ldyB0YWJsZSB0byByZWZsZWN0IHRoZVxuICAgICAgICAgICAgICAgIC8vIChwb3NzaWJseSBwcmV2aW91c2x5IHNldCkgZmxhZyBtYXJrZXJzIGFuZCB0aGUgXCJpZ25vcmUgZ2Fwc1wiIHNldHRpbmcuXG4gICAgICAgICAgICAgICAgdGhpcy5yZWRyYXdJZ25vcmVkVmFsdWVNYXJrZXJzKGlnbm9yZURhdGFHYXBzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRWl0aGVyIHdlJ3JlIGludGVycHJldGluZyBzb21lIHByZS1wcm9jZXNzZWQgZGF0YSBzZXRzIGZyb20gYSBzZXJ2ZXIgcmVzcG9uc2UsXG4gICAgICAgICAgICAvLyBvciB3ZSdyZSBpbnRlcnByZXRpbmcgdGhlIGRhdGEgdGFibGUgd2UganVzdCBsYWlkIG91dCBhYm92ZSxcbiAgICAgICAgICAgIC8vIHdoaWNoIGludm9sdmVzIHNraXBwaW5nIGRpc2FibGVkIHJvd3Mgb3IgY29sdW1ucywgb3B0aW9uYWxseSBpZ25vcmluZyBibGFuayB2YWx1ZXMsIGV0Yy5cbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgICAgICAgICAvLyBTdGFydCBhIGRlbGF5IHRpbWVyIHRoYXQgcmVkcmF3cyB0aGUgZ3JhcGggZnJvbSB0aGUgaW50ZXJwcmV0ZWQgZGF0YS5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgcmF0aGVyIHJlc291cmNlIGludGVuc2l2ZSwgc28gd2UncmUgZGVsYXlpbmcgYSBiaXQsIGFuZCByZXN0YXJ0aW5nIHRoZSBkZWxheVxuICAgICAgICAgICAgLy8gaWYgdGhlIHVzZXIgbWFrZXMgYWRkaXRpb25hbCBlZGl0cyB0byB0aGUgZGF0YSB3aXRoaW4gdGhlIGRlbGF5IHBlcmlvZC5cbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGZpZ3VyZU91dFRoaXNSb3dzRGF0YVR5cGUobW9kZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCByb3c6IHN0cmluZ1tdKTogbnVtYmVyIHtcbiAgICAgICAgICAgIHZhciBibGFuazogbnVtYmVyLCBzdHJpbmdzOiBudW1iZXIsIGNvbmRlbnNlZDogc3RyaW5nW107XG4gICAgICAgICAgICBpZiAobW9kZSA9PSAndHInKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxhYmVsLm1hdGNoKC9nZW5lL2kpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBUeXBlRW51bS5HZW5lX05hbWVzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobGFiZWwubWF0Y2goL3Jwa20vaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFR5cGVFbnVtLlJQS01fVmFsdWVzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBjYW4ndCBtYXRjaCB0byB0aGUgYWJvdmUgdHdvLCBzZXQgdGhlIHJvdyB0byAndW5kZWZpbmVkJyBzbyBpdCdzIGlnbm9yZWQgYnkgZGVmYXVsdFxuICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVGFrZSBjYXJlIG9mIHNvbWUgYnJhaW5kZWFkIGd1ZXNzZXNcbiAgICAgICAgICAgIGlmIChsYWJlbC5tYXRjaCgvYXNzYXkvaSkgfHwgbGFiZWwubWF0Y2goL2xpbmUvaSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gVHlwZUVudW0uQXNzYXlfTGluZV9OYW1lcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtb2RlID09ICdwcicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGFiZWwubWF0Y2goL3Byb3RlaW4vaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFR5cGVFbnVtLlByb3RlaW5fTmFtZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gTm8gcG9pbnQgaW4gY29udGludWluZywgb25seSBsaW5lIGFuZCBwcm90ZWluIGFyZSByZWxldmFudFxuICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVGhpbmdzIHdlJ2xsIGJlIGNvdW50aW5nIHRvIGhhemFyZCBhIGd1ZXNzIGF0IHRoZSByb3cgY29udGVudHNcbiAgICAgICAgICAgIGJsYW5rID0gc3RyaW5ncyA9IDA7XG4gICAgICAgICAgICAvLyBBIGNvbmRlbnNlZCB2ZXJzaW9uIG9mIHRoZSByb3csIHdpdGggbm8gbnVsbHMgb3IgYmxhbmsgdmFsdWVzXG4gICAgICAgICAgICBjb25kZW5zZWQgPSByb3cuZmlsdGVyKCh2OiBzdHJpbmcpOiBib29sZWFuID0+ICEhdik7XG4gICAgICAgICAgICBibGFuayA9IHJvdy5sZW5ndGggLSBjb25kZW5zZWQubGVuZ3RoO1xuICAgICAgICAgICAgY29uZGVuc2VkLmZvckVhY2goKHY6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHYgPSB2LnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgIGlmIChpc05hTihwYXJzZUZsb2F0KHYpKSkge1xuICAgICAgICAgICAgICAgICAgICArK3N0cmluZ3M7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB0aGUgbGFiZWwgcGFyc2VzIGludG8gYSBudW1iZXIgYW5kIHRoZSBkYXRhIGNvbnRhaW5zIG5vIHN0cmluZ3MsIGNhbGwgaXQgYSB0aW1zZXRhbXAgZm9yIGRhdGFcbiAgICAgICAgICAgIGlmICghaXNOYU4ocGFyc2VGbG9hdChsYWJlbCkpICYmIChzdHJpbmdzID09PSAwKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBUeXBlRW51bS5UaW1lc3RhbXA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBObyBjaG9pY2UgYnkgZGVmYXVsdFxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGluZmVyQWN0aXZlRmxhZ3MoZ3JpZDphbnkpOnZvaWQge1xuICAgICAgICAgICAgLy8gQW4gaW1wb3J0YW50IHRoaW5nIHRvIG5vdGUgaGVyZSBpcyB0aGF0IHRoaXMgZGF0YSBpcyBpbiBbeV1beF0gZm9ybWF0IC1cbiAgICAgICAgICAgIC8vIHRoYXQgaXMsIGl0IGdvZXMgYnkgcm93LCB0aGVuIGJ5IGNvbHVtbiwgd2hlbiByZWZlcmVuY2luZy5cbiAgICAgICAgICAgIC8vIFRoaXMgbWF0Y2hlcyBHcmlkLmRhdGEgYW5kIFRhYmxlLmRhdGFDZWxscy5cbiAgICAgICAgICAgIHZhciB4OiBudW1iZXIsIHk6IG51bWJlcjtcblxuICAgICAgICAgICAgKGdyaWRbMF0gfHwgW10pLmZvckVhY2goKF8sIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUNvbEZsYWdzW3hdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1t4XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVJvd0ZsYWdzW3ldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFnc1t5XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV0gPSB0aGlzLmFjdGl2ZUZsYWdzW3ldIHx8IFtdO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChfLCB4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBjb25zdHJ1Y3REYXRhVGFibGUobW9kZTpzdHJpbmcsIGdyaWQ6YW55LCBncmlkUm93TWFya2VyczphbnkpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBjb250cm9sQ29sczogc3RyaW5nW10sIHB1bGxkb3duT3B0aW9uczogUm93UHVsbGRvd25PcHRpb25bXSxcbiAgICAgICAgICAgICAgICB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgY29sZ3JvdXA6IEpRdWVyeSwgYm9keTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQ7XG5cbiAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLmNvbENoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuY29sT2JqZWN0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5yb3dMYWJlbENlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLnJvd0NoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICAgICAgICAgIGNvbnRyb2xDb2xzID0gWydjaGVja2JveCcsICdwdWxsZG93bicsICdsYWJlbCddO1xuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICd0cicpIHtcbiAgICAgICAgICAgICAgICBwdWxsZG93bk9wdGlvbnMgPSBbXG4gICAgICAgICAgICAgICAgICAgIFsnLS0nLCAwXSxcbiAgICAgICAgICAgICAgICAgICAgWydFbnRpcmUgUm93IElzLi4uJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnR2VuZSBOYW1lcycsIFR5cGVFbnVtLkdlbmVfTmFtZXNdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnUlBLTSBWYWx1ZXMnLCBUeXBlRW51bS5SUEtNX1ZhbHVlc11cbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdwcicpIHtcbiAgICAgICAgICAgICAgICBwdWxsZG93bk9wdGlvbnMgPSBbXG4gICAgICAgICAgICAgICAgICAgIFsnLS0nLCAwXSxcbiAgICAgICAgICAgICAgICAgICAgWydFbnRpcmUgUm93IElzLi4uJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnQXNzYXkvTGluZSBOYW1lcycsIFR5cGVFbnVtLkFzc2F5X0xpbmVfTmFtZXNdLFxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICBbJ0ZpcnN0IENvbHVtbiBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ1Byb3RlaW4gTmFtZScsIFR5cGVFbnVtLlByb3RlaW5fTmFtZV1cbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHB1bGxkb3duT3B0aW9ucyA9IFtcbiAgICAgICAgICAgICAgICAgICAgWyctLScsIDBdLFxuICAgICAgICAgICAgICAgICAgICBbJ0VudGlyZSBSb3cgSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydBc3NheS9MaW5lIE5hbWVzJywgVHlwZUVudW0uQXNzYXlfTGluZV9OYW1lc10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydNZXRhYm9saXRlIE5hbWVzJywgVHlwZUVudW0uTWV0YWJvbGl0ZV9OYW1lc11cbiAgICAgICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgWydGaXJzdCBDb2x1bW4gSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydUaW1lc3RhbXAnLCBUeXBlRW51bS5UaW1lc3RhbXBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnTWV0YWRhdGEgTmFtZScsIFR5cGVFbnVtLk1ldGFkYXRhX05hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnTWV0YWJvbGl0ZSBOYW1lJywgVHlwZUVudW0uTWV0YWJvbGl0ZV9OYW1lXVxuICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gYXR0YWNoIGFsbCBldmVudCBoYW5kbGVycyB0byB0aGUgdGFibGUgaXRzZWxmXG4gICAgICAgICAgICB2YXIgdCA9IHRoaXM7XG4gICAgICAgICAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0YWJsZT4nKS5hdHRyKCdjZWxsc3BhY2luZycsICcwJykuYXBwZW5kVG8oJCgnI2RhdGFUYWJsZURpdicpKVxuICAgICAgICAgICAgICAgIC5vbignY2xpY2snLCAnW25hbWU9ZW5hYmxlQ29sdW1uXScsIChldjogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0LnRvZ2dsZVRhYmxlQ29sdW1uKGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgfSkub24oJ2NsaWNrJywgJ1tuYW1lPWVuYWJsZVJvd10nLCAoZXY6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdC50b2dnbGVUYWJsZVJvdyhldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgIH0pLm9uKCdjaGFuZ2UnLCAnLnB1bGxkb3duQ2VsbCA+IHNlbGVjdCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZzogSlF1ZXJ5ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0LmNoYW5nZWRSb3dEYXRhVHlwZVB1bGxkb3duKFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyc2VJbnQodGFyZy5hdHRyKCdpJyksIDEwKSwgcGFyc2VJbnQodGFyZy52YWwoKSwgMTApKTtcbiAgICAgICAgICAgICAgICB9KVswXTtcbiAgICAgICAgICAgIC8vIE9uZSBvZiB0aGUgb2JqZWN0cyBoZXJlIHdpbGwgYmUgYSBjb2x1bW4gZ3JvdXAsIHdpdGggY29sIG9iamVjdHMgaW4gaXQuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGFuIGludGVyZXN0aW5nIHR3aXN0IG9uIERPTSBiZWhhdmlvciB0aGF0IHlvdSBzaG91bGQgcHJvYmFibHkgZ29vZ2xlLlxuICAgICAgICAgICAgY29sZ3JvdXAgPSAkKCc8Y29sZ3JvdXA+JykuYXBwZW5kVG8odGFibGUpO1xuICAgICAgICAgICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgICAgICAgICAvLyBTdGFydCB3aXRoIHRocmVlIGNvbHVtbnMsIGZvciB0aGUgY2hlY2tib3hlcywgcHVsbGRvd25zLCBhbmQgbGFiZWxzLlxuICAgICAgICAgICAgLy8gKFRoZXNlIHdpbGwgbm90IGJlIHRyYWNrZWQgaW4gVGFibGUuY29sT2JqZWN0cy4pXG4gICAgICAgICAgICBjb250cm9sQ29scy5mb3JFYWNoKCgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkKCc8Y29sPicpLmFwcGVuZFRvKGNvbGdyb3VwKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gYWRkIGNvbCBlbGVtZW50cyBmb3IgZWFjaCBkYXRhIGNvbHVtblxuICAgICAgICAgICAgKGdyaWRbMF0gfHwgW10pLmZvckVhY2goKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuY29sT2JqZWN0cy5wdXNoKCQoJzxjb2w+JykuYXBwZW5kVG8oY29sZ3JvdXApWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gRmlyc3Qgcm93OiBzcGFjZXIgY2VsbHMsIGZvbGxvd2VkIGJ5IGNoZWNrYm94IGNlbGxzIGZvciBlYWNoIGRhdGEgY29sdW1uXG4gICAgICAgICAgICByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD5ib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgLy8gc3BhY2VyIGNlbGxzIGhhdmUgeCBhbmQgeSBzZXQgdG8gMCB0byByZW1vdmUgZnJvbSBoaWdobGlnaHQgZ3JpZFxuICAgICAgICAgICAgY29udHJvbENvbHMuZm9yRWFjaCgoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgJChyb3cuaW5zZXJ0Q2VsbCgpKS5hdHRyKHsgJ3gnOiAnMCcsICd5JzogMCB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgKGdyaWRbMF0gfHwgW10pLmZvckVhY2goKF8sIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnksIGJveDogSlF1ZXJ5O1xuICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoeyAnaWQnOiAnY29sQ0JDZWxsJyArIGksICd4JzogMSArIGksICd5JzogMCB9KVxuICAgICAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2NoZWNrQm94Q2VsbCcpO1xuICAgICAgICAgICAgICAgIGJveCA9ICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIi8+JykuYXBwZW5kVG8oY2VsbClcbiAgICAgICAgICAgICAgICAgICAgLnZhbChpLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2VuYWJsZUNvbHVtbicgKyBpLCAnbmFtZSc6ICdlbmFibGVDb2x1bW4nIH0pXG4gICAgICAgICAgICAgICAgICAgIC5wcm9wKCdjaGVja2VkJywgdGhpcy5hY3RpdmVDb2xGbGFnc1tpXSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xDaGVja2JveENlbGxzLnB1c2goY2VsbFswXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzID0gW107ICAvLyBXZSBkb24ndCB3YW50IGFueSBsaW5nZXJpbmcgb2xkIG9iamVjdHMgaW4gdGhpc1xuICAgICAgICAgICAgLy8gVGhlIHJlc3Qgb2YgdGhlIHJvd3M6IEEgcHVsbGRvd24sIGEgY2hlY2tib3gsIGEgcm93IGxhYmVsLCBhbmQgYSByb3cgb2YgZGF0YS5cbiAgICAgICAgICAgIGdyaWQuZm9yRWFjaCgodmFsdWVzOiBzdHJpbmdbXSwgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeTtcbiAgICAgICAgICAgICAgICByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD5ib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgIC8vIGNoZWNrYm94IGNlbGxcbiAgICAgICAgICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hZGRDbGFzcygnY2hlY2tCb3hDZWxsJylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAncm93Q0JDZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMSB9KTtcbiAgICAgICAgICAgICAgICAkKCc8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIvPicpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2VuYWJsZVJvdycgKyBpLCAnbmFtZSc6ICdlbmFibGVSb3cnLCB9KVxuICAgICAgICAgICAgICAgICAgICAudmFsKGkudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgLnByb3AoJ2NoZWNrZWQnLCB0aGlzLmFjdGl2ZVJvd0ZsYWdzW2ldKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yb3dDaGVja2JveENlbGxzLnB1c2goY2VsbFswXSk7XG4gICAgICAgICAgICAgICAgLy8gcHVsbGRvd24gY2VsbFxuICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdwdWxsZG93bkNlbGwnKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdyb3dQQ2VsbCcgKyBpLCAneCc6IDAsICd5JzogaSArIDEgfSk7XG4gICAgICAgICAgICAgICAgLy8gdXNlIGV4aXN0aW5nIHNldHRpbmcsIG9yIHVzZSB0aGUgbGFzdCBpZiByb3dzLmxlbmd0aCA+IHNldHRpbmdzLmxlbmd0aCwgb3IgYmxhbmtcbiAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV1cbiAgICAgICAgICAgICAgICAgICAgfHwgdGhpcy5wdWxsZG93blNldHRpbmdzLnNsaWNlKC0xKVswXSB8fCAwXG4gICAgICAgICAgICAgICAgdGhpcy5wb3B1bGF0ZVB1bGxkb3duKFxuICAgICAgICAgICAgICAgICAgICBjZWxsID0gJCgnPHNlbGVjdD4nKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAncm93JyArIGkgKyAndHlwZScsICduYW1lJzogJ3JvdycgKyBpICsgJ3R5cGUnLCAnaSc6IGkgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKSxcbiAgICAgICAgICAgICAgICAgICAgcHVsbGRvd25PcHRpb25zLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzLnB1c2goY2VsbFswXSk7XG4gICAgICAgICAgICAgICAgLy8gbGFiZWwgY2VsbFxuICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoeyAnaWQnOiAncm93TUNlbGwnICsgaSwgJ3gnOiAwLCAneSc6IGkgKyAxIH0pO1xuICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChncmlkUm93TWFya2Vyc1tpXSkuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yb3dMYWJlbENlbGxzLnB1c2goY2VsbFswXSk7XG4gICAgICAgICAgICAgICAgLy8gdGhlIHRhYmxlIGRhdGEgaXRzZWxmXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhQ2VsbHNbaV0gPSBbXTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzaG9ydDogc3RyaW5nO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHNob3J0ID0gdmFsdWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAzMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2hvcnQgPSB2YWx1ZS5zdWJzdHIoMCwgMzEpICsgJ+KApic7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7XG4gICAgICAgICAgICAgICAgICAgICAgICAnaWQnOiAndmFsQ2VsbCcgKyB4ICsgJy0nICsgaSxcbiAgICAgICAgICAgICAgICAgICAgICAgICd4JzogeCArIDEsXG4gICAgICAgICAgICAgICAgICAgICAgICAneSc6IGkgKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3RpdGxlJzogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAnaXNibGFuayc6IHZhbHVlID09PSAnJyA/IDEgOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChzaG9ydCkuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzW2ldLnB1c2goY2VsbFswXSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuYXBwbHlUYWJsZURhdGFUeXBlU3R5bGluZyhncmlkKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQSByZWN1cnNpdmUgZnVuY3Rpb24gdG8gcG9wdWxhdGUgYSBwdWxsZG93biB3aXRoIG9wdGlvbmFsIG9wdGlvbmdyb3VwcyxcbiAgICAgICAgLy8gYW5kIGEgZGVmYXVsdCBzZWxlY3Rpb25cbiAgICAgICAgcG9wdWxhdGVQdWxsZG93bihzZWxlY3Q6SlF1ZXJ5LCBvcHRpb25zOlJvd1B1bGxkb3duT3B0aW9uW10sIHZhbHVlOm51bWJlcik6dm9pZCB7XG4gICAgICAgICAgICBvcHRpb25zLmZvckVhY2goKG9wdGlvbjogUm93UHVsbGRvd25PcHRpb24pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvblsxXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KG9wdGlvblswXSkudmFsKG9wdGlvblsxXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsIG9wdGlvblsxXSA9PT0gdmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oc2VsZWN0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvcHVsYXRlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8b3B0Z3JvdXA+JykuYXR0cignbGFiZWwnLCBvcHRpb25bMF0pLmFwcGVuZFRvKHNlbGVjdCksXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25bMV0sIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyByb3V0aW5lIGRvZXMgYSBiaXQgb2YgYWRkaXRpb25hbCBzdHlsaW5nIHRvIHRoZSBTdGVwIDMgZGF0YSB0YWJsZS5cbiAgICAgICAgLy8gSXQgcmVtb3ZlcyBhbmQgcmUtYWRkcyB0aGUgZGF0YVR5cGVDZWxsIGNzcyBjbGFzc2VzIGFjY29yZGluZyB0byB0aGUgcHVsbGRvd24gc2V0dGluZ3MgZm9yIGVhY2ggcm93LlxuICAgICAgICBhcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nKGdyaWQ6YW55KTp2b2lkIHtcblxuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCBpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGhsTGFiZWw6IGJvb2xlYW4sIGhsUm93OiBib29sZWFuO1xuICAgICAgICAgICAgICAgIHB1bGxkb3duID0gdGhpcy5wdWxsZG93blNldHRpbmdzW2luZGV4XSB8fCAwO1xuICAgICAgICAgICAgICAgIGhsTGFiZWwgPSBobFJvdyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uQXNzYXlfTGluZV9OYW1lcyB8fCBwdWxsZG93biA9PT0gVHlwZUVudW0uTWV0YWJvbGl0ZV9OYW1lcykge1xuICAgICAgICAgICAgICAgICAgICBobFJvdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICggcHVsbGRvd24gPT09IFR5cGVFbnVtLlRpbWVzdGFtcCB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHB1bGxkb3duID09PSBUeXBlRW51bS5NZXRhZGF0YV9OYW1lIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHVsbGRvd24gPT09IFR5cGVFbnVtLk1ldGFib2xpdGVfTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBobExhYmVsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgJCh0aGlzLnJvd0xhYmVsQ2VsbHNbaW5kZXhdKS50b2dnbGVDbGFzcygnZGF0YVR5cGVDZWxsJywgaGxMYWJlbCk7XG4gICAgICAgICAgICAgICAgcm93LmZvckVhY2goKF8sIGNvbDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcy5kYXRhQ2VsbHNbaW5kZXhdW2NvbF0pLnRvZ2dsZUNsYXNzKCdkYXRhVHlwZUNlbGwnLCBobFJvdyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVkcmF3SWdub3JlZFZhbHVlTWFya2VycyhpZ25vcmVEYXRhR2Fwczpib29sZWFuKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmRhdGFDZWxscy5mb3JFYWNoKChyb3c6IEhUTUxFbGVtZW50W10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICByb3cuZm9yRWFjaCgoY2VsbDogSFRNTEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRvZ2dsZTogYm9vbGVhbiA9ICFpZ25vcmVEYXRhR2FwcyAmJiAhIWNlbGwuZ2V0QXR0cmlidXRlKCdpc2JsYW5rJyk7XG4gICAgICAgICAgICAgICAgICAgICQoY2VsbCkudG9nZ2xlQ2xhc3MoJ2lnbm9yZWRMaW5lJywgdG9nZ2xlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICByZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzLmZvckVhY2goKHJvdzogSFRNTEVsZW1lbnRbXSwgeTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRvZ2dsZTogYm9vbGVhbiA9ICF0aGlzLmFjdGl2ZVJvd0ZsYWdzW3ldO1xuICAgICAgICAgICAgICAgICQodGhpcy5yb3dMYWJlbENlbGxzW3ldKS50b2dnbGVDbGFzcygnZGlzYWJsZWRMaW5lJywgdG9nZ2xlKTtcbiAgICAgICAgICAgICAgICByb3cuZm9yRWFjaCgoY2VsbDogSFRNTEVsZW1lbnQsIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0b2dnbGUgPSAhdGhpcy5hY3RpdmVGbGFnc1t5XVt4XVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIXRoaXMuYWN0aXZlQ29sRmxhZ3NbeF1cbiAgICAgICAgICAgICAgICAgICAgICAgIHx8ICF0aGlzLmFjdGl2ZVJvd0ZsYWdzW3ldO1xuICAgICAgICAgICAgICAgICAgICAkKGNlbGwpLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmNvbENoZWNrYm94Q2VsbHMuZm9yRWFjaCgoYm94OiBIVE1MRWxlbWVudCwgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRvZ2dsZTogYm9vbGVhbiA9ICF0aGlzLmFjdGl2ZUNvbEZsYWdzW3hdO1xuICAgICAgICAgICAgICAgICQoYm94KS50b2dnbGVDbGFzcygnZGlzYWJsZWRMaW5lJywgdG9nZ2xlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBjaGFuZ2VkUm93RGF0YVR5cGVQdWxsZG93bihpbmRleDogbnVtYmVyLCB2YWx1ZTogbnVtYmVyKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZDogbnVtYmVyO1xuXG4gICAgICAgICAgICB2YXIgZ3JpZCA9IHRoaXMucmF3SW5wdXRTdGVwLmdldEdyaWQoKTtcblxuICAgICAgICAgICAgLy8gVGhlIHZhbHVlIGRvZXMgbm90IG5lY2Vzc2FyaWx5IG1hdGNoIHRoZSBzZWxlY3RlZEluZGV4LlxuICAgICAgICAgICAgc2VsZWN0ZWQgPSB0aGlzLnB1bGxkb3duT2JqZWN0c1tpbmRleF0uc2VsZWN0ZWRJbmRleDtcbiAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpbmRleF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzW2luZGV4XSA9IHRydWU7XG4gICAgICAgICAgICBpZiAoICAgIHZhbHVlID09PSBUeXBlRW51bS5UaW1lc3RhbXAgfHxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPT09IFR5cGVFbnVtLk1ldGFkYXRhX05hbWUgfHxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPT09IFR5cGVFbnVtLk1ldGFib2xpdGVfTmFtZSB8fFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9PT0gVHlwZUVudW0uUHJvdGVpbl9OYW1lKSB7XG4gICAgICAgICAgICAgICAgLy8gXCJUaW1lc3RhbXBcIiwgXCJNZXRhZGF0YVwiLCBvciBvdGhlciBzaW5nbGUtdGFibGUtY2VsbCB0eXBlc1xuICAgICAgICAgICAgICAgIC8vIFNldCBhbGwgdGhlIHJlc3Qgb2YgdGhlIHB1bGxkb3ducyB0byB0aGlzLFxuICAgICAgICAgICAgICAgIC8vIGJhc2VkIG9uIHRoZSBhc3N1bXB0aW9uIHRoYXQgdGhlIGZpcnN0IGlzIGZvbGxvd2VkIGJ5IG1hbnkgb3RoZXJzXG4gICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHMuc2xpY2UoaW5kZXggKyAxKS5ldmVyeShcbiAgICAgICAgICAgICAgICAgICAgKHB1bGxkb3duOiBIVE1MU2VsZWN0RWxlbWVudCk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNlbGVjdDogSlF1ZXJ5LCBpOiBudW1iZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3QgPSAkKHB1bGxkb3duKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkgPSBwYXJzZUludChzZWxlY3QuYXR0cignaScpLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wdWxsZG93blVzZXJDaGFuZ2VkRmxhZ3NbaV1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7IC8vIGZhbHNlIGZvciBicmVha1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0LnZhbCh2YWx1ZS50b1N0cmluZygpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIEluIGFkZGl0aW9uIHRvIHRoZSBhYm92ZSBhY3Rpb24sIHdlIGFsc28gbmVlZCB0byBkbyBzb21lIGNoZWNraW5nIG9uIHRoZSBlbnRpcmUgc2V0IG9mXG4gICAgICAgICAgICAgICAgLy8gcHVsbGRvd25zLCB0byBlbmZvcmNlIGEgZGl2aXNpb24gYmV0d2VlbiB0aGUgXCJNZXRhYm9saXRlIE5hbWVcIiBzaW5nbGUgZGF0YSB0eXBlIGFuZCB0aGVcbiAgICAgICAgICAgICAgICAvLyBvdGhlciBzaW5nbGUgZGF0YSB0eXBlcy4gSWYgdGhlIHVzZXIgdXNlcyBldmVuIG9uZSBcIk1ldGFib2xpdGUgTmFtZVwiIHB1bGxkb3duLCB3ZSBjYW4ndFxuICAgICAgICAgICAgICAgIC8vIGFsbG93IGFueSBvZiB0aGUgb3RoZXIgdHlwZXMsIGFuZCB2aWNlLXZlcnNhLlxuICAgICAgICAgICAgICAgIC8vICAgV2h5PyAgQmVjYXVzZSBcIk1ldGFib2xpdGUgTmFtZVwiIGlzIHVzZWQgdG8gbGFiZWwgdGhlIHNwZWNpZmljIGNhc2Ugb2YgYSB0YWJsZSB0aGF0XG4gICAgICAgICAgICAgICAgLy8gZG9lcyBub3QgY29udGFpbiBhIHRpbWVzdGFtcCBvbiBlaXRoZXIgYXhpcy4gIEluIHRoYXQgY2FzZSwgdGhlIHRhYmxlIGlzIG1lYW50IHRvXG4gICAgICAgICAgICAgICAgLy8gcHJvdmlkZSBkYXRhIGZvciBtdWx0aXBsZSBNZWFzdXJlbWVudHMgYW5kIEFzc2F5cyBmb3IgYSBzaW5nbGUgdW5zcGVjaWZpZWQgdGltZSBwb2ludC5cbiAgICAgICAgICAgICAgICAvLyAoVGhhdCB0aW1lIHBvaW50IGlzIHJlcXVlc3RlZCBsYXRlciBpbiB0aGUgVUkuKVxuICAgICAgICAgICAgICAgIC8vICAgSWYgd2UgYWxsb3cgYSBzaW5nbGUgdGltZXN0YW1wIHJvdywgdGhhdCBjcmVhdGVzIGFuIGluY29uc2lzdGVudCB0YWJsZSB0aGF0IGlzXG4gICAgICAgICAgICAgICAgLy8gaW1wb3NzaWJsZSB0byBpbnRlcnByZXQuXG4gICAgICAgICAgICAgICAgLy8gICBJZiB3ZSBhbGxvdyBhIHNpbmdsZSBtZXRhZGF0YSByb3csIHRoYXQgbGVhdmVzIHRoZSBtZXRhZGF0YSB1bmNvbm5lY3RlZCB0byBhIHNwZWNpZmljXG4gICAgICAgICAgICAgICAgLy8gbWVhc3VyZW1lbnQsIG1lYW5pbmcgdGhhdCB0aGUgb25seSB2YWxpZCB3YXkgdG8gaW50ZXJwcmV0IGl0IGlzIGFzIExpbmUgbWV0YWRhdGEuICBXZVxuICAgICAgICAgICAgICAgIC8vIGNvdWxkIHBvdGVudGlhbGx5IHN1cHBvcnQgdGhhdCwgYnV0IGl0IHdvdWxkIGJlIHRoZSBvbmx5IGNhc2Ugd2hlcmUgZGF0YSBpbXBvcnRlZCBvblxuICAgICAgICAgICAgICAgIC8vIHRoaXMgcGFnZSBkb2VzIG5vdCBlbmQgdXAgaW4gQXNzYXlzIC4uLiBhbmQgdGhhdCBjYXNlIGRvZXNuJ3QgbWFrZSBtdWNoIHNlbnNlIGdpdmVuXG4gICAgICAgICAgICAgICAgLy8gdGhhdCB0aGlzIGlzIHRoZSBBc3NheSBEYXRhIEltcG9ydCBwYWdlIVxuICAgICAgICAgICAgICAgIC8vICAgQW55d2F5LCBoZXJlIHdlIHJ1biB0aHJvdWdoIHRoZSBwdWxsZG93bnMsIG1ha2luZyBzdXJlIHRoYXQgaWYgdGhlIHVzZXIgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICAvLyBcIk1ldGFib2xpdGUgTmFtZVwiLCB3ZSBibGFuayBvdXQgYWxsIHJlZmVyZW5jZXMgdG8gXCJUaW1lc3RhbXBcIiBhbmQgXCJNZXRhZGF0YVwiLCBhbmRcbiAgICAgICAgICAgICAgICAvLyB2aWNlLXZlcnNhLlxuICAgICAgICAgICAgICAgIGdyaWQuZm9yRWFjaCgoXywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjOiBudW1iZXIgPSB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gVHlwZUVudW0uTWV0YWJvbGl0ZV9OYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYyA9PT0gVHlwZUVudW0uVGltZXN0YW1wIHx8IGMgPT09IFR5cGVFbnVtLk1ldGFkYXRhX05hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duT2JqZWN0c1tpXS5zZWxlY3RlZEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSBUeXBlRW51bS5NZXRhYm9saXRlX05hbWVzKSB7IC8vIENhbid0IGFsbG93IFwiTWVhc3VyZW1lbnQgVHlwZXNcIiBzZXR0aW5nIGVpdGhlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzW2ldLnNlbGVjdGVkSW5kZXggPSBUeXBlRW51bS5Bc3NheV9MaW5lX05hbWVzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IFR5cGVFbnVtLkFzc2F5X0xpbmVfTmFtZXM7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoKHZhbHVlID09PSBUeXBlRW51bS5UaW1lc3RhbXAgfHwgdmFsdWUgPT09IFR5cGVFbnVtLk1ldGFkYXRhX05hbWUpICYmIGMgPT09IFR5cGVFbnVtLk1ldGFib2xpdGVfTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHNbaV0uc2VsZWN0ZWRJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gSXQgd291bGQgc2VlbSBsb2dpY2FsIHRvIHJlcXVpcmUgYSBzaW1pbGFyIGNoZWNrIGZvciBcIlByb3RlaW4gTmFtZVwiLCBidXQgaW4gcHJhY3RpY2VcbiAgICAgICAgICAgICAgICAvLyB0aGUgdXNlciBpcyBkaXNhbGxvd2VkIGZyb20gc2VsZWN0aW5nIGFueSBvZiB0aGUgb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXMgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAvLyBwYWdlIGlzIGluIFByb3Rlb21pY3MgbW9kZS4gIFNvIHRoZSBjaGVjayBpcyByZWR1bmRhbnQuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFwcGx5VGFibGVEYXRhVHlwZVN0eWxpbmcoZ3JpZCk7XG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdG9nZ2xlVGFibGVSb3coYm94OiBFbGVtZW50KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZTogbnVtYmVyLCBpbnB1dDogSlF1ZXJ5O1xuICAgICAgICAgICAgaW5wdXQgPSAkKGJveCk7XG4gICAgICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KGlucHV0LnZhbCgpLCAxMCk7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVJvd0ZsYWdzW3ZhbHVlXSA9IGlucHV0LnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgLy8gUmVzZXR0aW5nIGEgZGlzYWJsZWQgcm93IG1heSBjaGFuZ2UgdGhlIG51bWJlciBvZiByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHRvZ2dsZVRhYmxlQ29sdW1uKGJveDogRWxlbWVudCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgdmFsdWU6IG51bWJlciwgaW5wdXQ6IEpRdWVyeTtcbiAgICAgICAgICAgIGlucHV0ID0gJChib3gpO1xuICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludChpbnB1dC52YWwoKSwgMTApO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1t2YWx1ZV0gPSBpbnB1dC5wcm9wKCdjaGVja2VkJyk7XG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgdGhpcy5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAgICAgICAgIC8vIFJlc2V0dGluZyBhIGRpc2FibGVkIGNvbHVtbiBtYXkgY2hhbmdlIHRoZSByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzKCk6dm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuXG4gICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV0gPSB0aGlzLmFjdGl2ZUZsYWdzW3ldIHx8IFtdO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFnc1t5XSA9IHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIChncmlkWzBdIHx8IFtdKS5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUNvbEZsYWdzW3hdID0gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gRmxpcCBhbGwgdGhlIGNoZWNrYm94ZXMgb24gaW4gdGhlIGhlYWRlciBjZWxscyBmb3IgdGhlIGRhdGEgY29sdW1uc1xuICAgICAgICAgICAgJCgnI2RhdGFUYWJsZURpdicpLmZpbmQoJ1tuYW1lPWVuYWJsZUNvbHVtbl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAvLyBTYW1lIGZvciB0aGUgY2hlY2tib3hlcyBpbiB0aGUgcm93IGxhYmVsIGNlbGxzXG4gICAgICAgICAgICAkKCcjZGF0YVRhYmxlRGl2JykuZmluZCgnW25hbWU9ZW5hYmxlUm93XScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaW50ZXJwcmV0RGF0YVRhYmxlKCk6dm9pZCB7XG5cbiAgICAgICAgICAgIC8vIFRoaXMgbW9kZSBtZWFucyB3ZSBtYWtlIGEgbmV3IFwic2V0XCIgZm9yIGVhY2ggY2VsbCBpbiB0aGUgdGFibGUsIHJhdGhlciB0aGFuXG4gICAgICAgICAgICAvLyB0aGUgc3RhbmRhcmQgbWV0aG9kIG9mIG1ha2luZyBhIG5ldyBcInNldFwiIGZvciBlYWNoIGNvbHVtbiBpbiB0aGUgdGFibGUuXG4gICAgICAgICAgICB2YXIgc2luZ2xlTW9kZTpib29sZWFuO1xuICAgICAgICAgICAgdmFyIHNpbmdsZTogbnVtYmVyLCBub25TaW5nbGU6IG51bWJlciwgZWFybGllc3ROYW1lOiBudW1iZXI7XG5cbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuICAgICAgICAgICAgdmFyIGdyaWRSb3dNYXJrZXJzID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ3JpZFJvd01hcmtlcnM7XG4gICAgICAgICAgICB2YXIgaWdub3JlRGF0YUdhcHMgPSB0aGlzLnJhd0lucHV0U3RlcC5pZ25vcmVEYXRhR2FwcztcblxuICAgICAgICAgICAgLy8gV2UnbGwgYmUgYWNjdW11bGF0aW5nIHRoZXNlIGZvciBkaXNhbWJpZ3VhdGlvbi5cbiAgICAgICAgICAgIHZhciBzZWVuTGluZU5hbWVzOntbaWQ6c3RyaW5nXTogYm9vbGVhbn0gPSB7fTtcbiAgICAgICAgICAgIHZhciBzZWVuQXNzYXlOYW1lczp7W2lkOnN0cmluZ106IGJvb2xlYW59ID0ge307XG4gICAgICAgICAgICB2YXIgc2Vlbk1lYXN1cmVtZW50TmFtZXM6e1tpZDpzdHJpbmddOiBib29sZWFufSA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5NZXRhZGF0YU5hbWVzOntbaWQ6c3RyaW5nXTogYm9vbGVhbn0gPSB7fTtcblxuICAgICAgICAgICAgLy8gSGVyZSBhcmUgdGhlIGFycmF5cyB3ZSB3aWxsIHVzZSBsYXRlclxuICAgICAgICAgICAgdGhpcy5wYXJzZWRTZXRzID0gW107XG4gICAgICAgICAgICB0aGlzLmdyYXBoU2V0cyA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUxpbmVOYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVBc3NheU5hbWVzID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTWV0YWRhdGFOYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5zZWVuQW55VGltZXN0YW1wcyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBnb3QgcHJlLXByb2Nlc3NlZCBzZXRzIGZyb20gdGhlIHNlcnZlciBhdmFpbGFibGUsIHVzZSB0aG9zZSBpbnN0ZWFkIG9mIGFueVxuICAgICAgICAgICAgLy8gdGFibGUgY29udGVudHMuXG5cbiAgICAgICAgICAgIGlmICh0aGlzLnJhd0lucHV0U3RlcC5wcm9jZXNzZWRTZXRzQXZhaWxhYmxlKSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJhd0lucHV0U3RlcC5wcm9jZXNzZWRTZXRzRnJvbUZpbGUuZm9yRWFjaCgocmF3U2V0LCBjOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNldDogUmF3SW1wb3J0U2V0LCBncmFwaFNldDogR3JhcGhpbmdTZXQsIHVuaXF1ZVRpbWVzOiBudW1iZXJbXSwgdGltZXM6IGFueSwgZm91bmRNZXRhOiBib29sZWFuO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBsbiA9IHJhd1NldC5saW5lX25hbWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhbiA9IHJhd1NldC5hc3NheV9uYW1lO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbW4gPSByYXdTZXQubWVhc3VyZW1lbnRfbmFtZTtcblxuICAgICAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICB0aW1lcyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBmb3VuZE1ldGEgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgcHJvY2VkdXJlIGZvciBBc3NheXMsIE1lYXN1cmVtZW50cywgZXRjIGlzIHRoZSBzYW1lOlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgdmFsdWUgaXMgYmxhbmssIHdlIGNhbid0IGJ1aWxkIGEgdmFsaWQgc2V0LCBzbyBza2lwIHRvIHRoZSBuZXh0IHNldC5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIHZhbHVlIGlzIHZhbGlkIGJ1dCB3ZSBoYXZlbid0IHNlZW4gaXQgYmVmb3JlLCBpbmNyZW1lbnQgYW5kIHN0b3JlIGEgdW5pcXVlbmVzcyBpbmRleC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFsbiAmJiBsbiAhPT0gMCkgeyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhbiAmJiBhbiAhPT0gMCkgeyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFtbiAmJiBtbiAhPT0gMCkgeyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTGluZU5hbWVzW2xuXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VlbkxpbmVOYW1lc1tsbl0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVMaW5lTmFtZXMucHVzaChsbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuQXNzYXlOYW1lc1thbl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5Bc3NheU5hbWVzW2FuXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUFzc2F5TmFtZXMucHVzaChhbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWVhc3VyZW1lbnROYW1lc1ttbl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW21uXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMucHVzaChtbik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVhc3NlbWJsZWREYXRhID0gW107XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU2xpZ2h0bHkgZGlmZmVyZW50IHByb2NlZHVyZSBmb3IgbWV0YWRhdGEsIGJ1dCBzYW1lIGlkZWE6XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHJhd1NldC5tZXRhZGF0YV9ieV9uYW1lKS5mb3JFYWNoKChrZXkpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHZhbHVlID0gcmF3U2V0Lm1ldGFkYXRhX2J5X25hbWVba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1ldGFkYXRhTmFtZXNba2V5XSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZXRhZGF0YU5hbWVzW2tleV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlTWV0YWRhdGFOYW1lcy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZE1ldGEgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgcHJvdmlkZWQgc2V0IG9mIHRpbWUvdmFsdWUgcG9pbnRzXG4gICAgICAgICAgICAgICAgICAgIHJhd1NldC5kYXRhLmZvckVhY2goKHh5OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRpbWUgPSB4eVswXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHh5WzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU29tZXRpbWVzIHBlb3BsZSAtIG9yIEV4Y2VsIGRvY3MgLSBkcm9wIGNvbW1hcyBpbnRvIGxhcmdlIG51bWJlcnMuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdGltZUZsb2F0ID0gcGFyc2VGbG9hdCh0aW1lLnJlcGxhY2UoLywvZywgJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHdlIGNhbid0IGdldCBhIHVzYWJsZSB0aW1lc3RhbXAsIGRpc2NhcmQgdGhpcyBwb2ludC5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc05hTih0aW1lRmxvYXQpKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF2YWx1ZSAmJiA8YW55PnZhbHVlICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgaWdub3JpbmcgZ2Fwcywgc2tpcCBhbnkgdW5kZWZpbmVkL251bGwgdmFsdWVzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYgKGlnbm9yZURhdGFHYXBzKSB7IHJldHVybjsgfSAgICAvLyBOb3RlOiBGb3JjZWQgYWx3YXlzLW9mZiBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQSBudWxsIGlzIG91ciBzdGFuZGFyZCBwbGFjZWhvbGRlciB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGltZXNbdGltZUZsb2F0XSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVzW3RpbWVGbG9hdF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcy5wdXNoKHRpbWVGbG9hdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWVuQW55VGltZXN0YW1wcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcy5zb3J0KChhLCBiKSA9PiBhIC0gYikuZm9yRWFjaCgodGltZTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWFzc2VtYmxlZERhdGEucHVzaChbdGltZSwgdGltZXNbdGltZV1dKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBzYXZlIGlmIHdlIGFjY3VtdWxhdGVkIHNvbWUgZGF0YSBvciBtZXRhZGF0YVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXVuaXF1ZVRpbWVzLmxlbmd0aCAmJiAhZm91bmRNZXRhKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNldCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENvcHkgYWNyb3NzIHRoZSBmaWVsZHMgZnJvbSB0aGUgUmF3SW1wb3J0U2V0IHJlY29yZFxuICAgICAgICAgICAgICAgICAgICAgICAga2luZDogICAgICAgICAgICAgIHJhd1NldC5raW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZV9uYW1lOiAgICAgICAgIHJhd1NldC5saW5lX25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NheV9uYW1lOiAgICAgICAgcmF3U2V0LmFzc2F5X25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudF9uYW1lOiAgcmF3U2V0Lm1lYXN1cmVtZW50X25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXRhZGF0YV9ieV9uYW1lOiAgcmF3U2V0Lm1ldGFkYXRhX2J5X25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiAgICAgICAgICAgICAgcmVhc3NlbWJsZWREYXRhXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFyc2VkU2V0cy5wdXNoKHNldCk7XG5cbiAgICAgICAgICAgICAgICAgICAgZ3JhcGhTZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnbGFiZWwnOiAobG4gPyBsbisnOiAnIDogJycpICsgYW4rJzogJyArIG1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiBtbixcbiAgICAgICAgICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IHJlYXNzZW1ibGVkRGF0YVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhTZXRzLnB1c2goZ3JhcGhTZXQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgd2UncmUgbm90IHVzaW5nIHByZS1wcm9jZXNzZWQgcmVjb3Jkcywgd2UgbmVlZCB0byB1c2UgdGhlIHB1bGxkb3duIHNldHRpbmdzIGluIHRoaXMgc3RlcFxuICAgICAgICAgICAgLy8gKHVzdWFsbHkgc2V0IGJ5IHRoZSB1c2VyKSB0byBkZXRlcm1pbmUgd2hhdCBtb2RlIHdlJ3JlIGluLlxuXG4gICAgICAgICAgICBzaW5nbGUgPSAwO1xuICAgICAgICAgICAgbm9uU2luZ2xlID0gMDtcbiAgICAgICAgICAgIGVhcmxpZXN0TmFtZSA9IG51bGw7XG4gICAgICAgICAgICAvLyBMb29rIGZvciB0aGUgcHJlc2VuY2Ugb2YgXCJzaW5nbGUgbWVhc3VyZW1lbnQgdHlwZVwiIHJvd3MsIGFuZCByb3dzIG9mIGFsbCBvdGhlciBzaW5nbGUtaXRlbSB0eXBlc1xuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChfLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVSb3dGbGFnc1t5XSkge1xuICAgICAgICAgICAgICAgICAgICBwdWxsZG93biA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1t5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHB1bGxkb3duID09PSBUeXBlRW51bS5NZXRhYm9saXRlX05hbWUgfHwgcHVsbGRvd24gPT09IFR5cGVFbnVtLlByb3RlaW5fTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlKys7IC8vIFNpbmdsZSBNZWFzdXJlbWVudCBOYW1lIG9yIFNpbmdsZSBQcm90ZWluIE5hbWVcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uTWV0YWRhdGFfTmFtZSB8fCBwdWxsZG93biA9PT0gVHlwZUVudW0uVGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBub25TaW5nbGUrKztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uQXNzYXlfTGluZV9OYW1lcyAmJiBlYXJsaWVzdE5hbWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVhcmxpZXN0TmFtZSA9IHk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gT25seSB1c2UgdGhpcyBtb2RlIGlmIHRoZSB0YWJsZSBpcyBlbnRpcmVseSBmcmVlIG9mIHNpbmdsZS10aW1lc3RhbXAgYW5kXG4gICAgICAgICAgICAvLyBzaW5nbGUtbWV0YWRhdGEgcm93cywgYW5kIGhhcyBhdCBsZWFzdCBvbmUgXCJzaW5nbGUgbWVhc3VyZW1lbnRcIiByb3csIGFuZCBhdFxuICAgICAgICAgICAgLy8gbGVhc3Qgb25lIFwiQXNzYXkvTGluZSBuYW1lc1wiIHJvdy5cbiAgICAgICAgICAgIC8vIChOb3RlIHRoYXQgcmVxdWlyZW1lbnQgb2YgYW4gXCJBc3NheS9MaW5lIG5hbWVzXCIgcm93IHByZXZlbnRzIHRoaXMgbW9kZSBmcm9tIGJlaW5nXG4gICAgICAgICAgICAvLyBlbmFibGVkIHdoZW4gdGhlIHBhZ2UgaXMgaW4gJ1RyYW5zY3JpcHRvbWljcycgb3IgJ1Byb3Rlb21pY3MnIG1vZGUuKVxuICAgICAgICAgICAgc2luZ2xlTW9kZSA9IChzaW5nbGUgPiAwICYmIG5vblNpbmdsZSA9PT0gMCAmJiBlYXJsaWVzdE5hbWUgIT09IG51bGwpID8gdHJ1ZSA6IGZhbHNlO1xuXG4gICAgICAgICAgICAvLyBBIFwic2V0XCIgZm9yIGV2ZXJ5IGNlbGwgb2YgdGhlIHRhYmxlLCB3aXRoIHRoZSB0aW1lc3RhbXAgdG8gYmUgZGV0ZXJtaW5lZCBsYXRlci5cbiAgICAgICAgICAgIGlmIChzaW5nbGVNb2RlKSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmNvbE9iamVjdHMuZm9yRWFjaCgoXywgYzogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjZWxsVmFsdWU6IHN0cmluZywgc2V0OiBSYXdJbXBvcnRTZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFjdGl2ZUNvbEZsYWdzW2NdKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgICAgICAgICBjZWxsVmFsdWUgPSBncmlkW2VhcmxpZXN0TmFtZV1bY10gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY2VsbFZhbHVlKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiBjZWxsVmFsdWUgYmVmb3JlLCBpbmNyZW1lbnQgYW5kIHN0b3JlIHVuaXF1ZW5lc3MgaW5kZXhcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuQXNzYXlOYW1lc1tjZWxsVmFsdWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWVuQXNzYXlOYW1lc1tjZWxsVmFsdWVdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlQXNzYXlOYW1lcy5wdXNoKGNlbGxWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCByOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBsYWJlbDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5hY3RpdmVSb3dGbGFnc1tyXSB8fCAhdGhpcy5hY3RpdmVGbGFnc1tyXVtjXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHB1bGxkb3duID0gdGhpcy5wdWxsZG93blNldHRpbmdzW3JdO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBncmlkUm93TWFya2Vyc1tyXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gcm93W2NdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwdWxsZG93biB8fCAhbGFiZWwgfHwgIXZhbHVlKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbV9uYW1lOnN0cmluZyA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLk1ldGFib2xpdGVfTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1lYXN1cmVtZW50TmFtZXNbbGFiZWxdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW2xhYmVsXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbV9uYW1lID0gbGFiZWw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSBUeXBlRW51bS5Qcm90ZWluX05hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtX25hbWUgPSBsYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgYXJlbid0IG9uIGEgcm93IHRoYXQncyBsYWJlbGVkIGFzIGVpdGhlciBhIG1ldGFib2xpdGUgdmFseWUgb3IgYSBwcm90ZWluIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJldHVybiB3aXRob3V0IG1ha2luZyBhIHNldC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHNldCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBraW5kOiAgICAgICAgICAgICAgdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lX25hbWU6ICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3NheV9uYW1lOiAgICAgICAgY2VsbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50X25hbWU6ICBtX25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGFfYnlfbmFtZTogIHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6ICAgICAgICAgICAgICBbW251bGwsIHZhbHVlXV1cbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcnNlZFNldHMucHVzaChzZXQpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRoZSBzdGFuZGFyZCBtZXRob2Q6IE1ha2UgYSBcInNldFwiIGZvciBlYWNoIGNvbHVtbiBvZiB0aGUgdGFibGVcblxuICAgICAgICAgICAgdGhpcy5jb2xPYmplY3RzLmZvckVhY2goKF8sIGM6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzZXQ6IFJhd0ltcG9ydFNldCwgZ3JhcGhTZXQ6IEdyYXBoaW5nU2V0LCB1bmlxdWVUaW1lczogbnVtYmVyW10sIHRpbWVzOiBhbnksIGZvdW5kTWV0YTogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICAvLyBTa2lwIGl0IGlmIHRoZSB3aG9sZSBjb2x1bW4gaXMgZGVhY3RpdmF0ZWRcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlQ29sRmxhZ3NbY10pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciByZWFzc2VtYmxlZERhdGEgPSBbXTsgICAgLy8gV2UnbGwgZmlsbCB0aGlzIG91dCBhcyB3ZSBnb1xuXG4gICAgICAgICAgICAgICAgc2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAgICAgICAgICAgICAgdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgbGluZV9uYW1lOiAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGFzc2F5X25hbWU6ICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudF9uYW1lOiAgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGFfYnlfbmFtZTogIHt9LFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiAgICAgICAgICAgICAgcmVhc3NlbWJsZWREYXRhLFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcyA9IFtdO1xuICAgICAgICAgICAgICAgIHRpbWVzID0ge307XG4gICAgICAgICAgICAgICAgZm91bmRNZXRhID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCByOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlUm93RmxhZ3Nbcl0gfHwgIXRoaXMuYWN0aXZlRmxhZ3Nbcl1bY10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwdWxsZG93biA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1tyXTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBncmlkUm93TWFya2Vyc1tyXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSByb3dbY10gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcHVsbGRvd24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uUlBLTV9WYWx1ZXMpIHsgIC8vIFRyYW5zY3JpcHRvbWljczogUlBLTSB2YWx1ZXNcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWFzc2VtYmxlZERhdGEgPSBbW251bGwsIHZhbHVlXV07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLkdlbmVfTmFtZXMpIHsgIC8vIFRyYW5zY3JpcHRvbWljczogR2VuZSBuYW1lc1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50X25hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uVGltZXN0YW1wKSB7ICAgLy8gVGltZXN0YW1wc1xuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBsYWJlbC5yZXBsYWNlKC8sL2csICcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcCA9IHBhcnNlRmxvYXQobGFiZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTih0aW1lc3RhbXApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSdyZSBpZ25vcmluZyBnYXBzLCBza2lwIG91dCBvbiByZWNvcmRpbmcgdGhpcyB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaWdub3JlRGF0YUdhcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBhY3R1YWxseSBwcmVmZXIgbnVsbCBoZXJlLCB0byBpbmRpY2F0ZSBhIHBsYWNlaG9sZGVyIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aW1lc1t0aW1lc3RhbXBdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVzW3RpbWVzdGFtcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5pcXVlVGltZXMucHVzaCh0aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNlZW5BbnlUaW1lc3RhbXBzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobGFiZWwgPT09ICcnIHx8IHZhbHVlID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm93IHRoYXQgd2UndmUgZGVhbHQgd2l0aCB0aW1lc3RhbXBzLCB3ZSBwcm9jZWVkIG9uIHRvIG90aGVyIGRhdGEgdHlwZXMuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBbGwgdGhlIG90aGVyIGRhdGEgdHlwZXMgZG8gbm90IGFjY2VwdCBhIGJsYW5rIHZhbHVlLCBzbyB3ZSB3ZWVkIHRoZW0gb3V0IG5vdy5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uQXNzYXlfTGluZV9OYW1lcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgaGF2ZW4ndCBzZWVuIHZhbHVlIGJlZm9yZSwgaW5jcmVtZW50IGFuZCBzdG9yZSB1bmlxdWVuZXNzIGluZGV4XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5Bc3NheU5hbWVzW3ZhbHVlXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5Bc3NheU5hbWVzW3ZhbHVlXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVBc3NheU5hbWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0LmFzc2F5X25hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gVHlwZUVudW0uTWV0YWJvbGl0ZV9OYW1lcykgeyAgIC8vIE1ldGFib2xpdGUgTmFtZXNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiB2YWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWVhc3VyZW1lbnROYW1lc1t2YWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWVhc3VyZW1lbnROYW1lc1t2YWx1ZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudF9uYW1lID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IFR5cGVFbnVtLk1ldGFkYXRhX05hbWUpIHsgICAvLyBNZXRhZGF0YVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWV0YWRhdGFOYW1lc1tsYWJlbF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWV0YWRhdGFOYW1lc1tsYWJlbF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlTWV0YWRhdGFOYW1lcy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZXRhZGF0YV9ieV9uYW1lW2xhYmVsXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmRNZXRhID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHVuaXF1ZVRpbWVzLnNvcnQoKGEsIGIpID0+IGEgLSBiKS5mb3JFYWNoKCh0aW1lOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVhc3NlbWJsZWREYXRhLnB1c2goW3RpbWUsIHRpbWVzW3RpbWVdXSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gb25seSBzYXZlIGlmIGFjY3VtdWxhdGVkIHNvbWUgZGF0YSBvciBtZXRhZGF0YVxuICAgICAgICAgICAgICAgIGlmICghdW5pcXVlVGltZXMubGVuZ3RoICYmICFmb3VuZE1ldGEgJiYgIXJlYXNzZW1ibGVkRGF0YVswXSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5wYXJzZWRTZXRzLnB1c2goc2V0KTtcblxuICAgICAgICAgICAgICAgIGdyYXBoU2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICAnbGFiZWwnOiAnQ29sdW1uICcgKyBjLFxuICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdDb2x1bW4gJyArIGMsXG4gICAgICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzogcmVhc3NlbWJsZWREYXRhXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhTZXRzLnB1c2goZ3JhcGhTZXQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGhpZ2hsaWdodGVyRihlOiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgICAgICAgICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgICAgICAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgICAgICAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICAgICAgICAgIGlmIChjZWxsLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHggPSBwYXJzZUludChjZWxsLmF0dHIoJ3gnKSwgMTApO1xuICAgICAgICAgICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICAgICAgICAgIGlmICh4KSB7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcy5jb2xPYmplY3RzW3ggLSAxXSkudG9nZ2xlQ2xhc3MoJ2hvdmVyTGluZXMnLCBlLnR5cGUgPT09ICdtb3VzZW92ZXInKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHkpIHtcbiAgICAgICAgICAgICAgICAgICAgY2VsbC5jbG9zZXN0KCd0cicpLnRvZ2dsZUNsYXNzKCdob3ZlckxpbmVzJywgZS50eXBlID09PSAnbW91c2VvdmVyJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBzaW5nbGVWYWx1ZURpc2FibGVyRihlOiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgICAgICAgICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgICAgICAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgICAgICAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICAgICAgICAgIGlmICghY2VsbC5sZW5ndGgpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgICB4ID0gcGFyc2VJbnQoY2VsbC5hdHRyKCd4JyksIDEwKTtcbiAgICAgICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICAgICAgaWYgKCF4IHx8ICF5IHx8IHggPCAxIHx8IHkgPCAxKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgLS14O1xuICAgICAgICAgICAgLS15O1xuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzW3ldW3hdID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0gPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICAgICAgICAgIHRoaXMucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICB9XG5cblxuICAgICAgICBxdWV1ZUdyYXBoUmVtYWtlKCk6dm9pZCB7XG4gICAgICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICAgICAgICAgIC8vIFRoaXMgd2F5IHdlJ3JlIG5vdCBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuXG4gICAgICAgICAgICAvLyB0aGV5IGFyZSBtYWtpbmcgZmFzdCBlZGl0cy5cbiAgICAgICAgICAgIGlmICh0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdyYXBoRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQodGhpcy5yZW1ha2VHcmFwaEFyZWEuYmluZCh0aGlzKSwgNzAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVtYWtlR3JhcGhBcmVhKCk6dm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBtb2RlID0gdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZTtcblxuICAgICAgICAgICAgdGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEID0gMDtcbiAgICAgICAgICAgIGlmICghRUREQVRER3JhcGhpbmcgfHwgIXRoaXMuZ3JhcGhFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRUREQVRER3JhcGhpbmcuY2xlYXJBbGxTZXRzKCk7XG4gICAgICAgICAgICB2YXIgc2V0cyA9IHRoaXMuZ3JhcGhTZXRzO1xuICAgICAgICAgICAgLy8gSWYgd2UncmUgbm90IGluIGVpdGhlciBvZiB0aGVzZSBtb2RlcywgZHJhd2luZyBhIGdyYXBoIGlzIG5vbnNlbnNpY2FsLlxuICAgICAgICAgICAgaWYgKG1vZGUgPT09IFwic3RkXCIgfHwgbW9kZSA9PT0gJ2Jpb2xlY3RvcicpIHtcbiAgICAgICAgICAgICAgICBzZXRzLmZvckVhY2goKHNldCkgPT4gRUREQVRER3JhcGhpbmcuYWRkTmV3U2V0KHNldCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRUREQVRER3JhcGhpbmcuZHJhd1NldHMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBpbnRlcmZhY2UgQXV0b0NhY2hlIHtcbiAgICAgICAgY29tcDogYW55LFxuICAgICAgICBtZXRhOiBhbnksXG4gICAgICAgIHVuaXQ6IGFueSxcbiAgICAgICAgbWV0YWJvbGl0ZTogYW55XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGV2ZXJ5dGhpbmcgaW4gdGhlIFwiU3RlcCA0XCIgYm94IHRoYXQgeW91IHNlZSBvbiB0aGUgZGF0YSBpbXBvcnQgcGFnZS5cbiAgICBleHBvcnQgY2xhc3MgVHlwZURpc2FtYmlndWF0aW9uU3RlcCB7XG5cbiAgICAgICAgaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDogSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDtcblxuICAgICAgICAvLyBUaGVzZSBvYmplY3RzIGhvbGQgc3RyaW5nIGtleXMgdGhhdCBjb3JyZXNwb25kIHRvIHVuaXF1ZSBuYW1lcyBmb3VuZCBkdXJpbmcgcGFyc2luZy5cbiAgICAgICAgLy8gVGhlIHN0cmluZyBrZXlzIHBvaW50IHRvIGV4aXN0aW5nIGF1dG9jb21wbGV0ZSBvYmplY3RzIGNyZWF0ZWQgc3BlY2lmaWNhbGx5IGZvclxuICAgICAgICAvLyB0aG9zZSBzdHJpbmdzLiAgQW55IHNlbGVjdGlvbnMgdGhlIHVzZXIgaGFzIGFscmVhZHkgc2V0IHdpbGwgYmUgcHJlc2VydmVkLFxuICAgICAgICAvLyBldmVuIGFzIHRoZSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGlzIGRlc3Ryb3llZCBhbmQgcmVtYWRlLlxuXG4gICAgICAgIHByb3RvY29sQ3VycmVudGx5RGlzcGxheWVkOiBudW1iZXI7XG4gICAgICAgIC8vIEZvciBkaXNhbWJ1Z3VhdGluZyBMaW5lc1xuICAgICAgICBsaW5lT2JqU2V0czogYW55O1xuICAgICAgICBjdXJyZW50bHlWaXNpYmxlTGluZU9ialNldHM6IGFueVtdO1xuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgQXNzYXlzIChyZWFsbHkgQXNzYXkvTGluZSBjb21iaW5hdGlvbnMpXG4gICAgICAgIGFzc2F5T2JqU2V0czogYW55O1xuICAgICAgICBjdXJyZW50bHlWaXNpYmxlQXNzYXlPYmpTZXRzOiBhbnlbXTtcbiAgICAgICAgLy8gRm9yIGRpc2FtYnVndWF0aW5nIG1lYXN1cmVtZW50IHR5cGVzXG4gICAgICAgIG1lYXN1cmVtZW50T2JqU2V0czogYW55O1xuICAgICAgICBjdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzOiBhbnlbXTtcbiAgICAgICAgLy8gRm9yIGRpc2FtYnVndWF0aW5nIG1ldGFkYXRhXG4gICAgICAgIG1ldGFkYXRhT2JqU2V0czogYW55O1xuICAgICAgICAvLyBUbyBnaXZlIHVuaXF1ZSBJRCB2YWx1ZXMgdG8gZWFjaCBhdXRvY29tcGxldGUgZW50aXR5IHdlIGNyZWF0ZVxuICAgICAgICBhdXRvQ29tcFVJRDogbnVtYmVyO1xuXG4gICAgICAgIGF1dG9DYWNoZTogQXV0b0NhY2hlO1xuXG4gICAgICAgIHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXA7XG4gICAgICAgIG5leHRTdGVwQ2FsbGJhY2s6IGFueTtcblxuXG4gICAgICAgIGNvbnN0cnVjdG9yKHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXAsIGlkZW50aWZ5U3RydWN0dXJlc1N0ZXA6IElkZW50aWZ5U3RydWN0dXJlc1N0ZXAsIG5leHRTdGVwQ2FsbGJhY2s6IGFueSkge1xuXG4gICAgICAgICAgICB0aGlzLmxpbmVPYmpTZXRzID0ge307XG4gICAgICAgICAgICB0aGlzLmFzc2F5T2JqU2V0cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTGluZU9ialNldHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZUFzc2F5T2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudE9ialNldHMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhZGF0YU9ialNldHMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuYXV0b0NvbXBVSUQgPSAwO1xuICAgICAgICAgICAgdGhpcy5wcm90b2NvbEN1cnJlbnRseURpc3BsYXllZCA9IDA7XG5cbiAgICAgICAgICAgIHRoaXMuYXV0b0NhY2hlID0ge1xuICAgICAgICAgICAgICAgIGNvbXA6IHt9LFxuICAgICAgICAgICAgICAgIG1ldGE6IHt9LFxuICAgICAgICAgICAgICAgIHVuaXQ6IHt9LFxuICAgICAgICAgICAgICAgIG1ldGFib2xpdGU6IHt9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAgPSBzZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICAgICAgdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwID0gaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjayA9IG5leHRTdGVwQ2FsbGJhY2s7XG5cbiAgICAgICAgICAgIHZhciByZURvU3RlcE9uQ2hhbmdlID0gWycjbWFzdGVyQXNzYXknLCAnI21hc3RlckxpbmUnLCAnI21hc3Rlck1Db21wJywgJyNtYXN0ZXJNVHlwZScsICcjbWFzdGVyTVVuaXRzJ107XG4gICAgICAgICAgICAkKHJlRG9TdGVwT25DaGFuZ2Uuam9pbignLCcpKS5vbignY2hhbmdlJywgdGhpcy5jaGFuZ2VkQW55TWFzdGVyUHVsbGRvd24uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgICAgICQoJyNyZXNldHN0ZXA0Jykub24oJ2NsaWNrJywgdGhpcy5yZXNldERpc2FtYmlndWF0aW9uRmllbGRzLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAvLyBlbmFibGUgYXV0b2NvbXBsZXRlIG9uIHN0YXRpY2FsbHkgZGVmaW5lZCBmaWVsZHNcbiAgICAgICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSgnI21hc3Rlck1Db21wJywgJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnKTtcbiAgICAgICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSgnI21hc3Rlck1UeXBlJywgJ0dlbmVyaWNPck1ldGFib2xpdGUnLCBFREREYXRhLk1ldGFib2xpdGVUeXBlcyB8fCB7fSk7XG4gICAgICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoJyNtYXN0ZXJNVW5pdHMnLCAnTWVhc3VyZW1lbnRVbml0Jyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHByZXZpb3VzU3RlcENoYW5nZWQoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgYXNzYXlJbjogSlF1ZXJ5O1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRBc3NheXM6IG51bWJlcltdO1xuICAgICAgICAgICAgdmFyIG1hc3RlclAgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAubWFzdGVyUHJvdG9jb2w7ICAgIC8vIFNob3V0LW91dHMgdG8gYSBtaWQtZ3JhZGUgcmFwcGVyXG4gICAgICAgICAgICBpZiAodGhpcy5wcm90b2NvbEN1cnJlbnRseURpc3BsYXllZCAhPSBtYXN0ZXJQKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm90b2NvbEN1cnJlbnRseURpc3BsYXllZCA9IG1hc3RlclA7XG4gICAgICAgICAgICAgICAgLy8gV2UgZGVhbCB3aXRoIHJlY3JlYXRpbmcgdGhpcyBwdWxsZG93biBoZXJlLCBpbnN0ZWFkIG9mIGluIHJlbWFrZUFzc2F5U2VjdGlvbigpLFxuICAgICAgICAgICAgICAgIC8vIGJlY2F1c2UgcmVtYWtlQXNzYXlTZWN0aW9uKCkgaXMgY2FsbGVkIGJ5IHJlY29uZmlndXJlKCksIHdoaWNoIGlzIGNhbGxlZFxuICAgICAgICAgICAgICAgIC8vIHdoZW4gb3RoZXIgVUkgaW4gdGhpcyBzdGVwIGNoYW5nZXMuICBUaGlzIHB1bGxkb3duIGlzIE5PVCBhZmZlY3RlZCBieSBjaGFuZ2VzIHRvXG4gICAgICAgICAgICAgICAgLy8gdGhlIG90aGVyIFVJLCBzbyBpdCB3b3VsZCBiZSBwb2ludGxlc3MgdG8gcmVtYWtlIGl0IGluIHJlc3BvbnNlIHRvIHRoZW0uXG4gICAgICAgICAgICAgICAgYXNzYXlJbiA9ICQoJyNtYXN0ZXJBc3NheScpLmVtcHR5KCk7XG4gICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KCcoQ3JlYXRlIE5ldyknKS5hcHBlbmRUbyhhc3NheUluKS52YWwoJ25ldycpLnByb3AoJ3NlbGVjdGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgY3VycmVudEFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1ttYXN0ZXJQXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBjdXJyZW50QXNzYXlzLmZvckVhY2goKGlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS5hcHBlbmRUbyhhc3NheUluKS52YWwoJycgKyBpZCkudGV4dChbXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gQWx3YXlzIHJldmVhbCB0aGlzLCBzaW5jZSB0aGUgZGVmYXVsdCBmb3IgdGhlIEFzc2F5IHB1bGxkb3duIGlzIGFsd2F5cyAnbmV3Jy5cbiAgICAgICAgICAgICAgICAkKCcjbWFzdGVyTGluZVNwYW4nKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlY29uZmlndXJlKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgU3RlcCA0IHRhYmxlczogIFNldHMgb2Ygcm93cywgb25lIGZvciBlYWNoIHktYXhpcyBjb2x1bW4gb2YgdmFsdWVzLFxuICAgICAgICAvLyB3aGVyZSB0aGUgdXNlciBjYW4gZmlsbCBvdXQgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiBmb3IgdGhlIHBhc3RlZCB0YWJsZS5cbiAgICAgICAgcmVjb25maWd1cmUoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG5cbiAgICAgICAgICAgIHZhciBwYXJzZWRTZXRzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnBhcnNlZFNldHM7XG4gICAgICAgICAgICB2YXIgc2VlbkFueVRpbWVzdGFtcHMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAuc2VlbkFueVRpbWVzdGFtcHM7XG4gICAgICAgICAgICAvLyBIaWRlIGFsbCB0aGUgc3Vic2VjdGlvbnMgYnkgZGVmYXVsdFxuICAgICAgICAgICAgJCgnI21hc3RlclRpbWVzdGFtcERpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVMaW5lc1NlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyTGluZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVBc3NheXNTZWN0aW9uJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI21hc3RlckFzc2F5TGluZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNTZWN0aW9uJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI21hc3Rlck1UeXBlRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICAgICAgLy8gSWYgbm8gc2V0cyB0byBzaG93LCBsZWF2ZSB0aGUgYXJlYSBibGFuayBhbmQgc2hvdyB0aGUgJ2VudGVyIHNvbWUgZGF0YSEnIGJhbm5lclxuICAgICAgICAgICAgaWYgKHBhcnNlZFNldHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgJCgnI2VtcHR5RGlzYW1iaWd1YXRpb25MYWJlbCcpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICQoJyNlbXB0eURpc2FtYmlndWF0aW9uTGFiZWwnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAvLyBJZiBwYXJzZWQgZGF0YSBleGlzdHMsIGJ1dCB3ZSBoYXZlbid0IHNlZW4gYSBzaW5nbGUgdGltZXN0YW1wLCBzaG93IHRoZSBcIm1hc3RlciB0aW1lc3RhbXBcIiBVSS5cbiAgICAgICAgICAgICQoJyNtYXN0ZXJUaW1lc3RhbXBEaXYnKS50b2dnbGVDbGFzcygnb2ZmJywgc2VlbkFueVRpbWVzdGFtcHMpO1xuICAgICAgICAgICAgLy8gQ2FsbCBzdWJyb3V0aW5lcyBmb3IgZWFjaCBvZiB0aGUgbWFqb3Igc2VjdGlvbnNcbiAgICAgICAgICAgIGlmIChtb2RlID09PSBcImJpb2xlY3RvclwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1ha2VMaW5lU2VjdGlvbigpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbWFrZUFzc2F5U2VjdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW1ha2VNZWFzdXJlbWVudFNlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMucmVtYWtlTWV0YWRhdGFTZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVE9ETzogVGhpcyBmdW5jdGlvbiBzaG91bGQgcmVzZXQgYWxsIHRoZSBkaXNhbWJpZ3VhdGlvbiBmaWVsZHMgdG8gdGhlIHZhbHVlc1xuICAgICAgICAvLyB0aGF0IHdlcmUgYXV0by1kZXRlY3RlZCBpbiB0aGUgbGFzdCByZWZyZXNoIG9mIHRoZSBvYmplY3QuXG4gICAgICAgIHJlc2V0RGlzYW1iaWd1YXRpb25GaWVsZHMoKTogdm9pZCB7XG4gICAgICAgICAgICAvLyBHZXQgdG8gd29yayEhXG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIElmIHRoZSBwcmV2aW91cyBzdGVwIGZvdW5kIExpbmUgbmFtZXMgdGhhdCBuZWVkIHJlc29sdmluZywgYW5kIHRoZSBpbnRlcnByZXRhdGlvbiBtb2RlIGluIFN0ZXAgMVxuICAgICAgICAvLyB3YXJyYW50cyByZXNvbHZpbmcgTGluZXMgaW5kZXBlbmRlbnQgb2YgQXNzYXlzLCB3ZSBjcmVhdGUgdGhpcyBzZWN0aW9uLlxuICAgICAgICAvLyBUaGUgcG9pbnQgaXMgdGhhdCBpZiB3ZSBjb25uZWN0IHVucmVzb2x2ZWQgTGluZSBzdHJpbmdzIG9uIHRoZWlyIG93biwgdGhlIHVucmVzb2x2ZWQgQXNzYXkgc3RyaW5nc1xuICAgICAgICAvLyBjYW4gYmUgdXNlZCB0byBjcmVhdGUgbXVsdGlwbGUgbmV3IEFzc2F5cyB3aXRoIGlkZW50aWNhbCBuYW1lcyB1bmRlciBhIHJhbmdlIG9mIExpbmVzLlxuICAgICAgICAvLyBUaGlzIG1lYW5zIHVzZXJzIGNhbiBjcmVhdGUgYSBtYXRyaXggb2YgTGluZS9Bc3NheSBjb21iaW5hdGlvbnMsIHJhdGhlciB0aGFuIGEgb25lLWRpbWVuc2lvbmFsXG4gICAgICAgIC8vIHJlc29sdXRpb24gd2hlcmUgdW5pcXVlIEFzc2F5IG5hbWVzIG11c3QgYWx3YXlzIHBvaW50IHRvIG9uZSB1bmlxdWUgQXNzYXkgcmVjb3JkLlxuICAgICAgICByZW1ha2VMaW5lU2VjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgYm9keTogSFRNTFRhYmxlRWxlbWVudDtcbiAgICAgICAgICAgIHZhciB1bmlxdWVMaW5lTmFtZXMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAudW5pcXVlTGluZU5hbWVzO1xuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVMaW5lT2JqU2V0cy5mb3JFYWNoKChkaXNhbTphbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBkaXNhbS5yb3dFbGVtZW50SlEuZGV0YWNoKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVMaW5lc1RhYmxlJykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAgIGlmICh1bmlxdWVMaW5lTmFtZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgJCgnI21hc3RlckxpbmVEaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVMaW5lT2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgdmFyIHQgPSB0aGlzO1xuICAgICAgICAgICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGFibGU+JylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVMaW5lc1RhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlTGluZXNTZWN0aW9uJykucmVtb3ZlQ2xhc3MoJ29mZicpKVxuICAgICAgICAgICAgICAgIC5vbignY2hhbmdlJywgJ3NlbGVjdCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0LnVzZXJDaGFuZ2VkTGluZURpc2FtKGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgfSlbMF07XG4gICAgICAgICAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAgICAgICAgIHVuaXF1ZUxpbmVOYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBkaXNhbTogYW55LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsIGRlZmF1bHRTZWw6IGFueSwgY2VsbDogSlF1ZXJ5LCBzZWxlY3Q6IEpRdWVyeTtcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMubGluZU9ialNldHNbbmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKCFkaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICBkaXNhbSA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0U2VsID0gdGhpcy5kaXNhbWJpZ3VhdGVBbkFzc2F5T3JMaW5lKG5hbWUsIGkpO1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCBtYWtlIGEgdGFibGUgcm93LCBhbmQgc2F2ZSBhIHJlZmVyZW5jZSB0byBpdFxuICAgICAgICAgICAgICAgICAgICByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD5ib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgICAgICBkaXNhbS5yb3dFbGVtZW50SlEgPSAkKHJvdyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5leHQsIGFkZCBhIHRhYmxlIGNlbGwgd2l0aCB0aGUgc3RyaW5nIHdlIGFyZSBkaXNhbWJpZ3VhdGluZ1xuICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8ocm93Lmluc2VydENlbGwoKSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdyBidWlsZCBhbm90aGVyIHRhYmxlIGNlbGwgdGhhdCB3aWxsIGNvbnRhaW4gdGhlIHB1bGxkb3duc1xuICAgICAgICAgICAgICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5jc3MoJ3RleHQtYWxpZ24nLCAnbGVmdCcpO1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3QgPSAkKCc8c2VsZWN0PicpLmFwcGVuZFRvKGNlbGwpXG4gICAgICAgICAgICAgICAgICAgICAgICAuZGF0YSh7ICdzZXRCeVVzZXInOiBmYWxzZSB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ25hbWUnLCAnZGlzYW1MaW5lJyArIGkpO1xuICAgICAgICAgICAgICAgICAgICBkaXNhbS5zZWxlY3RMaW5lSlFFbGVtZW50ID0gc2VsZWN0O1xuICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKHNlbGVjdCkudmFsKCduZXcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgIWRlZmF1bHRTZWwubGluZUlEKTtcbiAgICAgICAgICAgICAgICAgICAgKEFURGF0YS5leGlzdGluZ0xpbmVzIHx8IFtdKS5mb3JFYWNoKChsaW5lOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChsaW5lLm4pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKHNlbGVjdCkudmFsKGxpbmUuaWQudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBkZWZhdWx0U2VsLmxpbmVJRCA9PT0gbGluZS5pZCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVPYmpTZXRzW25hbWVdID0gZGlzYW07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRpc2FtLnNlbGVjdExpbmVKUUVsZW1lbnQuZGF0YSh7ICd2aXNpYmxlSW5kZXgnOiBpIH0pO1xuICAgICAgICAgICAgICAgIGRpc2FtLnJvd0VsZW1lbnRKUS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVMaW5lT2JqU2V0cy5wdXNoKGRpc2FtKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgcHJldmlvdXMgc3RlcCBmb3VuZCBMaW5lIG9yIEFzc2F5IG5hbWVzIHRoYXQgbmVlZCByZXNvbHZpbmcsIHB1dCB0b2dldGhlciBhIGRpc2FtYmlndWF0aW9uIHNlY3Rpb25cbiAgICAgICAgLy8gZm9yIEFzc2F5cy9MaW5lcy5cbiAgICAgICAgLy8gS2VlcCBhIHNlcGFyYXRlIHNldCBvZiBjb3JyZWxhdGlvbnMgYmV0d2VlbiBzdHJpbmdzIGFuZCBwdWxsZG93bnMgZm9yIGVhY2ggUHJvdG9jb2wsXG4gICAgICAgIC8vIHNpbmNlIHRoZSBzYW1lIHN0cmluZyBjYW4gbWF0Y2ggZGlmZmVyZW50IEFzc2F5cywgYW5kIHRoZSBwdWxsZG93bnMgd2lsbCBoYXZlIGRpZmZlcmVudCBjb250ZW50LCBpbiBlYWNoIFByb3RvY29sLlxuICAgICAgICAvLyBJZiB0aGUgcHJldmlvdXMgc3RlcCBkaWRuJ3QgZmluZCBhbnkgTGluZSBvciBBc3NheSBuYW1lcyB0aGF0IG5lZWQgcmVzb2x2aW5nLFxuICAgICAgICAvLyByZXZlYWwgdGhlIHB1bGxkb3ducyBmb3Igc2VsZWN0aW5nIGEgbWFzdGVyIExpbmUvQXNzYXksIGxlYXZpbmcgdGhlIHRhYmxlIGVtcHR5LCBhbmQgcmV0dXJuLlxuICAgICAgICByZW1ha2VBc3NheVNlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQ7XG4gICAgICAgICAgICB2YXIgdW5pcXVlQXNzYXlOYW1lcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC51bmlxdWVBc3NheU5hbWVzO1xuICAgICAgICAgICAgdmFyIG1hc3RlclAgPSB0aGlzLnByb3RvY29sQ3VycmVudGx5RGlzcGxheWVkO1xuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVBc3NheU9ialNldHMuZm9yRWFjaCgoZGlzYW06YW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGlzYW0ucm93RWxlbWVudEpRLmRldGFjaCgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVBc3NheXNUYWJsZScpLnJlbW92ZSgpO1xuXG4gICAgICAgICAgICB0aGlzLmFzc2F5T2JqU2V0c1ttYXN0ZXJQXSA9IHRoaXMuYXNzYXlPYmpTZXRzW21hc3RlclBdIHx8IHt9O1xuXG4gICAgICAgICAgICBpZiAodW5pcXVlQXNzYXlOYW1lcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAkKCcjbWFzdGVyQXNzYXlMaW5lRGl2JykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlPYmpTZXRzID0gW107XG4gICAgICAgICAgICB2YXIgdCA9IHRoaXM7XG4gICAgICAgICAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0YWJsZT4nKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2Rpc2FtYmlndWF0ZUFzc2F5c1RhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlQXNzYXlzU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgICAgICAgICAub24oJ2NoYW5nZScsICdzZWxlY3QnLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdC51c2VyQ2hhbmdlZEFzc2F5RGlzYW0oZXYudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9KVswXTtcbiAgICAgICAgICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgICAgICAgICAgdW5pcXVlQXNzYXlOYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBkaXNhbTogYW55LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsIGRlZmF1bHRTZWw6IGFueSwgY2VsbDogSlF1ZXJ5LCBhU2VsZWN0OiBKUXVlcnksIGxTZWxlY3Q6IEpRdWVyeTtcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMuYXNzYXlPYmpTZXRzW21hc3RlclBdW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmICghZGlzYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0gPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdFNlbCA9IHRoaXMuZGlzYW1iaWd1YXRlQW5Bc3NheU9yTGluZShuYW1lLCBpKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmlyc3QgbWFrZSBhIHRhYmxlIHJvdywgYW5kIHNhdmUgYSByZWZlcmVuY2UgdG8gaXRcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+Ym9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0ucm93RWxlbWVudEpRID0gJChyb3cpO1xuICAgICAgICAgICAgICAgICAgICAvLyBOZXh0LCBhZGQgYSB0YWJsZSBjZWxsIHdpdGggdGhlIHN0cmluZyB3ZSBhcmUgZGlzYW1iaWd1YXRpbmdcbiAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KG5hbWUpLmFwcGVuZFRvKHJvdy5pbnNlcnRDZWxsKCkpO1xuICAgICAgICAgICAgICAgICAgICAvLyBOb3cgYnVpbGQgYW5vdGhlciB0YWJsZSBjZWxsIHRoYXQgd2lsbCBjb250YWluIHRoZSBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuY3NzKCd0ZXh0LWFsaWduJywgJ2xlZnQnKTtcbiAgICAgICAgICAgICAgICAgICAgYVNlbGVjdCA9ICQoJzxzZWxlY3Q+JykuYXBwZW5kVG8oY2VsbClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5kYXRhKHsgJ3NldEJ5VXNlcic6IGZhbHNlIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignbmFtZScsICdkaXNhbUFzc2F5JyArIGkpO1xuICAgICAgICAgICAgICAgICAgICBkaXNhbS5zZWxlY3RBc3NheUpRRWxlbWVudCA9IGFTZWxlY3Q7XG4gICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dCgnKENyZWF0ZSBOZXcpJykuYXBwZW5kVG8oYVNlbGVjdCkudmFsKCduYW1lZF9vcl9uZXcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgIWRlZmF1bHRTZWwuYXNzYXlJRCk7XG4gICAgICAgICAgICAgICAgICAgIChBVERhdGEuZXhpc3RpbmdBc3NheXNbbWFzdGVyUF0gfHwgW10pLmZvckVhY2goKGlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhc3NheTogQXNzYXlSZWNvcmQsIGxpbmU6IExpbmVSZWNvcmQsIHByb3RvY29sOiBhbnk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW2lkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoW2xpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhhU2VsZWN0KS52YWwoaWQudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBkZWZhdWx0U2VsLmFzc2F5SUQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGEgc3BhbiB0byBjb250YWluIHRoZSB0ZXh0IGxhYmVsIGZvciB0aGUgTGluZSBwdWxsZG93biwgYW5kIHRoZSBwdWxsZG93biBpdHNlbGZcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9ICQoJzxzcGFuPicpLnRleHQoJ2ZvciBMaW5lOicpLnRvZ2dsZUNsYXNzKCdvZmYnLCAhIWRlZmF1bHRTZWwuYXNzYXlJRClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICAgICAgbFNlbGVjdCA9ICQoJzxzZWxlY3Q+JykuYXBwZW5kVG8oY2VsbCkuZGF0YSgnc2V0QnlVc2VyJywgZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignbmFtZScsICdkaXNhbUxpbmUnICsgaSk7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtLnNlbGVjdExpbmVKUUVsZW1lbnQgPSBsU2VsZWN0O1xuICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKGxTZWxlY3QpLnZhbCgnbmV3JylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsICFkZWZhdWx0U2VsLmxpbmVJRCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFURGF0YS5leGlzdGluZ0xpbmVzIGlzIG9mIHR5cGUge2lkOiBudW1iZXI7IG46IHN0cmluZzt9W11cbiAgICAgICAgICAgICAgICAgICAgKEFURGF0YS5leGlzdGluZ0xpbmVzIHx8IFtdKS5mb3JFYWNoKChsaW5lOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChsaW5lLm4pLmFwcGVuZFRvKGxTZWxlY3QpLnZhbChsaW5lLmlkLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgZGVmYXVsdFNlbC5saW5lSUQgPT09IGxpbmUuaWQpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheU9ialNldHNbbWFzdGVyUF1bbmFtZV0gPSBkaXNhbTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGlzYW0uc2VsZWN0QXNzYXlKUUVsZW1lbnQuZGF0YSh7ICd2aXNpYmxlSW5kZXgnOiBpIH0pO1xuICAgICAgICAgICAgICAgIGRpc2FtLnJvd0VsZW1lbnRKUS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVBc3NheU9ialNldHMucHVzaChkaXNhbSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVtYWtlTWVhc3VyZW1lbnRTZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudDtcblxuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgdmFyIHVuaXF1ZU1lYXN1cmVtZW50TmFtZXMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAudW5pcXVlTWVhc3VyZW1lbnROYW1lcztcbiAgICAgICAgICAgIHZhciBzZWVuQW55VGltZXN0YW1wcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5zZWVuQW55VGltZXN0YW1wcztcblxuICAgICAgICAgICAgJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1NlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbWFzdGVyTVR5cGVEaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG5cbiAgICAgICAgICAgIC8vIElmIGluICdUcmFuc2NyaXB0aW9uJyBvciAnUHJvdGVvbWljcycgbW9kZSwgdGhlcmUgYXJlIG5vIG1lYXN1cmVtZW50IHR5cGVzIGludm9sdmVkLlxuICAgICAgICAgICAgLy8gc2tpcCB0aGUgbWVhc3VyZW1lbnQgc2VjdGlvbiwgYW5kIHByb3ZpZGUgc3RhdGlzdGljcyBhYm91dCB0aGUgZ2F0aGVyZWQgcmVjb3Jkcy5cbiAgICAgICAgICAgIGlmIChtb2RlID09PSBcInRyXCIgfHwgbW9kZSA9PT0gXCJwclwiKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAvLyBObyBtZWFzdXJlbWVudHMgZm9yIGRpc2FtYmlndWF0aW9uLCBoYXZlIHRpbWVzdGFtcCBkYXRhOiAgVGhhdCBtZWFucyB3ZSBuZWVkIHRvIGNob29zZSBvbmUgbWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAvLyBZb3UgbWlnaHQgdGhpbmsgdGhhdCB3ZSBzaG91bGQgZGlzcGxheSB0aGlzIGV2ZW4gd2l0aG91dCB0aW1lc3RhbXAgZGF0YSwgdG8gaGFuZGxlIHRoZSBjYXNlIHdoZXJlIHdlJ3JlIGltcG9ydGluZ1xuICAgICAgICAgICAgLy8gYSBzaW5nbGUgbWVhc3VyZW1lbnQgdHlwZSBmb3IgYSBzaW5nbGUgdGltZXN0YW1wLi4uICBCdXQgdGhhdCB3b3VsZCBiZSBhIDEtZGltZW5zaW9uYWwgaW1wb3J0LCBzaW5jZSB0aGVyZSBpcyBvbmx5XG4gICAgICAgICAgICAvLyBvbmUgb3RoZXIgb2JqZWN0IHdpdGggbXVsdGlwbGUgdHlwZXMgdG8gd29yayB3aXRoIChsaW5lcy9hc3NheXMpLiAgV2UncmUgbm90IGdvaW5nIHRvIGJvdGhlciBzdXBwb3J0aW5nIHRoYXQuXG4gICAgICAgICAgICBpZiAodW5pcXVlTWVhc3VyZW1lbnROYW1lcy5sZW5ndGggPT09IDAgJiYgc2VlbkFueVRpbWVzdGFtcHMpIHtcbiAgICAgICAgICAgICAgICAkKCcjbWFzdGVyTVR5cGVEaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHMuZm9yRWFjaCgoZGlzYW06YW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGlzYW0ucm93RWxlbWVudEpRLmRldGFjaCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcblxuICAgICAgICAgICAgLy8gcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgbWVhc3VyZW1lbnQgdHlwZXNcbiAgICAgICAgICAgIHZhciB0ID0gdGhpcztcbiAgICAgICAgICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4oJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1RhYmxlJykuY2hpbGRyZW4oKS5maXJzdCgpWzBdKTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cyA9IFtdOyAgIC8vIEZvciB1c2UgaW4gY2FzY2FkaW5nIHVzZXIgc2V0dGluZ3NcbiAgICAgICAgICAgIHVuaXF1ZU1lYXN1cmVtZW50TmFtZXMuZm9yRWFjaCgobmFtZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgZGlzYW06IGFueTtcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMubWVhc3VyZW1lbnRPYmpTZXRzW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChkaXNhbSAmJiBkaXNhbS5yb3dFbGVtZW50SlEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0ucm93RWxlbWVudEpRLmFwcGVuZFRvKGJvZHkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtID0ge307XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PmJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtLnJvd0VsZW1lbnRKUSA9ICQocm93KTtcbiAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KG5hbWUpLmFwcGVuZFRvKHJvdy5pbnNlcnRDZWxsKCkpO1xuICAgICAgICAgICAgICAgICAgICBbJ2NvbXBPYmonLCAndHlwZU9iaicsICd1bml0c09iaiddLmZvckVhY2goKGF1dG86IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ2Rpc2FtRGF0YUNlbGwnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc2FtW2F1dG9dID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZShjZWxsKS5kYXRhKCd0eXBlJywgYXV0byk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBkaXNhbS50eXBlSGlkZGVuT2JqID0gZGlzYW0udHlwZU9iai5hdHRyKCdzaXplJywgNDUpLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0uY29tcEhpZGRlbk9iaiA9IGRpc2FtLmNvbXBPYmouYXR0cignc2l6ZScsIDQpLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0udW5pdHNIaWRkZW5PYmogPSBkaXNhbS51bml0c09iai5hdHRyKCdzaXplJywgMTApLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgJChyb3cpLm9uKCdjaGFuZ2UnLCAnaW5wdXRbdHlwZT1oaWRkZW5dJywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IHdhdGNoIGZvciBjaGFuZ2VzIG9uIHRoZSBoaWRkZW4gcG9ydGlvbiwgbGV0IGF1dG9jb21wbGV0ZSB3b3JrXG4gICAgICAgICAgICAgICAgICAgICAgICB0LnVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbShldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLmNvbXBPYmosICdNZWFzdXJlbWVudENvbXBhcnRtZW50JywgdGhpcy5hdXRvQ2FjaGUuY29tcCk7XG4gICAgICAgICAgICAgICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS50eXBlT2JqLCAnR2VuZXJpY09yTWV0YWJvbGl0ZScsIHRoaXMuYXV0b0NhY2hlLm1ldGFib2xpdGUpO1xuICAgICAgICAgICAgICAgICAgICBFRERfYXV0by5pbml0aWFsX3NlYXJjaChkaXNhbS50eXBlT2JqLCBuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLnVuaXRzT2JqLCAnTWVhc3VyZW1lbnRVbml0JywgdGhpcy5hdXRvQ2FjaGUudW5pdCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRPYmpTZXRzW25hbWVdID0gZGlzYW07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIFRPRE8gc2l6aW5nIHNob3VsZCBiZSBoYW5kbGVkIGluIENTU1xuICAgICAgICAgICAgICAgIGRpc2FtLmNvbXBPYmouZGF0YSgndmlzaWJsZUluZGV4JywgaSk7XG4gICAgICAgICAgICAgICAgZGlzYW0udHlwZU9iai5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKTtcbiAgICAgICAgICAgICAgICBkaXNhbS51bml0c09iai5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKTtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSdyZSBpbiBNRFYgbW9kZSwgdGhlIHVuaXRzIHB1bGxkb3ducyBhcmUgaXJyZWxldmFudC5cbiAgICAgICAgICAgICAgICBkaXNhbS51bml0c09iai50b2dnbGVDbGFzcygnb2ZmJywgbW9kZSA9PT0gJ21kdicpO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5wdXNoKGRpc2FtKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSgpO1xuICAgICAgICB9XG5cblxuICAgICAgICByZW1ha2VNZXRhZGF0YVNlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudDtcblxuICAgICAgICAgICAgdmFyIHVuaXF1ZU1ldGFkYXRhTmFtZXMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAudW5pcXVlTWV0YWRhdGFOYW1lcztcbiAgICAgICAgICAgIGlmICh1bmlxdWVNZXRhZGF0YU5hbWVzLmxlbmd0aCA8IDEpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVNZXRhZGF0YVRhYmxlJykucmVtb3ZlKCk7XG4gICAgICAgICAgICAvLyBwdXQgdG9nZXRoZXIgYSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGZvciBtZXRhZGF0YVxuICAgICAgICAgICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGFibGU+JylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVNZXRhZGF0YVRhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlTWV0YWRhdGFTZWN0aW9uJykucmVtb3ZlQ2xhc3MoJ29mZicpKVxuICAgICAgICAgICAgICAgIC5vbignY2hhbmdlJywgJ2lucHV0JywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHNob3VsZCB0aGVyZSBiZSBldmVudCBoYW5kbGluZyBoZXJlID9cbiAgICAgICAgICAgICAgICB9KVswXTtcbiAgICAgICAgICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgICAgICAgICAgdW5pcXVlTWV0YWRhdGFOYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBkaXNhbTogYW55O1xuICAgICAgICAgICAgICAgIGRpc2FtID0gdGhpcy5tZXRhZGF0YU9ialNldHNbbmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKGRpc2FtICYmIGRpc2FtLnJvd0VsZW1lbnRKUSkge1xuICAgICAgICAgICAgICAgICAgICBkaXNhbS5yb3dFbGVtZW50SlEuYXBwZW5kVG8oYm9keSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0gPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+Ym9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0ucm93RWxlbWVudEpRID0gJChyb3cpO1xuICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8ocm93Lmluc2VydENlbGwoKSk7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtLm1ldGFPYmogPSBFRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlKHJvdy5pbnNlcnRDZWxsKCkpLnZhbChuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0ubWV0YUhpZGRlbk9iaiA9IGRpc2FtLm1ldGFPYmoubmV4dCgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1ldGFkYXRhT2JqU2V0c1tuYW1lXSA9IGRpc2FtO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkaXNhbS5tZXRhT2JqLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhJyArIGkpLmFkZENsYXNzKCdhdXRvY29tcF9hbHR5cGUnKVxuICAgICAgICAgICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhSGlkZGVuJyArIGkpO1xuICAgICAgICAgICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS5tZXRhT2JqLCAnQXNzYXlMaW5lTWV0YWRhdGFUeXBlJywgdGhpcy5hdXRvQ2FjaGUubWV0YSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gV2UgY2FsbCB0aGlzIHdoZW4gYW55IG9mIHRoZSAnbWFzdGVyJyBwdWxsZG93bnMgYXJlIGNoYW5nZWQgaW4gU3RlcCA0LlxuICAgICAgICAvLyBTdWNoIGNoYW5nZXMgbWF5IGFmZmVjdCB0aGUgYXZhaWxhYmxlIGNvbnRlbnRzIG9mIHNvbWUgb2YgdGhlIHB1bGxkb3ducyBpbiB0aGUgc3RlcC5cbiAgICAgICAgY2hhbmdlZEFueU1hc3RlclB1bGxkb3duKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gU2hvdyB0aGUgbWFzdGVyIGxpbmUgZHJvcGRvd24gaWYgdGhlIG1hc3RlciBhc3NheSBkcm9wZG93biBpcyBzZXQgdG8gbmV3XG4gICAgICAgICAgICAkKCcjbWFzdGVyTGluZVNwYW4nKS50b2dnbGVDbGFzcygnb2ZmJywgJCgnI21hc3RlckFzc2F5JykudmFsKCkgIT09ICduZXcnKTtcbiAgICAgICAgICAgIHRoaXMucmVjb25maWd1cmUoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSWYgdGhlIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3Jywgd2FsayBkb3duIHRoZSByZW1haW5pbmcgcHVsbGRvd25zIGluIHRoZSBzZWN0aW9uLFxuICAgICAgICAvLyBpbiBvcmRlciwgc2V0dGluZyB0aGVtIHRvICduZXcnIGFzIHdlbGwsIHN0b3BwaW5nIGp1c3QgYmVmb3JlIGFueSBwdWxsZG93biBtYXJrZWQgYXNcbiAgICAgICAgLy8gYmVpbmcgJ3NldCBieSB0aGUgdXNlcicuXG4gICAgICAgIHVzZXJDaGFuZ2VkTGluZURpc2FtKGxpbmVFbDogRWxlbWVudCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZDogSlF1ZXJ5LCB2OiBudW1iZXI7XG4gICAgICAgICAgICBjaGFuZ2VkID0gJChsaW5lRWwpLmRhdGEoJ3NldEJ5VXNlcicsIHRydWUpO1xuICAgICAgICAgICAgaWYgKGNoYW5nZWQudmFsKCkgIT09ICduZXcnKSB7XG4gICAgICAgICAgICAgICAgLy8gc3RvcCBoZXJlIGZvciBhbnl0aGluZyBvdGhlciB0aGFuICduZXcnOyBvbmx5ICduZXcnIGNhc2NhZGVzIHRvIGZvbGxvd2luZyBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2ID0gY2hhbmdlZC5kYXRhKCd2aXNpYmxlSW5kZXgnKSB8fCAwO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTGluZU9ialNldHMuc2xpY2UodikuZm9yRWFjaCgob2JqOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0OiBKUXVlcnkgPSBvYmouc2VsZWN0TGluZUpRRWxlbWVudDtcbiAgICAgICAgICAgICAgICBpZiAoc2VsZWN0LmRhdGEoJ3NldEJ5VXNlcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gc2V0IGRyb3Bkb3duIHRvICduZXcnIGFuZCByZXZlYWwgdGhlIGxpbmUgcHVsbGRvd25cbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsKCduZXcnKS5uZXh0KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gc2VydmVzIHR3byBwdXJwb3Nlcy5cbiAgICAgICAgLy8gMS4gSWYgdGhlIGdpdmVuIEFzc2F5IGRpc2FtYmlndWF0aW9uIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3JywgcmV2ZWFsIHRoZSBhZGphY2VudFxuICAgICAgICAvLyAgICBMaW5lIHB1bGxkb3duLCBvdGhlcndpc2UgaGlkZSBpdC5cbiAgICAgICAgLy8gMi4gSWYgdGhlIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3Jywgd2FsayBkb3duIHRoZSByZW1haW5pbmcgcHVsbGRvd25zIGluIHRoZSBzZWN0aW9uLFxuICAgICAgICAvLyAgICBpbiBvcmRlciwgc2V0dGluZyB0aGVtIHRvICduZXcnIGFzIHdlbGwsIHN0b3BwaW5nIGp1c3QgYmVmb3JlIGFueSBwdWxsZG93biBtYXJrZWQgYXNcbiAgICAgICAgLy8gICAgYmVpbmcgJ3NldCBieSB0aGUgdXNlcicuXG4gICAgICAgIHVzZXJDaGFuZ2VkQXNzYXlEaXNhbShhc3NheUVsOiBFbGVtZW50KTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOiBKUXVlcnksIHY6IG51bWJlcjtcbiAgICAgICAgICAgIGNoYW5nZWQgPSAkKGFzc2F5RWwpLmRhdGEoJ3NldEJ5VXNlcicsIHRydWUpO1xuICAgICAgICAgICAgLy8gVGhlIHNwYW4gd2l0aCB0aGUgY29ycmVzcG9uZGluZyBMaW5lIHB1bGxkb3duIGlzIGFsd2F5cyByaWdodCBuZXh0IHRvIHRoZSBBc3NheSBwdWxsZG93blxuICAgICAgICAgICAgY2hhbmdlZC5uZXh0KCkudG9nZ2xlQ2xhc3MoJ29mZicsIGNoYW5nZWQudmFsKCkgIT09ICduZXcnKTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VkLnZhbCgpICE9PSAnbmV3Jykge1xuICAgICAgICAgICAgICAgIC8vIHN0b3AgaGVyZSBmb3IgYW55dGhpbmcgb3RoZXIgdGhhbiAnbmV3Jzsgb25seSAnbmV3JyBjYXNjYWRlcyB0byBmb2xsb3dpbmcgcHVsbGRvd25zXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdiA9IGNoYW5nZWQuZGF0YSgndmlzaWJsZUluZGV4JykgfHwgMDtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZUFzc2F5T2JqU2V0cy5zbGljZSh2KS5mb3JFYWNoKChvYmo6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzZWxlY3Q6IEpRdWVyeSA9IG9iai5zZWxlY3RBc3NheUpRRWxlbWVudDtcbiAgICAgICAgICAgICAgICBpZiAoc2VsZWN0LmRhdGEoJ3NldEJ5VXNlcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gc2V0IGRyb3Bkb3duIHRvICduZXcnIGFuZCByZXZlYWwgdGhlIGxpbmUgcHVsbGRvd25cbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsKCduZXcnKS5uZXh0KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbShlbGVtZW50OiBFbGVtZW50KTp2b2lkIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdjaGFuZ2VkJyk7XG4gICAgICAgICAgICB2YXIgaGlkZGVuOiBKUXVlcnksIGF1dG86IEpRdWVyeSwgdHlwZTogc3RyaW5nLCBpOiBudW1iZXI7XG4gICAgICAgICAgICBoaWRkZW4gPSAkKGVsZW1lbnQpO1xuICAgICAgICAgICAgYXV0byA9IGhpZGRlbi5wcmV2KCk7XG4gICAgICAgICAgICB0eXBlID0gYXV0by5kYXRhKCd0eXBlJyk7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ2NvbXBPYmonIHx8IHR5cGUgPT09ICd1bml0c09iaicpIHtcbiAgICAgICAgICAgICAgICBpID0gYXV0by5kYXRhKCdzZXRCeVVzZXInLCB0cnVlKS5kYXRhKCd2aXNpYmxlSW5kZXgnKSB8fCAwO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5zbGljZShpKS5zb21lKChvYmo6IGFueSk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sbG93aW5nOiBKUXVlcnkgPSAkKG9ialt0eXBlXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xsb3dpbmcubGVuZ3RoID09PSAwIHx8IGZvbGxvd2luZy5kYXRhKCdzZXRCeVVzZXInKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBicmVhazsgZm9yIHRoZSBBcnJheS5zb21lKCkgbG9vcFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIHVzaW5nIHBsYWNlaG9sZGVyIGluc3RlYWQgb2YgdmFsIHRvIGF2b2lkIHRyaWdnZXJpbmcgYXV0b2NvbXBsZXRlIGNoYW5nZVxuICAgICAgICAgICAgICAgICAgICBmb2xsb3dpbmcuYXR0cigncGxhY2Vob2xkZXInLCBhdXRvLnZhbCgpKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sbG93aW5nLm5leHQoKS52YWwoaGlkZGVuLnZhbCgpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gbm90IGNoZWNraW5nIHR5cGVPYmo7IGZvcm0gc3VibWl0IHNlbmRzIHNlbGVjdGVkIHR5cGVzXG4gICAgICAgICAgICB0aGlzLmNoZWNrQWxsTWVhc3VyZW1lbnRDb21wYXJ0bWVudERpc2FtKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBsaXN0IG9mIGN1cnJlbnRseSB2aXNpYmxlIG1lYXN1cmVtZW50IGRpc2FtYmlndWF0aW9uIGZvcm0gZWxlbWVudHMsXG4gICAgICAgIC8vIGNoZWNraW5nIHRvIHNlZSBpZiBhbnkgb2YgdGhlICdjb21wYXJ0bWVudCcgZWxlbWVudHMgYXJlIHNldCB0byBhIG5vbi1ibGFuayB2YWx1ZS5cbiAgICAgICAgLy8gSWYgYW55IGFyZSwgYW5kIHdlJ3JlIGluIE1EViBkb2N1bWVudCBtb2RlLCBkaXNwbGF5IGEgd2FybmluZyB0aGF0IHRoZSB1c2VyIHNob3VsZFxuICAgICAgICAvLyBzcGVjaWZ5IGNvbXBhcnRtZW50cyBmb3IgYWxsIHRoZWlyIG1lYXN1cmVtZW50cy5cbiAgICAgICAgY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW0oKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBhbGxTZXQ6IGJvb2xlYW47XG4gICAgICAgICAgICB2YXIgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG5cbiAgICAgICAgICAgIGFsbFNldCA9IHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5ldmVyeSgob2JqOiBhbnkpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgaGlkZGVuOiBKUXVlcnkgPSBvYmouY29tcEhpZGRlbk9iajtcbiAgICAgICAgICAgICAgICBpZiAob2JqLmNvbXBPYmouZGF0YSgnc2V0QnlVc2VyJykgfHwgKGhpZGRlbi52YWwoKSAmJiBoaWRkZW4udmFsKCkgIT09ICcwJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJCgnI25vQ29tcGFydG1lbnRXYXJuaW5nJykudG9nZ2xlQ2xhc3MoJ29mZicsIG1vZGUgIT09ICdtZHYnIHx8IGFsbFNldCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGRpc2FtYmlndWF0ZUFuQXNzYXlPckxpbmUoYXNzYXlPckxpbmU6IHN0cmluZywgY3VycmVudEluZGV4OiBudW1iZXIpOmFueSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uczogYW55LCBoaWdoZXN0OiBudW1iZXIsIGFzc2F5czogbnVtYmVyW107XG4gICAgICAgICAgICBzZWxlY3Rpb25zID0ge1xuICAgICAgICAgICAgICAgIGxpbmVJRDogMCxcbiAgICAgICAgICAgICAgICBhc3NheUlEOiAwXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaGlnaGVzdCA9IDA7XG4gICAgICAgICAgICAvLyBBVERhdGEuZXhpc3RpbmdBc3NheXMgaXMgdHlwZSB7W2luZGV4OiBzdHJpbmddOiBudW1iZXJbXX1cbiAgICAgICAgICAgIGFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1t0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAubWFzdGVyUHJvdG9jb2xdIHx8IFtdO1xuICAgICAgICAgICAgYXNzYXlzLmV2ZXJ5KChpZDogbnVtYmVyLCBpOiBudW1iZXIpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IEFzc2F5UmVjb3JkLCBsaW5lOiBMaW5lUmVjb3JkLCBwcm90b2NvbDogYW55LCBuYW1lOiBzdHJpbmc7XG4gICAgICAgICAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpZF07XG4gICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICAgICAgICAgbmFtZSA9IFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXlPckxpbmUudG9Mb3dlckNhc2UoKSA9PT0gbmFtZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBmdWxsIEFzc2F5IG5hbWUsIGV2ZW4gY2FzZS1pbnNlbnNpdGl2ZSwgaXMgdGhlIGJlc3QgbWF0Y2hcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgIC8vIGRvIG5vdCBuZWVkIHRvIGNvbnRpbnVlXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC44ICYmIGFzc2F5T3JMaW5lID09PSBhc3NheS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFuIGV4YWN0LWNhc2UgbWF0Y2ggd2l0aCB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCBhbG9uZSBpcyBzZWNvbmQtYmVzdC5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuODtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC43ICYmIGFzc2F5Lm5hbWUuaW5kZXhPZihhc3NheU9yTGluZSkgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSB3aG9sZSBzdHJpbmcgaW5zaWRlIHRoZSBBc3NheSBuYW1lIGZyYWdtZW50IGlzIHByZXR0eSBnb29kXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjc7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNiAmJiBsaW5lLm5hbWUuaW5kZXhPZihhc3NheU9yTGluZSkgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSB3aG9sZSBzdHJpbmcgaW5zaWRlIHRoZSBvcmlnaW5hdGluZyBMaW5lIG5hbWUgaXMgZ29vZCB0b28uXG4gICAgICAgICAgICAgICAgICAgIC8vIEl0IG1lYW5zIHRoYXQgdGhlIHVzZXIgbWF5IGludGVuZCB0byBwYWlyIHdpdGggdGhpcyBBc3NheSBldmVuIHRob3VnaCB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gQXNzYXkgbmFtZSBpcyBkaWZmZXJlbnQuICBcbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuNjtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC40ICYmXG4gICAgICAgICAgICAgICAgICAgIChuZXcgUmVnRXhwKCcoXnxcXFxcVyknICsgYXNzYXkubmFtZSArICcoXFxcXFd8JCknLCAnZycpKS50ZXN0KGFzc2F5T3JMaW5lKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSBBc3NheSBuYW1lIGZyYWdtZW50IHdpdGhpbiB0aGUgd2hvbGUgc3RyaW5nLCBhcyBhIHdob2xlIHdvcmQsIGlzIG91clxuICAgICAgICAgICAgICAgICAgICAvLyBsYXN0IG9wdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuNDtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC4zICYmIGN1cnJlbnRJbmRleCA9PT0gaSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiBhbGwgZWxzZSBmYWlscywgY2hvb3NlIEFzc2F5IG9mIGN1cnJlbnQgaW5kZXggaW4gc29ydGVkIG9yZGVyLlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC4zO1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIE5vdyB3ZSByZXBlYXQgdGhlIHByYWN0aWNlLCBzZXBhcmF0ZWx5LCBmb3IgdGhlIExpbmUgcHVsbGRvd24uXG4gICAgICAgICAgICBoaWdoZXN0ID0gMDtcbiAgICAgICAgICAgIC8vIEFURGF0YS5leGlzdGluZ0xpbmVzIGlzIHR5cGUge2lkOiBudW1iZXI7IG46IHN0cmluZzt9W11cbiAgICAgICAgICAgIChBVERhdGEuZXhpc3RpbmdMaW5lcyB8fCBbXSkuZXZlcnkoKGxpbmU6IGFueSwgaTogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5T3JMaW5lID09PSBsaW5lLm4pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIExpbmUgbmFtZSwgY2FzZS1zZW5zaXRpdmUsIGlzIHRoZSBiZXN0IG1hdGNoXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAgLy8gZG8gbm90IG5lZWQgdG8gY29udGludWVcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjggJiYgYXNzYXlPckxpbmUudG9Mb3dlckNhc2UoKSA9PT0gbGluZS5uLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHNhbWUgdGhpbmcgY2FzZS1pbnNlbnNpdGl2ZSBpcyBzZWNvbmQgYmVzdC5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuODtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNyAmJiBhc3NheU9yTGluZS5pbmRleE9mKGxpbmUubikgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSBMaW5lIG5hbWUgd2l0aGluIHRoZSBzdHJpbmcgaXMgb2RkLCBidXQgZ29vZC5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuNztcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNiAmJiBsaW5lLm4uaW5kZXhPZihhc3NheU9yTGluZSkgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSBzdHJpbmcgd2l0aGluIHRoZSBMaW5lIG5hbWUgaXMgYWxzbyBnb29kLlxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC42O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC41ICYmIGN1cnJlbnRJbmRleCA9PT0gaSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBZ2FpbiwgaWYgYWxsIGVsc2UgZmFpbHMsIGp1c3QgY2hvb3NlIHRoZSBMaW5lIHRoYXQgbWF0Y2hlcyB0aGUgY3VycmVudCBpbmRleFxuICAgICAgICAgICAgICAgICAgICAvLyBpbiBzb3J0ZWQgb3JkZXIsIGluIGEgbG9vcC5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuNTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHNlbGVjdGlvbnM7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNyZWF0ZVNldHNGb3JTdWJtaXNzaW9uKCk6UmVzb2x2ZWRJbXBvcnRTZXRbXSB7XG5cbiAgICAgICAgICAgIC8vIEZyb20gU3RlcCAxXG4gICAgICAgICAgICB2YXIgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG4gICAgICAgICAgICB2YXIgbWFzdGVyUHJvdG9jb2wgPSAkKFwiI21hc3RlclByb3RvY29sXCIpLnZhbCgpO1xuXG4gICAgICAgICAgICAvLyBGcm9tIFN0ZXAgM1xuICAgICAgICAgICAgdmFyIHNlZW5BbnlUaW1lc3RhbXBzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnNlZW5BbnlUaW1lc3RhbXBzO1xuICAgICAgICAgICAgdmFyIHBhcnNlZFNldHMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucGFyc2VkU2V0cztcblxuICAgICAgICAgICAgLy8gRnJvbSB0aGlzIFN0ZXBcbiAgICAgICAgICAgIHZhciBtYXN0ZXJUaW1lID0gcGFyc2VGbG9hdCgkKCcjbWFzdGVyVGltZXN0YW1wJykudmFsKCkpO1xuICAgICAgICAgICAgdmFyIG1hc3RlckxpbmUgPSAkKCcjbWFzdGVyTGluZScpLnZhbCgpO1xuICAgICAgICAgICAgdmFyIG1hc3RlckFzc2F5TGluZSA9ICQoJyNtYXN0ZXJBc3NheUxpbmUnKS52YWwoKTtcbiAgICAgICAgICAgIHZhciBtYXN0ZXJBc3NheSA9ICQoJyNtYXN0ZXJBc3NheScpLnZhbCgpO1xuICAgICAgICAgICAgdmFyIG1hc3Rlck1UeXBlID0gJCgnI21hc3Rlck1UeXBlJykudmFsKCk7XG4gICAgICAgICAgICB2YXIgbWFzdGVyTUNvbXAgPSAkKCcjbWFzdGVyTUNvbXAnKS52YWwoKTtcbiAgICAgICAgICAgIHZhciBtYXN0ZXJNVW5pdHMgPSAkKCcjbWFzdGVyTVVuaXRzJykudmFsKCk7XG5cbiAgICAgICAgICAgIHZhciByZXNvbHZlZFNldHM6UmVzb2x2ZWRJbXBvcnRTZXRbXSA9IFtdO1xuXG4gICAgICAgICAgICBwYXJzZWRTZXRzLmZvckVhY2goKHNldCwgYzogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHJlc29sdmVkU2V0OiBSZXNvbHZlZEltcG9ydFNldDtcblxuICAgICAgICAgICAgICAgIHZhciBsaW5lX2lkID0gJ25ldyc7ICAgIC8vIEEgY29udmVuaWVudCBkZWZhdWx0XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5X2lkID0gJ25ldyc7XG5cbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnRfaWQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHZhciBjb21wYXJ0bWVudF9pZCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdmFyIHVuaXRzX2lkID0gbnVsbDtcbiAgICAgICAgICAgICAgICAvLyBJbiBtb2RlcyB3aGVyZSB3ZSByZXNvbHZlIG1lYXN1cmVtZW50IHR5cGVzIGluIHRoZSBjbGllbnQgVUksIGdvIHdpdGggdGhlIG1hc3RlciB2YWx1ZXMgYnkgZGVmYXVsdC5cbiAgICAgICAgICAgICAgICBpZiAobW9kZSA9PT0gXCJiaW9sZWN0b3JcIiB8fCBtb2RlID09PSBcInN0ZFwiIHx8IG1vZGUgPT09IFwibWR2XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRfaWQgPSBtYXN0ZXJNVHlwZTtcbiAgICAgICAgICAgICAgICAgICAgY29tcGFydG1lbnRfaWQgPSBtYXN0ZXJNQ29tcCB8fCBcIjBcIjtcbiAgICAgICAgICAgICAgICAgICAgdW5pdHNfaWQgPSBtYXN0ZXJNVW5pdHMgfHwgXCIxXCI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBzZXQuZGF0YTtcblxuICAgICAgICAgICAgICAgIHZhciBtZXRhRGF0YTp7W2lkOnN0cmluZ106IHN0cmluZ30gPSB7fTtcbiAgICAgICAgICAgICAgICB2YXIgbWV0YURhdGFQcmVzZW50OmJvb2xlYW4gPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGlmIChtb2RlID09PSBcImJpb2xlY3RvclwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVfaWQgPSBtYXN0ZXJMaW5lO1xuICAgICAgICAgICAgICAgICAgICBhc3NheV9pZCA9IFwibmFtZWRfb3JfbmV3XCI7IC8vIFRlbGxzIHRoZSBzZXJ2ZXIgdG8gYXR0ZW1wdCB0byByZXNvbHZlIGRpcmVjdGx5IGFnYWluc3QgdGhlIG5hbWUsIG9yIG1ha2UgYSBuZXcgQXNzYXlcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBhIHZhbGlkLCBzcGVjaWZpYyBMaW5lIG5hbWUsIGxvb2sgZm9yIGEgZGlzYW1iaWd1YXRpb24gZmllbGQgdGhhdCBtYXRjaGVzIGl0LlxuICAgICAgICAgICAgICAgICAgICBpZiAoc2V0LmxpbmVfbmFtZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGRpc2FtID0gdGhpcy5saW5lT2JqU2V0c1tzZXQubGluZV9uYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVfaWQgPSBkaXNhbS5zZWxlY3RMaW5lSlFFbGVtZW50LnZhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZV9pZCA9IG1hc3RlckFzc2F5TGluZTtcbiAgICAgICAgICAgICAgICAgICAgYXNzYXlfaWQgPSBtYXN0ZXJBc3NheTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNldC5hc3NheV9uYW1lICE9PSBudWxsICYmIG1hc3RlclByb3RvY29sKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZGlzYW0gPSB0aGlzLmFzc2F5T2JqU2V0c1ttYXN0ZXJQcm90b2NvbF1bc2V0LmFzc2F5X25hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRpc2FtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzYXlfaWQgPSBkaXNhbS5zZWxlY3RBc3NheUpRRWxlbWVudC52YWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lX2lkID0gZGlzYW0uc2VsZWN0TGluZUpRRWxlbWVudC52YWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFNhbWUgZm9yIG1lYXN1cmVtZW50IG5hbWUsIGJ1dCByZXNvbHZlIGFsbCB0aHJlZSBtZWFzdXJlbWVudCBmaWVsZHMgaWYgd2UgZmluZCBhIG1hdGNoLFxuICAgICAgICAgICAgICAgIC8vIGFuZCBvbmx5IGlmIHdlIGFyZSByZXNvbHZpbmcgbWVhc3VyZW1lbnQgdHlwZXMgY2xpZW50LXNpZGUuXG4gICAgICAgICAgICAgICAgaWYgKG1vZGUgPT09IFwiYmlvbGVjdG9yXCIgfHwgbW9kZSA9PT0gXCJzdGRcIiB8fCBtb2RlID09PSBcIm1kdlwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZXQubWVhc3VyZW1lbnRfbmFtZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGRpc2FtID0gdGhpcy5tZWFzdXJlbWVudE9ialNldHNbc2V0Lm1lYXN1cmVtZW50X25hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRpc2FtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRfaWQgPSBkaXNhbS50eXBlSGlkZGVuT2JqLnZhbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBhcnRtZW50X2lkID0gZGlzYW0uY29tcEhpZGRlbk9iai52YWwoKSB8fCBcIjBcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bml0c19pZCA9IGRpc2FtLnVuaXRzSGlkZGVuT2JqLnZhbCgpIHx8IFwiMVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQW55IG1ldGFkYXRhIGRpc2FtYmlndWF0aW9uIGZpZWxkcyB0aGF0IGFyZSBsZWZ0IHVucmVzb2x2ZWQsIHdpbGwgaGF2ZSB0aGVpciBtZXRhZGF0YVxuICAgICAgICAgICAgICAgIC8vIGRyb3BwZWQgZnJvbSB0aGUgaW1wb3J0IGluIHRoaXMgc3RlcCwgYmVjYXVzZSB0aGlzIGxvb3AgaXMgYnVpbGRpbmcga2V5LXZhbHVlIHBhaXJzIHdoZXJlXG4gICAgICAgICAgICAgICAgLy8gdGhlIGtleSBpcyB0aGUgY2hvc2VuIGRhdGFiYXNlIGlkIG9mIHRoZSBtZXRhZGF0YSB0eXBlLiAgTm8gaWQgPT0gbm90IGFkZGVkLlxuICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHNldC5tZXRhZGF0YV9ieV9uYW1lKS5mb3JFYWNoKChuYW1lKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRpc2FtID0gdGhpcy5tZXRhZGF0YU9ialNldHNbbmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXNhbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGlkID0gZGlzYW0ubWV0YUhpZGRlbk9iai52YWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFEYXRhW2lkXSA9IHNldC5tZXRhZGF0YV9ieV9uYW1lW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFEYXRhUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmVuJ3Qgc2VlbiBhbnkgdGltZXN0YW1wcyBkdXJpbmcgZGF0YSBhY2N1bXVsYXRpb24sIGl0IG1lYW5zIHdlIG5lZWQgdGhlIHVzZXIgdG8gcGlja1xuICAgICAgICAgICAgICAgIC8vIGEgbWFzdGVyIHRpbWVzdGFtcC4gIEluIHRoYXQgc2l0dWF0aW9uLCBhbnkgZ2l2ZW4gc2V0IHdpbGwgaGF2ZSBhdCBtb3N0IG9uZSBkYXRhIHBvaW50IGluIGl0LFxuICAgICAgICAgICAgICAgIC8vIHdpdGggdGhlIHRpbWVzdGFtcCBpbiB0aGUgZGF0YSBwb2ludCBzZXQgdG8gJ251bGwnLiAgSGVyZSB3ZSByZXNvbHZlIGl0IHRvIGEgdmFsaWQgdGltZXN0YW1wLlxuICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIG1hc3RlciB0aW1lc3RhbXAgc2VsZWN0ZWQsIHdlIGRyb3AgdGhlIGRhdGEgcG9pbnQsIGJ1dCBtYWtlIHRoZSBzZXQgYW55d2F5IHNpbmNlXG4gICAgICAgICAgICAgICAgLy8gaXQgbWlnaHQgY2FycnkgbWV0YWRhdGEuXG4gICAgICAgICAgICAgICAgaWYgKCFzZWVuQW55VGltZXN0YW1wcyAmJiBzZXQuZGF0YVswXSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKG1hc3RlclRpbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhWzBdWzBdID0gbWFzdGVyVGltZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmUgbm8gZGF0YSwgYW5kIG5vIG1ldGFkYXRhIHRoYXQgc3Vydml2ZWQgcmVzb2x2aW5nLCBkb24ndCBtYWtlIHRoZSBzZXQuXG4gICAgICAgICAgICAgICAgaWYgKGRhdGEubGVuZ3RoIDwgMSAmJiAhbWV0YURhdGFQcmVzZW50KSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRTZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENvcHkgYWNyb3NzIHRoZSBmaWVsZHMgZnJvbSB0aGUgUmF3SW1wb3J0U2V0IHJlY29yZFxuICAgICAgICAgICAgICAgICAgICBraW5kOiAgICAgICAgICAgICAgc2V0LmtpbmQsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVfbmFtZTogICAgICAgICBzZXQubGluZV9uYW1lLFxuICAgICAgICAgICAgICAgICAgICBhc3NheV9uYW1lOiAgICAgICAgc2V0LmFzc2F5X25hbWUsXG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50X25hbWU6ICBzZXQubWVhc3VyZW1lbnRfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGFfYnlfbmFtZTogIHNldC5tZXRhZGF0YV9ieV9uYW1lLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiAgICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIG5ldyBkaXNhbWJpZ3VhdGlvbi1zcGVjaWZpYyBmaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2xfaWQ6ICAgICAgIG1hc3RlclByb3RvY29sLFxuICAgICAgICAgICAgICAgICAgICBsaW5lX2lkOiAgICAgICAgICAgbGluZV9pZCxcbiAgICAgICAgICAgICAgICAgICAgYXNzYXlfaWQ6ICAgICAgICAgIGFzc2F5X2lkLFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudF9pZDogICAgbWVhc3VyZW1lbnRfaWQsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBhcnRtZW50X2lkOiAgICBjb21wYXJ0bWVudF9pZCxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHNfaWQ6ICAgICAgICAgIHVuaXRzX2lkLFxuICAgICAgICAgICAgICAgICAgICBtZXRhZGF0YV9ieV9pZDogICAgbWV0YURhdGFcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlc29sdmVkU2V0cy5wdXNoKHJlc29sdmVkU2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHJlc29sdmVkU2V0cztcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG4kKHdpbmRvdykubG9hZChmdW5jdGlvbigpIHtcbiAgICBFRERUYWJsZUltcG9ydC5vbldpbmRvd0xvYWQoKTtcbn0pO1xuXG5cbiJdfQ==