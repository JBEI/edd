/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="CarbonSummation.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="StudyGraphing.ts" />

declare var EDDData:EDDData;

module StudyD {
    'use strict';

    var mainGraphObject:any;
    var progressiveFilteringWidget: ProgressiveFilteringWidget;

    var mainGraphRefreshTimerID:any;

    var linesActionPanelRefreshTimer:any;
    var assaysActionPanelRefreshTimer:any;

    var attachmentIDs:any;
    var attachmentsByID:any;
    var prevDescriptionEditElement:any;

    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to 
    // calculate biomass for the specified metabolic map.
    export var metabolicMapID:any;
    export var metabolicMapName:any;
    export var biomassCalculation:number;
    var carbonBalanceData:any;
    var carbonBalanceDisplayIsFresh:boolean;

    var cSourceEntries:any;
    var mTypeEntries:any;

    // The table spec object and table object for the Lines table.
    var linesDataGridSpec;
    var linesDataGrid;
    // Table spec and table objects, one each per Protocol, for Assays.
    var assaysDataGridSpecs;
    var assaysDataGrids;


    // Utility interface used by GenericFilterSection#updateUniqueIndexesHash
    export interface ValueToUniqueID {
        [index: string]: number;
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


    // For the filtering section on the main graph
    export class ProgressiveFilteringWidget {

        allFilters: GenericFilterSection[];
        assayFilters: GenericFilterSection[];
        // MeasurementGroupCode: Need to keep a separate filter list for each type.
        metaboliteFilters: GenericFilterSection[];
        proteinFilters: GenericFilterSection[];
        geneFilters: GenericFilterSection[];
        measurementFilters: GenericFilterSection[];

        metaboliteDataProcessed: boolean;
        proteinDataProcessed: boolean;
        geneDataProcessed: boolean;
        genericDataProcessed: boolean;

        filterTableJQ: JQuery;
        studyDObject: any;
        mainGraphObject: any;


        // MeasurementGroupCode: Need to initialize each filter list.
        constructor(studyDObject: any) {

            this.studyDObject = studyDObject;

            this.allFilters = [];
            this.assayFilters = [];
            this.metaboliteFilters = [];
            this.proteinFilters = [];
            this.geneFilters = [];
            this.measurementFilters = [];

            this.metaboliteDataProcessed = false;
            this.proteinDataProcessed = false;
            this.geneDataProcessed = false;
            this.genericDataProcessed = false;

            this.filterTableJQ = null;
        }


        // Read through the Lines, Assays, and AssayMeasurements structures to learn what types are present,
        // then instantiate the relevant subclasses of GenericFilterSection, to create a series of
        // columns for the filtering section under the main graph on the page.
        // This must be outside the constructor because EDDData.Lines and EDDData.Assays are not immediately available
        // on page load.
        // MeasurementGroupCode: Need to create and add relevant filters for each group.
        prepareFilteringSection(): void {

            var seenInLinesHash: RecordIDToBoolean = {};
            var seenInAssaysHash: RecordIDToBoolean = {};
            var aIDsToUse: string[] = [];

            this.filterTableJQ = $('<div>').addClass('filterTable').appendTo($('#mainFilterSection'));

            // First do some basic sanity filtering on the list
            $.each(EDDData.Assays, (assayId: string, assay: any): void => {
                var line = EDDData.Lines[assay.lid];
                if (!assay.active || !line || !line.active) return;
                $.each(assay.meta || [], (metadataId) => { seenInAssaysHash[metadataId] = true; });
                $.each(line.meta || [], (metadataId) => { seenInLinesHash[metadataId] = true; });
                aIDsToUse.push(assayId);
            });

            // Create filters on assay tables
            // TODO media is now a metadata type, strain and carbon source should be too
            var assayFilters = [];
            assayFilters.push(new StrainFilterSection());
            assayFilters.push(new CarbonSourceFilterSection());
            assayFilters.push(new CarbonLabelingFilterSection());
            for (var id in seenInLinesHash) {
                assayFilters.push(new LineMetaDataFilterSection(id));
            }
            assayFilters.push(new LineNameFilterSection());
            assayFilters.push(new ProtocolFilterSection());
            assayFilters.push(new AssaySuffixFilterSection());
            for (var id in seenInAssaysHash) {
                assayFilters.push(new AssayMetaDataFilterSection(id));
            }

            // We can initialize all the Assay- and Line-level filters immediately
            this.assayFilters = assayFilters;
            assayFilters.forEach((filter) => {
                filter.populateFilterFromRecordIDs(aIDsToUse);
                filter.populateTable();
            });

            this.metaboliteFilters = [];
            this.metaboliteFilters.push(new MetaboliteCompartmentFilterSection());
            this.metaboliteFilters.push(new MetaboliteFilterSection());

            this.proteinFilters = [];
            this.proteinFilters.push(new ProteinFilterSection());

            this.geneFilters = [];
            this.geneFilters.push(new GeneFilterSection());

            this.measurementFilters = [];
            this.measurementFilters.push(new MeasurementFilterSection());

            this.allFilters = [].concat(
                assayFilters,
                this.metaboliteFilters,
                this.proteinFilters,
                this.geneFilters,
                this.measurementFilters);
            this.repopulateFilteringSection();
        }


        // Clear out any old filters in the filtering section, and add in the ones that
        // claim to be "useful".
        repopulateFilteringSection(): void {
            this.filterTableJQ.children().detach();
            var dark:boolean = false;
            $.each(this.allFilters, (i, widget) => {
                if (widget.isFilterUseful()) {
                    widget.addToParent(this.filterTableJQ[0]);
                    widget.applyBackgroundStyle(dark);
                    dark = !dark;
                }
            });
        }


        // Given a set of measurement records and a dictionary of corresponding types
        // (passed down from the server as a result of a data request), sort them into
        // their various categories, then pass each category to their relevant filter objects
        // (possibly adding to the values in the filter) and refresh the UI for each filter.
        // MeasurementGroupCode: Need to process each group separately here.
        processIncomingMeasurementRecords(measures, types): void {

            var process: (ids: string[], i: number, widget: GenericFilterSection) => void;

            var filterIds = { 'm': [], 'p': [], 'g': [], '_': [] };

            // loop over all downloaded measurements
            $.each(measures || {}, (index, measurement) => {
                var assay = EDDData.Assays[measurement.assay], line, mtype;
                if (!assay || !assay.active) return;
                line = EDDData.Lines[assay.lid];
                if (!line || !line.active) return;
                mtype = types[measurement.type] || {};
                if (mtype.family === 'm') { // measurement is of metabolite
                    filterIds.m.push(measurement.id);
                } else if (mtype.family === 'p') { // measurement is of protein
                    filterIds.p.push(measurement.id);
                } else if (mtype.family === 'g') { // measurement is of gene / transcript
                    filterIds.g.push(measurement.id);
                } else {
                    // throw everything else in a general area
                    filterIds._.push(measurement.id);
                }
            });

            process = (ids: string[], i: number, widget: GenericFilterSection): void => {
                widget.populateFilterFromRecordIDs(ids);
                widget.populateTable();
            };
            if (filterIds.m.length) {
                $.each(this.metaboliteFilters, process.bind({}, filterIds.m));
                this.metaboliteDataProcessed = true;
            }
            if (filterIds.p.length) {
                $.each(this.proteinFilters, process.bind({}, filterIds.p));
                this.proteinDataProcessed = true;
            }
            if (filterIds.g.length) {
                $.each(this.geneFilters, process.bind({}, filterIds.g));
                this.geneDataProcessed = true;
            }
            if (filterIds._.length) {
                $.each(this.measurementFilters, process.bind({}, filterIds._));
                this.genericDataProcessed = true;
            }
            this.repopulateFilteringSection();
        }


        // Build a list of all the non-disabled Assay IDs in the Study.
        buildAssayIDSet(): any[] {
            var assayIds: any[] = [];
            $.each(EDDData.Assays, (assayId, assay) => {
                var line = EDDData.Lines[assay.lid];
                if (!assay.active || !line || !line.active) return;
                assayIds.push(assayId);

            });
            return assayIds;
        }
     

        // Starting with a list of all the non-disabled Assay IDs in the Study, we loop it through the
        // Line and Assay-level filters, causing the filters to refresh their UI, narrowing the set down.
        // We resolve the resulting set of Assay IDs into measurement IDs, then pass them on to the
        // measurement-level filters.  In the end we return a set of measurement IDs representing the
        // end result of all the filters, suitable for passing to the graphing functions.
        // MeasurementGroupCode: Need to process each group separately here.
        buildFilteredMeasurements(): any[] {
            var filteredAssayIds = this.buildAssayIDSet();

            $.each(this.assayFilters, (i, filter) => {
                filteredAssayIds = filter.applyProgressiveFiltering(filteredAssayIds);
            });

            var measurementIds: any[] = [];
            $.each(filteredAssayIds, (i, assayId) => {
                var assay = EDDData.Assays[assayId];
                $.merge(measurementIds, assay.measures || []);
            });

            // We start out with four references to the array of available measurement IDs, one for each major category.
            // Each of these will become its own array in turn as we narrow it down.
            // This is to prevent a sub-selection in one category from overriding a sub-selection in the others.

            var metaboliteMeasurements = measurementIds;
            var proteinMeasurements = measurementIds;
            var geneMeasurements = measurementIds;
            var genericMeasurements = measurementIds;

            // Note that we only try to filter if we got measurements that apply to the widget types

            if (this.metaboliteDataProcessed) {
                $.each(this.metaboliteFilters, (i, filter) => {
                    metaboliteMeasurements = filter.applyProgressiveFiltering(metaboliteMeasurements);
                });
            }
            if (this.proteinDataProcessed) {
                $.each(this.proteinFilters, (i, filter) => {
                    proteinMeasurements = filter.applyProgressiveFiltering(proteinMeasurements);
                });
            }
            if (this.geneDataProcessed) {
                $.each(this.geneFilters, (i, filter) => {
                    geneMeasurements = filter.applyProgressiveFiltering(geneMeasurements);
                });
            }
            if (this.genericDataProcessed) {
                $.each(this.measurementFilters, (i, filter) => {
                    genericMeasurements = filter.applyProgressiveFiltering(genericMeasurements);
                });
            }

            // Once we've finished with the filtering, we want to see if any sub-selections have been made across
            // any of the categories, and if so, merge those sub-selections into one.

            // The idea is, we display everything until the user makes a selection in one or more of the main categories,
            // then drop everything from the categories that contain no selections.

            // An example scenario will explain why this is important:

            // Say a user is presented with two categories, Metabolite and Measurement.
            // Metabolite has criteria 'Acetate' and 'Ethanol' available.
            // Measurement has only one criteria available, 'Optical Density'.
            // By default, Acetate, Ethanol, and Optical Density are all unchecked, and all visible on the graph.
            // This is equivalent to 'return measurements' below.

            // If the user checks 'Acetate', they expect only Acetate to be displayed, even though no change has been made to
            // the Measurement section where Optical Density is listed.
            // In the code below, by testing for any checked boxes in the metaboliteFilters filters,
            // we realize that the selection has been narrowed doown, so we append the Acetate measurements onto dSM.
            // Then when we check the measurementFilters filters, we see that the Measurement section has
            // not narrowed down its set of measurements, so we skip appending those to dSM.
            // The end result is only the Acetate measurements.

            // Then suppose the user checks 'Optical Density', intending to compare Acetate directly against Optical Density.
            // Since measurementFilters now has checked boxes, we push its measurements onto dSM,
            // where it combines with the Acetate.

            var anyChecked = (filter: GenericFilterSection): boolean => { return filter.anyCheckboxesChecked; };

            var dSM: any[] = [];    // "Deliberately selected measurements"
            if ( this.metaboliteFilters.some(anyChecked)) { dSM = dSM.concat(metaboliteMeasurements); }
            if (    this.proteinFilters.some(anyChecked)) { dSM = dSM.concat(proteinMeasurements); }
            if (       this.geneFilters.some(anyChecked)) { dSM = dSM.concat(geneMeasurements); }
            if (this.measurementFilters.some(anyChecked)) { dSM = dSM.concat(genericMeasurements); }
            if (dSM.length) {
                return dSM;
            }

            return measurementIds;
        }


