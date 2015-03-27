/// <reference path="EDDDataInterface.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Autocomplete.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="EditableElement.ts" />
/// <reference path="BiomassCalculationUI.ts" />

declare var EDDData:EDDData;

module StudyD {
    'use strict';

    var mainGraphObject:any;

    // For the filtering section on the main graph
    var allFilteringWidgets:GenericFilterSection[];
    var assayFilteringWidgets:GenericFilterSection[];
    var metaboliteFilteringWidgets:GenericFilterSection[];
    var metaboliteDataProcessed:boolean;
    var proteinFilteringWidgets:GenericFilterSection[];
    var proteinDataProcessed:boolean;
    var geneFilteringWidgets:GenericFilterSection[];
    var geneDataProcessed:boolean;

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


    // Utility interface used by GenericFilterSection#buildUniqueValuesHash
    interface ValueToUniqueID {
        [index:string]:number;
    }


    export class GenericFilterSection  {

        // A dictionary of the unique values found for filtering against.
        // Each key is an integer, ascending from 1, in the order the value was first encountered
        // when examining the record data in buildUniqueValuesHash.
        uniqueValues:any;
        // The sorted order of the list of unique values found in the filter
        uniqueValuesOrder:any;
        // A dictionary resolving a record ID (assay ID, measurement ID) to an array. Each array
        // contains the integer identifiers of the unique values that apply to that record.
        filterHash:any;
        // Dictionary resolving the filter value integer identifiers to HTML Input checkboxes.
        checkboxes:any;
        // Dictionary used to compare checkboxes with a previous state to determine whether an
        // update is required. Values are 'C' for checked, 'U' for unchecked, and 'N' for not
        // existing at the time. ('N' can be useful when checkboxes are removed from a filter due to
        // the back-end data changing.)
        previousCheckboxState:any;
        // Dictionary resolving the filter value integer identifiers to HTML table row elements.
        tableRows:any;

        // References to HTML elements created by the filter
        filterColumnDiv:any;
        titleElement:any;
        searchBoxElement:HTMLInputElement;
        scrollZoneDiv:any;
        filteringTable:any;
        tableBodyElement:any;

        // Search box related
        typingTimeout:number;
        typingDelay:number;
        gotFirstFocus:boolean;
        currentSearchSelection:string;
        previousSearchSelection:string;
        minCharsToTriggerSearch:number;

        anyCheckboxesChecked:boolean;

        sectionTitle:string;
        sectionShortLabel:string;

        constructor() {
            this.uniqueValues = {};
            this.uniqueValuesOrder = [];
            this.filterHash = {};
            this.previousCheckboxState = {};

            this.typingTimeout = null;
            this.typingDelay = 330;
            this.gotFirstFocus = false;
            this.currentSearchSelection = '';
            this.previousSearchSelection = '';
            this.minCharsToTriggerSearch = 1;

            this.configure();
            this.anyCheckboxesChecked = false;
            this.createContainerObjects();
        }


        configure():void {
            this.sectionTitle = 'Generic Filter';
            this.sectionShortLabel = 'gf';
        }


        // Create all the container HTML objects
        createContainerObjects():void {
            var sBoxID:string = 'filter' + this.sectionShortLabel + 'SearchBox',
                sBox:HTMLInputElement;
            this.filterColumnDiv = $("<div>").addClass('filterColumn')[0];
            this.titleElement = $("<p>").text(this.sectionTitle)[0];

            $(sBox = document.createElement("input"))
                .attr({ 'id': sBoxID, 
                           'name': sBoxID,
                           'placeholder': this.sectionTitle,
                           'size': 14})
                .addClass('searchBox');
            sBox.setAttribute('type', 'text'); // JQuery .attr() cannot set this
            this.searchBoxElement = sBox;
            this.scrollZoneDiv = $("<div>").addClass('filterCriteriaScrollZone')[0];
            this.filteringTable = $("<table>")
                .addClass('filterCriteriaTable dragboxes')
                .attr({ 'cellpadding': 0, 'cellspacing': 0 })
                .append(this.tableBodyElement = $("<tbody>")[0]);
        }


        processFilteringData(ids:any[]):void {
            var usedValues:{[index:string]:number} = this.buildUniqueValuesHash(ids);
            var crSet:number[] = [];
            var cHash:{[index:number]:string} = {};
            // Create a reversed hash so keys = values and vice versa
            $.each(usedValues, (key, value) => {
                cHash[value] = key;
                crSet.push(value);
            });
            // Alphabetically sort an array of the keys according to values
            crSet.sort(function(a:number, b:number) {
                var _a:string = cHash[a].toLowerCase();
                var _b:string = cHash[b].toLowerCase();
                return _a < _b ? -1 : _a > _b ? 1 : 0;
            });
            this.uniqueValues = cHash;
            this.uniqueValuesOrder = crSet;
        }


