import * as $ from "jquery";

import * as Dragboxes from "./Dragboxes";
import * as Utl from "./Utl";

type DataGridVisitor = (
    rows: DataGridDataRow[],
    id: string,
    spec: DataGridSpecBase,
    grid: DataGrid,
) => void | boolean;

export class DataGrid {
    // Member variables.
    private _spec: DataGridSpecBase;

    private _table: HTMLElement;
    private _tableBody: HTMLElement;
    private _tableBodyJquery: JQuery;
    private _tableControlsArea: Element;
    private _waitBadge: HTMLElement;
    private _classes: string;

    private _headerRows: Element[];
    private _totalColumnCount: number;
    private _recordElements: DataGridRecordSet;

    private _headerWidgets: DataGridHeaderWidget[];
    private _optionsMenuWidgets: DataGridOptionWidget[];
    private _optionsMenuElement: HTMLElement;

    private _widgetRefreshCooldownTimer: number;
    private _widgetRefreshPending: boolean;

    private _optionsMenuBlockElement: HTMLElement;
    private _optionsLabel: HTMLElement;

    private _groupingEnabled = false; // grouping mode off by default
    private _sort: DataGridSort[] = [];
    private _sequence: { [index: number]: string[] } = {};

    private _timers: { [index: string]: number };

    // This binds a table element to an instance of DataGrid.
    // The previous contents of the table, if any, are deleted, and DataGrid takes over the table
    constructor(dataGridSpec: DataGridSpecBase) {
        // Use !! double-not operator to coerce truth-y/false-y values to booleans
        Utl.JS.assert(
            !!dataGridSpec,
            "DataGrid needs to be supplied with a DataGridSpecBase-derived object.",
        );
        Utl.JS.assert(
            !!(
                dataGridSpec.tableElement &&
                dataGridSpec.tableSpec &&
                dataGridSpec.tableHeaderSpec &&
                dataGridSpec.tableColumnSpec
            ),
            "DataGridSpecBase-derived object does not have enough to work with.",
        );

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
        this._widgetRefreshCooldownTimer = null;
        this._widgetRefreshPending = false;
        this._classes = [
            "dataTable",
            "sortable",
            "dragboxes",
            "hastablecontrols",
            "table-striped",
            "table-bordered",
        ].join(" ");

        const tableBody: JQuery = $(
            (this._tableBody = document.createElement("tbody")),
        );

        // First step: Blow away the old contents of the table
        $(this._table)
            .empty()
            .attr({ "cellpadding": 0, "cellspacing": 0 })
            .addClass(this._getClasses())
            // TODO: Most of these classes are probably not needed now
            .append(tableBody);
        this._tableBodyJquery = tableBody;

        const tHead = $(document.createElement("thead"));
        // If there is no custom area, this returns null
        this._tableControlsArea = this.getCustomControlsArea();
        if (!this._tableControlsArea) {
            const tr = $(document.createElement("tr"))
                .addClass("header")
                .appendTo(tHead);
            this._tableControlsArea = $(document.createElement("th"))
                .appendTo(tr)
                .get(0);
            if (this.countTotalColumns() > 1) {
                $(this._tableControlsArea).attr("colspan", this._totalColumnCount);
            }
        }
        this._waitBadge = document.createElement("span");
        $(this._waitBadge).addClass("waitbadge wait").appendTo(this._tableControlsArea);
        // If we're asked not to display a header,
        // create it anyway so widgets can go somewhere, but hide it.
        if (!dataGridSpec.tableSpec.showHeader) {
            $(this._tableControlsArea).addClass("off");
        }
        // Apply the default column visibility settings.
        this.prepareColumnVisibility();

        // TODO: If we wish to move the column headers outside the table so the
        // body rows can scroll independedntly, we need to create a second table.
        // A working solution would involve a resize timer,
        // and some modifications to DataGrid to allow creating the table header cells
        // in a second table (with 0 data rows)
        // That is then placed immediately above an 'overflow-y:scroll' div
        // containing the first table.
        // Then we would need some event handlers to resize the second table
        // based on changes in the first.
        const headerRows = (this._headerRows = this._buildTableHeaders());
        tHead.append(headerRows);
        $(tHead).insertBefore(this._tableBody);

        // If any checkbox changes in the table body
        // indicating a potential change in the selection
        // refresh the header widgets, since their appearance may need to change.
        tableBody.on(
            "change",
            ":checkbox",
            this._refreshAllWidgetsWithThrottling.bind(this),
        );

        setTimeout(() => this._initializeTableData(), 1);
    }

    _getTableBody(): JQuery {
        return this._tableBodyJquery;
    }

    // By defaut the controls are placed at the top of the table,
    // inside a single header cell spanning the entire table.
    // But we can override this placement by returning a JQuery reference to an alternate location.
    getCustomControlsArea(): Element {
        return null;
    }

    _getClasses(): string {
        return this._classes;
    }

    // Breaking up the initial table creation into two stages
    // allows the browser to render a preliminary version of the table
    // with a header but no data rows,
    // then continue loading other assets in parallel.
    // It actually speeds up the entire table creation as well,
    // for reasons that are not very clear.
    // (If the setup is NOT run in two stages,
    // all the 'createElement' calls for the data cells take much longer,
    // in Firefox and Safari, according to load-time profiling ...
    // and only when paired with some servers??)
    _initializeTableData(): DataGrid {
        const cArea = this._tableControlsArea;

        Dragboxes.initTable(this._table);
        this._buildAllTableSorters()
            ._buildTableSortSequences()
            ._allocateTableRowRecords()
            ._buildRowGroupTitleRows()
            ._createOptionsMenu()
            ._createHeaderWidgets();

        // First, append the header widgets that should to appear "after" the pulldown.
        // (Since all widgets are styled to float right, they will appear from right to left.)
        this.headerWidgets().forEach((widget, index) => {
            if (!widget.displayBeforeViewMenu()) {
                widget.appendElements(cArea, index.toString(10));
            }
        });
        // Now append the 'View' pulldown menu
        cArea.appendChild(this._optionsMenuElement);
        // Finally, append the header widgets that should appear "before".
        this.headerWidgets().forEach((widget, index) => {
            if (widget.displayBeforeViewMenu()) {
                widget.appendElements(cArea, index.toString(10));
            }
        });

        this._initializeSort().arrangeTableDataRows();

        // Now that we've constructed our elements, apply visibility styling to them.
        this._applyColumnVisibility();

        // Prepare the table for sorting
        this._prepareSortable();

        this._spec.onInitialized(this);
        $(this._waitBadge).remove();

        return this;
    }

    _initializeSort(): DataGrid {
        const defaultSort = this._spec.tableSpec.defaultSort || 0;
        this._sort = [{ "spec": this._spec.tableHeaderSpec[defaultSort], "asc": true }];
        return this;
    }

    // Notify the DataGrid that its underlying data has reset
    triggerDataReset(): DataGrid {
        // We have new data to display. Clear out old rows.
        $.each(this._recordElements, (index: string, value: DataGridRecord) => {
            value.removeElements();
        });
        this._spec.onDataReset(this);
        // Rebuild rows.
        this._buildTableSortSequences()
            ._allocateTableRowRecords()
            // And then arrange the rows
            .arrangeTableDataRows();

        // Call the support function in each widget,
        // to apply styling to all the data rows of the table.
        this.optionsMenuWidgets().forEach((widget) => {
            this._spec.getRecordIDs().forEach((id) => {
                widget.initialFormatRowElementsForID(
                    this._recordElements[id].getDataGridDataRows(),
                    id,
                );
            });
        });

        this.headerWidgets().forEach((widget) => {
            this._spec.getRecordIDs().forEach((id) => {
                widget.initialFormatRowElementsForID(
                    this._recordElements[id].getDataGridDataRows(),
                    id,
                );
            });
        });

        // And make sure only the currently visible things are ... visible
        this._applyColumnVisibility();
        this._refreshAllWidgets();
        return this;
    }

    // Update only the table rows for the specified records.
    // For use in situations where you want to add rows, or rebuild existing rows,
    // and leave the rest unchanged.
    triggerPartialDataReset(recordIDs: string[], reflow: boolean): DataGrid {
        this._spec.onPartialDataReset(this, recordIDs);
        // Rebuild rows.
        recordIDs.forEach((id) => {
            this.reconstructSingleRecord(id);
        });

        if (reflow) {
            this._buildTableSortSequences().arrangeTableDataRows();
            this._refreshAllWidgets();
        }
        return this;
    }

    // Instruct DataGrid to recreate/refresh everything related to a single record ID.
    // This includes removing its table rows,
    // reconstructing them,
    // reformatting them,
    // and re-adding the rows in the same place as the old,
    // but does NOT rebuild the sort sequences.
    //   NOTE:
    // It's quite possible that changes to the appearance
    // will alter the visibility of the rows in complicated ways.
    // For example, the generic search widget logic may decide to hide a previously shown row
    // or vice-versa, corrupting row striping.
    // Do not delay the reflow for too long.
    reconstructSingleRecord(recordID: string): DataGrid {
        if (this._recordElements[recordID]) {
            this._recordElements[recordID].reCreateElementsInPlace();
        } else {
            // Note that if the record didn't exist before,
            // it will not appear in the table now,
            // until a complete reflow is done
            // by rebuilding sort sequences and calling arrangeTableDataRows.
            this._recordElements[recordID] = new DataGridRecord(this._spec, recordID);
        }

        const dgRecord = this._recordElements[recordID];

        // Call the support function in each widget,
        // to apply styling to all the data rows of the table.
        this.optionsMenuWidgets().forEach((widget) => {
            widget.initialFormatRowElementsForID(
                dgRecord.getDataGridDataRows(),
                recordID,
            );
        });

        this.headerWidgets().forEach((widget) => {
            widget.initialFormatRowElementsForID(
                dgRecord.getDataGridDataRows(),
                recordID,
            );
        });

        // Make sure only the currently visible things are ... visible
        this._applyColumnVisibilityToOneRecord(recordID);
        return this;
    }

