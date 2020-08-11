"use strict";

import * as $ from "jquery";

import {
    DataGrid,
    DataGridColumnGroupSpec,
    DataGridColumnSpec,
    DataGridDataCell,
    DataGridHeaderSpec,
    DataGridHeaderWidget,
    DataGridLoadingCell,
    DataGridOptionWidget,
    DataGridSpecBase,
    DataGridTableSpec,
    DGSelectAllWidget,
} from "../modules/DataGrid";
import * as Dragboxes from "../modules/Dragboxes";
import {
    BarGraphMode,
    EDDGraphingTools,
    GraphValue,
    GraphView,
    ViewingMode,
} from "../modules/EDDGraphingTools";
import * as Forms from "../modules/Forms";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";
import * as Config from "../modules/line/Config";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);

let viewingMode: ViewingMode;
let viewingModeIsStale: { [id: string]: boolean };
let barGraphMode: BarGraphMode;
let barGraphTypeButtonsJQ: JQuery;

let progressiveFilteringWidget: ProgressiveFilteringWidget;
let postFilteringMeasurements: any[];
let eddGraphing: EDDGraphingTools;
let actionPanelRefreshTimer: any;
let refresDataDisplayIfStaleTimer: any;

// Table spec and table objects, one each per Protocol, for Assays.
let assaysDataGridSpec;
let assaysDataGrid;

// Utility interface used by GenericFilterSection#updateUniqueIndexesHash
export interface ValueToUniqueID {
    [index: string]: number;
}
export interface ValueToString {
    [index: string]: string;
}
export interface ValueToUniqueList {
    [index: string]: number[];
}
export interface UniqueIDToValue {
    [index: number]: string;
}
// Used in ProgressiveFilteringWidget#prepareFilteringSection
export interface RecordIDToBoolean {
    [index: string]: boolean;
}
// Used to keep track of all the accumulated record IDs that can be used to
// populate the filters.  We use this to repopulate filters when the mode has changed,
// for example, to show criteria for disabled assays, or assays with no measurements.
// To speed things up we will accumulate arrays, ensuring that the IDs in each array
// are unique (to the given array) by tracking already-seen IDs with boolean flags.
export interface AccumulatedRecordIDs {
    seenRecordFlags: RecordIDToBoolean;
    metaboliteIDs: string[];
    proteinIDs: string[];
    geneIDs: string[];
    measurementIDs: string[];
}
const NULL_LINE: LineRecord = {} as LineRecord;
const NULL_MEASURE: MeasurementRecord = {} as MeasurementRecord;

// define managers for forms with metadata
let assayMetadataManager: Forms.FormMetadataManager;

// For the filtering section on the main graph
export class ProgressiveFilteringWidget {
    // These are the internal settings for the widget.
    // They may differ from the UI, if we haven't refreshed the filtering section.
    showingDisabled: boolean;
    showingEmpty: boolean;

    allFilters: GenericFilterSection[];
    lineNameFilter: LineNameFilterSection;
    assayFilters: GenericFilterSection[];
    // MeasurementGroupCode: Need to keep a separate filter list for each type.
    metaboliteFilters: GenericFilterSection[];
    proteinFilters: GenericFilterSection[];
    geneFilters: GenericFilterSection[];
    measurementFilters: GenericFilterSection[];

    metaboliteDataPresent: boolean;
    proteinDataPresent: boolean;
    geneDataPresent: boolean;
    genericDataPresent: boolean;

    filterTableJQ: JQuery;
    accumulatedRecordIDs: AccumulatedRecordIDs;
    lastFilteringResults: any;

    // MeasurementGroupCode: Need to initialize each filter list.
    constructor() {
        this.showingDisabled = false;
        this.showingEmpty = false;

        this.allFilters = [];
        this.lineNameFilter = new LineNameFilterSection();
        this.assayFilters = [];
        this.metaboliteFilters = [];
        this.proteinFilters = [];
        this.geneFilters = [];
        this.measurementFilters = [];
        this.metaboliteDataPresent = false;
        this.proteinDataPresent = false;
        this.geneDataPresent = false;
        this.genericDataPresent = false;
        this.filterTableJQ = null;
        this.accumulatedRecordIDs = {
            "seenRecordFlags": {},
            "metaboliteIDs": [],
            "proteinIDs": [],
            "geneIDs": [],
            "measurementIDs": [],
        };
        this.lastFilteringResults = null;
    }

    // Read through the Lines, Assays, and AssayMeasurements structures to learn what types
    // are present, then instantiate the relevant subclasses of GenericFilterSection, to
    // create a series of columns for the filtering section under the main graph on the page.
    // This must be outside the constructor because EDDData.Lines and EDDData.Assays are not
    // immediately available on page load.
    // MeasurementGroupCode: Need to create and add relevant filters for each group.
    prepareFilteringSection(): void {
        const seenInLinesHash: RecordIDToBoolean = {};
        const seenInAssaysHash: RecordIDToBoolean = {};

        this.filterTableJQ = $("<div>").addClass("filterTable");
        $("#mainFilterSection").append(this.filterTableJQ);

        // First do some basic sanity filtering on the list
        $.each(EDDData.Assays, (assayId: any, assay: AssayRecord): void => {
            const line = EDDData.Lines[assay.lid];
            if (!line || !line.active) {
                return;
            }
            $.each(assay.meta || [], (metadataId: string) => {
                seenInAssaysHash[metadataId] = true;
            });
            $.each(line.meta || [], (metadataId: string) => {
                seenInLinesHash[metadataId] = true;
            });
        });

        // Create filters on assay tables
        const assayFilters = [];
        assayFilters.push(this.lineNameFilter);
        assayFilters.push(new ProtocolFilterSection());
        assayFilters.push(new StrainFilterSection());
        // convert seen metadata IDs to FilterSection objects, and push to end of assayFilters
        assayFilters.push.apply(
            assayFilters,
            $.map(
                seenInAssaysHash,
                (_, id: string) => new AssayMetaDataFilterSection(id),
            ),
        );
        assayFilters.push.apply(
            assayFilters,
            $.map(
                seenInLinesHash,
                (_, id: string) => new LineMetaDataFilterSection(id),
            ),
        );

        this.metaboliteFilters = [];
        this.metaboliteFilters.push(new MetaboliteCompartmentFilterSection());
        this.metaboliteFilters.push(new MetaboliteFilterSection());

        this.proteinFilters = [];
        this.proteinFilters.push(new ProteinFilterSection());

        this.geneFilters = [];
        this.geneFilters.push(new GeneFilterSection());

        this.measurementFilters = [];
        this.measurementFilters.push(new GeneralMeasurementFilterSection());

        // All filter sections are constructed; now need to call configure() on all
        this.allFilters = [].concat(
            assayFilters,
            this.metaboliteFilters,
            this.proteinFilters,
            this.geneFilters,
            this.measurementFilters,
        );
        this.allFilters.forEach((section) => section.configure());

        // We can initialize all the Assay- and Line-level filters immediately
        this.assayFilters = assayFilters;
        this.repopulateLineFilters();
        this.repopulateColumns();
    }

    // Clear out any old filters in the filtering section, and add in the ones that
    // claim to be "useful".
    repopulateColumns(): void {
        let dark = false;
        $.each(this.allFilters, (i, widget) => {
            if (widget.isFilterUseful()) {
                widget.addToParent(this.filterTableJQ[0]);
                dark = !dark;
            } else {
                widget.detach();
            }
        });
    }

    // Given a set of measurement records and a dictionary of corresponding types
    // (passed down from the server as a result of a data request), sort them into
    // their various categories, and flag them as available for popualting the
    // filtering section.  Then call to repopulate the filtering based on the expanded sets.
    processIncomingMeasurementRecords(measures, types): void {
        // loop over all downloaded measurements. measures corresponds to AssayMeasurements
        $.each(measures || {}, (index, measurement) => {
            const assay = EDDData.Assays[measurement.assay];
            // If we've seen it already (rather unlikely), skip it.
            if (this.accumulatedRecordIDs.seenRecordFlags[measurement.id]) {
                return;
            }
            this.accumulatedRecordIDs.seenRecordFlags[measurement.id] = true;
            if (!assay) {
                return;
            }
            const line = EDDData.Lines[assay.lid];
            if (!line || !line.active) {
                return;
            }
            const mtype = types[measurement.type] || {};
            if (mtype.family === "m") {
                // measurement is of metabolite
                this.accumulatedRecordIDs.metaboliteIDs.push(measurement.id);
            } else if (mtype.family === "p") {
                // measurement is of protein
                this.accumulatedRecordIDs.proteinIDs.push(measurement.id);
            } else if (mtype.family === "g") {
                // measurement is of gene / transcript
                this.accumulatedRecordIDs.geneIDs.push(measurement.id);
            } else {
                // throw everything else in a general area
                this.accumulatedRecordIDs.measurementIDs.push(measurement.id);
            }
        });
        // Skip the queue - we need to repopulate immediately
        this.repopulateAllFilters();
    }

    repopulateAllFilters(): void {
        this.repopulateLineFilters();
        this.repopulateMeasurementFilters();
        this.repopulateColumns();
    }

    repopulateLineFilters(): void {
        const filteredAssayIds = this.buildAssayIDSet();
        this.assayFilters.forEach((filter) => {
            filter.populateFilterFromRecordIDs(filteredAssayIds);
            filter.populateTable();
        });
    }

    repopulateMeasurementFilters(): void {
        let m = this.accumulatedRecordIDs.metaboliteIDs;
        let p = this.accumulatedRecordIDs.proteinIDs;
        let g = this.accumulatedRecordIDs.geneIDs;
        let gen = this.accumulatedRecordIDs.measurementIDs;

        if (!this.showingDisabled) {
            const filterDisabled = (measureId: string): boolean => {
                const measure: any = EDDData.AssayMeasurements[measureId];
                if (!measure) {
                    return false;
                }
                const assay = EDDData.Assays[measure.assay];
                if (!assay) {
                    return false;
                }
                return !!assay.active;
            };
            m = m.filter(filterDisabled);
            p = p.filter(filterDisabled);
            g = g.filter(filterDisabled);
            gen = gen.filter(filterDisabled);
        }

        this.metaboliteDataPresent = false;
        this.proteinDataPresent = false;
        this.geneDataPresent = false;
        this.genericDataPresent = false;

        const process = (
            ids: string[],
            i: number,
            widget: GenericFilterSection,
        ): void => {
            widget.populateFilterFromRecordIDs(ids);
            widget.populateTable();
        };
        if (m.length) {
            $.each(this.metaboliteFilters, process.bind({}, m));
            this.metaboliteDataPresent = true;
        }
        if (p.length) {
            $.each(this.proteinFilters, process.bind({}, p));
            this.proteinDataPresent = true;
        }
        if (g.length) {
            $.each(this.geneFilters, process.bind({}, g));
            this.geneDataPresent = true;
        }
        if (gen.length) {
            $.each(this.measurementFilters, process.bind({}, gen));
            this.genericDataPresent = true;
        }
    }

    // Build a list of all the Assay IDs in the Study.
    buildAssayIDSet(): any[] {
        const assayIds: any[] = [];
        $.each(EDDData.Assays, (assayId, assay) => {
            const line = EDDData.Lines[assay.lid];
            if (!line || !line.active) {
                return;
            }
            if (!assay.active && !this.showingDisabled) {
                return;
            }
            if (!assay.count && !this.showingEmpty) {
                return;
            }
            assayIds.push(assayId);
        });
        return assayIds;
    }

