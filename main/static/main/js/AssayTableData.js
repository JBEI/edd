/// <reference path="lib/jquery.d.ts" />
/// <reference path="EDDDataInterface.ts" />
var EDDATD;
EDDATD = {
    // The Protocol for which we will be importing data.
    masterProtocol: 0,
    // The main mode we are interpreting data in.
    // Valid values sofar are "std", "mdv", "tr", "pr".
    interpretationMode: "std",
    processImportSettingsTimerID: 0,
    // Used to parse the Step 2 data into a null-padded rectangular grid
    Grid: {
        data: [],
        rowMarkers: [],
        transpose: false,
        // If the user deliberately chose to transpose or not transpose, disable the attempt
        // to auto-determine transposition.
        userClickedOnTranspose: false,
        // Whether to interpret the pasted data row-wise or column-wise, when importing
        // either measurements or metadata.
        ignoreDataGaps: false,
        userClickedOnIgnoreDataGaps: false
    },
    // Used to assemble and display the table components in Step 3
    Table: {
        rowLabelCells: [],
        colCheckboxCells: [],
        colObjects: [],
        dataCells: [],
        // We keep a single flag for each data point [y,x]
        // as well as two linear sets of flags for enabling or disabling
        // entire columns/rows.
        activeColFlags: [],
        activeRowFlags: [],
        activeFlags: [],
        // Arrays for the pulldown menus on the left side of the table.
        // These pulldowns are used to specify the data type - or types - contained in each
        // row of the pasted data.
        pulldownObjects: [],
        pulldownSettings: [],
        // We also keep a set of flags to track whether a pulldown was changed by a user and
        // will not be recalculated.
        pulldownUserChangedFlags: []
    },
    graphEnabled: 1,
    graphRefreshTimerID: 0,
    // Data structures pulled from the grid and composed into sets suitable for handing to
    // the EDD server
    Sets: {
        parsedSets: [],
        uniqueLineAssayNames: [],
        uniqueMeasurementNames: [],
        uniqueMetadataNames: [],
        // A flag to indicate whether we have seen any timestamps specified in the import data
        seenAnyTimestamps: false
    },
    // Storage area for disambiguation-related UI widgets and information
    Disam: {
        // These objects hold string keys that correspond to unique names found during parsing.
        // The string keys point to existing autocomplete objects created specifically for
        // those strings. As the disambiguation section is destroyed and remade, any selections
        // the user has already set will persevere.
        // For disambuguating Assays/Lines
        assayLineObjSets: {},
        currentlyVisibleAssayLineObjSets: [],
        // For disambuguating measurement types
        measurementObjSets: {},
        currentlyVisibleMeasurementObjSets: [],
        // For disambuguating metadata
        metadataObjSets: {},
        // To give unique ID values to each autocomplete entity we create
        autoCompUID: 0
    },
    AutoCache: {
        comp: {},
        meta: {},
        unit: {},
        metabolite: {}
    },
    changedMasterProtocol: function () {
        var protocolIn, assayIn, currentAssays;
        // check master protocol
        protocolIn = $('#masterProtocol');
        if (protocolIn.length === 0) {
            return;
        }
        if (EDDATD.masterProtocol === parseInt(protocolIn.val(), 10)) {
            // no change
            return;
        }
        EDDATD.masterProtocol = parseInt(protocolIn.val(), 10);
        // check for master assay
        assayIn = $('#masterAssay').empty();
        if (assayIn.length === 0) {
            return;
        }
        $('<option>').text('(Create New)').appendTo(assayIn).val('new').prop('selected', true);
        currentAssays = ATData.existingAssays[protocolIn.val()] || [];
        currentAssays.forEach(function (id) {
            var assay = EDDData.Assays[id], line = EDDData.Lines[assay.lid], protocol = EDDData.Protocols[assay.pid];
            $('<option>').appendTo(assayIn).val('' + id).text([
                line.name,
                protocol.name,
                assay.name
            ].join('-'));
        });
        if ($('#masterLineSpan').removeClass('off').length > 0) {
            EDDATD.queueProcessImportSettings();
        }
    },
    queueProcessImportSettings: function () {
        // Start a timer to wait before calling the routine that reparses the import settings.
        // This way we're calling the reparse just once, even when we get multiple cascaded
        // events that require it.
        if (EDDATD.processImportSettingsTimerID) {
            clearTimeout(EDDATD.processImportSettingsTimerID);
        }
        EDDATD.processImportSettingsTimerID = setTimeout(EDDATD.processImportSettings.bind(EDDATD), 5);
    },
    processImportSettings: function () {
        var stdLayout, trLayout, prLayout, mdvLayout, ignoreGaps, transpose, graph, rawFormat;
        stdLayout = $('#stdlayout');
        trLayout = $('#trlayout');
        prLayout = $('#prlayout');
        mdvLayout = $('#mdvlayout');
        ignoreGaps = $('#ignoreGaps');
        transpose = $('#transpose');
        graph = $('#graphDiv');
        rawFormat = $('#rawdataformatp');
        // all need to exist, or page is broken
        if (![stdLayout, trLayout, prLayout, mdvLayout, ignoreGaps, transpose, graph, rawFormat].every(function (item) { return item.length !== 0; })) {
            return;
        }
        if (stdLayout.prop('checked')) {
            EDDATD.interpretationMode = 'std';
            graph.removeClass('off'); // By default we will attempt to show a graph
            EDDATD.graphEnabled = 1;
        }
        else if (trLayout.prop('checked')) {
            EDDATD.interpretationMode = 'tr';
            graph.addClass('off');
            EDDATD.graphEnabled = 0;
        }
        else if (prLayout.prop('checked')) {
            EDDATD.interpretationMode = 'pr';
            graph.addClass('off');
            EDDATD.graphEnabled = 0;
        }
        else if (mdvLayout.prop('checked')) {
            EDDATD.interpretationMode = 'mdv';
            graph.addClass('off');
            EDDATD.graphEnabled = 0;
            // We neither ignore gaps, nor transpose, for MDV documents
            ignoreGaps.prop('checked', false);
            transpose.prop('checked', false);
            // JBEI MDV format documents are always pasted in from Excel, so they're always tab-separated
            rawFormat.val('tab');
            EDDATD.Table.pulldownSettings = [1, 5]; // A default set of pulldown settings for this mode
        }
        else {
            // If none of them are checked - WTF?  Don't parse or change anything.
            return;
        }
        EDDATD.Grid.ignoreDataGaps = ignoreGaps.prop('checked');
        EDDATD.Grid.transpose = transpose.prop('checked');
        EDDATD.parseAndDisplayText();
    },
    // This gets called when there is a paste event.
    pastedRawData: function () {
        // We do this using a timeout so the rest of the paste events fire, and get the pasted result.
        window.setTimeout(function () {
            if (EDDATD.interpretationMode !== "mdv") {
                var text = $('#textData').val() || '', test;
                test = text.split('\t').length >= text.split(',').length;
                $('#rawdataformatp').val(test ? 'tab' : 'csv');
            }
        }, 1);
    },
    parseRawInput: function (delimiter, mode) {
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
    },
    inferTransposeSetting: function (rows) {
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
            (rows || []).map(function (row) { return row[1]; })
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
        $('#transpose').prop('checked', setTranspose);
        EDDATD.Grid.transpose = setTranspose;
    },
    inferGapsSetting: function () {
        // Count the number of blank values at the end of each column
        // Count the number of blank values in between non-blank data
        // If more than three times as many as at the end, default to ignore gaps
        var intra = 0, extra = 0;
        EDDATD.Grid.data.forEach(function (row) {
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
        EDDATD.Grid.ignoreDataGaps = extra > (intra * 3);
        $('#ignoreGaps').prop('checked', EDDATD.Grid.ignoreDataGaps);
    },
    inferActiveFlags: function () {
        // An important thing to note here is that this data is in [y][x] format -
        // that is, it goes by row, then by column, when referencing.
        // This matches Grid.data and Table.dataCells.
        var x, y;
        (EDDATD.Grid.data[0] || []).forEach(function (_, x) {
            if (EDDATD.Table.activeColFlags[x] === undefined) {
                EDDATD.Table.activeColFlags[x] = true;
            }
        });
        EDDATD.Grid.data.forEach(function (row, y) {
            if (EDDATD.Table.activeRowFlags[y] === undefined) {
                EDDATD.Table.activeRowFlags[y] = true;
            }
            EDDATD.Table.activeFlags[y] = EDDATD.Table.activeFlags[y] || [];
            row.forEach(function (_, x) {
                if (EDDATD.Table.activeFlags[y][x] === undefined) {
                    EDDATD.Table.activeFlags[y][x] = true;
                }
            });
        });
    },
    processMdv: function (input) {
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
        EDDATD.Grid.rowMarkers = ['Assay'];
        // The first row is our label collection
        EDDATD.Grid.data[0] = colLabels.slice(0);
        // push the rest of the rows generated from ordered list of compounds
        Array.prototype.push.apply(EDDATD.Grid.data, orderedComp.map(function (name) {
            var compound, row, colLookup;
            EDDATD.Grid.rowMarkers.push(name);
            compound = compounds[name];
            row = [];
            colLookup = compound.processedAssayCols;
            // generate row cells by mapping column labels to processed columns
            Array.prototype.push.apply(row, colLabels.map(function (_, index) { return colLookup[index] || ''; }));
            return row;
        }));
    },
    // A recursive function to populate a pulldown with optional optiongroups,
    // and a default selection
    populatePulldown: function (select, options, value) {
        options.forEach(function (option) {
            if (typeof option[1] === 'number') {
                $('<option>').text(option[0]).val(option[1]).prop('selected', option[1] === value).appendTo(select);
            }
            else {
                EDDATD.populatePulldown($('<optgroup>').attr('label', option[0]).appendTo(select), option[1], value);
            }
        });
    },
    constructDataTable: function (mode) {
        var controlCols, pulldownOptions, table, colgroup, body, row;
        EDDATD.Table.dataCells = [];
        EDDATD.Table.colCheckboxCells = [];
        EDDATD.Table.colObjects = [];
        EDDATD.Table.rowLabelCells = [];
        EDDATD.Table.rowCheckboxCells = [];
        controlCols = ['checkbox', 'pulldown', 'label'];
        if (mode === 'tr') {
            pulldownOptions = [
                ['--', 0],
                ['Entire Row Is...', [
                    ['Gene Names', 10],
                    ['RPKM Values', 11]
                ]]
            ];
        }
        else if (mode === 'pr') {
            pulldownOptions = [
                ['--', 0],
                ['Entire Row Is...', [
                    ['Assay/Line Names', 1],
                ]],
                ['First Column Is...', [
                    ['Protein Name', 12]
                ]]
            ];
        }
        else {
            pulldownOptions = [
                ['--', 0],
                ['Entire Row Is...', [
                    ['Assay/Line Names', 1],
                    ['Metabolite Names', 2]
                ]],
                ['First Column Is...', [
                    ['Timestamp', 3],
                    ['Metadata Name', 4],
                    ['Metabolite Name', 5]
                ]]
            ];
        }
        // Remove and replace the table in the document
        // attach all event handlers to the table itself
        table = $('<table>').attr('cellspacing', '0').appendTo($('#dataTableDiv').empty()).on('click', '[name=enableColumn]', function (ev) {
            EDDATD.toggleTableColumn(ev.target);
        }).on('click', '[name=enableRow]', function (ev) {
            EDDATD.toggleTableRow(ev.target);
        }).on('change', '.pulldownCell > select', function (ev) {
            var targ = $(ev.target);
            EDDATD.changedRowDataTypePulldown(parseInt(targ.attr('i'), 10), parseInt(targ.val(), 10));
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
        (EDDATD.Grid.data[0] || []).forEach(function () {
            EDDATD.Table.colObjects.push($('<col>').appendTo(colgroup)[0]);
        });
        // First row: spacer cells, followed by checkbox cells for each data column
        row = body.insertRow();
        // spacer cells have x and y set to 0 to remove from highlight grid
        controlCols.forEach(function () {
            $(row.insertCell()).attr({ 'x': '0', 'y': 0 });
        });
        (EDDATD.Grid.data[0] || []).forEach(function (_, i) {
            var cell, box;
            cell = $(row.insertCell()).attr({ 'id': 'colCBCell' + i, 'x': 1 + i, 'y': 0 }).addClass('checkBoxCell');
            box = $('<input type="checkbox"/>').appendTo(cell).val(i.toString()).attr({ 'id': 'enableColumn' + i, 'name': 'enableColumn' }).prop('checked', EDDATD.Table.activeColFlags[i]);
            EDDATD.Table.colCheckboxCells.push(cell[0]);
        });
        EDDATD.Table.pulldownObjects = []; // We don't want any lingering old objects in this
        // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
        EDDATD.Grid.data.forEach(function (values, i) {
            var cell;
            row = body.insertRow();
            // checkbox cell
            cell = $(row.insertCell()).addClass('checkBoxCell').attr({ 'id': 'rowCBCell' + i, 'x': 0, 'y': i + 1 });
            $('<input type="checkbox"/>').attr({ 'id': 'enableRow' + i, 'name': 'enableRow' }).val(i.toString()).prop('checked', EDDATD.Table.activeRowFlags[i]).appendTo(cell);
            EDDATD.Table.rowCheckboxCells.push(cell[0]);
            // pulldown cell
            cell = $(row.insertCell()).addClass('pulldownCell').attr({ 'id': 'rowPCell' + i, 'x': 0, 'y': i + 1 });
            // use existing setting, or use the last if rows.length > settings.length, or blank
            EDDATD.Table.pulldownSettings[i] = EDDATD.Table.pulldownSettings[i] || EDDATD.Table.pulldownSettings.slice(-1)[0] || 0;
            EDDATD.populatePulldown(cell = $('<select>').attr({ 'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i }).appendTo(cell), pulldownOptions, EDDATD.Table.pulldownSettings[i]);
            EDDATD.Table.pulldownObjects.push(cell[0]);
            // label cell
            cell = $(row.insertCell()).attr({ 'id': 'rowMCell' + i, 'x': 0, 'y': i + 1 });
            $('<div>').text(EDDATD.Grid.rowMarkers[i]).appendTo(cell);
            EDDATD.Table.rowLabelCells.push(cell[0]);
            // the table data itself
            EDDATD.Table.dataCells[i] = [];
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
                EDDATD.Table.dataCells[i].push(cell[0]);
            });
        });
        EDDATD.applyTableDataTypeStyling();
    },
    parseAndDisplayText: function () {
        var mode, delimiter, rawFormat, input;
        mode = EDDATD.interpretationMode;
        delimiter = '\t';
        EDDATD.Grid.data = [];
        EDDATD.Grid.rowMarkers = [];
        rawFormat = $('#rawdataformatp');
        if (rawFormat.length === 0) {
            console.log("Can't find data format pulldown");
            return;
        }
        // If we're in "mdv" mode, lock the delimiter to tabs
        if (mode === 'mdv') {
            rawFormat.val('tab');
        }
        if (rawFormat.val() === 'csv') {
            delimiter = ',';
        }
        input = EDDATD.parseRawInput(delimiter, mode);
        if (mode === 'std' || mode === 'tr' || mode === 'pr') {
            // If the user hasn't deliberately chosen a setting for 'transpose', we will do
            // some analysis to attempt to guess which orientation the data needs to have.
            if (!EDDATD.Grid.userClickedOnTranspose) {
                EDDATD.inferTransposeSetting(input.input);
            }
            // Now that that's done, move the data into Grid.data
            if (EDDATD.Grid.transpose) {
                // first row becomes Y-markers as-is
                EDDATD.Grid.rowMarkers = input.input.shift();
                EDDATD.Grid.data = (input.input[0] || []).map(function (_, i) {
                    return input.input.map(function (row) { return row[i] || ''; });
                });
            }
            else {
                EDDATD.Grid.rowMarkers = [];
                EDDATD.Grid.data = (input.input || []).map(function (row) {
                    EDDATD.Grid.rowMarkers.push(row.shift());
                    return row;
                });
            }
            // If the user hasn't deliberately chosen to ignore, or accept, gaps in the data,
            // do a basic analysis to guess which setting makes more sense.
            if (!EDDATD.Grid.userClickedOnIgnoreDataGaps) {
                EDDATD.inferGapsSetting();
            }
            // Give labels to any header positions that got 'null' for a value.
            EDDATD.Grid.rowMarkers = EDDATD.Grid.rowMarkers.map(function (value) { return value || '?'; });
            // Attempt to auto-set any type pulldowns that haven't been deliberately set by the user
            EDDATD.Grid.rowMarkers.forEach(function (value, i) {
                var type;
                if (!EDDATD.Table.pulldownUserChangedFlags[i]) {
                    type = EDDATD.figureOutThisRowsDataType(value, EDDATD.Grid.data[i] || []);
                    EDDATD.Table.pulldownSettings[i] = type;
                }
            });
        }
        else if ((mode === "mdv") && (input.input.length > 1) && (input.columns > 1)) {
            EDDATD.processMdv(input.input);
        }
        // Create a map of enabled/disabled flags for our data,
        // but only fill the areas that do not already exist.
        EDDATD.inferActiveFlags();
        // Construct table cell objects for the page, based on our extracted data
        EDDATD.constructDataTable(mode);
        // Interpret the data in Step 3,
        // which involves skipping disabled rows or columns,
        // optionally ignoring blank values,
        // and leaving out any values that have been individually flagged.
        EDDATD.interpretDataTable();
        // Start a delay timer that redraws the graph from the interpreted data.
        // This is rather resource intensive, so we're delaying a bit, and restarting the delay
        // if the user makes additional edits to the data within the delay period.
        EDDATD.queueGraphRemake();
        // Update the styles of the new table to reflect the
        // (possibly previously set) flag markers and the "ignore gaps" setting.
        EDDATD.redrawIgnoredValueMarkers();
        EDDATD.redrawEnabledFlagMarkers();
        // Now that we're got the table from Step 3 built,
        // we turn to the table in Step 4:  A set for each type of data, conisting of disambiguation rows,
        // where the user can link unknown items to pre-existing EDD data.
        EDDATD.remakeInfoTable();
    },
    // This routine does a bit of additional styling to the Step 3 data table.
    // It removes and re-adds the dataTypeCell css classes according to the pulldown settings for each row.
    applyTableDataTypeStyling: function () {
        EDDATD.Grid.data.forEach(function (row, index) {
            var pulldown, hlLabel, hlRow;
            pulldown = EDDATD.Table.pulldownSettings[index] || 0;
            hlLabel = hlRow = false;
            if (pulldown === 1 || pulldown === 2) {
                hlRow = true;
            }
            else if (3 <= pulldown && pulldown <= 5) {
                hlLabel = true;
            }
            $(EDDATD.Table.rowLabelCells[index]).toggleClass('dataTypeCell', hlLabel);
            row.forEach(function (_, col) {
                $(EDDATD.Table.dataCells[index][col]).toggleClass('dataTypeCell', hlRow);
            });
        });
    },
    // We call this when any of the 'master' pulldowns are changed in Step 4.
    // Such changes may affect the available contents of some of the pulldowns in the step.
    changedAMasterPulldown: function () {
        // hide master line dropdown if master assay dropdown is set to new
        $('#masterLineSpan').toggleClass('off', $('#masterAssay').val() === 'new');
        EDDATD.remakeInfoTable();
    },
    clickedOnIgnoreDataGaps: function () {
        EDDATD.Grid.userClickedOnIgnoreDataGaps = true;
        EDDATD.queueProcessImportSettings(); // This will take care of reading the status of the checkbox
    },
    clickedOnTranspose: function () {
        EDDATD.Grid.userClickedOnTranspose = true;
        EDDATD.queueProcessImportSettings();
    },
    changedRowDataTypePulldown: function (index, value) {
        var selected;
        // The value does not necessarily match the selectedIndex.
        selected = EDDATD.Table.pulldownObjects[index].selectedIndex;
        EDDATD.Table.pulldownSettings[index] = value;
        EDDATD.Table.pulldownUserChangedFlags[index] = true;
        if ((value >= 3 && value <= 5) || value === 12) {
            // "Timestamp", "Metadata", or other single-table-cell types
            // Set all the rest of the pulldowns to this,
            // based on the assumption that the first is followed by many others
            EDDATD.Table.pulldownObjects.slice(index + 1).every(function (pulldown) {
                var select, i;
                select = $(pulldown);
                i = parseInt(select.attr('i'), 10);
                if (EDDATD.Table.pulldownUserChangedFlags[i] && EDDATD.Table.pulldownSettings[i] !== 0) {
                    return false; // false for break
                }
                select.val(value.toString());
                EDDATD.Table.pulldownSettings[i] = value;
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
            EDDATD.Grid.data.forEach(function (_, i) {
                var c = EDDATD.Table.pulldownSettings[i];
                if (value === 5) {
                    if (c === 3 || c === 4) {
                        EDDATD.Table.pulldownObjects[i].selectedIndex = 0;
                        EDDATD.Table.pulldownSettings[i] = 0;
                    }
                    else if (c === 2) {
                        EDDATD.Table.pulldownObjects[i].selectedIndex = 1;
                        EDDATD.Table.pulldownSettings[i] = 1;
                    }
                }
                else if ((value === 3 || value === 4) && c === 5) {
                    EDDATD.Table.pulldownObjects[i].selectedIndex = 0;
                    EDDATD.Table.pulldownSettings[i] = 0;
                }
            });
        }
        EDDATD.applyTableDataTypeStyling();
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    figureOutThisRowsDataType: function (label, row) {
        var blank, strings, condensed;
        if (EDDATD.interpretationMode == 'tr') {
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
        if (EDDATD.interpretationMode == 'pr') {
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
    },
    redrawIgnoredValueMarkers: function () {
        EDDATD.Table.dataCells.forEach(function (row) {
            row.forEach(function (cell) {
                var toggle = !EDDATD.Grid.ignoreDataGaps && !!cell.getAttribute('isblank');
                $(cell).toggleClass('ignoredLine', toggle);
            });
        });
    },
    toggleTableRow: function (box) {
        var value, input;
        input = $(box);
        value = parseInt(input.val(), 10);
        EDDATD.Table.activeRowFlags[value] = input.prop('checked');
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    toggleTableColumn: function (box) {
        var value, input;
        input = $(box);
        value = parseInt(input.val(), 10);
        EDDATD.Table.activeColFlags[value] = input.prop('checked');
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        // Resetting a disabled column may change the rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    resetEnabledFlagMarkers: function () {
        EDDATD.Grid.data.forEach(function (row, y) {
            EDDATD.Table.activeFlags[y] = EDDATD.Table.activeFlags[y] || [];
            row.forEach(function (_, x) {
                EDDATD.Table.activeFlags[y][x] = true;
            });
            EDDATD.Table.activeRowFlags[y] = true;
        });
        (EDDATD.Grid.data[0] || []).forEach(function (_, x) {
            EDDATD.Table.activeColFlags[x] = true;
        });
        // Flip all the checkboxes on in the header cells for the data columns
        $('#dataTableDiv').find('[name=enableColumn]').prop('checked', true);
        // Same for the checkboxes in the row label cells
        $('#dataTableDiv').find('[name=enableRow]').prop('checked', true);
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        EDDATD.remakeInfoTable();
    },
    redrawEnabledFlagMarkers: function () {
        EDDATD.Table.dataCells.forEach(function (row, y) {
            var toggle = !EDDATD.Table.activeRowFlags[y];
            $(EDDATD.Table.rowLabelCells[y]).toggleClass('disabledLine', toggle);
            row.forEach(function (cell, x) {
                toggle = !EDDATD.Table.activeFlags[y][x] || !EDDATD.Table.activeColFlags[x] || !EDDATD.Table.activeRowFlags[y];
                $(cell).toggleClass('disabledLine', toggle);
            });
        });
        EDDATD.Table.colCheckboxCells.forEach(function (box, x) {
            var toggle = !EDDATD.Table.activeColFlags[x];
            $(box).toggleClass('disabledLine', toggle);
        });
    },
    interpretDataTableRows: function () {
        var single = 0, nonSingle = 0, earliestName;
        // Look for the presence of "single measurement type" rows, and rows of all other single-item types
        EDDATD.Grid.data.forEach(function (_, y) {
            var pulldown;
            if (EDDATD.Table.activeRowFlags[y]) {
                pulldown = EDDATD.Table.pulldownSettings[y];
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
    },
    interpretDataTable: function () {
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
        EDDATD.Sets.parsedSets = [];
        EDDATD.Sets.uniqueLineAssayNames = [];
        EDDATD.Sets.uniqueMeasurementNames = [];
        EDDATD.Sets.uniqueMetadataNames = [];
        EDDATD.Sets.seenAnyTimestamps = false;
        // This mode means we make a new "set" for each cell in the table, rather than
        // the standard method of making a new "set" for each column in the table.
        var interpretMode = EDDATD.interpretDataTableRows();
        // The standard method: Make a "set" for each column of the table
        if (!interpretMode[0]) {
            EDDATD.Table.colObjects.forEach(function (_, c) {
                var set, uniqueTimes, times, foundMeta;
                // Skip it if the whole column is deactivated
                if (!EDDATD.Table.activeColFlags[c]) {
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
                EDDATD.Grid.data.forEach(function (row, r) {
                    var pulldown, label, value, timestamp;
                    if (!EDDATD.Table.activeRowFlags[r] || !EDDATD.Table.activeFlags[r][c]) {
                        return;
                    }
                    pulldown = EDDATD.Table.pulldownSettings[r];
                    label = EDDATD.Grid.rowMarkers[r] || '';
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
                                if (EDDATD.Grid.ignoreDataGaps) {
                                    return;
                                }
                                // We actually prefer null here, to indicate a placeholder value
                                value = null;
                            }
                            if (!times[timestamp]) {
                                times[timestamp] = value;
                                uniqueTimes.push(timestamp);
                                EDDATD.Sets.seenAnyTimestamps = true;
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
                            EDDATD.Sets.uniqueLineAssayNames.push(value);
                        }
                        set.assay = seenAssayLineNames[value];
                        set.assayName = value;
                        return;
                    }
                    else if (pulldown === 2) {
                        // If haven't seen value before, increment and store uniqueness index
                        if (!seenMeasurementNames[value]) {
                            seenMeasurementNames[value] = ++measurementNamesCount;
                            EDDATD.Sets.uniqueMeasurementNames.push(value);
                        }
                        set.measurementType = seenMeasurementNames[value];
                        return;
                    }
                    else if (pulldown === 4) {
                        if (!seenMetadataNames[label]) {
                            seenMetadataNames[label] = ++metadataNamesCount;
                            EDDATD.Sets.uniqueMetadataNames.push(label);
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
                    EDDATD.Sets.parsedSets.push(set);
                }
            });
        }
        else {
            EDDATD.Table.colObjects.forEach(function (_, c) {
                var cellValue, set;
                if (!EDDATD.Table.activeColFlags[c]) {
                    return;
                }
                cellValue = EDDATD.Grid.data[interpretMode[1]][c] || '';
                if (cellValue) {
                    // If haven't seen cellValue before, increment and store uniqueness index
                    if (!seenAssayLineNames[cellValue]) {
                        seenAssayLineNames[cellValue] = ++assayLineNamesCount;
                        EDDATD.Sets.uniqueLineAssayNames.push(cellValue);
                    }
                    EDDATD.Grid.data.forEach(function (row, r) {
                        var pulldown, label, value, timestamp;
                        if (!EDDATD.Table.activeRowFlags[r] || !EDDATD.Table.activeFlags[r][c]) {
                            return;
                        }
                        pulldown = EDDATD.Table.pulldownSettings[r];
                        label = EDDATD.Grid.rowMarkers[r] || '';
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
                            'parsingIndex': EDDATD.Sets.parsedSets.length,
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
                                EDDATD.Sets.uniqueMeasurementNames.push(label);
                            }
                            set.measurementType = seenMeasurementNames[label];
                        }
                        else if (pulldown === 12) {
                            set.name = label;
                            set.measurementType = label;
                        }
                        EDDATD.Sets.parsedSets.push(set);
                    });
                }
            });
        }
    },
    queueGraphRemake: function () {
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        if (EDDATD.graphRefreshTimerID) {
            clearTimeout(EDDATD.graphRefreshTimerID);
        }
        if (EDDATD.graphEnabled) {
            EDDATD.graphRefreshTimerID = setTimeout(EDDATD.remakeGraphArea.bind(EDDATD), 700);
        }
    },
    remakeGraphArea: function () {
        EDDATD.graphRefreshTimerID = 0;
        if (!EDDATDGraphing || !EDDATD.graphEnabled) {
            return;
        }
        EDDATDGraphing.clearAllSets();
        // If we're not in this mode, drawing a graph is nonsensical.
        if (EDDATD.interpretationMode === "std") {
            EDDATD.Sets.parsedSets.forEach(function (set) { return EDDATDGraphing.addNewSet(set); });
        }
        EDDATDGraphing.drawSets();
    },
    resetInfoTableFields: function () {
        // TOTALLY STUBBED
    },
    remakeInfoTableAssayLineSection: function (masterP) {
        var table, body;
        if (EDDATD.Sets.uniqueLineAssayNames.length === 0) {
            $('#masterAssayLineDiv').removeClass('off');
        }
        else {
            // Otherwise, put together a disambiguation section for Assays/Lines
            // Keep a separate set of correlations between string and pulldowns for each
            // Protocol, since same string can match different Assays, and the pulldowns
            // will have different content, in each Protocol.
            EDDATD.Disam.assayLineObjSets[masterP] = {};
            EDDATD.Disam.currentlyVisibleAssayLineObjSets = [];
            table = $('<table>').attr({ 'id': 'disambiguateAssaysTable', 'cellspacing': 0 }).appendTo($('#disambiguateLinesAssaysSection').removeClass('off')).on('change', 'select', function (ev) {
                EDDATD.userChangedAssayLineDisam(ev.target);
            })[0];
            body = $('<tbody>').appendTo(table)[0];
            EDDATD.Sets.uniqueLineAssayNames.forEach(function (name, i) {
                var disam, row, defaultSel, cell, aSelect, lSelect;
                disam = EDDATD.Disam.assayLineObjSets[masterP][name];
                if (!disam) {
                    disam = {};
                    defaultSel = EDDATD.disambiguateAnAssayOrLine(name, i);
                    // First make a table row, and save a reference to it
                    disam.rowObj = row = body.insertRow();
                    // Next, add a table cell with the string we are disambiguating
                    $('<div>').text(name).appendTo(row.insertCell());
                    // Now build another table cell that will contain the pulldowns
                    cell = $(row.insertCell()).css('text-align', 'left');
                    aSelect = $('<select>').appendTo(cell).data({ 'setByUser': false, 'visibleIndex': i }).attr('name', 'disamAssay' + (i + 1));
                    disam.assayObj = aSelect[0];
                    $('<option>').text('(Create New)').appendTo(aSelect).val('new').prop('selected', !defaultSel.assayID);
                    (ATData.existingAssays[masterP] || []).forEach(function (id) {
                        var assay, line, protocol;
                        assay = EDDData.Assays[id];
                        line = EDDData.Lines[assay.lid];
                        protocol = EDDData.Protocols[assay.pid];
                        $('<option>').text([line.name, protocol.name, assay.name].join('-')).appendTo(aSelect).val(id.toString()).prop('selected', defaultSel.assayID === id);
                    });
                    // a span to contain the text label for the Line pulldown, and the pulldown itself
                    cell = $('<span>').text('for Line:').toggleClass('off', !!defaultSel.assayID).appendTo(cell);
                    lSelect = $('<select>').appendTo(cell).data('setByUser', false).attr('name', 'disamLine' + (i + 1));
                    disam.lineObj = lSelect[0];
                    $('<option>').text('(Create New)').appendTo(lSelect).val('new').prop('selected', !defaultSel.lineID);
                    // ATData.existingLines is of type {id: number; n: string;}[]
                    (ATData.existingLines || []).forEach(function (line) {
                        $('<option>').text(line.n).appendTo(lSelect).val(line.id.toString()).prop('selected', defaultSel.lineID === line.id);
                    });
                    EDDATD.Disam.assayLineObjSets[masterP][name] = disam;
                }
                $(disam.rowObj).appendTo(body);
                EDDATD.Disam.currentlyVisibleAssayLineObjSets.push(disam);
            });
        }
    },
    remakeInfoTableMeasurementSection: function () {
        var table, body, row;
        // put together a disambiguation section for measurement types
        table = $('<table>').attr({ 'id': 'disambiguateMeasurementsTable', 'cellspacing': 0 }).appendTo($('#disambiguateMeasurementsSection').removeClass('off')).on('change', 'input[type=hidden]', function (ev) {
            // only watch for changes on the hidden portion, let autocomplete work
            EDDATD.userChangedMeasurementDisam(ev.target);
        })[0];
        body = $('<tbody>').appendTo(table)[0];
        // Headers for the table
        row = body.insertRow();
        $('<th>').attr({ 'colspan': 2 }).css('text-align', 'right').text('Compartment').appendTo(row);
        $('<th>').text('Type').appendTo(row);
        $('<th>').text(EDDATD.interpretationMode === 'std' ? 'Units' : '').appendTo(row);
        // Done with headers row
        EDDATD.Disam.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
        EDDATD.Sets.uniqueMeasurementNames.forEach(function (name, i) {
            var disam;
            disam = EDDATD.Disam.measurementObjSets[name];
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
                EDDATD.Disam.measurementObjSets[name] = disam;
            }
            // TODO sizing should be handled in CSS
            disam.compObj.attr('size', 4).data('visibleIndex', i).next().attr('name', 'disamMComp' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.compObj, 'MeasurementCompartment', EDDATD.AutoCache.comp);
            disam.typeObj.attr('size', 45).data('visibleIndex', i).next().attr('name', 'disamMType' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.typeObj, 'Metabolite', EDDATD.AutoCache.metabolite);
            disam.unitsObj.attr('size', 10).data('visibleIndex', i).next().attr('name', 'disamMUnits' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.unitsObj, 'MeasurementUnit', EDDATD.AutoCache.unit);
            // If we're in MDV mode, the units pulldowns are irrelevant.
            disam.unitsObj.toggleClass('off', EDDATD.interpretationMode === 'mdv');
        });
        EDDATD.checkAllMeasurementCompartmentDisam();
    },
    remakeInfoTableMetadataSection: function () {
        var table, body, row;
        // put together a disambiguation section for metadata
        table = $('<table>').attr({ 'id': 'disambiguateMetadataTable', 'cellspacing': 0 }).appendTo($('#disambiguateMetadataSection').removeClass('off')).on('change', 'input', function (ev) {
            // should there be event handling here ?
        })[0];
        body = $('<tbody>').appendTo(table)[0];
        EDDATD.Sets.uniqueMetadataNames.forEach(function (name, i) {
            var disam;
            disam = EDDATD.Disam.metadataObjSets[name];
            if (disam && disam.rowObj) {
                $(disam.rowObj).appendTo(body);
            }
            else {
                disam = {};
                disam.rowObj = row = body.insertRow();
                $('<div>').text(name).appendTo(row.insertCell());
                disam.metaObj = EDD_auto.create_autocomplete(row.insertCell()).val(name);
                EDDATD.Disam.metadataObjSets[name] = disam;
            }
            disam.metaObj.attr('name', 'disamMeta' + (i + 1)).addClass('autocomp_type').next().attr('name', 'disamMetaHidden' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.metaObj, 'MetadataType', EDDATD.AutoCache.meta);
        });
    },
    // Create the Step 4 table:  A set of rows, one for each y-axis column of data,
    // where the user can fill out additional information for the pasted table.
    remakeInfoTable: function () {
        var masterP = EDDATD.masterProtocol; // Shout-outs to a mid-grade rapper
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
        if (EDDATD.Sets.parsedSets.length === 0) {
            $('#emptyDisambiguationLabel').removeClass('off');
            return;
        }
        $('#emptyDisambiguationLabel').addClass('off');
        // If parsed data exists, but haven't seen a single timestamp show the "master timestamp" UI.
        $('#masterTimestampDiv').toggleClass('off', EDDATD.Sets.seenAnyTimestamps);
        // If we have no Assays/Lines detected for disambiguation, ask the user to select one.
        EDDATD.remakeInfoTableAssayLineSection(EDDATD.masterProtocol);
        // If in 'Transcription' or 'Proteomics' mode, there are no measurement types involved.
        // skip the measurement section, and provide statistics about the gathered records.
        if (EDDATD.interpretationMode === "tr" || EDDATD.interpretationMode === "pr") {
        }
        else if (EDDATD.Sets.uniqueMeasurementNames.length === 0 && EDDATD.Sets.seenAnyTimestamps) {
            // no measurements for disambiguation, have timestamp data => ask the user to select one
            $('#masterMTypeDiv').removeClass('off');
        }
        else {
            // have measurement types, in approprate mode, remake measurement section
            EDDATD.remakeInfoTableMeasurementSection();
        }
        // If we've detected any metadata types for disambiguation, create a section
        if (EDDATD.Sets.uniqueMetadataNames.length > 0) {
            EDDATD.remakeInfoTableMetadataSection();
        }
        // if the debug area is there, set its value to JSON of parsed sets
        $('#jsondebugarea').val(JSON.stringify(EDDATD.Sets.parsedSets));
    },
    // This function serves two purposes.
    // 1. If the given Assay disambiguation pulldown is being set to 'new', reveal the adjacent
    //    Line pulldown, otherwise hide it.
    // 2. If the pulldown is being set to 'new', walk down the remaining pulldowns in the section,
    //    in order, setting them to 'new' as well, stopping just before any pulldown marked as
    //    being 'set by the user'.
    userChangedAssayLineDisam: function (assayEl) {
        var changed, v;
        changed = $(assayEl).data('setByUser', true);
        // The span with the corresponding Line pulldown is always right next to the Assay pulldown
        changed.next().toggleClass('off', changed.val() !== 'new');
        if (changed.val() !== 'new') {
            // stop here for anything other than 'new'; only 'new' cascades to following pulldowns
            return false;
        }
        v = changed.data('visibleIndex') || 0;
        EDDATD.Disam.currentlyVisibleAssayLineObjSets.slice(v).forEach(function (obj) {
            var select = $(obj.assayObj);
            if (select.data('setByUser')) {
                return;
            }
            // set dropdown to 'new' and reveal the line pulldown
            select.val('new').next().removeClass('off');
        });
        return false;
    },
    userChangedMeasurementDisam: function (element) {
        var hidden, auto, type, i;
        hidden = $(element);
        auto = hidden.prev();
        type = auto.data('type');
        if (type === 'compObj' || type === 'unitsObj') {
            i = auto.data('setByUser', true).data('visibleIndex') || 0;
            EDDATD.Disam.currentlyVisibleMeasurementObjSets.slice(i).some(function (obj) {
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
        EDDATD.checkAllMeasurementCompartmentDisam();
    },
    // Run through the list of currently visible measurement disambiguation form elements,
    // checking to see if any of the 'compartment' elements are set to a non-blank value.
    // If any are, and we're in MDV document mode, display a warning that the user should
    // specify compartments for all their measurements.
    checkAllMeasurementCompartmentDisam: function () {
        var allSet;
        allSet = EDDATD.Disam.currentlyVisibleMeasurementObjSets.every(function (obj) {
            var hidden = obj.compObj.next();
            if (obj.compObj.data('setByUser') || (hidden.val() && hidden.val() !== '0')) {
                return true;
            }
            return false;
        });
        $('#noCompartmentWarning').toggleClass('off', EDDATD.interpretationMode !== 'mdv' && allSet);
    },
    disambiguateAnAssayOrLine: function (assayOrLine, currentIndex) {
        var selections, highest, assays;
        selections = {
            lineID: 0,
            assayID: 0
        };
        highest = 0;
        // ATData.existingAssays is type {[index: string]: number[]}
        assays = ATData.existingAssays[EDDATD.masterProtocol] || [];
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
            else if (highest < 0.4 && (new RegExp('(^|\\W)' + assay.name + '(\\W|$)', 'g')).test(assayOrLine)) {
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
    },
    highlighterF: function (e) {
        var cell, x, y;
        // Walk up the item tree until we arrive at a table cell,
        // so we can get the index of the table cell in the table.
        cell = $(e.target).closest('td');
        if (cell.length) {
            x = parseInt(cell.attr('x'), 10);
            y = parseInt(cell.attr('y'), 10);
            if (x) {
                $(EDDATD.Table.colObjects[x - 1]).toggleClass('hoverLines', e.type === 'mouseover');
            }
            if (y) {
                cell.closest('tr').toggleClass('hoverLines', e.type === 'mouseover');
            }
        }
    },
    singleValueDisablerF: function (e) {
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
                if (EDDATD.Table.activeFlags[y][x]) {
                    EDDATD.Table.activeFlags[y][x] = false;
                }
                else {
                    EDDATD.Table.activeFlags[y][x] = true;
                }
                EDDATD.interpretDataTable();
                EDDATD.queueGraphRemake();
                EDDATD.redrawEnabledFlagMarkers();
            }
        }
    },
    generateFormSubmission: function () {
        var json;
        // Run through the data sets one more time, pulling out any values in the pulldowns and
        // autocomplete elements in Step 4 and embedding them in their respective data sets.
        json = JSON.stringify(EDDATD.Sets.parsedSets);
        $('#jsonoutput').val(json);
        $('#jsondebugarea').val(json);
    },
    // This handles insertion of a tab into the textarea.
    // May be glitchy.
    suppressNormalTab: function (e) {
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
    },
    prepareIt: function () {
        var reProcessOnClick, reDoLastStepOnChange;
        reProcessOnClick = ['#stdlayout', '#trlayout', '#prlayout', '#mdvlayout', '#rawdataformatp'];
        reDoLastStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType', '#masterMUnits'];
        $('#textData').on('paste', EDDATD.pastedRawData).on('keyup', EDDATD.parseAndDisplayText).on('keydown', EDDATD.suppressNormalTab);
        $('#dataTableDiv').on('mouseover mouseout', 'td', EDDATD.highlighterF).on('dblclick', 'td', EDDATD.singleValueDisablerF);
        // This is rather a lot of callbacks, but we need to make sure we're
        // tracking the minimum number of elements with this call, since the
        // function called has such strong effects on the rest of the page.
        // For example, a user should be free to change "merge" to "replace" without having
        // their edits in Step 2 erased.
        $("#masterProtocol").change(EDDATD.changedMasterProtocol);
        // Using "change" for these because it's more efficient AND because it works around an
        // irritating Chrome inconsistency
        // For some of these, changing them shouldn't actually affect processing until we implement
        // an overwrite-checking feature or something similar
        $(reProcessOnClick.join(',')).on('click', EDDATD.queueProcessImportSettings);
        $(reDoLastStepOnChange.join(',')).on('change', EDDATD.changedAMasterPulldown);
        // enable autocomplete on statically defined fields
        EDD_auto.setup_field_autocomplete('#masterMComp', 'MeasurementCompartment');
        EDD_auto.setup_field_autocomplete('#masterMType', 'Metabolite', EDDData.MetaboliteTypes || {});
        EDD_auto.setup_field_autocomplete('#masterMUnits', 'MeasurementUnit');
        $('#ignoreGaps').click(EDDATD.clickedOnIgnoreDataGaps);
        $('#transpose').click(EDDATD.clickedOnTranspose);
        EDDATD.changedMasterProtocol(); //  Since the initial masterProtocol value is zero, we need to manually trigger this:
        EDDATD.queueProcessImportSettings();
    }
};
//# sourceMappingURL=AssayTableData.js.map