    private _createOptionsMenu(): DataGrid {
        const mainID = this._spec.tableSpec.id;

        // Populate the master list of custom options menu widgets
        // by calling the initialization routine in the spec
        this._optionsMenuWidgets = this._spec.createCustomOptionsWidgets(this);
        const hasCustomWidgets: boolean = this.optionsMenuWidgets().length > 0;

        // Check in the column groups and see if any are hide-able
        const hasColumnsInVisibilityList: boolean =
            this._spec.tableColumnGroupSpec.some((group) => group.showInVisibilityList);

        // If none of the groups are allowed to be hidden,
        // and we don't have any custom option widgets,
        // don't bother creating the column visibility menu
        if (!hasColumnsInVisibilityList && !hasCustomWidgets) {
            return;
        }

        // If we have custom widgets, we need to call their support functions that apply styling
        // to all the data rows of the table.
        if (hasCustomWidgets) {
            this.optionsMenuWidgets().forEach((widget) => {
                this._spec.getRecordIDs().forEach((id) => {
                    widget.initialFormatRowElementsForID(
                        this._recordElements[id].getDataGridDataRows(),
                        id,
                    );
                });
            });
        }

        const mainSpan = $((this._optionsMenuElement = document.createElement("div")))
            .attr("id", mainID + "ColumnChooser")
            .addClass("pulldownMenu");

        const menuLabel = $((this._optionsLabel = document.createElement("div")))
            .addClass("pulldownMenuLabelOff")
            .text("View options \u25BE")
            .click(() => {
                if (menuLabel.hasClass("pulldownMenuLabelOff")) {
                    this._showOptMenu();
                }
            })
            .appendTo(mainSpan);

        const menuBlock = $(
            (this._optionsMenuBlockElement = document.createElement("div")),
        )
            .addClass("pulldownMenuMenuBlock off")
            .appendTo(mainSpan);

        // event handlers to hide menu if clicking outside menu block or pressing ESC
        $(document)
            .click((ev) => {
                const t = $(ev.target);
                if (t.closest(this._optionsMenuElement).length === 0) {
                    this._hideOptMenu();
                }
            })
            .keydown((ev) => {
                if (ev.keyCode === 27) {
                    this._hideOptMenu();
                }
            });

        if (hasCustomWidgets) {
            const menuCWList = $(document.createElement("ul")).appendTo(menuBlock);
            if (hasColumnsInVisibilityList) {
                menuCWList.addClass("withDivider");
            }
            this.optionsMenuWidgets().forEach((widget, index) => {
                widget.appendElements(
                    $(document.createElement("li")).appendTo(menuCWList)[0],
                    index.toString(10),
                );
            });
        }

        if (hasColumnsInVisibilityList) {
            const menuColList = $(document.createElement("ul")).appendTo(menuBlock);
            // Add each hide-able group to the menu.
            // Note: We have to walk through this anew,
            // because we're going to make use of the index 'i'.
            this._spec.tableColumnGroupSpec.forEach(
                (group: DataGridColumnGroupSpec, index: number) => {
                    let item, checkbox, id;
                    if (group.showInVisibilityList) {
                        item = $("<li>").appendTo(menuColList);
                        id = mainID + "ColumnCheck" + index;
                        checkbox = $('<input type="checkbox">')
                            .appendTo(item)
                            .attr("id", id)
                            .data("column", group)
                            .on("click", group, (e: any) =>
                                this._clickedColVisibilityControl(e),
                            );
                        group.checkboxElement = checkbox[0];
                        $("<label>").attr("for", id).text(group.name).appendTo(item);
                        if (!group.currentlyHidden) {
                            checkbox.prop("checked", true);
                        }
                    }
                },
            );
            // update checks based on settings
            this._fetchSettings(
                this._columnSettingsKey(),
                (data) => {
                    menuColList
                        .find("li")
                        .find(":input")
                        .each((i, box) => {
                            const $box = $(box),
                                col = $box.data("column");
                            if (
                                (data.indexOf(col.name) === -1 &&
                                    !!col.hiddenByDefault) ||
                                data.indexOf("-" + col.name) > -1
                            ) {
                                $box.prop("checked", false);
                                this.hideColumn(col);
                            } else {
                                $box.prop("checked", true);
                                this.showColumn(col);
                            }
                        });
                },
                [],
            );
        }

        return this;
    }

    private _createHeaderWidgets(): DataGrid {
        // Populate the master list of custom header widgets
        // by calling the initialization routine in the spec
        this._headerWidgets = this._spec.createCustomHeaderWidgets(this);
        this._headerWidgets.forEach((widget) => {
            // Call the support function in each widget,
            // to apply styling to all the data rows of the table.
            this._spec.getRecordIDs().forEach((id) => {
                widget.initialFormatRowElementsForID(
                    this._recordElements[id].getDataGridDataRows(),
                    id,
                );
            });
        });
        return this;
    }

    // Prepare the column visibility state for the table.
    // This function should be called during instantiation,
    // since it initializes the column visibility
    // variables that are referred to throughout the rest of the DataGrid class.
    prepareColumnVisibility(): void {
        // First, run through a sequence of checks
        // to set the 'currentlyHidden' attribute to a reasonable value.
        this._spec.tableColumnGroupSpec.forEach((group: DataGridColumnGroupSpec) => {
            // Establish what the default is, before checking any passed-in column flags
            group.currentlyHidden = !!group.hiddenByDefault;
            // Ensure that the necessary arrays are present to keep track of group members
            group.memberHeaders = group.memberHeaders || [];
            group.memberColumns = group.memberColumns || [];
        });

        // Collect all the headers under their respective column groups
        this._spec.tableHeaderSpec.forEach((header) => {
            const c: number = header.columnGroup;
            if (c && this._spec.tableColumnGroupSpec[c - 1]) {
                this._spec.tableColumnGroupSpec[c - 1].memberHeaders.push(header);
            }
        });

        // Collect all the columns (and in turn their cells) under their respective column groups
        this._spec.tableColumnSpec.forEach((col) => {
            const c: number = col.columnGroup;
            if (c && this._spec.tableColumnGroupSpec[c - 1]) {
                this._spec.tableColumnGroupSpec[c - 1].memberColumns.push(col);
            }
        });
    }

    // Read the current column visibility state
    // and alter the styling of headers and cells to reflect it
    private _applyColumnVisibility(): DataGrid {
        this._spec.tableColumnGroupSpec.forEach((group: DataGridColumnGroupSpec) => {
            const hidden = group.currentlyHidden;
            group.memberHeaders.forEach((header) =>
                $(header.element).toggleClass("off", hidden),
            );
            group.memberColumns.forEach((column) => {
                column
                    .getEntireIndex()
                    .forEach((c) => (hidden ? c.hide() : c.unhide()));
            });
        });
        return this;
    }

    private _applyColumnVisibilityToOneRecord(recordID: string): DataGrid {
        this._spec.tableColumnGroupSpec.forEach((group: DataGridColumnGroupSpec) => {
            const hidden = group.currentlyHidden;
            group.memberColumns.forEach((column) => {
                column
                    .cellIndexAtID(recordID)
                    .forEach((c) => (hidden ? c.hide() : c.unhide()));
            });
        });
        return this;
    }

    // Get the list of IDs, then filter it down to what's visible,
    // then search the visible rows for spec-mandated checkbox elements,
    // and if a checkbox is checked, return its element on an array.
    getSelectedCheckboxElements(): HTMLInputElement[] {
        const sequence: string[] = this._getSequence(this._sort[0]);
        // Verify that the row sets referred to by the IDs actually exist
        const filteredSequence = this.applyAllWidgetFiltering(
            sequence.filter((v) => !!this._recordElements[v]),
        );
        const checkedBoxes: HTMLInputElement[] = [];
        filteredSequence.forEach((v) => {
            const rows = this._recordElements[v].getDataGridDataRows();
            rows.forEach((row) => {
                if (!row.dataGridDataCells) {
                    return;
                }
                row.dataGridDataCells.forEach((cell) => {
                    const checkbox = cell.getCheckboxElement();
                    if (checkbox && checkbox.checked) {
                        checkedBoxes.push(checkbox);
                    }
                });
            });
        });
        return checkedBoxes;
    }

    applySortIndicators(): void {
        if (this._headerRows) {
            $(this._headerRows)
                .find(".sortedup, .sorteddown")
                .removeClass("sortedup sorteddown");
        }
        this._sort.forEach((sort) => {
            $(sort.spec.element).addClass(sort.asc ? "sorteddown" : "sortedup");
        });
    }

