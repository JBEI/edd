// Compiled to JS on: Thu Jan 21 2016 17:27:10  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
var _this = this;
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
    },
    disclose: function () {
        $(_this).closest('.disclose').toggleClass('discloseHide');
        return false;
    },
    process_result: function (result) {
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
            $("#rawdataformatp").val("csv");
            $("#textData").text(csv.join("\n"));
        }
        else {
            $("#rawdataformatp").val(result.file_type);
            $("#textData").text(result.file_data);
        }
        EDDATD.parseAndDisplayText(); // AssayTableData.ts
    }
};
$(window).load(function () {
    var url = "/utilities/parsefile";
    var atdata_url = "/study/" + EDDData.currentStudyID + "/assaydata";
    Utl.FileDropZone.setup("textData", url, EDDATD.process_result, false);
    $('.disclose').find('a.discloseLink').on('click', EDDATD.disclose);
    // Populate ATData and EDDData objects via AJAX calls
    jQuery.ajax(atdata_url, {
        "success": function (data) {
            ATData = data.ATData;
            $.extend(EDDData, data.EDDData);
            EDDATD.prepareIt();
        }
    }).fail(function (x, s, e) {
        alert(s);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzYXlUYWJsZURhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJBc3NheVRhYmxlRGF0YS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnREFBZ0Q7QUFDaEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUUvQixpQkE0bERBO0FBMWtEQSxJQUFJLE1BQVUsQ0FBQztBQUVmLE1BQU0sR0FBRztJQUVULG9EQUFvRDtJQUNwRCxjQUFjLEVBQUMsQ0FBQztJQUNoQiw2Q0FBNkM7SUFDN0MsbURBQW1EO0lBQ25ELGtCQUFrQixFQUFDLEtBQUs7SUFDeEIsNEJBQTRCLEVBQUMsQ0FBQztJQUU5QixvRUFBb0U7SUFDcEUsSUFBSSxFQUFDO1FBQ0QsSUFBSSxFQUFDLEVBQUU7UUFDUCxVQUFVLEVBQUMsRUFBRTtRQUNiLFNBQVMsRUFBRSxLQUFLO1FBQ2hCLG9GQUFvRjtRQUNwRixtQ0FBbUM7UUFDbkMsc0JBQXNCLEVBQUUsS0FBSztRQUM3QiwrRUFBK0U7UUFDL0UsbUNBQW1DO1FBQ25DLGNBQWMsRUFBRSxLQUFLO1FBQ3JCLDJCQUEyQixFQUFFLEtBQUs7S0FDckM7SUFFRCw4REFBOEQ7SUFDOUQsS0FBSyxFQUFDO1FBQ0YsYUFBYSxFQUFDLEVBQUU7UUFDaEIsZ0JBQWdCLEVBQUMsRUFBRTtRQUNuQixVQUFVLEVBQUMsRUFBRTtRQUNiLFNBQVMsRUFBQyxFQUFFO1FBRVosa0RBQWtEO1FBQ2xELGdFQUFnRTtRQUNoRSx1QkFBdUI7UUFDdkIsY0FBYyxFQUFDLEVBQUU7UUFDakIsY0FBYyxFQUFDLEVBQUU7UUFDakIsV0FBVyxFQUFDLEVBQUU7UUFFZCwrREFBK0Q7UUFDL0QsbUZBQW1GO1FBQ25GLDBCQUEwQjtRQUMxQixlQUFlLEVBQUMsRUFBRTtRQUNsQixnQkFBZ0IsRUFBQyxFQUFFO1FBQ25CLG9GQUFvRjtRQUNwRiw0QkFBNEI7UUFDNUIsd0JBQXdCLEVBQUMsRUFBRTtLQUM5QjtJQUVELFlBQVksRUFBQyxDQUFDO0lBQ2QsbUJBQW1C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LElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNoQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdkIsQ0FBQztLQUNKLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDcEIsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2IsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBUaHUgSmFuIDIxIDIwMTYgMTc6Mjc6MTAgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG5cbmRlY2xhcmUgdmFyIEFURGF0YTphbnk7IC8vIFNldHVwIGJ5IHRoZSBzZXJ2ZXIuXG5kZWNsYXJlIHZhciBFRERBVERHcmFwaGluZzphbnk7XG5kZWNsYXJlIHZhciBFRERfYXV0bzphbnk7XG5cbi8vIFR5cGUgbmFtZSBmb3IgdGhlIGdyaWQgb2YgdmFsdWVzIHBhc3RlZCBpblxuaW50ZXJmYWNlIFJhd0lucHV0IGV4dGVuZHMgQXJyYXk8c3RyaW5nW10+IHt9XG4vLyB0eXBlIGZvciB0aGUgc3RhdHMgZ2VuZXJhdGVkIGZyb20gcGFyc2luZyBpbnB1dCB0ZXh0XG5pbnRlcmZhY2UgUmF3SW5wdXRTdGF0IHtcbiAgICBpbnB1dDogUmF3SW5wdXQ7XG4gICAgY29sdW1uczogbnVtYmVyO1xufVxuLy8gdHlwZSBmb3IgdGhlIG9wdGlvbnMgaW4gcm93IHB1bGxkb3duc1xuLy8gVE9ETyB1cGRhdGUgdG8gdXNlIHVuaW9ucyB3aGVuIG1pZ3JhdGluZyB0byBUeXBlc2NyaXB0IDEuNCtcbmludGVyZmFjZSBSb3dQdWxsZG93bk9wdGlvbiBleHRlbmRzIEFycmF5PGFueT4geyAvLyBBcnJheTxzdHJpbmd8bnVtYmVyfFJvd1B1bGxkb3duT3B0aW9uW10+XG4gICAgMDogc3RyaW5nO1xuICAgIDE6IGFueTsgLy8gbnVtYmVyIHwgUm93UHVsbGRvd25PcHRpb25bXVxufVxuXG52YXIgRUREQVREOmFueTtcblxuRUREQVREID0ge1xuXG4vLyBUaGUgUHJvdG9jb2wgZm9yIHdoaWNoIHdlIHdpbGwgYmUgaW1wb3J0aW5nIGRhdGEuXG5tYXN0ZXJQcm90b2NvbDowLFxuLy8gVGhlIG1haW4gbW9kZSB3ZSBhcmUgaW50ZXJwcmV0aW5nIGRhdGEgaW4uXG4vLyBWYWxpZCB2YWx1ZXMgc29mYXIgYXJlIFwic3RkXCIsIFwibWR2XCIsIFwidHJcIiwgXCJwclwiLlxuaW50ZXJwcmV0YXRpb25Nb2RlOlwic3RkXCIsXG5wcm9jZXNzSW1wb3J0U2V0dGluZ3NUaW1lcklEOjAsXG5cbi8vIFVzZWQgdG8gcGFyc2UgdGhlIFN0ZXAgMiBkYXRhIGludG8gYSBudWxsLXBhZGRlZCByZWN0YW5ndWxhciBncmlkXG5HcmlkOntcbiAgICBkYXRhOltdLFxuICAgIHJvd01hcmtlcnM6W10sXG4gICAgdHJhbnNwb3NlOiBmYWxzZSxcbiAgICAvLyBJZiB0aGUgdXNlciBkZWxpYmVyYXRlbHkgY2hvc2UgdG8gdHJhbnNwb3NlIG9yIG5vdCB0cmFuc3Bvc2UsIGRpc2FibGUgdGhlIGF0dGVtcHRcbiAgICAvLyB0byBhdXRvLWRldGVybWluZSB0cmFuc3Bvc2l0aW9uLlxuICAgIHVzZXJDbGlja2VkT25UcmFuc3Bvc2U6IGZhbHNlLFxuICAgIC8vIFdoZXRoZXIgdG8gaW50ZXJwcmV0IHRoZSBwYXN0ZWQgZGF0YSByb3ctd2lzZSBvciBjb2x1bW4td2lzZSwgd2hlbiBpbXBvcnRpbmdcbiAgICAvLyBlaXRoZXIgbWVhc3VyZW1lbnRzIG9yIG1ldGFkYXRhLlxuICAgIGlnbm9yZURhdGFHYXBzOiBmYWxzZSxcbiAgICB1c2VyQ2xpY2tlZE9uSWdub3JlRGF0YUdhcHM6IGZhbHNlXG59LFxuXG4vLyBVc2VkIHRvIGFzc2VtYmxlIGFuZCBkaXNwbGF5IHRoZSB0YWJsZSBjb21wb25lbnRzIGluIFN0ZXAgM1xuVGFibGU6e1xuICAgIHJvd0xhYmVsQ2VsbHM6W10sXG4gICAgY29sQ2hlY2tib3hDZWxsczpbXSxcbiAgICBjb2xPYmplY3RzOltdLFxuICAgIGRhdGFDZWxsczpbXSxcblxuICAgIC8vIFdlIGtlZXAgYSBzaW5nbGUgZmxhZyBmb3IgZWFjaCBkYXRhIHBvaW50IFt5LHhdXG4gICAgLy8gYXMgd2VsbCBhcyB0d28gbGluZWFyIHNldHMgb2YgZmxhZ3MgZm9yIGVuYWJsaW5nIG9yIGRpc2FibGluZ1xuICAgIC8vIGVudGlyZSBjb2x1bW5zL3Jvd3MuXG4gICAgYWN0aXZlQ29sRmxhZ3M6W10sXG4gICAgYWN0aXZlUm93RmxhZ3M6W10sXG4gICAgYWN0aXZlRmxhZ3M6W10sXG5cbiAgICAvLyBBcnJheXMgZm9yIHRoZSBwdWxsZG93biBtZW51cyBvbiB0aGUgbGVmdCBzaWRlIG9mIHRoZSB0YWJsZS5cbiAgICAvLyBUaGVzZSBwdWxsZG93bnMgYXJlIHVzZWQgdG8gc3BlY2lmeSB0aGUgZGF0YSB0eXBlIC0gb3IgdHlwZXMgLSBjb250YWluZWQgaW4gZWFjaFxuICAgIC8vIHJvdyBvZiB0aGUgcGFzdGVkIGRhdGEuXG4gICAgcHVsbGRvd25PYmplY3RzOltdLFxuICAgIHB1bGxkb3duU2V0dGluZ3M6W10sXG4gICAgLy8gV2UgYWxzbyBrZWVwIGEgc2V0IG9mIGZsYWdzIHRvIHRyYWNrIHdoZXRoZXIgYSBwdWxsZG93biB3YXMgY2hhbmdlZCBieSBhIHVzZXIgYW5kXG4gICAgLy8gd2lsbCBub3QgYmUgcmVjYWxjdWxhdGVkLlxuICAgIHB1bGxkb3duVXNlckNoYW5nZWRGbGFnczpbXVxufSxcblxuZ3JhcGhFbmFibGVkOjEsXG5ncmFwaFJlZnJlc2hUaW1lcklEOjAsXG5cbi8vIERhdGEgc3RydWN0dXJlcyBwdWxsZWQgZnJvbSB0aGUgZ3JpZCBhbmQgY29tcG9zZWQgaW50byBzZXRzIHN1aXRhYmxlIGZvciBoYW5kaW5nIHRvXG4vLyB0aGUgRUREIHNlcnZlclxuU2V0czp7XG4gICAgcGFyc2VkU2V0czpbXSxcbiAgICB1bmlxdWVMaW5lQXNzYXlOYW1lczpbXSxcbiAgICB1bmlxdWVNZWFzdXJlbWVudE5hbWVzOltdLFxuICAgIHVuaXF1ZU1ldGFkYXRhTmFtZXM6W10sXG4gICAgLy8gQSBmbGFnIHRvIGluZGljYXRlIHdoZXRoZXIgd2UgaGF2ZSBzZWVuIGFueSB0aW1lc3RhbXBzIHNwZWNpZmllZCBpbiB0aGUgaW1wb3J0IGRhdGFcbiAgICBzZWVuQW55VGltZXN0YW1wczogZmFsc2Vcbn0sXG5cbi8vIFN0b3JhZ2UgYXJlYSBmb3IgZGlzYW1iaWd1YXRpb24tcmVsYXRlZCBVSSB3aWRnZXRzIGFuZCBpbmZvcm1hdGlvblxuRGlzYW06e1xuICAgIC8vIFRoZXNlIG9iamVjdHMgaG9sZCBzdHJpbmcga2V5cyB0aGF0IGNvcnJlc3BvbmQgdG8gdW5pcXVlIG5hbWVzIGZvdW5kIGR1cmluZyBwYXJzaW5nLlxuICAgIC8vIFRoZSBzdHJpbmcga2V5cyBwb2ludCB0byBleGlzdGluZyBhdXRvY29tcGxldGUgb2JqZWN0cyBjcmVhdGVkIHNwZWNpZmljYWxseSBmb3JcbiAgICAvLyB0aG9zZSBzdHJpbmdzLiBBcyB0aGUgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBpcyBkZXN0cm95ZWQgYW5kIHJlbWFkZSwgYW55IHNlbGVjdGlvbnNcbiAgICAvLyB0aGUgdXNlciBoYXMgYWxyZWFkeSBzZXQgd2lsbCBwZXJzZXZlcmUuXG4gICAgLy8gRm9yIGRpc2FtYnVndWF0aW5nIEFzc2F5cy9MaW5lc1xuICAgIGFzc2F5TGluZU9ialNldHM6e30sXG4gICAgY3VycmVudGx5VmlzaWJsZUFzc2F5TGluZU9ialNldHM6W10sXG4gICAgLy8gRm9yIGRpc2FtYnVndWF0aW5nIG1lYXN1cmVtZW50IHR5cGVzXG4gICAgbWVhc3VyZW1lbnRPYmpTZXRzOnt9LFxuICAgIGN1cnJlbnRseVZpc2libGVNZWFzdXJlbWVudE9ialNldHM6W10sXG4gICAgLy8gRm9yIGRpc2FtYnVndWF0aW5nIG1ldGFkYXRhXG4gICAgbWV0YWRhdGFPYmpTZXRzOnt9LFxuICAgIC8vIFRvIGdpdmUgdW5pcXVlIElEIHZhbHVlcyB0byBlYWNoIGF1dG9jb21wbGV0ZSBlbnRpdHkgd2UgY3JlYXRlXG4gICAgYXV0b0NvbXBVSUQ6MFxufSxcblxuQXV0b0NhY2hlOiB7XG4gICAgY29tcDoge30sXG4gICAgbWV0YToge30sXG4gICAgdW5pdDoge30sXG4gICAgbWV0YWJvbGl0ZToge31cbn0sXG5cblxuY2hhbmdlZE1hc3RlclByb3RvY29sOiAoKTp2b2lkID0+IHtcbiAgICB2YXIgcHJvdG9jb2xJbjpKUXVlcnksIGFzc2F5SW46SlF1ZXJ5LCBjdXJyZW50QXNzYXlzOm51bWJlcltdO1xuICAgIC8vIGNoZWNrIG1hc3RlciBwcm90b2NvbFxuICAgIHByb3RvY29sSW4gPSAkKCcjbWFzdGVyUHJvdG9jb2wnKTtcbiAgICBpZiAocHJvdG9jb2xJbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoRUREQVRELm1hc3RlclByb3RvY29sID09PSBwYXJzZUludChwcm90b2NvbEluLnZhbCgpLCAxMCkpIHtcbiAgICAgICAgLy8gbm8gY2hhbmdlXG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgRUREQVRELm1hc3RlclByb3RvY29sID0gcGFyc2VJbnQocHJvdG9jb2xJbi52YWwoKSwgMTApO1xuICAgIC8vIGNoZWNrIGZvciBtYXN0ZXIgYXNzYXlcbiAgICBhc3NheUluID0gJCgnI21hc3RlckFzc2F5JykuZW1wdHkoKTtcbiAgICBpZiAoYXNzYXlJbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKGFzc2F5SW4pLnZhbCgnbmV3JykucHJvcCgnc2VsZWN0ZWQnLCB0cnVlKTtcbiAgICBjdXJyZW50QXNzYXlzID0gQVREYXRhLmV4aXN0aW5nQXNzYXlzW3Byb3RvY29sSW4udmFsKCldIHx8IFtdO1xuICAgIGN1cnJlbnRBc3NheXMuZm9yRWFjaCgoaWQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdLFxuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSxcbiAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgJCgnPG9wdGlvbj4nKS5hcHBlbmRUbyhhc3NheUluKS52YWwoJycgKyBpZCkudGV4dChbXG4gICAgICAgICAgICBsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWUgXS5qb2luKCctJykpO1xuICAgIH0pO1xuICAgIGlmICgkKCcjbWFzdGVyTGluZVNwYW4nKS5yZW1vdmVDbGFzcygnb2ZmJykubGVuZ3RoID4gMCkge1xuICAgICAgICBFRERBVEQucXVldWVQcm9jZXNzSW1wb3J0U2V0dGluZ3MoKTtcbiAgICB9XG59LFxuXG5cbnF1ZXVlUHJvY2Vzc0ltcG9ydFNldHRpbmdzOiAoKTp2b2lkID0+IHtcbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZXBhcnNlcyB0aGUgaW1wb3J0IHNldHRpbmdzLlxuICAgIC8vIFRoaXMgd2F5IHdlJ3JlIGNhbGxpbmcgdGhlIHJlcGFyc2UganVzdCBvbmNlLCBldmVuIHdoZW4gd2UgZ2V0IG11bHRpcGxlIGNhc2NhZGVkXG4gICAgLy8gZXZlbnRzIHRoYXQgcmVxdWlyZSBpdC5cbiAgICBpZiAoRUREQVRELnByb2Nlc3NJbXBvcnRTZXR0aW5nc1RpbWVySUQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KEVEREFURC5wcm9jZXNzSW1wb3J0U2V0dGluZ3NUaW1lcklEKTtcbiAgICB9XG4gICAgRUREQVRELnByb2Nlc3NJbXBvcnRTZXR0aW5nc1RpbWVySUQgPSBzZXRUaW1lb3V0KEVEREFURC5wcm9jZXNzSW1wb3J0U2V0dGluZ3MuYmluZChFRERBVEQpLCA1KTtcbn0sXG5cblxucHJvY2Vzc0ltcG9ydFNldHRpbmdzOiAoKTp2b2lkID0+IHtcbiAgICB2YXIgc3RkTGF5b3V0OkpRdWVyeSwgdHJMYXlvdXQ6SlF1ZXJ5LCBwckxheW91dDpKUXVlcnksIG1kdkxheW91dDpKUXVlcnksIGlnbm9yZUdhcHM6SlF1ZXJ5LFxuICAgICAgICB0cmFuc3Bvc2U6SlF1ZXJ5LCBncmFwaDpKUXVlcnksIHJhd0Zvcm1hdDpKUXVlcnk7XG4gICAgc3RkTGF5b3V0ID0gJCgnI3N0ZGxheW91dCcpO1xuICAgIHRyTGF5b3V0ID0gJCgnI3RybGF5b3V0Jyk7XG4gICAgcHJMYXlvdXQgPSAkKCcjcHJsYXlvdXQnKTtcbiAgICBtZHZMYXlvdXQgPSAkKCcjbWR2bGF5b3V0Jyk7XG4gICAgaWdub3JlR2FwcyA9ICQoJyNpZ25vcmVHYXBzJyk7XG4gICAgdHJhbnNwb3NlID0gJCgnI3RyYW5zcG9zZScpO1xuICAgIGdyYXBoID0gJCgnI2dyYXBoRGl2Jyk7XG4gICAgcmF3Rm9ybWF0ID0gJCgnI3Jhd2RhdGFmb3JtYXRwJyk7XG4gICAgLy8gYWxsIG5lZWQgdG8gZXhpc3QsIG9yIHBhZ2UgaXMgYnJva2VuXG4gICAgaWYgKCFbIHN0ZExheW91dCwgdHJMYXlvdXQsIHByTGF5b3V0LCBtZHZMYXlvdXQsIGlnbm9yZUdhcHMsIHRyYW5zcG9zZSwgZ3JhcGgsIHJhd0Zvcm1hdFxuICAgICAgICAgICAgXS5ldmVyeSgoaXRlbSk6Ym9vbGVhbiA9PiBpdGVtLmxlbmd0aCAhPT0gMCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChzdGRMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7IC8vICBTdGFuZGFyZCBpbnRlcnByZXRhdGlvbiBtb2RlXG4gICAgICAgIEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPSAnc3RkJztcbiAgICAgICAgZ3JhcGgucmVtb3ZlQ2xhc3MoJ29mZicpOyAgLy8gQnkgZGVmYXVsdCB3ZSB3aWxsIGF0dGVtcHQgdG8gc2hvdyBhIGdyYXBoXG4gICAgICAgIEVEREFURC5ncmFwaEVuYWJsZWQgPSAxO1xuICAgIH0gZWxzZSBpZiAodHJMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7ICAgLy8gIFRyYW5zY3JpcHRvbWljcyBtb2RlXG4gICAgICAgIEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPSAndHInO1xuICAgICAgICBncmFwaC5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIEVEREFURC5ncmFwaEVuYWJsZWQgPSAwO1xuICAgIH0gZWxzZSBpZiAocHJMYXlvdXQucHJvcCgnY2hlY2tlZCcpKSB7ICAgLy8gIFByb3Rlb21pY3MgbW9kZVxuICAgICAgICBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID0gJ3ByJztcbiAgICAgICAgZ3JhcGguYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICBFRERBVEQuZ3JhcGhFbmFibGVkID0gMDtcbiAgICB9IGVsc2UgaWYgKG1kdkxheW91dC5wcm9wKCdjaGVja2VkJykpIHsgIC8vIEpCRUkgTWFzcyBEaXN0cmlidXRpb24gVmVjdG9yIGZvcm1hdFxuICAgICAgICBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID0gJ21kdic7XG4gICAgICAgIGdyYXBoLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgRUREQVRELmdyYXBoRW5hYmxlZCA9IDA7XG4gICAgICAgIC8vIFdlIG5laXRoZXIgaWdub3JlIGdhcHMsIG5vciB0cmFuc3Bvc2UsIGZvciBNRFYgZG9jdW1lbnRzXG4gICAgICAgIGlnbm9yZUdhcHMucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgdHJhbnNwb3NlLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgIC8vIEpCRUkgTURWIGZvcm1hdCBkb2N1bWVudHMgYXJlIGFsd2F5cyBwYXN0ZWQgaW4gZnJvbSBFeGNlbCwgc28gdGhleSdyZSBhbHdheXMgdGFiLXNlcGFyYXRlZFxuICAgICAgICByYXdGb3JtYXQudmFsKCd0YWInKTtcbiAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3MgPSBbMSwgNV07IC8vIEEgZGVmYXVsdCBzZXQgb2YgcHVsbGRvd24gc2V0dGluZ3MgZm9yIHRoaXMgbW9kZVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIG5vbmUgb2YgdGhlbSBhcmUgY2hlY2tlZCAtIFdURj8gIERvbid0IHBhcnNlIG9yIGNoYW5nZSBhbnl0aGluZy5cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBFRERBVEQuR3JpZC5pZ25vcmVEYXRhR2FwcyA9IGlnbm9yZUdhcHMucHJvcCgnY2hlY2tlZCcpO1xuICAgIEVEREFURC5HcmlkLnRyYW5zcG9zZSA9IHRyYW5zcG9zZS5wcm9wKCdjaGVja2VkJyk7XG4gICAgRUREQVRELnBhcnNlQW5kRGlzcGxheVRleHQoKTtcbn0sXG5cblxuLy8gVGhpcyBnZXRzIGNhbGxlZCB3aGVuIHRoZXJlIGlzIGEgcGFzdGUgZXZlbnQuXG5wYXN0ZWRSYXdEYXRhOiAoKTp2b2lkID0+IHtcbiAgICAvLyBXZSBkbyB0aGlzIHVzaW5nIGEgdGltZW91dCBzbyB0aGUgcmVzdCBvZiB0aGUgcGFzdGUgZXZlbnRzIGZpcmUsIGFuZCBnZXQgdGhlIHBhc3RlZCByZXN1bHQuXG4gICAgd2luZG93LnNldFRpbWVvdXQoKCk6dm9pZCA9PiB7XG4gICAgICAgIGlmIChFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlICE9PSBcIm1kdlwiKSB7XG4gICAgICAgICAgICB2YXIgdGV4dDpzdHJpbmcgPSAkKCcjdGV4dERhdGEnKS52YWwoKSB8fCAnJywgdGVzdDpib29sZWFuO1xuICAgICAgICAgICAgdGVzdCA9IHRleHQuc3BsaXQoJ1xcdCcpLmxlbmd0aCA+PSB0ZXh0LnNwbGl0KCcsJykubGVuZ3RoO1xuICAgICAgICAgICAgJCgnI3Jhd2RhdGFmb3JtYXRwJykudmFsKHRlc3QgPyAndGFiJyA6ICdjc3YnKTtcbiAgICAgICAgfVxuICAgIH0sIDEpO1xufSxcblxuXG5wYXJzZVJhd0lucHV0OiAoZGVsaW1pdGVyOiBzdHJpbmcsIG1vZGU6IHN0cmluZyk6UmF3SW5wdXRTdGF0ID0+IHtcbiAgICB2YXIgcmF3VGV4dDpzdHJpbmcsIGxvbmdlc3RSb3c6bnVtYmVyLCByb3dzOlJhd0lucHV0LCBtdWx0aUNvbHVtbjpib29sZWFuO1xuICAgIHJhd1RleHQgPSAkKCcjdGV4dERhdGEnKS52YWwoKTtcbiAgICByb3dzID0gW107XG4gICAgLy8gZmluZCB0aGUgaGlnaGVzdCBudW1iZXIgb2YgY29sdW1ucyBpbiBhIHJvd1xuICAgIGxvbmdlc3RSb3cgPSByYXdUZXh0LnNwbGl0KC9bIFxccl0qXFxuLykucmVkdWNlKChwcmV2Om51bWJlciwgcmF3Um93OiBzdHJpbmcpOm51bWJlciA9PiB7XG4gICAgICAgIHZhciByb3c6c3RyaW5nW107XG4gICAgICAgIGlmIChyYXdSb3cgIT09ICcnKSB7XG4gICAgICAgICAgICByb3cgPSByYXdSb3cuc3BsaXQoZGVsaW1pdGVyKTtcbiAgICAgICAgICAgIHJvd3MucHVzaChyb3cpO1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHJvdy5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcmV2O1xuICAgIH0sIDApO1xuICAgIC8vIHBhZCBvdXQgcm93cyBzbyBpdCBpcyByZWN0YW5ndWxhclxuICAgIGlmIChtb2RlID09PSAnc3RkJyB8fCBtb2RlID09PSAndHInIHx8IG1vZGUgPT09ICdwcicpIHtcbiAgICAgICAgcm93cy5mb3JFYWNoKChyb3c6c3RyaW5nW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgd2hpbGUgKHJvdy5sZW5ndGggPCBsb25nZXN0Um93KSB7XG4gICAgICAgICAgICAgICAgcm93LnB1c2goJycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ2lucHV0Jzogcm93cyxcbiAgICAgICAgJ2NvbHVtbnMnOiBsb25nZXN0Um93XG4gICAgfTtcbn0sXG5cblxuaW5mZXJUcmFuc3Bvc2VTZXR0aW5nOiAocm93czogUmF3SW5wdXQpOiB2b2lkID0+IHtcbiAgICAvLyBUaGUgbW9zdCBzdHJhaWdodGZvcndhcmQgbWV0aG9kIGlzIHRvIHRha2UgdGhlIHRvcCByb3csIGFuZCB0aGUgZmlyc3QgY29sdW1uLFxuICAgIC8vIGFuZCBhbmFseXplIGJvdGggdG8gc2VlIHdoaWNoIG9uZSBtb3N0IGxpa2VseSBjb250YWlucyBhIHJ1biBvZiB0aW1lc3RhbXBzLlxuICAgIC8vIFdlJ2xsIGFsc28gZG8gdGhlIHNhbWUgZm9yIHRoZSBzZWNvbmQgcm93IGFuZCB0aGUgc2Vjb25kIGNvbHVtbiwgaW4gY2FzZSB0aGVcbiAgICAvLyB0aW1lc3RhbXBzIGFyZSB1bmRlcm5lYXRoIHNvbWUgb3RoZXIgaGVhZGVyLlxuICAgIHZhciBhcnJheXNUb0FuYWx5emU6IHN0cmluZ1tdW10sIGFycmF5c1Njb3JlczogbnVtYmVyW10sIHNldFRyYW5zcG9zZTogYm9vbGVhbjtcbiAgICBcbiAgICAvLyBOb3RlIHRoYXQgd2l0aCBlbXB0eSBvciB0b28tc21hbGwgc291cmNlIGRhdGEsIHRoZXNlIGFycmF5cyB3aWxsIGVpdGhlciByZW1haW5cbiAgICAvLyBlbXB0eSwgb3IgYmVjb21lICdudWxsJ1xuICAgIGFycmF5c1RvQW5hbHl6ZSA9IFtcbiAgICAgICAgcm93c1swXSB8fCBbXSwgICAvLyBGaXJzdCByb3dcbiAgICAgICAgcm93c1sxXSB8fCBbXSwgICAvLyBTZWNvbmQgcm93XG4gICAgICAgIChyb3dzIHx8IFtdKS5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmcgPT4gcm93WzBdKSwgICAvLyBGaXJzdCBjb2x1bW5cbiAgICAgICAgKHJvd3MgfHwgW10pLm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbMV0pICAgIC8vIFNlY29uZCBjb2x1bW5cbiAgICBdO1xuICAgIGFycmF5c1Njb3JlcyA9IGFycmF5c1RvQW5hbHl6ZS5tYXAoKHJvdzogc3RyaW5nW10sIGk6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgICAgIHZhciBzY29yZSA9IDAsIHByZXY6IG51bWJlciwgbm5QcmV2OiBudW1iZXI7XG4gICAgICAgIGlmICghcm93IHx8IHJvdy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIHByZXYgPSBublByZXYgPSB1bmRlZmluZWQ7XG4gICAgICAgIHJvdy5mb3JFYWNoKCh2YWx1ZTogc3RyaW5nLCBqOiBudW1iZXIsIHI6IHN0cmluZ1tdKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgdDogbnVtYmVyO1xuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdCA9IHBhcnNlRmxvYXQodmFsdWUucmVwbGFjZSgvLC9nLCAnJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFpc05hTih0KSkge1xuICAgICAgICAgICAgICAgIGlmICghaXNOYU4ocHJldikgJiYgdCA+IHByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcmUgKz0gMjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFpc05hTihublByZXYpICYmIHQgPiBublByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcmUgKz0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbm5QcmV2ID0gdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHByZXYgPSB0O1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHNjb3JlIC8gcm93Lmxlbmd0aDtcbiAgICB9KTtcbiAgICAvLyBJZiB0aGUgZmlyc3Qgcm93IGFuZCBjb2x1bW4gc2NvcmVkIGRpZmZlcmVudGx5LCBqdWRnZSBiYXNlZCBvbiB0aGVtLlxuICAgIC8vIE9ubHkgaWYgdGhleSBzY29yZWQgdGhlIHNhbWUgZG8gd2UganVkZ2UgYmFzZWQgb24gdGhlIHNlY29uZCByb3cgYW5kIHNlY29uZCBjb2x1bW4uXG4gICAgaWYgKGFycmF5c1Njb3Jlc1swXSAhPT0gYXJyYXlzU2NvcmVzWzJdKSB7XG4gICAgICAgIHNldFRyYW5zcG9zZSA9IGFycmF5c1Njb3Jlc1swXSA+IGFycmF5c1Njb3Jlc1syXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzZXRUcmFuc3Bvc2UgPSBhcnJheXNTY29yZXNbMV0gPiBhcnJheXNTY29yZXNbM107XG4gICAgfVxuICAgICQoJyN0cmFuc3Bvc2UnKS5wcm9wKCdjaGVja2VkJywgc2V0VHJhbnNwb3NlKTtcbiAgICBFRERBVEQuR3JpZC50cmFuc3Bvc2UgPSBzZXRUcmFuc3Bvc2U7XG59LFxuXG5cbmluZmVyR2Fwc1NldHRpbmc6ICgpOiB2b2lkID0+IHtcbiAgICAvLyBDb3VudCB0aGUgbnVtYmVyIG9mIGJsYW5rIHZhbHVlcyBhdCB0aGUgZW5kIG9mIGVhY2ggY29sdW1uXG4gICAgLy8gQ291bnQgdGhlIG51bWJlciBvZiBibGFuayB2YWx1ZXMgaW4gYmV0d2VlbiBub24tYmxhbmsgZGF0YVxuICAgIC8vIElmIG1vcmUgdGhhbiB0aHJlZSB0aW1lcyBhcyBtYW55IGFzIGF0IHRoZSBlbmQsIGRlZmF1bHQgdG8gaWdub3JlIGdhcHNcbiAgICB2YXIgaW50cmE6IG51bWJlciA9IDAsIGV4dHJhOiBudW1iZXIgPSAwO1xuICAgIEVEREFURC5HcmlkLmRhdGEuZm9yRWFjaCgocm93OiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgbm90TnVsbDogYm9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAvLyBjb3B5IGFuZCByZXZlcnNlIHRvIGxvb3AgZnJvbSB0aGUgZW5kXG4gICAgICAgIHJvdy5zbGljZSgwKS5yZXZlcnNlKCkuZm9yRWFjaCgodmFsdWU6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICAgIG5vdE51bGwgPyArK2V4dHJhIDogKytpbnRyYTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbm90TnVsbCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIEVEREFURC5HcmlkLmlnbm9yZURhdGFHYXBzID0gZXh0cmEgPiAoaW50cmEgKiAzKTtcbiAgICAkKCcjaWdub3JlR2FwcycpLnByb3AoJ2NoZWNrZWQnLCBFRERBVEQuR3JpZC5pZ25vcmVEYXRhR2Fwcyk7XG59LFxuXG5cbmluZmVyQWN0aXZlRmxhZ3M6ICgpOiB2b2lkID0+IHtcbiAgICAvLyBBbiBpbXBvcnRhbnQgdGhpbmcgdG8gbm90ZSBoZXJlIGlzIHRoYXQgdGhpcyBkYXRhIGlzIGluIFt5XVt4XSBmb3JtYXQgLVxuICAgIC8vIHRoYXQgaXMsIGl0IGdvZXMgYnkgcm93LCB0aGVuIGJ5IGNvbHVtbiwgd2hlbiByZWZlcmVuY2luZy5cbiAgICAvLyBUaGlzIG1hdGNoZXMgR3JpZC5kYXRhIGFuZCBUYWJsZS5kYXRhQ2VsbHMuXG4gICAgdmFyIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgIChFRERBVEQuR3JpZC5kYXRhWzBdIHx8IFtdKS5mb3JFYWNoKChfLCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKEVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1t4XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbeF0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKEVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbeV0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XSA9IEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XSB8fCBbXTtcbiAgICAgICAgcm93LmZvckVhY2goKF8sIHg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldW3hdID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59LFxuXG5cbnByb2Nlc3NNZHY6IChpbnB1dDogUmF3SW5wdXQpOiB2b2lkID0+IHtcbiAgICB2YXIgcm93czogUmF3SW5wdXQsIGNvbExhYmVsczogc3RyaW5nW10sIGNvbXBvdW5kczogYW55LCBvcmRlcmVkQ29tcDogc3RyaW5nW107XG4gICAgcm93cyA9IGlucHV0LnNsaWNlKDApOyAvLyBjb3B5XG4gICAgLy8gSWYgdGhpcyB3b3JkIGZyYWdtZW50IGlzIGluIHRoZSBmaXJzdCByb3csIGRyb3AgdGhlIHdob2xlIHJvdy5cbiAgICAvLyAoSWdub3JpbmcgYSBRIG9mIHVua25vd24gY2FwaXRhbGl6YXRpb24pXG4gICAgaWYgKHJvd3NbMF0uam9pbignJykubWF0Y2goL3VhbnRpdGF0aW9uL2cpKSB7XG4gICAgICAgIHJvd3Muc2hpZnQoKTtcbiAgICB9XG4gICAgY29tcG91bmRzID0ge307XG4gICAgb3JkZXJlZENvbXAgPSBbXTtcbiAgICByb3dzLmZvckVhY2goKHJvdzogc3RyaW5nW10pOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIGZpcnN0OiBzdHJpbmcsIG1hcmtlZDogc3RyaW5nW10sIG5hbWU6IHN0cmluZywgaW5kZXg6IG51bWJlcjtcbiAgICAgICAgZmlyc3QgPSByb3cuc2hpZnQoKTtcbiAgICAgICAgLy8gSWYgd2UgaGFwcGVuIHRvIGVuY291bnRlciBhbiBvY2N1cnJlbmNlIG9mIGEgcm93IHdpdGggJ0NvbXBvdW5kJyBpblxuICAgICAgICAvLyB0aGUgZmlyc3QgY29sdW1uLCB3ZSB0cmVhdCBpdCBhcyBhIHJvdyBvZiBjb2x1bW4gaWRlbnRpZmllcnMuXG4gICAgICAgIGlmIChmaXJzdCA9PT0gJ0NvbXBvdW5kJykge1xuICAgICAgICAgICAgY29sTGFiZWxzID0gcm93O1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG1hcmtlZCA9IGZpcnN0LnNwbGl0KCcgTSA9ICcpO1xuICAgICAgICBpZiAobWFya2VkLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgbmFtZSA9IG1hcmtlZFswXTtcbiAgICAgICAgICAgIGluZGV4ID0gcGFyc2VJbnQobWFya2VkWzFdLCAxMCk7XG4gICAgICAgICAgICBpZiAoIWNvbXBvdW5kc1tuYW1lXSkge1xuICAgICAgICAgICAgICAgIGNvbXBvdW5kc1tuYW1lXSA9IHsgJ29yaWdpbmFsUm93cyc6IHt9LCAncHJvY2Vzc2VkQXNzYXlDb2xzJzoge30gfVxuICAgICAgICAgICAgICAgIG9yZGVyZWRDb21wLnB1c2gobmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb21wb3VuZHNbbmFtZV0ub3JpZ2luYWxSb3dzW2luZGV4XSA9IHJvdy5zbGljZSgwKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgICQuZWFjaChjb21wb3VuZHMsIChuYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIGluZGljZXM6IG51bWJlcltdO1xuICAgICAgICAvLyBGaXJzdCBnYXRoZXIgdXAgYWxsIHRoZSBtYXJrZXIgaW5kZXhlcyBnaXZlbiBmb3IgdGhpcyBjb21wb3VuZFxuICAgICAgICBpbmRpY2VzID0gJC5tYXAodmFsdWUub3JpZ2luYWxSb3dzLCAoXywgaW5kZXg6IHN0cmluZyk6IG51bWJlciA9PiBwYXJzZUludChpbmRleCwgMTApKTtcbiAgICAgICAgaW5kaWNlcy5zb3J0KChhLCBiKSA9PiBhIC0gYik7IC8vIHNvcnQgYXNjZW5kaW5nXG4gICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBzZXQgb2YgY29sdW1uTGFiZWxzIGFib3ZlLCBhc3NlbWJsaW5nIGEgbWFya2luZyBudW1iZXIgZm9yIGVhY2gsXG4gICAgICAgIC8vIGJ5IGRyYXdpbmcgLSBpbiBvcmRlciAtIGZyb20gdGhpcyBjb2xsZWN0ZWQgcm93IGRhdGEuXG4gICAgICAgIGNvbExhYmVscy5mb3JFYWNoKChsYWJlbDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgcGFydHM6IHN0cmluZ1tdLCBhbnlGbG9hdDogYm9vbGVhbjtcbiAgICAgICAgICAgIHBhcnRzID0gW107XG4gICAgICAgICAgICBhbnlGbG9hdCA9IGZhbHNlO1xuICAgICAgICAgICAgaW5kaWNlcy5mb3JFYWNoKChyaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWdpbmFsOiBzdHJpbmdbXSwgY2VsbDogc3RyaW5nO1xuICAgICAgICAgICAgICAgIG9yaWdpbmFsID0gdmFsdWUub3JpZ2luYWxSb3dzW3JpXTtcbiAgICAgICAgICAgICAgICBjZWxsID0gb3JpZ2luYWxbaW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChjZWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGNlbGwgPSBjZWxsLnJlcGxhY2UoLywvZywgJycpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNOYU4ocGFyc2VGbG9hdChjZWxsKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbnlGbG9hdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2goJycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaChjZWxsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQXNzZW1ibGVkIGEgZnVsbCBjYXJib24gbWFya2VyIG51bWJlciwgZ3JhYiB0aGUgY29sdW1uIGxhYmVsLCBhbmQgcGxhY2VcbiAgICAgICAgICAgIC8vIHRoZSBtYXJrZXIgaW4gdGhlIGFwcHJvcHJpYXRlIHNlY3Rpb24uXG4gICAgICAgICAgICB2YWx1ZS5wcm9jZXNzZWRBc3NheUNvbHNbaW5kZXhdID0gcGFydHMuam9pbignLycpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICAvLyBTdGFydCB0aGUgc2V0IG9mIHJvdyBtYXJrZXJzIHdpdGggYSBnZW5lcmljIGxhYmVsXG4gICAgRUREQVRELkdyaWQucm93TWFya2VycyA9IFsnQXNzYXknXTtcbiAgICAvLyBUaGUgZmlyc3Qgcm93IGlzIG91ciBsYWJlbCBjb2xsZWN0aW9uXG4gICAgRUREQVRELkdyaWQuZGF0YVswXSA9IGNvbExhYmVscy5zbGljZSgwKTtcbiAgICAvLyBwdXNoIHRoZSByZXN0IG9mIHRoZSByb3dzIGdlbmVyYXRlZCBmcm9tIG9yZGVyZWQgbGlzdCBvZiBjb21wb3VuZHNcbiAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShcbiAgICAgICAgRUREQVRELkdyaWQuZGF0YSxcbiAgICAgICAgb3JkZXJlZENvbXAubWFwKChuYW1lOiBzdHJpbmcpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29tcG91bmQ6IGFueSwgcm93OiBzdHJpbmdbXSwgY29sTG9va3VwOiBhbnk7XG4gICAgICAgICAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzLnB1c2gobmFtZSk7XG4gICAgICAgICAgICBjb21wb3VuZCA9IGNvbXBvdW5kc1tuYW1lXTtcbiAgICAgICAgICAgIHJvdyA9IFtdO1xuICAgICAgICAgICAgY29sTG9va3VwID0gY29tcG91bmQucHJvY2Vzc2VkQXNzYXlDb2xzO1xuICAgICAgICAgICAgLy8gZ2VuZXJhdGUgcm93IGNlbGxzIGJ5IG1hcHBpbmcgY29sdW1uIGxhYmVscyB0byBwcm9jZXNzZWQgY29sdW1uc1xuICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkocm93LFxuICAgICAgICAgICAgICAgIGNvbExhYmVscy5tYXAoKF8sIGluZGV4OiBudW1iZXIpOiBzdHJpbmcgPT4gY29sTG9va3VwW2luZGV4XSB8fCAnJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgICAgfSlcbiAgICApO1xufSxcblxuXG4vLyBBIHJlY3Vyc2l2ZSBmdW5jdGlvbiB0byBwb3B1bGF0ZSBhIHB1bGxkb3duIHdpdGggb3B0aW9uYWwgb3B0aW9uZ3JvdXBzLFxuLy8gYW5kIGEgZGVmYXVsdCBzZWxlY3Rpb25cbnBvcHVsYXRlUHVsbGRvd246IChzZWxlY3Q6IEpRdWVyeSwgb3B0aW9uczogUm93UHVsbGRvd25PcHRpb25bXSwgdmFsdWU6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgIG9wdGlvbnMuZm9yRWFjaCgob3B0aW9uOiBSb3dQdWxsZG93bk9wdGlvbik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG9wdGlvblsxXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dChvcHRpb25bMF0pLnZhbChvcHRpb25bMV0pXG4gICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgb3B0aW9uWzFdID09PSB2YWx1ZSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8oc2VsZWN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIEVEREFURC5wb3B1bGF0ZVB1bGxkb3duKFxuICAgICAgICAgICAgICAgICQoJzxvcHRncm91cD4nKS5hdHRyKCdsYWJlbCcsIG9wdGlvblswXSkuYXBwZW5kVG8oc2VsZWN0KSxcbiAgICAgICAgICAgICAgICBvcHRpb25bMV0sIHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH0pO1xufSxcblxuXG5jb25zdHJ1Y3REYXRhVGFibGU6IChtb2RlOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgdmFyIGNvbnRyb2xDb2xzOiBzdHJpbmdbXSwgcHVsbGRvd25PcHRpb25zOiBhbnlbXSxcbiAgICAgICAgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGNvbGdyb3VwOkpRdWVyeSwgYm9keTogSFRNTFRhYmxlRWxlbWVudCxcbiAgICAgICAgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50O1xuXG4gICAgRUREQVRELlRhYmxlLmRhdGFDZWxscyA9IFtdO1xuICAgIEVEREFURC5UYWJsZS5jb2xDaGVja2JveENlbGxzID0gW107XG4gICAgRUREQVRELlRhYmxlLmNvbE9iamVjdHMgPSBbXTtcbiAgICBFRERBVEQuVGFibGUucm93TGFiZWxDZWxscyA9IFtdO1xuICAgIEVEREFURC5UYWJsZS5yb3dDaGVja2JveENlbGxzID0gW107XG4gICAgY29udHJvbENvbHMgPSBbJ2NoZWNrYm94JywgJ3B1bGxkb3duJywgJ2xhYmVsJ107XG4gICAgaWYgKG1vZGUgPT09ICd0cicpIHtcbiAgICAgICAgcHVsbGRvd25PcHRpb25zID0gW1xuICAgICAgICAgICAgWyctLScsIDBdLFxuICAgICAgICAgICAgWydFbnRpcmUgUm93IElzLi4uJywgW1xuICAgICAgICAgICAgICAgIFsnR2VuZSBOYW1lcycsIDEwXSxcbiAgICAgICAgICAgICAgICBbJ1JQS00gVmFsdWVzJywgMTFdXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBdXG4gICAgICAgIF07XG4gICAgfSBlbHNlIGlmIChtb2RlID09PSAncHInKSB7XG4gICAgICAgIHB1bGxkb3duT3B0aW9ucyA9IFtcbiAgICAgICAgICAgIFsnLS0nLCAwXSxcbiAgICAgICAgICAgIFsnRW50aXJlIFJvdyBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICBbJ0Fzc2F5L0xpbmUgTmFtZXMnLCAxXSxcbiAgICAgICAgICAgIF1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBbJ0ZpcnN0IENvbHVtbiBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICBbJ1Byb3RlaW4gTmFtZScsIDEyXVxuICAgICAgICAgICAgXVxuICAgICAgICAgICAgXVxuICAgICAgICBdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHB1bGxkb3duT3B0aW9ucyA9IFtcbiAgICAgICAgICAgIFsnLS0nLCAwXSxcbiAgICAgICAgICAgIFsnRW50aXJlIFJvdyBJcy4uLicsIFtcbiAgICAgICAgICAgICAgICBbJ0Fzc2F5L0xpbmUgTmFtZXMnLCAxXSxcbiAgICAgICAgICAgICAgICBbJ01ldGFib2xpdGUgTmFtZXMnLCAyXVxuICAgICAgICAgICAgXVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFsnRmlyc3QgQ29sdW1uIElzLi4uJywgW1xuICAgICAgICAgICAgICAgIFsnVGltZXN0YW1wJywgM10sXG4gICAgICAgICAgICAgICAgWydNZXRhZGF0YSBOYW1lJywgNF0sXG4gICAgICAgICAgICAgICAgWydNZXRhYm9saXRlIE5hbWUnLCA1XVxuICAgICAgICAgICAgXVxuICAgICAgICAgICAgXVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBhbmQgcmVwbGFjZSB0aGUgdGFibGUgaW4gdGhlIGRvY3VtZW50XG4gICAgLy8gYXR0YWNoIGFsbCBldmVudCBoYW5kbGVycyB0byB0aGUgdGFibGUgaXRzZWxmXG4gICAgdGFibGUgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRhYmxlPicpLmF0dHIoJ2NlbGxzcGFjaW5nJywgJzAnKVxuICAgICAgICAuYXBwZW5kVG8oJCgnI2RhdGFUYWJsZURpdicpLmVtcHR5KCkpXG4gICAgICAgIC5vbignY2xpY2snLCAnW25hbWU9ZW5hYmxlQ29sdW1uXScsIChldjogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgRUREQVRELnRvZ2dsZVRhYmxlQ29sdW1uKGV2LnRhcmdldCk7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICdbbmFtZT1lbmFibGVSb3ddJywgKGV2OiBKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICBFRERBVEQudG9nZ2xlVGFibGVSb3coZXYudGFyZ2V0KTtcbiAgICAgICAgfSkub24oJ2NoYW5nZScsICcucHVsbGRvd25DZWxsID4gc2VsZWN0JywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICB2YXIgdGFyZzogSlF1ZXJ5ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgRUREQVRELmNoYW5nZWRSb3dEYXRhVHlwZVB1bGxkb3duKFxuICAgICAgICAgICAgICAgIHBhcnNlSW50KHRhcmcuYXR0cignaScpLCAxMCksIHBhcnNlSW50KHRhcmcudmFsKCksIDEwKSk7XG4gICAgICAgIH0pWzBdO1xuICAgIC8vIE9uZSBvZiB0aGUgb2JqZWN0cyBoZXJlIHdpbGwgYmUgYSBjb2x1bW4gZ3JvdXAsIHdpdGggY29sIG9iamVjdHMgaW4gaXQuXG4gICAgLy8gVGhpcyBpcyBhbiBpbnRlcmVzdGluZyB0d2lzdCBvbiBET00gYmVoYXZpb3IgdGhhdCB5b3Ugc2hvdWxkIHByb2JhYmx5IGdvb2dsZS5cbiAgICBjb2xncm91cCA9ICQoJzxjb2xncm91cD4nKS5hcHBlbmRUbyh0YWJsZSk7XG4gICAgYm9keSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGJvZHk+JykuYXBwZW5kVG8odGFibGUpWzBdO1xuICAgIC8vIFN0YXJ0IHdpdGggdGhyZWUgY29sdW1ucywgZm9yIHRoZSBjaGVja2JveGVzLCBwdWxsZG93bnMsIGFuZCBsYWJlbHMuXG4gICAgLy8gKFRoZXNlIHdpbGwgbm90IGJlIHRyYWNrZWQgaW4gVGFibGUuY29sT2JqZWN0cy4pXG4gICAgY29udHJvbENvbHMuZm9yRWFjaCgoKTp2b2lkID0+IHtcbiAgICAgICAgJCgnPGNvbD4nKS5hcHBlbmRUbyhjb2xncm91cCk7XG4gICAgfSk7XG4gICAgLy8gYWRkIGNvbCBlbGVtZW50cyBmb3IgZWFjaCBkYXRhIGNvbHVtblxuICAgIChFRERBVEQuR3JpZC5kYXRhWzBdIHx8IFtdKS5mb3JFYWNoKCgpOiB2b2lkID0+IHtcbiAgICAgICAgRUREQVRELlRhYmxlLmNvbE9iamVjdHMucHVzaCgkKCc8Y29sPicpLmFwcGVuZFRvKGNvbGdyb3VwKVswXSk7XG4gICAgfSk7XG4gICAgLy8gRmlyc3Qgcm93OiBzcGFjZXIgY2VsbHMsIGZvbGxvd2VkIGJ5IGNoZWNrYm94IGNlbGxzIGZvciBlYWNoIGRhdGEgY29sdW1uXG4gICAgcm93ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+IGJvZHkuaW5zZXJ0Um93KCk7XG4gICAgLy8gc3BhY2VyIGNlbGxzIGhhdmUgeCBhbmQgeSBzZXQgdG8gMCB0byByZW1vdmUgZnJvbSBoaWdobGlnaHQgZ3JpZFxuICAgIGNvbnRyb2xDb2xzLmZvckVhY2goKCk6IHZvaWQgPT4ge1xuICAgICAgICAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoeyAneCc6ICcwJywgJ3knOiAwIH0pO1xuICAgIH0pO1xuICAgIChFRERBVEQuR3JpZC5kYXRhWzBdIHx8IFtdKS5mb3JFYWNoKChfLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIGNlbGw6IEpRdWVyeSwgYm94OiBKUXVlcnk7XG4gICAgICAgIGNlbGwgPSAkKHJvdy5pbnNlcnRDZWxsKCkpLmF0dHIoeyAnaWQnOiAnY29sQ0JDZWxsJyArIGksICd4JzogMSArIGksICd5JzogMCB9KVxuICAgICAgICAgICAgLmFkZENsYXNzKCdjaGVja0JveENlbGwnKTtcbiAgICAgICAgYm94ID0gJCgnPGlucHV0IHR5cGU9XCJjaGVja2JveFwiLz4nKS5hcHBlbmRUbyhjZWxsKVxuICAgICAgICAgICAgLnZhbChpLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdlbmFibGVDb2x1bW4nICsgaSwgJ25hbWUnOiAnZW5hYmxlQ29sdW1uJyB9KVxuICAgICAgICAgICAgLnByb3AoJ2NoZWNrZWQnLCBFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbaV0pO1xuICAgICAgICBFRERBVEQuVGFibGUuY29sQ2hlY2tib3hDZWxscy5wdXNoKGNlbGxbMF0pO1xuICAgIH0pO1xuICAgIEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHMgPSBbXTsgIC8vIFdlIGRvbid0IHdhbnQgYW55IGxpbmdlcmluZyBvbGQgb2JqZWN0cyBpbiB0aGlzXG4gICAgLy8gVGhlIHJlc3Qgb2YgdGhlIHJvd3M6IEEgcHVsbGRvd24sIGEgY2hlY2tib3gsIGEgcm93IGxhYmVsLCBhbmQgYSByb3cgb2YgZGF0YS5cbiAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHZhbHVlczogc3RyaW5nW10sIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgY2VsbDogSlF1ZXJ5O1xuICAgICAgICByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD4gYm9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgLy8gY2hlY2tib3ggY2VsbFxuICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hZGRDbGFzcygnY2hlY2tCb3hDZWxsJylcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ3Jvd0NCQ2VsbCcgKyBpLCAneCc6IDAsICd5JzogaSArIDEgfSk7XG4gICAgICAgICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIi8+JylcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2VuYWJsZVJvdycgKyBpLCAnbmFtZSc6ICdlbmFibGVSb3cnLCB9KVxuICAgICAgICAgICAgLnZhbChpLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICAucHJvcCgnY2hlY2tlZCcsIEVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1tpXSlcbiAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgRUREQVRELlRhYmxlLnJvd0NoZWNrYm94Q2VsbHMucHVzaChjZWxsWzBdKTtcbiAgICAgICAgLy8gcHVsbGRvd24gY2VsbFxuICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hZGRDbGFzcygncHVsbGRvd25DZWxsJylcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ3Jvd1BDZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMSB9KTtcbiAgICAgICAgLy8gdXNlIGV4aXN0aW5nIHNldHRpbmcsIG9yIHVzZSB0aGUgbGFzdCBpZiByb3dzLmxlbmd0aCA+IHNldHRpbmdzLmxlbmd0aCwgb3IgYmxhbmtcbiAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gPSBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXVxuICAgICAgICAgICAgICAgIHx8IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzLnNsaWNlKC0xKVswXSB8fCAwXG4gICAgICAgIEVEREFURC5wb3B1bGF0ZVB1bGxkb3duKFxuICAgICAgICAgICAgY2VsbCA9ICQoJzxzZWxlY3Q+JylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6ICdyb3cnICsgaSArICd0eXBlJywgJ25hbWUnOiAncm93JyArIGkgKyAndHlwZScsICdpJzogaSB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKSxcbiAgICAgICAgICAgIHB1bGxkb3duT3B0aW9ucyxcbiAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldXG4gICAgICAgICk7XG4gICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHMucHVzaChjZWxsWzBdKTtcbiAgICAgICAgLy8gbGFiZWwgY2VsbFxuICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hdHRyKHsgJ2lkJzogJ3Jvd01DZWxsJyArIGksICd4JzogMCwgJ3knOiBpICsgMSB9KTtcbiAgICAgICAgJCgnPGRpdj4nKS50ZXh0KEVEREFURC5HcmlkLnJvd01hcmtlcnNbaV0pLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICBFRERBVEQuVGFibGUucm93TGFiZWxDZWxscy5wdXNoKGNlbGxbMF0pO1xuICAgICAgICAvLyB0aGUgdGFibGUgZGF0YSBpdHNlbGZcbiAgICAgICAgRUREQVRELlRhYmxlLmRhdGFDZWxsc1tpXSA9IFtdO1xuICAgICAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWU6IHN0cmluZywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgc2hvcnQ6IHN0cmluZztcbiAgICAgICAgICAgIHZhbHVlID0gc2hvcnQgPSB2YWx1ZSB8fCAnJztcbiAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAzMikge1xuICAgICAgICAgICAgICAgIHNob3J0ID0gdmFsdWUuc3Vic3RyKDAsIDMxKSArICfigKYnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2VsbCA9ICQocm93Lmluc2VydENlbGwoKSkuYXR0cih7XG4gICAgICAgICAgICAgICAgJ2lkJzogJ3ZhbENlbGwnICsgeCArICctJyArIGksXG4gICAgICAgICAgICAgICAgJ3gnOiB4ICsgMSxcbiAgICAgICAgICAgICAgICAneSc6IGkgKyAxLFxuICAgICAgICAgICAgICAgICd0aXRsZSc6IHZhbHVlLFxuICAgICAgICAgICAgICAgICdpc2JsYW5rJzogdmFsdWUgPT09ICcnID8gMSA6IHVuZGVmaW5lZFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQoc2hvcnQpLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgRUREQVRELlRhYmxlLmRhdGFDZWxsc1tpXS5wdXNoKGNlbGxbMF0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBFRERBVEQuYXBwbHlUYWJsZURhdGFUeXBlU3R5bGluZygpO1xufSxcblxuXG5wYXJzZUFuZERpc3BsYXlUZXh0OiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIG1vZGU6c3RyaW5nLCBkZWxpbWl0ZXI6c3RyaW5nLCByYXdGb3JtYXQ6SlF1ZXJ5LCBpbnB1dDpSYXdJbnB1dFN0YXQ7XG4gICAgbW9kZSA9IEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGU7XG4gICAgZGVsaW1pdGVyID0gJ1xcdCc7XG4gICAgRUREQVRELkdyaWQuZGF0YSA9IFtdO1xuICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMgPSBbXTtcbiAgICByYXdGb3JtYXQgPSAkKCcjcmF3ZGF0YWZvcm1hdHAnKTtcbiAgICBpZiAocmF3Rm9ybWF0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcIkNhbid0IGZpbmQgZGF0YSBmb3JtYXQgcHVsbGRvd25cIilcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBJZiB3ZSdyZSBpbiBcIm1kdlwiIG1vZGUsIGxvY2sgdGhlIGRlbGltaXRlciB0byB0YWJzXG4gICAgaWYgKG1vZGUgPT09ICdtZHYnKSB7XG4gICAgICAgIHJhd0Zvcm1hdC52YWwoJ3RhYicpO1xuICAgIH1cbiAgICBpZiAocmF3Rm9ybWF0LnZhbCgpID09PSAnY3N2Jykge1xuICAgICAgICBkZWxpbWl0ZXIgPSAnLCc7XG4gICAgfVxuICAgIGlucHV0ID0gRUREQVRELnBhcnNlUmF3SW5wdXQoZGVsaW1pdGVyLCBtb2RlKTtcblxuICAgIGlmIChtb2RlID09PSAnc3RkJyB8fCBtb2RlID09PSAndHInIHx8IG1vZGUgPT09ICdwcicpIHtcbiAgICAgICAgLy8gSWYgdGhlIHVzZXIgaGFzbid0IGRlbGliZXJhdGVseSBjaG9zZW4gYSBzZXR0aW5nIGZvciAndHJhbnNwb3NlJywgd2Ugd2lsbCBkb1xuICAgICAgICAvLyBzb21lIGFuYWx5c2lzIHRvIGF0dGVtcHQgdG8gZ3Vlc3Mgd2hpY2ggb3JpZW50YXRpb24gdGhlIGRhdGEgbmVlZHMgdG8gaGF2ZS5cbiAgICAgICAgaWYgKCFFRERBVEQuR3JpZC51c2VyQ2xpY2tlZE9uVHJhbnNwb3NlKSB7XG4gICAgICAgICAgICBFRERBVEQuaW5mZXJUcmFuc3Bvc2VTZXR0aW5nKGlucHV0LmlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3cgdGhhdCB0aGF0J3MgZG9uZSwgbW92ZSB0aGUgZGF0YSBpbnRvIEdyaWQuZGF0YVxuICAgICAgICBpZiAoRUREQVRELkdyaWQudHJhbnNwb3NlKSB7XG4gICAgICAgICAgICAvLyBmaXJzdCByb3cgYmVjb21lcyBZLW1hcmtlcnMgYXMtaXNcbiAgICAgICAgICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMgPSBpbnB1dC5pbnB1dC5zaGlmdCgpIHx8IFtdO1xuICAgICAgICAgICAgRUREQVRELkdyaWQuZGF0YSA9IChpbnB1dC5pbnB1dFswXSB8fCBbXSkubWFwKChfLCBpOiBudW1iZXIpOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0LmlucHV0Lm1hcCgocm93OiBzdHJpbmdbXSk6IHN0cmluZyA9PiByb3dbaV0gfHwgJycpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzID0gW107XG4gICAgICAgICAgICBFRERBVEQuR3JpZC5kYXRhID0gKGlucHV0LmlucHV0IHx8IFtdKS5tYXAoKHJvdzogc3RyaW5nW10pOiBzdHJpbmdbXSA9PiB7XG4gICAgICAgICAgICAgICAgRUREQVRELkdyaWQucm93TWFya2Vycy5wdXNoKHJvdy5zaGlmdCgpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcm93O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlIHVzZXIgaGFzbid0IGRlbGliZXJhdGVseSBjaG9zZW4gdG8gaWdub3JlLCBvciBhY2NlcHQsIGdhcHMgaW4gdGhlIGRhdGEsXG4gICAgICAgIC8vIGRvIGEgYmFzaWMgYW5hbHlzaXMgdG8gZ3Vlc3Mgd2hpY2ggc2V0dGluZyBtYWtlcyBtb3JlIHNlbnNlLlxuICAgICAgICBpZiAoIUVEREFURC5HcmlkLnVzZXJDbGlja2VkT25JZ25vcmVEYXRhR2Fwcykge1xuICAgICAgICAgICAgRUREQVRELmluZmVyR2Fwc1NldHRpbmcoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBHaXZlIGxhYmVscyB0byBhbnkgaGVhZGVyIHBvc2l0aW9ucyB0aGF0IGdvdCAnbnVsbCcgZm9yIGEgdmFsdWUuXG4gICAgICAgIEVEREFURC5HcmlkLnJvd01hcmtlcnMgPSBFRERBVEQuR3JpZC5yb3dNYXJrZXJzLm1hcCgodmFsdWU6IHN0cmluZykgPT4gdmFsdWUgfHwgJz8nKTtcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBhdXRvLXNldCBhbnkgdHlwZSBwdWxsZG93bnMgdGhhdCBoYXZlbid0IGJlZW4gZGVsaWJlcmF0ZWx5IHNldCBieSB0aGUgdXNlclxuICAgICAgICBFRERBVEQuR3JpZC5yb3dNYXJrZXJzLmZvckVhY2goKHZhbHVlOiBzdHJpbmcsIGk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHR5cGU6IGFueTtcbiAgICAgICAgICAgIGlmICghRUREQVRELlRhYmxlLnB1bGxkb3duVXNlckNoYW5nZWRGbGFnc1tpXSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSBFRERBVEQuZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZSh2YWx1ZSwgRUREQVRELkdyaWQuZGF0YVtpXSB8fCBbXSk7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gPSB0eXBlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAvLyBXZSBtZWVkIGF0IGxlYXN0IDIgcm93cyBhbmQgY29sdW1ucyBmb3IgTURWIGZvcm1hdCB0byBtYWtlIGFueSBzZW5zZVxuICAgIH0gZWxzZSBpZiAoKG1vZGUgPT09IFwibWR2XCIpICYmIChpbnB1dC5pbnB1dC5sZW5ndGggPiAxKSAmJiAoaW5wdXQuY29sdW1ucyA+IDEpKSB7XG4gICAgICAgIEVEREFURC5wcm9jZXNzTWR2KGlucHV0LmlucHV0KTtcbiAgICB9XG4gICAgLy8gQ3JlYXRlIGEgbWFwIG9mIGVuYWJsZWQvZGlzYWJsZWQgZmxhZ3MgZm9yIG91ciBkYXRhLFxuICAgIC8vIGJ1dCBvbmx5IGZpbGwgdGhlIGFyZWFzIHRoYXQgZG8gbm90IGFscmVhZHkgZXhpc3QuXG4gICAgRUREQVRELmluZmVyQWN0aXZlRmxhZ3MoKTtcbiAgICAvLyBDb25zdHJ1Y3QgdGFibGUgY2VsbCBvYmplY3RzIGZvciB0aGUgcGFnZSwgYmFzZWQgb24gb3VyIGV4dHJhY3RlZCBkYXRhXG4gICAgRUREQVRELmNvbnN0cnVjdERhdGFUYWJsZShtb2RlKTtcbiAgICAvLyBJbnRlcnByZXQgdGhlIGRhdGEgaW4gU3RlcCAzLFxuICAgIC8vIHdoaWNoIGludm9sdmVzIHNraXBwaW5nIGRpc2FibGVkIHJvd3Mgb3IgY29sdW1ucyxcbiAgICAvLyBvcHRpb25hbGx5IGlnbm9yaW5nIGJsYW5rIHZhbHVlcyxcbiAgICAvLyBhbmQgbGVhdmluZyBvdXQgYW55IHZhbHVlcyB0aGF0IGhhdmUgYmVlbiBpbmRpdmlkdWFsbHkgZmxhZ2dlZC5cbiAgICBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgLy8gU3RhcnQgYSBkZWxheSB0aW1lciB0aGF0IHJlZHJhd3MgdGhlIGdyYXBoIGZyb20gdGhlIGludGVycHJldGVkIGRhdGEuXG4gICAgLy8gVGhpcyBpcyByYXRoZXIgcmVzb3VyY2UgaW50ZW5zaXZlLCBzbyB3ZSdyZSBkZWxheWluZyBhIGJpdCwgYW5kIHJlc3RhcnRpbmcgdGhlIGRlbGF5XG4gICAgLy8gaWYgdGhlIHVzZXIgbWFrZXMgYWRkaXRpb25hbCBlZGl0cyB0byB0aGUgZGF0YSB3aXRoaW4gdGhlIGRlbGF5IHBlcmlvZC5cbiAgICBFRERBVEQucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgIC8vIFVwZGF0ZSB0aGUgc3R5bGVzIG9mIHRoZSBuZXcgdGFibGUgdG8gcmVmbGVjdCB0aGVcbiAgICAvLyAocG9zc2libHkgcHJldmlvdXNseSBzZXQpIGZsYWcgbWFya2VycyBhbmQgdGhlIFwiaWdub3JlIGdhcHNcIiBzZXR0aW5nLlxuICAgIEVEREFURC5yZWRyYXdJZ25vcmVkVmFsdWVNYXJrZXJzKCk7XG4gICAgRUREQVRELnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgIC8vIE5vdyB0aGF0IHdlJ3JlIGdvdCB0aGUgdGFibGUgZnJvbSBTdGVwIDMgYnVpbHQsXG4gICAgLy8gd2UgdHVybiB0byB0aGUgdGFibGUgaW4gU3RlcCA0OiAgQSBzZXQgZm9yIGVhY2ggdHlwZSBvZiBkYXRhLCBjb25pc3Rpbmcgb2YgZGlzYW1iaWd1YXRpb24gcm93cyxcbiAgICAvLyB3aGVyZSB0aGUgdXNlciBjYW4gbGluayB1bmtub3duIGl0ZW1zIHRvIHByZS1leGlzdGluZyBFREQgZGF0YS5cbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlKCk7XG59LFxuXG5cbi8vIFRoaXMgcm91dGluZSBkb2VzIGEgYml0IG9mIGFkZGl0aW9uYWwgc3R5bGluZyB0byB0aGUgU3RlcCAzIGRhdGEgdGFibGUuXG4vLyBJdCByZW1vdmVzIGFuZCByZS1hZGRzIHRoZSBkYXRhVHlwZUNlbGwgY3NzIGNsYXNzZXMgYWNjb3JkaW5nIHRvIHRoZSBwdWxsZG93biBzZXR0aW5ncyBmb3IgZWFjaCByb3cuXG5hcHBseVRhYmxlRGF0YVR5cGVTdHlsaW5nOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCBpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBobExhYmVsOiBib29sZWFuLCBobFJvdzogYm9vbGVhbjtcbiAgICAgICAgcHVsbGRvd24gPSBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpbmRleF0gfHwgMDtcbiAgICAgICAgaGxMYWJlbCA9IGhsUm93ID0gZmFsc2U7XG4gICAgICAgIGlmIChwdWxsZG93biA9PT0gMSB8fCBwdWxsZG93biA9PT0gMikge1xuICAgICAgICAgICAgaGxSb3cgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKDMgPD0gcHVsbGRvd24gJiYgcHVsbGRvd24gPD0gNSkge1xuICAgICAgICAgICAgaGxMYWJlbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgJChFRERBVEQuVGFibGUucm93TGFiZWxDZWxsc1tpbmRleF0pLnRvZ2dsZUNsYXNzKCdkYXRhVHlwZUNlbGwnLCBobExhYmVsKTtcbiAgICAgICAgcm93LmZvckVhY2goKF8sIGNvbDogbnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICQoRUREQVRELlRhYmxlLmRhdGFDZWxsc1tpbmRleF1bY29sXSkudG9nZ2xlQ2xhc3MoJ2RhdGFUeXBlQ2VsbCcsIGhsUm93KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59LFxuXG5cbi8vIFdlIGNhbGwgdGhpcyB3aGVuIGFueSBvZiB0aGUgJ21hc3RlcicgcHVsbGRvd25zIGFyZSBjaGFuZ2VkIGluIFN0ZXAgNC5cbi8vIFN1Y2ggY2hhbmdlcyBtYXkgYWZmZWN0IHRoZSBhdmFpbGFibGUgY29udGVudHMgb2Ygc29tZSBvZiB0aGUgcHVsbGRvd25zIGluIHRoZSBzdGVwLlxuY2hhbmdlZEFNYXN0ZXJQdWxsZG93bjogKCk6IHZvaWQgPT4ge1xuICAgIC8vIGhpZGUgbWFzdGVyIGxpbmUgZHJvcGRvd24gaWYgbWFzdGVyIGFzc2F5IGRyb3Bkb3duIGlzIHNldCB0byBuZXdcbiAgICAkKCcjbWFzdGVyTGluZVNwYW4nKS50b2dnbGVDbGFzcygnb2ZmJywgJCgnI21hc3RlckFzc2F5JykudmFsKCkgPT09ICduZXcnKTtcbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlKCk7XG59LFxuXG5cbmNsaWNrZWRPbklnbm9yZURhdGFHYXBzOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELkdyaWQudXNlckNsaWNrZWRPbklnbm9yZURhdGFHYXBzID0gdHJ1ZTtcbiAgICBFRERBVEQucXVldWVQcm9jZXNzSW1wb3J0U2V0dGluZ3MoKTsgICAgLy8gVGhpcyB3aWxsIHRha2UgY2FyZSBvZiByZWFkaW5nIHRoZSBzdGF0dXMgb2YgdGhlIGNoZWNrYm94XG59LFxuXG5cbmNsaWNrZWRPblRyYW5zcG9zZTogKCk6IHZvaWQgPT4ge1xuICAgIEVEREFURC5HcmlkLnVzZXJDbGlja2VkT25UcmFuc3Bvc2UgPSB0cnVlO1xuICAgIEVEREFURC5xdWV1ZVByb2Nlc3NJbXBvcnRTZXR0aW5ncygpO1xufSxcblxuXG5jaGFuZ2VkUm93RGF0YVR5cGVQdWxsZG93bjogKGluZGV4OiBudW1iZXIsIHZhbHVlOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICB2YXIgc2VsZWN0ZWQ6IG51bWJlcjtcbiAgICAvLyBUaGUgdmFsdWUgZG9lcyBub3QgbmVjZXNzYXJpbHkgbWF0Y2ggdGhlIHNlbGVjdGVkSW5kZXguXG4gICAgc2VsZWN0ZWQgPSBFRERBVEQuVGFibGUucHVsbGRvd25PYmplY3RzW2luZGV4XS5zZWxlY3RlZEluZGV4O1xuICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2luZGV4XSA9IHZhbHVlO1xuICAgIEVEREFURC5UYWJsZS5wdWxsZG93blVzZXJDaGFuZ2VkRmxhZ3NbaW5kZXhdID0gdHJ1ZTtcbiAgICBpZiAoKHZhbHVlID49IDMgJiYgdmFsdWUgPD0gNSkgfHwgdmFsdWUgPT09IDEyKSB7XG4gICAgICAgIC8vIFwiVGltZXN0YW1wXCIsIFwiTWV0YWRhdGFcIiwgb3Igb3RoZXIgc2luZ2xlLXRhYmxlLWNlbGwgdHlwZXNcbiAgICAgICAgLy8gU2V0IGFsbCB0aGUgcmVzdCBvZiB0aGUgcHVsbGRvd25zIHRvIHRoaXMsXG4gICAgICAgIC8vIGJhc2VkIG9uIHRoZSBhc3N1bXB0aW9uIHRoYXQgdGhlIGZpcnN0IGlzIGZvbGxvd2VkIGJ5IG1hbnkgb3RoZXJzXG4gICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93bk9iamVjdHMuc2xpY2UoaW5kZXggKyAxKS5ldmVyeShcbiAgICAgICAgICAgIChwdWxsZG93bjogSFRNTFNlbGVjdEVsZW1lbnQpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0OiBKUXVlcnksIGk6IG51bWJlcjtcbiAgICAgICAgICAgICAgICBzZWxlY3QgPSAkKHB1bGxkb3duKTtcbiAgICAgICAgICAgICAgICBpID0gcGFyc2VJbnQoc2VsZWN0LmF0dHIoJ2knKSwgMTApO1xuICAgICAgICAgICAgICAgIGlmIChFRERBVEQuVGFibGUucHVsbGRvd25Vc2VyQ2hhbmdlZEZsYWdzW2ldXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7IC8vIGZhbHNlIGZvciBicmVha1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsKHZhbHVlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW2ldID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgLy8gSW4gYWRkaXRpb24gdG8gdGhlIGFib3ZlIGFjdGlvbiwgd2UgYWxzbyBuZWVkIHRvIGRvIHNvbWUgY2hlY2tpbmcgb24gdGhlIGVudGlyZSBzZXQgb2ZcbiAgICAgICAgLy8gcHVsbGRvd25zLCB0byBlbmZvcmNlIGEgZGl2aXNpb24gYmV0d2VlbiB0aGUgXCJNZXRhYm9saXRlIE5hbWVcIiBzaW5nbGUgZGF0YSB0eXBlIGFuZCB0aGVcbiAgICAgICAgLy8gb3RoZXIgc2luZ2xlIGRhdGEgdHlwZXMuIElmIHRoZSB1c2VyIHVzZXMgZXZlbiBvbmUgXCJNZXRhYm9saXRlIE5hbWVcIiBwdWxsZG93biwgd2UgY2FuJ3RcbiAgICAgICAgLy8gYWxsb3cgYW55IG9mIHRoZSBvdGhlciB0eXBlcywgYW5kIHZpY2UtdmVyc2EuXG4gICAgICAgIC8vICAgV2h5PyAgQmVjYXVzZSBcIk1ldGFib2xpdGUgTmFtZVwiIGlzIHVzZWQgdG8gbGFiZWwgdGhlIHNwZWNpZmljIGNhc2Ugb2YgYSB0YWJsZSB0aGF0XG4gICAgICAgIC8vIGRvZXMgbm90IGNvbnRhaW4gYSB0aW1lc3RhbXAgb24gZWl0aGVyIGF4aXMuICBJbiB0aGF0IGNhc2UsIHRoZSB0YWJsZSBpcyBtZWFudCB0b1xuICAgICAgICAvLyBwcm92aWRlIGRhdGEgZm9yIG11bHRpcGxlIE1lYXN1cmVtZW50cyBhbmQgQXNzYXlzIGZvciBhIHNpbmdsZSB1bnNwZWNpZmllZCB0aW1lIHBvaW50LlxuICAgICAgICAvLyAoVGhhdCB0aW1lIHBvaW50IGlzIHJlcXVlc3RlZCBsYXRlciBpbiB0aGUgVUkuKVxuICAgICAgICAvLyAgIElmIHdlIGFsbG93IGEgc2luZ2xlIHRpbWVzdGFtcCByb3csIHRoYXQgY3JlYXRlcyBhbiBpbmNvbnNpc3RlbnQgdGFibGUgdGhhdCBpc1xuICAgICAgICAvLyBpbXBvc3NpYmxlIHRvIGludGVycHJldC5cbiAgICAgICAgLy8gICBJZiB3ZSBhbGxvdyBhIHNpbmdsZSBtZXRhZGF0YSByb3csIHRoYXQgbGVhdmVzIHRoZSBtZXRhZGF0YSB1bmNvbm5lY3RlZCB0byBhIHNwZWNpZmljXG4gICAgICAgIC8vIG1lYXN1cmVtZW50LCBtZWFuaW5nIHRoYXQgdGhlIG9ubHkgdmFsaWQgd2F5IHRvIGludGVycHJldCBpdCBpcyBhcyBMaW5lIG1ldGFkYXRhLiAgV2VcbiAgICAgICAgLy8gY291bGQgcG90ZW50aWFsbHkgc3VwcG9ydCB0aGF0LCBidXQgaXQgd291bGQgYmUgdGhlIG9ubHkgY2FzZSB3aGVyZSBkYXRhIGltcG9ydGVkIG9uXG4gICAgICAgIC8vIHRoaXMgcGFnZSBkb2VzIG5vdCBlbmQgdXAgaW4gQXNzYXlzIC4uLiBhbmQgdGhhdCBjYXNlIGRvZXNuJ3QgbWFrZSBtdWNoIHNlbnNlIGdpdmVuXG4gICAgICAgIC8vIHRoYXQgdGhpcyBpcyB0aGUgQXNzYXkgRGF0YSBJbXBvcnQgcGFnZSFcbiAgICAgICAgLy8gICBBbnl3YXksIGhlcmUgd2UgcnVuIHRocm91Z2ggdGhlIHB1bGxkb3ducywgbWFraW5nIHN1cmUgdGhhdCBpZiB0aGUgdXNlciBzZWxlY3RlZFxuICAgICAgICAvLyBcIk1ldGFib2xpdGUgTmFtZVwiLCB3ZSBibGFuayBvdXQgYWxsIHJlZmVyZW5jZXMgdG8gXCJUaW1lc3RhbXBcIiBhbmQgXCJNZXRhZGF0YVwiLCBhbmRcbiAgICAgICAgLy8gdmljZS12ZXJzYS5cbiAgICAgICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChfLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBjOiBudW1iZXIgPSBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gNSkge1xuICAgICAgICAgICAgICAgIGlmIChjID09PSAzIHx8IGMgPT09IDQpIHtcbiAgICAgICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0c1tpXS5zZWxlY3RlZEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gPSAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMikgeyAvLyBDYW4ndCBhbGxvdyBcIk1lYXN1cmVtZW50IFR5cGVzXCIgc2V0dGluZyBlaXRoZXJcbiAgICAgICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0c1tpXS5zZWxlY3RlZEluZGV4ID0gMTtcbiAgICAgICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duU2V0dGluZ3NbaV0gPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoKHZhbHVlID09PSAzIHx8IHZhbHVlID09PSA0KSAmJiBjID09PSA1KSB7XG4gICAgICAgICAgICAgICAgRUREQVRELlRhYmxlLnB1bGxkb3duT2JqZWN0c1tpXS5zZWxlY3RlZEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tpXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBJdCB3b3VsZCBzZWVtIGxvZ2ljYWwgdG8gcmVxdWlyZSBhIHNpbWlsYXIgY2hlY2sgZm9yIFwiUHJvdGVpbiBOYW1lXCIsIElEIDEyLCBidXQgaW4gcHJhY3RpY2VcbiAgICAgICAgLy8gdGhlIHVzZXIgaXMgZGlzYWxsb3dlZCBmcm9tIHNlbGVjdGluZyBhbnkgb2YgdGhlIG90aGVyIHNpbmdsZS10YWJsZS1jZWxsIHR5cGVzIHdoZW4gdGhlXG4gICAgICAgIC8vIHBhZ2UgaXMgaW4gUHJvdGVvbWljcyBtb2RlLiAgU28gdGhlIGNoZWNrIGlzIHJlZHVuZGFudC5cbiAgICB9XG4gICAgRUREQVRELmFwcGx5VGFibGVEYXRhVHlwZVN0eWxpbmcoKTtcbiAgICBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgRUREQVRELnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAvLyBSZXNldHRpbmcgYSBkaXNhYmxlZCByb3cgbWF5IGNoYW5nZSB0aGUgbnVtYmVyIG9mIHJvd3MgbGlzdGVkIGluIHRoZSBJbmZvIHRhYmxlLlxuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGUoKTtcbn0sXG5cblxuZmlndXJlT3V0VGhpc1Jvd3NEYXRhVHlwZTogKGxhYmVsOiBzdHJpbmcsIHJvdzogc3RyaW5nW10pID0+IHtcbiAgICB2YXIgYmxhbms6IG51bWJlciwgc3RyaW5nczogbnVtYmVyLCBjb25kZW5zZWQ6IHN0cmluZ1tdO1xuICAgIGlmIChFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09ICd0cicpIHtcbiAgICAgICAgaWYgKGxhYmVsLm1hdGNoKC9nZW5lL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gMTA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxhYmVsLm1hdGNoKC9ycGttL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gMTE7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgd2UgY2FuJ3QgbWF0Y2ggdG8gdGhlIGFib3ZlIHR3bywgc2V0IHRoZSByb3cgdG8gJ3VuZGVmaW5lZCcgc28gaXQncyBpZ25vcmVkIGJ5IGRlZmF1bHRcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICAgIC8vIFRha2UgY2FyZSBvZiBzb21lIGJyYWluZGVhZCBndWVzc2VzXG4gICAgaWYgKGxhYmVsLm1hdGNoKC9hc3NheS9pKSB8fCBsYWJlbC5tYXRjaCgvbGluZS9pKSkge1xuICAgICAgICByZXR1cm4gMTtcbiAgICB9XG4gICAgaWYgKEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT0gJ3ByJykge1xuICAgICAgICBpZiAobGFiZWwubWF0Y2goL3Byb3RlaW4vaSkpIHtcbiAgICAgICAgICAgIHJldHVybiAxMjtcbiAgICAgICAgfVxuICAgICAgICAvLyBObyBwb2ludCBpbiBjb250aW51aW5nLCBvbmx5IGxpbmUgYW5kIHByb3RlaW4gYXJlIHJlbGV2YW50XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICAvLyBUaGluZ3Mgd2UnbGwgYmUgY291bnRpbmcgdG8gaGF6YXJkIGEgZ3Vlc3MgYXQgdGhlIHJvdyBjb250ZW50c1xuICAgIGJsYW5rID0gc3RyaW5ncyA9IDA7XG4gICAgLy8gQSBjb25kZW5zZWQgdmVyc2lvbiBvZiB0aGUgcm93LCB3aXRoIG5vIG51bGxzIG9yIGJsYW5rIHZhbHVlc1xuICAgIGNvbmRlbnNlZCA9IHJvdy5maWx0ZXIoKHY6IHN0cmluZyk6IGJvb2xlYW4gPT4gISF2KTtcbiAgICBibGFuayA9IHJvdy5sZW5ndGggLSBjb25kZW5zZWQubGVuZ3RoO1xuICAgIGNvbmRlbnNlZC5mb3JFYWNoKCh2OiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgdiA9IHYucmVwbGFjZSgvLC9nLCAnJyk7XG4gICAgICAgIGlmIChpc05hTihwYXJzZUZsb2F0KHYpKSkge1xuICAgICAgICAgICAgKytzdHJpbmdzO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgLy8gSWYgdGhlIGxhYmVsIHBhcnNlcyBpbnRvIGEgbnVtYmVyIGFuZCB0aGUgZGF0YSBjb250YWlucyBubyBzdHJpbmdzLCBjYWxsIGl0IGEgdGltc2V0YW1wIGZvciBkYXRhXG4gICAgaWYgKCFpc05hTihwYXJzZUZsb2F0KGxhYmVsKSkgJiYgKHN0cmluZ3MgPT09IDApKSB7XG4gICAgICAgIHJldHVybiAzO1xuICAgIH1cbiAgICAvLyBObyBjaG9pY2UgYnkgZGVmYXVsdFxuICAgIHJldHVybiAwO1xufSxcblxuXG5yZWRyYXdJZ25vcmVkVmFsdWVNYXJrZXJzOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELlRhYmxlLmRhdGFDZWxscy5mb3JFYWNoKChyb3c6IEhUTUxFbGVtZW50W10pOiB2b2lkID0+IHtcbiAgICAgICAgcm93LmZvckVhY2goKGNlbGw6IEhUTUxFbGVtZW50KTogdm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIUVEREFURC5HcmlkLmlnbm9yZURhdGFHYXBzICYmICEhY2VsbC5nZXRBdHRyaWJ1dGUoJ2lzYmxhbmsnKTtcbiAgICAgICAgICAgICQoY2VsbCkudG9nZ2xlQ2xhc3MoJ2lnbm9yZWRMaW5lJywgdG9nZ2xlKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59LFxuXG5cbnRvZ2dsZVRhYmxlUm93OiAoYm94OiBIVE1MRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgIHZhciB2YWx1ZTogbnVtYmVyLCBpbnB1dDogSlF1ZXJ5O1xuICAgIGlucHV0ID0gJChib3gpO1xuICAgIHZhbHVlID0gcGFyc2VJbnQoaW5wdXQudmFsKCksIDEwKTtcbiAgICBFRERBVEQuVGFibGUuYWN0aXZlUm93RmxhZ3NbdmFsdWVdID0gaW5wdXQucHJvcCgnY2hlY2tlZCcpO1xuICAgIEVEREFURC5pbnRlcnByZXREYXRhVGFibGUoKTtcbiAgICBFRERBVEQucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgIEVEREFURC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAvLyBSZXNldHRpbmcgYSBkaXNhYmxlZCByb3cgbWF5IGNoYW5nZSB0aGUgbnVtYmVyIG9mIHJvd3MgbGlzdGVkIGluIHRoZSBJbmZvIHRhYmxlLlxuICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGUoKTtcbn0sXG5cblxudG9nZ2xlVGFibGVDb2x1bW46IChib3g6IEhUTUxFbGVtZW50KTogdm9pZCA9PiB7XG4gICAgdmFyIHZhbHVlOiBudW1iZXIsIGlucHV0OiBKUXVlcnk7XG4gICAgaW5wdXQgPSAkKGJveCk7XG4gICAgdmFsdWUgPSBwYXJzZUludChpbnB1dC52YWwoKSwgMTApO1xuICAgIEVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1t2YWx1ZV0gPSBpbnB1dC5wcm9wKCdjaGVja2VkJyk7XG4gICAgRUREQVRELmludGVycHJldERhdGFUYWJsZSgpO1xuICAgIEVEREFURC5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgRUREQVRELnJlZHJhd0VuYWJsZWRGbGFnTWFya2VycygpO1xuICAgIC8vIFJlc2V0dGluZyBhIGRpc2FibGVkIGNvbHVtbiBtYXkgY2hhbmdlIHRoZSByb3dzIGxpc3RlZCBpbiB0aGUgSW5mbyB0YWJsZS5cbiAgICBFRERBVEQucmVtYWtlSW5mb1RhYmxlKCk7XG59LFxuXG5cbnJlc2V0RW5hYmxlZEZsYWdNYXJrZXJzOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELkdyaWQuZGF0YS5mb3JFYWNoKChyb3c6IHN0cmluZ1tdLCB5OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldID0gRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3ldIHx8IFtdO1xuICAgICAgICByb3cuZm9yRWFjaCgoXywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF0gPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgICAgRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ldID0gdHJ1ZTtcbiAgICB9KTtcbiAgICAoRUREQVRELkdyaWQuZGF0YVswXSB8fCBbXSkuZm9yRWFjaCgoXywgeDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1t4XSA9IHRydWU7XG4gICAgfSk7XG4gICAgLy8gRmxpcCBhbGwgdGhlIGNoZWNrYm94ZXMgb24gaW4gdGhlIGhlYWRlciBjZWxscyBmb3IgdGhlIGRhdGEgY29sdW1uc1xuICAgICQoJyNkYXRhVGFibGVEaXYnKS5maW5kKCdbbmFtZT1lbmFibGVDb2x1bW5dJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgIC8vIFNhbWUgZm9yIHRoZSBjaGVja2JveGVzIGluIHRoZSByb3cgbGFiZWwgY2VsbHNcbiAgICAkKCcjZGF0YVRhYmxlRGl2JykuZmluZCgnW25hbWU9ZW5hYmxlUm93XScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICBFRERBVEQuaW50ZXJwcmV0RGF0YVRhYmxlKCk7XG4gICAgRUREQVRELnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICBFRERBVEQucmVkcmF3RW5hYmxlZEZsYWdNYXJrZXJzKCk7XG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZSgpO1xufSxcblxuXG5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnM6ICgpOiB2b2lkID0+IHtcbiAgICBFRERBVEQuVGFibGUuZGF0YUNlbGxzLmZvckVhY2goKHJvdzogSFRNTEVsZW1lbnRbXSwgeTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciB0b2dnbGU6IGJvb2xlYW4gPSAhRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3ldO1xuICAgICAgICAkKEVEREFURC5UYWJsZS5yb3dMYWJlbENlbGxzW3ldKS50b2dnbGVDbGFzcygnZGlzYWJsZWRMaW5lJywgdG9nZ2xlKTtcbiAgICAgICAgcm93LmZvckVhY2goKGNlbGw6IEhUTUxFbGVtZW50LCB4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHRvZ2dsZSA9ICFFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF1cbiAgICAgICAgICAgICAgICB8fCAhRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW3hdXG4gICAgICAgICAgICAgICAgfHwgIUVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t5XTtcbiAgICAgICAgICAgICQoY2VsbCkudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkTGluZScsIHRvZ2dsZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIEVEREFURC5UYWJsZS5jb2xDaGVja2JveENlbGxzLmZvckVhY2goKGJveDogSFRNTEVsZW1lbnQsIHg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgdG9nZ2xlOiBib29sZWFuID0gIUVEREFURC5UYWJsZS5hY3RpdmVDb2xGbGFnc1t4XTtcbiAgICAgICAgJChib3gpLnRvZ2dsZUNsYXNzKCdkaXNhYmxlZExpbmUnLCB0b2dnbGUpO1xuICAgIH0pO1xufSxcblxuXG5pbnRlcnByZXREYXRhVGFibGVSb3dzOiAoKTogW2Jvb2xlYW4sIG51bWJlcl0gPT4ge1xuICAgIHZhciBzaW5nbGU6IG51bWJlciA9IDAsIG5vblNpbmdsZTogbnVtYmVyID0gMCwgZWFybGllc3ROYW1lOiBudW1iZXI7XG4gICAgLy8gTG9vayBmb3IgdGhlIHByZXNlbmNlIG9mIFwic2luZ2xlIG1lYXN1cmVtZW50IHR5cGVcIiByb3dzLCBhbmQgcm93cyBvZiBhbGwgb3RoZXIgc2luZ2xlLWl0ZW0gdHlwZXNcbiAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKF8sIHk6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlcjtcbiAgICAgICAgaWYgKEVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1t5XSkge1xuICAgICAgICAgICAgcHVsbGRvd24gPSBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1t5XTtcbiAgICAgICAgICAgIGlmIChwdWxsZG93biA9PT0gNSB8fCBwdWxsZG93biA9PT0gMTIpIHtcbiAgICAgICAgICAgICAgICBzaW5nbGUrKzsgLy8gU2luZ2xlIE1lYXN1cmVtZW50IE5hbWUgb3IgU2luZ2xlIFByb3RlaW4gTmFtZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gNCB8fCBwdWxsZG93biA9PT0gMykge1xuICAgICAgICAgICAgICAgIG5vblNpbmdsZSsrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMSAmJiBlYXJsaWVzdE5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGVhcmxpZXN0TmFtZSA9IHk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICAvLyBPbmx5IHVzZSB0aGlzIG1vZGUgaWYgdGhlIHRhYmxlIGlzIGVudGlyZWx5IGZyZWUgb2Ygc2luZ2xlLXRpbWVzdGFtcCBhbmRcbiAgICAvLyBzaW5nbGUtbWV0YWRhdGEgcm93cywgYW5kIGhhcyBhdCBsZWFzdCBvbmUgXCJzaW5nbGUgbWVhc3VyZW1lbnRcIiByb3csIGFuZCBhdFxuICAgIC8vIGxlYXN0IG9uZSBcIkFzc2F5L0xpbmUgbmFtZXNcIiByb3cuXG4gICAgLy8gTm90ZTogcmVxdWlyZW1lbnQgb2YgYW4gXCJBc3NheS9MaW5lIG5hbWVzXCIgcm93IHByZXZlbnRzIHRoaXMgbW9kZSBmcm9tIGJlaW5nXG4gICAgLy8gZW5hYmxlZCB3aGVuIHRoZSBwYWdlIGlzIGluICdUcmFuc2NyaXB0aW9uJyBtb2RlLlxuICAgIHJldHVybiBbKHNpbmdsZSA+IDAgJiYgbm9uU2luZ2xlID09PSAwICYmIGVhcmxpZXN0TmFtZSAhPT0gdW5kZWZpbmVkKSwgZWFybGllc3ROYW1lXTtcbn0sXG5cblxuaW50ZXJwcmV0RGF0YVRhYmxlOiAoKTogdm9pZCA9PiB7XG4gICAgLy8gV2UnbGwgYmUgYWNjdW11bGF0aW5nIHRoZXNlIGZvciBkaXNhbWJpZ3VhdGlvbi5cbiAgICAvLyBFYWNoIHVuaXF1ZSBrZXkgd2lsbCBnZXQgYSBkaXN0aW5jdCB2YWx1ZSwgcGxhY2luZyBpdCBpbiB0aGUgb3JkZXIgZmlyc3Qgc2VlblxuICAgIHZhciBzZWVuQXNzYXlMaW5lTmFtZXMgPSB7fTtcbiAgICB2YXIgc2Vlbk1lYXN1cmVtZW50TmFtZXMgPSB7fTtcbiAgICB2YXIgc2Vlbk1ldGFkYXRhTmFtZXMgPSB7fTtcbiAgICAvLyBIZXJlJ3MgaG93IHdlIHRyYWNrIHRoZSBpbmRleGVzIHdlIGFzc2lnbiBhcyB2YWx1ZXMgYWJvdmUuXG4gICAgdmFyIGFzc2F5TGluZU5hbWVzQ291bnQgPSAwO1xuICAgIHZhciBtZWFzdXJlbWVudE5hbWVzQ291bnQgPSAwO1xuICAgIHZhciBtZXRhZGF0YU5hbWVzQ291bnQgPSAwO1xuICAgIC8vIEhlcmUgYXJlIHRoZSBhcnJheXMgd2Ugd2lsbCB1c2UgbGF0ZXJcbiAgICBFRERBVEQuU2V0cy5wYXJzZWRTZXRzID0gW107XG4gICAgRUREQVRELlNldHMudW5pcXVlTGluZUFzc2F5TmFtZXMgPSBbXTtcbiAgICBFRERBVEQuU2V0cy51bmlxdWVNZWFzdXJlbWVudE5hbWVzID0gW107XG4gICAgRUREQVRELlNldHMudW5pcXVlTWV0YWRhdGFOYW1lcyA9IFtdO1xuICAgIEVEREFURC5TZXRzLnNlZW5BbnlUaW1lc3RhbXBzID0gZmFsc2U7XG5cbiAgICAvLyBUaGlzIG1vZGUgbWVhbnMgd2UgbWFrZSBhIG5ldyBcInNldFwiIGZvciBlYWNoIGNlbGwgaW4gdGhlIHRhYmxlLCByYXRoZXIgdGhhblxuICAgIC8vIHRoZSBzdGFuZGFyZCBtZXRob2Qgb2YgbWFraW5nIGEgbmV3IFwic2V0XCIgZm9yIGVhY2ggY29sdW1uIGluIHRoZSB0YWJsZS5cbiAgICB2YXIgaW50ZXJwcmV0TW9kZSA9IEVEREFURC5pbnRlcnByZXREYXRhVGFibGVSb3dzKCk7XG5cbiAgICAvLyBUaGUgc3RhbmRhcmQgbWV0aG9kOiBNYWtlIGEgXCJzZXRcIiBmb3IgZWFjaCBjb2x1bW4gb2YgdGhlIHRhYmxlXG4gICAgaWYgKCFpbnRlcnByZXRNb2RlWzBdKSB7XG4gICAgICAgIEVEREFURC5UYWJsZS5jb2xPYmplY3RzLmZvckVhY2goKF8sIGM6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHNldDogYW55LCB1bmlxdWVUaW1lczogbnVtYmVyW10sIHRpbWVzOiBhbnksIGZvdW5kTWV0YTogYm9vbGVhbjtcbiAgICAgICAgICAgIC8vIFNraXAgaXQgaWYgdGhlIHdob2xlIGNvbHVtbiBpcyBkZWFjdGl2YXRlZFxuICAgICAgICAgICAgaWYgKCFFRERBVEQuVGFibGUuYWN0aXZlQ29sRmxhZ3NbY10pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZXQgPSB7XG4gICAgICAgICAgICAgICAgLy8gRm9yIHRoZSBncmFwaGluZyBtb2R1bGVcbiAgICAgICAgICAgICAgICAnbGFiZWwnOiAnQ29sdW1uICcgKyBjLFxuICAgICAgICAgICAgICAgICduYW1lJzogJ0NvbHVtbiAnICsgYyxcbiAgICAgICAgICAgICAgICAndW5pdHMnOiAndW5pdHMnLFxuICAgICAgICAgICAgICAgIC8vIEZvciBzdWJtaXNzaW9uIHRvIHRoZSBkYXRhYmFzZVxuICAgICAgICAgICAgICAgICdwYXJzaW5nSW5kZXgnOiBjLFxuICAgICAgICAgICAgICAgICdhc3NheSc6IG51bGwsXG4gICAgICAgICAgICAgICAgJ2Fzc2F5TmFtZSc6IG51bGwsXG4gICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50VHlwZSc6IG51bGwsXG4gICAgICAgICAgICAgICAgJ21ldGFkYXRhJzoge30sXG4gICAgICAgICAgICAgICAgJ3NpbmdsZURhdGEnOiBudWxsLFxuICAgICAgICAgICAgICAgIC8vIEZvciBib3RoXG4gICAgICAgICAgICAgICAgJ2RhdGEnOiBbXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHVuaXF1ZVRpbWVzID0gW107XG4gICAgICAgICAgICB0aW1lcyA9IHt9O1xuICAgICAgICAgICAgZm91bmRNZXRhID0gZmFsc2U7XG4gICAgICAgICAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHI6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwdWxsZG93bjogbnVtYmVyLCBsYWJlbDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAoIUVEREFURC5UYWJsZS5hY3RpdmVSb3dGbGFnc1tyXSB8fCAhRUREQVRELlRhYmxlLmFjdGl2ZUZsYWdzW3JdW2NdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHVsbGRvd24gPSBFRERBVEQuVGFibGUucHVsbGRvd25TZXR0aW5nc1tyXTtcbiAgICAgICAgICAgICAgICBsYWJlbCA9IEVEREFURC5HcmlkLnJvd01hcmtlcnNbcl0gfHwgJyc7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSByb3dbY10gfHwgJyc7XG4gICAgICAgICAgICAgICAgaWYgKCFwdWxsZG93bikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMTEpIHsgIC8vIFRyYW5zY3JpcHRvbWljczogUlBLTSB2YWx1ZXNcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC8sL2csICcnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQuc2luZ2xlRGF0YSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxMCkgeyAgLy8gVHJhbnNjcmlwdG9taWNzOiBHZW5lIG5hbWVzXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudFR5cGUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMykgeyAgIC8vIFRpbWVzdGFtcHNcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBsYWJlbC5yZXBsYWNlKC8sL2csICcnKTtcbiAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wID0gcGFyc2VGbG9hdChsYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNOYU4odGltZXN0YW1wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHdlJ3JlIGlnbm9yaW5nIGdhcHMsIHNraXAgb3V0IG9uIHJlY29yZGluZyB0aGlzIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEVEREFURC5HcmlkLmlnbm9yZURhdGFHYXBzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgYWN0dWFsbHkgcHJlZmVyIG51bGwgaGVyZSwgdG8gaW5kaWNhdGUgYSBwbGFjZWhvbGRlciB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGltZXNbdGltZXN0YW1wXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVzW3RpbWVzdGFtcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmlxdWVUaW1lcy5wdXNoKHRpbWVzdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMuc2VlbkFueVRpbWVzdGFtcHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxhYmVsID09PSAnJyB8fCB2YWx1ZSA9PT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm93IHRoYXQgd2UndmUgZGVhbHQgd2l0aCB0aW1lc3RhbXBzLCB3ZSBwcm9jZWVkIG9uIHRvIG90aGVyIGRhdGEgdHlwZXMuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsbCB0aGUgb3RoZXIgZGF0YSB0eXBlcyBkbyBub3QgYWNjZXB0IGEgYmxhbmsgdmFsdWUsIHNvIHdlIHdlZWQgdGhlbSBvdXQgbm93LlxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwdWxsZG93biA9PT0gMSkgeyAgIC8vIEFzc2F5L0xpbmUgTmFtZXNcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgaGF2ZW4ndCBzZWVuIHZhbHVlIGJlZm9yZSwgaW5jcmVtZW50IGFuZCBzdG9yZSB1bmlxdWVuZXNzIGluZGV4XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2VlbkFzc2F5TGluZU5hbWVzW3ZhbHVlXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VlbkFzc2F5TGluZU5hbWVzW3ZhbHVlXSA9ICsrYXNzYXlMaW5lTmFtZXNDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnVuaXF1ZUxpbmVBc3NheU5hbWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNldC5hc3NheSA9IHNlZW5Bc3NheUxpbmVOYW1lc1t2YWx1ZV07XG4gICAgICAgICAgICAgICAgICAgIHNldC5hc3NheU5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHVsbGRvd24gPT09IDIpIHsgICAvLyBNZXRhYm9saXRlIE5hbWVzXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGhhdmVuJ3Qgc2VlbiB2YWx1ZSBiZWZvcmUsIGluY3JlbWVudCBhbmQgc3RvcmUgdW5pcXVlbmVzcyBpbmRleFxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZWFzdXJlbWVudE5hbWVzW3ZhbHVlXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbk1lYXN1cmVtZW50TmFtZXNbdmFsdWVdID0gKyttZWFzdXJlbWVudE5hbWVzQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy51bmlxdWVNZWFzdXJlbWVudE5hbWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudFR5cGUgPSBzZWVuTWVhc3VyZW1lbnROYW1lc1t2YWx1ZV07XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSA0KSB7ICAgLy8gTWV0YWRhdGFcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzZWVuTWV0YWRhdGFOYW1lc1tsYWJlbF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZXRhZGF0YU5hbWVzW2xhYmVsXSA9ICsrbWV0YWRhdGFOYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMudW5pcXVlTWV0YWRhdGFOYW1lcy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXQubWV0YWRhdGFbc2Vlbk1ldGFkYXRhTmFtZXNbbGFiZWxdXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZE1ldGEgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdW5pcXVlVGltZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpLmZvckVhY2goKHRpbWU6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHNldC5kYXRhLnB1c2goW3RpbWUsIHRpbWVzW3RpbWVdXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIG9ubHkgc2F2ZSBpZiBhY2N1bXVsYXRlZCBzb21lIGRhdGEgb3IgbWV0YWRhdGFcbiAgICAgICAgICAgIGlmICh1bmlxdWVUaW1lcy5sZW5ndGggfHwgZm91bmRNZXRhIHx8IHNldC5zaW5nbGVEYXRhICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgRUREQVRELlNldHMucGFyc2VkU2V0cy5wdXNoKHNldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIC8vIFRoZSBhbHRlcm5hdGUgbWV0aG9kOiBBIFwic2V0XCIgZm9yIGV2ZXJ5IGNlbGwgb2YgdGhlIHRhYmxlLCB3aXRoIHRoZSB0aW1lc3RhbXBcbiAgICAvLyB0byBiZSBkZXRlcm1pbmVkIGxhdGVyLlxuICAgIH0gZWxzZSB7XG4gICAgICAgIEVEREFURC5UYWJsZS5jb2xPYmplY3RzLmZvckVhY2goKF8sIGM6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGNlbGxWYWx1ZTogc3RyaW5nLCBzZXQ6IGFueTtcbiAgICAgICAgICAgIGlmICghRUREQVRELlRhYmxlLmFjdGl2ZUNvbEZsYWdzW2NdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2VsbFZhbHVlID0gRUREQVRELkdyaWQuZGF0YVtpbnRlcnByZXRNb2RlWzFdXVtjXSB8fCAnJztcbiAgICAgICAgICAgIGlmIChjZWxsVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiBoYXZlbid0IHNlZW4gY2VsbFZhbHVlIGJlZm9yZSwgaW5jcmVtZW50IGFuZCBzdG9yZSB1bmlxdWVuZXNzIGluZGV4XG4gICAgICAgICAgICAgICAgaWYgKCFzZWVuQXNzYXlMaW5lTmFtZXNbY2VsbFZhbHVlXSkge1xuICAgICAgICAgICAgICAgICAgICBzZWVuQXNzYXlMaW5lTmFtZXNbY2VsbFZhbHVlXSA9ICsrYXNzYXlMaW5lTmFtZXNDb3VudDtcbiAgICAgICAgICAgICAgICAgICAgRUREQVRELlNldHMudW5pcXVlTGluZUFzc2F5TmFtZXMucHVzaChjZWxsVmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBFRERBVEQuR3JpZC5kYXRhLmZvckVhY2goKHJvdzogc3RyaW5nW10sIHI6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcHVsbGRvd246IG51bWJlciwgbGFiZWw6IHN0cmluZywgdmFsdWU6IHN0cmluZywgdGltZXN0YW1wOiBudW1iZXI7XG4gICAgICAgICAgICAgICAgICAgIGlmICghRUREQVRELlRhYmxlLmFjdGl2ZVJvd0ZsYWdzW3JdIHx8ICFFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3Nbcl1bY10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwdWxsZG93biA9IEVEREFURC5UYWJsZS5wdWxsZG93blNldHRpbmdzW3JdO1xuICAgICAgICAgICAgICAgICAgICBsYWJlbCA9IEVEREFURC5HcmlkLnJvd01hcmtlcnNbcl0gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gcm93W2NdIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXB1bGxkb3duIHx8ICEocHVsbGRvd24gPT09IDUgfHwgcHVsbGRvd24gPT09IDEyKSB8fCAhbGFiZWwgfHwgIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHRoZSBncmFwaGluZyBtb2R1bGUgKHdoaWNoIHdlIHdvbid0IGJlIHVzaW5nIGluIHRoaXMgbW9kZSwgYWN0dWFsbHkpXG4gICAgICAgICAgICAgICAgICAgICAgICAnbGFiZWwnOiAnQ29sdW1uICcgKyBjICsgJyByb3cgJyArIHIsXG4gICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdDb2x1bW4gJyArIGMgKyAnIHJvdyAnICsgcixcbiAgICAgICAgICAgICAgICAgICAgICAgICd1bml0cyc6ICd1bml0cycsXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc3VibWlzc2lvbiB0byB0aGUgZGF0YWJhc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICdwYXJzaW5nSW5kZXgnOiBFRERBVEQuU2V0cy5wYXJzZWRTZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICdhc3NheSc6IHNlZW5Bc3NheUxpbmVOYW1lc1tjZWxsVmFsdWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2Fzc2F5TmFtZSc6IGNlbGxWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudFR5cGUnOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ21ldGFkYXRhJzoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAnc2luZ2xlRGF0YSc6IHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGJvdGhcbiAgICAgICAgICAgICAgICAgICAgICAgICdkYXRhJzogW11cbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHB1bGxkb3duID09PSA1KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXNlZW5NZWFzdXJlbWVudE5hbWVzW2xhYmVsXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZW5NZWFzdXJlbWVudE5hbWVzW2xhYmVsXSA9ICsrbWVhc3VyZW1lbnROYW1lc0NvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVEREFURC5TZXRzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMucHVzaChsYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXQubWVhc3VyZW1lbnRUeXBlID0gc2Vlbk1lYXN1cmVtZW50TmFtZXNbbGFiZWxdO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHB1bGxkb3duID09PSAxMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Lm5hbWUgPSBsYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldC5tZWFzdXJlbWVudFR5cGUgPSBsYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBFRERBVEQuU2V0cy5wYXJzZWRTZXRzLnB1c2goc2V0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufSxcblxuXG5xdWV1ZUdyYXBoUmVtYWtlOiAoKTogdm9pZCA9PiB7XG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgLy8gVGhpcyB3YXkgd2UncmUgbm90IGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW5cbiAgICAvLyB0aGV5IGFyZSBtYWtpbmcgZmFzdCBlZGl0cy5cbiAgICBpZiAoRUREQVRELmdyYXBoUmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KEVEREFURC5ncmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICB9XG4gICAgaWYgKEVEREFURC5ncmFwaEVuYWJsZWQpIHtcbiAgICAgICAgRUREQVRELmdyYXBoUmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KEVEREFURC5yZW1ha2VHcmFwaEFyZWEuYmluZChFRERBVEQpLCA3MDApO1xuICAgIH1cbn0sXG5cblxucmVtYWtlR3JhcGhBcmVhOiAoKTogdm9pZCA9PiB7XG4gICAgRUREQVRELmdyYXBoUmVmcmVzaFRpbWVySUQgPSAwOyBcbiAgICBpZiAoIUVEREFUREdyYXBoaW5nIHx8ICFFRERBVEQuZ3JhcGhFbmFibGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgRUREQVRER3JhcGhpbmcuY2xlYXJBbGxTZXRzKCk7XG4gICAgLy8gSWYgd2UncmUgbm90IGluIHRoaXMgbW9kZSwgZHJhd2luZyBhIGdyYXBoIGlzIG5vbnNlbnNpY2FsLlxuICAgIGlmIChFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09PSBcInN0ZFwiKSB7XG4gICAgICAgIEVEREFURC5TZXRzLnBhcnNlZFNldHMuZm9yRWFjaCgoc2V0KSA9PiBFRERBVERHcmFwaGluZy5hZGROZXdTZXQoc2V0KSk7XG4gICAgfVxuICAgIEVEREFUREdyYXBoaW5nLmRyYXdTZXRzKCk7XG59LFxuXG5cbnJlc2V0SW5mb1RhYmxlRmllbGRzOiAoKTogdm9pZCA9PiB7XG4gICAgLy8gVE9UQUxMWSBTVFVCQkVEXG59LFxuXG5cbnJlbWFrZUluZm9UYWJsZUFzc2F5TGluZVNlY3Rpb246IChtYXN0ZXJQOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICB2YXIgdGFibGU6IEhUTUxUYWJsZUVsZW1lbnQsIGJvZHk6IEhUTUxUYWJsZUVsZW1lbnQ7XG4gICAgaWYgKEVEREFURC5TZXRzLnVuaXF1ZUxpbmVBc3NheU5hbWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAkKCcjbWFzdGVyQXNzYXlMaW5lRGl2JykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIE90aGVyd2lzZSwgcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgQXNzYXlzL0xpbmVzXG4gICAgICAgIC8vIEtlZXAgYSBzZXBhcmF0ZSBzZXQgb2YgY29ycmVsYXRpb25zIGJldHdlZW4gc3RyaW5nIGFuZCBwdWxsZG93bnMgZm9yIGVhY2hcbiAgICAgICAgLy8gUHJvdG9jb2wsIHNpbmNlIHNhbWUgc3RyaW5nIGNhbiBtYXRjaCBkaWZmZXJlbnQgQXNzYXlzLCBhbmQgdGhlIHB1bGxkb3duc1xuICAgICAgICAvLyB3aWxsIGhhdmUgZGlmZmVyZW50IGNvbnRlbnQsIGluIGVhY2ggUHJvdG9jb2wuXG4gICAgICAgIEVEREFURC5EaXNhbS5hc3NheUxpbmVPYmpTZXRzW21hc3RlclBdID0ge307XG4gICAgICAgIEVEREFURC5EaXNhbS5jdXJyZW50bHlWaXNpYmxlQXNzYXlMaW5lT2JqU2V0cyA9IFtdO1xuICAgICAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGFibGU+JylcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogJ2Rpc2FtYmlndWF0ZUFzc2F5c1RhYmxlJywgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgLmFwcGVuZFRvKCQoJyNkaXNhbWJpZ3VhdGVMaW5lc0Fzc2F5c1NlY3Rpb24nKS5yZW1vdmVDbGFzcygnb2ZmJykpXG4gICAgICAgICAgICAub24oJ2NoYW5nZScsICdzZWxlY3QnLCAoZXY6IEpRdWVyeUlucHV0RXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBFRERBVEQudXNlckNoYW5nZWRBc3NheUxpbmVEaXNhbShldi50YXJnZXQpO1xuICAgICAgICAgICAgfSlbMF07XG4gICAgICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAgICAgRUREQVRELlNldHMudW5pcXVlTGluZUFzc2F5TmFtZXMuZm9yRWFjaCgobmFtZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBkaXNhbTogYW55LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQsIGRlZmF1bHRTZWw6IGFueSxcbiAgICAgICAgICAgICAgICBjZWxsOiBKUXVlcnksIGFTZWxlY3Q6IEpRdWVyeSwgbFNlbGVjdDogSlF1ZXJ5O1xuICAgICAgICAgICAgZGlzYW0gPSBFRERBVEQuRGlzYW0uYXNzYXlMaW5lT2JqU2V0c1ttYXN0ZXJQXVtuYW1lXTtcbiAgICAgICAgICAgIGlmICghZGlzYW0pIHtcbiAgICAgICAgICAgICAgICBkaXNhbSA9IHt9O1xuICAgICAgICAgICAgICAgIGRlZmF1bHRTZWwgPSBFRERBVEQuZGlzYW1iaWd1YXRlQW5Bc3NheU9yTGluZShuYW1lLCBpKTtcbiAgICAgICAgICAgICAgICAvLyBGaXJzdCBtYWtlIGEgdGFibGUgcm93LCBhbmQgc2F2ZSBhIHJlZmVyZW5jZSB0byBpdFxuICAgICAgICAgICAgICAgIGRpc2FtLnJvd09iaiA9IHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PiBib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgIC8vIE5leHQsIGFkZCBhIHRhYmxlIGNlbGwgd2l0aCB0aGUgc3RyaW5nIHdlIGFyZSBkaXNhbWJpZ3VhdGluZ1xuICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChuYW1lKS5hcHBlbmRUbyhyb3cuaW5zZXJ0Q2VsbCgpKTtcbiAgICAgICAgICAgICAgICAvLyBOb3cgYnVpbGQgYW5vdGhlciB0YWJsZSBjZWxsIHRoYXQgd2lsbCBjb250YWluIHRoZSBwdWxsZG93bnNcbiAgICAgICAgICAgICAgICBjZWxsID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5jc3MoJ3RleHQtYWxpZ24nLCAnbGVmdCcpO1xuICAgICAgICAgICAgICAgIGFTZWxlY3QgPSAkKCc8c2VsZWN0PicpLmFwcGVuZFRvKGNlbGwpXG4gICAgICAgICAgICAgICAgICAgIC5kYXRhKHsgJ3NldEJ5VXNlcic6IGZhbHNlLCAndmlzaWJsZUluZGV4JzogaSB9KVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignbmFtZScsICdkaXNhbUFzc2F5JyArIChpICsgMSkpO1xuICAgICAgICAgICAgICAgIGRpc2FtLmFzc2F5T2JqID0gYVNlbGVjdFswXTtcbiAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoJyhDcmVhdGUgTmV3KScpLmFwcGVuZFRvKGFTZWxlY3QpLnZhbCgnbmV3JylcbiAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgIWRlZmF1bHRTZWwuYXNzYXlJRCk7XG4gICAgICAgICAgICAgICAgKEFURGF0YS5leGlzdGluZ0Fzc2F5c1ttYXN0ZXJQXSB8fCBbXSkuZm9yRWFjaCgoaWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IEFzc2F5UmVjb3JkLCBsaW5lOiBMaW5lUmVjb3JkLCBwcm90b2NvbDogYW55O1xuICAgICAgICAgICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW2lkXTtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQoW2xpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGFTZWxlY3QpLnZhbChpZC50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgZGVmYXVsdFNlbC5hc3NheUlEID09PSBpZCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gYSBzcGFuIHRvIGNvbnRhaW4gdGhlIHRleHQgbGFiZWwgZm9yIHRoZSBMaW5lIHB1bGxkb3duLCBhbmQgdGhlIHB1bGxkb3duIGl0c2VsZlxuICAgICAgICAgICAgICAgIGNlbGwgPSAkKCc8c3Bhbj4nKS50ZXh0KCdmb3IgTGluZTonKS50b2dnbGVDbGFzcygnb2ZmJywgISFkZWZhdWx0U2VsLmFzc2F5SUQpXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICBsU2VsZWN0ID0gJCgnPHNlbGVjdD4nKS5hcHBlbmRUbyhjZWxsKS5kYXRhKCdzZXRCeVVzZXInLCBmYWxzZSlcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ25hbWUnLCAnZGlzYW1MaW5lJyArIChpICsgMSkpO1xuICAgICAgICAgICAgICAgIGRpc2FtLmxpbmVPYmogPSBsU2VsZWN0WzBdO1xuICAgICAgICAgICAgICAgICQoJzxvcHRpb24+JykudGV4dCgnKENyZWF0ZSBOZXcpJykuYXBwZW5kVG8obFNlbGVjdCkudmFsKCduZXcnKVxuICAgICAgICAgICAgICAgICAgICAucHJvcCgnc2VsZWN0ZWQnLCAhZGVmYXVsdFNlbC5saW5lSUQpO1xuICAgICAgICAgICAgICAgIC8vIEFURGF0YS5leGlzdGluZ0xpbmVzIGlzIG9mIHR5cGUge2lkOiBudW1iZXI7IG46IHN0cmluZzt9W11cbiAgICAgICAgICAgICAgICAoQVREYXRhLmV4aXN0aW5nTGluZXMgfHwgW10pLmZvckVhY2goKGxpbmU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAkKCc8b3B0aW9uPicpLnRleHQobGluZS5uKS5hcHBlbmRUbyhsU2VsZWN0KS52YWwobGluZS5pZC50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnByb3AoJ3NlbGVjdGVkJywgZGVmYXVsdFNlbC5saW5lSUQgPT09IGxpbmUuaWQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIEVEREFURC5EaXNhbS5hc3NheUxpbmVPYmpTZXRzW21hc3RlclBdW25hbWVdID0gZGlzYW07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKGRpc2FtLnJvd09iaikuYXBwZW5kVG8oYm9keSk7XG4gICAgICAgICAgICBFRERBVEQuRGlzYW0uY3VycmVudGx5VmlzaWJsZUFzc2F5TGluZU9ialNldHMucHVzaChkaXNhbSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn0sXG5cblxucmVtYWtlSW5mb1RhYmxlTWVhc3VyZW1lbnRTZWN0aW9uOiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIHRhYmxlOiBIVE1MVGFibGVFbGVtZW50LCBib2R5OiBIVE1MVGFibGVFbGVtZW50LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQ7XG4gICAgLy8gcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgbWVhc3VyZW1lbnQgdHlwZXNcbiAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGFibGU+JylcbiAgICAgICAgLmF0dHIoeyAnaWQnOiAnZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzVGFibGUnLCAnY2VsbHNwYWNpbmcnOiAwIH0pXG4gICAgICAgIC5hcHBlbmRUbygkKCcjZGlzYW1iaWd1YXRlTWVhc3VyZW1lbnRzU2VjdGlvbicpLnJlbW92ZUNsYXNzKCdvZmYnKSlcbiAgICAgICAgLm9uKCdjaGFuZ2UnLCAnaW5wdXRbdHlwZT1oaWRkZW5dJywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAvLyBvbmx5IHdhdGNoIGZvciBjaGFuZ2VzIG9uIHRoZSBoaWRkZW4gcG9ydGlvbiwgbGV0IGF1dG9jb21wbGV0ZSB3b3JrXG4gICAgICAgICAgICBFRERBVEQudXNlckNoYW5nZWRNZWFzdXJlbWVudERpc2FtKGV2LnRhcmdldCk7XG4gICAgICAgIH0pWzBdO1xuICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICAvLyBIZWFkZXJzIGZvciB0aGUgdGFibGVcbiAgICByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD4gYm9keS5pbnNlcnRSb3coKTtcbiAgICAkKCc8dGg+JykuYXR0cih7ICdjb2xzcGFuJzogMiB9KS5jc3MoJ3RleHQtYWxpZ24nLCAncmlnaHQnKS50ZXh0KCdDb21wYXJ0bWVudCcpLmFwcGVuZFRvKHJvdyk7XG4gICAgJCgnPHRoPicpLnRleHQoJ1R5cGUnKS5hcHBlbmRUbyhyb3cpO1xuICAgICQoJzx0aD4nKS50ZXh0KEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT09ICdzdGQnID8gJ1VuaXRzJyA6ICcnKS5hcHBlbmRUbyhyb3cpO1xuICAgIC8vIERvbmUgd2l0aCBoZWFkZXJzIHJvd1xuICAgIEVEREFURC5EaXNhbS5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzID0gW107ICAgLy8gRm9yIHVzZSBpbiBjYXNjYWRpbmcgdXNlciBzZXR0aW5nc1xuICAgIEVEREFURC5TZXRzLnVuaXF1ZU1lYXN1cmVtZW50TmFtZXMuZm9yRWFjaCgobmFtZTogc3RyaW5nLCBpOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIGRpc2FtOiBhbnk7XG4gICAgICAgIGRpc2FtID0gRUREQVRELkRpc2FtLm1lYXN1cmVtZW50T2JqU2V0c1tuYW1lXTtcbiAgICAgICAgaWYgKGRpc2FtICYmIGRpc2FtLnJvd09iaikge1xuICAgICAgICAgICAgJChkaXNhbS5yb3dPYmopLmFwcGVuZFRvKGJvZHkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGlzYW0gPSB7fTtcbiAgICAgICAgICAgIGRpc2FtLnJvd09iaiA9IHJvdyA9IDxIVE1MVGFibGVSb3dFbGVtZW50PiBib2R5Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KG5hbWUpLmFwcGVuZFRvKHJvdy5pbnNlcnRDZWxsKCkpO1xuICAgICAgICAgICAgWydjb21wT2JqJywgJ3R5cGVPYmonLCAndW5pdHNPYmonXS5mb3JFYWNoKChhdXRvOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2VsbDogSlF1ZXJ5ID0gJChyb3cuaW5zZXJ0Q2VsbCgpKS5hZGRDbGFzcygnZGlzYW1EYXRhQ2VsbCcpO1xuICAgICAgICAgICAgICAgIGRpc2FtW2F1dG9dID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZShjZWxsKS5kYXRhKCd0eXBlJywgYXV0byk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIEVEREFURC5EaXNhbS5tZWFzdXJlbWVudE9ialNldHNbbmFtZV0gPSBkaXNhbTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPIHNpemluZyBzaG91bGQgYmUgaGFuZGxlZCBpbiBDU1NcbiAgICAgICAgZGlzYW0uY29tcE9iai5hdHRyKCdzaXplJywgNCkuZGF0YSgndmlzaWJsZUluZGV4JywgaSlcbiAgICAgICAgICAgIC5uZXh0KCkuYXR0cignbmFtZScsICdkaXNhbU1Db21wJyArIChpICsgMSkpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZGlzYW0uY29tcE9iaiwgJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnLCBFRERBVEQuQXV0b0NhY2hlLmNvbXApO1xuICAgICAgICBkaXNhbS50eXBlT2JqLmF0dHIoJ3NpemUnLCA0NSkuZGF0YSgndmlzaWJsZUluZGV4JywgaSlcbiAgICAgICAgICAgIC5uZXh0KCkuYXR0cignbmFtZScsICdkaXNhbU1UeXBlJyArIChpICsgMSkpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZGlzYW0udHlwZU9iaiwgJ0dlbmVyaWNPck1ldGFib2xpdGUnLCBFRERBVEQuQXV0b0NhY2hlLm1ldGFib2xpdGUpO1xuICAgICAgICBFRERfYXV0by5pbml0aWFsX3NlYXJjaChkaXNhbS50eXBlT2JqLCBuYW1lKTtcbiAgICAgICAgZGlzYW0udW5pdHNPYmouYXR0cignc2l6ZScsIDEwKS5kYXRhKCd2aXNpYmxlSW5kZXgnLCBpKVxuICAgICAgICAgICAgLm5leHQoKS5hdHRyKCduYW1lJywgJ2Rpc2FtTVVuaXRzJyArIChpICsgMSkpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZGlzYW0udW5pdHNPYmosICdNZWFzdXJlbWVudFVuaXQnLCBFRERBVEQuQXV0b0NhY2hlLnVuaXQpO1xuICAgICAgICAvLyBJZiB3ZSdyZSBpbiBNRFYgbW9kZSwgdGhlIHVuaXRzIHB1bGxkb3ducyBhcmUgaXJyZWxldmFudC5cbiAgICAgICAgZGlzYW0udW5pdHNPYmoudG9nZ2xlQ2xhc3MoJ29mZicsIEVEREFURC5pbnRlcnByZXRhdGlvbk1vZGUgPT09ICdtZHYnKTtcbiAgICB9KTtcbiAgICBFRERBVEQuY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW0oKTtcbn0sXG5cblxucmVtYWtlSW5mb1RhYmxlTWV0YWRhdGFTZWN0aW9uOiAoKTogdm9pZCA9PiB7XG4gICAgdmFyIHRhYmxlOiBIVE1MVGFibGVFbGVtZW50LCBib2R5OiBIVE1MVGFibGVFbGVtZW50LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQ7XG4gICAgLy8gcHV0IHRvZ2V0aGVyIGEgZGlzYW1iaWd1YXRpb24gc2VjdGlvbiBmb3IgbWV0YWRhdGFcbiAgICB0YWJsZSA9IDxIVE1MVGFibGVFbGVtZW50PiAkKCc8dGFibGU+JylcbiAgICAgICAgLmF0dHIoeyAnaWQnOiAnZGlzYW1iaWd1YXRlTWV0YWRhdGFUYWJsZScsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgLmFwcGVuZFRvKCQoJyNkaXNhbWJpZ3VhdGVNZXRhZGF0YVNlY3Rpb24nKS5yZW1vdmVDbGFzcygnb2ZmJykpXG4gICAgICAgIC5vbignY2hhbmdlJywgJ2lucHV0JywgKGV2OiBKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAvLyBzaG91bGQgdGhlcmUgYmUgZXZlbnQgaGFuZGxpbmcgaGVyZSA/XG4gICAgICAgIH0pWzBdO1xuICAgIGJvZHkgPSA8SFRNTFRhYmxlRWxlbWVudD4gJCgnPHRib2R5PicpLmFwcGVuZFRvKHRhYmxlKVswXTtcbiAgICBFRERBVEQuU2V0cy51bmlxdWVNZXRhZGF0YU5hbWVzLmZvckVhY2goKG5hbWU6IHN0cmluZywgaTogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgIHZhciBkaXNhbTogYW55O1xuICAgICAgICBkaXNhbSA9IEVEREFURC5EaXNhbS5tZXRhZGF0YU9ialNldHNbbmFtZV07XG4gICAgICAgIGlmIChkaXNhbSAmJiBkaXNhbS5yb3dPYmopIHtcbiAgICAgICAgICAgICQoZGlzYW0ucm93T2JqKS5hcHBlbmRUbyhib2R5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRpc2FtID0ge307XG4gICAgICAgICAgICBkaXNhbS5yb3dPYmogPSByb3cgPSA8SFRNTFRhYmxlUm93RWxlbWVudD4gYm9keS5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICQoJzxkaXY+JykudGV4dChuYW1lKS5hcHBlbmRUbyhyb3cuaW5zZXJ0Q2VsbCgpKTtcbiAgICAgICAgICAgIGRpc2FtLm1ldGFPYmogPSBFRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlKHJvdy5pbnNlcnRDZWxsKCkpLnZhbChuYW1lKTtcbiAgICAgICAgICAgIEVEREFURC5EaXNhbS5tZXRhZGF0YU9ialNldHNbbmFtZV0gPSBkaXNhbTtcbiAgICAgICAgfVxuICAgICAgICBkaXNhbS5tZXRhT2JqLmF0dHIoJ25hbWUnLCAnZGlzYW1NZXRhJyArIChpICsgMSkpLmFkZENsYXNzKCdhdXRvY29tcF9hbHR5cGUnKVxuICAgICAgICAgICAgLm5leHQoKS5hdHRyKCduYW1lJywgJ2Rpc2FtTWV0YUhpZGRlbicgKyAoaSArIDEpKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGRpc2FtLm1ldGFPYmosICdBc3NheUxpbmVNZXRhZGF0YVR5cGUnLCBFRERBVEQuQXV0b0NhY2hlLm1ldGEpO1xuICAgIH0pO1xufSxcblxuXG4vLyBDcmVhdGUgdGhlIFN0ZXAgNCB0YWJsZTogIEEgc2V0IG9mIHJvd3MsIG9uZSBmb3IgZWFjaCB5LWF4aXMgY29sdW1uIG9mIGRhdGEsXG4vLyB3aGVyZSB0aGUgdXNlciBjYW4gZmlsbCBvdXQgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiBmb3IgdGhlIHBhc3RlZCB0YWJsZS5cbnJlbWFrZUluZm9UYWJsZTogKCk6IHZvaWQgPT4ge1xuICAgIHZhciBtYXN0ZXJQID0gRUREQVRELm1hc3RlclByb3RvY29sOyAgICAvLyBTaG91dC1vdXRzIHRvIGEgbWlkLWdyYWRlIHJhcHBlclxuICAgIC8vIEluaXRpYWxseSBoaWRlIGFsbCB0aGUgU3RlcCA0IG1hc3RlciBwdWxsZG93bnMgc28gd2UgY2FuIHJldmVhbCBqdXN0IHRoZSBvbmVzIHdlIG5lZWQgbGF0ZXJcbiAgICAkKCcjbWFzdGVyQXNzYXlMaW5lRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICQoJyNtYXN0ZXJNVHlwZURpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAkKCcjZGlzYW1iaWd1YXRlTGluZXNBc3NheXNTZWN0aW9uJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICQoJyNkaXNhbWJpZ3VhdGVNZWFzdXJlbWVudHNTZWN0aW9uJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICQoJyNkaXNhbWJpZ3VhdGVNZXRhZGF0YVNlY3Rpb24nKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgJCgnI2Rpc2FtYmlndWF0ZUFzc2F5c1RhYmxlJykucmVtb3ZlKCk7XG4gICAgJCgnI2Rpc2FtYmlndWF0ZU1lYXN1cmVtZW50c1RhYmxlJykucmVtb3ZlKCk7XG4gICAgJCgnI2Rpc2FtYmlndWF0ZU1ldGFkYXRhVGFibGUnKS5yZW1vdmUoKTtcbiAgICAvLyBJZiBubyBzZXRzIHRvIHNob3csIGxlYXZlIHRoZSBhcmVhIGJsYW5rIGFuZCBzaG93IHRoZSAnZW50ZXIgc29tZSBkYXRhIScgYmFubmVyXG4gICAgaWYgKEVEREFURC5TZXRzLnBhcnNlZFNldHMubGVuZ3RoID09PSAwKSB7ICAgXG4gICAgICAgICQoJyNlbXB0eURpc2FtYmlndWF0aW9uTGFiZWwnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgJCgnI2VtcHR5RGlzYW1iaWd1YXRpb25MYWJlbCcpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAvLyBJZiBwYXJzZWQgZGF0YSBleGlzdHMsIGJ1dCBoYXZlbid0IHNlZW4gYSBzaW5nbGUgdGltZXN0YW1wIHNob3cgdGhlIFwibWFzdGVyIHRpbWVzdGFtcFwiIFVJLlxuICAgICQoJyNtYXN0ZXJUaW1lc3RhbXBEaXYnKS50b2dnbGVDbGFzcygnb2ZmJywgRUREQVRELlNldHMuc2VlbkFueVRpbWVzdGFtcHMpO1xuICAgIC8vIElmIHdlIGhhdmUgbm8gQXNzYXlzL0xpbmVzIGRldGVjdGVkIGZvciBkaXNhbWJpZ3VhdGlvbiwgYXNrIHRoZSB1c2VyIHRvIHNlbGVjdCBvbmUuXG4gICAgRUREQVRELnJlbWFrZUluZm9UYWJsZUFzc2F5TGluZVNlY3Rpb24oRUREQVRELm1hc3RlclByb3RvY29sKTtcbiAgICAvLyBJZiBpbiAnVHJhbnNjcmlwdGlvbicgb3IgJ1Byb3Rlb21pY3MnIG1vZGUsIHRoZXJlIGFyZSBubyBtZWFzdXJlbWVudCB0eXBlcyBpbnZvbHZlZC5cbiAgICAvLyBza2lwIHRoZSBtZWFzdXJlbWVudCBzZWN0aW9uLCBhbmQgcHJvdmlkZSBzdGF0aXN0aWNzIGFib3V0IHRoZSBnYXRoZXJlZCByZWNvcmRzLlxuICAgIGlmIChFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlID09PSBcInRyXCIgfHwgRUREQVRELmludGVycHJldGF0aW9uTW9kZSA9PT0gXCJwclwiKSB7XG4gICAgICAgIC8vIG5vLW9wXG4gICAgfSBlbHNlIGlmIChFRERBVEQuU2V0cy51bmlxdWVNZWFzdXJlbWVudE5hbWVzLmxlbmd0aCA9PT0gMCAmJiBFRERBVEQuU2V0cy5zZWVuQW55VGltZXN0YW1wcykge1xuICAgICAgICAvLyBubyBtZWFzdXJlbWVudHMgZm9yIGRpc2FtYmlndWF0aW9uLCBoYXZlIHRpbWVzdGFtcCBkYXRhID0+IGFzayB0aGUgdXNlciB0byBzZWxlY3Qgb25lXG4gICAgICAgICQoJyNtYXN0ZXJNVHlwZURpdicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBoYXZlIG1lYXN1cmVtZW50IHR5cGVzLCBpbiBhcHByb3ByYXRlIG1vZGUsIHJlbWFrZSBtZWFzdXJlbWVudCBzZWN0aW9uXG4gICAgICAgIEVEREFURC5yZW1ha2VJbmZvVGFibGVNZWFzdXJlbWVudFNlY3Rpb24oKTtcbiAgICB9XG4gICAgLy8gSWYgd2UndmUgZGV0ZWN0ZWQgYW55IG1ldGFkYXRhIHR5cGVzIGZvciBkaXNhbWJpZ3VhdGlvbiwgY3JlYXRlIGEgc2VjdGlvblxuICAgIGlmIChFRERBVEQuU2V0cy51bmlxdWVNZXRhZGF0YU5hbWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgRUREQVRELnJlbWFrZUluZm9UYWJsZU1ldGFkYXRhU2VjdGlvbigpO1xuICAgIH1cbiAgICAvLyBpZiB0aGUgZGVidWcgYXJlYSBpcyB0aGVyZSwgc2V0IGl0cyB2YWx1ZSB0byBKU09OIG9mIHBhcnNlZCBzZXRzXG4gICAgJCgnI2pzb25kZWJ1Z2FyZWEnKS52YWwoSlNPTi5zdHJpbmdpZnkoRUREQVRELlNldHMucGFyc2VkU2V0cykpO1xufSxcblxuXG4vLyBUaGlzIGZ1bmN0aW9uIHNlcnZlcyB0d28gcHVycG9zZXMuXG4vLyAxLiBJZiB0aGUgZ2l2ZW4gQXNzYXkgZGlzYW1iaWd1YXRpb24gcHVsbGRvd24gaXMgYmVpbmcgc2V0IHRvICduZXcnLCByZXZlYWwgdGhlIGFkamFjZW50XG4vLyAgICBMaW5lIHB1bGxkb3duLCBvdGhlcndpc2UgaGlkZSBpdC5cbi8vIDIuIElmIHRoZSBwdWxsZG93biBpcyBiZWluZyBzZXQgdG8gJ25ldycsIHdhbGsgZG93biB0aGUgcmVtYWluaW5nIHB1bGxkb3ducyBpbiB0aGUgc2VjdGlvbixcbi8vICAgIGluIG9yZGVyLCBzZXR0aW5nIHRoZW0gdG8gJ25ldycgYXMgd2VsbCwgc3RvcHBpbmcganVzdCBiZWZvcmUgYW55IHB1bGxkb3duIG1hcmtlZCBhc1xuLy8gICAgYmVpbmcgJ3NldCBieSB0aGUgdXNlcicuXG51c2VyQ2hhbmdlZEFzc2F5TGluZURpc2FtOiAoYXNzYXlFbDogSFRNTEVsZW1lbnQpOiBib29sZWFuID0+IHtcbiAgICB2YXIgY2hhbmdlZDogSlF1ZXJ5LCB2OiBudW1iZXI7XG4gICAgY2hhbmdlZCA9ICQoYXNzYXlFbCkuZGF0YSgnc2V0QnlVc2VyJywgdHJ1ZSk7XG4gICAgLy8gVGhlIHNwYW4gd2l0aCB0aGUgY29ycmVzcG9uZGluZyBMaW5lIHB1bGxkb3duIGlzIGFsd2F5cyByaWdodCBuZXh0IHRvIHRoZSBBc3NheSBwdWxsZG93blxuICAgIGNoYW5nZWQubmV4dCgpLnRvZ2dsZUNsYXNzKCdvZmYnLCBjaGFuZ2VkLnZhbCgpICE9PSAnbmV3Jyk7XG4gICAgaWYgKGNoYW5nZWQudmFsKCkgIT09ICduZXcnKSB7XG4gICAgICAgIC8vIHN0b3AgaGVyZSBmb3IgYW55dGhpbmcgb3RoZXIgdGhhbiAnbmV3Jzsgb25seSAnbmV3JyBjYXNjYWRlcyB0byBmb2xsb3dpbmcgcHVsbGRvd25zXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgdiA9IGNoYW5nZWQuZGF0YSgndmlzaWJsZUluZGV4JykgfHwgMDtcbiAgICBFRERBVEQuRGlzYW0uY3VycmVudGx5VmlzaWJsZUFzc2F5TGluZU9ialNldHMuc2xpY2UodikuZm9yRWFjaCgob2JqOiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgdmFyIHNlbGVjdDogSlF1ZXJ5ID0gJChvYmouYXNzYXlPYmopO1xuICAgICAgICBpZiAoc2VsZWN0LmRhdGEoJ3NldEJ5VXNlcicpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gc2V0IGRyb3Bkb3duIHRvICduZXcnIGFuZCByZXZlYWwgdGhlIGxpbmUgcHVsbGRvd25cbiAgICAgICAgc2VsZWN0LnZhbCgnbmV3JykubmV4dCgpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICB9KTtcbiAgICByZXR1cm4gZmFsc2U7XG59LFxuXG5cbnVzZXJDaGFuZ2VkTWVhc3VyZW1lbnREaXNhbTogKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCA9PiB7XG4gICAgdmFyIGhpZGRlbjogSlF1ZXJ5LCBhdXRvOiBKUXVlcnksIHR5cGU6IHN0cmluZywgaTogbnVtYmVyO1xuICAgIGhpZGRlbiA9ICQoZWxlbWVudCk7XG4gICAgYXV0byA9IGhpZGRlbi5wcmV2KCk7XG4gICAgdHlwZSA9IGF1dG8uZGF0YSgndHlwZScpO1xuICAgIGlmICh0eXBlID09PSAnY29tcE9iaicgfHwgdHlwZSA9PT0gJ3VuaXRzT2JqJykge1xuICAgICAgICBpID0gYXV0by5kYXRhKCdzZXRCeVVzZXInLCB0cnVlKS5kYXRhKCd2aXNpYmxlSW5kZXgnKSB8fCAwO1xuICAgICAgICBFRERBVEQuRGlzYW0uY3VycmVudGx5VmlzaWJsZU1lYXN1cmVtZW50T2JqU2V0cy5zbGljZShpKS5zb21lKChvYmo6IGFueSk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgdmFyIGZvbGxvd2luZzogSlF1ZXJ5ID0gJChvYmpbdHlwZV0pO1xuICAgICAgICAgICAgaWYgKGZvbGxvd2luZy5sZW5ndGggPT09IDAgfHwgZm9sbG93aW5nLmRhdGEoJ3NldEJ5VXNlcicpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBicmVhazsgZm9yIHRoZSBBcnJheS5zb21lKCkgbG9vcFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdXNpbmcgcGxhY2Vob2xkZXIgaW5zdGVhZCBvZiB2YWwgdG8gYXZvaWQgdHJpZ2dlcmluZyBhdXRvY29tcGxldGUgY2hhbmdlXG4gICAgICAgICAgICBmb2xsb3dpbmcuYXR0cigncGxhY2Vob2xkZXInLCBhdXRvLnZhbCgpKTtcbiAgICAgICAgICAgIGZvbGxvd2luZy5uZXh0KCkudmFsKGhpZGRlbi52YWwoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBub3QgY2hlY2tpbmcgdHlwZU9iajsgZm9ybSBzdWJtaXQgc2VuZHMgc2VsZWN0ZWQgdHlwZXNcbiAgICBFRERBVEQuY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW0oKTtcbn0sXG5cblxuLy8gUnVuIHRocm91Z2ggdGhlIGxpc3Qgb2YgY3VycmVudGx5IHZpc2libGUgbWVhc3VyZW1lbnQgZGlzYW1iaWd1YXRpb24gZm9ybSBlbGVtZW50cyxcbi8vIGNoZWNraW5nIHRvIHNlZSBpZiBhbnkgb2YgdGhlICdjb21wYXJ0bWVudCcgZWxlbWVudHMgYXJlIHNldCB0byBhIG5vbi1ibGFuayB2YWx1ZS5cbi8vIElmIGFueSBhcmUsIGFuZCB3ZSdyZSBpbiBNRFYgZG9jdW1lbnQgbW9kZSwgZGlzcGxheSBhIHdhcm5pbmcgdGhhdCB0aGUgdXNlciBzaG91bGRcbi8vIHNwZWNpZnkgY29tcGFydG1lbnRzIGZvciBhbGwgdGhlaXIgbWVhc3VyZW1lbnRzLlxuY2hlY2tBbGxNZWFzdXJlbWVudENvbXBhcnRtZW50RGlzYW06ICgpOiB2b2lkID0+IHtcbiAgICB2YXIgYWxsU2V0OiBib29sZWFuO1xuICAgIGFsbFNldCA9IEVEREFURC5EaXNhbS5jdXJyZW50bHlWaXNpYmxlTWVhc3VyZW1lbnRPYmpTZXRzLmV2ZXJ5KChvYmo6IGFueSk6IGJvb2xlYW4gPT4ge1xuICAgICAgICB2YXIgaGlkZGVuOiBKUXVlcnkgPSBvYmouY29tcE9iai5uZXh0KCk7XG4gICAgICAgIGlmIChvYmouY29tcE9iai5kYXRhKCdzZXRCeVVzZXInKSB8fCAoaGlkZGVuLnZhbCgpICYmIGhpZGRlbi52YWwoKSAhPT0gJzAnKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0pO1xuICAgICQoJyNub0NvbXBhcnRtZW50V2FybmluZycpLnRvZ2dsZUNsYXNzKCdvZmYnLCBFRERBVEQuaW50ZXJwcmV0YXRpb25Nb2RlICE9PSAnbWR2JyAmJiBhbGxTZXQpO1xufSxcblxuXG5kaXNhbWJpZ3VhdGVBbkFzc2F5T3JMaW5lOiAoYXNzYXlPckxpbmU6IHN0cmluZywgY3VycmVudEluZGV4OiBudW1iZXIpOiBhbnkgPT4ge1xuICAgIHZhciBzZWxlY3Rpb25zOiBhbnksIGhpZ2hlc3Q6IG51bWJlciwgYXNzYXlzOiBudW1iZXJbXTtcbiAgICBzZWxlY3Rpb25zID0ge1xuICAgICAgICBsaW5lSUQ6MCxcbiAgICAgICAgYXNzYXlJRDowXG4gICAgfTtcbiAgICBoaWdoZXN0ID0gMDtcbiAgICAvLyBBVERhdGEuZXhpc3RpbmdBc3NheXMgaXMgdHlwZSB7W2luZGV4OiBzdHJpbmddOiBudW1iZXJbXX1cbiAgICBhc3NheXMgPSBBVERhdGEuZXhpc3RpbmdBc3NheXNbRUREQVRELm1hc3RlclByb3RvY29sXSB8fCBbXTtcbiAgICBhc3NheXMuZXZlcnkoKGlkOiBudW1iZXIsIGk6IG51bWJlcik6IGJvb2xlYW4gPT4ge1xuICAgICAgICB2YXIgYXNzYXk6IEFzc2F5UmVjb3JkLCBsaW5lOiBMaW5lUmVjb3JkLCBwcm90b2NvbDogYW55LCBuYW1lOiBzdHJpbmc7XG4gICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgIG5hbWUgPSBbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG4gICAgICAgIGlmIChhc3NheU9yTGluZS50b0xvd2VyQ2FzZSgpID09PSBuYW1lLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBmdWxsIEFzc2F5IG5hbWUsIGV2ZW4gY2FzZS1pbnNlbnNpdGl2ZSwgaXMgdGhlIGJlc3QgbWF0Y2hcbiAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAgLy8gZG8gbm90IG5lZWQgdG8gY29udGludWVcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC44ICYmIGFzc2F5T3JMaW5lID09PSBhc3NheS5uYW1lKSB7XG4gICAgICAgICAgICAvLyBBbiBleGFjdC1jYXNlIG1hdGNoIHdpdGggdGhlIEFzc2F5IG5hbWUgZnJhZ21lbnQgYWxvbmUgaXMgc2Vjb25kLWJlc3QuXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC44O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5hc3NheUlEID0gaWQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaGlnaGVzdCA8IDAuNyAmJiBhc3NheS5uYW1lLmluZGV4T2YoYXNzYXlPckxpbmUpID49IDApIHtcbiAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIHdob2xlIHN0cmluZyBpbnNpZGUgdGhlIEFzc2F5IG5hbWUgZnJhZ21lbnQgaXMgcHJldHR5IGdvb2RcbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjc7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC42ICYmIGxpbmUubmFtZS5pbmRleE9mKGFzc2F5T3JMaW5lKSA+PSAwKSB7XG4gICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSB3aG9sZSBzdHJpbmcgaW5zaWRlIHRoZSBvcmlnaW5hdGluZyBMaW5lIG5hbWUgaXMgZ29vZCB0b28uXG4gICAgICAgICAgICAvLyBJdCBtZWFucyB0aGF0IHRoZSB1c2VyIG1heSBpbnRlbmQgdG8gcGFpciB3aXRoIHRoaXMgQXNzYXkgZXZlbiB0aG91Z2ggdGhlXG4gICAgICAgICAgICAvLyBBc3NheSBuYW1lIGlzIGRpZmZlcmVudC4gIFxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuNjtcbiAgICAgICAgICAgIHNlbGVjdGlvbnMuYXNzYXlJRCA9IGlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjQgJiZcbiAgICAgICAgICAgICAgICAobmV3IFJlZ0V4cCgnKF58XFxcXFcpJyArIGFzc2F5Lm5hbWUgKyAnKFxcXFxXfCQpJywgJ2cnKSkudGVzdChhc3NheU9yTGluZSkpIHtcbiAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIEFzc2F5IG5hbWUgZnJhZ21lbnQgd2l0aGluIHRoZSB3aG9sZSBzdHJpbmcsIGFzIGEgd2hvbGUgd29yZCwgaXMgb3VyXG4gICAgICAgICAgICAvLyBsYXN0IG9wdGlvbi5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjQ7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC4zICYmIGN1cnJlbnRJbmRleCA9PT0gaSkge1xuICAgICAgICAgICAgLy8gSWYgYWxsIGVsc2UgZmFpbHMsIGNob29zZSBBc3NheSBvZiBjdXJyZW50IGluZGV4IGluIHNvcnRlZCBvcmRlci5cbiAgICAgICAgICAgIGhpZ2hlc3QgPSAwLjM7XG4gICAgICAgICAgICBzZWxlY3Rpb25zLmFzc2F5SUQgPSBpZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgICAvLyBOb3cgd2UgcmVwZWF0IHRoZSBwcmFjdGljZSwgc2VwYXJhdGVseSwgZm9yIHRoZSBMaW5lIHB1bGxkb3duLlxuICAgIGhpZ2hlc3QgPSAwO1xuICAgIC8vIEFURGF0YS5leGlzdGluZ0xpbmVzIGlzIHR5cGUge2lkOiBudW1iZXI7IG46IHN0cmluZzt9W11cbiAgICAoQVREYXRhLmV4aXN0aW5nTGluZXMgfHwgW10pLmV2ZXJ5KChsaW5lOiBhbnksIGk6IG51bWJlcik6IGJvb2xlYW4gPT4ge1xuICAgICAgICBpZiAoYXNzYXlPckxpbmUgPT09IGxpbmUubikge1xuICAgICAgICAgICAgLy8gVGhlIExpbmUgbmFtZSwgY2FzZS1zZW5zaXRpdmUsIGlzIHRoZSBiZXN0IG1hdGNoXG4gICAgICAgICAgICBzZWxlY3Rpb25zLmxpbmVJRCA9IGxpbmUuaWQ7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7ICAvLyBkbyBub3QgbmVlZCB0byBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjggJiYgYXNzYXlPckxpbmUudG9Mb3dlckNhc2UoKSA9PT0gbGluZS5uLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBzYW1lIHRoaW5nIGNhc2UtaW5zZW5zaXRpdmUgaXMgc2Vjb25kIGJlc3QuXG4gICAgICAgICAgICBoaWdoZXN0ID0gMC44O1xuICAgICAgICAgICAgc2VsZWN0aW9ucy5saW5lSUQgPSBsaW5lLmlkO1xuICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCAwLjcgJiYgYXNzYXlPckxpbmUuaW5kZXhPZihsaW5lLm4pID49IDApIHtcbiAgICAgICAgICAgIC8vIEZpbmRpbmcgdGhlIExpbmUgbmFtZSB3aXRoaW4gdGhlIHN0cmluZyBpcyBvZGQsIGJ1dCBnb29kLlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuNztcbiAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC42ICYmIGxpbmUubi5pbmRleE9mKGFzc2F5T3JMaW5lKSA+PSAwKSB7XG4gICAgICAgICAgICAvLyBGaW5kaW5nIHRoZSBzdHJpbmcgd2l0aGluIHRoZSBMaW5lIG5hbWUgaXMgYWxzbyBnb29kLlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuNjtcbiAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgMC41ICYmIGN1cnJlbnRJbmRleCA9PT0gaSkge1xuICAgICAgICAgICAgLy8gQWdhaW4sIGlmIGFsbCBlbHNlIGZhaWxzLCBqdXN0IGNob29zZSB0aGUgTGluZSB0aGF0IG1hdGNoZXMgdGhlIGN1cnJlbnQgaW5kZXhcbiAgICAgICAgICAgIC8vIGluIHNvcnRlZCBvcmRlciwgaW4gYSBsb29wLlxuICAgICAgICAgICAgaGlnaGVzdCA9IDAuNTtcbiAgICAgICAgICAgIHNlbGVjdGlvbnMubGluZUlEID0gbGluZS5pZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2VsZWN0aW9ucztcbn0sXG5cblxuaGlnaGxpZ2h0ZXJGOiAoZTogSlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6IHZvaWQgPT4ge1xuICAgIHZhciBjZWxsOiBKUXVlcnksIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgIC8vIFdhbGsgdXAgdGhlIGl0ZW0gdHJlZSB1bnRpbCB3ZSBhcnJpdmUgYXQgYSB0YWJsZSBjZWxsLFxuICAgIC8vIHNvIHdlIGNhbiBnZXQgdGhlIGluZGV4IG9mIHRoZSB0YWJsZSBjZWxsIGluIHRoZSB0YWJsZS5cbiAgICBjZWxsID0gJChlLnRhcmdldCkuY2xvc2VzdCgndGQnKTtcbiAgICBpZiAoY2VsbC5sZW5ndGgpIHtcbiAgICAgICAgeCA9IHBhcnNlSW50KGNlbGwuYXR0cigneCcpLCAxMCk7XG4gICAgICAgIHkgPSBwYXJzZUludChjZWxsLmF0dHIoJ3knKSwgMTApO1xuICAgICAgICBpZiAoeCkge1xuICAgICAgICAgICAgJChFRERBVEQuVGFibGUuY29sT2JqZWN0c1t4IC0gMV0pLnRvZ2dsZUNsYXNzKCdob3ZlckxpbmVzJywgZS50eXBlID09PSAnbW91c2VvdmVyJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkpIHtcbiAgICAgICAgICAgIGNlbGwuY2xvc2VzdCgndHInKS50b2dnbGVDbGFzcygnaG92ZXJMaW5lcycsIGUudHlwZSA9PT0gJ21vdXNlb3ZlcicpO1xuICAgICAgICB9XG4gICAgfVxufSxcblxuXG5zaW5nbGVWYWx1ZURpc2FibGVyRjogKGU6IEpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOiB2b2lkID0+IHtcbiAgICB2YXIgY2VsbDogSlF1ZXJ5LCB4OiBudW1iZXIsIHk6IG51bWJlcjtcbiAgICAvLyBXYWxrIHVwIHRoZSBpdGVtIHRyZWUgdW50aWwgd2UgYXJyaXZlIGF0IGEgdGFibGUgY2VsbCxcbiAgICAvLyBzbyB3ZSBjYW4gZ2V0IHRoZSBpbmRleCBvZiB0aGUgdGFibGUgY2VsbCBpbiB0aGUgdGFibGUuXG4gICAgY2VsbCA9ICQoZS50YXJnZXQpLmNsb3Nlc3QoJ3RkJyk7XG4gICAgaWYgKGNlbGwubGVuZ3RoKSB7XG4gICAgICAgIHggPSBwYXJzZUludChjZWxsLmF0dHIoJ3gnKSwgMTApO1xuICAgICAgICB5ID0gcGFyc2VJbnQoY2VsbC5hdHRyKCd5JyksIDEwKTtcbiAgICAgICAgaWYgKHggJiYgeSAmJiB4ID4gMCAmJiB5ID4gMCkge1xuICAgICAgICAgICAgLS14O1xuICAgICAgICAgICAgLS15O1xuICAgICAgICAgICAgaWYgKEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XSkge1xuICAgICAgICAgICAgICAgIEVEREFURC5UYWJsZS5hY3RpdmVGbGFnc1t5XVt4XSA9IGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBFRERBVEQuVGFibGUuYWN0aXZlRmxhZ3NbeV1beF0gPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRUREQVRELmludGVycHJldERhdGFUYWJsZSgpO1xuICAgICAgICAgICAgRUREQVRELnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgICAgIEVEREFURC5yZWRyYXdFbmFibGVkRmxhZ01hcmtlcnMoKTtcbiAgICAgICAgfVxuICAgIH1cbn0sXG5cblxuZ2VuZXJhdGVGb3JtU3VibWlzc2lvbjogKCk6IHZvaWQgPT4ge1xuICAgIHZhciBqc29uOiBzdHJpbmc7XG4gICAgLy8gUnVuIHRocm91Z2ggdGhlIGRhdGEgc2V0cyBvbmUgbW9yZSB0aW1lLCBwdWxsaW5nIG91dCBhbnkgdmFsdWVzIGluIHRoZSBwdWxsZG93bnMgYW5kXG4gICAgLy8gYXV0b2NvbXBsZXRlIGVsZW1lbnRzIGluIFN0ZXAgNCBhbmQgZW1iZWRkaW5nIHRoZW0gaW4gdGhlaXIgcmVzcGVjdGl2ZSBkYXRhIHNldHMuXG4gICAganNvbiA9IEpTT04uc3RyaW5naWZ5KEVEREFURC5TZXRzLnBhcnNlZFNldHMpO1xuICAgICQoJyNqc29ub3V0cHV0JykudmFsKGpzb24pO1xuICAgICQoJyNqc29uZGVidWdhcmVhJykudmFsKGpzb24pO1xufSxcblxuXG4vLyBUaGlzIGhhbmRsZXMgaW5zZXJ0aW9uIG9mIGEgdGFiIGludG8gdGhlIHRleHRhcmVhLlxuLy8gTWF5IGJlIGdsaXRjaHkuXG5zdXBwcmVzc05vcm1hbFRhYjogKGU6IEpRdWVyeUtleUV2ZW50T2JqZWN0KTogYm9vbGVhbiA9PiB7XG4gICAgdmFyIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50LCB0ZXh0OiBzdHJpbmc7XG4gICAgaWYgKGUud2hpY2ggPT09IDkpIHtcbiAgICAgICAgaW5wdXQgPSA8SFRNTElucHV0RWxlbWVudD4gZS50YXJnZXQ7XG4gICAgICAgIHRleHQgPSAkKGlucHV0KS52YWwoKTtcbiAgICAgICAgLy8gc2V0IHZhbHVlIHRvIGl0c2VsZiB3aXRoIHNlbGVjdGlvbiByZXBsYWNlZCBieSBhIHRhYiBjaGFyYWN0ZXJcbiAgICAgICAgJChpbnB1dCkudmFsKFtcbiAgICAgICAgICAgIHRleHQuc3Vic3RyaW5nKDAsIGlucHV0LnNlbGVjdGlvblN0YXJ0KSxcbiAgICAgICAgICAgIHRleHQuc3Vic3RyaW5nKGlucHV0LnNlbGVjdGlvbkVuZClcbiAgICAgICAgICAgIF0uam9pbignXFx0JykpO1xuICAgICAgICAvLyBwdXQgY2FyZXQgYXQgcmlnaHQgcG9zaXRpb24gYWdhaW5cbiAgICAgICAgaW5wdXQuc2VsZWN0aW9uU3RhcnQgPSBpbnB1dC5zZWxlY3Rpb25FbmQgPSBpbnB1dC5zZWxlY3Rpb25TdGFydCArIDE7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59LFxuXG5cbnByZXBhcmVJdDogKCk6IHZvaWQgPT4ge1xuICAgIHZhciByZVByb2Nlc3NPbkNsaWNrOiBzdHJpbmdbXSwgcmVEb0xhc3RTdGVwT25DaGFuZ2U6IHN0cmluZ1tdO1xuICAgIHJlUHJvY2Vzc09uQ2xpY2sgPSBbJyNzdGRsYXlvdXQnLCAnI3RybGF5b3V0JywgJyNwcmxheW91dCcsICcjbWR2bGF5b3V0JywgJyNyYXdkYXRhZm9ybWF0cCddO1xuICAgIHJlRG9MYXN0U3RlcE9uQ2hhbmdlID0gWycjbWFzdGVyQXNzYXknLCAnI21hc3RlckxpbmUnLCAnI21hc3Rlck1Db21wJywgJyNtYXN0ZXJNVHlwZScsXG4gICAgICAgICAgICAnI21hc3Rlck1Vbml0cyddO1xuICAgICQoJyN0ZXh0RGF0YScpXG4gICAgICAgIC5vbigncGFzdGUnLCBFRERBVEQucGFzdGVkUmF3RGF0YSlcbiAgICAgICAgLm9uKCdrZXl1cCcsIEVEREFURC5wYXJzZUFuZERpc3BsYXlUZXh0KVxuICAgICAgICAub24oJ2tleWRvd24nLCBFRERBVEQuc3VwcHJlc3NOb3JtYWxUYWIpO1xuICAgICQoJyNkYXRhVGFibGVEaXYnKVxuICAgICAgICAub24oJ21vdXNlb3ZlciBtb3VzZW91dCcsICd0ZCcsIEVEREFURC5oaWdobGlnaHRlckYpXG4gICAgICAgIC5vbignZGJsY2xpY2snLCAndGQnLCBFRERBVEQuc2luZ2xlVmFsdWVEaXNhYmxlckYpO1xuICAgIC8vIFRoaXMgaXMgcmF0aGVyIGEgbG90IG9mIGNhbGxiYWNrcywgYnV0IHdlIG5lZWQgdG8gbWFrZSBzdXJlIHdlJ3JlXG4gICAgLy8gdHJhY2tpbmcgdGhlIG1pbmltdW0gbnVtYmVyIG9mIGVsZW1lbnRzIHdpdGggdGhpcyBjYWxsLCBzaW5jZSB0aGVcbiAgICAvLyBmdW5jdGlvbiBjYWxsZWQgaGFzIHN1Y2ggc3Ryb25nIGVmZmVjdHMgb24gdGhlIHJlc3Qgb2YgdGhlIHBhZ2UuXG4gICAgLy8gRm9yIGV4YW1wbGUsIGEgdXNlciBzaG91bGQgYmUgZnJlZSB0byBjaGFuZ2UgXCJtZXJnZVwiIHRvIFwicmVwbGFjZVwiIHdpdGhvdXQgaGF2aW5nXG4gICAgLy8gdGhlaXIgZWRpdHMgaW4gU3RlcCAyIGVyYXNlZC5cbiAgICAkKFwiI21hc3RlclByb3RvY29sXCIpLmNoYW5nZShFRERBVEQuY2hhbmdlZE1hc3RlclByb3RvY29sKTtcbiAgICAvLyBVc2luZyBcImNoYW5nZVwiIGZvciB0aGVzZSBiZWNhdXNlIGl0J3MgbW9yZSBlZmZpY2llbnQgQU5EIGJlY2F1c2UgaXQgd29ya3MgYXJvdW5kIGFuXG4gICAgLy8gaXJyaXRhdGluZyBDaHJvbWUgaW5jb25zaXN0ZW5jeVxuICAgIC8vIEZvciBzb21lIG9mIHRoZXNlLCBjaGFuZ2luZyB0aGVtIHNob3VsZG4ndCBhY3R1YWxseSBhZmZlY3QgcHJvY2Vzc2luZyB1bnRpbCB3ZSBpbXBsZW1lbnRcbiAgICAvLyBhbiBvdmVyd3JpdGUtY2hlY2tpbmcgZmVhdHVyZSBvciBzb21ldGhpbmcgc2ltaWxhclxuICAgICQocmVQcm9jZXNzT25DbGljay5qb2luKCcsJykpLm9uKCdjbGljaycsIEVEREFURC5xdWV1ZVByb2Nlc3NJbXBvcnRTZXR0aW5ncyk7XG4gICAgJChyZURvTGFzdFN0ZXBPbkNoYW5nZS5qb2luKCcsJykpLm9uKCdjaGFuZ2UnLCBFRERBVEQuY2hhbmdlZEFNYXN0ZXJQdWxsZG93bik7XG4gICAgLy8gZW5hYmxlIGF1dG9jb21wbGV0ZSBvbiBzdGF0aWNhbGx5IGRlZmluZWQgZmllbGRzXG4gICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKCcjbWFzdGVyTUNvbXAnLCAnTWVhc3VyZW1lbnRDb21wYXJ0bWVudCcpO1xuICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSgnI21hc3Rlck1UeXBlJywgJ0dlbmVyaWNPck1ldGFib2xpdGUnLCBFREREYXRhLk1ldGFib2xpdGVUeXBlcyB8fCB7fSk7XG4gICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKCcjbWFzdGVyTVVuaXRzJywgJ01lYXN1cmVtZW50VW5pdCcpO1xuICAgICQoJyNpZ25vcmVHYXBzJykuY2xpY2soRUREQVRELmNsaWNrZWRPbklnbm9yZURhdGFHYXBzKTtcbiAgICAkKCcjdHJhbnNwb3NlJykuY2xpY2soRUREQVRELmNsaWNrZWRPblRyYW5zcG9zZSk7XG4gICAgRUREQVRELmNoYW5nZWRNYXN0ZXJQcm90b2NvbCgpOyAvLyAgU2luY2UgdGhlIGluaXRpYWwgbWFzdGVyUHJvdG9jb2wgdmFsdWUgaXMgemVybywgd2UgbmVlZCB0byBtYW51YWxseSB0cmlnZ2VyIHRoaXM6XG4gICAgRUREQVRELnF1ZXVlUHJvY2Vzc0ltcG9ydFNldHRpbmdzKCk7XG59LFxuXG5cbmRpc2Nsb3NlOiAoKTogYm9vbGVhbiA9PiB7XG4gICAgJCh0aGlzKS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgcmV0dXJuIGZhbHNlO1xufSxcblxuXG5wcm9jZXNzX3Jlc3VsdDogKHJlc3VsdCk6IHZvaWQgPT4ge1xuICAgIGlmIChyZXN1bHQuZmlsZV90eXBlID09IFwieGxzeFwiKSB7XG4gICAgICAgIHZhciB3cyA9IHJlc3VsdC5maWxlX2RhdGFbXCJ3b3Jrc2hlZXRzXCJdWzBdO1xuICAgICAgICBjb25zb2xlLmxvZyh3cyk7XG4gICAgICAgIHZhciB0YWJsZSA9IHdzWzBdO1xuICAgICAgICB2YXIgY3N2ID0gW107XG4gICAgICAgIGlmICh0YWJsZS5oZWFkZXJzKSB7XG4gICAgICAgICAgICBjc3YucHVzaCh0YWJsZS5oZWFkZXJzLmpvaW4oKSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS52YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNzdi5wdXNoKHRhYmxlLnZhbHVlc1tpXS5qb2luKCkpO1xuICAgICAgICB9XG4gICAgICAgICQoXCIjcmF3ZGF0YWZvcm1hdHBcIikudmFsKFwiY3N2XCIpO1xuICAgICAgICAkKFwiI3RleHREYXRhXCIpLnRleHQoY3N2LmpvaW4oXCJcXG5cIikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgICQoXCIjcmF3ZGF0YWZvcm1hdHBcIikudmFsKHJlc3VsdC5maWxlX3R5cGUpO1xuICAgICAgICAkKFwiI3RleHREYXRhXCIpLnRleHQocmVzdWx0LmZpbGVfZGF0YSk7XG4gICAgfVxuICAgIEVEREFURC5wYXJzZUFuZERpc3BsYXlUZXh0KCk7IC8vIEFzc2F5VGFibGVEYXRhLnRzXG59XG5cbn07XG5cblxuJCh3aW5kb3cpLmxvYWQoZnVuY3Rpb24oKSB7XG4gICAgdmFyIHVybCA9IFwiL3V0aWxpdGllcy9wYXJzZWZpbGVcIjtcbiAgICB2YXIgYXRkYXRhX3VybCA9IFwiL3N0dWR5L1wiICsgRURERGF0YS5jdXJyZW50U3R1ZHlJRCArIFwiL2Fzc2F5ZGF0YVwiO1xuXG4gICAgVXRsLkZpbGVEcm9wWm9uZS5zZXR1cChcInRleHREYXRhXCIsIHVybCwgRUREQVRELnByb2Nlc3NfcmVzdWx0LCBmYWxzZSk7XG4gICAgJCgnLmRpc2Nsb3NlJykuZmluZCgnYS5kaXNjbG9zZUxpbmsnKS5vbignY2xpY2snLCBFRERBVEQuZGlzY2xvc2UpO1xuICAgIC8vIFBvcHVsYXRlIEFURGF0YSBhbmQgRURERGF0YSBvYmplY3RzIHZpYSBBSkFYIGNhbGxzXG4gICAgalF1ZXJ5LmFqYXgoYXRkYXRhX3VybCwge1xuICAgICAgICBcInN1Y2Nlc3NcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgQVREYXRhID0gZGF0YS5BVERhdGE7XG4gICAgICAgICAgICAkLmV4dGVuZChFREREYXRhLCBkYXRhLkVERERhdGEpO1xuICAgICAgICAgICAgRUREQVRELnByZXBhcmVJdCgpO1xuICAgICAgICB9XG4gICAgfSkuZmFpbChmdW5jdGlvbih4LCBzLCBlKSB7XG4gICAgICAgIGFsZXJ0KHMpO1xuICAgIH0pO1xufSk7XG4iXX0=