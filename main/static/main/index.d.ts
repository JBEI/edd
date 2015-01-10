/// <reference path="EDDDataInterface.d.ts" />
/// <reference path="EditableElement.d.ts" />
/// <reference path="DataGrid.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="lib/jquery.d.ts" />
declare module IndexPage {
    function prepareIt(): void;
    function prepareTable(): void;
    function initDescriptionEditFields(): void;
}
declare class DataGridSpecStudies extends DataGridSpecBase implements DGPageDataSource {
    private dataObj;
    private _size;
    private _offset;
    private _pageSize;
    private _query;
    defineTableSpec(): DataGridTableSpec;
    private loadInstitution(index);
    defineHeaderSpec(): DataGridHeaderSpec[];
    generateStudyNameCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    generateDescriptionCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    generateOwnerInitialsCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    generateOwnerNameCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    generateInstitutionCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    generateCreatedCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    generateModifiedCells(gridSpec: DataGridSpecStudies, index: number): DataGridDataCell[];
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    getTableElement(): HTMLElement;
    getRecordIDs(): number[];
    pageSize(): number;
    pageSize(size: number): DGPageDataSource;
    totalOffset(): number;
    totalOffset(offset: number): DGPageDataSource;
    totalSize(): number;
    totalSize(size: number): DGPageDataSource;
    viewSize(): number;
    query(): string;
    query(query: string): DGPageDataSource;
    pageDelta(delta: number): DGPageDataSource;
    requestPageOfData(callback?: (success: boolean) => void): DGPageDataSource;
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGrid): void;
    data(): any;
    data(replacement: any, totalSize?: number, totalOffset?: number): DataGridSpecStudies;
    private _transformData(data);
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
    private _grid;
    private _spec;
    searchDisclosureElement: HTMLElement;
    constructor(dataGridOwnerObject: DataGrid, dataGridSpec: DataGridSpecStudies, placeHolder: string, size: number, getsFocus: boolean);
    appendElements(container: HTMLElement, uniqueID: string): void;
    applyFilterToIDs(rowIDs: number[]): number[];
    inputKeyDownHandler(e: any): void;
    typingDelayExpirationHandler: () => void;
}
declare class DGOnlyMyStudiesWidget extends DataGridOptionWidget {
    private _spec;
    constructor(grid: DataGrid, spec: DataGridSpecStudies);
    createElements(uniqueID: any): void;
    applyFilterToIDs(rowIDs: any): any;
    initialFormatRowElementsForID(dataRowObjects: DataGridDataRow[], rowID: number): void;
}
declare class DGDisabledStudiesWidget extends DataGridOptionWidget {
    private _spec;
    constructor(grid: DataGrid, spec: DataGridSpecStudies);
    createElements(uniqueID: any): void;
    applyFilterToIDs(rowIDs: number[]): number[];
    initialFormatRowElementsForID(dataRowObjects: DataGridDataRow[], rowID: number): any;
}