    arrangeTableDataRows(): DataGrid {
        let striping = 1;

        $(this._tableBody).children().detach();
        // We create a document fragment
        // a kind of container for document-related objects
        // that we don't want in the page
        // and accumulate inside it all the rows we want to display,
        // in sorted order.
        const frag = document.createDocumentFragment();
        this.applySortIndicators();
        // Remove all the grouping title rows from the table as well, if they were there
        const rowGroupSpec = this._spec.tableRowGroupSpec;
        rowGroupSpec.forEach((rowGroup) => {
            const r = rowGroup.replicateGroupTable;
            // As with regular rows, we're assuming the row is a child only of this table body.
            if (r.parentNode) {
                r.parentNode.removeChild(r);
            }
            // While we're here, reset the member record arrays.
            // We need to rebuild them post-filtering.
            rowGroup.memberRecords = [];
        });
        const sequence = this._getSequence(this._sort[0]);
        // Verify that the row sets referred to by the IDs actually exist
        const filteredSequence = sequence.filter((v) => !!this._recordElements[v]);
        const unfilteredSequence = filteredSequence.slice(0);
        // Call to detach only the rows that didn't make it through the filter.
        // The others will be automatically detached by being moved to the document fragment.
        const addedRowIDs = {};
        this.applyAllWidgetFiltering(filteredSequence).forEach((id) => {
            addedRowIDs[id] = true;
        });
        unfilteredSequence.forEach((id) => {
            if (!addedRowIDs[id]) {
                this._recordElements[id].detachElements();
            }
        });

        // Now we run through the remaining IDs and add their rows to the table, with striping.
        // But if grouping is enabled and there is at least one group, we add them a few at a time,
        // proceeding through each group.
        if (!this._groupingEnabled || rowGroupSpec.length < 1) {
            // The standard non-grouped method:
            filteredSequence.forEach((s) => {
                const rows = this._recordElements[s].getElements();
                rows.forEach((row) => {
                    frag.appendChild(row);
                });
            });
        } else {
            // The more complicated, grouped method:
            filteredSequence.forEach((s) => {
                const rowGroup = rowGroupSpec[this._spec.getRowGroupMembership(s)];
                rowGroup.memberRecords.push(this._recordElements[s]);
            });
            // iterate over the different replicate groups
            $.each(rowGroupSpec, (grouping) => {
                // find the assay ids associated with the replicate group
                const replicateIds = this._findReplicateLines(
                    this._groupReplicates(),
                    grouping,
                );
                // find the lines associated with the replicate group
                const lines = this.addReplicateRows(replicateIds);
                $.each(lines, (i, line) => {
                    line.hide();
                });
            });
            rowGroupSpec.forEach((rowGroup) => {
                striping = 1 - striping;
                frag.appendChild(rowGroup.replicateGroupTable);
            });
            // TODO: This command doesn't make sense - the frag is not in the document yet
            $(frag).insertBefore($(this._tableBody));
        }
        // TODO: This really needs to be moved
        if ($("#GroupStudyReplicatesCB").prop("checked") === false) {
            $(frag).children().removeClass("replicateLineShow").show();
        }
        // Remember that we last sorted by this column
        this._tableBody.appendChild(frag);

        return this;
    }

    // Call _refreshAllWidgets, unless a half-second cooldown timer is active from the last call,
    // in which case set a flag to call _refreshAllWidgets when the timer expires.
    private _refreshAllWidgetsWithThrottling(): void {
        if (this._widgetRefreshCooldownTimer) {
            this._widgetRefreshPending = true;
            return;
        }
        this._refreshAllWidgets();
        this._widgetRefreshCooldownTimer = window.setTimeout(
            this._refreshAllWidgetsClearTimer.bind(this),
            500,
        );
    }

    private _refreshAllWidgetsClearTimer(): void {
        this._widgetRefreshCooldownTimer = null;
        // If a request to refresh came in while the cooldown was in operation,
        // clear the flag and call for another refresh.
        // With the timer cleared, it will immediately refresh,
        // without setting the pending request flag.
        if (this._widgetRefreshPending) {
            this._widgetRefreshPending = false;
            this._refreshAllWidgetsWithThrottling();
        }
    }

    private _refreshAllWidgets(): void {
        this.headerWidgets().forEach((widget) => {
            widget.refreshWidget();
        });
        this.optionsMenuWidgets().forEach((widget) => {
            widget.refreshWidget();
        });
    }

    // Given an array of record IDs, send the array through the filtering function for each of
    // the header widgets, and each of the options menu widgets, then return the filtered array.
    applyAllWidgetFiltering(filteredSequence: string[]): string[] {
        // Give each header widget a chance to apply filtering
        this.headerWidgets().forEach((widget) => {
            filteredSequence = widget.applyFilterToIDs(filteredSequence);
        });

        // Give each widget in the options menu a chance to apply filtering
        this.optionsMenuWidgets().forEach((widget) => {
            filteredSequence = widget.applyFilterToIDs(filteredSequence);
        });
        return filteredSequence;
    }

    // Add up all the column counts in the headerspec, to arrive at a grand total for the table.
    getSpec(): any {
        return this._spec; // F*** type conversion F*** things up when subclassing
    }

    // Add up all the column counts in the headerspec, to arrive at a grand total for the table.
    countTotalColumns(): number {
        return (this._totalColumnCount = this._spec.tableHeaderSpec.reduce(
            (prev, v): number => {
                if (v.headerRow) {
                    if (v.headerRow > 1) {
                        return prev;
                    }
                }
                return prev + (v.colspan ? v.colspan : 1);
            },
            0,
        ));
    }

    // Walk through each header in the spec, and look for a "sortBy" function.
    // If one is found, use it to construct a sorting function
    private _buildAllTableSorters(): DataGrid {
        this._spec.tableHeaderSpec.forEach((header) => {
            if (header.sortBy) {
                header.sortFunc = this.buildTableSorter(header.sortBy);
            }
        });
        return this;
    }

    // Given a comparison function,
    // construct a function suitable for passing to Javascript's "sort".
    buildTableSorter(
        lookupFunc: (rowIndex: number) => any,
    ): (x: number, y: number) => number {
        return (rowIndexA: number, rowIndexB: number) => {
            const a = lookupFunc.call(this._spec, rowIndexA);
            const b = lookupFunc.call(this._spec, rowIndexB);
            // true becomes 1, false becomes 0
            return ((a > b) as any) - ((b > a) as any);
        };
    }

    // Start with the array of IDs given in the spec.
    // Then, for each header, build a sorted copy of the array,
    // and save the sorted copy into the header information.
    // Some sort sequences may rely on the sort sequences of other headers.
    // In the code below, these are followed like a dependency tree.
    // We do this by tracking the unsorted headers in a set,
    // and looping through the set.
    // Every time we find a header that we can successfully sort
    // whether because the prerequisite header is already sorted,
    // or because it has no prerequisite
    // we sort it and remove it from the set.
    // If we ever loop through the set and fail to remove even one item from it,
    // we give up, since there must be a dependency loop.
    // It's not the fastest method on the planet,
    // but it's good enough,
    // since we'll probably never have any more than 10 or so headers.
    private _buildTableSortSequences(): DataGrid {
        const unsortedHeaders: DataGridHeaderSpec[] = [];
        let sortedAtLeastOneNewHeader = false;
        // Declare all the headers unsorted, and add them to the unsorted set.
        this._spec.tableHeaderSpec.forEach((header) => {
            // anything with sortId is sorted server-side already
            if (header.sortId) {
                header.sorted = true;
                // only add headers with sort functions
            } else if (header.sortFunc) {
                // add in front, so set is reversed
                unsortedHeaders.unshift(header);
                header.sorted = false;
            }
        });
        do {
            sortedAtLeastOneNewHeader = false;
            // use slice so that splice inside the callback does not interfere with loop
            unsortedHeaders.slice(0).forEach((header, index) => {
                let after;
                if (header.sortAfter >= 0) {
                    after = this._spec.tableHeaderSpec[header.sortAfter];
                    if (!after.sorted) {
                        return;
                    }
                }
                this._sequence[header.id] = this._spec.getRecordIDs();
                if (after && after.id && this._sequence[after.id]) {
                    this._sequence[header.id] = this._sequence[after.id].slice(0);
                }
                this._sequence[header.id].sort(header.sortFunc);
                this._sequence["-" + header.id] = this._sequence[header.id]
                    .slice(0)
                    .reverse();
                header.sorted = true;
                unsortedHeaders.splice(index, 1);
                sortedAtLeastOneNewHeader = true;
            });
        } while (sortedAtLeastOneNewHeader);
        return this;
    }

    private _getSequence(sort: DataGridSort): string[] {
        let key: string, sequence: string[];
        if (sort) {
            key = (sort.asc ? "" : "-") + sort.spec.id;
            sequence = this._sequence[key];
            if (sequence === undefined) {
                sequence = this._spec.getRecordIDs();
            }
        } else {
            sequence = this._spec.getRecordIDs();
        }
        return sequence;
    }

    private _buildTableHeaders(): Element[] {
        // Find the minimum number of rows we need to create to contain all the headers
        const maxheaderRow: number = this._spec.tableHeaderSpec.reduce(
            (prev: number, v) => Math.max(prev, v.headerRow || 0),
            1,
        );

        // Create enough rows to contain the headers (usually just 1)
        const rowElements: Element[] = [];
        for (let i = 0; i < maxheaderRow; i++) {
            const row = $(document.createElement("tr")).addClass("columnLabels");
            rowElements.push(row[0]);
        }

        // Run through each individual header,
        // create it according to the specs,
        // and add it to the appropriate row.
        this._spec.tableHeaderSpec.forEach((header) => {
            const commonCss = {
                "width": header.width
                    ? header.width.substr(-1) !== "%"
                        ? header.width + "px"
                        : header.width
                    : undefined,
            };
            const css = $.extend(
                {
                    "text-align": header.align,
                    "vertical-align": header.valign,
                    "display": header.display,
                },
                commonCss,
            );
            header.element = document.createElement("th");
            const cell: JQuery = $(header.element)
                .css(css)
                .attr({
                    "id": header.id,
                    "colspan": header.colspan > 1 ? header.colspan : undefined,
                    "rowspan": header.rowspan > 1 ? header.rowspan : undefined,
                    "class": header.size === "s" ? "smaller" : undefined,
                })
                .appendTo(rowElements[Math.max(header.headerRow || 1, 1) - 1]);
            if (header.sortBy) {
                cell.addClass("sortheader");
            }
            if (header.name) {
                $(document.createElement("div"))
                    .appendTo(cell)
                    .text(header.name)
                    .attr({ "class": header.nowrap ? "nowrap" : undefined })
                    .css(commonCss);
            }
        });
        // Remove the right-side border line from the last element of each row
        rowElements.forEach((row) => {
            const l: any = row.lastChild;
            if (l) {
                l.style.borderRight = "0";
            }
        });

        return rowElements;
    }

    // Build the rows (and the contents of the rows) for each record in the data.
    // (See the DataGridDataCell class.)
    private _allocateTableRowRecords(): DataGrid {
        this._recordElements = new DataGridRecordSet();
        this._spec.getRecordIDs().forEach((id) => {
            this._recordElements[id] = new DataGridRecord(this._spec, id);
        });
        return this;
    }

