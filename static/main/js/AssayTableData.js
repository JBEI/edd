/// <reference path="lib/jquery.d.ts" />
/// <reference path="EDDDataInterface.ts" />
var EDDATD;
EDDATD = {
    // The Protocol for which we will be importing data.
    masterProtocol: 0,
    // The main mode we are interpreting data in.
    // Valid values sofar are "std", and "mdv".
    interpretationMode: "std",
    processImportSettingsTimerID: 0,
    // Used to parse the Step 2 data into a null-padded rectangular grid
    Grid: {
        data: [],
        rowMarkers: [],
        w: 0,
        l: 0,
        transpose: 0,
        // If the user deliberately chose to transpose or not transpose, disable the attempt
        // to auto-determine transposition.
        userClickedOnTranspose: 0,
        // Whether to interpret the pasted data row-wise or column-wise, when importing
        // either measurements or metadata.
        ignoreDataGaps: 0,
        userClickedOnIgnoreDataGaps: 0
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
        seenAnyTimestamps: 0
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
        if (EDDATD.masterProtocol === protocolIn.val()) {
            // no change
            return;
        }
        EDDATD.masterProtocol = protocolIn.val();
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
        if ([stdLayout, trLayout, prLayout, mdvLayout, ignoreGaps, transpose, graph, rawFormat].every(function (item) { return item.length !== 0; })) {
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
        for (x = 0; x < EDDATD.Grid.data[0].length; ++x) {
            if (typeof EDDATD.Table.activeColFlags[x] === 'undefined') {
                EDDATD.Table.activeColFlags[x] = true;
            }
        }
        for (y = 0; y < EDDATD.Grid.data.length; ++y) {
            if (typeof EDDATD.Table.activeRowFlags[y] === 'undefined') {
                EDDATD.Table.activeRowFlags[y] = true;
            }
            if (typeof EDDATD.Table.activeFlags[y] === 'undefined') {
                EDDATD.Table.activeFlags[y] = [];
            }
            for (x = 0; x < EDDATD.Grid.data[0].length; ++x) {
                if (typeof EDDATD.Table.activeFlags[y][x] === 'undefined') {
                    EDDATD.Table.activeFlags[y][x] = true;
                }
            }
        }
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
                index = parseInt(marked[1]);
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
            indices = $.map(value.originalRows, function (_, index) { return parseInt(index); });
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
            colLookup = compound.procesedAssayCols;
            // generate row cells by mapping column labels to processed columns
            Array.prototype.push.apply(row, colLabels.map(function (_, index) { return colLookup[index] || ''; }));
            return row;
        }));
    },
    // A recursive function to populate a pulldown with optional optiongroups,
    // and a default selection
    // TODO options typed as RowPulldownOption[]
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
            EDDATD.changedRowDataTypePulldown(targ.attr('i'), targ.val());
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
        EDDATD.Grid.data[0].forEach(function () {
            EDDATD.Table.colObjects.push($('<col>').appendTo(colgroup)[0]);
        });
        // First row: spacer cells, followed by checkbox cells for each data column
        row = body.insertRow();
        // spacer cells have x and y set to 0 to remove from highlight grid
        controlCols.forEach(function () {
            $(row.insertCell()).attr({ 'x': '0', 'y': 0 });
        });
        EDDATD.Grid.data[0].forEach(function (_, i) {
            var cell, box;
            cell = $(row.insertCell()).attr({ 'id': 'colCBCell' + i, 'x': 1 + i, 'y': 0 }).addClass('checkBoxCell');
            box = $('<input type="checkbox"/>').appendTo(cell).val(i.toString()).attr({ 'id': 'enableColumn' + i, 'name': 'enableColumn' }).prop('checked', EDDATD.Table.activeColFlags[i]);
            EDDATD.Table.colCheckboxCells.push(cell[0]);
        });
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
            EDDATD.populatePulldown($('<select>').attr({ 'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i }), pulldownOptions, EDDATD.Table.pulldownSettings[i] || 0);
            // label cell
            cell = $(row.insertCell()).attr({ 'id': 'rowMCell' + i, 'x': 0, 'y': i + 1 }).text(EDDATD.Grid.rowMarkers[i]);
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
                    type = EDDATD.figureOutThisRowsDataType(value, EDDATD.Grid.data[i]);
                    EDDATD.Table.pulldownSettings[i] = type;
                }
            });
        }
        else if ((mode === "mdv") && (input.input.length > 1) && (input.columns > 1)) {
            EDDATD.processMdv(input.input);
        }
        EDDATD.Grid.w = EDDATD.Grid.data[0].length;
        EDDATD.Grid.l = EDDATD.Grid.data.length;
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
        EDDATD.Grid.userClickedOnIgnoreDataGaps = 1;
        EDDATD.queueProcessImportSettings(); // This will take care of reading the status of the checkbox
    },
    clickedOnTranspose: function () {
        EDDATD.Grid.userClickedOnTranspose = 1;
        EDDATD.queueProcessImportSettings();
    },
    changedRowDataTypePulldown: function (index, value) {
        EDDATD.Table.pulldownSettings[index] = value;
        // The value does not necessarily match the selectedIndex.
        var selectedIndex = EDDATD.Table.pulldownObjects[index].selectedIndex;
        EDDATD.Table.pulldownUserChangedFlags[index] = 1;
        if (((value >= 3) && (value <= 5)) || (value == 12)) {
            for (var o = index + 1; o < EDDATD.Grid.l; o++) {
                // If we encounter a field set deliberately by the user to a nonzero value, stop.
                if (EDDATD.Table.pulldownUserChangedFlags[o] && (EDDATD.Table.pulldownSettings[o] != 0)) {
                    break;
                }
                EDDATD.Table.pulldownObjects[o].selectedIndex = selectedIndex;
                EDDATD.Table.pulldownSettings[o] = value;
            }
            for (var o = 0; o < EDDATD.Grid.l; o++) {
                var cValue = EDDATD.Table.pulldownSettings[o];
                if (value == 5) {
                    if ((cValue == 3) || (cValue == 4)) {
                        EDDATD.Table.pulldownObjects[o].selectedIndex = 0;
                        EDDATD.Table.pulldownSettings[o] = 0;
                    }
                    if (cValue == 2) {
                        EDDATD.Table.pulldownObjects[o].selectedIndex = 1;
                        EDDATD.Table.pulldownSettings[o] = 1;
                    }
                }
                else if (((value == 3) || (value == 4)) && (cValue == 5)) {
                    EDDATD.Table.pulldownObjects[o].selectedIndex = 0;
                    EDDATD.Table.pulldownSettings[o] = 0;
                }
            }
        }
        EDDATD.applyTableDataTypeStyling();
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    figureOutThisRowsDataType: function (label, row) {
        if (EDDATD.interpretationMode == 'tr') {
            if (label.match(/gene/i)) {
                return 10;
            }
            if (label.match(/rpkm/i)) {
                return 11;
            }
            // If we can't match to the above two, set the row to 'undefined' so it's ignored by default
            // TODO: Attempt to match with embedded gene names
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
            // TODO: Attempt to match with embedded protein names
            return 0;
        }
        // Things we'll be counting to hazard a guess at the row contents
        var blankCt = 0;
        var stringCt = 0;
        var measurementsCt = 0;
        var uniqueMeasurementsCt = 0;
        var uniqueMeasurements = {};
        // A condensed version of the row, with no nulls or blank values
        var cRow = row.filter(function (v) { return !!v; });
        blankCt = row.length - cRow.length;
        cRow.forEach(function (v) {
            var vv = v.replace(/,/g, ''), m;
            if (isNaN(parseFloat(vv))) {
                ++stringCt;
            }
        });
        // If the label parses into a number and the data contains no strings, call it a timsetamp for data
        if (!isNaN(parseFloat(label)) && (stringCt == 0)) {
            return 3;
        }
        // If we found at least two different measurement types,
        // and the total detections is more than 3/5 the non-empty values,
        // call it a measurement type.
        if ((uniqueMeasurementsCt > 2) && ((cRow.length / measurementsCt) > 0.6)) {
            return 2;
        }
        // If the label matches a metadata type
        // if (EDDAutoComplete.MetaDataField.searchForClosestRecordMatchStatic(label)) {
        //     return 4;
        // }
        // No choice by default
        return 0;
    },
    redrawIgnoredValueMarkers: function () {
        EDDATD.Table.dataCells.forEach(function (row) {
            row.forEach(function (cell) {
                var toggle = !!EDDATD.Grid.ignoreDataGaps && !!cell.getAttribute('isblank');
                $(cell).toggleClass('ignoredline', toggle);
            });
        });
    },
    toggleTableRow: function (box) {
        var value = parseInt($(box).val(), 10);
        EDDATD.Table.activeRowFlags[value] = $(box).prop('checked');
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    toggleTableColumn: function (box) {
        var value = parseInt($(box).val(), 10);
        EDDATD.Table.activeColFlags[value] = $(box).prop('checked');
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
        EDDATD.Grid.data[0].forEach(function (_, x) {
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
    interpretDataTable: function () {
        EDDATD.Sets.parsedSets = [];
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
        EDDATD.Sets.uniqueLineAssayNames = [];
        EDDATD.Sets.uniqueMeasurementNames = [];
        EDDATD.Sets.uniqueMetadataNames = [];
        EDDATD.Sets.seenAnyTimestamps = 0;
        // This mode means we make a new "set" for each cell in the table,
        // rather than the standard method of making a new "set" for each column in the table.
        var usingSingleMeasurementNameRows = 0;
        // Look for the presence of "single measurement type" rows, and rows of all other single-item types
        var foundSingleMeasurementNameRow = 0;
        var foundNonSingleMeasurementNameRow = 0;
        var earliestAssayLineNamesRow = 0;
        for (var r = 0; r < EDDATD.Grid.l; r++) {
            if (!EDDATD.Table.activeRowFlags[r]) {
                continue;
            }
            var p = EDDATD.Table.pulldownSettings[r]; // The value of the current pulldown
            if ((p == 5) || (p == 12)) {
                foundSingleMeasurementNameRow++;
            }
            if ((p == 4) || (p == 3)) {
                foundNonSingleMeasurementNameRow++;
            }
            if ((p == 1) && !earliestAssayLineNamesRow) {
                earliestAssayLineNamesRow = r + 1;
            }
        }
        // Only use this mode if the table is entirely free of single-timestamp and single-metadata rows,
        // and if we've found at least one "single measurement" row, and at least one "Assay/Line names" row.
        // Note that the requirement of an "Assay/Line names" row prevents this mode from being enabled when
        // the page is in 'Transcription' mode.
        if (foundSingleMeasurementNameRow && !foundNonSingleMeasurementNameRow && earliestAssayLineNamesRow) {
            usingSingleMeasurementNameRows = 1;
        }
        // The standard method: Make a "set" for each column of the table
        if (!usingSingleMeasurementNameRows) {
            for (var c = 0; c < EDDATD.Grid.w; c++) {
                // Skip it if the whole column is deactivated
                if (!EDDATD.Table.activeColFlags[c]) {
                    continue;
                }
                var newSet = {
                    // For the graphing module
                    label: 'Column ' + c,
                    name: 'Column ' + c,
                    units: 'units',
                    // For submission to the database
                    parsingIndex: c,
                    assay: null,
                    assayName: null,
                    measurementType: null,
                    metadata: {},
                    singleData: null,
                    // For both
                    data: []
                };
                var uniqueTimes = [];
                var timestamps = {};
                var foundMetaDataCount = 0;
                for (var r = 0; r < EDDATD.Grid.l; r++) {
                    if (!EDDATD.Table.activeRowFlags[r]) {
                        continue;
                    }
                    if (!EDDATD.Table.activeFlags[r][c]) {
                        continue;
                    }
                    var p = EDDATD.Table.pulldownSettings[r]; // The value of the current pulldown
                    var n = EDDATD.Grid.rowMarkers[r]; // The row label
                    var v = EDDATD.Grid.data[r][c]; // The value in the current cell
                    if (!p) {
                        continue;
                    } // If the pulldown is not set to anything, skip this value
                    if ((typeof n == 'undefined') || (n == null)) {
                        n = '';
                    }
                    if ((typeof v == 'undefined') || (v == null)) {
                        v = '';
                    }
                    if (p == 11) {
                        v = v.replace(/,/g, ''); //  No commas, please
                        if (v != '') {
                            newSet.singleData = v;
                        }
                        continue;
                    }
                    if (p == 10) {
                        if (v != '') {
                            newSet.name = v;
                        }
                        continue;
                    }
                    if (p == 3) {
                        n = n.replace(/,/g, '');
                        if (isNaN(parseFloat(n))) {
                            continue;
                        }
                        n = parseFloat(n);
                        v = v.replace(/,/g, ''); //  No commas, please
                        if (v == '') {
                            if (EDDATD.Grid.ignoreDataGaps) {
                                continue;
                            }
                            v = null; // We actually prefer null here, to indicate a placeholder value
                        }
                        // Note that we're deliberately avoiding parsing v with parseFloat.
                        // It will remain as a string, which the graph module will accept with no problems,
                        // and will also preserve a carbon ratio if that's what this is.
                        if (!timestamps[n]) {
                            timestamps[n] = v;
                            uniqueTimes.push(n); // Save it as a unique value
                            EDDATD.Sets.seenAnyTimestamps = 1;
                        }
                        continue;
                    }
                    // Now that we've dealt with timestamps, we proceed on to other data types.
                    // All the other data types do not accept a blank value, so we weed them out now.
                    if (n == '') {
                        continue;
                    }
                    if (v == '') {
                        continue;
                    }
                    if (p == 1) {
                        if (!seenAssayLineNames[v]) {
                            assayLineNamesCount++; // Increment the unique index by 1
                            seenAssayLineNames[v] = assayLineNamesCount; // Store a key of v with a value of the index
                            EDDATD.Sets.uniqueLineAssayNames.push(v); // And push it into the array (at that index-1)
                        }
                        newSet.assay = seenAssayLineNames[v];
                        newSet.assayName = v;
                        continue;
                    }
                    if (p == 2) {
                        if (!seenMeasurementNames[v]) {
                            measurementNamesCount++;
                            seenMeasurementNames[v] = measurementNamesCount;
                            EDDATD.Sets.uniqueMeasurementNames.push(v);
                        }
                        newSet.measurementType = seenMeasurementNames[v];
                        continue;
                    }
                    if (p == 4) {
                        if (!seenMetadataNames[n]) {
                            metadataNamesCount++; // Incrementing before adding, so the effective start index is 1, not 0
                            seenMetadataNames[n] = metadataNamesCount;
                            EDDATD.Sets.uniqueMetadataNames.push(n);
                        }
                        newSet.metadata[seenMetadataNames[n]] = v;
                        foundMetaDataCount++;
                    }
                }
                // Sort the timestamps we found and build an array of time/value tuples
                uniqueTimes.sort(function (a, b) {
                    return a - b;
                }); // Sort ascending
                for (var x = 0; x < uniqueTimes.length; x++) {
                    newSet.data.push([uniqueTimes[x], timestamps[uniqueTimes[x]]]);
                }
                // Only save this set if we actually accumulated some data or metadata to store.
                if ((uniqueTimes.length > 0) || foundMetaDataCount || (newSet.singleData != null)) {
                    EDDATD.Sets.parsedSets.push(newSet);
                }
            }
        }
        else {
            var parsingIndex = 0;
            for (var c = 0; c < EDDATD.Grid.w; c++) {
                if (!EDDATD.Table.activeColFlags[c]) {
                    continue;
                }
                var a = EDDATD.Grid.data[earliestAssayLineNamesRow - 1][c];
                // Weed out blank, undefined, and null values.
                if ((typeof a == 'undefined') || (a == null)) {
                    a = '';
                }
                if (a == '') {
                    continue;
                }
                if (!seenAssayLineNames[a]) {
                    assayLineNamesCount++; // Increment the unique index by 1
                    seenAssayLineNames[a] = assayLineNamesCount; // Store a key of v with a value of the index
                    EDDATD.Sets.uniqueLineAssayNames.push(a); // And push it into the array (at that index-1)
                }
                for (var r = 0; r < EDDATD.Grid.l; r++) {
                    if (!EDDATD.Table.activeRowFlags[r]) {
                        continue;
                    }
                    if (!EDDATD.Table.activeFlags[r][c]) {
                        continue;
                    }
                    var p = EDDATD.Table.pulldownSettings[r]; // The value of the current pulldown
                    var n = EDDATD.Grid.rowMarkers[r]; // The row label
                    var v = EDDATD.Grid.data[r][c]; // The value in the current cell
                    if (!p) {
                        continue;
                    } // If the pulldown is not set to anything, skip this value
                    if ((p != 5) && (p != 12)) {
                        continue;
                    }
                    if ((typeof n == 'undefined') || (n == null)) {
                        n = '';
                    }
                    if ((typeof v == 'undefined') || (v == null)) {
                        v = '';
                    }
                    // Weed out blank, undefined, and null values.
                    if (n == '') {
                        continue;
                    }
                    if (v == '') {
                        continue;
                    }
                    var newSet2 = {
                        // For the graphing module (which we won't be using in this mode, actually)
                        label: 'Column ' + c + ' row ' + r,
                        name: 'Column ' + c + ' row ' + r,
                        units: 'units',
                        // For submission to the database
                        parsingIndex: parsingIndex,
                        assay: seenAssayLineNames[a],
                        assayName: a,
                        measurementType: null,
                        metadata: {},
                        singleData: v,
                        // For both
                        data: []
                    };
                    if (p == 5) {
                        if (!seenMeasurementNames[n]) {
                            measurementNamesCount++;
                            seenMeasurementNames[n] = measurementNamesCount;
                            EDDATD.Sets.uniqueMeasurementNames.push(n);
                        }
                        newSet2.measurementType = seenMeasurementNames[n];
                    }
                    else if (p == 12) {
                        // We process this on the back end
                        newSet2.name = n;
                    }
                    parsingIndex++;
                    EDDATD.Sets.parsedSets.push(newSet2);
                }
            }
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
            EDDATD.graphRefreshTimerID = setTimeout("EDDATD.remakeGraphArea()", 700);
        }
    },
    remakeGraphArea: function () {
        EDDATD.graphRefreshTimerID = 0;
        if (!EDDATDGraphing) {
            return;
        }
        if (!EDDATD.graphEnabled) {
            return;
        }
        EDDATDGraphing.clearAllSets();
        // If we're not in this mode, drawing a graph is nonsensical.
        if (EDDATD.interpretationMode == "std") {
            for (var i = 0; i < EDDATD.Sets.parsedSets.length; i++) {
                EDDATDGraphing.addNewSet(EDDATD.Sets.parsedSets[i]);
            }
        }
        EDDATDGraphing.drawSets();
    },
    resetInfoTableFields: function () {
        // TOTALLY STUBBED
    },
    // Create the Step 4 table:  A set of rows, one for each y-axis column of data,
    // where the user can fill out additional information for the pasted table.
    remakeInfoTable: function () {
        var masterMTypeDiv = document.getElementById('masterMTypeDiv');
        var masterAssayLineDiv = document.getElementById('masterAssayLineDiv');
        var disambiguateLinesAssaysSection = document.getElementById('disambiguateLinesAssaysSection');
        var disambiguateMeasurementsSection = document.getElementById('disambiguateMeasurementsSection');
        var disambiguateMetadataSection = document.getElementById('disambiguateMetadataSection');
        var disabledStepLabel = document.getElementById('emptyDisambiguationLabel');
        // Initially hide all the Step 4 master pulldowns so we can reveal just the ones we need later
        $(masterAssayLineDiv).addClass('off');
        $(masterMTypeDiv).addClass('off');
        $(disambiguateLinesAssaysSection).addClass('off');
        $(disambiguateMeasurementsSection).addClass('off');
        $(disambiguateMetadataSection).addClass('off');
        var dATable = document.getElementById('disambiguateAssaysTable');
        if (dATable) {
            dATable.parentNode.removeChild(dATable);
        }
        var dMTable = document.getElementById('disambiguateMeasurementsTable');
        if (dMTable) {
            dMTable.parentNode.removeChild(dMTable);
        }
        var dMdTable = document.getElementById('disambiguateMetadataTable');
        if (dMdTable) {
            dMdTable.parentNode.removeChild(dMdTable);
        }
        // If we have no sets to show, leave the area blank and show the 'enter some data!' banner
        if (EDDATD.Sets.parsedSets.length == 0) {
            $(disabledStepLabel).removeClass('off');
            return;
        }
        $(disabledStepLabel).addClass('off');
        // If we've got parsed data to deal with, but haven't seen a single timestamp, show the "master timestamp" UI.
        var mTimestampDiv = document.getElementById('masterTimestampDiv');
        $(mTimestampDiv).removeClass('off');
        if (EDDATD.Sets.seenAnyTimestamps) {
            $(mTimestampDiv).addClass('off');
        }
        var masterP = EDDATD.masterProtocol; // Shout-outs to a mid-grade rapper
        // If we have no Assays/Lines detected for disambiguation, ask the user to select one.
        if (EDDATD.Sets.uniqueLineAssayNames.length == 0) {
            $(masterAssayLineDiv).removeClass('off');
        }
        else {
            // Otherwise, put together a disambiguation section for Assays/Lines
            // We need to keep a separate set of correlations between string and pulldowns for each Protocol,
            // since the same string can match different Assays, and the pulldowns will have different content,
            // in each Protocol.
            if (typeof EDDATD.Disam.assayLineObjSets[masterP] == 'undefined') {
                EDDATD.Disam.assayLineObjSets[masterP] = {};
            }
            EDDATD.Disam.currentlyVisibleAssayLineObjSets = [];
            $(disambiguateLinesAssaysSection).removeClass('off');
            var aTable = document.createElement("table");
            aTable.setAttribute('cellspacing', "0");
            aTable.setAttribute('id', 'disambiguateAssaysTable');
            disambiguateLinesAssaysSection.appendChild(aTable);
            var aTBody = document.createElement("tbody");
            aTable.appendChild(aTBody);
            for (var i = 0; i < EDDATD.Sets.uniqueLineAssayNames.length; i++) {
                var uName = EDDATD.Sets.uniqueLineAssayNames[i];
                // Find a pre-existing collection of objects that corresponds to this unique string
                var disamRow = EDDATD.Disam.assayLineObjSets[masterP][uName];
                // If none exists, we'll have to build one
                if (!disamRow) {
                    disamRow = {};
                    // We'll call into another subroutine to do the job of guessing how to first set this pulldown
                    var defaultSelections = EDDATD.disambiguateAnAssayOrLine(uName, i);
                    // First make a table row, and save a reference to it
                    var aRow = document.createElement("tr");
                    disamRow.rowObj = aRow;
                    // Next, add a table cell with the string we are disambiguating
                    var aTD = document.createElement("td");
                    aRow.appendChild(aTD);
                    var aDIV = document.createElement("div");
                    aDIV.appendChild(document.createTextNode(uName));
                    aTD.appendChild(aDIV);
                    // Now build another table cell that will contain the pulldowns
                    aTD = document.createElement("td");
                    aTD.style.textAlign = "left";
                    aRow.appendChild(aTD);
                    // First, the Assay pulldown
                    var aSEL = document.createElement("select");
                    disamRow.assayObj = aSEL;
                    aTD.appendChild(aSEL);
                    // An onclick callback to show/hide the Line pulldown as required
                    aSEL.setAttribute('onclick', "EDDATD.userChangedAssayLineDisam(this);");
                    // Assay pulldowns always start with a Create New option
                    var aOPT = document.createElement("option");
                    aOPT.setAttribute('value', 'new');
                    aOPT.appendChild(document.createTextNode('(Create New)'));
                    if (!defaultSelections.assayID) {
                        aOPT.setAttribute('selected', 'selected');
                    }
                    aSEL.setByUser = 0; // For use in userChangedAssayLineDisam
                    aSEL.appendChild(aOPT);
                    for (var ea in ATData.existingAssays[masterP]) {
                        var id = ATData.existingAssays[masterP][ea];
                        aOPT = document.createElement("option");
                        aOPT.setAttribute('value', id);
                        if (defaultSelections.assayID == id) {
                            aOPT.setAttribute('selected', 'selected');
                        }
                        var lid = EDDData.Assays[id].lid;
                        var pid = EDDData.Assays[id].pid;
                        var fullN = [
                            EDDData.Lines[lid].name,
                            EDDData.Protocols[pid].name,
                            EDDData.Assays[id].name
                        ].join('-');
                        aOPT.appendChild(document.createTextNode(fullN));
                        aSEL.appendChild(aOPT);
                    }
                    // Done with the pulldown selection options
                    // Done with the pulldown
                    // Next in the td, a span to contain the text label announcing the Line pulldown, and the pulldown itself
                    var aSP = document.createElement("span");
                    aSP.appendChild(document.createTextNode('for Line:'));
                    if (defaultSelections.assayID) {
                        aSP.className = 'off';
                    }
                    aTD.appendChild(aSP);
                    // The Line pulldown
                    aSEL = document.createElement("select");
                    // Save a direct reference to it for later
                    disamRow.lineObj = aSEL;
                    aSP.appendChild(aSEL);
                    aOPT = document.createElement("option");
                    aOPT.setAttribute('value', 'new');
                    aOPT.appendChild(document.createTextNode('(Create New)'));
                    if (!defaultSelections.lineID) {
                        aOPT.setAttribute('selected', 'selected');
                    }
                    aSEL.setByUser = 0; // For use in userChangedAssayLineDisam
                    aSEL.appendChild(aOPT);
                    for (var li = 0; li < ATData.existingLines.length; li++) {
                        var line = ATData.existingLines[li];
                        aOPT = document.createElement("option");
                        aOPT.setAttribute('value', line.id);
                        if (defaultSelections.lineID == line.id) {
                            aOPT.setAttribute('selected', 'selected');
                        }
                        aOPT.appendChild(document.createTextNode(line.n));
                        aSEL.appendChild(aOPT);
                    }
                    // Done with the pulldown selection options
                    // Done with the pulldown object
                    // Done with the span object
                    // Done with the last td object
                    // Done with the tr object
                    EDDATD.Disam.assayLineObjSets[masterP][uName] = disamRow; // Store the row for later reference
                }
                // Set or re-set the name and id attributes of the pulldowns since we're adding it to the document
                disamRow.assayObj.setAttribute('name', 'disamAssay' + (i + 1));
                disamRow.lineObj.setAttribute('name', 'disamLine' + (i + 1));
                disamRow.assayObj.setAttribute('visibleIndex', i);
                aTBody.appendChild(disamRow.rowObj); // Add the row to the document
                // Used in userChangedAssayLineDisam to cascade changes in one input to subsequent inputs
                EDDATD.Disam.currentlyVisibleAssayLineObjSets.push(disamRow);
            }
        }
        // If we're in 'Transcription' or 'Proteomics' mode, there are no measurement types involved.
        // So we skip the measurement section, and instead provide some statistics about the gathered records.
        if (EDDATD.interpretationMode == "tr" || EDDATD.interpretationMode == "pr") {
        }
        else if ((EDDATD.Sets.uniqueMeasurementNames.length == 0) && (EDDATD.Sets.seenAnyTimestamps)) {
            $(masterMTypeDiv).removeClass('off');
        }
        else {
            // Otherwise, put together a disambiguation section for measurement types
            $(disambiguateMeasurementsSection).removeClass('off');
            var aTable = document.createElement("table");
            aTable.setAttribute('cellspacing', "0");
            aTable.setAttribute('id', 'disambiguateMeasurementsTable');
            disambiguateMeasurementsSection.appendChild(aTable);
            var aTBody = document.createElement("tbody");
            aTable.appendChild(aTBody);
            // Headers for the table
            var aTr = aTBody.insertRow();
            var aTH = document.createElement("th");
            aTH.colSpan = 2; // http://www.w3schools.com/jsref/prop_tabledata_colspan.asp
            aTH.setAttribute('colspan', "2");
            aTH.style.textAlign = "right";
            aTH.appendChild(document.createTextNode('Compartment'));
            aTr.appendChild(aTH);
            aTH = document.createElement("th");
            aTH.appendChild(document.createTextNode('Type'));
            aTr.appendChild(aTH);
            aTH = document.createElement("th");
            if (EDDATD.interpretationMode == "std") {
                aTH.appendChild(document.createTextNode('Units'));
            }
            aTr.appendChild(aTH);
            // Done with headers row
            EDDATD.Disam.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
            EDDATD.Sets.uniqueMeasurementNames.forEach(function (uName, i) {
                var disamRow = EDDATD.Disam.measurementObjSets[uName], aRow, aTd, aDiv;
                if (disamRow) {
                    aTBody.appendChild(disamRow.rowObj);
                }
                else {
                    disamRow = {};
                    aRow = aTBody.insertRow();
                    aTd = aRow.insertCell();
                    aDiv = $('<div>').text(uName).appendTo(aTd);
                    ['compObj', 'typeObj', 'unitsObj'].forEach(function (auto) {
                        var cell = $(aRow.insertCell()).addClass('disamDataCell');
                        disamRow[auto] = EDD_auto.create_autocomplete(cell);
                    });
                    EDDATD.Disam.measurementObjSets[uName] = disamRow;
                }
                // TODO sizing should be handled in CSS
                disamRow.compObj.attr({ 'name': 'disamMComp' + (i + 1), 'visibleIndex': i, 'size': 4 });
                EDD_auto.setup_field_autocomplete(disamRow.compObj, 'MeasurementCompartment', EDDATD.AutoCache.comp);
                disamRow.typeObj.attr({ 'name': 'disamMType' + (i + 1), 'visibleIndex': i, 'size': 45 });
                EDD_auto.setup_field_autocomplete(disamRow.typeObj, 'Metabolite', EDDATD.AutoCache.metabolite);
                disamRow.unitsObj.attr({ 'name': 'disamMUnits' + (i + 1), 'visibleIndex': i, 'size': 10 });
                EDD_auto.setup_field_autocomplete(disamRow.unitsObj, 'MeasurementUnit', EDDATD.AutoCache.unit);
                // If we're in MDV mode, the units pulldowns are irrelevant.
                disamRow.unitsObj.toggleClass('off', EDDATD.interpretationMode === 'mdv');
            });
            EDDATD.checkAllMeasurementCompartmentDisam();
        }
        // If we've detected any metadata types for disambiguation, create a section
        if (EDDATD.Sets.uniqueMetadataNames.length > 0) {
            $(disambiguateMetadataSection).removeClass('off');
            var aTable = document.createElement("table");
            aTable.setAttribute('cellspacing', "0");
            aTable.setAttribute('id', 'disambiguateMetadataTable');
            disambiguateMetadataSection.appendChild(aTable);
            var aTBody = document.createElement("tbody");
            aTable.appendChild(aTBody);
            for (var i = 0; i < EDDATD.Sets.uniqueMetadataNames.length; i++) {
                var uName = EDDATD.Sets.uniqueMetadataNames[i];
                // Find a pre-existing collection of objects that corresponds to this unique string
                var disamRow = EDDATD.Disam.metadataObjSets[uName];
                // If none exists, we'll have to build one
                if (disamRow) {
                    aTBody.appendChild(disamRow.rowObj); // Add the row to the document
                }
                else {
                    disamRow = {};
                    // First make a table row, and save a reference to it
                    aRow = document.createElement("tr");
                    aTBody.appendChild(aRow); // Rows must be in the DOM so initilization calls for their automcomplete elements work
                    disamRow.rowObj = aRow;
                    // Next, add a table cell with the string we are disambiguating
                    var aTD = document.createElement("td");
                    aRow.appendChild(aTD);
                    var aDIV = document.createElement("div");
                    aDIV.appendChild(document.createTextNode(uName));
                    aTD.appendChild(aDIV);
                    // Now build another table cell that will contain the autocomplete element
                    aTD = document.createElement("td");
                    aTD.className = 'disamDataCell';
                    aRow.appendChild(aTD);
                    var metaAutocomplete = EDD_auto.create_autocomplete(aTD).val(uName);
                    // Done with the autocomplete object
                    // EDDAutoComplete.initializeElement(metaAutocomplete.inputElement);
                    // // custom property needs to be accessed via index notation
                    // metaAutocomplete.inputElement['autocompleter'].setFromPrimaryElement();
                    // metaAutocomplete.initialized = 1;
                    disamRow.metaObj = metaAutocomplete;
                    // Done with the td obect
                    // Done with the tr object
                    EDDATD.Disam.metadataObjSets[uName] = disamRow; // Store the row for later reference
                }
                // Set or re-set the names of the inputs so they correlate with the uniqueMetadataNames indexes
                disamRow.metaObj.attr('name', 'disamMeta' + (i + 1)).addClass('autocomp_type').next().attr('name', 'disamMetaHidden' + (i + 1));
                EDD_auto.setup_field_autocomplete(disamRow.metaObj, 'MetadataType', EDDATD.AutoCache.meta);
            }
        }
        var debugArea = document.getElementById("jsondebugarea");
        if (debugArea) {
            debugArea.value = JSON.stringify(EDDATD.Sets.parsedSets);
        }
        return;
    },
    // This function serves two purposes.
    // 1. If the given Assay disambiguation pulldown is being set to 'new', reveal the adjacent Line pulldown, otherwise hide it.
    // 2. If the pulldown is being set to 'new', walk down the remaining pulldowns in the section, in order, setting
    // them to 'new' as well, stopping just before any pulldown marked as being 'set by the user'.
    userChangedAssayLineDisam: function (assayEl) {
        var s = assayEl.nextSibling; // The span with the corresponding Line pulldown is always right next to the Assay pulldown
        $(s).removeClass('off');
        assayEl.setByUser = 1;
        if (assayEl.value != "new") {
            $(s).addClass('off');
            // If we're setting something other than 'new', we stop here.  Only 'new' cascades to subsequent pulldowns.
            return;
        }
        var vALOS = EDDATD.Disam.currentlyVisibleAssayLineObjSets;
        var visibleIndex = parseInt(assayEl.getAttribute('visibleIndex'));
        for (var v = visibleIndex + 1; v < vALOS.length; v++) {
            var a = vALOS[v].assayObj;
            // As soon as we encounter another pulldown set by the user, stop
            if (a.setByUser == 1) {
                break;
            }
            a.selectedIndex = 0; // The first index is always 'new'
            s = a.nextSibling; // Reveal the corresponding Line pulldown span
            $(s).removeClass('off');
        }
        return false;
    },
    userChangedMeasurementDisam: function (autoCompObject) {
        var disamInputElement = autoCompObject.inputElement;
        var vMOS = EDDATD.Disam.currentlyVisibleMeasurementObjSets;
        var autoType = disamInputElement.getAttribute('autocompletetype');
        var visibleIndex = parseInt(disamInputElement.getAttribute('visibleIndex'));
        var sourceObj = null;
        if (autoType == 'measurementcompartment') {
            sourceObj = vMOS[visibleIndex].compObj;
        }
        else if (autoType == 'units') {
            sourceObj = vMOS[visibleIndex].unitsObj;
        }
        if (!sourceObj) {
            return;
        }
        sourceObj.setByUser = 1;
        for (var v = visibleIndex + 1; v < vMOS.length; v++) {
            var a = null;
            if (autoType == 'measurementcompartment') {
                a = vMOS[v].compObj;
            }
            else if (autoType == 'units') {
                a = vMOS[v].unitsObj;
            }
            if (!a) {
                break;
            }
            // As soon as we encounter another pulldown set by the user, stop
            if (a.setByUser == 1) {
                break;
            }
            a.inputElement.value = sourceObj.inputElement.value;
            a.hiddenInputElement.value = sourceObj.hiddenInputElement.value;
        }
        EDDATD.checkAllMeasurementCompartmentDisam();
        return false;
    },
    // Run through the list of currently visible measurement disambiguation form elements,
    // checking to see if any of the 'compartment' elements are set to a non-blank value.
    // If any are, and we're in MDV document mode, display a warning that the user should
    // specify compartments for all their measurements.
    checkAllMeasurementCompartmentDisam: function () {
        var vMOS = EDDATD.Disam.currentlyVisibleMeasurementObjSets;
        var allAreSet = 1;
        for (var v = 0; v < vMOS.length; v++) {
            var a = vMOS[v].compObj;
            if (!a) {
                break;
            }
            // If any values have been deliberately set (even to zero) don't count them
            if (a.setByUser == 1) {
                continue;
            }
            if (!a.hiddenInputElement.value || a.hiddenInputElement.value == "0") {
                allAreSet = 0;
            }
        }
        var warnDiv = document.getElementById("noCompartmentWarning");
        $(warnDiv).addClass('off');
        if ((EDDATD.interpretationMode == "mdv") && !allAreSet) {
            $(warnDiv).removeClass('off');
        }
        return false;
    },
    disambiguateAnAssayOrLine: function (assayOrLine, currentIndex) {
        var masterP = EDDATD.masterProtocol; // More shout-outs to a mid-grade rapper
        var selections = {
            lineID: 0,
            assayID: 0
        };
        var highestMatchQuality = 0;
        for (var ea in ATData.existingAssays[masterP]) {
            var id = ATData.existingAssays[masterP][ea];
            var assay = EDDData.Assays[id];
            var lid = assay.lid;
            var ln = EDDData.Lines[lid].name;
            var pid = assay.pid;
            var fn = [ln, EDDData.Protocols[pid].name, assay.name].join('-');
            // The full Assay name, even case-insensitive, is the best match
            if (assayOrLine.toLowerCase() == fn.toLowerCase()) {
                selections.assayID = id;
                break;
            }
            if (highestMatchQuality >= 0.8) {
                continue;
            }
            // An exact-case match with the Assay name fragment alone is second-best.
            if (assayOrLine == assay.name) {
                highestMatchQuality = 0.8;
                selections.assayID = id;
                continue;
            }
            // Finding the whole string inside the Assay name fragment is pretty good
            if (highestMatchQuality >= 0.7) {
                continue;
            }
            if (assay.name.indexOf(assayOrLine) >= 0) {
                highestMatchQuality = 0.7;
                selections.assayID = id;
                continue;
            }
            if (highestMatchQuality >= 0.6) {
                continue;
            }
            // Finding the whole string inside the originating Line name is good too.
            // It means that the user may intend to pair with this Assay even though the Assay name is different.  
            if (ln.indexOf(assayOrLine) >= 0) {
                highestMatchQuality = 0.6;
                selections.assayID = id;
                continue;
            }
            if (highestMatchQuality >= 0.4) {
                continue;
            }
            // Finding the Assay name fragment within the whole string, as a whole word, is our last option.
            var reg = new RegExp('(^|\\W)' + assay.name + '(\\W|$)', 'g');
            if (reg.test(assayOrLine)) {
                highestMatchQuality = 0.4;
                selections.assayID = id;
                continue;
            }
            // If all else fails, just choose the Assay that matches the current index in sorted order.
            if (highestMatchQuality >= 0.3) {
                continue;
            }
            if (currentIndex == ea) {
                highestMatchQuality = 0.3;
                selections.assayID = id;
            }
        }
        // Now we repeat the practice, separately, for the Line pulldown.
        highestMatchQuality = 0;
        for (var li = 0; li < ATData.existingLines.length; li++) {
            var line = ATData.existingLines[li];
            // The Line name, case-sensitive, is the best match
            if (assayOrLine == line.n) {
                selections.lineID = line.id;
                break;
            }
            if (highestMatchQuality >= 0.8) {
                continue;
            }
            // The same thing case-insensitive is second best.
            if (assayOrLine.toLowerCase() == line.n.toLowerCase()) {
                highestMatchQuality = 0.8;
                selections.lineID = line.id;
                continue;
            }
            if (highestMatchQuality >= 0.7) {
                continue;
            }
            // Finding the Line name within the string is odd, but good.
            if (assayOrLine.indexOf(line.n) >= 0) {
                highestMatchQuality = 0.7;
                selections.lineID = line.id;
                continue;
            }
            if (highestMatchQuality >= 0.6) {
                continue;
            }
            // Finding the string within the Line name is also good.
            if (line.n.indexOf(assayOrLine) >= 0) {
                highestMatchQuality = 0.6;
                selections.lineID = line.id;
                continue;
            }
            // Again, if all else fails, just choose the Line that matches the current index in sorted order, in a loop.
            if (highestMatchQuality >= 0.5) {
                continue;
            }
            if (currentIndex % ATData.existingLines.length == li) {
                highestMatchQuality = 0.5;
                selections.lineID = line.id;
            }
        }
        return selections;
    },
    highlighterF: function (e) {
        var e = e || window.event;
        var obj = e.srcElement || e.target;
        var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
        while (tn != "td" && tn != "tbody") {
            obj = obj.parentNode || obj.parentElement;
            if (!obj) {
                break;
            }
            if (obj.nodeType == 9) {
                break;
            }
            if (obj.tagName) {
                tn = obj.tagName.toLowerCase();
            }
        }
        if (tn == "td") {
            var x = obj.getAttribute('x');
            var y = obj.getAttribute('y');
            // When we hit the fringes of the div, we walk upwards and end up in
            // a cell of the enclosing table (not the graph table inside the div).
            // By fetching the x and y attributes, we ensure that we are looking
            // at a cell from the right table.
            if (x != null && y != null) {
                x = parseInt(x);
                y = parseInt(y);
                if (x != 0 || y != 0) {
                    var row = obj.parentNode;
                    switch (e.type) {
                        case 'mouseover':
                            if (x != 0) {
                                var col = EDDATD.Table.colObjects[x - 1];
                                col.className = col.className + " hoverLines";
                            }
                            if (y != 0) {
                                row.className = row.className + " hoverLines";
                            }
                            break;
                        case 'mouseout':
                            if (x != 0) {
                                var col = EDDATD.Table.colObjects[x - 1];
                                col.className = col.className.replace(" hoverLines", "");
                            }
                            if (y != 0) {
                                row.className = row.className.replace(" hoverLines", "");
                            }
                            break;
                    }
                }
            }
        }
    },
    singleValueDisablerF: function (e) {
        var e = e || window.event;
        var obj = e.srcElement || e.target;
        var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
        while (tn != "td" && tn != "tbody") {
            obj = obj.parentNode || obj.parentElement;
            tn = obj.tagName.toLowerCase();
        }
        if (tn != "td") {
            return;
        }
        var x = obj.getAttribute('x');
        var y = obj.getAttribute('y');
        // When we hit the fringes of the div, we walk upwards and end up in
        // a cell of the enclosing table (not the graph table inside the div).
        // By fetching the x and y attributes, we ensure that we are looking
        // at a cell from the right table.
        if (!x || !y) {
            return;
        }
        x = parseInt(x);
        y = parseInt(y);
        // We also want both the coordinates to be 1 or greater
        if ((x < 1) || (y < 1)) {
            return;
        }
        x = x - 1;
        y = y - 1;
        if (EDDATD.Table.activeFlags[y][x]) {
            EDDATD.Table.activeFlags[y][x] = 0;
        }
        else {
            EDDATD.Table.activeFlags[y][x] = 1;
        }
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
    },
    generateFormSubmission: function () {
        // Run through the data sets one more time,
        // pulling out any values in the pulldowns and autocomplete elements in Step 4
        // and embedding them in their respective data sets.
        var dest = document.getElementById("jsonoutput");
        if (!dest) {
            return false;
        }
        dest.value = JSON.stringify(EDDATD.Sets.parsedSets);
        var debugArea = document.getElementById("jsondebugarea");
        if (debugArea) {
            debugArea.value = JSON.stringify(EDDATD.Sets.parsedSets);
        }
    },
    // This handles insertion of a tab into the textarea.
    // May be glitchy.
    suppressNormalTab: function (e) {
        var e = e || window.event;
        var obj = e.srcElement || e.target;
        if (e.keyCode === 9) {
            // prevent the loss fo focus.
            e.preventDefault();
            // get caret position/selection
            var start = obj.selectionStart;
            var end = obj.selectionEnd;
            // set textarea value to: text before caret + tab + text after caret
            var s = obj.value.substring(0, start);
            var e = obj.value.substring(end);
            obj.value = s + "\t" + e;
            // put caret at right position again
            obj.selectionStart = obj.selectionEnd = start + 1;
        }
    },
    prepareIt: function () {
        var textData = document.getElementById("textData");
        textData.addEventListener("paste", EDDATD.pastedRawData);
        textData.addEventListener("keyup", EDDATD.parseAndDisplayText);
        textData.addEventListener("keydown", EDDATD.suppressNormalTab);
        var dataTableDiv = document.getElementById("dataTableDiv");
        dataTableDiv.addEventListener("mouseover", EDDATD.highlighterF);
        dataTableDiv.addEventListener("mouseout", EDDATD.highlighterF);
        dataTableDiv.addEventListener("dblclick", EDDATD.singleValueDisablerF);
        // This is rather a lot of callbacks, but we need to make sure we're
        // tracking the minimum number of elements with this call, since the
        // function called has such strong effects on the rest of the page.
        // For example, a user should be free to change "merge" to "replace" without having
        // their edits in Step 2 erased.
        $("#masterProtocol").change(EDDATD.changedMasterProtocol);
        var reProcessOnClick = ['#stdlayout', '#trlayout', '#prlayout', '#mdvlayout', '#rawdataformatp'];
        // Using "change" for these because it's more efficient AND because it works around an irritating Chrome inconsistency
        // For some of these, changing them shouldn't actually affect processing until we implement
        // an overwrite-checking feature or something similar
        var reDoLastStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType', '#masterMUnits'];
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