        checkRedrawRequired(force?: boolean): boolean {
            var redraw: boolean = false;
            // do not redraw if graph is not initialized yet
            if (this.mainGraphObject) {
                redraw = !!force;
                // Walk down the filter widget list.  If we encounter one whose collective checkbox
                // state has changed since we last made this walk, then a redraw is required. Note that
                // we should not skip this loop, even if we already know a redraw is required, since the
                // call to anyCheckboxesChangedSinceLastInquiry sets internal state in the filter
                // widgets that we will use next time around.
                $.each(this.allFilters, (i, filter) => {
                    if (filter.anyCheckboxesChangedSinceLastInquiry()) {
                        redraw = true;
                    }
                });
            }
            return redraw;
        }
    }


    // A generic version of a filtering column in the filtering section beneath the graph area on the page,
    // meant to be subclassed for specific criteria.
    // When initialized with a set of record IDs, the column is filled with labeled checkboxes, one for each
    // unique value of the given criteria encountered in the records.
    // During use, another set of record IDs is passed in, and if any checkboxes are checked, the ID set is
    // narrowed down to only those records that contain the checked values.
    // Checkboxes whose values are not represented anywhere in the given IDs are temporarily disabled,
    // visually indicating to a user that those values are not available for further filtering. 
    // The filters are meant to be called in sequence, feeding each returned ID set into the next,
    // progressively narrowing down the enabled checkboxes.
    // MeasurementGroupCode: Need to subclass this for each group type.
    export class GenericFilterSection {

        // A dictionary of the unique values found for filtering against, and the dictionary's complement.
        // Each unique ID is an integer, ascending from 1, in the order the value was first encountered
        // when examining the record data in updateUniqueIndexesHash.
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
        // Dictionary resolving the filter value integer identifiers to HTML Input checkboxes.
        checkboxes: {[index: number]: JQuery};
        // Dictionary used to compare checkboxes with a previous state to determine whether an
        // update is required. Values are 'C' for checked, 'U' for unchecked, and 'N' for not
        // existing at the time. ('N' can be useful when checkboxes are removed from a filter due to
        // the back-end data changing.)
        previousCheckboxState: UniqueIDToValue;
        // Dictionary resolving the filter value integer identifiers to HTML table row elements.
        tableRows: {[index: number]: HTMLTableRowElement};

        // References to HTML elements created by the filter
        filterColumnDiv: HTMLElement;
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

        constructor() {
            this.uniqueValues = {};
            this.uniqueIndexes = {};
            this.uniqueIndexCounter = 0;
            this.uniqueValuesOrder = [];
            this.filterHash = {};
            this.previousCheckboxState = {};

            this.typingTimeout = null;
            this.typingDelay = 330;    // TODO: Not implemented
            this.currentSearchSelection = '';
            this.previousSearchSelection = '';
            this.minCharsToTriggerSearch = 1;

            this.configure();
            this.anyCheckboxesChecked = false;
            this.createContainerObjects();
        }


        configure(): void {
            this.sectionTitle = 'Generic Filter';
            this.sectionShortLabel = 'gf';
        }


        // Create all the container HTML objects
        createContainerObjects(): void {
            var sBoxID: string = 'filter' + this.sectionShortLabel + 'SearchBox',
                sBox: HTMLInputElement;
            this.filterColumnDiv = $("<div>").addClass('filterColumn')[0];
            var textTitle = $("<span>").text(this.sectionTitle)[0];
            this.plaintextTitleDiv = $("<div>").addClass('filterHead').append(textTitle)[0];

            $(sBox = document.createElement("input"))
                .attr({
                    'id': sBoxID,
                    'name': sBoxID,
                    'placeholder': this.sectionTitle,
                    'size': 14
                });
            sBox.setAttribute('type', 'text'); // JQuery .attr() cannot set this
            this.searchBox = sBox;
            this.searchBoxTitleDiv = $("<div>").addClass('filterHeadSearch').append(sBox)[0];

            this.scrollZoneDiv = $("<div>").addClass('filterCriteriaScrollZone')[0];
            this.filteringTable = $("<table>")
                .addClass('filterCriteriaTable dragboxes')
                .attr({ 'cellpadding': 0, 'cellspacing': 0 })
                .append(this.tableBodyElement = <HTMLTableElement>$("<tbody>")[0]);
        }


        populateFilterFromRecordIDs(ids: string[]): void {
            var usedValues: ValueToUniqueID, crSet: number[], cHash: UniqueIDToValue,
                previousIds: string[];
            // can get IDs from multiple assays, first merge with this.filterHash
            previousIds = $.map(this.filterHash || {}, (_, previousId: string) => previousId);
            ids.forEach((addedId: string): void => { this.filterHash[addedId] = []; });
            ids = $.map(this.filterHash || {}, (_, previousId: string) => previousId);
            // skip over building unique values and sorting when no new IDs added
            if (ids.length > previousIds.length) {
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
        }


        // In this function are running through the given list of measurement IDs and examining
        // their records and related records, locating the particular field we are interested in,
        // and creating a list of all the unique values for that field.  As we go, we mark each
        // unique value with an integer UID, and construct a hash resolving each record to one (or
        // possibly more) of those integer UIDs.  This prepares us for quick filtering later on.
        // (This generic filter does nothing, so we leave these structures blank.)
        updateUniqueIndexesHash(ids: string[]): void {
            this.filterHash = this.filterHash || {};
            this.uniqueIndexes = this.uniqueIndexes || {};
        }


        // If we didn't come up with 2 or more criteria, there is no point in displaying the filter.
        isFilterUseful():boolean {
            if (this.uniqueValuesOrder.length < 2) {
                return false;
            }
            return true;
        }


        addToParent(parentDiv):void {
            parentDiv.appendChild(this.filterColumnDiv);
        }


        applyBackgroundStyle(darker:boolean):void {
            $(this.filterColumnDiv).removeClass(darker ? 'stripeRowB' : 'stripeRowA');
            $(this.filterColumnDiv).addClass(darker ? 'stripeRowA' : 'stripeRowB');
        }


        // Runs through the values in uniqueValuesOrder, adding a checkbox and label for each
        // filtering value represented.  If there are more than 15 values, the filter gets
        // a search box and scrollbar.
        populateTable():void {
            var fCol = $(this.filterColumnDiv).empty();
            // Only use the scrolling container div if the size of the list warrants it, because
            // the scrolling container div declares a large padding margin for the scroll bar,
            // and that padding margin would be an empty waste of space otherwise.
            if (this.uniqueValuesOrder.length > 15) {
                fCol.append(this.searchBoxTitleDiv).append(this.scrollZoneDiv);
                // Change the reference so we're affecting the innerHTML of the correct div later on
                fCol = $(this.scrollZoneDiv);
            } else {
                fCol.append(this.plaintextTitleDiv);
            }
            fCol.append(this.filteringTable);

            var tBody = this.tableBodyElement;
            // Clear out any old table contents
            $(this.tableBodyElement).empty();

            this.tableRows = {};
            this.checkboxes = {};
            this.uniqueValuesOrder.forEach((uniqueId: number): void => {
                var cboxName, cell, p, q, r;
                cboxName = ['filter', this.sectionShortLabel, 'n', uniqueId, 'cbox'].join('');
                this.tableRows[uniqueId] = <HTMLTableRowElement>this.tableBodyElement.insertRow();
                cell = this.tableRows[uniqueId].insertCell();
                this.checkboxes[uniqueId] = $("<input type='checkbox'>")
                    .attr({ 'name': cboxName, 'id': cboxName })
                    .appendTo(cell);
                $('<label>').attr('for', cboxName).text(this.uniqueValues[uniqueId])
                    .appendTo(cell);
            });
            // TODO: Drag select is twitchy - clicking a table cell background should check the box,
            // even if the user isn't hitting the label or the checkbox itself.
            Dragboxes.initTable(this.filteringTable);
        }


        // Returns true if any of the checkboxes show a different state than when this function was
        // last called
        anyCheckboxesChangedSinceLastInquiry():boolean {
            var changed:boolean = false,
                currentCheckboxState: UniqueIDToValue = {},
                v: string = $(this.searchBox).val();
            this.anyCheckboxesChecked = false;
            $.each(this.checkboxes || {}, (uniqueId: number, checkbox: JQuery) => {
                var current, previous;
                current = (checkbox.prop('checked') && !checkbox.prop('disabled')) ? 'C' : 'U';
                previous = this.previousCheckboxState[uniqueId] || 'N';
                if (current !== previous) changed = true;
                if (current === 'C') this.anyCheckboxesChecked = true;
                currentCheckboxState[uniqueId] = current;
            });

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
                $.each(this.previousCheckboxState, (rowId) => {
                    if (currentCheckboxState[rowId] === undefined) {
                        changed = true;
                        return false;
                    }
                });
            }
            this.previousCheckboxState = currentCheckboxState;
            return changed;
        }


        // Takes a set of record IDs, and if any checkboxes in the filter's UI are checked,
        // the ID set is narrowed down to only those records that contain the checked values.
        // Checkboxes whose values are not represented anywhere in the given IDs are temporarily disabled
        // and sorted to the bottom of the list, visually indicating to a user that those values are not
        // available for further filtering.
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
                    // We will not attempt to match against empty strings, so we filter those out if
                    // any slipped through.
                    queryStrs = v.split(/\s+/).filter((one) => { return one.length > 0; });
                    // The user might have pasted/typed only whitespace, so:
                    if (queryStrs.length > 0) {
                        useSearchBox = true;
                    }
                }
            }

            var valuesVisiblePreFiltering = {};

            var indexIsVisible = (index):boolean => {
                var match:boolean = true, text:string;
                if (useSearchBox) {
                    text = this.uniqueValues[index].toLowerCase();
                    match = queryStrs.some((v) => {
                        return text.length >= v.length && text.indexOf(v) >= 0;
                    });
                }
                if (match) {
                    valuesVisiblePreFiltering[index] = 1;
                    if ((this.previousCheckboxState[index] === 'C') || !this.anyCheckboxesChecked) {
                        return true;
                    }
                }
                return false;
            };

            idsPostFiltering = ids.filter((id) => {
                // If we have filtering data for this id, use it.
                // If we don't, the id probably belongs to some other measurement category,
                // so we ignore it.
                if (this.filterHash[id]) {
                    return this.filterHash[id].some(indexIsVisible);
                }
                return false;
            });

            // Create a document fragment, and accumulate inside it all the rows we want to display, in sorted order.
            var frag = document.createDocumentFragment();