    // Assemble table rows - disclosed and undisclosed versions (with callbacks) -
    // that act as titles for the different groups when the table is in grouping mode.
    private _buildRowGroupTitleRows(): DataGrid {
        this._spec.tableRowGroupSpec.forEach((oneGroup, index) => {
            oneGroup.disclosed = true;
            const replicates = this._groupReplicates();
            const replicateIds = this._findReplicateLines(replicates, oneGroup);
            oneGroup.memberRecords = [];
            let clicks = true;
            const table = (oneGroup.replicateGroupTableJQ = $(
                (oneGroup.replicateGroupTable = document.createElement("tbody")),
            ).addClass("groupHeaderTable"));
            const row = (oneGroup.replicateGroupTitleRowJQ = $(
                (oneGroup.replicateGroupTitleRow = document.createElement("tr")),
            )
                .appendTo(table)
                .addClass("groupHeader")
                .click(() => {
                    if (clicks) {
                        this._expandRowGroup(index, replicateIds);
                        clicks = false;
                    } else {
                        this._collapseRowGroup(index, replicateIds);
                        clicks = true;
                    }
                }));
            const cell = $(document.createElement("td"))
                .appendTo(row)
                .text(" " + oneGroup.name)
                .addClass("groupReplicateRow");
            if (this._totalColumnCount > 1) {
                cell.attr("colspan", this._totalColumnCount);
            }
        });
        return this;
    }

    /**
     * this function returns the lines associated with a replicate group
     * @param replicates - array of ids associated with replicate
     * @param oneGroup is the replicate name
     * @returns {Array} of lines that are associate with the said replicate name
     * @private
     */
    private _findReplicateLines(replicates, oneGroup): string[] {
        const groupedIds = []; // returns ids associated with replicate id.
        $.each(replicates, function (key) {
            if (EDDData.Lines[replicates[key]].name === oneGroup.name) {
                groupedIds.push(key);
            }
        });
        return groupedIds;
    }

    // Handle the "sortable" CSS class in a table.
    private _prepareSortable(): void {
        // Add a click event for every header cell that identifies as sortable
        this._spec.enableSort(this);
    }

    private _showOptMenu(): void {
        $(this._optionsLabel)
            .removeClass("pulldownMenuLabelOff")
            .addClass("pulldownMenuLabelOn");
        $(this._optionsMenuBlockElement).removeClass("off");
    }

    private _hideOptMenu(): void {
        $(this._optionsLabel)
            .removeClass("pulldownMenuLabelOn")
            .addClass("pulldownMenuLabelOff");
        $(this._optionsMenuBlockElement).addClass("off");
    }

    /**
     * this function hides the lines and collapses the replicate dropdown
     * @param groupIndex
     * @param replicateIds
     * @private
     */
    private _collapseRowGroup(groupIndex: number, replicateIds: string[]): void {
        const rowGroup = this._spec.tableRowGroupSpec[groupIndex];
        rowGroup.disclosed = false;
        const lines = this.addReplicateRows(replicateIds);
        $(rowGroup.replicateGroupTitleRow).removeClass("replicate");
        $.each(lines, (i, line) => {
            line.hide();
        });
        this.scheduleTimer("arrangeTableDataRows", () => this.arrangeTableDataRows());
    }

    /**
     * this function opens the dropdown on a replicate group and shows the lines associated with
     * the replicate group
     * @param groupIndex
     * @param replicateIds
     * @private
     */
    private _expandRowGroup(groupIndex: number, replicateIds: string[]): void {
        const rowGroup = this._spec.tableRowGroupSpec[groupIndex];
        rowGroup.disclosed = true;
        const lines = this.addReplicateRows(replicateIds);
        $(rowGroup.replicateGroupTitleRow).addClass("replicate");
        $.each(lines, (line: any) => {
            $(line).show().addClass("replicateLineShow");
            $(rowGroup.replicateGroupTitleRow).after(line);
        });
    }

    /**
     * this function finds the lines associated with their replicate group id.
     * @returns {} line id as key and the replicate id the line is associated with
     * @private
     */
    private _groupReplicates(): Record<string, unknown> {
        const lines: any = EDDData.Lines;
        const rows = {};
        $.each(lines, function (key) {
            if (lines[key].replicate) {
                rows[lines[key].id] = lines[key].replicate;
            }
        });
        return rows;
    }

    /**
     * this function gets the line elements associated with a replicate id
     * @param idArray
     * @returns {Array}
     */
    private addReplicateRows(idArray: string[]): JQuery[] {
        return $.map(idArray, (id) =>
            $("[value=" + id + "]", this._table)
                .parents("tr")
                .filter(":first"),
        );
    }

    turnOnRowGrouping(): void {
        this._groupingEnabled = true;
        this.scheduleTimer("arrangeTableDataRows", () => this.arrangeTableDataRows());
    }

    turnOffRowGrouping(): void {
        this._groupingEnabled = false;
        this.scheduleTimer("arrangeTableDataRows", () => this.arrangeTableDataRows());
    }

    clickedOptionWidget(): void {
        this.scheduleTimer("arrangeTableDataRows", () => this.arrangeTableDataRows());
    }

    clickedHeaderWidget(headerWidget?: DataGridWidget): void {
        this.scheduleTimer("arrangeTableDataRows", () => this.arrangeTableDataRows());
    }

    // 'control' is a column visibility checkbox
    private _clickedColVisibilityControl(event: JQueryMouseEventObject): DataGrid {
        const check = $(event.target),
            col = event.data;
        if (check.prop("checked")) {
            this.showColumn(col);
        } else {
            this.hideColumn(col);
        }
        return this;
    }

    // 'control' is a column visibility checkbox
    showColumn(group: DataGridColumnGroupSpec): void {
        if (group.currentlyHidden) {
            group.currentlyHidden = false;
            if (group.revealedCallback) {
                group.revealedCallback(this._spec, this);
            }
            this.scheduleTimer("_updateColumnSettings", () =>
                this._updateColumnSettings(),
            );
            this.scheduleTimer("_applyColumnVisibility", () =>
                this._applyColumnVisibility(),
            );
        }
    }

    // 'control' is a column visibility checkbox
    hideColumn(group: DataGridColumnGroupSpec): void {
        if (!group.currentlyHidden) {
            group.currentlyHidden = true;
            this.scheduleTimer("_updateColumnSettings", () =>
                this._updateColumnSettings(),
            );
            this.scheduleTimer("_applyColumnVisibility", () =>
                this._applyColumnVisibility(),
            );
        }
    }

    private _basePayload(): any {
        const token: string = Utl.EDD.findCSRFToken();
        return { "csrfmiddlewaretoken": token };
    }

    private _columnSettingsKey(): string {
        return ["datagrid", this._spec.tableSpec.id, "column"].join(".");
    }

    private _settingsPath(propKey: string): string {
        // make sure the final slash is on path so Django can accept POST requests
        return "/profile/settings/" + propKey + "/";
    }