    // Check if the global settings for the filtering section are different, and rebuild the
    // sections if so. Then, starting with a list of all the Assay IDs in the Study, we loop
    // it through the Line and Assay-level filters, causing the filters to refresh their UI,
    // narrowing the set down.
    // We resolve the resulting set of Assay IDs into measurement IDs, then pass them on to
    // the measurement-level filters. In the end we return a set of measurement IDs
    // representing the end result of all the filters, suitable for passing to the
    // graphing functions.
    // MeasurementGroupCode: Need to process each group separately here.
    buildFilteredMeasurements(): ValueToUniqueList {
        const showingDisabledCB = !!$("#filteringShowDisabledCheckbox").prop("checked");
        const showingEmptyCB = !!$("#filteringShowEmptyCheckbox").prop("checked");

        if (
            this.showingDisabled !== showingDisabledCB ||
            this.showingEmpty !== showingEmptyCB
        ) {
            this.showingDisabled = showingDisabledCB;
            this.showingEmpty = showingEmptyCB;

            this.repopulateAllFilters();
        }

        let filteredAssayIds = this.buildAssayIDSet();

        const filteringResults: ValueToUniqueList = {};
        filteringResults.allAssays = filteredAssayIds;

        $.each(this.assayFilters, (i, filter) => {
            filteredAssayIds = filter.applyProgressiveFiltering(filteredAssayIds);
            filteringResults[filter.sectionShortLabel] = filteredAssayIds;
        });

        filteringResults.filteredAssays = filteredAssayIds;

        const measurementIds: any[] = [];
        $.each(filteredAssayIds, (i, assayId) => {
            const assay = EDDData.Assays[assayId];
            $.merge(measurementIds, assay.measures || []);
        });

        filteringResults.allMeasurements = measurementIds;

        // We start out with four references to the array of available measurement IDs,
        // one for each major category. Each of these will become its own array in turn as
        // we narrow it down. This is to prevent a sub-selection in one category from
        // overriding a sub-selection in the others.

        let metaboliteMeasurements = measurementIds;
        let proteinMeasurements = measurementIds;
        let geneMeasurements = measurementIds;
        let genericMeasurements = measurementIds;

        // Note that we only try to filter if we got measurements that apply to the widget

        if (this.metaboliteDataPresent) {
            $.each(this.metaboliteFilters, (i, filter) => {
                metaboliteMeasurements = filter.applyProgressiveFiltering(
                    metaboliteMeasurements,
                );
                filteringResults[filter.sectionShortLabel] = metaboliteMeasurements;
            });
        }
        if (this.proteinDataPresent) {
            $.each(this.proteinFilters, (i, filter) => {
                proteinMeasurements = filter.applyProgressiveFiltering(
                    proteinMeasurements,
                );
                filteringResults[filter.sectionShortLabel] = proteinMeasurements;
            });
        }
        if (this.geneDataPresent) {
            $.each(this.geneFilters, (i, filter) => {
                geneMeasurements = filter.applyProgressiveFiltering(geneMeasurements);
                filteringResults[filter.sectionShortLabel] = geneMeasurements;
            });
        }
        if (this.genericDataPresent) {
            $.each(this.measurementFilters, (i, filter) => {
                genericMeasurements = filter.applyProgressiveFiltering(
                    genericMeasurements,
                );
                filteringResults[filter.sectionShortLabel] = genericMeasurements;
            });
        }

        // Once we've finished with the filtering, we want to see if any sub-selections
        // have been made across any of the categories, and if so, merge those
        // sub-selections into one.

        // The idea is, we display everything until the user makes a selection in one or
        // more of the main categories, then drop everything from the categories that
        // contain no selections.

        // An example scenario will explain why this is important:

        // Say a user is presented with two categories, Metabolite and Measurement.
        // Metabolite has criteria 'Acetate' and 'Ethanol' available.
        // Measurement has only one criteria available, 'Optical Density'.
        // By default, Acetate, Ethanol, and Optical Density are all unchecked, and all
        // visible on the graph. This is equivalent to 'return measurements' below.

        // If the user checks 'Acetate', they expect only Acetate to be displayed, even
        // though no change has been made to the Measurement section where Optical Density
        // is listed. In the code below, by testing for any checked boxes in the
        // metaboliteFilters filters, we realize that the selection has been narrowed down,
        // so we append the Acetate measurements onto dSM. Then when we check the
        // measurementFilters filters, we see that the Measurement section has not
        // narrowed down its set of measurements, so we skip appending those to dSM.
        // The end result is only the Acetate measurements.

        // Then suppose the user checks 'Optical Density', intending to compare Acetate
        // directly against Optical Density. Since measurementFilters now has checked boxes,
        // we push its measurements onto dSM, where it combines with the Acetate.

        const checked = (filter: GenericFilterSection): boolean =>
            filter.anyCheckboxesChecked;

        const dSM: any[] = []; // "Deliberately selected measurements"
        const addAll = (measurements: any[]) =>
            Array.prototype.push.apply(dSM, measurements);
        if (this.metaboliteFilters.some(checked)) {
            addAll(metaboliteMeasurements);
        }
        if (this.proteinFilters.some(checked)) {
            addAll(proteinMeasurements);
        }
        if (this.geneFilters.some(checked)) {
            addAll(geneMeasurements);
        }
        if (this.measurementFilters.some(checked)) {
            addAll(genericMeasurements);
        }
        if (dSM.length) {
            filteringResults.filteredMeasurements = dSM;
        } else {
            filteringResults.filteredMeasurements = measurementIds;
        }
        this.lastFilteringResults = filteringResults;
        return filteringResults;
    }

    // If any of the global filter settings or any of the settings in the individual filters
    // have changed, return true, indicating that the filter will generate different results
    // if queried.
    checkRedrawRequired(force?: boolean): boolean {
        let redraw = !!force;
        const showingDisabledCB = !!$("#filteringShowDisabledCheckbox").prop("checked");
        const showingEmptyCB = !!$("#filteringShowEmptyCheckbox").prop("checked");

        // We know the internal state differs, but we're not here to update it...
        if (this.showingDisabled !== showingDisabledCB) {
            redraw = true;
        }
        if (this.showingEmpty !== showingEmptyCB) {
            redraw = true;
        }

        // Walk down the filter widget list.  If we encounter one whose collective checkbox
        // state has changed since we last made this walk, then a redraw is required. Note
        // we should not skip this loop, even if we already know a redraw is required, since
        // the call to anyFilterSettingsChangedSinceLastInquiry sets internal state in the
        // filter widgets that we will use next time around.
        $.each(this.allFilters, (i, filter) => {
            if (filter.anyFilterSettingsChangedSinceLastInquiry()) {
                redraw = true;
            }
        });
        return redraw;
    }
}

// A generic version of a filtering column in the filtering section beneath the graph area
// on the page, meant to be subclassed for specific criteria.
// When initialized with a set of record IDs, the column is filled with labeled checkboxes,
// one for each unique value of the given criteria encountered in the records.
// During use, another set of record IDs is passed in, and if any checkboxes are checked,
// the ID set is narrowed down to only those records that contain the checked values.
// Checkboxes whose values are not represented anywhere in the given IDs are temporarily
// disabled, visually indicating to a user that those values are not available for
// further filtering.
// The filters are meant to be called in sequence, feeding each returned ID set into the next,
// progressively narrowing down the enabled checkboxes.
// MeasurementGroupCode: Need to subclass this for each group type.
export class GenericFilterSection {
    // A dictionary of the unique values found for filtering against, and the dictionary's
    // complement. Each unique ID is an integer, ascending from 1, in the order the value was
    // first encountered when examining the record data in updateUniqueIndexesHash.
    uniqueValues: UniqueIDToValue;
    uniqueIndexes: ValueToUniqueID;
    static readonly nullIndex: number = 1;
    uniqueIndexCounter: number;

    // The sorted order of the list of unique values found in the filter
    uniqueValuesOrder: number[];

    // A dictionary resolving a record ID (assay ID, measurement ID) to an array. Each array
    // contains the integer identifiers of the unique values that apply to that record.
    // (It's rare, but there can actually be more than one criteria that matches a given ID,
    //  for example a Line with two feeds assigned to it.)
    filterHash: ValueToUniqueList;
    // Dictionary resolving the filter values to HTML Input checkboxes.
    checkboxes: { [index: string]: JQuery };
    // Dictionary used to compare checkboxes with a previous state to determine whether an
    // update is required. Values are 'C' for checked, 'U' for unchecked, and 'N' for not
    // existing at the time. ('N' can be useful when checkboxes are removed from a filter due
    // to the back-end data changing.)
    previousCheckboxState: ValueToString;
    // Dictionary resolving the filter values to HTML table row elements.
    tableRows: { [index: string]: HTMLTableRowElement };

    // References to HTML elements created by the filter
    filterColumnDiv: Element;
    clearIcons: JQuery;
    plaintextTitleDiv: Element;
    searchBox: HTMLInputElement;
    searchBoxTitleDiv: Element;
    scrollZoneDiv: Element;
    filteringTable: JQuery;
    tableBodyElement: HTMLTableElement;

    // Search box related
    currentSearchSelection: string;
    previousSearchSelection: string;
    minCharsToTriggerSearch: number;

    anyCheckboxesChecked: boolean;

    sectionTitle: string;
    sectionShortLabel: string;

    // TODO: Convert to a protected constructor! Then use a factory method to create objects
    //    with configure() already called. Typescript 1.8 does not support visibility
    //    modifiers on constructors, support is added in Typescript 2.0
    constructor() {
        this.uniqueValues = {};
        this.uniqueIndexes = {};
        this.uniqueIndexCounter = GenericFilterSection.nullIndex;
        this.uniqueValuesOrder = [];
        this.filterHash = {};
        this.previousCheckboxState = {};

        this.tableRows = {};
        this.checkboxes = {};

        this.currentSearchSelection = "";
        this.previousSearchSelection = "";
        this.minCharsToTriggerSearch = 1;
        this.anyCheckboxesChecked = false;
    }

    configure(title = "Generic Filter", shortLabel = "gf"): void {
        this.sectionTitle = title;
        this.sectionShortLabel = shortLabel;
        this.createContainerObjects();
    }

    // Create all the container HTML objects
    createContainerObjects(): void {
        const sBoxID: string = "filter" + this.sectionShortLabel + "SearchBox";
        this.filterColumnDiv = $("<div>").addClass("filterColumn")[0];
        const textTitle = $("<span>")
            .addClass("filterTitle")
            .text(this.sectionTitle);
        const clearIcon = $("<span>").addClass("filterClearIcon");
        this.plaintextTitleDiv = $("<div>")
            .addClass("filterHead")
            .append(clearIcon)
            .append(textTitle)[0];

        $((this.searchBox = document.createElement("input"))).attr({
            "id": sBoxID,
            "name": sBoxID,
            "placeholder": this.sectionTitle,
            "size": 14,
        });
        // JQuery .attr() cannot set this
        this.searchBox.setAttribute("type", "text");
        // We need two clear icons for the two versions of the header (with search and without)
        const searchClearIcon = $("<span>").addClass("filterClearIcon");
        this.searchBoxTitleDiv = $("<div>")
            .addClass("filterHeadSearch")
            .append(searchClearIcon)
            .append(this.searchBox)[0];

        // Consolidate the two JQuery elements into one
        this.clearIcons = clearIcon.add(searchClearIcon);

        this.clearIcons.on("click", (ev) => {
            // Changing the checked status will automatically trigger a refresh event
            $.each(this.checkboxes || {}, (id: string, checkbox: JQuery) => {
                checkbox.prop("checked", false);
            });
            return false;
        });
        this.scrollZoneDiv = $("<div>").addClass("filterCriteriaScrollZone")[0];
        this.filteringTable = $("<table>")
            .addClass("filterCriteriaTable dragboxes")
            .attr({ "cellpadding": 0, "cellspacing": 0 })
            .append((this.tableBodyElement = $("<tbody>")[0] as HTMLTableElement));
    }

