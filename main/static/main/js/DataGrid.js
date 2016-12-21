// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
//
// This is a re-implementation of DataGridServerSide for wholly client-side tables.
// Eventually DataGridServerSide should be phased out completely.
//
var DataGrid = (function () {
    // This binds a table element to an instance of DataGrid.
    // The previous contents of the table, if any, are deleted, and DataGrid takes over the table
    function DataGrid(dataGridSpec) {
        var _this = this;
        this._groupingEnabled = false; // grouping mode off by default
        this._sort = [];
        this._sequence = {};
        // Use !! double-not operator to coerce truth-y/false-y values to booleans
        Utl.JS.assert(!!dataGridSpec, "DataGrid needs to be supplied with a DataGridSpecBase-derived object.");
        Utl.JS.assert(!!(dataGridSpec.tableElement && dataGridSpec.tableSpec &&
            dataGridSpec.tableHeaderSpec && dataGridSpec.tableColumnSpec), "DataGridSpecBase-derived object does not have enough to work with.");
        //
        // Member variable declarations
        //
        // We need a DataGridSpecBase-derived table specification.
        // (This object describes the table and implements custom functionality
        // that belongs with whoever created the table.)
        // (See the DataGridSpecBase class to see what can be implemented.)
        this._spec = dataGridSpec;
        this._table = dataGridSpec.tableElement;
        this._timers = {};
        this._classes = 'dataTable sortable dragboxes hastablecontrols table-bordered';
        var tableBody = $(this._tableBody = document.createElement("tbody"));
        // First step: Blow away the old contents of the table
        $(this._table).empty()
            .attr({ 'cellpadding': 0, 'cellspacing': 0 })
            .addClass(this._getClasses())
            .append(tableBody);
        this._tableBodyJquery = tableBody;
        var tHeadRow = this._getTHeadRow();
        var tableHeaderRow = this._getTableHeaderRow().appendTo(tHeadRow);
        var tableHeaderCell = $(this._tableHeaderCell = this._getTableHeaderCell()).appendTo(tableHeaderRow);
        var waitBadge = $(this._waitBadge = document.createElement("span"))
            .addClass('waitbadge wait').appendTo(tableHeaderCell);
        if ((this._totalColumnCount = this.countTotalColumns()) > 1) {
            tableHeaderCell.attr('colspan', this._totalColumnCount);
        }
        this._section = $(tableBody).parent().parent();
        // If we're asked to show the header, then add it to the table.  Otherwise we will leave it off.
        if (dataGridSpec.tableSpec.showHeader) {
            tHeadRow.insertBefore(this._getDivForTableHeaders());
        }
        // Apply the default column visibility settings.
        this.prepareColumnVisibility();
        var tHead = $(document.createElement("thead"));
        var headerRows = this._headerRows = this._buildTableHeaders();
        tHead.append(headerRows);
        $(tHead).insertBefore(this._tableBody);
        setTimeout(function () { return _this._initializeTableData(); }, 1);
    }
    DataGrid.prototype._getTableBody = function () {
        return this._tableBodyJquery;
    };
    DataGrid.prototype._getTableHeaderCell = function () {
        return document.createElement("span");
    };
    DataGrid.prototype._getTableHeaderRow = function () {
        return $(document.createElement("span")).addClass('header');
    };
    DataGrid.prototype._getTHeadRow = function () {
        return $(document.createElement('div')).addClass('searchStudies');
    };
    DataGrid.prototype._getDivForTableHeaders = function () {
        return this._section;
    };
    DataGrid.prototype._getClasses = function () {
        return this._classes;
    };
    // Breaking up the initial table creation into two stages allows the browser to render a preliminary
    // version of the table with a header but no data rows, then continue loading other assets in parallel.
    // It actually speeds up the entire table creation as well, for reasons that are not very clear.
    // (If the setup is NOT run in two stages, all the 'createElement' calls for the data cells take much longer,
    // in Firefox and Safari, according to load-time profiling ... and only when paired with some servers??)
    DataGrid.prototype._initializeTableData = function () {
        var hCell = this._tableHeaderCell;
        Dragboxes.initTable(this._table);
        this._buildAllTableSorters()
            ._buildTableSortSequences()
            ._allocateTableRowRecords()
            ._buildRowGroupTitleRows()
            ._createOptionsMenu()
            ._createHeaderWidgets();
        // First, append the header widgets that should to appear "after" the pulldown.
        // (Since all widgets are styled to float right, they will appear from right to left.)
        this._headerWidgets.forEach(function (widget, index) {
            if (!widget.displayBeforeViewMenu()) {
                widget.appendElements(hCell, index.toString(10));
            }
        });
        // Now append the 'View' pulldown menu
        hCell.appendChild(this._optionsMenuElement);
        // Finally, append the header widgets that should appear "before".
        this._headerWidgets.forEach(function (widget, index) {
            if (widget.displayBeforeViewMenu()) {
                widget.appendElements(hCell, index.toString(10));
            }
        });
        this._initializeSort().arrangeTableDataRows();
        // Now that we've constructed our elements, apply visibility styling to them.
        this._applyColumnVisibility();
        // Prepare the table for sorting
        this._prepareSortable();
        this._spec.onInitialized(this);
        $(this._waitBadge).addClass('off');
        return this;
    };
    DataGrid.prototype._initializeSort = function () {
        var defaultSort = this._spec.tableSpec.defaultSort || 0;
        this._sort = [{ 'spec': this._spec.tableHeaderSpec[defaultSort], 'asc': true }];
        return this;
    };
    // Notify the DataGrid that its underlying data has reset
    DataGrid.prototype.triggerDataReset = function () {
        var _this = this;
        // We have new data to display. Clear out old rows.
        $.each(this._recordElements, function (index, value) {
            value.removeElements();
        });
        this._spec.onDataReset(this);
        // Rebuild rows.
        this._buildTableSortSequences()._allocateTableRowRecords()
            .arrangeTableDataRows();
        // Call the support function in each widget, to apply styling to all the data rows of the table.
        this._optionsMenuWidgets.forEach(function (widget) {
            _this._spec.getRecordIDs().forEach(function (id) {
                widget.initialFormatRowElementsForID(_this._recordElements[id].getDataGridDataRows(), id);
            });
        });
        this._headerWidgets.forEach(function (widget) {
            _this._spec.getRecordIDs().forEach(function (id) {
                widget.initialFormatRowElementsForID(_this._recordElements[id].getDataGridDataRows(), id);
            });
        });
        // And make sure only the currently visible things are ... visible
        this._applyColumnVisibility();
        this._headerWidgets.forEach(function (widget, index) {
            widget.refreshWidget();
        });
        this._optionsMenuWidgets.forEach(function (widget, index) {
            widget.refreshWidget();
        });
        return this;
    };
    // Update only the table rows for the specified records.
    // For use in situations where you want to add rows, or rebuild existing rows,
    // and leave the rest unchanged.
    DataGrid.prototype.triggerPartialDataReset = function (recordIDs, reflow) {
        var _this = this;
        this._spec.onPartialDataReset(this, recordIDs);
        // Rebuild rows.
        recordIDs.forEach(function (id) {
            _this.reconstructSingleRecord(id);
        });
        if (reflow) {
            this._buildTableSortSequences().arrangeTableDataRows();
            this._headerWidgets.forEach(function (widget, index) {
                widget.refreshWidget();
            });
            this._optionsMenuWidgets.forEach(function (widget, index) {
                widget.refreshWidget();
            });
        }
        return this;
    };
    // Instruct DataGrid to recreate/refresh everything related to a single record ID.
    // This includes removing its table rows, reconstructing them, reformatting them, and
    // re-adding the rows in the same place as the old, but does NOT rebuild the sort sequences.
    //   NOTE:
    // It's quite possible that changes to the appearance will alter the visibility of the rows in
    // complicated ways.  For example, the generic search widget logic may decide to hide a previously shown
    // row or vice-versa, corrupting row striping.  Do not delay the reflow for too long.
    DataGrid.prototype.reconstructSingleRecord = function (recordID) {
        if (this._recordElements[recordID]) {
            this._recordElements[recordID].reCreateElementsInPlace();
        }
        else {
            // Note that if the record didn't exist before, it will not appear in the table now,
            // until a complete reflow is done by rebuilding sort sequences and calling arrangeTableDataRows.
            this._recordElements[recordID] = new DataGridRecord(this._spec, recordID);
        }
        var dgRecord = this._recordElements[recordID];
        // Call the support function in each widget, to apply styling to all the data rows of the table.
        this._optionsMenuWidgets.forEach(function (widget) {
            widget.initialFormatRowElementsForID(dgRecord.getDataGridDataRows(), recordID);
        });
        this._headerWidgets.forEach(function (widget) {
            widget.initialFormatRowElementsForID(dgRecord.getDataGridDataRows(), recordID);
        });
        // Make sure only the currently visible things are ... visible
        this._applyColumnVisibilityToOneRecord(recordID);
        return this;
    };
    DataGrid.prototype._createOptionsMenu = function () {
        var _this = this;
        var mainID = this._spec.tableSpec.id;
        // Populate the master list of custom options menu widgets by calling the initialization routine in the spec
        this._optionsMenuWidgets = this._spec.createCustomOptionsWidgets(this);
        var hasCustomWidgets = this._optionsMenuWidgets.length > 0;
        // Check in the column groups and see if any are hide-able
        var hasColumnsInVisibilityList = this._spec.tableColumnGroupSpec.some(function (group) {
            return group.showInVisibilityList;
        });
        // If none of the groups are allowed to be hidden, and we don't have any custom option widgets,
        // don't bother creating the column visibility menu
        if (!hasColumnsInVisibilityList && !hasCustomWidgets) {
            return;
        }
        // If we have custom widgets, we need to call their support functions that apply styling
        // to all the data rows of the table.
        if (hasCustomWidgets) {
            this._optionsMenuWidgets.forEach(function (widget) {
                _this._spec.getRecordIDs().forEach(function (id) {
                    widget.initialFormatRowElementsForID(_this._recordElements[id].getDataGridDataRows(), id);
                });
            });
        }
        var mainSpan = $(this._optionsMenuElement = document.createElement("span"))
            .attr('id', mainID + 'ColumnChooser').addClass('pulldownMenu');
        var menuLabel = $(this._optionsLabel = document.createElement("div"))
            .addClass('pulldownMenuLabelOff')
            .text('View options \u25BE')
            .click(function () { if (menuLabel.hasClass('pulldownMenuLabelOff'))
            _this._showOptMenu(); })
            .appendTo(mainSpan);
        var menuBlock = $(this._optionsMenuBlockElement = document.createElement("div"))
            .addClass('pulldownMenuMenuBlock off')
            .appendTo(mainSpan);
        // event handlers to hide menu if clicking outside menu block or pressing ESC
        $(document).click(function (ev) {
            var t = $(ev.target);
            if (t.closest(_this._optionsMenuElement).length === 0) {
                _this._hideOptMenu();
            }
        }).keydown(function (ev) {
            if (ev.keyCode === 27) {
                _this._hideOptMenu();
            }
        });
        if (hasCustomWidgets) {
            var menuCWList = $(document.createElement("ul")).appendTo(menuBlock);
            if (hasColumnsInVisibilityList) {
                menuCWList.addClass('withDivider');
            }
            this._optionsMenuWidgets.forEach(function (widget, index) {
                widget.appendElements($(document.createElement("li")).appendTo(menuCWList)[0], index.toString(10));
            });
        }
        if (hasColumnsInVisibilityList) {
            var menuColList = $(document.createElement("ul")).appendTo(menuBlock);
            // Add each hide-able group to the menu.
            // Note: We have to walk through this anew, because we're going to make use of the index 'i'.
            this._spec.tableColumnGroupSpec.forEach(function (group, index) {
                var item, checkbox, id;
                if (group.showInVisibilityList) {
                    item = $('<li>').appendTo(menuColList);
                    id = mainID + 'ColumnCheck' + index;
                    checkbox = $('<input type="checkbox">')
                        .appendTo(item)
                        .attr('id', id)
                        .data('column', group)
                        .click(group, function (e) { return _this._clickedColVisibilityControl(e); });
                    group.checkboxElement = checkbox[0];
                    $('<label>').attr('for', id).text(group.name).appendTo(item);
                    if (!group.currentlyHidden) {
                        checkbox.prop('checked', true);
                    }
                }
            });
            // update checks based on settings
            this._fetchSettings(this._columnSettingsKey(), function (data) {
                menuColList.find('li').find(':input').each(function (i, box) {
                    var $box = $(box), col = $box.data('column');
                    if ((data.indexOf(col.name) === -1 && !!col.hiddenByDefault) ||
                        data.indexOf('-' + col.name) > -1) {
                        $box.prop('checked', false);
                        _this.hideColumn(col);
                    }
                    else {
                        $box.prop('checked', true);
                        _this.showColumn(col);
                    }
                });
            }, []);
        }
        return this;
    };
    DataGrid.prototype._createHeaderWidgets = function () {
        var _this = this;
        // Populate the master list of custom header widgets by calling the initialization routine in the spec
        this._headerWidgets = this._spec.createCustomHeaderWidgets(this);
        this._headerWidgets.forEach(function (widget) {
            // Call the support function in each widget, to apply styling to all the data rows of the table.
            _this._spec.getRecordIDs().forEach(function (id) {
                widget.initialFormatRowElementsForID(_this._recordElements[id].getDataGridDataRows(), id);
            });
        });
        return this;
    };
    // Prepare the column visibility state for the table.
    // This function should be called during instantiation, since it initializes the column visibility
    // variables that are referred to throughout the rest of the DataGrid class.
    DataGrid.prototype.prepareColumnVisibility = function () {
        var _this = this;
        // First, run through a sequence of checks to set the 'currentlyHidden' attribute to a reasonable value.
        this._spec.tableColumnGroupSpec.forEach(function (group) {
            // Establish what the default is, before checking any passed-in column flags
            group.currentlyHidden = !!group.hiddenByDefault;
            // Ensure that the necessary arrays are present to keep track of group members
            group.memberHeaders = group.memberHeaders || [];
            group.memberColumns = group.memberColumns || [];
        });
        // Collect all the headers under their respective column groups
        this._spec.tableHeaderSpec.forEach(function (header) {
            var c = header.columnGroup;
            if (c && _this._spec.tableColumnGroupSpec[c - 1]) {
                _this._spec.tableColumnGroupSpec[c - 1].memberHeaders.push(header);
            }
        });
        // Collect all the columns (and in turn their cells) under their respective column groups
        this._spec.tableColumnSpec.forEach(function (col) {
            var c = col.columnGroup;
            if (c && _this._spec.tableColumnGroupSpec[c - 1]) {
                _this._spec.tableColumnGroupSpec[c - 1].memberColumns.push(col);
            }
        });
    };
    // Read the current column visibility state and alter the styling of headers and cells to reflect it
    DataGrid.prototype._applyColumnVisibility = function () {
        this._spec.tableColumnGroupSpec.forEach(function (group) {
            var hidden = group.currentlyHidden;
            group.memberHeaders.forEach(function (header) { return $(header.element).toggleClass('off', hidden); });
            group.memberColumns.forEach(function (column) {
                column.getEntireIndex().forEach(function (c) { return hidden ? c.hide() : c.unhide(); });
            });
        });
        return this;
    };
    DataGrid.prototype._applyColumnVisibilityToOneRecord = function (recordID) {
        this._spec.tableColumnGroupSpec.forEach(function (group) {
            var hidden = group.currentlyHidden;
            group.memberColumns.forEach(function (column) {
                column.cellIndexAtID(recordID).forEach(function (c) { return hidden ? c.hide() : c.unhide(); });
            });
        });
        return this;
    };
    // Get the list of IDs, then filter it down to what's visible,
    // then search the visible rows for spec-mandated checkbox elements,
    // and if a checkbox is checked, return its element on an array.
    DataGrid.prototype.getSelectedCheckboxElements = function () {
        var _this = this;
        var sequence = this._getSequence(this._sort[0]);
        // Verify that the row sets referred to by the IDs actually exist
        var filteredSequence = sequence.filter(function (v) { return !!_this._recordElements[v]; });
        filteredSequence = this.applyAllWidgetFiltering(filteredSequence);
        var checkedBoxes = [];
        filteredSequence.forEach(function (v) {
            var rows = _this._recordElements[v].getDataGridDataRows();
            rows.forEach(function (row) {
                if (!row.dataGridDataCells) {
                    return;
                }
                row.dataGridDataCells.forEach(function (cell) {
                    var checkbox = cell.getCheckboxElement();
                    if (checkbox && checkbox.checked) {
                        checkedBoxes.push(checkbox);
                    }
                });
            });
        });
        return checkedBoxes;
    };
    DataGrid.prototype.applySortIndicators = function () {
        if (this._headerRows) {
            $(this._headerRows).find('.sortedup, .sorteddown').removeClass('sortedup sorteddown');
        }
        this._sort.forEach(function (sort) {
            $(sort.spec.element).addClass(sort.asc ? 'sorteddown' : 'sortedup');
        });
    };
    DataGrid.prototype.arrangeTableDataRows = function () {
        var _this = this;
        var striping = 1;
        // We create a document fragment - a kind of container for document-related objects that we don't
        // want in the page - and accumulate inside it all the rows we want to display, in sorted order.
        var frag = document.createDocumentFragment();
        this.applySortIndicators();
        var sequence = this._getSequence(this._sort[0]);
        // Verify that the row sets referred to by the IDs actually exist
        var filteredSequence = sequence.filter(function (v) { return !!_this._recordElements[v]; });
        var unfilteredSequence = filteredSequence.slice(0);
        // Remove all the grouping title rows from the table as well, if they were there
        var rowGroupSpec = this._spec.tableRowGroupSpec;
        rowGroupSpec.forEach(function (rowGroup) {
            var r = rowGroup.replicateGroupTable;
            if (r.parentNode) {
                r.parentNode.removeChild(r);
            }
            // While we're here, reset the member record arrays.  We need to rebuild them post-filtering.
            rowGroup.memberRecords = [];
        });
        filteredSequence = this.applyAllWidgetFiltering(filteredSequence);
        // Call to detach only the rows that didn't make it through the filter.
        // The others will be automatically detached by being moved to the document fragment.
        var addedRowIDs = {};
        filteredSequence.forEach(function (id) {
            addedRowIDs[id] = true;
        });
        unfilteredSequence.forEach(function (id) {
            if (!addedRowIDs[id]) {
                _this._recordElements[id].detachElements();
            }
        });
        // Now we run through the remaining IDs and add their rows to the table, with striping.
        // But if grouping is enabled and there is at least one group, we add them a few at a time,
        // proceeding through each group.
        if (!this._groupingEnabled || rowGroupSpec.length < 1) {
            if (this._spec.tableSpec.applyStriping) {
                filteredSequence.forEach(function (s) {
                    striping = 1 - striping;
                    _this._recordElements[s].applyStriping(striping);
                });
            }
            filteredSequence.forEach(function (s) {
                var rows = _this._recordElements[s].getElements();
                rows.forEach(function (row) {
                    frag.appendChild(row);
                });
            });
        }
        else {
            var stripeStyles = ['stripeRowA', 'stripeRowB'];
            var stripeStylesJoin = stripeStyles.join(' ');
            filteredSequence.forEach(function (s) {
                var rowGroup = rowGroupSpec[_this._spec.getRowGroupMembership(s)];
                rowGroup.memberRecords.push(_this._recordElements[s]);
            });
            //iterate over the different replicate groups
            _.each(rowGroupSpec, function (grouping) {
                //find the assay ids associated with the replicate group
                var replicateIds = _this._findReplicateLines(_this._groupReplicates(), grouping);
                //find the lines associated with the replicate group
                var lines = _this.addReplicateRows(replicateIds);
                _.each(lines, function (line) {
                    //hide the lines associated with the replicate group
                    $(line).hide();
                });
            });
            rowGroupSpec.forEach(function (rowGroup) {
                striping = 1 - striping;
                frag.appendChild(rowGroup.replicateGroupTable);
                if (_this._spec.tableSpec.applyStriping) {
                    rowGroup.replicateGroupTitleRowJQ
                        .removeClass(stripeStylesJoin).addClass(stripeStyles[striping]).end();
                }
            });
            $(frag).insertBefore($(this._tableBody));
        }
        //hacky way to show lines that were hidden from grouping replicates
        if ($('#linesGroupStudyReplicatesCB0').prop('checked') === false) {
            var lines = $(frag).children();
            _.each(lines, function (line) {
                $(line).removeClass('replicateLineShow');
                $(line).show();
            });
        }
        // Remember that we last sorted by this column
        this._tableBody.appendChild(frag);
        return this;
    };
    // Given an array of record IDs, send the array through the filtering function for each of
    // the header widgets, and each of the options menu widgets, then return the filtered array.
    DataGrid.prototype.applyAllWidgetFiltering = function (filteredSequence) {
        // Give each header widget a chance to apply filtering
        this._headerWidgets.forEach(function (widget) {
            filteredSequence = widget.applyFilterToIDs(filteredSequence);
        });
        // Give each widget in the options menu a chance to apply filtering
        this._optionsMenuWidgets.forEach(function (widget) {
            filteredSequence = widget.applyFilterToIDs(filteredSequence);
        });
        return filteredSequence;
    };
    // Add up all the column counts in the headerspec, to arrive at a grand total for the table.
    DataGrid.prototype.getSpec = function () {
        return this._spec; // F*** type conversion F*** things up when subclassing
    };
    // Add up all the column counts in the headerspec, to arrive at a grand total for the table.
    DataGrid.prototype.countTotalColumns = function () {
        return this._spec.tableHeaderSpec.reduce(function (prev, v) {
            if (v.headerRow) {
                if (v.headerRow > 1) {
                    return prev;
                }
            }
            return prev + (v.colspan ? v.colspan : 1);
        }, 0);
    };
    // Walk through each header in the spec, and look for a "sortBy" function.
    // If one is found, use it to construct a sorting function
    DataGrid.prototype._buildAllTableSorters = function () {
        var _this = this;
        this._spec.tableHeaderSpec.forEach(function (header) {
            if (header.sortBy) {
                header.sortFunc = _this.buildTableSorter(header.sortBy);
            }
        });
        return this;
    };
    // Given a comparison function,
    // construct a function suitable for passing to Javascript's "sort".
    DataGrid.prototype.buildTableSorter = function (lookupFunc) {
        var _this = this;
        return function (rowIndexA, rowIndexB) {
            var a = lookupFunc.call(_this._spec, rowIndexA);
            var b = lookupFunc.call(_this._spec, rowIndexB);
            return ((a > b) - (b > a)); // true becomes 1, false becomes 0
        };
    };
    // Start with the array of IDs given in the spec.  Then, for each header, build a sorted copy of the array,
    // and save the sorted copy into the header information.
    //
    // Some sort sequences may rely on the sort sequences of other headers.
    // In the code below, these are followed like a dependency tree.
    // We do this by tracking the unsorted headers in a set, and looping through the set.
    // Every time we find a header that we can successfully sort - whether because the prerequisite header is already
    // sorted, or because it has no prerequisite - we sort it and remove it from the set.
    // If we ever loop through the set and fail to remove even one item from it, we give up,
    // since there must be a dependency loop.
    // It's not the fastest method on the planet, but it's good enough, since we'll probably never have any more than 10 or so headers.
    DataGrid.prototype._buildTableSortSequences = function () {
        var _this = this;
        var unsortedHeaders = [];
        var sortedAtLeastOneNewHeader = false;
        // Declare all the headers unsorted, and add them to the unsorted set.
        this._spec.tableHeaderSpec.forEach(function (header) {
            if (header.sortId) {
                header.sorted = true;
            }
            else if (header.sortFunc) {
                unsortedHeaders.unshift(header); // add in front, so set is reversed
                header.sorted = false;
            }
        });
        do {
            sortedAtLeastOneNewHeader = false;
            // use slice so that splice inside the callback does not interfere with loop
            unsortedHeaders.slice(0).forEach(function (header, index) {
                var after;
                if (header.sortAfter >= 0) {
                    after = _this._spec.tableHeaderSpec[header.sortAfter];
                    if (!after.sorted)
                        return;
                }
                _this._sequence[header.id] = _this._spec.getRecordIDs();
                if (after && after.id && _this._sequence[after.id]) {
                    _this._sequence[header.id] = _this._sequence[after.id].slice(0);
                }
                _this._sequence[header.id].sort(header.sortFunc);
                _this._sequence['-' + header.id] = _this._sequence[header.id].slice(0).reverse();
                header.sorted = true;
                unsortedHeaders.splice(index, 1);
                sortedAtLeastOneNewHeader = true;
            });
        } while (sortedAtLeastOneNewHeader);
        return this;
    };
    DataGrid.prototype._getSequence = function (sort) {
        var key = (sort.asc ? '' : '-') + sort.spec.id, sequence = this._sequence[key];
        if (sequence === undefined) {
            return this._spec.getRecordIDs();
        }
        return sequence;
    };
    DataGrid.prototype._buildTableHeaders = function () {
        // Find the minimum number of rows we need to create to contain all the headers
        var maxheaderRow = this._spec.tableHeaderSpec.reduce(function (prev, v) { return Math.max(prev, v.headerRow || 0); }, 1);
        // Create enough rows to contain the headers (usually just 1)
        var rowElements = [];
        for (var i = 0; i < maxheaderRow; i++) {
            var row = $(document.createElement("tr")).addClass('columnLabels');
            rowElements.push(row[0]);
        }
        // Run through each individual header, create it according to the specs, and add it to the appropriate row.
        this._spec.tableHeaderSpec.forEach(function (header, i, src) {
            var commonCss = {
                'width': header.width ?
                    (header.width.substr(-1) !== '%' ? header.width + 'px' : header.width) :
                    undefined,
            };
            var css = $.extend({
                'text-align': header.align,
                'vertical-align': header.valign,
                'display': header.display
            }, commonCss);
            header.element = document.createElement("th");
            var cell = $(header.element).css(css).attr({
                'id': header.id,
                'colspan': header.colspan > 1 ? header.colspan : undefined,
                'rowspan': header.rowspan > 1 ? header.rowspan : undefined,
                'class': header.size === 's' ? 'smaller' : undefined
            }).appendTo(rowElements[Math.max(header.headerRow || 1, 1) - 1]);
            if (header.sortBy) {
                cell.addClass('sortheader');
            }
            if (header.name) {
                $(document.createElement("div")).appendTo(cell).text(header.name)
                    .attr({ 'class': header.nowrap ? 'nowrap' : undefined }).css(commonCss);
            }
        });
        // Remove the right-side border line from the last element of each row
        rowElements.forEach(function (row) {
            var l = row.lastChild;
            if (l) {
                l.style.borderRight = '0';
            }
        });
        return rowElements;
    };
    // Build the rows (and the contents of the rows) for each record in the data.
    // (See the DataGridDataCell class.)
    DataGrid.prototype._allocateTableRowRecords = function () {
        var _this = this;
        this._recordElements = new DataGridRecordSet();
        this._spec.getRecordIDs().forEach(function (id) {
            _this._recordElements[id] = new DataGridRecord(_this._spec, id);
        });
        return this;
    };
    // Assemble table rows - disclosed and undisclosed versions (with callbacks) -
    // that act as titles for the different groups when the table is in grouping mode.
    DataGrid.prototype._buildRowGroupTitleRows = function () {
        var _this = this;
        this._spec.tableRowGroupSpec.forEach(function (oneGroup, index) {
            oneGroup.disclosed = true;
            var replicates = _this._groupReplicates();
            var replicateIds = _this._findReplicateLines(replicates, oneGroup);
            oneGroup.memberRecords = [];
            var clicks = true;
            var table = oneGroup.replicateGroupTableJQ = $(oneGroup.replicateGroupTable = document.createElement("tbody"))
                .addClass('groupHeaderTable');
            var row = oneGroup.replicateGroupTitleRowJQ = $(oneGroup.replicateGroupTitleRow = document.createElement("tr"))
                .appendTo(table).addClass('groupHeader').click(function () {
                if (clicks) {
                    _this._expandRowGroup(index, replicateIds);
                    clicks = false;
                }
                else {
                    _this._collapseRowGroup(index, replicateIds);
                    clicks = true;
                }
            });
            var cell = $(document.createElement("td")).appendTo(row).text(" " + oneGroup.name).addClass('groupReplicateRow');
            if (_this._totalColumnCount > 1) {
                cell.attr('colspan', _this._totalColumnCount);
            }
        });
        return this;
    };
    /**
     * this function returns the lines associated with a replicate group
     * @param replicates - array of ids associated with replicate
     * @param oneGroup is the replicate name
     * @returns {Array} of lines that are associate with the said replicate name
     * @private
     */
    DataGrid.prototype._findReplicateLines = function (replicates, oneGroup) {
        var groupedIds = []; //returns ids associated with replicate id.
        $.each(replicates, function (key) {
            if (EDDData.Lines[replicates[key]].name === oneGroup.name) {
                groupedIds.push(key);
            }
        });
        return groupedIds;
    };
    // Handle the "sortable" CSS class in a table.
    DataGrid.prototype._prepareSortable = function () {
        // Add a click event for every header cell that identifies as sortable
        this._spec.enableSort(this);
    };
    DataGrid.prototype._showOptMenu = function () {
        $(this._optionsLabel).removeClass('pulldownMenuLabelOff').addClass('pulldownMenuLabelOn');
        $(this._optionsMenuBlockElement).removeClass('off');
    };
    DataGrid.prototype._hideOptMenu = function () {
        $(this._optionsLabel).removeClass('pulldownMenuLabelOn').addClass('pulldownMenuLabelOff');
        $(this._optionsMenuBlockElement).addClass('off');
    };
    /**
     * this function hides the lines and collapses the replicate dropdown
     * @param groupIndex
     * @param replicateIds
     * @private
     */
    DataGrid.prototype._collapseRowGroup = function (groupIndex, replicateIds) {
        var _this = this;
        var rowGroup = this._spec.tableRowGroupSpec[groupIndex];
        rowGroup.disclosed = false;
        var lines = this.addReplicateRows(replicateIds);
        $(rowGroup.replicateGroupTitleRow).removeClass('replicate');
        _.each(lines, function (line) {
            $(line).hide();
        });
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
    };
    /**
     * this function opens the dropdown on a replicate group and shows the lines associated with
     * the replicate group
     * @param groupIndex
     * @param replicateIds
     * @private
     */
    DataGrid.prototype._expandRowGroup = function (groupIndex, replicateIds) {
        var rowGroup = this._spec.tableRowGroupSpec[groupIndex];
        rowGroup.disclosed = true;
        var lines = this.addReplicateRows(replicateIds);
        $(rowGroup.replicateGroupTitleRow).addClass('replicate');
        _.each(lines, function (line) {
            $(line).show().addClass('replicateLineShow');
            $(rowGroup.replicateGroupTitleRow).after(line);
        });
    };
    /**
     * this function finds the lines associated with their replicate group id.
     * @returns {} line id as key and the replicate id the line is associated with
     * @private
     */
    DataGrid.prototype._groupReplicates = function () {
        var lines = EDDData.Lines;
        var rows = {};
        $.each(lines, function (key) {
            if (lines[key].replicate) {
                rows[lines[key].id] = lines[key].replicate;
            }
        });
        return rows;
    };
    /**
     * this function gets the line elements associated with a replicate id
     * @param idArray
     * @returns {Array}
     */
    DataGrid.prototype.addReplicateRows = function (idArray) {
        var _this = this;
        return $.map(idArray, function (id) { return $('[value=' + id + ']', _this._table).parents('tr').filter(':first'); });
    };
    DataGrid.prototype.turnOnRowGrouping = function () {
        var _this = this;
        this._groupingEnabled = true;
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
    };
    DataGrid.prototype.turnOffRowGrouping = function () {
        var _this = this;
        this._groupingEnabled = false;
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
    };
    DataGrid.prototype.clickedOptionWidget = function (event) {
        var _this = this;
        var control = event.target; // Grab the checkbox that sent the event
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
    };
    DataGrid.prototype.clickedHeaderWidget = function (headerWidget) {
        var _this = this;
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
    };
    // 'control' is a column visibility checkbox
    DataGrid.prototype._clickedColVisibilityControl = function (event) {
        var check = $(event.target), col = event.data;
        if (check.prop('checked')) {
            this.showColumn(col);
        }
        else {
            this.hideColumn(col);
        }
        return this;
    };
    // 'control' is a column visibility checkbox
    DataGrid.prototype.showColumn = function (group) {
        var _this = this;
        if (group.currentlyHidden) {
            group.currentlyHidden = false;
            if (group.revealedCallback) {
                group.revealedCallback(this._spec, this);
            }
            this.scheduleTimer('_updateColumnSettings', function () { return _this._updateColumnSettings(); });
            this.scheduleTimer('_applyColumnVisibility', function () { return _this._applyColumnVisibility(); });
        }
    };
    // 'control' is a column visibility checkbox
    DataGrid.prototype.hideColumn = function (group) {
        var _this = this;
        if (!group.currentlyHidden) {
            group.currentlyHidden = true;
            this.scheduleTimer('_updateColumnSettings', function () { return _this._updateColumnSettings(); });
            this.scheduleTimer('_applyColumnVisibility', function () { return _this._applyColumnVisibility(); });
        }
    };
    DataGrid.prototype._basePayload = function () {
        var token = document.cookie.replace(/(?:(?:^|.*;\s*)csrftoken\s*\=\s*([^;]*).*$)|^.*$/, '$1');
        return { 'csrfmiddlewaretoken': token };
    };
    DataGrid.prototype._columnSettingsKey = function () {
        return ['datagrid', this._spec.tableSpec.id, 'column'].join('.');
    };
    DataGrid.prototype._fetchSettings = function (propKey, callback, defaultValue) {
        $.ajax('/profile/settings/' + propKey, {
            'dataType': 'json',
            'success': function (data) {
                data = data || defaultValue;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    }
                    catch (e) { }
                }
                callback.call({}, data);
            }
        });
    };
    // The server binds this. 'this' is a checkbox.
    DataGrid.prototype._updateColumnSettings = function () {
        var _this = this;
        var propKey = this._columnSettingsKey(), setCol = [], unsetCol = [], delCol = [];
        this._spec.tableColumnGroupSpec.forEach(function (col) {
            if (col.showInVisibilityList && col.checkboxElement) {
                if (col.checkboxElement.checked) {
                    setCol.push(col.name);
                }
                else {
                    unsetCol.push(col.name);
                    if (!col.hiddenByDefault) {
                        delCol.push('-' + col.name);
                    }
                }
            }
        });
        this._fetchSettings(propKey, function (data) {
            var inData = function (name) { return data.indexOf(name) === -1; };
            // filter out all the unset boxes
            data = data.filter(function (name) { return unsetCol.indexOf(name) === -1; });
            // filter out all excluded that are now set
            data = data.filter(function (name) {
                return !(setCol.indexOf(name.substring(1)) !== -1 && name.indexOf('-') === 0);
            });
            // filter out all the set boxes already in the settings list
            setCol = setCol.filter(inData);
            // filter out dupes in delCol
            delCol = delCol.filter(inData);
            // add any missing items
            Array.prototype.push.apply(data, setCol);
            // mark non-default hide (i.e. default show) as explicitly excluded
            Array.prototype.push.apply(data, delCol);
            // store new setting value
            $.ajax('/profile/settings/' + propKey, {
                'data': $.extend({}, _this._basePayload(), { 'data': JSON.stringify(data) }),
                'type': 'POST'
            });
        }, []);
        return this;
    };
    // Schedule a call to the given function in the near future, and save the timer under the given identifier.
    // Multiple calls to this using the same identifier will reschedule the event, removing the old timer.
    DataGrid.prototype.scheduleTimer = function (uid, func) {
        if (this._timers[uid]) {
            clearTimeout(this._timers[uid]);
        }
        this._timers[uid] = setTimeout(func, 10);
        return this;
    };
    // apply a function to every record ID specified
    DataGrid.prototype.applyToRecordSet = function (func, ids) {
        var _this = this;
        ids.forEach(function (id) {
            func.call({}, _this._recordElements[id].getDataGridDataRows(), id, _this._spec, _this);
        });
        return this;
    };
    // retreive the current sequence of records in the DataGrid
    DataGrid.prototype.currentSequence = function () {
        return this._getSequence(this._sort[0]);
    };
    DataGrid.prototype.sortCols = function (cols) {
        if (cols === undefined) {
            return this._sort;
        }
        else {
            this._sort = cols;
            return this;
        }
    };
    return DataGrid;
}());
var LineResults = (function (_super) {
    __extends(LineResults, _super);
    function LineResults(dataGridSpec) {
        _super.call(this, dataGridSpec);
        this._getClasses();
        this._getDivForTableHeaders();
        this._getTableHeaderRow();
        this._getTHeadRow();
        this._getTableHeaderCell();
    }
    LineResults.prototype._getTHeadRow = function () {
        return $(document.createElement('thead'));
    };
    LineResults.prototype._getTableHeaderRow = function () {
        return $(document.createElement("tr")).addClass('header');
    };
    LineResults.prototype._getTableHeaderCell = function () {
        return document.createElement("th");
    };
    LineResults.prototype._getDivForTableHeaders = function () {
        return this._getTableBody();
    };
    LineResults.prototype._getClasses = function () {
        return 'dataTable sortable dragboxes hastablecontrols';
    };
    return LineResults;
}(DataGrid));
var AssayResults = (function (_super) {
    __extends(AssayResults, _super);
    function AssayResults(dataGridSpec) {
        _super.call(this, dataGridSpec);
        this._getClasses();
        this._getDivForTableHeaders();
        this._getTableHeaderRow();
        this._getTHeadRow();
        this._getTableHeaderCell();
    }
    AssayResults.prototype._getTHeadRow = function () {
        return $(document.createElement('thead'));
    };
    AssayResults.prototype._getTableHeaderRow = function () {
        return $(document.createElement("tr")).addClass('header');
    };
    AssayResults.prototype._getTableHeaderCell = function () {
        return document.createElement("th");
    };
    AssayResults.prototype._getDivForTableHeaders = function () {
        return $('#assaysSection');
    };
    AssayResults.prototype._getClasses = function () {
        return 'dataTable sortable dragboxes hastablecontrols';
    };
    return AssayResults;
}(DataGrid));
// Type definition for the records contained in a DataGrid
var DataGridRecordSet = (function () {
    function DataGridRecordSet() {
    }
    return DataGridRecordSet;
}());
// Type definition for the records contained in a DataGrid
var DataGridRecord = (function () {
    function DataGridRecord(gridSpec, id) {
        this.gridSpec = gridSpec;
        this.recordID = id;
        this.rowElements = [];
        this.dataGridDataRows = [];
        this.stripeStyles = ['stripeRowA', 'stripeRowB'];
        this.stripeStylesJoin = this.stripeStyles.join(' ');
        this.createdElements = false;
        this.recentStripeIndex = null;
    }
    DataGridRecord.prototype.reCreateElementsInPlace = function () {
        // If the elements haven't been created even once, then divert to standard creation and finish.
        if (!this.createdElements) {
            this.createElements();
            return;
        }
        // If we're going to maintain the position of the new rows,
        // we need to find their earlier adjacent sibling, if one exists.
        var previousParent = null;
        var nextSibling = null;
        if (this.dataGridDataRows.length) {
            var lastEl = this.rowElements[this.dataGridDataRows.length - 1];
            // Sanity check:  Does it have a parent?  Can't have a valid sibling without a parent.
            if (lastEl.parentNode) {
                previousParent = lastEl.parentNode;
                nextSibling = lastEl.nextSibling;
            }
        }
        // Now that we know these things, we can ditch the rows out of the table.
        this.removeElements();
        // Force recreation.
        this.createdElements = false;
        // The old cells are still referenced in their colSpec objects before this,
        // but calling generateCells again automatically replaces them.
        this.createElements();
        // If recentStripeIndex is null, we haven't applied any striping to the previous row, so we skip it here.
        if (!(this.recentStripeIndex === null)) {
            this.applyStriping(this.recentStripeIndex);
        }
        // Drop the new rows into place where the old rows lived.
        if (previousParent) {
            if (nextSibling) {
                this.rowElements.forEach(function (row) {
                    previousParent.insertBefore(row, nextSibling);
                });
            }
            else {
                this.rowElements.forEach(function (row) {
                    previousParent.appendChild(row);
                });
            }
        }
    };
    DataGridRecord.prototype.createElements = function () {
        var _this = this;
        if (this.createdElements) {
            return;
        }
        this.rowElements = [];
        this.dataGridDataRows = [];
        var cellsForColumns = {};
        this.gridSpec.tableColumnSpec.forEach(function (colSpec, index) {
            cellsForColumns[index] = colSpec.generateCells(_this.gridSpec, _this.recordID);
        });
        // We will use these indexes to determine when we need to add the next cell, in the sequence of rows.
        var currentRowHeights = [];
        this.gridSpec.tableColumnSpec.forEach(function (colSpec, index) {
            currentRowHeights[index] = 0;
        });
        var addingForRow = 0;
        var moreToAdd = true;
        var cells = [];
        // Pull cells off the bottom of the arrays, left to right, assembling the rows one at a time,
        // skipping columns based on the rowspan or colspan of previous cells.  We expect the client of
        // this class to ensure they are declaring a nicely fitted rectangular structure - we don't validate it.
        while (moreToAdd) {
            moreToAdd = false;
            cells = [];
            this.gridSpec.tableColumnSpec.forEach(function (spec, col) {
                var colCells, c, next;
                if (currentRowHeights[col] > addingForRow)
                    return;
                if ((colCells = cellsForColumns[col]).length) {
                    c = colCells.shift();
                    if (colCells.length)
                        moreToAdd = true;
                    next = col + c.colspan;
                    while (col < next) {
                        currentRowHeights[col] = c.rowspan + addingForRow;
                        col++;
                    }
                    cells.push(c);
                }
            });
            var r = new DataGridDataRow(this.recordID, cells);
            this.dataGridDataRows.push(r);
            this.rowElements.push(r.getElement());
            // keep going if current row is less than highest rowspan
            moreToAdd = (++addingForRow < currentRowHeights.reduce(function (a, b) { return Math.max(a, b); }, 0));
        }
        this.createdElements = true;
    };
    DataGridRecord.prototype.removeElements = function () {
        this.dataGridDataRows.forEach(function (row) {
            row.removeElement();
        });
    };
    // Like remove, except it doesn't remove JQuery events or data.
    // Used to take the table rows temporarily out of the DOM, like when re-ordering.
    DataGridRecord.prototype.detachElements = function () {
        this.dataGridDataRows.forEach(function (row) {
            row.detachElement();
        });
    };
    DataGridRecord.prototype.getDataGridDataRows = function () {
        if (!this.createdElements) {
            this.createElements();
        }
        return this.dataGridDataRows;
    };
    DataGridRecord.prototype.getElements = function () {
        if (!this.createdElements) {
            this.createElements();
        }
        return this.rowElements;
    };
    DataGridRecord.prototype.applyStriping = function (stripeIndex) {
        var _this = this;
        var rows = this.getDataGridDataRows();
        this.recentStripeIndex = stripeIndex;
        rows.forEach(function (row) {
            var rJQ = row.getElementJQ();
            rJQ.removeClass(_this.stripeStylesJoin).addClass(_this.stripeStyles[stripeIndex]);
        });
    };
    return DataGridRecord;
}());
// Container class for data rows in the body of the DataGrid table.
// DataGrid instantiates these by passing in an array of the DataGridDataCell objects that will form the content of the row.
var DataGridDataRow = (function () {
    function DataGridDataRow(id, cells) {
        this.recordID = id;
        this.dataGridDataCells = cells;
        this.createdElement = false;
    }
    DataGridDataRow.prototype.createElement = function () {
        var rowEl = document.createElement("tr");
        for (var i = 0; i < this.dataGridDataCells.length; i++) {
            var c = this.dataGridDataCells[i];
            rowEl.appendChild(c.getElement());
        }
        this.rowElement = rowEl;
        this.createdElement = true;
    };
    DataGridDataRow.prototype.removeElement = function () {
        if (this.createdElement) {
            this.getElementJQ().remove();
        }
    };
    // Like remove, except it doesn't remove JQuery events or data.
    // Used to take the table rows temporarily out of the DOM, like when re-ordering.
    DataGridDataRow.prototype.detachElement = function () {
        if (this.createdElement) {
            this.getElementJQ().detach();
        }
    };
    DataGridDataRow.prototype.getElement = function () {
        if (!this.createdElement) {
            this.createElement();
        }
        return this.rowElement;
    };
    DataGridDataRow.prototype.getElementJQ = function () {
        if (!this.createdElement) {
            this.createElement();
        }
        if (!this.rowElementJQ) {
            this.rowElementJQ = $(this.rowElement);
        }
        return this.rowElementJQ;
    };
    return DataGridDataRow;
}());
// Container class for cells in the body of the DataGrid table.
// DataGrid calls a function defined in DataGridColumnSpec objects to instantiate these,
// passing in a reference to the DataGridSpecBase and a unique identifier for a data record.
var DataGridDataCell = (function () {
    function DataGridDataCell(gridSpec, id, opt) {
        var defaults;
        this.gridSpec = gridSpec;
        this.recordID = id;
        this.hidden = false;
        this.createdElement = false;
        defaults = {
            'contentFunction': function (e, index) { },
            'contentString': '',
            'align': 'left',
            'rowspan': 1,
            'colspan': 1
        };
        $.extend(this, defaults, opt || {});
    }
    DataGridDataCell.prototype.createElement = function () {
        var id = this.recordID, c = document.createElement("td"), checkId, checkName, menu;
        if (this.checkboxWithID) {
            checkId = this.checkboxWithID.call(this.gridSpec, id);
            checkName = this.checkboxName || checkId;
            this.checkboxElement = document.createElement('input');
            this.checkboxElement.setAttribute('type', 'checkbox');
            $(this.checkboxElement).attr({
                'id': checkId, 'name': checkName, 'value': id.toString()
            }).appendTo(c);
            this.contentContainerElement = $('<label>').attr('for', checkId).appendTo(c)[0];
        }
        else {
            this.contentContainerElement = $('<span>').appendTo(c)[0];
        }
        $(this.contentContainerElement).html(this.contentString);
        this.contentFunction.call(this.gridSpec, this.contentContainerElement, id);
        if (this.sideMenuItems && this.sideMenuItems.length) {
            menu = $('<ul>').addClass('popupmenu').appendTo(c);
            this.sideMenuItems.forEach(function (item) {
                $('<li>').html(item).appendTo(menu);
            });
        }
        var cellClasses = [];
        if (this.colspan > 1) {
            c.setAttribute('colspan', this.colspan.toString(10));
        }
        if (this.rowspan > 1) {
            c.setAttribute('rowspan', this.rowspan.toString(10));
        }
        if (this.customID) {
            c.setAttribute('id', this.customID.call(this.gridSpec, id));
        }
        if (this.hoverEffect) {
            cellClasses.push('popupcell');
        }
        cellClasses.push('nowrap');
        if (this.minWidth) {
            c.style.minWidth = this.minWidth + 'px';
        }
        if (this.maxWidth) {
            c.style.maxWidth = this.maxWidth + 'px';
        }
        if (this.align) {
            c.style.textAlign = this.align;
        }
        if (this.valign) {
            c.style.verticalAlign = this.valign;
        }
        if (this.hidden) {
            cellClasses.push('off');
        }
        if (cellClasses.length > 0) {
            c.className = cellClasses.join(' ');
        }
        this.cellElement = c;
        this.cellElementJQ = $(c);
        this.createdElement = true;
    };
    DataGridDataCell.prototype.getElement = function () {
        if (!this.createdElement) {
            this.createElement();
        }
        return this.cellElement;
    };
    DataGridDataCell.prototype.getCheckboxElement = function () {
        if (!this.createdElement) {
            this.createElement();
        }
        return this.checkboxElement || null;
    };
    DataGridDataCell.prototype.hide = function () {
        if (!this.hidden) {
            if (this.createdElement) {
                this.cellElementJQ.addClass('off');
            }
            this.hidden = true;
        }
    };
    DataGridDataCell.prototype.unhide = function () {
        if (this.hidden) {
            if (this.createdElement) {
                this.cellElementJQ.removeClass('off');
            }
            this.hidden = false;
        }
    };
    return DataGridDataCell;
}());
// A placeholder cell when data is still loading
var DataGridLoadingCell = (function (_super) {
    __extends(DataGridLoadingCell, _super);
    function DataGridLoadingCell(gridSpec, id, opt) {
        _super.call(this, gridSpec, id, opt);
        this.contentString = '<span class="loading">Loading...</span>';
    }
    return DataGridLoadingCell;
}(DataGridDataCell));
// A general class that acts as a common repository for utility functions for DataGrid widgets.
// It is immediately subclassed into DataGridOptionWidget and DataGridHeaderWidget.
var DataGridWidget = (function () {
    function DataGridWidget(dataGridOwnerObject, dataGridSpec) {
        this.dataGridOwnerObject = dataGridOwnerObject;
        this.dataGridSpec = dataGridSpec;
    }
    // Utility function to create a label element
    DataGridWidget.prototype._createLabel = function (text, id) {
        var label = document.createElement("label");
        label.setAttribute('for', id);
        label.appendChild(document.createTextNode(text));
        return label;
    };
    // Utility function to create a checkbox element
    DataGridWidget.prototype._createCheckbox = function (id, name, value) {
        var cb = document.createElement("input");
        cb.setAttribute('id', id);
        cb.setAttribute('name', name);
        cb.setAttribute('type', 'checkbox');
        cb.setAttribute('value', value);
        return cb;
    };
    // This is called with an array of row elements, and the ID they represent, so the widget can
    //  apply any custom styling it needs. It is called one time for each ID and respective row
    //  array, during the construction of the table rows.
    DataGridWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        // no special formatting by default
    };
    // Notify the widget that the DataGrid has been updated
    DataGridWidget.prototype.refreshWidget = function () {
        // nothing by default
    };
    return DataGridWidget;
}());
// This is the base class for additional widgets that appear in the options menu of a DataGrid table.
// The default behavior is to create a checkbox element with a callback, and pair it with a label element.
//
// Each DataGridOptionWidget needs to implement an applyFilterToIDs function to provide some method for filtering
// a given list of IDs.  This is how the widget affects which rows are displayed in the table.
//
// The DataGridSpec is responsible for instantiating these DataGridOptionWidget-derived objects for a particular table,
// and the DataGrid object is responsible for building the options menu that will store the checkbox and label elements.
var DataGridOptionWidget = (function (_super) {
    __extends(DataGridOptionWidget, _super);
    function DataGridOptionWidget(dataGridOwnerObject, dataGridSpec) {
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        this._createdElements = false;
    }
    // Return a fragment to use in generating option widget IDs
    DataGridOptionWidget.prototype.getIDFragment = function () {
        return 'GenericOptionCB';
    };
    // Return text used to label the widget
    DataGridOptionWidget.prototype.getLabelText = function () {
        return 'Name Of Option';
    };
    // Handle activation of widget
    DataGridOptionWidget.prototype.onWidgetChange = function (e) {
        this.dataGridOwnerObject.clickedOptionWidget(e);
    };
    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    DataGridOptionWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + this.getIDFragment() + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        // We need to make sure the checkbox has a callback to the DataGrid's handler function.
        // Among other things, the handler function will call the appropriate filtering functions for all the widgets in turn.
        $(cb).on('change.datagrid', function (e) { return _this.onWidgetChange(e); });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel(this.getLabelText(), cbID);
        this._createdElements = true;
    };
    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet, they are created, and the uniqueID is passed along.
    DataGridOptionWidget.prototype.appendElements = function (container, uniqueID) {
        if (!this._createdElements) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.checkBoxElement);
        container.appendChild(this.labelElement);
    };
    // This is called with an array of IDs for filtering, and a filtered array is returned.
    // It is acceptable to just return the original array if no filtering needs to be done.
    //
    // It's up to the designer to decide how the state of the widget affects filtering.
    // For example, if the widget is "additive", you would apply filtering if the widget's checkbox
    // is clear, and skip filtering if the checkbox is set, creating the appearance of a checkbox
    // that "adds" rows when checked.
    DataGridOptionWidget.prototype.applyFilterToIDs = function (rowIDs) {
        return rowIDs;
    };
    // Returns true if the control is enabled
    DataGridOptionWidget.prototype.getState = function () {
        return this.checkBoxElement.hasAttribute('checked');
    };
    // Returns true if the control should be enabled by default
    DataGridOptionWidget.prototype.isEnabledByDefault = function () {
        return false;
    };
    // Sets the enabled state to true or false, based on the given value
    DataGridOptionWidget.prototype.setState = function (enabled) {
        if (enabled) {
            this.checkBoxElement.setAttribute('checked', 'checked');
        }
        else {
            this.checkBoxElement.removeAttribute('checked');
        }
    };
    return DataGridOptionWidget;
}(DataGridWidget));
// This is the base class for additional widgets that appear in the header area of a DataGrid table.
//
// The DataGridSpec is responsible for instantiating these DataGridOptionWidget-derived objects for a particular table,
// and the DataGrid object is responsible for building the header area that will contain the widgets.
var DataGridHeaderWidget = (function (_super) {
    __extends(DataGridHeaderWidget, _super);
    function DataGridHeaderWidget(dataGridOwnerObject, dataGridSpec) {
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        this._displayBeforeViewMenuFlag = false;
        this._createdElements = false;
    }
    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    DataGridHeaderWidget.prototype.createElements = function (uniqueID) {
        var tBoxID = this.dataGridSpec.tableSpec.id + 'text' + uniqueID;
        var tBox = $(this.element = document.createElement("input"))
            .attr({ 'id': tBoxID, 'name': tBoxID, 'size': '20' })
            .addClass('tableControl');
    };
    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet, they are created, and the uniqueID is passed along.
    DataGridHeaderWidget.prototype.appendElements = function (container, uniqueID) {
        if (!this._createdElements) {
            this.createElements(uniqueID);
            this.createdElements(true);
        }
        container.appendChild(this.element);
    };
    DataGridHeaderWidget.prototype.createdElements = function (flag) {
        if (flag === undefined) {
            return this._createdElements;
        }
        else {
            this._createdElements = flag;
            return this;
        }
    };
    DataGridHeaderWidget.prototype.displayBeforeViewMenu = function (flag) {
        if (flag === undefined) {
            return this._displayBeforeViewMenuFlag;
        }
        else {
            this._displayBeforeViewMenuFlag = flag;
            return this;
        }
    };
    // This is called with an array of record IDs for filtering, and a filtered array is returned.
    // It is acceptable to just return the original array if no record filtering needs to be done.
    DataGridHeaderWidget.prototype.applyFilterToIDs = function (rowIDs) {
        return rowIDs;
    };
    return DataGridHeaderWidget;
}(DataGridWidget));
// A generic "Select All" header widget, appearing as a button.
// When clicked, it walks through every row and cell looking for DataGrid-created checkboxes,
// and checks every one it finds.
var DGSelectAllWidget = (function (_super) {
    __extends(DGSelectAllWidget, _super);
    function DGSelectAllWidget(dataGridOwnerObject, dataGridSpec) {
        _super.call(this, dataGridOwnerObject, dataGridSpec);
    }
    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    DGSelectAllWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var buttonID = this.dataGridSpec.tableSpec.id + 'SelAll' + uniqueID;
        var button = $(this.element = document.createElement("input"));
        button.attr({ 'id': buttonID, 'name': buttonID, 'value': 'Select All' })
            .addClass('tableControl')
            .click(function () { return _this.clickHandler(); });
        this.element.setAttribute('type', 'button'); // JQuery attr cannot do this
    };
    DGSelectAllWidget.prototype.clickHandler = function () {
        var sequence = this.dataGridOwnerObject.currentSequence();
        // Have DataGrid apply function to everything in current sequence
        this.dataGridOwnerObject.applyToRecordSet(function (rows) {
            // each row in sequence
            rows.forEach(function (row) {
                // each cell in row
                row.dataGridDataCells.forEach(function (cell) {
                    // if the cell has a checkbox, check it
                    $(cell.checkboxElement).prop('checked', true).trigger('change');
                });
            });
        }, sequence);
    };
    return DGSelectAllWidget;
}(DataGridHeaderWidget));
// A generic "Deselect All" header widget, appearing as a button.
// When clicked, it walks through every row and cell looking for DataGrid-created checkboxes,
// and checks every one it finds.
var DGDeselectAllWidget = (function (_super) {
    __extends(DGDeselectAllWidget, _super);
    function DGDeselectAllWidget(dataGridOwnerObject, dataGridSpec) {
        _super.call(this, dataGridOwnerObject, dataGridSpec);
    }
    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    DGDeselectAllWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var buttonID = this.dataGridSpec.tableSpec.id + 'DelAll' + uniqueID;
        var button = $(this.element = document.createElement("input"));
        button.attr({ 'id': buttonID, 'name': buttonID, 'value': 'Deselect All' })
            .addClass('tableControl')
            .click(function () { return _this.clickHandler(); });
        this.element.setAttribute('type', 'button'); // JQuery attr cannot do this
    };
    DGDeselectAllWidget.prototype.clickHandler = function () {
        var sequence = this.dataGridOwnerObject.currentSequence();
        // Have DataGrid apply function to everything in current sequence
        this.dataGridOwnerObject.applyToRecordSet(function (rows) {
            // each row in sequence
            rows.forEach(function (row) {
                // each cell in row
                row.dataGridDataCells.forEach(function (cell) {
                    // if the cell has a checkbox, uncheck it
                    $(cell.checkboxElement).prop('checked', false).trigger('change');
                });
            });
        }, sequence);
    };
    return DGDeselectAllWidget;
}(DataGridHeaderWidget));
// Here's an example of a working DataGridHeaderWidget.
// It's a search field that narrows the set of rows to ones that contain the given string.
var DGSearchWidget = (function (_super) {
    __extends(DGSearchWidget, _super);
    function DGSearchWidget(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus) {
        var _this = this;
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        // (Note: This syntax causes "this" to behave in a non-Javascript way
        // see http://stackoverflow.com/questions/16157839/typescript-this-inside-a-class-method )
        this.typingDelayExpirationHandler = function () {
            // ignore if the following keys are pressed: [del] [shift] [capslock]
            //if (this.lastKeyPressCode == 46) {
            //    return;
            //}
            // ignore if the following keys are pressed: [del] [shift] [capslock]
            if (_this.lastKeyPressCode > 8 && _this.lastKeyPressCode < 32) {
                return;
            }
            var v = $(_this.element).val();
            if (v == _this.previousSelection) {
                return;
            }
            _this.previousSelection = v;
            _this.dataGridOwnerObject.clickedHeaderWidget(_this);
        };
        this.placeHolder = placeHolder;
        this.fieldSize = size;
        this.getsFocus = getsFocus;
        this.typingTimeout = null;
        this.typingDelay = 330;
        this.lastKeyPressCode = null;
        this.previousSelection = null;
        this.minCharsToTriggerSearch = 1;
    }
    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    DGSearchWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var sBoxID = this.dataGridSpec.tableSpec.id + 'SearchBox' + uniqueID;
        var sBox = $(this.element = document.createElement("input"))
            .attr({ 'id': sBoxID, 'name': sBoxID, 'size': this.fieldSize, 'placeholder': this.placeHolder })
            .addClass('tableControl searchBox').keydown(function (e) { return _this.inputKeyDownHandler(e); });
        this.element.setAttribute('type', 'text'); // JQuery .attr() cannot set this
        if (this.getsFocus) {
            sBox.attr('autofocus', 'autofocus');
        }
    };
    DGSearchWidget.prototype.inputKeyDownHandler = function (e) {
        // track last key pressed
        this.lastKeyPressCode = e.keyCode;
        switch (e.keyCode) {
            case 38:
                e.preventDefault();
                break;
            case 40:
                e.preventDefault();
                break;
            case 9:
                break;
            case 13:
                e.preventDefault();
                break;
            default:
                if (this.typingTimeout) {
                    clearTimeout(this.typingTimeout);
                }
                this.typingTimeout = setTimeout(this.typingDelayExpirationHandler, this.typingDelay);
                break;
        }
    };
    // This is called with an array of record IDs for filtering, and a filtered array is returned.
    // It is acceptable to just return the original array if no record filtering needs to be done.
    DGSearchWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var v = this.previousSelection;
        if (v == null) {
            return rowIDs;
        }
        if (v.length < this.minCharsToTriggerSearch) {
            return rowIDs;
        }
        v = v.trim(); // Remove leading and trailing whitespace
        v = v.toLowerCase();
        v = v.replace(/\s\s*/, ' '); // Replace internal whitespace with single spaces
        // If there are multiple words, we look for each separately, but expect to find all of them.
        // We will not attempt to match against empty strings, so we filter those out if any slipped through.
        var queryStrs = v.split(' ').filter(function (one) { return one.length > 0; });
        if (queryStrs.length == 0) {
            return rowIDs;
        }
        var filteredIDs = [];
        this.dataGridOwnerObject.applyToRecordSet(function (rows, id) {
            var thisRecordQueryStrs = queryStrs;
            // Go row by row, cell by cell, testing each query until it matches,
            // until we run out of unmatched queries (and return true) or run out
            // of rows and cells (and return false).
            var rowsMatch = rows.some(function (row) {
                return row.dataGridDataCells.some(function (cell) {
                    if (!cell.createdElement) {
                        return false;
                    }
                    var text = cell.contentContainerElement.textContent.toLowerCase();
                    var unmatchedQueryStrs = [];
                    thisRecordQueryStrs.forEach(function (queryStr) {
                        if (text.length < queryStr.length || text.indexOf(queryStr) < 0) {
                            unmatchedQueryStrs.push(queryStr);
                        }
                    });
                    if (unmatchedQueryStrs.length == 0) {
                        return true;
                    }
                    thisRecordQueryStrs = unmatchedQueryStrs;
                    return false;
                });
            });
            if (rowsMatch) {
                filteredIDs.push(id);
            }
        }, rowIDs);
        return filteredIDs;
    };
    return DGSearchWidget;
}(DataGridHeaderWidget));
var DataGridSort = (function () {
    function DataGridSort() {
    }
    return DataGridSort;
}());
// This is a widget that will place controls for paging
var DGPagingWidget = (function (_super) {
    __extends(DGPagingWidget, _super);
    function DGPagingWidget(dataGridOwnerObject, dataGridSpec, source) {
        var _this = this;
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        this.requestDone = function (success) {
            if (success) {
                _this.dataGridOwnerObject.triggerDataReset();
            }
        };
        this.source = source;
        this.displayBeforeViewMenu(true);
    }
    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet, they are created, and the uniqueID is passed along.
    DGPagingWidget.prototype.appendElements = function (container, uniqueID) {
        var _this = this;
        if (!this.createdElements()) {
            $(this.widgetElement = document.createElement('div'));
            $('.searchStudies').append(this.widgetElement);
            $(this.labelElement = document.createElement('span'))
                .appendTo(this.widgetElement);
            $(this.prevElement = document.createElement('a'))
                .attr('href', '#').css('margin', '0 5px')
                .text('< Previous').addClass('disableLink')
                .appendTo(this.widgetElement)
                .click(function () {
                _this.source.pageDelta(-1).requestPageOfData(_this.requestDone);
                return false;
            });
            $(this.nextElement = document.createElement('a'))
                .attr('href', '#').css('margin', '0 5px')
                .text('Next >').prop('disabled', true)
                .appendTo(this.widgetElement)
                .click(function () {
                _this.source.pageDelta(1).requestPageOfData(_this.requestDone);
                return false;
            });
            this.createdElements(true);
            $(this.widgetElement).addClass('studyPrevNext');
        }
        this.refreshWidget();
    };
    DGPagingWidget.prototype.refreshWidget = function () {
        var totalSize = this.source.totalSize();
        var viewSize = this.source.viewSize();
        var start = this.source.totalOffset();
        var labelText;
        if (totalSize) {
            labelText = ['Displaying ', start + 1, '-', start + viewSize, ' of ', totalSize].join('');
        }
        else {
            labelText = 'No results found!';
        }
        $(this.labelElement).text(labelText);
        if (!start) {
            $(this.prevElement).addClass('disableLink');
        }
        else {
            $(this.prevElement).removeClass('disableLink');
        }
        if (start + viewSize >= totalSize) {
            $(this.nextElement).addClass('disableLink');
        }
        else {
            $(this.nextElement).removeClass('disableLink');
        }
    };
    return DGPagingWidget;
}(DataGridHeaderWidget));
// Define the TableSpec object used by DataGridSpecBase
var DataGridTableSpec = (function () {
    function DataGridTableSpec(id, opt) {
        this.id = id; // ID is required, initialize sensible defaults for everything else
        opt = $.extend({ 'name': '', 'defaultSort': 0, 'showHeader': true, 'applyStriping': true }, opt);
        this.name = opt['name'];
        this.defaultSort = opt['defaultSort'];
        this.showHeader = opt['showHeader'];
        this.applyStriping = opt['applyStriping'];
    }
    return DataGridTableSpec;
}());
// Define the HeaderSpec object used by DataGridSpecBase
var DataGridHeaderSpec = (function () {
    function DataGridHeaderSpec(group, id, opt) {
        this.columnGroup = group;
        this.id = id; // ID is required, initialize sensible defaults for everything else
        opt = $.extend({ 'name': '', 'align': 'left', 'size': 'm', 'sortAfter': -1 }, opt); // most things can be null
        this.name = opt['name'];
        this.align = opt['align'];
        this.valign = opt['valign'];
        this.nowrap = opt['nowrap'];
        this.rowspan = opt['rowspan'];
        this.colspan = opt['colspan'];
        this.headerRow = opt['headerRow'];
        this.display = opt['display'];
        this.size = opt['size'];
        this.width = opt['width'];
        this.sortBy = opt['sortBy'];
        this.sortAfter = opt['sortAfter'];
        this.sortId = opt['sortId'];
    }
    return DataGridHeaderSpec;
}());
// Define the ColumnSpec object used by DataGridSpecBase
var DataGridColumnSpec = (function () {
    function DataGridColumnSpec(group, generateCells) {
        this.columnGroup = group;
        this.generateCellsFunction = generateCells;
        this.createdDataCellObjects = {};
    }
    DataGridColumnSpec.prototype.generateCells = function (gridSpec, index) {
        var c = this.generateCellsFunction(gridSpec, index);
        this.createdDataCellObjects[index] = c.slice(0);
        return c;
    };
    DataGridColumnSpec.prototype.clearIndexAtID = function (index) {
        delete this.createdDataCellObjects[index];
    };
    DataGridColumnSpec.prototype.cellIndexAtID = function (index) {
        return this.createdDataCellObjects[index];
    };
    DataGridColumnSpec.prototype.getEntireIndex = function () {
        var cells = [];
        for (var key in this.createdDataCellObjects) {
            var a = this.createdDataCellObjects[key];
            if (a) {
                // Much faster than repeated concats
                Array.prototype.push.apply(cells, a);
            }
        }
        return cells;
    };
    return DataGridColumnSpec;
}());
// Define the ColumnGroupSpec object used by DataGridSpecBase
var DataGridColumnGroupSpec = (function () {
    function DataGridColumnGroupSpec(label, opt) {
        this.name = label;
        opt = $.extend({ 'showInVisibilityList': true }, opt);
        this.showInVisibilityList = opt['showInVisibilityList'];
        this.hiddenByDefault = opt['hiddenByDefault'];
        this.revealedCallback = opt['revealedCallback'];
    }
    return DataGridColumnGroupSpec;
}());
// Define the RowGroupSpec object used by DataGridSpecBase
var DataGridRowGroupSpec = (function () {
    function DataGridRowGroupSpec(label) {
        this.name = label;
    }
    return DataGridRowGroupSpec;
}());
// Users of DataGrid should derive from this class, altering the constructor to
// provide a specification for the layout, interface, and data sources of their DataGrid table,
// and override the callbacks to customize functionality.
// Then, when they instantiate a DataGrid, they should provide an instance of this derived DataGridSpecBase.
// As an example, this base class is set up to render the Studies table on the main page of the EDD.
var DataGridSpecBase = (function () {
    function DataGridSpecBase() {
        this.tableElement = null;
        this.tableSpec = null;
        this.tableHeaderSpec = null;
        this.tableColumnSpec = null;
        this.tableColumnGroupSpec = null;
        this.tableRowGroupSpec = null;
    }
    DataGridSpecBase.prototype.init = function () {
        this.tableElement = this.getTableElement();
        this.tableSpec = this.defineTableSpec();
        this.tableHeaderSpec = this.defineHeaderSpec();
        this.tableColumnSpec = this.defineColumnSpec();
        this.tableColumnGroupSpec = this.defineColumnGroupSpec();
        this.tableRowGroupSpec = this.defineRowGroupSpec();
    };
    // All of these "define" functions should be overridden
    // Specification for the table as a whole
    DataGridSpecBase.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('uniquestring', { 'name': 'Awesome Table' });
    };
    // Specification for the headers along the top of the table
    DataGridSpecBase.prototype.defineHeaderSpec = function () {
        return [
            new DataGridHeaderSpec(1, 'hName', { 'name': 'Name' }),
            new DataGridHeaderSpec(2, 'hDesc', { 'name': 'Description' })
        ];
    };
    // Specification for each of the data columns that will make up the body of the table
    DataGridSpecBase.prototype.defineColumnSpec = function () {
        return [
            new DataGridColumnSpec(1, function (gridSpec, index) {
                // Create cell(s) for a given record ID, for column 1
                return [new DataGridDataCell(gridSpec, index)];
            }),
            new DataGridColumnSpec(2, function (gridSpec, index) {
                // Create cell(s) for a given record ID, for column 2
                return [new DataGridDataCell(gridSpec, index)];
            }),
        ];
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecBase.prototype.defineColumnGroupSpec = function () {
        return [
            new DataGridColumnGroupSpec('Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Description')
        ];
    };
    // Specification for the groups that rows can be gathered into
    DataGridSpecBase.prototype.defineRowGroupSpec = function () {
        return [];
    };
    // attach event handlers for sorting
    DataGridSpecBase.prototype.enableSort = function (grid) {
        var _this = this;
        this.tableHeaderSpec.forEach(function (header) {
            if (header.sortBy) {
                $(header.element).on('click.datatable', function (ev) { return _this.clickedSort(grid, header, ev); });
            }
        });
        return this;
    };
    // The server code hooks table headers with this function.
    DataGridSpecBase.prototype.clickedSort = function (grid, header, ev) {
        var sort = grid.sortCols();
        if (sort.length && sort[0].spec.id === header.id) {
            sort[0].asc = !sort[0].asc;
        }
        else {
            sort = [{ 'spec': header, 'asc': true }];
        }
        grid.sortCols(sort).arrangeTableDataRows();
    };
    // When passed a record ID, returns the row group that the record is a member of.
    DataGridSpecBase.prototype.getRowGroupMembership = function (recordID) {
        return 0;
    };
    // The table element on the page that will be turned into the DataGrid.  Any preexisting table content will be removed.
    DataGridSpecBase.prototype.getTableElement = function () {
        return document.getElementById("studiesTable");
    };
    // An array of unique identifiers, used to identify the records in the data set being displayed
    DataGridSpecBase.prototype.getRecordIDs = function () {
        return [];
    };
    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    DataGridSpecBase.prototype.createCustomHeaderWidgets = function (dataGrid) {
        // Create a single widget for showing disabled Studies
        var array = [];
        array.push(new DGSearchWidget(dataGrid, this, 'Search Studies', 40, true));
        return array;
    };
    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    DataGridSpecBase.prototype.createCustomOptionsWidgets = function (dataGrid) {
        var widgetSet = [];
        // Create a single widget for showing only the Studies that belong to the current user
        //        var onlyMyStudiesWidget = new DGOnlyMyStudiesWidget(dataGrid, this);
        //        widgetSet.push(onlyMyStudiesWidget);
        // Create a single widget for showing disabled Studies
        //        var disabledStudiesWidget = new DGDisabledStudiesWidget(dataGrid, this);
        //        widgetSet.push(disabledStudiesWidget);
        return widgetSet;
    };
    // This is called after everything is initialized, including the creation of the table content.
    DataGridSpecBase.prototype.onInitialized = function (dataGrid) {
    };
    // This is called when a data reset is triggered, but before the table rows are rebuilt.
    DataGridSpecBase.prototype.onDataReset = function (dataGrid) {
        return; // Do nothing by default.
    };
    // This is called when a partial data reset is triggered, but before the table rows are rebuilt.
    // A partial data reset is one where a collection of records have been specified for re-parsing,
    // and will be mixed-in with the currently rendered collection afterwards.
    DataGridSpecBase.prototype.onPartialDataReset = function (dataGrid, records) {
        return; // Do nothing by default.
    };
    // Called when the user hides or shows rows.
    DataGridSpecBase.prototype.onRowVisibilityChanged = function () {
    };
    // This is called to generate a group name. You can process your data however
    // you want in order to come up with a name.
    DataGridSpecBase.prototype.generateGroupName = function (dataGrid, groupID) {
        return "Group " + groupID;
    };
    // This is called when the grouping setting is changed, in case
    // you want to persist the setting somewhere.
    DataGridSpecBase.prototype.onUpdatedGroupingEnabled = function (dataGrid, enabled) {
    };
    return DataGridSpecBase;
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGF0YUdyaWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJEYXRhR3JpZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQixxQ0FBcUM7Ozs7OztBQUVyQyxFQUFFO0FBQ0YsbUZBQW1GO0FBQ25GLGlFQUFpRTtBQUNqRSxFQUFFO0FBRUY7SUE4QkkseURBQXlEO0lBQ3pELDZGQUE2RjtJQUM3RixrQkFBWSxZQUE2QjtRQWhDN0MsaUJBZ2hDQztRQXgvQlcscUJBQWdCLEdBQVcsS0FBSyxDQUFDLENBQUksK0JBQStCO1FBQ3BFLFVBQUssR0FBa0IsRUFBRSxDQUFDO1FBQzFCLGNBQVMsR0FBZ0MsRUFBRSxDQUFDO1FBUWhELDBFQUEwRTtRQUMxRSxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUN4Qix1RUFBdUUsQ0FBQyxDQUFDO1FBQzdFLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxZQUFZLElBQUksWUFBWSxDQUFDLFNBQVM7WUFDNUQsWUFBWSxDQUFDLGVBQWUsSUFBSSxZQUFZLENBQUMsZUFBZSxDQUFDLEVBQ2pFLG9FQUFvRSxDQUFDLENBQUM7UUFFMUUsRUFBRTtRQUNGLCtCQUErQjtRQUMvQixFQUFFO1FBRUYsMERBQTBEO1FBQzFELHVFQUF1RTtRQUN2RSxnREFBZ0Q7UUFDaEQsbUVBQW1FO1FBQ25FLElBQUksQ0FBQyxLQUFLLEdBQUcsWUFBWSxDQUFDO1FBQzFCLElBQUksQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDLFlBQVksQ0FBQztRQUN4QyxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNsQixJQUFJLENBQUMsUUFBUSxHQUFHLDhEQUE4RCxDQUFDO1FBRS9FLElBQUksU0FBUyxHQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLFFBQVEs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eUIsUUFBaUIsRUFBRSxPQUFlO0lBQzNELENBQUM7SUFFTCx1QkFBQztBQUFELENBQUMsQUFyTEQsSUFxTEMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEcmFnYm94ZXMudHNcIiAvPlxuXG4vL1xuLy8gVGhpcyBpcyBhIHJlLWltcGxlbWVudGF0aW9uIG9mIERhdGFHcmlkU2VydmVyU2lkZSBmb3Igd2hvbGx5IGNsaWVudC1zaWRlIHRhYmxlcy5cbi8vIEV2ZW50dWFsbHkgRGF0YUdyaWRTZXJ2ZXJTaWRlIHNob3VsZCBiZSBwaGFzZWQgb3V0IGNvbXBsZXRlbHkuXG4vL1xuXG5jbGFzcyBEYXRhR3JpZCB7XG5cbiAgICAvLyBNZW1iZXIgdmFyaWFibGVzLlxuICAgIHByaXZhdGUgX3NwZWM6RGF0YUdyaWRTcGVjQmFzZTtcblxuICAgIHByaXZhdGUgX3RhYmxlOkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgX3RhYmxlQm9keTpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIF90YWJsZUJvZHlKcXVlcnk6IEpRdWVyeTtcbiAgICBwcml2YXRlIF90YWJsZUhlYWRlckNlbGw6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfd2FpdEJhZGdlOkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgX2NsYXNzZXM6c3RyaW5nO1xuICAgIHByaXZhdGUgX3NlY3Rpb246SlF1ZXJ5O1xuXG4gICAgcHJpdmF0ZSBfaGVhZGVyUm93czpIVE1MRWxlbWVudFtdO1xuICAgIHByaXZhdGUgX3RvdGFsQ29sdW1uQ291bnQ6bnVtYmVyO1xuICAgIHByaXZhdGUgX3JlY29yZEVsZW1lbnRzOkRhdGFHcmlkUmVjb3JkU2V0O1xuXG4gICAgcHJpdmF0ZSBfaGVhZGVyV2lkZ2V0czpEYXRhR3JpZEhlYWRlcldpZGdldFtdO1xuICAgIHByaXZhdGUgX29wdGlvbnNNZW51V2lkZ2V0czpEYXRhR3JpZE9wdGlvbldpZGdldFtdO1xuICAgIHByaXZhdGUgX29wdGlvbnNNZW51RWxlbWVudDpIVE1MRWxlbWVudDtcblxuICAgIHByaXZhdGUgX29wdGlvbnNNZW51QmxvY2tFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgX29wdGlvbnNMYWJlbDpIVE1MRWxlbWVudDtcblxuICAgIHByaXZhdGUgX2dyb3VwaW5nRW5hYmxlZDpib29sZWFuID0gZmFsc2U7ICAgIC8vIGdyb3VwaW5nIG1vZGUgb2ZmIGJ5IGRlZmF1bHRcbiAgICBwcml2YXRlIF9zb3J0OkRhdGFHcmlkU29ydFtdID0gW107XG4gICAgcHJpdmF0ZSBfc2VxdWVuY2U6eyBbaW5kZXg6bnVtYmVyXTogc3RyaW5nW10gfSA9IHt9O1xuXG4gICAgcHJpdmF0ZSBfdGltZXJzOntbaW5kZXg6c3RyaW5nXTpudW1iZXJ9O1xuXG4gICAgLy8gVGhpcyBiaW5kcyBhIHRhYmxlIGVsZW1lbnQgdG8gYW4gaW5zdGFuY2Ugb2YgRGF0YUdyaWQuXG4gICAgLy8gVGhlIHByZXZpb3VzIGNvbnRlbnRzIG9mIHRoZSB0YWJsZSwgaWYgYW55LCBhcmUgZGVsZXRlZCwgYW5kIERhdGFHcmlkIHRha2VzIG92ZXIgdGhlIHRhYmxlXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcblxuICAgICAgICAvLyBVc2UgISEgZG91YmxlLW5vdCBvcGVyYXRvciB0byBjb2VyY2UgdHJ1dGgteS9mYWxzZS15IHZhbHVlcyB0byBib29sZWFuc1xuICAgICAgICBVdGwuSlMuYXNzZXJ0KCEhZGF0YUdyaWRTcGVjLFxuICAgICAgICAgICAgXCJEYXRhR3JpZCBuZWVkcyB0byBiZSBzdXBwbGllZCB3aXRoIGEgRGF0YUdyaWRTcGVjQmFzZS1kZXJpdmVkIG9iamVjdC5cIik7XG4gICAgICAgIFV0bC5KUy5hc3NlcnQoISEoZGF0YUdyaWRTcGVjLnRhYmxlRWxlbWVudCAmJiBkYXRhR3JpZFNwZWMudGFibGVTcGVjICYmXG4gICAgICAgICAgICAgICAgZGF0YUdyaWRTcGVjLnRhYmxlSGVhZGVyU3BlYyAmJiBkYXRhR3JpZFNwZWMudGFibGVDb2x1bW5TcGVjKSxcbiAgICAgICAgICAgIFwiRGF0YUdyaWRTcGVjQmFzZS1kZXJpdmVkIG9iamVjdCBkb2VzIG5vdCBoYXZlIGVub3VnaCB0byB3b3JrIHdpdGguXCIpO1xuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIE1lbWJlciB2YXJpYWJsZSBkZWNsYXJhdGlvbnNcbiAgICAgICAgLy9cblxuICAgICAgICAvLyBXZSBuZWVkIGEgRGF0YUdyaWRTcGVjQmFzZS1kZXJpdmVkIHRhYmxlIHNwZWNpZmljYXRpb24uXG4gICAgICAgIC8vIChUaGlzIG9iamVjdCBkZXNjcmliZXMgdGhlIHRhYmxlIGFuZCBpbXBsZW1lbnRzIGN1c3RvbSBmdW5jdGlvbmFsaXR5XG4gICAgICAgIC8vIHRoYXQgYmVsb25ncyB3aXRoIHdob2V2ZXIgY3JlYXRlZCB0aGUgdGFibGUuKVxuICAgICAgICAvLyAoU2VlIHRoZSBEYXRhR3JpZFNwZWNCYXNlIGNsYXNzIHRvIHNlZSB3aGF0IGNhbiBiZSBpbXBsZW1lbnRlZC4pXG4gICAgICAgIHRoaXMuX3NwZWMgPSBkYXRhR3JpZFNwZWM7XG4gICAgICAgIHRoaXMuX3RhYmxlID0gZGF0YUdyaWRTcGVjLnRhYmxlRWxlbWVudDtcbiAgICAgICAgdGhpcy5fdGltZXJzID0ge307XG4gICAgICAgIHRoaXMuX2NsYXNzZXMgPSAnZGF0YVRhYmxlIHNvcnRhYmxlIGRyYWdib3hlcyBoYXN0YWJsZWNvbnRyb2xzIHRhYmxlLWJvcmRlcmVkJztcblxuICAgICAgICB2YXIgdGFibGVCb2R5OkpRdWVyeSA9ICQodGhpcy5fdGFibGVCb2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRib2R5XCIpKTtcbiAgICAgICAgICAgICAgICAgLy8gRmlyc3Qgc3RlcDogQmxvdyBhd2F5IHRoZSBvbGQgY29udGVudHMgb2YgdGhlIHRhYmxlXG4gICAgICAgICAgICAgICAgJCh0aGlzLl90YWJsZSkuZW1wdHkoKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICdjZWxscGFkZGluZyc6IDAsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmFkZENsYXNzKHRoaXMuX2dldENsYXNzZXMoKSlcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogTW9zdCBvZiB0aGVzZSBjbGFzc2VzIGFyZSBwcm9iYWJseSBub3QgbmVlZGVkIG5vd1xuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kKHRhYmxlQm9keSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGFibGVCb2R5SnF1ZXJ5ID0gdGFibGVCb2R5O1xuICAgICAgICAgICAgICAgIHZhciB0SGVhZFJvdyA9IHRoaXMuX2dldFRIZWFkUm93KCk7XG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlSGVhZGVyUm93ID0gdGhpcy5fZ2V0VGFibGVIZWFkZXJSb3coKS5hcHBlbmRUbyh0SGVhZFJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlSGVhZGVyQ2VsbCA9ICQodGhpcy5fdGFibGVIZWFkZXJDZWxsID0gdGhpcy5fZ2V0VGFibGVIZWFkZXJDZWxsKCkpLmFwcGVuZFRvKHRhYmxlSGVhZGVyUm93KTtcbiAgICAgICAgICAgICAgICB2YXIgd2FpdEJhZGdlID0gJCh0aGlzLl93YWl0QmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKSlcbiAgICAgICAgICAgICAgICAgICAgLmFkZENsYXNzKCd3YWl0YmFkZ2Ugd2FpdCcpLmFwcGVuZFRvKHRhYmxlSGVhZGVyQ2VsbCk7XG4gICAgICAgICAgICAgICAgaWYgKCh0aGlzLl90b3RhbENvbHVtbkNvdW50ID0gdGhpcy5jb3VudFRvdGFsQ29sdW1ucygpKSA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgIHRhYmxlSGVhZGVyQ2VsbC5hdHRyKCdjb2xzcGFuJywgdGhpcy5fdG90YWxDb2x1bW5Db3VudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuX3NlY3Rpb24gPSAkKHRhYmxlQm9keSkucGFyZW50KCkucGFyZW50KCk7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgYXNrZWQgdG8gc2hvdyB0aGUgaGVhZGVyLCB0aGVuIGFkZCBpdCB0byB0aGUgdGFibGUuICBPdGhlcndpc2Ugd2Ugd2lsbCBsZWF2ZSBpdCBvZmYuXG4gICAgICAgICAgICAgICAgaWYgKGRhdGFHcmlkU3BlYy50YWJsZVNwZWMuc2hvd0hlYWRlcikge1xuICAgICAgICAgICAgICAgICAgICB0SGVhZFJvdy5pbnNlcnRCZWZvcmUodGhpcy5fZ2V0RGl2Rm9yVGFibGVIZWFkZXJzKCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQXBwbHkgdGhlIGRlZmF1bHQgY29sdW1uIHZpc2liaWxpdHkgc2V0dGluZ3MuXG4gICAgICAgICAgICB0aGlzLnByZXBhcmVDb2x1bW5WaXNpYmlsaXR5KCk7XG4gICAgICAgICAgICB2YXIgdEhlYWQgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0aGVhZFwiKSk7XG4gICAgICAgICAgICB2YXIgaGVhZGVyUm93cyA9IHRoaXMuX2hlYWRlclJvd3MgPSB0aGlzLl9idWlsZFRhYmxlSGVhZGVycygpO1xuICAgICAgICAgICAgdEhlYWQuYXBwZW5kKGhlYWRlclJvd3MpO1xuICAgICAgICAgICAgICQodEhlYWQpLmluc2VydEJlZm9yZSh0aGlzLl90YWJsZUJvZHkpO1xuXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCAoKSA9PiB0aGlzLl9pbml0aWFsaXplVGFibGVEYXRhKCksIDEgKTtcbiAgICB9XG5cbiAgICBfZ2V0VGFibGVCb2R5KCk6SlF1ZXJ5IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RhYmxlQm9keUpxdWVyeTtcbiAgICB9XG5cbiAgICBfZ2V0VGFibGVIZWFkZXJDZWxsKCk6SFRNTEVsZW1lbnQge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIilcbiAgICB9XG5cbiAgICBfZ2V0VGFibGVIZWFkZXJSb3coKTpKUXVlcnkge1xuICAgICAgICByZXR1cm4gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKSkuYWRkQ2xhc3MoJ2hlYWRlcicpO1xuICAgIH1cblxuICAgIF9nZXRUSGVhZFJvdygpOkpRdWVyeSB7XG4gICAgICAgIHJldHVybiAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKS5hZGRDbGFzcygnc2VhcmNoU3R1ZGllcycpO1xuICAgIH1cblxuICAgIF9nZXREaXZGb3JUYWJsZUhlYWRlcnMoKTphbnkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VjdGlvbjtcbiAgICB9XG5cbiAgICBfZ2V0Q2xhc3NlcygpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGFzc2VzO1xuICAgIH1cblxuICAgIC8vIEJyZWFraW5nIHVwIHRoZSBpbml0aWFsIHRhYmxlIGNyZWF0aW9uIGludG8gdHdvIHN0YWdlcyBhbGxvd3MgdGhlIGJyb3dzZXIgdG8gcmVuZGVyIGEgcHJlbGltaW5hcnlcbiAgICAvLyB2ZXJzaW9uIG9mIHRoZSB0YWJsZSB3aXRoIGEgaGVhZGVyIGJ1dCBubyBkYXRhIHJvd3MsIHRoZW4gY29udGludWUgbG9hZGluZyBvdGhlciBhc3NldHMgaW4gcGFyYWxsZWwuXG4gICAgLy8gSXQgYWN0dWFsbHkgc3BlZWRzIHVwIHRoZSBlbnRpcmUgdGFibGUgY3JlYXRpb24gYXMgd2VsbCwgZm9yIHJlYXNvbnMgdGhhdCBhcmUgbm90IHZlcnkgY2xlYXIuXG4gICAgLy8gKElmIHRoZSBzZXR1cCBpcyBOT1QgcnVuIGluIHR3byBzdGFnZXMsIGFsbCB0aGUgJ2NyZWF0ZUVsZW1lbnQnIGNhbGxzIGZvciB0aGUgZGF0YSBjZWxscyB0YWtlIG11Y2ggbG9uZ2VyLFxuICAgIC8vIGluIEZpcmVmb3ggYW5kIFNhZmFyaSwgYWNjb3JkaW5nIHRvIGxvYWQtdGltZSBwcm9maWxpbmcgLi4uIGFuZCBvbmx5IHdoZW4gcGFpcmVkIHdpdGggc29tZSBzZXJ2ZXJzPz8pXG4gICAgX2luaXRpYWxpemVUYWJsZURhdGEoKTpEYXRhR3JpZCB7XG5cbiAgICAgICAgdmFyIGhDZWxsID0gdGhpcy5fdGFibGVIZWFkZXJDZWxsO1xuXG4gICAgICAgIERyYWdib3hlcy5pbml0VGFibGUodGhpcy5fdGFibGUpO1xuICAgICAgICB0aGlzLl9idWlsZEFsbFRhYmxlU29ydGVycygpXG4gICAgICAgICAgICAuX2J1aWxkVGFibGVTb3J0U2VxdWVuY2VzKClcbiAgICAgICAgICAgIC5fYWxsb2NhdGVUYWJsZVJvd1JlY29yZHMoKVxuICAgICAgICAgICAgLl9idWlsZFJvd0dyb3VwVGl0bGVSb3dzKClcbiAgICAgICAgICAgIC5fY3JlYXRlT3B0aW9uc01lbnUoKVxuICAgICAgICAgICAgLl9jcmVhdGVIZWFkZXJXaWRnZXRzKCk7XG5cbiAgICAgICAgLy8gRmlyc3QsIGFwcGVuZCB0aGUgaGVhZGVyIHdpZGdldHMgdGhhdCBzaG91bGQgdG8gYXBwZWFyIFwiYWZ0ZXJcIiB0aGUgcHVsbGRvd24uXG4gICAgICAgIC8vIChTaW5jZSBhbGwgd2lkZ2V0cyBhcmUgc3R5bGVkIHRvIGZsb2F0IHJpZ2h0LCB0aGV5IHdpbGwgYXBwZWFyIGZyb20gcmlnaHQgdG8gbGVmdC4pXG4gICAgICAgIHRoaXMuX2hlYWRlcldpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF3aWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KCkpIHtcbiAgICAgICAgICAgICAgICB3aWRnZXQuYXBwZW5kRWxlbWVudHMoaENlbGwsIGluZGV4LnRvU3RyaW5nKDEwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBOb3cgYXBwZW5kIHRoZSAnVmlldycgcHVsbGRvd24gbWVudVxuICAgICAgICBoQ2VsbC5hcHBlbmRDaGlsZCh0aGlzLl9vcHRpb25zTWVudUVsZW1lbnQpO1xuICAgICAgICAvLyBGaW5hbGx5LCBhcHBlbmQgdGhlIGhlYWRlciB3aWRnZXRzIHRoYXQgc2hvdWxkIGFwcGVhciBcImJlZm9yZVwiLlxuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmICh3aWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KCkpIHtcbiAgICAgICAgICAgICAgICB3aWRnZXQuYXBwZW5kRWxlbWVudHMoaENlbGwsIGluZGV4LnRvU3RyaW5nKDEwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX2luaXRpYWxpemVTb3J0KCkuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKTtcblxuICAgICAgICAvLyBOb3cgdGhhdCB3ZSd2ZSBjb25zdHJ1Y3RlZCBvdXIgZWxlbWVudHMsIGFwcGx5IHZpc2liaWxpdHkgc3R5bGluZyB0byB0aGVtLlxuICAgICAgICB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHkoKTtcblxuICAgICAgICAvLyBQcmVwYXJlIHRoZSB0YWJsZSBmb3Igc29ydGluZ1xuICAgICAgICB0aGlzLl9wcmVwYXJlU29ydGFibGUoKTtcblxuICAgICAgICB0aGlzLl9zcGVjLm9uSW5pdGlhbGl6ZWQodGhpcyk7XG4gICAgICAgICQodGhpcy5fd2FpdEJhZGdlKS5hZGRDbGFzcygnb2ZmJyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBfaW5pdGlhbGl6ZVNvcnQoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBkZWZhdWx0U29ydCA9IHRoaXMuX3NwZWMudGFibGVTcGVjLmRlZmF1bHRTb3J0IHx8IDA7XG4gICAgICAgIHRoaXMuX3NvcnQgPSBbIHsgJ3NwZWMnOiB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlY1tkZWZhdWx0U29ydF0sICdhc2MnOiB0cnVlIH0gXTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBOb3RpZnkgdGhlIERhdGFHcmlkIHRoYXQgaXRzIHVuZGVybHlpbmcgZGF0YSBoYXMgcmVzZXRcbiAgICB0cmlnZ2VyRGF0YVJlc2V0KCk6RGF0YUdyaWQge1xuICAgICAgICAvLyBXZSBoYXZlIG5ldyBkYXRhIHRvIGRpc3BsYXkuIENsZWFyIG91dCBvbGQgcm93cy5cbiAgICAgICAgJC5lYWNoKHRoaXMuX3JlY29yZEVsZW1lbnRzLCAoaW5kZXg6bnVtYmVyLCB2YWx1ZTpEYXRhR3JpZFJlY29yZCkgPT4ge1xuICAgICAgICAgICAgdmFsdWUucmVtb3ZlRWxlbWVudHMoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3NwZWMub25EYXRhUmVzZXQodGhpcyk7XG4gICAgICAgIC8vIFJlYnVpbGQgcm93cy5cbiAgICAgICAgdGhpcy5fYnVpbGRUYWJsZVNvcnRTZXF1ZW5jZXMoKS5fYWxsb2NhdGVUYWJsZVJvd1JlY29yZHMoKVxuICAgICAgICAvLyBBbmQgdGhlbiBhcnJhbmdlIHRoZSByb3dzXG4gICAgICAgICAgICAuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKTtcblxuICAgICAgICAvLyBDYWxsIHRoZSBzdXBwb3J0IGZ1bmN0aW9uIGluIGVhY2ggd2lkZ2V0LCB0byBhcHBseSBzdHlsaW5nIHRvIGFsbCB0aGUgZGF0YSByb3dzIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX3NwZWMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB3aWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQodGhpcy5fcmVjb3JkRWxlbWVudHNbaWRdLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgaWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFuZCBtYWtlIHN1cmUgb25seSB0aGUgY3VycmVudGx5IHZpc2libGUgdGhpbmdzIGFyZSAuLi4gdmlzaWJsZVxuICAgICAgICB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHkoKTtcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB3aWRnZXQucmVmcmVzaFdpZGdldCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHdpZGdldC5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIFVwZGF0ZSBvbmx5IHRoZSB0YWJsZSByb3dzIGZvciB0aGUgc3BlY2lmaWVkIHJlY29yZHMuXG4gICAgLy8gRm9yIHVzZSBpbiBzaXR1YXRpb25zIHdoZXJlIHlvdSB3YW50IHRvIGFkZCByb3dzLCBvciByZWJ1aWxkIGV4aXN0aW5nIHJvd3MsXG4gICAgLy8gYW5kIGxlYXZlIHRoZSByZXN0IHVuY2hhbmdlZC5cbiAgICB0cmlnZ2VyUGFydGlhbERhdGFSZXNldChyZWNvcmRJRHM6c3RyaW5nW10sIHJlZmxvdzpib29sZWFuKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3NwZWMub25QYXJ0aWFsRGF0YVJlc2V0KHRoaXMsIHJlY29yZElEcyk7XG4gICAgICAgIC8vIFJlYnVpbGQgcm93cy5cbiAgICAgICAgcmVjb3JkSURzLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnJlY29uc3RydWN0U2luZ2xlUmVjb3JkKGlkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlZmxvdykge1xuICAgICAgICAgICAgdGhpcy5fYnVpbGRUYWJsZVNvcnRTZXF1ZW5jZXMoKS5hcnJhbmdlVGFibGVEYXRhUm93cygpO1xuXG4gICAgICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICB3aWRnZXQucmVmcmVzaFdpZGdldCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIEluc3RydWN0IERhdGFHcmlkIHRvIHJlY3JlYXRlL3JlZnJlc2ggZXZlcnl0aGluZyByZWxhdGVkIHRvIGEgc2luZ2xlIHJlY29yZCBJRC5cbiAgICAvLyBUaGlzIGluY2x1ZGVzIHJlbW92aW5nIGl0cyB0YWJsZSByb3dzLCByZWNvbnN0cnVjdGluZyB0aGVtLCByZWZvcm1hdHRpbmcgdGhlbSwgYW5kXG4gICAgLy8gcmUtYWRkaW5nIHRoZSByb3dzIGluIHRoZSBzYW1lIHBsYWNlIGFzIHRoZSBvbGQsIGJ1dCBkb2VzIE5PVCByZWJ1aWxkIHRoZSBzb3J0IHNlcXVlbmNlcy5cbiAgICAvLyAgIE5PVEU6XG4gICAgLy8gSXQncyBxdWl0ZSBwb3NzaWJsZSB0aGF0IGNoYW5nZXMgdG8gdGhlIGFwcGVhcmFuY2Ugd2lsbCBhbHRlciB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgcm93cyBpblxuICAgIC8vIGNvbXBsaWNhdGVkIHdheXMuICBGb3IgZXhhbXBsZSwgdGhlIGdlbmVyaWMgc2VhcmNoIHdpZGdldCBsb2dpYyBtYXkgZGVjaWRlIHRvIGhpZGUgYSBwcmV2aW91c2x5IHNob3duXG4gICAgLy8gcm93IG9yIHZpY2UtdmVyc2EsIGNvcnJ1cHRpbmcgcm93IHN0cmlwaW5nLiAgRG8gbm90IGRlbGF5IHRoZSByZWZsb3cgZm9yIHRvbyBsb25nLlxuICAgIHJlY29uc3RydWN0U2luZ2xlUmVjb3JkKHJlY29yZElEOnN0cmluZyk6RGF0YUdyaWQge1xuICAgICAgICBpZiAodGhpcy5fcmVjb3JkRWxlbWVudHNbcmVjb3JkSURdKSB7XG4gICAgICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50c1tyZWNvcmRJRF0ucmVDcmVhdGVFbGVtZW50c0luUGxhY2UoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBpZiB0aGUgcmVjb3JkIGRpZG4ndCBleGlzdCBiZWZvcmUsIGl0IHdpbGwgbm90IGFwcGVhciBpbiB0aGUgdGFibGUgbm93LFxuICAgICAgICAgICAgLy8gdW50aWwgYSBjb21wbGV0ZSByZWZsb3cgaXMgZG9uZSBieSByZWJ1aWxkaW5nIHNvcnQgc2VxdWVuY2VzIGFuZCBjYWxsaW5nIGFycmFuZ2VUYWJsZURhdGFSb3dzLlxuICAgICAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHNbcmVjb3JkSURdID0gbmV3IERhdGFHcmlkUmVjb3JkKHRoaXMuX3NwZWMsIHJlY29yZElEKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkZ1JlY29yZCA9IHRoaXMuX3JlY29yZEVsZW1lbnRzW3JlY29yZElEXTtcblxuICAgICAgICAvLyBDYWxsIHRoZSBzdXBwb3J0IGZ1bmN0aW9uIGluIGVhY2ggd2lkZ2V0LCB0byBhcHBseSBzdHlsaW5nIHRvIGFsbCB0aGUgZGF0YSByb3dzIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRnUmVjb3JkLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgcmVjb3JkSUQpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRnUmVjb3JkLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgcmVjb3JkSUQpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBNYWtlIHN1cmUgb25seSB0aGUgY3VycmVudGx5IHZpc2libGUgdGhpbmdzIGFyZSAuLi4gdmlzaWJsZVxuICAgICAgICB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHlUb09uZVJlY29yZChyZWNvcmRJRCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfY3JlYXRlT3B0aW9uc01lbnUoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBtYWluSUQgPSB0aGlzLl9zcGVjLnRhYmxlU3BlYy5pZDtcblxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbWFzdGVyIGxpc3Qgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzIGJ5IGNhbGxpbmcgdGhlIGluaXRpYWxpemF0aW9uIHJvdXRpbmUgaW4gdGhlIHNwZWNcbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzID0gdGhpcy5fc3BlYy5jcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyh0aGlzKTtcbiAgICAgICAgdmFyIGhhc0N1c3RvbVdpZGdldHM6Ym9vbGVhbiA9IHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5sZW5ndGggPiAwO1xuXG4gICAgICAgIC8vIENoZWNrIGluIHRoZSBjb2x1bW4gZ3JvdXBzIGFuZCBzZWUgaWYgYW55IGFyZSBoaWRlLWFibGVcbiAgICAgICAgdmFyIGhhc0NvbHVtbnNJblZpc2liaWxpdHlMaXN0OmJvb2xlYW4gPSB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjLnNvbWUoKGdyb3VwKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZ3JvdXAuc2hvd0luVmlzaWJpbGl0eUxpc3Q7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIElmIG5vbmUgb2YgdGhlIGdyb3VwcyBhcmUgYWxsb3dlZCB0byBiZSBoaWRkZW4sIGFuZCB3ZSBkb24ndCBoYXZlIGFueSBjdXN0b20gb3B0aW9uIHdpZGdldHMsXG4gICAgICAgIC8vIGRvbid0IGJvdGhlciBjcmVhdGluZyB0aGUgY29sdW1uIHZpc2liaWxpdHkgbWVudVxuICAgICAgICBpZiAoIWhhc0NvbHVtbnNJblZpc2liaWxpdHlMaXN0ICYmICFoYXNDdXN0b21XaWRnZXRzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBoYXZlIGN1c3RvbSB3aWRnZXRzLCB3ZSBuZWVkIHRvIGNhbGwgdGhlaXIgc3VwcG9ydCBmdW5jdGlvbnMgdGhhdCBhcHBseSBzdHlsaW5nXG4gICAgICAgIC8vIHRvIGFsbCB0aGUgZGF0YSByb3dzIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgaWYgKGhhc0N1c3RvbVdpZGdldHMpIHtcbiAgICAgICAgICAgIHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYWluU3BhbiA9ICQodGhpcy5fb3B0aW9uc01lbnVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIikpXG4gICAgICAgICAgICAuYXR0cignaWQnLCBtYWluSUQgKyAnQ29sdW1uQ2hvb3NlcicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnUnKTtcblxuICAgICAgICB2YXIgbWVudUxhYmVsID0gJCh0aGlzLl9vcHRpb25zTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpKVxuICAgICAgICAgICAgLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpXG4gICAgICAgICAgICAudGV4dCgnVmlldyBvcHRpb25zIFxcdTI1QkUnKVxuICAgICAgICAgICAgLmNsaWNrKCgpID0+IHsgaWYgKG1lbnVMYWJlbC5oYXNDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKSkgdGhpcy5fc2hvd09wdE1lbnUoKTsgfSlcbiAgICAgICAgICAgIC5hcHBlbmRUbyhtYWluU3Bhbik7XG5cbiAgICAgICAgdmFyIG1lbnVCbG9jayA9ICQodGhpcy5fb3B0aW9uc01lbnVCbG9ja0VsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpKVxuICAgICAgICAgICAgLmFkZENsYXNzKCdwdWxsZG93bk1lbnVNZW51QmxvY2sgb2ZmJylcbiAgICAgICAgICAgIC5hcHBlbmRUbyhtYWluU3Bhbik7XG5cbiAgICAgICAgLy8gZXZlbnQgaGFuZGxlcnMgdG8gaGlkZSBtZW51IGlmIGNsaWNraW5nIG91dHNpZGUgbWVudSBibG9jayBvciBwcmVzc2luZyBFU0NcbiAgICAgICAgJChkb2N1bWVudCkuY2xpY2soKGV2KSA9PiB7XG4gICAgICAgICAgICB2YXIgdCA9ICQoZXYudGFyZ2V0KTtcbiAgICAgICAgICAgIGlmICh0LmNsb3Nlc3QodGhpcy5fb3B0aW9uc01lbnVFbGVtZW50KS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9oaWRlT3B0TWVudSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KS5rZXlkb3duKChldikgPT4ge1xuICAgICAgICAgICAgaWYgKGV2LmtleUNvZGUgPT09IDI3KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5faGlkZU9wdE1lbnUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICBpZiAoaGFzQ3VzdG9tV2lkZ2V0cykge1xuICAgICAgICAgICAgdmFyIG1lbnVDV0xpc3QgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKSkuYXBwZW5kVG8obWVudUJsb2NrKTtcbiAgICAgICAgICAgIGlmIChoYXNDb2x1bW5zSW5WaXNpYmlsaXR5TGlzdCkge1xuICAgICAgICAgICAgICAgIG1lbnVDV0xpc3QuYWRkQ2xhc3MoJ3dpdGhEaXZpZGVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5hcHBlbmRFbGVtZW50cygkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKSkuYXBwZW5kVG8obWVudUNXTGlzdClbMF0sIGluZGV4LnRvU3RyaW5nKDEwKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNDb2x1bW5zSW5WaXNpYmlsaXR5TGlzdCkge1xuICAgICAgICAgICAgdmFyIG1lbnVDb2xMaXN0ID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIikpLmFwcGVuZFRvKG1lbnVCbG9jayk7XG4gICAgICAgICAgICAvLyBBZGQgZWFjaCBoaWRlLWFibGUgZ3JvdXAgdG8gdGhlIG1lbnUuXG4gICAgICAgICAgICAvLyBOb3RlOiBXZSBoYXZlIHRvIHdhbGsgdGhyb3VnaCB0aGlzIGFuZXcsIGJlY2F1c2Ugd2UncmUgZ29pbmcgdG8gbWFrZSB1c2Ugb2YgdGhlIGluZGV4ICdpJy5cbiAgICAgICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWMuZm9yRWFjaCgoZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMsIGluZGV4Om51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBpdGVtLCBjaGVja2JveCwgaWQ7XG4gICAgICAgICAgICAgICAgaWYgKGdyb3VwLnNob3dJblZpc2liaWxpdHlMaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0gPSAkKCc8bGk+JykuYXBwZW5kVG8obWVudUNvbExpc3QpO1xuICAgICAgICAgICAgICAgICAgICBpZCA9IG1haW5JRCArICdDb2x1bW5DaGVjaycgKyBpbmRleDtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tib3ggPSAkKCc8aW5wdXQgdHlwZT1cImNoZWNrYm94XCI+JylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oaXRlbSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignaWQnLCBpZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZGF0YSgnY29sdW1uJywgZ3JvdXApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNsaWNrKGdyb3VwLCAoZSkgPT4gdGhpcy5fY2xpY2tlZENvbFZpc2liaWxpdHlDb250cm9sKGUpKTtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXAuY2hlY2tib3hFbGVtZW50ID0gY2hlY2tib3hbMF07XG4gICAgICAgICAgICAgICAgICAgICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCBpZCkudGV4dChncm91cC5uYW1lKS5hcHBlbmRUbyhpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFncm91cC5jdXJyZW50bHlIaWRkZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gdXBkYXRlIGNoZWNrcyBiYXNlZCBvbiBzZXR0aW5nc1xuICAgICAgICAgICAgdGhpcy5fZmV0Y2hTZXR0aW5ncyh0aGlzLl9jb2x1bW5TZXR0aW5nc0tleSgpLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIG1lbnVDb2xMaXN0LmZpbmQoJ2xpJykuZmluZCgnOmlucHV0JykuZWFjaCgoaSwgYm94KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciAkYm94ID0gJChib3gpLCBjb2wgPSAkYm94LmRhdGEoJ2NvbHVtbicpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGRhdGEuaW5kZXhPZihjb2wubmFtZSkgPT09IC0xICYmICEhY29sLmhpZGRlbkJ5RGVmYXVsdCkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhLmluZGV4T2YoJy0nICsgY29sLm5hbWUpID4gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRib3gucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaGlkZUNvbHVtbihjb2wpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgJGJveC5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3dDb2x1bW4oY29sKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgW10pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9jcmVhdGVIZWFkZXJXaWRnZXRzKCk6RGF0YUdyaWQge1xuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbWFzdGVyIGxpc3Qgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzIGJ5IGNhbGxpbmcgdGhlIGluaXRpYWxpemF0aW9uIHJvdXRpbmUgaW4gdGhlIHNwZWNcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cyA9IHRoaXMuX3NwZWMuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyh0aGlzKTtcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgIC8vIENhbGwgdGhlIHN1cHBvcnQgZnVuY3Rpb24gaW4gZWFjaCB3aWRnZXQsIHRvIGFwcGx5IHN0eWxpbmcgdG8gYWxsIHRoZSBkYXRhIHJvd3Mgb2YgdGhlIHRhYmxlLlxuICAgICAgICAgICAgdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gUHJlcGFyZSB0aGUgY29sdW1uIHZpc2liaWxpdHkgc3RhdGUgZm9yIHRoZSB0YWJsZS5cbiAgICAvLyBUaGlzIGZ1bmN0aW9uIHNob3VsZCBiZSBjYWxsZWQgZHVyaW5nIGluc3RhbnRpYXRpb24sIHNpbmNlIGl0IGluaXRpYWxpemVzIHRoZSBjb2x1bW4gdmlzaWJpbGl0eVxuICAgIC8vIHZhcmlhYmxlcyB0aGF0IGFyZSByZWZlcnJlZCB0byB0aHJvdWdob3V0IHRoZSByZXN0IG9mIHRoZSBEYXRhR3JpZCBjbGFzcy5cbiAgICBwcmVwYXJlQ29sdW1uVmlzaWJpbGl0eSgpIHtcbiAgICAgICAgLy8gRmlyc3QsIHJ1biB0aHJvdWdoIGEgc2VxdWVuY2Ugb2YgY2hlY2tzIHRvIHNldCB0aGUgJ2N1cnJlbnRseUhpZGRlbicgYXR0cmlidXRlIHRvIGEgcmVhc29uYWJsZSB2YWx1ZS5cbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYykgPT4ge1xuICAgICAgICAgICAgLy8gRXN0YWJsaXNoIHdoYXQgdGhlIGRlZmF1bHQgaXMsIGJlZm9yZSBjaGVja2luZyBhbnkgcGFzc2VkLWluIGNvbHVtbiBmbGFnc1xuICAgICAgICAgICAgZ3JvdXAuY3VycmVudGx5SGlkZGVuID0gISFncm91cC5oaWRkZW5CeURlZmF1bHQ7XG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgbmVjZXNzYXJ5IGFycmF5cyBhcmUgcHJlc2VudCB0byBrZWVwIHRyYWNrIG9mIGdyb3VwIG1lbWJlcnNcbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckhlYWRlcnMgPSBncm91cC5tZW1iZXJIZWFkZXJzIHx8IFtdO1xuICAgICAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucyA9IGdyb3VwLm1lbWJlckNvbHVtbnMgfHwgW107XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENvbGxlY3QgYWxsIHRoZSBoZWFkZXJzIHVuZGVyIHRoZWlyIHJlc3BlY3RpdmUgY29sdW1uIGdyb3Vwc1xuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIpID0+IHtcbiAgICAgICAgICAgIHZhciBjOm51bWJlciA9IGhlYWRlci5jb2x1bW5Hcm91cDtcbiAgICAgICAgICAgIGlmIChjICYmIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWNbYyAtIDFdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlY1tjIC0gMV0ubWVtYmVySGVhZGVycy5wdXNoKGhlYWRlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENvbGxlY3QgYWxsIHRoZSBjb2x1bW5zIChhbmQgaW4gdHVybiB0aGVpciBjZWxscykgdW5kZXIgdGhlaXIgcmVzcGVjdGl2ZSBjb2x1bW4gZ3JvdXBzXG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5TcGVjLmZvckVhY2goKGNvbCkgPT4ge1xuICAgICAgICAgICAgdmFyIGM6bnVtYmVyID0gY29sLmNvbHVtbkdyb3VwO1xuICAgICAgICAgICAgaWYgKGMgJiYgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlY1tjIC0gMV0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjW2MgLSAxXS5tZW1iZXJDb2x1bW5zLnB1c2goY29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBSZWFkIHRoZSBjdXJyZW50IGNvbHVtbiB2aXNpYmlsaXR5IHN0YXRlIGFuZCBhbHRlciB0aGUgc3R5bGluZyBvZiBoZWFkZXJzIGFuZCBjZWxscyB0byByZWZsZWN0IGl0XG5cbiAgICBwcml2YXRlIF9hcHBseUNvbHVtblZpc2liaWxpdHkoKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWMuZm9yRWFjaCgoZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMpID0+IHtcbiAgICAgICAgICAgIHZhciBoaWRkZW4gPSBncm91cC5jdXJyZW50bHlIaWRkZW47XG5cbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckhlYWRlcnMuZm9yRWFjaCgoaGVhZGVyKSA9PiAkKGhlYWRlci5lbGVtZW50KS50b2dnbGVDbGFzcygnb2ZmJywgaGlkZGVuKSk7XG5cbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckNvbHVtbnMuZm9yRWFjaCgoY29sdW1uKSA9PiB7XG4gICAgICAgICAgICAgICAgY29sdW1uLmdldEVudGlyZUluZGV4KCkuZm9yRWFjaCgoYykgPT4gaGlkZGVuID8gYy5oaWRlKCkgOiBjLnVuaGlkZSgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9hcHBseUNvbHVtblZpc2liaWxpdHlUb09uZVJlY29yZChyZWNvcmRJRDpzdHJpbmcpOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYykgPT4ge1xuICAgICAgICAgICAgdmFyIGhpZGRlbiA9IGdyb3VwLmN1cnJlbnRseUhpZGRlbjtcbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckNvbHVtbnMuZm9yRWFjaCgoY29sdW1uKSA9PiB7XG4gICAgICAgICAgICAgICAgY29sdW1uLmNlbGxJbmRleEF0SUQocmVjb3JkSUQpLmZvckVhY2goKGMpID0+IGhpZGRlbiA/IGMuaGlkZSgpIDogYy51bmhpZGUoKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IHRoZSBsaXN0IG9mIElEcywgdGhlbiBmaWx0ZXIgaXQgZG93biB0byB3aGF0J3MgdmlzaWJsZSxcbiAgICAvLyB0aGVuIHNlYXJjaCB0aGUgdmlzaWJsZSByb3dzIGZvciBzcGVjLW1hbmRhdGVkIGNoZWNrYm94IGVsZW1lbnRzLFxuICAgIC8vIGFuZCBpZiBhIGNoZWNrYm94IGlzIGNoZWNrZWQsIHJldHVybiBpdHMgZWxlbWVudCBvbiBhbiBhcnJheS5cbiAgICBnZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTpIVE1MSW5wdXRFbGVtZW50W10ge1xuICAgICAgICB2YXIgc2VxdWVuY2U6c3RyaW5nW10gPSB0aGlzLl9nZXRTZXF1ZW5jZSh0aGlzLl9zb3J0WzBdKTtcblxuICAgICAgICAvLyBWZXJpZnkgdGhhdCB0aGUgcm93IHNldHMgcmVmZXJyZWQgdG8gYnkgdGhlIElEcyBhY3R1YWxseSBleGlzdFxuICAgICAgICB2YXIgZmlsdGVyZWRTZXF1ZW5jZSA9IHNlcXVlbmNlLmZpbHRlcigodikgPT4geyByZXR1cm4gISF0aGlzLl9yZWNvcmRFbGVtZW50c1t2XTsgfSk7XG5cbiAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZSA9IHRoaXMuYXBwbHlBbGxXaWRnZXRGaWx0ZXJpbmcoZmlsdGVyZWRTZXF1ZW5jZSk7XG5cbiAgICAgICAgdmFyIGNoZWNrZWRCb3hlczpIVE1MSW5wdXRFbGVtZW50W10gPSBbXTtcbiAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZS5mb3JFYWNoKCh2KSA9PiB7XG4gICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuX3JlY29yZEVsZW1lbnRzW3ZdLmdldERhdGFHcmlkRGF0YVJvd3MoKTtcbiAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFyb3cuZGF0YUdyaWREYXRhQ2VsbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByb3cuZGF0YUdyaWREYXRhQ2VsbHMuZm9yRWFjaCgoY2VsbCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2hlY2tib3ggPSBjZWxsLmdldENoZWNrYm94RWxlbWVudCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tib3ggJiYgY2hlY2tib3guY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tlZEJveGVzLnB1c2goY2hlY2tib3gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjaGVja2VkQm94ZXM7XG4gICAgfVxuXG4gICAgYXBwbHlTb3J0SW5kaWNhdG9ycygpIHtcbiAgICAgICAgaWYgKHRoaXMuX2hlYWRlclJvd3MpIHtcbiAgICAgICAgICAgICQodGhpcy5faGVhZGVyUm93cykuZmluZCgnLnNvcnRlZHVwLCAuc29ydGVkZG93bicpLnJlbW92ZUNsYXNzKCdzb3J0ZWR1cCBzb3J0ZWRkb3duJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fc29ydC5mb3JFYWNoKChzb3J0KSA9PiB7XG4gICAgICAgICAgICAkKHNvcnQuc3BlYy5lbGVtZW50KS5hZGRDbGFzcyhzb3J0LmFzYyA/ICdzb3J0ZWRkb3duJyA6ICdzb3J0ZWR1cCcpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhcnJhbmdlVGFibGVEYXRhUm93cygpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIHN0cmlwaW5nID0gMTtcblxuICAgICAgICAvLyBXZSBjcmVhdGUgYSBkb2N1bWVudCBmcmFnbWVudCAtIGEga2luZCBvZiBjb250YWluZXIgZm9yIGRvY3VtZW50LXJlbGF0ZWQgb2JqZWN0cyB0aGF0IHdlIGRvbid0XG4gICAgICAgIC8vIHdhbnQgaW4gdGhlIHBhZ2UgLSBhbmQgYWNjdW11bGF0ZSBpbnNpZGUgaXQgYWxsIHRoZSByb3dzIHdlIHdhbnQgdG8gZGlzcGxheSwgaW4gc29ydGVkIG9yZGVyLlxuICAgICAgICB2YXIgZnJhZyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblxuICAgICAgICB0aGlzLmFwcGx5U29ydEluZGljYXRvcnMoKTtcblxuICAgICAgICB2YXIgc2VxdWVuY2UgPSB0aGlzLl9nZXRTZXF1ZW5jZSh0aGlzLl9zb3J0WzBdKTtcblxuICAgICAgICAvLyBWZXJpZnkgdGhhdCB0aGUgcm93IHNldHMgcmVmZXJyZWQgdG8gYnkgdGhlIElEcyBhY3R1YWxseSBleGlzdFxuICAgICAgICB2YXIgZmlsdGVyZWRTZXF1ZW5jZSA9IHNlcXVlbmNlLmZpbHRlcigodikgPT4geyByZXR1cm4gISF0aGlzLl9yZWNvcmRFbGVtZW50c1t2XTsgfSk7XG4gICAgICAgIHZhciB1bmZpbHRlcmVkU2VxdWVuY2UgPSBmaWx0ZXJlZFNlcXVlbmNlLnNsaWNlKDApO1xuXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgdGhlIGdyb3VwaW5nIHRpdGxlIHJvd3MgZnJvbSB0aGUgdGFibGUgYXMgd2VsbCwgaWYgdGhleSB3ZXJlIHRoZXJlXG4gICAgICAgIHZhciByb3dHcm91cFNwZWMgPSB0aGlzLl9zcGVjLnRhYmxlUm93R3JvdXBTcGVjO1xuICAgICAgICByb3dHcm91cFNwZWMuZm9yRWFjaCgocm93R3JvdXApID0+IHtcbiAgICAgICAgICAgIHZhciByID0gcm93R3JvdXAucmVwbGljYXRlR3JvdXBUYWJsZSA7XG4gICAgICAgICAgICBpZiAoci5wYXJlbnROb2RlKSB7IC8vIEFzIHdpdGggcmVndWxhciByb3dzLCB3ZSdyZSBhc3N1bWluZyB0aGUgcm93IGlzIGEgY2hpbGQgb25seSBvZiB0aGlzIHRhYmxlIGJvZHkuXG4gICAgICAgICAgICAgICAgci5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gV2hpbGUgd2UncmUgaGVyZSwgcmVzZXQgdGhlIG1lbWJlciByZWNvcmQgYXJyYXlzLiAgV2UgbmVlZCB0byByZWJ1aWxkIHRoZW0gcG9zdC1maWx0ZXJpbmcuXG4gICAgICAgICAgICByb3dHcm91cC5tZW1iZXJSZWNvcmRzID0gW107XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZpbHRlcmVkU2VxdWVuY2UgPSB0aGlzLmFwcGx5QWxsV2lkZ2V0RmlsdGVyaW5nKGZpbHRlcmVkU2VxdWVuY2UpO1xuXG4gICAgICAgIC8vIENhbGwgdG8gZGV0YWNoIG9ubHkgdGhlIHJvd3MgdGhhdCBkaWRuJ3QgbWFrZSBpdCB0aHJvdWdoIHRoZSBmaWx0ZXIuXG4gICAgICAgIC8vIFRoZSBvdGhlcnMgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IGRldGFjaGVkIGJ5IGJlaW5nIG1vdmVkIHRvIHRoZSBkb2N1bWVudCBmcmFnbWVudC5cbiAgICAgICAgdmFyIGFkZGVkUm93SURzID0ge307XG4gICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIGFkZGVkUm93SURzW2lkXSA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICB1bmZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIGlmICghYWRkZWRSb3dJRHNbaWRdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHNbaWRdLmRldGFjaEVsZW1lbnRzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIE5vdyB3ZSBydW4gdGhyb3VnaCB0aGUgcmVtYWluaW5nIElEcyBhbmQgYWRkIHRoZWlyIHJvd3MgdG8gdGhlIHRhYmxlLCB3aXRoIHN0cmlwaW5nLlxuICAgICAgICAvLyBCdXQgaWYgZ3JvdXBpbmcgaXMgZW5hYmxlZCBhbmQgdGhlcmUgaXMgYXQgbGVhc3Qgb25lIGdyb3VwLCB3ZSBhZGQgdGhlbSBhIGZldyBhdCBhIHRpbWUsXG4gICAgICAgIC8vIHByb2NlZWRpbmcgdGhyb3VnaCBlYWNoIGdyb3VwLlxuXG4gICAgICAgIGlmICghdGhpcy5fZ3JvdXBpbmdFbmFibGVkIHx8IHJvd0dyb3VwU3BlYy5sZW5ndGggPCAxKSB7ICAgIC8vIFRoZSBzdGFuZGFyZCBub24tZ3JvdXBlZCBtZXRob2Q6XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9zcGVjLnRhYmxlU3BlYy5hcHBseVN0cmlwaW5nKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZS5mb3JFYWNoKChzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN0cmlwaW5nID0gMSAtIHN0cmlwaW5nO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50c1tzXS5hcHBseVN0cmlwaW5nKHN0cmlwaW5nKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgocykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy5fcmVjb3JkRWxlbWVudHNbc10uZ2V0RWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICByb3dzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBmcmFnLmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9IGVsc2UgeyAgICAvLyBUaGUgbW9yZSBjb21wbGljYXRlZCwgZ3JvdXBlZCBtZXRob2Q6XG5cbiAgICAgICAgICAgIHZhciBzdHJpcGVTdHlsZXMgPSBbJ3N0cmlwZVJvd0EnLCdzdHJpcGVSb3dCJ107XG4gICAgICAgICAgICB2YXIgc3RyaXBlU3R5bGVzSm9pbiA9IHN0cmlwZVN0eWxlcy5qb2luKCcgJyk7XG5cbiAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgocykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByb3dHcm91cCA9IHJvd0dyb3VwU3BlY1t0aGlzLl9zcGVjLmdldFJvd0dyb3VwTWVtYmVyc2hpcChzKV07XG4gICAgICAgICAgICAgICAgcm93R3JvdXAubWVtYmVyUmVjb3Jkcy5wdXNoKHRoaXMuX3JlY29yZEVsZW1lbnRzW3NdKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvL2l0ZXJhdGUgb3ZlciB0aGUgZGlmZmVyZW50IHJlcGxpY2F0ZSBncm91cHNcbiAgICAgICAgICAgIF8uZWFjaChyb3dHcm91cFNwZWMsIChncm91cGluZykgID0+IHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgdGhlIGFzc2F5IGlkcyBhc3NvY2lhdGVkIHdpdGggdGhlIHJlcGxpY2F0ZSBncm91cFxuICAgICAgICAgICAgICAgIHZhciByZXBsaWNhdGVJZHMgPSB0aGlzLl9maW5kUmVwbGljYXRlTGluZXModGhpcy5fZ3JvdXBSZXBsaWNhdGVzKCksIGdyb3VwaW5nKTtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgdGhlIGxpbmVzIGFzc29jaWF0ZWQgd2l0aCB0aGUgcmVwbGljYXRlIGdyb3VwXG4gICAgICAgICAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5hZGRSZXBsaWNhdGVSb3dzKHJlcGxpY2F0ZUlkcyk7XG4gICAgICAgICAgICAgICAgXy5lYWNoKGxpbmVzLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vaGlkZSB0aGUgbGluZXMgYXNzb2NpYXRlZCB3aXRoIHRoZSByZXBsaWNhdGUgZ3JvdXBcbiAgICAgICAgICAgICAgICAgICAgJChsaW5lKS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICByb3dHcm91cFNwZWMuZm9yRWFjaCgocm93R3JvdXApID0+IHtcbiAgICAgICAgICAgICAgICBzdHJpcGluZyA9IDEgLSBzdHJpcGluZztcbiAgICAgICAgICAgICAgICBmcmFnLmFwcGVuZENoaWxkKHJvd0dyb3VwLnJlcGxpY2F0ZUdyb3VwVGFibGUgKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fc3BlYy50YWJsZVNwZWMuYXBwbHlTdHJpcGluZykge1xuICAgICAgICAgICAgICAgICAgICByb3dHcm91cC5yZXBsaWNhdGVHcm91cFRpdGxlUm93SlFcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhzdHJpcGVTdHlsZXNKb2luKS5hZGRDbGFzcyhzdHJpcGVTdHlsZXNbc3RyaXBpbmddKS5lbmQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQoZnJhZykuaW5zZXJ0QmVmb3JlKCQodGhpcy5fdGFibGVCb2R5KSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgLy9oYWNreSB3YXkgdG8gc2hvdyBsaW5lcyB0aGF0IHdlcmUgaGlkZGVuIGZyb20gZ3JvdXBpbmcgcmVwbGljYXRlc1xuICAgICAgICBpZiAoJCgnI2xpbmVzR3JvdXBTdHVkeVJlcGxpY2F0ZXNDQjAnKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB2YXIgbGluZXMgPSAkKGZyYWcpLmNoaWxkcmVuKCk7XG4gICAgICAgICAgICBfLmVhY2gobGluZXMsIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgICAgICAkKGxpbmUpLnJlbW92ZUNsYXNzKCdyZXBsaWNhdGVMaW5lU2hvdycpO1xuICAgICAgICAgICAgICAgICQobGluZSkuc2hvdygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gUmVtZW1iZXIgdGhhdCB3ZSBsYXN0IHNvcnRlZCBieSB0aGlzIGNvbHVtblxuICAgICAgICB0aGlzLl90YWJsZUJvZHkuYXBwZW5kQ2hpbGQoZnJhZyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBHaXZlbiBhbiBhcnJheSBvZiByZWNvcmQgSURzLCBzZW5kIHRoZSBhcnJheSB0aHJvdWdoIHRoZSBmaWx0ZXJpbmcgZnVuY3Rpb24gZm9yIGVhY2ggb2ZcbiAgICAvLyB0aGUgaGVhZGVyIHdpZGdldHMsIGFuZCBlYWNoIG9mIHRoZSBvcHRpb25zIG1lbnUgd2lkZ2V0cywgdGhlbiByZXR1cm4gdGhlIGZpbHRlcmVkIGFycmF5LlxuICAgIGFwcGx5QWxsV2lkZ2V0RmlsdGVyaW5nKGZpbHRlcmVkU2VxdWVuY2U6c3RyaW5nW10pOnN0cmluZ1tdIHtcbiAgICAgICAgLy8gR2l2ZSBlYWNoIGhlYWRlciB3aWRnZXQgYSBjaGFuY2UgdG8gYXBwbHkgZmlsdGVyaW5nXG4gICAgICAgIHRoaXMuX2hlYWRlcldpZGdldHMuZm9yRWFjaCgod2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlID0gd2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMoZmlsdGVyZWRTZXF1ZW5jZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEdpdmUgZWFjaCB3aWRnZXQgaW4gdGhlIG9wdGlvbnMgbWVudSBhIGNoYW5jZSB0byBhcHBseSBmaWx0ZXJpbmdcbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZSA9IHdpZGdldC5hcHBseUZpbHRlclRvSURzKGZpbHRlcmVkU2VxdWVuY2UpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkU2VxdWVuY2U7XG4gICAgfVxuXG5cbiAgICAvLyBBZGQgdXAgYWxsIHRoZSBjb2x1bW4gY291bnRzIGluIHRoZSBoZWFkZXJzcGVjLCB0byBhcnJpdmUgYXQgYSBncmFuZCB0b3RhbCBmb3IgdGhlIHRhYmxlLlxuICAgIGdldFNwZWMoKTphbnkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc3BlYzsgICAgLy8gRioqKiB0eXBlIGNvbnZlcnNpb24gRioqKiB0aGluZ3MgdXAgd2hlbiBzdWJjbGFzc2luZ1xuICAgIH1cblxuXG4gICAgLy8gQWRkIHVwIGFsbCB0aGUgY29sdW1uIGNvdW50cyBpbiB0aGUgaGVhZGVyc3BlYywgdG8gYXJyaXZlIGF0IGEgZ3JhbmQgdG90YWwgZm9yIHRoZSB0YWJsZS5cbiAgICBjb3VudFRvdGFsQ29sdW1ucygpOm51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5yZWR1Y2UoKHByZXYsIHYpOm51bWJlciA9PiB7XG4gICAgICAgICAgICBpZiAodi5oZWFkZXJSb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAodi5oZWFkZXJSb3cgPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwcmV2O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBwcmV2ICsgKHYuY29sc3BhbiA/IHYuY29sc3BhbiA6IDEpO1xuICAgICAgICB9LCAwKTtcbiAgICB9XG5cblxuICAgIC8vIFdhbGsgdGhyb3VnaCBlYWNoIGhlYWRlciBpbiB0aGUgc3BlYywgYW5kIGxvb2sgZm9yIGEgXCJzb3J0QnlcIiBmdW5jdGlvbi5cbiAgICAvLyBJZiBvbmUgaXMgZm91bmQsIHVzZSBpdCB0byBjb25zdHJ1Y3QgYSBzb3J0aW5nIGZ1bmN0aW9uXG4gICAgcHJpdmF0ZSBfYnVpbGRBbGxUYWJsZVNvcnRlcnMoKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjLmZvckVhY2goKGhlYWRlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGhlYWRlci5zb3J0QnkpIHtcbiAgICAgICAgICAgICAgICBoZWFkZXIuc29ydEZ1bmMgPSB0aGlzLmJ1aWxkVGFibGVTb3J0ZXIoaGVhZGVyLnNvcnRCeSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIEdpdmVuIGEgY29tcGFyaXNvbiBmdW5jdGlvbixcbiAgICAvLyBjb25zdHJ1Y3QgYSBmdW5jdGlvbiBzdWl0YWJsZSBmb3IgcGFzc2luZyB0byBKYXZhc2NyaXB0J3MgXCJzb3J0XCIuXG4gICAgYnVpbGRUYWJsZVNvcnRlcihsb29rdXBGdW5jOiAocm93SW5kZXg6bnVtYmVyKSA9PiBhbnkpOiAoeDpudW1iZXIsIHk6bnVtYmVyKSA9PiBudW1iZXIge1xuICAgICAgICByZXR1cm4gKHJvd0luZGV4QTpudW1iZXIsIHJvd0luZGV4QjpudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHZhciBhID0gbG9va3VwRnVuYy5jYWxsKHRoaXMuX3NwZWMsIHJvd0luZGV4QSk7XG4gICAgICAgICAgICB2YXIgYiA9IGxvb2t1cEZ1bmMuY2FsbCh0aGlzLl9zcGVjLCByb3dJbmRleEIpO1xuICAgICAgICAgICAgcmV0dXJuICg8YW55PihhID4gYikgLSA8YW55PihiID4gYSkpOyAvLyB0cnVlIGJlY29tZXMgMSwgZmFsc2UgYmVjb21lcyAwXG4gICAgICAgIH07XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCB3aXRoIHRoZSBhcnJheSBvZiBJRHMgZ2l2ZW4gaW4gdGhlIHNwZWMuICBUaGVuLCBmb3IgZWFjaCBoZWFkZXIsIGJ1aWxkIGEgc29ydGVkIGNvcHkgb2YgdGhlIGFycmF5LFxuICAgIC8vIGFuZCBzYXZlIHRoZSBzb3J0ZWQgY29weSBpbnRvIHRoZSBoZWFkZXIgaW5mb3JtYXRpb24uXG4gICAgLy9cbiAgICAvLyBTb21lIHNvcnQgc2VxdWVuY2VzIG1heSByZWx5IG9uIHRoZSBzb3J0IHNlcXVlbmNlcyBvZiBvdGhlciBoZWFkZXJzLlxuICAgIC8vIEluIHRoZSBjb2RlIGJlbG93LCB0aGVzZSBhcmUgZm9sbG93ZWQgbGlrZSBhIGRlcGVuZGVuY3kgdHJlZS5cbiAgICAvLyBXZSBkbyB0aGlzIGJ5IHRyYWNraW5nIHRoZSB1bnNvcnRlZCBoZWFkZXJzIGluIGEgc2V0LCBhbmQgbG9vcGluZyB0aHJvdWdoIHRoZSBzZXQuXG4gICAgLy8gRXZlcnkgdGltZSB3ZSBmaW5kIGEgaGVhZGVyIHRoYXQgd2UgY2FuIHN1Y2Nlc3NmdWxseSBzb3J0IC0gd2hldGhlciBiZWNhdXNlIHRoZSBwcmVyZXF1aXNpdGUgaGVhZGVyIGlzIGFscmVhZHlcbiAgICAvLyBzb3J0ZWQsIG9yIGJlY2F1c2UgaXQgaGFzIG5vIHByZXJlcXVpc2l0ZSAtIHdlIHNvcnQgaXQgYW5kIHJlbW92ZSBpdCBmcm9tIHRoZSBzZXQuXG4gICAgLy8gSWYgd2UgZXZlciBsb29wIHRocm91Z2ggdGhlIHNldCBhbmQgZmFpbCB0byByZW1vdmUgZXZlbiBvbmUgaXRlbSBmcm9tIGl0LCB3ZSBnaXZlIHVwLFxuICAgIC8vIHNpbmNlIHRoZXJlIG11c3QgYmUgYSBkZXBlbmRlbmN5IGxvb3AuXG4gICAgLy8gSXQncyBub3QgdGhlIGZhc3Rlc3QgbWV0aG9kIG9uIHRoZSBwbGFuZXQsIGJ1dCBpdCdzIGdvb2QgZW5vdWdoLCBzaW5jZSB3ZSdsbCBwcm9iYWJseSBuZXZlciBoYXZlIGFueSBtb3JlIHRoYW4gMTAgb3Igc28gaGVhZGVycy5cbiAgICBwcml2YXRlIF9idWlsZFRhYmxlU29ydFNlcXVlbmNlcygpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIHVuc29ydGVkSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IFtdO1xuICAgICAgICB2YXIgc29ydGVkQXRMZWFzdE9uZU5ld0hlYWRlcjpib29sZWFuID0gZmFsc2U7XG4gICAgICAgIC8vIERlY2xhcmUgYWxsIHRoZSBoZWFkZXJzIHVuc29ydGVkLCBhbmQgYWRkIHRoZW0gdG8gdGhlIHVuc29ydGVkIHNldC5cbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUhlYWRlclNwZWMuZm9yRWFjaCgoaGVhZGVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaGVhZGVyLnNvcnRJZCkgeyAgICAgICAgIC8vIGFueXRoaW5nIHdpdGggc29ydElkIGlzIHNvcnRlZCBzZXJ2ZXItc2lkZSBhbHJlYWR5XG4gICAgICAgICAgICAgICAgaGVhZGVyLnNvcnRlZCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGhlYWRlci5zb3J0RnVuYykgeyAgICAgICAgICAgLy8gb25seSBhZGQgaGVhZGVycyB3aXRoIHNvcnQgZnVuY3Rpb25zXG4gICAgICAgICAgICAgICAgdW5zb3J0ZWRIZWFkZXJzLnVuc2hpZnQoaGVhZGVyKTsgICAgLy8gYWRkIGluIGZyb250LCBzbyBzZXQgaXMgcmV2ZXJzZWRcbiAgICAgICAgICAgICAgICBoZWFkZXIuc29ydGVkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICBzb3J0ZWRBdExlYXN0T25lTmV3SGVhZGVyID0gZmFsc2U7XG4gICAgICAgICAgICAvLyB1c2Ugc2xpY2Ugc28gdGhhdCBzcGxpY2UgaW5zaWRlIHRoZSBjYWxsYmFjayBkb2VzIG5vdCBpbnRlcmZlcmUgd2l0aCBsb29wXG4gICAgICAgICAgICB1bnNvcnRlZEhlYWRlcnMuc2xpY2UoMCkuZm9yRWFjaCgoaGVhZGVyLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhZnRlcjtcbiAgICAgICAgICAgICAgICBpZiAoaGVhZGVyLnNvcnRBZnRlciA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFmdGVyID0gdGhpcy5fc3BlYy50YWJsZUhlYWRlclNwZWNbaGVhZGVyLnNvcnRBZnRlcl07XG4gICAgICAgICAgICAgICAgICAgIGlmICghYWZ0ZXIuc29ydGVkKSByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuX3NlcXVlbmNlW2hlYWRlci5pZF0gPSB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpO1xuICAgICAgICAgICAgICAgIGlmIChhZnRlciAmJiBhZnRlci5pZCAmJiB0aGlzLl9zZXF1ZW5jZVthZnRlci5pZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VxdWVuY2VbaGVhZGVyLmlkXSA9IHRoaXMuX3NlcXVlbmNlW2FmdGVyLmlkXS5zbGljZSgwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5fc2VxdWVuY2VbaGVhZGVyLmlkXS5zb3J0KGhlYWRlci5zb3J0RnVuYyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2VxdWVuY2VbJy0nK2hlYWRlci5pZF0gPSB0aGlzLl9zZXF1ZW5jZVtoZWFkZXIuaWRdLnNsaWNlKDApLnJldmVyc2UoKTtcbiAgICAgICAgICAgICAgICBoZWFkZXIuc29ydGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB1bnNvcnRlZEhlYWRlcnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICBzb3J0ZWRBdExlYXN0T25lTmV3SGVhZGVyID0gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IHdoaWxlIChzb3J0ZWRBdExlYXN0T25lTmV3SGVhZGVyKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9nZXRTZXF1ZW5jZShzb3J0OkRhdGFHcmlkU29ydCk6c3RyaW5nW10ge1xuICAgICAgICB2YXIga2V5ID0gKHNvcnQuYXNjID8gJycgOiAnLScpICsgc29ydC5zcGVjLmlkLFxuICAgICAgICAgICAgc2VxdWVuY2UgPSB0aGlzLl9zZXF1ZW5jZVtrZXldO1xuICAgICAgICBpZiAoc2VxdWVuY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWMuZ2V0UmVjb3JkSURzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNlcXVlbmNlO1xuXG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9idWlsZFRhYmxlSGVhZGVycygpOkhUTUxFbGVtZW50W10ge1xuICAgICAgICAvLyBGaW5kIHRoZSBtaW5pbXVtIG51bWJlciBvZiByb3dzIHdlIG5lZWQgdG8gY3JlYXRlIHRvIGNvbnRhaW4gYWxsIHRoZSBoZWFkZXJzXG4gICAgICAgIHZhciBtYXhoZWFkZXJSb3c6bnVtYmVyID0gdGhpcy5fc3BlYy50YWJsZUhlYWRlclNwZWMucmVkdWNlKFxuICAgICAgICAgICAgICAgIChwcmV2Om51bWJlciwgdikgPT4geyByZXR1cm4gTWF0aC5tYXgocHJldiwgdi5oZWFkZXJSb3cgfHwgMCk7IH0sIDEpO1xuXG4gICAgICAgIC8vIENyZWF0ZSBlbm91Z2ggcm93cyB0byBjb250YWluIHRoZSBoZWFkZXJzICh1c3VhbGx5IGp1c3QgMSlcbiAgICAgICAgdmFyIHJvd0VsZW1lbnRzOkhUTUxFbGVtZW50W10gPSBbXTtcbiAgICAgICAgIGZvciAodmFyIGk9MDsgaSA8IG1heGhlYWRlclJvdzsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidHJcIikpLmFkZENsYXNzKCdjb2x1bW5MYWJlbHMnKTtcbiAgICAgICAgICAgIHJvd0VsZW1lbnRzLnB1c2gocm93WzBdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJ1biB0aHJvdWdoIGVhY2ggaW5kaXZpZHVhbCBoZWFkZXIsIGNyZWF0ZSBpdCBhY2NvcmRpbmcgdG8gdGhlIHNwZWNzLCBhbmQgYWRkIGl0IHRvIHRoZSBhcHByb3ByaWF0ZSByb3cuXG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjLmZvckVhY2goKGhlYWRlciwgaSwgc3JjKSA9PiB7XG4gICAgICAgICAgICB2YXIgY29tbW9uQ3NzOnt9ID0ge1xuICAgICAgICAgICAgICAgICd3aWR0aCc6IGhlYWRlci53aWR0aCA/XG4gICAgICAgICAgICAgICAgICAgIChoZWFkZXIud2lkdGguc3Vic3RyKC0xKSAhPT0gJyUnID8gaGVhZGVyLndpZHRoICsgJ3B4JyA6IGhlYWRlci53aWR0aCkgOlxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdmFyIGNzczp7fSA9ICQuZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICAndGV4dC1hbGlnbic6IGhlYWRlci5hbGlnbixcbiAgICAgICAgICAgICAgICAndmVydGljYWwtYWxpZ24nOiBoZWFkZXIudmFsaWduLFxuICAgICAgICAgICAgICAgICdkaXNwbGF5JzogaGVhZGVyLmRpc3BsYXlcbiAgICAgICAgICAgIH0sIGNvbW1vbkNzcyk7XG4gICAgICAgICAgICBoZWFkZXIuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0aFwiKTtcbiAgICAgICAgICAgIHZhciBjZWxsOkpRdWVyeSA9ICQoaGVhZGVyLmVsZW1lbnQpLmNzcyhjc3MpLmF0dHIoe1xuICAgICAgICAgICAgICAgICAgICAnaWQnOiBoZWFkZXIuaWQsXG4gICAgICAgICAgICAgICAgICAgICdjb2xzcGFuJzogaGVhZGVyLmNvbHNwYW4gPiAxID8gaGVhZGVyLmNvbHNwYW4gOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgICdyb3dzcGFuJzogaGVhZGVyLnJvd3NwYW4gPiAxID8gaGVhZGVyLnJvd3NwYW4gOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgICdjbGFzcyc6IGhlYWRlci5zaXplID09PSAncycgPyAnc21hbGxlcicgOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICB9KS5hcHBlbmRUbyhyb3dFbGVtZW50c1tNYXRoLm1heChoZWFkZXIuaGVhZGVyUm93IHx8IDEsIDEpIC0gMV0pO1xuICAgICAgICAgICAgaWYgKGhlYWRlci5zb3J0QnkpIHtcbiAgICAgICAgICAgICAgICBjZWxsLmFkZENsYXNzKCdzb3J0aGVhZGVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGVhZGVyLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIikpLmFwcGVuZFRvKGNlbGwpLnRleHQoaGVhZGVyLm5hbWUpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2NsYXNzJzogaGVhZGVyLm5vd3JhcCA/ICdub3dyYXAnIDogdW5kZWZpbmVkIH0pLmNzcyhjb21tb25Dc3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSByaWdodC1zaWRlIGJvcmRlciBsaW5lIGZyb20gdGhlIGxhc3QgZWxlbWVudCBvZiBlYWNoIHJvd1xuICAgICAgICByb3dFbGVtZW50cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgIHZhciBsOmFueSA9IHJvdy5sYXN0Q2hpbGQ7XG4gICAgICAgICAgICBpZiAobCkgeyBsLnN0eWxlLmJvcmRlclJpZ2h0ID0gJzAnIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJvd0VsZW1lbnRzO1xuICAgIH1cblxuXG4gICAgLy8gQnVpbGQgdGhlIHJvd3MgKGFuZCB0aGUgY29udGVudHMgb2YgdGhlIHJvd3MpIGZvciBlYWNoIHJlY29yZCBpbiB0aGUgZGF0YS5cbiAgICAvLyAoU2VlIHRoZSBEYXRhR3JpZERhdGFDZWxsIGNsYXNzLilcbiAgICBwcml2YXRlIF9hbGxvY2F0ZVRhYmxlUm93UmVjb3JkcygpOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHMgPSBuZXcgRGF0YUdyaWRSZWNvcmRTZXQoKTtcbiAgICAgICAgdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHNbaWRdID0gbmV3IERhdGFHcmlkUmVjb3JkKHRoaXMuX3NwZWMsIGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gQXNzZW1ibGUgdGFibGUgcm93cyAtIGRpc2Nsb3NlZCBhbmQgdW5kaXNjbG9zZWQgdmVyc2lvbnMgKHdpdGggY2FsbGJhY2tzKSAtXG4gICAgLy8gdGhhdCBhY3QgYXMgdGl0bGVzIGZvciB0aGUgZGlmZmVyZW50IGdyb3VwcyB3aGVuIHRoZSB0YWJsZSBpcyBpbiBncm91cGluZyBtb2RlLlxuICAgIHByaXZhdGUgX2J1aWxkUm93R3JvdXBUaXRsZVJvd3MoKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVSb3dHcm91cFNwZWMuZm9yRWFjaCgob25lR3JvdXAsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBvbmVHcm91cC5kaXNjbG9zZWQgPSB0cnVlO1xuICAgICAgICAgICAgdmFyIHJlcGxpY2F0ZXMgPSB0aGlzLl9ncm91cFJlcGxpY2F0ZXMoKTtcbiAgICAgICAgICAgIHZhciByZXBsaWNhdGVJZHMgPSB0aGlzLl9maW5kUmVwbGljYXRlTGluZXMocmVwbGljYXRlcywgb25lR3JvdXApO1xuICAgICAgICAgICAgb25lR3JvdXAubWVtYmVyUmVjb3JkcyA9IFtdO1xuICAgICAgICAgICAgdmFyIGNsaWNrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlID0gb25lR3JvdXAucmVwbGljYXRlR3JvdXBUYWJsZUpRID0gJChvbmVHcm91cC5yZXBsaWNhdGVHcm91cFRhYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRib2R5XCIpKVxuICAgICAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2dyb3VwSGVhZGVyVGFibGUnKTtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gb25lR3JvdXAucmVwbGljYXRlR3JvdXBUaXRsZVJvd0pRID0gJChvbmVHcm91cC5yZXBsaWNhdGVHcm91cFRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8odGFibGUpLmFkZENsYXNzKCdncm91cEhlYWRlcicpLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbGlja3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9leHBhbmRSb3dHcm91cChpbmRleCwgcmVwbGljYXRlSWRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGlja3MgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fY29sbGFwc2VSb3dHcm91cChpbmRleCwgcmVwbGljYXRlSWRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGlja3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB2YXIgY2VsbCA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRkXCIpKS5hcHBlbmRUbyhyb3cpLnRleHQoXCIgXCIgKyBvbmVHcm91cC5uYW1lKS5hZGRDbGFzcygnZ3JvdXBSZXBsaWNhdGVSb3cnKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fdG90YWxDb2x1bW5Db3VudCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgY2VsbC5hdHRyKCdjb2xzcGFuJywgdGhpcy5fdG90YWxDb2x1bW5Db3VudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIHJldHVybnMgdGhlIGxpbmVzIGFzc29jaWF0ZWQgd2l0aCBhIHJlcGxpY2F0ZSBncm91cFxuICAgICAqIEBwYXJhbSByZXBsaWNhdGVzIC0gYXJyYXkgb2YgaWRzIGFzc29jaWF0ZWQgd2l0aCByZXBsaWNhdGVcbiAgICAgKiBAcGFyYW0gb25lR3JvdXAgaXMgdGhlIHJlcGxpY2F0ZSBuYW1lXG4gICAgICogQHJldHVybnMge0FycmF5fSBvZiBsaW5lcyB0aGF0IGFyZSBhc3NvY2lhdGUgd2l0aCB0aGUgc2FpZCByZXBsaWNhdGUgbmFtZVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBfZmluZFJlcGxpY2F0ZUxpbmVzKHJlcGxpY2F0ZXMsIG9uZUdyb3VwKTogc3RyaW5nW10ge1xuICAgICAgICB2YXIgZ3JvdXBlZElkcyA9IFtdOyAvL3JldHVybnMgaWRzIGFzc29jaWF0ZWQgd2l0aCByZXBsaWNhdGUgaWQuXG4gICAgICAgICAgICAkLmVhY2gocmVwbGljYXRlcywgZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNbcmVwbGljYXRlc1trZXldXS5uYW1lID09PSBvbmVHcm91cC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyb3VwZWRJZHMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZ3JvdXBlZElkcztcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgdGhlIFwic29ydGFibGVcIiBDU1MgY2xhc3MgaW4gYSB0YWJsZS5cbiAgICBwcml2YXRlIF9wcmVwYXJlU29ydGFibGUoKTp2b2lkIHtcbiAgICAgICAgLy8gQWRkIGEgY2xpY2sgZXZlbnQgZm9yIGV2ZXJ5IGhlYWRlciBjZWxsIHRoYXQgaWRlbnRpZmllcyBhcyBzb3J0YWJsZVxuICAgICAgICB0aGlzLl9zcGVjLmVuYWJsZVNvcnQodGhpcyk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9zaG93T3B0TWVudSgpOnZvaWQge1xuICAgICAgICAkKHRoaXMuX29wdGlvbnNMYWJlbCkucmVtb3ZlQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJykuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT24nKTtcbiAgICAgICAgJCh0aGlzLl9vcHRpb25zTWVudUJsb2NrRWxlbWVudCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2hpZGVPcHRNZW51KCk6dm9pZCB7XG4gICAgICAgICQodGhpcy5fb3B0aW9uc0xhYmVsKS5yZW1vdmVDbGFzcygncHVsbGRvd25NZW51TGFiZWxPbicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpO1xuICAgICAgICAkKHRoaXMuX29wdGlvbnNNZW51QmxvY2tFbGVtZW50KS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiBoaWRlcyB0aGUgbGluZXMgYW5kIGNvbGxhcHNlcyB0aGUgcmVwbGljYXRlIGRyb3Bkb3duXG4gICAgICogQHBhcmFtIGdyb3VwSW5kZXhcbiAgICAgKiBAcGFyYW0gcmVwbGljYXRlSWRzXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIF9jb2xsYXBzZVJvd0dyb3VwKGdyb3VwSW5kZXgsIHJlcGxpY2F0ZUlkcyk6dm9pZCB7XG4gICAgICAgIHZhciByb3dHcm91cCA9IHRoaXMuX3NwZWMudGFibGVSb3dHcm91cFNwZWNbZ3JvdXBJbmRleF07XG4gICAgICAgIHJvd0dyb3VwLmRpc2Nsb3NlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmFkZFJlcGxpY2F0ZVJvd3MocmVwbGljYXRlSWRzKTtcbiAgICAgICAgJChyb3dHcm91cC5yZXBsaWNhdGVHcm91cFRpdGxlUm93KS5yZW1vdmVDbGFzcygncmVwbGljYXRlJyk7XG4gICAgICAgIF8uZWFjaChsaW5lcywgZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgJChsaW5lKS5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ2FycmFuZ2VUYWJsZURhdGFSb3dzJywgKCkgPT4gdGhpcy5hcnJhbmdlVGFibGVEYXRhUm93cygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIG9wZW5zIHRoZSBkcm9wZG93biBvbiBhIHJlcGxpY2F0ZSBncm91cCBhbmQgc2hvd3MgdGhlIGxpbmVzIGFzc29jaWF0ZWQgd2l0aFxuICAgICAqIHRoZSByZXBsaWNhdGUgZ3JvdXBcbiAgICAgKiBAcGFyYW0gZ3JvdXBJbmRleFxuICAgICAqIEBwYXJhbSByZXBsaWNhdGVJZHNcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgX2V4cGFuZFJvd0dyb3VwKGdyb3VwSW5kZXgsIHJlcGxpY2F0ZUlkcyk6dm9pZCB7XG4gICAgICAgIHZhciByb3dHcm91cCA9IHRoaXMuX3NwZWMudGFibGVSb3dHcm91cFNwZWNbZ3JvdXBJbmRleF07XG4gICAgICAgIHJvd0dyb3VwLmRpc2Nsb3NlZCA9IHRydWU7XG4gICAgICAgIHZhciBsaW5lcyA9IHRoaXMuYWRkUmVwbGljYXRlUm93cyhyZXBsaWNhdGVJZHMpO1xuICAgICAgICAkKHJvd0dyb3VwLnJlcGxpY2F0ZUdyb3VwVGl0bGVSb3cpLmFkZENsYXNzKCdyZXBsaWNhdGUnKTtcbiAgICAgICAgXy5lYWNoKGxpbmVzLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICAkKGxpbmUpLnNob3coKS5hZGRDbGFzcygncmVwbGljYXRlTGluZVNob3cnKTtcbiAgICAgICAgICAgICQocm93R3JvdXAucmVwbGljYXRlR3JvdXBUaXRsZVJvdykuYWZ0ZXIobGluZSk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiBmaW5kcyB0aGUgbGluZXMgYXNzb2NpYXRlZCB3aXRoIHRoZWlyIHJlcGxpY2F0ZSBncm91cCBpZC5cbiAgICAgKiBAcmV0dXJucyB7fSBsaW5lIGlkIGFzIGtleSBhbmQgdGhlIHJlcGxpY2F0ZSBpZCB0aGUgbGluZSBpcyBhc3NvY2lhdGVkIHdpdGhcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgX2dyb3VwUmVwbGljYXRlcygpOnt9IHtcbiAgICAgICAgdmFyIGxpbmVzID0gRURERGF0YS5MaW5lcztcbiAgICAgICAgdmFyIHJvd3MgPSB7fTtcbiAgICAgICAgJC5lYWNoKGxpbmVzLCBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lc1trZXldLnJlcGxpY2F0ZSkge1xuICAgICAgICAgICAgICAgIHJvd3NbbGluZXNba2V5XS5pZF0gPSBsaW5lc1trZXldLnJlcGxpY2F0ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJvd3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiBnZXRzIHRoZSBsaW5lIGVsZW1lbnRzIGFzc29jaWF0ZWQgd2l0aCBhIHJlcGxpY2F0ZSBpZFxuICAgICAqIEBwYXJhbSBpZEFycmF5XG4gICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAqL1xuICAgIHByaXZhdGUgYWRkUmVwbGljYXRlUm93cyhpZEFycmF5KTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiAkLm1hcChpZEFycmF5LCAoaWQpID0+ICQoJ1t2YWx1ZT0nICsgaWQgKyAnXScsIHRoaXMuX3RhYmxlKS5wYXJlbnRzKCd0cicpLmZpbHRlcignOmZpcnN0JykpXG5cbiAgICB9XG5cblxuICAgIHR1cm5PblJvd0dyb3VwaW5nKCk6dm9pZCB7XG4gICAgICAgIHRoaXMuX2dyb3VwaW5nRW5hYmxlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignYXJyYW5nZVRhYmxlRGF0YVJvd3MnLCAoKSA9PiB0aGlzLmFycmFuZ2VUYWJsZURhdGFSb3dzKCkpO1xuICAgIH1cblxuXG4gICAgdHVybk9mZlJvd0dyb3VwaW5nKCk6dm9pZCB7XG4gICAgICAgIHRoaXMuX2dyb3VwaW5nRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ2FycmFuZ2VUYWJsZURhdGFSb3dzJywgKCkgPT4gdGhpcy5hcnJhbmdlVGFibGVEYXRhUm93cygpKTtcbiAgICB9XG5cblxuICAgIGNsaWNrZWRPcHRpb25XaWRnZXQoZXZlbnQ6RXZlbnQpOnZvaWQge1xuICAgICAgICB2YXIgY29udHJvbCA9IGV2ZW50LnRhcmdldDsgICAgLy8gR3JhYiB0aGUgY2hlY2tib3ggdGhhdCBzZW50IHRoZSBldmVudFxuICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ2FycmFuZ2VUYWJsZURhdGFSb3dzJywgKCkgPT4gdGhpcy5hcnJhbmdlVGFibGVEYXRhUm93cygpKTtcbiAgICB9XG5cblxuICAgIGNsaWNrZWRIZWFkZXJXaWRnZXQoaGVhZGVyV2lkZ2V0OkRhdGFHcmlkV2lkZ2V0KTp2b2lkIHtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdhcnJhbmdlVGFibGVEYXRhUm93cycsICgpID0+IHRoaXMuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKSk7XG4gICAgfVxuXG5cbiAgICAvLyAnY29udHJvbCcgaXMgYSBjb2x1bW4gdmlzaWJpbGl0eSBjaGVja2JveFxuICAgIHByaXZhdGUgX2NsaWNrZWRDb2xWaXNpYmlsaXR5Q29udHJvbChldmVudDpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBjaGVjayA9ICQoZXZlbnQudGFyZ2V0KSwgY29sID0gZXZlbnQuZGF0YTtcbiAgICAgICAgaWYgKGNoZWNrLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgdGhpcy5zaG93Q29sdW1uKGNvbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmhpZGVDb2x1bW4oY29sKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vICdjb250cm9sJyBpcyBhIGNvbHVtbiB2aXNpYmlsaXR5IGNoZWNrYm94XG4gICAgc2hvd0NvbHVtbihncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyk6dm9pZCB7XG4gICAgICAgIGlmIChncm91cC5jdXJyZW50bHlIaWRkZW4pIHtcbiAgICAgICAgICAgIGdyb3VwLmN1cnJlbnRseUhpZGRlbiA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGdyb3VwLnJldmVhbGVkQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBncm91cC5yZXZlYWxlZENhbGxiYWNrKHRoaXMuX3NwZWMsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdfdXBkYXRlQ29sdW1uU2V0dGluZ3MnLCAoKSA9PiB0aGlzLl91cGRhdGVDb2x1bW5TZXR0aW5ncygpKTtcbiAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignX2FwcGx5Q29sdW1uVmlzaWJpbGl0eScsICgpID0+IHRoaXMuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eSgpKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gJ2NvbnRyb2wnIGlzIGEgY29sdW1uIHZpc2liaWxpdHkgY2hlY2tib3hcbiAgICBoaWRlQ29sdW1uKGdyb3VwOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKTp2b2lkIHtcbiAgICAgICAgaWYgKCFncm91cC5jdXJyZW50bHlIaWRkZW4pIHtcbiAgICAgICAgICAgIGdyb3VwLmN1cnJlbnRseUhpZGRlbiA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ191cGRhdGVDb2x1bW5TZXR0aW5ncycsICgpID0+IHRoaXMuX3VwZGF0ZUNvbHVtblNldHRpbmdzKCkpO1xuICAgICAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdfYXBwbHlDb2x1bW5WaXNpYmlsaXR5JywgKCkgPT4gdGhpcy5fYXBwbHlDb2x1bW5WaXNpYmlsaXR5KCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfYmFzZVBheWxvYWQoKTphbnkge1xuICAgICAgICB2YXIgdG9rZW46c3RyaW5nID0gZG9jdW1lbnQuY29va2llLnJlcGxhY2UoXG4gICAgICAgICAgICAvKD86KD86XnwuKjtcXHMqKWNzcmZ0b2tlblxccypcXD1cXHMqKFteO10qKS4qJCl8Xi4qJC8sXG4gICAgICAgICAgICAnJDEnKTtcbiAgICAgICAgcmV0dXJuIHsgJ2NzcmZtaWRkbGV3YXJldG9rZW4nOiB0b2tlbiB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgX2NvbHVtblNldHRpbmdzS2V5KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIFsgJ2RhdGFncmlkJywgdGhpcy5fc3BlYy50YWJsZVNwZWMuaWQsICdjb2x1bW4nIF0uam9pbignLicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2ZldGNoU2V0dGluZ3MocHJvcEtleTpzdHJpbmcsIGNhbGxiYWNrOih2YWx1ZTphbnkpPT52b2lkLCBkZWZhdWx0VmFsdWU/OmFueSk6dm9pZCB7XG4gICAgICAgICQuYWpheCgnL3Byb2ZpbGUvc2V0dGluZ3MvJyArIHByb3BLZXksIHtcbiAgICAgICAgICAgICdkYXRhVHlwZSc6ICdqc29uJyxcbiAgICAgICAgICAgICdzdWNjZXNzJzogKGRhdGE6YW55KTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBkYXRhID0gZGF0YSB8fCBkZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YSA9IEpTT04ucGFyc2UoZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgLyogUGFyc2VFcnJvciwganVzdCB1c2Ugc3RyaW5nIHZhbHVlICovIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRoZSBzZXJ2ZXIgYmluZHMgdGhpcy4gJ3RoaXMnIGlzIGEgY2hlY2tib3guXG4gICAgcHJpdmF0ZSBfdXBkYXRlQ29sdW1uU2V0dGluZ3MoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBwcm9wS2V5ID0gdGhpcy5fY29sdW1uU2V0dGluZ3NLZXkoKSwgc2V0Q29sID0gW10sIHVuc2V0Q29sID0gW10sIGRlbENvbCA9IFtdO1xuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjLmZvckVhY2goKGNvbDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyk6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoY29sLnNob3dJblZpc2liaWxpdHlMaXN0ICYmIGNvbC5jaGVja2JveEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sLmNoZWNrYm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldENvbC5wdXNoKGNvbC5uYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB1bnNldENvbC5wdXNoKGNvbC5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2wuaGlkZGVuQnlEZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxDb2wucHVzaCgnLScgKyBjb2wubmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9mZXRjaFNldHRpbmdzKHByb3BLZXksIChkYXRhOmFueSkgPT4ge1xuICAgICAgICAgICAgdmFyIGluRGF0YSA9IChuYW1lOnN0cmluZyk6Ym9vbGVhbiA9PiBkYXRhLmluZGV4T2YobmFtZSkgPT09IC0xO1xuICAgICAgICAgICAgLy8gZmlsdGVyIG91dCBhbGwgdGhlIHVuc2V0IGJveGVzXG4gICAgICAgICAgICBkYXRhID0gZGF0YS5maWx0ZXIoKG5hbWU6c3RyaW5nKTpib29sZWFuID0+IHVuc2V0Q29sLmluZGV4T2YobmFtZSkgPT09IC0xKTtcbiAgICAgICAgICAgIC8vIGZpbHRlciBvdXQgYWxsIGV4Y2x1ZGVkIHRoYXQgYXJlIG5vdyBzZXRcbiAgICAgICAgICAgIGRhdGEgPSBkYXRhLmZpbHRlcigobmFtZTpzdHJpbmcpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAhKHNldENvbC5pbmRleE9mKG5hbWUuc3Vic3RyaW5nKDEpKSAhPT0gLTEgJiYgbmFtZS5pbmRleE9mKCctJykgPT09IDApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IGFsbCB0aGUgc2V0IGJveGVzIGFscmVhZHkgaW4gdGhlIHNldHRpbmdzIGxpc3RcbiAgICAgICAgICAgIHNldENvbCA9IHNldENvbC5maWx0ZXIoaW5EYXRhKTtcbiAgICAgICAgICAgIC8vIGZpbHRlciBvdXQgZHVwZXMgaW4gZGVsQ29sXG4gICAgICAgICAgICBkZWxDb2wgPSBkZWxDb2wuZmlsdGVyKGluRGF0YSlcbiAgICAgICAgICAgIC8vIGFkZCBhbnkgbWlzc2luZyBpdGVtc1xuICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoZGF0YSwgc2V0Q29sKTtcbiAgICAgICAgICAgIC8vIG1hcmsgbm9uLWRlZmF1bHQgaGlkZSAoaS5lLiBkZWZhdWx0IHNob3cpIGFzIGV4cGxpY2l0bHkgZXhjbHVkZWRcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGRhdGEsIGRlbENvbCk7XG4gICAgICAgICAgICAvLyBzdG9yZSBuZXcgc2V0dGluZyB2YWx1ZVxuICAgICAgICAgICAgJC5hamF4KCcvcHJvZmlsZS9zZXR0aW5ncy8nICsgcHJvcEtleSwge1xuICAgICAgICAgICAgICAgICdkYXRhJzogJC5leHRlbmQoe30sIHRoaXMuX2Jhc2VQYXlsb2FkKCksIHsgJ2RhdGEnOiBKU09OLnN0cmluZ2lmeShkYXRhKSB9KSxcbiAgICAgICAgICAgICAgICAndHlwZSc6ICdQT1NUJ1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIFtdKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBTY2hlZHVsZSBhIGNhbGwgdG8gdGhlIGdpdmVuIGZ1bmN0aW9uIGluIHRoZSBuZWFyIGZ1dHVyZSwgYW5kIHNhdmUgdGhlIHRpbWVyIHVuZGVyIHRoZSBnaXZlbiBpZGVudGlmaWVyLlxuICAgIC8vIE11bHRpcGxlIGNhbGxzIHRvIHRoaXMgdXNpbmcgdGhlIHNhbWUgaWRlbnRpZmllciB3aWxsIHJlc2NoZWR1bGUgdGhlIGV2ZW50LCByZW1vdmluZyB0aGUgb2xkIHRpbWVyLlxuICAgIHNjaGVkdWxlVGltZXIodWlkOnN0cmluZywgZnVuYzooKSA9PiBhbnkpOkRhdGFHcmlkIHtcbiAgICAgICAgaWYgKHRoaXMuX3RpbWVyc1t1aWRdKSB7IGNsZWFyVGltZW91dCAoIHRoaXMuX3RpbWVyc1t1aWRdICk7IH1cbiAgICAgICAgdGhpcy5fdGltZXJzW3VpZF0gPSBzZXRUaW1lb3V0KCBmdW5jLCAxMCApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIGFwcGx5IGEgZnVuY3Rpb24gdG8gZXZlcnkgcmVjb3JkIElEIHNwZWNpZmllZFxuICAgIGFwcGx5VG9SZWNvcmRTZXQoZnVuYzoocm93czpEYXRhR3JpZERhdGFSb3dbXSwgaWQ6c3RyaW5nLCBzcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGdyaWQ6RGF0YUdyaWQpPT52b2lkLCBpZHM6c3RyaW5nW10pOkRhdGFHcmlkIHtcbiAgICAgICAgaWRzLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICBmdW5jLmNhbGwoe30sIHRoaXMuX3JlY29yZEVsZW1lbnRzW2lkXS5nZXREYXRhR3JpZERhdGFSb3dzKCksIGlkLCB0aGlzLl9zcGVjLCB0aGlzKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gcmV0cmVpdmUgdGhlIGN1cnJlbnQgc2VxdWVuY2Ugb2YgcmVjb3JkcyBpbiB0aGUgRGF0YUdyaWRcbiAgICBjdXJyZW50U2VxdWVuY2UoKTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRTZXF1ZW5jZSh0aGlzLl9zb3J0WzBdKTtcbiAgICB9XG5cbiAgICBzb3J0Q29scygpOkRhdGFHcmlkU29ydFtdO1xuICAgIHNvcnRDb2xzKGNvbHM6RGF0YUdyaWRTb3J0W10pOkRhdGFHcmlkO1xuICAgIHNvcnRDb2xzKGNvbHM/OkRhdGFHcmlkU29ydFtdKTphbnkge1xuICAgICAgICBpZiAoY29scyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc29ydDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3NvcnQgPSBjb2xzO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbn1cblxuY2xhc3MgTGluZVJlc3VsdHMgZXh0ZW5kcyBEYXRhR3JpZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLl9nZXRDbGFzc2VzKCk7XG4gICAgICAgIHRoaXMuX2dldERpdkZvclRhYmxlSGVhZGVycygpO1xuICAgICAgICB0aGlzLl9nZXRUYWJsZUhlYWRlclJvdygpO1xuICAgICAgICB0aGlzLl9nZXRUSGVhZFJvdygpO1xuICAgICAgICB0aGlzLl9nZXRUYWJsZUhlYWRlckNlbGwoKTtcbiAgICB9XG4gICAgX2dldFRIZWFkUm93KCk6SlF1ZXJ5IHtcbiAgICAgICAgcmV0dXJuICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGhlYWQnKSk7XG4gICAgfVxuXG4gICAgX2dldFRhYmxlSGVhZGVyUm93KCk6SlF1ZXJ5IHtcbiAgICAgICAgcmV0dXJuICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpKS5hZGRDbGFzcygnaGVhZGVyJyk7XG4gICAgfVxuXG4gICAgX2dldFRhYmxlSGVhZGVyQ2VsbCgpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0aFwiKTtcbiAgICB9XG5cbiAgICBfZ2V0RGl2Rm9yVGFibGVIZWFkZXJzKCk6YW55IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldFRhYmxlQm9keSgpO1xuICAgIH1cblxuICAgIF9nZXRDbGFzc2VzKCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdkYXRhVGFibGUgc29ydGFibGUgZHJhZ2JveGVzIGhhc3RhYmxlY29udHJvbHMnO1xuICAgIH1cblxufVxuXG5jbGFzcyBBc3NheVJlc3VsdHMgZXh0ZW5kcyBEYXRhR3JpZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLl9nZXRDbGFzc2VzKCk7XG4gICAgICAgIHRoaXMuX2dldERpdkZvclRhYmxlSGVhZGVycygpO1xuICAgICAgICB0aGlzLl9nZXRUYWJsZUhlYWRlclJvdygpO1xuICAgICAgICB0aGlzLl9nZXRUSGVhZFJvdygpO1xuICAgICAgICB0aGlzLl9nZXRUYWJsZUhlYWRlckNlbGwoKTtcbiAgICB9XG4gICAgX2dldFRIZWFkUm93KCk6SlF1ZXJ5IHtcbiAgICAgICAgcmV0dXJuICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGhlYWQnKSk7XG4gICAgfVxuXG4gICAgX2dldFRhYmxlSGVhZGVyUm93KCk6SlF1ZXJ5IHtcbiAgICAgICAgcmV0dXJuICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpKS5hZGRDbGFzcygnaGVhZGVyJyk7XG4gICAgfVxuXG4gICAgX2dldFRhYmxlSGVhZGVyQ2VsbCgpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0aFwiKTtcbiAgICB9XG5cbiAgICBfZ2V0RGl2Rm9yVGFibGVIZWFkZXJzKCk6YW55IHtcbiAgICAgICAgcmV0dXJuICQoJyNhc3NheXNTZWN0aW9uJyk7XG4gICAgfVxuXG4gICAgX2dldENsYXNzZXMoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ2RhdGFUYWJsZSBzb3J0YWJsZSBkcmFnYm94ZXMgaGFzdGFibGVjb250cm9scyc7XG4gICAgfVxuXG59XG4vLyBUeXBlIGRlZmluaXRpb24gZm9yIHRoZSByZWNvcmRzIGNvbnRhaW5lZCBpbiBhIERhdGFHcmlkXG5jbGFzcyBEYXRhR3JpZFJlY29yZFNldCB7XG4gICAgW2luZGV4OnN0cmluZ106RGF0YUdyaWRSZWNvcmQ7XG59XG5cblxuLy8gVHlwZSBkZWZpbml0aW9uIGZvciB0aGUgcmVjb3JkcyBjb250YWluZWQgaW4gYSBEYXRhR3JpZFxuY2xhc3MgRGF0YUdyaWRSZWNvcmQge1xuICAgIGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2U7XG4gICAgcmVjb3JkSUQ6c3RyaW5nO1xuICAgIGRhdGFHcmlkRGF0YVJvd3M6RGF0YUdyaWREYXRhUm93W107XG4gICAgcm93RWxlbWVudHM6SFRNTEVsZW1lbnRbXTtcbiAgICBjcmVhdGVkRWxlbWVudHM6Ym9vbGVhbjtcbiAgICBzdHJpcGVTdHlsZXM6c3RyaW5nW107XG4gICAgc3RyaXBlU3R5bGVzSm9pbjpzdHJpbmc7XG4gICAgcmVjZW50U3RyaXBlSW5kZXg6YW55O1xuXG4gICAgY29uc3RydWN0b3IoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaWQ6c3RyaW5nKSB7XG4gICAgICAgIHRoaXMuZ3JpZFNwZWMgPSBncmlkU3BlYztcbiAgICAgICAgdGhpcy5yZWNvcmRJRCA9IGlkO1xuICAgICAgICB0aGlzLnJvd0VsZW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cyA9IFtdO1xuICAgICAgICB0aGlzLnN0cmlwZVN0eWxlcyA9IFsnc3RyaXBlUm93QScsJ3N0cmlwZVJvd0InXTtcbiAgICAgICAgdGhpcy5zdHJpcGVTdHlsZXNKb2luID0gdGhpcy5zdHJpcGVTdHlsZXMuam9pbignICcpO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlY2VudFN0cmlwZUluZGV4ID0gbnVsbDtcbiAgICB9XG5cblxuICAgIHJlQ3JlYXRlRWxlbWVudHNJblBsYWNlKCk6dm9pZCB7XG4gICAgICAgIC8vIElmIHRoZSBlbGVtZW50cyBoYXZlbid0IGJlZW4gY3JlYXRlZCBldmVuIG9uY2UsIHRoZW4gZGl2ZXJ0IHRvIHN0YW5kYXJkIGNyZWF0aW9uIGFuZCBmaW5pc2guXG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB3ZSdyZSBnb2luZyB0byBtYWludGFpbiB0aGUgcG9zaXRpb24gb2YgdGhlIG5ldyByb3dzLFxuICAgICAgICAvLyB3ZSBuZWVkIHRvIGZpbmQgdGhlaXIgZWFybGllciBhZGphY2VudCBzaWJsaW5nLCBpZiBvbmUgZXhpc3RzLlxuICAgICAgICB2YXIgcHJldmlvdXNQYXJlbnQgPSBudWxsO1xuICAgICAgICB2YXIgbmV4dFNpYmxpbmcgPSBudWxsO1xuICAgICAgICBpZiAodGhpcy5kYXRhR3JpZERhdGFSb3dzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGxhc3RFbCA9IHRoaXMucm93RWxlbWVudHNbdGhpcy5kYXRhR3JpZERhdGFSb3dzLmxlbmd0aC0xXTtcbiAgICAgICAgICAgIC8vIFNhbml0eSBjaGVjazogIERvZXMgaXQgaGF2ZSBhIHBhcmVudD8gIENhbid0IGhhdmUgYSB2YWxpZCBzaWJsaW5nIHdpdGhvdXQgYSBwYXJlbnQuXG4gICAgICAgICAgICBpZiAobGFzdEVsLnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICBwcmV2aW91c1BhcmVudCA9IGxhc3RFbC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIG5leHRTaWJsaW5nID0gbGFzdEVsLm5leHRTaWJsaW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIE5vdyB0aGF0IHdlIGtub3cgdGhlc2UgdGhpbmdzLCB3ZSBjYW4gZGl0Y2ggdGhlIHJvd3Mgb3V0IG9mIHRoZSB0YWJsZS5cbiAgICAgICAgdGhpcy5yZW1vdmVFbGVtZW50cygpO1xuICAgICAgICAvLyBGb3JjZSByZWNyZWF0aW9uLlxuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyA9IGZhbHNlO1xuICAgICAgICAvLyBUaGUgb2xkIGNlbGxzIGFyZSBzdGlsbCByZWZlcmVuY2VkIGluIHRoZWlyIGNvbFNwZWMgb2JqZWN0cyBiZWZvcmUgdGhpcyxcbiAgICAgICAgLy8gYnV0IGNhbGxpbmcgZ2VuZXJhdGVDZWxscyBhZ2FpbiBhdXRvbWF0aWNhbGx5IHJlcGxhY2VzIHRoZW0uXG4gICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHMoKTtcbiAgICAgICAgLy8gSWYgcmVjZW50U3RyaXBlSW5kZXggaXMgbnVsbCwgd2UgaGF2ZW4ndCBhcHBsaWVkIGFueSBzdHJpcGluZyB0byB0aGUgcHJldmlvdXMgcm93LCBzbyB3ZSBza2lwIGl0IGhlcmUuXG4gICAgICAgIGlmICghKHRoaXMucmVjZW50U3RyaXBlSW5kZXggPT09IG51bGwpKSB7XG4gICAgICAgICAgICB0aGlzLmFwcGx5U3RyaXBpbmcodGhpcy5yZWNlbnRTdHJpcGVJbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJvcCB0aGUgbmV3IHJvd3MgaW50byBwbGFjZSB3aGVyZSB0aGUgb2xkIHJvd3MgbGl2ZWQuXG4gICAgICAgIGlmIChwcmV2aW91c1BhcmVudCkge1xuICAgICAgICAgICAgaWYgKG5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNQYXJlbnQuaW5zZXJ0QmVmb3JlKHJvdywgbmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJvd0VsZW1lbnRzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c1BhcmVudC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBjcmVhdGVFbGVtZW50cygpOnZvaWQge1xuICAgICAgICBpZiAodGhpcy5jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJvd0VsZW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cyA9IFtdO1xuXG4gICAgICAgIHZhciBjZWxsc0ZvckNvbHVtbnMgPSB7fTtcbiAgICAgICAgdGhpcy5ncmlkU3BlYy50YWJsZUNvbHVtblNwZWMuZm9yRWFjaCgoY29sU3BlYywgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGNlbGxzRm9yQ29sdW1uc1tpbmRleF0gPSBjb2xTcGVjLmdlbmVyYXRlQ2VsbHModGhpcy5ncmlkU3BlYywgdGhpcy5yZWNvcmRJRCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdlIHdpbGwgdXNlIHRoZXNlIGluZGV4ZXMgdG8gZGV0ZXJtaW5lIHdoZW4gd2UgbmVlZCB0byBhZGQgdGhlIG5leHQgY2VsbCwgaW4gdGhlIHNlcXVlbmNlIG9mIHJvd3MuXG4gICAgICAgIHZhciBjdXJyZW50Um93SGVpZ2h0cyA9IFtdO1xuICAgICAgICB0aGlzLmdyaWRTcGVjLnRhYmxlQ29sdW1uU3BlYy5mb3JFYWNoKChjb2xTcGVjLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgY3VycmVudFJvd0hlaWdodHNbaW5kZXhdID0gMDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGFkZGluZ0ZvclJvdyA9IDA7XG4gICAgICAgIHZhciBtb3JlVG9BZGQ6Ym9vbGVhbiA9IHRydWU7XG4gICAgICAgIHZhciBjZWxsczpEYXRhR3JpZERhdGFDZWxsW10gPSBbXTtcblxuICAgICAgICAvLyBQdWxsIGNlbGxzIG9mZiB0aGUgYm90dG9tIG9mIHRoZSBhcnJheXMsIGxlZnQgdG8gcmlnaHQsIGFzc2VtYmxpbmcgdGhlIHJvd3Mgb25lIGF0IGEgdGltZSxcbiAgICAgICAgLy8gc2tpcHBpbmcgY29sdW1ucyBiYXNlZCBvbiB0aGUgcm93c3BhbiBvciBjb2xzcGFuIG9mIHByZXZpb3VzIGNlbGxzLiAgV2UgZXhwZWN0IHRoZSBjbGllbnQgb2ZcbiAgICAgICAgLy8gdGhpcyBjbGFzcyB0byBlbnN1cmUgdGhleSBhcmUgZGVjbGFyaW5nIGEgbmljZWx5IGZpdHRlZCByZWN0YW5ndWxhciBzdHJ1Y3R1cmUgLSB3ZSBkb24ndCB2YWxpZGF0ZSBpdC5cbiAgICAgICAgd2hpbGUgKG1vcmVUb0FkZCkge1xuICAgICAgICAgICAgbW9yZVRvQWRkID0gZmFsc2U7XG4gICAgICAgICAgICBjZWxscyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5ncmlkU3BlYy50YWJsZUNvbHVtblNwZWMuZm9yRWFjaCgoc3BlYywgY29sKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbENlbGxzLCBjLCBuZXh0O1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Um93SGVpZ2h0c1tjb2xdID4gYWRkaW5nRm9yUm93KSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKChjb2xDZWxscyA9IGNlbGxzRm9yQ29sdW1uc1tjb2xdKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYyA9IGNvbENlbGxzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2xDZWxscy5sZW5ndGgpIG1vcmVUb0FkZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIG5leHQgPSBjb2wgKyBjLmNvbHNwYW47XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChjb2wgPCBuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50Um93SGVpZ2h0c1tjb2xdID0gYy5yb3dzcGFuICsgYWRkaW5nRm9yUm93O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2VsbHMucHVzaChjKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIHIgPSBuZXcgRGF0YUdyaWREYXRhUm93KHRoaXMucmVjb3JkSUQsIGNlbGxzKTtcbiAgICAgICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cy5wdXNoKHIpO1xuICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50cy5wdXNoKHIuZ2V0RWxlbWVudCgpKTtcblxuICAgICAgICAgICAgLy8ga2VlcCBnb2luZyBpZiBjdXJyZW50IHJvdyBpcyBsZXNzIHRoYW4gaGlnaGVzdCByb3dzcGFuXG4gICAgICAgICAgICBtb3JlVG9BZGQgPSAoKythZGRpbmdGb3JSb3cgPCBjdXJyZW50Um93SGVpZ2h0cy5yZWR1Y2UoKGEsYikgPT4geyByZXR1cm4gTWF0aC5tYXgoYSxiKTsgfSwgMCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgcmVtb3ZlRWxlbWVudHMoKSB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgIHJvdy5yZW1vdmVFbGVtZW50KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gTGlrZSByZW1vdmUsIGV4Y2VwdCBpdCBkb2Vzbid0IHJlbW92ZSBKUXVlcnkgZXZlbnRzIG9yIGRhdGEuXG4gICAgLy8gVXNlZCB0byB0YWtlIHRoZSB0YWJsZSByb3dzIHRlbXBvcmFyaWx5IG91dCBvZiB0aGUgRE9NLCBsaWtlIHdoZW4gcmUtb3JkZXJpbmcuXG4gICAgZGV0YWNoRWxlbWVudHMoKSB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgIHJvdy5kZXRhY2hFbGVtZW50KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2V0RGF0YUdyaWREYXRhUm93cygpOkRhdGFHcmlkRGF0YVJvd1tdIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGFHcmlkRGF0YVJvd3M7XG4gICAgfVxuXG5cbiAgICBnZXRFbGVtZW50cygpOkhUTUxFbGVtZW50W10ge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucm93RWxlbWVudHM7XG4gICAgfVxuXG5cbiAgICBhcHBseVN0cmlwaW5nKHN0cmlwZUluZGV4Om51bWJlcikge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuZ2V0RGF0YUdyaWREYXRhUm93cygpO1xuICAgICAgICB0aGlzLnJlY2VudFN0cmlwZUluZGV4ID0gc3RyaXBlSW5kZXg7XG4gICAgICAgIHJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICB2YXIgckpRID0gcm93LmdldEVsZW1lbnRKUSgpO1xuICAgICAgICAgICAgckpRLnJlbW92ZUNsYXNzKHRoaXMuc3RyaXBlU3R5bGVzSm9pbikuYWRkQ2xhc3ModGhpcy5zdHJpcGVTdHlsZXNbc3RyaXBlSW5kZXhdKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuLy8gQ29udGFpbmVyIGNsYXNzIGZvciBkYXRhIHJvd3MgaW4gdGhlIGJvZHkgb2YgdGhlIERhdGFHcmlkIHRhYmxlLlxuLy8gRGF0YUdyaWQgaW5zdGFudGlhdGVzIHRoZXNlIGJ5IHBhc3NpbmcgaW4gYW4gYXJyYXkgb2YgdGhlIERhdGFHcmlkRGF0YUNlbGwgb2JqZWN0cyB0aGF0IHdpbGwgZm9ybSB0aGUgY29udGVudCBvZiB0aGUgcm93LlxuY2xhc3MgRGF0YUdyaWREYXRhUm93IHtcblxuICAgIHJvd0VsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgcm93RWxlbWVudEpROkpRdWVyeTtcbiAgICAvLyBEZWZpbmVkIG9yIHNldCBieSB0aGUgY29uc3RydWN0b3JcbiAgICByZWNvcmRJRDpzdHJpbmc7XG4gICAgZGF0YUdyaWREYXRhQ2VsbHM6RGF0YUdyaWREYXRhQ2VsbFtdO1xuICAgIGNyZWF0ZWRFbGVtZW50OmJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihpZDpzdHJpbmcsIGNlbGxzOkRhdGFHcmlkRGF0YUNlbGxbXSkge1xuICAgICAgICB0aGlzLnJlY29yZElEID0gaWQ7XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhQ2VsbHMgPSBjZWxscztcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudCA9IGZhbHNlO1xuICAgIH1cblxuXG4gICAgY3JlYXRlRWxlbWVudCgpIHtcbiAgICAgICAgdmFyIHJvd0VsOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpO1xuICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLmRhdGFHcmlkRGF0YUNlbGxzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IHRoaXMuZGF0YUdyaWREYXRhQ2VsbHNbaV07XG4gICAgICAgICAgICByb3dFbC5hcHBlbmRDaGlsZChjLmdldEVsZW1lbnQoKSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJvd0VsZW1lbnQgPSByb3dFbDtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudCA9IHRydWU7XG4gICAgfVxuXG5cbiAgICByZW1vdmVFbGVtZW50KCkge1xuICAgICAgICBpZiAodGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5nZXRFbGVtZW50SlEoKS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gTGlrZSByZW1vdmUsIGV4Y2VwdCBpdCBkb2Vzbid0IHJlbW92ZSBKUXVlcnkgZXZlbnRzIG9yIGRhdGEuXG4gICAgLy8gVXNlZCB0byB0YWtlIHRoZSB0YWJsZSByb3dzIHRlbXBvcmFyaWx5IG91dCBvZiB0aGUgRE9NLCBsaWtlIHdoZW4gcmUtb3JkZXJpbmcuXG4gICAgZGV0YWNoRWxlbWVudCgpIHtcbiAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0RWxlbWVudEpRKCkuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGdldEVsZW1lbnQoKTpIVE1MRWxlbWVudCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucm93RWxlbWVudDtcbiAgICB9XG5cblxuICAgIGdldEVsZW1lbnRKUSgpOkpRdWVyeSB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLnJvd0VsZW1lbnRKUSkge1xuICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50SlEgPSAkKHRoaXMucm93RWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucm93RWxlbWVudEpRO1xuICAgIH1cbn1cblxuXG5cbi8vIENvbnRhaW5lciBjbGFzcyBmb3IgY2VsbHMgaW4gdGhlIGJvZHkgb2YgdGhlIERhdGFHcmlkIHRhYmxlLlxuLy8gRGF0YUdyaWQgY2FsbHMgYSBmdW5jdGlvbiBkZWZpbmVkIGluIERhdGFHcmlkQ29sdW1uU3BlYyBvYmplY3RzIHRvIGluc3RhbnRpYXRlIHRoZXNlLFxuLy8gcGFzc2luZyBpbiBhIHJlZmVyZW5jZSB0byB0aGUgRGF0YUdyaWRTcGVjQmFzZSBhbmQgYSB1bmlxdWUgaWRlbnRpZmllciBmb3IgYSBkYXRhIHJlY29yZC5cbmNsYXNzIERhdGFHcmlkRGF0YUNlbGwge1xuXG4gICAgLy8gRGVmaW5lZCBvciBzZXQgYnkgdGhlIGNvbnN0cnVjdG9yXG4gICAgZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZTtcbiAgICByZWNvcmRJRDpzdHJpbmc7XG5cbiAgICAvLyBPcHRpb25zIHBvdGVudGlhbGx5IHNldCBieSB0aGUgY29uc3RydWN0b3JcbiAgICByb3dzcGFuOm51bWJlcjtcbiAgICBjb2xzcGFuOm51bWJlcjtcbiAgICBhbGlnbjpzdHJpbmc7ICAgICAgICAgICAvLyBUT0RPOiBzaG91bGQgYmUgYW4gZW51bSB0eXBlIG9mOiAnbGVmdCcsICdyaWdodCcsICdjZW50ZXInXG4gICAgdmFsaWduOnN0cmluZzsgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gdHlwZSBvZjogJ3RvcCcsICdtaWRkbGUnLCAnYm90dG9tJywgJ2Jhc2VsaW5lJ1xuICAgIG1heFdpZHRoOnN0cmluZztcbiAgICBtaW5XaWR0aDpzdHJpbmc7XG4gICAgbm93cmFwOmJvb2xlYW47XG4gICAgaG92ZXJFZmZlY3Q6Ym9vbGVhbjtcbiAgICBjb250ZW50RnVuY3Rpb246KGU6SFRNTEVsZW1lbnQsIGluZGV4Om51bWJlcik9PnZvaWQ7XG4gICAgY29udGVudFN0cmluZzpzdHJpbmc7XG4gICAgY2hlY2tib3hXaXRoSUQ6KGluZGV4Om51bWJlcik9PnN0cmluZztcbiAgICBjaGVja2JveE5hbWU6c3RyaW5nO1xuICAgIGN1c3RvbUlEOihpbmRleDpudW1iZXIpPT5zdHJpbmc7XG4gICAgc2lkZU1lbnVJdGVtczpzdHJpbmdbXTtcblxuICAgIC8vIExvY2FsIGRhdGFcbiAgICBjZWxsRWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBjZWxsRWxlbWVudEpROkpRdWVyeTtcbiAgICBjb250ZW50Q29udGFpbmVyRWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBjaGVja2JveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcbiAgICBoaWRkZW46Ym9vbGVhbjtcbiAgICBjcmVhdGVkRWxlbWVudDpib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaWQ6c3RyaW5nLCBvcHQ/OntbaW5kZXg6c3RyaW5nXTphbnl9KSB7XG4gICAgICAgIHZhciBkZWZhdWx0cztcbiAgICAgICAgdGhpcy5ncmlkU3BlYyA9IGdyaWRTcGVjO1xuICAgICAgICB0aGlzLnJlY29yZElEID0gaWQ7XG4gICAgICAgIHRoaXMuaGlkZGVuID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnQgPSBmYWxzZTtcbiAgICAgICAgZGVmYXVsdHMgPSB7XG4gICAgICAgICAgICAnY29udGVudEZ1bmN0aW9uJzogKGUsIGluZGV4KSA9PiB7fSxcbiAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJycsXG4gICAgICAgICAgICAnYWxpZ24nOiAnbGVmdCcsXG4gICAgICAgICAgICAncm93c3Bhbic6IDEsXG4gICAgICAgICAgICAnY29sc3Bhbic6IDFcbiAgICAgICAgfTtcbiAgICAgICAgJC5leHRlbmQodGhpcywgZGVmYXVsdHMsIG9wdCB8fCB7fSk7XG4gICAgfVxuXG5cbiAgICBjcmVhdGVFbGVtZW50KCkge1xuICAgICAgICB2YXIgaWQgPSB0aGlzLnJlY29yZElELFxuICAgICAgICAgICAgYzpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZFwiKSxcbiAgICAgICAgICAgIGNoZWNrSWQ6c3RyaW5nLCBjaGVja05hbWU6c3RyaW5nLCBtZW51O1xuICAgICAgICBpZiAodGhpcy5jaGVja2JveFdpdGhJRCkge1xuICAgICAgICAgICAgY2hlY2tJZCA9IHRoaXMuY2hlY2tib3hXaXRoSUQuY2FsbCh0aGlzLmdyaWRTcGVjLCBpZCk7XG4gICAgICAgICAgICBjaGVja05hbWUgPSB0aGlzLmNoZWNrYm94TmFtZSB8fCBjaGVja0lkO1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveEVsZW1lbnQuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2NoZWNrYm94Jyk7XG4gICAgICAgICAgICAkKHRoaXMuY2hlY2tib3hFbGVtZW50KS5hdHRyKHtcbiAgICAgICAgICAgICAgICAnaWQnOiBjaGVja0lkLCAnbmFtZSc6IGNoZWNrTmFtZSwgJ3ZhbHVlJzogaWQudG9TdHJpbmcoKVxuICAgICAgICAgICAgfSkuYXBwZW5kVG8oYyk7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnRDb250YWluZXJFbGVtZW50ID0gJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsIGNoZWNrSWQpLmFwcGVuZFRvKGMpWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Q29udGFpbmVyRWxlbWVudCA9ICQoJzxzcGFuPicpLmFwcGVuZFRvKGMpWzBdO1xuICAgICAgICB9XG4gICAgICAgICQodGhpcy5jb250ZW50Q29udGFpbmVyRWxlbWVudCkuaHRtbCh0aGlzLmNvbnRlbnRTdHJpbmcpO1xuICAgICAgICB0aGlzLmNvbnRlbnRGdW5jdGlvbi5jYWxsKHRoaXMuZ3JpZFNwZWMsIHRoaXMuY29udGVudENvbnRhaW5lckVsZW1lbnQsIGlkKTtcbiAgICAgICAgaWYgKHRoaXMuc2lkZU1lbnVJdGVtcyAmJiB0aGlzLnNpZGVNZW51SXRlbXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBtZW51ID0gJCgnPHVsPicpLmFkZENsYXNzKCdwb3B1cG1lbnUnKS5hcHBlbmRUbyhjKTtcbiAgICAgICAgICAgIHRoaXMuc2lkZU1lbnVJdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgICAgICAgJCgnPGxpPicpLmh0bWwoaXRlbSkuYXBwZW5kVG8obWVudSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjZWxsQ2xhc3NlcyA9IFtdO1xuXG4gICAgICAgIGlmICh0aGlzLmNvbHNwYW4gPiAxKSB7XG4gICAgICAgICAgICBjLnNldEF0dHJpYnV0ZSgnY29sc3BhbicsIHRoaXMuY29sc3Bhbi50b1N0cmluZygxMCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnJvd3NwYW4gPiAxKSB7XG4gICAgICAgICAgICBjLnNldEF0dHJpYnV0ZSgncm93c3BhbicsIHRoaXMucm93c3Bhbi50b1N0cmluZygxMCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmN1c3RvbUlEKSB7XG4gICAgICAgICAgICBjLnNldEF0dHJpYnV0ZSgnaWQnLCB0aGlzLmN1c3RvbUlELmNhbGwodGhpcy5ncmlkU3BlYywgaWQpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmhvdmVyRWZmZWN0KSB7XG4gICAgICAgICAgICBjZWxsQ2xhc3Nlcy5wdXNoKCdwb3B1cGNlbGwnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNlbGxDbGFzc2VzLnB1c2goJ25vd3JhcCcpO1xuXG4gICAgICAgIGlmICh0aGlzLm1pbldpZHRoKSB7XG4gICAgICAgICAgICBjLnN0eWxlLm1pbldpZHRoID0gdGhpcy5taW5XaWR0aCArICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMubWF4V2lkdGgpIHtcbiAgICAgICAgICAgIGMuc3R5bGUubWF4V2lkdGggPSB0aGlzLm1heFdpZHRoICsgJ3B4JztcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5hbGlnbikge1xuICAgICAgICAgICAgYy5zdHlsZS50ZXh0QWxpZ24gPSB0aGlzLmFsaWduO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnZhbGlnbikge1xuICAgICAgICAgICAgYy5zdHlsZS52ZXJ0aWNhbEFsaWduID0gdGhpcy52YWxpZ247XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuaGlkZGVuKSB7XG4gICAgICAgICAgICBjZWxsQ2xhc3Nlcy5wdXNoKCdvZmYnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjZWxsQ2xhc3Nlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjLmNsYXNzTmFtZSA9IGNlbGxDbGFzc2VzLmpvaW4oJyAnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNlbGxFbGVtZW50ID0gYztcbiAgICAgICAgdGhpcy5jZWxsRWxlbWVudEpRID0gJChjKTtcblxuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50ID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIGdldEVsZW1lbnQoKTpIVE1MRWxlbWVudCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2VsbEVsZW1lbnQ7XG4gICAgfVxuXG5cbiAgICBnZXRDaGVja2JveEVsZW1lbnQoKTpIVE1MSW5wdXRFbGVtZW50IHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50KSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jaGVja2JveEVsZW1lbnQgfHwgbnVsbDtcbiAgICB9XG5cblxuICAgIGhpZGUoKTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmhpZGRlbikge1xuICAgICAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNlbGxFbGVtZW50SlEuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5oaWRkZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICB1bmhpZGUoKTp2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaGlkZGVuKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2VsbEVsZW1lbnRKUS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cbi8vIEEgcGxhY2Vob2xkZXIgY2VsbCB3aGVuIGRhdGEgaXMgc3RpbGwgbG9hZGluZ1xuY2xhc3MgRGF0YUdyaWRMb2FkaW5nQ2VsbCBleHRlbmRzIERhdGFHcmlkRGF0YUNlbGwge1xuICAgIGNvbnN0cnVjdG9yKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGlkOnN0cmluZywgb3B0Pzp7W2luZGV4OnN0cmluZ106YW55fSkge1xuICAgICAgICBzdXBlcihncmlkU3BlYywgaWQsIG9wdCk7XG4gICAgICAgIHRoaXMuY29udGVudFN0cmluZyA9ICc8c3BhbiBjbGFzcz1cImxvYWRpbmdcIj5Mb2FkaW5nLi4uPC9zcGFuPic7XG4gICAgfVxufVxuXG5cbi8vIEEgZ2VuZXJhbCBjbGFzcyB0aGF0IGFjdHMgYXMgYSBjb21tb24gcmVwb3NpdG9yeSBmb3IgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIERhdGFHcmlkIHdpZGdldHMuXG4vLyBJdCBpcyBpbW1lZGlhdGVseSBzdWJjbGFzc2VkIGludG8gRGF0YUdyaWRPcHRpb25XaWRnZXQgYW5kIERhdGFHcmlkSGVhZGVyV2lkZ2V0LlxuY2xhc3MgRGF0YUdyaWRXaWRnZXQge1xuXG4gICAgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2U7XG4gICAgZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZDtcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlKSB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdCA9IGRhdGFHcmlkT3duZXJPYmplY3Q7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRTcGVjID0gZGF0YUdyaWRTcGVjO1xuICAgIH1cblxuXG4gICAgLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBjcmVhdGUgYSBsYWJlbCBlbGVtZW50XG4gICAgX2NyZWF0ZUxhYmVsKHRleHQ6c3RyaW5nLCBpZDpzdHJpbmcpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgdmFyIGxhYmVsOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxhYmVsXCIpO1xuICAgICAgICBsYWJlbC5zZXRBdHRyaWJ1dGUoJ2ZvcicsIGlkKTtcbiAgICAgICAgbGFiZWwuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCkpO1xuICAgICAgICByZXR1cm4gbGFiZWw7XG4gICAgfVxuXG5cbiAgICAvLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGNoZWNrYm94IGVsZW1lbnRcbiAgICBfY3JlYXRlQ2hlY2tib3goaWQ6c3RyaW5nLCBuYW1lOnN0cmluZywgdmFsdWU6c3RyaW5nKTpIVE1MSW5wdXRFbGVtZW50IHtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnaWQnLCBpZCk7XG4gICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnbmFtZScsIG5hbWUpO1xuICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnY2hlY2tib3gnKTtcbiAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIGNiO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2l0aCBhbiBhcnJheSBvZiByb3cgZWxlbWVudHMsIGFuZCB0aGUgSUQgdGhleSByZXByZXNlbnQsIHNvIHRoZSB3aWRnZXQgY2FuXG4gICAgLy8gIGFwcGx5IGFueSBjdXN0b20gc3R5bGluZyBpdCBuZWVkcy4gSXQgaXMgY2FsbGVkIG9uZSB0aW1lIGZvciBlYWNoIElEIGFuZCByZXNwZWN0aXZlIHJvd1xuICAgIC8vICBhcnJheSwgZHVyaW5nIHRoZSBjb25zdHJ1Y3Rpb24gb2YgdGhlIHRhYmxlIHJvd3MuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6RGF0YUdyaWREYXRhUm93W10sIHJvd0lEOnN0cmluZyk6dm9pZCB7XG4gICAgICAgIC8vIG5vIHNwZWNpYWwgZm9ybWF0dGluZyBieSBkZWZhdWx0XG4gICAgfVxuXG5cbiAgICAvLyBOb3RpZnkgdGhlIHdpZGdldCB0aGF0IHRoZSBEYXRhR3JpZCBoYXMgYmVlbiB1cGRhdGVkXG4gICAgcmVmcmVzaFdpZGdldCgpOnZvaWQge1xuICAgICAgICAvLyBub3RoaW5nIGJ5IGRlZmF1bHRcbiAgICB9XG59XG5cblxuXG4vLyBUaGlzIGlzIHRoZSBiYXNlIGNsYXNzIGZvciBhZGRpdGlvbmFsIHdpZGdldHMgdGhhdCBhcHBlYXIgaW4gdGhlIG9wdGlvbnMgbWVudSBvZiBhIERhdGFHcmlkIHRhYmxlLlxuLy8gVGhlIGRlZmF1bHQgYmVoYXZpb3IgaXMgdG8gY3JlYXRlIGEgY2hlY2tib3ggZWxlbWVudCB3aXRoIGEgY2FsbGJhY2ssIGFuZCBwYWlyIGl0IHdpdGggYSBsYWJlbCBlbGVtZW50LlxuLy9cbi8vIEVhY2ggRGF0YUdyaWRPcHRpb25XaWRnZXQgbmVlZHMgdG8gaW1wbGVtZW50IGFuIGFwcGx5RmlsdGVyVG9JRHMgZnVuY3Rpb24gdG8gcHJvdmlkZSBzb21lIG1ldGhvZCBmb3IgZmlsdGVyaW5nXG4vLyBhIGdpdmVuIGxpc3Qgb2YgSURzLiAgVGhpcyBpcyBob3cgdGhlIHdpZGdldCBhZmZlY3RzIHdoaWNoIHJvd3MgYXJlIGRpc3BsYXllZCBpbiB0aGUgdGFibGUuXG4vL1xuLy8gVGhlIERhdGFHcmlkU3BlYyBpcyByZXNwb25zaWJsZSBmb3IgaW5zdGFudGlhdGluZyB0aGVzZSBEYXRhR3JpZE9wdGlvbldpZGdldC1kZXJpdmVkIG9iamVjdHMgZm9yIGEgcGFydGljdWxhciB0YWJsZSxcbi8vIGFuZCB0aGUgRGF0YUdyaWQgb2JqZWN0IGlzIHJlc3BvbnNpYmxlIGZvciBidWlsZGluZyB0aGUgb3B0aW9ucyBtZW51IHRoYXQgd2lsbCBzdG9yZSB0aGUgY2hlY2tib3ggYW5kIGxhYmVsIGVsZW1lbnRzLlxuY2xhc3MgRGF0YUdyaWRPcHRpb25XaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZFdpZGdldCB7XG5cbiAgICBfY3JlYXRlZEVsZW1lbnRzOmJvb2xlYW47XG4gICAgLy8gVGhlIGJhc2UgRGF0YUdyaWRPcHRpb25XaWRnZXQgcHJvdmlkZXMgdGVtcGxhdGUgY29kZSBhbmQgc3RydWN0dXJlIGZvciBjcmVhdGluZyBhIGNoZWNrYm94IHdpdGggYSBsYWJlbCxcbiAgICAvLyBidXQgb3RoZXIgVUkgY2FuIGJlIGNyZWF0ZWQgYW5kIHVzZWQgaW5zdGVhZC5cbiAgICBjaGVja0JveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcbiAgICBsYWJlbEVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSBmYWxzZTtcbiAgICB9XG5cblxuICAgIC8vIFJldHVybiBhIGZyYWdtZW50IHRvIHVzZSBpbiBnZW5lcmF0aW5nIG9wdGlvbiB3aWRnZXQgSURzXG4gICAgZ2V0SURGcmFnbWVudCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnR2VuZXJpY09wdGlvbkNCJztcbiAgICB9XG5cblxuICAgIC8vIFJldHVybiB0ZXh0IHVzZWQgdG8gbGFiZWwgdGhlIHdpZGdldFxuICAgIGdldExhYmVsVGV4dCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnTmFtZSBPZiBPcHRpb24nO1xuICAgIH1cblxuXG4gICAgLy8gSGFuZGxlIGFjdGl2YXRpb24gb2Ygd2lkZ2V0XG4gICAgb25XaWRnZXRDaGFuZ2UoZSk6dm9pZCB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkK3RoaXMuZ2V0SURGcmFnbWVudCgpK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgIC8vIFdlIG5lZWQgdG8gbWFrZSBzdXJlIHRoZSBjaGVja2JveCBoYXMgYSBjYWxsYmFjayB0byB0aGUgRGF0YUdyaWQncyBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAvLyBBbW9uZyBvdGhlciB0aGluZ3MsIHRoZSBoYW5kbGVyIGZ1bmN0aW9uIHdpbGwgY2FsbCB0aGUgYXBwcm9wcmlhdGUgZmlsdGVyaW5nIGZ1bmN0aW9ucyBmb3IgYWxsIHRoZSB3aWRnZXRzIGluIHR1cm4uXG4gICAgICAgICQoY2IpLm9uKCdjaGFuZ2UuZGF0YWdyaWQnLCAoZSkgPT4gdGhpcy5vbldpZGdldENoYW5nZShlKSApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKHRoaXMuZ2V0TGFiZWxUZXh0KCksIGNiSUQpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuX2NyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuY2hlY2tCb3hFbGVtZW50KTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMubGFiZWxFbGVtZW50KTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdpdGggYW4gYXJyYXkgb2YgSURzIGZvciBmaWx0ZXJpbmcsIGFuZCBhIGZpbHRlcmVkIGFycmF5IGlzIHJldHVybmVkLlxuICAgIC8vIEl0IGlzIGFjY2VwdGFibGUgdG8ganVzdCByZXR1cm4gdGhlIG9yaWdpbmFsIGFycmF5IGlmIG5vIGZpbHRlcmluZyBuZWVkcyB0byBiZSBkb25lLlxuICAgIC8vXG4gICAgLy8gSXQncyB1cCB0byB0aGUgZGVzaWduZXIgdG8gZGVjaWRlIGhvdyB0aGUgc3RhdGUgb2YgdGhlIHdpZGdldCBhZmZlY3RzIGZpbHRlcmluZy5cbiAgICAvLyBGb3IgZXhhbXBsZSwgaWYgdGhlIHdpZGdldCBpcyBcImFkZGl0aXZlXCIsIHlvdSB3b3VsZCBhcHBseSBmaWx0ZXJpbmcgaWYgdGhlIHdpZGdldCdzIGNoZWNrYm94XG4gICAgLy8gaXMgY2xlYXIsIGFuZCBza2lwIGZpbHRlcmluZyBpZiB0aGUgY2hlY2tib3ggaXMgc2V0LCBjcmVhdGluZyB0aGUgYXBwZWFyYW5jZSBvZiBhIGNoZWNrYm94XG4gICAgLy8gdGhhdCBcImFkZHNcIiByb3dzIHdoZW4gY2hlY2tlZC5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gcm93SURzO1xuICAgIH1cblxuXG4gICAgLy8gUmV0dXJucyB0cnVlIGlmIHRoZSBjb250cm9sIGlzIGVuYWJsZWRcbiAgICBnZXRTdGF0ZSgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGVja0JveEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGVja2VkJyk7XG4gICAgfVxuXG5cbiAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyb2wgc2hvdWxkIGJlIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgIGlzRW5hYmxlZEJ5RGVmYXVsdCgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG5cbiAgICAvLyBTZXRzIHRoZSBlbmFibGVkIHN0YXRlIHRvIHRydWUgb3IgZmFsc2UsIGJhc2VkIG9uIHRoZSBnaXZlbiB2YWx1ZVxuICAgIHNldFN0YXRlKGVuYWJsZWQ6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIGlmIChlbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG4vLyBUaGlzIGlzIHRoZSBiYXNlIGNsYXNzIGZvciBhZGRpdGlvbmFsIHdpZGdldHMgdGhhdCBhcHBlYXIgaW4gdGhlIGhlYWRlciBhcmVhIG9mIGEgRGF0YUdyaWQgdGFibGUuXG4vL1xuLy8gVGhlIERhdGFHcmlkU3BlYyBpcyByZXNwb25zaWJsZSBmb3IgaW5zdGFudGlhdGluZyB0aGVzZSBEYXRhR3JpZE9wdGlvbldpZGdldC1kZXJpdmVkIG9iamVjdHMgZm9yIGEgcGFydGljdWxhciB0YWJsZSxcbi8vIGFuZCB0aGUgRGF0YUdyaWQgb2JqZWN0IGlzIHJlc3BvbnNpYmxlIGZvciBidWlsZGluZyB0aGUgaGVhZGVyIGFyZWEgdGhhdCB3aWxsIGNvbnRhaW4gdGhlIHdpZGdldHMuXG5jbGFzcyBEYXRhR3JpZEhlYWRlcldpZGdldCBleHRlbmRzIERhdGFHcmlkV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgX2NyZWF0ZWRFbGVtZW50czpib29sZWFuO1xuICAgIC8vIFdoZXRoZXIgdG8gYWRkIHRoaXMgd2lkZ2V0IHRvIHRoZSBoZWFkZXIgb2YgdGhlIHRhYmxlIGJlZm9yZSB0aGUgdmlldyBtZW51LCBpbnN0ZWFkIG9mIHRoZSBkZWZhdWx0IG9mIGFmdGVyLlxuICAgIC8vIFRoaXMgb3B0aW9uIGlzIHNldCBieSBhbiBhY2Nlc3NvciBmdW5jdGlvbiBtZWFudCB0byBiZSBjYWxsZWQgc2hvcnRseSBhZnRlciBpbnN0YW50aWF0aW9uLlxuICAgIHByaXZhdGUgX2Rpc3BsYXlCZWZvcmVWaWV3TWVudUZsYWc6Ym9vbGVhbjtcbiAgICAvLyBUaGUgYmFzZSBEYXRhR3JpZEhlYWRlcldpZGdldCBwcm92aWRlcyB0ZW1wbGF0ZSBjb2RlIHRoYXQganVzdCBjcmVhdGVzIGEgdGV4dCBmaWVsZCxcbiAgICAvLyBidXQgb3RoZXIgVUkgY2FuIGJlIGNyZWF0ZWQgYW5kIHVzZWQgaW5zdGVhZC5cbiAgICBlbGVtZW50OkhUTUxFbGVtZW50O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLl9kaXNwbGF5QmVmb3JlVmlld01lbnVGbGFnID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IGZhbHNlO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIHRCb3hJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAndGV4dCcgKyB1bmlxdWVJRDtcbiAgICAgICAgdmFyIHRCb3ggPSAkKHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSlcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogdEJveElELCAnbmFtZSc6IHRCb3hJRCwgJ3NpemUnOiAnMjAnIH0pXG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ3RhYmxlQ29udHJvbCcpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuX2NyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICB9XG5cblxuICAgIGNyZWF0ZWRFbGVtZW50cygpOmJvb2xlYW47XG4gICAgY3JlYXRlZEVsZW1lbnRzKGZsYWc6Ym9vbGVhbik6RGF0YUdyaWRIZWFkZXJXaWRnZXQ7XG4gICAgY3JlYXRlZEVsZW1lbnRzKGZsYWc/OmJvb2xlYW4pOmFueSB7XG4gICAgICAgIGlmIChmbGFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jcmVhdGVkRWxlbWVudHM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSBmbGFnO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXaGV0aGVyIHRvIGFkZCB0aGlzIHdpZGdldCB0byB0aGUgaGVhZGVyIG9mIHRoZSB0YWJsZSBiZWZvcmUgdGhlIHZpZXcgbWVudSwgaW5zdGVhZCBvZiB0aGUgZGVmYXVsdCBvZiBhZnRlci5cbiAgICAvLyBQYXNzIGluIFwiZmFsc2VcIiB0byByZXZlcnNlIHRoZSBzZXR0aW5nLlxuICAgIGRpc3BsYXlCZWZvcmVWaWV3TWVudSgpOmJvb2xlYW47XG4gICAgZGlzcGxheUJlZm9yZVZpZXdNZW51KGZsYWc6Ym9vbGVhbik6RGF0YUdyaWRIZWFkZXJXaWRnZXQ7XG4gICAgZGlzcGxheUJlZm9yZVZpZXdNZW51KGZsYWc/OmJvb2xlYW4pOmFueSB7XG4gICAgICAgIGlmIChmbGFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9kaXNwbGF5QmVmb3JlVmlld01lbnVGbGFnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fZGlzcGxheUJlZm9yZVZpZXdNZW51RmxhZyA9IGZsYWc7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2l0aCBhbiBhcnJheSBvZiByZWNvcmQgSURzIGZvciBmaWx0ZXJpbmcsIGFuZCBhIGZpbHRlcmVkIGFycmF5IGlzIHJldHVybmVkLlxuICAgIC8vIEl0IGlzIGFjY2VwdGFibGUgdG8ganVzdCByZXR1cm4gdGhlIG9yaWdpbmFsIGFycmF5IGlmIG5vIHJlY29yZCBmaWx0ZXJpbmcgbmVlZHMgdG8gYmUgZG9uZS5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gcm93SURzO1xuICAgIH1cbn1cblxuXG5cbi8vIEEgZ2VuZXJpYyBcIlNlbGVjdCBBbGxcIiBoZWFkZXIgd2lkZ2V0LCBhcHBlYXJpbmcgYXMgYSBidXR0b24uXG4vLyBXaGVuIGNsaWNrZWQsIGl0IHdhbGtzIHRocm91Z2ggZXZlcnkgcm93IGFuZCBjZWxsIGxvb2tpbmcgZm9yIERhdGFHcmlkLWNyZWF0ZWQgY2hlY2tib3hlcyxcbi8vIGFuZCBjaGVja3MgZXZlcnkgb25lIGl0IGZpbmRzLlxuY2xhc3MgREdTZWxlY3RBbGxXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZEhlYWRlcldpZGdldCB7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIGJ1dHRvbklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCArICdTZWxBbGwnICsgdW5pcXVlSUQ7XG4gICAgICAgIHZhciBidXR0b24gPSAkKHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSk7XG4gICAgICAgIGJ1dHRvbi5hdHRyKHsgJ2lkJzogYnV0dG9uSUQsICduYW1lJzogYnV0dG9uSUQsICd2YWx1ZSc6ICdTZWxlY3QgQWxsJyB9KVxuICAgICAgICAgICAgLmFkZENsYXNzKCd0YWJsZUNvbnRyb2wnKVxuICAgICAgICAgICAgLmNsaWNrKCgpID0+IHRoaXMuY2xpY2tIYW5kbGVyKCkpO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2J1dHRvbicpOyAvLyBKUXVlcnkgYXR0ciBjYW5ub3QgZG8gdGhpc1xuICAgIH1cblxuXG4gICAgY2xpY2tIYW5kbGVyKCk6dm9pZCB7XG4gICAgICAgIHZhciBzZXF1ZW5jZSA9IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jdXJyZW50U2VxdWVuY2UoKTtcbiAgICAgICAgLy8gSGF2ZSBEYXRhR3JpZCBhcHBseSBmdW5jdGlvbiB0byBldmVyeXRoaW5nIGluIGN1cnJlbnQgc2VxdWVuY2VcbiAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmFwcGx5VG9SZWNvcmRTZXQoKHJvd3MpID0+IHtcbiAgICAgICAgICAgIC8vIGVhY2ggcm93IGluIHNlcXVlbmNlXG4gICAgICAgICAgICByb3dzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGVhY2ggY2VsbCBpbiByb3dcbiAgICAgICAgICAgICAgICByb3cuZGF0YUdyaWREYXRhQ2VsbHMuZm9yRWFjaCgoY2VsbCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgY2VsbCBoYXMgYSBjaGVja2JveCwgY2hlY2sgaXRcbiAgICAgICAgICAgICAgICAgICAgICQoY2VsbC5jaGVja2JveEVsZW1lbnQpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKS50cmlnZ2VyKCdjaGFuZ2UnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBzZXF1ZW5jZSk7XG4gICAgfVxufVxuXG4vLyBBIGdlbmVyaWMgXCJEZXNlbGVjdCBBbGxcIiBoZWFkZXIgd2lkZ2V0LCBhcHBlYXJpbmcgYXMgYSBidXR0b24uXG4vLyBXaGVuIGNsaWNrZWQsIGl0IHdhbGtzIHRocm91Z2ggZXZlcnkgcm93IGFuZCBjZWxsIGxvb2tpbmcgZm9yIERhdGFHcmlkLWNyZWF0ZWQgY2hlY2tib3hlcyxcbi8vIGFuZCBjaGVja3MgZXZlcnkgb25lIGl0IGZpbmRzLlxuY2xhc3MgREdEZXNlbGVjdEFsbFdpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9uc1xuICAgIC8vIHdoZW4gY3JlYXRpbmcgaW5wdXQgZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICB2YXIgYnV0dG9uSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkICsgJ0RlbEFsbCcgKyB1bmlxdWVJRDtcbiAgICAgICAgdmFyIGJ1dHRvbiA9ICQodGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpKTtcbiAgICAgICAgYnV0dG9uLmF0dHIoeyAnaWQnOiBidXR0b25JRCwgJ25hbWUnOiBidXR0b25JRCwgJ3ZhbHVlJzogJ0Rlc2VsZWN0IEFsbCcgfSlcbiAgICAgICAgICAgIC5hZGRDbGFzcygndGFibGVDb250cm9sJylcbiAgICAgICAgICAgIC5jbGljaygoKSA9PiB0aGlzLmNsaWNrSGFuZGxlcigpKTtcbiAgICAgICAgdGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgndHlwZScsICdidXR0b24nKTsgLy8gSlF1ZXJ5IGF0dHIgY2Fubm90IGRvIHRoaXNcbiAgICB9XG5cblxuICAgIGNsaWNrSGFuZGxlcigpOnZvaWQge1xuICAgICAgICB2YXIgc2VxdWVuY2UgPSB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY3VycmVudFNlcXVlbmNlKCk7XG4gICAgICAgIC8vIEhhdmUgRGF0YUdyaWQgYXBwbHkgZnVuY3Rpb24gdG8gZXZlcnl0aGluZyBpbiBjdXJyZW50IHNlcXVlbmNlXG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5hcHBseVRvUmVjb3JkU2V0KChyb3dzKSA9PiB7XG4gICAgICAgICAgICAvLyBlYWNoIHJvdyBpbiBzZXF1ZW5jZVxuICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBlYWNoIGNlbGwgaW4gcm93XG4gICAgICAgICAgICAgICAgcm93LmRhdGFHcmlkRGF0YUNlbGxzLmZvckVhY2goKGNlbGwpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIGNlbGwgaGFzIGEgY2hlY2tib3gsIHVuY2hlY2sgaXRcbiAgICAgICAgICAgICAgICAgICAgJChjZWxsLmNoZWNrYm94RWxlbWVudCkucHJvcCgnY2hlY2tlZCcsIGZhbHNlKS50cmlnZ2VyKCdjaGFuZ2UnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBzZXF1ZW5jZSk7XG4gICAgfVxufVxuXG5cbi8vIEhlcmUncyBhbiBleGFtcGxlIG9mIGEgd29ya2luZyBEYXRhR3JpZEhlYWRlcldpZGdldC5cbi8vIEl0J3MgYSBzZWFyY2ggZmllbGQgdGhhdCBuYXJyb3dzIHRoZSBzZXQgb2Ygcm93cyB0byBvbmVzIHRoYXQgY29udGFpbiB0aGUgZ2l2ZW4gc3RyaW5nLlxuY2xhc3MgREdTZWFyY2hXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZEhlYWRlcldpZGdldCB7XG5cbiAgICBzZWFyY2hCb3hFbGVtZW50OkhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgcGxhY2VIb2xkZXI6c3RyaW5nO1xuICAgIGZpZWxkU2l6ZTpudW1iZXI7XG4gICAgdHlwaW5nVGltZW91dDpudW1iZXI7XG4gICAgdHlwaW5nRGVsYXk6bnVtYmVyO1xuICAgIGxhc3RLZXlQcmVzc0NvZGU6bnVtYmVyO1xuICAgIHByZXZpb3VzU2VsZWN0aW9uOnN0cmluZztcbiAgICBtaW5DaGFyc1RvVHJpZ2dlclNlYXJjaDpudW1iZXI7XG4gICAgZ2V0c0ZvY3VzOmJvb2xlYW47ICAgIC8vIElmIHRydWUsIHRoZSBzZWFyY2ggYm94IHNob3VsZCBiZSBjb25maWd1cmVkIHRvIGNsYWltIGZvY3VzIGFzIHNvb24gYXMgdGhlIHBhZ2UgaXMgbG9hZGVkXG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLCBnZXRzRm9jdXM6Ym9vbGVhbikge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLnBsYWNlSG9sZGVyID0gcGxhY2VIb2xkZXI7XG4gICAgICAgIHRoaXMuZmllbGRTaXplID0gc2l6ZTtcbiAgICAgICAgdGhpcy5nZXRzRm9jdXMgPSBnZXRzRm9jdXM7XG4gICAgICAgIHRoaXMudHlwaW5nVGltZW91dCA9IG51bGw7XG4gICAgICAgIHRoaXMudHlwaW5nRGVsYXkgPSAzMzA7XG4gICAgICAgIHRoaXMubGFzdEtleVByZXNzQ29kZSA9IG51bGw7XG4gICAgICAgIHRoaXMucHJldmlvdXNTZWxlY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoID0gMTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zXG4gICAgLy8gd2hlbiBjcmVhdGluZyBpbnB1dCBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOnN0cmluZyk6dm9pZCB7XG4gICAgICAgIHZhciBzQm94SUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkICsgJ1NlYXJjaEJveCcgKyB1bmlxdWVJRDtcbiAgICAgICAgdmFyIHNCb3g6SlF1ZXJ5ID0gJCh0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIikpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6IHNCb3hJRCwgJ25hbWUnOiBzQm94SUQsICdzaXplJzogdGhpcy5maWVsZFNpemUsICdwbGFjZWhvbGRlcic6IHRoaXMucGxhY2VIb2xkZXIgfSlcbiAgICAgICAgICAgIC5hZGRDbGFzcygndGFibGVDb250cm9sIHNlYXJjaEJveCcpLmtleWRvd24oKGUpID0+IHRoaXMuaW5wdXRLZXlEb3duSGFuZGxlcihlKSk7XG4gICAgICAgIHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dCcpOyAvLyBKUXVlcnkgLmF0dHIoKSBjYW5ub3Qgc2V0IHRoaXNcbiAgICAgICAgaWYgKHRoaXMuZ2V0c0ZvY3VzKSB7XG4gICAgICAgICAgICBzQm94LmF0dHIoJ2F1dG9mb2N1cycsICdhdXRvZm9jdXMnKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgaW5wdXRLZXlEb3duSGFuZGxlcihlKSB7XG4gICAgICAgIC8vIHRyYWNrIGxhc3Qga2V5IHByZXNzZWRcbiAgICAgICAgdGhpcy5sYXN0S2V5UHJlc3NDb2RlID0gZS5rZXlDb2RlO1xuICAgICAgICBzd2l0Y2ggKGUua2V5Q29kZSkge1xuICAgICAgICAgICAgY2FzZSAzODogLy8gdXBcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDQwOiAvLyBkb3duXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSA5OiAgLy8gdGFiXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDEzOiAvLyByZXR1cm5cbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnR5cGluZ1RpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudHlwaW5nVGltZW91dCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudHlwaW5nVGltZW91dCA9IHNldFRpbWVvdXQodGhpcy50eXBpbmdEZWxheUV4cGlyYXRpb25IYW5kbGVyLCB0aGlzLnR5cGluZ0RlbGF5KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gKE5vdGU6IFRoaXMgc3ludGF4IGNhdXNlcyBcInRoaXNcIiB0byBiZWhhdmUgaW4gYSBub24tSmF2YXNjcmlwdCB3YXlcbiAgICAvLyBzZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xNjE1NzgzOS90eXBlc2NyaXB0LXRoaXMtaW5zaWRlLWEtY2xhc3MtbWV0aG9kIClcbiAgICB0eXBpbmdEZWxheUV4cGlyYXRpb25IYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbZGVsXSBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgLy9pZiAodGhpcy5sYXN0S2V5UHJlc3NDb2RlID09IDQ2KSB7XG4gICAgICAgIC8vICAgIHJldHVybjtcbiAgICAgICAgLy99XG4gICAgICAgIC8vIGlnbm9yZSBpZiB0aGUgZm9sbG93aW5nIGtleXMgYXJlIHByZXNzZWQ6IFtkZWxdIFtzaGlmdF0gW2NhcHNsb2NrXVxuICAgICAgICBpZiAodGhpcy5sYXN0S2V5UHJlc3NDb2RlID4gOCAmJiB0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPCAzMikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciB2ID0gJCh0aGlzLmVsZW1lbnQpLnZhbCgpO1xuICAgICAgICBpZiAodiA9PSB0aGlzLnByZXZpb3VzU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wcmV2aW91c1NlbGVjdGlvbiA9IHY7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkSGVhZGVyV2lkZ2V0KHRoaXMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2l0aCBhbiBhcnJheSBvZiByZWNvcmQgSURzIGZvciBmaWx0ZXJpbmcsIGFuZCBhIGZpbHRlcmVkIGFycmF5IGlzIHJldHVybmVkLlxuICAgIC8vIEl0IGlzIGFjY2VwdGFibGUgdG8ganVzdCByZXR1cm4gdGhlIG9yaWdpbmFsIGFycmF5IGlmIG5vIHJlY29yZCBmaWx0ZXJpbmcgbmVlZHMgdG8gYmUgZG9uZS5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIHZhciB2ID0gdGhpcy5wcmV2aW91c1NlbGVjdGlvbjtcbiAgICAgICAgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuICAgICAgICBpZiAodi5sZW5ndGggPCB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoKSB7XG4gICAgICAgICAgICByZXR1cm4gcm93SURzO1xuICAgICAgICB9XG5cbiAgICAgICAgdiA9IHYudHJpbSgpOyAgICAgICAgICAgICAgICAvLyBSZW1vdmUgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxuICAgICAgICB2ID0gdi50b0xvd2VyQ2FzZSgpO1xuICAgICAgICB2ID0gdi5yZXBsYWNlKC9cXHNcXHMqLywgJyAnKTsgLy8gUmVwbGFjZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIHdpdGggc2luZ2xlIHNwYWNlc1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSB3b3Jkcywgd2UgbG9vayBmb3IgZWFjaCBzZXBhcmF0ZWx5LCBidXQgZXhwZWN0IHRvIGZpbmQgYWxsIG9mIHRoZW0uXG4gICAgICAgIC8vIFdlIHdpbGwgbm90IGF0dGVtcHQgdG8gbWF0Y2ggYWdhaW5zdCBlbXB0eSBzdHJpbmdzLCBzbyB3ZSBmaWx0ZXIgdGhvc2Ugb3V0IGlmIGFueSBzbGlwcGVkIHRocm91Z2guXG4gICAgICAgIHZhciBxdWVyeVN0cnMgPSB2LnNwbGl0KCcgJykuZmlsdGVyKChvbmUpID0+IHsgcmV0dXJuIG9uZS5sZW5ndGggPiAwOyB9KTtcbiAgICAgICAgaWYgKHF1ZXJ5U3Rycy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuYXBwbHlUb1JlY29yZFNldCgocm93cywgaWQpID0+IHtcbiAgICAgICAgICAgIHZhciB0aGlzUmVjb3JkUXVlcnlTdHJzID0gcXVlcnlTdHJzO1xuICAgICAgICAgICAgLy8gR28gcm93IGJ5IHJvdywgY2VsbCBieSBjZWxsLCB0ZXN0aW5nIGVhY2ggcXVlcnkgdW50aWwgaXQgbWF0Y2hlcyxcbiAgICAgICAgICAgIC8vIHVudGlsIHdlIHJ1biBvdXQgb2YgdW5tYXRjaGVkIHF1ZXJpZXMgKGFuZCByZXR1cm4gdHJ1ZSkgb3IgcnVuIG91dFxuICAgICAgICAgICAgLy8gb2Ygcm93cyBhbmQgY2VsbHMgKGFuZCByZXR1cm4gZmFsc2UpLlxuICAgICAgICAgICAgdmFyIHJvd3NNYXRjaCA9IHJvd3Muc29tZSgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJvdy5kYXRhR3JpZERhdGFDZWxscy5zb21lKChjZWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY2VsbC5jcmVhdGVkRWxlbWVudCkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRleHQgPSBjZWxsLmNvbnRlbnRDb250YWluZXJFbGVtZW50LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB1bm1hdGNoZWRRdWVyeVN0cnMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1JlY29yZFF1ZXJ5U3Rycy5mb3JFYWNoKChxdWVyeVN0cikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRleHQubGVuZ3RoIDwgcXVlcnlTdHIubGVuZ3RoIHx8IHRleHQuaW5kZXhPZihxdWVyeVN0cikgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5tYXRjaGVkUXVlcnlTdHJzLnB1c2gocXVlcnlTdHIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVubWF0Y2hlZFF1ZXJ5U3Rycy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpc1JlY29yZFF1ZXJ5U3RycyA9IHVubWF0Y2hlZFF1ZXJ5U3RycztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAocm93c01hdGNoKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHJvd0lEcyk7XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZElEcztcbiAgICB9XG59XG5cblxuY2xhc3MgRGF0YUdyaWRTb3J0IHtcbiAgICBzcGVjOkRhdGFHcmlkSGVhZGVyU3BlYztcbiAgICBhc2M6Ym9vbGVhbjtcbn1cbmludGVyZmFjZSBER1BhZ2VEYXRhU291cmNlIHtcblxuICAgIHBhZ2VTaXplKCk6bnVtYmVyO1xuICAgIHBhZ2VTaXplKHNpemU6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHBhZ2VTaXplKHNpemU/Om51bWJlcik6YW55O1xuICAgIHRvdGFsT2Zmc2V0KCk6bnVtYmVyO1xuICAgIHRvdGFsT2Zmc2V0KG9mZnNldDpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgdG90YWxPZmZzZXQob2Zmc2V0PzpudW1iZXIpOmFueTtcbiAgICB0b3RhbFNpemUoKTpudW1iZXI7XG4gICAgdG90YWxTaXplKHNpemU6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHRvdGFsU2l6ZShzaXplPzpudW1iZXIpOmFueTtcbiAgICB2aWV3U2l6ZSgpOm51bWJlcjtcbiAgICBxdWVyeSgpOnN0cmluZztcbiAgICBxdWVyeShxdWVyeTpzdHJpbmcpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgcXVlcnkocXVlcnk/OnN0cmluZyk6YW55O1xuICAgIGZpbHRlcigpOmFueTtcbiAgICBmaWx0ZXIob3B0OmFueSk6REdQYWdlRGF0YVNvdXJjZTtcbiAgICBmaWx0ZXIob3B0PzphbnkpOmFueTtcbiAgICBwYWdlRGVsdGEoZGVsdGE6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHJlcXVlc3RQYWdlT2ZEYXRhKGNhbGxiYWNrPzooc3VjY2Vzczpib29sZWFuKSA9PiB2b2lkKTpER1BhZ2VEYXRhU291cmNlO1xuXG59XG5cblxuXG4vLyBUaGlzIGlzIGEgd2lkZ2V0IHRoYXQgd2lsbCBwbGFjZSBjb250cm9scyBmb3IgcGFnaW5nXG5jbGFzcyBER1BhZ2luZ1dpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgc291cmNlOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgcHJpdmF0ZSB3aWRnZXRFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgbGFiZWxFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgbmV4dEVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBwcmV2RWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHJlcXVlc3REb25lOihzdWNjZXNzOmJvb2xlYW4pID0+IHZvaWQgPSAoc3VjY2Vzczpib29sZWFuKTp2b2lkID0+IHtcbiAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgc291cmNlOkRHUGFnZURhdGFTb3VyY2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5zb3VyY2UgPSBzb3VyY2U7XG4gICAgICAgIHRoaXMuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgICQodGhpcy53aWRnZXRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuICAgICAgICAgICAgJCgnLnNlYXJjaFN0dWRpZXMnKS5hcHBlbmQodGhpcy53aWRnZXRFbGVtZW50KTtcbiAgICAgICAgICAgICQodGhpcy5sYWJlbEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJykpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKHRoaXMud2lkZ2V0RWxlbWVudCk7XG4gICAgICAgICAgICAkKHRoaXMucHJldkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJykpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2hyZWYnLCAnIycpLmNzcygnbWFyZ2luJywgJzAgNXB4JylcbiAgICAgICAgICAgICAgICAudGV4dCgnPCBQcmV2aW91cycpLmFkZENsYXNzKCdkaXNhYmxlTGluaycpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKHRoaXMud2lkZ2V0RWxlbWVudClcbiAgICAgICAgICAgICAgICAuY2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZS5wYWdlRGVsdGEoLTEpLnJlcXVlc3RQYWdlT2ZEYXRhKHRoaXMucmVxdWVzdERvbmUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkKHRoaXMubmV4dEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJykpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2hyZWYnLCAnIycpLmNzcygnbWFyZ2luJywgJzAgNXB4JylcbiAgICAgICAgICAgICAgICAudGV4dCgnTmV4dCA+JykucHJvcCgnZGlzYWJsZWQnLCB0cnVlKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aGlzLndpZGdldEVsZW1lbnQpXG4gICAgICAgICAgICAgICAgLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VyY2UucGFnZURlbHRhKDEpLnJlcXVlc3RQYWdlT2ZEYXRhKHRoaXMucmVxdWVzdERvbmUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICAgICAgICAgICQodGhpcy53aWRnZXRFbGVtZW50KS5hZGRDbGFzcygnc3R1ZHlQcmV2TmV4dCcpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgfVxuXG4gICAgcmVmcmVzaFdpZGdldCgpIHtcbiAgICAgICAgdmFyIHRvdGFsU2l6ZTpudW1iZXIgPSB0aGlzLnNvdXJjZS50b3RhbFNpemUoKTtcbiAgICAgICAgdmFyIHZpZXdTaXplOm51bWJlciA9IHRoaXMuc291cmNlLnZpZXdTaXplKCk7XG4gICAgICAgIHZhciBzdGFydDpudW1iZXIgPSB0aGlzLnNvdXJjZS50b3RhbE9mZnNldCgpO1xuICAgICAgICB2YXIgbGFiZWxUZXh0O1xuICAgICAgICBpZiAodG90YWxTaXplKSB7XG4gICAgICAgICAgICBsYWJlbFRleHQgPSBbICdEaXNwbGF5aW5nICcsIHN0YXJ0ICsgMSwgJy0nLCBzdGFydCArIHZpZXdTaXplLCAnIG9mICcsIHRvdGFsU2l6ZSBdLmpvaW4oJycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGFiZWxUZXh0ID0gJ05vIHJlc3VsdHMgZm91bmQhJztcbiAgICAgICAgfVxuICAgICAgICAkKHRoaXMubGFiZWxFbGVtZW50KS50ZXh0KGxhYmVsVGV4dCk7XG4gICAgICAgIGlmICghc3RhcnQpIHtcbiAgICAgICAgICAgJCh0aGlzLnByZXZFbGVtZW50KS5hZGRDbGFzcygnZGlzYWJsZUxpbmsnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQodGhpcy5wcmV2RWxlbWVudCkucmVtb3ZlQ2xhc3MoJ2Rpc2FibGVMaW5rJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN0YXJ0ICsgdmlld1NpemUgPj0gdG90YWxTaXplKSB7XG4gICAgICAgICAgICAkKHRoaXMubmV4dEVsZW1lbnQpLmFkZENsYXNzKCdkaXNhYmxlTGluaycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCh0aGlzLm5leHRFbGVtZW50KS5yZW1vdmVDbGFzcygnZGlzYWJsZUxpbmsnKTtcbiAgICAgICAgfVxuXG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBUYWJsZVNwZWMgb2JqZWN0IHVzZWQgYnkgRGF0YUdyaWRTcGVjQmFzZVxuY2xhc3MgRGF0YUdyaWRUYWJsZVNwZWMge1xuXG4gICAgbmFtZTpzdHJpbmc7ICAgICAgICAgICAgLy8gTGFiZWwgdG8gcHV0IGluIHRoZSB0aXRsZSBoZWFkZXJcbiAgICBpZDpzdHJpbmc7ICAgICAgICAgICAgICAvLyBBIHVuaXF1ZSBJRCBzdHJpbmcgZm9yIHRoaXMgdGFibGUsIHRvIGNhdCB3aXRoIG90aGVyIElEIHN0cmluZ3MgZm9yIGdlbmVyYXRlZCB0YWJsZSBlbGVtZW50c1xuICAgIGRlZmF1bHRTb3J0Om51bWJlcjsgICAgIC8vIEluZGV4IG9mIGhlYWRlciB0byBzb3J0IGJ5IGRlZmF1bHRcbiAgICBzaG93SGVhZGVyOmJvb2xlYW47ICAgICAvLyBXaGV0aGVyIHRvIGNyZWF0ZSBhIGhlYWRlciBhcmVhIGF0IHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgYXBwbHlTdHJpcGluZzpib29sZWFuOyAgLy8gV2hldGhlciB0byBhcHBseSBob3Jpem9udGFsIHN0cmlwaW5nIHN0eWxlcyB0byBhbHRlcm5hdGUgcm93c1xuXG4gICAgY29uc3RydWN0b3IoaWQ6c3RyaW5nLCBvcHQ/OntbaW5kZXg6c3RyaW5nXTphbnl9KSB7XG4gICAgICAgIHRoaXMuaWQgPSBpZDsgICAgICAgLy8gSUQgaXMgcmVxdWlyZWQsIGluaXRpYWxpemUgc2Vuc2libGUgZGVmYXVsdHMgZm9yIGV2ZXJ5dGhpbmcgZWxzZVxuICAgICAgICBvcHQgPSAkLmV4dGVuZCh7ICduYW1lJzogJycsICdkZWZhdWx0U29ydCc6IDAsICdzaG93SGVhZGVyJzogdHJ1ZSwgJ2FwcGx5U3RyaXBpbmcnOiB0cnVlIH0sIG9wdCk7XG4gICAgICAgIHRoaXMubmFtZSA9IG9wdFsnbmFtZSddO1xuICAgICAgICB0aGlzLmRlZmF1bHRTb3J0ID0gb3B0WydkZWZhdWx0U29ydCddO1xuICAgICAgICB0aGlzLnNob3dIZWFkZXIgPSBvcHRbJ3Nob3dIZWFkZXInXTtcbiAgICAgICAgdGhpcy5hcHBseVN0cmlwaW5nID0gb3B0WydhcHBseVN0cmlwaW5nJ107XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBIZWFkZXJTcGVjIG9iamVjdCB1c2VkIGJ5IERhdGFHcmlkU3BlY0Jhc2VcbmNsYXNzIERhdGFHcmlkSGVhZGVyU3BlYyB7XG4gICAgbmFtZTpzdHJpbmc7ICAgICAgICAgICAgLy8gVGhlIG5hbWUgdGhhdCBhcHBlYXJzIGluIHRoZSBoZWFkZXIgY2VsbCwgYW5kIGluIHRoZSBjb2x1bW4gc2hvdy9oaWRlIHdpZGdldFxuICAgIGlkOnN0cmluZzsgICAgICAgICAgICAgIC8vIEFuIElEIHRvIGFzc2lnbiB0byB0aGUgZWxlbWVudFxuICAgIGFsaWduOnN0cmluZzsgICAgICAgICAgIC8vIFRPRE86IHNob3VsZCBiZSBhbiBlbnVtIHR5cGUgb2Y6ICdsZWZ0JywgJ3JpZ2h0JywgJ2NlbnRlcidcbiAgICB2YWxpZ246c3RyaW5nOyAgICAgICAgICAvLyBUT0RPOiBzaG91bGQgYmUgYW4gZW51bSB0eXBlIG9mOiAndG9wJywgJ21pZGRsZScsICdib3R0b20nLCAnYmFzZWxpbmUnXG4gICAgbm93cmFwOmJvb2xlYW47ICAgICAgICAgLy8gSWYgc2V0LCBhZGQgYSBzdHlsZSB0aGF0IHByZXZlbnRzIGxvbmcgc3RyaW5ncyBmcm9tIHdyYXBwaW5nIGluIHRoZSBjZWxsXG4gICAgcm93c3BhbjpudW1iZXI7ICAgICAgICAgLy8gTnVtYmVyIHRvIHB1dCBpbiBhIHJvd3NwYW4gZm9yIHRoZSBoZWFkZXIuXG4gICAgY29sc3BhbjpudW1iZXI7ICAgICAgICAgLy8gTnVtYmVyIHRvIHB1dCBpbiBhIGNvbHNwYW4gZm9yIHRoZSBoZWFkZXIuXG4gICAgaGVhZGVyUm93Om51bWJlcjsgICAgICAgLy8gV2hpY2ggcm93IHRvIHBsYWNlIHRoaXMgaGVhZGVyIGluLCBzdGFydGluZyB3aXRoIDEgYXMgdGhlIGZpcnN0IHJvdy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBVc2VkIHdoZW4gY29uc3RydWN0aW5nIG11bHRpLXJvdyBoZWFkZXIgc2VjdGlvbnMgdGhhdCB1c2Ugcm93c3BhbiBhbmQgY29sc3BhbiB0YWdzIHRvIG1ha2Ugc3ViLWhlYWRlcnMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSGVhZGVycyBhcmUgaW5zZXJ0ZWQgaW50byB0aGVpciBpbmRpY2F0ZWQgcm93cyBpbiB0aGUgc2FtZSByZWxhdGl2ZSBvcmRlciBhcyB0aGV5IGFyZSBsaXN0ZWQgaW4gdGhpcyBzcGVjLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIExlYXZpbmcgdGhpcyBvdXQgd2lsbCBwbGFjZSB0aGUgaGVhZGVyIGluIHRoZSBmaXJzdCByb3cuXG4gICAgY29sdW1uR3JvdXA6bnVtYmVyOyAgICAgLy8gVGhlIGNvbHVtbiBncm91cCB0aGlzIGhlYWRlciBiZWxvbmdzIHRvLiAgVXNlZCBmb3IgaGlkaW5nIGFuZCBzaG93aW5nIGNvbHVtbnMuXG4gICAgZGlzcGxheTpzdHJpbmc7ICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gdHlwZSBvZjogJ25vbmUnLCAnaW5saW5lJywgJ2Jsb2NrJywgJ2xpc3QtaXRlbScsICdpbmxpbmUtYmxvY2snLCBhbmQgcG9zc2libHkgdGhlICdpbmxpbmUtdGFibGUnIGFuZCAndGFibGUtKicgdmFsdWVzXG4gICAgc2l6ZTpzdHJpbmc7ICAgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gb2YgYWNjZXB0ZWQgdmFsdWVzOiAnbScsICdzJ1xuICAgIHdpZHRoOnN0cmluZzsgICAgICAgICAgIC8vIElmIHByZXNlbnQsIHNldCB0aGUgaGVhZGVyIChhbmQgdGhlcmVieSB0aGUgd2hvbGUgY29sdW1uIGJlbG93IGl0KSB0byBhIGZpeGVkIHdpZHRoLlxuICAgIHNvcnRCeTooaW5kZXg6bnVtYmVyKT0+YW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEEgZnVuY3Rpb24gcmVzb2x2aW5nIGEgcm93IElEIHRvIGEgdmFsdWUgd2UgY2FuIHVzZSBmb3Igc29ydGluZyBieSB0aGlzIGhlYWRlclxuICAgIHNvcnRBZnRlcjpudW1iZXI7ICAgICAgIC8vIFRoZSBpbmRleCBvZiBhbm90aGVyIGhlYWRlciB0aGF0IHdlIHdpbGwgYmFzZSB0aGVzZSBzb3J0aW5nIHJlc3VsdHMgb24gKGUuZy4gc29ydCBieSBEZXNjcmlwdGlvbiwgdGhlbiBieSBTdHVkeSBOYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIExlYXZlIHRoaXMgcHJvcGVydHkgZW1wdHkgaWYgdGhlcmUgaXMgbm8gc29ydGluZyBwcmVyZXF1aXNpdGUuXG4gICAgc29ydElkOnN0cmluZzsgICAgICAgICAgLy8gYW4gSUQgdG8gdXNlIHdoZW4gc29ydGluZyBvbiBzZXJ2ZXItc2lkZVxuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGhpZGRlbjpib29sZWFuO1xuICAgIGVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgc29ydEZ1bmM6KGE6bnVtYmVyLGI6bnVtYmVyKT0+bnVtYmVyO1xuICAgIHNvcnRlZDpib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZ3JvdXA6bnVtYmVyLCBpZDpzdHJpbmcsIG9wdD86e1tpbmRleDpzdHJpbmddOmFueX0pIHtcbiAgICAgICAgdGhpcy5jb2x1bW5Hcm91cCA9IGdyb3VwO1xuICAgICAgICB0aGlzLmlkID0gaWQ7ICAgICAgIC8vIElEIGlzIHJlcXVpcmVkLCBpbml0aWFsaXplIHNlbnNpYmxlIGRlZmF1bHRzIGZvciBldmVyeXRoaW5nIGVsc2VcbiAgICAgICAgb3B0ID0gJC5leHRlbmQoeyAnbmFtZSc6ICcnLCAnYWxpZ24nOiAnbGVmdCcsICdzaXplJzogJ20nLCAnc29ydEFmdGVyJzogLTEgfSwgb3B0KTsgICAvLyBtb3N0IHRoaW5ncyBjYW4gYmUgbnVsbFxuICAgICAgICB0aGlzLm5hbWUgPSBvcHRbJ25hbWUnXTtcbiAgICAgICAgdGhpcy5hbGlnbiA9IG9wdFsnYWxpZ24nXTtcbiAgICAgICAgdGhpcy52YWxpZ24gPSBvcHRbJ3ZhbGlnbiddO1xuICAgICAgICB0aGlzLm5vd3JhcCA9IG9wdFsnbm93cmFwJ107XG4gICAgICAgIHRoaXMucm93c3BhbiA9IG9wdFsncm93c3BhbiddO1xuICAgICAgICB0aGlzLmNvbHNwYW4gPSBvcHRbJ2NvbHNwYW4nXTtcbiAgICAgICAgdGhpcy5oZWFkZXJSb3cgPSBvcHRbJ2hlYWRlclJvdyddO1xuICAgICAgICB0aGlzLmRpc3BsYXkgPSBvcHRbJ2Rpc3BsYXknXTtcbiAgICAgICAgdGhpcy5zaXplID0gb3B0WydzaXplJ107XG4gICAgICAgIHRoaXMud2lkdGggPSBvcHRbJ3dpZHRoJ107XG4gICAgICAgIHRoaXMuc29ydEJ5ID0gb3B0Wydzb3J0QnknXTtcbiAgICAgICAgdGhpcy5zb3J0QWZ0ZXIgPSBvcHRbJ3NvcnRBZnRlciddO1xuICAgICAgICB0aGlzLnNvcnRJZCA9IG9wdFsnc29ydElkJ107XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBDb2x1bW5TcGVjIG9iamVjdCB1c2VkIGJ5IERhdGFHcmlkU3BlY0Jhc2VcbmNsYXNzIERhdGFHcmlkQ29sdW1uU3BlYyB7XG4gICAgY29sdW1uR3JvdXA6bnVtYmVyO1xuICAgIGdlbmVyYXRlQ2VsbHNGdW5jdGlvbjooZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaW5kZXg6c3RyaW5nKT0+RGF0YUdyaWREYXRhQ2VsbFtdO1xuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGNyZWF0ZWREYXRhQ2VsbE9iamVjdHM6e1tpZDpzdHJpbmddOkRhdGFHcmlkRGF0YUNlbGxbXX07XG5cbiAgICBjb25zdHJ1Y3Rvcihncm91cDpudW1iZXIsIGdlbmVyYXRlQ2VsbHM6KGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk9PkRhdGFHcmlkRGF0YUNlbGxbXSkge1xuICAgICAgICB0aGlzLmNvbHVtbkdyb3VwID0gZ3JvdXA7XG4gICAgICAgIHRoaXMuZ2VuZXJhdGVDZWxsc0Z1bmN0aW9uID0gZ2VuZXJhdGVDZWxscztcbiAgICAgICAgdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzID0ge307XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGMgPSB0aGlzLmdlbmVyYXRlQ2VsbHNGdW5jdGlvbihncmlkU3BlYywgaW5kZXgpO1xuICAgICAgICB0aGlzLmNyZWF0ZWREYXRhQ2VsbE9iamVjdHNbaW5kZXhdID0gYy5zbGljZSgwKTtcbiAgICAgICAgICByZXR1cm4gYztcbiAgICB9XG5cbiAgICBjbGVhckluZGV4QXRJRChpbmRleDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBkZWxldGUgdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzW2luZGV4XTtcbiAgICB9XG5cblxuICAgIGNlbGxJbmRleEF0SUQoaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzW2luZGV4XTtcbiAgICB9XG5cblxuICAgIGdldEVudGlyZUluZGV4KCk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGNlbGxzOkRhdGFHcmlkRGF0YUNlbGxbXSA9IFtdO1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzKSB7XG4gICAgICAgICAgICB2YXIgYTpEYXRhR3JpZERhdGFDZWxsW10gPSB0aGlzLmNyZWF0ZWREYXRhQ2VsbE9iamVjdHNba2V5XTtcbiAgICAgICAgICAgIGlmIChhKSB7XG4gICAgICAgICAgICAgICAgLy8gTXVjaCBmYXN0ZXIgdGhhbiByZXBlYXRlZCBjb25jYXRzXG4gICAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoY2VsbHMsIGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjZWxscztcbiAgICB9XG59XG5cblxuXG4vLyBEZWZpbmUgdGhlIENvbHVtbkdyb3VwU3BlYyBvYmplY3QgdXNlZCBieSBEYXRhR3JpZFNwZWNCYXNlXG5jbGFzcyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyB7XG4gICAgbmFtZTpzdHJpbmc7ICAgICAgICAgICAgICAgICAgICAvLyBSZWFkYWJsZSBsYWJlbCBzdHJpbmcgZm9yIHRoaXMgY29sdW1uIGdyb3VwXG4gICAgc2hvd0luVmlzaWJpbGl0eUxpc3Q6Ym9vbGVhbjsgICAvLyBXaGV0aGVyIHRvIHBsYWNlIHRoaXMgY29sdW1uIGluIHRoZSBzaG93L2hpZGUgbGlzdFxuICAgIGhpZGRlbkJ5RGVmYXVsdDpib29sZWFuOyAgICAgICAgLy8gRmxhZyBpZiBncm91cCBpcyBoaWRkZW4gYnkgZGVmYXVsdFxuICAgIC8vIGNhbGxiYWNrIGZvciB3aGVuIGEgY29sdW1uIHRyYW5zaXRpb25zIGZyb20gaGlkZGVuIHRvIHZpc2libGVcbiAgICByZXZlYWxlZENhbGxiYWNrOihzcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGdyaWQ6RGF0YUdyaWQpPT52b2lkO1xuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGN1cnJlbnRseUhpZGRlbjpib29sZWFuO1xuICAgIG1lbWJlckhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW107XG4gICAgbWVtYmVyQ29sdW1uczpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICBjaGVja2JveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcblxuICAgIGNvbnN0cnVjdG9yKGxhYmVsOnN0cmluZywgb3B0Pzp7W2luZGV4OnN0cmluZ106YW55fSkge1xuICAgICAgICB0aGlzLm5hbWUgPSBsYWJlbDtcbiAgICAgICAgb3B0ID0gJC5leHRlbmQoeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiB0cnVlIH0sIG9wdCk7XG4gICAgICAgIHRoaXMuc2hvd0luVmlzaWJpbGl0eUxpc3QgPSBvcHRbJ3Nob3dJblZpc2liaWxpdHlMaXN0J107XG4gICAgICAgIHRoaXMuaGlkZGVuQnlEZWZhdWx0ID0gb3B0WydoaWRkZW5CeURlZmF1bHQnXTtcbiAgICAgICAgdGhpcy5yZXZlYWxlZENhbGxiYWNrID0gb3B0WydyZXZlYWxlZENhbGxiYWNrJ107XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBSb3dHcm91cFNwZWMgb2JqZWN0IHVzZWQgYnkgRGF0YUdyaWRTcGVjQmFzZVxuY2xhc3MgRGF0YUdyaWRSb3dHcm91cFNwZWMge1xuICAgIG5hbWU6c3RyaW5nO1xuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGRpc2Nsb3NlZDpib29sZWFuO1xuICAgIHJlcGxpY2F0ZUdyb3VwVGl0bGVSb3c6SFRNTEVsZW1lbnQ7XG4gICAgcmVwbGljYXRlR3JvdXBUaXRsZVJvd0pROkpRdWVyeTtcbiAgICByZXBsaWNhdGVHcm91cFRhYmxlSlE6SlF1ZXJ5O1xuICAgIHJlcGxpY2F0ZUdyb3VwVGFibGU6SFRNTEVsZW1lbnQ7XG4gICAgbWVtYmVyUmVjb3JkczpEYXRhR3JpZFJlY29yZFtdO1xuXG4gICAgY29uc3RydWN0b3IobGFiZWw6c3RyaW5nKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IGxhYmVsO1xuICAgIH1cbn1cblxuXG5cbi8vIFVzZXJzIG9mIERhdGFHcmlkIHNob3VsZCBkZXJpdmUgZnJvbSB0aGlzIGNsYXNzLCBhbHRlcmluZyB0aGUgY29uc3RydWN0b3IgdG9cbi8vIHByb3ZpZGUgYSBzcGVjaWZpY2F0aW9uIGZvciB0aGUgbGF5b3V0LCBpbnRlcmZhY2UsIGFuZCBkYXRhIHNvdXJjZXMgb2YgdGhlaXIgRGF0YUdyaWQgdGFibGUsXG4vLyBhbmQgb3ZlcnJpZGUgdGhlIGNhbGxiYWNrcyB0byBjdXN0b21pemUgZnVuY3Rpb25hbGl0eS5cbi8vIFRoZW4sIHdoZW4gdGhleSBpbnN0YW50aWF0ZSBhIERhdGFHcmlkLCB0aGV5IHNob3VsZCBwcm92aWRlIGFuIGluc3RhbmNlIG9mIHRoaXMgZGVyaXZlZCBEYXRhR3JpZFNwZWNCYXNlLlxuLy8gQXMgYW4gZXhhbXBsZSwgdGhpcyBiYXNlIGNsYXNzIGlzIHNldCB1cCB0byByZW5kZXIgdGhlIFN0dWRpZXMgdGFibGUgb24gdGhlIG1haW4gcGFnZSBvZiB0aGUgRURELlxuY2xhc3MgRGF0YUdyaWRTcGVjQmFzZSB7XG5cbiAgICAvLyBUaGVzZSB3aWxsIGFsbCBiZSBkZWZpbmVkIG9yIHNldCBieSB0aGUgY29uc3RydWN0b3JcbiAgICB0YWJsZVNwZWM6RGF0YUdyaWRUYWJsZVNwZWM7XG4gICAgdGFibGVIZWFkZXJTcGVjOkRhdGFHcmlkSGVhZGVyU3BlY1tdO1xuICAgIHRhYmxlQ29sdW1uU3BlYzpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICB0YWJsZUNvbHVtbkdyb3VwU3BlYzpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgIHRhYmxlUm93R3JvdXBTcGVjOkRhdGFHcmlkUm93R3JvdXBTcGVjW107XG4gICAgdGFibGVFbGVtZW50OkhUTUxFbGVtZW50O1xuXG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy50YWJsZUVsZW1lbnQgPSBudWxsO1xuICAgICAgICB0aGlzLnRhYmxlU3BlYyA9IG51bGw7XG4gICAgICAgIHRoaXMudGFibGVIZWFkZXJTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJsZUNvbHVtblNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLnRhYmxlQ29sdW1uR3JvdXBTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJsZVJvd0dyb3VwU3BlYyA9IG51bGw7XG4gICAgfVxuXG5cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLnRhYmxlRWxlbWVudCA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgIHRoaXMudGFibGVTcGVjID0gdGhpcy5kZWZpbmVUYWJsZVNwZWMoKTtcbiAgICAgICAgdGhpcy50YWJsZUhlYWRlclNwZWMgPSB0aGlzLmRlZmluZUhlYWRlclNwZWMoKTtcbiAgICAgICAgdGhpcy50YWJsZUNvbHVtblNwZWMgPSB0aGlzLmRlZmluZUNvbHVtblNwZWMoKTtcbiAgICAgICAgdGhpcy50YWJsZUNvbHVtbkdyb3VwU3BlYyA9IHRoaXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk7XG4gICAgICAgIHRoaXMudGFibGVSb3dHcm91cFNwZWMgPSB0aGlzLmRlZmluZVJvd0dyb3VwU3BlYygpO1xuICAgIH1cblxuXG4gICAgLy8gQWxsIG9mIHRoZXNlIFwiZGVmaW5lXCIgZnVuY3Rpb25zIHNob3VsZCBiZSBvdmVycmlkZGVuXG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSB0YWJsZSBhcyBhIHdob2xlXG4gICAgZGVmaW5lVGFibGVTcGVjKCk6RGF0YUdyaWRUYWJsZVNwZWMge1xuICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkVGFibGVTcGVjKCd1bmlxdWVzdHJpbmcnLCB7ICduYW1lJzogJ0F3ZXNvbWUgVGFibGUnIH0pO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygxLCAnaE5hbWUnLCB7ICduYW1lJzogJ05hbWUnIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyLCAnaERlc2MnLCB7ICduYW1lJzogJ0Rlc2NyaXB0aW9uJyB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZGF0YSBjb2x1bW5zIHRoYXQgd2lsbCBtYWtlIHVwIHRoZSBib2R5IG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIChncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGNlbGwocykgZm9yIGEgZ2l2ZW4gcmVjb3JkIElELCBmb3IgY29sdW1uIDFcbiAgICAgICAgICAgICAgICByZXR1cm4gW25ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCldO1xuICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIsIChncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGNlbGwocykgZm9yIGEgZ2l2ZW4gcmVjb3JkIElELCBmb3IgY29sdW1uIDJcbiAgICAgICAgICAgICAgICByZXR1cm4gW25ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCldO1xuICAgICAgICAgICAgICAgfSksXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRGVzY3JpcHRpb24nKVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGdyb3VwcyB0aGF0IHJvd3MgY2FuIGJlIGdhdGhlcmVkIGludG9cbiAgICBkZWZpbmVSb3dHcm91cFNwZWMoKTpEYXRhR3JpZFJvd0dyb3VwU3BlY1tdIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuXG4gICAgLy8gYXR0YWNoIGV2ZW50IGhhbmRsZXJzIGZvciBzb3J0aW5nXG4gICAgZW5hYmxlU29ydChncmlkOkRhdGFHcmlkKTpEYXRhR3JpZFNwZWNCYXNlIHtcbiAgICAgICAgdGhpcy50YWJsZUhlYWRlclNwZWMuZm9yRWFjaCgoaGVhZGVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaGVhZGVyLnNvcnRCeSkge1xuICAgICAgICAgICAgICAgICQoaGVhZGVyLmVsZW1lbnQpLm9uKCdjbGljay5kYXRhdGFibGUnLCAoZXYpID0+IHRoaXMuY2xpY2tlZFNvcnQoZ3JpZCwgaGVhZGVyLCBldikpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLy8gVGhlIHNlcnZlciBjb2RlIGhvb2tzIHRhYmxlIGhlYWRlcnMgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuICAgIHByaXZhdGUgY2xpY2tlZFNvcnQoZ3JpZDpEYXRhR3JpZCwgaGVhZGVyOkRhdGFHcmlkSGVhZGVyU3BlYywgZXYpIHtcbiAgICAgICAgdmFyIHNvcnQgPSBncmlkLnNvcnRDb2xzKCk7XG4gICAgICAgIGlmIChzb3J0Lmxlbmd0aCAmJiBzb3J0WzBdLnNwZWMuaWQgPT09IGhlYWRlci5pZCkge1xuICAgICAgICAgICAgc29ydFswXS5hc2MgPSAhc29ydFswXS5hc2M7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0ID0gWyB7ICdzcGVjJzogaGVhZGVyLCAnYXNjJzogdHJ1ZSB9IF07XG4gICAgICAgIH1cbiAgICAgICAgZ3JpZC5zb3J0Q29scyhzb3J0KS5hcnJhbmdlVGFibGVEYXRhUm93cygpO1xuICAgIH1cblxuXG4gICAgLy8gV2hlbiBwYXNzZWQgYSByZWNvcmQgSUQsIHJldHVybnMgdGhlIHJvdyBncm91cCB0aGF0IHRoZSByZWNvcmQgaXMgYSBtZW1iZXIgb2YuXG4gICAgZ2V0Um93R3JvdXBNZW1iZXJzaGlwKHJlY29yZElEOnN0cmluZyk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZGllc1RhYmxlXCIpO1xuICAgIH1cblxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBTdHVkaWVzXG4gICAgICAgIHZhciBhcnJheTpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG4gICAgICAgIGFycmF5LnB1c2gobmV3IERHU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIFN0dWRpZXMnLCA0MCwgdHJ1ZSkpO1xuICAgICAgICByZXR1cm4gYXJyYXk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LlxuICAgIC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZE9wdGlvbldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZE9wdGlvbldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBvbmx5IHRoZSBTdHVkaWVzIHRoYXQgYmVsb25nIHRvIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgICAgLy8gICAgICAgIHZhciBvbmx5TXlTdHVkaWVzV2lkZ2V0ID0gbmV3IERHT25seU15U3R1ZGllc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIC8vICAgICAgICB3aWRnZXRTZXQucHVzaChvbmx5TXlTdHVkaWVzV2lkZ2V0KTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBTdHVkaWVzXG4gICAgICAgIC8vICAgICAgICB2YXIgZGlzYWJsZWRTdHVkaWVzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgLy8gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkU3R1ZGllc1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiBhIGRhdGEgcmVzZXQgaXMgdHJpZ2dlcmVkLCBidXQgYmVmb3JlIHRoZSB0YWJsZSByb3dzIGFyZSByZWJ1aWx0LlxuICAgIG9uRGF0YVJlc2V0KGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcbiAgICAgICAgcmV0dXJuOyAgICAvLyBEbyBub3RoaW5nIGJ5IGRlZmF1bHQuXG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aGVuIGEgcGFydGlhbCBkYXRhIHJlc2V0IGlzIHRyaWdnZXJlZCwgYnV0IGJlZm9yZSB0aGUgdGFibGUgcm93cyBhcmUgcmVidWlsdC5cbiAgICAvLyBBIHBhcnRpYWwgZGF0YSByZXNldCBpcyBvbmUgd2hlcmUgYSBjb2xsZWN0aW9uIG9mIHJlY29yZHMgaGF2ZSBiZWVuIHNwZWNpZmllZCBmb3IgcmUtcGFyc2luZyxcbiAgICAvLyBhbmQgd2lsbCBiZSBtaXhlZC1pbiB3aXRoIHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgY29sbGVjdGlvbiBhZnRlcndhcmRzLlxuICAgIG9uUGFydGlhbERhdGFSZXNldChkYXRhR3JpZDpEYXRhR3JpZCwgcmVjb3JkczpzdHJpbmdbXSk6dm9pZCB7XG4gICAgICAgIHJldHVybjsgICAgLy8gRG8gbm90aGluZyBieSBkZWZhdWx0LlxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHVzZXIgaGlkZXMgb3Igc2hvd3Mgcm93cy5cbiAgICBvblJvd1Zpc2liaWxpdHlDaGFuZ2VkKCk6dm9pZCB7XG5cbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSBhIGdyb3VwIG5hbWUuIFlvdSBjYW4gcHJvY2VzcyB5b3VyIGRhdGEgaG93ZXZlclxuICAgIC8vIHlvdSB3YW50IGluIG9yZGVyIHRvIGNvbWUgdXAgd2l0aCBhIG5hbWUuXG4gICAgZ2VuZXJhdGVHcm91cE5hbWUoZGF0YUdyaWQ6RGF0YUdyaWQsIGdyb3VwSUQ6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJHcm91cCBcIiArIGdyb3VwSUQ7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiB0aGUgZ3JvdXBpbmcgc2V0dGluZyBpcyBjaGFuZ2VkLCBpbiBjYXNlXG4gICAgLy8geW91IHdhbnQgdG8gcGVyc2lzdCB0aGUgc2V0dGluZyBzb21ld2hlcmUuXG4gICAgb25VcGRhdGVkR3JvdXBpbmdFbmFibGVkKGRhdGFHcmlkOkRhdGFHcmlkLCBlbmFibGVkOmJvb2xlYW4pOnZvaWQge1xuICAgIH1cblxufVxuXG4iXX0=