    private _fetchSettings(
        propKey: string,
        callback: (value: any) => void,
        defaultValue?: any,
    ): void {
        $.ajax(this._settingsPath(propKey), {
            "dataType": "json",
            "success": (data: any): void => {
                data = data || defaultValue;
                if (typeof data === "string") {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        /* ParseError, just use string value */
                    }
                }
                callback.call({}, data);
            },
        });
    }

    // The server binds this. 'this' is a checkbox.
    private _updateColumnSettings(): DataGrid {
        const propKey = this._columnSettingsKey();
        let setCol = [];
        const unsetCol = [];
        let delCol = [];
        this._spec.tableColumnGroupSpec.forEach(
            (col: DataGridColumnGroupSpec): void => {
                if (col.showInVisibilityList && col.checkboxElement) {
                    if (col.checkboxElement.checked) {
                        setCol.push(col.name);
                    } else {
                        unsetCol.push(col.name);
                        if (!col.hiddenByDefault) {
                            delCol.push("-" + col.name);
                        }
                    }
                }
            },
        );
        this._fetchSettings(
            propKey,
            (data: any) => {
                const inData = (name: string): boolean => data.indexOf(name) === -1;
                // filter out all the unset boxes
                data = data.filter(
                    (name: string): boolean => unsetCol.indexOf(name) === -1,
                );
                // filter out all excluded that are now set
                data = data.filter((name: string): boolean => {
                    return !(
                        setCol.indexOf(name.substring(1)) !== -1 &&
                        name.indexOf("-") === 0
                    );
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
                $.ajax(this._settingsPath(propKey), {
                    "data": $.extend({}, this._basePayload(), {
                        "data": JSON.stringify(data),
                    }),
                    "type": "POST",
                });
            },
            [],
        );
        return this;
    }

    // Schedule a call to the given function in the near future,
    // and save the timer under the given identifier.
    // Multiple calls to this using the same identifier will reschedule the event,
    // removing the old timer.
    scheduleTimer(uid: string, func: () => any): DataGrid {
        if (this._timers[uid]) {
            clearTimeout(this._timers[uid]);
        }
        this._timers[uid] = window.setTimeout(func, 10);
        return this;
    }

    // apply a function to every record ID specified
    applyToRecordSet(func: DataGridVisitor, ids: string[]): DataGrid {
        ids.forEach((id) => {
            func.call(
                {},
                this._recordElements[id].getDataGridDataRows(),
                id,
                this._spec,
                this,
            );
        });
        return this;
    }

    // apply a function to each record ID in the sequence until the function returns false
    testRecordSet(func: DataGridVisitor, ids: string[]): boolean {
        return ids.every((id) => {
            return func.call(
                {},
                this._recordElements[id].getDataGridDataRows(),
                id,
                this._spec,
                this,
            );
        });
    }

    // retreive the current sequence of records in the DataGrid
    currentSequence(): string[] {
        return this._getSequence(this._sort[0]);
    }

    sortCols(): DataGridSort[];
    sortCols(cols: DataGridSort[]): DataGrid;
    sortCols(cols?: DataGridSort[]): any {
        if (cols === undefined) {
            return this._sort;
        } else {
            this._sort = cols;
            return this;
        }
    }

    headerWidgets(): DataGridHeaderWidget[] {
        return this._headerWidgets || [];
    }

    optionsMenuWidgets(): DataGridOptionWidget[] {
        return this._optionsMenuWidgets || [];
    }
}

// Type definition for the records contained in a DataGrid
class DataGridRecordSet {
    [index: string]: DataGridRecord;
}

// Type definition for the records contained in a DataGrid
export class DataGridRecord {
    gridSpec: DataGridSpecBase;
    recordID: string;
    dataGridDataRows: DataGridDataRow[];
    rowElements: HTMLElement[];
    createdElements: boolean;

    constructor(gridSpec: DataGridSpecBase, id: string) {
        this.gridSpec = gridSpec;
        this.recordID = id;
        this.rowElements = [];
        this.dataGridDataRows = [];
        this.createdElements = false;
    }

    reCreateElementsInPlace(): void {
        // If the elements haven't been created even once,
        // then divert to standard creation and finish.
        if (!this.createdElements) {
            this.createElements();
            return;
        }
        // If we're going to maintain the position of the new rows,
        // we need to find their earlier adjacent sibling, if one exists.
        let previousParent = null;
        let nextSibling = null;
        if (this.dataGridDataRows.length) {
            const lastEl = this.rowElements[this.dataGridDataRows.length - 1];
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
        // Drop the new rows into place where the old rows lived.
        if (previousParent) {
            if (nextSibling) {
                this.rowElements.forEach((row) => {
                    previousParent.insertBefore(row, nextSibling);
                });
            } else {
                this.rowElements.forEach((row) => {
                    previousParent.appendChild(row);
                });
            }
        }
    }

    createElements(): void {
        if (this.createdElements) {
            return;
        }
        this.rowElements = [];
        this.dataGridDataRows = [];

        const cellsForColumns = {};
        this.gridSpec.tableColumnSpec.forEach((colSpec, index) => {
            cellsForColumns[index] = colSpec.generateCells(
                this.gridSpec,
                this.recordID,
            );
        });

        // We will use these indexes to determine when we need to add the next cell,
        // in the sequence of rows.
        const currentRowHeights = [];
        this.gridSpec.tableColumnSpec.forEach((colSpec, index) => {
            currentRowHeights[index] = 0;
        });

        let addingForRow = 0;
        let moreToAdd = true;
        let cells: DataGridDataCell[] = [];

        // Pull cells off the bottom of the arrays, left to right,
        // assembling the rows one at a time,
        // skipping columns based on the rowspan or colspan of previous cells.
        // We expect the client of this class
        // to ensure they are declaring a nicely fitted rectangular structure -
        // we don't validate it.
        while (moreToAdd) {
            moreToAdd = false;
            cells = [];
            this.gridSpec.tableColumnSpec.forEach((spec, col) => {
                if (currentRowHeights[col] > addingForRow) {
                    return;
                }
                const colCells = cellsForColumns[col];
                if (colCells.length) {
                    const c = colCells.shift();
                    if (colCells.length) {
                        moreToAdd = true;
                    }
                    const next = col + c.colspan;
                    while (col < next) {
                        currentRowHeights[col] = c.rowspan + addingForRow;
                        col++;
                    }
                    cells.push(c);
                }
            });

            const r = new DataGridDataRow(this.recordID, cells);
            this.dataGridDataRows.push(r);
            this.rowElements.push(r.getElement());

            // keep going if current row is less than highest rowspan
            moreToAdd =
                ++addingForRow < currentRowHeights.reduce((a, b) => Math.max(a, b), 0);
        }

        this.createdElements = true;
    }

    removeElements(): void {
        this.dataGridDataRows.forEach((row) => {
            row.removeElement();
        });
    }

    // Like remove, except it doesn't remove JQuery events or data.
    // Used to take the table rows temporarily out of the DOM, like when re-ordering.
    detachElements(): void {
        this.dataGridDataRows.forEach((row) => {
            row.detachElement();
        });
    }

    getDataGridDataRows(): DataGridDataRow[] {
        if (!this.createdElements) {
            this.createElements();
        }
        return this.dataGridDataRows;
    }

    getElements(): HTMLElement[] {
        if (!this.createdElements) {
            this.createElements();
        }
        return this.rowElements;
    }
}

// Container class for data rows in the body of the DataGrid table.
// DataGrid instantiates these by passing in an array
// of the DataGridDataCell objects that will form the content of the row.
export class DataGridDataRow {
    rowElement: HTMLElement;
    rowElementJQ: JQuery;
    // Defined or set by the constructor
    recordID: string;
    dataGridDataCells: DataGridDataCell[];
    createdElement: boolean;

    constructor(id: string, cells: DataGridDataCell[]) {
        this.recordID = id;
        this.dataGridDataCells = cells;
        this.createdElement = false;
    }

    createElement(): void {
        const rowEl: HTMLElement = document.createElement("tr");
        for (const c of this.dataGridDataCells) {
            rowEl.appendChild(c.getElement());
        }
        this.rowElement = rowEl;
        this.createdElement = true;
    }

    removeElement(): void {
        if (this.createdElement) {
            this.getElementJQ().remove();
        }
    }

    // Like remove, except it doesn't remove JQuery events or data.
    // Used to take the table rows temporarily out of the DOM, like when re-ordering.
    detachElement(): void {
        if (this.createdElement) {
            this.getElementJQ().detach();
        }
    }

    getElement(): HTMLElement {
        if (!this.createdElement) {
            this.createElement();
        }
        return this.rowElement;
    }

    getElementJQ(): JQuery {
        if (!this.createdElement) {
            this.createElement();
        }
        if (!this.rowElementJQ) {
            this.rowElementJQ = $(this.rowElement);
        }
        return this.rowElementJQ;
    }
}

// Container class for cells in the body of the DataGrid table.
// DataGrid calls a function defined in DataGridColumnSpec objects to instantiate these,
// passing in a reference to the DataGridSpecBase and a unique identifier for a data record.
export class DataGridDataCell {
    // Defined or set by the constructor
    gridSpec: DataGridSpecBase;
    recordID: string;

    // Options potentially set by the constructor
    rowspan: number;
    colspan: number;
    align: "left" | "right" | "center";
    valign: "top" | "middle" | "bottom" | "baseline";
    maxWidth: string;
    minWidth: string;
    nowrap: boolean;
    title: string;
    hoverEffect: boolean;
    contentFunction: (e: HTMLElement, index: number) => void;
    contentString: string;
    checkboxWithID: (index: number) => string;
    checkboxName: string;
    customID: (index: number) => string;
    sideMenuItems: string[];

    // Local data
    cellElement: HTMLElement;
    cellElementJQ: JQuery;
    contentContainerElement: Element;
    checkboxElement: HTMLInputElement;
    hidden: boolean;
    createdElement: boolean;

    constructor(
        gridSpec: DataGridSpecBase,
        id: string,
        opt?: { [index: string]: any },
    ) {
        this.gridSpec = gridSpec;
        this.recordID = id;
        this.hidden = false;
        this.createdElement = false;
        const defaults = {
            "contentFunction": () => undefined,
            "contentString": "",
            "align": "left",
            "rowspan": 1,
            "colspan": 1,
        };
        $.extend(this, defaults, opt || {});
    }

    createElement(): void {
        const id = this.recordID;
        const c: HTMLElement = document.createElement("td");
        let checkId: string;
        let checkName: string;
        const cellClasses: string[] = [];
        let menu: JQuery;
        if (this.checkboxWithID) {
            checkId = this.checkboxWithID.call(this.gridSpec, id);
            checkName = this.checkboxName || checkId;
            this.checkboxElement = document.createElement("input");
            this.checkboxElement.setAttribute("type", "checkbox");
            $(this.checkboxElement)
                .attr({
                    "id": checkId,
                    "name": checkName,
                    "value": id.toString(),
                })
                .appendTo(c);
            this.contentContainerElement = $("<label>")
                .attr("for", checkId)
                .appendTo(c)[0];
        } else {
            this.contentContainerElement = $("<span>").appendTo(c)[0];
        }
        $(this.contentContainerElement).html(this.contentString);
        this.contentFunction.call(this.gridSpec, this.contentContainerElement, id);
        if (this.sideMenuItems && this.sideMenuItems.length) {
            menu = $("<ul>");
            this.sideMenuItems.forEach((item) => {
                $("<li>")
                    .html(item)
                    .appendTo(menu)
                    .find(".line-edit-link")
                    .addClass("editLine");
            });
            menu.addClass("popupmenu off").appendTo(c);
            cellClasses.push("has-popupmenu");
        }

        if (this.colspan > 1) {
            c.setAttribute("colspan", this.colspan.toString(10));
        }
        if (this.rowspan > 1) {
            c.setAttribute("rowspan", this.rowspan.toString(10));
        }
        if (this.customID) {
            c.setAttribute("id", this.customID.call(this.gridSpec, id));
        }

        if (this.hoverEffect) {
            cellClasses.push("popupcell");
        }

        cellClasses.push("nowrap");

        if (this.minWidth) {
            c.style.minWidth = this.minWidth + "px";
        }
        if (this.maxWidth) {
            c.style.maxWidth = this.maxWidth + "px";
        }
        if (this.align) {
            c.style.textAlign = this.align;
        }
        if (this.valign) {
            c.style.verticalAlign = this.valign;
        }
        if (this.hidden) {
            cellClasses.push("off");
        }

        if (cellClasses.length > 0) {
            c.className = cellClasses.join(" ");
        }
        this.cellElement = c;
        this.cellElementJQ = $(c);

        this.createdElement = true;
    }

    getElement(): HTMLElement {
        if (!this.createdElement) {
            this.createElement();
        }
        return this.cellElement;
    }

    getCheckboxElement(): HTMLInputElement {
        if (!this.createdElement) {
            this.createElement();
        }
        return this.checkboxElement || null;
    }

    hide(): void {
        if (!this.hidden) {
            if (this.createdElement) {
                this.cellElementJQ.addClass("off");
            }
            this.hidden = true;
        }
    }

    unhide(): void {
        if (this.hidden) {
            if (this.createdElement) {
                this.cellElementJQ.removeClass("off");
            }
            this.hidden = false;
        }
    }
}

// A placeholder cell when data is still loading
export class DataGridLoadingCell extends DataGridDataCell {
    constructor(
        gridSpec: DataGridSpecBase,
        id: string,
        opt?: { [index: string]: any },
    ) {
        super(gridSpec, id, opt);
        this.contentString = '<span class="loading">Loading...</span>';
    }
}

// A general class that acts as a common repository for utility functions for DataGrid widgets.
// It is immediately subclassed into DataGridOptionWidget and DataGridHeaderWidget.
export class DataGridWidget {
    dataGridSpec: DataGridSpecBase;
    dataGridOwnerObject: DataGrid;

    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase) {
        this.dataGridOwnerObject = dataGridOwnerObject;
        this.dataGridSpec = dataGridSpec;
    }

    // Utility function to create a label element
    _createLabel(text: string, id: string, tip?: string): HTMLElement {
        const label: HTMLElement = document.createElement("label");
        label.setAttribute("for", id);
        label.appendChild(document.createTextNode(text));
        if (tip) {
            label.setAttribute("title", tip);
        }
        return label;
    }

    // Utility function to create a checkbox element
    _createCheckbox(id: string, name: string, value: string): HTMLInputElement {
        const cb: HTMLInputElement = document.createElement("input");
        cb.setAttribute("id", id);
        cb.setAttribute("name", name);
        cb.setAttribute("type", "checkbox");
        cb.setAttribute("value", value);
        return cb;
    }

    _createButton(id: string, name: string): HTMLInputElement {
        const cb: HTMLInputElement = document.createElement("input");
        cb.setAttribute("id", id);
        cb.setAttribute("name", name);
        cb.setAttribute("type", "button");
        return cb;
    }

    // This is called with an array of row elements, and the ID they represent, so the widget can
    //  apply any custom styling it needs. It is called one time for each ID and respective row
    //  array, during the construction of the table rows.
    initialFormatRowElementsForID(
        dataRowObjects: DataGridDataRow[],
        rowID: string,
    ): void {
        // no special formatting by default
    }

    // Notify the widget that the DataGrid has been updated
    refreshWidget(): void {
        // nothing by default
    }
}

// This is the base class for additional widgets
// that appear in the options menu of a DataGrid table.
// The default behavior is to create a checkbox element with a callback,
// and pair it with a label element.
// Each DataGridOptionWidget needs to implement an applyFilterToIDs function
// to provide some method for filtering a given list of IDs.
// This is how the widget affects which rows are displayed in the table.
// The DataGridSpec is responsible for instantiating
// these DataGridOptionWidget-derived objects for a particular table,
// and the DataGrid object is responsible for building the options menu
// that will store the checkbox and label elements.
export class DataGridOptionWidget extends DataGridWidget {
    _createdElements: boolean;
    // The base DataGridOptionWidget provides template code and structure
    // for creating a checkbox with a label,
    // but other UI can be created and used instead.
    checkBoxElement: HTMLInputElement;
    labelElement: HTMLElement;
    buttonElement: HTMLElement;

    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase) {
        super(dataGridOwnerObject, dataGridSpec);
        this._createdElements = false;
    }

    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID: string): string {
        return this.dataGridSpec.tableSpec.id + "GenericOptionCB" + uniqueID;
    }

    // Return text used to label the widget
    getLabelText(): string {
        return "Name Of Option";
    }

    // Mouseover text for the label (none by default)
    getLabelTitle(): string {
        return null;
    }

    // Handle activation of widget
    onWidgetChange(): void {
        this.dataGridOwnerObject.clickedOptionWidget();
    }

    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    createElements(uniqueID: string): void {
        const cbID: string = this.getIDFragment(uniqueID);
        const cb: HTMLInputElement = this._createCheckbox(cbID, cbID, "1");
        // We need to make sure the checkbox has a callback
        // to the DataGrid's handler function.
        // Among other things,
        // the handler function will call the appropriate filtering functions
        // for all the widgets in turn.
        $(cb).on("change.datagrid", () => this.onWidgetChange());
        if (this.isEnabledByDefault()) {
            cb.setAttribute("checked", "checked");
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel(
            this.getLabelText(),
            cbID,
            this.getLabelTitle(),
        );
        this._createdElements = true;
    }

    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet,
    // they are created, and the uniqueID is passed along.
    appendElements(container: Element, uniqueID: string): void {
        if (!this._createdElements) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.checkBoxElement);
        container.appendChild(this.labelElement);
    }

    // This is called with an array of IDs for filtering,
    // and a filtered array is returned.
    // It is acceptable to just return the original array
    // if no filtering needs to be done.
    //
    // It's up to the designer to decide
    // how the state of the widget affects filtering.
    // For example, if the widget is "additive",
    // you would apply filtering if the widget's checkbox is clear,
    // and skip filtering if the checkbox is set,
    // creating the appearance of a checkbox that "adds" rows when checked.
    applyFilterToIDs(rowIDs: string[]): string[] {
        return rowIDs;
    }

    // Returns true if the control is enabled
    getState(): boolean {
        return this.checkBoxElement.hasAttribute("checked");
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault(): boolean {
        return false;
    }

    // Sets the enabled state to true or false, based on the given value
    setState(enabled: boolean): void {
        if (enabled) {
            this.checkBoxElement.setAttribute("checked", "checked");
        } else {
            this.checkBoxElement.removeAttribute("checked");
        }
    }
}