    // By calling updateUniqueIndexesHash, we go through the records and find all the unique
    // values in them (for the criteria this particular filter is based on.)
    // Next we create an inverted version of that data structure, so that the unique
    // identifiers we have created map to the values they represent, as well as an array
    // of the unique identifiers sorted by the values.  These are what we'll use to construct
    // the rows of criteria visible in the filter's UI.
    populateFilterFromRecordIDs(ids: string[]): void {
        // track internal codes (UniqueID) for each value filtered by the widget
        const valueCodeSet: number[] = [];
        const valueCodeHash: UniqueIDToValue = {};
        // convert list of records to values to filter upon; updates this.uniqueIndexes
        this.updateUniqueIndexesHash(ids);
        // Create a reversed hash so keys map values and values map keys
        $.each(this.uniqueIndexes, (value: string, uniqueID: number): void => {
            valueCodeHash[uniqueID] = value;
            valueCodeSet.push(uniqueID);
        });
        // Alphabetically sort an array of the keys according to values
        valueCodeSet.sort((a: number, b: number): number => {
            const _a: string = valueCodeHash[a].toLowerCase();
            const _b: string = valueCodeHash[b].toLowerCase();
            return _a < _b ? -1 : _a > _b ? 1 : 0;
        });
        this.uniqueValues = valueCodeHash;
        this.uniqueValuesOrder = valueCodeSet;
    }

    // In this function (or at least the subclassed versions of it) we are running through
    // the given list of measurement (or assay) IDs and examining their records and related
    // records, locating the particular field we are interested in, and creating a list of
    // all the unique values for that field.  As we go, we mark each unique value with an
    // integer UID, and construct a hash resolving each record to one (or possibly more)
    // of those integer UIDs. This prepares us for quick filtering later on.
    // (This generic filter does nothing, leaving these structures blank.)
    updateUniqueIndexesHash(ids: string[]): void {
        this.filterHash = this.filterHash || {};
        this.uniqueIndexes = this.uniqueIndexes || {};
    }

    // If we didn't come up with 2 or more criteria, there is no point in displaying the
    // filter, since it doesn't represent a meaningful choice.
    isFilterUseful(): boolean {
        if (this.uniqueValuesOrder.length < 2) {
            return false;
        }
        return true;
    }

    addToParent(parentDiv): void {
        parentDiv.appendChild(this.filterColumnDiv);
    }

    detach(): void {
        $(this.filterColumnDiv).detach();
    }

    generateFilterId(uniqueId: number): string {
        return ["filter", this.sectionShortLabel, "n", uniqueId, "cbox"].join("");
    }

    assignUniqueIndex(value: string): number {
        if (value === null) {
            return GenericFilterSection.nullIndex;
        } else if (this.uniqueIndexes[value] === undefined) {
            this.uniqueIndexes[value] = ++this.uniqueIndexCounter;
        }
        return this.uniqueIndexes[value];
    }

    // Runs through the values in uniqueValuesOrder, adding a checkbox and label for each
    // filtering value represented. If there are more than 15 values, the filter gets
    // a search box and scrollbar.
    // The checkbox, and the table row that encloses the checkbox and label, are saved in
    // a dictionary mapped by the unique value they represent, so they can be re-used if the
    // filter is rebuilt (i.e. if populateTable is called again.)
    populateTable(): void {
        let fCol = $(this.filterColumnDiv);

        fCol.children().detach();
        // Only use the scrolling container div if the size of the list warrants it, because
        // the scrolling container div declares a large padding margin for the scroll bar,
        // and that padding margin would be an empty waste of space otherwise.
        if (this.uniqueValuesOrder.length > 10) {
            fCol.append(this.searchBoxTitleDiv).append(this.scrollZoneDiv);
            // Change the reference so we're affecting the innerHTML of the correct div later
            fCol = $(this.scrollZoneDiv);
        } else {
            fCol.append(this.plaintextTitleDiv);
        }
        fCol.append(this.filteringTable);

        // Clear out any old table contents
        $(this.tableBodyElement).empty();

        // For each value, if a table row isn't already defined, build one.
        this.uniqueValuesOrder.forEach((uniqueId: number): void => {
            const cboxName = this.generateFilterId(uniqueId);
            const row = this.tableRows[this.uniqueValues[uniqueId]];
            if (!row) {
                // No need to append a new row in a separate call:
                // insertRow() creates, and appends, and returns one.
                const rowElem = this.tableBodyElement.insertRow() as HTMLTableRowElement;
                this.tableRows[this.uniqueValues[uniqueId]] = rowElem;
                const cell = this.tableRows[this.uniqueValues[uniqueId]].insertCell();
                this.checkboxes[this.uniqueValues[uniqueId]] = $(
                    "<input type='checkbox'>",
                )
                    .attr({ "name": cboxName, "id": cboxName })
                    .appendTo(cell);
                $("<label>")
                    .attr("for", cboxName)
                    .text(this.uniqueValues[uniqueId])
                    .appendTo(cell);
            } else {
                $(row).appendTo(this.tableBodyElement);
            }
        });
        // TODO: Drag select is twitchy - clicking a table cell background should check the
        // box, even if the user isn't hitting the label or the checkbox itself.
        // Fixing this may mean adding additional code to the mousedown/mouseover handler for
        // the whole table (currently in prepareIt()).
        Dragboxes.initTable(this.filteringTable);
    }

    // Returns true if any of this filter's UI (checkboxes, search field)
    // shows a different state than when this function was last called.
    // This is accomplished by keeping a dictionary - previousCheckboxState - that is
    // organized by the same unique criteria values as the checkboxes.
    // We build a relpacement for this dictionary, and compare its contents with the old one.
    // Each checkbox can have one of three prior states, each represented in the dictionary
    // by a letter:
    //     "C" - checked,
    //     "U" - unchecked,
    //     "N" - doesn't exist (in the currently visible set.)
    // We also compare the current content of the search box with the old content.
    // Note: Regardless of where or whether we find a difference, it is important that we
    // finish building the replacement version of previousCheckboxState.
    // So though it's tempting to exit early from these loops, it would make a mess.
    anyFilterSettingsChangedSinceLastInquiry(): boolean {
        let changed = false;
        const currentCheckboxState: ValueToString = {};
        let v = $(this.searchBox).val() as string;
        this.anyCheckboxesChecked = false;

        this.uniqueValuesOrder.forEach((uniqueId: number): void => {
            const checkbox: JQuery = this.checkboxes[this.uniqueValues[uniqueId]];
            // "C" - checked, "U" - unchecked, "N" - doesn't exist
            const current: "C" | "U" =
                checkbox.prop("checked") && !checkbox.prop("disabled") ? "C" : "U";
            const previous =
                this.previousCheckboxState[this.uniqueValues[uniqueId]] || "N";
            if (current !== previous) {
                changed = true;
            }
            if (current === "C") {
                this.anyCheckboxesChecked = true;
            }
            currentCheckboxState[this.uniqueValues[uniqueId]] = current;
        });

        this.clearIcons.toggleClass("enabled", this.anyCheckboxesChecked);

        // Remove leading and trailing whitespace
        v = v.trim();
        v = v.toLowerCase();
        // Replace internal whitespace with single spaces
        v = v.replace(/\s\s*/, " ");
        this.currentSearchSelection = v;
        if (v !== this.previousSearchSelection) {
            this.previousSearchSelection = v;
            changed = true;
        }

        if (!changed) {
            // If we haven't detected any change so far, there is one more angle to cover:
            // Checkboxes that used to exist, but have since been removed from the set.
            $.each(this.previousCheckboxState, (uniqueValue) => {
                if (currentCheckboxState[uniqueValue] === undefined) {
                    changed = true;
                    // If it was taken out of the set, clear it so it will be
                    // blank when re-added later.
                    this.checkboxes[uniqueValue].prop("checked", false);
                }
            });
        }
        this.previousCheckboxState = currentCheckboxState;
        return changed;
    }

    // Takes a set of record IDs, and if any checkboxes in the filter's UI are checked,
    // the ID set is narrowed down to only those records that contain the checked values.
    // In addition, checkboxes whose values are not represented anywhere in the incoming IDs
    // are temporarily disabled and sorted to the bottom of the list, visually indicating
    // to a user that those values are not available for further filtering.
    // The narrowed set of IDs is then returned, for use by the next filter.
    applyProgressiveFiltering(ids: any[]): any {
        // If the filter only contains one item, it's pointless to apply it.
        if (!this.isFilterUseful()) {
            return ids;
        }

        let useSearchBox = false;
        let queryStrs = [];

        const v = this.currentSearchSelection;
        if (v != null) {
            if (v.length >= this.minCharsToTriggerSearch) {
                // If there are multiple words, we match each separately.
                // We will not attempt to match against empty strings, so we filter those out
                // if any slipped through.
                queryStrs = v.split(/\s+/).filter((one) => one.length > 0);
                // The user might have pasted/typed only whitespace, so:
                if (queryStrs.length > 0) {
                    useSearchBox = true;
                }
            }
        }

        const valuesVisiblePreFiltering = {};

        const idsPostFiltering = ids.filter((id) => {
            let pass = false;
            // If we have filtering data for this id, use it.
            // If we don't, the id probably belongs to some other measurement category,
            // so we ignore it.
            if (this.filterHash[id]) {
                // If any of this ID's criteria are checked, this ID passes the filter.
                // Note that we cannot optimize to use '.some' here becuase we need to
                // loop through all the criteria to set valuesVisiblePreFiltering.
                this.filterHash[id].forEach((index) => {
                    let match = true,
                        text: string;
                    if (useSearchBox) {
                        text = this.uniqueValues[index].toLowerCase();
                        match = queryStrs.some((q) => {
                            return text.length >= q.length && text.indexOf(q) >= 0;
                        });
                    }
                    if (match) {
                        valuesVisiblePreFiltering[index] = 1;
                        if (
                            this.previousCheckboxState[this.uniqueValues[index]] ===
                                "C" ||
                            !this.anyCheckboxesChecked
                        ) {
                            pass = true;
                        }
                    }
                });
            }
            return pass;
        });

        // Apply enabled/disabled status and ordering:
        const rowsToAppend = [];
        this.uniqueValuesOrder.forEach((crID) => {
            const checkbox: JQuery = this.checkboxes[this.uniqueValues[crID]],
                row: HTMLTableRowElement = this.tableRows[this.uniqueValues[crID]],
                show = !!valuesVisiblePreFiltering[crID];
            checkbox.prop("disabled", !show);
            $(row).toggleClass("nodata", !show);
            if (show) {
                this.tableBodyElement.appendChild(row);
            } else {
                rowsToAppend.push(row);
            }
        });
        // Append all the rows we disabled, as a last step,
        // so they go to the bottom of the table.
        rowsToAppend.forEach((row) => this.tableBodyElement.appendChild(row));

        return idsPostFiltering;
    }

    countChecked() {
        return $("input[type=checkbox]:checked", this.filteringTable || $()).length;
    }

    // A few utility functions:
    _assayIdToAssay(assayId: string) {
        return EDDData.Assays[assayId];
    }
    _assayIdToLine(assayId: string) {
        const assay = this._assayIdToAssay(assayId);
        if (assay) {
            return EDDData.Lines[assay.lid];
        }
        return undefined;
    }
    _assayIdToProtocol(assayId: string): ProtocolRecord {
        const assay = this._assayIdToAssay(assayId);
        if (assay) {
            return EDDData.Protocols[assay.pid];
        }
        return undefined;
    }
}

// One of the highest-level filters: Strain.
// Note that an Assay's Line can have more than one Strain assigned to it,
// which is an example of why 'this.filterHash' is built with arrays.
export class StrainFilterSection extends GenericFilterSection {
    showNullEntry = false;

    configure(): void {
        super.configure("Strain", "st");
    }

