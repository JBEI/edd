// Compiled to JS on: Mon Feb 01 2016 16:13:47  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGF0YUdyaWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJEYXRhR3JpZC50cyJdLCJuYW1lcyI6WyJEYXRhR3JpZCIsIkRhdGFHcmlkLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWQuX2luaXRpYWxpemVUYWJsZURhdGEiLCJEYXRhR3JpZC5faW5pdGlhbGl6ZVNvcnQiLCJEYXRhR3JpZC50cmlnZ2VyRGF0YVJlc2V0IiwiRGF0YUdyaWQudHJpZ2dlclBhcnRpYWxEYXRhUmVzZXQiLCJEYXRhR3JpZC5yZWNvbnN0cnVjdFNpbmdsZVJlY29yZCIsIkRhdGFHcmlkLl9jcmVhdGVPcHRpb25zTWVudSIsIkRhdGFHcmlkLl9jcmVhdGVIZWFkZXJXaWRnZXRzIiwiRGF0YUdyaWQucHJlcGFyZUNvbHVtblZpc2liaWxpdHkiLCJEYXRhR3JpZC5fYXBwbHlDb2x1bW5WaXNpYmlsaXR5IiwiRGF0YUdyaWQuX2FwcGx5Q29sdW1uVmlzaWJpbGl0eVRvT25lUmVjb3JkIiwiRGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzIiwiRGF0YUdyaWQuYXBwbHlTb3J0SW5kaWNhdG9ycyIsIkRhdGFHcmlkLmFycmFuZ2VUYWJsZURhdGFSb3dzIiwiRGF0YUdyaWQuYXBwbHlBbGxXaWRnZXRGaWx0ZXJpbmciLCJEYXRhR3JpZC5nZXRTcGVjIiwiRGF0YUdyaWQuY291bnRUb3RhbENvbHVtbnMiLCJEYXRhR3JpZC5fYnVpbGRBbGxUYWJsZVNvcnRlcnMiLCJEYXRhR3JpZC5idWlsZFRhYmxlU29ydGVyIiwiRGF0YUdyaWQuX2J1aWxkVGFibGVTb3J0U2VxdWVuY2VzIiwiRGF0YUdyaWQuX2dldFNlcXVlbmNlIiwiRGF0YUdyaWQuX2J1aWxkVGFibGVIZWFkZXJzIiwiRGF0YUdyaWQuX2FsbG9jYXRlVGFibGVSb3dSZWNvcmRzIiwiRGF0YUdyaWQuX2J1aWxkUm93R3JvdXBUaXRsZVJvd3MiLCJEYXRhR3JpZC5fcHJlcGFyZVNvcnRhYmxlIiwiRGF0YUdyaWQuX3Nob3dPcHRNZW51IiwiRGF0YUdyaWQuX2hpZGVPcHRNZW51IiwiRGF0YUdyaWQuX2NvbGxhcHNlUm93R3JvdXAiLCJEYXRhR3JpZC5fZXhwYW5kUm93R3JvdXAiLCJEYXRhR3JpZC50dXJuT25Sb3dHcm91cGluZyIsIkRhdGFHcmlkLnR1cm5PZmZSb3dHcm91cGluZyIsIkRhdGFHcmlkLmNsaWNrZWRPcHRpb25XaWRnZXQiLCJEYXRhR3JpZC5jbGlja2VkSGVhZGVyV2lkZ2V0IiwiRGF0YUdyaWQuX2NsaWNrZWRDb2xWaXNpYmlsaXR5Q29udHJvbCIsIkRhdGFHcmlkLnNob3dDb2x1bW4iLCJEYXRhR3JpZC5oaWRlQ29sdW1uIiwiRGF0YUdyaWQuX2Jhc2VQYXlsb2FkIiwiRGF0YUdyaWQuX2NvbHVtblNldHRpbmdzS2V5IiwiRGF0YUdyaWQuX2ZldGNoU2V0dGluZ3MiLCJEYXRhR3JpZC5fdXBkYXRlQ29sdW1uU2V0dGluZ3MiLCJEYXRhR3JpZC5zY2hlZHVsZVRpbWVyIiwiRGF0YUdyaWQuYXBwbHlUb1JlY29yZFNldCIsIkRhdGFHcmlkLmN1cnJlbnRTZXF1ZW5jZSIsIkRhdGFHcmlkLnNvcnRDb2xzIiwiRGF0YUdyaWRSZWNvcmRTZXQiLCJEYXRhR3JpZFJlY29yZFNldC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkUmVjb3JkIiwiRGF0YUdyaWRSZWNvcmQuY29uc3RydWN0b3IiLCJEYXRhR3JpZFJlY29yZC5yZUNyZWF0ZUVsZW1lbnRzSW5QbGFjZSIsIkRhdGFHcmlkUmVjb3JkLmNyZWF0ZUVsZW1lbnRzIiwiRGF0YUdyaWRSZWNvcmQucmVtb3ZlRWxlbWVudHMiLCJEYXRhR3JpZFJlY29yZC5kZXRhY2hFbGVtZW50cyIsIkRhdGFHcmlkUmVjb3JkLmdldERhdGFHcmlkRGF0YVJvd3MiLCJEYXRhR3JpZFJlY29yZC5nZXRFbGVtZW50cyIsIkRhdGFHcmlkUmVjb3JkLmFwcGx5U3RyaXBpbmciLCJEYXRhR3JpZERhdGFSb3ciLCJEYXRhR3JpZERhdGFSb3cuY29uc3RydWN0b3IiLCJEYXRhR3JpZERhdGFSb3cuY3JlYXRlRWxlbWVudCIsIkRhdGFHcmlkRGF0YVJvdy5yZW1vdmVFbGVtZW50IiwiRGF0YUdyaWREYXRhUm93LmRldGFjaEVsZW1lbnQiLCJEYXRhR3JpZERhdGFSb3cuZ2V0RWxlbWVudCIsIkRhdGFHcmlkRGF0YVJvdy5nZXRFbGVtZW50SlEiLCJEYXRhR3JpZERhdGFDZWxsIiwiRGF0YUdyaWREYXRhQ2VsbC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkRGF0YUNlbGwuY3JlYXRlRWxlbWVudCIsIkRhdGFHcmlkRGF0YUNlbGwuZ2V0RWxlbWVudCIsIkRhdGFHcmlkRGF0YUNlbGwuZ2V0Q2hlY2tib3hFbGVtZW50IiwiRGF0YUdyaWREYXRhQ2VsbC5oaWRlIiwiRGF0YUdyaWREYXRhQ2VsbC51bmhpZGUiLCJEYXRhR3JpZExvYWRpbmdDZWxsIiwiRGF0YUdyaWRMb2FkaW5nQ2VsbC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkV2lkZ2V0IiwiRGF0YUdyaWRXaWRnZXQuY29uc3RydWN0b3IiLCJEYXRhR3JpZFdpZGdldC5fY3JlYXRlTGFiZWwiLCJEYXRhR3JpZFdpZGdldC5fY3JlYXRlQ2hlY2tib3giLCJEYXRhR3JpZFdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCIsIkRhdGFHcmlkV2lkZ2V0LnJlZnJlc2hXaWRnZXQiLCJEYXRhR3JpZE9wdGlvbldpZGdldCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRPcHRpb25XaWRnZXQuZ2V0SURGcmFnbWVudCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmdldExhYmVsVGV4dCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0Lm9uV2lkZ2V0Q2hhbmdlIiwiRGF0YUdyaWRPcHRpb25XaWRnZXQuY3JlYXRlRWxlbWVudHMiLCJEYXRhR3JpZE9wdGlvbldpZGdldC5hcHBlbmRFbGVtZW50cyIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMiLCJEYXRhR3JpZE9wdGlvbldpZGdldC5nZXRTdGF0ZSIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LmlzRW5hYmxlZEJ5RGVmYXVsdCIsIkRhdGFHcmlkT3B0aW9uV2lkZ2V0LnNldFN0YXRlIiwiRGF0YUdyaWRIZWFkZXJXaWRnZXQiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkSGVhZGVyV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiRGF0YUdyaWRIZWFkZXJXaWRnZXQuYXBwZW5kRWxlbWVudHMiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5jcmVhdGVkRWxlbWVudHMiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUiLCJEYXRhR3JpZEhlYWRlcldpZGdldC5hcHBseUZpbHRlclRvSURzIiwiREdTZWxlY3RBbGxXaWRnZXQiLCJER1NlbGVjdEFsbFdpZGdldC5jb25zdHJ1Y3RvciIsIkRHU2VsZWN0QWxsV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdTZWxlY3RBbGxXaWRnZXQuY2xpY2tIYW5kbGVyIiwiREdTZWFyY2hXaWRnZXQiLCJER1NlYXJjaFdpZGdldC5jb25zdHJ1Y3RvciIsIkRHU2VhcmNoV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdTZWFyY2hXaWRnZXQuaW5wdXRLZXlEb3duSGFuZGxlciIsIkRHU2VhcmNoV2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMiLCJEYXRhR3JpZFNvcnQiLCJEYXRhR3JpZFNvcnQuY29uc3RydWN0b3IiLCJER1BhZ2luZ1dpZGdldCIsIkRHUGFnaW5nV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdQYWdpbmdXaWRnZXQuYXBwZW5kRWxlbWVudHMiLCJER1BhZ2luZ1dpZGdldC5yZWZyZXNoV2lkZ2V0IiwiRGF0YUdyaWRUYWJsZVNwZWMiLCJEYXRhR3JpZFRhYmxlU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkSGVhZGVyU3BlYyIsIkRhdGFHcmlkSGVhZGVyU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkQ29sdW1uU3BlYyIsIkRhdGFHcmlkQ29sdW1uU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkQ29sdW1uU3BlYy5nZW5lcmF0ZUNlbGxzIiwiRGF0YUdyaWRDb2x1bW5TcGVjLmNsZWFySW5kZXhBdElEIiwiRGF0YUdyaWRDb2x1bW5TcGVjLmNlbGxJbmRleEF0SUQiLCJEYXRhR3JpZENvbHVtblNwZWMuZ2V0RW50aXJlSW5kZXgiLCJEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyIsIkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRSb3dHcm91cFNwZWMiLCJEYXRhR3JpZFJvd0dyb3VwU3BlYy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkU3BlY0Jhc2UiLCJEYXRhR3JpZFNwZWNCYXNlLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRTcGVjQmFzZS5kZWZpbmVUYWJsZVNwZWMiLCJEYXRhR3JpZFNwZWNCYXNlLmRlZmluZUhlYWRlclNwZWMiLCJEYXRhR3JpZFNwZWNCYXNlLmRlZmluZUNvbHVtblNwZWMiLCJEYXRhR3JpZFNwZWNCYXNlLmRlZmluZUNvbHVtbkdyb3VwU3BlYyIsIkRhdGFHcmlkU3BlY0Jhc2UuZGVmaW5lUm93R3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjQmFzZS5lbmFibGVTb3J0IiwiRGF0YUdyaWRTcGVjQmFzZS5jbGlja2VkU29ydCIsIkRhdGFHcmlkU3BlY0Jhc2UuZ2V0Um93R3JvdXBNZW1iZXJzaGlwIiwiRGF0YUdyaWRTcGVjQmFzZS5nZXRUYWJsZUVsZW1lbnQiLCJEYXRhR3JpZFNwZWNCYXNlLmdldFJlY29yZElEcyIsIkRhdGFHcmlkU3BlY0Jhc2UuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY0Jhc2UuY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMiLCJEYXRhR3JpZFNwZWNCYXNlLm9uSW5pdGlhbGl6ZWQiLCJEYXRhR3JpZFNwZWNCYXNlLm9uRGF0YVJlc2V0IiwiRGF0YUdyaWRTcGVjQmFzZS5vblBhcnRpYWxEYXRhUmVzZXQiLCJEYXRhR3JpZFNwZWNCYXNlLm9uUm93VmlzaWJpbGl0eUNoYW5nZWQiLCJEYXRhR3JpZFNwZWNCYXNlLmdlbmVyYXRlR3JvdXBOYW1lIiwiRGF0YUdyaWRTcGVjQmFzZS5vblVwZGF0ZWRHcm91cGluZ0VuYWJsZWQiXSwibWFwcGluZ3MiOiJBQUFBLGdEQUFnRDtBQUNoRCxxREFBcUQ7QUFDckQsK0JBQStCO0FBQy9CLHFDQUFxQzs7Ozs7O0FBRXJDLEVBQUU7QUFDRixtRkFBbUY7QUFDbkYsaUVBQWlFO0FBQ2pFLEVBQUU7QUFFRjtJQTRCSUEseURBQXlEQTtJQUN6REEsNkZBQTZGQTtJQUM3RkEsa0JBQVlBLFlBQTZCQTtRQTlCN0NDLGlCQTQ3QkNBO1FBdDZCV0EscUJBQWdCQSxHQUFXQSxLQUFLQSxDQUFDQSxDQUFJQSwrQkFBK0JBO1FBQ3BFQSxVQUFLQSxHQUFrQkEsRUFBRUEsQ0FBQ0E7UUFDMUJBLGNBQVNBLEdBQWdDQSxFQUFFQSxDQUFDQTtRQVFoREEsMEVBQTBFQTtRQUMxRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsRUFDeEJBLHVFQUF1RUEsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLFNBQVNBO1lBQzVEQSxZQUFZQSxDQUFDQSxlQUFlQSxJQUFJQSxZQUFZQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUNqRUEsb0VBQW9FQSxDQUFDQSxDQUFDQTtRQUUxRUEsRUFBRUE7UUFDRkEsK0JBQStCQTtRQUMvQkEsRUFBRUE7UUFFRkEsMERBQTBEQTtRQUMxREEsdUVBQXVFQTtRQUN2RUEsZ0RBQWdEQTtRQUNoREEsbUVBQW1FQTtRQUNuRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsWUFBWUEsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLFlBQVlBLENBQUNBLFlBQVlBLENBQUNBO1FBQ3hDQSxJQUFJ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Z0JBQy9CQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxPQUFPQTthQUM1QkEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLElBQUlBLEdBQVVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO2dCQUMxQ0EsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0EsRUFBRUE7Z0JBQ2ZBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBO2dCQUMxREEsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsU0FBU0E7Z0JBQzFEQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxHQUFHQSxTQUFTQSxHQUFHQSxTQUFTQTthQUN2REEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNoQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDaENBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxD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QUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDNUNBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFN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LEVBQUVBLE9BQU9BLEVBQUVBLE1BQU1BLEVBQUVBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUdBLDBCQUEwQkE7UUFDaEhBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3hCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzVCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDeEJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLFFB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Z0dBQWdHQTtJQUNoR0EsZ0dBQWdHQTtJQUNoR0EsMEVBQTBFQTtJQUMxRUEsNkNBQWtCQSxHQUFsQkEsVUFBbUJBLFFBQWlCQSxFQUFFQSxPQUFnQkE7UUFDbERnQixNQUFNQSxDQUFDQSxDQUFJQSx5QkFBeUJBO0lBQ3hDQSxDQUFDQTtJQUdEaEIsNENBQTRDQTtJQUM1Q0EsaURBQXNCQSxHQUF0QkE7SUFFQWlCLENBQUNBO0lBRURqQiw2RUFBNkVBO0lBQzdFQSw0Q0FBNENBO0lBQzVDQSw0Q0FBaUJBLEdBQWpCQSxVQUFrQkEsUUFBaUJBLEVBQUVBLE9BQWNBO1FBQy9Da0IsTUFBTUEsQ0FBQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0E7SUFDOUJBLENBQUNBO0lBRURsQiwrREFBK0RBO0lBQy9EQSw2Q0FBNkNBO0lBQzdDQSxtREFBd0JBLEdBQXhCQSxVQUF5QkEsUUFBaUJBLEVBQUVBLE9BQWVBO0lBQzNEbUIsQ0FBQ0E7SUFFTG5CLHVCQUFDQTtBQUFEQSxDQUFDQSxBQTFLRCxJQTBLQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBNb24gRmViIDAxIDIwMTYgMTY6MTM6NDcgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cblxuLy9cbi8vIFRoaXMgaXMgYSByZS1pbXBsZW1lbnRhdGlvbiBvZiBEYXRhR3JpZFNlcnZlclNpZGUgZm9yIHdob2xseSBjbGllbnQtc2lkZSB0YWJsZXMuXG4vLyBFdmVudHVhbGx5IERhdGFHcmlkU2VydmVyU2lkZSBzaG91bGQgYmUgcGhhc2VkIG91dCBjb21wbGV0ZWx5LlxuLy9cblxuY2xhc3MgRGF0YUdyaWQge1xuXG4gICAgLy8gTWVtYmVyIHZhcmlhYmxlcy5cbiAgICBwcml2YXRlIF9zcGVjOkRhdGFHcmlkU3BlY0Jhc2U7XG5cbiAgICBwcml2YXRlIF90YWJsZTpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIF90YWJsZUJvZHk6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfdGFibGVIZWFkZXJDZWxsOkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgX3dhaXRCYWRnZTpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIHRhYmxlVGl0bGVTcGFuOkhUTUxFbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBfaGVhZGVyUm93czpIVE1MRWxlbWVudFtdO1xuICAgIHByaXZhdGUgX3RvdGFsQ29sdW1uQ291bnQ6bnVtYmVyO1xuICAgIHByaXZhdGUgX3JlY29yZEVsZW1lbnRzOkRhdGFHcmlkUmVjb3JkU2V0O1xuXG4gICAgcHJpdmF0ZSBfaGVhZGVyV2lkZ2V0czpEYXRhR3JpZEhlYWRlcldpZGdldFtdO1xuICAgIHByaXZhdGUgX29wdGlvbnNNZW51V2lkZ2V0czpEYXRhR3JpZE9wdGlvbldpZGdldFtdO1xuICAgIHByaXZhdGUgX29wdGlvbnNNZW51RWxlbWVudDpIVE1MRWxlbWVudDtcblxuICAgIHByaXZhdGUgX29wdGlvbnNNZW51QmxvY2tFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgX29wdGlvbnNMYWJlbDpIVE1MRWxlbWVudDtcblxuICAgIHByaXZhdGUgX2dyb3VwaW5nRW5hYmxlZDpib29sZWFuID0gZmFsc2U7ICAgIC8vIGdyb3VwaW5nIG1vZGUgb2ZmIGJ5IGRlZmF1bHRcbiAgICBwcml2YXRlIF9zb3J0OkRhdGFHcmlkU29ydFtdID0gW107XG4gICAgcHJpdmF0ZSBfc2VxdWVuY2U6eyBbaW5kZXg6bnVtYmVyXTogc3RyaW5nW10gfSA9IHt9O1xuXG4gICAgcHJpdmF0ZSBfdGltZXJzOntbaW5kZXg6c3RyaW5nXTpudW1iZXJ9O1xuXG4gICAgLy8gVGhpcyBiaW5kcyBhIHRhYmxlIGVsZW1lbnQgdG8gYW4gaW5zdGFuY2Ugb2YgRGF0YUdyaWQuXG4gICAgLy8gVGhlIHByZXZpb3VzIGNvbnRlbnRzIG9mIHRoZSB0YWJsZSwgaWYgYW55LCBhcmUgZGVsZXRlZCwgYW5kIERhdGFHcmlkIHRha2VzIG92ZXIgdGhlIHRhYmxlXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcblxuICAgICAgICAvLyBVc2UgISEgZG91YmxlLW5vdCBvcGVyYXRvciB0byBjb2VyY2UgdHJ1dGgteS9mYWxzZS15IHZhbHVlcyB0byBib29sZWFuc1xuICAgICAgICBVdGwuSlMuYXNzZXJ0KCEhZGF0YUdyaWRTcGVjLFxuICAgICAgICAgICAgXCJEYXRhR3JpZCBuZWVkcyB0byBiZSBzdXBwbGllZCB3aXRoIGEgRGF0YUdyaWRTcGVjQmFzZS1kZXJpdmVkIG9iamVjdC5cIik7XG4gICAgICAgIFV0bC5KUy5hc3NlcnQoISEoZGF0YUdyaWRTcGVjLnRhYmxlRWxlbWVudCAmJiBkYXRhR3JpZFNwZWMudGFibGVTcGVjICYmXG4gICAgICAgICAgICAgICAgZGF0YUdyaWRTcGVjLnRhYmxlSGVhZGVyU3BlYyAmJiBkYXRhR3JpZFNwZWMudGFibGVDb2x1bW5TcGVjKSxcbiAgICAgICAgICAgIFwiRGF0YUdyaWRTcGVjQmFzZS1kZXJpdmVkIG9iamVjdCBkb2VzIG5vdCBoYXZlIGVub3VnaCB0byB3b3JrIHdpdGguXCIpO1xuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIE1lbWJlciB2YXJpYWJsZSBkZWNsYXJhdGlvbnNcbiAgICAgICAgLy9cblxuICAgICAgICAvLyBXZSBuZWVkIGEgRGF0YUdyaWRTcGVjQmFzZS1kZXJpdmVkIHRhYmxlIHNwZWNpZmljYXRpb24uXG4gICAgICAgIC8vIChUaGlzIG9iamVjdCBkZXNjcmliZXMgdGhlIHRhYmxlIGFuZCBpbXBsZW1lbnRzIGN1c3RvbSBmdW5jdGlvbmFsaXR5XG4gICAgICAgIC8vIHRoYXQgYmVsb25ncyB3aXRoIHdob2V2ZXIgY3JlYXRlZCB0aGUgdGFibGUuKVxuICAgICAgICAvLyAoU2VlIHRoZSBEYXRhR3JpZFNwZWNCYXNlIGNsYXNzIHRvIHNlZSB3aGF0IGNhbiBiZSBpbXBsZW1lbnRlZC4pXG4gICAgICAgIHRoaXMuX3NwZWMgPSBkYXRhR3JpZFNwZWM7XG4gICAgICAgIHRoaXMuX3RhYmxlID0gZGF0YUdyaWRTcGVjLnRhYmxlRWxlbWVudDtcbiAgICAgICAgdGhpcy5fdGltZXJzID0ge307XG5cbiAgICAgICAgdmFyIHRhYmxlQm9keTpKUXVlcnkgPSAkKHRoaXMuX3RhYmxlQm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0Ym9keVwiKSk7XG5cbiAgICAgICAgLy8gRmlyc3Qgc3RlcDogQmxvdyBhd2F5IHRoZSBvbGQgY29udGVudHMgb2YgdGhlIHRhYmxlXG4gICAgICAgICQodGhpcy5fdGFibGUpLmVtcHR5KClcbiAgICAgICAgICAgIC5hdHRyKHsgJ2NlbGxwYWRkaW5nJzogMCwgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgLy8gVE9ETzogTW9zdCBvZiB0aGVzZSBjbGFzc2VzIGFyZSBwcm9iYWJseSBub3QgbmVlZGVkIG5vd1xuICAgICAgICAgICAgLmFkZENsYXNzKCdkYXRhVGFibGUgc29ydGFibGUgZHJhZ2JveGVzIGhhc3RhYmxlY29udHJvbHMnKVxuICAgICAgICAgICAgLmFwcGVuZCh0YWJsZUJvZHkpO1xuXG4gICAgICAgIHZhciB0YWJsZUhlYWRlclJvdyA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRyXCIpKS5hZGRDbGFzcygnaGVhZGVyJyk7XG4gICAgICAgIHZhciB0YWJsZUhlYWRlckNlbGwgPSAkKHRoaXMuX3RhYmxlSGVhZGVyQ2VsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0aFwiKSlcbiAgICAgICAgICAgIC5hcHBlbmRUbyh0YWJsZUhlYWRlclJvdyk7XG4gICAgICAgIGlmIChkYXRhR3JpZFNwZWMudGFibGVTcGVjLm5hbWUpIHtcbiAgICAgICAgICAgICQodGhpcy50YWJsZVRpdGxlU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpKS50ZXh0KGRhdGFHcmlkU3BlYy50YWJsZVNwZWMubmFtZSkuYXBwZW5kVG8odGFibGVIZWFkZXJDZWxsKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgd2FpdEJhZGdlID0gJCh0aGlzLl93YWl0QmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKSlcbiAgICAgICAgICAgIC5hZGRDbGFzcygnd2FpdGJhZGdlIHdhaXQnKS5hcHBlbmRUbyh0YWJsZUhlYWRlckNlbGwpO1xuICAgICAgICBpZiAoKHRoaXMuX3RvdGFsQ29sdW1uQ291bnQgPSB0aGlzLmNvdW50VG90YWxDb2x1bW5zKCkpID4gMSkge1xuICAgICAgICAgICAgdGFibGVIZWFkZXJDZWxsLmF0dHIoJ2NvbHNwYW4nLCB0aGlzLl90b3RhbENvbHVtbkNvdW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlJ3JlIGFza2VkIHRvIHNob3cgdGhlIGhlYWRlciwgdGhlbiBhZGQgaXQgdG8gdGhlIHRhYmxlLiAgT3RoZXJ3aXNlIHdlIHdpbGwgbGVhdmUgaXQgb2ZmLlxuICAgICAgICBpZiAoZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5zaG93SGVhZGVyKSB7XG4gICAgICAgICAgICB0YWJsZUJvZHkuYXBwZW5kKHRhYmxlSGVhZGVyUm93KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFwcGx5IHRoZSBkZWZhdWx0IGNvbHVtbiB2aXNpYmlsaXR5IHNldHRpbmdzLlxuICAgICAgICB0aGlzLnByZXBhcmVDb2x1bW5WaXNpYmlsaXR5KCk7XG5cbiAgICAgICAgdmFyIGhlYWRlclJvd3MgPSB0aGlzLl9oZWFkZXJSb3dzID0gdGhpcy5fYnVpbGRUYWJsZUhlYWRlcnMoKTtcbiAgICAgICAgdGhpcy5faGVhZGVyUm93cy5mb3JFYWNoKCh2KSA9PiB0YWJsZUJvZHkuYXBwZW5kKHYpKTtcblxuICAgICAgICBzZXRUaW1lb3V0KCAoKSA9PiB0aGlzLl9pbml0aWFsaXplVGFibGVEYXRhKCksIDEgKTtcbiAgICB9XG5cblxuICAgIC8vIEJyZWFraW5nIHVwIHRoZSBpbml0aWFsIHRhYmxlIGNyZWF0aW9uIGludG8gdHdvIHN0YWdlcyBhbGxvd3MgdGhlIGJyb3dzZXIgdG8gcmVuZGVyIGEgcHJlbGltaW5hcnlcbiAgICAvLyB2ZXJzaW9uIG9mIHRoZSB0YWJsZSB3aXRoIGEgaGVhZGVyIGJ1dCBubyBkYXRhIHJvd3MsIHRoZW4gY29udGludWUgbG9hZGluZyBvdGhlciBhc3NldHMgaW4gcGFyYWxsZWwuXG4gICAgLy8gSXQgYWN0dWFsbHkgc3BlZWRzIHVwIHRoZSBlbnRpcmUgdGFibGUgY3JlYXRpb24gYXMgd2VsbCwgZm9yIHJlYXNvbnMgdGhhdCBhcmUgbm90IHZlcnkgY2xlYXIuXG4gICAgLy8gKElmIHRoZSBzZXR1cCBpcyBOT1QgcnVuIGluIHR3byBzdGFnZXMsIGFsbCB0aGUgJ2NyZWF0ZUVsZW1lbnQnIGNhbGxzIGZvciB0aGUgZGF0YSBjZWxscyB0YWtlIG11Y2ggbG9uZ2VyLFxuICAgIC8vIGluIEZpcmVmb3ggYW5kIFNhZmFyaSwgYWNjb3JkaW5nIHRvIGxvYWQtdGltZSBwcm9maWxpbmcgLi4uIGFuZCBvbmx5IHdoZW4gcGFpcmVkIHdpdGggc29tZSBzZXJ2ZXJzPz8pXG4gICAgX2luaXRpYWxpemVUYWJsZURhdGEoKTpEYXRhR3JpZCB7XG5cbiAgICAgICAgdmFyIGhDZWxsID0gdGhpcy5fdGFibGVIZWFkZXJDZWxsO1xuXG4gICAgICAgIERyYWdib3hlcy5pbml0VGFibGUodGhpcy5fdGFibGUpO1xuICAgICAgICB0aGlzLl9idWlsZEFsbFRhYmxlU29ydGVycygpXG4gICAgICAgICAgICAuX2J1aWxkVGFibGVTb3J0U2VxdWVuY2VzKClcbiAgICAgICAgICAgIC5fYWxsb2NhdGVUYWJsZVJvd1JlY29yZHMoKVxuICAgICAgICAgICAgLl9idWlsZFJvd0dyb3VwVGl0bGVSb3dzKClcbiAgICAgICAgICAgIC5fY3JlYXRlT3B0aW9uc01lbnUoKVxuICAgICAgICAgICAgLl9jcmVhdGVIZWFkZXJXaWRnZXRzKCk7XG5cbiAgICAgICAgLy8gRmlyc3QsIGFwcGVuZCB0aGUgaGVhZGVyIHdpZGdldHMgdGhhdCBzaG91bGQgdG8gYXBwZWFyIFwiYWZ0ZXJcIiB0aGUgcHVsbGRvd24uXG4gICAgICAgIC8vIChTaW5jZSBhbGwgd2lkZ2V0cyBhcmUgc3R5bGVkIHRvIGZsb2F0IHJpZ2h0LCB0aGV5IHdpbGwgYXBwZWFyIGZyb20gcmlnaHQgdG8gbGVmdC4pXG4gICAgICAgIHRoaXMuX2hlYWRlcldpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF3aWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KCkpIHtcbiAgICAgICAgICAgICAgICB3aWRnZXQuYXBwZW5kRWxlbWVudHMoaENlbGwsIGluZGV4LnRvU3RyaW5nKDEwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBOb3cgYXBwZW5kIHRoZSAnVmlldycgcHVsbGRvd24gbWVudVxuICAgICAgICBoQ2VsbC5hcHBlbmRDaGlsZCh0aGlzLl9vcHRpb25zTWVudUVsZW1lbnQpO1xuICAgICAgICAvLyBGaW5hbGx5LCBhcHBlbmQgdGhlIGhlYWRlciB3aWRnZXRzIHRoYXQgc2hvdWxkIGFwcGVhciBcImJlZm9yZVwiLlxuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGlmICh3aWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KCkpIHtcbiAgICAgICAgICAgICAgICB3aWRnZXQuYXBwZW5kRWxlbWVudHMoaENlbGwsIGluZGV4LnRvU3RyaW5nKDEwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX2luaXRpYWxpemVTb3J0KCkuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKTtcblxuICAgICAgICAvLyBOb3cgdGhhdCB3ZSd2ZSBjb25zdHJ1Y3RlZCBvdXIgZWxlbWVudHMsIGFwcGx5IHZpc2liaWxpdHkgc3R5bGluZyB0byB0aGVtLlxuICAgICAgICB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHkoKTtcblxuICAgICAgICAvLyBQcmVwYXJlIHRoZSB0YWJsZSBmb3Igc29ydGluZ1xuICAgICAgICAgICB0aGlzLl9wcmVwYXJlU29ydGFibGUoKTtcblxuICAgICAgICB0aGlzLl9zcGVjLm9uSW5pdGlhbGl6ZWQodGhpcyk7XG4gICAgICAgICQodGhpcy5fd2FpdEJhZGdlKS5hZGRDbGFzcygnb2ZmJyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBfaW5pdGlhbGl6ZVNvcnQoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBkZWZhdWx0U29ydCA9IHRoaXMuX3NwZWMudGFibGVTcGVjLmRlZmF1bHRTb3J0IHx8IDA7XG4gICAgICAgIHRoaXMuX3NvcnQgPSBbIHsgJ3NwZWMnOiB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlY1tkZWZhdWx0U29ydF0sICdhc2MnOiB0cnVlIH0gXTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBOb3RpZnkgdGhlIERhdGFHcmlkIHRoYXQgaXRzIHVuZGVybHlpbmcgZGF0YSBoYXMgcmVzZXRcbiAgICB0cmlnZ2VyRGF0YVJlc2V0KCk6RGF0YUdyaWQge1xuICAgICAgICAvLyBXZSBoYXZlIG5ldyBkYXRhIHRvIGRpc3BsYXkuIENsZWFyIG91dCBvbGQgcm93cy5cbiAgICAgICAgJC5lYWNoKHRoaXMuX3JlY29yZEVsZW1lbnRzLCAoaW5kZXg6bnVtYmVyLCB2YWx1ZTpEYXRhR3JpZFJlY29yZCkgPT4ge1xuICAgICAgICAgICAgdmFsdWUucmVtb3ZlRWxlbWVudHMoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX3NwZWMub25EYXRhUmVzZXQodGhpcyk7XG4gICAgICAgIC8vIFJlYnVpbGQgcm93cy5cbiAgICAgICAgdGhpcy5fYnVpbGRUYWJsZVNvcnRTZXF1ZW5jZXMoKS5fYWxsb2NhdGVUYWJsZVJvd1JlY29yZHMoKVxuICAgICAgICAvLyBBbmQgdGhlbiBhcnJhbmdlIHRoZSByb3dzXG4gICAgICAgICAgICAuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKTtcblxuICAgICAgICAvLyBDYWxsIHRoZSBzdXBwb3J0IGZ1bmN0aW9uIGluIGVhY2ggd2lkZ2V0LCB0byBhcHBseSBzdHlsaW5nIHRvIGFsbCB0aGUgZGF0YSByb3dzIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX3NwZWMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB3aWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQodGhpcy5fcmVjb3JkRWxlbWVudHNbaWRdLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgaWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFuZCBtYWtlIHN1cmUgb25seSB0aGUgY3VycmVudGx5IHZpc2libGUgdGhpbmdzIGFyZSAuLi4gdmlzaWJsZVxuICAgICAgICB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHkoKTtcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB3aWRnZXQucmVmcmVzaFdpZGdldCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHdpZGdldC5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIFVwZGF0ZSBvbmx5IHRoZSB0YWJsZSByb3dzIGZvciB0aGUgc3BlY2lmaWVkIHJlY29yZHMuXG4gICAgLy8gRm9yIHVzZSBpbiBzaXR1YXRpb25zIHdoZXJlIHlvdSB3YW50IHRvIGFkZCByb3dzLCBvciByZWJ1aWxkIGV4aXN0aW5nIHJvd3MsXG4gICAgLy8gYW5kIGxlYXZlIHRoZSByZXN0IHVuY2hhbmdlZC5cbiAgICB0cmlnZ2VyUGFydGlhbERhdGFSZXNldChyZWNvcmRJRHM6c3RyaW5nW10sIHJlZmxvdzpib29sZWFuKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3NwZWMub25QYXJ0aWFsRGF0YVJlc2V0KHRoaXMsIHJlY29yZElEcyk7XG4gICAgICAgIC8vIFJlYnVpbGQgcm93cy5cbiAgICAgICAgcmVjb3JkSURzLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnJlY29uc3RydWN0U2luZ2xlUmVjb3JkKGlkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlZmxvdykge1xuICAgICAgICAgICAgdGhpcy5fYnVpbGRUYWJsZVNvcnRTZXF1ZW5jZXMoKS5hcnJhbmdlVGFibGVEYXRhUm93cygpO1xuXG4gICAgICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICB3aWRnZXQucmVmcmVzaFdpZGdldCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIEluc3RydWN0IERhdGFHcmlkIHRvIHJlY3JlYXRlL3JlZnJlc2ggZXZlcnl0aGluZyByZWxhdGVkIHRvIGEgc2luZ2xlIHJlY29yZCBJRC5cbiAgICAvLyBUaGlzIGluY2x1ZGVzIHJlbW92aW5nIGl0cyB0YWJsZSByb3dzLCByZWNvbnN0cnVjdGluZyB0aGVtLCByZWZvcm1hdHRpbmcgdGhlbSwgYW5kXG4gICAgLy8gcmUtYWRkaW5nIHRoZSByb3dzIGluIHRoZSBzYW1lIHBsYWNlIGFzIHRoZSBvbGQsIGJ1dCBkb2VzIE5PVCByZWJ1aWxkIHRoZSBzb3J0IHNlcXVlbmNlcy5cbiAgICAvLyAgIE5PVEU6XG4gICAgLy8gSXQncyBxdWl0ZSBwb3NzaWJsZSB0aGF0IGNoYW5nZXMgdG8gdGhlIGFwcGVhcmFuY2Ugd2lsbCBhbHRlciB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgcm93cyBpblxuICAgIC8vIGNvbXBsaWNhdGVkIHdheXMuICBGb3IgZXhhbXBsZSwgdGhlIGdlbmVyaWMgc2VhcmNoIHdpZGdldCBsb2dpYyBtYXkgZGVjaWRlIHRvIGhpZGUgYSBwcmV2aW91c2x5IHNob3duXG4gICAgLy8gcm93IG9yIHZpY2UtdmVyc2EsIGNvcnJ1cHRpbmcgcm93IHN0cmlwaW5nLiAgRG8gbm90IGRlbGF5IHRoZSByZWZsb3cgZm9yIHRvbyBsb25nLlxuICAgIHJlY29uc3RydWN0U2luZ2xlUmVjb3JkKHJlY29yZElEOnN0cmluZyk6RGF0YUdyaWQge1xuICAgICAgICBpZiAodGhpcy5fcmVjb3JkRWxlbWVudHNbcmVjb3JkSURdKSB7XG4gICAgICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50c1tyZWNvcmRJRF0ucmVDcmVhdGVFbGVtZW50c0luUGxhY2UoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBpZiB0aGUgcmVjb3JkIGRpZG4ndCBleGlzdCBiZWZvcmUsIGl0IHdpbGwgbm90IGFwcGVhciBpbiB0aGUgdGFibGUgbm93LFxuICAgICAgICAgICAgLy8gdW50aWwgYSBjb21wbGV0ZSByZWZsb3cgaXMgZG9uZSBieSByZWJ1aWxkaW5nIHNvcnQgc2VxdWVuY2VzIGFuZCBjYWxsaW5nIGFycmFuZ2VUYWJsZURhdGFSb3dzLlxuICAgICAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHNbcmVjb3JkSURdID0gbmV3IERhdGFHcmlkUmVjb3JkKHRoaXMuX3NwZWMsIHJlY29yZElEKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkZ1JlY29yZCA9IHRoaXMuX3JlY29yZEVsZW1lbnRzW3JlY29yZElEXTtcblxuICAgICAgICAvLyBDYWxsIHRoZSBzdXBwb3J0IGZ1bmN0aW9uIGluIGVhY2ggd2lkZ2V0LCB0byBhcHBseSBzdHlsaW5nIHRvIGFsbCB0aGUgZGF0YSByb3dzIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRnUmVjb3JkLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgcmVjb3JkSUQpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9oZWFkZXJXaWRnZXRzLmZvckVhY2goKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgd2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRnUmVjb3JkLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgcmVjb3JkSUQpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBNYWtlIHN1cmUgb25seSB0aGUgY3VycmVudGx5IHZpc2libGUgdGhpbmdzIGFyZSAuLi4gdmlzaWJsZVxuICAgICAgICB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHlUb09uZVJlY29yZChyZWNvcmRJRCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfY3JlYXRlT3B0aW9uc01lbnUoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBtYWluSUQgPSB0aGlzLl9zcGVjLnRhYmxlU3BlYy5pZDtcblxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbWFzdGVyIGxpc3Qgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzIGJ5IGNhbGxpbmcgdGhlIGluaXRpYWxpemF0aW9uIHJvdXRpbmUgaW4gdGhlIHNwZWNcbiAgICAgICAgdGhpcy5fb3B0aW9uc01lbnVXaWRnZXRzID0gdGhpcy5fc3BlYy5jcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyh0aGlzKTtcbiAgICAgICAgdmFyIGhhc0N1c3RvbVdpZGdldHM6Ym9vbGVhbiA9IHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5sZW5ndGggPiAwO1xuXG4gICAgICAgIC8vIENoZWNrIGluIHRoZSBjb2x1bW4gZ3JvdXBzIGFuZCBzZWUgaWYgYW55IGFyZSBoaWRlLWFibGVcbiAgICAgICAgdmFyIGhhc0NvbHVtbnNJblZpc2liaWxpdHlMaXN0OmJvb2xlYW4gPSB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjLnNvbWUoKGdyb3VwKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZ3JvdXAuc2hvd0luVmlzaWJpbGl0eUxpc3Q7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIElmIG5vbmUgb2YgdGhlIGdyb3VwcyBhcmUgYWxsb3dlZCB0byBiZSBoaWRkZW4sIGFuZCB3ZSBkb24ndCBoYXZlIGFueSBjdXN0b20gb3B0aW9uIHdpZGdldHMsXG4gICAgICAgIC8vIGRvbid0IGJvdGhlciBjcmVhdGluZyB0aGUgY29sdW1uIHZpc2liaWxpdHkgbWVudVxuICAgICAgICBpZiAoIWhhc0NvbHVtbnNJblZpc2liaWxpdHlMaXN0ICYmICFoYXNDdXN0b21XaWRnZXRzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBoYXZlIGN1c3RvbSB3aWRnZXRzLCB3ZSBuZWVkIHRvIGNhbGwgdGhlaXIgc3VwcG9ydCBmdW5jdGlvbnMgdGhhdCBhcHBseSBzdHlsaW5nXG4gICAgICAgIC8vIHRvIGFsbCB0aGUgZGF0YSByb3dzIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgaWYgKGhhc0N1c3RvbVdpZGdldHMpIHtcbiAgICAgICAgICAgIHRoaXMuX29wdGlvbnNNZW51V2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYWluU3BhbiA9ICQodGhpcy5fb3B0aW9uc01lbnVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIikpXG4gICAgICAgICAgICAuYXR0cignaWQnLCBtYWluSUQgKyAnQ29sdW1uQ2hvb3NlcicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnUnKTtcblxuICAgICAgICB2YXIgbWVudUxhYmVsID0gJCh0aGlzLl9vcHRpb25zTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpKVxuICAgICAgICAgICAgLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpXG4gICAgICAgICAgICAudGV4dCgnVmlld1xcdTI1QkUnKVxuICAgICAgICAgICAgLmNsaWNrKCgpID0+IHsgaWYgKG1lbnVMYWJlbC5oYXNDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKSkgdGhpcy5fc2hvd09wdE1lbnUoKTsgfSlcbiAgICAgICAgICAgIC5hcHBlbmRUbyhtYWluU3Bhbik7XG5cbiAgICAgICAgdmFyIG1lbnVCbG9jayA9ICQodGhpcy5fb3B0aW9uc01lbnVCbG9ja0VsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpKVxuICAgICAgICAgICAgLmFkZENsYXNzKCdwdWxsZG93bk1lbnVNZW51QmxvY2sgb2ZmJylcbiAgICAgICAgICAgIC5hcHBlbmRUbyhtYWluU3Bhbik7XG5cbiAgICAgICAgLy8gZXZlbnQgaGFuZGxlcnMgdG8gaGlkZSBtZW51IGlmIGNsaWNraW5nIG91dHNpZGUgbWVudSBibG9jayBvciBwcmVzc2luZyBFU0NcbiAgICAgICAgJChkb2N1bWVudCkuY2xpY2soKGV2KSA9PiB7XG4gICAgICAgICAgICB2YXIgdCA9ICQoZXYudGFyZ2V0KTtcbiAgICAgICAgICAgIGlmICh0LmNsb3Nlc3QodGhpcy5fb3B0aW9uc01lbnVFbGVtZW50KS5zaXplKCkgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9oaWRlT3B0TWVudSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KS5rZXlkb3duKChldikgPT4ge1xuICAgICAgICAgICAgaWYgKGV2LmtleUNvZGUgPT09IDI3KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5faGlkZU9wdE1lbnUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cblxuICAgICAgICBpZiAoaGFzQ3VzdG9tV2lkZ2V0cykge1xuICAgICAgICAgICAgdmFyIG1lbnVDV0xpc3QgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKSkuYXBwZW5kVG8obWVudUJsb2NrKTtcbiAgICAgICAgICAgIGlmIChoYXNDb2x1bW5zSW5WaXNpYmlsaXR5TGlzdCkge1xuICAgICAgICAgICAgICAgIG1lbnVDV0xpc3QuYWRkQ2xhc3MoJ3dpdGhEaXZpZGVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0LCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5hcHBlbmRFbGVtZW50cygkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKSkuYXBwZW5kVG8obWVudUNXTGlzdClbMF0sIGluZGV4LnRvU3RyaW5nKDEwKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNDb2x1bW5zSW5WaXNpYmlsaXR5TGlzdCkge1xuICAgICAgICAgICAgdmFyIG1lbnVDb2xMaXN0ID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIikpLmFwcGVuZFRvKG1lbnVCbG9jayk7XG4gICAgICAgICAgICAvLyBBZGQgZWFjaCBoaWRlLWFibGUgZ3JvdXAgdG8gdGhlIG1lbnUuXG4gICAgICAgICAgICAvLyBOb3RlOiBXZSBoYXZlIHRvIHdhbGsgdGhyb3VnaCB0aGlzIGFuZXcsIGJlY2F1c2Ugd2UncmUgZ29pbmcgdG8gbWFrZSB1c2Ugb2YgdGhlIGluZGV4ICdpJy5cbiAgICAgICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWMuZm9yRWFjaCgoZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMsIGluZGV4Om51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBpdGVtLCBjaGVja2JveCwgaWQ7XG4gICAgICAgICAgICAgICAgaWYgKGdyb3VwLnNob3dJblZpc2liaWxpdHlMaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0gPSAkKCc8bGk+JykuYXBwZW5kVG8obWVudUNvbExpc3QpO1xuICAgICAgICAgICAgICAgICAgICBpZCA9IG1haW5JRCArICdDb2x1bW5DaGVjaycgKyBpbmRleDtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tib3ggPSAkKCc8aW5wdXQgdHlwZT1cImNoZWNrYm94XCI+JylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oaXRlbSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXR0cignaWQnLCBpZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZGF0YSgnY29sdW1uJywgZ3JvdXApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNsaWNrKGdyb3VwLCAoZSkgPT4gdGhpcy5fY2xpY2tlZENvbFZpc2liaWxpdHlDb250cm9sKGUpKTtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXAuY2hlY2tib3hFbGVtZW50ID0gY2hlY2tib3hbMF07XG4gICAgICAgICAgICAgICAgICAgICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCBpZCkudGV4dChncm91cC5uYW1lKS5hcHBlbmRUbyhpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFncm91cC5jdXJyZW50bHlIaWRkZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gdXBkYXRlIGNoZWNrcyBiYXNlZCBvbiBzZXR0aW5nc1xuICAgICAgICAgICAgdGhpcy5fZmV0Y2hTZXR0aW5ncyh0aGlzLl9jb2x1bW5TZXR0aW5nc0tleSgpLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIG1lbnVDb2xMaXN0LmZpbmQoJ2xpJykuZmluZCgnOmlucHV0JykuZWFjaCgoaSwgYm94KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciAkYm94ID0gJChib3gpLCBjb2wgPSAkYm94LmRhdGEoJ2NvbHVtbicpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGRhdGEuaW5kZXhPZihjb2wubmFtZSkgPT09IC0xICYmICEhY29sLmhpZGRlbkJ5RGVmYXVsdCkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhLmluZGV4T2YoJy0nICsgY29sLm5hbWUpID4gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRib3gucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaGlkZUNvbHVtbihjb2wpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgJGJveC5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3dDb2x1bW4oY29sKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgW10pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9jcmVhdGVIZWFkZXJXaWRnZXRzKCk6RGF0YUdyaWQge1xuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgbWFzdGVyIGxpc3Qgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzIGJ5IGNhbGxpbmcgdGhlIGluaXRpYWxpemF0aW9uIHJvdXRpbmUgaW4gdGhlIHNwZWNcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cyA9IHRoaXMuX3NwZWMuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyh0aGlzKTtcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgIC8vIENhbGwgdGhlIHN1cHBvcnQgZnVuY3Rpb24gaW4gZWFjaCB3aWRnZXQsIHRvIGFwcGx5IHN0eWxpbmcgdG8gYWxsIHRoZSBkYXRhIHJvd3Mgb2YgdGhlIHRhYmxlLlxuICAgICAgICAgICAgdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCh0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0uZ2V0RGF0YUdyaWREYXRhUm93cygpLCBpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gUHJlcGFyZSB0aGUgY29sdW1uIHZpc2liaWxpdHkgc3RhdGUgZm9yIHRoZSB0YWJsZS5cbiAgICAvLyBUaGlzIGZ1bmN0aW9uIHNob3VsZCBiZSBjYWxsZWQgZHVyaW5nIGluc3RhbnRpYXRpb24sIHNpbmNlIGl0IGluaXRpYWxpemVzIHRoZSBjb2x1bW4gdmlzaWJpbGl0eVxuICAgIC8vIHZhcmlhYmxlcyB0aGF0IGFyZSByZWZlcnJlZCB0byB0aHJvdWdob3V0IHRoZSByZXN0IG9mIHRoZSBEYXRhR3JpZCBjbGFzcy5cbiAgICBwcmVwYXJlQ29sdW1uVmlzaWJpbGl0eSgpIHtcbiAgICAgICAgLy8gRmlyc3QsIHJ1biB0aHJvdWdoIGEgc2VxdWVuY2Ugb2YgY2hlY2tzIHRvIHNldCB0aGUgJ2N1cnJlbnRseUhpZGRlbicgYXR0cmlidXRlIHRvIGEgcmVhc29uYWJsZSB2YWx1ZS5cbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYykgPT4ge1xuICAgICAgICAgICAgLy8gRXN0YWJsaXNoIHdoYXQgdGhlIGRlZmF1bHQgaXMsIGJlZm9yZSBjaGVja2luZyBhbnkgcGFzc2VkLWluIGNvbHVtbiBmbGFnc1xuICAgICAgICAgICAgZ3JvdXAuY3VycmVudGx5SGlkZGVuID0gISFncm91cC5oaWRkZW5CeURlZmF1bHQ7XG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgbmVjZXNzYXJ5IGFycmF5cyBhcmUgcHJlc2VudCB0byBrZWVwIHRyYWNrIG9mIGdyb3VwIG1lbWJlcnNcbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckhlYWRlcnMgPSBncm91cC5tZW1iZXJIZWFkZXJzIHx8IFtdO1xuICAgICAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucyA9IGdyb3VwLm1lbWJlckNvbHVtbnMgfHwgW107XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENvbGxlY3QgYWxsIHRoZSBoZWFkZXJzIHVuZGVyIHRoZWlyIHJlc3BlY3RpdmUgY29sdW1uIGdyb3Vwc1xuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIpID0+IHtcbiAgICAgICAgICAgIHZhciBjOm51bWJlciA9IGhlYWRlci5jb2x1bW5Hcm91cDtcbiAgICAgICAgICAgIGlmIChjICYmIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWNbYyAtIDFdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlY1tjIC0gMV0ubWVtYmVySGVhZGVycy5wdXNoKGhlYWRlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENvbGxlY3QgYWxsIHRoZSBjb2x1bW5zIChhbmQgaW4gdHVybiB0aGVpciBjZWxscykgdW5kZXIgdGhlaXIgcmVzcGVjdGl2ZSBjb2x1bW4gZ3JvdXBzXG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5TcGVjLmZvckVhY2goKGNvbCkgPT4ge1xuICAgICAgICAgICAgdmFyIGM6bnVtYmVyID0gY29sLmNvbHVtbkdyb3VwO1xuICAgICAgICAgICAgaWYgKGMgJiYgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlY1tjIC0gMV0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGVjLnRhYmxlQ29sdW1uR3JvdXBTcGVjW2MgLSAxXS5tZW1iZXJDb2x1bW5zLnB1c2goY29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBSZWFkIHRoZSBjdXJyZW50IGNvbHVtbiB2aXNpYmlsaXR5IHN0YXRlIGFuZCBhbHRlciB0aGUgc3R5bGluZyBvZiBoZWFkZXJzIGFuZCBjZWxscyB0byByZWZsZWN0IGl0XG5cbiAgICBwcml2YXRlIF9hcHBseUNvbHVtblZpc2liaWxpdHkoKTpEYXRhR3JpZCB7XG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWMuZm9yRWFjaCgoZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMpID0+IHtcbiAgICAgICAgICAgIHZhciBoaWRkZW4gPSBncm91cC5jdXJyZW50bHlIaWRkZW47XG5cbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckhlYWRlcnMuZm9yRWFjaCgoaGVhZGVyKSA9PiAkKGhlYWRlci5lbGVtZW50KS50b2dnbGVDbGFzcygnb2ZmJywgaGlkZGVuKSk7XG5cbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckNvbHVtbnMuZm9yRWFjaCgoY29sdW1uKSA9PiB7XG4gICAgICAgICAgICAgICAgY29sdW1uLmdldEVudGlyZUluZGV4KCkuZm9yRWFjaCgoYykgPT4gaGlkZGVuID8gYy5oaWRlKCkgOiBjLnVuaGlkZSgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9hcHBseUNvbHVtblZpc2liaWxpdHlUb09uZVJlY29yZChyZWNvcmRJRDpzdHJpbmcpOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUNvbHVtbkdyb3VwU3BlYy5mb3JFYWNoKChncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYykgPT4ge1xuICAgICAgICAgICAgdmFyIGhpZGRlbiA9IGdyb3VwLmN1cnJlbnRseUhpZGRlbjtcbiAgICAgICAgICAgIGdyb3VwLm1lbWJlckNvbHVtbnMuZm9yRWFjaCgoY29sdW1uKSA9PiB7XG4gICAgICAgICAgICAgICAgY29sdW1uLmNlbGxJbmRleEF0SUQocmVjb3JkSUQpLmZvckVhY2goKGMpID0+IGhpZGRlbiA/IGMuaGlkZSgpIDogYy51bmhpZGUoKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IHRoZSBsaXN0IG9mIElEcywgdGhlbiBmaWx0ZXIgaXQgZG93biB0byB3aGF0J3MgdmlzaWJsZSxcbiAgICAvLyB0aGVuIHNlYXJjaCB0aGUgdmlzaWJsZSByb3dzIGZvciBzcGVjLW1hbmRhdGVkIGNoZWNrYm94IGVsZW1lbnRzLFxuICAgIC8vIGFuZCBpZiBhIGNoZWNrYm94IGlzIGNoZWNrZWQsIHJldHVybiBpdHMgZWxlbWVudCBvbiBhbiBhcnJheS5cbiAgICBnZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTpIVE1MSW5wdXRFbGVtZW50W10ge1xuICAgICAgICB2YXIgc2VxdWVuY2U6c3RyaW5nW10gPSB0aGlzLl9nZXRTZXF1ZW5jZSh0aGlzLl9zb3J0WzBdKTtcblxuICAgICAgICAvLyBWZXJpZnkgdGhhdCB0aGUgcm93IHNldHMgcmVmZXJyZWQgdG8gYnkgdGhlIElEcyBhY3R1YWxseSBleGlzdFxuICAgICAgICB2YXIgZmlsdGVyZWRTZXF1ZW5jZSA9IHNlcXVlbmNlLmZpbHRlcigodikgPT4geyByZXR1cm4gISF0aGlzLl9yZWNvcmRFbGVtZW50c1t2XTsgfSk7XG5cbiAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZSA9IHRoaXMuYXBwbHlBbGxXaWRnZXRGaWx0ZXJpbmcoZmlsdGVyZWRTZXF1ZW5jZSk7XG5cbiAgICAgICAgdmFyIGNoZWNrZWRCb3hlczpIVE1MSW5wdXRFbGVtZW50W10gPSBbXTtcbiAgICAgICAgZmlsdGVyZWRTZXF1ZW5jZS5mb3JFYWNoKCh2KSA9PiB7XG4gICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuX3JlY29yZEVsZW1lbnRzW3ZdLmdldERhdGFHcmlkRGF0YVJvd3MoKTtcbiAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFyb3cuZGF0YUdyaWREYXRhQ2VsbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByb3cuZGF0YUdyaWREYXRhQ2VsbHMuZm9yRWFjaCgoY2VsbCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2hlY2tib3ggPSBjZWxsLmdldENoZWNrYm94RWxlbWVudCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tib3ggJiYgY2hlY2tib3guY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tlZEJveGVzLnB1c2goY2hlY2tib3gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjaGVja2VkQm94ZXM7XG4gICAgfVxuXG5cbiAgICBhcHBseVNvcnRJbmRpY2F0b3JzKCkge1xuICAgICAgICBpZiAodGhpcy5faGVhZGVyUm93cykge1xuICAgICAgICAgICAgJCh0aGlzLl9oZWFkZXJSb3dzKS5maW5kKCcuc29ydGVkdXAsIC5zb3J0ZWRkb3duJykucmVtb3ZlQ2xhc3MoJ3NvcnRlZHVwIHNvcnRlZGRvd24nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zb3J0LmZvckVhY2goKHNvcnQpID0+IHtcbiAgICAgICAgICAgICQoc29ydC5zcGVjLmVsZW1lbnQpLmFkZENsYXNzKHNvcnQuYXNjID8gJ3NvcnRlZGRvd24nIDogJ3NvcnRlZHVwJyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgYXJyYW5nZVRhYmxlRGF0YVJvd3MoKTpEYXRhR3JpZCB7XG4gICAgICAgIHZhciBzdHJpcGluZyA9IDE7XG5cbiAgICAgICAgLy8gV2UgY3JlYXRlIGEgZG9jdW1lbnQgZnJhZ21lbnQgLSBhIGtpbmQgb2YgY29udGFpbmVyIGZvciBkb2N1bWVudC1yZWxhdGVkIG9iamVjdHMgdGhhdCB3ZSBkb24ndFxuICAgICAgICAvLyB3YW50IGluIHRoZSBwYWdlIC0gYW5kIGFjY3VtdWxhdGUgaW5zaWRlIGl0IGFsbCB0aGUgcm93cyB3ZSB3YW50IHRvIGRpc3BsYXksIGluIHNvcnRlZCBvcmRlci5cbiAgICAgICAgdmFyIGZyYWcgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cbiAgICAgICAgdGhpcy5hcHBseVNvcnRJbmRpY2F0b3JzKCk7XG5cbiAgICAgICAgdmFyIHNlcXVlbmNlID0gdGhpcy5fZ2V0U2VxdWVuY2UodGhpcy5fc29ydFswXSk7XG5cbiAgICAgICAgLy8gVmVyaWZ5IHRoYXQgdGhlIHJvdyBzZXRzIHJlZmVycmVkIHRvIGJ5IHRoZSBJRHMgYWN0dWFsbHkgZXhpc3RcbiAgICAgICAgdmFyIGZpbHRlcmVkU2VxdWVuY2UgPSBzZXF1ZW5jZS5maWx0ZXIoKHYpID0+IHsgcmV0dXJuICEhdGhpcy5fcmVjb3JkRWxlbWVudHNbdl07IH0pO1xuICAgICAgICB2YXIgdW5maWx0ZXJlZFNlcXVlbmNlID0gZmlsdGVyZWRTZXF1ZW5jZS5zbGljZSgwKTtcblxuICAgICAgICAvLyBSZW1vdmUgYWxsIHRoZSBncm91cGluZyB0aXRsZSByb3dzIGZyb20gdGhlIHRhYmxlIGFzIHdlbGwsIGlmIHRoZXkgd2VyZSB0aGVyZVxuICAgICAgICB2YXIgcm93R3JvdXBTcGVjID0gdGhpcy5fc3BlYy50YWJsZVJvd0dyb3VwU3BlYztcbiAgICAgICAgcm93R3JvdXBTcGVjLmZvckVhY2goKHJvd0dyb3VwKSA9PiB7XG4gICAgICAgICAgICB2YXIgciA9IHJvd0dyb3VwLmRpc2Nsb3NlZFRpdGxlUm93O1xuICAgICAgICAgICAgaWYgKHIucGFyZW50Tm9kZSkgeyAvLyBBcyB3aXRoIHJlZ3VsYXIgcm93cywgd2UncmUgYXNzdW1pbmcgdGhlIHJvdyBpcyBhIGNoaWxkIG9ubHkgb2YgdGhpcyB0YWJsZSBib2R5LlxuICAgICAgICAgICAgICAgIHRoaXMuX3RhYmxlQm9keS5yZW1vdmVDaGlsZChyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHIgPSByb3dHcm91cC51bmRpc2Nsb3NlZFRpdGxlUm93O1xuICAgICAgICAgICAgaWYgKHIucGFyZW50Tm9kZSkgeyAvLyBBcyB3aXRoIHJlZ3VsYXIgcm93cywgd2UncmUgYXNzdW1pbmcgdGhlIHJvdyBpcyBhIGNoaWxkIG9ubHkgb2YgdGhpcyB0YWJsZSBib2R5LlxuICAgICAgICAgICAgICAgIHRoaXMuX3RhYmxlQm9keS5yZW1vdmVDaGlsZChyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFdoaWxlIHdlJ3JlIGhlcmUsIHJlc2V0IHRoZSBtZW1iZXIgcmVjb3JkIGFycmF5cy4gIFdlIG5lZWQgdG8gcmVidWlsZCB0aGVtIHBvc3QtZmlsdGVyaW5nLlxuICAgICAgICAgICAgcm93R3JvdXAubWVtYmVyUmVjb3JkcyA9IFtdO1xuICAgICAgICB9KTtcblxuICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlID0gdGhpcy5hcHBseUFsbFdpZGdldEZpbHRlcmluZyhmaWx0ZXJlZFNlcXVlbmNlKTtcblxuICAgICAgICAvLyBDYWxsIHRvIGRldGFjaCBvbmx5IHRoZSByb3dzIHRoYXQgZGlkbid0IG1ha2UgaXQgdGhyb3VnaCB0aGUgZmlsdGVyLlxuICAgICAgICAvLyBUaGUgb3RoZXJzIHdpbGwgYmUgYXV0b21hdGljYWxseSBkZXRhY2hlZCBieSBiZWluZyBtb3ZlZCB0byB0aGUgZG9jdW1lbnQgZnJhZ21lbnQuXG4gICAgICAgIHZhciBhZGRlZFJvd0lEcyA9IHt9O1xuICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICBhZGRlZFJvd0lEc1tpZF0gPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgICAgdW5maWx0ZXJlZFNlcXVlbmNlLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWFkZGVkUm93SURzW2lkXSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3JlY29yZEVsZW1lbnRzW2lkXS5kZXRhY2hFbGVtZW50cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBOb3cgd2UgcnVuIHRocm91Z2ggdGhlIHJlbWFpbmluZyBJRHMgYW5kIGFkZCB0aGVpciByb3dzIHRvIHRoZSB0YWJsZSwgd2l0aCBzdHJpcGluZy5cbiAgICAgICAgLy8gQnV0IGlmIGdyb3VwaW5nIGlzIGVuYWJsZWQgYW5kIHRoZXJlIGlzIGF0IGxlYXN0IG9uZSBncm91cCwgd2UgYWRkIHRoZW0gYSBmZXcgYXQgYSB0aW1lLFxuICAgICAgICAvLyBwcm9jZWVkaW5nIHRocm91Z2ggZWFjaCBncm91cC5cblxuICAgICAgICBpZiAoIXRoaXMuX2dyb3VwaW5nRW5hYmxlZCB8fCByb3dHcm91cFNwZWMubGVuZ3RoIDwgMSkgeyAgICAvLyBUaGUgc3RhbmRhcmQgbm9uLWdyb3VwZWQgbWV0aG9kOlxuXG4gICAgICAgICAgICBpZiAodGhpcy5fc3BlYy50YWJsZVNwZWMuYXBwbHlTdHJpcGluZykge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UuZm9yRWFjaCgocykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzdHJpcGluZyA9IDEgLSBzdHJpcGluZztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVjb3JkRWxlbWVudHNbc10uYXBwbHlTdHJpcGluZyhzdHJpcGluZyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlLmZvckVhY2goKHMpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuX3JlY29yZEVsZW1lbnRzW3NdLmdldEVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZnJhZy5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBlbHNlIHsgICAgLy8gVGhlIG1vcmUgY29tcGxpY2F0ZWQsIGdyb3VwZWQgbWV0aG9kOlxuXG4gICAgICAgICAgICB2YXIgc3RyaXBlU3R5bGVzID0gWydzdHJpcGVSb3dBJywnc3RyaXBlUm93QiddO1xuICAgICAgICAgICAgdmFyIHN0cmlwZVN0eWxlc0pvaW4gPSBzdHJpcGVTdHlsZXMuam9pbignICcpO1xuXG4gICAgICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlLmZvckVhY2goKHMpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcm93R3JvdXAgPSByb3dHcm91cFNwZWNbdGhpcy5fc3BlYy5nZXRSb3dHcm91cE1lbWJlcnNoaXAocyldO1xuICAgICAgICAgICAgICAgIHJvd0dyb3VwLm1lbWJlclJlY29yZHMucHVzaCh0aGlzLl9yZWNvcmRFbGVtZW50c1tzXSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgIHJvd0dyb3VwU3BlYy5mb3JFYWNoKChyb3dHcm91cCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyb3dHcm91cC5tZW1iZXJSZWNvcmRzLmxlbmd0aCA8IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUncyBub3RoaW5nIGluIHRoZSBncm91cCAobWF5IGhhdmUgYWxsIGJlZW4gZmlsdGVyZWQgb3V0KSBza2lwIGl0XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc3RyaXBpbmcgPSAxIC0gc3RyaXBpbmc7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3NwZWMudGFibGVTcGVjLmFwcGx5U3RyaXBpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93R3JvdXAudW5kaXNjbG9zZWRUaXRsZVJvd0pRLmFkZChyb3dHcm91cC5kaXNjbG9zZWRUaXRsZVJvd0pRKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKHN0cmlwZVN0eWxlc0pvaW4pLmFkZENsYXNzKHN0cmlwZVN0eWxlc1tzdHJpcGluZ10pLmVuZCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXJvd0dyb3VwLmRpc2Nsb3NlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZ3JvdXAgaXMgbm90IGRpc2Nsb3NlZCwganVzdCBwcmludCB0aGUgXCJ1bmRpc2Nsb3NlZFwiIHRpdGxlIHJvdywgYW5kIHNraXAgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIHJvd3MgdGhlbXNlbHZlcyAoYnV0IGludmVydCB0aGUgc3RyaXBpbmcgdmFsdWUgc28gdGhlIHN0cmlwaW5nIHBhdHRlcm4gaXNuJ3QgZGlzdHVyYmVkKVxuICAgICAgICAgICAgICAgICAgICBmcmFnLmFwcGVuZENoaWxkKHJvd0dyb3VwLnVuZGlzY2xvc2VkVGl0bGVSb3cpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZyYWcuYXBwZW5kQ2hpbGQocm93R3JvdXAuZGlzY2xvc2VkVGl0bGVSb3cpO1xuXG4gICAgICAgICAgICAgICAgIHJvd0dyb3VwLm1lbWJlclJlY29yZHMuZm9yRWFjaCgocmVjb3JkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN0cmlwaW5nID0gMSAtIHN0cmlwaW5nO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fc3BlYy50YWJsZVNwZWMuYXBwbHlTdHJpcGluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkLmFwcGx5U3RyaXBpbmcoc3RyaXBpbmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHZhciByb3dzID0gcmVjb3JkLmdldEVsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmcmFnLmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1lbWJlciB0aGF0IHdlIGxhc3Qgc29ydGVkIGJ5IHRoaXMgY29sdW1uXG4gICAgICAgIHRoaXMuX3RhYmxlQm9keS5hcHBlbmRDaGlsZChmcmFnKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIEdpdmVuIGFuIGFycmF5IG9mIHJlY29yZCBJRHMsIHNlbmQgdGhlIGFycmF5IHRocm91Z2ggdGhlIGZpbHRlcmluZyBmdW5jdGlvbiBmb3IgZWFjaCBvZlxuICAgIC8vIHRoZSBoZWFkZXIgd2lkZ2V0cywgYW5kIGVhY2ggb2YgdGhlIG9wdGlvbnMgbWVudSB3aWRnZXRzLCB0aGVuIHJldHVybiB0aGUgZmlsdGVyZWQgYXJyYXkuXG4gICAgYXBwbHlBbGxXaWRnZXRGaWx0ZXJpbmcoZmlsdGVyZWRTZXF1ZW5jZTpzdHJpbmdbXSk6c3RyaW5nW10ge1xuICAgICAgICAvLyBHaXZlIGVhY2ggaGVhZGVyIHdpZGdldCBhIGNoYW5jZSB0byBhcHBseSBmaWx0ZXJpbmdcbiAgICAgICAgdGhpcy5faGVhZGVyV2lkZ2V0cy5mb3JFYWNoKCh3aWRnZXQpID0+IHtcbiAgICAgICAgICAgIGZpbHRlcmVkU2VxdWVuY2UgPSB3aWRnZXQuYXBwbHlGaWx0ZXJUb0lEcyhmaWx0ZXJlZFNlcXVlbmNlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gR2l2ZSBlYWNoIHdpZGdldCBpbiB0aGUgb3B0aW9ucyBtZW51IGEgY2hhbmNlIHRvIGFwcGx5IGZpbHRlcmluZ1xuICAgICAgICB0aGlzLl9vcHRpb25zTWVudVdpZGdldHMuZm9yRWFjaCgod2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICBmaWx0ZXJlZFNlcXVlbmNlID0gd2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMoZmlsdGVyZWRTZXF1ZW5jZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZmlsdGVyZWRTZXF1ZW5jZTtcbiAgICB9XG5cblxuICAgIC8vIEFkZCB1cCBhbGwgdGhlIGNvbHVtbiBjb3VudHMgaW4gdGhlIGhlYWRlcnNwZWMsIHRvIGFycml2ZSBhdCBhIGdyYW5kIHRvdGFsIGZvciB0aGUgdGFibGUuXG4gICAgZ2V0U3BlYygpOmFueSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zcGVjOyAgICAvLyBGKioqIHR5cGUgY29udmVyc2lvbiBGKioqIHRoaW5ncyB1cCB3aGVuIHN1YmNsYXNzaW5nXG4gICAgfVxuXG5cbiAgICAvLyBBZGQgdXAgYWxsIHRoZSBjb2x1bW4gY291bnRzIGluIHRoZSBoZWFkZXJzcGVjLCB0byBhcnJpdmUgYXQgYSBncmFuZCB0b3RhbCBmb3IgdGhlIHRhYmxlLlxuICAgIGNvdW50VG90YWxDb2x1bW5zKCk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NwZWMudGFibGVIZWFkZXJTcGVjLnJlZHVjZSgocHJldiwgdik6bnVtYmVyID0+IHtcbiAgICAgICAgICAgIGlmICh2LmhlYWRlclJvdykge1xuICAgICAgICAgICAgICAgIGlmICh2LmhlYWRlclJvdyA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHByZXY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHByZXYgKyAodi5jb2xzcGFuID8gdi5jb2xzcGFuIDogMSk7XG4gICAgICAgIH0sIDApO1xuICAgIH1cblxuXG4gICAgLy8gV2FsayB0aHJvdWdoIGVhY2ggaGVhZGVyIGluIHRoZSBzcGVjLCBhbmQgbG9vayBmb3IgYSBcInNvcnRCeVwiIGZ1bmN0aW9uLlxuICAgIC8vIElmIG9uZSBpcyBmb3VuZCwgdXNlIGl0IHRvIGNvbnN0cnVjdCBhIHNvcnRpbmcgZnVuY3Rpb25cbiAgICBwcml2YXRlIF9idWlsZEFsbFRhYmxlU29ydGVycygpOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUhlYWRlclNwZWMuZm9yRWFjaCgoaGVhZGVyKSA9PiB7XG4gICAgICAgICAgICBpZiAoaGVhZGVyLnNvcnRCeSkge1xuICAgICAgICAgICAgICAgIGhlYWRlci5zb3J0RnVuYyA9IHRoaXMuYnVpbGRUYWJsZVNvcnRlcihoZWFkZXIuc29ydEJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gR2l2ZW4gYSBjb21wYXJpc29uIGZ1bmN0aW9uLFxuICAgIC8vIGNvbnN0cnVjdCBhIGZ1bmN0aW9uIHN1aXRhYmxlIGZvciBwYXNzaW5nIHRvIEphdmFzY3JpcHQncyBcInNvcnRcIi5cbiAgICBidWlsZFRhYmxlU29ydGVyKGxvb2t1cEZ1bmM6IChyb3dJbmRleDpudW1iZXIpID0+IGFueSk6ICh4Om51bWJlciwgeTpudW1iZXIpID0+IG51bWJlciB7XG4gICAgICAgIHJldHVybiAocm93SW5kZXhBOm51bWJlciwgcm93SW5kZXhCOm51bWJlcikgPT4ge1xuICAgICAgICAgICAgdmFyIGEgPSBsb29rdXBGdW5jLmNhbGwodGhpcy5fc3BlYywgcm93SW5kZXhBKTtcbiAgICAgICAgICAgIHZhciBiID0gbG9va3VwRnVuYy5jYWxsKHRoaXMuX3NwZWMsIHJvd0luZGV4Qik7XG4gICAgICAgICAgICByZXR1cm4gKDxhbnk+KGEgPiBiKSAtIDxhbnk+KGIgPiBhKSk7IC8vIHRydWUgYmVjb21lcyAxLCBmYWxzZSBiZWNvbWVzIDBcbiAgICAgICAgfTtcbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IHdpdGggdGhlIGFycmF5IG9mIElEcyBnaXZlbiBpbiB0aGUgc3BlYy4gIFRoZW4sIGZvciBlYWNoIGhlYWRlciwgYnVpbGQgYSBzb3J0ZWQgY29weSBvZiB0aGUgYXJyYXksXG4gICAgLy8gYW5kIHNhdmUgdGhlIHNvcnRlZCBjb3B5IGludG8gdGhlIGhlYWRlciBpbmZvcm1hdGlvbi5cbiAgICAvL1xuICAgIC8vIFNvbWUgc29ydCBzZXF1ZW5jZXMgbWF5IHJlbHkgb24gdGhlIHNvcnQgc2VxdWVuY2VzIG9mIG90aGVyIGhlYWRlcnMuXG4gICAgLy8gSW4gdGhlIGNvZGUgYmVsb3csIHRoZXNlIGFyZSBmb2xsb3dlZCBsaWtlIGEgZGVwZW5kZW5jeSB0cmVlLlxuICAgIC8vIFdlIGRvIHRoaXMgYnkgdHJhY2tpbmcgdGhlIHVuc29ydGVkIGhlYWRlcnMgaW4gYSBzZXQsIGFuZCBsb29waW5nIHRocm91Z2ggdGhlIHNldC5cbiAgICAvLyBFdmVyeSB0aW1lIHdlIGZpbmQgYSBoZWFkZXIgdGhhdCB3ZSBjYW4gc3VjY2Vzc2Z1bGx5IHNvcnQgLSB3aGV0aGVyIGJlY2F1c2UgdGhlIHByZXJlcXVpc2l0ZSBoZWFkZXIgaXMgYWxyZWFkeVxuICAgIC8vIHNvcnRlZCwgb3IgYmVjYXVzZSBpdCBoYXMgbm8gcHJlcmVxdWlzaXRlIC0gd2Ugc29ydCBpdCBhbmQgcmVtb3ZlIGl0IGZyb20gdGhlIHNldC5cbiAgICAvLyBJZiB3ZSBldmVyIGxvb3AgdGhyb3VnaCB0aGUgc2V0IGFuZCBmYWlsIHRvIHJlbW92ZSBldmVuIG9uZSBpdGVtIGZyb20gaXQsIHdlIGdpdmUgdXAsXG4gICAgLy8gc2luY2UgdGhlcmUgbXVzdCBiZSBhIGRlcGVuZGVuY3kgbG9vcC5cbiAgICAvLyBJdCdzIG5vdCB0aGUgZmFzdGVzdCBtZXRob2Qgb24gdGhlIHBsYW5ldCwgYnV0IGl0J3MgZ29vZCBlbm91Z2gsIHNpbmNlIHdlJ2xsIHByb2JhYmx5IG5ldmVyIGhhdmUgYW55IG1vcmUgdGhhbiAxMCBvciBzbyBoZWFkZXJzLlxuICAgIHByaXZhdGUgX2J1aWxkVGFibGVTb3J0U2VxdWVuY2VzKCk6RGF0YUdyaWQge1xuICAgICAgICB2YXIgdW5zb3J0ZWRIZWFkZXJzOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gW107XG4gICAgICAgIHZhciBzb3J0ZWRBdExlYXN0T25lTmV3SGVhZGVyOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgLy8gRGVjbGFyZSBhbGwgdGhlIGhlYWRlcnMgdW5zb3J0ZWQsIGFuZCBhZGQgdGhlbSB0byB0aGUgdW5zb3J0ZWQgc2V0LlxuICAgICAgICB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChoZWFkZXIuc29ydElkKSB7ICAgICAgICAgLy8gYW55dGhpbmcgd2l0aCBzb3J0SWQgaXMgc29ydGVkIHNlcnZlci1zaWRlIGFscmVhZHlcbiAgICAgICAgICAgICAgICBoZWFkZXIuc29ydGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaGVhZGVyLnNvcnRGdW5jKSB7ICAgICAgICAgICAvLyBvbmx5IGFkZCBoZWFkZXJzIHdpdGggc29ydCBmdW5jdGlvbnNcbiAgICAgICAgICAgICAgICB1bnNvcnRlZEhlYWRlcnMudW5zaGlmdChoZWFkZXIpOyAgICAvLyBhZGQgaW4gZnJvbnQsIHNvIHNldCBpcyByZXZlcnNlZFxuICAgICAgICAgICAgICAgIGhlYWRlci5zb3J0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIHNvcnRlZEF0TGVhc3RPbmVOZXdIZWFkZXIgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIHVzZSBzbGljZSBzbyB0aGF0IHNwbGljZSBpbnNpZGUgdGhlIGNhbGxiYWNrIGRvZXMgbm90IGludGVyZmVyZSB3aXRoIGxvb3BcbiAgICAgICAgICAgIHVuc29ydGVkSGVhZGVycy5zbGljZSgwKS5mb3JFYWNoKChoZWFkZXIsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFmdGVyO1xuICAgICAgICAgICAgICAgIGlmIChoZWFkZXIuc29ydEFmdGVyID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYWZ0ZXIgPSB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlY1toZWFkZXIuc29ydEFmdGVyXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhZnRlci5zb3J0ZWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5fc2VxdWVuY2VbaGVhZGVyLmlkXSA9IHRoaXMuX3NwZWMuZ2V0UmVjb3JkSURzKCk7XG4gICAgICAgICAgICAgICAgaWYgKGFmdGVyICYmIGFmdGVyLmlkICYmIHRoaXMuX3NlcXVlbmNlW2FmdGVyLmlkXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXF1ZW5jZVtoZWFkZXIuaWRdID0gdGhpcy5fc2VxdWVuY2VbYWZ0ZXIuaWRdLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLl9zZXF1ZW5jZVtoZWFkZXIuaWRdLnNvcnQoaGVhZGVyLnNvcnRGdW5jKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zZXF1ZW5jZVsnLScraGVhZGVyLmlkXSA9IHRoaXMuX3NlcXVlbmNlW2hlYWRlci5pZF0uc2xpY2UoMCkucmV2ZXJzZSgpO1xuICAgICAgICAgICAgICAgIGhlYWRlci5zb3J0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHVuc29ydGVkSGVhZGVycy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIHNvcnRlZEF0TGVhc3RPbmVOZXdIZWFkZXIgPSB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gd2hpbGUgKHNvcnRlZEF0TGVhc3RPbmVOZXdIZWFkZXIpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgX2dldFNlcXVlbmNlKHNvcnQ6RGF0YUdyaWRTb3J0KTpzdHJpbmdbXSB7XG4gICAgICAgIHZhciBrZXkgPSAoc29ydC5hc2MgPyAnJyA6ICctJykgKyBzb3J0LnNwZWMuaWQsXG4gICAgICAgICAgICBzZXF1ZW5jZSA9IHRoaXMuX3NlcXVlbmNlW2tleV07XG4gICAgICAgIGlmIChzZXF1ZW5jZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3BlYy5nZXRSZWNvcmRJRHMoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2VxdWVuY2U7XG5cbiAgICB9XG5cblxuICAgIHByaXZhdGUgX2J1aWxkVGFibGVIZWFkZXJzKCk6SFRNTEVsZW1lbnRbXSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIG1pbmltdW0gbnVtYmVyIG9mIHJvd3Mgd2UgbmVlZCB0byBjcmVhdGUgdG8gY29udGFpbiBhbGwgdGhlIGhlYWRlcnNcbiAgICAgICAgdmFyIG1heGhlYWRlclJvdzpudW1iZXIgPSB0aGlzLl9zcGVjLnRhYmxlSGVhZGVyU3BlYy5yZWR1Y2UoXG4gICAgICAgICAgICAgICAgKHByZXY6bnVtYmVyLCB2KSA9PiB7IHJldHVybiBNYXRoLm1heChwcmV2LCB2LmhlYWRlclJvdyB8fCAwKTsgfSwgMSk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIGVub3VnaCByb3dzIHRvIGNvbnRhaW4gdGhlIGhlYWRlcnMgKHVzdWFsbHkganVzdCAxKVxuICAgICAgICB2YXIgcm93RWxlbWVudHM6SFRNTEVsZW1lbnRbXSA9IFtdO1xuICAgICAgICAgZm9yICh2YXIgaT0wOyBpIDwgbWF4aGVhZGVyUm93OyBpKyspIHtcbiAgICAgICAgICAgIHZhciByb3cgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0clwiKSkuYWRkQ2xhc3MoJ2NvbHVtbkxhYmVscycpO1xuICAgICAgICAgICAgcm93RWxlbWVudHMucHVzaChyb3dbMF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUnVuIHRocm91Z2ggZWFjaCBpbmRpdmlkdWFsIGhlYWRlciwgY3JlYXRlIGl0IGFjY29yZGluZyB0byB0aGUgc3BlY3MsIGFuZCBhZGQgaXQgdG8gdGhlIGFwcHJvcHJpYXRlIHJvdy5cbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZUhlYWRlclNwZWMuZm9yRWFjaCgoaGVhZGVyLCBpLCBzcmMpID0+IHtcbiAgICAgICAgICAgIHZhciBjb21tb25Dc3M6e30gPSB7XG4gICAgICAgICAgICAgICAgJ3dpZHRoJzogaGVhZGVyLndpZHRoID9cbiAgICAgICAgICAgICAgICAgICAgKGhlYWRlci53aWR0aC5zdWJzdHIoLTEpICE9PSAnJScgPyBoZWFkZXIud2lkdGggKyAncHgnIDogaGVhZGVyLndpZHRoKSA6XG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB2YXIgY3NzOnt9ID0gJC5leHRlbmQoe1xuICAgICAgICAgICAgICAgICd0ZXh0LWFsaWduJzogaGVhZGVyLmFsaWduLFxuICAgICAgICAgICAgICAgICd2ZXJ0aWNhbC1hbGlnbic6IGhlYWRlci52YWxpZ24sXG4gICAgICAgICAgICAgICAgJ2Rpc3BsYXknOiBoZWFkZXIuZGlzcGxheVxuICAgICAgICAgICAgfSwgY29tbW9uQ3NzKTtcbiAgICAgICAgICAgIGhlYWRlci5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRoXCIpO1xuICAgICAgICAgICAgdmFyIGNlbGw6SlF1ZXJ5ID0gJChoZWFkZXIuZWxlbWVudCkuY3NzKGNzcykuYXR0cih7XG4gICAgICAgICAgICAgICAgICAgICdpZCc6IGhlYWRlci5pZCxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbHNwYW4nOiBoZWFkZXIuY29sc3BhbiA+IDEgPyBoZWFkZXIuY29sc3BhbiA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBoZWFkZXIucm93c3BhbiA+IDEgPyBoZWFkZXIucm93c3BhbiA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgJ2NsYXNzJzogaGVhZGVyLnNpemUgPT09ICdzJyA/ICdzbWFsbGVyJyA6IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgIH0pLmFwcGVuZFRvKHJvd0VsZW1lbnRzW01hdGgubWF4KGhlYWRlci5oZWFkZXJSb3cgfHwgMSwgMSkgLSAxXSk7XG4gICAgICAgICAgICBpZiAoaGVhZGVyLnNvcnRCeSkge1xuICAgICAgICAgICAgICAgIGNlbGwuYWRkQ2xhc3MoJ3NvcnRoZWFkZXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChoZWFkZXIubmFtZSkge1xuICAgICAgICAgICAgICAgICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSkuYXBwZW5kVG8oY2VsbCkudGV4dChoZWFkZXIubmFtZSlcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnY2xhc3MnOiBoZWFkZXIubm93cmFwID8gJ25vd3JhcCcgOiB1bmRlZmluZWQgfSkuY3NzKGNvbW1vbkNzcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBSZW1vdmUgdGhlIHJpZ2h0LXNpZGUgYm9yZGVyIGxpbmUgZnJvbSB0aGUgbGFzdCBlbGVtZW50IG9mIGVhY2ggcm93XG4gICAgICAgIHJvd0VsZW1lbnRzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgdmFyIGw6YW55ID0gcm93Lmxhc3RDaGlsZDtcbiAgICAgICAgICAgIGlmIChsKSB7IGwuc3R5bGUuYm9yZGVyUmlnaHQgPSAnMCcgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcm93RWxlbWVudHM7XG4gICAgfVxuXG5cbiAgICAvLyBCdWlsZCB0aGUgcm93cyAoYW5kIHRoZSBjb250ZW50cyBvZiB0aGUgcm93cykgZm9yIGVhY2ggcmVjb3JkIGluIHRoZSBkYXRhLlxuICAgIC8vIChTZWUgdGhlIERhdGFHcmlkRGF0YUNlbGwgY2xhc3MuKVxuICAgIHByaXZhdGUgX2FsbG9jYXRlVGFibGVSb3dSZWNvcmRzKCk6RGF0YUdyaWQge1xuICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50cyA9IG5ldyBEYXRhR3JpZFJlY29yZFNldCgpO1xuICAgICAgICB0aGlzLl9zcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9yZWNvcmRFbGVtZW50c1tpZF0gPSBuZXcgRGF0YUdyaWRSZWNvcmQodGhpcy5fc3BlYywgaWQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyBBc3NlbWJsZSB0YWJsZSByb3dzIC0gZGlzY2xvc2VkIGFuZCB1bmRpc2Nsb3NlZCB2ZXJzaW9ucyAod2l0aCBjYWxsYmFja3MpIC1cbiAgICAvLyB0aGF0IGFjdCBhcyB0aXRsZXMgZm9yIHRoZSBkaWZmZXJlbnQgZ3JvdXBzIHdoZW4gdGhlIHRhYmxlIGlzIGluIGdyb3VwaW5nIG1vZGUuXG4gICAgcHJpdmF0ZSBfYnVpbGRSb3dHcm91cFRpdGxlUm93cygpOkRhdGFHcmlkIHtcbiAgICAgICAgdGhpcy5fc3BlYy50YWJsZVJvd0dyb3VwU3BlYy5mb3JFYWNoKChvbmVHcm91cCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIG9uZUdyb3VwLmRpc2Nsb3NlZCA9IHRydWU7XG4gICAgICAgICAgICBvbmVHcm91cC5tZW1iZXJSZWNvcmRzID0gW107XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBvbmVHcm91cC5kaXNjbG9zZWRUaXRsZVJvd0pRID0gJChvbmVHcm91cC5kaXNjbG9zZWRUaXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0clwiKSlcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2dyb3VwSGVhZGVyJykuY2xpY2soKCkgPT4gdGhpcy5fY29sbGFwc2VSb3dHcm91cChpbmRleCkpO1xuICAgICAgICAgICAgdmFyIGNlbGwgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZFwiKSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgICAgICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSkuYXBwZW5kVG8oY2VsbCkudGV4dChcIlxcdTI1QkEgXCIgKyBvbmVHcm91cC5uYW1lKTtcbiAgICAgICAgICAgIGlmICh0aGlzLl90b3RhbENvbHVtbkNvdW50ID4gMSkge1xuICAgICAgICAgICAgICAgIGNlbGwuYXR0cignY29sc3BhbicsIHRoaXMuX3RvdGFsQ29sdW1uQ291bnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByb3cgPSBvbmVHcm91cC51bmRpc2Nsb3NlZFRpdGxlUm93SlEgPSAkKG9uZUdyb3VwLnVuZGlzY2xvc2VkVGl0bGVSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidHJcIikpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKCdncm91cEhlYWRlcicpLmNsaWNrKCgpID0+IHRoaXMuX2V4cGFuZFJvd0dyb3VwKGluZGV4KSk7XG4gICAgICAgICAgICBjZWxsID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGRcIikpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgICAgICAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIikpLmFwcGVuZFRvKGNlbGwpLnRleHQoXCJcXHUyNUJDIFwiICsgb25lR3JvdXAubmFtZSk7XG4gICAgICAgICAgICBpZiAodGhpcy5fdG90YWxDb2x1bW5Db3VudCA+IDEpIHtcbiAgICAgICAgICAgICAgICBjZWxsLmF0dHIoJ2NvbHNwYW4nLCB0aGlzLl90b3RhbENvbHVtbkNvdW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gSGFuZGxlIHRoZSBcInNvcnRhYmxlXCIgQ1NTIGNsYXNzIGluIGEgdGFibGUuXG4gICAgcHJpdmF0ZSBfcHJlcGFyZVNvcnRhYmxlKCk6dm9pZCB7XG4gICAgICAgIC8vIEFkZCBhIGNsaWNrIGV2ZW50IGZvciBldmVyeSBoZWFkZXIgY2VsbCB0aGF0IGlkZW50aWZpZXMgYXMgc29ydGFibGVcbiAgICAgICAgdGhpcy5fc3BlYy5lbmFibGVTb3J0KHRoaXMpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfc2hvd09wdE1lbnUoKTp2b2lkIHtcbiAgICAgICAgJCh0aGlzLl9vcHRpb25zTGFiZWwpLnJlbW92ZUNsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9uJyk7XG4gICAgICAgICQodGhpcy5fb3B0aW9uc01lbnVCbG9ja0VsZW1lbnQpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9oaWRlT3B0TWVudSgpOnZvaWQge1xuICAgICAgICAkKHRoaXMuX29wdGlvbnNMYWJlbCkucmVtb3ZlQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT24nKS5hZGRDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKTtcbiAgICAgICAgJCh0aGlzLl9vcHRpb25zTWVudUJsb2NrRWxlbWVudCkuYWRkQ2xhc3MoJ29mZicpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfY29sbGFwc2VSb3dHcm91cChncm91cEluZGV4KTp2b2lkIHtcbiAgICAgICAgdmFyIHJvd0dyb3VwID0gdGhpcy5fc3BlYy50YWJsZVJvd0dyb3VwU3BlY1tncm91cEluZGV4XTtcbiAgICAgICAgcm93R3JvdXAuZGlzY2xvc2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignYXJyYW5nZVRhYmxlRGF0YVJvd3MnLCAoKSA9PiB0aGlzLmFycmFuZ2VUYWJsZURhdGFSb3dzKCkpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfZXhwYW5kUm93R3JvdXAoZ3JvdXBJbmRleCk6dm9pZCB7XG4gICAgICAgIHZhciByb3dHcm91cCA9IHRoaXMuX3NwZWMudGFibGVSb3dHcm91cFNwZWNbZ3JvdXBJbmRleF07XG4gICAgICAgIHJvd0dyb3VwLmRpc2Nsb3NlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignYXJyYW5nZVRhYmxlRGF0YVJvd3MnLCAoKSA9PiB0aGlzLmFycmFuZ2VUYWJsZURhdGFSb3dzKCkpO1xuICAgIH1cblxuXG4gICAgdHVybk9uUm93R3JvdXBpbmcoKTp2b2lkIHtcbiAgICAgICAgdGhpcy5fZ3JvdXBpbmdFbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdhcnJhbmdlVGFibGVEYXRhUm93cycsICgpID0+IHRoaXMuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKSk7XG4gICAgfVxuXG5cbiAgICB0dXJuT2ZmUm93R3JvdXBpbmcoKTp2b2lkIHtcbiAgICAgICAgdGhpcy5fZ3JvdXBpbmdFbmFibGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignYXJyYW5nZVRhYmxlRGF0YVJvd3MnLCAoKSA9PiB0aGlzLmFycmFuZ2VUYWJsZURhdGFSb3dzKCkpO1xuICAgIH1cblxuXG4gICAgY2xpY2tlZE9wdGlvbldpZGdldChldmVudDpFdmVudCk6dm9pZCB7XG4gICAgICAgIHZhciBjb250cm9sID0gZXZlbnQudGFyZ2V0OyAgICAvLyBHcmFiIHRoZSBjaGVja2JveCB0aGF0IHNlbnQgdGhlIGV2ZW50XG4gICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignYXJyYW5nZVRhYmxlRGF0YVJvd3MnLCAoKSA9PiB0aGlzLmFycmFuZ2VUYWJsZURhdGFSb3dzKCkpO1xuICAgIH1cblxuXG4gICAgY2xpY2tlZEhlYWRlcldpZGdldChoZWFkZXJXaWRnZXQ6RGF0YUdyaWRXaWRnZXQpOnZvaWQge1xuICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ2FycmFuZ2VUYWJsZURhdGFSb3dzJywgKCkgPT4gdGhpcy5hcnJhbmdlVGFibGVEYXRhUm93cygpKTtcbiAgICB9XG5cblxuICAgIC8vICdjb250cm9sJyBpcyBhIGNvbHVtbiB2aXNpYmlsaXR5IGNoZWNrYm94XG4gICAgcHJpdmF0ZSBfY2xpY2tlZENvbFZpc2liaWxpdHlDb250cm9sKGV2ZW50OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIGNoZWNrID0gJChldmVudC50YXJnZXQpLCBjb2wgPSBldmVudC5kYXRhO1xuICAgICAgICBpZiAoY2hlY2sucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICB0aGlzLnNob3dDb2x1bW4oY29sKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaGlkZUNvbHVtbihjb2wpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gJ2NvbnRyb2wnIGlzIGEgY29sdW1uIHZpc2liaWxpdHkgY2hlY2tib3hcbiAgICBzaG93Q29sdW1uKGdyb3VwOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKTp2b2lkIHtcbiAgICAgICAgaWYgKGdyb3VwLmN1cnJlbnRseUhpZGRlbikge1xuICAgICAgICAgICAgZ3JvdXAuY3VycmVudGx5SGlkZGVuID0gZmFsc2U7XG4gICAgICAgICAgICBpZiAoZ3JvdXAucmV2ZWFsZWRDYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGdyb3VwLnJldmVhbGVkQ2FsbGJhY2sodGhpcy5fc3BlYywgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ191cGRhdGVDb2x1bW5TZXR0aW5ncycsICgpID0+IHRoaXMuX3VwZGF0ZUNvbHVtblNldHRpbmdzKCkpO1xuICAgICAgICAgICAgdGhpcy5zY2hlZHVsZVRpbWVyKCdfYXBwbHlDb2x1bW5WaXNpYmlsaXR5JywgKCkgPT4gdGhpcy5fYXBwbHlDb2x1bW5WaXNpYmlsaXR5KCkpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyAnY29udHJvbCcgaXMgYSBjb2x1bW4gdmlzaWJpbGl0eSBjaGVja2JveFxuICAgIGhpZGVDb2x1bW4oZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMpOnZvaWQge1xuICAgICAgICBpZiAoIWdyb3VwLmN1cnJlbnRseUhpZGRlbikge1xuICAgICAgICAgICAgZ3JvdXAuY3VycmVudGx5SGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVUaW1lcignX3VwZGF0ZUNvbHVtblNldHRpbmdzJywgKCkgPT4gdGhpcy5fdXBkYXRlQ29sdW1uU2V0dGluZ3MoKSk7XG4gICAgICAgICAgICB0aGlzLnNjaGVkdWxlVGltZXIoJ19hcHBseUNvbHVtblZpc2liaWxpdHknLCAoKSA9PiB0aGlzLl9hcHBseUNvbHVtblZpc2liaWxpdHkoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9iYXNlUGF5bG9hZCgpOmFueSB7XG4gICAgICAgIHZhciB0b2tlbjpzdHJpbmcgPSBkb2N1bWVudC5jb29raWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oPzooPzpefC4qO1xccyopY3NyZnRva2VuXFxzKlxcPVxccyooW147XSopLiokKXxeLiokLyxcbiAgICAgICAgICAgICckMScpO1xuICAgICAgICByZXR1cm4geyAnY3NyZm1pZGRsZXdhcmV0b2tlbic6IHRva2VuIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfY29sdW1uU2V0dGluZ3NLZXkoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gWyAnZGF0YWdyaWQnLCB0aGlzLl9zcGVjLnRhYmxlU3BlYy5pZCwgJ2NvbHVtbicgXS5qb2luKCcuJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZmV0Y2hTZXR0aW5ncyhwcm9wS2V5OnN0cmluZywgY2FsbGJhY2s6KHZhbHVlOmFueSk9PnZvaWQsIGRlZmF1bHRWYWx1ZT86YW55KTp2b2lkIHtcbiAgICAgICAgJC5hamF4KCcvcHJvZmlsZS9zZXR0aW5ncy8nICsgcHJvcEtleSwge1xuICAgICAgICAgICAgJ2RhdGFUeXBlJzogJ2pzb24nLFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoZGF0YTphbnkpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGRhdGEgPSBkYXRhIHx8IGRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyAvKiBQYXJzZUVycm9yLCBqdXN0IHVzZSBzdHJpbmcgdmFsdWUgKi8gfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gVGhlIHNlcnZlciBiaW5kcyB0aGlzLiAndGhpcycgaXMgYSBjaGVja2JveC5cbiAgICBwcml2YXRlIF91cGRhdGVDb2x1bW5TZXR0aW5ncygpOkRhdGFHcmlkIHtcbiAgICAgICAgdmFyIHByb3BLZXkgPSB0aGlzLl9jb2x1bW5TZXR0aW5nc0tleSgpLCBzZXRDb2wgPSBbXSwgdW5zZXRDb2wgPSBbXSwgZGVsQ29sID0gW107XG4gICAgICAgIHRoaXMuX3NwZWMudGFibGVDb2x1bW5Hcm91cFNwZWMuZm9yRWFjaCgoY29sOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmIChjb2wuc2hvd0luVmlzaWJpbGl0eUxpc3QgJiYgY29sLmNoZWNrYm94RWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGlmIChjb2wuY2hlY2tib3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0Q29sLnB1c2goY29sLm5hbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHVuc2V0Q29sLnB1c2goY29sLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbC5oaWRkZW5CeURlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbENvbC5wdXNoKCctJyArIGNvbC5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX2ZldGNoU2V0dGluZ3MocHJvcEtleSwgKGRhdGE6YW55KSA9PiB7XG4gICAgICAgICAgICB2YXIgaW5EYXRhID0gKG5hbWU6c3RyaW5nKTpib29sZWFuID0+IGRhdGEuaW5kZXhPZihuYW1lKSA9PT0gLTE7XG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IGFsbCB0aGUgdW5zZXQgYm94ZXNcbiAgICAgICAgICAgIGRhdGEgPSBkYXRhLmZpbHRlcigobmFtZTpzdHJpbmcpOmJvb2xlYW4gPT4gdW5zZXRDb2wuaW5kZXhPZihuYW1lKSA9PT0gLTEpO1xuICAgICAgICAgICAgLy8gZmlsdGVyIG91dCBhbGwgZXhjbHVkZWQgdGhhdCBhcmUgbm93IHNldFxuICAgICAgICAgICAgZGF0YSA9IGRhdGEuZmlsdGVyKChuYW1lOnN0cmluZyk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICEoc2V0Q29sLmluZGV4T2YobmFtZS5zdWJzdHJpbmcoMSkpICE9PSAtMSAmJiBuYW1lLmluZGV4T2YoJy0nKSA9PT0gMCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIGZpbHRlciBvdXQgYWxsIHRoZSBzZXQgYm94ZXMgYWxyZWFkeSBpbiB0aGUgc2V0dGluZ3MgbGlzdFxuICAgICAgICAgICAgc2V0Q29sID0gc2V0Q29sLmZpbHRlcihpbkRhdGEpO1xuICAgICAgICAgICAgLy8gZmlsdGVyIG91dCBkdXBlcyBpbiBkZWxDb2xcbiAgICAgICAgICAgIGRlbENvbCA9IGRlbENvbC5maWx0ZXIoaW5EYXRhKVxuICAgICAgICAgICAgLy8gYWRkIGFueSBtaXNzaW5nIGl0ZW1zXG4gICAgICAgICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShkYXRhLCBzZXRDb2wpO1xuICAgICAgICAgICAgLy8gbWFyayBub24tZGVmYXVsdCBoaWRlIChpLmUuIGRlZmF1bHQgc2hvdykgYXMgZXhwbGljaXRseSBleGNsdWRlZFxuICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoZGF0YSwgZGVsQ29sKTtcbiAgICAgICAgICAgIC8vIHN0b3JlIG5ldyBzZXR0aW5nIHZhbHVlXG4gICAgICAgICAgICAkLmFqYXgoJy9wcm9maWxlL3NldHRpbmdzLycgKyBwcm9wS2V5LCB7XG4gICAgICAgICAgICAgICAgJ2RhdGEnOiAkLmV4dGVuZCh7fSwgdGhpcy5fYmFzZVBheWxvYWQoKSwgeyAnZGF0YSc6IEpTT04uc3RyaW5naWZ5KGRhdGEpIH0pLFxuICAgICAgICAgICAgICAgICd0eXBlJzogJ1BPU1QnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgW10pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIC8vIFNjaGVkdWxlIGEgY2FsbCB0byB0aGUgZ2l2ZW4gZnVuY3Rpb24gaW4gdGhlIG5lYXIgZnV0dXJlLCBhbmQgc2F2ZSB0aGUgdGltZXIgdW5kZXIgdGhlIGdpdmVuIGlkZW50aWZpZXIuXG4gICAgLy8gTXVsdGlwbGUgY2FsbHMgdG8gdGhpcyB1c2luZyB0aGUgc2FtZSBpZGVudGlmaWVyIHdpbGwgcmVzY2hlZHVsZSB0aGUgZXZlbnQsIHJlbW92aW5nIHRoZSBvbGQgdGltZXIuXG4gICAgc2NoZWR1bGVUaW1lcih1aWQ6c3RyaW5nLCBmdW5jOigpID0+IGFueSk6RGF0YUdyaWQge1xuICAgICAgICBpZiAodGhpcy5fdGltZXJzW3VpZF0pIHsgY2xlYXJUaW1lb3V0ICggdGhpcy5fdGltZXJzW3VpZF0gKTsgfVxuICAgICAgICB0aGlzLl90aW1lcnNbdWlkXSA9IHNldFRpbWVvdXQoIGZ1bmMsIDEwICk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuXG4gICAgLy8gYXBwbHkgYSBmdW5jdGlvbiB0byBldmVyeSByZWNvcmQgSUQgc3BlY2lmaWVkXG4gICAgYXBwbHlUb1JlY29yZFNldChmdW5jOihyb3dzOkRhdGFHcmlkRGF0YVJvd1tdLCBpZDpzdHJpbmcsIHNwZWM6RGF0YUdyaWRTcGVjQmFzZSwgZ3JpZDpEYXRhR3JpZCk9PnZvaWQsIGlkczpzdHJpbmdbXSk6RGF0YUdyaWQge1xuICAgICAgICBpZHMuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIGZ1bmMuY2FsbCh7fSwgdGhpcy5fcmVjb3JkRWxlbWVudHNbaWRdLmdldERhdGFHcmlkRGF0YVJvd3MoKSwgaWQsIHRoaXMuX3NwZWMsIHRoaXMpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cbiAgICAvLyByZXRyZWl2ZSB0aGUgY3VycmVudCBzZXF1ZW5jZSBvZiByZWNvcmRzIGluIHRoZSBEYXRhR3JpZFxuICAgIGN1cnJlbnRTZXF1ZW5jZSgpOnN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldFNlcXVlbmNlKHRoaXMuX3NvcnRbMF0pO1xuICAgIH1cblxuICAgIHNvcnRDb2xzKCk6RGF0YUdyaWRTb3J0W107XG4gICAgc29ydENvbHMoY29sczpEYXRhR3JpZFNvcnRbXSk6RGF0YUdyaWQ7XG4gICAgc29ydENvbHMoY29scz86RGF0YUdyaWRTb3J0W10pOmFueSB7XG4gICAgICAgIGlmIChjb2xzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zb3J0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fc29ydCA9IGNvbHM7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5cblxuLy8gVHlwZSBkZWZpbml0aW9uIGZvciB0aGUgcmVjb3JkcyBjb250YWluZWQgaW4gYSBEYXRhR3JpZFxuY2xhc3MgRGF0YUdyaWRSZWNvcmRTZXQge1xuICAgIFtpbmRleDpzdHJpbmddOkRhdGFHcmlkUmVjb3JkO1xufVxuXG5cbi8vIFR5cGUgZGVmaW5pdGlvbiBmb3IgdGhlIHJlY29yZHMgY29udGFpbmVkIGluIGEgRGF0YUdyaWRcbmNsYXNzIERhdGFHcmlkUmVjb3JkIHtcbiAgICBncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlO1xuICAgIHJlY29yZElEOnN0cmluZztcbiAgICBkYXRhR3JpZERhdGFSb3dzOkRhdGFHcmlkRGF0YVJvd1tdO1xuICAgIHJvd0VsZW1lbnRzOkhUTUxFbGVtZW50W107XG4gICAgY3JlYXRlZEVsZW1lbnRzOmJvb2xlYW47XG4gICAgc3RyaXBlU3R5bGVzOnN0cmluZ1tdO1xuICAgIHN0cmlwZVN0eWxlc0pvaW46c3RyaW5nO1xuICAgIHJlY2VudFN0cmlwZUluZGV4OmFueTtcblxuICAgIGNvbnN0cnVjdG9yKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGlkOnN0cmluZykge1xuICAgICAgICB0aGlzLmdyaWRTcGVjID0gZ3JpZFNwZWM7XG4gICAgICAgIHRoaXMucmVjb3JkSUQgPSBpZDtcbiAgICAgICAgdGhpcy5yb3dFbGVtZW50cyA9IFtdO1xuICAgICAgICB0aGlzLmRhdGFHcmlkRGF0YVJvd3MgPSBbXTtcbiAgICAgICAgdGhpcy5zdHJpcGVTdHlsZXMgPSBbJ3N0cmlwZVJvd0EnLCdzdHJpcGVSb3dCJ107XG4gICAgICAgIHRoaXMuc3RyaXBlU3R5bGVzSm9pbiA9IHRoaXMuc3RyaXBlU3R5bGVzLmpvaW4oJyAnKTtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZWNlbnRTdHJpcGVJbmRleCA9IG51bGw7XG4gICAgfVxuXG5cbiAgICByZUNyZWF0ZUVsZW1lbnRzSW5QbGFjZSgpOnZvaWQge1xuICAgICAgICAvLyBJZiB0aGUgZWxlbWVudHMgaGF2ZW4ndCBiZWVuIGNyZWF0ZWQgZXZlbiBvbmNlLCB0aGVuIGRpdmVydCB0byBzdGFuZGFyZCBjcmVhdGlvbiBhbmQgZmluaXNoLlxuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgd2UncmUgZ29pbmcgdG8gbWFpbnRhaW4gdGhlIHBvc2l0aW9uIG9mIHRoZSBuZXcgcm93cyxcbiAgICAgICAgLy8gd2UgbmVlZCB0byBmaW5kIHRoZWlyIGVhcmxpZXIgYWRqYWNlbnQgc2libGluZywgaWYgb25lIGV4aXN0cy5cbiAgICAgICAgdmFyIHByZXZpb3VzUGFyZW50ID0gbnVsbDtcbiAgICAgICAgdmFyIG5leHRTaWJsaW5nID0gbnVsbDtcbiAgICAgICAgaWYgKHRoaXMuZGF0YUdyaWREYXRhUm93cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBsYXN0RWwgPSB0aGlzLnJvd0VsZW1lbnRzW3RoaXMuZGF0YUdyaWREYXRhUm93cy5sZW5ndGgtMV07XG4gICAgICAgICAgICAvLyBTYW5pdHkgY2hlY2s6ICBEb2VzIGl0IGhhdmUgYSBwYXJlbnQ/ICBDYW4ndCBoYXZlIGEgdmFsaWQgc2libGluZyB3aXRob3V0IGEgcGFyZW50LlxuICAgICAgICAgICAgaWYgKGxhc3RFbC5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgcHJldmlvdXNQYXJlbnQgPSBsYXN0RWwucGFyZW50Tm9kZTtcbiAgICAgICAgICAgICAgICBuZXh0U2libGluZyA9IGxhc3RFbC5uZXh0U2libGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBOb3cgdGhhdCB3ZSBrbm93IHRoZXNlIHRoaW5ncywgd2UgY2FuIGRpdGNoIHRoZSByb3dzIG91dCBvZiB0aGUgdGFibGUuXG4gICAgICAgIHRoaXMucmVtb3ZlRWxlbWVudHMoKTtcbiAgICAgICAgLy8gRm9yY2UgcmVjcmVhdGlvbi5cbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHMgPSBmYWxzZTtcbiAgICAgICAgLy8gVGhlIG9sZCBjZWxscyBhcmUgc3RpbGwgcmVmZXJlbmNlZCBpbiB0aGVpciBjb2xTcGVjIG9iamVjdHMgYmVmb3JlIHRoaXMsXG4gICAgICAgIC8vIGJ1dCBjYWxsaW5nIGdlbmVyYXRlQ2VsbHMgYWdhaW4gYXV0b21hdGljYWxseSByZXBsYWNlcyB0aGVtLlxuICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKCk7XG4gICAgICAgIC8vIElmIHJlY2VudFN0cmlwZUluZGV4IGlzIG51bGwsIHdlIGhhdmVuJ3QgYXBwbGllZCBhbnkgc3RyaXBpbmcgdG8gdGhlIHByZXZpb3VzIHJvdywgc28gd2Ugc2tpcCBpdCBoZXJlLlxuICAgICAgICBpZiAoISh0aGlzLnJlY2VudFN0cmlwZUluZGV4ID09PSBudWxsKSkge1xuICAgICAgICAgICAgdGhpcy5hcHBseVN0cmlwaW5nKHRoaXMucmVjZW50U3RyaXBlSW5kZXgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIERyb3AgdGhlIG5ldyByb3dzIGludG8gcGxhY2Ugd2hlcmUgdGhlIG9sZCByb3dzIGxpdmVkLlxuICAgICAgICBpZiAocHJldmlvdXNQYXJlbnQpIHtcbiAgICAgICAgICAgIGlmIChuZXh0U2libGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMucm93RWxlbWVudHMuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzUGFyZW50Lmluc2VydEJlZm9yZShyb3csIG5leHRTaWJsaW5nKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yb3dFbGVtZW50cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNQYXJlbnQuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgY3JlYXRlRWxlbWVudHMoKTp2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnRzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yb3dFbGVtZW50cyA9IFtdO1xuICAgICAgICB0aGlzLmRhdGFHcmlkRGF0YVJvd3MgPSBbXTtcblxuICAgICAgICB2YXIgY2VsbHNGb3JDb2x1bW5zID0ge307XG4gICAgICAgIHRoaXMuZ3JpZFNwZWMudGFibGVDb2x1bW5TcGVjLmZvckVhY2goKGNvbFNwZWMsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBjZWxsc0ZvckNvbHVtbnNbaW5kZXhdID0gY29sU3BlYy5nZW5lcmF0ZUNlbGxzKHRoaXMuZ3JpZFNwZWMsIHRoaXMucmVjb3JkSUQpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXZSB3aWxsIHVzZSB0aGVzZSBpbmRleGVzIHRvIGRldGVybWluZSB3aGVuIHdlIG5lZWQgdG8gYWRkIHRoZSBuZXh0IGNlbGwsIGluIHRoZSBzZXF1ZW5jZSBvZiByb3dzLlxuICAgICAgICB2YXIgY3VycmVudFJvd0hlaWdodHMgPSBbXTtcbiAgICAgICAgdGhpcy5ncmlkU3BlYy50YWJsZUNvbHVtblNwZWMuZm9yRWFjaCgoY29sU3BlYywgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIGN1cnJlbnRSb3dIZWlnaHRzW2luZGV4XSA9IDA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBhZGRpbmdGb3JSb3cgPSAwO1xuICAgICAgICB2YXIgbW9yZVRvQWRkOmJvb2xlYW4gPSB0cnVlO1xuICAgICAgICB2YXIgY2VsbHM6RGF0YUdyaWREYXRhQ2VsbFtdID0gW107XG5cbiAgICAgICAgLy8gUHVsbCBjZWxscyBvZmYgdGhlIGJvdHRvbSBvZiB0aGUgYXJyYXlzLCBsZWZ0IHRvIHJpZ2h0LCBhc3NlbWJsaW5nIHRoZSByb3dzIG9uZSBhdCBhIHRpbWUsXG4gICAgICAgIC8vIHNraXBwaW5nIGNvbHVtbnMgYmFzZWQgb24gdGhlIHJvd3NwYW4gb3IgY29sc3BhbiBvZiBwcmV2aW91cyBjZWxscy4gIFdlIGV4cGVjdCB0aGUgY2xpZW50IG9mXG4gICAgICAgIC8vIHRoaXMgY2xhc3MgdG8gZW5zdXJlIHRoZXkgYXJlIGRlY2xhcmluZyBhIG5pY2VseSBmaXR0ZWQgcmVjdGFuZ3VsYXIgc3RydWN0dXJlIC0gd2UgZG9uJ3QgdmFsaWRhdGUgaXQuXG4gICAgICAgIHdoaWxlIChtb3JlVG9BZGQpIHtcbiAgICAgICAgICAgIG1vcmVUb0FkZCA9IGZhbHNlO1xuICAgICAgICAgICAgY2VsbHMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ3JpZFNwZWMudGFibGVDb2x1bW5TcGVjLmZvckVhY2goKHNwZWMsIGNvbCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjb2xDZWxscywgYywgbmV4dDtcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudFJvd0hlaWdodHNbY29sXSA+IGFkZGluZ0ZvclJvdykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmICgoY29sQ2VsbHMgPSBjZWxsc0ZvckNvbHVtbnNbY29sXSkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGMgPSBjb2xDZWxscy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29sQ2VsbHMubGVuZ3RoKSBtb3JlVG9BZGQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBuZXh0ID0gY29sICsgYy5jb2xzcGFuO1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoY29sIDwgbmV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFJvd0hlaWdodHNbY29sXSA9IGMucm93c3BhbiArIGFkZGluZ0ZvclJvdztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbCsrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNlbGxzLnB1c2goYyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciByID0gbmV3IERhdGFHcmlkRGF0YVJvdyh0aGlzLnJlY29yZElELCBjZWxscyk7XG4gICAgICAgICAgICB0aGlzLmRhdGFHcmlkRGF0YVJvd3MucHVzaChyKTtcbiAgICAgICAgICAgIHRoaXMucm93RWxlbWVudHMucHVzaChyLmdldEVsZW1lbnQoKSk7XG5cbiAgICAgICAgICAgIC8vIGtlZXAgZ29pbmcgaWYgY3VycmVudCByb3cgaXMgbGVzcyB0aGFuIGhpZ2hlc3Qgcm93c3BhblxuICAgICAgICAgICAgbW9yZVRvQWRkID0gKCsrYWRkaW5nRm9yUm93IDwgY3VycmVudFJvd0hlaWdodHMucmVkdWNlKChhLGIpID0+IHsgcmV0dXJuIE1hdGgubWF4KGEsYik7IH0sIDApKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIHJlbW92ZUVsZW1lbnRzKCkge1xuICAgICAgICB0aGlzLmRhdGFHcmlkRGF0YVJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICByb3cucmVtb3ZlRWxlbWVudCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIExpa2UgcmVtb3ZlLCBleGNlcHQgaXQgZG9lc24ndCByZW1vdmUgSlF1ZXJ5IGV2ZW50cyBvciBkYXRhLlxuICAgIC8vIFVzZWQgdG8gdGFrZSB0aGUgdGFibGUgcm93cyB0ZW1wb3JhcmlseSBvdXQgb2YgdGhlIERPTSwgbGlrZSB3aGVuIHJlLW9yZGVyaW5nLlxuICAgIGRldGFjaEVsZW1lbnRzKCkge1xuICAgICAgICB0aGlzLmRhdGFHcmlkRGF0YVJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICByb3cuZGV0YWNoRWxlbWVudCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdldERhdGFHcmlkRGF0YVJvd3MoKTpEYXRhR3JpZERhdGFSb3dbXSB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHMoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5kYXRhR3JpZERhdGFSb3dzO1xuICAgIH1cblxuXG4gICAgZ2V0RWxlbWVudHMoKTpIVE1MRWxlbWVudFtdIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cykge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnJvd0VsZW1lbnRzO1xuICAgIH1cblxuXG4gICAgYXBwbHlTdHJpcGluZyhzdHJpcGVJbmRleDpudW1iZXIpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLmdldERhdGFHcmlkRGF0YVJvd3MoKTtcbiAgICAgICAgdGhpcy5yZWNlbnRTdHJpcGVJbmRleCA9IHN0cmlwZUluZGV4O1xuICAgICAgICByb3dzLmZvckVhY2goKHJvdykgPT4ge1xuICAgICAgICAgICAgdmFyIHJKUSA9IHJvdy5nZXRFbGVtZW50SlEoKTtcbiAgICAgICAgICAgIHJKUS5yZW1vdmVDbGFzcyh0aGlzLnN0cmlwZVN0eWxlc0pvaW4pLmFkZENsYXNzKHRoaXMuc3RyaXBlU3R5bGVzW3N0cmlwZUluZGV4XSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuXG5cbi8vIENvbnRhaW5lciBjbGFzcyBmb3IgZGF0YSByb3dzIGluIHRoZSBib2R5IG9mIHRoZSBEYXRhR3JpZCB0YWJsZS5cbi8vIERhdGFHcmlkIGluc3RhbnRpYXRlcyB0aGVzZSBieSBwYXNzaW5nIGluIGFuIGFycmF5IG9mIHRoZSBEYXRhR3JpZERhdGFDZWxsIG9iamVjdHMgdGhhdCB3aWxsIGZvcm0gdGhlIGNvbnRlbnQgb2YgdGhlIHJvdy5cbmNsYXNzIERhdGFHcmlkRGF0YVJvdyB7XG5cbiAgICByb3dFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHJvd0VsZW1lbnRKUTpKUXVlcnk7XG4gICAgLy8gRGVmaW5lZCBvciBzZXQgYnkgdGhlIGNvbnN0cnVjdG9yXG4gICAgcmVjb3JkSUQ6c3RyaW5nO1xuICAgIGRhdGFHcmlkRGF0YUNlbGxzOkRhdGFHcmlkRGF0YUNlbGxbXTtcbiAgICBjcmVhdGVkRWxlbWVudDpib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoaWQ6c3RyaW5nLCBjZWxsczpEYXRhR3JpZERhdGFDZWxsW10pIHtcbiAgICAgICAgdGhpcy5yZWNvcmRJRCA9IGlkO1xuICAgICAgICB0aGlzLmRhdGFHcmlkRGF0YUNlbGxzID0gY2VsbHM7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnQgPSBmYWxzZTtcbiAgICB9XG5cblxuICAgIGNyZWF0ZUVsZW1lbnQoKSB7XG4gICAgICAgIHZhciByb3dFbDpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0clwiKTtcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpIDwgdGhpcy5kYXRhR3JpZERhdGFDZWxscy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGMgPSB0aGlzLmRhdGFHcmlkRGF0YUNlbGxzW2ldO1xuICAgICAgICAgICAgcm93RWwuYXBwZW5kQ2hpbGQoYy5nZXRFbGVtZW50KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yb3dFbGVtZW50ID0gcm93RWw7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnQgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgcmVtb3ZlRWxlbWVudCgpIHtcbiAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0RWxlbWVudEpRKCkucmVtb3ZlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIExpa2UgcmVtb3ZlLCBleGNlcHQgaXQgZG9lc24ndCByZW1vdmUgSlF1ZXJ5IGV2ZW50cyBvciBkYXRhLlxuICAgIC8vIFVzZWQgdG8gdGFrZSB0aGUgdGFibGUgcm93cyB0ZW1wb3JhcmlseSBvdXQgb2YgdGhlIERPTSwgbGlrZSB3aGVuIHJlLW9yZGVyaW5nLlxuICAgIGRldGFjaEVsZW1lbnQoKSB7XG4gICAgICAgIGlmICh0aGlzLmNyZWF0ZWRFbGVtZW50KSB7XG4gICAgICAgICAgICB0aGlzLmdldEVsZW1lbnRKUSgpLmRldGFjaCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBnZXRFbGVtZW50KCk6SFRNTEVsZW1lbnQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnJvd0VsZW1lbnQ7XG4gICAgfVxuXG5cbiAgICBnZXRFbGVtZW50SlEoKTpKUXVlcnkge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudCgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5yb3dFbGVtZW50SlEpIHtcbiAgICAgICAgICAgIHRoaXMucm93RWxlbWVudEpRID0gJCh0aGlzLnJvd0VsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnJvd0VsZW1lbnRKUTtcbiAgICB9XG59XG5cblxuXG4vLyBDb250YWluZXIgY2xhc3MgZm9yIGNlbGxzIGluIHRoZSBib2R5IG9mIHRoZSBEYXRhR3JpZCB0YWJsZS5cbi8vIERhdGFHcmlkIGNhbGxzIGEgZnVuY3Rpb24gZGVmaW5lZCBpbiBEYXRhR3JpZENvbHVtblNwZWMgb2JqZWN0cyB0byBpbnN0YW50aWF0ZSB0aGVzZSxcbi8vIHBhc3NpbmcgaW4gYSByZWZlcmVuY2UgdG8gdGhlIERhdGFHcmlkU3BlY0Jhc2UgYW5kIGEgdW5pcXVlIGlkZW50aWZpZXIgZm9yIGEgZGF0YSByZWNvcmQuXG5jbGFzcyBEYXRhR3JpZERhdGFDZWxsIHtcblxuICAgIC8vIERlZmluZWQgb3Igc2V0IGJ5IHRoZSBjb25zdHJ1Y3RvclxuICAgIGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2U7XG4gICAgcmVjb3JkSUQ6c3RyaW5nO1xuXG4gICAgLy8gT3B0aW9ucyBwb3RlbnRpYWxseSBzZXQgYnkgdGhlIGNvbnN0cnVjdG9yXG4gICAgcm93c3BhbjpudW1iZXI7XG4gICAgY29sc3BhbjpudW1iZXI7XG4gICAgYWxpZ246c3RyaW5nOyAgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gdHlwZSBvZjogJ2xlZnQnLCAncmlnaHQnLCAnY2VudGVyJ1xuICAgIHZhbGlnbjpzdHJpbmc7ICAgICAgICAgIC8vIFRPRE86IHNob3VsZCBiZSBhbiBlbnVtIHR5cGUgb2Y6ICd0b3AnLCAnbWlkZGxlJywgJ2JvdHRvbScsICdiYXNlbGluZSdcbiAgICBtYXhXaWR0aDpzdHJpbmc7XG4gICAgbWluV2lkdGg6c3RyaW5nO1xuICAgIG5vd3JhcDpib29sZWFuO1xuICAgIGhvdmVyRWZmZWN0OmJvb2xlYW47XG4gICAgY29udGVudEZ1bmN0aW9uOihlOkhUTUxFbGVtZW50LCBpbmRleDpudW1iZXIpPT52b2lkO1xuICAgIGNvbnRlbnRTdHJpbmc6c3RyaW5nO1xuICAgIGNoZWNrYm94V2l0aElEOihpbmRleDpudW1iZXIpPT5zdHJpbmc7XG4gICAgY2hlY2tib3hOYW1lOnN0cmluZztcbiAgICBjdXN0b21JRDooaW5kZXg6bnVtYmVyKT0+c3RyaW5nO1xuICAgIHNpZGVNZW51SXRlbXM6c3RyaW5nW107XG5cbiAgICAvLyBMb2NhbCBkYXRhXG4gICAgY2VsbEVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgY2VsbEVsZW1lbnRKUTpKUXVlcnk7XG4gICAgY29udGVudENvbnRhaW5lckVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgY2hlY2tib3hFbGVtZW50OkhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgaGlkZGVuOmJvb2xlYW47XG4gICAgY3JlYXRlZEVsZW1lbnQ6Ym9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGlkOnN0cmluZywgb3B0Pzp7W2luZGV4OnN0cmluZ106YW55fSkge1xuICAgICAgICB2YXIgZGVmYXVsdHM7XG4gICAgICAgIHRoaXMuZ3JpZFNwZWMgPSBncmlkU3BlYztcbiAgICAgICAgdGhpcy5yZWNvcmRJRCA9IGlkO1xuICAgICAgICB0aGlzLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50ID0gZmFsc2U7XG4gICAgICAgIGRlZmF1bHRzID0ge1xuICAgICAgICAgICAgJ2NvbnRlbnRGdW5jdGlvbic6IChlLCBpbmRleCkgPT4ge30sXG4gICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICcnLFxuICAgICAgICAgICAgJ2FsaWduJzogJ2xlZnQnLFxuICAgICAgICAgICAgJ3Jvd3NwYW4nOiAxLFxuICAgICAgICAgICAgJ2NvbHNwYW4nOiAxXG4gICAgICAgIH07XG4gICAgICAgICQuZXh0ZW5kKHRoaXMsIGRlZmF1bHRzLCBvcHQgfHwge30pO1xuICAgIH1cblxuXG4gICAgY3JlYXRlRWxlbWVudCgpIHtcbiAgICAgICAgdmFyIGlkID0gdGhpcy5yZWNvcmRJRCxcbiAgICAgICAgICAgIGM6SFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGRcIiksXG4gICAgICAgICAgICBjaGVja0lkOnN0cmluZywgY2hlY2tOYW1lOnN0cmluZywgbWVudTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tib3hXaXRoSUQpIHtcbiAgICAgICAgICAgIGNoZWNrSWQgPSB0aGlzLmNoZWNrYm94V2l0aElELmNhbGwodGhpcy5ncmlkU3BlYywgaWQpO1xuICAgICAgICAgICAgY2hlY2tOYW1lID0gdGhpcy5jaGVja2JveE5hbWUgfHwgY2hlY2tJZDtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tib3hFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tib3hFbGVtZW50LnNldEF0dHJpYnV0ZSgndHlwZScsICdjaGVja2JveCcpO1xuICAgICAgICAgICAgJCh0aGlzLmNoZWNrYm94RWxlbWVudCkuYXR0cih7XG4gICAgICAgICAgICAgICAgJ2lkJzogY2hlY2tJZCwgJ25hbWUnOiBjaGVja05hbWUsICd2YWx1ZSc6IGlkLnRvU3RyaW5nKClcbiAgICAgICAgICAgIH0pLmFwcGVuZFRvKGMpO1xuICAgICAgICAgICAgdGhpcy5jb250ZW50Q29udGFpbmVyRWxlbWVudCA9ICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCBjaGVja0lkKS5hcHBlbmRUbyhjKVswXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29udGVudENvbnRhaW5lckVsZW1lbnQgPSAkKCc8c3Bhbj4nKS5hcHBlbmRUbyhjKVswXTtcbiAgICAgICAgfVxuICAgICAgICAkKHRoaXMuY29udGVudENvbnRhaW5lckVsZW1lbnQpLmh0bWwodGhpcy5jb250ZW50U3RyaW5nKTtcbiAgICAgICAgdGhpcy5jb250ZW50RnVuY3Rpb24uY2FsbCh0aGlzLmdyaWRTcGVjLCB0aGlzLmNvbnRlbnRDb250YWluZXJFbGVtZW50LCBpZCk7XG4gICAgICAgIGlmICh0aGlzLnNpZGVNZW51SXRlbXMgJiYgdGhpcy5zaWRlTWVudUl0ZW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgbWVudSA9ICQoJzx1bD4nKS5hZGRDbGFzcygncG9wdXBtZW51JykuYXBwZW5kVG8oYyk7XG4gICAgICAgICAgICB0aGlzLnNpZGVNZW51SXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgICAgICQoJzxsaT4nKS5odG1sKGl0ZW0pLmFwcGVuZFRvKG1lbnUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2VsbENsYXNzZXMgPSBbXTtcblxuICAgICAgICBpZiAodGhpcy5jb2xzcGFuID4gMSkge1xuICAgICAgICAgICAgYy5zZXRBdHRyaWJ1dGUoJ2NvbHNwYW4nLCB0aGlzLmNvbHNwYW4udG9TdHJpbmcoMTApKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5yb3dzcGFuID4gMSkge1xuICAgICAgICAgICAgYy5zZXRBdHRyaWJ1dGUoJ3Jvd3NwYW4nLCB0aGlzLnJvd3NwYW4udG9TdHJpbmcoMTApKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5jdXN0b21JRCkge1xuICAgICAgICAgICAgYy5zZXRBdHRyaWJ1dGUoJ2lkJywgdGhpcy5jdXN0b21JRC5jYWxsKHRoaXMuZ3JpZFNwZWMsIGlkKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5ob3ZlckVmZmVjdCkge1xuICAgICAgICAgICAgY2VsbENsYXNzZXMucHVzaCgncG9wdXBjZWxsJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMubm93cmFwKSB7XG4gICAgICAgICAgICBjZWxsQ2xhc3Nlcy5wdXNoKCdub3dyYXAnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5taW5XaWR0aCkge1xuICAgICAgICAgICAgYy5zdHlsZS5taW5XaWR0aCA9IHRoaXMubWluV2lkdGggKyAncHgnO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm1heFdpZHRoKSB7XG4gICAgICAgICAgICBjLnN0eWxlLm1heFdpZHRoID0gdGhpcy5tYXhXaWR0aCArICdweCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYWxpZ24pIHtcbiAgICAgICAgICAgIGMuc3R5bGUudGV4dEFsaWduID0gdGhpcy5hbGlnbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy52YWxpZ24pIHtcbiAgICAgICAgICAgIGMuc3R5bGUudmVydGljYWxBbGlnbiA9IHRoaXMudmFsaWduO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmhpZGRlbikge1xuICAgICAgICAgICAgY2VsbENsYXNzZXMucHVzaCgnb2ZmJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2VsbENsYXNzZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYy5jbGFzc05hbWUgPSBjZWxsQ2xhc3Nlcy5qb2luKCcgJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jZWxsRWxlbWVudCA9IGM7XG4gICAgICAgIHRoaXMuY2VsbEVsZW1lbnRKUSA9ICQoYyk7XG5cbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudCA9IHRydWU7XG4gICAgfVxuXG5cbiAgICBnZXRFbGVtZW50KCk6SFRNTEVsZW1lbnQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNlbGxFbGVtZW50O1xuICAgIH1cblxuXG4gICAgZ2V0Q2hlY2tib3hFbGVtZW50KCk6SFRNTElucHV0RWxlbWVudCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudCkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2hlY2tib3hFbGVtZW50IHx8IG51bGw7XG4gICAgfVxuXG5cbiAgICBoaWRlKCk6dm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5oaWRkZW4pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmNyZWF0ZWRFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jZWxsRWxlbWVudEpRLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgdW5oaWRlKCk6dm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmhpZGRlbikge1xuICAgICAgICAgICAgaWYgKHRoaXMuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNlbGxFbGVtZW50SlEucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5oaWRkZW4gPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG4vLyBBIHBsYWNlaG9sZGVyIGNlbGwgd2hlbiBkYXRhIGlzIHN0aWxsIGxvYWRpbmdcbmNsYXNzIERhdGFHcmlkTG9hZGluZ0NlbGwgZXh0ZW5kcyBEYXRhR3JpZERhdGFDZWxsIHtcbiAgICBjb25zdHJ1Y3RvcihncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBpZDpzdHJpbmcsIG9wdD86e1tpbmRleDpzdHJpbmddOmFueX0pIHtcbiAgICAgICAgc3VwZXIoZ3JpZFNwZWMsIGlkLCBvcHQpO1xuICAgICAgICB0aGlzLmNvbnRlbnRTdHJpbmcgPSAnPHNwYW4gY2xhc3M9XCJsb2FkaW5nXCI+TG9hZGluZy4uLjwvc3Bhbj4nO1xuICAgIH1cbn1cblxuXG4vLyBBIGdlbmVyYWwgY2xhc3MgdGhhdCBhY3RzIGFzIGEgY29tbW9uIHJlcG9zaXRvcnkgZm9yIHV0aWxpdHkgZnVuY3Rpb25zIGZvciBEYXRhR3JpZCB3aWRnZXRzLlxuLy8gSXQgaXMgaW1tZWRpYXRlbHkgc3ViY2xhc3NlZCBpbnRvIERhdGFHcmlkT3B0aW9uV2lkZ2V0IGFuZCBEYXRhR3JpZEhlYWRlcldpZGdldC5cbmNsYXNzIERhdGFHcmlkV2lkZ2V0IHtcblxuICAgIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlO1xuICAgIGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QgPSBkYXRhR3JpZE93bmVyT2JqZWN0O1xuICAgICAgICB0aGlzLmRhdGFHcmlkU3BlYyA9IGRhdGFHcmlkU3BlYztcbiAgICB9XG5cblxuICAgIC8vIFV0aWxpdHkgZnVuY3Rpb24gdG8gY3JlYXRlIGEgbGFiZWwgZWxlbWVudFxuICAgIF9jcmVhdGVMYWJlbCh0ZXh0OnN0cmluZywgaWQ6c3RyaW5nKTpIVE1MRWxlbWVudCB7XG4gICAgICAgIHZhciBsYWJlbDpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsYWJlbFwiKTtcbiAgICAgICAgbGFiZWwuc2V0QXR0cmlidXRlKCdmb3InLCBpZCk7XG4gICAgICAgIGxhYmVsLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpKTtcbiAgICAgICAgcmV0dXJuIGxhYmVsO1xuICAgIH1cblxuXG4gICAgLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBjcmVhdGUgYSBjaGVja2JveCBlbGVtZW50XG4gICAgX2NyZWF0ZUNoZWNrYm94KGlkOnN0cmluZywgbmFtZTpzdHJpbmcsIHZhbHVlOnN0cmluZyk6SFRNTElucHV0RWxlbWVudCB7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2lkJywgaWQpO1xuICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ25hbWUnLCBuYW1lKTtcbiAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2NoZWNrYm94Jyk7XG4gICAgICAgIGNiLnNldEF0dHJpYnV0ZSgndmFsdWUnLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBjYjtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdpdGggYW4gYXJyYXkgb2Ygcm93IGVsZW1lbnRzLCBhbmQgdGhlIElEIHRoZXkgcmVwcmVzZW50LCBzbyB0aGUgd2lkZ2V0IGNhblxuICAgIC8vICBhcHBseSBhbnkgY3VzdG9tIHN0eWxpbmcgaXQgbmVlZHMuIEl0IGlzIGNhbGxlZCBvbmUgdGltZSBmb3IgZWFjaCBJRCBhbmQgcmVzcGVjdGl2ZSByb3dcbiAgICAvLyAgYXJyYXksIGR1cmluZyB0aGUgY29uc3RydWN0aW9uIG9mIHRoZSB0YWJsZSByb3dzLlxuICAgIGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOkRhdGFHcmlkRGF0YVJvd1tdLCByb3dJRDpzdHJpbmcpOnZvaWQge1xuICAgICAgICAvLyBubyBzcGVjaWFsIGZvcm1hdHRpbmcgYnkgZGVmYXVsdFxuICAgIH1cblxuXG4gICAgLy8gTm90aWZ5IHRoZSB3aWRnZXQgdGhhdCB0aGUgRGF0YUdyaWQgaGFzIGJlZW4gdXBkYXRlZFxuICAgIHJlZnJlc2hXaWRnZXQoKTp2b2lkIHtcbiAgICAgICAgLy8gbm90aGluZyBieSBkZWZhdWx0XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyB0aGUgYmFzZSBjbGFzcyBmb3IgYWRkaXRpb25hbCB3aWRnZXRzIHRoYXQgYXBwZWFyIGluIHRoZSBvcHRpb25zIG1lbnUgb2YgYSBEYXRhR3JpZCB0YWJsZS5cbi8vIFRoZSBkZWZhdWx0IGJlaGF2aW9yIGlzIHRvIGNyZWF0ZSBhIGNoZWNrYm94IGVsZW1lbnQgd2l0aCBhIGNhbGxiYWNrLCBhbmQgcGFpciBpdCB3aXRoIGEgbGFiZWwgZWxlbWVudC5cbi8vXG4vLyBFYWNoIERhdGFHcmlkT3B0aW9uV2lkZ2V0IG5lZWRzIHRvIGltcGxlbWVudCBhbiBhcHBseUZpbHRlclRvSURzIGZ1bmN0aW9uIHRvIHByb3ZpZGUgc29tZSBtZXRob2QgZm9yIGZpbHRlcmluZ1xuLy8gYSBnaXZlbiBsaXN0IG9mIElEcy4gIFRoaXMgaXMgaG93IHRoZSB3aWRnZXQgYWZmZWN0cyB3aGljaCByb3dzIGFyZSBkaXNwbGF5ZWQgaW4gdGhlIHRhYmxlLlxuLy9cbi8vIFRoZSBEYXRhR3JpZFNwZWMgaXMgcmVzcG9uc2libGUgZm9yIGluc3RhbnRpYXRpbmcgdGhlc2UgRGF0YUdyaWRPcHRpb25XaWRnZXQtZGVyaXZlZCBvYmplY3RzIGZvciBhIHBhcnRpY3VsYXIgdGFibGUsXG4vLyBhbmQgdGhlIERhdGFHcmlkIG9iamVjdCBpcyByZXNwb25zaWJsZSBmb3IgYnVpbGRpbmcgdGhlIG9wdGlvbnMgbWVudSB0aGF0IHdpbGwgc3RvcmUgdGhlIGNoZWNrYm94IGFuZCBsYWJlbCBlbGVtZW50cy5cbmNsYXNzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRXaWRnZXQge1xuXG4gICAgX2NyZWF0ZWRFbGVtZW50czpib29sZWFuO1xuICAgIC8vIFRoZSBiYXNlIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHByb3ZpZGVzIHRlbXBsYXRlIGNvZGUgYW5kIHN0cnVjdHVyZSBmb3IgY3JlYXRpbmcgYSBjaGVja2JveCB3aXRoIGEgbGFiZWwsXG4gICAgLy8gYnV0IG90aGVyIFVJIGNhbiBiZSBjcmVhdGVkIGFuZCB1c2VkIGluc3RlYWQuXG4gICAgY2hlY2tCb3hFbGVtZW50OkhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgbGFiZWxFbGVtZW50OkhUTUxFbGVtZW50O1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gZmFsc2U7XG4gICAgfVxuXG5cbiAgICAvLyBSZXR1cm4gYSBmcmFnbWVudCB0byB1c2UgaW4gZ2VuZXJhdGluZyBvcHRpb24gd2lkZ2V0IElEc1xuICAgIGdldElERnJhZ21lbnQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ0dlbmVyaWNPcHRpb25DQic7XG4gICAgfVxuXG5cbiAgICAvLyBSZXR1cm4gdGV4dCB1c2VkIHRvIGxhYmVsIHRoZSB3aWRnZXRcbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ05hbWUgT2YgT3B0aW9uJztcbiAgICB9XG5cblxuICAgIC8vIEhhbmRsZSBhY3RpdmF0aW9uIG9mIHdpZGdldFxuICAgIG9uV2lkZ2V0Q2hhbmdlKGUpOnZvaWQge1xuICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY2xpY2tlZE9wdGlvbldpZGdldChlKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zXG4gICAgLy8gd2hlbiBjcmVhdGluZyBpbnB1dCBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOnN0cmluZyk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCt0aGlzLmdldElERnJhZ21lbnQoKSt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAvLyBXZSBuZWVkIHRvIG1ha2Ugc3VyZSB0aGUgY2hlY2tib3ggaGFzIGEgY2FsbGJhY2sgdG8gdGhlIERhdGFHcmlkJ3MgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgLy8gQW1vbmcgb3RoZXIgdGhpbmdzLCB0aGUgaGFuZGxlciBmdW5jdGlvbiB3aWxsIGNhbGwgdGhlIGFwcHJvcHJpYXRlIGZpbHRlcmluZyBmdW5jdGlvbnMgZm9yIGFsbCB0aGUgd2lkZ2V0cyBpbiB0dXJuLlxuICAgICAgICAkKGNiKS5vbignY2hhbmdlLmRhdGFncmlkJywgKGUpID0+IHRoaXMub25XaWRnZXRDaGFuZ2UoZSkgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCh0aGlzLmdldExhYmVsVGV4dCgpLCBjYklEKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgLy8gSWYgdGhlIGVsZW1lbnRzIGhhdmUgbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjpIVE1MRWxlbWVudCwgdW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLl9jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmNoZWNrQm94RWxlbWVudCk7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmxhYmVsRWxlbWVudCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aXRoIGFuIGFycmF5IG9mIElEcyBmb3IgZmlsdGVyaW5nLCBhbmQgYSBmaWx0ZXJlZCBhcnJheSBpcyByZXR1cm5lZC5cbiAgICAvLyBJdCBpcyBhY2NlcHRhYmxlIHRvIGp1c3QgcmV0dXJuIHRoZSBvcmlnaW5hbCBhcnJheSBpZiBubyBmaWx0ZXJpbmcgbmVlZHMgdG8gYmUgZG9uZS5cbiAgICAvL1xuICAgIC8vIEl0J3MgdXAgdG8gdGhlIGRlc2lnbmVyIHRvIGRlY2lkZSBob3cgdGhlIHN0YXRlIG9mIHRoZSB3aWRnZXQgYWZmZWN0cyBmaWx0ZXJpbmcuXG4gICAgLy8gRm9yIGV4YW1wbGUsIGlmIHRoZSB3aWRnZXQgaXMgXCJhZGRpdGl2ZVwiLCB5b3Ugd291bGQgYXBwbHkgZmlsdGVyaW5nIGlmIHRoZSB3aWRnZXQncyBjaGVja2JveFxuICAgIC8vIGlzIGNsZWFyLCBhbmQgc2tpcCBmaWx0ZXJpbmcgaWYgdGhlIGNoZWNrYm94IGlzIHNldCwgY3JlYXRpbmcgdGhlIGFwcGVhcmFuY2Ugb2YgYSBjaGVja2JveFxuICAgIC8vIHRoYXQgXCJhZGRzXCIgcm93cyB3aGVuIGNoZWNrZWQuXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICB9XG5cblxuICAgIC8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgY29udHJvbCBpcyBlbmFibGVkXG4gICAgZ2V0U3RhdGUoKTpib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hlY2tCb3hFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY2hlY2tlZCcpO1xuICAgIH1cblxuXG4gICAgLy8gUmV0dXJucyB0cnVlIGlmIHRoZSBjb250cm9sIHNob3VsZCBiZSBlbmFibGVkIGJ5IGRlZmF1bHRcbiAgICBpc0VuYWJsZWRCeURlZmF1bHQoKTpib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuXG4gICAgLy8gU2V0cyB0aGUgZW5hYmxlZCBzdGF0ZSB0byB0cnVlIG9yIGZhbHNlLCBiYXNlZCBvbiB0aGUgZ2l2ZW4gdmFsdWVcbiAgICBzZXRTdGF0ZShlbmFibGVkOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICBpZiAoZW5hYmxlZCkge1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyB0aGUgYmFzZSBjbGFzcyBmb3IgYWRkaXRpb25hbCB3aWRnZXRzIHRoYXQgYXBwZWFyIGluIHRoZSBoZWFkZXIgYXJlYSBvZiBhIERhdGFHcmlkIHRhYmxlLlxuLy9cbi8vIFRoZSBEYXRhR3JpZFNwZWMgaXMgcmVzcG9uc2libGUgZm9yIGluc3RhbnRpYXRpbmcgdGhlc2UgRGF0YUdyaWRPcHRpb25XaWRnZXQtZGVyaXZlZCBvYmplY3RzIGZvciBhIHBhcnRpY3VsYXIgdGFibGUsXG4vLyBhbmQgdGhlIERhdGFHcmlkIG9iamVjdCBpcyByZXNwb25zaWJsZSBmb3IgYnVpbGRpbmcgdGhlIGhlYWRlciBhcmVhIHRoYXQgd2lsbCBjb250YWluIHRoZSB3aWRnZXRzLlxuY2xhc3MgRGF0YUdyaWRIZWFkZXJXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZFdpZGdldCB7XG5cbiAgICBwcml2YXRlIF9jcmVhdGVkRWxlbWVudHM6Ym9vbGVhbjtcbiAgICAvLyBXaGV0aGVyIHRvIGFkZCB0aGlzIHdpZGdldCB0byB0aGUgaGVhZGVyIG9mIHRoZSB0YWJsZSBiZWZvcmUgdGhlIHZpZXcgbWVudSwgaW5zdGVhZCBvZiB0aGUgZGVmYXVsdCBvZiBhZnRlci5cbiAgICAvLyBUaGlzIG9wdGlvbiBpcyBzZXQgYnkgYW4gYWNjZXNzb3IgZnVuY3Rpb24gbWVhbnQgdG8gYmUgY2FsbGVkIHNob3J0bHkgYWZ0ZXIgaW5zdGFudGlhdGlvbi5cbiAgICBwcml2YXRlIF9kaXNwbGF5QmVmb3JlVmlld01lbnVGbGFnOmJvb2xlYW47XG4gICAgLy8gVGhlIGJhc2UgRGF0YUdyaWRIZWFkZXJXaWRnZXQgcHJvdmlkZXMgdGVtcGxhdGUgY29kZSB0aGF0IGp1c3QgY3JlYXRlcyBhIHRleHQgZmllbGQsXG4gICAgLy8gYnV0IG90aGVyIFVJIGNhbiBiZSBjcmVhdGVkIGFuZCB1c2VkIGluc3RlYWQuXG4gICAgZWxlbWVudDpIVE1MRWxlbWVudDtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5fZGlzcGxheUJlZm9yZVZpZXdNZW51RmxhZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSBmYWxzZTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zXG4gICAgLy8gd2hlbiBjcmVhdGluZyBpbnB1dCBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOnN0cmluZyk6dm9pZCB7XG4gICAgICAgIHZhciB0Qm94SUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkICsgJ3RleHQnICsgdW5pcXVlSUQ7XG4gICAgICAgIHZhciB0Qm94ID0gJCh0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIikpXG4gICAgICAgICAgICAuYXR0cih7ICdpZCc6IHRCb3hJRCwgJ25hbWUnOiB0Qm94SUQsICdzaXplJzogJzIwJyB9KVxuICAgICAgICAgICAgLmFkZENsYXNzKCd0YWJsZUNvbnRyb2wnKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgLy8gSWYgdGhlIGVsZW1lbnRzIGhhdmUgbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjpIVE1MRWxlbWVudCwgdW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLl9jcmVhdGVkRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgfVxuXG5cbiAgICBjcmVhdGVkRWxlbWVudHMoKTpib29sZWFuO1xuICAgIGNyZWF0ZWRFbGVtZW50cyhmbGFnOmJvb2xlYW4pOkRhdGFHcmlkSGVhZGVyV2lkZ2V0O1xuICAgIGNyZWF0ZWRFbGVtZW50cyhmbGFnPzpib29sZWFuKTphbnkge1xuICAgICAgICBpZiAoZmxhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY3JlYXRlZEVsZW1lbnRzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gZmxhZztcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gV2hldGhlciB0byBhZGQgdGhpcyB3aWRnZXQgdG8gdGhlIGhlYWRlciBvZiB0aGUgdGFibGUgYmVmb3JlIHRoZSB2aWV3IG1lbnUsIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgb2YgYWZ0ZXIuXG4gICAgLy8gUGFzcyBpbiBcImZhbHNlXCIgdG8gcmV2ZXJzZSB0aGUgc2V0dGluZy5cbiAgICBkaXNwbGF5QmVmb3JlVmlld01lbnUoKTpib29sZWFuO1xuICAgIGRpc3BsYXlCZWZvcmVWaWV3TWVudShmbGFnOmJvb2xlYW4pOkRhdGFHcmlkSGVhZGVyV2lkZ2V0O1xuICAgIGRpc3BsYXlCZWZvcmVWaWV3TWVudShmbGFnPzpib29sZWFuKTphbnkge1xuICAgICAgICBpZiAoZmxhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZGlzcGxheUJlZm9yZVZpZXdNZW51RmxhZztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2Rpc3BsYXlCZWZvcmVWaWV3TWVudUZsYWcgPSBmbGFnO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdpdGggYW4gYXJyYXkgb2YgcmVjb3JkIElEcyBmb3IgZmlsdGVyaW5nLCBhbmQgYSBmaWx0ZXJlZCBhcnJheSBpcyByZXR1cm5lZC5cbiAgICAvLyBJdCBpcyBhY2NlcHRhYmxlIHRvIGp1c3QgcmV0dXJuIHRoZSBvcmlnaW5hbCBhcnJheSBpZiBubyByZWNvcmQgZmlsdGVyaW5nIG5lZWRzIHRvIGJlIGRvbmUuXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICB9XG59XG5cblxuXG4vLyBBIGdlbmVyaWMgXCJTZWxlY3QgQWxsXCIgaGVhZGVyIHdpZGdldCwgYXBwZWFyaW5nIGFzIGEgYnV0dG9uLlxuLy8gV2hlbiBjbGlja2VkLCBpdCB3YWxrcyB0aHJvdWdoIGV2ZXJ5IHJvdyBhbmQgY2VsbCBsb29raW5nIGZvciBEYXRhR3JpZC1jcmVhdGVkIGNoZWNrYm94ZXMsXG4vLyBhbmQgY2hlY2tzIGV2ZXJ5IG9uZSBpdCBmaW5kcy5cbmNsYXNzIERHU2VsZWN0QWxsV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRIZWFkZXJXaWRnZXQge1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zXG4gICAgLy8gd2hlbiBjcmVhdGluZyBpbnB1dCBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOnN0cmluZyk6dm9pZCB7XG4gICAgICAgIHZhciBidXR0b25JRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAnU2VsQWxsJyArIHVuaXF1ZUlEO1xuICAgICAgICB2YXIgYnV0dG9uID0gJCh0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIikpO1xuICAgICAgICBidXR0b24uYXR0cih7ICdpZCc6IGJ1dHRvbklELCAnbmFtZSc6IGJ1dHRvbklELCAndmFsdWUnOiAnU2VsZWN0IEFsbCcgfSlcbiAgICAgICAgICAgIC5hZGRDbGFzcygndGFibGVDb250cm9sJylcbiAgICAgICAgICAgIC5jbGljaygoKSA9PiB0aGlzLmNsaWNrSGFuZGxlcigpKTtcbiAgICAgICAgdGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgndHlwZScsICdidXR0b24nKTsgLy8gSlF1ZXJ5IGF0dHIgY2Fubm90IGRvIHRoaXNcbiAgICB9XG5cblxuICAgIGNsaWNrSGFuZGxlcigpOnZvaWQge1xuICAgICAgICB2YXIgc2VxdWVuY2UgPSB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY3VycmVudFNlcXVlbmNlKCk7XG4gICAgICAgIC8vIEhhdmUgRGF0YUdyaWQgYXBwbHkgZnVuY3Rpb24gdG8gZXZlcnl0aGluZyBpbiBjdXJyZW50IHNlcXVlbmNlXG4gICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5hcHBseVRvUmVjb3JkU2V0KChyb3dzKSA9PiB7XG4gICAgICAgICAgICAvLyBlYWNoIHJvdyBpbiBzZXF1ZW5jZVxuICAgICAgICAgICAgcm93cy5mb3JFYWNoKChyb3cpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBlYWNoIGNlbGwgaW4gcm93XG4gICAgICAgICAgICAgICAgcm93LmRhdGFHcmlkRGF0YUNlbGxzLmZvckVhY2goKGNlbGwpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIGNlbGwgaGFzIGEgY2hlY2tib3gsIGNoZWNrIGl0XG4gICAgICAgICAgICAgICAgICAgIGNlbGwuY2hlY2tib3hFbGVtZW50ICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAoY2VsbC5jaGVja2JveEVsZW1lbnQuY2hlY2tlZCA9IHRydWUpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAkKGNlbGwuY2hlY2tib3hFbGVtZW50KS50cmlnZ2VyKCdjaGFuZ2UnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBzZXF1ZW5jZSk7XG4gICAgfVxufVxuXG5cblxuLy8gSGVyZSdzIGFuIGV4YW1wbGUgb2YgYSB3b3JraW5nIERhdGFHcmlkSGVhZGVyV2lkZ2V0LlxuLy8gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG5hcnJvd3MgdGhlIHNldCBvZiByb3dzIHRvIG9uZXMgdGhhdCBjb250YWluIHRoZSBnaXZlbiBzdHJpbmcuXG5jbGFzcyBER1NlYXJjaFdpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIHNlYXJjaEJveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcbiAgICBwbGFjZUhvbGRlcjpzdHJpbmc7XG4gICAgZmllbGRTaXplOm51bWJlcjtcbiAgICB0eXBpbmdUaW1lb3V0Om51bWJlcjtcbiAgICB0eXBpbmdEZWxheTpudW1iZXI7XG4gICAgbGFzdEtleVByZXNzQ29kZTpudW1iZXI7XG4gICAgcHJldmlvdXNTZWxlY3Rpb246c3RyaW5nO1xuICAgIG1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoOm51bWJlcjtcbiAgICBnZXRzRm9jdXM6Ym9vbGVhbjsgICAgLy8gSWYgdHJ1ZSwgdGhlIHNlYXJjaCBib3ggc2hvdWxkIGJlIGNvbmZpZ3VyZWQgdG8gY2xhaW0gZm9jdXMgYXMgc29vbiBhcyB0aGUgcGFnZSBpcyBsb2FkZWRcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIHBsYWNlSG9sZGVyOnN0cmluZywgc2l6ZTpudW1iZXIsIGdldHNGb2N1czpib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMucGxhY2VIb2xkZXIgPSBwbGFjZUhvbGRlcjtcbiAgICAgICAgdGhpcy5maWVsZFNpemUgPSBzaXplO1xuICAgICAgICB0aGlzLmdldHNGb2N1cyA9IGdldHNGb2N1cztcbiAgICAgICAgdGhpcy50eXBpbmdUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgdGhpcy50eXBpbmdEZWxheSA9IDMzMDtcbiAgICAgICAgdGhpcy5sYXN0S2V5UHJlc3NDb2RlID0gbnVsbDtcbiAgICAgICAgdGhpcy5wcmV2aW91c1NlbGVjdGlvbiA9IG51bGw7XG4gICAgICAgIHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2ggPSAxO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnNcbiAgICAvLyB3aGVuIGNyZWF0aW5nIGlucHV0IGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdmFyIHNCb3hJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAnU2VhcmNoQm94JyArIHVuaXF1ZUlEO1xuICAgICAgICB2YXIgc0JveDpKUXVlcnkgPSAkKHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSlcbiAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogc0JveElELCAnbmFtZSc6IHNCb3hJRCwgJ3NpemUnOiB0aGlzLmZpZWxkU2l6ZSwgJ3BsYWNlaG9sZGVyJzogdGhpcy5wbGFjZUhvbGRlciB9KVxuICAgICAgICAgICAgLmFkZENsYXNzKCd0YWJsZUNvbnRyb2wgc2VhcmNoQm94Jykua2V5ZG93bigoZSkgPT4gdGhpcy5pbnB1dEtleURvd25IYW5kbGVyKGUpKTtcbiAgICAgICAgdGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0Jyk7IC8vIEpRdWVyeSAuYXR0cigpIGNhbm5vdCBzZXQgdGhpc1xuICAgICAgICBpZiAodGhpcy5nZXRzRm9jdXMpIHtcbiAgICAgICAgICAgIHNCb3guYXR0cignYXV0b2ZvY3VzJywgJ2F1dG9mb2N1cycpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBpbnB1dEtleURvd25IYW5kbGVyKGUpIHtcbiAgICAgICAgLy8gdHJhY2sgbGFzdCBrZXkgcHJlc3NlZFxuICAgICAgICB0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPSBlLmtleUNvZGU7XG4gICAgICAgIHN3aXRjaCAoZS5rZXlDb2RlKSB7XG4gICAgICAgICAgICBjYXNlIDM4OiAvLyB1cFxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgNDA6IC8vIGRvd25cbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDk6ICAvLyB0YWJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgMTM6IC8vIHJldHVyblxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudHlwaW5nVGltZW91dCkge1xuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50eXBpbmdUaW1lb3V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy50eXBpbmdUaW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLnR5cGluZ0RlbGF5RXhwaXJhdGlvbkhhbmRsZXIsIHRoaXMudHlwaW5nRGVsYXkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyAoTm90ZTogVGhpcyBzeW50YXggY2F1c2VzIFwidGhpc1wiIHRvIGJlaGF2ZSBpbiBhIG5vbi1KYXZhc2NyaXB0IHdheVxuICAgIC8vIHNlZSBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzE2MTU3ODM5L3R5cGVzY3JpcHQtdGhpcy1pbnNpZGUtYS1jbGFzcy1tZXRob2QgKVxuICAgIHR5cGluZ0RlbGF5RXhwaXJhdGlvbkhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICAgIC8vIGlnbm9yZSBpZiB0aGUgZm9sbG93aW5nIGtleXMgYXJlIHByZXNzZWQ6IFtkZWxdIFtzaGlmdF0gW2NhcHNsb2NrXVxuICAgICAgICAvL2lmICh0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPT0gNDYpIHtcbiAgICAgICAgLy8gICAgcmV0dXJuO1xuICAgICAgICAvL31cbiAgICAgICAgLy8gaWdub3JlIGlmIHRoZSBmb2xsb3dpbmcga2V5cyBhcmUgcHJlc3NlZDogW2RlbF0gW3NoaWZ0XSBbY2Fwc2xvY2tdXG4gICAgICAgIGlmICh0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPiA4ICYmIHRoaXMubGFzdEtleVByZXNzQ29kZSA8IDMyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHYgPSAkKHRoaXMuZWxlbWVudCkudmFsKCk7XG4gICAgICAgIGlmICh2ID09IHRoaXMucHJldmlvdXNTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnByZXZpb3VzU2VsZWN0aW9uID0gdjtcbiAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmNsaWNrZWRIZWFkZXJXaWRnZXQodGhpcyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aXRoIGFuIGFycmF5IG9mIHJlY29yZCBJRHMgZm9yIGZpbHRlcmluZywgYW5kIGEgZmlsdGVyZWQgYXJyYXkgaXMgcmV0dXJuZWQuXG4gICAgLy8gSXQgaXMgYWNjZXB0YWJsZSB0byBqdXN0IHJldHVybiB0aGUgb3JpZ2luYWwgYXJyYXkgaWYgbm8gcmVjb3JkIGZpbHRlcmluZyBuZWVkcyB0byBiZSBkb25lLlxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIHYgPSB0aGlzLnByZXZpb3VzU2VsZWN0aW9uO1xuICAgICAgICBpZiAodiA9PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gcm93SURzO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2Lmxlbmd0aCA8IHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2gpIHtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH1cblxuICAgICAgICB2ID0gdi50cmltKCk7ICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4gICAgICAgIHYgPSB2LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHYgPSB2LnJlcGxhY2UoL1xcc1xccyovLCAnICcpOyAvLyBSZXBsYWNlIGludGVybmFsIHdoaXRlc3BhY2Ugd2l0aCBzaW5nbGUgc3BhY2VzXG5cbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIG11bHRpcGxlIHdvcmRzLCB3ZSBtYXRjaCBlYWNoIHNlcGFyYXRlbHkuXG4gICAgICAgIC8vIFdlIHdpbGwgbm90IGF0dGVtcHQgdG8gbWF0Y2ggYWdhaW5zdCBlbXB0eSBzdHJpbmdzLCBzbyB3ZSBmaWx0ZXIgdGhvc2Ugb3V0IGlmIGFueSBzbGlwcGVkIHRocm91Z2hcbiAgICAgICAgdmFyIHF1ZXJ5U3RycyA9IHYuc3BsaXQoJyAnKS5maWx0ZXIoKG9uZSkgPT4geyByZXR1cm4gb25lLmxlbmd0aCA+IDA7IH0pO1xuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuYXBwbHlUb1JlY29yZFNldCgocm93cywgaWQpID0+IHtcbiAgICAgICAgICAgIHJvd3MuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgcm93LmRhdGFHcmlkRGF0YUNlbGxzLmZvckVhY2goKGNlbGwpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNlbGwuY3JlYXRlZEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0ZXh0ID0gY2VsbC5jb250ZW50Q29udGFpbmVyRWxlbWVudC50ZXh0Q29udGVudC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gcXVlcnlTdHJzLnNvbWUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBTaG9sZG4ndCB0aGlzIGJlIHRleHQubGVuZ3RoID49IHYubGVuZ3RoID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGV4dC5sZW5ndGggPiB2Lmxlbmd0aCAmJiB0ZXh0LmluZGV4T2YodikgPj0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCByb3dJRHMpO1xuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxufVxuXG5cbmNsYXNzIERhdGFHcmlkU29ydCB7XG4gICAgc3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG4gICAgYXNjOmJvb2xlYW47XG59XG5pbnRlcmZhY2UgREdQYWdlRGF0YVNvdXJjZSB7XG5cbiAgICBwYWdlU2l6ZSgpOm51bWJlcjtcbiAgICBwYWdlU2l6ZShzaXplOm51bWJlcik6REdQYWdlRGF0YVNvdXJjZTtcbiAgICBwYWdlU2l6ZShzaXplPzpudW1iZXIpOmFueTtcbiAgICB0b3RhbE9mZnNldCgpOm51bWJlcjtcbiAgICB0b3RhbE9mZnNldChvZmZzZXQ6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHRvdGFsT2Zmc2V0KG9mZnNldD86bnVtYmVyKTphbnk7XG4gICAgdG90YWxTaXplKCk6bnVtYmVyO1xuICAgIHRvdGFsU2l6ZShzaXplOm51bWJlcik6REdQYWdlRGF0YVNvdXJjZTtcbiAgICB0b3RhbFNpemUoc2l6ZT86bnVtYmVyKTphbnk7XG4gICAgdmlld1NpemUoKTpudW1iZXI7XG4gICAgcXVlcnkoKTpzdHJpbmc7XG4gICAgcXVlcnkocXVlcnk6c3RyaW5nKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHF1ZXJ5KHF1ZXJ5PzpzdHJpbmcpOmFueTtcbiAgICBmaWx0ZXIoKTphbnk7XG4gICAgZmlsdGVyKG9wdDphbnkpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgZmlsdGVyKG9wdD86YW55KTphbnk7XG4gICAgcGFnZURlbHRhKGRlbHRhOm51bWJlcik6REdQYWdlRGF0YVNvdXJjZTtcbiAgICByZXF1ZXN0UGFnZU9mRGF0YShjYWxsYmFjaz86KHN1Y2Nlc3M6Ym9vbGVhbikgPT4gdm9pZCk6REdQYWdlRGF0YVNvdXJjZTtcblxufVxuXG5cblxuLy8gVGhpcyBpcyBhIHdpZGdldCB0aGF0IHdpbGwgcGxhY2UgY29udHJvbHMgZm9yIHBhZ2luZ1xuY2xhc3MgREdQYWdpbmdXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZEhlYWRlcldpZGdldCB7XG5cbiAgICBwcml2YXRlIHNvdXJjZTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHByaXZhdGUgd2lkZ2V0RWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIGxhYmVsRWxlbWVudDpIVE1MRWxlbWVudDtcbiAgICBwcml2YXRlIG5leHRFbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHByaXZhdGUgcHJldkVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgcHJpdmF0ZSByZXF1ZXN0RG9uZTooc3VjY2Vzczpib29sZWFuKSA9PiB2b2lkID0gKHN1Y2Nlc3M6Ym9vbGVhbik6dm9pZCA9PiB7XG4gICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICB9XG4gICAgfTtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIHNvdXJjZTpER1BhZ2VEYXRhU291cmNlKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMuc291cmNlID0gc291cmNlO1xuICAgICAgICB0aGlzLmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgLy8gSWYgdGhlIGVsZW1lbnRzIGhhdmUgbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjpIVE1MRWxlbWVudCwgdW5pcXVlSUQ6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cygpKSB7XG4gICAgICAgICAgICAkKHRoaXMud2lkZ2V0RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjb250YWluZXIpO1xuICAgICAgICAgICAgJCh0aGlzLmxhYmVsRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8odGhpcy53aWRnZXRFbGVtZW50KTtcbiAgICAgICAgICAgICQodGhpcy5wcmV2RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKSlcbiAgICAgICAgICAgICAgICAuYXR0cignaHJlZicsICcjJykuY3NzKCdtYXJnaW4nLCAnMCA1cHgnKVxuICAgICAgICAgICAgICAgIC50ZXh0KCc8IFByZXZpb3VzJykucHJvcCgnZGlzYWJsZWQnLCB0cnVlKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aGlzLndpZGdldEVsZW1lbnQpXG4gICAgICAgICAgICAgICAgLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VyY2UucGFnZURlbHRhKC0xKS5yZXF1ZXN0UGFnZU9mRGF0YSh0aGlzLnJlcXVlc3REb25lKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJCh0aGlzLm5leHRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpKVxuICAgICAgICAgICAgICAgIC5hdHRyKCdocmVmJywgJyMnKS5jc3MoJ21hcmdpbicsICcwIDVweCcpXG4gICAgICAgICAgICAgICAgLnRleHQoJ05leHQgPicpLnByb3AoJ2Rpc2FibGVkJywgdHJ1ZSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8odGhpcy53aWRnZXRFbGVtZW50KVxuICAgICAgICAgICAgICAgIC5jbGljaygoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291cmNlLnBhZ2VEZWx0YSgxKS5yZXF1ZXN0UGFnZU9mRGF0YSh0aGlzLnJlcXVlc3REb25lKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZWZyZXNoV2lkZ2V0KCk7XG4gICAgfVxuXG4gICAgcmVmcmVzaFdpZGdldCgpIHtcbiAgICAgICAgdmFyIHRvdGFsU2l6ZTpudW1iZXIgPSB0aGlzLnNvdXJjZS50b3RhbFNpemUoKTtcbiAgICAgICAgdmFyIHZpZXdTaXplOm51bWJlciA9IHRoaXMuc291cmNlLnZpZXdTaXplKCk7XG4gICAgICAgIHZhciBzdGFydDpudW1iZXIgPSB0aGlzLnNvdXJjZS50b3RhbE9mZnNldCgpO1xuICAgICAgICB2YXIgbGFiZWxUZXh0O1xuICAgICAgICBpZiAodG90YWxTaXplKSB7XG4gICAgICAgICAgICBsYWJlbFRleHQgPSBbICdEaXNwbGF5aW5nICcsIHN0YXJ0ICsgMSwgJy0nLCBzdGFydCArIHZpZXdTaXplLCAnIG9mICcsIHRvdGFsU2l6ZSBdLmpvaW4oJycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGFiZWxUZXh0ID0gJ05vIHJlc3VsdHMgZm91bmQhJztcbiAgICAgICAgfVxuICAgICAgICAkKHRoaXMubGFiZWxFbGVtZW50KS50ZXh0KGxhYmVsVGV4dCk7XG4gICAgICAgICQodGhpcy5wcmV2RWxlbWVudCkucHJvcCgnZGlzYWJsZWQnLCAhc3RhcnQpO1xuICAgICAgICAkKHRoaXMubmV4dEVsZW1lbnQpLnByb3AoJ2Rpc2FibGVkJywgc3RhcnQgKyB2aWV3U2l6ZSA+PSB0b3RhbFNpemUpO1xuICAgIH1cbn1cblxuXG5cbi8vIERlZmluZSB0aGUgVGFibGVTcGVjIG9iamVjdCB1c2VkIGJ5IERhdGFHcmlkU3BlY0Jhc2VcbmNsYXNzIERhdGFHcmlkVGFibGVTcGVjIHtcblxuICAgIG5hbWU6c3RyaW5nOyAgICAgICAgICAgIC8vIExhYmVsIHRvIHB1dCBpbiB0aGUgdGl0bGUgaGVhZGVyXG4gICAgaWQ6c3RyaW5nOyAgICAgICAgICAgICAgLy8gQSB1bmlxdWUgSUQgc3RyaW5nIGZvciB0aGlzIHRhYmxlLCB0byBjYXQgd2l0aCBvdGhlciBJRCBzdHJpbmdzIGZvciBnZW5lcmF0ZWQgdGFibGUgZWxlbWVudHNcbiAgICBkZWZhdWx0U29ydDpudW1iZXI7ICAgICAvLyBJbmRleCBvZiBoZWFkZXIgdG8gc29ydCBieSBkZWZhdWx0XG4gICAgc2hvd0hlYWRlcjpib29sZWFuOyAgICAgLy8gV2hldGhlciB0byBjcmVhdGUgYSBoZWFkZXIgYXJlYSBhdCB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuICAgIGFwcGx5U3RyaXBpbmc6Ym9vbGVhbjsgIC8vIFdoZXRoZXIgdG8gYXBwbHkgaG9yaXpvbnRhbCBzdHJpcGluZyBzdHlsZXMgdG8gYWx0ZXJuYXRlIHJvd3NcblxuICAgIGNvbnN0cnVjdG9yKGlkOnN0cmluZywgb3B0Pzp7W2luZGV4OnN0cmluZ106YW55fSkge1xuICAgICAgICB0aGlzLmlkID0gaWQ7ICAgICAgIC8vIElEIGlzIHJlcXVpcmVkLCBpbml0aWFsaXplIHNlbnNpYmxlIGRlZmF1bHRzIGZvciBldmVyeXRoaW5nIGVsc2VcbiAgICAgICAgb3B0ID0gJC5leHRlbmQoeyAnbmFtZSc6ICcnLCAnZGVmYXVsdFNvcnQnOiAwLCAnc2hvd0hlYWRlcic6IHRydWUsICdhcHBseVN0cmlwaW5nJzogdHJ1ZSB9LCBvcHQpO1xuICAgICAgICB0aGlzLm5hbWUgPSBvcHRbJ25hbWUnXTtcbiAgICAgICAgdGhpcy5kZWZhdWx0U29ydCA9IG9wdFsnZGVmYXVsdFNvcnQnXTtcbiAgICAgICAgdGhpcy5zaG93SGVhZGVyID0gb3B0WydzaG93SGVhZGVyJ107XG4gICAgICAgIHRoaXMuYXBwbHlTdHJpcGluZyA9IG9wdFsnYXBwbHlTdHJpcGluZyddO1xuICAgIH1cbn1cblxuXG5cbi8vIERlZmluZSB0aGUgSGVhZGVyU3BlYyBvYmplY3QgdXNlZCBieSBEYXRhR3JpZFNwZWNCYXNlXG5jbGFzcyBEYXRhR3JpZEhlYWRlclNwZWMge1xuICAgIG5hbWU6c3RyaW5nOyAgICAgICAgICAgIC8vIFRoZSBuYW1lIHRoYXQgYXBwZWFycyBpbiB0aGUgaGVhZGVyIGNlbGwsIGFuZCBpbiB0aGUgY29sdW1uIHNob3cvaGlkZSB3aWRnZXRcbiAgICBpZDpzdHJpbmc7ICAgICAgICAgICAgICAvLyBBbiBJRCB0byBhc3NpZ24gdG8gdGhlIGVsZW1lbnRcbiAgICBhbGlnbjpzdHJpbmc7ICAgICAgICAgICAvLyBUT0RPOiBzaG91bGQgYmUgYW4gZW51bSB0eXBlIG9mOiAnbGVmdCcsICdyaWdodCcsICdjZW50ZXInXG4gICAgdmFsaWduOnN0cmluZzsgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIGJlIGFuIGVudW0gdHlwZSBvZjogJ3RvcCcsICdtaWRkbGUnLCAnYm90dG9tJywgJ2Jhc2VsaW5lJ1xuICAgIG5vd3JhcDpib29sZWFuOyAgICAgICAgIC8vIElmIHNldCwgYWRkIGEgc3R5bGUgdGhhdCBwcmV2ZW50cyBsb25nIHN0cmluZ3MgZnJvbSB3cmFwcGluZyBpbiB0aGUgY2VsbFxuICAgIHJvd3NwYW46bnVtYmVyOyAgICAgICAgIC8vIE51bWJlciB0byBwdXQgaW4gYSByb3dzcGFuIGZvciB0aGUgaGVhZGVyLlxuICAgIGNvbHNwYW46bnVtYmVyOyAgICAgICAgIC8vIE51bWJlciB0byBwdXQgaW4gYSBjb2xzcGFuIGZvciB0aGUgaGVhZGVyLlxuICAgIGhlYWRlclJvdzpudW1iZXI7ICAgICAgIC8vIFdoaWNoIHJvdyB0byBwbGFjZSB0aGlzIGhlYWRlciBpbiwgc3RhcnRpbmcgd2l0aCAxIGFzIHRoZSBmaXJzdCByb3cuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVXNlZCB3aGVuIGNvbnN0cnVjdGluZyBtdWx0aS1yb3cgaGVhZGVyIHNlY3Rpb25zIHRoYXQgdXNlIHJvd3NwYW4gYW5kIGNvbHNwYW4gdGFncyB0byBtYWtlIHN1Yi1oZWFkZXJzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEhlYWRlcnMgYXJlIGluc2VydGVkIGludG8gdGhlaXIgaW5kaWNhdGVkIHJvd3MgaW4gdGhlIHNhbWUgcmVsYXRpdmUgb3JkZXIgYXMgdGhleSBhcmUgbGlzdGVkIGluIHRoaXMgc3BlYy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBMZWF2aW5nIHRoaXMgb3V0IHdpbGwgcGxhY2UgdGhlIGhlYWRlciBpbiB0aGUgZmlyc3Qgcm93LlxuICAgIGNvbHVtbkdyb3VwOm51bWJlcjsgICAgIC8vIFRoZSBjb2x1bW4gZ3JvdXAgdGhpcyBoZWFkZXIgYmVsb25ncyB0by4gIFVzZWQgZm9yIGhpZGluZyBhbmQgc2hvd2luZyBjb2x1bW5zLlxuICAgIGRpc3BsYXk6c3RyaW5nOyAgICAgICAgIC8vIFRPRE86IHNob3VsZCBiZSBhbiBlbnVtIHR5cGUgb2Y6ICdub25lJywgJ2lubGluZScsICdibG9jaycsICdsaXN0LWl0ZW0nLCAnaW5saW5lLWJsb2NrJywgYW5kIHBvc3NpYmx5IHRoZSAnaW5saW5lLXRhYmxlJyBhbmQgJ3RhYmxlLSonIHZhbHVlc1xuICAgIHNpemU6c3RyaW5nOyAgICAgICAgICAgIC8vIFRPRE86IHNob3VsZCBiZSBhbiBlbnVtIG9mIGFjY2VwdGVkIHZhbHVlczogJ20nLCAncydcbiAgICB3aWR0aDpzdHJpbmc7ICAgICAgICAgICAvLyBJZiBwcmVzZW50LCBzZXQgdGhlIGhlYWRlciAoYW5kIHRoZXJlYnkgdGhlIHdob2xlIGNvbHVtbiBiZWxvdyBpdCkgdG8gYSBmaXhlZCB3aWR0aC5cbiAgICBzb3J0Qnk6KGluZGV4Om51bWJlcik9PmFueTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBIGZ1bmN0aW9uIHJlc29sdmluZyBhIHJvdyBJRCB0byBhIHZhbHVlIHdlIGNhbiB1c2UgZm9yIHNvcnRpbmcgYnkgdGhpcyBoZWFkZXJcbiAgICBzb3J0QWZ0ZXI6bnVtYmVyOyAgICAgICAvLyBUaGUgaW5kZXggb2YgYW5vdGhlciBoZWFkZXIgdGhhdCB3ZSB3aWxsIGJhc2UgdGhlc2Ugc29ydGluZyByZXN1bHRzIG9uIChlLmcuIHNvcnQgYnkgRGVzY3JpcHRpb24sIHRoZW4gYnkgU3R1ZHkgTmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBMZWF2ZSB0aGlzIHByb3BlcnR5IGVtcHR5IGlmIHRoZXJlIGlzIG5vIHNvcnRpbmcgcHJlcmVxdWlzaXRlLlxuICAgIHNvcnRJZDpzdHJpbmc7ICAgICAgICAgIC8vIGFuIElEIHRvIHVzZSB3aGVuIHNvcnRpbmcgb24gc2VydmVyLXNpZGVcblxuICAgIC8vXG4gICAgLy8gVGhlc2UgYXJlIGludGVybmFsIHZhbHVlcyB0aGF0IHNob3VsZCBub3QgYmUgZGVmaW5lZCBieSBzcGVjXG4gICAgLy9cbiAgICBoaWRkZW46Ym9vbGVhbjtcbiAgICBlbGVtZW50OkhUTUxFbGVtZW50O1xuICAgIHNvcnRGdW5jOihhOm51bWJlcixiOm51bWJlcik9Pm51bWJlcjtcbiAgICBzb3J0ZWQ6Ym9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKGdyb3VwOm51bWJlciwgaWQ6c3RyaW5nLCBvcHQ/OntbaW5kZXg6c3RyaW5nXTphbnl9KSB7XG4gICAgICAgIHRoaXMuY29sdW1uR3JvdXAgPSBncm91cDtcbiAgICAgICAgdGhpcy5pZCA9IGlkOyAgICAgICAvLyBJRCBpcyByZXF1aXJlZCwgaW5pdGlhbGl6ZSBzZW5zaWJsZSBkZWZhdWx0cyBmb3IgZXZlcnl0aGluZyBlbHNlXG4gICAgICAgIG9wdCA9ICQuZXh0ZW5kKHsgJ25hbWUnOiAnJywgJ2FsaWduJzogJ2xlZnQnLCAnc2l6ZSc6ICdtJywgJ3NvcnRBZnRlcic6IC0xIH0sIG9wdCk7ICAgLy8gbW9zdCB0aGluZ3MgY2FuIGJlIG51bGxcbiAgICAgICAgdGhpcy5uYW1lID0gb3B0WyduYW1lJ107XG4gICAgICAgIHRoaXMuYWxpZ24gPSBvcHRbJ2FsaWduJ107XG4gICAgICAgIHRoaXMudmFsaWduID0gb3B0Wyd2YWxpZ24nXTtcbiAgICAgICAgdGhpcy5ub3dyYXAgPSBvcHRbJ25vd3JhcCddO1xuICAgICAgICB0aGlzLnJvd3NwYW4gPSBvcHRbJ3Jvd3NwYW4nXTtcbiAgICAgICAgdGhpcy5jb2xzcGFuID0gb3B0Wydjb2xzcGFuJ107XG4gICAgICAgIHRoaXMuaGVhZGVyUm93ID0gb3B0WydoZWFkZXJSb3cnXTtcbiAgICAgICAgdGhpcy5kaXNwbGF5ID0gb3B0WydkaXNwbGF5J107XG4gICAgICAgIHRoaXMuc2l6ZSA9IG9wdFsnc2l6ZSddO1xuICAgICAgICB0aGlzLndpZHRoID0gb3B0Wyd3aWR0aCddO1xuICAgICAgICB0aGlzLnNvcnRCeSA9IG9wdFsnc29ydEJ5J107XG4gICAgICAgIHRoaXMuc29ydEFmdGVyID0gb3B0Wydzb3J0QWZ0ZXInXTtcbiAgICAgICAgdGhpcy5zb3J0SWQgPSBvcHRbJ3NvcnRJZCddO1xuICAgIH1cbn1cblxuXG5cbi8vIERlZmluZSB0aGUgQ29sdW1uU3BlYyBvYmplY3QgdXNlZCBieSBEYXRhR3JpZFNwZWNCYXNlXG5jbGFzcyBEYXRhR3JpZENvbHVtblNwZWMge1xuICAgIGNvbHVtbkdyb3VwOm51bWJlcjtcbiAgICBnZW5lcmF0ZUNlbGxzRnVuY3Rpb246KGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk9PkRhdGFHcmlkRGF0YUNlbGxbXTtcblxuICAgIC8vXG4gICAgLy8gVGhlc2UgYXJlIGludGVybmFsIHZhbHVlcyB0aGF0IHNob3VsZCBub3QgYmUgZGVmaW5lZCBieSBzcGVjXG4gICAgLy9cbiAgICBjcmVhdGVkRGF0YUNlbGxPYmplY3RzOntbaWQ6c3RyaW5nXTpEYXRhR3JpZERhdGFDZWxsW119O1xuXG4gICAgY29uc3RydWN0b3IoZ3JvdXA6bnVtYmVyLCBnZW5lcmF0ZUNlbGxzOihncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBpbmRleDpzdHJpbmcpPT5EYXRhR3JpZERhdGFDZWxsW10pIHtcbiAgICAgICAgdGhpcy5jb2x1bW5Hcm91cCA9IGdyb3VwO1xuICAgICAgICB0aGlzLmdlbmVyYXRlQ2VsbHNGdW5jdGlvbiA9IGdlbmVyYXRlQ2VsbHM7XG4gICAgICAgIHRoaXMuY3JlYXRlZERhdGFDZWxsT2JqZWN0cyA9IHt9O1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBjID0gdGhpcy5nZW5lcmF0ZUNlbGxzRnVuY3Rpb24oZ3JpZFNwZWMsIGluZGV4KTtcbiAgICAgICAgdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzW2luZGV4XSA9IGMuc2xpY2UoMCk7XG4gICAgICAgICAgcmV0dXJuIGM7XG4gICAgfVxuXG5cbiAgICAvLyBjbGVhckVudGlyZUluZGV4KGluZGV4Om51bWJlcik6dm9pZCB7XG4gICAgLy8gICAgIHRoaXMuY3JlYXRlZERhdGFDZWxsT2JqZWN0cyA9IHt9O1xuICAgIC8vIH1cblxuXG4gICAgY2xlYXJJbmRleEF0SUQoaW5kZXg6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuY3JlYXRlZERhdGFDZWxsT2JqZWN0c1tpbmRleF07XG4gICAgfVxuXG5cbiAgICBjZWxsSW5kZXhBdElEKGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlZERhdGFDZWxsT2JqZWN0c1tpbmRleF07XG4gICAgfVxuXG5cbiAgICBnZXRFbnRpcmVJbmRleCgpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBjZWxsczpEYXRhR3JpZERhdGFDZWxsW10gPSBbXTtcbiAgICAgICAgZm9yICh2YXIga2V5IGluIHRoaXMuY3JlYXRlZERhdGFDZWxsT2JqZWN0cykge1xuICAgICAgICAgICAgdmFyIGE6RGF0YUdyaWREYXRhQ2VsbFtdID0gdGhpcy5jcmVhdGVkRGF0YUNlbGxPYmplY3RzW2tleV07XG4gICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgIC8vIE11Y2ggZmFzdGVyIHRoYW4gcmVwZWF0ZWQgY29uY2F0c1xuICAgICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGNlbGxzLCBhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2VsbHM7XG4gICAgfVxufVxuXG5cblxuLy8gRGVmaW5lIHRoZSBDb2x1bW5Hcm91cFNwZWMgb2JqZWN0IHVzZWQgYnkgRGF0YUdyaWRTcGVjQmFzZVxuY2xhc3MgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMge1xuICAgIG5hbWU6c3RyaW5nOyAgICAgICAgICAgICAgICAgICAgLy8gUmVhZGFibGUgbGFiZWwgc3RyaW5nIGZvciB0aGlzIGNvbHVtbiBncm91cFxuICAgIHNob3dJblZpc2liaWxpdHlMaXN0OmJvb2xlYW47ICAgLy8gV2hldGhlciB0byBwbGFjZSB0aGlzIGNvbHVtbiBpbiB0aGUgc2hvdy9oaWRlIGxpc3RcbiAgICBoaWRkZW5CeURlZmF1bHQ6Ym9vbGVhbjsgICAgICAgIC8vIEZsYWcgaWYgZ3JvdXAgaXMgaGlkZGVuIGJ5IGRlZmF1bHRcbiAgICAvLyBjYWxsYmFjayBmb3Igd2hlbiBhIGNvbHVtbiB0cmFuc2l0aW9ucyBmcm9tIGhpZGRlbiB0byB2aXNpYmxlXG4gICAgcmV2ZWFsZWRDYWxsYmFjazooc3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBncmlkOkRhdGFHcmlkKT0+dm9pZDtcblxuICAgIC8vXG4gICAgLy8gVGhlc2UgYXJlIGludGVybmFsIHZhbHVlcyB0aGF0IHNob3VsZCBub3QgYmUgZGVmaW5lZCBieSBzcGVjXG4gICAgLy9cbiAgICBjdXJyZW50bHlIaWRkZW46Ym9vbGVhbjtcbiAgICBtZW1iZXJIZWFkZXJzOkRhdGFHcmlkSGVhZGVyU3BlY1tdO1xuICAgIG1lbWJlckNvbHVtbnM6RGF0YUdyaWRDb2x1bW5TcGVjW107XG4gICAgY2hlY2tib3hFbGVtZW50OkhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBjb25zdHJ1Y3RvcihsYWJlbDpzdHJpbmcsIG9wdD86e1tpbmRleDpzdHJpbmddOmFueX0pIHtcbiAgICAgICAgdGhpcy5uYW1lID0gbGFiZWw7XG4gICAgICAgIG9wdCA9ICQuZXh0ZW5kKHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogdHJ1ZSB9LCBvcHQpO1xuICAgICAgICB0aGlzLnNob3dJblZpc2liaWxpdHlMaXN0ID0gb3B0WydzaG93SW5WaXNpYmlsaXR5TGlzdCddO1xuICAgICAgICB0aGlzLmhpZGRlbkJ5RGVmYXVsdCA9IG9wdFsnaGlkZGVuQnlEZWZhdWx0J107XG4gICAgICAgIHRoaXMucmV2ZWFsZWRDYWxsYmFjayA9IG9wdFsncmV2ZWFsZWRDYWxsYmFjayddO1xuICAgIH1cbn1cblxuXG5cbi8vIERlZmluZSB0aGUgUm93R3JvdXBTcGVjIG9iamVjdCB1c2VkIGJ5IERhdGFHcmlkU3BlY0Jhc2VcbmNsYXNzIERhdGFHcmlkUm93R3JvdXBTcGVjIHtcbiAgICBuYW1lOnN0cmluZztcblxuICAgIC8vXG4gICAgLy8gVGhlc2UgYXJlIGludGVybmFsIHZhbHVlcyB0aGF0IHNob3VsZCBub3QgYmUgZGVmaW5lZCBieSBzcGVjXG4gICAgLy9cbiAgICBkaXNjbG9zZWQ6Ym9vbGVhbjtcbiAgICBkaXNjbG9zZWRUaXRsZVJvdzpIVE1MRWxlbWVudDtcbiAgICBkaXNjbG9zZWRUaXRsZVJvd0pROkpRdWVyeTtcbiAgICB1bmRpc2Nsb3NlZFRpdGxlUm93OkhUTUxFbGVtZW50O1xuICAgIHVuZGlzY2xvc2VkVGl0bGVSb3dKUTpKUXVlcnk7XG4gICAgbWVtYmVyUmVjb3JkczpEYXRhR3JpZFJlY29yZFtdO1xuXG4gICAgY29uc3RydWN0b3IobGFiZWw6c3RyaW5nKSB7XG4gICAgICAgIHRoaXMubmFtZSA9IGxhYmVsO1xuICAgIH1cbn1cblxuXG5cbi8vIFVzZXJzIG9mIERhdGFHcmlkIHNob3VsZCBkZXJpdmUgZnJvbSB0aGlzIGNsYXNzLCBhbHRlcmluZyB0aGUgY29uc3RydWN0b3IgdG9cbi8vIHByb3ZpZGUgYSBzcGVjaWZpY2F0aW9uIGZvciB0aGUgbGF5b3V0LCBpbnRlcmZhY2UsIGFuZCBkYXRhIHNvdXJjZXMgb2YgdGhlaXIgRGF0YUdyaWQgdGFibGUsXG4vLyBhbmQgb3ZlcnJpZGUgdGhlIGNhbGxiYWNrcyB0byBjdXN0b21pemUgZnVuY3Rpb25hbGl0eS5cbi8vIFRoZW4sIHdoZW4gdGhleSBpbnN0YW50aWF0ZSBhIERhdGFHcmlkLCB0aGV5IHNob3VsZCBwcm92aWRlIGFuIGluc3RhbmNlIG9mIHRoaXMgZGVyaXZlZCBEYXRhR3JpZFNwZWNCYXNlLlxuLy8gQXMgYW4gZXhhbXBsZSwgdGhpcyBiYXNlIGNsYXNzIGlzIHNldCB1cCB0byByZW5kZXIgdGhlIFN0dWRpZXMgdGFibGUgb24gdGhlIG1haW4gcGFnZSBvZiB0aGUgRURELlxuY2xhc3MgRGF0YUdyaWRTcGVjQmFzZSB7XG5cbiAgICAvLyBUaGVzZSB3aWxsIGFsbCBiZSBkZWZpbmVkIG9yIHNldCBieSB0aGUgY29uc3RydWN0b3JcbiAgICB0YWJsZVNwZWM6RGF0YUdyaWRUYWJsZVNwZWM7XG4gICAgdGFibGVIZWFkZXJTcGVjOkRhdGFHcmlkSGVhZGVyU3BlY1tdO1xuICAgIHRhYmxlQ29sdW1uU3BlYzpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICB0YWJsZUNvbHVtbkdyb3VwU3BlYzpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgIHRhYmxlUm93R3JvdXBTcGVjOkRhdGFHcmlkUm93R3JvdXBTcGVjW107XG4gICAgdGFibGVFbGVtZW50OkhUTUxFbGVtZW50O1xuXG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy50YWJsZUVsZW1lbnQgPSB0aGlzLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICB0aGlzLnRhYmxlU3BlYyA9IHRoaXMuZGVmaW5lVGFibGVTcGVjKCk7XG4gICAgICAgIHRoaXMudGFibGVIZWFkZXJTcGVjID0gdGhpcy5kZWZpbmVIZWFkZXJTcGVjKCk7XG4gICAgICAgIHRoaXMudGFibGVDb2x1bW5TcGVjID0gdGhpcy5kZWZpbmVDb2x1bW5TcGVjKCk7XG4gICAgICAgIHRoaXMudGFibGVDb2x1bW5Hcm91cFNwZWMgPSB0aGlzLmRlZmluZUNvbHVtbkdyb3VwU3BlYygpO1xuICAgICAgICB0aGlzLnRhYmxlUm93R3JvdXBTcGVjID0gdGhpcy5kZWZpbmVSb3dHcm91cFNwZWMoKTtcbiAgICB9XG5cbiAgICAvLyBBbGwgb2YgdGhlc2UgXCJkZWZpbmVcIiBmdW5jdGlvbnMgc2hvdWxkIGJlIG92ZXJyaWRkZW5cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ3VuaXF1ZXN0cmluZycsIHsgJ25hbWUnOiAnQXdlc29tZSBUYWJsZScgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgaGVhZGVycyBhbG9uZyB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUhlYWRlclNwZWMoKTpEYXRhR3JpZEhlYWRlclNwZWNbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoTmFtZScsIHsgJ25hbWUnOiAnTmFtZScgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIsICdoRGVzYycsIHsgJ25hbWUnOiAnRGVzY3JpcHRpb24nIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMSwgKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdID0+IHtcbiAgICAgICAgICAgICAgICAgICAvLyBDcmVhdGUgY2VsbChzKSBmb3IgYSBnaXZlbiByZWNvcmQgSUQsIGZvciBjb2x1bW4gMVxuICAgICAgICAgICAgICAgIHJldHVybiBbbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4KV07IFxuICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIsIChncmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGNlbGwocykgZm9yIGEgZ2l2ZW4gcmVjb3JkIElELCBmb3IgY29sdW1uIDJcbiAgICAgICAgICAgICAgICByZXR1cm4gW25ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCldOyBcbiAgICAgICAgICAgICAgIH0pLFxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cbiAgICBkZWZpbmVDb2x1bW5Hcm91cFNwZWMoKTpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0Rlc2NyaXB0aW9uJylcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBncm91cHMgdGhhdCByb3dzIGNhbiBiZSBnYXRoZXJlZCBpbnRvXG4gICAgZGVmaW5lUm93R3JvdXBTcGVjKCk6RGF0YUdyaWRSb3dHcm91cFNwZWNbXSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cblxuICAgIC8vIGF0dGFjaCBldmVudCBoYW5kbGVycyBmb3Igc29ydGluZ1xuICAgIGVuYWJsZVNvcnQoZ3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRTcGVjQmFzZSB7XG4gICAgICAgIHRoaXMudGFibGVIZWFkZXJTcGVjLmZvckVhY2goKGhlYWRlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGhlYWRlci5zb3J0QnkpIHtcbiAgICAgICAgICAgICAgICAkKGhlYWRlci5lbGVtZW50KS5vbignY2xpY2suZGF0YXRhYmxlJywgKGV2KSA9PiB0aGlzLmNsaWNrZWRTb3J0KGdyaWQsIGhlYWRlciwgZXYpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIFRoZSBzZXJ2ZXIgY29kZSBob29rcyB0YWJsZSBoZWFkZXJzIHdpdGggdGhpcyBmdW5jdGlvbi5cbiAgICBwcml2YXRlIGNsaWNrZWRTb3J0KGdyaWQ6RGF0YUdyaWQsIGhlYWRlcjpEYXRhR3JpZEhlYWRlclNwZWMsIGV2KSB7XG4gICAgICAgIHZhciBzb3J0ID0gZ3JpZC5zb3J0Q29scygpO1xuICAgICAgICBpZiAoc29ydC5sZW5ndGggJiYgc29ydFswXS5zcGVjLmlkID09PSBoZWFkZXIuaWQpIHtcbiAgICAgICAgICAgIHNvcnRbMF0uYXNjID0gIXNvcnRbMF0uYXNjO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydCA9IFsgeyAnc3BlYyc6IGhlYWRlciwgJ2FzYyc6IHRydWUgfSBdO1xuICAgICAgICB9XG4gICAgICAgIGdyaWQuc29ydENvbHMoc29ydCkuYXJyYW5nZVRhYmxlRGF0YVJvd3MoKTtcbiAgICB9XG5cblxuICAgIC8vIFdoZW4gcGFzc2VkIGEgcmVjb3JkIElELCByZXR1cm5zIHRoZSByb3cgZ3JvdXAgdGhhdCB0aGUgcmVjb3JkIGlzIGEgbWVtYmVyIG9mLlxuICAgIGdldFJvd0dyb3VwTWVtYmVyc2hpcChyZWNvcmRJRDpzdHJpbmcpOm51bWJlciB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZSBjb250ZW50IHdpbGwgYmUgcmVtb3ZlZC5cbiAgICBnZXRUYWJsZUVsZW1lbnQoKTpIVE1MRWxlbWVudCB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0dWRpZXNUYWJsZVwiKTtcbiAgICB9XG5cblxuICAgIC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycywgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGUgZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG4gICAgZ2V0UmVjb3JkSURzKCk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgU3R1ZGllc1xuICAgICAgICB2YXIgYXJyYXk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuICAgICAgICBhcnJheS5wdXNoKG5ldyBER1NlYXJjaFdpZGdldChkYXRhR3JpZCwgdGhpcywgJ1NlYXJjaCBTdHVkaWVzJywgNDAsIHRydWUpKTtcbiAgICAgICAgcmV0dXJuIGFycmF5O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy5cbiAgICAvLyBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGRpc3BsYXllZCBpbiB0aGUgbWVudS5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgb25seSB0aGUgU3R1ZGllcyB0aGF0IGJlbG9uZyB0byB0aGUgY3VycmVudCB1c2VyXG4gICAgICAgIC8vICAgICAgICB2YXIgb25seU15U3R1ZGllc1dpZGdldCA9IG5ldyBER09ubHlNeVN0dWRpZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICAvLyAgICAgICAgd2lkZ2V0U2V0LnB1c2gob25seU15U3R1ZGllc1dpZGdldCk7XG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgU3R1ZGllc1xuICAgICAgICAvLyAgICAgICAgdmFyIGRpc2FibGVkU3R1ZGllc1dpZGdldCA9IG5ldyBER0Rpc2FibGVkU3R1ZGllc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIC8vICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZFN0dWRpZXNXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gYSBkYXRhIHJlc2V0IGlzIHRyaWdnZXJlZCwgYnV0IGJlZm9yZSB0aGUgdGFibGUgcm93cyBhcmUgcmVidWlsdC5cbiAgICBvbkRhdGFSZXNldChkYXRhR3JpZDpEYXRhR3JpZCk6dm9pZCB7XG4gICAgICAgIHJldHVybjsgICAgLy8gRG8gbm90aGluZyBieSBkZWZhdWx0LlxuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiBhIHBhcnRpYWwgZGF0YSByZXNldCBpcyB0cmlnZ2VyZWQsIGJ1dCBiZWZvcmUgdGhlIHRhYmxlIHJvd3MgYXJlIHJlYnVpbHQuXG4gICAgLy8gQSBwYXJ0aWFsIGRhdGEgcmVzZXQgaXMgb25lIHdoZXJlIGEgY29sbGVjdGlvbiBvZiByZWNvcmRzIGhhdmUgYmVlbiBzcGVjaWZpZWQgZm9yIHJlLXBhcnNpbmcsXG4gICAgLy8gYW5kIHdpbGwgYmUgbWl4ZWQtaW4gd2l0aCB0aGUgY3VycmVudGx5IHJlbmRlcmVkIGNvbGxlY3Rpb24gYWZ0ZXJ3YXJkcy5cbiAgICBvblBhcnRpYWxEYXRhUmVzZXQoZGF0YUdyaWQ6RGF0YUdyaWQsIHJlY29yZHM6c3RyaW5nW10pOnZvaWQge1xuICAgICAgICByZXR1cm47ICAgIC8vIERvIG5vdGhpbmcgYnkgZGVmYXVsdC5cbiAgICB9XG5cblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZSB1c2VyIGhpZGVzIG9yIHNob3dzIHJvd3MuXG4gICAgb25Sb3dWaXNpYmlsaXR5Q2hhbmdlZCgpOnZvaWQge1xuXG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgYSBncm91cCBuYW1lLiBZb3UgY2FuIHByb2Nlc3MgeW91ciBkYXRhIGhvd2V2ZXJcbiAgICAvLyB5b3Ugd2FudCBpbiBvcmRlciB0byBjb21lIHVwIHdpdGggYSBuYW1lLlxuICAgIGdlbmVyYXRlR3JvdXBOYW1lKGRhdGFHcmlkOkRhdGFHcmlkLCBncm91cElEOnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIFwiR3JvdXAgXCIgKyBncm91cElEO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gdGhlIGdyb3VwaW5nIHNldHRpbmcgaXMgY2hhbmdlZCwgaW4gY2FzZVxuICAgIC8vIHlvdSB3YW50IHRvIHBlcnNpc3QgdGhlIHNldHRpbmcgc29tZXdoZXJlLlxuICAgIG9uVXBkYXRlZEdyb3VwaW5nRW5hYmxlZChkYXRhR3JpZDpEYXRhR3JpZCwgZW5hYmxlZDpib29sZWFuKTp2b2lkIHtcbiAgICB9XG5cbn1cblxuXG4iXX0=