// This is the base class for additional widgets that appear in the header area
// of a DataGrid table.
//
// The DataGridSpec is responsible for instantiating these DataGridOptionWidget-derived objects
// for a particular table,
// and the DataGrid object is responsible for building the header area
// that will contain the widgets.
export class DataGridHeaderWidget extends DataGridWidget {
    private _createdElements: boolean;
    // Whether to add this widget to the header of the table before the view menu,
    // instead of the default of after.
    // This option is set by an accessor function
    // meant to be called shortly after instantiation.
    private _displayBeforeViewMenuFlag: boolean;
    // The base DataGridHeaderWidget provides template code that just creates a text field,
    // but other UI can be created and used instead.
    element: HTMLElement;

    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase) {
        super(dataGridOwnerObject, dataGridSpec);
        this._displayBeforeViewMenuFlag = false;
        this._createdElements = false;
    }

    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    createElements(uniqueID: string): void {
        const tBoxID: string = this.dataGridSpec.tableSpec.id + "text" + uniqueID;
        $((this.element = document.createElement("input")))
            .attr({ "id": tBoxID, "name": tBoxID, "size": "20" })
            .addClass("tableControl");
    }

    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet,
    // they are created, and the uniqueID is passed along.
    appendElements(container: Element, uniqueID: string): void {
        if (!this._createdElements) {
            this.createElements(uniqueID);
            this.createdElements(true);
        }
        container.appendChild(this.element);
    }

    createdElements(): boolean;
    createdElements(flag: boolean): DataGridHeaderWidget;
    createdElements(flag?: boolean): any {
        if (flag === undefined) {
            return this._createdElements;
        } else {
            this._createdElements = flag;
            return this;
        }
    }

    // Whether to add this widget to the header of the table
    // before the view menu, instead of the default of after.
    // Pass in "false" to reverse the setting.
    displayBeforeViewMenu(): boolean;
    displayBeforeViewMenu(flag: boolean): DataGridHeaderWidget;
    displayBeforeViewMenu(flag?: boolean): any {
        if (flag === undefined) {
            return this._displayBeforeViewMenuFlag;
        } else {
            this._displayBeforeViewMenuFlag = flag;
            return this;
        }
    }

    // This is called with an array of record IDs for filtering, and a filtered array is returned.
    // It is acceptable to just return the original array if no record filtering needs to be done.
    applyFilterToIDs(rowIDs: string[]): string[] {
        return rowIDs;
    }
}

// A generic "Select All" header widget, appearing as a button.
// When clicked, it walks through every row and cell looking for DataGrid-created checkboxes,
// and checks every one it finds.
export class DGSelectAllWidget extends DataGridHeaderWidget {
    private anySelected: boolean;

    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase) {
        super(dataGridOwnerObject, dataGridSpec);
    }

    // The uniqueID is provided to assist the widget in avoiding collisions
    // when creating input element labels or other things requiring an ID.
    createElements(uniqueID: string): void {
        const buttonID: string = this.dataGridSpec.tableSpec.id + "SelAll" + uniqueID;
        const button = $((this.element = document.createElement("input")));
        button
            .attr({ "id": buttonID, "name": buttonID, "value": "Select All" })
            .addClass("tableControl")
            .click(() => this.clickHandler());
        this.element.setAttribute("type", "button"); // JQuery attr cannot do this
        this.anySelected = false;
    }

    refreshWidget(): void {
        this.testIfAnySelected();
        this.updateButtonLabel();
    }

    updateButtonLabel(): void {
        const actionButtonSelectors = [
            "#editButton",
            "#cloneButton",
            "#groupButton",
            "#addAssayButton",
            "#disableButton",
            "#enableButton",
        ].join(",");
        if (this.anySelected) {
            this.element.setAttribute("value", "Select None");
            // disable action buttons
            $(actionButtonSelectors).prop("disabled", false);
        } else {
            this.element.setAttribute("value", "Select All");
            $(actionButtonSelectors).prop("disabled", true);
        }
    }

    clickHandler(): void {
        $(this.dataGridSpec.tableElement)
            .find("tbody input[type=checkbox]")
            .prop("checked", !this.anySelected);
        this.anySelected = !this.anySelected;
        this.updateButtonLabel();
    }

    testIfAnySelected(): boolean {
        this.anySelected =
            $(this.dataGridSpec.tableElement).find("tbody input[type=checkbox]:checked")
                .length > 0;
        return this.anySelected;
    }
}