    populateFilterFromRecordIDs(ids: string[]): void {
        super.populateFilterFromRecordIDs(ids);
        if (this.showNullEntry) {
            // insert a nullIndex entry
            this.uniqueValues[GenericFilterSection.nullIndex] = "No Strain";
            this.uniqueValuesOrder.unshift(GenericFilterSection.nullIndex);
        }
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        this.showNullEntry = false;
        ids.forEach((assayId: string) => {
            const line: LineRecord = this._assayIdToLine(assayId) || NULL_LINE;
            const strain_ids: number[] = line.strain || [];
            let idx: number;
            this.filterHash[assayId] = this.filterHash[assayId] || [];
            if (strain_ids.length === 0) {
                // set null index when no strains
                this.filterHash[assayId].push(GenericFilterSection.nullIndex);
                this.showNullEntry = true;
            } else {
                // assign unique ID to every encountered strain name
                strain_ids.forEach((strainId: number): void => {
                    const strain: StrainRecord = EDDData.Strains[strainId];
                    if (strain && strain.name) {
                        idx = this.assignUniqueIndex(strain.name);
                        this.filterHash[assayId].push(idx);
                    }
                });
            }
        });
    }
}

// A filter for the name of each Assay's Line
export class LineNameFilterSection extends GenericFilterSection {
    lineLookup: { [key: string]: LineRecord };
    lastAssignedColor: string = null;

    configure(): void {
        super.configure("Line", "ln");
        this.filteringTable.css("font-weight", "bold");
        this.lineLookup = {};
    }

    isFilterUseful(): boolean {
        // always return true because this acts as our color legend
        return true;
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        ids.forEach((assayId: string) => {
            const line: LineRecord = this._assayIdToLine(assayId) || NULL_LINE;
            let idx: number;
            this.filterHash[assayId] = this.filterHash[assayId] || [];
            if (line.name) {
                idx = this.assignUniqueIndex(line.name);
                this.filterHash[assayId].push(idx);
                line.identifier = this.generateFilterId(idx);
                this.lineLookup[line.identifier] = line;
            }
        });
    }

    setLineColors() {
        const boxes = $("input[type=checkbox]", this.filteringTable || $());
        const checked = boxes.filter(":checked");
        // when none selected, assign colors in order from palette
        if (checked.length === 0) {
            let color: string = null;
            boxes.each((index, elem) => {
                const box = $(elem);
                const label = box.next("label");
                const line = this.lineLookup[box.attr("name")];
                line.color = color = eddGraphing.colorQueue(color);
                label.css("color", line.color);
            });
            this.lastAssignedColor = null;
        } else {
            type FilterItem = { line: LineRecord; label: JQuery };
            const palette: Set<string> = new Set(EDDGraphingTools.colors);
            const needsColor: FilterItem[] = [];
            // any selection(s) already having a color should keep it
            checked.each((_, elem) => {
                const box = $(elem);
                const label = box.next("label");
                const line = this.lineLookup[box.attr("name")];
                if (line.color === null) {
                    needsColor.push({ "line": line, "label": label });
                } else {
                    palette.delete(line.color);
                }
            });
            // assign colors, avoiding repeats
            const iter = palette.values();
            needsColor.forEach((item: FilterItem) => {
                const color =
                    iter.next().value || eddGraphing.colorQueue(this.lastAssignedColor);
                item.line.color = color;
                item.label.css("color", color);
                this.lastAssignedColor = color;
            });
            // reset color to black when unchecked
            boxes.each((_, elem) => {
                const box = $(elem);
                const label = box.next("label");
                const line = this.lineLookup[box.attr("name")];
                if (!box.prop("checked")) {
                    line.color = null;
                    label.css("color", "black");
                }
            });
        }
    }

    populateTable() {
        super.populateTable();
        this.filteringTable.on("change", "input", (ev) => {
            const box = $(ev.target);
            if (!box.prop("checked")) {
                box.next("label").css("color", "black");
            }
        });
    }
}

// A filter for the Protocol of each Assay
export class ProtocolFilterSection extends GenericFilterSection {
    configure(): void {
        super.configure("Protocol", "p");
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        ids.forEach((assayId: string) => {
            const protocol: ProtocolRecord = this._assayIdToProtocol(assayId);
            this.filterHash[assayId] = this.filterHash[assayId] || [];
            if (protocol && protocol.name) {
                const idx = this.assignUniqueIndex(protocol.name);
                this.filterHash[assayId].push(idx);
            }
        });
    }
}

// A class defining some additional logic for metadata-type filters,
// meant to be subclassed.  Note how we pass in the particular metadata we
// are constructing this filter for, in the constructor.
// Unlike the other filters, we will be instantiating more than one of these.
export class MetaDataFilterSection extends GenericFilterSection {
    metaDataID: string;
    pre: string;
    post: string;

    constructor(metaDataID: string) {
        super();
        const MDT = EDDData.MetaDataTypes[metaDataID];
        this.metaDataID = metaDataID;
        this.pre = MDT.pre || "";
        this.post = MDT.post || "";
    }

    configure(): void {
        super.configure(
            EDDData.MetaDataTypes[this.metaDataID].name,
            "md" + this.metaDataID,
        );
    }
}

export class LineMetaDataFilterSection extends MetaDataFilterSection {
    updateUniqueIndexesHash(ids: string[]): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        ids.forEach((assayId: string) => {
            const line: any = this._assayIdToLine(assayId) || {};
            let value = "(Empty)";
            this.filterHash[assayId] = this.filterHash[assayId] || [];
            if (line.meta && line.meta[this.metaDataID]) {
                value = [this.pre, line.meta[this.metaDataID], this.post]
                    .join(" ")
                    .trim();
            }
            this.filterHash[assayId].push(this.assignUniqueIndex(value));
        });
    }
}

export class AssayMetaDataFilterSection extends MetaDataFilterSection {
    updateUniqueIndexesHash(ids: string[]): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        ids.forEach((assayId: string) => {
            const assay: any = this._assayIdToAssay(assayId) || {};
            let value = "(Empty)";
            this.filterHash[assayId] = this.filterHash[assayId] || [];
            if (assay.meta && assay.meta[this.metaDataID]) {
                value = [this.pre, assay.meta[this.metaDataID], this.post]
                    .join(" ")
                    .trim();
            }
            this.filterHash[assayId].push(this.assignUniqueIndex(value));
        });
    }
}

// These remaining filters work on Measurement IDs rather than Assay IDs.

// A filter for the compartment of each Metabolite.
export class MetaboliteCompartmentFilterSection extends GenericFilterSection {
    // NOTE: this filter class works with Measurement IDs rather than Assay IDs
    configure(): void {
        super.configure("Compartment", "com");
    }

    updateUniqueIndexesHash(amIDs: string[]): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        amIDs.forEach((measureId: string) => {
            const measure = EDDData.AssayMeasurements[measureId] || {};
            this.filterHash[measureId] = this.filterHash[measureId] || [];
            const value: MeasurementCompartmentRecord =
                EDDData.MeasurementTypeCompartments[measure.compartment] ||
                ({} as MeasurementCompartmentRecord);
            if (value && value.name) {
                this.filterHash[measureId].push(this.assignUniqueIndex(value.name));
            }
        });
    }
}

// A generic filter for Measurements, meant to be subclassed.
// It introduces a 'loadPending' attribute, which is used to make the filter
// appear in the UI even if it has no data, because we anticipate data to eventually
// appear in it.
//      The idea is, we know whether to instantiate a given subclass of this filter by
// looking at the measurement count for each Assay, which is given to us in the first
// chunk of data from the server.  So, we instantiate it, then it appears in a
// 'load pending' state until actual measurement values are received from the server.
export class MeasurementFilterSection extends GenericFilterSection {
    // Whenever this filter is instantiated, we
    loadPending: boolean;

    configure(title: string, shortLabel: string): void {
        this.loadPending = true;
        super.configure(title, shortLabel);
    }

    // Overriding to make use of loadPending.
    isFilterUseful(): boolean {
        return this.loadPending || this.uniqueValuesOrder.length > 0;
    }

    protected updateUniqueIndexesByFamily(ids: string[], family: string): void {
        this.uniqueIndexes = {};
        this.filterHash = {};
        ids.forEach((measureId: string) => {
            const measure: MeasurementRecord =
                EDDData.AssayMeasurements[measureId] || NULL_MEASURE;
            this.filterHash[measureId] = this.filterHash[measureId] || [];
            if (measure?.type) {
                const t = EDDData.MeasurementTypes[measure.type];
                if (t?.name && t?.family === family) {
                    this.filterHash[measureId].push(this.assignUniqueIndex(t.name));
                }
            }
        });
        // If we've been called to build our hashes, assume there's no load pending
        this.loadPending = false;
    }
}

// A filter for the names of General Measurements.
export class GeneralMeasurementFilterSection extends MeasurementFilterSection {
    loadPending: boolean;

    configure(): void {
        this.loadPending = true;
        super.configure("Measurement", "mm");
    }

    isFilterUseful(): boolean {
        return this.loadPending || this.uniqueValuesOrder.length > 0;
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.updateUniqueIndexesByFamily(ids, "_");
    }
}

// A filter for the names of Metabolite Measurements.
export class MetaboliteFilterSection extends MeasurementFilterSection {
    configure(): void {
        super.configure("Metabolite", "me");
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.updateUniqueIndexesByFamily(ids, "m");
    }
}

// A filter for the names of Protein Measurements.
export class ProteinFilterSection extends MeasurementFilterSection {
    configure(): void {
        super.configure("Protein", "pr");
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.updateUniqueIndexesByFamily(ids, "p");
    }
}

// A filter for the names of Gene Measurements.
export class GeneFilterSection extends MeasurementFilterSection {
    configure(): void {
        super.configure("Gene", "gn");
    }

    updateUniqueIndexesHash(ids: string[]): void {
        this.updateUniqueIndexesByFamily(ids, "g");
    }
}

function _displayLineGraph(): void {
    $("#exportButton, #tableControlsArea, .tableActionButtons").addClass("off");
    $("#filterControlsArea").removeClass("off");
    $("#displayModeButtons .active").removeClass("active");
    $("#lineGraphButton").addClass("active");
    queueActionPanelRefresh();
    viewingMode = "linegraph";
    barGraphTypeButtonsJQ.addClass("off");
    $("#lineGraph").removeClass("off");
    $("#barGraphByTime, #barGraphByLine, #barGraphByMeasurement").addClass("off");
    $("#studyAssaysTable").addClass("off");
    $("#mainFilterSection").appendTo("#content");
    queueRefreshDataDisplayIfStale();
}

function _displayBarGraph(mode: "time" | "line" | "measurement"): void {
    $("#exportButton, #tableControlsArea, .tableActionButtons").addClass("off");
    $("#filterControlsArea").removeClass("off");
    $("#displayModeButtons .active").removeClass("active");
    $("#barGraphButton")
        .add("#" + mode + "BarGraphButton")
        .addClass("active");
    queueActionPanelRefresh();
    viewingMode = "bargraph";
    barGraphTypeButtonsJQ.removeClass("off");
    $("#lineGraph, #studyAssaysTable").addClass("off");
    $("#barGraphByTime").toggleClass("off", "time" !== mode);
    $("#barGraphByLine").toggleClass("off", "line" !== mode);
    $("#barGraphByMeasurement").toggleClass("off", "measurement" !== mode);
    $("#mainFilterSection").appendTo("#content");
    queueRefreshDataDisplayIfStale();
}

