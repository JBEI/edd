import { DataGrid, DataGridSpecBase, DataGridDataCell, DataGridColumnSpec,
        DataGridTableSpec, DataGridHeaderWidget, DataGridColumnGroupSpec,
        DataGridHeaderSpec, DataGridOptionWidget, DataGridLoadingCell, DGSelectAllWidget
        } from "../modules/DataGrid"
import { Utl } from "../modules/Utl"
import { Dragboxes } from "../modules/Dragboxes"
import { EDDGraphingTools } from "../modules/EDDGraphingTools"
import { StudyBase } from "../modules/Study"
import * as $ from "jquery"
import * as d3 from "d3"
import * as _ from "underscore"
import "bootstrap-loader"


declare function require(name: string): any;  // avoiding warnings for require calls below

// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/button.css');
require('jquery-ui/themes/base/draggable.css');
require('jquery-ui/themes/base/resizable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/button');
require('jquery-ui/ui/widgets/draggable');
require('jquery-ui/ui/widgets/resizable');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/tooltip');


export namespace StudyDataPage {
    'use strict';

    var viewingMode: 'linegraph'|'bargraph'|'table';
    var viewingModeIsStale:{[id:string]: boolean};
    var barGraphMode: 'time'|'line'|'measurement';
    var barGraphTypeButtonsJQ:JQuery;

    export var progressiveFilteringWidget: ProgressiveFilteringWidget;
    var postFilteringAssays:any[];
    var postFilteringMeasurements:any[];
    var eddGraphing: EDDGraphingTools;
    var actionPanelRefreshTimer:any;
    var actionPanelIsInBottomBar:boolean;
    var refresDataDisplayIfStaleTimer:any;

    var remakeMainGraphAreaCalls = 0;

    var colorObj:any;

    // Table spec and table objects, one each per Protocol, for Assays.
    var assaysDataGridSpec;
    export var assaysDataGrid;

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


    // For the filtering section on the main graph
    export class ProgressiveFilteringWidget {

        // These are the internal settings for the widget.
        // They may differ from the UI, if we haven't refreshed the filtering section.
        showingDisabled:boolean;
        showingEmpty:boolean;

        allFilters: GenericFilterSection[];
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
                seenRecordFlags: {},
                metaboliteIDs: [],
                proteinIDs: [],
                geneIDs: [],
                measurementIDs: []
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

            var seenInLinesHash: RecordIDToBoolean = {};
            var seenInAssaysHash: RecordIDToBoolean = {};

            this.filterTableJQ = $('<div>').addClass('filterTable');
            $('#mainFilterSection').append(this.filterTableJQ);

            // First do some basic sanity filtering on the list
            $.each(EDDData.Assays, (assayId: string, assay: any): void => {
                var line = EDDData.Lines[assay.lid];
                if (!line || !line.active) return;
                $.each(assay.meta || [], (metadataId) => { seenInAssaysHash[metadataId] = true; });
                $.each(line.meta || [], (metadataId) => { seenInLinesHash[metadataId] = true; });
            });

            // Create filters on assay tables
            // TODO media is now a metadata type, strain and carbon source should be too
            var assayFilters = [];
            assayFilters.push(new ProtocolFilterSection()); // Protocol
            assayFilters.push(new StrainFilterSection()); // first column in filtering section
            assayFilters.push(new LineNameFilterSection()); // LINE
            assayFilters.push(new CarbonSourceFilterSection());
            assayFilters.push(new CarbonLabelingFilterSection());
            assayFilters.push(new AssayFilterSection()); // Assay
            // convert seen metadata IDs to FilterSection objects, and push to end of assayFilters
            assayFilters.push.apply(assayFilters,
                $.map(seenInAssaysHash, (_, id: string) => new AssayMetaDataFilterSection(id)));
            assayFilters.push.apply(assayFilters,
                $.map(seenInLinesHash, (_, id: string) => new LineMetaDataFilterSection(id)));

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
                this.measurementFilters);
            this.allFilters.forEach((section) => section.configure());

