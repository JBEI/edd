/// <reference path="EDDDataInterface.d.ts" />
/// <reference path="EditableElement.d.ts" />
/// <reference path="DataGrid.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="lib/jquery.d.ts" />
declare var EDDData: EDDData;
declare module IndexPage {
    function prepareIt(): void;
    function disclose(): boolean;
    function prepareTable(): void;
    function initDescriptionEditFields(): void;
}
declare class DataGridSpecStudies extends DataGridSpecBase implements DGPageDataSource {
    private dataObj;
    private recordIds;
    private _size;
    private _offset;
    private _pageSize;
    private _query;
    private _searchOpt;
    descriptionCol: DataGridColumnSpec;
    defineTableSpec(): DataGridTableSpec;
    defineHeaderSpec(): DataGridHeaderSpec[];
    generateStudyNameCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    generateDescriptionCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    generateOwnerInitialsCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    generateOwnerNameCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    generateInstitutionCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    generateCreatedCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    generateModifiedCells(gridSpec: DataGridSpecStudies, index: string): DataGridDataCell[];
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    getTableElement(): HTMLElement;
    getRecordIDs(): string[];
    enableSort(grid: DataGrid): DataGridSpecStudies;
    private columnSort(grid, header, ev);
    pageSize(): number;
    pageSize(size: number): DGPageDataSource;
    totalOffset(): number;
    totalOffset(offset: number): DGPageDataSource;
    totalSize(): number;
    totalSize(size: number): DGPageDataSource;
    viewSize(): number;
    query(): string;
    query(query: string): DGPageDataSource;
    filter(): any;
    filter(opt: any): DGPageDataSource;
    pageDelta(delta: number): DGPageDataSource;
    requestPageOfData(callback?: (success: boolean) => void): DGPageDataSource;
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGrid): void;
    data(): any;
    data(replacement: any[], totalSize?: number, totalOffset?: number): DataGridSpecStudies;
    private _transformData(docs);
}
interface TextRegion {
    begin: number;
    end: number;
    source: string;
}
declare class ResultMatcher {
    private _query;
    private _match;
    constructor(query: string);
    findAndSet(field: string, source: string): ResultMatcher;
    getFields(): string[];
    getMatches(field: string, prefix?: string, postfix?: string, slop?: number): string[];
}
declare class DGStudiesSearchWidget extends DGSearchWidget {
    private _spec;
    searchDisclosureElement: HTMLElement;
    constructor(grid: DataGrid, spec: DataGridSpecStudies, placeHolder: string, size: number, getsFocus: boolean);
    appendElements(container: HTMLElement, uniqueID: string): void;
    applyFilterToIDs(rowIDs: string[]): string[];
    inputKeyDownHandler(e: any): void;
    typingDelayExpirationHandler: () => void;
}
declare class DGOnlyMyStudiesWidget extends DataGridOptionWidget {
    private _spec;
    constructor(grid: DataGrid, spec: DataGridSpecStudies);
    getIDFragment(): string;
    getLabelText(): string;
    onWidgetChange(e: any): void;
}
declare class DGDisabledStudiesWidget extends DataGridOptionWidget {
    private _spec;
    constructor(grid: DataGrid, spec: DataGridSpecStudies);
    getIDFragment(): string;
    getLabelText(): string;
    onWidgetChange(e: any): void;
    initialFormatRowElementsForID(dataRowObjects: DataGridDataRow[], rowID: string): any;
}