// Here's an example of a working DataGridHeaderWidget.
// It's a search field that narrows the set of rows to ones that contain the given string.
export class DGSearchWidget extends DataGridHeaderWidget {
    searchBoxElement: HTMLInputElement;
    placeHolder: string;
    fieldSize: number;
    typingTimeout: number;
    typingDelay: number;
    lastKeyPressCode: number;
    previousSelection: any;
    minCharsToTriggerSearch: number;
    // If true, the search box should be configured to claim focus as soon as the page is loaded
    getsFocus: boolean;

    constructor(
        dataGridOwnerObject: DataGrid,
        dataGridSpec: DataGridSpecBase,
        placeHolder: string,
        size: number,
        getsFocus: boolean,
    ) {
        super(dataGridOwnerObject, dataGridSpec);
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
    createElements(uniqueID: string): void {
        const sBoxID: string = this.dataGridSpec.tableSpec.id + "SearchBox" + uniqueID;
        const sBox: JQuery = $((this.element = document.createElement("input")))
            .attr({
                "id": sBoxID,
                "name": sBoxID,
                "size": this.fieldSize,
                "placeholder": this.placeHolder,
            })
            .addClass("tableControl searchBox")
            .keydown((e) => this.inputKeyDownHandler(e));
        this.element.setAttribute("type", "text"); // JQuery .attr() cannot set this
        if (this.getsFocus) {
            sBox.attr("autofocus", "autofocus");
        }
    }

    inputKeyDownHandler(e: JQuery.KeyDownEvent): void {
        // track last key pressed
        this.lastKeyPressCode = e.keyCode;
        switch (e.keyCode) {
            case 38: // up
                e.preventDefault();
                break;
            case 40: // down
                e.preventDefault();
                break;
            case 9: // tab
                break;
            case 13: // return
                e.preventDefault();
                break;
            default:
                if (this.typingTimeout) {
                    clearTimeout(this.typingTimeout);
                }
                this.typingTimeout = window.setTimeout(
                    this.typingDelayExpirationHandler,
                    this.typingDelay,
                );
                break;
        }
    }

    // (Note: This syntax causes "this" to behave in a non-Javascript way
    // see http://stackoverflow.com/questions/16157839/typescript-this-inside-a-class-method )
    typingDelayExpirationHandler = (): void => {
        // ignore if the following keys are pressed: [del] [shift] [capslock]
        if (this.lastKeyPressCode > 8 && this.lastKeyPressCode < 32) {
            return;
        }
        const v = $(this.element).val();
        if (v === this.previousSelection) {
            return;
        }
        this.previousSelection = v;
        this.dataGridOwnerObject.clickedHeaderWidget(this);
    };

    // This is called with an array of record IDs for filtering, and a filtered array is returned.
    // It is acceptable to just return the original array if no record filtering needs to be done.
    applyFilterToIDs(rowIDs: string[]): string[] {
        let v: any = this.previousSelection;
        if (v == null) {
            return rowIDs;
        }
        if (v.length < this.minCharsToTriggerSearch) {
            return rowIDs;
        }

        v = v.trim(); // Remove leading and trailing whitespace
        v = v.toLowerCase();
        v = v.replace(/\s\s*/, " "); // Replace internal whitespace with single spaces

        // If there are multiple words,
        // we look for each separately,
        // but expect to find all of them.
        // We will not attempt to match against empty strings,
        // so we filter those out if any slipped through.
        const queryStrs = v.split(" ").filter((one) => one.length > 0);
        if (queryStrs.length === 0) {
            return rowIDs;
        }

        const filteredIDs = [];
        this.dataGridOwnerObject.applyToRecordSet((rows, id) => {
            let thisRecordQueryStrs = queryStrs;
            // Go row by row, cell by cell, testing each query until it matches,
            // until we run out of unmatched queries (and return true) or run out
            // of rows and cells (and return false).
            const rowsMatch = rows.some((row) => {
                return row.dataGridDataCells.some((cell) => {
                    if (!cell.createdElement) {
                        return false;
                    }
                    const text = cell.contentContainerElement.textContent.toLowerCase();
                    const unmatchedQueryStrs = [];
                    thisRecordQueryStrs.forEach((queryStr) => {
                        if (
                            text.length < queryStr.length ||
                            text.indexOf(queryStr) < 0
                        ) {
                            unmatchedQueryStrs.push(queryStr);
                        }
                    });
                    if (unmatchedQueryStrs.length === 0) {
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
    }
}

export class DataGridSort {
    spec: DataGridHeaderSpec;
    asc: boolean;
}
export interface DGPageDataSource {
    pageSize(): number;
    pageSize(size: number): DGPageDataSource;
    pageSize(size?: number): any;
    totalOffset(): number;
    totalOffset(offset: number): DGPageDataSource;
    totalOffset(offset?: number): any;
    totalSize(): number;
    totalSize(size: number): DGPageDataSource;
    totalSize(size?: number): any;
    viewSize(): number;
    query(): string;
    query(query: string): DGPageDataSource;
    query(query?: string): any;
    filter(): any;
    filter(opt: any): DGPageDataSource;
    filter(opt?: any): any | DGPageDataSource;
    pageDelta(delta: number): DGPageDataSource;
    requestPageOfData(callback?: (success: boolean) => void): DGPageDataSource;
}

// This is a widget that will place controls for paging
export class DGPagingWidget extends DataGridHeaderWidget {
    private source: DGPageDataSource;
    private widgetElement: HTMLElement;
    private labelElement: HTMLElement;
    private nextElement: HTMLElement;
    private prevElement: HTMLElement;
    private requestDone: (success: boolean) => void = (success: boolean): void => {
        if (success) {
            this.dataGridOwnerObject.triggerDataReset();
        }
    };

    constructor(
        dataGridOwnerObject: DataGrid,
        dataGridSpec: DataGridSpecBase,
        source: DGPageDataSource,
    ) {
        super(dataGridOwnerObject, dataGridSpec);
        this.source = source;
        this.displayBeforeViewMenu(true);
    }

    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet,
    // they are created, and the uniqueID is passed along.
    appendElements(container: Element, uniqueID: string): void {
        if (!this.createdElements()) {
            $((this.widgetElement = document.createElement("div")));
            $(container).append(this.widgetElement);
            $((this.labelElement = document.createElement("span"))).appendTo(
                this.widgetElement,
            );
            $((this.prevElement = document.createElement("a")))
                .attr("href", "#")
                .css("margin", "0 5px")
                .text("< Previous")
                .addClass("disableLink")
                .appendTo(this.widgetElement)
                .click(() => {
                    this.source.pageDelta(-1).requestPageOfData(this.requestDone);
                    return false;
                });
            $((this.nextElement = document.createElement("a")))
                .attr("href", "#")
                .css("margin", "0 5px")
                .text("Next >")
                .prop("disabled", true)
                .appendTo(this.widgetElement)
                .click(() => {
                    this.source.pageDelta(1).requestPageOfData(this.requestDone);
                    return false;
                });
            this.createdElements(true);
            $(this.widgetElement).addClass("studyPrevNext");
        }
        this.refreshWidget();
    }

    refreshWidget(): void {
        const totalSize: number = this.source.totalSize();
        const viewSize: number = this.source.viewSize();
        const start: number = this.source.totalOffset();
        let labelText;
        if (totalSize) {
            labelText = [
                "Displaying ",
                start + 1,
                "-",
                start + viewSize,
                " of ",
                totalSize,
            ].join("");
        } else {
            labelText = "No results found!";
        }
        $(this.labelElement).text(labelText);
        if (!start) {
            $(this.prevElement).addClass("disableLink");
        } else {
            $(this.prevElement).removeClass("disableLink");
        }
        if (start + viewSize >= totalSize) {
            $(this.nextElement).addClass("disableLink");
        } else {
            $(this.nextElement).removeClass("disableLink");
        }
    }
}

// Define the TableSpec object used by DataGridSpecBase
export class DataGridTableSpec {
    // Label to put in the title header
    name: string;
    // A unique ID string for this table,
    // to cat with other ID strings for generated table elements
    id: string;
    // Index of header to sort by default
    defaultSort: number;
    // Whether to create a header area at the top of the table
    showHeader: boolean;

    constructor(id: string, opt?: { [index: string]: any }) {
        this.id = id; // ID is required, initialize sensible defaults for everything else
        opt = $.extend({ "name": "", "defaultSort": 0, "showHeader": true }, opt);
        this.name = opt.name;
        this.defaultSort = opt.defaultSort;
        this.showHeader = opt.showHeader;
    }
}

// Define the HeaderSpec object used by DataGridSpecBase
export class DataGridHeaderSpec {
    // The name that appears in the header cell, and in the column show/hide widget
    name: string;
    // An ID to assign to the element
    id: string;
    align: "left" | "right" | "center";
    valign: "top" | "middle" | "bottom" | "baseline";
    // If set, add a style that prevents long strings from wrapping in the cell
    nowrap: boolean;
    // Number to put in a rowspan for the header.
    rowspan: number;
    // Number to put in a colspan for the header.
    colspan: number;
    // Which row to place this header in, starting with 1 as the first row.
    // Used when constructing multi-row header sections
    // that use rowspan and colspan tags to make sub-headers.
    // Headers are inserted into their indicated rows
    // in the same relative order as they are listed in this spec.
    // Leaving this out will place the header in the first row.
    headerRow: number;
    // The column group this header belongs to.  Used for hiding and showing columns.
    columnGroup: number;
    display: "none" | "inline" | "block" | "list-item" | "inline-block";
    size: "m" | "s";
    // If present, set the header (and thereby the whole column below it) to a fixed width.
    width: string;
    // A function resolving a row ID to a value we can use for sorting by this header
    sortBy: (index: number) => any;
    // The index of another header that we will base these sorting results on
    // (e.g. sort by Description, then by Study Name)
    sortAfter: number;
    // an ID to use when sorting on server-side
    sortId: string;

    //
    // These are internal values that should not be defined by spec
    //
    hidden: boolean;
    element: HTMLElement;
    sortFunc: (a: number, b: number) => number;
    sorted: boolean;

    constructor(group: number, id: string, opt?: { [index: string]: any }) {
        this.columnGroup = group;
        // ID is required, initialize sensible defaults for everything else
        this.id = id;
        opt = $.extend(
            {
                "name": "",
                "align": "left",
                "size": "m",
                "sortAfter": -1,
            },
            opt,
        ); // most things can be null
        this.name = opt.name;
        this.align = opt.align;
        this.valign = opt.valign;
        this.nowrap = opt.nowrap;
        this.rowspan = opt.rowspan;
        this.colspan = opt.colspan;
        this.headerRow = opt.headerRow;
        this.display = opt.display;
        this.size = opt.size;
        this.width = opt.width;
        this.sortBy = opt.sortBy;
        this.sortAfter = opt.sortAfter;
        this.sortId = opt.sortId;
    }
}

// Define the ColumnSpec object used by DataGridSpecBase
export class DataGridColumnSpec {
    columnGroup: number;
    generateCellsFunction: (
        gridSpec: DataGridSpecBase,
        index: string,
    ) => DataGridDataCell[];

    //
    // These are internal values that should not be defined by spec
    //
    createdDataCellObjects: { [id: string]: DataGridDataCell[] };

    constructor(
        group: number,
        generateCells: (
            gridSpec: DataGridSpecBase,
            index: string,
        ) => DataGridDataCell[],
    ) {
        this.columnGroup = group;
        this.generateCellsFunction = generateCells;
        this.createdDataCellObjects = {};
    }

    generateCells(gridSpec: DataGridSpecBase, index: string): DataGridDataCell[] {
        const c = this.generateCellsFunction(gridSpec, index);
        this.createdDataCellObjects[index] = c.slice(0);
        return c;
    }

    clearIndexAtID(index: string): void {
        delete this.createdDataCellObjects[index];
    }

    cellIndexAtID(index: string): DataGridDataCell[] {
        return this.createdDataCellObjects[index];
    }

    getEntireIndex(): DataGridDataCell[] {
        const cells: DataGridDataCell[] = [];
        $.each(
            this.createdDataCellObjects,
            (key: string, objects: DataGridDataCell[]) => {
                if (objects) {
                    // Much faster than repeated concats
                    Array.prototype.push.apply(cells, objects);
                }
            },
        );
        return cells;
    }
}

// Define the ColumnGroupSpec object used by DataGridSpecBase
export class DataGridColumnGroupSpec {
    // Readable label string for this column group
    name: string;
    // Whether to place this column in the show/hide list
    showInVisibilityList: boolean;
    // Flag if group is hidden by default
    hiddenByDefault: boolean;
    // callback for when a column transitions from hidden to visible
    revealedCallback: (spec: DataGridSpecBase, grid: DataGrid) => void;

    //
    // These are internal values that should not be defined by spec
    //
    currentlyHidden: boolean;
    memberHeaders: DataGridHeaderSpec[];
    memberColumns: DataGridColumnSpec[];
    checkboxElement: HTMLInputElement;

    constructor(label: string, opt?: { [index: string]: any }) {
        this.name = label;
        opt = $.extend({ "showInVisibilityList": true }, opt);
        this.showInVisibilityList = opt.showInVisibilityList;
        this.hiddenByDefault = opt.hiddenByDefault;
        this.revealedCallback = opt.revealedCallback;
    }
}

// Define the RowGroupSpec object used by DataGridSpecBase
export class DataGridRowGroupSpec {
    name: string;

    //
    // These are internal values that should not be defined by spec
    //
    disclosed: boolean;
    replicateGroupTitleRow: HTMLElement;
    replicateGroupTitleRowJQ: JQuery;
    replicateGroupTableJQ: JQuery;
    replicateGroupTable: HTMLElement;
    memberRecords: DataGridRecord[];

    constructor(label: string) {
        this.name = label;
    }
}

// Users of DataGrid should derive from this class,
// altering the constructor to provide a specification
// for the layout, interface, and data sources of their DataGrid table,
// and override the callbacks to customize functionality.
// Then, when they instantiate a DataGrid,
// they should provide an instance of this derived DataGridSpecBase.
// As an example, this base class is set up to render the Studies table
// on the main page of the EDD.
export class DataGridSpecBase {
    // These will all be defined or set by the constructor
    tableSpec: DataGridTableSpec;
    tableHeaderSpec: DataGridHeaderSpec[];
    tableColumnSpec: DataGridColumnSpec[];
    tableColumnGroupSpec: DataGridColumnGroupSpec[];
    tableRowGroupSpec: DataGridRowGroupSpec[];
    tableElement: HTMLElement;

    constructor() {
        this.tableElement = null;
        this.tableSpec = null;
        this.tableHeaderSpec = null;
        this.tableColumnSpec = null;
        this.tableColumnGroupSpec = null;
        this.tableRowGroupSpec = null;
    }

    init(): void {
        this.tableElement = this.getTableElement();
        this.tableSpec = this.defineTableSpec();
        this.tableHeaderSpec = this.defineHeaderSpec();
        this.tableColumnSpec = this.defineColumnSpec();
        this.tableColumnGroupSpec = this.defineColumnGroupSpec();
        this.tableRowGroupSpec = this.defineRowGroupSpec();
    }

    // All of these "define" functions should be overridden

    // Specification for the table as a whole
    defineTableSpec(): DataGridTableSpec {
        return new DataGridTableSpec("uniquestring", { "name": "Awesome Table" });
    }

    // Specification for the headers along the top of the table
    defineHeaderSpec(): DataGridHeaderSpec[] {
        return [
            new DataGridHeaderSpec(1, "hName", { "name": "Name" }),
            new DataGridHeaderSpec(2, "hDesc", { "name": "Description" }),
        ];
    }

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec(): DataGridColumnSpec[] {
        return [
            new DataGridColumnSpec(
                1,
                (gridSpec: DataGridSpecBase, index: string): DataGridDataCell[] => {
                    // Create cell(s) for a given record ID, for column 1
                    return [new DataGridDataCell(gridSpec, index)];
                },
            ),
            new DataGridColumnSpec(
                2,
                (gridSpec: DataGridSpecBase, index: string): DataGridDataCell[] => {
                    // Create cell(s) for a given record ID, for column 2
                    return [new DataGridDataCell(gridSpec, index)];
                },
            ),
        ];
    }

    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec(): DataGridColumnGroupSpec[] {
        return [
            new DataGridColumnGroupSpec("Name", { "showInVisibilityList": false }),
            new DataGridColumnGroupSpec("Description"),
        ];
    }

    // Specification for the groups that rows can be gathered into
    defineRowGroupSpec(): DataGridRowGroupSpec[] {
        return [];
    }

    // attach event handlers for sorting
    enableSort(grid: DataGrid): DataGridSpecBase {
        this.tableHeaderSpec.forEach((header) => {
            if (header.sortBy) {
                $(header.element).on("click.datatable", (ev) =>
                    this.clickedSort(grid, header, ev),
                );
            }
        });
        return this;
    }

    // The server code hooks table headers with this function.
    private clickedSort(grid: DataGrid, header: DataGridHeaderSpec, ev) {
        let sort = grid.sortCols();
        if (sort.length && sort[0].spec.id === header.id) {
            sort[0].asc = !sort[0].asc;
        } else {
            sort = [{ "spec": header, "asc": true }];
        }
        grid.sortCols(sort).arrangeTableDataRows();
    }

    // When passed a record ID, returns the row group that the record is a member of.
    getRowGroupMembership(recordID: string): number {
        return 0;
    }

    // The table element on the page that will be turned into the DataGrid.
    // Any preexisting table content will be removed.
    getTableElement(): HTMLElement {
        return document.getElementById("studiesTable");
    }

    // An array of unique identifiers, used to identify the records in the data set being displayed
    getRecordIDs(): string[] {
        return [];
    }

    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[] {
        // Create a single widget for showing disabled Studies
        const array: DataGridHeaderWidget[] = [];
        array.push(new DGSearchWidget(dataGrid, this, "Search Studies", 40, true));
        return array;
    }

    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[] {
        const widgetSet: DataGridOptionWidget[] = [];

        // Create a single widget for showing only the Studies that belong to the current user
        //        var onlyMyStudiesWidget = new DGOnlyMyStudiesWidget(dataGrid, this);
        //        widgetSet.push(onlyMyStudiesWidget);
        // Create a single widget for showing disabled Studies
        //        var disabledStudiesWidget = new DGDisabledStudiesWidget(dataGrid, this);
        //        widgetSet.push(disabledStudiesWidget);
        return widgetSet;
    }

    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid: DataGrid): void {
        return;
    }

    // This is called when a data reset is triggered, but before the table rows are rebuilt.
    onDataReset(dataGrid: DataGrid): void {
        return; // Do nothing by default.
    }

    // This is called when a partial data reset is triggered,
    // but before the table rows are rebuilt.
    // A partial data reset is one where
    // a collection of records have been specified for re-parsing,
    // and will be mixed-in with the currently rendered collection afterwards.
    onPartialDataReset(dataGrid: DataGrid, records: string[]): void {
        return; // Do nothing by default.
    }

    // Called when the user hides or shows rows.
    onRowVisibilityChanged(): void {
        return;
    }

    // This is called to generate a group name. You can process your data however
    // you want in order to come up with a name.
    generateGroupName(dataGrid: DataGrid, groupID: string): string {
        return "Group " + groupID;
    }

    // This is called when the grouping setting is changed, in case
    // you want to persist the setting somewhere.
    onUpdatedGroupingEnabled(dataGrid: DataGrid, enabled: boolean): void {
        return;
    }
}