            // We can initialize all the Assay- and Line-level filters immediately
            this.assayFilters = assayFilters;
            this.repopulateLineFilters();
            this.repopulateColumns();
        }

        // Clear out any old filters in the filtering section, and add in the ones that
        // claim to be "useful".
        repopulateColumns(): void {
            var dark:boolean = false;
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
                var assay = EDDData.Assays[measurement.assay], line, mtype;
                // If we've seen it already (rather unlikely), skip it.
                if (this.accumulatedRecordIDs.seenRecordFlags[measurement.id]) { return; }
                this.accumulatedRecordIDs.seenRecordFlags[measurement.id] = true;
                if (!assay) { return };
                line = EDDData.Lines[assay.lid];
                if (!line || !line.active) { return };
                mtype = types[measurement.type] || {};
                if (mtype.family === 'm') { // measurement is of metabolite
                    this.accumulatedRecordIDs.metaboliteIDs.push(measurement.id);
                } else if (mtype.family === 'p') { // measurement is of protein
                    this.accumulatedRecordIDs.proteinIDs.push(measurement.id);
                } else if (mtype.family === 'g') { // measurement is of gene / transcript
                    this.accumulatedRecordIDs.geneIDs.push(measurement.id);
                } else {
                    // throw everything else in a general area
                    this.accumulatedRecordIDs.measurementIDs.push(measurement.id);
                }
            });
            this.repopulateAllFilters();    // Skip the queue - we need to repopulate immediately
        }


        repopulateAllFilters(): void {
            this.repopulateLineFilters();
            this.repopulateMeasurementFilters();
            this.repopulateColumns();
        }


        repopulateLineFilters(): void {
            var filteredAssayIds = this.buildAssayIDSet();
            this.assayFilters.forEach((filter) => {
                filter.populateFilterFromRecordIDs(filteredAssayIds);
                filter.populateTable();
            });
        }

        repopulateMeasurementFilters(): void {

            var filterDisabled: (id:string) => boolean;
            var process: (ids: string[], i: number, widget: GenericFilterSection) => void;

            var m = this.accumulatedRecordIDs.metaboliteIDs;
            var p = this.accumulatedRecordIDs.proteinIDs;
            var g = this.accumulatedRecordIDs.geneIDs;
            var gen = this.accumulatedRecordIDs.measurementIDs;

            if (!this.showingDisabled) {

                filterDisabled = (measureId:string): boolean => {
                    var measure: any = EDDData.AssayMeasurements[measureId];
                    if (!measure) { return false; }
                    var assay = EDDData.Assays[measure.assay];
                    if (!assay) { return false; }
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

            process = (ids: string[], i: number, widget: GenericFilterSection): void => {
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
            var assayIds: any[] = [];
            $.each(EDDData.Assays, (assayId, assay) => {
                var line = EDDData.Lines[assay.lid];
                if (!line || !line.active) return;
                if (!assay.active && !this.showingDisabled) return;
                if (!assay.count && !this.showingEmpty) return;
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

            var showingDisabledCB:boolean = !!$('#filteringShowDisabledCheckbox').prop('checked');
            var showingEmptyCB:boolean = !!$('#filteringShowEmptyCheckbox').prop('checked');

            if ((this.showingDisabled != showingDisabledCB) ||
                    (this.showingEmpty != showingEmptyCB)) {
                this.showingDisabled = showingDisabledCB;
                this.showingEmpty = showingEmptyCB;

                this.repopulateAllFilters();
            }

            var filteredAssayIds = this.buildAssayIDSet();

            var filteringResults:ValueToUniqueList = {};
            filteringResults['allAssays'] = filteredAssayIds;

            $.each(this.assayFilters, (i, filter) => {
                filteredAssayIds = filter.applyProgressiveFiltering(filteredAssayIds);
                filteringResults[filter.sectionShortLabel] = filteredAssayIds;
            });

            filteringResults['filteredAssays'] = filteredAssayIds;

            var measurementIds: any[] = [];
            $.each(filteredAssayIds, (i, assayId) => {
                var assay = EDDData.Assays[assayId];
                $.merge(measurementIds, assay.measures || []);
            });

            filteringResults['allMeasurements'] = measurementIds;

            // We start out with four references to the array of available measurement IDs,
            // one for each major category. Each of these will become its own array in turn as
            // we narrow it down. This is to prevent a sub-selection in one category from
            // overriding a sub-selection in the others.

            var metaboliteMeasurements = measurementIds;
            var proteinMeasurements = measurementIds;
            var geneMeasurements = measurementIds;
            var genericMeasurements = measurementIds;

            // Note that we only try to filter if we got measurements that apply to the widget

            if (this.metaboliteDataPresent) {
                $.each(this.metaboliteFilters, (i, filter) => {
                    metaboliteMeasurements = filter.applyProgressiveFiltering(
                        metaboliteMeasurements
                    );
                    filteringResults[filter.sectionShortLabel] = metaboliteMeasurements;
                });
            }
            if (this.proteinDataPresent) {
                $.each(this.proteinFilters, (i, filter) => {
                    proteinMeasurements = filter.applyProgressiveFiltering(proteinMeasurements);
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
                    genericMeasurements = filter.applyProgressiveFiltering(genericMeasurements);
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

            var checked = (filter: GenericFilterSection): boolean => filter.anyCheckboxesChecked;

            var dSM: any[] = [];    // "Deliberately selected measurements"
            var addAll = (measurements: any[]) => Array.prototype.push.apply(dSM, measurements);
            if ( this.metaboliteFilters.some(checked)) { addAll(metaboliteMeasurements); }
            if (    this.proteinFilters.some(checked)) { addAll(proteinMeasurements); }
            if (       this.geneFilters.some(checked)) { addAll(geneMeasurements); }
            if (this.measurementFilters.some(checked)) { addAll(genericMeasurements); }
            if (dSM.length) {
                filteringResults['filteredMeasurements'] = dSM;
            } else {
                filteringResults['filteredMeasurements'] = measurementIds;
            }
            this.lastFilteringResults = filteringResults;
            return filteringResults;
        }

        // If any of the global filter settings or any of the settings in the individual filters
        // have changed, return true, indicating that the filter will generate different results
        // if queried.
        checkRedrawRequired(force?: boolean): boolean {
            var redraw:boolean = !!force;
            var showingDisabledCB:boolean = !!$('#filteringShowDisabledCheckbox').prop('checked');
            var showingEmptyCB:boolean = !!$('#filteringShowEmptyCheckbox').prop('checked');

            // We know the internal state differs, but we're not here to update it...
            if (this.showingDisabled != showingDisabledCB) { redraw = true; }
            if (this.showingEmpty != showingEmptyCB) { redraw = true; }

            // Walk down the filter widget list.  If we encounter one whose collective checkbox
            // state has changed since we last made this walk, then a redraw is required. Note
            // we should not skip this loop, even if we already know a redraw is required, since
            // the call to anyFilterSettingsChangedSinceLastInquiry sets internal state in the
            // filter widgets that we will use next time around.
            $.each(this.allFilters, (i, filter) => {
                if (filter.anyFilterSettingsChangedSinceLastInquiry()) { redraw = true; }
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
        uniqueIndexCounter: number;

        // The sorted order of the list of unique values found in the filter
        uniqueValuesOrder: number[];

        // A dictionary resolving a record ID (assay ID, measurement ID) to an array. Each array
        // contains the integer identifiers of the unique values that apply to that record.
        // (It's rare, but there can actually be more than one criteria that matches a given ID,
        //  for example a Line with two feeds assigned to it.)
        filterHash: ValueToUniqueList;
        // Dictionary resolving the filter values to HTML Input checkboxes.
        checkboxes: {[index: string]: JQuery};
        // Dictionary used to compare checkboxes with a previous state to determine whether an
        // update is required. Values are 'C' for checked, 'U' for unchecked, and 'N' for not
        // existing at the time. ('N' can be useful when checkboxes are removed from a filter due
        // to the back-end data changing.)
        previousCheckboxState: ValueToString;
        // Dictionary resolving the filter values to HTML table row elements.
        tableRows: {[index: string]: HTMLTableRowElement};

        // References to HTML elements created by the filter
        filterColumnDiv: HTMLElement;
        clearIcons: JQuery;
        plaintextTitleDiv: HTMLElement;
        searchBox: HTMLInputElement;
        searchBoxTitleDiv: HTMLElement;
        scrollZoneDiv: HTMLElement;
        filteringTable: JQuery;
        tableBodyElement: HTMLTableElement;

        // Search box related
        typingTimeout: number;
        typingDelay: number;
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
            this.uniqueIndexCounter = 0;
            this.uniqueValuesOrder = [];
            this.filterHash = {};
            this.previousCheckboxState = {};

            this.tableRows = {};
            this.checkboxes = {};

            this.typingTimeout = null;
            this.typingDelay = 330;    // TODO: Not implemented
            this.currentSearchSelection = '';
            this.previousSearchSelection = '';
            this.minCharsToTriggerSearch = 1;
            this.anyCheckboxesChecked = false;
        }

        configure(title: string='Generic Filter', shortLabel: string='gf'): void {
            this.sectionTitle = title;
            this.sectionShortLabel = shortLabel;
            this.createContainerObjects();
        }

        // Create all the container HTML objects
        createContainerObjects(): void {
            var sBoxID: string = 'filter' + this.sectionShortLabel + 'SearchBox',
                sBox: HTMLInputElement;
            this.filterColumnDiv = $("<div>").addClass('filterColumn')[0];
            var textTitle = $("<span>").addClass('filterTitle').text(this.sectionTitle);
            var clearIcon = $("<span>").addClass('filterClearIcon');
            this.plaintextTitleDiv = $("<div>").addClass('filterHead')
                .append(clearIcon)
                .append(textTitle)[0];

            $(sBox = document.createElement("input"))
                .attr({
                    'id': sBoxID,
                    'name': sBoxID,
                    'placeholder': this.sectionTitle,
                    'size': 14
                });
            sBox.setAttribute('type', 'text'); // JQuery .attr() cannot set this
            this.searchBox = sBox;
            // We need two clear icons for the two versions of the header (with search and without)
            var searchClearIcon = $("<span>").addClass('filterClearIcon');
            this.searchBoxTitleDiv = $("<div>").addClass('filterHeadSearch')
                .append(searchClearIcon)
                .append(sBox)[0];

            // Consolidate the two JQuery elements into one
            this.clearIcons = clearIcon.add(searchClearIcon);

            this.clearIcons.on('click', (ev) => {
                // Changing the checked status will automatically trigger a refresh event
                $.each(this.checkboxes || {}, (id: string, checkbox: JQuery) => {
                    checkbox.prop('checked', false);
                });
                return false;
            });
            this.scrollZoneDiv = $("<div>").addClass('filterCriteriaScrollZone')[0];
            this.filteringTable = $("<table>")
                .addClass('filterCriteriaTable dragboxes')
                .attr({ 'cellpadding': 0, 'cellspacing': 0 })
                .append(this.tableBodyElement = <HTMLTableElement>$("<tbody>")[0]);
        }

        // By calling updateUniqueIndexesHash, we go through the records and find all the unique
        // values in them (for the criteria this particular filter is based on.)
        // Next we create an inverted version of that data structure, so that the unique
        // identifiers we have created map to the values they represent, as well as an array
        // of the unique identifiers sorted by the values.  These are what we'll use to construct
        // the rows of criteria visible in the filter's UI.
        populateFilterFromRecordIDs(ids: string[]): void {
            var crSet: number[], cHash: UniqueIDToValue;
            this.updateUniqueIndexesHash(ids);
            crSet = [];
            cHash = {};
            // Create a reversed hash so keys map values and values map keys
            $.each(this.uniqueIndexes, (value: string, uniqueID: number): void => {
                cHash[uniqueID] = value;
                crSet.push(uniqueID);
            });
            // Alphabetically sort an array of the keys according to values
            crSet.sort((a: number, b: number): number => {
                var _a:string = cHash[a].toLowerCase();
                var _b:string = cHash[b].toLowerCase();
                return _a < _b ? -1 : _a > _b ? 1 : 0;
            });
            this.uniqueValues = cHash;
            this.uniqueValuesOrder = crSet;
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
        isFilterUseful():boolean {
            if (this.uniqueValuesOrder.length < 2) {
                return false;
            }
            return true;
        }

        addToParent(parentDiv):void {
            parentDiv.appendChild(this.filterColumnDiv);
        }

        detach():void {
            $(this.filterColumnDiv).detach();
        }

        generateFilterId(uniqueId: number): string {
            return ['filter', this.sectionShortLabel, 'n', uniqueId, 'cbox'].join('');
        }

        assignUniqueIndex(value: string): number {
            if (this.uniqueIndexes[value] === undefined) {
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
        populateTable():void {
            var fCol = $(this.filterColumnDiv);

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

            var tBody = this.tableBodyElement;
            // Clear out any old table contents
            $(this.tableBodyElement).empty();

            // For each value, if a table row isn't already defined, build one.
            // There's extra code in here to assign colors to rows in the Lines filter
            // which should probably be isolated in a subclass.
            this.uniqueValuesOrder.forEach((uniqueId: number): void => {

                var cboxName, cell, p, q, r, row, rowElem;
                cboxName = this.generateFilterId(uniqueId);
                row = this.tableRows[this.uniqueValues[uniqueId]];
                if (!row) {
                    // No need to append a new row in a separate call:
                    // insertRow() creates, and appends, and returns one.
                    rowElem = <HTMLTableRowElement>this.tableBodyElement.insertRow();
                    this.tableRows[this.uniqueValues[uniqueId]] = rowElem;
                    cell = this.tableRows[this.uniqueValues[uniqueId]].insertCell();
                    this.checkboxes[this.uniqueValues[uniqueId]] = $("<input type='checkbox'>")
                        .attr({ 'name': cboxName, 'id': cboxName })
                        .appendTo(cell);
                    $('<label>').attr('for', cboxName)
                        .text(this.uniqueValues[uniqueId])
                        .appendTo(cell);
                } else {
                    $(row).appendTo(this.tableBodyElement);
                }
            });
            // TODO: Drag select is twitchy - clicking a table cell background should check the
            // box, even if the user isn't hitting the label or the checkbox itself.
            // Fixing this may mean adding additional code to the mousedown/mouseover handler for
            // the whole table (currently in StudyDataPage.prepareIt()).
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
        anyFilterSettingsChangedSinceLastInquiry():boolean {
            var changed:boolean = false,
                currentCheckboxState: ValueToString = {},
                v: any = $(this.searchBox).val();
            this.anyCheckboxesChecked = false;

            this.uniqueValuesOrder.forEach((uniqueId: number): void => {
                var checkbox: JQuery = this.checkboxes[this.uniqueValues[uniqueId]];
                // "C" - checked, "U" - unchecked, "N" - doesn't exist
                var current: 'C'|'U'|'N', previous;
                current = (checkbox.prop('checked') && !checkbox.prop('disabled')) ? 'C' : 'U';
                previous = this.previousCheckboxState[this.uniqueValues[uniqueId]] || 'N';
                if (current !== previous) changed = true;
                if (current === 'C') this.anyCheckboxesChecked = true;
                currentCheckboxState[this.uniqueValues[uniqueId]] = current;
            });

            this.clearIcons.toggleClass('enabled', this.anyCheckboxesChecked);

            v = v.trim();                // Remove leading and trailing whitespace
            v = v.toLowerCase();
            v = v.replace(/\s\s*/, ' '); // Replace internal whitespace with single spaces
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
                        this.checkboxes[uniqueValue].prop('checked', false);
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
        applyProgressiveFiltering(ids:any[]):any {
            // If the filter only contains one item, it's pointless to apply it.
            if (!this.isFilterUseful()) {
                return ids;
            }

            var idsPostFiltering: any[];

            var useSearchBox:boolean = false;
            var queryStrs = [];

            var v = this.currentSearchSelection;
            if (v != null) {
                if (v.length >= this.minCharsToTriggerSearch) {
                    // If there are multiple words, we match each separately.
                    // We will not attempt to match against empty strings, so we filter those out
                    // if any slipped through.
                    queryStrs = v.split(/\s+/).filter((one) => { return one.length > 0; });
                    // The user might have pasted/typed only whitespace, so:
                    if (queryStrs.length > 0) {
                        useSearchBox = true;
                    }
                }
            }

            var valuesVisiblePreFiltering = {};

            idsPostFiltering = ids.filter((id) => {
                var pass: boolean = false;
                // If we have filtering data for this id, use it.
                // If we don't, the id probably belongs to some other measurement category,
                // so we ignore it.
                if (this.filterHash[id]) {
                    // If any of this ID's criteria are checked, this ID passes the filter.
                    // Note that we cannot optimize to use '.some' here becuase we need to
                    // loop through all the criteria to set valuesVisiblePreFiltering.
                    this.filterHash[id].forEach((index) => {
                        var match:boolean = true, text:string;
                        if (useSearchBox) {
                            text = this.uniqueValues[index].toLowerCase();
                            match = queryStrs.some((v) => {
                                return text.length >= v.length && text.indexOf(v) >= 0;
                            });
                        }
                        if (match) {
                            valuesVisiblePreFiltering[index] = 1;
                            if ((this.previousCheckboxState[this.uniqueValues[index]] === 'C') ||
                                    !this.anyCheckboxesChecked) {
                                pass = true;
                            }
                        }
                    });
                }
                return pass;
            });

            // Apply enabled/disabled status and ordering:
            var rowsToAppend = [];
            this.uniqueValuesOrder.forEach((crID) => {
                var checkbox: JQuery = this.checkboxes[this.uniqueValues[crID]],
                    row: HTMLTableRowElement = this.tableRows[this.uniqueValues[crID]],
                    show: boolean = !!valuesVisiblePreFiltering[crID];
                checkbox.prop('disabled', !show)
                $(row).toggleClass('nodata', !show);
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

        // A few utility functions:
        _assayIdToAssay(assayId:string) {
            return EDDData.Assays[assayId];
        }
        _assayIdToLine(assayId:string) {
            var assay = this._assayIdToAssay(assayId);
            if (assay) return EDDData.Lines[assay.lid];
            return undefined;
        }
        _assayIdToProtocol(assayId:string): ProtocolRecord {
            var assay = this._assayIdToAssay(assayId);
            if (assay) return EDDData.Protocols[assay.pid];
            return undefined;
        }
    }

    // One of the highest-level filters: Strain.
    // Note that an Assay's Line can have more than one Strain assigned to it,
    // which is an example of why 'this.filterHash' is built with arrays.
    export class StrainFilterSection extends GenericFilterSection {
        configure():void {
            super.configure('Strain', 'st');
        }

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId: string) => {
                var line:any = this._assayIdToLine(assayId) || {},
                    idx: number;
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered strain name
                (line.strain || []).forEach((strainId: string): void => {
                    var strain = EDDData.Strains[strainId];
                    if (strain && strain.name) {
                        idx = this.assignUniqueIndex(strain.name);
                        this.filterHash[assayId].push(idx);
                    }
                });
            });
        }
    }

    // Just as with the Strain filter, an Assay's Line can have more than one
    // Carbon Source assigned to it.
    export class CarbonSourceFilterSection extends GenericFilterSection {
        configure():void {
            super.configure('Carbon Source', 'cs');
        }

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {},
                    idx: number;
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source name
                (line.carbon || []).forEach((carbonId:string) => {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.name) {
                        idx = this.assignUniqueIndex(src.name);
                        this.filterHash[assayId].push(idx);
                    }
                });
            });
        }
    }

    // A filter for the 'Carbon Source Labeling' field for each Assay's Line
    export class CarbonLabelingFilterSection extends GenericFilterSection {
        configure():void {
            super.configure('Labeling', 'l');
        }

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {},
                    idx: number;
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source labeling description
                (line.carbon || []).forEach((carbonId:string) => {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.labeling) {
                        idx = this.assignUniqueIndex(src.labeling);
                        this.filterHash[assayId].push(idx);
                    }
                });
            });
        }
    }

    // A filter for the name of each Assay's Line
    export class LineNameFilterSection extends GenericFilterSection {
        configure():void {
            super.configure('Line', 'ln');
            this.filteringTable.css('font-weight', 'bold');
        }

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line: LineRecord|any = this._assayIdToLine(assayId) || {},
                    idx: number;
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (line.name) {
                    idx = this.assignUniqueIndex(line.name);
                    this.filterHash[assayId].push(idx);
                    line.identifier = this.generateFilterId(idx);
                }
            });
        }
    }

    // A filter for the Protocol of each Assay
    export class ProtocolFilterSection extends GenericFilterSection {
        configure():void {
            super.configure('Protocol', 'p');
        }

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var protocol: ProtocolRecord = this._assayIdToProtocol(assayId),
                    idx: number;
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (protocol && protocol.name) {
                    idx = this.assignUniqueIndex(protocol.name);
                    this.filterHash[assayId].push(idx);
                }
            });
        }
    }

    // A filter for the name of each Assay
    export class AssayFilterSection extends GenericFilterSection {
        configure():void {
            super.configure('Assay', 'a');
        }

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var assay = this._assayIdToAssay(assayId) || {},
                    idx: number;
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (assay.name) {
                    idx = this.assignUniqueIndex(assay.name);
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

        metaDataID:string;
        pre:string;
        post:string;

        constructor(metaDataID:string) {
            super();
            var MDT = EDDData.MetaDataTypes[metaDataID];
            this.metaDataID = metaDataID;
            this.pre = MDT.pre || '';
            this.post = MDT.post || '';
        }

        configure():void {
            super.configure(EDDData.MetaDataTypes[this.metaDataID].name, 'md'+this.metaDataID);
        }
    }

    export class LineMetaDataFilterSection extends MetaDataFilterSection {

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line: any = this._assayIdToLine(assayId) || {}, value = '(Empty)';
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (line.meta && line.meta[this.metaDataID]) {
                    value = [ this.pre, line.meta[this.metaDataID], this.post ].join(' ').trim();
                }
                this.filterHash[assayId].push(this.assignUniqueIndex(value));
            });
        }
    }

    export class AssayMetaDataFilterSection extends MetaDataFilterSection {

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var assay: any = this._assayIdToAssay(assayId) || {}, value = '(Empty)';
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (assay.meta && assay.meta[this.metaDataID]) {
                    value = [ this.pre, assay.meta[this.metaDataID], this.post ].join(' ').trim();
                }
                this.filterHash[assayId].push(this.assignUniqueIndex(value));
            });
        }
    }

    // These remaining filters work on Measurement IDs rather than Assay IDs.

    // A filter for the compartment of each Metabolite.
    export class MetaboliteCompartmentFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        configure():void {
            super.configure('Compartment', 'com');
        }

        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, value: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                value = EDDData.MeasurementTypeCompartments[measure.compartment] || {};
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

        configure(title:string, shortLabel:string): void {
            this.loadPending = true;
            super.configure(title, shortLabel);
        }

        // Overriding to make use of loadPending.
        isFilterUseful(): boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        }
    }

    // A filter for the names of General Measurements.
    export class GeneralMeasurementFilterSection extends MeasurementFilterSection {
        // Whenever this filter is instantiated, we
        loadPending: boolean;

        configure(): void {
            this.loadPending = true;
            super.configure('Measurement', 'mm');
        }

        isFilterUseful(): boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        }

        updateUniqueIndexesHash(mIds: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            mIds.forEach((measureId: string): void => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {};
                var mType: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    mType = EDDData.MeasurementTypes[measure.type] || {};
                    if (mType && mType.name) {
                        this.filterHash[measureId].push(this.assignUniqueIndex(mType.name));
                    }
                }
            });
            this.loadPending = false;
        }
    }

    // A filter for the names of Metabolite Measurements.
    export class MetaboliteFilterSection extends MeasurementFilterSection {

        configure():void {
            super.configure('Metabolite', 'me');
        }

        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, metabolite: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    metabolite = EDDData.MetaboliteTypes[measure.type] || {};
                    if (metabolite && metabolite.name) {
                        this.filterHash[measureId].push(this.assignUniqueIndex(metabolite.name));
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        }
    }

    // A filter for the names of Protein Measurements.
    export class ProteinFilterSection extends MeasurementFilterSection {

        configure():void {
            super.configure('Protein', 'pr');
        }

        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, protein: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    protein = EDDData.ProteinTypes[measure.type] || {};
                    if (protein && protein.name) {
                        this.filterHash[measureId].push(this.assignUniqueIndex(protein.name));
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        }
    }

    // A filter for the names of Gene Measurements.
    export class GeneFilterSection extends MeasurementFilterSection {

        configure():void {
            super.configure('Gene', 'gn');
        }

        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = {};
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, gene: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    gene = EDDData.GeneTypes[measure.type] || {};
                    if (gene && gene.name) {
                        this.filterHash[measureId].push(this.assignUniqueIndex(gene.name));
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        }
    }


    function _displayLineGraph(): void {
        $('.exportButton, #tableControlsArea, .tableActionButtons').addClass('off');
        $('#filterControlsArea').removeClass('off');
        $('#displayModeButtons .active').removeClass('active');
        $('#lineGraphButton').addClass('active');
        queueActionPanelRefresh();
        viewingMode = 'linegraph';
        barGraphTypeButtonsJQ.addClass('off');
        $('#lineGraph').removeClass('off');
        $('#barGraphByTime, #barGraphByLine, #barGraphByMeasurement').addClass('off');
        $('#studyAssaysTable').addClass('off');
        $('#mainFilterSection').appendTo('#content');
        queueRefreshDataDisplayIfStale();
    }


    function _displayBarGraph(mode: 'time'|'line'|'measurement'): void {
        $('.exportButton, #tableControlsArea, .tableActionButtons').addClass('off');
        $('#filterControlsArea').removeClass('off');
        $('#displayModeButtons .active').removeClass('active');
        $('#barGraphButton').add('#' + mode + 'BarGraphButton').addClass('active');
        queueActionPanelRefresh();
        viewingMode = 'bargraph';
        barGraphTypeButtonsJQ.removeClass('off');
        $('#lineGraph, #studyAssaysTable').addClass('off');
        $('#barGraphByTime').toggleClass('off', 'time' !== mode);
        $('#barGraphByLine').toggleClass('off', 'line' !== mode);
        $('#barGraphByMeasurement').toggleClass('off', 'measurement' !== mode);
        $('#mainFilterSection').appendTo('#content');
        queueRefreshDataDisplayIfStale();
    }


    function _displayTable(): void {
        $(".exportButton, #tableControlsArea, .tableActionButtons").removeClass('off');
        $("#filterControlsArea").addClass('off');
        $('#displayModeButtons .active').removeClass('active');
        $('#dataTableButton').addClass('active');
        queueActionPanelRefresh();
        viewingMode = 'table';
        barGraphTypeButtonsJQ.addClass('off');
        $('#studyAssaysTable').removeClass('off');
        $('#lineGraph, #barGraphByTime, #barGraphByLine, #barGraphByMeasurement').addClass('off');
        makeLabelsBlack(eddGraphing.labels);
        queueRefreshDataDisplayIfStale();
        //TODO: enable users to export filtered data from graph
    }


    // Called when the page loads.
    export function prepareIt() {
        eddGraphing = new EDDGraphingTools();
        progressiveFilteringWidget = new ProgressiveFilteringWidget();
        postFilteringAssays = [];
        postFilteringMeasurements = [];

        // By default, we always show the graph
        viewingMode = 'linegraph';
        barGraphMode = 'measurement';
        barGraphTypeButtonsJQ = $('#barGraphTypeButtons');
        actionPanelIsInBottomBar = false;
        // Start out with every display mode needing a refresh
        viewingModeIsStale = {
            'linegraph': true,
            'bargraph': true,
            'table': true
        };
        refresDataDisplayIfStaleTimer = null;

        colorObj = null;

        assaysDataGridSpec = null;
        assaysDataGrid = null;

        actionPanelRefreshTimer = null;

        //set up editable study name
        new StudyBase.EditableStudyName($('#editable-study-name').get()[0]);
        // This only adds code that turns the other buttons off when a button is made active,
        // and does the same to elements named in the 'for' attributes of each button.
        // We still need to add our own responders to actually do stuff.
        Utl.ButtonBar.prepareButtonBars();
        copyActionButtons();
        // Prepend show/hide filter button for better alignment
        // Note: this will be removed when we implement left side filtering

        //when all ajax requests are finished, determine if there are AssayMeasurements.
        $(document).ajaxStop(function() {
            // show assay table by default if there are assays but no assay measurements
            if (_.keys(EDDData.Assays).length > 0
                    && _.keys(EDDData.AssayMeasurements).length === 0) {
                //TODO: create prepare it for no data?
                _displayTable();
                $('.exportButton').prop('disabled', true);
            } else {
                $('.exportButton').prop('disabled', false);
            }
        });

        $("#dataTableButton").click(function() {
            _displayTable();
            updateGraphViewFlag({
                'buttonElem': "#dataTableButton",
                'type': 'table',
                'study_id': EDDData.currentStudyID
            });
        });

        $('.editAssayButton').click((ev) => {
            ev.preventDefault();
            StudyDataPage.editAssay($('[assayId]:checked').val());
        });

        //click handler for edit assay measurements
        $('.editMeasurementButton').click(function(ev) {
            ev.preventDefault();
            $('input[name="assay_action"][value="edit"]').prop('checked', true);
            $('button[value="assay_action"]').click();
            return false;
        });

        //click handler for delete assay measurements
        $('.deleteButton').click(function(ev) {
            ev.preventDefault();
            $('input[name="assay_action"][value="delete"]').prop('checked', true);
            $('button[value="assay_action"]').click();
            return false;
        });

        //click handler for export assay measurements
        $('.exportButton').click(function(ev) {
            ev.preventDefault();
            includeAllLinesIfEmpty();
            $('input[value="export"]').prop('checked', true);
            $('button[value="assay_action"]').click();
            return false;
        });

        //click handler for disable assay measurements
        $('.disableButton').click(function(ev) {
            ev.preventDefault();
            $('input[value="mark"]').prop('checked', true);
            $('select[name="disable"]').val('true');
            $('button[value="assay_action"]').click();
            return false;
        });

        //click handler for re-enable assay measurements
        $('.enableButton').click(function(ev) {
            ev.preventDefault();
            $('input[value="mark"]').prop('checked', true);
            $('select[name="disable"]').val('false');
            $('button[value="assay_action"]').click();
            return false;
        });

        // This one is active by default
        $("#lineGraphButton").click(function() {
            _displayLineGraph();
            updateGraphViewFlag({
                'buttonElem': "#lineGraphButton",
                'type': viewingMode,
                'study_id': EDDData.currentStudyID
            });
        });

        //one time click event handler for loading spinner
        $('#barGraphButton').one("click", function () {
            $('#graphLoading').removeClass('off');
        });
        $('#timeBarGraphButton').one("click", function () {
            $('#graphLoading').removeClass('off');
        });
        $('#lineBarGraphButton').one("click", function () {
            $('#graphLoading').removeClass('off');
        });
        $('#measurementBarGraphButton').one("click", function () {
            $('#graphLoading').removeClass('off');
        });
        $("#barGraphButton").click(function() {
            _displayBarGraph(barGraphMode);
            updateGraphViewFlag({
                'buttonElem': '#measurementBarGraphButton',
                'type': barGraphMode,
                'study_id': EDDData.currentStudyID
            });
        });
        $("#timeBarGraphButton").click(function() {
            _displayBarGraph(barGraphMode = 'time');
            updateGraphViewFlag({
                'buttonElem': "#timeBarGraphButton",
                'type': barGraphMode,
                'study_id': EDDData.currentStudyID
            });
        });
        $("#lineBarGraphButton").click(function() {
            _displayBarGraph(barGraphMode = 'line');
            updateGraphViewFlag({
                'buttonElem':'#lineBarGraphButton',
                'type': barGraphMode,
                'study_id': EDDData.currentStudyID
            });
        });
        $("#measurementBarGraphButton").click(function() {
            _displayBarGraph(barGraphMode = 'measurement');
            updateGraphViewFlag({
                'buttonElem': '#measurementBarGraphButton',
                'type': barGraphMode,
                'study_id': EDDData.currentStudyID
            });
        });

        //hides/shows filter section.
        var hideButtons: JQuery = $('.hideFilterSection');
        hideButtons.click(function(event) {
            var self: JQuery = $(this), old: string, replace: string;
            event.preventDefault();
            old = self.text();
            replace = self.attr('data-off-text');
            // doing this for all
            hideButtons.attr('data-off-text', old).text(replace);
            $('#mainFilterSection').toggle();
            return false;
        });

        // The next few lines wire up event handlers for a pulldownMenu that we use to contain a
        // couple of controls related to the filtering section.  This menu is styled to look
        // exactly like the typical 'view options' menu generated by DataGrid.

        var menuLabel = $('#filterControlsMenuLabel');
        menuLabel.click(() => {
            if (menuLabel.hasClass('pulldownMenuLabelOff')) {
                menuLabel.removeClass('pulldownMenuLabelOff').addClass('pulldownMenuLabelOn');
                $('#filterControlsMenu > div.pulldownMenuMenuBlock').removeClass('off');
            }
        });

        // event handlers to hide menu if clicking outside menu block or pressing ESC
        $(document).click((ev) => {
            var t = $(ev.target);
            if (t.closest($('#filterControlsMenu').get(0)).length === 0) {
                menuLabel.removeClass('pulldownMenuLabelOn').addClass('pulldownMenuLabelOff');
                $('#filterControlsMenu > div.pulldownMenuMenuBlock').addClass('off');
            }
        }).keydown((ev) => {
            if (ev.keyCode === 27) {
                menuLabel.removeClass('pulldownMenuLabelOn').addClass('pulldownMenuLabelOff');
                $('#filterControlsMenu > div.pulldownMenuMenuBlock').addClass('off');
            }
        });

        fetchEDDData(onSuccess);

        fetchSettings('measurement-' + EDDData.currentStudyID, (data) => {
            if (typeof(data) !== 'object' || typeof(data.type) === 'undefined') {
                // do nothing if the parameter is not an object
                return;
            } else if (data.type === 'linegraph') {
                _displayLineGraph();
            } else if (data.type === 'table') {
                _displayTable();
            } else {
                _displayBarGraph(data.type);
            }
        }, []);

        // Set up the Add Measurement to Assay modal
        $("#addMeasurement").dialog({
            minWidth: 500,
            autoOpen: false
        });

        $(".addMeasurementButton").click(function() {
            // copy inputs to the modal form
            let inputs = $('#studyAssaysTable').find('input[name=assayId]:checked').clone();
            $('#addMeasurement')
                .find('.hidden-assay-inputs')
                    .empty()
                    .append(inputs)
                .end()
                .removeClass('off')
                .dialog('open');
            return false;
        });

        // Callbacks to respond to the filtering section
        $('#mainFilterSection').on(
            'mouseover mousedown mouseup',
            queueRefreshDataDisplayIfStale.bind(this)
        ).on('keydown', filterTableKeyDown.bind(this));
    }

    function basePayload():any {
        var token:string = Utl.EDD.findCSRFToken();
        return { 'csrfmiddlewaretoken': token };
    }

    function updateGraphViewFlag(type) {
        $.ajax('/profile/settings/measurement-' + type.study_id, {
            'data': $.extend({}, basePayload(), { 'data': JSON.stringify(type) }),
            'type': 'POST'
        });
    }

    function copyActionButtons() {
        // create a copy of the buttons in the flex layout bottom bar
        // the original must stay inside form
        var original: JQuery, copy: JQuery;
        original = $('#assaysActionPanel');
        copy = original.clone().appendTo('#bottomBar').attr('id', 'copyActionPanel').hide();
        // forward click events on copy to the original button
        copy.on('click', '.actionButton', (e) => {
            original.find('#' + e.target.id).trigger(e);
        });
    }

    export function fetchEDDData(success) {
        $.ajax({
            'url': 'edddata/',
            'type': 'GET',
            'error': (xhr, status, e) => {
                $('#content').prepend("<div class='noData'>Error. Please reload</div>");
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': success
        });
    }

    export function fetchSettings(
            propKey: string,
            callback: (value: any) => void, defaultValue?: any): void {
        $.ajax('/profile/settings/' + propKey, {
            'dataType': 'json',
            'success': (data:any):void => {
                data = data || defaultValue;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) { /* ParseError, just use string value */ }
                }
                callback.call({}, data);
            }
        });
    }

    function onSuccess(data) {
        EDDData = $.extend(EDDData || {}, data);
        colorObj = eddGraphing.renderColor(EDDData.Lines);

        progressiveFilteringWidget.prepareFilteringSection();

        $('#filteringShowDisabledCheckbox, #filteringShowEmptyCheckbox').change(() => {
            queueRefreshDataDisplayIfStale();
        });
        fetchMeasurements(EDDData);
    }

    function fetchMeasurements(EDDData) {
        //pulling in protocol measurements AssayMeasurements
        $.each(EDDData.Protocols, (id, protocol) => {
            $.ajax({
                url: 'measurements/' + id + '/',
                type: 'GET',
                dataType: 'json',
                error: (xhr, status) => {
                    console.log('Failed to fetch measurement data on ' + protocol.name + '!');
                    console.log(status);
                },
                success: processMeasurementData.bind(this, protocol)
            });
        });
    }

    function includeAllLinesIfEmpty() {
        if ($('#studyAssaysTable').find('tbody input[type=checkbox]:checked').length === 0) {
            //append study id to form
            var study = _.keys(EDDData.Studies)[0];
            $('<input>').attr({
                type: 'hidden',
                value: study,
                name: 'studyId',
            }).appendTo('form');
        }
    }

    function allActiveAssays() {
        var assays = _.keys(EDDData.Assays);

        var filteredIDs = [];
        for (var r = 0; r < assays.length; r++) {
            var id = assays[r];
            // Here is the condition that determines whether the rows associated with this ID are
            // shown or hidden.
            if (EDDData.Assays[id].active) {
                filteredIDs.push(parseInt(id));
            }

        }
        return filteredIDs;
    }


    function filterTableKeyDown(e) {
        switch (e.keyCode) {
            case 38: // up
            case 40: // down
            case 9:  // tab
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
        var protocol = EDDData.Protocols[assay.pid];
        $.ajax({
            url: ['measurements', assay.pid, assay.id, ''].join('/'),
            type: 'GET',
            dataType: 'json',
            error: (xhr, status) => {
                console.log('Failed to fetch measurement data on ' + assay.name + '!');
                console.log(status);
            },
            success: processMeasurementData.bind(this, protocol)
        });
    }

    function processMeasurementData(protocol, data) {
        var assaySeen = {},
            protocolToAssay = {},
            count_total:number = 0,
            count_rec:number = 0;
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);

        // attach measurement counts to each assay
        $.each(data.total_measures, (assayId:string, count:number):void => {
            var assay = EDDData.Assays[assayId];
            if (assay) {
                // TODO: If we ever fetch by something other than protocol,
                // Isn't there a chance this is cumulative, and we should += ?
                assay.count = count;
                count_total += count;
            }
        });
        // loop over all downloaded measurements
        $.each(data.measures || {}, (index, measurement) => {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            ++count_rec;
            if (!assay || assay.count === undefined) return;
            line = EDDData.Lines[assay.lid];
            if (!line || !line.active) return;
            // attach values
            $.extend(measurement, { 'values': data.data[measurement.id] || [] });
            // store the measurements
            EDDData.AssayMeasurements[measurement.id] = measurement;
            // track which assays received updated measurements
            assaySeen[assay.id] = true;
            protocolToAssay[assay.pid] = protocolToAssay[assay.pid] || {};
            protocolToAssay[assay.pid][assay.id] = true;
            // handle measurement data based on type
            mtype = data.types[measurement.type] || {};
            (assay.measures = assay.measures || []).push(measurement.id);
            if (mtype.family === 'm') { // measurement is of metabolite
                (assay.metabolites = assay.metabolites || []).push(measurement.id);
            } else if (mtype.family === 'p') { // measurement is of protein
                (assay.proteins = assay.proteins || []).push(measurement.id);
            } else if (mtype.family === 'g') { // measurement is of gene / transcript
                (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
            } else {
                // throw everything else in a general area
                (assay.general = assay.general || []).push(measurement.id);
            }
        });

        progressiveFilteringWidget.processIncomingMeasurementRecords(
            data.measures || {},
            data.types
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
        refresDataDisplayIfStaleTimer = setTimeout(refreshDataDisplayIfStale.bind(this), 100);
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
    function refreshDataDisplayIfStale(force?:boolean) {

        // Any switch between viewing modes, or change in filtering, is also cause to check the UI
        // in the action panel and make sure it's current.
        queueActionPanelRefresh();
        $('#graphLoading').addClass('off');

        // If the filtering widget claims a change since the last inquiry,
        // then all the viewing modes are stale, no matter what.
        // So we mark them all.
        if (progressiveFilteringWidget.checkRedrawRequired(force)) {
            viewingModeIsStale['linegraph'] = true;
            viewingModeIsStale['bargraph-time'] = true;
            viewingModeIsStale['bargraph-line'] = true;
            viewingModeIsStale['bargraph-measurement'] = true;
            viewingModeIsStale['table'] = true;
            // Pull out a fresh set of filtered measurements and assays
            var filterResults = progressiveFilteringWidget.buildFilteredMeasurements();
            postFilteringMeasurements = filterResults['filteredMeasurements'];
            postFilteringAssays = filterResults['filteredAssays']
        // If the filtering widget has not changed and the current mode does not claim to be
        // stale, we are done.
        } else if (viewingMode == 'bargraph') {
            // Special case to handle the extra sub-modes of the bar graph
            if (!viewingModeIsStale[viewingMode+'-'+barGraphMode]) {
                return;
            }
        } else if (!viewingModeIsStale[viewingMode]) {
            return;
        }

        if (viewingMode == 'table') {
            if (assaysDataGridSpec === null) {
                assaysDataGridSpec = new DataGridSpecAssays();
                assaysDataGridSpec.init();
                assaysDataGrid = new DataGridAssays(assaysDataGridSpec);
            } else {
                assaysDataGrid.triggerDataReset();
            }
            viewingModeIsStale['table'] = false;
            makeLabelsBlack(eddGraphing.labels);
        } else {
            remakeMainGraphArea();
            if (viewingMode == 'bargraph') {
                viewingModeIsStale[viewingMode+'-'+barGraphMode] = false;
            } else {
                viewingModeIsStale['linegraph'] = false;
            }
        }
    }


    function actionPanelRefresh() {
        var checkedBoxes: HTMLInputElement[], checkedAssays: number, checkedMeasure: number,
            nothingSelected: boolean, contentScrolling: boolean, filterInBottom: boolean;
        // Figure out how many assays/checkboxes are selected.

        // Don't show the selected item count if we're not looking at the table.
        // (Only the visible item count makes sense in that case.)
        if (viewingMode == 'table') {
            $('.displayedDiv').addClass('off');
            if (assaysDataGrid) {
                checkedBoxes = assaysDataGrid.getSelectedCheckboxElements();
            } else {
                checkedBoxes = [];
            }
            checkedAssays = $(checkedBoxes).filter('[name=assayId]').length;
            checkedMeasure = $(checkedBoxes).filter('[name=measurementId]').length;
            nothingSelected = !checkedAssays && !checkedMeasure;
            //enable action buttons if something is selected
            $('.tableActionButtons').find('button').prop('disabled', nothingSelected);
            $('.selectedDiv').toggleClass('off', nothingSelected);
            var selectedStrs = [];
            if (!nothingSelected) {
                if (checkedAssays) {
                    selectedStrs.push(
                        (checkedAssays > 1) ? (checkedAssays + " Assays") : "1 Assay"
                    );
                }
                if (checkedMeasure) {
                    selectedStrs.push(
                        (checkedMeasure > 1) ? (checkedMeasure + " Measurements") : "1 Measurement"
                    );
                }
                var selectedStr = selectedStrs.join(', ');
                $('.selectedDiv').text(selectedStr + ' selected');
            }
        } else {
            $('.selectedDiv').addClass('off');
            $('.displayedDiv').removeClass('off');
        }
        //if there are assays but no data, show empty assays
        //note: this is to combat the current default setting for showing graph on page load
        if (_.keys(EDDData.Assays).length > 0 && _.keys(EDDData.AssayMeasurements).length === 0 ) {
            if (!$('#TableShowEAssaysCB').prop('checked')) {
                $('#TableShowEAssaysCB').click();
            }
        }

        // move buttons so they are always visible if the page is scrolling
        contentScrolling = isContentScrolling();
        if (actionPanelIsInBottomBar && !contentScrolling) {
            $('#assaysActionPanel').show();
            $('#copyActionPanel').hide();
            actionPanelIsInBottomBar = false;
        } else if (!actionPanelIsInBottomBar && contentScrolling) {
            $('#assaysActionPanel').hide();
            $('#copyActionPanel').show();
            actionPanelIsInBottomBar = true;
        }

        // only move the filter section when the page is scrolling in table view
        if (viewingMode == 'table') {
            contentScrolling = isContentScrolling();
            filterInBottom = $('#mainFilterSection').parent().is('#bottomBar');
            if (filterInBottom && !contentScrolling) {
                $('#mainFilterSection').appendTo('#content');
            } else if (!filterInBottom && contentScrolling) {
                $('#mainFilterSection').appendTo('#bottomBar');
            }
        }
    }


    function isContentScrolling(): boolean {
        var viewHeight: number = 0, itemsHeight: number = 0;
        viewHeight = $('#content').height();
        $('#content').children().each((i, e) => { itemsHeight += e.scrollHeight; });
        return viewHeight < itemsHeight;
    }


    function remakeMainGraphArea() {

        var dataPointsDisplayed = 0,
            dataPointsTotal = 0,
            dataSets = [];

        $('#tooManyPoints').hide();
        $('#lineGraph').addClass('off');
        $('#barGraphByTime').addClass('off');
        $('#barGraphByLine').addClass('off');
        $('#barGraphByMeasurement').addClass('off');

        // show message that there's no data to display
        if (postFilteringMeasurements.length === 0) {
            $('#graphLoading').addClass('off');    // Remove load spinner if still present
            $('#noData').removeClass('off');
            return;
        }

        $.each(postFilteringMeasurements, (i, measurementId) => {

            var measure:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementId],
                points = (measure.values ? measure.values.length : 0),
                assay, line, name, singleAssayObj, color, protocol, lineName, dataObj, checkbox;
            dataPointsTotal += points;

            if (dataPointsDisplayed > 15000) {
                return; // Skip the rest if we've hit our limit
            }

            dataPointsDisplayed += points;
            assay = EDDData.Assays[measure.assay] || {};
            line = EDDData.Lines[assay.lid] || {};
            protocol = EDDData.Protocols[assay.pid] || {};
            name = assay.name;
            lineName = line.name;
            checkbox = $(document.getElementById(line.identifier));

            var label = checkbox.next('label');

            if (_.keys(EDDData.Lines).length > 22) {
                color = changeLineColor(line, assay.lid)
            } else {
                color = colorObj[assay.lid];
            }

            if (remakeMainGraphAreaCalls < 1) {
                eddGraphing.labels.push(label);
                color = colorObj[assay.lid];
                // update label color to line color
                $(label).css('color', color);
            } else if (checkbox.prop('checked')) {
                // unchecked labels black
                makeLabelsBlack(eddGraphing.labels);
                // update label color to line color
                if (color === null || color === undefined) {
                    color = colorObj[assay.lid]
                }
                $(label).css('color', color);
            } else {
                var count = noCheckedBoxes(eddGraphing.labels);
                if (count === 0) {
                    eddGraphing.nextColor = null;
                    addColor(eddGraphing.labels, assay.lid)
                } else {
                    //update label color to black
                    $(label).css('color', 'black');
                }
            }

            if (color === null || color === undefined) {
                color = colorObj[assay.lid]
            }
            dataObj = {
                'measure': measure,
                'data': EDDData,
                'name': name,
                'color': color,
                'lineName': lineName
            };
            singleAssayObj = eddGraphing.transformSingleLineItem(dataObj);
            dataSets.push(singleAssayObj);
        });

        $('.displayedDiv').text(dataPointsDisplayed + " measurements displayed");

        $('#noData').addClass('off');

        remakeMainGraphAreaCalls++;
        uncheckEventHandler(eddGraphing.labels);

        var barAssayObj  = eddGraphing.concatAssays(dataSets);

        //data for graphs
        var graphSet = {
            barAssayObj: eddGraphing.concatAssays(dataSets),
            create_x_axis: eddGraphing.createXAxis,
            create_right_y_axis: eddGraphing.createRightYAxis,
            create_y_axis: eddGraphing.createLeftYAxis,
            x_axis: eddGraphing.make_x_axis,
            y_axis: eddGraphing.make_right_y_axis,
            individualData: dataSets,
            assayMeasurements: barAssayObj,
            width: 750,
            height: 220
        };

        if (viewingMode == 'linegraph') {
            $('#lineGraph').empty().removeClass('off');
            var s = eddGraphing.createSvg($('#lineGraph').get(0));
            eddGraphing.createMultiLineGraph(graphSet, s);
        } else if (barGraphMode == 'time') {
            $('#barGraphByTime').empty().removeClass('off');
            var s = eddGraphing.createSvg($('#barGraphByTime').get(0));
            createGroupedBarGraph(graphSet, s);
        } else if (barGraphMode == 'line') {
            $('#barGraphByLine').empty().removeClass('off');
            var s = eddGraphing.createSvg($('#barGraphByLine').get(0));
            createGroupedBarGraph(graphSet, s);
        } else if (barGraphMode == 'measurement') {
            $('#barGraphByMeasurement').empty().removeClass('off');
            var s = eddGraphing.createSvg($('#barGraphByMeasurement').get(0));
            createGroupedBarGraph(graphSet, s);
        }
    }


    /**
     * this function makes unchecked labels black
     * @param selectors
     */
    function makeLabelsBlack(selectors:JQuery[]) {
        _.each(selectors, function(selector:JQuery) {
            if (selector.prev().prop('checked') === false) {
            $(selector).css('color', 'black');
            }
        })
    }


    /**
     * this function creates an event handler for unchecking a checked checkbox
     * @param labels
     */
    function uncheckEventHandler(labels) {
        _.each(labels, function(label){
            var id = $(label).prev().attr('id');
            $('#' + id).change(function() {
                var ischecked= $(this).is(':checked');
                if (!ischecked) {
                    $(label).css('color', 'black');
                }
            });
        });
    }


    /**
     * this function returns how many checkboxes are checked.
     * @param labels
     * @returns count of checked boxes.
     */
    function noCheckedBoxes(labels) {
        var count = 0;
        _.each(labels, function(label) {
            var checkbox = $(label).prev();
            if ($(checkbox).prop('checked')) {
                count++;
            }
        });
        return count;
    }


    /**
     * This function adds colors after user has clicked a line and then unclicked all the lines.
     * @param labels
     * @param assay
     * @returns labels
     */
    function addColor(labels:JQuery[], assay) {
        _.each(labels, function(label:JQuery) {
            var color = colorObj[assay];
            if (EDDData.Lines[assay].name === label.text()) {
                $(label).css('color', color);
            }
        });
        return labels;
    }


    /** this function takes in an element selector and an array of svg rects and returns
     * returns message or nothing.
     */
    function svgWidth(selector, rectArray) {
        $('.tooMuchData').hide();
        $('.noData').hide();
        var sum = 0;
        _.each(rectArray, function(rectElem:any) {
            if (rectElem.getAttribute("width") != 0) {
                sum++
            }
        });
        if (sum === 0) {
            $('#graphLoading').addClass('off');
            $(selector).prepend("<p class=' tooMuchData'>Too many data points to display" +
                "</p><p  class=' tooMuchData'>Recommend filtering by protocol</p>");
        }
    }


    /** this function takes in the EDDData.MeasurementTypes object and returns the measurement type
     *  that has the most data points - options are based on family p, m, -, etc.
     */
    function measurementType(types) {    // TODO: RENAME
        var proteomics = {};
        for (var type in types) {
            if (proteomics.hasOwnProperty(types[type].family)) {
                proteomics[types[type].family]++;
            } else {
                proteomics[types[type].family] = 0
            }
        }
        for (var key in proteomics) {
            var max:any = 0;
            var maxType:any;
            if (proteomics[key] > max) {
                max = proteomics[key];
                maxType = key;
            }
        }
        return maxType;
    }

    /**
     * this function takes in input min y value, max y value, and the sorted json object.
     *  outputs a grouped bar graph with values grouped by assay name
     **/
    export function createGroupedBarGraph(graphSet, svg) {

        var assayMeasurements = graphSet.assayMeasurements,
            typeID = {
                'measurement': "#barGraphByMeasurement",
                'x': "#barGraphByTime",
                'name': '#barGraphByLine'
            },
            modeToField = {
                'line': 'name',
                'time': 'x',
                'measurement': 'measurement'
            },
            numUnits = eddGraphing.howManyUnits(assayMeasurements),
            yRange = [],
            unitMeasurementData = [],
            yMin = [],
            data, nested, typeNames, xValues, yvalueIds, x_name, xValueLabels,
            sortedXvalues, div, x_xValue, lineID, meas, y, wordLength;

        var type = modeToField[barGraphMode];

        if (type === 'x') {
             var entries = (<any>d3).nest(type)
                .key(function (d:any) {
                    return d[type];
                })
                .entries(assayMeasurements);

            var timeMeasurements = _.clone(assayMeasurements);
            var nestedByTime = eddGraphing.findAllTime(entries);
            var howManyToInsertObj = eddGraphing.findMaxTimeDifference(nestedByTime);
            var max = Math.max.apply(null, _.values(howManyToInsertObj));
            if (max > 400) {
                $(typeID[type]).prepend(
                    "<p class='noData'>Too many missing data fields. Please filter</p>"
                );
                $('.tooMuchData').remove();
            } else {
                $('.noData').remove();
            }
            eddGraphing.insertFakeValues(entries, howManyToInsertObj, timeMeasurements);
        }
        //x axis scale for type
        x_name = d3.scaleBand().rangeRound([0, graphSet.width]).padding(0.1);

        //x axis scale for x values
        x_xValue = d3.scaleBand();

        //x axis scale for line id to differentiate multiple lines associated with the
        // same name/type
        lineID = d3.scaleBand();

        // y axis range scale
        y = d3.scaleLinear()
            .range([graphSet.height, 0]);

        div = d3.select("body").append("div")
            .attr("class", "tooltip2")
            .style("opacity", 0);

        var d3_entries = type === 'x' ? timeMeasurements : assayMeasurements;
            meas = d3.nest()
            .key(function (d:any) {
                return d.y_unit;
            })
            .entries(d3_entries);

        // if there is no data - show no data error message
        if (assayMeasurements.length === 0) {
            $(typeID[type]).prepend("<p class='noData'>No data selected - please " +
            "filter</p>");

            $('.tooMuchData').remove();
        } else {
            $('.noData').remove();
        }

        for (var i = 0; i < numUnits; i++) {
            yRange.push(d3.scaleLinear().rangeRound([graphSet.height, 0]));
            unitMeasurementData.push(d3.nest()
                .key(function (d:any) {
                    return d.y;
                })
                .entries(meas[i].values));
            yMin.push(d3.min(unitMeasurementData[i], function (d:any) {
                return d3.min(d.values, function (d:any) {
                    return d.y;
                });
            }))
        }

        if (type === 'x') {
            // nest data by type (ie measurement) and by x value
            nested = d3.nest()
                .key((d: any): string => d[type])
                .key((d: any): string => d.x)
                .entries(timeMeasurements);
        } else {
            // nest data by type (ie measurement) and by x value
            nested = d3.nest()
                .key((d: any): string => d[type])
                .key((d: any): string => d.x)
                .entries(assayMeasurements);
        }


        //insert y value to distinguish between lines
        data = eddGraphing.getXYValues(nested);

        if (data.length === 0) {
            return svg
        }

        //get type names for x labels
        typeNames = data.map((d:any) => d.key);

        //sort x values
        typeNames.sort((a, b) => a - b);

        xValues = data.map((d:any) => d.values);

        yvalueIds = data[0].values[0].values.map((d:any) => d.key);

        // returns time values
        xValueLabels = xValues[0].map((d:any) => d.key);

        //sort time values
        sortedXvalues = xValueLabels.sort((a, b) => parseFloat(a) - parseFloat(b));

        x_name.domain(typeNames);

        x_xValue.domain(sortedXvalues).range([0, x_name.bandwidth()]);

        lineID.domain(yvalueIds).range([0, x_xValue.bandwidth()]);

        // create x axis
        graphSet.create_x_axis(graphSet, x_name, svg, type);

        // loop through different units
        for (var index = 0; index < numUnits; index++) {

            if (yMin[index] > 0 ) {
                yMin[index] = 0;
            }
            //y axis min and max domain
            y.domain([yMin[index], d3.max(unitMeasurementData[index], function (d:any) {
                return d3.max(d.values, function (d:any) {
                    return d.y;
                });
            })]);

            //nest data associated with one unit by type and time value
            data = (<any>d3).nest(type)
                .key(function (d:any) {
                    return d[type];
                })
                .key(function (d:any) {
                    return parseFloat(d.x);
                })
                .entries(meas[index].values);


            // //hide values if there are different time points
            if (type != 'x') {
                var nestedByTime = eddGraphing.findAllTime(data);
                var howManyToInsertObj = eddGraphing.findMaxTimeDifference(nestedByTime);
                var max = Math.max.apply(null, _.values(howManyToInsertObj));
                var graphSvg = $(typeID[type])[0];

                if (max > 1) {
                    $('.tooMuchData').remove();
                    var arects = d3.selectAll(typeID[type] +  ' rect')[0];
                    svgWidth(graphSvg, arects);
                     //get word length
                    wordLength = eddGraphing.getSum(typeNames);
                    d3.selectAll(typeID[type] + ' .x.axis text').remove();
                    return svg;
                } else {
                    $('.noData').remove();
                }
            }

            //right axis
            if (index == 0) {
                graphSet.create_y_axis(graphSet, meas[index].key, y, svg);
            } else {
                var spacing = {
                    1: graphSet.width,
                    2: graphSet.width + 50,
                    3: graphSet.width + 100,
                    4: graphSet.width + 150
                };
                //create right axis
                graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index])
            }

            var names_g = svg.selectAll(".group" + index)
                .data(data)
                .enter().append("g")
                .attr("transform", function (d:any) {
                    return "translate(" + x_name(d.key) + ",0)";
                });

            var categories_g = names_g.selectAll(".category" + index)
                .data(function (d:any) {
                    return d.values;
                })
                .enter().append("g")
                .attr("transform", function (d:any) {
                    return "translate(" + x_xValue(d.key) + ",0)";
                });

            var categories_labels = categories_g.selectAll('.category-label' + index)
                .data(function (d:any) {
                    return [d.key];
                })
                .enter()
                .append("text")
                .attr("x", function () {
                    return x_xValue.bandwidth() / 2;
                })
                .attr('y', function () {
                    return graphSet.height + 27;
                })
                .attr('text-anchor', 'middle');

             var values_g = categories_g.selectAll(".value" + index)
                .data(function (d:any) {
                    return d.values;
                })
                .enter().append("g")
                .attr("class", function (d:any) {
                    d.lineName = d.lineName.split(' ').join('');
                    d.lineName = d.lineName.split('/').join('');
                    return 'value value-' + d.lineName;
                 })
                .attr("transform", function (d:any) {
                    return "translate(" + lineID(d.key) + ",0)";
                })
                .on('mouseover', function(d) {
                    d3.selectAll('.value').style('opacity', 0.3);
                    d3.selectAll('.value-' + d.lineName).style('opacity', 1)
                })
                .on('mouseout', function(d) {
                    d3.selectAll('.value').style('opacity', 1);
                });

            var rects = values_g.selectAll('.rect' + index)
                .data(function (d:any) {
                    return [d];
                })
                .enter().append("rect")
                .attr("class", "rect")
                .attr("width", lineID.bandwidth())
                .attr("y", function (d:any) {
                    return y(d.y);
                })
                .attr("height", function (d:any) {
                    return graphSet.height - y(d.y);
                })
                .style("fill", function (d:any) {
                    return d.color
                })
                .style("opacity", 1);

            categories_g.selectAll('.rect')
                .data(function (d:any) {
                    return d.values;
                })
                .on("mouseover", function (d:any) {
                    div.transition()
                        .style("opacity", 0.9);

                    div.html('<strong>' + d.name + '</strong>' + ": "
                            + "<br/>" + d.measurement
                            + '<br/>' + d.y + " " + d.y_unit
                            + "<br/>" + " @ " + d.x + " hours")
                        .style("left", ((<any>d3.event).pageX) + "px")
                        .style("top", ((<any>d3.event).pageY - 30) + "px");
                })
                .on("mouseout", function () {
                    div.transition()
                        .style("opacity", 0);
                });
            //get word length
            wordLength = eddGraphing.getSum(typeNames);

            if (wordLength > 90 && type != 'x') {
               d3.selectAll(typeID[type] + ' .x.axis text').remove()
            }
            if (wordLength > 150 && type === 'x') {
               d3.selectAll(typeID[type] + ' .x.axis text').remove()
            }
        }
        $('#graphLoading').addClass('off');
    }


    /**
     * this function takes in the type of measurement, selectors obj, selector type and
     * button obj and shows the measurement graph is the main type is proteomic
     */
    function showProteomicGraph(type, selectors, selector, buttons) {
        if (type ==='p') {
            d3.select(selectors['line']).style('display', 'none');
            d3.select(selectors['bar-measurement']).style('display', 'block');
            $('label.btn').removeClass('active');
            var rects = d3.selectAll('.groupedMeasurement rect')[0];
            svgWidth(selectors[selector], rects);
            var button =  $('.groupByMeasurementBar')[0];
            $(buttons['bar-time']).removeClass('hidden');
            $(buttons['bar-line']).removeClass('hidden');
            $(buttons['bar-measurement']).removeClass('hidden');
            $(button).addClass('active');
            $(buttons['bar-empty']).addClass('active');
        }
    }


    /**
     * @param line
     * @param assay
     * @returns color for line.
     * this function returns the color in the color queue for studies >22 lines. Instantiated
     * when user clicks on a line.
     */
    function changeLineColor(line, assay) {

        var color;
        var filterCheckbox = $(document.getElementById(line.identifier));

        if (filterCheckbox.prop('checked') && remakeMainGraphAreaCalls === 1) {
            color = line['color'];
            line['doNotChange'] = true;
            eddGraphing.colorQueue(color);
        }
        if (filterCheckbox.prop('checked') && remakeMainGraphAreaCalls >= 1) {
            if (line['doNotChange']) {
               color = line['color'];
            } else {
                color = eddGraphing.nextColor;
                line['doNotChange'] = true;
                line['color'] = color;
                // update text label next to checkbox
                filterCheckbox.next('label').css('color', color);
                eddGraphing.colorQueue(color);
            }
        } else if (filterCheckbox.prop('checked') === false && remakeMainGraphAreaCalls > 1 ){
            color = colorObj[assay];
            //update label color to line color
            filterCheckbox.next('label').css('color', color);
        }

        if (remakeMainGraphAreaCalls == 0) {
            color = colorObj[assay];
        }
        return color;
    }


    function clearAssayForm():JQuery {
        var form:JQuery = $('#assayMain');
        form.find('[name^=assay-]').not(':checkbox, :radio').val('');
        form.find('[name^=assay-]').filter(':checkbox, :radio').prop('selected', false);
        form.find('.cancel-link').remove();
        form.find('.errorlist').remove();
        return form;
    }


    function fillAssayForm(form, record) {
        var user = EDDData.Users[record.experimenter];
        form.find('[name=assay-assay_id]').val(record.id);
        form.find('[name=assay-name]').val(record.name);
        form.find('[name=assay-description]').val(record.description);
        form.find('[name=assay-protocol]').val(record.pid);
        form.find('[name=assay-experimenter_0]').val(user && user.uid ? user.uid : '--');
        form.find('[name=assay-experimenter_1]').val(record.experimenter);
    }


    export function editAssay(index:number):void {
        var record = EDDData.Assays[index], form;
        if (!record) {
            console.log('Invalid Assay record for editing: ' + index);
            return;
        }
        form = $('#assayMain');
        clearAssayForm();
        fillAssayForm(form, record);
        form.removeClass('off').dialog( "open" );
    }
};



