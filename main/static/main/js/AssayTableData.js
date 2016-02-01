// Compiled to JS on: Mon Feb 01 2016 16:13:47  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
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
        var a = new SelectMajorKindStep(EDDTableImport.selectMajorKindCallback);
        var b = new RawInputStep(a, EDDTableImport.rawInputCallback);
        var c = new IdentifyStructuresStep(a, b, EDDTableImport.identifyStructuresCallback);
        var d = new TypeDisambiguationStep(a, c, EDDTableImport.typeDisambiguationCallback);
        EDDTableImport.selectMajorKindStep = a;
        EDDTableImport.rawInputStep = b;
        EDDTableImport.identifyStructuresStep = c;
        EDDTableImport.typeDisambiguationStep = d;
        $('#submitForImport').on('click', EDDTableImport.submitForImport);
        // We need to manually trigger this, after all our steps are constructed.
        // This will cascade calls through the rest of the steps and configure them too.
        a.changedMasterProtocol();
    }
    EDDTableImport.onReferenceRecordsLoad = onReferenceRecordsLoad;
    // This is called by our instance of selectMajorKindStep to announce changes.
    function selectMajorKindCallback() {
        if (EDDTableImport.selectMajorKindStep.interpretationMode == 'mdv') {
            // TODO: There has got to be a better way to handle this
            EDDTableImport.identifyStructuresStep.pulldownSettings = [1, 5]; // A default set of pulldown settings for this mode
        }
        EDDTableImport.rawInputStep.previousStepChanged();
    }
    EDDTableImport.selectMajorKindCallback = selectMajorKindCallback;
    // This is called by our instance of rawInputStep to announce changes.
    function rawInputCallback() {
        EDDTableImport.identifyStructuresStep.previousStepChanged();
    }
    EDDTableImport.rawInputCallback = rawInputCallback;
    // This is called by our instance of identifyStructuresStep to announce changes.
    function identifyStructuresCallback() {
        // Now that we're got the table from Step 3 built,
        // we turn to the table in Step 4:  A set for each type of data, consisting of disambiguation rows,
        // where the user can link unknown items to pre-existing EDD data.
        EDDTableImport.typeDisambiguationStep.previousStepChanged();
    }
    EDDTableImport.identifyStructuresCallback = identifyStructuresCallback;
    // This is called by our instance of typeDisambiguationStep to announce changes.
    function typeDisambiguationCallback() {
        var parsedSets = EDDTableImport.identifyStructuresStep.parsedSets;
        // if the debug area is there, set its value to JSON of parsed sets
        $('#jsondebugarea').val(JSON.stringify(parsedSets));
    }
    EDDTableImport.typeDisambiguationCallback = typeDisambiguationCallback;
    // When the submit button is pushed, fetch the most recent record sets from our identifyStructuresStep instance,
    // and embed them in the hidden form field that will be submitted to the server.
    // Note that this is not all that the server needs, in order to successfully process an import.
    // It also reads other form elements from the page, created by selectMajorKindStep and typeDisambiguationStep.
    function submitForImport() {
        var json;
        var parsedSets = EDDTableImport.identifyStructuresStep.parsedSets;
        // Run through the data sets one more time, pulling out any values in the pulldowns and
        // autocomplete elements in Step 4 and embedding them in their respective data sets.
        json = JSON.stringify(parsedSets);
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
    var SelectMajorKindStep = (function () {
        function SelectMajorKindStep(nextStepCallback) {
            this.masterProtocol = 0;
            this.interpretationMode = "std";
            this.inputRefreshTimerID = null;
            this.nextStepCallback = nextStepCallback;
            var reProcessOnClick;
            reProcessOnClick = ['#stdlayout', '#trlayout', '#prlayout', '#mdvlayout'];
            // This is rather a lot of callbacks, but we need to make sure we're
            // tracking the minimum number of elements with this call, since the
            // function called has such strong effects on the rest of the page.
            // For example, a user should be free to change "merge" to "replace" without having
            // their edits in Step 2 erased.
            $("#masterProtocol").change(this.changedMasterProtocol.bind(this));
            // Using "change" for these because it's more efficient AND because it works around an
            // irritating Chrome inconsistency
            // For some of these, changing them shouldn't actually affect processing until we implement
            // an overwrite-checking feature or something similar
            $(reProcessOnClick.join(',')).on('click', this.queueReconfigure.bind(this));
        }
        SelectMajorKindStep.prototype.queueReconfigure = function () {
            // Start a timer to wait before calling the routine that remakes the graph.
            // This way we're not bothering the user with the long redraw process when
            // they are making fast edits.
            if (this.inputRefreshTimerID) {
                clearTimeout(this.inputRefreshTimerID);
            }
            this.inputRefreshTimerID = setTimeout(this.reconfigure.bind(this), 5);
        };
        SelectMajorKindStep.prototype.reconfigure = function () {
            var stdLayout, trLayout, prLayout, mdvLayout, graph;
            stdLayout = $('#stdlayout');
            trLayout = $('#trlayout');
            prLayout = $('#prlayout');
            mdvLayout = $('#mdvlayout');
            graph = $('#graphDiv');
            // all need to exist, or page is broken
            if (![stdLayout, trLayout, prLayout, mdvLayout, graph].every(function (item) { return item.length !== 0; })) {
                console.log("Missing crucial page element, cannot run.");
                return;
            }
            if (stdLayout.prop('checked')) {
                this.interpretationMode = 'std';
            }
            else if (trLayout.prop('checked')) {
                this.interpretationMode = 'tr';
            }
            else if (prLayout.prop('checked')) {
                this.interpretationMode = 'pr';
            }
            else if (mdvLayout.prop('checked')) {
                this.interpretationMode = 'mdv';
            }
            else {
                // If none of them are checked - WTF?  Don't parse or change anything.
                return;
            }
            this.nextStepCallback();
        };
        SelectMajorKindStep.prototype.changedMasterProtocol = function () {
            var protocolIn, assayIn, currentAssays;
            // check master protocol
            protocolIn = $('#masterProtocol');
            var p = parseInt(protocolIn.val(), 10);
            if (this.masterProtocol === p) {
                // no change
                return;
            }
            this.masterProtocol = p;
            // check for master assay
            assayIn = $('#masterAssay').empty();
            $('<option>').text('(Create New)').appendTo(assayIn).val('new').prop('selected', true);
            currentAssays = ATData.existingAssays[protocolIn.val()] || [];
            currentAssays.forEach(function (id) {
                var assay = EDDData.Assays[id], line = EDDData.Lines[assay.lid], protocol = EDDData.Protocols[assay.pid];
                $('<option>').appendTo(assayIn).val('' + id).text([
                    line.name, protocol.name, assay.name].join('-'));
            });
            $('#masterLineSpan').removeClass('off');
            this.queueReconfigure();
        };
        return SelectMajorKindStep;
    })();
    EDDTableImport.SelectMajorKindStep = SelectMajorKindStep;
    // The class responsible for everything in the "Step 2" box that you see on the data import page.
    // Parse the raw data from typing or pasting in the input box, or a dragged-in file,
    // into a null-padded rectangular grid that can be easily used by the next step.
    var RawInputStep = (function () {
        function RawInputStep(selectMajorKindStep, nextStepCallback) {
            this.data = [];
            this.rowMarkers = [];
            this.transpose = false;
            this.userClickedOnTranspose = false;
            this.ignoreDataGaps = false;
            this.userClickedOnIgnoreDataGaps = false;
            this.separatorType = 'csv';
            this.inputRefreshTimerID = null;
            var t = this;
            $('#textData')
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
            console.log('setup dropzone call');
            Utl.FileDropZone.create("textData", this.processRawFileContent.bind(this), "/utilities/parsefile", this.processParsedFileContent.bind(this), false);
            this.selectMajorKindStep = selectMajorKindStep;
            this.nextStepCallback = nextStepCallback;
        }
        // In practice, the only time this will be called is when Step 1 changes,
        // which may call for a reconfiguration of the controls in this step.
        RawInputStep.prototype.previousStepChanged = function () {
            if (this.selectMajorKindStep.interpretationMode == 'mdv') {
                // We never ignore gaps, or transpose, for MDV documents
                this.setIgnoreGaps(false);
                this.setTranspose(false);
                // JBEI MDV format documents are always pasted in from Excel, so they're always tab-separated
                this.setSeparatorType('tab');
            }
            this.queueReprocessRawData();
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
            this.data = [];
            this.rowMarkers = [];
            // If we're in "mdv" mode, lock the delimiter to tabs
            if (mode === 'mdv') {
                this.setSeparatorType('tab');
            }
            delimiter = '\t';
            if (this.separatorType === 'csv') {
                delimiter = ',';
            }
            input = this.parseRawInput(delimiter, mode);
            if (mode === 'std' || mode === 'tr' || mode === 'pr') {
                // If the user hasn't deliberately chosen a setting for 'transpose', we will do
                // some analysis to attempt to guess which orientation the data needs to have.
                if (!this.userClickedOnTranspose) {
                    this.inferTransposeSetting(input.input);
                }
                // Now that that's done, move the data in
                if (this.transpose) {
                    // first row becomes Y-markers as-is
                    this.rowMarkers = input.input.shift() || [];
                    this.data = (input.input[0] || []).map(function (_, i) {
                        return input.input.map(function (row) { return row[i] || ''; });
                    });
                }
                else {
                    this.rowMarkers = [];
                    this.data = (input.input || []).map(function (row) {
                        _this.rowMarkers.push(row.shift());
                        return row;
                    });
                }
                // If the user hasn't deliberately chosen to ignore, or accept, gaps in the data,
                // do a basic analysis to guess which setting makes more sense.
                if (!this.userClickedOnIgnoreDataGaps) {
                    this.inferGapsSetting();
                }
                // Give labels to any header positions that got 'null' for a value.
                this.rowMarkers = this.rowMarkers.map(function (value) { return value || '?'; });
            }
            else if ((mode === "mdv") && (input.input.length > 1) && (input.columns > 1)) {
                this.processMdv(input.input);
            }
            this.nextStepCallback();
        };
        RawInputStep.prototype.processRawFileContent = function (fileType, result) {
            console.log(fileType);
            console.log('processing new file via processRawFileContent');
            if (fileType === 'text/xml') {
                $("#textData").val(result);
                this.inferSeparatorType();
                return true;
            }
            else if (fileType === 'text/csv') {
                $("#textData").val(result);
                this.inferSeparatorType();
                return true;
            }
        };
        RawInputStep.prototype.processParsedFileContent = function (result) {
            if (result.file_type == "xlsx") {
                var ws = result.file_data["worksheets"][0];
                console.log(ws);
                var table = ws[0];
                var csv = [];
                if (table.headers) {
                    csv.push(table.headers.join());
                }
                for (var i = 0; i < table.values.length; i++) {
                    csv.push(table.values[i].join());
                }
                this.setSeparatorType('csv');
                $("#textData").val(csv.join("\n"));
            }
            else if (result.file_type == "tab") {
                // If the type is deliberately set to tab, respect it.
                // otherwise, attempt to guess the setting.
                this.setSeparatorType('tab');
                $("#textData").val(result.file_data);
            }
            else {
                $("#textData").val(result.file_data);
                this.inferSeparatorType();
            }
            this.reprocessRawData();
        };
        RawInputStep.prototype.parseRawInput = function (delimiter, mode) {
            var rawText, longestRow, rows, multiColumn;
            rawText = $('#textData').val();
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
            this.data.forEach(function (row) {
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
            this.rowMarkers = ['Assay'];
            // The first row is our label collection
            this.data[0] = colLabels.slice(0);
            // push the rest of the rows generated from ordered list of compounds
            Array.prototype.push.apply(this.data, orderedComp.map(function (name) {
                var compound, row, colLookup;
                _this.rowMarkers.push(name);
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
                var text = $('#textData').val() || '', test;
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
            return this.data;
        };
        return RawInputStep;
    })();
    EDDTableImport.RawInputStep = RawInputStep;
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
            this.uniqueLineAssayNames = [];
            this.uniqueMeasurementNames = [];
            this.uniqueMetadataNames = [];
            // A flag to indicate whether we have seen any timestamps specified in the import data
            this.seenAnyTimestamps = false;
            this.selectMajorKindStep = selectMajorKindStep;
            this.nextStepCallback = nextStepCallback;
            $('#dataTableDiv')
                .on('mouseover mouseout', 'td', this.highlighterF.bind(this))
                .on('dblclick', 'td', this.singleValueDisablerF.bind(this));
            $('#resetEnabledFlagMarkers').on('click', this.resetEnabledFlagMarkers.bind(this));
        }
        IdentifyStructuresStep.prototype.previousStepChanged = function () {
            var _this = this;
            var mode = this.selectMajorKindStep.interpretationMode;
            var graph = $('#graphDiv');
            if (mode === 'std') {
                this.graphEnabled = true;
            }
            else {
                this.graphEnabled = false;
            }
            graph.toggleClass('off', !this.graphEnabled);
            var grid = this.rawInputStep.getGrid();
            var rowMarkers = this.rawInputStep.rowMarkers;
            var ignoreDataGaps = this.rawInputStep.ignoreDataGaps;
            if (mode === 'std' || mode === 'tr' || mode === 'pr') {
                rowMarkers.forEach(function (value, i) {
                    var type;
                    if (!_this.pulldownUserChangedFlags[i]) {
                        type = _this.figureOutThisRowsDataType(mode, value, grid[i] || []);
                        _this.pulldownSettings[i] = type;
                    }
                });
            }
            // Create a map of enabled/disabled flags for our data,
            // but only fill the areas that do not already exist.
            this.inferActiveFlags(grid);
            // Construct table cell objects for the page, based on our extracted data
            this.constructDataTable(mode, grid, rowMarkers);
            // Interpret the data in Step 3,
            // which involves skipping disabled rows or columns,
            // optionally ignoring blank values,
            // and leaving out any values that have been individually flagged.
            this.interpretDataTable();
            // Update the styles of the new table to reflect the
            // (possibly previously set) flag markers and the "ignore gaps" setting.
            this.redrawIgnoredValueMarkers(ignoreDataGaps);
            this.redrawEnabledFlagMarkers();
            // Start a delay timer that redraws the graph from the interpreted data.
            // This is rather resource intensive, so we're delaying a bit, and restarting the delay
            // if the user makes additional edits to the data within the delay period.
            this.queueGraphRemake();
            this.nextStepCallback();
        };
        // TODO: Get rid of the magic numbers used here.
        IdentifyStructuresStep.prototype.figureOutThisRowsDataType = function (mode, label, row) {
            var blank, strings, condensed;
            if (mode == 'tr') {
                if (label.match(/gene/i)) {
                    return 10;
                }
                if (label.match(/rpkm/i)) {
                    return 11;
                }
                // If we can't match to the above two, set the row to 'undefined' so it's ignored by default
                return 0;
            }
            // Take care of some braindead guesses
            if (label.match(/assay/i) || label.match(/line/i)) {
                return 1;
            }
            if (mode == 'pr') {
                if (label.match(/protein/i)) {
                    return 12;
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
                return 3;
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
        IdentifyStructuresStep.prototype.constructDataTable = function (mode, grid, rowMarkers) {
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
                            ['Gene Names', 10],
                            ['RPKM Values', 11]
                        ]
                    ]
                ];
            }
            else if (mode === 'pr') {
                pulldownOptions = [
                    ['--', 0],
                    ['Entire Row Is...', [
                            ['Assay/Line Names', 1],
                        ]
                    ],
                    ['First Column Is...', [
                            ['Protein Name', 12]
                        ]
                    ]
                ];
            }
            else {
                pulldownOptions = [
                    ['--', 0],
                    ['Entire Row Is...', [
                            ['Assay/Line Names', 1],
                            ['Metabolite Names', 2]
                        ]
                    ],
                    ['First Column Is...', [
                            ['Timestamp', 3],
                            ['Metadata Name', 4],
                            ['Metabolite Name', 5]
                        ]
                    ]
                ];
            }
            // Remove and replace the table in the document
            $('#dataTableDiv').empty();
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
                $('<div>').text(rowMarkers[i]).appendTo(cell);
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
                if (pulldown === 1 || pulldown === 2) {
                    hlRow = true;
                }
                else if (3 <= pulldown && pulldown <= 5) {
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
        IdentifyStructuresStep.prototype.interpretDataTableRows = function (grid) {
            var _this = this;
            var single = 0, nonSingle = 0, earliestName;
            // Look for the presence of "single measurement type" rows, and rows of all other single-item types
            grid.forEach(function (_, y) {
                var pulldown;
                if (_this.activeRowFlags[y]) {
                    pulldown = _this.pulldownSettings[y];
                    if (pulldown === 5 || pulldown === 12) {
                        single++; // Single Measurement Name or Single Protein Name
                    }
                    else if (pulldown === 4 || pulldown === 3) {
                        nonSingle++;
                    }
                    else if (pulldown === 1 && earliestName === undefined) {
                        earliestName = y;
                    }
                }
            });
            // Only use this mode if the table is entirely free of single-timestamp and
            // single-metadata rows, and has at least one "single measurement" row, and at
            // least one "Assay/Line names" row.
            // Note: requirement of an "Assay/Line names" row prevents this mode from being
            // enabled when the page is in 'Transcription' mode.
            return [(single > 0 && nonSingle === 0 && earliestName !== undefined), earliestName];
        };
        IdentifyStructuresStep.prototype.changedRowDataTypePulldown = function (index, value) {
            var _this = this;
            var selected;
            var grid = this.rawInputStep.getGrid();
            // The value does not necessarily match the selectedIndex.
            selected = this.pulldownObjects[index].selectedIndex;
            this.pulldownSettings[index] = value;
            this.pulldownUserChangedFlags[index] = true;
            if ((value >= 3 && value <= 5) || value === 12) {
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
                    if (value === 5) {
                        if (c === 3 || c === 4) {
                            _this.pulldownObjects[i].selectedIndex = 0;
                            _this.pulldownSettings[i] = 0;
                        }
                        else if (c === 2) {
                            _this.pulldownObjects[i].selectedIndex = 1;
                            _this.pulldownSettings[i] = 1;
                        }
                    }
                    else if ((value === 3 || value === 4) && c === 5) {
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
            var grid = this.rawInputStep.getGrid();
            var rowMarkers = this.rawInputStep.rowMarkers;
            var ignoreDataGaps = this.rawInputStep.ignoreDataGaps;
            // We'll be accumulating these for disambiguation.
            // Each unique key will get a distinct value, placing it in the order first seen
            var seenAssayLineNames = {};
            var seenMeasurementNames = {};
            var seenMetadataNames = {};
            // Here's how we track the indexes we assign as values above.
            var assayLineNamesCount = 0;
            var measurementNamesCount = 0;
            var metadataNamesCount = 0;
            // Here are the arrays we will use later
            this.parsedSets = [];
            this.uniqueLineAssayNames = [];
            this.uniqueMeasurementNames = [];
            this.uniqueMetadataNames = [];
            this.seenAnyTimestamps = false;
            // This mode means we make a new "set" for each cell in the table, rather than
            // the standard method of making a new "set" for each column in the table.
            var interpretMode = this.interpretDataTableRows(grid);
            // The standard method: Make a "set" for each column of the table
            if (!interpretMode[0]) {
                this.colObjects.forEach(function (_, c) {
                    var set, uniqueTimes, times, foundMeta;
                    // Skip it if the whole column is deactivated
                    if (!_this.activeColFlags[c]) {
                        return;
                    }
                    set = {
                        // For the graphing module
                        'label': 'Column ' + c,
                        'name': 'Column ' + c,
                        'units': 'units',
                        // For submission to the database
                        'parsingIndex': c,
                        'assay': null,
                        'assayName': null,
                        'measurementType': null,
                        'metadata': {},
                        'singleData': null,
                        // For both
                        'data': []
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
                        label = rowMarkers[r] || '';
                        value = row[c] || '';
                        if (!pulldown) {
                            return;
                        }
                        else if (pulldown === 11) {
                            value = value.replace(/,/g, '');
                            if (value) {
                                set.singleData = value;
                            }
                            return;
                        }
                        else if (pulldown === 10) {
                            if (value) {
                                set.name = value;
                                set.measurementType = value;
                            }
                            return;
                        }
                        else if (pulldown === 3) {
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
                        else if (pulldown === 1) {
                            // If haven't seen value before, increment and store uniqueness index
                            if (!seenAssayLineNames[value]) {
                                seenAssayLineNames[value] = ++assayLineNamesCount;
                                _this.uniqueLineAssayNames.push(value);
                            }
                            set.assay = seenAssayLineNames[value];
                            set.assayName = value;
                            return;
                        }
                        else if (pulldown === 2) {
                            // If haven't seen value before, increment and store uniqueness index
                            if (!seenMeasurementNames[value]) {
                                seenMeasurementNames[value] = ++measurementNamesCount;
                                _this.uniqueMeasurementNames.push(value);
                            }
                            set.measurementType = seenMeasurementNames[value];
                            return;
                        }
                        else if (pulldown === 4) {
                            if (!seenMetadataNames[label]) {
                                seenMetadataNames[label] = ++metadataNamesCount;
                                _this.uniqueMetadataNames.push(label);
                            }
                            set.metadata[seenMetadataNames[label]] = value;
                            foundMeta = true;
                        }
                    });
                    uniqueTimes.sort(function (a, b) { return a - b; }).forEach(function (time) {
                        set.data.push([time, times[time]]);
                    });
                    // only save if accumulated some data or metadata
                    if (uniqueTimes.length || foundMeta || set.singleData !== null) {
                        _this.parsedSets.push(set);
                    }
                });
            }
            else {
                this.colObjects.forEach(function (_, c) {
                    var cellValue, set;
                    if (!_this.activeColFlags[c]) {
                        return;
                    }
                    cellValue = grid[interpretMode[1]][c] || '';
                    if (cellValue) {
                        // If haven't seen cellValue before, increment and store uniqueness index
                        if (!seenAssayLineNames[cellValue]) {
                            seenAssayLineNames[cellValue] = ++assayLineNamesCount;
                            _this.uniqueLineAssayNames.push(cellValue);
                        }
                        grid.forEach(function (row, r) {
                            var pulldown, label, value, timestamp;
                            if (!_this.activeRowFlags[r] || !_this.activeFlags[r][c]) {
                                return;
                            }
                            pulldown = _this.pulldownSettings[r];
                            label = rowMarkers[r] || '';
                            value = row[c] || '';
                            if (!pulldown || !(pulldown === 5 || pulldown === 12) || !label || !value) {
                                return;
                            }
                            set = {
                                // For the graphing module (which we won't be using in this mode, actually)
                                'label': 'Column ' + c + ' row ' + r,
                                'name': 'Column ' + c + ' row ' + r,
                                'units': 'units',
                                // For submission to the database
                                'parsingIndex': _this.parsedSets.length,
                                'assay': seenAssayLineNames[cellValue],
                                'assayName': cellValue,
                                'measurementType': null,
                                'metadata': {},
                                'singleData': value,
                                // For both
                                'data': []
                            };
                            if (pulldown === 5) {
                                if (!seenMeasurementNames[label]) {
                                    seenMeasurementNames[label] = ++measurementNamesCount;
                                    _this.uniqueMeasurementNames.push(label);
                                }
                                set.measurementType = seenMeasurementNames[label];
                            }
                            else if (pulldown === 12) {
                                set.name = label;
                                set.measurementType = label;
                            }
                            _this.parsedSets.push(set);
                        });
                    }
                });
            }
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
            if (cell.length) {
                x = parseInt(cell.attr('x'), 10);
                y = parseInt(cell.attr('y'), 10);
                if (x && y && x > 0 && y > 0) {
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
                }
            }
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
            var sets = this.parsedSets;
            // If we're not in this mode, drawing a graph is nonsensical.
            if (mode === "std") {
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
            this.assayLineObjSets = {};
            this.currentlyVisibleAssayLineObjSets = [];
            this.measurementObjSets = {};
            this.currentlyVisibleMeasurementObjSets = [];
            this.metadataObjSets = {};
            this.autoCompUID = 0;
            this.autoCache = {
                comp: {},
                meta: {},
                unit: {},
                metabolite: {}
            };
            this.selectMajorKindStep = selectMajorKindStep;
            this.identifyStructuresStep = identifyStructuresStep;
            this.nextStepCallback = nextStepCallback;
            var reDoLastStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType', '#masterMUnits'];
            $(reDoLastStepOnChange.join(',')).on('change', this.changedAMasterPulldown.bind(this));
            $('#resetDisambiguationFields').on('click', this.resetDisambiguationFields.bind(this));
            // enable autocomplete on statically defined fields
            EDD_auto.setup_field_autocomplete('#masterMComp', 'MeasurementCompartment');
            EDD_auto.setup_field_autocomplete('#masterMType', 'GenericOrMetabolite', EDDData.MetaboliteTypes || {});
            EDD_auto.setup_field_autocomplete('#masterMUnits', 'MeasurementUnit');
        }
        TypeDisambiguationStep.prototype.previousStepChanged = function () {
            this.reconfigure();
        };
        // Create the Step 4 table:  A set of rows, one for each y-axis column of data,
        // where the user can fill out additional information for the pasted table.
        TypeDisambiguationStep.prototype.reconfigure = function () {
            var mode = this.selectMajorKindStep.interpretationMode;
            var masterP = this.selectMajorKindStep.masterProtocol; // Shout-outs to a mid-grade rapper
            var parsedSets = this.identifyStructuresStep.parsedSets;
            var seenAnyTimestamps = this.identifyStructuresStep.seenAnyTimestamps;
            var uniqueMeasurementNames = this.identifyStructuresStep.uniqueMeasurementNames;
            var uniqueMetadataNames = this.identifyStructuresStep.uniqueMetadataNames;
            // Initially hide all the Step 4 master pulldowns so we can reveal just the ones we need later
            $('#masterAssayLineDiv').addClass('off');
            $('#masterMTypeDiv').addClass('off');
            $('#disambiguateLinesAssaysSection').addClass('off');
            $('#disambiguateMeasurementsSection').addClass('off');
            $('#disambiguateMetadataSection').addClass('off');
            $('#disambiguateAssaysTable').remove();
            $('#disambiguateMeasurementsTable').remove();
            $('#disambiguateMetadataTable').remove();
            // If no sets to show, leave the area blank and show the 'enter some data!' banner
            if (parsedSets.length === 0) {
                $('#emptyDisambiguationLabel').removeClass('off');
                return;
            }
            $('#emptyDisambiguationLabel').addClass('off');
            // If parsed data exists, but haven't seen a single timestamp show the "master timestamp" UI.
            $('#masterTimestampDiv').toggleClass('off', seenAnyTimestamps);
            // If we have no Assays/Lines detected for disambiguation, ask the user to select one.
            this.remakeAssayLineSection(this.selectMajorKindStep.masterProtocol);
            // If in 'Transcription' or 'Proteomics' mode, there are no measurement types involved.
            // skip the measurement section, and provide statistics about the gathered records.
            if (mode === "tr" || mode === "pr") {
            }
            else if (uniqueMeasurementNames.length === 0 && seenAnyTimestamps) {
                // no measurements for disambiguation, have timestamp data => ask the user to select one
                $('#masterMTypeDiv').removeClass('off');
            }
            else {
                // have measurement types, in approprate mode, remake measurement section
                this.remakeMeasurementSection();
            }
            // If we've detected any metadata types for disambiguation, create a section
            if (uniqueMetadataNames.length > 0) {
                this.remakeMetadataSection();
            }
            this.nextStepCallback();
        };
        // TODO: This function should reset all the disambiguation fields to the values
        // that were auto-detected in the last refresh of the object.
        TypeDisambiguationStep.prototype.resetDisambiguationFields = function () {
            // Get to work!!
        };
        TypeDisambiguationStep.prototype.remakeAssayLineSection = function (masterP) {
            var _this = this;
            var table, body;
            var uniqueLineAssayNames = this.identifyStructuresStep.uniqueLineAssayNames;
            if (uniqueLineAssayNames.length === 0) {
                $('#masterAssayLineDiv').removeClass('off');
            }
            else {
                // Otherwise, put together a disambiguation section for Assays/Lines
                // Keep a separate set of correlations between string and pulldowns for each
                // Protocol, since same string can match different Assays, and the pulldowns
                // will have different content, in each Protocol.
                this.assayLineObjSets[masterP] = {};
                this.currentlyVisibleAssayLineObjSets = [];
                var t = this;
                table = $('<table>')
                    .attr({ 'id': 'disambiguateAssaysTable', 'cellspacing': 0 })
                    .appendTo($('#disambiguateLinesAssaysSection').removeClass('off'))
                    .on('change', 'select', function (ev) {
                    t.userChangedAssayLineDisam(ev.target);
                })[0];
                body = $('<tbody>').appendTo(table)[0];
                uniqueLineAssayNames.forEach(function (name, i) {
                    var disam, row, defaultSel, cell, aSelect, lSelect;
                    disam = _this.assayLineObjSets[masterP][name];
                    if (!disam) {
                        disam = {};
                        defaultSel = _this.disambiguateAnAssayOrLine(name, i);
                        // First make a table row, and save a reference to it
                        disam.rowObj = row = body.insertRow();
                        // Next, add a table cell with the string we are disambiguating
                        $('<div>').text(name).appendTo(row.insertCell());
                        // Now build another table cell that will contain the pulldowns
                        cell = $(row.insertCell()).css('text-align', 'left');
                        aSelect = $('<select>').appendTo(cell)
                            .data({ 'setByUser': false, 'visibleIndex': i })
                            .attr('name', 'disamAssay' + (i + 1));
                        disam.assayObj = aSelect[0];
                        $('<option>').text('(Create New)').appendTo(aSelect).val('new')
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
                            .attr('name', 'disamLine' + (i + 1));
                        disam.lineObj = lSelect[0];
                        $('<option>').text('(Create New)').appendTo(lSelect).val('new')
                            .prop('selected', !defaultSel.lineID);
                        // ATData.existingLines is of type {id: number; n: string;}[]
                        (ATData.existingLines || []).forEach(function (line) {
                            $('<option>').text(line.n).appendTo(lSelect).val(line.id.toString())
                                .prop('selected', defaultSel.lineID === line.id);
                        });
                        _this.assayLineObjSets[masterP][name] = disam;
                    }
                    $(disam.rowObj).appendTo(body);
                    _this.currentlyVisibleAssayLineObjSets.push(disam);
                });
            }
        };
        TypeDisambiguationStep.prototype.remakeMeasurementSection = function () {
            var _this = this;
            var table, body, row;
            var mode = this.selectMajorKindStep.interpretationMode;
            var uniqueMeasurementNames = this.identifyStructuresStep.uniqueMeasurementNames;
            // put together a disambiguation section for measurement types
            var t = this;
            table = $('<table>')
                .attr({ 'id': 'disambiguateMeasurementsTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateMeasurementsSection').removeClass('off'))
                .on('change', 'input[type=hidden]', function (ev) {
                // only watch for changes on the hidden portion, let autocomplete work
                t.userChangedMeasurementDisam(ev.target);
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            // Headers for the table
            row = body.insertRow();
            $('<th>').attr({ 'colspan': 2 }).css('text-align', 'right').text('Compartment').appendTo(row);
            $('<th>').text('Type').appendTo(row);
            $('<th>').text(mode === 'std' ? 'Units' : '').appendTo(row);
            // Done with headers row
            this.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
            uniqueMeasurementNames.forEach(function (name, i) {
                var disam;
                disam = _this.measurementObjSets[name];
                if (disam && disam.rowObj) {
                    $(disam.rowObj).appendTo(body);
                }
                else {
                    disam = {};
                    disam.rowObj = row = body.insertRow();
                    $('<div>').text(name).appendTo(row.insertCell());
                    ['compObj', 'typeObj', 'unitsObj'].forEach(function (auto) {
                        var cell = $(row.insertCell()).addClass('disamDataCell');
                        disam[auto] = EDD_auto.create_autocomplete(cell).data('type', auto);
                    });
                    _this.measurementObjSets[name] = disam;
                }
                // TODO sizing should be handled in CSS
                disam.compObj.attr('size', 4).data('visibleIndex', i)
                    .next().attr('name', 'disamMComp' + (i + 1));
                EDD_auto.setup_field_autocomplete(disam.compObj, 'MeasurementCompartment', _this.autoCache.comp);
                disam.typeObj.attr('size', 45).data('visibleIndex', i)
                    .next().attr('name', 'disamMType' + (i + 1));
                EDD_auto.setup_field_autocomplete(disam.typeObj, 'GenericOrMetabolite', _this.autoCache.metabolite);
                EDD_auto.initial_search(disam.typeObj, name);
                disam.unitsObj.attr('size', 10).data('visibleIndex', i)
                    .next().attr('name', 'disamMUnits' + (i + 1));
                EDD_auto.setup_field_autocomplete(disam.unitsObj, 'MeasurementUnit', _this.autoCache.unit);
                // If we're in MDV mode, the units pulldowns are irrelevant.
                disam.unitsObj.toggleClass('off', mode === 'mdv');
            });
            this.checkAllMeasurementCompartmentDisam();
        };
        TypeDisambiguationStep.prototype.remakeMetadataSection = function () {
            var _this = this;
            var table, body, row;
            var uniqueMetadataNames = this.identifyStructuresStep.uniqueMetadataNames;
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
                if (disam && disam.rowObj) {
                    $(disam.rowObj).appendTo(body);
                }
                else {
                    disam = {};
                    disam.rowObj = row = body.insertRow();
                    $('<div>').text(name).appendTo(row.insertCell());
                    disam.metaObj = EDD_auto.create_autocomplete(row.insertCell()).val(name);
                    _this.metadataObjSets[name] = disam;
                }
                disam.metaObj.attr('name', 'disamMeta' + (i + 1)).addClass('autocomp_altype')
                    .next().attr('name', 'disamMetaHidden' + (i + 1));
                EDD_auto.setup_field_autocomplete(disam.metaObj, 'AssayLineMetadataType', _this.autoCache.meta);
            });
        };
        // We call this when any of the 'master' pulldowns are changed in Step 4.
        // Such changes may affect the available contents of some of the pulldowns in the step.
        TypeDisambiguationStep.prototype.changedAMasterPulldown = function () {
            // Show the master line dropdown if the master assay dropdown is set to new
            $('#masterLineSpan').toggleClass('off', $('#masterAssay').val() !== 'new');
            this.reconfigure();
        };
        // This function serves two purposes.
        // 1. If the given Assay disambiguation pulldown is being set to 'new', reveal the adjacent
        //    Line pulldown, otherwise hide it.
        // 2. If the pulldown is being set to 'new', walk down the remaining pulldowns in the section,
        //    in order, setting them to 'new' as well, stopping just before any pulldown marked as
        //    being 'set by the user'.
        TypeDisambiguationStep.prototype.userChangedAssayLineDisam = function (assayEl) {
            var changed, v;
            changed = $(assayEl).data('setByUser', true);
            // The span with the corresponding Line pulldown is always right next to the Assay pulldown
            changed.next().toggleClass('off', changed.val() !== 'new');
            if (changed.val() !== 'new') {
                // stop here for anything other than 'new'; only 'new' cascades to following pulldowns
                return false;
            }
            v = changed.data('visibleIndex') || 0;
            this.currentlyVisibleAssayLineObjSets.slice(v).forEach(function (obj) {
                var select = $(obj.assayObj);
                if (select.data('setByUser')) {
                    return;
                }
                // set dropdown to 'new' and reveal the line pulldown
                select.val('new').next().removeClass('off');
            });
            return false;
        };
        TypeDisambiguationStep.prototype.userChangedMeasurementDisam = function (element) {
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
                var hidden = obj.compObj.next();
                if (obj.compObj.data('setByUser') || (hidden.val() && hidden.val() !== '0')) {
                    return true;
                }
                return false;
            });
            $('#noCompartmentWarning').toggleClass('off', mode !== 'mdv' && allSet);
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
        return TypeDisambiguationStep;
    })();
    EDDTableImport.TypeDisambiguationStep = TypeDisambiguationStep;
})(EDDTableImport || (EDDTableImport = {}));
$(window).load(function () {
    EDDTableImport.onWindowLoad();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzYXlUYWJsZURhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJBc3NheVRhYmxlRGF0YS50cyJdLCJuYW1lcyI6WyJFRERUYWJsZUltcG9ydCIsIkVERFRhYmxlSW1wb3J0Lm9uV2luZG93TG9hZCIsIkVERFRhYmxlSW1wb3J0Lm9uUmVmZXJlbmNlUmVjb3Jkc0xvYWQiLCJFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRDYWxsYmFjayIsIkVERFRhYmxlSW1wb3J0LnJhd0lucHV0Q2FsbGJhY2siLCJFRERUYWJsZUltcG9ydC5pZGVudGlmeVN0cnVjdHVyZXNDYWxsYmFjayIsIkVERFRhYmxlSW1wb3J0LnR5cGVEaXNhbWJpZ3VhdGlvbkNhbGxiYWNrIiwiRUREVGFibGVJbXBvcnQuc3VibWl0Rm9ySW1wb3J0IiwiRUREVGFibGVJbXBvcnQuZGlzY2xvc2UiLCJFRERUYWJsZUltcG9ydC5TZWxlY3RNYWpvcktpbmRTdGVwIiwiRUREVGFibGVJbXBvcnQuU2VsZWN0TWFqb3JLaW5kU3RlcC5jb25zdHJ1Y3RvciIsIkVERFRhYmxlSW1wb3J0LlNlbGVjdE1ham9yS2luZFN0ZXAucXVldWVSZWNvbmZpZ3VyZSIsIkVERFRhYmxlSW1wb3J0LlNlbGVjdE1ham9yS2luZFN0ZXAucmVjb25maWd1cmUiLCJFRERUYWJsZUltcG9ydC5TZWxlY3RNYWpvcktpbmRTdGVwLmNoYW5nZWRNYXN0ZXJQcm90b2NvbCIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcCIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5jb25zdHJ1Y3RvciIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnF1ZXVlUmVwcm9jZXNzUmF3RGF0YSIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5yZXByb2Nlc3NSYXdEYXRhIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnByb2Nlc3NSYXdGaWxlQ29udGVudCIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5wcm9jZXNzUGFyc2VkRmlsZUNvbnRlbnQiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAucGFyc2VSYXdJbnB1dCIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5pbmZlclRyYW5zcG9zZVNldHRpbmciLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuaW5mZXJHYXBzU2V0dGluZyIsIkVERFRhYmxlSW1wb3J0LlJhd0lucHV0U3RlcC5wcm9jZXNzTWR2IiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnBhc3RlZFJhd0RhdGEiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuaW5mZXJTZXBhcmF0b3JUeXBlIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnNldElnbm9yZUdhcHMiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuc2V0VHJhbnNwb3NlIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnNldFNlcGFyYXRvclR5cGUiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuY2xpY2tlZE9uSWdub3JlRGF0YUdhcHMiLCJFRERUYWJsZUltcG9ydC5SYXdJbnB1dFN0ZXAuY2xpY2tlZE9uVHJhbnNwb3NlIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLnN1cHByZXNzTm9ybWFsVGFiIiwiRUREVGFibGVJbXBvcnQuUmF3SW5wdXRTdGVwLmdldEdyaWQiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5jb25zdHJ1Y3RvciIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAucHJldmlvdXNTdGVwQ2hhbmdlZCIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZSIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuaW5mZXJBY3RpdmVGbGFncyIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuY29uc3RydWN0RGF0YVRhYmxlIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wb3B1bGF0ZVB1bGxkb3duIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5yZWRyYXdJZ25vcmVkVmFsdWVNYXJrZXJzIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLmludGVycHJldERhdGFUYWJsZVJvd3MiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLmNoYW5nZWRSb3dEYXRhVHlwZVB1bGxkb3duIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC50b2dnbGVUYWJsZVJvdyIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAudG9nZ2xlVGFibGVDb2x1bW4iLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzIiwiRUREVGFibGVJbXBvcnQuSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5pbnRlcnByZXREYXRhVGFibGUiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLmhpZ2hsaWdodGVyRiIsIkVERFRhYmxlSW1wb3J0LklkZW50aWZ5U3RydWN0dXJlc1N0ZXAuc2luZ2xlVmFsdWVEaXNhYmxlckYiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLnF1ZXVlR3JhcGhSZW1ha2UiLCJFRERUYWJsZUltcG9ydC5JZGVudGlmeVN0cnVjdHVyZXNTdGVwLnJlbWFrZUdyYXBoQXJlYSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAiLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLmNvbnN0cnVjdG9yIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5yZWNvbmZpZ3VyZSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucmVzZXREaXNhbWJpZ3VhdGlvbkZpZWxkcyIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucmVtYWtlQXNzYXlMaW5lU2VjdGlvbiIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAucmVtYWtlTWVhc3VyZW1lbnRTZWN0aW9uIiwiRUREVGFibGVJbXBvcnQuVHlwZURpc2FtYmlndWF0aW9uU3RlcC5yZW1ha2VNZXRhZGF0YVNlY3Rpb24iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLmNoYW5nZWRBTWFzdGVyUHVsbGRvd24iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLnVzZXJDaGFuZ2VkQXNzYXlMaW5lRGlzYW0iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLnVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbSIsIkVERFRhYmxlSW1wb3J0LlR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW0iLCJFRERUYWJsZUltcG9ydC5UeXBlRGlzYW1iaWd1YXRpb25TdGVwLmRpc2FtYmlndWF0ZUFuQXNzYXlPckxpbmUiXSwibWFwcGluZ3MiOiJBQUFBLGdEQUFnRDtBQUNoRCxxREFBcUQ7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QUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUMzQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLENBQUNBO2dCQUNEQSxJQUFJQSxHQUFHQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQTtnQkFDMUJBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLEtBQWFBLEVBQUVBLENBQVNBLEVBQUVBLENBQVdBO29CQUM5Q0EsSUFBSUEsQ0FBU0EsQ0FBQ0E7b0JBQ2RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO3dCQUNSQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDNUNBLENBQUNBO29CQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQzNCQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQTt3QkFDZkEsQ0FBQ0E7d0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBOzRCQUN0Q0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7d0JBQ2ZBLENBQUNBO3dCQUNEQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDZkEsQ0FBQ0E7b0JBQ0RBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNiQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDSEEsTUFBTUEsQ0FBQ0EsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDOUJBLENBQUNB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QTtvQkFDdEJBLElBQUlBLENBQUNBLEdBQVdBLEtBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3pDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ3JCQSxLQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxhQUFhQSxHQUFHQSxDQUFDQSxDQUFDQTs0QkFDMUNBLEtBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2pDQSxDQUFDQTt3QkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ2pCQSxLQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxhQUFhQSxHQUFHQSxDQUFDQSxDQUFDQTs0QkFDMUNBLEtBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2pDQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLElBQUlBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNqREEsS0FBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsYUFBYUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQzFDQSxLQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUNqQ0EsQ0FBQ0E7Z0JBQ0xB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IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBNb24gRmViIDAxIDIwMTYgMTY6MTM6NDcgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG5cblxuZGVjbGFyZSB2YXIgQVREYXRhOiBhbnk7IC8vIFNldHVwIGJ5IHRoZSBzZXJ2ZXIuXG5kZWNsYXJlIHZhciBFRERBVERHcmFwaGluZzogYW55O1xuZGVjbGFyZSB2YXIgRUREX2F1dG86IGFueTtcblxuXG4vLyBUeXBlIG5hbWUgZm9yIHRoZSBncmlkIG9mIHZhbHVlcyBwYXN0ZWQgaW5cbmludGVyZmFjZSBSYXdJbnB1dCBleHRlbmRzIEFycmF5PHN0cmluZ1tdPiB7IH1cbi8vIHR5cGUgZm9yIHRoZSBzdGF0cyBnZW5lcmF0ZWQgZnJvbSBwYXJzaW5nIGlucHV0IHRleHRcbmludGVyZmFjZSBSYXdJbnB1dFN0YXQge1xuICAgIGlucHV0OiBSYXdJbnB1dDtcbiAgICBjb2x1bW5zOiBudW1iZXI7XG59XG5cblxubW9kdWxlIEVERFRhYmxlSW1wb3J0IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBleHBvcnQgdmFyIHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXA7XG4gICAgZXhwb3J0IHZhciByYXdJbnB1dFN0ZXA6IFJhd0lucHV0U3RlcDtcbiAgICBleHBvcnQgdmFyIGlkZW50aWZ5U3RydWN0dXJlc1N0ZXA6IElkZW50aWZ5U3RydWN0dXJlc1N0ZXA7XG4gICAgZXhwb3J0IHZhciB0eXBlRGlzYW1iaWd1YXRpb25TdGVwOiBUeXBlRGlzYW1iaWd1YXRpb25TdGVwO1xuXG5cbiAgICAvLyBBcyBzb29uIGFzIHRoZSB3aW5kb3cgbG9hZCBzaWduYWwgaXMgc2VudCwgY2FsbCBiYWNrIHRvIHRoZSBzZXJ2ZXIgZm9yIHRoZSBzZXQgb2YgcmVmZXJlbmNlIHJlY29yZHNcbiAgICAvLyB0aGF0IHdpbGwgYmUgdXNlZCB0byBkaXNhbWJpZ3VhdGUgbGFiZWxzIGluIGltcG9ydGVkIGRhdGEuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uV2luZG93TG9hZCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIGF0ZGF0YV91cmwgPSBcIi9zdHVkeS9cIiArIEVERERhdGEuY3VycmVudFN0dWR5SUQgKyBcIi9hc3NheWRhdGFcIjtcblxuICAgICAgICAkKCcuZGlzY2xvc2UnKS5maW5kKCdhLmRpc2Nsb3NlTGluaycpLm9uKCdjbGljaycsIEVERFRhYmxlSW1wb3J0LmRpc2Nsb3NlKTtcblxuICAgICAgICAvLyBQb3B1bGF0ZSBBVERhdGEgYW5kIEVERERhdGEgb2JqZWN0cyB2aWEgQUpBWCBjYWxsc1xuICAgICAgICBqUXVlcnkuYWpheChhdGRhdGFfdXJsLCB7XG4gICAgICAgICAgICBcInN1Y2Nlc3NcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgIEFURGF0YSA9IGRhdGEuQVREYXRhO1xuICAgICAgICAgICAgICAgICQuZXh0ZW5kKEVERERhdGEsIGRhdGEuRURERGF0YSk7XG4gICAgICAgICAgICAgICAgRUREVGFibGVJbXBvcnQub25SZWZlcmVuY2VSZWNvcmRzTG9hZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KS5mYWlsKGZ1bmN0aW9uKHgsIHMsIGUpIHtcbiAgICAgICAgICAgIGFsZXJ0KHMpO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIEFzIHNvb24gYXMgd2UndmUgZ290IGFuZCBwYXJzZWQgdGhlIHJlZmVyZW5jZSBkYXRhLCB3ZSBjYW4gc2V0IHVwIGFsbCB0aGUgY2FsbGJhY2tzIGZvciB0aGUgVUksXG4gICAgLy8gZWZmZWN0aXZlbHkgdHVybmluZyB0aGUgcGFnZSBcIm9uXCIuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uUmVmZXJlbmNlUmVjb3Jkc0xvYWQoKTogdm9pZCB7XG5cbiAgICAgICAgdmFyIGEgPSBuZXcgU2VsZWN0TWFqb3JLaW5kU3RlcChFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRDYWxsYmFjayk7XG4gICAgICAgIHZhciBiID0gbmV3IFJhd0lucHV0U3RlcChhLCBFRERUYWJsZUltcG9ydC5yYXdJbnB1dENhbGxiYWNrKTtcbiAgICAgICAgdmFyIGMgPSBuZXcgSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcChhLCBiLCBFRERUYWJsZUltcG9ydC5pZGVudGlmeVN0cnVjdHVyZXNDYWxsYmFjayk7XG4gICAgICAgIHZhciBkID0gbmV3IFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAoYSwgYywgRUREVGFibGVJbXBvcnQudHlwZURpc2FtYmlndWF0aW9uQ2FsbGJhY2spO1xuXG4gICAgICAgIEVERFRhYmxlSW1wb3J0LnNlbGVjdE1ham9yS2luZFN0ZXAgPSBhO1xuICAgICAgICBFRERUYWJsZUltcG9ydC5yYXdJbnB1dFN0ZXAgPSBiO1xuICAgICAgICBFRERUYWJsZUltcG9ydC5pZGVudGlmeVN0cnVjdHVyZXNTdGVwID0gYztcbiAgICAgICAgRUREVGFibGVJbXBvcnQudHlwZURpc2FtYmlndWF0aW9uU3RlcCA9IGQ7XG5cbiAgICAgICAgJCgnI3N1Ym1pdEZvckltcG9ydCcpLm9uKCdjbGljaycsIEVERFRhYmxlSW1wb3J0LnN1Ym1pdEZvckltcG9ydCk7XG5cbiAgICAgICAgLy8gV2UgbmVlZCB0byBtYW51YWxseSB0cmlnZ2VyIHRoaXMsIGFmdGVyIGFsbCBvdXIgc3RlcHMgYXJlIGNvbnN0cnVjdGVkLlxuICAgICAgICAvLyBUaGlzIHdpbGwgY2FzY2FkZSBjYWxscyB0aHJvdWdoIHRoZSByZXN0IG9mIHRoZSBzdGVwcyBhbmQgY29uZmlndXJlIHRoZW0gdG9vLlxuICAgICAgICBhLmNoYW5nZWRNYXN0ZXJQcm90b2NvbCgpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYnkgb3VyIGluc3RhbmNlIG9mIHNlbGVjdE1ham9yS2luZFN0ZXAgdG8gYW5ub3VuY2UgY2hhbmdlcy5cbiAgICBleHBvcnQgZnVuY3Rpb24gc2VsZWN0TWFqb3JLaW5kQ2FsbGJhY2soKTogdm9pZCB7XG4gICAgICAgIGlmIChFRERUYWJsZUltcG9ydC5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSA9PSAnbWR2Jykge1xuICAgICAgICAgICAgLy8gVE9ETzogVGhlcmUgaGFzIGdvdCB0byBiZSBhIGJldHRlciB3YXkgdG8gaGFuZGxlIHRoaXNcbiAgICAgICAgICAgIEVERFRhYmxlSW1wb3J0LmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucHVsbGRvd25TZXR0aW5ncyA9IFsxLCA1XTsgLy8gQSBkZWZhdWx0IHNldCBvZiBwdWxsZG93biBzZXR0aW5ncyBmb3IgdGhpcyBtb2RlXG4gICAgICAgIH1cbiAgICAgICAgRUREVGFibGVJbXBvcnQucmF3SW5wdXRTdGVwLnByZXZpb3VzU3RlcENoYW5nZWQoKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGJ5IG91ciBpbnN0YW5jZSBvZiByYXdJbnB1dFN0ZXAgdG8gYW5ub3VuY2UgY2hhbmdlcy5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmF3SW5wdXRDYWxsYmFjaygpOiB2b2lkIHtcbiAgICAgICAgRUREVGFibGVJbXBvcnQuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC5wcmV2aW91c1N0ZXBDaGFuZ2VkKCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBieSBvdXIgaW5zdGFuY2Ugb2YgaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCB0byBhbm5vdW5jZSBjaGFuZ2VzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBpZGVudGlmeVN0cnVjdHVyZXNDYWxsYmFjaygpOiB2b2lkIHtcbiAgICAgICAgLy8gTm93IHRoYXQgd2UncmUgZ290IHRoZSB0YWJsZSBmcm9tIFN0ZXAgMyBidWlsdCxcbiAgICAgICAgLy8gd2UgdHVybiB0byB0aGUgdGFibGUgaW4gU3RlcCA0OiAgQSBzZXQgZm9yIGVhY2ggdHlwZSBvZiBkYXRhLCBjb25zaXN0aW5nIG9mIGRpc2FtYmlndWF0aW9uIHJvd3MsXG4gICAgICAgIC8vIHdoZXJlIHRoZSB1c2VyIGNhbiBsaW5rIHVua25vd24gaXRlbXMgdG8gcHJlLWV4aXN0aW5nIEVERCBkYXRhLlxuICAgICAgICBFRERUYWJsZUltcG9ydC50eXBlRGlzYW1iaWd1YXRpb25TdGVwLnByZXZpb3VzU3RlcENoYW5nZWQoKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGJ5IG91ciBpbnN0YW5jZSBvZiB0eXBlRGlzYW1iaWd1YXRpb25TdGVwIHRvIGFubm91bmNlIGNoYW5nZXMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHR5cGVEaXNhbWJpZ3VhdGlvbkNhbGxiYWNrKCk6IHZvaWQge1xuICAgICAgICB2YXIgcGFyc2VkU2V0cyA9IEVERFRhYmxlSW1wb3J0LmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAucGFyc2VkU2V0cztcbiAgICAgICAgLy8gaWYgdGhlIGRlYnVnIGFyZWEgaXMgdGhlcmUsIHNldCBpdHMgdmFsdWUgdG8gSlNPTiBvZiBwYXJzZWQgc2V0c1xuICAgICAgICAkKCcjanNvbmRlYnVnYXJlYScpLnZhbChKU09OLnN0cmluZ2lmeShwYXJzZWRTZXRzKSk7XG4gICAgfVxuXG5cbiAgICAvLyBXaGVuIHRoZSBzdWJtaXQgYnV0dG9uIGlzIHB1c2hlZCwgZmV0Y2ggdGhlIG1vc3QgcmVjZW50IHJlY29yZCBzZXRzIGZyb20gb3VyIGlkZW50aWZ5U3RydWN0dXJlc1N0ZXAgaW5zdGFuY2UsXG4gICAgLy8gYW5kIGVtYmVkIHRoZW0gaW4gdGhlIGhpZGRlbiBmb3JtIGZpZWxkIHRoYXQgd2lsbCBiZSBzdWJtaXR0ZWQgdG8gdGhlIHNlcnZlci5cbiAgICAvLyBOb3RlIHRoYXQgdGhpcyBpcyBub3QgYWxsIHRoYXQgdGhlIHNlcnZlciBuZWVkcywgaW4gb3JkZXIgdG8gc3VjY2Vzc2Z1bGx5IHByb2Nlc3MgYW4gaW1wb3J0LlxuICAgIC8vIEl0IGFsc28gcmVhZHMgb3RoZXIgZm9ybSBlbGVtZW50cyBmcm9tIHRoZSBwYWdlLCBjcmVhdGVkIGJ5IHNlbGVjdE1ham9yS2luZFN0ZXAgYW5kIHR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHN1Ym1pdEZvckltcG9ydCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIGpzb246IHN0cmluZztcbiAgICAgICAgdmFyIHBhcnNlZFNldHMgPSBFRERUYWJsZUltcG9ydC5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnBhcnNlZFNldHM7XG4gICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBkYXRhIHNldHMgb25lIG1vcmUgdGltZSwgcHVsbGluZyBvdXQgYW55IHZhbHVlcyBpbiB0aGUgcHVsbGRvd25zIGFuZFxuICAgICAgICAvLyBhdXRvY29tcGxldGUgZWxlbWVudHMgaW4gU3RlcCA0IGFuZCBlbWJlZGRpbmcgdGhlbSBpbiB0aGVpciByZXNwZWN0aXZlIGRhdGEgc2V0cy5cbiAgICAgICAganNvbiA9IEpTT04uc3RyaW5naWZ5KHBhcnNlZFNldHMpO1xuICAgICAgICAkKCcjanNvbm91dHB1dCcpLnZhbChqc29uKTtcbiAgICAgICAgJCgnI2pzb25kZWJ1Z2FyZWEnKS52YWwoanNvbik7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdXN1YWwgY2xpY2stdG8tZGlzY2xvc2UgY2FsbGJhY2suICBQZXJoYXBzIHRoaXMgc2hvdWxkIGJlIGluIFV0bC50cz9cbiAgICBleHBvcnQgZnVuY3Rpb24gZGlzY2xvc2UoKTogYm9vbGVhbiB7XG4gICAgICAgICQodGhpcykuY2xvc2VzdCgnLmRpc2Nsb3NlJykudG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGV2ZXJ5dGhpbmcgaW4gdGhlIFwiU3RlcCAxXCIgYm94IHRoYXQgeW91IHNlZSBvbiB0aGUgZGF0YSBpbXBvcnQgcGFnZS5cbiAgICBleHBvcnQgY2xhc3MgU2VsZWN0TWFqb3JLaW5kU3RlcCB7XG5cbiAgICAgICAgLy8gVGhlIFByb3RvY29sIGZvciB3aGljaCB3ZSB3aWxsIGJlIGltcG9ydGluZyBkYXRhLlxuICAgICAgICBtYXN0ZXJQcm90b2NvbDogbnVtYmVyO1xuICAgICAgICAvLyBUaGUgbWFpbiBtb2RlIHdlIGFyZSBpbnRlcnByZXRpbmcgZGF0YSBpbi5cbiAgICAgICAgLy8gVmFsaWQgdmFsdWVzIHNvZmFyIGFyZSBcInN0ZFwiLCBcIm1kdlwiLCBcInRyXCIsIFwicHJcIi5cbiAgICAgICAgaW50ZXJwcmV0YXRpb25Nb2RlOiBzdHJpbmc7XG4gICAgICAgIGlucHV0UmVmcmVzaFRpbWVySUQ6IG51bWJlcjtcblxuICAgICAgICBuZXh0U3RlcENhbGxiYWNrOiBhbnk7XG5cblxuICAgICAgICBjb25zdHJ1Y3RvcihuZXh0U3RlcENhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgICAgIHRoaXMubWFzdGVyUHJvdG9jb2wgPSAwO1xuICAgICAgICAgICAgdGhpcy5pbnRlcnByZXRhdGlvbk1vZGUgPSBcInN0ZFwiO1xuICAgICAgICAgICAgdGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEID0gbnVsbDtcblxuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrID0gbmV4dFN0ZXBDYWxsYmFjaztcblxuICAgICAgICAgICAgdmFyIHJlUHJvY2Vzc09uQ2xpY2s6IHN0cmluZ1tdO1xuXG4gICAgICAgICAgICByZVByb2Nlc3NPbkNsaWNrID0gWycjc3RkbGF5b3V0JywgJyN0cmxheW91dCcsICcjcHJsYXlvdXQnLCAnI21kdmxheW91dCddO1xuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJhdGhlciBhIGxvdCBvZiBjYWxsYmFja3MsIGJ1dCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSdyZVxuICAgICAgICAgICAgLy8gdHJhY2tpbmcgdGhlIG1pbmltdW0gbnVtYmVyIG9mIGVsZW1lbnRzIHdpdGggdGhpcyBjYWxsLCBzaW5jZSB0aGVcbiAgICAgICAgICAgIC8vIGZ1bmN0aW9uIGNhbGxlZCBoYXMgc3VjaCBzdHJvbmcgZWZmZWN0cyBvbiB0aGUgcmVzdCBvZiB0aGUgcGFnZS5cbiAgICAgICAgICAgIC8vIEZvciBleGFtcGxlLCBhIHVzZXIgc2hvdWxkIGJlIGZyZWUgdG8gY2hhbmdlIFwibWVyZ2VcIiB0byBcInJlcGxhY2VcIiB3aXRob3V0IGhhdmluZ1xuICAgICAgICAgICAgLy8gdGhlaXIgZWRpdHMgaW4gU3RlcCAyIGVyYXNlZC5cbiAgICAgICAgICAgICQoXCIjbWFzdGVyUHJvdG9jb2xcIikuY2hhbmdlKHRoaXMuY2hhbmdlZE1hc3RlclByb3RvY29sLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAvLyBVc2luZyBcImNoYW5nZVwiIGZvciB0aGVzZSBiZWNhdXNlIGl0J3MgbW9yZSBlZmZpY2llbnQgQU5EIGJlY2F1c2UgaXQgd29ya3MgYXJvdW5kIGFuXG4gICAgICAgICAgICAvLyBpcnJpdGF0aW5nIENocm9tZSBpbmNvbnNpc3RlbmN5XG4gICAgICAgICAgICAvLyBGb3Igc29tZSBvZiB0aGVzZSwgY2hhbmdpbmcgdGhlbSBzaG91bGRuJ3QgYWN0dWFsbHkgYWZmZWN0IHByb2Nlc3NpbmcgdW50aWwgd2UgaW1wbGVtZW50XG4gICAgICAgICAgICAvLyBhbiBvdmVyd3JpdGUtY2hlY2tpbmcgZmVhdHVyZSBvciBzb21ldGhpbmcgc2ltaWxhclxuICAgICAgICAgICAgJChyZVByb2Nlc3NPbkNsaWNrLmpvaW4oJywnKSkub24oJ2NsaWNrJywgdGhpcy5xdWV1ZVJlY29uZmlndXJlLmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cblxuICAgICAgICBxdWV1ZVJlY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgICAgICAgICAvLyBUaGlzIHdheSB3ZSdyZSBub3QgYm90aGVyaW5nIHRoZSB1c2VyIHdpdGggdGhlIGxvbmcgcmVkcmF3IHByb2Nlc3Mgd2hlblxuICAgICAgICAgICAgLy8gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgICAgICAgICBpZiAodGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaW5wdXRSZWZyZXNoVGltZXJJRCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KHRoaXMucmVjb25maWd1cmUuYmluZCh0aGlzKSwgNSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlY29uZmlndXJlKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgc3RkTGF5b3V0OiBKUXVlcnksIHRyTGF5b3V0OiBKUXVlcnksIHByTGF5b3V0OiBKUXVlcnksIG1kdkxheW91dDogSlF1ZXJ5LCBncmFwaDogSlF1ZXJ5O1xuICAgICAgICAgICAgc3RkTGF5b3V0ID0gJCgnI3N0ZGxheW91dCcpO1xuICAgICAgICAgICAgdHJMYXlvdXQgPSAkKCcjdHJsYXlvdXQnKTtcbiAgICAgICAgICAgIHByTGF5b3V0ID0gJCgnI3BybGF5b3V0Jyk7XG4gICAgICAgICAgICBtZHZMYXlvdXQgPSAkKCcjbWR2bGF5b3V0Jyk7XG5cbiAgICAgICAgICAgIGdyYXBoID0gJCgnI2dyYXBoRGl2Jyk7XG4gICAgICAgICAgICAvLyBhbGwgbmVlZCB0byBleGlzdCwgb3IgcGFnZSBpcyBicm9rZW5cbiAgICAgICAgICAgIGlmICghW3N0ZExheW91dCwgdHJMYXlvdXQsIHByTGF5b3V0LCBtZHZMYXlvdXQsIGdyYXBoXS5ldmVyeSgoaXRlbSk6IGJvb2xlYW4gPT4gaXRlbS5sZW5ndGggIT09IDApKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJNaXNzaW5nIGNydWNpYWwgcGFnZSBlbGVtZW50LCBjYW5ub3QgcnVuLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGRMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7IC8vICBTdGFuZGFyZCBpbnRlcnByZXRhdGlvbiBtb2RlXG4gICAgICAgICAgICAgICAgdGhpcy5pbnRlcnByZXRhdGlvbk1vZGUgPSAnc3RkJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHJMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7ICAgLy8gIFRyYW5zY3JpcHRvbWljcyBtb2RlXG4gICAgICAgICAgICAgICAgdGhpcy5pbnRlcnByZXRhdGlvbk1vZGUgPSAndHInO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwckxheW91dC5wcm9wKCdjaGVja2VkJykpIHsgICAvLyAgUHJvdGVvbWljcyBtb2RlXG4gICAgICAgICAgICAgICAgdGhpcy5pbnRlcnByZXRhdGlvbk1vZGUgPSAncHInO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtZHZMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7ICAvLyBKQkVJIE1hc3MgRGlzdHJpYnV0aW9uIFZlY3RvciBmb3JtYXRcbiAgICAgICAgICAgICAgICB0aGlzLmludGVycHJldGF0aW9uTW9kZSA9ICdtZHYnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJZiBub25lIG9mIHRoZW0gYXJlIGNoZWNrZWQgLSBXVEY/ICBEb24ndCBwYXJzZSBvciBjaGFuZ2UgYW55dGhpbmcuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNoYW5nZWRNYXN0ZXJQcm90b2NvbCgpOnZvaWQge1xuICAgICAgICAgICAgdmFyIHByb3RvY29sSW46IEpRdWVyeSwgYXNzYXlJbjogSlF1ZXJ5LCBjdXJyZW50QXNzYXlzOiBudW1iZXJbXTtcblxuICAgICAgICAgICAgLy8gY2hlY2sgbWFzdGVyIHByb3RvY29sXG4gICAgICAgICAgICBwcm90b2NvbEluID0gJCgnI21hc3RlclByb3RvY29sJyk7XG4gICAgICAgICAgICB2YXIgcCA9IHBhcnNlSW50KHByb3RvY29sSW4udmFsKCksIDEwKTtcbiAgICAgICAgICAgIGlmICh0aGlzLm1hc3RlclByb3RvY29sID09PSBwKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gY2hhbmdlXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5tYXN0ZXJQcm90b2NvbCA9IHA7XG4gICAgICAgICAgICAvLyBjaGVjayBmb3IgbWFzdGVyIGFzc2F5XG4gICAgICAgICAgICBhc3NheUluID0gJCgnI21hc3RlckFzc2F5JykuZW1wdHkoKTtcbiAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dCgnKENyZWF0ZSBOZXcpJykuYXBwZW5kVG8oYXNzYXlJbikudmFsKCduZXcnKS5wcm9wKCdzZWxlY3RlZCcsIHRydWUpO1xuICAgICAgICAgICAgY3VycmVudEFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1twcm90b2NvbEluLnZhbCgpXSB8fCBbXTtcbiAgICAgICAgICAgIGN1cnJlbnRBc3NheXMuZm9yRWFjaCgoaWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2lkXSxcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSxcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykuYXBwZW5kVG8oYXNzYXlJbikudmFsKCcnICsgaWQpLnRleHQoW1xuICAgICAgICAgICAgICAgICAgICBsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQoJyNtYXN0ZXJMaW5lU3BhbicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHRoaXMucXVldWVSZWNvbmZpZ3VyZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIFRoZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgZXZlcnl0aGluZyBpbiB0aGUgXCJTdGVwIDJcIiBib3ggdGhhdCB5b3Ugc2VlIG9uIHRoZSBkYXRhIGltcG9ydCBwYWdlLlxuICAgIC8vIFBhcnNlIHRoZSByYXcgZGF0YSBmcm9tIHR5cGluZyBvciBwYXN0aW5nIGluIHRoZSBpbnB1dCBib3gsIG9yIGEgZHJhZ2dlZC1pbiBmaWxlLFxuICAgIC8vIGludG8gYSBudWxsLXBhZGRlZCByZWN0YW5ndWxhciBncmlkIHRoYXQgY2FuIGJlIGVhc2lseSB1c2VkIGJ5IHRoZSBuZXh0IHN0ZXAuXG4gICAgZXhwb3J0IGNsYXNzIFJhd0lucHV0U3RlcCB7XG5cbiAgICAgICAgcHJpdmF0ZSBkYXRhOiBhbnlbXTtcbiAgICAgICAgcm93TWFya2VyczogYW55W107XG4gICAgICAgIHRyYW5zcG9zZTogYm9vbGVhbjtcbiAgICAgICAgLy8gSWYgdGhlIHVzZXIgZGVsaWJlcmF0ZWx5IGNob3NlIHRvIHRyYW5zcG9zZSBvciBub3QgdHJhbnNwb3NlLCBkaXNhYmxlIHRoZSBhdHRlbXB0XG4gICAgICAgIC8vIHRvIGF1dG8tZGV0ZXJtaW5lIHRyYW5zcG9zaXRpb24uXG4gICAgICAgIHVzZXJDbGlja2VkT25UcmFuc3Bvc2U6IGJvb2xlYW47XG4gICAgICAgIC8vIFdoZXRoZXIgdG8gaW50ZXJwcmV0IHRoZSBwYXN0ZWQgZGF0YSByb3ctd2lzZSBvciBjb2x1bW4td2lzZSwgd2hlbiBpbXBvcnRpbmdcbiAgICAgICAgLy8gZWl0aGVyIG1lYXN1cmVtZW50cyBvciBtZXRhZGF0YS5cbiAgICAgICAgaWdub3JlRGF0YUdhcHM6IGJvb2xlYW47XG4gICAgICAgIHVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2FwczogYm9vbGVhbjtcbiAgICAgICAgc2VwYXJhdG9yVHlwZTogc3RyaW5nO1xuICAgICAgICBpbnB1dFJlZnJlc2hUaW1lcklEOiBhbnk7XG5cbiAgICAgICAgc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICAgICAgbmV4dFN0ZXBDYWxsYmFjazogYW55O1xuXG5cbiAgICAgICAgY29uc3RydWN0b3Ioc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcCwgbmV4dFN0ZXBDYWxsYmFjazogYW55KSB7XG5cbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IFtdO1xuICAgICAgICAgICAgdGhpcy5yb3dNYXJrZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnRyYW5zcG9zZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy51c2VyQ2xpY2tlZE9uVHJhbnNwb3NlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlnbm9yZURhdGFHYXBzID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2FwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5zZXBhcmF0b3JUeXBlID0gJ2Nzdic7XG4gICAgICAgICAgICB0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQgPSBudWxsO1xuICAgICAgICAgICAgdmFyIHQgPSB0aGlzO1xuXG4gICAgICAgICAgICAkKCcjdGV4dERhdGEnKVxuICAgICAgICAgICAgICAgIC5vbigncGFzdGUnLCB0aGlzLnBhc3RlZFJhd0RhdGEuYmluZCh0aGlzKSlcbiAgICAgICAgICAgICAgICAub24oJ2tleXVwJywgdGhpcy5xdWV1ZVJlcHJvY2Vzc1Jhd0RhdGEuYmluZCh0aGlzKSlcbiAgICAgICAgICAgICAgICAub24oJ2tleWRvd24nLCB0aGlzLnN1cHByZXNzTm9ybWFsVGFiLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAvLyBVc2luZyBcImNoYW5nZVwiIGZvciB0aGVzZSBiZWNhdXNlIGl0J3MgbW9yZSBlZmZpY2llbnQgQU5EIGJlY2F1c2UgaXQgd29ya3MgYXJvdW5kIGFuXG4gICAgICAgICAgICAvLyBpcnJpdGF0aW5nIENocm9tZSBpbmNvbnNpc3RlbmN5XG4gICAgICAgICAgICAvLyBGb3Igc29tZSBvZiB0aGVzZSwgY2hhbmdpbmcgdGhlbSBzaG91bGRuJ3QgYWN0dWFsbHkgYWZmZWN0IHByb2Nlc3NpbmcgdW50aWwgd2UgaW1wbGVtZW50XG4gICAgICAgICAgICAvLyBhbiBvdmVyd3JpdGUtY2hlY2tpbmcgZmVhdHVyZSBvciBzb21ldGhpbmcgc2ltaWxhclxuXG4gICAgICAgICAgICAkKCcjcmF3ZGF0YWZvcm1hdHAnKS5vbignY2hhbmdlJywgdGhpcy5xdWV1ZVJlcHJvY2Vzc1Jhd0RhdGEuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAkKCcjaWdub3JlR2FwcycpLm9uKCdjaGFuZ2UnLCB0aGlzLmNsaWNrZWRPbklnbm9yZURhdGFHYXBzLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgJCgnI3RyYW5zcG9zZScpLm9uKCdjaGFuZ2UnLCB0aGlzLmNsaWNrZWRPblRyYW5zcG9zZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAgICAgY29uc29sZS5sb2coJ3NldHVwIGRyb3B6b25lIGNhbGwnKTtcbiAgICAgICAgICAgIFV0bC5GaWxlRHJvcFpvbmUuY3JlYXRlKFwidGV4dERhdGFcIixcbiAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NSYXdGaWxlQ29udGVudC5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgIFwiL3V0aWxpdGllcy9wYXJzZWZpbGVcIixcbiAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NQYXJzZWRGaWxlQ29udGVudC5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgIGZhbHNlKTtcblxuICAgICAgICAgICAgdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwID0gc2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjayA9IG5leHRTdGVwQ2FsbGJhY2s7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEluIHByYWN0aWNlLCB0aGUgb25seSB0aW1lIHRoaXMgd2lsbCBiZSBjYWxsZWQgaXMgd2hlbiBTdGVwIDEgY2hhbmdlcyxcbiAgICAgICAgLy8gd2hpY2ggbWF5IGNhbGwgZm9yIGEgcmVjb25maWd1cmF0aW9uIG9mIHRoZSBjb250cm9scyBpbiB0aGlzIHN0ZXAuXG4gICAgICAgIHByZXZpb3VzU3RlcENoYW5nZWQoKTogdm9pZCB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSA9PSAnbWR2Jykge1xuICAgICAgICAgICAgICAgIC8vIFdlIG5ldmVyIGlnbm9yZSBnYXBzLCBvciB0cmFuc3Bvc2UsIGZvciBNRFYgZG9jdW1lbnRzXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRJZ25vcmVHYXBzKGZhbHNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFRyYW5zcG9zZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgLy8gSkJFSSBNRFYgZm9ybWF0IGRvY3VtZW50cyBhcmUgYWx3YXlzIHBhc3RlZCBpbiBmcm9tIEV4Y2VsLCBzbyB0aGV5J3JlIGFsd2F5cyB0YWItc2VwYXJhdGVkXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTZXBhcmF0b3JUeXBlKCd0YWInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucXVldWVSZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHF1ZXVlUmVwcm9jZXNzUmF3RGF0YSgpOiB2b2lkIHtcbiAgICAgICAgICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgdGhlIGdyYXBoLlxuICAgICAgICAgICAgLy8gVGhpcyB3YXkgd2UncmUgbm90IGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW5cbiAgICAgICAgICAgIC8vIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXRSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmlucHV0UmVmcmVzaFRpbWVySUQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5pbnB1dFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dCh0aGlzLnJlcHJvY2Vzc1Jhd0RhdGEuYmluZCh0aGlzKSwgMzUwKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVwcm9jZXNzUmF3RGF0YSgpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIG1vZGU6IHN0cmluZywgZGVsaW1pdGVyOiBzdHJpbmcsIGlucHV0OiBSYXdJbnB1dFN0YXQ7XG5cbiAgICAgICAgICAgIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuXG4gICAgICAgICAgICB0aGlzLnNldElnbm9yZUdhcHMoKTtcbiAgICAgICAgICAgIHRoaXMuc2V0VHJhbnNwb3NlKCk7XG4gICAgICAgICAgICB0aGlzLnNldFNlcGFyYXRvclR5cGUoKTtcblxuICAgICAgICAgICAgdGhpcy5kYXRhID0gW107XG4gICAgICAgICAgICB0aGlzLnJvd01hcmtlcnMgPSBbXTtcblxuICAgICAgICAgICAgLy8gSWYgd2UncmUgaW4gXCJtZHZcIiBtb2RlLCBsb2NrIHRoZSBkZWxpbWl0ZXIgdG8gdGFic1xuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdtZHYnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTZXBhcmF0b3JUeXBlKCd0YWInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlbGltaXRlciA9ICdcXHQnO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2VwYXJhdG9yVHlwZSA9PT0gJ2NzdicpIHtcbiAgICAgICAgICAgICAgICBkZWxpbWl0ZXIgPSAnLCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpbnB1dCA9IHRoaXMucGFyc2VSYXdJbnB1dChkZWxpbWl0ZXIsIG1vZGUpO1xuXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgaGFzbid0IGRlbGliZXJhdGVseSBjaG9zZW4gYSBzZXR0aW5nIGZvciAndHJhbnNwb3NlJywgd2Ugd2lsbCBkb1xuICAgICAgICAgICAgICAgIC8vIHNvbWUgYW5hbHlzaXMgdG8gYXR0ZW1wdCB0byBndWVzcyB3aGljaCBvcmllbnRhdGlvbiB0aGUgZGF0YSBuZWVkcyB0byBoYXZlLlxuICAgICAgICAgICAgICAgIGlmICghdGhpcy51c2VyQ2xpY2tlZE9uVHJhbnNwb3NlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5mZXJUcmFuc3Bvc2VTZXR0aW5nKGlucHV0LmlucHV0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gTm93IHRoYXQgdGhhdCdzIGRvbmUsIG1vdmUgdGhlIGRhdGEgaW5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy50cmFuc3Bvc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZmlyc3Qgcm93IGJlY29tZXMgWS1tYXJrZXJzIGFzLWlzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucm93TWFya2VycyA9IGlucHV0LmlucHV0LnNoaWZ0KCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YSA9IChpbnB1dC5pbnB1dFswXSB8fCBbXSkubWFwKChfLCBpOiBudW1iZXIpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXQuaW5wdXQubWFwKChyb3c6IHN0cmluZ1tdKTogc3RyaW5nID0+IHJvd1tpXSB8fCAnJyk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucm93TWFya2VycyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGEgPSAoaW5wdXQuaW5wdXQgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucm93TWFya2Vycy5wdXNoKHJvdy5zaGlmdCgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByb3c7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBoYXNuJ3QgZGVsaWJlcmF0ZWx5IGNob3NlbiB0byBpZ25vcmUsIG9yIGFjY2VwdCwgZ2FwcyBpbiB0aGUgZGF0YSxcbiAgICAgICAgICAgICAgICAvLyBkbyBhIGJhc2ljIGFuYWx5c2lzIHRvIGd1ZXNzIHdoaWNoIHNldHRpbmcgbWFrZXMgbW9yZSBzZW5zZS5cbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMudXNlckNsaWNrZWRPbklnbm9yZURhdGFHYXBzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5mZXJHYXBzU2V0dGluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBHaXZlIGxhYmVscyB0byBhbnkgaGVhZGVyIHBvc2l0aW9ucyB0aGF0IGdvdCAnbnVsbCcgZm9yIGEgdmFsdWUuXG4gICAgICAgICAgICAgICAgdGhpcy5yb3dNYXJrZXJzID0gdGhpcy5yb3dNYXJrZXJzLm1hcCgodmFsdWU6IHN0cmluZykgPT4gdmFsdWUgfHwgJz8nKTtcblxuICAgICAgICAgICAgLy8gV2UgbWVlZCBhdCBsZWFzdCAyIHJvd3MgYW5kIGNvbHVtbnMgZm9yIE1EViBmb3JtYXQgdG8gbWFrZSBhbnkgc2Vuc2VcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoKG1vZGUgPT09IFwibWR2XCIpICYmIChpbnB1dC5pbnB1dC5sZW5ndGggPiAxKSAmJiAoaW5wdXQuY29sdW1ucyA+IDEpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzTWR2KGlucHV0LmlucHV0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHByb2Nlc3NSYXdGaWxlQ29udGVudChmaWxlVHlwZSwgcmVzdWx0KTogYm9vbGVhbiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhmaWxlVHlwZSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygncHJvY2Vzc2luZyBuZXcgZmlsZSB2aWEgcHJvY2Vzc1Jhd0ZpbGVDb250ZW50Jyk7XG4gICAgICAgICAgICBpZiAoZmlsZVR5cGUgPT09ICd0ZXh0L3htbCcpIHtcbiAgICAgICAgICAgICAgICAkKFwiI3RleHREYXRhXCIpLnZhbChyZXN1bHQpO1xuICAgICAgICAgICAgICAgIHRoaXMuaW5mZXJTZXBhcmF0b3JUeXBlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZpbGVUeXBlID09PSAndGV4dC9jc3YnKSB7XG4gICAgICAgICAgICAgICAgJChcIiN0ZXh0RGF0YVwiKS52YWwocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB0aGlzLmluZmVyU2VwYXJhdG9yVHlwZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBwcm9jZXNzUGFyc2VkRmlsZUNvbnRlbnQocmVzdWx0KTogdm9pZCB7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmZpbGVfdHlwZSA9PSBcInhsc3hcIikge1xuICAgICAgICAgICAgICAgIHZhciB3cyA9IHJlc3VsdC5maWxlX2RhdGFbXCJ3b3Jrc2hlZXRzXCJdWzBdO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHdzKTtcbiAgICAgICAgICAgICAgICB2YXIgdGFibGUgPSB3c1swXTtcbiAgICAgICAgICAgICAgICB2YXIgY3N2ID0gW107XG4gICAgICAgICAgICAgICAgaWYgKHRhYmxlLmhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgY3N2LnB1c2godGFibGUuaGVhZGVycy5qb2luKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRhYmxlLnZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjc3YucHVzaCh0YWJsZS52YWx1ZXNbaV0uam9pbigpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTZXBhcmF0b3JUeXBlKCdjc3YnKTtcbiAgICAgICAgICAgICAgICAkKFwiI3RleHREYXRhXCIpLnZhbChjc3Yuam9pbihcIlxcblwiKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5maWxlX3R5cGUgPT0gXCJ0YWJcIikge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSB0eXBlIGlzIGRlbGliZXJhdGVseSBzZXQgdG8gdGFiLCByZXNwZWN0IGl0LlxuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgYXR0ZW1wdCB0byBndWVzcyB0aGUgc2V0dGluZy5cbiAgICAgICAgICAgICAgICB0aGlzLnNldFNlcGFyYXRvclR5cGUoJ3RhYicpO1xuICAgICAgICAgICAgICAgICQoXCIjdGV4dERhdGFcIikudmFsKHJlc3VsdC5maWxlX2RhdGEpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkKFwiI3RleHREYXRhXCIpLnZhbChyZXN1bHQuZmlsZV9kYXRhKTtcbiAgICAgICAgICAgICAgICB0aGlzLmluZmVyU2VwYXJhdG9yVHlwZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHBhcnNlUmF3SW5wdXQoZGVsaW1pdGVyOiBzdHJpbmcsIG1vZGU6IHN0cmluZyk6UmF3SW5wdXRTdGF0IHtcbiAgICAgICAgICAgIHZhciByYXdUZXh0OiBzdHJpbmcsIGxvbmdlc3RSb3c6IG51bWJlciwgcm93czogUmF3SW5wdXQsIG11bHRpQ29sdW1uOiBib29sZWFuO1xuICAgICAgICAgICAgcmF3VGV4dCA9ICQoJyN0ZXh0RGF0YScpLnZhbCgpO1xuICAgICAgICAgICAgcm93cyA9IFtdO1xuICAgICAgICAgICAgLy8gZmluZCB0aGUgaGlnaGVzdCBudW1iZXIgb2YgY29sdW1ucyBpbiBhIHJvd1xuICAgICAgICAgICAgbG9uZ2VzdFJvdyA9IHJhd1RleHQuc3BsaXQoL1sgXFxyXSpcXG4vKS5yZWR1Y2UoKHByZXY6IG51bWJlciwgcmF3Um93OiBzdHJpbmcpOiBudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByb3c6IHN0cmluZ1tdO1xuICAgICAgICAgICAgICAgIGlmIChyYXdSb3cgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9IHJhd1Jvdy5zcGxpdChkZWxpbWl0ZXIpO1xuICAgICAgICAgICAgICAgICAgICByb3dzLnB1c2gocm93KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHJvdy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgLy8gcGFkIG91dCByb3dzIHNvIGl0IGlzIHJlY3Rhbmd1bGFyXG4gICAgICAgICAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInKSB7XG4gICAgICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3c6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChyb3cubGVuZ3RoIDwgbG9uZ2VzdFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcm93LnB1c2goJycpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICdpbnB1dCc6IHJvd3MsXG4gICAgICAgICAgICAgICAgJ2NvbHVtbnMnOiBsb25nZXN0Um93XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cblxuICAgICAgICBpbmZlclRyYW5zcG9zZVNldHRpbmcocm93czogUmF3SW5wdXQpOnZvaWQgIHtcbiAgICAgICAgICAgIC8vIFRoZSBtb3N0IHN0cmFpZ2h0Zm9yd2FyZCBtZXRob2QgaXMgdG8gdGFrZSB0aGUgdG9wIHJvdywgYW5kIHRoZSBmaXJzdCBjb2x1bW4sXG4gICAgICAgICAgICAvLyBhbmQgYW5hbHl6ZSBib3RoIHRvIHNlZSB3aGljaCBvbmUgbW9zdCBsaWtlbHkgY29udGFpbnMgYSBydW4gb2YgdGltZXN0YW1wcy5cbiAgICAgICAgICAgIC8vIFdlJ2xsIGFsc28gZG8gdGhlIHNhbWUgZm9yIHRoZSBzZWNvbmQgcm93IGFuZCB0aGUgc2Vjb25kIGNvbHVtbiwgaW4gY2FzZSB0aGVcbiAgICAgICAgICAgIC8vIHRpbWVzdGFtcHMgYXJlIHVuZGVybmVhdGggc29tZSBvdGhlciBoZWFkZXIuXG4gICAgICAgICAgICB2YXIgYXJyYXlzVG9BbmFseXplOiBzdHJpbmdbXVtdLCBhcnJheXNTY29yZXM6IG51bWJlcltdLCBzZXRUcmFuc3Bvc2U6IGJvb2xlYW47XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdpdGggZW1wdHkgb3IgdG9vLXNtYWxsIHNvdXJjZSBkYXRhLCB0aGVzZSBhcnJheXMgd2lsbCBlaXRoZXIgcmVtYWluXG4gICAgICAgICAgICAvLyBlbXB0eSwgb3IgYmVjb21lICdudWxsJ1xuICAgICAgICAgICAgYXJyYXlzVG9BbmFseXplID0gW1xuICAgICAgICAgICAgICAgIHJvd3NbMF0gfHwgW10sICAgLy8gRmlyc3Qgcm93XG4gICAgICAgICAgICAgICAgcm93c1sxXSB8fCBbXSwgICAvLyBTZWNvbmQgcm93XG4gICAgICAgICAgICAgICAgKHJvd3MgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbMF0pLCAgIC8vIEZpcnN0IGNvbHVtblxuICAgICAgICAgICAgICAgIChyb3dzIHx8IFtdKS5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmcgPT4gcm93WzFdKSAgICAvLyBTZWNvbmQgY29sdW1uXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgYXJyYXlzU2NvcmVzID0gYXJyYXlzVG9BbmFseXplLm1hcCgocm93OiBzdHJpbmdbXSwgaTogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2NvcmUgPSAwLCBwcmV2OiBudW1iZXIsIG5uUHJldjogbnVtYmVyO1xuICAgICAgICAgICAgICAgIGlmICghcm93IHx8IHJvdy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXYgPSBublByZXYgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgcm93LmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIGo6IG51bWJlciwgcjogc3RyaW5nW10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHQ6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ID0gcGFyc2VGbG9hdCh2YWx1ZS5yZXBsYWNlKC8sL2csICcnKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTih0KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTihwcmV2KSAmJiB0ID4gcHJldikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFpc05hTihublByZXYpICYmIHQgPiBublByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29yZSArPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgbm5QcmV2ID0gdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcmV2ID0gdDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcmUgLyByb3cubGVuZ3RoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB0aGUgZmlyc3Qgcm93IGFuZCBjb2x1bW4gc2NvcmVkIGRpZmZlcmVudGx5LCBqdWRnZSBiYXNlZCBvbiB0aGVtLlxuICAgICAgICAgICAgLy8gT25seSBpZiB0aGV5IHNjb3JlZCB0aGUgc2FtZSBkbyB3ZSBqdWRnZSBiYXNlZCBvbiB0aGUgc2Vjb25kIHJvdyBhbmQgc2Vjb25kIGNvbHVtbi5cbiAgICAgICAgICAgIGlmIChhcnJheXNTY29yZXNbMF0gIT09IGFycmF5c1Njb3Jlc1syXSkge1xuICAgICAgICAgICAgICAgIHNldFRyYW5zcG9zZSA9IGFycmF5c1Njb3Jlc1swXSA+IGFycmF5c1Njb3Jlc1syXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2V0VHJhbnNwb3NlID0gYXJyYXlzU2NvcmVzWzFdID4gYXJyYXlzU2NvcmVzWzNdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZXRUcmFuc3Bvc2Uoc2V0VHJhbnNwb3NlKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaW5mZXJHYXBzU2V0dGluZygpOnZvaWQge1xuICAgICAgICAgICAgLy8gQ291bnQgdGhlIG51bWJlciBvZiBibGFuayB2YWx1ZXMgYXQgdGhlIGVuZCBvZiBlYWNoIGNvbHVtblxuICAgICAgICAgICAgLy8gQ291bnQgdGhlIG51bWJlciBvZiBibGFuayB2YWx1ZXMgaW4gYmV0d2VlbiBub24tYmxhbmsgZGF0YVxuICAgICAgICAgICAgLy8gSWYgbW9yZSB0aGFuIHRocmVlIHRpbWVzIGFzIG1hbnkgYXMgYXQgdGhlIGVuZCwgZGVmYXVsdCB0byBpZ25vcmUgZ2Fwc1xuICAgICAgICAgICAgdmFyIGludHJhOiBudW1iZXIgPSAwLCBleHRyYTogbnVtYmVyID0gMDtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG5vdE51bGw6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBjb3B5IGFuZCByZXZlcnNlIHRvIGxvb3AgZnJvbSB0aGUgZW5kXG4gICAgICAgICAgICAgICAgcm93LnNsaWNlKDApLnJldmVyc2UoKS5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vdE51bGwgPyArK2V4dHJhIDogKytpbnRyYTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vdE51bGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHZhciByZXN1bHQ6Ym9vbGVhbiA9IGV4dHJhID4gKGludHJhICogMyk7XG4gICAgICAgICAgICB0aGlzLnNldElnbm9yZUdhcHMocmVzdWx0KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcHJvY2Vzc01kdihpbnB1dDogUmF3SW5wdXQpOnZvaWQge1xuICAgICAgICAgICAgdmFyIHJvd3M6IFJhd0lucHV0LCBjb2xMYWJlbHM6IHN0cmluZ1tdLCBjb21wb3VuZHM6IGFueSwgb3JkZXJlZENvbXA6IHN0cmluZ1tdO1xuICAgICAgICAgICAgcm93cyA9IGlucHV0LnNsaWNlKDApOyAvLyBjb3B5XG4gICAgICAgICAgICAvLyBJZiB0aGlzIHdvcmQgZnJhZ21lbnQgaXMgaW4gdGhlIGZpcnN0IHJvdywgZHJvcCB0aGUgd2hvbGUgcm93LlxuICAgICAgICAgICAgLy8gKElnbm9yaW5nIGEgUSBvZiB1bmtub3duIGNhcGl0YWxpemF0aW9uKVxuICAgICAgICAgICAgaWYgKHJvd3NbMF0uam9pbignJykubWF0Y2goL3VhbnRpdGF0aW9uL2cpKSB7XG4gICAgICAgICAgICAgICAgcm93cy5zaGlmdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29tcG91bmRzID0ge307XG4gICAgICAgICAgICBvcmRlcmVkQ29tcCA9IFtdO1xuICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3c6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0OiBzdHJpbmcsIG1hcmtlZDogc3RyaW5nW10sIG5hbWU6IHN0cmluZywgaW5kZXg6IG51bWJlcjtcbiAgICAgICAgICAgICAgICBmaXJzdCA9IHJvdy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhcHBlbiB0byBlbmNvdW50ZXIgYW4gb2NjdXJyZW5jZSBvZiBhIHJvdyB3aXRoICdDb21wb3VuZCcgaW5cbiAgICAgICAgICAgICAgICAvLyB0aGUgZmlyc3QgY29sdW1uLCB3ZSB0cmVhdCBpdCBhcyBhIHJvdyBvZiBjb2x1bW4gaWRlbnRpZmllcnMuXG4gICAgICAgICAgICAgICAgaWYgKGZpcnN0ID09PSAnQ29tcG91bmQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbExhYmVscyA9IHJvdztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtYXJrZWQgPSBmaXJzdC5zcGxpdCgnIE0gPSAnKTtcbiAgICAgICAgICAgICAgICBpZiAobWFya2VkLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICAgICAgICBuYW1lID0gbWFya2VkWzBdO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IHBhcnNlSW50KG1hcmtlZFsxXSwgMTApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbXBvdW5kc1tuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG91bmRzW25hbWVdID0geyAnb3JpZ2luYWxSb3dzJzoge30sICdwcm9jZXNzZWRBc3NheUNvbHMnOiB7fSB9XG4gICAgICAgICAgICAgICAgICAgICAgICBvcmRlcmVkQ29tcC5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvdW5kc1tuYW1lXS5vcmlnaW5hbFJvd3NbaW5kZXhdID0gcm93LnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJC5lYWNoKGNvbXBvdW5kcywgKG5hbWU6IHN0cmluZywgdmFsdWU6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBpbmRpY2VzOiBudW1iZXJbXTtcbiAgICAgICAgICAgICAgICAvLyBGaXJzdCBnYXRoZXIgdXAgYWxsIHRoZSBtYXJrZXIgaW5kZXhlcyBnaXZlbiBmb3IgdGhpcyBjb21wb3VuZFxuICAgICAgICAgICAgICAgIGluZGljZXMgPSAkLm1hcCh2YWx1ZS5vcmlnaW5hbFJvd3MsIChfLCBpbmRleDogc3RyaW5nKTogbnVtYmVyID0+IHBhcnNlSW50KGluZGV4LCAxMCkpO1xuICAgICAgICAgICAgICAgIGluZGljZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpOyAvLyBzb3J0IGFzY2VuZGluZ1xuICAgICAgICAgICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBzZXQgb2YgY29sdW1uTGFiZWxzIGFib3ZlLCBhc3NlbWJsaW5nIGEgbWFya2luZyBudW1iZXIgZm9yIGVhY2gsXG4gICAgICAgICAgICAgICAgLy8gYnkgZHJhd2luZyAtIGluIG9yZGVyIC0gZnJvbSB0aGlzIGNvbGxlY3RlZCByb3cgZGF0YS5cbiAgICAgICAgICAgICAgICBjb2xMYWJlbHMuZm9yRWFjaCgobGFiZWw6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcGFydHM6IHN0cmluZ1tdLCBhbnlGbG9hdDogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgYW55RmxvYXQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNlcy5mb3JFYWNoKChyaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgb3JpZ2luYWw6IHN0cmluZ1tdLCBjZWxsOiBzdHJpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbCA9IHZhbHVlLm9yaWdpbmFsUm93c1tyaV07XG4gICAgICAgICAgICAgICAgICAgICAgICBjZWxsID0gb3JpZ2luYWxbaW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNlbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsID0gY2VsbC5yZXBsYWNlKC8sL2csICcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNOYU4ocGFyc2VGbG9hdChjZWxsKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFueUZsb2F0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goY2VsbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQXNzZW1ibGVkIGEgZnVsbCBjYXJib24gbWFya2VyIG51bWJlciwgZ3JhYiB0aGUgY29sdW1uIGxhYmVsLCBhbmQgcGxhY2VcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIG1hcmtlciBpbiB0aGUgYXBwcm9wcmlhdGUgc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgdmFsdWUucHJvY2Vzc2VkQXNzYXlDb2xzW2luZGV4XSA9IHBhcnRzLmpvaW4oJy8nKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gU3RhcnQgdGhlIHNldCBvZiByb3cgbWFya2VycyB3aXRoIGEgZ2VuZXJpYyBsYWJlbFxuICAgICAgICAgICAgdGhpcy5yb3dNYXJrZXJzID0gWydBc3NheSddO1xuICAgICAgICAgICAgLy8gVGhlIGZpcnN0IHJvdyBpcyBvdXIgbGFiZWwgY29sbGVjdGlvblxuICAgICAgICAgICAgdGhpcy5kYXRhWzBdID0gY29sTGFiZWxzLnNsaWNlKDApO1xuICAgICAgICAgICAgLy8gcHVzaCB0aGUgcmVzdCBvZiB0aGUgcm93cyBnZW5lcmF0ZWQgZnJvbSBvcmRlcmVkIGxpc3Qgb2YgY29tcG91bmRzXG4gICAgICAgICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgICAgICAgb3JkZXJlZENvbXAubWFwKChuYW1lOiBzdHJpbmcpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjb21wb3VuZDogYW55LCByb3c6IHN0cmluZ1tdLCBjb2xMb29rdXA6IGFueTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yb3dNYXJrZXJzLnB1c2gobmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvdW5kID0gY29tcG91bmRzW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgY29sTG9va3VwID0gY29tcG91bmQucHJvY2Vzc2VkQXNzYXlDb2xzO1xuICAgICAgICAgICAgICAgICAgICAvLyBnZW5lcmF0ZSByb3cgY2VsbHMgYnkgbWFwcGluZyBjb2x1bW4gbGFiZWxzIHRvIHByb2Nlc3NlZCBjb2x1bW5zXG4gICAgICAgICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KHJvdyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbExhYmVscy5tYXAoKF8sIGluZGV4OiBudW1iZXIpOiBzdHJpbmcgPT4gY29sTG9va3VwW2luZGV4XSB8fCAnJylcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBnZXRzIGNhbGxlZCB3aGVuIHRoZXJlIGlzIGEgcGFzdGUgZXZlbnQuXG4gICAgICAgIHBhc3RlZFJhd0RhdGEoKTp2b2lkIHtcbiAgICAgICAgICAgIC8vIFdlIGRvIHRoaXMgdXNpbmcgYSB0aW1lb3V0IHNvIHRoZSByZXN0IG9mIHRoZSBwYXN0ZSBldmVudHMgZmlyZSwgYW5kIGdldCB0aGUgcGFzdGVkIHJlc3VsdC5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHRoaXMuaW5mZXJTZXBhcmF0b3JUeXBlLmJpbmQodGhpcyksIDEpO1xuICAgICAgICB9XG5cblxuICAgICAgICBpbmZlclNlcGFyYXRvclR5cGUoKTogdm9pZCB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZSAhPT0gXCJtZHZcIikge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0OiBzdHJpbmcgPSAkKCcjdGV4dERhdGEnKS52YWwoKSB8fCAnJywgdGVzdDogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICB0ZXN0ID0gdGV4dC5zcGxpdCgnXFx0JykubGVuZ3RoID49IHRleHQuc3BsaXQoJywnKS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTZXBhcmF0b3JUeXBlKHRlc3QgPyAndGFiJyA6ICdjc3YnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgc2V0SWdub3JlR2Fwcyh2YWx1ZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBpZ25vcmVHYXBzID0gJCgnI2lnbm9yZUdhcHMnKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBpZ25vcmVHYXBzLnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWdub3JlR2Fwcy5wcm9wKCdjaGVja2VkJywgdmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5pZ25vcmVEYXRhR2FwcyA9IHZhbHVlO1xuICAgICAgICB9XG5cblxuICAgICAgICBzZXRUcmFuc3Bvc2UodmFsdWU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdHJhbnNwb3NlID0gJCgnI3RyYW5zcG9zZScpO1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRyYW5zcG9zZS5wcm9wKCdjaGVja2VkJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyYW5zcG9zZS5wcm9wKCdjaGVja2VkJywgdmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50cmFuc3Bvc2UgPSB2YWx1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgc2V0U2VwYXJhdG9yVHlwZSh2YWx1ZT86IHN0cmluZyk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHNlcGFyYXRvclB1bGxkb3duID0gJCgnI3Jhd2RhdGFmb3JtYXRwJyk7XG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gc2VwYXJhdG9yUHVsbGRvd24udmFsKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlcGFyYXRvclB1bGxkb3duLnZhbCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNlcGFyYXRvclR5cGUgPSB2YWx1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY2xpY2tlZE9uSWdub3JlRGF0YUdhcHMoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudXNlckNsaWNrZWRPbklnbm9yZURhdGFHYXBzID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMucmVwcm9jZXNzUmF3RGF0YSgpOyAgICAvLyBUaGlzIHdpbGwgdGFrZSBjYXJlIG9mIHJlYWRpbmcgdGhlIHN0YXR1cyBvZiB0aGUgY2hlY2tib3hcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY2xpY2tlZE9uVHJhbnNwb3NlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVzZXJDbGlja2VkT25UcmFuc3Bvc2UgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5yZXByb2Nlc3NSYXdEYXRhKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgaGFuZGxlcyBpbnNlcnRpb24gb2YgYSB0YWIgaW50byB0aGUgdGV4dGFyZWEuXG4gICAgICAgIC8vIE1heSBiZSBnbGl0Y2h5LlxuICAgICAgICBzdXBwcmVzc05vcm1hbFRhYihlOiBKUXVlcnlLZXlFdmVudE9iamVjdCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50LCB0ZXh0OiBzdHJpbmc7XG4gICAgICAgICAgICBpZiAoZS53aGljaCA9PT0gOSkge1xuICAgICAgICAgICAgICAgIGlucHV0ID0gPEhUTUxJbnB1dEVsZW1lbnQ+ZS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgdGV4dCA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAgICAgICAgIC8vIHNldCB2YWx1ZSB0byBpdHNlbGYgd2l0aCBzZWxlY3Rpb24gcmVwbGFjZWQgYnkgYSB0YWIgY2hhcmFjdGVyXG4gICAgICAgICAgICAgICAgJChpbnB1dCkudmFsKFtcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zdWJzdHJpbmcoMCwgaW5wdXQuc2VsZWN0aW9uU3RhcnQpLFxuICAgICAgICAgICAgICAgICAgICB0ZXh0LnN1YnN0cmluZyhpbnB1dC5zZWxlY3Rpb25FbmQpXG4gICAgICAgICAgICAgICAgXS5qb2luKCdcXHQnKSk7XG4gICAgICAgICAgICAgICAgLy8gcHV0IGNhcmV0IGF0IHJpZ2h0IHBvc2l0aW9uIGFnYWluXG4gICAgICAgICAgICAgICAgaW5wdXQuc2VsZWN0aW9uU3RhcnQgPSBpbnB1dC5zZWxlY3Rpb25FbmQgPSBpbnB1dC5zZWxlY3Rpb25TdGFydCArIDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGdldEdyaWQoKTogYW55W10ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyB0eXBlIGZvciB0aGUgb3B0aW9ucyBpbiByb3cgcHVsbGRvd25zXG4gICAgLy8gVE9ETyB1cGRhdGUgdG8gdXNlIHVuaW9ucyB3aGVuIG1pZ3JhdGluZyB0byBUeXBlc2NyaXB0IDEuNCtcbiAgICBpbnRlcmZhY2UgUm93UHVsbGRvd25PcHRpb24gZXh0ZW5kcyBBcnJheTxhbnk+IHsgLy8gQXJyYXk8c3RyaW5nfG51bWJlcnxSb3dQdWxsZG93bk9wdGlvbltdPlxuICAgICAgICAwOiBzdHJpbmc7XG4gICAgICAgIDE6IGFueTsgLy8gbnVtYmVyIHwgUm93UHVsbGRvd25PcHRpb25bXVxuICAgIH1cblxuXG4gICAgLy8gVGhlIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBldmVyeXRoaW5nIGluIHRoZSBcIlN0ZXAgM1wiIGJveCB0aGF0IHlvdSBzZWUgb24gdGhlIGRhdGEgaW1wb3J0IHBhZ2UuXG4gICAgLy8gR2V0IHRoZSBncmlkIGZyb20gdGhlIHByZXZpb3VzIHN0ZXAsIGFuZCBkcmF3IGl0IGFzIGEgdGFibGUgd2l0aCBwdWxkb3ducyBmb3Igc3BlY2lmeWluZyB0aGUgY29udGVudFxuICAgIC8vIG9mIHRoZSByb3dzIGFuZCBjb2x1bW5zLCBhcyB3ZWxsIGFzIGNoZWNrYm94ZXMgdG8gZW5hYmxlIG9yIGRpc2FibGUgcm93cyBvciBjb2x1bW5zLlxuICAgIC8vIEludGVycHJldCB0aGUgY3VycmVudCBncmlkIGFuZCB0aGUgc2V0dGluZ3Mgb24gdGhlIGN1cnJlbnQgdGFibGUgaW50byBFREQtZnJpZW5kbHkgc2V0cy5cbiAgICBleHBvcnQgY2xhc3MgSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCB7XG5cbiAgICAgICAgcmF3SW5wdXRTdGVwOiBSYXdJbnB1dFN0ZXA7XG5cbiAgICAgICAgcm93TGFiZWxDZWxsczogYW55W107XG4gICAgICAgIGNvbENoZWNrYm94Q2VsbHM6IGFueVtdO1xuICAgICAgICByb3dDaGVja2JveENlbGxzOiBhbnlbXTsgICAgLy8gTm90ZTogdGhpcyBpcyBidWlsdCwgYnV0IG5ldmVyIHJlZmVyZW5jZWQuLi4gIE1pZ2h0IGFzIHdlbGwgY3V0IGl0LlxuXG4gICAgICAgIGNvbE9iamVjdHM6IGFueVtdO1xuICAgICAgICBkYXRhQ2VsbHM6IGFueVtdO1xuXG4gICAgICAgIC8vIFdlIGtlZXAgYSBzaW5nbGUgZmxhZyBmb3IgZWFjaCBkYXRhIHBvaW50IFt5LHhdXG4gICAgICAgIC8vIGFzIHdlbGwgYXMgdHdvIGxpbmVhciBzZXRzIG9mIGZsYWdzIGZvciBlbmFibGluZyBvciBkaXNhYmxpbmdcbiAgICAgICAgLy8gZW50aXJlIGNvbHVtbnMvcm93cy5cbiAgICAgICAgYWN0aXZlQ29sRmxhZ3M6IGFueVtdO1xuICAgICAgICBhY3RpdmVSb3dGbGFnczogYW55W107XG4gICAgICAgIGFjdGl2ZUZsYWdzOiBhbnlbXTtcblxuICAgICAgICAvLyBBcnJheXMgZm9yIHRoZSBwdWxsZG93biBtZW51cyBvbiB0aGUgbGVmdCBzaWRlIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgLy8gVGhlc2UgcHVsbGRvd25zIGFyZSB1c2VkIHRvIHNwZWNpZnkgdGhlIGRhdGEgdHlwZSAtIG9yIHR5cGVzIC0gY29udGFpbmVkIGluIGVhY2hcbiAgICAgICAgLy8gcm93IG9mIHRoZSBwYXN0ZWQgZGF0YS5cbiAgICAgICAgcHVsbGRvd25PYmplY3RzOiBhbnlbXTtcbiAgICAgICAgcHVsbGRvd25TZXR0aW5nczogYW55W107XG4gICAgICAgIC8vIFdlIGFsc28ga2VlcCBhIHNldCBvZiBmbGFncyB0byB0cmFjayB3aGV0aGVyIGEgcHVsbGRvd24gd2FzIGNoYW5nZWQgYnkgYSB1c2VyIGFuZFxuICAgICAgICAvLyB3aWxsIG5vdCBiZSByZWNhbGN1bGF0ZWQuXG4gICAgICAgIHB1bGxkb3duVXNlckNoYW5nZWRGbGFnczogYW55W107XG5cbiAgICAgICAgZ3JhcGhFbmFibGVkOmJvb2xlYW47XG4gICAgICAgIGdyYXBoUmVmcmVzaFRpbWVySUQ6IGFueTtcblxuICAgICAgICAvLyBEYXRhIHN0cnVjdHVyZXMgcHVsbGVkIGZyb20gdGhlIGdyaWQgYW5kIGNvbXBvc2VkIGludG8gc2V0cyBzdWl0YWJsZSBmb3IgaGFuZGluZyB0b1xuICAgICAgICAvLyB0aGUgRUREIHNlcnZlclxuICAgICAgICBwYXJzZWRTZXRzOiBhbnlbXTtcbiAgICAgICAgdW5pcXVlTGluZUFzc2F5TmFtZXM6IGFueVtdO1xuICAgICAgICB1bmlxdWVNZWFzdXJlbWVudE5hbWVzOiBhbnlbXTtcbiAgICAgICAgdW5pcXVlTWV0YWRhdGFOYW1lczogYW55W107XG4gICAgICAgIC8vIEEgZmxhZyB0byBpbmRpY2F0ZSB3aGV0aGVyIHdlIGhhdmUgc2VlbiBhbnkgdGltZXN0YW1wcyBzcGVjaWZpZWQgaW4gdGhlIGltcG9ydCBkYXRhXG4gICAgICAgIHNlZW5BbnlUaW1lc3RhbXBzOiBib29sZWFuO1xuXG4gICAgICAgIHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXA7XG4gICAgICAgIG5leHRTdGVwQ2FsbGJhY2s6IGFueTtcblxuXG4gICAgICAgIGNvbnN0cnVjdG9yKHNlbGVjdE1ham9yS2luZFN0ZXA6IFNlbGVjdE1ham9yS2luZFN0ZXAsIHJhd0lucHV0U3RlcDogUmF3SW5wdXRTdGVwLCBuZXh0U3RlcENhbGxiYWNrOiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5yYXdJbnB1dFN0ZXAgPSByYXdJbnB1dFN0ZXA7XG5cbiAgICAgICAgICAgIHRoaXMucm93TGFiZWxDZWxscyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5jb2xDaGVja2JveENlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLmNvbE9iamVjdHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzID0gW107XG5cbiAgICAgICAgICAgIC8vIFdlIGtlZXAgYSBzaW5nbGUgZmxhZyBmb3IgZWFjaCBkYXRhIHBvaW50IFt5LHhdXG4gICAgICAgICAgICAvLyBhcyB3ZWxsIGFzIHR3byBsaW5lYXIgc2V0cyBvZiBmbGFncyBmb3IgZW5hYmxpbmcgb3IgZGlzYWJsaW5nXG4gICAgICAgICAgICAvLyBlbnRpcmUgY29sdW1ucy9yb3dzLlxuICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFncyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFncyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFncyA9IFtdO1xuXG4gICAgICAgICAgICAvLyBBcnJheXMgZm9yIHRoZSBwdWxsZG93biBtZW51cyBvbiB0aGUgbGVmdCBzaWRlIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgICAgIC8vIFRoZXNlIHB1bGxkb3ducyBhcmUgdXNlZCB0byBzcGVjaWZ5IHRoZSBkYXRhIHR5cGUgLSBvciB0eXBlcyAtIGNvbnRhaW5lZCBpbiBlYWNoXG4gICAgICAgICAgICAvLyByb3cgb2YgdGhlIHBhc3RlZCBkYXRhLlxuICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5ncyA9IFtdO1xuICAgICAgICAgICAgLy8gV2UgYWxzbyBrZWVwIGEgc2V0IG9mIGZsYWdzIHRvIHRyYWNrIHdoZXRoZXIgYSBwdWxsZG93biB3YXMgY2hhbmdlZCBieSBhIHVzZXIgYW5kXG4gICAgICAgICAgICAvLyB3aWxsIG5vdCBiZSByZWNhbGN1bGF0ZWQuXG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duVXNlckNoYW5nZWRGbGFncyA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLmdyYXBoRW5hYmxlZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQgPSBudWxsO1xuXG4gICAgICAgICAgICB0aGlzLnBhcnNlZFNldHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTGluZUFzc2F5TmFtZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlTWVhc3VyZW1lbnROYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVNZXRhZGF0YU5hbWVzID0gW107XG4gICAgICAgICAgICAvLyBBIGZsYWcgdG8gaW5kaWNhdGUgd2hldGhlciB3ZSBoYXZlIHNlZW4gYW55IHRpbWVzdGFtcHMgc3BlY2lmaWVkIGluIHRoZSBpbXBvcnQgZGF0YVxuICAgICAgICAgICAgdGhpcy5zZWVuQW55VGltZXN0YW1wcyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAgPSBzZWxlY3RNYWpvcktpbmRTdGVwO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrID0gbmV4dFN0ZXBDYWxsYmFjaztcblxuICAgICAgICAgICAgJCgnI2RhdGFUYWJsZURpdicpXG4gICAgICAgICAgICAgICAgLm9uKCdtb3VzZW92ZXIgbW91c2VvdXQnLCAndGQnLCB0aGlzLmhpZ2hsaWdodGVyRi5iaW5kKHRoaXMpKVxuICAgICAgICAgICAgICAgIC5vbignZGJsY2xpY2snLCAndGQnLCB0aGlzLnNpbmdsZVZhbHVlRGlzYWJsZXJGLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAkKCcjcmVzZXRFbmFibGVkRmxhZ01hcmtlcnMnKS5vbignY2xpY2snLCB0aGlzLnJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzLmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cblxuICAgICAgICBwcmV2aW91c1N0ZXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2YXIgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG5cbiAgICAgICAgICAgIHZhciBncmFwaCA9ICQoJyNncmFwaERpdicpO1xuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdzdGQnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ncmFwaEVuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JhcGgudG9nZ2xlQ2xhc3MoJ29mZicsICF0aGlzLmdyYXBoRW5hYmxlZCk7XG5cbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuICAgICAgICAgICAgdmFyIHJvd01hcmtlcnMgPSB0aGlzLnJhd0lucHV0U3RlcC5yb3dNYXJrZXJzO1xuICAgICAgICAgICAgdmFyIGlnbm9yZURhdGFHYXBzID0gdGhpcy5yYXdJbnB1dFN0ZXAuaWdub3JlRGF0YUdhcHM7XG5cbiAgICAgICAgICAgIGlmIChtb2RlID09PSAnc3RkJyB8fCBtb2RlID09PSAndHInIHx8IG1vZGUgPT09ICdwcicpIHtcbiAgICAgICAgICAgICAgICByb3dNYXJrZXJzLmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdHlwZTogYW55O1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlID0gdGhpcy5maWd1cmVPdXRUaGlzUm93c0RhdGFUeXBlKG1vZGUsIHZhbHVlLCBncmlkW2ldIHx8IFtdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IHR5cGU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgbWFwIG9mIGVuYWJsZWQvZGlzYWJsZWQgZmxhZ3MgZm9yIG91ciBkYXRhLFxuICAgICAgICAgICAgLy8gYnV0IG9ubHkgZmlsbCB0aGUgYXJlYXMgdGhhdCBkbyBub3QgYWxyZWFkeSBleGlzdC5cbiAgICAgICAgICAgIHRoaXMuaW5mZXJBY3RpdmVGbGFncyhncmlkKTtcbiAgICAgICAgICAgIC8vIENvbnN0cnVjdCB0YWJsZSBjZWxsIG9iamVjdHMgZm9yIHRoZSBwYWdlLCBiYXNlZCBvbiBvdXIgZXh0cmFjdGVkIGRhdGFcbiAgICAgICAgICAgIHRoaXMuY29uc3RydWN0RGF0YVRhYmxlKG1vZGUsIGdyaWQsIHJvd01hcmtlcnMpO1xuICAgICAgICAgICAgLy8gSW50ZXJwcmV0IHRoZSBkYXRhIGluIFN0ZXAgMyxcbiAgICAgICAgICAgIC8vIHdoaWNoIGludm9sdmVzIHNraXBwaW5nIGRpc2FibGVkIHJvd3Mgb3IgY29sdW1ucyxcbiAgICAgICAgICAgIC8vIG9wdGlvbmFsbHkgaWdub3JpbmcgYmxhbmsgdmFsdWVzLFxuICAgICAgICAgICAgLy8gYW5kIGxlYXZpbmcgb3V0IGFueSB2YWx1ZXMgdGhhdCBoYXZlIGJlZW4gaW5kaXZpZHVhbGx5IGZsYWdnZWQuXG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBzdHlsZXMgb2YgdGhlIG5ldyB0YWJsZSB0byByZWZsZWN0IHRoZVxuICAgICAgICAgICAgLy8gKHBvc3NpYmx5IHByZXZpb3VzbHkgc2V0KSBmbGFnIG1hcmtlcnMgYW5kIHRoZSBcImlnbm9yZSBnYXBzXCIgc2V0dGluZy5cbiAgICAgICAgICAgIHRoaXMucmVkcmF3SWdub3JlZFZhbHVlTWFya2VycyhpZ25vcmVEYXRhR2Fwcyk7XG4gICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgLy8gU3RhcnQgYSBkZWxheSB0aW1lciB0aGF0IHJlZHJhd3MgdGhlIGdyYXBoIGZyb20gdGhlIGludGVycHJldGVkIGRhdGEuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJhdGhlciByZXNvdXJjZSBpbnRlbnNpdmUsIHNvIHdlJ3JlIGRlbGF5aW5nIGEgYml0LCBhbmQgcmVzdGFydGluZyB0aGUgZGVsYXlcbiAgICAgICAgICAgIC8vIGlmIHRoZSB1c2VyIG1ha2VzIGFkZGl0aW9uYWwgZWRpdHMgdG8gdGhlIGRhdGEgd2l0aGluIHRoZSBkZWxheSBwZXJpb2QuXG4gICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgICAgIHRoaXMubmV4dFN0ZXBDYWxsYmFjaygpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUT0RPOiBHZXQgcmlkIG9mIHRoZSBtYWdpYyBudW1iZXJzIHVzZWQgaGVyZS5cbiAgICAgICAgZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZShtb2RlOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHJvdzogc3RyaW5nW10pOiBudW1iZXIge1xuICAgICAgICAgICAgdmFyIGJsYW5rOiBudW1iZXIsIHN0cmluZ3M6IG51bWJlciwgY29uZGVuc2VkOiBzdHJpbmdbXTtcbiAgICAgICAgICAgIGlmIChtb2RlID09ICd0cicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGFiZWwubWF0Y2goL2dlbmUvaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDEwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobGFiZWwubWF0Y2goL3Jwa20vaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDExO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBjYW4ndCBtYXRjaCB0byB0aGUgYWJvdmUgdHdvLCBzZXQgdGhlIHJvdyB0byAndW5kZWZpbmVkJyBzbyBpdCdzIGlnbm9yZWQgYnkgZGVmYXVsdFxuICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVGFrZSBjYXJlIG9mIHNvbWUgYnJhaW5kZWFkIGd1ZXNzZXNcbiAgICAgICAgICAgIGlmIChsYWJlbC5tYXRjaCgvYXNzYXkvaSkgfHwgbGFiZWwubWF0Y2goL2xpbmUvaSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtb2RlID09ICdwcicpIHtcbiAgICAgICAgICAgICAgICBpZiAobGFiZWwubWF0Y2goL3Byb3RlaW4vaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIDEyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBObyBwb2ludCBpbiBjb250aW51aW5nLCBvbmx5IGxpbmUgYW5kIHByb3RlaW4gYXJlIHJlbGV2YW50XG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBUaGluZ3Mgd2UnbGwgYmUgY291bnRpbmcgdG8gaGF6YXJkIGEgZ3Vlc3MgYXQgdGhlIHJvdyBjb250ZW50c1xuICAgICAgICAgICAgYmxhbmsgPSBzdHJpbmdzID0gMDtcbiAgICAgICAgICAgIC8vIEEgY29uZGVuc2VkIHZlcnNpb24gb2YgdGhlIHJvdywgd2l0aCBubyBudWxscyBvciBibGFuayB2YWx1ZXNcbiAgICAgICAgICAgIGNvbmRlbnNlZCA9IHJvdy5maWx0ZXIoKHY6IHN0cmluZyk6IGJvb2xlYW4gPT4gISF2KTtcbiAgICAgICAgICAgIGJsYW5rID0gcm93Lmxlbmd0aCAtIGNvbmRlbnNlZC5sZW5ndGg7XG4gICAgICAgICAgICBjb25kZW5zZWQuZm9yRWFjaCgodjogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdiA9IHYucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKHBhcnNlRmxvYXQodikpKSB7XG4gICAgICAgICAgICAgICAgICAgICsrc3RyaW5ncztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHRoZSBsYWJlbCBwYXJzZXMgaW50byBhIG51bWJlciBhbmQgdGhlIGRhdGEgY29udGFpbnMgbm8gc3RyaW5ncywgY2FsbCBpdCBhIHRpbXNldGFtcCBmb3IgZGF0YVxuICAgICAgICAgICAgaWYgKCFpc05hTihwYXJzZUZsb2F0KGxhYmVsKSkgJiYgKHN0cmluZ3MgPT09IDApKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBObyBjaG9pY2UgYnkgZGVmYXVsdFxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGluZmVyQWN0aXZlRmxhZ3MoZ3JpZDphbnkpOnZvaWQge1xuICAgICAgICAgICAgLy8gQW4gaW1wb3J0YW50IHRoaW5nIHRvIG5vdGUgaGVyZSBpcyB0aGF0IHRoaXMgZGF0YSBpcyBpbiBbeV1beF0gZm9ybWF0IC1cbiAgICAgICAgICAgIC8vIHRoYXQgaXMsIGl0IGdvZXMgYnkgcm93LCB0aGVuIGJ5IGNvbHVtbiwgd2hlbiByZWZlcmVuY2luZy5cbiAgICAgICAgICAgIC8vIFRoaXMgbWF0Y2hlcyBHcmlkLmRhdGEgYW5kIFRhYmxlLmRhdGFDZWxscy5cbiAgICAgICAgICAgIHZhciB4OiBudW1iZXIsIHk6IG51bWJlcjtcblxuICAgICAgICAgICAgKGdyaWRbMF0gfHwgW10pLmZvckVhY2goKF8sIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUNvbEZsYWdzW3hdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1t4XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZVJvd0ZsYWdzW3ldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFnc1t5XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV0gPSB0aGlzLmFjdGl2ZUZsYWdzW3ldIHx8IFtdO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChfLCB4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlRmxhZ3NbeV1beF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBjb25zdHJ1Y3REYXRhVGFibGUobW9kZTpzdHJpbmcsIGdyaWQ6YW55LCByb3dNYXJrZXJzOmFueSk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGNvbnRyb2xDb2xzOiBzdHJpbmdbXSwgcHVsbGRvd25PcHRpb25zOiBhbnlbXSxcbiAgICAgICAgICAgICAgICB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgY29sZ3JvdXA6IEpRdWVyeSwgYm9keTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQ7XG5cbiAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLmNvbENoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuY29sT2JqZWN0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5yb3dMYWJlbENlbGxzID0gW107XG4gICAgICAgICAgICB0aGlzLnJvd0NoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICAgICAgICAgIGNvbnRyb2xDb2xzID0gWydjaGVja2JveCcsICdwdWxsZG93bicsICdsYWJlbCddO1xuICAgICAgICAgICAgaWYgKG1vZGUgPT09ICd0cicpIHtcbiAgICAgICAgICAgICAgICBwdWxsZG93bk9wdGlvbnMgPSBbXG4gICAgICAgICAgICAgICAgICAgIFsnLS0nLCAwXSxcbiAgICAgICAgICAgICAgICAgICAgWydFbnRpcmUgUm93IElzLi4uJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgWydHZW5lIE5hbWVzJywgMTBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgWydSUEtNIFZhbHVlcycsIDExXVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtb2RlID09PSAncHInKSB7XG4gICAgICAgICAgICAgICAgcHVsbGRvd25PcHRpb25zID0gW1xuICAgICAgICAgICAgICAgICAgICBbJy0tJywgMF0sXG4gICAgICAgICAgICAgICAgICAgIFsnRW50aXJlIFJvdyBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIFsnQXNzYXkvTGluZSBOYW1lcycsIDFdLFxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgIFsnRmlyc3QgQ29sdW1uIElzLi4uJywgW1xuICAgICAgICAgICAgICAgICAgICAgICAgWydQcm90ZWluIE5hbWUnLCAxMl1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHVsbGRvd25PcHRpb25zID0gW1xuICAgICAgICAgICAgICAgICAgICBbJy0tJywgMF0sXG4gICAgICAgICAgICAgICAgICAgIFsnRW50aXJlIFJvdyBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIFsnQXNzYXkvTGluZSBOYW1lcycsIDFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgWydNZXRhYm9saXRlIE5hbWVzJywgMl1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICBbJ0ZpcnN0IENvbHVtbiBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIFsnVGltZXN0YW1wJywgM10sXG4gICAgICAgICAgICAgICAgICAgICAgICBbJ01ldGFkYXRhIE5hbWUnLCA0XSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFsnTWV0YWJvbGl0ZSBOYW1lJywgNV1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFuZCByZXBsYWNlIHRoZSB0YWJsZSBpbiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgICQoJyNkYXRhVGFibGVEaXYnKS5lbXB0eSgpO1xuXG4gICAgICAgICAgICAvLyBhdHRhY2ggYWxsIGV2ZW50IGhhbmRsZXJzIHRvIHRoZSB0YWJsZSBpdHNlbGZcbiAgICAgICAgICAgIHZhciB0ID0gdGhpcztcbiAgICAgICAgICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRhYmxlPicpLmF0dHIoJ2NlbGxzcGFjaW5nJywgJzAnKS5hcHBlbmRUbygkKCcjZGF0YVRhYmxlRGl2JykpXG4gICAgICAgICAgICAgICAgLm9uKCdjbGljaycsICdbbmFtZT1lbmFibGVDb2x1bW5dJywgKGV2OiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHQudG9nZ2xlVGFibGVDb2x1bW4oZXYudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9KS5vbignY2xpY2snLCAnW25hbWU9ZW5hYmxlUm93XScsIChldjogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0LnRvZ2dsZVRhYmxlUm93KGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgfSkub24oJ2NoYW5nZScsICcucHVsbGRvd25DZWxsID4gc2VsZWN0JywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnOiBKUXVlcnkgPSAkKGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHQuY2hhbmdlZFJvd0RhdGFUeXBlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJzZUludCh0YXJnLmF0dHIoJ2knKSwgMTApLCBwYXJzZUludCh0YXJnLnZhbCgpLCAxMCkpO1xuICAgICAgICAgICAgICAgIH0pWzBdO1xuICAgICAgICAgICAgLy8gT25lIG9mIHRoZSBvYmplY3RzIGhlcmUgd2lsbCBiZSBhIGNvbHVtbiBncm91cCwgd2l0aCBjb2wgb2JqZWN0cyBpbiBpdC5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgYW4gaW50ZXJlc3RpbmcgdHdpc3Qgb24gRE9NIGJlaGF2aW9yIHRoYXQgeW91IHNob3VsZCBwcm9iYWJseSBnb29nbGUuXG4gICAgICAgICAgICBjb2xncm91cCA9ICQoJzxjb2xncm91cD4nKS5hcHBlbmRUbyh0YWJsZSk7XG4gICAgICAgICAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAgICAgICAgIC8vIFN0YXJ0IHdpdGggdGhyZWUgY29sdW1ucywgZm9yIHRoZSBjaGVja2JveGVzLCBwdWxsZG93bnMsIGFuZCBsYWJlbHMuXG4gICAgICAgICAgICAvLyAoVGhlc2Ugd2lsbCBub3QgYmUgdHJhY2tlZCBpbiBUYWJsZS5jb2xPYmplY3RzLilcbiAgICAgICAgICAgIGNvbnRyb2xDb2xzLmZvckVhY2goKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQoJzxjb2w+JykuYXBwZW5kVG8oY29sZ3JvdXApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBhZGQgY29sIGVsZW1lbnRzIGZvciBlYWNoIGRhdGEgY29sdW1uXG4gICAgICAgICAgICAoZ3JpZFswXSB8fCBbXSkuZm9yRWFjaCgoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xPYmplY3RzLnB1c2goJCgnPGNvbD4nKS5hcHBlbmRUbyhjb2xncm91cClbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBGaXJzdCByb3c6IHNwYWNlciBjZWxscywgZm9sbG93ZWQgYnkgY2hlY2tib3ggY2VsbHMgZm9yIGVhY2ggZGF0YSBjb2x1bW5cbiAgICAgICAgICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PmJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAvLyBzcGFjZXIgY2VsbHMgaGF2ZSB4IGFuZCB5IHNldCB0byAwIHRvIHJlbW92ZSBmcm9tIGhpZ2hsaWdodCBncmlkXG4gICAgICAgICAgICBjb250cm9sQ29scy5mb3JFYWNoKCgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoeyAneCc6ICcwJywgJ3knOiAwIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAoZ3JpZFswXSB8fCBbXSkuZm9yRWFjaCgoXywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSwgYm94OiBKUXVlcnk7XG4gICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7ICdpZCc6ICdjb2xDQkNlbGwnICsgaSwgJ3gnOiAxICsgaSwgJ3knOiAwIH0pXG4gICAgICAgICAgICAgICAgICAgIC5hZGRDbGFzcygnY2hlY2tCb3hDZWxsJyk7XG4gICAgICAgICAgICAgICAgYm94ID0gJCgnPGlucHV0IHR5cGU9XCJjaGVja2JveFwiLz4nKS5hcHBlbmRUbyhjZWxsKVxuICAgICAgICAgICAgICAgICAgICAudmFsKGkudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZW5hYmxlQ29sdW1uJyArIGksICduYW1lJzogJ2VuYWJsZUNvbHVtbicgfSlcbiAgICAgICAgICAgICAgICAgICAgLnByb3AoJ2NoZWNrZWQnLCB0aGlzLmFjdGl2ZUNvbEZsYWdzW2ldKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbENoZWNrYm94Q2VsbHMucHVzaChjZWxsWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHMgPSBbXTsgIC8vIFdlIGRvbid0IHdhbnQgYW55IGxpbmdlcmluZyBvbGQgb2JqZWN0cyBpbiB0aGlzXG4gICAgICAgICAgICAvLyBUaGUgcmVzdCBvZiB0aGUgcm93czogQSBwdWxsZG93biwgYSBjaGVja2JveCwgYSByb3cgbGFiZWwsIGFuZCBhIHJvdyBvZiBkYXRhLlxuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKCh2YWx1ZXM6IHN0cmluZ1tdLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2VsbDogSlF1ZXJ5O1xuICAgICAgICAgICAgICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PmJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgLy8gY2hlY2tib3ggY2VsbFxuICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdjaGVja0JveENlbGwnKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdyb3dDQkNlbGwnICsgaSwgJ3gnOiAwLCAneSc6IGkgKyAxIH0pO1xuICAgICAgICAgICAgICAgICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIi8+JylcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZW5hYmxlUm93JyArIGksICduYW1lJzogJ2VuYWJsZVJvdycsIH0pXG4gICAgICAgICAgICAgICAgICAgIC52YWwoaS50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgICAucHJvcCgnY2hlY2tlZCcsIHRoaXMuYWN0aXZlUm93RmxhZ3NbaV0pXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJvd0NoZWNrYm94Q2VsbHMucHVzaChjZWxsWzBdKTtcbiAgICAgICAgICAgICAgICAvLyBwdWxsZG93biBjZWxsXG4gICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ3B1bGxkb3duQ2VsbCcpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ3Jvd1BDZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMSB9KTtcbiAgICAgICAgICAgICAgICAvLyB1c2UgZXhpc3Rpbmcgc2V0dGluZywgb3IgdXNlIHRoZSBsYXN0IGlmIHJvd3MubGVuZ3RoID4gc2V0dGluZ3MubGVuZ3RoLCBvciBibGFua1xuICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXVxuICAgICAgICAgICAgICAgICAgICB8fCB0aGlzLnB1bGxkb3duU2V0dGluZ3Muc2xpY2UoLTEpWzBdIHx8IDBcbiAgICAgICAgICAgICAgICB0aGlzLnBvcHVsYXRlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgICAgIGNlbGwgPSAkKCc8c2VsZWN0PicpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdyb3cnICsgaSArICd0eXBlJywgJ25hbWUnOiAncm93JyArIGkgKyAndHlwZScsICdpJzogaSB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpLFxuICAgICAgICAgICAgICAgICAgICBwdWxsZG93bk9wdGlvbnMsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgdGhpcy5wdWxsZG93bk9iamVjdHMucHVzaChjZWxsWzBdKTtcbiAgICAgICAgICAgICAgICAvLyBsYWJlbCBjZWxsXG4gICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7ICdpZCc6ICdyb3dNQ2VsbCcgKyBpLCAneCc6IDAsICd5JzogaSArIDEgfSk7XG4gICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KHJvd01hcmtlcnNbaV0pLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgIHRoaXMucm93TGFiZWxDZWxscy5wdXNoKGNlbGxbMF0pO1xuICAgICAgICAgICAgICAgIC8vIHRoZSB0YWJsZSBkYXRhIGl0c2VsZlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzW2ldID0gW107XG4gICAgICAgICAgICAgICAgdmFsdWVzLmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc2hvcnQ6IHN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBzaG9ydCA9IHZhbHVlIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoID4gMzIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNob3J0ID0gdmFsdWUuc3Vic3RyKDAsIDMxKSArICfigKYnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoe1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2lkJzogJ3ZhbENlbGwnICsgeCArICctJyArIGksXG4gICAgICAgICAgICAgICAgICAgICAgICAneCc6IHggKyAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3knOiBpICsgMSxcbiAgICAgICAgICAgICAgICAgICAgICAgICd0aXRsZSc6IHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2lzYmxhbmsnOiB2YWx1ZSA9PT0gJycgPyAxIDogdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQoc2hvcnQpLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFDZWxsc1tpXS5wdXNoKGNlbGxbMF0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmFwcGx5VGFibGVEYXRhVHlwZVN0eWxpbmcoZ3JpZCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEEgcmVjdXJzaXZlIGZ1bmN0aW9uIHRvIHBvcHVsYXRlIGEgcHVsbGRvd24gd2l0aCBvcHRpb25hbCBvcHRpb25ncm91cHMsXG4gICAgICAgIC8vIGFuZCBhIGRlZmF1bHQgc2VsZWN0aW9uXG4gICAgICAgIHBvcHVsYXRlUHVsbGRvd24oc2VsZWN0OkpRdWVyeSwgb3B0aW9uczpSb3dQdWxsZG93bk9wdGlvbltdLCB2YWx1ZTpudW1iZXIpOnZvaWQge1xuICAgICAgICAgICAgb3B0aW9ucy5mb3JFYWNoKChvcHRpb246IFJvd1B1bGxkb3duT3B0aW9uKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25bMV0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChvcHRpb25bMF0pLnZhbChvcHRpb25bMV0pXG4gICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBvcHRpb25bMV0gPT09IHZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKHNlbGVjdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb3B1bGF0ZVB1bGxkb3duKFxuICAgICAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGdyb3VwPicpLmF0dHIoJ2xhYmVsJywgb3B0aW9uWzBdKS5hcHBlbmRUbyhzZWxlY3QpLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uWzFdLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgcm91dGluZSBkb2VzIGEgYml0IG9mIGFkZGl0aW9uYWwgc3R5bGluZyB0byB0aGUgU3RlcCAzIGRhdGEgdGFibGUuXG4gICAgICAgIC8vIEl0IHJlbW92ZXMgYW5kIHJlLWFkZHMgdGhlIGRhdGFUeXBlQ2VsbCBjc3MgY2xhc3NlcyBhY2NvcmRpbmcgdG8gdGhlIHB1bGxkb3duIHNldHRpbmdzIGZvciBlYWNoIHJvdy5cbiAgICAgICAgYXBwbHlUYWJsZURhdGFUeXBlU3R5bGluZyhncmlkOmFueSk6dm9pZCB7XG5cbiAgICAgICAgICAgIGdyaWQuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgaW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBobExhYmVsOiBib29sZWFuLCBobFJvdzogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICBwdWxsZG93biA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1tpbmRleF0gfHwgMDtcbiAgICAgICAgICAgICAgICBobExhYmVsID0gaGxSb3cgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAocHVsbGRvd24gPT09IDEgfHwgcHVsbGRvd24gPT09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgaGxSb3cgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoMyA8PSBwdWxsZG93biAmJiBwdWxsZG93biA8PSA1KSB7XG4gICAgICAgICAgICAgICAgICAgIGhsTGFiZWwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAkKHRoaXMucm93TGFiZWxDZWxsc1tpbmRleF0pLnRvZ2dsZUNsYXNzKCdkYXRhVHlwZUNlbGwnLCBobExhYmVsKTtcbiAgICAgICAgICAgICAgICByb3cuZm9yRWFjaCgoXywgY29sOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzLmRhdGFDZWxsc1tpbmRleF1bY29sXSkudG9nZ2xlQ2xhc3MoJ2RhdGFUeXBlQ2VsbCcsIGhsUm93KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICByZWRyYXdJZ25vcmVkVmFsdWVNYXJrZXJzKGlnbm9yZURhdGFHYXBzOmJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YUNlbGxzLmZvckVhY2goKHJvdzogSFRNTEVsZW1lbnRbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChjZWxsOiBIVE1MRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIWlnbm9yZURhdGFHYXBzICYmICEhY2VsbC5nZXRBdHRyaWJ1dGUoJ2lzYmxhbmsnKTtcbiAgICAgICAgICAgICAgICAgICAgJChjZWxsKS50b2dnbGVDbGFzcygnaWdub3JlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5kYXRhQ2VsbHMuZm9yRWFjaCgocm93OiBIVE1MRWxlbWVudFtdLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIXRoaXMuYWN0aXZlUm93RmxhZ3NbeV07XG4gICAgICAgICAgICAgICAgJCh0aGlzLnJvd0xhYmVsQ2VsbHNbeV0pLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChjZWxsOiBIVE1MRWxlbWVudCwgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRvZ2dsZSA9ICF0aGlzLmFjdGl2ZUZsYWdzW3ldW3hdXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAhdGhpcy5hY3RpdmVDb2xGbGFnc1t4XVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIXRoaXMuYWN0aXZlUm93RmxhZ3NbeV07XG4gICAgICAgICAgICAgICAgICAgICQoY2VsbCkudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkTGluZScsIHRvZ2dsZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuY29sQ2hlY2tib3hDZWxscy5mb3JFYWNoKChib3g6IEhUTUxFbGVtZW50LCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIXRoaXMuYWN0aXZlQ29sRmxhZ3NbeF07XG4gICAgICAgICAgICAgICAgJChib3gpLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGludGVycHJldERhdGFUYWJsZVJvd3MoZ3JpZDphbnkpOltib29sZWFuLCBudW1iZXJdIHtcbiAgICAgICAgICAgIHZhciBzaW5nbGU6IG51bWJlciA9IDAsIG5vblNpbmdsZTogbnVtYmVyID0gMCwgZWFybGllc3ROYW1lOiBudW1iZXI7XG4gICAgICAgICAgICAvLyBMb29rIGZvciB0aGUgcHJlc2VuY2Ugb2YgXCJzaW5nbGUgbWVhc3VyZW1lbnQgdHlwZVwiIHJvd3MsIGFuZCByb3dzIG9mIGFsbCBvdGhlciBzaW5nbGUtaXRlbSB0eXBlc1xuICAgICAgICAgICAgZ3JpZC5mb3JFYWNoKChfLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVSb3dGbGFnc1t5XSkge1xuICAgICAgICAgICAgICAgICAgICBwdWxsZG93biA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1t5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHB1bGxkb3duID09PSA1IHx8IHB1bGxkb3duID09PSAxMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlKys7IC8vIFNpbmdsZSBNZWFzdXJlbWVudCBOYW1lIG9yIFNpbmdsZSBQcm90ZWluIE5hbWVcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gNCB8fCBwdWxsZG93biA9PT0gMykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9uU2luZ2xlKys7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEgJiYgZWFybGllc3ROYW1lID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVhcmxpZXN0TmFtZSA9IHk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoaXMgbW9kZSBpZiB0aGUgdGFibGUgaXMgZW50aXJlbHkgZnJlZSBvZiBzaW5nbGUtdGltZXN0YW1wIGFuZFxuICAgICAgICAgICAgLy8gc2luZ2xlLW1ldGFkYXRhIHJvd3MsIGFuZCBoYXMgYXQgbGVhc3Qgb25lIFwic2luZ2xlIG1lYXN1cmVtZW50XCIgcm93LCBhbmQgYXRcbiAgICAgICAgICAgIC8vIGxlYXN0IG9uZSBcIkFzc2F5L0xpbmUgbmFtZXNcIiByb3cuXG4gICAgICAgICAgICAvLyBOb3RlOiByZXF1aXJlbWVudCBvZiBhbiBcIkFzc2F5L0xpbmUgbmFtZXNcIiByb3cgcHJldmVudHMgdGhpcyBtb2RlIGZyb20gYmVpbmdcbiAgICAgICAgICAgIC8vIGVuYWJsZWQgd2hlbiB0aGUgcGFnZSBpcyBpbiAnVHJhbnNjcmlwdGlvbicgbW9kZS5cbiAgICAgICAgICAgIHJldHVybiBbKHNpbmdsZSA+IDAgJiYgbm9uU2luZ2xlID09PSAwICYmIGVhcmxpZXN0TmFtZSAhPT0gdW5kZWZpbmVkKSwgZWFybGllc3ROYW1lXTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY2hhbmdlZFJvd0RhdGFUeXBlUHVsbGRvd24oaW5kZXg6IG51bWJlciwgdmFsdWU6IG51bWJlcik6dm9pZCB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWQ6IG51bWJlcjtcblxuICAgICAgICAgICAgdmFyIGdyaWQgPSB0aGlzLnJhd0lucHV0U3RlcC5nZXRHcmlkKCk7XG5cbiAgICAgICAgICAgIC8vIFRoZSB2YWx1ZSBkb2VzIG5vdCBuZWNlc3NhcmlseSBtYXRjaCB0aGUgc2VsZWN0ZWRJbmRleC5cbiAgICAgICAgICAgIHNlbGVjdGVkID0gdGhpcy5wdWxsZG93bk9iamVjdHNbaW5kZXhdLnNlbGVjdGVkSW5kZXg7XG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaW5kZXhdID0gdmFsdWU7XG4gICAgICAgICAgICB0aGlzLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpbmRleF0gPSB0cnVlO1xuICAgICAgICAgICAgaWYgKCh2YWx1ZSA+PSAzICYmIHZhbHVlIDw9IDUpIHx8IHZhbHVlID09PSAxMikge1xuICAgICAgICAgICAgICAgIC8vIFwiVGltZXN0YW1wXCIsIFwiTWV0YWRhdGFcIiwgb3Igb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXNcbiAgICAgICAgICAgICAgICAvLyBTZXQgYWxsIHRoZSByZXN0IG9mIHRoZSBwdWxsZG93bnMgdG8gdGhpcyxcbiAgICAgICAgICAgICAgICAvLyBiYXNlZCBvbiB0aGUgYXNzdW1wdGlvbiB0aGF0IHRoZSBmaXJzdCBpcyBmb2xsb3dlZCBieSBtYW55IG90aGVyc1xuICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzLnNsaWNlKGluZGV4ICsgMSkuZXZlcnkoXG4gICAgICAgICAgICAgICAgICAgIChwdWxsZG93bjogSFRNTFNlbGVjdEVsZW1lbnQpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzZWxlY3Q6IEpRdWVyeSwgaTogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0ID0gJChwdWxsZG93bik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpID0gcGFyc2VJbnQoc2VsZWN0LmF0dHIoJ2knKSwgMTApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzW2ldXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGhpcy5wdWxsZG93blNldHRpbmdzW2ldICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBmYWxzZSBmb3IgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdC52YWwodmFsdWUudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBJbiBhZGRpdGlvbiB0byB0aGUgYWJvdmUgYWN0aW9uLCB3ZSBhbHNvIG5lZWQgdG8gZG8gc29tZSBjaGVja2luZyBvbiB0aGUgZW50aXJlIHNldCBvZlxuICAgICAgICAgICAgICAgIC8vIHB1bGxkb3ducywgdG8gZW5mb3JjZSBhIGRpdmlzaW9uIGJldHdlZW4gdGhlIFwiTWV0YWJvbGl0ZSBOYW1lXCIgc2luZ2xlIGRhdGEgdHlwZSBhbmQgdGhlXG4gICAgICAgICAgICAgICAgLy8gb3RoZXIgc2luZ2xlIGRhdGEgdHlwZXMuIElmIHRoZSB1c2VyIHVzZXMgZXZlbiBvbmUgXCJNZXRhYm9saXRlIE5hbWVcIiBwdWxsZG93biwgd2UgY2FuJ3RcbiAgICAgICAgICAgICAgICAvLyBhbGxvdyBhbnkgb2YgdGhlIG90aGVyIHR5cGVzLCBhbmQgdmljZS12ZXJzYS5cbiAgICAgICAgICAgICAgICAvLyAgIFdoeT8gIEJlY2F1c2UgXCJNZXRhYm9saXRlIE5hbWVcIiBpcyB1c2VkIHRvIGxhYmVsIHRoZSBzcGVjaWZpYyBjYXNlIG9mIGEgdGFibGUgdGhhdFxuICAgICAgICAgICAgICAgIC8vIGRvZXMgbm90IGNvbnRhaW4gYSB0aW1lc3RhbXAgb24gZWl0aGVyIGF4aXMuICBJbiB0aGF0IGNhc2UsIHRoZSB0YWJsZSBpcyBtZWFudCB0b1xuICAgICAgICAgICAgICAgIC8vIHByb3ZpZGUgZGF0YSBmb3IgbXVsdGlwbGUgTWVhc3VyZW1lbnRzIGFuZCBBc3NheXMgZm9yIGEgc2luZ2xlIHVuc3BlY2lmaWVkIHRpbWUgcG9pbnQuXG4gICAgICAgICAgICAgICAgLy8gKFRoYXQgdGltZSBwb2ludCBpcyByZXF1ZXN0ZWQgbGF0ZXIgaW4gdGhlIFVJLilcbiAgICAgICAgICAgICAgICAvLyAgIElmIHdlIGFsbG93IGEgc2luZ2xlIHRpbWVzdGFtcCByb3csIHRoYXQgY3JlYXRlcyBhbiBpbmNvbnNpc3RlbnQgdGFibGUgdGhhdCBpc1xuICAgICAgICAgICAgICAgIC8vIGltcG9zc2libGUgdG8gaW50ZXJwcmV0LlxuICAgICAgICAgICAgICAgIC8vICAgSWYgd2UgYWxsb3cgYSBzaW5nbGUgbWV0YWRhdGEgcm93LCB0aGF0IGxlYXZlcyB0aGUgbWV0YWRhdGEgdW5jb25uZWN0ZWQgdG8gYSBzcGVjaWZpY1xuICAgICAgICAgICAgICAgIC8vIG1lYXN1cmVtZW50LCBtZWFuaW5nIHRoYXQgdGhlIG9ubHkgdmFsaWQgd2F5IHRvIGludGVycHJldCBpdCBpcyBhcyBMaW5lIG1ldGFkYXRhLiAgV2VcbiAgICAgICAgICAgICAgICAvLyBjb3VsZCBwb3RlbnRpYWxseSBzdXBwb3J0IHRoYXQsIGJ1dCBpdCB3b3VsZCBiZSB0aGUgb25seSBjYXNlIHdoZXJlIGRhdGEgaW1wb3J0ZWQgb25cbiAgICAgICAgICAgICAgICAvLyB0aGlzIHBhZ2UgZG9lcyBub3QgZW5kIHVwIGluIEFzc2F5cyAuLi4gYW5kIHRoYXQgY2FzZSBkb2Vzbid0IG1ha2UgbXVjaCBzZW5zZSBnaXZlblxuICAgICAgICAgICAgICAgIC8vIHRoYXQgdGhpcyBpcyB0aGUgQXNzYXkgRGF0YSBJbXBvcnQgcGFnZSFcbiAgICAgICAgICAgICAgICAvLyAgIEFueXdheSwgaGVyZSB3ZSBydW4gdGhyb3VnaCB0aGUgcHVsbGRvd25zLCBtYWtpbmcgc3VyZSB0aGF0IGlmIHRoZSB1c2VyIHNlbGVjdGVkXG4gICAgICAgICAgICAgICAgLy8gXCJNZXRhYm9saXRlIE5hbWVcIiwgd2UgYmxhbmsgb3V0IGFsbCByZWZlcmVuY2VzIHRvIFwiVGltZXN0YW1wXCIgYW5kIFwiTWV0YWRhdGFcIiwgYW5kXG4gICAgICAgICAgICAgICAgLy8gdmljZS12ZXJzYS5cbiAgICAgICAgICAgICAgICBncmlkLmZvckVhY2goKF8sIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYzogbnVtYmVyID0gdGhpcy5wdWxsZG93blNldHRpbmdzW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgPT09IDUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjID09PSAzIHx8IGMgPT09IDQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duT2JqZWN0c1tpXS5zZWxlY3RlZEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duU2V0dGluZ3NbaV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSAyKSB7IC8vIENhbid0IGFsbG93IFwiTWVhc3VyZW1lbnQgVHlwZXNcIiBzZXR0aW5nIGVpdGhlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25PYmplY3RzW2ldLnNlbGVjdGVkSW5kZXggPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoKHZhbHVlID09PSAzIHx8IHZhbHVlID09PSA0KSAmJiBjID09PSA1KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1bGxkb3duT2JqZWN0c1tpXS5zZWxlY3RlZEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVsbGRvd25TZXR0aW5nc1tpXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBJdCB3b3VsZCBzZWVtIGxvZ2ljYWwgdG8gcmVxdWlyZSBhIHNpbWlsYXIgY2hlY2sgZm9yIFwiUHJvdGVpbiBOYW1lXCIsIElEIDEyLCBidXQgaW4gcHJhY3RpY2VcbiAgICAgICAgICAgICAgICAvLyB0aGUgdXNlciBpcyBkaXNhbGxvd2VkIGZyb20gc2VsZWN0aW5nIGFueSBvZiB0aGUgb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXMgd2hlbiB0aGVcbiAgICAgICAgICAgICAgICAvLyBwYWdlIGlzIGluIFByb3Rlb21pY3MgbW9kZS4gIFNvIHRoZSBjaGVjayBpcyByZWR1bmRhbnQuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFwcGx5VGFibGVEYXRhVHlwZVN0eWxpbmcoZ3JpZCk7XG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdG9nZ2xlVGFibGVSb3coYm94OiBFbGVtZW50KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZTogbnVtYmVyLCBpbnB1dDogSlF1ZXJ5O1xuICAgICAgICAgICAgaW5wdXQgPSAkKGJveCk7XG4gICAgICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KGlucHV0LnZhbCgpLCAxMCk7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVJvd0ZsYWdzW3ZhbHVlXSA9IGlucHV0LnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgLy8gUmVzZXR0aW5nIGEgZGlzYWJsZWQgcm93IG1heSBjaGFuZ2UgdGhlIG51bWJlciBvZiByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHRvZ2dsZVRhYmxlQ29sdW1uKGJveDogRWxlbWVudCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgdmFsdWU6IG51bWJlciwgaW5wdXQ6IEpRdWVyeTtcbiAgICAgICAgICAgIGlucHV0ID0gJChib3gpO1xuICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludChpbnB1dC52YWwoKSwgMTApO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVDb2xGbGFnc1t2YWx1ZV0gPSBpbnB1dC5wcm9wKCdjaGVja2VkJyk7XG4gICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgdGhpcy5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAgICAgICAgIC8vIFJlc2V0dGluZyBhIGRpc2FibGVkIGNvbHVtbiBtYXkgY2hhbmdlIHRoZSByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzKCk6dm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuXG4gICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlRmxhZ3NbeV0gPSB0aGlzLmFjdGl2ZUZsYWdzW3ldIHx8IFtdO1xuICAgICAgICAgICAgICAgIHJvdy5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVSb3dGbGFnc1t5XSA9IHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIChncmlkWzBdIHx8IFtdKS5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUNvbEZsYWdzW3hdID0gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gRmxpcCBhbGwgdGhlIGNoZWNrYm94ZXMgb24gaW4gdGhlIGhlYWRlciBjZWxscyBmb3IgdGhlIGRhdGEgY29sdW1uc1xuICAgICAgICAgICAgJCgnI2RhdGFUYWJsZURpdicpLmZpbmQoJ1tuYW1lPWVuYWJsZUNvbHVtbl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAvLyBTYW1lIGZvciB0aGUgY2hlY2tib3hlcyBpbiB0aGUgcm93IGxhYmVsIGNlbGxzXG4gICAgICAgICAgICAkKCcjZGF0YVRhYmxlRGl2JykuZmluZCgnW25hbWU9ZW5hYmxlUm93XScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaW50ZXJwcmV0RGF0YVRhYmxlKCk6dm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBncmlkID0gdGhpcy5yYXdJbnB1dFN0ZXAuZ2V0R3JpZCgpO1xuICAgICAgICAgICAgdmFyIHJvd01hcmtlcnMgPSB0aGlzLnJhd0lucHV0U3RlcC5yb3dNYXJrZXJzO1xuICAgICAgICAgICAgdmFyIGlnbm9yZURhdGFHYXBzID0gdGhpcy5yYXdJbnB1dFN0ZXAuaWdub3JlRGF0YUdhcHM7XG5cbiAgICAgICAgICAgIC8vIFdlJ2xsIGJlIGFjY3VtdWxhdGluZyB0aGVzZSBmb3IgZGlzYW1iaWd1YXRpb24uXG4gICAgICAgICAgICAvLyBFYWNoIHVuaXF1ZSBrZXkgd2lsbCBnZXQgYSBkaXN0aW5jdCB2YWx1ZSwgcGxhY2luZyBpdCBpbiB0aGUgb3JkZXIgZmlyc3Qgc2VlblxuICAgICAgICAgICAgdmFyIHNlZW5Bc3NheUxpbmVOYW1lcyA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5NZWFzdXJlbWVudE5hbWVzID0ge307XG4gICAgICAgICAgICB2YXIgc2Vlbk1ldGFkYXRhTmFtZXMgPSB7fTtcbiAgICAgICAgICAgIC8vIEhlcmUncyBob3cgd2UgdHJhY2sgdGhlIGluZGV4ZXMgd2UgYXNzaWduIGFzIHZhbHVlcyBhYm92ZS5cbiAgICAgICAgICAgIHZhciBhc3NheUxpbmVOYW1lc0NvdW50ID0gMDtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudE5hbWVzQ291bnQgPSAwO1xuICAgICAgICAgICAgdmFyIG1ldGFkYXRhTmFtZXNDb3VudCA9IDA7XG5cbiAgICAgICAgICAgIC8vIEhlcmUgYXJlIHRoZSBhcnJheXMgd2Ugd2lsbCB1c2UgbGF0ZXJcbiAgICAgICAgICAgIHRoaXMucGFyc2VkU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVMaW5lQXNzYXlOYW1lcyA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVNZWFzdXJlbWVudE5hbWVzID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZU1ldGFkYXRhTmFtZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuc2VlbkFueVRpbWVzdGFtcHMgPSBmYWxzZTtcblxuICAgICAgICAgICAgLy8gVGhpcyBtb2RlIG1lYW5zIHdlIG1ha2UgYSBuZXcgXCJzZXRcIiBmb3IgZWFjaCBjZWxsIGluIHRoZSB0YWJsZSwgcmF0aGVyIHRoYW5cbiAgICAgICAgICAgIC8vIHRoZSBzdGFuZGFyZCBtZXRob2Qgb2YgbWFraW5nIGEgbmV3IFwic2V0XCIgZm9yIGVhY2ggY29sdW1uIGluIHRoZSB0YWJsZS5cbiAgICAgICAgICAgIHZhciBpbnRlcnByZXRNb2RlID0gdGhpcy5pbnRlcnByZXREYXRhVGFibGVSb3dzKGdyaWQpO1xuXG4gICAgICAgICAgICAvLyBUaGUgc3RhbmRhcmQgbWV0aG9kOiBNYWtlIGEgXCJzZXRcIiBmb3IgZWFjaCBjb2x1bW4gb2YgdGhlIHRhYmxlXG4gICAgICAgICAgICBpZiAoIWludGVycHJldE1vZGVbMF0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbE9iamVjdHMuZm9yRWFjaCgoXywgYzogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzZXQ6IGFueSwgdW5pcXVlVGltZXM6IG51bWJlcltdLCB0aW1lczogYW55LCBmb3VuZE1ldGE6IGJvb2xlYW47XG4gICAgICAgICAgICAgICAgICAgIC8vIFNraXAgaXQgaWYgdGhlIHdob2xlIGNvbHVtbiBpcyBkZWFjdGl2YXRlZFxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlQ29sRmxhZ3NbY10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgdGhlIGdyYXBoaW5nIG1vZHVsZVxuICAgICAgICAgICAgICAgICAgICAgICAgJ2xhYmVsJzogJ0NvbHVtbiAnICsgYyxcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0NvbHVtbiAnICsgYyxcbiAgICAgICAgICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc3VibWlzc2lvbiB0byB0aGUgZGF0YWJhc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICdwYXJzaW5nSW5kZXgnOiBjLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2Fzc2F5JzogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICdhc3NheU5hbWUnOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50VHlwZSc6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAnbWV0YWRhdGEnOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzaW5nbGVEYXRhJzogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBib3RoXG4gICAgICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IFtdXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHVuaXF1ZVRpbWVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHRpbWVzID0ge307XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kTWV0YSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHI6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmFjdGl2ZVJvd0ZsYWdzW3JdIHx8ICF0aGlzLmFjdGl2ZUZsYWdzW3JdW2NdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcHVsbGRvd24gPSB0aGlzLnB1bGxkb3duU2V0dGluZ3Nbcl07XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbCA9IHJvd01hcmtlcnNbcl0gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHJvd1tjXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcHVsbGRvd24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxMSkgeyAgLy8gVHJhbnNjcmlwdG9taWNzOiBSUEtNIHZhbHVlc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldC5zaW5nbGVEYXRhID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEwKSB7ICAvLyBUcmFuc2NyaXB0b21pY3M6IEdlbmUgbmFtZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50VHlwZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAzKSB7ICAgLy8gVGltZXN0YW1wc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsID0gbGFiZWwucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wID0gcGFyc2VGbG9hdChsYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTih0aW1lc3RhbXApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHdlJ3JlIGlnbm9yaW5nIGdhcHMsIHNraXAgb3V0IG9uIHJlY29yZGluZyB0aGlzIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaWdub3JlRGF0YUdhcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBhY3R1YWxseSBwcmVmZXIgbnVsbCBoZXJlLCB0byBpbmRpY2F0ZSBhIHBsYWNlaG9sZGVyIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aW1lc1t0aW1lc3RhbXBdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lc1t0aW1lc3RhbXBdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcy5wdXNoKHRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNlZW5BbnlUaW1lc3RhbXBzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxhYmVsID09PSAnJyB8fCB2YWx1ZSA9PT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOb3cgdGhhdCB3ZSd2ZSBkZWFsdCB3aXRoIHRpbWVzdGFtcHMsIHdlIHByb2NlZWQgb24gdG8gb3RoZXIgZGF0YSB0eXBlcy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBbGwgdGhlIG90aGVyIGRhdGEgdHlwZXMgZG8gbm90IGFjY2VwdCBhIGJsYW5rIHZhbHVlLCBzbyB3ZSB3ZWVkIHRoZW0gb3V0IG5vdy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxKSB7ICAgLy8gQXNzYXkvTGluZSBOYW1lc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiB2YWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2VlbkFzc2F5TGluZU5hbWVzW3ZhbHVlXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuQXNzYXlMaW5lTmFtZXNbdmFsdWVdID0gKythc3NheUxpbmVOYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUxpbmVBc3NheU5hbWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXQuYXNzYXkgPSBzZWVuQXNzYXlMaW5lTmFtZXNbdmFsdWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldC5hc3NheU5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAyKSB7ICAgLy8gTWV0YWJvbGl0ZSBOYW1lc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiB2YWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1lYXN1cmVtZW50TmFtZXNbdmFsdWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW3ZhbHVlXSA9ICsrbWVhc3VyZW1lbnROYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudFR5cGUgPSBzZWVuTWVhc3VyZW1lbnROYW1lc1t2YWx1ZV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gNCkgeyAgIC8vIE1ldGFkYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWV0YWRhdGFOYW1lc1tsYWJlbF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbk1ldGFkYXRhTmFtZXNbbGFiZWxdID0gKyttZXRhZGF0YU5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlTWV0YWRhdGFOYW1lcy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1ldGFkYXRhW3NlZW5NZXRhZGF0YU5hbWVzW2xhYmVsXV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZE1ldGEgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdW5pcXVlVGltZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpLmZvckVhY2goKHRpbWU6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0LmRhdGEucHVzaChbdGltZSwgdGltZXNbdGltZV1dKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIG9ubHkgc2F2ZSBpZiBhY2N1bXVsYXRlZCBzb21lIGRhdGEgb3IgbWV0YWRhdGFcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXF1ZVRpbWVzLmxlbmd0aCB8fCBmb3VuZE1ldGEgfHwgc2V0LnNpbmdsZURhdGEgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGFyc2VkU2V0cy5wdXNoKHNldCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBUaGUgYWx0ZXJuYXRlIG1ldGhvZDogQSBcInNldFwiIGZvciBldmVyeSBjZWxsIG9mIHRoZSB0YWJsZSwgd2l0aCB0aGUgdGltZXN0YW1wXG4gICAgICAgICAgICAgICAgLy8gdG8gYmUgZGV0ZXJtaW5lZCBsYXRlci5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xPYmplY3RzLmZvckVhY2goKF8sIGM6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2VsbFZhbHVlOiBzdHJpbmcsIHNldDogYW55O1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlQ29sRmxhZ3NbY10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjZWxsVmFsdWUgPSBncmlkW2ludGVycHJldE1vZGVbMV1dW2NdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBoYXZlbid0IHNlZW4gY2VsbFZhbHVlIGJlZm9yZSwgaW5jcmVtZW50IGFuZCBzdG9yZSB1bmlxdWVuZXNzIGluZGV4XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5Bc3NheUxpbmVOYW1lc1tjZWxsVmFsdWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VlbkFzc2F5TGluZU5hbWVzW2NlbGxWYWx1ZV0gPSArK2Fzc2F5TGluZU5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVMaW5lQXNzYXlOYW1lcy5wdXNoKGNlbGxWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBncmlkLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHI6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBsYWJlbDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuYWN0aXZlUm93RmxhZ3Nbcl0gfHwgIXRoaXMuYWN0aXZlRmxhZ3Nbcl1bY10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwdWxsZG93biA9IHRoaXMucHVsbGRvd25TZXR0aW5nc1tyXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYWJlbCA9IHJvd01hcmtlcnNbcl0gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSByb3dbY10gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwdWxsZG93biB8fCAhKHB1bGxkb3duID09PSA1IHx8IHB1bGxkb3duID09PSAxMikgfHwgIWxhYmVsIHx8ICF2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHRoZSBncmFwaGluZyBtb2R1bGUgKHdoaWNoIHdlIHdvbid0IGJlIHVzaW5nIGluIHRoaXMgbW9kZSwgYWN0dWFsbHkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdsYWJlbCc6ICdDb2x1bW4gJyArIGMgKyAnIHJvdyAnICsgcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiAnQ29sdW1uICcgKyBjICsgJyByb3cgJyArIHIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBzdWJtaXNzaW9uIHRvIHRoZSBkYXRhYmFzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAncGFyc2luZ0luZGV4JzogdGhpcy5wYXJzZWRTZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2Fzc2F5Jzogc2VlbkFzc2F5TGluZU5hbWVzW2NlbGxWYWx1ZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdhc3NheU5hbWUnOiBjZWxsVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudFR5cGUnOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnbWV0YWRhdGEnOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3NpbmdsZURhdGEnOiB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGJvdGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHB1bGxkb3duID09PSA1KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1lYXN1cmVtZW50TmFtZXNbbGFiZWxdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWVhc3VyZW1lbnROYW1lc1tsYWJlbF0gPSArK21lYXN1cmVtZW50TmFtZXNDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXQubWVhc3VyZW1lbnRUeXBlID0gc2Vlbk1lYXN1cmVtZW50TmFtZXNbbGFiZWxdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldC5uYW1lID0gbGFiZWw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudFR5cGUgPSBsYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJzZWRTZXRzLnB1c2goc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIGhpZ2hsaWdodGVyRihlOiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgICAgICAgICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgICAgICAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgICAgICAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICAgICAgICAgIGlmIChjZWxsLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHggPSBwYXJzZUludChjZWxsLmF0dHIoJ3gnKSwgMTApO1xuICAgICAgICAgICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICAgICAgICAgIGlmICh4KSB7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcy5jb2xPYmplY3RzW3ggLSAxXSkudG9nZ2xlQ2xhc3MoJ2hvdmVyTGluZXMnLCBlLnR5cGUgPT09ICdtb3VzZW92ZXInKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHkpIHtcbiAgICAgICAgICAgICAgICAgICAgY2VsbC5jbG9zZXN0KCd0cicpLnRvZ2dsZUNsYXNzKCdob3ZlckxpbmVzJywgZS50eXBlID09PSAnbW91c2VvdmVyJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBzaW5nbGVWYWx1ZURpc2FibGVyRihlOiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgICAgICAgICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgICAgICAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgICAgICAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICAgICAgICAgIGlmIChjZWxsLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHggPSBwYXJzZUludChjZWxsLmF0dHIoJ3gnKSwgMTApO1xuICAgICAgICAgICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICAgICAgICAgIGlmICh4ICYmIHkgJiYgeCA+IDAgJiYgeSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLS14O1xuICAgICAgICAgICAgICAgICAgICAtLXk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUZsYWdzW3ldW3hdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzW3ldW3hdID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZsYWdzW3ldW3hdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0U3RlcENhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBxdWV1ZUdyYXBoUmVtYWtlKCk6dm9pZCB7XG4gICAgICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICAgICAgICAgIC8vIFRoaXMgd2F5IHdlJ3JlIG5vdCBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuXG4gICAgICAgICAgICAvLyB0aGV5IGFyZSBtYWtpbmcgZmFzdCBlZGl0cy5cbiAgICAgICAgICAgIGlmICh0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdyYXBoRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQodGhpcy5yZW1ha2VHcmFwaEFyZWEuYmluZCh0aGlzKSwgNzAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVtYWtlR3JhcGhBcmVhKCk6dm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBtb2RlID0gdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZTtcblxuICAgICAgICAgICAgdGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEID0gMDtcbiAgICAgICAgICAgIGlmICghRUREQVRER3JhcGhpbmcgfHwgIXRoaXMuZ3JhcGhFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRUREQVRER3JhcGhpbmcuY2xlYXJBbGxTZXRzKCk7XG4gICAgICAgICAgICB2YXIgc2V0cyA9IHRoaXMucGFyc2VkU2V0cztcbiAgICAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCBpbiB0aGlzIG1vZGUsIGRyYXdpbmcgYSBncmFwaCBpcyBub25zZW5zaWNhbC5cbiAgICAgICAgICAgIGlmIChtb2RlID09PSBcInN0ZFwiKSB7XG4gICAgICAgICAgICAgICAgc2V0cy5mb3JFYWNoKChzZXQpID0+IEVEREFUREdyYXBoaW5nLmFkZE5ld1NldChzZXQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIEVEREFUREdyYXBoaW5nLmRyYXdTZXRzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgaW50ZXJmYWNlIEF1dG9DYWNoZSB7XG4gICAgICAgIGNvbXA6IGFueSxcbiAgICAgICAgbWV0YTogYW55LFxuICAgICAgICB1bml0OiBhbnksXG4gICAgICAgIG1ldGFib2xpdGU6IGFueVxuICAgIH1cblxuXG4gICAgLy8gVGhlIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBldmVyeXRoaW5nIGluIHRoZSBcIlN0ZXAgNFwiIGJveCB0aGF0IHlvdSBzZWUgb24gdGhlIGRhdGEgaW1wb3J0IHBhZ2UuXG4gICAgZXhwb3J0IGNsYXNzIFR5cGVEaXNhbWJpZ3VhdGlvblN0ZXAge1xuXG4gICAgICAgIGlkZW50aWZ5U3RydWN0dXJlc1N0ZXA6IElkZW50aWZ5U3RydWN0dXJlc1N0ZXA7XG5cbiAgICAgICAgLy8gVGhlc2Ugb2JqZWN0cyBob2xkIHN0cmluZyBrZXlzIHRoYXQgY29ycmVzcG9uZCB0byB1bmlxdWUgbmFtZXMgZm91bmQgZHVyaW5nIHBhcnNpbmcuXG4gICAgICAgIC8vIFRoZSBzdHJpbmcga2V5cyBwb2ludCB0byBleGlzdGluZyBhdXRvY29tcGxldGUgb2JqZWN0cyBjcmVhdGVkIHNwZWNpZmljYWxseSBmb3JcbiAgICAgICAgLy8gdGhvc2Ugc3RyaW5ncy4gIEFueSBzZWxlY3Rpb25zIHRoZSB1c2VyIGhhcyBhbHJlYWR5IHNldCB3aWxsIGJlIHByZXNlcnZlZCxcbiAgICAgICAgLy8gZXZlbiBhcyB0aGUgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBpcyBkZXN0cm95ZWQgYW5kIHJlbWFkZS5cblxuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgQXNzYXlzL0xpbmVzXG4gICAgICAgIGFzc2F5TGluZU9ialNldHM6IGFueTtcbiAgICAgICAgY3VycmVudGx5VmlzaWJsZUFzc2F5TGluZU9ialNldHM6IGFueVtdO1xuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgbWVhc3VyZW1lbnQgdHlwZXNcbiAgICAgICAgbWVhc3VyZW1lbnRPYmpTZXRzOiBhbnk7XG4gICAgICAgIGN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHM6IGFueVtdO1xuICAgICAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgbWV0YWRhdGFcbiAgICAgICAgbWV0YWRhdGFPYmpTZXRzOiBhbnk7XG4gICAgICAgIC8vIFRvIGdpdmUgdW5pcXVlIElEIHZhbHVlcyB0byBlYWNoIGF1dG9jb21wbGV0ZSBlbnRpdHkgd2UgY3JlYXRlXG4gICAgICAgIGF1dG9Db21wVUlEOiBudW1iZXI7XG5cbiAgICAgICAgYXV0b0NhY2hlOiBBdXRvQ2FjaGU7XG5cbiAgICAgICAgc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICAgICAgbmV4dFN0ZXBDYWxsYmFjazogYW55O1xuXG5cbiAgICAgICAgY29uc3RydWN0b3Ioc2VsZWN0TWFqb3JLaW5kU3RlcDogU2VsZWN0TWFqb3JLaW5kU3RlcCwgaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcDogSWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCwgbmV4dFN0ZXBDYWxsYmFjazogYW55KSB7XG5cbiAgICAgICAgICAgIHRoaXMuYXNzYXlMaW5lT2JqU2V0cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudE9ialNldHMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhZGF0YU9ialNldHMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuYXV0b0NvbXBVSUQgPSAwO1xuXG4gICAgICAgICAgICB0aGlzLmF1dG9DYWNoZSA9IHtcbiAgICAgICAgICAgICAgICBjb21wOiB7fSxcbiAgICAgICAgICAgICAgICBtZXRhOiB7fSxcbiAgICAgICAgICAgICAgICB1bml0OiB7fSxcbiAgICAgICAgICAgICAgICBtZXRhYm9saXRlOiB7fVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwID0gc2VsZWN0TWFqb3JLaW5kU3RlcDtcbiAgICAgICAgICAgIHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcCA9IGlkZW50aWZ5U3RydWN0dXJlc1N0ZXA7XG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2sgPSBuZXh0U3RlcENhbGxiYWNrO1xuXG4gICAgICAgICAgICB2YXIgcmVEb0xhc3RTdGVwT25DaGFuZ2UgPSBbJyNtYXN0ZXJBc3NheScsICcjbWFzdGVyTGluZScsICcjbWFzdGVyTUNvbXAnLCAnI21hc3Rlck1UeXBlJywgJyNtYXN0ZXJNVW5pdHMnXTtcbiAgICAgICAgICAgICQocmVEb0xhc3RTdGVwT25DaGFuZ2Uuam9pbignLCcpKS5vbignY2hhbmdlJywgdGhpcy5jaGFuZ2VkQU1hc3RlclB1bGxkb3duLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAkKCcjcmVzZXREaXNhbWJpZ3VhdGlvbkZpZWxkcycpLm9uKCdjbGljaycsIHRoaXMucmVzZXREaXNhbWJpZ3VhdGlvbkZpZWxkcy5iaW5kKHRoaXMpKTtcblxuICAgICAgICAgICAgLy8gZW5hYmxlIGF1dG9jb21wbGV0ZSBvbiBzdGF0aWNhbGx5IGRlZmluZWQgZmllbGRzXG4gICAgICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoJyNtYXN0ZXJNQ29tcCcsICdNZWFzdXJlbWVudENvbXBhcnRtZW50Jyk7XG4gICAgICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoJyNtYXN0ZXJNVHlwZScsICdHZW5lcmljT3JNZXRhYm9saXRlJywgRURERGF0YS5NZXRhYm9saXRlVHlwZXMgfHwge30pO1xuICAgICAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKCcjbWFzdGVyTVVuaXRzJywgJ01lYXN1cmVtZW50VW5pdCcpO1xuXG4gICAgICAgIH1cblxuXG4gICAgICAgIHByZXZpb3VzU3RlcENoYW5nZWQoKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnJlY29uZmlndXJlKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgU3RlcCA0IHRhYmxlOiAgQSBzZXQgb2Ygcm93cywgb25lIGZvciBlYWNoIHktYXhpcyBjb2x1bW4gb2YgZGF0YSxcbiAgICAgICAgLy8gd2hlcmUgdGhlIHVzZXIgY2FuIGZpbGwgb3V0IGFkZGl0aW9uYWwgaW5mb3JtYXRpb24gZm9yIHRoZSBwYXN0ZWQgdGFibGUuXG4gICAgICAgIHJlY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIG1vZGUgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgICAgICAgICAgdmFyIG1hc3RlclAgPSB0aGlzLnNlbGVjdE1ham9yS2luZFN0ZXAubWFzdGVyUHJvdG9jb2w7ICAgIC8vIFNob3V0LW91dHMgdG8gYSBtaWQtZ3JhZGUgcmFwcGVyXG5cbiAgICAgICAgICAgIHZhciBwYXJzZWRTZXRzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnBhcnNlZFNldHM7XG4gICAgICAgICAgICB2YXIgc2VlbkFueVRpbWVzdGFtcHMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAuc2VlbkFueVRpbWVzdGFtcHM7XG4gICAgICAgICAgICB2YXIgdW5pcXVlTWVhc3VyZW1lbnROYW1lcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC51bmlxdWVNZWFzdXJlbWVudE5hbWVzO1xuICAgICAgICAgICAgdmFyIHVuaXF1ZU1ldGFkYXRhTmFtZXMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAudW5pcXVlTWV0YWRhdGFOYW1lcztcblxuICAgICAgICAgICAgLy8gSW5pdGlhbGx5IGhpZGUgYWxsIHRoZSBTdGVwIDQgbWFzdGVyIHB1bGxkb3ducyBzbyB3ZSBjYW4gcmV2ZWFsIGp1c3QgdGhlIG9uZXMgd2UgbmVlZCBsYXRlclxuICAgICAgICAgICAgJCgnI21hc3RlckFzc2F5TGluZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNtYXN0ZXJNVHlwZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVMaW5lc0Fzc2F5c1NlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVNZXRhZGF0YVNlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZGlzYW1iaWd1YXRlQXNzYXlzVGFibGUnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICQoJyNkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNUYWJsZScpLnJlbW92ZSgpO1xuICAgICAgICAgICAgJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhVGFibGUnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIC8vIElmIG5vIHNldHMgdG8gc2hvdywgbGVhdmUgdGhlIGFyZWEgYmxhbmsgYW5kIHNob3cgdGhlICdlbnRlciBzb21lIGRhdGEhJyBiYW5uZXJcbiAgICAgICAgICAgIGlmIChwYXJzZWRTZXRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICQoJyNlbXB0eURpc2FtYmlndWF0aW9uTGFiZWwnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJCgnI2VtcHR5RGlzYW1iaWd1YXRpb25MYWJlbCcpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIC8vIElmIHBhcnNlZCBkYXRhIGV4aXN0cywgYnV0IGhhdmVuJ3Qgc2VlbiBhIHNpbmdsZSB0aW1lc3RhbXAgc2hvdyB0aGUgXCJtYXN0ZXIgdGltZXN0YW1wXCIgVUkuXG4gICAgICAgICAgICAkKCcjbWFzdGVyVGltZXN0YW1wRGl2JykudG9nZ2xlQ2xhc3MoJ29mZicsIHNlZW5BbnlUaW1lc3RhbXBzKTtcbiAgICAgICAgICAgIC8vIElmIHdlIGhhdmUgbm8gQXNzYXlzL0xpbmVzIGRldGVjdGVkIGZvciBkaXNhbWJpZ3VhdGlvbiwgYXNrIHRoZSB1c2VyIHRvIHNlbGVjdCBvbmUuXG4gICAgICAgICAgICB0aGlzLnJlbWFrZUFzc2F5TGluZVNlY3Rpb24odGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLm1hc3RlclByb3RvY29sKTtcbiAgICAgICAgICAgIC8vIElmIGluICdUcmFuc2NyaXB0aW9uJyBvciAnUHJvdGVvbWljcycgbW9kZSwgdGhlcmUgYXJlIG5vIG1lYXN1cmVtZW50IHR5cGVzIGludm9sdmVkLlxuICAgICAgICAgICAgLy8gc2tpcCB0aGUgbWVhc3VyZW1lbnQgc2VjdGlvbiwgYW5kIHByb3ZpZGUgc3RhdGlzdGljcyBhYm91dCB0aGUgZ2F0aGVyZWQgcmVjb3Jkcy5cbiAgICAgICAgICAgIGlmIChtb2RlID09PSBcInRyXCIgfHwgbW9kZSA9PT0gXCJwclwiKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8tb3BcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodW5pcXVlTWVhc3VyZW1lbnROYW1lcy5sZW5ndGggPT09IDAgJiYgc2VlbkFueVRpbWVzdGFtcHMpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBtZWFzdXJlbWVudHMgZm9yIGRpc2FtYmlndWF0aW9uLCBoYXZlIHRpbWVzdGFtcCBkYXRhID0+IGFzayB0aGUgdXNlciB0byBzZWxlY3Qgb25lXG4gICAgICAgICAgICAgICAgJCgnI21hc3Rlck1UeXBlRGl2JykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBoYXZlIG1lYXN1cmVtZW50IHR5cGVzLCBpbiBhcHByb3ByYXRlIG1vZGUsIHJlbWFrZSBtZWFzdXJlbWVudCBzZWN0aW9uXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1ha2VNZWFzdXJlbWVudFNlY3Rpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGRldGVjdGVkIGFueSBtZXRhZGF0YSB0eXBlcyBmb3IgZGlzYW1iaWd1YXRpb24sIGNyZWF0ZSBhIHNlY3Rpb25cbiAgICAgICAgICAgIGlmICh1bmlxdWVNZXRhZGF0YU5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbWFrZU1ldGFkYXRhU2VjdGlvbigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLm5leHRTdGVwQ2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVE9ETzogVGhpcyBmdW5jdGlvbiBzaG91bGQgcmVzZXQgYWxsIHRoZSBkaXNhbWJpZ3VhdGlvbiBmaWVsZHMgdG8gdGhlIHZhbHVlc1xuICAgICAgICAvLyB0aGF0IHdlcmUgYXV0by1kZXRlY3RlZCBpbiB0aGUgbGFzdCByZWZyZXNoIG9mIHRoZSBvYmplY3QuXG4gICAgICAgIHJlc2V0RGlzYW1iaWd1YXRpb25GaWVsZHMoKTogdm9pZCB7XG4gICAgICAgICAgICAvLyBHZXQgdG8gd29yayEhXG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlbWFrZUFzc2F5TGluZVNlY3Rpb24obWFzdGVyUDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQ7XG5cbiAgICAgICAgICAgIHZhciB1bmlxdWVMaW5lQXNzYXlOYW1lcyA9IHRoaXMuaWRlbnRpZnlTdHJ1Y3R1cmVzU3RlcC51bmlxdWVMaW5lQXNzYXlOYW1lcztcblxuICAgICAgICAgICAgaWYgKHVuaXF1ZUxpbmVBc3NheU5hbWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICQoJyNtYXN0ZXJBc3NheUxpbmVEaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIE90aGVyd2lzZSwgcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgQXNzYXlzL0xpbmVzXG4gICAgICAgICAgICAgICAgLy8gS2VlcCBhIHNlcGFyYXRlIHNldCBvZiBjb3JyZWxhdGlvbnMgYmV0d2VlbiBzdHJpbmcgYW5kIHB1bGxkb3ducyBmb3IgZWFjaFxuICAgICAgICAgICAgICAgIC8vIFByb3RvY29sLCBzaW5jZSBzYW1lIHN0cmluZyBjYW4gbWF0Y2ggZGlmZmVyZW50IEFzc2F5cywgYW5kIHRoZSBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICAvLyB3aWxsIGhhdmUgZGlmZmVyZW50IGNvbnRlbnQsIGluIGVhY2ggUHJvdG9jb2wuXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NheUxpbmVPYmpTZXRzW21hc3RlclBdID0ge307XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0cyA9IFtdO1xuICAgICAgICAgICAgICAgIHZhciB0ID0gdGhpcztcbiAgICAgICAgICAgICAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0YWJsZT4nKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVBc3NheXNUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKCQoJyNkaXNhbWJpZ3VhdGVMaW5lc0Fzc2F5c1NlY3Rpb24nKS5yZW1vdmVDbGFzcygnb2ZmJykpXG4gICAgICAgICAgICAgICAgICAgIC5vbignY2hhbmdlJywgJ3NlbGVjdCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdC51c2VyQ2hhbmdlZEFzc2F5TGluZURpc2FtKGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIH0pWzBdO1xuICAgICAgICAgICAgICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4kKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgICAgICAgICAgICAgIHVuaXF1ZUxpbmVBc3NheU5hbWVzLmZvckVhY2goKG5hbWU6IHN0cmluZywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkaXNhbTogYW55LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsIGRlZmF1bHRTZWw6IGFueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGw6IEpRdWVyeSwgYVNlbGVjdDogSlF1ZXJ5LCBsU2VsZWN0OiBKUXVlcnk7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtID0gdGhpcy5hc3NheUxpbmVPYmpTZXRzW21hc3RlclBdW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWRpc2FtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNhbSA9IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdFNlbCA9IHRoaXMuZGlzYW1iaWd1YXRlQW5Bc3NheU9yTGluZShuYW1lLCBpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZpcnN0IG1ha2UgYSB0YWJsZSByb3csIGFuZCBzYXZlIGEgcmVmZXJlbmNlIHRvIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNhbS5yb3dPYmogPSByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD5ib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTmV4dCwgYWRkIGEgdGFibGUgY2VsbCB3aXRoIHRoZSBzdHJpbmcgd2UgYXJlIGRpc2FtYmlndWF0aW5nXG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8ocm93Lmluc2VydENlbGwoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBOb3cgYnVpbGQgYW5vdGhlciB0YWJsZSBjZWxsIHRoYXQgd2lsbCBjb250YWluIHRoZSBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmNzcygndGV4dC1hbGlnbicsICdsZWZ0Jyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhU2VsZWN0ID0gJCgnPHNlbGVjdD4nKS5hcHBlbmRUbyhjZWxsKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5kYXRhKHsgJ3NldEJ5VXNlcic6IGZhbHNlLCAndmlzaWJsZUluZGV4JzogaSB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKCduYW1lJywgJ2Rpc2FtQXNzYXknICsgKGkgKyAxKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNhbS5hc3NheU9iaiA9IGFTZWxlY3RbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKGFTZWxlY3QpLnZhbCgnbmV3JylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCAhZGVmYXVsdFNlbC5hc3NheUlEKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIChBVERhdGEuZXhpc3RpbmdBc3NheXNbbWFzdGVyUF0gfHwgW10pLmZvckVhY2goKGlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IEFzc2F5UmVjb3JkLCBsaW5lOiBMaW5lUmVjb3JkLCBwcm90b2NvbDogYW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJykpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhhU2VsZWN0KS52YWwoaWQudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgZGVmYXVsdFNlbC5hc3NheUlEID09PSBpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGEgc3BhbiB0byBjb250YWluIHRoZSB0ZXh0IGxhYmVsIGZvciB0aGUgTGluZSBwdWxsZG93biwgYW5kIHRoZSBwdWxsZG93biBpdHNlbGZcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwgPSAkKCc8c3Bhbj4nKS50ZXh0KCdmb3IgTGluZTonKS50b2dnbGVDbGFzcygnb2ZmJywgISFkZWZhdWx0U2VsLmFzc2F5SUQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbFNlbGVjdCA9ICQoJzxzZWxlY3Q+JykuYXBwZW5kVG8oY2VsbCkuZGF0YSgnc2V0QnlVc2VyJywgZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ25hbWUnLCAnZGlzYW1MaW5lJyArIChpICsgMSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlzYW0ubGluZU9iaiA9IGxTZWxlY3RbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKGxTZWxlY3QpLnZhbCgnbmV3JylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCAhZGVmYXVsdFNlbC5saW5lSUQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQVREYXRhLmV4aXN0aW5nTGluZXMgaXMgb2YgdHlwZSB7aWQ6IG51bWJlcjsgbjogc3RyaW5nO31bXVxuICAgICAgICAgICAgICAgICAgICAgICAgKEFURGF0YS5leGlzdGluZ0xpbmVzIHx8IFtdKS5mb3JFYWNoKChsaW5lOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQobGluZS5uKS5hcHBlbmRUbyhsU2VsZWN0KS52YWwobGluZS5pZC50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBkZWZhdWx0U2VsLmxpbmVJRCA9PT0gbGluZS5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlMaW5lT2JqU2V0c1ttYXN0ZXJQXVtuYW1lXSA9IGRpc2FtO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICQoZGlzYW0ucm93T2JqKS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0cy5wdXNoKGRpc2FtKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVtYWtlTWVhc3VyZW1lbnRTZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHRhYmxlOiBIVE1MVGFibGVFbGVtZW50LCBib2R5OiBIVE1MVGFibGVFbGVtZW50LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQ7XG5cbiAgICAgICAgICAgIHZhciBtb2RlID0gdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLmludGVycHJldGF0aW9uTW9kZTtcbiAgICAgICAgICAgIHZhciB1bmlxdWVNZWFzdXJlbWVudE5hbWVzID0gdGhpcy5pZGVudGlmeVN0cnVjdHVyZXNTdGVwLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXM7XG5cbiAgICAgICAgICAgIC8vIHB1dCB0b2dldGhlciBhIGRpc2FtYmlndWF0aW9uIHNlY3Rpb24gZm9yIG1lYXN1cmVtZW50IHR5cGVzXG4gICAgICAgICAgICB2YXIgdCA9IHRoaXM7XG4gICAgICAgICAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0YWJsZT4nKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1RhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgICAgICAgICAub24oJ2NoYW5nZScsICdpbnB1dFt0eXBlPWhpZGRlbl0nLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gb25seSB3YXRjaCBmb3IgY2hhbmdlcyBvbiB0aGUgaGlkZGVuIHBvcnRpb24sIGxldCBhdXRvY29tcGxldGUgd29ya1xuICAgICAgICAgICAgICAgICAgICB0LnVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbShldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgIH0pWzBdO1xuICAgICAgICAgICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgICAgICAgICAvLyBIZWFkZXJzIGZvciB0aGUgdGFibGVcbiAgICAgICAgICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PmJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAkKCc8dGg+JykuYXR0cih7ICdjb2xzcGFuJzogMiB9KS5jc3MoJ3RleHQtYWxpZ24nLCAncmlnaHQnKS50ZXh0KCdDb21wYXJ0bWVudCcpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgICAgICAkKCc8dGg+JykudGV4dCgnVHlwZScpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgICAgICAkKCc8dGg+JykudGV4dChtb2RlID09PSAnc3RkJyA/ICdVbml0cycgOiAnJykuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgICAgIC8vIERvbmUgd2l0aCBoZWFkZXJzIHJvd1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzID0gW107ICAgLy8gRm9yIHVzZSBpbiBjYXNjYWRpbmcgdXNlciBzZXR0aW5nc1xuICAgICAgICAgICAgdW5pcXVlTWVhc3VyZW1lbnROYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBkaXNhbTogYW55O1xuICAgICAgICAgICAgICAgIGRpc2FtID0gdGhpcy5tZWFzdXJlbWVudE9ialNldHNbbmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKGRpc2FtICYmIGRpc2FtLnJvd09iaikge1xuICAgICAgICAgICAgICAgICAgICAkKGRpc2FtLnJvd09iaikuYXBwZW5kVG8oYm9keSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0gPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0ucm93T2JqID0gcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+Ym9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KG5hbWUpLmFwcGVuZFRvKHJvdy5pbnNlcnRDZWxsKCkpO1xuICAgICAgICAgICAgICAgICAgICBbJ2NvbXBPYmonLCAndHlwZU9iaicsICd1bml0c09iaiddLmZvckVhY2goKGF1dG86IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ2Rpc2FtRGF0YUNlbGwnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc2FtW2F1dG9dID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZShjZWxsKS5kYXRhKCd0eXBlJywgYXV0byk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50T2JqU2V0c1tuYW1lXSA9IGRpc2FtO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBUT0RPIHNpemluZyBzaG91bGQgYmUgaGFuZGxlZCBpbiBDU1NcbiAgICAgICAgICAgICAgICBkaXNhbS5jb21wT2JqLmF0dHIoJ3NpemUnLCA0KS5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKVxuICAgICAgICAgICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NQ29tcCcgKyAoaSArIDEpKTtcbiAgICAgICAgICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZGlzYW0uY29tcE9iaiwgJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnLCB0aGlzLmF1dG9DYWNoZS5jb21wKTtcbiAgICAgICAgICAgICAgICBkaXNhbS50eXBlT2JqLmF0dHIoJ3NpemUnLCA0NSkuZGF0YSgndmlzaWJsZUluZGV4JywgaSlcbiAgICAgICAgICAgICAgICAgICAgLm5leHQoKS5hdHRyKCduYW1lJywgJ2Rpc2FtTVR5cGUnICsgKGkgKyAxKSk7XG4gICAgICAgICAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLnR5cGVPYmosICdHZW5lcmljT3JNZXRhYm9saXRlJywgdGhpcy5hdXRvQ2FjaGUubWV0YWJvbGl0ZSk7XG4gICAgICAgICAgICAgICAgRUREX2F1dG8uaW5pdGlhbF9zZWFyY2goZGlzYW0udHlwZU9iaiwgbmFtZSk7XG4gICAgICAgICAgICAgICAgZGlzYW0udW5pdHNPYmouYXR0cignc2l6ZScsIDEwKS5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKVxuICAgICAgICAgICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NVW5pdHMnICsgKGkgKyAxKSk7XG4gICAgICAgICAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLnVuaXRzT2JqLCAnTWVhc3VyZW1lbnRVbml0JywgdGhpcy5hdXRvQ2FjaGUudW5pdCk7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgaW4gTURWIG1vZGUsIHRoZSB1bml0cyBwdWxsZG93bnMgYXJlIGlycmVsZXZhbnQuXG4gICAgICAgICAgICAgICAgZGlzYW0udW5pdHNPYmoudG9nZ2xlQ2xhc3MoJ29mZicsIG1vZGUgPT09ICdtZHYnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSgpO1xuICAgICAgICB9XG5cblxuICAgICAgICByZW1ha2VNZXRhZGF0YVNlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudDtcblxuICAgICAgICAgICAgdmFyIHVuaXF1ZU1ldGFkYXRhTmFtZXMgPSB0aGlzLmlkZW50aWZ5U3RydWN0dXJlc1N0ZXAudW5pcXVlTWV0YWRhdGFOYW1lcztcblxuICAgICAgICAgICAgLy8gcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgbWV0YWRhdGFcbiAgICAgICAgICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRhYmxlPicpXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZGlzYW1iaWd1YXRlTWV0YWRhdGFUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8oJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgICAgICAgICAub24oJ2NoYW5nZScsICdpbnB1dCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyBzaG91bGQgdGhlcmUgYmUgZXZlbnQgaGFuZGxpbmcgaGVyZSA/XG4gICAgICAgICAgICAgICAgfSlbMF07XG4gICAgICAgICAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAgICAgICAgIHVuaXF1ZU1ldGFkYXRhTmFtZXMuZm9yRWFjaCgobmFtZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgZGlzYW06IGFueTtcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHRoaXMubWV0YWRhdGFPYmpTZXRzW25hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChkaXNhbSAmJiBkaXNhbS5yb3dPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgJChkaXNhbS5yb3dPYmopLmFwcGVuZFRvKGJvZHkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtID0ge307XG4gICAgICAgICAgICAgICAgICAgIGRpc2FtLnJvd09iaiA9IHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PmJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChuYW1lKS5hcHBlbmRUbyhyb3cuaW5zZXJ0Q2VsbCgpKTtcbiAgICAgICAgICAgICAgICAgICAgZGlzYW0ubWV0YU9iaiA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUocm93Lmluc2VydENlbGwoKSkudmFsKG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1ldGFkYXRhT2JqU2V0c1tuYW1lXSA9IGRpc2FtO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkaXNhbS5tZXRhT2JqLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhJyArIChpICsgMSkpLmFkZENsYXNzKCdhdXRvY29tcF9hbHR5cGUnKVxuICAgICAgICAgICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhSGlkZGVuJyArIChpICsgMSkpO1xuICAgICAgICAgICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS5tZXRhT2JqLCAnQXNzYXlMaW5lTWV0YWRhdGFUeXBlJywgdGhpcy5hdXRvQ2FjaGUubWV0YSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gV2UgY2FsbCB0aGlzIHdoZW4gYW55IG9mIHRoZSAnbWFzdGVyJyBwdWxsZG93bnMgYXJlIGNoYW5nZWQgaW4gU3RlcCA0LlxuICAgICAgICAvLyBTdWNoIGNoYW5nZXMgbWF5IGFmZmVjdCB0aGUgYXZhaWxhYmxlIGNvbnRlbnRzIG9mIHNvbWUgb2YgdGhlIHB1bGxkb3ducyBpbiB0aGUgc3RlcC5cbiAgICAgICAgY2hhbmdlZEFNYXN0ZXJQdWxsZG93bigpOnZvaWQge1xuICAgICAgICAgICAgLy8gU2hvdyB0aGUgbWFzdGVyIGxpbmUgZHJvcGRvd24gaWYgdGhlIG1hc3RlciBhc3NheSBkcm9wZG93biBpcyBzZXQgdG8gbmV3XG4gICAgICAgICAgICAkKCcjbWFzdGVyTGluZVNwYW4nKS50b2dnbGVDbGFzcygnb2ZmJywgJCgnI21hc3RlckFzc2F5JykudmFsKCkgIT09ICduZXcnKTtcbiAgICAgICAgICAgIHRoaXMucmVjb25maWd1cmUoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBzZXJ2ZXMgdHdvIHB1cnBvc2VzLlxuICAgICAgICAvLyAxLiBJZiB0aGUgZ2l2ZW4gQXNzYXkgZGlzYW1iaWd1YXRpb24gcHVsbGRvd24gaXMgYmVpbmcgc2V0IHRvICduZXcnLCByZXZlYWwgdGhlIGFkamFjZW50XG4gICAgICAgIC8vICAgIExpbmUgcHVsbGRvd24sIG90aGVyd2lzZSBoaWRlIGl0LlxuICAgICAgICAvLyAyLiBJZiB0aGUgcHVsbGRvd24gaXMgYmVpbmcgc2V0IHRvICduZXcnLCB3YWxrIGRvd24gdGhlIHJlbWFpbmluZyBwdWxsZG93bnMgaW4gdGhlIHNlY3Rpb24sXG4gICAgICAgIC8vICAgIGluIG9yZGVyLCBzZXR0aW5nIHRoZW0gdG8gJ25ldycgYXMgd2VsbCwgc3RvcHBpbmcganVzdCBiZWZvcmUgYW55IHB1bGxkb3duIG1hcmtlZCBhc1xuICAgICAgICAvLyAgICBiZWluZyAnc2V0IGJ5IHRoZSB1c2VyJy5cbiAgICAgICAgdXNlckNoYW5nZWRBc3NheUxpbmVEaXNhbShhc3NheUVsOiBFbGVtZW50KTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOiBKUXVlcnksIHY6IG51bWJlcjtcbiAgICAgICAgICAgIGNoYW5nZWQgPSAkKGFzc2F5RWwpLmRhdGEoJ3NldEJ5VXNlcicsIHRydWUpO1xuICAgICAgICAgICAgLy8gVGhlIHNwYW4gd2l0aCB0aGUgY29ycmVzcG9uZGluZyBMaW5lIHB1bGxkb3duIGlzIGFsd2F5cyByaWdodCBuZXh0IHRvIHRoZSBBc3NheSBwdWxsZG93blxuICAgICAgICAgICAgY2hhbmdlZC5uZXh0KCkudG9nZ2xlQ2xhc3MoJ29mZicsIGNoYW5nZWQudmFsKCkgIT09ICduZXcnKTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VkLnZhbCgpICE9PSAnbmV3Jykge1xuICAgICAgICAgICAgICAgIC8vIHN0b3AgaGVyZSBmb3IgYW55dGhpbmcgb3RoZXIgdGhhbiAnbmV3Jzsgb25seSAnbmV3JyBjYXNjYWRlcyB0byBmb2xsb3dpbmcgcHVsbGRvd25zXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdiA9IGNoYW5nZWQuZGF0YSgndmlzaWJsZUluZGV4JykgfHwgMDtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZUFzc2F5TGluZU9ialNldHMuc2xpY2UodikuZm9yRWFjaCgob2JqOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0OiBKUXVlcnkgPSAkKG9iai5hc3NheU9iaik7XG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdC5kYXRhKCdzZXRCeVVzZXInKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHNldCBkcm9wZG93biB0byAnbmV3JyBhbmQgcmV2ZWFsIHRoZSBsaW5lIHB1bGxkb3duXG4gICAgICAgICAgICAgICAgc2VsZWN0LnZhbCgnbmV3JykubmV4dCgpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cblxuICAgICAgICB1c2VyQ2hhbmdlZE1lYXN1cmVtZW50RGlzYW0oZWxlbWVudDogRWxlbWVudCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgaGlkZGVuOiBKUXVlcnksIGF1dG86IEpRdWVyeSwgdHlwZTogc3RyaW5nLCBpOiBudW1iZXI7XG4gICAgICAgICAgICBoaWRkZW4gPSAkKGVsZW1lbnQpO1xuICAgICAgICAgICAgYXV0byA9IGhpZGRlbi5wcmV2KCk7XG4gICAgICAgICAgICB0eXBlID0gYXV0by5kYXRhKCd0eXBlJyk7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ2NvbXBPYmonIHx8IHR5cGUgPT09ICd1bml0c09iaicpIHtcbiAgICAgICAgICAgICAgICBpID0gYXV0by5kYXRhKCdzZXRCeVVzZXInLCB0cnVlKS5kYXRhKCd2aXNpYmxlSW5kZXgnKSB8fCAwO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5zbGljZShpKS5zb21lKChvYmo6IGFueSk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sbG93aW5nOiBKUXVlcnkgPSAkKG9ialt0eXBlXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xsb3dpbmcubGVuZ3RoID09PSAwIHx8IGZvbGxvd2luZy5kYXRhKCdzZXRCeVVzZXInKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBicmVhazsgZm9yIHRoZSBBcnJheS5zb21lKCkgbG9vcFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIHVzaW5nIHBsYWNlaG9sZGVyIGluc3RlYWQgb2YgdmFsIHRvIGF2b2lkIHRyaWdnZXJpbmcgYXV0b2NvbXBsZXRlIGNoYW5nZVxuICAgICAgICAgICAgICAgICAgICBmb2xsb3dpbmcuYXR0cigncGxhY2Vob2xkZXInLCBhdXRvLnZhbCgpKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sbG93aW5nLm5leHQoKS52YWwoaGlkZGVuLnZhbCgpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gbm90IGNoZWNraW5nIHR5cGVPYmo7IGZvcm0gc3VibWl0IHNlbmRzIHNlbGVjdGVkIHR5cGVzXG4gICAgICAgICAgICB0aGlzLmNoZWNrQWxsTWVhc3VyZW1lbnRDb21wYXJ0bWVudERpc2FtKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBsaXN0IG9mIGN1cnJlbnRseSB2aXNpYmxlIG1lYXN1cmVtZW50IGRpc2FtYmlndWF0aW9uIGZvcm0gZWxlbWVudHMsXG4gICAgICAgIC8vIGNoZWNraW5nIHRvIHNlZSBpZiBhbnkgb2YgdGhlICdjb21wYXJ0bWVudCcgZWxlbWVudHMgYXJlIHNldCB0byBhIG5vbi1ibGFuayB2YWx1ZS5cbiAgICAgICAgLy8gSWYgYW55IGFyZSwgYW5kIHdlJ3JlIGluIE1EViBkb2N1bWVudCBtb2RlLCBkaXNwbGF5IGEgd2FybmluZyB0aGF0IHRoZSB1c2VyIHNob3VsZFxuICAgICAgICAvLyBzcGVjaWZ5IGNvbXBhcnRtZW50cyBmb3IgYWxsIHRoZWlyIG1lYXN1cmVtZW50cy5cbiAgICAgICAgY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW0oKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBhbGxTZXQ6IGJvb2xlYW47XG4gICAgICAgICAgICB2YXIgbW9kZSA9IHRoaXMuc2VsZWN0TWFqb3JLaW5kU3RlcC5pbnRlcnByZXRhdGlvbk1vZGU7XG5cbiAgICAgICAgICAgIGFsbFNldCA9IHRoaXMuY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5ldmVyeSgob2JqOiBhbnkpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgaGlkZGVuOiBKUXVlcnkgPSBvYmouY29tcE9iai5uZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKG9iai5jb21wT2JqLmRhdGEoJ3NldEJ5VXNlcicpIHx8IChoaWRkZW4udmFsKCkgJiYgaGlkZGVuLnZhbCgpICE9PSAnMCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQoJyNub0NvbXBhcnRtZW50V2FybmluZycpLnRvZ2dsZUNsYXNzKCdvZmYnLCBtb2RlICE9PSAnbWR2JyAmJiBhbGxTZXQpO1xuICAgICAgICB9XG5cblxuICAgICAgICBkaXNhbWJpZ3VhdGVBbkFzc2F5T3JMaW5lKGFzc2F5T3JMaW5lOiBzdHJpbmcsIGN1cnJlbnRJbmRleDogbnVtYmVyKTphbnkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbnM6IGFueSwgaGlnaGVzdDogbnVtYmVyLCBhc3NheXM6IG51bWJlcltdO1xuICAgICAgICAgICAgc2VsZWN0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBsaW5lSUQ6IDAsXG4gICAgICAgICAgICAgICAgYXNzYXlJRDogMFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwO1xuICAgICAgICAgICAgLy8gQVREYXRhLmV4aXN0aW5nQXNzYXlzIGlzIHR5cGUge1tpbmRleDogc3RyaW5nXTogbnVtYmVyW119XG4gICAgICAgICAgICBhc3NheXMgPSBBVERhdGEuZXhpc3RpbmdBc3NheXNbdGhpcy5zZWxlY3RNYWpvcktpbmRTdGVwLm1hc3RlclByb3RvY29sXSB8fCBbXTtcbiAgICAgICAgICAgIGFzc2F5cy5ldmVyeSgoaWQ6IG51bWJlciwgaTogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBBc3NheVJlY29yZCwgbGluZTogTGluZVJlY29yZCwgcHJvdG9jb2w6IGFueSwgbmFtZTogc3RyaW5nO1xuICAgICAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5T3JMaW5lLnRvTG93ZXJDYXNlKCkgPT09IG5hbWUudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZnVsbCBBc3NheSBuYW1lLCBldmVuIGNhc2UtaW5zZW5zaXRpdmUsIGlzIHRoZSBiZXN0IG1hdGNoXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7ICAvLyBkbyBub3QgbmVlZCB0byBjb250aW51ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuOCAmJiBhc3NheU9yTGluZSA9PT0gYXNzYXkubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBbiBleGFjdC1jYXNlIG1hdGNoIHdpdGggdGhlIEFzc2F5IG5hbWUgZnJhZ21lbnQgYWxvbmUgaXMgc2Vjb25kLWJlc3QuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjg7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNyAmJiBhc3NheS5uYW1lLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgd2hvbGUgc3RyaW5nIGluc2lkZSB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCBpcyBwcmV0dHkgZ29vZFxuICAgICAgICAgICAgICAgICAgICBoaWdoZXN0ID0gMC43O1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjYgJiYgbGluZS5uYW1lLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgd2hvbGUgc3RyaW5nIGluc2lkZSB0aGUgb3JpZ2luYXRpbmcgTGluZSBuYW1lIGlzIGdvb2QgdG9vLlxuICAgICAgICAgICAgICAgICAgICAvLyBJdCBtZWFucyB0aGF0IHRoZSB1c2VyIG1heSBpbnRlbmQgdG8gcGFpciB3aXRoIHRoaXMgQXNzYXkgZXZlbiB0aG91Z2ggdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc2F5IG5hbWUgaXMgZGlmZmVyZW50LiAgXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjY7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNCAmJlxuICAgICAgICAgICAgICAgICAgICAobmV3IFJlZ0V4cCgnKF58XFxcXFcpJyArIGFzc2F5Lm5hbWUgKyAnKFxcXFxXfCQpJywgJ2cnKSkudGVzdChhc3NheU9yTGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCB3aXRoaW4gdGhlIHdob2xlIHN0cmluZywgYXMgYSB3aG9sZSB3b3JkLCBpcyBvdXJcbiAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBvcHRpb24uXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjQ7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuMyAmJiBjdXJyZW50SW5kZXggPT09IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgYWxsIGVsc2UgZmFpbHMsIGNob29zZSBBc3NheSBvZiBjdXJyZW50IGluZGV4IGluIHNvcnRlZCBvcmRlci5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuMztcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBOb3cgd2UgcmVwZWF0IHRoZSBwcmFjdGljZSwgc2VwYXJhdGVseSwgZm9yIHRoZSBMaW5lIHB1bGxkb3duLlxuICAgICAgICAgICAgaGlnaGVzdCA9IDA7XG4gICAgICAgICAgICAvLyBBVERhdGEuZXhpc3RpbmdMaW5lcyBpcyB0eXBlIHtpZDogbnVtYmVyOyBuOiBzdHJpbmc7fVtdXG4gICAgICAgICAgICAoQVREYXRhLmV4aXN0aW5nTGluZXMgfHwgW10pLmV2ZXJ5KChsaW5lOiBhbnksIGk6IG51bWJlcik6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChhc3NheU9yTGluZSA9PT0gbGluZS5uKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBMaW5lIG5hbWUsIGNhc2Utc2Vuc2l0aXZlLCBpcyB0aGUgYmVzdCBtYXRjaFxuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgIC8vIGRvIG5vdCBuZWVkIHRvIGNvbnRpbnVlXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC44ICYmIGFzc2F5T3JMaW5lLnRvTG93ZXJDYXNlKCkgPT09IGxpbmUubi50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBzYW1lIHRoaW5nIGNhc2UtaW5zZW5zaXRpdmUgaXMgc2Vjb25kIGJlc3QuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjg7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjcgJiYgYXNzYXlPckxpbmUuaW5kZXhPZihsaW5lLm4pID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgTGluZSBuYW1lIHdpdGhpbiB0aGUgc3RyaW5nIGlzIG9kZCwgYnV0IGdvb2QuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjc7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjYgJiYgbGluZS5uLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgc3RyaW5nIHdpdGhpbiB0aGUgTGluZSBuYW1lIGlzIGFsc28gZ29vZC5cbiAgICAgICAgICAgICAgICAgICAgaGlnaGVzdCA9IDAuNjtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNSAmJiBjdXJyZW50SW5kZXggPT09IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWdhaW4sIGlmIGFsbCBlbHNlIGZhaWxzLCBqdXN0IGNob29zZSB0aGUgTGluZSB0aGF0IG1hdGNoZXMgdGhlIGN1cnJlbnQgaW5kZXhcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gc29ydGVkIG9yZGVyLCBpbiBhIGxvb3AuXG4gICAgICAgICAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjU7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBzZWxlY3Rpb25zO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cbiQod2luZG93KS5sb2FkKGZ1bmN0aW9uKCkge1xuICAgIEVERFRhYmxlSW1wb3J0Lm9uV2luZG93TG9hZCgpO1xufSk7XG5cblxuIl19