function _displayTable(): void {
    $("#exportButton, #tableControlsArea, .tableActionButtons").removeClass("off");
    $("#filterControlsArea").addClass("off");
    $("#displayModeButtons .active").removeClass("active");
    $("#dataTableButton").addClass("active");
    queueActionPanelRefresh();
    viewingMode = "table";
    barGraphTypeButtonsJQ.addClass("off");
    $("#studyAssaysTable").removeClass("off");
    $("#lineGraph, #barGraphByTime, #barGraphByLine, #barGraphByMeasurement").addClass(
        "off",
    );
    progressiveFilteringWidget.lineNameFilter.setLineColors();
    queueRefreshDataDisplayIfStale();
    // TODO: enable users to export filtered data from graph
}

// Called when the page loads.
export function prepareIt() {
    eddGraphing = new EDDGraphingTools(EDDData);
    progressiveFilteringWidget = new ProgressiveFilteringWidget();
    postFilteringMeasurements = [];

    // By default, we always show the graph
    viewingMode = "linegraph";
    barGraphMode = "measurement";
    barGraphTypeButtonsJQ = $("#barGraphTypeButtons");
    // Start out with every display mode needing a refresh
    viewingModeIsStale = {
        "linegraph": true,
        "bargraph": true,
        "table": true,
    };
    refresDataDisplayIfStaleTimer = null;

    assaysDataGridSpec = null;
    assaysDataGrid = null;

    actionPanelRefreshTimer = null;

    // set up editable study name
    const title = $("#editable-study-name").get()[0] as HTMLElement;
    const nameEdit = new StudyBase.EditableStudyName(title);
    nameEdit.getValue();
    // This only adds code that turns the other buttons off when a button is made active,
    // and does the same to elements named in the 'for' attributes of each button.
    // We still need to add our own responders to actually do stuff.
    Utl.ButtonBar.prepareButtonBars();
    StudyBase.overlayContent($("#assaysActionPanel"));
    // Prepend show/hide filter button for better alignment
    // Note: this will be removed when we implement left side filtering

    // when all ajax requests are finished, determine if there are AssayMeasurements.
    $(document).ajaxStop(() => {
        // show assay table by default if there are assays but no assay measurements
        if (
            !$.isEmptyObject(EDDData.Assays) &&
            $.isEmptyObject(EDDData.AssayMeasurements)
        ) {
            // TODO: create prepare it for no data?
            _displayTable();
            $("#exportButton").prop("disabled", true);
        } else {
            $("#exportButton").prop("disabled", false);
        }
    });

    $("#dataTableButton").click(() => {
        if (EDDData.currentStudyID) {
            _displayTable();
            updateGraphViewFlag({
                "buttonElem": "#dataTableButton",
                "type": "table",
                "study_id": EDDData.currentStudyID,
            });
        }
    });

    $("#editAssayButton").click((ev) => {
        showEditAssayDialog($("#studyAssaysTable").find("[name=assayId]:checked"));
        return false;
    });

    // This one is active by default
    $("#lineGraphButton").click(() => {
        if (EDDData.currentStudyID) {
            _displayLineGraph();
            updateGraphViewFlag({
                "buttonElem": "#lineGraphButton",
                "type": viewingMode,
                "study_id": EDDData.currentStudyID,
            });
        }
    });

    // one time click event handler for loading spinner
    $("#barGraphButton").one("click", function() {
        $("#graphLoading").removeClass("off");
    });
    $("#timeBarGraphButton").one("click", function() {
        $("#graphLoading").removeClass("off");
    });
    $("#lineBarGraphButton").one("click", function() {
        $("#graphLoading").removeClass("off");
    });
    $("#measurementBarGraphButton").one("click", function() {
        $("#graphLoading").removeClass("off");
    });
    $("#barGraphButton").click(() => {
        if (EDDData.currentStudyID) {
            _displayBarGraph(barGraphMode);
            updateGraphViewFlag({
                "buttonElem": "#measurementBarGraphButton",
                "type": barGraphMode,
                "study_id": EDDData.currentStudyID,
            });
        }
    });
    $("#timeBarGraphButton").click(() => {
        if (EDDData.currentStudyID) {
            _displayBarGraph((barGraphMode = "time"));
            updateGraphViewFlag({
                "buttonElem": "#timeBarGraphButton",
                "type": barGraphMode,
                "study_id": EDDData.currentStudyID,
            });
        }
    });
    $("#lineBarGraphButton").click(() => {
        if (EDDData.currentStudyID) {
            _displayBarGraph((barGraphMode = "line"));
            updateGraphViewFlag({
                "buttonElem": "#lineBarGraphButton",
                "type": barGraphMode,
                "study_id": EDDData.currentStudyID,
            });
        }
    });
    $("#measurementBarGraphButton").click(() => {
        if (EDDData.currentStudyID) {
            _displayBarGraph((barGraphMode = "measurement"));
            updateGraphViewFlag({
                "buttonElem": "#measurementBarGraphButton",
                "type": barGraphMode,
                "study_id": EDDData.currentStudyID,
            });
        }
    });

    // hides/shows filter section.
    const hideButtons: JQuery = $(".hideFilterSection");
    hideButtons.click((event) => {
        event.preventDefault();
        const self: JQuery = $(event.target);
        const old = self.text();
        const replace = self.attr("data-off-text");
        // doing this for all
        hideButtons.attr("data-off-text", old).text(replace);
        $("#mainFilterSection").toggle();
        return false;
    });

    // The next few lines wire up event handlers for a pulldownMenu that we use to contain a
    // couple of controls related to the filtering section.  This menu is styled to look
    // exactly like the typical 'view options' menu generated by DataGrid.

    const menuLabel = $("#filterControlsMenuLabel");
    menuLabel.click(() => {
        if (menuLabel.hasClass("pulldownMenuLabelOff")) {
            menuLabel
                .removeClass("pulldownMenuLabelOff")
                .addClass("pulldownMenuLabelOn");
            $("#filterControlsMenu > div.pulldownMenuMenuBlock").removeClass("off");
        }
    });

    // event handlers to hide menu if clicking outside menu block or pressing ESC
    $(document)
        .click((ev) => {
            const t = $(ev.target);
            if (t.closest($("#filterControlsMenu").get(0)).length === 0) {
                menuLabel
                    .removeClass("pulldownMenuLabelOn")
                    .addClass("pulldownMenuLabelOff");
                $("#filterControlsMenu > div.pulldownMenuMenuBlock").addClass("off");
            }
        })
        .keydown((ev) => {
            if (ev.keyCode === 27) {
                menuLabel
                    .removeClass("pulldownMenuLabelOn")
                    .addClass("pulldownMenuLabelOff");
                $("#filterControlsMenu > div.pulldownMenuMenuBlock").addClass("off");
            }
        });

    onSuccessEDDData();

    // set up the "add" (edit) assay dialog
    const assayModalForm = $("#assayMain");
    assayModalForm.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    assayMetadataManager = new Forms.FormMetadataManager(assayModalForm, "assay");

    // Set up the Add Measurement to Assay modal
    $("#addMeasurement").dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );

    $("#addMeasurementButton").click(() => {
        // copy inputs to the modal form
        const inputs = $("#studyAssaysTable")
            .find("input[name=assayId]:checked")
            .clone();
        $("#addMeasurement")
            .find(".hidden-assay-inputs")
            .empty()
            .append(inputs)
            .end()
            .removeClass("off")
            .dialog("open");
        return false;
    });

    // Callbacks to respond to the filtering section
    $("#mainFilterSection")
        .on("mouseover mousedown mouseup", queueRefreshDataDisplayIfStale.bind(this))
        .on("keydown", filterTableKeyDown.bind(this));
}

function basePayload(): any {
    const token: string = Utl.EDD.findCSRFToken();
    return { "csrfmiddlewaretoken": token };
}

function _settingsPath(propKey: string): string {
    // make sure the final slash is on path so Django can accept POST requests
    return "/profile/settings/" + propKey + "/";
}

function updateGraphViewFlag(type) {
    $.ajax(_settingsPath("measurement-" + type.study_id), {
        "data": $.extend({}, basePayload(), { "data": JSON.stringify(type) }),
        "type": "POST",
    });
}