            var rowsToAppend = [];
            this.uniqueValuesOrder.forEach((crID) => {
                var checkbox: JQuery = this.checkboxes[crID],
                    row: HTMLTableRowElement = this.tableRows[crID],
                    show: boolean = !!valuesVisiblePreFiltering[crID];
                checkbox.prop('disabled', !show)
                $(row).toggleClass('nodata', !show);
                if (show) {
                    frag.appendChild(row);
                } else {
                    rowsToAppend.push(row);
                }
            });
            // Now, append all the rows we disabled, so they go to the bottom of the table
            rowsToAppend.forEach((row) => frag.appendChild(row));

            // Remember that we last sorted by this column
            this.tableBodyElement.appendChild(frag);

            return idsPostFiltering;
        }


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

        getIdMapToValues():(id:string) => any[] {
            return () => [];
        }
    }


    export class StrainFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Strain';
            this.sectionShortLabel = 'st';
        }


        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId: string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered strain name
                (line.strain || []).forEach((strainId: string): void => {
                    var strain = EDDData.Strains[strainId];
                    if (strain && strain.name) {
                        this.uniqueIndexes[strain.name] = this.uniqueIndexes[strain.name] || ++this.uniqueIndexCounter;
                        this.filterHash[assayId].push(this.uniqueIndexes[strain.name]);
                    }
                });
            });
        }
    }


    export class CarbonSourceFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Carbon Source';
            this.sectionShortLabel = 'cs';
        }


        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source name
                (line.carbon || []).forEach((carbonId:string) => {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.name) {
                        this.uniqueIndexes[src.name] = this.uniqueIndexes[src.name] || ++this.uniqueIndexCounter;
                        this.filterHash[assayId].push(this.uniqueIndexes[src.name]);
                    }
                });
            });
        }
    }


    export class CarbonLabelingFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Labeling';
            this.sectionShortLabel = 'l';
        }


        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source labeling description
                (line.carbon || []).forEach((carbonId:string) => {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.labeling) {
                        this.uniqueIndexes[src.labeling] = this.uniqueIndexes[src.labeling] || ++this.uniqueIndexCounter;
                        this.filterHash[assayId].push(this.uniqueIndexes[src.labeling]);
                    }
                });
            });
        }
    }


    export class LineNameFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Line';
            this.sectionShortLabel = 'ln';
        }


        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (line.name) {
                    this.uniqueIndexes[line.name] = this.uniqueIndexes[line.name] || ++this.uniqueIndexCounter;
                    this.filterHash[assayId].push(this.uniqueIndexes[line.name]);
                }
            });
        }
    }


    export class ProtocolFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Protocol';
            this.sectionShortLabel = 'p';
        }


        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var protocol: ProtocolRecord = this._assayIdToProtocol(assayId);
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (protocol && protocol.name) {
                    this.uniqueIndexes[protocol.name] = this.uniqueIndexes[protocol.name] || ++this.uniqueIndexCounter;
                    this.filterHash[assayId].push(this.uniqueIndexes[protocol.name]);
                }
            });
        }
    }


    export class AssaySuffixFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Assay Suffix';
            this.sectionShortLabel = 'a';
        }


        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var assay = this._assayIdToAssay(assayId) || {};
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (assay.name) {
                    this.uniqueIndexes[assay.name] = this.uniqueIndexes[assay.name] || ++this.uniqueIndexCounter;
                    this.filterHash[assayId].push(this.uniqueIndexes[assay.name]);
                }
            });
        }
    }


    export class MetaDataFilterSection extends GenericFilterSection {

        metaDataID:string;
        pre:string;
        post:string;

        constructor(metaDataID:string) {
            var MDT = EDDData.MetaDataTypes[metaDataID];
            this.metaDataID = metaDataID;
            this.pre = MDT.pre || '';
            this.post = MDT.post || '';
            super();
        }


        configure():void {
            this.sectionTitle = EDDData.MetaDataTypes[this.metaDataID].name;
            this.sectionShortLabel = 'md'+this.metaDataID;
        }
    }


    export class LineMetaDataFilterSection extends MetaDataFilterSection {

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var line: any = this._assayIdToLine(assayId) || {}, value = '(Empty)';
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (line.meta && line.meta[this.metaDataID]) {
                    value = [ this.pre, line.meta[this.metaDataID], this.post ].join(' ').trim();
                }
                this.uniqueIndexes[value] = this.uniqueIndexes[value] || ++this.uniqueIndexCounter;
                this.filterHash[assayId].push(this.uniqueIndexes[value]);
            });
        }
    }


    export class AssayMetaDataFilterSection extends MetaDataFilterSection {

        updateUniqueIndexesHash(ids: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach((assayId:string) => {
                var assay: any = this._assayIdToAssay(assayId) || {}, value = '(Empty)';
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                if (assay.meta && assay.meta[this.metaDataID]) {
                    value = [ this.pre, assay.meta[this.metaDataID], this.post ].join(' ').trim();
                }
                this.uniqueIndexes[value] = this.uniqueIndexes[value] || ++this.uniqueIndexCounter;
                this.filterHash[assayId].push(this.uniqueIndexes[value]);
            });
        }
    }


    export class MetaboliteCompartmentFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        configure():void {
            this.sectionTitle = 'Compartment';
            this.sectionShortLabel = 'com';
        }


        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, value: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                value = EDDData.MeasurementTypeCompartments[measure.compartment] || {};
                if (value && value.name) {
                    this.uniqueIndexes[value.name] = this.uniqueIndexes[value.name] || ++this.uniqueIndexCounter;
                    this.filterHash[measureId].push(this.uniqueIndexes[value.name]);
                }
            });
        }
    }


    export class MeasurementFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        loadPending: boolean;

        configure(): void {
            this.sectionTitle = 'Measurement';
            this.sectionShortLabel = 'mm';
            this.loadPending = true;
        }

        isFilterUseful(): boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        }

        updateUniqueIndexesHash(mIds: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            mIds.forEach((measureId: string): void => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {};
                var mType: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    mType = EDDData.MeasurementTypes[measure.type] || {};
                    if (mType && mType.name) {
                        this.uniqueIndexes[mType.name] = this.uniqueIndexes[mType.name] || ++this.uniqueIndexCounter;
                        this.filterHash[measureId].push(this.uniqueIndexes[mType.name]);
                    }
                }
            });
            this.loadPending = false;
        }
    }


    export class MetaboliteFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        loadPending:boolean;

        configure():void {
            this.sectionTitle = 'Metabolite';
            this.sectionShortLabel = 'me';
            this.loadPending = true;
        }


        // Override: If the filter has a load pending, it's "useful", i.e. display it.
        isFilterUseful(): boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        }


        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, metabolite: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    metabolite = EDDData.MetaboliteTypes[measure.type] || {};
                    if (metabolite && metabolite.name) {
                        this.uniqueIndexes[metabolite.name] = this.uniqueIndexes[metabolite.name] || ++this.uniqueIndexCounter;
                        this.filterHash[measureId].push(this.uniqueIndexes[metabolite.name]);
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        }
    }


    export class ProteinFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        loadPending:boolean;

        configure():void {
            this.sectionTitle = 'Protein';
            this.sectionShortLabel = 'pr';
            this.loadPending = true;
        }


        // Override: If the filter has a load pending, it's "useful", i.e. display it.
        isFilterUseful():boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        }


        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, protein: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    protein = EDDData.ProteinTypes[measure.type] || {};
                    if (protein && protein.name) {
                        this.uniqueIndexes[protein.name] = this.uniqueIndexes[protein.name] || ++this.uniqueIndexCounter;
                        this.filterHash[measureId].push(this.uniqueIndexes[protein.name]);
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        }
    }


    export class GeneFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        loadPending:boolean;

        configure():void {
            this.sectionTitle = 'Gene';
            this.sectionShortLabel = 'gn';
            this.loadPending = true;
        }


        // Override: If the filter has a load pending, it's "useful", i.e. display it.
        isFilterUseful():boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        }


        updateUniqueIndexesHash(amIDs: string[]): void {
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach((measureId:string) => {
                var measure: any = EDDData.AssayMeasurements[measureId] || {}, gene: any;
                this.filterHash[measureId] = this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    gene = EDDData.GeneTypes[measure.type] || {};
                    if (gene && gene.name) {
                        this.uniqueIndexes[gene.name] = this.uniqueIndexes[gene.name] || ++this.uniqueIndexCounter;
                        this.filterHash[measureId].push(this.uniqueIndexes[gene.name]);
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        }
    }


    // Called when the page loads.
    export function prepareIt() {

        this.mainGraphObject = null;

        this.progressiveFilteringWidget = new ProgressiveFilteringWidget(this);

        this.carbonBalanceData = null;
        this.carbonBalanceDisplayIsFresh = false;

        this.mainGraphRefreshTimerID = null;

        this.attachmentIDs = null;
        this.attachmentsByID = null;
        this.prevDescriptionEditElement = null;

        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.biomassCalculation = -1;

        this.cSourceEntries = [];
        this.mTypeEntries = [];

        this.linesDataGridSpec = null;
        this.linesDataGrid = null;

        this.linesActionPanelRefreshTimer = null;
        this.assaysActionPanelRefreshTimer = null;

        this.assaysDataGridSpecs = {};
        this.assaysDataGrids = {};

        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', (e) => {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });

        $.ajax({
            'url': 'edddata/',
            'type': 'GET',
            'error': (xhr, status, e) => {
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': (data) => {
                EDDData = $.extend(EDDData || {}, data);
                this.progressiveFilteringWidget.prepareFilteringSection();
                // Instantiate a table specification for the Lines table
                this.linesDataGridSpec = new DataGridSpecLines();
                // Instantiate the table itself with the spec
                this.linesDataGrid = new DataGrid(this.linesDataGridSpec);
                // Find out which protocols have assays with measurements - disabled or no
                var protocolsWithMeasurements:any = {};
                $.each(EDDData.Assays, (assayId, assay) => {
                    var line = EDDData.Lines[assay.lid];
                    if (!line || !line.active) return;
                    protocolsWithMeasurements[assay.pid] = true;
                });
                // For each protocol with measurements, create a DataGridAssays object.
                $.each(EDDData.Protocols, (id, protocol) => {
                    var spec;
                    if (protocolsWithMeasurements[id]) {
                        this.assaysDataGridSpecs[id] = spec = new DataGridSpecAssays(protocol.id);
                        this.assaysDataGrids[id] = new DataGridAssays(spec);
                    }
                });
            }
        });

        $('form.line-edit').on('change', '.line-meta > :input', (ev) => {
            // watch for changes to metadata values, and serialize to the meta_store field
            var form = $(ev.target).closest('form'),
                metaIn = form.find('[name=line-meta_store]'),
                meta = JSON.parse(metaIn.val() || '{}');
            form.find('.line-meta > :input').each((i, input) => {
                var key = $(input).attr('id').match(/-(\d+)$/)[1];
                meta[key] = $(input).val();
            });
            metaIn.val(JSON.stringify(meta));
        }).on('click', '.line-meta-add', (ev:JQueryMouseEventObject) => {
            // make metadata Add Value button work and not submit the form
            var addrow = $(ev.target).closest('.line-edit-meta'), type, value;
            type = addrow.find('.line-meta-type').val();
            value = addrow.find('.line-meta-value').val();
            // clear out inputs so another value can be entered
            addrow.find(':input').not(':checkbox, :radio').val('');
            addrow.find(':checkbox, :radio').prop('checked', false);
            if (EDDData.MetaDataTypes[type]) {
                insertLineMetadataRow(addrow, type, value).find(':input').trigger('change');
            }
            return false;
        }).on('click', '.meta-remove', (ev:JQueryMouseEventObject) => {
            // remove metadata row and insert null value for the metadata key
            var form = $(ev.target).closest('form'),
                metaRow = $(ev.target).closest('.line-meta'),
                metaIn = form.find('[name=line-meta_store]'),
                meta = JSON.parse(metaIn.val() || '{}'),
                key = metaRow.attr('id').match(/-(\d+)$/)[1];
            meta[key] = null;
            metaIn.val(JSON.stringify(meta));
            metaRow.remove();
        });
        $(window).load(preparePermissions);
    }

    function preparePermissions() {
        var user: JQuery, group: JQuery;
        // TODO the DOM traversing and filtering here is very hacky, do it better later
        user = EDD_auto.create_autocomplete($('#permission_user_box'));
        group = EDD_auto.create_autocomplete($('#permission_group_box'));
        EDD_auto.setup_field_autocomplete(user, 'User');
        EDD_auto.setup_field_autocomplete(group, 'Group');
        $('form.permissions')
            .on('change', ':radio', (ev:JQueryInputEventObject):void => {
                var radio: JQuery = $(ev.target);
                $('.permissions').find(':radio').each((i: number, r: Element): void => {
                    $(r).closest('span').find('.autocomp').prop('disabled', !$(r).prop('checked'));
                });
                if (radio.prop('checked')) {
                    radio.closest('span').find('.autocomp:visible').focus();
                }
            })
            .on('submit', (ev:JQueryEventObject): boolean => {
                var perm: any = {}, klass: string, auto: JQuery;
                auto = $('form.permissions').find('[name=class]:checked');
                klass = auto.val();
                perm.type = $('form.permissions').find('[name=type]').val();
                perm[klass.toLowerCase()] = { 'id': auto.closest('span').find('input:hidden').val() };
                $.ajax({
                    'url': 'permissions/',
                    'type': 'POST',
                    'data': {
                        'data': JSON.stringify([perm]),
                        'csrfmiddlewaretoken': $('form.permissions').find('[name=csrfmiddlewaretoken]').val()
                    },
                    'success': (): void => {
                        console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                        $('<div>').text('Set Permission').addClass('success')
                            .appendTo($('form.permissions')).delay(5000).fadeOut(2000);
                    },
                    'error': (xhr, status, err): void => {
                        console.log(['Setting permission failed: ', status, ';', err].join(''));
                        $('<div>').text('Server Error: ' + err).addClass('bad')
                            .appendTo($('form.permissions')).delay(5000).fadeOut(2000);
                    }
                });
                return false;
            })
            .find(':radio').trigger('change').end()
            .removeClass('off');
    }


    export function processCarbonBalanceData() {
        // Prepare the carbon balance graph
        this.carbonBalanceData = new CarbonBalance.Display();
        var highlightCarbonBalanceWidget = false;
        if ( this.biomassCalculation > -1 ) {
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID,
                    this.biomassCalculation);
            // Highlight the "Show Carbon Balance" checkbox in red if there are CB issues.
            if (this.carbonBalanceData.getNumberOfImbalances() > 0) {
                highlightCarbonBalanceWidget = true;
            }
        } else {
            // Highlight the carbon balance in red to indicate that we can't calculate
            // carbon balances yet. When they click the checkbox, we'll get them to
            // specify which SBML file to use for biomass.
            highlightCarbonBalanceWidget = true;
        }
        this.linesDataGridSpec.highlightCarbonBalanceWidget(highlightCarbonBalanceWidget);
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
                this.queueMainGraphRemake(false);
        }
    }


    // Called by DataGrid after the Lines table is rendered
    export function prepareAfterLinesTable() {
        var csIDs;
        // Prepare the main data overview graph at the top of the page
        if (this.mainGraphObject === null && $('#maingraph').size() === 1) {
            this.mainGraphObject = Object.create(StudyDGraphing);
            this.mainGraphObject.Setup('maingraph');

            this.progressiveFilteringWidget.mainGraphObject = this.mainGraphObject;
        }

        $('#mainFilterSection').on('mouseover mousedown mouseup', this.queueMainGraphRemake.bind(this, false))
                .on('keydown', filterTableKeyDown.bind(this));
        $('#separateAxesCheckbox').on('change', this.queueMainGraphRemake.bind(this, true));

        // Enable edit lines button
        $('#editLineButton').on('click', (ev:JQueryMouseEventObject):boolean => {
            var button = $(ev.target), data = button.data(), form = clearLineForm(),
                allMeta = {}, metaRow;
            if (data.ids.length === 1) {
                fillLineForm(form, EDDData.Lines[data.ids[0]]);
            } else {
                // compute used metadata fields on all data.ids, insert metadata rows?
                data.ids.map((id:number) => EDDData.Lines[id] || {}).forEach((line:LineRecord) => {
                    $.extend(allMeta, line.meta || {});
                });
                metaRow = form.find('.line-edit-meta');
                // Run through the collection of metadata, and add a form element entry for each
                $.each(allMeta, (key) => insertLineMetadataRow(metaRow, key, ''));
            }
            updateUILineForm(form, data.count > 1);
            scrollToForm(form);
            form.find('[name=line-ids]').val(data.ids.join(','));
            return false;
        });

        // Hacky button for changing the metabolic map
        $("#metabolicMapName").click( () => this.onClickedMetabolicMapName() );

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
                assay.count = count;
                count_total += count;
            }
        });
        // loop over all downloaded measurements
        $.each(data.measures || {}, (index, measurement) => {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            ++count_rec;
            if (!assay || !assay.active) return;
            line = EDDData.Lines[assay.lid];
            if (!line || !line.active) return;
            // attach values
            $.extend(measurement, { 'values': data.data[measurement.id] || [] })
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

        this.progressiveFilteringWidget.processIncomingMeasurementRecords(data.measures || {}, data.types);

        if (count_rec < count_total) {
            // TODO not all measurements downloaded; display a message indicating this
            // explain downloading individual assay measurements too
        }
        // invalidate assays on all DataGrids; redraws the affected rows
        $.each(this.assaysDataGrids, (protocolId, dataGrid) => {
            dataGrid.invalidateAssayRecords(Object.keys(protocolToAssay[protocolId] || {}));
        });
        this.linesDataGridSpec.enableCarbonBalanceWidget(true);
        this.processCarbonBalanceData();
        this.queueMainGraphRemake(false);
    }


    export function carbonBalanceColumnRevealedCallback(spec:DataGridSpecLines,
            dataGridObj:DataGrid) {
        StudyD.rebuildCarbonBalanceGraphs();
    }


    // Start a timer to wait before calling the routine that shows the actions panel.
    export function queueLinesActionPanelShow() {
        if (this.linesActionPanelRefreshTimer) {
            clearTimeout (this.linesActionPanelRefreshTimer);
        }
        this.linesActionPanelRefreshTimer = setTimeout(linesActionPanelShow.bind(this), 150);
    }


    function linesActionPanelShow() {
        // Figure out how many lines are selected.
        var checkedBoxes = [], checkedLen, linesActionPanel;
        if (this.linesDataGrid) {
            checkedBoxes = this.linesDataGrid.getSelectedCheckboxElements();
        }
        checkedLen = checkedBoxes.length;
        linesActionPanel = $('#linesActionPanel').toggleClass('off', !checkedLen);
        $('#linesSelectedCell').empty().text(checkedLen + ' selected');
        // enable singular/plural changes
        $('#cloneLineButton').text('Clone Line' + (checkedLen > 1 ? 's' : ''));
        $('#editLineButton').text('Edit Line' + (checkedLen > 1 ? 's' : '')).data({
            'count': checkedLen,
            'ids': checkedBoxes.map((box:HTMLInputElement) => box.value)
        });
        $('#groupLineButton').toggleClass('off', checkedLen < 2);
    }


    export function queueAssaysActionPanelShow() {
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        if (this.assaysActionPanelRefreshTimer) {
            clearTimeout(this.assaysActionPanelRefreshTimer);
        }
        this.assaysActionPanelRefreshTimer = setTimeout(assaysActionPanelShow.bind(this), 150);
    }


    function assaysActionPanelShow() {
        var checkedBoxes = [], checkedAssays, checkedMeasure, panel, infobox;
        panel = $('#assaysActionPanel');
        if (!panel.size()) {
            return;
        }
        // Figure out how many assays/checkboxes are selected.
        $.each(this.assaysDataGrids, (pID, dataGrid) => {
            checkedBoxes = checkedBoxes.concat(dataGrid.getSelectedCheckboxElements());
        });
        checkedAssays = $(checkedBoxes).filter('[id^=assay]').size();
        checkedMeasure = $(checkedBoxes).filter(':not([id^=assay])').size();
        panel.toggleClass('off', !checkedAssays && !checkedMeasure);
        if (checkedAssays || checkedMeasure) {
            infobox = $('#assaysSelectedCell').empty();
            if (checkedAssays) {
                $("<p>").appendTo(infobox).text((checkedAssays > 1) ?
                        (checkedAssays + " Assays selected") : "1 Assay selected");
            }
            if (checkedMeasure) {
                $("<p>").appendTo(infobox).text((checkedMeasure > 1) ?
                        (checkedMeasure + " Measurements selected") : "1 Measurement selected");
            }
        }
    }


    // Start a timer to wait before calling the routine that remakes a graph. This way we're not
    // bothering the user with the long redraw process when they are making fast edits.
    export function queueMainGraphRemake(force?:boolean) {
        if (this.mainGraphRefreshTimerID) {
            clearTimeout(this.mainGraphRefreshTimerID);
        }
        this.mainGraphRefreshTimerID = setTimeout(remakeMainGraphArea.bind(this, force), 200);
    }


    function remakeMainGraphArea(force?:boolean) {
        var previousIDSet:any[], postFilteringMeasurements:any[],
            dataPointsDisplayed = 0,
            dataPointsTotal = 0,
            separateAxes = $('#separateAxesCheckbox').prop('checked'),
            // FIXME assumes (x0, y0) points
            convert = (d) => { return [[ d[0][0], d[1][0] ]]; },
            compare = (a, b) => { return a[0] - b[0]; };
        this.mainGraphRefreshTimerID = 0;
        if (!this.progressiveFilteringWidget.checkRedrawRequired(force)) {
            return;
        }
        // Start out with a blank graph.  We will re-add all the relevant sets.
        this.mainGraphObject.clearAllSets();
        postFilteringMeasurements = this.progressiveFilteringWidget.buildFilteredMeasurements();

        $.each(postFilteringMeasurements, (i, measurementId) => {
            var measure:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementId],
                mtype:MeasurementTypeRecord = EDDData.MeasurementTypes[measure.type],
                points = (measure.values ? measure.values.length : 0),
                assay, line, protocol, newSet;
            dataPointsTotal += points;
            if (dataPointsDisplayed > 15000) {
                return; // Skip the rest if we've hit our limit
            }
            dataPointsDisplayed += points;
            assay = EDDData.Assays[measure.assay] || {};
            line = EDDData.Lines[assay.lid] || {};
            protocol = EDDData.Protocols[assay.pid] || {};
            newSet = {
                'label': 'dt' + measurementId,
                'measurementname': Utl.EDD.resolveMeasurementRecordToName(measure),
                'name': [line.name, protocol.name, assay.name].join('-'),
                'units': Utl.EDD.resolveMeasurementRecordToUnits(measure),
                'data': $.map(measure.values, convert).sort(compare)
            };
            if (line.control) newSet.iscontrol = 1;
            if (separateAxes) {
                // If the measurement is a metabolite, choose the axis by type. If it's any
                // other subtype, choose the axis based on that subtype, with an offset to avoid
                // colliding with the metabolite axes.
                if (mtype.family === 'm') {
                    newSet.yaxisByMeasurementTypeID = mtype.id;
                } else {
                    newSet.yaxisByMeasurementTypeID = mtype.family;
                }
            }
            this.mainGraphObject.addNewSet(newSet);
        });

        var displayText = dataPointsDisplayed + " points displayed";
        if (dataPointsDisplayed != dataPointsTotal) {
            displayText += " (out of " + dataPointsTotal + ")";
        }
        $('#pointsDisplayedSpan').empty().text(displayText);

        this.mainGraphObject.drawSets();
    }


    function clearAssayForm():JQuery {
        var form:JQuery = $('#id_assay-assay_id').closest('.disclose');
        form.find('[name^=assay-]').not(':checkbox, :radio').val('');
        form.find('[name^=assay-]').filter(':checkbox, :radio').prop('selected', false);
        form.find('.cancel-link').remove();
        form.find('.errorlist').remove();
        return form;
    }

    function clearLineForm() {
        var form = $('#id_line-ids').closest('.disclose');
        form.find('.line-meta').remove();
        form.find('[name^=line-]').not(':checkbox, :radio').val('');
        form.find('[name^=line-]').filter(':checkbox, :radio').prop('checked', false);
        form.find('.errorlist').remove();
        form.find('.cancel-link').remove();
        form.find('.bulk').addClass('off');
        form.off('change.bulk');
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

    function fillLineForm(form, record) {
        var metaRow, experimenter, contact;
        experimenter = EDDData.Users[record.experimenter];
        contact = EDDData.Users[record.contact.user_id];
        form.find('[name=line-ids]').val(record.id);
        form.find('[name=line-name]').val(record.name);
        form.find('[name=line-description]').val(record.description);
        form.find('[name=line-control]').prop('checked', record.control);
        form.find('[name=line-contact_0]').val(record.contact.text || (contact && contact.uid ? contact.uid : '--'));
        form.find('[name=line-contact_1]').val(record.contact.user_id);
        form.find('[name=line-experimenter_0]').val(experimenter && experimenter.uid ? experimenter.uid : '--');
        form.find('[name=line-experimenter_1]').val(record.experimenter);
        form.find('[name=line-carbon_source_0]').val(
                record.carbon.map((v) => (EDDData.CSources[v] || <CarbonSourceRecord>{}).name || '--').join(','));
        form.find('[name=line-carbon_source_1]').val(record.carbon.join(','));
        form.find('[name=line-strains_0]').val(
                record.strain.map((v) => (EDDData.Strains[v] || <StrainRecord>{}).name || '--').join(','));
        form.find('[name=line-strains_1]').val(
                record.strain.map((v) => (EDDData.Strains[v] || <StrainRecord>{}).registry_id || '').join(','));
        if (record.strain.length && form.find('[name=line-strains_1]').val() === '') {
            $('<li>').text('Strain does not have a linked ICE entry! ' +
                    'Saving the line without linking to ICE will remove the strain.')
                .wrap('<ul>').parent().addClass('errorlist')
                .appendTo(form.find('[name=line-strains_0]').parent());
        }
        metaRow = form.find('.line-edit-meta');
        // Run through the collection of metadata, and add a form element entry for each
        $.each(record.meta, (key, value) => {
            insertLineMetadataRow(metaRow, key, value);
        });
        // store original metadata in initial- field
        form.find('[name=line-meta_store]').val(JSON.stringify(record.meta));
        form.find('[name=initial-line-meta_store]').val(JSON.stringify(record.meta));
    }

    function scrollToForm(form) {
        // make sure form is disclosed
        var top = form.toggleClass('discloseHide', false).offset().top;
        $('html, body').animate({ 'scrollTop': top }, 'slow');
    }

    function updateUIAssayForm(form) {
        var title, button;
        // Update the disclose title to read Edit
        title = form.find('.discloseLink > a').text('Edit Assay');
        // Update the button to read Edit
        button = form.find('[name=action][value=assay]').text('Edit Assay');
        // Add link to revert back to 'Add Line' form
        $('<a href="#">Cancel</a>').addClass('cancel-link').on('click', (ev) => {
            clearAssayForm();
            title.text('Add Assays To Selected Lines');
            button.text('Add Assay');
            return false;
        }).insertAfter(button);
    }

    function updateUILineForm(form, plural?) {
        var title, button, text = 'Edit Line' + (plural ? 's' : '');
        // Update the disclose title to read 'Edit Line'
        title = form.find('.discloseLink > a').text(text);
        // Update the button to read 'Edit Line'
        button = form.find('[name=action][value=line]').text(text);
        if (plural) {
            form.find('.bulk').prop('checked', false).removeClass('off');
            form.on('change.bulk', ':input', (ev:JQueryEventObject) => {
                $(ev.target).siblings('label').find('.bulk').prop('checked', true);
            });
        }
        // Add link to revert back to 'Add Line' form
        $('<a href="#">Cancel</a>').addClass('cancel-link').on('click', (ev) => {
            clearLineForm();
            title.text('Add A New Line');
            button.text('Add Line');
            return false;
        }).insertAfter(button);
    }

    function insertLineMetadataRow(refRow, key, value) {
        var row, type, label, input, id = 'line-meta-' + key;
        row = $('<p>').attr('id', 'row_' + id).addClass('line-meta').insertBefore(refRow);
        type = EDDData.MetaDataTypes[key];
        label = $('<label>').attr('for', 'id_' + id).text(type.name).appendTo(row);
        // bulk checkbox?
        input = $('<input type="text">').attr('id', 'id_' + id).val(value).appendTo(row);
        if (type.pre) {
            $('<span>').addClass('meta-prefix').text(type.pre).insertBefore(input);
        }
        $('<span>').addClass('meta-remove').text('Remove').insertAfter(input);
        if (type.postfix) {
            $('<span>').addClass('meta-postfix').text(type.postfix).insertAfter(input);
        }
        return row;
    }

    export function editAssay(index:number):void {
        var record = EDDData.Assays[index], form;
        if (!record) {
            console.log('Invalid Assay record for editing: ' + index);
            return;
        }

        form = clearAssayForm(); // "form" is actually the disclose block
        fillAssayForm(form, record);
        updateUIAssayForm(form);
        scrollToForm(form);
    }

    export function editLine(index:number):void {
        var record = EDDData.Lines[index], form;
        if (!record) {
            console.log('Invalid Line record for editing: ' + index);
            return;
        }

        form = clearLineForm(); // "form" is actually the disclose block
        fillLineForm(form, record);
        updateUILineForm(form);
        scrollToForm(form);
    }


    export function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        } else {
            $("#metabolicMapName").html('(none)');
        }

        if (this.biomassCalculation && this.biomassCalculation != -1) {
            // Calculate carbon balances now that we can.
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID,
                    this.biomassCalculation);

            // Rebuild the CB graphs.
            this.carbonBalanceDisplayIsFresh = false;
            this.rebuildCarbonBalanceGraphs();
        }
    }


    export function rebuildCarbonBalanceGraphs() {
        var cellObjs:DataGridDataCell[],
            group:DataGridColumnGroupSpec = this.linesDataGridSpec.carbonBalanceCol;
        if (this.carbonBalanceDisplayIsFresh) {
            return;
        }
        // Drop any previously created Carbon Balance SVG elements from the DOM.
        this.carbonBalanceData.removeAllCBGraphs();
        cellObjs = [];
        // get all cells from all columns in the column group
        group.memberColumns.forEach((col:DataGridColumnSpec):void => {
            Array.prototype.push.apply(cellObjs, col.getEntireIndex());
        });
        // create carbon balance graph for each cell
        cellObjs.forEach((cell:DataGridDataCell) => {
            this.carbonBalanceData.createCBGraphForLine(cell.recordID, cell.cellElement);
        });
        this.carbonBalanceDisplayIsFresh = true;
    }


    // They want to select a different metabolic map.
    export function onClickedMetabolicMapName():void {
        var ui:StudyMetabolicMapChooser,
            callback:MetabolicMapChooserResult = (error:string,
                metabolicMapID?:number,
                metabolicMapName?:string,
                finalBiomass?:number):void => {
            if (!error) {
                this.metabolicMapID = metabolicMapID;
                this.metabolicMapName = metabolicMapName;
                this.biomassCalculation = finalBiomass;
                this.onChangedMetabolicMap();
            } else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }
};



