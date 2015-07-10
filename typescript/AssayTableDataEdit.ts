var EDDATD:any;

EDDATD = {

// The main mode we are interpreting data in.
// Valid values are "metaboliteData", "transcriptionData" and "metaData"
interpretationMode:"metaboliteData",

StartData:{
	Metabolites:{
		sets:[],			// The data sets gathered up from the standard JSON include
		allTimestamps:[],	// A sorted, de-duped list of all timestamps across all selected measurement data
		allALabels:[],		// Assay Labels
		allCLabels:[],		// Measurement Compartment Labels
		allMLabels:[],		// Metabolite Type Labels
		allULabels:[],		// Measurement Unit Labels
		tempGraphData:[],	// Raw data grid	
	},
	Transcriptions:{
		sets:[],			// The data sets gathered up from the standard JSON include
		allTimestamps:[],	// A sorted, de-duped list of all timestamps across all selected measurement data
		allALabels:[],		// Assay Labels
		allMLabels:[],		// Metabolite Type Labels
		tempGraphData:[],	// Raw data grid
	},
	Proteins:{
		sets:[],			// The data sets gathered up from the standard JSON include
		allTimestamps:[],	// A sorted, de-duped list of all timestamps across all selected measurement data
		allALabels:[],		// Assay Labels
		allMLabels:[],		// Metabolite Type Labels
		tempGraphData:[],	// Raw data grid	
	},
	Metadata:{
		tempMetaData:[]		// Raw data grid for metadata	
	}
},

Grid:{
	data:[],
	colMarkers:[],
	w:0,
	l:0,
	transpose:0,
	// If the user deliberately chose to transpose or not transpose, disable the attempt to auto-determine transposition.
	userClickedOnTranspose:0,
	// Whether to interpret the pasted data row-wise or column-wise, when importing either measurements or metadata.
	ignoreDataGaps:1,
	userClickedOnIgnoreDataGaps:0
},

// Used to assemble and display the table components in Step 3

Table:{
	cornerCells:[],
	rowPulldownCells:[],
	colLabelCells:[],
	colCheckboxCells:[],
	rowCheckboxCells:[],
	colObjects:[],
	dataCells:[],

	// We keep a single flag for each data point [y,x]
	// as well as two linear sets of flags for enabling or disabling
	// entire columns/rows.
	activeColFlags:[],
	activeRowFlags:[],
	activeFlags:[]
},

// Data structures pulled from the grid and composed into sets suitable for handing to the EDD server

Sets:{
	parsedSets:[],
	uniqueAssayLineNames:[],
	uniqueMeasurementHashNames:[],
	uniqueMetadataNames:[],
	seenAnyTimestamps:0	// A flag to indicate whether we need the user to select a measurement type
},

// Storage area for disambiguation-related UI widgets and information

Disam:{
	// These objects hold string keys that correspond to unique names found during parsing.
	// The string keys point to existing autocomplete objects created specifically for those strings.
	// As the disambiguation section is destroyed and remade, any selections the user has already set
	// will persevere.
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


processImportSettingsTimerID:0,
graphRefreshTimerID:0,


queueProcessImportSettings:function() {
	// Start a timer to wait before calling the routine that reparses the import settings.
	// This way we're calling the reparse just once, even when we get multiple cascaded events that require it.

	if (EDDATD.processImportSettingsTimerID) {
		clearTimeout ( EDDATD.processImportSettingsTimerID );
	}
	EDDATD.processImportSettingsTimerID = setTimeout ( "EDDATD.processImportSettings()", 5 );
},


processImportSettings:function() {

	var mainRadioM = <HTMLInputElement>document.getElementById("mlayout");
	var mainRadioT = <HTMLInputElement>document.getElementById("tlayout");
	var mainRadioP = <HTMLInputElement>document.getElementById("playout");
	var mainRadioD = <HTMLInputElement>document.getElementById("dlayout");
	// We need all of these, or the page is b0rken.
	if (mainRadioM == null || mainRadioT == null || mainRadioP == null || mainRadioD == null) {
		return;
	}
	var m = mainRadioM.checked ? 1 : 0;
	var t = mainRadioT.checked ? 1 : 0;
	var p = mainRadioP.checked ? 1 : 0;
	var d = mainRadioD.checked ? 1 : 0;

	var gd = document.getElementById("graphDiv");
	if (!gd) {
		return;
	}

	var ignoreGapsEl = <HTMLInputElement>document.getElementById("ignoreGaps");
	if (ignoreGapsEl) {
		EDDATD.Grid.ignoreDataGaps = ignoreGapsEl.checked ? 1 : 0;
	}

	if (m) {
		EDDATD.interpretationMode = "metaboliteData";
		$(gd).removeClass('off');	// Okay to show the graph
		EDDATD.graphEnabled = 1;
	} else if (p) {
		EDDATD.interpretationMode = "proteinData";
		$(gd).removeClass('off');
		EDDATD.graphEnabled = 1;
	} else if (t) {
		EDDATD.interpretationMode = "transcriptionData";
		$(gd).removeClass('off');
		EDDATD.graphEnabled = 1;
	} else if (d) {
		EDDATD.interpretationMode = "metaData";
		$(gd).addClass('off');
		EDDATD.graphEnabled = 0;
	} else {
		// If none of them are checked, don't parse or change anything.
		return;
	}
	
	// Here's the part where we populate the text area with the current data set.
	// A rather interesting procedure.  That hardest part is expanding the various arrays of data
	// into a grid, creating gaps where required.

	var textBoxContent = "";

	if (EDDATD.interpretationMode == "metaboliteData") {

		if (EDDATD.StartData.Metabolites.sets.length > 0) {
			textBoxContent = "Assay\tCompartment\tMeasurement\tUnits\t" + EDDATD.StartData.Metabolites.allTimestamps.join("\t") + "\n";
			for (var x:any=0; x < EDDATD.StartData.Metabolites.allALabels.length; x++) {
				textBoxContent += EDDATD.StartData.Metabolites.allALabels[x] + "\t";
				textBoxContent += EDDATD.StartData.Metabolites.allCLabels[x] + "\t";
				textBoxContent += EDDATD.StartData.Metabolites.allMLabels[x] + "\t";
				textBoxContent += EDDATD.StartData.Metabolites.allULabels[x];
				for (var y:any=0; y < EDDATD.StartData.Metabolites.allTimestamps.length; y++) {
					textBoxContent += "\t" + EDDATD.StartData.Metabolites.tempGraphData[x][y];
				}
				if (x < (EDDATD.StartData.Metabolites.allALabels.length - 1)) { // No final CR
					textBoxContent += "\n";
				}
			}
		}

	} else if (EDDATD.interpretationMode == "transcriptionData") {

		if (EDDATD.StartData.Transcriptions.sets.length > 0) {
			textBoxContent = "Assay\tGene Identifier\t" + EDDATD.StartData.Transcriptions.allTimestamps.join("\t") + "\n";
			for (var x:any=0; x < EDDATD.StartData.Transcriptions.allALabels.length; x++) {
				textBoxContent += EDDATD.StartData.Transcriptions.allALabels[x] + "\t";
				textBoxContent += EDDATD.StartData.Transcriptions.allMLabels[x];
				for (var y:any=0; y < EDDATD.StartData.Transcriptions.allTimestamps.length; y++) {
					textBoxContent += "\t" + EDDATD.StartData.Transcriptions.tempGraphData[x][y];
				}
				if (x < (EDDATD.StartData.Transcriptions.allALabels.length - 1)) { // No final CR
					textBoxContent += "\n";
				}
			}
		}

	} else if (EDDATD.interpretationMode == "proteioData") {

		if (EDDATD.StartData.Proteins.sets.length > 0) {
			textBoxContent = "Assay\tProtein Identifier\t" + EDDATD.StartData.Proteins.allTimestamps.join("\t") + "\n";
			for (var x:any=0; x < EDDATD.StartData.Proteins.allALabels.length; x++) {
				textBoxContent += EDDATD.StartData.Proteins.allALabels[x] + "\t";
				textBoxContent += EDDATD.StartData.Proteins.allMLabels[x];
				for (var y:any=0; y < EDDATD.StartData.Proteins.allTimestamps.length; y++) {
					textBoxContent += "\t" + EDDATD.StartData.Proteins.tempGraphData[x][y];
				}
				if (x < (EDDATD.StartData.Proteins.allALabels.length - 1)) { // No final CR
					textBoxContent += "\n";
				}
			}
		}
		
	} else { // Must be doing metadata

		var assayIndexes = {};
		var metaIndexes = {};
		EDDATD.StartData.Metadata.tempMetaData = [];

		// These are hashes to resolve assay IDs and metadata type IDs into coordinates
		for (var i=0; i < ATData.selectedAssayIDs.length; i++) {
			var iid = ATData.selectedAssayIDs[i];
			assayIndexes[iid] = i;
		}
		for (var i=0; i < ATData.usedMetaDataTypes.length; i++) {
			var iid = ATData.usedMetaDataTypes[i];
			metaIndexes[iid] = i;
		}

		// Fill out a sparse two-dimensional array with the values we have
		for (var key in ATData.startMetaData) {
			var onePair:any = ATData.startMetaData[key];
			var x:any =	assayIndexes[onePair.aid];
			var y:any = metaIndexes[onePair.mdtid];
			var v:any = onePair.value;

			if (typeof EDDATD.StartData.Metadata.tempMetaData[x] == 'undefined') {
				EDDATD.StartData.Metadata.tempMetaData[x] = [];
			}
			EDDATD.StartData.Metadata.tempMetaData[x][y] = v;
		}

		// Now that we have the grid created, we can use it as the basis for
		// a tab-delimited chunk of text, similar to what we get when copying from Excel.
		textBoxContent = "Assay";

		if (ATData.usedMetaDataTypes.length > 0) {
			for (var y:any=0; y < ATData.usedMetaDataTypes.length; y++) {
				var yid = ATData.usedMetaDataTypes[y];
				var yrec = EDDData.MetaDataTypes[yid];
				textBoxContent += "\t" + yrec.name;
			}		
			textBoxContent += "\n";
			for (var x:any=0; x < ATData.selectedAssayIDs.length; x++) {
				var xid = ATData.selectedAssayIDs[x];
		    	var lid = EDDData.Assays[xid].lid;
		    	var ln = EDDData.Lines[lid].name;
		    	var pid = EDDData.Assays[xid].pid;
				var fn = [ln, EDDData.Protocols[pid].name, EDDData.Assays[xid].name].join('-');
				textBoxContent += fn;
				for (var y:any=0; y < ATData.usedMetaDataTypes.length; y++) {
					var v:any = '';
					if (typeof EDDATD.StartData.Metadata.tempMetaData[x] != 'undefined') {
						if (typeof EDDATD.StartData.Metadata.tempMetaData[x][y] != 'undefined') {
							v = EDDATD.StartData.Metadata.tempMetaData[x][y]
						}
					}
					textBoxContent += "\t" + v;
				}
				if (x < (ATData.selectedAssayIDs.length - 1)) { // No final CR
					textBoxContent += "\n";
				}
			}
		}
	}
	
	var textData = <any>document.getElementById("textData");
	textData.value = textBoxContent;

	EDDATD.parseAndDisplayText();
},


// This gets called when there is a paste event.
pastedRawData:function() {
	// We do this using a timeout so the rest of the paste events fire, and get the pasted result.
	window.setTimeout(function() {
		var textData = <any>document.getElementById("textData");
		var val = textData.value;

		// If we don't call this here, then we'll be relying on the keyup event to
		// trigger the parsing, and then right-click-paste won't work.
		EDDATD.parseAndDisplayText();
	}, 1);
},



parseAndDisplayText:function() {

	EDDATD.Grid.data = [];
	EDDATD.Grid.colMarkers = [];

	var delimiter = "\t";

	var widestRow = 0;
	var rowCount = 0;
	var textData = <any>document.getElementById("textData");

    var data = textData.value;
    var unfilteredrows = data.split("\n");
	var rows = [];

	var longestInitialRow = 0;

	// Find out the maximum number of columns.
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
	// You may ask - what would ever be the point of importing a single column,
	// since it would not carry any label indicators to associate each row with a time or an assay?
	// Well, consider the case of a set of one-time measurements, with the first row being the time
	// they were taken, where the submitter has not bothered to link the values up with assays
	// before pasting it in, and intends to do so here.

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

	// The first thing we're going to do is turn the text into a big grid of data.

	var tempData = [];

	for (var ri = 0; ri < rows.length; ri++) {
		var cells = rows[ri].split(delimiter);
		// Pad it if it's shorter than the widest row, so we're making a solid rectangle
		for (var ci = 0; ci < (widestRow - cells.length); ci++) {
			cells.push(null);
		}
		tempData.push(cells);
	}
	rowCount = tempData.length;

	// Now that that's done, move the data into Grid.data,
	// splitting off a column into Grid.colMarkers as needed.

	for (var ci = 0; ci < widestRow; ci++) {
		EDDATD.Grid.colMarkers[ci] = tempData[0][ci];
	}
	rowCount--;	// Now the whole set is one row shorter.
	for (var ri = 0; ri < rowCount; ri++) {
		EDDATD.Grid.data[ri] = [];
		for (var ci = 0; ci < widestRow; ci++) {
			EDDATD.Grid.data[ri][ci] = tempData[ri+1][ci];
		}
	}

	// Blank any header positions that got 'null' for a value.
	for (var mi = 0; mi < widestRow; mi++) {
		if (!EDDATD.Grid.colMarkers[mi]) {
			EDDATD.Grid.colMarkers[mi] = '';
		}
	}

	EDDATD.Grid.w = widestRow;
	EDDATD.Grid.l = rowCount;

	// Create a map of enabled/disabled flags for our data,
	// but only fill the areas that do not already exist.

	// An important thing to note here is that this data is in [y][x] format -
	// that is, it goes by row, then by column, when referencing.
	// This matches Grid.data and Table.dataCells.

	for (var x:any=0; x < widestRow; x++) {
		if (typeof EDDATD.Table.activeColFlags[x] == 'undefined') {	// Column flags
			EDDATD.Table.activeColFlags[x] = 1;
		}
	}
	for (var y:any=0; y < rowCount; y++) {
		if (typeof EDDATD.Table.activeRowFlags[y] == 'undefined') {	// Row flags
			EDDATD.Table.activeRowFlags[y] = 1;
		}
		if (typeof EDDATD.Table.activeFlags[y] == 'undefined') {	// Individual cell flags
			EDDATD.Table.activeFlags[y] = [];
		}
		for (var x:any=0; x < widestRow; x++) {
			if (typeof EDDATD.Table.activeFlags[y][x] == 'undefined') {
				EDDATD.Table.activeFlags[y][x] = 1;
			}
		}
	}

	// Construct table cell objects for the page, based on our extracted data

	EDDATD.Table.dataCells = [];
	EDDATD.Table.cornerCells = [];
	EDDATD.Table.colCheckboxCells = [];
	EDDATD.Table.colLabelCells = [];
	EDDATD.Table.rowCheckboxCells = [];

	// The corner cells that fit in the upper left at the top of the Y column
	var aTD;
	for (var i=0; i < 2; i++) {
		// x and y are set to 0 because these cells are off the highlight grid
		aTD = EDDATD.makeGridTD('ulCell'+i, '', 0, 0);
		EDDATD.Table.cornerCells.push(aTD);
	}

	// The checkboxes and labels that go along the top above the data columns
	for (var i=0; i < widestRow; i++) {
		aTD = EDDATD.makeGridTD('colCBCell'+i, 'checkBoxCell', 1+i, 0);
		if (((EDDATD.interpretationMode == "metaboliteData") && (i > 3)) ||
		    ((EDDATD.interpretationMode == "transcriptionData") && (i > 1)) ||
		    ((EDDATD.interpretationMode == "metaData"       ) && (i > 0)))   {
			var aCB = document.createElement("input");
			aCB.setAttribute('type', "checkbox");
			aCB.setAttribute('id', "enableColumn" + i);
			aCB.setAttribute('name', "enableColumn" + i);
			aCB.setAttribute('value', (i+1).toString());
			if (EDDATD.Table.activeColFlags[i]) {
				aCB.setAttribute('checked', "true");
			}
			aCB.setAttribute('onclick', "EDDATD.toggleTableColumn(this);");
			aTD.appendChild(aCB);
		}
		EDDATD.Table.colCheckboxCells[i] = aTD;
		// A header cell for the row label
		aTD = EDDATD.makeGridTD('rowMCell'+i, 'dataTypeCell', 1+i, 0, EDDATD.Grid.colMarkers[i]);
		EDDATD.Table.colLabelCells[i] = aTD;
	}

	for (var i=0; i < rowCount; i++) {
		// A checkbox that goes next to the row
		aTD = EDDATD.makeGridTD('rowCBCell'+i, 'checkBoxCell', 0, 1+i);
		var aCB = document.createElement("input");
		aCB.setAttribute('type', "checkbox");
		aCB.setAttribute('id', "enableRow" + i);
		aCB.setAttribute('name', "enableRow" + i);
		aCB.setAttribute('value', (i+1).toString());
		if (EDDATD.Table.activeRowFlags[i]) {
			aCB.setAttribute('checked', "true");
		}
		aCB.setAttribute('onclick', "EDDATD.toggleTableRow(this);");
		aTD.appendChild(aCB);
		EDDATD.Table.rowCheckboxCells[i] = aTD;
	}

	// The table data itself
	for (var y:any=0; y < rowCount; y++) {
		EDDATD.Table.dataCells[y] = [];
		for (var x:any=0; x < EDDATD.Grid.data[y].length; x++) {
			var val = EDDATD.Grid.data[y][x];
			if ((typeof val == 'undefined') || (val == null)) { val = ''; }
			var shortVal = val;
			if (shortVal == '') { shortVal = String.fromCharCode(0x00A0); } // An non-breaking space
			if (val.length > 32) {
				shortVal = val.substr(0, 31) + String.fromCharCode(0x2026); // An ellipsis, or &hellip;
			}
			aTD = EDDATD.makeGridTD('valCell'+x+'-'+y, '', 1+x, 1+y, shortVal);
			aTD.setAttribute('title', val);
			if (val == '') {
				aTD.setAttribute('isblank',1);
			}
			EDDATD.Table.dataCells[y][x] = aTD;
		}
	}

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

	// Start with a column for the checkboxes.
	// (These will not be tracked in Table.colObjects.)
	for (var i=0; i < 1; i++) {
		var aCol = document.createElement("col");
		colGroupObject.appendChild(aCol);
	}
	// Then add columns for all the data columns
	for (var i=0; i < widestRow; i++) {
		var aCol = document.createElement("col");
		EDDATD.Table.colObjects[i] = aCol;	// Save these for later manipulation
		colGroupObject.appendChild(aCol);
	}

	// The first row: The spacer cells, then a row of checkbox cells for the data columns
	var aRow = document.createElement("tr");
	tBodyObject.appendChild(aRow);

	aRow.appendChild(EDDATD.Table.cornerCells[0]);
	for (var j=0; j < widestRow; j++) {
		aRow.appendChild(EDDATD.Table.colCheckboxCells[j]);
	}

	// The second row: Type and data labels
	aRow = document.createElement("tr");
	tBodyObject.appendChild(aRow);

	aRow.appendChild(EDDATD.Table.cornerCells[1]);
	for (var j=0; j < widestRow; j++) {
		// The row label, extracted from the header of the pasted data
		aRow.appendChild(EDDATD.Table.colLabelCells[j]);
	}

	// The rest of the rows: A checkbox, and a row of data.
	for (var y:any=0; y < rowCount; y++) {

		aRow = document.createElement("tr");
		tBodyObject.appendChild(aRow);

		// The cell with the checkbox for enabling/disabling the row
		aRow.appendChild(EDDATD.Table.rowCheckboxCells[y]);

		for (var x:any=0; x < widestRow; x++) {
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
makeGridTD:function(id, className, x, y, text) {
	var td = document.createElement("td");
	td.setAttribute('id', id);
	td.setAttribute('x',x);
	td.setAttribute('y',y);
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


toggleIgnoreGaps:function(box) {

	var tmpEl = <HTMLInputElement>document.getElementById("ignoreGaps");
	if (tmpEl.checked) {
		EDDATD.Grid.ignoreDataGaps = 1;
	} else {
		EDDATD.Grid.ignoreDataGaps = 0;
	}
	EDDATD.interpretDataTable();
	EDDATD.queueGraphRemake();
	EDDATD.redrawIgnoredValueMarkers();
	EDDATD.redrawEnabledFlagMarkers();
	EDDATD.remakeInfoTable();
},


redrawIgnoredValueMarkers:function() {

	for (var j=0; j < EDDATD.Table.dataCells.length; j++) {
		for (var i=0; i < EDDATD.Table.dataCells[j].length; i++) {
			var aTD = EDDATD.Table.dataCells[j][i];
			aTD.className = aTD.className.replace(" ignoredLine", "");
			if (EDDATD.Grid.ignoreDataGaps && aTD.getAttribute('isblank')) {
				aTD.className = aTD.className + " ignoredLine";	
			}
		}
	}
},


toggleTableRow:function(box) {

	var val = parseInt(box.getAttribute('value'));
	if (!val) {
		return;
	}
	if (box.checked) {
		EDDATD.Table.activeRowFlags[val-1] = 1;
	} else {
		EDDATD.Table.activeRowFlags[val-1] = 0;
	}
	EDDATD.interpretDataTable();
	EDDATD.queueGraphRemake();
	EDDATD.redrawEnabledFlagMarkers();
	// Resetting a disabled row may change the number of rows listed in the Info table.
	EDDATD.remakeInfoTable();
},


toggleTableColumn:function(box) {

	var val = parseInt(box.getAttribute('value'));
	if (!val) {
		return;
	}
	var col = EDDATD.Table.colObjects[val-1];
	if (!col) {
		return;
	}
	if (box.checked) {
		EDDATD.Table.activeColFlags[val-1] = 1;
	} else {
		EDDATD.Table.activeColFlags[val-1] = 0;
	}
	EDDATD.interpretDataTable();
	EDDATD.queueGraphRemake();
	EDDATD.redrawEnabledFlagMarkers();
	// Resetting a disabled column may change the rows listed in the Info table.
	EDDATD.remakeInfoTable();
},


resetEnabledFlagMarkers:function() {

	for (var y:any=0; y < EDDATD.Grid.l; y++) {
		EDDATD.Table.activeFlags[y] = [];
		for (var x=0; x < EDDATD.Grid.w; x++) {
			EDDATD.Table.activeFlags[y][x] = 1;
		}
	}
	for (var x=0; x < EDDATD.Grid.w; x++) {
		EDDATD.Table.activeColFlags[x] = 1;
	}
	for (var y:any=0; y < EDDATD.Grid.l; y++) {
		EDDATD.Table.activeRowFlags[y] = 1;
	}

	// Flip all the checkboxes on in the header cells for the data columns
	for (var i=0; i < EDDATD.Grid.w; i++) {
		var aCB = <HTMLInputElement>document.getElementById("enableColumn" + i);
		if (aCB != null) {
			aCB.checked = true;
		}
	}
	// Same for the checkboxes in the row label cells
	for (var i=0; i < EDDATD.Grid.l; i++) {
		var aCB = <HTMLInputElement>document.getElementById("enableRow" + i);
		if (aCB != null) {
			aCB.checked = true;
		}
	}

	EDDATD.interpretDataTable();
	EDDATD.queueGraphRemake();
	EDDATD.redrawEnabledFlagMarkers();
	EDDATD.remakeInfoTable();
},


redrawEnabledFlagMarkers:function() {

	for (var x=0; x < EDDATD.Grid.w; x++) {
		var aTD = EDDATD.Table.colCheckboxCells[x];
		var bTD = EDDATD.Table.colLabelCells[x];
		aTD.className = aTD.className.replace(" disabledLine", "");
		bTD.className = bTD.className.replace(" disabledLine", "");
		if (!EDDATD.Table.activeColFlags[x]) {
			aTD.className = aTD.className + " disabledLine";
			bTD.className = bTD.className + " disabledLine";
		}
		for (var y=0; y < EDDATD.Grid.l; y++) {
			aTD = EDDATD.Table.dataCells[y][x];
			aTD.className = aTD.className.replace(" disabledLine", "");
			if (!EDDATD.Table.activeFlags[y][x] || !EDDATD.Table.activeColFlags[x] || !EDDATD.Table.activeRowFlags[y]) {
				aTD.className = aTD.className + " disabledLine";
			}
		}
	}
},


interpretDataTable:function() {

	var im = EDDATD.interpretationMode;

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
	// Here's the arrays we will use later
	EDDATD.Sets.uniqueAssayLineNames = [];
	EDDATD.Sets.uniqueMeasurementHashNames = [];
	EDDATD.Sets.uniqueMetadataNames = [];

	EDDATD.Sets.seenAnyTimestamps = 0;

	// Deal with each column separately	
	for (var r=0; r < EDDATD.Grid.l; r++) {
		// Skip it if the whole column is deactivated
		if (!EDDATD.Table.activeRowFlags[r]) {
			continue;
		}

		var newSet:any = {
			// For the graphing module
			label:'Row ' + r,
			name:'Row ' + r,
			units: 'units',
			data: [],
			// For submission to the database
			parsingIndex: r,
			assay: null,
			measurementType: null
		};

		if (im == "metaboliteData") {
			newSet.measurementCompartment = '';
			newSet.measurementUnits = '';
			// This consolidates the three separate rows into one name, for use as a uniqueness-enforcing hash
			newSet.measurementHashNameIndex = null;
		}

		if (im == "transcriptionData") {
			newSet.units = 'RPKM';
		}

		if (im == "metaData") {
			newSet.metadata = {};
		}

		var uniqueTimes = [];
		var timestamps = {};

		var foundMetaDataCount = 0;

		for (var c=0; c < EDDATD.Grid.w; c++) {
			if (!EDDATD.Table.activeColFlags[c]) { continue; }
			if (!EDDATD.Table.activeFlags[r][c]) { continue; }

			var n = EDDATD.Grid.colMarkers[c];			// The row label
			var v = EDDATD.Grid.data[r][c];				// The value in the current cell

			if ((typeof n == 'undefined') || (n == null)) { n = ''; }
			if ((typeof v == 'undefined') || (v == null)) { v = ''; }

			if (c == 0) {	// Assay Names
				if (v != '') {
					if (!seenAssayLineNames[v]) {	// If we haven't seen it before,
						assayLineNamesCount++;		// Increment the unique index by 1
						seenAssayLineNames[v] = assayLineNamesCount;		// Store a key of v with a value of the index
						EDDATD.Sets.uniqueAssayLineNames.push(v);	// And push it into the array (at that index-1)
					}
					newSet.assay = seenAssayLineNames[v];
				}
				continue;
			}

			if (im == "metaData") {
				// In metaData mode, everything past the first row is identified as metaData
				if (n != '') {
					if (!seenMetadataNames[n]) {	// Note that we're working with the LABEL (n) here, not the value in the cell (v)
						metadataNamesCount++;		// Incrementing before adding, so the effective start index is 1, not 0
						seenMetadataNames[n] = metadataNamesCount;
						EDDATD.Sets.uniqueMetadataNames.push(n);
					}
					newSet.metadata[seenMetadataNames[n]] = v;
					foundMetaDataCount++;
				}
				continue;
			}

			if (im == "metaboliteData") {
				if (c == 1) {
					newSet.measurementCompartment = v;
					continue;
				}
				if ((c == 2) && (v != '')) {	// Metabolite Type Names
					newSet.measurementType = v;
					continue;
				}
				if ((c == 3) && (v != '')) {
					newSet.measurementUnits = v;
					newSet.units = v;
					continue;
				}
			}

			if (im == "transcriptionData") {
				if ((c == 1) && (v != '')) {	// Measurement (Gene Identifier) Type Names
					newSet.measurementType = v;
					continue;
				}
			}

			// Timestamps
			if (((im == "metaboliteData"   ) && (c > 3)) ||
			    ((im == "transcriptionData") && (c > 1))    ) {
				n = n.replace(/,/g, '');
				if (isNaN(parseFloat(n))) {	// If we can't parse the timestamp indicator, we're sunk
					continue;
				}
				n = parseFloat(n);
				v = v.replace(/,/g, '');	//	No commas, please
				if (v == '') {
					if (EDDATD.Grid.ignoreDataGaps) {
						// If we're ignoring gaps, skip out on recording this value
						continue;
					}
					v = null;	// We actually prefer null here, to indicate a placeholder value
				}

				// Note that we're deliberately avoiding parsing v with parseFloat.
				// It will remain as a string, which the graph module will accept with no problems,
				// and will also preserve a carbon ratio if that's what this is.
				if (!timestamps[n]) {	// If we haven't seen it before,
					timestamps[n] = v;
					uniqueTimes.push(n);		// Save it as a unique value
					EDDATD.Sets.seenAnyTimestamps = 1;
				}
				continue;
			}
		}

		// Now that we've had a chance to collect a compartment, type, and units, make a hash with them.
		if (im == "metaboliteData") {
			if ((typeof newSet.measurementType != 'undefined') && (newSet.measurementType != null)) {
				var hashName = newSet.measurementCompartment + '{}' + newSet.measurementType + '{}' + newSet.measurementUnits;		
				if (!seenMeasurementNames[hashName]) {
					measurementNamesCount++;
					seenMeasurementNames[hashName] = measurementNamesCount;
					EDDATD.Sets.uniqueMeasurementHashNames.push(hashName);
				}
				newSet.measurementHashNameIndex = seenMeasurementNames[hashName];
			}
		}

		// Sort the timestamps we found and build an array of time/value tuples
		uniqueTimes.sort(function(a,b){return a - b}); // Sort ascending
		for (var x = 0; x < uniqueTimes.length; x++) {
			newSet.data.push([uniqueTimes[x], timestamps[uniqueTimes[x]]]);
		}

		// Only save this set if we actually accumulated some data or metadata to store.
		if ((uniqueTimes.length > 0) || foundMetaDataCount) {
			EDDATD.Sets.parsedSets.push(newSet);
		}
	}
},


queueGraphRemake:function() {
	// Start a timer to wait before calling the routine that remakes the graph.
	// This way we're not bothering the user with the long redraw process when
	// they are making fast edits.

	if (EDDATD.graphRefreshTimerID) {
		clearTimeout ( EDDATD.graphRefreshTimerID );
	}
	if (EDDATD.graphEnabled) {
		EDDATD.graphRefreshTimerID = setTimeout ( "EDDATD.remakeGraphArea()", 700 );
	}
},


remakeGraphArea:function() {
	EDDATD.graphRefreshTimerID = 0;	

	if (!EDDATDGraphing) {
		return;
	}
	if (!EDDATD.graphEnabled) {
		return
	}
	
	EDDATDGraphing.clearAllSets();

	// If we're not in either of these modes, drawing a graph is nonsensical.
	if ((EDDATD.interpretationMode == "metaboliteData") || (EDDATD.interpretationMode == "transcriptionData")) {
		for (var i=0; i < EDDATD.Sets.parsedSets.length; i++) {
			EDDATDGraphing.addNewSet(EDDATD.Sets.parsedSets[i]);
		}
	}

	EDDATDGraphing.drawSets();
},


resetInfoTableFields:function() {

	// TOTALLY STUBBED

},


// Create the Step 4 table:  A set of rows, one for each y-axis column of data,
// where the user can fill out additional information for the pasted table.

remakeInfoTable:function() {

	var im = EDDATD.interpretationMode;
	var disambiguateAssaysSection = document.getElementById('disambiguateAssaysSection');
	var disambiguateMeasurementsSection = document.getElementById('disambiguateMeasurementsSection');
	var disambiguateMetadataSection = document.getElementById('disambiguateMetadataSection');

	var disabledStepLabel = document.getElementById('emptyDisambiguationLabel');

	// Initially hide all the Step 4 master pulldowns so we can reveal just the ones we need later
	$(disambiguateAssaysSection).addClass('off');
	$(disambiguateMeasurementsSection).addClass('off');
	$(disambiguateMetadataSection).addClass('off');

	var dATable = document.getElementById('disambiguateAssaysTable');
	if (dATable) {dATable.parentNode.removeChild(dATable);}
	var dMTable = document.getElementById('disambiguateMeasurementsTable');
	if (dMTable) {dMTable.parentNode.removeChild(dMTable);}
	var dMdTable = document.getElementById('disambiguateMetadataTable');
	if (dMdTable) {dMdTable.parentNode.removeChild(dMdTable);}

	// If we have no sets to show, leave the area blank and show the 'enter some data!' banner
	if (EDDATD.Sets.parsedSets.length == 0) {	
		$(disabledStepLabel).removeClass('off');
		return;
	}
	$(disabledStepLabel).addClass('off');

	// If we have no Assays/Lines detected for disambiguation, ask the user to select one.
	if (EDDATD.Sets.uniqueAssayLineNames.length > 0) {
		// Otherwise, put together a disambiguation section for Assays/Lines

		EDDATD.Disam.currentlyVisibleAssayLineObjSets = [];

		$(disambiguateAssaysSection).removeClass('off');
		var aTable = document.createElement("table");
		aTable.setAttribute('cellspacing', "0");
		aTable.setAttribute('id', 'disambiguateAssaysTable');
 		disambiguateAssaysSection.appendChild(aTable);
		var aTBody = document.createElement("tbody");
		aTable.appendChild(aTBody);

		for (var i=0; i < EDDATD.Sets.uniqueAssayLineNames.length; i++) {
			var uName:any = EDDATD.Sets.uniqueAssayLineNames[i];
			// Find a pre-existing collection of objects that corresponds to this unique string
			var disamRow = EDDATD.Disam.assayLineObjSets[uName];
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
					aTD.style.textAlign="left";
					aRow.appendChild(aTD);
						// First, the Assay pulldown
						var aSEL = document.createElement("select");
						disamRow.assayObj = aSEL;
						aTD.appendChild(aSEL);
							for (var ea in EDDData.EnabledAssayIDs) {
								var id = EDDData.EnabledAssayIDs[ea];
								var aOPT = document.createElement("option");
								aOPT.setAttribute('value', id.toString());
								if (defaultSelections.assayID == id) {
									aOPT.setAttribute('selected', 'selected');
								}
						    	var lid = EDDData.Assays[id].lid;
						    	var ln = EDDData.Lines[lid].name;
						    	var pid = EDDData.Assays[id].pid;
								var fullN = [ln, EDDData.Protocols[pid].name, EDDData.Assays[id].name].join('-');
								aOPT.appendChild(document.createTextNode(fullN));
								aSEL.appendChild(aOPT);
							}
							// Done with the pulldown selection options
						// Done with the pulldown

					// Done with the last td object
				// Done with the tr object
				EDDATD.Disam.assayLineObjSets[uName] = disamRow;	// Store the row for later reference
			}

			// Set or re-set the name and id attributes of the pulldowns since we're adding it to the document
			disamRow.assayObj.setAttribute('name', 'disamAssay' + (i + 1));
			disamRow.assayObj.setAttribute('visibleIndex', i);
			aTBody.appendChild(disamRow.rowObj);	// Add the row to the document
		}	// Done for each Assay/Line we are disambiguating
	}

	// If we've detected no measurement types for disambiguation, but we do have timestamp data, ask the user to select one.
	if ((EDDATD.Sets.uniqueMeasurementHashNames.length > 0) && (im != "transcriptionData")) {

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
			aTH.colSpan = 2;	// http://www.w3schools.com/jsref/prop_tabledata_colspan.asp
			aTH.setAttribute('colspan', "2");
			aTH.style.textAlign = "right";
			aTH.appendChild(document.createTextNode('Compartment'));
			aRow.appendChild(aTH);
			aTH = document.createElement("th");
			aTH.appendChild(document.createTextNode('Type'));
			aRow.appendChild(aTH);
			aTH = document.createElement("th");
			aTH.appendChild(document.createTextNode('Units'));
			aRow.appendChild(aTH);
		// Done with headers row

		EDDATD.Disam.currentlyVisibleMeasurementObjSets = [];	// For use in cascading user settings

		for (var i=0; i < EDDATD.Sets.uniqueMeasurementHashNames.length; i++) {
			var uHash = EDDATD.Sets.uniqueMeasurementHashNames[i];
			var tempArray = uHash.split('{}');
			var umCompartment = tempArray[0];
			var umType = tempArray[1];
			var umUnits = tempArray[2];
			var uName:any = '' + umCompartment + ' ' + umType + ' ' + umUnits;

			// Find a pre-existing collection of objects that corresponds to this unique string
			var disamRow = EDDATD.Disam.measurementObjSets[uHash];
			// If none exists, we'll have to build one
			if (disamRow) {
				aTBody.appendChild(disamRow.rowObj);	// Add the row to the document
			} else {
				disamRow = {};
				// First make a table row, and save a reference to it
				aRow = document.createElement("tr");
				aTBody.appendChild(aRow);	// Rows must be in the DOM so initilization calls for their automcomplete elements work
				disamRow.rowObj = aRow;
					// Next, add a table cell with the string we are disambiguating
					var aTD = document.createElement("td");
					aRow.appendChild(aTD);
						var aDIV = document.createElement("div");
						aDIV.appendChild(document.createTextNode(uName));
						aTD.appendChild(aDIV);
					// Now build another table cell that will contain the autocomplete elements
					var compAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
						"measurementcompartment", 4, 'disamMComp' + EDDATD.Disam.autoCompUID, umCompartment, 0);
					var typeAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
						"metabolite", 45, 'disamMType' + EDDATD.Disam.autoCompUID+1, umType, 0);
					var unitsAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
						"units", 15, 'disamMUnits' + EDDATD.Disam.autoCompUID+2, umUnits, 0);
					EDDATD.Disam.autoCompUID += 3;

					// Perform these operations on all new autocomplete units
					var newAutos = [compAutocomplete, typeAutocomplete, unitsAutocomplete];
					for (var n=0; n < newAutos.length; n++) {
						aTD = document.createElement("td");
						aTD.className = 'disamDataCell';
						aRow.appendChild(aTD);
						aTD.appendChild(newAutos[n].inputElement);
						aTD.appendChild(newAutos[n].hiddenInputElement);
                        // custom property requires access via index notation
						newAutos[n].inputElement['callAfterAutoChange'] = EDDATD.userChangedMeasurementDisam;
						EDDAutoComplete.initializeElement(newAutos[n].inputElement);
                        // custom property requires access via index notation
						newAutos[n].inputElement['autocompleter'].setFromPrimaryElement();
						newAutos[n].initialized = 1;
						newAutos[n].setByUser = 0;	// For use here in AssayTableData
					}
					// Done with the td objects
					disamRow.compObj = compAutocomplete;
					disamRow.typeObj = typeAutocomplete;
					disamRow.unitsObj = unitsAutocomplete;
				// Done with the tr object
				EDDATD.Disam.measurementObjSets[uHash] = disamRow;	// Store the row for later reference
			}

			// Set or re-set the names of the inputs so they correlate with the uniqueMeasurementHashNames indexes
			disamRow.compObj.inputElement.setAttribute('name', 'disamMComp' + (i + 1));
			disamRow.compObj.inputElement.setAttribute('visibleIndex', i);
			disamRow.compObj.hiddenInputElement.setAttribute('name', 'disamMCompHidden' + (i + 1));
			disamRow.typeObj.inputElement.setAttribute('name', 'disamMType' + (i + 1));
			disamRow.typeObj.inputElement.setAttribute('visibleIndex', i);
			disamRow.typeObj.hiddenInputElement.setAttribute('name', 'disamMTypeHidden' + (i + 1));
			disamRow.unitsObj.inputElement.setAttribute('name', 'disamMUnits' + (i + 1));
			disamRow.unitsObj.inputElement.setAttribute('visibleIndex', i);
			disamRow.unitsObj.hiddenInputElement.setAttribute('name', 'disamMUnitsHidden' + (i + 1));

			// Used in userChangedMeasurementDisam to cascade changes in one input to subsequent inputs
			EDDATD.Disam.currentlyVisibleMeasurementObjSets.push(disamRow);
		}
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

	// 	Disam.metadataObjSets:{},

		for (var i=0; i < EDDATD.Sets.uniqueMetadataNames.length; i++) {
			var uName:any = EDDATD.Sets.uniqueMetadataNames[i];

			// Find a pre-existing collection of objects that corresponds to this unique string
			var disamRow = EDDATD.Disam.metadataObjSets[uName];
			// If none exists, we'll have to build one
			if (disamRow) {
				aTBody.appendChild(disamRow.rowObj);	// Add the row to the document
			} else {
				disamRow = {};
				// First make a table row, and save a reference to it
				aRow = document.createElement("tr");
				// Rows must be in the DOM so initilization calls for their automcomplete elements work
				aTBody.appendChild(aRow);
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
						var metaAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
							"metadatatype", 23, 'disamMeta' + EDDATD.Disam.autoCompUID, uName, 0);
						EDDATD.Disam.autoCompUID++;
						aTD.appendChild(metaAutocomplete.inputElement);
						aTD.appendChild(metaAutocomplete.hiddenInputElement);
						// Done with the autocomplete object
					EDDAutoComplete.initializeElement(metaAutocomplete.inputElement);
                    // custom property requires access via index notation
					metaAutocomplete.inputElement['autocompleter'].setFromPrimaryElement();
					metaAutocomplete.initialized = 1;
					disamRow.metaObj = metaAutocomplete;
					// Done with the td obect
				// Done with the tr object
				EDDATD.Disam.metadataObjSets[uName] = disamRow;	// Store the row for later reference
			}

			// Set or re-set the names of the inputs so they correlate with the uniqueMetadataNames indexes
			disamRow.metaObj.inputElement.setAttribute('name', 'disamMeta' + (i+1));
			disamRow.metaObj.hiddenInputElement.setAttribute('name', 'disamMetaHidden' + (i+1));
		}
	}

	var debugArea = <any>document.getElementById("jsondebugarea");
	if (debugArea) {
		debugArea.value = JSON.stringify(EDDATD.Sets.parsedSets);
	}

	return;
},


disambiguateAnAssayOrLine:function(assayOrLine, currentIndex) {
	var selections = {
		assayID:0
	};
	var highestMatchQuality = 0;

	for (var ea in EDDData.EnabledAssayIDs) {
		var id = EDDData.EnabledAssayIDs[ea];
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
		if (highestMatchQuality >= 0.8) {continue;}
		// An exact-case match with the Assay name fragment alone is second-best.
		if (assayOrLine == assay.name) {
			highestMatchQuality = 0.8;
			selections.assayID = id;
			continue;
		}
		// Finding the whole string inside the Assay name fragment is pretty good
		if (highestMatchQuality >= 0.7) {continue;}
		if (assay.name.indexOf(assayOrLine) >= 0) {
			highestMatchQuality = 0.7;
			selections.assayID = id;
			continue;
		}
		if (highestMatchQuality >= 0.6) {continue;}
		// Finding the whole string inside the originating Line name is good too.
		// It means that the user may intend to pair with this Assay even though the Assay name is different.  
		if (ln.indexOf(assayOrLine) >= 0) {
			highestMatchQuality = 0.6;
			selections.assayID = id;
			continue;
		}
		if (highestMatchQuality >= 0.4) {continue;}
		// Finding the Assay name fragment within the whole string, as a whole word, is our last option.
		var reg = new RegExp('(^|\\W)' + assay.name + '(\\W|$)', 'g');
		if (reg.test(assayOrLine)) {
			highestMatchQuality = 0.4;
			selections.assayID = id;
			continue;
		}
		// If all else fails, just choose the Assay that matches the current index in sorted order.
		if (highestMatchQuality >= 0.3) {continue;}
		if (currentIndex == ea) {
			highestMatchQuality = 0.3;
			selections.assayID = id;
		}
	}
	return selections;
},


highlighterF:function(e) {

	var e = e || window.event;
	var obj = e.srcElement || e.target;
	var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
	// Walk up the item tree until we arrive at a table cell,
	// so we can get the index of the table cell in the table.
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
							var col = EDDATD.Table.colObjects[x-1];
							col.className = col.className + " hoverLines";
						}
						if (y != 0) {
							row.className = row.className + " hoverLines";
						}
						break;
					case 'mouseout':
						if (x != 0) {
							var col = EDDATD.Table.colObjects[x-1];
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


singleValueDisablerF:function(e) {

	var e = e || window.event;
	var obj = e.srcElement || e.target;
	var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
	// Walk up the item tree until we arrive at a table cell,
	// so we can get the index of the table cell in the table.
	while (tn != "td" && tn != "tbody") {
			obj = obj.parentNode || obj.parentElement;
			tn = obj.tagName.toLowerCase();
	}
	if (tn != "td") {
		return;
	}
	var x:any = obj.getAttribute('x');
	var y:any = obj.getAttribute('y');
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
	if ((x<1) || (y<1)) {
		return;
	}
	x = x - 1;
	y = y - 1;
	
	if (EDDATD.Table.activeFlags[y][x]) {	// Exists and nonzero
		EDDATD.Table.activeFlags[y][x] = 0;
	} else {
		EDDATD.Table.activeFlags[y][x] = 1;
	}
	EDDATD.interpretDataTable();
	EDDATD.queueGraphRemake();
	EDDATD.redrawEnabledFlagMarkers();
},


generateFormSubmission:function() {

	// Run through the data sets one more time,
	// pulling out any values in the pulldowns and autocomplete elements in Step 4
	// and embedding them in their respective data sets.

	var dest = <any>document.getElementById("jsonoutput");
	if (!dest) {
		return false;
	}
    dest.value = JSON.stringify(EDDATD.Sets.parsedSets);

	var debugArea = <any>document.getElementById("jsondebugarea");
	if (debugArea) {
		debugArea.value = JSON.stringify(EDDATD.Sets.parsedSets);
	}
},


// This handles insertion of a tab into the textarea.
// May be glitchy.
suppressNormalTab:function(e) {

	var e = e || window.event;
	var obj = e.srcElement || e.target;

    if (e.keyCode === 9) { // tab was pressed
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


prepareIt:function() {

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
	// A user should be free to change "merge" to "replace" without having
	// their edits in Step 2 erased, for example.
	$("#mlayout").click(EDDATD.queueProcessImportSettings);
	$("#tlayout").click(EDDATD.queueProcessImportSettings);
	$("#dlayout").click(EDDATD.queueProcessImportSettings);

	$("#ignoreGaps").click(EDDATD.toggleIgnoreGaps);

	// We're going to create an initial data set, to be used as the basis for
	// a tab-delimited chunk of text that users can directly edit.

	for (var i=0; i < EDDData.AssayMeasurementIDs.length; i++) {
		var id = EDDData.AssayMeasurementIDs[i];
		var rec = EDDData.AssayMeasurements[id];
		// If it's transcriptomits data, put it in the transcriptomics section
		if (rec.mst == 3) {
			EDDATD.StartData.Proteins.sets.push(rec);
		} else if (rec.mst == 2) {
			EDDATD.StartData.Transcriptions.sets.push(rec);
		} else {
			EDDATD.StartData.Metabolites.sets.push(rec);
		}
	}

	// We're using a pseudo-object, as a key/value hash, to make sure we put only
	// one copy of each observed value on the allTimestamps array.
	var seenTimestamps = {};
	EDDATD.StartData.Metabolites.allTimestamps = [];

	for (var key in EDDATD.StartData.Metabolites.sets) {
		var oneSet = EDDATD.StartData.Metabolites.sets[key];
		var oneSetData = oneSet.d;
		for (var p in oneSetData) {
			var onePair:any = oneSetData[p];		
			if (!isNaN(parseFloat(onePair[0]))) {
				if (typeof seenTimestamps[onePair[0]] == 'undefined') {
					seenTimestamps[onePair[0]] = 1;
					EDDATD.StartData.Metabolites.allTimestamps.push(parseFloat(onePair[0]));
				}
			}
		}
	}
	seenTimestamps = {};
	EDDATD.StartData.Transcriptions.allTimestamps = [];

	for (var key in EDDATD.StartData.Transcriptions.sets) {
		var oneSet = EDDATD.StartData.Transcriptions.sets[key];
		var oneSetData = oneSet.d;
		for (var p in oneSetData) {
			var onePair:any = oneSetData[p];		
			if (!isNaN(parseFloat(onePair[0]))) {
				if (typeof seenTimestamps[onePair[0]] == 'undefined') {
					seenTimestamps[onePair[0]] = 1;
					EDDATD.StartData.Transcriptions.allTimestamps.push(parseFloat(onePair[0]));
				}
			}
		}
	}
	seenTimestamps = {};
	EDDATD.StartData.Proteins.allTimestamps = [];

	for (var key in EDDATD.StartData.Proteins.sets) {
		var oneSet = EDDATD.StartData.Proteins.sets[key];
		var oneSetData = oneSet.d;
		for (var p in oneSetData) {
			var onePair:any = oneSetData[p];		
			if (!isNaN(parseFloat(onePair[0]))) {
				if (typeof seenTimestamps[onePair[0]] == 'undefined') {
					seenTimestamps[onePair[0]] = 1;
					EDDATD.StartData.Proteins.allTimestamps.push(parseFloat(onePair[0]));
				}
			}
		}
	}

	EDDATD.StartData.Metabolites.allTimestamps.sort(function(a,b){return a - b}); // Sort ascending
	EDDATD.StartData.Transcriptions.allTimestamps.sort(function(a,b){return a - b}); // Sort ascending
	EDDATD.StartData.Proteins.allTimestamps.sort(function(a,b){return a - b}); // Sort ascending

	// Once we have a list of all possible X values, we can go through each
	// set of measurement data in turn, using allTimestamps to pick up the values
	// in the measurement data and create empty spots elsewhere.
	var labelIndex = 0;

	for (var i=0; i < EDDATD.StartData.Metabolites.sets.length; i++) {
		var oneSet = EDDATD.StartData.Metabolites.sets[i];

		EDDATD.StartData.Metabolites.allALabels[labelIndex] = oneSet.an;
		EDDATD.StartData.Metabolites.allCLabels[labelIndex] = oneSet.mqp;
		EDDATD.StartData.Metabolites.allMLabels[labelIndex] = EDDData.MetaboliteTypes[oneSet.mt].sn;
		EDDATD.StartData.Metabolites.allULabels[labelIndex] = oneSet.un;

		var oneSetYValues:any = {};
		var oneSetData = oneSet.d;
		for (var p in oneSetData) {
			var onePair:any = oneSetData[p];		
			if (!isNaN(parseFloat(onePair[0]))) { // If the x value can be parsed
				if (!isNaN(parseFloat(onePair[1]))) {
					oneSetYValues[onePair[0]] = onePair[1];
				} else {
					oneSetYValues[onePair[0]] = '';					
				}
			}
		}
		EDDATD.StartData.Metabolites.tempGraphData[labelIndex] = [];
		var valueIndex = 0;
		for (var p in EDDATD.StartData.Metabolites.allTimestamps) {
			var thisXY = oneSetYValues[EDDATD.StartData.Metabolites.allTimestamps[p]];

			if (typeof thisXY != 'undefined') {
				EDDATD.StartData.Metabolites.tempGraphData[labelIndex][valueIndex] = thisXY;
			} else {
				EDDATD.StartData.Metabolites.tempGraphData[labelIndex][valueIndex] = '';
			}
			valueIndex++;
		}
		labelIndex++;
	}

	labelIndex = 0;

	for (var i=0; i < EDDATD.StartData.Transcriptions.sets.length; i++) {
		var oneSet = EDDATD.StartData.Transcriptions.sets[i];

		EDDATD.StartData.Transcriptions.allALabels[labelIndex] = oneSet.an;
		EDDATD.StartData.Transcriptions.allMLabels[labelIndex] = oneSet.mtn;

		var oneSetYValues:any = {};
		var oneSetData = oneSet.d;
		for (var p in oneSetData) {
			var onePair:any = oneSetData[p];		
			if (!isNaN(parseFloat(onePair[0]))) { // If the x value can be parsed
				if (!isNaN(parseFloat(onePair[1]))) {
					oneSetYValues[onePair[0]] = onePair[1];
				} else {
					oneSetYValues[onePair[0]] = '';					
				}
			}
		}
		EDDATD.StartData.Transcriptions.tempGraphData[labelIndex] = [];
		var valueIndex = 0;
		for (var p in EDDATD.StartData.Transcriptions.allTimestamps) {
			var thisXY = oneSetYValues[EDDATD.StartData.Transcriptions.allTimestamps[p]];

			if (typeof thisXY != 'undefined') {
				EDDATD.StartData.Transcriptions.tempGraphData[labelIndex][valueIndex] = thisXY;
			} else {
				EDDATD.StartData.Transcriptions.tempGraphData[labelIndex][valueIndex] = '';
			}
			valueIndex++;
		}
		labelIndex++;
	}

	labelIndex = 0;

	for (var i=0; i < EDDATD.StartData.Proteins.sets.length; i++) {
		var oneSet = EDDATD.StartData.Proteins.sets[i];

		EDDATD.StartData.Proteins.allALabels[labelIndex] = oneSet.an;
		EDDATD.StartData.Proteins.allMLabels[labelIndex] = oneSet.mtn;

		var oneSetYValues:any = {};
		var oneSetData = oneSet.d;
		for (var p in oneSetData) {
			var onePair:any = oneSetData[p];		
			if (!isNaN(parseFloat(onePair[0]))) { // If the x value can be parsed
				if (!isNaN(parseFloat(onePair[1]))) {
					oneSetYValues[onePair[0]] = onePair[1];
				} else {
					oneSetYValues[onePair[0]] = '';					
				}
			}
		}
		EDDATD.StartData.Proteins.tempGraphData[labelIndex] = [];
		var valueIndex = 0;
		for (var p in EDDATD.StartData.Proteins.allTimestamps) {
			var thisXY = oneSetYValues[EDDATD.StartData.Proteins.allTimestamps[p]];

			if (typeof thisXY != 'undefined') {
				EDDATD.StartData.Proteins.tempGraphData[labelIndex][valueIndex] = thisXY;
			} else {
				EDDATD.StartData.Proteins.tempGraphData[labelIndex][valueIndex] = '';
			}
			valueIndex++;
		}
		labelIndex++;
	}

	EDDATD.processImportSettings();
}

};

window.addEventListener('load', EDDATD.prepareIt, false);