class DataGridAssays extends DataGrid {

    constructor(dataGridSpec:DataGridSpecBase) {
        super(dataGridSpec);
    }

    _getClasses():string {
        return 'dataTable sortable dragboxes hastablecontrols table-striped';
    }

    getCustomControlsArea():HTMLElement {
        return $('#tableControlsArea').get(0);
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

    metaDataIDsUsedInAssays:any;
    maximumXValueInData:number;
    minimumXValueInData:number;

    measuringTimesHeaderSpec:DataGridHeaderSpec;

    graphObject:any;

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
    getRecordIDs():any[] {
        var lr = StudyDataPage.progressiveFilteringWidget.lastFilteringResults;
        if (lr) {
            return lr['filteredAssays'];
        }
        return [];
    }

    // This is an override.  Called when a data reset is triggered, but before the table rows are
    // rebuilt.
    onDataReset(dataGrid:DataGrid):void {

        this.findMaximumXValueInData();
        if (this.measuringTimesHeaderSpec && this.measuringTimesHeaderSpec.element) {
            $(this.measuringTimesHeaderSpec.element).children(':first').text(
                'Measuring Times (Range ' + this.minimumXValueInData + ' to '
                    + this.maximumXValueInData + ')');
        }
    }

    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    getTableElement() {
        return document.getElementById('studyAssaysTable');
    }

    // Specification for the table as a whole
    defineTableSpec():DataGridTableSpec {
        return new DataGridTableSpec('assays', {
            'defaultSort': 0
        });
    }

    findMetaDataIDsUsedInAssays() {
        var seenHash:any = {};
        this.metaDataIDsUsedInAssays = [];
        this.getRecordIDs().forEach((assayId) => {
            var assay = EDDData.Assays[assayId];
            $.each(assay.meta || {}, (metaId) => { seenHash[metaId] = true; });
        });
        [].push.apply(this.metaDataIDsUsedInAssays, Object.keys(seenHash));
    }

    findMaximumXValueInData():void {
        var minmax: number[];
        // reduce to find highest/lowest value across all records
        minmax = this.getRecordIDs().reduce((prev:number[], assayId) => {
            var assay: AssayRecordExended = <AssayRecordExended>EDDData.Assays[assayId],
                measures, recordMinmax;
            // Some caching to speed subsequent runs way up...
            if (assay.maxXValue !== undefined && assay.minXValue !== undefined) {
                recordMinmax = [assay.maxXValue, assay.minXValue];
            } else {
                measures = assay.measures || [];
                // reduce to find highest/lowest value across all measures
                recordMinmax = measures.reduce((prev:number, measureId) => {
                    var lookup:any = EDDData.AssayMeasurements || {},
                        measure:any = lookup[measureId] || {},
                        measureMinmax: number[];
                    // reduce to find highest/lowest value across all data in measurement
                    measureMinmax = (measure.values || []).reduce((prev: number[], point) => {
                        return [
                            Math.max(prev[0], point[0][0]),
                            Math.min(prev[0], point[0][0])
                        ];
                    }, [0, Number.MAX_VALUE]);
                    return [
                        Math.max(prev[0], measureMinmax[0]),
                        Math.min(prev[1], measureMinmax[1])
                    ];
                }, [0, Number.MAX_VALUE]);
                assay.maxXValue = recordMinmax[0];
                assay.minXValue = recordMinmax[1];
            }
            return [
                Math.max(prev[0], recordMinmax[0]),
                Math.min(prev[1], recordMinmax[1])
            ];
        }, [0, Number.MAX_VALUE]);
        // Anything above 0 is acceptable, but 0 will default instead to 1.
        this.maximumXValueInData = minmax[0] || 1;
        this.minimumXValueInData = minmax[1] === Number.MAX_VALUE ? 0 : minmax[1];
    }

    private loadAssayName(index:any):string {
        // In an old typical EDDData.Assays record this string is currently pre-assembled
        // and stored in 'fn'. But we're phasing that out. Eventually the name will just be
        // .name, without decoration.
        var assay, line, protocolNaming;
        if ((assay = EDDData.Assays[index])) {
            return assay.name.toUpperCase();
        }
        return '';
    }

    private loadLineName(index: any): string {
        var assay, line;
        if ((assay = EDDData.Assays[index])) {
            if ((line = EDDData.Lines[assay.lid])) {
                return line.name.toUpperCase();
            }
        }
        return '';
    }

    private loadExperimenterInitials(index:any):string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var assay, experimenter;
        if ((assay = EDDData.Assays[index])) {
            if ((experimenter = EDDData.Users[assay.exp])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    }

    private loadAssayModification(index:any):number {
        return EDDData.Assays[index].mod;
    }

    // Specification for the headers along the top of the table
    defineHeaderSpec():DataGridHeaderSpec[] {
        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders:DataGridHeaderSpec[] = this.metaDataIDsUsedInAssays.map(
            (id, index) => {
                var mdType = EDDData.MetaDataTypes[id];
                return new DataGridHeaderSpec(2 + index, 'hAssaysMetaid' + id, {
                    'name': mdType.name,
                    'headerRow': 2,
                    'size': 's',
                    'sortBy': this.makeMetaDataSortFunction(id),
                    'sortAfter': 1
                });
            }
        );

        // The left section of the table has Assay Name and Line (Name)
        var leftSide:DataGridHeaderSpec[] = [
            new DataGridHeaderSpec(1, 'hAssaysName', {
                'name': 'Assay Name',
                'headerRow': 2,
                'sortBy': this.loadAssayName
            }),
            new DataGridHeaderSpec(2, 'hAssayLineName', {
                'name': 'Line',
                'headerRow': 2,
                'sortBy': this.loadLineName
            })
        ];

        // Offsets for the right side of the table depends on size of the preceding sections
        var rightOffset = leftSide.length + metaDataHeaders.length;
        var rightSide = [
            new DataGridHeaderSpec(++rightOffset, 'hAssaysMName', {
                'name': 'Measurement',
                'headerRow': 2
            }),
            new DataGridHeaderSpec(++rightOffset, 'hAssaysUnits', {
                'name': 'Units',
                'headerRow': 2
            }),
            new DataGridHeaderSpec(++rightOffset, 'hAssaysCount', {
                'name': 'Count',
                'headerRow': 2
            }),
            // The measurement times are referenced elsewhere, so are saved to the object
            this.measuringTimesHeaderSpec = new DataGridHeaderSpec(
                ++rightOffset,
                'hAssaysCount',
                {
                    'name': 'Measuring Times',
                    'headerRow': 2
                }
            ),
            new DataGridHeaderSpec(++rightOffset, 'hAssaysExperimenter', {
                'name': 'Experimenter',
                'headerRow': 2,
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 1
            }),
            new DataGridHeaderSpec(++rightOffset, 'hAssaysModified', {
                'name': 'Last Modified',
                'headerRow': 2,
                'sortBy': this.loadAssayModification,
                'sortAfter': 1
            })
        ];

        return leftSide.concat(metaDataHeaders, rightSide);
    }

    private makeMetaDataSortFunction(id) {
        return (i) => {
            var record = EDDData.Assays[i];
            if (record && record.meta) {
                return record.meta[id] || '';
            }
            return '';
        }
    }

    // The colspan value for all the cells that are assay-level (not measurement-level) is based
    // on the number of measurements for the respective record. Specifically, it's the number of
    // metabolite and general measurements, plus 1 if there are transcriptomics measurements,
    // plus 1 if there are proteomics measurements, all added together.
    // (Or 1, whichever is higher.)
    private rowSpanForRecord(index):number {
        var rec = EDDData.Assays[index];
        var v:number = ((rec.general         || []).length +
                        (rec.metabolites     || []).length +
                        ((rec.transcriptions || []).length ? 1 : 0) +
                        ((rec.proteins       || []).length ? 1 : 0)   ) || 1;
        return v;
    }

    generateAssayNameCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        var record = EDDData.Assays[index], line = EDDData.Lines[record.lid];
        $(document).on('click', '.assay-edit-link', function(e) {
            let index:number = parseInt($(this).attr('dataIndex'), 10);
            StudyDataPage.editAssay(index);
        });

        // Set up jQuery modals
        $("#assayMain").dialog({ minWidth: 500, autoOpen: false });

        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'assayId',
                'checkboxWithID': (id) => { return 'assay' + id + 'include'; },
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': record.name
            })
        ];
    }

    generateLineNameCells(gridSpec: DataGridSpecAssays, index: string): DataGridDataCell[] {
        var record = EDDData.Assays[index], line = EDDData.Lines[record.lid];
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name
            })
        ];
    }

    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] => {
            var contentStr = '', assay = EDDData.Assays[index], type = EDDData.MetaDataTypes[id];
            if (assay && type && assay.meta && (contentStr = assay.meta[id] || '')) {
                contentStr = [
                    type.prefix || '',
                    contentStr,
                    type.postfix || ''
                ].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr
                })
            ];
        }
    }

    private generateMeasurementCells(gridSpec:DataGridSpecAssays, index:string,
            opt:any):DataGridDataCell[] {
        var record = EDDData.Assays[index], cells = [],
            factory = ():DataGridDataCell => new DataGridDataCell(gridSpec, index);

        if ((record.metabolites || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index,
                        { 'rowspan': record.metabolites.length }));
            } else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.metabolites.map(opt.metaboliteToValue)
                        .sort(opt.metaboliteValueSort)
                        .map(opt.metaboliteValueToCell);
            }
        }
        if ((record.general || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index,
                    { 'rowspan': record.general.length }));
            } else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.general.map(opt.metaboliteToValue)
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

    generateMeasurementNameCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': (measureId) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {},
                    mtype:any = EDDData.MeasurementTypes[measure.type] || {};
                return { 'name': mtype.name || '', 'id': measureId };
            },
            'metaboliteValueSort': (a:any, b:any) => {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return (<any>(y > z) - <any>(z > y));
            },
            'metaboliteValueToCell': (value) => {
                return new DataGridDataCell(gridSpec, value.id, {
                    'hoverEffect': true,
                    'checkboxName': 'measurementId',
                    'checkboxWithID': () => { return 'measurement' + value.id + 'include'; },
                    'contentString': value.name
                });
            },
            'transcriptToCell': (ids:any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                  'contentString': 'Transcriptomics Data'
                });
            },
            'proteinToCell': (ids:any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                  'contentString': 'Proteomics Data'
                });
            },
            "empty": () => new DataGridDataCell(gridSpec, index, {
                'contentString': '<i>No Measurements</i>'
            })
        });
    }

    generateUnitsCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': (measureId) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {},
                    mtype:any = EDDData.MeasurementTypes[measure.type] || {},
                    unit:any = EDDData.UnitTypes[measure.y_units] || {};
                return { 'name': mtype.name || '', 'id': measureId, 'unit': unit.name || '' };
            },
            'metaboliteValueSort': (a:any, b:any) => {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return (<any>(y > z) - <any>(z > y));
            },
            'metaboliteValueToCell': (value) => {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': value.unit
                });
            },
            'transcriptToCell': (ids:any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                  'contentString': 'RPKM'
                });
            },
            'proteinToCell': (ids:any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                  'contentString': '' // TODO: what are proteomics measurement units?
                });
            }
        });
    }

    generateCountCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        // function to use in Array#reduce to count all the values in a set of measurements
        var reduceCount = (prev:number, measureId) => {
            var measure:any = EDDData.AssayMeasurements[measureId] || {};
            return prev + (measure.values || []).length;
        };
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': (measureId) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {},
                    mtype:any = EDDData.MeasurementTypes[measure.type] || {};
                return { 'name': mtype.name || '', 'id': measureId, 'measure': measure };
            },
            'metaboliteValueSort': (a:any, b:any) => {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return (<any>(y > z) - <any>(z > y));
            },
            'metaboliteValueToCell': (value) => {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': [ '(', (value.measure.values || []).length, ')'].join('')
                });
            },
            'transcriptToCell': (ids:any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': [ '(', ids.reduce(reduceCount, 0), ')'].join('')
                });
            },
            'proteinToCell': (ids:any[]) => {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': [ '(', ids.reduce(reduceCount, 0), ')'].join('')
                });
            }
        });
    }

    generateMeasuringTimesCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        var svgCellForTimeCounts = (ids:any[]) => {
                var consolidated, svg = '', timeCount = {};
                // count values at each x for all measurements
                ids.forEach((measureId) => {
                    var measure:any = EDDData.AssayMeasurements[measureId] || {},
                        points:number[][][] = measure.values || [];
                    points.forEach((point:number[][]) => {
                        timeCount[point[0][0]] = timeCount[point[0][0]] || 0;
                        // Typescript compiler does not like using increment operator on expression
                        ++timeCount[point[0][0]];
                    });
                });
                // map the counts to [x, y] tuples
                consolidated = $.map(timeCount, (value, key) => [[ [parseFloat(key)], [value] ]]);
                // generate SVG string
                if (consolidated.length) {
                    svg = gridSpec.assembleSVGStringForDataPoints(consolidated, '');
                }
                return new DataGridDataCell(gridSpec, index, {
                  'contentString': svg
                });
            };
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': (measureId) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {},
                    mtype:any = EDDData.MeasurementTypes[measure.type] || {};
                return { 'name': mtype.name || '', 'id': measureId, 'measure': measure };
            },
            'metaboliteValueSort': (a:any, b:any) => {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return (<any>(y > z) - <any>(z > y));
            },
            'metaboliteValueToCell': (value) => {
                var measure = value.measure || {},
                    format = measure.format === 1 ? 'carbon' : '',
                    points = value.measure.values || [],
                    svg = gridSpec.assembleSVGStringForDataPoints(points, format);
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': svg
                });
            },
            'transcriptToCell': svgCellForTimeCounts,
            'proteinToCell': svgCellForTimeCounts
        });
    }

    generateExperimenterCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        var exp = EDDData.Assays[index].exp;
        var uRecord = EDDData.Users[exp];
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': uRecord ? uRecord.initials : '?'
            })
        ];
    }

    generateModificationDateCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Assays[index].mod)
            })
        ];
    }

    assembleSVGStringForDataPoints(points, format:string):string {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" version="1.2"\
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
        var paths = [ svg ];
        points.sort((a,b) => { return a[0] - b[0]; }).forEach((point) => {
            var x = point[0][0],
                y = point[1][0],
                range = this.maximumXValueInData - this.minimumXValueInData,
                rx = (((x - this.minimumXValueInData) / range) * 450) + 10,
                tt = [y, ' at ', x, 'h'].join('');
            paths.push(['<path class="cE" d="M', rx, ',5v4"></path>'].join(''));
            if (y === undefined || y === null) {
                paths.push(['<path class="cE" d="M', rx, ',2v6"></path>'].join(''));
                return;
            }
            paths.push(['<path class="cP" d="M', rx, ',1v4"></path>'].join(''));
            if (format === 'carbon') {
                paths.push(
                    ['<path class="cV" d="M', rx, ',1v8"><title>', tt, '</title></path>'].join('')
                );
            } else {
                paths.push(
                    ['<path class="cP" d="M', rx, ',1v8"><title>', tt, '</title></path>'].join('')
                );
            }
        });
        paths.push('</svg>');
        return paths.join('\n');
    }

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec():DataGridColumnSpec[] {
        var leftSide:DataGridColumnSpec[],
            metaDataCols:DataGridColumnSpec[],
            rightSide:DataGridColumnSpec[],
            counter:number = 0;

        leftSide = [
            new DataGridColumnSpec(++counter, this.generateAssayNameCells),
            new DataGridColumnSpec(++counter, this.generateLineNameCells)
        ];

        metaDataCols = this.metaDataIDsUsedInAssays.map((id) => {
            return new DataGridColumnSpec(++counter, this.makeMetaDataCellsGeneratorFunction(id));
        });

        rightSide = [
            new DataGridColumnSpec(++counter, this.generateMeasurementNameCells),
            new DataGridColumnSpec(++counter, this.generateUnitsCells),
            new DataGridColumnSpec(++counter, this.generateCountCells),
            new DataGridColumnSpec(++counter, this.generateMeasuringTimesCells),
            new DataGridColumnSpec(++counter, this.generateExperimenterCells),
            new DataGridColumnSpec(++counter, this.generateModificationDateCells)
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }

    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec():DataGridColumnGroupSpec[] {
        var topSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Line', { 'showInVisibilityList': false })
        ];

        var metaDataColGroups:DataGridColumnGroupSpec[];
        metaDataColGroups = this.metaDataIDsUsedInAssays.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });

        var bottomSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Measurement', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Units', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Count', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Measuring Times', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
        ];

        return topSection.concat(metaDataColGroups, bottomSection);
    }

    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid:DataGrid):DataGridHeaderWidget[] {
        var widgetSet:DataGridHeaderWidget[] = [];

        // A "select all / select none" button
        var selectAllWidget = new DGSelectAllAssaysMeasurementsWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);

        return widgetSet;
    }

    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    createCustomOptionsWidgets(dataGrid:DataGrid):DataGridOptionWidget[] {
        var widgetSet:DataGridOptionWidget[] = [];
        var disabledAssaysWidget = new DGDisabledAssaysWidget(dataGrid, this);
        var emptyAssaysWidget = new DGEmptyAssaysWidget(dataGrid, this);
        widgetSet.push(disabledAssaysWidget);
        widgetSet.push(emptyAssaysWidget);
        return widgetSet;
    }


    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid:DataGridAssays):void {

        // Wire up the 'action panels' for the Assays sections
        var table = this.getTableElement();
        $(table).on('change', ':checkbox', () => StudyDataPage.queueActionPanelRefresh());

        // Run it once in case the page was generated with checked Assays
        StudyDataPage.queueActionPanelRefresh();
    }
}


