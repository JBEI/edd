// Compiled to JS on: Thu Feb 18 2016 16:47:14  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzYXlUYWJsZURhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvQXNzYXlUYWJsZURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsd0NBQXdDO0FBQ3hDLDRDQUE0QztBQW9CNUMsSUFBSSxNQUFVLENBQUM7QUFFZixNQUFNLEdBQUc7SUFFVCxvREFBb0Q7SUFDcEQsY0FBYyxFQUFDLENBQUM7SUFDaEIsNkNBQTZDO0lBQzdDLG1EQUFtRDtJQUNuRCxrQkFBa0IsRUFBQyxLQUFLO0lBQ3hCLDRCQUE0QixFQUFDLENBQUM7SUFFOUIsb0VBQW9FO0lBQ3BFLElBQUksRUFBQztRQUNELElBQUksRUFBQyxFQUFFO1FBQ1AsVUFBVSxFQUFDLEVBQUU7UUFDYixTQUFTLEVBQUUsS0FBSztRQUNoQixvRkFBb0Y7UUFDcEYsbUNBQW1DO1FBQ25DLHNCQUFzQixFQUFFLEtBQUs7UUFDN0IsK0VBQStFO1FBQy9FLG1DQUFtQztRQUNuQyxjQUFjLEVBQUUsS0FBSztRQUNyQiwyQkFBMkIsRUFBRSxLQUFLO0tBQ3JDO0lBRUQsOERBQThEO0lBQzlELEtBQUssRUFBQztRQUNGLGFBQWEsRUFBQyxFQUFFO1FBQ2hCLGdCQUFnQixFQUFDLEVBQUU7UUFDbkIsVUFBVSxFQUFDLEVBQUU7UUFDYixTQUFTLEVBQUMsRUFBRTtRQUVaLGtEQUFrRDtRQUNsRCxnRUFBZ0U7UUFDaEUsdUJBQXVCO1FBQ3ZCLGNBQWMsRUFBQyxFQUFFO1FBQ2pCLGNBQWMsRUFBQyxFQUFFO1FBQ2pCLFdBQVcsRUFBQyxFQUFFO1FBRWQsK0RBQStEO1FBQy9ELG1GQUFtRjtRQUNuRiwwQkFBMEI7UUFDMUIsZUFBZSxFQUFDLEVBQUU7UUFDbEIsZ0JBQWdCLEVBQUMsRUFBRTtRQUNuQixvRkFBb0Y7UUFDcEYsNEJBQTRCO1FBQzVCLHdCQUF3QixFQUFDLEVBQUU7S0FDOUI7SUFFRCxZQUFZLEVBQUMsQ0FBQztJQUNkLG1CQUFtQixFQUFDLENBQUM7SUFFckIsc0ZB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SyxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxxRkFBcUY7UUFDckgsTUFBTSxDQUFDLDBCQUEwQixFQUFFLENBQUM7SUFDeEMsQ0FBQztDQUVBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLy8gPHJlZmVyZW5jZSBwYXRoPVwibGliL2pxdWVyeS5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJFREREYXRhSW50ZXJmYWNlLnRzXCIgLz5cblxuZGVjbGFyZSB2YXIgQVREYXRhOmFueTsgLy8gU2V0dXAgYnkgdGhlIHNlcnZlci5cbmRlY2xhcmUgdmFyIEVEREFUREdyYXBoaW5nOmFueTtcbmRlY2xhcmUgdmFyIEVERF9hdXRvOmFueTtcblxuLy8gVHlwZSBuYW1lIGZvciB0aGUgZ3JpZCBvZiB2YWx1ZXMgcGFzdGVkIGluXG5pbnRlcmZhY2UgUmF3SW5wdXQgZXh0ZW5kcyBBcnJheTxzdHJpbmdbXT4ge31cbi8vIHR5cGUgZm9yIHRoZSBzdGF0cyBnZW5lcmF0ZWQgZnJvbSBwYXJzaW5nIGlucHV0IHRleHRcbmludGVyZmFjZSBSYXdJbnB1dFN0YXQge1xuICAgIGlucHV0OiBSYXdJbnB1dDtcbiAgICBjb2x1bW5zOiBudW1iZXI7XG59XG4vLyB0eXBlIGZvciB0aGUgb3B0aW9ucyBpbiByb3cgcHVsbGRvd25zXG4vLyBUT0RPIHVwZGF0ZSB0byB1c2UgdW5pb25zIHdoZW4gbWlncmF0aW5nIHRvIFR5cGVzY3JpcHQgMS40K1xuaW50ZXJmYWNlIFJvd1B1bGxkb3duT3B0aW9uIGV4dGVuZHMgQXJyYXk8YW55PiB7IC8vIEFycmF5PHN0cmluZ3xudW1iZXJ8Um93UHVsbGRvd25PcHRpb25bXT5cbiAgICAwOiBzdHJpbmc7XG4gICAgMTogYW55OyAvLyBudW1iZXIgfCBSb3dQdWxsZG93bk9wdGlvbltdXG59XG5cbnZhciBFRERBVEQ6YW55O1xuXG5FRERBVEQgPSB7XG5cbi8vIFRoZSBQcm90b2NvbCBmb3Igd2hpY2ggd2Ugd2lsbCBiZSBpbXBvcnRpbmcgZGF0YS5cbm1hc3RlclByb3RvY29sOjAsXG4vLyBUaGUgbWFpbiBtb2RlIHdlIGFyZSBpbnRlcnByZXRpbmcgZGF0YSBpbi5cbi8vIFZhbGlkIHZhbHVlcyBzb2ZhciBhcmUgXCJzdGRcIiwgXCJtZHZcIiwgXCJ0clwiLCBcInByXCIuXG5pbnRlcnByZXRhdGlvbk1vZGU6XCJzdGRcIixcbnByb2Nlc3NJbXBvcnRTZXR0aW5nc1RpbWVySUQ6MCxcblxuLy8gVXNlZCB0byBwYXJzZSB0aGUgU3RlcCAyIGRhdGEgaW50byBhIG51bGwtcGFkZGVkIHJlY3Rhbmd1bGFyIGdyaWRcbkdyaWQ6e1xuICAgIGRhdGE6W10sXG4gICAgcm93TWFya2VyczpbXSxcbiAgICB0cmFuc3Bvc2U6IGZhbHNlLFxuICAgIC8vIElmIHRoZSB1c2VyIGRlbGliZXJhdGVseSBjaG9zZSB0byB0cmFuc3Bvc2Ugb3Igbm90IHRyYW5zcG9zZSwgZGlzYWJsZSB0aGUgYXR0ZW1wdFxuICAgIC8vIHRvIGF1dG8tZGV0ZXJtaW5lIHRyYW5zcG9zaXRpb24uXG4gICAgdXNlckNsaWNrZWRPblRyYW5zcG9zZTogZmFsc2UsXG4gICAgLy8gV2hldGhlciB0byBpbnRlcnByZXQgdGhlIHBhc3RlZCBkYXRhIHJvdy13aXNlIG9yIGNvbHVtbi13aXNlLCB3aGVuIGltcG9ydGluZ1xuICAgIC8vIGVpdGhlciBtZWFzdXJlbWVudHMgb3IgbWV0YWRhdGEuXG4gICAgaWdub3JlRGF0YUdhcHM6IGZhbHNlLFxuICAgIHVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2FwczogZmFsc2Vcbn0sXG5cbi8vIFVzZWQgdG8gYXNzZW1ibGUgYW5kIGRpc3BsYXkgdGhlIHRhYmxlIGNvbXBvbmVudHMgaW4gU3RlcCAzXG5UYWJsZTp7XG4gICAgcm93TGFiZWxDZWxsczpbXSxcbiAgICBjb2xDaGVja2JveENlbGxzOltdLFxuICAgIGNvbE9iamVjdHM6W10sXG4gICAgZGF0YUNlbGxzOltdLFxuXG4gICAgLy8gV2Uga2VlcCBhIHNpbmdsZSBmbGFnIGZvciBlYWNoIGRhdGEgcG9pbnQgW3kseF1cbiAgICAvLyBhcyB3ZWxsIGFzIHR3byBsaW5lYXIgc2V0cyBvZiBmbGFncyBmb3IgZW5hYmxpbmcgb3IgZGlzYWJsaW5nXG4gICAgLy8gZW50aXJlIGNvbHVtbnMvcm93cy5cbiAgICBhY3RpdmVDb2xGbGFnczpbXSxcbiAgICBhY3RpdmVSb3dGbGFnczpbXSxcbiAgICBhY3RpdmVGbGFnczpbXSxcblxuICAgIC8vIEFycmF5cyBmb3IgdGhlIHB1bGxkb3duIG1lbnVzIG9uIHRoZSBsZWZ0IHNpZGUgb2YgdGhlIHRhYmxlLlxuICAgIC8vIFRoZXNlIHB1bGxkb3ducyBhcmUgdXNlZCB0byBzcGVjaWZ5IHRoZSBkYXRhIHR5cGUgLSBvciB0eXBlcyAtIGNvbnRhaW5lZCBpbiBlYWNoXG4gICAgLy8gcm93IG9mIHRoZSBwYXN0ZWQgZGF0YS5cbiAgICBwdWxsZG93bk9iamVjdHM6W10sXG4gICAgcHVsbGRvd25TZXR0aW5nczpbXSxcbiAgICAvLyBXZSBhbHNvIGtlZXAgYSBzZXQgb2YgZmxhZ3MgdG8gdHJhY2sgd2hldGhlciBhIHB1bGxkb3duIHdhcyBjaGFuZ2VkIGJ5IGEgdXNlciBhbmRcbiAgICAvLyB3aWxsIG5vdCBiZSByZWNhbGN1bGF0ZWQuXG4gICAgcHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzOltdXG59LFxuXG5ncmFwaEVuYWJsZWQ6MSxcbmdyYXBoUmVmcmVzaFRpbWVySUQ6MCxcblxuLy8gRGF0YSBzdHJ1Y3R1cmVzIHB1bGxlZCBmcm9tIHRoZSBncmlkIGFuZCBjb21wb3NlZCBpbnRvIHNldHMgc3VpdGFibGUgZm9yIGhhbmRpbmcgdG9cbi8vIHRoZSBFREQgc2VydmVyXG5TZXRzOntcbiAgICBwYXJzZWRTZXRzOltdLFxuICAgIHVuaXF1ZUxpbmVBc3NheU5hbWVzOltdLFxuICAgIHVuaXF1ZU1lYXN1cmVtZW50TmFtZXM6W10sXG4gICAgdW5pcXVlTWV0YWRhdGFOYW1lczpbXSxcbiAgICAvLyBBIGZsYWcgdG8gaW5kaWNhdGUgd2hldGhlciB3ZSBoYXZlIHNlZW4gYW55IHRpbWVzdGFtcHMgc3BlY2lmaWVkIGluIHRoZSBpbXBvcnQgZGF0YVxuICAgIHNlZW5BbnlUaW1lc3RhbXBzOiBmYWxzZVxufSxcblxuLy8gU3RvcmFnZSBhcmVhIGZvciBkaXNhbWJpZ3VhdGlvbi1yZWxhdGVkIFVJIHdpZGdldHMgYW5kIGluZm9ybWF0aW9uXG5EaXNhbTp7XG4gICAgLy8gVGhlc2Ugb2JqZWN0cyBob2xkIHN0cmluZyBrZXlzIHRoYXQgY29ycmVzcG9uZCB0byB1bmlxdWUgbmFtZXMgZm91bmQgZHVyaW5nIHBhcnNpbmcuXG4gICAgLy8gVGhlIHN0cmluZyBrZXlzIHBvaW50IHRvIGV4aXN0aW5nIGF1dG9jb21wbGV0ZSBvYmplY3RzIGNyZWF0ZWQgc3BlY2lmaWNhbGx5IGZvclxuICAgIC8vIHRob3NlIHN0cmluZ3MuIEFzIHRoZSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGlzIGRlc3Ryb3llZCBhbmQgcmVtYWRlLCBhbnkgc2VsZWN0aW9uc1xuICAgIC8vIHRoZSB1c2VyIGhhcyBhbHJlYWR5IHNldCB3aWxsIHBlcnNldmVyZS5cbiAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgQXNzYXlzL0xpbmVzXG4gICAgYXNzYXlMaW5lT2JqU2V0czp7fSxcbiAgICBjdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0czpbXSxcbiAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgbWVhc3VyZW1lbnQgdHlwZXNcbiAgICBtZWFzdXJlbWVudE9ialNldHM6e30sXG4gICAgY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0czpbXSxcbiAgICAvLyBGb3IgZGlzYW1idWd1YXRpbmcgbWV0YWRhdGFcbiAgICBtZXRhZGF0YU9ialNldHM6e30sXG4gICAgLy8gVG8gZ2l2ZSB1bmlxdWUgSUQgdmFsdWVzIHRvIGVhY2ggYXV0b2NvbXBsZXRlIGVudGl0eSB3ZSBjcmVhdGVcbiAgICBhdXRvQ29tcFVJRDowXG59LFxuXG5BdXRvQ2FjaGU6IHtcbiAgICBjb21wOiB7fSxcbiAgICBtZXRhOiB7fSxcbiAgICB1bml0OiB7fSxcbiAgICBtZXRhYm9saXRlOiB7fVxufSxcblxuXG5jaGFuZ2VkTWFzdGVyUHJvdG9jb2w6ICgpOnZvaWQgPT4ge1xuICAgIHZhciBwcm90b2NvbEluOkpRdWVyeSwgYXNzYXlJbjpKUXVlcnksIGN1cnJlbnRBc3NheXM6bnVtYmVyW107XG4gICAgLy8gY2hlY2sgbWFzdGVyIHByb3RvY29sXG4gICAgcHJvdG9jb2xJbiA9ICQoJyNtYXN0ZXJQcm90b2NvbCcpO1xuICAgIGlmIChwcm90b2NvbEluLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChFRERBVEQubWFzdGVyUHJvdG9jb2wgPT09IHBhcnNlSW50KHByb3RvY29sSW4udmFsKCksIDEwKSkge1xuICAgICAgICAvLyBubyBjaGFuZ2VcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBFRERBVEQubWFzdGVyUHJvdG9jb2wgPSBwYXJzZUludChwcm90b2NvbEluLnZhbCgpLCAxMCk7XG4gICAgLy8gY2hlY2sgZm9yIG1hc3RlciBhc3NheVxuICAgIGFzc2F5SW4gPSAkKCcjbWFzdGVyQXNzYXknKS5lbXB0eSgpO1xuICAgIGlmIChhc3NheUluLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgICQoJzxvcHRpb24+JykudGV4dCgnKENyZWF0ZSBOZXcpJykuYXBwZW5kVG8oYXNzYXlJbikudmFsKCduZXcnKS5wcm9wKCdzZWxlY3RlZCcsIHRydWUpO1xuICAgIGN1cnJlbnRBc3NheXMgPSBBVERhdGEuZXhpc3RpbmdBc3NheXNbcHJvdG9jb2xJbi52YWwoKV0gfHwgW107XG4gICAgY3VycmVudEFzc2F5cy5mb3JFYWNoKChpZDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpZF0sXG4gICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdLFxuICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAkKCc8b3B0aW9uPicpLmFwcGVuZFRvKGFzc2F5SW4pLnZhbCgnJyArIGlkKS50ZXh0KFtcbiAgICAgICAgICAgIGxpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZSBdLmpvaW4oJy0nKSk7XG4gICAgfSk7XG4gICAgaWYgKCQoJyNtYXN0ZXJMaW5lU3BhbicpLnJlbW92ZUNsYXNzKCdvZmYnKS5sZW5ndGggPiAwKSB7XG4gICAgICAgIEVEREFURC5xdWV1ZVByb2Nlc3NJbXBvcnRTZXR0aW5ncygpO1xuICAgIH1cbn0sXG5cblxucXVldWVQcm9jZXNzSW1wb3J0U2V0dGluZ3M6ICgpOnZvaWQgPT4ge1xuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlcGFyc2VzIHRoZSBpbXBvcnQgc2V0dGluZ3MuXG4gICAgLy8gVGhpcyB3YXkgd2UncmUgY2FsbGluZyB0aGUgcmVwYXJzZSBqdXN0IG9uY2UsIGV2ZW4gd2hlbiB3ZSBnZXQgbXVsdGlwbGUgY2FzY2FkZWRcbiAgICAvLyBldmVudHMgdGhhdCByZXF1aXJlIGl0LlxuICAgIGlmIChFRERBVEQucHJvY2Vzc0ltcG9ydFNldHRpbmdzVGltZXJJRCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoRUREQVRELnByb2Nlc3NJbXBvcnRTZXR0aW5nc1RpbWVySUQpO1xuICAgIH1cbiAgICBFRERBVEQucHJvY2Vzc0ltcG9ydFNldHRpbmdzVGltZXJJRCA9IHNldFRpbWVvdXQoRUREQVRELnByb2Nlc3NJbXBvcnRTZXR0aW5ncy5iaW5kKEVEREFURCksIDUpO1xufSxcblxuXG5wcm9jZXNzSW1wb3J0U2V0dGluZ3M6ICgpOnZvaWQgPT4ge1xuICAgIHZhciBzdGRMYXlvdXQ6SlF1ZXJ5LCB0ckxheW91dDpKUXVlcnksIHByTGF5b3V0OkpRdWVyeSwgbWR2TGF5b3V0OkpRdWVyeSwgaWdub3JlR2FwczpKUXVlcnksXG4gICAgICAgIHRyYW5zcG9zZTpKUXVlcnksIGdyYXBoOkpRdWVyeSwgcmF3Rm9ybWF0OkpRdWVyeTtcbiAgICBzdGRMYXlvdXQgPSAkKCcjc3RkbGF5b3V0Jyk7XG4gICAgdHJMYXlvdXQgPSAkKCcjdHJsYXlvdXQnKTtcbiAgICBwckxheW91dCA9ICQoJyNwcmxheW91dCcpO1xuICAgIG1kdkxheW91dCA9ICQoJyNtZHZsYXlvdXQnKTtcbiAgICBpZ25vcmVHYXBzID0gJCgnI2lnbm9yZUdhcHMnKTtcbiAgICB0cmFuc3Bvc2UgPSAkKCcjdHJhbnNwb3NlJyk7XG4gICAgZ3JhcGggPSAkKCcjZ3JhcGhEaXYnKTtcbiAgICByYXdGb3JtYXQgPSAkKCcjcmF3ZGF0YWZvcm1hdHAnKTtcbiAgICAvLyBhbGwgbmVlZCB0byBleGlzdCwgb3IgcGFnZSBpcyBicm9rZW5cbiAgICBpZiAoIVsgc3RkTGF5b3V0LCB0ckxheW91dCwgcHJMYXlvdXQsIG1kdkxheW91dCwgaWdub3JlR2FwcywgdHJhbnNwb3NlLCBncmFwaCwgcmF3Rm9ybWF0XG4gICAgICAgICAgICBdLmV2ZXJ5KChpdGVtKTpib29sZWFuID0+IGl0ZW0ubGVuZ3RoICE9PSAwKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHN0ZExheW91dC5wcm9wKCdjaGVja2VkJykpIHsgLy8gIFN0YW5kYXJkIGludGVycHJldGF0aW9uIG1vZGVcbiAgICAgICAgRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9ICdzdGQnO1xuICAgICAgICBncmFwaC5yZW1vdmVDbGFzcygnb2ZmJyk7ICAvLyBCeSBkZWZhdWx0IHdlIHdpbGwgYXR0ZW1wdCB0byBzaG93IGEgZ3JhcGhcbiAgICAgICAgRUREQVRELmdyYXBoRW5hYmxlZCA9IDE7XG4gICAgfSBlbHNlIGlmICh0ckxheW91dC5wcm9wKCdjaGVja2VkJykpIHsgICAvLyAgVHJhbnNjcmlwdG9taWNzIG1vZGVcbiAgICAgICAgRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9ICd0cic7XG4gICAgICAgIGdyYXBoLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgRUREQVRELmdyYXBoRW5hYmxlZCA9IDA7XG4gICAgfSBlbHNlIGlmIChwckxheW91dC5wcm9wKCdjaGVja2VkJykpIHsgICAvLyAgUHJvdGVvbWljcyBtb2RlXG4gICAgICAgIEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPSAncHInO1xuICAgICAgICBncmFwaC5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIEVEREFURC5ncmFwaEVuYWJsZWQgPSAwO1xuICAgIH0gZWxzZSBpZiAobWR2TGF5b3V0LnByb3AoJ2NoZWNrZWQnKSkgeyAgLy8gSkJFSSBNYXNzIERpc3RyaWJ1dGlvbiBWZWN0b3IgZm9ybWF0XG4gICAgICAgIEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPSAnbWR2JztcbiAgICAgICAgZ3JhcGguYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICBFRERBVEQuZ3JhcGhFbmFibGVkID0gMDtcbiAgICAgICAgLy8gV2UgbmVpdGhlciBpZ25vcmUgZ2Fwcywgbm9yIHRyYW5zcG9zZSwgZm9yIE1EViBkb2N1bWVudHNcbiAgICAgICAgaWdub3JlR2Fwcy5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICB0cmFuc3Bvc2UucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgLy8gSkJFSSBNRFYgZm9ybWF0IGRvY3VtZW50cyBhcmUgYWx3YXlzIHBhc3RlZCBpbiBmcm9tIEV4Y2VsLCBzbyB0aGV5J3JlIGFsd2F5cyB0YWItc2VwYXJhdGVkXG4gICAgICAgIHJhd0Zvcm1hdC52YWwoJ3RhYicpO1xuICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5ncyA9IFsxLCA1XTsgLy8gQSBkZWZhdWx0IHNldCBvZiBwdWxsZG93biBzZXR0aW5ncyBmb3IgdGhpcyBtb2RlXG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgbm9uZSBvZiB0aGVtIGFyZSBjaGVja2VkIC0gV1RGPyAgRG9uJ3QgcGFyc2Ugb3IgY2hhbmdlIGFueXRoaW5nLlxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIEVEREFURC5HcmlkLmlnbm9yZURhdGFHYXBzID0gaWdub3JlR2Fwcy5wcm9wKCdjaGVja2VkJyk7XG4gICAgRUREQVRELkdyaWQudHJhbnNwb3NlID0gdHJhbnNwb3NlLnByb3AoJ2NoZWNrZWQnKTtcbiAgICBFRERBVEQucGFyc2VBbmREaXNwbGF5VGV4dCgpO1xufSxcblxuXG4vLyBUaGlzIGdldHMgY2FsbGVkIHdoZW4gdGhlcmUgaXMgYSBwYXN0ZSBldmVudC5cbnBhc3RlZFJhd0RhdGE6ICgpOnZvaWQgPT4ge1xuICAgIC8vIFdlIGRvIHRoaXMgdXNpbmcgYSB0aW1lb3V0IHNvIHRoZSByZXN0IG9mIHRoZSBwYXN0ZSBldmVudHMgZmlyZSwgYW5kIGdldCB0aGUgcGFzdGVkIHJlc3VsdC5cbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKTp2b2lkID0+IHtcbiAgICAgICAgaWYgKEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgIT09IFwibWR2XCIpIHtcbiAgICAgICAgICAgIHZhciB0ZXh0OnN0cmluZyA9ICQoJyN0ZXh0RGF0YScpLnZhbCgpIHx8ICcnLCB0ZXN0OmJvb2xlYW47XG4gICAgICAgICAgICB0ZXN0ID0gdGV4dC5zcGxpdCgnXFx0JykubGVuZ3RoID49IHRleHQuc3BsaXQoJywnKS5sZW5ndGg7XG4gICAgICAgICAgICAkKCcjcmF3ZGF0YWZvcm1hdHAnKS52YWwodGVzdCA/ICd0YWInIDogJ2NzdicpO1xuICAgICAgICB9XG4gICAgfSwgMSk7XG59LFxuXG5cbnBhcnNlUmF3SW5wdXQ6IChkZWxpbWl0ZXI6IHN0cmluZywgbW9kZTogc3RyaW5nKTpSYXdJbnB1dFN0YXQgPT4ge1xuICAgIHZhciByYXdUZXh0OnN0cmluZywgbG9uZ2VzdFJvdzpudW1iZXIsIHJvd3M6UmF3SW5wdXQsIG11bHRpQ29sdW1uOmJvb2xlYW47XG4gICAgcmF3VGV4dCA9ICQoJyN0ZXh0RGF0YScpLnZhbCgpO1xuICAgIHJvd3MgPSBbXTtcbiAgICAvLyBmaW5kIHRoZSBoaWdoZXN0IG51bWJlciBvZiBjb2x1bW5zIGluIGEgcm93XG4gICAgbG9uZ2VzdFJvdyA9IHJhd1RleHQuc3BsaXQoL1sgXFxyXSpcXG4vKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCByYXdSb3c6IHN0cmluZyk6bnVtYmVyID0+IHtcbiAgICAgICAgdmFyIHJvdzpzdHJpbmdbXTtcbiAgICAgICAgaWYgKHJhd1JvdyAhPT0gJycpIHtcbiAgICAgICAgICAgIHJvdyA9IHJhd1Jvdy5zcGxpdChkZWxpbWl0ZXIpO1xuICAgICAgICAgICAgcm93cy5wdXNoKHJvdyk7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgcm93Lmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByZXY7XG4gICAgfSwgMCk7XG4gICAgLy8gcGFkIG91dCByb3dzIHNvIGl0IGlzIHJlY3Rhbmd1bGFyXG4gICAgaWYgKG1vZGUgPT09ICdzdGQnIHx8IG1vZGUgPT09ICd0cicgfHwgbW9kZSA9PT0gJ3ByJykge1xuICAgICAgICByb3dzLmZvckVhY2goKHJvdzpzdHJpbmdbXSk6dm9pZCA9PiB7XG4gICAgICAgICAgICB3aGlsZSAocm93Lmxlbmd0aCA8IGxvbmdlc3RSb3cpIHtcbiAgICAgICAgICAgICAgICByb3cucHVzaCgnJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICAnaW5wdXQnOiByb3dzLFxuICAgICAgICAnY29sdW1ucyc6IGxvbmdlc3RSb3dcbiAgICB9O1xufSxcblxuXG5pbmZlclRyYW5zcG9zZVNldHRpbmc6IChyb3dzOiBSYXdJbnB1dCk6IHZvaWQgPT4ge1xuICAgIC8vIFRoZSBtb3N0IHN0cmFpZ2h0Zm9yd2FyZCBtZXRob2QgaXMgdG8gdGFrZSB0aGUgdG9wIHJvdywgYW5kIHRoZSBmaXJzdCBjb2x1bW4sXG4gICAgLy8gYW5kIGFuYWx5emUgYm90aCB0byBzZWUgd2hpY2ggb25lIG1vc3QgbGlrZWx5IGNvbnRhaW5zIGEgcnVuIG9mIHRpbWVzdGFtcHMuXG4gICAgLy8gV2UnbGwgYWxzbyBkbyB0aGUgc2FtZSBmb3IgdGhlIHNlY29uZCByb3cgYW5kIHRoZSBzZWNvbmQgY29sdW1uLCBpbiBjYXNlIHRoZVxuICAgIC8vIHRpbWVzdGFtcHMgYXJlIHVuZGVybmVhdGggc29tZSBvdGhlciBoZWFkZXIuXG4gICAgdmFyIGFycmF5c1RvQW5hbHl6ZTogc3RyaW5nW11bXSwgYXJyYXlzU2NvcmVzOiBudW1iZXJbXSwgc2V0VHJhbnNwb3NlOiBib29sZWFuO1xuICAgIFxuICAgIC8vIE5vdGUgdGhhdCB3aXRoIGVtcHR5IG9yIHRvby1zbWFsbCBzb3VyY2UgZGF0YSwgdGhlc2UgYXJyYXlzIHdpbGwgZWl0aGVyIHJlbWFpblxuICAgIC8vIGVtcHR5LCBvciBiZWNvbWUgJ251bGwnXG4gICAgYXJyYXlzVG9BbmFseXplID0gW1xuICAgICAgICByb3dzWzBdIHx8IFtdLCAgIC8vIEZpcnN0IHJvd1xuICAgICAgICByb3dzWzFdIHx8IFtdLCAgIC8vIFNlY29uZCByb3dcbiAgICAgICAgKHJvd3MgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbMF0pLCAgIC8vIEZpcnN0IGNvbHVtblxuICAgICAgICAocm93cyB8fCBbXSkubWFwKChyb3c6IHN0cmluZ1tdKTogc3RyaW5nID0+IHJvd1sxXSkgICAgLy8gU2Vjb25kIGNvbHVtblxuICAgIF07XG4gICAgYXJyYXlzU2NvcmVzID0gYXJyYXlzVG9BbmFseXplLm1hcCgocm93OiBzdHJpbmdbXSwgaTogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgdmFyIHNjb3JlID0gMCwgcHJldjogbnVtYmVyLCBublByZXY6IG51bWJlcjtcbiAgICAgICAgaWYgKCFyb3cgfHwgcm93Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICAgICAgcHJldiA9IG5uUHJldiA9IHVuZGVmaW5lZDtcbiAgICAgICAgcm93LmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIGo6IG51bWJlciwgcjogc3RyaW5nW10pOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB0OiBudW1iZXI7XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0ID0gcGFyc2VGbG9hdCh2YWx1ZS5yZXBsYWNlKC8sL2csICcnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWlzTmFOKHQpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc05hTihwcmV2KSAmJiB0ID4gcHJldikge1xuICAgICAgICAgICAgICAgICAgICBzY29yZSArPSAyO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzTmFOKG5uUHJldikgJiYgdCA+IG5uUHJldikge1xuICAgICAgICAgICAgICAgICAgICBzY29yZSArPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBublByZXYgPSB0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJldiA9IHQ7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc2NvcmUgLyByb3cubGVuZ3RoO1xuICAgIH0pO1xuICAgIC8vIElmIHRoZSBmaXJzdCByb3cgYW5kIGNvbHVtbiBzY29yZWQgZGlmZmVyZW50bHksIGp1ZGdlIGJhc2VkIG9uIHRoZW0uXG4gICAgLy8gT25seSBpZiB0aGV5IHNjb3JlZCB0aGUgc2FtZSBkbyB3ZSBqdWRnZSBiYXNlZCBvbiB0aGUgc2Vjb25kIHJvdyBhbmQgc2Vjb25kIGNvbHVtbi5cbiAgICBpZiAoYXJyYXlzU2NvcmVzWzBdICE9PSBhcnJheXNTY29yZXNbMl0pIHtcbiAgICAgICAgc2V0VHJhbnNwb3NlID0gYXJyYXlzU2NvcmVzWzBdID4gYXJyYXlzU2NvcmVzWzJdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFRyYW5zcG9zZSA9IGFycmF5c1Njb3Jlc1sxXSA+IGFycmF5c1Njb3Jlc1szXTtcbiAgICB9XG4gICAgJCgnI3RyYW5zcG9zZScpLnByb3AoJ2NoZWNrZWQnLCBzZXRUcmFuc3Bvc2UpO1xuICAgIEVEREFURC5HcmlkLnRyYW5zcG9zZSA9IHNldFRyYW5zcG9zZTtcbn0sXG5cblxuaW5mZXJHYXBzU2V0dGluZzogKCk6IHZvaWQgPT4ge1xuICAgIC8vIENvdW50IHRoZSBudW1iZXIgb2YgYmxhbmsgdmFsdWVzIGF0IHRoZSBlbmQgb2YgZWFjaCBjb2x1bW5cbiAgICAvLyBDb3VudCB0aGUgbnVtYmVyIG9mIGJsYW5rIHZhbHVlcyBpbiBiZXR3ZWVuIG5vbi1ibGFuayBkYXRhXG4gICAgLy8gSWYgbW9yZSB0aGFuIHRocmVlIHRpbWVzIGFzIG1hbnkgYXMgYXQgdGhlIGVuZCwgZGVmYXVsdCB0byBpZ25vcmUgZ2Fwc1xuICAgIHZhciBpbnRyYTogbnVtYmVyID0gMCwgZXh0cmE6IG51bWJlciA9IDA7XG4gICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBub3ROdWxsOiBib29sZWFuID0gZmFsc2U7XG4gICAgICAgIC8vIGNvcHkgYW5kIHJldmVyc2UgdG8gbG9vcCBmcm9tIHRoZSBlbmRcbiAgICAgICAgcm93LnNsaWNlKDApLnJldmVyc2UoKS5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgbm90TnVsbCA/ICsrZXh0cmEgOiArK2ludHJhO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBub3ROdWxsID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgRUREQVRELkdyaWQuaWdub3JlRGF0YUdhcHMgPSBleHRyYSA+IChpbnRyYSAqIDMpO1xuICAgICQoJyNpZ25vcmVHYXBzJykucHJvcCgnY2hlY2tlZCcsIEVEREFURC5HcmlkLmlnbm9yZURhdGFHYXBzKTtcbn0sXG5cblxuaW5mZXJBY3RpdmVGbGFnczogKCk6IHZvaWQgPT4ge1xuICAgIC8vIEFuIGltcG9ydGFudCB0aGluZyB0byBub3RlIGhlcmUgaXMgdGhhdCB0aGlzIGRhdGEgaXMgaW4gW3ldW3hdIGZvcm1hdCAtXG4gICAgLy8gdGhhdCBpcywgaXQgZ29lcyBieSByb3csIHRoZW4gYnkgY29sdW1uLCB3aGVuIHJlZmVyZW5jaW5nLlxuICAgIC8vIFRoaXMgbWF0Y2hlcyBHcmlkLmRhdGEgYW5kIFRhYmxlLmRhdGFDZWxscy5cbiAgICB2YXIgeDogbnVtYmVyLCB5OiBudW1iZXI7XG4gICAgKEVEREFURC5HcmlkLmRhdGFbMF0gfHwgW10pLmZvckVhY2goKF8sIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW3hdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1t4XSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t5XSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldID0gRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldIHx8IFtdO1xuICAgICAgICByb3cuZm9yRWFjaCgoXywgeDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF0gPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn0sXG5cblxucHJvY2Vzc01kdjogKGlucHV0OiBSYXdJbnB1dCk6IHZvaWQgPT4ge1xuICAgIHZhciByb3dzOiBSYXdJbnB1dCwgY29sTGFiZWxzOiBzdHJpbmdbXSwgY29tcG91bmRzOiBhbnksIG9yZGVyZWRDb21wOiBzdHJpbmdbXTtcbiAgICByb3dzID0gaW5wdXQuc2xpY2UoMCk7IC8vIGNvcHlcbiAgICAvLyBJZiB0aGlzIHdvcmQgZnJhZ21lbnQgaXMgaW4gdGhlIGZpcnN0IHJvdywgZHJvcCB0aGUgd2hvbGUgcm93LlxuICAgIC8vIChJZ25vcmluZyBhIFEgb2YgdW5rbm93biBjYXBpdGFsaXphdGlvbilcbiAgICBpZiAocm93c1swXS5qb2luKCcnKS5tYXRjaCgvdWFudGl0YXRpb24vZykpIHtcbiAgICAgICAgcm93cy5zaGlmdCgpO1xuICAgIH1cbiAgICBjb21wb3VuZHMgPSB7fTtcbiAgICBvcmRlcmVkQ29tcCA9IFtdO1xuICAgIHJvd3MuZm9yRWFjaCgocm93OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgZmlyc3Q6IHN0cmluZywgbWFya2VkOiBzdHJpbmdbXSwgbmFtZTogc3RyaW5nLCBpbmRleDogbnVtYmVyO1xuICAgICAgICBmaXJzdCA9IHJvdy5zaGlmdCgpO1xuICAgICAgICAvLyBJZiB3ZSBoYXBwZW4gdG8gZW5jb3VudGVyIGFuIG9jY3VycmVuY2Ugb2YgYSByb3cgd2l0aCAnQ29tcG91bmQnIGluXG4gICAgICAgIC8vIHRoZSBmaXJzdCBjb2x1bW4sIHdlIHRyZWF0IGl0IGFzIGEgcm93IG9mIGNvbHVtbiBpZGVudGlmaWVycy5cbiAgICAgICAgaWYgKGZpcnN0ID09PSAnQ29tcG91bmQnKSB7XG4gICAgICAgICAgICBjb2xMYWJlbHMgPSByb3c7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbWFya2VkID0gZmlyc3Quc3BsaXQoJyBNID0gJyk7XG4gICAgICAgIGlmIChtYXJrZWQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBuYW1lID0gbWFya2VkWzBdO1xuICAgICAgICAgICAgaW5kZXggPSBwYXJzZUludChtYXJrZWRbMV0sIDEwKTtcbiAgICAgICAgICAgIGlmICghY29tcG91bmRzW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgY29tcG91bmRzW25hbWVdID0geyAnb3JpZ2luYWxSb3dzJzoge30sICdwcm9jZXNzZWRBc3NheUNvbHMnOiB7fSB9XG4gICAgICAgICAgICAgICAgb3JkZXJlZENvbXAucHVzaChuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbXBvdW5kc1tuYW1lXS5vcmlnaW5hbFJvd3NbaW5kZXhdID0gcm93LnNsaWNlKDApO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgJC5lYWNoKGNvbXBvdW5kcywgKG5hbWU6IHN0cmluZywgdmFsdWU6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgaW5kaWNlczogbnVtYmVyW107XG4gICAgICAgIC8vIEZpcnN0IGdhdGhlciB1cCBhbGwgdGhlIG1hcmtlciBpbmRleGVzIGdpdmVuIGZvciB0aGlzIGNvbXBvdW5kXG4gICAgICAgIGluZGljZXMgPSAkLm1hcCh2YWx1ZS5vcmlnaW5hbFJvd3MsIChfLCBpbmRleDogc3RyaW5nKTogbnVtYmVyID0+IHBhcnNlSW50KGluZGV4LCAxMCkpO1xuICAgICAgICBpbmRpY2VzLnNvcnQoKGEsIGIpID0+IGEgLSBiKTsgLy8gc29ydCBhc2NlbmRpbmdcbiAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIHNldCBvZiBjb2x1bW5MYWJlbHMgYWJvdmUsIGFzc2VtYmxpbmcgYSBtYXJraW5nIG51bWJlciBmb3IgZWFjaCxcbiAgICAgICAgLy8gYnkgZHJhd2luZyAtIGluIG9yZGVyIC0gZnJvbSB0aGlzIGNvbGxlY3RlZCByb3cgZGF0YS5cbiAgICAgICAgY29sTGFiZWxzLmZvckVhY2goKGxhYmVsOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBwYXJ0czogc3RyaW5nW10sIGFueUZsb2F0OiBib29sZWFuO1xuICAgICAgICAgICAgcGFydHMgPSBbXTtcbiAgICAgICAgICAgIGFueUZsb2F0ID0gZmFsc2U7XG4gICAgICAgICAgICBpbmRpY2VzLmZvckVhY2goKHJpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZ2luYWw6IHN0cmluZ1tdLCBjZWxsOiBzdHJpbmc7XG4gICAgICAgICAgICAgICAgb3JpZ2luYWwgPSB2YWx1ZS5vcmlnaW5hbFJvd3NbcmldO1xuICAgICAgICAgICAgICAgIGNlbGwgPSBvcmlnaW5hbFtpbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKGNlbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9IGNlbGwucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc05hTihwYXJzZUZsb2F0KGNlbGwpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFueUZsb2F0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCgnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGNlbGwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBBc3NlbWJsZWQgYSBmdWxsIGNhcmJvbiBtYXJrZXIgbnVtYmVyLCBncmFiIHRoZSBjb2x1bW4gbGFiZWwsIGFuZCBwbGFjZVxuICAgICAgICAgICAgLy8gdGhlIG1hcmtlciBpbiB0aGUgYXBwcm9wcmlhdGUgc2VjdGlvbi5cbiAgICAgICAgICAgIHZhbHVlLnByb2Nlc3NlZEFzc2F5Q29sc1tpbmRleF0gPSBwYXJ0cy5qb2luKCcvJyk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIC8vIFN0YXJ0IHRoZSBzZXQgb2Ygcm93IG1hcmtlcnMgd2l0aCBhIGdlbmVyaWMgbGFiZWxcbiAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzID0gWydBc3NheSddO1xuICAgIC8vIFRoZSBmaXJzdCByb3cgaXMgb3VyIGxhYmVsIGNvbGxlY3Rpb25cbiAgICBFRERBVEQuR3JpZC5kYXRhWzBdID0gY29sTGFiZWxzLnNsaWNlKDApO1xuICAgIC8vIHB1c2ggdGhlIHJlc3Qgb2YgdGhlIHJvd3MgZ2VuZXJhdGVkIGZyb20gb3JkZXJlZCBsaXN0IG9mIGNvbXBvdW5kc1xuICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KFxuICAgICAgICBFRERBVEQuR3JpZC5kYXRhLFxuICAgICAgICBvcmRlcmVkQ29tcC5tYXAoKG5hbWU6IHN0cmluZyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgIHZhciBjb21wb3VuZDogYW55LCByb3c6IHN0cmluZ1tdLCBjb2xMb29rdXA6IGFueTtcbiAgICAgICAgICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMucHVzaChuYW1lKTtcbiAgICAgICAgICAgIGNvbXBvdW5kID0gY29tcG91bmRzW25hbWVdO1xuICAgICAgICAgICAgcm93ID0gW107XG4gICAgICAgICAgICBjb2xMb29rdXAgPSBjb21wb3VuZC5wcm9jZXNzZWRBc3NheUNvbHM7XG4gICAgICAgICAgICAvLyBnZW5lcmF0ZSByb3cgY2VsbHMgYnkgbWFwcGluZyBjb2x1bW4gbGFiZWxzIHRvIHByb2Nlc3NlZCBjb2x1bW5zXG4gICAgICAgICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShyb3csXG4gICAgICAgICAgICAgICAgY29sTGFiZWxzLm1hcCgoXywgaW5kZXg6IG51bWJlcik6IHN0cmluZyA9PiBjb2xMb29rdXBbaW5kZXhdIHx8ICcnKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4gcm93O1xuICAgICAgICB9KVxuICAgICk7XG59LFxuXG5cbi8vIEEgcmVjdXJzaXZlIGZ1bmN0aW9uIHRvIHBvcHVsYXRlIGEgcHVsbGRvd24gd2l0aCBvcHRpb25hbCBvcHRpb25ncm91cHMsXG4vLyBhbmQgYSBkZWZhdWx0IHNlbGVjdGlvblxucG9wdWxhdGVQdWxsZG93bjogKHNlbGVjdDogSlF1ZXJ5LCBvcHRpb25zOiBSb3dQdWxsZG93bk9wdGlvbltdLCB2YWx1ZTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgb3B0aW9ucy5mb3JFYWNoKChvcHRpb246IFJvd1B1bGxkb3duT3B0aW9uKTogdm9pZCA9PiB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9uWzFdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KG9wdGlvblswXSkudmFsKG9wdGlvblsxXSlcbiAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBvcHRpb25bMV0gPT09IHZhbHVlKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhzZWxlY3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgRUREQVRELnBvcHVsYXRlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgJCgnPG9wdGdyb3VwPicpLmF0dHIoJ2xhYmVsJywgb3B0aW9uWzBdKS5hcHBlbmRUbyhzZWxlY3QpLFxuICAgICAgICAgICAgICAgIG9wdGlvblsxXSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgfSk7XG59LFxuXG5cbmNvbnN0cnVjdERhdGFUYWJsZTogKG1vZGU6c3RyaW5nKTp2b2lkID0+IHtcbiAgICB2YXIgY29udHJvbENvbHM6IHN0cmluZ1tdLCBwdWxsZG93bk9wdGlvbnM6IGFueVtdLFxuICAgICAgICB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgY29sZ3JvdXA6SlF1ZXJ5LCBib2R5OiBIVE1MVGFibGVFbGVtZW50LFxuICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQ7XG5cbiAgICBFRERBVEQuVGFibGUuZGF0YUNlbGxzID0gW107XG4gICAgRUREQVRELlRhYmxlLmNvbENoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICBFRERBVEQuVGFibGUuY29sT2JqZWN0cyA9IFtdO1xuICAgIEVEREFURC5UYWJsZS5yb3dMYWJlbENlbGxzID0gW107XG4gICAgRUREQVRELlRhYmxlLnJvd0NoZWNrYm94Q2VsbHMgPSBbXTtcbiAgICBjb250cm9sQ29scyA9IFsnY2hlY2tib3gnLCAncHVsbGRvd24nLCAnbGFiZWwnXTtcbiAgICBpZiAobW9kZSA9PT0gJ3RyJykge1xuICAgICAgICBwdWxsZG93bk9wdGlvbnMgPSBbXG4gICAgICAgICAgICBbJy0tJywgMF0sXG4gICAgICAgICAgICBbJ0VudGlyZSBSb3cgSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgWydHZW5lIE5hbWVzJywgMTBdLFxuICAgICAgICAgICAgICAgIFsnUlBLTSBWYWx1ZXMnLCAxMV1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF1cbiAgICAgICAgXTtcbiAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICdwcicpIHtcbiAgICAgICAgcHVsbGRvd25PcHRpb25zID0gW1xuICAgICAgICAgICAgWyctLScsIDBdLFxuICAgICAgICAgICAgWydFbnRpcmUgUm93IElzLi4uJywgW1xuICAgICAgICAgICAgICAgIFsnQXNzYXkvTGluZSBOYW1lcycsIDFdLFxuICAgICAgICAgICAgXVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFsnRmlyc3QgQ29sdW1uIElzLi4uJywgW1xuICAgICAgICAgICAgICAgIFsnUHJvdGVpbiBOYW1lJywgMTJdXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBdXG4gICAgICAgIF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcHVsbGRvd25PcHRpb25zID0gW1xuICAgICAgICAgICAgWyctLScsIDBdLFxuICAgICAgICAgICAgWydFbnRpcmUgUm93IElzLi4uJywgW1xuICAgICAgICAgICAgICAgIFsnQXNzYXkvTGluZSBOYW1lcycsIDFdLFxuICAgICAgICAgICAgICAgIFsnTWV0YWJvbGl0ZSBOYW1lcycsIDJdXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgWydGaXJzdCBDb2x1bW4gSXMuLi4nLCBbXG4gICAgICAgICAgICAgICAgWydUaW1lc3RhbXAnLCAzXSxcbiAgICAgICAgICAgICAgICBbJ01ldGFkYXRhIE5hbWUnLCA0XSxcbiAgICAgICAgICAgICAgICBbJ01ldGFib2xpdGUgTmFtZScsIDVdXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBdXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGFuZCByZXBsYWNlIHRoZSB0YWJsZSBpbiB0aGUgZG9jdW1lbnRcbiAgICAvLyBhdHRhY2ggYWxsIGV2ZW50IGhhbmRsZXJzIHRvIHRoZSB0YWJsZSBpdHNlbGZcbiAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGFibGU+JykuYXR0cignY2VsbHNwYWNpbmcnLCAnMCcpXG4gICAgICAgIC5hcHBlbmRUbygkKCcjZGF0YVRhYmxlRGl2JykuZW1wdHkoKSlcbiAgICAgICAgLm9uKCdjbGljaycsICdbbmFtZT1lbmFibGVDb2x1bW5dJywgKGV2OiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICBFRERBVEQudG9nZ2xlVGFibGVDb2x1bW4oZXYudGFyZ2V0KTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJ1tuYW1lPWVuYWJsZVJvd10nLCAoZXY6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIEVEREFURC50b2dnbGVUYWJsZVJvdyhldi50YXJnZXQpO1xuICAgICAgICB9KS5vbignY2hhbmdlJywgJy5wdWxsZG93bkNlbGwgPiBzZWxlY3QnLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIHZhciB0YXJnOiBKUXVlcnkgPSAkKGV2LnRhcmdldCk7XG4gICAgICAgICAgICBFRERBVEQuY2hhbmdlZFJvd0RhdGFUeXBlUHVsbGRvd24oXG4gICAgICAgICAgICAgICAgcGFyc2VJbnQodGFyZy5hdHRyKCdpJyksIDEwKSwgcGFyc2VJbnQodGFyZy52YWwoKSwgMTApKTtcbiAgICAgICAgfSlbMF07XG4gICAgLy8gT25lIG9mIHRoZSBvYmplY3RzIGhlcmUgd2lsbCBiZSBhIGNvbHVtbiBncm91cCwgd2l0aCBjb2wgb2JqZWN0cyBpbiBpdC5cbiAgICAvLyBUaGlzIGlzIGFuIGludGVyZXN0aW5nIHR3aXN0IG9uIERPTSBiZWhhdmlvciB0aGF0IHlvdSBzaG91bGQgcHJvYmFibHkgZ29vZ2xlLlxuICAgIGNvbGdyb3VwID0gJCgnPGNvbGdyb3VwPicpLmFwcGVuZFRvKHRhYmxlKTtcbiAgICBib2R5ID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0Ym9keT4nKS5hcHBlbmRUbyh0YWJsZSlbMF07XG4gICAgLy8gU3RhcnQgd2l0aCB0aHJlZSBjb2x1bW5zLCBmb3IgdGhlIGNoZWNrYm94ZXMsIHB1bGxkb3ducywgYW5kIGxhYmVscy5cbiAgICAvLyAoVGhlc2Ugd2lsbCBub3QgYmUgdHJhY2tlZCBpbiBUYWJsZS5jb2xPYmplY3RzLilcbiAgICBjb250cm9sQ29scy5mb3JFYWNoKCgpOnZvaWQgPT4ge1xuICAgICAgICAkKCc8Y29sPicpLmFwcGVuZFRvKGNvbGdyb3VwKTtcbiAgICB9KTtcbiAgICAvLyBhZGQgY29sIGVsZW1lbnRzIGZvciBlYWNoIGRhdGEgY29sdW1uXG4gICAgKEVEREFURC5HcmlkLmRhdGFbMF0gfHwgW10pLmZvckVhY2goKCk6IHZvaWQgPT4ge1xuICAgICAgICBFRERBVEQuVGFibGUuY29sT2JqZWN0cy5wdXNoKCQoJzxjb2w+JykuYXBwZW5kVG8oY29sZ3JvdXApWzBdKTtcbiAgICB9KTtcbiAgICAvLyBGaXJzdCByb3c6IHNwYWNlciBjZWxscywgZm9sbG93ZWQgYnkgY2hlY2tib3ggY2VsbHMgZm9yIGVhY2ggZGF0YSBjb2x1bW5cbiAgICByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD4gYm9keS5pbnNlcnRSb3coKTtcbiAgICAvLyBzcGFjZXIgY2VsbHMgaGF2ZSB4IGFuZCB5IHNldCB0byAwIHRvIHJlbW92ZSBmcm9tIGhpZ2hsaWdodCBncmlkXG4gICAgY29udHJvbENvbHMuZm9yRWFjaCgoKTogdm9pZCA9PiB7XG4gICAgICAgICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7ICd4JzogJzAnLCAneSc6IDAgfSk7XG4gICAgfSk7XG4gICAgKEVEREFURC5HcmlkLmRhdGFbMF0gfHwgW10pLmZvckVhY2goKF8sIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgY2VsbDogSlF1ZXJ5LCBib3g6IEpRdWVyeTtcbiAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7ICdpZCc6ICdjb2xDQkNlbGwnICsgaSwgJ3gnOiAxICsgaSwgJ3knOiAwIH0pXG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ2NoZWNrQm94Q2VsbCcpO1xuICAgICAgICBib3ggPSAkKCc8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIvPicpLmFwcGVuZFRvKGNlbGwpXG4gICAgICAgICAgICAudmFsKGkudG9TdHJpbmcoKSlcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2VuYWJsZUNvbHVtbicgKyBpLCAnbmFtZSc6ICdlbmFibGVDb2x1bW4nIH0pXG4gICAgICAgICAgICAucHJvcCgnY2hlY2tlZCcsIEVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1tpXSk7XG4gICAgICAgIEVEREFURC5UYWJsZS5jb2xDaGVja2JveENlbGxzLnB1c2goY2VsbFswXSk7XG4gICAgfSk7XG4gICAgRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0cyA9IFtdOyAgLy8gV2UgZG9uJ3Qgd2FudCBhbnkgbGluZ2VyaW5nIG9sZCBvYmplY3RzIGluIHRoaXNcbiAgICAvLyBUaGUgcmVzdCBvZiB0aGUgcm93czogQSBwdWxsZG93biwgYSBjaGVja2JveCwgYSByb3cgbGFiZWwsIGFuZCBhIHJvdyBvZiBkYXRhLlxuICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgodmFsdWVzOiBzdHJpbmdbXSwgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBjZWxsOiBKUXVlcnk7XG4gICAgICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PiBib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAvLyBjaGVja2JveCBjZWxsXG4gICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdjaGVja0JveENlbGwnKVxuICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAncm93Q0JDZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMSB9KTtcbiAgICAgICAgJCgnPGlucHV0IHR5cGU9XCJjaGVja2JveFwiLz4nKVxuICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZW5hYmxlUm93JyArIGksICduYW1lJzogJ2VuYWJsZVJvdycsIH0pXG4gICAgICAgICAgICAudmFsKGkudG9TdHJpbmcoKSlcbiAgICAgICAgICAgIC5wcm9wKCdjaGVja2VkJywgRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW2ldKVxuICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICBFRERBVEQuVGFibGUucm93Q2hlY2tib3hDZWxscy5wdXNoKGNlbGxbMF0pO1xuICAgICAgICAvLyBwdWxsZG93biBjZWxsXG4gICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdwdWxsZG93bkNlbGwnKVxuICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAncm93UENlbGwnICsgaSwgJ3gnOiAwLCAneSc6IGkgKyAxIH0pO1xuICAgICAgICAvLyB1c2UgZXhpc3Rpbmcgc2V0dGluZywgb3IgdXNlIHRoZSBsYXN0IGlmIHJvd3MubGVuZ3RoID4gc2V0dGluZ3MubGVuZ3RoLCBvciBibGFua1xuICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSA9IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldXG4gICAgICAgICAgICAgICAgfHwgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3Muc2xpY2UoLTEpWzBdIHx8IDBcbiAgICAgICAgRUREQVRELnBvcHVsYXRlUHVsbGRvd24oXG4gICAgICAgICAgICBjZWxsID0gJCgnPHNlbGVjdD4nKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ3JvdycgKyBpICsgJ3R5cGUnLCAnbmFtZSc6ICdyb3cnICsgaSArICd0eXBlJywgJ2knOiBpIH0pXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpLFxuICAgICAgICAgICAgcHVsbGRvd25PcHRpb25zLFxuICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV1cbiAgICAgICAgKTtcbiAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0cy5wdXNoKGNlbGxbMF0pO1xuICAgICAgICAvLyBsYWJlbCBjZWxsXG4gICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoeyAnaWQnOiAncm93TUNlbGwnICsgaSwgJ3gnOiAwLCAneSc6IGkgKyAxIH0pO1xuICAgICAgICAkKCc8ZGl2PicpLnRleHQoRUREQVRELkdyaWQucm93TWFya2Vyc1tpXSkuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgIEVEREFURC5UYWJsZS5yb3dMYWJlbENlbGxzLnB1c2goY2VsbFswXSk7XG4gICAgICAgIC8vIHRoZSB0YWJsZSBkYXRhIGl0c2VsZlxuICAgICAgICBFRERBVEQuVGFibGUuZGF0YUNlbGxzW2ldID0gW107XG4gICAgICAgIHZhbHVlcy5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBzaG9ydDogc3RyaW5nO1xuICAgICAgICAgICAgdmFsdWUgPSBzaG9ydCA9IHZhbHVlIHx8ICcnO1xuICAgICAgICAgICAgaWYgKHZhbHVlLmxlbmd0aCA+IDMyKSB7XG4gICAgICAgICAgICAgICAgc2hvcnQgPSB2YWx1ZS5zdWJzdHIoMCwgMzEpICsgJ+KApic7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hdHRyKHtcbiAgICAgICAgICAgICAgICAnaWQnOiAndmFsQ2VsbCcgKyB4ICsgJy0nICsgaSxcbiAgICAgICAgICAgICAgICAneCc6IHggKyAxLFxuICAgICAgICAgICAgICAgICd5JzogaSArIDEsXG4gICAgICAgICAgICAgICAgJ3RpdGxlJzogdmFsdWUsXG4gICAgICAgICAgICAgICAgJ2lzYmxhbmsnOiB2YWx1ZSA9PT0gJycgPyAxIDogdW5kZWZpbmVkXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChzaG9ydCkuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICBFRERBVEQuVGFibGUuZGF0YUNlbGxzW2ldLnB1c2goY2VsbFswXSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIEVEREFURC5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nKCk7XG59LFxuXG5cbnBhcnNlQW5kRGlzcGxheVRleHQ6ICgpOiB2b2lkID0+IHtcbiAgICB2YXIgbW9kZTpzdHJpbmcsIGRlbGltaXRlcjpzdHJpbmcsIHJhd0Zvcm1hdDpKUXVlcnksIGlucHV0OlJhd0lucHV0U3RhdDtcbiAgICBtb2RlID0gRUREQVRELmludGVycHJldGF0aW9uTW9kZTtcbiAgICBkZWxpbWl0ZXIgPSAnXFx0JztcbiAgICBFRERBVEQuR3JpZC5kYXRhID0gW107XG4gICAgRUREQVRELkdyaWQucm93TWFya2VycyA9IFtdO1xuICAgIHJhd0Zvcm1hdCA9ICQoJyNyYXdkYXRhZm9ybWF0cCcpO1xuICAgIGlmIChyYXdGb3JtYXQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQ2FuJ3QgZmluZCBkYXRhIGZvcm1hdCBwdWxsZG93blwiKVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIElmIHdlJ3JlIGluIFwibWR2XCIgbW9kZSwgbG9jayB0aGUgZGVsaW1pdGVyIHRvIHRhYnNcbiAgICBpZiAobW9kZSA9PT0gJ21kdicpIHtcbiAgICAgICAgcmF3Rm9ybWF0LnZhbCgndGFiJyk7XG4gICAgfVxuICAgIGlmIChyYXdGb3JtYXQudmFsKCkgPT09ICdjc3YnKSB7XG4gICAgICAgIGRlbGltaXRlciA9ICcsJztcbiAgICB9XG4gICAgaW5wdXQgPSBFRERBVEQucGFyc2VSYXdJbnB1dChkZWxpbWl0ZXIsIG1vZGUpO1xuXG4gICAgaWYgKG1vZGUgPT09ICdzdGQnIHx8IG1vZGUgPT09ICd0cicgfHwgbW9kZSA9PT0gJ3ByJykge1xuICAgICAgICAvLyBJZiB0aGUgdXNlciBoYXNuJ3QgZGVsaWJlcmF0ZWx5IGNob3NlbiBhIHNldHRpbmcgZm9yICd0cmFuc3Bvc2UnLCB3ZSB3aWxsIGRvXG4gICAgICAgIC8vIHNvbWUgYW5hbHlzaXMgdG8gYXR0ZW1wdCB0byBndWVzcyB3aGljaCBvcmllbnRhdGlvbiB0aGUgZGF0YSBuZWVkcyB0byBoYXZlLlxuICAgICAgICBpZiAoIUVEREFURC5HcmlkLnVzZXJDbGlja2VkT25UcmFuc3Bvc2UpIHtcbiAgICAgICAgICAgIEVEREFURC5pbmZlclRyYW5zcG9zZVNldHRpbmcoaW5wdXQuaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdyB0aGF0IHRoYXQncyBkb25lLCBtb3ZlIHRoZSBkYXRhIGludG8gR3JpZC5kYXRhXG4gICAgICAgIGlmIChFRERBVEQuR3JpZC50cmFuc3Bvc2UpIHtcbiAgICAgICAgICAgIC8vIGZpcnN0IHJvdyBiZWNvbWVzIFktbWFya2VycyBhcy1pc1xuICAgICAgICAgICAgRUREQVRELkdyaWQucm93TWFya2VycyA9IGlucHV0LmlucHV0LnNoaWZ0KCkgfHwgW107XG4gICAgICAgICAgICBFRERBVEQuR3JpZC5kYXRhID0gKGlucHV0LmlucHV0WzBdIHx8IFtdKS5tYXAoKF8sIGk6IG51bWJlcik6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5wdXQuaW5wdXQubWFwKChyb3c6IHN0cmluZ1tdKTogc3RyaW5nID0+IHJvd1tpXSB8fCAnJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMgPSBbXTtcbiAgICAgICAgICAgIEVEREFURC5HcmlkLmRhdGEgPSAoaW5wdXQuaW5wdXQgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgICAgICAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzLnB1c2gocm93LnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgIHJldHVybiByb3c7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGUgdXNlciBoYXNuJ3QgZGVsaWJlcmF0ZWx5IGNob3NlbiB0byBpZ25vcmUsIG9yIGFjY2VwdCwgZ2FwcyBpbiB0aGUgZGF0YSxcbiAgICAgICAgLy8gZG8gYSBiYXNpYyBhbmFseXNpcyB0byBndWVzcyB3aGljaCBzZXR0aW5nIG1ha2VzIG1vcmUgc2Vuc2UuXG4gICAgICAgIGlmICghRUREQVRELkdyaWQudXNlckNsaWNrZWRPbklnbm9yZURhdGFHYXBzKSB7XG4gICAgICAgICAgICBFRERBVEQuaW5mZXJHYXBzU2V0dGluZygpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEdpdmUgbGFiZWxzIHRvIGFueSBoZWFkZXIgcG9zaXRpb25zIHRoYXQgZ290ICdudWxsJyBmb3IgYSB2YWx1ZS5cbiAgICAgICAgRUREQVRELkdyaWQucm93TWFya2VycyA9IEVEREFURC5HcmlkLnJvd01hcmtlcnMubWFwKCh2YWx1ZTogc3RyaW5nKSA9PiB2YWx1ZSB8fCAnPycpO1xuICAgICAgICAvLyBBdHRlbXB0IHRvIGF1dG8tc2V0IGFueSB0eXBlIHB1bGxkb3ducyB0aGF0IGhhdmVuJ3QgYmVlbiBkZWxpYmVyYXRlbHkgc2V0IGJ5IHRoZSB1c2VyXG4gICAgICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgdHlwZTogYW55O1xuICAgICAgICAgICAgaWYgKCFFRERBVEQuVGFibGUucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzW2ldKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9IEVEREFURC5maWd1cmVPdXRUaGlzUm93c0RhdGFUeXBlKHZhbHVlLCBFRERBVEQuR3JpZC5kYXRhW2ldIHx8IFtdKTtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSA9IHR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIC8vIFdlIG1lZWQgYXQgbGVhc3QgMiByb3dzIGFuZCBjb2x1bW5zIGZvciBNRFYgZm9ybWF0IHRvIG1ha2UgYW55IHNlbnNlXG4gICAgfSBlbHNlIGlmICgobW9kZSA9PT0gXCJtZHZcIikgJiYgKGlucHV0LmlucHV0Lmxlbmd0aCA+IDEpICYmIChpbnB1dC5jb2x1bW5zID4gMSkpIHtcbiAgICAgICAgRUREQVRELnByb2Nlc3NNZHYoaW5wdXQuaW5wdXQpO1xuICAgIH1cbiAgICAvLyBDcmVhdGUgYSBtYXAgb2YgZW5hYmxlZC9kaXNhYmxlZCBmbGFncyBmb3Igb3VyIGRhdGEsXG4gICAgLy8gYnV0IG9ubHkgZmlsbCB0aGUgYXJlYXMgdGhhdCBkbyBub3QgYWxyZWFkeSBleGlzdC5cbiAgICBFRERBVEQuaW5mZXJBY3RpdmVGbGFncygpO1xuICAgIC8vIENvbnN0cnVjdCB0YWJsZSBjZWxsIG9iamVjdHMgZm9yIHRoZSBwYWdlLCBiYXNlZCBvbiBvdXIgZXh0cmFjdGVkIGRhdGFcbiAgICBFRERBVEQuY29uc3RydWN0RGF0YVRhYmxlKG1vZGUpO1xuICAgIC8vIEludGVycHJldCB0aGUgZGF0YSBpbiBTdGVwIDMsXG4gICAgLy8gd2hpY2ggaW52b2x2ZXMgc2tpcHBpbmcgZGlzYWJsZWQgcm93cyBvciBjb2x1bW5zLFxuICAgIC8vIG9wdGlvbmFsbHkgaWdub3JpbmcgYmxhbmsgdmFsdWVzLFxuICAgIC8vIGFuZCBsZWF2aW5nIG91dCBhbnkgdmFsdWVzIHRoYXQgaGF2ZSBiZWVuIGluZGl2aWR1YWxseSBmbGFnZ2VkLlxuICAgIEVEREFURC5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICAvLyBTdGFydCBhIGRlbGF5IHRpbWVyIHRoYXQgcmVkcmF3cyB0aGUgZ3JhcGggZnJvbSB0aGUgaW50ZXJwcmV0ZWQgZGF0YS5cbiAgICAvLyBUaGlzIGlzIHJhdGhlciByZXNvdXJjZSBpbnRlbnNpdmUsIHNvIHdlJ3JlIGRlbGF5aW5nIGEgYml0LCBhbmQgcmVzdGFydGluZyB0aGUgZGVsYXlcbiAgICAvLyBpZiB0aGUgdXNlciBtYWtlcyBhZGRpdGlvbmFsIGVkaXRzIHRvIHRoZSBkYXRhIHdpdGhpbiB0aGUgZGVsYXkgcGVyaW9kLlxuICAgIEVEREFURC5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgLy8gVXBkYXRlIHRoZSBzdHlsZXMgb2YgdGhlIG5ldyB0YWJsZSB0byByZWZsZWN0IHRoZVxuICAgIC8vIChwb3NzaWJseSBwcmV2aW91c2x5IHNldCkgZmxhZyBtYXJrZXJzIGFuZCB0aGUgXCJpZ25vcmUgZ2Fwc1wiIHNldHRpbmcuXG4gICAgRUREQVRELnJlZHJhd0lnbm9yZWRWYWx1ZU1hcmtlcnMoKTtcbiAgICBFRERBVEQucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgLy8gTm93IHRoYXQgd2UncmUgZ290IHRoZSB0YWJsZSBmcm9tIFN0ZXAgMyBidWlsdCxcbiAgICAvLyB3ZSB0dXJuIHRvIHRoZSB0YWJsZSBpbiBTdGVwIDQ6ICBBIHNldCBmb3IgZWFjaCB0eXBlIG9mIGRhdGEsIGNvbmlzdGluZyBvZiBkaXNhbWJpZ3VhdGlvbiByb3dzLFxuICAgIC8vIHdoZXJlIHRoZSB1c2VyIGNhbiBsaW5rIHVua25vd24gaXRlbXMgdG8gcHJlLWV4aXN0aW5nIEVERCBkYXRhLlxuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGUoKTtcbn0sXG5cblxuLy8gVGhpcyByb3V0aW5lIGRvZXMgYSBiaXQgb2YgYWRkaXRpb25hbCBzdHlsaW5nIHRvIHRoZSBTdGVwIDMgZGF0YSB0YWJsZS5cbi8vIEl0IHJlbW92ZXMgYW5kIHJlLWFkZHMgdGhlIGRhdGFUeXBlQ2VsbCBjc3MgY2xhc3NlcyBhY2NvcmRpbmcgdG8gdGhlIHB1bGxkb3duIHNldHRpbmdzIGZvciBlYWNoIHJvdy5cbmFwcGx5VGFibGVEYXRhVHlwZVN0eWxpbmc6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHJvdzogc3RyaW5nW10sIGluZGV4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGhsTGFiZWw6IGJvb2xlYW4sIGhsUm93OiBib29sZWFuO1xuICAgICAgICBwdWxsZG93biA9IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2luZGV4XSB8fCAwO1xuICAgICAgICBobExhYmVsID0gaGxSb3cgPSBmYWxzZTtcbiAgICAgICAgaWYgKHB1bGxkb3duID09PSAxIHx8IHB1bGxkb3duID09PSAyKSB7XG4gICAgICAgICAgICBobFJvdyA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoMyA8PSBwdWxsZG93biAmJiBwdWxsZG93biA8PSA1KSB7XG4gICAgICAgICAgICBobExhYmVsID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICAkKEVEREFURC5UYWJsZS5yb3dMYWJlbENlbGxzW2luZGV4XSkudG9nZ2xlQ2xhc3MoJ2RhdGFUeXBlQ2VsbCcsIGhsTGFiZWwpO1xuICAgICAgICByb3cuZm9yRWFjaCgoXywgY29sOiBudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgJChFRERBVEQuVGFibGUuZGF0YUNlbGxzW2luZGV4XVtjb2xdKS50b2dnbGVDbGFzcygnZGF0YVR5cGVDZWxsJywgaGxSb3cpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn0sXG5cblxuLy8gV2UgY2FsbCB0aGlzIHdoZW4gYW55IG9mIHRoZSAnbWFzdGVyJyBwdWxsZG93bnMgYXJlIGNoYW5nZWQgaW4gU3RlcCA0LlxuLy8gU3VjaCBjaGFuZ2VzIG1heSBhZmZlY3QgdGhlIGF2YWlsYWJsZSBjb250ZW50cyBvZiBzb21lIG9mIHRoZSBwdWxsZG93bnMgaW4gdGhlIHN0ZXAuXG5jaGFuZ2VkQU1hc3RlclB1bGxkb3duOiAoKTogdm9pZCA9PiB7XG4gICAgLy8gaGlkZSBtYXN0ZXIgbGluZSBkcm9wZG93biBpZiBtYXN0ZXIgYXNzYXkgZHJvcGRvd24gaXMgc2V0IHRvIG5ld1xuICAgICQoJyNtYXN0ZXJMaW5lU3BhbicpLnRvZ2dsZUNsYXNzKCdvZmYnLCAkKCcjbWFzdGVyQXNzYXknKS52YWwoKSA9PT0gJ25ldycpO1xuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGUoKTtcbn0sXG5cblxuY2xpY2tlZE9uSWdub3JlRGF0YUdhcHM6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuR3JpZC51c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHMgPSB0cnVlO1xuICAgIEVEREFURC5xdWV1ZVByb2Nlc3NJbXBvcnRTZXR0aW5ncygpOyAgICAvLyBUaGlzIHdpbGwgdGFrZSBjYXJlIG9mIHJlYWRpbmcgdGhlIHN0YXR1cyBvZiB0aGUgY2hlY2tib3hcbn0sXG5cblxuY2xpY2tlZE9uVHJhbnNwb3NlOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELkdyaWQudXNlckNsaWNrZWRPblRyYW5zcG9zZSA9IHRydWU7XG4gICAgRUREQVRELnF1ZXVlUHJvY2Vzc0ltcG9ydFNldHRpbmdzKCk7XG59LFxuXG5cbmNoYW5nZWRSb3dEYXRhVHlwZVB1bGxkb3duOiAoaW5kZXg6IG51bWJlciwgdmFsdWU6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgIHZhciBzZWxlY3RlZDogbnVtYmVyO1xuICAgIC8vIFRoZSB2YWx1ZSBkb2VzIG5vdCBuZWNlc3NhcmlseSBtYXRjaCB0aGUgc2VsZWN0ZWRJbmRleC5cbiAgICBzZWxlY3RlZCA9IEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHNbaW5kZXhdLnNlbGVjdGVkSW5kZXg7XG4gICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaW5kZXhdID0gdmFsdWU7XG4gICAgRUREQVRELlRhYmxlLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpbmRleF0gPSB0cnVlO1xuICAgIGlmICgodmFsdWUgPj0gMyAmJiB2YWx1ZSA8PSA1KSB8fCB2YWx1ZSA9PT0gMTIpIHtcbiAgICAgICAgLy8gXCJUaW1lc3RhbXBcIiwgXCJNZXRhZGF0YVwiLCBvciBvdGhlciBzaW5nbGUtdGFibGUtY2VsbCB0eXBlc1xuICAgICAgICAvLyBTZXQgYWxsIHRoZSByZXN0IG9mIHRoZSBwdWxsZG93bnMgdG8gdGhpcyxcbiAgICAgICAgLy8gYmFzZWQgb24gdGhlIGFzc3VtcHRpb24gdGhhdCB0aGUgZmlyc3QgaXMgZm9sbG93ZWQgYnkgbWFueSBvdGhlcnNcbiAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0cy5zbGljZShpbmRleCArIDEpLmV2ZXJ5KFxuICAgICAgICAgICAgKHB1bGxkb3duOiBIVE1MU2VsZWN0RWxlbWVudCk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzZWxlY3Q6IEpRdWVyeSwgaTogbnVtYmVyO1xuICAgICAgICAgICAgICAgIHNlbGVjdCA9ICQocHVsbGRvd24pO1xuICAgICAgICAgICAgICAgIGkgPSBwYXJzZUludChzZWxlY3QuYXR0cignaScpLCAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKEVEREFURC5UYWJsZS5wdWxsZG93blVzZXJDaGFuZ2VkRmxhZ3NbaV1cbiAgICAgICAgICAgICAgICAgICAgICAgICYmIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gZmFsc2UgZm9yIGJyZWFrXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGVjdC52YWwodmFsdWUudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAvLyBJbiBhZGRpdGlvbiB0byB0aGUgYWJvdmUgYWN0aW9uLCB3ZSBhbHNvIG5lZWQgdG8gZG8gc29tZSBjaGVja2luZyBvbiB0aGUgZW50aXJlIHNldCBvZlxuICAgICAgICAvLyBwdWxsZG93bnMsIHRvIGVuZm9yY2UgYSBkaXZpc2lvbiBiZXR3ZWVuIHRoZSBcIk1ldGFib2xpdGUgTmFtZVwiIHNpbmdsZSBkYXRhIHR5cGUgYW5kIHRoZVxuICAgICAgICAvLyBvdGhlciBzaW5nbGUgZGF0YSB0eXBlcy4gSWYgdGhlIHVzZXIgdXNlcyBldmVuIG9uZSBcIk1ldGFib2xpdGUgTmFtZVwiIHB1bGxkb3duLCB3ZSBjYW4ndFxuICAgICAgICAvLyBhbGxvdyBhbnkgb2YgdGhlIG90aGVyIHR5cGVzLCBhbmQgdmljZS12ZXJzYS5cbiAgICAgICAgLy8gICBXaHk/ICBCZWNhdXNlIFwiTWV0YWJvbGl0ZSBOYW1lXCIgaXMgdXNlZCB0byBsYWJlbCB0aGUgc3BlY2lmaWMgY2FzZSBvZiBhIHRhYmxlIHRoYXRcbiAgICAgICAgLy8gZG9lcyBub3QgY29udGFpbiBhIHRpbWVzdGFtcCBvbiBlaXRoZXIgYXhpcy4gIEluIHRoYXQgY2FzZSwgdGhlIHRhYmxlIGlzIG1lYW50IHRvXG4gICAgICAgIC8vIHByb3ZpZGUgZGF0YSBmb3IgbXVsdGlwbGUgTWVhc3VyZW1lbnRzIGFuZCBBc3NheXMgZm9yIGEgc2luZ2xlIHVuc3BlY2lmaWVkIHRpbWUgcG9pbnQuXG4gICAgICAgIC8vIChUaGF0IHRpbWUgcG9pbnQgaXMgcmVxdWVzdGVkIGxhdGVyIGluIHRoZSBVSS4pXG4gICAgICAgIC8vICAgSWYgd2UgYWxsb3cgYSBzaW5nbGUgdGltZXN0YW1wIHJvdywgdGhhdCBjcmVhdGVzIGFuIGluY29uc2lzdGVudCB0YWJsZSB0aGF0IGlzXG4gICAgICAgIC8vIGltcG9zc2libGUgdG8gaW50ZXJwcmV0LlxuICAgICAgICAvLyAgIElmIHdlIGFsbG93IGEgc2luZ2xlIG1ldGFkYXRhIHJvdywgdGhhdCBsZWF2ZXMgdGhlIG1ldGFkYXRhIHVuY29ubmVjdGVkIHRvIGEgc3BlY2lmaWNcbiAgICAgICAgLy8gbWVhc3VyZW1lbnQsIG1lYW5pbmcgdGhhdCB0aGUgb25seSB2YWxpZCB3YXkgdG8gaW50ZXJwcmV0IGl0IGlzIGFzIExpbmUgbWV0YWRhdGEuICBXZVxuICAgICAgICAvLyBjb3VsZCBwb3RlbnRpYWxseSBzdXBwb3J0IHRoYXQsIGJ1dCBpdCB3b3VsZCBiZSB0aGUgb25seSBjYXNlIHdoZXJlIGRhdGEgaW1wb3J0ZWQgb25cbiAgICAgICAgLy8gdGhpcyBwYWdlIGRvZXMgbm90IGVuZCB1cCBpbiBBc3NheXMgLi4uIGFuZCB0aGF0IGNhc2UgZG9lc24ndCBtYWtlIG11Y2ggc2Vuc2UgZ2l2ZW5cbiAgICAgICAgLy8gdGhhdCB0aGlzIGlzIHRoZSBBc3NheSBEYXRhIEltcG9ydCBwYWdlIVxuICAgICAgICAvLyAgIEFueXdheSwgaGVyZSB3ZSBydW4gdGhyb3VnaCB0aGUgcHVsbGRvd25zLCBtYWtpbmcgc3VyZSB0aGF0IGlmIHRoZSB1c2VyIHNlbGVjdGVkXG4gICAgICAgIC8vIFwiTWV0YWJvbGl0ZSBOYW1lXCIsIHdlIGJsYW5rIG91dCBhbGwgcmVmZXJlbmNlcyB0byBcIlRpbWVzdGFtcFwiIGFuZCBcIk1ldGFkYXRhXCIsIGFuZFxuICAgICAgICAvLyB2aWNlLXZlcnNhLlxuICAgICAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKF8sIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGM6IG51bWJlciA9IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldO1xuICAgICAgICAgICAgaWYgKHZhbHVlID09PSA1KSB7XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDMgfHwgYyA9PT0gNCkge1xuICAgICAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzW2ldLnNlbGVjdGVkSW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSA9IDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSAyKSB7IC8vIENhbid0IGFsbG93IFwiTWVhc3VyZW1lbnQgVHlwZXNcIiBzZXR0aW5nIGVpdGhlclxuICAgICAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzW2ldLnNlbGVjdGVkSW5kZXggPSAxO1xuICAgICAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSA9IDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICgodmFsdWUgPT09IDMgfHwgdmFsdWUgPT09IDQpICYmIGMgPT09IDUpIHtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzW2ldLnNlbGVjdGVkSW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIEl0IHdvdWxkIHNlZW0gbG9naWNhbCB0byByZXF1aXJlIGEgc2ltaWxhciBjaGVjayBmb3IgXCJQcm90ZWluIE5hbWVcIiwgSUQgMTIsIGJ1dCBpbiBwcmFjdGljZVxuICAgICAgICAvLyB0aGUgdXNlciBpcyBkaXNhbGxvd2VkIGZyb20gc2VsZWN0aW5nIGFueSBvZiB0aGUgb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXMgd2hlbiB0aGVcbiAgICAgICAgLy8gcGFnZSBpcyBpbiBQcm90ZW9taWNzIG1vZGUuICBTbyB0aGUgY2hlY2sgaXMgcmVkdW5kYW50LlxuICAgIH1cbiAgICBFRERBVEQuYXBwbHlUYWJsZURhdGFUeXBlU3R5bGluZygpO1xuICAgIEVEREFURC5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICBFRERBVEQucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgIC8vIFJlc2V0dGluZyBhIGRpc2FibGVkIHJvdyBtYXkgY2hhbmdlIHRoZSBudW1iZXIgb2Ygcm93cyBsaXN0ZWQgaW4gdGhlIEluZm8gdGFibGUuXG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZSgpO1xufSxcblxuXG5maWd1cmVPdXRUaGlzUm93c0RhdGFUeXBlOiAobGFiZWw6IHN0cmluZywgcm93OiBzdHJpbmdbXSkgPT4ge1xuICAgIHZhciBibGFuazogbnVtYmVyLCBzdHJpbmdzOiBudW1iZXIsIGNvbmRlbnNlZDogc3RyaW5nW107XG4gICAgaWYgKEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT0gJ3RyJykge1xuICAgICAgICBpZiAobGFiZWwubWF0Y2goL2dlbmUvaSkpIHtcbiAgICAgICAgICAgIHJldHVybiAxMDtcbiAgICAgICAgfVxuICAgICAgICBpZiAobGFiZWwubWF0Y2goL3Jwa20vaSkpIHtcbiAgICAgICAgICAgIHJldHVybiAxMTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB3ZSBjYW4ndCBtYXRjaCB0byB0aGUgYWJvdmUgdHdvLCBzZXQgdGhlIHJvdyB0byAndW5kZWZpbmVkJyBzbyBpdCdzIGlnbm9yZWQgYnkgZGVmYXVsdFxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgLy8gVGFrZSBjYXJlIG9mIHNvbWUgYnJhaW5kZWFkIGd1ZXNzZXNcbiAgICBpZiAobGFiZWwubWF0Y2goL2Fzc2F5L2kpIHx8IGxhYmVsLm1hdGNoKC9saW5lL2kpKSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgIH1cbiAgICBpZiAoRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PSAncHInKSB7XG4gICAgICAgIGlmIChsYWJlbC5tYXRjaCgvcHJvdGVpbi9pKSkge1xuICAgICAgICAgICAgcmV0dXJuIDEyO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vIHBvaW50IGluIGNvbnRpbnVpbmcsIG9ubHkgbGluZSBhbmQgcHJvdGVpbiBhcmUgcmVsZXZhbnRcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICAgIC8vIFRoaW5ncyB3ZSdsbCBiZSBjb3VudGluZyB0byBoYXphcmQgYSBndWVzcyBhdCB0aGUgcm93IGNvbnRlbnRzXG4gICAgYmxhbmsgPSBzdHJpbmdzID0gMDtcbiAgICAvLyBBIGNvbmRlbnNlZCB2ZXJzaW9uIG9mIHRoZSByb3csIHdpdGggbm8gbnVsbHMgb3IgYmxhbmsgdmFsdWVzXG4gICAgY29uZGVuc2VkID0gcm93LmZpbHRlcigodjogc3RyaW5nKTogYm9vbGVhbiA9PiAhIXYpO1xuICAgIGJsYW5rID0gcm93Lmxlbmd0aCAtIGNvbmRlbnNlZC5sZW5ndGg7XG4gICAgY29uZGVuc2VkLmZvckVhY2goKHY6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICB2ID0gdi5yZXBsYWNlKC8sL2csICcnKTtcbiAgICAgICAgaWYgKGlzTmFOKHBhcnNlRmxvYXQodikpKSB7XG4gICAgICAgICAgICArK3N0cmluZ3M7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICAvLyBJZiB0aGUgbGFiZWwgcGFyc2VzIGludG8gYSBudW1iZXIgYW5kIHRoZSBkYXRhIGNvbnRhaW5zIG5vIHN0cmluZ3MsIGNhbGwgaXQgYSB0aW1zZXRhbXAgZm9yIGRhdGFcbiAgICBpZiAoIWlzTmFOKHBhcnNlRmxvYXQobGFiZWwpKSAmJiAoc3RyaW5ncyA9PT0gMCkpIHtcbiAgICAgICAgcmV0dXJuIDM7XG4gICAgfVxuICAgIC8vIE5vIGNob2ljZSBieSBkZWZhdWx0XG4gICAgcmV0dXJuIDA7XG59LFxuXG5cbnJlZHJhd0lnbm9yZWRWYWx1ZU1hcmtlcnM6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuVGFibGUuZGF0YUNlbGxzLmZvckVhY2goKHJvdzogSFRNTEVsZW1lbnRbXSk6IHZvaWQgPT4ge1xuICAgICAgICByb3cuZm9yRWFjaCgoY2VsbDogSFRNTEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB0b2dnbGU6IGJvb2xlYW4gPSAhRUREQVRELkdyaWQuaWdub3JlRGF0YUdhcHMgJiYgISFjZWxsLmdldEF0dHJpYnV0ZSgnaXNibGFuaycpO1xuICAgICAgICAgICAgJChjZWxsKS50b2dnbGVDbGFzcygnaWdub3JlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn0sXG5cblxudG9nZ2xlVGFibGVSb3c6IChib3g6IEhUTUxFbGVtZW50KTogdm9pZCA9PiB7XG4gICAgdmFyIHZhbHVlOiBudW1iZXIsIGlucHV0OiBKUXVlcnk7XG4gICAgaW5wdXQgPSAkKGJveCk7XG4gICAgdmFsdWUgPSBwYXJzZUludChpbnB1dC52YWwoKSwgMTApO1xuICAgIEVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t2YWx1ZV0gPSBpbnB1dC5wcm9wKCdjaGVja2VkJyk7XG4gICAgRUREQVRELmludGVycHJldERhdGFUYWJsZSgpO1xuICAgIEVEREFURC5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgRUREQVRELnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgIC8vIFJlc2V0dGluZyBhIGRpc2FibGVkIHJvdyBtYXkgY2hhbmdlIHRoZSBudW1iZXIgb2Ygcm93cyBsaXN0ZWQgaW4gdGhlIEluZm8gdGFibGUuXG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZSgpO1xufSxcblxuXG50b2dnbGVUYWJsZUNvbHVtbjogKGJveDogSFRNTEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICB2YXIgdmFsdWU6IG51bWJlciwgaW5wdXQ6IEpRdWVyeTtcbiAgICBpbnB1dCA9ICQoYm94KTtcbiAgICB2YWx1ZSA9IHBhcnNlSW50KGlucHV0LnZhbCgpLCAxMCk7XG4gICAgRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW3ZhbHVlXSA9IGlucHV0LnByb3AoJ2NoZWNrZWQnKTtcbiAgICBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgRUREQVRELnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICBFRERBVEQucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgLy8gUmVzZXR0aW5nIGEgZGlzYWJsZWQgY29sdW1uIG1heSBjaGFuZ2UgdGhlIHJvd3MgbGlzdGVkIGluIHRoZSBJbmZvIHRhYmxlLlxuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGUoKTtcbn0sXG5cblxucmVzZXRFbmFibGVkRmxhZ01hcmtlcnM6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV0gPSBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV0gfHwgW107XG4gICAgICAgIHJvdy5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbeV0gPSB0cnVlO1xuICAgIH0pO1xuICAgIChFRERBVEQuR3JpZC5kYXRhWzBdIHx8IFtdKS5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW3hdID0gdHJ1ZTtcbiAgICB9KTtcbiAgICAvLyBGbGlwIGFsbCB0aGUgY2hlY2tib3hlcyBvbiBpbiB0aGUgaGVhZGVyIGNlbGxzIGZvciB0aGUgZGF0YSBjb2x1bW5zXG4gICAgJCgnI2RhdGFUYWJsZURpdicpLmZpbmQoJ1tuYW1lPWVuYWJsZUNvbHVtbl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgLy8gU2FtZSBmb3IgdGhlIGNoZWNrYm94ZXMgaW4gdGhlIHJvdyBsYWJlbCBjZWxsc1xuICAgICQoJyNkYXRhVGFibGVEaXYnKS5maW5kKCdbbmFtZT1lbmFibGVSb3ddJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgIEVEREFURC5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICBFRERBVEQucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgIEVEREFURC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlKCk7XG59LFxuXG5cbnJlZHJhd0VuYWJsZWRGbGFnTWFya2VyczogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5UYWJsZS5kYXRhQ2VsbHMuZm9yRWFjaCgocm93OiBIVE1MRWxlbWVudFtdLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIHRvZ2dsZTogYm9vbGVhbiA9ICFFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbeV07XG4gICAgICAgICQoRUREQVRELlRhYmxlLnJvd0xhYmVsQ2VsbHNbeV0pLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZExpbmUnLCB0b2dnbGUpO1xuICAgICAgICByb3cuZm9yRWFjaCgoY2VsbDogSFRNTEVsZW1lbnQsIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdG9nZ2xlID0gIUVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XVxuICAgICAgICAgICAgICAgIHx8ICFFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbeF1cbiAgICAgICAgICAgICAgICB8fCAhRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ldO1xuICAgICAgICAgICAgJChjZWxsKS50b2dnbGVDbGFzcygnZGlzYWJsZWRMaW5lJywgdG9nZ2xlKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgRUREQVRELlRhYmxlLmNvbENoZWNrYm94Q2VsbHMuZm9yRWFjaCgoYm94OiBIVE1MRWxlbWVudCwgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciB0b2dnbGU6IGJvb2xlYW4gPSAhRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW3hdO1xuICAgICAgICAkKGJveCkudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkTGluZScsIHRvZ2dsZSk7XG4gICAgfSk7XG59LFxuXG5cbmludGVycHJldERhdGFUYWJsZVJvd3M6ICgpOiBbYm9vbGVhbiwgbnVtYmVyXSA9PiB7XG4gICAgdmFyIHNpbmdsZTogbnVtYmVyID0gMCwgbm9uU2luZ2xlOiBudW1iZXIgPSAwLCBlYXJsaWVzdE5hbWU6IG51bWJlcjtcbiAgICAvLyBMb29rIGZvciB0aGUgcHJlc2VuY2Ugb2YgXCJzaW5nbGUgbWVhc3VyZW1lbnQgdHlwZVwiIHJvd3MsIGFuZCByb3dzIG9mIGFsbCBvdGhlciBzaW5nbGUtaXRlbSB0eXBlc1xuICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgoXywgeTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyO1xuICAgICAgICBpZiAoRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ldKSB7XG4gICAgICAgICAgICBwdWxsZG93biA9IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW3ldO1xuICAgICAgICAgICAgaWYgKHB1bGxkb3duID09PSA1IHx8IHB1bGxkb3duID09PSAxMikge1xuICAgICAgICAgICAgICAgIHNpbmdsZSsrOyAvLyBTaW5nbGUgTWVhc3VyZW1lbnQgTmFtZSBvciBTaW5nbGUgUHJvdGVpbiBOYW1lXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSA0IHx8IHB1bGxkb3duID09PSAzKSB7XG4gICAgICAgICAgICAgICAgbm9uU2luZ2xlKys7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxICYmIGVhcmxpZXN0TmFtZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZWFybGllc3ROYW1lID0geTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuICAgIC8vIE9ubHkgdXNlIHRoaXMgbW9kZSBpZiB0aGUgdGFibGUgaXMgZW50aXJlbHkgZnJlZSBvZiBzaW5nbGUtdGltZXN0YW1wIGFuZFxuICAgIC8vIHNpbmdsZS1tZXRhZGF0YSByb3dzLCBhbmQgaGFzIGF0IGxlYXN0IG9uZSBcInNpbmdsZSBtZWFzdXJlbWVudFwiIHJvdywgYW5kIGF0XG4gICAgLy8gbGVhc3Qgb25lIFwiQXNzYXkvTGluZSBuYW1lc1wiIHJvdy5cbiAgICAvLyBOb3RlOiByZXF1aXJlbWVudCBvZiBhbiBcIkFzc2F5L0xpbmUgbmFtZXNcIiByb3cgcHJldmVudHMgdGhpcyBtb2RlIGZyb20gYmVpbmdcbiAgICAvLyBlbmFibGVkIHdoZW4gdGhlIHBhZ2UgaXMgaW4gJ1RyYW5zY3JpcHRpb24nIG1vZGUuXG4gICAgcmV0dXJuIFsoc2luZ2xlID4gMCAmJiBub25TaW5nbGUgPT09IDAgJiYgZWFybGllc3ROYW1lICE9PSB1bmRlZmluZWQpLCBlYXJsaWVzdE5hbWVdO1xufSxcblxuXG5pbnRlcnByZXREYXRhVGFibGU6ICgpOiB2b2lkID0+IHtcbiAgICAvLyBXZSdsbCBiZSBhY2N1bXVsYXRpbmcgdGhlc2UgZm9yIGRpc2FtYmlndWF0aW9uLlxuICAgIC8vIEVhY2ggdW5pcXVlIGtleSB3aWxsIGdldCBhIGRpc3RpbmN0IHZhbHVlLCBwbGFjaW5nIGl0IGluIHRoZSBvcmRlciBmaXJzdCBzZWVuXG4gICAgdmFyIHNlZW5Bc3NheUxpbmVOYW1lcyA9IHt9O1xuICAgIHZhciBzZWVuTWVhc3VyZW1lbnROYW1lcyA9IHt9O1xuICAgIHZhciBzZWVuTWV0YWRhdGFOYW1lcyA9IHt9O1xuICAgIC8vIEhlcmUncyBob3cgd2UgdHJhY2sgdGhlIGluZGV4ZXMgd2UgYXNzaWduIGFzIHZhbHVlcyBhYm92ZS5cbiAgICB2YXIgYXNzYXlMaW5lTmFtZXNDb3VudCA9IDA7XG4gICAgdmFyIG1lYXN1cmVtZW50TmFtZXNDb3VudCA9IDA7XG4gICAgdmFyIG1ldGFkYXRhTmFtZXNDb3VudCA9IDA7XG4gICAgLy8gSGVyZSBhcmUgdGhlIGFycmF5cyB3ZSB3aWxsIHVzZSBsYXRlclxuICAgIEVEREFURC5TZXRzLnBhcnNlZFNldHMgPSBbXTtcbiAgICBFRERBVEQuU2V0cy51bmlxdWVMaW5lQXNzYXlOYW1lcyA9IFtdO1xuICAgIEVEREFURC5TZXRzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMgPSBbXTtcbiAgICBFRERBVEQuU2V0cy51bmlxdWVNZXRhZGF0YU5hbWVzID0gW107XG4gICAgRUREQVRELlNldHMuc2VlbkFueVRpbWVzdGFtcHMgPSBmYWxzZTtcblxuICAgIC8vIFRoaXMgbW9kZSBtZWFucyB3ZSBtYWtlIGEgbmV3IFwic2V0XCIgZm9yIGVhY2ggY2VsbCBpbiB0aGUgdGFibGUsIHJhdGhlciB0aGFuXG4gICAgLy8gdGhlIHN0YW5kYXJkIG1ldGhvZCBvZiBtYWtpbmcgYSBuZXcgXCJzZXRcIiBmb3IgZWFjaCBjb2x1bW4gaW4gdGhlIHRhYmxlLlxuICAgIHZhciBpbnRlcnByZXRNb2RlID0gRUREQVRELmludGVycHJldERhdGFUYWJsZVJvd3MoKTtcblxuICAgIC8vIFRoZSBzdGFuZGFyZCBtZXRob2Q6IE1ha2UgYSBcInNldFwiIGZvciBlYWNoIGNvbHVtbiBvZiB0aGUgdGFibGVcbiAgICBpZiAoIWludGVycHJldE1vZGVbMF0pIHtcbiAgICAgICAgRUREQVRELlRhYmxlLmNvbE9iamVjdHMuZm9yRWFjaCgoXywgYzogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgc2V0OiBhbnksIHVuaXF1ZVRpbWVzOiBudW1iZXJbXSwgdGltZXM6IGFueSwgZm91bmRNZXRhOiBib29sZWFuO1xuICAgICAgICAgICAgLy8gU2tpcCBpdCBpZiB0aGUgd2hvbGUgY29sdW1uIGlzIGRlYWN0aXZhdGVkXG4gICAgICAgICAgICBpZiAoIUVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1tjXSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNldCA9IHtcbiAgICAgICAgICAgICAgICAvLyBGb3IgdGhlIGdyYXBoaW5nIG1vZHVsZVxuICAgICAgICAgICAgICAgICdsYWJlbCc6ICdDb2x1bW4gJyArIGMsXG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ29sdW1uICcgKyBjLFxuICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgLy8gRm9yIHN1Ym1pc3Npb24gdG8gdGhlIGRhdGFiYXNlXG4gICAgICAgICAgICAgICAgJ3BhcnNpbmdJbmRleCc6IGMsXG4gICAgICAgICAgICAgICAgJ2Fzc2F5JzogbnVsbCxcbiAgICAgICAgICAgICAgICAnYXNzYXlOYW1lJzogbnVsbCxcbiAgICAgICAgICAgICAgICAnbWVhc3VyZW1lbnRUeXBlJzogbnVsbCxcbiAgICAgICAgICAgICAgICAnbWV0YWRhdGEnOiB7fSxcbiAgICAgICAgICAgICAgICAnc2luZ2xlRGF0YSc6IG51bGwsXG4gICAgICAgICAgICAgICAgLy8gRm9yIGJvdGhcbiAgICAgICAgICAgICAgICAnZGF0YSc6IFtdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdW5pcXVlVGltZXMgPSBbXTtcbiAgICAgICAgICAgIHRpbWVzID0ge307XG4gICAgICAgICAgICBmb3VuZE1ldGEgPSBmYWxzZTtcbiAgICAgICAgICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgcjogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHB1bGxkb3duOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgICAgICAgICAgICAgIGlmICghRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3JdIHx8ICFFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3Nbcl1bY10pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwdWxsZG93biA9IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW3JdO1xuICAgICAgICAgICAgICAgIGxhYmVsID0gRUREQVRELkdyaWQucm93TWFya2Vyc1tyXSB8fCAnJztcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHJvd1tjXSB8fCAnJztcbiAgICAgICAgICAgICAgICBpZiAoIXB1bGxkb3duKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxMSkgeyAgLy8gVHJhbnNjcmlwdG9taWNzOiBSUEtNIHZhbHVlc1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5zaW5nbGVEYXRhID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEwKSB7ICAvLyBUcmFuc2NyaXB0b21pY3M6IEdlbmUgbmFtZXNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQubmFtZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50VHlwZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAzKSB7ICAgLy8gVGltZXN0YW1wc1xuICAgICAgICAgICAgICAgICAgICBsYWJlbCA9IGxhYmVsLnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXAgPSBwYXJzZUZsb2F0KGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc05hTih0aW1lc3RhbXApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgaWdub3JpbmcgZ2Fwcywgc2tpcCBvdXQgb24gcmVjb3JkaW5nIHRoaXMgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoRUREQVRELkdyaWQuaWdub3JlRGF0YUdhcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBhY3R1YWxseSBwcmVmZXIgbnVsbCBoZXJlLCB0byBpbmRpY2F0ZSBhIHBsYWNlaG9sZGVyIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aW1lc1t0aW1lc3RhbXBdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZXNbdGltZXN0YW1wXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXF1ZVRpbWVzLnB1c2godGltZXN0YW1wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy5zZWVuQW55VGltZXN0YW1wcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobGFiZWwgPT09ICcnIHx8IHZhbHVlID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBOb3cgdGhhdCB3ZSd2ZSBkZWFsdCB3aXRoIHRpbWVzdGFtcHMsIHdlIHByb2NlZWQgb24gdG8gb3RoZXIgZGF0YSB0eXBlcy5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsIHRoZSBvdGhlciBkYXRhIHR5cGVzIGRvIG5vdCBhY2NlcHQgYSBibGFuayB2YWx1ZSwgc28gd2Ugd2VlZCB0aGVtIG91dCBub3cuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxKSB7ICAgLy8gQXNzYXkvTGluZSBOYW1lc1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiBoYXZlbid0IHNlZW4gdmFsdWUgYmVmb3JlLCBpbmNyZW1lbnQgYW5kIHN0b3JlIHVuaXF1ZW5lc3MgaW5kZXhcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuQXNzYXlMaW5lTmFtZXNbdmFsdWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWVuQXNzYXlMaW5lTmFtZXNbdmFsdWVdID0gKythc3NheUxpbmVOYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMudW5pcXVlTGluZUFzc2F5TmFtZXMucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2V0LmFzc2F5ID0gc2VlbkFzc2F5TGluZU5hbWVzW3ZhbHVlXTtcbiAgICAgICAgICAgICAgICAgICAgc2V0LmFzc2F5TmFtZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMikgeyAgIC8vIE1ldGFib2xpdGUgTmFtZXNcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgaGF2ZW4ndCBzZWVuIHZhbHVlIGJlZm9yZSwgaW5jcmVtZW50IGFuZCBzdG9yZSB1bmlxdWVuZXNzIGluZGV4XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1lYXN1cmVtZW50TmFtZXNbdmFsdWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWVuTWVhc3VyZW1lbnROYW1lc1t2YWx1ZV0gPSArK21lYXN1cmVtZW50TmFtZXNDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50VHlwZSA9IHNlZW5NZWFzdXJlbWVudE5hbWVzW3ZhbHVlXTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDQpIHsgICAvLyBNZXRhZGF0YVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZXRhZGF0YU5hbWVzW2xhYmVsXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbk1ldGFkYXRhTmFtZXNbbGFiZWxdID0gKyttZXRhZGF0YU5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy51bmlxdWVNZXRhZGF0YU5hbWVzLnB1c2gobGFiZWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNldC5tZXRhZGF0YVtzZWVuTWV0YWRhdGFOYW1lc1tsYWJlbF1dID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kTWV0YSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB1bmlxdWVUaW1lcy5zb3J0KChhLCBiKSA9PiBhIC0gYikuZm9yRWFjaCgodGltZTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgc2V0LmRhdGEucHVzaChbdGltZSwgdGltZXNbdGltZV1dKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gb25seSBzYXZlIGlmIGFjY3VtdWxhdGVkIHNvbWUgZGF0YSBvciBtZXRhZGF0YVxuICAgICAgICAgICAgaWYgKHVuaXF1ZVRpbWVzLmxlbmd0aCB8fCBmb3VuZE1ldGEgfHwgc2V0LnNpbmdsZURhdGEgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy5wYXJzZWRTZXRzLnB1c2goc2V0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgLy8gVGhlIGFsdGVybmF0ZSBtZXRob2Q6IEEgXCJzZXRcIiBmb3IgZXZlcnkgY2VsbCBvZiB0aGUgdGFibGUsIHdpdGggdGhlIHRpbWVzdGFtcFxuICAgIC8vIHRvIGJlIGRldGVybWluZWQgbGF0ZXIuXG4gICAgfSBlbHNlIHtcbiAgICAgICAgRUREQVRELlRhYmxlLmNvbE9iamVjdHMuZm9yRWFjaCgoXywgYzogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgY2VsbFZhbHVlOiBzdHJpbmcsIHNldDogYW55O1xuICAgICAgICAgICAgaWYgKCFFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbY10pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjZWxsVmFsdWUgPSBFRERBVEQuR3JpZC5kYXRhW2ludGVycHJldE1vZGVbMV1dW2NdIHx8ICcnO1xuICAgICAgICAgICAgaWYgKGNlbGxWYWx1ZSkge1xuICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiBjZWxsVmFsdWUgYmVmb3JlLCBpbmNyZW1lbnQgYW5kIHN0b3JlIHVuaXF1ZW5lc3MgaW5kZXhcbiAgICAgICAgICAgICAgICBpZiAoIXNlZW5Bc3NheUxpbmVOYW1lc1tjZWxsVmFsdWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlZW5Bc3NheUxpbmVOYW1lc1tjZWxsVmFsdWVdID0gKythc3NheUxpbmVOYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy51bmlxdWVMaW5lQXNzYXlOYW1lcy5wdXNoKGNlbGxWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgocm93OiBzdHJpbmdbXSwgcjogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBsYWJlbDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3Nbcl0gfHwgIUVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1tyXVtjXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHB1bGxkb3duID0gRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3Nbcl07XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsID0gRUREQVRELkdyaWQucm93TWFya2Vyc1tyXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSByb3dbY10gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcHVsbGRvd24gfHwgIShwdWxsZG93biA9PT0gNSB8fCBwdWxsZG93biA9PT0gMTIpIHx8ICFsYWJlbCB8fCAhdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgdGhlIGdyYXBoaW5nIG1vZHVsZSAod2hpY2ggd2Ugd29uJ3QgYmUgdXNpbmcgaW4gdGhpcyBtb2RlLCBhY3R1YWxseSlcbiAgICAgICAgICAgICAgICAgICAgICAgICdsYWJlbCc6ICdDb2x1bW4gJyArIGMgKyAnIHJvdyAnICsgcixcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0NvbHVtbiAnICsgYyArICcgcm93ICcgKyByLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3VuaXRzJzogJ3VuaXRzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBzdWJtaXNzaW9uIHRvIHRoZSBkYXRhYmFzZVxuICAgICAgICAgICAgICAgICAgICAgICAgJ3BhcnNpbmdJbmRleCc6IEVEREFURC5TZXRzLnBhcnNlZFNldHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2Fzc2F5Jzogc2VlbkFzc2F5TGluZU5hbWVzW2NlbGxWYWx1ZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAnYXNzYXlOYW1lJzogY2VsbFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50VHlwZSc6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAnbWV0YWRhdGEnOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzaW5nbGVEYXRhJzogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYm90aFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBbXVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBpZiAocHVsbGRvd24gPT09IDUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbk1lYXN1cmVtZW50TmFtZXNbbGFiZWxdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbk1lYXN1cmVtZW50TmFtZXNbbGFiZWxdID0gKyttZWFzdXJlbWVudE5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudFR5cGUgPSBzZWVuTWVhc3VyZW1lbnROYW1lc1tsYWJlbF07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDEyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQubmFtZSA9IGxhYmVsO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm1lYXN1cmVtZW50VHlwZSA9IGxhYmVsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnBhcnNlZFNldHMucHVzaChzZXQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59LFxuXG5cbnF1ZXVlR3JhcGhSZW1ha2U6ICgpOiB2b2lkID0+IHtcbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICAvLyBUaGlzIHdheSB3ZSdyZSBub3QgYm90aGVyaW5nIHRoZSB1c2VyIHdpdGggdGhlIGxvbmcgcmVkcmF3IHByb2Nlc3Mgd2hlblxuICAgIC8vIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgIGlmIChFRERBVEQuZ3JhcGhSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoRUREQVRELmdyYXBoUmVmcmVzaFRpbWVySUQpO1xuICAgIH1cbiAgICBpZiAoRUREQVRELmdyYXBoRW5hYmxlZCkge1xuICAgICAgICBFRERBVEQuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQoRUREQVRELnJlbWFrZUdyYXBoQXJlYS5iaW5kKEVEREFURCksIDcwMCk7XG4gICAgfVxufSxcblxuXG5yZW1ha2VHcmFwaEFyZWE6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IDA7IFxuICAgIGlmICghRUREQVRER3JhcGhpbmcgfHwgIUVEREFURC5ncmFwaEVuYWJsZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBFRERBVERHcmFwaGluZy5jbGVhckFsbFNldHMoKTtcbiAgICAvLyBJZiB3ZSdyZSBub3QgaW4gdGhpcyBtb2RlLCBkcmF3aW5nIGEgZ3JhcGggaXMgbm9uc2Vuc2ljYWwuXG4gICAgaWYgKEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT09IFwic3RkXCIpIHtcbiAgICAgICAgRUREQVRELlNldHMucGFyc2VkU2V0cy5mb3JFYWNoKChzZXQpID0+IEVEREFUREdyYXBoaW5nLmFkZE5ld1NldChzZXQpKTtcbiAgICB9XG4gICAgRUREQVRER3JhcGhpbmcuZHJhd1NldHMoKTtcbn0sXG5cblxucmVzZXRJbmZvVGFibGVGaWVsZHM6ICgpOiB2b2lkID0+IHtcbiAgICAvLyBUT1RBTExZIFNUVUJCRURcbn0sXG5cblxucmVtYWtlSW5mb1RhYmxlQXNzYXlMaW5lU2VjdGlvbjogKG1hc3RlclA6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgIHZhciB0YWJsZTogSFRNTFRhYmxlRWxlbWVudCwgYm9keTogSFRNTFRhYmxlRWxlbWVudDtcbiAgICBpZiAoRUREQVRELlNldHMudW5pcXVlTGluZUFzc2F5TmFtZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICQoJyNtYXN0ZXJBc3NheUxpbmVEaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gT3RoZXJ3aXNlLCBwdXQgdG9nZXRoZXIgYSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGZvciBBc3NheXMvTGluZXNcbiAgICAgICAgLy8gS2VlcCBhIHNlcGFyYXRlIHNldCBvZiBjb3JyZWxhdGlvbnMgYmV0d2VlbiBzdHJpbmcgYW5kIHB1bGxkb3ducyBmb3IgZWFjaFxuICAgICAgICAvLyBQcm90b2NvbCwgc2luY2Ugc2FtZSBzdHJpbmcgY2FuIG1hdGNoIGRpZmZlcmVudCBBc3NheXMsIGFuZCB0aGUgcHVsbGRvd25zXG4gICAgICAgIC8vIHdpbGwgaGF2ZSBkaWZmZXJlbnQgY29udGVudCwgaW4gZWFjaCBQcm90b2NvbC5cbiAgICAgICAgRUREQVRELkRpc2FtLmFzc2F5TGluZU9ialNldHNbbWFzdGVyUF0gPSB7fTtcbiAgICAgICAgRUREQVRELkRpc2FtLmN1cnJlbnRseVZpc2libGVBc3NheUxpbmVPYmpTZXRzID0gW107XG4gICAgICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0YWJsZT4nKVxuICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiAnZGlzYW1iaWd1YXRlQXNzYXlzVGFibGUnLCAnY2VsbHNwYWNpbmcnOiAwIH0pXG4gICAgICAgICAgICAuYXBwZW5kVG8oJCgnI2Rpc2FtYmlndWF0ZUxpbmVzQXNzYXlzU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgICAgIC5vbignY2hhbmdlJywgJ3NlbGVjdCcsIChldjogSlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIEVEREFURC51c2VyQ2hhbmdlZEFzc2F5TGluZURpc2FtKGV2LnRhcmdldCk7XG4gICAgICAgICAgICB9KVswXTtcbiAgICAgICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgICAgICBFRERBVEQuU2V0cy51bmlxdWVMaW5lQXNzYXlOYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGRpc2FtOiBhbnksIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCwgZGVmYXVsdFNlbDogYW55LFxuICAgICAgICAgICAgICAgIGNlbGw6IEpRdWVyeSwgYVNlbGVjdDogSlF1ZXJ5LCBsU2VsZWN0OiBKUXVlcnk7XG4gICAgICAgICAgICBkaXNhbSA9IEVEREFURC5EaXNhbS5hc3NheUxpbmVPYmpTZXRzW21hc3RlclBdW25hbWVdO1xuICAgICAgICAgICAgaWYgKCFkaXNhbSkge1xuICAgICAgICAgICAgICAgIGRpc2FtID0ge307XG4gICAgICAgICAgICAgICAgZGVmYXVsdFNlbCA9IEVEREFURC5kaXNhbWJpZ3VhdGVBbkFzc2F5T3JMaW5lKG5hbWUsIGkpO1xuICAgICAgICAgICAgICAgIC8vIEZpcnN0IG1ha2UgYSB0YWJsZSByb3csIGFuZCBzYXZlIGEgcmVmZXJlbmNlIHRvIGl0XG4gICAgICAgICAgICAgICAgZGlzYW0ucm93T2JqID0gcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+IGJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgLy8gTmV4dCwgYWRkIGEgdGFibGUgY2VsbCB3aXRoIHRoZSBzdHJpbmcgd2UgYXJlIGRpc2FtYmlndWF0aW5nXG4gICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KG5hbWUpLmFwcGVuZFRvKHJvdy5pbnNlcnRDZWxsKCkpO1xuICAgICAgICAgICAgICAgIC8vIE5vdyBidWlsZCBhbm90aGVyIHRhYmxlIGNlbGwgdGhhdCB3aWxsIGNvbnRhaW4gdGhlIHB1bGxkb3duc1xuICAgICAgICAgICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmNzcygndGV4dC1hbGlnbicsICdsZWZ0Jyk7XG4gICAgICAgICAgICAgICAgYVNlbGVjdCA9ICQoJzxzZWxlY3Q+JykuYXBwZW5kVG8oY2VsbClcbiAgICAgICAgICAgICAgICAgICAgLmRhdGEoeyAnc2V0QnlVc2VyJzogZmFsc2UsICd2aXNpYmxlSW5kZXgnOiBpIH0pXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCduYW1lJywgJ2Rpc2FtQXNzYXknICsgKGkgKyAxKSk7XG4gICAgICAgICAgICAgICAgZGlzYW0uYXNzYXlPYmogPSBhU2VsZWN0WzBdO1xuICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dCgnKENyZWF0ZSBOZXcpJykuYXBwZW5kVG8oYVNlbGVjdCkudmFsKCduZXcnKVxuICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCAhZGVmYXVsdFNlbC5hc3NheUlEKTtcbiAgICAgICAgICAgICAgICAoQVREYXRhLmV4aXN0aW5nQXNzYXlzW21hc3RlclBdIHx8IFtdKS5mb3JFYWNoKChpZDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhc3NheTogQXNzYXlSZWNvcmQsIGxpbmU6IExpbmVSZWNvcmQsIHByb3RvY29sOiBhbnk7XG4gICAgICAgICAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJykpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oYVNlbGVjdCkudmFsKGlkLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBkZWZhdWx0U2VsLmFzc2F5SUQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBhIHNwYW4gdG8gY29udGFpbiB0aGUgdGV4dCBsYWJlbCBmb3IgdGhlIExpbmUgcHVsbGRvd24sIGFuZCB0aGUgcHVsbGRvd24gaXRzZWxmXG4gICAgICAgICAgICAgICAgY2VsbCA9ICQoJzxzcGFuPicpLnRleHQoJ2ZvciBMaW5lOicpLnRvZ2dsZUNsYXNzKCdvZmYnLCAhIWRlZmF1bHRTZWwuYXNzYXlJRClcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgIGxTZWxlY3QgPSAkKCc8c2VsZWN0PicpLmFwcGVuZFRvKGNlbGwpLmRhdGEoJ3NldEJ5VXNlcicsIGZhbHNlKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignbmFtZScsICdkaXNhbUxpbmUnICsgKGkgKyAxKSk7XG4gICAgICAgICAgICAgICAgZGlzYW0ubGluZU9iaiA9IGxTZWxlY3RbMF07XG4gICAgICAgICAgICAgICAgJCgnPG9wdGlvbj4nKS50ZXh0KCcoQ3JlYXRlIE5ldyknKS5hcHBlbmRUbyhsU2VsZWN0KS52YWwoJ25ldycpXG4gICAgICAgICAgICAgICAgICAgIC5wcm9wKCdzZWxlY3RlZCcsICFkZWZhdWx0U2VsLmxpbmVJRCk7XG4gICAgICAgICAgICAgICAgLy8gQVREYXRhLmV4aXN0aW5nTGluZXMgaXMgb2YgdHlwZSB7aWQ6IG51bWJlcjsgbjogc3RyaW5nO31bXVxuICAgICAgICAgICAgICAgIChBVERhdGEuZXhpc3RpbmdMaW5lcyB8fCBbXSkuZm9yRWFjaCgobGluZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChsaW5lLm4pLmFwcGVuZFRvKGxTZWxlY3QpLnZhbChsaW5lLmlkLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCBkZWZhdWx0U2VsLmxpbmVJRCA9PT0gbGluZS5pZCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgRUREQVRELkRpc2FtLmFzc2F5TGluZU9ialNldHNbbWFzdGVyUF1bbmFtZV0gPSBkaXNhbTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICQoZGlzYW0ucm93T2JqKS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgICAgIEVEREFURC5EaXNhbS5jdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0cy5wdXNoKGRpc2FtKTtcbiAgICAgICAgfSk7XG4gICAgfVxufSxcblxuXG5yZW1ha2VJbmZvVGFibGVNZWFzdXJlbWVudFNlY3Rpb246ICgpOiB2b2lkID0+IHtcbiAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudDtcbiAgICAvLyBwdXQgdG9nZXRoZXIgYSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGZvciBtZWFzdXJlbWVudCB0eXBlc1xuICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0YWJsZT4nKVxuICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgLmFwcGVuZFRvKCQoJyNkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNTZWN0aW9uJykucmVtb3ZlQ2xhc3MoJ29mZicpKVxuICAgICAgICAub24oJ2NoYW5nZScsICdpbnB1dFt0eXBlPWhpZGRlbl0nLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIC8vIG9ubHkgd2F0Y2ggZm9yIGNoYW5nZXMgb24gdGhlIGhpZGRlbiBwb3J0aW9uLCBsZXQgYXV0b2NvbXBsZXRlIHdvcmtcbiAgICAgICAgICAgIEVEREFURC51c2VyQ2hhbmdlZE1lYXN1cmVtZW50RGlzYW0oZXYudGFyZ2V0KTtcbiAgICAgICAgfSlbMF07XG4gICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgIC8vIEhlYWRlcnMgZm9yIHRoZSB0YWJsZVxuICAgIHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PiBib2R5Lmluc2VydFJvdygpO1xuICAgICQoJzx0aD4nKS5hdHRyKHsgJ2NvbHNwYW4nOiAyIH0pLmNzcygndGV4dC1hbGlnbicsICdyaWdodCcpLnRleHQoJ0NvbXBhcnRtZW50JykuYXBwZW5kVG8ocm93KTtcbiAgICAkKCc8dGg+JykudGV4dCgnVHlwZScpLmFwcGVuZFRvKHJvdyk7XG4gICAgJCgnPHRoPicpLnRleHQoRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PT0gJ3N0ZCcgPyAnVW5pdHMnIDogJycpLmFwcGVuZFRvKHJvdyk7XG4gICAgLy8gRG9uZSB3aXRoIGhlYWRlcnMgcm93XG4gICAgRUREQVRELkRpc2FtLmN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHMgPSBbXTsgICAvLyBGb3IgdXNlIGluIGNhc2NhZGluZyB1c2VyIHNldHRpbmdzXG4gICAgRUREQVRELlNldHMudW5pcXVlTWVhc3VyZW1lbnROYW1lcy5mb3JFYWNoKChuYW1lOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgZGlzYW06IGFueTtcbiAgICAgICAgZGlzYW0gPSBFRERBVEQuRGlzYW0ubWVhc3VyZW1lbnRPYmpTZXRzW25hbWVdO1xuICAgICAgICBpZiAoZGlzYW0gJiYgZGlzYW0ucm93T2JqKSB7XG4gICAgICAgICAgICAkKGRpc2FtLnJvd09iaikuYXBwZW5kVG8oYm9keSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkaXNhbSA9IHt9O1xuICAgICAgICAgICAgZGlzYW0ucm93T2JqID0gcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+IGJvZHkuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQobmFtZSkuYXBwZW5kVG8ocm93Lmluc2VydENlbGwoKSk7XG4gICAgICAgICAgICBbJ2NvbXBPYmonLCAndHlwZU9iaicsICd1bml0c09iaiddLmZvckVhY2goKGF1dG86IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjZWxsOiBKUXVlcnkgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmFkZENsYXNzKCdkaXNhbURhdGFDZWxsJyk7XG4gICAgICAgICAgICAgICAgZGlzYW1bYXV0b10gPSBFRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlKGNlbGwpLmRhdGEoJ3R5cGUnLCBhdXRvKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgRUREQVRELkRpc2FtLm1lYXN1cmVtZW50T2JqU2V0c1tuYW1lXSA9IGRpc2FtO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE8gc2l6aW5nIHNob3VsZCBiZSBoYW5kbGVkIGluIENTU1xuICAgICAgICBkaXNhbS5jb21wT2JqLmF0dHIoJ3NpemUnLCA0KS5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKVxuICAgICAgICAgICAgLm5leHQoKS5hdHRyKCduYW1lJywgJ2Rpc2FtTUNvbXAnICsgKGkgKyAxKSk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS5jb21wT2JqLCAnTWVhc3VyZW1lbnRDb21wYXJ0bWVudCcsIEVEREFURC5BdXRvQ2FjaGUuY29tcCk7XG4gICAgICAgIGRpc2FtLnR5cGVPYmouYXR0cignc2l6ZScsIDQ1KS5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKVxuICAgICAgICAgICAgLm5leHQoKS5hdHRyKCduYW1lJywgJ2Rpc2FtTVR5cGUnICsgKGkgKyAxKSk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS50eXBlT2JqLCAnR2VuZXJpY09yTWV0YWJvbGl0ZScsIEVEREFURC5BdXRvQ2FjaGUubWV0YWJvbGl0ZSk7XG4gICAgICAgIEVERF9hdXRvLmluaXRpYWxfc2VhcmNoKGRpc2FtLnR5cGVPYmosIG5hbWUpO1xuICAgICAgICBkaXNhbS51bml0c09iai5hdHRyKCdzaXplJywgMTApLmRhdGEoJ3Zpc2libGVJbmRleCcsIGkpXG4gICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NVW5pdHMnICsgKGkgKyAxKSk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShkaXNhbS51bml0c09iaiwgJ01lYXN1cmVtZW50VW5pdCcsIEVEREFURC5BdXRvQ2FjaGUudW5pdCk7XG4gICAgICAgIC8vIElmIHdlJ3JlIGluIE1EViBtb2RlLCB0aGUgdW5pdHMgcHVsbGRvd25zIGFyZSBpcnJlbGV2YW50LlxuICAgICAgICBkaXNhbS51bml0c09iai50b2dnbGVDbGFzcygnb2ZmJywgRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PT0gJ21kdicpO1xuICAgIH0pO1xuICAgIEVEREFURC5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSgpO1xufSxcblxuXG5yZW1ha2VJbmZvVGFibGVNZXRhZGF0YVNlY3Rpb246ICgpOiB2b2lkID0+IHtcbiAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudDtcbiAgICAvLyBwdXQgdG9nZXRoZXIgYSBkaXNhbWJpZ3VhdGlvbiBzZWN0aW9uIGZvciBtZXRhZGF0YVxuICAgIHRhYmxlID0gPEhUTUxUYWJsZUVsZW1lbnQ+ICQoJzx0YWJsZT4nKVxuICAgICAgICAuYXR0cih7ICdpZCc6ICdkaXNhbWJpZ3VhdGVNZXRhZGF0YVRhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAuYXBwZW5kVG8oJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgLm9uKCdjaGFuZ2UnLCAnaW5wdXQnLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIC8vIHNob3VsZCB0aGVyZSBiZSBldmVudCBoYW5kbGluZyBoZXJlID9cbiAgICAgICAgfSlbMF07XG4gICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgIEVEREFURC5TZXRzLnVuaXF1ZU1ldGFkYXRhTmFtZXMuZm9yRWFjaCgobmFtZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIGRpc2FtOiBhbnk7XG4gICAgICAgIGRpc2FtID0gRUREQVRELkRpc2FtLm1ldGFkYXRhT2JqU2V0c1tuYW1lXTtcbiAgICAgICAgaWYgKGRpc2FtICYmIGRpc2FtLnJvd09iaikge1xuICAgICAgICAgICAgJChkaXNhbS5yb3dPYmopLmFwcGVuZFRvKGJvZHkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGlzYW0gPSB7fTtcbiAgICAgICAgICAgIGRpc2FtLnJvd09iaiA9IHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PiBib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KG5hbWUpLmFwcGVuZFRvKHJvdy5pbnNlcnRDZWxsKCkpO1xuICAgICAgICAgICAgZGlzYW0ubWV0YU9iaiA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUocm93Lmluc2VydENlbGwoKSkudmFsKG5hbWUpO1xuICAgICAgICAgICAgRUREQVRELkRpc2FtLm1ldGFkYXRhT2JqU2V0c1tuYW1lXSA9IGRpc2FtO1xuICAgICAgICB9XG4gICAgICAgIGRpc2FtLm1ldGFPYmouYXR0cignbmFtZScsICdkaXNhbU1ldGEnICsgKGkgKyAxKSkuYWRkQ2xhc3MoJ2F1dG9jb21wX2FsdHlwZScpXG4gICAgICAgICAgICAubmV4dCgpLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhSGlkZGVuJyArIChpICsgMSkpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZGlzYW0ubWV0YU9iaiwgJ0Fzc2F5TGluZU1ldGFkYXRhVHlwZScsIEVEREFURC5BdXRvQ2FjaGUubWV0YSk7XG4gICAgfSk7XG59LFxuXG5cbi8vIENyZWF0ZSB0aGUgU3RlcCA0IHRhYmxlOiAgQSBzZXQgb2Ygcm93cywgb25lIGZvciBlYWNoIHktYXhpcyBjb2x1bW4gb2YgZGF0YSxcbi8vIHdoZXJlIHRoZSB1c2VyIGNhbiBmaWxsIG91dCBhZGRpdGlvbmFsIGluZm9ybWF0aW9uIGZvciB0aGUgcGFzdGVkIHRhYmxlLlxucmVtYWtlSW5mb1RhYmxlOiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIG1hc3RlclAgPSBFRERBVEQubWFzdGVyUHJvdG9jb2w7ICAgIC8vIFNob3V0LW91dHMgdG8gYSBtaWQtZ3JhZGUgcmFwcGVyXG4gICAgLy8gSW5pdGlhbGx5IGhpZGUgYWxsIHRoZSBTdGVwIDQgbWFzdGVyIHB1bGxkb3ducyBzbyB3ZSBjYW4gcmV2ZWFsIGp1c3QgdGhlIG9uZXMgd2UgbmVlZCBsYXRlclxuICAgICQoJyNtYXN0ZXJBc3NheUxpbmVEaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgJCgnI21hc3Rlck1UeXBlRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICQoJyNkaXNhbWJpZ3VhdGVMaW5lc0Fzc2F5c1NlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1NlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhU2VjdGlvbicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAkKCcjZGlzYW1iaWd1YXRlQXNzYXlzVGFibGUnKS5yZW1vdmUoKTtcbiAgICAkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzVGFibGUnKS5yZW1vdmUoKTtcbiAgICAkKCcjZGlzYW1iaWd1YXRlTWV0YWRhdGFUYWJsZScpLnJlbW92ZSgpO1xuICAgIC8vIElmIG5vIHNldHMgdG8gc2hvdywgbGVhdmUgdGhlIGFyZWEgYmxhbmsgYW5kIHNob3cgdGhlICdlbnRlciBzb21lIGRhdGEhJyBiYW5uZXJcbiAgICBpZiAoRUREQVRELlNldHMucGFyc2VkU2V0cy5sZW5ndGggPT09IDApIHsgICBcbiAgICAgICAgJCgnI2VtcHR5RGlzYW1iaWd1YXRpb25MYWJlbCcpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAkKCcjZW1wdHlEaXNhbWJpZ3VhdGlvbkxhYmVsJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgIC8vIElmIHBhcnNlZCBkYXRhIGV4aXN0cywgYnV0IGhhdmVuJ3Qgc2VlbiBhIHNpbmdsZSB0aW1lc3RhbXAgc2hvdyB0aGUgXCJtYXN0ZXIgdGltZXN0YW1wXCIgVUkuXG4gICAgJCgnI21hc3RlclRpbWVzdGFtcERpdicpLnRvZ2dsZUNsYXNzKCdvZmYnLCBFRERBVEQuU2V0cy5zZWVuQW55VGltZXN0YW1wcyk7XG4gICAgLy8gSWYgd2UgaGF2ZSBubyBBc3NheXMvTGluZXMgZGV0ZWN0ZWQgZm9yIGRpc2FtYmlndWF0aW9uLCBhc2sgdGhlIHVzZXIgdG8gc2VsZWN0IG9uZS5cbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlQXNzYXlMaW5lU2VjdGlvbihFRERBVEQubWFzdGVyUHJvdG9jb2wpO1xuICAgIC8vIElmIGluICdUcmFuc2NyaXB0aW9uJyBvciAnUHJvdGVvbWljcycgbW9kZSwgdGhlcmUgYXJlIG5vIG1lYXN1cmVtZW50IHR5cGVzIGludm9sdmVkLlxuICAgIC8vIHNraXAgdGhlIG1lYXN1cmVtZW50IHNlY3Rpb24sIGFuZCBwcm92aWRlIHN0YXRpc3RpY3MgYWJvdXQgdGhlIGdhdGhlcmVkIHJlY29yZHMuXG4gICAgaWYgKEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT09IFwidHJcIiB8fCBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09PSBcInByXCIpIHtcbiAgICAgICAgLy8gbm8tb3BcbiAgICB9IGVsc2UgaWYgKEVEREFURC5TZXRzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMubGVuZ3RoID09PSAwICYmIEVEREFURC5TZXRzLnNlZW5BbnlUaW1lc3RhbXBzKSB7XG4gICAgICAgIC8vIG5vIG1lYXN1cmVtZW50cyBmb3IgZGlzYW1iaWd1YXRpb24sIGhhdmUgdGltZXN0YW1wIGRhdGEgPT4gYXNrIHRoZSB1c2VyIHRvIHNlbGVjdCBvbmVcbiAgICAgICAgJCgnI21hc3Rlck1UeXBlRGl2JykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGhhdmUgbWVhc3VyZW1lbnQgdHlwZXMsIGluIGFwcHJvcHJhdGUgbW9kZSwgcmVtYWtlIG1lYXN1cmVtZW50IHNlY3Rpb25cbiAgICAgICAgRUREQVRELnJlbWFrZUluZm9UYWJsZU1lYXN1cmVtZW50U2VjdGlvbigpO1xuICAgIH1cbiAgICAvLyBJZiB3ZSd2ZSBkZXRlY3RlZCBhbnkgbWV0YWRhdGEgdHlwZXMgZm9yIGRpc2FtYmlndWF0aW9uLCBjcmVhdGUgYSBzZWN0aW9uXG4gICAgaWYgKEVEREFURC5TZXRzLnVuaXF1ZU1ldGFkYXRhTmFtZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlTWV0YWRhdGFTZWN0aW9uKCk7XG4gICAgfVxuICAgIC8vIGlmIHRoZSBkZWJ1ZyBhcmVhIGlzIHRoZXJlLCBzZXQgaXRzIHZhbHVlIHRvIEpTT04gb2YgcGFyc2VkIHNldHNcbiAgICAkKCcjanNvbmRlYnVnYXJlYScpLnZhbChKU09OLnN0cmluZ2lmeShFRERBVEQuU2V0cy5wYXJzZWRTZXRzKSk7XG59LFxuXG5cbi8vIFRoaXMgZnVuY3Rpb24gc2VydmVzIHR3byBwdXJwb3Nlcy5cbi8vIDEuIElmIHRoZSBnaXZlbiBBc3NheSBkaXNhbWJpZ3VhdGlvbiBwdWxsZG93biBpcyBiZWluZyBzZXQgdG8gJ25ldycsIHJldmVhbCB0aGUgYWRqYWNlbnRcbi8vICAgIExpbmUgcHVsbGRvd24sIG90aGVyd2lzZSBoaWRlIGl0LlxuLy8gMi4gSWYgdGhlIHB1bGxkb3duIGlzIGJlaW5nIHNldCB0byAnbmV3Jywgd2FsayBkb3duIHRoZSByZW1haW5pbmcgcHVsbGRvd25zIGluIHRoZSBzZWN0aW9uLFxuLy8gICAgaW4gb3JkZXIsIHNldHRpbmcgdGhlbSB0byAnbmV3JyBhcyB3ZWxsLCBzdG9wcGluZyBqdXN0IGJlZm9yZSBhbnkgcHVsbGRvd24gbWFya2VkIGFzXG4vLyAgICBiZWluZyAnc2V0IGJ5IHRoZSB1c2VyJy5cbnVzZXJDaGFuZ2VkQXNzYXlMaW5lRGlzYW06IChhc3NheUVsOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4gPT4ge1xuICAgIHZhciBjaGFuZ2VkOiBKUXVlcnksIHY6IG51bWJlcjtcbiAgICBjaGFuZ2VkID0gJChhc3NheUVsKS5kYXRhKCdzZXRCeVVzZXInLCB0cnVlKTtcbiAgICAvLyBUaGUgc3BhbiB3aXRoIHRoZSBjb3JyZXNwb25kaW5nIExpbmUgcHVsbGRvd24gaXMgYWx3YXlzIHJpZ2h0IG5leHQgdG8gdGhlIEFzc2F5IHB1bGxkb3duXG4gICAgY2hhbmdlZC5uZXh0KCkudG9nZ2xlQ2xhc3MoJ29mZicsIGNoYW5nZWQudmFsKCkgIT09ICduZXcnKTtcbiAgICBpZiAoY2hhbmdlZC52YWwoKSAhPT0gJ25ldycpIHtcbiAgICAgICAgLy8gc3RvcCBoZXJlIGZvciBhbnl0aGluZyBvdGhlciB0aGFuICduZXcnOyBvbmx5ICduZXcnIGNhc2NhZGVzIHRvIGZvbGxvd2luZyBwdWxsZG93bnNcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICB2ID0gY2hhbmdlZC5kYXRhKCd2aXNpYmxlSW5kZXgnKSB8fCAwO1xuICAgIEVEREFURC5EaXNhbS5jdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0cy5zbGljZSh2KS5mb3JFYWNoKChvYmo6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgc2VsZWN0OiBKUXVlcnkgPSAkKG9iai5hc3NheU9iaik7XG4gICAgICAgIGlmIChzZWxlY3QuZGF0YSgnc2V0QnlVc2VyJykpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBzZXQgZHJvcGRvd24gdG8gJ25ldycgYW5kIHJldmVhbCB0aGUgbGluZSBwdWxsZG93blxuICAgICAgICBzZWxlY3QudmFsKCduZXcnKS5uZXh0KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH0pO1xuICAgIHJldHVybiBmYWxzZTtcbn0sXG5cblxudXNlckNoYW5nZWRNZWFzdXJlbWVudERpc2FtOiAoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICB2YXIgaGlkZGVuOiBKUXVlcnksIGF1dG86IEpRdWVyeSwgdHlwZTogc3RyaW5nLCBpOiBudW1iZXI7XG4gICAgaGlkZGVuID0gJChlbGVtZW50KTtcbiAgICBhdXRvID0gaGlkZGVuLnByZXYoKTtcbiAgICB0eXBlID0gYXV0by5kYXRhKCd0eXBlJyk7XG4gICAgaWYgKHR5cGUgPT09ICdjb21wT2JqJyB8fCB0eXBlID09PSAndW5pdHNPYmonKSB7XG4gICAgICAgIGkgPSBhdXRvLmRhdGEoJ3NldEJ5VXNlcicsIHRydWUpLmRhdGEoJ3Zpc2libGVJbmRleCcpIHx8IDA7XG4gICAgICAgIEVEREFURC5EaXNhbS5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzLnNsaWNlKGkpLnNvbWUoKG9iajogYW55KTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICB2YXIgZm9sbG93aW5nOiBKUXVlcnkgPSAkKG9ialt0eXBlXSk7XG4gICAgICAgICAgICBpZiAoZm9sbG93aW5nLmxlbmd0aCA9PT0gMCB8fCBmb2xsb3dpbmcuZGF0YSgnc2V0QnlVc2VyJykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIGJyZWFrOyBmb3IgdGhlIEFycmF5LnNvbWUoKSBsb29wXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB1c2luZyBwbGFjZWhvbGRlciBpbnN0ZWFkIG9mIHZhbCB0byBhdm9pZCB0cmlnZ2VyaW5nIGF1dG9jb21wbGV0ZSBjaGFuZ2VcbiAgICAgICAgICAgIGZvbGxvd2luZy5hdHRyKCdwbGFjZWhvbGRlcicsIGF1dG8udmFsKCkpO1xuICAgICAgICAgICAgZm9sbG93aW5nLm5leHQoKS52YWwoaGlkZGVuLnZhbCgpKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIG5vdCBjaGVja2luZyB0eXBlT2JqOyBmb3JtIHN1Ym1pdCBzZW5kcyBzZWxlY3RlZCB0eXBlc1xuICAgIEVEREFURC5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbSgpO1xufSxcblxuXG4vLyBSdW4gdGhyb3VnaCB0aGUgbGlzdCBvZiBjdXJyZW50bHkgdmlzaWJsZSBtZWFzdXJlbWVudCBkaXNhbWJpZ3VhdGlvbiBmb3JtIGVsZW1lbnRzLFxuLy8gY2hlY2tpbmcgdG8gc2VlIGlmIGFueSBvZiB0aGUgJ2NvbXBhcnRtZW50JyBlbGVtZW50cyBhcmUgc2V0IHRvIGEgbm9uLWJsYW5rIHZhbHVlLlxuLy8gSWYgYW55IGFyZSwgYW5kIHdlJ3JlIGluIE1EViBkb2N1bWVudCBtb2RlLCBkaXNwbGF5IGEgd2FybmluZyB0aGF0IHRoZSB1c2VyIHNob3VsZFxuLy8gc3BlY2lmeSBjb21wYXJ0bWVudHMgZm9yIGFsbCB0aGVpciBtZWFzdXJlbWVudHMuXG5jaGVja0FsbE1lYXN1cmVtZW50Q29tcGFydG1lbnREaXNhbTogKCk6IHZvaWQgPT4ge1xuICAgIHZhciBhbGxTZXQ6IGJvb2xlYW47XG4gICAgYWxsU2V0ID0gRUREQVRELkRpc2FtLmN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHMuZXZlcnkoKG9iajogYW55KTogYm9vbGVhbiA9PiB7XG4gICAgICAgIHZhciBoaWRkZW46IEpRdWVyeSA9IG9iai5jb21wT2JqLm5leHQoKTtcbiAgICAgICAgaWYgKG9iai5jb21wT2JqLmRhdGEoJ3NldEJ5VXNlcicpIHx8IChoaWRkZW4udmFsKCkgJiYgaGlkZGVuLnZhbCgpICE9PSAnMCcpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSk7XG4gICAgJCgnI25vQ29tcGFydG1lbnRXYXJuaW5nJykudG9nZ2xlQ2xhc3MoJ29mZicsIEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgIT09ICdtZHYnICYmIGFsbFNldCk7XG59LFxuXG5cbmRpc2FtYmlndWF0ZUFuQXNzYXlPckxpbmU6IChhc3NheU9yTGluZTogc3RyaW5nLCBjdXJyZW50SW5kZXg6IG51bWJlcik6IGFueSA9PiB7XG4gICAgdmFyIHNlbGVjdGlvbnM6IGFueSwgaGlnaGVzdDogbnVtYmVyLCBhc3NheXM6IG51bWJlcltdO1xuICAgIHNlbGVjdGlvbnMgPSB7XG4gICAgICAgIGxpbmVJRDowLFxuICAgICAgICBhc3NheUlEOjBcbiAgICB9O1xuICAgIGhpZ2hlc3QgPSAwO1xuICAgIC8vIEFURGF0YS5leGlzdGluZ0Fzc2F5cyBpcyB0eXBlIHtbaW5kZXg6IHN0cmluZ106IG51bWJlcltdfVxuICAgIGFzc2F5cyA9IEFURGF0YS5leGlzdGluZ0Fzc2F5c1tFRERBVEQubWFzdGVyUHJvdG9jb2xdIHx8IFtdO1xuICAgIGFzc2F5cy5ldmVyeSgoaWQ6IG51bWJlciwgaTogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gICAgICAgIHZhciBhc3NheTogQXNzYXlSZWNvcmQsIGxpbmU6IExpbmVSZWNvcmQsIHByb3RvY29sOiBhbnksIG5hbWU6IHN0cmluZztcbiAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpZF07XG4gICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgbmFtZSA9IFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKTtcbiAgICAgICAgaWYgKGFzc2F5T3JMaW5lLnRvTG93ZXJDYXNlKCkgPT09IG5hbWUudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgLy8gVGhlIGZ1bGwgQXNzYXkgbmFtZSwgZXZlbiBjYXNlLWluc2Vuc2l0aXZlLCBpcyB0aGUgYmVzdCBtYXRjaFxuICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7ICAvLyBkbyBub3QgbmVlZCB0byBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjggJiYgYXNzYXlPckxpbmUgPT09IGFzc2F5Lm5hbWUpIHtcbiAgICAgICAgICAgIC8vIEFuIGV4YWN0LWNhc2UgbWF0Y2ggd2l0aCB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCBhbG9uZSBpcyBzZWNvbmQtYmVzdC5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjg7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC43ICYmIGFzc2F5Lm5hbWUuaW5kZXhPZihhc3NheU9yTGluZSkgPj0gMCkge1xuICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgd2hvbGUgc3RyaW5nIGluc2lkZSB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCBpcyBwcmV0dHkgZ29vZFxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuNztcbiAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjYgJiYgbGluZS5uYW1lLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIHdob2xlIHN0cmluZyBpbnNpZGUgdGhlIG9yaWdpbmF0aW5nIExpbmUgbmFtZSBpcyBnb29kIHRvby5cbiAgICAgICAgICAgIC8vIEl0IG1lYW5zIHRoYXQgdGhlIHVzZXIgbWF5IGludGVuZCB0byBwYWlyIHdpdGggdGhpcyBBc3NheSBldmVuIHRob3VnaCB0aGVcbiAgICAgICAgICAgIC8vIEFzc2F5IG5hbWUgaXMgZGlmZmVyZW50LiAgXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC42O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNCAmJlxuICAgICAgICAgICAgICAgIChuZXcgUmVnRXhwKCcoXnxcXFxcVyknICsgYXNzYXkubmFtZSArICcoXFxcXFd8JCknLCAnZycpKS50ZXN0KGFzc2F5T3JMaW5lKSkge1xuICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgQXNzYXkgbmFtZSBmcmFnbWVudCB3aXRoaW4gdGhlIHdob2xlIHN0cmluZywgYXMgYSB3aG9sZSB3b3JkLCBpcyBvdXJcbiAgICAgICAgICAgIC8vIGxhc3Qgb3B0aW9uLlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuNDtcbiAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjMgJiYgY3VycmVudEluZGV4ID09PSBpKSB7XG4gICAgICAgICAgICAvLyBJZiBhbGwgZWxzZSBmYWlscywgY2hvb3NlIEFzc2F5IG9mIGN1cnJlbnQgaW5kZXggaW4gc29ydGVkIG9yZGVyLlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuMztcbiAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICAgIC8vIE5vdyB3ZSByZXBlYXQgdGhlIHByYWN0aWNlLCBzZXBhcmF0ZWx5LCBmb3IgdGhlIExpbmUgcHVsbGRvd24uXG4gICAgaGlnaGVzdCA9IDA7XG4gICAgLy8gQVREYXRhLmV4aXN0aW5nTGluZXMgaXMgdHlwZSB7aWQ6IG51bWJlcjsgbjogc3RyaW5nO31bXVxuICAgIChBVERhdGEuZXhpc3RpbmdMaW5lcyB8fCBbXSkuZXZlcnkoKGxpbmU6IGFueSwgaTogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG4gICAgICAgIGlmIChhc3NheU9yTGluZSA9PT0gbGluZS5uKSB7XG4gICAgICAgICAgICAvLyBUaGUgTGluZSBuYW1lLCBjYXNlLXNlbnNpdGl2ZSwgaXMgdGhlIGJlc3QgbWF0Y2hcbiAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTsgIC8vIGRvIG5vdCBuZWVkIHRvIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuOCAmJiBhc3NheU9yTGluZS50b0xvd2VyQ2FzZSgpID09PSBsaW5lLm4udG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHNhbWUgdGhpbmcgY2FzZS1pbnNlbnNpdGl2ZSBpcyBzZWNvbmQgYmVzdC5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjg7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNyAmJiBhc3NheU9yTGluZS5pbmRleE9mKGxpbmUubikgPj0gMCkge1xuICAgICAgICAgICAgLy8gRmluZGluZyB0aGUgTGluZSBuYW1lIHdpdGhpbiB0aGUgc3RyaW5nIGlzIG9kZCwgYnV0IGdvb2QuXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC43O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjYgJiYgbGluZS5uLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIHN0cmluZyB3aXRoaW4gdGhlIExpbmUgbmFtZSBpcyBhbHNvIGdvb2QuXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC42O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjUgJiYgY3VycmVudEluZGV4ID09PSBpKSB7XG4gICAgICAgICAgICAvLyBBZ2FpbiwgaWYgYWxsIGVsc2UgZmFpbHMsIGp1c3QgY2hvb3NlIHRoZSBMaW5lIHRoYXQgbWF0Y2hlcyB0aGUgY3VycmVudCBpbmRleFxuICAgICAgICAgICAgLy8gaW4gc29ydGVkIG9yZGVyLCBpbiBhIGxvb3AuXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC41O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICAgIHJldHVybiBzZWxlY3Rpb25zO1xufSxcblxuXG5oaWdobGlnaHRlckY6IChlOiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgdmFyIGNlbGw6IEpRdWVyeSwgeDogbnVtYmVyLCB5OiBudW1iZXI7XG4gICAgLy8gV2FsayB1cCB0aGUgaXRlbSB0cmVlIHVudGlsIHdlIGFycml2ZSBhdCBhIHRhYmxlIGNlbGwsXG4gICAgLy8gc28gd2UgY2FuIGdldCB0aGUgaW5kZXggb2YgdGhlIHRhYmxlIGNlbGwgaW4gdGhlIHRhYmxlLlxuICAgIGNlbGwgPSAkKGUudGFyZ2V0KS5jbG9zZXN0KCd0ZCcpO1xuICAgIGlmIChjZWxsLmxlbmd0aCkge1xuICAgICAgICB4ID0gcGFyc2VJbnQoY2VsbC5hdHRyKCd4JyksIDEwKTtcbiAgICAgICAgeSA9IHBhcnNlSW50KGNlbGwuYXR0cigneScpLCAxMCk7XG4gICAgICAgIGlmICh4KSB7XG4gICAgICAgICAgICAkKEVEREFURC5UYWJsZS5jb2xPYmplY3RzW3ggLSAxXSkudG9nZ2xlQ2xhc3MoJ2hvdmVyTGluZXMnLCBlLnR5cGUgPT09ICdtb3VzZW92ZXInKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeSkge1xuICAgICAgICAgICAgY2VsbC5jbG9zZXN0KCd0cicpLnRvZ2dsZUNsYXNzKCdob3ZlckxpbmVzJywgZS50eXBlID09PSAnbW91c2VvdmVyJyk7XG4gICAgICAgIH1cbiAgICB9XG59LFxuXG5cbnNpbmdsZVZhbHVlRGlzYWJsZXJGOiAoZTogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgIC8vIFdhbGsgdXAgdGhlIGl0ZW0gdHJlZSB1bnRpbCB3ZSBhcnJpdmUgYXQgYSB0YWJsZSBjZWxsLFxuICAgIC8vIHNvIHdlIGNhbiBnZXQgdGhlIGluZGV4IG9mIHRoZSB0YWJsZSBjZWxsIGluIHRoZSB0YWJsZS5cbiAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICBpZiAoY2VsbC5sZW5ndGgpIHtcbiAgICAgICAgeCA9IHBhcnNlSW50KGNlbGwuYXR0cigneCcpLCAxMCk7XG4gICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICBpZiAoeCAmJiB5ICYmIHggPiAwICYmIHkgPiAwKSB7XG4gICAgICAgICAgICAtLXg7XG4gICAgICAgICAgICAtLXk7XG4gICAgICAgICAgICBpZiAoRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdKSB7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgICAgICAgICBFRERBVEQucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICAgICAgRUREQVRELnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgICAgICB9XG4gICAgfVxufSxcblxuXG5nZW5lcmF0ZUZvcm1TdWJtaXNzaW9uOiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIGpzb246IHN0cmluZztcbiAgICAvLyBSdW4gdGhyb3VnaCB0aGUgZGF0YSBzZXRzIG9uZSBtb3JlIHRpbWUsIHB1bGxpbmcgb3V0IGFueSB2YWx1ZXMgaW4gdGhlIHB1bGxkb3ducyBhbmRcbiAgICAvLyBhdXRvY29tcGxldGUgZWxlbWVudHMgaW4gU3RlcCA0IGFuZCBlbWJlZGRpbmcgdGhlbSBpbiB0aGVpciByZXNwZWN0aXZlIGRhdGEgc2V0cy5cbiAgICBqc29uID0gSlNPTi5zdHJpbmdpZnkoRUREQVRELlNldHMucGFyc2VkU2V0cyk7XG4gICAgJCgnI2pzb25vdXRwdXQnKS52YWwoanNvbik7XG4gICAgJCgnI2pzb25kZWJ1Z2FyZWEnKS52YWwoanNvbik7XG59LFxuXG5cbi8vIFRoaXMgaGFuZGxlcyBpbnNlcnRpb24gb2YgYSB0YWIgaW50byB0aGUgdGV4dGFyZWEuXG4vLyBNYXkgYmUgZ2xpdGNoeS5cbnN1cHByZXNzTm9ybWFsVGFiOiAoZTogSlF1ZXJ5S2V5RXZlbnRPYmplY3QpOiBib29sZWFuID0+IHtcbiAgICB2YXIgaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQsIHRleHQ6IHN0cmluZztcbiAgICBpZiAoZS53aGljaCA9PT0gOSkge1xuICAgICAgICBpbnB1dCA9IDxIVE1MSW5wdXRFbGVtZW50PiBlLnRhcmdldDtcbiAgICAgICAgdGV4dCA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAvLyBzZXQgdmFsdWUgdG8gaXRzZWxmIHdpdGggc2VsZWN0aW9uIHJlcGxhY2VkIGJ5IGEgdGFiIGNoYXJhY3RlclxuICAgICAgICAkKGlucHV0KS52YWwoW1xuICAgICAgICAgICAgdGV4dC5zdWJzdHJpbmcoMCwgaW5wdXQuc2VsZWN0aW9uU3RhcnQpLFxuICAgICAgICAgICAgdGV4dC5zdWJzdHJpbmcoaW5wdXQuc2VsZWN0aW9uRW5kKVxuICAgICAgICAgICAgXS5qb2luKCdcXHQnKSk7XG4gICAgICAgIC8vIHB1dCBjYXJldCBhdCByaWdodCBwb3NpdGlvbiBhZ2FpblxuICAgICAgICBpbnB1dC5zZWxlY3Rpb25TdGFydCA9IGlucHV0LnNlbGVjdGlvbkVuZCA9IGlucHV0LnNlbGVjdGlvblN0YXJ0ICsgMTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn0sXG5cblxucHJlcGFyZUl0OiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIHJlUHJvY2Vzc09uQ2xpY2s6IHN0cmluZ1tdLCByZURvTGFzdFN0ZXBPbkNoYW5nZTogc3RyaW5nW107XG4gICAgcmVQcm9jZXNzT25DbGljayA9IFsnI3N0ZGxheW91dCcsICcjdHJsYXlvdXQnLCAnI3BybGF5b3V0JywgJyNtZHZsYXlvdXQnLCAnI3Jhd2RhdGFmb3JtYXRwJ107XG4gICAgcmVEb0xhc3RTdGVwT25DaGFuZ2UgPSBbJyNtYXN0ZXJBc3NheScsICcjbWFzdGVyTGluZScsICcjbWFzdGVyTUNvbXAnLCAnI21hc3Rlck1UeXBlJyxcbiAgICAgICAgICAgICcjbWFzdGVyTVVuaXRzJ107XG4gICAgJCgnI3RleHREYXRhJylcbiAgICAgICAgLm9uKCdwYXN0ZScsIEVEREFURC5wYXN0ZWRSYXdEYXRhKVxuICAgICAgICAub24oJ2tleXVwJywgRUREQVRELnBhcnNlQW5kRGlzcGxheVRleHQpXG4gICAgICAgIC5vbigna2V5ZG93bicsIEVEREFURC5zdXBwcmVzc05vcm1hbFRhYik7XG4gICAgJCgnI2RhdGFUYWJsZURpdicpXG4gICAgICAgIC5vbignbW91c2VvdmVyIG1vdXNlb3V0JywgJ3RkJywgRUREQVRELmhpZ2hsaWdodGVyRilcbiAgICAgICAgLm9uKCdkYmxjbGljaycsICd0ZCcsIEVEREFURC5zaW5nbGVWYWx1ZURpc2FibGVyRik7XG4gICAgLy8gVGhpcyBpcyByYXRoZXIgYSBsb3Qgb2YgY2FsbGJhY2tzLCBidXQgd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UncmVcbiAgICAvLyB0cmFja2luZyB0aGUgbWluaW11bSBudW1iZXIgb2YgZWxlbWVudHMgd2l0aCB0aGlzIGNhbGwsIHNpbmNlIHRoZVxuICAgIC8vIGZ1bmN0aW9uIGNhbGxlZCBoYXMgc3VjaCBzdHJvbmcgZWZmZWN0cyBvbiB0aGUgcmVzdCBvZiB0aGUgcGFnZS5cbiAgICAvLyBGb3IgZXhhbXBsZSwgYSB1c2VyIHNob3VsZCBiZSBmcmVlIHRvIGNoYW5nZSBcIm1lcmdlXCIgdG8gXCJyZXBsYWNlXCIgd2l0aG91dCBoYXZpbmdcbiAgICAvLyB0aGVpciBlZGl0cyBpbiBTdGVwIDIgZXJhc2VkLlxuICAgICQoXCIjbWFzdGVyUHJvdG9jb2xcIikuY2hhbmdlKEVEREFURC5jaGFuZ2VkTWFzdGVyUHJvdG9jb2wpO1xuICAgIC8vIFVzaW5nIFwiY2hhbmdlXCIgZm9yIHRoZXNlIGJlY2F1c2UgaXQncyBtb3JlIGVmZmljaWVudCBBTkQgYmVjYXVzZSBpdCB3b3JrcyBhcm91bmQgYW5cbiAgICAvLyBpcnJpdGF0aW5nIENocm9tZSBpbmNvbnNpc3RlbmN5XG4gICAgLy8gRm9yIHNvbWUgb2YgdGhlc2UsIGNoYW5naW5nIHRoZW0gc2hvdWxkbid0IGFjdHVhbGx5IGFmZmVjdCBwcm9jZXNzaW5nIHVudGlsIHdlIGltcGxlbWVudFxuICAgIC8vIGFuIG92ZXJ3cml0ZS1jaGVja2luZyBmZWF0dXJlIG9yIHNvbWV0aGluZyBzaW1pbGFyXG4gICAgJChyZVByb2Nlc3NPbkNsaWNrLmpvaW4oJywnKSkub24oJ2NsaWNrJywgRUREQVRELnF1ZXVlUHJvY2Vzc0ltcG9ydFNldHRpbmdzKTtcbiAgICAkKHJlRG9MYXN0U3RlcE9uQ2hhbmdlLmpvaW4oJywnKSkub24oJ2NoYW5nZScsIEVEREFURC5jaGFuZ2VkQU1hc3RlclB1bGxkb3duKTtcbiAgICAvLyBlbmFibGUgYXV0b2NvbXBsZXRlIG9uIHN0YXRpY2FsbHkgZGVmaW5lZCBmaWVsZHNcbiAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoJyNtYXN0ZXJNQ29tcCcsICdNZWFzdXJlbWVudENvbXBhcnRtZW50Jyk7XG4gICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKCcjbWFzdGVyTVR5cGUnLCAnR2VuZXJpY09yTWV0YWJvbGl0ZScsIEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzIHx8IHt9KTtcbiAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoJyNtYXN0ZXJNVW5pdHMnLCAnTWVhc3VyZW1lbnRVbml0Jyk7XG4gICAgJCgnI2lnbm9yZUdhcHMnKS5jbGljayhFRERBVEQuY2xpY2tlZE9uSWdub3JlRGF0YUdhcHMpO1xuICAgICQoJyN0cmFuc3Bvc2UnKS5jbGljayhFRERBVEQuY2xpY2tlZE9uVHJhbnNwb3NlKTtcbiAgICBFRERBVEQuY2hhbmdlZE1hc3RlclByb3RvY29sKCk7IC8vICBTaW5jZSB0aGUgaW5pdGlhbCBtYXN0ZXJQcm90b2NvbCB2YWx1ZSBpcyB6ZXJvLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IHRyaWdnZXIgdGhpczpcbiAgICBFRERBVEQucXVldWVQcm9jZXNzSW1wb3J0U2V0dGluZ3MoKTtcbn1cblxufTtcbiJdfQ==