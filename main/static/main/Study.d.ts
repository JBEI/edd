/// <reference path="EDDDataInterface.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="Autocomplete.d.ts" />
/// <reference path="Dragboxes.d.ts" />
/// <reference path="EditableElement.d.ts" />
/// <reference path="BiomassCalculationUI.d.ts" />
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
        gotFirstFocus: boolean;
        currentSearchSelection: string;
        previousSearchSelection: string;
        minCharsToTriggerSearch: number;
        anyCheckboxesChecked: boolean;
        sectionTitle: string;
        sectionShortLabel: string;
        constructor();
        configure(): void;
        createContainerObjects(): void;
        inputFocusInHandler(e: any): void;
        processFilteringData(ids: any): void;
        buildUniqueValuesHash(ids: any): any;
        isFilterUseful(): boolean;
        addToParent(parentDiv: any): void;
        applyBackgroundStyle(darker: number): void;
        populateTable(): void;
        anyCheckboxesChangedSinceLastInquiry(): boolean;
        applyProgressiveFiltering(ids: any): any;
    }
    class StrainFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class MediaFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class CarbonSourceFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class CarbonLabelingFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class LineNameFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class ProtocolFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class AssaySuffixFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(ids: any): any;
    }
    class MetaDataFilterSection extends GenericFilterSection {
        metaDataID: any;
        pre: string;
        post: string;
        constructor(metaDataID: any);
        configure(): void;
    }
    class LineMetaDataFilterSection extends MetaDataFilterSection {
        buildUniqueValuesHash(ids: any): any;
    }
    class AssayMetaDataFilterSection extends MetaDataFilterSection {
        buildUniqueValuesHash(ids: any): any;
    }
    class MetaboliteCompartmentFilterSection extends GenericFilterSection {
        configure(): void;
        buildUniqueValuesHash(amIDs: any): any;
    }
    class MetaboliteFilterSection extends GenericFilterSection {
        loadPending: boolean;
        configure(): void;
        isFilterUseful(): boolean;
        buildUniqueValuesHash(amIDs: any): any;
    }
    class ProteinFilterSection extends GenericFilterSection {
        loadPending: boolean;
        configure(): void;
        isFilterUseful(): boolean;
        buildUniqueValuesHash(amIDs: any): any;
    }
    class GeneFilterSection extends GenericFilterSection {
        loadPending: boolean;
        configure(): void;
        isFilterUseful(): boolean;
        buildUniqueValuesHash(amIDs: any): any;
    }
    function prepareIt(): void;
    function prepareFilteringSection(): void;
    function repopulateFilteringSection(): void;
    function processCarbonBalanceData(): void;
    function filterTableKeyDown(e: any): void;
    function prepareAfterLinesTable(): void;
    function requestAllMetaboliteData(): void;
    function requestAllProteinData(): void;
    function requestAllGeneData(): void;
    function processNewMetaboliteData(data: any): void;
    function processNewProteinData(data: any): void;
    function processNewGeneData(data: any): void;
    function carbonBalanceColumnRevealedCallback(index: any, spec: DataGridSpecLines, dataGridObj: DataGrid): void;
    function queueLinesActionPanelShow(): void;
    function linesActionPanelShow(): void;
    function queueAssaysActionPanelShow(): void;
    function assaysActionPanelShow(): void;
    function queueMainGraphRemake(): void;
    function remakeMainGraphArea(force?: boolean): void;
    function addCarbonSourceRow(v: any): void;
    function removeCarbonSourceRow(order: any): void;
    function disableAllButFirstCarbonSourceRow(): void;
    function redrawCarbonSourceRows(): void;
    function editLine(linkelement: any, index: any): void;
    function editAssay(linkelement: any, index: any): void;
    function addMetaboliteRow(): void;
    function removeMeasurementTypeRow(order: any): void;
    function redrawMeasurementTypeRows(): void;
    function setAttachmentDescription(element: any, attachmentID: any, newDescription: any): void;
    function initDescriptionEditFields(): void;
    function onChangedMetabolicMap(): void;
    function rebuildCarbonBalanceGraphs(columnIndex: number): void;
    function setupPermissionsLink(): void;
    function verifyPermissionsChange(newPermissions: any, onComplete: any): void;
    function onClickedMetabolicMapName(): void;
    function submitToStudy(action: any): void;
    function takeLinesAction(): void;
    function takeAssaysAction(): void;
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
    generateGroupName(rowIDs: any): string;
    private _longestCommonSubstring(names);
    private _longestCommonSubstringBetweenTwo(str1, str2);
    defineTableSpec(): DataGridTableSpec;
    private loadLineName(index);
    private loadStrainName(index);
    private loadMedia(index);
    private loadCarbonSource(index);
    private loadCarbonSourceLabeling(index);
    private loadExperimenterInitials(index);
    private loadLineModification(index);
    defineHeaderSpec(): DataGridHeaderSpec[];
    private makeMetaDataSortFunction(id);
    private rowSpanForRecord(index);
    generateLineNameCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateStrainNameCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateMediaCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateCarbonSourceCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateCarbonSourceLabelingCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateCarbonBalanceBlankCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateExperimenterInitialsCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    generateModificationDateCells(gridSpec: DataGridSpecLines, index: number): DataGridDataCell[];
    makeMetaDataCellsGeneratorFunction(metaDataID: any): (gridSpec: DataGridSpecLines, index: number) => DataGridDataCell[];
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    defineRowGroupSpec(): any;
    getRowGroupMembership(recordID: number): number;
    getTableElement(): HTMLElement;
    getRecordIDs(): number[];
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGrid): void;
}
declare class DGDisabledLinesWidget extends DataGridOptionWidget {
    createElements(uniqueID: any): void;
    applyFilterToIDs(rowIDs: any): any;
    initialFormatRowElementsForID(dataRowObjects: any, rowID: any): any;
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
    queueGraphRemake(): void;
    remakeGraphArea(): void;
    resizeGraph(g: any): void;
}
declare class DataGridSpecAssays extends DataGridSpecBase {
    protocolID: any;
    protocolName: string;
    assayIDsInProtocol: any[];
    metaDataIDsUsedInAssays: any;
    maximumXValueInData: number;
    undisclosedSectionDiv: any;
    measuringTimesHeaderSpec: DataGridHeaderSpec;
    graphAreaHeaderSpec: DataGridHeaderSpec;
    graphObject: any;
    constructor(protocolID: any);
    refreshIDList(): void;
    getRecordIDs(): any[];
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
    generateAssayNameCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    makeMetaDataCellsGeneratorFunction(id: any): (gridSpec: DataGridSpecAssays, index: number) => DataGridDataCell[];
    generateMeasurementNameCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    generateUnitsCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    generateCountCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    generateMeasuringTimesCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    generateExperimenterCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    generateModificationDateCells(gridSpec: DataGridSpecAssays, index: number): DataGridDataCell[];
    assembleSVGStringForDataPoints(points: any, format: string): string;
    defineColumnSpec(): DataGridColumnSpec[];
    defineColumnGroupSpec(): DataGridColumnGroupSpec[];
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[];
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[];
    onInitialized(dataGrid: DataGridAssays): void;
}
declare class DGDisabledAssaysWidget extends DataGridOptionWidget {
    createElements(uniqueID: any): void;
    applyFilterToIDs(rowIDs: any): any;
    initialFormatRowElementsForID(dataRowObjects: any, rowID: any): any;
}
declare class DGAssaysSearchWidget extends DGSearchWidget {
    searchDisclosureElement: any;
    constructor(dataGridOwnerObject: any, dataGridSpec: any, placeHolder: string, size: number, getsFocus: boolean);
    createElements(uniqueID: any): void;
    appendElements(container: any, uniqueID: any): void;
}