// A slightly modified "Select All" header widget
// that triggers a refresh of the actions panel when it changes the checkbox state.
class DGSelectAllAssaysMeasurementsWidget extends DGSelectAllWidget {

    clickHandler():void {
        super.clickHandler();
        StudyDataPage.queueActionPanelRefresh();
     }
}


// When unchecked, this hides the set of Assays that are marked as disabled.
class DGDisabledAssaysWidget extends DataGridOptionWidget {

    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID):string {
        return 'TableShowDAssaysCB';
    }

    // Return text used to label the widget
    getLabelText():string {
        return 'Show Disabled';
    }

    getLabelTitle():string {
        return "Show assays that have been disabled.";
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault():boolean {
        return !!($('#filteringShowDisabledCheckbox').prop('checked'));
    }

    // Handle activation of widget
    onWidgetChange(e):void {
        var amIChecked:boolean = !!(this.checkBoxElement.checked);
        var isOtherChecked:boolean = $('#filteringShowDisabledCheckbox').prop('checked');
        $('#filteringShowDisabledCheckbox').prop('checked', amIChecked);
        if (amIChecked != isOtherChecked) {
            StudyDataPage.queueRefreshDataDisplayIfStale();
        }
        // We don't call the superclass version of this function because we don't
        // want to trigger a call to arrangeTableDataRows just yet.
        // The queueRefreshDataDisplayIfStale function will do it for us, after
        // rebuilding the filtering section.
    }

    applyFilterToIDs(rowIDs:string[]):string[] {

        var checked:boolean = !!(this.checkBoxElement.checked);
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs && EDDData.currentStudyWritable) {
            $("#enableButton").removeClass('off');
        } else {
            $("#enableButton").addClass('off');
        }
        var disabledRows = $('.disabledRecord');

        var checkedDisabledRows = 0;
        _.each(disabledRows, function(row) {
            if ($(row).find('input').prop('checked')) {
                checkedDisabledRows++;
            }
        });

        if (checkedDisabledRows > 0) {
            $('#enableButton').prop('disabled', false);
        } else {
            $('#enableButton').prop('disabled', true);
        }


        // If the box is checked, return the set of IDs unfiltered
        if (checked) { return rowIDs; }
        return rowIDs.filter((id:string): boolean => {
            return !!(EDDData.Assays[id].active);
        });
    }

    initialFormatRowElementsForID(dataRowObjects:any, rowID:string):any {
        var assay = EDDData.Assays[rowID];
        if (!assay.active) {
            $.each(dataRowObjects, (x, row) => { $(row.getElement()).addClass('disabledRecord') });
        }
    }
}


