/// <reference path="EDDDataInterface.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="Dragboxes.d.ts" />
/// <reference path="EditableElement.d.ts" />
/// <reference path="BiomassCalculationUI.d.ts" />
declare var EDDData: EDDData;
declare module StudyD {
    var metabolicMapID: any;
    var metabolicMapName: any;
    var biomassCalculation: number;
    class GenericFilterSection {
        uniqueValues: any;
        uniqueValuesOrder: any;
        filterHash: any;
        checkboxes: any;
        previousCheckboxState: any;
        tableRows: any;
        filterColumnDiv: any;
        titleElement: any;
        searchBoxElement: HTMLInputElement;
        scrollZoneDiv: any;
        filteringTable: any;
        tableBodyElement: any;
        typingTimeout: number;
        typingDelay: number;
        currentSearchSelection: string;
        previousSearchSelection: string;
        minCharsToTriggerSearch: number;
        anyCheckboxesChecked: boolean;
        sectionTitle: string;
        sectionShortLabel: string;
        constructor();
        configure(): void;
        createContainerObjects(): void;
        processFilteringData(ids: string[]): void;
        buildUniqueValuesHash(ids: string[]): any;
        isFilterUseful(): boolean;
        addToParent(parentDiv: any): void;
        applyBackgroundStyle(darker: number): void;
        populateTable(): void;
        anyCheckboxesChangedSinceLastInquiry(): boolean;
        applyProgressiveFiltering(ids: any[]): any;
        _assayIdToAssay(assayId: string): any;
        _assayIdToLine(assayId: string): LineRecord;
        _assayIdToProtocol(assayId: string): any;
        getIdMapToValues(): (id: string) => any[];
    }
    class StrainFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: string[]): any;
    }
    class CarbonSourceFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: string[]): any;
    }
    class CarbonLabelingFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: string[]): any;
    }
    class LineNameFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: string[]): any;
    }
    class ProtocolFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: string[]): any;
    }
    class AssaySuffixFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: string[]): any;
    }
    class MetaDataFilterSection extends GenericFilterSection {
        metaDataID: string;
        pre: string;
        post: string;
        constructor(metaDataID: string);
        configure(): void;
    }
    class LineMetaDataFilterSection extends MetaDataFilterSection {
        buildUniqueValuesHash(ids: string[]): any;
    }
    class AssayMetaDataFilterSection extends MetaDataFilterSection {
        buildUniqueValuesHash(ids: string[]): any;
    }
    class MetaboliteCompartmentFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(amIDs: string[]): any;
    }
    class MetaboliteFilterSection extends GenericFilterSection {
        loadPending: boolean;
        configure(): void;
        isFilterUseful(): boolean;
        buildUniqueValuesHash(amIDs: string[]): any;
    }
    class ProteinFilterSection extends GenericFilterSection {
        loadPending: boolean;
        configure(): void;
        isFilterUseful(): boolean;
        buildUniqueValuesHash(amIDs: string[]): any;
    }
    class GeneFilterSection extends GenericFilterSection {
        loadPending: boolean;
        configure(): void;
        isFilterUseful(): boolean;
        buildUniqueValuesHash(amIDs: string[]): any;
    }
    function prepareIt(): void;
    function prepareFilteringSection(): void;
    function repopulateFilteringSection(): void;
    function processCarbonBalanceData(): void;
    function prepareAfterLinesTable(): void;
    function carbonBalanceColumnRevealedCallback(index: any, spec: DataGridSpecLines, dataGridObj: DataGrid): void;
    function queueLinesActionPanelShow(): void;
    function queueAssaysActionPanelShow(): void;
    function queueMainGraphRemake(force?: boolean): void;
    function addCarbonSourceRow(carbonId: any): void;
    function removeCarbonSourceRow(order: any): void;
    function disableAllButFirstCarbonSourceRow(): void;
    function redrawCarbonSourceRows(): void;
    function editLine(index: any): void;
    function editAssay(linkelement: any, index: any): void;
    function addMetaboliteRow(): void;
    function removeMeasurementTypeRow(order: any): void;
    function redrawMeasurementTypeRows(): void;
    function setAttachmentDescription(element: any, attachmentID: any, newDescription: any): void;
    function initDescriptionEditFields(): void;
    function onChangedMetabolicMap(): void;
    function rebuildCarbonBalanceGraphs(columnIndex: number): void;
    function onClickedMetabolicMapName(): void;
}
declare class DataGridSpecLines extends DataGridSpecBase {
    metaDataIDsUsedInLines: any;
    groupIDsInOrder: any;
    groupIDsToGroupIndexes: any;
    groupIDsToGroupNames: any;
    carbonBalanceWidget: DGShowCarbonBalanceWidget;
    constructor();
    highlightCarbonBalanceWidget(v: boolean): void;
    enableCarbonBalanceWidget(v: boolean): void;
    findMetaDataIDsUsedInLines(): void;
    findGroupIDsAndNames(): void;
    defineTableSpec(): DataGridTableSpec;
    private loadLineName(index);
    private loadStrainName(index);
    private loadFirstCarbonSource(index);
    private loadCarbonSource(index);
    private loadCarbonSourceLabeling(index);
    private loadExperimenterInitials(index);
    private loadLineModification(index);
    defineHeaderSpec(): DataGridHeaderSpec[];
    private makeMetaDataSortFunction(id);
    private rowSpanForRecord(index);
    generateLineNameCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    generateStrainNameCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    generateCarbonSourceCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    generateCarbonSourceLabelingCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    generateCarbonBalanceBlankCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    generateExperimenterInitialsCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    generateModificationDateCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[];
    makeMetaDataCellsGeneratorFunction(id: any): (gridSpec: DataGridSpecLines, index: string) => DataGridDataCell[];
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    defineRowGroupSpec(): any;
    getTableElement(): HTMLElement;
    getRecordIDs(): string[];
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGrid): void;
}
declare class DGDisabledLinesWidget extends DataGridOptionWidget {
    createElements(uniqueID: any): void;
    applyFilterToIDs(rowIDs: string[]): string[];
    initialFormatRowElementsForID(dataRowObjects: any, rowID: string): any;
}
declare class DGGroupStudyReplicatesWidget extends DataGridOptionWidget {
    createElements(uniqueID: any): void;
}
declare class DGLinesSearchWidget extends DGSearchWidget {
    searchDisclosureElement: any;
    constructor(dataGridOwnerObject: any, dataGridSpec: any, placeHolder: string, size: number, getsFocus: boolean);
    createElements(uniqueID: any): void;
    appendElements(container: any, uniqueID: any): void;
}
declare class DGShowCarbonBalanceWidget extends DataGridHeaderWidget {
    checkBoxElement: any;
    labelElement: any;
    highlighted: boolean;
    checkboxEnabled: boolean;
    constructor(dataGridOwnerObject: any, dataGridSpec: any);
    createElements(uniqueID: any): void;
    highlight(h: boolean): void;
    enable(h: boolean): void;
    clickHandler: (e: any) => void;
}
declare class DataGridAssays extends DataGrid {
    sectionCurrentlyDisclosed: boolean;
    graphRefreshTimerID: any;
    recordsCurrentlyInvalidated: number[];
    constructor(dataGridSpec: DataGridSpecBase);
    invalidateAssayRecords(records: number[]): void;
    clickedDisclose(disclose: boolean): void;
    triggerAssayRecordsRefresh(): void;
    private _cancelGraph();
    queueGraphRemake(): void;
    remakeGraphArea(): void;
    resizeGraph(g: any): void;
}
declare class DataGridSpecAssays extends DataGridSpecBase {
    protocolID: any;
    protocolName: string;
    assayIDsInProtocol: string[];
    metaDataIDsUsedInAssays: any;
    maximumXValueInData: number;
    undisclosedSectionDiv: any;
    measuringTimesHeaderSpec: DataGridHeaderSpec;
    graphAreaHeaderSpec: DataGridHeaderSpec;
    graphObject: any;
    constructor(protocolID: any);
    refreshIDList(): void;
    getRecordIDs(): string[];
    onDataReset(dataGrid: DataGrid): void;
    getTableElement(): HTMLElement;
    defineTableSpec(): DataGridTableSpec;
    findMetaDataIDsUsedInAssays(): void;
    findMaximumXValueInData(): void;
    private loadAssayName(index);
    private loadExperimenterInitials(index);
    private loadAssayModification(index);
    defineHeaderSpec(): DataGridHeaderSpec[];
    private makeMetaDataSortFunction(id);
    private rowSpanForRecord(index);
    generateAssayNameCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    makeMetaDataCellsGeneratorFunction(id: any): (gridSpec: DataGridSpecAssays, index: string) => DataGridDataCell[];
    private generateMeasurementCells(gridSpec, index, opt);
    generateMeasurementNameCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    generateUnitsCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    generateCountCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    generateMeasuringTimesCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    generateExperimenterCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    generateModificationDateCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[];
    assembleSVGStringForDataPoints(points: any, format: string): string;
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGridAssays): void;
}
declare class DGDisabledAssaysWidget extends DataGridOptionWidget {
    createElements(uniqueID: any): void;
    applyFilterToIDs(rowIDs: string[]): string[];
    initialFormatRowElementsForID(dataRowObjects: any, rowID: any): any;
}
declare class DGAssaysSearchWidget extends DGSearchWidget {
    searchDisclosureElement: any;
    constructor(dataGridOwnerObject: any, dataGridSpec: any, placeHolder: string, size: number, getsFocus: boolean);
    createElements(uniqueID: any): void;
    appendElements(container: any, uniqueID: any): void;
}
