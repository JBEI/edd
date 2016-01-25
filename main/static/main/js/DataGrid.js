// Compiled to JS on: Mon Jan 25 2016 15:20:56  
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="lib/jquery.d.ts" />
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
        var tableBody = $(this._tableBody = document.createElement("tbody"));
        // First step: Blow away the old contents of the table
        $(this._table).empty()
            .attr({ 'cellpadding': 0, 'cellspacing': 0 })
            .addClass('dataTable sortable dragboxes hastablecontrols')
            .append(tableBody);
        var tableHeaderRow = $(document.createElement("tr")).addClass('header');
        var tableHeaderCell = $(this._tableHeaderCell = document.createElement("th"))
            .appendTo(tableHeaderRow);
        if (dataGridSpec.tableSpec.name) {
            $(this.tableTitleSpan = document.createElement("span")).text(dataGridSpec.tableSpec.name).appendTo(tableHeaderCell);
        }
        var waitBadge = $(this._waitBadge = document.createElement("span"))
            .addClass('waitbadge wait').appendTo(tableHeaderCell);
        if ((this._totalColumnCount = this.countTotalColumns()) > 1) {
            tableHeaderCell.attr('colspan', this._totalColumnCount);
        }
        // If we're asked to show the header, then add it to the table.  Otherwise we will leave it off.
        if (dataGridSpec.tableSpec.showHeader) {
            tableBody.append(tableHeaderRow);
        }
        // Apply the default column visibility settings.
        this.prepareColumnVisibility();
        var headerRows = this._headerRows = this._buildTableHeaders();
        this._headerRows.forEach(function (v) { return tableBody.append(v); });
        setTimeout(function () { return _this._initializeTableData(); }, 1);
    }
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
            .text('View\u25BE')
            .click(function () { if (menuLabel.hasClass('pulldownMenuLabelOff'))
            _this._showOptMenu(); })
            .appendTo(mainSpan);
        var menuBlock = $(this._optionsMenuBlockElement = document.createElement("div"))
            .addClass('pulldownMenuMenuBlock off')
            .appendTo(mainSpan);
        // event handlers to hide menu if clicking outside menu block or pressing ESC
        $(document).click(function (ev) {
            var t = $(ev.target);
            if (t.closest(_this._optionsMenuElement).size() === 0) {
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
            var r = rowGroup.disclosedTitleRow;
            if (r.parentNode) {
                _this._tableBody.removeChild(r);
            }
            r = rowGroup.undisclosedTitleRow;
            if (r.parentNode) {
                _this._tableBody.removeChild(r);
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
            rowGroupSpec.forEach(function (rowGroup) {
                if (rowGroup.memberRecords.length < 1) {
                    // If there's nothing in the group (may have all been filtered out) skip it
                    return;
                }
                striping = 1 - striping;
                if (_this._spec.tableSpec.applyStriping) {
                    rowGroup.undisclosedTitleRowJQ.add(rowGroup.disclosedTitleRowJQ)
                        .removeClass(stripeStylesJoin).addClass(stripeStyles[striping]).end();
                }
                if (!rowGroup.disclosed) {
                    // If the group is not disclosed, just print the "undisclosed" title row, and skip the
                    // rows themselves (but invert the striping value so the striping pattern isn't disturbed)
                    frag.appendChild(rowGroup.undisclosedTitleRow);
                    return;
                }
                frag.appendChild(rowGroup.disclosedTitleRow);
                rowGroup.memberRecords.forEach(function (record) {
                    striping = 1 - striping;
                    if (_this._spec.tableSpec.applyStriping) {
                        record.applyStriping(striping);
                    }
                    var rows = record.getElements();
                    rows.forEach(function (row) {
                        frag.appendChild(row);
                    });
                });
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
            oneGroup.memberRecords = [];
            var row = oneGroup.disclosedTitleRowJQ = $(oneGroup.disclosedTitleRow = document.createElement("tr"))
                .addClass('groupHeader').click(function () { return _this._collapseRowGroup(index); });
            var cell = $(document.createElement("td")).appendTo(row);
            $(document.createElement("div")).appendTo(cell).text("\u25BA " + oneGroup.name);
            if (_this._totalColumnCount > 1) {
                cell.attr('colspan', _this._totalColumnCount);
            }
            row = oneGroup.undisclosedTitleRowJQ = $(oneGroup.undisclosedTitleRow = document.createElement("tr"))
                .addClass('groupHeader').click(function () { return _this._expandRowGroup(index); });
            cell = $(document.createElement("td")).appendTo(row);
            $(document.createElement("div")).appendTo(cell).text("\u25BC " + oneGroup.name);
            if (_this._totalColumnCount > 1) {
                cell.attr('colspan', _this._totalColumnCount);
            }
        });
        return this;
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
    DataGrid.prototype._collapseRowGroup = function (groupIndex) {
        var _this = this;
        var rowGroup = this._spec.tableRowGroupSpec[groupIndex];
        rowGroup.disclosed = false;
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
    };
    DataGrid.prototype._expandRowGroup = function (groupIndex) {
        var _this = this;
        var rowGroup = this._spec.tableRowGroupSpec[groupIndex];
        rowGroup.disclosed = true;
        this.scheduleTimer('arrangeTableDataRows', function () { return _this.arrangeTableDataRows(); });
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
})();
// Type definition for the records contained in a DataGrid
var DataGridRecordSet = (function () {
    function DataGridRecordSet() {
    }
    return DataGridRecordSet;
})();
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
})();
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
})();
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
        if (this.nowrap) {
            cellClasses.push('nowrap');
        }
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
})();
// A placeholder cell when data is still loading
var DataGridLoadingCell = (function (_super) {
    __extends(DataGridLoadingCell, _super);
    function DataGridLoadingCell(gridSpec, id, opt) {
        _super.call(this, gridSpec, id, opt);
        this.contentString = '<span class="loading">Loading...</span>';
    }
    return DataGridLoadingCell;
})(DataGridDataCell);
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
})();
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
})(DataGridWidget);
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
})(DataGridWidget);
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
                    cell.checkboxElement &&
                        (cell.checkboxElement.checked = true) &&
                        $(cell.checkboxElement).trigger('change');
                });
            });
        }, sequence);
    };
    return DGSelectAllWidget;
})(DataGridHeaderWidget);
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
        // If there are multiple words, we match each separately.
        // We will not attempt to match against empty strings, so we filter those out if any slipped through
        var queryStrs = v.split(' ').filter(function (one) { return one.length > 0; });
        var filteredIDs = [];
        this.dataGridOwnerObject.applyToRecordSet(function (rows, id) {
            rows.forEach(function (row) {
                row.dataGridDataCells.forEach(function (cell) {
                    if (cell.createdElement) {
                        var text = cell.contentContainerElement.textContent.toLowerCase();
                        var match = queryStrs.some(function (v) {
                            // TODO: Sholdn't this be text.length >= v.length ?
                            return text.length > v.length && text.indexOf(v) >= 0;
                        });
                        if (match) {
                            filteredIDs.push(id);
                        }
                    }
                });
            });
        }, rowIDs);
        return filteredIDs;
    };
    return DGSearchWidget;
})(DataGridHeaderWidget);
var DataGridSort = (function () {
    function DataGridSort() {
    }
    return DataGridSort;
})();
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
            $(this.widgetElement = document.createElement('div'))
                .appendTo(container);
            $(this.labelElement = document.createElement('span'))
                .appendTo(this.widgetElement);
            $(this.prevElement = document.createElement('a'))
                .attr('href', '#').css('margin', '0 5px')
                .text('< Previous').prop('disabled', true)
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
        $(this.prevElement).prop('disabled', !start);
        $(this.nextElement).prop('disabled', start + viewSize >= totalSize);
    };
    return DGPagingWidget;
})(DataGridHeaderWidget);
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
})();
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
})();
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
    // clearEntireIndex(index:number):void {
    //     this.createdDataCellObjects = {};
    // }
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
})();
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
})();
// Define the RowGroupSpec object used by DataGridSpecBase
var DataGridRowGroupSpec = (function () {
    function DataGridRowGroupSpec(label) {
        this.name = label;
    }
    return DataGridRowGroupSpec;
})();
// Users of DataGrid should derive from this class, altering the constructor to
// provide a specification for the layout, interface, and data sources of their DataGrid table,
// and override the callbacks to customize functionality.
// Then, when they instantiate a DataGrid, they should provide an instance of this derived DataGridSpecBase.
// As an example, this base class is set up to render the Studies table on the main page of the EDD.
var DataGridSpecBase = (function () {
    function DataGridSpecBase() {
        this.tableElement = this.getTableElement();
        this.tableSpec = this.defineTableSpec();
        this.tableHeaderSpec = this.defineHeaderSpec();
        this.tableColumnSpec = this.defineColumnSpec();
        this.tableColumnGroupSpec = this.defineColumnGroupSpec();
        this.tableRowGroupSpec = this.defineRowGroupSpec();
    }
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
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGF0YUdyaWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJEYXRhR3JpZC50cyJdLCJuYW1lcyI6WyJEYXRhR3JpZCIsIkRhdGFHcmlkLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWQuX2luaXRpYWxpemVUYWJsZURhdGEiLCJEYXRhR3JpZC5faW5pdGlhbGl6ZVNvcnQiLCJEYXRhR3JpZC50cmlnZ2VyRGF0YVJlc2V0IiwiRGF0YUdyaWQudHJpZ2dlclBhcnRpYWxEYXRhUmVzZXQiLCJEYXRhR3JpZC5yZWNvbnN0cnVjdFNpbmdsZVJlY29yZCIsIkRhdGFHcmlkLl9jcmVhdGVPcHRpb25zTWVudSIsIkRhdGFHcmlkLl9jcmVhdGVIZWFkZXJXaWRnZXRzIiwiRGF0YUdyaWQucHJlcGFyZUNvbHVtblZpc2liaWxpdHkiLCJEYXRhR3JpZC5fYXBwbHlDb2x1bW5WaXNpYmlsaXR5IiwiRGF0YUdyaWQuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eVRvT25lUmVjb3JkIiwiRGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzIiwiRGF0YUdyaWQuYXBwbHlTb3J0SW5kaWNhdG9ycyIsIkRhdGFHcmlkLmFycmFuZ2VUYWJsZURhdGFSb3dzIiwiRGF0YUdyaWQuYXBwbHlBbGxXaWRnZXRGaWx0ZXJpbmciLCJEYXRhR3JpZC5nZXRTcGVjIiwiRGF0YUdyaWQuY291bnRUb3RhbENvbHVtbnMiLCJEYXRhR3JpZC5fYnVpbGRBbGxUYWJsZVNvcnRlcnMiLCJEYXRhR3JpZC5idWlsZFRhYmxlU29ydGVyIiwiRGF0YUdyaWQuX2J1aWxkVGFibGVTb3J0U2VxdWVuY2VzIiwiRGF0YUdyaWQuX2dldFNlcXVlbmNlIiwiRGF0YUdyaWQuX2J1aWxkVGFibGVIZWFkZXJzIiwiRGF0YUdyaWQuX2FsbG9jYXRlVGFibGVSb3dSZWNvcmRzIiwiRGF0YUdyaWQuX2J1aWxkUm93R3JvdXBUaXRsZVJvd3MiLCJEYXRhR3JpZC5fcHJlcGFyZVNvcnRhYmxlIiwiRGF0YUdyaWQuX3Nob3dPcHRNZW51IiwiRGF0YUdyaWQuX2hpZGVPcHRNZW51IiwiRGF0YUdyaWQuX2NvbGxhcHNlUm93R3JvdXAiLCJEYXRhR3JpZC5fZXhwYW5kUm93R3JvdXAiLCJEYXRhR3JpZC50dXJuT25Sb3dHcm91cGluZyIsIkRhdGFHcmlkLnR1cm5PZmZSb3dHcm91cGluZyIsIkRhdGFHcmlkLmNsaWNrZWRPcHRpb25XaWRnZXQiLCJEYXRhR3JpZC5jbGlja2VkSGVhZGVyV2lkZ2V0IiwiRGF0YUdyaWQuX2NsaWNrZWRDb2xWaXNpYmlsaXR5Q29udHJvbCIsIkRhdGFHcmlkLnNob3dDb2x1bW4iLCJEYXRhR3JpZC5oaWRlQ29sdW1uIiwiRGF0YUdyaWQuX2Jhc2VQYXlsb2FkIiwiRGF0YUdyaWQuX2NvbHVtblNldHRpbmdzS2V5IiwiRGF0YUdyaWQuX2ZldGNoU2V0dGluZ3MiLCJEYXRhR3JpZC5fdXBkYXRlQ29sdW1uU2V0dGluZ3MiLCJEYXRhR3JpZC5zY2hlZHVsZVRpbWVyIiwiRGF0YUdyaWQuYXBwbHlUb1JlY29yZFNldCIsIkRhdGFHcmlkLmN1cnJlbnRTZXF1ZW5jZSIsIkRhdGFHcmlkLnNvcnRDb2xzIiwiRGF0YUdyaWRSZWNvcmRTZXQiLCJEYXRhR3JpZFJlY29yZFNldC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkUmVjb3JkIiwiRGF0YUdyaWRSZWNvcmQuY29uc3RydWN0b3IiLCJEYXRhR3JpZFJlY29yZC5yZUNyZWF0ZUVsZW1lbnRzSW5QbGFjZSIsIkRhdGFHcmlkUmVjb3JkLmNyZWF0ZUVsZW1lbnRzIiwiRGF0YUdyaWRSZWNvcmQucmVtb3ZlRWxlbWVudHMiLCJEYXRhR3JpZFJlY29yZC5kZXRhY2hFbGVtZW50cyIsIkRhdGFHcmlkUmVjb3JkLmdldERhdGFHcmlkRGF0YVJvd3MiLCJEYXRhR3JpZFJlY29yZC5nZXRFbGVtZW50cyIsIkRhdGFHcmlkUmVjb3JkLmFwcGx5U3RyaXBpbmciLCJEYXRhR3JpZERhdGFSb3ciLCJEYXRhR3JpZERhdGFSb3cuY29uc3RydWN0b3IiLCJEYXRhR3JpZERhdGFSb3cuY3JlYXRlRWxlbWVudCIsIkRhdGFHcmlkRGF0YVJvdy5yZW1vdmVFbGVtZW50IiwiRGF0YUdyaWREYXRhUm93LmRldGFjaEVsZW1lbnQiLCJEYXRhR3JpZERhdGFSb3cuZ2V0RWxlbWVudCIsIkRhdGFHcmlkRGF0YVJvdy5nZXRFbGVtZW50SlEiLCJEYXRhR3JpZERhdGFDZWxsIiwiRGF0YUdyaWREYXRhQ2VsbC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkRGF0YUNlbGwuY3JlYXRlRWxlbWVudCIsIkRhdGFHcmlkRGF0YUNlbGwuZ2V0RWxlbWVudCIsIkRhdGFHcmlkRGF0YUNlbGwuZ2V0Q2hlY2tib3hFbGVtZW50IiwiRGF0YUdyaWREYXRhQ2VsbC5oaWRlIiwiRGF0YUdyaWREYXRhQ2VsbC51bmhpZGUiLCJEYXRhR3JpZExvYWRpbmdDZWxsIiwiRGF0YUdyaWRMb2FkaW5nQ2VsbC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkV2lkZ2V0IiwiRGF0YUdyaWRXaWRnZXQuY29uc3RydWN0b3IiLCJEYXRhR3JpZFdpZGdldC5fY3JlYXRlTGFiZWwiLCJEYXRhR3JpZFdpZGdldC5fY3JlYXRlQ2hlY2tib3giLCJEYXRhR3JpZFdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCIsIkRhdGFHcmlkV2lkZ2V0LnJlZnJlc2hXaWRnZXQiLCJEYXRhR3JpZE9wdGlvbldpZGdldCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRPcHRpb25XaWRnZXQuZ2V0SURGcmFnbWVudCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmdldExhYmVsVGV4dCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0Lm9uV2lkZ2V0Q2hhbmdlIiwiRGF0YUdyaWRPcHRpb25XaWRnZXQuY3JlYXRlRWxlbWVudHMiLCJEYXRhR3JpZE9wdGlvbldpZGdldC5hcHBlbmRFbGVtZW50cyIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMiLCJEYXRhR3JpZE9wdGlvbldpZGdldC5nZXRTdGF0ZSIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmlzRW5hYmxlZEJ5RGVmYXVsdCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LnNldFN0YXRlIiwiRGF0YUdyaWRIZWFkZXJXaWRnZXQiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkSGVhZGVyV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiRGF0YUdyaWRIZWFkZXJXaWRnZXQuYXBwZW5kRWxlbWVudHMiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5jcmVhdGVkRWxlbWVudHMiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5hcHBseUZpbHRlclRvSURzIiwiREdTZWxlY3RBbGxXaWRnZXQiLCJER1NlbGVjdEFsbFdpZGdldC5jb25zdHJ1Y3RvciIsIkRHU2VsZWN0QWxsV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdTZWxlY3RBbGxXaWRnZXQuY2xpY2tIYW5kbGVyIiwiREdTZWFyY2hXaWRnZXQiLCJER1NlYXJjaFdpZGdldC5jb25zdHJ1Y3RvciIsIkRHU2VhcmNoV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdTZWFyY2hXaWRnZXQuaW5wdXRLZXlEb3duSGFuZGxlciIsIkRHU2VhcmNoV2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMiLCJEYXRhR3JpZFNvcnQiLCJEYXRhR3JpZFNvcnQuY29uc3RydWN0b3IiLCJER1BhZ2luZ1dpZGdldCIsIkRHUGFnaW5nV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdQYWdpbmdXaWRnZXQuYXBwZW5kRWxlbWVudHMiLCJER1BhZ2luZ1dpZGdldC5yZWZyZXNoV2lkZ2V0IiwiRGF0YUdyaWRUYWJsZVNwZWMiLCJEYXRhR3JpZFRhYmxlU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkSGVhZGVyU3BlYyIsIkRhdGFHcmlkSGVhZGVyU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkQ29sdW1uU3BlYyIsIkRhdGFHcmlkQ29sdW1uU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkQ29sdW1uU3BlYy5nZW5lcmF0ZUNlbGxzIiwiRGF0YUdyaWRDb2x1bW5TcGVjLmNsZWFySW5kZXhBdElEIiwiRGF0YUdyaWRDb2x1bW5TcGVjLmNlbGxJbmRleEF0SUQiLCJEYXRhR3JpZENvbHVtblNwZWMuZ2V0RW50aXJlSW5kZXgiLCJEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyIsIkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRSb3dHcm91cFNwZWMiLCJEYXRhR3JpZFJvd0dyb3VwU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkU3BlY0Jhc2UiLCJEYXRhR3JpZFNwZWNCYXNlLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRTcGVjQmFzZS5kZWZpbmVUYWJsZVNwZWMiLCJEYXRhR3JpZFNwZWNCYXNlLmRlZmluZUhlYWRlclNwZWMiLCJEYXRhR3JpZFNwZWNCYXNlLmRlZmluZUNvbHVtblNwZWMiLCJEYXRhR3JpZFNwZWNCYXNlLmRlZmluZUNvbHVtbkdyb3VwU3BlYyIsIkRhdGFHcmlkU3BlY0Jhc2UuZGVmaW5lUm93R3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjQmFzZS5lbmFibGVTb3J0IiwiRGF0YUdyaWRTcGVjQmFzZS5jbGlja2VkU29ydCIsIkRhdGFHcmlkU3BlY0Jhc2UuZ2V0Um93R3JvdXBNZW1iZXJzaGlwIiwiRGF0YUdyaWRTcGVjQmFzZS5nZXRUYWJsZUVsZW1lbnQiLCJEYXRhR3JpZFNwZWNCYXNlLmdldFJlY29yZElEcyIsIkRhdGFHcmlkU3BlY0Jhc2UuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY0Jhc2UuY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMiLCJEYXRhR3JpZFNwZWNCYXNlLm9uSW5pdGlhbGl6ZWQiLCJEYXRhR3JpZFNwZWNCYXNlLm9uRGF0YVJlc2V0IiwiRGF0YUdyaWRTcGVjQmFzZS5vblBhcnRpYWxEYXRhUmVzZXQiLCJEYXRhR3JpZFNwZWNCYXNlLm9uUm93VmlzaWJpbGl0eUNoYW5nZWQiLCJEYXRhR3JpZFNwZWNCYXNlLmdlbmVyYXRlR3JvdXBOYW1lIiwiRGF0YUdyaWRTcGVjQmFzZS5vblVwZGF0ZWRHcm91cGluZ0VuYWJsZWQiXSwibWFwcGluZ3MiOiJBQUFBLGdEQUFnRDtBQUNoRCwrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLHdDQUF3Qzs7Ozs7O0FBRXhDLEVBQUU7QUFDRixtRkFBbUY7QUFDbkYsaUVBQWlFO0FBQ2pFLEVBQUU7QUFFRjtJQTRCSUEseURBQXlEQTtJQUN6REEsNkZBQTZGQTtJQUM3RkEsa0JBQVlBLFlBQTZCQTtRQTlCN0NDLGlCQTQ3QkNBO1FBdDZCV0EscUJBQWdCQSxHQUFXQSxLQUFLQSxDQUFDQSxDQUFJQSwrQkFBK0JBO1FBQ3BFQSxVQUFLQSxHQUFrQkEsRUFBRUEsQ0FBQ0E7UUFDMUJBLGNBQVNBLEdBQWdDQSxFQUFFQSxDQUFDQTtRQVFoREEsMEVBQTBFQTtRQUMxRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsRUFDeEJBLHVFQUF1RUEsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLFNBQVNBO1lBQzVEQSxZQUFZQSxDQUFDQSxlQUFlQSxJQUFJQSxZQUFZQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUNqRUEsb0VBQW9FQSxDQUFDQSxDQUFDQTtRQUUxRUEsRUFBRUE7UUFDRkEsK0JBQStCQTtRQUMvQkEsRUFBRUE7UUFFRkEsMERBQTBEQTtRQUMxREEsdUVBQXVFQTtRQUN2RUEsZ0RBQWdEQTtRQUNoREEsbUVBQW1FQTtRQUNuRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsWUFBWUEsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLFlBQVlBLENBQUNBLFlBQVlBLENBQUNBO1FBQ3hDQSxJQUFJ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Z0JBQy9CQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxPQUFPQTthQUM1QkEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLElBQUlBLEdBQVVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO2dCQUMxQ0EsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0EsRUFBRUE7Z0JBQ2ZBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBO2dCQUMxREEsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsU0FBU0E7Z0JBQzFEQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxHQUFHQSxTQUFTQSxHQUFHQSxTQUFTQTthQUN2REEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNoQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDaENBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxD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QUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDNUNBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFN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LEVBQUVBLE9BQU9BLEVBQUVBLE1BQU1BLEVBQUVBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUdBLDBCQUEwQkE7UUFDaEhBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3hCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzVCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDeEJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLFFB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Z0dBQWdHQTtJQUNoR0EsZ0dBQWdHQTtJQUNoR0EsMEVBQTBFQTtJQUMxRUEsNkNBQWtCQSxHQUFsQkEsVUFBbUJBLFFBQWlCQSxFQUFFQSxPQUFnQkE7UUFDbERnQixNQUFNQSxDQUFDQSxDQUFJQSx5QkFBeUJBO0lBQ3hDQSxDQUFDQTtJQUdEaEIsNENBQTRDQTtJQUM1Q0EsaURBQXNCQSxHQUF0QkE7SUFFQWlCLENBQUNBO0lBRURqQiw2RUFBNkVBO0lBQzdFQSw0Q0FBNENBO0lBQzVDQSw0Q0FBaUJBLEdBQWpCQSxVQUFrQkEsUUFBaUJBLEVBQUVBLE9BQWNBO1FBQy9Da0IsTUFBTUEsQ0FBQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0E7SUFDOUJBLENBQUNBO0lBRURsQiwrREFBK0RBO0lBQy9EQSw2Q0FBNkNBO0lBQzdDQSxtREFBd0JBLEdBQXhCQSxVQUF5QkEsUUFBaUJBLEVBQUVBLE9BQWVBO0lBQzNEbUIsQ0FBQ0E7SUFFTG5CLHVCQUFDQTtBQUFEQSxDQUFDQSxBQTFLRCxJQTBLQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBNb24gSmFuIDI1IDIwMTYgMTU6MjA6NTYgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJsaWIvanF1ZXJ5LmQudHNcIiAvPlxuXG4vL1xuLy8gVGhpcyBpcyBhIHJlLWltcGxlbWVudGF0aW9uIG9mIERhdGFHcmlkU2VydmVyU2lkZSBmb3Igd2hvbGx5IGNsaWVudC1zaWRlIHRhYmxlcy5cbi8vIEV2ZW50dWFsbHkgRGF0YUdyaWRTZXJ2ZXJTaWRlIHNob3VsZCBiZSBwaGFzZWQgb3V0IGNvbXBsZXRlbHkuXG4vL1xuXG5jbGFzcyBEYXRhR3JpZCB7XG5cbiAgICAvLyBNZW1iZXIgdmFyaWFibGVzLlxuICAgIHByaXZhdGUgX3NwZWM6RGF0YUdyaWRTcGVjQmFzZTtcblxuICAgIHByaXZhdGUgX3RhYmxlOkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgX3RhYmxlQm9keTpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIF90YWJsZUhlYWRlckNlbGw6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfd2FpdEJhZGdlOkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgdGFibGVUaXRsZVNwYW46SFRNTEVsZW1lbnQ7XG5cbiAgICBwcml2YXRlIF9oZWFkZXJSb3dzOkhUTUxFbGVtZW50W107XG4gICAgcHJpdmF0ZSBfdG90YWxDb2x1bW5Db3VudDpudW1iZXI7XG4gICAgcHJpdmF0ZSBfcmVjb3JkRWxlbWVudHM6RGF0YUdyaWRSZWNvcmRTZXQ7XG5cbiAgICBwcml2YXRlIF9oZWFkZXJXaWRnZXRzOkRhdGFHcmlkSGVhZGVyV2lkZ2V0W107XG4gICAgcHJpdmF0ZSBfb3B0aW9uc01lbnVXaWRnZXRzOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W107XG4gICAgcHJpdmF0ZSBfb3B0aW9uc01lbnVFbGVtZW50OkhUTUxFbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBfb3B0aW9uc01lbnVCbG9ja0VsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfb3B0aW9uc0xhYmVsOkhUTUxFbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBfZ3JvdXBpbmdFbmFibGVkOmJvb2xlYW4gPSBmYWxzZTsgICAgLy8gZ3JvdXBpbmcgbW9kZSBvZmYgYnkgZGVmYXVsdFxuICAgIHByaXZhdGUgX3NvcnQ6RGF0YUdyaWRTb3J0W10gPSBbXTtcbiAgICBwcml2YXRlIF9zZXF1ZW5jZTp7IFtpbmRleDpudW1iZXJdOiBzdHJpbmdbXSB9ID0ge307XG5cbiAgICBwcml2YXRlIF90aW1lcnM6e1tpbmRleDpzdHJpbmddOm51bWJlcn07XG5cbiAgICAvLyBUaGlzIGJpbmRzIGEgdGFibGUgZWxlbWVudCB0byBhbiBpbnN0YW5jZSBvZiBEYXRhR3JpZC5cbiAgICAvLyBUaGUgcHJldmlvdXMgY29udGVudHMgb2YgdGhlIHRhYmxlLCBpZiBhbnksIGFyZSBkZWxldGVkLCBhbmQgRGF0YUdyaWQgdGFrZXMgb3ZlciB0aGUgdGFibGVcbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuXG4gICAgICAgIC8vIFVzZSAhISBkb3VibGUtbm90IG9wZXJhdG9yIHRvIGNvZXJjZSB0cnV0aC15L2ZhbHNlLXkgdmFsdWVzIHRvIGJvb2xlYW5zXG4gICAgICAgIFV0bC5KUy5hc3NlcnQoISFkYXRhR3JpZFNwZWMsXG4gICAgICAgICAgICBcIkRhdGFHcmlkIG5lZWRzIHRvIGJlIHN1cHBsaWVkIHdpdGggYSBEYXRhR3JpZFNwZWNCYXNlLWRlcml2ZWQgb2JqZWN0LlwiKTtcbiAgICAgICAgVXRsLkpTLmFzc2VydCghIShkYXRhR3JpZFNwZWMudGFibGVFbGVtZW50ICYmIGRhdGFHcmlkU3BlYy50YWJsZVNwZWMgJiZcbiAgICAgICAgICAgICAgICBkYXRhR3JpZFNwZWMudGFibGVIZWFkZXJTcGVjICYmIGRhdGFHcmlkU3BlYy50YWJsZUNvbHVtblNwZWMpLFxuICAgICAgICAgICAgXCJEYXRhR3JpZFNwZWNCYXNlLWRlcml2ZWQgb2JqZWN0IGRvZXMgbm90IGhhdmUgZW5vdWdoIHRvIHdvcmsgd2l0aC5cIik7XG5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gTWVtYmVyIHZhcmlhYmxlIGRlY2xhcmF0aW9uc1xuICAgICAgICAvL1xuXG4gICAgICAgIC8vIFdlIG5lZWQgYSBEYXRhR3JpZFNwZWNCYXNlLWRlcml2ZWQgdGFibGUgc3BlY2lmaWNhdGlvbi5cbiAgICAgICAgLy8gKFRoaXMgb2JqZWN0IGRlc2NyaWJlcyB0aGUgdGFibGUgYW5kIGltcGxlbWVudHMgY3VzdG9tIGZ1bmN0aW9uYWxpdHlcbiAgICAgICAgLy8gdGhhdCBiZWxvbmdzIHdpdGggd2hvZXZlciBjcmVhdGVkIHRoZSB0YWJsZS4pXG4gICAgICAgIC8vIChTZWUgdGhlIERhdGFHcmlkU3BlY0Jhc2UgY2xhc3MgdG8gc2VlIHdoYXQgY2FuIGJlIGltcGxlbWVudGVkLilcbiAgICAgICAgdGhpcy5fc3BlYyA9IGRhdGFHcmlkU3BlYztcbiAgICAgICAgdGhpcy5fdGFibGUgPSBkYXRhR3JpZFNwZWMudGFibGVFbGVtZW50O1xuICAgICAgICB0aGlzLl90aW1lcnMgPSB7fTtcblxuICAgICAgICB2YXIgdGFibGVCb2R5OkpRdWVyeSA9ICQodGhpcy5fdGFibGVCb2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRib2R5XCIpKTtcblxuICAgICAgICAvLyBGaXJzdCBzdGVwOiBCbG93IGF3YXkgdGhlIG9sZCBjb250ZW50cyBvZiB0aGUgdGFibGVcbiAgICAgICAgJCh0aGlzLl90YWJsZSkuZW1wdHkoKVxuICAgICAgICAgICAgLmF0dHIoeyAnY2VsbHBhZGRpbmcnOiAwLCAnY2VsbHNwYWNpbmcnOiAwIH0pXG4gICAgICAgICAgICAvLyBUT0RPOiBNb3N0IG9mIHRoZXNlIGNsYXNzZXMgYXJlIHByb2JhYmx5IG5vdCBuZWVkZWQgbm93XG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ2RhdGFUYWJsZSBzb3J0YWJsZSBkcmFnYm94ZXMgaGFzdGFibGVjb250cm9scycpXG4gICAgICAgICAgICAuYXBwZW5kKHRhYmxlQm9keSk7XG5cbiAgICAgICAgdmFyIHRhYmxlSGVhZGVyUm93ID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidHJcIikpLmFkZENsYXNzKCdoZWFkZXInKTtcbiAgICAgICAgdmFyIHRhYmxlSGVhZGVyQ2VsbCA9ICQodGhpcy5fdGFibGVIZWFkZXJDZWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRoXCIpKVxuICAgICAgICAgICAgLmFwcGVuZFRvKHRhYmxlSGVhZGVyUm93KTtcbiAgICAgICAgaWYgKGRhdGFHcmlkU3BlYy50YWJsZVNwZWMubmFtZSkge1xuICAgICAgICAgICAgJCh0aGlzLnRhYmxlVGl0bGVTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIikpLnRleHQoZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5uYW1lKS5hcHBlbmRUbyh0YWJsZUhlYWRlckNlbGwpO1xuICAgICAgICB9XG4gICAgICAgIHZhciB3YWl0QmFkZ2UgPSAkKHRoaXMuX3dhaXRCYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpKVxuICAgICAgICAgICAgLmFkZENsYXNzKCd3YWl0YmFkZ2Ugd2FpdCcpLmFwcGVuZFRvKHRhYmxlSGVhZGVyQ2VsbCk7XG4gICAgICAgIGlmICgodGhpcy5fdG90YWxDb2x1bW5Db3VudCA9IHRoaXMuY291bnRUb3RhbENvbHVtbnMoKSkgPiAxKSB7XG4gICAgICAgICAgICB0YWJsZUhlYWRlckNlbGwuYXR0cignY29sc3BhbicsIHRoaXMuX3RvdGFsQ29sdW1uQ291bnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UncmUgYXNrZWQgdG8gc2hvdyB0aGUgaGVhZGVyLCB0aGVuIGFkZCBpdCB0byB0aGUgdGFibGUuICBPdGhlcndpc2Ugd2Ugd2lsbCBsZWF2ZSBpdCBvZmYuXG4gICAgICAgIGlmIChkYXRhR3JpZFNwZWMudGFibGVTcGVjLnNob3dIZWFkZXIpIHtcbiAgICAgICAgICAgIHRhYmxlQm9keS5hcHBlbmQodGFibGVIZWFkZXJSb3cpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQXBwbHkgdGhlIGRlZmF1bHQgY29sdW1uIHZpc2liaWxpdHkgc2V0dGluZ3MuXG4gICAgICAgIHRoaXMucHJlcGFyZUNvbHVtblZpc2liaWxpdHkoKTtcblxuICAgICAgICB2YXIgaGVhZGVyUm93cyA9IHRoaXMuX2hlYWRlclJvd3MgPSB0aGlzLl9idWlsZFRhYmxlSGVhZGVycygpO1xuICAgICAgICB0aGlzLl9oZWFkZXJSb3dzLmZvckVhY2goKHYpID0+IHRhYmxlQm9keS5hcHBlbmQodikpO1xuXG4gICAgICAgIHNldFRpbWVvdXQoICgpID0+IHRoaXMuX2luaXRpYWxpemVUYWJsZURhdGEoKSwgMSApO1xuICAgIH1cblxuXG4gICAgLy8gQnJlYWtpbmcgdXAgdGhlIGluaXRpYWwgdGFibGUgY3JlYXRpb24gaW50byB0d28gc3RhZ2VzIGFsbG93cyB0aGUgYnJvd3NlciB0byByZW5kZXIgYSBwcmVsaW1pbmFyeVxuICAgIC8vIHZlcnNpb24gb2YgdGhlIHRhYmxlIHdpdGggYSBoZWFkZXIgYnV0IG5vIGRhdGEgcm93cywgdGhlbiBjb250aW51ZSBsb2FkaW5nIG90aGVyIGFzc2V0cyBpbiBwYXJhbGxlbC5cbiAgICAvLyBJdCBhY3R1YWxseSBzcGVlZHMgdXAgdGhlIGVudGlyZSB0YWJsZSBjcmVhdGlvbiBhcyB3ZWxsLCBmb3IgcmVhc29ucyB0aGF0IGFyZSBub3QgdmVyeSBjbGVhci5cbiAgICAvLyAoSWYgdGhlIHNldHVwIGlzIE5PVCBydW4gaW4gdHdvIHN0YWdlcywgYWxsIHRoZSAnY3JlYXRlRWxlbWVudCcgY2FsbHMgZm9yIHRoZSBkYXRhIGNlbGxzIHRha2UgbXVjaCBsb25nZXIsXG4gICAgLy8gaW4gRmlyZWZveCBhbmQgU2FmYXJpLCBhY2NvcmRpbmcgdG8gbG9hZC10aW1lIHByb2ZpbGluZyAuLi4gYW5kIG9ubHkgd2hlbiBwYWlyZWQgd2l0aCBzb21lIHNlcnZlcnM/PylcbiAgICBfaW5pdGlhbGl6ZVRhYmxlRGF0YSgpOkRhdGFHcmlkIHtcblxuICAgICAgICB2YXIgaENlbGwgPSB0aGlzLl90YWJsZUhlYWRlckNlbGw7XG5cbiAgICAgICAgRHJhZ2JveGVzLmluaXRUYWJsZSh0aGlzLl90YWJsZSk7XG4gICAgICAgIHRoaXMuX2J1aWxkQWxsVGFibGVTb3J0ZXJzKClcbiAgICAgICAgICAgIC5fYnVpbGRUYWJsZVNvcnRTZXF1ZW5jZXMoKVxuICAgICAgICAgICAgLl9hbGxvY2F0ZVRhYmxlUm93UmVjb3JkcygpXG4gICAgICAgICAgICAuX2J1aWxkUm93R3JvdXBUaXRsZVJvd3MoKVxuICAgICAgICAgICAgLl9jcmVhdGVPcHRpb25zTWVudSgpXG4gICAgICAgICAgICAuX2NyZWF0ZUhlYWRlcldpZGdldHMoKTtcblxuICAgICAgICAvLyBGaXJzdCwgYXBwZW5kIHRoZSBoZWFkZXIgd2lkZ2V0cyB0aGF0IHNob3VsZCB0byBhcHBlYXIgXCJhZnRlclwiIHRoZSBwdWxsZG93bi5cbiAgICAgICAgLy8gKFNpbmNlIGFsbCB3aWRnZXRzIGFyZSBzdHlsZWQgdG8gZmxvYXQgcmlnaHQsIHRoZXkgd2lsbCBhcHBlYXIgZnJvbSByaWdodCB0byBsZWZ0LilcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUoKSkge1xuICAgICAgICAgICAgICAgIHdpZGdldC5hcHBlbmRFbGVtZW50cyhoQ2VsbCwgaW5kZXgudG9TdHJpbmcoMTApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIE5vdyBhcHBlbmQgdGhlICdWaWV3JyBwdWxsZG93biBtZW51XG4gICAgICAgIGhDZWxsLmFwcGVuZENoaWxkKHRoaXMuX29wdGlvbnNNZW51RWxlbWVudCk7XG4gICAgICAgIC8vIEZpbmFsbHksIGFwcGVuZCB0aGUgaGVhZGVyIHdpZGdldHMgdGhhdCBzaG91bGQgYXBwZWFyIFwiYmVmb3JlXCIuXG4gICAgICAgIHRoaXMuX2hlYWRlcldpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKHdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUoKSkge1xuICAgICAgICAgICAgICAgIHdpZGdldC5hcHBlbmRFbGVtZW50cyhoQ2VsbCwgaW5kZXgudG9TdHJpbmcoMTApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5faW5pdGlhbGl6ZVNvcnQoKS5hcnJhbmdlVGFibGVEYXRhUm93cygpO1xuXG4gICAgICAgIC8vIE5vdyB0aGF0IHdlJ3ZlIGNvbnN0cnVjdGVkIG91ciBlbGVtZW50cywgYXBwbHkgdmlzaWJpbGl0eSBzdHlsaW5nIHRvIHRoZW0uXG4gICAgICAgIHRoaXMuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eSgpO1xuXG4gICAgICAgIC8vIFByZXBhcmUgdGhlIHRhYmxlIGZvciBzb3J0aW5nXG4gICAgICAgICAgIHRoaXMuX3ByZXBhcmVTb3J0YWJsZSgpO1xuXG4gICAgICAgIHRoaXMuX3NwZWMub25Jbml0aWFsaXplZCh0aGlzKTtcbiAgICAgICAgJCh0aGlzLl93YWl0QmFkZ2UpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIF9pbml0aWFsaXplU29ydCgpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIGRlZmF1bHRTb3J0ID0gdGhpcy5fc3BlYy50YWJsZVNwZWMuZGVmYXVsdFNvcnQgfHwgMDtcbiAgICAgICAgdGhpcy5fc29ydCA9IFsgeyAnc3BlYyc6IHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjW2RlZmF1bHRTb3J0XSwgJ2FzYyc6IHRydWUgfSBdO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIE5vdGlmeSB0aGUgRGF0YUdyaWQgdGhhdCBpdHMgdW5kZXJseWluZyBkYXRhIGhhcyByZXNldFxuICAgIHRyaWdnZXJEYXRhUmVzZXQoKTpEYXRhR3JpZCB7XG4gICAgICAgIC8vIFdlIGhhdmUgbmV3IGRhdGEgdG8gZGlzcGxheS4gQ2xlYXIgb3V0IG9sZCByb3dzLlxuICAgICAgICAkLmVhY2godGhpcy5fcmVjb3JkRWxlbWVudHMsIChpbmRleDpudW1iZXIsIHZhbHVlOkRhdGFHcmlkUmVjb3JkKSA9PiB7XG4gICAgICAgICAgICB2YWx1ZS5yZW1vdmVFbGVtZW50cygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc3BlYy5vbkRhdGFSZXNldCh0aGlzKTtcbiAgICAgICAgLy8gUmVidWlsZCByb3dzLlxuICAgICAgICB0aGlzLl9idWlsZFRhYmxlU29ydFNlcXVlbmNlcygpLl9hbGxvY2F0ZVRhYmxlUm93UmVjb3JkcygpXG4gICAgICAgIC8vIEFuZCB0aGVuIGFycmFuZ2UgdGhlIHJvd3NcbiAgICAgICAgICAgIC5hcnJhbmdlVGFibGVEYXRhUm93cygpO1xuXG4gICAgICAgIC8vIENhbGwgdGhlIHN1cHBvcnQgZnVuY3Rpb24gaW4gZWFjaCB3aWRnZXQsIHRvIGFwcGx5IHN0eWxpbmcgdG8gYWxsIHRoZSBkYXRhIHJvd3Mgb2YgdGhlIHRhYmxlLlxuICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKHRoaXMuX3JlY29yZEVsZW1lbnRzW2lkXS5nZXREYXRhR3JpZERhdGFSb3dzKCksIGlkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQW5kIG1ha2Ugc3VyZSBvbmx5IHRoZSBjdXJyZW50bHkgdmlzaWJsZSB0aGluZ3MgYXJlIC4uLiB2aXNpYmxlXG4gICAgICAgIHRoaXMuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eSgpO1xuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHdpZGdldC5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgd2lkZ2V0LnJlZnJlc2hXaWRnZXQoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gVXBkYXRlIG9ubHkgdGhlIHRhYmxlIHJvd3MgZm9yIHRoZSBzcGVjaWZpZWQgcmVjb3Jkcy5cbiAgICAvLyBGb3IgdXNlIGluIHNpdHVhdGlvbnMgd2hlcmUgeW91IHdhbnQgdG8gYWRkIHJvd3MsIG9yIHJlYnVpbGQgZXhpc3Rpbmcgcm93cyxcbiAgICAvLyBhbmQgbGVhdmUgdGhlIHJlc3QgdW5jaGFuZ2VkLlxuICAgIHRyaWdnZXJQYXJ0aWFsRGF0YVJlc2V0KHJlY29yZElEczpzdHJpbmdbXSwgcmVmbG93OmJvb2xlYW4pOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fc3BlYy5vblBhcnRpYWxEYXRhUmVzZXQodGhpcywgcmVjb3JkSURzKTtcbiAgICAgICAgLy8gUmVidWlsZCByb3dzLlxuICAgICAgICByZWNvcmRJRHMuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIHRoaXMucmVjb25zdHJ1Y3RTaW5nbGVSZWNvcmQoaWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVmbG93KSB7XG4gICAgICAgICAgICB0aGlzLl9idWlsZFRhYmxlU29ydFNlcXVlbmNlcygpLmFycmFuZ2VUYWJsZURhdGFSb3dzKCk7XG5cbiAgICAgICAgICAgIHRoaXMuX2hlYWRlcldpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LnJlZnJlc2hXaWRnZXQoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gSW5zdHJ1Y3QgRGF0YUdyaWQgdG8gcmVjcmVhdGUvcmVmcmVzaCBldmVyeXRoaW5nIHJlbGF0ZWQgdG8gYSBzaW5nbGUgcmVjb3JkIElELlxuICAgIC8vIFRoaXMgaW5jbHVkZXMgcmVtb3ZpbmcgaXRzIHRhYmxlIHJvd3MsIHJlY29uc3RydWN0aW5nIHRoZW0sIHJlZm9ybWF0dGluZyB0aGVtLCBhbmRcbiAgICAvLyByZS1hZGRpbmcgdGhlIHJvd3MgaW4gdGhlIHNhbWUgcGxhY2UgYXMgdGhlIG9sZCwgYnV0IGRvZXMgTk9UIHJlYnVpbGQgdGhlIHNvcnQgc2VxdWVuY2VzLlxuICAgIC8vICAgTk9URTpcbiAgICAvLyBJdCdzIHF1aXRlIHBvc3NpYmxlIHRoYXQgY2hhbmdlcyB0byB0aGUgYXBwZWFyYW5jZSB3aWxsIGFsdGVyIHRoZSB2aXNpYmlsaXR5IG9mIHRoZSByb3dzIGluXG4gICAgLy8gY29tcGxpY2F0ZWQgd2F5cy4gIEZvciBleGFtcGxlLCB0aGUgZ2VuZXJpYyBzZWFyY2ggd2lkZ2V0IGxvZ2ljIG1heSBkZWNpZGUgdG8gaGlkZSBhIHByZXZpb3VzbHkgc2hvd25cbiAgICAvLyByb3cgb3IgdmljZS12ZXJzYSwgY29ycnVwdGluZyByb3cgc3RyaXBpbmcuICBEbyBub3QgZGVsYXkgdGhlIHJlZmxvdyBmb3IgdG9vIGxvbmcuXG4gICAgcmVjb25zdHJ1Y3RTaW5nbGVSZWNvcmQocmVjb3JkSUQ6c3RyaW5nKTpEYXRhR3JpZCB7XG4gICAgICAgIGlmICh0aGlzLl9yZWNvcmRFbGVtZW50c1tyZWNvcmRJRF0pIHtcbiAgICAgICAgICAgIHRoaXMuX3JlY29yZEVsZW1lbnRzW3JlY29yZElEXS5yZUNyZWF0ZUVsZW1lbnRzSW5QbGFjZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IGlmIHRoZSByZWNvcmQgZGlkbid0IGV4aXN0IGJlZm9yZSwgaXQgd2lsbCBub3QgYXBwZWFyIGluIHRoZSB0YWJsZSBub3csXG4gICAgICAgICAgICAvLyB1bnRpbCBhIGNvbXBsZXRlIHJlZmxvdyBpcyBkb25lIGJ5IHJlYnVpbGRpbmcgc29ydCBzZXF1ZW5jZXMgYW5kIGNhbGxpbmcgYXJyYW5nZVRhYmxlRGF0YVJvd3MuXG4gICAgICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50c1tyZWNvcmRJRF0gPSBuZXcgRGF0YUdyaWRSZWNvcmQodGhpcy5fc3BlYywgcmVjb3JkSUQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRnUmVjb3JkID0gdGhpcy5fcmVjb3JkRWxlbWVudHNbcmVjb3JkSURdO1xuXG4gICAgICAgIC8vIENhbGwgdGhlIHN1cHBvcnQgZnVuY3Rpb24gaW4gZWFjaCB3aWRnZXQsIHRvIGFwcGx5IHN0eWxpbmcgdG8gYWxsIHRoZSBkYXRhIHJvd3Mgb2YgdGhlIHRhYmxlLlxuICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICB3aWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGdSZWNvcmQuZ2V0RGF0YUdyaWREYXRhUm93cygpLCByZWNvcmRJRCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX2hlYWRlcldpZGdldHMuZm9yRWFjaCgod2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICB3aWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGdSZWNvcmQuZ2V0RGF0YUdyaWREYXRhUm93cygpLCByZWNvcmRJRCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIE1ha2Ugc3VyZSBvbmx5IHRoZSBjdXJyZW50bHkgdmlzaWJsZSB0aGluZ3MgYXJlIC4uLiB2aXNpYmxlXG4gICAgICAgIHRoaXMuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eVRvT25lUmVjb3JkKHJlY29yZElEKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9jcmVhdGVPcHRpb25zTWVudSgpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIG1haW5JRCA9IHRoaXMuX3NwZWMudGFibGVTcGVjLmlkO1xuXG4gICAgICAgIC8vIFBvcHVsYXRlIHRoZSBtYXN0ZXIgbGlzdCBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMgYnkgY2FsbGluZyB0aGUgaW5pdGlhbGl6YXRpb24gcm91dGluZSBpbiB0aGUgc3BlY1xuICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMgPSB0aGlzLl9zcGVjLmNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzKHRoaXMpO1xuICAgICAgICB2YXIgaGFzQ3VzdG9tV2lkZ2V0czpib29sZWFuID0gdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmxlbmd0aCA+IDA7XG5cbiAgICAgICAgLy8gQ2hlY2sgaW4gdGhlIGNvbHVtbiBncm91cHMgYW5kIHNlZSBpZiBhbnkgYXJlIGhpZGUtYWJsZVxuICAgICAgICB2YXIgaGFzQ29sdW1uc0luVmlzaWJpbGl0eUxpc3Q6Ym9vbGVhbiA9IHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWMuc29tZSgoZ3JvdXApID0+IHtcbiAgICAgICAgICAgIHJldHVybiBncm91cC5zaG93SW5WaXNpYmlsaXR5TGlzdDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSWYgbm9uZSBvZiB0aGUgZ3JvdXBzIGFyZSBhbGxvd2VkIHRvIGJlIGhpZGRlbiwgYW5kIHdlIGRvbid0IGhhdmUgYW55IGN1c3RvbSBvcHRpb24gd2lkZ2V0cyxcbiAgICAgICAgLy8gZG9uJ3QgYm90aGVyIGNyZWF0aW5nIHRoZSBjb2x1bW4gdmlzaWJpbGl0eSBtZW51XG4gICAgICAgIGlmICghaGFzQ29sdW1uc0luVmlzaWJpbGl0eUxpc3QgJiYgIWhhc0N1c3RvbVdpZGdldHMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlIGhhdmUgY3VzdG9tIHdpZGdldHMsIHdlIG5lZWQgdG8gY2FsbCB0aGVpciBzdXBwb3J0IGZ1bmN0aW9ucyB0aGF0IGFwcGx5IHN0eWxpbmdcbiAgICAgICAgLy8gdG8gYWxsIHRoZSBkYXRhIHJvd3Mgb2YgdGhlIHRhYmxlLlxuICAgICAgICBpZiAoaGFzQ3VzdG9tV2lkZ2V0cykge1xuICAgICAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NwZWMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKHRoaXMuX3JlY29yZEVsZW1lbnRzW2lkXS5nZXREYXRhR3JpZERhdGFSb3dzKCksIGlkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1haW5TcGFuID0gJCh0aGlzLl9vcHRpb25zTWVudUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKSlcbiAgICAgICAgICAgIC5hdHRyKCdpZCcsIG1haW5JRCArICdDb2x1bW5DaG9vc2VyJykuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudScpO1xuXG4gICAgICAgIHZhciBtZW51TGFiZWwgPSAkKHRoaXMuX29wdGlvbnNMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIikpXG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJylcbiAgICAgICAgICAgIC50ZXh0KCdWaWV3XFx1MjVCRScpXG4gICAgICAgICAgICAuY2xpY2soKCkgPT4geyBpZiAobWVudUxhYmVsLmhhc0NsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpKSB0aGlzLl9zaG93T3B0TWVudSgpOyB9KVxuICAgICAgICAgICAgLmFwcGVuZFRvKG1haW5TcGFuKTtcblxuICAgICAgICB2YXIgbWVudUJsb2NrID0gJCh0aGlzLl9vcHRpb25zTWVudUJsb2NrRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIikpXG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudU1lbnVCbG9jayBvZmYnKVxuICAgICAgICAgICAgLmFwcGVuZFRvKG1haW5TcGFuKTtcblxuICAgICAgICAvLyBldmVudCBoYW5kbGVycyB0byBoaWRlIG1lbnUgaWYgY2xpY2tpbmcgb3V0c2lkZSBtZW51IGJsb2NrIG9yIHByZXNzaW5nIEVTQ1xuICAgICAgICAkKGRvY3VtZW50KS5jbGljaygoZXYpID0+IHtcbiAgICAgICAgICAgIHZhciB0ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgaWYgKHQuY2xvc2VzdCh0aGlzLl9vcHRpb25zTWVudUVsZW1lbnQpLnNpemUoKSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2hpZGVPcHRNZW51KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLmtleWRvd24oKGV2KSA9PiB7XG4gICAgICAgICAgICBpZiAoZXYua2V5Q29kZSA9PT0gMjcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9oaWRlT3B0TWVudSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGlmIChoYXNDdXN0b21XaWRnZXRzKSB7XG4gICAgICAgICAgICB2YXIgbWVudUNXTGlzdCA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpKS5hcHBlbmRUbyhtZW51QmxvY2spO1xuICAgICAgICAgICAgaWYgKGhhc0NvbHVtbnNJblZpc2liaWxpdHlMaXN0KSB7XG4gICAgICAgICAgICAgICAgbWVudUNXTGlzdC5hZGRDbGFzcygnd2l0aERpdmlkZXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LmFwcGVuZEVsZW1lbnRzKCQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpKS5hcHBlbmRUbyhtZW51Q1dMaXN0KVswXSwgaW5kZXgudG9TdHJpbmcoMTApKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGhhc0NvbHVtbnNJblZpc2liaWxpdHlMaXN0KSB7XG4gICAgICAgICAgICB2YXIgbWVudUNvbExpc3QgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKSkuYXBwZW5kVG8obWVudUJsb2NrKTtcbiAgICAgICAgICAgIC8vIEFkZCBlYWNoIGhpZGUtYWJsZSBncm91cCB0byB0aGUgbWVudS5cbiAgICAgICAgICAgIC8vIE5vdGU6IFdlIGhhdmUgdG8gd2FsayB0aHJvdWdoIHRoaXMgYW5ldywgYmVjYXVzZSB3ZSdyZSBnb2luZyB0byBtYWtlIHVzZSBvZiB0aGUgaW5kZXggJ2knLlxuICAgICAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYywgaW5kZXg6bnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGl0ZW0sIGNoZWNrYm94LCBpZDtcbiAgICAgICAgICAgICAgICBpZiAoZ3JvdXAuc2hvd0luVmlzaWJpbGl0eUxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlbSA9ICQoJzxsaT4nKS5hcHBlbmRUbyhtZW51Q29sTGlzdCk7XG4gICAgICAgICAgICAgICAgICAgIGlkID0gbWFpbklEICsgJ0NvbHVtbkNoZWNrJyArIGluZGV4O1xuICAgICAgICAgICAgICAgICAgICBjaGVja2JveCA9ICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIj4nKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhpdGVtKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIGlkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5kYXRhKCdjb2x1bW4nLCBncm91cClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuY2xpY2soZ3JvdXAsIChlKSA9PiB0aGlzLl9jbGlja2VkQ29sVmlzaWJpbGl0eUNvbnRyb2woZSkpO1xuICAgICAgICAgICAgICAgICAgICBncm91cC5jaGVja2JveEVsZW1lbnQgPSBjaGVja2JveFswXTtcbiAgICAgICAgICAgICAgICAgICAgJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsIGlkKS50ZXh0KGdyb3VwLm5hbWUpLmFwcGVuZFRvKGl0ZW0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwLmN1cnJlbnRseUhpZGRlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tib3gucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyB1cGRhdGUgY2hlY2tzIGJhc2VkIG9uIHNldHRpbmdzXG4gICAgICAgICAgICB0aGlzLl9mZXRjaFNldHRpbmdzKHRoaXMuX2NvbHVtblNldHRpbmdzS2V5KCksIChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgbWVudUNvbExpc3QuZmluZCgnbGknKS5maW5kKCc6aW5wdXQnKS5lYWNoKChpLCBib3gpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyICRib3ggPSAkKGJveCksIGNvbCA9ICRib3guZGF0YSgnY29sdW1uJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoZGF0YS5pbmRleE9mKGNvbC5uYW1lKSA9PT0gLTEgJiYgISFjb2wuaGlkZGVuQnlEZWZhdWx0KSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEuaW5kZXhPZignLScgKyBjb2wubmFtZSkgPiAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgJGJveC5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5oaWRlQ29sdW1uKGNvbCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAkYm94LnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvd0NvbHVtbihjb2wpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBbXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgX2NyZWF0ZUhlYWRlcldpZGdldHMoKTpEYXRhR3JpZCB7XG4gICAgICAgIC8vIFBvcHVsYXRlIHRoZSBtYXN0ZXIgbGlzdCBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMgYnkgY2FsbGluZyB0aGUgaW5pdGlhbGl6YXRpb24gcm91dGluZSBpbiB0aGUgc3BlY1xuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzID0gdGhpcy5fc3BlYy5jcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKHRoaXMpO1xuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgLy8gQ2FsbCB0aGUgc3VwcG9ydCBmdW5jdGlvbiBpbiBlYWNoIHdpZGdldCwgdG8gYXBwbHkgc3R5bGluZyB0byBhbGwgdGhlIGRhdGEgcm93cyBvZiB0aGUgdGFibGUuXG4gICAgICAgICAgICB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKHRoaXMuX3JlY29yZEVsZW1lbnRzW2lkXS5nZXREYXRhR3JpZERhdGFSb3dzKCksIGlkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBQcmVwYXJlIHRoZSBjb2x1bW4gdmlzaWJpbGl0eSBzdGF0ZSBmb3IgdGhlIHRhYmxlLlxuICAgIC8vIFRoaXMgZnVuY3Rpb24gc2hvdWxkIGJlIGNhbGxlZCBkdXJpbmcgaW5zdGFudGlhdGlvbiwgc2luY2UgaXQgaW5pdGlhbGl6ZXMgdGhlIGNvbHVtbiB2aXNpYmlsaXR5XG4gICAgLy8gdmFyaWFibGVzIHRoYXQgYXJlIHJlZmVycmVkIHRvIHRocm91Z2hvdXQgdGhlIHJlc3Qgb2YgdGhlIERhdGFHcmlkIGNsYXNzLlxuICAgIHByZXBhcmVDb2x1bW5WaXNpYmlsaXR5KCkge1xuICAgICAgICAvLyBGaXJzdCwgcnVuIHRocm91Z2ggYSBzZXF1ZW5jZSBvZiBjaGVja3MgdG8gc2V0IHRoZSAnY3VycmVudGx5SGlkZGVuJyBhdHRyaWJ1dGUgdG8gYSByZWFzb25hYmxlIHZhbHVlLlxuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjLmZvckVhY2goKGdyb3VwOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKSA9PiB7XG4gICAgICAgICAgICAvLyBFc3RhYmxpc2ggd2hhdCB0aGUgZGVmYXVsdCBpcywgYmVmb3JlIGNoZWNraW5nIGFueSBwYXNzZWQtaW4gY29sdW1uIGZsYWdzXG4gICAgICAgICAgICBncm91cC5jdXJyZW50bHlIaWRkZW4gPSAhIWdyb3VwLmhpZGRlbkJ5RGVmYXVsdDtcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBuZWNlc3NhcnkgYXJyYXlzIGFyZSBwcmVzZW50IHRvIGtlZXAgdHJhY2sgb2YgZ3JvdXAgbWVtYmVyc1xuICAgICAgICAgICAgZ3JvdXAubWVtYmVySGVhZGVycyA9IGdyb3VwLm1lbWJlckhlYWRlcnMgfHwgW107XG4gICAgICAgICAgICBncm91cC5tZW1iZXJDb2x1bW5zID0gZ3JvdXAubWVtYmVyQ29sdW1ucyB8fCBbXTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ29sbGVjdCBhbGwgdGhlIGhlYWRlcnMgdW5kZXIgdGhlaXIgcmVzcGVjdGl2ZSBjb2x1bW4gZ3JvdXBzXG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjLmZvckVhY2goKGhlYWRlcikgPT4ge1xuICAgICAgICAgICAgdmFyIGM6bnVtYmVyID0gaGVhZGVyLmNvbHVtbkdyb3VwO1xuICAgICAgICAgICAgaWYgKGMgJiYgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlY1tjIC0gMV0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjW2MgLSAxXS5tZW1iZXJIZWFkZXJzLnB1c2goaGVhZGVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ29sbGVjdCBhbGwgdGhlIGNvbHVtbnMgKGFuZCBpbiB0dXJuIHRoZWlyIGNlbGxzKSB1bmRlciB0aGVpciByZXNwZWN0aXZlIGNvbHVtbiBncm91cHNcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtblNwZWMuZm9yRWFjaCgoY29sKSA9PiB7XG4gICAgICAgICAgICB2YXIgYzpudW1iZXIgPSBjb2wuY29sdW1uR3JvdXA7XG4gICAgICAgICAgICBpZiAoYyAmJiB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjW2MgLSAxXSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWNbYyAtIDFdLm1lbWJlckNvbHVtbnMucHVzaChjb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIFJlYWQgdGhlIGN1cnJlbnQgY29sdW1uIHZpc2liaWxpdHkgc3RhdGUgYW5kIGFsdGVyIHRoZSBzdHlsaW5nIG9mIGhlYWRlcnMgYW5kIGNlbGxzIHRvIHJlZmxlY3QgaXRcblxuICAgIHByaXZhdGUgX2FwcGx5Q29sdW1uVmlzaWJpbGl0eSgpOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYykgPT4ge1xuICAgICAgICAgICAgdmFyIGhpZGRlbiA9IGdyb3VwLmN1cnJlbnRseUhpZGRlbjtcblxuICAgICAgICAgICAgZ3JvdXAubWVtYmVySGVhZGVycy5mb3JFYWNoKChoZWFkZXIpID0+ICQoaGVhZGVyLmVsZW1lbnQpLnRvZ2dsZUNsYXNzKCdvZmYnLCBoaWRkZW4pKTtcblxuICAgICAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucy5mb3JFYWNoKChjb2x1bW4pID0+IHtcbiAgICAgICAgICAgICAgICBjb2x1bW4uZ2V0RW50aXJlSW5kZXgoKS5mb3JFYWNoKChjKSA9PiBoaWRkZW4gPyBjLmhpZGUoKSA6IGMudW5oaWRlKCkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgX2FwcGx5Q29sdW1uVmlzaWJpbGl0eVRvT25lUmVjb3JkKHJlY29yZElEOnN0cmluZyk6RGF0YUdyaWQge1xuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjLmZvckVhY2goKGdyb3VwOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKSA9PiB7XG4gICAgICAgICAgICB2YXIgaGlkZGVuID0gZ3JvdXAuY3VycmVudGx5SGlkZGVuO1xuICAgICAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucy5mb3JFYWNoKChjb2x1bW4pID0+IHtcbiAgICAgICAgICAgICAgICBjb2x1bW4uY2VsbEluZGV4QXRJRChyZWNvcmRJRCkuZm9yRWFjaCgoYykgPT4gaGlkZGVuID8gYy5oaWRlKCkgOiBjLnVuaGlkZSgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBHZXQgdGhlIGxpc3Qgb2YgSURzLCB0aGVuIGZpbHRlciBpdCBkb3duIHRvIHdoYXQncyB2aXNpYmxlLFxuICAgIC8vIHRoZW4gc2VhcmNoIHRoZSB2aXNpYmxlIHJvd3MgZm9yIHNwZWMtbWFuZGF0ZWQgY2hlY2tib3ggZWxlbWVudHMsXG4gICAgLy8gYW5kIGlmIGEgY2hlY2tib3ggaXMgY2hlY2tlZCwgcmV0dXJuIGl0cyBlbGVtZW50IG9uIGFuIGFycmF5LlxuICAgIGdldFNlbGVjdGVkQ2hlY2tib3hFbGVtZW50cygpOkhUTUxJbnB1dEVsZW1lbnRbXSB7XG4gICAgICAgIHZhciBzZXF1ZW5jZTpzdHJpbmdbXSA9IHRoaXMuX2dldFNlcXVlbmNlKHRoaXMuX3NvcnRbMF0pO1xuXG4gICAgICAgIC8vIFZlcmlmeSB0aGF0IHRoZSByb3cgc2V0cyByZWZlcnJlZCB0byBieSB0aGUgSURzIGFjdHVhbGx5IGV4aXN0XG4gICAgICAgIHZhciBmaWx0ZXJlZFNlcXVlbmNlID0gc2VxdWVuY2UuZmlsdGVyKCh2KSA9PiB7IHJldHVybiAhIXRoaXMuX3JlY29yZEVsZW1lbnRzW3ZdOyB9KTtcblxuICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlID0gdGhpcy5hcHBseUFsbFdpZGdldEZpbHRlcmluZyhmaWx0ZXJlZFNlcXVlbmNlKTtcblxuICAgICAgICB2YXIgY2hlY2tlZEJveGVzOkhUTUxJbnB1dEVsZW1lbnRbXSA9IFtdO1xuICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlLmZvckVhY2goKHYpID0+IHtcbiAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy5fcmVjb3JkRWxlbWVudHNbdl0uZ2V0RGF0YUdyaWREYXRhUm93cygpO1xuICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXJvdy5kYXRhR3JpZERhdGFDZWxscykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJvdy5kYXRhR3JpZERhdGFDZWxscy5mb3JFYWNoKChjZWxsKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaGVja2JveCA9IGNlbGwuZ2V0Q2hlY2tib3hFbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaGVja2JveCAmJiBjaGVja2JveC5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGVja2VkQm94ZXMucHVzaChjaGVja2JveCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNoZWNrZWRCb3hlcztcbiAgICB9XG5cblxuICAgIGFwcGx5U29ydEluZGljYXRvcnMoKSB7XG4gICAgICAgIGlmICh0aGlzLl9oZWFkZXJSb3dzKSB7XG4gICAgICAgICAgICAkKHRoaXMuX2hlYWRlclJvd3MpLmZpbmQoJy5zb3J0ZWR1cCwgLnNvcnRlZGRvd24nKS5yZW1vdmVDbGFzcygnc29ydGVkdXAgc29ydGVkZG93bicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3NvcnQuZm9yRWFjaCgoc29ydCkgPT4ge1xuICAgICAgICAgICAgJChzb3J0LnNwZWMuZWxlbWVudCkuYWRkQ2xhc3Moc29ydC5hc2MgPyAnc29ydGVkZG93bicgOiAnc29ydGVkdXAnKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBhcnJhbmdlVGFibGVEYXRhUm93cygpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIHN0cmlwaW5nID0gMTtcblxuICAgICAgICAvLyBXZSBjcmVhdGUgYSBkb2N1bWVudCBmcmFnbWVudCAtIGEga2luZCBvZiBjb250YWluZXIgZm9yIGRvY3VtZW50LXJlbGF0ZWQgb2JqZWN0cyB0aGF0IHdlIGRvbid0XG4gICAgICAgIC8vIHdhbnQgaW4gdGhlIHBhZ2UgLSBhbmQgYWNjdW11bGF0ZSBpbnNpZGUgaXQgYWxsIHRoZSByb3dzIHdlIHdhbnQgdG8gZGlzcGxheSwgaW4gc29ydGVkIG9yZGVyLlxuICAgICAgICB2YXIgZnJhZyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblxuICAgICAgICB0aGlzLmFwcGx5U29ydEluZGljYXRvcnMoKTtcblxuICAgICAgICB2YXIgc2VxdWVuY2UgPSB0aGlzLl9nZXRTZXF1ZW5jZSh0aGlzLl9zb3J0WzBdKTtcblxuICAgICAgICAvLyBWZXJpZnkgdGhhdCB0aGUgcm93IHNldHMgcmVmZXJyZWQgdG8gYnkgdGhlIElEcyBhY3R1YWxseSBleGlzdFxuICAgICAgICB2YXIgZmlsdGVyZWRTZXF1ZW5jZSA9IHNlcXVlbmNlLmZpbHRlcigodikgPT4geyByZXR1cm4gISF0aGlzLl9yZWNvcmRFbGVtZW50c1t2XTsgfSk7XG4gICAgICAgIHZhciB1bmZpbHRlcmVkU2VxdWVuY2UgPSBmaWx0ZXJlZFNlcXVlbmNlLnNsaWNlKDApO1xuXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgdGhlIGdyb3VwaW5nIHRpdGxlIHJvd3MgZnJvbSB0aGUgdGFibGUgYXMgd2VsbCwgaWYgdGhleSB3ZXJlIHRoZXJlXG4gICAgICAgIHZhciByb3dHcm91cFNwZWMgPSB0aGlzLl9zcGVjLnRhYmxlUm93R3JvdXBTcGVjO1xuICAgICAgICByb3dHcm91cFNwZWMuZm9yRWFjaCgocm93R3JvdXApID0+IHtcbiAgICAgICAgICAgIHZhciByID0gcm93R3JvdXAuZGlzY2xvc2VkVGl0bGVSb3c7XG4gICAgICAgICAgICBpZiAoci5wYXJlbnROb2RlKSB7IC8vIEFzIHdpdGggcmVndWxhciByb3dzLCB3ZSdyZSBhc3N1bWluZyB0aGUgcm93IGlzIGEgY2hpbGQgb25seSBvZiB0aGlzIHRhYmxlIGJvZHkuXG4gICAgICAgICAgICAgICAgdGhpcy5fdGFibGVCb2R5LnJlbW92ZUNoaWxkKHIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgciA9IHJvd0dyb3VwLnVuZGlzY2xvc2VkVGl0bGVSb3c7XG4gICAgICAgICAgICBpZiAoci5wYXJlbnROb2RlKSB7IC8vIEFzIHdpdGggcmVndWxhciByb3dzLCB3ZSdyZSBhc3N1bWluZyB0aGUgcm93IGlzIGEgY2hpbGQgb25seSBvZiB0aGlzIHRhYmxlIGJvZHkuXG4gICAgICAgICAgICAgICAgdGhpcy5fdGFibGVCb2R5LnJlbW92ZUNoaWxkKHIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gV2hpbGUgd2UncmUgaGVyZSwgcmVzZXQgdGhlIG1lbWJlciByZWNvcmQgYXJyYXlzLiAgV2UgbmVlZCB0byByZWJ1aWxkIHRoZW0gcG9zdC1maWx0ZXJpbmcuXG4gICAgICAgICAgICByb3dHcm91cC5tZW1iZXJSZWNvcmRzID0gW107XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZpbHRlcmVkU2VxdWVuY2UgPSB0aGlzLmFwcGx5QWxsV2lkZ2V0RmlsdGVyaW5nKGZpbHRlcmVkU2VxdWVuY2UpO1xuXG4gICAgICAgIC8vIENhbGwgdG8gZGV0YWNoIG9ubHkgdGhlIHJvd3MgdGhhdCBkaWRuJ3QgbWFrZSBpdCB0aHJvdWdoIHRoZSBmaWx0ZXIuXG4gICAgICAgIC8vIFRoZSBvdGhlcnMgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IGRldGFjaGVkIGJ5IGJlaW5nIG1vdmVkIHRvIHRoZSBkb2N1bWVudCBmcmFnbWVudC5cbiAgICAgICAgdmFyIGFkZGVkUm93SURzID0ge307XG4gICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIGFkZGVkUm93SURzW2lkXSA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICB1bmZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIGlmICghYWRkZWRSb3dJRHNbaWRdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHNbaWRdLmRldGFjaEVsZW1lbnRzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIE5vdyB3ZSBydW4gdGhyb3VnaCB0aGUgcmVtYWluaW5nIElEcyBhbmQgYWRkIHRoZWlyIHJvd3MgdG8gdGhlIHRhYmxlLCB3aXRoIHN0cmlwaW5nLlxuICAgICAgICAvLyBCdXQgaWYgZ3JvdXBpbmcgaXMgZW5hYmxlZCBhbmQgdGhlcmUgaXMgYXQgbGVhc3Qgb25lIGdyb3VwLCB3ZSBhZGQgdGhlbSBhIGZldyBhdCBhIHRpbWUsXG4gICAgICAgIC8vIHByb2NlZWRpbmcgdGhyb3VnaCBlYWNoIGdyb3VwLlxuXG4gICAgICAgIGlmICghdGhpcy5fZ3JvdXBpbmdFbmFibGVkIHx8IHJvd0dyb3VwU3BlYy5sZW5ndGggPCAxKSB7ICAgIC8vIFRoZSBzdGFuZGFyZCBub24tZ3JvdXBlZCBtZXRob2Q6XG5cbiAgICAgICAgICAgIGlmICh0aGlzLl9zcGVjLnRhYmxlU3BlYy5hcHBseVN0cmlwaW5nKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZS5mb3JFYWNoKChzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN0cmlwaW5nID0gMSAtIHN0cmlwaW5nO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50c1tzXS5hcHBseVN0cmlwaW5nKHN0cmlwaW5nKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgocykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy5fcmVjb3JkRWxlbWVudHNbc10uZ2V0RWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICByb3dzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBmcmFnLmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9IGVsc2UgeyAgICAvLyBUaGUgbW9yZSBjb21wbGljYXRlZCwgZ3JvdXBlZCBtZXRob2Q6XG5cbiAgICAgICAgICAgIHZhciBzdHJpcGVTdHlsZXMgPSBbJ3N0cmlwZVJvd0EnLCdzdHJpcGVSb3dCJ107XG4gICAgICAgICAgICB2YXIgc3RyaXBlU3R5bGVzSm9pbiA9IHN0cmlwZVN0eWxlcy5qb2luKCcgJyk7XG5cbiAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgocykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByb3dHcm91cCA9IHJvd0dyb3VwU3BlY1t0aGlzLl9zcGVjLmdldFJvd0dyb3VwTWVtYmVyc2hpcChzKV07XG4gICAgICAgICAgICAgICAgcm93R3JvdXAubWVtYmVyUmVjb3Jkcy5wdXNoKHRoaXMuX3JlY29yZEVsZW1lbnRzW3NdKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgcm93R3JvdXBTcGVjLmZvckVhY2goKHJvd0dyb3VwKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJvd0dyb3VwLm1lbWJlclJlY29yZHMubGVuZ3RoIDwgMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSdzIG5vdGhpbmcgaW4gdGhlIGdyb3VwIChtYXkgaGF2ZSBhbGwgYmVlbiBmaWx0ZXJlZCBvdXQpIHNraXAgaXRcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzdHJpcGluZyA9IDEgLSBzdHJpcGluZztcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fc3BlYy50YWJsZVNwZWMuYXBwbHlTdHJpcGluZykge1xuICAgICAgICAgICAgICAgICAgICByb3dHcm91cC51bmRpc2Nsb3NlZFRpdGxlUm93SlEuYWRkKHJvd0dyb3VwLmRpc2Nsb3NlZFRpdGxlUm93SlEpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3Moc3RyaXBlU3R5bGVzSm9pbikuYWRkQ2xhc3Moc3RyaXBlU3R5bGVzW3N0cmlwaW5nXSkuZW5kKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghcm93R3JvdXAuZGlzY2xvc2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSBncm91cCBpcyBub3QgZGlzY2xvc2VkLCBqdXN0IHByaW50IHRoZSBcInVuZGlzY2xvc2VkXCIgdGl0bGUgcm93LCBhbmQgc2tpcCB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gcm93cyB0aGVtc2VsdmVzIChidXQgaW52ZXJ0IHRoZSBzdHJpcGluZyB2YWx1ZSBzbyB0aGUgc3RyaXBpbmcgcGF0dGVybiBpc24ndCBkaXN0dXJiZWQpXG4gICAgICAgICAgICAgICAgICAgIGZyYWcuYXBwZW5kQ2hpbGQocm93R3JvdXAudW5kaXNjbG9zZWRUaXRsZVJvdyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZnJhZy5hcHBlbmRDaGlsZChyb3dHcm91cC5kaXNjbG9zZWRUaXRsZVJvdyk7XG5cbiAgICAgICAgICAgICAgICAgcm93R3JvdXAubWVtYmVyUmVjb3Jkcy5mb3JFYWNoKChyZWNvcmQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3RyaXBpbmcgPSAxIC0gc3RyaXBpbmc7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9zcGVjLnRhYmxlU3BlYy5hcHBseVN0cmlwaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWNvcmQuYXBwbHlTdHJpcGluZyhzdHJpcGluZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHJvd3MgPSByZWNvcmQuZ2V0RWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyYWcuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbWVtYmVyIHRoYXQgd2UgbGFzdCBzb3J0ZWQgYnkgdGhpcyBjb2x1bW5cbiAgICAgICAgdGhpcy5fdGFibGVCb2R5LmFwcGVuZENoaWxkKGZyYWcpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gR2l2ZW4gYW4gYXJyYXkgb2YgcmVjb3JkIElEcywgc2VuZCB0aGUgYXJyYXkgdGhyb3VnaCB0aGUgZmlsdGVyaW5nIGZ1bmN0aW9uIGZvciBlYWNoIG9mXG4gICAgLy8gdGhlIGhlYWRlciB3aWRnZXRzLCBhbmQgZWFjaCBvZiB0aGUgb3B0aW9ucyBtZW51IHdpZGdldHMsIHRoZW4gcmV0dXJuIHRoZSBmaWx0ZXJlZCBhcnJheS5cbiAgICBhcHBseUFsbFdpZGdldEZpbHRlcmluZyhmaWx0ZXJlZFNlcXVlbmNlOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG4gICAgICAgIC8vIEdpdmUgZWFjaCBoZWFkZXIgd2lkZ2V0IGEgY2hhbmNlIHRvIGFwcGx5IGZpbHRlcmluZ1xuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZSA9IHdpZGdldC5hcHBseUZpbHRlclRvSURzKGZpbHRlcmVkU2VxdWVuY2UpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBHaXZlIGVhY2ggd2lkZ2V0IGluIHRoZSBvcHRpb25zIG1lbnUgYSBjaGFuY2UgdG8gYXBwbHkgZmlsdGVyaW5nXG4gICAgICAgIHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UgPSB3aWRnZXQuYXBwbHlGaWx0ZXJUb0lEcyhmaWx0ZXJlZFNlcXVlbmNlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZFNlcXVlbmNlO1xuICAgIH1cblxuXG4gICAgLy8gQWRkIHVwIGFsbCB0aGUgY29sdW1uIGNvdW50cyBpbiB0aGUgaGVhZGVyc3BlYywgdG8gYXJyaXZlIGF0IGEgZ3JhbmQgdG90YWwgZm9yIHRoZSB0YWJsZS5cbiAgICBnZXRTcGVjKCk6YW55IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWM7ICAgIC8vIEYqKiogdHlwZSBjb252ZXJzaW9uIEYqKiogdGhpbmdzIHVwIHdoZW4gc3ViY2xhc3NpbmdcbiAgICB9XG5cblxuICAgIC8vIEFkZCB1cCBhbGwgdGhlIGNvbHVtbiBjb3VudHMgaW4gdGhlIGhlYWRlcnNwZWMsIHRvIGFycml2ZSBhdCBhIGdyYW5kIHRvdGFsIGZvciB0aGUgdGFibGUuXG4gICAgY291bnRUb3RhbENvbHVtbnMoKTpudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fc3BlYy50YWJsZUhlYWRlclNwZWMucmVkdWNlKChwcmV2LCB2KTpudW1iZXIgPT4ge1xuICAgICAgICAgICAgaWYgKHYuaGVhZGVyUm93KSB7XG4gICAgICAgICAgICAgICAgaWYgKHYuaGVhZGVyUm93ID4gMSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcHJldiArICh2LmNvbHNwYW4gPyB2LmNvbHNwYW4gOiAxKTtcbiAgICAgICAgfSwgMCk7XG4gICAgfVxuXG5cbiAgICAvLyBXYWxrIHRocm91Z2ggZWFjaCBoZWFkZXIgaW4gdGhlIHNwZWMsIGFuZCBsb29rIGZvciBhIFwic29ydEJ5XCIgZnVuY3Rpb24uXG4gICAgLy8gSWYgb25lIGlzIGZvdW5kLCB1c2UgaXQgdG8gY29uc3RydWN0IGEgc29ydGluZyBmdW5jdGlvblxuICAgIHByaXZhdGUgX2J1aWxkQWxsVGFibGVTb3J0ZXJzKCk6RGF0YUdyaWQge1xuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChoZWFkZXIuc29ydEJ5KSB7XG4gICAgICAgICAgICAgICAgaGVhZGVyLnNvcnRGdW5jID0gdGhpcy5idWlsZFRhYmxlU29ydGVyKGhlYWRlci5zb3J0QnkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBHaXZlbiBhIGNvbXBhcmlzb24gZnVuY3Rpb24sXG4gICAgLy8gY29uc3RydWN0IGEgZnVuY3Rpb24gc3VpdGFibGUgZm9yIHBhc3NpbmcgdG8gSmF2YXNjcmlwdCdzIFwic29ydFwiLlxuICAgIGJ1aWxkVGFibGVTb3J0ZXIobG9va3VwRnVuYzogKHJvd0luZGV4Om51bWJlcikgPT4gYW55KTogKHg6bnVtYmVyLCB5Om51bWJlcikgPT4gbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIChyb3dJbmRleEE6bnVtYmVyLCByb3dJbmRleEI6bnVtYmVyKSA9PiB7XG4gICAgICAgICAgICB2YXIgYSA9IGxvb2t1cEZ1bmMuY2FsbCh0aGlzLl9zcGVjLCByb3dJbmRleEEpO1xuICAgICAgICAgICAgdmFyIGIgPSBsb29rdXBGdW5jLmNhbGwodGhpcy5fc3BlYywgcm93SW5kZXhCKTtcbiAgICAgICAgICAgIHJldHVybiAoPGFueT4oYSA+IGIpIC0gPGFueT4oYiA+IGEpKTsgLy8gdHJ1ZSBiZWNvbWVzIDEsIGZhbHNlIGJlY29tZXMgMFxuICAgICAgICB9O1xuICAgIH1cblxuXG4gICAgLy8gU3RhcnQgd2l0aCB0aGUgYXJyYXkgb2YgSURzIGdpdmVuIGluIHRoZSBzcGVjLiAgVGhlbiwgZm9yIGVhY2ggaGVhZGVyLCBidWlsZCBhIHNvcnRlZCBjb3B5IG9mIHRoZSBhcnJheSxcbiAgICAvLyBhbmQgc2F2ZSB0aGUgc29ydGVkIGNvcHkgaW50byB0aGUgaGVhZGVyIGluZm9ybWF0aW9uLlxuICAgIC8vXG4gICAgLy8gU29tZSBzb3J0IHNlcXVlbmNlcyBtYXkgcmVseSBvbiB0aGUgc29ydCBzZXF1ZW5jZXMgb2Ygb3RoZXIgaGVhZGVycy5cbiAgICAvLyBJbiB0aGUgY29kZSBiZWxvdywgdGhlc2UgYXJlIGZvbGxvd2VkIGxpa2UgYSBkZXBlbmRlbmN5IHRyZWUuXG4gICAgLy8gV2UgZG8gdGhpcyBieSB0cmFja2luZyB0aGUgdW5zb3J0ZWQgaGVhZGVycyBpbiBhIHNldCwgYW5kIGxvb3BpbmcgdGhyb3VnaCB0aGUgc2V0LlxuICAgIC8vIEV2ZXJ5IHRpbWUgd2UgZmluZCBhIGhlYWRlciB0aGF0IHdlIGNhbiBzdWNjZXNzZnVsbHkgc29ydCAtIHdoZXRoZXIgYmVjYXVzZSB0aGUgcHJlcmVxdWlzaXRlIGhlYWRlciBpcyBhbHJlYWR5XG4gICAgLy8gc29ydGVkLCBvciBiZWNhdXNlIGl0IGhhcyBubyBwcmVyZXF1aXNpdGUgLSB3ZSBzb3J0IGl0IGFuZCByZW1vdmUgaXQgZnJvbSB0aGUgc2V0LlxuICAgIC8vIElmIHdlIGV2ZXIgbG9vcCB0aHJvdWdoIHRoZSBzZXQgYW5kIGZhaWwgdG8gcmVtb3ZlIGV2ZW4gb25lIGl0ZW0gZnJvbSBpdCwgd2UgZ2l2ZSB1cCxcbiAgICAvLyBzaW5jZSB0aGVyZSBtdXN0IGJlIGEgZGVwZW5kZW5jeSBsb29wLlxuICAgIC8vIEl0J3Mgbm90IHRoZSBmYXN0ZXN0IG1ldGhvZCBvbiB0aGUgcGxhbmV0LCBidXQgaXQncyBnb29kIGVub3VnaCwgc2luY2Ugd2UnbGwgcHJvYmFibHkgbmV2ZXIgaGF2ZSBhbnkgbW9yZSB0aGFuIDEwIG9yIHNvIGhlYWRlcnMuXG4gICAgcHJpdmF0ZSBfYnVpbGRUYWJsZVNvcnRTZXF1ZW5jZXMoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciB1bnNvcnRlZEhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXTtcbiAgICAgICAgdmFyIHNvcnRlZEF0TGVhc3RPbmVOZXdIZWFkZXI6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAvLyBEZWNsYXJlIGFsbCB0aGUgaGVhZGVycyB1bnNvcnRlZCwgYW5kIGFkZCB0aGVtIHRvIHRoZSB1bnNvcnRlZCBzZXQuXG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjLmZvckVhY2goKGhlYWRlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGhlYWRlci5zb3J0SWQpIHsgICAgICAgICAvLyBhbnl0aGluZyB3aXRoIHNvcnRJZCBpcyBzb3J0ZWQgc2VydmVyLXNpZGUgYWxyZWFkeVxuICAgICAgICAgICAgICAgIGhlYWRlci5zb3J0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChoZWFkZXIuc29ydEZ1bmMpIHsgICAgICAgICAgIC8vIG9ubHkgYWRkIGhlYWRlcnMgd2l0aCBzb3J0IGZ1bmN0aW9uc1xuICAgICAgICAgICAgICAgIHVuc29ydGVkSGVhZGVycy51bnNoaWZ0KGhlYWRlcik7ICAgIC8vIGFkZCBpbiBmcm9udCwgc28gc2V0IGlzIHJldmVyc2VkXG4gICAgICAgICAgICAgICAgaGVhZGVyLnNvcnRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgc29ydGVkQXRMZWFzdE9uZU5ld0hlYWRlciA9IGZhbHNlO1xuICAgICAgICAgICAgLy8gdXNlIHNsaWNlIHNvIHRoYXQgc3BsaWNlIGluc2lkZSB0aGUgY2FsbGJhY2sgZG9lcyBub3QgaW50ZXJmZXJlIHdpdGggbG9vcFxuICAgICAgICAgICAgdW5zb3J0ZWRIZWFkZXJzLnNsaWNlKDApLmZvckVhY2goKGhlYWRlciwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYWZ0ZXI7XG4gICAgICAgICAgICAgICAgaWYgKGhlYWRlci5zb3J0QWZ0ZXIgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBhZnRlciA9IHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjW2hlYWRlci5zb3J0QWZ0ZXJdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFmdGVyLnNvcnRlZCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLl9zZXF1ZW5jZVtoZWFkZXIuaWRdID0gdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKTtcbiAgICAgICAgICAgICAgICBpZiAoYWZ0ZXIgJiYgYWZ0ZXIuaWQgJiYgdGhpcy5fc2VxdWVuY2VbYWZ0ZXIuaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlcXVlbmNlW2hlYWRlci5pZF0gPSB0aGlzLl9zZXF1ZW5jZVthZnRlci5pZF0uc2xpY2UoMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuX3NlcXVlbmNlW2hlYWRlci5pZF0uc29ydChoZWFkZXIuc29ydEZ1bmMpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3NlcXVlbmNlWyctJytoZWFkZXIuaWRdID0gdGhpcy5fc2VxdWVuY2VbaGVhZGVyLmlkXS5zbGljZSgwKS5yZXZlcnNlKCk7XG4gICAgICAgICAgICAgICAgaGVhZGVyLnNvcnRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdW5zb3J0ZWRIZWFkZXJzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgc29ydGVkQXRMZWFzdE9uZU5ld0hlYWRlciA9IHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSB3aGlsZSAoc29ydGVkQXRMZWFzdE9uZU5ld0hlYWRlcik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfZ2V0U2VxdWVuY2Uoc29ydDpEYXRhR3JpZFNvcnQpOnN0cmluZ1tdIHtcbiAgICAgICAgdmFyIGtleSA9IChzb3J0LmFzYyA/ICcnIDogJy0nKSArIHNvcnQuc3BlYy5pZCxcbiAgICAgICAgICAgIHNlcXVlbmNlID0gdGhpcy5fc2VxdWVuY2Vba2V5XTtcbiAgICAgICAgaWYgKHNlcXVlbmNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZXF1ZW5jZTtcblxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfYnVpbGRUYWJsZUhlYWRlcnMoKTpIVE1MRWxlbWVudFtdIHtcbiAgICAgICAgLy8gRmluZCB0aGUgbWluaW11bSBudW1iZXIgb2Ygcm93cyB3ZSBuZWVkIHRvIGNyZWF0ZSB0byBjb250YWluIGFsbCB0aGUgaGVhZGVyc1xuICAgICAgICB2YXIgbWF4aGVhZGVyUm93Om51bWJlciA9IHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjLnJlZHVjZShcbiAgICAgICAgICAgICAgICAocHJldjpudW1iZXIsIHYpID0+IHsgcmV0dXJuIE1hdGgubWF4KHByZXYsIHYuaGVhZGVyUm93IHx8IDApOyB9LCAxKTtcblxuICAgICAgICAvLyBDcmVhdGUgZW5vdWdoIHJvd3MgdG8gY29udGFpbiB0aGUgaGVhZGVycyAodXN1YWxseSBqdXN0IDEpXG4gICAgICAgIHZhciByb3dFbGVtZW50czpIVE1MRWxlbWVudFtdID0gW107XG4gICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCBtYXhoZWFkZXJSb3c7IGkrKykge1xuICAgICAgICAgICAgdmFyIHJvdyA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpKS5hZGRDbGFzcygnY29sdW1uTGFiZWxzJyk7XG4gICAgICAgICAgICByb3dFbGVtZW50cy5wdXNoKHJvd1swXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSdW4gdGhyb3VnaCBlYWNoIGluZGl2aWR1YWwgaGVhZGVyLCBjcmVhdGUgaXQgYWNjb3JkaW5nIHRvIHRoZSBzcGVjcywgYW5kIGFkZCBpdCB0byB0aGUgYXBwcm9wcmlhdGUgcm93LlxuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIsIGksIHNyYykgPT4ge1xuICAgICAgICAgICAgdmFyIGNvbW1vbkNzczp7fSA9IHtcbiAgICAgICAgICAgICAgICAnd2lkdGgnOiBoZWFkZXIud2lkdGggP1xuICAgICAgICAgICAgICAgICAgICAoaGVhZGVyLndpZHRoLnN1YnN0cigtMSkgIT09ICclJyA/IGhlYWRlci53aWR0aCArICdweCcgOiBoZWFkZXIud2lkdGgpIDpcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHZhciBjc3M6e30gPSAkLmV4dGVuZCh7XG4gICAgICAgICAgICAgICAgJ3RleHQtYWxpZ24nOiBoZWFkZXIuYWxpZ24sXG4gICAgICAgICAgICAgICAgJ3ZlcnRpY2FsLWFsaWduJzogaGVhZGVyLnZhbGlnbixcbiAgICAgICAgICAgICAgICAnZGlzcGxheSc6IGhlYWRlci5kaXNwbGF5XG4gICAgICAgICAgICB9LCBjb21tb25Dc3MpO1xuICAgICAgICAgICAgaGVhZGVyLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGhcIik7XG4gICAgICAgICAgICB2YXIgY2VsbDpKUXVlcnkgPSAkKGhlYWRlci5lbGVtZW50KS5jc3MoY3NzKS5hdHRyKHtcbiAgICAgICAgICAgICAgICAgICAgJ2lkJzogaGVhZGVyLmlkLFxuICAgICAgICAgICAgICAgICAgICAnY29sc3Bhbic6IGhlYWRlci5jb2xzcGFuID4gMSA/IGhlYWRlci5jb2xzcGFuIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAncm93c3Bhbic6IGhlYWRlci5yb3dzcGFuID4gMSA/IGhlYWRlci5yb3dzcGFuIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAnY2xhc3MnOiBoZWFkZXIuc2l6ZSA9PT0gJ3MnID8gJ3NtYWxsZXInIDogdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgfSkuYXBwZW5kVG8ocm93RWxlbWVudHNbTWF0aC5tYXgoaGVhZGVyLmhlYWRlclJvdyB8fCAxLCAxKSAtIDFdKTtcbiAgICAgICAgICAgIGlmIChoZWFkZXIuc29ydEJ5KSB7XG4gICAgICAgICAgICAgICAgY2VsbC5hZGRDbGFzcygnc29ydGhlYWRlcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhlYWRlci5uYW1lKSB7XG4gICAgICAgICAgICAgICAgJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpKS5hcHBlbmRUbyhjZWxsKS50ZXh0KGhlYWRlci5uYW1lKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICdjbGFzcyc6IGhlYWRlci5ub3dyYXAgPyAnbm93cmFwJyA6IHVuZGVmaW5lZCB9KS5jc3MoY29tbW9uQ3NzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFJlbW92ZSB0aGUgcmlnaHQtc2lkZSBib3JkZXIgbGluZSBmcm9tIHRoZSBsYXN0IGVsZW1lbnQgb2YgZWFjaCByb3dcbiAgICAgICAgcm93RWxlbWVudHMuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICB2YXIgbDphbnkgPSByb3cubGFzdENoaWxkO1xuICAgICAgICAgICAgaWYgKGwpIHsgbC5zdHlsZS5ib3JkZXJSaWdodCA9ICcwJyB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByb3dFbGVtZW50cztcbiAgICB9XG5cblxuICAgIC8vIEJ1aWxkIHRoZSByb3dzIChhbmQgdGhlIGNvbnRlbnRzIG9mIHRoZSByb3dzKSBmb3IgZWFjaCByZWNvcmQgaW4gdGhlIGRhdGEuXG4gICAgLy8gKFNlZSB0aGUgRGF0YUdyaWREYXRhQ2VsbCBjbGFzcy4pXG4gICAgcHJpdmF0ZSBfYWxsb2NhdGVUYWJsZVJvd1JlY29yZHMoKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3JlY29yZEVsZW1lbnRzID0gbmV3IERhdGFHcmlkUmVjb3JkU2V0KCk7XG4gICAgICAgIHRoaXMuX3NwZWMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX3JlY29yZEVsZW1lbnRzW2lkXSA9IG5ldyBEYXRhR3JpZFJlY29yZCh0aGlzLl9zcGVjLCBpZCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIEFzc2VtYmxlIHRhYmxlIHJvd3MgLSBkaXNjbG9zZWQgYW5kIHVuZGlzY2xvc2VkIHZlcnNpb25zICh3aXRoIGNhbGxiYWNrcykgLVxuICAgIC8vIHRoYXQgYWN0IGFzIHRpdGxlcyBmb3IgdGhlIGRpZmZlcmVudCBncm91cHMgd2hlbiB0aGUgdGFibGUgaXMgaW4gZ3JvdXBpbmcgbW9kZS5cbiAgICBwcml2YXRlIF9idWlsZFJvd0dyb3VwVGl0bGVSb3dzKCk6RGF0YUdyaWQge1xuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlUm93R3JvdXBTcGVjLmZvckVhY2goKG9uZUdyb3VwLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgb25lR3JvdXAuZGlzY2xvc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIG9uZUdyb3VwLm1lbWJlclJlY29yZHMgPSBbXTtcblxuICAgICAgICAgICAgdmFyIHJvdyA9IG9uZUdyb3VwLmRpc2Nsb3NlZFRpdGxlUm93SlEgPSAkKG9uZUdyb3VwLmRpc2Nsb3NlZFRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcygnZ3JvdXBIZWFkZXInKS5jbGljaygoKSA9PiB0aGlzLl9jb2xsYXBzZVJvd0dyb3VwKGluZGV4KSk7XG4gICAgICAgICAgICB2YXIgY2VsbCA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRkXCIpKS5hcHBlbmRUbyhyb3cpO1xuICAgICAgICAgICAgJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpKS5hcHBlbmRUbyhjZWxsKS50ZXh0KFwiXFx1MjVCQSBcIiArIG9uZUdyb3VwLm5hbWUpO1xuICAgICAgICAgICAgaWYgKHRoaXMuX3RvdGFsQ29sdW1uQ291bnQgPiAxKSB7XG4gICAgICAgICAgICAgICAgY2VsbC5hdHRyKCdjb2xzcGFuJywgdGhpcy5fdG90YWxDb2x1bW5Db3VudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJvdyA9IG9uZUdyb3VwLnVuZGlzY2xvc2VkVGl0bGVSb3dKUSA9ICQob25lR3JvdXAudW5kaXNjbG9zZWRUaXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0clwiKSlcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2dyb3VwSGVhZGVyJykuY2xpY2soKCkgPT4gdGhpcy5fZXhwYW5kUm93R3JvdXAoaW5kZXgpKTtcbiAgICAgICAgICAgIGNlbGwgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZFwiKSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgICAgICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSkuYXBwZW5kVG8oY2VsbCkudGV4dChcIlxcdTI1QkMgXCIgKyBvbmVHcm91cC5uYW1lKTtcbiAgICAgICAgICAgIGlmICh0aGlzLl90b3RhbENvbHVtbkNvdW50ID4gMSkge1xuICAgICAgICAgICAgICAgIGNlbGwuYXR0cignY29sc3BhbicsIHRoaXMuX3RvdGFsQ29sdW1uQ291bnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBIYW5kbGUgdGhlIFwic29ydGFibGVcIiBDU1MgY2xhc3MgaW4gYSB0YWJsZS5cbiAgICBwcml2YXRlIF9wcmVwYXJlU29ydGFibGUoKTp2b2lkIHtcbiAgICAgICAgLy8gQWRkIGEgY2xpY2sgZXZlbnQgZm9yIGV2ZXJ5IGhlYWRlciBjZWxsIHRoYXQgaWRlbnRpZmllcyBhcyBzb3J0YWJsZVxuICAgICAgICB0aGlzLl9zcGVjLmVuYWJsZVNvcnQodGhpcyk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9zaG93T3B0TWVudSgpOnZvaWQge1xuICAgICAgICAkKHRoaXMuX29wdGlvbnNMYWJlbCkucmVtb3ZlQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJykuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT24nKTtcbiAgICAgICAgJCh0aGlzLl9vcHRpb25zTWVudUJsb2NrRWxlbWVudCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2hpZGVPcHRNZW51KCk6dm9pZCB7XG4gICAgICAgICQodGhpcy5fb3B0aW9uc0xhYmVsKS5yZW1vdmVDbGFzcygncHVsbGRvd25NZW51TGFiZWxPbicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpO1xuICAgICAgICAkKHRoaXMuX29wdGlvbnNNZW51QmxvY2tFbGVtZW50KS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9jb2xsYXBzZVJvd0dyb3VwKGdyb3VwSW5kZXgpOnZvaWQge1xuICAgICAgICB2YXIgcm93R3JvdXAgPSB0aGlzLl9zcGVjLnRhYmxlUm93R3JvdXBTcGVjW2dyb3VwSW5kZXhdO1xuICAgICAgICByb3dHcm91cC5kaXNjbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdhcnJhbmdlVGFibGVEYXRhUm93cycsICgpID0+IHRoaXMuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9leHBhbmRSb3dHcm91cChncm91cEluZGV4KTp2b2lkIHtcbiAgICAgICAgdmFyIHJvd0dyb3VwID0gdGhpcy5fc3BlYy50YWJsZVJvd0dyb3VwU3BlY1tncm91cEluZGV4XTtcbiAgICAgICAgcm93R3JvdXAuZGlzY2xvc2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdhcnJhbmdlVGFibGVEYXRhUm93cycsICgpID0+IHRoaXMuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKSk7XG4gICAgfVxuXG5cbiAgICB0dXJuT25Sb3dHcm91cGluZygpOnZvaWQge1xuICAgICAgICB0aGlzLl9ncm91cGluZ0VuYWJsZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ2FycmFuZ2VUYWJsZURhdGFSb3dzJywgKCkgPT4gdGhpcy5hcnJhbmdlVGFibGVEYXRhUm93cygpKTtcbiAgICB9XG5cblxuICAgIHR1cm5PZmZSb3dHcm91cGluZygpOnZvaWQge1xuICAgICAgICB0aGlzLl9ncm91cGluZ0VuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdhcnJhbmdlVGFibGVEYXRhUm93cycsICgpID0+IHRoaXMuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKSk7XG4gICAgfVxuXG5cbiAgICBjbGlja2VkT3B0aW9uV2lkZ2V0KGV2ZW50OkV2ZW50KTp2b2lkIHtcbiAgICAgICAgdmFyIGNvbnRyb2wgPSBldmVudC50YXJnZXQ7ICAgIC8vIEdyYWIgdGhlIGNoZWNrYm94IHRoYXQgc2VudCB0aGUgZXZlbnRcbiAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdhcnJhbmdlVGFibGVEYXRhUm93cycsICgpID0+IHRoaXMuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKSk7XG4gICAgfVxuXG5cbiAgICBjbGlja2VkSGVhZGVyV2lkZ2V0KGhlYWRlcldpZGdldDpEYXRhR3JpZFdpZGdldCk6dm9pZCB7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignYXJyYW5nZVRhYmxlRGF0YVJvd3MnLCAoKSA9PiB0aGlzLmFycmFuZ2VUYWJsZURhdGFSb3dzKCkpO1xuICAgIH1cblxuXG4gICAgLy8gJ2NvbnRyb2wnIGlzIGEgY29sdW1uIHZpc2liaWxpdHkgY2hlY2tib3hcbiAgICBwcml2YXRlIF9jbGlja2VkQ29sVmlzaWJpbGl0eUNvbnRyb2woZXZlbnQ6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6RGF0YUdyaWQge1xuICAgICAgICB2YXIgY2hlY2sgPSAkKGV2ZW50LnRhcmdldCksIGNvbCA9IGV2ZW50LmRhdGE7XG4gICAgICAgIGlmIChjaGVjay5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgIHRoaXMuc2hvd0NvbHVtbihjb2wpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5oaWRlQ29sdW1uKGNvbCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyAnY29udHJvbCcgaXMgYSBjb2x1bW4gdmlzaWJpbGl0eSBjaGVja2JveFxuICAgIHNob3dDb2x1bW4oZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMpOnZvaWQge1xuICAgICAgICBpZiAoZ3JvdXAuY3VycmVudGx5SGlkZGVuKSB7XG4gICAgICAgICAgICBncm91cC5jdXJyZW50bHlIaWRkZW4gPSBmYWxzZTtcbiAgICAgICAgICAgIGlmIChncm91cC5yZXZlYWxlZENhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXAucmV2ZWFsZWRDYWxsYmFjayh0aGlzLl9zcGVjLCB0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignX3VwZGF0ZUNvbHVtblNldHRpbmdzJywgKCkgPT4gdGhpcy5fdXBkYXRlQ29sdW1uU2V0dGluZ3MoKSk7XG4gICAgICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ19hcHBseUNvbHVtblZpc2liaWxpdHknLCAoKSA9PiB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHkoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vICdjb250cm9sJyBpcyBhIGNvbHVtbiB2aXNpYmlsaXR5IGNoZWNrYm94XG4gICAgaGlkZUNvbHVtbihncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyk6dm9pZCB7XG4gICAgICAgIGlmICghZ3JvdXAuY3VycmVudGx5SGlkZGVuKSB7XG4gICAgICAgICAgICBncm91cC5jdXJyZW50bHlIaWRkZW4gPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdfdXBkYXRlQ29sdW1uU2V0dGluZ3MnLCAoKSA9PiB0aGlzLl91cGRhdGVDb2x1bW5TZXR0aW5ncygpKTtcbiAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignX2FwcGx5Q29sdW1uVmlzaWJpbGl0eScsICgpID0+IHRoaXMuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eSgpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2Jhc2VQYXlsb2FkKCk6YW55IHtcbiAgICAgICAgdmFyIHRva2VuOnN0cmluZyA9IGRvY3VtZW50LmNvb2tpZS5yZXBsYWNlKFxuICAgICAgICAgICAgLyg/Oig/Ol58Lio7XFxzKiljc3JmdG9rZW5cXHMqXFw9XFxzKihbXjtdKikuKiQpfF4uKiQvLFxuICAgICAgICAgICAgJyQxJyk7XG4gICAgICAgIHJldHVybiB7ICdjc3JmbWlkZGxld2FyZXRva2VuJzogdG9rZW4gfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9jb2x1bW5TZXR0aW5nc0tleSgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiBbICdkYXRhZ3JpZCcsIHRoaXMuX3NwZWMudGFibGVTcGVjLmlkLCAnY29sdW1uJyBdLmpvaW4oJy4nKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9mZXRjaFNldHRpbmdzKHByb3BLZXk6c3RyaW5nLCBjYWxsYmFjazoodmFsdWU6YW55KT0+dm9pZCwgZGVmYXVsdFZhbHVlPzphbnkpOnZvaWQge1xuICAgICAgICAkLmFqYXgoJy9wcm9maWxlL3NldHRpbmdzLycgKyBwcm9wS2V5LCB7XG4gICAgICAgICAgICAnZGF0YVR5cGUnOiAnanNvbicsXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhOmFueSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGEgfHwgZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8qIFBhcnNlRXJyb3IsIGp1c3QgdXNlIHN0cmluZyB2YWx1ZSAqLyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBUaGUgc2VydmVyIGJpbmRzIHRoaXMuICd0aGlzJyBpcyBhIGNoZWNrYm94LlxuICAgIHByaXZhdGUgX3VwZGF0ZUNvbHVtblNldHRpbmdzKCk6RGF0YUdyaWQge1xuICAgICAgICB2YXIgcHJvcEtleSA9IHRoaXMuX2NvbHVtblNldHRpbmdzS2V5KCksIHNldENvbCA9IFtdLCB1bnNldENvbCA9IFtdLCBkZWxDb2wgPSBbXTtcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChjb2w6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMpOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbC5zaG93SW5WaXNpYmlsaXR5TGlzdCAmJiBjb2wuY2hlY2tib3hFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbC5jaGVja2JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICBzZXRDb2wucHVzaChjb2wubmFtZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdW5zZXRDb2wucHVzaChjb2wubmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29sLmhpZGRlbkJ5RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsQ29sLnB1c2goJy0nICsgY29sLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fZmV0Y2hTZXR0aW5ncyhwcm9wS2V5LCAoZGF0YTphbnkpID0+IHtcbiAgICAgICAgICAgIHZhciBpbkRhdGEgPSAobmFtZTpzdHJpbmcpOmJvb2xlYW4gPT4gZGF0YS5pbmRleE9mKG5hbWUpID09PSAtMTtcbiAgICAgICAgICAgIC8vIGZpbHRlciBvdXQgYWxsIHRoZSB1bnNldCBib3hlc1xuICAgICAgICAgICAgZGF0YSA9IGRhdGEuZmlsdGVyKChuYW1lOnN0cmluZyk6Ym9vbGVhbiA9PiB1bnNldENvbC5pbmRleE9mKG5hbWUpID09PSAtMSk7XG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IGFsbCBleGNsdWRlZCB0aGF0IGFyZSBub3cgc2V0XG4gICAgICAgICAgICBkYXRhID0gZGF0YS5maWx0ZXIoKG5hbWU6c3RyaW5nKTpib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gIShzZXRDb2wuaW5kZXhPZihuYW1lLnN1YnN0cmluZygxKSkgIT09IC0xICYmIG5hbWUuaW5kZXhPZignLScpID09PSAwKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gZmlsdGVyIG91dCBhbGwgdGhlIHNldCBib3hlcyBhbHJlYWR5IGluIHRoZSBzZXR0aW5ncyBsaXN0XG4gICAgICAgICAgICBzZXRDb2wgPSBzZXRDb2wuZmlsdGVyKGluRGF0YSk7XG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IGR1cGVzIGluIGRlbENvbFxuICAgICAgICAgICAgZGVsQ29sID0gZGVsQ29sLmZpbHRlcihpbkRhdGEpXG4gICAgICAgICAgICAvLyBhZGQgYW55IG1pc3NpbmcgaXRlbXNcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGRhdGEsIHNldENvbCk7XG4gICAgICAgICAgICAvLyBtYXJrIG5vbi1kZWZhdWx0IGhpZGUgKGkuZS4gZGVmYXVsdCBzaG93KSBhcyBleHBsaWNpdGx5IGV4Y2x1ZGVkXG4gICAgICAgICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShkYXRhLCBkZWxDb2wpO1xuICAgICAgICAgICAgLy8gc3RvcmUgbmV3IHNldHRpbmcgdmFsdWVcbiAgICAgICAgICAgICQuYWpheCgnL3Byb2ZpbGUvc2V0dGluZ3MvJyArIHByb3BLZXksIHtcbiAgICAgICAgICAgICAgICAnZGF0YSc6ICQuZXh0ZW5kKHt9LCB0aGlzLl9iYXNlUGF5bG9hZCgpLCB7ICdkYXRhJzogSlNPTi5zdHJpbmdpZnkoZGF0YSkgfSksXG4gICAgICAgICAgICAgICAgJ3R5cGUnOiAnUE9TVCdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBbXSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gU2NoZWR1bGUgYSBjYWxsIHRvIHRoZSBnaXZlbiBmdW5jdGlvbiBpbiB0aGUgbmVhciBmdXR1cmUsIGFuZCBzYXZlIHRoZSB0aW1lciB1bmRlciB0aGUgZ2l2ZW4gaWRlbnRpZmllci5cbiAgICAvLyBNdWx0aXBsZSBjYWxscyB0byB0aGlzIHVzaW5nIHRoZSBzYW1lIGlkZW50aWZpZXIgd2lsbCByZXNjaGVkdWxlIHRoZSBldmVudCwgcmVtb3ZpbmcgdGhlIG9sZCB0aW1lci5cbiAgICBzY2hlZHVsZVRpbWVyKHVpZDpzdHJpbmcsIGZ1bmM6KCkgPT4gYW55KTpEYXRhR3JpZCB7XG4gICAgICAgIGlmICh0aGlzLl90aW1lcnNbdWlkXSkgeyBjbGVhclRpbWVvdXQgKCB0aGlzLl90aW1lcnNbdWlkXSApOyB9XG4gICAgICAgIHRoaXMuX3RpbWVyc1t1aWRdID0gc2V0VGltZW91dCggZnVuYywgMTAgKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBhcHBseSBhIGZ1bmN0aW9uIHRvIGV2ZXJ5IHJlY29yZCBJRCBzcGVjaWZpZWRcbiAgICBhcHBseVRvUmVjb3JkU2V0KGZ1bmM6KHJvd3M6RGF0YUdyaWREYXRhUm93W10sIGlkOnN0cmluZywgc3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBncmlkOkRhdGFHcmlkKT0+dm9pZCwgaWRzOnN0cmluZ1tdKTpEYXRhR3JpZCB7XG4gICAgICAgIGlkcy5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgZnVuYy5jYWxsKHt9LCB0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCwgdGhpcy5fc3BlYywgdGhpcyk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIHJldHJlaXZlIHRoZSBjdXJyZW50IHNlcXVlbmNlIG9mIHJlY29yZHMgaW4gdGhlIERhdGFHcmlkXG4gICAgY3VycmVudFNlcXVlbmNlKCk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fZ2V0U2VxdWVuY2UodGhpcy5fc29ydFswXSk7XG4gICAgfVxuXG4gICAgc29ydENvbHMoKTpEYXRhR3JpZFNvcnRbXTtcbiAgICBzb3J0Q29scyhjb2xzOkRhdGFHcmlkU29ydFtdKTpEYXRhR3JpZDtcbiAgICBzb3J0Q29scyhjb2xzPzpEYXRhR3JpZFNvcnRbXSk6YW55IHtcbiAgICAgICAgaWYgKGNvbHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NvcnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zb3J0ID0gY29scztcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG59XG5cblxuXG4vLyBUeXBlIGRlZmluaXRpb24gZm9yIHRoZSByZWNvcmRzIGNvbnRhaW5lZCBpbiBhIERhdGFHcmlkXG5jbGFzcyBEYXRhR3JpZFJlY29yZFNldCB7XG4gICAgW2luZGV4OnN0cmluZ106RGF0YUdyaWRSZWNvcmQ7XG59XG5cblxuLy8gVHlwZSBkZWZpbml0aW9uIGZvciB0aGUgcmVjb3JkcyBjb250YWluZWQgaW4gYSBEYXRhR3JpZFxuY2xhc3MgRGF0YUdyaWRSZWNvcmQge1xuICAgIGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2U7XG4gICAgcmVjb3JkSUQ6c3RyaW5nO1xuICAgIGRhdGFHcmlkRGF0YVJvd3M6RGF0YUdyaWREYXRhUm93W107XG4gICAgcm93RWxlbWVudHM6SFRNTEVsZW1lbnRbXTtcbiAgICBjcmVhdGVkRWxlbWVudHM6Ym9vbGVhbjtcbiAgICBzdHJpcGVTdHlsZXM6c3RyaW5nW107XG4gICAgc3RyaXBlU3R5bGVzSm9pbjpzdHJpbmc7XG4gICAgcmVjZW50U3RyaXBlSW5kZXg6YW55O1xuXG4gICAgY29uc3RydWN0b3IoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaWQ6c3RyaW5nKSB7XG4gICAgICAgIHRoaXMuZ3JpZFNwZWMgPSBncmlkU3BlYztcbiAgICAgICAgdGhpcy5yZWNvcmRJRCA9IGlkO1xuICAgICAgICB0aGlzLnJvd0VsZW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cyA9IFtdO1xuICAgICAgICB0aGlzLnN0cmlwZVN0eWxlcyA9IFsnc3RyaXBlUm93QScsJ3N0cmlwZVJvd0InXTtcbiAgICAgICAgdGhpcy5zdHJpcGVTdHlsZXNKb2luID0gdGhpcy5zdHJpcGVTdHlsZXMuam9pbignICcpO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlY2VudFN0cmlwZUluZGV4ID0gbnVsbDtcbiAgICB9XG5cblxuICAgIHJlQ3JlYXRlRWxlbWVudHNJblBsYWNlKCk6dm9pZCB7XG4gICAgICAgIC8vIElmIHRoZSBlbGVtZW50cyBoYXZlbid0IGJlZW4gY3JlYXRlZCBldmVuIG9uY2UsIHRoZW4gZGl2ZXJ0IHRvIHN0YW5kYXJkIGNyZWF0aW9uIGFuZCBmaW5pc2guXG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB3ZSdyZSBnb2luZyB0byBtYWludGFpbiB0aGUgcG9zaXRpb24gb2YgdGhlIG5ldyByb3dzLFxuICAgICAgICAvLyB3ZSBuZWVkIHRvIGZpbmQgdGhlaXIgZWFybGllciBhZGphY2VudCBzaWJsaW5nLCBpZiBvbmUgZXhpc3RzLlxuICAgICAgICB2YXIgcHJldmlvdXNQYXJlbnQgPSBudWxsO1xuICAgICAgICB2YXIgbmV4dFNpYmxpbmcgPSBudWxsO1xuICAgICAgICBpZiAodGhpcy5kYXRhR3JpZERhdGFSb3dzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGxhc3RFbCA9IHRoaXMucm93RWxlbWVudHNbdGhpcy5kYXRhR3JpZERhdGFSb3dzLmxlbmd0aC0xXTtcbiAgICAgICAgICAgIC8vIFNhbml0eSBjaGVjazogIERvZXMgaXQgaGF2ZSBhIHBhcmVudD8gIENhbid0IGhhdmUgYSB2YWxpZCBzaWJsaW5nIHdpdGhvdXQgYSBwYXJlbnQuXG4gICAgICAgICAgICBpZiAobGFzdEVsLnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICBwcmV2aW91c1BhcmVudCA9IGxhc3RFbC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIG5leHRTaWJsaW5nID0gbGFzdEVsLm5leHRTaWJsaW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIE5vdyB0aGF0IHdlIGtub3cgdGhlc2UgdGhpbmdzLCB3ZSBjYW4gZGl0Y2ggdGhlIHJvd3Mgb3V0IG9mIHRoZSB0YWJsZS5cbiAgICAgICAgdGhpcy5yZW1vdmVFbGVtZW50cygpO1xuICAgICAgICAvLyBGb3JjZSByZWNyZWF0aW9uLlxuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyA9IGZhbHNlO1xuICAgICAgICAvLyBUaGUgb2xkIGNlbGxzIGFyZSBzdGlsbCByZWZlcmVuY2VkIGluIHRoZWlyIGNvbFNwZWMgb2JqZWN0cyBiZWZvcmUgdGhpcyxcbiAgICAgICAgLy8gYnV0IGNhbGxpbmcgZ2VuZXJhdGVDZWxscyBhZ2FpbiBhdXRvbWF0aWNhbGx5IHJlcGxhY2VzIHRoZW0uXG4gICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHMoKTtcbiAgICAgICAgLy8gSWYgcmVjZW50U3RyaXBlSW5kZXggaXMgbnVsbCwgd2UgaGF2ZW4ndCBhcHBsaWVkIGFueSBzdHJpcGluZyB0byB0aGUgcHJldmlvdXMgcm93LCBzbyB3ZSBza2lwIGl0IGhlcmUuXG4gICAgICAgIGlmICghKHRoaXMucmVjZW50U3RyaXBlSW5kZXggPT09IG51bGwpKSB7XG4gICAgICAgICAgICB0aGlzLmFwcGx5U3RyaXBpbmcodGhpcy5yZWNlbnRTdHJpcGVJbmRleCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJvcCB0aGUgbmV3IHJvd3MgaW50byBwbGFjZSB3aGVyZSB0aGUgb2xkIHJvd3MgbGl2ZWQuXG4gICAgICAgIGlmIChwcmV2aW91c1BhcmVudCkge1xuICAgICAgICAgICAgaWYgKG5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNQYXJlbnQuaW5zZXJ0QmVmb3JlKHJvdywgbmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJvd0VsZW1lbnRzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c1BhcmVudC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBjcmVhdGVFbGVtZW50cygpOnZvaWQge1xuICAgICAgICBpZiAodGhpcy5jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJvd0VsZW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cyA9IFtdO1xuXG4gICAgICAgIHZhciBjZWxsc0ZvckNvbHVtbnMgPSB7fTtcbiAgICAgICAgdGhpcy5ncmlkU3BlYy50YWJsZUNvbHVtblNwZWMuZm9yRWFjaCgoY29sU3BlYywgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGNlbGxzRm9yQ29sdW1uc1tpbmRleF0gPSBjb2xTcGVjLmdlbmVyYXRlQ2VsbHModGhpcy5ncmlkU3BlYywgdGhpcy5yZWNvcmRJRCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdlIHdpbGwgdXNlIHRoZXNlIGluZGV4ZXMgdG8gZGV0ZXJtaW5lIHdoZW4gd2UgbmVlZCB0byBhZGQgdGhlIG5leHQgY2VsbCwgaW4gdGhlIHNlcXVlbmNlIG9mIHJvd3MuXG4gICAgICAgIHZhciBjdXJyZW50Um93SGVpZ2h0cyA9IFtdO1xuICAgICAgICB0aGlzLmdyaWRTcGVjLnRhYmxlQ29sdW1uU3BlYy5mb3JFYWNoKChjb2xTcGVjLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgY3VycmVudFJvd0hlaWdodHNbaW5kZXhdID0gMDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGFkZGluZ0ZvclJvdyA9IDA7XG4gICAgICAgIHZhciBtb3JlVG9BZGQ6Ym9vbGVhbiA9IHRydWU7XG4gICAgICAgIHZhciBjZWxsczpEYXRhR3JpZERhdGFDZWxsW10gPSBbXTtcblxuICAgICAgICAvLyBQdWxsIGNlbGxzIG9mZiB0aGUgYm90dG9tIG9mIHRoZSBhcnJheXMsIGxlZnQgdG8gcmlnaHQsIGFzc2VtYmxpbmcgdGhlIHJvd3Mgb25lIGF0IGEgdGltZSxcbiAgICAgICAgLy8gc2tpcHBpbmcgY29sdW1ucyBiYXNlZCBvbiB0aGUgcm93c3BhbiBvciBjb2xzcGFuIG9mIHByZXZpb3VzIGNlbGxzLiAgV2UgZXhwZWN0IHRoZSBjbGllbnQgb2ZcbiAgICAgICAgLy8gdGhpcyBjbGFzcyB0byBlbnN1cmUgdGhleSBhcmUgZGVjbGFyaW5nIGEgbmljZWx5IGZpdHRlZCByZWN0YW5ndWxhciBzdHJ1Y3R1cmUgLSB3ZSBkb24ndCB2YWxpZGF0ZSBpdC5cbiAgICAgICAgd2hpbGUgKG1vcmVUb0FkZCkge1xuICAgICAgICAgICAgbW9yZVRvQWRkID0gZmFsc2U7XG4gICAgICAgICAgICBjZWxscyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5ncmlkU3BlYy50YWJsZUNvbHVtblNwZWMuZm9yRWFjaCgoc3BlYywgY29sKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbENlbGxzLCBjLCBuZXh0O1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Um93SGVpZ2h0c1tjb2xdID4gYWRkaW5nRm9yUm93KSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKChjb2xDZWxscyA9IGNlbGxzRm9yQ29sdW1uc1tjb2xdKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYyA9IGNvbENlbGxzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2xDZWxscy5sZW5ndGgpIG1vcmVUb0FkZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIG5leHQgPSBjb2wgKyBjLmNvbHNwYW47XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChjb2wgPCBuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50Um93SGVpZ2h0c1tjb2xdID0gYy5yb3dzcGFuICsgYWRkaW5nRm9yUm93O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2VsbHMucHVzaChjKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIHIgPSBuZXcgRGF0YUdyaWREYXRhUm93KHRoaXMucmVjb3JkSUQsIGNlbGxzKTtcbiAgICAgICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cy5wdXNoKHIpO1xuICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50cy5wdXNoKHIuZ2V0RWxlbWVudCgpKTtcblxuICAgICAgICAgICAgLy8ga2VlcCBnb2luZyBpZiBjdXJyZW50IHJvdyBpcyBsZXNzIHRoYW4gaGlnaGVzdCByb3dzcGFuXG4gICAgICAgICAgICBtb3JlVG9BZGQgPSAoKythZGRpbmdGb3JSb3cgPCBjdXJyZW50Um93SGVpZ2h0cy5yZWR1Y2UoKGEsYikgPT4geyByZXR1cm4gTWF0aC5tYXgoYSxiKTsgfSwgMCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgcmVtb3ZlRWxlbWVudHMoKSB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgIHJvdy5yZW1vdmVFbGVtZW50KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gTGlrZSByZW1vdmUsIGV4Y2VwdCBpdCBkb2Vzbid0IHJlbW92ZSBKUXVlcnkgZXZlbnRzIG9yIGRhdGEuXG4gICAgLy8gVXNlZCB0byB0YWtlIHRoZSB0YWJsZSByb3dzIHRlbXBvcmFyaWx5IG91dCBvZiB0aGUgRE9NLCBsaWtlIHdoZW4gcmUtb3JkZXJpbmcuXG4gICAgZGV0YWNoRWxlbWVudHMoKSB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhUm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgIHJvdy5kZXRhY2hFbGVtZW50KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2V0RGF0YUdyaWREYXRhUm93cygpOkRhdGFHcmlkRGF0YVJvd1tdIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGFHcmlkRGF0YVJvd3M7XG4gICAgfVxuXG5cbiAgICBnZXRFbGVtZW50cygpOkhUTUxFbGVtZW50W10ge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucm93RWxlbWVudHM7XG4gICAgfVxuXG5cbiAgICBhcHBseVN0cmlwaW5nKHN0cmlwZUluZGV4Om51bWJlcikge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuZ2V0RGF0YUdyaWREYXRhUm93cygpO1xuICAgICAgICB0aGlzLnJlY2VudFN0cmlwZUluZGV4ID0gc3RyaXBlSW5kZXg7XG4gICAgICAgIHJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICB2YXIgckpRID0gcm93LmdldEVsZW1lbnRKUSgpO1xuICAgICAgICAgICAgckpRLnJlbW92ZUNsYXNzKHRoaXMuc3RyaXBlU3R5bGVzSm9pbikuYWRkQ2xhc3ModGhpcy5zdHJpcGVTdHlsZXNbc3RyaXBlSW5kZXhdKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuLy8gQ29udGFpbmVyIGNsYXNzIGZvciBkYXRhIHJvd3MgaW4gdGhlIGJvZHkgb2YgdGhlIERhdGFHcmlkIHRhYmxlLlxuLy8gRGF0YUdyaWQgaW5zdGFudGlhdGVzIHRoZXNlIGJ5IHBhc3NpbmcgaW4gYW4gYXJyYXkgb2YgdGhlIERhdGFHcmlkRGF0YUNlbGwgb2JqZWN0cyB0aGF0IHdpbGwgZm9ybSB0aGUgY29udGVudCBvZiB0aGUgcm93LlxuY2xhc3MgRGF0YUdyaWREYXRhUm93IHtcblxuICAgIHJvd0VsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgcm93RWxlbWVudEpROkpRdWVyeTtcbiAgICAvLyBEZWZpbmVkIG9yIHNldCBieSB0aGUgY29uc3RydWN0b3JcbiAgICByZWNvcmRJRDpzdHJpbmc7XG4gICAgZGF0YUdyaWREYXRhQ2VsbHM6RGF0YUdyaWREYXRhQ2VsbFtdO1xuICAgIGNyZWF0ZWRFbGVtZW50OmJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihpZDpzdHJpbmcsIGNlbGxzOkRhdGFHcmlkRGF0YUNlbGxbXSkge1xuICAgICAgICB0aGlzLnJlY29yZElEID0gaWQ7XG4gICAgICAgIHRoaXMuZGF0YUdyaWREYXRhQ2VsbHMgPSBjZWxscztcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudCA9IGZhbHNlO1xuICAgIH1cblxuXG4gICAgY3JlYXRlRWxlbWVudCgpIHtcbiAgICAgICAgdmFyIHJvd0VsOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpO1xuICAgICAgICBmb3IgKHZhciBpPTA7IGkgPCB0aGlzLmRhdGFHcmlkRGF0YUNlbGxzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IHRoaXMuZGF0YUdyaWREYXRhQ2VsbHNbaV07XG4gICAgICAgICAgICByb3dFbC5hcHBlbmRDaGlsZChjLmdldEVsZW1lbnQoKSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJvd0VsZW1lbnQgPSByb3dFbDtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudCA9IHRydWU7XG4gICAgfVxuXG5cbiAgICByZW1vdmVFbGVtZW50KCkge1xuICAgICAgICBpZiAodGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5nZXRFbGVtZW50SlEoKS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gTGlrZSByZW1vdmUsIGV4Y2VwdCBpdCBkb2Vzbid0IHJlbW92ZSBKUXVlcnkgZXZlbnRzIG9yIGRhdGEuXG4gICAgLy8gVXNlZCB0byB0YWtlIHRoZSB0YWJsZSByb3dzIHRlbXBvcmFyaWx5IG91dCBvZiB0aGUgRE9NLCBsaWtlIHdoZW4gcmUtb3JkZXJpbmcuXG4gICAgZGV0YWNoRWxlbWVudCgpIHtcbiAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0RWxlbWVudEpRKCkuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGdldEVsZW1lbnQoKTpIVE1MRWxlbWVudCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucm93RWxlbWVudDtcbiAgICB9XG5cblxuICAgIGdldEVsZW1lbnRKUSgpOkpRdWVyeSB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLnJvd0VsZW1lbnRKUSkge1xuICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50SlEgPSAkKHRoaXMucm93RWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucm93RWxlbWVudEpRO1xuICAgIH1cbn1cblxuXG5cbi8vIENvbnRhaW5lciBjbGFzcyBmb3IgY2VsbHMgaW4gdGhlIGJvZHkgb2YgdGhlIERhdGFHcmlkIHRhYmxlLlxuLy8gRGF0YUdyaWQgY2FsbHMgYSBmdW5jdGlvbiBkZWZpbmVkIGluIERhdGFHcmlkQ29sdW1uU3BlYyBvYmplY3RzIHRvIGluc3RhbnRpYXRlIHRoZXNlLFxuLy8gcGFzc2luZyBpbiBhIHJlZmVyZW5jZSB0byB0aGUgRGF0YUdyaWRTcGVjQmFzZSBhbmQgYSB1bmlxdWUgaWRlbnRpZmllciBmb3IgYSBkYXRhIHJlY29yZC5cbmNsYXNzIERhdGFHcmlkRGF0YUNlbGwge1xuXG4gICAgLy8gRGVmaW5lZCBvciBzZXQgYnkgdGhlIGNvbnN0cnVjdG9yXG4gICAgZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZTtcbiAgICByZWNvcmRJRDpzdHJpbmc7XG5cbiAgICAvLyBPcHRpb25zIHBvdGVudGlhbGx5IHNldCBieSB0aGUgY29uc3RydWN0b3JcbiAgICByb3dzcGFuOm51bWJlcjtcbiAgICBjb2xzcGFuOm51bWJlcjtcbiAgICBhbGlnbjpzdHJpbmc7ICAgICAgICAgICAvLyBUT0RPOiBzaG91bGQgYmUgYW4gZW51bSB0eXBlIG9mOiAnbGVmdCcsICdyaWdodCcsICdjZW50ZXInXG4gICAgdmFsaWduOnN0cmluZzsgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gdHlwZSBvZjogJ3RvcCcsICdtaWRkbGUnLCAnYm90dG9tJywgJ2Jhc2VsaW5lJ1xuICAgIG1heFdpZHRoOnN0cmluZztcbiAgICBtaW5XaWR0aDpzdHJpbmc7XG4gICAgbm93cmFwOmJvb2xlYW47XG4gICAgaG92ZXJFZmZlY3Q6Ym9vbGVhbjtcbiAgICBjb250ZW50RnVuY3Rpb246KGU6SFRNTEVsZW1lbnQsIGluZGV4Om51bWJlcik9PnZvaWQ7XG4gICAgY29udGVudFN0cmluZzpzdHJpbmc7XG4gICAgY2hlY2tib3hXaXRoSUQ6KGluZGV4Om51bWJlcik9PnN0cmluZztcbiAgICBjaGVja2JveE5hbWU6c3RyaW5nO1xuICAgIGN1c3RvbUlEOihpbmRleDpudW1iZXIpPT5zdHJpbmc7XG4gICAgc2lkZU1lbnVJdGVtczpzdHJpbmdbXTtcblxuICAgIC8vIExvY2FsIGRhdGFcbiAgICBjZWxsRWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBjZWxsRWxlbWVudEpROkpRdWVyeTtcbiAgICBjb250ZW50Q29udGFpbmVyRWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBjaGVja2JveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcbiAgICBoaWRkZW46Ym9vbGVhbjtcbiAgICBjcmVhdGVkRWxlbWVudDpib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaWQ6c3RyaW5nLCBvcHQ/OntbaW5kZXg6c3RyaW5nXTphbnl9KSB7XG4gICAgICAgIHZhciBkZWZhdWx0cztcbiAgICAgICAgdGhpcy5ncmlkU3BlYyA9IGdyaWRTcGVjO1xuICAgICAgICB0aGlzLnJlY29yZElEID0gaWQ7XG4gICAgICAgIHRoaXMuaGlkZGVuID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnQgPSBmYWxzZTtcbiAgICAgICAgZGVmYXVsdHMgPSB7XG4gICAgICAgICAgICAnY29udGVudEZ1bmN0aW9uJzogKGUsIGluZGV4KSA9PiB7fSxcbiAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJycsXG4gICAgICAgICAgICAnYWxpZ24nOiAnbGVmdCcsXG4gICAgICAgICAgICAncm93c3Bhbic6IDEsXG4gICAgICAgICAgICAnY29sc3Bhbic6IDFcbiAgICAgICAgfTtcbiAgICAgICAgJC5leHRlbmQodGhpcywgZGVmYXVsdHMsIG9wdCB8fCB7fSk7XG4gICAgfVxuXG5cbiAgICBjcmVhdGVFbGVtZW50KCkge1xuICAgICAgICB2YXIgaWQgPSB0aGlzLnJlY29yZElELFxuICAgICAgICAgICAgYzpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZFwiKSxcbiAgICAgICAgICAgIGNoZWNrSWQ6c3RyaW5nLCBjaGVja05hbWU6c3RyaW5nLCBtZW51O1xuICAgICAgICBpZiAodGhpcy5jaGVja2JveFdpdGhJRCkge1xuICAgICAgICAgICAgY2hlY2tJZCA9IHRoaXMuY2hlY2tib3hXaXRoSUQuY2FsbCh0aGlzLmdyaWRTcGVjLCBpZCk7XG4gICAgICAgICAgICBjaGVja05hbWUgPSB0aGlzLmNoZWNrYm94TmFtZSB8fCBjaGVja0lkO1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveEVsZW1lbnQuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2NoZWNrYm94Jyk7XG4gICAgICAgICAgICAkKHRoaXMuY2hlY2tib3hFbGVtZW50KS5hdHRyKHtcbiAgICAgICAgICAgICAgICAnaWQnOiBjaGVja0lkLCAnbmFtZSc6IGNoZWNrTmFtZSwgJ3ZhbHVlJzogaWQudG9TdHJpbmcoKVxuICAgICAgICAgICAgfSkuYXBwZW5kVG8oYyk7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnRDb250YWluZXJFbGVtZW50ID0gJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsIGNoZWNrSWQpLmFwcGVuZFRvKGMpWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Q29udGFpbmVyRWxlbWVudCA9ICQoJzxzcGFuPicpLmFwcGVuZFRvKGMpWzBdO1xuICAgICAgICB9XG4gICAgICAgICQodGhpcy5jb250ZW50Q29udGFpbmVyRWxlbWVudCkuaHRtbCh0aGlzLmNvbnRlbnRTdHJpbmcpO1xuICAgICAgICB0aGlzLmNvbnRlbnRGdW5jdGlvbi5jYWxsKHRoaXMuZ3JpZFNwZWMsIHRoaXMuY29udGVudENvbnRhaW5lckVsZW1lbnQsIGlkKTtcbiAgICAgICAgaWYgKHRoaXMuc2lkZU1lbnVJdGVtcyAmJiB0aGlzLnNpZGVNZW51SXRlbXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBtZW51ID0gJCgnPHVsPicpLmFkZENsYXNzKCdwb3B1cG1lbnUnKS5hcHBlbmRUbyhjKTtcbiAgICAgICAgICAgIHRoaXMuc2lkZU1lbnVJdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgICAgICAgJCgnPGxpPicpLmh0bWwoaXRlbSkuYXBwZW5kVG8obWVudSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjZWxsQ2xhc3NlcyA9IFtdO1xuXG4gICAgICAgIGlmICh0aGlzLmNvbHNwYW4gPiAxKSB7XG4gICAgICAgICAgICBjLnNldEF0dHJpYnV0ZSgnY29sc3BhbicsIHRoaXMuY29sc3Bhbi50b1N0cmluZygxMCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnJvd3NwYW4gPiAxKSB7XG4gICAgICAgICAgICBjLnNldEF0dHJpYnV0ZSgncm93c3BhbicsIHRoaXMucm93c3Bhbi50b1N0cmluZygxMCkpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmN1c3RvbUlEKSB7XG4gICAgICAgICAgICBjLnNldEF0dHJpYnV0ZSgnaWQnLCB0aGlzLmN1c3RvbUlELmNhbGwodGhpcy5ncmlkU3BlYywgaWQpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmhvdmVyRWZmZWN0KSB7XG4gICAgICAgICAgICBjZWxsQ2xhc3Nlcy5wdXNoKCdwb3B1cGNlbGwnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5ub3dyYXApIHtcbiAgICAgICAgICAgIGNlbGxDbGFzc2VzLnB1c2goJ25vd3JhcCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm1pbldpZHRoKSB7XG4gICAgICAgICAgICBjLnN0eWxlLm1pbldpZHRoID0gdGhpcy5taW5XaWR0aCArICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMubWF4V2lkdGgpIHtcbiAgICAgICAgICAgIGMuc3R5bGUubWF4V2lkdGggPSB0aGlzLm1heFdpZHRoICsgJ3B4JztcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5hbGlnbikge1xuICAgICAgICAgICAgYy5zdHlsZS50ZXh0QWxpZ24gPSB0aGlzLmFsaWduO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnZhbGlnbikge1xuICAgICAgICAgICAgYy5zdHlsZS52ZXJ0aWNhbEFsaWduID0gdGhpcy52YWxpZ247XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuaGlkZGVuKSB7XG4gICAgICAgICAgICBjZWxsQ2xhc3Nlcy5wdXNoKCdvZmYnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjZWxsQ2xhc3Nlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjLmNsYXNzTmFtZSA9IGNlbGxDbGFzc2VzLmpvaW4oJyAnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNlbGxFbGVtZW50ID0gYztcbiAgICAgICAgdGhpcy5jZWxsRWxlbWVudEpRID0gJChjKTtcblxuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50ID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIGdldEVsZW1lbnQoKTpIVE1MRWxlbWVudCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2VsbEVsZW1lbnQ7XG4gICAgfVxuXG5cbiAgICBnZXRDaGVja2JveEVsZW1lbnQoKTpIVE1MSW5wdXRFbGVtZW50IHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50KSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jaGVja2JveEVsZW1lbnQgfHwgbnVsbDtcbiAgICB9XG5cblxuICAgIGhpZGUoKTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmhpZGRlbikge1xuICAgICAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNlbGxFbGVtZW50SlEuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5oaWRkZW4gPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICB1bmhpZGUoKTp2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaGlkZGVuKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2VsbEVsZW1lbnRKUS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cbi8vIEEgcGxhY2Vob2xkZXIgY2VsbCB3aGVuIGRhdGEgaXMgc3RpbGwgbG9hZGluZ1xuY2xhc3MgRGF0YUdyaWRMb2FkaW5nQ2VsbCBleHRlbmRzIERhdGFHcmlkRGF0YUNlbGwge1xuICAgIGNvbnN0cnVjdG9yKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGlkOnN0cmluZywgb3B0Pzp7W2luZGV4OnN0cmluZ106YW55fSkge1xuICAgICAgICBzdXBlcihncmlkU3BlYywgaWQsIG9wdCk7XG4gICAgICAgIHRoaXMuY29udGVudFN0cmluZyA9ICc8c3BhbiBjbGFzcz1cImxvYWRpbmdcIj5Mb2FkaW5nLi4uPC9zcGFuPic7XG4gICAgfVxufVxuXG5cbi8vIEEgZ2VuZXJhbCBjbGFzcyB0aGF0IGFjdHMgYXMgYSBjb21tb24gcmVwb3NpdG9yeSBmb3IgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIERhdGFHcmlkIHdpZGdldHMuXG4vLyBJdCBpcyBpbW1lZGlhdGVseSBzdWJjbGFzc2VkIGludG8gRGF0YUdyaWRPcHRpb25XaWRnZXQgYW5kIERhdGFHcmlkSGVhZGVyV2lkZ2V0LlxuY2xhc3MgRGF0YUdyaWRXaWRnZXQge1xuXG4gICAgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2U7XG4gICAgZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZDtcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlKSB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdCA9IGRhdGFHcmlkT3duZXJPYmplY3Q7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRTcGVjID0gZGF0YUdyaWRTcGVjO1xuICAgIH1cblxuXG4gICAgLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBjcmVhdGUgYSBsYWJlbCBlbGVtZW50XG4gICAgX2NyZWF0ZUxhYmVsKHRleHQ6c3RyaW5nLCBpZDpzdHJpbmcpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgdmFyIGxhYmVsOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxhYmVsXCIpO1xuICAgICAgICBsYWJlbC5zZXRBdHRyaWJ1dGUoJ2ZvcicsIGlkKTtcbiAgICAgICAgbGFiZWwuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCkpO1xuICAgICAgICByZXR1cm4gbGFiZWw7XG4gICAgfVxuXG5cbiAgICAvLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGNoZWNrYm94IGVsZW1lbnRcbiAgICBfY3JlYXRlQ2hlY2tib3goaWQ6c3RyaW5nLCBuYW1lOnN0cmluZywgdmFsdWU6c3RyaW5nKTpIVE1MSW5wdXRFbGVtZW50IHtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnaWQnLCBpZCk7XG4gICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnbmFtZScsIG5hbWUpO1xuICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnY2hlY2tib3gnKTtcbiAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCd2YWx1ZScsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIGNiO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2l0aCBhbiBhcnJheSBvZiByb3cgZWxlbWVudHMsIGFuZCB0aGUgSUQgdGhleSByZXByZXNlbnQsIHNvIHRoZSB3aWRnZXQgY2FuXG4gICAgLy8gIGFwcGx5IGFueSBjdXN0b20gc3R5bGluZyBpdCBuZWVkcy4gSXQgaXMgY2FsbGVkIG9uZSB0aW1lIGZvciBlYWNoIElEIGFuZCByZXNwZWN0aXZlIHJvd1xuICAgIC8vICBhcnJheSwgZHVyaW5nIHRoZSBjb25zdHJ1Y3Rpb24gb2YgdGhlIHRhYmxlIHJvd3MuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6RGF0YUdyaWREYXRhUm93W10sIHJvd0lEOnN0cmluZyk6dm9pZCB7XG4gICAgICAgIC8vIG5vIHNwZWNpYWwgZm9ybWF0dGluZyBieSBkZWZhdWx0XG4gICAgfVxuXG5cbiAgICAvLyBOb3RpZnkgdGhlIHdpZGdldCB0aGF0IHRoZSBEYXRhR3JpZCBoYXMgYmVlbiB1cGRhdGVkXG4gICAgcmVmcmVzaFdpZGdldCgpOnZvaWQge1xuICAgICAgICAvLyBub3RoaW5nIGJ5IGRlZmF1bHRcbiAgICB9XG59XG5cblxuXG4vLyBUaGlzIGlzIHRoZSBiYXNlIGNsYXNzIGZvciBhZGRpdGlvbmFsIHdpZGdldHMgdGhhdCBhcHBlYXIgaW4gdGhlIG9wdGlvbnMgbWVudSBvZiBhIERhdGFHcmlkIHRhYmxlLlxuLy8gVGhlIGRlZmF1bHQgYmVoYXZpb3IgaXMgdG8gY3JlYXRlIGEgY2hlY2tib3ggZWxlbWVudCB3aXRoIGEgY2FsbGJhY2ssIGFuZCBwYWlyIGl0IHdpdGggYSBsYWJlbCBlbGVtZW50LlxuLy9cbi8vIEVhY2ggRGF0YUdyaWRPcHRpb25XaWRnZXQgbmVlZHMgdG8gaW1wbGVtZW50IGFuIGFwcGx5RmlsdGVyVG9JRHMgZnVuY3Rpb24gdG8gcHJvdmlkZSBzb21lIG1ldGhvZCBmb3IgZmlsdGVyaW5nXG4vLyBhIGdpdmVuIGxpc3Qgb2YgSURzLiAgVGhpcyBpcyBob3cgdGhlIHdpZGdldCBhZmZlY3RzIHdoaWNoIHJvd3MgYXJlIGRpc3BsYXllZCBpbiB0aGUgdGFibGUuXG4vL1xuLy8gVGhlIERhdGFHcmlkU3BlYyBpcyByZXNwb25zaWJsZSBmb3IgaW5zdGFudGlhdGluZyB0aGVzZSBEYXRhR3JpZE9wdGlvbldpZGdldC1kZXJpdmVkIG9iamVjdHMgZm9yIGEgcGFydGljdWxhciB0YWJsZSxcbi8vIGFuZCB0aGUgRGF0YUdyaWQgb2JqZWN0IGlzIHJlc3BvbnNpYmxlIGZvciBidWlsZGluZyB0aGUgb3B0aW9ucyBtZW51IHRoYXQgd2lsbCBzdG9yZSB0aGUgY2hlY2tib3ggYW5kIGxhYmVsIGVsZW1lbnRzLlxuY2xhc3MgRGF0YUdyaWRPcHRpb25XaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZFdpZGdldCB7XG5cbiAgICBfY3JlYXRlZEVsZW1lbnRzOmJvb2xlYW47XG4gICAgLy8gVGhlIGJhc2UgRGF0YUdyaWRPcHRpb25XaWRnZXQgcHJvdmlkZXMgdGVtcGxhdGUgY29kZSBhbmQgc3RydWN0dXJlIGZvciBjcmVhdGluZyBhIGNoZWNrYm94IHdpdGggYSBsYWJlbCxcbiAgICAvLyBidXQgb3RoZXIgVUkgY2FuIGJlIGNyZWF0ZWQgYW5kIHVzZWQgaW5zdGVhZC5cbiAgICBjaGVja0JveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcbiAgICBsYWJlbEVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSBmYWxzZTtcbiAgICB9XG5cblxuICAgIC8vIFJldHVybiBhIGZyYWdtZW50IHRvIHVzZSBpbiBnZW5lcmF0aW5nIG9wdGlvbiB3aWRnZXQgSURzXG4gICAgZ2V0SURGcmFnbWVudCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnR2VuZXJpY09wdGlvbkNCJztcbiAgICB9XG5cblxuICAgIC8vIFJldHVybiB0ZXh0IHVzZWQgdG8gbGFiZWwgdGhlIHdpZGdldFxuICAgIGdldExhYmVsVGV4dCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnTmFtZSBPZiBPcHRpb24nO1xuICAgIH1cblxuXG4gICAgLy8gSGFuZGxlIGFjdGl2YXRpb24gb2Ygd2lkZ2V0XG4gICAgb25XaWRnZXRDaGFuZ2UoZSk6dm9pZCB7XG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkK3RoaXMuZ2V0SURGcmFnbWVudCgpK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgIC8vIFdlIG5lZWQgdG8gbWFrZSBzdXJlIHRoZSBjaGVja2JveCBoYXMgYSBjYWxsYmFjayB0byB0aGUgRGF0YUdyaWQncyBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAvLyBBbW9uZyBvdGhlciB0aGluZ3MsIHRoZSBoYW5kbGVyIGZ1bmN0aW9uIHdpbGwgY2FsbCB0aGUgYXBwcm9wcmlhdGUgZmlsdGVyaW5nIGZ1bmN0aW9ucyBmb3IgYWxsIHRoZSB3aWRnZXRzIGluIHR1cm4uXG4gICAgICAgICQoY2IpLm9uKCdjaGFuZ2UuZGF0YWdyaWQnLCAoZSkgPT4gdGhpcy5vbldpZGdldENoYW5nZShlKSApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKHRoaXMuZ2V0TGFiZWxUZXh0KCksIGNiSUQpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuX2NyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuY2hlY2tCb3hFbGVtZW50KTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMubGFiZWxFbGVtZW50KTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdpdGggYW4gYXJyYXkgb2YgSURzIGZvciBmaWx0ZXJpbmcsIGFuZCBhIGZpbHRlcmVkIGFycmF5IGlzIHJldHVybmVkLlxuICAgIC8vIEl0IGlzIGFjY2VwdGFibGUgdG8ganVzdCByZXR1cm4gdGhlIG9yaWdpbmFsIGFycmF5IGlmIG5vIGZpbHRlcmluZyBuZWVkcyB0byBiZSBkb25lLlxuICAgIC8vXG4gICAgLy8gSXQncyB1cCB0byB0aGUgZGVzaWduZXIgdG8gZGVjaWRlIGhvdyB0aGUgc3RhdGUgb2YgdGhlIHdpZGdldCBhZmZlY3RzIGZpbHRlcmluZy5cbiAgICAvLyBGb3IgZXhhbXBsZSwgaWYgdGhlIHdpZGdldCBpcyBcImFkZGl0aXZlXCIsIHlvdSB3b3VsZCBhcHBseSBmaWx0ZXJpbmcgaWYgdGhlIHdpZGdldCdzIGNoZWNrYm94XG4gICAgLy8gaXMgY2xlYXIsIGFuZCBza2lwIGZpbHRlcmluZyBpZiB0aGUgY2hlY2tib3ggaXMgc2V0LCBjcmVhdGluZyB0aGUgYXBwZWFyYW5jZSBvZiBhIGNoZWNrYm94XG4gICAgLy8gdGhhdCBcImFkZHNcIiByb3dzIHdoZW4gY2hlY2tlZC5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gcm93SURzO1xuICAgIH1cblxuXG4gICAgLy8gUmV0dXJucyB0cnVlIGlmIHRoZSBjb250cm9sIGlzIGVuYWJsZWRcbiAgICBnZXRTdGF0ZSgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGVja0JveEVsZW1lbnQuaGFzQXR0cmlidXRlKCdjaGVja2VkJyk7XG4gICAgfVxuXG5cbiAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyb2wgc2hvdWxkIGJlIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgIGlzRW5hYmxlZEJ5RGVmYXVsdCgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG5cbiAgICAvLyBTZXRzIHRoZSBlbmFibGVkIHN0YXRlIHRvIHRydWUgb3IgZmFsc2UsIGJhc2VkIG9uIHRoZSBnaXZlbiB2YWx1ZVxuICAgIHNldFN0YXRlKGVuYWJsZWQ6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIGlmIChlbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG4vLyBUaGlzIGlzIHRoZSBiYXNlIGNsYXNzIGZvciBhZGRpdGlvbmFsIHdpZGdldHMgdGhhdCBhcHBlYXIgaW4gdGhlIGhlYWRlciBhcmVhIG9mIGEgRGF0YUdyaWQgdGFibGUuXG4vL1xuLy8gVGhlIERhdGFHcmlkU3BlYyBpcyByZXNwb25zaWJsZSBmb3IgaW5zdGFudGlhdGluZyB0aGVzZSBEYXRhR3JpZE9wdGlvbldpZGdldC1kZXJpdmVkIG9iamVjdHMgZm9yIGEgcGFydGljdWxhciB0YWJsZSxcbi8vIGFuZCB0aGUgRGF0YUdyaWQgb2JqZWN0IGlzIHJlc3BvbnNpYmxlIGZvciBidWlsZGluZyB0aGUgaGVhZGVyIGFyZWEgdGhhdCB3aWxsIGNvbnRhaW4gdGhlIHdpZGdldHMuXG5jbGFzcyBEYXRhR3JpZEhlYWRlcldpZGdldCBleHRlbmRzIERhdGFHcmlkV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgX2NyZWF0ZWRFbGVtZW50czpib29sZWFuO1xuICAgIC8vIFdoZXRoZXIgdG8gYWRkIHRoaXMgd2lkZ2V0IHRvIHRoZSBoZWFkZXIgb2YgdGhlIHRhYmxlIGJlZm9yZSB0aGUgdmlldyBtZW51LCBpbnN0ZWFkIG9mIHRoZSBkZWZhdWx0IG9mIGFmdGVyLlxuICAgIC8vIFRoaXMgb3B0aW9uIGlzIHNldCBieSBhbiBhY2Nlc3NvciBmdW5jdGlvbiBtZWFudCB0byBiZSBjYWxsZWQgc2hvcnRseSBhZnRlciBpbnN0YW50aWF0aW9uLlxuICAgIHByaXZhdGUgX2Rpc3BsYXlCZWZvcmVWaWV3TWVudUZsYWc6Ym9vbGVhbjtcbiAgICAvLyBUaGUgYmFzZSBEYXRhR3JpZEhlYWRlcldpZGdldCBwcm92aWRlcyB0ZW1wbGF0ZSBjb2RlIHRoYXQganVzdCBjcmVhdGVzIGEgdGV4dCBmaWVsZCxcbiAgICAvLyBidXQgb3RoZXIgVUkgY2FuIGJlIGNyZWF0ZWQgYW5kIHVzZWQgaW5zdGVhZC5cbiAgICBlbGVtZW50OkhUTUxFbGVtZW50O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLl9kaXNwbGF5QmVmb3JlVmlld01lbnVGbGFnID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IGZhbHNlO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIHRCb3hJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAndGV4dCcgKyB1bmlxdWVJRDtcbiAgICAgICAgdmFyIHRCb3ggPSAkKHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSlcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogdEJveElELCAnbmFtZSc6IHRCb3hJRCwgJ3NpemUnOiAnMjAnIH0pXG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ3RhYmxlQ29udHJvbCcpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuX2NyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICB9XG5cblxuICAgIGNyZWF0ZWRFbGVtZW50cygpOmJvb2xlYW47XG4gICAgY3JlYXRlZEVsZW1lbnRzKGZsYWc6Ym9vbGVhbik6RGF0YUdyaWRIZWFkZXJXaWRnZXQ7XG4gICAgY3JlYXRlZEVsZW1lbnRzKGZsYWc/OmJvb2xlYW4pOmFueSB7XG4gICAgICAgIGlmIChmbGFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jcmVhdGVkRWxlbWVudHM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSBmbGFnO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXaGV0aGVyIHRvIGFkZCB0aGlzIHdpZGdldCB0byB0aGUgaGVhZGVyIG9mIHRoZSB0YWJsZSBiZWZvcmUgdGhlIHZpZXcgbWVudSwgaW5zdGVhZCBvZiB0aGUgZGVmYXVsdCBvZiBhZnRlci5cbiAgICAvLyBQYXNzIGluIFwiZmFsc2VcIiB0byByZXZlcnNlIHRoZSBzZXR0aW5nLlxuICAgIGRpc3BsYXlCZWZvcmVWaWV3TWVudSgpOmJvb2xlYW47XG4gICAgZGlzcGxheUJlZm9yZVZpZXdNZW51KGZsYWc6Ym9vbGVhbik6RGF0YUdyaWRIZWFkZXJXaWRnZXQ7XG4gICAgZGlzcGxheUJlZm9yZVZpZXdNZW51KGZsYWc/OmJvb2xlYW4pOmFueSB7XG4gICAgICAgIGlmIChmbGFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9kaXNwbGF5QmVmb3JlVmlld01lbnVGbGFnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fZGlzcGxheUJlZm9yZVZpZXdNZW51RmxhZyA9IGZsYWc7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2l0aCBhbiBhcnJheSBvZiByZWNvcmQgSURzIGZvciBmaWx0ZXJpbmcsIGFuZCBhIGZpbHRlcmVkIGFycmF5IGlzIHJldHVybmVkLlxuICAgIC8vIEl0IGlzIGFjY2VwdGFibGUgdG8ganVzdCByZXR1cm4gdGhlIG9yaWdpbmFsIGFycmF5IGlmIG5vIHJlY29yZCBmaWx0ZXJpbmcgbmVlZHMgdG8gYmUgZG9uZS5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gcm93SURzO1xuICAgIH1cbn1cblxuXG5cbi8vIEEgZ2VuZXJpYyBcIlNlbGVjdCBBbGxcIiBoZWFkZXIgd2lkZ2V0LCBhcHBlYXJpbmcgYXMgYSBidXR0b24uXG4vLyBXaGVuIGNsaWNrZWQsIGl0IHdhbGtzIHRocm91Z2ggZXZlcnkgcm93IGFuZCBjZWxsIGxvb2tpbmcgZm9yIERhdGFHcmlkLWNyZWF0ZWQgY2hlY2tib3hlcyxcbi8vIGFuZCBjaGVja3MgZXZlcnkgb25lIGl0IGZpbmRzLlxuY2xhc3MgREdTZWxlY3RBbGxXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZEhlYWRlcldpZGdldCB7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIGJ1dHRvbklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCArICdTZWxBbGwnICsgdW5pcXVlSUQ7XG4gICAgICAgIHZhciBidXR0b24gPSAkKHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSk7XG4gICAgICAgIGJ1dHRvbi5hdHRyKHsgJ2lkJzogYnV0dG9uSUQsICduYW1lJzogYnV0dG9uSUQsICd2YWx1ZSc6ICdTZWxlY3QgQWxsJyB9KVxuICAgICAgICAgICAgLmFkZENsYXNzKCd0YWJsZUNvbnRyb2wnKVxuICAgICAgICAgICAgLmNsaWNrKCgpID0+IHRoaXMuY2xpY2tIYW5kbGVyKCkpO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2J1dHRvbicpOyAvLyBKUXVlcnkgYXR0ciBjYW5ub3QgZG8gdGhpc1xuICAgIH1cblxuXG4gICAgY2xpY2tIYW5kbGVyKCk6dm9pZCB7XG4gICAgICAgIHZhciBzZXF1ZW5jZSA9IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jdXJyZW50U2VxdWVuY2UoKTtcbiAgICAgICAgLy8gSGF2ZSBEYXRhR3JpZCBhcHBseSBmdW5jdGlvbiB0byBldmVyeXRoaW5nIGluIGN1cnJlbnQgc2VxdWVuY2VcbiAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmFwcGx5VG9SZWNvcmRTZXQoKHJvd3MpID0+IHtcbiAgICAgICAgICAgIC8vIGVhY2ggcm93IGluIHNlcXVlbmNlXG4gICAgICAgICAgICByb3dzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGVhY2ggY2VsbCBpbiByb3dcbiAgICAgICAgICAgICAgICByb3cuZGF0YUdyaWREYXRhQ2VsbHMuZm9yRWFjaCgoY2VsbCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgY2VsbCBoYXMgYSBjaGVja2JveCwgY2hlY2sgaXRcbiAgICAgICAgICAgICAgICAgICAgY2VsbC5jaGVja2JveEVsZW1lbnQgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIChjZWxsLmNoZWNrYm94RWxlbWVudC5jaGVja2VkID0gdHJ1ZSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICQoY2VsbC5jaGVja2JveEVsZW1lbnQpLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIHNlcXVlbmNlKTtcbiAgICB9XG59XG5cblxuXG4vLyBIZXJlJ3MgYW4gZXhhbXBsZSBvZiBhIHdvcmtpbmcgRGF0YUdyaWRIZWFkZXJXaWRnZXQuXG4vLyBJdCdzIGEgc2VhcmNoIGZpZWxkIHRoYXQgbmFycm93cyB0aGUgc2V0IG9mIHJvd3MgdG8gb25lcyB0aGF0IGNvbnRhaW4gdGhlIGdpdmVuIHN0cmluZy5cbmNsYXNzIERHU2VhcmNoV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRIZWFkZXJXaWRnZXQge1xuXG4gICAgc2VhcmNoQm94RWxlbWVudDpIVE1MSW5wdXRFbGVtZW50O1xuICAgIHBsYWNlSG9sZGVyOnN0cmluZztcbiAgICBmaWVsZFNpemU6bnVtYmVyO1xuICAgIHR5cGluZ1RpbWVvdXQ6bnVtYmVyO1xuICAgIHR5cGluZ0RlbGF5Om51bWJlcjtcbiAgICBsYXN0S2V5UHJlc3NDb2RlOm51bWJlcjtcbiAgICBwcmV2aW91c1NlbGVjdGlvbjpzdHJpbmc7XG4gICAgbWluQ2hhcnNUb1RyaWdnZXJTZWFyY2g6bnVtYmVyO1xuICAgIGdldHNGb2N1czpib29sZWFuOyAgICAvLyBJZiB0cnVlLCB0aGUgc2VhcmNoIGJveCBzaG91bGQgYmUgY29uZmlndXJlZCB0byBjbGFpbSBmb2N1cyBhcyBzb29uIGFzIHRoZSBwYWdlIGlzIGxvYWRlZFxuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgcGxhY2VIb2xkZXI6c3RyaW5nLCBzaXplOm51bWJlciwgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5wbGFjZUhvbGRlciA9IHBsYWNlSG9sZGVyO1xuICAgICAgICB0aGlzLmZpZWxkU2l6ZSA9IHNpemU7XG4gICAgICAgIHRoaXMuZ2V0c0ZvY3VzID0gZ2V0c0ZvY3VzO1xuICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBudWxsO1xuICAgICAgICB0aGlzLnR5cGluZ0RlbGF5ID0gMzMwO1xuICAgICAgICB0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZpb3VzU2VsZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCA9IDE7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9uc1xuICAgIC8vIHdoZW4gY3JlYXRpbmcgaW5wdXQgZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICB2YXIgc0JveElEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCArICdTZWFyY2hCb3gnICsgdW5pcXVlSUQ7XG4gICAgICAgIHZhciBzQm94OkpRdWVyeSA9ICQodGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpKVxuICAgICAgICAgICAgLmF0dHIoeyAnaWQnOiBzQm94SUQsICduYW1lJzogc0JveElELCAnc2l6ZSc6IHRoaXMuZmllbGRTaXplLCAncGxhY2Vob2xkZXInOiB0aGlzLnBsYWNlSG9sZGVyIH0pXG4gICAgICAgICAgICAuYWRkQ2xhc3MoJ3RhYmxlQ29udHJvbCBzZWFyY2hCb3gnKS5rZXlkb3duKChlKSA9PiB0aGlzLmlucHV0S2V5RG93bkhhbmRsZXIoZSkpO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RleHQnKTsgLy8gSlF1ZXJ5IC5hdHRyKCkgY2Fubm90IHNldCB0aGlzXG4gICAgICAgIGlmICh0aGlzLmdldHNGb2N1cykge1xuICAgICAgICAgICAgc0JveC5hdHRyKCdhdXRvZm9jdXMnLCAnYXV0b2ZvY3VzJyk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGlucHV0S2V5RG93bkhhbmRsZXIoZSkge1xuICAgICAgICAvLyB0cmFjayBsYXN0IGtleSBwcmVzc2VkXG4gICAgICAgIHRoaXMubGFzdEtleVByZXNzQ29kZSA9IGUua2V5Q29kZTtcbiAgICAgICAgc3dpdGNoIChlLmtleUNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgMzg6IC8vIHVwXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSA0MDogLy8gZG93blxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgOTogIC8vIHRhYlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAxMzogLy8gcmV0dXJuXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50eXBpbmdUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnR5cGluZ1RpbWVvdXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMudHlwaW5nRGVsYXlFeHBpcmF0aW9uSGFuZGxlciwgdGhpcy50eXBpbmdEZWxheSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIChOb3RlOiBUaGlzIHN5bnRheCBjYXVzZXMgXCJ0aGlzXCIgdG8gYmVoYXZlIGluIGEgbm9uLUphdmFzY3JpcHQgd2F5XG4gICAgLy8gc2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTYxNTc4MzkvdHlwZXNjcmlwdC10aGlzLWluc2lkZS1hLWNsYXNzLW1ldGhvZCApXG4gICAgdHlwaW5nRGVsYXlFeHBpcmF0aW9uSGFuZGxlciA9ICgpID0+IHtcbiAgICAgICAgLy8gaWdub3JlIGlmIHRoZSBmb2xsb3dpbmcga2V5cyBhcmUgcHJlc3NlZDogW2RlbF0gW3NoaWZ0XSBbY2Fwc2xvY2tdXG4gICAgICAgIC8vaWYgKHRoaXMubGFzdEtleVByZXNzQ29kZSA9PSA0Nikge1xuICAgICAgICAvLyAgICByZXR1cm47XG4gICAgICAgIC8vfVxuICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbZGVsXSBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgaWYgKHRoaXMubGFzdEtleVByZXNzQ29kZSA+IDggJiYgdGhpcy5sYXN0S2V5UHJlc3NDb2RlIDwgMzIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdiA9ICQodGhpcy5lbGVtZW50KS52YWwoKTtcbiAgICAgICAgaWYgKHYgPT0gdGhpcy5wcmV2aW91c1NlbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucHJldmlvdXNTZWxlY3Rpb24gPSB2O1xuICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY2xpY2tlZEhlYWRlcldpZGdldCh0aGlzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdpdGggYW4gYXJyYXkgb2YgcmVjb3JkIElEcyBmb3IgZmlsdGVyaW5nLCBhbmQgYSBmaWx0ZXJlZCBhcnJheSBpcyByZXR1cm5lZC5cbiAgICAvLyBJdCBpcyBhY2NlcHRhYmxlIHRvIGp1c3QgcmV0dXJuIHRoZSBvcmlnaW5hbCBhcnJheSBpZiBubyByZWNvcmQgZmlsdGVyaW5nIG5lZWRzIHRvIGJlIGRvbmUuXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcblxuICAgICAgICB2YXIgdiA9IHRoaXMucHJldmlvdXNTZWxlY3Rpb247XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHYubGVuZ3RoIDwgdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuXG4gICAgICAgIHYgPSB2LnRyaW0oKTsgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgdiA9IHYudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgdiA9IHYucmVwbGFjZSgvXFxzXFxzKi8sICcgJyk7IC8vIFJlcGxhY2UgaW50ZXJuYWwgd2hpdGVzcGFjZSB3aXRoIHNpbmdsZSBzcGFjZXNcblxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgd29yZHMsIHdlIG1hdGNoIGVhY2ggc2VwYXJhdGVseS5cbiAgICAgICAgLy8gV2Ugd2lsbCBub3QgYXR0ZW1wdCB0byBtYXRjaCBhZ2FpbnN0IGVtcHR5IHN0cmluZ3MsIHNvIHdlIGZpbHRlciB0aG9zZSBvdXQgaWYgYW55IHNsaXBwZWQgdGhyb3VnaFxuICAgICAgICB2YXIgcXVlcnlTdHJzID0gdi5zcGxpdCgnICcpLmZpbHRlcigob25lKSA9PiB7IHJldHVybiBvbmUubGVuZ3RoID4gMDsgfSk7XG5cbiAgICAgICAgdmFyIGZpbHRlcmVkSURzID0gW107XG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5hcHBseVRvUmVjb3JkU2V0KChyb3dzLCBpZCkgPT4ge1xuICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICByb3cuZGF0YUdyaWREYXRhQ2VsbHMuZm9yRWFjaCgoY2VsbCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbC5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRleHQgPSBjZWxsLmNvbnRlbnRDb250YWluZXJFbGVtZW50LnRleHRDb250ZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbWF0Y2ggPSBxdWVyeVN0cnMuc29tZSgodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IFNob2xkbid0IHRoaXMgYmUgdGV4dC5sZW5ndGggPj0gdi5sZW5ndGggP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0ZXh0Lmxlbmd0aCA+IHYubGVuZ3RoICYmIHRleHQuaW5kZXhPZih2KSA+PSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKGlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIHJvd0lEcyk7XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZElEcztcbiAgICB9XG59XG5cblxuY2xhc3MgRGF0YUdyaWRTb3J0IHtcbiAgICBzcGVjOkRhdGFHcmlkSGVhZGVyU3BlYztcbiAgICBhc2M6Ym9vbGVhbjtcbn1cbmludGVyZmFjZSBER1BhZ2VEYXRhU291cmNlIHtcblxuICAgIHBhZ2VTaXplKCk6bnVtYmVyO1xuICAgIHBhZ2VTaXplKHNpemU6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHBhZ2VTaXplKHNpemU/Om51bWJlcik6YW55O1xuICAgIHRvdGFsT2Zmc2V0KCk6bnVtYmVyO1xuICAgIHRvdGFsT2Zmc2V0KG9mZnNldDpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgdG90YWxPZmZzZXQob2Zmc2V0PzpudW1iZXIpOmFueTtcbiAgICB0b3RhbFNpemUoKTpudW1iZXI7XG4gICAgdG90YWxTaXplKHNpemU6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHRvdGFsU2l6ZShzaXplPzpudW1iZXIpOmFueTtcbiAgICB2aWV3U2l6ZSgpOm51bWJlcjtcbiAgICBxdWVyeSgpOnN0cmluZztcbiAgICBxdWVyeShxdWVyeTpzdHJpbmcpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgcXVlcnkocXVlcnk/OnN0cmluZyk6YW55O1xuICAgIGZpbHRlcigpOmFueTtcbiAgICBmaWx0ZXIob3B0OmFueSk6REdQYWdlRGF0YVNvdXJjZTtcbiAgICBmaWx0ZXIob3B0PzphbnkpOmFueTtcbiAgICBwYWdlRGVsdGEoZGVsdGE6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHJlcXVlc3RQYWdlT2ZEYXRhKGNhbGxiYWNrPzooc3VjY2Vzczpib29sZWFuKSA9PiB2b2lkKTpER1BhZ2VEYXRhU291cmNlO1xuXG59XG5cblxuXG4vLyBUaGlzIGlzIGEgd2lkZ2V0IHRoYXQgd2lsbCBwbGFjZSBjb250cm9scyBmb3IgcGFnaW5nXG5jbGFzcyBER1BhZ2luZ1dpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgc291cmNlOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgcHJpdmF0ZSB3aWRnZXRFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgbGFiZWxFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgbmV4dEVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBwcmV2RWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHJlcXVlc3REb25lOihzdWNjZXNzOmJvb2xlYW4pID0+IHZvaWQgPSAoc3VjY2Vzczpib29sZWFuKTp2b2lkID0+IHtcbiAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgc291cmNlOkRHUGFnZURhdGFTb3VyY2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5zb3VyY2UgPSBzb3VyY2U7XG4gICAgICAgIHRoaXMuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgICQodGhpcy53aWRnZXRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNvbnRhaW5lcik7XG4gICAgICAgICAgICAkKHRoaXMubGFiZWxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aGlzLndpZGdldEVsZW1lbnQpO1xuICAgICAgICAgICAgJCh0aGlzLnByZXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdocmVmJywgJyMnKS5jc3MoJ21hcmdpbicsICcwIDVweCcpXG4gICAgICAgICAgICAgICAgLnRleHQoJzwgUHJldmlvdXMnKS5wcm9wKCdkaXNhYmxlZCcsIHRydWUpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKHRoaXMud2lkZ2V0RWxlbWVudClcbiAgICAgICAgICAgICAgICAuY2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdXJjZS5wYWdlRGVsdGEoLTEpLnJlcXVlc3RQYWdlT2ZEYXRhKHRoaXMucmVxdWVzdERvbmUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkKHRoaXMubmV4dEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJykpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2hyZWYnLCAnIycpLmNzcygnbWFyZ2luJywgJzAgNXB4JylcbiAgICAgICAgICAgICAgICAudGV4dCgnTmV4dCA+JykucHJvcCgnZGlzYWJsZWQnLCB0cnVlKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aGlzLndpZGdldEVsZW1lbnQpXG4gICAgICAgICAgICAgICAgLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VyY2UucGFnZURlbHRhKDEpLnJlcXVlc3RQYWdlT2ZEYXRhKHRoaXMucmVxdWVzdERvbmUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJlZnJlc2hXaWRnZXQoKTtcbiAgICB9XG5cbiAgICByZWZyZXNoV2lkZ2V0KCkge1xuICAgICAgICB2YXIgdG90YWxTaXplOm51bWJlciA9IHRoaXMuc291cmNlLnRvdGFsU2l6ZSgpO1xuICAgICAgICB2YXIgdmlld1NpemU6bnVtYmVyID0gdGhpcy5zb3VyY2Uudmlld1NpemUoKTtcbiAgICAgICAgdmFyIHN0YXJ0Om51bWJlciA9IHRoaXMuc291cmNlLnRvdGFsT2Zmc2V0KCk7XG4gICAgICAgIHZhciBsYWJlbFRleHQ7XG4gICAgICAgIGlmICh0b3RhbFNpemUpIHtcbiAgICAgICAgICAgIGxhYmVsVGV4dCA9IFsgJ0Rpc3BsYXlpbmcgJywgc3RhcnQgKyAxLCAnLScsIHN0YXJ0ICsgdmlld1NpemUsICcgb2YgJywgdG90YWxTaXplIF0uam9pbignJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsYWJlbFRleHQgPSAnTm8gcmVzdWx0cyBmb3VuZCEnO1xuICAgICAgICB9XG4gICAgICAgICQodGhpcy5sYWJlbEVsZW1lbnQpLnRleHQobGFiZWxUZXh0KTtcbiAgICAgICAgJCh0aGlzLnByZXZFbGVtZW50KS5wcm9wKCdkaXNhYmxlZCcsICFzdGFydCk7XG4gICAgICAgICQodGhpcy5uZXh0RWxlbWVudCkucHJvcCgnZGlzYWJsZWQnLCBzdGFydCArIHZpZXdTaXplID49IHRvdGFsU2l6ZSk7XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBUYWJsZVNwZWMgb2JqZWN0IHVzZWQgYnkgRGF0YUdyaWRTcGVjQmFzZVxuY2xhc3MgRGF0YUdyaWRUYWJsZVNwZWMge1xuXG4gICAgbmFtZTpzdHJpbmc7ICAgICAgICAgICAgLy8gTGFiZWwgdG8gcHV0IGluIHRoZSB0aXRsZSBoZWFkZXJcbiAgICBpZDpzdHJpbmc7ICAgICAgICAgICAgICAvLyBBIHVuaXF1ZSBJRCBzdHJpbmcgZm9yIHRoaXMgdGFibGUsIHRvIGNhdCB3aXRoIG90aGVyIElEIHN0cmluZ3MgZm9yIGdlbmVyYXRlZCB0YWJsZSBlbGVtZW50c1xuICAgIGRlZmF1bHRTb3J0Om51bWJlcjsgICAgIC8vIEluZGV4IG9mIGhlYWRlciB0byBzb3J0IGJ5IGRlZmF1bHRcbiAgICBzaG93SGVhZGVyOmJvb2xlYW47ICAgICAvLyBXaGV0aGVyIHRvIGNyZWF0ZSBhIGhlYWRlciBhcmVhIGF0IHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgYXBwbHlTdHJpcGluZzpib29sZWFuOyAgLy8gV2hldGhlciB0byBhcHBseSBob3Jpem9udGFsIHN0cmlwaW5nIHN0eWxlcyB0byBhbHRlcm5hdGUgcm93c1xuXG4gICAgY29uc3RydWN0b3IoaWQ6c3RyaW5nLCBvcHQ/OntbaW5kZXg6c3RyaW5nXTphbnl9KSB7XG4gICAgICAgIHRoaXMuaWQgPSBpZDsgICAgICAgLy8gSUQgaXMgcmVxdWlyZWQsIGluaXRpYWxpemUgc2Vuc2libGUgZGVmYXVsdHMgZm9yIGV2ZXJ5dGhpbmcgZWxzZVxuICAgICAgICBvcHQgPSAkLmV4dGVuZCh7ICduYW1lJzogJycsICdkZWZhdWx0U29ydCc6IDAsICdzaG93SGVhZGVyJzogdHJ1ZSwgJ2FwcGx5U3RyaXBpbmcnOiB0cnVlIH0sIG9wdCk7XG4gICAgICAgIHRoaXMubmFtZSA9IG9wdFsnbmFtZSddO1xuICAgICAgICB0aGlzLmRlZmF1bHRTb3J0ID0gb3B0WydkZWZhdWx0U29ydCddO1xuICAgICAgICB0aGlzLnNob3dIZWFkZXIgPSBvcHRbJ3Nob3dIZWFkZXInXTtcbiAgICAgICAgdGhpcy5hcHBseVN0cmlwaW5nID0gb3B0WydhcHBseVN0cmlwaW5nJ107XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBIZWFkZXJTcGVjIG9iamVjdCB1c2VkIGJ5IERhdGFHcmlkU3BlY0Jhc2VcbmNsYXNzIERhdGFHcmlkSGVhZGVyU3BlYyB7XG4gICAgbmFtZTpzdHJpbmc7ICAgICAgICAgICAgLy8gVGhlIG5hbWUgdGhhdCBhcHBlYXJzIGluIHRoZSBoZWFkZXIgY2VsbCwgYW5kIGluIHRoZSBjb2x1bW4gc2hvdy9oaWRlIHdpZGdldFxuICAgIGlkOnN0cmluZzsgICAgICAgICAgICAgIC8vIEFuIElEIHRvIGFzc2lnbiB0byB0aGUgZWxlbWVudFxuICAgIGFsaWduOnN0cmluZzsgICAgICAgICAgIC8vIFRPRE86IHNob3VsZCBiZSBhbiBlbnVtIHR5cGUgb2Y6ICdsZWZ0JywgJ3JpZ2h0JywgJ2NlbnRlcidcbiAgICB2YWxpZ246c3RyaW5nOyAgICAgICAgICAvLyBUT0RPOiBzaG91bGQgYmUgYW4gZW51bSB0eXBlIG9mOiAndG9wJywgJ21pZGRsZScsICdib3R0b20nLCAnYmFzZWxpbmUnXG4gICAgbm93cmFwOmJvb2xlYW47ICAgICAgICAgLy8gSWYgc2V0LCBhZGQgYSBzdHlsZSB0aGF0IHByZXZlbnRzIGxvbmcgc3RyaW5ncyBmcm9tIHdyYXBwaW5nIGluIHRoZSBjZWxsXG4gICAgcm93c3BhbjpudW1iZXI7ICAgICAgICAgLy8gTnVtYmVyIHRvIHB1dCBpbiBhIHJvd3NwYW4gZm9yIHRoZSBoZWFkZXIuXG4gICAgY29sc3BhbjpudW1iZXI7ICAgICAgICAgLy8gTnVtYmVyIHRvIHB1dCBpbiBhIGNvbHNwYW4gZm9yIHRoZSBoZWFkZXIuXG4gICAgaGVhZGVyUm93Om51bWJlcjsgICAgICAgLy8gV2hpY2ggcm93IHRvIHBsYWNlIHRoaXMgaGVhZGVyIGluLCBzdGFydGluZyB3aXRoIDEgYXMgdGhlIGZpcnN0IHJvdy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBVc2VkIHdoZW4gY29uc3RydWN0aW5nIG11bHRpLXJvdyBoZWFkZXIgc2VjdGlvbnMgdGhhdCB1c2Ugcm93c3BhbiBhbmQgY29sc3BhbiB0YWdzIHRvIG1ha2Ugc3ViLWhlYWRlcnMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSGVhZGVycyBhcmUgaW5zZXJ0ZWQgaW50byB0aGVpciBpbmRpY2F0ZWQgcm93cyBpbiB0aGUgc2FtZSByZWxhdGl2ZSBvcmRlciBhcyB0aGV5IGFyZSBsaXN0ZWQgaW4gdGhpcyBzcGVjLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIExlYXZpbmcgdGhpcyBvdXQgd2lsbCBwbGFjZSB0aGUgaGVhZGVyIGluIHRoZSBmaXJzdCByb3cuXG4gICAgY29sdW1uR3JvdXA6bnVtYmVyOyAgICAgLy8gVGhlIGNvbHVtbiBncm91cCB0aGlzIGhlYWRlciBiZWxvbmdzIHRvLiAgVXNlZCBmb3IgaGlkaW5nIGFuZCBzaG93aW5nIGNvbHVtbnMuXG4gICAgZGlzcGxheTpzdHJpbmc7ICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gdHlwZSBvZjogJ25vbmUnLCAnaW5saW5lJywgJ2Jsb2NrJywgJ2xpc3QtaXRlbScsICdpbmxpbmUtYmxvY2snLCBhbmQgcG9zc2libHkgdGhlICdpbmxpbmUtdGFibGUnIGFuZCAndGFibGUtKicgdmFsdWVzXG4gICAgc2l6ZTpzdHJpbmc7ICAgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gb2YgYWNjZXB0ZWQgdmFsdWVzOiAnbScsICdzJ1xuICAgIHdpZHRoOnN0cmluZzsgICAgICAgICAgIC8vIElmIHByZXNlbnQsIHNldCB0aGUgaGVhZGVyIChhbmQgdGhlcmVieSB0aGUgd2hvbGUgY29sdW1uIGJlbG93IGl0KSB0byBhIGZpeGVkIHdpZHRoLlxuICAgIHNvcnRCeTooaW5kZXg6bnVtYmVyKT0+YW55O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEEgZnVuY3Rpb24gcmVzb2x2aW5nIGEgcm93IElEIHRvIGEgdmFsdWUgd2UgY2FuIHVzZSBmb3Igc29ydGluZyBieSB0aGlzIGhlYWRlclxuICAgIHNvcnRBZnRlcjpudW1iZXI7ICAgICAgIC8vIFRoZSBpbmRleCBvZiBhbm90aGVyIGhlYWRlciB0aGF0IHdlIHdpbGwgYmFzZSB0aGVzZSBzb3J0aW5nIHJlc3VsdHMgb24gKGUuZy4gc29ydCBieSBEZXNjcmlwdGlvbiwgdGhlbiBieSBTdHVkeSBOYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIExlYXZlIHRoaXMgcHJvcGVydHkgZW1wdHkgaWYgdGhlcmUgaXMgbm8gc29ydGluZyBwcmVyZXF1aXNpdGUuXG4gICAgc29ydElkOnN0cmluZzsgICAgICAgICAgLy8gYW4gSUQgdG8gdXNlIHdoZW4gc29ydGluZyBvbiBzZXJ2ZXItc2lkZVxuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGhpZGRlbjpib29sZWFuO1xuICAgIGVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgc29ydEZ1bmM6KGE6bnVtYmVyLGI6bnVtYmVyKT0+bnVtYmVyO1xuICAgIHNvcnRlZDpib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoZ3JvdXA6bnVtYmVyLCBpZDpzdHJpbmcsIG9wdD86e1tpbmRleDpzdHJpbmddOmFueX0pIHtcbiAgICAgICAgdGhpcy5jb2x1bW5Hcm91cCA9IGdyb3VwO1xuICAgICAgICB0aGlzLmlkID0gaWQ7ICAgICAgIC8vIElEIGlzIHJlcXVpcmVkLCBpbml0aWFsaXplIHNlbnNpYmxlIGRlZmF1bHRzIGZvciBldmVyeXRoaW5nIGVsc2VcbiAgICAgICAgb3B0ID0gJC5leHRlbmQoeyAnbmFtZSc6ICcnLCAnYWxpZ24nOiAnbGVmdCcsICdzaXplJzogJ20nLCAnc29ydEFmdGVyJzogLTEgfSwgb3B0KTsgICAvLyBtb3N0IHRoaW5ncyBjYW4gYmUgbnVsbFxuICAgICAgICB0aGlzLm5hbWUgPSBvcHRbJ25hbWUnXTtcbiAgICAgICAgdGhpcy5hbGlnbiA9IG9wdFsnYWxpZ24nXTtcbiAgICAgICAgdGhpcy52YWxpZ24gPSBvcHRbJ3ZhbGlnbiddO1xuICAgICAgICB0aGlzLm5vd3JhcCA9IG9wdFsnbm93cmFwJ107XG4gICAgICAgIHRoaXMucm93c3BhbiA9IG9wdFsncm93c3BhbiddO1xuICAgICAgICB0aGlzLmNvbHNwYW4gPSBvcHRbJ2NvbHNwYW4nXTtcbiAgICAgICAgdGhpcy5oZWFkZXJSb3cgPSBvcHRbJ2hlYWRlclJvdyddO1xuICAgICAgICB0aGlzLmRpc3BsYXkgPSBvcHRbJ2Rpc3BsYXknXTtcbiAgICAgICAgdGhpcy5zaXplID0gb3B0WydzaXplJ107XG4gICAgICAgIHRoaXMud2lkdGggPSBvcHRbJ3dpZHRoJ107XG4gICAgICAgIHRoaXMuc29ydEJ5ID0gb3B0Wydzb3J0QnknXTtcbiAgICAgICAgdGhpcy5zb3J0QWZ0ZXIgPSBvcHRbJ3NvcnRBZnRlciddO1xuICAgICAgICB0aGlzLnNvcnRJZCA9IG9wdFsnc29ydElkJ107XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBDb2x1bW5TcGVjIG9iamVjdCB1c2VkIGJ5IERhdGFHcmlkU3BlY0Jhc2VcbmNsYXNzIERhdGFHcmlkQ29sdW1uU3BlYyB7XG4gICAgY29sdW1uR3JvdXA6bnVtYmVyO1xuICAgIGdlbmVyYXRlQ2VsbHNGdW5jdGlvbjooZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaW5kZXg6c3RyaW5nKT0+RGF0YUdyaWREYXRhQ2VsbFtdO1xuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGNyZWF0ZWREYXRhQ2VsbE9iamVjdHM6e1tpZDpzdHJpbmddOkRhdGFHcmlkRGF0YUNlbGxbXX07XG5cbiAgICBjb25zdHJ1Y3Rvcihncm91cDpudW1iZXIsIGdlbmVyYXRlQ2VsbHM6KGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk9PkRhdGFHcmlkRGF0YUNlbGxbXSkge1xuICAgICAgICB0aGlzLmNvbHVtbkdyb3VwID0gZ3JvdXA7XG4gICAgICAgIHRoaXMuZ2VuZXJhdGVDZWxsc0Z1bmN0aW9uID0gZ2VuZXJhdGVDZWxscztcbiAgICAgICAgdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzID0ge307XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGMgPSB0aGlzLmdlbmVyYXRlQ2VsbHNGdW5jdGlvbihncmlkU3BlYywgaW5kZXgpO1xuICAgICAgICB0aGlzLmNyZWF0ZWREYXRhQ2VsbE9iamVjdHNbaW5kZXhdID0gYy5zbGljZSgwKTtcbiAgICAgICAgICByZXR1cm4gYztcbiAgICB9XG5cblxuICAgIC8vIGNsZWFyRW50aXJlSW5kZXgoaW5kZXg6bnVtYmVyKTp2b2lkIHtcbiAgICAvLyAgICAgdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzID0ge307XG4gICAgLy8gfVxuXG5cbiAgICBjbGVhckluZGV4QXRJRChpbmRleDpzdHJpbmcpOnZvaWQge1xuICAgICAgICBkZWxldGUgdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzW2luZGV4XTtcbiAgICB9XG5cblxuICAgIGNlbGxJbmRleEF0SUQoaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzW2luZGV4XTtcbiAgICB9XG5cblxuICAgIGdldEVudGlyZUluZGV4KCk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGNlbGxzOkRhdGFHcmlkRGF0YUNlbGxbXSA9IFtdO1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzKSB7XG4gICAgICAgICAgICB2YXIgYTpEYXRhR3JpZERhdGFDZWxsW10gPSB0aGlzLmNyZWF0ZWREYXRhQ2VsbE9iamVjdHNba2V5XTtcbiAgICAgICAgICAgIGlmIChhKSB7XG4gICAgICAgICAgICAgICAgLy8gTXVjaCBmYXN0ZXIgdGhhbiByZXBlYXRlZCBjb25jYXRzXG4gICAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoY2VsbHMsIGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjZWxscztcbiAgICB9XG59XG5cblxuXG4vLyBEZWZpbmUgdGhlIENvbHVtbkdyb3VwU3BlYyBvYmplY3QgdXNlZCBieSBEYXRhR3JpZFNwZWNCYXNlXG5jbGFzcyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyB7XG4gICAgbmFtZTpzdHJpbmc7ICAgICAgICAgICAgICAgICAgICAvLyBSZWFkYWJsZSBsYWJlbCBzdHJpbmcgZm9yIHRoaXMgY29sdW1uIGdyb3VwXG4gICAgc2hvd0luVmlzaWJpbGl0eUxpc3Q6Ym9vbGVhbjsgICAvLyBXaGV0aGVyIHRvIHBsYWNlIHRoaXMgY29sdW1uIGluIHRoZSBzaG93L2hpZGUgbGlzdFxuICAgIGhpZGRlbkJ5RGVmYXVsdDpib29sZWFuOyAgICAgICAgLy8gRmxhZyBpZiBncm91cCBpcyBoaWRkZW4gYnkgZGVmYXVsdFxuICAgIC8vIGNhbGxiYWNrIGZvciB3aGVuIGEgY29sdW1uIHRyYW5zaXRpb25zIGZyb20gaGlkZGVuIHRvIHZpc2libGVcbiAgICByZXZlYWxlZENhbGxiYWNrOihzcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGdyaWQ6RGF0YUdyaWQpPT52b2lkO1xuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGN1cnJlbnRseUhpZGRlbjpib29sZWFuO1xuICAgIG1lbWJlckhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW107XG4gICAgbWVtYmVyQ29sdW1uczpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICBjaGVja2JveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcblxuICAgIGNvbnN0cnVjdG9yKGxhYmVsOnN0cmluZywgb3B0Pzp7W2luZGV4OnN0cmluZ106YW55fSkge1xuICAgICAgICB0aGlzLm5hbWUgPSBsYWJlbDtcbiAgICAgICAgb3B0ID0gJC5leHRlbmQoeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiB0cnVlIH0sIG9wdCk7XG4gICAgICAgIHRoaXMuc2hvd0luVmlzaWJpbGl0eUxpc3QgPSBvcHRbJ3Nob3dJblZpc2liaWxpdHlMaXN0J107XG4gICAgICAgIHRoaXMuaGlkZGVuQnlEZWZhdWx0ID0gb3B0WydoaWRkZW5CeURlZmF1bHQnXTtcbiAgICAgICAgdGhpcy5yZXZlYWxlZENhbGxiYWNrID0gb3B0WydyZXZlYWxlZENhbGxiYWNrJ107XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBSb3dHcm91cFNwZWMgb2JqZWN0IHVzZWQgYnkgRGF0YUdyaWRTcGVjQmFzZVxuY2xhc3MgRGF0YUdyaWRSb3dHcm91cFNwZWMge1xuICAgIG5hbWU6c3RyaW5nO1xuXG4gICAgLy9cbiAgICAvLyBUaGVzZSBhcmUgaW50ZXJuYWwgdmFsdWVzIHRoYXQgc2hvdWxkIG5vdCBiZSBkZWZpbmVkIGJ5IHNwZWNcbiAgICAvL1xuICAgIGRpc2Nsb3NlZDpib29sZWFuO1xuICAgIGRpc2Nsb3NlZFRpdGxlUm93OkhUTUxFbGVtZW50O1xuICAgIGRpc2Nsb3NlZFRpdGxlUm93SlE6SlF1ZXJ5O1xuICAgIHVuZGlzY2xvc2VkVGl0bGVSb3c6SFRNTEVsZW1lbnQ7XG4gICAgdW5kaXNjbG9zZWRUaXRsZVJvd0pROkpRdWVyeTtcbiAgICBtZW1iZXJSZWNvcmRzOkRhdGFHcmlkUmVjb3JkW107XG5cbiAgICBjb25zdHJ1Y3RvcihsYWJlbDpzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5uYW1lID0gbGFiZWw7XG4gICAgfVxufVxuXG5cblxuLy8gVXNlcnMgb2YgRGF0YUdyaWQgc2hvdWxkIGRlcml2ZSBmcm9tIHRoaXMgY2xhc3MsIGFsdGVyaW5nIHRoZSBjb25zdHJ1Y3RvciB0b1xuLy8gcHJvdmlkZSBhIHNwZWNpZmljYXRpb24gZm9yIHRoZSBsYXlvdXQsIGludGVyZmFjZSwgYW5kIGRhdGEgc291cmNlcyBvZiB0aGVpciBEYXRhR3JpZCB0YWJsZSxcbi8vIGFuZCBvdmVycmlkZSB0aGUgY2FsbGJhY2tzIHRvIGN1c3RvbWl6ZSBmdW5jdGlvbmFsaXR5LlxuLy8gVGhlbiwgd2hlbiB0aGV5IGluc3RhbnRpYXRlIGEgRGF0YUdyaWQsIHRoZXkgc2hvdWxkIHByb3ZpZGUgYW4gaW5zdGFuY2Ugb2YgdGhpcyBkZXJpdmVkIERhdGFHcmlkU3BlY0Jhc2UuXG4vLyBBcyBhbiBleGFtcGxlLCB0aGlzIGJhc2UgY2xhc3MgaXMgc2V0IHVwIHRvIHJlbmRlciB0aGUgU3R1ZGllcyB0YWJsZSBvbiB0aGUgbWFpbiBwYWdlIG9mIHRoZSBFREQuXG5jbGFzcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIC8vIFRoZXNlIHdpbGwgYWxsIGJlIGRlZmluZWQgb3Igc2V0IGJ5IHRoZSBjb25zdHJ1Y3RvclxuICAgIHRhYmxlU3BlYzpEYXRhR3JpZFRhYmxlU3BlYztcbiAgICB0YWJsZUhlYWRlclNwZWM6RGF0YUdyaWRIZWFkZXJTcGVjW107XG4gICAgdGFibGVDb2x1bW5TcGVjOkRhdGFHcmlkQ29sdW1uU3BlY1tdO1xuICAgIHRhYmxlQ29sdW1uR3JvdXBTcGVjOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgdGFibGVSb3dHcm91cFNwZWM6RGF0YUdyaWRSb3dHcm91cFNwZWNbXTtcbiAgICB0YWJsZUVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG5cblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnRhYmxlRWxlbWVudCA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgIHRoaXMudGFibGVTcGVjID0gdGhpcy5kZWZpbmVUYWJsZVNwZWMoKTtcbiAgICAgICAgdGhpcy50YWJsZUhlYWRlclNwZWMgPSB0aGlzLmRlZmluZUhlYWRlclNwZWMoKTtcbiAgICAgICAgdGhpcy50YWJsZUNvbHVtblNwZWMgPSB0aGlzLmRlZmluZUNvbHVtblNwZWMoKTtcbiAgICAgICAgdGhpcy50YWJsZUNvbHVtbkdyb3VwU3BlYyA9IHRoaXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk7XG4gICAgICAgIHRoaXMudGFibGVSb3dHcm91cFNwZWMgPSB0aGlzLmRlZmluZVJvd0dyb3VwU3BlYygpO1xuICAgIH1cblxuICAgIC8vIEFsbCBvZiB0aGVzZSBcImRlZmluZVwiIGZ1bmN0aW9ucyBzaG91bGQgYmUgb3ZlcnJpZGRlblxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygndW5pcXVlc3RyaW5nJywgeyAnbmFtZSc6ICdBd2Vzb21lIFRhYmxlJyB9KTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBoZWFkZXJzIGFsb25nIHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMSwgJ2hOYW1lJywgeyAnbmFtZSc6ICdOYW1lJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hEZXNjJywgeyAnbmFtZSc6ICdEZXNjcmlwdGlvbicgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGRhdGEgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVDb2x1bW5TcGVjKCk6RGF0YUdyaWRDb2x1bW5TcGVjW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCAoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBjZWxsKHMpIGZvciBhIGdpdmVuIHJlY29yZCBJRCwgZm9yIGNvbHVtbiAxXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgpXTsgXG4gICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiwgKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdID0+IHtcbiAgICAgICAgICAgICAgICAgICAvLyBDcmVhdGUgY2VsbChzKSBmb3IgYSBnaXZlbiByZWNvcmQgSUQsIGZvciBjb2x1bW4gMlxuICAgICAgICAgICAgICAgIHJldHVybiBbbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4KV07IFxuICAgICAgICAgICAgICAgfSksXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRGVzY3JpcHRpb24nKVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGdyb3VwcyB0aGF0IHJvd3MgY2FuIGJlIGdhdGhlcmVkIGludG9cbiAgICBkZWZpbmVSb3dHcm91cFNwZWMoKTpEYXRhR3JpZFJvd0dyb3VwU3BlY1tdIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuXG4gICAgLy8gYXR0YWNoIGV2ZW50IGhhbmRsZXJzIGZvciBzb3J0aW5nXG4gICAgZW5hYmxlU29ydChncmlkOkRhdGFHcmlkKTpEYXRhR3JpZFNwZWNCYXNlIHtcbiAgICAgICAgdGhpcy50YWJsZUhlYWRlclNwZWMuZm9yRWFjaCgoaGVhZGVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaGVhZGVyLnNvcnRCeSkge1xuICAgICAgICAgICAgICAgICQoaGVhZGVyLmVsZW1lbnQpLm9uKCdjbGljay5kYXRhdGFibGUnLCAoZXYpID0+IHRoaXMuY2xpY2tlZFNvcnQoZ3JpZCwgaGVhZGVyLCBldikpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLy8gVGhlIHNlcnZlciBjb2RlIGhvb2tzIHRhYmxlIGhlYWRlcnMgd2l0aCB0aGlzIGZ1bmN0aW9uLlxuICAgIHByaXZhdGUgY2xpY2tlZFNvcnQoZ3JpZDpEYXRhR3JpZCwgaGVhZGVyOkRhdGFHcmlkSGVhZGVyU3BlYywgZXYpIHtcbiAgICAgICAgdmFyIHNvcnQgPSBncmlkLnNvcnRDb2xzKCk7XG4gICAgICAgIGlmIChzb3J0Lmxlbmd0aCAmJiBzb3J0WzBdLnNwZWMuaWQgPT09IGhlYWRlci5pZCkge1xuICAgICAgICAgICAgc29ydFswXS5hc2MgPSAhc29ydFswXS5hc2M7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0ID0gWyB7ICdzcGVjJzogaGVhZGVyLCAnYXNjJzogdHJ1ZSB9IF07XG4gICAgICAgIH1cbiAgICAgICAgZ3JpZC5zb3J0Q29scyhzb3J0KS5hcnJhbmdlVGFibGVEYXRhUm93cygpO1xuICAgIH1cblxuXG4gICAgLy8gV2hlbiBwYXNzZWQgYSByZWNvcmQgSUQsIHJldHVybnMgdGhlIHJvdyBncm91cCB0aGF0IHRoZSByZWNvcmQgaXMgYSBtZW1iZXIgb2YuXG4gICAgZ2V0Um93R3JvdXBNZW1iZXJzaGlwKHJlY29yZElEOnN0cmluZyk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZGllc1RhYmxlXCIpO1xuICAgIH1cblxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBTdHVkaWVzXG4gICAgICAgIHZhciBhcnJheTpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG4gICAgICAgIGFycmF5LnB1c2gobmV3IERHU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIFN0dWRpZXMnLCA0MCwgdHJ1ZSkpO1xuICAgICAgICByZXR1cm4gYXJyYXk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LlxuICAgIC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZE9wdGlvbldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZE9wdGlvbldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBvbmx5IHRoZSBTdHVkaWVzIHRoYXQgYmVsb25nIHRvIHRoZSBjdXJyZW50IHVzZXJcbiAgICAgICAgLy8gICAgICAgIHZhciBvbmx5TXlTdHVkaWVzV2lkZ2V0ID0gbmV3IERHT25seU15U3R1ZGllc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIC8vICAgICAgICB3aWRnZXRTZXQucHVzaChvbmx5TXlTdHVkaWVzV2lkZ2V0KTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBTdHVkaWVzXG4gICAgICAgIC8vICAgICAgICB2YXIgZGlzYWJsZWRTdHVkaWVzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgLy8gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkU3R1ZGllc1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiBhIGRhdGEgcmVzZXQgaXMgdHJpZ2dlcmVkLCBidXQgYmVmb3JlIHRoZSB0YWJsZSByb3dzIGFyZSByZWJ1aWx0LlxuICAgIG9uRGF0YVJlc2V0KGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcbiAgICAgICAgcmV0dXJuOyAgICAvLyBEbyBub3RoaW5nIGJ5IGRlZmF1bHQuXG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aGVuIGEgcGFydGlhbCBkYXRhIHJlc2V0IGlzIHRyaWdnZXJlZCwgYnV0IGJlZm9yZSB0aGUgdGFibGUgcm93cyBhcmUgcmVidWlsdC5cbiAgICAvLyBBIHBhcnRpYWwgZGF0YSByZXNldCBpcyBvbmUgd2hlcmUgYSBjb2xsZWN0aW9uIG9mIHJlY29yZHMgaGF2ZSBiZWVuIHNwZWNpZmllZCBmb3IgcmUtcGFyc2luZyxcbiAgICAvLyBhbmQgd2lsbCBiZSBtaXhlZC1pbiB3aXRoIHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgY29sbGVjdGlvbiBhZnRlcndhcmRzLlxuICAgIG9uUGFydGlhbERhdGFSZXNldChkYXRhR3JpZDpEYXRhR3JpZCwgcmVjb3JkczpzdHJpbmdbXSk6dm9pZCB7XG4gICAgICAgIHJldHVybjsgICAgLy8gRG8gbm90aGluZyBieSBkZWZhdWx0LlxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHVzZXIgaGlkZXMgb3Igc2hvd3Mgcm93cy5cbiAgICBvblJvd1Zpc2liaWxpdHlDaGFuZ2VkKCk6dm9pZCB7XG5cbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSBhIGdyb3VwIG5hbWUuIFlvdSBjYW4gcHJvY2VzcyB5b3VyIGRhdGEgaG93ZXZlclxuICAgIC8vIHlvdSB3YW50IGluIG9yZGVyIHRvIGNvbWUgdXAgd2l0aCBhIG5hbWUuXG4gICAgZ2VuZXJhdGVHcm91cE5hbWUoZGF0YUdyaWQ6RGF0YUdyaWQsIGdyb3VwSUQ6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJHcm91cCBcIiArIGdyb3VwSUQ7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiB0aGUgZ3JvdXBpbmcgc2V0dGluZyBpcyBjaGFuZ2VkLCBpbiBjYXNlXG4gICAgLy8geW91IHdhbnQgdG8gcGVyc2lzdCB0aGUgc2V0dGluZyBzb21ld2hlcmUuXG4gICAgb25VcGRhdGVkR3JvdXBpbmdFbmFibGVkKGRhdGFHcmlkOkRhdGFHcmlkLCBlbmFibGVkOmJvb2xlYW4pOnZvaWQge1xuICAgIH1cblxufVxuXG5cbiJdfQ==