// When unchecked, this hides the set of Assays that have no measurement data.
class DGEmptyAssaysWidget extends DataGridOptionWidget {

    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID):string {
        return 'TableShowEAssaysCB';
    }

    // Return text used to label the widget
    getLabelText():string {
        return 'Show Empty';
    }

    getLabelTitle():string {
        return "Show assays that don't have any measurements in them.";
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault():boolean {
        return !!($('#filteringShowEmptyCheckbox').prop('checked'));
    }

    // Handle activation of widget
    onWidgetChange(e):void {
        var amIChecked:boolean = !!(this.checkBoxElement.checked);
        var isOtherChecked:boolean = !!($('#filteringShowEmptyCheckbox').prop('checked'));
        $('#filteringShowEmptyCheckbox').prop('checked', amIChecked);
        if (amIChecked != isOtherChecked) {
            StudyDataPage.queueRefreshDataDisplayIfStale();
        }
        // We don't call the superclass version of this function because we don't
        // want to trigger a call to arrangeTableDataRows just yet.
        // The queueRefreshDataDisplayIfStale function will do it for us, after
        // rebuilding the filtering section.
    }

    applyFilterToIDs(rowIDs:string[]):string[] {

        var checked:boolean = !!(this.checkBoxElement.checked);
        // If the box is checked, return the set of IDs unfiltered
        if (checked) { return rowIDs; }
        return rowIDs.filter((id:string): boolean => {
            return !!(EDDData.Assays[id].count);
        });
    }

    initialFormatRowElementsForID(dataRowObjects:any, rowID:string):any {
        var assay = EDDData.Assays[rowID];
        if (!assay.count) {
            $.each(dataRowObjects, (x, row) => { $(row.getElement()).addClass('emptyRecord') });
        }
    }
}


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyDataPage.prepareIt());