        // In this function are running through the given list of measurement IDs and examining
        // their records and related records, locating the particular field we are interested in,
        // and creating a list of all the unique values for that field.  As we go, we mark each
        // unique value with an integer UID, and construct a hash resolving each record to one (or
        // possibly more) of those integer UIDs.  This prepares us for quick filtering later on.
        // (This generic filter does nothing, so we leave these structures blank.)
        buildUniqueValuesHash(ids:any[]):any {
            return this.filterHash = {};
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


        applyBackgroundStyle(darker:number):void {
            darker = darker % 2;
            var striping = ['stripeRowA', 'stripeRowB'];
            $(this.filterColumnDiv).removeClass(striping[1-darker]);
            $(this.filterColumnDiv).addClass(striping[darker]);
        }


        populateTable():void {
            var fCol = this.filterColumnDiv;
            // Only use the scrolling container div if the size of the list warrants it, because
            // the scrolling container div declares a large padding margin for the scroll bar,
            // and that padding margin would be an empty waste of space otherwise.
            if (this.uniqueValuesOrder.length > 15) {
                $(fCol).append(this.searchBoxElement).append(this.scrollZoneDiv);
                // Change the reference so we're affecting the innerHTML of the correct div later on
                fCol = this.scrollZoneDiv;
            } else {
                $(fCol).append(this.titleElement).find(this.scrollZoneDiv).remove();
            }
            $(fCol).append(this.filteringTable);

            var tBody = this.tableBodyElement;
            // Clear out any old table contents
            $(this.tableBodyElement).empty();

            this.tableRows = {};
            this.checkboxes = {};
            this.uniqueValuesOrder.forEach((rowId) => {
                var cboxName = [ 'filter', this.sectionShortLabel, 'n', rowId, 'cbox' ].join(''),
                    cell, p, q, r;
                this.tableRows[rowId] = this.tableBodyElement.insertRow();
                cell = this.tableRows[rowId].insertCell();
                // TODO look at CSS and see if all these nested divs are really necessary
                p = $("<div>").addClass('p').appendTo(cell);
                q = $("<div>").addClass('q').appendTo(p);
                r = $("<div>").addClass('r').appendTo(q);
                $("<div>").addClass('s').appendTo(q).text(this.uniqueValues[rowId]);
                this.checkboxes[rowId] = $("<input type='checkbox'>")
                    .attr('name', cboxName).appendTo(r)[0];
            });
            Dragboxes.initTable(this.filteringTable);
        }


        // Returns true if any of the checkboxes show a different state than when this function was
        // last called
        anyCheckboxesChangedSinceLastInquiry():boolean {
            this.anyCheckboxesChecked = false;
            var changed = false;
            var currentCheckboxState:any = {};

            $.each(this.checkboxes, (rowId, checkbox) => {
                var current, previous;
                current = (checkbox.checked && !checkbox.disabled) ? 'C' : 'U';
                previous = this.previousCheckboxState[rowId] || 'N';
                if (current !== previous) changed = true;
                if (current === 'C') this.anyCheckboxesChecked = true;
                currentCheckboxState[rowId] = current;
            });

            if (this.gotFirstFocus) {
                var v = $(this.searchBoxElement).val();
                v = v.trim();                // Remove leading and trailing whitespace
                v = v.toLowerCase();
                v = v.replace(/\s\s*/, ' '); // Replace internal whitespace with single spaces
                this.currentSearchSelection = v;
                if (v !== this.previousSearchSelection) {
                    this.previousSearchSelection = v;
                    changed = true;
                }
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


        applyProgressiveFiltering(ids:any[]):any {

            // If the filter only contains one item, it's pointless to apply it.
            if (!this.isFilterUseful()) {
                return ids;
            }

            var useSearchBox:boolean = false;
            var v = this.currentSearchSelection;
            var queryStrs = [];
            if ((v != null) && this.gotFirstFocus) {
                if (v.length >= this.minCharsToTriggerSearch) {
                    useSearchBox = true;
                    // If there are multiple words, we match each separately.
                    // We will not attempt to match against empty strings, so we filter those out if
                    // any slipped through
                    queryStrs = v.split(' ').filter((one) => { return one.length > 0; });
                }
            }

            var valuesVisiblePreFiltering = {};
            var idsPostFiltering = [];

            for (var i=0; i<ids.length; i++) {
                var id = ids[i];
                var valueIndexes = this.filterHash[id];
                var keepThisID:boolean = false;

                if (valueIndexes instanceof Array) {
                    for (var k=0; k < valueIndexes.length; k++) {
                        var match:boolean = true;
                        if (useSearchBox) {
                            var text = this.uniqueValues[valueIndexes[k]].toLowerCase();
                            match = queryStrs.some((v) => {
                                return text.length >= v.length && text.indexOf(v) >= 0;
                            });
                        }
                        if (match) {
                            valuesVisiblePreFiltering[valueIndexes[k]] = 1;
                            // The "previous" checkbox state is equivalent to the current when this
                            // function is called
                            if ((this.previousCheckboxState[valueIndexes[k]] == 'C') ||
                                    !this.anyCheckboxesChecked) {
                                // Can't just do the push here - might end up pushing several times
                                keepThisID = true;
                            }
                        }
                    }
                } else {
                    var match:boolean = true;
                    if (useSearchBox) {
                        var text = this.uniqueValues[valueIndexes].toLowerCase();
                        match = queryStrs.some((v) => {
                            return text.length >= v.length && text.indexOf(v) >= 0;
                        });
                    }
                    if (match) {
                        valuesVisiblePreFiltering[valueIndexes] = 1;
                        if ((this.previousCheckboxState[valueIndexes] == 'C') ||
                                !this.anyCheckboxesChecked) {
                            keepThisID = true;
                        }
                    }
                }

                // If this ID actually matched a _selected_ criteria, keep it for the next round.
                if (keepThisID) {
                    idsPostFiltering.push(id);
                }
            }

            var rowsToAppend = [];
            for (var j=0; j<this.uniqueValuesOrder.length; j++) {
                var crID = this.uniqueValuesOrder[j];

                var checkBox = this.checkboxes[crID];
                var checkBoxRow = this.tableRows[crID];

                if (valuesVisiblePreFiltering[crID]) {
                    $(checkBoxRow).removeClass('nodata');
                    checkBox.disabled = false;
                    this.tableBodyElement.appendChild(checkBoxRow);
                } else {
                    $(checkBoxRow).addClass('nodata');
                    checkBox.disabled = true;
                    rowsToAppend.push(checkBoxRow);
                }
            }
            // Now, (re)append all the rows we disabled, so they go to the bottom of the table
            for (var j=0; j < rowsToAppend.length; j++) {
                this.tableBodyElement.appendChild(rowsToAppend[j]);
            }
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
        _assayIdToProtocol(assayId:string) {
            var assay = this._assayIdToAssay(assayId);
            if (assay) return EDDData.Protocols[assay.pid];
            return undefined;
        }
    }



    export class StrainFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Strain';
            this.sectionShortLabel = 'st';
        }


        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                this.filterHash[assayId] = this.filterHash[assayId] || [];
                // assign unique ID to every encountered strain name
                (line.strain || []).forEach((strainId:string) => {
                    var strain = EDDData.Strains[strainId];
                    if (strain && strain.name) {
                        uniqueNamesId[strain.name] = uniqueNamesId[strain.name] || ++unique;
                        this.filterHash[assayId].push(uniqueNamesId[strain.name]);
                    }
                });
            });
            return uniqueNamesId;
        }
    }



    export class CarbonSourceFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Carbon Source';
            this.sectionShortLabel = 'cs';
        }


        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                // assign unique ID to every encountered carbon source name
                (line.carbon || []).forEach((carbonId:string) => {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.carbon) {
                        uniqueNamesId[src.carbon] = uniqueNamesId[src.carbon] || ++unique;
                        this.filterHash[assayId].push(uniqueNamesId[src.carbon]);
                    }
                });
            });
            return uniqueNamesId;
        }
    }



    export class CarbonLabelingFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Labeling';
            this.sectionShortLabel = 'l';
        }


        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                // assign unique ID to every encountered carbon source labeling description
                (line.carbon || []).forEach((carbonId:string) => {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.labeling) {
                        uniqueNamesId[src.labeling] = uniqueNamesId[src.labeling] || ++unique;
                        this.filterHash[assayId].push(uniqueNamesId[src.labeling]);
                    }
                });
            });
            return uniqueNamesId;
        }
    }



    export class LineNameFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Line';
            this.sectionShortLabel = 'ln';
        }


        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {};
                if (line.name) {
                    uniqueNamesId[line.name] = uniqueNamesId[line.name] || ++unique;
                    this.filterHash[assayId] = uniqueNamesId[line.name];
                }
            });
            return uniqueNamesId;
        }
    }



    export class ProtocolFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Protocol';
            this.sectionShortLabel = 'p';
        }


        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var protocol = this._assayIdToProtocol(assayId) || {};
                if (protocol.name) {
                    uniqueNamesId[protocol.name] = uniqueNamesId[protocol.name] || ++unique;
                    this.filterHash[assayId] = uniqueNamesId[protocol.name];
                }
            });
            return uniqueNamesId;
        }
    }



    export class AssaySuffixFilterSection extends GenericFilterSection {
        configure():void {
            this.sectionTitle = 'Assay Suffix';
            this.sectionShortLabel = 'a';
        }


        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var assay = this._assayIdToAssay(assayId) || {};
                if (assay.an) {
                    uniqueNamesId[assay.an] = uniqueNamesId[assay.an] || ++unique;
                    this.filterHash[assayId] = uniqueNamesId[assay.an];
                }
            });
            return uniqueNamesId;
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

        buildUniqueValuesHash(ids:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var line:any = this._assayIdToLine(assayId) || {}, value = '(Empty)';
                if (line.meta && line.meta[this.metaDataID]) {
                    value = [ this.pre, line.meta[this.metaDataID], this.post ].join(' ').trim();
                    uniqueNamesId[value] = uniqueNamesId[value] || ++unique;
                    this.filterHash[assayId] = uniqueNamesId[value];
                }
            });
            return uniqueNamesId;
        }
    }



    export class AssayMetaDataFilterSection extends MetaDataFilterSection {

        buildUniqueValuesHash(ids:any):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            ids.forEach((assayId:string) => {
                var assay:any = this._assayIdToAssay(assayId) || {}, value = '(Empty)';
                if (assay.meta && assay.meta[this.metaDataID]) {
                    value = [ this.pre, assay.meta[this.metaDataID], this.post ].join(' ').trim();
                    uniqueNamesId[value] = uniqueNamesId[value] || ++unique;
                    this.filterHash[assayId] = uniqueNamesId[value];
                }
            });
            return uniqueNamesId;
        }
    }



    export class MetaboliteCompartmentFilterSection extends GenericFilterSection {
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        configure():void {
            this.sectionTitle = 'Compartment';
            this.sectionShortLabel = 'com';
        }


        buildUniqueValuesHash(amIDs:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {}, value:any;
                value = EDDData.MeasurementTypeCompartments[measure.compartment] || {};
                if (value && value.name) {
                    uniqueNamesId[value.name] = uniqueNamesId[value.name] || ++unique;
                    this.filterHash[measureId] = uniqueNamesId[value.name];
                }
            });
            return uniqueNamesId;
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
        isFilterUseful():boolean {
            return this.loadPending || this.uniqueValuesOrder.length > 1;
        }


        buildUniqueValuesHash(amIDs:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {}, metabolite:any;
                if (measure && measure.type) {
                    metabolite = EDDData.MetaboliteTypes[measure.type] || {};
                    if (metabolite && metabolite.name) {
                        uniqueNamesId[metabolite.name] = uniqueNamesId[metabolite.name] || ++unique;
                        this.filterHash[measureId] = uniqueNamesId[metabolite.name];
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
            return uniqueNamesId;
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
            return this.loadPending || this.uniqueValuesOrder.length > 1;
        }


        buildUniqueValuesHash(amIDs:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {}, protein:any;
                if (measure && measure.type) {
                    protein = EDDData.ProteinTypes[measure.type] || {};
                    if (protein && protein.name) {
                        uniqueNamesId[protein.name] = uniqueNamesId[protein.name] || ++unique;
                        this.filterHash[measureId] = uniqueNamesId[protein.name];
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
            return uniqueNamesId;
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
            return this.loadPending || this.uniqueValuesOrder.length > 1;
        }


        buildUniqueValuesHash(amIDs:any[]):any {
            var uniqueNamesId:ValueToUniqueID = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach((measureId:string) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {}, gene:any;
                if (measure && measure.type) {
                    gene = EDDData.GeneTypes[measure.type] || {};
                    if (gene && gene.name) {
                        uniqueNamesId[gene.name] = uniqueNamesId[gene.name] || ++unique;
                        this.filterHash[measureId] = uniqueNamesId[gene.name];
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
            return uniqueNamesId;
        }
    }



    // Called when the page loads.
    export function prepareIt() {

        this.mainGraphObject = null;

        this.allFilteringWidgets = [];
        this.assayFilteringWidgets = [];
        this.metaboliteFilteringWidgets = [];
        this.metaboliteDataProcessed = false;
        this.proteinFilteringWidgets = [];
        this.proteinDataProcessed = false;
        this.geneFilteringWidgets = [];
        this.geneDataProcessed = false;

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
            'url': 'edddata',
            'type': 'GET',
            'error': (xhr, status, e) => {
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': (data) => {
                EDDData = $.extend(EDDData || {}, data);
                this.prepareFilteringSection();
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
                        this.assaysDataGridSpecs[id] = spec = new DataGridSpecAssays(id);
                        this.assaysDataGrids[id] = new DataGridAssays(spec);
                    }
                });
            }
        });
    }


    // Read through the Lines, Assays, and AssayMeasurements data and prepare a secondary data
    // structure for filtering according to unique criteria, then remake the filtering section under
    // the main graph area with columns of labeled checkboxes.
    export function prepareFilteringSection() {

        var MetaDataTypesRelevantForLines = [];
        var MetaDataTypesRelevantForAssays = [];

        var seenInLinesHash:any = {};
        var seenInAssaysHash:any = {};

        var haveMetabolomics:boolean = false;
        var haveTranscriptomics:boolean = false;
        var haveProteomics:boolean = false;

        var aIDsToUse = [];
        // First do some basic sanity filtering on the list
        $.each(EDDData.Assays, (assayId, assay) => {
            var line = EDDData.Lines[assay.lid];
            if (assay.dis || !line || !line.active) return;
            aIDsToUse.push(assayId);
            if (assay.metabolites && assay.metabolites.length) haveMetabolomics = true;
            if (assay.transcriptions && assay.transcriptions.length) haveTranscriptomics = true;
            if (assay.proteins && assay.proteins.length) haveProteomics = true;
            $.each(assay.md || [], (metadataId) => { seenInAssaysHash[metadataId] = 1; });
            $.each(line.md || [], (metadataId) => { seenInLinesHash[metadataId] = 1; });
        });
        // MetaDataTypeIDs should come alpha-sorted by name, store used IDs in same order
        $.each(EDDData.MetaDataTypeIDs, (i, metadataId) => {
            if (seenInLinesHash[metadataId]) MetaDataTypesRelevantForLines.push(metadataId);
            if (seenInAssaysHash[metadataId]) MetaDataTypesRelevantForAssays.push(metadataId);
        });
        // Create filters on assay tables
        // TODO media is now a metadata type, strain and carbon source should be too
        var assayFilters = [];
        assayFilters.push(new StrainFilterSection());
        assayFilters.push(new CarbonSourceFilterSection());
        assayFilters.push(new CarbonLabelingFilterSection());
        $.each(MetaDataTypesRelevantForLines, (i, typeId) => {
            assayFilters.push(new LineMetaDataFilterSection(typeId));
        });
        assayFilters.push(new LineNameFilterSection());
        assayFilters.push(new ProtocolFilterSection());
        assayFilters.push(new AssaySuffixFilterSection());
        $.each(MetaDataTypesRelevantForAssays, (i, typeId) => {
            assayFilters.push(new AssayMetaDataFilterSection(typeId));
        });

        // We can initialize all the Assay- and Line-level filters immediately
        this.assayFilteringWidgets = $.each(assayFilters, (i, filter) => {
            filter.processFilteringData(aIDsToUse);
            filter.populateTable();
        });

        this.metaboliteFilteringWidgets = [];
        // Only create these filters if we have a nonzero count for metabolics measurements
        if (haveMetabolomics) {
            this.metaboliteFilteringWidgets.push(new MetaboliteCompartmentFilterSection());
            this.metaboliteFilteringWidgets.push(new MetaboliteFilterSection());
        }

        this.proteinFilteringWidgets = [];
        if (haveProteomics) {
            this.proteinFilteringWidgets.push(new ProteinFilterSection());
        }

        this.geneFilteringWidgets = [];
        if (haveTranscriptomics) {
            this.geneFilteringWidgets.push(new GeneFilterSection());
        }

        this.allFilteringWidgets = assayFilters.concat(
            this.metaboliteFilteringWidgets,
            this.proteinFilteringWidgets,
            this.geneFilteringWidgets
        );
        this.repopulateFilteringSection();
    }


    // Clear out any old fitlers in the filtering section, and add in the ones that
    // claim to be "useful".
    export function repopulateFilteringSection() {
        // Clear out the old filtering UI
        var mainFilter = $('#mainFilterSection').empty();
        var table = $('<div>').addClass('filterTable').appendTo(mainFilter);
        $.each(this.allFilteringWidgets, (i, widget) => {
            if (widget.isFilterUseful()) {
                widget.addToParent(table[0]);
                widget.applyBackgroundStyle(i % 2 === 1);
            }
        });
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


    function filterTableKeyDown(context, e) {
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
                context.queueMainGraphRemake();
        }
    }


    // Called by DataGrid after the Lines table is rendered
    export function prepareAfterLinesTable() {

        // Prepare the main data overview graph at the top of the page
        if (this.mainGraphObject === null && $('#maingraph').size() === 1) {
            this.mainGraphObject = Object.create(StudyDGraphing);
            this.mainGraphObject.Setup('maingraph');
        }

        $('#mainFilterSection').on('mouseover mousedown mouseup', () => this.queueMainGraphRemake())
                .on('keydown', (e) => filterTableKeyDown(this, e));
        $('#separateAxesCheckbox').on('change', () => this.queueMainGraphRemake(true));
        $('#assaysSection').on('mouseover mousedown mouseup',
                () => this.queueAssaysActionPanelShow());

        // Read in the initial set of Carbon Source selections, if any, and create the proper
        // number of table row elements.

        this.cSourceEntries = [];
        var csIDs = [0];
        $('#initialcarbonsources').each((i, element) => {
            var v = $(element).val();
            if (v.length) csIDs = v.split(',');
        });
        $.each(csIDs, (i, sourceId) => this.addCarbonSourceRow(sourceId));

        this.mTypeEntries = [];
        this.addMetaboliteRow();

        // Initialize the description edit fields.
        this.initDescriptionEditFields();

        // Hacky button for changing the metabolic map
        $("#metabolicMapName").click( () => this.onClickedMetabolicMapName() );

        requestAllMetaboliteData(this);
    }


    function requestAllMetaboliteData(context) {
        $.ajax({
            url: 'measurements',
            type: 'GET',
            dataType: "json",
            error: (xhr, status) => {
                console.log('Failed to fetch measurement data!');
                console.log(status);
            },
            success: (data) => { processMeasurementData(context, data); }
        });
    }


    function processMeasurementData(context, data) {
        var assaySeen = {}, filterIds = { 'm': [], 'p': [], 'g': [] }, protocolToAssay = {};
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);
        // loop over all downloaded measurements
        $.each(data.data, (index, measurement) => {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            if (!assay || assay.dis) return;
            line = EDDData.Lines[assay.lid];
            if (!line || !line.active) return;
            // store the measurements
            EDDData.AssayMeasurements[measurement.id] = measurement;
            // track which assays received updated measurements
            assaySeen[assay.id] = true;
            protocolToAssay[assay.pid] = protocolToAssay[assay.pid] || {};
            protocolToAssay[assay.pid][assay.id] = true;
            // handle measurement data based on type
            mtype = data.types[measurement.type] || {};
            if (mtype.family === 'm') { // measurement is of metabolite
                (assay.metabolites = assay.metabolites || []).push(measurement.id);
                filterIds.m.push(measurement.id);
            } else if (mtype.family === 'p') { // measurement is of protein
                (assay.proteins = assay.proteins || []).push(measurement.id);
                filterIds.p.push(measurement.id);
            } else if (mtype.family === 'g') { // measurement is of gene / transcript
                (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
                filterIds.g.push(measurement.id);
            }
        });
        $.each(context.metaboliteFilteringWidgets, (i, widget) => {
            widget.processFilteringData(filterIds.m);
            widget.populateTable();
        });
        $.each(context.proteinFilteringWidgets, (i, widget) => {
            widget.processFilteringData(filterIds.p);
            widget.populateTable();
        });
        $.each(context.geneFilteringWidgets, (i, widget) => {
            widget.processFilteringData(filterIds.g);
            widget.populateTable();
        });
        context.repopulateFilteringSection();
        context.metaboliteDataProcessed = true;
        context.proteinDataProcessed = true;
        context.geneDataProcessed = true;
        // invalidate assays on all DataGrids; I think this means they are initially hidden?
        $.each(context.assaysDataGrids, (protocolId, dataGrid) => {
            dataGrid.invalidateAssayRecords(Object.keys(protocolToAssay[protocolId] || {}));
        });
        context.linesDataGridSpec.enableCarbonBalanceWidget(true);
        context.processCarbonBalanceData();
        context.queueMainGraphRemake();
    }


    export function carbonBalanceColumnRevealedCallback(index:any, spec:DataGridSpecLines,
            dataGridObj:DataGrid) {
        StudyD.rebuildCarbonBalanceGraphs(index);
    }


    // Start a timer to wait before calling the routine that shows the actions panel.
    export function queueLinesActionPanelShow() {
        if (this.linesActionPanelRefreshTimer) {
            clearTimeout (this.linesActionPanelRefreshTimer);
        }
        this.linesActionPanelRefreshTimer = setTimeout(() => linesActionPanelShow(this), 150);
    }


    function linesActionPanelShow(context) {
        // Figure out how many lines are selected.
        var checkedBoxes, checkedLen, linesActionPanel;
        if (context.linesDataGrid) {
            checkedBoxes = context.linesDataGrid.getSelectedCheckboxElements();
        } else {
            checkedBoxes = [];
        }
        checkedLen = checkedBoxes.length;
        linesActionPanel = $('#linesActionPanel').toggleClass('off', !checkedLen);
        $('#linesSelectedCell').empty().text(checkedLen + ' selected');
    }


    export function queueAssaysActionPanelShow() {
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        if (this.assaysActionPanelRefreshTimer) {
            clearTimeout(this.assaysActionPanelRefreshTimer);
        }
        this.assaysActionPanelRefreshTimer = setTimeout(() => assaysActionPanelShow(this), 150);
    }


    // TODO: Rewrite using client-side structure and table spec queries
    function assaysActionPanelShow(context) {
        var checkedBoxes = [], checkedAssays, checkedMeasure, panel, infobox;
        panel = $('#assaysActionPanel');
        if (!panel.size()) {
            return;
        }
        // Figure out how many assays/checkboxes are selected.
        $.each(context.assaysDataGrids, (pID, dataGrid) => {
            checkedBoxes = checkedBoxes.concat(dataGrid.getSelectedCheckboxElements());
        });
        checkedAssays = $(checkedBoxes).filter('[id^=assay]').size();
        checkedMeasure = $(checkedBoxes).filter(':not([id^=assay])').size();
        panel.toggleClass('off', !checkedAssays && !checkedMeasure);
        if (checkedAssays || checkedMeasure) {
            infobox = $('#assaysMeasSelectedTD').empty();
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
        this.mainGraphRefreshTimerID = setTimeout(() => remakeMainGraphArea(this, force), 200);
    }


    function checkRedrawRequired(context:any, force?:boolean):boolean {
        var redraw:boolean = false;
        // do not redraw if graph is not initialized yet
        if (StudyDGraphing && context.mainGraphObject) {
            redraw = !!force;
            // Walk down the filter widget list.  If we encounter one whose collective checkbox
            // state has changed since we last made this walk, then a redraw is required. Note that
            // we should not skip this loop, even if we already know a redraw is required, since the
            // call to anyCheckboxesChangedSinceLastInquiry sets internal state in the filter
            // widgets that we will use next time around.
            // TODO this should be an event handler
            $.each(context.allFilteringWidgets, (i, filter) => {
                if (filter.anyCheckboxesChangedSinceLastInquiry()) {
                    redraw = true;
                }
            });
        }
        return redraw;
    }


    function buildGraphAssayIDSet(context:any):any[] {
        var previousIDSet:any[] = [];
        // The next loop is designed to progressively hide rows in the criteria lists in the
        // filtering section of the page, based on the selections in the previous criteria list. We
        // start with all the non-disabled Assay IDs in the Study. With each pass through the loop
        // below we will narrow this set down, until we get to the per-measurement filters, which
        // will just use the set and return it unaltered.
        $.each(EDDData.Assays, (assayId, assay) => {
            var line = EDDData.Lines[assay.lid];
            if (assay.dis || !line || !line.active) return;
            previousIDSet.push(assayId);

        });
        $.each(context.assayFilteringWidgets, (i, filter) => {
            previousIDSet = filter.applyProgressiveFiltering(previousIDSet);
        });
        return previousIDSet;
    }


    function buildFilteredMeasurements(context:any, previousIDSet:any[]):any[] {
        var measurements:any[] = [], widgetFilter = (i, filter) => {
            measurements = filter.applyProgressiveFiltering(measurements);
        };
        $.each(previousIDSet, (i, assayId) => {
            var assay = EDDData.Assays[assayId];
            if (context.metaboliteDataProcessed) {
                $.merge(measurements, assay.metabolites || []);
            }
            if (context.proteinDataProcessed) {
                $.merge(measurements, assay.proteins || []);
            }
            if (context.geneDataProcessed) {
                $.merge(measurements, assay.transcriptions || []);
            }
        });
        if (context.metaboliteDataProcessed) {
            $.each(context.metaboliteFilteringWidgets, widgetFilter);
        }
        if (context.proteinDataProcessed) {
            $.each(context.proteinFilteringWidgets, widgetFilter);
        }
        if (context.geneDataProcessed) {
            $.each(context.geneFilteringWidgets, widgetFilter);
        }
        return measurements;
    }


    function remakeMainGraphArea(context:any, force?:boolean) {
        var previousIDSet:any[], postFilteringMeasurements:any[],
            dataPointsDisplayed = 0,
            dataPointsTotal = 0,
            separateAxes = $('#separateAxesCheckbox').prop('checked');
        context.mainGraphRefreshTimerID = 0;
        if (!checkRedrawRequired(context, force)) {
            return;
        }
        // Start out with a blank graph.  We will re-add all the relevant sets.
        context.mainGraphObject.clearAllSets();
        previousIDSet = buildGraphAssayIDSet(context);
        postFilteringMeasurements = buildFilteredMeasurements(context, previousIDSet);

        $.each(postFilteringMeasurements, (i, measurementId) => {
            var measurement = EDDData.AssayMeasurements[measurementId],
                points = (measurement.d ? measurement.d.length : 0),
                assay, line, protocol, newSet;
            dataPointsTotal += points;
            if (dataPointsDisplayed > 15000) {
                return; // Skip the rest if we've hit our limit
            }
            dataPointsDisplayed += points;
            assay = EDDData.Assays[measurement.assay] || {};
            line = EDDData.Lines[assay.lid] || {};
            protocol = EDDData.Protocols[assay.pid] || {};
            newSet = {
                'label': 'dt' + measurementId,
                'measurementname': Utl.EDD.resolveMeasurementRecordToName(measurement),
                'name': [line.name, protocol.name, assay.an].join('-'),
                'units': Utl.EDD.resolveMeasurementRecordToUnits(measurement),
                'data': measurement.d
            };
            if (measurement.mtdf) newSet.logscale = 1;
            if (line.control) newSet.iscontrol = 1;
            if (separateAxes) {
                // If the measurement is a metabolite, choose the axis by type. If it's any
                // other subtype, choose the axis based on that subtype, with an offset to avoid
                // colliding with the metabolite axes.
                if (measurement.mst === 1) {
                    newSet.yaxisByMeasurementTypeID = measurement.mt;
                } else {
                    newSet.yaxisByMeasurementTypeID = measurement.mst - 10;
                }
            }
            context.mainGraphObject.addNewSet(newSet);
        });

        var displayText = dataPointsDisplayed + " points displayed";
        if (dataPointsDisplayed != dataPointsTotal) {
            displayText += " (out of " + dataPointsTotal + ")";
        }
        $('#pointsDisplayedSpan').empty().text(displayText);

        context.mainGraphObject.drawSets();
    }


    export function addCarbonSourceRow(v) {

        // Search for an old row that's been disabled, and if we find one,
        // re-enable it and stick it on the end of the array.
        var turnedOffIndex = -1;
        for (var j=0; j < this.cSourceEntries.length; j++) {

            if (this.cSourceEntries[j].disabled == true) {
                turnedOffIndex = j;
                break;
            }
        }

        if (turnedOffIndex > -1) {
    
            var toAdd = this.cSourceEntries.splice(turnedOffIndex, 1);
            toAdd[0].disabled = false;
            if (v) {
                toAdd[0].hiddeninput.value = v;
            }
            toAdd[0].input.autocompleter.setFromHiddenElement();
            this.cSourceEntries.push(toAdd[0]);
    
        } else {

            var firstRow = false;
            // If this is the first row we're creating, we create it a little differently
            if (this.cSourceEntries.length == 0) {
                firstRow = true;
            }
            var order = this.cSourceEntries.length;

            var rtr = document.createElement("tr");
            rtr.className = "multientrybuttonrow";

            var rtd = document.createElement("td");
            if (firstRow) {
                rtd.innerHTML = '<input type="checkbox" id="lineCSCheckbox" class="off" ' +
                        'name="lineCSCheckbox" value="1" />';
            }
            rtr.appendChild(rtd);

            rtd = document.createElement("td");
            rtr.appendChild(rtd);
            if (firstRow) {
                var aL = document.createElement("label");
                aL.setAttribute('for', "lineCSCheckbox");
                rtd.appendChild(aL);

                var p = document.createElement("p");
                aL.appendChild(p);

                p.appendChild(document.createTextNode("Carbon Source(s):"));
            }        
        
            rtd = document.createElement("td");
            rtr.appendChild(rtd);

            var aCI = document.createElement("input");
            aCI.setAttribute('type', "text");
            aCI.setAttribute('id', "linecs" + order);
            aCI.setAttribute('name', "linecs" + order);
            aCI.setAttribute('autocomplete', "off");
            aCI.setAttribute('autocompletetype', "carbonsource");
            aCI.setAttribute('autocompletevalue', "linecsvalue" + order);
            aCI.setAttribute('size', "61");
            aCI.className = "autocomplete";
            aCI.style.marginRight = "2px";
            rtd.appendChild(aCI);

            var aCHI = document.createElement("input");
            aCHI.setAttribute('type', "hidden");
            aCHI.setAttribute('id', "linecsvalue" + order);
            aCHI.setAttribute('name', "linecsvalue" + order);
            aCHI.setAttribute('value', v);
            rtd.appendChild(aCHI);

            rtd = document.createElement("td");
            rtr.appendChild(rtd);

            var buttonSpan = document.createElement("div");
            buttonSpan.className = "multientrybutton";
            rtd.appendChild(buttonSpan);

            if (firstRow) {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "images/plus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.addCarbonSourceRow();";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);
            } else {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "images/minus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.removeCarbonSourceRow(" + order + ");";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);        
            }
        
            var newRowRecord = {
                row: rtr,
                input: aCI,
                hiddeninput: aCHI,
                label: order,
                initialized: false,
                disabled: false
            };

            this.cSourceEntries.push(newRowRecord);
        }

        this.redrawCarbonSourceRows();
    }


    export function removeCarbonSourceRow(order) {
        for (var j=0; j < this.cSourceEntries.length; j++) {
            if (this.cSourceEntries[j].label == order) {
                this.cSourceEntries[j].disabled = true;
                break;
            }
        }
        this.redrawCarbonSourceRows();
    }


    export function disableAllButFirstCarbonSourceRow() {
        for (var j=1; j < this.cSourceEntries.length; j++) {
            this.cSourceEntries[j].disabled = true;
        }
        this.redrawCarbonSourceRows();
    }


    export function redrawCarbonSourceRows() {
        var carbonSourceTableBody = <any>document.getElementById("carbonSourceTableBody");
        if (!carbonSourceTableBody)
            return;

        while (carbonSourceTableBody.firstChild) {
            carbonSourceTableBody.removeChild(carbonSourceTableBody.firstChild);
        }

        for (var j=0; j < this.cSourceEntries.length; j++) {
            if (this.cSourceEntries[j].disabled == false) {
                carbonSourceTableBody.appendChild(this.cSourceEntries[j].row);
                if (this.cSourceEntries[j].initialized == false) {
                    this.cSourceEntries[j].initialized = true;
                    EDDAutoComplete.initializeElement(this.cSourceEntries[j].input);
                }
            }
        }
    }


    export function editLine(linkelement, index) {

        var record = EDDData.Lines[index];
    
        if (!record) {
            console.log('Invalid record for editing: ' + index);
            return;
        }

        // Create a mapping from the JSON record to the form elements
        var formInfo = {
            lineidtoedit: index,
            linename: record.name,
            lineiscontrol: record.control,
            linestrainvalue: record.strain,
            lineexperimentervalue: record.experimenter,
            linecontact: record.contact
        };

        // Run through the collection of metadata, and add a form element entry for each
        for (var i in record.md) {
            var v = record.md[i];
            var field = "linemeta" + i;
            var cbfield = "linemeta" + i + "include";
            formInfo[field] = v;
            formInfo[cbfield] = 1;
        }

        var cs = record.cs;    // We need to do something special with the Carbon Sources array

        // Either show just enough carbon source boxes for the entry in question,
        // or if there is no carbon source set, show one box (which will be defaulted to blank)
        var sourcesToShow = 1;
        if (cs.length > 1) {
            sourcesToShow = cs.length;
        }

        this.disableAllButFirstCarbonSourceRow();
        for (var i:any=1; i < sourcesToShow; i++) {
            this.addCarbonSourceRow(0);
        }

        // Run through the set of carbon sources, creating a form entry for each
        for (var i:any=0; i < cs.length; i++) {
            var c = cs[i];
            var field = "linecsvalue" + this.cSourceEntries[i].label;
            formInfo[field] = c;
        }

        // TODO: WHY IS THIS TAKING GIGANTIC HARDCODED STRINGS
        EDDEdit.prepareForm(formInfo, 'lineMain,editLineBanner,lineNameRow,editLineButtons',
                ['addNewLineShow','addNewLineBanner','bulkEditLineBanner','addNewLineButtons',
                 'bulkEditLineButtons','lineStrainCheckbox','lineMediaCheckbox',
                 'lineControlCheckbox','lineCSCheckbox','lineExpCheckbox','lineContactCheckbox',
                 'importLinesButton'].join(','));
    }


    export function editAssay(linkelement, index) {

        var record = EDDData.Assays[index];
    
        if (!record) {
            console.log('Invalid record for editing: ' + index);
            return;
        }

        // Create a mapping from the JSON record to the form elements
        var formInfo = {
            assayidtoedit: index,
            assayname: record.an,
            assayprotocol: record.pid,
            assaydescription: record.des,
            assayexperimentervalue: record.exp,
        };
        // Set the checkbox of the Line this Assay belongs to
        formInfo['line'+record.lid+'include'] = 1;

        EDDEdit.prepareForm(formInfo, 'studyLinesTable,assayMain,editAssayBanner,editAssayButtons',
                'addNewAssayCover,newAssayBanner,newAssayButtons');
    }


    export function addMetaboliteRow() {

        // Search for an old row that's been disabled, and if we find one,
        // re-enable it and stick it on the end of the array.
        var turnedOffIndex = -1;
        for (var j=0; j < this.mTypeEntries.length; j++) {

            if (this.mTypeEntries[j].disabled == true) {
                turnedOffIndex = j;
                break;
            }
        }

        if (turnedOffIndex > -1) {
    
            var toAddArray = this.mTypeEntries.splice(turnedOffIndex, 1);
            var toAdd = toAddArray[0];
            toAdd.disabled = false;
            this.mTypeEntries.push(toAdd);
    
        } else {

            var firstRow = false;
            // If this is the first row we're creating, we create it a little differently
            if (this.mTypeEntries.length == 0) {
                firstRow = true;
            }
            var order = this.mTypeEntries.length;

            var rtr = document.createElement("tr");
            rtr.className = "multientrybuttonrow";

            var aTD = document.createElement("td");
            rtr.appendChild(aTD);
            if (firstRow) {
                var p = document.createElement("p");
                aTD.appendChild(p);

                p.appendChild(document.createTextNode("Metabolite Type(s):"));
            }        

            var mQAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
                    "measurementcompartment", 4, "assaycomp" + order, '', 0);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            mQAutocomplete.inputElement.style.marginRight = "2px";
            aTD.appendChild(mQAutocomplete.inputElement);
            aTD.appendChild(mQAutocomplete.hiddenInputElement);

            var mTypeAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
                    "metabolite", 45, "assaymt" + order, '', 0);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            mTypeAutocomplete.inputElement.style.marginRight = "2px";
            aTD.appendChild(mTypeAutocomplete.inputElement);
            aTD.appendChild(mTypeAutocomplete.hiddenInputElement);

            var unitsAutocomplete = EDDAutoComplete.createAutoCompleteContainer(
                    "units", 15, "assayunits" + order, '', 0);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            aTD.appendChild(unitsAutocomplete.inputElement);
            aTD.appendChild(unitsAutocomplete.hiddenInputElement);

            aTD = document.createElement("td");
            rtr.appendChild(aTD);

            var buttonSpan = document.createElement("div");
            buttonSpan.className = "multientrybutton";
            aTD.appendChild(buttonSpan);

            if (firstRow) {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "images/plus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.addMetaboliteRow();";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);
            } else {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "images/minus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.removeMeasurementTypeRow(" + order + ");";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);        
            }
        
            var newRowRecord = {
                row: rtr,
                mQAutocomplete: mQAutocomplete,
                mTypeAutocomplete: mTypeAutocomplete,
                unitsAutocomplete: unitsAutocomplete,
                label: order,
                initialized: false,
                disabled: false
            };

            this.mTypeEntries.push(newRowRecord);
        }

        this.redrawMeasurementTypeRows();
    }


    export function removeMeasurementTypeRow(order) {
        for (var j=0; j < this.mTypeEntries.length; j++) {
            if (this.mTypeEntries[j].label == order) {
                this.mTypeEntries[j].disabled = true;
                break;
            }
        }
        this.redrawMeasurementTypeRows();
    }


    export function redrawMeasurementTypeRows() {
        var measurementTypeTableBody = <any>document.getElementById("measurementTypeTableBody");
        if (!measurementTypeTableBody)
            return;

        while (measurementTypeTableBody.firstChild) {
            measurementTypeTableBody.removeChild(measurementTypeTableBody.firstChild);
        }

        for (var j=0; j < this.mTypeEntries.length; j++) {
            var mte = this.mTypeEntries[j];
            if (mte.disabled == false) {
                measurementTypeTableBody.appendChild(mte.row);
                if (mte.initialized == false) {
                    mte.initialized = true;
                    EDDAutoComplete.initializeElement(mte.mQAutocomplete.inputElement);
                    mte.mQAutocomplete.initialized = 1;
                    EDDAutoComplete.initializeElement(mte.mTypeAutocomplete.inputElement);
                    mte.mTypeAutocomplete.initialized = 1;
                    EDDAutoComplete.initializeElement(mte.unitsAutocomplete.inputElement);
                    mte.unitsAutocomplete.initialized = 1;
                }
            }
        }
    }


    // This is called by the LiveTextEdit control to set a new description for an attachemnt.
    export function setAttachmentDescription(element, attachmentID, newDescription) {
        // TODO: call correct new URL for update
    }


    // This creates a LiveTextEdit object for each attachment description.
    export function initDescriptionEditFields() {
        this.descriptionEditFields = [];
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
            this.rebuildCarbonBalanceGraphs(5);
        }
    }


    // TODO: Use a special variable in the spec to get the right column object, not a lousy magic
    // index number.
    export function rebuildCarbonBalanceGraphs(columnIndex:number) {
        if (this.carbonBalanceDisplayIsFresh) {
            return;
        }
        // Drop any previously created Carbon Balance SVG elements from the DOM.
        this.carbonBalanceData.removeAllCBGraphs();
        var cellObjs = this.linesDataGrid.getDataCellObjectsForColumnIndex(columnIndex);
         for (var i=0; i < cellObjs.length; i++) {
             var lineID = cellObjs[i].recordID;
            var element = cellObjs[i].cellElement;
            this.carbonBalanceData.createCBGraphForLine(lineID, element);
        }
        this.carbonBalanceDisplayIsFresh = true;
    }


    // They want to select a different metabolic map.
    export function onClickedMetabolicMapName() {
        var callback = (err, metabolicMapID, metabolicMapName, finalBiomass:number) => {
            if ( err == null ) {
                this.metabolicMapID = metabolicMapID;
                this.metabolicMapName = metabolicMapName;
                this.biomassCalculation = finalBiomass;

                this.onChangedMetabolicMap();
            }
        };
        new StudyMetabolicMapChooser(EDDData.currentUserID, EDDData.currentStudyID, false,
                callback);
    }


    // Direct the form to submit to the Study.cgi page
    export function submitToStudy(action) {
        var form = <any>document.getElementById("assaysForm");
        var formAction = <any>document.getElementById("assaysFormActionElement");
        if (!form) {
            console.log('Cannot find assaysForm form!');
            return;
        }
        if (action && !formAction) {
            console.log('Cannot find formAction input to embed action!');
            return;
        } else {
            formAction.value = action;    
        }
        form.action = "Study.cgi";
        form.submit();
    }


    // Direct the Study page to act on Lines with the information submitted
    export function takeLinesAction() {
        var leForm = <any>document.getElementById("assaysForm");
        var leActOn = <any>document.getElementById("actOn");
        var leEARadioButton = <any>document.getElementById("exportlbutton");
        var lePulldown = <any>document.getElementById("exportLinesAs");
        if (!lePulldown || !leEARadioButton || !leForm || !leActOn) {
            console.log("Page elements missing!");
            return;
        }

        if (leEARadioButton.checked) {
            if (lePulldown.value == 'csv') {
                leForm.action = "StudyExport.cgi";
            } else {
                leForm.action = "StudySBMLExport.cgi";
            }
            leForm.submit();
            return;
        }
        leActOn.value = "lines";
        this.submitToStudy('Take Action');
    }


    // Direct the Study page to act on Assays with the information submitted
    export function takeAssaysAction() {
        var leForm = <any>document.getElementById("assaysForm");
        var leActOn = <any>document.getElementById("actOn");
        if (!leForm || !leActOn) {
            return;
        }
        leActOn.value = "assays";
        
        var leEARadioButton = <any>document.getElementById("exportAssaysButton");
        // Direct the form to submit to the StudyExport.cgi page.
        if (leEARadioButton.checked) {
            var assayLevelInput = <HTMLInputElement>document.getElementById("assaylevelElement");
            if (assayLevelInput) {
                assayLevelInput.value = "1";
            }
            leForm.action = "StudyExport.cgi";
            leForm.submit();
            return;
        }
        var leEMRadioButton = <any>document.getElementById("editMeasurementsButton");
        if (leEMRadioButton.checked) {
            leForm.action = "AssayTableDataEdit.cgi";
            leForm.submit();
            return;
        }
        this.submitToStudy('Take Action');
    }
};



