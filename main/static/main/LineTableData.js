/// <reference path="Autocomplete.ts" />
var EDDLTD;
EDDLTD = {
    graphData: [],
    graphXMarkers: [],
    graphYMarkers: [],
    // We keep a single flag for each data point [x,y]
    // as well as two linear sets of flags for enabling or disabling
    // entire columns/rows.
    activeFlagsData: [],
    activeFlagsXMarkers: [],
    activeFlagsYMarkers: [],
    tableDataObjects: [],
    tableYHeaderObject: null,
    tableXHeaderObjects: [],
    tableYMarkerObjects: [],
    tableXCheckboxObjects: [],
    tableYCheckboxObjects: [],
    tableRowObjects: [],
    tableColObjects: [],
    // The main mode we are interpreting data in.
    // Valid values are "ionCSV", and "metaData"
    interpretationMode: "metaData",
    // Whether to interpret the pasted data row-wise or column-wise, for metadata.
    // Valid values are "colsAreMeta" and "rowsAreMeta".
    metaDataAre: "colsAreMeta",
    parsedDataSets: [],
    // This variable is necessary because we decompose the parsed table of metadata into hashes,
    // and in that form they lose any definitive indicator of how many rows/columns of metadata were in
    // the original table.  That count, and whether or not the row/column was flagged as "enabled".
    // is important to know for when we enumerate the pulldowns in Step 4.
    metaDataSegmentFlags: [],
    metaDataSegmentLabels: [],
    linePulldownSettings: {},
    metaDataPulldownSettings: {},
    lineMetaChoiceElements: [],
    disambiguationElements: [],
    generalLineDataTypes: ["Strain", "Media", "Carbon Source", "Experimenter", "Contact"],
    generalLineDataTypeLabels: ["strain", "media", "carbonsource", "experimenter", "contact"],
    generalAssayDataTypes: ["Protocol", "Metabolite Type", "Measurement Time", "Measurement"],
    generalAssayDataTypeLabels: ["protocol", "metabolite", "measurementtime", "measurement"],
    processImportSettingsTimerID: 0,
    queueProcessImportSettings: function () {
        // Start a timer to wait before calling the routine that reparses the import settings.
        // This way we're calling the reparse just once, even when we get multiple cascaded events that require it.
        if (EDDLTD.processImportSettingsTimerID) {
            clearTimeout(EDDLTD.processImportSettingsTimerID);
        }
        EDDLTD.processImportSettingsTimerID = setTimeout("EDDLTD.processImportSettings()", 5);
    },
    processImportSettings: function () {
        var textBoxContent = "";
        var mainRadioL = document.getElementById("rbLayoutMetaLines");
        var mainRadioC = document.getElementById("rbLayoutIonCSV");
        var dModeOptionsDiv = document.getElementById("dmodeoptions");
        // We need all of these, or the page is b0rken.
        if (mainRadioL == null || mainRadioC == null || dModeOptionsDiv == null) {
            return;
        }
        $(dModeOptionsDiv).addClass('off');
        if (mainRadioC.checked) {
            EDDLTD.interpretationMode = "ionCSV";
            // Ion Fragment / MS Peak files are always comma delimited	
            var rawdataformatp = document.getElementById("rawdataformatp");
            if (rawdataformatp) {
                rawdataformatp.selectedIndex = 1;
            }
            // Blanking these out is sufficient to re-enable all the flags
            EDDLTD.activeFlagsData = [];
            EDDLTD.activeFlagsXMarkers = [];
            EDDLTD.activeFlagsYMarkers = [];
            // Clear this out; we will rely on text matching of the header labels to line things up
            EDDLTD.metaDataPulldownSettings = {};
            // In the case of an Ion/CSV file, we do not present pre-existing data.		
            var textData = document.getElementById("textData");
            textData.value = textBoxContent;
            EDDLTD.parseAndDisplayText();
            return;
        }
        EDDLTD.interpretationMode = "metaData";
        $(dModeOptionsDiv).removeClass('off');
        // Here's the part where we populate the text area with the current data set.
        // A rather interesting procedure.  That hardest part is expanding the various arrays of data
        // into a grid, creating gaps where required.
        var p = document.getElementById("dlayoutp");
        if (p == null) {
            return;
        }
        if (p.value == "lbyd") {
            EDDLTD.metaDataAre = "rowsAreMeta";
        }
        else {
            EDDLTD.metaDataAre = "colsAreMeta";
        }
        // By default we do everything tab-delimited, so since we are repopulating the input area,
        // we should make sure the data format pulldown is set at "tab-separated".
        var rawdataformatp = document.getElementById("rawdataformatp");
        if (rawdataformatp) {
            rawdataformatp.selectedIndex = 0;
        }
        var lineIndexes = {};
        var metaIndexes = {};
        var tempGraphData = [];
        for (var o = 0; o < EDDData.EnabledLineIDs.length; o++) {
            i = EDDData.EnabledLineIDs[o];
            lineIndexes[i] = o;
        }
        for (var x = 0; x < EDDData.EnabledLineIDs.length; x++) {
            i = EDDData.EnabledLineIDs[x];
            var x = lineIndexes[i];
            if (typeof tempGraphData[x] == 'undefined') {
                tempGraphData[x] = [];
            }
            tempGraphData[x][0] = ''; // Filled in below
            tempGraphData[x][1] = EDDData.Lines[i].m;
            tempGraphData[x][2] = '';
            tempGraphData[x][3] = '';
            tempGraphData[x][4] = EDDData.Lines[i].con;
            // We have to be careful here because some of these values may be 0 or blank.
            var sID = EDDData.Lines[i].s;
            if (EDDData.Strains[sID]) {
                tempGraphData[x][0] = EDDData.Strains[sID].selectString;
            }
            var csArray = EDDData.Lines[i].cs; // Carbon Sources array of IDs
            if (csArray[0]) {
                tempGraphData[x][2] = EDDData.CSources[csArray[0]].selectString;
            }
            var exp = EDDData.Lines[i].exp;
            if (EDDData.Users[exp]) {
                tempGraphData[x][3] = EDDData.Users[exp].name;
            }
        }
        var j = 5;
        for (var x = 0; x < EDDData.MetaDataTypesRelevant.length; x++) {
            i = EDDData.MetaDataTypesRelevant[x];
            metaIndexes[i] = j;
            j++;
        }
        for (var i in EDDData.startMetaData) {
            var onePair = EDDData.startMetaData[i];
            var x = lineIndexes[onePair.lid];
            var y = metaIndexes[onePair.mdtid];
            var v = onePair.value;
            if (typeof tempGraphData[x] == 'undefined') {
                tempGraphData[x] = [];
            }
            tempGraphData[x][y] = v;
        }
        for (var x = 0; x < EDDData.EnabledLineIDs.length; x++) {
            var newSettings = {
                linkedline: 'new',
                setByUser: 0
            };
            EDDLTD.linePulldownSettings[x] = newSettings;
        }
        // This will create a chunk of defined objects in the middle of an array sequence.
        // The rest of the sequence will be filled out as needed, when parsing the pasted text in Step 2.
        // This is important to do because we need to make absolutely sure that the metadata we present
        // is lined up with the right pulldown items in Step 4.
        var parsingIndex = EDDLTD.generalLineDataTypes.length; // Just after the standard Line info
        for (var x = 0; x < EDDData.MetaDataTypesRelevant.length; x++) {
            var newSettings2 = {
                linkedMetadataType: 'md' + EDDData.MetaDataTypesRelevant[x],
                setByUser: 0
            };
            EDDLTD.metaDataPulldownSettings[parsingIndex + x] = newSettings2;
        }
        // Consolidate the general data types and the MetaData types into one list of labels,
        // for generating the table contents.
        var generalAndMeta = [];
        for (var o = 0; o < EDDLTD.generalLineDataTypes.length; o++) {
            generalAndMeta.push(EDDLTD.generalLineDataTypes[o]);
        }
        for (var x = 0; x < EDDData.MetaDataTypesRelevant.length; x++) {
            i = EDDData.MetaDataTypesRelevant[x];
            generalAndMeta.push(EDDData.MetaDataTypes[i].name);
        }
        // Now that we have the grid created, we can use it as the basis for
        // a tab-delimited chunk of text, similar to what we get when copying from Excel.
        // The last choice to make is between "rowsAreMeta" and "colsAreMeta".
        if (generalAndMeta.length > 0) {
            if (EDDLTD.metaDataAre == "colsAreMeta") {
                for (var y = 0; y < generalAndMeta.length; y++) {
                    textBoxContent = textBoxContent + "\t" + generalAndMeta[y].replace(/\t\t*/, '');
                }
                textBoxContent = textBoxContent + "\n";
                for (var x = 0; x < EDDData.EnabledLineIDs.length; x++) {
                    var lid = EDDData.EnabledLineIDs[x];
                    EDDLTD.activeFlagsData[x] = [];
                    textBoxContent = textBoxContent + EDDData.Lines[lid].n.replace(/\t\t*/, '');
                    for (var y = 0; y < generalAndMeta.length; y++) {
                        var v = '';
                        if (typeof tempGraphData[x] != 'undefined') {
                            if (typeof tempGraphData[x][y] != 'undefined') {
                                v = tempGraphData[x][y];
                            }
                        }
                        textBoxContent = textBoxContent + "\t" + v.replace(/\t\t*/, '');
                    }
                    if (x < (EDDData.EnabledLineIDs.length - 1)) {
                        textBoxContent = textBoxContent + "\n";
                    }
                }
            }
            else {
                for (var y = 0; y < EDDData.EnabledLineIDs.length; y++) {
                    lid = EDDData.EnabledLineIDs[y];
                    textBoxContent = textBoxContent + "\t" + EDDData.Lines[lid].n.replace(/\t\t*/, '');
                }
                textBoxContent = textBoxContent + "\n";
                for (var x = 0; x < generalAndMeta.length; x++) {
                    textBoxContent = textBoxContent + generalAndMeta[x].replace(/\t\t*/, '');
                    for (var y = 0; y < EDDData.EnabledLineIDs.length; y++) {
                        var v = '';
                        if (typeof tempGraphData[y] != 'undefined') {
                            if (typeof tempGraphData[y][x] != 'undefined') {
                                v = tempGraphData[y][x];
                            }
                        }
                        textBoxContent = textBoxContent + "\t" + v.replace(/\t\t*/, '');
                    }
                    if (x < (generalAndMeta.length - 1)) {
                        textBoxContent = textBoxContent + "\n";
                    }
                }
            }
        }
        // Blanking this out is sufficient to re-enable all the flags
        EDDLTD.activeFlagsData = [];
        var textData = document.getElementById("textData");
        textData.value = textBoxContent;
        EDDLTD.parseAndDisplayText();
    },
    // This gets called when there is a paste event.
    pastedRawData: function () {
        // We do this using a timeout so the rest of the paste events fire, and we get the pasted result.
        window.setTimeout(function () {
            var textData = document.getElementById("textData");
            var val = textData.value;
            var rawdataformatp = document.getElementById("rawdataformatp");
            if (rawdataformatp) {
                // If there are more tab characters than commas in the text
                if (val.split("\t").length >= val.split(",").length) {
                    rawdataformatp.selectedIndex = 0;
                }
                else {
                    rawdataformatp.selectedIndex = 1;
                }
            }
        }, 1);
    },
    parseAndDisplayText: function () {
        EDDLTD.graphData = [];
        EDDLTD.graphXMarkers = [];
        EDDLTD.graphYMarkers = [];
        var delimiter = "\t";
        var rawdataformatp = document.getElementById("rawdataformatp");
        if (!rawdataformatp) {
            console.log("Can't find data format pulldown");
            return;
        }
        else {
            if (rawdataformatp.selectedIndex == 1) {
                delimiter = ",";
            }
        }
        var textData = document.getElementById("textData");
        var data = textData.value;
        var unfilteredrows = data.split("\n");
        var multiColumn = 0;
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
        if (longestInitialRow > 1) {
            multiColumn = 1;
        }
        // You may ask - what would ever be the point of importing a single column,
        // since it would not carry any label indicators to associate each row with a time or a line?
        // Well, this page also creates lines as well as updates them.  Perhaps the user is just creating
        // a whole bunch of lines with no metadata.
        var rows = [];
        // If we are interpreting an Ion CSV file, we should shove a custom header onto the beginning of it.
        if (EDDLTD.interpretationMode == "ionCSV") {
            rows.push("Strain/Line Label" + delimiter + "Strain" + delimiter + "Line Label" + delimiter + "Induction" + delimiter + "Run Date" + delimiter + "Protocol" + delimiter + "Metabolite Type" + delimiter + "Measurement Time");
        }
        for (var y in unfilteredrows) {
            if (unfilteredrows[y] != "") {
                var cells = unfilteredrows[y].split(delimiter);
                if (cells.length > 0) {
                    rows.push(unfilteredrows[y]);
                }
            }
        }
        var longestRow = 0;
        for (var y in rows) {
            EDDLTD.graphData[parseInt(y) - 1] = [];
            var cells = rows[y].split(delimiter);
            // If it's the first row, assume it's full of X-axis labels
            if (parseInt(y) < 1) {
                for (var x in cells) {
                    // The 0,0th cell of the pasted data is ignored in multi-column situations
                    if (parseInt(x) < 1 && multiColumn) {
                    }
                    else {
                        var newxlabel = 'Unknown' + x;
                        if (cells[x]) {
                            newxlabel = cells[x];
                            newxlabel = newxlabel.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                        }
                        EDDLTD.graphXMarkers[parseInt(x) - multiColumn] = newxlabel;
                    }
                }
                if (EDDLTD.graphXMarkers.length > longestRow) {
                    longestRow = EDDLTD.graphXMarkers.length;
                }
            }
            else {
                if (!multiColumn) {
                    EDDLTD.graphYMarkers[parseInt(y) - 1] = 'Unknown' + y;
                    EDDLTD.graphData[parseInt(y) - 1][0] = cells.shift();
                }
                else {
                    var rowSize = 0;
                    var newGraphDataRow = [];
                    var newylabel = 'Unknown' + y;
                    // We need to disassemble and rearrange the row if we're parsing an Ion/CSV file.
                    if (EDDLTD.interpretationMode == "ionCSV") {
                        var fMeas = cells.shift();
                        var fRun = cells.shift();
                        var fPro = cells.shift();
                        var fStrain = cells.shift();
                        var fLine = cells.shift();
                        var fHour = cells.shift();
                        var fInd = cells.shift();
                        var fFile = cells.shift();
                        if ((typeof fStrain != 'undefined') && (typeof fLine != 'undefined')) {
                            newylabel = fStrain + "-" + fLine;
                        }
                        // Recreate the row based on extracted values
                        var reorderedRow = [fStrain, fLine, fInd, fRun, fPro, fMeas, fHour];
                        for (var x in reorderedRow) {
                            if (typeof reorderedRow[x] != 'undefined') {
                                newGraphDataRow.push(reorderedRow[x]);
                                rowSize++;
                            }
                        }
                        for (var x in cells) {
                            newGraphDataRow.push(cells[x]);
                            rowSize++;
                        }
                    }
                    else {
                        newylabel = cells.shift();
                        for (var x in cells) {
                            newGraphDataRow.push(cells[x]);
                            rowSize++;
                        }
                    }
                    newylabel = newylabel.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                    EDDLTD.graphYMarkers[parseInt(y) - 1] = newylabel;
                    EDDLTD.graphData[parseInt(y) - 1] = newGraphDataRow;
                    if (rowSize > longestRow) {
                        longestRow = rowSize;
                    }
                }
            }
        }
        // If the data extends beyond the provided headers, make up new headers.
        if (EDDLTD.graphXMarkers.length < longestRow) {
            var initialLength = EDDLTD.graphXMarkers.length;
            for (var r = initialLength; r < longestRow; r++) {
                // If we're reading an Ion CSV file, call the columns "Ratio"s instead of "Unknown".
                if (EDDLTD.interpretationMode == "ionCSV") {
                    EDDLTD.graphXMarkers[r] = 'Ratio' + ((r + 1) - initialLength);
                }
                else {
                    EDDLTD.graphXMarkers[r] = 'Unknown' + (r + 1);
                }
                EDDLTD.activeFlagsXMarkers[r] = 1;
            }
        }
        for (var i = 0; i < longestRow; i++) {
            if (typeof EDDLTD.metaDataPulldownSettings[i] == 'undefined') {
                var newSettings = {
                    linkedMetadataType: null,
                    setByUser: 0
                };
                EDDLTD.metaDataPulldownSettings[i] = newSettings;
            }
        }
        for (var x = 0; x < longestRow; x++) {
            if (typeof EDDLTD.activeFlagsData[x] == 'undefined') {
                EDDLTD.activeFlagsData[x] = [];
            }
            for (var y = 0; y < EDDLTD.graphYMarkers.length; y++) {
                if (typeof EDDLTD.activeFlagsData[x][y] == 'undefined') {
                    EDDLTD.activeFlagsData[x][y] = 1;
                }
            }
        }
        for (var x = 0; x < EDDLTD.graphXMarkers.length; x++) {
            if (typeof EDDLTD.activeFlagsXMarkers[x] == 'undefined') {
                EDDLTD.activeFlagsXMarkers[x] = 1;
            }
        }
        for (var y = 0; y < EDDLTD.graphYMarkers.length; y++) {
            if (typeof EDDLTD.activeFlagsYMarkers[y] == 'undefined') {
                EDDLTD.activeFlagsYMarkers[y] = 1;
            }
        }
        // Construct table cell objects for the page, based on our extracted data
        EDDLTD.tableDataObjects = [];
        EDDLTD.tableYHeaderObject = null;
        EDDLTD.tableXHeaderObjects = [];
        EDDLTD.tableYMarkerObjects = [];
        EDDLTD.tableXCheckboxObjects = [];
        EDDLTD.tableYCheckboxObjects = [];
        // The single header cell for the column representing the Y axis
        var aTD = document.createElement("td");
        aTD.className = 'yMarkerCell';
        aTD.setAttribute('x', 1);
        aTD.setAttribute('y', 1);
        EDDLTD.tableYHeaderObject = aTD;
        for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
            aTD = document.createElement("td");
            aTD.className = 'xHeaderCell';
            aTD.appendChild(document.createTextNode(EDDLTD.graphXMarkers[i]));
            aTD.setAttribute('x', 2 + i);
            aTD.setAttribute('y', 1);
            EDDLTD.tableXHeaderObjects[i] = aTD;
        }
        for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
            aTD = document.createElement("td");
            aTD.setAttribute('x', 2 + i);
            aTD.setAttribute('y', 0);
            aTD.className = 'xHeaderCell';
            var aCB = document.createElement("input");
            aCB.setAttribute('type', "checkbox");
            aCB.setAttribute('id', "enableColumn" + i);
            aCB.setAttribute('name', "enableColumn");
            aCB.setAttribute('value', i);
            if (EDDLTD.activeFlagsXMarkers[i]) {
                aCB.setAttribute('checked', "true");
            }
            aCB.setAttribute('onclick', "EDDLTD.toggleTableColumn(this);");
            aTD.appendChild(aCB);
            EDDLTD.tableXCheckboxObjects[i] = aTD;
        }
        for (var i = 0; i < EDDLTD.graphYMarkers.length; i++) {
            aTD = document.createElement("td");
            aTD.className = 'yMarkerCell';
            aTD.appendChild(document.createTextNode(EDDLTD.graphYMarkers[i]));
            aTD.setAttribute('x', 1);
            aTD.setAttribute('y', 2 + i);
            EDDLTD.tableYMarkerObjects[i] = aTD;
        }
        for (var i = 0; i < EDDLTD.graphYMarkers.length; i++) {
            aTD = document.createElement("td");
            aTD.setAttribute('x', 0);
            aTD.setAttribute('y', 2 + i);
            aTD.className = 'xHeaderCell';
            var aCB = document.createElement("input");
            aCB.setAttribute('type', "checkbox");
            aCB.setAttribute('id', "enableRow" + i);
            aCB.setAttribute('name', "enableRow");
            aCB.setAttribute('value', i);
            if (EDDLTD.activeFlagsYMarkers[i]) {
                aCB.setAttribute('checked', "true");
            }
            aCB.setAttribute('onclick', "EDDLTD.toggleTableRow(this);");
            aTD.appendChild(aCB);
            EDDLTD.tableYCheckboxObjects[i] = aTD;
        }
        for (var i = 0; i < EDDLTD.graphData.length; i++) {
            EDDLTD.tableDataObjects[i] = [];
            for (var j = 0; j < EDDLTD.graphData[i].length; j++) {
                aTD = document.createElement("td");
                aTD.appendChild(document.createTextNode(EDDLTD.graphData[i][j]));
                aTD.setAttribute('x', 2 + j);
                aTD.setAttribute('y', 2 + i);
                EDDLTD.tableDataObjects[i][j] = aTD;
            }
        }
        // Construct a table from the data cell objects,
        // creating adding additional cell objects for checkboxes.
        EDDLTD.tableRowObjects = [];
        EDDLTD.tableColObjects = [];
        var tableObject = document.createElement("table");
        tableObject.setAttribute('cellspacing', "0");
        var tBodyObject = document.createElement("tbody");
        // One of the objects here will be a column group, with col objects in it.
        // This is an interesting twist on DOM behavior that you should probably google.
        var colGroupObject = document.createElement("colgroup");
        tableObject.appendChild(colGroupObject);
        tableObject.appendChild(tBodyObject);
        // Start with two columns, at array indexes 0 and 1, for the checkboxes and X-axis indicators.
        var aCol = document.createElement("col");
        EDDLTD.tableColObjects[0] = aCol;
        colGroupObject.appendChild(aCol);
        var aCol = document.createElement("col");
        EDDLTD.tableColObjects[1] = aCol;
        colGroupObject.appendChild(aCol);
        for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
            var aCol = document.createElement("col");
            EDDLTD.tableColObjects[i + 2] = aCol;
            colGroupObject.appendChild(aCol);
        }
        // The first row: A line of checkboxes for columns
        var aRow = document.createElement("tr");
        EDDLTD.tableRowObjects[0] = aRow;
        tBodyObject.appendChild(aRow);
        // Empty corner cell
        aTD = document.createElement("td");
        aTD.style.width = "16px";
        aTD.setAttribute('x', 0);
        aTD.setAttribute('y', 0);
        aRow.appendChild(aTD);
        // Empty second cell at (1,0): we never want to disable the Y marker row
        aTD = document.createElement("td");
        aTD.setAttribute('x', 1);
        aTD.setAttribute('y', 0);
        aRow.appendChild(aTD);
        for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
            // Cells with a checkbox for enabling/disabling the column
            aRow.appendChild(EDDLTD.tableXCheckboxObjects[i]);
        }
        // The second row: The Y-axis marker title, and X-axis header titles.
        aRow = document.createElement("tr");
        EDDLTD.tableRowObjects[1] = aRow;
        tBodyObject.appendChild(aRow);
        // Empty second cell at (0,1): we never want to disable the X header title row.
        aTD = document.createElement("td");
        aTD.style.width = "16px";
        aTD.setAttribute('x', 0);
        aTD.setAttribute('y', 1);
        aRow.appendChild(aTD);
        aRow.appendChild(EDDLTD.tableYHeaderObject);
        for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
            aRow.appendChild(EDDLTD.tableXHeaderObjects[i]);
        }
        for (var i = 0; i < EDDLTD.graphYMarkers.length; i++) {
            aRow = document.createElement("tr");
            EDDLTD.tableRowObjects[i + 2] = aRow;
            tBodyObject.appendChild(aRow);
            // The cell with the checkbox for enabling/disabling the row
            aRow.appendChild(EDDLTD.tableYCheckboxObjects[i]);
            aRow.appendChild(EDDLTD.tableYMarkerObjects[i]);
            for (var j = 0; j < EDDLTD.tableDataObjects[i].length; j++) {
                aRow.appendChild(EDDLTD.tableDataObjects[i][j]);
            }
        }
        var dataTableDiv = document.getElementById("dataTableDiv");
        while (dataTableDiv.firstChild) {
            dataTableDiv.removeChild(dataTableDiv.firstChild);
        }
        dataTableDiv.appendChild(tableObject);
        // Interpret the data in Step 3,
        // which involves swapping the axes if necessary,
        // skipping disabled rows or columns,
        // and leaving out any values that have been individually flagged.
        EDDLTD.interpretDataTable();
        // Update the styles of the new table to reflect the
        // (possibly previously set) flag markers.
        EDDLTD.redrawEnabledFlagMarkers();
        // Now that we're got the table from Step 3 built,
        // we turn to the table in Step 4:  A set of rows, one for each set of data,
        // where the user can fill out additional information linking each set to pre-existing EDD data.
        EDDLTD.remakeInfoTable();
    },
    toggleTableRow: function (box) {
        var val = parseInt(box.getAttribute('value'));
        if (box.checked) {
            EDDLTD.activeFlagsYMarkers[val] = 1;
        }
        else {
            EDDLTD.activeFlagsYMarkers[val] = 0;
        }
        EDDLTD.interpretDataTable();
        EDDLTD.redrawEnabledFlagMarkers();
        // Resetting a disabled row may change the number of rows listed in the Info table.
        EDDLTD.remakeInfoTable();
    },
    toggleTableColumn: function (box) {
        var val = parseInt(box.getAttribute('value'));
        var col = EDDLTD.tableColObjects[val + 2];
        if (col) {
            if (box.checked) {
                EDDLTD.activeFlagsXMarkers[val] = 1;
            }
            else {
                EDDLTD.activeFlagsXMarkers[val] = 0;
            }
            EDDLTD.interpretDataTable();
            EDDLTD.redrawEnabledFlagMarkers();
            // Resetting a disabled column may change the number of rows listed in the Info table.
            EDDLTD.remakeInfoTable();
        }
    },
    resetEnabledFlagMarkers: function () {
        for (var x = 0; x < EDDLTD.graphXMarkers.length; x++) {
            EDDLTD.activeFlagsData[x] = [];
            for (var y = 0; y < EDDLTD.graphYMarkers.length; y++) {
                EDDLTD.activeFlagsData[x][y] = 1;
            }
        }
        for (var x = 0; x < EDDLTD.graphXMarkers.length; x++) {
            EDDLTD.activeFlagsXMarkers[x] = 1;
        }
        for (var y = 0; y < EDDLTD.graphYMarkers.length; y++) {
            EDDLTD.activeFlagsYMarkers[y] = 1;
        }
        for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
            var aCB = document.getElementById("enableColumn" + i);
            if (aCB != null) {
                aCB.checked = true;
            }
        }
        for (var i = 0; i < EDDLTD.graphYMarkers.length; i++) {
            var aCB = document.getElementById("enableRow" + i);
            if (aCB != null) {
                aCB.checked = true;
            }
        }
        EDDLTD.interpretDataTable();
        EDDLTD.redrawEnabledFlagMarkers();
        EDDLTD.remakeInfoTable();
    },
    redrawEnabledFlagMarkers: function () {
        for (var j = 0; j < EDDLTD.tableDataObjects.length; j++) {
            for (var i = 0; i < EDDLTD.tableDataObjects[j].length; i++) {
                var aTD = EDDLTD.tableDataObjects[j][i];
                aTD.className = aTD.className.replace(" disabledLine", "");
                if (!EDDLTD.activeFlagsData[i][j] || !EDDLTD.activeFlagsXMarkers[i] || !EDDLTD.activeFlagsYMarkers[j]) {
                    aTD.className = aTD.className + " disabledLine";
                }
            }
        }
        for (var i = 0; i < EDDLTD.tableXHeaderObjects.length; i++) {
            var aTD = EDDLTD.tableXHeaderObjects[i];
            aTD.className = aTD.className.replace(" disabledLine", "");
            if (!EDDLTD.activeFlagsXMarkers[i]) {
                aTD.className = aTD.className + " disabledLine";
            }
        }
        for (var i = 0; i < EDDLTD.tableYMarkerObjects.length; i++) {
            var aTD = EDDLTD.tableYMarkerObjects[i];
            aTD.className = aTD.className.replace(" disabledLine", "");
            if (!EDDLTD.activeFlagsYMarkers[i]) {
                aTD.className = aTD.className + " disabledLine";
            }
        }
    },
    interpretDataTable: function () {
        EDDLTD.parsedDataSets = [];
        EDDLTD.metaDataSegmentFlags = [];
        EDDLTD.metaDataSegmentLabels = [];
        if ((EDDLTD.metaDataAre == "colsAreMeta") || (EDDLTD.interpretationMode == "ionCSV")) {
            for (var i = 0; i < EDDLTD.graphYMarkers.length; i++) {
                if (EDDLTD.activeFlagsYMarkers[i]) {
                    var newSet = {
                        label: '' + i + EDDLTD.graphYMarkers[i],
                        name: EDDLTD.graphYMarkers[i],
                        i: i,
                        data: {}
                    };
                    for (var j = 0; j < EDDLTD.graphXMarkers.length; j++) {
                        if (EDDLTD.activeFlagsXMarkers[j] && EDDLTD.activeFlagsData[j][i]) {
                            var y = EDDLTD.graphData[i][j];
                            if (typeof y != 'undefined') {
                                newSet.data[j] = y;
                            }
                        }
                    }
                    EDDLTD.parsedDataSets.push(newSet);
                }
            }
            for (var j = 0; j < EDDLTD.graphXMarkers.length; j++) {
                EDDLTD.metaDataSegmentLabels.push(EDDLTD.graphXMarkers[j]);
                if (EDDLTD.activeFlagsXMarkers[j]) {
                    EDDLTD.metaDataSegmentFlags.push(1);
                }
                else {
                    EDDLTD.metaDataSegmentFlags.push(0);
                }
            }
        }
        else if (EDDLTD.metaDataAre == "rowsAreMeta") {
            for (var i = 0; i < EDDLTD.graphXMarkers.length; i++) {
                if (EDDLTD.activeFlagsXMarkers[i]) {
                    var newSet = {
                        label: '' + i + EDDLTD.graphXMarkers[i],
                        name: EDDLTD.graphXMarkers[i],
                        i: i,
                        data: {}
                    };
                    for (var j = 0; j < EDDLTD.graphYMarkers.length; j++) {
                        if (EDDLTD.activeFlagsYMarkers[j] && EDDLTD.activeFlagsData[i][j]) {
                            var y = EDDLTD.graphData[j][i];
                            if (typeof y != 'undefined') {
                                newSet.data[j] = y;
                            }
                        }
                    }
                    EDDLTD.parsedDataSets.push(newSet);
                }
            }
            for (var j = 0; j < EDDLTD.graphYMarkers.length; j++) {
                EDDLTD.metaDataSegmentLabels.push(EDDLTD.graphYMarkers[j]);
                if (EDDLTD.activeFlagsYMarkers[j]) {
                    EDDLTD.metaDataSegmentFlags.push(1);
                }
                else {
                    EDDLTD.metaDataSegmentFlags.push(0);
                }
            }
        }
    },
    // Create the Step 4 table:  A set of rows, one for each y-axis column of data,
    // where the user can fill out additional information for the pasted table.
    remakeInfoTable: function () {
        var labelDByL = document.getElementById('step4labeldbyl');
        var labelLByD = document.getElementById('step4labellbyd');
        var labelIonCSV = document.getElementById('step4labelioncsv');
        EDDLTD.lineMetaChoiceElements = [];
        // Initially hide all the Step 4 title bars so we can reveal just the one we need later
        $(labelDByL).addClass('off');
        $(labelLByD).addClass('off');
        $(labelIonCSV).addClass('off');
        // Reconstruct the assays table, respecting the 'disabled' flags from
        // the previous step.
        var tableObject = document.createElement("table");
        tableObject.setAttribute('cellspacing', "0");
        var tBodyObject = document.createElement("tbody");
        tableObject.appendChild(tBodyObject);
        // Decide what the headers will look like
        var infoTableHeaderLabels;
        if (EDDLTD.interpretationMode == "metaData") {
            if (EDDLTD.metaDataAre == "rowsAreMeta") {
                infoTableHeaderLabels = ['Column'];
                $(labelLByD).removeClass('off');
            }
            else {
                infoTableHeaderLabels = ['Row'];
                $(labelDByL).removeClass('off');
            }
        }
        else if (EDDLTD.interpretationMode == "ionCSV") {
            infoTableHeaderLabels = ['Strain / Line Label'];
            $(labelIonCSV).removeClass('off');
        }
        infoTableHeaderLabels.push('Line');
        // Build the initial row of headers
        var aRow = document.createElement("tr");
        tBodyObject.appendChild(aRow);
        for (var i = 0; i < infoTableHeaderLabels.length; i++) {
            var aTD = document.createElement("td");
            aTD.className = 'infoHeaderCell';
            aTD.appendChild(document.createTextNode(infoTableHeaderLabels[i]));
            aRow.appendChild(aTD);
        }
        var seenLabels = {};
        for (var key in EDDLTD.parsedDataSets) {
            var oneSet = EDDLTD.parsedDataSets[key];
            var n = oneSet.name;
            if (EDDLTD.interpretationMode == "ionCSV") {
                // Skip the label if we've seen it before
                if (typeof seenLabels[n] != 'undefined') {
                    continue;
                }
                seenLabels[n] = 1;
            }
            aRow = document.createElement("tr");
            tBodyObject.appendChild(aRow);
            // The cell reproducing the label
            var aTD = document.createElement("td");
            aTD.className = 'infoDataLabelCell';
            aRow.appendChild(aTD);
            var aLD = document.createElement("div");
            aLD.setAttribute('id', oneSet.label + "Label");
            if (oneSet.color) {
                aLD.style.backgroundColor = oneSet.color;
                aLD.style.color = "#FFF";
            }
            aTD.appendChild(aLD);
            aLD.appendChild(document.createTextNode(n));
            // The cell with the Line dropdown
            aTD = document.createElement("td");
            aTD.className = 'infoTableInfoCell';
            aRow.appendChild(aTD);
            var elementName = 'set' + key + 'line';
            // We're adding to a JSON structure that pairs the values we wish to
            // disambiguate with the input elements that track the user's choices.
            var oneInput = {
                t: 'line',
                i: key,
                l: n,
                e: elementName
            };
            EDDLTD.lineMetaChoiceElements.push(oneInput);
            var aSEL = document.createElement("select");
            aSEL.setAttribute('name', elementName);
            // An onclick callback to update the relevant piece of the data structure
            var oc = "EDDLTD.linePulldownSettings[" + key + "].linkedline = this.value;";
            oc = oc + "EDDLTD.linePulldownSettings[" + key + "].setByUser = 1;";
            aSEL.setAttribute('onclick', oc);
            aTD.appendChild(aSEL);
            var lookForBestValueMatch = 1;
            var bestValueMatch = null;
            if (typeof EDDLTD.linePulldownSettings[key] != 'undefined') {
                if (EDDLTD.linePulldownSettings[key].setByUser == 1) {
                    bestValueMatch = EDDLTD.linePulldownSettings[key].linkedline;
                    lookForBestValueMatch = 0;
                }
            }
            if (lookForBestValueMatch) {
                bestValueMatch = 'new';
                for (var o = 0; o < EDDData.EnabledLineIDs.length; o++) {
                    key = EDDData.EnabledLineIDs[o];
                    n = EDDData.Lines[key].n;
                    if (n == oneSet.name) {
                        bestValueMatch = key;
                        break;
                    }
                }
            }
            var aOPT = document.createElement("option");
            aOPT.setAttribute('value', '0');
            aOPT.appendChild(document.createTextNode("--"));
            aSEL.appendChild(aOPT);
            aOPT = document.createElement("option");
            aOPT.setAttribute('value', 'new');
            aOPT.appendChild(document.createTextNode("(Create New)"));
            if (bestValueMatch == 'new') {
                aOPT.setAttribute('selected', 'selected');
            }
            aSEL.appendChild(aOPT);
            for (var o = 0; o < EDDData.EnabledLineIDs.length; o++) {
                key = EDDData.EnabledLineIDs[o];
                aOPT = document.createElement("option");
                aOPT.setAttribute('value', key.toString());
                if (key == bestValueMatch) {
                    aOPT.setAttribute('selected', 'selected');
                }
                n = EDDData.Lines[key].n;
                aOPT.appendChild(document.createTextNode(n));
                aSEL.appendChild(aOPT);
            }
        }
        var colInfoTableDiv = document.getElementById("colInfoTableDiv");
        while (colInfoTableDiv.firstChild) {
            colInfoTableDiv.removeChild(colInfoTableDiv.firstChild);
        }
        colInfoTableDiv.appendChild(tableObject);
        //
        // Reconstruct the metadata table, in similar fashion, or just destroy it if necessary.
        //
        var colInfoTableDivB = document.getElementById("colInfoTableDivB");
        while (colInfoTableDivB.firstChild) {
            colInfoTableDivB.removeChild(colInfoTableDivB.firstChild);
        }
        tableObject = document.createElement("table");
        tableObject.setAttribute('cellspacing', "0");
        tBodyObject = document.createElement("tbody");
        tableObject.appendChild(tBodyObject);
        // Decide what the headers will look like
        infoTableHeaderLabels = [];
        if ((EDDLTD.metaDataAre == "colsAreMeta") || (EDDLTD.interpretationMode == "ionCSV")) {
            infoTableHeaderLabels = ['Column'];
        }
        else {
            infoTableHeaderLabels = ['Row'];
        }
        infoTableHeaderLabels.push('Data / Metadata Type');
        // Build the initial row of headers
        aRow = document.createElement("tr");
        tBodyObject.appendChild(aRow);
        for (var i = 0; i < infoTableHeaderLabels.length; i++) {
            var aTD = document.createElement("td");
            aTD.className = 'infoHeaderCell';
            aTD.appendChild(document.createTextNode(infoTableHeaderLabels[i]));
            aRow.appendChild(aTD);
        }
        for (var key in EDDLTD.metaDataSegmentLabels) {
            var enabled = EDDLTD.metaDataSegmentFlags[key];
            if (!enabled) {
                continue;
            }
            var mlabel = EDDLTD.metaDataSegmentLabels[key];
            aRow = document.createElement("tr");
            tBodyObject.appendChild(aRow);
            // The cell reproducing the label
            var aTD = document.createElement("td");
            aTD.className = 'infoDataLabelCell';
            aRow.appendChild(aTD);
            var aLD = document.createElement("div");
            aLD.setAttribute('id', mlabel + "Label");
            aTD.appendChild(aLD);
            aLD.appendChild(document.createTextNode(mlabel));
            // The cell with the dropdown
            aTD = document.createElement("td");
            aTD.className = 'infoTableInfoCell';
            aRow.appendChild(aTD);
            var elementName = 'sec' + key + 'datatype';
            // We're adding to a JSON structure that pairs the values we wish to
            // disambiguate with the input elements that track the user's choices.
            var oneInput = {
                t: 'meta',
                i: key,
                l: mlabel,
                e: elementName
            };
            EDDLTD.lineMetaChoiceElements.push(oneInput);
            var aSEL = document.createElement("select");
            aSEL.setAttribute('name', 'sec' + key + 'datatype');
            aSEL.setAttribute('id', 'sec' + key + 'datatype');
            // An onclick callback to update the relevant piece of the data structure
            var oc = "EDDLTD.metaDataPulldownSettings[" + key + "].linkedMetadataType = this.value;";
            oc = oc + "EDDLTD.metaDataPulldownSettings[" + key + "].setByUser = 1;";
            oc = oc + "EDDLTD.remakeDisambiguationTable();";
            aSEL.setAttribute('onclick', oc);
            aTD.appendChild(aSEL);
            var aOPT = document.createElement("option");
            aOPT.setAttribute('value', '0');
            aOPT.appendChild(document.createTextNode("--"));
            aSEL.appendChild(aOPT);
            var lookForBestValueMatch = 1;
            var bestValueMatch = EDDLTD.metaDataPulldownSettings[key].linkedMetadataType;
            if (EDDLTD.metaDataPulldownSettings[key].setByUser == 1) {
                lookForBestValueMatch = 0;
            }
            if (EDDLTD.interpretationMode == "ionCSV") {
                // If the label begins with the substring "Ratio",
                // hack in a search against "Measurement" instead.
                if (mlabel.indexOf("Ratio") == 0) {
                    mlabel = "Measurement";
                }
            }
            if (lookForBestValueMatch) {
                for (var o = 0; o < EDDLTD.generalLineDataTypes.length; o++) {
                    if (EDDLTD.generalLineDataTypes[o] == mlabel) {
                        bestValueMatch = EDDLTD.generalLineDataTypeLabels[o];
                        lookForBestValueMatch = 0;
                        break;
                    }
                }
            }
            if (lookForBestValueMatch) {
                for (var o = 0; o < EDDData.MetaDataTypeIDs.length; o++) {
                    var p = EDDData.MetaDataTypeIDs[o];
                    var n = EDDData.MetaDataTypes[p].name;
                    if (n == mlabel) {
                        bestValueMatch = 'md' + p;
                        break;
                    }
                }
            }
            if (lookForBestValueMatch) {
                for (var o = 0; o < EDDLTD.generalAssayDataTypes.length; o++) {
                    if (EDDLTD.generalAssayDataTypes[o] == mlabel) {
                        bestValueMatch = EDDLTD.generalAssayDataTypeLabels[o];
                        lookForBestValueMatch = 0;
                        break;
                    }
                }
            }
            for (var o = 0; o < EDDLTD.generalLineDataTypes.length; o++) {
                var v = EDDLTD.generalLineDataTypeLabels[o];
                aOPT = document.createElement("option");
                aOPT.setAttribute('value', v);
                if (bestValueMatch != null) {
                    if (bestValueMatch == v) {
                        aOPT.setAttribute('selected', 'selected');
                    }
                }
                aOPT.appendChild(document.createTextNode(EDDLTD.generalLineDataTypes[o]));
                aSEL.appendChild(aOPT);
            }
            var aGRP = document.createElement("optgroup");
            if (EDDLTD.interpretationMode == "metaData") {
                aGRP.setAttribute('label', 'Metadata');
            }
            else if (EDDLTD.interpretationMode == "ionCSV") {
                aGRP.setAttribute('label', 'Metadata For Lines');
            }
            aSEL.appendChild(aGRP);
            for (var o = 0; o < EDDData.MetaDataTypeIDs.length; o++) {
                var p = EDDData.MetaDataTypeIDs[o];
                var n = EDDData.MetaDataTypes[p].name;
                // If it's not a line-level metadata type, skip it
                if (!EDDData.MetaDataTypes[p].ll) {
                    continue;
                }
                var v = 'md' + p;
                aOPT = document.createElement("option");
                aOPT.setAttribute('value', 'l' + v);
                if (bestValueMatch != null) {
                    if (bestValueMatch == v) {
                        aOPT.setAttribute('selected', 'selected');
                    }
                }
                aOPT.appendChild(document.createTextNode(n));
                aGRP.appendChild(aOPT);
            }
            // If we're in ionCSV mode, go on adding to the pulldown 
            if (EDDLTD.interpretationMode == "ionCSV") {
                for (var o = 0; o < EDDLTD.generalAssayDataTypes.length; o++) {
                    var v = EDDLTD.generalAssayDataTypeLabels[o];
                    aOPT = document.createElement("option");
                    aOPT.setAttribute('value', v);
                    if (bestValueMatch != null) {
                        if (bestValueMatch == v) {
                            aOPT.setAttribute('selected', 'selected');
                        }
                    }
                    aOPT.appendChild(document.createTextNode(EDDLTD.generalAssayDataTypes[o]));
                    aSEL.appendChild(aOPT);
                }
                aGRP = document.createElement("optgroup");
                aGRP.setAttribute('label', 'Metadata For Assays');
                aSEL.appendChild(aGRP);
                for (var o = 0; o < EDDData.MetaDataTypeIDs.length; o++) {
                    var p = EDDData.MetaDataTypeIDs[o];
                    var n = EDDData.MetaDataTypes[p].name;
                    // If it's not an assay-level metadata type, skip it
                    if (!EDDData.MetaDataTypes[p].pl) {
                        continue;
                    }
                    var v = 'md' + p;
                    aOPT = document.createElement("option");
                    aOPT.setAttribute('value', 'a' + v);
                    if (bestValueMatch != null) {
                        if (bestValueMatch == v) {
                            aOPT.setAttribute('selected', 'selected');
                        }
                    }
                    aOPT.appendChild(document.createTextNode(n));
                    aGRP.appendChild(aOPT);
                }
            }
        }
        colInfoTableDivB.appendChild(tableObject);
        EDDLTD.remakeDisambiguationTable();
    },
    // Create the Step 5 table:  A set of columns, for Strains, Carbon Sources, and Experimenters,
    // with input fields for all the unique values detected in each, along with the best guesses about
    // pre-existing records in the database.
    remakeDisambiguationTable: function () {
        var typesToCheck = ['strain', 'carbonsource', 'experimenter', 'metabolite'];
        // If a user (or the page) has declared any of the columns to be for the
        // above data types, we will note the left-most selections.
        // If we pass through and find no selections, then we do not create a disambiguation table
        // for that data type.
        var disTableHeaderLabels = [];
        var disTableChoiceTables = [];
        EDDLTD.disambiguationElements = [];
        for (var tci = 0; tci < typesToCheck.length; tci++) {
            var typeToCheck = typesToCheck[tci];
            var foundColumn = null;
            for (var i in EDDLTD.metaDataSegmentLabels) {
                var enabled = EDDLTD.metaDataSegmentFlags[i];
                if (!enabled) {
                    continue;
                }
                var s = document.getElementById('sec' + i + 'datatype');
                if (!s) {
                    continue;
                }
                var t = s.value;
                if (t == typeToCheck) {
                    if (foundColumn == null) {
                        foundColumn = i;
                    }
                    else if (foundColumn > i) {
                        foundColumn = i;
                    }
                }
            }
            if (foundColumn == null) {
                continue;
            }
            var vSeen = {};
            var vSet = [];
            for (var i in EDDLTD.parsedDataSets) {
                var oneSet = EDDLTD.parsedDataSets[i];
                var v = oneSet.data[foundColumn];
                if (typeof v == 'undefined') {
                    continue;
                }
                // Leaving edge whitespace in would mess up our matching attempts
                v = v.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                if (v == "") {
                    continue;
                }
                // Add the value to the array only if we haven't seen it before.
                if (typeof vSeen[v] == 'undefined') {
                    vSeen[v] = 1;
                    vSet.push(v);
                }
            }
            if (vSet.length) {
                if (typeToCheck == "strain") {
                    disTableHeaderLabels.push('Strains');
                }
                else if (typeToCheck == "carbonsource") {
                    disTableHeaderLabels.push('Carbon Sources');
                }
                else if (typeToCheck == "experimenter") {
                    disTableHeaderLabels.push('Experimenters');
                }
                else if (typeToCheck == "metabolite") {
                    disTableHeaderLabels.push('Metabolite Types');
                }
                var strainTableObject = document.createElement("table");
                strainTableObject.setAttribute('cellspacing', "0");
                var strainBodyObject = document.createElement("tbody");
                strainTableObject.appendChild(strainBodyObject);
                for (var vi = 0; vi < vSet.length; vi++) {
                    var v = vSet[vi];
                    var elementName = typeToCheck + 'da' + vi;
                    // We're adding to a JSON structure that pairs the values we wish to
                    // disambiguate with the input elements that track the user's choices.
                    var oneInput = {
                        t: typeToCheck,
                        v: v,
                        e: elementName
                    };
                    EDDLTD.disambiguationElements.push(oneInput);
                    var aRow = document.createElement("tr");
                    strainBodyObject.appendChild(aRow);
                    var aTD = document.createElement("td");
                    aTD.className = 'disamDataCell';
                    aRow.appendChild(aTD);
                    var aDiv = document.createElement("div");
                    aTD.appendChild(aDiv);
                    aDiv.appendChild(document.createTextNode(v));
                    aTD = document.createElement("td");
                    aTD.className = 'disamDataCell';
                    aRow.appendChild(aTD);
                    var inObject = document.createElement("input");
                    inObject.className = 'autocomplete';
                    inObject.setAttribute('autocomplete', "off");
                    inObject.setAttribute('type', "text");
                    if (typeToCheck == "strain") {
                        inObject.setAttribute('autocompletetype', "strain");
                        inObject.setAttribute('size', "74");
                    }
                    else if (typeToCheck == "carbonsource") {
                        inObject.setAttribute('autocompletetype', "carbonsource");
                        inObject.setAttribute('size', "61");
                    }
                    else if (typeToCheck == "experimenter") {
                        inObject.setAttribute('autocompletetype', "user");
                        inObject.setAttribute('size', "27");
                    }
                    else if (typeToCheck == "metabolite") {
                        inObject.setAttribute('autocompletetype', "metabolite");
                        inObject.setAttribute('size', "52");
                    }
                    inObject.setAttribute('autocompletevalue', elementName + "value");
                    inObject.setAttribute('name', elementName);
                    inObject.setAttribute('id', elementName);
                    inObject.setAttribute('value', v);
                    aTD.appendChild(inObject);
                    var inHiddenInObject = document.createElement("input");
                    inHiddenInObject.setAttribute('type', "hidden");
                    inHiddenInObject.setAttribute('id', elementName + "value");
                    inHiddenInObject.setAttribute('name', elementName + "value");
                    inHiddenInObject.setAttribute('value', "");
                    aTD.appendChild(inHiddenInObject);
                }
                disTableChoiceTables.push(strainTableObject);
            }
        }
        //
        // Reconstruct the table of tables, respecting the settings from Step 3 and 4.
        //
        var tableObject = document.createElement("table");
        tableObject.setAttribute('cellspacing', "0");
        var tBodyObject = document.createElement("tbody");
        tableObject.appendChild(tBodyObject);
        for (var i = 0; i < disTableHeaderLabels.length; i++) {
            aRow = document.createElement("tr");
            tBodyObject.appendChild(aRow);
            // Build the initial row of headers
            aTD = document.createElement("td");
            aTD.className = 'disamHeaderCell';
            aTD.appendChild(document.createTextNode(disTableHeaderLabels[i]));
            aRow.appendChild(aTD);
            aRow = document.createElement("tr");
            tBodyObject.appendChild(aRow);
            // Embed the previously constructed disambiguation tables
            aTD = document.createElement("td");
            aTD.style.verticalAlign = "top";
            aRow.appendChild(aTD);
            aTD.appendChild(disTableChoiceTables[i]);
        }
        var disTableDiv = document.getElementById("disambiguationTableDiv");
        var disTableNoneDiv = document.getElementById("disambiguationTableNoneDiv");
        while (disTableDiv.firstChild) {
            disTableDiv.removeChild(disTableDiv.firstChild);
        }
        // If we have any columns to show, link in the table and hide the 'none' label
        if (disTableHeaderLabels.length) {
            disTableDiv.appendChild(tableObject);
            $(disTableNoneDiv).addClass('off');
        }
        else {
            $(disTableNoneDiv).removeClass('off');
        }
        for (var ae = 0; ae < EDDLTD.disambiguationElements.length; ae++) {
            var record = EDDLTD.disambiguationElements[ae];
            var elementName = record.e;
            var inObject2 = document.getElementById(elementName);
            EDDAutoComplete.initializeElement(inObject2);
            inObject2.autocompleter.setFromPrimaryElement();
        }
    },
    highlighterF: function (e) {
        var e = e || window.event;
        var obj = e.srcElement || e.target;
        var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
        while (tn != "td" && tn != "tbody" && obj.type != undefined) {
            obj = obj.parentNode || obj.parentElement;
            if (obj.type != undefined) {
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
                var row = obj.parentNode;
                var col = EDDLTD.tableColObjects[x];
                switch (e.type) {
                    case 'mouseover':
                        col.className = col.className + " browseLines";
                        row.className = row.className + " browseLines";
                        break;
                    case 'mouseout':
                        col.className = col.className.replace(" browseLines", "");
                        row.className = row.className.replace(" browseLines", "");
                        break;
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
                if ((x > 1) && (y > 1)) {
                    x = x - 2;
                    y = y - 2;
                    if (EDDLTD.activeFlagsData[x][y]) {
                        EDDLTD.activeFlagsData[x][y] = 0;
                    }
                    else {
                        EDDLTD.activeFlagsData[x][y] = 1;
                    }
                    EDDLTD.interpretDataTable();
                    EDDLTD.redrawEnabledFlagMarkers();
                }
            }
        }
    },
    generateFormSubmission: function () {
        var dest = document.getElementById("parsedlinesjson");
        if (!dest) {
            return;
        }
        var finalData = JSON.stringify(EDDLTD.parsedDataSets);
        dest.value = finalData;
        var lineMetaEl = document.getElementById("linemetachoicesjson");
        if (!lineMetaEl) {
            return;
        }
        var lineMeta = JSON.stringify(EDDLTD.lineMetaChoiceElements);
        lineMetaEl.value = lineMeta;
        var disArrayEl = document.getElementById("disambiguationsjson");
        if (!disArrayEl) {
            return;
        }
        var disArray = JSON.stringify(EDDLTD.disambiguationElements);
        disArrayEl.value = disArray;
        var debugArea = document.getElementById("jsondebugarea");
        if (debugArea) {
            debugArea.value = finalData + "\n\n" + lineMeta + "\n\n" + disArray;
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
        textData.addEventListener("paste", EDDLTD.pastedRawData);
        textData.addEventListener("keyup", EDDLTD.parseAndDisplayText);
        textData.addEventListener("keydown", EDDLTD.suppressNormalTab);
        var dataTableDiv = document.getElementById("dataTableDiv");
        dataTableDiv.addEventListener("mouseover", EDDLTD.highlighterF);
        dataTableDiv.addEventListener("mouseout", EDDLTD.highlighterF);
        dataTableDiv.addEventListener("dblclick", EDDLTD.singleValueDisablerF);
        // We need to make sure we're
        // tracking the minimum number of elements with this call, since the
        // function called has such strong effects on the rest of the page.
        // For example, a user should be free to change "merge" to "replace" without having
        // their edits in Step 2 erased.
        // Using "change" because it's more efficient AND because it works around an irritating Chrome inconsistency
        $("#dlayoutp").change(EDDLTD.queueProcessImportSettings);
        $("#rbLayoutMetaLines").click(EDDLTD.queueProcessImportSettings);
        $("#rbLayoutIonCSV").click(EDDLTD.queueProcessImportSettings);
        EDDLTD.processImportSettings();
    }
};
window.addEventListener('load', EDDLTD.prepareIt, false);
//# sourceMappingURL=LineTableData.js.map