export function fetchSettings(
    propKey: string,
    callback: (value: any) => void,
    defaultValue?: any,
): void {
    $.ajax(_settingsPath(propKey), {
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

function onSuccessEDDData() {
    eddGraphing.renderColor(EDDData.Lines);
    progressiveFilteringWidget.prepareFilteringSection();
    $("#filteringShowDisabledCheckbox, #filteringShowEmptyCheckbox").change(() => {
        queueRefreshDataDisplayIfStale();
    });
    fetchSettings(
        "measurement-" + EDDData.currentStudyID,
        (payload) => {
            if (typeof payload !== "object" || typeof payload.type === "undefined") {
                // do nothing if the parameter is not an object
                return;
            } else if (payload.type === "linegraph") {
                _displayLineGraph();
            } else if (payload.type === "table") {
                _displayTable();
            } else {
                _displayBarGraph(payload.type);
            }
        },
        [],
    );
    fetchMeasurements();
}

function fetchMeasurements() {
    // pulling in protocol measurements AssayMeasurements
    $.each(EDDData.Protocols, (id, protocol) => {
        $.ajax({
            "url": "measurements/" + id + "/",
            "type": "GET",
            "dataType": "json",
            "error": (xhr, status) => {
                return;
            },
            "success": processMeasurementData.bind(this, protocol),
        });
    });
}

function filterTableKeyDown(e) {
    switch (e.keyCode) {
        case 38: // up
        case 40: // down
        case 9: // tab
        case 13: // return
            return;
        default:
            // ignore if the following keys are pressed: [shift] [capslock]
            if (e.keyCode > 8 && e.keyCode < 32) {
                return;
            }
            queueRefreshDataDisplayIfStale();
    }
}

export function requestAssayData(assay) {
    const protocol = EDDData.Protocols[assay.pid];
    $.ajax({
        "url": ["measurements", assay.pid, assay.id, ""].join("/"),
        "type": "GET",
        "dataType": "json",
        "error": (xhr, status) => {
            return;
        },
        "success": processMeasurementData.bind(this, protocol),
    });
}

function processMeasurementData(protocol, data) {
    const assaySeen = {};
    const protocolToAssay = {};
    let count_total = 0;
    let count_rec = 0;
    EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
    EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);

    // attach measurement counts to each assay
    $.each(data.total_measures, (assayId: string, count: number): void => {
        const assay = EDDData.Assays[assayId];
        if (assay) {
            // TODO: If we ever fetch by something other than protocol,
            // Isn't there a chance this is cumulative, and we should += ?
            assay.count = count;
            count_total += count;
        }
    });
    // loop over all downloaded measurements
    $.each(data.measures || {}, (index, measurement) => {
        const assay = EDDData.Assays[measurement.assay];
        ++count_rec;
        if (!assay || assay.count === undefined) {
            return;
        }
        const line = EDDData.Lines[assay.lid];
        if (!line || !line.active) {
            return;
        }
        // attach values
        $.extend(measurement, { "values": data.data[measurement.id] || [] });
        // store the measurements
        EDDData.AssayMeasurements[measurement.id] = measurement;
        // track which assays received updated measurements
        assaySeen[assay.id] = true;
        protocolToAssay[assay.pid] = protocolToAssay[assay.pid] || {};
        protocolToAssay[assay.pid][assay.id] = true;
        // handle measurement data based on type
        const mtype = data.types[measurement.type] || {};
        (assay.measures = assay.measures || []).push(measurement.id);
        if (mtype.family === "m") {
            // measurement is of metabolite
            (assay.metabolites = assay.metabolites || []).push(measurement.id);
        } else if (mtype.family === "p") {
            // measurement is of protein
            (assay.proteins = assay.proteins || []).push(measurement.id);
        } else if (mtype.family === "g") {
            // measurement is of gene / transcript
            (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
        } else {
            // throw everything else in a general area
            (assay.general = assay.general || []).push(measurement.id);
        }
    });

    progressiveFilteringWidget.processIncomingMeasurementRecords(
        data.measures || {},
        data.types,
    );

    if (count_rec < count_total) {
        // TODO not all measurements downloaded; display a message indicating this
        // explain downloading individual assay measurements too
    }
    queueRefreshDataDisplayIfStale();
}

export function queueRefreshDataDisplayIfStale() {
    if (refresDataDisplayIfStaleTimer) {
        clearTimeout(refresDataDisplayIfStaleTimer);
    }
    refresDataDisplayIfStaleTimer = setTimeout(
        refreshDataDisplayIfStale.bind(this),
        100,
    );
}

export function queueActionPanelRefresh() {
    if (actionPanelRefreshTimer) {
        clearTimeout(actionPanelRefreshTimer);
    }
    actionPanelRefreshTimer = setTimeout(actionPanelRefresh.bind(this), 150);
}

// This function determines if the filtering sections (or settings related to them) have
// changed since the last time we were in the current display mode (e.g. line graph, table,
// bar graph in various modes, etc) and updates the display only if a change is detected.
function refreshDataDisplayIfStale(force?: boolean) {
    // Any switch between viewing modes, or change in filtering, is also cause to check the UI
    // in the action panel and make sure it's current.
    queueActionPanelRefresh();
    $("#graphLoading").addClass("off");

    // If the filtering widget claims a change since the last inquiry,
    // then all the viewing modes are stale, no matter what.
    // So we mark them all.
    if (progressiveFilteringWidget.checkRedrawRequired(force)) {
        viewingModeIsStale.linegraph = true;
        viewingModeIsStale["bargraph-time"] = true;
        viewingModeIsStale["bargraph-line"] = true;
        viewingModeIsStale["bargraph-measurement"] = true;
        viewingModeIsStale.table = true;
        // Pull out a fresh set of filtered measurements and assays
        const filterResults = progressiveFilteringWidget.buildFilteredMeasurements();
        postFilteringMeasurements = filterResults.filteredMeasurements;
        // If the filtering widget has not changed and the current mode does not claim to be
        // stale, we are done.
    } else if (viewingMode === "bargraph") {
        // Special case to handle the extra sub-modes of the bar graph
        if (!viewingModeIsStale[viewingMode + "-" + barGraphMode]) {
            return;
        }
    } else if (!viewingModeIsStale[viewingMode]) {
        return;
    }

    if (viewingMode === "table") {
        assaysDataGridSpec = new DataGridSpecAssays();
        assaysDataGridSpec.init();
        assaysDataGrid = new DataGridAssays(assaysDataGridSpec);
        viewingModeIsStale.table = false;
        progressiveFilteringWidget.lineNameFilter.setLineColors();
    } else {
        remakeMainGraphArea();
        if (viewingMode === "bargraph") {
            viewingModeIsStale[viewingMode + "-" + barGraphMode] = false;
        } else {
            viewingModeIsStale.linegraph = false;
        }
    }
}

function actionPanelRefresh() {
    let checkedBoxes: HTMLInputElement[];
    // Figure out how many assays/checkboxes are selected.

    // Don't show the selected item count if we're not looking at the table.
    // (Only the visible item count makes sense in that case.)
    if (viewingMode === "table") {
        $(".displayedDiv").addClass("off");
        if (assaysDataGrid) {
            checkedBoxes = assaysDataGrid.getSelectedCheckboxElements();
        } else {
            checkedBoxes = [];
        }
        const checkedAssays = $(checkedBoxes).filter("[name=assayId]").length;
        const checkedMeasure = $(checkedBoxes).filter("[name=measurementId]").length;
        const nothingSelected = !checkedAssays && !checkedMeasure;
        // enable action buttons if something is selected
        const actionButtonGroup = $(".tableActionButtons");
        actionButtonGroup.find("button.assayButton").prop("disabled", !checkedAssays);
        actionButtonGroup
            .find("button")
            .not(".assayButton")
            .prop("disabled", nothingSelected);
        $(".selectedDiv").toggleClass("off", nothingSelected);
        const selectedStrs = [];
        if (!nothingSelected) {
            if (checkedAssays) {
                selectedStrs.push(
                    checkedAssays > 1 ? checkedAssays + " Assays" : "1 Assay",
                );
            }
            if (checkedMeasure) {
                selectedStrs.push(
                    checkedMeasure > 1
                        ? checkedMeasure + " Measurements"
                        : "1 Measurement",
                );
            }
            const selectedStr = selectedStrs.join(", ");
            $(".selectedDiv").text(selectedStr + " selected");
        }
    } else {
        $(".selectedDiv").addClass("off");
        $(".displayedDiv").removeClass("off");
    }
    // if there are assays but no data, show empty assays
    // note: this is to combat the current default setting for showing graph on page load
    if (
        !$.isEmptyObject(EDDData.Assays) &&
        $.isEmptyObject(EDDData.AssayMeasurements)
    ) {
        if (!$("#TableShowEAssaysCB").prop("checked")) {
            $("#TableShowEAssaysCB").click();
        }
    }
}

function remakeMainGraphArea() {
    let dataPointsDisplayed = 0;
    let dataSets: GraphValue[][] = [];

    $("#tooManyPoints").hide();
    $("#lineGraph").addClass("off");
    $("#barGraphByTime").addClass("off");
    $("#barGraphByLine").addClass("off");
    $("#barGraphByMeasurement").addClass("off");

    // show message that there's no data to display
    if (postFilteringMeasurements.length === 0) {
        $("#graphLoading").addClass("off"); // Remove load spinner if still present
        $("#noData").removeClass("off");
        return;
    }

    // set any unchecked labels to black
    progressiveFilteringWidget.lineNameFilter.setLineColors();
    dataSets = postFilteringMeasurements.map((mId: number, i: number): GraphValue[] => {
        const measure: MeasurementRecord = EDDData.AssayMeasurements[mId];
        const points: number = measure ? measure.values.length : 0;
        // Skip the rest if we've hit our limit
        if (dataPointsDisplayed > 15000) {
            return;
        }
        dataPointsDisplayed += points;
        const assay: AssayRecord = EDDData.Assays[measure.assay];
        const line: LineRecord = EDDData.Lines[assay.lid];
        return eddGraphing.transformSingleLineItem(measure, line.color);
    });

    $(".displayedDiv").text(dataPointsDisplayed + " measurements displayed");
    $("#noData").addClass("off");

    // data for graphs
    const graphSet = {
        "values": Utl.chainArrays(dataSets),
        "width": 750,
        "height": 220,
    };

    if (viewingMode === "linegraph") {
        const view = new GraphView(
            $("#lineGraph")
                .empty()
                .removeClass("off")
                .get(0),
        );
        view.buildLineGraph(graphSet);
    } else if (viewingMode === "bargraph") {
        let elem: Element;
        if (barGraphMode === "time") {
            elem = $("#barGraphByTime")
                .empty()
                .removeClass("off")
                .get(0);
        } else if (barGraphMode === "line") {
            elem = $("#barGraphByLine")
                .empty()
                .removeClass("off")
                .get(0);
        } else if (barGraphMode === "measurement") {
            elem = $("#barGraphByMeasurement")
                .empty()
                .removeClass("off")
                .get(0);
        } else {
            return;
        }
        const view = new GraphView(elem);
        view.buildGroupedBarGraph(graphSet, barGraphMode);
    }
}

export function showEditAssayDialog(selection: JQuery): void {
    // TODO: move this to handler for "edddata" event
    const access = Config.Access.initAccess(EDDData);
    const form = $("#assayMain");
    let titleText: string;
    let record: AssayRecord;
    let experimenter: Utl.EDDContact;

    // Update the dialog title and fetch selection info
    if (selection.length === 0) {
        titleText = $("#new_assay_title").text();
    } else {
        if (selection.length > 1) {
            titleText = $("#bulk_assay_title").text();
        } else {
            titleText = $("#edit_assay_title").text();
        }
        record = access.assayFromSelection(selection);
        experimenter = new Utl.EDDContact(record.experimenter);
    }
    form.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(form, "assay");
    const str = (x: any): string => "" + (x || ""); // forces values to string, falsy === ""
    // define fields on form
    const fields: { [name: string]: Forms.IFormField } = {
        "name": new Forms.Field(form.find("[name=assay-name]"), "name"),
        "description": new Forms.Field(
            form.find("[name=assay-description]"),
            "description",
        ),
        "protocol": new Forms.Field(form.find("[name=assay-protocol"), "pid"),
        "experimenter": new Forms.Autocomplete(
            form.find("[name=assay-experimenter_0"),
            form.find("[name=assay-experimenter_1"),
            "experimenter",
        ).render((): [string, string] => [
            experimenter.display(),
            str(experimenter.id()),
        ]),
    };
    // initialize the form to clean slate, pass in active selection, selector for previous items
    formManager
        .init(selection, "[name=assayId]")
        .fields($.map(fields, (v: Forms.IFormField) => v));
    assayMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        assayMetadataManager.metadata(record.meta);
    }

    // special case, ignore name field when editing multiples
    if (selection.length > 1) {
        form.find("[name=assay-name]")
            // remove required property
            .prop("required", false)
            // also hide form elements and uncheck bulk box
            .parent()
            .hide()
            .find(":checkbox")
            .prop("checked", false)
            .end()
            .end();
    } else {
        form.find("[name=assay-name]")
            // make sure line name is required
            .prop("required", true)
            // and line name is shown
            .parent()
            .show()
            .end()
            .end();
    }

    // display modal dialog
    form.removeClass("off").dialog("open");
}

class DataGridAssays extends DataGrid {
    constructor(dataGridSpec: DataGridSpecBase) {
        super(dataGridSpec);
    }

    _getClasses(): string {
        return "dataTable sortable dragboxes hastablecontrols table-striped";
    }
}

// Extending the standard AssayRecord to hold some client-side calculations.
// The idea is, these start out undefined, and are calculated on-demand.
interface AssayRecordExended extends AssayRecord {
    maxXValue: number;
    minXValue: number;
}

// The spec object that will be passed to DataGrid to create the Assays table(s)
class DataGridSpecAssays extends DataGridSpecBase {
    metaDataIDsUsedInAssays: any;
    maximumXValueInData: number;
    minimumXValueInData: number;

    measuringTimesHeaderSpec: DataGridHeaderSpec;

    graphObject: any;

    constructor() {
        super();
        this.graphObject = null;
        this.measuringTimesHeaderSpec = null;
    }

    init() {
        this.findMaximumXValueInData();
        this.findMetaDataIDsUsedInAssays();
        super.init();
    }

    // An array of unique identifiers, used to identify the records in the data set being displayed
    getRecordIDs(): any[] {
        const lr = progressiveFilteringWidget.lastFilteringResults;
        if (lr) {
            return lr.filteredAssays;
        }
        return [];
    }

    // This is an override.  Called when a data reset is triggered, but before the table rows are
    // rebuilt.
    onDataReset(dataGrid: DataGrid): void {
        this.findMaximumXValueInData();
        if (this.measuringTimesHeaderSpec && this.measuringTimesHeaderSpec.element) {
            $(this.measuringTimesHeaderSpec.element)
                .children(":first")
                .text(
                    "Measuring Times (Range " +
                        this.minimumXValueInData +
                        " to " +
                        this.maximumXValueInData +
                        ")",
                );
        }
    }

    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    getTableElement() {
        return document.getElementById("studyAssaysTable");
    }

    // Specification for the table as a whole
    defineTableSpec(): DataGridTableSpec {
        return new DataGridTableSpec("assays", {
            "defaultSort": 0,
        });
    }

    findMetaDataIDsUsedInAssays() {
        const seenHash: any = {};
        this.metaDataIDsUsedInAssays = [];
        $.each(EDDData.Assays, (assayId, assay) => {
            $.each(assay.meta || {}, (metaId) => {
                seenHash[metaId] = true;
            });
        });
        [].push.apply(this.metaDataIDsUsedInAssays, Object.keys(seenHash));
    }

    findMaximumXValueInData(): void {
        type MinMax = [number, number];
        // reduce to find highest/lowest value across all records
        const minmax = this.getRecordIDs().reduce(
            (outer: MinMax, assayId): MinMax => {
                const assay: AssayRecordExended = EDDData.Assays[
                    assayId
                ] as AssayRecordExended;
                let measures: number[];
                let recordMinmax: MinMax;
                // Some caching to speed subsequent runs way up...
                if (assay.maxXValue !== undefined && assay.minXValue !== undefined) {
                    recordMinmax = [assay.maxXValue, assay.minXValue];
                } else {
                    measures = assay.measures || [];
                    // reduce to find highest/lowest value across all measures
                    recordMinmax = measures.reduce<MinMax>(
                        (middle: MinMax, measureId): MinMax => {
                            const lookup = EDDData.AssayMeasurements || {};
                            const measure = lookup[measureId] || NULL_MEASURE;
                            // reduce to find highest/lowest value across all data in measurement
                            const measureMinmax = (measure.values || []).reduce(
                                (inner: MinMax, point): MinMax => {
                                    return [
                                        Math.max(inner[0], point[0][0]),
                                        Math.min(inner[1], point[0][0]),
                                    ];
                                },
                                [0, Number.MAX_VALUE],
                            );
                            return [
                                Math.max(middle[0], measureMinmax[0]),
                                Math.min(middle[1], measureMinmax[1]),
                            ];
                        },
                        [0, Number.MAX_VALUE],
                    );
                    assay.maxXValue = recordMinmax[0];
                    assay.minXValue = recordMinmax[1];
                }
                return [
                    Math.max(outer[0], recordMinmax[0]),
                    Math.min(outer[1], recordMinmax[1]),
                ];
            },
            [0, Number.MAX_VALUE],
        );
        // Anything above 0 is acceptable, but 0 will default instead to 1.
        this.maximumXValueInData = minmax[0] || 1;
        this.minimumXValueInData = minmax[1] === Number.MAX_VALUE ? 0 : minmax[1];
    }

    private loadAssayName(index: any): string {
        // In an old typical EDDData.Assays record this string is currently pre-assembled
        // and stored in 'fn'. But we're phasing that out. Eventually the name will just be
        // .name, without decoration.
        const assay = EDDData.Assays[index];
        if (assay) {
            return assay.name.toUpperCase();
        }
        return "";
    }

    private loadLineName(index: any): string {
        const assay = EDDData.Assays[index];
        if (assay) {
            const line = EDDData.Lines[assay.lid];
            if (line) {
                return line.name.toUpperCase();
            }
        }
        return "";
    }

    private loadExperimenterInitials(index: any): string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        const assay = EDDData.Assays[index];
        if (assay) {
            const experimenter = EDDData.Users[assay.experimenter];
            if (experimenter) {
                return experimenter.initials.toUpperCase();
            }
        }
        return "?";
    }

    private loadAssayModification(index: any): number {
        return EDDData.Assays[index].modified.time;
    }

    // Specification for the headers along the top of the table
    defineHeaderSpec(): DataGridHeaderSpec[] {
        // map all metadata IDs to HeaderSpec objects
        const metaDataHeaders: DataGridHeaderSpec[] = this.metaDataIDsUsedInAssays.map(
            (id, index) => {
                const mdType = EDDData.MetaDataTypes[id];
                return new DataGridHeaderSpec(2 + index, "hAssaysMetaid" + id, {
                    "name": mdType.name,
                    "headerRow": 2,
                    "size": "s",
                    "sortBy": this.makeMetaDataSortFunction(id),
                    "sortAfter": 1,
                });
            },
        );

        // The left section of the table has Assay Name and Line (Name)
        const leftSide: DataGridHeaderSpec[] = [
            new DataGridHeaderSpec(1, "hAssaysName", {
                "name": "Assay Name",
                "headerRow": 2,
                "sortBy": this.loadAssayName,
            }),
            new DataGridHeaderSpec(2, "hAssayLineName", {
                "name": "Line",
                "headerRow": 2,
                "sortBy": this.loadLineName,
            }),
        ];

        // Offsets for the right side of the table depends on size of the preceding sections
        let rightOffset = leftSide.length + metaDataHeaders.length;
        const rightSide = [
            new DataGridHeaderSpec(++rightOffset, "hAssaysMName", {
                "name": "Measurement",
                "headerRow": 2,
            }),
            new DataGridHeaderSpec(++rightOffset, "hAssaysUnits", {
                "name": "Units",
                "headerRow": 2,
            }),
            new DataGridHeaderSpec(++rightOffset, "hAssaysCount", {
                "name": "Count",
                "headerRow": 2,
            }),
            // The measurement times are referenced elsewhere, so are saved to the object
            (this.measuringTimesHeaderSpec = new DataGridHeaderSpec(
                ++rightOffset,
                "hAssaysCount",
                {
                    "name": "Measuring Times",
                    "headerRow": 2,
                },
            )),
            new DataGridHeaderSpec(++rightOffset, "hAssaysExperimenter", {
                "name": "Experimenter",
                "headerRow": 2,
                "sortBy": this.loadExperimenterInitials,
                "sortAfter": 1,
            }),
            new DataGridHeaderSpec(++rightOffset, "hAssaysModified", {
                "name": "Last Modified",
                "headerRow": 2,
                "sortBy": this.loadAssayModification,
                "sortAfter": 1,
            }),
        ];

        return leftSide.concat(metaDataHeaders, rightSide);
    }

    private makeMetaDataSortFunction(id) {
        return (i) => {
            const record = EDDData.Assays[i];
            if (record && record.meta) {
                return record.meta[id] || "";
            }
            return "";
        };
    }

    // The colspan value for all the cells that are assay-level (not measurement-level) is based
    // on the number of measurements for the respective record. Specifically, it's the number of
    // metabolite and general measurements, plus 1 if there are transcriptomics measurements,
    // plus 1 if there are proteomics measurements, all added together.
    // (Or 1, whichever is higher.)
    private rowSpanForRecord(index): number {
        const rec = EDDData.Assays[index];
        const v: number =
            (rec.general || []).length +
                (rec.metabolites || []).length +
                ((rec.transcriptions || []).length ? 1 : 0) +
                ((rec.proteins || []).length ? 1 : 0) || 1;
        return v;
    }

    generateAssayNameCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        const record = EDDData.Assays[index];
        return [
            new DataGridDataCell(gridSpec, index, {
                "checkboxName": "assayId",
                "checkboxWithID": (id) => "assay" + id + "include",
                "hoverEffect": true,
                "nowrap": true,
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": record.name,
            }),
        ];
    }

    generateLineNameCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        const record = EDDData.Assays[index],
            line = EDDData.Lines[record.lid];
        return [
            new DataGridDataCell(gridSpec, index, {
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": line.name,
            }),
        ];
    }

    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[] => {
            const assay = EDDData.Assays[index];
            const type = EDDData.MetaDataTypes[id];
            let contentStr = assay.meta[id] || "";
            if (assay && type && assay.meta && contentStr) {
                contentStr = [type.prefix || "", contentStr, type.postfix || ""]
                    .join(" ")
                    .trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    "rowspan": gridSpec.rowSpanForRecord(index),
                    "contentString": contentStr,
                }),
            ];
        };
    }

    private generateMeasurementCells(
        gridSpec: DataGridSpecAssays,
        index: string,
        opt: any,
    ): DataGridDataCell[] {
        let cells = [];
        const record: AssayRecord = EDDData.Assays[index];
        const factory = (): DataGridDataCell => new DataGridDataCell(gridSpec, index);

        if ((record.metabolites || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(
                    new DataGridLoadingCell(gridSpec, index, {
                        "rowspan": record.metabolites.length,
                    }),
                );
            } else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.metabolites
                    .map(opt.metaboliteToValue)
                    .sort(opt.metaboliteValueSort)
                    .map(opt.metaboliteValueToCell);
            }
        }
        if ((record.general || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(
                    new DataGridLoadingCell(gridSpec, index, {
                        "rowspan": record.general.length,
                    }),
                );
            } else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.general
                    .map(opt.metaboliteToValue)
                    .sort(opt.metaboliteValueSort)
                    .map(opt.metaboliteValueToCell);
            }
        }
        // generate only one cell if there is any transcriptomics data
        if ((record.transcriptions || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index));
            } else {
                cells.push(opt.transcriptToCell(record.transcriptions));
            }
        }
        // generate only one cell if there is any proteomics data
        if ((record.proteins || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index));
            } else {
                cells.push(opt.proteinToCell(record.proteins));
            }
        }
        // generate a loading cell if none created by measurements
        if (!cells.length) {
            if (record.count) {
                // we have a count, but no data yet; still loading
                cells.push(new DataGridLoadingCell(gridSpec, index));
            } else if (opt.empty) {
                cells.push(opt.empty.call({}));
            } else {
                cells.push(factory());
            }
        }
        return cells;
    }

    generateMeasurementNameCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId) => {
                const measure: any = EDDData.AssayMeasurements[measureId] || {},
                    mtype: any = EDDData.MeasurementTypes[measure.type] || {};
                return { "name": mtype.name || "", "id": measureId };
            },
            "metaboliteValueSort": (a: any, b: any) => {
                const y = a.name.toLowerCase(),
                    z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value) => {
                return new DataGridDataCell(gridSpec, value.id, {
                    "hoverEffect": true,
                    "checkboxName": "measurementId",
                    "checkboxWithID": () => "measurement" + value.id + "include",
                    "contentString": value.name,
                });
            },
            "transcriptToCell": (ids: any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": "Transcriptomics Data",
                });
            },
            "proteinToCell": (ids: any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": "Proteomics Data",
                });
            },
            "empty": () =>
                new DataGridDataCell(gridSpec, index, {
                    "contentString": "<i>No Measurements</i>",
                }),
        });
    }

    generateUnitsCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId) => {
                const measure: any = EDDData.AssayMeasurements[measureId] || {},
                    mtype: any = EDDData.MeasurementTypes[measure.type] || {},
                    unit: any = EDDData.UnitTypes[measure.y_units] || {};
                return {
                    "name": mtype.name || "",
                    "id": measureId,
                    "unit": unit.name || "",
                };
            },
            "metaboliteValueSort": (a: any, b: any) => {
                const y = a.name.toLowerCase(),
                    z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": value.unit,
                });
            },
            "transcriptToCell": (ids: any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": "RPKM",
                });
            },
            "proteinToCell": (ids: any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": "", // TODO: what are proteomics measurement units?
                });
            },
        });
    }

    generateCountCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        // function to use in Array#reduce to count all the values in a set of measurements
        const reduceCount = (prev: number, measureId) => {
            const measure: any = EDDData.AssayMeasurements[measureId] || {};
            return prev + (measure.values || []).length;
        };
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId) => {
                const measure: any = EDDData.AssayMeasurements[measureId] || {},
                    mtype: any = EDDData.MeasurementTypes[measure.type] || {};
                return {
                    "name": mtype.name || "",
                    "id": measureId,
                    "measure": measure,
                };
            },
            "metaboliteValueSort": (a: any, b: any) => {
                const y = a.name.toLowerCase(),
                    z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": [
                        "(",
                        (value.measure.values || []).length,
                        ")",
                    ].join(""),
                });
            },
            "transcriptToCell": (ids: any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": ["(", ids.reduce(reduceCount, 0), ")"].join(""),
                });
            },
            "proteinToCell": (ids: any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": ["(", ids.reduce(reduceCount, 0), ")"].join(""),
                });
            },
        });
    }

    generateMeasuringTimesCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        const svgCellForTimeCounts = (ids: any[]) => {
            const timeCount: { [time: number]: number } = {};
            // count values at each x for all measurements
            ids.forEach((measureId) => {
                const measure = EDDData.AssayMeasurements[measureId] || NULL_MEASURE;
                const points: number[][][] = measure.values || [];
                points.forEach((point: number[][]) => {
                    timeCount[point[0][0]] = timeCount[point[0][0]] || 0;
                    // Typescript compiler does not like using increment operator on expression
                    ++timeCount[point[0][0]];
                });
            });
            // map the counts to array of [[x], [count]] tuples
            const consolidated: number[][][] = $.map(timeCount, (value, key) => [
                // key should be a number, but sometimes is a string
                // if parseFloat gets a number, it just returns the number
                // so force cast to string, so the type info on parseFloat accepts
                [[parseFloat((key as unknown) as string)], [value]],
            ]);
            // generate SVG string
            let svg = "";
            if (consolidated.length) {
                svg = gridSpec.assembleSVGStringForDataPoints(consolidated, "");
            }
            return new DataGridDataCell(gridSpec, index, {
                "contentString": svg,
            });
        };
        interface CellValue {
            name: string;
            id: number;
            measure: MeasurementRecord;
        }
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId: number): CellValue => {
                const measure = EDDData.AssayMeasurements[measureId] || NULL_MEASURE;
                const mtype: MeasurementTypeRecord =
                    EDDData.MeasurementTypes[measure.type] ||
                    ({} as MeasurementTypeRecord);
                return {
                    "name": mtype.name || "",
                    "id": measureId,
                    "measure": measure,
                };
            },
            "metaboliteValueSort": (a: CellValue, b: CellValue): number => {
                const y = a.name.toLowerCase();
                const z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value: CellValue) => {
                const measure = value.measure || ({} as MeasurementRecord);
                const format = measure.format === "1" ? "carbon" : "";
                const points = measure.values || [];
                const svg = gridSpec.assembleSVGStringForDataPoints(points, format);
                return new DataGridDataCell(gridSpec, index, {
                    "contentString": svg,
                });
            },
            "transcriptToCell": svgCellForTimeCounts,
            "proteinToCell": svgCellForTimeCounts,
        });
    }

    generateExperimenterCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        const exp = EDDData.Assays[index].exp;
        const uRecord = EDDData.Users[exp];
        return [
            new DataGridDataCell(gridSpec, index, {
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": uRecord ? uRecord.initials : "?",
            }),
        ];
    }

    generateModificationDateCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": Utl.JS.timestampToTodayString(
                    EDDData.Assays[index].mod,
                ),
            }),
        ];
    }

    assembleSVGStringForDataPoints(points: number[][][], format: string): string {
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" version="1.2"\
                    width="100%" height="10px"\
                    viewBox="0 0 470 10" preserveAspectRatio="none">\
                <style type="text/css"><![CDATA[\
                        .cP { stroke:rgba(0,0,0,1); stroke-width:4px; stroke-linecap:round; }\
                        .cV { stroke:rgba(0,0,230,1); stroke-width:4px; stroke-linecap:round; }\
                        .cE { stroke:rgba(255,128,0,1); stroke-width:4px; stroke-linecap:round; }\
                    ]]></style>\
                <path fill="rgba(0,0,0,0.0.05)"\
                        stroke="rgba(0,0,0,0.05)"\
                        d="M10,5h450"\
                        style="stroke-width:2px;"\
                        stroke-width="2"></path>';
        const paths = [svg];
        points
            .sort((a, b) => a[0][0] - b[0][0])
            .forEach((point) => {
                const x = point[0][0];
                const y = point[1][0];
                const range = this.maximumXValueInData - this.minimumXValueInData;
                const rx =
                    range !== 0
                        ? ((x - this.minimumXValueInData) / range) * 450 + 10
                        : 10;
                const tt = [y, " at ", x, "h"].join("");
                paths.push(['<path class="cE" d="M', rx, ',5v4"></path>'].join(""));
                if (y === undefined || y === null) {
                    paths.push(['<path class="cE" d="M', rx, ',2v6"></path>'].join(""));
                    return;
                }
                paths.push(['<path class="cP" d="M', rx, ',1v4"></path>'].join(""));
                if (format === "carbon") {
                    paths.push(
                        [
                            '<path class="cV" d="M',
                            rx,
                            ',1v8"><title>',
                            tt,
                            "</title></path>",
                        ].join(""),
                    );
                } else {
                    paths.push(
                        [
                            '<path class="cP" d="M',
                            rx,
                            ',1v8"><title>',
                            tt,
                            "</title></path>",
                        ].join(""),
                    );
                }
            });
        paths.push("</svg>");
        return paths.join("\n");
    }

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec(): DataGridColumnSpec[] {
        let counter = 0;
        const leftSide = [
            new DataGridColumnSpec(++counter, this.generateAssayNameCells),
            new DataGridColumnSpec(++counter, this.generateLineNameCells),
        ];
        const metaDataCols = this.metaDataIDsUsedInAssays.map((id) => {
            return new DataGridColumnSpec(
                ++counter,
                this.makeMetaDataCellsGeneratorFunction(id),
            );
        });
        const rightSide = [
            new DataGridColumnSpec(++counter, this.generateMeasurementNameCells),
            new DataGridColumnSpec(++counter, this.generateUnitsCells),
            new DataGridColumnSpec(++counter, this.generateCountCells),
            new DataGridColumnSpec(++counter, this.generateMeasuringTimesCells),
            new DataGridColumnSpec(++counter, this.generateExperimenterCells),
            new DataGridColumnSpec(++counter, this.generateModificationDateCells),
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }

    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec(): DataGridColumnGroupSpec[] {
        const topSection: DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec("Name", { "showInVisibilityList": false }),
            new DataGridColumnGroupSpec("Line", { "showInVisibilityList": false }),
        ];

        const metaDataColGroups: DataGridColumnGroupSpec[] = this.metaDataIDsUsedInAssays.map(
            (id, index): DataGridColumnGroupSpec => {
                const mdType = EDDData.MetaDataTypes[id];
                return new DataGridColumnGroupSpec(mdType.name);
            },
        );

        const bottomSection: DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec("Measurement", {
                "showInVisibilityList": false,
            }),
            new DataGridColumnGroupSpec("Units", { "showInVisibilityList": false }),
            new DataGridColumnGroupSpec("Count", { "showInVisibilityList": false }),
            new DataGridColumnGroupSpec("Measuring Times", {
                "showInVisibilityList": false,
            }),
            new DataGridColumnGroupSpec("Experimenter", { "hiddenByDefault": true }),
            new DataGridColumnGroupSpec("Last Modified", { "hiddenByDefault": true }),
        ];

        return topSection.concat(metaDataColGroups, bottomSection);
    }

    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[] {
        const widgetSet: DataGridHeaderWidget[] = [];

        // A "select all / select none" button
        const selectAllWidget = new DGSelectAllAssaysMeasurementsWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);

        return widgetSet;
    }

    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[] {
        const widgetSet: DataGridOptionWidget[] = [];
        const disabledAssaysWidget = new DGDisabledAssaysWidget(dataGrid, this);
        const emptyAssaysWidget = new DGEmptyAssaysWidget(dataGrid, this);
        widgetSet.push(disabledAssaysWidget);
        widgetSet.push(emptyAssaysWidget);
        return widgetSet;
    }

    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid: DataGridAssays): void {
        // Wire up the 'action panels' for the Assays sections
        const table = this.getTableElement();
        $(table).on("change", ":checkbox", () => queueActionPanelRefresh());

        // Run it once in case the page was generated with checked Assays
        queueActionPanelRefresh();
    }
}