// The spec object that will be passed to DataGrid to create the Lines table
class DataGridSpecLines extends DataGridSpecBase {

    metaDataIDsUsedInLines:any;
    groupIDsInOrder:any;
    groupIDsToGroupIndexes:any;
    groupIDsToGroupNames:any;
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
    
    
    private loadLineName(index:any):string {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.name.toUpperCase();
        }
        return '';
    }
    
    
    private loadStrainName(index:any):string {
        // ensure a strain ID exists on line, is a known strain, uppercase first found name or '?'
        var line, strain;
        if ((line = EDDData.Lines[index])) {
            if (line.strain && line.strain.length && (strain = EDDData.Strains[line.strain[0]])) {
                return strain.name.toUpperCase();
            }
        }
        return '?';
    }


    private loadFirstCarbonSource(index:number):any {
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
    
    
    private loadCarbonSource(index:number):string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.carbon.toUpperCase();
        }
        return '?';
    }
    
    
    private loadCarbonSourceLabeling(index:number):string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.labeling.toUpperCase();
        }
        return '?';
    }
    
    
    private loadExperimenterInitials(index:any):string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var line, experimenter;
        if ((line = EDDData.Lines[index])) {
            if ((experimenter = EDDData.Users[line.experimenter])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    }
    
    
    private loadLineModification(index:any):number {
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


    private makeMetaDataSortFunction(id) {
        return (i) => {
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


    generateLineNameCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
        var line = EDDData.Lines[index];
        // TODO get rid of onclick, check that URL for export is OK
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxWithID': (id) => { return 'line' + id + 'include'; },
                'sideMenuItems': [
                    '<a href="#" onclick="StudyD.editLine(this, ' + index + ');">Edit Line</a>',
                    '<a href="export?line=' + index + '">Export Data as CSV/etc</a>'
                ],
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name + (line.ctrl ? '<b class="iscontroldata">C</b>' : '')
            })
        ];
    }


    generateStrainNameCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
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


    generateCarbonSourceCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
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


    generateCarbonSourceLabelingCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
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


    generateCarbonBalanceBlankCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'minWidth': 200
            })
        ];
    }


    generateExperimenterInitialsCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
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


    generateModificationDateCells(gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Lines[index].modified.time)
            })
        ];
    }


    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec:DataGridSpecLines, index:number):DataGridDataCell[] => {
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
        var leftSide:DataGridColumnSpec[] = [
            new DataGridColumnSpec(1, this.generateLineNameCells),
            new DataGridColumnSpec(2, this.generateStrainNameCells),
            new DataGridColumnSpec(3, this.generateCarbonSourceCells),
            new DataGridColumnSpec(4, this.generateCarbonSourceLabelingCells),
            // The Carbon Balance cells are populated by a callback, triggered when first displayed
            new DataGridColumnSpec(5, this.generateCarbonBalanceBlankCells)
        ];

        var metaDataCols:DataGridColumnSpec[] = this.metaDataIDsUsedInLines.map((id, index) => {
            return new DataGridColumnSpec(6 + index, this.makeMetaDataCellsGeneratorFunction(id));
        });

        var rightSide:DataGridColumnSpec[] = [
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
            new DataGridColumnGroupSpec('Carbon Balance', {
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
        return EDDData.LineIDs;
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
        $(linesTable).on('mouseover mousedown mouseup', StudyD.queueLinesActionPanelShow);

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


    applyFilterToIDs(rowIDs:any):any {

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


    initialFormatRowElementsForID(dataRowObjects:any, rowID:any):any {
        if (!EDDData.Lines[rowID].active) {
            for (var r = 0; r < dataRowObjects.length; r++) {
                var rowElement = dataRowObjects[r].getElement();
                rowElement.style.backgroundColor = "#FFC0C0";
            }
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


    constructor(dataGridOwnerObject:any, dataGridSpec:any) {
        super(dataGridOwnerObject, dataGridSpec);
        this.checkboxEnabled = true;
        this.highlighted = false;
    }
    

    createElements(uniqueID:any):void {
        var cbID:string = this.dataGridSpec.tableSpec.id+'CarBal'+uniqueID;
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        cb.className = 'tableControl';
        $(cb).click(this.clickHandler);

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


    clickHandler = (e) => {
        // TODO: Untangle this a bit
        var callback = (err, finalMetabolicMapID, finalMetabolicMapFilename,
                finalBiomass:number) => {
            StudyD.metabolicMapID = finalMetabolicMapID;
            StudyD.metabolicMapName = finalMetabolicMapFilename;
            StudyD.biomassCalculation = finalBiomass;
            StudyD.onChangedMetabolicMap();
        }
        if (this.checkBoxElement.checked) {

            // We need to get a biomass calculation to multiply against OD.
            // Have they set this up yet?
            if (!StudyD.biomassCalculation || StudyD.biomassCalculation == -1 ) {
                this.checkBoxElement.checked = false;
                // Must setup the biomass 
                new FullStudyBiomassUI(EDDData.currentUserID, EDDData.currentStudyID, callback);
            } else {
                this.dataGridOwnerObject.showColumn(5);
            }
        } else {
            this.dataGridOwnerObject.hideColumn(5);
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


    // Start a timer to wait before calling the routine that remakes the graph.
    queueGraphRemake() {
        if ( this.graphRefreshTimerID ) {
            clearTimeout( this.graphRefreshTimerID );
        }
        this.graphRefreshTimerID = setTimeout( () => this.remakeGraphArea(), 100 );
    }


    remakeGraphArea() {
        this.graphRefreshTimerID = 0;    

        if (!StudyDGraphing) {
            return;
        }

        var spec:DataGridSpecAssays = this.getSpec();
        var g = spec.graphObject;
        if (!g) {
            return;
        } 

        g.clearAllSets();

        var ids = spec.getRecordIDs();
        for (var x = 0; x < ids.length; x++) {
            var assayID = ids[x];
            var assayRecord = EDDData.Assays[assayID];
            // We wont display items from disabled Assays on the graph
            if (assayRecord.dis) { continue; }
            var lineID = assayRecord.lid;
            var lineRecord = EDDData.Lines[lineID];
            var pid = assayRecord.pid;
            var fn = [lineRecord.name, EDDData.Protocols[pid].name, assayRecord.an].join('-');

            var mIDs = (assayRecord.metabolites || []);
            mIDs = mIDs.concat(assayRecord.transcriptions || [], assayRecord.proteins || []);

            for (var i=0; i < mIDs.length; i++) {
                var amID = mIDs[i];
                var measurementRecord = EDDData.AssayMeasurements[amID];

                var mName = Utl.EDD.resolveMeasurementRecordToName(measurementRecord);
                var mUnits = Utl.EDD.resolveMeasurementRecordToUnits(measurementRecord);

                var newSet:any = {
                    label: 'dt' + amID,
                    measurementname: mName,
                    name: fn,
                    aid: assayID,
                    mtid: measurementRecord.mt,
                    units: mUnits,
                    data: measurementRecord.d
                };

                if (measurementRecord.mtdf == 1) {
                    newSet.logscale = 1;    // Set a flag for the log10 scale.
                }
                if (lineRecord.ctrl) {
                    newSet.iscontrol = 1;    // Set a flag for drawing as the "control" style.
                }
            
                g.addNewSet(newSet);
            }
        }

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
    assayIDsInProtocol:any[];
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


    refreshIDList() {
        // Find out which protocols have assays with measurements - disabled or no
        this.assayIDsInProtocol = [];
        $.each(EDDData.Assays, (assayId, assay) => {
            var line;
            if (this.protocolID != assay.pid) {
                // skip assays for other protocols
            } else if (!(line = EDDData.Lines[assay.lid]) || !line.active) {
                // skip assays without a valid line or with a disabled line
            } else {
                this.assayIDsInProtocol.push(assayId);
            }
        });
    }


    // An array of unique identifiers, used to identify the records in the data set being displayed
    getRecordIDs() {
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
        $.each(this.getRecordIDs(), (x, assayId) => {
            var assay = EDDData.Assays[assayId];
            $.each(assay.md || {}, (metaId) => { seenHash[metaId] = true; });
        });
        // MetaDataTypeIDs is in alpha-order by name
        $.each(EDDData.MetaDataTypeIDs, (i, metaId) => {
            if (seenHash[metaId]) { this.metaDataIDsUsedInAssays.push(metaId); }
        });
    }


    findMaximumXValueInData():void {
        var maxForAll:number = 0;
        // reduce to find highest value across all records
        maxForAll = this.getRecordIDs().reduce((prev:number, assayId) => {
            var assay = EDDData.Assays[assayId], measures, maxForRecord;
            measures = [].concat(assay.metabolites || [], assay.transcriptions || [],
                    assay.proteins || []);
            // reduce to find highest value across all measures
            maxForRecord = measures.reduce((prev:number, measureId) => {
                var measure = EDDData.AssayMeasurements[measureId], maxForMeasure;
                // reduce to find highest value across all data in measurement
                maxForMeasure = (measure.d || []).reduce((prev:number, point) => {
                    return Math.max(prev, parseFloat(point[0]));
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
                return [line.n, this.protocolName, assay.an].join('-').toUpperCase();
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
            if (record && record.md) {
                return record.md[id] || '';
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


    generateAssayNameCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
        var record = EDDData.Assays[index];
        var line = EDDData.Lines[record.lid];
        // TODO get rid of onclick, check export URL
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxWithID': (id) => { return 'assay' + id + 'include'; },
                'sideMenuItems': [
                    '<a href="#" onclick="StudyD.editAssay(this, ' + index + ');">Edit Assay</a>',
                    '<a href="export?selectedAssayIDs=' + index + '">Export Data as CSV/etc</a>'
                ],
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                // In a typical EDDData.Assays record this string is currently pre-assembled and
                // stored in 'fn'. But we're not relying on that for now.
                'contentString': [line.name, gridSpec.protocolName, record.an].join('-')
            })
        ];
    }


    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] => {
            var contentStr = '', assay = EDDData.Assays[index], type = EDDData.MetaDataTypes[id];
            if (assay && type && assay.md && (contentStr = assay.md[id] || '')) {
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


    generateMeasurementNameCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
        var aRecord = EDDData.Assays[index];
        var cells;
        // If the number of IDs is different from the count, we most likely haven't fetched full
        // measurement records yet.  So we should just declare a single row that is "waiting".
        var mIDs = (aRecord.metabolites || []);
        if (mIDs.length != aRecord.met_c) {
            cells = [
                new DataGridDataCell(gridSpec, index, {
                    'contentString': '<span style="color:gray;">Loading...</span>'
                })
            ];
        } else {
            var resolvedNames = {};
            mIDs.forEach((measureId) => {
                var measure:any = EDDData.AssayMeasurements[measureId] || {},
                    mtype:any = EDDData.MeasurementTypes[measure.type] || {};
                resolvedNames[measureId] = mtype.name || '';
            });
            mIDs.sort(function(a:any,b:any) {
                a = resolvedNames[a].toLowerCase();
                b = resolvedNames[b].toLowerCase();
                return (<any>(a > b) - <any>(b > a));
            });
            cells = mIDs.map((mID, i) => {
                return new DataGridDataCell(gridSpec, index, {
                    'hoverEffect': true,
                    'checkboxWithID': (id) => { return 'measurement' + mID + 'include'; },
                    'contentString': resolvedNames[mID]
                });
            });
        }
        // Transcriptomics and proteomics each get single aggregate cells.
        if (aRecord.tra_c) {
            var tIDs = (aRecord.transcriptions || []);
            if (!tIDs.length) {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {
                        'contentString': '<span style="color:gray;">Loading...</span>'
                    })
                );
            } else {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {
                        'contentString': 'Transcriptomics Data'
                    })
                );
            }
        }
        if (aRecord.pro_c) {
            var pIDs = (aRecord.proteins || []);
            if (!pIDs.length) {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {
                        'contentString': '<span style="color:gray;">Loading...</span>'
                    })
                );
            } else {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {
                        'contentString': 'Proteomics Data'
                    })
                );
            }
        }
        return cells;
    }


    // TODO: this looks very similar to previous function; refactor them
    generateUnitsCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
        var aRecord = EDDData.Assays[index];
        var mIDs = (aRecord.metabolites || []);
        var cells;
        // If the number of IDs is different from the count, we most likely haven't fetched full
        // measurement records yet.  So we should just declare a single row that is "waiting".
        if (mIDs.length != aRecord.met_c) {
            cells = [
                new DataGridDataCell(gridSpec, index, {})
            ];
        } else {
            var resolvedNames = {};
            mIDs.forEach((mID) => {
                resolvedNames[mID] = Utl.EDD.resolveMeasurementRecordToName(
                        EDDData.AssayMeasurements[mID]);
            });
            mIDs.sort(function(a:any,b:any) {
                a = resolvedNames[a].toLowerCase();
                b = resolvedNames[b].toLowerCase();
                return (<any>(a > b) - <any>(b > a));
            });
            cells = mIDs.map((mID, i) => {
                var amRecord = EDDData.AssayMeasurements[mID];
                var uRecord = EDDData.UnitTypes[amRecord.uid];
                var units = uRecord ? uRecord.name : '';
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': units
                });
            });
        }
        // Transcriptomics and proteomics each get single aggregate cells.
        if (aRecord.tra_c) {
            var tIDs = (aRecord.transcriptions || []);
            if (!tIDs.length) {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {})
                );
            } else {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {
                        'contentString': 'RPKM'
                    })
                );
            }
        }
        if (aRecord.pro_c) {
            var pIDs = (aRecord.proteins || []);
            if (!pIDs.length) {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {})
                );
            } else {
                cells.push(
                    new DataGridDataCell(gridSpec, index, {
                        'contentString': ''    // TODO: What are the units for Proteomics anyway??
                    })
                );
            }
        }
        return cells;
    }


    generateCountCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
        var aRecord = EDDData.Assays[index];
        var cells;
        // If the number of IDs is different from the count, we most likely haven't fetched full
        // measurement records yet.  So we should just declare a single row that is "waiting".
        var mIDs = (aRecord.metabolites || []);
        if (mIDs.length != aRecord.met_c) {
            cells = [
                new DataGridDataCell(gridSpec, index, {})
            ];
        } else {
            var resolvedNames = {};
            mIDs.forEach((mID) => {
                resolvedNames[mID] = Utl.EDD.resolveMeasurementRecordToName(
                        EDDData.AssayMeasurements[mID]);
            });
            mIDs.sort(function(a:any,b:any) {
                a = resolvedNames[a].toLowerCase();
                b = resolvedNames[b].toLowerCase();
                return (<any>(a > b) - <any>(b > a));
            });
            cells = mIDs.map((mID, i) => {
                var amRecord = EDDData.AssayMeasurements[mID];
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': '(' + (amRecord.d || []).length + ')'
                });
            });
        }
        // Transcriptomics and proteomics each get single aggregate cells.
        if (aRecord.tra_c) {
            var countString:string = '';
            var tIDs = (aRecord.transcriptions || []);
            if (tIDs.length) {
                var count:number = tIDs.reduce((prev:number, tID) => {
                    var amRecord = EDDData.AssayMeasurements[tID];
                    return prev + (amRecord.d ? amRecord.d.length : 0);
                }, 0);
                countString = '(' + count + ')';
            }
            cells.push(
                new DataGridDataCell(gridSpec, index, {
                    'contentString': countString
                })
            );
        }
        if (aRecord.pro_c) {
            var countString:string = '';
            var pIDs = (aRecord.proteins || []);
            if (pIDs.length) {
                var count = pIDs.reduce((prev:number, pID) => {
                    var amRecord = EDDData.AssayMeasurements[pID];
                    return prev + (amRecord.d ? amRecord.d.length : 0);
                }, 0);
                countString = '(' + count + ')';
            }
            cells.push(
                new DataGridDataCell(gridSpec, index, {
                    'contentString': countString
                })
            );
        }
        return cells;
    }


    generateMeasuringTimesCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
        var aRecord = EDDData.Assays[index];
        var mIDs = (aRecord.metabolites || []);
        var cells;
        // If the number of IDs is different from the count, we most likely haven't fetched full
        // measurement records yet.  So we should just declare a single row that is "waiting".
        if (mIDs.length != aRecord.met_c) {
            cells = [
                new DataGridDataCell(gridSpec, index, {})
            ];
        } else {
            var resolvedNames = {};
            mIDs.forEach((mID) => {
                resolvedNames[mID] = Utl.EDD.resolveMeasurementRecordToName(
                        EDDData.AssayMeasurements[mID]);
            });
            mIDs.sort(function(a:any,b:any) {
                a = resolvedNames[a].toLowerCase();
                b = resolvedNames[b].toLowerCase();
                return (<any>(a > b) - <any>(b > a));
            });
            cells = mIDs.map((mID, i) => {
                var amRecord = EDDData.AssayMeasurements[mID];
                var svgStr = '';
                   var data = amRecord.d || [];
                if (data.length) {
                    svgStr = gridSpec.assembleSVGStringForDataPoints(data,
                            amRecord.mf == 1 ? 'carbon' : '');
                }
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': svgStr
                });
            });
        }
        // Transcriptomics and proteomics each get single aggregate cells.
        if (aRecord.tra_c) {

            var tIDs = (aRecord.transcriptions || []);
            var pointCountsByTime = {};
            // Walk through all the data points in all the measurements and count the occurrences of
            // each timestamp
            tIDs.forEach((tID) => {
                var amRecord = EDDData.AssayMeasurements[tID];
                   var data = amRecord.d || [];
                data.forEach((point) => {
                    if (typeof pointCountsByTime[point[0]] === "undefined") {
                        pointCountsByTime[point[0]] = 0;
                    }
                    pointCountsByTime[point[0]] += 1;
                });
            });
            // Get a sorted array of all the timestamps we've seen
            var times = <any[]>Object.keys(pointCountsByTime);
            times.sort(function(a:any,b:any) {
                a = parseFloat(a);
                b = parseFloat(b);
                return (<any>(a > b) - <any>(b > a));
            });
            // Build a single data string with the values being the count of measurements at each
            // timestamp
            var consolidatedData = times.map((t) => {
                return [t, pointCountsByTime[t]];
            });

            var svgStr = '';
            if (consolidatedData.length) {
                svgStr = gridSpec.assembleSVGStringForDataPoints(consolidatedData, '');
            }
            cells.push(
                new DataGridDataCell(gridSpec, index, {
                    'contentString': svgStr
                })
            );
        }
        if (aRecord.pro_c) {

            // Same as the Transcriptomics section
            var pIDs = (aRecord.proteins || []);
            var pointCountsByTime = {};
            pIDs.forEach((pID) => {
                var amRecord = EDDData.AssayMeasurements[pID];
                   var data = amRecord.d || [];
                data.forEach((point) => {
                    if (typeof pointCountsByTime[point[0]] === "undefined") {
                        pointCountsByTime[point[0]] = 0;
                    }
                    pointCountsByTime[point[0]] += 1;
                });
            });
            var times = <any[]>Object.keys(pointCountsByTime);
            times.sort(function(a:any,b:any) {
                a = parseFloat(a);
                b = parseFloat(b);
                return (<any>(a > b) - <any>(b > a));
            });
            var consolidatedData = times.map((t) => {
                return [t, pointCountsByTime[t]];
            });

            var svgStr = '';
            if (consolidatedData.length) {
                svgStr = gridSpec.assembleSVGStringForDataPoints(consolidatedData, '');
            }
            cells.push(
                new DataGridDataCell(gridSpec, index, {
                    'contentString': svgStr
                })
            );
        }
        return cells;
    }


    generateExperimenterCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
        var exp = EDDData.Assays[index].exp;
        var uRecord = EDDData.Users[exp];
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': uRecord ? uRecord.initials : '?'
            })
        ];
    }


    generateModificationDateCells(gridSpec:DataGridSpecAssays, index:number):DataGridDataCell[] {
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
        for (var x = 0; x < points.length; x++) {
            var point = points[x];
            var ax = parseFloat(point[0]);
            var ay = point[1];
            var rx = ((ax / this.maximumXValueInData) * 450) + 10;

            paths.push('<path class="cE" d="M' + rx.toString() + ',5v4"></path>');
            if (ay === null) {
                paths.push('<path class="cE" d="M' + rx.toString() + ',2v6"></path>');
                continue;
            }
            paths.push('<path class="cP" d="M' + rx.toString() + ',1v4"></path>');            

            var tt = ay + ' at ' + ax.toString() + 'h';
            var rx_str = rx.toString();
            if (format == 'carbon') {    // Carbon Ratio type
                paths.push('<path class="cV" d="M' + rx_str + ',1v8"><title>' + tt +
                        '</title></path>');
            } else {
                paths.push('<path class="cP" d="M' + rx_str + ',1v8"><title>' + tt +
                        '</title></path>');
            }
        }
        paths.push('</svg>');
        return paths.join('\n');
    }
    

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec():DataGridColumnSpec[] {
        var leftSide:DataGridColumnSpec[] = [
            new DataGridColumnSpec(1, this.generateAssayNameCells)
           ];

        var metaDataCols:DataGridColumnSpec[] = this.metaDataIDsUsedInAssays.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnSpec(2 + index, this.makeMetaDataCellsGeneratorFunction(id));
        });

        var rightSide:DataGridColumnSpec[] = [
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
        table.addEventListener('mouseover', StudyD.queueAssaysActionPanelShow, false);
        table.addEventListener('mousedown', StudyD.queueAssaysActionPanelShow, false);
        table.addEventListener('mouseup', StudyD.queueAssaysActionPanelShow, false);

        if (this.undisclosedSectionDiv) {
            $(this.undisclosedSectionDiv).click(() => dataGrid.clickedDisclose(true));
        }

        var p = this.protocolID;
        var graphid = "pro" + p + "graph";
        if (this.graphAreaHeaderSpec) {
            if (this.measuringTimesHeaderSpec.element) {
                // TODO: style attribute should be a class
                $(this.graphAreaHeaderSpec.element).html('<div id="' + graphid +
                        '" style="width:98%;height:240px;padding:0px;margin:5px 0px;"></div>');
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


    applyFilterToIDs(rowIDs:any):any {

        // If the box is checked, return the set of IDs unfiltered
        if (this.checkBoxElement.checked) {
            return rowIDs;
        }

        var filteredIDs = [];
        for (var r = 0; r < rowIDs.length; r++) {
            var id = rowIDs[r];
            // Here is the condition that determines whether the rows associated with this ID are
            // shown or hidden.
            if (!EDDData.Assays[id].dis) {
                filteredIDs.push(id);            
            }
        }
        return filteredIDs;
    }


    initialFormatRowElementsForID(dataRowObjects:any, rowID:any):any {
        if (EDDData.Assays[rowID].dis) {
            for (var r = 0; r < dataRowObjects.length; r++) {
                var rowElement = dataRowObjects[r].getElement();
                rowElement.style.backgroundColor = "#FFC0C0";
            }
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

