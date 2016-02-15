// Compiled to JS on: Mon Feb 15 2016 14:31:39  
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
                line.name, protocol.name, assay.name].join('-'));
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
        if (![stdLayout, trLayout, prLayout, mdvLayout, ignoreGaps, transpose, graph, rawFormat
        ].every(function (item) { return item.length !== 0; })) {
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
                $('<option>').text(option[0]).val(option[1])
                    .prop('selected', option[1] === value)
                    .appendTo(select);
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
        // attach all event handlers to the table itself
        table = $('<table>').attr('cellspacing', '0')
            .appendTo($('#dataTableDiv').empty())
            .on('click', '[name=enableColumn]', function (ev) {
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
            cell = $(row.insertCell()).attr({ 'id': 'colCBCell' + i, 'x': 1 + i, 'y': 0 })
                .addClass('checkBoxCell');
            box = $('<input type="checkbox"/>').appendTo(cell)
                .val(i.toString())
                .attr({ 'id': 'enableColumn' + i, 'name': 'enableColumn' })
                .prop('checked', EDDATD.Table.activeColFlags[i]);
            EDDATD.Table.colCheckboxCells.push(cell[0]);
        });
        EDDATD.Table.pulldownObjects = []; // We don't want any lingering old objects in this
        // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
        EDDATD.Grid.data.forEach(function (values, i) {
            var cell;
            row = body.insertRow();
            // checkbox cell
            cell = $(row.insertCell()).addClass('checkBoxCell')
                .attr({ 'id': 'rowCBCell' + i, 'x': 0, 'y': i + 1 });
            $('<input type="checkbox"/>')
                .attr({ 'id': 'enableRow' + i, 'name': 'enableRow', })
                .val(i.toString())
                .prop('checked', EDDATD.Table.activeRowFlags[i])
                .appendTo(cell);
            EDDATD.Table.rowCheckboxCells.push(cell[0]);
            // pulldown cell
            cell = $(row.insertCell()).addClass('pulldownCell')
                .attr({ 'id': 'rowPCell' + i, 'x': 0, 'y': i + 1 });
            // use existing setting, or use the last if rows.length > settings.length, or blank
            EDDATD.Table.pulldownSettings[i] = EDDATD.Table.pulldownSettings[i]
                || EDDATD.Table.pulldownSettings.slice(-1)[0] || 0;
            EDDATD.populatePulldown(cell = $('<select>')
                .attr({ 'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i })
                .appendTo(cell), pulldownOptions, EDDATD.Table.pulldownSettings[i]);
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
                EDDATD.Grid.rowMarkers = input.input.shift() || [];
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
                if (EDDATD.Table.pulldownUserChangedFlags[i]
                    && EDDATD.Table.pulldownSettings[i] !== 0) {
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
                toggle = !EDDATD.Table.activeFlags[y][x]
                    || !EDDATD.Table.activeColFlags[x]
                    || !EDDATD.Table.activeRowFlags[y];
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
            table = $('<table>')
                .attr({ 'id': 'disambiguateAssaysTable', 'cellspacing': 0 })
                .appendTo($('#disambiguateLinesAssaysSection').removeClass('off'))
                .on('change', 'select', function (ev) {
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
        table = $('<table>')
            .attr({ 'id': 'disambiguateMeasurementsTable', 'cellspacing': 0 })
            .appendTo($('#disambiguateMeasurementsSection').removeClass('off'))
            .on('change', 'input[type=hidden]', function (ev) {
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
            disam.compObj.attr('size', 4).data('visibleIndex', i)
                .next().attr('name', 'disamMComp' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.compObj, 'MeasurementCompartment', EDDATD.AutoCache.comp);
            disam.typeObj.attr('size', 45).data('visibleIndex', i)
                .next().attr('name', 'disamMType' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.typeObj, 'GenericOrMetabolite', EDDATD.AutoCache.metabolite);
            EDD_auto.initial_search(disam.typeObj, name);
            disam.unitsObj.attr('size', 10).data('visibleIndex', i)
                .next().attr('name', 'disamMUnits' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.unitsObj, 'MeasurementUnit', EDDATD.AutoCache.unit);
            // If we're in MDV mode, the units pulldowns are irrelevant.
            disam.unitsObj.toggleClass('off', EDDATD.interpretationMode === 'mdv');
        });
        EDDATD.checkAllMeasurementCompartmentDisam();
    },
    remakeInfoTableMetadataSection: function () {
        var table, body, row;
        // put together a disambiguation section for metadata
        table = $('<table>')
            .attr({ 'id': 'disambiguateMetadataTable', 'cellspacing': 0 })
            .appendTo($('#disambiguateMetadataSection').removeClass('off'))
            .on('change', 'input', function (ev) {
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
            disam.metaObj.attr('name', 'disamMeta' + (i + 1)).addClass('autocomp_altype')
                .next().attr('name', 'disamMetaHidden' + (i + 1));
            EDD_auto.setup_field_autocomplete(disam.metaObj, 'AssayLineMetadataType', EDDATD.AutoCache.meta);
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
        reDoLastStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType',
            '#masterMUnits'];
        $('#textData')
            .on('paste', EDDATD.pastedRawData)
            .on('keyup', EDDATD.parseAndDisplayText)
            .on('keydown', EDDATD.suppressNormalTab);
        $('#dataTableDiv')
            .on('mouseover mouseout', 'td', EDDATD.highlighterF)
            .on('dblclick', 'td', EDDATD.singleValueDisablerF);
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
        EDD_auto.setup_field_autocomplete('#masterMType', 'GenericOrMetabolite', EDDData.MetaboliteTypes || {});
        EDD_auto.setup_field_autocomplete('#masterMUnits', 'MeasurementUnit');
        $('#ignoreGaps').click(EDDATD.clickedOnIgnoreDataGaps);
        $('#transpose').click(EDDATD.clickedOnTranspose);
        EDDATD.changedMasterProtocol(); //  Since the initial masterProtocol value is zero, we need to manually trigger this:
        EDDATD.queueProcessImportSettings();
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzYXlUYWJsZURhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJBc3NheVRhYmxlRGF0YS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnREFBZ0Q7QUFDaEQsd0NBQXdDO0FBQ3hDLDRDQUE0QztBQW9CNUMsSUFBSSxNQUFVLENBQUM7QUFFZixNQUFNLEdBQUc7SUFFVCxvREFBb0Q7SUFDcEQsY0FBYyxFQUFDLENBQUM7SUFDaEIsNkNBQTZDO0lBQzdDLG1EQUFtRDtJQUNuRCxrQkFBa0IsRUFBQyxLQUFLO0lBQ3hCLDRCQUE0QixFQUFDLENBQUM7SUFFOUIsb0VBQW9FO0lBQ3BFLElBQUksRUFBQztRQUNELElBQUksRUFBQyxFQUFFO1FBQ1AsVUFBVSxFQUFDLEVBQUU7UUFDYixTQUFTLEVBQUUsS0FBSztRQUNoQixvRkFBb0Y7UUFDcEYsbUNBQW1DO1FBQ25DLHNCQUFzQixFQUFFLEtBQUs7UUFDN0IsK0VBQStFO1FBQy9FLG1DQUFtQztRQUNuQyxjQUFjLEVBQUUsS0FBSztRQUNyQiwyQkFBMkIsRUFBRSxLQUFLO0tBQ3JDO0lBRUQsOERBQThEO0lBQzlELEtBQUssRUFBQztRQUNGLGFBQWEsRUFBQyxFQUFFO1FBQ2hCLGdCQUFnQixFQUFDLEVBQUU7UUFDbkIsVUFBVSxFQUFDLEVBQUU7UUFDYixTQUFTLEVBQUMsRUFBRTtRQUVaLGtEQUFrRDtRQUNsRCxnRUFBZ0U7UUFDaEUsdUJBQXVCO1FBQ3ZCLGNBQWMsRUFBQyxFQUFFO1FBQ2pCLGNBQWMsRUFBQyxFQUFFO1FBQ2pCLFdBQVcsRUFBQyxFQUFFO1FBRWQsK0RBQStEO1FBQy9ELG1GQUFtRjtRQUNuRiwwQkFBMEI7UUFDMUIsZUFBZSxFQUFDLEVBQUU7UUFDbEIsZ0JBQWdCLEVBQUMsRUFBRTtRQUNuQixvRkFBb0Y7UUFDcEYsNEJBQTRCO1FBQzVCLHdCQUF3QixFQUFDLEVBQUU7S0FDOUI7SUFFRCxZQUFZLEVBQUMsQ0FBQztJQUNkLG1CQUFtQixFQUFDLENBQUM7SUFFckIsc0ZBQXNGO0lBQ3RGLGlCQUFpQjtJQUNqQixJQUFJLEVBQUM7UUFDRCxVQUFVLEVBQUMsRUFBRTtRQUNiLG9CQUFvQixFQUFDLEVBQUU7UUFDdkIsc0JBQXNCLEVBQUMsRUFBRTtRQUN6QixtQkFBbUIsRUFBQyxFQUFFO1FBQ3RCLHNGQUFzRjtRQUN0RixpQkFBaUIsRUFBRSxLQUFLO0tBQzNCO0lBRUQscUVBQXFFO0lBQ3JFLEtBQUssRUFBQztRQUNGLHVGQUF1RjtRQUN2RixrRkFBa0Y7UUFDbEYsdUZBQXVGO1FBQ3ZGLDJDQUEyQztRQUMzQyxrQ0FBa0M7UUFDbEMsZ0JBQWdCLEVBQUMsRUFBRTtRQUNuQixnQ0FBZ0MsRUFBQyxFQUFFO1FBQ25DLHVDQUF1QztRQUN2QyxrQkFBa0IsRUFBQyxFQUFFO1FBQ3JCLGtDQUFrQyxFQUFDLEVBQUU7UUFDckMsOEJBQThCO1FBQzlCLGVBQWUsRUFBQyxFQUFFO1FBQ2xCLGlFQUFpRTtRQUNqRSxXQUFXLEVBQUMsQ0FBQztLQUNoQjtJQUVELFNBQVMsRUFBRTtRQUNQLElBQUksRUFBRSxFQUFFO1FBQ1IsSUFBSSxFQUFFLEVBQUU7UUFDUixJQUFJLEVBQUUsRUFBRTtRQUNSLFVBQVUsRUFBRSxFQUFFO0tBQ2pCO0lBR0QscUJBQXFCLEVBQUU7UUFDbkIsSUFBSSxVQUFpQixFQUFFLE9BQWMsRUFBRSxhQUFzQixDQUFDO1FBQzlELHdCQUF3QjtRQUN4QixVQUFVLEdBQUcsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDbEMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsY0FBYyxLQUFLLFFBQVEsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNELFlBQVk7WUFDWixNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsTUFBTSxDQUFDLGNBQWMsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELHlCQUF5QjtRQUN6QixPQUFPLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3BDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkYsYUFBYSxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzlELGFBQWEsQ0FBQyxPQUFPLENBQUMsVUFBQyxFQUFTO1lBQzVCLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQzFCLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFDL0IsUUFBUSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzVDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzlDLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDMUQsQ0FBQyxDQUFDLENBQUM7UUFDSCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDeEMsQ0FBQztJQUNMLENBQUM7SUFHRCwwQkFBMEIsRUFBRTtRQUN4QixzRkFBc0Y7UUFDdEYsbUZBQW1GO1FBQ25GLDBCQUEwQjtRQUMxQixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLFlBQVksQ0FBQyxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBQ0QsTUFBTSxDQUFDLDRCQUE0QixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFHRCxxQkFBcUIsRUFBRTtRQUNuQixJQUFJLFNBQWdCLEVBQUUsUUFBZSxFQUFFLFFBQWUsRUFBRSxTQUFnQixFQUFFLFVBQWlCLEVBQ3ZGLFNBQWdCLEVBQUUsS0FBWSxFQUFFLFNBQWdCLENBQUM7UUFDckQsU0FBUyxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM1QixRQUFRLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFCLFFBQVEsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDMUIsU0FBUyxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM1QixVQUFVLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzlCLFNBQVMsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDNUIsS0FBSyxHQUFHLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN2QixTQUFTLEdBQUcsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDakMsdUNBQXVDO1FBQ3ZDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUztTQUMvRSxDQUFDLEtBQUssQ0FBQyxVQUFDLElBQUksSUFBYSxPQUFBLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFqQixDQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QixNQUFNLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBRSw2Q0FBNkM7WUFDeEUsTUFBTSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxNQUFNLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO1lBQ2pDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxNQUFNLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO1lBQ2pDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuQyxNQUFNLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDeEIsMkRBQTJEO1lBQzNELFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2xDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLDZGQUE2RjtZQUM3RixTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JCLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxtREFBbUQ7UUFDL0YsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osc0VBQXNFO1lBQ3RFLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDakMsQ0FBQztJQUdELGdEQUFnRDtJQUNoRCxhQUFhLEVBQUU7UUFDWCw4RkFBOEY7UUFDOUYsTUFBTSxDQUFDLFVBQVUsQ0FBQztZQUNkLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUN0QyxJQUFJLElBQUksR0FBVSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLElBQVksQ0FBQztnQkFDM0QsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO2dCQUN6RCxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0wsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ1YsQ0FBQztJQUdELGFBQWEsRUFBRSxVQUFDLFNBQWlCLEVBQUUsSUFBWTtRQUMzQyxJQUFJLE9BQWMsRUFBRSxVQUFpQixFQUFFLElBQWEsRUFBRSxXQUFtQixDQUFDO1FBQzFFLE9BQU8sR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDL0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNWLDhDQUE4QztRQUM5QyxVQUFVLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBQyxJQUFXLEVBQUUsTUFBYztZQUN0RSxJQUFJLEdBQVksQ0FBQztZQUNqQixFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDaEIsR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2YsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN0QyxDQUFDO1lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDTixvQ0FBb0M7UUFDcEMsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQyxPQUFPLENBQUMsVUFBQyxHQUFZO2dCQUN0QixPQUFPLEdBQUcsQ0FBQyxNQUFNLEdBQUcsVUFBVSxFQUFFLENBQUM7b0JBQzdCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2pCLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDRCxNQUFNLENBQUM7WUFDSCxPQUFPLEVBQUUsSUFBSTtZQUNiLFNBQVMsRUFBRSxVQUFVO1NBQ3hCLENBQUM7SUFDTixDQUFDO0lBR0QscUJBQXFCLEVBQUUsVUFBQyxJQUFjO1FBQ2xDLGdGQUFnRjtRQUNoRiw4RUFBOEU7UUFDOUUsK0VBQStFO1FBQy9FLCtDQUErQztRQUMvQyxJQUFJLGVBQTJCLEVBQUUsWUFBc0IsRUFBRSxZQUFxQixDQUFDO1FBRS9FLGlGQUFpRjtRQUNqRiwwQkFBMEI7UUFDMUIsZUFBZSxHQUFHO1lBQ2QsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUU7WUFDYixJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRTtZQUNiLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFDLEdBQWEsSUFBYSxPQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBTixDQUFNLENBQUM7WUFDbkQsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUMsR0FBYSxJQUFhLE9BQUEsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFOLENBQU0sQ0FBQyxDQUFJLGdCQUFnQjtTQUMxRSxDQUFDO1FBQ0YsWUFBWSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsVUFBQyxHQUFhLEVBQUUsQ0FBUztZQUN4RCxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsSUFBWSxFQUFFLE1BQWMsQ0FBQztZQUM1QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDYixDQUFDO1lBQ0QsSUFBSSxHQUFHLE1BQU0sR0FBRyxTQUFTLENBQUM7WUFDMUIsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFDLEtBQWEsRUFBRSxDQUFTLEVBQUUsQ0FBVztnQkFDOUMsSUFBSSxDQUFTLENBQUM7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDUixDQUFDLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzVDLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNaLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUMzQixLQUFLLElBQUksQ0FBQyxDQUFDO29CQUNmLENBQUM7b0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUN0QyxLQUFLLElBQUksQ0FBQyxDQUFDO29CQUNmLENBQUM7b0JBQ0QsTUFBTSxHQUFHLENBQUMsQ0FBQztnQkFDZixDQUFDO2dCQUNELElBQUksR0FBRyxDQUFDLENBQUM7WUFDYixDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztRQUNILHVFQUF1RTtRQUN2RSxzRkFBc0Y7UUFDdEYsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEMsWUFBWSxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osWUFBWSxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUNELENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLFlBQVksQ0FBQztJQUN6QyxDQUFDO0lBR0QsZ0JBQWdCLEVBQUU7UUFDZCw2REFBNkQ7UUFDN0QsNkRBQTZEO1FBQzdELHlFQUF5RTtRQUN6RSxJQUFJLEtBQUssR0FBVyxDQUFDLEVBQUUsS0FBSyxHQUFXLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBQyxHQUFhO1lBQ25DLElBQUksT0FBTyxHQUFZLEtBQUssQ0FBQztZQUM3Qix3Q0FBd0M7WUFDeEMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUMsVUFBQyxLQUFhO2dCQUN6QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1QsT0FBTyxHQUFHLEVBQUUsS0FBSyxHQUFHLEVBQUUsS0FBSyxDQUFDO2dCQUNoQyxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLE9BQU8sR0FBRyxJQUFJLENBQUM7Z0JBQ25CLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDakUsQ0FBQztJQUdELGdCQUFnQixFQUFFO1FBQ2QsMEVBQTBFO1FBQzFFLDZEQUE2RDtRQUM3RCw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFTLEVBQUUsQ0FBUyxDQUFDO1FBQ3pCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7WUFDN0MsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQzFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQWEsRUFBRSxDQUFTO1lBQzlDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9DLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUMxQyxDQUFDO1lBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hFLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBUztnQkFDckIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDL0MsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUMxQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFHRCxVQUFVLEVBQUUsVUFBQyxLQUFlO1FBQ3hCLElBQUksSUFBYyxFQUFFLFNBQW1CLEVBQUUsU0FBYyxFQUFFLFdBQXFCLENBQUM7UUFDL0UsSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPO1FBQzlCLGlFQUFpRTtRQUNqRSwyQ0FBMkM7UUFDM0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNqQixDQUFDO1FBQ0QsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNmLFdBQVcsR0FBRyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQWE7WUFDdkIsSUFBSSxLQUFhLEVBQUUsTUFBZ0IsRUFBRSxJQUFZLEVBQUUsS0FBYSxDQUFDO1lBQ2pFLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDcEIsc0VBQXNFO1lBQ3RFLGdFQUFnRTtZQUNoRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDdkIsU0FBUyxHQUFHLEdBQUcsQ0FBQztnQkFDaEIsTUFBTSxDQUFDO1lBQ1gsQ0FBQztZQUNELE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakIsS0FBSyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ2hDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbkIsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLEVBQUUsQ0FBQTtvQkFDbEUsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDM0IsQ0FBQztnQkFDRCxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkQsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsVUFBQyxJQUFZLEVBQUUsS0FBVTtZQUN2QyxJQUFJLE9BQWlCLENBQUM7WUFDdEIsaUVBQWlFO1lBQ2pFLE9BQU8sR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsVUFBQyxDQUFDLEVBQUUsS0FBYSxJQUFhLE9BQUEsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBbkIsQ0FBbUIsQ0FBQyxDQUFDO1lBQ3ZGLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBQyxJQUFLLE9BQUEsQ0FBQyxHQUFHLENBQUMsRUFBTCxDQUFLLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtZQUNoRCxtRkFBbUY7WUFDbkYsd0RBQXdEO1lBQ3hELFNBQVMsQ0FBQyxPQUFPLENBQUMsVUFBQyxLQUFhLEVBQUUsS0FBYTtnQkFDM0MsSUFBSSxLQUFlLEVBQUUsUUFBaUIsQ0FBQztnQkFDdkMsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDWCxRQUFRLEdBQUcsS0FBSyxDQUFDO2dCQUNqQixPQUFPLENBQUMsT0FBTyxDQUFDLFVBQUMsRUFBVTtvQkFDdkIsSUFBSSxRQUFrQixFQUFFLElBQVksQ0FBQztvQkFDckMsUUFBUSxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ2xDLElBQUksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3ZCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQ1AsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUM5QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUMxQixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dDQUNYLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7NEJBQ25CLENBQUM7d0JBQ0wsQ0FBQzt3QkFBQyxJQUFJLENBQUMsQ0FBQzs0QkFDSixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNyQixDQUFDO29CQUNMLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsMEVBQTBFO2dCQUMxRSx5Q0FBeUM7Z0JBQ3pDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7UUFDSCxvREFBb0Q7UUFDcEQsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuQyx3Q0FBd0M7UUFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QyxxRUFBcUU7UUFDckUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUN0QixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFDaEIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFDLElBQVk7WUFDekIsSUFBSSxRQUFhLEVBQUUsR0FBYSxFQUFFLFNBQWMsQ0FBQztZQUNqRCxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQixHQUFHLEdBQUcsRUFBRSxDQUFDO1lBQ1QsU0FBUyxHQUFHLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQztZQUN4QyxtRUFBbUU7WUFDbkUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFDMUIsU0FBUyxDQUFDLEdBQUcsQ0FBQyxVQUFDLENBQUMsRUFBRSxLQUFhLElBQWEsT0FBQSxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUF0QixDQUFzQixDQUFDLENBQ2xFLENBQUM7WUFDTixNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQ0wsQ0FBQztJQUNOLENBQUM7SUFHRCwwRUFBMEU7SUFDMUUsMEJBQTBCO0lBQzFCLGdCQUFnQixFQUFFLFVBQUMsTUFBYyxFQUFFLE9BQTRCLEVBQUUsS0FBYTtRQUMxRSxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQUMsTUFBeUI7WUFDdEMsRUFBRSxDQUFDLENBQUMsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDaEMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUN2QyxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLENBQUM7cUJBQ3JDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osTUFBTSxDQUFDLGdCQUFnQixDQUNuQixDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQ3pELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQixDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBR0Qsa0JBQWtCLEVBQUUsVUFBQyxJQUFXO1FBQzVCLElBQUksV0FBcUIsRUFBRSxlQUFzQixFQUM3QyxLQUF1QixFQUFFLFFBQWUsRUFBRSxJQUFzQixFQUNoRSxHQUF3QixDQUFDO1FBRTdCLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUM1QixNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztRQUNuQyxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDN0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO1FBQ25DLFdBQVcsR0FBRyxDQUFDLFVBQVUsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDaEQsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDaEIsZUFBZSxHQUFHO2dCQUNkLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDVCxDQUFDLGtCQUFrQixFQUFFO3dCQUNqQixDQUFDLFlBQVksRUFBRSxFQUFFLENBQUM7d0JBQ2xCLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQztxQkFDdEI7aUJBQ0E7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN2QixlQUFlLEdBQUc7Z0JBQ2QsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUNULENBQUMsa0JBQWtCLEVBQUU7d0JBQ2pCLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO3FCQUMxQjtpQkFDQTtnQkFDRCxDQUFDLG9CQUFvQixFQUFFO3dCQUNuQixDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUM7cUJBQ3ZCO2lCQUNBO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLGVBQWUsR0FBRztnQkFDZCxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ1QsQ0FBQyxrQkFBa0IsRUFBRTt3QkFDakIsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7d0JBQ3ZCLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO3FCQUMxQjtpQkFDQTtnQkFDRCxDQUFDLG9CQUFvQixFQUFFO3dCQUNuQixDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7d0JBQ2hCLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQzt3QkFDcEIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7cUJBQ3pCO2lCQUNBO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFFRCwrQ0FBK0M7UUFDL0MsZ0RBQWdEO1FBQ2hELEtBQUssR0FBc0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDO2FBQzNELFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7YUFDcEMsRUFBRSxDQUFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxVQUFDLEVBQTBCO1lBQzNELE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFDLEVBQTBCO1lBQzFELE1BQU0sQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsd0JBQXdCLEVBQUUsVUFBQyxFQUEwQjtZQUNqRSxJQUFJLElBQUksR0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sQ0FBQywwQkFBMEIsQ0FDN0IsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1YsMEVBQTBFO1FBQzFFLGdGQUFnRjtRQUNoRixRQUFRLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxJQUFJLEdBQXNCLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUQsdUVBQXVFO1FBQ3ZFLG1EQUFtRDtRQUNuRCxXQUFXLENBQUMsT0FBTyxDQUFDO1lBQ2hCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7UUFDSCx3Q0FBd0M7UUFDeEMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDaEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuRSxDQUFDLENBQUMsQ0FBQztRQUNILDJFQUEyRTtRQUMzRSxHQUFHLEdBQXlCLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUM3QyxtRUFBbUU7UUFDbkUsV0FBVyxDQUFDLE9BQU8sQ0FBQztZQUNoQixDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuRCxDQUFDLENBQUMsQ0FBQztRQUNILENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7WUFDN0MsSUFBSSxJQUFZLEVBQUUsR0FBVyxDQUFDO1lBQzlCLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO2lCQUN6RSxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDOUIsR0FBRyxHQUFHLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7aUJBQzdDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7aUJBQ2pCLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxjQUFjLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsQ0FBQztpQkFDMUQsSUFBSSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDLENBQUUsa0RBQWtEO1FBQ3RGLGdGQUFnRjtRQUNoRixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBQyxNQUFnQixFQUFFLENBQVM7WUFDakQsSUFBSSxJQUFZLENBQUM7WUFDakIsR0FBRyxHQUF5QixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDN0MsZ0JBQWdCO1lBQ2hCLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQztpQkFDOUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekQsQ0FBQyxDQUFDLDBCQUEwQixDQUFDO2lCQUN4QixJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxHQUFHLENBQUM7aUJBQ3JELEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7aUJBQ2pCLElBQUksQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQy9DLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQixNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QyxnQkFBZ0I7WUFDaEIsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDO2lCQUM5QyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4RCxtRkFBbUY7WUFDbkYsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQzttQkFDeEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDMUQsTUFBTSxDQUFDLGdCQUFnQixDQUNuQixJQUFJLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQztpQkFDZixJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxHQUFHLENBQUMsR0FBRyxNQUFNLEVBQUUsTUFBTSxFQUFFLEtBQUssR0FBRyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztpQkFDdEUsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUNuQixlQUFlLEVBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FDbkMsQ0FBQztZQUNGLE1BQU0sQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQyxhQUFhO1lBQ2IsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM5RSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6Qyx3QkFBd0I7WUFDeEIsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBQyxLQUFhLEVBQUUsQ0FBUztnQkFDcEMsSUFBSSxLQUFhLENBQUM7Z0JBQ2xCLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDNUIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUNwQixLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDO2dCQUN0QyxDQUFDO2dCQUNELElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDO29CQUM1QixJQUFJLEVBQUUsU0FBUyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztvQkFDN0IsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDO29CQUNWLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDVixPQUFPLEVBQUUsS0FBSztvQkFDZCxTQUFTLEVBQUUsS0FBSyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsU0FBUztpQkFDMUMsQ0FBQyxDQUFDO2dCQUNILENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUMsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFHRCxtQkFBbUIsRUFBRTtRQUNqQixJQUFJLElBQVcsRUFBRSxTQUFnQixFQUFFLFNBQWdCLEVBQUUsS0FBa0IsQ0FBQztRQUN4RSxJQUFJLEdBQUcsTUFBTSxDQUFDLGtCQUFrQixDQUFDO1FBQ2pDLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUM1QixTQUFTLEdBQUcsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDakMsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQTtZQUM5QyxNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QscURBQXFEO1FBQ3JELEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekIsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzVCLFNBQVMsR0FBRyxHQUFHLENBQUM7UUFDcEIsQ0FBQztRQUNELEtBQUssR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU5QyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDbkQsK0VBQStFO1lBQy9FLDhFQUE4RTtZQUM5RSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO2dCQUN0QyxNQUFNLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlDLENBQUM7WUFDRCxxREFBcUQ7WUFDckQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixvQ0FBb0M7Z0JBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDO2dCQUNuRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7b0JBQ3ZELE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxVQUFDLEdBQWEsSUFBYSxPQUFBLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQVosQ0FBWSxDQUFDLENBQUM7Z0JBQ3BFLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFDLEdBQWE7b0JBQ3JELE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztvQkFDekMsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFDZixDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxpRkFBaUY7WUFDakYsK0RBQStEO1lBQy9ELEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7Z0JBQzNDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzlCLENBQUM7WUFDRCxtRUFBbUU7WUFDbkUsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFVBQUMsS0FBYSxJQUFLLE9BQUEsS0FBSyxJQUFJLEdBQUcsRUFBWixDQUFZLENBQUMsQ0FBQztZQUNyRix3RkFBd0Y7WUFDeEYsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFVBQUMsS0FBYSxFQUFFLENBQVM7Z0JBQ3BELElBQUksSUFBUyxDQUFDO2dCQUNkLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVDLElBQUksR0FBRyxNQUFNLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUMxRSxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztnQkFDNUMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBRVAsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0UsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELHVEQUF1RDtRQUN2RCxxREFBcUQ7UUFDckQsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDMUIseUVBQXlFO1FBQ3pFLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQyxnQ0FBZ0M7UUFDaEMsb0RBQW9EO1FBQ3BELG9DQUFvQztRQUNwQyxrRUFBa0U7UUFDbEUsTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDNUIsd0VBQXdFO1FBQ3hFLHVGQUF1RjtRQUN2RiwwRUFBMEU7UUFDMUUsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDMUIsb0RBQW9EO1FBQ3BELHdFQUF3RTtRQUN4RSxNQUFNLENBQUMseUJBQXlCLEVBQUUsQ0FBQztRQUNuQyxNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUNsQyxrREFBa0Q7UUFDbEQsa0dBQWtHO1FBQ2xHLGtFQUFrRTtRQUNsRSxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUdELDBFQUEwRTtJQUMxRSx1R0FBdUc7SUFDdkcseUJBQXlCLEVBQUU7UUFDdkIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQUMsR0FBYSxFQUFFLEtBQWE7WUFDbEQsSUFBSSxRQUFnQixFQUFFLE9BQWdCLEVBQUUsS0FBYyxDQUFDO1lBQ3ZELFFBQVEsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyRCxPQUFPLEdBQUcsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUN4QixFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsSUFBSSxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEMsT0FBTyxHQUFHLElBQUksQ0FBQztZQUNuQixDQUFDO1lBQ0QsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMxRSxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLEdBQVc7Z0JBQ3ZCLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0UsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFHRCx5RUFBeUU7SUFDekUsdUZBQXVGO0lBQ3ZGLHNCQUFzQixFQUFFO1FBQ3BCLG1FQUFtRTtRQUNuRSxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUdELHVCQUF1QixFQUFFO1FBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEdBQUcsSUFBSSxDQUFDO1FBQy9DLE1BQU0sQ0FBQywwQkFBMEIsRUFBRSxDQUFDLENBQUksNERBQTREO0lBQ3hHLENBQUM7SUFHRCxrQkFBa0IsRUFBRTtRQUNoQixNQUFNLENBQUMsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQztRQUMxQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBR0QsMEJBQTBCLEVBQUUsVUFBQyxLQUFhLEVBQUUsS0FBYTtRQUNyRCxJQUFJLFFBQWdCLENBQUM7UUFDckIsMERBQTBEO1FBQzFELFFBQVEsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxhQUFhLENBQUM7UUFDN0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDN0MsTUFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDcEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3Qyw0REFBNEQ7WUFDNUQsNkNBQTZDO1lBQzdDLG9FQUFvRTtZQUNwRSxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FDL0MsVUFBQyxRQUEyQjtnQkFDeEIsSUFBSSxNQUFjLEVBQUUsQ0FBUyxDQUFDO2dCQUM5QixNQUFNLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNyQixDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ25DLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO3VCQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2hELE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxrQkFBa0I7Z0JBQ3BDLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDN0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7Z0JBQ3pDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7WUFDUCx5RkFBeUY7WUFDekYsMEZBQTBGO1lBQzFGLDBGQUEwRjtZQUMxRixnREFBZ0Q7WUFDaEQsdUZBQXVGO1lBQ3ZGLG9GQUFvRjtZQUNwRix5RkFBeUY7WUFDekYsa0RBQWtEO1lBQ2xELG1GQUFtRjtZQUNuRiwyQkFBMkI7WUFDM0IsMEZBQTBGO1lBQzFGLHdGQUF3RjtZQUN4Rix1RkFBdUY7WUFDdkYsc0ZBQXNGO1lBQ3RGLDJDQUEyQztZQUMzQyxxRkFBcUY7WUFDckYsb0ZBQW9GO1lBQ3BGLGNBQWM7WUFDZCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBUztnQkFDbEMsSUFBSSxDQUFDLEdBQVcsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakQsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDckIsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQzt3QkFDbEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3pDLENBQUM7b0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDO3dCQUNsRCxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDekMsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNqRCxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDO29CQUNsRCxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDekMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBSVAsQ0FBQztRQUNELE1BQU0sQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ25DLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQzFCLG1GQUFtRjtRQUNuRixNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUdELHlCQUF5QixFQUFFLFVBQUMsS0FBYSxFQUFFLEdBQWE7UUFDcEQsSUFBSSxLQUFhLEVBQUUsT0FBZSxFQUFFLFNBQW1CLENBQUM7UUFDeEQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGtCQUFrQixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBQ0QsNEZBQTRGO1lBQzVGLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDYixDQUFDO1FBQ0Qsc0NBQXNDO1FBQ3RDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEQsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNwQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNkLENBQUM7WUFDRCw2REFBNkQ7WUFDN0QsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUM7UUFDRCxpRUFBaUU7UUFDakUsS0FBSyxHQUFHLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDcEIsZ0VBQWdFO1FBQ2hFLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQUMsQ0FBUyxJQUFjLE9BQUEsQ0FBQyxDQUFDLENBQUMsRUFBSCxDQUFHLENBQUMsQ0FBQztRQUNwRCxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDO1FBQ3RDLFNBQVMsQ0FBQyxPQUFPLENBQUMsVUFBQyxDQUFTO1lBQ3hCLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixFQUFFLE9BQU8sQ0FBQztZQUNkLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILG1HQUFtRztRQUNuRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUM7UUFDRCx1QkFBdUI7UUFDdkIsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNiLENBQUM7SUFHRCx5QkFBeUIsRUFBRTtRQUN2QixNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsVUFBQyxHQUFrQjtZQUM5QyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsSUFBaUI7Z0JBQzFCLElBQUksTUFBTSxHQUFZLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3BGLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQy9DLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBR0QsY0FBYyxFQUFFLFVBQUMsR0FBZ0I7UUFDN0IsSUFBSSxLQUFhLEVBQUUsS0FBYSxDQUFDO1FBQ2pDLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZixLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQzFCLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ2xDLG1GQUFtRjtRQUNuRixNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUdELGlCQUFpQixFQUFFLFVBQUMsR0FBZ0I7UUFDaEMsSUFBSSxLQUFhLEVBQUUsS0FBYSxDQUFDO1FBQ2pDLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZixLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQzFCLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ2xDLDRFQUE0RTtRQUM1RSxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUdELHVCQUF1QixFQUFFO1FBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQWEsRUFBRSxDQUFTO1lBQzlDLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoRSxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7Z0JBQ3JCLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUMxQyxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUNILENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7WUFDN0MsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDO1FBQ0gsc0VBQXNFO1FBQ3RFLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JFLGlEQUFpRDtRQUNqRCxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUM1QixNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMxQixNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUNsQyxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUdELHdCQUF3QixFQUFFO1FBQ3RCLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQWtCLEVBQUUsQ0FBUztZQUN6RCxJQUFJLE1BQU0sR0FBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RELENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDckUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFDLElBQWlCLEVBQUUsQ0FBUztnQkFDckMsTUFBTSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3VCQUNqQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQzt1QkFDL0IsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDaEQsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLFVBQUMsR0FBZ0IsRUFBRSxDQUFTO1lBQzlELElBQUksTUFBTSxHQUFZLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEQsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBR0Qsc0JBQXNCLEVBQUU7UUFDcEIsSUFBSSxNQUFNLEdBQVcsQ0FBQyxFQUFFLFNBQVMsR0FBVyxDQUFDLEVBQUUsWUFBb0IsQ0FBQztRQUNwRSxtR0FBbUc7UUFDbkcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7WUFDbEMsSUFBSSxRQUFnQixDQUFDO1lBQ3JCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsS0FBSyxDQUFDLElBQUksUUFBUSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3BDLE1BQU0sRUFBRSxDQUFDLENBQUMsaURBQWlEO2dCQUMvRCxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxQyxTQUFTLEVBQUUsQ0FBQztnQkFDaEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxLQUFLLENBQUMsSUFBSSxZQUFZLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDdEQsWUFBWSxHQUFHLENBQUMsQ0FBQztnQkFDckIsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILDJFQUEyRTtRQUMzRSw4RUFBOEU7UUFDOUUsb0NBQW9DO1FBQ3BDLCtFQUErRTtRQUMvRSxvREFBb0Q7UUFDcEQsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFNBQVMsS0FBSyxDQUFDLElBQUksWUFBWSxLQUFLLFNBQVMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFHRCxrQkFBa0IsRUFBRTtRQUNoQixrREFBa0Q7UUFDbEQsZ0ZBQWdGO1FBQ2hGLElBQUksa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1FBQzVCLElBQUksb0JBQW9CLEdBQUcsRUFBRSxDQUFDO1FBQzlCLElBQUksaUJBQWlCLEdBQUcsRUFBRSxDQUFDO1FBQzNCLDZEQUE2RDtRQUM3RCxJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztRQUM1QixJQUFJLHFCQUFxQixHQUFHLENBQUMsQ0FBQztRQUM5QixJQUFJLGtCQUFrQixHQUFHLENBQUMsQ0FBQztRQUMzQix3Q0FBd0M7UUFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEdBQUcsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO1FBRXRDLDhFQUE4RTtRQUM5RSwwRUFBMEU7UUFDMUUsSUFBSSxhQUFhLEdBQUcsTUFBTSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFFcEQsaUVBQWlFO1FBQ2pFLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBUztnQkFDekMsSUFBSSxHQUFRLEVBQUUsV0FBcUIsRUFBRSxLQUFVLEVBQUUsU0FBa0IsQ0FBQztnQkFDcEUsNkNBQTZDO2dCQUM3QyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEMsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBQ0QsR0FBRyxHQUFHO29CQUNGLDBCQUEwQjtvQkFDMUIsT0FBTyxFQUFFLFNBQVMsR0FBRyxDQUFDO29CQUN0QixNQUFNLEVBQUUsU0FBUyxHQUFHLENBQUM7b0JBQ3JCLE9BQU8sRUFBRSxPQUFPO29CQUNoQixpQ0FBaUM7b0JBQ2pDLGNBQWMsRUFBRSxDQUFDO29CQUNqQixPQUFPLEVBQUUsSUFBSTtvQkFDYixXQUFXLEVBQUUsSUFBSTtvQkFDakIsaUJBQWlCLEVBQUUsSUFBSTtvQkFDdkIsVUFBVSxFQUFFLEVBQUU7b0JBQ2QsWUFBWSxFQUFFLElBQUk7b0JBQ2xCLFdBQVc7b0JBQ1gsTUFBTSxFQUFFLEVBQUU7aUJBQ2IsQ0FBQztnQkFDRixXQUFXLEdBQUcsRUFBRSxDQUFDO2dCQUNqQixLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUNYLFNBQVMsR0FBRyxLQUFLLENBQUM7Z0JBQ2xCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQWEsRUFBRSxDQUFTO29CQUM5QyxJQUFJLFFBQWdCLEVBQUUsS0FBYSxFQUFFLEtBQWEsRUFBRSxTQUFpQixDQUFDO29CQUN0RSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNyRSxNQUFNLENBQUM7b0JBQ1gsQ0FBQztvQkFDRCxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDeEMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDWixNQUFNLENBQUM7b0JBQ1gsQ0FBQztvQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBQ3pCLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQzt3QkFDaEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzs0QkFDUixHQUFHLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQzt3QkFDM0IsQ0FBQzt3QkFDRCxNQUFNLENBQUM7b0JBQ1gsQ0FBQztvQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBQ3pCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7NEJBQ1IsR0FBRyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7NEJBQ2pCLEdBQUcsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO3dCQUNoQyxDQUFDO3dCQUNELE1BQU0sQ0FBQztvQkFDWCxDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDeEIsS0FBSyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUNoQyxTQUFTLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUM5QixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ3BCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQ0FDVCwyREFBMkQ7Z0NBQzNELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztvQ0FDN0IsTUFBTSxDQUFDO2dDQUNYLENBQUM7Z0NBQ0QsZ0VBQWdFO2dDQUNoRSxLQUFLLEdBQUcsSUFBSSxDQUFDOzRCQUNqQixDQUFDOzRCQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQ0FDcEIsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEtBQUssQ0FBQztnQ0FDekIsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQ0FDNUIsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7NEJBQ3pDLENBQUM7d0JBQ0wsQ0FBQzt3QkFDRCxNQUFNLENBQUM7b0JBQ1gsQ0FBQztvQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLEVBQUUsSUFBSSxLQUFLLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDdEMsMkVBQTJFO3dCQUMzRSxpRkFBaUY7d0JBQ2pGLE1BQU0sQ0FBQztvQkFDWCxDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDeEIscUVBQXFFO3dCQUNyRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDN0Isa0JBQWtCLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsQ0FBQzs0QkFDbEQsTUFBTSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ2pELENBQUM7d0JBQ0QsR0FBRyxDQUFDLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDdEMsR0FBRyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7d0JBQ3RCLE1BQU0sQ0FBQztvQkFDWCxDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDeEIscUVBQXFFO3dCQUNyRSxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDL0Isb0JBQW9CLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsQ0FBQzs0QkFDdEQsTUFBTSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ25ELENBQUM7d0JBQ0QsR0FBRyxDQUFDLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDbEQsTUFBTSxDQUFDO29CQUNYLENBQUM7b0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDNUIsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQzs0QkFDaEQsTUFBTSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ2hELENBQUM7d0JBQ0QsR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQzt3QkFDL0MsU0FBUyxHQUFHLElBQUksQ0FBQztvQkFDckIsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztnQkFDSCxXQUFXLENBQUMsSUFBSSxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSyxPQUFBLENBQUMsR0FBRyxDQUFDLEVBQUwsQ0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsSUFBWTtvQkFDbkQsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsaURBQWlEO2dCQUNqRCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsTUFBTSxJQUFJLFNBQVMsSUFBSSxHQUFHLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQzdELE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDckMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBR1AsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFVBQUMsQ0FBQyxFQUFFLENBQVM7Z0JBQ3pDLElBQUksU0FBaUIsRUFBRSxHQUFRLENBQUM7Z0JBQ2hDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNsQyxNQUFNLENBQUM7Z0JBQ1gsQ0FBQztnQkFDRCxTQUFTLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4RCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUNaLHlFQUF5RTtvQkFDekUsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2pDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLENBQUM7d0JBQ3RELE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNyRCxDQUFDO29CQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQWEsRUFBRSxDQUFTO3dCQUM5QyxJQUFJLFFBQWdCLEVBQUUsS0FBYSxFQUFFLEtBQWEsRUFBRSxTQUFpQixDQUFDO3dCQUN0RSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUNyRSxNQUFNLENBQUM7d0JBQ1gsQ0FBQzt3QkFDRCxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDNUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDeEMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxJQUFJLFFBQVEsS0FBSyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7NEJBQ3hFLE1BQU0sQ0FBQzt3QkFDWCxDQUFDO3dCQUNELEdBQUcsR0FBRzs0QkFDRiwyRUFBMkU7NEJBQzNFLE9BQU8sRUFBRSxTQUFTLEdBQUcsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDOzRCQUNwQyxNQUFNLEVBQUUsU0FBUyxHQUFHLENBQUMsR0FBRyxPQUFPLEdBQUcsQ0FBQzs0QkFDbkMsT0FBTyxFQUFFLE9BQU87NEJBQ2hCLGlDQUFpQzs0QkFDakMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU07NEJBQzdDLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLENBQUM7NEJBQ3RDLFdBQVcsRUFBRSxTQUFTOzRCQUN0QixpQkFBaUIsRUFBRSxJQUFJOzRCQUN2QixVQUFVLEVBQUUsRUFBRTs0QkFDZCxZQUFZLEVBQUUsS0FBSzs0QkFDbkIsV0FBVzs0QkFDWCxNQUFNLEVBQUUsRUFBRTt5QkFDYixDQUFDO3dCQUNGLEVBQUUsQ0FBQyxDQUFDLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUNqQixFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQ0FDL0Isb0JBQW9CLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsQ0FBQztnQ0FDdEQsTUFBTSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7NEJBQ25ELENBQUM7NEJBQ0QsR0FBRyxDQUFDLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDdEQsQ0FBQzt3QkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7NEJBQ3pCLEdBQUcsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDOzRCQUNqQixHQUFHLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQzt3QkFDaEMsQ0FBQzt3QkFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3JDLENBQUMsQ0FBQyxDQUFDO2dCQUNQLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDTCxDQUFDO0lBR0QsZ0JBQWdCLEVBQUU7UUFDZCwyRUFBMkU7UUFDM0UsMEVBQTBFO1FBQzFFLDhCQUE4QjtRQUM5QixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO1lBQzdCLFlBQVksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLG1CQUFtQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN0RixDQUFDO0lBQ0wsQ0FBQztJQUdELGVBQWUsRUFBRTtRQUNiLE1BQU0sQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7UUFDL0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsY0FBYyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzlCLDZEQUE2RDtRQUM3RCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN0QyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsVUFBQyxHQUFHLElBQUssT0FBQSxjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUE3QixDQUE2QixDQUFDLENBQUM7UUFDM0UsQ0FBQztRQUNELGNBQWMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBR0Qsb0JBQW9CLEVBQUU7UUFDbEIsa0JBQWtCO0lBQ3RCLENBQUM7SUFHRCwrQkFBK0IsRUFBRSxVQUFDLE9BQWU7UUFDN0MsSUFBSSxLQUF1QixFQUFFLElBQXNCLENBQUM7UUFDcEQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRCxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osb0VBQW9FO1lBQ3BFLDRFQUE0RTtZQUM1RSw0RUFBNEU7WUFDNUUsaURBQWlEO1lBQ2pELE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEdBQUcsRUFBRSxDQUFDO1lBQ25ELEtBQUssR0FBc0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQztpQkFDbEMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLHlCQUF5QixFQUFFLGFBQWEsRUFBRSxDQUFDLEVBQUUsQ0FBQztpQkFDM0QsUUFBUSxDQUFDLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztpQkFDakUsRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsVUFBQyxFQUEwQjtnQkFDL0MsTUFBTSxDQUFDLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNWLElBQUksR0FBc0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxVQUFDLElBQVksRUFBRSxDQUFTO2dCQUM3RCxJQUFJLEtBQVUsRUFBRSxHQUF3QixFQUFFLFVBQWUsRUFDckQsSUFBWSxFQUFFLE9BQWUsRUFBRSxPQUFlLENBQUM7Z0JBQ25ELEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNyRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1QsS0FBSyxHQUFHLEVBQUUsQ0FBQztvQkFDWCxVQUFVLEdBQUcsTUFBTSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDdkQscURBQXFEO29CQUNyRCxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsR0FBeUIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUM1RCwrREFBK0Q7b0JBQy9ELENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO29CQUNqRCwrREFBK0Q7b0JBQy9ELElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFDckQsT0FBTyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO3lCQUNqQyxJQUFJLENBQUMsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQzt5QkFDL0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxZQUFZLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVCLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7eUJBQzFELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQzNDLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBQyxFQUFVO3dCQUN0RCxJQUFJLEtBQWtCLEVBQUUsSUFBZ0IsRUFBRSxRQUFhLENBQUM7d0JBQ3hELEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUMzQixJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ2hDLFFBQVEsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDeEMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDOzZCQUMvRCxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQzs2QkFDcEMsSUFBSSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUNyRCxDQUFDLENBQUMsQ0FBQztvQkFDSCxrRkFBa0Y7b0JBQ2xGLElBQUksR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7eUJBQ3hFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDcEIsT0FBTyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUM7eUJBQzFELElBQUksQ0FBQyxNQUFNLEVBQUUsV0FBVyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3pDLEtBQUssQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMzQixDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO3lCQUMxRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUMxQyw2REFBNkQ7b0JBQzdELENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBQyxJQUFTO3dCQUMzQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7NkJBQy9ELElBQUksQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ3pELENBQUMsQ0FBQyxDQUFDO29CQUNILE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUN6RCxDQUFDO2dCQUNELENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMvQixNQUFNLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM5RCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDTCxDQUFDO0lBR0QsaUNBQWlDLEVBQUU7UUFDL0IsSUFBSSxLQUF1QixFQUFFLElBQXNCLEVBQUUsR0FBd0IsQ0FBQztRQUM5RSw4REFBOEQ7UUFDOUQsS0FBSyxHQUFzQixDQUFDLENBQUMsU0FBUyxDQUFDO2FBQ2xDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSwrQkFBK0IsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLENBQUM7YUFDakUsUUFBUSxDQUFDLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUNsRSxFQUFFLENBQUMsUUFBUSxFQUFFLG9CQUFvQixFQUFFLFVBQUMsRUFBMEI7WUFDM0Qsc0VBQXNFO1lBQ3RFLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVixJQUFJLEdBQXNCLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUQsd0JBQXdCO1FBQ3hCLEdBQUcsR0FBeUIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzdDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUYsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEtBQUssS0FBSyxHQUFHLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakYsd0JBQXdCO1FBQ3hCLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEdBQUcsRUFBRSxDQUFDLENBQUcscUNBQXFDO1FBQzdGLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLFVBQUMsSUFBWSxFQUFFLENBQVM7WUFDL0QsSUFBSSxLQUFVLENBQUM7WUFDZixLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM5QyxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUNYLEtBQUssQ0FBQyxNQUFNLEdBQUcsR0FBRyxHQUF5QixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQzVELENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO2dCQUNqRCxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsSUFBWTtvQkFDcEQsSUFBSSxJQUFJLEdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFDakUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUN4RSxDQUFDLENBQUMsQ0FBQztnQkFDSCxNQUFNLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUNsRCxDQUFDO1lBQ0QsdUNBQXVDO1lBQ3ZDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztpQkFDaEQsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxZQUFZLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRCxRQUFRLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztpQkFDakQsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxZQUFZLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRCxRQUFRLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3JHLFFBQVEsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM3QyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7aUJBQ2xELElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsYUFBYSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEQsUUFBUSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1Riw0REFBNEQ7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxrQkFBa0IsS0FBSyxLQUFLLENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxtQ0FBbUMsRUFBRSxDQUFDO0lBQ2pELENBQUM7SUFHRCw4QkFBOEIsRUFBRTtRQUM1QixJQUFJLEtBQXVCLEVBQUUsSUFBc0IsRUFBRSxHQUF3QixDQUFDO1FBQzlFLHFEQUFxRDtRQUNyRCxLQUFLLEdBQXNCLENBQUMsQ0FBQyxTQUFTLENBQUM7YUFDbEMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLGFBQWEsRUFBRSxDQUFDLEVBQUUsQ0FBQzthQUM3RCxRQUFRLENBQUMsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQzlELEVBQUUsQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLFVBQUMsRUFBMEI7WUFDOUMsd0NBQXdDO1FBQzVDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ1YsSUFBSSxHQUFzQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLFVBQUMsSUFBWSxFQUFFLENBQVM7WUFDNUQsSUFBSSxLQUFVLENBQUM7WUFDZixLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDWCxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsR0FBeUIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUM1RCxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztnQkFDakQsS0FBSyxDQUFDLE9BQU8sR0FBRyxRQUFRLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN6RSxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDL0MsQ0FBQztZQUNELEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxXQUFXLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUM7aUJBQ3hFLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RCxRQUFRLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JHLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUdELCtFQUErRTtJQUMvRSwyRUFBMkU7SUFDM0UsZUFBZSxFQUFFO1FBQ2IsSUFBSSxPQUFPLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFJLG1DQUFtQztRQUMzRSw4RkFBOEY7UUFDOUYsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN2QyxDQUFDLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUM3QyxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN6QyxrRkFBa0Y7UUFDbEYsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEMsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xELE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0MsNkZBQTZGO1FBQzdGLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzNFLHNGQUFzRjtRQUN0RixNQUFNLENBQUMsK0JBQStCLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzlELHVGQUF1RjtRQUN2RixtRkFBbUY7UUFDbkYsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGtCQUFrQixLQUFLLElBQUksSUFBSSxNQUFNLENBQUMsa0JBQWtCLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztRQUUvRSxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUMxRix3RkFBd0Y7WUFDeEYsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLHlFQUF5RTtZQUN6RSxNQUFNLENBQUMsaUNBQWlDLEVBQUUsQ0FBQztRQUMvQyxDQUFDO1FBQ0QsNEVBQTRFO1FBQzVFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLDhCQUE4QixFQUFFLENBQUM7UUFDNUMsQ0FBQztRQUNELG1FQUFtRTtRQUNuRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUdELHFDQUFxQztJQUNyQywyRkFBMkY7SUFDM0YsdUNBQXVDO0lBQ3ZDLDhGQUE4RjtJQUM5RiwwRkFBMEY7SUFDMUYsOEJBQThCO0lBQzlCLHlCQUF5QixFQUFFLFVBQUMsT0FBb0I7UUFDNUMsSUFBSSxPQUFlLEVBQUUsQ0FBUyxDQUFDO1FBQy9CLE9BQU8sR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3QywyRkFBMkY7UUFDM0YsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxLQUFLLEtBQUssQ0FBQyxDQUFDO1FBQzNELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzFCLHNGQUFzRjtZQUN0RixNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFDRCxDQUFDLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsR0FBUTtZQUNwRSxJQUFJLE1BQU0sR0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3JDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixNQUFNLENBQUM7WUFDWCxDQUFDO1lBQ0QscURBQXFEO1lBQ3JELE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBR0QsMkJBQTJCLEVBQUUsVUFBQyxPQUFvQjtRQUM5QyxJQUFJLE1BQWMsRUFBRSxJQUFZLEVBQUUsSUFBWSxFQUFFLENBQVMsQ0FBQztRQUMxRCxNQUFNLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BCLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDckIsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekIsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsSUFBSSxJQUFJLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztZQUM1QyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBQyxHQUFRO2dCQUNuRSxJQUFJLFNBQVMsR0FBVyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN4RCxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUUsbUNBQW1DO2dCQUNyRCxDQUFDO2dCQUNELDJFQUEyRTtnQkFDM0UsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQzFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ25DLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDakIsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0QseURBQXlEO1FBQ3pELE1BQU0sQ0FBQyxtQ0FBbUMsRUFBRSxDQUFDO0lBQ2pELENBQUM7SUFHRCxzRkFBc0Y7SUFDdEYscUZBQXFGO0lBQ3JGLHFGQUFxRjtJQUNyRixtREFBbUQ7SUFDbkQsbUNBQW1DLEVBQUU7UUFDakMsSUFBSSxNQUFlLENBQUM7UUFDcEIsTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsS0FBSyxDQUFDLFVBQUMsR0FBUTtZQUNwRSxJQUFJLE1BQU0sR0FBVyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3hDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFFLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDaEIsQ0FBQztZQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxrQkFBa0IsS0FBSyxLQUFLLElBQUksTUFBTSxDQUFDLENBQUM7SUFDakcsQ0FBQztJQUdELHlCQUF5QixFQUFFLFVBQUMsV0FBbUIsRUFBRSxZQUFvQjtRQUNqRSxJQUFJLFVBQWUsRUFBRSxPQUFlLEVBQUUsTUFBZ0IsQ0FBQztRQUN2RCxVQUFVLEdBQUc7WUFDVCxNQUFNLEVBQUMsQ0FBQztZQUNSLE9BQU8sRUFBQyxDQUFDO1NBQ1osQ0FBQztRQUNGLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDWiw0REFBNEQ7UUFDNUQsTUFBTSxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM1RCxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQUMsRUFBVSxFQUFFLENBQVM7WUFDL0IsSUFBSSxLQUFrQixFQUFFLElBQWdCLEVBQUUsUUFBYSxFQUFFLElBQVksQ0FBQztZQUN0RSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzQixJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3hDLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3hELEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNuRCxnRUFBZ0U7Z0JBQ2hFLFVBQVUsQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUUsMEJBQTBCO1lBQzdDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxXQUFXLEtBQUssS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3JELHlFQUF5RTtnQkFDekUsT0FBTyxHQUFHLEdBQUcsQ0FBQztnQkFDZCxVQUFVLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUM1QixDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDL0QseUVBQXlFO2dCQUN6RSxPQUFPLEdBQUcsR0FBRyxDQUFDO2dCQUNkLFVBQVUsQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQzVCLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM5RCx5RUFBeUU7Z0JBQ3pFLDRFQUE0RTtnQkFDNUUsNkJBQTZCO2dCQUM3QixPQUFPLEdBQUcsR0FBRyxDQUFDO2dCQUNkLFVBQVUsQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQzVCLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUc7Z0JBQ2hCLENBQUMsSUFBSSxNQUFNLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDOUUsbUZBQW1GO2dCQUNuRixlQUFlO2dCQUNmLE9BQU8sR0FBRyxHQUFHLENBQUM7Z0JBQ2QsVUFBVSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDNUIsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLEdBQUcsR0FBRyxJQUFJLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxvRUFBb0U7Z0JBQ3BFLE9BQU8sR0FBRyxHQUFHLENBQUM7Z0JBQ2QsVUFBVSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDNUIsQ0FBQztZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQyxDQUFDLENBQUM7UUFDSCxpRUFBaUU7UUFDakUsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNaLDBEQUEwRDtRQUMxRCxDQUFDLE1BQU0sQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsSUFBUyxFQUFFLENBQVM7WUFDcEQsRUFBRSxDQUFDLENBQUMsV0FBVyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN6QixtREFBbUQ7Z0JBQ25ELFVBQVUsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFFLDBCQUEwQjtZQUM3QyxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sR0FBRyxHQUFHLElBQUksV0FBVyxDQUFDLFdBQVcsRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3RSxrREFBa0Q7Z0JBQ2xELE9BQU8sR0FBRyxHQUFHLENBQUM7Z0JBQ2QsVUFBVSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCw0REFBNEQ7Z0JBQzVELE9BQU8sR0FBRyxHQUFHLENBQUM7Z0JBQ2QsVUFBVSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCx3REFBd0Q7Z0JBQ3hELE9BQU8sR0FBRyxHQUFHLENBQUM7Z0JBQ2QsVUFBVSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0MsZ0ZBQWdGO2dCQUNoRiw4QkFBOEI7Z0JBQzlCLE9BQU8sR0FBRyxHQUFHLENBQUM7Z0JBQ2QsVUFBVSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hDLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFVBQVUsQ0FBQztJQUN0QixDQUFDO0lBR0QsWUFBWSxFQUFFLFVBQUMsQ0FBeUI7UUFDcEMsSUFBSSxJQUFZLEVBQUUsQ0FBUyxFQUFFLENBQVMsQ0FBQztRQUN2Qyx5REFBeUQ7UUFDekQsMERBQTBEO1FBQzFELElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNkLENBQUMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNqQyxDQUFDLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDSixDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO1lBQ3hGLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNKLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO1lBQ3pFLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUdELG9CQUFvQixFQUFFLFVBQUMsQ0FBeUI7UUFDNUMsSUFBSSxJQUFZLEVBQUUsQ0FBUyxFQUFFLENBQVMsQ0FBQztRQUN2Qyx5REFBeUQ7UUFDekQsMERBQTBEO1FBQzFELElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNkLENBQUMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNqQyxDQUFDLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixFQUFFLENBQUMsQ0FBQztnQkFDSixFQUFFLENBQUMsQ0FBQztnQkFDSixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2pDLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztnQkFDM0MsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7Z0JBQzFDLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQzVCLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUMxQixNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztZQUN0QyxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFHRCxzQkFBc0IsRUFBRTtRQUNwQixJQUFJLElBQVksQ0FBQztRQUNqQix1RkFBdUY7UUFDdkYsb0ZBQW9GO1FBQ3BGLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDOUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUdELHFEQUFxRDtJQUNyRCxrQkFBa0I7SUFDbEIsaUJBQWlCLEVBQUUsVUFBQyxDQUF1QjtRQUN2QyxJQUFJLEtBQXVCLEVBQUUsSUFBWSxDQUFDO1FBQzFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQixLQUFLLEdBQXNCLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDcEMsSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN0QixpRUFBaUU7WUFDakUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQztnQkFDVCxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDO2dCQUN2QyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUM7YUFDakMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNsQixvQ0FBb0M7WUFDcEMsS0FBSyxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUdELFNBQVMsRUFBRTtRQUNQLElBQUksZ0JBQTBCLEVBQUUsb0JBQThCLENBQUM7UUFDL0QsZ0JBQWdCLEdBQUcsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUM3RixvQkFBb0IsR0FBRyxDQUFDLGNBQWMsRUFBRSxhQUFhLEVBQUUsY0FBYyxFQUFFLGNBQWM7WUFDN0UsZUFBZSxDQUFDLENBQUM7UUFDekIsQ0FBQyxDQUFDLFdBQVcsQ0FBQzthQUNULEVBQUUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLGFBQWEsQ0FBQzthQUNqQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQzthQUN2QyxFQUFFLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxlQUFlLENBQUM7YUFDYixFQUFFLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUM7YUFDbkQsRUFBRSxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDdkQsb0VBQW9FO1FBQ3BFLG9FQUFvRTtRQUNwRSxtRUFBbUU7UUFDbkUsbUZBQW1GO1FBQ25GLGdDQUFnQztRQUNoQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDMUQsc0ZBQXNGO1FBQ3RGLGtDQUFrQztRQUNsQywyRkFBMkY7UUFDM0YscURBQXFEO1FBQ3JELENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQzlFLG1EQUFtRDtRQUNuRCxRQUFRLENBQUMsd0JBQXdCLENBQUMsY0FBYyxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDNUUsUUFBUSxDQUFDLHdCQUF3QixDQUFDLGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxPQUFPLENBQUMsZUFBZSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3hHLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxxRkFBcUY7UUFDckgsTUFBTSxDQUFDLDBCQUEwQixFQUFFLENBQUM7SUFDeEMsQ0FBQztDQUVBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb21waWxlZCB0byBKUyBvbjogTW9uIEZlYiAxNSAyMDE2IDE0OjMxOjM5ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJsaWIvanF1ZXJ5LmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkVERERhdGFJbnRlcmZhY2UudHNcIiAvPlxuXG5kZWNsYXJlIHZhciBBVERhdGE6YW55OyAvLyBTZXR1cCBieSB0aGUgc2VydmVyLlxuZGVjbGFyZSB2YXIgRUREQVRER3JhcGhpbmc6YW55O1xuZGVjbGFyZSB2YXIgRUREX2F1dG86YW55O1xuXG4vLyBUeXBlIG5hbWUgZm9yIHRoZSBncmlkIG9mIHZhbHVlcyBwYXN0ZWQgaW5cbmludGVyZmFjZSBSYXdJbnB1dCBleHRlbmRzIEFycmF5PHN0cmluZ1tdPiB7fVxuLy8gdHlwZSBmb3IgdGhlIHN0YXRzIGdlbmVyYXRlZCBmcm9tIHBhcnNpbmcgaW5wdXQgdGV4dFxuaW50ZXJmYWNlIFJhd0lucHV0U3RhdCB7XG4gICAgaW5wdXQ6IFJhd0lucHV0O1xuICAgIGNvbHVtbnM6IG51bWJlcjtcbn1cbi8vIHR5cGUgZm9yIHRoZSBvcHRpb25zIGluIHJvdyBwdWxsZG93bnNcbi8vIFRPRE8gdXBkYXRlIHRvIHVzZSB1bmlvbnMgd2hlbiBtaWdyYXRpbmcgdG8gVHlwZXNjcmlwdCAxLjQrXG5pbnRlcmZhY2UgUm93UHVsbGRvd25PcHRpb24gZXh0ZW5kcyBBcnJheTxhbnk+IHsgLy8gQXJyYXk8c3RyaW5nfG51bWJlcnxSb3dQdWxsZG93bk9wdGlvbltdPlxuICAgIDA6IHN0cmluZztcbiAgICAxOiBhbnk7IC8vIG51bWJlciB8IFJvd1B1bGxkb3duT3B0aW9uW11cbn1cblxudmFyIEVEREFURDphbnk7XG5cbkVEREFURCA9IHtcblxuLy8gVGhlIFByb3RvY29sIGZvciB3aGljaCB3ZSB3aWxsIGJlIGltcG9ydGluZyBkYXRhLlxubWFzdGVyUHJvdG9jb2w6MCxcbi8vIFRoZSBtYWluIG1vZGUgd2UgYXJlIGludGVycHJldGluZyBkYXRhIGluLlxuLy8gVmFsaWQgdmFsdWVzIHNvZmFyIGFyZSBcInN0ZFwiLCBcIm1kdlwiLCBcInRyXCIsIFwicHJcIi5cbmludGVycHJldGF0aW9uTW9kZTpcInN0ZFwiLFxucHJvY2Vzc0ltcG9ydFNldHRpbmdzVGltZXJJRDowLFxuXG4vLyBVc2VkIHRvIHBhcnNlIHRoZSBTdGVwIDIgZGF0YSBpbnRvIGEgbnVsbC1wYWRkZWQgcmVjdGFuZ3VsYXIgZ3JpZFxuR3JpZDp7XG4gICAgZGF0YTpbXSxcbiAgICByb3dNYXJrZXJzOltdLFxuICAgIHRyYW5zcG9zZTogZmFsc2UsXG4gICAgLy8gSWYgdGhlIHVzZXIgZGVsaWJlcmF0ZWx5IGNob3NlIHRvIHRyYW5zcG9zZSBvciBub3QgdHJhbnNwb3NlLCBkaXNhYmxlIHRoZSBhdHRlbXB0XG4gICAgLy8gdG8gYXV0by1kZXRlcm1pbmUgdHJhbnNwb3NpdGlvbi5cbiAgICB1c2VyQ2xpY2tlZE9uVHJhbnNwb3NlOiBmYWxzZSxcbiAgICAvLyBXaGV0aGVyIHRvIGludGVycHJldCB0aGUgcGFzdGVkIGRhdGEgcm93LXdpc2Ugb3IgY29sdW1uLXdpc2UsIHdoZW4gaW1wb3J0aW5nXG4gICAgLy8gZWl0aGVyIG1lYXN1cmVtZW50cyBvciBtZXRhZGF0YS5cbiAgICBpZ25vcmVEYXRhR2FwczogZmFsc2UsXG4gICAgdXNlckNsaWNrZWRPbklnbm9yZURhdGFHYXBzOiBmYWxzZVxufSxcblxuLy8gVXNlZCB0byBhc3NlbWJsZSBhbmQgZGlzcGxheSB0aGUgdGFibGUgY29tcG9uZW50cyBpbiBTdGVwIDNcblRhYmxlOntcbiAgICByb3dMYWJlbENlbGxzOltdLFxuICAgIGNvbENoZWNrYm94Q2VsbHM6W10sXG4gICAgY29sT2JqZWN0czpbXSxcbiAgICBkYXRhQ2VsbHM6W10sXG5cbiAgICAvLyBXZSBrZWVwIGEgc2luZ2xlIGZsYWcgZm9yIGVhY2ggZGF0YSBwb2ludCBbeSx4XVxuICAgIC8vIGFzIHdlbGwgYXMgdHdvIGxpbmVhciBzZXRzIG9mIGZsYWdzIGZvciBlbmFibGluZyBvciBkaXNhYmxpbmdcbiAgICAvLyBlbnRpcmUgY29sdW1ucy9yb3dzLlxuICAgIGFjdGl2ZUNvbEZsYWdzOltdLFxuICAgIGFjdGl2ZVJvd0ZsYWdzOltdLFxuICAgIGFjdGl2ZUZsYWdzOltdLFxuXG4gICAgLy8gQXJyYXlzIGZvciB0aGUgcHVsbGRvd24gbWVudXMgb24gdGhlIGxlZnQgc2lkZSBvZiB0aGUgdGFibGUuXG4gICAgLy8gVGhlc2UgcHVsbGRvd25zIGFyZSB1c2VkIHRvIHNwZWNpZnkgdGhlIGRhdGEgdHlwZSAtIG9yIHR5cGVzIC0gY29udGFpbmVkIGluIGVhY2hcbiAgICAvLyByb3cgb2YgdGhlIHBhc3RlZCBkYXRhLlxuICAgIHB1bGxkb3duT2JqZWN0czpbXSxcbiAgICBwdWxsZG93blNldHRpbmdzOltdLFxuICAgIC8vIFdlIGFsc28ga2VlcCBhIHNldCBvZiBmbGFncyB0byB0cmFjayB3aGV0aGVyIGEgcHVsbGRvd24gd2FzIGNoYW5nZWQgYnkgYSB1c2VyIGFuZFxuICAgIC8vIHdpbGwgbm90IGJlIHJlY2FsY3VsYXRlZC5cbiAgICBwdWxsZG93blVzZXJDaGFuZ2VkRmxhZ3M6W11cbn0sXG5cbmdyYXBoRW5hYmxlZDoxLFxuZ3JhcGhSZWZyZXNoVGltZXJJRDowLFxuXG4vLyBEYXRhIHN0cnVjdHVyZXMgcHVsbGVkIGZyb20gdGhlIGdyaWQgYW5kIGNvbXBvc2VkIGludG8gc2V0cyBzdWl0YWJsZSBmb3IgaGFuZGluZyB0b1xuLy8gdGhlIEVERCBzZXJ2ZXJcblNldHM6e1xuICAgIHBhcnNlZFNldHM6W10sXG4gICAgdW5pcXVlTGluZUFzc2F5TmFtZXM6W10sXG4gICAgdW5pcXVlTWVhc3VyZW1lbnROYW1lczpbXSxcbiAgICB1bmlxdWVNZXRhZGF0YU5hbWVzOltdLFxuICAgIC8vIEEgZmxhZyB0byBpbmRpY2F0ZSB3aGV0aGVyIHdlIGhhdmUgc2VlbiBhbnkgdGltZXN0YW1wcyBzcGVjaWZpZWQgaW4gdGhlIGltcG9ydCBkYXRhXG4gICAgc2VlbkFueVRpbWVzdGFtcHM6IGZhbHNlXG59LFxuXG4vLyBTdG9yYWdlIGFyZWEgZm9yIGRpc2FtYmlndWF0aW9uLXJlbGF0ZWQgVUkgd2lkZ2V0cyBhbmQgaW5mb3JtYXRpb25cbkRpc2FtOntcbiAgICAvLyBUaGVzZSBvYmplY3RzIGhvbGQgc3RyaW5nIGtleXMgdGhhdCBjb3JyZXNwb25kIHRvIHVuaXF1ZSBuYW1lcyBmb3VuZCBkdXJpbmcgcGFyc2luZy5cbiAgICAvLyBUaGUgc3RyaW5nIGtleXMgcG9pbnQgdG8gZXhpc3RpbmcgYXV0b2NvbXBsZXRlIG9iamVjdHMgY3JlYXRlZCBzcGVjaWZpY2FsbHkgZm9yXG4gICAgLy8gdGhvc2Ugc3RyaW5ncy4gQXMgdGhlIGRpc2FtYmlndWF0aW9uIHNlY3Rpb24gaXMgZGVzdHJveWVkIGFuZCByZW1hZGUsIGFueSBzZWxlY3Rpb25zXG4gICAgLy8gdGhlIHVzZXIgaGFzIGFscmVhZHkgc2V0IHdpbGwgcGVyc2V2ZXJlLlxuICAgIC8vIEZvciBkaXNhbWJ1Z3VhdGluZyBBc3NheXMvTGluZXNcbiAgICBhc3NheUxpbmVPYmpTZXRzOnt9LFxuICAgIGN1cnJlbnRseVZpc2libGVBc3NheUxpbmVPYmpTZXRzOltdLFxuICAgIC8vIEZvciBkaXNhbWJ1Z3VhdGluZyBtZWFzdXJlbWVudCB0eXBlc1xuICAgIG1lYXN1cmVtZW50T2JqU2V0czp7fSxcbiAgICBjdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzOltdLFxuICAgIC8vIEZvciBkaXNhbWJ1Z3VhdGluZyBtZXRhZGF0YVxuICAgIG1ldGFkYXRhT2JqU2V0czp7fSxcbiAgICAvLyBUbyBnaXZlIHVuaXF1ZSBJRCB2YWx1ZXMgdG8gZWFjaCBhdXRvY29tcGxldGUgZW50aXR5IHdlIGNyZWF0ZVxuICAgIGF1dG9Db21wVUlEOjBcbn0sXG5cbkF1dG9DYWNoZToge1xuICAgIGNvbXA6IHt9LFxuICAgIG1ldGE6IHt9LFxuICAgIHVuaXQ6IHt9LFxuICAgIG1ldGFib2xpdGU6IHt9XG59LFxuXG5cbmNoYW5nZWRNYXN0ZXJQcm90b2NvbDogKCk6dm9pZCA9PiB7XG4gICAgdmFyIHByb3RvY29sSW46SlF1ZXJ5LCBhc3NheUluOkpRdWVyeSwgY3VycmVudEFzc2F5czpudW1iZXJbXTtcbiAgICAvLyBjaGVjayBtYXN0ZXIgcHJvdG9jb2xcbiAgICBwcm90b2NvbEluID0gJCgnI21hc3RlclByb3RvY29sJyk7XG4gICAgaWYgKHByb3RvY29sSW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKEVEREFURC5tYXN0ZXJQcm90b2NvbCA9PT0gcGFyc2VJbnQocHJvdG9jb2xJbi52YWwoKSwgMTApKSB7XG4gICAgICAgIC8vIG5vIGNoYW5nZVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIEVEREFURC5tYXN0ZXJQcm90b2NvbCA9IHBhcnNlSW50KHByb3RvY29sSW4udmFsKCksIDEwKTtcbiAgICAvLyBjaGVjayBmb3IgbWFzdGVyIGFzc2F5XG4gICAgYXNzYXlJbiA9ICQoJyNtYXN0ZXJBc3NheScpLmVtcHR5KCk7XG4gICAgaWYgKGFzc2F5SW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgJCgnPG9wdGlvbj4nKS50ZXh0KCcoQ3JlYXRlIE5ldyknKS5hcHBlbmRUbyhhc3NheUluKS52YWwoJ25ldycpLnByb3AoJ3NlbGVjdGVkJywgdHJ1ZSk7XG4gICAgY3VycmVudEFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1twcm90b2NvbEluLnZhbCgpXSB8fCBbXTtcbiAgICBjdXJyZW50QXNzYXlzLmZvckVhY2goKGlkOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2lkXSxcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0sXG4gICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICQoJzxvcHRpb24+JykuYXBwZW5kVG8oYXNzYXlJbikudmFsKCcnICsgaWQpLnRleHQoW1xuICAgICAgICAgICAgbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lIF0uam9pbignLScpKTtcbiAgICB9KTtcbiAgICBpZiAoJCgnI21hc3RlckxpbmVTcGFuJykucmVtb3ZlQ2xhc3MoJ29mZicpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgRUREQVRELnF1ZXVlUHJvY2Vzc0ltcG9ydFNldHRpbmdzKCk7XG4gICAgfVxufSxcblxuXG5xdWV1ZVByb2Nlc3NJbXBvcnRTZXR0aW5nczogKCk6dm9pZCA9PiB7XG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVwYXJzZXMgdGhlIGltcG9ydCBzZXR0aW5ncy5cbiAgICAvLyBUaGlzIHdheSB3ZSdyZSBjYWxsaW5nIHRoZSByZXBhcnNlIGp1c3Qgb25jZSwgZXZlbiB3aGVuIHdlIGdldCBtdWx0aXBsZSBjYXNjYWRlZFxuICAgIC8vIGV2ZW50cyB0aGF0IHJlcXVpcmUgaXQuXG4gICAgaWYgKEVEREFURC5wcm9jZXNzSW1wb3J0U2V0dGluZ3NUaW1lcklEKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChFRERBVEQucHJvY2Vzc0ltcG9ydFNldHRpbmdzVGltZXJJRCk7XG4gICAgfVxuICAgIEVEREFURC5wcm9jZXNzSW1wb3J0U2V0dGluZ3NUaW1lcklEID0gc2V0VGltZW91dChFRERBVEQucHJvY2Vzc0ltcG9ydFNldHRpbmdzLmJpbmQoRUREQVREKSwgNSk7XG59LFxuXG5cbnByb2Nlc3NJbXBvcnRTZXR0aW5nczogKCk6dm9pZCA9PiB7XG4gICAgdmFyIHN0ZExheW91dDpKUXVlcnksIHRyTGF5b3V0OkpRdWVyeSwgcHJMYXlvdXQ6SlF1ZXJ5LCBtZHZMYXlvdXQ6SlF1ZXJ5LCBpZ25vcmVHYXBzOkpRdWVyeSxcbiAgICAgICAgdHJhbnNwb3NlOkpRdWVyeSwgZ3JhcGg6SlF1ZXJ5LCByYXdGb3JtYXQ6SlF1ZXJ5O1xuICAgIHN0ZExheW91dCA9ICQoJyNzdGRsYXlvdXQnKTtcbiAgICB0ckxheW91dCA9ICQoJyN0cmxheW91dCcpO1xuICAgIHByTGF5b3V0ID0gJCgnI3BybGF5b3V0Jyk7XG4gICAgbWR2TGF5b3V0ID0gJCgnI21kdmxheW91dCcpO1xuICAgIGlnbm9yZUdhcHMgPSAkKCcjaWdub3JlR2FwcycpO1xuICAgIHRyYW5zcG9zZSA9ICQoJyN0cmFuc3Bvc2UnKTtcbiAgICBncmFwaCA9ICQoJyNncmFwaERpdicpO1xuICAgIHJhd0Zvcm1hdCA9ICQoJyNyYXdkYXRhZm9ybWF0cCcpO1xuICAgIC8vIGFsbCBuZWVkIHRvIGV4aXN0LCBvciBwYWdlIGlzIGJyb2tlblxuICAgIGlmICghWyBzdGRMYXlvdXQsIHRyTGF5b3V0LCBwckxheW91dCwgbWR2TGF5b3V0LCBpZ25vcmVHYXBzLCB0cmFuc3Bvc2UsIGdyYXBoLCByYXdGb3JtYXRcbiAgICAgICAgICAgIF0uZXZlcnkoKGl0ZW0pOmJvb2xlYW4gPT4gaXRlbS5sZW5ndGggIT09IDApKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc3RkTGF5b3V0LnByb3AoJ2NoZWNrZWQnKSkgeyAvLyAgU3RhbmRhcmQgaW50ZXJwcmV0YXRpb24gbW9kZVxuICAgICAgICBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID0gJ3N0ZCc7XG4gICAgICAgIGdyYXBoLnJlbW92ZUNsYXNzKCdvZmYnKTsgIC8vIEJ5IGRlZmF1bHQgd2Ugd2lsbCBhdHRlbXB0IHRvIHNob3cgYSBncmFwaFxuICAgICAgICBFRERBVEQuZ3JhcGhFbmFibGVkID0gMTtcbiAgICB9IGVsc2UgaWYgKHRyTGF5b3V0LnByb3AoJ2NoZWNrZWQnKSkgeyAgIC8vICBUcmFuc2NyaXB0b21pY3MgbW9kZVxuICAgICAgICBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID0gJ3RyJztcbiAgICAgICAgZ3JhcGguYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICBFRERBVEQuZ3JhcGhFbmFibGVkID0gMDtcbiAgICB9IGVsc2UgaWYgKHByTGF5b3V0LnByb3AoJ2NoZWNrZWQnKSkgeyAgIC8vICBQcm90ZW9taWNzIG1vZGVcbiAgICAgICAgRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9ICdwcic7XG4gICAgICAgIGdyYXBoLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgRUREQVRELmdyYXBoRW5hYmxlZCA9IDA7XG4gICAgfSBlbHNlIGlmIChtZHZMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7ICAvLyBKQkVJIE1hc3MgRGlzdHJpYnV0aW9uIFZlY3RvciBmb3JtYXRcbiAgICAgICAgRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9ICdtZHYnO1xuICAgICAgICBncmFwaC5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIEVEREFURC5ncmFwaEVuYWJsZWQgPSAwO1xuICAgICAgICAvLyBXZSBuZWl0aGVyIGlnbm9yZSBnYXBzLCBub3IgdHJhbnNwb3NlLCBmb3IgTURWIGRvY3VtZW50c1xuICAgICAgICBpZ25vcmVHYXBzLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgIHRyYW5zcG9zZS5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICAvLyBKQkVJIE1EViBmb3JtYXQgZG9jdW1lbnRzIGFyZSBhbHdheXMgcGFzdGVkIGluIGZyb20gRXhjZWwsIHNvIHRoZXkncmUgYWx3YXlzIHRhYi1zZXBhcmF0ZWRcbiAgICAgICAgcmF3Rm9ybWF0LnZhbCgndGFiJyk7XG4gICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzID0gWzEsIDVdOyAvLyBBIGRlZmF1bHQgc2V0IG9mIHB1bGxkb3duIHNldHRpbmdzIGZvciB0aGlzIG1vZGVcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJZiBub25lIG9mIHRoZW0gYXJlIGNoZWNrZWQgLSBXVEY/ICBEb24ndCBwYXJzZSBvciBjaGFuZ2UgYW55dGhpbmcuXG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgRUREQVRELkdyaWQuaWdub3JlRGF0YUdhcHMgPSBpZ25vcmVHYXBzLnByb3AoJ2NoZWNrZWQnKTtcbiAgICBFRERBVEQuR3JpZC50cmFuc3Bvc2UgPSB0cmFuc3Bvc2UucHJvcCgnY2hlY2tlZCcpO1xuICAgIEVEREFURC5wYXJzZUFuZERpc3BsYXlUZXh0KCk7XG59LFxuXG5cbi8vIFRoaXMgZ2V0cyBjYWxsZWQgd2hlbiB0aGVyZSBpcyBhIHBhc3RlIGV2ZW50LlxucGFzdGVkUmF3RGF0YTogKCk6dm9pZCA9PiB7XG4gICAgLy8gV2UgZG8gdGhpcyB1c2luZyBhIHRpbWVvdXQgc28gdGhlIHJlc3Qgb2YgdGhlIHBhc3RlIGV2ZW50cyBmaXJlLCBhbmQgZ2V0IHRoZSBwYXN0ZWQgcmVzdWx0LlxuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpOnZvaWQgPT4ge1xuICAgICAgICBpZiAoRUREQVRELmludGVycHJldGF0aW9uTW9kZSAhPT0gXCJtZHZcIikge1xuICAgICAgICAgICAgdmFyIHRleHQ6c3RyaW5nID0gJCgnI3RleHREYXRhJykudmFsKCkgfHwgJycsIHRlc3Q6Ym9vbGVhbjtcbiAgICAgICAgICAgIHRlc3QgPSB0ZXh0LnNwbGl0KCdcXHQnKS5sZW5ndGggPj0gdGV4dC5zcGxpdCgnLCcpLmxlbmd0aDtcbiAgICAgICAgICAgICQoJyNyYXdkYXRhZm9ybWF0cCcpLnZhbCh0ZXN0ID8gJ3RhYicgOiAnY3N2Jyk7XG4gICAgICAgIH1cbiAgICB9LCAxKTtcbn0sXG5cblxucGFyc2VSYXdJbnB1dDogKGRlbGltaXRlcjogc3RyaW5nLCBtb2RlOiBzdHJpbmcpOlJhd0lucHV0U3RhdCA9PiB7XG4gICAgdmFyIHJhd1RleHQ6c3RyaW5nLCBsb25nZXN0Um93Om51bWJlciwgcm93czpSYXdJbnB1dCwgbXVsdGlDb2x1bW46Ym9vbGVhbjtcbiAgICByYXdUZXh0ID0gJCgnI3RleHREYXRhJykudmFsKCk7XG4gICAgcm93cyA9IFtdO1xuICAgIC8vIGZpbmQgdGhlIGhpZ2hlc3QgbnVtYmVyIG9mIGNvbHVtbnMgaW4gYSByb3dcbiAgICBsb25nZXN0Um93ID0gcmF3VGV4dC5zcGxpdCgvWyBcXHJdKlxcbi8pLnJlZHVjZSgocHJldjpudW1iZXIsIHJhd1Jvdzogc3RyaW5nKTpudW1iZXIgPT4ge1xuICAgICAgICB2YXIgcm93OnN0cmluZ1tdO1xuICAgICAgICBpZiAocmF3Um93ICE9PSAnJykge1xuICAgICAgICAgICAgcm93ID0gcmF3Um93LnNwbGl0KGRlbGltaXRlcik7XG4gICAgICAgICAgICByb3dzLnB1c2gocm93KTtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCByb3cubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcHJldjtcbiAgICB9LCAwKTtcbiAgICAvLyBwYWQgb3V0IHJvd3Mgc28gaXQgaXMgcmVjdGFuZ3VsYXJcbiAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInKSB7XG4gICAgICAgIHJvd3MuZm9yRWFjaCgocm93OnN0cmluZ1tdKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHdoaWxlIChyb3cubGVuZ3RoIDwgbG9uZ2VzdFJvdykge1xuICAgICAgICAgICAgICAgIHJvdy5wdXNoKCcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgICdpbnB1dCc6IHJvd3MsXG4gICAgICAgICdjb2x1bW5zJzogbG9uZ2VzdFJvd1xuICAgIH07XG59LFxuXG5cbmluZmVyVHJhbnNwb3NlU2V0dGluZzogKHJvd3M6IFJhd0lucHV0KTogdm9pZCA9PiB7XG4gICAgLy8gVGhlIG1vc3Qgc3RyYWlnaHRmb3J3YXJkIG1ldGhvZCBpcyB0byB0YWtlIHRoZSB0b3Agcm93LCBhbmQgdGhlIGZpcnN0IGNvbHVtbixcbiAgICAvLyBhbmQgYW5hbHl6ZSBib3RoIHRvIHNlZSB3aGljaCBvbmUgbW9zdCBsaWtlbHkgY29udGFpbnMgYSBydW4gb2YgdGltZXN0YW1wcy5cbiAgICAvLyBXZSdsbCBhbHNvIGRvIHRoZSBzYW1lIGZvciB0aGUgc2Vjb25kIHJvdyBhbmQgdGhlIHNlY29uZCBjb2x1bW4sIGluIGNhc2UgdGhlXG4gICAgLy8gdGltZXN0YW1wcyBhcmUgdW5kZXJuZWF0aCBzb21lIG90aGVyIGhlYWRlci5cbiAgICB2YXIgYXJyYXlzVG9BbmFseXplOiBzdHJpbmdbXVtdLCBhcnJheXNTY29yZXM6IG51bWJlcltdLCBzZXRUcmFuc3Bvc2U6IGJvb2xlYW47XG4gICAgXG4gICAgLy8gTm90ZSB0aGF0IHdpdGggZW1wdHkgb3IgdG9vLXNtYWxsIHNvdXJjZSBkYXRhLCB0aGVzZSBhcnJheXMgd2lsbCBlaXRoZXIgcmVtYWluXG4gICAgLy8gZW1wdHksIG9yIGJlY29tZSAnbnVsbCdcbiAgICBhcnJheXNUb0FuYWx5emUgPSBbXG4gICAgICAgIHJvd3NbMF0gfHwgW10sICAgLy8gRmlyc3Qgcm93XG4gICAgICAgIHJvd3NbMV0gfHwgW10sICAgLy8gU2Vjb25kIHJvd1xuICAgICAgICAocm93cyB8fCBbXSkubWFwKChyb3c6IHN0cmluZ1tdKTogc3RyaW5nID0+IHJvd1swXSksICAgLy8gRmlyc3QgY29sdW1uXG4gICAgICAgIChyb3dzIHx8IFtdKS5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmcgPT4gcm93WzFdKSAgICAvLyBTZWNvbmQgY29sdW1uXG4gICAgXTtcbiAgICBhcnJheXNTY29yZXMgPSBhcnJheXNUb0FuYWx5emUubWFwKChyb3c6IHN0cmluZ1tdLCBpOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgICAgICB2YXIgc2NvcmUgPSAwLCBwcmV2OiBudW1iZXIsIG5uUHJldjogbnVtYmVyO1xuICAgICAgICBpZiAoIXJvdyB8fCByb3cubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICBwcmV2ID0gbm5QcmV2ID0gdW5kZWZpbmVkO1xuICAgICAgICByb3cuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgajogbnVtYmVyLCByOiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHQ6IG51bWJlcjtcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHQgPSBwYXJzZUZsb2F0KHZhbHVlLnJlcGxhY2UoLywvZywgJycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghaXNOYU4odCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKHByZXYpICYmIHQgPiBwcmV2KSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICghaXNOYU4obm5QcmV2KSAmJiB0ID4gbm5QcmV2KSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG5uUHJldiA9IHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcmV2ID0gdDtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzY29yZSAvIHJvdy5sZW5ndGg7XG4gICAgfSk7XG4gICAgLy8gSWYgdGhlIGZpcnN0IHJvdyBhbmQgY29sdW1uIHNjb3JlZCBkaWZmZXJlbnRseSwganVkZ2UgYmFzZWQgb24gdGhlbS5cbiAgICAvLyBPbmx5IGlmIHRoZXkgc2NvcmVkIHRoZSBzYW1lIGRvIHdlIGp1ZGdlIGJhc2VkIG9uIHRoZSBzZWNvbmQgcm93IGFuZCBzZWNvbmQgY29sdW1uLlxuICAgIGlmIChhcnJheXNTY29yZXNbMF0gIT09IGFycmF5c1Njb3Jlc1syXSkge1xuICAgICAgICBzZXRUcmFuc3Bvc2UgPSBhcnJheXNTY29yZXNbMF0gPiBhcnJheXNTY29yZXNbMl07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VHJhbnNwb3NlID0gYXJyYXlzU2NvcmVzWzFdID4gYXJyYXlzU2NvcmVzWzNdO1xuICAgIH1cbiAgICAkKCcjdHJhbnNwb3NlJykucHJvcCgnY2hlY2tlZCcsIHNldFRyYW5zcG9zZSk7XG4gICAgRUREQVRELkdyaWQudHJhbnNwb3NlID0gc2V0VHJhbnNwb3NlO1xufSxcblxuXG5pbmZlckdhcHNTZXR0aW5nOiAoKTogdm9pZCA9PiB7XG4gICAgLy8gQ291bnQgdGhlIG51bWJlciBvZiBibGFuayB2YWx1ZXMgYXQgdGhlIGVuZCBvZiBlYWNoIGNvbHVtblxuICAgIC8vIENvdW50IHRoZSBudW1iZXIgb2YgYmxhbmsgdmFsdWVzIGluIGJldHdlZW4gbm9uLWJsYW5rIGRhdGFcbiAgICAvLyBJZiBtb3JlIHRoYW4gdGhyZWUgdGltZXMgYXMgbWFueSBhcyBhdCB0aGUgZW5kLCBkZWZhdWx0IHRvIGlnbm9yZSBnYXBzXG4gICAgdmFyIGludHJhOiBudW1iZXIgPSAwLCBleHRyYTogbnVtYmVyID0gMDtcbiAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHJvdzogc3RyaW5nW10pOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIG5vdE51bGw6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgLy8gY29weSBhbmQgcmV2ZXJzZSB0byBsb29wIGZyb20gdGhlIGVuZFxuICAgICAgICByb3cuc2xpY2UoMCkucmV2ZXJzZSgpLmZvckVhY2goKHZhbHVlOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICBub3ROdWxsID8gKytleHRyYSA6ICsraW50cmE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5vdE51bGwgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBFRERBVEQuR3JpZC5pZ25vcmVEYXRhR2FwcyA9IGV4dHJhID4gKGludHJhICogMyk7XG4gICAgJCgnI2lnbm9yZUdhcHMnKS5wcm9wKCdjaGVja2VkJywgRUREQVRELkdyaWQuaWdub3JlRGF0YUdhcHMpO1xufSxcblxuXG5pbmZlckFjdGl2ZUZsYWdzOiAoKTogdm9pZCA9PiB7XG4gICAgLy8gQW4gaW1wb3J0YW50IHRoaW5nIHRvIG5vdGUgaGVyZSBpcyB0aGF0IHRoaXMgZGF0YSBpcyBpbiBbeV1beF0gZm9ybWF0IC1cbiAgICAvLyB0aGF0IGlzLCBpdCBnb2VzIGJ5IHJvdywgdGhlbiBieSBjb2x1bW4sIHdoZW4gcmVmZXJlbmNpbmcuXG4gICAgLy8gVGhpcyBtYXRjaGVzIEdyaWQuZGF0YSBhbmQgVGFibGUuZGF0YUNlbGxzLlxuICAgIHZhciB4OiBudW1iZXIsIHk6IG51bWJlcjtcbiAgICAoRUREQVRELkdyaWQuZGF0YVswXSB8fCBbXSkuZm9yRWFjaCgoXywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIGlmIChFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbeF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW3hdID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgeTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIGlmIChFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbeV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ldID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV0gPSBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV0gfHwgW107XG4gICAgICAgIHJvdy5mb3JFYWNoKChfLCB4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufSxcblxuXG5wcm9jZXNzTWR2OiAoaW5wdXQ6IFJhd0lucHV0KTogdm9pZCA9PiB7XG4gICAgdmFyIHJvd3M6IFJhd0lucHV0LCBjb2xMYWJlbHM6IHN0cmluZ1tdLCBjb21wb3VuZHM6IGFueSwgb3JkZXJlZENvbXA6IHN0cmluZ1tdO1xuICAgIHJvd3MgPSBpbnB1dC5zbGljZSgwKTsgLy8gY29weVxuICAgIC8vIElmIHRoaXMgd29yZCBmcmFnbWVudCBpcyBpbiB0aGUgZmlyc3Qgcm93LCBkcm9wIHRoZSB3aG9sZSByb3cuXG4gICAgLy8gKElnbm9yaW5nIGEgUSBvZiB1bmtub3duIGNhcGl0YWxpemF0aW9uKVxuICAgIGlmIChyb3dzWzBdLmpvaW4oJycpLm1hdGNoKC91YW50aXRhdGlvbi9nKSkge1xuICAgICAgICByb3dzLnNoaWZ0KCk7XG4gICAgfVxuICAgIGNvbXBvdW5kcyA9IHt9O1xuICAgIG9yZGVyZWRDb21wID0gW107XG4gICAgcm93cy5mb3JFYWNoKChyb3c6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBmaXJzdDogc3RyaW5nLCBtYXJrZWQ6IHN0cmluZ1tdLCBuYW1lOiBzdHJpbmcsIGluZGV4OiBudW1iZXI7XG4gICAgICAgIGZpcnN0ID0gcm93LnNoaWZ0KCk7XG4gICAgICAgIC8vIElmIHdlIGhhcHBlbiB0byBlbmNvdW50ZXIgYW4gb2NjdXJyZW5jZSBvZiBhIHJvdyB3aXRoICdDb21wb3VuZCcgaW5cbiAgICAgICAgLy8gdGhlIGZpcnN0IGNvbHVtbiwgd2UgdHJlYXQgaXQgYXMgYSByb3cgb2YgY29sdW1uIGlkZW50aWZpZXJzLlxuICAgICAgICBpZiAoZmlyc3QgPT09ICdDb21wb3VuZCcpIHtcbiAgICAgICAgICAgIGNvbExhYmVscyA9IHJvdztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBtYXJrZWQgPSBmaXJzdC5zcGxpdCgnIE0gPSAnKTtcbiAgICAgICAgaWYgKG1hcmtlZC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIG5hbWUgPSBtYXJrZWRbMF07XG4gICAgICAgICAgICBpbmRleCA9IHBhcnNlSW50KG1hcmtlZFsxXSwgMTApO1xuICAgICAgICAgICAgaWYgKCFjb21wb3VuZHNbbmFtZV0pIHtcbiAgICAgICAgICAgICAgICBjb21wb3VuZHNbbmFtZV0gPSB7ICdvcmlnaW5hbFJvd3MnOiB7fSwgJ3Byb2Nlc3NlZEFzc2F5Q29scyc6IHt9IH1cbiAgICAgICAgICAgICAgICBvcmRlcmVkQ29tcC5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29tcG91bmRzW25hbWVdLm9yaWdpbmFsUm93c1tpbmRleF0gPSByb3cuc2xpY2UoMCk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICAkLmVhY2goY29tcG91bmRzLCAobmFtZTogc3RyaW5nLCB2YWx1ZTogYW55KTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBpbmRpY2VzOiBudW1iZXJbXTtcbiAgICAgICAgLy8gRmlyc3QgZ2F0aGVyIHVwIGFsbCB0aGUgbWFya2VyIGluZGV4ZXMgZ2l2ZW4gZm9yIHRoaXMgY29tcG91bmRcbiAgICAgICAgaW5kaWNlcyA9ICQubWFwKHZhbHVlLm9yaWdpbmFsUm93cywgKF8sIGluZGV4OiBzdHJpbmcpOiBudW1iZXIgPT4gcGFyc2VJbnQoaW5kZXgsIDEwKSk7XG4gICAgICAgIGluZGljZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpOyAvLyBzb3J0IGFzY2VuZGluZ1xuICAgICAgICAvLyBSdW4gdGhyb3VnaCB0aGUgc2V0IG9mIGNvbHVtbkxhYmVscyBhYm92ZSwgYXNzZW1ibGluZyBhIG1hcmtpbmcgbnVtYmVyIGZvciBlYWNoLFxuICAgICAgICAvLyBieSBkcmF3aW5nIC0gaW4gb3JkZXIgLSBmcm9tIHRoaXMgY29sbGVjdGVkIHJvdyBkYXRhLlxuICAgICAgICBjb2xMYWJlbHMuZm9yRWFjaCgobGFiZWw6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHBhcnRzOiBzdHJpbmdbXSwgYW55RmxvYXQ6IGJvb2xlYW47XG4gICAgICAgICAgICBwYXJ0cyA9IFtdO1xuICAgICAgICAgICAgYW55RmxvYXQgPSBmYWxzZTtcbiAgICAgICAgICAgIGluZGljZXMuZm9yRWFjaCgocmk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBvcmlnaW5hbDogc3RyaW5nW10sIGNlbGw6IHN0cmluZztcbiAgICAgICAgICAgICAgICBvcmlnaW5hbCA9IHZhbHVlLm9yaWdpbmFsUm93c1tyaV07XG4gICAgICAgICAgICAgICAgY2VsbCA9IG9yaWdpbmFsW2luZGV4XTtcbiAgICAgICAgICAgICAgICBpZiAoY2VsbCkge1xuICAgICAgICAgICAgICAgICAgICBjZWxsID0gY2VsbC5yZXBsYWNlKC8sL2csICcnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzTmFOKHBhcnNlRmxvYXQoY2VsbCkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYW55RmxvYXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goY2VsbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIEFzc2VtYmxlZCBhIGZ1bGwgY2FyYm9uIG1hcmtlciBudW1iZXIsIGdyYWIgdGhlIGNvbHVtbiBsYWJlbCwgYW5kIHBsYWNlXG4gICAgICAgICAgICAvLyB0aGUgbWFya2VyIGluIHRoZSBhcHByb3ByaWF0ZSBzZWN0aW9uLlxuICAgICAgICAgICAgdmFsdWUucHJvY2Vzc2VkQXNzYXlDb2xzW2luZGV4XSA9IHBhcnRzLmpvaW4oJy8nKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgLy8gU3RhcnQgdGhlIHNldCBvZiByb3cgbWFya2VycyB3aXRoIGEgZ2VuZXJpYyBsYWJlbFxuICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMgPSBbJ0Fzc2F5J107XG4gICAgLy8gVGhlIGZpcnN0IHJvdyBpcyBvdXIgbGFiZWwgY29sbGVjdGlvblxuICAgIEVEREFURC5HcmlkLmRhdGFbMF0gPSBjb2xMYWJlbHMuc2xpY2UoMCk7XG4gICAgLy8gcHVzaCB0aGUgcmVzdCBvZiB0aGUgcm93cyBnZW5lcmF0ZWQgZnJvbSBvcmRlcmVkIGxpc3Qgb2YgY29tcG91bmRzXG4gICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoXG4gICAgICAgIEVEREFURC5HcmlkLmRhdGEsXG4gICAgICAgIG9yZGVyZWRDb21wLm1hcCgobmFtZTogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbXBvdW5kOiBhbnksIHJvdzogc3RyaW5nW10sIGNvbExvb2t1cDogYW55O1xuICAgICAgICAgICAgRUREQVRELkdyaWQucm93TWFya2Vycy5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgY29tcG91bmQgPSBjb21wb3VuZHNbbmFtZV07XG4gICAgICAgICAgICByb3cgPSBbXTtcbiAgICAgICAgICAgIGNvbExvb2t1cCA9IGNvbXBvdW5kLnByb2Nlc3NlZEFzc2F5Q29scztcbiAgICAgICAgICAgIC8vIGdlbmVyYXRlIHJvdyBjZWxscyBieSBtYXBwaW5nIGNvbHVtbiBsYWJlbHMgdG8gcHJvY2Vzc2VkIGNvbHVtbnNcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KHJvdyxcbiAgICAgICAgICAgICAgICBjb2xMYWJlbHMubWFwKChfLCBpbmRleDogbnVtYmVyKTogc3RyaW5nID0+IGNvbExvb2t1cFtpbmRleF0gfHwgJycpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiByb3c7XG4gICAgICAgIH0pXG4gICAgKTtcbn0sXG5cblxuLy8gQSByZWN1cnNpdmUgZnVuY3Rpb24gdG8gcG9wdWxhdGUgYSBwdWxsZG93biB3aXRoIG9wdGlvbmFsIG9wdGlvbmdyb3Vwcyxcbi8vIGFuZCBhIGRlZmF1bHQgc2VsZWN0aW9uXG5wb3B1bGF0ZVB1bGxkb3duOiAoc2VsZWN0OiBKUXVlcnksIG9wdGlvbnM6IFJvd1B1bGxkb3duT3B0aW9uW10sIHZhbHVlOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICBvcHRpb25zLmZvckVhY2goKG9wdGlvbjogUm93UHVsbGRvd25PcHRpb24pOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25bMV0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQob3B0aW9uWzBdKS52YWwob3B0aW9uWzFdKVxuICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsIG9wdGlvblsxXSA9PT0gdmFsdWUpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKHNlbGVjdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBFRERBVEQucG9wdWxhdGVQdWxsZG93bihcbiAgICAgICAgICAgICAgICAkKCc8b3B0Z3JvdXA+JykuYXR0cignbGFiZWwnLCBvcHRpb25bMF0pLmFwcGVuZFRvKHNlbGVjdCksXG4gICAgICAgICAgICAgICAgb3B0aW9uWzFdLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn0sXG5cblxuY29uc3RydWN0RGF0YVRhYmxlOiAobW9kZTpzdHJpbmcpOnZvaWQgPT4ge1xuICAgIHZhciBjb250cm9sQ29sczogc3RyaW5nW10sIHB1bGxkb3duT3B0aW9uczogYW55W10sXG4gICAgICAgIHRhYmxlOiBIVE1MVGFibGVFbGVtZW50LCBjb2xncm91cDpKUXVlcnksIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsXG4gICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudDtcblxuICAgIEVEREFURC5UYWJsZS5kYXRhQ2VsbHMgPSBbXTtcbiAgICBFRERBVEQuVGFibGUuY29sQ2hlY2tib3hDZWxscyA9IFtdO1xuICAgIEVEREFURC5UYWJsZS5jb2xPYmplY3RzID0gW107XG4gICAgRUREQVRELlRhYmxlLnJvd0xhYmVsQ2VsbHMgPSBbXTtcbiAgICBFRERBVEQuVGFibGUucm93Q2hlY2tib3hDZWxscyA9IFtdO1xuICAgIGNvbnRyb2xDb2xzID0gWydjaGVja2JveCcsICdwdWxsZG93bicsICdsYWJlbCddO1xuICAgIGlmIChtb2RlID09PSAndHInKSB7XG4gICAgICAgIHB1bGxkb3duT3B0aW9ucyA9IFtcbiAgICAgICAgICAgIFsnLS0nLCAwXSxcbiAgICAgICAgICAgIFsnRW50aXJlIFJvdyBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICBbJ0dlbmUgTmFtZXMnLCAxMF0sXG4gICAgICAgICAgICAgICAgWydSUEtNIFZhbHVlcycsIDExXVxuICAgICAgICAgICAgXVxuICAgICAgICAgICAgXVxuICAgICAgICBdO1xuICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ3ByJykge1xuICAgICAgICBwdWxsZG93bk9wdGlvbnMgPSBbXG4gICAgICAgICAgICBbJy0tJywgMF0sXG4gICAgICAgICAgICBbJ0VudGlyZSBSb3cgSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgWydBc3NheS9MaW5lIE5hbWVzJywgMV0sXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgWydGaXJzdCBDb2x1bW4gSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgWydQcm90ZWluIE5hbWUnLCAxMl1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF1cbiAgICAgICAgXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBwdWxsZG93bk9wdGlvbnMgPSBbXG4gICAgICAgICAgICBbJy0tJywgMF0sXG4gICAgICAgICAgICBbJ0VudGlyZSBSb3cgSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgWydBc3NheS9MaW5lIE5hbWVzJywgMV0sXG4gICAgICAgICAgICAgICAgWydNZXRhYm9saXRlIE5hbWVzJywgMl1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBbJ0ZpcnN0IENvbHVtbiBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICBbJ1RpbWVzdGFtcCcsIDNdLFxuICAgICAgICAgICAgICAgIFsnTWV0YWRhdGEgTmFtZScsIDRdLFxuICAgICAgICAgICAgICAgIFsnTWV0YWJvbGl0ZSBOYW1lJywgNV1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF1cbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgYW5kIHJlcGxhY2UgdGhlIHRhYmxlIGluIHRoZSBkb2N1bWVudFxuICAgIC8vIGF0dGFjaCBhbGwgZXZlbnQgaGFuZGxlcnMgdG8gdGhlIHRhYmxlIGl0c2VsZlxuICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0YWJsZT4nKS5hdHRyKCdjZWxsc3BhY2luZycsICcwJylcbiAgICAgICAgLmFwcGVuZFRvKCQoJyNkYXRhVGFibGVEaXYnKS5lbXB0eSgpKVxuICAgICAgICAub24oJ2NsaWNrJywgJ1tuYW1lPWVuYWJsZUNvbHVtbl0nLCAoZXY6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIEVEREFURC50b2dnbGVUYWJsZUNvbHVtbihldi50YXJnZXQpO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnW25hbWU9ZW5hYmxlUm93XScsIChldjogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgRUREQVRELnRvZ2dsZVRhYmxlUm93KGV2LnRhcmdldCk7XG4gICAgICAgIH0pLm9uKCdjaGFuZ2UnLCAnLnB1bGxkb3duQ2VsbCA+IHNlbGVjdCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgdmFyIHRhcmc6IEpRdWVyeSA9ICQoZXYudGFyZ2V0KTtcbiAgICAgICAgICAgIEVEREFURC5jaGFuZ2VkUm93RGF0YVR5cGVQdWxsZG93bihcbiAgICAgICAgICAgICAgICBwYXJzZUludCh0YXJnLmF0dHIoJ2knKSwgMTApLCBwYXJzZUludCh0YXJnLnZhbCgpLCAxMCkpO1xuICAgICAgICB9KVswXTtcbiAgICAvLyBPbmUgb2YgdGhlIG9iamVjdHMgaGVyZSB3aWxsIGJlIGEgY29sdW1uIGdyb3VwLCB3aXRoIGNvbCBvYmplY3RzIGluIGl0LlxuICAgIC8vIFRoaXMgaXMgYW4gaW50ZXJlc3RpbmcgdHdpc3Qgb24gRE9NIGJlaGF2aW9yIHRoYXQgeW91IHNob3VsZCBwcm9iYWJseSBnb29nbGUuXG4gICAgY29sZ3JvdXAgPSAkKCc8Y29sZ3JvdXA+JykuYXBwZW5kVG8odGFibGUpO1xuICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAvLyBTdGFydCB3aXRoIHRocmVlIGNvbHVtbnMsIGZvciB0aGUgY2hlY2tib3hlcywgcHVsbGRvd25zLCBhbmQgbGFiZWxzLlxuICAgIC8vIChUaGVzZSB3aWxsIG5vdCBiZSB0cmFja2VkIGluIFRhYmxlLmNvbE9iamVjdHMuKVxuICAgIGNvbnRyb2xDb2xzLmZvckVhY2goKCk6dm9pZCA9PiB7XG4gICAgICAgICQoJzxjb2w+JykuYXBwZW5kVG8oY29sZ3JvdXApO1xuICAgIH0pO1xuICAgIC8vIGFkZCBjb2wgZWxlbWVudHMgZm9yIGVhY2ggZGF0YSBjb2x1bW5cbiAgICAoRUREQVRELkdyaWQuZGF0YVswXSB8fCBbXSkuZm9yRWFjaCgoKTogdm9pZCA9PiB7XG4gICAgICAgIEVEREFURC5UYWJsZS5jb2xPYmplY3RzLnB1c2goJCgnPGNvbD4nKS5hcHBlbmRUbyhjb2xncm91cClbMF0pO1xuICAgIH0pO1xuICAgIC8vIEZpcnN0IHJvdzogc3BhY2VyIGNlbGxzLCBmb2xsb3dlZCBieSBjaGVja2JveCBjZWxscyBmb3IgZWFjaCBkYXRhIGNvbHVtblxuICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PiBib2R5Lmluc2VydFJvdygpO1xuICAgIC8vIHNwYWNlciBjZWxscyBoYXZlIHggYW5kIHkgc2V0IHRvIDAgdG8gcmVtb3ZlIGZyb20gaGlnaGxpZ2h0IGdyaWRcbiAgICBjb250cm9sQ29scy5mb3JFYWNoKCgpOiB2b2lkID0+IHtcbiAgICAgICAgJChyb3cuaW5zZXJ0Q2VsbCgpKS5hdHRyKHsgJ3gnOiAnMCcsICd5JzogMCB9KTtcbiAgICB9KTtcbiAgICAoRUREQVRELkdyaWQuZGF0YVswXSB8fCBbXSkuZm9yRWFjaCgoXywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBjZWxsOiBKUXVlcnksIGJveDogSlF1ZXJ5O1xuICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hdHRyKHsgJ2lkJzogJ2NvbENCQ2VsbCcgKyBpLCAneCc6IDEgKyBpLCAneSc6IDAgfSlcbiAgICAgICAgICAgIC5hZGRDbGFzcygnY2hlY2tCb3hDZWxsJyk7XG4gICAgICAgIGJveCA9ICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIi8+JykuYXBwZW5kVG8oY2VsbClcbiAgICAgICAgICAgIC52YWwoaS50b1N0cmluZygpKVxuICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZW5hYmxlQ29sdW1uJyArIGksICduYW1lJzogJ2VuYWJsZUNvbHVtbicgfSlcbiAgICAgICAgICAgIC5wcm9wKCdjaGVja2VkJywgRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW2ldKTtcbiAgICAgICAgRUREQVRELlRhYmxlLmNvbENoZWNrYm94Q2VsbHMucHVzaChjZWxsWzBdKTtcbiAgICB9KTtcbiAgICBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzID0gW107ICAvLyBXZSBkb24ndCB3YW50IGFueSBsaW5nZXJpbmcgb2xkIG9iamVjdHMgaW4gdGhpc1xuICAgIC8vIFRoZSByZXN0IG9mIHRoZSByb3dzOiBBIHB1bGxkb3duLCBhIGNoZWNrYm94LCBhIHJvdyBsYWJlbCwgYW5kIGEgcm93IG9mIGRhdGEuXG4gICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKCh2YWx1ZXM6IHN0cmluZ1tdLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIGNlbGw6IEpRdWVyeTtcbiAgICAgICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+IGJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgIC8vIGNoZWNrYm94IGNlbGxcbiAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ2NoZWNrQm94Q2VsbCcpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdyb3dDQkNlbGwnICsgaSwgJ3gnOiAwLCAneSc6IGkgKyAxIH0pO1xuICAgICAgICAkKCc8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIvPicpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdlbmFibGVSb3cnICsgaSwgJ25hbWUnOiAnZW5hYmxlUm93JywgfSlcbiAgICAgICAgICAgIC52YWwoaS50b1N0cmluZygpKVxuICAgICAgICAgICAgLnByb3AoJ2NoZWNrZWQnLCBFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbaV0pXG4gICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgIEVEREFURC5UYWJsZS5yb3dDaGVja2JveENlbGxzLnB1c2goY2VsbFswXSk7XG4gICAgICAgIC8vIHB1bGxkb3duIGNlbGxcbiAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ3B1bGxkb3duQ2VsbCcpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdyb3dQQ2VsbCcgKyBpLCAneCc6IDAsICd5JzogaSArIDEgfSk7XG4gICAgICAgIC8vIHVzZSBleGlzdGluZyBzZXR0aW5nLCBvciB1c2UgdGhlIGxhc3QgaWYgcm93cy5sZW5ndGggPiBzZXR0aW5ncy5sZW5ndGgsIG9yIGJsYW5rXG4gICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldID0gRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV1cbiAgICAgICAgICAgICAgICB8fCBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5ncy5zbGljZSgtMSlbMF0gfHwgMFxuICAgICAgICBFRERBVEQucG9wdWxhdGVQdWxsZG93bihcbiAgICAgICAgICAgIGNlbGwgPSAkKCc8c2VsZWN0PicpXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAncm93JyArIGkgKyAndHlwZScsICduYW1lJzogJ3JvdycgKyBpICsgJ3R5cGUnLCAnaSc6IGkgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCksXG4gICAgICAgICAgICBwdWxsZG93bk9wdGlvbnMsXG4gICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXVxuICAgICAgICApO1xuICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzLnB1c2goY2VsbFswXSk7XG4gICAgICAgIC8vIGxhYmVsIGNlbGxcbiAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7ICdpZCc6ICdyb3dNQ2VsbCcgKyBpLCAneCc6IDAsICd5JzogaSArIDEgfSk7XG4gICAgICAgICQoJzxkaXY+JykudGV4dChFRERBVEQuR3JpZC5yb3dNYXJrZXJzW2ldKS5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgRUREQVRELlRhYmxlLnJvd0xhYmVsQ2VsbHMucHVzaChjZWxsWzBdKTtcbiAgICAgICAgLy8gdGhlIHRhYmxlIGRhdGEgaXRzZWxmXG4gICAgICAgIEVEREFURC5UYWJsZS5kYXRhQ2VsbHNbaV0gPSBbXTtcbiAgICAgICAgdmFsdWVzLmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHNob3J0OiBzdHJpbmc7XG4gICAgICAgICAgICB2YWx1ZSA9IHNob3J0ID0gdmFsdWUgfHwgJyc7XG4gICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoID4gMzIpIHtcbiAgICAgICAgICAgICAgICBzaG9ydCA9IHZhbHVlLnN1YnN0cigwLCAzMSkgKyAn4oCmJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoe1xuICAgICAgICAgICAgICAgICdpZCc6ICd2YWxDZWxsJyArIHggKyAnLScgKyBpLFxuICAgICAgICAgICAgICAgICd4JzogeCArIDEsXG4gICAgICAgICAgICAgICAgJ3knOiBpICsgMSxcbiAgICAgICAgICAgICAgICAndGl0bGUnOiB2YWx1ZSxcbiAgICAgICAgICAgICAgICAnaXNibGFuayc6IHZhbHVlID09PSAnJyA/IDEgOiB1bmRlZmluZWRcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KHNob3J0KS5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgIEVEREFURC5UYWJsZS5kYXRhQ2VsbHNbaV0ucHVzaChjZWxsWzBdKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgRUREQVRELmFwcGx5VGFibGVEYXRhVHlwZVN0eWxpbmcoKTtcbn0sXG5cblxucGFyc2VBbmREaXNwbGF5VGV4dDogKCk6IHZvaWQgPT4ge1xuICAgIHZhciBtb2RlOnN0cmluZywgZGVsaW1pdGVyOnN0cmluZywgcmF3Rm9ybWF0OkpRdWVyeSwgaW5wdXQ6UmF3SW5wdXRTdGF0O1xuICAgIG1vZGUgPSBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlO1xuICAgIGRlbGltaXRlciA9ICdcXHQnO1xuICAgIEVEREFURC5HcmlkLmRhdGEgPSBbXTtcbiAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzID0gW107XG4gICAgcmF3Rm9ybWF0ID0gJCgnI3Jhd2RhdGFmb3JtYXRwJyk7XG4gICAgaWYgKHJhd0Zvcm1hdC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJDYW4ndCBmaW5kIGRhdGEgZm9ybWF0IHB1bGxkb3duXCIpXG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gSWYgd2UncmUgaW4gXCJtZHZcIiBtb2RlLCBsb2NrIHRoZSBkZWxpbWl0ZXIgdG8gdGFic1xuICAgIGlmIChtb2RlID09PSAnbWR2Jykge1xuICAgICAgICByYXdGb3JtYXQudmFsKCd0YWInKTtcbiAgICB9XG4gICAgaWYgKHJhd0Zvcm1hdC52YWwoKSA9PT0gJ2NzdicpIHtcbiAgICAgICAgZGVsaW1pdGVyID0gJywnO1xuICAgIH1cbiAgICBpbnB1dCA9IEVEREFURC5wYXJzZVJhd0lucHV0KGRlbGltaXRlciwgbW9kZSk7XG5cbiAgICBpZiAobW9kZSA9PT0gJ3N0ZCcgfHwgbW9kZSA9PT0gJ3RyJyB8fCBtb2RlID09PSAncHInKSB7XG4gICAgICAgIC8vIElmIHRoZSB1c2VyIGhhc24ndCBkZWxpYmVyYXRlbHkgY2hvc2VuIGEgc2V0dGluZyBmb3IgJ3RyYW5zcG9zZScsIHdlIHdpbGwgZG9cbiAgICAgICAgLy8gc29tZSBhbmFseXNpcyB0byBhdHRlbXB0IHRvIGd1ZXNzIHdoaWNoIG9yaWVudGF0aW9uIHRoZSBkYXRhIG5lZWRzIHRvIGhhdmUuXG4gICAgICAgIGlmICghRUREQVRELkdyaWQudXNlckNsaWNrZWRPblRyYW5zcG9zZSkge1xuICAgICAgICAgICAgRUREQVRELmluZmVyVHJhbnNwb3NlU2V0dGluZyhpbnB1dC5pbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm93IHRoYXQgdGhhdCdzIGRvbmUsIG1vdmUgdGhlIGRhdGEgaW50byBHcmlkLmRhdGFcbiAgICAgICAgaWYgKEVEREFURC5HcmlkLnRyYW5zcG9zZSkge1xuICAgICAgICAgICAgLy8gZmlyc3Qgcm93IGJlY29tZXMgWS1tYXJrZXJzIGFzLWlzXG4gICAgICAgICAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzID0gaW5wdXQuaW5wdXQuc2hpZnQoKSB8fCBbXTtcbiAgICAgICAgICAgIEVEREFURC5HcmlkLmRhdGEgPSAoaW5wdXQuaW5wdXRbMF0gfHwgW10pLm1hcCgoXywgaTogbnVtYmVyKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbnB1dC5pbnB1dC5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmcgPT4gcm93W2ldIHx8ICcnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgRUREQVRELkdyaWQucm93TWFya2VycyA9IFtdO1xuICAgICAgICAgICAgRUREQVRELkdyaWQuZGF0YSA9IChpbnB1dC5pbnB1dCB8fCBbXSkubWFwKChyb3c6IHN0cmluZ1tdKTogc3RyaW5nW10gPT4ge1xuICAgICAgICAgICAgICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMucHVzaChyb3cuc2hpZnQoKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZSB1c2VyIGhhc24ndCBkZWxpYmVyYXRlbHkgY2hvc2VuIHRvIGlnbm9yZSwgb3IgYWNjZXB0LCBnYXBzIGluIHRoZSBkYXRhLFxuICAgICAgICAvLyBkbyBhIGJhc2ljIGFuYWx5c2lzIHRvIGd1ZXNzIHdoaWNoIHNldHRpbmcgbWFrZXMgbW9yZSBzZW5zZS5cbiAgICAgICAgaWYgKCFFRERBVEQuR3JpZC51c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHMpIHtcbiAgICAgICAgICAgIEVEREFURC5pbmZlckdhcHNTZXR0aW5nKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gR2l2ZSBsYWJlbHMgdG8gYW55IGhlYWRlciBwb3NpdGlvbnMgdGhhdCBnb3QgJ251bGwnIGZvciBhIHZhbHVlLlxuICAgICAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzID0gRUREQVRELkdyaWQucm93TWFya2Vycy5tYXAoKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlIHx8ICc/Jyk7XG4gICAgICAgIC8vIEF0dGVtcHQgdG8gYXV0by1zZXQgYW55IHR5cGUgcHVsbGRvd25zIHRoYXQgaGF2ZW4ndCBiZWVuIGRlbGliZXJhdGVseSBzZXQgYnkgdGhlIHVzZXJcbiAgICAgICAgRUREQVRELkdyaWQucm93TWFya2Vycy5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB0eXBlOiBhbnk7XG4gICAgICAgICAgICBpZiAoIUVEREFURC5UYWJsZS5wdWxsZG93blVzZXJDaGFuZ2VkRmxhZ3NbaV0pIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gRUREQVRELmZpZ3VyZU91dFRoaXNSb3dzRGF0YVR5cGUodmFsdWUsIEVEREFURC5HcmlkLmRhdGFbaV0gfHwgW10pO1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldID0gdHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgLy8gV2UgbWVlZCBhdCBsZWFzdCAyIHJvd3MgYW5kIGNvbHVtbnMgZm9yIE1EViBmb3JtYXQgdG8gbWFrZSBhbnkgc2Vuc2VcbiAgICB9IGVsc2UgaWYgKChtb2RlID09PSBcIm1kdlwiKSAmJiAoaW5wdXQuaW5wdXQubGVuZ3RoID4gMSkgJiYgKGlucHV0LmNvbHVtbnMgPiAxKSkge1xuICAgICAgICBFRERBVEQucHJvY2Vzc01kdihpbnB1dC5pbnB1dCk7XG4gICAgfVxuICAgIC8vIENyZWF0ZSBhIG1hcCBvZiBlbmFibGVkL2Rpc2FibGVkIGZsYWdzIGZvciBvdXIgZGF0YSxcbiAgICAvLyBidXQgb25seSBmaWxsIHRoZSBhcmVhcyB0aGF0IGRvIG5vdCBhbHJlYWR5IGV4aXN0LlxuICAgIEVEREFURC5pbmZlckFjdGl2ZUZsYWdzKCk7XG4gICAgLy8gQ29uc3RydWN0IHRhYmxlIGNlbGwgb2JqZWN0cyBmb3IgdGhlIHBhZ2UsIGJhc2VkIG9uIG91ciBleHRyYWN0ZWQgZGF0YVxuICAgIEVEREFURC5jb25zdHJ1Y3REYXRhVGFibGUobW9kZSk7XG4gICAgLy8gSW50ZXJwcmV0IHRoZSBkYXRhIGluIFN0ZXAgMyxcbiAgICAvLyB3aGljaCBpbnZvbHZlcyBza2lwcGluZyBkaXNhYmxlZCByb3dzIG9yIGNvbHVtbnMsXG4gICAgLy8gb3B0aW9uYWxseSBpZ25vcmluZyBibGFuayB2YWx1ZXMsXG4gICAgLy8gYW5kIGxlYXZpbmcgb3V0IGFueSB2YWx1ZXMgdGhhdCBoYXZlIGJlZW4gaW5kaXZpZHVhbGx5IGZsYWdnZWQuXG4gICAgRUREQVRELmludGVycHJldERhdGFUYWJsZSgpO1xuICAgIC8vIFN0YXJ0IGEgZGVsYXkgdGltZXIgdGhhdCByZWRyYXdzIHRoZSBncmFwaCBmcm9tIHRoZSBpbnRlcnByZXRlZCBkYXRhLlxuICAgIC8vIFRoaXMgaXMgcmF0aGVyIHJlc291cmNlIGludGVuc2l2ZSwgc28gd2UncmUgZGVsYXlpbmcgYSBiaXQsIGFuZCByZXN0YXJ0aW5nIHRoZSBkZWxheVxuICAgIC8vIGlmIHRoZSB1c2VyIG1ha2VzIGFkZGl0aW9uYWwgZWRpdHMgdG8gdGhlIGRhdGEgd2l0aGluIHRoZSBkZWxheSBwZXJpb2QuXG4gICAgRUREQVRELnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAvLyBVcGRhdGUgdGhlIHN0eWxlcyBvZiB0aGUgbmV3IHRhYmxlIHRvIHJlZmxlY3QgdGhlXG4gICAgLy8gKHBvc3NpYmx5IHByZXZpb3VzbHkgc2V0KSBmbGFnIG1hcmtlcnMgYW5kIHRoZSBcImlnbm9yZSBnYXBzXCIgc2V0dGluZy5cbiAgICBFRERBVEQucmVkcmF3SWdub3JlZFZhbHVlTWFya2VycygpO1xuICAgIEVEREFURC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAvLyBOb3cgdGhhdCB3ZSdyZSBnb3QgdGhlIHRhYmxlIGZyb20gU3RlcCAzIGJ1aWx0LFxuICAgIC8vIHdlIHR1cm4gdG8gdGhlIHRhYmxlIGluIFN0ZXAgNDogIEEgc2V0IGZvciBlYWNoIHR5cGUgb2YgZGF0YSwgY29uaXN0aW5nIG9mIGRpc2FtYmlndWF0aW9uIHJvd3MsXG4gICAgLy8gd2hlcmUgdGhlIHVzZXIgY2FuIGxpbmsgdW5rbm93biBpdGVtcyB0byBwcmUtZXhpc3RpbmcgRUREIGRhdGEuXG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZSgpO1xufSxcblxuXG4vLyBUaGlzIHJvdXRpbmUgZG9lcyBhIGJpdCBvZiBhZGRpdGlvbmFsIHN0eWxpbmcgdG8gdGhlIFN0ZXAgMyBkYXRhIHRhYmxlLlxuLy8gSXQgcmVtb3ZlcyBhbmQgcmUtYWRkcyB0aGUgZGF0YVR5cGVDZWxsIGNzcyBjbGFzc2VzIGFjY29yZGluZyB0byB0aGUgcHVsbGRvd24gc2V0dGluZ3MgZm9yIGVhY2ggcm93LlxuYXBwbHlUYWJsZURhdGFUeXBlU3R5bGluZzogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgaW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlciwgaGxMYWJlbDogYm9vbGVhbiwgaGxSb3c6IGJvb2xlYW47XG4gICAgICAgIHB1bGxkb3duID0gRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaW5kZXhdIHx8IDA7XG4gICAgICAgIGhsTGFiZWwgPSBobFJvdyA9IGZhbHNlO1xuICAgICAgICBpZiAocHVsbGRvd24gPT09IDEgfHwgcHVsbGRvd24gPT09IDIpIHtcbiAgICAgICAgICAgIGhsUm93ID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmICgzIDw9IHB1bGxkb3duICYmIHB1bGxkb3duIDw9IDUpIHtcbiAgICAgICAgICAgIGhsTGFiZWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgICQoRUREQVRELlRhYmxlLnJvd0xhYmVsQ2VsbHNbaW5kZXhdKS50b2dnbGVDbGFzcygnZGF0YVR5cGVDZWxsJywgaGxMYWJlbCk7XG4gICAgICAgIHJvdy5mb3JFYWNoKChfLCBjb2w6IG51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAkKEVEREFURC5UYWJsZS5kYXRhQ2VsbHNbaW5kZXhdW2NvbF0pLnRvZ2dsZUNsYXNzKCdkYXRhVHlwZUNlbGwnLCBobFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufSxcblxuXG4vLyBXZSBjYWxsIHRoaXMgd2hlbiBhbnkgb2YgdGhlICdtYXN0ZXInIHB1bGxkb3ducyBhcmUgY2hhbmdlZCBpbiBTdGVwIDQuXG4vLyBTdWNoIGNoYW5nZXMgbWF5IGFmZmVjdCB0aGUgYXZhaWxhYmxlIGNvbnRlbnRzIG9mIHNvbWUgb2YgdGhlIHB1bGxkb3ducyBpbiB0aGUgc3RlcC5cbmNoYW5nZWRBTWFzdGVyUHVsbGRvd246ICgpOiB2b2lkID0+IHtcbiAgICAvLyBoaWRlIG1hc3RlciBsaW5lIGRyb3Bkb3duIGlmIG1hc3RlciBhc3NheSBkcm9wZG93biBpcyBzZXQgdG8gbmV3XG4gICAgJCgnI21hc3RlckxpbmVTcGFuJykudG9nZ2xlQ2xhc3MoJ29mZicsICQoJyNtYXN0ZXJBc3NheScpLnZhbCgpID09PSAnbmV3Jyk7XG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZSgpO1xufSxcblxuXG5jbGlja2VkT25JZ25vcmVEYXRhR2FwczogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5HcmlkLnVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2FwcyA9IHRydWU7XG4gICAgRUREQVRELnF1ZXVlUHJvY2Vzc0ltcG9ydFNldHRpbmdzKCk7ICAgIC8vIFRoaXMgd2lsbCB0YWtlIGNhcmUgb2YgcmVhZGluZyB0aGUgc3RhdHVzIG9mIHRoZSBjaGVja2JveFxufSxcblxuXG5jbGlja2VkT25UcmFuc3Bvc2U6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuR3JpZC51c2VyQ2xpY2tlZE9uVHJhbnNwb3NlID0gdHJ1ZTtcbiAgICBFRERBVEQucXVldWVQcm9jZXNzSW1wb3J0U2V0dGluZ3MoKTtcbn0sXG5cblxuY2hhbmdlZFJvd0RhdGFUeXBlUHVsbGRvd246IChpbmRleDogbnVtYmVyLCB2YWx1ZTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgdmFyIHNlbGVjdGVkOiBudW1iZXI7XG4gICAgLy8gVGhlIHZhbHVlIGRvZXMgbm90IG5lY2Vzc2FyaWx5IG1hdGNoIHRoZSBzZWxlY3RlZEluZGV4LlxuICAgIHNlbGVjdGVkID0gRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0c1tpbmRleF0uc2VsZWN0ZWRJbmRleDtcbiAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpbmRleF0gPSB2YWx1ZTtcbiAgICBFRERBVEQuVGFibGUucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzW2luZGV4XSA9IHRydWU7XG4gICAgaWYgKCh2YWx1ZSA+PSAzICYmIHZhbHVlIDw9IDUpIHx8IHZhbHVlID09PSAxMikge1xuICAgICAgICAvLyBcIlRpbWVzdGFtcFwiLCBcIk1ldGFkYXRhXCIsIG9yIG90aGVyIHNpbmdsZS10YWJsZS1jZWxsIHR5cGVzXG4gICAgICAgIC8vIFNldCBhbGwgdGhlIHJlc3Qgb2YgdGhlIHB1bGxkb3ducyB0byB0aGlzLFxuICAgICAgICAvLyBiYXNlZCBvbiB0aGUgYXNzdW1wdGlvbiB0aGF0IHRoZSBmaXJzdCBpcyBmb2xsb3dlZCBieSBtYW55IG90aGVyc1xuICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzLnNsaWNlKGluZGV4ICsgMSkuZXZlcnkoXG4gICAgICAgICAgICAocHVsbGRvd246IEhUTUxTZWxlY3RFbGVtZW50KTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHNlbGVjdDogSlF1ZXJ5LCBpOiBudW1iZXI7XG4gICAgICAgICAgICAgICAgc2VsZWN0ID0gJChwdWxsZG93bik7XG4gICAgICAgICAgICAgICAgaSA9IHBhcnNlSW50KHNlbGVjdC5hdHRyKCdpJyksIDEwKTtcbiAgICAgICAgICAgICAgICBpZiAoRUREQVRELlRhYmxlLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpXVxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBmYWxzZSBmb3IgYnJlYWtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2VsZWN0LnZhbCh2YWx1ZS50b1N0cmluZygpKTtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIC8vIEluIGFkZGl0aW9uIHRvIHRoZSBhYm92ZSBhY3Rpb24sIHdlIGFsc28gbmVlZCB0byBkbyBzb21lIGNoZWNraW5nIG9uIHRoZSBlbnRpcmUgc2V0IG9mXG4gICAgICAgIC8vIHB1bGxkb3ducywgdG8gZW5mb3JjZSBhIGRpdmlzaW9uIGJldHdlZW4gdGhlIFwiTWV0YWJvbGl0ZSBOYW1lXCIgc2luZ2xlIGRhdGEgdHlwZSBhbmQgdGhlXG4gICAgICAgIC8vIG90aGVyIHNpbmdsZSBkYXRhIHR5cGVzLiBJZiB0aGUgdXNlciB1c2VzIGV2ZW4gb25lIFwiTWV0YWJvbGl0ZSBOYW1lXCIgcHVsbGRvd24sIHdlIGNhbid0XG4gICAgICAgIC8vIGFsbG93IGFueSBvZiB0aGUgb3RoZXIgdHlwZXMsIGFuZCB2aWNlLXZlcnNhLlxuICAgICAgICAvLyAgIFdoeT8gIEJlY2F1c2UgXCJNZXRhYm9saXRlIE5hbWVcIiBpcyB1c2VkIHRvIGxhYmVsIHRoZSBzcGVjaWZpYyBjYXNlIG9mIGEgdGFibGUgdGhhdFxuICAgICAgICAvLyBkb2VzIG5vdCBjb250YWluIGEgdGltZXN0YW1wIG9uIGVpdGhlciBheGlzLiAgSW4gdGhhdCBjYXNlLCB0aGUgdGFibGUgaXMgbWVhbnQgdG9cbiAgICAgICAgLy8gcHJvdmlkZSBkYXRhIGZvciBtdWx0aXBsZSBNZWFzdXJlbWVudHMgYW5kIEFzc2F5cyBmb3IgYSBzaW5nbGUgdW5zcGVjaWZpZWQgdGltZSBwb2ludC5cbiAgICAgICAgLy8gKFRoYXQgdGltZSBwb2ludCBpcyByZXF1ZXN0ZWQgbGF0ZXIgaW4gdGhlIFVJLilcbiAgICAgICAgLy8gICBJZiB3ZSBhbGxvdyBhIHNpbmdsZSB0aW1lc3RhbXAgcm93LCB0aGF0IGNyZWF0ZXMgYW4gaW5jb25zaXN0ZW50IHRhYmxlIHRoYXQgaXNcbiAgICAgICAgLy8gaW1wb3NzaWJsZSB0byBpbnRlcnByZXQuXG4gICAgICAgIC8vICAgSWYgd2UgYWxsb3cgYSBzaW5nbGUgbWV0YWRhdGEgcm93LCB0aGF0IGxlYXZlcyB0aGUgbWV0YWRhdGEgdW5jb25uZWN0ZWQgdG8gYSBzcGVjaWZpY1xuICAgICAgICAvLyBtZWFzdXJlbWVudCwgbWVhbmluZyB0aGF0IHRoZSBvbmx5IHZhbGlkIHdheSB0byBpbnRlcnByZXQgaXQgaXMgYXMgTGluZSBtZXRhZGF0YS4gIFdlXG4gICAgICAgIC8vIGNvdWxkIHBvdGVudGlhbGx5IHN1cHBvcnQgdGhhdCwgYnV0IGl0IHdvdWxkIGJlIHRoZSBvbmx5IGNhc2Ugd2hlcmUgZGF0YSBpbXBvcnRlZCBvblxuICAgICAgICAvLyB0aGlzIHBhZ2UgZG9lcyBub3QgZW5kIHVwIGluIEFzc2F5cyAuLi4gYW5kIHRoYXQgY2FzZSBkb2Vzbid0IG1ha2UgbXVjaCBzZW5zZSBnaXZlblxuICAgICAgICAvLyB0aGF0IHRoaXMgaXMgdGhlIEFzc2F5IERhdGEgSW1wb3J0IHBhZ2UhXG4gICAgICAgIC8vICAgQW55d2F5LCBoZXJlIHdlIHJ1biB0aHJvdWdoIHRoZSBwdWxsZG93bnMsIG1ha2luZyBzdXJlIHRoYXQgaWYgdGhlIHVzZXIgc2VsZWN0ZWRcbiAgICAgICAgLy8gXCJNZXRhYm9saXRlIE5hbWVcIiwgd2UgYmxhbmsgb3V0IGFsbCByZWZlcmVuY2VzIHRvIFwiVGltZXN0YW1wXCIgYW5kIFwiTWV0YWRhdGFcIiwgYW5kXG4gICAgICAgIC8vIHZpY2UtdmVyc2EuXG4gICAgICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgoXywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgYzogbnVtYmVyID0gRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV07XG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IDUpIHtcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gMyB8fCBjID09PSA0KSB7XG4gICAgICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHNbaV0uc2VsZWN0ZWRJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldID0gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT09IDIpIHsgLy8gQ2FuJ3QgYWxsb3cgXCJNZWFzdXJlbWVudCBUeXBlc1wiIHNldHRpbmcgZWl0aGVyXG4gICAgICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHNbaV0uc2VsZWN0ZWRJbmRleCA9IDE7XG4gICAgICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldID0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCh2YWx1ZSA9PT0gMyB8fCB2YWx1ZSA9PT0gNCkgJiYgYyA9PT0gNSkge1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHNbaV0uc2VsZWN0ZWRJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gSXQgd291bGQgc2VlbSBsb2dpY2FsIHRvIHJlcXVpcmUgYSBzaW1pbGFyIGNoZWNrIGZvciBcIlByb3RlaW4gTmFtZVwiLCBJRCAxMiwgYnV0IGluIHByYWN0aWNlXG4gICAgICAgIC8vIHRoZSB1c2VyIGlzIGRpc2FsbG93ZWQgZnJvbSBzZWxlY3RpbmcgYW55IG9mIHRoZSBvdGhlciBzaW5nbGUtdGFibGUtY2VsbCB0eXBlcyB3aGVuIHRoZVxuICAgICAgICAvLyBwYWdlIGlzIGluIFByb3Rlb21pY3MgbW9kZS4gIFNvIHRoZSBjaGVjayBpcyByZWR1bmRhbnQuXG4gICAgfVxuICAgIEVEREFURC5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nKCk7XG4gICAgRUREQVRELmludGVycHJldERhdGFUYWJsZSgpO1xuICAgIEVEREFURC5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgLy8gUmVzZXR0aW5nIGEgZGlzYWJsZWQgcm93IG1heSBjaGFuZ2UgdGhlIG51bWJlciBvZiByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlKCk7XG59LFxuXG5cbmZpZ3VyZU91dFRoaXNSb3dzRGF0YVR5cGU6IChsYWJlbDogc3RyaW5nLCByb3c6IHN0cmluZ1tdKSA9PiB7XG4gICAgdmFyIGJsYW5rOiBudW1iZXIsIHN0cmluZ3M6IG51bWJlciwgY29uZGVuc2VkOiBzdHJpbmdbXTtcbiAgICBpZiAoRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PSAndHInKSB7XG4gICAgICAgIGlmIChsYWJlbC5tYXRjaCgvZ2VuZS9pKSkge1xuICAgICAgICAgICAgcmV0dXJuIDEwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsYWJlbC5tYXRjaCgvcnBrbS9pKSkge1xuICAgICAgICAgICAgcmV0dXJuIDExO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHdlIGNhbid0IG1hdGNoIHRvIHRoZSBhYm92ZSB0d28sIHNldCB0aGUgcm93IHRvICd1bmRlZmluZWQnIHNvIGl0J3MgaWdub3JlZCBieSBkZWZhdWx0XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICAvLyBUYWtlIGNhcmUgb2Ygc29tZSBicmFpbmRlYWQgZ3Vlc3Nlc1xuICAgIGlmIChsYWJlbC5tYXRjaCgvYXNzYXkvaSkgfHwgbGFiZWwubWF0Y2goL2xpbmUvaSkpIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgfVxuICAgIGlmIChFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09ICdwcicpIHtcbiAgICAgICAgaWYgKGxhYmVsLm1hdGNoKC9wcm90ZWluL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gMTI7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm8gcG9pbnQgaW4gY29udGludWluZywgb25seSBsaW5lIGFuZCBwcm90ZWluIGFyZSByZWxldmFudFxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgLy8gVGhpbmdzIHdlJ2xsIGJlIGNvdW50aW5nIHRvIGhhemFyZCBhIGd1ZXNzIGF0IHRoZSByb3cgY29udGVudHNcbiAgICBibGFuayA9IHN0cmluZ3MgPSAwO1xuICAgIC8vIEEgY29uZGVuc2VkIHZlcnNpb24gb2YgdGhlIHJvdywgd2l0aCBubyBudWxscyBvciBibGFuayB2YWx1ZXNcbiAgICBjb25kZW5zZWQgPSByb3cuZmlsdGVyKCh2OiBzdHJpbmcpOiBib29sZWFuID0+ICEhdik7XG4gICAgYmxhbmsgPSByb3cubGVuZ3RoIC0gY29uZGVuc2VkLmxlbmd0aDtcbiAgICBjb25kZW5zZWQuZm9yRWFjaCgodjogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgIHYgPSB2LnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICBpZiAoaXNOYU4ocGFyc2VGbG9hdCh2KSkpIHtcbiAgICAgICAgICAgICsrc3RyaW5ncztcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIC8vIElmIHRoZSBsYWJlbCBwYXJzZXMgaW50byBhIG51bWJlciBhbmQgdGhlIGRhdGEgY29udGFpbnMgbm8gc3RyaW5ncywgY2FsbCBpdCBhIHRpbXNldGFtcCBmb3IgZGF0YVxuICAgIGlmICghaXNOYU4ocGFyc2VGbG9hdChsYWJlbCkpICYmIChzdHJpbmdzID09PSAwKSkge1xuICAgICAgICByZXR1cm4gMztcbiAgICB9XG4gICAgLy8gTm8gY2hvaWNlIGJ5IGRlZmF1bHRcbiAgICByZXR1cm4gMDtcbn0sXG5cblxucmVkcmF3SWdub3JlZFZhbHVlTWFya2VyczogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5UYWJsZS5kYXRhQ2VsbHMuZm9yRWFjaCgocm93OiBIVE1MRWxlbWVudFtdKTogdm9pZCA9PiB7XG4gICAgICAgIHJvdy5mb3JFYWNoKChjZWxsOiBIVE1MRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHRvZ2dsZTogYm9vbGVhbiA9ICFFRERBVEQuR3JpZC5pZ25vcmVEYXRhR2FwcyAmJiAhIWNlbGwuZ2V0QXR0cmlidXRlKCdpc2JsYW5rJyk7XG4gICAgICAgICAgICAkKGNlbGwpLnRvZ2dsZUNsYXNzKCdpZ25vcmVkTGluZScsIHRvZ2dsZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufSxcblxuXG50b2dnbGVUYWJsZVJvdzogKGJveDogSFRNTEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICB2YXIgdmFsdWU6IG51bWJlciwgaW5wdXQ6IEpRdWVyeTtcbiAgICBpbnB1dCA9ICQoYm94KTtcbiAgICB2YWx1ZSA9IHBhcnNlSW50KGlucHV0LnZhbCgpLCAxMCk7XG4gICAgRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ZhbHVlXSA9IGlucHV0LnByb3AoJ2NoZWNrZWQnKTtcbiAgICBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgRUREQVRELnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICBFRERBVEQucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgLy8gUmVzZXR0aW5nIGEgZGlzYWJsZWQgcm93IG1heSBjaGFuZ2UgdGhlIG51bWJlciBvZiByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlKCk7XG59LFxuXG5cbnRvZ2dsZVRhYmxlQ29sdW1uOiAoYm94OiBIVE1MRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgIHZhciB2YWx1ZTogbnVtYmVyLCBpbnB1dDogSlF1ZXJ5O1xuICAgIGlucHV0ID0gJChib3gpO1xuICAgIHZhbHVlID0gcGFyc2VJbnQoaW5wdXQudmFsKCksIDEwKTtcbiAgICBFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbdmFsdWVdID0gaW5wdXQucHJvcCgnY2hlY2tlZCcpO1xuICAgIEVEREFURC5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICBFRERBVEQucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgIEVEREFURC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAvLyBSZXNldHRpbmcgYSBkaXNhYmxlZCBjb2x1bW4gbWF5IGNoYW5nZSB0aGUgcm93cyBsaXN0ZWQgaW4gdGhlIEluZm8gdGFibGUuXG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZSgpO1xufSxcblxuXG5yZXNldEVuYWJsZWRGbGFnTWFya2VyczogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgeTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XSA9IEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XSB8fCBbXTtcbiAgICAgICAgcm93LmZvckVhY2goKF8sIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t5XSA9IHRydWU7XG4gICAgfSk7XG4gICAgKEVEREFURC5HcmlkLmRhdGFbMF0gfHwgW10pLmZvckVhY2goKF8sIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbeF0gPSB0cnVlO1xuICAgIH0pO1xuICAgIC8vIEZsaXAgYWxsIHRoZSBjaGVja2JveGVzIG9uIGluIHRoZSBoZWFkZXIgY2VsbHMgZm9yIHRoZSBkYXRhIGNvbHVtbnNcbiAgICAkKCcjZGF0YVRhYmxlRGl2JykuZmluZCgnW25hbWU9ZW5hYmxlQ29sdW1uXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAvLyBTYW1lIGZvciB0aGUgY2hlY2tib3hlcyBpbiB0aGUgcm93IGxhYmVsIGNlbGxzXG4gICAgJCgnI2RhdGFUYWJsZURpdicpLmZpbmQoJ1tuYW1lPWVuYWJsZVJvd10nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgRUREQVRELmludGVycHJldERhdGFUYWJsZSgpO1xuICAgIEVEREFURC5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgRUREQVRELnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGUoKTtcbn0sXG5cblxucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELlRhYmxlLmRhdGFDZWxscy5mb3JFYWNoKChyb3c6IEhUTUxFbGVtZW50W10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIUVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t5XTtcbiAgICAgICAgJChFRERBVEQuVGFibGUucm93TGFiZWxDZWxsc1t5XSkudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkTGluZScsIHRvZ2dsZSk7XG4gICAgICAgIHJvdy5mb3JFYWNoKChjZWxsOiBIVE1MRWxlbWVudCwgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB0b2dnbGUgPSAhRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdXG4gICAgICAgICAgICAgICAgfHwgIUVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1t4XVxuICAgICAgICAgICAgICAgIHx8ICFFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbeV07XG4gICAgICAgICAgICAkKGNlbGwpLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBFRERBVEQuVGFibGUuY29sQ2hlY2tib3hDZWxscy5mb3JFYWNoKChib3g6IEhUTUxFbGVtZW50LCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIHRvZ2dsZTogYm9vbGVhbiA9ICFFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbeF07XG4gICAgICAgICQoYm94KS50b2dnbGVDbGFzcygnZGlzYWJsZWRMaW5lJywgdG9nZ2xlKTtcbiAgICB9KTtcbn0sXG5cblxuaW50ZXJwcmV0RGF0YVRhYmxlUm93czogKCk6IFtib29sZWFuLCBudW1iZXJdID0+IHtcbiAgICB2YXIgc2luZ2xlOiBudW1iZXIgPSAwLCBub25TaW5nbGU6IG51bWJlciA9IDAsIGVhcmxpZXN0TmFtZTogbnVtYmVyO1xuICAgIC8vIExvb2sgZm9yIHRoZSBwcmVzZW5jZSBvZiBcInNpbmdsZSBtZWFzdXJlbWVudCB0eXBlXCIgcm93cywgYW5kIHJvd3Mgb2YgYWxsIG90aGVyIHNpbmdsZS1pdGVtIHR5cGVzXG4gICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChfLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXI7XG4gICAgICAgIGlmIChFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbeV0pIHtcbiAgICAgICAgICAgIHB1bGxkb3duID0gRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbeV07XG4gICAgICAgICAgICBpZiAocHVsbGRvd24gPT09IDUgfHwgcHVsbGRvd24gPT09IDEyKSB7XG4gICAgICAgICAgICAgICAgc2luZ2xlKys7IC8vIFNpbmdsZSBNZWFzdXJlbWVudCBOYW1lIG9yIFNpbmdsZSBQcm90ZWluIE5hbWVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDQgfHwgcHVsbGRvd24gPT09IDMpIHtcbiAgICAgICAgICAgICAgICBub25TaW5nbGUrKztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEgJiYgZWFybGllc3ROYW1lID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBlYXJsaWVzdE5hbWUgPSB5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG4gICAgLy8gT25seSB1c2UgdGhpcyBtb2RlIGlmIHRoZSB0YWJsZSBpcyBlbnRpcmVseSBmcmVlIG9mIHNpbmdsZS10aW1lc3RhbXAgYW5kXG4gICAgLy8gc2luZ2xlLW1ldGFkYXRhIHJvd3MsIGFuZCBoYXMgYXQgbGVhc3Qgb25lIFwic2luZ2xlIG1lYXN1cmVtZW50XCIgcm93LCBhbmQgYXRcbiAgICAvLyBsZWFzdCBvbmUgXCJBc3NheS9MaW5lIG5hbWVzXCIgcm93LlxuICAgIC8vIE5vdGU6IHJlcXVpcmVtZW50IG9mIGFuIFwiQXNzYXkvTGluZSBuYW1lc1wiIHJvdyBwcmV2ZW50cyB0aGlzIG1vZGUgZnJvbSBiZWluZ1xuICAgIC8vIGVuYWJsZWQgd2hlbiB0aGUgcGFnZSBpcyBpbiAnVHJhbnNjcmlwdGlvbicgbW9kZS5cbiAgICByZXR1cm4gWyhzaW5nbGUgPiAwICYmIG5vblNpbmdsZSA9PT0gMCAmJiBlYXJsaWVzdE5hbWUgIT09IHVuZGVmaW5lZCksIGVhcmxpZXN0TmFtZV07XG59LFxuXG5cbmludGVycHJldERhdGFUYWJsZTogKCk6IHZvaWQgPT4ge1xuICAgIC8vIFdlJ2xsIGJlIGFjY3VtdWxhdGluZyB0aGVzZSBmb3IgZGlzYW1iaWd1YXRpb24uXG4gICAgLy8gRWFjaCB1bmlxdWUga2V5IHdpbGwgZ2V0IGEgZGlzdGluY3QgdmFsdWUsIHBsYWNpbmcgaXQgaW4gdGhlIG9yZGVyIGZpcnN0IHNlZW5cbiAgICB2YXIgc2VlbkFzc2F5TGluZU5hbWVzID0ge307XG4gICAgdmFyIHNlZW5NZWFzdXJlbWVudE5hbWVzID0ge307XG4gICAgdmFyIHNlZW5NZXRhZGF0YU5hbWVzID0ge307XG4gICAgLy8gSGVyZSdzIGhvdyB3ZSB0cmFjayB0aGUgaW5kZXhlcyB3ZSBhc3NpZ24gYXMgdmFsdWVzIGFib3ZlLlxuICAgIHZhciBhc3NheUxpbmVOYW1lc0NvdW50ID0gMDtcbiAgICB2YXIgbWVhc3VyZW1lbnROYW1lc0NvdW50ID0gMDtcbiAgICB2YXIgbWV0YWRhdGFOYW1lc0NvdW50ID0gMDtcbiAgICAvLyBIZXJlIGFyZSB0aGUgYXJyYXlzIHdlIHdpbGwgdXNlIGxhdGVyXG4gICAgRUREQVRELlNldHMucGFyc2VkU2V0cyA9IFtdO1xuICAgIEVEREFURC5TZXRzLnVuaXF1ZUxpbmVBc3NheU5hbWVzID0gW107XG4gICAgRUREQVRELlNldHMudW5pcXVlTWVhc3VyZW1lbnROYW1lcyA9IFtdO1xuICAgIEVEREFURC5TZXRzLnVuaXF1ZU1ldGFkYXRhTmFtZXMgPSBbXTtcbiAgICBFRERBVEQuU2V0cy5zZWVuQW55VGltZXN0YW1wcyA9IGZhbHNlO1xuXG4gICAgLy8gVGhpcyBtb2RlIG1lYW5zIHdlIG1ha2UgYSBuZXcgXCJzZXRcIiBmb3IgZWFjaCBjZWxsIGluIHRoZSB0YWJsZSwgcmF0aGVyIHRoYW5cbiAgICAvLyB0aGUgc3RhbmRhcmQgbWV0aG9kIG9mIG1ha2luZyBhIG5ldyBcInNldFwiIGZvciBlYWNoIGNvbHVtbiBpbiB0aGUgdGFibGUuXG4gICAgdmFyIGludGVycHJldE1vZGUgPSBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlUm93cygpO1xuXG4gICAgLy8gVGhlIHN0YW5kYXJkIG1ldGhvZDogTWFrZSBhIFwic2V0XCIgZm9yIGVhY2ggY29sdW1uIG9mIHRoZSB0YWJsZVxuICAgIGlmICghaW50ZXJwcmV0TW9kZVswXSkge1xuICAgICAgICBFRERBVEQuVGFibGUuY29sT2JqZWN0cy5mb3JFYWNoKChfLCBjOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBzZXQ6IGFueSwgdW5pcXVlVGltZXM6IG51bWJlcltdLCB0aW1lczogYW55LCBmb3VuZE1ldGE6IGJvb2xlYW47XG4gICAgICAgICAgICAvLyBTa2lwIGl0IGlmIHRoZSB3aG9sZSBjb2x1bW4gaXMgZGVhY3RpdmF0ZWRcbiAgICAgICAgICAgIGlmICghRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW2NdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2V0ID0ge1xuICAgICAgICAgICAgICAgIC8vIEZvciB0aGUgZ3JhcGhpbmcgbW9kdWxlXG4gICAgICAgICAgICAgICAgJ2xhYmVsJzogJ0NvbHVtbiAnICsgYyxcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdDb2x1bW4gJyArIGMsXG4gICAgICAgICAgICAgICAgJ3VuaXRzJzogJ3VuaXRzJyxcbiAgICAgICAgICAgICAgICAvLyBGb3Igc3VibWlzc2lvbiB0byB0aGUgZGF0YWJhc2VcbiAgICAgICAgICAgICAgICAncGFyc2luZ0luZGV4JzogYyxcbiAgICAgICAgICAgICAgICAnYXNzYXknOiBudWxsLFxuICAgICAgICAgICAgICAgICdhc3NheU5hbWUnOiBudWxsLFxuICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudFR5cGUnOiBudWxsLFxuICAgICAgICAgICAgICAgICdtZXRhZGF0YSc6IHt9LFxuICAgICAgICAgICAgICAgICdzaW5nbGVEYXRhJzogbnVsbCxcbiAgICAgICAgICAgICAgICAvLyBGb3IgYm90aFxuICAgICAgICAgICAgICAgICdkYXRhJzogW11cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB1bmlxdWVUaW1lcyA9IFtdO1xuICAgICAgICAgICAgdGltZXMgPSB7fTtcbiAgICAgICAgICAgIGZvdW5kTWV0YSA9IGZhbHNlO1xuICAgICAgICAgICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCByOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlciwgbGFiZWw6IHN0cmluZywgdmFsdWU6IHN0cmluZywgdGltZXN0YW1wOiBudW1iZXI7XG4gICAgICAgICAgICAgICAgaWYgKCFFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3Nbcl0gfHwgIUVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1tyXVtjXSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHB1bGxkb3duID0gRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3Nbcl07XG4gICAgICAgICAgICAgICAgbGFiZWwgPSBFRERBVEQuR3JpZC5yb3dNYXJrZXJzW3JdIHx8ICcnO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gcm93W2NdIHx8ICcnO1xuICAgICAgICAgICAgICAgIGlmICghcHVsbGRvd24pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDExKSB7ICAvLyBUcmFuc2NyaXB0b21pY3M6IFJQS00gdmFsdWVzXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0LnNpbmdsZURhdGEgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMTApIHsgIC8vIFRyYW5zY3JpcHRvbWljczogR2VuZSBuYW1lc1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5uYW1lID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQubWVhc3VyZW1lbnRUeXBlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDMpIHsgICAvLyBUaW1lc3RhbXBzXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsID0gbGFiZWwucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcCA9IHBhcnNlRmxvYXQobGFiZWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKHRpbWVzdGFtcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSdyZSBpZ25vcmluZyBnYXBzLCBza2lwIG91dCBvbiByZWNvcmRpbmcgdGhpcyB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChFRERBVEQuR3JpZC5pZ25vcmVEYXRhR2Fwcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIGFjdHVhbGx5IHByZWZlciBudWxsIGhlcmUsIHRvIGluZGljYXRlIGEgcGxhY2Vob2xkZXIgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRpbWVzW3RpbWVzdGFtcF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lc1t0aW1lc3RhbXBdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5pcXVlVGltZXMucHVzaCh0aW1lc3RhbXApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnNlZW5BbnlUaW1lc3RhbXBzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChsYWJlbCA9PT0gJycgfHwgdmFsdWUgPT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdyB0aGF0IHdlJ3ZlIGRlYWx0IHdpdGggdGltZXN0YW1wcywgd2UgcHJvY2VlZCBvbiB0byBvdGhlciBkYXRhIHR5cGVzLlxuICAgICAgICAgICAgICAgICAgICAvLyBBbGwgdGhlIG90aGVyIGRhdGEgdHlwZXMgZG8gbm90IGFjY2VwdCBhIGJsYW5rIHZhbHVlLCBzbyB3ZSB3ZWVkIHRoZW0gb3V0IG5vdy5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEpIHsgICAvLyBBc3NheS9MaW5lIE5hbWVzXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiB2YWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5Bc3NheUxpbmVOYW1lc1t2YWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5Bc3NheUxpbmVOYW1lc1t2YWx1ZV0gPSArK2Fzc2F5TGluZU5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy51bmlxdWVMaW5lQXNzYXlOYW1lcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXQuYXNzYXkgPSBzZWVuQXNzYXlMaW5lTmFtZXNbdmFsdWVdO1xuICAgICAgICAgICAgICAgICAgICBzZXQuYXNzYXlOYW1lID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAyKSB7ICAgLy8gTWV0YWJvbGl0ZSBOYW1lc1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiBoYXZlbid0IHNlZW4gdmFsdWUgYmVmb3JlLCBpbmNyZW1lbnQgYW5kIHN0b3JlIHVuaXF1ZW5lc3MgaW5kZXhcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWVhc3VyZW1lbnROYW1lc1t2YWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW3ZhbHVlXSA9ICsrbWVhc3VyZW1lbnROYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXQubWVhc3VyZW1lbnRUeXBlID0gc2Vlbk1lYXN1cmVtZW50TmFtZXNbdmFsdWVdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gNCkgeyAgIC8vIE1ldGFkYXRhXG4gICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1ldGFkYXRhTmFtZXNbbGFiZWxdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWV0YWRhdGFOYW1lc1tsYWJlbF0gPSArK21ldGFkYXRhTmFtZXNDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnVuaXF1ZU1ldGFkYXRhTmFtZXMucHVzaChsYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2V0Lm1ldGFkYXRhW3NlZW5NZXRhZGF0YU5hbWVzW2xhYmVsXV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgZm91bmRNZXRhID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHVuaXF1ZVRpbWVzLnNvcnQoKGEsIGIpID0+IGEgLSBiKS5mb3JFYWNoKCh0aW1lOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBzZXQuZGF0YS5wdXNoKFt0aW1lLCB0aW1lc1t0aW1lXV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBvbmx5IHNhdmUgaWYgYWNjdW11bGF0ZWQgc29tZSBkYXRhIG9yIG1ldGFkYXRhXG4gICAgICAgICAgICBpZiAodW5pcXVlVGltZXMubGVuZ3RoIHx8IGZvdW5kTWV0YSB8fCBzZXQuc2luZ2xlRGF0YSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnBhcnNlZFNldHMucHVzaChzZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAvLyBUaGUgYWx0ZXJuYXRlIG1ldGhvZDogQSBcInNldFwiIGZvciBldmVyeSBjZWxsIG9mIHRoZSB0YWJsZSwgd2l0aCB0aGUgdGltZXN0YW1wXG4gICAgLy8gdG8gYmUgZGV0ZXJtaW5lZCBsYXRlci5cbiAgICB9IGVsc2Uge1xuICAgICAgICBFRERBVEQuVGFibGUuY29sT2JqZWN0cy5mb3JFYWNoKChfLCBjOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBjZWxsVmFsdWU6IHN0cmluZywgc2V0OiBhbnk7XG4gICAgICAgICAgICBpZiAoIUVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1tjXSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNlbGxWYWx1ZSA9IEVEREFURC5HcmlkLmRhdGFbaW50ZXJwcmV0TW9kZVsxXV1bY10gfHwgJyc7XG4gICAgICAgICAgICBpZiAoY2VsbFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgaGF2ZW4ndCBzZWVuIGNlbGxWYWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgIGlmICghc2VlbkFzc2F5TGluZU5hbWVzW2NlbGxWYWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgc2VlbkFzc2F5TGluZU5hbWVzW2NlbGxWYWx1ZV0gPSArK2Fzc2F5TGluZU5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnVuaXF1ZUxpbmVBc3NheU5hbWVzLnB1c2goY2VsbFZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCByOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIUVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1tyXSB8fCAhRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3JdW2NdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcHVsbGRvd24gPSBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tyXTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBFRERBVEQuR3JpZC5yb3dNYXJrZXJzW3JdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHJvd1tjXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwdWxsZG93biB8fCAhKHB1bGxkb3duID09PSA1IHx8IHB1bGxkb3duID09PSAxMikgfHwgIWxhYmVsIHx8ICF2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNldCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciB0aGUgZ3JhcGhpbmcgbW9kdWxlICh3aGljaCB3ZSB3b24ndCBiZSB1c2luZyBpbiB0aGlzIG1vZGUsIGFjdHVhbGx5KVxuICAgICAgICAgICAgICAgICAgICAgICAgJ2xhYmVsJzogJ0NvbHVtbiAnICsgYyArICcgcm93ICcgKyByLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiAnQ29sdW1uICcgKyBjICsgJyByb3cgJyArIHIsXG4gICAgICAgICAgICAgICAgICAgICAgICAndW5pdHMnOiAndW5pdHMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHN1Ym1pc3Npb24gdG8gdGhlIGRhdGFiYXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAncGFyc2luZ0luZGV4JzogRUREQVRELlNldHMucGFyc2VkU2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAnYXNzYXknOiBzZWVuQXNzYXlMaW5lTmFtZXNbY2VsbFZhbHVlXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdhc3NheU5hbWUnOiBjZWxsVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAnbWVhc3VyZW1lbnRUeXBlJzogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICdtZXRhZGF0YSc6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NpbmdsZURhdGEnOiB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBib3RoXG4gICAgICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IFtdXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwdWxsZG93biA9PT0gNSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWVhc3VyZW1lbnROYW1lc1tsYWJlbF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWVhc3VyZW1lbnROYW1lc1tsYWJlbF0gPSArK21lYXN1cmVtZW50TmFtZXNDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy51bmlxdWVNZWFzdXJlbWVudE5hbWVzLnB1c2gobGFiZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50VHlwZSA9IHNlZW5NZWFzdXJlbWVudE5hbWVzW2xhYmVsXTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMTIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5uYW1lID0gbGFiZWw7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQubWVhc3VyZW1lbnRUeXBlID0gbGFiZWw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMucGFyc2VkU2V0cy5wdXNoKHNldCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn0sXG5cblxucXVldWVHcmFwaFJlbWFrZTogKCk6IHZvaWQgPT4ge1xuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgdGhlIGdyYXBoLlxuICAgIC8vIFRoaXMgd2F5IHdlJ3JlIG5vdCBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuXG4gICAgLy8gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgaWYgKEVEREFURC5ncmFwaFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChFRERBVEQuZ3JhcGhSZWZyZXNoVGltZXJJRCk7XG4gICAgfVxuICAgIGlmIChFRERBVEQuZ3JhcGhFbmFibGVkKSB7XG4gICAgICAgIEVEREFURC5ncmFwaFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dChFRERBVEQucmVtYWtlR3JhcGhBcmVhLmJpbmQoRUREQVREKSwgNzAwKTtcbiAgICB9XG59LFxuXG5cbnJlbWFrZUdyYXBoQXJlYTogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5ncmFwaFJlZnJlc2hUaW1lcklEID0gMDsgXG4gICAgaWYgKCFFRERBVERHcmFwaGluZyB8fCAhRUREQVRELmdyYXBoRW5hYmxlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIEVEREFUREdyYXBoaW5nLmNsZWFyQWxsU2V0cygpO1xuICAgIC8vIElmIHdlJ3JlIG5vdCBpbiB0aGlzIG1vZGUsIGRyYXdpbmcgYSBncmFwaCBpcyBub25zZW5zaWNhbC5cbiAgICBpZiAoRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PT0gXCJzdGRcIikge1xuICAgICAgICBFRERBVEQuU2V0cy5wYXJzZWRTZXRzLmZvckVhY2goKHNldCkgPT4gRUREQVRER3JhcGhpbmcuYWRkTmV3U2V0KHNldCkpO1xuICAgIH1cbiAgICBFRERBVERHcmFwaGluZy5kcmF3U2V0cygpO1xufSxcblxuXG5yZXNldEluZm9UYWJsZUZpZWxkczogKCk6IHZvaWQgPT4ge1xuICAgIC8vIFRPVEFMTFkgU1RVQkJFRFxufSxcblxuXG5yZW1ha2VJbmZvVGFibGVBc3NheUxpbmVTZWN0aW9uOiAobWFzdGVyUDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgdmFyIHRhYmxlOiBIVE1MVGFibGVFbGVtZW50LCBib2R5OiBIVE1MVGFibGVFbGVtZW50O1xuICAgIGlmIChFRERBVEQuU2V0cy51bmlxdWVMaW5lQXNzYXlOYW1lcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgJCgnI21hc3RlckFzc2F5TGluZURpdicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBPdGhlcndpc2UsIHB1dCB0b2dldGhlciBhIGRpc2FtYmlndWF0aW9uIHNlY3Rpb24gZm9yIEFzc2F5cy9MaW5lc1xuICAgICAgICAvLyBLZWVwIGEgc2VwYXJhdGUgc2V0IG9mIGNvcnJlbGF0aW9ucyBiZXR3ZWVuIHN0cmluZyBhbmQgcHVsbGRvd25zIGZvciBlYWNoXG4gICAgICAgIC8vIFByb3RvY29sLCBzaW5jZSBzYW1lIHN0cmluZyBjYW4gbWF0Y2ggZGlmZmVyZW50IEFzc2F5cywgYW5kIHRoZSBwdWxsZG93bnNcbiAgICAgICAgLy8gd2lsbCBoYXZlIGRpZmZlcmVudCBjb250ZW50LCBpbiBlYWNoIFByb3RvY29sLlxuICAgICAgICBFRERBVEQuRGlzYW0uYXNzYXlMaW5lT2JqU2V0c1ttYXN0ZXJQXSA9IHt9O1xuICAgICAgICBFRERBVEQuRGlzYW0uY3VycmVudGx5VmlzaWJsZUFzc2F5TGluZU9ialNldHMgPSBbXTtcbiAgICAgICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRhYmxlPicpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVBc3NheXNUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlTGluZXNBc3NheXNTZWN0aW9uJykucmVtb3ZlQ2xhc3MoJ29mZicpKVxuICAgICAgICAgICAgLm9uKCdjaGFuZ2UnLCAnc2VsZWN0JywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgRUREQVRELnVzZXJDaGFuZ2VkQXNzYXlMaW5lRGlzYW0oZXYudGFyZ2V0KTtcbiAgICAgICAgICAgIH0pWzBdO1xuICAgICAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgICAgIEVEREFURC5TZXRzLnVuaXF1ZUxpbmVBc3NheU5hbWVzLmZvckVhY2goKG5hbWU6IHN0cmluZywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgZGlzYW06IGFueSwgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50LCBkZWZhdWx0U2VsOiBhbnksXG4gICAgICAgICAgICAgICAgY2VsbDogSlF1ZXJ5LCBhU2VsZWN0OiBKUXVlcnksIGxTZWxlY3Q6IEpRdWVyeTtcbiAgICAgICAgICAgIGRpc2FtID0gRUREQVRELkRpc2FtLmFzc2F5TGluZU9ialNldHNbbWFzdGVyUF1bbmFtZV07XG4gICAgICAgICAgICBpZiAoIWRpc2FtKSB7XG4gICAgICAgICAgICAgICAgZGlzYW0gPSB7fTtcbiAgICAgICAgICAgICAgICBkZWZhdWx0U2VsID0gRUREQVRELmRpc2FtYmlndWF0ZUFuQXNzYXlPckxpbmUobmFtZSwgaSk7XG4gICAgICAgICAgICAgICAgLy8gRmlyc3QgbWFrZSBhIHRhYmxlIHJvdywgYW5kIHNhdmUgYSByZWZlcmVuY2UgdG8gaXRcbiAgICAgICAgICAgICAgICBkaXNhbS5yb3dPYmogPSByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD4gYm9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAvLyBOZXh0LCBhZGQgYSB0YWJsZSBjZWxsIHdpdGggdGhlIHN0cmluZyB3ZSBhcmUgZGlzYW1iaWd1YXRpbmdcbiAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8ocm93Lmluc2VydENlbGwoKSk7XG4gICAgICAgICAgICAgICAgLy8gTm93IGJ1aWxkIGFub3RoZXIgdGFibGUgY2VsbCB0aGF0IHdpbGwgY29udGFpbiB0aGUgcHVsbGRvd25zXG4gICAgICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuY3NzKCd0ZXh0LWFsaWduJywgJ2xlZnQnKTtcbiAgICAgICAgICAgICAgICBhU2VsZWN0ID0gJCgnPHNlbGVjdD4nKS5hcHBlbmRUbyhjZWxsKVxuICAgICAgICAgICAgICAgICAgICAuZGF0YSh7ICdzZXRCeVVzZXInOiBmYWxzZSwgJ3Zpc2libGVJbmRleCc6IGkgfSlcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ25hbWUnLCAnZGlzYW1Bc3NheScgKyAoaSArIDEpKTtcbiAgICAgICAgICAgICAgICBkaXNhbS5hc3NheU9iaiA9IGFTZWxlY3RbMF07XG4gICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KCcoQ3JlYXRlIE5ldyknKS5hcHBlbmRUbyhhU2VsZWN0KS52YWwoJ25ldycpXG4gICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsICFkZWZhdWx0U2VsLmFzc2F5SUQpO1xuICAgICAgICAgICAgICAgIChBVERhdGEuZXhpc3RpbmdBc3NheXNbbWFzdGVyUF0gfHwgW10pLmZvckVhY2goKGlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBBc3NheVJlY29yZCwgbGluZTogTGluZVJlY29yZCwgcHJvdG9jb2w6IGFueTtcbiAgICAgICAgICAgICAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpZF07XG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhhU2VsZWN0KS52YWwoaWQudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsIGRlZmF1bHRTZWwuYXNzYXlJRCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIGEgc3BhbiB0byBjb250YWluIHRoZSB0ZXh0IGxhYmVsIGZvciB0aGUgTGluZSBwdWxsZG93biwgYW5kIHRoZSBwdWxsZG93biBpdHNlbGZcbiAgICAgICAgICAgICAgICBjZWxsID0gJCgnPHNwYW4+JykudGV4dCgnZm9yIExpbmU6JykudG9nZ2xlQ2xhc3MoJ29mZicsICEhZGVmYXVsdFNlbC5hc3NheUlEKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgbFNlbGVjdCA9ICQoJzxzZWxlY3Q+JykuYXBwZW5kVG8oY2VsbCkuZGF0YSgnc2V0QnlVc2VyJywgZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCduYW1lJywgJ2Rpc2FtTGluZScgKyAoaSArIDEpKTtcbiAgICAgICAgICAgICAgICBkaXNhbS5saW5lT2JqID0gbFNlbGVjdFswXTtcbiAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKGxTZWxlY3QpLnZhbCgnbmV3JylcbiAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgIWRlZmF1bHRTZWwubGluZUlEKTtcbiAgICAgICAgICAgICAgICAvLyBBVERhdGEuZXhpc3RpbmdMaW5lcyBpcyBvZiB0eXBlIHtpZDogbnVtYmVyOyBuOiBzdHJpbmc7fVtdXG4gICAgICAgICAgICAgICAgKEFURGF0YS5leGlzdGluZ0xpbmVzIHx8IFtdKS5mb3JFYWNoKChsaW5lOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KGxpbmUubikuYXBwZW5kVG8obFNlbGVjdCkudmFsKGxpbmUuaWQudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsIGRlZmF1bHRTZWwubGluZUlEID09PSBsaW5lLmlkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBFRERBVEQuRGlzYW0uYXNzYXlMaW5lT2JqU2V0c1ttYXN0ZXJQXVtuYW1lXSA9IGRpc2FtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJChkaXNhbS5yb3dPYmopLmFwcGVuZFRvKGJvZHkpO1xuICAgICAgICAgICAgRUREQVRELkRpc2FtLmN1cnJlbnRseVZpc2libGVBc3NheUxpbmVPYmpTZXRzLnB1c2goZGlzYW0pO1xuICAgICAgICB9KTtcbiAgICB9XG59LFxuXG5cbnJlbWFrZUluZm9UYWJsZU1lYXN1cmVtZW50U2VjdGlvbjogKCk6IHZvaWQgPT4ge1xuICAgIHZhciB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgYm9keTogSFRNTFRhYmxlRWxlbWVudCwgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50O1xuICAgIC8vIHB1dCB0b2dldGhlciBhIGRpc2FtYmlndWF0aW9uIHNlY3Rpb24gZm9yIG1lYXN1cmVtZW50IHR5cGVzXG4gICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRhYmxlPicpXG4gICAgICAgIC5hdHRyKHsgJ2lkJzogJ2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1RhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAuYXBwZW5kVG8oJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1NlY3Rpb24nKS5yZW1vdmVDbGFzcygnb2ZmJykpXG4gICAgICAgIC5vbignY2hhbmdlJywgJ2lucHV0W3R5cGU9aGlkZGVuXScsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgLy8gb25seSB3YXRjaCBmb3IgY2hhbmdlcyBvbiB0aGUgaGlkZGVuIHBvcnRpb24sIGxldCBhdXRvY29tcGxldGUgd29ya1xuICAgICAgICAgICAgRUREQVRELnVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbShldi50YXJnZXQpO1xuICAgICAgICB9KVswXTtcbiAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgLy8gSGVhZGVycyBmb3IgdGhlIHRhYmxlXG4gICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+IGJvZHkuaW5zZXJ0Um93KCk7XG4gICAgJCgnPHRoPicpLmF0dHIoeyAnY29sc3Bhbic6IDIgfSkuY3NzKCd0ZXh0LWFsaWduJywgJ3JpZ2h0JykudGV4dCgnQ29tcGFydG1lbnQnKS5hcHBlbmRUbyhyb3cpO1xuICAgICQoJzx0aD4nKS50ZXh0KCdUeXBlJykuYXBwZW5kVG8ocm93KTtcbiAgICAkKCc8dGg+JykudGV4dChFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09PSAnc3RkJyA/ICdVbml0cycgOiAnJykuYXBwZW5kVG8ocm93KTtcbiAgICAvLyBEb25lIHdpdGggaGVhZGVycyByb3dcbiAgICBFRERBVEQuRGlzYW0uY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cyA9IFtdOyAgIC8vIEZvciB1c2UgaW4gY2FzY2FkaW5nIHVzZXIgc2V0dGluZ3NcbiAgICBFRERBVEQuU2V0cy51bmlxdWVNZWFzdXJlbWVudE5hbWVzLmZvckVhY2goKG5hbWU6IHN0cmluZywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBkaXNhbTogYW55O1xuICAgICAgICBkaXNhbSA9IEVEREFURC5EaXNhbS5tZWFzdXJlbWVudE9ialNldHNbbmFtZV07XG4gICAgICAgIGlmIChkaXNhbSAmJiBkaXNhbS5yb3dPYmopIHtcbiAgICAgICAgICAgICQoZGlzYW0ucm93T2JqKS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRpc2FtID0ge307XG4gICAgICAgICAgICBkaXNhbS5yb3dPYmogPSByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD4gYm9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChuYW1lKS5hcHBlbmRUbyhyb3cuaW5zZXJ0Q2VsbCgpKTtcbiAgICAgICAgICAgIFsnY29tcE9iaicsICd0eXBlT2JqJywgJ3VuaXRzT2JqJ10uZm9yRWFjaCgoYXV0bzogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSA9ICQocm93Lmluc2VydENlbGwoKSkuYWRkQ2xhc3MoJ2Rpc2FtRGF0YUNlbGwnKTtcbiAgICAgICAgICAgICAgICBkaXNhbVthdXRvXSA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUoY2VsbCkuZGF0YSgndHlwZScsIGF1dG8pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBFRERBVEQuRGlzYW0ubWVhc3VyZW1lbnRPYmpTZXRzW25hbWVdID0gZGlzYW07XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETyBzaXppbmcgc2hvdWxkIGJlIGhhbmRsZWQgaW4gQ1NTXG4gICAgICAgIGRpc2FtLmNvbXBPYmouYXR0cignc2l6ZScsIDQpLmRhdGEoJ3Zpc2libGVJbmRleCcsIGkpXG4gICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NQ29tcCcgKyAoaSArIDEpKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLmNvbXBPYmosICdNZWFzdXJlbWVudENvbXBhcnRtZW50JywgRUREQVRELkF1dG9DYWNoZS5jb21wKTtcbiAgICAgICAgZGlzYW0udHlwZU9iai5hdHRyKCdzaXplJywgNDUpLmRhdGEoJ3Zpc2libGVJbmRleCcsIGkpXG4gICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NVHlwZScgKyAoaSArIDEpKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLnR5cGVPYmosICdHZW5lcmljT3JNZXRhYm9saXRlJywgRUREQVRELkF1dG9DYWNoZS5tZXRhYm9saXRlKTtcbiAgICAgICAgRUREX2F1dG8uaW5pdGlhbF9zZWFyY2goZGlzYW0udHlwZU9iaiwgbmFtZSk7XG4gICAgICAgIGRpc2FtLnVuaXRzT2JqLmF0dHIoJ3NpemUnLCAxMCkuZGF0YSgndmlzaWJsZUluZGV4JywgaSlcbiAgICAgICAgICAgIC5uZXh0KCkuYXR0cignbmFtZScsICdkaXNhbU1Vbml0cycgKyAoaSArIDEpKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLnVuaXRzT2JqLCAnTWVhc3VyZW1lbnRVbml0JywgRUREQVRELkF1dG9DYWNoZS51bml0KTtcbiAgICAgICAgLy8gSWYgd2UncmUgaW4gTURWIG1vZGUsIHRoZSB1bml0cyBwdWxsZG93bnMgYXJlIGlycmVsZXZhbnQuXG4gICAgICAgIGRpc2FtLnVuaXRzT2JqLnRvZ2dsZUNsYXNzKCdvZmYnLCBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09PSAnbWR2Jyk7XG4gICAgfSk7XG4gICAgRUREQVRELmNoZWNrQWxsTWVhc3VyZW1lbnRDb21wYXJ0bWVudERpc2FtKCk7XG59LFxuXG5cbnJlbWFrZUluZm9UYWJsZU1ldGFkYXRhU2VjdGlvbjogKCk6IHZvaWQgPT4ge1xuICAgIHZhciB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgYm9keTogSFRNTFRhYmxlRWxlbWVudCwgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50O1xuICAgIC8vIHB1dCB0b2dldGhlciBhIGRpc2FtYmlndWF0aW9uIHNlY3Rpb24gZm9yIG1ldGFkYXRhXG4gICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRhYmxlPicpXG4gICAgICAgIC5hdHRyKHsgJ2lkJzogJ2Rpc2FtYmlndWF0ZU1ldGFkYXRhVGFibGUnLCAnY2VsbHNwYWNpbmcnOiAwIH0pXG4gICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlTWV0YWRhdGFTZWN0aW9uJykucmVtb3ZlQ2xhc3MoJ29mZicpKVxuICAgICAgICAub24oJ2NoYW5nZScsICdpbnB1dCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgLy8gc2hvdWxkIHRoZXJlIGJlIGV2ZW50IGhhbmRsaW5nIGhlcmUgP1xuICAgICAgICB9KVswXTtcbiAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgRUREQVRELlNldHMudW5pcXVlTWV0YWRhdGFOYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgZGlzYW06IGFueTtcbiAgICAgICAgZGlzYW0gPSBFRERBVEQuRGlzYW0ubWV0YWRhdGFPYmpTZXRzW25hbWVdO1xuICAgICAgICBpZiAoZGlzYW0gJiYgZGlzYW0ucm93T2JqKSB7XG4gICAgICAgICAgICAkKGRpc2FtLnJvd09iaikuYXBwZW5kVG8oYm9keSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkaXNhbSA9IHt9O1xuICAgICAgICAgICAgZGlzYW0ucm93T2JqID0gcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+IGJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8ocm93Lmluc2VydENlbGwoKSk7XG4gICAgICAgICAgICBkaXNhbS5tZXRhT2JqID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZShyb3cuaW5zZXJ0Q2VsbCgpKS52YWwobmFtZSk7XG4gICAgICAgICAgICBFRERBVEQuRGlzYW0ubWV0YWRhdGFPYmpTZXRzW25hbWVdID0gZGlzYW07XG4gICAgICAgIH1cbiAgICAgICAgZGlzYW0ubWV0YU9iai5hdHRyKCduYW1lJywgJ2Rpc2FtTWV0YScgKyAoaSArIDEpKS5hZGRDbGFzcygnYXV0b2NvbXBfYWx0eXBlJylcbiAgICAgICAgICAgIC5uZXh0KCkuYXR0cignbmFtZScsICdkaXNhbU1ldGFIaWRkZW4nICsgKGkgKyAxKSk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS5tZXRhT2JqLCAnQXNzYXlMaW5lTWV0YWRhdGFUeXBlJywgRUREQVRELkF1dG9DYWNoZS5tZXRhKTtcbiAgICB9KTtcbn0sXG5cblxuLy8gQ3JlYXRlIHRoZSBTdGVwIDQgdGFibGU6ICBBIHNldCBvZiByb3dzLCBvbmUgZm9yIGVhY2ggeS1heGlzIGNvbHVtbiBvZiBkYXRhLFxuLy8gd2hlcmUgdGhlIHVzZXIgY2FuIGZpbGwgb3V0IGFkZGl0aW9uYWwgaW5mb3JtYXRpb24gZm9yIHRoZSBwYXN0ZWQgdGFibGUuXG5yZW1ha2VJbmZvVGFibGU6ICgpOiB2b2lkID0+IHtcbiAgICB2YXIgbWFzdGVyUCA9IEVEREFURC5tYXN0ZXJQcm90b2NvbDsgICAgLy8gU2hvdXQtb3V0cyB0byBhIG1pZC1ncmFkZSByYXBwZXJcbiAgICAvLyBJbml0aWFsbHkgaGlkZSBhbGwgdGhlIFN0ZXAgNCBtYXN0ZXIgcHVsbGRvd25zIHNvIHdlIGNhbiByZXZlYWwganVzdCB0aGUgb25lcyB3ZSBuZWVkIGxhdGVyXG4gICAgJCgnI21hc3RlckFzc2F5TGluZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAkKCcjbWFzdGVyTVR5cGVEaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgJCgnI2Rpc2FtYmlndWF0ZUxpbmVzQXNzYXlzU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAkKCcjZGlzYW1iaWd1YXRlTWV0YWRhdGFTZWN0aW9uJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICQoJyNkaXNhbWJpZ3VhdGVBc3NheXNUYWJsZScpLnJlbW92ZSgpO1xuICAgICQoJyNkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNUYWJsZScpLnJlbW92ZSgpO1xuICAgICQoJyNkaXNhbWJpZ3VhdGVNZXRhZGF0YVRhYmxlJykucmVtb3ZlKCk7XG4gICAgLy8gSWYgbm8gc2V0cyB0byBzaG93LCBsZWF2ZSB0aGUgYXJlYSBibGFuayBhbmQgc2hvdyB0aGUgJ2VudGVyIHNvbWUgZGF0YSEnIGJhbm5lclxuICAgIGlmIChFRERBVEQuU2V0cy5wYXJzZWRTZXRzLmxlbmd0aCA9PT0gMCkgeyAgIFxuICAgICAgICAkKCcjZW1wdHlEaXNhbWJpZ3VhdGlvbkxhYmVsJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgICQoJyNlbXB0eURpc2FtYmlndWF0aW9uTGFiZWwnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgLy8gSWYgcGFyc2VkIGRhdGEgZXhpc3RzLCBidXQgaGF2ZW4ndCBzZWVuIGEgc2luZ2xlIHRpbWVzdGFtcCBzaG93IHRoZSBcIm1hc3RlciB0aW1lc3RhbXBcIiBVSS5cbiAgICAkKCcjbWFzdGVyVGltZXN0YW1wRGl2JykudG9nZ2xlQ2xhc3MoJ29mZicsIEVEREFURC5TZXRzLnNlZW5BbnlUaW1lc3RhbXBzKTtcbiAgICAvLyBJZiB3ZSBoYXZlIG5vIEFzc2F5cy9MaW5lcyBkZXRlY3RlZCBmb3IgZGlzYW1iaWd1YXRpb24sIGFzayB0aGUgdXNlciB0byBzZWxlY3Qgb25lLlxuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGVBc3NheUxpbmVTZWN0aW9uKEVEREFURC5tYXN0ZXJQcm90b2NvbCk7XG4gICAgLy8gSWYgaW4gJ1RyYW5zY3JpcHRpb24nIG9yICdQcm90ZW9taWNzJyBtb2RlLCB0aGVyZSBhcmUgbm8gbWVhc3VyZW1lbnQgdHlwZXMgaW52b2x2ZWQuXG4gICAgLy8gc2tpcCB0aGUgbWVhc3VyZW1lbnQgc2VjdGlvbiwgYW5kIHByb3ZpZGUgc3RhdGlzdGljcyBhYm91dCB0aGUgZ2F0aGVyZWQgcmVjb3Jkcy5cbiAgICBpZiAoRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PT0gXCJ0clwiIHx8IEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT09IFwicHJcIikge1xuICAgICAgICAvLyBuby1vcFxuICAgIH0gZWxzZSBpZiAoRUREQVRELlNldHMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5sZW5ndGggPT09IDAgJiYgRUREQVRELlNldHMuc2VlbkFueVRpbWVzdGFtcHMpIHtcbiAgICAgICAgLy8gbm8gbWVhc3VyZW1lbnRzIGZvciBkaXNhbWJpZ3VhdGlvbiwgaGF2ZSB0aW1lc3RhbXAgZGF0YSA9PiBhc2sgdGhlIHVzZXIgdG8gc2VsZWN0IG9uZVxuICAgICAgICAkKCcjbWFzdGVyTVR5cGVEaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gaGF2ZSBtZWFzdXJlbWVudCB0eXBlcywgaW4gYXBwcm9wcmF0ZSBtb2RlLCByZW1ha2UgbWVhc3VyZW1lbnQgc2VjdGlvblxuICAgICAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlTWVhc3VyZW1lbnRTZWN0aW9uKCk7XG4gICAgfVxuICAgIC8vIElmIHdlJ3ZlIGRldGVjdGVkIGFueSBtZXRhZGF0YSB0eXBlcyBmb3IgZGlzYW1iaWd1YXRpb24sIGNyZWF0ZSBhIHNlY3Rpb25cbiAgICBpZiAoRUREQVRELlNldHMudW5pcXVlTWV0YWRhdGFOYW1lcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGVNZXRhZGF0YVNlY3Rpb24oKTtcbiAgICB9XG4gICAgLy8gaWYgdGhlIGRlYnVnIGFyZWEgaXMgdGhlcmUsIHNldCBpdHMgdmFsdWUgdG8gSlNPTiBvZiBwYXJzZWQgc2V0c1xuICAgICQoJyNqc29uZGVidWdhcmVhJykudmFsKEpTT04uc3RyaW5naWZ5KEVEREFURC5TZXRzLnBhcnNlZFNldHMpKTtcbn0sXG5cblxuLy8gVGhpcyBmdW5jdGlvbiBzZXJ2ZXMgdHdvIHB1cnBvc2VzLlxuLy8gMS4gSWYgdGhlIGdpdmVuIEFzc2F5IGRpc2FtYmlndWF0aW9uIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3JywgcmV2ZWFsIHRoZSBhZGphY2VudFxuLy8gICAgTGluZSBwdWxsZG93biwgb3RoZXJ3aXNlIGhpZGUgaXQuXG4vLyAyLiBJZiB0aGUgcHVsbGRvd24gaXMgYmVpbmcgc2V0IHRvICduZXcnLCB3YWxrIGRvd24gdGhlIHJlbWFpbmluZyBwdWxsZG93bnMgaW4gdGhlIHNlY3Rpb24sXG4vLyAgICBpbiBvcmRlciwgc2V0dGluZyB0aGVtIHRvICduZXcnIGFzIHdlbGwsIHN0b3BwaW5nIGp1c3QgYmVmb3JlIGFueSBwdWxsZG93biBtYXJrZWQgYXNcbi8vICAgIGJlaW5nICdzZXQgYnkgdGhlIHVzZXInLlxudXNlckNoYW5nZWRBc3NheUxpbmVEaXNhbTogKGFzc2F5RWw6IEhUTUxFbGVtZW50KTogYm9vbGVhbiA9PiB7XG4gICAgdmFyIGNoYW5nZWQ6IEpRdWVyeSwgdjogbnVtYmVyO1xuICAgIGNoYW5nZWQgPSAkKGFzc2F5RWwpLmRhdGEoJ3NldEJ5VXNlcicsIHRydWUpO1xuICAgIC8vIFRoZSBzcGFuIHdpdGggdGhlIGNvcnJlc3BvbmRpbmcgTGluZSBwdWxsZG93biBpcyBhbHdheXMgcmlnaHQgbmV4dCB0byB0aGUgQXNzYXkgcHVsbGRvd25cbiAgICBjaGFuZ2VkLm5leHQoKS50b2dnbGVDbGFzcygnb2ZmJywgY2hhbmdlZC52YWwoKSAhPT0gJ25ldycpO1xuICAgIGlmIChjaGFuZ2VkLnZhbCgpICE9PSAnbmV3Jykge1xuICAgICAgICAvLyBzdG9wIGhlcmUgZm9yIGFueXRoaW5nIG90aGVyIHRoYW4gJ25ldyc7IG9ubHkgJ25ldycgY2FzY2FkZXMgdG8gZm9sbG93aW5nIHB1bGxkb3duc1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHYgPSBjaGFuZ2VkLmRhdGEoJ3Zpc2libGVJbmRleCcpIHx8IDA7XG4gICAgRUREQVRELkRpc2FtLmN1cnJlbnRseVZpc2libGVBc3NheUxpbmVPYmpTZXRzLnNsaWNlKHYpLmZvckVhY2goKG9iajogYW55KTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBzZWxlY3Q6IEpRdWVyeSA9ICQob2JqLmFzc2F5T2JqKTtcbiAgICAgICAgaWYgKHNlbGVjdC5kYXRhKCdzZXRCeVVzZXInKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIHNldCBkcm9wZG93biB0byAnbmV3JyBhbmQgcmV2ZWFsIHRoZSBsaW5lIHB1bGxkb3duXG4gICAgICAgIHNlbGVjdC52YWwoJ25ldycpLm5leHQoKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZhbHNlO1xufSxcblxuXG51c2VyQ2hhbmdlZE1lYXN1cmVtZW50RGlzYW06IChlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgIHZhciBoaWRkZW46IEpRdWVyeSwgYXV0bzogSlF1ZXJ5LCB0eXBlOiBzdHJpbmcsIGk6IG51bWJlcjtcbiAgICBoaWRkZW4gPSAkKGVsZW1lbnQpO1xuICAgIGF1dG8gPSBoaWRkZW4ucHJldigpO1xuICAgIHR5cGUgPSBhdXRvLmRhdGEoJ3R5cGUnKTtcbiAgICBpZiAodHlwZSA9PT0gJ2NvbXBPYmonIHx8IHR5cGUgPT09ICd1bml0c09iaicpIHtcbiAgICAgICAgaSA9IGF1dG8uZGF0YSgnc2V0QnlVc2VyJywgdHJ1ZSkuZGF0YSgndmlzaWJsZUluZGV4JykgfHwgMDtcbiAgICAgICAgRUREQVRELkRpc2FtLmN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHMuc2xpY2UoaSkuc29tZSgob2JqOiBhbnkpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBmb2xsb3dpbmc6IEpRdWVyeSA9ICQob2JqW3R5cGVdKTtcbiAgICAgICAgICAgIGlmIChmb2xsb3dpbmcubGVuZ3RoID09PSAwIHx8IGZvbGxvd2luZy5kYXRhKCdzZXRCeVVzZXInKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAgLy8gYnJlYWs7IGZvciB0aGUgQXJyYXkuc29tZSgpIGxvb3BcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHVzaW5nIHBsYWNlaG9sZGVyIGluc3RlYWQgb2YgdmFsIHRvIGF2b2lkIHRyaWdnZXJpbmcgYXV0b2NvbXBsZXRlIGNoYW5nZVxuICAgICAgICAgICAgZm9sbG93aW5nLmF0dHIoJ3BsYWNlaG9sZGVyJywgYXV0by52YWwoKSk7XG4gICAgICAgICAgICBmb2xsb3dpbmcubmV4dCgpLnZhbChoaWRkZW4udmFsKCkpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgLy8gbm90IGNoZWNraW5nIHR5cGVPYmo7IGZvcm0gc3VibWl0IHNlbmRzIHNlbGVjdGVkIHR5cGVzXG4gICAgRUREQVRELmNoZWNrQWxsTWVhc3VyZW1lbnRDb21wYXJ0bWVudERpc2FtKCk7XG59LFxuXG5cbi8vIFJ1biB0aHJvdWdoIHRoZSBsaXN0IG9mIGN1cnJlbnRseSB2aXNpYmxlIG1lYXN1cmVtZW50IGRpc2FtYmlndWF0aW9uIGZvcm0gZWxlbWVudHMsXG4vLyBjaGVja2luZyB0byBzZWUgaWYgYW55IG9mIHRoZSAnY29tcGFydG1lbnQnIGVsZW1lbnRzIGFyZSBzZXQgdG8gYSBub24tYmxhbmsgdmFsdWUuXG4vLyBJZiBhbnkgYXJlLCBhbmQgd2UncmUgaW4gTURWIGRvY3VtZW50IG1vZGUsIGRpc3BsYXkgYSB3YXJuaW5nIHRoYXQgdGhlIHVzZXIgc2hvdWxkXG4vLyBzcGVjaWZ5IGNvbXBhcnRtZW50cyBmb3IgYWxsIHRoZWlyIG1lYXN1cmVtZW50cy5cbmNoZWNrQWxsTWVhc3VyZW1lbnRDb21wYXJ0bWVudERpc2FtOiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIGFsbFNldDogYm9vbGVhbjtcbiAgICBhbGxTZXQgPSBFRERBVEQuRGlzYW0uY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5ldmVyeSgob2JqOiBhbnkpOiBib29sZWFuID0+IHtcbiAgICAgICAgdmFyIGhpZGRlbjogSlF1ZXJ5ID0gb2JqLmNvbXBPYmoubmV4dCgpO1xuICAgICAgICBpZiAob2JqLmNvbXBPYmouZGF0YSgnc2V0QnlVc2VyJykgfHwgKGhpZGRlbi52YWwoKSAmJiBoaWRkZW4udmFsKCkgIT09ICcwJykpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9KTtcbiAgICAkKCcjbm9Db21wYXJ0bWVudFdhcm5pbmcnKS50b2dnbGVDbGFzcygnb2ZmJywgRUREQVRELmludGVycHJldGF0aW9uTW9kZSAhPT0gJ21kdicgJiYgYWxsU2V0KTtcbn0sXG5cblxuZGlzYW1iaWd1YXRlQW5Bc3NheU9yTGluZTogKGFzc2F5T3JMaW5lOiBzdHJpbmcsIGN1cnJlbnRJbmRleDogbnVtYmVyKTogYW55ID0+IHtcbiAgICB2YXIgc2VsZWN0aW9uczogYW55LCBoaWdoZXN0OiBudW1iZXIsIGFzc2F5czogbnVtYmVyW107XG4gICAgc2VsZWN0aW9ucyA9IHtcbiAgICAgICAgbGluZUlEOjAsXG4gICAgICAgIGFzc2F5SUQ6MFxuICAgIH07XG4gICAgaGlnaGVzdCA9IDA7XG4gICAgLy8gQVREYXRhLmV4aXN0aW5nQXNzYXlzIGlzIHR5cGUge1tpbmRleDogc3RyaW5nXTogbnVtYmVyW119XG4gICAgYXNzYXlzID0gQVREYXRhLmV4aXN0aW5nQXNzYXlzW0VEREFURC5tYXN0ZXJQcm90b2NvbF0gfHwgW107XG4gICAgYXNzYXlzLmV2ZXJ5KChpZDogbnVtYmVyLCBpOiBudW1iZXIpOiBib29sZWFuID0+IHtcbiAgICAgICAgdmFyIGFzc2F5OiBBc3NheVJlY29yZCwgbGluZTogTGluZVJlY29yZCwgcHJvdG9jb2w6IGFueSwgbmFtZTogc3RyaW5nO1xuICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW2lkXTtcbiAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICBuYW1lID0gW2xpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpO1xuICAgICAgICBpZiAoYXNzYXlPckxpbmUudG9Mb3dlckNhc2UoKSA9PT0gbmFtZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZnVsbCBBc3NheSBuYW1lLCBldmVuIGNhc2UtaW5zZW5zaXRpdmUsIGlzIHRoZSBiZXN0IG1hdGNoXG4gICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTsgIC8vIGRvIG5vdCBuZWVkIHRvIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuOCAmJiBhc3NheU9yTGluZSA9PT0gYXNzYXkubmFtZSkge1xuICAgICAgICAgICAgLy8gQW4gZXhhY3QtY2FzZSBtYXRjaCB3aXRoIHRoZSBBc3NheSBuYW1lIGZyYWdtZW50IGFsb25lIGlzIHNlY29uZC1iZXN0LlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuODtcbiAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjcgJiYgYXNzYXkubmFtZS5pbmRleE9mKGFzc2F5T3JMaW5lKSA+PSAwKSB7XG4gICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSB3aG9sZSBzdHJpbmcgaW5zaWRlIHRoZSBBc3NheSBuYW1lIGZyYWdtZW50IGlzIHByZXR0eSBnb29kXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC43O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNiAmJiBsaW5lLm5hbWUuaW5kZXhPZihhc3NheU9yTGluZSkgPj0gMCkge1xuICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgd2hvbGUgc3RyaW5nIGluc2lkZSB0aGUgb3JpZ2luYXRpbmcgTGluZSBuYW1lIGlzIGdvb2QgdG9vLlxuICAgICAgICAgICAgLy8gSXQgbWVhbnMgdGhhdCB0aGUgdXNlciBtYXkgaW50ZW5kIHRvIHBhaXIgd2l0aCB0aGlzIEFzc2F5IGV2ZW4gdGhvdWdoIHRoZVxuICAgICAgICAgICAgLy8gQXNzYXkgbmFtZSBpcyBkaWZmZXJlbnQuICBcbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjY7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC40ICYmXG4gICAgICAgICAgICAgICAgKG5ldyBSZWdFeHAoJyhefFxcXFxXKScgKyBhc3NheS5uYW1lICsgJyhcXFxcV3wkKScsICdnJykpLnRlc3QoYXNzYXlPckxpbmUpKSB7XG4gICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSBBc3NheSBuYW1lIGZyYWdtZW50IHdpdGhpbiB0aGUgd2hvbGUgc3RyaW5nLCBhcyBhIHdob2xlIHdvcmQsIGlzIG91clxuICAgICAgICAgICAgLy8gbGFzdCBvcHRpb24uXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC40O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuMyAmJiBjdXJyZW50SW5kZXggPT09IGkpIHtcbiAgICAgICAgICAgIC8vIElmIGFsbCBlbHNlIGZhaWxzLCBjaG9vc2UgQXNzYXkgb2YgY3VycmVudCBpbmRleCBpbiBzb3J0ZWQgb3JkZXIuXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC4zO1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gICAgLy8gTm93IHdlIHJlcGVhdCB0aGUgcHJhY3RpY2UsIHNlcGFyYXRlbHksIGZvciB0aGUgTGluZSBwdWxsZG93bi5cbiAgICBoaWdoZXN0ID0gMDtcbiAgICAvLyBBVERhdGEuZXhpc3RpbmdMaW5lcyBpcyB0eXBlIHtpZDogbnVtYmVyOyBuOiBzdHJpbmc7fVtdXG4gICAgKEFURGF0YS5leGlzdGluZ0xpbmVzIHx8IFtdKS5ldmVyeSgobGluZTogYW55LCBpOiBudW1iZXIpOiBib29sZWFuID0+IHtcbiAgICAgICAgaWYgKGFzc2F5T3JMaW5lID09PSBsaW5lLm4pIHtcbiAgICAgICAgICAgIC8vIFRoZSBMaW5lIG5hbWUsIGNhc2Utc2Vuc2l0aXZlLCBpcyB0aGUgYmVzdCBtYXRjaFxuICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAgLy8gZG8gbm90IG5lZWQgdG8gY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC44ICYmIGFzc2F5T3JMaW5lLnRvTG93ZXJDYXNlKCkgPT09IGxpbmUubi50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgc2FtZSB0aGluZyBjYXNlLWluc2Vuc2l0aXZlIGlzIHNlY29uZCBiZXN0LlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuODtcbiAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC43ICYmIGFzc2F5T3JMaW5lLmluZGV4T2YobGluZS5uKSA+PSAwKSB7XG4gICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSBMaW5lIG5hbWUgd2l0aGluIHRoZSBzdHJpbmcgaXMgb2RkLCBidXQgZ29vZC5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjc7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNiAmJiBsaW5lLm4uaW5kZXhPZihhc3NheU9yTGluZSkgPj0gMCkge1xuICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgc3RyaW5nIHdpdGhpbiB0aGUgTGluZSBuYW1lIGlzIGFsc28gZ29vZC5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjY7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNSAmJiBjdXJyZW50SW5kZXggPT09IGkpIHtcbiAgICAgICAgICAgIC8vIEFnYWluLCBpZiBhbGwgZWxzZSBmYWlscywganVzdCBjaG9vc2UgdGhlIExpbmUgdGhhdCBtYXRjaGVzIHRoZSBjdXJyZW50IGluZGV4XG4gICAgICAgICAgICAvLyBpbiBzb3J0ZWQgb3JkZXIsIGluIGEgbG9vcC5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjU7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHNlbGVjdGlvbnM7XG59LFxuXG5cbmhpZ2hsaWdodGVyRjogKGU6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICB2YXIgY2VsbDogSlF1ZXJ5LCB4OiBudW1iZXIsIHk6IG51bWJlcjtcbiAgICAvLyBXYWxrIHVwIHRoZSBpdGVtIHRyZWUgdW50aWwgd2UgYXJyaXZlIGF0IGEgdGFibGUgY2VsbCxcbiAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgY2VsbCA9ICQoZS50YXJnZXQpLmNsb3Nlc3QoJ3RkJyk7XG4gICAgaWYgKGNlbGwubGVuZ3RoKSB7XG4gICAgICAgIHggPSBwYXJzZUludChjZWxsLmF0dHIoJ3gnKSwgMTApO1xuICAgICAgICB5ID0gcGFyc2VJbnQoY2VsbC5hdHRyKCd5JyksIDEwKTtcbiAgICAgICAgaWYgKHgpIHtcbiAgICAgICAgICAgICQoRUREQVRELlRhYmxlLmNvbE9iamVjdHNbeCAtIDFdKS50b2dnbGVDbGFzcygnaG92ZXJMaW5lcycsIGUudHlwZSA9PT0gJ21vdXNlb3ZlcicpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh5KSB7XG4gICAgICAgICAgICBjZWxsLmNsb3Nlc3QoJ3RyJykudG9nZ2xlQ2xhc3MoJ2hvdmVyTGluZXMnLCBlLnR5cGUgPT09ICdtb3VzZW92ZXInKTtcbiAgICAgICAgfVxuICAgIH1cbn0sXG5cblxuc2luZ2xlVmFsdWVEaXNhYmxlckY6IChlOiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgdmFyIGNlbGw6IEpRdWVyeSwgeDogbnVtYmVyLCB5OiBudW1iZXI7XG4gICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgLy8gc28gd2UgY2FuIGdldCB0aGUgaW5kZXggb2YgdGhlIHRhYmxlIGNlbGwgaW4gdGhlIHRhYmxlLlxuICAgIGNlbGwgPSAkKGUudGFyZ2V0KS5jbG9zZXN0KCd0ZCcpO1xuICAgIGlmIChjZWxsLmxlbmd0aCkge1xuICAgICAgICB4ID0gcGFyc2VJbnQoY2VsbC5hdHRyKCd4JyksIDEwKTtcbiAgICAgICAgeSA9IHBhcnNlSW50KGNlbGwuYXR0cigneScpLCAxMCk7XG4gICAgICAgIGlmICh4ICYmIHkgJiYgeCA+IDAgJiYgeSA+IDApIHtcbiAgICAgICAgICAgIC0teDtcbiAgICAgICAgICAgIC0teTtcbiAgICAgICAgICAgIGlmIChFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF0pIHtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF0gPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIEVEREFURC5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICAgICAgICAgIEVEREFURC5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgICAgICBFRERBVEQucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgICAgIH1cbiAgICB9XG59LFxuXG5cbmdlbmVyYXRlRm9ybVN1Ym1pc3Npb246ICgpOiB2b2lkID0+IHtcbiAgICB2YXIganNvbjogc3RyaW5nO1xuICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBkYXRhIHNldHMgb25lIG1vcmUgdGltZSwgcHVsbGluZyBvdXQgYW55IHZhbHVlcyBpbiB0aGUgcHVsbGRvd25zIGFuZFxuICAgIC8vIGF1dG9jb21wbGV0ZSBlbGVtZW50cyBpbiBTdGVwIDQgYW5kIGVtYmVkZGluZyB0aGVtIGluIHRoZWlyIHJlc3BlY3RpdmUgZGF0YSBzZXRzLlxuICAgIGpzb24gPSBKU09OLnN0cmluZ2lmeShFRERBVEQuU2V0cy5wYXJzZWRTZXRzKTtcbiAgICAkKCcjanNvbm91dHB1dCcpLnZhbChqc29uKTtcbiAgICAkKCcjanNvbmRlYnVnYXJlYScpLnZhbChqc29uKTtcbn0sXG5cblxuLy8gVGhpcyBoYW5kbGVzIGluc2VydGlvbiBvZiBhIHRhYiBpbnRvIHRoZSB0ZXh0YXJlYS5cbi8vIE1heSBiZSBnbGl0Y2h5Llxuc3VwcHJlc3NOb3JtYWxUYWI6IChlOiBKUXVlcnlLZXlFdmVudE9iamVjdCk6IGJvb2xlYW4gPT4ge1xuICAgIHZhciBpbnB1dDogSFRNTElucHV0RWxlbWVudCwgdGV4dDogc3RyaW5nO1xuICAgIGlmIChlLndoaWNoID09PSA5KSB7XG4gICAgICAgIGlucHV0ID0gPEhUTUxJbnB1dEVsZW1lbnQ+IGUudGFyZ2V0O1xuICAgICAgICB0ZXh0ID0gJChpbnB1dCkudmFsKCk7XG4gICAgICAgIC8vIHNldCB2YWx1ZSB0byBpdHNlbGYgd2l0aCBzZWxlY3Rpb24gcmVwbGFjZWQgYnkgYSB0YWIgY2hhcmFjdGVyXG4gICAgICAgICQoaW5wdXQpLnZhbChbXG4gICAgICAgICAgICB0ZXh0LnN1YnN0cmluZygwLCBpbnB1dC5zZWxlY3Rpb25TdGFydCksXG4gICAgICAgICAgICB0ZXh0LnN1YnN0cmluZyhpbnB1dC5zZWxlY3Rpb25FbmQpXG4gICAgICAgICAgICBdLmpvaW4oJ1xcdCcpKTtcbiAgICAgICAgLy8gcHV0IGNhcmV0IGF0IHJpZ2h0IHBvc2l0aW9uIGFnYWluXG4gICAgICAgIGlucHV0LnNlbGVjdGlvblN0YXJ0ID0gaW5wdXQuc2VsZWN0aW9uRW5kID0gaW5wdXQuc2VsZWN0aW9uU3RhcnQgKyAxO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufSxcblxuXG5wcmVwYXJlSXQ6ICgpOiB2b2lkID0+IHtcbiAgICB2YXIgcmVQcm9jZXNzT25DbGljazogc3RyaW5nW10sIHJlRG9MYXN0U3RlcE9uQ2hhbmdlOiBzdHJpbmdbXTtcbiAgICByZVByb2Nlc3NPbkNsaWNrID0gWycjc3RkbGF5b3V0JywgJyN0cmxheW91dCcsICcjcHJsYXlvdXQnLCAnI21kdmxheW91dCcsICcjcmF3ZGF0YWZvcm1hdHAnXTtcbiAgICByZURvTGFzdFN0ZXBPbkNoYW5nZSA9IFsnI21hc3RlckFzc2F5JywgJyNtYXN0ZXJMaW5lJywgJyNtYXN0ZXJNQ29tcCcsICcjbWFzdGVyTVR5cGUnLFxuICAgICAgICAgICAgJyNtYXN0ZXJNVW5pdHMnXTtcbiAgICAkKCcjdGV4dERhdGEnKVxuICAgICAgICAub24oJ3Bhc3RlJywgRUREQVRELnBhc3RlZFJhd0RhdGEpXG4gICAgICAgIC5vbigna2V5dXAnLCBFRERBVEQucGFyc2VBbmREaXNwbGF5VGV4dClcbiAgICAgICAgLm9uKCdrZXlkb3duJywgRUREQVRELnN1cHByZXNzTm9ybWFsVGFiKTtcbiAgICAkKCcjZGF0YVRhYmxlRGl2JylcbiAgICAgICAgLm9uKCdtb3VzZW92ZXIgbW91c2VvdXQnLCAndGQnLCBFRERBVEQuaGlnaGxpZ2h0ZXJGKVxuICAgICAgICAub24oJ2RibGNsaWNrJywgJ3RkJywgRUREQVRELnNpbmdsZVZhbHVlRGlzYWJsZXJGKTtcbiAgICAvLyBUaGlzIGlzIHJhdGhlciBhIGxvdCBvZiBjYWxsYmFja3MsIGJ1dCB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSdyZVxuICAgIC8vIHRyYWNraW5nIHRoZSBtaW5pbXVtIG51bWJlciBvZiBlbGVtZW50cyB3aXRoIHRoaXMgY2FsbCwgc2luY2UgdGhlXG4gICAgLy8gZnVuY3Rpb24gY2FsbGVkIGhhcyBzdWNoIHN0cm9uZyBlZmZlY3RzIG9uIHRoZSByZXN0IG9mIHRoZSBwYWdlLlxuICAgIC8vIEZvciBleGFtcGxlLCBhIHVzZXIgc2hvdWxkIGJlIGZyZWUgdG8gY2hhbmdlIFwibWVyZ2VcIiB0byBcInJlcGxhY2VcIiB3aXRob3V0IGhhdmluZ1xuICAgIC8vIHRoZWlyIGVkaXRzIGluIFN0ZXAgMiBlcmFzZWQuXG4gICAgJChcIiNtYXN0ZXJQcm90b2NvbFwiKS5jaGFuZ2UoRUREQVRELmNoYW5nZWRNYXN0ZXJQcm90b2NvbCk7XG4gICAgLy8gVXNpbmcgXCJjaGFuZ2VcIiBmb3IgdGhlc2UgYmVjYXVzZSBpdCdzIG1vcmUgZWZmaWNpZW50IEFORCBiZWNhdXNlIGl0IHdvcmtzIGFyb3VuZCBhblxuICAgIC8vIGlycml0YXRpbmcgQ2hyb21lIGluY29uc2lzdGVuY3lcbiAgICAvLyBGb3Igc29tZSBvZiB0aGVzZSwgY2hhbmdpbmcgdGhlbSBzaG91bGRuJ3QgYWN0dWFsbHkgYWZmZWN0IHByb2Nlc3NpbmcgdW50aWwgd2UgaW1wbGVtZW50XG4gICAgLy8gYW4gb3ZlcndyaXRlLWNoZWNraW5nIGZlYXR1cmUgb3Igc29tZXRoaW5nIHNpbWlsYXJcbiAgICAkKHJlUHJvY2Vzc09uQ2xpY2suam9pbignLCcpKS5vbignY2xpY2snLCBFRERBVEQucXVldWVQcm9jZXNzSW1wb3J0U2V0dGluZ3MpO1xuICAgICQocmVEb0xhc3RTdGVwT25DaGFuZ2Uuam9pbignLCcpKS5vbignY2hhbmdlJywgRUREQVRELmNoYW5nZWRBTWFzdGVyUHVsbGRvd24pO1xuICAgIC8vIGVuYWJsZSBhdXRvY29tcGxldGUgb24gc3RhdGljYWxseSBkZWZpbmVkIGZpZWxkc1xuICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSgnI21hc3Rlck1Db21wJywgJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnKTtcbiAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoJyNtYXN0ZXJNVHlwZScsICdHZW5lcmljT3JNZXRhYm9saXRlJywgRURERGF0YS5NZXRhYm9saXRlVHlwZXMgfHwge30pO1xuICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSgnI21hc3Rlck1Vbml0cycsICdNZWFzdXJlbWVudFVuaXQnKTtcbiAgICAkKCcjaWdub3JlR2FwcycpLmNsaWNrKEVEREFURC5jbGlja2VkT25JZ25vcmVEYXRhR2Fwcyk7XG4gICAgJCgnI3RyYW5zcG9zZScpLmNsaWNrKEVEREFURC5jbGlja2VkT25UcmFuc3Bvc2UpO1xuICAgIEVEREFURC5jaGFuZ2VkTWFzdGVyUHJvdG9jb2woKTsgLy8gIFNpbmNlIHRoZSBpbml0aWFsIG1hc3RlclByb3RvY29sIHZhbHVlIGlzIHplcm8sIHdlIG5lZWQgdG8gbWFudWFsbHkgdHJpZ2dlciB0aGlzOlxuICAgIEVEREFURC5xdWV1ZVByb2Nlc3NJbXBvcnRTZXR0aW5ncygpO1xufVxuXG59O1xuIl19