// A slightly modified "Select All" header widget
// that triggers a refresh of the actions panel when it changes the checkbox state.
class DGSelectAllAssaysMeasurementsWidget extends DGSelectAllWidget {
    clickHandler(): void {
        super.clickHandler();
        queueActionPanelRefresh();
    }
}

// When unchecked, this hides the set of Assays that are marked as disabled.
class DGDisabledAssaysWidget extends DataGridOptionWidget {
    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID): string {
        return "TableShowDAssaysCB";
    }

    // Return text used to label the widget
    getLabelText(): string {
        return "Show Disabled";
    }

    getLabelTitle(): string {
        return "Show assays that have been disabled.";
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault(): boolean {
        return !!$("#filteringShowDisabledCheckbox").prop("checked");
    }

    // Handle activation of widget
    onWidgetChange(e): void {
        const amIChecked = !!this.checkBoxElement.checked;
        const isOtherChecked: boolean = $("#filteringShowDisabledCheckbox").prop(
            "checked",
        );
        $("#filteringShowDisabledCheckbox").prop("checked", amIChecked);
        if (amIChecked !== isOtherChecked) {
            queueRefreshDataDisplayIfStale();
        }
        // We don't call the superclass version of this function because we don't
        // want to trigger a call to arrangeTableDataRows just yet.
        // The queueRefreshDataDisplayIfStale function will do it for us, after
        // rebuilding the filtering section.
    }

    applyFilterToIDs(rowIDs: string[]): string[] {
        const checked = !!this.checkBoxElement.checked;
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs) {
            $("#enableButton").removeClass("off");
        } else {
            $("#enableButton").addClass("off");
        }

        const anyDisabledChecked: boolean = $(".disabledRecord")
            .toArray()
            .some((row): boolean =>
                $(row)
                    .find("input")
                    .prop("checked"),
            );
        $("#enableButton").prop("disabled", !anyDisabledChecked);

        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        return rowIDs.filter((id: string): boolean => {
            return !!EDDData.Assays[id].active;
        });
    }

    initialFormatRowElementsForID(dataRowObjects: any, rowID: string): any {
        const assay = EDDData.Assays[rowID];
        if (!assay.active) {
            $.each(dataRowObjects, (x, row) => {
                $(row.getElement()).addClass("disabledRecord");
            });
        }
    }
}