// The spec object that will be passed to DataGrid to create the Lines table
class DataGridSpecLines extends DataGridSpecBase {

    metaDataIDsUsedInLines:any;
    groupIDsInOrder:any;
    groupIDsToGroupIndexes:any;
    groupIDsToGroupNames:any;
    carbonBalanceCol:DataGridColumnGroupSpec;
    carbonBalanceWidget:DGShowCarbonBalanceWidget;


    constructor() {
        this.findMetaDataIDsUsedInLines();
        this.findGroupIDsAndNames();
        super();
    }


    highlightCarbonBalanceWidget(v:boolean):void {
        this.carbonBalanceWidget.highlight(v);
    }


    enableCarbonBalanceWidget(v:boolean):void {
        this.carbonBalanceWidget.enable(v);
    }


    findMetaDataIDsUsedInLines() {
        var seenHash:any = {};
        // loop lines
        $.each(this.getRecordIDs(), (index, id) => {
            var line = EDDData.Lines[id];
            if (line) {
                $.each(line.meta || {}, (key) => seenHash[key] = true);
            }
        });
        // store all metadata IDs seen
        this.metaDataIDsUsedInLines = Object.keys(seenHash);
    }


    findGroupIDsAndNames() {
        var rowGroups = {};
        // Gather all the row IDs under the group ID each belongs to.
        $.each(this.getRecordIDs(), (index, id) => {
            var line = EDDData.Lines[id], rep = line.replicate;
            if (rep) {
                // use parent replicate as a replicate group ID, push all matching line IDs
                (rowGroups[rep] = rowGroups[rep] || [ rep ]).push(id);
            }
        });
        this.groupIDsToGroupNames = {};
        // For each group ID, just use parent replicate name
        $.each(rowGroups, (group, lines) => {
            this.groupIDsToGroupNames[group] = EDDData.Lines[group].name;
        });
        // alphanumeric sort of group IDs by name attached to those replicate groups
        this.groupIDsInOrder = Object.keys(rowGroups).sort((a,b) => {
            var u:string = this.groupIDsToGroupNames[a], v:string = this.groupIDsToGroupNames[b];
            return u < v ? -1 : u > v ? 1 : 0;
        });
        // Now that they're sorted by name, create a hash for quickly resolving IDs to indexes in
        // the sorted array
        this.groupIDsToGroupIndexes = {};
        $.each(this.groupIDsInOrder, (index, group) => this.groupIDsToGroupIndexes[group] = index);
    }


