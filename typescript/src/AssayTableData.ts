/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />

declare var ATData:any; // Setup by the server.
declare var EDDATDGraphing:any;
declare var EDD_auto:any;

// Type name for the grid of values pasted in
interface RawInput extends Array<string[]> {}
// type for the stats generated from parsing input text
interface RawInputStat {
    input: RawInput;
    columns: number;
}
// type for the options in row pulldowns
// TODO update to use unions when migrating to Typescript 1.4+
interface RowPulldownOption extends Array<any> { // Array<string|number|RowPulldownOption[]>
    0: string;
    1: any; // number | RowPulldownOption[]
}

var EDDATD:any;

EDDATD = {

// The Protocol for which we will be importing data.
masterProtocol:0,
// The main mode we are interpreting data in.
// Valid values sofar are "std", "mdv", "tr", "pr".
interpretationMode:"std",
processImportSettingsTimerID:0,

// Used to parse the Step 2 data into a null-padded rectangular grid
Grid:{
    data:[],
    rowMarkers:[],
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
Table:{
    rowLabelCells:[],
    colCheckboxCells:[],
    colObjects:[],
    dataCells:[],

    // We keep a single flag for each data point [y,x]
    // as well as two linear sets of flags for enabling or disabling
    // entire columns/rows.
    activeColFlags:[],
    activeRowFlags:[],
    activeFlags:[],

    // Arrays for the pulldown menus on the left side of the table.
    // These pulldowns are used to specify the data type - or types - contained in each
    // row of the pasted data.
    pulldownObjects:[],
    pulldownSettings:[],
    // We also keep a set of flags to track whether a pulldown was changed by a user and
    // will not be recalculated.
    pulldownUserChangedFlags:[]
},

graphEnabled:1,
graphRefreshTimerID:0,

// Data structures pulled from the grid and composed into sets suitable for handing to
// the EDD server
Sets:{
    parsedSets:[],
    uniqueLineAssayNames:[],
    uniqueMeasurementNames:[],
    uniqueMetadataNames:[],
    // A flag to indicate whether we have seen any timestamps specified in the import data
    seenAnyTimestamps: false
},

// Storage area for disambiguation-related UI widgets and information
Disam:{
    // These objects hold string keys that correspond to unique names found during parsing.
    // The string keys point to existing autocomplete objects created specifically for
    // those strings. As the disambiguation section is destroyed and remade, any selections
    // the user has already set will persevere.
    // For disambuguating Assays/Lines
    assayLineObjSets:{},
    currentlyVisibleAssayLineObjSets:[],
    // For disambuguating measurement types
    measurementObjSets:{},
    currentlyVisibleMeasurementObjSets:[],
    // For disambuguating metadata
    metadataObjSets:{},
    // To give unique ID values to each autocomplete entity we create
    autoCompUID:0
},

AutoCache: {
    comp: {},
    meta: {},
    unit: {},
    metabolite: {}
},


changedMasterProtocol: ():void => {
    var protocolIn:JQuery, assayIn:JQuery, currentAssays:number[];
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
    currentAssays.forEach((id:number):void => {
        var assay = EDDData.Assays[id],
            line = EDDData.Lines[assay.lid],
            protocol = EDDData.Protocols[assay.pid];
        $('<option>').appendTo(assayIn).val('' + id).text([
            line.name, protocol.name, assay.name ].join('-'));
    });
    if ($('#masterLineSpan').removeClass('off').length > 0) {
        EDDATD.queueProcessImportSettings();
    }
},


queueProcessImportSettings: ():void => {
    // Start a timer to wait before calling the routine that reparses the import settings.
    // This way we're calling the reparse just once, even when we get multiple cascaded
    // events that require it.
    if (EDDATD.processImportSettingsTimerID) {
        clearTimeout(EDDATD.processImportSettingsTimerID);
    }
    EDDATD.processImportSettingsTimerID = setTimeout(EDDATD.processImportSettings.bind(EDDATD), 5);
},


processImportSettings: ():void => {
    var stdLayout:JQuery, trLayout:JQuery, prLayout:JQuery, mdvLayout:JQuery, ignoreGaps:JQuery,
        transpose:JQuery, graph:JQuery, rawFormat:JQuery;
    stdLayout = $('#stdlayout');
    trLayout = $('#trlayout');
    prLayout = $('#prlayout');
    mdvLayout = $('#mdvlayout');
    ignoreGaps = $('#ignoreGaps');
    transpose = $('#transpose');
    graph = $('#graphDiv');
    rawFormat = $('#rawdataformatp');
    // all need to exist, or page is broken
    if (![ stdLayout, trLayout, prLayout, mdvLayout, ignoreGaps, transpose, graph, rawFormat
            ].every((item):boolean => item.length !== 0)) {
        return;
    }

    if (stdLayout.prop('checked')) { //  Standard interpretation mode
        EDDATD.interpretationMode = 'std';
        graph.removeClass('off');  // By default we will attempt to show a graph
        EDDATD.graphEnabled = 1;
    } else if (trLayout.prop('checked')) {   //  Transcriptomics mode
        EDDATD.interpretationMode = 'tr';
        graph.addClass('off');
        EDDATD.graphEnabled = 0;
    } else if (prLayout.prop('checked')) {   //  Proteomics mode
        EDDATD.interpretationMode = 'pr';
        graph.addClass('off');
        EDDATD.graphEnabled = 0;
    } else if (mdvLayout.prop('checked')) {  // JBEI Mass Distribution Vector format
        EDDATD.interpretationMode = 'mdv';
        graph.addClass('off');
        EDDATD.graphEnabled = 0;
        // We neither ignore gaps, nor transpose, for MDV documents
        ignoreGaps.prop('checked', false);
        transpose.prop('checked', false);
        // JBEI MDV format documents are always pasted in from Excel, so they're always tab-separated
        rawFormat.val('tab');
        EDDATD.Table.pulldownSettings = [1, 5]; // A default set of pulldown settings for this mode
    } else {
        // If none of them are checked - WTF?  Don't parse or change anything.
        return;
    }
    EDDATD.Grid.ignoreDataGaps = ignoreGaps.prop('checked');
    EDDATD.Grid.transpose = transpose.prop('checked');
    EDDATD.parseAndDisplayText();
},


// This gets called when there is a paste event.
pastedRawData: ():void => {
    // We do this using a timeout so the rest of the paste events fire, and get the pasted result.
    window.setTimeout(():void => {
        if (EDDATD.interpretationMode !== "mdv") {
            var text:string = $('#textData').val() || '', test:boolean;
            test = text.split('\t').length >= text.split(',').length;
            $('#rawdataformatp').val(test ? 'tab' : 'csv');
        }
    }, 1);
},


parseRawInput: (delimiter: string, mode: string):RawInputStat => {
    var rawText:string, longestRow:number, rows:RawInput, multiColumn:boolean;
    rawText = $('#textData').val();
    rows = [];
    // find the highest number of columns in a row
    longestRow = rawText.split(/[ \r]*\n/).reduce((prev:number, rawRow: string):number => {
        var row:string[];
        if (rawRow !== '') {
            row = rawRow.split(delimiter);
            rows.push(row);
            return Math.max(prev, row.length);
        }
        return prev;
    }, 0);
    // pad out rows so it is rectangular
    if (mode === 'std' || mode === 'tr' || mode === 'pr') {
        rows.forEach((row:string[]):void => {
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


inferTransposeSetting: (rows: RawInput): void => {
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
    $('#transpose').prop('checked', setTranspose);
    EDDATD.Grid.transpose = setTranspose;
},


inferGapsSetting: (): void => {
    // Count the number of blank values at the end of each column
    // Count the number of blank values in between non-blank data
    // If more than three times as many as at the end, default to ignore gaps
    var intra: number = 0, extra: number = 0;
    EDDATD.Grid.data.forEach((row: string[]): void => {
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
    EDDATD.Grid.ignoreDataGaps = extra > (intra * 3);
    $('#ignoreGaps').prop('checked', EDDATD.Grid.ignoreDataGaps);
},


inferActiveFlags: (): void => {
    // An important thing to note here is that this data is in [y][x] format -
    // that is, it goes by row, then by column, when referencing.
    // This matches Grid.data and Table.dataCells.
    var x: number, y: number;
    (EDDATD.Grid.data[0] || []).forEach((_, x: number): void => {
        if (EDDATD.Table.activeColFlags[x] === undefined) {
            EDDATD.Table.activeColFlags[x] = true;
        }
    });
    EDDATD.Grid.data.forEach((row: string[], y: number): void => {
        if (EDDATD.Table.activeRowFlags[y] === undefined) {
            EDDATD.Table.activeRowFlags[y] = true;
        }
        EDDATD.Table.activeFlags[y] = EDDATD.Table.activeFlags[y] || [];
        row.forEach((_, x: number) => {
            if (EDDATD.Table.activeFlags[y][x] === undefined) {
                EDDATD.Table.activeFlags[y][x] = true;
            }
        });
    });
},


processMdv: (input: RawInput): void => {
    var rows: RawInput, colLabels: string[], compounds: any, orderedComp: string[];
    rows = input.slice(0); // copy
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
        indices = $.map(value.originalRows, (_, index: string): number => parseInt(index, 10));
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
    EDDATD.Grid.rowMarkers = ['Assay'];
    // The first row is our label collection
    EDDATD.Grid.data[0] = colLabels.slice(0);
    // push the rest of the rows generated from ordered list of compounds
    Array.prototype.push.apply(
        EDDATD.Grid.data,
        orderedComp.map((name: string): string[] => {
            var compound: any, row: string[], colLookup: any;
            EDDATD.Grid.rowMarkers.push(name);
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
},


// A recursive function to populate a pulldown with optional optiongroups,
// and a default selection
populatePulldown: (select: JQuery, options: RowPulldownOption[], value: number): void => {
    options.forEach((option: RowPulldownOption): void => {
        if (typeof option[1] === 'number') {
            $('<option>').text(option[0]).val(option[1])
                .prop('selected', option[1] === value)
                .appendTo(select);
        } else {
            EDDATD.populatePulldown(
                $('<optgroup>').attr('label', option[0]).appendTo(select),
                option[1], value);
        }
    });
},


constructDataTable: (mode:string):void => {
    var controlCols: string[], pulldownOptions: any[],
        table: HTMLTableElement, colgroup:JQuery, body: HTMLTableElement,
        row: HTMLTableRowElement;

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
    } else if (mode === 'pr') {
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
    } else {
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
    table = <HTMLTableElement> $('<table>').attr('cellspacing', '0')
        .appendTo($('#dataTableDiv').empty())
        .on('click', '[name=enableColumn]', (ev: JQueryMouseEventObject) => {
            EDDATD.toggleTableColumn(ev.target);
        }).on('click', '[name=enableRow]', (ev: JQueryMouseEventObject) => {
            EDDATD.toggleTableRow(ev.target);
        }).on('change', '.pulldownCell > select', (ev: JQueryInputEventObject) => {
            var targ: JQuery = $(ev.target);
            EDDATD.changedRowDataTypePulldown(
                parseInt(targ.attr('i'), 10), parseInt(targ.val(), 10));
        })[0];
    // One of the objects here will be a column group, with col objects in it.
    // This is an interesting twist on DOM behavior that you should probably google.
    colgroup = $('<colgroup>').appendTo(table);
    body = <HTMLTableElement> $('<tbody>').appendTo(table)[0];
    // Start with three columns, for the checkboxes, pulldowns, and labels.
    // (These will not be tracked in Table.colObjects.)
    controlCols.forEach(():void => {
        $('<col>').appendTo(colgroup);
    });
    // add col elements for each data column
    (EDDATD.Grid.data[0] || []).forEach((): void => {
        EDDATD.Table.colObjects.push($('<col>').appendTo(colgroup)[0]);
    });
    // First row: spacer cells, followed by checkbox cells for each data column
    row = <HTMLTableRowElement> body.insertRow();
    // spacer cells have x and y set to 0 to remove from highlight grid
    controlCols.forEach((): void => {
        $(row.insertCell()).attr({ 'x': '0', 'y': 0 });
    });
    (EDDATD.Grid.data[0] || []).forEach((_, i: number): void => {
        var cell: JQuery, box: JQuery;
        cell = $(row.insertCell()).attr({ 'id': 'colCBCell' + i, 'x': 1 + i, 'y': 0 })
            .addClass('checkBoxCell');
        box = $('<input type="checkbox"/>').appendTo(cell)
            .val(i.toString())
            .attr({ 'id': 'enableColumn' + i, 'name': 'enableColumn' })
            .prop('checked', EDDATD.Table.activeColFlags[i]);
        EDDATD.Table.colCheckboxCells.push(cell[0]);
    });
    EDDATD.Table.pulldownObjects = [];  // We don't want any lingering old objects in this
    // The rest of the rows: A pulldown, a checkbox, a row label, and a row of data.
    EDDATD.Grid.data.forEach((values: string[], i: number): void => {
        var cell: JQuery;
        row = <HTMLTableRowElement> body.insertRow();
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
                || EDDATD.Table.pulldownSettings.slice(-1)[0] || 0
        EDDATD.populatePulldown(
            cell = $('<select>')
                .attr({ 'id': 'row' + i + 'type', 'name': 'row' + i + 'type', 'i': i })
                .appendTo(cell),
            pulldownOptions,
            EDDATD.Table.pulldownSettings[i]
        );
        EDDATD.Table.pulldownObjects.push(cell[0]);
        // label cell
        cell = $(row.insertCell()).attr({ 'id': 'rowMCell' + i, 'x': 0, 'y': i + 1 });
        $('<div>').text(EDDATD.Grid.rowMarkers[i]).appendTo(cell);
        EDDATD.Table.rowLabelCells.push(cell[0]);
        // the table data itself
        EDDATD.Table.dataCells[i] = [];
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
            EDDATD.Table.dataCells[i].push(cell[0]);
        });
    });
    EDDATD.applyTableDataTypeStyling();
},


parseAndDisplayText: (): void => {
    var mode:string, delimiter:string, rawFormat:JQuery, input:RawInputStat;
    mode = EDDATD.interpretationMode;
    delimiter = '\t';
    EDDATD.Grid.data = [];
    EDDATD.Grid.rowMarkers = [];
    rawFormat = $('#rawdataformatp');
    if (rawFormat.length === 0) {
        console.log("Can't find data format pulldown")
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
            EDDATD.Grid.data = (input.input[0] || []).map((_, i: number): string[] => {
                return input.input.map((row: string[]): string => row[i] || '');
            });
        } else {
            EDDATD.Grid.rowMarkers = [];
            EDDATD.Grid.data = (input.input || []).map((row: string[]): string[] => {
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
        EDDATD.Grid.rowMarkers = EDDATD.Grid.rowMarkers.map((value: string) => value || '?');
        // Attempt to auto-set any type pulldowns that haven't been deliberately set by the user
        EDDATD.Grid.rowMarkers.forEach((value: string, i: number): void => {
            var type: any;
            if (!EDDATD.Table.pulldownUserChangedFlags[i]) {
                type = EDDATD.figureOutThisRowsDataType(value, EDDATD.Grid.data[i] || []);
                EDDATD.Table.pulldownSettings[i] = type;
            }
        });
    // We meed at least 2 rows and columns for MDV format to make any sense
    } else if ((mode === "mdv") && (input.input.length > 1) && (input.columns > 1)) {
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
applyTableDataTypeStyling: (): void => {
    EDDATD.Grid.data.forEach((row: string[], index: number): void => {
        var pulldown: number, hlLabel: boolean, hlRow: boolean;
        pulldown = EDDATD.Table.pulldownSettings[index] || 0;
        hlLabel = hlRow = false;
        if (pulldown === 1 || pulldown === 2) {
            hlRow = true;
        } else if (3 <= pulldown && pulldown <= 5) {
            hlLabel = true;
        }
        $(EDDATD.Table.rowLabelCells[index]).toggleClass('dataTypeCell', hlLabel);
        row.forEach((_, col: number):void => {
            $(EDDATD.Table.dataCells[index][col]).toggleClass('dataTypeCell', hlRow);
        });
    });
},


// We call this when any of the 'master' pulldowns are changed in Step 4.
// Such changes may affect the available contents of some of the pulldowns in the step.
changedAMasterPulldown: (): void => {
    // hide master line dropdown if master assay dropdown is set to new
    $('#masterLineSpan').toggleClass('off', $('#masterAssay').val() === 'new');
    EDDATD.remakeInfoTable();
},


clickedOnIgnoreDataGaps: (): void => {
    EDDATD.Grid.userClickedOnIgnoreDataGaps = true;
    EDDATD.queueProcessImportSettings();    // This will take care of reading the status of the checkbox
},


clickedOnTranspose: (): void => {
    EDDATD.Grid.userClickedOnTranspose = true;
    EDDATD.queueProcessImportSettings();
},


changedRowDataTypePulldown: (index: number, value: number): void => {
    var selected: number;
    // The value does not necessarily match the selectedIndex.
    selected = EDDATD.Table.pulldownObjects[index].selectedIndex;
    EDDATD.Table.pulldownSettings[index] = value;
    EDDATD.Table.pulldownUserChangedFlags[index] = true;
    if ((value >= 3 && value <= 5) || value === 12) {
        // "Timestamp", "Metadata", or other single-table-cell types
        // Set all the rest of the pulldowns to this,
        // based on the assumption that the first is followed by many others
        EDDATD.Table.pulldownObjects.slice(index + 1).every(
            (pulldown: HTMLSelectElement): boolean => {
                var select: JQuery, i: number;
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
        EDDATD.Grid.data.forEach((_, i: number): void => {
            var c: number = EDDATD.Table.pulldownSettings[i];
            if (value === 5) {
                if (c === 3 || c === 4) {
                    EDDATD.Table.pulldownObjects[i].selectedIndex = 0;
                    EDDATD.Table.pulldownSettings[i] = 0;
                } else if (c === 2) { // Can't allow "Measurement Types" setting either
                    EDDATD.Table.pulldownObjects[i].selectedIndex = 1;
                    EDDATD.Table.pulldownSettings[i] = 1;
                }
            } else if ((value === 3 || value === 4) && c === 5) {
                EDDATD.Table.pulldownObjects[i].selectedIndex = 0;
                EDDATD.Table.pulldownSettings[i] = 0;
            }
        });
        // It would seem logical to require a similar check for "Protein Name", ID 12, but in practice
        // the user is disallowed from selecting any of the other single-table-cell types when the
        // page is in Proteomics mode.  So the check is redundant.
    }
    EDDATD.applyTableDataTypeStyling();
    EDDATD.interpretDataTable();
    EDDATD.queueGraphRemake();
    // Resetting a disabled row may change the number of rows listed in the Info table.
    EDDATD.remakeInfoTable();
},


figureOutThisRowsDataType: (label: string, row: string[]) => {
    var blank: number, strings: number, condensed: string[];
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
    condensed = row.filter((v: string): boolean => !!v);
    blank = row.length - condensed.length;
    condensed.forEach((v: string): void => {
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


redrawIgnoredValueMarkers: (): void => {
    EDDATD.Table.dataCells.forEach((row: HTMLElement[]): void => {
        row.forEach((cell: HTMLElement): void => {
            var toggle: boolean = !EDDATD.Grid.ignoreDataGaps && !!cell.getAttribute('isblank');
            $(cell).toggleClass('ignoredLine', toggle);
        });
    });
},


toggleTableRow: (box: HTMLElement): void => {
    var value: number, input: JQuery;
    input = $(box);
    value = parseInt(input.val(), 10);
    EDDATD.Table.activeRowFlags[value] = input.prop('checked');
    EDDATD.interpretDataTable();
    EDDATD.queueGraphRemake();
    EDDATD.redrawEnabledFlagMarkers();
    // Resetting a disabled row may change the number of rows listed in the Info table.
    EDDATD.remakeInfoTable();
},


toggleTableColumn: (box: HTMLElement): void => {
    var value: number, input: JQuery;
    input = $(box);
    value = parseInt(input.val(), 10);
    EDDATD.Table.activeColFlags[value] = input.prop('checked');
    EDDATD.interpretDataTable();
    EDDATD.queueGraphRemake();
    EDDATD.redrawEnabledFlagMarkers();
    // Resetting a disabled column may change the rows listed in the Info table.
    EDDATD.remakeInfoTable();
},


resetEnabledFlagMarkers: (): void => {
    EDDATD.Grid.data.forEach((row: string[], y: number): void => {
        EDDATD.Table.activeFlags[y] = EDDATD.Table.activeFlags[y] || [];
        row.forEach((_, x: number): void => {
            EDDATD.Table.activeFlags[y][x] = true;
        });
        EDDATD.Table.activeRowFlags[y] = true;
    });
    (EDDATD.Grid.data[0] || []).forEach((_, x: number): void => {
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


redrawEnabledFlagMarkers: (): void => {
    EDDATD.Table.dataCells.forEach((row: HTMLElement[], y: number): void => {
        var toggle: boolean = !EDDATD.Table.activeRowFlags[y];
        $(EDDATD.Table.rowLabelCells[y]).toggleClass('disabledLine', toggle);
        row.forEach((cell: HTMLElement, x: number): void => {
            toggle = !EDDATD.Table.activeFlags[y][x]
                || !EDDATD.Table.activeColFlags[x]
                || !EDDATD.Table.activeRowFlags[y];
            $(cell).toggleClass('disabledLine', toggle);
        });
    });
    EDDATD.Table.colCheckboxCells.forEach((box: HTMLElement, x: number): void => {
        var toggle: boolean = !EDDATD.Table.activeColFlags[x];
        $(box).toggleClass('disabledLine', toggle);
    });
},


interpretDataTableRows: (): [boolean, number] => {
    var single: number = 0, nonSingle: number = 0, earliestName: number;
    // Look for the presence of "single measurement type" rows, and rows of all other single-item types
    EDDATD.Grid.data.forEach((_, y: number): void => {
        var pulldown: number;
        if (EDDATD.Table.activeRowFlags[y]) {
            pulldown = EDDATD.Table.pulldownSettings[y];
            if (pulldown === 5 || pulldown === 12) {
                single++; // Single Measurement Name or Single Protein Name
            } else if (pulldown === 4 || pulldown === 3) {
                nonSingle++;
            } else if (pulldown === 1 && earliestName === undefined) {
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


interpretDataTable: (): void => {
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
        EDDATD.Table.colObjects.forEach((_, c: number): void => {
            var set: any, uniqueTimes: number[], times: any, foundMeta: boolean;
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
            EDDATD.Grid.data.forEach((row: string[], r: number): void => {
                var pulldown: number, label: string, value: string, timestamp: number;
                if (!EDDATD.Table.activeRowFlags[r] || !EDDATD.Table.activeFlags[r][c]) {
                    return;
                }
                pulldown = EDDATD.Table.pulldownSettings[r];
                label = EDDATD.Grid.rowMarkers[r] || '';
                value = row[c] || '';
                if (!pulldown) {
                    return;
                } else if (pulldown === 11) {  // Transcriptomics: RPKM values
                    value = value.replace(/,/g, '');
                    if (value) {
                        set.singleData = value;
                    }
                    return;
                } else if (pulldown === 10) {  // Transcriptomics: Gene names
                    if (value) {
                        set.name = value;
                        set.measurementType = value;
                    }
                    return;
                } else if (pulldown === 3) {   // Timestamps
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
                } else if (label === '' || value === '') {
                    // Now that we've dealt with timestamps, we proceed on to other data types.
                    // All the other data types do not accept a blank value, so we weed them out now.
                    return;
                } else if (pulldown === 1) {   // Assay/Line Names
                    // If haven't seen value before, increment and store uniqueness index
                    if (!seenAssayLineNames[value]) {
                        seenAssayLineNames[value] = ++assayLineNamesCount;
                        EDDATD.Sets.uniqueLineAssayNames.push(value);
                    }
                    set.assay = seenAssayLineNames[value];
                    set.assayName = value;
                    return;
                } else if (pulldown === 2) {   // Metabolite Names
                    // If haven't seen value before, increment and store uniqueness index
                    if (!seenMeasurementNames[value]) {
                        seenMeasurementNames[value] = ++measurementNamesCount;
                        EDDATD.Sets.uniqueMeasurementNames.push(value);
                    }
                    set.measurementType = seenMeasurementNames[value];
                    return;
                } else if (pulldown === 4) {   // Metadata
                    if (!seenMetadataNames[label]) {
                        seenMetadataNames[label] = ++metadataNamesCount;
                        EDDATD.Sets.uniqueMetadataNames.push(label);
                    }
                    set.metadata[seenMetadataNames[label]] = value;
                    foundMeta = true;
                }
            });
            uniqueTimes.sort((a, b) => a - b).forEach((time: number): void => {
                set.data.push([time, times[time]]);
            });
            // only save if accumulated some data or metadata
            if (uniqueTimes.length || foundMeta || set.singleData !== null) {
                EDDATD.Sets.parsedSets.push(set);
            }
        });
    // The alternate method: A "set" for every cell of the table, with the timestamp
    // to be determined later.
    } else {
        EDDATD.Table.colObjects.forEach((_, c: number): void => {
            var cellValue: string, set: any;
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
                EDDATD.Grid.data.forEach((row: string[], r: number): void => {
                    var pulldown: number, label: string, value: string, timestamp: number;
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
                    } else if (pulldown === 12) {
                        set.name = label;
                        set.measurementType = label;
                    }
                    EDDATD.Sets.parsedSets.push(set);
                });
            }
        });
    }
},


queueGraphRemake: (): void => {
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


remakeGraphArea: (): void => {
    EDDATD.graphRefreshTimerID = 0; 
    if (!EDDATDGraphing || !EDDATD.graphEnabled) {
        return;
    }
    EDDATDGraphing.clearAllSets();
    // If we're not in this mode, drawing a graph is nonsensical.
    if (EDDATD.interpretationMode === "std") {
        EDDATD.Sets.parsedSets.forEach((set) => EDDATDGraphing.addNewSet(set));
    }
    EDDATDGraphing.drawSets();
},


resetInfoTableFields: (): void => {
    // TOTALLY STUBBED
},


remakeInfoTableAssayLineSection: (masterP: number): void => {
    var table: HTMLTableElement, body: HTMLTableElement;
    if (EDDATD.Sets.uniqueLineAssayNames.length === 0) {
        $('#masterAssayLineDiv').removeClass('off');
    } else {
        // Otherwise, put together a disambiguation section for Assays/Lines
        // Keep a separate set of correlations between string and pulldowns for each
        // Protocol, since same string can match different Assays, and the pulldowns
        // will have different content, in each Protocol.
        EDDATD.Disam.assayLineObjSets[masterP] = {};
        EDDATD.Disam.currentlyVisibleAssayLineObjSets = [];
        table = <HTMLTableElement> $('<table>')
            .attr({ 'id': 'disambiguateAssaysTable', 'cellspacing': 0 })
            .appendTo($('#disambiguateLinesAssaysSection').removeClass('off'))
            .on('change', 'select', (ev: JQueryInputEventObject): void => {
                EDDATD.userChangedAssayLineDisam(ev.target);
            })[0];
        body = <HTMLTableElement> $('<tbody>').appendTo(table)[0];
        EDDATD.Sets.uniqueLineAssayNames.forEach((name: string, i: number): void => {
            var disam: any, row: HTMLTableRowElement, defaultSel: any,
                cell: JQuery, aSelect: JQuery, lSelect: JQuery;
            disam = EDDATD.Disam.assayLineObjSets[masterP][name];
            if (!disam) {
                disam = {};
                defaultSel = EDDATD.disambiguateAnAssayOrLine(name, i);
                // First make a table row, and save a reference to it
                disam.rowObj = row = <HTMLTableRowElement> body.insertRow();
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
                (ATData.existingAssays[masterP] || []).forEach((id: number): void => {
                    var assay: AssayRecord, line: LineRecord, protocol: any;
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
                (ATData.existingLines || []).forEach((line: any) => {
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


remakeInfoTableMeasurementSection: (): void => {
    var table: HTMLTableElement, body: HTMLTableElement, row: HTMLTableRowElement;
    // put together a disambiguation section for measurement types
    table = <HTMLTableElement> $('<table>')
        .attr({ 'id': 'disambiguateMeasurementsTable', 'cellspacing': 0 })
        .appendTo($('#disambiguateMeasurementsSection').removeClass('off'))
        .on('change', 'input[type=hidden]', (ev: JQueryInputEventObject): void => {
            // only watch for changes on the hidden portion, let autocomplete work
            EDDATD.userChangedMeasurementDisam(ev.target);
        })[0];
    body = <HTMLTableElement> $('<tbody>').appendTo(table)[0];
    // Headers for the table
    row = <HTMLTableRowElement> body.insertRow();
    $('<th>').attr({ 'colspan': 2 }).css('text-align', 'right').text('Compartment').appendTo(row);
    $('<th>').text('Type').appendTo(row);
    $('<th>').text(EDDATD.interpretationMode === 'std' ? 'Units' : '').appendTo(row);
    // Done with headers row
    EDDATD.Disam.currentlyVisibleMeasurementObjSets = [];   // For use in cascading user settings
    EDDATD.Sets.uniqueMeasurementNames.forEach((name: string, i: number): void => {
        var disam: any;
        disam = EDDATD.Disam.measurementObjSets[name];
        if (disam && disam.rowObj) {
            $(disam.rowObj).appendTo(body);
        } else {
            disam = {};
            disam.rowObj = row = <HTMLTableRowElement> body.insertRow();
            $('<div>').text(name).appendTo(row.insertCell());
            ['compObj', 'typeObj', 'unitsObj'].forEach((auto: string): void => {
                var cell: JQuery = $(row.insertCell()).addClass('disamDataCell');
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


remakeInfoTableMetadataSection: (): void => {
    var table: HTMLTableElement, body: HTMLTableElement, row: HTMLTableRowElement;
    // put together a disambiguation section for metadata
    table = <HTMLTableElement> $('<table>')
        .attr({ 'id': 'disambiguateMetadataTable', 'cellspacing': 0 })
        .appendTo($('#disambiguateMetadataSection').removeClass('off'))
        .on('change', 'input', (ev: JQueryInputEventObject): void => {
            // should there be event handling here ?
        })[0];
    body = <HTMLTableElement> $('<tbody>').appendTo(table)[0];
    EDDATD.Sets.uniqueMetadataNames.forEach((name: string, i: number): void => {
        var disam: any;
        disam = EDDATD.Disam.metadataObjSets[name];
        if (disam && disam.rowObj) {
            $(disam.rowObj).appendTo(body);
        } else {
            disam = {};
            disam.rowObj = row = <HTMLTableRowElement> body.insertRow();
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
remakeInfoTable: (): void => {
    var masterP = EDDATD.masterProtocol;    // Shout-outs to a mid-grade rapper
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
        // no-op
    } else if (EDDATD.Sets.uniqueMeasurementNames.length === 0 && EDDATD.Sets.seenAnyTimestamps) {
        // no measurements for disambiguation, have timestamp data => ask the user to select one
        $('#masterMTypeDiv').removeClass('off');
    } else {
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
userChangedAssayLineDisam: (assayEl: HTMLElement): boolean => {
    var changed: JQuery, v: number;
    changed = $(assayEl).data('setByUser', true);
    // The span with the corresponding Line pulldown is always right next to the Assay pulldown
    changed.next().toggleClass('off', changed.val() !== 'new');
    if (changed.val() !== 'new') {
        // stop here for anything other than 'new'; only 'new' cascades to following pulldowns
        return false;
    }
    v = changed.data('visibleIndex') || 0;
    EDDATD.Disam.currentlyVisibleAssayLineObjSets.slice(v).forEach((obj: any): void => {
        var select: JQuery = $(obj.assayObj);
        if (select.data('setByUser')) {
            return;
        }
        // set dropdown to 'new' and reveal the line pulldown
        select.val('new').next().removeClass('off');
    });
    return false;
},


userChangedMeasurementDisam: (element: HTMLElement): void => {
    var hidden: JQuery, auto: JQuery, type: string, i: number;
    hidden = $(element);
    auto = hidden.prev();
    type = auto.data('type');
    if (type === 'compObj' || type === 'unitsObj') {
        i = auto.data('setByUser', true).data('visibleIndex') || 0;
        EDDATD.Disam.currentlyVisibleMeasurementObjSets.slice(i).some((obj: any): boolean => {
            var following: JQuery = $(obj[type]);
            if (following.length === 0 || following.data('setByUser')) {
                return true;  // break; for the Array.some() loop
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
checkAllMeasurementCompartmentDisam: (): void => {
    var allSet: boolean;
    allSet = EDDATD.Disam.currentlyVisibleMeasurementObjSets.every((obj: any): boolean => {
        var hidden: JQuery = obj.compObj.next();
        if (obj.compObj.data('setByUser') || (hidden.val() && hidden.val() !== '0')) {
            return true;
        }
        return false;
    });
    $('#noCompartmentWarning').toggleClass('off', EDDATD.interpretationMode !== 'mdv' && allSet);
},


disambiguateAnAssayOrLine: (assayOrLine: string, currentIndex: number): any => {
    var selections: any, highest: number, assays: number[];
    selections = {
        lineID:0,
        assayID:0
    };
    highest = 0;
    // ATData.existingAssays is type {[index: string]: number[]}
    assays = ATData.existingAssays[EDDATD.masterProtocol] || [];
    assays.every((id: number, i: number): boolean => {
        var assay: AssayRecord, line: LineRecord, protocol: any, name: string;
        assay = EDDData.Assays[id];
        line = EDDData.Lines[assay.lid];
        protocol = EDDData.Protocols[assay.pid];
        name = [line.name, protocol.name, assay.name].join('-');
        if (assayOrLine.toLowerCase() === name.toLowerCase()) {
            // The full Assay name, even case-insensitive, is the best match
            selections.assayID = id;
            return false;  // do not need to continue
        } else if (highest < 0.8 && assayOrLine === assay.name) {
            // An exact-case match with the Assay name fragment alone is second-best.
            highest = 0.8;
            selections.assayID = id;
        } else if (highest < 0.7 && assay.name.indexOf(assayOrLine) >= 0) {
            // Finding the whole string inside the Assay name fragment is pretty good
            highest = 0.7;
            selections.assayID = id;
        } else if (highest < 0.6 && line.name.indexOf(assayOrLine) >= 0) {
            // Finding the whole string inside the originating Line name is good too.
            // It means that the user may intend to pair with this Assay even though the
            // Assay name is different.  
            highest = 0.6;
            selections.assayID = id;
        } else if (highest < 0.4 &&
                (new RegExp('(^|\\W)' + assay.name + '(\\W|$)', 'g')).test(assayOrLine)) {
            // Finding the Assay name fragment within the whole string, as a whole word, is our
            // last option.
            highest = 0.4;
            selections.assayID = id;
        } else if (highest < 0.3 && currentIndex === i) {
            // If all else fails, choose Assay of current index in sorted order.
            highest = 0.3;
            selections.assayID = id;
        }
        return true;
    });
    // Now we repeat the practice, separately, for the Line pulldown.
    highest = 0;
    // ATData.existingLines is type {id: number; n: string;}[]
    (ATData.existingLines || []).every((line: any, i: number): boolean => {
        if (assayOrLine === line.n) {
            // The Line name, case-sensitive, is the best match
            selections.lineID = line.id;
            return false;  // do not need to continue
        } else if (highest < 0.8 && assayOrLine.toLowerCase() === line.n.toLowerCase()) {
            // The same thing case-insensitive is second best.
            highest = 0.8;
            selections.lineID = line.id;
        } else if (highest < 0.7 && assayOrLine.indexOf(line.n) >= 0) {
            // Finding the Line name within the string is odd, but good.
            highest = 0.7;
            selections.lineID = line.id;
        } else if (highest < 0.6 && line.n.indexOf(assayOrLine) >= 0) {
            // Finding the string within the Line name is also good.
            highest = 0.6;
            selections.lineID = line.id;
        } else if (highest < 0.5 && currentIndex === i) {
            // Again, if all else fails, just choose the Line that matches the current index
            // in sorted order, in a loop.
            highest = 0.5;
            selections.lineID = line.id;
        }
        return true;
    });
    return selections;
},


highlighterF: (e: JQueryMouseEventObject): void => {
    var cell: JQuery, x: number, y: number;
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


singleValueDisablerF: (e: JQueryMouseEventObject): void => {
    var cell: JQuery, x: number, y: number;
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
            } else {
                EDDATD.Table.activeFlags[y][x] = true;
            }
            EDDATD.interpretDataTable();
            EDDATD.queueGraphRemake();
            EDDATD.redrawEnabledFlagMarkers();
        }
    }
},


generateFormSubmission: (): void => {
    var json: string;
    // Run through the data sets one more time, pulling out any values in the pulldowns and
    // autocomplete elements in Step 4 and embedding them in their respective data sets.
    json = JSON.stringify(EDDATD.Sets.parsedSets);
    $('#jsonoutput').val(json);
    $('#jsondebugarea').val(json);
},


// This handles insertion of a tab into the textarea.
// May be glitchy.
suppressNormalTab: (e: JQueryKeyEventObject): boolean => {
    var input: HTMLInputElement, text: string;
    if (e.which === 9) {
        input = <HTMLInputElement> e.target;
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


prepareIt: (): void => {
    var reProcessOnClick: string[], reDoLastStepOnChange: string[];
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


disclose: (): boolean => {
    $(this).closest('.disclose').toggleClass('discloseHide');
    return false;
},


process_result: (result): void => {
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
    } else {
        $("#rawdataformatp").val(result.file_type);
        $("#textData").text(result.file_data);
    }
    EDDATD.parseAndDisplayText(); // AssayTableData.ts
}

};


$(window).load(function() {
    var url = "/utilities/parsefile";
    var atdata_url = "/study/" + EDDData.currentStudyID + "/assaydata";

    Utl.FileDropZone.setup("textData", url, EDDATD.process_result, false);
    $('.disclose').find('a.discloseLink').on('click', EDDATD.disclose);
    // Populate ATData and EDDData objects via AJAX calls
    jQuery.ajax(atdata_url, {
        "success": function(data) {
            ATData = data.ATData;
            $.extend(EDDData, data.EDDData);
            EDDATD.prepareIt();
        }
    }).fail(function(x, s, e) {
        alert(s);
    });
});