// When unchecked, this hides the set of Assays that have no measurement data.
class DGEmptyAssaysWidget extends DataGridOptionWidget {
    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID): string {
        return "TableShowEAssaysCB";
    }

    // Return text used to label the widget
    getLabelText(): string {
        return "Show Empty";
    }

    getLabelTitle(): string {
        return "Show assays that don't have any measurements in them.";
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault(): boolean {
        return !!$("#filteringShowEmptyCheckbox").prop("checked");
    }

    // Handle activation of widget
    onWidgetChange(e): void {
        const amIChecked = !!this.checkBoxElement.checked;
        const isOtherChecked = !!$("#filteringShowEmptyCheckbox").prop("checked");
        $("#filteringShowEmptyCheckbox").prop("checked", amIChecked);
        if (amIChecked !== isOtherChecked) {
            queueRefreshDataDisplayIfStale();
        }
        // We don't call the superclass version of this function because we don't
        // want to trigger a call to arrangeTableDataRows just yet.
        // The queueRefreshDataDisplayIfStale function will do it for us, after
        // rebuilding the filtering section.
    }

    applyFilterToIDs(rowIDs: string[]): string[] {
        const checked = !!this.checkBoxElement.checked;
        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        return rowIDs.filter((id: string): boolean => {
            return !!EDDData.Assays[id].count;
        });
    }

    initialFormatRowElementsForID(dataRowObjects: any, rowID: string): any {
        const assay = EDDData.Assays[rowID];
        if (!assay.count) {
            $.each(dataRowObjects, (x, row) => {
                $(row.getElement()).addClass("emptyRecord");
            });
        }
    }
}

// wait for edddata event to begin processing page
$(document).on("edddata", prepareIt);
