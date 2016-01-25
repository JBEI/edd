// Compiled to JS on: Mon Jan 25 2016 15:20:56  
/// <reference path="EDDDataInterface.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="CarbonSummation.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="StudyGraphing.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var StudyD;
(function (StudyD) {
    'use strict';
    var mainGraphObject;
    var progressiveFilteringWidget;
    var mainGraphRefreshTimerID;
    var linesActionPanelRefreshTimer;
    var assaysActionPanelRefreshTimer;
    var attachmentIDs;
    var attachmentsByID;
    var prevDescriptionEditElement;
    var carbonBalanceData;
    var carbonBalanceDisplayIsFresh;
    var cSourceEntries;
    var mTypeEntries;
    // The table spec object and table object for the Lines table.
    var linesDataGridSpec;
    var linesDataGrid;
    // Table spec and table objects, one each per Protocol, for Assays.
    var assaysDataGridSpecs;
    var assaysDataGrids;
    // For the filtering section on the main graph
    var ProgressiveFilteringWidget = (function () {
        // MeasurementGroupCode: Need to initialize each filter list.
        function ProgressiveFilteringWidget(studyDObject) {
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
        }
        // Read through the Lines, Assays, and AssayMeasurements structures to learn what types are present,
        // then instantiate the relevant subclasses of GenericFilterSection, to create a series of
        // columns for the filtering section under the main graph on the page.
        // This must be outside the constructor because EDDData.Lines and EDDData.Assays are not immediately available
        // on page load.
        // MeasurementGroupCode: Need to create and add relevant filters for each group.
        ProgressiveFilteringWidget.prototype.prepareFilteringSection = function () {
            var seenInLinesHash = {};
            var seenInAssaysHash = {};
            var aIDsToUse = [];
            // First do some basic sanity filtering on the list
            $.each(EDDData.Assays, function (assayId, assay) {
                var line = EDDData.Lines[assay.lid];
                if (!assay.active || !line || !line.active)
                    return;
                $.each(assay.meta || [], function (metadataId) { seenInAssaysHash[metadataId] = true; });
                $.each(line.meta || [], function (metadataId) { seenInLinesHash[metadataId] = true; });
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
            assayFilters.forEach(function (filter) {
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
            this.allFilters = [].concat(assayFilters, this.metaboliteFilters, this.proteinFilters, this.geneFilters, this.measurementFilters);
            this.repopulateFilteringSection();
        };
        // Clear out any old filters in the filtering section, and add in the ones that
        // claim to be "useful".
        ProgressiveFilteringWidget.prototype.repopulateFilteringSection = function () {
            var table = $('<div>').addClass('filterTable').appendTo($('#mainFilterSection').empty());
            var dark = false;
            $.each(this.allFilters, function (i, widget) {
                if (widget.isFilterUseful()) {
                    widget.addToParent(table[0]);
                    widget.applyBackgroundStyle(dark);
                    dark = !dark;
                }
            });
        };
        // Given a set of measurement records and a dictionary of corresponding types
        // (passed down from the server as a result of a data request), sort them into
        // their various categories, then pass each category to their relevant filter objects
        // (possibly adding to the values in the filter) and refresh the UI for each filter.
        // MeasurementGroupCode: Need to process each group separately here.
        ProgressiveFilteringWidget.prototype.processIncomingMeasurementRecords = function (measures, types) {
            var process;
            var filterIds = { 'm': [], 'p': [], 'g': [], '_': [] };
            // loop over all downloaded measurements
            $.each(measures || {}, function (index, measurement) {
                var assay = EDDData.Assays[measurement.assay], line, mtype;
                if (!assay || !assay.active)
                    return;
                line = EDDData.Lines[assay.lid];
                if (!line || !line.active)
                    return;
                mtype = types[measurement.type] || {};
                if (mtype.family === 'm') {
                    filterIds.m.push(measurement.id);
                }
                else if (mtype.family === 'p') {
                    filterIds.p.push(measurement.id);
                }
                else if (mtype.family === 'g') {
                    filterIds.g.push(measurement.id);
                }
                else {
                    // throw everything else in a general area
                    filterIds._.push(measurement.id);
                }
            });
            process = function (ids, i, widget) {
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
        };
        // Build a list of all the non-disabled Assay IDs in the Study.
        ProgressiveFilteringWidget.prototype.buildAssayIDSet = function () {
            var assayIds = [];
            $.each(EDDData.Assays, function (assayId, assay) {
                var line = EDDData.Lines[assay.lid];
                if (!assay.active || !line || !line.active)
                    return;
                assayIds.push(assayId);
            });
            return assayIds;
        };
        // Starting with a list of all the non-disabled Assay IDs in the Study, we loop it through the
        // Line and Assay-level filters, causing the filters to refresh their UI, narrowing the set down.
        // We resolve the resulting set of Assay IDs into measurement IDs, then pass them on to the
        // measurement-level filters.  In the end we return a set of measurement IDs representing the
        // end result of all the filters, suitable for passing to the graphing functions.
        // MeasurementGroupCode: Need to process each group separately here.
        ProgressiveFilteringWidget.prototype.buildFilteredMeasurements = function () {
            var filteredAssayIds = this.buildAssayIDSet();
            $.each(this.assayFilters, function (i, filter) {
                filteredAssayIds = filter.applyProgressiveFiltering(filteredAssayIds);
            });
            var measurementIds = [];
            $.each(filteredAssayIds, function (i, assayId) {
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
                $.each(this.metaboliteFilters, function (i, filter) {
                    metaboliteMeasurements = filter.applyProgressiveFiltering(metaboliteMeasurements);
                });
            }
            if (this.proteinDataProcessed) {
                $.each(this.proteinFilters, function (i, filter) {
                    proteinMeasurements = filter.applyProgressiveFiltering(proteinMeasurements);
                });
            }
            if (this.geneDataProcessed) {
                $.each(this.geneFilters, function (i, filter) {
                    geneMeasurements = filter.applyProgressiveFiltering(geneMeasurements);
                });
            }
            if (this.genericDataProcessed) {
                $.each(this.measurementFilters, function (i, filter) {
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
            var anyChecked = function (filter) { return filter.anyCheckboxesChecked; };
            var dSM = []; // "Deliberately selected measurements"
            if (this.metaboliteFilters.some(anyChecked)) {
                dSM = dSM.concat(metaboliteMeasurements);
            }
            if (this.proteinFilters.some(anyChecked)) {
                dSM = dSM.concat(proteinMeasurements);
            }
            if (this.geneFilters.some(anyChecked)) {
                dSM = dSM.concat(geneMeasurements);
            }
            if (this.measurementFilters.some(anyChecked)) {
                dSM = dSM.concat(genericMeasurements);
            }
            if (dSM.length) {
                return dSM;
            }
            return measurementIds;
        };
        ProgressiveFilteringWidget.prototype.checkRedrawRequired = function (force) {
            var redraw = false;
            // do not redraw if graph is not initialized yet
            if (this.mainGraphObject) {
                redraw = !!force;
                // Walk down the filter widget list.  If we encounter one whose collective checkbox
                // state has changed since we last made this walk, then a redraw is required. Note that
                // we should not skip this loop, even if we already know a redraw is required, since the
                // call to anyCheckboxesChangedSinceLastInquiry sets internal state in the filter
                // widgets that we will use next time around.
                $.each(this.allFilters, function (i, filter) {
                    if (filter.anyCheckboxesChangedSinceLastInquiry()) {
                        redraw = true;
                    }
                });
            }
            return redraw;
        };
        return ProgressiveFilteringWidget;
    })();
    StudyD.ProgressiveFilteringWidget = ProgressiveFilteringWidget;
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
    var GenericFilterSection = (function () {
        function GenericFilterSection() {
            this.uniqueValues = {};
            this.uniqueIndexes = {};
            this.uniqueIndexCounter = 0;
            this.uniqueValuesOrder = [];
            this.filterHash = {};
            this.previousCheckboxState = {};
            this.typingTimeout = null;
            this.typingDelay = 330; // TODO: Not implemented
            this.currentSearchSelection = '';
            this.previousSearchSelection = '';
            this.minCharsToTriggerSearch = 1;
            this.configure();
            this.anyCheckboxesChecked = false;
            this.createContainerObjects();
        }
        GenericFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Generic Filter';
            this.sectionShortLabel = 'gf';
        };
        // Create all the container HTML objects
        GenericFilterSection.prototype.createContainerObjects = function () {
            var sBoxID = 'filter' + this.sectionShortLabel + 'SearchBox', sBox;
            this.filterColumnDiv = $("<div>").addClass('filterColumn')[0];
            this.titleElement = $("<span>").addClass('filterHead').text(this.sectionTitle)[0];
            $(sBox = document.createElement("input"))
                .attr({ 'id': sBoxID,
                'name': sBoxID,
                'placeholder': this.sectionTitle,
                'size': 14 })
                .addClass('searchBox filterHead');
            sBox.setAttribute('type', 'text'); // JQuery .attr() cannot set this
            this.searchBoxElement = sBox;
            this.scrollZoneDiv = $("<div>").addClass('filterCriteriaScrollZone')[0];
            this.filteringTable = $("<table>")
                .addClass('filterCriteriaTable dragboxes')
                .attr({ 'cellpadding': 0, 'cellspacing': 0 })
                .append(this.tableBodyElement = $("<tbody>")[0]);
        };
        GenericFilterSection.prototype.populateFilterFromRecordIDs = function (ids) {
            var _this = this;
            var usedValues, crSet, cHash, previousIds;
            // can get IDs from multiple assays, first merge with this.filterHash
            previousIds = $.map(this.filterHash || {}, function (_, previousId) { return previousId; });
            ids.forEach(function (addedId) { _this.filterHash[addedId] = []; });
            ids = $.map(this.filterHash || {}, function (_, previousId) { return previousId; });
            // skip over building unique values and sorting when no new IDs added
            if (ids.length > previousIds.length) {
                this.updateUniqueIndexesHash(ids);
                crSet = [];
                cHash = {};
                // Create a reversed hash so keys map values and values map keys
                $.each(this.uniqueIndexes, function (value, uniqueID) {
                    cHash[uniqueID] = value;
                    crSet.push(uniqueID);
                });
                // Alphabetically sort an array of the keys according to values
                crSet.sort(function (a, b) {
                    var _a = cHash[a].toLowerCase();
                    var _b = cHash[b].toLowerCase();
                    return _a < _b ? -1 : _a > _b ? 1 : 0;
                });
                this.uniqueValues = cHash;
                this.uniqueValuesOrder = crSet;
            }
        };
        // In this function are running through the given list of measurement IDs and examining
        // their records and related records, locating the particular field we are interested in,
        // and creating a list of all the unique values for that field.  As we go, we mark each
        // unique value with an integer UID, and construct a hash resolving each record to one (or
        // possibly more) of those integer UIDs.  This prepares us for quick filtering later on.
        // (This generic filter does nothing, so we leave these structures blank.)
        GenericFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            this.filterHash = this.filterHash || {};
            this.uniqueIndexes = this.uniqueIndexes || {};
        };
        // If we didn't come up with 2 or more criteria, there is no point in displaying the filter.
        GenericFilterSection.prototype.isFilterUseful = function () {
            if (this.uniqueValuesOrder.length < 2) {
                return false;
            }
            return true;
        };
        GenericFilterSection.prototype.addToParent = function (parentDiv) {
            parentDiv.appendChild(this.filterColumnDiv);
        };
        GenericFilterSection.prototype.applyBackgroundStyle = function (darker) {
            $(this.filterColumnDiv).removeClass(darker ? 'stripeRowB' : 'stripeRowA');
            $(this.filterColumnDiv).addClass(darker ? 'stripeRowA' : 'stripeRowB');
        };
        // Runs through the values in uniqueValuesOrder, adding a checkbox and label for each
        // filtering value represented.  If there are more than 15 values, the filter gets
        // a search box and scrollbar.
        GenericFilterSection.prototype.populateTable = function () {
            var _this = this;
            var fCol = $(this.filterColumnDiv).empty();
            // Only use the scrolling container div if the size of the list warrants it, because
            // the scrolling container div declares a large padding margin for the scroll bar,
            // and that padding margin would be an empty waste of space otherwise.
            if (this.uniqueValuesOrder.length > 15) {
                fCol.append(this.searchBoxElement).append(this.scrollZoneDiv);
                // Change the reference so we're affecting the innerHTML of the correct div later on
                fCol = $(this.scrollZoneDiv);
            }
            else {
                fCol.append(this.titleElement);
            }
            fCol.append(this.filteringTable);
            var tBody = this.tableBodyElement;
            // Clear out any old table contents
            $(this.tableBodyElement).empty();
            this.tableRows = {};
            this.checkboxes = {};
            this.uniqueValuesOrder.forEach(function (uniqueId) {
                var cboxName, cell, p, q, r;
                cboxName = ['filter', _this.sectionShortLabel, 'n', uniqueId, 'cbox'].join('');
                _this.tableRows[uniqueId] = _this.tableBodyElement.insertRow();
                cell = _this.tableRows[uniqueId].insertCell();
                _this.checkboxes[uniqueId] = $("<input type='checkbox'>")
                    .attr({ 'name': cboxName, 'id': cboxName })
                    .appendTo(cell);
                $('<label>').attr('for', cboxName).text(_this.uniqueValues[uniqueId])
                    .appendTo(cell);
            });
            Dragboxes.initTable(this.filteringTable); // TODO: Drag select is broken in Safari
        };
        // Returns true if any of the checkboxes show a different state than when this function was
        // last called
        GenericFilterSection.prototype.anyCheckboxesChangedSinceLastInquiry = function () {
            var _this = this;
            var changed = false, currentCheckboxState = {}, v = $(this.searchBoxElement).val();
            this.anyCheckboxesChecked = false;
            $.each(this.checkboxes || {}, function (uniqueId, checkbox) {
                var current, previous;
                current = (checkbox.prop('checked') && !checkbox.prop('disabled')) ? 'C' : 'U';
                previous = _this.previousCheckboxState[uniqueId] || 'N';
                if (current !== previous)
                    changed = true;
                if (current === 'C')
                    _this.anyCheckboxesChecked = true;
                currentCheckboxState[uniqueId] = current;
            });
            v = v.trim(); // Remove leading and trailing whitespace
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
                $.each(this.previousCheckboxState, function (rowId) {
                    if (currentCheckboxState[rowId] === undefined) {
                        changed = true;
                        return false;
                    }
                });
            }
            this.previousCheckboxState = currentCheckboxState;
            return changed;
        };
        // Takes a set of record IDs, and if any checkboxes in the filter's UI are checked,
        // the ID set is narrowed down to only those records that contain the checked values.
        // Checkboxes whose values are not represented anywhere in the given IDs are temporarily disabled
        // and sorted to the bottom of the list, visually indicating to a user that those values are not
        // available for further filtering.
        // The narrowed set of IDs is then returned, for use by the next filter.
        GenericFilterSection.prototype.applyProgressiveFiltering = function (ids) {
            var _this = this;
            // If the filter only contains one item, it's pointless to apply it.
            if (!this.isFilterUseful()) {
                return ids;
            }
            var idsPostFiltering;
            var useSearchBox = false;
            var queryStrs = [];
            var v = this.currentSearchSelection;
            if (v != null) {
                if (v.length >= this.minCharsToTriggerSearch) {
                    // If there are multiple words, we match each separately.
                    // We will not attempt to match against empty strings, so we filter those out if
                    // any slipped through.
                    queryStrs = v.split(/\s+/).filter(function (one) { return one.length > 0; });
                    // The user might have pasted/typed only whitespace, so:
                    if (queryStrs.length > 0) {
                        useSearchBox = true;
                    }
                }
            }
            var valuesVisiblePreFiltering = {};
            var indexIsVisible = function (index) {
                var match = true, text;
                if (useSearchBox) {
                    text = _this.uniqueValues[index].toLowerCase();
                    match = queryStrs.some(function (v) {
                        return text.length >= v.length && text.indexOf(v) >= 0;
                    });
                }
                if (match) {
                    valuesVisiblePreFiltering[index] = 1;
                    if ((_this.previousCheckboxState[index] === 'C') || !_this.anyCheckboxesChecked) {
                        return true;
                    }
                }
                return false;
            };
            idsPostFiltering = ids.filter(function (id) {
                // If we have filtering data for this id, use it.
                // If we don't, the id probably belongs to some other measurement category,
                // so we ignore it.
                if (_this.filterHash[id]) {
                    return _this.filterHash[id].some(indexIsVisible);
                }
                return false;
            });
            var rowsToAppend = [];
            this.uniqueValuesOrder.forEach(function (crID) {
                var checkbox = _this.checkboxes[crID], row = _this.tableRows[crID], show = !!valuesVisiblePreFiltering[crID];
                checkbox.prop('disabled', !show);
                $(row).toggleClass('nodata', !show);
                if (show) {
                    _this.tableBodyElement.appendChild(row);
                }
                else {
                    rowsToAppend.push(row);
                }
            });
            // Now, (re)append all the rows we disabled, so they go to the bottom of the table
            rowsToAppend.forEach(function (row) { return _this.tableBodyElement.appendChild(row); });
            return idsPostFiltering;
        };
        GenericFilterSection.prototype._assayIdToAssay = function (assayId) {
            return EDDData.Assays[assayId];
        };
        GenericFilterSection.prototype._assayIdToLine = function (assayId) {
            var assay = this._assayIdToAssay(assayId);
            if (assay)
                return EDDData.Lines[assay.lid];
            return undefined;
        };
        GenericFilterSection.prototype._assayIdToProtocol = function (assayId) {
            var assay = this._assayIdToAssay(assayId);
            if (assay)
                return EDDData.Protocols[assay.pid];
            return undefined;
        };
        GenericFilterSection.prototype.getIdMapToValues = function () {
            return function () { return []; };
        };
        return GenericFilterSection;
    })();
    StudyD.GenericFilterSection = GenericFilterSection;
    var StrainFilterSection = (function (_super) {
        __extends(StrainFilterSection, _super);
        function StrainFilterSection() {
            _super.apply(this, arguments);
        }
        StrainFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Strain';
            this.sectionShortLabel = 'st';
        };
        StrainFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                // assign unique ID to every encountered strain name
                (line.strain || []).forEach(function (strainId) {
                    var strain = EDDData.Strains[strainId];
                    if (strain && strain.name) {
                        _this.uniqueIndexes[strain.name] = _this.uniqueIndexes[strain.name] || ++_this.uniqueIndexCounter;
                        _this.filterHash[assayId].push(_this.uniqueIndexes[strain.name]);
                    }
                });
            });
        };
        return StrainFilterSection;
    })(GenericFilterSection);
    StudyD.StrainFilterSection = StrainFilterSection;
    var CarbonSourceFilterSection = (function (_super) {
        __extends(CarbonSourceFilterSection, _super);
        function CarbonSourceFilterSection() {
            _super.apply(this, arguments);
        }
        CarbonSourceFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Carbon Source';
            this.sectionShortLabel = 'cs';
        };
        CarbonSourceFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source name
                (line.carbon || []).forEach(function (carbonId) {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.name) {
                        _this.uniqueIndexes[src.name] = _this.uniqueIndexes[src.name] || ++_this.uniqueIndexCounter;
                        _this.filterHash[assayId].push(_this.uniqueIndexes[src.name]);
                    }
                });
            });
        };
        return CarbonSourceFilterSection;
    })(GenericFilterSection);
    StudyD.CarbonSourceFilterSection = CarbonSourceFilterSection;
    var CarbonLabelingFilterSection = (function (_super) {
        __extends(CarbonLabelingFilterSection, _super);
        function CarbonLabelingFilterSection() {
            _super.apply(this, arguments);
        }
        CarbonLabelingFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Labeling';
            this.sectionShortLabel = 'l';
        };
        CarbonLabelingFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source labeling description
                (line.carbon || []).forEach(function (carbonId) {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.labeling) {
                        _this.uniqueIndexes[src.labeling] = _this.uniqueIndexes[src.labeling] || ++_this.uniqueIndexCounter;
                        _this.filterHash[assayId].push(_this.uniqueIndexes[src.labeling]);
                    }
                });
            });
        };
        return CarbonLabelingFilterSection;
    })(GenericFilterSection);
    StudyD.CarbonLabelingFilterSection = CarbonLabelingFilterSection;
    var LineNameFilterSection = (function (_super) {
        __extends(LineNameFilterSection, _super);
        function LineNameFilterSection() {
            _super.apply(this, arguments);
        }
        LineNameFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Line';
            this.sectionShortLabel = 'ln';
        };
        LineNameFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                if (line.name) {
                    _this.uniqueIndexes[line.name] = _this.uniqueIndexes[line.name] || ++_this.uniqueIndexCounter;
                    _this.filterHash[assayId].push(_this.uniqueIndexes[line.name]);
                }
            });
        };
        return LineNameFilterSection;
    })(GenericFilterSection);
    StudyD.LineNameFilterSection = LineNameFilterSection;
    var ProtocolFilterSection = (function (_super) {
        __extends(ProtocolFilterSection, _super);
        function ProtocolFilterSection() {
            _super.apply(this, arguments);
        }
        ProtocolFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Protocol';
            this.sectionShortLabel = 'p';
        };
        ProtocolFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var protocol = _this._assayIdToProtocol(assayId);
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                if (protocol && protocol.name) {
                    _this.uniqueIndexes[protocol.name] = _this.uniqueIndexes[protocol.name] || ++_this.uniqueIndexCounter;
                    _this.filterHash[assayId].push(_this.uniqueIndexes[protocol.name]);
                }
            });
        };
        return ProtocolFilterSection;
    })(GenericFilterSection);
    StudyD.ProtocolFilterSection = ProtocolFilterSection;
    var AssaySuffixFilterSection = (function (_super) {
        __extends(AssaySuffixFilterSection, _super);
        function AssaySuffixFilterSection() {
            _super.apply(this, arguments);
        }
        AssaySuffixFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Assay Suffix';
            this.sectionShortLabel = 'a';
        };
        AssaySuffixFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var assay = _this._assayIdToAssay(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                if (assay.name) {
                    _this.uniqueIndexes[assay.name] = _this.uniqueIndexes[assay.name] || ++_this.uniqueIndexCounter;
                    _this.filterHash[assayId].push(_this.uniqueIndexes[assay.name]);
                }
            });
        };
        return AssaySuffixFilterSection;
    })(GenericFilterSection);
    StudyD.AssaySuffixFilterSection = AssaySuffixFilterSection;
    var MetaDataFilterSection = (function (_super) {
        __extends(MetaDataFilterSection, _super);
        function MetaDataFilterSection(metaDataID) {
            var MDT = EDDData.MetaDataTypes[metaDataID];
            this.metaDataID = metaDataID;
            this.pre = MDT.pre || '';
            this.post = MDT.post || '';
            _super.call(this);
        }
        MetaDataFilterSection.prototype.configure = function () {
            this.sectionTitle = EDDData.MetaDataTypes[this.metaDataID].name;
            this.sectionShortLabel = 'md' + this.metaDataID;
        };
        return MetaDataFilterSection;
    })(GenericFilterSection);
    StudyD.MetaDataFilterSection = MetaDataFilterSection;
    var LineMetaDataFilterSection = (function (_super) {
        __extends(LineMetaDataFilterSection, _super);
        function LineMetaDataFilterSection() {
            _super.apply(this, arguments);
        }
        LineMetaDataFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {}, value = '(Empty)';
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                if (line.meta && line.meta[_this.metaDataID]) {
                    value = [_this.pre, line.meta[_this.metaDataID], _this.post].join(' ').trim();
                }
                _this.uniqueIndexes[value] = _this.uniqueIndexes[value] || ++_this.uniqueIndexCounter;
                _this.filterHash[assayId].push(_this.uniqueIndexes[value]);
            });
        };
        return LineMetaDataFilterSection;
    })(MetaDataFilterSection);
    StudyD.LineMetaDataFilterSection = LineMetaDataFilterSection;
    var AssayMetaDataFilterSection = (function (_super) {
        __extends(AssayMetaDataFilterSection, _super);
        function AssayMetaDataFilterSection() {
            _super.apply(this, arguments);
        }
        AssayMetaDataFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            ids.forEach(function (assayId) {
                var assay = _this._assayIdToAssay(assayId) || {}, value = '(Empty)';
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                if (assay.meta && assay.meta[_this.metaDataID]) {
                    value = [_this.pre, assay.meta[_this.metaDataID], _this.post].join(' ').trim();
                }
                _this.uniqueIndexes[value] = _this.uniqueIndexes[value] || ++_this.uniqueIndexCounter;
                _this.filterHash[assayId].push(_this.uniqueIndexes[value]);
            });
        };
        return AssayMetaDataFilterSection;
    })(MetaDataFilterSection);
    StudyD.AssayMetaDataFilterSection = AssayMetaDataFilterSection;
    var MetaboliteCompartmentFilterSection = (function (_super) {
        __extends(MetaboliteCompartmentFilterSection, _super);
        function MetaboliteCompartmentFilterSection() {
            _super.apply(this, arguments);
        }
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        MetaboliteCompartmentFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Compartment';
            this.sectionShortLabel = 'com';
        };
        MetaboliteCompartmentFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, value;
                _this.filterHash[measureId] = _this.filterHash[measureId] || [];
                value = EDDData.MeasurementTypeCompartments[measure.compartment] || {};
                if (value && value.name) {
                    _this.uniqueIndexes[value.name] = _this.uniqueIndexes[value.name] || ++_this.uniqueIndexCounter;
                    _this.filterHash[measureId].push(_this.uniqueIndexes[value.name]);
                }
            });
        };
        return MetaboliteCompartmentFilterSection;
    })(GenericFilterSection);
    StudyD.MetaboliteCompartmentFilterSection = MetaboliteCompartmentFilterSection;
    var MeasurementFilterSection = (function (_super) {
        __extends(MeasurementFilterSection, _super);
        function MeasurementFilterSection() {
            _super.apply(this, arguments);
        }
        MeasurementFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Measurement';
            this.sectionShortLabel = 'mm';
            this.loadPending = true;
        };
        MeasurementFilterSection.prototype.isFilterUseful = function () {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        };
        MeasurementFilterSection.prototype.updateUniqueIndexesHash = function (mIds) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            mIds.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {};
                var mType;
                _this.filterHash[measureId] = _this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    mType = EDDData.MeasurementTypes[measure.type] || {};
                    if (mType && mType.name) {
                        _this.uniqueIndexes[mType.name] = _this.uniqueIndexes[mType.name] || ++_this.uniqueIndexCounter;
                        _this.filterHash[measureId].push(_this.uniqueIndexes[mType.name]);
                    }
                }
            });
            this.loadPending = false;
        };
        return MeasurementFilterSection;
    })(GenericFilterSection);
    StudyD.MeasurementFilterSection = MeasurementFilterSection;
    var MetaboliteFilterSection = (function (_super) {
        __extends(MetaboliteFilterSection, _super);
        function MetaboliteFilterSection() {
            _super.apply(this, arguments);
        }
        MetaboliteFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Metabolite';
            this.sectionShortLabel = 'me';
            this.loadPending = true;
        };
        // Override: If the filter has a load pending, it's "useful", i.e. display it.
        MetaboliteFilterSection.prototype.isFilterUseful = function () {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        };
        MetaboliteFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, metabolite;
                _this.filterHash[measureId] = _this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    metabolite = EDDData.MetaboliteTypes[measure.type] || {};
                    if (metabolite && metabolite.name) {
                        _this.uniqueIndexes[metabolite.name] = _this.uniqueIndexes[metabolite.name] || ++_this.uniqueIndexCounter;
                        _this.filterHash[measureId].push(_this.uniqueIndexes[metabolite.name]);
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        };
        return MetaboliteFilterSection;
    })(GenericFilterSection);
    StudyD.MetaboliteFilterSection = MetaboliteFilterSection;
    var ProteinFilterSection = (function (_super) {
        __extends(ProteinFilterSection, _super);
        function ProteinFilterSection() {
            _super.apply(this, arguments);
        }
        ProteinFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Protein';
            this.sectionShortLabel = 'pr';
            this.loadPending = true;
        };
        // Override: If the filter has a load pending, it's "useful", i.e. display it.
        ProteinFilterSection.prototype.isFilterUseful = function () {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        };
        ProteinFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, protein;
                _this.filterHash[measureId] = _this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    protein = EDDData.ProteinTypes[measure.type] || {};
                    if (protein && protein.name) {
                        _this.uniqueIndexes[protein.name] = _this.uniqueIndexes[protein.name] || ++_this.uniqueIndexCounter;
                        _this.filterHash[measureId].push(_this.uniqueIndexes[protein.name]);
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        };
        return ProteinFilterSection;
    })(GenericFilterSection);
    StudyD.ProteinFilterSection = ProteinFilterSection;
    var GeneFilterSection = (function (_super) {
        __extends(GeneFilterSection, _super);
        function GeneFilterSection() {
            _super.apply(this, arguments);
        }
        GeneFilterSection.prototype.configure = function () {
            this.sectionTitle = 'Gene';
            this.sectionShortLabel = 'gn';
            this.loadPending = true;
        };
        // Override: If the filter has a load pending, it's "useful", i.e. display it.
        GeneFilterSection.prototype.isFilterUseful = function () {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        };
        GeneFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = this.uniqueIndexes || {};
            this.filterHash = this.filterHash || {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, gene;
                _this.filterHash[measureId] = _this.filterHash[measureId] || [];
                if (measure && measure.type) {
                    gene = EDDData.GeneTypes[measure.type] || {};
                    if (gene && gene.name) {
                        _this.uniqueIndexes[gene.name] = _this.uniqueIndexes[gene.name] || ++_this.uniqueIndexCounter;
                        _this.filterHash[measureId].push(_this.uniqueIndexes[gene.name]);
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
        };
        return GeneFilterSection;
    })(GenericFilterSection);
    StudyD.GeneFilterSection = GeneFilterSection;
    // Called when the page loads.
    function prepareIt() {
        var _this = this;
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
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        $.ajax({
            'url': 'edddata/',
            'type': 'GET',
            'error': function (xhr, status, e) {
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': function (data) {
                EDDData = $.extend(EDDData || {}, data);
                _this.progressiveFilteringWidget.prepareFilteringSection();
                // Instantiate a table specification for the Lines table
                _this.linesDataGridSpec = new DataGridSpecLines();
                // Instantiate the table itself with the spec
                _this.linesDataGrid = new DataGrid(_this.linesDataGridSpec);
                // Find out which protocols have assays with measurements - disabled or no
                var protocolsWithMeasurements = {};
                $.each(EDDData.Assays, function (assayId, assay) {
                    var line = EDDData.Lines[assay.lid];
                    if (!line || !line.active)
                        return;
                    protocolsWithMeasurements[assay.pid] = true;
                });
                // For each protocol with measurements, create a DataGridAssays object.
                $.each(EDDData.Protocols, function (id, protocol) {
                    var spec;
                    if (protocolsWithMeasurements[id]) {
                        _this.assaysDataGridSpecs[id] = spec = new DataGridSpecAssays(protocol.id);
                        _this.assaysDataGrids[id] = new DataGridAssays(spec);
                    }
                });
            }
        });
        $('form.line-edit').on('change', '.line-meta > :input', function (ev) {
            // watch for changes to metadata values, and serialize to the meta_store field
            var form = $(ev.target).closest('form'), metaIn = form.find('[name=line-meta_store]'), meta = JSON.parse(metaIn.val() || '{}');
            form.find('.line-meta > :input').each(function (i, input) {
                var key = $(input).attr('id').match(/-(\d+)$/)[1];
                meta[key] = $(input).val();
            });
            metaIn.val(JSON.stringify(meta));
        }).on('click', '.line-meta-add', function (ev) {
            // make metadata Add Value button work and not submit the form
            var addrow = $(ev.target).closest('.line-edit-meta'), type, value;
            type = addrow.find('.line-meta-type').val();
            value = addrow.find('.line-meta-value').val();
            addrow.find(':input').val(''); // clear out inputs so another value can be entered
            if (EDDData.MetaDataTypes[type]) {
                insertLineMetadataRow(addrow, type, value).find(':input').trigger('change');
            }
            return false;
        }).on('click', '.meta-remove', function (ev) {
            // remove metadata row and insert null value for the metadata key
            var form = $(ev.target).closest('form'), metaRow = $(ev.target).closest('.line-meta'), metaIn = form.find('[name=line-meta_store]'), meta = JSON.parse(metaIn.val() || '{}'), key = metaRow.attr('id').match(/-(\d+)$/)[1];
            meta[key] = null;
            metaIn.val(JSON.stringify(meta));
            metaRow.remove();
        });
        $(window).load(preparePermissions);
    }
    StudyD.prepareIt = prepareIt;
    function preparePermissions() {
        var user, group;
        // TODO the DOM traversing and filtering here is very hacky, do it better later
        user = EDD_auto.create_autocomplete($('#permission_user_box'));
        group = EDD_auto.create_autocomplete($('#permission_group_box'));
        EDD_auto.setup_field_autocomplete(user, 'User');
        EDD_auto.setup_field_autocomplete(group, 'Group');
        $('form.permissions')
            .on('change', ':radio', function (ev) {
            var radio = $(ev.target);
            $('.permissions').find(':radio').each(function (i, r) {
                $(r).closest('span').find('.autocomp').prop('disabled', !$(r).prop('checked'));
            });
            if (radio.prop('checked')) {
                radio.closest('span').find('.autocomp:visible').focus();
            }
        })
            .on('submit', function (ev) {
            var perm = {}, klass, auto;
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
                'success': function () {
                    console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                    $('<div>').text('Set Permission').addClass('success')
                        .appendTo($('form.permissions')).delay(5000).fadeOut(2000);
                },
                'error': function (xhr, status, err) {
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
    function processCarbonBalanceData() {
        // Prepare the carbon balance graph
        this.carbonBalanceData = new CarbonBalance.Display();
        var highlightCarbonBalanceWidget = false;
        if (this.biomassCalculation > -1) {
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID, this.biomassCalculation);
            // Highlight the "Show Carbon Balance" checkbox in red if there are CB issues.
            if (this.carbonBalanceData.getNumberOfImbalances() > 0) {
                highlightCarbonBalanceWidget = true;
            }
        }
        else {
            // Highlight the carbon balance in red to indicate that we can't calculate
            // carbon balances yet. When they click the checkbox, we'll get them to
            // specify which SBML file to use for biomass.
            highlightCarbonBalanceWidget = true;
        }
        this.linesDataGridSpec.highlightCarbonBalanceWidget(highlightCarbonBalanceWidget);
    }
    StudyD.processCarbonBalanceData = processCarbonBalanceData;
    function filterTableKeyDown(context, e) {
        switch (e.keyCode) {
            case 38: // up
            case 40: // down
            case 9: // tab
            case 13:
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
    function prepareAfterLinesTable() {
        var _this = this;
        var csIDs;
        // Prepare the main data overview graph at the top of the page
        if (this.mainGraphObject === null && $('#maingraph').size() === 1) {
            this.mainGraphObject = Object.create(StudyDGraphing);
            this.mainGraphObject.Setup('maingraph');
            this.progressiveFilteringWidget.mainGraphObject = this.mainGraphObject;
        }
        $('#mainFilterSection').on('mouseover mousedown mouseup', function () { return _this.queueMainGraphRemake(); })
            .on('keydown', function (e) { return filterTableKeyDown(_this, e); });
        $('#separateAxesCheckbox').on('change', function () { return _this.queueMainGraphRemake(true); });
        // Enable edit lines button
        $('#editLineButton').on('click', function (ev) {
            var button = $(ev.target), data = button.data(), form = clearLineForm(), allMeta = {}, metaRow;
            if (data.ids.length === 1) {
                fillLineForm(form, EDDData.Lines[data.ids[0]]);
            }
            else {
                // compute used metadata fields on all data.ids, insert metadata rows?
                data.ids.map(function (id) { return EDDData.Lines[id] || {}; }).forEach(function (line) {
                    $.extend(allMeta, line.meta || {});
                });
                metaRow = form.find('.line-edit-meta');
                // Run through the collection of metadata, and add a form element entry for each
                $.each(allMeta, function (key) { return insertLineMetadataRow(metaRow, key, ''); });
            }
            updateUILineForm(form, data.count > 1);
            scrollToForm(form);
            form.find('[name=line-ids]').val(data.ids.join(','));
            return false;
        });
        // Hacky button for changing the metabolic map
        $("#metabolicMapName").click(function () { return _this.onClickedMetabolicMapName(); });
        requestAllMetaboliteData(this);
    }
    StudyD.prepareAfterLinesTable = prepareAfterLinesTable;
    function requestAllMetaboliteData(context) {
        $.each(EDDData.Protocols, function (id, protocol) {
            $.ajax({
                url: 'measurements/' + id + '/',
                type: 'GET',
                dataType: 'json',
                error: function (xhr, status) {
                    console.log('Failed to fetch measurement data on ' + protocol.name + '!');
                    console.log(status);
                },
                success: function (data) { processMeasurementData(context, data, protocol); }
            });
        });
    }
    function requestAssayData(assay) {
        var _this = this;
        var protocol = EDDData.Protocols[assay.pid];
        $.ajax({
            url: ['measurements', assay.pid, assay.id, ''].join('/'),
            type: 'GET',
            dataType: 'json',
            error: function (xhr, status) {
                console.log('Failed to fetch measurement data on ' + assay.name + '!');
                console.log(status);
            },
            success: function (data) { processMeasurementData(_this, data, protocol); }
        });
    }
    StudyD.requestAssayData = requestAssayData;
    function processMeasurementData(context, data, protocol) {
        var assaySeen = {}, protocolToAssay = {}, count_total = 0, count_rec = 0;
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);
        // attach measurement counts to each assay
        $.each(data.total_measures, function (assayId, count) {
            var assay = EDDData.Assays[assayId];
            if (assay) {
                assay.count = count;
                count_total += count;
            }
        });
        // loop over all downloaded measurements
        $.each(data.measures || {}, function (index, measurement) {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            ++count_rec;
            if (!assay || !assay.active)
                return;
            line = EDDData.Lines[assay.lid];
            if (!line || !line.active)
                return;
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
            if (mtype.family === 'm') {
                (assay.metabolites = assay.metabolites || []).push(measurement.id);
            }
            else if (mtype.family === 'p') {
                (assay.proteins = assay.proteins || []).push(measurement.id);
            }
            else if (mtype.family === 'g') {
                (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
            }
            else {
                // throw everything else in a general area
                (assay.general = assay.general || []).push(measurement.id);
            }
        });
        context.progressiveFilteringWidget.processIncomingMeasurementRecords(data.measures || {}, data.types);
        if (count_rec < count_total) {
        }
        // invalidate assays on all DataGrids; redraws the affected rows
        $.each(context.assaysDataGrids, function (protocolId, dataGrid) {
            dataGrid.invalidateAssayRecords(Object.keys(protocolToAssay[protocolId] || {}));
        });
        context.linesDataGridSpec.enableCarbonBalanceWidget(true);
        context.processCarbonBalanceData();
        context.queueMainGraphRemake();
    }
    function carbonBalanceColumnRevealedCallback(spec, dataGridObj) {
        StudyD.rebuildCarbonBalanceGraphs();
    }
    StudyD.carbonBalanceColumnRevealedCallback = carbonBalanceColumnRevealedCallback;
    // Start a timer to wait before calling the routine that shows the actions panel.
    function queueLinesActionPanelShow() {
        var _this = this;
        if (this.linesActionPanelRefreshTimer) {
            clearTimeout(this.linesActionPanelRefreshTimer);
        }
        this.linesActionPanelRefreshTimer = setTimeout(function () { return linesActionPanelShow(_this); }, 150);
    }
    StudyD.queueLinesActionPanelShow = queueLinesActionPanelShow;
    function linesActionPanelShow(context) {
        // Figure out how many lines are selected.
        var checkedBoxes = [], checkedLen, linesActionPanel;
        if (context.linesDataGrid) {
            checkedBoxes = context.linesDataGrid.getSelectedCheckboxElements();
        }
        checkedLen = checkedBoxes.length;
        linesActionPanel = $('#linesActionPanel').toggleClass('off', !checkedLen);
        $('#linesSelectedCell').empty().text(checkedLen + ' selected');
        // enable singular/plural changes
        $('#cloneLineButton').text('Clone Line' + (checkedLen > 1 ? 's' : ''));
        $('#editLineButton').text('Edit Line' + (checkedLen > 1 ? 's' : '')).data({
            'count': checkedLen,
            'ids': checkedBoxes.map(function (box) { return box.value; })
        });
        $('#groupLineButton').toggleClass('off', checkedLen < 2);
    }
    function queueAssaysActionPanelShow() {
        var _this = this;
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        if (this.assaysActionPanelRefreshTimer) {
            clearTimeout(this.assaysActionPanelRefreshTimer);
        }
        this.assaysActionPanelRefreshTimer = setTimeout(function () { return assaysActionPanelShow(_this); }, 150);
    }
    StudyD.queueAssaysActionPanelShow = queueAssaysActionPanelShow;
    function assaysActionPanelShow(context) {
        var checkedBoxes = [], checkedAssays, checkedMeasure, panel, infobox;
        panel = $('#assaysActionPanel');
        if (!panel.size()) {
            return;
        }
        // Figure out how many assays/checkboxes are selected.
        $.each(context.assaysDataGrids, function (pID, dataGrid) {
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
    function queueMainGraphRemake(force) {
        var _this = this;
        if (this.mainGraphRefreshTimerID) {
            clearTimeout(this.mainGraphRefreshTimerID);
        }
        this.mainGraphRefreshTimerID = setTimeout(function () { return remakeMainGraphArea(_this, force); }, 200);
    }
    StudyD.queueMainGraphRemake = queueMainGraphRemake;
    function remakeMainGraphArea(context, force) {
        var previousIDSet, postFilteringMeasurements, dataPointsDisplayed = 0, dataPointsTotal = 0, separateAxes = $('#separateAxesCheckbox').prop('checked'), 
        // FIXME assumes (x0, y0) points
        convert = function (d) { return [[d[0][0], d[1][0]]]; }, compare = function (a, b) { return a[0] - b[0]; };
        context.mainGraphRefreshTimerID = 0;
        if (!context.progressiveFilteringWidget.checkRedrawRequired(force)) {
            return;
        }
        // Start out with a blank graph.  We will re-add all the relevant sets.
        context.mainGraphObject.clearAllSets();
        postFilteringMeasurements = context.progressiveFilteringWidget.buildFilteredMeasurements();
        $.each(postFilteringMeasurements, function (i, measurementId) {
            var measure = EDDData.AssayMeasurements[measurementId], mtype = EDDData.MeasurementTypes[measure.type], points = (measure.values ? measure.values.length : 0), assay, line, protocol, newSet;
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
            if (line.control)
                newSet.iscontrol = 1;
            if (separateAxes) {
                // If the measurement is a metabolite, choose the axis by type. If it's any
                // other subtype, choose the axis based on that subtype, with an offset to avoid
                // colliding with the metabolite axes.
                if (mtype.family === 'm') {
                    newSet.yaxisByMeasurementTypeID = mtype.id;
                }
                else {
                    newSet.yaxisByMeasurementTypeID = mtype.family;
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
    function clearAssayForm() {
        var form = $('#id_assay-assay_id').closest('.disclose');
        form.find('[name^=assay-]').val('').end().find('.cancel-link').remove();
        form.find('.errorlist').remove();
        return form;
    }
    function clearLineForm() {
        var form = $('#id_line-ids').closest('.disclose');
        form.find('.line-meta').remove();
        form.find(':input').filter('[name^=line-]').val('');
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
        form.find('[name=line-carbon_source_0]').val(record.carbon.map(function (v) { return (EDDData.CSources[v] || {}).name || '--'; }).join(','));
        form.find('[name=line-carbon_source_1]').val(record.carbon.join(','));
        form.find('[name=line-strains_0]').val(record.strain.map(function (v) { return (EDDData.Strains[v] || {}).name || '--'; }).join(','));
        form.find('[name=line-strains_1]').val(record.strain.map(function (v) { return (EDDData.Strains[v] || {}).registry_id || ''; }).join(','));
        if (record.strain.length && form.find('[name=line-strains_1]').val() === '') {
            $('<li>').text('Strain does not have a linked ICE entry! ' +
                'Saving the line without linking to ICE will remove the strain.')
                .wrap('<ul>').parent().addClass('errorlist')
                .appendTo(form.find('[name=line-strains_0]').parent());
        }
        metaRow = form.find('.line-edit-meta');
        // Run through the collection of metadata, and add a form element entry for each
        $.each(record.meta, function (key, value) {
            insertLineMetadataRow(metaRow, key, value);
        });
        // store original metadata in initial- field
        form.find('[name=line-meta_store]').val(JSON.stringify(record.meta));
        form.find('[name=initial-line-meta_store]').val(JSON.stringify(record.meta));
    }
    function scrollToForm(form) {
        // make sure form is disclosed
        var top = form.toggleClass('discloseHide', false).offset().top;
        $('html').animate({ 'scrollTop': top }, 'slow');
    }
    function updateUIAssayForm(form) {
        var title, button;
        // Update the disclose title to read Edit
        title = form.find('.discloseLink > a').text('Edit Assay');
        // Update the button to read Edit
        button = form.find('[name=action][value=assay]').text('Edit Assay');
        // Add link to revert back to 'Add Line' form
        $('<a href="#">Cancel</a>').addClass('cancel-link').on('click', function (ev) {
            clearAssayForm();
            title.text('Add Assays To Selected Lines');
            button.text('Add Assay');
            return false;
        }).insertAfter(button);
    }
    function updateUILineForm(form, plural) {
        var title, button, text = 'Edit Line' + (plural ? 's' : '');
        // Update the disclose title to read 'Edit Line'
        title = form.find('.discloseLink > a').text(text);
        // Update the button to read 'Edit Line'
        button = form.find('[name=action][value=line]').text(text);
        if (plural) {
            form.find('.bulk').prop('checked', false).removeClass('off');
            form.on('change.bulk', ':input', function (ev) {
                $(ev.target).siblings('label').find('.bulk').prop('checked', true);
            });
        }
        // Add link to revert back to 'Add Line' form
        $('<a href="#">Cancel</a>').addClass('cancel-link').on('click', function (ev) {
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
    function editAssay(index) {
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
    StudyD.editAssay = editAssay;
    function editLine(index) {
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
    StudyD.editLine = editLine;
    function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        }
        else {
            $("#metabolicMapName").html('(none)');
        }
        if (this.biomassCalculation && this.biomassCalculation != -1) {
            // Calculate carbon balances now that we can.
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID, this.biomassCalculation);
            // Rebuild the CB graphs.
            this.carbonBalanceDisplayIsFresh = false;
            this.rebuildCarbonBalanceGraphs();
        }
    }
    StudyD.onChangedMetabolicMap = onChangedMetabolicMap;
    function rebuildCarbonBalanceGraphs() {
        var _this = this;
        var cellObjs, group = this.linesDataGridSpec.carbonBalanceCol;
        if (this.carbonBalanceDisplayIsFresh) {
            return;
        }
        // Drop any previously created Carbon Balance SVG elements from the DOM.
        this.carbonBalanceData.removeAllCBGraphs();
        cellObjs = [];
        // get all cells from all columns in the column group
        group.memberColumns.forEach(function (col) {
            Array.prototype.push.apply(cellObjs, col.getEntireIndex());
        });
        // create carbon balance graph for each cell
        cellObjs.forEach(function (cell) {
            _this.carbonBalanceData.createCBGraphForLine(cell.recordID, cell.cellElement);
        });
        this.carbonBalanceDisplayIsFresh = true;
    }
    StudyD.rebuildCarbonBalanceGraphs = rebuildCarbonBalanceGraphs;
    // They want to select a different metabolic map.
    function onClickedMetabolicMapName() {
        var _this = this;
        var ui, callback = function (error, metabolicMapID, metabolicMapName, finalBiomass) {
            if (!error) {
                _this.metabolicMapID = metabolicMapID;
                _this.metabolicMapName = metabolicMapName;
                _this.biomassCalculation = finalBiomass;
                _this.onChangedMetabolicMap();
            }
            else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }
    StudyD.onClickedMetabolicMapName = onClickedMetabolicMapName;
})(StudyD || (StudyD = {}));
;
// The spec object that will be passed to DataGrid to create the Lines table
var DataGridSpecLines = (function (_super) {
    __extends(DataGridSpecLines, _super);
    function DataGridSpecLines() {
        this.findMetaDataIDsUsedInLines();
        this.findGroupIDsAndNames();
        _super.call(this);
    }
    DataGridSpecLines.prototype.highlightCarbonBalanceWidget = function (v) {
        this.carbonBalanceWidget.highlight(v);
    };
    DataGridSpecLines.prototype.enableCarbonBalanceWidget = function (v) {
        this.carbonBalanceWidget.enable(v);
    };
    DataGridSpecLines.prototype.findMetaDataIDsUsedInLines = function () {
        var seenHash = {};
        // loop lines
        $.each(this.getRecordIDs(), function (index, id) {
            var line = EDDData.Lines[id];
            if (line) {
                $.each(line.meta || {}, function (key) { return seenHash[key] = true; });
            }
        });
        // store all metadata IDs seen
        this.metaDataIDsUsedInLines = Object.keys(seenHash);
    };
    DataGridSpecLines.prototype.findGroupIDsAndNames = function () {
        var _this = this;
        var rowGroups = {};
        // Gather all the row IDs under the group ID each belongs to.
        $.each(this.getRecordIDs(), function (index, id) {
            var line = EDDData.Lines[id], rep = line.replicate;
            if (rep) {
                // use parent replicate as a replicate group ID, push all matching line IDs
                (rowGroups[rep] = rowGroups[rep] || [rep]).push(id);
            }
        });
        this.groupIDsToGroupNames = {};
        // For each group ID, just use parent replicate name
        $.each(rowGroups, function (group, lines) {
            _this.groupIDsToGroupNames[group] = EDDData.Lines[group].name;
        });
        // alphanumeric sort of group IDs by name attached to those replicate groups
        this.groupIDsInOrder = Object.keys(rowGroups).sort(function (a, b) {
            var u = _this.groupIDsToGroupNames[a], v = _this.groupIDsToGroupNames[b];
            return u < v ? -1 : u > v ? 1 : 0;
        });
        // Now that they're sorted by name, create a hash for quickly resolving IDs to indexes in
        // the sorted array
        this.groupIDsToGroupIndexes = {};
        $.each(this.groupIDsInOrder, function (index, group) { return _this.groupIDsToGroupIndexes[group] = index; });
    };
    // Specification for the table as a whole
    DataGridSpecLines.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('lines', { 'name': 'Lines' });
    };
    DataGridSpecLines.prototype.loadLineName = function (index) {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.name.toUpperCase();
        }
        return '';
    };
    DataGridSpecLines.prototype.loadStrainName = function (index) {
        // ensure a strain ID exists on line, is a known strain, uppercase first found name or '?'
        var line, strain;
        if ((line = EDDData.Lines[index])) {
            if (line.strain && line.strain.length && (strain = EDDData.Strains[line.strain[0]])) {
                return strain.name.toUpperCase();
            }
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadFirstCarbonSource = function (index) {
        // ensure carbon source ID(s) exist on line, ensure at least one source ID, ensure first ID
        // is known carbon source
        var line, source;
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length && (source = EDDData.CSources[line.carbon[0]])) {
                return source;
            }
        }
        return undefined;
    };
    DataGridSpecLines.prototype.loadCarbonSource = function (index) {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.name.toUpperCase();
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadCarbonSourceLabeling = function (index) {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.labeling.toUpperCase();
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadExperimenterInitials = function (index) {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var line, experimenter;
        if ((line = EDDData.Lines[index])) {
            if ((experimenter = EDDData.Users[line.experimenter])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadLineModification = function (index) {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.modified.time;
        }
        return undefined;
    };
    // Specification for the headers along the top of the table
    DataGridSpecLines.prototype.defineHeaderSpec = function () {
        var _this = this;
        var leftSide = [
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
        var metaDataHeaders = this.metaDataIDsUsedInLines.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(6 + index, 'hLinesMeta' + id, {
                'name': mdType.name,
                'size': 's',
                'sortBy': _this.makeMetaDataSortFunction(id),
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
    };
    DataGridSpecLines.prototype.makeMetaDataSortFunction = function (id) {
        return function (i) {
            var line = EDDData.Lines[i];
            if (line && line.meta) {
                return line.meta[id] || '';
            }
            return '';
        };
    };
    // The colspan value for all the cells that are not 'carbon source' or 'labeling'
    // is based on the number of carbon sources for the respective record.
    // Specifically, it's either the number of carbon sources, or 1, whichever is higher.
    DataGridSpecLines.prototype.rowSpanForRecord = function (index) {
        return (EDDData.Lines[index].carbon || []).length || 1;
    };
    DataGridSpecLines.prototype.generateLineNameCells = function (gridSpec, index) {
        var line = EDDData.Lines[index];
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'lineId',
                'checkboxWithID': function (id) { return 'line' + id + 'include'; },
                'sideMenuItems': [
                    '<a href="#editline" class="line-edit-link">Edit Line</a>',
                    '<a href="/export?lineId=' + index + '">Export Data as CSV/etc</a>'
                ],
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name + (line.ctrl ? '<b class="iscontroldata">C</b>' : '')
            })
        ];
    };
    DataGridSpecLines.prototype.generateStrainNameCells = function (gridSpec, index) {
        var line, content = [];
        if ((line = EDDData.Lines[index])) {
            content = line.strain.map(function (id) {
                var strain = EDDData.Strains[id];
                return ['<a href="', strain.registry_url, '">', strain.name, '</a>'].join('');
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content.join('; ') || '--'
            })
        ];
    };
    DataGridSpecLines.prototype.generateCarbonSourceCells = function (gridSpec, index) {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map(function (id) { return EDDData.CSources[id].name; });
            }
        }
        return strings.map(function (name) {
            return new DataGridDataCell(gridSpec, index, { 'contentString': name });
        });
    };
    DataGridSpecLines.prototype.generateCarbonSourceLabelingCells = function (gridSpec, index) {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map(function (id) { return EDDData.CSources[id].labeling; });
            }
        }
        return strings.map(function (labeling) {
            return new DataGridDataCell(gridSpec, index, { 'contentString': labeling });
        });
    };
    DataGridSpecLines.prototype.generateCarbonBalanceBlankCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'minWidth': 200
            })
        ];
    };
    DataGridSpecLines.prototype.generateExperimenterInitialsCells = function (gridSpec, index) {
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
    };
    DataGridSpecLines.prototype.generateModificationDateCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Lines[index].modified.time)
            })
        ];
    };
    DataGridSpecLines.prototype.makeMetaDataCellsGeneratorFunction = function (id) {
        return function (gridSpec, index) {
            var contentStr = '', line = EDDData.Lines[index], type = EDDData.MetaDataTypes[id];
            if (line && type && line.meta && (contentStr = line.meta[id] || '')) {
                contentStr = [type.pre || '', contentStr, type.postfix || ''].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr
                })
            ];
        };
    };
    // Specification for each of the data columns that will make up the body of the table
    DataGridSpecLines.prototype.defineColumnSpec = function () {
        var _this = this;
        var leftSide, metaDataCols, rightSide;
        // add click handler for menu on line name cells
        $(this.tableElement).on('click', 'a.line-edit-link', function (ev) {
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
        metaDataCols = this.metaDataIDsUsedInLines.map(function (id, index) {
            return new DataGridColumnSpec(6 + index, _this.makeMetaDataCellsGeneratorFunction(id));
        });
        rightSide = [
            new DataGridColumnSpec(6 + metaDataCols.length, this.generateExperimenterInitialsCells),
            new DataGridColumnSpec(7 + metaDataCols.length, this.generateModificationDateCells)
        ];
        return leftSide.concat(metaDataCols, rightSide);
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecLines.prototype.defineColumnGroupSpec = function () {
        var topSection = [
            new DataGridColumnGroupSpec('Line Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Strain'),
            new DataGridColumnGroupSpec('Carbon Source(s)'),
            new DataGridColumnGroupSpec('Labeling'),
            this.carbonBalanceCol = new DataGridColumnGroupSpec('Carbon Balance', {
                'showInVisibilityList': false,
                'hiddenByDefault': true,
                'revealedCallback': StudyD.carbonBalanceColumnRevealedCallback
            })
        ];
        var metaDataColGroups;
        metaDataColGroups = this.metaDataIDsUsedInLines.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });
        var bottomSection = [
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
        ];
        return topSection.concat(metaDataColGroups, bottomSection);
    };
    // Specification for the groups that rows can be gathered into
    DataGridSpecLines.prototype.defineRowGroupSpec = function () {
        var rowGroupSpec = [];
        for (var x = 0; x < this.groupIDsInOrder.length; x++) {
            var id = this.groupIDsInOrder[x];
            var rowGroupSpecEntry = {
                name: this.groupIDsToGroupNames[id]
            };
            rowGroupSpec.push(rowGroupSpecEntry);
        }
        return rowGroupSpec;
    };
    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    DataGridSpecLines.prototype.getTableElement = function () {
        return document.getElementById("studyLinesTable");
    };
    // An array of unique identifiers (numbers, not strings), used to identify the records in the
    // data set being displayed
    DataGridSpecLines.prototype.getRecordIDs = function () {
        return Object.keys(EDDData.Lines);
    };
    // This is called to generate the array of custom header widgets. The order of the array will be
    // the order they are added to the header bar. It's perfectly fine to return an empty array.
    DataGridSpecLines.prototype.createCustomHeaderWidgets = function (dataGrid) {
        var widgetSet = [];
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
    };
    // This is called to generate the array of custom options menu widgets. The order of the array
    // will be the order they are displayed in the menu. Empty array = OK.
    DataGridSpecLines.prototype.createCustomOptionsWidgets = function (dataGrid) {
        var widgetSet = [];
        // Create a single widget for showing disabled Lines
        var groupLinesWidget = new DGGroupStudyReplicatesWidget(dataGrid, this);
        widgetSet.push(groupLinesWidget);
        var disabledLinesWidget = new DGDisabledLinesWidget(dataGrid, this);
        widgetSet.push(disabledLinesWidget);
        return widgetSet;
    };
    // This is called after everything is initialized, including the creation of the table content.
    DataGridSpecLines.prototype.onInitialized = function (dataGrid) {
        // Wire up the 'action panels' for the Lines and Assays sections
        var linesTable = this.getTableElement();
        $(linesTable).on('change', ':checkbox', function () { return StudyD.queueLinesActionPanelShow(); });
        // This calls down into the instantiated widget and alters its styling,
        // so we need to do it after the table has been created.
        this.enableCarbonBalanceWidget(false);
        // Wire-in our custom edit fields for the Studies page, and continue with general init
        StudyD.prepareAfterLinesTable();
    };
    return DataGridSpecLines;
})(DataGridSpecBase);
// When unchecked, this hides the set of Lines that are marked as disabled.
var DGDisabledLinesWidget = (function (_super) {
    __extends(DGDisabledLinesWidget, _super);
    function DGDisabledLinesWidget() {
        _super.apply(this, arguments);
    }
    DGDisabledLinesWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'ShowDLinesCB' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) { return _this.dataGridOwnerObject.clickedOptionWidget(e); });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);
        ;
        this._createdElements = true;
    };
    DGDisabledLinesWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var checked = false;
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
    };
    DGDisabledLinesWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        if (!EDDData.Lines[rowID].active) {
            $.each(dataRowObjects, function (x, row) { return $(row.getElement()).addClass('disabledRecord'); });
        }
    };
    return DGDisabledLinesWidget;
})(DataGridOptionWidget);
// A widget to toggle replicate grouping on and off
var DGGroupStudyReplicatesWidget = (function (_super) {
    __extends(DGGroupStudyReplicatesWidget, _super);
    function DGGroupStudyReplicatesWidget() {
        _super.apply(this, arguments);
    }
    DGGroupStudyReplicatesWidget.prototype.createElements = function (uniqueID) {
        var pThis = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'GroupStudyReplicatesCB' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) {
            if (pThis.checkBoxElement.checked) {
                pThis.dataGridOwnerObject.turnOnRowGrouping();
            }
            else {
                pThis.dataGridOwnerObject.turnOffRowGrouping();
            }
        });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Group Replicates', cbID);
        this._createdElements = true;
    };
    return DGGroupStudyReplicatesWidget;
})(DataGridOptionWidget);
// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
var DGLinesSearchWidget = (function (_super) {
    __extends(DGLinesSearchWidget, _super);
    function DGLinesSearchWidget(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus) {
        _super.call(this, dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
    }
    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    DGLinesSearchWidget.prototype.createElements = function (uniqueID) {
        _super.prototype.createElements.call(this, uniqueID);
        this.createdElements(true);
    };
    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    DGLinesSearchWidget.prototype.appendElements = function (container, uniqueID) {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    };
    return DGLinesSearchWidget;
})(DGSearchWidget);
// A header widget to prepare the Carbon Balance table cells, and show or hide them.
var DGShowCarbonBalanceWidget = (function (_super) {
    __extends(DGShowCarbonBalanceWidget, _super);
    function DGShowCarbonBalanceWidget(dataGridOwnerObject, dataGridSpec) {
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        this.checkboxEnabled = true;
        this.highlighted = false;
        this._lineSpec = dataGridSpec;
    }
    DGShowCarbonBalanceWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'CarBal' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        cb.className = 'tableControl';
        $(cb).click(function (ev) {
            _this.activateCarbonBalance();
        });
        var label = this._createLabel('Carbon Balance', cbID);
        var span = document.createElement("span");
        span.className = 'tableControl';
        span.appendChild(cb);
        span.appendChild(label);
        this.checkBoxElement = cb;
        this.labelElement = label;
        this.element = span;
        this.createdElements(true);
    };
    DGShowCarbonBalanceWidget.prototype.highlight = function (h) {
        this.highlighted = h;
        if (this.checkboxEnabled) {
            if (h) {
                this.labelElement.style.color = 'red';
            }
            else {
                this.labelElement.style.color = '';
            }
        }
    };
    DGShowCarbonBalanceWidget.prototype.enable = function (h) {
        this.checkboxEnabled = h;
        if (h) {
            this.highlight(this.highlighted);
            this.checkBoxElement.removeAttribute('disabled');
        }
        else {
            this.labelElement.style.color = 'gray';
            this.checkBoxElement.setAttribute('disabled', true);
        }
    };
    DGShowCarbonBalanceWidget.prototype.activateCarbonBalance = function () {
        var _this = this;
        var ui, callback;
        callback = function (error, metabolicMapID, metabolicMapFilename, finalBiomass) {
            if (!error) {
                StudyD.metabolicMapID = metabolicMapID;
                StudyD.metabolicMapName = metabolicMapFilename;
                StudyD.biomassCalculation = finalBiomass;
                StudyD.onChangedMetabolicMap();
                _this.checkBoxElement.checked = true;
                _this.dataGridOwnerObject.showColumn(_this._lineSpec.carbonBalanceCol);
            }
        };
        if (this.checkBoxElement.checked) {
            // We need to get a biomass calculation to multiply against OD.
            // Have they set this up yet?
            if (!StudyD.biomassCalculation || StudyD.biomassCalculation === -1) {
                this.checkBoxElement.checked = false;
                // Must setup the biomass
                ui = new FullStudyBiomassUI(callback);
            }
            else {
                this.dataGridOwnerObject.showColumn(this._lineSpec.carbonBalanceCol);
            }
        }
        else {
            this.dataGridOwnerObject.hideColumn(this._lineSpec.carbonBalanceCol);
        }
    };
    return DGShowCarbonBalanceWidget;
})(DataGridHeaderWidget);
var DataGridAssays = (function (_super) {
    __extends(DataGridAssays, _super);
    function DataGridAssays(dataGridSpec) {
        this.recordsCurrentlyInvalidated = [];
        this.sectionCurrentlyDisclosed = false;
        _super.call(this, dataGridSpec);
    }
    DataGridAssays.prototype.invalidateAssayRecords = function (records) {
        this.recordsCurrentlyInvalidated = this.recordsCurrentlyInvalidated.concat(records);
        if (!this.recordsCurrentlyInvalidated.length) {
            return;
        }
        if (this.sectionCurrentlyDisclosed) {
            this.triggerAssayRecordsRefresh();
        }
    };
    DataGridAssays.prototype.clickedDisclose = function (disclose) {
        var _this = this;
        var spec = this.getSpec();
        var table = spec.getTableElement();
        var div = spec.undisclosedSectionDiv;
        if (!div || !table) {
            return;
        }
        if (disclose) {
            this.sectionCurrentlyDisclosed = true;
            // Start a timer to wait before calling the routine that remakes a table. This breaks up
            // table recreation into separate events, so the browser can update UI.
            if (this.recordsCurrentlyInvalidated.length) {
                setTimeout(function () { return _this.triggerAssayRecordsRefresh(); }, 10);
            }
        }
        else {
            this.sectionCurrentlyDisclosed = false;
        }
    };
    DataGridAssays.prototype.triggerAssayRecordsRefresh = function () {
        try {
            this.triggerDataReset();
            this.recordsCurrentlyInvalidated = [];
            this.queueGraphRemake();
        }
        catch (e) {
            console.log('Failed to execute records refresh: ' + e);
        }
    };
    DataGridAssays.prototype._cancelGraph = function () {
        if (this.graphRefreshTimerID) {
            clearTimeout(this.graphRefreshTimerID);
            delete this.graphRefreshTimerID;
        }
    };
    // Start a timer to wait before calling the routine that remakes the graph.
    DataGridAssays.prototype.queueGraphRemake = function () {
        var _this = this;
        this._cancelGraph();
        this.graphRefreshTimerID = setTimeout(function () { return _this.remakeGraphArea(); }, 100);
    };
    DataGridAssays.prototype.remakeGraphArea = function () {
        var spec = this.getSpec(), g, convert, compare;
        // if called directly, cancel any pending requests in "queue"
        this._cancelGraph();
        if (!StudyDGraphing || !spec || !spec.graphObject) {
            return;
        }
        g = spec.graphObject;
        g.clearAllSets();
        // function converts downloaded data point to form usable by flot
        // FIXME assumes (x0, y0) points only
        convert = function (d) { return [[d[0][0], d[1][0]]]; };
        // function comparing two points, to sort data sent to flot
        compare = function (a, b) { return a[0] - b[0]; };
        spec.getRecordIDs().forEach(function (id) {
            var assay = EDDData.Assays[id] || {}, line = EDDData.Lines[assay.lid] || {}, measures;
            if (!assay.active || !line.active) {
                return;
            }
            measures = assay.measures || [];
            measures.forEach(function (m) {
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
                if (line.control)
                    set.iscontrol = true;
                g.addNewSet(set);
            });
        });
        g.drawSets();
    };
    // Note: Currently not being called.
    DataGridAssays.prototype.resizeGraph = function (g) {
        var spec = this.getSpec();
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
    };
    return DataGridAssays;
})(DataGrid);
// The spec object that will be passed to DataGrid to create the Assays table(s)
var DataGridSpecAssays = (function (_super) {
    __extends(DataGridSpecAssays, _super);
    function DataGridSpecAssays(protocolID) {
        this.protocolID = protocolID;
        this.protocolName = EDDData.Protocols[protocolID].name;
        this.graphObject = null;
        this.measuringTimesHeaderSpec = null;
        this.graphAreaHeaderSpec = null;
        this.refreshIDList();
        this.findMaximumXValueInData();
        this.findMetaDataIDsUsedInAssays();
        _super.call(this);
    }
    DataGridSpecAssays.prototype.refreshIDList = function () {
        var _this = this;
        // Find out which protocols have assays with measurements - disabled or no
        this.assayIDsInProtocol = [];
        $.each(EDDData.Assays, function (assayId, assay) {
            var line;
            if (_this.protocolID !== assay.pid) {
            }
            else if (!(line = EDDData.Lines[assay.lid]) || !line.active) {
            }
            else {
                _this.assayIDsInProtocol.push(assay.id);
            }
        });
    };
    // An array of unique identifiers, used to identify the records in the data set being displayed
    DataGridSpecAssays.prototype.getRecordIDs = function () {
        return this.assayIDsInProtocol;
    };
    // This is an override.  Called when a data rest is triggered, but before the table rows are
    // rebuilt.
    DataGridSpecAssays.prototype.onDataReset = function (dataGrid) {
        this.findMaximumXValueInData();
        if (this.measuringTimesHeaderSpec && this.measuringTimesHeaderSpec.element) {
            $(this.measuringTimesHeaderSpec.element).children(':first').text('Measuring Times (Range 0 to ' + this.maximumXValueInData + ')');
        }
    };
    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    DataGridSpecAssays.prototype.getTableElement = function () {
        var section, protocolDiv, titleDiv, titleLink, table, p = this.protocolID, tableID = 'pro' + p + 'assaystable';
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
    };
    // Specification for the table as a whole
    DataGridSpecAssays.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('assays' + this.protocolID, {
            'defaultSort': 1
        });
    };
    DataGridSpecAssays.prototype.findMetaDataIDsUsedInAssays = function () {
        var seenHash = {};
        this.metaDataIDsUsedInAssays = [];
        this.getRecordIDs().forEach(function (assayId) {
            var assay = EDDData.Assays[assayId];
            $.each(assay.meta || {}, function (metaId) { seenHash[metaId] = true; });
        });
        [].push.apply(this.metaDataIDsUsedInAssays, Object.keys(seenHash));
    };
    DataGridSpecAssays.prototype.findMaximumXValueInData = function () {
        var maxForAll = 0;
        // reduce to find highest value across all records
        maxForAll = this.getRecordIDs().reduce(function (prev, assayId) {
            var assay = EDDData.Assays[assayId], measures, maxForRecord;
            measures = assay.measures || [];
            // reduce to find highest value across all measures
            maxForRecord = measures.reduce(function (prev, measureId) {
                var lookup = EDDData.AssayMeasurements || {}, measure = lookup[measureId] || {}, maxForMeasure;
                // reduce to find highest value across all data in measurement
                maxForMeasure = (measure.values || []).reduce(function (prev, point) {
                    return Math.max(prev, point[0][0]);
                }, 0);
                return Math.max(prev, maxForMeasure);
            }, 0);
            return Math.max(prev, maxForRecord);
        }, 0);
        // Anything above 0 is acceptable, but 0 will default instead to 1.
        this.maximumXValueInData = maxForAll || 1;
    };
    DataGridSpecAssays.prototype.loadAssayName = function (index) {
        // In an old typical EDDData.Assays record this string is currently pre-assembled and stored
        // in 'fn'. But we're phasing that out.
        var assay, line;
        if ((assay = EDDData.Assays[index])) {
            if ((line = EDDData.Lines[assay.lid])) {
                return [line.n, this.protocolName, assay.name].join('-').toUpperCase();
            }
        }
        return '';
    };
    DataGridSpecAssays.prototype.loadExperimenterInitials = function (index) {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var assay, experimenter;
        if ((assay = EDDData.Assays[index])) {
            if ((experimenter = EDDData.Users[assay.exp])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    };
    DataGridSpecAssays.prototype.loadAssayModification = function (index) {
        return EDDData.Assays[index].mod;
    };
    // Specification for the headers along the top of the table
    DataGridSpecAssays.prototype.defineHeaderSpec = function () {
        var _this = this;
        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders = this.metaDataIDsUsedInAssays.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(2 + index, 'hAssaysMeta' + _this.protocolID + 'id' + id, {
                'name': mdType.name,
                'headerRow': 2,
                'size': 's',
                'sortBy': _this.makeMetaDataSortFunction(id),
                'sortAfter': 1
            });
        });
        this.graphAreaHeaderSpec = new DataGridHeaderSpec(8 + metaDataHeaders.length, 'hAssaysGraph' + this.protocolID, { 'colspan': 7 + metaDataHeaders.length });
        var leftSide = [
            this.graphAreaHeaderSpec,
            new DataGridHeaderSpec(1, 'hAssaysName' + this.protocolID, {
                'name': 'Name',
                'headerRow': 2,
                'sortBy': this.loadAssayName
            })
        ];
        this.measuringTimesHeaderSpec = new DataGridHeaderSpec(5 + metaDataHeaders.length, 'hAssaysMTimes' + this.protocolID, { 'name': 'Measuring Times', 'headerRow': 2 });
        var rightSide = [
            new DataGridHeaderSpec(2 + metaDataHeaders.length, 'hAssaysMName' + this.protocolID, { 'name': 'Measurement', 'headerRow': 2 }),
            new DataGridHeaderSpec(3 + metaDataHeaders.length, 'hAssaysUnits' + this.protocolID, { 'name': 'Units', 'headerRow': 2 }),
            new DataGridHeaderSpec(4 + metaDataHeaders.length, 'hAssaysCount' + this.protocolID, { 'name': 'Count', 'headerRow': 2 }),
            this.measuringTimesHeaderSpec,
            new DataGridHeaderSpec(6 + metaDataHeaders.length, 'hAssaysExperimenter' + this.protocolID, {
                'name': 'Experimenter',
                'headerRow': 2,
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 1
            }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hAssaysModified' + this.protocolID, {
                'name': 'Last Modified',
                'headerRow': 2,
                'sortBy': this.loadAssayModification,
                'sortAfter': 1
            })
        ];
        return leftSide.concat(metaDataHeaders, rightSide);
    };
    DataGridSpecAssays.prototype.makeMetaDataSortFunction = function (id) {
        return function (i) {
            var record = EDDData.Assays[i];
            if (record && record.meta) {
                return record.meta[id] || '';
            }
            return '';
        };
    };
    // The colspan value for all the cells that are assay-level (not measurement-level) is based on
    // the number of measurements for the respective record. Specifically, it's the number of
    // metabolite measurements, plus 1 if there are transcriptomics measurements, plus 1 if there
    // are proteomics measurements, all added together.  (Or 1, whichever is higher.)
    DataGridSpecAssays.prototype.rowSpanForRecord = function (index) {
        var rec = EDDData.Assays[index];
        var v = ((rec.metabolites || []).length +
            ((rec.transcriptions || []).length ? 1 : 0) +
            ((rec.proteins || []).length ? 1 : 0)) || 1;
        return v;
    };
    DataGridSpecAssays.prototype.generateAssayNameCells = function (gridSpec, index) {
        var record = EDDData.Assays[index], line = EDDData.Lines[record.lid], sideMenuItems = [
            '<a class="assay-edit-link">Edit Assay</a>',
            '<a class="assay-reload-link">Reload Data</a>',
            '<a href="/export?assayId=' + index + '">Export Data as CSV/etc</a>'
        ];
        // TODO we probably don't want to special-case like this by name
        if (gridSpec.protocolName == "Transcriptomics") {
            sideMenuItems.push('<a href="import/rnaseq/edgepro?assay=' + index + '">Import RNA-seq data from EDGE-pro</a>');
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'assayId',
                'checkboxWithID': function (id) { return 'assay' + id + 'include'; },
                'sideMenuItems': sideMenuItems,
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': [line.name, gridSpec.protocolName, record.name].join('-')
            })
        ];
    };
    DataGridSpecAssays.prototype.makeMetaDataCellsGeneratorFunction = function (id) {
        return function (gridSpec, index) {
            var contentStr = '', assay = EDDData.Assays[index], type = EDDData.MetaDataTypes[id];
            if (assay && type && assay.meta && (contentStr = assay.meta[id] || '')) {
                contentStr = [type.pre || '', contentStr, type.postfix || ''].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr
                })
            ];
        };
    };
    DataGridSpecAssays.prototype.generateMeasurementCells = function (gridSpec, index, opt) {
        var record = EDDData.Assays[index], cells = [], factory = function () { return new DataGridDataCell(gridSpec, index); };
        if ((record.metabolites || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index, { 'rowspan': record.metabolites.length }));
            }
            else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.metabolites.map(opt.metaboliteToValue)
                    .sort(opt.metaboliteValueSort)
                    .map(opt.metaboliteValueToCell);
            }
        }
        if ((record.general || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index, { 'rowspan': record.general.length }));
            }
            else {
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
            }
            else {
                cells.push(opt.transcriptToCell(record.transcriptions));
            }
        }
        // generate only one cell if there is any proteomics data
        if ((record.proteins || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index));
            }
            else {
                cells.push(opt.proteinToCell(record.proteins));
            }
        }
        // generate a loading cell if none created by measurements
        if (!cells.length) {
            if (record.count) {
                // we have a count, but no data yet; still loading
                cells.push(new DataGridLoadingCell(gridSpec, index));
            }
            else if (opt.empty) {
                cells.push(opt.empty.call({}));
            }
            else {
                cells.push(factory());
            }
        }
        return cells;
    };
    DataGridSpecAssays.prototype.generateMeasurementNameCells = function (gridSpec, index) {
        var record = EDDData.Assays[index];
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, mtype = EDDData.MeasurementTypes[measure.type] || {};
                return { 'name': mtype.name || '', 'id': measureId };
            },
            'metaboliteValueSort': function (a, b) {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return ((y > z) - (z > y));
            },
            'metaboliteValueToCell': function (value) {
                var cell = new DataGridDataCell(gridSpec, value.id, {
                    'hoverEffect': true,
                    'checkboxName': 'measurementId',
                    'checkboxWithID': function () { return 'measurement' + value.id + 'include'; },
                    'contentString': value.name
                });
                $(cell.checkboxElement).val(value.id);
                return cell;
            },
            'transcriptToCell': function (ids) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': 'Transcriptomics Data'
                });
            },
            'proteinToCell': function (ids) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': 'Proteomics Data'
                });
            },
            "empty": function () { return new DataGridDataCell(gridSpec, index, {
                'contentString': '<i>No Measurements</i>'
            }); }
        });
    };
    DataGridSpecAssays.prototype.generateUnitsCells = function (gridSpec, index) {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, mtype = EDDData.MeasurementTypes[measure.type] || {}, unit = EDDData.UnitTypes[measure.y_units] || {};
                return { 'name': mtype.name || '', 'id': measureId, 'unit': unit.name || '' };
            },
            'metaboliteValueSort': function (a, b) {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return ((y > z) - (z > y));
            },
            'metaboliteValueToCell': function (value) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': value.unit
                });
            },
            'transcriptToCell': function (ids) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': 'RPKM'
                });
            },
            'proteinToCell': function (ids) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': '' // TODO: what are proteomics measurement units?
                });
            }
        });
    };
    DataGridSpecAssays.prototype.generateCountCells = function (gridSpec, index) {
        // function to use in Array#reduce to count all the values in a set of measurements
        var reduceCount = function (prev, measureId) {
            var measure = EDDData.AssayMeasurements[measureId] || {};
            return prev + (measure.values || []).length;
        };
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            'metaboliteToValue': function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, mtype = EDDData.MeasurementTypes[measure.type] || {};
                return { 'name': mtype.name || '', 'id': measureId, 'measure': measure };
            },
            'metaboliteValueSort': function (a, b) {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return ((y > z) - (z > y));
            },
            'metaboliteValueToCell': function (value) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': ['(', (value.measure.values || []).length, ')'].join('')
                });
            },
            'transcriptToCell': function (ids) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': ['(', ids.reduce(reduceCount, 0), ')'].join('')
                });
            },
            'proteinToCell': function (ids) {
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': ['(', ids.reduce(reduceCount, 0), ')'].join('')
                });
            }
        });
    };
    DataGridSpecAssays.prototype.generateMeasuringTimesCells = function (gridSpec, index) {
        var tupleTimeCount = function (value, key) { return [[key, value]]; }, sortByTime = function (a, b) {
            var y = parseFloat(a[0]), z = parseFloat(b[0]);
            return ((y > z) - (z > y));
        }, svgCellForTimeCounts = function (ids) {
            var consolidated, svg = '', timeCount = {};
            // count values at each x for all measurements
            ids.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, data = measure.values || [];
                data.forEach(function (point) {
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
            'metaboliteToValue': function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, mtype = EDDData.MeasurementTypes[measure.type] || {};
                return { 'name': mtype.name || '', 'id': measureId, 'measure': measure };
            },
            'metaboliteValueSort': function (a, b) {
                var y = a.name.toLowerCase(), z = b.name.toLowerCase();
                return ((y > z) - (z > y));
            },
            'metaboliteValueToCell': function (value) {
                var measure = value.measure || {}, format = measure.format === 1 ? 'carbon' : '', data = value.measure.values || [], svg = gridSpec.assembleSVGStringForDataPoints(data, format);
                return new DataGridDataCell(gridSpec, index, {
                    'contentString': svg
                });
            },
            'transcriptToCell': svgCellForTimeCounts,
            'proteinToCell': svgCellForTimeCounts
        });
    };
    DataGridSpecAssays.prototype.generateExperimenterCells = function (gridSpec, index) {
        var exp = EDDData.Assays[index].exp;
        var uRecord = EDDData.Users[exp];
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': uRecord ? uRecord.initials : '?'
            })
        ];
    };
    DataGridSpecAssays.prototype.generateModificationDateCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Assays[index].mod)
            })
        ];
    };
    DataGridSpecAssays.prototype.assembleSVGStringForDataPoints = function (points, format) {
        var _this = this;
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
        var paths = [svg];
        points.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (point) {
            var x = point[0][0], y = point[1][0], rx = ((x / _this.maximumXValueInData) * 450) + 10, tt = [y, ' at ', x, 'h'].join('');
            paths.push(['<path class="cE" d="M', rx, ',5v4"></path>'].join(''));
            if (y === null) {
                paths.push(['<path class="cE" d="M', rx, ',2v6"></path>'].join(''));
                return;
            }
            paths.push(['<path class="cP" d="M', rx, ',1v4"></path>'].join(''));
            if (format === 'carbon') {
                paths.push(['<path class="cV" d="M', rx, ',1v8"><title>', tt, '</title></path>'].join(''));
            }
            else {
                paths.push(['<path class="cP" d="M', rx, ',1v8"><title>', tt, '</title></path>'].join(''));
            }
        });
        paths.push('</svg>');
        return paths.join('\n');
    };
    // Specification for each of the data columns that will make up the body of the table
    DataGridSpecAssays.prototype.defineColumnSpec = function () {
        var _this = this;
        var leftSide, metaDataCols, rightSide;
        // add click handler for menu on assay name cells
        $(this.tableElement).on('click', 'a.assay-edit-link', function (ev) {
            StudyD.editAssay($(ev.target).closest('.popupcell').find('input').val());
            return false;
        }).on('click', 'a.assay-reload-link', function (ev) {
            var id = $(ev.target).closest('.popupcell').find('input').val(), assay = EDDData.Assays[id];
            if (assay) {
                StudyD.requestAssayData(assay);
            }
            return false;
        });
        leftSide = [
            new DataGridColumnSpec(1, this.generateAssayNameCells)
        ];
        metaDataCols = this.metaDataIDsUsedInAssays.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnSpec(2 + index, _this.makeMetaDataCellsGeneratorFunction(id));
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
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecAssays.prototype.defineColumnGroupSpec = function () {
        var topSection = [
            new DataGridColumnGroupSpec('Name', { 'showInVisibilityList': false })
        ];
        var metaDataColGroups;
        metaDataColGroups = this.metaDataIDsUsedInAssays.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });
        var bottomSection = [
            new DataGridColumnGroupSpec('Measurement', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Units', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Count', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Measuring Times', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
        ];
        return topSection.concat(metaDataColGroups, bottomSection);
    };
    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    DataGridSpecAssays.prototype.createCustomHeaderWidgets = function (dataGrid) {
        var widgetSet = [];
        // Create a single widget for substring searching
        var searchAssaysWidget = new DGAssaysSearchWidget(dataGrid, this, 'Search Assays', 30, false);
        widgetSet.push(searchAssaysWidget);
        // A "select all" button
        var selectAllWidget = new DGSelectAllWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);
        return widgetSet;
    };
    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    DataGridSpecAssays.prototype.createCustomOptionsWidgets = function (dataGrid) {
        var widgetSet = [];
        // Create a single widget for showing disabled Assays
        var disabledAssaysWidget = new DGDisabledAssaysWidget(dataGrid, this);
        widgetSet.push(disabledAssaysWidget);
        return widgetSet;
    };
    // This is called after everything is initialized, including the creation of the table content.
    DataGridSpecAssays.prototype.onInitialized = function (dataGrid) {
        // Wire up the 'action panels' for the Assays sections
        var table = this.getTableElement();
        $(table).on('change', ':checkbox', function () { return StudyD.queueAssaysActionPanelShow(); });
        if (this.undisclosedSectionDiv) {
            $(this.undisclosedSectionDiv).click(function () { return dataGrid.clickedDisclose(true); });
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
    };
    return DataGridSpecAssays;
})(DataGridSpecBase);
// When unchecked, this hides the set of Assays that are marked as disabled.
var DGDisabledAssaysWidget = (function (_super) {
    __extends(DGDisabledAssaysWidget, _super);
    function DGDisabledAssaysWidget() {
        _super.apply(this, arguments);
    }
    DGDisabledAssaysWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'ShowDAssaysCB' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) { return _this.dataGridOwnerObject.clickedOptionWidget(e); });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);
        ;
        this._createdElements = true;
    };
    DGDisabledAssaysWidget.prototype.applyFilterToIDs = function (rowIDs) {
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
    };
    DGDisabledAssaysWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        if (!EDDData.Assays[rowID].active) {
            $.each(dataRowObjects, function (x, row) { return $(row.getElement()).addClass('disabledRecord'); });
        }
    };
    return DGDisabledAssaysWidget;
})(DataGridOptionWidget);
// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
var DGAssaysSearchWidget = (function (_super) {
    __extends(DGAssaysSearchWidget, _super);
    function DGAssaysSearchWidget(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus) {
        _super.call(this, dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
    }
    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    DGAssaysSearchWidget.prototype.createElements = function (uniqueID) {
        _super.prototype.createElements.call(this, uniqueID);
        this.createdElements(true);
    };
    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    DGAssaysSearchWidget.prototype.appendElements = function (container, uniqueID) {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    };
    return DGAssaysSearchWidget;
})(DGSearchWidget);
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyD.prepareIt(); });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS50cyJdLCJuYW1lcyI6WyJTdHVkeUQiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY29uc3RydWN0b3IiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJlcGFyZUZpbHRlcmluZ1NlY3Rpb24iLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24iLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzIiwiU3R1ZHlELlByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkQXNzYXlJRFNldCIsIlN0dWR5RC5Qcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzIiwiU3R1ZHlELlByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmNoZWNrUmVkcmF3UmVxdWlyZWQiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24iLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmNyZWF0ZUNvbnRhaW5lck9iamVjdHMiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24ucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmlzRmlsdGVyVXNlZnVsIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFkZFRvUGFyZW50IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFwcGx5QmFja2dyb3VuZFN0eWxlIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLnBvcHVsYXRlVGFibGUiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmciLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uX2Fzc2F5SWRUb0Fzc2F5IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLl9hc3NheUlkVG9MaW5lIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLl9hc3NheUlkVG9Qcm90b2NvbCIsIlN0dWR5RC5HZW5lcmljRmlsdGVyU2VjdGlvbi5nZXRJZE1hcFRvVmFsdWVzIiwiU3R1ZHlELlN0cmFpbkZpbHRlclNlY3Rpb24iLCJTdHVkeUQuU3RyYWluRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5TdHJhaW5GaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5TdHJhaW5GaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkNhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5DYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5DYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkNhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5DYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5DYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuTGluZU5hbWVGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELkxpbmVOYW1lRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5MaW5lTmFtZUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkxpbmVOYW1lRmlsdGVyU2VjdGlvbi51cGRhdGVVbmlxdWVJbmRleGVzSGFzaCIsIlN0dWR5RC5Qcm90b2NvbEZpbHRlclNlY3Rpb24iLCJTdHVkeUQuUHJvdG9jb2xGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELlByb3RvY29sRmlsdGVyU2VjdGlvbi5jb25maWd1cmUiLCJTdHVkeUQuUHJvdG9jb2xGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkFzc2F5U3VmZml4RmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5Bc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5Bc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuTWV0YURhdGFGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELk1ldGFEYXRhRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5NZXRhRGF0YUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkxpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5MaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24iLCJTdHVkeUQuTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5NZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5NZWFzdXJlbWVudEZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZWFzdXJlbWVudEZpbHRlclNlY3Rpb24uaXNGaWx0ZXJVc2VmdWwiLCJTdHVkeUQuTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZXRhYm9saXRlRmlsdGVyU2VjdGlvbi5pc0ZpbHRlclVzZWZ1bCIsIlN0dWR5RC5NZXRhYm9saXRlRmlsdGVyU2VjdGlvbi51cGRhdGVVbmlxdWVJbmRleGVzSGFzaCIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbi5jb25maWd1cmUiLCJTdHVkeUQuUHJvdGVpbkZpbHRlclNlY3Rpb24uaXNGaWx0ZXJVc2VmdWwiLCJTdHVkeUQuUHJvdGVpbkZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkdlbmVGaWx0ZXJTZWN0aW9uLmlzRmlsdGVyVXNlZnVsIiwiU3R1ZHlELkdlbmVGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELnByZXBhcmVJdCIsIlN0dWR5RC5wcmVwYXJlUGVybWlzc2lvbnMiLCJTdHVkeUQucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhIiwiU3R1ZHlELmZpbHRlclRhYmxlS2V5RG93biIsIlN0dWR5RC5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlIiwiU3R1ZHlELnJlcXVlc3RBbGxNZXRhYm9saXRlRGF0YSIsIlN0dWR5RC5yZXF1ZXN0QXNzYXlEYXRhIiwiU3R1ZHlELnByb2Nlc3NNZWFzdXJlbWVudERhdGEiLCJTdHVkeUQuY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2siLCJTdHVkeUQucXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5saW5lc0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5hc3NheXNBY3Rpb25QYW5lbFNob3ciLCJTdHVkeUQucXVldWVNYWluR3JhcGhSZW1ha2UiLCJTdHVkeUQucmVtYWtlTWFpbkdyYXBoQXJlYSIsIlN0dWR5RC5jbGVhckFzc2F5Rm9ybSIsIlN0dWR5RC5jbGVhckxpbmVGb3JtIiwiU3R1ZHlELmZpbGxBc3NheUZvcm0iLCJTdHVkeUQuZmlsbExpbmVGb3JtIiwiU3R1ZHlELnNjcm9sbFRvRm9ybSIsIlN0dWR5RC51cGRhdGVVSUFzc2F5Rm9ybSIsIlN0dWR5RC51cGRhdGVVSUxpbmVGb3JtIiwiU3R1ZHlELmluc2VydExpbmVNZXRhZGF0YVJvdyIsIlN0dWR5RC5lZGl0QXNzYXkiLCJTdHVkeUQuZWRpdExpbmUiLCJTdHVkeUQub25DaGFuZ2VkTWV0YWJvbGljTWFwIiwiU3R1ZHlELnJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzIiwiU3R1ZHlELm9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUiLCJEYXRhR3JpZFNwZWNMaW5lcyIsIkRhdGFHcmlkU3BlY0xpbmVzLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRTcGVjTGluZXMuaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCIsIkRhdGFHcmlkU3BlY0xpbmVzLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQiLCJEYXRhR3JpZFNwZWNMaW5lcy5maW5kTWV0YURhdGFJRHNVc2VkSW5MaW5lcyIsIkRhdGFHcmlkU3BlY0xpbmVzLmZpbmRHcm91cElEc0FuZE5hbWVzIiwiRGF0YUdyaWRTcGVjTGluZXMuZGVmaW5lVGFibGVTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZExpbmVOYW1lIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZFN0cmFpbk5hbWUiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkRmlyc3RDYXJib25Tb3VyY2UiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkQ2FyYm9uU291cmNlIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZENhcmJvblNvdXJjZUxhYmVsaW5nIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZEV4cGVyaW1lbnRlckluaXRpYWxzIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZExpbmVNb2RpZmljYXRpb24iLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVIZWFkZXJTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uIiwiRGF0YUdyaWRTcGVjTGluZXMucm93U3BhbkZvclJlY29yZCIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlTGluZU5hbWVDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlU3RyYWluTmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2VuZXJhdGVDYXJib25Tb3VyY2VDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlQ2FyYm9uQmFsYW5jZUJsYW5rQ2VsbHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLm1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24iLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVDb2x1bW5TcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMuZGVmaW5lUm93R3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2V0VGFibGVFbGVtZW50IiwiRGF0YUdyaWRTcGVjTGluZXMuZ2V0UmVjb3JkSURzIiwiRGF0YUdyaWRTcGVjTGluZXMuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY0xpbmVzLmNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzIiwiRGF0YUdyaWRTcGVjTGluZXMub25Jbml0aWFsaXplZCIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldCIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldC5jb25zdHJ1Y3RvciIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldC5hcHBseUZpbHRlclRvSURzIiwiREdEaXNhYmxlZExpbmVzV2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEIiwiREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldCIsIkRHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQuY29uc3RydWN0b3IiLCJER0dyb3VwU3R1ZHlSZXBsaWNhdGVzV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdMaW5lc1NlYXJjaFdpZGdldCIsIkRHTGluZXNTZWFyY2hXaWRnZXQuY29uc3RydWN0b3IiLCJER0xpbmVzU2VhcmNoV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdMaW5lc1NlYXJjaFdpZGdldC5hcHBlbmRFbGVtZW50cyIsIkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQiLCJER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuaGlnaGxpZ2h0IiwiREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldC5lbmFibGUiLCJER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0LmFjdGl2YXRlQ2FyYm9uQmFsYW5jZSIsIkRhdGFHcmlkQXNzYXlzIiwiRGF0YUdyaWRBc3NheXMuY29uc3RydWN0b3IiLCJEYXRhR3JpZEFzc2F5cy5pbnZhbGlkYXRlQXNzYXlSZWNvcmRzIiwiRGF0YUdyaWRBc3NheXMuY2xpY2tlZERpc2Nsb3NlIiwiRGF0YUdyaWRBc3NheXMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2giLCJEYXRhR3JpZEFzc2F5cy5fY2FuY2VsR3JhcGgiLCJEYXRhR3JpZEFzc2F5cy5xdWV1ZUdyYXBoUmVtYWtlIiwiRGF0YUdyaWRBc3NheXMucmVtYWtlR3JhcGhBcmVhIiwiRGF0YUdyaWRBc3NheXMucmVzaXplR3JhcGgiLCJEYXRhR3JpZFNwZWNBc3NheXMiLCJEYXRhR3JpZFNwZWNBc3NheXMuY29uc3RydWN0b3IiLCJEYXRhR3JpZFNwZWNBc3NheXMucmVmcmVzaElETGlzdCIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZXRSZWNvcmRJRHMiLCJEYXRhR3JpZFNwZWNBc3NheXMub25EYXRhUmVzZXQiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2V0VGFibGVFbGVtZW50IiwiRGF0YUdyaWRTcGVjQXNzYXlzLmRlZmluZVRhYmxlU3BlYyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5maW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEiLCJEYXRhR3JpZFNwZWNBc3NheXMubG9hZEFzc2F5TmFtZSIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMubG9hZEFzc2F5TW9kaWZpY2F0aW9uIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmRlZmluZUhlYWRlclNwZWMiLCJEYXRhR3JpZFNwZWNBc3NheXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uIiwiRGF0YUdyaWRTcGVjQXNzYXlzLnJvd1NwYW5Gb3JSZWNvcmQiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlVW5pdHNDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZUNvdW50Q2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmRlZmluZUNvbHVtblNwZWMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMiLCJEYXRhR3JpZFNwZWNBc3NheXMub25Jbml0aWFsaXplZCIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQiLCJER0Rpc2FibGVkQXNzYXlzV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdEaXNhYmxlZEFzc2F5c1dpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQuYXBwbHlGaWx0ZXJUb0lEcyIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQiLCJER0Fzc2F5c1NlYXJjaFdpZGdldCIsIkRHQXNzYXlzU2VhcmNoV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdBc3NheXNTZWFyY2hXaWRnZXQuY3JlYXRlRWxlbWVudHMiLCJER0Fzc2F5c1NlYXJjaFdpZGdldC5hcHBlbmRFbGVtZW50cyJdLCJtYXBwaW5ncyI6IkFBQUEsZ0RBQWdEO0FBQ2hELDRDQUE0QztBQUM1QywrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLGdEQUFnRDtBQUNoRCwyQ0FBMkM7QUFDM0Msb0NBQW9DO0FBQ3BDLHlDQUF5Qzs7Ozs7O0FBSXpDLElBQU8sTUFBTSxDQTR0RFo7QUE1dERELFdBQU8sTUFBTSxFQUFDLENBQUM7SUFDWEEsWUFBWUEsQ0FBQ0E7SUFFYkEsSUFBSUEsZUFBbUJBLENBQUNBO0lBQ3hCQSxJQUFJQSwwQkFBc0RBLENBQUNBO0lBRTNEQSxJQUFJQSx1QkFBMkJBLENBQUNBO0lBRWhDQSxJQUFJQSw0QkFBZ0NBLENBQUNBO0lBQ3JDQSxJQUFJQSw2QkFBaUNBLENBQUNBO0lBRXRDQSxJQUFJQSxhQUFpQkEsQ0FBQ0E7SUFDdEJBLElBQUlBLGVBQW1CQSxDQUFDQTtJQUN4QkEsSUFBSUEsMEJBQThCQSxDQUFDQTtJQVFu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QSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQTtnQkFDM0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO29CQUFDQSxNQUFNQSxDQUFDQTtnQkFDcENBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7b0JBQUNBLE1BQU1BLENBQUNBO2dCQUNsQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkJBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO2dCQUNyQ0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUM5QkEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDckNBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxD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Q0FBQ0E7WUFDN0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0EsV0FBV0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdkVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDakVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDN0VBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSwwQ0FBMENBO2dCQUMxQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLENBQUNBO1FBQ0xBLENBQUNBLENBQUNBLENBQUNBO1FBRUhBLE9BQU9BLENBQUNBLDBCQUEwQkEsQ0FBQ0EsaUNBQWlDQSxDQUFDQSxJQUFJ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QSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQzdEQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQzdHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQy9EQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO1FBQ3hHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw2QkFBNkJBLENBQUNBLENBQUNBLEdBQUdBLENBQ3BDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFDQSxDQUFDQSxJQUFLQSxPQUFBQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUF3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsRUFBNURBLENBQTREQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0RUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUM5QkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsQ0FBQ0EsSUFBS0EsT0FBQUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBa0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLEVBQXJEQSxDQUFxREEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbkdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FDOUJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLENBQUNBLElBQUtBLE9BQUFBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLElBQWtCQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxFQUFFQSxFQUExREEsQ0FBMERBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hHQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSwyQ0FBMkNBO2dCQUNsREEsZ0VBQWdFQSxDQUFDQTtpQkFDcEVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBO2lCQUMzQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUMvREEsQ0FBQ0E7UUFDREEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtRQUN2Q0EsZ0ZBQWdGQTtRQUNoRkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBQ0EsR0FBR0EsRUFBRUEsS0FBS0E7WUFDM0JBLHFCQUFxQkEsQ0FBQ0EsT0FBT0EsRUFBRUEsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLENBQUNBLENBQUNBLENBQUNBO1FBQ0hBLDRDQUE0Q0E7UUFDNUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckVBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLGdDQUFnQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDakZBLENBQUNBO0lBRURwRyxzQkFBc0JBLElBQUlBO1FBQ3RCcUcsOEJBQThCQTtRQUM5QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsY0FBY0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDL0RBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEVBQUVBLFdBQVdBLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQ3BEQSxDQUFDQTtJQUVEckcsMkJBQTJCQSxJQUFJQTtRQUMzQnNHLElBQUlBLEtBQUtBLEVBQUVBLE1BQU1BLENBQUNBO1FBQ2xCQSx5Q0FBeUNBO1FBQ3pDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQzFEQSxpQ0FBaUNBO1FBQ2pDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ3BFQSw2Q0FBNkNBO1FBQzdDQSxDQUFDQSxDQUFDQSx3QkFBd0JBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLEVBQUVBLFVBQUNBLEVBQUVBO1lBQy9EQSxjQUFjQSxFQUFFQSxDQUFDQTtZQUNqQkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsOEJBQThCQSxDQUFDQSxDQUFDQTtZQUMzQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2pCQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMzQkEsQ0FBQ0E7SUFFRHRHLDBCQUEwQkEsSUFBSUEsRUFBRUEsTUFBT0E7UUFDbkN1RyxJQUFJQSxLQUFLQSxFQUFFQSxNQUFNQSxFQUFFQSxJQUFJQSxHQUFHQSxXQUFXQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUM1REEsZ0RBQWdEQTtRQUNoREEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNsREEsd0NBQXdDQTtRQUN4Q0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMzREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVEEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLGFBQWFBLEVBQUVBLFFBQVFBLEVBQUVBLFVBQUNBLEVBQW9CQTtnQkFDbERBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ3ZFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUNEQSw2Q0FBNkNBO1FBQzdDQSxDQUFDQSxDQUFDQSx3QkFBd0JBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLEVBQUVBLFVBQUNBLEVBQUVBO1lBQy9EQSxhQUFhQSxFQUFFQSxDQUFDQTtZQUNoQkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUM3QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2pCQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMzQkEsQ0FBQ0E7SUFFRHZHLCtCQUErQkEsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsS0FBS0E7UUFDN0N3RyxJQUFJQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxFQUFFQSxHQUFHQSxZQUFZQSxHQUFHQSxHQUFHQSxDQUFDQTtRQUNyREEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbEZBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzRUEsaUJBQWlCQTtRQUNqQkEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EscUJBQXFCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDM0VBLENBQUNBO1FBQ0RBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3RFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvRUEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFFRHhHLG1CQUEwQkEsS0FBWUE7UUFDbEN5RyxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQTtRQUN6Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0Esb0NBQW9DQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUMxREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsR0FBR0EsY0FBY0EsRUFBRUEsQ0FBQ0EsQ0FBQ0Esd0NBQXdDQTtRQUNqRUEsYUFBYUEsQ0FBQ0EsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeEJBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQ3ZCQSxDQUFDQTtJQVhlekcsZ0JBQVNBLFlBV3hCQSxDQUFBQTtJQUVEQSxrQkFBeUJBLEtBQVlBO1FBQ2pDMEcsSUFBSUEsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0E7UUFDeENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLG1DQUFtQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLGFBQWFBLEVBQUVBLENBQUNBLENBQUNBLHdDQUF3Q0E7UUFDaEVBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQzNCQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFYZTFHLGVBQVFBLFdBV3ZCQSxDQUFBQTtJQUdEQTtRQUNJMkcsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsZ0VBQWdFQTtZQUNoRUEsQ0FBQ0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBO1FBQ3ZEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxDQUFDQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzFDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLElBQUlBLElBQUlBLENBQUNBLGtCQUFrQkEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0RBLDZDQUE2Q0E7WUFDN0NBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUMxREEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUVqQ0EseUJBQXlCQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUN6Q0EsSUFBSUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFqQmUzRyw0QkFBcUJBLHdCQWlCcENBLENBQUFBO0lBR0RBO1FBQUE0RyxpQkFrQkNBO1FBakJHQSxJQUFJQSxRQUEyQkEsRUFDM0JBLEtBQUtBLEdBQTJCQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLGdCQUFnQkEsQ0FBQ0E7UUFDNUVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLDJCQUEyQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLHdFQUF3RUE7UUFDeEVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUMzQ0EsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZEEscURBQXFEQTtRQUNyREEsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsR0FBc0JBO1lBQy9DQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxHQUFHQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUMvREEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSEEsNENBQTRDQTtRQUM1Q0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsSUFBcUJBO1lBQ25DQSxLQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDakZBLENBQUNBLENBQUNBLENBQUNBO1FBQ0hBLElBQUlBLENBQUNBLDJCQUEyQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBbEJlNUcsaUNBQTBCQSw2QkFrQnpDQSxDQUFBQTtJQUdEQSxpREFBaURBO0lBQ2pEQTtRQUFBNkcsaUJBZ0JDQTtRQWZHQSxJQUFJQSxFQUEyQkEsRUFDM0JBLFFBQVFBLEdBQTZCQSxVQUFDQSxLQUFZQSxFQUM5Q0EsY0FBc0JBLEVBQ3RCQSxnQkFBd0JBLEVBQ3hCQSxZQUFvQkE7WUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNUQSxLQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxjQUFjQSxDQUFDQTtnQkFDckNBLEtBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsZ0JBQWdCQSxDQUFDQTtnQkFDekNBLEtBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsWUFBWUEsQ0FBQ0E7Z0JBQ3ZDQSxLQUFJQSxDQUFDQSxxQkFBcUJBLEVBQUVBLENBQUNBO1lBQ2pDQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsbUNBQW1DQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM3REEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0E7UUFDRkEsRUFBRUEsR0FBR0EsSUFBSUEsd0JBQXdCQSxDQUFDQSxLQUFLQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUN2REEsQ0FBQ0E7SUFoQmU3RyxnQ0FBeUJBLDRCQWdCeENBLENBQUFBO0FBQ0xBLENBQUNBLEVBNXRETSxNQUFNLEtBQU4sTUFBTSxRQTR0RFo7QUFBQSxDQUFDO0FBSUYsNEVBQTRFO0FBQzVFO0lBQWdDOEcscUNBQWdCQTtJQVU1Q0E7UUFDSUMsSUFBSUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxFQUFFQSxDQUFDQTtRQUM1QkEsaUJBQU9BLENBQUNBO0lBQ1pBLENBQUNBO0lBR0RELHdEQUE0QkEsR0FBNUJBLFVBQTZCQSxDQUFTQTtRQUNsQ0UsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMxQ0EsQ0FBQ0E7SUFHREYscURBQXlCQSxHQUF6QkEsVUFBMEJBLENBQVNBO1FBQy9CRyxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQUdESCxzREFBMEJBLEdBQTFCQTtRQUNJSSxJQUFJQSxRQUFRQSxHQUFPQSxFQUFFQSxDQUFDQTtRQUN0QkEsYUFBYUE7UUFDYkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsRUFBRUEsVUFBQ0EsS0FBS0EsRUFBRUEsRUFBRUE7WUFDbENBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQzdCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDUEEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsRUFBRUEsVUFBQ0EsR0FBR0EsSUFBS0EsT0FBQUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBcEJBLENBQW9CQSxDQUFDQSxDQUFDQTtZQUMzREEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSEEsOEJBQThCQTtRQUM5QkEsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUN4REEsQ0FBQ0E7SUFHREosZ0RBQW9CQSxHQUFwQkE7UUFBQUssaUJBd0JDQTtRQXZCR0EsSUFBSUEsU0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDbkJBLDZEQUE2REE7UUFDN0RBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLEVBQUVBLFVBQUNBLEtBQUtBLEVBQUVBLEVBQUVBO1lBQ2xDQSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNuREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ05BLDJFQUEyRUE7Z0JBQzNFQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFFQSxHQUFHQSxDQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMxREEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSEEsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUMvQkEsb0RBQW9EQTtRQUNwREEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsVUFBQ0EsS0FBS0EsRUFBRUEsS0FBS0E7WUFDM0JBLEtBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDakVBLENBQUNBLENBQUNBLENBQUNBO1FBQ0hBLDRFQUE0RUE7UUFDNUVBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQUNBLENBQUNBLEVBQUNBLENBQUNBO1lBQ25EQSxJQUFJQSxDQUFDQSxHQUFVQSxLQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQVVBLEtBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckZBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3RDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNIQSx5RkFBeUZBO1FBQ3pGQSxtQkFBbUJBO1FBQ25CQSxJQUFJQSxDQUFDQSxzQkFBc0JBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxVQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxJQUFLQSxPQUFBQSxLQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEtBQUtBLEVBQTFDQSxDQUEwQ0EsQ0FBQ0EsQ0FBQ0E7SUFDL0ZBLENBQUNBO0lBR0RMLHlDQUF5Q0E7SUFDekNBLDJDQUFlQSxHQUFmQTtRQUNJTSxNQUFNQSxDQUFDQSxJQUFJQSxpQkFBaUJBLENBQUNBLE9BQU9BLEVBQUVBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBO0lBQy9EQSxDQUFDQTtJQUdPTix3Q0FBWUEsR0FBcEJBLFVBQXFCQSxLQUFZQTtRQUM3Qk8sSUFBSUEsSUFBSUEsQ0FBQ0E7UUFDVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUNkQSxDQUFDQTtJQUdPUCwwQ0FBY0EsR0FBdEJBLFVBQXVCQSxLQUFZQTtRQUMvQlEsMEZBQTBGQTtRQUMxRkEsSUFBSUEsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEZBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ3JDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNmQSxDQUFDQTtJQUdPUixpREFBcUJBLEdBQTdCQSxVQUE4QkEsS0FBWUE7UUFDdENTLDJGQUEyRkE7UUFDM0ZBLHlCQUF5QkE7UUFDekJBLElBQUlBLElBQUlBLEVBQUVBLE1BQU1BLENBQUNBO1FBQ2pCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25GQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDckJBLENBQUNBO0lBR09ULDRDQUFnQkEsR0FBeEJBLFVBQXlCQSxLQUFZQTtRQUNqQ1UsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVEEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDckNBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ2ZBLENBQUNBO0lBR09WLG9EQUF3QkEsR0FBaENBLFVBQWlDQSxLQUFZQTtRQUN6Q1csSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVEEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDekNBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ2ZBLENBQUNBO0lBR09YLG9EQUF3QkEsR0FBaENBLFVBQWlDQSxLQUFZQTtRQUN6Q1ksc0ZBQXNGQTtRQUN0RkEsSUFBSUEsSUFBSUEsRUFBRUEsWUFBWUEsQ0FBQ0E7UUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQy9DQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNmQSxDQUFDQTtJQUdPWixnREFBb0JBLEdBQTVCQSxVQUE2QkEsS0FBWUE7UUFDckNhLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDckJBLENBQUNBO0lBR0RiLDJEQUEyREE7SUFDM0RBLDRDQUFnQkEsR0FBaEJBO1FBQUFjLGlCQWlEQ0E7UUFoREdBLElBQUlBLFFBQVFBLEdBQXdCQTtZQUNoQ0EsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxFQUFFQSxZQUFZQSxFQUFFQTtnQkFDcENBLE1BQU1BLEVBQUVBLE1BQU1BO2dCQUNkQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtZQUNsQ0EsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxFQUFFQSxjQUFjQSxFQUFFQTtnQkFDdENBLE1BQU1BLEVBQUVBLFFBQVFBO2dCQUNoQkEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0E7Z0JBQzdCQSxXQUFXQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNyQkEsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxFQUFFQSxjQUFjQSxFQUFFQTtnQkFDdENBLE1BQU1BLEVBQUVBLGtCQUFrQkE7Z0JBQzFCQSxNQUFNQSxFQUFFQSxHQUFHQTtnQkFDWEEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQTtnQkFDL0JBLFdBQVdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3JCQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLGdCQUFnQkEsRUFBRUE7Z0JBQ3hDQSxNQUFNQSxFQUFFQSxVQUFVQTtnQkFDbEJBLE1BQU1BLEVBQUVBLEdBQUdBO2dCQUNYQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSx3QkFBd0JBO2dCQUN2Q0EsV0FBV0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDckJBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEscUJBQXFCQSxFQUFFQTtnQkFDN0NBLE1BQU1BLEVBQUVBLGdCQUFnQkE7Z0JBQ3hCQSxNQUFNQSxFQUFFQSxHQUFHQTtnQkFDWEEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7U0FDckNBLENBQUNBO1FBRUZBLDZDQUE2Q0E7UUFDN0NBLElBQUlBLGVBQWVBLEdBQXdCQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLEVBQUVBLEVBQUVBLEtBQUtBO1lBQ2pGQSxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUN2Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxFQUFFQSxZQUFZQSxHQUFHQSxFQUFFQSxFQUFFQTtnQkFDeERBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLElBQUlBO2dCQUNuQkEsTUFBTUEsRUFBRUEsR0FBR0E7Z0JBQ1hBLFFBQVFBLEVBQUVBLEtBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQzNDQSxXQUFXQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUMxQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsU0FBU0EsR0FBR0E7WUFDWkEsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxvQkFBb0JBLEVBQUVBO2dCQUNyRUEsTUFBTUEsRUFBRUEsY0FBY0E7Z0JBQ3RCQSxNQUFNQSxFQUFFQSxHQUFHQTtnQkFDWEEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0Esd0JBQXdCQTtnQkFDdkNBLFdBQVdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3JCQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQUVBLGdCQUFnQkEsRUFBRUE7Z0JBQ2pFQSxNQUFNQSxFQUFFQSxlQUFlQTtnQkFDdkJBLE1BQU1BLEVBQUVBLEdBQUdBO2dCQUNYQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxvQkFBb0JBO2dCQUNuQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7U0FDeEJBLENBQUNBO1FBRUZBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLGVBQWVBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO0lBQ3ZEQSxDQUFDQTtJQUdPZCxvREFBd0JBLEdBQWhDQSxVQUFpQ0EsRUFBU0E7UUFDdENlLE1BQU1BLENBQUNBLFVBQUNBLENBQVFBO1lBQ1pBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1lBQy9CQSxDQUFDQTtZQUNEQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNkQSxDQUFDQSxDQUFBQTtJQUNMQSxDQUFDQTtJQUdEZixpRkFBaUZBO0lBQ2pGQSxzRUFBc0VBO0lBQ3RFQSxxRkFBcUZBO0lBQzdFQSw0Q0FBZ0JBLEdBQXhCQSxVQUF5QkEsS0FBS0E7UUFDMUJnQixNQUFNQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUMzREEsQ0FBQ0E7SUFHRGhCLGlEQUFxQkEsR0FBckJBLFVBQXNCQSxRQUEwQkEsRUFBRUEsS0FBWUE7UUFDMURpQixJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNoQ0EsTUFBTUEsQ0FBQ0E7WUFDSEEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtnQkFDbENBLGNBQWNBLEVBQUVBLFFBQVFBO2dCQUN4QkEsZ0JBQWdCQSxFQUFFQSxVQUFDQSxFQUFFQSxJQUFPQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxFQUFFQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0RBLGVBQWVBLEVBQUVBO29CQUNiQSwwREFBMERBO29CQUMxREEsMEJBQTBCQSxHQUFHQSxLQUFLQSxHQUFHQSw4QkFBOEJBO2lCQUN0RUE7Z0JBQ0RBLGFBQWFBLEVBQUVBLElBQUlBO2dCQUNuQkEsUUFBUUEsRUFBRUEsSUFBSUE7Z0JBQ2RBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzNDQSxlQUFlQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxnQ0FBZ0NBLEdBQUdBLEVBQUVBLENBQUNBO2FBQ25GQSxDQUFDQTtTQUNMQSxDQUFDQTtJQUNOQSxDQUFDQTtJQUdEakIsbURBQXVCQSxHQUF2QkEsVUFBd0JBLFFBQTBCQSxFQUFFQSxLQUFZQTtRQUM1RGtCLElBQUlBLElBQUlBLEVBQUVBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsRUFBRUE7Z0JBQ3pCQSxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDakNBLE1BQU1BLENBQUNBLENBQUVBLFdBQVdBLEVBQUVBLE1BQU1BLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLE1BQU1BLENBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BGQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQTtZQUNIQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO2dCQUNsQ0EsU0FBU0EsRUFBRUEsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDM0NBLGVBQWVBLEVBQUVBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBO2FBQzNDQSxDQUFDQTtTQUNSQSxDQUFDQTtJQUNOQSxDQUFDQTtJQUdEbEIscURBQXlCQSxHQUF6QkEsVUFBMEJBLFFBQTBCQSxFQUFFQSxLQUFZQTtRQUM5RG1CLElBQUlBLElBQUlBLEVBQUVBLE9BQU9BLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFDQSxFQUFFQSxJQUFPQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3RUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsSUFBSUE7WUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsRUFBRUEsRUFBRUEsZUFBZUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQUE7UUFDM0VBLENBQUNBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBR0RuQiw2REFBaUNBLEdBQWpDQSxVQUFrQ0EsUUFBMEJBLEVBQUVBLEtBQVlBO1FBQ3RFb0IsSUFBSUEsSUFBSUEsRUFBRUEsT0FBT0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLEVBQUVBLElBQU9BLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pGQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFDQSxRQUFRQTtZQUN4QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQSxFQUFFQSxlQUFlQSxFQUFFQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFBQTtRQUMvRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFHRHBCLDJEQUErQkEsR0FBL0JBLFVBQWdDQSxRQUEwQkEsRUFBRUEsS0FBWUE7UUFDcEVxQixNQUFNQSxDQUFDQTtZQUNIQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO2dCQUNsQ0EsU0FBU0EsRUFBRUEsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDM0NBLFVBQVVBLEVBQUVBLEdBQUdBO2FBQ2xCQSxDQUFDQTtTQUNMQSxDQUFDQTtJQUNOQSxDQUFDQTtJQUdEckIsNkRBQWlDQSxHQUFqQ0EsVUFBa0NBLFFBQTBCQSxFQUFFQSxLQUFZQTtRQUN0RXNCLElBQUlBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLE9BQU9BLENBQUNBO1FBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVEQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUMzQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0E7WUFDSEEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtnQkFDbENBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzNDQSxlQUFlQSxFQUFFQSxPQUFPQSxJQUFJQSxHQUFHQTthQUNsQ0EsQ0FBQ0E7U0FDTEEsQ0FBQ0E7SUFDTkEsQ0FBQ0E7SUFHRHRCLHlEQUE2QkEsR0FBN0JBLFVBQThCQSxRQUEwQkEsRUFBRUEsS0FBWUE7UUFDbEV1QixNQUFNQSxDQUFDQTtZQUNIQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO2dCQUNsQ0EsU0FBU0EsRUFBRUEsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDM0NBLGVBQWVBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7YUFDckZBLENBQUNBO1NBQ0xBLENBQUNBO0lBQ05BLENBQUNBO0lBR0R2Qiw4REFBa0NBLEdBQWxDQSxVQUFtQ0EsRUFBRUE7UUFDakN3QixNQUFNQSxDQUFDQSxVQUFDQSxRQUEwQkEsRUFBRUEsS0FBWUE7WUFDNUNBLElBQUlBLFVBQVVBLEdBQUdBLEVBQUVBLEVBQUVBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ25GQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEVBLFVBQVVBLEdBQUdBLENBQUVBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLEVBQUVBLFVBQVVBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLElBQUlBLEVBQUVBLENBQUVBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1lBQ3JGQSxDQUFDQTtZQUNEQSxNQUFNQSxDQUFDQTtnQkFDSEEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtvQkFDbENBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7b0JBQzNDQSxlQUFlQSxFQUFFQSxVQUFVQTtpQkFDOUJBLENBQUNBO2FBQ0xBLENBQUNBO1FBQ05BLENBQUNBLENBQUFBO0lBQ0xBLENBQUNBO0lBR0R4QixxRkFBcUZBO0lBQ3JGQSw0Q0FBZ0JBLEdBQWhCQTtRQUFBeUIsaUJBMEJDQTtRQXpCR0EsSUFBSUEsUUFBNkJBLEVBQzdCQSxZQUFpQ0EsRUFDakNBLFNBQThCQSxDQUFDQTtRQUNuQ0EsZ0RBQWdEQTtRQUNoREEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsRUFBRUEsa0JBQWtCQSxFQUFFQSxVQUFDQSxFQUFFQTtZQUNwREEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDeEVBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2pCQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNIQSxRQUFRQSxHQUFHQTtZQUNQQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0E7WUFDckRBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQTtZQUN2REEsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBO1lBQ3pEQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLGlDQUFpQ0EsQ0FBQ0E7WUFDakVBLHVGQUF1RkE7WUFDdkZBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsK0JBQStCQSxDQUFDQTtTQUNsRUEsQ0FBQ0E7UUFDRkEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFDQSxFQUFFQSxFQUFFQSxLQUFLQTtZQUNyREEsTUFBTUEsQ0FBQ0EsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxFQUFFQSxLQUFJQSxDQUFDQSxrQ0FBa0NBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzFGQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNIQSxTQUFTQSxHQUFHQTtZQUNSQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLFlBQVlBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLGlDQUFpQ0EsQ0FBQ0E7WUFDdkZBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsWUFBWUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQTtTQUN0RkEsQ0FBQ0E7UUFFRkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsWUFBWUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDcERBLENBQUNBO0lBR0R6Qiw0RkFBNEZBO0lBQzVGQSxpREFBcUJBLEdBQXJCQTtRQUNJMEIsSUFBSUEsVUFBVUEsR0FBNkJBO1lBQ3ZDQSxJQUFJQSx1QkFBdUJBLENBQUNBLFdBQVdBLEVBQUVBLEVBQUVBLHNCQUFzQkEsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDM0VBLElBQUlBLHVCQUF1QkEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDckNBLElBQUlBLHVCQUF1QkEsQ0FBQ0Esa0JBQWtCQSxDQUFDQTtZQUMvQ0EsSUFBSUEsdUJBQXVCQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUN2Q0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSx1QkFBdUJBLENBQUNBLGdCQUFnQkEsRUFBRUE7Z0JBQ2xFQSxzQkFBc0JBLEVBQUVBLEtBQUtBO2dCQUM3QkEsaUJBQWlCQSxFQUFFQSxJQUFJQTtnQkFDdkJBLGtCQUFrQkEsRUFBRUEsTUFBTUEsQ0FBQ0EsbUNBQW1DQTthQUNqRUEsQ0FBQ0E7U0FDTEEsQ0FBQ0E7UUFFRkEsSUFBSUEsaUJBQTJDQSxDQUFDQTtRQUNoREEsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLEVBQUVBLEVBQUVBLEtBQUtBO1lBQzFEQSxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUN2Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsdUJBQXVCQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwREEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsYUFBYUEsR0FBNkJBO1lBQzFDQSxJQUFJQSx1QkFBdUJBLENBQUNBLGNBQWNBLEVBQUVBLEVBQUVBLGlCQUFpQkEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDeEVBLElBQUlBLHVCQUF1QkEsQ0FBQ0EsZUFBZUEsRUFBRUEsRUFBRUEsaUJBQWlCQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQTtTQUM1RUEsQ0FBQ0E7UUFFRkEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxhQUFhQSxDQUFDQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFHRDFCLDhEQUE4REE7SUFDOURBLDhDQUFrQkEsR0FBbEJBO1FBRUkyQixJQUFJQSxZQUFZQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUN0QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDbkRBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRWpDQSxJQUFJQSxpQkFBaUJBLEdBQU9BO2dCQUN4QkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxFQUFFQSxDQUFDQTthQUN0Q0EsQ0FBQ0E7WUFDRkEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBR0QzQiw4RkFBOEZBO0lBQzlGQSwyQkFBMkJBO0lBQzNCQSwyQ0FBZUEsR0FBZkE7UUFDSTRCLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7SUFDdERBLENBQUNBO0lBR0Q1Qiw2RkFBNkZBO0lBQzdGQSwyQkFBMkJBO0lBQzNCQSx3Q0FBWUEsR0FBWkE7UUFDSTZCLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO0lBQ3RDQSxDQUFDQTtJQUdEN0IsZ0dBQWdHQTtJQUNoR0EsNEZBQTRGQTtJQUM1RkEscURBQXlCQSxHQUF6QkEsVUFBMEJBLFFBQWlCQTtRQUN2QzhCLElBQUlBLFNBQVNBLEdBQTBCQSxFQUFFQSxDQUFDQTtRQUUxQ0EsaURBQWlEQTtRQUNqREEsSUFBSUEsaUJBQWlCQSxHQUFHQSxJQUFJQSxtQkFBbUJBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEVBQUVBLGNBQWNBLEVBQUVBLEVBQUVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQzNGQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBQ2xDQSw4QkFBOEJBO1FBQzlCQSxJQUFJQSx1QkFBdUJBLEdBQUdBLElBQUlBLHlCQUF5QkEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDNUVBLHVCQUF1QkEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwREEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxHQUFHQSx1QkFBdUJBLENBQUNBO1FBQ25EQSx3QkFBd0JBO1FBQ3hCQSxJQUFJQSxlQUFlQSxHQUFHQSxJQUFJQSxpQkFBaUJBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzVEQSxlQUFlQSxDQUFDQSxxQkFBcUJBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzVDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUVoQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDckJBLENBQUNBO0lBR0Q5Qiw4RkFBOEZBO0lBQzlGQSxzRUFBc0VBO0lBQ3RFQSxzREFBMEJBLEdBQTFCQSxVQUEyQkEsUUFBaUJBO1FBQ3hDK0IsSUFBSUEsU0FBU0EsR0FBMEJBLEVBQUVBLENBQUNBO1FBRTFDQSxvREFBb0RBO1FBQ3BEQSxJQUFJQSxnQkFBZ0JBLEdBQUdBLElBQUlBLDRCQUE0QkEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLG1CQUFtQkEsR0FBR0EsSUFBSUEscUJBQXFCQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwRUEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtRQUNwQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDckJBLENBQUNBO0lBR0QvQiwrRkFBK0ZBO0lBQy9GQSx5Q0FBYUEsR0FBYkEsVUFBY0EsUUFBaUJBO1FBRTNCZ0MsZ0VBQWdFQTtRQUNoRUEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDeENBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLEVBQUVBLGNBQU1BLE9BQUFBLE1BQU1BLENBQUNBLHlCQUF5QkEsRUFBRUEsRUFBbENBLENBQWtDQSxDQUFDQSxDQUFDQTtRQUVsRkEsdUVBQXVFQTtRQUN2RUEsd0RBQXdEQTtRQUN4REEsSUFBSUEsQ0FBQ0EseUJBQXlCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUV0Q0Esc0ZBQXNGQTtRQUN0RkEsTUFBTUEsQ0FBQ0Esc0JBQXNCQSxFQUFFQSxDQUFDQTtJQUNwQ0EsQ0FBQ0E7SUFDTGhDLHdCQUFDQTtBQUFEQSxDQUFDQSxBQXpkRCxFQUFnQyxnQkFBZ0IsRUF5ZC9DO0FBSUQsMkVBQTJFO0FBQzNFO0lBQW9DaUMseUNBQW9CQTtJQUF4REE7UUFBb0NDLDhCQUFvQkE7SUE0Q3hEQSxDQUFDQTtJQTFDR0QsOENBQWNBLEdBQWRBLFVBQWVBLFFBQVlBO1FBQTNCRSxpQkFVQ0E7UUFUR0EsSUFBSUEsSUFBSUEsR0FBVUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsR0FBQ0EsY0FBY0EsR0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDekVBLElBQUlBLEVBQUVBLEdBQW9CQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBRUEsVUFBQ0EsQ0FBQ0EsSUFBS0EsT0FBQUEsS0FBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLENBQUNBLEVBQS9DQSxDQUErQ0EsQ0FBRUEsQ0FBQ0E7UUFDdEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGtCQUFrQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzFDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFBQUEsQ0FBQ0E7UUFDOURBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDakNBLENBQUNBO0lBR0RGLGdEQUFnQkEsR0FBaEJBLFVBQWlCQSxNQUFlQTtRQUU1QkcsSUFBSUEsT0FBT0EsR0FBV0EsS0FBS0EsQ0FBQ0E7UUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQy9CQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNuQkEsQ0FBQ0E7UUFDREEsMERBQTBEQTtRQUMxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbEJBLENBQUNBO1FBRURBLElBQUlBLFdBQVdBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3JCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLHFGQUFxRkE7WUFDckZBLG1CQUFtQkE7WUFDbkJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQkEsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDekJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBO0lBQ3ZCQSxDQUFDQTtJQUdESCw2REFBNkJBLEdBQTdCQSxVQUE4QkEsY0FBa0JBLEVBQUVBLEtBQVlBO1FBQzFESSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsVUFBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsSUFBS0EsT0FBQUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxFQUE5Q0EsQ0FBOENBLENBQUNBLENBQUNBO1FBQ3ZGQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUNMSiw0QkFBQ0E7QUFBREEsQ0FBQ0EsQUE1Q0QsRUFBb0Msb0JBQW9CLEVBNEN2RDtBQUlELG1EQUFtRDtBQUNuRDtJQUEyQ0ssZ0RBQW9CQTtJQUEvREE7UUFBMkNDLDhCQUFvQkE7SUFzQi9EQSxDQUFDQTtJQXBCR0QscURBQWNBLEdBQWRBLFVBQWVBLFFBQVlBO1FBQ3ZCRSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNqQkEsSUFBSUEsSUFBSUEsR0FBVUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsR0FBQ0Esd0JBQXdCQSxHQUFDQSxRQUFRQSxDQUFDQTtRQUNuRkEsSUFBSUEsRUFBRUEsR0FBb0JBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUNQQSxVQUFTQSxDQUFDQTtZQUNOLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDaEMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDbEQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ25ELENBQUM7UUFDTCxDQUFDLENBQ0pBLENBQUNBO1FBQ0ZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGtCQUFrQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzFDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNoRUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFDTEYsbUNBQUNBO0FBQURBLENBQUNBLEFBdEJELEVBQTJDLG9CQUFvQixFQXNCOUQ7QUFJRCw4RkFBOEY7QUFDOUYsc0VBQXNFO0FBQ3RFO0lBQWtDRyx1Q0FBY0E7SUFLNUNBLDZCQUFZQSxtQkFBdUJBLEVBQUVBLFlBQWdCQSxFQUFFQSxXQUFrQkEsRUFBRUEsSUFBV0EsRUFDOUVBLFNBQWlCQTtRQUNyQkMsa0JBQU1BLG1CQUFtQkEsRUFBRUEsWUFBWUEsRUFBRUEsV0FBV0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBR0RELDJGQUEyRkE7SUFDM0ZBLGtEQUFrREE7SUFDbERBLDRDQUFjQSxHQUFkQSxVQUFlQSxRQUFZQTtRQUN2QkUsZ0JBQUtBLENBQUNBLGNBQWNBLFlBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQy9CQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUMvQkEsQ0FBQ0E7SUFHREYsK0ZBQStGQTtJQUMvRkEsNEVBQTRFQTtJQUM1RUEsNENBQWNBLEdBQWRBLFVBQWVBLFNBQWFBLEVBQUVBLFFBQVlBO1FBQ3RDRyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLENBQUNBO1FBQ0RBLFNBQVNBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQUNMSCwwQkFBQ0E7QUFBREEsQ0FBQ0EsQUEzQkQsRUFBa0MsY0FBYyxFQTJCL0M7QUFJRCxvRkFBb0Y7QUFDcEY7SUFBd0NJLDZDQUFvQkE7SUFVeERBLG1DQUFZQSxtQkFBNEJBLEVBQUVBLFlBQThCQTtRQUNwRUMsa0JBQU1BLG1CQUFtQkEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLElBQUlBLENBQUNBO1FBQzVCQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN6QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsWUFBWUEsQ0FBQ0E7SUFDbENBLENBQUNBO0lBR0RELGtEQUFjQSxHQUFkQSxVQUFlQSxRQUFZQTtRQUEzQkUsaUJBbUJDQTtRQWxCR0EsSUFBSUEsSUFBSUEsR0FBVUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDdkVBLElBQUlBLEVBQUVBLEdBQW9CQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoRUEsRUFBRUEsQ0FBQ0EsU0FBU0EsR0FBR0EsY0FBY0EsQ0FBQ0E7UUFDOUJBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFVBQUNBLEVBQXlCQTtZQUNsQ0EsS0FBSUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUNqQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsS0FBS0EsR0FBZUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVsRUEsSUFBSUEsSUFBSUEsR0FBZUEsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdERBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLGNBQWNBLENBQUNBO1FBQ2hDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNyQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFFeEJBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLEVBQUVBLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQy9CQSxDQUFDQTtJQUVERiw2Q0FBU0EsR0FBVEEsVUFBVUEsQ0FBU0E7UUFDZkcsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDSkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDMUNBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUN2Q0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFREgsMENBQU1BLEdBQU5BLFVBQU9BLENBQVNBO1FBQ1pJLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNKQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUNqQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBO1lBQ3ZDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN4REEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFT0oseURBQXFCQSxHQUE3QkE7UUFBQUssaUJBNkJDQTtRQTVCR0EsSUFBSUEsRUFBcUJBLEVBQ3JCQSxRQUEwQ0EsQ0FBQ0E7UUFDL0NBLFFBQVFBLEdBQUdBLFVBQUNBLEtBQVlBLEVBQ2hCQSxjQUFzQkEsRUFDdEJBLG9CQUE0QkEsRUFDNUJBLFlBQW9CQTtZQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLE1BQU1BLENBQUNBLGNBQWNBLEdBQUdBLGNBQWNBLENBQUNBO2dCQUN2Q0EsTUFBTUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxvQkFBb0JBLENBQUNBO2dCQUMvQ0EsTUFBTUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxZQUFZQSxDQUFDQTtnQkFDekNBLE1BQU1BLENBQUNBLHFCQUFxQkEsRUFBRUEsQ0FBQ0E7Z0JBQy9CQSxLQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDcENBLEtBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUN6RUEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0E7UUFDRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLCtEQUErREE7WUFDL0RBLDZCQUE2QkE7WUFDN0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLGtCQUFrQkEsSUFBSUEsTUFBTUEsQ0FBQ0Esa0JBQWtCQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBO2dCQUNyQ0EseUJBQXlCQTtnQkFDekJBLEVBQUVBLEdBQUdBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDMUNBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFDekVBLENBQUNBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtRQUN6RUEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDTEwsZ0NBQUNBO0FBQURBLENBQUNBLEFBM0ZELEVBQXdDLG9CQUFvQixFQTJGM0Q7QUFJRDtJQUE2Qk0sa0NBQVFBO0lBVWpDQSx3QkFBWUEsWUFBNkJBO1FBQ3JDQyxJQUFJQSxDQUFDQSwyQkFBMkJBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSx5QkFBeUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3ZDQSxrQkFBTUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBR0RELCtDQUFzQkEsR0FBdEJBLFVBQXVCQSxPQUFnQkE7UUFDbkNFLElBQUlBLENBQUNBLDJCQUEyQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNwRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQ0EsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EseUJBQXlCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQ0EsSUFBSUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFHREYsd0NBQWVBLEdBQWZBLFVBQWdCQSxRQUFnQkE7UUFBaENHLGlCQWVDQTtRQWRHQSxJQUFJQSxJQUFJQSxHQUFzQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDN0NBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBQ25DQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBO1FBQ3JDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQTtRQUFDQSxDQUFDQTtRQUMvQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsSUFBSUEsQ0FBQ0EseUJBQXlCQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUN0Q0Esd0ZBQXdGQTtZQUN4RkEsdUVBQXVFQTtZQUN2RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUNBLFVBQVVBLENBQUNBLGNBQU1BLE9BQUFBLEtBQUlBLENBQUNBLDBCQUEwQkEsRUFBRUEsRUFBakNBLENBQWlDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUM1REEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsQ0FBQ0EseUJBQXlCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUMzQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFHREgsbURBQTBCQSxHQUExQkE7UUFDSUksSUFBSUEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUN0Q0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtRQUM1QkEsQ0FBRUE7UUFBQUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVEEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EscUNBQXFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMzREEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFHT0oscUNBQVlBLEdBQXBCQTtRQUNJSyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBQ3ZDQSxPQUFPQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBO1FBQ3BDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUdETCwyRUFBMkVBO0lBQzNFQSx5Q0FBZ0JBLEdBQWhCQTtRQUFBTSxpQkFHQ0E7UUFGR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDcEJBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsVUFBVUEsQ0FBRUEsY0FBTUEsT0FBQUEsS0FBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsRUFBdEJBLENBQXNCQSxFQUFFQSxHQUFHQSxDQUFFQSxDQUFDQTtJQUMvRUEsQ0FBQ0E7SUFHRE4sd0NBQWVBLEdBQWZBO1FBQ0lPLElBQUlBLElBQUlBLEdBQXNCQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxPQUFPQSxFQUFFQSxPQUFPQSxDQUFDQTtRQUNsRUEsNkRBQTZEQTtRQUM3REEsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFFcEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hEQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUNyQkEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFFakJBLGlFQUFpRUE7UUFDakVBLHFDQUFxQ0E7UUFDckNBLE9BQU9BLEdBQUdBLFVBQUNBLENBQUNBLElBQU9BLE1BQU1BLENBQUNBLENBQUNBLENBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXBEQSwyREFBMkRBO1FBQzNEQSxPQUFPQSxHQUFHQSxVQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFPQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUU1Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsRUFBRUE7WUFDM0JBLElBQUlBLEtBQUtBLEdBQU9BLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEVBQUVBLEVBQ3BDQSxJQUFJQSxHQUFPQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUN6Q0EsUUFBUUEsQ0FBQ0E7WUFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQUNBLE1BQU1BLENBQUNBO1lBQUNBLENBQUNBO1lBQzlDQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxRQUFRQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNoQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsQ0FBQ0E7Z0JBQ2ZBLElBQUlBLE9BQU9BLEdBQUdBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7Z0JBQ2hEQSxHQUFHQSxHQUFHQTtvQkFDRkEsT0FBT0EsRUFBRUEsSUFBSUEsR0FBR0EsQ0FBQ0E7b0JBQ2pCQSxpQkFBaUJBLEVBQUVBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLDhCQUE4QkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzVEQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQTtvQkFDbEJBLEtBQUtBLEVBQUVBLEVBQUVBO29CQUNUQSxNQUFNQSxFQUFFQSxPQUFPQSxDQUFDQSxJQUFJQTtvQkFDcEJBLE9BQU9BLEVBQUVBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLCtCQUErQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ25EQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtpQkFDdkRBLENBQUNBO2dCQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtvQkFBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ3ZDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNyQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFSEEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7SUFDakJBLENBQUNBO0lBR0RQLG9DQUFvQ0E7SUFDcENBLG9DQUFXQSxHQUFYQSxVQUFZQSxDQUFDQTtRQUNUUSxJQUFJQSxJQUFJQSxHQUFzQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDN0NBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7UUFDN0JBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1FBQ2hDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtJQUMvQkEsQ0FBQ0E7SUFDTFIscUJBQUNBO0FBQURBLENBQUNBLEFBcElELEVBQTZCLFFBQVEsRUFvSXBDO0FBSUQsZ0ZBQWdGO0FBQ2hGO0lBQWlDUyxzQ0FBZ0JBO0lBZ0I3Q0EsNEJBQVlBLFVBQVVBO1FBQ2xCQyxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxVQUFVQSxDQUFDQTtRQUM3QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDdkRBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3hCQSxJQUFJQSxDQUFDQSx3QkFBd0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3JDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hDQSxJQUFJQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtRQUNyQkEsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxDQUFDQTtRQUMvQkEsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxFQUFFQSxDQUFDQTtRQUNuQ0EsaUJBQU9BLENBQUNBO0lBQ1pBLENBQUNBO0lBR0RELDBDQUFhQSxHQUFiQTtRQUFBRSxpQkFhQ0E7UUFaR0EsMEVBQTBFQTtRQUMxRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUM3QkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsVUFBQ0EsT0FBY0EsRUFBRUEsS0FBaUJBO1lBQ3JEQSxJQUFJQSxJQUFlQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBSUEsQ0FBQ0EsVUFBVUEsS0FBS0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFcENBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBRWhFQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMzQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFHREYsK0ZBQStGQTtJQUMvRkEseUNBQVlBLEdBQVpBO1FBQ0lHLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0E7SUFDbkNBLENBQUNBO0lBR0RILDRGQUE0RkE7SUFDNUZBLFdBQVdBO0lBQ1hBLHdDQUFXQSxHQUFYQSxVQUFZQSxRQUFpQkE7UUFDekJJLElBQUlBLENBQUNBLHVCQUF1QkEsRUFBRUEsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLHdCQUF3QkEsSUFBSUEsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6RUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUN4REEsOEJBQThCQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1FBQzdFQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUdESiw4RkFBOEZBO0lBQzlGQSwyQkFBMkJBO0lBQzNCQSw0Q0FBZUEsR0FBZkE7UUFDSUssSUFBSUEsT0FBT0EsRUFBRUEsV0FBV0EsRUFBRUEsUUFBUUEsRUFBRUEsU0FBU0EsRUFBRUEsS0FBS0EsRUFDaERBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQ25CQSxPQUFPQSxHQUFVQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxhQUFhQSxDQUFDQTtRQUMvQ0EseUZBQXlGQTtRQUN6RkEsWUFBWUE7UUFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0VBLElBQUlBLENBQUNBLHFCQUFxQkEsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDdkVBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBO2lCQUN2Q0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsU0FBU0EsQ0FBQ0E7aUJBQ25DQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM1QkEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7aUJBQ2pDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQTtpQkFDNUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1lBQy9CQSxxREFBcURBO1lBQ3JEQSxDQUFDQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUM1Q0EsQ0FBQ0E7SUFHREwseUNBQXlDQTtJQUN6Q0EsNENBQWVBLEdBQWZBO1FBQ0lNLE1BQU1BLENBQUNBLElBQUlBLGlCQUFpQkEsQ0FBQ0EsUUFBUUEsR0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFBRUE7WUFDbkRBLGFBQWFBLEVBQUVBLENBQUNBO1NBQ25CQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdETix3REFBMkJBLEdBQTNCQTtRQUNJTyxJQUFJQSxRQUFRQSxHQUFPQSxFQUFFQSxDQUFDQTtRQUN0QkEsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsT0FBT0E7WUFDaENBLElBQUlBLEtBQUtBLEdBQUdBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3BDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxFQUFFQSxFQUFFQSxVQUFDQSxNQUFNQSxJQUFPQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN2RUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSEEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN2RUEsQ0FBQ0E7SUFHRFAsb0RBQXVCQSxHQUF2QkE7UUFDSVEsSUFBSUEsU0FBU0EsR0FBVUEsQ0FBQ0EsQ0FBQ0E7UUFDekJBLGtEQUFrREE7UUFDbERBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLElBQVdBLEVBQUVBLE9BQU9BO1lBQ3hEQSxJQUFJQSxLQUFLQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxRQUFRQSxFQUFFQSxZQUFZQSxDQUFDQTtZQUM1REEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDaENBLG1EQUFtREE7WUFDbkRBLFlBQVlBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLElBQVdBLEVBQUVBLFNBQVNBO2dCQUNsREEsSUFBSUEsTUFBTUEsR0FBT0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxJQUFJQSxFQUFFQSxFQUM1Q0EsT0FBT0EsR0FBT0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFDckNBLGFBQWFBLENBQUNBO2dCQUNsQkEsOERBQThEQTtnQkFDOURBLGFBQWFBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLElBQVdBLEVBQUVBLEtBQUtBO29CQUM3REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDTkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFDekNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ05BLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1FBQ3hDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNOQSxtRUFBbUVBO1FBQ25FQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLFNBQVNBLElBQUlBLENBQUNBLENBQUNBO0lBQzlDQSxDQUFDQTtJQUdPUiwwQ0FBYUEsR0FBckJBLFVBQXNCQSxLQUFTQTtRQUMzQlMsNEZBQTRGQTtRQUM1RkEsdUNBQXVDQTtRQUN2Q0EsSUFBSUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQzNFQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUNkQSxDQUFDQTtJQUdPVCxxREFBd0JBLEdBQWhDQSxVQUFpQ0EsS0FBU0E7UUFDdENVLHNGQUFzRkE7UUFDdEZBLElBQUlBLEtBQUtBLEVBQUVBLFlBQVlBLENBQUNBO1FBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVDQSxNQUFNQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtZQUMvQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFHT1Ysa0RBQXFCQSxHQUE3QkEsVUFBOEJBLEtBQVNBO1FBQ25DVyxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFHRFgsMkRBQTJEQTtJQUMzREEsNkNBQWdCQSxHQUFoQkE7UUFBQVksaUJBMERDQTtRQXpER0EsNkNBQTZDQTtRQUM3Q0EsSUFBSUEsZUFBZUEsR0FBd0JBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsS0FBS0E7WUFDbEZBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3ZDQSxNQUFNQSxDQUFDQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLGFBQWFBLEdBQUNBLEtBQUlBLENBQUNBLFVBQVVBLEdBQUNBLElBQUlBLEdBQUdBLEVBQUVBLEVBQUVBO2dCQUM5RUEsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsSUFBSUE7Z0JBQ25CQSxXQUFXQSxFQUFFQSxDQUFDQTtnQkFDZEEsTUFBTUEsRUFBRUEsR0FBR0E7Z0JBQ1hBLFFBQVFBLEVBQUVBLEtBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQzNDQSxXQUFXQSxFQUFFQSxDQUFDQTthQUNqQkEsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxHQUFHQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQ3BFQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQSxFQUFFQSxTQUFTQSxFQUFFQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUVyRkEsSUFBSUEsUUFBUUEsR0FBd0JBO1lBQ2hDQSxJQUFJQSxDQUFDQSxtQkFBbUJBO1lBQ3hCQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLGFBQWFBLEdBQUNBLElBQUlBLENBQUNBLFVBQVVBLEVBQUVBO2dCQUNyREEsTUFBTUEsRUFBRUEsTUFBTUE7Z0JBQ2RBLFdBQVdBLEVBQUVBLENBQUNBO2dCQUNkQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxhQUFhQTthQUMvQkEsQ0FBQ0E7U0FDTEEsQ0FBQ0E7UUFFRkEsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxHQUFHQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQ3pFQSxlQUFlQSxHQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQSxFQUFFQSxNQUFNQSxFQUFFQSxpQkFBaUJBLEVBQUVBLFdBQVdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1FBRXhGQSxJQUFJQSxTQUFTQSxHQUFHQTtZQUNaQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQ3pDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUNoQ0EsRUFBRUEsTUFBTUEsRUFBRUEsYUFBYUEsRUFBRUEsV0FBV0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDbERBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZUFBZUEsQ0FBQ0EsTUFBTUEsRUFDekNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQ2hDQSxFQUFFQSxNQUFNQSxFQUFFQSxPQUFPQSxFQUFFQSxXQUFXQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUM1Q0EsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUN6Q0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFDaENBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLEVBQUVBLFdBQVdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzVDQSxJQUFJQSxDQUFDQSx3QkFBd0JBO1lBQzdCQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQ3pDQSxxQkFBcUJBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQ3ZDQTtnQkFDSUEsTUFBTUEsRUFBRUEsY0FBY0E7Z0JBQ3RCQSxXQUFXQSxFQUFFQSxDQUFDQTtnQkFDZEEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0Esd0JBQXdCQTtnQkFDdkNBLFdBQVdBLEVBQUVBLENBQUNBO2FBQ2pCQSxDQUFDQTtZQUNWQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQ3pDQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQ25DQTtnQkFDSUEsTUFBTUEsRUFBRUEsZUFBZUE7Z0JBQ3ZCQSxXQUFXQSxFQUFFQSxDQUFDQTtnQkFDZEEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EscUJBQXFCQTtnQkFDcENBLFdBQVdBLEVBQUVBLENBQUNBO2FBQ2pCQSxDQUFDQTtTQUNiQSxDQUFDQTtRQUVGQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN2REEsQ0FBQ0E7SUFHT1oscURBQXdCQSxHQUFoQ0EsVUFBaUNBLEVBQUVBO1FBQy9CYSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQTtZQUNMQSxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNqQ0EsQ0FBQ0E7WUFDREEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDZEEsQ0FBQ0EsQ0FBQUE7SUFDTEEsQ0FBQ0E7SUFHRGIsK0ZBQStGQTtJQUMvRkEseUZBQXlGQTtJQUN6RkEsNkZBQTZGQTtJQUM3RkEsaUZBQWlGQTtJQUN6RUEsNkNBQWdCQSxHQUF4QkEsVUFBeUJBLEtBQUtBO1FBQzFCYyxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsR0FBVUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUE7WUFDOUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzNDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM1REEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFHRGQsbURBQXNCQSxHQUF0QkEsVUFBdUJBLFFBQTJCQSxFQUFFQSxLQUFZQTtRQUM1RGUsSUFBSUEsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsYUFBYUEsR0FBR0E7WUFDbEZBLDJDQUEyQ0E7WUFDM0NBLDhDQUE4Q0E7WUFDOUNBLDJCQUEyQkEsR0FBR0EsS0FBS0EsR0FBR0EsOEJBQThCQTtTQUN2RUEsQ0FBQ0E7UUFDRkEsZ0VBQWdFQTtRQUNoRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsSUFBSUEsaUJBQWlCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUNBQXVDQSxHQUFDQSxLQUFLQSxHQUFDQSx5Q0FBeUNBLENBQUNBLENBQUNBO1FBQ2hIQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQTtZQUNIQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO2dCQUNsQ0EsY0FBY0EsRUFBRUEsU0FBU0E7Z0JBQ3pCQSxnQkFBZ0JBLEVBQUVBLFVBQUNBLEVBQUVBLElBQU9BLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5REEsZUFBZUEsRUFBRUEsYUFBYUE7Z0JBQzlCQSxhQUFhQSxFQUFFQSxJQUFJQTtnQkFDbkJBLFFBQVFBLEVBQUVBLElBQUlBO2dCQUNkQSxTQUFTQSxFQUFFQSxRQUFRQSxDQUFDQSxnQkFBZ0JBLENBQUNBLEtBQUtBLENBQUNBO2dCQUMzQ0EsZUFBZUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsUUFBUUEsQ0FBQ0EsWUFBWUEsRUFBRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7YUFDN0VBLENBQUNBO1NBQ0xBLENBQUNBO0lBQ05BLENBQUNBO0lBR0RmLCtEQUFrQ0EsR0FBbENBLFVBQW1DQSxFQUFFQTtRQUNqQ2dCLE1BQU1BLENBQUNBLFVBQUNBLFFBQTJCQSxFQUFFQSxLQUFZQTtZQUM3Q0EsSUFBSUEsVUFBVUEsR0FBR0EsRUFBRUEsRUFBRUEsS0FBS0EsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDckZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyRUEsVUFBVUEsR0FBR0EsQ0FBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsRUFBRUEsVUFBVUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDckZBLENBQUNBO1lBQ0RBLE1BQU1BLENBQUNBO2dCQUNIQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO29CQUNsQ0EsU0FBU0EsRUFBRUEsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFDM0NBLGVBQWVBLEVBQUVBLFVBQVVBO2lCQUM5QkEsQ0FBQ0E7YUFDTEEsQ0FBQ0E7UUFDTkEsQ0FBQ0EsQ0FBQUE7SUFDTEEsQ0FBQ0E7SUFHT2hCLHFEQUF3QkEsR0FBaENBLFVBQWlDQSxRQUEyQkEsRUFBRUEsS0FBWUEsRUFDbEVBLEdBQU9BO1FBQ1hpQixJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxFQUFFQSxFQUMxQ0EsT0FBT0EsR0FBR0EsY0FBdUJBLE9BQUFBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsRUFBckNBLENBQXFDQSxDQUFDQTtRQUUzRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsV0FBV0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxtQkFBbUJBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQzFDQSxFQUFFQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2REEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLDBFQUEwRUE7Z0JBQzFFQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxpQkFBaUJBLENBQUNBO3FCQUM1Q0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQTtxQkFDN0JBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsbUJBQW1CQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUM5Q0EsRUFBRUEsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSwwRUFBMEVBO2dCQUMxRUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQTtxQkFDNUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLG1CQUFtQkEsQ0FBQ0E7cUJBQzdCQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBO1lBQ3hDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSw4REFBOERBO1FBQzlEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxjQUFjQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLG1CQUFtQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxnQkFBZ0JBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVEQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSx5REFBeURBO1FBQ3pEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLG1CQUFtQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxhQUFhQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsMERBQTBEQTtRQUMxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxrREFBa0RBO2dCQUNsREEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsbUJBQW1CQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6REEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFHRGpCLHlEQUE0QkEsR0FBNUJBLFVBQTZCQSxRQUEyQkEsRUFBRUEsS0FBWUE7UUFDbEVrQixJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNuQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtZQUN0REEsbUJBQW1CQSxFQUFFQSxVQUFDQSxTQUFTQTtnQkFDM0JBLElBQUlBLE9BQU9BLEdBQU9BLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFDeERBLEtBQUtBLEdBQU9BLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQzdEQSxNQUFNQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUN6REEsQ0FBQ0E7WUFDREEscUJBQXFCQSxFQUFFQSxVQUFDQSxDQUFLQSxFQUFFQSxDQUFLQTtnQkFDaENBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO2dCQUN2REEsTUFBTUEsQ0FBQ0EsQ0FBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLENBQUNBO1lBQ0RBLHVCQUF1QkEsRUFBRUEsVUFBQ0EsS0FBS0E7Z0JBQzNCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBO29CQUNoREEsYUFBYUEsRUFBRUEsSUFBSUE7b0JBQ25CQSxjQUFjQSxFQUFFQSxlQUFlQTtvQkFDL0JBLGdCQUFnQkEsRUFBRUEsY0FBUUEsTUFBTUEsQ0FBQ0EsYUFBYUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3hFQSxlQUFlQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQTtpQkFDOUJBLENBQUNBLENBQUNBO2dCQUNIQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDdENBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1lBQ2hCQSxDQUFDQTtZQUNEQSxrQkFBa0JBLEVBQUVBLFVBQUNBLEdBQVNBO2dCQUMxQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtvQkFDM0NBLGVBQWVBLEVBQUVBLHNCQUFzQkE7aUJBQ3hDQSxDQUFDQSxDQUFDQTtZQUNQQSxDQUFDQTtZQUNEQSxlQUFlQSxFQUFFQSxVQUFDQSxHQUFTQTtnQkFDdkJBLE1BQU1BLENBQUNBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsRUFBRUE7b0JBQzNDQSxlQUFlQSxFQUFFQSxpQkFBaUJBO2lCQUNuQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsQ0FBQ0E7WUFDREEsT0FBT0EsRUFBRUEsY0FBTUEsT0FBQUEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtnQkFDakRBLGVBQWVBLEVBQUVBLHdCQUF3QkE7YUFDNUNBLENBQUNBLEVBRmFBLENBRWJBO1NBQ0xBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBR0RsQiwrQ0FBa0JBLEdBQWxCQSxVQUFtQkEsUUFBMkJBLEVBQUVBLEtBQVlBO1FBQ3hEbUIsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtZQUN0REEsbUJBQW1CQSxFQUFFQSxVQUFDQSxTQUFTQTtnQkFDM0JBLElBQUlBLE9BQU9BLEdBQU9BLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFDeERBLEtBQUtBLEdBQU9BLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFDeERBLElBQUlBLEdBQU9BLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO2dCQUN4REEsTUFBTUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDbEZBLENBQUNBO1lBQ0RBLHFCQUFxQkEsRUFBRUEsVUFBQ0EsQ0FBS0EsRUFBRUEsQ0FBS0E7Z0JBQ2hDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtnQkFDdkRBLE1BQU1BLENBQUNBLENBQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pDQSxDQUFDQTtZQUNEQSx1QkFBdUJBLEVBQUVBLFVBQUNBLEtBQUtBO2dCQUMzQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtvQkFDekNBLGVBQWVBLEVBQUVBLEtBQUtBLENBQUNBLElBQUlBO2lCQUM5QkEsQ0FBQ0EsQ0FBQ0E7WUFDUEEsQ0FBQ0E7WUFDREEsa0JBQWtCQSxFQUFFQSxVQUFDQSxHQUFTQTtnQkFDMUJBLE1BQU1BLENBQUNBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsRUFBRUE7b0JBQzNDQSxlQUFlQSxFQUFFQSxNQUFNQTtpQkFDeEJBLENBQUNBLENBQUNBO1lBQ1BBLENBQUNBO1lBQ0RBLGVBQWVBLEVBQUVBLFVBQUNBLEdBQVNBO2dCQUN2QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtvQkFDM0NBLGVBQWVBLEVBQUVBLEVBQUVBLENBQUNBLCtDQUErQ0E7aUJBQ3BFQSxDQUFDQSxDQUFDQTtZQUNQQSxDQUFDQTtTQUNKQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdEbkIsK0NBQWtCQSxHQUFsQkEsVUFBbUJBLFFBQTJCQSxFQUFFQSxLQUFZQTtRQUN4RG9CLG1GQUFtRkE7UUFDbkZBLElBQUlBLFdBQVdBLEdBQUdBLFVBQUNBLElBQVdBLEVBQUVBLFNBQVNBO1lBQ3JDQSxJQUFJQSxPQUFPQSxHQUFPQSxPQUFPQSxDQUFDQSxpQkFBaUJBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1lBQzdEQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoREEsQ0FBQ0EsQ0FBQ0E7UUFDRkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtZQUN0REEsbUJBQW1CQSxFQUFFQSxVQUFDQSxTQUFTQTtnQkFDM0JBLElBQUlBLE9BQU9BLEdBQU9BLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFDeERBLEtBQUtBLEdBQU9BLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQzdEQSxNQUFNQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxTQUFTQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUM3RUEsQ0FBQ0E7WUFDREEscUJBQXFCQSxFQUFFQSxVQUFDQSxDQUFLQSxFQUFFQSxDQUFLQTtnQkFDaENBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO2dCQUN2REEsTUFBTUEsQ0FBQ0EsQ0FBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLENBQUNBO1lBQ0RBLHVCQUF1QkEsRUFBRUEsVUFBQ0EsS0FBS0E7Z0JBQzNCQSxNQUFNQSxDQUFDQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO29CQUN6Q0EsZUFBZUEsRUFBRUEsQ0FBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7aUJBQzdFQSxDQUFDQSxDQUFDQTtZQUNQQSxDQUFDQTtZQUNEQSxrQkFBa0JBLEVBQUVBLFVBQUNBLEdBQVNBO2dCQUMxQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtvQkFDekNBLGVBQWVBLEVBQUVBLENBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBO2lCQUNwRUEsQ0FBQ0EsQ0FBQ0E7WUFDUEEsQ0FBQ0E7WUFDREEsZUFBZUEsRUFBRUEsVUFBQ0EsR0FBU0E7Z0JBQ3ZCQSxNQUFNQSxDQUFDQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO29CQUN6Q0EsZUFBZUEsRUFBRUEsQ0FBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7aUJBQ3BFQSxDQUFDQSxDQUFDQTtZQUNQQSxDQUFDQTtTQUNKQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdEcEIsd0RBQTJCQSxHQUEzQkEsVUFBNEJBLFFBQTJCQSxFQUFFQSxLQUFZQTtRQUNqRXFCLElBQUlBLGNBQWNBLEdBQUdBLFVBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLElBQU9BLE1BQU1BLENBQUNBLENBQUNBLENBQUVBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQzdEQSxVQUFVQSxHQUFHQSxVQUFDQSxDQUFLQSxFQUFFQSxDQUFLQTtZQUN0QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLE1BQU1BLENBQUNBLENBQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQSxFQUNEQSxvQkFBb0JBLEdBQUdBLFVBQUNBLEdBQVNBO1lBQzdCQSxJQUFJQSxZQUFZQSxFQUFFQSxHQUFHQSxHQUFHQSxFQUFFQSxFQUFFQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUMzQ0EsOENBQThDQTtZQUM5Q0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsU0FBU0E7Z0JBQ2xCQSxJQUFJQSxPQUFPQSxHQUFPQSxPQUFPQSxDQUFDQSxpQkFBaUJBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEVBQUVBLEVBQ3hEQSxJQUFJQSxHQUFTQSxPQUFPQSxDQUFDQSxNQUFNQSxJQUFJQSxFQUFFQSxDQUFDQTtnQkFDdENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLEtBQUtBO29CQUNmQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDckRBLDJFQUEyRUE7b0JBQzNFQSxFQUFFQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0JBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLENBQUNBLENBQUNBLENBQUNBO1lBQ0hBLHFEQUFxREE7WUFDckRBLFlBQVlBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ2pFQSxzQkFBc0JBO1lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLDhCQUE4QkEsQ0FBQ0EsWUFBWUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLENBQUNBO1lBQ0RBLE1BQU1BLENBQUNBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsRUFBRUE7Z0JBQzNDQSxlQUFlQSxFQUFFQSxHQUFHQTthQUNyQkEsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0EsQ0FBQ0E7UUFDTkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtZQUN0REEsbUJBQW1CQSxFQUFFQSxVQUFDQSxTQUFTQTtnQkFDM0JBLElBQUlBLE9BQU9BLEdBQU9BLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFDeERBLEtBQUtBLEdBQU9BLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQzdEQSxNQUFNQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxTQUFTQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUM3RUEsQ0FBQ0E7WUFDREEscUJBQXFCQSxFQUFFQSxVQUFDQSxDQUFLQSxFQUFFQSxDQUFLQTtnQkFDaENBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO2dCQUN2REEsTUFBTUEsQ0FBQ0EsQ0FBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLENBQUNBO1lBQ0RBLHVCQUF1QkEsRUFBRUEsVUFBQ0EsS0FBS0E7Z0JBQzNCQSxJQUFJQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxPQUFPQSxJQUFJQSxFQUFFQSxFQUM3QkEsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsR0FBR0EsUUFBUUEsR0FBR0EsRUFBRUEsRUFDN0NBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLElBQUlBLEVBQUVBLEVBQ2pDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSw4QkFBOEJBLENBQUNBLElBQUlBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNoRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtvQkFDekNBLGVBQWVBLEVBQUVBLEdBQUdBO2lCQUN2QkEsQ0FBQ0EsQ0FBQ0E7WUFDUEEsQ0FBQ0E7WUFDREEsa0JBQWtCQSxFQUFFQSxvQkFBb0JBO1lBQ3hDQSxlQUFlQSxFQUFFQSxvQkFBb0JBO1NBQ3hDQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdEckIsc0RBQXlCQSxHQUF6QkEsVUFBMEJBLFFBQTJCQSxFQUFFQSxLQUFZQTtRQUMvRHNCLElBQUlBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3BDQSxJQUFJQSxPQUFPQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQ0EsTUFBTUEsQ0FBQ0E7WUFDSEEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxFQUFFQTtnQkFDbENBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzNDQSxlQUFlQSxFQUFFQSxPQUFPQSxHQUFHQSxPQUFPQSxDQUFDQSxRQUFRQSxHQUFHQSxHQUFHQTthQUNwREEsQ0FBQ0E7U0FDTEEsQ0FBQ0E7SUFDTkEsQ0FBQ0E7SUFHRHRCLDBEQUE2QkEsR0FBN0JBLFVBQThCQSxRQUEyQkEsRUFBRUEsS0FBWUE7UUFDbkV1QixNQUFNQSxDQUFDQTtZQUNIQSxJQUFJQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLEVBQUVBO2dCQUNsQ0EsU0FBU0EsRUFBRUEsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDM0NBLGVBQWVBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7YUFDNUVBLENBQUNBO1NBQ0xBLENBQUNBO0lBQ05BLENBQUNBO0lBR0R2QiwyREFBOEJBLEdBQTlCQSxVQUErQkEsTUFBTUEsRUFBRUEsTUFBYUE7UUFBcER3QixpQkFpQ0NBO1FBaENHQSxJQUFJQSxHQUFHQSxHQUFHQTs7Ozs7Ozs7Ozs7aURBVytCQSxDQUFDQTtRQUMxQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBRUEsR0FBR0EsQ0FBRUEsQ0FBQ0E7UUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFVBQUNBLENBQUNBLEVBQUNBLENBQUNBLElBQU9BLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLEtBQUtBO1lBQ3hEQSxJQUFJQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUNmQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUNmQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEVBQ2hEQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUN0Q0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxFQUFFQSxFQUFFQSxlQUFlQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLHVCQUF1QkEsRUFBRUEsRUFBRUEsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BFQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtZQUNEQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSx1QkFBdUJBLEVBQUVBLEVBQUVBLEVBQUVBLGVBQWVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BFQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLHVCQUF1QkEsRUFBRUEsRUFBRUEsRUFBRUEsZUFBZUEsRUFBRUEsRUFBRUEsRUFBRUEsaUJBQWlCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvRkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLHVCQUF1QkEsRUFBRUEsRUFBRUEsRUFBRUEsZUFBZUEsRUFBRUEsRUFBRUEsRUFBRUEsaUJBQWlCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvRkEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSEEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDckJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUdEeEIscUZBQXFGQTtJQUNyRkEsNkNBQWdCQSxHQUFoQkE7UUFBQXlCLGlCQW1DQ0E7UUFsQ0dBLElBQUlBLFFBQTZCQSxFQUM3QkEsWUFBaUNBLEVBQ2pDQSxTQUE4QkEsQ0FBQ0E7UUFDbkNBLGlEQUFpREE7UUFDakRBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLEVBQUVBLG1CQUFtQkEsRUFBRUEsVUFBQ0EsRUFBRUE7WUFDckRBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3pFQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNqQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsRUFBRUEscUJBQXFCQSxFQUFFQSxVQUFDQSxFQUF5QkE7WUFDNURBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEVBQzNEQSxLQUFLQSxHQUFlQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1JBLE1BQU1BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1lBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2pCQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNIQSxRQUFRQSxHQUFHQTtZQUNQQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLHNCQUFzQkEsQ0FBQ0E7U0FDdERBLENBQUNBO1FBRUxBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsS0FBS0E7WUFDdERBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3ZDQSxNQUFNQSxDQUFDQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLEtBQUlBLENBQUNBLGtDQUFrQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMUZBLENBQUNBLENBQUNBLENBQUNBO1FBRUhBLFNBQVNBLEdBQUdBO1lBQ1JBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsWUFBWUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsNEJBQTRCQSxDQUFDQTtZQUNsRkEsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxHQUFHQSxZQUFZQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBO1lBQ3hFQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLFlBQVlBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0E7WUFDeEVBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsWUFBWUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxDQUFDQTtZQUNqRkEsSUFBSUEsa0JBQWtCQSxDQUFDQSxDQUFDQSxHQUFHQSxZQUFZQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBO1lBQy9FQSxJQUFJQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLFlBQVlBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLDZCQUE2QkEsQ0FBQ0E7U0FDdEZBLENBQUNBO1FBRUZBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLFlBQVlBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO0lBQ3BEQSxDQUFDQTtJQUdEekIsNEZBQTRGQTtJQUM1RkEsa0RBQXFCQSxHQUFyQkE7UUFDSTBCLElBQUlBLFVBQVVBLEdBQTZCQTtZQUN2Q0EsSUFBSUEsdUJBQXVCQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxzQkFBc0JBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1NBQ3pFQSxDQUFDQTtRQUVGQSxJQUFJQSxpQkFBMkNBLENBQUNBO1FBQ2hEQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsS0FBS0E7WUFDM0RBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3ZDQSxNQUFNQSxDQUFDQSxJQUFJQSx1QkFBdUJBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3BEQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVIQSxJQUFJQSxhQUFhQSxHQUE2QkE7WUFDMUNBLElBQUlBLHVCQUF1QkEsQ0FBQ0EsYUFBYUEsRUFBRUEsRUFBRUEsc0JBQXNCQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUM3RUEsSUFBSUEsdUJBQXVCQSxDQUFDQSxPQUFPQSxFQUFFQSxFQUFFQSxzQkFBc0JBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ3ZFQSxJQUFJQSx1QkFBdUJBLENBQUNBLE9BQU9BLEVBQUVBLEVBQUVBLHNCQUFzQkEsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDdkVBLElBQUlBLHVCQUF1QkEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxFQUFFQSxzQkFBc0JBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2pGQSxJQUFJQSx1QkFBdUJBLENBQUNBLGNBQWNBLEVBQUVBLEVBQUVBLGlCQUFpQkEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDeEVBLElBQUlBLHVCQUF1QkEsQ0FBQ0EsZUFBZUEsRUFBRUEsRUFBRUEsaUJBQWlCQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQTtTQUM1RUEsQ0FBQ0E7UUFFRkEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxhQUFhQSxDQUFDQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFHRDFCLGlFQUFpRUE7SUFDakVBLDZFQUE2RUE7SUFDN0VBLGdEQUFnREE7SUFDaERBLHNEQUF5QkEsR0FBekJBLFVBQTBCQSxRQUFpQkE7UUFDdkMyQixJQUFJQSxTQUFTQSxHQUEwQkEsRUFBRUEsQ0FBQ0E7UUFFMUNBLGlEQUFpREE7UUFDakRBLElBQUlBLGtCQUFrQkEsR0FBR0EsSUFBSUEsb0JBQW9CQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxFQUFFQSxlQUFlQSxFQUFFQSxFQUFFQSxFQUM3RUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUNuQ0Esd0JBQXdCQTtRQUN4QkEsSUFBSUEsZUFBZUEsR0FBR0EsSUFBSUEsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM1REEsZUFBZUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM1Q0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFFaENBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQUdEM0IsdUVBQXVFQTtJQUN2RUEsMkVBQTJFQTtJQUMzRUEsZ0RBQWdEQTtJQUNoREEsdURBQTBCQSxHQUExQkEsVUFBMkJBLFFBQWlCQTtRQUN4QzRCLElBQUlBLFNBQVNBLEdBQTBCQSxFQUFFQSxDQUFDQTtRQUMxQ0EscURBQXFEQTtRQUNyREEsSUFBSUEsb0JBQW9CQSxHQUFHQSxJQUFJQSxzQkFBc0JBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3RFQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO1FBQ3JDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtJQUNyQkEsQ0FBQ0E7SUFHRDVCLCtGQUErRkE7SUFDL0ZBLDBDQUFhQSxHQUFiQSxVQUFjQSxRQUF1QkE7UUFFakM2QixzREFBc0RBO1FBQ3REQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtRQUNuQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsRUFBRUEsY0FBTUEsT0FBQUEsTUFBTUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxFQUFuQ0EsQ0FBbUNBLENBQUNBLENBQUNBO1FBRTlFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLGNBQU1BLE9BQUFBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLEVBQTlCQSxDQUE4QkEsQ0FBQ0EsQ0FBQ0E7UUFDOUVBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBQ3hCQSxJQUFJQSxPQUFPQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxPQUFPQSxDQUFDQTtRQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeENBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsT0FBT0E7b0JBQ3REQSxpQ0FBaUNBLENBQUNBLENBQUNBO2dCQUMzQ0EsOEJBQThCQTtnQkFDOUJBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO2dCQUNqREEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLGlFQUFpRUE7UUFDakVBLE1BQU1BLENBQUNBLDBCQUEwQkEsRUFBRUEsQ0FBQ0E7SUFDeENBLENBQUNBO0lBQ0w3Qix5QkFBQ0E7QUFBREEsQ0FBQ0EsQUF6cUJELEVBQWlDLGdCQUFnQixFQXlxQmhEO0FBSUQsNEVBQTRFO0FBQzVFO0lBQXFDOEIsMENBQW9CQTtJQUF6REE7UUFBcUNDLDhCQUFvQkE7SUF3Q3pEQSxDQUFDQTtJQXRDR0QsK0NBQWNBLEdBQWRBLFVBQWVBLFFBQVlBO1FBQTNCRSxpQkFVQ0E7UUFUR0EsSUFBSUEsSUFBSUEsR0FBVUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsR0FBQ0EsZUFBZUEsR0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDMUVBLElBQUlBLEVBQUVBLEdBQW9CQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBRUEsVUFBQ0EsQ0FBQ0EsSUFBS0EsT0FBQUEsS0FBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLENBQUNBLEVBQS9DQSxDQUErQ0EsQ0FBRUEsQ0FBQ0E7UUFDdEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGtCQUFrQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzFDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFBQUEsQ0FBQ0E7UUFDOURBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDakNBLENBQUNBO0lBR0RGLGlEQUFnQkEsR0FBaEJBLFVBQWlCQSxNQUFlQTtRQUU1QkcsMERBQTBEQTtRQUMxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2xCQSxDQUFDQTtRQUVEQSxJQUFJQSxXQUFXQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNyQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxxRkFBcUZBO1lBQ3JGQSxtQkFBbUJBO1lBQ25CQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDNUJBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3pCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFHREgsOERBQTZCQSxHQUE3QkEsVUFBOEJBLGNBQWtCQSxFQUFFQSxLQUFTQTtRQUN2REksRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLFVBQUNBLENBQUNBLEVBQUVBLEdBQUdBLElBQUtBLE9BQUFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsRUFBOUNBLENBQThDQSxDQUFDQSxDQUFDQTtRQUN2RkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDTEosNkJBQUNBO0FBQURBLENBQUNBLEFBeENELEVBQXFDLG9CQUFvQixFQXdDeEQ7QUFJRCw4RkFBOEY7QUFDOUYsc0VBQXNFO0FBQ3RFO0lBQW1DSyx3Q0FBY0E7SUFLN0NBLDhCQUFZQSxtQkFBdUJBLEVBQUVBLFlBQWdCQSxFQUFFQSxXQUFrQkEsRUFBRUEsSUFBV0EsRUFDOUVBLFNBQWlCQTtRQUNyQkMsa0JBQU1BLG1CQUFtQkEsRUFBRUEsWUFBWUEsRUFBRUEsV0FBV0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBR0RELDJGQUEyRkE7SUFDM0ZBLGtEQUFrREE7SUFDbERBLDZDQUFjQSxHQUFkQSxVQUFlQSxRQUFZQTtRQUN2QkUsZ0JBQUtBLENBQUNBLGNBQWNBLFlBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQy9CQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUMvQkEsQ0FBQ0E7SUFHREYsK0ZBQStGQTtJQUMvRkEsNEVBQTRFQTtJQUM1RUEsNkNBQWNBLEdBQWRBLFVBQWVBLFNBQWFBLEVBQUVBLFFBQVlBO1FBQ3RDRyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLENBQUNBO1FBQ0RBLFNBQVNBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQUNMSCwyQkFBQ0E7QUFBREEsQ0FBQ0EsQUEzQkQsRUFBbUMsY0FBYyxFQTJCaEQ7QUFHRCx1RUFBdUU7QUFDdkUsQ0FBQyxDQUFDLGNBQU0sT0FBQSxNQUFNLENBQUMsU0FBUyxFQUFFLEVBQWxCLENBQWtCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBNb24gSmFuIDI1IDIwMTYgMTU6MjA6NTYgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkVERERhdGFJbnRlcmZhY2UudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJCaW9tYXNzQ2FsY3VsYXRpb25VSS50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQ2FyYm9uU3VtbWF0aW9uLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiU3R1ZHlHcmFwaGluZy50c1wiIC8+XG5cbmRlY2xhcmUgdmFyIEVERERhdGE6RURERGF0YTtcblxubW9kdWxlIFN0dWR5RCB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIG1haW5HcmFwaE9iamVjdDphbnk7XG4gICAgdmFyIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0OiBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldDtcblxuICAgIHZhciBtYWluR3JhcGhSZWZyZXNoVGltZXJJRDphbnk7XG5cbiAgICB2YXIgbGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcjphbnk7XG4gICAgdmFyIGFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyOmFueTtcblxuICAgIHZhciBhdHRhY2htZW50SURzOmFueTtcbiAgICB2YXIgYXR0YWNobWVudHNCeUlEOmFueTtcbiAgICB2YXIgcHJldkRlc2NyaXB0aW9uRWRpdEVsZW1lbnQ6YW55O1xuXG4gICAgLy8gV2UgY2FuIGhhdmUgYSB2YWxpZCBtZXRhYm9saWMgbWFwIGJ1dCBubyB2YWxpZCBiaW9tYXNzIGNhbGN1bGF0aW9uLlxuICAgIC8vIElmIHRoZXkgdHJ5IHRvIHNob3cgY2FyYm9uIGJhbGFuY2UgaW4gdGhhdCBjYXNlLCB3ZSdsbCBicmluZyB1cCB0aGUgVUkgdG8gXG4gICAgLy8gY2FsY3VsYXRlIGJpb21hc3MgZm9yIHRoZSBzcGVjaWZpZWQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcElEOmFueTtcbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcE5hbWU6YW55O1xuICAgIGV4cG9ydCB2YXIgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcjtcbiAgICB2YXIgY2FyYm9uQmFsYW5jZURhdGE6YW55O1xuICAgIHZhciBjYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2g6Ym9vbGVhbjtcblxuICAgIHZhciBjU291cmNlRW50cmllczphbnk7XG4gICAgdmFyIG1UeXBlRW50cmllczphbnk7XG5cbiAgICAvLyBUaGUgdGFibGUgc3BlYyBvYmplY3QgYW5kIHRhYmxlIG9iamVjdCBmb3IgdGhlIExpbmVzIHRhYmxlLlxuICAgIHZhciBsaW5lc0RhdGFHcmlkU3BlYztcbiAgICB2YXIgbGluZXNEYXRhR3JpZDtcbiAgICAvLyBUYWJsZSBzcGVjIGFuZCB0YWJsZSBvYmplY3RzLCBvbmUgZWFjaCBwZXIgUHJvdG9jb2wsIGZvciBBc3NheXMuXG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkU3BlY3M7XG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkcztcblxuXG4gICAgLy8gVXRpbGl0eSBpbnRlcmZhY2UgdXNlZCBieSBHZW5lcmljRmlsdGVyU2VjdGlvbiN1cGRhdGVVbmlxdWVJbmRleGVzSGFzaFxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUlEIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXI7XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUxpc3Qge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcltdO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFVuaXF1ZUlEVG9WYWx1ZSB7XG4gICAgICAgIFtpbmRleDogbnVtYmVyXTogc3RyaW5nO1xuICAgIH1cbiAgICAvLyBVc2VkIGluIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0I3ByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uXG4gICAgZXhwb3J0IGludGVyZmFjZSBSZWNvcmRJRFRvQm9vbGVhbiB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogYm9vbGVhbjtcbiAgICB9XG5cblxuICAgIC8vIEZvciB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gb24gdGhlIG1haW4gZ3JhcGhcbiAgICBleHBvcnQgY2xhc3MgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQge1xuXG4gICAgICAgIGFsbEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGFzc2F5RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8ga2VlcCBhIHNlcGFyYXRlIGZpbHRlciBsaXN0IGZvciBlYWNoIHR5cGUuXG4gICAgICAgIG1ldGFib2xpdGVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBwcm90ZWluRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgZ2VuZUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIG1lYXN1cmVtZW50RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcblxuICAgICAgICBtZXRhYm9saXRlRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcbiAgICAgICAgcHJvdGVpbkRhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBnZW5lcmljRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcblxuICAgICAgICBzdHVkeURPYmplY3Q6IGFueTtcbiAgICAgICAgbWFpbkdyYXBoT2JqZWN0OiBhbnk7XG5cblxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBpbml0aWFsaXplIGVhY2ggZmlsdGVyIGxpc3QuXG4gICAgICAgIGNvbnN0cnVjdG9yKHN0dWR5RE9iamVjdDogYW55KSB7XG5cbiAgICAgICAgICAgIHRoaXMuc3R1ZHlET2JqZWN0ID0gc3R1ZHlET2JqZWN0O1xuXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJlYWQgdGhyb3VnaCB0aGUgTGluZXMsIEFzc2F5cywgYW5kIEFzc2F5TWVhc3VyZW1lbnRzIHN0cnVjdHVyZXMgdG8gbGVhcm4gd2hhdCB0eXBlcyBhcmUgcHJlc2VudCxcbiAgICAgICAgLy8gdGhlbiBpbnN0YW50aWF0ZSB0aGUgcmVsZXZhbnQgc3ViY2xhc3NlcyBvZiBHZW5lcmljRmlsdGVyU2VjdGlvbiwgdG8gY3JlYXRlIGEgc2VyaWVzIG9mXG4gICAgICAgIC8vIGNvbHVtbnMgZm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiB1bmRlciB0aGUgbWFpbiBncmFwaCBvbiB0aGUgcGFnZS5cbiAgICAgICAgLy8gVGhpcyBtdXN0IGJlIG91dHNpZGUgdGhlIGNvbnN0cnVjdG9yIGJlY2F1c2UgRURERGF0YS5MaW5lcyBhbmQgRURERGF0YS5Bc3NheXMgYXJlIG5vdCBpbW1lZGlhdGVseSBhdmFpbGFibGVcbiAgICAgICAgLy8gb24gcGFnZSBsb2FkLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBjcmVhdGUgYW5kIGFkZCByZWxldmFudCBmaWx0ZXJzIGZvciBlYWNoIGdyb3VwLlxuICAgICAgICBwcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIHNlZW5JbkxpbmVzSGFzaDogUmVjb3JkSURUb0Jvb2xlYW4gPSB7fTtcbiAgICAgICAgICAgIHZhciBzZWVuSW5Bc3NheXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIGFJRHNUb1VzZTogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAgICAgLy8gRmlyc3QgZG8gc29tZSBiYXNpYyBzYW5pdHkgZmlsdGVyaW5nIG9uIHRoZSBsaXN0XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkOiBzdHJpbmcsIGFzc2F5OiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSB8fCAhbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluQXNzYXlzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwgW10sIChtZXRhZGF0YUlkKSA9PiB7IHNlZW5JbkxpbmVzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgIGFJRHNUb1VzZS5wdXNoKGFzc2F5SWQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBmaWx0ZXJzIG9uIGFzc2F5IHRhYmxlc1xuICAgICAgICAgICAgLy8gVE9ETyBtZWRpYSBpcyBub3cgYSBtZXRhZGF0YSB0eXBlLCBzdHJhaW4gYW5kIGNhcmJvbiBzb3VyY2Ugc2hvdWxkIGJlIHRvb1xuICAgICAgICAgICAgdmFyIGFzc2F5RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFN0cmFpbkZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBmb3IgKHZhciBpZCBpbiBzZWVuSW5MaW5lc0hhc2gpIHtcbiAgICAgICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IExpbmVOYW1lRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBQcm90b2NvbEZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaWQgaW4gc2VlbkluQXNzYXlzSGFzaCkge1xuICAgICAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSBjYW4gaW5pdGlhbGl6ZSBhbGwgdGhlIEFzc2F5LSBhbmQgTGluZS1sZXZlbCBmaWx0ZXJzIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICB0aGlzLmFzc2F5RmlsdGVycyA9IGFzc2F5RmlsdGVycztcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5mb3JFYWNoKChmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGFJRHNUb1VzZSk7XG4gICAgICAgICAgICAgICAgZmlsdGVyLnBvcHVsYXRlVGFibGUoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnB1c2gobmV3IE1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnB1c2gobmV3IE1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLnB1c2gobmV3IFByb3RlaW5GaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLnB1c2gobmV3IEdlbmVGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMucHVzaChuZXcgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXS5jb25jYXQoXG4gICAgICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzKTtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgZmlsdGVycyBpbiB0aGUgZmlsdGVyaW5nIHNlY3Rpb24sIGFuZCBhZGQgaW4gdGhlIG9uZXMgdGhhdFxuICAgICAgICAvLyBjbGFpbSB0byBiZSBcInVzZWZ1bFwiLlxuICAgICAgICByZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciB0YWJsZSA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2ZpbHRlclRhYmxlJykuYXBwZW5kVG8oJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuZW1wdHkoKSk7XG4gICAgICAgICAgICB2YXIgZGFyazpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICAkLmVhY2godGhpcy5hbGxGaWx0ZXJzLCAoaSwgd2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHdpZGdldC5pc0ZpbHRlclVzZWZ1bCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5hZGRUb1BhcmVudCh0YWJsZVswXSk7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5hcHBseUJhY2tncm91bmRTdHlsZShkYXJrKTtcbiAgICAgICAgICAgICAgICAgICAgZGFyayA9ICFkYXJrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBHaXZlbiBhIHNldCBvZiBtZWFzdXJlbWVudCByZWNvcmRzIGFuZCBhIGRpY3Rpb25hcnkgb2YgY29ycmVzcG9uZGluZyB0eXBlc1xuICAgICAgICAvLyAocGFzc2VkIGRvd24gZnJvbSB0aGUgc2VydmVyIGFzIGEgcmVzdWx0IG9mIGEgZGF0YSByZXF1ZXN0KSwgc29ydCB0aGVtIGludG9cbiAgICAgICAgLy8gdGhlaXIgdmFyaW91cyBjYXRlZ29yaWVzLCB0aGVuIHBhc3MgZWFjaCBjYXRlZ29yeSB0byB0aGVpciByZWxldmFudCBmaWx0ZXIgb2JqZWN0c1xuICAgICAgICAvLyAocG9zc2libHkgYWRkaW5nIHRvIHRoZSB2YWx1ZXMgaW4gdGhlIGZpbHRlcikgYW5kIHJlZnJlc2ggdGhlIFVJIGZvciBlYWNoIGZpbHRlci5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gcHJvY2VzcyBlYWNoIGdyb3VwIHNlcGFyYXRlbHkgaGVyZS5cbiAgICAgICAgcHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzKG1lYXN1cmVzLCB0eXBlcyk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgcHJvY2VzczogKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbikgPT4gdm9pZDtcblxuICAgICAgICAgICAgdmFyIGZpbHRlcklkcyA9IHsgJ20nOiBbXSwgJ3AnOiBbXSwgJ2cnOiBbXSwgJ18nOiBbXSB9O1xuXG4gICAgICAgICAgICAvLyBsb29wIG92ZXIgYWxsIGRvd25sb2FkZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICAkLmVhY2gobWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIG10eXBlID0gdHlwZXNbbWVhc3VyZW1lbnQudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLm0ucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcklkcy5wLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAnZycpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgZ2VuZSAvIHRyYW5zY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLmcucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcklkcy5fLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBwcm9jZXNzID0gKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzKTtcbiAgICAgICAgICAgICAgICB3aWRnZXQucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMubS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZXRhYm9saXRlRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMubSkpO1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5wLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByb3RlaW5GaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGZpbHRlcklkcy5wKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByb2Nlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZmlsdGVySWRzLmcubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuZ2VuZUZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLmcpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMuXy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZWFzdXJlbWVudEZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLl8pKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQnVpbGQgYSBsaXN0IG9mIGFsbCB0aGUgbm9uLWRpc2FibGVkIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHkuXG4gICAgICAgIGJ1aWxkQXNzYXlJRFNldCgpOiBhbnlbXSB7XG4gICAgICAgICAgICB2YXIgYXNzYXlJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkLCBhc3NheSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlIHx8ICFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGFzc2F5SWRzLnB1c2goYXNzYXlJZCk7XG5cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGFzc2F5SWRzO1xuICAgICAgICB9XG4gICAgIFxuXG4gICAgICAgIC8vIFN0YXJ0aW5nIHdpdGggYSBsaXN0IG9mIGFsbCB0aGUgbm9uLWRpc2FibGVkIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHksIHdlIGxvb3AgaXQgdGhyb3VnaCB0aGVcbiAgICAgICAgLy8gTGluZSBhbmQgQXNzYXktbGV2ZWwgZmlsdGVycywgY2F1c2luZyB0aGUgZmlsdGVycyB0byByZWZyZXNoIHRoZWlyIFVJLCBuYXJyb3dpbmcgdGhlIHNldCBkb3duLlxuICAgICAgICAvLyBXZSByZXNvbHZlIHRoZSByZXN1bHRpbmcgc2V0IG9mIEFzc2F5IElEcyBpbnRvIG1lYXN1cmVtZW50IElEcywgdGhlbiBwYXNzIHRoZW0gb24gdG8gdGhlXG4gICAgICAgIC8vIG1lYXN1cmVtZW50LWxldmVsIGZpbHRlcnMuICBJbiB0aGUgZW5kIHdlIHJldHVybiBhIHNldCBvZiBtZWFzdXJlbWVudCBJRHMgcmVwcmVzZW50aW5nIHRoZVxuICAgICAgICAvLyBlbmQgcmVzdWx0IG9mIGFsbCB0aGUgZmlsdGVycywgc3VpdGFibGUgZm9yIHBhc3NpbmcgdG8gdGhlIGdyYXBoaW5nIGZ1bmN0aW9ucy5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gcHJvY2VzcyBlYWNoIGdyb3VwIHNlcGFyYXRlbHkgaGVyZS5cbiAgICAgICAgYnVpbGRGaWx0ZXJlZE1lYXN1cmVtZW50cygpOiBhbnlbXSB7XG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBc3NheUlkcyA9IHRoaXMuYnVpbGRBc3NheUlEU2V0KCk7XG5cbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFzc2F5RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkQXNzYXlJZHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhmaWx0ZXJlZEFzc2F5SWRzKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnRJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goZmlsdGVyZWRBc3NheUlkcywgKGksIGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICAgICAkLm1lcmdlKG1lYXN1cmVtZW50SWRzLCBhc3NheS5tZWFzdXJlcyB8fCBbXSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2Ugc3RhcnQgb3V0IHdpdGggZm91ciByZWZlcmVuY2VzIHRvIHRoZSBhcnJheSBvZiBhdmFpbGFibGUgbWVhc3VyZW1lbnQgSURzLCBvbmUgZm9yIGVhY2ggbWFqb3IgY2F0ZWdvcnkuXG4gICAgICAgICAgICAvLyBFYWNoIG9mIHRoZXNlIHdpbGwgYmVjb21lIGl0cyBvd24gYXJyYXkgaW4gdHVybiBhcyB3ZSBuYXJyb3cgaXQgZG93bi5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgdG8gcHJldmVudCBhIHN1Yi1zZWxlY3Rpb24gaW4gb25lIGNhdGVnb3J5IGZyb20gb3ZlcnJpZGluZyBhIHN1Yi1zZWxlY3Rpb24gaW4gdGhlIG90aGVycy5cblxuICAgICAgICAgICAgdmFyIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBwcm90ZWluTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcblxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdlIG9ubHkgdHJ5IHRvIGZpbHRlciBpZiB3ZSBnb3QgbWVhc3VyZW1lbnRzIHRoYXQgYXBwbHkgdG8gdGhlIHdpZGdldCB0eXBlc1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhtZXRhYm9saXRlTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdGVpbk1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKHByb3RlaW5NZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZU1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lcmljRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lcmljTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZXJpY01lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9uY2Ugd2UndmUgZmluaXNoZWQgd2l0aCB0aGUgZmlsdGVyaW5nLCB3ZSB3YW50IHRvIHNlZSBpZiBhbnkgc3ViLXNlbGVjdGlvbnMgaGF2ZSBiZWVuIG1hZGUgYWNyb3NzXG4gICAgICAgICAgICAvLyBhbnkgb2YgdGhlIGNhdGVnb3JpZXMsIGFuZCBpZiBzbywgbWVyZ2UgdGhvc2Ugc3ViLXNlbGVjdGlvbnMgaW50byBvbmUuXG5cbiAgICAgICAgICAgIC8vIFRoZSBpZGVhIGlzLCB3ZSBkaXNwbGF5IGV2ZXJ5dGhpbmcgdW50aWwgdGhlIHVzZXIgbWFrZXMgYSBzZWxlY3Rpb24gaW4gb25lIG9yIG1vcmUgb2YgdGhlIG1haW4gY2F0ZWdvcmllcyxcbiAgICAgICAgICAgIC8vIHRoZW4gZHJvcCBldmVyeXRoaW5nIGZyb20gdGhlIGNhdGVnb3JpZXMgdGhhdCBjb250YWluIG5vIHNlbGVjdGlvbnMuXG5cbiAgICAgICAgICAgIC8vIEFuIGV4YW1wbGUgc2NlbmFyaW8gd2lsbCBleHBsYWluIHdoeSB0aGlzIGlzIGltcG9ydGFudDpcblxuICAgICAgICAgICAgLy8gU2F5IGEgdXNlciBpcyBwcmVzZW50ZWQgd2l0aCB0d28gY2F0ZWdvcmllcywgTWV0YWJvbGl0ZSBhbmQgTWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAvLyBNZXRhYm9saXRlIGhhcyBjcml0ZXJpYSAnQWNldGF0ZScgYW5kICdFdGhhbm9sJyBhdmFpbGFibGUuXG4gICAgICAgICAgICAvLyBNZWFzdXJlbWVudCBoYXMgb25seSBvbmUgY3JpdGVyaWEgYXZhaWxhYmxlLCAnT3B0aWNhbCBEZW5zaXR5Jy5cbiAgICAgICAgICAgIC8vIEJ5IGRlZmF1bHQsIEFjZXRhdGUsIEV0aGFub2wsIGFuZCBPcHRpY2FsIERlbnNpdHkgYXJlIGFsbCB1bmNoZWNrZWQsIGFuZCBhbGwgdmlzaWJsZSBvbiB0aGUgZ3JhcGguXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gJ3JldHVybiBtZWFzdXJlbWVudHMnIGJlbG93LlxuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjaGVja3MgJ0FjZXRhdGUnLCB0aGV5IGV4cGVjdCBvbmx5IEFjZXRhdGUgdG8gYmUgZGlzcGxheWVkLCBldmVuIHRob3VnaCBubyBjaGFuZ2UgaGFzIGJlZW4gbWFkZSB0b1xuICAgICAgICAgICAgLy8gdGhlIE1lYXN1cmVtZW50IHNlY3Rpb24gd2hlcmUgT3B0aWNhbCBEZW5zaXR5IGlzIGxpc3RlZC5cbiAgICAgICAgICAgIC8vIEluIHRoZSBjb2RlIGJlbG93LCBieSB0ZXN0aW5nIGZvciBhbnkgY2hlY2tlZCBib3hlcyBpbiB0aGUgbWV0YWJvbGl0ZUZpbHRlcnMgZmlsdGVycyxcbiAgICAgICAgICAgIC8vIHdlIHJlYWxpemUgdGhhdCB0aGUgc2VsZWN0aW9uIGhhcyBiZWVuIG5hcnJvd2VkIGRvb3duLCBzbyB3ZSBhcHBlbmQgdGhlIEFjZXRhdGUgbWVhc3VyZW1lbnRzIG9udG8gZFNNLlxuICAgICAgICAgICAgLy8gVGhlbiB3aGVuIHdlIGNoZWNrIHRoZSBtZWFzdXJlbWVudEZpbHRlcnMgZmlsdGVycywgd2Ugc2VlIHRoYXQgdGhlIE1lYXN1cmVtZW50IHNlY3Rpb24gaGFzXG4gICAgICAgICAgICAvLyBub3QgbmFycm93ZWQgZG93biBpdHMgc2V0IG9mIG1lYXN1cmVtZW50cywgc28gd2Ugc2tpcCBhcHBlbmRpbmcgdGhvc2UgdG8gZFNNLlxuICAgICAgICAgICAgLy8gVGhlIGVuZCByZXN1bHQgaXMgb25seSB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMuXG5cbiAgICAgICAgICAgIC8vIFRoZW4gc3VwcG9zZSB0aGUgdXNlciBjaGVja3MgJ09wdGljYWwgRGVuc2l0eScsIGludGVuZGluZyB0byBjb21wYXJlIEFjZXRhdGUgZGlyZWN0bHkgYWdhaW5zdCBPcHRpY2FsIERlbnNpdHkuXG4gICAgICAgICAgICAvLyBTaW5jZSBtZWFzdXJlbWVudEZpbHRlcnMgbm93IGhhcyBjaGVja2VkIGJveGVzLCB3ZSBwdXNoIGl0cyBtZWFzdXJlbWVudHMgb250byBkU00sXG4gICAgICAgICAgICAvLyB3aGVyZSBpdCBjb21iaW5lcyB3aXRoIHRoZSBBY2V0YXRlLlxuXG4gICAgICAgICAgICB2YXIgYW55Q2hlY2tlZCA9IChmaWx0ZXI6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKTogYm9vbGVhbiA9PiB7IHJldHVybiBmaWx0ZXIuYW55Q2hlY2tib3hlc0NoZWNrZWQ7IH07XG5cbiAgICAgICAgICAgIHZhciBkU006IGFueVtdID0gW107ICAgIC8vIFwiRGVsaWJlcmF0ZWx5IHNlbGVjdGVkIG1lYXN1cmVtZW50c1wiXG4gICAgICAgICAgICBpZiAoIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KG1ldGFib2xpdGVNZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAoICAgIHRoaXMucHJvdGVpbkZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KHByb3RlaW5NZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAoICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KGdlbmVNZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAodGhpcy5tZWFzdXJlbWVudEZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KGdlbmVyaWNNZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAoZFNNLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkU007XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBtZWFzdXJlbWVudElkcztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZT86IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICAgICAgICAgIHZhciByZWRyYXc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIGRvIG5vdCByZWRyYXcgaWYgZ3JhcGggaXMgbm90IGluaXRpYWxpemVkIHlldFxuICAgICAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVkcmF3ID0gISFmb3JjZTtcbiAgICAgICAgICAgICAgICAvLyBXYWxrIGRvd24gdGhlIGZpbHRlciB3aWRnZXQgbGlzdC4gIElmIHdlIGVuY291bnRlciBvbmUgd2hvc2UgY29sbGVjdGl2ZSBjaGVja2JveFxuICAgICAgICAgICAgICAgIC8vIHN0YXRlIGhhcyBjaGFuZ2VkIHNpbmNlIHdlIGxhc3QgbWFkZSB0aGlzIHdhbGssIHRoZW4gYSByZWRyYXcgaXMgcmVxdWlyZWQuIE5vdGUgdGhhdFxuICAgICAgICAgICAgICAgIC8vIHdlIHNob3VsZCBub3Qgc2tpcCB0aGlzIGxvb3AsIGV2ZW4gaWYgd2UgYWxyZWFkeSBrbm93IGEgcmVkcmF3IGlzIHJlcXVpcmVkLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBjYWxsIHRvIGFueUNoZWNrYm94ZXNDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSBzZXRzIGludGVybmFsIHN0YXRlIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgICAgICAgICAvLyB3aWRnZXRzIHRoYXQgd2Ugd2lsbCB1c2UgbmV4dCB0aW1lIGFyb3VuZC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5hbGxGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWx0ZXIuYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZHJhdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZWRyYXc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgLy8gQSBnZW5lcmljIHZlcnNpb24gb2YgYSBmaWx0ZXJpbmcgY29sdW1uIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiBiZW5lYXRoIHRoZSBncmFwaCBhcmVhIG9uIHRoZSBwYWdlLFxuICAgIC8vIG1lYW50IHRvIGJlIHN1YmNsYXNzZWQgZm9yIHNwZWNpZmljIGNyaXRlcmlhLlxuICAgIC8vIFdoZW4gaW5pdGlhbGl6ZWQgd2l0aCBhIHNldCBvZiByZWNvcmQgSURzLCB0aGUgY29sdW1uIGlzIGZpbGxlZCB3aXRoIGxhYmVsZWQgY2hlY2tib3hlcywgb25lIGZvciBlYWNoXG4gICAgLy8gdW5pcXVlIHZhbHVlIG9mIHRoZSBnaXZlbiBjcml0ZXJpYSBlbmNvdW50ZXJlZCBpbiB0aGUgcmVjb3Jkcy5cbiAgICAvLyBEdXJpbmcgdXNlLCBhbm90aGVyIHNldCBvZiByZWNvcmQgSURzIGlzIHBhc3NlZCBpbiwgYW5kIGlmIGFueSBjaGVja2JveGVzIGFyZSBjaGVja2VkLCB0aGUgSUQgc2V0IGlzXG4gICAgLy8gbmFycm93ZWQgZG93biB0byBvbmx5IHRob3NlIHJlY29yZHMgdGhhdCBjb250YWluIHRoZSBjaGVja2VkIHZhbHVlcy5cbiAgICAvLyBDaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBnaXZlbiBJRHMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkLFxuICAgIC8vIHZpc3VhbGx5IGluZGljYXRpbmcgdG8gYSB1c2VyIHRoYXQgdGhvc2UgdmFsdWVzIGFyZSBub3QgYXZhaWxhYmxlIGZvciBmdXJ0aGVyIGZpbHRlcmluZy4gXG4gICAgLy8gVGhlIGZpbHRlcnMgYXJlIG1lYW50IHRvIGJlIGNhbGxlZCBpbiBzZXF1ZW5jZSwgZmVlZGluZyBlYWNoIHJldHVybmVkIElEIHNldCBpbnRvIHRoZSBuZXh0LFxuICAgIC8vIHByb2dyZXNzaXZlbHkgbmFycm93aW5nIGRvd24gdGhlIGVuYWJsZWQgY2hlY2tib3hlcy5cbiAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBzdWJjbGFzcyB0aGlzIGZvciBlYWNoIGdyb3VwIHR5cGUuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICAvLyBBIGRpY3Rpb25hcnkgb2YgdGhlIHVuaXF1ZSB2YWx1ZXMgZm91bmQgZm9yIGZpbHRlcmluZyBhZ2FpbnN0LCBhbmQgdGhlIGRpY3Rpb25hcnkncyBjb21wbGVtZW50LlxuICAgICAgICAvLyBFYWNoIHVuaXF1ZSBJRCBpcyBhbiBpbnRlZ2VyLCBhc2NlbmRpbmcgZnJvbSAxLCBpbiB0aGUgb3JkZXIgdGhlIHZhbHVlIHdhcyBmaXJzdCBlbmNvdW50ZXJlZFxuICAgICAgICAvLyB3aGVuIGV4YW1pbmluZyB0aGUgcmVjb3JkIGRhdGEgaW4gdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2guXG4gICAgICAgIHVuaXF1ZVZhbHVlczogVW5pcXVlSURUb1ZhbHVlO1xuICAgICAgICB1bmlxdWVJbmRleGVzOiBWYWx1ZVRvVW5pcXVlSUQ7XG4gICAgICAgIHVuaXF1ZUluZGV4Q291bnRlcjogbnVtYmVyO1xuXG4gICAgICAgIC8vIFRoZSBzb3J0ZWQgb3JkZXIgb2YgdGhlIGxpc3Qgb2YgdW5pcXVlIHZhbHVlcyBmb3VuZCBpbiB0aGUgZmlsdGVyXG4gICAgICAgIHVuaXF1ZVZhbHVlc09yZGVyOiBudW1iZXJbXTtcblxuICAgICAgICAvLyBBIGRpY3Rpb25hcnkgcmVzb2x2aW5nIGEgcmVjb3JkIElEIChhc3NheSBJRCwgbWVhc3VyZW1lbnQgSUQpIHRvIGFuIGFycmF5LiBFYWNoIGFycmF5XG4gICAgICAgIC8vIGNvbnRhaW5zIHRoZSBpbnRlZ2VyIGlkZW50aWZpZXJzIG9mIHRoZSB1bmlxdWUgdmFsdWVzIHRoYXQgYXBwbHkgdG8gdGhhdCByZWNvcmQuXG4gICAgICAgIC8vIChJdCdzIHJhcmUsIGJ1dCB0aGVyZSBjYW4gYWN0dWFsbHkgYmUgbW9yZSB0aGFuIG9uZSBjcml0ZXJpYSB0aGF0IG1hdGNoZXMgYSBnaXZlbiBJRCxcbiAgICAgICAgLy8gIGZvciBleGFtcGxlIGEgTGluZSB3aXRoIHR3byBmZWVkcyBhc3NpZ25lZCB0byBpdC4pXG4gICAgICAgIGZpbHRlckhhc2g6IFZhbHVlVG9VbmlxdWVMaXN0O1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHJlc29sdmluZyB0aGUgZmlsdGVyIHZhbHVlIGludGVnZXIgaWRlbnRpZmllcnMgdG8gSFRNTCBJbnB1dCBjaGVja2JveGVzLlxuICAgICAgICBjaGVja2JveGVzOiB7W2luZGV4OiBudW1iZXJdOiBKUXVlcnl9O1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHVzZWQgdG8gY29tcGFyZSBjaGVja2JveGVzIHdpdGggYSBwcmV2aW91cyBzdGF0ZSB0byBkZXRlcm1pbmUgd2hldGhlciBhblxuICAgICAgICAvLyB1cGRhdGUgaXMgcmVxdWlyZWQuIFZhbHVlcyBhcmUgJ0MnIGZvciBjaGVja2VkLCAnVScgZm9yIHVuY2hlY2tlZCwgYW5kICdOJyBmb3Igbm90XG4gICAgICAgIC8vIGV4aXN0aW5nIGF0IHRoZSB0aW1lLiAoJ04nIGNhbiBiZSB1c2VmdWwgd2hlbiBjaGVja2JveGVzIGFyZSByZW1vdmVkIGZyb20gYSBmaWx0ZXIgZHVlIHRvXG4gICAgICAgIC8vIHRoZSBiYWNrLWVuZCBkYXRhIGNoYW5naW5nLilcbiAgICAgICAgcHJldmlvdXNDaGVja2JveFN0YXRlOiBVbmlxdWVJRFRvVmFsdWU7XG4gICAgICAgIC8vIERpY3Rpb25hcnkgcmVzb2x2aW5nIHRoZSBmaWx0ZXIgdmFsdWUgaW50ZWdlciBpZGVudGlmaWVycyB0byBIVE1MIHRhYmxlIHJvdyBlbGVtZW50cy5cbiAgICAgICAgdGFibGVSb3dzOiB7W2luZGV4OiBudW1iZXJdOiBIVE1MVGFibGVSb3dFbGVtZW50fTtcblxuICAgICAgICAvLyBSZWZlcmVuY2VzIHRvIEhUTUwgZWxlbWVudHMgY3JlYXRlZCBieSB0aGUgZmlsdGVyXG4gICAgICAgIGZpbHRlckNvbHVtbkRpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHRpdGxlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHNlYXJjaEJveEVsZW1lbnQ6SFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgc2Nyb2xsWm9uZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIGZpbHRlcmluZ1RhYmxlOiBKUXVlcnk7XG4gICAgICAgIHRhYmxlQm9keUVsZW1lbnQ6IEhUTUxUYWJsZUVsZW1lbnQ7XG5cbiAgICAgICAgLy8gU2VhcmNoIGJveCByZWxhdGVkXG4gICAgICAgIHR5cGluZ1RpbWVvdXQ6IG51bWJlcjtcbiAgICAgICAgdHlwaW5nRGVsYXk6IG51bWJlcjtcbiAgICAgICAgY3VycmVudFNlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBwcmV2aW91c1NlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBtaW5DaGFyc1RvVHJpZ2dlclNlYXJjaDogbnVtYmVyO1xuXG4gICAgICAgIGFueUNoZWNrYm94ZXNDaGVja2VkOiBib29sZWFuO1xuXG4gICAgICAgIHNlY3Rpb25UaXRsZTogc3RyaW5nO1xuICAgICAgICBzZWN0aW9uU2hvcnRMYWJlbDogc3RyaW5nO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleENvdW50ZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IFtdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy50eXBpbmdEZWxheSA9IDMzMDsgICAgLy8gVE9ETzogTm90IGltcGxlbWVudGVkXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2ggPSAxO1xuXG4gICAgICAgICAgICB0aGlzLmNvbmZpZ3VyZSgpO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVDb250YWluZXJPYmplY3RzKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0dlbmVyaWMgRmlsdGVyJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnZ2YnO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDcmVhdGUgYWxsIHRoZSBjb250YWluZXIgSFRNTCBvYmplY3RzXG4gICAgICAgIGNyZWF0ZUNvbnRhaW5lck9iamVjdHMoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgc0JveElEOiBzdHJpbmcgPSAnZmlsdGVyJyArIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgKyAnU2VhcmNoQm94JyxcbiAgICAgICAgICAgICAgICBzQm94OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJDb2x1bW5EaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNvbHVtbicpWzBdO1xuICAgICAgICAgICAgdGhpcy50aXRsZUVsZW1lbnQgPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJIZWFkJykudGV4dCh0aGlzLnNlY3Rpb25UaXRsZSlbMF07XG5cbiAgICAgICAgICAgICQoc0JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSlcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdpZCc6IHNCb3hJRCwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6IHNCb3hJRCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdwbGFjZWhvbGRlcic6IHRoaXMuc2VjdGlvblRpdGxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3NpemUnOiAxNH0pXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKCdzZWFyY2hCb3ggZmlsdGVySGVhZCcpO1xuICAgICAgICAgICAgc0JveC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dCcpOyAvLyBKUXVlcnkgLmF0dHIoKSBjYW5ub3Qgc2V0IHRoaXNcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoQm94RWxlbWVudCA9IHNCb3g7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFpvbmVEaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNyaXRlcmlhU2Nyb2xsWm9uZScpWzBdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJpbmdUYWJsZSA9ICQoXCI8dGFibGU+XCIpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKCdmaWx0ZXJDcml0ZXJpYVRhYmxlIGRyYWdib3hlcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAnY2VsbHBhZGRpbmcnOiAwLCAnY2VsbHNwYWNpbmcnOiAwIH0pXG4gICAgICAgICAgICAgICAgLmFwcGVuZCh0aGlzLnRhYmxlQm9keUVsZW1lbnQgPSA8SFRNTFRhYmxlRWxlbWVudD4kKFwiPHRib2R5PlwiKVswXSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdXNlZFZhbHVlczogVmFsdWVUb1VuaXF1ZUlELCBjclNldDogbnVtYmVyW10sIGNIYXNoOiBVbmlxdWVJRFRvVmFsdWUsXG4gICAgICAgICAgICAgICAgcHJldmlvdXNJZHM6IHN0cmluZ1tdO1xuICAgICAgICAgICAgLy8gY2FuIGdldCBJRHMgZnJvbSBtdWx0aXBsZSBhc3NheXMsIGZpcnN0IG1lcmdlIHdpdGggdGhpcy5maWx0ZXJIYXNoXG4gICAgICAgICAgICBwcmV2aW91c0lkcyA9ICQubWFwKHRoaXMuZmlsdGVySGFzaCB8fCB7fSwgKF8sIHByZXZpb3VzSWQ6IHN0cmluZykgPT4gcHJldmlvdXNJZCk7XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYWRkZWRJZDogc3RyaW5nKTogdm9pZCA9PiB7IHRoaXMuZmlsdGVySGFzaFthZGRlZElkXSA9IFtdOyB9KTtcbiAgICAgICAgICAgIGlkcyA9ICQubWFwKHRoaXMuZmlsdGVySGFzaCB8fCB7fSwgKF8sIHByZXZpb3VzSWQ6IHN0cmluZykgPT4gcHJldmlvdXNJZCk7XG4gICAgICAgICAgICAvLyBza2lwIG92ZXIgYnVpbGRpbmcgdW5pcXVlIHZhbHVlcyBhbmQgc29ydGluZyB3aGVuIG5vIG5ldyBJRHMgYWRkZWRcbiAgICAgICAgICAgIGlmIChpZHMubGVuZ3RoID4gcHJldmlvdXNJZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHMpO1xuICAgICAgICAgICAgICAgIGNyU2V0ID0gW107XG4gICAgICAgICAgICAgICAgY0hhc2ggPSB7fTtcbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgYSByZXZlcnNlZCBoYXNoIHNvIGtleXMgbWFwIHZhbHVlcyBhbmQgdmFsdWVzIG1hcCBrZXlzXG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMudW5pcXVlSW5kZXhlcywgKHZhbHVlOiBzdHJpbmcsIHVuaXF1ZUlEOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY0hhc2hbdW5pcXVlSURdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGNyU2V0LnB1c2godW5pcXVlSUQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIEFscGhhYmV0aWNhbGx5IHNvcnQgYW4gYXJyYXkgb2YgdGhlIGtleXMgYWNjb3JkaW5nIHRvIHZhbHVlc1xuICAgICAgICAgICAgICAgIGNyU2V0LnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9hOnN0cmluZyA9IGNIYXNoW2FdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfYjpzdHJpbmcgPSBjSGFzaFtiXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gX2EgPCBfYiA/IC0xIDogX2EgPiBfYiA/IDEgOiAwO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzID0gY0hhc2g7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IGNyU2V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJbiB0aGlzIGZ1bmN0aW9uIGFyZSBydW5uaW5nIHRocm91Z2ggdGhlIGdpdmVuIGxpc3Qgb2YgbWVhc3VyZW1lbnQgSURzIGFuZCBleGFtaW5pbmdcbiAgICAgICAgLy8gdGhlaXIgcmVjb3JkcyBhbmQgcmVsYXRlZCByZWNvcmRzLCBsb2NhdGluZyB0aGUgcGFydGljdWxhciBmaWVsZCB3ZSBhcmUgaW50ZXJlc3RlZCBpbixcbiAgICAgICAgLy8gYW5kIGNyZWF0aW5nIGEgbGlzdCBvZiBhbGwgdGhlIHVuaXF1ZSB2YWx1ZXMgZm9yIHRoYXQgZmllbGQuICBBcyB3ZSBnbywgd2UgbWFyayBlYWNoXG4gICAgICAgIC8vIHVuaXF1ZSB2YWx1ZSB3aXRoIGFuIGludGVnZXIgVUlELCBhbmQgY29uc3RydWN0IGEgaGFzaCByZXNvbHZpbmcgZWFjaCByZWNvcmQgdG8gb25lIChvclxuICAgICAgICAvLyBwb3NzaWJseSBtb3JlKSBvZiB0aG9zZSBpbnRlZ2VyIFVJRHMuICBUaGlzIHByZXBhcmVzIHVzIGZvciBxdWljayBmaWx0ZXJpbmcgbGF0ZXIgb24uXG4gICAgICAgIC8vIChUaGlzIGdlbmVyaWMgZmlsdGVyIGRvZXMgbm90aGluZywgc28gd2UgbGVhdmUgdGhlc2Ugc3RydWN0dXJlcyBibGFuay4pXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNvbWUgdXAgd2l0aCAyIG9yIG1vcmUgY3JpdGVyaWEsIHRoZXJlIGlzIG5vIHBvaW50IGluIGRpc3BsYXlpbmcgdGhlIGZpbHRlci5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTpib29sZWFuIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgYWRkVG9QYXJlbnQocGFyZW50RGl2KTp2b2lkIHtcbiAgICAgICAgICAgIHBhcmVudERpdi5hcHBlbmRDaGlsZCh0aGlzLmZpbHRlckNvbHVtbkRpdik7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGFwcGx5QmFja2dyb3VuZFN0eWxlKGRhcmtlcjpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLnJlbW92ZUNsYXNzKGRhcmtlciA/ICdzdHJpcGVSb3dCJyA6ICdzdHJpcGVSb3dBJyk7XG4gICAgICAgICAgICAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KS5hZGRDbGFzcyhkYXJrZXIgPyAnc3RyaXBlUm93QScgOiAnc3RyaXBlUm93QicpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSdW5zIHRocm91Z2ggdGhlIHZhbHVlcyBpbiB1bmlxdWVWYWx1ZXNPcmRlciwgYWRkaW5nIGEgY2hlY2tib3ggYW5kIGxhYmVsIGZvciBlYWNoXG4gICAgICAgIC8vIGZpbHRlcmluZyB2YWx1ZSByZXByZXNlbnRlZC4gIElmIHRoZXJlIGFyZSBtb3JlIHRoYW4gMTUgdmFsdWVzLCB0aGUgZmlsdGVyIGdldHNcbiAgICAgICAgLy8gYSBzZWFyY2ggYm94IGFuZCBzY3JvbGxiYXIuXG4gICAgICAgIHBvcHVsYXRlVGFibGUoKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBmQ29sID0gJCh0aGlzLmZpbHRlckNvbHVtbkRpdikuZW1wdHkoKTtcbiAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoZSBzY3JvbGxpbmcgY29udGFpbmVyIGRpdiBpZiB0aGUgc2l6ZSBvZiB0aGUgbGlzdCB3YXJyYW50cyBpdCwgYmVjYXVzZVxuICAgICAgICAgICAgLy8gdGhlIHNjcm9sbGluZyBjb250YWluZXIgZGl2IGRlY2xhcmVzIGEgbGFyZ2UgcGFkZGluZyBtYXJnaW4gZm9yIHRoZSBzY3JvbGwgYmFyLFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgcGFkZGluZyBtYXJnaW4gd291bGQgYmUgYW4gZW1wdHkgd2FzdGUgb2Ygc3BhY2Ugb3RoZXJ3aXNlLlxuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMTUpIHtcbiAgICAgICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLnNlYXJjaEJveEVsZW1lbnQpLmFwcGVuZCh0aGlzLnNjcm9sbFpvbmVEaXYpO1xuICAgICAgICAgICAgICAgIC8vIENoYW5nZSB0aGUgcmVmZXJlbmNlIHNvIHdlJ3JlIGFmZmVjdGluZyB0aGUgaW5uZXJIVE1MIG9mIHRoZSBjb3JyZWN0IGRpdiBsYXRlciBvblxuICAgICAgICAgICAgICAgIGZDb2wgPSAkKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMudGl0bGVFbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMuZmlsdGVyaW5nVGFibGUpO1xuXG4gICAgICAgICAgICB2YXIgdEJvZHkgPSB0aGlzLnRhYmxlQm9keUVsZW1lbnQ7XG4gICAgICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCB0YWJsZSBjb250ZW50c1xuICAgICAgICAgICAgJCh0aGlzLnRhYmxlQm9keUVsZW1lbnQpLmVtcHR5KCk7XG5cbiAgICAgICAgICAgIHRoaXMudGFibGVSb3dzID0ge307XG4gICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgodW5pcXVlSWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjYm94TmFtZSwgY2VsbCwgcCwgcSwgcjtcbiAgICAgICAgICAgICAgICBjYm94TmFtZSA9IFsnZmlsdGVyJywgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCwgJ24nLCB1bmlxdWVJZCwgJ2Nib3gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlUm93c1t1bmlxdWVJZF0gPSA8SFRNTFRhYmxlUm93RWxlbWVudD50aGlzLnRhYmxlQm9keUVsZW1lbnQuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXS5pbnNlcnRDZWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzW3VuaXF1ZUlkXSA9ICQoXCI8aW5wdXQgdHlwZT0nY2hlY2tib3gnPlwiKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICduYW1lJzogY2JveE5hbWUsICdpZCc6IGNib3hOYW1lIH0pXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgY2JveE5hbWUpLnRleHQodGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIERyYWdib3hlcy5pbml0VGFibGUodGhpcy5maWx0ZXJpbmdUYWJsZSk7ICAgIC8vIFRPRE86IERyYWcgc2VsZWN0IGlzIGJyb2tlbiBpbiBTYWZhcmlcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmV0dXJucyB0cnVlIGlmIGFueSBvZiB0aGUgY2hlY2tib3hlcyBzaG93IGEgZGlmZmVyZW50IHN0YXRlIHRoYW4gd2hlbiB0aGlzIGZ1bmN0aW9uIHdhc1xuICAgICAgICAvLyBsYXN0IGNhbGxlZFxuICAgICAgICBhbnlDaGVja2JveGVzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOmJvb2xlYW4gPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2hlY2tib3hTdGF0ZTogVW5pcXVlSURUb1ZhbHVlID0ge30sXG4gICAgICAgICAgICAgICAgdjpzdHJpbmcgPSAkKHRoaXMuc2VhcmNoQm94RWxlbWVudCkudmFsKCk7XG4gICAgICAgICAgICB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAkLmVhY2godGhpcy5jaGVja2JveGVzIHx8IHt9LCAodW5pcXVlSWQ6IG51bWJlciwgY2hlY2tib3g6IEpRdWVyeSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50LCBwcmV2aW91cztcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gKGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnKSAmJiAhY2hlY2tib3gucHJvcCgnZGlzYWJsZWQnKSkgPyAnQycgOiAnVSc7XG4gICAgICAgICAgICAgICAgcHJldmlvdXMgPSB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZVt1bmlxdWVJZF0gfHwgJ04nO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ICE9PSBwcmV2aW91cykgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09ICdDJykgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY3VycmVudENoZWNrYm94U3RhdGVbdW5pcXVlSWRdID0gY3VycmVudDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2ID0gdi50cmltKCk7ICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4gICAgICAgICAgICB2ID0gdi50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgdiA9IHYucmVwbGFjZSgvXFxzXFxzKi8sICcgJyk7IC8vIFJlcGxhY2UgaW50ZXJuYWwgd2hpdGVzcGFjZSB3aXRoIHNpbmdsZSBzcGFjZXNcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICBpZiAodiAhPT0gdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSB2O1xuICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlbid0IGRldGVjdGVkIGFueSBjaGFuZ2Ugc28gZmFyLCB0aGVyZSBpcyBvbmUgbW9yZSBhbmdsZSB0byBjb3ZlcjpcbiAgICAgICAgICAgICAgICAvLyBDaGVja2JveGVzIHRoYXQgdXNlZCB0byBleGlzdCwgYnV0IGhhdmUgc2luY2UgYmVlbiByZW1vdmVkIGZyb20gdGhlIHNldC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGUsIChyb3dJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudENoZWNrYm94U3RhdGVbcm93SWRdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IGN1cnJlbnRDaGVja2JveFN0YXRlO1xuICAgICAgICAgICAgcmV0dXJuIGNoYW5nZWQ7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRha2VzIGEgc2V0IG9mIHJlY29yZCBJRHMsIGFuZCBpZiBhbnkgY2hlY2tib3hlcyBpbiB0aGUgZmlsdGVyJ3MgVUkgYXJlIGNoZWNrZWQsXG4gICAgICAgIC8vIHRoZSBJRCBzZXQgaXMgbmFycm93ZWQgZG93biB0byBvbmx5IHRob3NlIHJlY29yZHMgdGhhdCBjb250YWluIHRoZSBjaGVja2VkIHZhbHVlcy5cbiAgICAgICAgLy8gQ2hlY2tib3hlcyB3aG9zZSB2YWx1ZXMgYXJlIG5vdCByZXByZXNlbnRlZCBhbnl3aGVyZSBpbiB0aGUgZ2l2ZW4gSURzIGFyZSB0ZW1wb3JhcmlseSBkaXNhYmxlZFxuICAgICAgICAvLyBhbmQgc29ydGVkIHRvIHRoZSBib3R0b20gb2YgdGhlIGxpc3QsIHZpc3VhbGx5IGluZGljYXRpbmcgdG8gYSB1c2VyIHRoYXQgdGhvc2UgdmFsdWVzIGFyZSBub3RcbiAgICAgICAgLy8gYXZhaWxhYmxlIGZvciBmdXJ0aGVyIGZpbHRlcmluZy5cbiAgICAgICAgLy8gVGhlIG5hcnJvd2VkIHNldCBvZiBJRHMgaXMgdGhlbiByZXR1cm5lZCwgZm9yIHVzZSBieSB0aGUgbmV4dCBmaWx0ZXIuXG4gICAgICAgIGFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoaWRzOmFueVtdKTphbnkge1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgZmlsdGVyIG9ubHkgY29udGFpbnMgb25lIGl0ZW0sIGl0J3MgcG9pbnRsZXNzIHRvIGFwcGx5IGl0LlxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzRmlsdGVyVXNlZnVsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWRzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgaWRzUG9zdEZpbHRlcmluZzogYW55W107XG5cbiAgICAgICAgICAgIHZhciB1c2VTZWFyY2hCb3g6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgdmFyIHF1ZXJ5U3RycyA9IFtdO1xuXG4gICAgICAgICAgICB2YXIgdiA9IHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbjtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAodi5sZW5ndGggPj0gdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgd29yZHMsIHdlIG1hdGNoIGVhY2ggc2VwYXJhdGVseS5cbiAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBub3QgYXR0ZW1wdCB0byBtYXRjaCBhZ2FpbnN0IGVtcHR5IHN0cmluZ3MsIHNvIHdlIGZpbHRlciB0aG9zZSBvdXQgaWZcbiAgICAgICAgICAgICAgICAgICAgLy8gYW55IHNsaXBwZWQgdGhyb3VnaC5cbiAgICAgICAgICAgICAgICAgICAgcXVlcnlTdHJzID0gdi5zcGxpdCgvXFxzKy8pLmZpbHRlcigob25lKSA9PiB7IHJldHVybiBvbmUubGVuZ3RoID4gMDsgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSB1c2VyIG1pZ2h0IGhhdmUgcGFzdGVkL3R5cGVkIG9ubHkgd2hpdGVzcGFjZSwgc286XG4gICAgICAgICAgICAgICAgICAgIGlmIChxdWVyeVN0cnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXNlU2VhcmNoQm94ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmcgPSB7fTtcblxuICAgICAgICAgICAgdmFyIGluZGV4SXNWaXNpYmxlID0gKGluZGV4KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2g6Ym9vbGVhbiA9IHRydWUsIHRleHQ6c3RyaW5nO1xuICAgICAgICAgICAgICAgIGlmICh1c2VTZWFyY2hCb3gpIHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dCA9IHRoaXMudW5pcXVlVmFsdWVzW2luZGV4XS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICBtYXRjaCA9IHF1ZXJ5U3Rycy5zb21lKCh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGV4dC5sZW5ndGggPj0gdi5sZW5ndGggJiYgdGV4dC5pbmRleE9mKHYpID49IDA7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZ1tpbmRleF0gPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlW2luZGV4XSA9PT0gJ0MnKSB8fCAhdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWRzUG9zdEZpbHRlcmluZyA9IGlkcy5maWx0ZXIoKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBmaWx0ZXJpbmcgZGF0YSBmb3IgdGhpcyBpZCwgdXNlIGl0LlxuICAgICAgICAgICAgICAgIC8vIElmIHdlIGRvbid0LCB0aGUgaWQgcHJvYmFibHkgYmVsb25ncyB0byBzb21lIG90aGVyIG1lYXN1cmVtZW50IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIC8vIHNvIHdlIGlnbm9yZSBpdC5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maWx0ZXJIYXNoW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maWx0ZXJIYXNoW2lkXS5zb21lKGluZGV4SXNWaXNpYmxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciByb3dzVG9BcHBlbmQgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgoY3JJRCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjaGVja2JveDogSlF1ZXJ5ID0gdGhpcy5jaGVja2JveGVzW2NySURdLFxuICAgICAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQgPSB0aGlzLnRhYmxlUm93c1tjcklEXSxcbiAgICAgICAgICAgICAgICAgICAgc2hvdzogYm9vbGVhbiA9ICEhdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZ1tjcklEXTtcbiAgICAgICAgICAgICAgICBjaGVja2JveC5wcm9wKCdkaXNhYmxlZCcsICFzaG93KVxuICAgICAgICAgICAgICAgICQocm93KS50b2dnbGVDbGFzcygnbm9kYXRhJywgIXNob3cpO1xuICAgICAgICAgICAgICAgIGlmIChzaG93KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFibGVCb2R5RWxlbWVudC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBOb3csIChyZSlhcHBlbmQgYWxsIHRoZSByb3dzIHdlIGRpc2FibGVkLCBzbyB0aGV5IGdvIHRvIHRoZSBib3R0b20gb2YgdGhlIHRhYmxlXG4gICAgICAgICAgICByb3dzVG9BcHBlbmQuZm9yRWFjaCgocm93KSA9PiB0aGlzLnRhYmxlQm9keUVsZW1lbnQuYXBwZW5kQ2hpbGQocm93KSk7XG4gICAgICAgICAgICByZXR1cm4gaWRzUG9zdEZpbHRlcmluZztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQ6c3RyaW5nKSB7XG4gICAgICAgICAgICByZXR1cm4gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgIH1cbiAgICAgICAgX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSByZXR1cm4gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBfYXNzYXlJZFRvUHJvdG9jb2woYXNzYXlJZDpzdHJpbmcpOiBQcm90b2NvbFJlY29yZCB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKTtcbiAgICAgICAgICAgIGlmIChhc3NheSkgcmV0dXJuIEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0SWRNYXBUb1ZhbHVlcygpOihpZDpzdHJpbmcpID0+IGFueVtdIHtcbiAgICAgICAgICAgIHJldHVybiAoKSA9PiBbXTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgU3RyYWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdTdHJhaW4nO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdzdCc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIHN0cmFpbiBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuc3RyYWluIHx8IFtdKS5mb3JFYWNoKChzdHJhaW5JZDogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbc3RyYWluSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RyYWluICYmIHN0cmFpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBDYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0NhcmJvbiBTb3VyY2UnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdjcyc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuY2FyYm9uIHx8IFtdKS5mb3JFYWNoKChjYXJib25JZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNyYyA9IEVERERhdGEuQ1NvdXJjZXNbY2FyYm9uSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3JjICYmIHNyYy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnTGFiZWxpbmcnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdsJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBjYXJib24gc291cmNlIGxhYmVsaW5nIGRlc2NyaXB0aW9uXG4gICAgICAgICAgICAgICAgKGxpbmUuY2FyYm9uIHx8IFtdKS5mb3JFYWNoKChjYXJib25JZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNyYyA9IEVERERhdGEuQ1NvdXJjZXNbY2FyYm9uSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3JjICYmIHNyYy5sYWJlbGluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU5hbWVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0xpbmUnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdsbic7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIFByb3RvY29sRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdQcm90b2NvbCc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ3AnO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvdG9jb2w6IFByb3RvY29sUmVjb3JkID0gdGhpcy5fYXNzYXlJZFRvUHJvdG9jb2woYXNzYXlJZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnQXNzYXkgU3VmZml4JztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnYSc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXkubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIG1ldGFEYXRhSUQ6c3RyaW5nO1xuICAgICAgICBwcmU6c3RyaW5nO1xuICAgICAgICBwb3N0OnN0cmluZztcblxuICAgICAgICBjb25zdHJ1Y3RvcihtZXRhRGF0YUlEOnN0cmluZykge1xuICAgICAgICAgICAgdmFyIE1EVCA9IEVERERhdGEuTWV0YURhdGFUeXBlc1ttZXRhRGF0YUlEXTtcbiAgICAgICAgICAgIHRoaXMubWV0YURhdGFJRCA9IG1ldGFEYXRhSUQ7XG4gICAgICAgICAgICB0aGlzLnByZSA9IE1EVC5wcmUgfHwgJyc7XG4gICAgICAgICAgICB0aGlzLnBvc3QgPSBNRFQucG9zdCB8fCAnJztcbiAgICAgICAgICAgIHN1cGVyKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbdGhpcy5tZXRhRGF0YUlEXS5uYW1lO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdtZCcrdGhpcy5tZXRhRGF0YUlEO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBMaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTogYW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fSwgdmFsdWUgPSAnKEVtcHR5KSc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLm1ldGEgJiYgbGluZS5tZXRhW3RoaXMubWV0YURhdGFJRF0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBbIHRoaXMucHJlLCBsaW5lLm1ldGFbdGhpcy5tZXRhRGF0YUlEXSwgdGhpcy5wb3N0IF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBhbnkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fSwgdmFsdWUgPSAnKEVtcHR5KSc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5tZXRhICYmIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSwgdGhpcy5wb3N0IF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdDb21wYXJ0bWVudCc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ2NvbSc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIHZhbHVlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlQ29tcGFydG1lbnRzW21lYXN1cmUuY29tcGFydG1lbnRdIHx8IHt9O1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzogYm9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdNZWFzdXJlbWVudCc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ21tJztcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChtSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgbUlkcy5mb3JFYWNoKChtZWFzdXJlSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICAgICAgdmFyIG1UeXBlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbVR5cGUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1UeXBlICYmIG1UeXBlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOmJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdNZXRhYm9saXRlJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnbWUnO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBtZXRhYm9saXRlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZSA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXRhYm9saXRlICYmIG1ldGFib2xpdGUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBQcm90ZWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOmJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdQcm90ZWluJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAncHInO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIHByb3RlaW46IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3RlaW4gJiYgcHJvdGVpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6Ym9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0dlbmUnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdnbic7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gT3ZlcnJpZGU6IElmIHRoZSBmaWx0ZXIgaGFzIGEgbG9hZCBwZW5kaW5nLCBpdCdzIFwidXNlZnVsXCIsIGkuZS4gZGlzcGxheSBpdC5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgZ2VuZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmUgPSBFREREYXRhLkdlbmVUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAoZ2VuZSAmJiBnZW5lLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGUgcGFnZSBsb2Fkcy5cbiAgICBleHBvcnQgZnVuY3Rpb24gcHJlcGFyZUl0KCkge1xuXG4gICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0ID0gbmV3IFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0KHRoaXMpO1xuXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEgPSBudWxsO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuYXR0YWNobWVudElEcyA9IG51bGw7XG4gICAgICAgIHRoaXMuYXR0YWNobWVudHNCeUlEID0gbnVsbDtcbiAgICAgICAgdGhpcy5wcmV2RGVzY3JpcHRpb25FZGl0RWxlbWVudCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBJRCA9IC0xO1xuICAgICAgICB0aGlzLm1ldGFib2xpY01hcE5hbWUgPSBudWxsO1xuICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA9IC0xO1xuXG4gICAgICAgIHRoaXMuY1NvdXJjZUVudHJpZXMgPSBbXTtcbiAgICAgICAgdGhpcy5tVHlwZUVudHJpZXMgPSBbXTtcblxuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkID0gbnVsbDtcblxuICAgICAgICB0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBudWxsO1xuICAgICAgICB0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkU3BlY3MgPSB7fTtcbiAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZHMgPSB7fTtcblxuICAgICAgICAvLyBwdXQgdGhlIGNsaWNrIGhhbmRsZXIgYXQgdGhlIGRvY3VtZW50IGxldmVsLCB0aGVuIGZpbHRlciB0byBhbnkgbGluayBpbnNpZGUgYSAuZGlzY2xvc2VcbiAgICAgICAgJChkb2N1bWVudCkub24oJ2NsaWNrJywgJy5kaXNjbG9zZSAuZGlzY2xvc2VMaW5rJywgKGUpID0+IHtcbiAgICAgICAgICAgICQoZS50YXJnZXQpLmNsb3Nlc3QoJy5kaXNjbG9zZScpLnRvZ2dsZUNsYXNzKCdkaXNjbG9zZUhpZGUnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICd1cmwnOiAnZWRkZGF0YS8nLFxuICAgICAgICAgICAgJ3R5cGUnOiAnR0VUJyxcbiAgICAgICAgICAgICdlcnJvcic6ICh4aHIsIHN0YXR1cywgZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnTG9hZGluZyBFREREYXRhIGZhaWxlZDogJywgc3RhdHVzLCAnOycsIGVdLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgRURERGF0YSA9ICQuZXh0ZW5kKEVERERhdGEgfHwge30sIGRhdGEpO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJlcGFyZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YW50aWF0ZSBhIHRhYmxlIHNwZWNpZmljYXRpb24gZm9yIHRoZSBMaW5lcyB0YWJsZVxuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMgPSBuZXcgRGF0YUdyaWRTcGVjTGluZXMoKTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YW50aWF0ZSB0aGUgdGFibGUgaXRzZWxmIHdpdGggdGhlIHNwZWNcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWQgPSBuZXcgRGF0YUdyaWQodGhpcy5saW5lc0RhdGFHcmlkU3BlYyk7XG4gICAgICAgICAgICAgICAgLy8gRmluZCBvdXQgd2hpY2ggcHJvdG9jb2xzIGhhdmUgYXNzYXlzIHdpdGggbWVhc3VyZW1lbnRzIC0gZGlzYWJsZWQgb3Igbm9cbiAgICAgICAgICAgICAgICB2YXIgcHJvdG9jb2xzV2l0aE1lYXN1cmVtZW50czphbnkgPSB7fTtcbiAgICAgICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkLCBhc3NheSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICBwcm90b2NvbHNXaXRoTWVhc3VyZW1lbnRzW2Fzc2F5LnBpZF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIEZvciBlYWNoIHByb3RvY29sIHdpdGggbWVhc3VyZW1lbnRzLCBjcmVhdGUgYSBEYXRhR3JpZEFzc2F5cyBvYmplY3QuXG4gICAgICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcGVjO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvdG9jb2xzV2l0aE1lYXN1cmVtZW50c1tpZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRTcGVjc1tpZF0gPSBzcGVjID0gbmV3IERhdGFHcmlkU3BlY0Fzc2F5cyhwcm90b2NvbC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkc1tpZF0gPSBuZXcgRGF0YUdyaWRBc3NheXMoc3BlYyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnZm9ybS5saW5lLWVkaXQnKS5vbignY2hhbmdlJywgJy5saW5lLW1ldGEgPiA6aW5wdXQnLCAoZXYpID0+IHtcbiAgICAgICAgICAgIC8vIHdhdGNoIGZvciBjaGFuZ2VzIHRvIG1ldGFkYXRhIHZhbHVlcywgYW5kIHNlcmlhbGl6ZSB0byB0aGUgbWV0YV9zdG9yZSBmaWVsZFxuICAgICAgICAgICAgdmFyIGZvcm0gPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnZm9ybScpLFxuICAgICAgICAgICAgICAgIG1ldGFJbiA9IGZvcm0uZmluZCgnW25hbWU9bGluZS1tZXRhX3N0b3JlXScpLFxuICAgICAgICAgICAgICAgIG1ldGEgPSBKU09OLnBhcnNlKG1ldGFJbi52YWwoKSB8fCAne30nKTtcbiAgICAgICAgICAgIGZvcm0uZmluZCgnLmxpbmUtbWV0YSA+IDppbnB1dCcpLmVhY2goKGksIGlucHV0KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9ICQoaW5wdXQpLmF0dHIoJ2lkJykubWF0Y2goLy0oXFxkKykkLylbMV07XG4gICAgICAgICAgICAgICAgbWV0YVtrZXldID0gJChpbnB1dCkudmFsKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIG1ldGFJbi52YWwoSlNPTi5zdHJpbmdpZnkobWV0YSkpO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnLmxpbmUtbWV0YS1hZGQnLCAoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgLy8gbWFrZSBtZXRhZGF0YSBBZGQgVmFsdWUgYnV0dG9uIHdvcmsgYW5kIG5vdCBzdWJtaXQgdGhlIGZvcm1cbiAgICAgICAgICAgIHZhciBhZGRyb3cgPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnLmxpbmUtZWRpdC1tZXRhJyksIHR5cGUsIHZhbHVlO1xuICAgICAgICAgICAgdHlwZSA9IGFkZHJvdy5maW5kKCcubGluZS1tZXRhLXR5cGUnKS52YWwoKTtcbiAgICAgICAgICAgIHZhbHVlID0gYWRkcm93LmZpbmQoJy5saW5lLW1ldGEtdmFsdWUnKS52YWwoKTtcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6aW5wdXQnKS52YWwoJycpOyAvLyBjbGVhciBvdXQgaW5wdXRzIHNvIGFub3RoZXIgdmFsdWUgY2FuIGJlIGVudGVyZWRcbiAgICAgICAgICAgIGlmIChFREREYXRhLk1ldGFEYXRhVHlwZXNbdHlwZV0pIHtcbiAgICAgICAgICAgICAgICBpbnNlcnRMaW5lTWV0YWRhdGFSb3coYWRkcm93LCB0eXBlLCB2YWx1ZSkuZmluZCgnOmlucHV0JykudHJpZ2dlcignY2hhbmdlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICcubWV0YS1yZW1vdmUnLCAoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgLy8gcmVtb3ZlIG1ldGFkYXRhIHJvdyBhbmQgaW5zZXJ0IG51bGwgdmFsdWUgZm9yIHRoZSBtZXRhZGF0YSBrZXlcbiAgICAgICAgICAgIHZhciBmb3JtID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJ2Zvcm0nKSxcbiAgICAgICAgICAgICAgICBtZXRhUm93ID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5saW5lLW1ldGEnKSxcbiAgICAgICAgICAgICAgICBtZXRhSW4gPSBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKSxcbiAgICAgICAgICAgICAgICBtZXRhID0gSlNPTi5wYXJzZShtZXRhSW4udmFsKCkgfHwgJ3t9JyksXG4gICAgICAgICAgICAgICAga2V5ID0gbWV0YVJvdy5hdHRyKCdpZCcpLm1hdGNoKC8tKFxcZCspJC8pWzFdO1xuICAgICAgICAgICAgbWV0YVtrZXldID0gbnVsbDtcbiAgICAgICAgICAgIG1ldGFJbi52YWwoSlNPTi5zdHJpbmdpZnkobWV0YSkpO1xuICAgICAgICAgICAgbWV0YVJvdy5yZW1vdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQod2luZG93KS5sb2FkKHByZXBhcmVQZXJtaXNzaW9ucyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcHJlcGFyZVBlcm1pc3Npb25zKCkge1xuICAgICAgICB2YXIgdXNlcjogSlF1ZXJ5LCBncm91cDogSlF1ZXJ5O1xuICAgICAgICAvLyBUT0RPIHRoZSBET00gdHJhdmVyc2luZyBhbmQgZmlsdGVyaW5nIGhlcmUgaXMgdmVyeSBoYWNreSwgZG8gaXQgYmV0dGVyIGxhdGVyXG4gICAgICAgIHVzZXIgPSBFRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlKCQoJyNwZXJtaXNzaW9uX3VzZXJfYm94JykpO1xuICAgICAgICBncm91cCA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUoJCgnI3Blcm1pc3Npb25fZ3JvdXBfYm94JykpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUodXNlciwgJ1VzZXInKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKGdyb3VwLCAnR3JvdXAnKTtcbiAgICAgICAgJCgnZm9ybS5wZXJtaXNzaW9ucycpXG4gICAgICAgICAgICAub24oJ2NoYW5nZScsICc6cmFkaW8nLCAoZXY6SlF1ZXJ5SW5wdXRFdmVudE9iamVjdCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHJhZGlvOiBKUXVlcnkgPSAkKGV2LnRhcmdldCk7XG4gICAgICAgICAgICAgICAgJCgnLnBlcm1pc3Npb25zJykuZmluZCgnOnJhZGlvJykuZWFjaCgoaTogbnVtYmVyLCByOiBFbGVtZW50KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICQocikuY2xvc2VzdCgnc3BhbicpLmZpbmQoJy5hdXRvY29tcCcpLnByb3AoJ2Rpc2FibGVkJywgISQocikucHJvcCgnY2hlY2tlZCcpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAocmFkaW8ucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhZGlvLmNsb3Nlc3QoJ3NwYW4nKS5maW5kKCcuYXV0b2NvbXA6dmlzaWJsZScpLmZvY3VzKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5vbignc3VibWl0JywgKGV2OkpRdWVyeUV2ZW50T2JqZWN0KTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHBlcm06IGFueSA9IHt9LCBrbGFzczogc3RyaW5nLCBhdXRvOiBKUXVlcnk7XG4gICAgICAgICAgICAgICAgYXV0byA9ICQoJ2Zvcm0ucGVybWlzc2lvbnMnKS5maW5kKCdbbmFtZT1jbGFzc106Y2hlY2tlZCcpO1xuICAgICAgICAgICAgICAgIGtsYXNzID0gYXV0by52YWwoKTtcbiAgICAgICAgICAgICAgICBwZXJtLnR5cGUgPSAkKCdmb3JtLnBlcm1pc3Npb25zJykuZmluZCgnW25hbWU9dHlwZV0nKS52YWwoKTtcbiAgICAgICAgICAgICAgICBwZXJtW2tsYXNzLnRvTG93ZXJDYXNlKCldID0geyAnaWQnOiBhdXRvLmNsb3Nlc3QoJ3NwYW4nKS5maW5kKCdpbnB1dDpoaWRkZW4nKS52YWwoKSB9O1xuICAgICAgICAgICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAgICAgICAgICd1cmwnOiAncGVybWlzc2lvbnMvJyxcbiAgICAgICAgICAgICAgICAgICAgJ3R5cGUnOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBKU09OLnN0cmluZ2lmeShbcGVybV0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2NzcmZtaWRkbGV3YXJldG9rZW4nOiAkKCdmb3JtLnBlcm1pc3Npb25zJykuZmluZCgnW25hbWU9Y3NyZm1pZGRsZXdhcmV0b2tlbl0nKS52YWwoKVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAnc3VjY2Vzcyc6ICgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnU2V0IHBlcm1pc3Npb246ICcsIEpTT04uc3RyaW5naWZ5KHBlcm0pXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQoJ1NldCBQZXJtaXNzaW9uJykuYWRkQ2xhc3MoJ3N1Y2Nlc3MnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCdmb3JtLnBlcm1pc3Npb25zJykpLmRlbGF5KDUwMDApLmZhZGVPdXQoMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICdlcnJvcic6ICh4aHIsIHN0YXR1cywgZXJyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ1NldHRpbmcgcGVybWlzc2lvbiBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlcnJdLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dCgnU2VydmVyIEVycm9yOiAnICsgZXJyKS5hZGRDbGFzcygnYmFkJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oJCgnZm9ybS5wZXJtaXNzaW9ucycpKS5kZWxheSg1MDAwKS5mYWRlT3V0KDIwMDApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maW5kKCc6cmFkaW8nKS50cmlnZ2VyKCdjaGFuZ2UnKS5lbmQoKVxuICAgICAgICAgICAgLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcm9jZXNzQ2FyYm9uQmFsYW5jZURhdGEoKSB7XG4gICAgICAgIC8vIFByZXBhcmUgdGhlIGNhcmJvbiBiYWxhbmNlIGdyYXBoXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEgPSBuZXcgQ2FyYm9uQmFsYW5jZS5EaXNwbGF5KCk7XG4gICAgICAgIHZhciBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gZmFsc2U7XG4gICAgICAgIGlmICggdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gPiAtMSApIHtcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY2FsY3VsYXRlQ2FyYm9uQmFsYW5jZXModGhpcy5tZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICAgICAgLy8gSGlnaGxpZ2h0IHRoZSBcIlNob3cgQ2FyYm9uIEJhbGFuY2VcIiBjaGVja2JveCBpbiByZWQgaWYgdGhlcmUgYXJlIENCIGlzc3Vlcy5cbiAgICAgICAgICAgIGlmICh0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmdldE51bWJlck9mSW1iYWxhbmNlcygpID4gMCkge1xuICAgICAgICAgICAgICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGlnaGxpZ2h0IHRoZSBjYXJib24gYmFsYW5jZSBpbiByZWQgdG8gaW5kaWNhdGUgdGhhdCB3ZSBjYW4ndCBjYWxjdWxhdGVcbiAgICAgICAgICAgIC8vIGNhcmJvbiBiYWxhbmNlcyB5ZXQuIFdoZW4gdGhleSBjbGljayB0aGUgY2hlY2tib3gsIHdlJ2xsIGdldCB0aGVtIHRvXG4gICAgICAgICAgICAvLyBzcGVjaWZ5IHdoaWNoIFNCTUwgZmlsZSB0byB1c2UgZm9yIGJpb21hc3MuXG4gICAgICAgICAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQoaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBmaWx0ZXJUYWJsZUtleURvd24oY29udGV4dCwgZSkge1xuICAgICAgICBzd2l0Y2ggKGUua2V5Q29kZSkge1xuICAgICAgICAgICAgY2FzZSAzODogLy8gdXBcbiAgICAgICAgICAgIGNhc2UgNDA6IC8vIGRvd25cbiAgICAgICAgICAgIGNhc2UgOTogIC8vIHRhYlxuICAgICAgICAgICAgY2FzZSAxMzogLy8gcmV0dXJuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgICAgICAgICBpZiAoZS5rZXlDb2RlID4gOCAmJiBlLmtleUNvZGUgPCAzMikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnRleHQucXVldWVNYWluR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIGJ5IERhdGFHcmlkIGFmdGVyIHRoZSBMaW5lcyB0YWJsZSBpcyByZW5kZXJlZFxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCkge1xuICAgICAgICB2YXIgY3NJRHM7XG4gICAgICAgIC8vIFByZXBhcmUgdGhlIG1haW4gZGF0YSBvdmVydmlldyBncmFwaCBhdCB0aGUgdG9wIG9mIHRoZSBwYWdlXG4gICAgICAgIGlmICh0aGlzLm1haW5HcmFwaE9iamVjdCA9PT0gbnVsbCAmJiAkKCcjbWFpbmdyYXBoJykuc2l6ZSgpID09PSAxKSB7XG4gICAgICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdCA9IE9iamVjdC5jcmVhdGUoU3R1ZHlER3JhcGhpbmcpO1xuICAgICAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuU2V0dXAoJ21haW5ncmFwaCcpO1xuXG4gICAgICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0Lm1haW5HcmFwaE9iamVjdCA9IHRoaXMubWFpbkdyYXBoT2JqZWN0O1xuICAgICAgICB9XG5cbiAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykub24oJ21vdXNlb3ZlciBtb3VzZWRvd24gbW91c2V1cCcsICgpID0+IHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UoKSlcbiAgICAgICAgICAgICAgICAub24oJ2tleWRvd24nLCAoZSkgPT4gZmlsdGVyVGFibGVLZXlEb3duKHRoaXMsIGUpKTtcbiAgICAgICAgJCgnI3NlcGFyYXRlQXhlc0NoZWNrYm94Jykub24oJ2NoYW5nZScsICgpID0+IHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UodHJ1ZSkpO1xuXG4gICAgICAgIC8vIEVuYWJsZSBlZGl0IGxpbmVzIGJ1dHRvblxuICAgICAgICAkKCcjZWRpdExpbmVCdXR0b24nKS5vbignY2xpY2snLCAoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICB2YXIgYnV0dG9uID0gJChldi50YXJnZXQpLCBkYXRhID0gYnV0dG9uLmRhdGEoKSwgZm9ybSA9IGNsZWFyTGluZUZvcm0oKSxcbiAgICAgICAgICAgICAgICBhbGxNZXRhID0ge30sIG1ldGFSb3c7XG4gICAgICAgICAgICBpZiAoZGF0YS5pZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgZmlsbExpbmVGb3JtKGZvcm0sIEVERERhdGEuTGluZXNbZGF0YS5pZHNbMF1dKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29tcHV0ZSB1c2VkIG1ldGFkYXRhIGZpZWxkcyBvbiBhbGwgZGF0YS5pZHMsIGluc2VydCBtZXRhZGF0YSByb3dzP1xuICAgICAgICAgICAgICAgIGRhdGEuaWRzLm1hcCgoaWQ6bnVtYmVyKSA9PiBFREREYXRhLkxpbmVzW2lkXSB8fCB7fSkuZm9yRWFjaCgobGluZTpMaW5lUmVjb3JkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICQuZXh0ZW5kKGFsbE1ldGEsIGxpbmUubWV0YSB8fCB7fSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgbWV0YVJvdyA9IGZvcm0uZmluZCgnLmxpbmUtZWRpdC1tZXRhJyk7XG4gICAgICAgICAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgICAgICAgICAkLmVhY2goYWxsTWV0YSwgKGtleSkgPT4gaW5zZXJ0TGluZU1ldGFkYXRhUm93KG1ldGFSb3csIGtleSwgJycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHVwZGF0ZVVJTGluZUZvcm0oZm9ybSwgZGF0YS5jb3VudCA+IDEpO1xuICAgICAgICAgICAgc2Nyb2xsVG9Gb3JtKGZvcm0pO1xuICAgICAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWlkc10nKS52YWwoZGF0YS5pZHMuam9pbignLCcpKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSGFja3kgYnV0dG9uIGZvciBjaGFuZ2luZyB0aGUgbWV0YWJvbGljIG1hcFxuICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuY2xpY2soICgpID0+IHRoaXMub25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSgpICk7XG5cbiAgICAgICAgcmVxdWVzdEFsbE1ldGFib2xpdGVEYXRhKHRoaXMpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcmVxdWVzdEFsbE1ldGFib2xpdGVEYXRhKGNvbnRleHQpIHtcbiAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgIHVybDogJ21lYXN1cmVtZW50cy8nICsgaWQgKyAnLycsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgcHJvdG9jb2wubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiAoZGF0YSkgPT4geyBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKGNvbnRleHQsIGRhdGEsIHByb3RvY29sKTsgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiByZXF1ZXN0QXNzYXlEYXRhKGFzc2F5KSB7XG4gICAgICAgIHZhciBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICB1cmw6IFsnbWVhc3VyZW1lbnRzJywgYXNzYXkucGlkLCBhc3NheS5pZCwgJyddLmpvaW4oJy8nKSxcbiAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgIGVycm9yOiAoeGhyLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGZldGNoIG1lYXN1cmVtZW50IGRhdGEgb24gJyArIGFzc2F5Lm5hbWUgKyAnIScpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3VjY2VzczogKGRhdGEpID0+IHsgcHJvY2Vzc01lYXN1cmVtZW50RGF0YSh0aGlzLCBkYXRhLCBwcm90b2NvbCk7IH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKGNvbnRleHQsIGRhdGEsIHByb3RvY29sKSB7XG4gICAgICAgIHZhciBhc3NheVNlZW4gPSB7fSxcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheSA9IHt9LFxuICAgICAgICAgICAgY291bnRfdG90YWw6bnVtYmVyID0gMCxcbiAgICAgICAgICAgIGNvdW50X3JlYzpudW1iZXIgPSAwO1xuICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fTtcbiAgICAgICAgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzID0gJC5leHRlbmQoRURERGF0YS5NZWFzdXJlbWVudFR5cGVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcbiAgICAgICAgLy8gYXR0YWNoIG1lYXN1cmVtZW50IGNvdW50cyB0byBlYWNoIGFzc2F5XG4gICAgICAgICQuZWFjaChkYXRhLnRvdGFsX21lYXN1cmVzLCAoYXNzYXlJZDpzdHJpbmcsIGNvdW50Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgIGlmIChhc3NheSkge1xuICAgICAgICAgICAgICAgIGFzc2F5LmNvdW50ID0gY291bnQ7XG4gICAgICAgICAgICAgICAgY291bnRfdG90YWwgKz0gY291bnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBsb29wIG92ZXIgYWxsIGRvd25sb2FkZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICQuZWFjaChkYXRhLm1lYXN1cmVzIHx8IHt9LCAoaW5kZXgsIG1lYXN1cmVtZW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgKytjb3VudF9yZWM7XG4gICAgICAgICAgICBpZiAoIWFzc2F5IHx8ICFhc3NheS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAvLyBhdHRhY2ggdmFsdWVzXG4gICAgICAgICAgICAkLmV4dGVuZChtZWFzdXJlbWVudCwgeyAndmFsdWVzJzogZGF0YS5kYXRhW21lYXN1cmVtZW50LmlkXSB8fCBbXSB9KVxuICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudC5pZF0gPSBtZWFzdXJlbWVudDtcbiAgICAgICAgICAgIC8vIHRyYWNrIHdoaWNoIGFzc2F5cyByZWNlaXZlZCB1cGRhdGVkIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgYXNzYXlTZWVuW2Fzc2F5LmlkXSA9IHRydWU7XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXSA9IHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdIHx8IHt9O1xuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF1bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGhhbmRsZSBtZWFzdXJlbWVudCBkYXRhIGJhc2VkIG9uIHR5cGVcbiAgICAgICAgICAgIG10eXBlID0gZGF0YS50eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgIChhc3NheS5tZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIGlmIChtdHlwZS5mYW1pbHkgPT09ICdtJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBtZXRhYm9saXRlXG4gICAgICAgICAgICAgICAgKGFzc2F5Lm1ldGFib2xpdGVzID0gYXNzYXkubWV0YWJvbGl0ZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgKGFzc2F5LnByb3RlaW5zID0gYXNzYXkucHJvdGVpbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgIChhc3NheS50cmFuc2NyaXB0aW9ucyA9IGFzc2F5LnRyYW5zY3JpcHRpb25zIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgKGFzc2F5LmdlbmVyYWwgPSBhc3NheS5nZW5lcmFsIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGV4dC5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5wcm9jZXNzSW5jb21pbmdNZWFzdXJlbWVudFJlY29yZHMoZGF0YS5tZWFzdXJlcyB8fCB7fSwgZGF0YS50eXBlcyk7XG5cbiAgICAgICAgaWYgKGNvdW50X3JlYyA8IGNvdW50X3RvdGFsKSB7XG4gICAgICAgICAgICAvLyBUT0RPIG5vdCBhbGwgbWVhc3VyZW1lbnRzIGRvd25sb2FkZWQ7IGRpc3BsYXkgYSBtZXNzYWdlIGluZGljYXRpbmcgdGhpc1xuICAgICAgICAgICAgLy8gZXhwbGFpbiBkb3dubG9hZGluZyBpbmRpdmlkdWFsIGFzc2F5IG1lYXN1cmVtZW50cyB0b29cbiAgICAgICAgfVxuICAgICAgICAvLyBpbnZhbGlkYXRlIGFzc2F5cyBvbiBhbGwgRGF0YUdyaWRzOyByZWRyYXdzIHRoZSBhZmZlY3RlZCByb3dzXG4gICAgICAgICQuZWFjaChjb250ZXh0LmFzc2F5c0RhdGFHcmlkcywgKHByb3RvY29sSWQsIGRhdGFHcmlkKSA9PiB7XG4gICAgICAgICAgICBkYXRhR3JpZC5pbnZhbGlkYXRlQXNzYXlSZWNvcmRzKE9iamVjdC5rZXlzKHByb3RvY29sVG9Bc3NheVtwcm90b2NvbElkXSB8fCB7fSkpO1xuICAgICAgICB9KTtcbiAgICAgICAgY29udGV4dC5saW5lc0RhdGFHcmlkU3BlYy5lbmFibGVDYXJib25CYWxhbmNlV2lkZ2V0KHRydWUpO1xuICAgICAgICBjb250ZXh0LnByb2Nlc3NDYXJib25CYWxhbmNlRGF0YSgpO1xuICAgICAgICBjb250ZXh0LnF1ZXVlTWFpbkdyYXBoUmVtYWtlKCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2soc3BlYzpEYXRhR3JpZFNwZWNMaW5lcyxcbiAgICAgICAgICAgIGRhdGFHcmlkT2JqOkRhdGFHcmlkKSB7XG4gICAgICAgIFN0dWR5RC5yZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpO1xuICAgIH1cblxuXG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgc2hvd3MgdGhlIGFjdGlvbnMgcGFuZWwuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlTGluZXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCAodGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGxpbmVzQWN0aW9uUGFuZWxTaG93KHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gbGluZXNBY3Rpb25QYW5lbFNob3coY29udGV4dCkge1xuICAgICAgICAvLyBGaWd1cmUgb3V0IGhvdyBtYW55IGxpbmVzIGFyZSBzZWxlY3RlZC5cbiAgICAgICAgdmFyIGNoZWNrZWRCb3hlcyA9IFtdLCBjaGVja2VkTGVuLCBsaW5lc0FjdGlvblBhbmVsO1xuICAgICAgICBpZiAoY29udGV4dC5saW5lc0RhdGFHcmlkKSB7XG4gICAgICAgICAgICBjaGVja2VkQm94ZXMgPSBjb250ZXh0LmxpbmVzRGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgY2hlY2tlZExlbiA9IGNoZWNrZWRCb3hlcy5sZW5ndGg7XG4gICAgICAgIGxpbmVzQWN0aW9uUGFuZWwgPSAkKCcjbGluZXNBY3Rpb25QYW5lbCcpLnRvZ2dsZUNsYXNzKCdvZmYnLCAhY2hlY2tlZExlbik7XG4gICAgICAgICQoJyNsaW5lc1NlbGVjdGVkQ2VsbCcpLmVtcHR5KCkudGV4dChjaGVja2VkTGVuICsgJyBzZWxlY3RlZCcpO1xuICAgICAgICAvLyBlbmFibGUgc2luZ3VsYXIvcGx1cmFsIGNoYW5nZXNcbiAgICAgICAgJCgnI2Nsb25lTGluZUJ1dHRvbicpLnRleHQoJ0Nsb25lIExpbmUnICsgKGNoZWNrZWRMZW4gPiAxID8gJ3MnIDogJycpKTtcbiAgICAgICAgJCgnI2VkaXRMaW5lQnV0dG9uJykudGV4dCgnRWRpdCBMaW5lJyArIChjaGVja2VkTGVuID4gMSA/ICdzJyA6ICcnKSkuZGF0YSh7XG4gICAgICAgICAgICAnY291bnQnOiBjaGVja2VkTGVuLFxuICAgICAgICAgICAgJ2lkcyc6IGNoZWNrZWRCb3hlcy5tYXAoKGJveDpIVE1MSW5wdXRFbGVtZW50KSA9PiBib3gudmFsdWUpXG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjZ3JvdXBMaW5lQnV0dG9uJykudG9nZ2xlQ2xhc3MoJ29mZicsIGNoZWNrZWRMZW4gPCAyKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpIHtcbiAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgICAgIC8vIFRoaXMgd2F5IHdlJ3JlIG5vdCBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuXG4gICAgICAgIC8vIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgICAgICBpZiAodGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGFzc2F5c0FjdGlvblBhbmVsU2hvdyh0aGlzKSwgMTUwKTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGFzc2F5c0FjdGlvblBhbmVsU2hvdyhjb250ZXh0KSB7XG4gICAgICAgIHZhciBjaGVja2VkQm94ZXMgPSBbXSwgY2hlY2tlZEFzc2F5cywgY2hlY2tlZE1lYXN1cmUsIHBhbmVsLCBpbmZvYm94O1xuICAgICAgICBwYW5lbCA9ICQoJyNhc3NheXNBY3Rpb25QYW5lbCcpO1xuICAgICAgICBpZiAoIXBhbmVsLnNpemUoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgYXNzYXlzL2NoZWNrYm94ZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICAkLmVhY2goY29udGV4dC5hc3NheXNEYXRhR3JpZHMsIChwSUQsIGRhdGFHcmlkKSA9PiB7XG4gICAgICAgICAgICBjaGVja2VkQm94ZXMgPSBjaGVja2VkQm94ZXMuY29uY2F0KGRhdGFHcmlkLmdldFNlbGVjdGVkQ2hlY2tib3hFbGVtZW50cygpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNoZWNrZWRBc3NheXMgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCdbaWRePWFzc2F5XScpLnNpemUoKTtcbiAgICAgICAgY2hlY2tlZE1lYXN1cmUgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCc6bm90KFtpZF49YXNzYXldKScpLnNpemUoKTtcbiAgICAgICAgcGFuZWwudG9nZ2xlQ2xhc3MoJ29mZicsICFjaGVja2VkQXNzYXlzICYmICFjaGVja2VkTWVhc3VyZSk7XG4gICAgICAgIGlmIChjaGVja2VkQXNzYXlzIHx8IGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICBpbmZvYm94ID0gJCgnI2Fzc2F5c1NlbGVjdGVkQ2VsbCcpLmVtcHR5KCk7XG4gICAgICAgICAgICBpZiAoY2hlY2tlZEFzc2F5cykge1xuICAgICAgICAgICAgICAgICQoXCI8cD5cIikuYXBwZW5kVG8oaW5mb2JveCkudGV4dCgoY2hlY2tlZEFzc2F5cyA+IDEpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIChjaGVja2VkQXNzYXlzICsgXCIgQXNzYXlzIHNlbGVjdGVkXCIpIDogXCIxIEFzc2F5IHNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICAgICAgJChcIjxwPlwiKS5hcHBlbmRUbyhpbmZvYm94KS50ZXh0KChjaGVja2VkTWVhc3VyZSA+IDEpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIChjaGVja2VkTWVhc3VyZSArIFwiIE1lYXN1cmVtZW50cyBzZWxlY3RlZFwiKSA6IFwiMSBNZWFzdXJlbWVudCBzZWxlY3RlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyBhIGdyYXBoLiBUaGlzIHdheSB3ZSdyZSBub3RcbiAgICAvLyBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZU1haW5HcmFwaFJlbWFrZShmb3JjZT86Ym9vbGVhbikge1xuICAgICAgICBpZiAodGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KCgpID0+IHJlbWFrZU1haW5HcmFwaEFyZWEodGhpcywgZm9yY2UpLCAyMDApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcmVtYWtlTWFpbkdyYXBoQXJlYShjb250ZXh0OmFueSwgZm9yY2U/OmJvb2xlYW4pIHtcbiAgICAgICAgdmFyIHByZXZpb3VzSURTZXQ6YW55W10sIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHM6YW55W10sXG4gICAgICAgICAgICBkYXRhUG9pbnRzRGlzcGxheWVkID0gMCxcbiAgICAgICAgICAgIGRhdGFQb2ludHNUb3RhbCA9IDAsXG4gICAgICAgICAgICBzZXBhcmF0ZUF4ZXMgPSAkKCcjc2VwYXJhdGVBeGVzQ2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJyksXG4gICAgICAgICAgICAvLyBGSVhNRSBhc3N1bWVzICh4MCwgeTApIHBvaW50c1xuICAgICAgICAgICAgY29udmVydCA9IChkKSA9PiB7IHJldHVybiBbWyBkWzBdWzBdLCBkWzFdWzBdIF1dOyB9LFxuICAgICAgICAgICAgY29tcGFyZSA9IChhLCBiKSA9PiB7IHJldHVybiBhWzBdIC0gYlswXTsgfTtcbiAgICAgICAgY29udGV4dC5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCA9IDA7XG4gICAgICAgIGlmICghY29udGV4dC5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5jaGVja1JlZHJhd1JlcXVpcmVkKGZvcmNlKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIFN0YXJ0IG91dCB3aXRoIGEgYmxhbmsgZ3JhcGguICBXZSB3aWxsIHJlLWFkZCBhbGwgdGhlIHJlbGV2YW50IHNldHMuXG4gICAgICAgIGNvbnRleHQubWFpbkdyYXBoT2JqZWN0LmNsZWFyQWxsU2V0cygpO1xuICAgICAgICBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzID0gY29udGV4dC5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk7XG5cbiAgICAgICAgJC5lYWNoKHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMsIChpLCBtZWFzdXJlbWVudElkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElkXSxcbiAgICAgICAgICAgICAgICBtdHlwZTpNZWFzdXJlbWVudFR5cGVSZWNvcmQgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSxcbiAgICAgICAgICAgICAgICBwb2ludHMgPSAobWVhc3VyZS52YWx1ZXMgPyBtZWFzdXJlLnZhbHVlcy5sZW5ndGggOiAwKSxcbiAgICAgICAgICAgICAgICBhc3NheSwgbGluZSwgcHJvdG9jb2wsIG5ld1NldDtcbiAgICAgICAgICAgIGRhdGFQb2ludHNUb3RhbCArPSBwb2ludHM7XG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50c0Rpc3BsYXllZCA+IDE1MDAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoZSByZXN0IGlmIHdlJ3ZlIGhpdCBvdXIgbGltaXRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRhdGFQb2ludHNEaXNwbGF5ZWQgKz0gcG9pbnRzO1xuICAgICAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlLmFzc2F5XSB8fCB7fTtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBuZXdTZXQgPSB7XG4gICAgICAgICAgICAgICAgJ2xhYmVsJzogJ2R0JyArIG1lYXN1cmVtZW50SWQsXG4gICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50bmFtZSc6IFV0bC5FREQucmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9OYW1lKG1lYXN1cmUpLFxuICAgICAgICAgICAgICAgICduYW1lJzogW2xpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpLFxuICAgICAgICAgICAgICAgICd1bml0cyc6IFV0bC5FREQucmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9Vbml0cyhtZWFzdXJlKSxcbiAgICAgICAgICAgICAgICAnZGF0YSc6ICQubWFwKG1lYXN1cmUudmFsdWVzLCBjb252ZXJ0KS5zb3J0KGNvbXBhcmUpXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGxpbmUuY29udHJvbCkgbmV3U2V0LmlzY29udHJvbCA9IDE7XG4gICAgICAgICAgICBpZiAoc2VwYXJhdGVBeGVzKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIG1lYXN1cmVtZW50IGlzIGEgbWV0YWJvbGl0ZSwgY2hvb3NlIHRoZSBheGlzIGJ5IHR5cGUuIElmIGl0J3MgYW55XG4gICAgICAgICAgICAgICAgLy8gb3RoZXIgc3VidHlwZSwgY2hvb3NlIHRoZSBheGlzIGJhc2VkIG9uIHRoYXQgc3VidHlwZSwgd2l0aCBhbiBvZmZzZXQgdG8gYXZvaWRcbiAgICAgICAgICAgICAgICAvLyBjb2xsaWRpbmcgd2l0aCB0aGUgbWV0YWJvbGl0ZSBheGVzLlxuICAgICAgICAgICAgICAgIGlmIChtdHlwZS5mYW1pbHkgPT09ICdtJykge1xuICAgICAgICAgICAgICAgICAgICBuZXdTZXQueWF4aXNCeU1lYXN1cmVtZW50VHlwZUlEID0gbXR5cGUuaWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3U2V0LnlheGlzQnlNZWFzdXJlbWVudFR5cGVJRCA9IG10eXBlLmZhbWlseTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250ZXh0Lm1haW5HcmFwaE9iamVjdC5hZGROZXdTZXQobmV3U2V0KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc3BsYXlUZXh0ID0gZGF0YVBvaW50c0Rpc3BsYXllZCArIFwiIHBvaW50cyBkaXNwbGF5ZWRcIjtcbiAgICAgICAgaWYgKGRhdGFQb2ludHNEaXNwbGF5ZWQgIT0gZGF0YVBvaW50c1RvdGFsKSB7XG4gICAgICAgICAgICBkaXNwbGF5VGV4dCArPSBcIiAob3V0IG9mIFwiICsgZGF0YVBvaW50c1RvdGFsICsgXCIpXCI7XG4gICAgICAgIH1cbiAgICAgICAgJCgnI3BvaW50c0Rpc3BsYXllZFNwYW4nKS5lbXB0eSgpLnRleHQoZGlzcGxheVRleHQpO1xuXG4gICAgICAgIGNvbnRleHQubWFpbkdyYXBoT2JqZWN0LmRyYXdTZXRzKCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBjbGVhckFzc2F5Rm9ybSgpOkpRdWVyeSB7XG4gICAgICAgIHZhciBmb3JtOkpRdWVyeSA9ICQoJyNpZF9hc3NheS1hc3NheV9pZCcpLmNsb3Nlc3QoJy5kaXNjbG9zZScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1hc3NheS1dJykudmFsKCcnKS5lbmQoKS5maW5kKCcuY2FuY2VsLWxpbmsnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIHJldHVybiBmb3JtO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsZWFyTGluZUZvcm0oKSB7XG4gICAgICAgIHZhciBmb3JtID0gJCgnI2lkX2xpbmUtaWRzJykuY2xvc2VzdCgnLmRpc2Nsb3NlJyk7XG4gICAgICAgIGZvcm0uZmluZCgnLmxpbmUtbWV0YScpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJzppbnB1dCcpLmZpbHRlcignW25hbWVePWxpbmUtXScpLnZhbCgnJyk7XG4gICAgICAgIGZvcm0uZmluZCgnLmVycm9ybGlzdCcpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5jYW5jZWwtbGluaycpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5idWxrJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICBmb3JtLm9mZignY2hhbmdlLmJ1bGsnKTtcbiAgICAgICAgcmV0dXJuIGZvcm07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBFREREYXRhLlVzZXJzW3JlY29yZC5leHBlcmltZW50ZXJdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWFzc2F5X2lkXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LW5hbWVdJykudmFsKHJlY29yZC5uYW1lKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1wcm90b2NvbF0nKS52YWwocmVjb3JkLnBpZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzBdJykudmFsKHVzZXIgJiYgdXNlci51aWQgPyB1c2VyLnVpZCA6ICctLScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaWxsTGluZUZvcm0oZm9ybSwgcmVjb3JkKSB7XG4gICAgICAgIHZhciBtZXRhUm93LCBleHBlcmltZW50ZXIsIGNvbnRhY3Q7XG4gICAgICAgIGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmV4cGVyaW1lbnRlcl07XG4gICAgICAgIGNvbnRhY3QgPSBFREREYXRhLlVzZXJzW3JlY29yZC5jb250YWN0LnVzZXJfaWRdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtaWRzXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbmFtZV0nKS52YWwocmVjb3JkLm5hbWUpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtZGVzY3JpcHRpb25dJykudmFsKHJlY29yZC5kZXNjcmlwdGlvbik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250cm9sXScpLnByb3AoJ2NoZWNrZWQnLCByZWNvcmQuY29udHJvbCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250YWN0XzBdJykudmFsKHJlY29yZC5jb250YWN0LnRleHQgfHwgKGNvbnRhY3QgJiYgY29udGFjdC51aWQgPyBjb250YWN0LnVpZCA6ICctLScpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRhY3RfMV0nKS52YWwocmVjb3JkLmNvbnRhY3QudXNlcl9pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1leHBlcmltZW50ZXJfMF0nKS52YWwoZXhwZXJpbWVudGVyICYmIGV4cGVyaW1lbnRlci51aWQgPyBleHBlcmltZW50ZXIudWlkIDogJy0tJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1leHBlcmltZW50ZXJfMV0nKS52YWwocmVjb3JkLmV4cGVyaW1lbnRlcik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jYXJib25fc291cmNlXzBdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5jYXJib24ubWFwKCh2KSA9PiAoRURERGF0YS5DU291cmNlc1t2XSB8fCA8Q2FyYm9uU291cmNlUmVjb3JkPnt9KS5uYW1lIHx8ICctLScpLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jYXJib25fc291cmNlXzFdJykudmFsKHJlY29yZC5jYXJib24uam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMF0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLnN0cmFpbi5tYXAoKHYpID0+IChFREREYXRhLlN0cmFpbnNbdl0gfHwgPFN0cmFpblJlY29yZD57fSkubmFtZSB8fCAnLS0nKS5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18xXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuc3RyYWluLm1hcCgodikgPT4gKEVERERhdGEuU3RyYWluc1t2XSB8fCA8U3RyYWluUmVjb3JkPnt9KS5yZWdpc3RyeV9pZCB8fCAnJykuam9pbignLCcpKTtcbiAgICAgICAgaWYgKHJlY29yZC5zdHJhaW4ubGVuZ3RoICYmIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzFdJykudmFsKCkgPT09ICcnKSB7XG4gICAgICAgICAgICAkKCc8bGk+JykudGV4dCgnU3RyYWluIGRvZXMgbm90IGhhdmUgYSBsaW5rZWQgSUNFIGVudHJ5ISAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1NhdmluZyB0aGUgbGluZSB3aXRob3V0IGxpbmtpbmcgdG8gSUNFIHdpbGwgcmVtb3ZlIHRoZSBzdHJhaW4uJylcbiAgICAgICAgICAgICAgICAud3JhcCgnPHVsPicpLnBhcmVudCgpLmFkZENsYXNzKCdlcnJvcmxpc3QnKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18wXScpLnBhcmVudCgpKTtcbiAgICAgICAgfVxuICAgICAgICBtZXRhUm93ID0gZm9ybS5maW5kKCcubGluZS1lZGl0LW1ldGEnKTtcbiAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgJC5lYWNoKHJlY29yZC5tZXRhLCAoa2V5LCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KG1ldGFSb3csIGtleSwgdmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gc3RvcmUgb3JpZ2luYWwgbWV0YWRhdGEgaW4gaW5pdGlhbC0gZmllbGRcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJykudmFsKEpTT04uc3RyaW5naWZ5KHJlY29yZC5tZXRhKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9aW5pdGlhbC1saW5lLW1ldGFfc3RvcmVdJykudmFsKEpTT04uc3RyaW5naWZ5KHJlY29yZC5tZXRhKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2Nyb2xsVG9Gb3JtKGZvcm0pIHtcbiAgICAgICAgLy8gbWFrZSBzdXJlIGZvcm0gaXMgZGlzY2xvc2VkXG4gICAgICAgIHZhciB0b3AgPSBmb3JtLnRvZ2dsZUNsYXNzKCdkaXNjbG9zZUhpZGUnLCBmYWxzZSkub2Zmc2V0KCkudG9wO1xuICAgICAgICAkKCdodG1sJykuYW5pbWF0ZSh7ICdzY3JvbGxUb3AnOiB0b3AgfSwgJ3Nsb3cnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVVSUFzc2F5Rm9ybShmb3JtKSB7XG4gICAgICAgIHZhciB0aXRsZSwgYnV0dG9uO1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGRpc2Nsb3NlIHRpdGxlIHRvIHJlYWQgRWRpdFxuICAgICAgICB0aXRsZSA9IGZvcm0uZmluZCgnLmRpc2Nsb3NlTGluayA+IGEnKS50ZXh0KCdFZGl0IEFzc2F5Jyk7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYnV0dG9uIHRvIHJlYWQgRWRpdFxuICAgICAgICBidXR0b24gPSBmb3JtLmZpbmQoJ1tuYW1lPWFjdGlvbl1bdmFsdWU9YXNzYXldJykudGV4dCgnRWRpdCBBc3NheScpO1xuICAgICAgICAvLyBBZGQgbGluayB0byByZXZlcnQgYmFjayB0byAnQWRkIExpbmUnIGZvcm1cbiAgICAgICAgJCgnPGEgaHJlZj1cIiNcIj5DYW5jZWw8L2E+JykuYWRkQ2xhc3MoJ2NhbmNlbC1saW5rJykub24oJ2NsaWNrJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBjbGVhckFzc2F5Rm9ybSgpO1xuICAgICAgICAgICAgdGl0bGUudGV4dCgnQWRkIEFzc2F5cyBUbyBTZWxlY3RlZCBMaW5lcycpO1xuICAgICAgICAgICAgYnV0dG9uLnRleHQoJ0FkZCBBc3NheScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5pbnNlcnRBZnRlcihidXR0b24pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZVVJTGluZUZvcm0oZm9ybSwgcGx1cmFsPykge1xuICAgICAgICB2YXIgdGl0bGUsIGJ1dHRvbiwgdGV4dCA9ICdFZGl0IExpbmUnICsgKHBsdXJhbCA/ICdzJyA6ICcnKTtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBkaXNjbG9zZSB0aXRsZSB0byByZWFkICdFZGl0IExpbmUnXG4gICAgICAgIHRpdGxlID0gZm9ybS5maW5kKCcuZGlzY2xvc2VMaW5rID4gYScpLnRleHQodGV4dCk7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYnV0dG9uIHRvIHJlYWQgJ0VkaXQgTGluZSdcbiAgICAgICAgYnV0dG9uID0gZm9ybS5maW5kKCdbbmFtZT1hY3Rpb25dW3ZhbHVlPWxpbmVdJykudGV4dCh0ZXh0KTtcbiAgICAgICAgaWYgKHBsdXJhbCkge1xuICAgICAgICAgICAgZm9ybS5maW5kKCcuYnVsaycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgZm9ybS5vbignY2hhbmdlLmJ1bGsnLCAnOmlucHV0JywgKGV2OkpRdWVyeUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgJChldi50YXJnZXQpLnNpYmxpbmdzKCdsYWJlbCcpLmZpbmQoJy5idWxrJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWRkIGxpbmsgdG8gcmV2ZXJ0IGJhY2sgdG8gJ0FkZCBMaW5lJyBmb3JtXG4gICAgICAgICQoJzxhIGhyZWY9XCIjXCI+Q2FuY2VsPC9hPicpLmFkZENsYXNzKCdjYW5jZWwtbGluaycpLm9uKCdjbGljaycsIChldikgPT4ge1xuICAgICAgICAgICAgY2xlYXJMaW5lRm9ybSgpO1xuICAgICAgICAgICAgdGl0bGUudGV4dCgnQWRkIEEgTmV3IExpbmUnKTtcbiAgICAgICAgICAgIGJ1dHRvbi50ZXh0KCdBZGQgTGluZScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5pbnNlcnRBZnRlcihidXR0b24pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluc2VydExpbmVNZXRhZGF0YVJvdyhyZWZSb3csIGtleSwgdmFsdWUpIHtcbiAgICAgICAgdmFyIHJvdywgdHlwZSwgbGFiZWwsIGlucHV0LCBpZCA9ICdsaW5lLW1ldGEtJyArIGtleTtcbiAgICAgICAgcm93ID0gJCgnPHA+JykuYXR0cignaWQnLCAncm93XycgKyBpZCkuYWRkQ2xhc3MoJ2xpbmUtbWV0YScpLmluc2VydEJlZm9yZShyZWZSb3cpO1xuICAgICAgICB0eXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2tleV07XG4gICAgICAgIGxhYmVsID0gJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsICdpZF8nICsgaWQpLnRleHQodHlwZS5uYW1lKS5hcHBlbmRUbyhyb3cpO1xuICAgICAgICAvLyBidWxrIGNoZWNrYm94P1xuICAgICAgICBpbnB1dCA9ICQoJzxpbnB1dCB0eXBlPVwidGV4dFwiPicpLmF0dHIoJ2lkJywgJ2lkXycgKyBpZCkudmFsKHZhbHVlKS5hcHBlbmRUbyhyb3cpO1xuICAgICAgICBpZiAodHlwZS5wcmUpIHtcbiAgICAgICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXByZWZpeCcpLnRleHQodHlwZS5wcmUpLmluc2VydEJlZm9yZShpbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcmVtb3ZlJykudGV4dCgnUmVtb3ZlJykuaW5zZXJ0QWZ0ZXIoaW5wdXQpO1xuICAgICAgICBpZiAodHlwZS5wb3N0Zml4KSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wb3N0Zml4JykudGV4dCh0eXBlLnBvc3RmaXgpLmluc2VydEFmdGVyKGlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcm93O1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0QXNzYXkoaW5kZXg6bnVtYmVyKTp2b2lkIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgZm9ybTtcbiAgICAgICAgaWYgKCFyZWNvcmQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJbnZhbGlkIEFzc2F5IHJlY29yZCBmb3IgZWRpdGluZzogJyArIGluZGV4KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcm0gPSBjbGVhckFzc2F5Rm9ybSgpOyAvLyBcImZvcm1cIiBpcyBhY3R1YWxseSB0aGUgZGlzY2xvc2UgYmxvY2tcbiAgICAgICAgZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpO1xuICAgICAgICB1cGRhdGVVSUFzc2F5Rm9ybShmb3JtKTtcbiAgICAgICAgc2Nyb2xsVG9Gb3JtKGZvcm0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0TGluZShpbmRleDpudW1iZXIpOnZvaWQge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5MaW5lc1tpbmRleF0sIGZvcm07XG4gICAgICAgIGlmICghcmVjb3JkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnSW52YWxpZCBMaW5lIHJlY29yZCBmb3IgZWRpdGluZzogJyArIGluZGV4KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcm0gPSBjbGVhckxpbmVGb3JtKCk7IC8vIFwiZm9ybVwiIGlzIGFjdHVhbGx5IHRoZSBkaXNjbG9zZSBibG9ja1xuICAgICAgICBmaWxsTGluZUZvcm0oZm9ybSwgcmVjb3JkKTtcbiAgICAgICAgdXBkYXRlVUlMaW5lRm9ybShmb3JtKTtcbiAgICAgICAgc2Nyb2xsVG9Gb3JtKGZvcm0pO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uQ2hhbmdlZE1ldGFib2xpY01hcCgpIHtcbiAgICAgICAgaWYgKHRoaXMubWV0YWJvbGljTWFwTmFtZSkge1xuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBVSSB0byBzaG93IHRoZSBuZXcgZmlsZW5hbWUgZm9yIHRoZSBtZXRhYm9saWMgbWFwLlxuICAgICAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmh0bWwodGhpcy5tZXRhYm9saWNNYXBOYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoXCIjbWV0YWJvbGljTWFwTmFtZVwiKS5odG1sKCcobm9uZSknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiAmJiB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiAhPSAtMSkge1xuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGNhcmJvbiBiYWxhbmNlcyBub3cgdGhhdCB3ZSBjYW4uXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNhbGN1bGF0ZUNhcmJvbkJhbGFuY2VzKHRoaXMubWV0YWJvbGljTWFwSUQsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uKTtcblxuICAgICAgICAgICAgLy8gUmVidWlsZCB0aGUgQ0IgZ3JhcGhzLlxuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzKCkge1xuICAgICAgICB2YXIgY2VsbE9ianM6RGF0YUdyaWREYXRhQ2VsbFtdLFxuICAgICAgICAgICAgZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMgPSB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmNhcmJvbkJhbGFuY2VDb2w7XG4gICAgICAgIGlmICh0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIERyb3AgYW55IHByZXZpb3VzbHkgY3JlYXRlZCBDYXJib24gQmFsYW5jZSBTVkcgZWxlbWVudHMgZnJvbSB0aGUgRE9NLlxuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLnJlbW92ZUFsbENCR3JhcGhzKCk7XG4gICAgICAgIGNlbGxPYmpzID0gW107XG4gICAgICAgIC8vIGdldCBhbGwgY2VsbHMgZnJvbSBhbGwgY29sdW1ucyBpbiB0aGUgY29sdW1uIGdyb3VwXG4gICAgICAgIGdyb3VwLm1lbWJlckNvbHVtbnMuZm9yRWFjaCgoY29sOkRhdGFHcmlkQ29sdW1uU3BlYyk6dm9pZCA9PiB7XG4gICAgICAgICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShjZWxsT2JqcywgY29sLmdldEVudGlyZUluZGV4KCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gY3JlYXRlIGNhcmJvbiBiYWxhbmNlIGdyYXBoIGZvciBlYWNoIGNlbGxcbiAgICAgICAgY2VsbE9ianMuZm9yRWFjaCgoY2VsbDpEYXRhR3JpZERhdGFDZWxsKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNyZWF0ZUNCR3JhcGhGb3JMaW5lKGNlbGwucmVjb3JkSUQsIGNlbGwuY2VsbEVsZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2ggPSB0cnVlO1xuICAgIH1cblxuXG4gICAgLy8gVGhleSB3YW50IHRvIHNlbGVjdCBhIGRpZmZlcmVudCBtZXRhYm9saWMgbWFwLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBvbkNsaWNrZWRNZXRhYm9saWNNYXBOYW1lKCk6dm9pZCB7XG4gICAgICAgIHZhciB1aTpTdHVkeU1ldGFib2xpY01hcENob29zZXIsXG4gICAgICAgICAgICBjYWxsYmFjazpNZXRhYm9saWNNYXBDaG9vc2VyUmVzdWx0ID0gKGVycm9yOnN0cmluZyxcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcE5hbWU/OnN0cmluZyxcbiAgICAgICAgICAgICAgICBmaW5hbEJpb21hc3M/Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBJRCA9IG1ldGFib2xpY01hcElEO1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGljTWFwTmFtZSA9IG1ldGFib2xpY01hcE5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gPSBmaW5hbEJpb21hc3M7XG4gICAgICAgICAgICAgICAgdGhpcy5vbkNoYW5nZWRNZXRhYm9saWNNYXAoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJvbkNsaWNrZWRNZXRhYm9saWNNYXBOYW1lIGVycm9yOiBcIiArIGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdWkgPSBuZXcgU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyKGZhbHNlLCBjYWxsYmFjayk7XG4gICAgfVxufTtcblxuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgTGluZXMgdGFibGVcbmNsYXNzIERhdGFHcmlkU3BlY0xpbmVzIGV4dGVuZHMgRGF0YUdyaWRTcGVjQmFzZSB7XG5cbiAgICBtZXRhRGF0YUlEc1VzZWRJbkxpbmVzOmFueTtcbiAgICBncm91cElEc0luT3JkZXI6YW55O1xuICAgIGdyb3VwSURzVG9Hcm91cEluZGV4ZXM6YW55O1xuICAgIGdyb3VwSURzVG9Hcm91cE5hbWVzOmFueTtcbiAgICBjYXJib25CYWxhbmNlQ29sOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjO1xuICAgIGNhcmJvbkJhbGFuY2VXaWRnZXQ6REdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldDtcblxuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuZmluZE1ldGFEYXRhSURzVXNlZEluTGluZXMoKTtcbiAgICAgICAgdGhpcy5maW5kR3JvdXBJRHNBbmROYW1lcygpO1xuICAgICAgICBzdXBlcigpO1xuICAgIH1cblxuXG4gICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCh2OmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQuaGlnaGxpZ2h0KHYpO1xuICAgIH1cblxuXG4gICAgZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldCh2OmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQuZW5hYmxlKHYpO1xuICAgIH1cblxuXG4gICAgZmluZE1ldGFEYXRhSURzVXNlZEluTGluZXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgLy8gbG9vcCBsaW5lc1xuICAgICAgICAkLmVhY2godGhpcy5nZXRSZWNvcmRJRHMoKSwgKGluZGV4LCBpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2lkXTtcbiAgICAgICAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGxpbmUubWV0YSB8fCB7fSwgKGtleSkgPT4gc2Vlbkhhc2hba2V5XSA9IHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gc3RvcmUgYWxsIG1ldGFkYXRhIElEcyBzZWVuXG4gICAgICAgIHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcyA9IE9iamVjdC5rZXlzKHNlZW5IYXNoKTtcbiAgICB9XG5cblxuICAgIGZpbmRHcm91cElEc0FuZE5hbWVzKCkge1xuICAgICAgICB2YXIgcm93R3JvdXBzID0ge307XG4gICAgICAgIC8vIEdhdGhlciBhbGwgdGhlIHJvdyBJRHMgdW5kZXIgdGhlIGdyb3VwIElEIGVhY2ggYmVsb25ncyB0by5cbiAgICAgICAgJC5lYWNoKHRoaXMuZ2V0UmVjb3JkSURzKCksIChpbmRleCwgaWQpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpZF0sIHJlcCA9IGxpbmUucmVwbGljYXRlO1xuICAgICAgICAgICAgaWYgKHJlcCkge1xuICAgICAgICAgICAgICAgIC8vIHVzZSBwYXJlbnQgcmVwbGljYXRlIGFzIGEgcmVwbGljYXRlIGdyb3VwIElELCBwdXNoIGFsbCBtYXRjaGluZyBsaW5lIElEc1xuICAgICAgICAgICAgICAgIChyb3dHcm91cHNbcmVwXSA9IHJvd0dyb3Vwc1tyZXBdIHx8IFsgcmVwIF0pLnB1c2goaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lcyA9IHt9O1xuICAgICAgICAvLyBGb3IgZWFjaCBncm91cCBJRCwganVzdCB1c2UgcGFyZW50IHJlcGxpY2F0ZSBuYW1lXG4gICAgICAgICQuZWFjaChyb3dHcm91cHMsIChncm91cCwgbGluZXMpID0+IHtcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbZ3JvdXBdID0gRURERGF0YS5MaW5lc1tncm91cF0ubmFtZTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGFscGhhbnVtZXJpYyBzb3J0IG9mIGdyb3VwIElEcyBieSBuYW1lIGF0dGFjaGVkIHRvIHRob3NlIHJlcGxpY2F0ZSBncm91cHNcbiAgICAgICAgdGhpcy5ncm91cElEc0luT3JkZXIgPSBPYmplY3Qua2V5cyhyb3dHcm91cHMpLnNvcnQoKGEsYikgPT4ge1xuICAgICAgICAgICAgdmFyIHU6c3RyaW5nID0gdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1thXSwgdjpzdHJpbmcgPSB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2JdO1xuICAgICAgICAgICAgcmV0dXJuIHUgPCB2ID8gLTEgOiB1ID4gdiA/IDEgOiAwO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gTm93IHRoYXQgdGhleSdyZSBzb3J0ZWQgYnkgbmFtZSwgY3JlYXRlIGEgaGFzaCBmb3IgcXVpY2tseSByZXNvbHZpbmcgSURzIHRvIGluZGV4ZXMgaW5cbiAgICAgICAgLy8gdGhlIHNvcnRlZCBhcnJheVxuICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cEluZGV4ZXMgPSB7fTtcbiAgICAgICAgJC5lYWNoKHRoaXMuZ3JvdXBJRHNJbk9yZGVyLCAoaW5kZXgsIGdyb3VwKSA9PiB0aGlzLmdyb3VwSURzVG9Hcm91cEluZGV4ZXNbZ3JvdXBdID0gaW5kZXgpO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ2xpbmVzJywgeyAnbmFtZSc6ICdMaW5lcycgfSk7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZExpbmVOYW1lKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgcmV0dXJuIGxpbmUubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkU3RyYWluTmFtZShpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIC8vIGVuc3VyZSBhIHN0cmFpbiBJRCBleGlzdHMgb24gbGluZSwgaXMgYSBrbm93biBzdHJhaW4sIHVwcGVyY2FzZSBmaXJzdCBmb3VuZCBuYW1lIG9yICc/J1xuICAgICAgICB2YXIgbGluZSwgc3RyYWluO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLnN0cmFpbiAmJiBsaW5lLnN0cmFpbi5sZW5ndGggJiYgKHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tsaW5lLnN0cmFpblswXV0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0cmFpbi5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4OnN0cmluZyk6YW55IHtcbiAgICAgICAgLy8gZW5zdXJlIGNhcmJvbiBzb3VyY2UgSUQocykgZXhpc3Qgb24gbGluZSwgZW5zdXJlIGF0IGxlYXN0IG9uZSBzb3VyY2UgSUQsIGVuc3VyZSBmaXJzdCBJRFxuICAgICAgICAvLyBpcyBrbm93biBjYXJib24gc291cmNlXG4gICAgICAgIHZhciBsaW5lLCBzb3VyY2U7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuY2FyYm9uICYmIGxpbmUuY2FyYm9uLmxlbmd0aCAmJiAoc291cmNlID0gRURERGF0YS5DU291cmNlc1tsaW5lLmNhcmJvblswXV0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRDYXJib25Tb3VyY2UoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc291cmNlID0gdGhpcy5sb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXgpO1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gc291cmNlLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRDYXJib25Tb3VyY2VMYWJlbGluZyhpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzb3VyY2UgPSB0aGlzLmxvYWRGaXJzdENhcmJvblNvdXJjZShpbmRleCk7XG4gICAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICAgIHJldHVybiBzb3VyY2UubGFiZWxpbmcudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRFeHBlcmltZW50ZXJJbml0aWFscyhpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIC8vIGVuc3VyZSBpbmRleCBJRCBleGlzdHMsIGVuc3VyZSBleHBlcmltZW50ZXIgdXNlciBJRCBleGlzdHMsIHVwcGVyY2FzZSBpbml0aWFscyBvciA/XG4gICAgICAgIHZhciBsaW5lLCBleHBlcmltZW50ZXI7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChleHBlcmltZW50ZXIgPSBFREREYXRhLlVzZXJzW2xpbmUuZXhwZXJpbWVudGVyXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwZXJpbWVudGVyLmluaXRpYWxzLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkTGluZU1vZGlmaWNhdGlvbihpbmRleDpzdHJpbmcpOm51bWJlciB7XG4gICAgICAgIHZhciBsaW5lO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLm1vZGlmaWVkLnRpbWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBoZWFkZXJzIGFsb25nIHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygxLCAnaExpbmVzTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdOYW1lJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU5hbWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIsICdoTGluZXNTdHJhaW4nLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnU3RyYWluJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkU3RyYWluTmFtZSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMywgJ2hMaW5lc0NhcmJvbicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdDYXJib24gU291cmNlKHMpJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQ2FyYm9uU291cmNlLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg0LCAnaExpbmVzTGFiZWxpbmcnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFiZWxpbmcnLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRDYXJib25Tb3VyY2VMYWJlbGluZyxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSwgJ2hMaW5lc0NhcmJvbkJhbGFuY2UnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ2FyYm9uIEJhbGFuY2UnLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIC8vIG1hcCBhbGwgbWV0YWRhdGEgSURzIHRvIEhlYWRlclNwZWMgb2JqZWN0c1xuICAgICAgICB2YXIgbWV0YURhdGFIZWFkZXJzOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBpbmRleCwgJ2hMaW5lc01ldGEnICsgaWQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG1kVHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLm1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCksXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLCAnaExpbmVzRXhwZXJpbWVudGVyJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEV4cGVyaW1lbnRlckluaXRpYWxzLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCwgJ2hMaW5lc01vZGlmaWVkJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTW9kaWZpY2F0aW9uLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUhlYWRlcnMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZDpzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIChpOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2ldO1xuICAgICAgICAgICAgaWYgKGxpbmUgJiYgbGluZS5tZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxpbmUubWV0YVtpZF0gfHwgJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZSBjb2xzcGFuIHZhbHVlIGZvciBhbGwgdGhlIGNlbGxzIHRoYXQgYXJlIG5vdCAnY2FyYm9uIHNvdXJjZScgb3IgJ2xhYmVsaW5nJ1xuICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBudW1iZXIgb2YgY2FyYm9uIHNvdXJjZXMgZm9yIHRoZSByZXNwZWN0aXZlIHJlY29yZC5cbiAgICAvLyBTcGVjaWZpY2FsbHksIGl0J3MgZWl0aGVyIHRoZSBudW1iZXIgb2YgY2FyYm9uIHNvdXJjZXMsIG9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuXG4gICAgcHJpdmF0ZSByb3dTcGFuRm9yUmVjb3JkKGluZGV4KSB7XG4gICAgICAgIHJldHVybiAoRURERGF0YS5MaW5lc1tpbmRleF0uY2FyYm9uIHx8IFtdKS5sZW5ndGggfHwgMTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTGluZU5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdsaW5lSWQnLFxuICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6IChpZCkgPT4geyByZXR1cm4gJ2xpbmUnICsgaWQgKyAnaW5jbHVkZSc7IH0sXG4gICAgICAgICAgICAgICAgJ3NpZGVNZW51SXRlbXMnOiBbXG4gICAgICAgICAgICAgICAgICAgICc8YSBocmVmPVwiI2VkaXRsaW5lXCIgY2xhc3M9XCJsaW5lLWVkaXQtbGlua1wiPkVkaXQgTGluZTwvYT4nLFxuICAgICAgICAgICAgICAgICAgICAnPGEgaHJlZj1cIi9leHBvcnQ/bGluZUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBDU1YvZXRjPC9hPidcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGxpbmUubmFtZSArIChsaW5lLmN0cmwgPyAnPGIgY2xhc3M9XCJpc2NvbnRyb2xkYXRhXCI+QzwvYj4nIDogJycpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVTdHJhaW5OYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIGNvbnRlbnQgPSBbXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gbGluZS5zdHJhaW4ubWFwKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbaWRdO1xuICAgICAgICAgICAgICAgIHJldHVybiBbICc8YSBocmVmPVwiJywgc3RyYWluLnJlZ2lzdHJ5X3VybCwgJ1wiPicsIHN0cmFpbi5uYW1lLCAnPC9hPicgXS5qb2luKCcnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudC5qb2luKCc7ICcpIHx8ICctLSdcbiAgICAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBzdHJpbmdzID0gWyctLSddO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmNhcmJvbiAmJiBsaW5lLmNhcmJvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmdzID0gbGluZS5jYXJib24ubWFwKChpZCkgPT4geyByZXR1cm4gRURERGF0YS5DU291cmNlc1tpZF0ubmFtZTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZ3MubWFwKChuYW1lKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7ICdjb250ZW50U3RyaW5nJzogbmFtZSB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgc3RyaW5ncyA9IFsnLS0nXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5ncyA9IGxpbmUuY2FyYm9uLm1hcCgoaWQpID0+IHsgcmV0dXJuIEVERERhdGEuQ1NvdXJjZXNbaWRdLmxhYmVsaW5nOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5ncy5tYXAoKGxhYmVsaW5nKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7ICdjb250ZW50U3RyaW5nJzogbGFiZWxpbmcgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNhcmJvbkJhbGFuY2VCbGFua0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdtaW5XaWR0aCc6IDIwMFxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlRXhwZXJpbWVudGVySW5pdGlhbHNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgZXhwLCBjb250ZW50O1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLlVzZXJzICYmIChleHAgPSBFREREYXRhLlVzZXJzW2xpbmUuZXhwZXJpbWVudGVyXSkpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50ID0gZXhwLmluaXRpYWxzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudCB8fCAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKEVERERhdGEuTGluZXNbaW5kZXhdLm1vZGlmaWVkLnRpbWUpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29udGVudFN0ciA9ICcnLCBsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGxpbmUgJiYgdHlwZSAmJiBsaW5lLm1ldGEgJiYgKGNvbnRlbnRTdHIgPSBsaW5lLm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGRhdGEgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVDb2x1bW5TcGVjKCk6RGF0YUdyaWRDb2x1bW5TcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICBtZXRhRGF0YUNvbHM6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICByaWdodFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW107XG4gICAgICAgIC8vIGFkZCBjbGljayBoYW5kbGVyIGZvciBtZW51IG9uIGxpbmUgbmFtZSBjZWxsc1xuICAgICAgICAkKHRoaXMudGFibGVFbGVtZW50KS5vbignY2xpY2snLCAnYS5saW5lLWVkaXQtbGluaycsIChldikgPT4ge1xuICAgICAgICAgICAgU3R1ZHlELmVkaXRMaW5lKCQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgICAgICBsZWZ0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMSwgdGhpcy5nZW5lcmF0ZUxpbmVOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyLCB0aGlzLmdlbmVyYXRlU3RyYWluTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMywgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCwgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUxhYmVsaW5nQ2VsbHMpLFxuICAgICAgICAgICAgLy8gVGhlIENhcmJvbiBCYWxhbmNlIGNlbGxzIGFyZSBwb3B1bGF0ZWQgYnkgYSBjYWxsYmFjaywgdHJpZ2dlcmVkIHdoZW4gZmlyc3QgZGlzcGxheWVkXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDUsIHRoaXMuZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscylcbiAgICAgICAgXTtcbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgaW5kZXgsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG4gICAgZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSB7XG4gICAgICAgIHZhciB0b3BTZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xpbmUgTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ1N0cmFpbicpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDYXJib24gU291cmNlKHMpJyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhYmVsaW5nJyksXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VDb2wgPSBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NhcmJvbiBCYWxhbmNlJywge1xuICAgICAgICAgICAgICAgICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlLCAgICAvLyBIYXMgaXRzIG93biBoZWFkZXIgd2lkZ2V0XG4gICAgICAgICAgICAgICAgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3JldmVhbGVkQ2FsbGJhY2snOiBTdHVkeUQuY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2tcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdmFyIG1ldGFEYXRhQ29sR3JvdXBzOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgICAgIG1ldGFEYXRhQ29sR3JvdXBzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMobWRUeXBlLm5hbWUpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgYm90dG9tU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdFeHBlcmltZW50ZXInLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYXN0IE1vZGlmaWVkJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiB0b3BTZWN0aW9uLmNvbmNhdChtZXRhRGF0YUNvbEdyb3VwcywgYm90dG9tU2VjdGlvbik7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgZ3JvdXBzIHRoYXQgcm93cyBjYW4gYmUgZ2F0aGVyZWQgaW50b1xuICAgIGRlZmluZVJvd0dyb3VwU3BlYygpOmFueSB7XG5cbiAgICAgICAgdmFyIHJvd0dyb3VwU3BlYyA9IFtdO1xuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHRoaXMuZ3JvdXBJRHNJbk9yZGVyLmxlbmd0aDsgeCsrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSB0aGlzLmdyb3VwSURzSW5PcmRlclt4XTtcblxuICAgICAgICAgICAgdmFyIHJvd0dyb3VwU3BlY0VudHJ5OmFueSA9IHsgICAgLy8gR3JvdXBzIGFyZSBudW1iZXJlZCBzdGFydGluZyBmcm9tIDBcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2lkXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJvd0dyb3VwU3BlYy5wdXNoKHJvd0dyb3VwU3BlY0VudHJ5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dHcm91cFNwZWM7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlXG4gICAgLy8gY29udGVudCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgZ2V0VGFibGVFbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdHVkeUxpbmVzVGFibGVcIik7XG4gICAgfVxuXG5cbiAgICAvLyBBbiBhcnJheSBvZiB1bmlxdWUgaWRlbnRpZmllcnMgKG51bWJlcnMsIG5vdCBzdHJpbmdzKSwgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGVcbiAgICAvLyBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhFREREYXRhLkxpbmVzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZVxuICAgIC8vIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci4gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHN1YnN0cmluZyBzZWFyY2hpbmdcbiAgICAgICAgdmFyIHNlYXJjaExpbmVzV2lkZ2V0ID0gbmV3IERHTGluZXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggTGluZXMnLCAzMCwgZmFsc2UpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWFyY2hMaW5lc1dpZGdldCk7XG4gICAgICAgIC8vIEEgXCJDYXJib24gQmFsYW5jZVwiIGNoZWNrYm94XG4gICAgICAgIHZhciBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCA9IG5ldyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCk7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldCA9IHNob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuICAgICAgICAvLyBBIFwic2VsZWN0IGFsbFwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy4gVGhlIG9yZGVyIG9mIHRoZSBhcnJheVxuICAgIC8vIHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGRpc3BsYXllZCBpbiB0aGUgbWVudS4gRW1wdHkgYXJyYXkgPSBPSy5cbiAgICBjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgTGluZXNcbiAgICAgICAgdmFyIGdyb3VwTGluZXNXaWRnZXQgPSBuZXcgREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGdyb3VwTGluZXNXaWRnZXQpO1xuICAgICAgICB2YXIgZGlzYWJsZWRMaW5lc1dpZGdldCA9IG5ldyBER0Rpc2FibGVkTGluZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZExpbmVzV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG4gICAgb25Jbml0aWFsaXplZChkYXRhR3JpZDpEYXRhR3JpZCk6dm9pZCB7XG5cbiAgICAgICAgLy8gV2lyZSB1cCB0aGUgJ2FjdGlvbiBwYW5lbHMnIGZvciB0aGUgTGluZXMgYW5kIEFzc2F5cyBzZWN0aW9uc1xuICAgICAgICB2YXIgbGluZXNUYWJsZSA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgICQobGluZXNUYWJsZSkub24oJ2NoYW5nZScsICc6Y2hlY2tib3gnLCAoKSA9PiBTdHVkeUQucXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdygpKTtcblxuICAgICAgICAvLyBUaGlzIGNhbGxzIGRvd24gaW50byB0aGUgaW5zdGFudGlhdGVkIHdpZGdldCBhbmQgYWx0ZXJzIGl0cyBzdHlsaW5nLFxuICAgICAgICAvLyBzbyB3ZSBuZWVkIHRvIGRvIGl0IGFmdGVyIHRoZSB0YWJsZSBoYXMgYmVlbiBjcmVhdGVkLlxuICAgICAgICB0aGlzLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQoZmFsc2UpO1xuXG4gICAgICAgIC8vIFdpcmUtaW4gb3VyIGN1c3RvbSBlZGl0IGZpZWxkcyBmb3IgdGhlIFN0dWRpZXMgcGFnZSwgYW5kIGNvbnRpbnVlIHdpdGggZ2VuZXJhbCBpbml0XG4gICAgICAgIFN0dWR5RC5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCk7XG4gICAgfVxufVxuXG5cblxuLy8gV2hlbiB1bmNoZWNrZWQsIHRoaXMgaGlkZXMgdGhlIHNldCBvZiBMaW5lcyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkTGluZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ1Nob3dETGluZXNDQicrdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgJChjYikuY2xpY2soIChlKSA9PiB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY2xpY2tlZE9wdGlvbldpZGdldChlKSApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdTaG93IERpc2FibGVkJywgY2JJRCk7O1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcblxuICAgICAgICB2YXIgY2hlY2tlZDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICBjaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkKSB7XG4gICAgICAgICAgICByZXR1cm4gcm93SURzO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZpbHRlcmVkSURzID0gW107XG4gICAgICAgIGZvciAodmFyIHIgPSAwOyByIDwgcm93SURzLmxlbmd0aDsgcisrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSByb3dJRHNbcl07XG4gICAgICAgICAgICAvLyBIZXJlIGlzIHRoZSBjb25kaXRpb24gdGhhdCBkZXRlcm1pbmVzIHdoZXRoZXIgdGhlIHJvd3MgYXNzb2NpYXRlZCB3aXRoIHRoaXMgSUQgYXJlXG4gICAgICAgICAgICAvLyBzaG93biBvciBoaWRkZW4uXG4gICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1tpZF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChpZCk7ICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkSURzO1xuICAgIH1cblxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDpzdHJpbmcpOmFueSB7XG4gICAgICAgIGlmICghRURERGF0YS5MaW5lc1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuLy8gQSB3aWRnZXQgdG8gdG9nZ2xlIHJlcGxpY2F0ZSBncm91cGluZyBvbiBhbmQgb2ZmXG5jbGFzcyBER0dyb3VwU3R1ZHlSZXBsaWNhdGVzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIHBUaGlzID0gdGhpcztcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydHcm91cFN0dWR5UmVwbGljYXRlc0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayhcbiAgICAgICAgICAgIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBpZiAocFRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcFRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50dXJuT25Sb3dHcm91cGluZygpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHBUaGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHVybk9mZlJvd0dyb3VwaW5nKCk7ICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnR3JvdXAgUmVwbGljYXRlcycsIGNiSUQpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cbn1cblxuXG5cbi8vIFRoaXMgaXMgYSBEYXRhR3JpZEhlYWRlcldpZGdldCBkZXJpdmVkIGZyb20gREdTZWFyY2hXaWRnZXQuIEl0J3MgYSBzZWFyY2ggZmllbGQgdGhhdCBvZmZlcnNcbi8vIG9wdGlvbnMgZm9yIGFkZGl0aW9uYWwgZGF0YSB0eXBlcywgcXVlcnlpbmcgdGhlIHNlcnZlciBmb3IgcmVzdWx0cy5cbmNsYXNzIERHTGluZXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBzZWFyY2hEaXNjbG9zdXJlRWxlbWVudDphbnk7XG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6YW55LCBkYXRhR3JpZFNwZWM6YW55LCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLFxuICAgICAgICAgICAgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjLCBwbGFjZUhvbGRlciwgc2l6ZSwgZ2V0c0ZvY3VzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zIHdoZW4gY3JlYXRpbmcgaW5wdXRcbiAgICAvLyBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHN1cGVyLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBhcHBlbmQgdGhlIHdpZGdldCBlbGVtZW50cyBiZW5lYXRoIHRoZSBnaXZlbiBlbGVtZW50LiBJZiB0aGUgZWxlbWVudHMgaGF2ZVxuICAgIC8vIG5vdCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgdGhlIHVuaXF1ZUlEIGlzIHBhc3NlZCBhbG9uZy5cbiAgICBhcHBlbmRFbGVtZW50cyhjb250YWluZXI6YW55LCB1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICAgIH1cbn1cblxuXG5cbi8vIEEgaGVhZGVyIHdpZGdldCB0byBwcmVwYXJlIHRoZSBDYXJib24gQmFsYW5jZSB0YWJsZSBjZWxscywgYW5kIHNob3cgb3IgaGlkZSB0aGVtLlxuY2xhc3MgREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIGNoZWNrQm94RWxlbWVudDphbnk7XG4gICAgbGFiZWxFbGVtZW50OmFueTtcbiAgICBoaWdobGlnaHRlZDpib29sZWFuO1xuICAgIGNoZWNrYm94RW5hYmxlZDpib29sZWFuO1xuXG4gICAgLy8gc3RvcmUgbW9yZSBzcGVjaWZpYyB0eXBlIG9mIHNwZWMgdG8gZ2V0IHRvIGNhcmJvbkJhbGFuY2VDb2wgbGF0ZXJcbiAgICBwcml2YXRlIF9saW5lU3BlYzpEYXRhR3JpZFNwZWNMaW5lcztcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcykge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLmNoZWNrYm94RW5hYmxlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fbGluZVNwZWMgPSBkYXRhR3JpZFNwZWM7XG4gICAgfVxuICAgIFxuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkICsgJ0NhckJhbCcgKyB1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICBjYi5jbGFzc05hbWUgPSAndGFibGVDb250cm9sJztcbiAgICAgICAgJChjYikuY2xpY2soKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5hY3RpdmF0ZUNhcmJvbkJhbGFuY2UoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGxhYmVsOkhUTUxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ0NhcmJvbiBCYWxhbmNlJywgY2JJRCk7XG5cbiAgICAgICAgdmFyIHNwYW46SFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgICAgc3Bhbi5jbGFzc05hbWUgPSAndGFibGVDb250cm9sJztcbiAgICAgICAgc3Bhbi5hcHBlbmRDaGlsZChjYik7XG4gICAgICAgIHNwYW4uYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gbGFiZWw7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IHNwYW47XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuICAgIGhpZ2hsaWdodChoOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmhpZ2hsaWdodGVkID0gaDtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tib3hFbmFibGVkKSB7XG4gICAgICAgICAgICBpZiAoaCkge1xuICAgICAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJ3JlZCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBlbmFibGUoaDpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jaGVja2JveEVuYWJsZWQgPSBoO1xuICAgICAgICBpZiAoaCkge1xuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHQodGhpcy5oaWdobGlnaHRlZCk7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxhYmVsRWxlbWVudC5zdHlsZS5jb2xvciA9ICdncmF5JztcbiAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWN0aXZhdGVDYXJib25CYWxhbmNlKCk6dm9pZCB7XG4gICAgICAgIHZhciB1aTpGdWxsU3R1ZHlCaW9tYXNzVUksXG4gICAgICAgICAgICBjYWxsYmFjazpGdWxsU3R1ZHlCaW9tYXNzVUlSZXN1bHRzQ2FsbGJhY2s7XG4gICAgICAgIGNhbGxiYWNrID0gKGVycm9yOnN0cmluZyxcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcEZpbGVuYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgZmluYWxCaW9tYXNzPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgICAgICAgIFN0dWR5RC5tZXRhYm9saWNNYXBJRCA9IG1ldGFib2xpY01hcElEO1xuICAgICAgICAgICAgICAgIFN0dWR5RC5tZXRhYm9saWNNYXBOYW1lID0gbWV0YWJvbGljTWFwRmlsZW5hbWU7XG4gICAgICAgICAgICAgICAgU3R1ZHlELmJpb21hc3NDYWxjdWxhdGlvbiA9IGZpbmFsQmlvbWFzcztcbiAgICAgICAgICAgICAgICBTdHVkeUQub25DaGFuZ2VkTWV0YWJvbGljTWFwKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnNob3dDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIGdldCBhIGJpb21hc3MgY2FsY3VsYXRpb24gdG8gbXVsdGlwbHkgYWdhaW5zdCBPRC5cbiAgICAgICAgICAgIC8vIEhhdmUgdGhleSBzZXQgdGhpcyB1cCB5ZXQ/XG4gICAgICAgICAgICBpZiAoIVN0dWR5RC5iaW9tYXNzQ2FsY3VsYXRpb24gfHwgU3R1ZHlELmJpb21hc3NDYWxjdWxhdGlvbiA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgLy8gTXVzdCBzZXR1cCB0aGUgYmlvbWFzc1xuICAgICAgICAgICAgICAgIHVpID0gbmV3IEZ1bGxTdHVkeUJpb21hc3NVSShjYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5zaG93Q29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmhpZGVDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG5jbGFzcyBEYXRhR3JpZEFzc2F5cyBleHRlbmRzIERhdGFHcmlkIHtcblxuXG4gICAgc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZDpib29sZWFuO1xuICAgIGdyYXBoUmVmcmVzaFRpbWVySUQ6YW55O1xuICAgIC8vIFJpZ2h0IG5vdyB3ZSdyZSBub3QgYWN0dWFsbHkgdXNpbmcgdGhlIGNvbnRlbnRzIG9mIHRoaXMgYXJyYXksIGp1c3RcbiAgICAvLyBjaGVja2luZyB0byBzZWUgaWYgaXQncyBub24tZW1wdHkuXG4gICAgcmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkOm51bWJlcltdO1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICB0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZCA9IFtdO1xuICAgICAgICB0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRTcGVjKTtcbiAgICB9XG5cblxuICAgIGludmFsaWRhdGVBc3NheVJlY29yZHMocmVjb3JkczpudW1iZXJbXSk6dm9pZCB7XG4gICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQuY29uY2F0KHJlY29yZHMpO1xuICAgICAgICBpZiAoIXRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQpIHtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgY2xpY2tlZERpc2Nsb3NlKGRpc2Nsb3NlOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB2YXIgc3BlYzpEYXRhR3JpZFNwZWNBc3NheXMgPSB0aGlzLmdldFNwZWMoKTtcbiAgICAgICAgdmFyIHRhYmxlID0gc3BlYy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgdmFyIGRpdiA9IHNwZWMudW5kaXNjbG9zZWRTZWN0aW9uRGl2O1xuICAgICAgICBpZiAoIWRpdiB8fCAhdGFibGUpIHsgcmV0dXJuOyB9XG4gICAgICAgIGlmIChkaXNjbG9zZSkge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgYSB0YWJsZS4gVGhpcyBicmVha3MgdXBcbiAgICAgICAgICAgIC8vIHRhYmxlIHJlY3JlYXRpb24gaW50byBzZXBhcmF0ZSBldmVudHMsIHNvIHRoZSBicm93c2VyIGNhbiB1cGRhdGUgVUkuXG4gICAgICAgICAgICBpZiAodGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCksIDEwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICB0cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCgpOnZvaWQge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgICAgICB0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy5xdWV1ZUdyYXBoUmVtYWtlKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZXhlY3V0ZSByZWNvcmRzIHJlZnJlc2g6ICcgKyBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBfY2FuY2VsR3JhcGgoKSB7XG4gICAgICAgIGlmICh0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQpO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRDtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgcXVldWVHcmFwaFJlbWFrZSgpIHtcbiAgICAgICAgdGhpcy5fY2FuY2VsR3JhcGgoKTtcbiAgICAgICAgdGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dCggKCkgPT4gdGhpcy5yZW1ha2VHcmFwaEFyZWEoKSwgMTAwICk7XG4gICAgfVxuXG5cbiAgICByZW1ha2VHcmFwaEFyZWEoKSB7XG4gICAgICAgIHZhciBzcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cyA9IHRoaXMuZ2V0U3BlYygpLCBnLCBjb252ZXJ0LCBjb21wYXJlO1xuICAgICAgICAvLyBpZiBjYWxsZWQgZGlyZWN0bHksIGNhbmNlbCBhbnkgcGVuZGluZyByZXF1ZXN0cyBpbiBcInF1ZXVlXCJcbiAgICAgICAgdGhpcy5fY2FuY2VsR3JhcGgoKTtcblxuICAgICAgICBpZiAoIVN0dWR5REdyYXBoaW5nIHx8ICFzcGVjIHx8ICFzcGVjLmdyYXBoT2JqZWN0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBnID0gc3BlYy5ncmFwaE9iamVjdDtcbiAgICAgICAgZy5jbGVhckFsbFNldHMoKTtcblxuICAgICAgICAvLyBmdW5jdGlvbiBjb252ZXJ0cyBkb3dubG9hZGVkIGRhdGEgcG9pbnQgdG8gZm9ybSB1c2FibGUgYnkgZmxvdFxuICAgICAgICAvLyBGSVhNRSBhc3N1bWVzICh4MCwgeTApIHBvaW50cyBvbmx5XG4gICAgICAgIGNvbnZlcnQgPSAoZCkgPT4geyByZXR1cm4gW1sgZFswXVswXSwgZFsxXVswXSBdXTsgfTtcblxuICAgICAgICAvLyBmdW5jdGlvbiBjb21wYXJpbmcgdHdvIHBvaW50cywgdG8gc29ydCBkYXRhIHNlbnQgdG8gZmxvdFxuICAgICAgICBjb21wYXJlID0gKGEsIGIpID0+IHsgcmV0dXJuIGFbMF0gLSBiWzBdOyB9O1xuXG4gICAgICAgIHNwZWMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheTphbnkgPSBFREREYXRhLkFzc2F5c1tpZF0gfHwge30sXG4gICAgICAgICAgICAgICAgbGluZTphbnkgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0gfHwge30sXG4gICAgICAgICAgICAgICAgbWVhc3VyZXM7XG4gICAgICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSB8fCAhbGluZS5hY3RpdmUpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgICBtZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdO1xuICAgICAgICAgICAgbWVhc3VyZXMuZm9yRWFjaCgobSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttXSwgc2V0O1xuICAgICAgICAgICAgICAgIHNldCA9IHtcbiAgICAgICAgICAgICAgICAgICAgJ2xhYmVsJzogJ2R0JyArIG0sXG4gICAgICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudG5hbWUnOiBVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvTmFtZShtKSxcbiAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiBhc3NheS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAnYWlkJzogaWQsXG4gICAgICAgICAgICAgICAgICAgICdtdGlkJzogbWVhc3VyZS50eXBlLFxuICAgICAgICAgICAgICAgICAgICAndW5pdHMnOiBVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMobSksXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzogJC5tYXAobWVhc3VyZS52YWx1ZXMsIGNvbnZlcnQpLnNvcnQoY29tcGFyZSlcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLmNvbnRyb2wpIHNldC5pc2NvbnRyb2wgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGcuYWRkTmV3U2V0KHNldCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZy5kcmF3U2V0cygpO1xuICAgIH1cblxuXG4gICAgLy8gTm90ZTogQ3VycmVudGx5IG5vdCBiZWluZyBjYWxsZWQuXG4gICAgcmVzaXplR3JhcGgoZykge1xuICAgICAgICB2YXIgc3BlYzpEYXRhR3JpZFNwZWNBc3NheXMgPSB0aGlzLmdldFNwZWMoKTtcbiAgICAgICAgdmFyIGdyYXBoT2JqID0gc3BlYy5ncmFwaE9iamVjdDtcbiAgICAgICAgaWYgKCFncmFwaE9iaikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICghZ3JhcGhPYmoucGxvdE9iamVjdCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIGdyYXBoT2JqLnBsb3RPYmplY3QucmVzaXplKCk7XG4gICAgICAgIGdyYXBoT2JqLnBsb3RPYmplY3Quc2V0dXBHcmlkKCk7XG4gICAgICAgIGdyYXBoT2JqLnBsb3RPYmplY3QuZHJhdygpO1xuICAgIH1cbn1cblxuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgQXNzYXlzIHRhYmxlKHMpXG5jbGFzcyBEYXRhR3JpZFNwZWNBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIHByb3RvY29sSUQ6YW55O1xuICAgIHByb3RvY29sTmFtZTpzdHJpbmc7XG4gICAgYXNzYXlJRHNJblByb3RvY29sOm51bWJlcltdO1xuICAgIG1ldGFEYXRhSURzVXNlZEluQXNzYXlzOmFueTtcbiAgICBtYXhpbXVtWFZhbHVlSW5EYXRhOm51bWJlcjtcblxuICAgIHVuZGlzY2xvc2VkU2VjdGlvbkRpdjphbnk7XG5cbiAgICBtZWFzdXJpbmdUaW1lc0hlYWRlclNwZWM6RGF0YUdyaWRIZWFkZXJTcGVjO1xuICAgIGdyYXBoQXJlYUhlYWRlclNwZWM6RGF0YUdyaWRIZWFkZXJTcGVjO1xuXG4gICAgZ3JhcGhPYmplY3Q6YW55O1xuXG5cbiAgICBjb25zdHJ1Y3Rvcihwcm90b2NvbElEKSB7XG4gICAgICAgIHRoaXMucHJvdG9jb2xJRCA9IHByb3RvY29sSUQ7XG4gICAgICAgIHRoaXMucHJvdG9jb2xOYW1lID0gRURERGF0YS5Qcm90b2NvbHNbcHJvdG9jb2xJRF0ubmFtZTtcbiAgICAgICAgdGhpcy5ncmFwaE9iamVjdCA9IG51bGw7XG4gICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy5yZWZyZXNoSURMaXN0KCk7XG4gICAgICAgIHRoaXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTtcbiAgICAgICAgdGhpcy5maW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMoKTtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG5cblxuICAgIHJlZnJlc2hJRExpc3QoKTp2b2lkIHtcbiAgICAgICAgLy8gRmluZCBvdXQgd2hpY2ggcHJvdG9jb2xzIGhhdmUgYXNzYXlzIHdpdGggbWVhc3VyZW1lbnRzIC0gZGlzYWJsZWQgb3Igbm9cbiAgICAgICAgdGhpcy5hc3NheUlEc0luUHJvdG9jb2wgPSBbXTtcbiAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZDpzdHJpbmcsIGFzc2F5OkFzc2F5UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lOkxpbmVSZWNvcmQ7XG4gICAgICAgICAgICBpZiAodGhpcy5wcm90b2NvbElEICE9PSBhc3NheS5waWQpIHtcbiAgICAgICAgICAgICAgICAvLyBza2lwIGFzc2F5cyBmb3Igb3RoZXIgcHJvdG9jb2xzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKCEobGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSkgfHwgIWxpbmUuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgLy8gc2tpcCBhc3NheXMgd2l0aG91dCBhIHZhbGlkIGxpbmUgb3Igd2l0aCBhIGRpc2FibGVkIGxpbmVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hc3NheUlEc0luUHJvdG9jb2wucHVzaChhc3NheS5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKTphbnlbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFzc2F5SURzSW5Qcm90b2NvbDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgYW4gb3ZlcnJpZGUuICBDYWxsZWQgd2hlbiBhIGRhdGEgcmVzdCBpcyB0cmlnZ2VyZWQsIGJ1dCBiZWZvcmUgdGhlIHRhYmxlIHJvd3MgYXJlXG4gICAgLy8gcmVidWlsdC5cbiAgICBvbkRhdGFSZXNldChkYXRhR3JpZDpEYXRhR3JpZCk6dm9pZCB7XG4gICAgICAgIHRoaXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTtcbiAgICAgICAgaWYgKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjICYmIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICQodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkuY2hpbGRyZW4oJzpmaXJzdCcpLnRleHQoXG4gICAgICAgICAgICAgICAgICAgICdNZWFzdXJpbmcgVGltZXMgKFJhbmdlIDAgdG8gJyArIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSArICcpJyk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZSB0YWJsZSBlbGVtZW50IG9uIHRoZSBwYWdlIHRoYXQgd2lsbCBiZSB0dXJuZWQgaW50byB0aGUgRGF0YUdyaWQuICBBbnkgcHJlZXhpc3RpbmcgdGFibGVcbiAgICAvLyBjb250ZW50IHdpbGwgYmUgcmVtb3ZlZC5cbiAgICBnZXRUYWJsZUVsZW1lbnQoKSB7XG4gICAgICAgIHZhciBzZWN0aW9uLCBwcm90b2NvbERpdiwgdGl0bGVEaXYsIHRpdGxlTGluaywgdGFibGUsXG4gICAgICAgICAgICBwID0gdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgdGFibGVJRDpzdHJpbmcgPSAncHJvJyArIHAgKyAnYXNzYXlzdGFibGUnO1xuICAgICAgICAvLyBJZiB3ZSBjYW4ndCBmaW5kIGEgdGFibGUsIHdlIGluc2VydCBhIGNsaWNrLXRvLWRpc2Nsb3NlIGRpdiwgYW5kIHRoZW4gYSB0YWJsZSBkaXJlY3RseVxuICAgICAgICAvLyBhZnRlciBpdC5cbiAgICAgICAgaWYgKCQoJyMnICsgdGFibGVJRCkuc2l6ZSgpID09PSAwKSB7XG4gICAgICAgICAgICBzZWN0aW9uID0gJCgnI2Fzc2F5c1NlY3Rpb24nKTtcbiAgICAgICAgICAgIHByb3RvY29sRGl2ID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZGlzY2xvc2UgZGlzY2xvc2VIaWRlJykuYXBwZW5kVG8oc2VjdGlvbik7XG4gICAgICAgICAgICB0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdiA9IHByb3RvY29sRGl2WzBdO1xuICAgICAgICAgICAgdGl0bGVEaXYgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdzZWN0aW9uQ2hhcHRlcicpLmFwcGVuZFRvKHByb3RvY29sRGl2KTtcbiAgICAgICAgICAgIHRpdGxlTGluayA9ICQoJzxzcGFuPicpLmFkZENsYXNzKCdkaXNjbG9zZUxpbmsnKVxuICAgICAgICAgICAgICAgICAgICAudGV4dCh0aGlzLnByb3RvY29sTmFtZSArICcgQXNzYXlzJylcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKHRpdGxlRGl2KTtcbiAgICAgICAgICAgIHRhYmxlID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGFibGVcIikpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIHRhYmxlSUQpLmFkZENsYXNzKCdkaXNjbG9zZUJvZHknKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8ocHJvdG9jb2xEaXYpO1xuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHRoZSBhY3Rpb25zIHBhbmVsIHJlbWFpbnMgYXQgdGhlIGJvdHRvbS5cbiAgICAgICAgICAgICQoJyNhc3NheXNBY3Rpb25QYW5lbCcpLmFwcGVuZFRvKHNlY3Rpb24pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0YWJsZUlEKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSB0YWJsZSBhcyBhIHdob2xlXG4gICAgZGVmaW5lVGFibGVTcGVjKCk6RGF0YUdyaWRUYWJsZVNwZWMge1xuICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkVGFibGVTcGVjKCdhc3NheXMnK3RoaXMucHJvdG9jb2xJRCwge1xuICAgICAgICAgICAgJ2RlZmF1bHRTb3J0JzogMVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZpbmRNZXRhRGF0YUlEc1VzZWRJbkFzc2F5cygpIHtcbiAgICAgICAgdmFyIHNlZW5IYXNoOmFueSA9IHt9O1xuICAgICAgICB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzID0gW107XG4gICAgICAgIHRoaXMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgICAgICAkLmVhY2goYXNzYXkubWV0YSB8fCB7fSwgKG1ldGFJZCkgPT4geyBzZWVuSGFzaFttZXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBbXS5wdXNoLmFwcGx5KHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMsIE9iamVjdC5rZXlzKHNlZW5IYXNoKSk7XG4gICAgfVxuXG5cbiAgICBmaW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpOnZvaWQge1xuICAgICAgICB2YXIgbWF4Rm9yQWxsOm51bWJlciA9IDA7XG4gICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCByZWNvcmRzXG4gICAgICAgIG1heEZvckFsbCA9IHRoaXMuZ2V0UmVjb3JkSURzKCkucmVkdWNlKChwcmV2Om51bWJlciwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF0sIG1lYXN1cmVzLCBtYXhGb3JSZWNvcmQ7XG4gICAgICAgICAgICBtZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdO1xuICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIG1lYXN1cmVzXG4gICAgICAgICAgICBtYXhGb3JSZWNvcmQgPSBtZWFzdXJlcy5yZWR1Y2UoKHByZXY6bnVtYmVyLCBtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbG9va3VwOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmU6YW55ID0gbG9va3VwW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG1heEZvck1lYXN1cmU7XG4gICAgICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIGRhdGEgaW4gbWVhc3VyZW1lbnRcbiAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlID0gKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBwb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgcG9pbnRbMF1bMF0pO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JNZWFzdXJlKTtcbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIG1heEZvclJlY29yZCk7XG4gICAgICAgIH0sIDApO1xuICAgICAgICAvLyBBbnl0aGluZyBhYm92ZSAwIGlzIGFjY2VwdGFibGUsIGJ1dCAwIHdpbGwgZGVmYXVsdCBpbnN0ZWFkIHRvIDEuXG4gICAgICAgIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSA9IG1heEZvckFsbCB8fCAxO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkQXNzYXlOYW1lKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gSW4gYW4gb2xkIHR5cGljYWwgRURERGF0YS5Bc3NheXMgcmVjb3JkIHRoaXMgc3RyaW5nIGlzIGN1cnJlbnRseSBwcmUtYXNzZW1ibGVkIGFuZCBzdG9yZWRcbiAgICAgICAgLy8gaW4gJ2ZuJy4gQnV0IHdlJ3JlIHBoYXNpbmcgdGhhdCBvdXQuXG4gICAgICAgIHZhciBhc3NheSwgbGluZTtcbiAgICAgICAgaWYgKChhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gW2xpbmUubiwgdGhpcy5wcm90b2NvbE5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkRXhwZXJpbWVudGVySW5pdGlhbHMoaW5kZXg6YW55KTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgaW5kZXggSUQgZXhpc3RzLCBlbnN1cmUgZXhwZXJpbWVudGVyIHVzZXIgSUQgZXhpc3RzLCB1cHBlcmNhc2UgaW5pdGlhbHMgb3IgP1xuICAgICAgICB2YXIgYXNzYXksIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgoZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1thc3NheS5leHBdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRBc3NheU1vZGlmaWNhdGlvbihpbmRleDphbnkpOm51bWJlciB7XG4gICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiArIGluZGV4LCAnaEFzc2F5c01ldGEnK3RoaXMucHJvdG9jb2xJRCsnaWQnICsgaWQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG1kVHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLCBcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5tYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAxXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjID0gbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg4ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAnaEFzc2F5c0dyYXBoJyArIHRoaXMucHJvdG9jb2xJRCwgeyAnY29sc3Bhbic6IDcgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoIH0pO1xuXG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYyxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMSwgJ2hBc3NheXNOYW1lJyt0aGlzLnByb3RvY29sSUQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdOYW1lJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMiwgXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEFzc2F5TmFtZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyA9IG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgJ2hBc3NheXNNVGltZXMnK3RoaXMucHJvdG9jb2xJRCwgeyAnbmFtZSc6ICdNZWFzdXJpbmcgVGltZXMnLCAnaGVhZGVyUm93JzogMiB9KTtcblxuICAgICAgICB2YXIgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNNTmFtZScgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHsgJ25hbWUnOiAnTWVhc3VyZW1lbnQnLCAnaGVhZGVyUm93JzogMiB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzVW5pdHMnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7ICduYW1lJzogJ1VuaXRzJywgJ2hlYWRlclJvdyc6IDIgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c0NvdW50JyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAgeyAnbmFtZSc6ICdDb3VudCcsICdoZWFkZXJSb3cnOiAyIH0pLFxuICAgICAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMsXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c0V4cGVyaW1lbnRlcicgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAxXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNNb2RpZmllZCcgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlNb2RpZmljYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFIZWFkZXJzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBtYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChpKSA9PiB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaV07XG4gICAgICAgICAgICBpZiAocmVjb3JkICYmIHJlY29yZC5tZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZC5tZXRhW2lkXSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gVGhlIGNvbHNwYW4gdmFsdWUgZm9yIGFsbCB0aGUgY2VsbHMgdGhhdCBhcmUgYXNzYXktbGV2ZWwgKG5vdCBtZWFzdXJlbWVudC1sZXZlbCkgaXMgYmFzZWQgb25cbiAgICAvLyB0aGUgbnVtYmVyIG9mIG1lYXN1cmVtZW50cyBmb3IgdGhlIHJlc3BlY3RpdmUgcmVjb3JkLiBTcGVjaWZpY2FsbHksIGl0J3MgdGhlIG51bWJlciBvZlxuICAgIC8vIG1ldGFib2xpdGUgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmUgYXJlIHRyYW5zY3JpcHRvbWljcyBtZWFzdXJlbWVudHMsIHBsdXMgMSBpZiB0aGVyZVxuICAgIC8vIGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50cywgYWxsIGFkZGVkIHRvZ2V0aGVyLiAgKE9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuKVxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCk6bnVtYmVyIHtcbiAgICAgICAgdmFyIHJlYyA9IEVERERhdGEuQXNzYXlzW2luZGV4XTtcbiAgICAgICAgdmFyIHY6bnVtYmVyID0gKChyZWMubWV0YWJvbGl0ZXMgfHwgW10pLmxlbmd0aCArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID8gMSA6IDApICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgocmVjLnByb3RlaW5zIHx8IFtdKS5sZW5ndGggPyAxIDogMCkpIHx8IDE7XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVBc3NheU5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgbGluZSA9IEVERERhdGEuTGluZXNbcmVjb3JkLmxpZF0sIHNpZGVNZW51SXRlbXMgPSBbXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1lZGl0LWxpbmtcIj5FZGl0IEFzc2F5PC9hPicsXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1yZWxvYWQtbGlua1wiPlJlbG9hZCBEYXRhPC9hPicsXG4gICAgICAgICAgICAnPGEgaHJlZj1cIi9leHBvcnQ/YXNzYXlJZD0nICsgaW5kZXggKyAnXCI+RXhwb3J0IERhdGEgYXMgQ1NWL2V0YzwvYT4nXG4gICAgICAgIF07XG4gICAgICAgIC8vIFRPRE8gd2UgcHJvYmFibHkgZG9uJ3Qgd2FudCB0byBzcGVjaWFsLWNhc2UgbGlrZSB0aGlzIGJ5IG5hbWVcbiAgICAgICAgaWYgKGdyaWRTcGVjLnByb3RvY29sTmFtZSA9PSBcIlRyYW5zY3JpcHRvbWljc1wiKSB7XG4gICAgICAgICAgICBzaWRlTWVudUl0ZW1zLnB1c2goJzxhIGhyZWY9XCJpbXBvcnQvcm5hc2VxL2VkZ2Vwcm8/YXNzYXk9JytpbmRleCsnXCI+SW1wb3J0IFJOQS1zZXEgZGF0YSBmcm9tIEVER0UtcHJvPC9hPicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hOYW1lJzogJ2Fzc2F5SWQnLFxuICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6IChpZCkgPT4geyByZXR1cm4gJ2Fzc2F5JyArIGlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogc2lkZU1lbnVJdGVtcyxcbiAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbbGluZS5uYW1lLCBncmlkU3BlYy5wcm90b2NvbE5hbWUsIHJlY29yZC5uYW1lXS5qb2luKCctJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBtYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29udGVudFN0ciA9ICcnLCBhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkgJiYgdHlwZSAmJiBhc3NheS5tZXRhICYmIChjb250ZW50U3RyID0gYXNzYXkubWV0YVtpZF0gfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgY29udGVudFN0ciA9IFsgdHlwZS5wcmUgfHwgJycsIGNvbnRlbnRTdHIsIHR5cGUucG9zdGZpeCB8fCAnJyBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnRTdHJcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgXTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcsXG4gICAgICAgICAgICBvcHQ6YW55KTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBjZWxscyA9IFtdLFxuICAgICAgICAgICAgZmFjdG9yeSA9ICgpOkRhdGFHcmlkRGF0YUNlbGwgPT4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4KTtcblxuICAgICAgICBpZiAoKHJlY29yZC5tZXRhYm9saXRlcyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyAncm93c3Bhbic6IHJlY29yZC5tZXRhYm9saXRlcy5sZW5ndGggfSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IElEcyB0byBtZWFzdXJlbWVudHMsIHNvcnQgYnkgbmFtZSwgdGhlbiBjb252ZXJ0IHRvIGNlbGwgb2JqZWN0c1xuICAgICAgICAgICAgICAgIGNlbGxzID0gcmVjb3JkLm1ldGFib2xpdGVzLm1hcChvcHQubWV0YWJvbGl0ZVRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc29ydChvcHQubWV0YWJvbGl0ZVZhbHVlU29ydClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAob3B0Lm1ldGFib2xpdGVWYWx1ZVRvQ2VsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKChyZWNvcmQuZ2VuZXJhbCB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICB7ICdyb3dzcGFuJzogcmVjb3JkLmdlbmVyYWwubGVuZ3RoIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udmVydCBJRHMgdG8gbWVhc3VyZW1lbnRzLCBzb3J0IGJ5IG5hbWUsIHRoZW4gY29udmVydCB0byBjZWxsIG9iamVjdHNcbiAgICAgICAgICAgICAgICBjZWxscyA9IHJlY29yZC5nZW5lcmFsLm1hcChvcHQubWV0YWJvbGl0ZVRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KG9wdC5tZXRhYm9saXRlVmFsdWVTb3J0KVxuICAgICAgICAgICAgICAgICAgICAubWFwKG9wdC5tZXRhYm9saXRlVmFsdWVUb0NlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIG9ubHkgb25lIGNlbGwgaWYgdGhlcmUgaXMgYW55IHRyYW5zY3JpcHRvbWljcyBkYXRhXG4gICAgICAgIGlmICgocmVjb3JkLnRyYW5zY3JpcHRpb25zIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQudHJhbnNjcmlwdFRvQ2VsbChyZWNvcmQudHJhbnNjcmlwdGlvbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBvbmx5IG9uZSBjZWxsIGlmIHRoZXJlIGlzIGFueSBwcm90ZW9taWNzIGRhdGFcbiAgICAgICAgaWYgKChyZWNvcmQucHJvdGVpbnMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC5wcm90ZWluVG9DZWxsKHJlY29yZC5wcm90ZWlucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIGEgbG9hZGluZyBjZWxsIGlmIG5vbmUgY3JlYXRlZCBieSBtZWFzdXJlbWVudHNcbiAgICAgICAgaWYgKCFjZWxscy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmIChyZWNvcmQuY291bnQpIHtcbiAgICAgICAgICAgICAgICAvLyB3ZSBoYXZlIGEgY291bnQsIGJ1dCBubyBkYXRhIHlldDsgc3RpbGwgbG9hZGluZ1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5lbXB0eSkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LmVtcHR5LmNhbGwoe30pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChmYWN0b3J5KCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjZWxscztcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF07XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjZWxsID0gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIHZhbHVlLmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbWVhc3VyZW1lbnRJZCcsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6ICgpID0+IHsgcmV0dXJuICdtZWFzdXJlbWVudCcgKyB2YWx1ZS5pZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS5uYW1lXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgJChjZWxsLmNoZWNrYm94RWxlbWVudCkudmFsKHZhbHVlLmlkKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VsbDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdUcmFuc2NyaXB0b21pY3MgRGF0YSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdQcm90ZW9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJlbXB0eVwiOiAoKSA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICc8aT5ObyBNZWFzdXJlbWVudHM8L2k+J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZVVuaXRzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgdW5pdDphbnkgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlLnlfdW5pdHNdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAndW5pdCc6IHVuaXQubmFtZSB8fCAnJyB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS51bml0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnUlBLTSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICcnIC8vIFRPRE86IHdoYXQgYXJlIHByb3Rlb21pY3MgbWVhc3VyZW1lbnQgdW5pdHM/XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDb3VudENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICAvLyBmdW5jdGlvbiB0byB1c2UgaW4gQXJyYXkjcmVkdWNlIHRvIGNvdW50IGFsbCB0aGUgdmFsdWVzIGluIGEgc2V0IG9mIG1lYXN1cmVtZW50c1xuICAgICAgICB2YXIgcmVkdWNlQ291bnQgPSAocHJldjpudW1iZXIsIG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHByZXYgKyAobWVhc3VyZS52YWx1ZXMgfHwgW10pLmxlbmd0aDtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAnbWVhc3VyZSc6IG1lYXN1cmUgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsICh2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSkubGVuZ3RoLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCBpZHMucmVkdWNlKHJlZHVjZUNvdW50LCAwKSwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgaWRzLnJlZHVjZShyZWR1Y2VDb3VudCwgMCksICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciB0dXBsZVRpbWVDb3VudCA9ICh2YWx1ZSwga2V5KSA9PiB7IHJldHVybiBbWyBrZXksIHZhbHVlIF1dOyB9LFxuICAgICAgICAgICAgc29ydEJ5VGltZSA9IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IHBhcnNlRmxvYXQoYVswXSksIHogPSBwYXJzZUZsb2F0KGJbMF0pO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdmdDZWxsRm9yVGltZUNvdW50cyA9IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY29uc29saWRhdGVkLCBzdmcgPSAnJywgdGltZUNvdW50ID0ge307XG4gICAgICAgICAgICAgICAgLy8gY291bnQgdmFsdWVzIGF0IGVhY2ggeCBmb3IgYWxsIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgICAgIGlkcy5mb3JFYWNoKChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTphbnlbXSA9IG1lYXN1cmUudmFsdWVzIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICBkYXRhLmZvckVhY2goKHBvaW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lQ291bnRbcG9pbnRbMF1bMF1dID0gdGltZUNvdW50W3BvaW50WzBdWzBdXSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVHlwZXNjcmlwdCBjb21waWxlciBkb2VzIG5vdCBsaWtlIHVzaW5nIGluY3JlbWVudCBvcGVyYXRvciBvbiBleHByZXNzaW9uXG4gICAgICAgICAgICAgICAgICAgICAgICArK3RpbWVDb3VudFtwb2ludFswXVswXV07XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIG1hcCB0aGUgY291bnRzIHRvIFt4LCB5XSB0dXBsZXMsIHNvcnRlZCBieSB4IHZhbHVlXG4gICAgICAgICAgICAgICAgY29uc29saWRhdGVkID0gJC5tYXAodGltZUNvdW50LCB0dXBsZVRpbWVDb3VudCkuc29ydChzb3J0QnlUaW1lKTtcbiAgICAgICAgICAgICAgICAvLyBnZW5lcmF0ZSBTVkcgc3RyaW5nXG4gICAgICAgICAgICAgICAgaWYgKGNvbnNvbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKGNvbnNvbGlkYXRlZCwgJycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN2Z1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAnbWVhc3VyZSc6IG1lYXN1cmUgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZSA9IHZhbHVlLm1lYXN1cmUgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdCA9IG1lYXN1cmUuZm9ybWF0ID09PSAxID8gJ2NhcmJvbicgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgZGF0YSA9IHZhbHVlLm1lYXN1cmUudmFsdWVzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICBzdmcgPSBncmlkU3BlYy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMoZGF0YSwgZm9ybWF0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiBzdmdDZWxsRm9yVGltZUNvdW50cyxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHNcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUV4cGVyaW1lbnRlckNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgZXhwID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLmV4cDtcbiAgICAgICAgdmFyIHVSZWNvcmQgPSBFREREYXRhLlVzZXJzW2V4cF07XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdVJlY29yZCA/IHVSZWNvcmQuaW5pdGlhbHMgOiAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyhFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhwb2ludHMsIGZvcm1hdDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzdmcgPSAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmVyc2lvbj1cIjEuMlwiIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwcHhcIlxcXG4gICAgICAgICAgICAgICAgICAgIHZpZXdCb3g9XCIwIDAgNDcwIDEwXCIgcHJlc2VydmVBc3BlY3RSYXRpbz1cIm5vbmVcIj5cXFxuICAgICAgICAgICAgICAgIDxzdHlsZSB0eXBlPVwidGV4dC9jc3NcIj48IVtDREFUQVtcXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNQIHsgc3Ryb2tlOnJnYmEoMCwwLDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jViB7IHN0cm9rZTpyZ2JhKDAsMCwyMzAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jRSB7IHN0cm9rZTpyZ2JhKDI1NSwxMjgsMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICBdXT48L3N0eWxlPlxcXG4gICAgICAgICAgICAgICAgPHBhdGggZmlsbD1cInJnYmEoMCwwLDAsMC4wLjA1KVwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZT1cInJnYmEoMCwwLDAsMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBkPVwiTTEwLDVoNDUwXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9XCJzdHJva2Utd2lkdGg6MnB4O1wiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZS13aWR0aD1cIjJcIj48L3BhdGg+JztcbiAgICAgICAgdmFyIHBhdGhzID0gWyBzdmcgXTtcbiAgICAgICAgcG9pbnRzLnNvcnQoKGEsYikgPT4geyByZXR1cm4gYVswXSAtIGJbMF07IH0pLmZvckVhY2goKHBvaW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgeCA9IHBvaW50WzBdWzBdLFxuICAgICAgICAgICAgICAgIHkgPSBwb2ludFsxXVswXSxcbiAgICAgICAgICAgICAgICByeCA9ICgoeCAvIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSkgKiA0NTApICsgMTAsXG4gICAgICAgICAgICAgICAgdHQgPSBbeSwgJyBhdCAnLCB4LCAnaCddLmpvaW4oJycpO1xuICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY0VcIiBkPVwiTScsIHJ4LCAnLDV2NFwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICBpZiAoeSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJywydjZcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNQXCIgZD1cIk0nLCByeCwgJywxdjRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKGZvcm1hdCA9PT0gJ2NhcmJvbicpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjVlwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcGF0aHMucHVzaCgnPC9zdmc+Jyk7XG4gICAgICAgIHJldHVybiBwYXRocy5qb2luKCdcXG4nKTtcbiAgICB9XG4gICAgXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgbWV0YURhdGFDb2xzOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgcmlnaHRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdO1xuICAgICAgICAvLyBhZGQgY2xpY2sgaGFuZGxlciBmb3IgbWVudSBvbiBhc3NheSBuYW1lIGNlbGxzXG4gICAgICAgICQodGhpcy50YWJsZUVsZW1lbnQpLm9uKCdjbGljaycsICdhLmFzc2F5LWVkaXQtbGluaycsIChldikgPT4ge1xuICAgICAgICAgICAgU3R1ZHlELmVkaXRBc3NheSgkKGV2LnRhcmdldCkuY2xvc2VzdCgnLnBvcHVwY2VsbCcpLmZpbmQoJ2lucHV0JykudmFsKCkpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnYS5hc3NheS1yZWxvYWQtbGluaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBpZCA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSxcbiAgICAgICAgICAgICAgICBhc3NheTpBc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW2lkXTtcbiAgICAgICAgICAgIGlmIChhc3NheSkge1xuICAgICAgICAgICAgICAgIFN0dWR5RC5yZXF1ZXN0QXNzYXlEYXRhKGFzc2F5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxlZnRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCB0aGlzLmdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMpXG4gICAgICAgICAgIF07XG5cbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyICsgaW5kZXgsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcblxuICAgICAgICByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZVVuaXRzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg0ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUNvdW50Q2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg1ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNyArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUNvbHMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICB2YXIgdG9wU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHZhciBtZXRhRGF0YUNvbEdyb3VwczpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgICAgICBtZXRhRGF0YUNvbEdyb3VwcyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmVtZW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnVW5pdHMnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDb3VudCcsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmluZyBUaW1lcycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc3Vic3RyaW5nIHNlYXJjaGluZ1xuICAgICAgICB2YXIgc2VhcmNoQXNzYXlzV2lkZ2V0ID0gbmV3IERHQXNzYXlzU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIEFzc2F5cycsIDMwLFxuICAgICAgICAgICAgICAgIGZhbHNlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VhcmNoQXNzYXlzV2lkZ2V0KTtcbiAgICAgICAgLy8gQSBcInNlbGVjdCBhbGxcIiBidXR0b25cbiAgICAgICAgdmFyIHNlbGVjdEFsbFdpZGdldCA9IG5ldyBER1NlbGVjdEFsbFdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNlbGVjdEFsbFdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlbGVjdEFsbFdpZGdldCk7XG5cbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBBc3NheXNcbiAgICAgICAgdmFyIGRpc2FibGVkQXNzYXlzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRBc3NheXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZEFzc2F5c1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWRBc3NheXMpOnZvaWQge1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlICdhY3Rpb24gcGFuZWxzJyBmb3IgdGhlIEFzc2F5cyBzZWN0aW9uc1xuICAgICAgICB2YXIgdGFibGUgPSB0aGlzLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICAkKHRhYmxlKS5vbignY2hhbmdlJywgJzpjaGVja2JveCcsICgpID0+IFN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpKTtcblxuICAgICAgICBpZiAodGhpcy51bmRpc2Nsb3NlZFNlY3Rpb25EaXYpIHtcbiAgICAgICAgICAgICQodGhpcy51bmRpc2Nsb3NlZFNlY3Rpb25EaXYpLmNsaWNrKCgpID0+IGRhdGFHcmlkLmNsaWNrZWREaXNjbG9zZSh0cnVlKSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcCA9IHRoaXMucHJvdG9jb2xJRDtcbiAgICAgICAgdmFyIGdyYXBoaWQgPSBcInByb1wiICsgcCArIFwiZ3JhcGhcIjtcbiAgICAgICAgaWYgKHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYykge1xuICAgICAgICAgICAgaWYgKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAkKHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYy5lbGVtZW50KS5odG1sKCc8ZGl2IGlkPVwiJyArIGdyYXBoaWQgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1wiIGNsYXNzPVwiZ3JhcGhDb250YWluZXJcIj48L2Rpdj4nKTtcbiAgICAgICAgICAgICAgICAvLyBJbml0aWFsaXplIHRoZSBncmFwaCBvYmplY3RcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoT2JqZWN0ID0gT2JqZWN0LmNyZWF0ZShTdHVkeURHcmFwaGluZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5ncmFwaE9iamVjdC5TZXR1cChncmFwaGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBSdW4gaXQgb25jZSBpbiBjYXNlIHRoZSBwYWdlIHdhcyBnZW5lcmF0ZWQgd2l0aCBjaGVja2VkIEFzc2F5c1xuICAgICAgICBTdHVkeUQucXVldWVBc3NheXNBY3Rpb25QYW5lbFNob3coKTtcbiAgICB9XG59XG5cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIEFzc2F5cyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkQXNzYXlzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydTaG93REFzc2F5c0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayggKGUpID0+IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ1Nob3cgRGlzYWJsZWQnLCBjYklEKTs7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IHRydWU7XG4gICAgfVxuXG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIC8vIElmIHRoZSBib3ggaXMgY2hlY2tlZCwgcmV0dXJuIHRoZSBzZXQgb2YgSURzIHVuZmlsdGVyZWRcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZmlsdGVyZWRJRHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCByb3dJRHMubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHJvd0lEc1tyXTtcbiAgICAgICAgICAgIC8vIEhlcmUgaXMgdGhlIGNvbmRpdGlvbiB0aGF0IGRldGVybWluZXMgd2hldGhlciB0aGUgcm93cyBhc3NvY2lhdGVkIHdpdGggdGhpcyBJRCBhcmVcbiAgICAgICAgICAgIC8vIHNob3duIG9yIGhpZGRlbi5cbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5c1tpZF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChpZCk7ICAgICAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkSURzO1xuICAgIH1cblxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDphbnkpOmFueSB7XG4gICAgICAgIGlmICghRURERGF0YS5Bc3NheXNbcm93SURdLmFjdGl2ZSkge1xuICAgICAgICAgICAgJC5lYWNoKGRhdGFSb3dPYmplY3RzLCAoeCwgcm93KSA9PiAkKHJvdy5nZXRFbGVtZW50KCkpLmFkZENsYXNzKCdkaXNhYmxlZFJlY29yZCcpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbi8vIFRoaXMgaXMgYSBEYXRhR3JpZEhlYWRlcldpZGdldCBkZXJpdmVkIGZyb20gREdTZWFyY2hXaWRnZXQuIEl0J3MgYSBzZWFyY2ggZmllbGQgdGhhdCBvZmZlcnNcbi8vIG9wdGlvbnMgZm9yIGFkZGl0aW9uYWwgZGF0YSB0eXBlcywgcXVlcnlpbmcgdGhlIHNlcnZlciBmb3IgcmVzdWx0cy5cbmNsYXNzIERHQXNzYXlzU2VhcmNoV2lkZ2V0IGV4dGVuZHMgREdTZWFyY2hXaWRnZXQge1xuXG4gICAgc2VhcmNoRGlzY2xvc3VyZUVsZW1lbnQ6YW55O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OmFueSwgZGF0YUdyaWRTcGVjOmFueSwgcGxhY2VIb2xkZXI6c3RyaW5nLCBzaXplOm51bWJlcixcbiAgICAgICAgICAgIGdldHNGb2N1czpib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYywgcGxhY2VIb2xkZXIsIHNpemUsIGdldHNGb2N1cyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9ucyB3aGVuIGNyZWF0aW5nIGlucHV0XG4gICAgLy8gZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBzdXBlci5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC4gSWYgdGhlIGVsZW1lbnRzIGhhdmVcbiAgICAvLyBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOmFueSwgdW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cygpKSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICB9XG59XG5cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoKCkgPT4gU3R1ZHlELnByZXBhcmVJdCgpKTtcblxuIl19