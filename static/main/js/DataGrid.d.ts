/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="Dragboxes.d.ts" />
/// <reference path="lib/jquery.d.ts" />
declare class DataGrid {
    private _spec;
    private _table;
    private _tableBody;
    private _tableHeaderCell;
    private _waitBadge;
    private tableTitleSpan;
    private _headerRows;
    private _totalColumnCount;
    private _recordElements;
    private _headerWidgets;
    private _optionsMenuWidgets;
    private _optionsMenuElement;
    private _optionsMenuBlockElement;
    private _optionsLabel;
    private _groupingEnabled;
    private _sort;
    private _sequence;
    private _timers;
    constructor(dataGridSpec: DataGridSpecBase);
    _initializeTableData(): DataGrid;
    _initializeSort(): DataGrid;
    triggerDataReset(): DataGrid;
    triggerPartialDataReset(recordIDs: string[], reflow: boolean): DataGrid;
    reconstructSingleRecord(recordID: string): DataGrid;
    private _createOptionsMenu();
    private _createHeaderWidgets();
    prepareColumnVisibility(): void;
    private _applyColumnVisibility();
    private _applyColumnVisibilityToOneRecord(recordID);
    getSelectedCheckboxElements(): HTMLInputElement[];
    applySortIndicators(): void;
    arrangeTableDataRows(): DataGrid;
    applyAllWidgetFiltering(filteredSequence: string[]): string[];
    getSpec(): any;
    countTotalColumns(): number;
    private _buildAllTableSorters();
    buildTableSorter(lookupFunc: (rowIndex: number) => any): (x: number, y: number) => number;
    private _buildTableSortSequences();
    private _getSequence(sort);
    private _buildTableHeaders();
    private _allocateTableRowRecords();
    private _buildRowGroupTitleRows();
    private _prepareSortable();
    private _showOptMenu();
    private _hideOptMenu();
    private _collapseRowGroup(groupIndex);
    private _expandRowGroup(groupIndex);
    turnOnRowGrouping(): void;
    turnOffRowGrouping(): void;
    clickedOptionWidget(event: Event): void;
    clickedHeaderWidget(headerWidget: DataGridWidget): void;
    private _clickedColVisibilityControl(event);
    showColumn(group: DataGridColumnGroupSpec): void;
    hideColumn(group: DataGridColumnGroupSpec): void;
    private _basePayload();
    private _columnSettingsKey();
    private _fetchSettings(propKey, callback, defaultValue?);
    private _updateColumnSettings();
    scheduleTimer(uid: string, func: () => any): DataGrid;
    applyToRecordSet(func: (rows: DataGridDataRow[], id: string, spec: DataGridSpecBase, grid: DataGrid) => void, ids: string[]): DataGrid;
    currentSequence(): string[];
    sortCols(): DataGridSort[];
    sortCols(cols: DataGridSort[]): DataGrid;
}
declare class DataGridRecordSet {
    [index: string]: DataGridRecord;
}
declare class DataGridRecord {
    gridSpec: DataGridSpecBase;
    recordID: string;
    dataGridDataRows: DataGridDataRow[];
    rowElements: HTMLElement[];
    createdElements: boolean;
    stripeStyles: string[];
    stripeStylesJoin: string;
    recentStripeIndex: any;
    constructor(gridSpec: DataGridSpecBase, id: string);
    reCreateElementsInPlace(): void;
    createElements(): void;
    removeElements(): void;
    detachElements(): void;
    getDataGridDataRows(): DataGridDataRow[];
    getElements(): HTMLElement[];
    applyStriping(stripeIndex: number): void;
}
declare class DataGridDataRow {
    rowElement: HTMLElement;
    rowElementJQ: JQuery;
    recordID: string;
    dataGridDataCells: DataGridDataCell[];
    createdElement: boolean;
    constructor(id: string, cells: DataGridDataCell[]);
    createElement(): void;
    removeElement(): void;
    detachElement(): void;
    getElement(): HTMLElement;
    getElementJQ(): JQuery;
}
declare class DataGridDataCell {
    gridSpec: DataGridSpecBase;
    recordID: string;
    rowspan: number;
    colspan: number;
    align: string;
    valign: string;
    maxWidth: string;
    minWidth: string;
    nowrap: boolean;
    hoverEffect: boolean;
    contentFunction: (e: HTMLElement, index: number) => void;
    contentString: string;
    checkboxWithID: (index: number) => string;
    checkboxName: string;
    customID: (index: number) => string;
    sideMenuItems: string[];
    cellElement: HTMLElement;
    cellElementJQ: JQuery;
    contentContainerElement: HTMLElement;
    checkboxElement: HTMLInputElement;
    hidden: boolean;
    createdElement: boolean;
    constructor(gridSpec: DataGridSpecBase, id: string, opt?: {
        [x: string]: any;
    });
    createElement(): void;
    getElement(): HTMLElement;
    getCheckboxElement(): HTMLInputElement;
    hide(): void;
    unhide(): void;
}
declare class DataGridLoadingCell extends DataGridDataCell {
    constructor(gridSpec: DataGridSpecBase, id: string, opt?: {
        [x: string]: any;
    });
}
declare class DataGridWidget {
    dataGridSpec: DataGridSpecBase;
    dataGridOwnerObject: DataGrid;
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase);
    _createLabel(text: string, id: string): HTMLElement;
    _createCheckbox(id: string, name: string, value: string): HTMLInputElement;
    initialFormatRowElementsForID(dataRowObjects: DataGridDataRow[], rowID: string): void;
    refreshWidget(): void;
}
declare class DataGridOptionWidget extends DataGridWidget {
    _createdElements: boolean;
    checkBoxElement: HTMLInputElement;
    labelElement: HTMLElement;
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase);
    getIDFragment(): string;
    getLabelText(): string;
    onWidgetChange(e: any): void;
    createElements(uniqueID: string): void;
    appendElements(container: HTMLElement, uniqueID: string): void;
    applyFilterToIDs(rowIDs: string[]): string[];
    getState(): boolean;
    isEnabledByDefault(): boolean;
    setState(enabled: boolean): void;
}
declare class DataGridHeaderWidget extends DataGridWidget {
    private _createdElements;
    private _displayBeforeViewMenuFlag;
    element: HTMLElement;
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase);
    createElements(uniqueID: string): void;
    appendElements(container: HTMLElement, uniqueID: string): void;
    createdElements(): boolean;
    createdElements(flag: boolean): DataGridHeaderWidget;
    displayBeforeViewMenu(): boolean;
    displayBeforeViewMenu(flag: boolean): DataGridHeaderWidget;
    applyFilterToIDs(rowIDs: string[]): string[];
}
declare class DGSelectAllWidget extends DataGridHeaderWidget {
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase);
    createElements(uniqueID: string): void;
    clickHandler(): void;
}
declare class DGSearchWidget extends DataGridHeaderWidget {
    searchBoxElement: HTMLInputElement;
    placeHolder: string;
    fieldSize: number;
    typingTimeout: number;
    typingDelay: number;
    lastKeyPressCode: number;
    previousSelection: string;
    minCharsToTriggerSearch: number;
    getsFocus: boolean;
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase, placeHolder: string, size: number, getsFocus: boolean);
    createElements(uniqueID: string): void;
    inputKeyDownHandler(e: any): void;
    typingDelayExpirationHandler: () => void;
    applyFilterToIDs(rowIDs: string[]): string[];
}
declare class DataGridSort {
    spec: DataGridHeaderSpec;
    asc: boolean;
}
interface DGPageDataSource {
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
    filter(opt?: any): any;
    pageDelta(delta: number): DGPageDataSource;
    requestPageOfData(callback?: (success: boolean) => void): DGPageDataSource;
}
declare class DGPagingWidget extends DataGridHeaderWidget {
    private source;
    private widgetElement;
    private labelElement;
    private nextElement;
    private prevElement;
    private requestDone;
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecBase, source: DGPageDataSource);
    appendElements(container: HTMLElement, uniqueID: string): void;
    refreshWidget(): void;
}
declare class DataGridTableSpec {
    name: string;
    id: string;
    defaultSort: number;
    showHeader: boolean;
    applyStriping: boolean;
    constructor(id: string, opt?: {
        [x: string]: any;
    });
}
declare class DataGridHeaderSpec {
    name: string;
    id: string;
    align: string;
    valign: string;
    nowrap: boolean;
    rowspan: number;
    colspan: number;
    headerRow: number;
    columnGroup: number;
    display: string;
    size: string;
    width: string;
    sortBy: (index: number) => any;
    sortAfter: number;
    sortId: string;
    hidden: boolean;
    element: HTMLElement;
    sortFunc: (a: number, b: number) => number;
    sorted: boolean;
    constructor(group: number, id: string, opt?: {
        [x: string]: any;
    });
}
declare class DataGridColumnSpec {
    columnGroup: number;
    generateCellsFunction: (gridSpec: DataGridSpecBase, index: string) => DataGridDataCell[];
    createdDataCellObjects: {
        [x: string]: DataGridDataCell[];
    };
    constructor(group: number, generateCells: (gridSpec: DataGridSpecBase, index: string) => DataGridDataCell[]);
    generateCells(gridSpec: DataGridSpecBase, index: string): DataGridDataCell[];
    clearIndexAtID(index: string): void;
    cellIndexAtID(index: string): DataGridDataCell[];
    getEntireIndex(): DataGridDataCell[];
}
declare class DataGridColumnGroupSpec {
    name: string;
    showInVisibilityList: boolean;
    hiddenByDefault: boolean;
    revealedCallback: (spec: DataGridSpecBase, grid: DataGrid) => void;
    currentlyHidden: boolean;
    memberHeaders: DataGridHeaderSpec[];
    memberColumns: DataGridColumnSpec[];
    checkboxElement: HTMLInputElement;
    constructor(label: string, opt?: {
        [x: string]: any;
    });
}
declare class DataGridRowGroupSpec {
    name: string;
    disclosed: boolean;
    disclosedTitleRow: HTMLElement;
    disclosedTitleRowJQ: JQuery;
    undisclosedTitleRow: HTMLElement;
    undisclosedTitleRowJQ: JQuery;
    memberRecords: DataGridRecord[];
    constructor(label: string);
}
declare class DataGridSpecBase {
    tableSpec: DataGridTableSpec;
    tableHeaderSpec: DataGridHeaderSpec[];
    tableColumnSpec: DataGridColumnSpec[];
    tableColumnGroupSpec: DataGridColumnGroupSpec[];
    tableRowGroupSpec: DataGridRowGroupSpec[];
    tableElement: HTMLElement;
    constructor();
    defineTableSpec(): DataGridTableSpec;
    defineHeaderSpec(): DataGridHeaderSpec[];
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    defineRowGroupSpec(): DataGridRowGroupSpec[];
    enableSort(grid: DataGrid): DataGridSpecBase;
    private clickedSort(grid, header, ev);
    getRowGroupMembership(recordID: string): number;
    getTableElement(): HTMLElement;
    getRecordIDs(): string[];
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGrid): void;
    onDataReset(dataGrid: DataGrid): void;
    onPartialDataReset(dataGrid: DataGrid, records: string[]): void;
    onRowVisibilityChanged(): void;
    generateGroupName(dataGrid: DataGrid, groupID: string): string;
    onUpdatedGroupingEnabled(dataGrid: DataGrid, enabled: boolean): void;
}
