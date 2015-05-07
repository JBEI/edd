/// <reference path="EDDDataInterface.ts" />
/// <reference path="Autocomplete.ts" />
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
        // If the user deliberately chose to transpose or not transpose, disable the attempt to auto-determine transposition.
        userClickedOnTranspose: 0,
        // Whether to interpret the pasted data row-wise or column-wise, when importing either measurements or metadata.
        ignoreDataGaps: 0,
        userClickedOnIgnoreDataGaps: 0
    },
    // Used to assemble and display the table components in Step 3
    Table: {
        cornerCells: [],
        rowPulldownCells: [],
        rowLabelCells: [],
        colCheckboxCells: [],
        rowCheckboxCells: [],
        colObjects: [],
        dataCells: [],
        // We keep a single flag for each data point [y,x]
        // as well as two linear sets of flags for enabling or disabling
        // entire columns/rows.
        activeColFlags: [],
        activeRowFlags: [],
        activeFlags: [],
        // Arrays for the pulldown menus on the left side of the table.
        // These pulldowns are used to specify the data type - or types - contained in each row of the pasted data.
        pulldownObjects: [],
        pulldownSettings: [],
        // We also keep a set of flags to track whether a pulldown was changed by a user and will not be recalculated.
        pulldownUserChangedFlags: []
    },
    graphEnabled: 1,
    graphRefreshTimerID: 0,
    // Data structures pulled from the grid and composed into sets suitable for handing to the EDD server
    Sets: {
        parsedSets: [],
        uniqueLineAssayNames: [],
        uniqueMeasurementNames: [],
        uniqueMetadataNames: [],
        seenAnyTimestamps: 0 // A flag to indicate whether we have seen any timestamps specified in the import data
    },
    // Storage area for disambiguation-related UI widgets and information
    Disam: {
        // These objects hold string keys that correspond to unique names found during parsing.
        // The string keys point to existing autocomplete objects created specifically for those strings.
        // As the disambiguation section is destroyed and remade, any selections the user has already set
        // will persevere.
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
    changedMasterProtocol: function () {
        var masterProtocolEl = document.getElementById("masterProtocol");
        if (masterProtocolEl == null) {
            return;
        }
        var mp = masterProtocolEl.value;
        // If EDDATD.masterProtocol is not set, we need to run through this configuration
        // regardless of the value of the pulldown.
        if (!EDDATD.masterProtocol) {
            EDDATD.masterProtocol = mp;
        }
        else if (EDDATD.masterProtocol == mp) {
            return;
        }
        EDDATD.masterProtocol = mp;
        var masterAssayEl = document.getElementById("masterAssay");
        if (masterAssayEl == null) {
            return;
        }
        while (masterAssayEl.firstChild) {
            masterAssayEl.removeChild(masterAssayEl.firstChild);
        }
        var aOPT = document.createElement("option");
        aOPT.setAttribute('value', 'new');
        // We'll always start with the Create New option when changing Protocols
        aOPT.appendChild(document.createTextNode('(Create New)'));
        aOPT.setAttribute('selected', 'selected');
        masterAssayEl.appendChild(aOPT);
        for (var o in ATData.existingAssays[mp]) {
            var id = ATData.existingAssays[mp][o];
            aOPT = document.createElement("option");
            aOPT.setAttribute('value', id);
            var lid = EDDData.Assays[id].lid;
            var pid = EDDData.Assays[id].pid;
            var n = [EDDData.Lines[lid].n, EDDData.Protocols[pid].name, EDDData.Assays[id].an].join('-');
            aOPT.appendChild(document.createTextNode(n));
            masterAssayEl.appendChild(aOPT);
        }
        var masterLineSpan = document.getElementById('masterLineSpan');
        if (masterLineSpan == null) {
            return;
        }
        $(masterLineSpan).removeClass('off');
        EDDATD.queueProcessImportSettings();
    },
    queueProcessImportSettings: function () {
        // Start a timer to wait before calling the routine that reparses the import settings.
        // This way we're calling the reparse just once, even when we get multiple cascaded events that require it.
        if (EDDATD.processImportSettingsTimerID) {
            clearTimeout(EDDATD.processImportSettingsTimerID);
        }
        EDDATD.processImportSettingsTimerID = setTimeout("EDDATD.processImportSettings()", 5);
    },
    processImportSettings: function () {
        var mainRadioSTD = document.getElementById("stdlayout");
        var mainRadioTR = document.getElementById("trlayout");
        var mainRadioPR = document.getElementById("prlayout");
        var mainRadioMDV = document.getElementById("mdvlayout");
        var ignoreGapsEl = document.getElementById("ignoreGaps");
        var transposeEl = document.getElementById("transpose");
        var graphDiv = document.getElementById("graphDiv");
        var rawdataformatp = document.getElementById("rawdataformatp");
        // We need all of these, or the page is b0rken.
        if (!mainRadioSTD || !mainRadioTR || !mainRadioMDV || !ignoreGapsEl || !transposeEl || !graphDiv || !rawdataformatp) {
            return;
        }
        if (mainRadioSTD.checked) {
            EDDATD.interpretationMode = 'std';
            $(graphDiv).removeClass('off'); // By default we will attempt to show a graph
            EDDATD.graphEnabled = 1;
        }
        else if (mainRadioTR.checked) {
            EDDATD.interpretationMode = 'tr';
            $(graphDiv).addClass('off');
            EDDATD.graphEnabled = 0;
        }
        else if (mainRadioPR.checked) {
            EDDATD.interpretationMode = 'pr';
            $(graphDiv).addClass('off');
            EDDATD.graphEnabled = 0;
        }
        else if (mainRadioMDV.checked) {
            EDDATD.interpretationMode = 'mdv';
            $(graphDiv).addClass('off');
            EDDATD.graphEnabled = 0;
            // We neither ignore gaps, nor transpose, for MDV documents
            ignoreGapsEl.checked = false;
            transposeEl.checked = false;
            // JBEI MDV format documents are always pasted in from Excel, so they're always tab-separated
            rawdataformatp.selectedIndex = 0;
            EDDATD.Table.pulldownSettings = [1, 5]; // A default set of pulldown settings for this mode
        }
        else {
            // If none of them are checked - WTF?  Don't parse or change anything.
            return;
        }
        EDDATD.Grid.ignoreDataGaps = ignoreGapsEl.checked ? 1 : 0;
        EDDATD.Grid.transpose = transposeEl.checked ? 1 : 0;
        // Blanking this out is sufficient to re-enable all the flags
        //	EDDATD.Table.activeFlags = [];
        EDDATD.parseAndDisplayText();
    },
    // This gets called when there is a paste event.
    pastedRawData: function () {
        // We do this using a timeout so the rest of the paste events fire, and get the pasted result.
        window.setTimeout(function () {
            if (EDDATD.interpretationMode == "mdv") {
                return;
            }
            var textData = document.getElementById("textData");
            var val = textData.value;
            var rawdataformatp = document.getElementById("rawdataformatp");
            if (!rawdataformatp) {
                return;
            }
            // If there are more tab characters than commas in the text
            if (val.split("\t").length >= val.split(",").length) {
                rawdataformatp.selectedIndex = 0;
            }
            else {
                rawdataformatp.selectedIndex = 1;
            }
        }, 1);
    },
    parseAndDisplayText: function () {
        EDDATD.Grid.data = [];
        EDDATD.Grid.rowMarkers = [];
        var iMode = EDDATD.interpretationMode;
        var delimiter = "\t";
        var rawdataformatp = document.getElementById("rawdataformatp");
        if (!rawdataformatp) {
            console.log("Can't find data format pulldown");
            return;
        }
        // If we're in "mdv" mode, lock the delimiter to tabs
        if (iMode == "mdv") {
            rawdataformatp.selectedIndex = 0;
        }
        if (rawdataformatp.selectedIndex == 1) {
            delimiter = ",";
        }
        var widestRow = 0;
        var rowCount = 0;
        var textData = document.getElementById("textData");
        var data = textData.value;
        var unfilteredrows = data.split("\n");
        var rows = [];
        var longestInitialRow = 0;
        for (var y in unfilteredrows) {
            var cells = unfilteredrows[y].split(delimiter);
            if (cells.length > longestInitialRow) {
                longestInitialRow = cells.length;
            }
        }
        // If we have only one column of data - no separators anywhere - we should
        // assume that the contents of the column is data, not a bunch of empty labels.
        // This will affect how we process things later on.
        var multiColumn = 0;
        if (longestInitialRow > 1) {
            multiColumn = 1;
        }
        for (var y in unfilteredrows) {
            if (unfilteredrows[y] != "") {
                var cells = unfilteredrows[y].split(delimiter);
                // Only use the row if it has at least one value on it.
                var c = cells.length;
                if (c > 0) {
                    rows.push(unfilteredrows[y]);
                }
                if (c > widestRow) {
                    widestRow = c;
                }
            }
        }
        if (iMode == 'std' || iMode == 'tr' || iMode == 'pr') {
            // The first thing we're going to do is turn the text into a big grid of data.
            // We're not going to respect the transposition setting here - we may be trying to
            // auto-set it later.
            var tempData = [];
            for (var ri = 0; ri < rows.length; ri++) {
                var cells = rows[ri].split(delimiter);
                for (var ci = 0; ci < (widestRow - cells.length); ci++) {
                    cells.push(null);
                }
                tempData.push(cells);
            }
            rowCount = tempData.length;
            // If the user hasn't deliberately chosen a setting for 'transpose', we will
            // do some analysis to attempt to guess which orientation the data needs to have.
            if (!EDDATD.Grid.userClickedOnTranspose) {
                // The most straightforward method is to take the top row, and the first column,
                // and analyze both to see which one most likely contains a run of timestamps.
                // We'll also do the same for the second row and the second column, in case the
                // timestamps are underneath some other header.
                var arraysToAnalyze = [[], [], [], []];
                var arraysScores = [0, 0, 0, 0];
                // Note that with empty or too-small source data, these arrays will either remain empty, or become 'null'
                arraysToAnalyze[0] = rows[0]; // First row
                arraysToAnalyze[1] = rows[1]; // Second row
                for (var ri = 0; ri < rowCount; ri++) {
                    arraysToAnalyze[2].push(rows[ri][0]); // First column
                    arraysToAnalyze[3].push(rows[ri][1]); // Second column
                }
                for (var ai = 0; ai < arraysToAnalyze.length; ai++) {
                    var oneArray = arraysToAnalyze[ai];
                    var score = 0;
                    if (!oneArray) {
                        continue;
                    }
                    if (oneArray.length < 1) {
                        continue;
                    }
                    var previous = null;
                    var previousNonNull = null;
                    for (var i = 0; i < oneArray.length; i++) {
                        var current = oneArray[i];
                        if (current != null) {
                            current = current.replace(/,/g, '');
                            if (isNaN(parseFloat(current))) {
                                current = null;
                            }
                            current = parseFloat(current);
                        }
                        if ((current != null) && (previous != null)) {
                            // If the value increases relative to the one immediately before, award a point
                            if (current > previous) {
                                score++;
                            }
                        }
                        else if ((current != null) && (previousNonNull != null)) {
                            // Or, if the value increases after a gap, award half a point
                            if (current > previous) {
                                score = score + 0.5;
                            }
                        }
                        previous = current;
                        if (current != null) {
                            previousNonNull = current;
                        }
                    }
                    arraysScores[ai] = score / oneArray.length;
                }
                var transposeEl = document.getElementById("transpose");
                // If the first row and column scored differently, judge based on them.
                if (arraysScores[0] != arraysScores[2]) {
                    if (arraysScores[0] > arraysScores[2]) {
                        transposeEl.checked = true;
                    }
                    else {
                        transposeEl.checked = false;
                    }
                }
                else if (arraysScores[1] > arraysScores[3]) {
                    transposeEl.checked = true;
                }
                else {
                    transposeEl.checked = false;
                }
                EDDATD.Grid.transpose = transposeEl.checked ? 1 : 0;
            }
            // Now that that's done, move the data into Grid.data,
            // splitting off a row or column into Grid.rowMarkers as needed,
            // according to the Grid.transpose setting.
            if (EDDATD.Grid.transpose) {
                // The first row becomes the Y-markers as-is
                EDDATD.Grid.rowMarkers = tempData.shift();
                rowCount--;
                for (var ci = 0; ci < widestRow; ci++) {
                    EDDATD.Grid.data[ci] = [];
                    for (var ri = 0; ri < rowCount; ri++) {
                        EDDATD.Grid.data[ci][ri] = tempData[ri][ci];
                    }
                }
                // Don't forget to swap these!
                widestRow = rowCount;
                rowCount = EDDATD.Grid.data.length;
            }
            else {
                for (var ri = 0; ri < rowCount; ri++) {
                    EDDATD.Grid.rowMarkers[ri] = tempData[ri][0];
                    EDDATD.Grid.data[ri] = [];
                    for (var ci = 1; ci < widestRow; ci++) {
                        EDDATD.Grid.data[ri][ci - 1] = tempData[ri][ci];
                    }
                }
                widestRow--; // Now every row is shorter by one column.
            }
            // If the user hasn't deliberately chosen to ignore, or accept, gaps in the data,
            // we will do a crude statistical analysis to try and guess which setting makes more sense.
            if (!EDDATD.Grid.userClickedOnIgnoreDataGaps) {
                // What we're going to do is try and count the number of blank values hanging off the
                // end of each column, and count the number of blank values in between non-blank data
                // in each column.  If we get more than three times as many hanging off the end, we'll
                // choose to ignore gaps by default.  It's not an ideal analysis, but it's better than none.
                // Note that this approach suffers a fair amount if we chose the wrong transposition orientation
                // earlier.  (We're relying on sequences of data being oriented vertically here, not horizontally.)
                var intraDataGaps = 0;
                var extraDataGaps = 0;
                for (var ri = 0; ri < rowCount; ri++) {
                    var foundNonNullValue = 0;
                    for (var ci = widestRow; ci > 0; ci--) {
                        var v = EDDATD.Grid.data[ri][ci - 1];
                        if ((v == null) || (v == '')) {
                            if (!foundNonNullValue) {
                                extraDataGaps++;
                            }
                            else {
                                intraDataGaps++;
                            }
                        }
                        else {
                            foundNonNullValue = 1;
                        }
                    }
                }
                var ignoreGapsEl = document.getElementById("ignoreGaps");
                if (extraDataGaps > (intraDataGaps * 3)) {
                    ignoreGapsEl.checked = true;
                }
                else {
                    ignoreGapsEl.checked = false;
                }
                EDDATD.Grid.ignoreDataGaps = ignoreGapsEl.checked ? 1 : 0;
            }
            for (var mi = 0; mi < rowCount; mi++) {
                if (!EDDATD.Grid.rowMarkers[mi]) {
                    EDDATD.Grid.rowMarkers[mi] = '?';
                }
            }
            for (var ri = 0; ri < rowCount; ri++) {
                if (EDDATD.Table.pulldownUserChangedFlags[ri]) {
                    continue;
                }
                EDDATD.Table.pulldownSettings[ri] = EDDATD.figureOutThisRowsDataType(EDDATD.Grid.rowMarkers[ri], EDDATD.Grid.data[ri]);
            }
        }
        else if ((iMode == "mdv") && (rows.length > 1) && multiColumn) {
            var fr = rows[0];
            // If this word fragment is in the first row, drop the whole row. (Ignoring a Q of unknown capitalization)
            if (fr.match('uantitation')) {
                rows.shift();
            }
            var columnLabels = [];
            var compoundsSeen = {};
            var compoundNamesInOrderSeen = [];
            for (var y in rows) {
                var cells = rows[y].split(delimiter);
                var first = cells.shift(); // Steal off the first cell
                // If we happen to encounter an occurrence of a row with 'Compound' in the first column,
                // we treat it as a row of column identifiers.
                if (first == 'Compound') {
                    columnLabels = cells;
                    continue;
                }
                var firstBits = first.split(' M = ');
                // We need exactly two pieces to come out of this split, or we can't parse the line.
                if (firstBits.length != 2) {
                    continue;
                }
                var compName = firstBits[0];
                var markerNumber = parseInt(firstBits[1]);
                if (typeof compoundsSeen[compName] == 'undefined') {
                    var cStructure = {
                        originalRows: {},
                        processedAssayCols: {}
                    };
                    compoundsSeen[compName] = cStructure;
                    compoundNamesInOrderSeen.push(compName);
                }
                compoundsSeen[compName].originalRows[markerNumber] = cells;
            }
            for (var c in compoundsSeen) {
                var oneComp = compoundsSeen[c];
                var origRows = oneComp.originalRows;
                // First we'll gather up all the marker indexes we were given for this compound
                var origRowIndexes = [];
                for (var r in origRows) {
                    origRowIndexes.push(r);
                }
                origRowIndexes.sort(function (a, b) {
                    return a - b;
                }); // Sort ascending
                for (var cl = 0; cl < columnLabels.length; cl++) {
                    var carbonMarkerParts = [];
                    var foundAnyFloat = 0;
                    for (var ri = 0; ri < origRowIndexes.length; ri++) {
                        var rowIndex = origRowIndexes[ri];
                        var origRow = origRows[rowIndex];
                        var cm = origRow[cl];
                        if (typeof cm != 'undefined') {
                            if (cm != null) {
                                cm = cm.replace(/,/g, ''); //	No commas, please
                                if (isNaN(parseFloat(cm))) {
                                    if (foundAnyFloat) {
                                        carbonMarkerParts.push('');
                                    }
                                }
                                else {
                                    carbonMarkerParts.push(parseFloat(cm));
                                    foundAnyFloat = 1;
                                }
                            }
                        }
                    }
                    var carbonMarker = carbonMarkerParts.join('/');
                    // Now that we've assembled a full carbon marker number, we grab the column label,
                    // so we can place the marker in the appropriate section.
                    oneComp.processedAssayCols[cl] = carbonMarker;
                }
            }
            // Start the set of row markers with a generic label
            EDDATD.Grid.rowMarkers = [];
            EDDATD.Grid.rowMarkers[0] = 'Assay';
            EDDATD.Grid.data[0] = [];
            for (var cl = 0; cl < columnLabels.length; cl++) {
                EDDATD.Grid.data[0][cl] = columnLabels[cl];
            }
            for (var cni = 0; cni < compoundNamesInOrderSeen.length; cni++) {
                EDDATD.Grid.data[cni + 1] = [];
                var cn = compoundNamesInOrderSeen[cni];
                EDDATD.Grid.rowMarkers[cni + 1] = cn;
                var oneComp = compoundsSeen[cn];
                for (var cl = 0; cl < columnLabels.length; cl++) {
                    EDDATD.Grid.data[cni + 1][cl] = oneComp.processedAssayCols[cl];
                }
                if (EDDATD.Table.pulldownSettings.length < (cni + 2)) {
                    // If the pulldown array hasn't reached this far, give this row a default of 5
                    EDDATD.Table.pulldownSettings[cni + 1] = 5;
                }
            }
            widestRow = columnLabels.length;
            rowCount = EDDATD.Grid.data.length;
        }
        EDDATD.Grid.w = widestRow;
        EDDATD.Grid.l = rowCount;
        for (var x = 0; x < widestRow; x++) {
            if (typeof EDDATD.Table.activeColFlags[x] == 'undefined') {
                EDDATD.Table.activeColFlags[x] = 1;
            }
        }
        for (var y = 0; y < rowCount; y++) {
            if (typeof EDDATD.Table.activeRowFlags[y] == 'undefined') {
                EDDATD.Table.activeRowFlags[y] = 1;
            }
            if (typeof EDDATD.Table.activeFlags[y] == 'undefined') {
                EDDATD.Table.activeFlags[y] = [];
            }
            for (var x = 0; x < widestRow; x++) {
                if (typeof EDDATD.Table.activeFlags[y][x] == 'undefined') {
                    EDDATD.Table.activeFlags[y][x] = 1;
                }
            }
        }
        // Construct table cell objects for the page, based on our extracted data
        EDDATD.Table.dataCells = [];
        EDDATD.Table.cornerCells = [];
        EDDATD.Table.colCheckboxCells = [];
        EDDATD.Table.rowLabelCells = [];
        EDDATD.Table.rowPulldownCells = [];
        EDDATD.Table.rowCheckboxCells = [];
        // The corner cells that fit in the upper left at the top of the Y column
        var aTD;
        for (var i = 0; i < 3; i++) {
            // x and y are set to 0 because these cells are off the highlight grid
            aTD = EDDATD.makeGridTD('ulCell' + i, '', 0, 0);
            EDDATD.Table.cornerCells.push(aTD);
        }
        for (var i = 0; i < widestRow; i++) {
            aTD = EDDATD.makeGridTD('colCBCell' + i, 'checkBoxCell', 1 + i, 0);
            var aCB = document.createElement("input");
            aCB.setAttribute('type', "checkbox");
            aCB.setAttribute('id', "enableColumn" + i);
            aCB.setAttribute('name', "enableColumn" + i);
            aCB.setAttribute('value', (i + 1).toString());
            if (EDDATD.Table.activeColFlags[i]) {
                aCB.setAttribute('checked', "true");
            }
            aCB.setAttribute('onclick', "EDDATD.toggleTableColumn(this);");
            aTD.appendChild(aCB);
            EDDATD.Table.colCheckboxCells[i] = aTD;
        }
        var tablePulldownOptions = [
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
        if (iMode == 'tr') {
            tablePulldownOptions = [
                ['--', 0],
                ['Entire Row Is...', [
                    ['Gene Names', 10],
                    ['RPKM Values', 11]
                ]]
            ];
        }
        if (iMode == 'pr') {
            tablePulldownOptions = [
                ['--', 0],
                ['Entire Row Is...', [
                    ['Assay/Line Names', 1],
                ]],
                ['First Column Is...', [
                    ['Protein Name', 12]
                ]]
            ];
        }
        EDDATD.Table.pulldownObjects = []; // We don't want any lingering old objects in this
        for (var i = 0; i < rowCount; i++) {
            // A cell that will contain a pulldown for describing the data
            aTD = EDDATD.makeGridTD('rowPCell' + i, 'pulldownCell', 0, 1 + i);
            EDDATD.Table.rowPulldownCells[i] = aTD;
            // The pulldown for the cell
            var aSEL = document.createElement("select");
            aSEL.setAttribute('name', 'row' + i + 'type');
            aSEL.setAttribute('id', 'row' + i + 'type');
            // An onclick callback to update the relevant piece of the data structure
            var oc = "EDDATD.changedRowDataTypePulldown(" + i + ", this.value);";
            aSEL.setAttribute('onchange', oc);
            EDDATD.Table.pulldownObjects[i] = aSEL;
            aTD.appendChild(aSEL);
            // A recursive function to populate a pulldown with optional optiongroups,
            // and a default selection
            var populatePulldown = function (el, arr, selection) {
                for (var o = 0; o < arr.length; o++) {
                    var p = arr[o];
                    if (toString.call(p[1]) === "[object Array]") {
                        var aGrp = document.createElement("optgroup");
                        aGrp.setAttribute('label', p[0]);
                        el.appendChild(aGrp);
                        populatePulldown(aGrp, p[1], selection);
                    }
                    else {
                        var aOPT = document.createElement("option");
                        aOPT.setAttribute('value', p[1]);
                        if (p[1] == selection) {
                            aOPT.setAttribute('selected', 'selected');
                        }
                        aOPT.appendChild(document.createTextNode(p[0]));
                        el.appendChild(aOPT);
                    }
                }
            };
            // The options for the pulldown
            var pulldownValue = EDDATD.Table.pulldownSettings[i] || 0;
            populatePulldown(aSEL, tablePulldownOptions, pulldownValue);
            // A checkbox that goes next to the row label cell
            aTD = EDDATD.makeGridTD('rowCBCell' + i, 'checkBoxCell', 0, 1 + i);
            var aCB = document.createElement("input");
            aCB.setAttribute('type', "checkbox");
            aCB.setAttribute('id', "enableRow" + i);
            aCB.setAttribute('name', "enableRow" + i);
            aCB.setAttribute('value', (i + 1).toString());
            if (EDDATD.Table.activeRowFlags[i]) {
                aCB.setAttribute('checked', "true");
            }
            aCB.setAttribute('onclick', "EDDATD.toggleTableRow(this);");
            aTD.appendChild(aCB);
            EDDATD.Table.rowCheckboxCells[i] = aTD;
            // A header cell for the row label
            aTD = EDDATD.makeGridTD('rowMCell' + i, '', 0, 1 + i, EDDATD.Grid.rowMarkers[i]);
            EDDATD.Table.rowLabelCells[i] = aTD;
        }
        for (var y = 0; y < rowCount; y++) {
            EDDATD.Table.dataCells[y] = [];
            for (var x = 0; x < EDDATD.Grid.data[y].length; x++) {
                var val = EDDATD.Grid.data[y][x];
                if ((typeof val == 'undefined') || (val == null)) {
                    val = '';
                }
                var shortVal = val;
                if (val.length > 32) {
                    shortVal = val.substr(0, 31) + String.fromCharCode(0x2026); // An ellipsis, or &hellip;;
                }
                aTD = EDDATD.makeGridTD('valCell' + x + '-' + y, '', 1 + x, 1 + y, shortVal);
                aTD.setAttribute('title', val);
                if (val == '') {
                    aTD.setAttribute('isblank', 1);
                }
                EDDATD.Table.dataCells[y][x] = aTD;
            }
        }
        EDDATD.applyTableDataTypeStyling();
        // Construct a table from the data cell objects,
        var tableObject = document.createElement("table");
        tableObject.setAttribute('cellspacing', "0");
        var tBodyObject = document.createElement("tbody");
        // One of the objects here will be a column group, with col objects in it.
        // This is an interesting twist on DOM behavior that you should probably google.
        var colGroupObject = document.createElement("colgroup");
        EDDATD.Table.colObjects = [];
        tableObject.appendChild(colGroupObject);
        tableObject.appendChild(tBodyObject);
        for (var i = 0; i < 3; i++) {
            var aCol = document.createElement("col");
            colGroupObject.appendChild(aCol);
        }
        for (var i = 0; i < widestRow; i++) {
            var aCol = document.createElement("col");
            EDDATD.Table.colObjects[i] = aCol; // Save these for later manipulation
            colGroupObject.appendChild(aCol);
        }
        // The first row: The spacer cells, then a row of checkbox cells for the data columns
        var aRow = document.createElement("tr");
        tBodyObject.appendChild(aRow);
        for (var i = 0; i < EDDATD.Table.cornerCells.length; i++) {
            aRow.appendChild(EDDATD.Table.cornerCells[i]);
        }
        for (var j = 0; j < widestRow; j++) {
            aRow.appendChild(EDDATD.Table.colCheckboxCells[j]);
        }
        for (var y = 0; y < rowCount; y++) {
            aRow = document.createElement("tr");
            tBodyObject.appendChild(aRow);
            // The space for the pulldown where the data type will be selected by the client
            aRow.appendChild(EDDATD.Table.rowPulldownCells[y]);
            // The cell with the checkbox for enabling/disabling the row
            aRow.appendChild(EDDATD.Table.rowCheckboxCells[y]);
            // The row label, extracted from the header of the pasted data
            aRow.appendChild(EDDATD.Table.rowLabelCells[y]);
            for (var x = 0; x < widestRow; x++) {
                aRow.appendChild(EDDATD.Table.dataCells[y][x]);
            }
        }
        // Remove and replace the table in the document
        var dataTableDiv = document.getElementById("dataTableDiv");
        while (dataTableDiv.firstChild) {
            dataTableDiv.removeChild(dataTableDiv.firstChild);
        }
        dataTableDiv.appendChild(tableObject);
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
    // Support function for making table cells in the grid display
    makeGridTD: function (id, className, x, y, text) {
        var td = document.createElement("td");
        td.setAttribute('id', id);
        td.setAttribute('x', x);
        td.setAttribute('y', y);
        td.className = className;
        if (typeof text != 'undefined') {
            if (text != null) {
                var d = document.createElement("div");
                d.appendChild(document.createTextNode(text));
                td.appendChild(d);
            }
        }
        return td;
    },
    // This routine does a bit of additional styling to the Step 3 data table.
    // It removes and re-adds the dataTypeCell css classes according to the pulldown settings for each row.
    applyTableDataTypeStyling: function () {
        for (var y = 0; y < EDDATD.Grid.l; y++) {
            var pulldownValue = EDDATD.Table.pulldownSettings[y] || 0;
            var highlightLabel = 0;
            var highlightRestOfRow = 0;
            if ((pulldownValue == 1) || (pulldownValue == 2)) {
                highlightRestOfRow = 1;
            }
            else if ((pulldownValue >= 3) && (pulldownValue <= 5)) {
                highlightLabel = 1;
            }
            var rowLabel = EDDATD.Table.rowLabelCells[y];
            $(rowLabel).removeClass('dataTypeCell');
            if (highlightLabel) {
                $(rowLabel).addClass('dataTypeCell');
            }
            for (var x = 0; x < EDDATD.Grid.w; x++) {
                var cell = EDDATD.Table.dataCells[y][x];
                $(cell).removeClass('dataTypeCell');
                if (highlightRestOfRow) {
                    $(cell).addClass('dataTypeCell');
                }
            }
        }
    },
    // We call this when any of the 'master' pulldowns are changed in Step 4.
    // Such changes may affect the available contents of some of the pulldowns in the step.
    changedAMasterPulldown: function () {
        var masterAssayEl = document.getElementById("masterAssay");
        if (masterAssayEl == null) {
            return;
        }
        var masterLineSpan = document.getElementById('masterLineSpan');
        if (masterLineSpan == null) {
            return;
        }
        $(masterLineSpan).addClass('off');
        if (!masterAssayEl.selectedIndex) {
            $(masterLineSpan).removeClass('off');
        }
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
        var numberCt = 0;
        var stringCt = 0;
        var measurementsCt = 0;
        var uniqueMeasurementsCt = 0;
        var uniqueMeasurements = {};
        var cRow = []; // A condensed version of the row, with no nulls or blank values
        for (var i = 0; i < row.length; i++) {
            var v = row[i];
            if ((v == null) || (v == '')) {
                blankCt++;
            }
            else {
                cRow.push(v);
            }
        }
        for (var i = 0; i < cRow.length; i++) {
            var v = cRow[i];
            var m = EDDAutoComplete.MetaboliteField.searchForClosestRecordMatchStatic(v);
            if (m) {
                measurementsCt++;
                if (!uniqueMeasurements[m]) {
                    uniqueMeasurements[m] = 1;
                    uniqueMeasurementsCt++;
                }
            }
            v = v.replace(/,/g, ''); //	No commas, please
            if (isNaN(parseFloat(v))) {
                stringCt++;
            }
            else {
                numberCt++;
            }
        }
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
        if (EDDAutoComplete.MetaDataField.searchForClosestRecordMatchStatic(label)) {
            return 4;
        }
        // No choice by default
        return 0;
    },
    redrawIgnoredValueMarkers: function () {
        for (var j = 0; j < EDDATD.Table.dataCells.length; j++) {
            for (var i = 0; i < EDDATD.Table.dataCells[j].length; i++) {
                var aTD = EDDATD.Table.dataCells[j][i];
                aTD.className = aTD.className.replace(" ignoredLine", "");
                if (EDDATD.Grid.ignoreDataGaps && aTD.getAttribute('isblank')) {
                    aTD.className = aTD.className + " ignoredLine";
                }
            }
        }
    },
    toggleTableRow: function (box) {
        var val = parseInt(box.getAttribute('value'));
        if (!val) {
            return;
        }
        if (box.checked) {
            EDDATD.Table.activeRowFlags[val - 1] = 1;
        }
        else {
            EDDATD.Table.activeRowFlags[val - 1] = 0;
        }
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    toggleTableColumn: function (box) {
        var val = parseInt(box.getAttribute('value'));
        if (!val) {
            return;
        }
        var col = EDDATD.Table.colObjects[val - 1];
        if (!col) {
            return;
        }
        if (box.checked) {
            EDDATD.Table.activeColFlags[val - 1] = 1;
        }
        else {
            EDDATD.Table.activeColFlags[val - 1] = 0;
        }
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        // Resetting a disabled column may change the rows listed in the Info table.
        EDDATD.remakeInfoTable();
    },
    resetEnabledFlagMarkers: function () {
        for (var y = 0; y < EDDATD.Grid.l; y++) {
            EDDATD.Table.activeFlags[y] = [];
            for (var x = 0; x < EDDATD.Grid.w; x++) {
                EDDATD.Table.activeFlags[y][x] = 1;
            }
        }
        for (var x = 0; x < EDDATD.Grid.w; x++) {
            EDDATD.Table.activeColFlags[x] = 1;
        }
        for (var y = 0; y < EDDATD.Grid.l; y++) {
            EDDATD.Table.activeRowFlags[y] = 1;
        }
        for (var i = 0; i < EDDATD.Grid.w; i++) {
            var aCB = document.getElementById("enableColumn" + i);
            if (aCB != null) {
                aCB.checked = true;
            }
        }
        for (var i = 0; i < EDDATD.Grid.l; i++) {
            var aCB = document.getElementById("enableRow" + i);
            if (aCB != null) {
                aCB.checked = true;
            }
        }
        EDDATD.interpretDataTable();
        EDDATD.queueGraphRemake();
        EDDATD.redrawEnabledFlagMarkers();
        EDDATD.remakeInfoTable();
    },
    redrawEnabledFlagMarkers: function () {
        for (var x = 0; x < EDDATD.Grid.w; x++) {
            var aTD = EDDATD.Table.colCheckboxCells[x];
            aTD.className = aTD.className.replace(" disabledLine", "");
            if (!EDDATD.Table.activeColFlags[x]) {
                aTD.className = aTD.className + " disabledLine";
            }
            for (var y = 0; y < EDDATD.Grid.l; y++) {
                aTD = EDDATD.Table.dataCells[y][x];
                aTD.className = aTD.className.replace(" disabledLine", "");
                if (!EDDATD.Table.activeFlags[y][x] || !EDDATD.Table.activeColFlags[x] || !EDDATD.Table.activeRowFlags[y]) {
                    aTD.className = aTD.className + " disabledLine";
                }
            }
        }
        for (var y = 0; y < EDDATD.Grid.l; y++) {
            var aTD = EDDATD.Table.rowLabelCells[y];
            aTD.className = aTD.className.replace(" disabledLine", "");
            if (!EDDATD.Table.activeRowFlags[y]) {
                aTD.className = aTD.className + " disabledLine";
            }
        }
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
                        v = v.replace(/,/g, ''); //	No commas, please
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
                        v = v.replace(/,/g, ''); //	No commas, please
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
                        var fullN = [EDDData.Lines[lid].n, EDDData.Protocols[pid].name, EDDData.Assays[id].an].join('-');
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
            var aRow = document.createElement("tr");
            aTBody.appendChild(aRow);
            var aTH = document.createElement("th");
            aTH.colSpan = 2; // http://www.w3schools.com/jsref/prop_tabledata_colspan.asp
            aTH.setAttribute('colspan', "2");
            aTH.style.textAlign = "right";
            aTH.appendChild(document.createTextNode('Compartment'));
            aRow.appendChild(aTH);
            aTH = document.createElement("th");
            aTH.appendChild(document.createTextNode('Type'));
            aRow.appendChild(aTH);
            aTH = document.createElement("th");
            if (EDDATD.interpretationMode == "std") {
                aTH.appendChild(document.createTextNode('Units'));
            }
            aRow.appendChild(aTH);
            // Done with headers row
            EDDATD.Disam.currentlyVisibleMeasurementObjSets = []; // For use in cascading user settings
            for (var i = 0; i < EDDATD.Sets.uniqueMeasurementNames.length; i++) {
                var uName = EDDATD.Sets.uniqueMeasurementNames[i];
                // Find a pre-existing collection of objects that corresponds to this unique string
                var disamRow = EDDATD.Disam.measurementObjSets[uName];
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
                    // Now build another table cell that will contain the autocomplete elements
                    var compAutocomplete = EDDAutoComplete.createAutoCompleteContainer("measurementcompartment", 4, 'disamMComp' + EDDATD.Disam.autoCompUID, uName, 0);
                    var typeAutocomplete = EDDAutoComplete.createAutoCompleteContainer("metabolite", 45, 'disamMType' + EDDATD.Disam.autoCompUID + 1, uName, 0);
                    var unitsAutocomplete = EDDAutoComplete.createAutoCompleteContainer("units", 15, 'disamMUnits' + EDDATD.Disam.autoCompUID + 2, uName, 0);
                    EDDATD.Disam.autoCompUID += 3;
                    // Perform these operations on all new autocomplete units
                    var newAutos = [compAutocomplete, typeAutocomplete, unitsAutocomplete];
                    for (var n = 0; n < newAutos.length; n++) {
                        var na = newAutos[n];
                        aTD = document.createElement("td");
                        aTD.className = 'disamDataCell';
                        aRow.appendChild(aTD);
                        aTD.appendChild(na.inputElement);
                        aTD.appendChild(na.hiddenInputElement);
                        na.inputElement.callAfterAutoChange = EDDATD.userChangedMeasurementDisam;
                        EDDAutoComplete.initializeElement(na.inputElement);
                        na.inputElement.autocompleter.setFromPrimaryElement();
                        na.initialized = 1;
                        na.setByUser = 0; // For use here in AssayTableData
                    }
                    // Done with the td objects
                    disamRow.compObj = compAutocomplete;
                    disamRow.typeObj = typeAutocomplete;
                    disamRow.unitsObj = unitsAutocomplete;
                    // Done with the tr object
                    EDDATD.Disam.measurementObjSets[uName] = disamRow; // Store the row for later reference
                }
                // Set or re-set the names of the inputs so they correlate with the uniqueMeasurementNames indexes
                disamRow.compObj.inputElement.setAttribute('name', 'disamMComp' + (i + 1));
                disamRow.compObj.inputElement.setAttribute('visibleIndex', i);
                disamRow.compObj.hiddenInputElement.setAttribute('name', 'disamMCompHidden' + (i + 1));
                disamRow.typeObj.inputElement.setAttribute('name', 'disamMType' + (i + 1));
                disamRow.typeObj.inputElement.setAttribute('visibleIndex', i);
                disamRow.typeObj.hiddenInputElement.setAttribute('name', 'disamMTypeHidden' + (i + 1));
                disamRow.unitsObj.inputElement.setAttribute('name', 'disamMUnits' + (i + 1));
                disamRow.unitsObj.inputElement.setAttribute('visibleIndex', i);
                disamRow.unitsObj.hiddenInputElement.setAttribute('name', 'disamMUnitsHidden' + (i + 1));
                // If we're in MDV mode, the units pulldowns are irrelevant.
                if (EDDATD.interpretationMode == "mdv") {
                    $(disamRow.unitsObj.inputElement).addClass('off');
                }
                else {
                    $(disamRow.unitsObj.inputElement).removeClass('off');
                }
                // Used in userChangedMeasurementDisam to cascade changes in one input to subsequent inputs
                EDDATD.Disam.currentlyVisibleMeasurementObjSets.push(disamRow);
            }
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
                    var metaAutocomplete = EDDAutoComplete.createAutoCompleteContainer("metadatatype", 23, 'disamMeta' + EDDATD.Disam.autoCompUID, uName, 0);
                    EDDATD.Disam.autoCompUID++;
                    aTD.appendChild(metaAutocomplete.inputElement);
                    aTD.appendChild(metaAutocomplete.hiddenInputElement);
                    // Done with the autocomplete object
                    EDDAutoComplete.initializeElement(metaAutocomplete.inputElement);
                    // custom property needs to be accessed via index notation
                    metaAutocomplete.inputElement['autocompleter'].setFromPrimaryElement();
                    metaAutocomplete.initialized = 1;
                    disamRow.metaObj = metaAutocomplete;
                    // Done with the td obect
                    // Done with the tr object
                    EDDATD.Disam.metadataObjSets[uName] = disamRow; // Store the row for later reference
                }
                // Set or re-set the names of the inputs so they correlate with the uniqueMetadataNames indexes
                disamRow.metaObj.inputElement.setAttribute('name', 'disamMeta' + (i + 1));
                disamRow.metaObj.hiddenInputElement.setAttribute('name', 'disamMetaHidden' + (i + 1));
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
            var ln = EDDData.Lines[lid].n;
            var pid = assay.pid;
            var fn = [ln, EDDData.Protocols[pid].name, assay.an].join('-');
            // The full Assay name, even case-insensitive, is the best match
            if (assayOrLine.toLowerCase() == fn.toLowerCase()) {
                selections.assayID = id;
                break;
            }
            if (highestMatchQuality >= 0.8) {
                continue;
            }
            // An exact-case match with the Assay name fragment alone is second-best.
            if (assayOrLine == assay.an) {
                highestMatchQuality = 0.8;
                selections.assayID = id;
                continue;
            }
            // Finding the whole string inside the Assay name fragment is pretty good
            if (highestMatchQuality >= 0.7) {
                continue;
            }
            if (assay.an.indexOf(assayOrLine) >= 0) {
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
            var reg = new RegExp('(^|\\W)' + assay.an + '(\\W|$)', 'g');
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
        var reProcessOnClick = ['#stdlayout', '#trlayout', , '#prlayout', '#mdvlayout', '#rawdataformatp'];
        // Using "change" for these because it's more efficient AND because it works around an irritating Chrome inconsistency
        // For some of these, changing them shouldn't actually affect processing until we implement
        // an overwrite-checking feature or something similar
        var reDoLastStepOnChange = ['#masterAssay', '#masterLine', '#masterMComp', '#masterMType', '#masterMUnits'];
        for (var x = 0; x < reProcessOnClick.length; x++) {
            var n = reProcessOnClick[x];
            $(n).click(EDDATD.queueProcessImportSettings);
        }
        for (var x = 0; x < reDoLastStepOnChange.length; x++) {
            var n = reDoLastStepOnChange[x];
            $(n).change(EDDATD.changedAMasterPulldown);
        }
        $('#ignoreGaps').click(EDDATD.clickedOnIgnoreDataGaps);
        $('#transpose').click(EDDATD.clickedOnTranspose);
        EDDATD.changedMasterProtocol(); //	Since the initial masterProtocol value is zero, we need to manually trigger this:
        EDDATD.queueProcessImportSettings();
    }
};
//# sourceMappingURL=AssayTableData.js.map