    // Specification for the table as a whole
    defineTableSpec():DataGridTableSpec {
        return new DataGridTableSpec('lines', { 'name': 'Lines' });
    }
    
    
    private loadLineName(index:string):string {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.name.toUpperCase();
        }
        return '';
    }
    
    
    private loadStrainName(index:string):string {
        // ensure a strain ID exists on line, is a known strain, uppercase first found name or '?'
        var line, strain;
        if ((line = EDDData.Lines[index])) {
            if (line.strain && line.strain.length && (strain = EDDData.Strains[line.strain[0]])) {
                return strain.name.toUpperCase();
            }
        }
        return '?';
    }


    private loadFirstCarbonSource(index:string):any {
        // ensure carbon source ID(s) exist on line, ensure at least one source ID, ensure first ID
        // is known carbon source
        var line, source;
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length && (source = EDDData.CSources[line.carbon[0]])) {
                return source;
            }
        }
        return undefined;
    }
    
    
    private loadCarbonSource(index:string):string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.name.toUpperCase();
        }
        return '?';
    }
    
    
    private loadCarbonSourceLabeling(index:string):string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.labeling.toUpperCase();
        }
        return '?';
    }
    
    
    private loadExperimenterInitials(index:string):string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var line, experimenter;
        if ((line = EDDData.Lines[index])) {
            if ((experimenter = EDDData.Users[line.experimenter])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    }
    
    
    private loadLineModification(index:string):number {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.modified.time;
        }
        return undefined;
    }


    // Specification for the headers along the top of the table
    defineHeaderSpec():DataGridHeaderSpec[] {
        var leftSide:DataGridHeaderSpec[] = [
            new DataGridHeaderSpec(1, 'hLinesName', {
                'name': 'Name',
                'sortBy': this.loadLineName }),
            new DataGridHeaderSpec(2, 'hLinesStrain', {
                'name': 'Strain',
                'sortBy': this.loadStrainName,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(3, 'hLinesCarbon', {
                'name': 'Carbon Source(s)',
                'size': 's',
                'sortBy': this.loadCarbonSource,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(4, 'hLinesLabeling', {
                'name': 'Labeling',
                'size': 's',
                'sortBy': this.loadCarbonSourceLabeling,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(5, 'hLinesCarbonBalance', {
                'name': 'Carbon Balance',
                'size': 's',
                'sortBy': this.loadLineName })
        ];

        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders:DataGridHeaderSpec[] = this.metaDataIDsUsedInLines.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(6 + index, 'hLinesMeta' + id, {
                'name': mdType.name,
                'size': 's',
                'sortBy': this.makeMetaDataSortFunction(id),
                'sortAfter': 0 });
        });

        var rightSide = [
            new DataGridHeaderSpec(6 + metaDataHeaders.length, 'hLinesExperimenter', {
                'name': 'Experimenter',
                'size': 's',
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hLinesModified', {
                'name': 'Last Modified',
                'size': 's',
                'sortBy': this.loadLineModification,
                'sortAfter': 0 })
        ];

        return leftSide.concat(metaDataHeaders, rightSide);
    }


    private makeMetaDataSortFunction(id:string) {
        return (i:string) => {
            var line = EDDData.Lines[i];
            if (line && line.meta) {
                return line.meta[id] || '';
            }
            return '';
        }
    }


    // The colspan value for all the cells that are not 'carbon source' or 'labeling'
    // is based on the number of carbon sources for the respective record.
    // Specifically, it's either the number of carbon sources, or 1, whichever is higher.
    private rowSpanForRecord(index) {
        return (EDDData.Lines[index].carbon || []).length || 1;
    }


    generateLineNameCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line = EDDData.Lines[index];
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'lineId',
                'checkboxWithID': (id) => { return 'line' + id + 'include'; },
                'sideMenuItems': [
                    '<a href="#editline" class="line-edit-link">Edit Line</a>',
                    '<a href="/export?lineId=' + index + '">Export Data as CSV/Excel</a>',
                    '<a href="/sbml?lineId=' + index + '">Export Data as SBML</a>'
                ],
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name + (line.ctrl ? '<b class="iscontroldata">C</b>' : '')
            })
        ];
    }


    generateStrainNameCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, content = [];
        if ((line = EDDData.Lines[index])) {
            content = line.strain.map((id) => {
                var strain = EDDData.Strains[id];
                return [ '<a href="', strain.registry_url, '">', strain.name, '</a>' ].join('');
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content.join('; ') || '--'
               })
        ];
    }


    generateCarbonSourceCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map((id) => { return EDDData.CSources[id].name; });
            }
        }
        return strings.map((name) => {
            return new DataGridDataCell(gridSpec, index, { 'contentString': name })
        });
    }


    generateCarbonSourceLabelingCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map((id) => { return EDDData.CSources[id].labeling; });
            }
        }
        return strings.map((labeling) => {
            return new DataGridDataCell(gridSpec, index, { 'contentString': labeling })
        });
    }


    generateCarbonBalanceBlankCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'minWidth': 200
            })
        ];
    }


    generateExperimenterInitialsCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, exp, content;
        if ((line = EDDData.Lines[index])) {
            if (EDDData.Users && (exp = EDDData.Users[line.experimenter])) {
                content = exp.initials;
            }
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content || '?'
            })
        ];
    }


    generateModificationDateCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Lines[index].modified.time)
            })
        ];
    }


    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] => {
            var contentStr = '', line = EDDData.Lines[index], type = EDDData.MetaDataTypes[id];
            if (line && type && line.meta && (contentStr = line.meta[id] || '')) {
                contentStr = [ type.pre || '', contentStr, type.postfix || '' ].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr
                })
            ];
        }
    }


    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec():DataGridColumnSpec[] {
        var leftSide:DataGridColumnSpec[],
            metaDataCols:DataGridColumnSpec[],
            rightSide:DataGridColumnSpec[];
        // add click handler for menu on line name cells
        $(this.tableElement).on('click', 'a.line-edit-link', (ev) => {
            StudyD.editLine($(ev.target).closest('.popupcell').find('input').val());
            return false;
        });
        leftSide = [
            new DataGridColumnSpec(1, this.generateLineNameCells),
            new DataGridColumnSpec(2, this.generateStrainNameCells),
            new DataGridColumnSpec(3, this.generateCarbonSourceCells),
            new DataGridColumnSpec(4, this.generateCarbonSourceLabelingCells),
            // The Carbon Balance cells are populated by a callback, triggered when first displayed
            new DataGridColumnSpec(5, this.generateCarbonBalanceBlankCells)
        ];
        metaDataCols = this.metaDataIDsUsedInLines.map((id, index) => {
            return new DataGridColumnSpec(6 + index, this.makeMetaDataCellsGeneratorFunction(id));
        });
        rightSide = [
            new DataGridColumnSpec(6 + metaDataCols.length, this.generateExperimenterInitialsCells),
            new DataGridColumnSpec(7 + metaDataCols.length, this.generateModificationDateCells)
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }


    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec():DataGridColumnGroupSpec[] {
        var topSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Line Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Strain'),
            new DataGridColumnGroupSpec('Carbon Source(s)'),
            new DataGridColumnGroupSpec('Labeling'),
            this.carbonBalanceCol = new DataGridColumnGroupSpec('Carbon Balance', {
                'showInVisibilityList': false,    // Has its own header widget
                'hiddenByDefault': true,
                'revealedCallback': StudyD.carbonBalanceColumnRevealedCallback
            })
        ];

        var metaDataColGroups:DataGridColumnGroupSpec[];
        metaDataColGroups = this.metaDataIDsUsedInLines.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });

        var bottomSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
        ];

        return topSection.concat(metaDataColGroups, bottomSection);
    }


    // Specification for the groups that rows can be gathered into
    defineRowGroupSpec():any {

        var rowGroupSpec = [];
        for (var x = 0; x < this.groupIDsInOrder.length; x++) {
            var id = this.groupIDsInOrder[x];

            var rowGroupSpecEntry:any = {    // Groups are numbered starting from 0
                name: this.groupIDsToGroupNames[id]
            };
            rowGroupSpec.push(rowGroupSpecEntry);
        }

        return rowGroupSpec;
    }


    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    getTableElement() {
        return document.getElementById("studyLinesTable");
    }


    // An array of unique identifiers (numbers, not strings), used to identify the records in the
    // data set being displayed
    getRecordIDs() {
        return Object.keys(EDDData.Lines);
    }


    // This is called to generate the array of custom header widgets. The order of the array will be
    // the order they are added to the header bar. It's perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid:DataGrid):DataGridHeaderWidget[] {
        var widgetSet:DataGridHeaderWidget[] = [];

        // Create a single widget for substring searching
        var searchLinesWidget = new DGLinesSearchWidget(dataGrid, this, 'Search Lines', 30, false);
        widgetSet.push(searchLinesWidget);
        // A "Carbon Balance" checkbox
        var showCarbonBalanceWidget = new DGShowCarbonBalanceWidget(dataGrid, this);
        showCarbonBalanceWidget.displayBeforeViewMenu(true);
        widgetSet.push(showCarbonBalanceWidget);
        this.carbonBalanceWidget = showCarbonBalanceWidget;
        // A "deselect all" button
        var deselectAllWidget = new DGDeselectAllWidget(dataGrid, this);
        deselectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(deselectAllWidget);
        // A "select all" button
        var selectAllWidget = new DGSelectAllWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);
        return widgetSet;
    }


    // This is called to generate the array of custom options menu widgets. The order of the array
    // will be the order they are displayed in the menu. Empty array = OK.
    createCustomOptionsWidgets(dataGrid:DataGrid):DataGridOptionWidget[] {
        var widgetSet:DataGridOptionWidget[] = [];

        // Create a single widget for showing disabled Lines
        var groupLinesWidget = new DGGroupStudyReplicatesWidget(dataGrid, this);
        widgetSet.push(groupLinesWidget);
        var disabledLinesWidget = new DGDisabledLinesWidget(dataGrid, this);
        widgetSet.push(disabledLinesWidget);
        return widgetSet;
    }


    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid:DataGrid):void {

        // Wire up the 'action panels' for the Lines and Assays sections
        var linesTable = this.getTableElement();
        $(linesTable).on('change', ':checkbox', () => StudyD.queueLinesActionPanelShow());

        // This calls down into the instantiated widget and alters its styling,
        // so we need to do it after the table has been created.
        this.enableCarbonBalanceWidget(false);

        // Wire-in our custom edit fields for the Studies page, and continue with general init
        StudyD.prepareAfterLinesTable();
    }
}



