/// <reference path="typescript-declarations.d.ts" />
var DataGridServerSide = (function () {
    // This binds a DataGridServerSide object to a table.
    // As much as possible, that object instance will be responding to events
    // related to the table.
    function DataGridServerSide(table, tablebody) {
        this._lastHeaderThatSorted = null;
        this._showRowsButton = null; // This is the button with tableControlType=showRowsButton
        // This comes from _showRowsButton's rowsToShow attribute.
        // It is parallel to (indexed the same as) this._datarows.
        // Whether this exists or not, you can call DataGridServerSide._isRowEnabled
        // to check a row's status.
        this._enabledRows = null;
        //
        // Member variable declarations
        //
        this._table = table;
        this._tablebody = tablebody;
        this._tableMainElementID = table.id;
        // Did they give us a helper? (The helper implements custom functionality
        // that belongs with whoever created the table.. stuff that can't or
        // shouldn't be genericized in DataGridServerSide).
        //
        // See the DataGridHelperBase class to see what can be implemented.
        var helperClassName = this._table.getAttribute('data-helperClassName');
        if (helperClassName) {
            this._helper = new window[helperClassName]();
        }
        else {
            this._helper = new DataGridHelperBase();
        }
        // If the table has the sorting class applied to it, prepare it for sorting
        if ($(table).hasClass('sortable')) {
            this._handleSortable();
        }
        // If the table has the hasRowToggleTableClass class applied to it, it contains
        // attributes that point to another element on the page, which in turn contains
        // checkboxes that show/hide rows in the first table based on their own embedded attributes.
        //   The table may also contain a reference to a widget that we should place a
        // callback on in order to trigger a refresh of the table.
        if ($(table).hasClass('hasrowtoggletable')) {
            this._handleRowToggleTable();
        }
        // Look for the css class that signifies the presence of a comma-separated list of controls
        // that all apply to this table
        if ($(table).hasClass('hastablecontrols')) {
            this._handleTableControls();
        }
        this._handleStriping();
        this._helper.onInitialized(this);
    }
    // Return a list of <tr> elements with the specified group ID.
    DataGridServerSide.prototype.getRowsWithGroupID = function (groupID) {
        return this._groupIDToRows[groupID.toString()];
    };
    // Returns true if this group is expanded or false if it's collapsed.
    DataGridServerSide.prototype.isGroupExpanded = function (groupID) {
        return (this._groupsCollapsed[groupID] == 0);
    };
    // The server code hooks table headers with this function.
    DataGridServerSide.prototype.clickedSort = function (thisth) {
        var _this = this;
        $(thisth).addClass('sortwait');
        // We turn the rest of the operation into an event so the browser
        // will (probably) refresh, showing our 'please wait' style
        setTimeout(function () { return _this._sortIt(thisth); }, 1);
    };
    // Tells if the specified row is visible.
    // The row is identified by the lineID key passed in by the server code.
    DataGridServerSide.prototype.isRowVisible = function (lineID) {
        var row = this._getRowByLineID(lineID);
        return (row != null && DataGridServerSide._isRowVisible(row));
    };
    // Use this to show or hide columns. Specify "#all" to show or hide all columns.
    // The table will adjust column sizes as though the invisible columns weren't there.
    DataGridServerSide.prototype.setColumnVisibility = function (columnID, visible) {
        // Get a list of all header cells.
        var headerCells = this._getHeaderCells();
        // Filter the header cells.
        if (columnID != "#all") {
            for (var i = headerCells.length - 1; i >= 0; i--) {
                if (headerCells[i].id != columnID) {
                    headerCells.splice(i, 1);
                }
            }
        }
        var displayStyle = (visible ? "" : "none");
        for (var i = 0; i < this._tablebody.rows.length; i++) {
            var row = this._tablebody.rows[i];
            for (var j = 0; j < headerCells.length; j++) {
                var cell = row.cells[headerCells[j].index];
                if (cell) {
                    cell.style.display = displayStyle;
                }
            }
        }
    };
    // Returns a list of {lineID, cell} objects (id comes from the line ID that was given on the server
    // when the table was created).
    DataGridServerSide.prototype.getColumnCells = function (columnID, includeHeaders) {
        includeHeaders = (typeof includeHeaders !== 'undefined' ? includeHeaders : false);
        var columnIndex = this._getColumnIndexByID(columnID);
        if (columnIndex == -1)
            return [];
        var ret = [];
        for (var i = 0; i < this._tablebody.rows.length; i++) {
            var row = this._tablebody.rows[i];
            var cell = row.cells[columnIndex];
            if (cell) {
                // Skip header cells?
                if (!includeHeaders && cell.tagName.toLowerCase() == 'th')
                    continue;
                var lineID = this._getLineIDFromRow(row);
                ret.push({ lineID: lineID, cell: cell });
            }
        }
        return ret;
    };
    // Handle the "hasrowtoggletable" CSS class on a table.
    DataGridServerSide.prototype._handleRowToggleTable = function () {
        var pThis = this;
        var checkboxestoprocess = new Array();
        var tableWithTogglesID = this._table.getAttribute("rowToggleTable");
        if (tableWithTogglesID) {
            var tableWithToggles = document.getElementById(tableWithTogglesID);
            if (tableWithToggles) {
                for (var trows = 0; trows < tableWithToggles.rows.length; ++trows) {
                    for (var tcells = 0; tcells < tableWithToggles.rows[trows].cells.length; ++tcells) {
                        var td = tableWithToggles.rows[trows].cells[tcells];
                        var cb = td.getElementsByTagName('input');
                        if (cb) {
                            // The first input element of each table cell
                            if (cb[0]) {
                                if (cb[0].type.toLowerCase() == 'checkbox') {
                                    // The set of rows to enable is stored in an
                                    // attribute of the checkbox called 'rowsToShow'
                                    var showvaluesattrib = cb[0].getAttribute("rowsToShow");
                                    if (showvaluesattrib) {
                                        // It's a comma-separated list of integers, so we're going
                                        // to read it out, split it, and parse the ints into an array
                                        // for later use.
                                        var showvalues = showvaluesattrib.split(',');
                                        var showarray = new Array();
                                        for (var splitindex = 0; splitindex < showvalues.length; splitindex++) {
                                            var sindex = parseInt(showvalues[splitindex], 10);
                                            showarray.push(sindex);
                                        }
                                        cb[0].showarray = showarray;
                                        checkboxestoprocess.push(cb[0]);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        this._checkboxestoprocess = checkboxestoprocess;
        var triggerButtonID = this._table.getAttribute("rowToggleTriggerButton");
        if (triggerButtonID) {
            this._triggerButton = document.getElementById(triggerButtonID);
            if (this._triggerButton) {
                this._triggerButton.originalValue = this._triggerButton.getAttribute("value");
                this._triggerButton.onclick = function () {
                    pThis._clickedRefresh();
                };
            }
        }
    };
    DataGridServerSide.prototype._clickedRefresh = function () {
        var pThis = this;
        this._triggerButton.value = "Please Wait...";
        // We turn the rest of the operation into an event so the browser
        // will (probably) refresh, showing our 'please wait' message
        setTimeout(function () {
            pThis._refreshIt();
        }, 1, this);
    };
    DataGridServerSide.prototype._refreshIt = function () {
        var tablebody = this._tablebody;
        var tabledatarows = this._datarows;
        var rowdisplayflags = new Array();
        for (var i = 0; i < tabledatarows.length; i++) {
            rowdisplayflags[i] = 0;
        }
        if (this._checkboxestoprocess) {
            var checkboxestoprocess = this._checkboxestoprocess;
            for (var box = 0; box < checkboxestoprocess.length; box++) {
                var thisbox = checkboxestoprocess[box];
                if (thisbox.checked == true) {
                    if (thisbox.showarray) {
                        var theserows = thisbox.showarray;
                        for (var rowindex = 0; rowindex < theserows.length; rowindex++) {
                            rowdisplayflags[theserows[rowindex]] = 1;
                        }
                    }
                }
            }
        }
        for (var i = 0; i < tabledatarows.length; i++) {
            var flag = rowdisplayflags[i];
            if (flag == 1) {
                $(tabledatarows[i]).removeClass('off');
            }
            else {
                $(tabledatarows[i]).addClass('off');
            }
        }
        // Restore original text on the trigger button.
        this._triggerButton.value = this._triggerButton.originalValue;
    };
    // Handle the "hastablecontrols" CSS class on a table.
    DataGridServerSide.prototype._handleTableControls = function () {
        var tableControlsString = this._table.getAttribute("rowToggleControls");
        // If the control list is present, split it at the commas and look for each control
        if (tableControlsString) {
            var tableRowControlObjects = new Array();
            var toggleControlsList = tableControlsString.split(',');
            for (var controlIndex = 0; controlIndex < toggleControlsList.length; controlIndex++) {
                var oneToggleControl = document.getElementById(toggleControlsList[controlIndex]);
                if (!oneToggleControl)
                    continue;
                // If the control is present, look for the attribute declaring the type of control it is
                var controlType = oneToggleControl.getAttribute("tableControlType");
                if (controlType) {
                    // If it has a control type, consider it a valid object and add it to the array
                    tableRowControlObjects.push(oneToggleControl);
                    // If the control is of the "select all the checkboxes in the rows" type:
                    if (controlType == 'selectAllButton') {
                        this._handleSelectAllButton(oneToggleControl);
                    }
                    // If the control is of the "hide the rows when the button's enabled" type:
                    if (controlType == 'showRowsButton') {
                        this._handleShowRowsButton(oneToggleControl);
                    }
                    // If the control is of the "hide the rows when the button's enabled" type:
                    if (controlType == 'multiTableShowRowsButton') {
                        this._handleMultiTableShowRowsButton(oneToggleControl);
                    }
                    // If the control is of the 'show the rows described by the pulldown item' type:
                    if (controlType == 'showRowsPulldown') {
                        this._handleShowRowsPulldown(oneToggleControl);
                    }
                }
            }
            // Save the populated array of control objects, so we can run through it later
            // when we want to refresh all the controls at once.
            this._tablerowcontrols = tableRowControlObjects;
        }
        var tableControlsString = this._table.getAttribute("colToggleControls");
        // If the control list is present, split it at the commas and look for each control
        if (tableControlsString) {
            var tableColControlObjects = new Array();
            var toggleControlsList = tableControlsString.split(',');
            for (var controlIndex = 0; controlIndex < toggleControlsList.length; controlIndex++) {
                var oneToggleControl = document.getElementById(toggleControlsList[controlIndex]);
                // If the control is present, look for the attribute declaring the type of control it is
                if (oneToggleControl) {
                    var controlType = oneToggleControl.getAttribute("tableControlType");
                    if (!controlType)
                        continue;
                    // If it has a control type, consider it a valid object and add it to the array
                    tableColControlObjects.push(oneToggleControl);
                    // If the control is of the "clickable pulldown menu"
                    // or "column chooser" type:
                    if ((controlType == 'pulldownMenu') || (controlType == 'columnMenu')) {
                        this._handlePulldownOrColumnMenu(oneToggleControl);
                    }
                    // If the control is of the "clickable column chooser menu" type:
                    if (controlType == 'columnMenu') {
                        this._handleColumnMenu(oneToggleControl);
                    }
                    // If the control is of the "column enable/disable checkbox" type:
                    if (controlType == 'columnCheckbox') {
                        this._handleColumnCheckbox(oneToggleControl);
                    }
                }
            }
            // Save the populated array of control objects, so we can run through it later
            // when we want to refresh all the controls at once.
            this._tablecolcontrols = tableColControlObjects;
        }
    };
    DataGridServerSide.prototype._handleSelectAllButton = function (oneToggleControl) {
        oneToggleControl.enabledState = 0;
        oneToggleControl.originalValue = oneToggleControl.getAttribute("value");
        oneToggleControl.allValue = oneToggleControl.getAttribute("allvalue");
        oneToggleControl.noneValue = oneToggleControl.getAttribute("nonevalue");
        oneToggleControl.dataGridToRefresh = this;
        oneToggleControl.addEventListener('click', function () { return DataGridServerSide._clickedRowControl(oneToggleControl); }, false);
    };
    // This gets its data from the control with tableControlType="showRowsButton".
    // The server-side code embeds a list of rows in an attribute called "rowsToShow",
    // which we parse and store as control.showarray.
    //
    // rowIndex indexes this._datarows
    DataGridServerSide.prototype._isRowEnabled = function (rowIndex) {
        if (this._enabledRows) {
            return this._enabledRows[rowIndex];
        }
        else {
            return true;
        }
    };
    DataGridServerSide.prototype._handleShowRowsButton = function (oneToggleControl) {
        this._showRowsButton = oneToggleControl;
        oneToggleControl.dataGridToRefresh = this;
        $(oneToggleControl).click(function () { return DataGridServerSide._clickedRowControl(oneToggleControl); });
        if (oneToggleControl.getAttribute("defaultState")) {
            oneToggleControl.enabledState = 1;
        }
        else {
            oneToggleControl.enabledState = 0;
        }
        oneToggleControl.showarray = new Array();
        // The set of rows to keep visible is stored in an
        // attribute of the button called 'rowsToShow'
        var showvaluesattrib = oneToggleControl.getAttribute("rowsToShow");
        if (showvaluesattrib) {
            this._enabledRows = new Array();
            for (var i = 0; i < this._datarows.length; i++) {
                this._enabledRows[i] = 0;
            }
            // It's a comma-separated list of integers, so we're going
            // to read it out, split it, and parse the ints into an array
            // for later use.
            var showvalues = showvaluesattrib.split(',');
            for (var splitindex = 0; splitindex < showvalues.length; splitindex++) {
                var sindex = parseInt(showvalues[splitindex], 10);
                oneToggleControl.showarray.push(sindex);
                this._enabledRows[sindex] = 1;
            }
        }
    };
    DataGridServerSide.prototype._handleMultiTableShowRowsButton = function (oneToggleControl) {
        if (!oneToggleControl.alreadySetUp) {
            oneToggleControl.alreadySetUp = 1;
            oneToggleControl.dataGridsToRefresh = new Array();
            $(oneToggleControl).click(function () { return DataGridServerSide._clickedRowControl(oneToggleControl); });
            if (oneToggleControl.getAttribute("defaultState")) {
                oneToggleControl.enabledState = 1;
            }
            else {
                oneToggleControl.enabledState = 0;
            }
        }
        oneToggleControl.dataGridsToRefresh.push(this);
        var showarraylabel = this._tableMainElementID;
        oneToggleControl[showarraylabel] = new Array();
        // The set of rows to keep visible is stored in an
        // attribute of the button called 'rowsToShow'
        var showvaluesattrib = oneToggleControl.getAttribute(showarraylabel);
        if (showvaluesattrib) {
            // It's a comma-separated list of integers, so we're going
            // to read it out, split it, and parse the ints into an array
            // for later use.
            var showvalues = showvaluesattrib.split(',');
            for (var splitindex = 0; splitindex < showvalues.length; splitindex++) {
                var sindex = parseInt(showvalues[splitindex], 10);
                oneToggleControl[showarraylabel].push(sindex);
            }
        }
    };
    DataGridServerSide.prototype._handleShowRowsPulldown = function (oneToggleControl) {
        var pThis = this;
        oneToggleControl.onclick = function () {
            setTimeout(function () {
                pThis._refreshRowObjects();
            }, 1);
        };
        for (var toptions = 0; toptions < oneToggleControl.options.length; ++toptions) {
            var oneop = oneToggleControl.options[toptions];
            var showvaluesattrib = oneop.getAttribute("rowsToShow");
            if (showvaluesattrib) {
                // It's a comma-separated list of integers, so we're going
                // to read it out, split it, and parse the ints into an array
                // for later use.
                var showvalues = showvaluesattrib.split(',');
                var showarray = new Array();
                for (var splitindex = 0; splitindex < showvalues.length; splitindex++) {
                    var sindex = parseInt(showvalues[splitindex], 10);
                    showarray.push(sindex);
                }
                oneop.showarray = showarray;
            }
        }
    };
    DataGridServerSide.prototype._refreshRowObjects = function () {
        var tablebody = this._tablebody;
        if ((!this._datarows) || (!this._tablerowcontrols)) {
            return;
        }
        // This data structure was prepared by the 'sortable' code
        var tabledatarows = this._datarows;
        var rowdisplayflags = new Array();
        for (var i = 0; i < tabledatarows.length; i++) {
            rowdisplayflags[i] = 1;
        }
        var controlsArray = this._tablerowcontrols;
        for (var controlindex = 0; controlindex < controlsArray.length; controlindex++) {
            var oneControl = controlsArray[controlindex];
            var controlType = oneControl.getAttribute("tableControlType");
            if (!controlType) {
                continue;
            }
            // Control of type "hide some rows when the button's enabled"
            if (controlType == 'showRowsButton') {
                if (oneControl.enabledState == 1) {
                    for (i = 0; i < tabledatarows.length; i++) {
                        if (!this._isRowEnabled(i)) {
                            rowdisplayflags[i] = 0;
                        }
                    }
                    oneControl.value = oneControl.getAttribute("enabledLabel");
                }
                else {
                    // Show them all.  No change to the master list.
                    oneControl.value = oneControl.getAttribute("disabledLabel");
                }
            }
            // Control of type "hide some rows when the button's enabled"
            if (controlType == 'multiTableShowRowsButton') {
                if (oneControl.enabledState == 1) {
                    if (this._tableMainElementID) {
                        // The set of rows to show is stored in an array with the same name as the ID of this table
                        if (oneControl[this._tableMainElementID]) {
                            var theserows = oneControl[this._tableMainElementID];
                            var displayflagsmask = new Array();
                            for (i = 0; i < tabledatarows.length; i++) {
                                displayflagsmask[i] = 0;
                            }
                            for (var rowindex = 0; rowindex < theserows.length; rowindex++) {
                                displayflagsmask[theserows[rowindex]] = 1;
                            }
                            for (i = 0; i < tabledatarows.length; i++) {
                                if (displayflagsmask[i] == 0) {
                                    rowdisplayflags[i] = 0;
                                }
                            }
                        }
                    }
                    oneControl.value = oneControl.getAttribute("enabledLabel");
                }
                else {
                    // Show them all.  No change to the master list.
                    oneControl.value = oneControl.getAttribute("disabledLabel");
                }
            }
            // If the control is of the "show the rows described by the pulldown item" type:
            if (controlType == 'showRowsPulldown') {
                var oneop = oneControl.options[oneControl.selectedIndex];
                var optionValue = oneop.getAttribute("value");
                if (oneop.showarray) {
                    var displayflagsmask = new Array();
                    for (i = 0; i < tabledatarows.length; i++) {
                        displayflagsmask[i] = 0;
                    }
                    var theserows = oneop.showarray;
                    var rowindex = 0;
                    for (; rowindex < theserows.length; rowindex++) {
                        displayflagsmask[theserows[rowindex]] = 1;
                    }
                    for (i = 0; i < tabledatarows.length; i++) {
                        if (displayflagsmask[i] == 0) {
                            rowdisplayflags[i] = 0;
                        }
                    }
                }
                else {
                    if (optionValue == "all") {
                    }
                    else {
                        for (i = 0; i < tabledatarows.length; i++) {
                            rowdisplayflags[i] = 0;
                        }
                    }
                }
            }
        }
        for (var controlindex = 0; controlindex < controlsArray.length; controlindex++) {
            var oneControl = controlsArray[controlindex];
            var controlType = oneControl.getAttribute("tableControlType");
            if (!controlType) {
                continue;
            }
            // Control of type "check all the first checkboxes in the visible rows"
            if (controlType == 'selectAllButton') {
                if (oneControl.enabledState == 1) {
                    // Select All buttons activate once, then shut off.
                    oneControl.enabledState = 0; // TODO: This breaks during multi-table-body refresh
                    for (i = 0; i < tabledatarows.length; i++) {
                        var flag = rowdisplayflags[i];
                        if (flag != 1) {
                            continue;
                        }
                        for (var c = 0; c < tabledatarows[i].cells.length; ++c) {
                            var td = tabledatarows[i].cells[c];
                            if (td.tagName.toLowerCase() != 'td') {
                                continue;
                            }
                            var cb = td.getElementsByTagName('input');
                            if (!cb) {
                                continue;
                            }
                            if (!cb[0]) {
                                continue;
                            }
                            if (cb[0].type.toLowerCase() != 'checkbox') {
                                continue;
                            }
                            if (oneControl.toggled) {
                                cb[0].checked = false;
                            }
                            else {
                                cb[0].checked = true;
                            }
                        }
                    }
                    if (oneControl.toggled) {
                        oneControl.toggled = 0;
                        if (oneControl.allValue) {
                            oneControl.value = oneControl.allValue;
                        }
                        else if (oneControl.originalValue) {
                            oneControl.value = oneControl.originalValue;
                        }
                        else {
                            oneControl.value = "Select All";
                        }
                    }
                    else {
                        oneControl.toggled = 1;
                        if (oneControl.noneValue) {
                            oneControl.value = oneControl.noneValue;
                        }
                        else {
                            oneControl.value = "Deselect All";
                        }
                    }
                }
            }
        }
        var changedRowVisibility = false;
        for (i = 0; i < tabledatarows.length; i++) {
            var flag = rowdisplayflags[i];
            var row = tabledatarows[i];
            if (flag == 1 && !DataGridServerSide._isRowVisible(row)) {
                changedRowVisibility = true;
                DataGridServerSide._setRowVisible(row, true);
            }
            else if (flag != 1 && DataGridServerSide._isRowVisible(row)) {
                changedRowVisibility = true;
                DataGridServerSide._setRowVisible(row, false);
            }
        }
        // We can't do the striping at the same time we do the assignment of hide styles,
        // because the rows are in an unknown order.  The _stripeIt function, by contrast, goes down the
        // table in display order every time.
        this._stripeIt();
        if (changedRowVisibility) {
            // Let the helper react in case new rows became visible.
            this._helper.onRowVisibilityChanged();
        }
    };
    DataGridServerSide.prototype._stripeIt = function () {
        var tablebody = this._tablebody;
        // The set of rows we will be striping
        // is restricted to the main table.
        var rowstocheck = tablebody.rows;
        var striping = 1;
        var groupStriping = 0;
        var stripeStyles = ['stripeRowA', 'stripeRowB', 'groupStripeRowA', 'groupStripeRowB']; // TODO: No longer supported
        //var groupStripeStyles = ['groupHeaderStripeA','groupHeaderStripeB'];
        if ((tablebody.stripingA) && (tablebody.stripingB)) {
            stripeStyles[0][0] = stripeStyles[1][0] = tablebody.stripingA;
            stripeStyles[0][1] = stripeStyles[1][1] = tablebody.stripingB;
        }
        for (var j = 0; j < rowstocheck.length; j++) {
            var row = rowstocheck[j];
            if (row.applyStriping == true) {
                // If it's not hidden, apply striping
                if ($(row).hasClass('off'))
                    continue;
                if (row.compRow == true) {
                }
                else {
                    striping = 1 - striping;
                }
                for (var s in stripeStyles) {
                    $(row).removeClass(stripeStyles[s]);
                }
                $(row).addClass(stripeStyles[groupStriping * 2 + striping]);
            }
            else {
                striping = 1; // If we pass over a row that's not a data row, reset the striping
            }
        }
    };
    DataGridServerSide.prototype._handlePulldownOrColumnMenu = function (oneToggleControl) {
        oneToggleControl.dataGridToRefresh = this;
        var labelOff = null;
        var labelOn = null;
        var menuBlock = null;
        var kids = oneToggleControl.childNodes;
        for (var k = 0; k < kids.length; ++k) {
            if ($(kids[k]).hasClass('pulldownMenuLabelOff')) {
                labelOff = kids[k];
            }
            if ($(kids[k]).hasClass('pulldownMenuLabelOn')) {
                labelOn = kids[k];
            }
            if ($(kids[k]).hasClass('pulldownMenuMenuBlock')) {
                menuBlock = kids[k];
            }
        }
        if (labelOff && labelOn && menuBlock) {
            labelOff.labelOn = labelOn;
            labelOff.menuBlock = menuBlock;
            labelOn.menuBlock = menuBlock;
            $(labelOff).click(function () { return DataGridServerSide._clickedColMenuWhileOff(labelOff); });
            $(labelOn).click(function () { return DataGridServerSide._clickedColMenuWhileOn(labelOn); });
        }
    };
    DataGridServerSide.prototype._handleColumnMenu = function (oneToggleControl) {
        var cb = oneToggleControl.getElementsByTagName('input');
        var checkBoxSet = new Array();
        for (var c = 0; c < cb.length; ++c) {
            if (cb[c].type.toLowerCase() == 'checkbox') {
                $(cb[c]).click(function () { return DataGridServerSide._clickedColControl(oneToggleControl); });
                checkBoxSet.push(cb[c]);
                var columnIndexes = cb[c].getAttribute("columnIndexes");
                if (columnIndexes) {
                    var columnIDvs = columnIndexes.split(',');
                    var colObjs = new Array();
                    for (var splitindex = 0; splitindex < columnIDvs.length; splitindex++) {
                        var sindex = parseInt(columnIDvs[splitindex], 10);
                        colObjs.push(sindex);
                    }
                    cb[c].columnIndexes = colObjs;
                }
                var headerCells = cb[c].getAttribute("headerCells");
                if (headerCells) {
                    var cellIDvs = headerCells.split(',');
                    var cellObjs = new Array();
                    for (var splitindex = 0; splitindex < cellIDvs.length; splitindex++) {
                        var targetCell = document.getElementById(cellIDvs[splitindex]);
                        if (targetCell) {
                            cellObjs.push(targetCell);
                        }
                    }
                    cb[c].headerCells = cellObjs;
                }
            }
        }
        oneToggleControl.checkBoxes = checkBoxSet;
    };
    DataGridServerSide.prototype._handleStriping = function () {
        var tablebody = this._tablebody;
        // Set default table striping styles
        this._stripingA = 'stripeRowA';
        this._stripingB = 'stripeRowB';
        // If the table has a "stripingStyles" attribute, divide the string into the two substrings
        // that represent the styles to apply when re-striping after a sort
        var stripingString = this._table.getAttribute("stripingStyles");
        // If the control list is present, split it at the commas and look for each control
        if (stripingString) {
            var stripeStylesList = stripingString.split(',');
            // Only write them in if there are two
            if ((stripeStylesList[0]) && (stripeStylesList[1])) {
                this._stripingA = stripeStylesList[0];
                this._stripingB = stripeStylesList[1];
            }
        }
    };
    // Get the index of a column based on the column's name.
    // Returns -1 if not found.
    // (For now, we're just using the column's text as its name.. later maybe we can have a better form of ID).
    DataGridServerSide.prototype._getColumnIndexByID = function (columnID) {
        var headerCells = this._getHeaderCells();
        for (var i = 0; i < headerCells.length; i++) {
            if (headerCells[i].cell.id == columnID) {
                return headerCells[i].index;
            }
        }
        return -1;
    };
    // Returns an array of all the <th> cells.
    // If you pass an array for columnIndices, it'll add the column index for each header cell.
    DataGridServerSide.prototype._getHeaderCells = function () {
        // Gather all the column headers.
        var nonheaderrows = new Array();
        var headerrows = new Array();
        this._getHeaderRows(headerrows, nonheaderrows);
        // There should generally only ever be one row with headers.
        // It is possible to create sections of headers, using rowspans for non-section cells and columnspans across the top of each section,
        // But presently DataGrid is not supporting those.
        if (headerrows.length != 1) {
            console.log("Table has more than one header row??");
        }
        var headerCells = [];
        for (var iRow in headerrows) {
            var row = headerrows[iRow];
            for (var iCell = 0; iCell < row.cells.length; iCell++) {
                var cell = row.cells[iCell];
                if (cell.tagName.toLowerCase() == 'th') {
                    var a = {
                        cell: cell,
                        index: iCell,
                        id: cell.id || ''
                    };
                    headerCells.push(a);
                }
            }
        }
        return headerCells;
    };
    // Gather the list of header and nonheader rows.
    DataGridServerSide.prototype._getHeaderRows = function (headerrows, nonheaderrows) {
        // For each row of the main table,
        var rowstocheck = this._tablebody.rows;
        for (var j = 0; j < rowstocheck.length; j++) {
            var itsaheaderrow = false;
            var foundcells = rowstocheck[j].cells;
            // If it has any header cells in it,
            if (foundcells.length) {
                for (var k = 0; k < foundcells.length; k++) {
                    var thisheadcell = foundcells[k];
                    if (thisheadcell.tagName.toLowerCase() == 'th') {
                        // Whether or not the header cells in the row invoke sorts, 
                        // we still consider it a header row and exclude it from sorting
                        itsaheaderrow = true;
                        break;
                    }
                }
            }
            if (itsaheaderrow == true) {
                headerrows.push(rowstocheck[j]);
            }
            else {
                nonheaderrows.push(rowstocheck[j]);
            }
        }
    };
    // Handle the "sortable" CSS class in a table.
    DataGridServerSide.prototype._handleSortable = function () {
        var pThis = this;
        var tablebody = this._tablebody;
        // The set of rows we will be hiding or sorting
        // is restricted to the main table.
        var rowstocheck = tablebody.rows;
        for (var j = 0; j < rowstocheck.length; j++) {
            if (!rowstocheck[j].getAttribute("nostriping") && !$(rowstocheck[j]).hasClass('columnLabels')) {
                rowstocheck[j].applyStriping = true;
            }
            if (rowstocheck[j].getAttribute("comprow")) {
                rowstocheck[j].compRow = true;
            }
        }
        var nonheaderrows = new Array();
        var headerrows = new Array();
        this._getHeaderRows(headerrows, nonheaderrows);
        // For each of the rows we've detected to be header rows,
        var firstHeaderCell = null;
        for (var j = 0; j < headerrows.length; j++) {
            var foundcells = headerrows[j].cells;
            // If it has any header cells in it,
            if (foundcells.length) {
                for (var k = 0; k < foundcells.length; k++) {
                    var thisheadcell = foundcells[k];
                    if (thisheadcell.tagName.toLowerCase() == 'th') {
                        if ($(thisheadcell).hasClass('sortheader')) {
                            if (firstHeaderCell == null)
                                firstHeaderCell = thisheadcell;
                            var func = function (headCell) {
                                return function () {
                                    pThis.clickedSort(headCell);
                                };
                            };
                            thisheadcell.onclick = func(thisheadcell);
                            var order = new Array();
                            var reverseorder = new Array();
                            // The order in which to arrange the rows is embedded in an
                            // attribute of this header cell called 'sortvalues'
                            var sortvaluesattrib = thisheadcell.getAttribute("sortvalues");
                            if (sortvaluesattrib) {
                                // It's a comma-separated list of integers, so we're going
                                // to read it out, split it, and parse the ints into an array
                                // for later use.
                                DataGridServerSide._parseNumberList(sortvaluesattrib, order);
                                // If they've manually specified the reverse sort order, use that.
                                // Otherwise, we'll set it out automatically.
                                var reverse_sortvaluesattrib = thisheadcell.getAttribute("reversesortvalues");
                                if (reverse_sortvaluesattrib) {
                                    DataGridServerSide._parseNumberList(reverse_sortvaluesattrib, reverseorder);
                                }
                                else {
                                    // Now we'll build a reversed version of the array,
                                    // for reverse-sorting, taking the 'compRow' values into account
                                    var reversecomprows = new Array();
                                    for (var splitindex = order.length - 1; splitindex >= 0; splitindex--) {
                                        var pindex = order[splitindex];
                                        if (!nonheaderrows[pindex]) {
                                            continue;
                                        }
                                        if (nonheaderrows[pindex].compRow) {
                                            if (nonheaderrows[pindex].compRow == true) {
                                                reversecomprows.push(pindex);
                                                continue;
                                            }
                                        }
                                        // If it's not a companion row, append any of the comp rows
                                        // we have accumulated since the last non-comp row.
                                        reverseorder.push(pindex);
                                        while (reversecomprows.length) {
                                            reverseorder.push(reversecomprows.pop());
                                        }
                                    }
                                }
                            }
                            thisheadcell.sortorder = order;
                            thisheadcell.reversesortorder = reverseorder;
                        }
                    }
                }
            }
        }
        this._headerrows = headerrows;
        this._datarows = nonheaderrows;
        // To start with, sort on the first column. This is good to make sure the client
        // has everything setup properly (if not, it will be wrong right away).
        // This also ensures that we always have a  valid this._lastHeaderThatSorted value so 
        // we know what to sort on if grouping is toggled.
        if (firstHeaderCell)
            this._sortIt(firstHeaderCell);
    };
    DataGridServerSide.prototype._handleColumnCheckbox = function (oneToggleControl) {
        oneToggleControl.dataGridToRefresh = this;
        if (oneToggleControl.type) {
            if (oneToggleControl.type.toLowerCase() == 'checkbox') {
                $(oneToggleControl).click(function () { return DataGridServerSide._clickedColControl(oneToggleControl); });
                var columnIndexes = oneToggleControl.getAttribute("columnIndexes");
                if (columnIndexes) {
                    var columnIDvs = columnIndexes.split(',');
                    var colObjs = new Array();
                    for (var splitindex = 0; splitindex < columnIDvs.length; splitindex++) {
                        var sindex = parseInt(columnIDvs[splitindex], 10);
                        colObjs.push(sindex);
                    }
                    oneToggleControl.columnIndexes = colObjs;
                }
                var headerCells = oneToggleControl.getAttribute("headerCells");
                if (headerCells) {
                    var cellIDvs = headerCells.split(',');
                    var cellObjs = new Array();
                    for (var splitindex = 0; splitindex < cellIDvs.length; splitindex++) {
                        var targetCell = document.getElementById(cellIDvs[splitindex]);
                        if (targetCell) {
                            cellObjs.push(targetCell);
                        }
                    }
                    oneToggleControl.headerCells = cellObjs;
                }
            }
        }
    };
    // Return the line ID from the row.
    DataGridServerSide.prototype._getLineIDFromRow = function (row) {
        return row.getAttribute('data-line-id');
    };
    // Find a row from its line ID.
    DataGridServerSide.prototype._getRowByLineID = function (lineID) {
        for (var i = 0; i < this._datarows.length; ++i) {
            var row = this._datarows[i];
            if (this._getLineIDFromRow(row) == lineID)
                return row;
        }
        return null;
    };
    DataGridServerSide.prototype._refreshColObjects = function () {
        var tablebody = this._tablebody;
        if ((this._datarows) && (this._tablecolcontrols)) {
            // This data structure was prepared by the 'sortable' code
            var tabledatarows = this._datarows;
            var colDisplayFlags = new Array();
            var headerCellsToShow = new Array();
            var headerCellsToHide = new Array();
            for (var cellA = tabledatarows[0].firstChild, i = 0; cellA != null; cellA = cellA.nextSibling) {
                if (cellA.nodeType == 1) {
                    colDisplayFlags[i++] = 1;
                }
            }
            var controlsArray = this._tablecolcontrols;
            for (var controlindex = 0; controlindex < controlsArray.length; controlindex++) {
                var oneControl = controlsArray[controlindex];
                var controlType = oneControl.getAttribute("tableControlType");
                if (controlType) {
                    if (controlType == 'columnMenu') {
                        if (oneControl.checkBoxes) {
                            var boxList = oneControl.checkBoxes;
                            for (var box = 0; box < boxList.length; box++) {
                                var colIndexes = boxList[box].columnIndexes;
                                var headerCells = boxList[box].headerCells;
                                if (headerCells) {
                                    if (boxList[box].checked) {
                                        for (var change = 0; change < headerCells.length; change++) {
                                            headerCellsToShow.push(headerCells[change]);
                                        }
                                    }
                                    else {
                                        for (var change = 0; change < headerCells.length; change++) {
                                            headerCellsToHide.push(headerCells[change]);
                                        }
                                    }
                                }
                                if (boxList[box].checked) {
                                    for (var change = 0; change < colIndexes.length; change++) {
                                        colDisplayFlags[colIndexes[change]] = 1;
                                    }
                                }
                                else {
                                    for (var change = 0; change < colIndexes.length; change++) {
                                        colDisplayFlags[colIndexes[change]] = 0;
                                    }
                                }
                            }
                        }
                    }
                    if (controlType == 'columnCheckbox') {
                        var colIndexes = oneControl.columnIndexes;
                        var headerCells = oneControl.headerCells;
                        if (headerCells) {
                            if (oneControl.checked) {
                                for (var change = 0; change < headerCells.length; change++) {
                                    headerCellsToShow.push(headerCells[change]);
                                }
                            }
                            else {
                                for (var change = 0; change < headerCells.length; change++) {
                                    headerCellsToHide.push(headerCells[change]);
                                }
                            }
                        }
                        if (oneControl.checked) {
                            for (var change = 0; change < colIndexes.length; change++) {
                                colDisplayFlags[colIndexes[change]] = 1;
                            }
                        }
                        else {
                            for (var change = 0; change < colIndexes.length; change++) {
                                colDisplayFlags[colIndexes[change]] = 0;
                            }
                        }
                    }
                }
            }
            for (var i = 0; i < tabledatarows.length; i++) {
                var cells = tabledatarows[i].cells;
                for (var cell = 0; cell < cells.length; cell++) {
                    $(cells[cell]).removeClass('off');
                    if (!colDisplayFlags[cell]) {
                        $(cells[cell]).addClass('off');
                    }
                }
            }
            for (var i = 0; i < headerCellsToShow.length; i++) {
                headerCellsToShow[i].style.display = 'table-cell';
            }
            for (var i = 0; i < headerCellsToHide.length; i++) {
                headerCellsToHide[i].style.display = 'none';
            }
        }
    };
    // Sort by a particular column.
    // thisth is the <th> element for the table header.
    // sameSortOrder is optional. If it's true, then we'll use the same sort order as thisth previously used.
    DataGridServerSide.prototype._sortIt = function (thisth, sameSortOrder) {
        if (sameSortOrder === void 0) { sameSortOrder = false; }
        var lastheaderthatsorted;
        // We need to track which header was the last to sort this table,
        // so we're storing a reference to the header's object in the table object.
        // If that reference is null, the table is unsorted...
        if (this._lastHeaderThatSorted == null) {
            lastheaderthatsorted = thisth;
        }
        else {
            lastheaderthatsorted = this._lastHeaderThatSorted;
        }
        $(lastheaderthatsorted).removeClass('sortedup');
        $(lastheaderthatsorted).removeClass('sorteddown');
        // If we just sorted on this column, and reversesort has been defined but is zero,
        // do a reverse sort.
        var reversesort = 0;
        if (sameSortOrder == false) {
            if (lastheaderthatsorted == thisth && thisth.reverseSort == 0)
                reversesort = 1;
        }
        else {
            reversesort = thisth.reverseSort;
        }
        // Grab the right ordering table.
        var order;
        if (reversesort == 1) {
            order = thisth.reversesortorder;
        }
        else {
            order = thisth.sortorder;
        }
        this._reinsertRows(this._getIndexedList(this._datarows, order));
        // Add stripes.
        this._stripeIt();
        // Update CSS styles to reflect which direction it's sorted in.
        $(thisth).removeClass('sortwait');
        if (reversesort == 1) {
            $(thisth).addClass('sorteddown');
        }
        else {
            $(thisth).addClass('sortedup');
        }
        // Remember that we last sorted by this column, and remember the direction.
        this._lastHeaderThatSorted = thisth;
        thisth.reverseSort = reversesort;
    };
    // Returns an array ordered by indexing inputList with order.
    DataGridServerSide.prototype._getIndexedList = function (inputList, order) {
        var resultArray = new Array(order.length);
        for (var i = 0; i < order.length; i++)
            resultArray[i] = inputList[order[i]];
        return resultArray;
    };
    // Reinsert rows into this._tablebody in the order specified by order.
    DataGridServerSide.prototype._reinsertRows = function (rows) {
        for (var i = 0; i < rows.length; i++) {
            if (rows[i]) {
                this._tablebody.appendChild(rows[i]); // Append automatically does a removeChild beforehand
            }
        }
    };
    // This is called after the page loads. It creates a DataGridServerSide for every <table>
    // in the page, and each DataGridServerSide instance will scan its <table> for features.
    //
    // Note that DataGridServerSide won't muck with a <table> at all unless it contains DataGridServerSide-specific
    // attributes, so any tables without those attributes are safe.
    DataGridServerSide.scanPageForTables = function () {
        var tablebody;
        if (!document.getElementById || !document.createTextNode)
            return;
        // Find all tables that have markers like "hasrowtoggletable" embedded in their CSS classes.
        var ts = document.getElementsByTagName('table');
        for (var i = 0; i < ts.length; i++) {
            var table = ts[i];
            tablebody = table.getElementsByTagName('tbody')[0];
            if (!tablebody) {
                continue;
            }
            // Create a DataGridServerSide instance for this table.
            table.DataGridServerSide = new DataGridServerSide(table, tablebody);
        }
    };
    // add/remove 'on' and 'off' CSS styles to reflect visibility.
    DataGridServerSide._setRowVisible = function (row, isVisible) {
        if (isVisible) {
            $(row).addClass('on');
            $(row).removeClass('off');
        }
        else {
            $(row).addClass('off');
            $(row).removeClass('on');
        }
    };
    DataGridServerSide._isRowVisible = function (row) {
        return !$(row).hasClass('off');
    };
    // 'control' is a button.
    DataGridServerSide._clickedRowControl = function (control) {
        if (!control.dataGridsToRefresh && !control.dataGridToRefresh) {
            return;
        }
        control.value = "Please Wait...";
        if (control.enabledState == 0) {
            control.enabledState = 1;
        }
        else {
            control.enabledState = 0;
        }
        var dataGridRef = control.dataGridToRefresh;
        if (dataGridRef) {
            // We turn the rest of the operation into an event so the browser
            // will (probably) refresh, showing our 'please wait' message
            setTimeout(function () {
                dataGridRef._refreshRowObjects();
            }, 1);
        }
        else if (control.dataGridsToRefresh) {
            for (var i = 0; i < control.dataGridsToRefresh.length; i++) {
                dataGridRef = control.dataGridsToRefresh[i];
                setTimeout(function () {
                    dataGridRef._refreshRowObjects();
                }, 1);
            }
        }
    };
    // 'control' is the 'pulldownMenuLabelOff' control
    DataGridServerSide._clickedColMenuWhileOff = function (control) {
        if (control.menuBlock) {
            control.menuBlock.style.visibility = 'visible';
        }
        if (control.labelOn) {
            control.labelOn.style.visibility = 'visible';
        }
    };
    // 'control' is the 'pulldownMenuLabelOn' control
    DataGridServerSide._clickedColMenuWhileOn = function (control) {
        if (control.menuBlock) {
            control.menuBlock.style.visibility = 'hidden';
        }
        control.style.visibility = 'hidden';
    };
    // 'control' is a column checkbox
    DataGridServerSide._clickedColControl = function (control) {
        var dataGridRef = control.dataGridToRefresh;
        if (dataGridRef) {
            // We turn the rest of the operation into an event so the browser
            // will (probably) refresh, showing our 'please wait' message
            setTimeout(function () {
                dataGridRef._refreshColObjects();
            }, 1);
        }
    };
    // inList should be a string with comma-separated numbers
    // outList is an array that this function will push the parsed numbers into
    DataGridServerSide._parseNumberList = function (inList, outList) {
        var sortvalues = inList.split(',');
        for (var splitindex = 0; splitindex < sortvalues.length; splitindex++) {
            var pindex = parseInt(sortvalues[splitindex], 10);
            outList.push(pindex);
        }
    };
    // The server binds this. 'this' is a checkbox.
    DataGridServerSide._updateColumnSettings = function (obj) {
        // First thing we'll do is seek up until we find the required 'pagename' attribute.
        var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
        var att = obj.hasAttribute('pagename');
        while (!att && tn != "body") {
            obj = obj.parentNode || obj.parentElement;
            tn = obj.tagName.toLowerCase();
            att = obj.hasAttribute('pagename');
        }
        // If we walked up to the body of the document and found no 'pagename' attribute,
        // something's wrong with our document construction, so give up.
        if (!att) {
            return null;
        }
        // Fetch the all-important pagename attribute
        var pagename = obj.getAttribute('pagename');
        // Build an AJAX URL containing the required action and the pagename
        var url = "/PreferencesAjaxResp.cgi?action=_updateColumnSettings&pagename=" + encodeURIComponent(pagename);
        // Query every checkbox beneath the element that contained the pagename attribute,
        // and send its name and checked status back as part of the query.
        var cbs = obj.getElementsByTagName('input');
        for (var i = 0; i < cbs.length; i++) {
            var j = cbs[i];
            if (j.type.toLowerCase() == 'checkbox') {
                url += "&" + j.getAttribute('name') + "=" + encodeURIComponent(j.checked);
            }
        }
        $.ajax({
            url: url,
            dataTypeString: "json",
            success: function (data, textStatus, jqXHR) {
            }
        });
    };
    return DataGridServerSide;
})();
// People using DataGridServerSide can derive from this class and override
// whatever they want to customize functionality.
// The server side needs to specify your custom class name in the DataGridParams->{helpersClassName}
var DataGridHelperBase = (function () {
    function DataGridHelperBase() {
    }
    // This is called after everything is initialized.
    DataGridHelperBase.prototype.onInitialized = function (dataGrid) {
    };
    // Called when they hide or show rows.
    DataGridHelperBase.prototype.onRowVisibilityChanged = function () {
    };
    return DataGridHelperBase;
})();
window.addEventListener('load', function () {
    DataGridServerSide.scanPageForTables();
}, false);