// When unchecked, this hides the set of Lines that are marked as disabled.
class DGDisabledLinesWidget extends DataGridOptionWidget {

    createElements(uniqueID:any):void {
        var cbID:string = this.dataGridSpec.tableSpec.id+'ShowDLinesCB'+uniqueID;
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        $(cb).click( (e) => this.dataGridOwnerObject.clickedOptionWidget(e) );
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);;
        this._createdElements = true;
    }


    applyFilterToIDs(rowIDs:string[]):string[] {

        var checked:boolean = false;
        if (this.checkBoxElement.checked) {
            checked = true;
        }
        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }

        var filteredIDs = [];
        for (var r = 0; r < rowIDs.length; r++) {
            var id = rowIDs[r];
            // Here is the condition that determines whether the rows associated with this ID are
            // shown or hidden.
            if (EDDData.Lines[id].active) {
                filteredIDs.push(id);            
            }
        }
        return filteredIDs;
    }


    initialFormatRowElementsForID(dataRowObjects:any, rowID:string):any {
        if (!EDDData.Lines[rowID].active) {
            $.each(dataRowObjects, (x, row) => $(row.getElement()).addClass('disabledRecord'));
        }
    }
}



// A widget to toggle replicate grouping on and off
class DGGroupStudyReplicatesWidget extends DataGridOptionWidget {

    createElements(uniqueID:any):void {
        var pThis = this;
        var cbID:string = this.dataGridSpec.tableSpec.id+'GroupStudyReplicatesCB'+uniqueID;
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(
            function(e) {
                if (pThis.checkBoxElement.checked) {
                    pThis.dataGridOwnerObject.turnOnRowGrouping();
                } else {
                    pThis.dataGridOwnerObject.turnOffRowGrouping();                
                }
            }
        );
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Group Replicates', cbID);
        this._createdElements = true;
    }
}



// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
class DGLinesSearchWidget extends DGSearchWidget {

    searchDisclosureElement:any;


    constructor(dataGridOwnerObject:any, dataGridSpec:any, placeHolder:string, size:number,
            getsFocus:boolean) {
        super(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
    }


    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    createElements(uniqueID:any):void {
        super.createElements(uniqueID);
        this.createdElements(true);
    }


    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    appendElements(container:any, uniqueID:any):void {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    }
}



// A header widget to prepare the Carbon Balance table cells, and show or hide them.
class DGShowCarbonBalanceWidget extends DataGridHeaderWidget {

    checkBoxElement:any;
    labelElement:any;
    highlighted:boolean;
    checkboxEnabled:boolean;

    // store more specific type of spec to get to carbonBalanceCol later
    private _lineSpec:DataGridSpecLines;

    constructor(dataGridOwnerObject:DataGrid, dataGridSpec:DataGridSpecLines) {
        super(dataGridOwnerObject, dataGridSpec);
        this.checkboxEnabled = true;
        this.highlighted = false;
        this._lineSpec = dataGridSpec;
    }
    

    createElements(uniqueID:any):void {
        var cbID:string = this.dataGridSpec.tableSpec.id + 'CarBal' + uniqueID;
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        cb.className = 'tableControl';
        $(cb).click((ev:JQueryMouseEventObject):void => {
            this.activateCarbonBalance();
        });

        var label:HTMLElement = this._createLabel('Carbon Balance', cbID);

        var span:HTMLElement = document.createElement("span");
        span.className = 'tableControl';
        span.appendChild(cb);
        span.appendChild(label);

        this.checkBoxElement = cb;
        this.labelElement = label;
        this.element = span;
        this.createdElements(true);
    }

    highlight(h:boolean):void {
        this.highlighted = h;
        if (this.checkboxEnabled) {
            if (h) {
                this.labelElement.style.color = 'red';
            } else {
                this.labelElement.style.color = '';
            }
        }
    }

    enable(h:boolean):void {
        this.checkboxEnabled = h;
        if (h) {
            this.highlight(this.highlighted);
            this.checkBoxElement.removeAttribute('disabled');
        } else {
            this.labelElement.style.color = 'gray';
            this.checkBoxElement.setAttribute('disabled', true);
        }
    }

    private activateCarbonBalance():void {
        var ui:FullStudyBiomassUI,
            callback:FullStudyBiomassUIResultsCallback;
        callback = (error:string,
                metabolicMapID?:number,
                metabolicMapFilename?:string,
                finalBiomass?:number):void => {
            if (!error) {
                StudyD.metabolicMapID = metabolicMapID;
                StudyD.metabolicMapName = metabolicMapFilename;
                StudyD.biomassCalculation = finalBiomass;
                StudyD.onChangedMetabolicMap();
                this.checkBoxElement.checked = true;
                this.dataGridOwnerObject.showColumn(this._lineSpec.carbonBalanceCol);
            }
        };
        if (this.checkBoxElement.checked) {
            // We need to get a biomass calculation to multiply against OD.
            // Have they set this up yet?
            if (!StudyD.biomassCalculation || StudyD.biomassCalculation === -1) {
                this.checkBoxElement.checked = false;
                // Must setup the biomass
                ui = new FullStudyBiomassUI(callback);
            } else {
                this.dataGridOwnerObject.showColumn(this._lineSpec.carbonBalanceCol);
            }
        } else {
            this.dataGridOwnerObject.hideColumn(this._lineSpec.carbonBalanceCol);
        }
    }
}



class DataGridAssays extends DataGrid {


    sectionCurrentlyDisclosed:boolean;
    graphRefreshTimerID:any;
    // Right now we're not actually using the contents of this array, just
    // checking to see if it's non-empty.
    recordsCurrentlyInvalidated:number[];


    constructor(dataGridSpec:DataGridSpecBase) {
        this.recordsCurrentlyInvalidated = [];
        this.sectionCurrentlyDisclosed = false;
        super(dataGridSpec);
    }


    invalidateAssayRecords(records:number[]):void {
        this.recordsCurrentlyInvalidated = this.recordsCurrentlyInvalidated.concat(records);
        if (!this.recordsCurrentlyInvalidated.length) {
            return;
        }
        if (this.sectionCurrentlyDisclosed) {
            this.triggerAssayRecordsRefresh();
        }
    }


    clickedDisclose(disclose:boolean):void {
        var spec:DataGridSpecAssays = this.getSpec();
        var table = spec.getTableElement();
        var div = spec.undisclosedSectionDiv;
        if (!div || !table) { return; }
        if (disclose) {
            this.sectionCurrentlyDisclosed = true;
            // Start a timer to wait before calling the routine that remakes a table. This breaks up
            // table recreation into separate events, so the browser can update UI.
            if (this.recordsCurrentlyInvalidated.length) {
                setTimeout(() => this.triggerAssayRecordsRefresh(), 10);
            }
        } else {
            this.sectionCurrentlyDisclosed = false;
        }
    }


    triggerAssayRecordsRefresh():void {
        try {
            this.triggerDataReset();
            this.recordsCurrentlyInvalidated = [];
            this.queueGraphRemake();
        } catch (e) {
            console.log('Failed to execute records refresh: ' + e);
        }
    }


    private _cancelGraph() {
        if (this.graphRefreshTimerID) {
            clearTimeout(this.graphRefreshTimerID);
            delete this.graphRefreshTimerID;
        }
    }


    // Start a timer to wait before calling the routine that remakes the graph.
    queueGraphRemake() {
        this._cancelGraph();
        this.graphRefreshTimerID = setTimeout( () => this.remakeGraphArea(), 100 );
    }


    remakeGraphArea() {
        var spec:DataGridSpecAssays = this.getSpec(), g, convert, compare;
        // if called directly, cancel any pending requests in "queue"
        this._cancelGraph();

        if (!StudyDGraphing || !spec || !spec.graphObject) {
            return;
        }

        g = spec.graphObject;
        g.clearAllSets();

        // function converts downloaded data point to form usable by flot
        // FIXME assumes (x0, y0) points only
        convert = (d) => { return [[ d[0][0], d[1][0] ]]; };

        // function comparing two points, to sort data sent to flot
        compare = (a, b) => { return a[0] - b[0]; };

        spec.getRecordIDs().forEach((id) => {
            var assay:any = EDDData.Assays[id] || {},
                line:any = EDDData.Lines[assay.lid] || {},
                measures;
            if (!assay.active || !line.active) { return; }
            measures = assay.measures || [];
            measures.forEach((m) => {
                var measure = EDDData.AssayMeasurements[m], set;
                set = {
                    'label': 'dt' + m,
                    'measurementname': Utl.EDD.resolveMeasurementRecordToName(m),
                    'name': assay.name,
                    'aid': id,
                    'mtid': measure.type,
                    'units': Utl.EDD.resolveMeasurementRecordToUnits(m),
                    'data': $.map(measure.values, convert).sort(compare)
                };
                if (line.control) set.iscontrol = true;
                g.addNewSet(set);
            });
        });

        g.drawSets();
    }


    // Note: Currently not being called.
    resizeGraph(g) {
        var spec:DataGridSpecAssays = this.getSpec();
        var graphObj = spec.graphObject;
        if (!graphObj) {
            return;
        }
        if (!graphObj.plotObject) {
            return;
        }
    
        graphObj.plotObject.resize();
        graphObj.plotObject.setupGrid();
        graphObj.plotObject.draw();
    }
}



// The spec object that will be passed to DataGrid to create the Assays table(s)
class DataGridSpecAssays extends DataGridSpecBase {

    protocolID:any;
    protocolName:string;
    assayIDsInProtocol:number[];
    metaDataIDsUsedInAssays:any;
    maximumXValueInData:number;

    undisclosedSectionDiv:any;

    measuringTimesHeaderSpec:DataGridHeaderSpec;
    graphAreaHeaderSpec:DataGridHeaderSpec;

    graphObject:any;


    constructor(protocolID) {
        this.protocolID = protocolID;
        this.protocolName = EDDData.Protocols[protocolID].name;
        this.graphObject = null;
        this.measuringTimesHeaderSpec = null;
        this.graphAreaHeaderSpec = null;
        this.refreshIDList();
        this.findMaximumXValueInData();
        this.findMetaDataIDsUsedInAssays();
        super();
    }


    refreshIDList():void {
        // Find out which protocols have assays with measurements - disabled or no
        this.assayIDsInProtocol = [];
        $.each(EDDData.Assays, (assayId:string, assay:AssayRecord):void => {
            var line:LineRecord;
            if (this.protocolID !== assay.pid) {
                // skip assays for other protocols
            } else if (!(line = EDDData.Lines[assay.lid]) || !line.active) {
                // skip assays without a valid line or with a disabled line
            } else {
                this.assayIDsInProtocol.push(assay.id);
            }
        });
    }


    // An array of unique identifiers, used to identify the records in the data set being displayed
    getRecordIDs():any[] {
        return this.assayIDsInProtocol;
    }


    // This is an override.  Called when a data rest is triggered, but before the table rows are
    // rebuilt.
    onDataReset(dataGrid:DataGrid):void {
        this.findMaximumXValueInData();
        if (this.measuringTimesHeaderSpec && this.measuringTimesHeaderSpec.element) {
            $(this.measuringTimesHeaderSpec.element).children(':first').text(
                    'Measuring Times (Range 0 to ' + this.maximumXValueInData + ')');
        }
    }


    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    getTableElement() {
        var section, protocolDiv, titleDiv, titleLink, table,
            p = this.protocolID,
            tableID:string = 'pro' + p + 'assaystable';
        // If we can't find a table, we insert a click-to-disclose div, and then a table directly
        // after it.
        if ($('#' + tableID).size() === 0) {
            section = $('#assaysSection');
            protocolDiv = $('<div>').addClass('disclose discloseHide').appendTo(section);
            this.undisclosedSectionDiv = protocolDiv[0];
            titleDiv = $('<div>').addClass('sectionChapter').appendTo(protocolDiv);
            titleLink = $('<span>').addClass('discloseLink')
                    .text(this.protocolName + ' Assays')
                    .appendTo(titleDiv);
            table = $(document.createElement("table"))
                    .attr('id', tableID).addClass('discloseBody')
                    .appendTo(protocolDiv);
            // Make sure the actions panel remains at the bottom.
            $('#assaysActionPanel').appendTo(section);
        }
        return document.getElementById(tableID);
    }


    // Specification for the table as a whole
    defineTableSpec():DataGridTableSpec {
        return new DataGridTableSpec('assays'+this.protocolID, {
            'defaultSort': 1
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
        var maxForAll:number = 0;
        // reduce to find highest value across all records
        maxForAll = this.getRecordIDs().reduce((prev:number, assayId) => {
            var assay = EDDData.Assays[assayId], measures, maxForRecord;
            measures = assay.measures || [];
            // reduce to find highest value across all measures
            maxForRecord = measures.reduce((prev:number, measureId) => {
                var lookup:any = EDDData.AssayMeasurements || {},
                    measure:any = lookup[measureId] || {},
                    maxForMeasure;
                // reduce to find highest value across all data in measurement
                maxForMeasure = (measure.values || []).reduce((prev:number, point) => {
                    return Math.max(prev, point[0][0]);
                }, 0);
                return Math.max(prev, maxForMeasure);
            }, 0);
            return Math.max(prev, maxForRecord);
        }, 0);
        // Anything above 0 is acceptable, but 0 will default instead to 1.
        this.maximumXValueInData = maxForAll || 1;
    }


    private loadAssayName(index:any):string {
        // In an old typical EDDData.Assays record this string is currently pre-assembled and stored
        // in 'fn'. But we're phasing that out.
        var assay, line;
        if ((assay = EDDData.Assays[index])) {
            if ((line = EDDData.Lines[assay.lid])) {
                return [line.n, this.protocolName, assay.name].join('-').toUpperCase();
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
        var metaDataHeaders:DataGridHeaderSpec[] = this.metaDataIDsUsedInAssays.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(2 + index, 'hAssaysMeta'+this.protocolID+'id' + id, {
                'name': mdType.name,
                'headerRow': 2, 
                'size': 's',
                'sortBy': this.makeMetaDataSortFunction(id),
                'sortAfter': 1
            });
        });

        this.graphAreaHeaderSpec = new DataGridHeaderSpec(8 + metaDataHeaders.length,
                'hAssaysGraph' + this.protocolID, { 'colspan': 7 + metaDataHeaders.length });

        var leftSide:DataGridHeaderSpec[] = [
            this.graphAreaHeaderSpec,
            new DataGridHeaderSpec(1, 'hAssaysName'+this.protocolID, {
                'name': 'Name',
                'headerRow': 2, 
                'sortBy': this.loadAssayName
            })
        ];

        this.measuringTimesHeaderSpec = new DataGridHeaderSpec(5 + metaDataHeaders.length,
                'hAssaysMTimes'+this.protocolID, { 'name': 'Measuring Times', 'headerRow': 2 });

        var rightSide = [
            new DataGridHeaderSpec(2 + metaDataHeaders.length,
                    'hAssaysMName' + this.protocolID,
                    { 'name': 'Measurement', 'headerRow': 2 }),
            new DataGridHeaderSpec(3 + metaDataHeaders.length,
                    'hAssaysUnits' + this.protocolID,
                    { 'name': 'Units', 'headerRow': 2 }),
            new DataGridHeaderSpec(4 + metaDataHeaders.length,
                    'hAssaysCount' + this.protocolID,
                    { 'name': 'Count', 'headerRow': 2 }),
            this.measuringTimesHeaderSpec,
            new DataGridHeaderSpec(6 + metaDataHeaders.length,
                    'hAssaysExperimenter' + this.protocolID,
                    {
                        'name': 'Experimenter',
                        'headerRow': 2,
                        'sortBy': this.loadExperimenterInitials,
                        'sortAfter': 1
                    }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length,
                    'hAssaysModified' + this.protocolID,
                    {
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


    // The colspan value for all the cells that are assay-level (not measurement-level) is based on
    // the number of measurements for the respective record. Specifically, it's the number of
    // metabolite measurements, plus 1 if there are transcriptomics measurements, plus 1 if there
    // are proteomics measurements, all added together.  (Or 1, whichever is higher.)
    private rowSpanForRecord(index):number {
        var rec = EDDData.Assays[index];
        var v:number = ((rec.metabolites || []).length +
                        ((rec.transcriptions || []).length ? 1 : 0) +
                        ((rec.proteins || []).length ? 1 : 0)) || 1;
        return v;
    }


    generateAssayNameCells(gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] {
        var record = EDDData.Assays[index], line = EDDData.Lines[record.lid], sideMenuItems = [
            '<a class="assay-edit-link">Edit Assay</a>',
            '<a class="assay-reload-link">Reload Data</a>',
            '<a href="/export?assayId=' + index + '">Export Data as CSV/etc</a>'
        ];
        // TODO we probably don't want to special-case like this by name
        if (gridSpec.protocolName == "Transcriptomics") {
            sideMenuItems.push('<a href="import/rnaseq/edgepro?assay='+index+'">Import RNA-seq data from EDGE-pro</a>');
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'assayId',
                'checkboxWithID': (id) => { return 'assay' + id + 'include'; },
                'sideMenuItems': sideMenuItems,
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': [line.name, gridSpec.protocolName, record.name].join('-')
            })
        ];
    }


    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec:DataGridSpecAssays, index:string):DataGridDataCell[] => {
            var contentStr = '', assay = EDDData.Assays[index], type = EDDData.MetaDataTypes[id];
            if (assay && type && assay.meta && (contentStr = assay.meta[id] || '')) {
                contentStr = [ type.pre || '', contentStr, type.postfix || '' ].join(' ').trim();
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
        var record = EDDData.Assays[index];
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
        var tupleTimeCount = (value, key) => { return [[ key, value ]]; },
            sortByTime = (a:any, b:any) => {
                var y = parseFloat(a[0]), z = parseFloat(b[0]);
                return (<any>(y > z) - <any>(z > y));
            },
            svgCellForTimeCounts = (ids:any[]) => {
                var consolidated, svg = '', timeCount = {};
                // count values at each x for all measurements
                ids.forEach((measureId) => {
                    var measure:any = EDDData.AssayMeasurements[measureId] || {},
                        data:any[] = measure.values || [];
                    data.forEach((point) => {
                        timeCount[point[0][0]] = timeCount[point[0][0]] || 0;
                        // Typescript compiler does not like using increment operator on expression
                        ++timeCount[point[0][0]];
                    });
                });
                // map the counts to [x, y] tuples, sorted by x value
                consolidated = $.map(timeCount, tupleTimeCount).sort(sortByTime);
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
                    data = value.measure.values || [],
                    svg = gridSpec.assembleSVGStringForDataPoints(data, format);
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
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" width="100%" height="10px"\
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
                rx = ((x / this.maximumXValueInData) * 450) + 10,
                tt = [y, ' at ', x, 'h'].join('');
            paths.push(['<path class="cE" d="M', rx, ',5v4"></path>'].join(''));
            if (y === null) {
                paths.push(['<path class="cE" d="M', rx, ',2v6"></path>'].join(''));
                return;
            }
            paths.push(['<path class="cP" d="M', rx, ',1v4"></path>'].join(''));
            if (format === 'carbon') {
                paths.push(['<path class="cV" d="M', rx, ',1v8"><title>', tt, '</title></path>'].join(''));
            } else {
                paths.push(['<path class="cP" d="M', rx, ',1v8"><title>', tt, '</title></path>'].join(''));
            }
        });
        paths.push('</svg>');
        return paths.join('\n');
    }
    

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec():DataGridColumnSpec[] {
        var leftSide:DataGridColumnSpec[],
            metaDataCols:DataGridColumnSpec[],
            rightSide:DataGridColumnSpec[];
        // add click handler for menu on assay name cells
        $(this.tableElement).on('click', 'a.assay-edit-link', (ev) => {
            StudyD.editAssay($(ev.target).closest('.popupcell').find('input').val());
            return false;
        }).on('click', 'a.assay-reload-link', (ev:JQueryMouseEventObject):boolean => {
            var id = $(ev.target).closest('.popupcell').find('input').val(),
                assay:AssayRecord = EDDData.Assays[id];
            if (assay) {
                StudyD.requestAssayData(assay);
            }
            return false;
        });
        leftSide = [
            new DataGridColumnSpec(1, this.generateAssayNameCells)
           ];

        metaDataCols = this.metaDataIDsUsedInAssays.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnSpec(2 + index, this.makeMetaDataCellsGeneratorFunction(id));
        });

        rightSide = [
            new DataGridColumnSpec(2 + metaDataCols.length, this.generateMeasurementNameCells),
            new DataGridColumnSpec(3 + metaDataCols.length, this.generateUnitsCells),
            new DataGridColumnSpec(4 + metaDataCols.length, this.generateCountCells),
            new DataGridColumnSpec(5 + metaDataCols.length, this.generateMeasuringTimesCells),
            new DataGridColumnSpec(6 + metaDataCols.length, this.generateExperimenterCells),
            new DataGridColumnSpec(7 + metaDataCols.length, this.generateModificationDateCells)
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }


    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec():DataGridColumnGroupSpec[] {
        var topSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Name', { 'showInVisibilityList': false })
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

        // Create a single widget for substring searching
        var searchAssaysWidget = new DGAssaysSearchWidget(dataGrid, this, 'Search Assays', 30,
                false);
        widgetSet.push(searchAssaysWidget);
        // A "select all" button
        var selectAllWidget = new DGSelectAllWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);

        return widgetSet;
    }


    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    createCustomOptionsWidgets(dataGrid:DataGrid):DataGridOptionWidget[] {
        var widgetSet:DataGridOptionWidget[] = [];
        // Create a single widget for showing disabled Assays
        var disabledAssaysWidget = new DGDisabledAssaysWidget(dataGrid, this);
        widgetSet.push(disabledAssaysWidget);
        return widgetSet;
    }


    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid:DataGridAssays):void {

        // Wire up the 'action panels' for the Assays sections
        var table = this.getTableElement();
        $(table).on('change', ':checkbox', () => StudyD.queueAssaysActionPanelShow());

        if (this.undisclosedSectionDiv) {
            $(this.undisclosedSectionDiv).click(() => dataGrid.clickedDisclose(true));
        }

        var p = this.protocolID;
        var graphid = "pro" + p + "graph";
        if (this.graphAreaHeaderSpec) {
            if (this.measuringTimesHeaderSpec.element) {
                $(this.graphAreaHeaderSpec.element).html('<div id="' + graphid +
                        '" class="graphContainer"></div>');
                // Initialize the graph object
                this.graphObject = Object.create(StudyDGraphing);
                this.graphObject.Setup(graphid);
            }
        }
        // Run it once in case the page was generated with checked Assays
        StudyD.queueAssaysActionPanelShow();
    }
}



// When unchecked, this hides the set of Assays that are marked as disabled.
class DGDisabledAssaysWidget extends DataGridOptionWidget {

    createElements(uniqueID:any):void {
        var cbID:string = this.dataGridSpec.tableSpec.id+'ShowDAssaysCB'+uniqueID;
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        $(cb).click( (e) => this.dataGridOwnerObject.clickedOptionWidget(e) );
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);;
        this._createdElements = true;
    }


    applyFilterToIDs(rowIDs:string[]):string[] {

        // If the box is checked, return the set of IDs unfiltered
        if (this.checkBoxElement.checked) {
            return rowIDs;
        }

        var filteredIDs = [];
        for (var r = 0; r < rowIDs.length; r++) {
            var id = rowIDs[r];
            // Here is the condition that determines whether the rows associated with this ID are
            // shown or hidden.
            if (EDDData.Assays[id].active) {
                filteredIDs.push(id);            
            }
        }
        return filteredIDs;
    }


    initialFormatRowElementsForID(dataRowObjects:any, rowID:any):any {
        if (!EDDData.Assays[rowID].active) {
            $.each(dataRowObjects, (x, row) => $(row.getElement()).addClass('disabledRecord'));
        }
    }
}



// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
class DGAssaysSearchWidget extends DGSearchWidget {

    searchDisclosureElement:any;


    constructor(dataGridOwnerObject:any, dataGridSpec:any, placeHolder:string, size:number,
            getsFocus:boolean) {
        super(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
    }


    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    createElements(uniqueID:any):void {
        super.createElements(uniqueID);
        this.createdElements(true);
    }


    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    appendElements(container:any, uniqueID:any):void {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    }
}


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyD.prepareIt());

