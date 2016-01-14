// Compiled to JS on: Thu Jan 14 2016 04:39:33  
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
                return new DataGridDataCell(gridSpec, index, {
                    'hoverEffect': true,
                    'checkboxName': 'measurementId',
                    'checkboxWithID': function () { return 'measurement' + value.id + 'include'; },
                    'contentString': value.name
                });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS50cyJdLCJuYW1lcyI6WyJTdHVkeUQiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY29uc3RydWN0b3IiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJlcGFyZUZpbHRlcmluZ1NlY3Rpb24iLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24iLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzIiwiU3R1ZHlELlByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkQXNzYXlJRFNldCIsIlN0dWR5RC5Qcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzIiwiU3R1ZHlELlByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmNoZWNrUmVkcmF3UmVxdWlyZWQiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24iLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmNyZWF0ZUNvbnRhaW5lck9iamVjdHMiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24ucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmlzRmlsdGVyVXNlZnVsIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFkZFRvUGFyZW50IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFwcGx5QmFja2dyb3VuZFN0eWxlIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLnBvcHVsYXRlVGFibGUiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmciLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uX2Fzc2F5SWRUb0Fzc2F5IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLl9hc3NheUlkVG9MaW5lIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLl9hc3NheUlkVG9Qcm90b2NvbCIsIlN0dWR5RC5HZW5lcmljRmlsdGVyU2VjdGlvbi5nZXRJZE1hcFRvVmFsdWVzIiwiU3R1ZHlELlN0cmFpbkZpbHRlclNlY3Rpb24iLCJTdHVkeUQuU3RyYWluRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5TdHJhaW5GaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5TdHJhaW5GaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkNhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5DYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5DYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkNhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5DYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5DYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuTGluZU5hbWVGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELkxpbmVOYW1lRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5MaW5lTmFtZUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkxpbmVOYW1lRmlsdGVyU2VjdGlvbi51cGRhdGVVbmlxdWVJbmRleGVzSGFzaCIsIlN0dWR5RC5Qcm90b2NvbEZpbHRlclNlY3Rpb24iLCJTdHVkeUQuUHJvdG9jb2xGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELlByb3RvY29sRmlsdGVyU2VjdGlvbi5jb25maWd1cmUiLCJTdHVkeUQuUHJvdG9jb2xGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkFzc2F5U3VmZml4RmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5Bc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5Bc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuTWV0YURhdGFGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELk1ldGFEYXRhRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5NZXRhRGF0YUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkxpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5MaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24iLCJTdHVkeUQuTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5NZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5NZWFzdXJlbWVudEZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZWFzdXJlbWVudEZpbHRlclNlY3Rpb24uaXNGaWx0ZXJVc2VmdWwiLCJTdHVkeUQuTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZXRhYm9saXRlRmlsdGVyU2VjdGlvbi5pc0ZpbHRlclVzZWZ1bCIsIlN0dWR5RC5NZXRhYm9saXRlRmlsdGVyU2VjdGlvbi51cGRhdGVVbmlxdWVJbmRleGVzSGFzaCIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbi5jb25maWd1cmUiLCJTdHVkeUQuUHJvdGVpbkZpbHRlclNlY3Rpb24uaXNGaWx0ZXJVc2VmdWwiLCJTdHVkeUQuUHJvdGVpbkZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkdlbmVGaWx0ZXJTZWN0aW9uLmlzRmlsdGVyVXNlZnVsIiwiU3R1ZHlELkdlbmVGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELnByZXBhcmVJdCIsIlN0dWR5RC5wcmVwYXJlUGVybWlzc2lvbnMiLCJTdHVkeUQucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhIiwiU3R1ZHlELmZpbHRlclRhYmxlS2V5RG93biIsIlN0dWR5RC5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlIiwiU3R1ZHlELnJlcXVlc3RBbGxNZXRhYm9saXRlRGF0YSIsIlN0dWR5RC5yZXF1ZXN0QXNzYXlEYXRhIiwiU3R1ZHlELnByb2Nlc3NNZWFzdXJlbWVudERhdGEiLCJTdHVkeUQuY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2siLCJTdHVkeUQucXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5saW5lc0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5hc3NheXNBY3Rpb25QYW5lbFNob3ciLCJTdHVkeUQucXVldWVNYWluR3JhcGhSZW1ha2UiLCJTdHVkeUQucmVtYWtlTWFpbkdyYXBoQXJlYSIsIlN0dWR5RC5jbGVhckFzc2F5Rm9ybSIsIlN0dWR5RC5jbGVhckxpbmVGb3JtIiwiU3R1ZHlELmZpbGxBc3NheUZvcm0iLCJTdHVkeUQuZmlsbExpbmVGb3JtIiwiU3R1ZHlELnNjcm9sbFRvRm9ybSIsIlN0dWR5RC51cGRhdGVVSUFzc2F5Rm9ybSIsIlN0dWR5RC51cGRhdGVVSUxpbmVGb3JtIiwiU3R1ZHlELmluc2VydExpbmVNZXRhZGF0YVJvdyIsIlN0dWR5RC5lZGl0QXNzYXkiLCJTdHVkeUQuZWRpdExpbmUiLCJTdHVkeUQub25DaGFuZ2VkTWV0YWJvbGljTWFwIiwiU3R1ZHlELnJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzIiwiU3R1ZHlELm9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUiLCJEYXRhR3JpZFNwZWNMaW5lcyIsIkRhdGFHcmlkU3BlY0xpbmVzLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRTcGVjTGluZXMuaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCIsIkRhdGFHcmlkU3BlY0xpbmVzLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQiLCJEYXRhR3JpZFNwZWNMaW5lcy5maW5kTWV0YURhdGFJRHNVc2VkSW5MaW5lcyIsIkRhdGFHcmlkU3BlY0xpbmVzLmZpbmRHcm91cElEc0FuZE5hbWVzIiwiRGF0YUdyaWRTcGVjTGluZXMuZGVmaW5lVGFibGVTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZExpbmVOYW1lIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZFN0cmFpbk5hbWUiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkRmlyc3RDYXJib25Tb3VyY2UiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkQ2FyYm9uU291cmNlIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZENhcmJvblNvdXJjZUxhYmVsaW5nIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZEV4cGVyaW1lbnRlckluaXRpYWxzIiwiRGF0YUdyaWRTcGVjTGluZXMubG9hZExpbmVNb2RpZmljYXRpb24iLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVIZWFkZXJTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uIiwiRGF0YUdyaWRTcGVjTGluZXMucm93U3BhbkZvclJlY29yZCIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlTGluZU5hbWVDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlU3RyYWluTmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2VuZXJhdGVDYXJib25Tb3VyY2VDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlQ2FyYm9uQmFsYW5jZUJsYW5rQ2VsbHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLm1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24iLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVDb2x1bW5TcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMuZGVmaW5lUm93R3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2V0VGFibGVFbGVtZW50IiwiRGF0YUdyaWRTcGVjTGluZXMuZ2V0UmVjb3JkSURzIiwiRGF0YUdyaWRTcGVjTGluZXMuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY0xpbmVzLmNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzIiwiRGF0YUdyaWRTcGVjTGluZXMub25Jbml0aWFsaXplZCIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldCIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldC5jb25zdHJ1Y3RvciIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHRGlzYWJsZWRMaW5lc1dpZGdldC5hcHBseUZpbHRlclRvSURzIiwiREdEaXNhYmxlZExpbmVzV2lkZ2V0LmluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEIiwiREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldCIsIkRHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQuY29uc3RydWN0b3IiLCJER0dyb3VwU3R1ZHlSZXBsaWNhdGVzV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdMaW5lc1NlYXJjaFdpZGdldCIsIkRHTGluZXNTZWFyY2hXaWRnZXQuY29uc3RydWN0b3IiLCJER0xpbmVzU2VhcmNoV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdMaW5lc1NlYXJjaFdpZGdldC5hcHBlbmRFbGVtZW50cyIsIkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQiLCJER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuaGlnaGxpZ2h0IiwiREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldC5lbmFibGUiLCJER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0LmFjdGl2YXRlQ2FyYm9uQmFsYW5jZSIsIkRhdGFHcmlkQXNzYXlzIiwiRGF0YUdyaWRBc3NheXMuY29uc3RydWN0b3IiLCJEYXRhR3JpZEFzc2F5cy5pbnZhbGlkYXRlQXNzYXlSZWNvcmRzIiwiRGF0YUdyaWRBc3NheXMuY2xpY2tlZERpc2Nsb3NlIiwiRGF0YUdyaWRBc3NheXMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2giLCJEYXRhR3JpZEFzc2F5cy5fY2FuY2VsR3JhcGgiLCJEYXRhR3JpZEFzc2F5cy5xdWV1ZUdyYXBoUmVtYWtlIiwiRGF0YUdyaWRBc3NheXMucmVtYWtlR3JhcGhBcmVhIiwiRGF0YUdyaWRBc3NheXMucmVzaXplR3JhcGgiLCJEYXRhR3JpZFNwZWNBc3NheXMiLCJEYXRhR3JpZFNwZWNBc3NheXMuY29uc3RydWN0b3IiLCJEYXRhR3JpZFNwZWNBc3NheXMucmVmcmVzaElETGlzdCIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZXRSZWNvcmRJRHMiLCJEYXRhR3JpZFNwZWNBc3NheXMub25EYXRhUmVzZXQiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2V0VGFibGVFbGVtZW50IiwiRGF0YUdyaWRTcGVjQXNzYXlzLmRlZmluZVRhYmxlU3BlYyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5maW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEiLCJEYXRhR3JpZFNwZWNBc3NheXMubG9hZEFzc2F5TmFtZSIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMubG9hZEFzc2F5TW9kaWZpY2F0aW9uIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmRlZmluZUhlYWRlclNwZWMiLCJEYXRhR3JpZFNwZWNBc3NheXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uIiwiRGF0YUdyaWRTcGVjQXNzYXlzLnJvd1NwYW5Gb3JSZWNvcmQiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlVW5pdHNDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZUNvdW50Q2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmRlZmluZUNvbHVtblNwZWMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMiLCJEYXRhR3JpZFNwZWNBc3NheXMub25Jbml0aWFsaXplZCIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQiLCJER0Rpc2FibGVkQXNzYXlzV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdEaXNhYmxlZEFzc2F5c1dpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQuYXBwbHlGaWx0ZXJUb0lEcyIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQiLCJER0Fzc2F5c1NlYXJjaFdpZGdldCIsIkRHQXNzYXlzU2VhcmNoV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdBc3NheXNTZWFyY2hXaWRnZXQuY3JlYXRlRWxlbWVudHMiLCJER0Fzc2F5c1NlYXJjaFdpZGdldC5hcHBlbmRFbGVtZW50cyJdLCJtYXBwaW5ncyI6IkFBQUEsZ0RBQWdEO0FBQ2hELDRDQUE0QztBQUM1QywrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLGdEQUFnRDtBQUNoRCwyQ0FBMkM7QUFDM0Msb0NBQW9DO0FBQ3BDLHlDQUF5Qzs7Ozs7O0FBSXpDLElBQU8sTUFBTSxDQTR0RFo7QUE1dERELFdBQU8sTUFBTSxFQUFDLENBQUM7SUFDWEEsWUFBWUEsQ0FBQ0E7SUFFYkEsSUFBSUEsZUFBbUJBLENBQUNBO0lBQ3hCQSxJQUFJQSwwQkFBc0RBLENBQUNBO0lBRTNEQSxJQUFJQSx1QkFBMkJBLENBQUNBO0lBRWhDQSxJQUFJQSw0QkFBZ0NBLENBQUNBO0lBQ3JDQSxJQUFJQSw2QkFBaUNBLENBQUNBO0lBRXRDQSxJQUFJQSxhQUFpQkEsQ0FBQ0E7SUFDdEJBLElBQUlBLGVBQW1CQSxDQUFDQTtJQUN4QkEsSUFBSUEsMEJBQThCQSxDQUFDQTtJQVFu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QSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQTtnQkFDM0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO29CQUFDQSxNQUFNQSxDQUFDQTtnQkFDcENBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7b0JBQUNBLE1BQU1BLENBQUNBO2dCQUNsQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkJBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO2dCQUNyQ0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUM5QkEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDckNBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxD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Q0FBQ0E7WUFDN0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0EsV0FBV0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdkVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDakVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDN0VBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSwwQ0FBMENBO2dCQUMxQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLENBQUNBO1FBQ0xBLENBQUNBLENBQUNBLENBQUNBO1FBRUhBLE9BQU9BLENBQUNBLDBCQUEwQkEsQ0FBQ0EsaUNBQWlDQSxDQUFDQSxJQUFJ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QSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQzdEQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQzdHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQy9EQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO1FBQ3hHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw2QkFBNkJBLENBQUNBLENBQUNBLEdBQUdBLENBQ3BDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFDQSxDQUFDQSxJQUFLQSxPQUFBQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUF3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsRUFBNURBLENBQTREQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0RUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUM5QkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsQ0FBQ0EsSUFBS0EsT0FBQUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBa0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLEVBQXJEQSxDQUFxREEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbkdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FDOUJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLENBQUNBLElBQUtBLE9BQUFBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLElBQWtCQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxFQUFFQSxFQUExREEsQ0FBMERBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hHQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxJ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QSw0RUFBNEVBO0lBQzVFQSw2Q0FBY0EsR0FBZEEsVUFBZUEsU0FBYUEsRUFBRUEsUUFBWUE7UUFDdENHLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFDREEsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBQ0xILDJCQUFDQTtBQUFEQSxDQUFDQSxBQTNCRCxFQUFtQyxjQUFjLEVBMkJoRDtBQUdELHVFQUF1RTtBQUN2RSxDQUFDLENBQUMsY0FBTSxPQUFBLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBbEIsQ0FBa0IsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29tcGlsZWQgdG8gSlMgb246IFRodSBKYW4gMTQgMjAxNiAwNDozOTozMyAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRURERGF0YUludGVyZmFjZS50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEcmFnYm94ZXMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJpb21hc3NDYWxjdWxhdGlvblVJLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJDYXJib25TdW1tYXRpb24udHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRhdGFHcmlkLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJTdHVkeUdyYXBoaW5nLnRzXCIgLz5cblxuZGVjbGFyZSB2YXIgRURERGF0YTpFREREYXRhO1xuXG5tb2R1bGUgU3R1ZHlEIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgbWFpbkdyYXBoT2JqZWN0OmFueTtcbiAgICB2YXIgcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQ6IFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0O1xuXG4gICAgdmFyIG1haW5HcmFwaFJlZnJlc2hUaW1lcklEOmFueTtcblxuICAgIHZhciBsaW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyOmFueTtcbiAgICB2YXIgYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXI6YW55O1xuXG4gICAgdmFyIGF0dGFjaG1lbnRJRHM6YW55O1xuICAgIHZhciBhdHRhY2htZW50c0J5SUQ6YW55O1xuICAgIHZhciBwcmV2RGVzY3JpcHRpb25FZGl0RWxlbWVudDphbnk7XG5cbiAgICAvLyBXZSBjYW4gaGF2ZSBhIHZhbGlkIG1ldGFib2xpYyBtYXAgYnV0IG5vIHZhbGlkIGJpb21hc3MgY2FsY3VsYXRpb24uXG4gICAgLy8gSWYgdGhleSB0cnkgdG8gc2hvdyBjYXJib24gYmFsYW5jZSBpbiB0aGF0IGNhc2UsIHdlJ2xsIGJyaW5nIHVwIHRoZSBVSSB0byBcbiAgICAvLyBjYWxjdWxhdGUgYmlvbWFzcyBmb3IgdGhlIHNwZWNpZmllZCBtZXRhYm9saWMgbWFwLlxuICAgIGV4cG9ydCB2YXIgbWV0YWJvbGljTWFwSUQ6YW55O1xuICAgIGV4cG9ydCB2YXIgbWV0YWJvbGljTWFwTmFtZTphbnk7XG4gICAgZXhwb3J0IHZhciBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyO1xuICAgIHZhciBjYXJib25CYWxhbmNlRGF0YTphbnk7XG4gICAgdmFyIGNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaDpib29sZWFuO1xuXG4gICAgdmFyIGNTb3VyY2VFbnRyaWVzOmFueTtcbiAgICB2YXIgbVR5cGVFbnRyaWVzOmFueTtcblxuICAgIC8vIFRoZSB0YWJsZSBzcGVjIG9iamVjdCBhbmQgdGFibGUgb2JqZWN0IGZvciB0aGUgTGluZXMgdGFibGUuXG4gICAgdmFyIGxpbmVzRGF0YUdyaWRTcGVjO1xuICAgIHZhciBsaW5lc0RhdGFHcmlkO1xuICAgIC8vIFRhYmxlIHNwZWMgYW5kIHRhYmxlIG9iamVjdHMsIG9uZSBlYWNoIHBlciBQcm90b2NvbCwgZm9yIEFzc2F5cy5cbiAgICB2YXIgYXNzYXlzRGF0YUdyaWRTcGVjcztcbiAgICB2YXIgYXNzYXlzRGF0YUdyaWRzO1xuXG5cbiAgICAvLyBVdGlsaXR5IGludGVyZmFjZSB1c2VkIGJ5IEdlbmVyaWNGaWx0ZXJTZWN0aW9uI3VwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoXG4gICAgZXhwb3J0IGludGVyZmFjZSBWYWx1ZVRvVW5pcXVlSUQge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcjtcbiAgICB9XG4gICAgZXhwb3J0IGludGVyZmFjZSBWYWx1ZVRvVW5pcXVlTGlzdCB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogbnVtYmVyW107XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVW5pcXVlSURUb1ZhbHVlIHtcbiAgICAgICAgW2luZGV4OiBudW1iZXJdOiBzdHJpbmc7XG4gICAgfVxuICAgIC8vIFVzZWQgaW4gUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQjcHJlcGFyZUZpbHRlcmluZ1NlY3Rpb25cbiAgICBleHBvcnQgaW50ZXJmYWNlIFJlY29yZElEVG9Cb29sZWFuIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBib29sZWFuO1xuICAgIH1cblxuXG4gICAgLy8gRm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiBvbiB0aGUgbWFpbiBncmFwaFxuICAgIGV4cG9ydCBjbGFzcyBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCB7XG5cbiAgICAgICAgYWxsRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgYXNzYXlGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBrZWVwIGEgc2VwYXJhdGUgZmlsdGVyIGxpc3QgZm9yIGVhY2ggdHlwZS5cbiAgICAgICAgbWV0YWJvbGl0ZUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIHByb3RlaW5GaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBnZW5lRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgbWVhc3VyZW1lbnRGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuXG4gICAgICAgIG1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBwcm90ZWluRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcbiAgICAgICAgZ2VuZURhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVyaWNEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuXG4gICAgICAgIHN0dWR5RE9iamVjdDogYW55O1xuICAgICAgICBtYWluR3JhcGhPYmplY3Q6IGFueTtcblxuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGluaXRpYWxpemUgZWFjaCBmaWx0ZXIgbGlzdC5cbiAgICAgICAgY29uc3RydWN0b3Ioc3R1ZHlET2JqZWN0OiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5zdHVkeURPYmplY3QgPSBzdHVkeURPYmplY3Q7XG5cbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkRhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmVhZCB0aHJvdWdoIHRoZSBMaW5lcywgQXNzYXlzLCBhbmQgQXNzYXlNZWFzdXJlbWVudHMgc3RydWN0dXJlcyB0byBsZWFybiB3aGF0IHR5cGVzIGFyZSBwcmVzZW50LFxuICAgICAgICAvLyB0aGVuIGluc3RhbnRpYXRlIHRoZSByZWxldmFudCBzdWJjbGFzc2VzIG9mIEdlbmVyaWNGaWx0ZXJTZWN0aW9uLCB0byBjcmVhdGUgYSBzZXJpZXMgb2ZcbiAgICAgICAgLy8gY29sdW1ucyBmb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIHVuZGVyIHRoZSBtYWluIGdyYXBoIG9uIHRoZSBwYWdlLlxuICAgICAgICAvLyBUaGlzIG11c3QgYmUgb3V0c2lkZSB0aGUgY29uc3RydWN0b3IgYmVjYXVzZSBFREREYXRhLkxpbmVzIGFuZCBFREREYXRhLkFzc2F5cyBhcmUgbm90IGltbWVkaWF0ZWx5IGF2YWlsYWJsZVxuICAgICAgICAvLyBvbiBwYWdlIGxvYWQuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGNyZWF0ZSBhbmQgYWRkIHJlbGV2YW50IGZpbHRlcnMgZm9yIGVhY2ggZ3JvdXAuXG4gICAgICAgIHByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgc2VlbkluTGluZXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5JbkFzc2F5c0hhc2g6IFJlY29yZElEVG9Cb29sZWFuID0ge307XG4gICAgICAgICAgICB2YXIgYUlEc1RvVXNlOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgICAgICAvLyBGaXJzdCBkbyBzb21lIGJhc2ljIHNhbml0eSBmaWx0ZXJpbmcgb24gdGhlIGxpc3RcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQ6IHN0cmluZywgYXNzYXk6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlIHx8ICFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS5tZXRhIHx8IFtdLCAobWV0YWRhdGFJZCkgPT4geyBzZWVuSW5Bc3NheXNIYXNoW21ldGFkYXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGxpbmUubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluTGluZXNIYXNoW21ldGFkYXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgICAgICAgICAgYUlEc1RvVXNlLnB1c2goYXNzYXlJZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGZpbHRlcnMgb24gYXNzYXkgdGFibGVzXG4gICAgICAgICAgICAvLyBUT0RPIG1lZGlhIGlzIG5vdyBhIG1ldGFkYXRhIHR5cGUsIHN0cmFpbiBhbmQgY2FyYm9uIHNvdXJjZSBzaG91bGQgYmUgdG9vXG4gICAgICAgICAgICB2YXIgYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgU3RyYWluRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IENhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGZvciAodmFyIGlkIGluIHNlZW5JbkxpbmVzSGFzaCkge1xuICAgICAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBMaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uKGlkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgTGluZU5hbWVGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFByb3RvY29sRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBBc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBmb3IgKHZhciBpZCBpbiBzZWVuSW5Bc3NheXNIYXNoKSB7XG4gICAgICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IEFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uKGlkKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFdlIGNhbiBpbml0aWFsaXplIGFsbCB0aGUgQXNzYXktIGFuZCBMaW5lLWxldmVsIGZpbHRlcnMgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gYXNzYXlGaWx0ZXJzO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLmZvckVhY2goKGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlci5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoYUlEc1RvVXNlKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMucHVzaChuZXcgUHJvdGVpbkZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMucHVzaChuZXcgR2VuZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5wdXNoKG5ldyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycyA9IFtdLmNvbmNhdChcbiAgICAgICAgICAgICAgICBhc3NheUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMpO1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCBmaWx0ZXJzIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiwgYW5kIGFkZCBpbiB0aGUgb25lcyB0aGF0XG4gICAgICAgIC8vIGNsYWltIHRvIGJlIFwidXNlZnVsXCIuXG4gICAgICAgIHJlcG9wdWxhdGVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHRhYmxlID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZmlsdGVyVGFibGUnKS5hcHBlbmRUbygkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5lbXB0eSgpKTtcbiAgICAgICAgICAgIHZhciBkYXJrOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCB3aWRnZXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAod2lkZ2V0LmlzRmlsdGVyVXNlZnVsKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFkZFRvUGFyZW50KHRhYmxlWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFwcGx5QmFja2dyb3VuZFN0eWxlKGRhcmspO1xuICAgICAgICAgICAgICAgICAgICBkYXJrID0gIWRhcms7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdpdmVuIGEgc2V0IG9mIG1lYXN1cmVtZW50IHJlY29yZHMgYW5kIGEgZGljdGlvbmFyeSBvZiBjb3JyZXNwb25kaW5nIHR5cGVzXG4gICAgICAgIC8vIChwYXNzZWQgZG93biBmcm9tIHRoZSBzZXJ2ZXIgYXMgYSByZXN1bHQgb2YgYSBkYXRhIHJlcXVlc3QpLCBzb3J0IHRoZW0gaW50b1xuICAgICAgICAvLyB0aGVpciB2YXJpb3VzIGNhdGVnb3JpZXMsIHRoZW4gcGFzcyBlYWNoIGNhdGVnb3J5IHRvIHRoZWlyIHJlbGV2YW50IGZpbHRlciBvYmplY3RzXG4gICAgICAgIC8vIChwb3NzaWJseSBhZGRpbmcgdG8gdGhlIHZhbHVlcyBpbiB0aGUgZmlsdGVyKSBhbmQgcmVmcmVzaCB0aGUgVUkgZm9yIGVhY2ggZmlsdGVyLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBwcm9jZXNzIGVhY2ggZ3JvdXAgc2VwYXJhdGVseSBoZXJlLlxuICAgICAgICBwcm9jZXNzSW5jb21pbmdNZWFzdXJlbWVudFJlY29yZHMobWVhc3VyZXMsIHR5cGVzKTogdm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBwcm9jZXNzOiAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKSA9PiB2b2lkO1xuXG4gICAgICAgICAgICB2YXIgZmlsdGVySWRzID0geyAnbSc6IFtdLCAncCc6IFtdLCAnZyc6IFtdLCAnXyc6IFtdIH07XG5cbiAgICAgICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgICQuZWFjaChtZWFzdXJlcyB8fCB7fSwgKGluZGV4LCBtZWFzdXJlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheSB8fCAhYXNzYXkuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbXR5cGUgPSB0eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJJZHMubS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLnAucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJJZHMuZy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLl8ucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHByb2Nlc3MgPSAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LnBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHMpO1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZVRhYmxlKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5tLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGZpbHRlcklkcy5tKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZmlsdGVySWRzLnAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLnApKTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMuZy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMuZykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5fLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMuXykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBCdWlsZCBhIGxpc3Qgb2YgYWxsIHRoZSBub24tZGlzYWJsZWQgQXNzYXkgSURzIGluIHRoZSBTdHVkeS5cbiAgICAgICAgYnVpbGRBc3NheUlEU2V0KCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBhc3NheUlkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQsIGFzc2F5KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgfHwgIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgYXNzYXlJZHMucHVzaChhc3NheUlkKTtcblxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYXNzYXlJZHM7XG4gICAgICAgIH1cbiAgICAgXG5cbiAgICAgICAgLy8gU3RhcnRpbmcgd2l0aCBhIGxpc3Qgb2YgYWxsIHRoZSBub24tZGlzYWJsZWQgQXNzYXkgSURzIGluIHRoZSBTdHVkeSwgd2UgbG9vcCBpdCB0aHJvdWdoIHRoZVxuICAgICAgICAvLyBMaW5lIGFuZCBBc3NheS1sZXZlbCBmaWx0ZXJzLCBjYXVzaW5nIHRoZSBmaWx0ZXJzIHRvIHJlZnJlc2ggdGhlaXIgVUksIG5hcnJvd2luZyB0aGUgc2V0IGRvd24uXG4gICAgICAgIC8vIFdlIHJlc29sdmUgdGhlIHJlc3VsdGluZyBzZXQgb2YgQXNzYXkgSURzIGludG8gbWVhc3VyZW1lbnQgSURzLCB0aGVuIHBhc3MgdGhlbSBvbiB0byB0aGVcbiAgICAgICAgLy8gbWVhc3VyZW1lbnQtbGV2ZWwgZmlsdGVycy4gIEluIHRoZSBlbmQgd2UgcmV0dXJuIGEgc2V0IG9mIG1lYXN1cmVtZW50IElEcyByZXByZXNlbnRpbmcgdGhlXG4gICAgICAgIC8vIGVuZCByZXN1bHQgb2YgYWxsIHRoZSBmaWx0ZXJzLCBzdWl0YWJsZSBmb3IgcGFzc2luZyB0byB0aGUgZ3JhcGhpbmcgZnVuY3Rpb25zLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBwcm9jZXNzIGVhY2ggZ3JvdXAgc2VwYXJhdGVseSBoZXJlLlxuICAgICAgICBidWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5SWRzID0gdGhpcy5idWlsZEFzc2F5SURTZXQoKTtcblxuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRBc3NheUlkcyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGZpbHRlcmVkQXNzYXlJZHMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudElkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChmaWx0ZXJlZEFzc2F5SWRzLCAoaSwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgICAgICQubWVyZ2UobWVhc3VyZW1lbnRJZHMsIGFzc2F5Lm1lYXN1cmVzIHx8IFtdKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBzdGFydCBvdXQgd2l0aCBmb3VyIHJlZmVyZW5jZXMgdG8gdGhlIGFycmF5IG9mIGF2YWlsYWJsZSBtZWFzdXJlbWVudCBJRHMsIG9uZSBmb3IgZWFjaCBtYWpvciBjYXRlZ29yeS5cbiAgICAgICAgICAgIC8vIEVhY2ggb2YgdGhlc2Ugd2lsbCBiZWNvbWUgaXRzIG93biBhcnJheSBpbiB0dXJuIGFzIHdlIG5hcnJvdyBpdCBkb3duLlxuICAgICAgICAgICAgLy8gVGhpcyBpcyB0byBwcmV2ZW50IGEgc3ViLXNlbGVjdGlvbiBpbiBvbmUgY2F0ZWdvcnkgZnJvbSBvdmVycmlkaW5nIGEgc3ViLXNlbGVjdGlvbiBpbiB0aGUgb3RoZXJzLlxuXG4gICAgICAgICAgICB2YXIgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIHByb3RlaW5NZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBnZW5lTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZXJpY01lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgd2Ugb25seSB0cnkgdG8gZmlsdGVyIGlmIHdlIGdvdCBtZWFzdXJlbWVudHMgdGhhdCBhcHBseSB0byB0aGUgd2lkZ2V0IHR5cGVzXG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKG1ldGFib2xpdGVNZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucHJvdGVpbkRhdGFQcm9jZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcm90ZWluRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcocHJvdGVpbk1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmdlbmVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lcmljTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT25jZSB3ZSd2ZSBmaW5pc2hlZCB3aXRoIHRoZSBmaWx0ZXJpbmcsIHdlIHdhbnQgdG8gc2VlIGlmIGFueSBzdWItc2VsZWN0aW9ucyBoYXZlIGJlZW4gbWFkZSBhY3Jvc3NcbiAgICAgICAgICAgIC8vIGFueSBvZiB0aGUgY2F0ZWdvcmllcywgYW5kIGlmIHNvLCBtZXJnZSB0aG9zZSBzdWItc2VsZWN0aW9ucyBpbnRvIG9uZS5cblxuICAgICAgICAgICAgLy8gVGhlIGlkZWEgaXMsIHdlIGRpc3BsYXkgZXZlcnl0aGluZyB1bnRpbCB0aGUgdXNlciBtYWtlcyBhIHNlbGVjdGlvbiBpbiBvbmUgb3IgbW9yZSBvZiB0aGUgbWFpbiBjYXRlZ29yaWVzLFxuICAgICAgICAgICAgLy8gdGhlbiBkcm9wIGV2ZXJ5dGhpbmcgZnJvbSB0aGUgY2F0ZWdvcmllcyB0aGF0IGNvbnRhaW4gbm8gc2VsZWN0aW9ucy5cblxuICAgICAgICAgICAgLy8gQW4gZXhhbXBsZSBzY2VuYXJpbyB3aWxsIGV4cGxhaW4gd2h5IHRoaXMgaXMgaW1wb3J0YW50OlxuXG4gICAgICAgICAgICAvLyBTYXkgYSB1c2VyIGlzIHByZXNlbnRlZCB3aXRoIHR3byBjYXRlZ29yaWVzLCBNZXRhYm9saXRlIGFuZCBNZWFzdXJlbWVudC5cbiAgICAgICAgICAgIC8vIE1ldGFib2xpdGUgaGFzIGNyaXRlcmlhICdBY2V0YXRlJyBhbmQgJ0V0aGFub2wnIGF2YWlsYWJsZS5cbiAgICAgICAgICAgIC8vIE1lYXN1cmVtZW50IGhhcyBvbmx5IG9uZSBjcml0ZXJpYSBhdmFpbGFibGUsICdPcHRpY2FsIERlbnNpdHknLlxuICAgICAgICAgICAgLy8gQnkgZGVmYXVsdCwgQWNldGF0ZSwgRXRoYW5vbCwgYW5kIE9wdGljYWwgRGVuc2l0eSBhcmUgYWxsIHVuY2hlY2tlZCwgYW5kIGFsbCB2aXNpYmxlIG9uIHRoZSBncmFwaC5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgZXF1aXZhbGVudCB0byAncmV0dXJuIG1lYXN1cmVtZW50cycgYmVsb3cuXG5cbiAgICAgICAgICAgIC8vIElmIHRoZSB1c2VyIGNoZWNrcyAnQWNldGF0ZScsIHRoZXkgZXhwZWN0IG9ubHkgQWNldGF0ZSB0byBiZSBkaXNwbGF5ZWQsIGV2ZW4gdGhvdWdoIG5vIGNoYW5nZSBoYXMgYmVlbiBtYWRlIHRvXG4gICAgICAgICAgICAvLyB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiB3aGVyZSBPcHRpY2FsIERlbnNpdHkgaXMgbGlzdGVkLlxuICAgICAgICAgICAgLy8gSW4gdGhlIGNvZGUgYmVsb3csIGJ5IHRlc3RpbmcgZm9yIGFueSBjaGVja2VkIGJveGVzIGluIHRoZSBtZXRhYm9saXRlRmlsdGVycyBmaWx0ZXJzLFxuICAgICAgICAgICAgLy8gd2UgcmVhbGl6ZSB0aGF0IHRoZSBzZWxlY3Rpb24gaGFzIGJlZW4gbmFycm93ZWQgZG9vd24sIHNvIHdlIGFwcGVuZCB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMgb250byBkU00uXG4gICAgICAgICAgICAvLyBUaGVuIHdoZW4gd2UgY2hlY2sgdGhlIG1lYXN1cmVtZW50RmlsdGVycyBmaWx0ZXJzLCB3ZSBzZWUgdGhhdCB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiBoYXNcbiAgICAgICAgICAgIC8vIG5vdCBuYXJyb3dlZCBkb3duIGl0cyBzZXQgb2YgbWVhc3VyZW1lbnRzLCBzbyB3ZSBza2lwIGFwcGVuZGluZyB0aG9zZSB0byBkU00uXG4gICAgICAgICAgICAvLyBUaGUgZW5kIHJlc3VsdCBpcyBvbmx5IHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cy5cblxuICAgICAgICAgICAgLy8gVGhlbiBzdXBwb3NlIHRoZSB1c2VyIGNoZWNrcyAnT3B0aWNhbCBEZW5zaXR5JywgaW50ZW5kaW5nIHRvIGNvbXBhcmUgQWNldGF0ZSBkaXJlY3RseSBhZ2FpbnN0IE9wdGljYWwgRGVuc2l0eS5cbiAgICAgICAgICAgIC8vIFNpbmNlIG1lYXN1cmVtZW50RmlsdGVycyBub3cgaGFzIGNoZWNrZWQgYm94ZXMsIHdlIHB1c2ggaXRzIG1lYXN1cmVtZW50cyBvbnRvIGRTTSxcbiAgICAgICAgICAgIC8vIHdoZXJlIGl0IGNvbWJpbmVzIHdpdGggdGhlIEFjZXRhdGUuXG5cbiAgICAgICAgICAgIHZhciBhbnlDaGVja2VkID0gKGZpbHRlcjogR2VuZXJpY0ZpbHRlclNlY3Rpb24pOiBib29sZWFuID0+IHsgcmV0dXJuIGZpbHRlci5hbnlDaGVja2JveGVzQ2hlY2tlZDsgfTtcblxuICAgICAgICAgICAgdmFyIGRTTTogYW55W10gPSBbXTsgICAgLy8gXCJEZWxpYmVyYXRlbHkgc2VsZWN0ZWQgbWVhc3VyZW1lbnRzXCJcbiAgICAgICAgICAgIGlmICggdGhpcy5tZXRhYm9saXRlRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQobWV0YWJvbGl0ZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgdGhpcy5wcm90ZWluRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQocHJvdGVpbk1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgICAgdGhpcy5nZW5lRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZXJpY01lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmIChkU00ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRTTTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG1lYXN1cmVtZW50SWRzO1xuICAgICAgICB9XG5cblxuICAgICAgICBjaGVja1JlZHJhd1JlcXVpcmVkKGZvcmNlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHJlZHJhdzogYm9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgLy8gZG8gbm90IHJlZHJhdyBpZiBncmFwaCBpcyBub3QgaW5pdGlhbGl6ZWQgeWV0XG4gICAgICAgICAgICBpZiAodGhpcy5tYWluR3JhcGhPYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZWRyYXcgPSAhIWZvcmNlO1xuICAgICAgICAgICAgICAgIC8vIFdhbGsgZG93biB0aGUgZmlsdGVyIHdpZGdldCBsaXN0LiAgSWYgd2UgZW5jb3VudGVyIG9uZSB3aG9zZSBjb2xsZWN0aXZlIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgLy8gc3RhdGUgaGFzIGNoYW5nZWQgc2luY2Ugd2UgbGFzdCBtYWRlIHRoaXMgd2FsaywgdGhlbiBhIHJlZHJhdyBpcyByZXF1aXJlZC4gTm90ZSB0aGF0XG4gICAgICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIG5vdCBza2lwIHRoaXMgbG9vcCwgZXZlbiBpZiB3ZSBhbHJlYWR5IGtub3cgYSByZWRyYXcgaXMgcmVxdWlyZWQsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgIC8vIGNhbGwgdG8gYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IHNldHMgaW50ZXJuYWwgc3RhdGUgaW4gdGhlIGZpbHRlclxuICAgICAgICAgICAgICAgIC8vIHdpZGdldHMgdGhhdCB3ZSB3aWxsIHVzZSBuZXh0IHRpbWUgYXJvdW5kLlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpbHRlci5hbnlDaGVja2JveGVzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVkcmF3ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlZHJhdztcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyBBIGdlbmVyaWMgdmVyc2lvbiBvZiBhIGZpbHRlcmluZyBjb2x1bW4gaW4gdGhlIGZpbHRlcmluZyBzZWN0aW9uIGJlbmVhdGggdGhlIGdyYXBoIGFyZWEgb24gdGhlIHBhZ2UsXG4gICAgLy8gbWVhbnQgdG8gYmUgc3ViY2xhc3NlZCBmb3Igc3BlY2lmaWMgY3JpdGVyaWEuXG4gICAgLy8gV2hlbiBpbml0aWFsaXplZCB3aXRoIGEgc2V0IG9mIHJlY29yZCBJRHMsIHRoZSBjb2x1bW4gaXMgZmlsbGVkIHdpdGggbGFiZWxlZCBjaGVja2JveGVzLCBvbmUgZm9yIGVhY2hcbiAgICAvLyB1bmlxdWUgdmFsdWUgb2YgdGhlIGdpdmVuIGNyaXRlcmlhIGVuY291bnRlcmVkIGluIHRoZSByZWNvcmRzLlxuICAgIC8vIER1cmluZyB1c2UsIGFub3RoZXIgc2V0IG9mIHJlY29yZCBJRHMgaXMgcGFzc2VkIGluLCBhbmQgaWYgYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQsIHRoZSBJRCBzZXQgaXNcbiAgICAvLyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgIC8vIENoZWNrYm94ZXMgd2hvc2UgdmFsdWVzIGFyZSBub3QgcmVwcmVzZW50ZWQgYW55d2hlcmUgaW4gdGhlIGdpdmVuIElEcyBhcmUgdGVtcG9yYXJpbHkgZGlzYWJsZWQsXG4gICAgLy8gdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdCBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLiBcbiAgICAvLyBUaGUgZmlsdGVycyBhcmUgbWVhbnQgdG8gYmUgY2FsbGVkIGluIHNlcXVlbmNlLCBmZWVkaW5nIGVhY2ggcmV0dXJuZWQgSUQgc2V0IGludG8gdGhlIG5leHQsXG4gICAgLy8gcHJvZ3Jlc3NpdmVseSBuYXJyb3dpbmcgZG93biB0aGUgZW5hYmxlZCBjaGVja2JveGVzLlxuICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIHN1YmNsYXNzIHRoaXMgZm9yIGVhY2ggZ3JvdXAgdHlwZS5cbiAgICBleHBvcnQgY2xhc3MgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIC8vIEEgZGljdGlvbmFyeSBvZiB0aGUgdW5pcXVlIHZhbHVlcyBmb3VuZCBmb3IgZmlsdGVyaW5nIGFnYWluc3QsIGFuZCB0aGUgZGljdGlvbmFyeSdzIGNvbXBsZW1lbnQuXG4gICAgICAgIC8vIEVhY2ggdW5pcXVlIElEIGlzIGFuIGludGVnZXIsIGFzY2VuZGluZyBmcm9tIDEsIGluIHRoZSBvcmRlciB0aGUgdmFsdWUgd2FzIGZpcnN0IGVuY291bnRlcmVkXG4gICAgICAgIC8vIHdoZW4gZXhhbWluaW5nIHRoZSByZWNvcmQgZGF0YSBpbiB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaC5cbiAgICAgICAgdW5pcXVlVmFsdWVzOiBVbmlxdWVJRFRvVmFsdWU7XG4gICAgICAgIHVuaXF1ZUluZGV4ZXM6IFZhbHVlVG9VbmlxdWVJRDtcbiAgICAgICAgdW5pcXVlSW5kZXhDb3VudGVyOiBudW1iZXI7XG5cbiAgICAgICAgLy8gVGhlIHNvcnRlZCBvcmRlciBvZiB0aGUgbGlzdCBvZiB1bmlxdWUgdmFsdWVzIGZvdW5kIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgdW5pcXVlVmFsdWVzT3JkZXI6IG51bWJlcltdO1xuXG4gICAgICAgIC8vIEEgZGljdGlvbmFyeSByZXNvbHZpbmcgYSByZWNvcmQgSUQgKGFzc2F5IElELCBtZWFzdXJlbWVudCBJRCkgdG8gYW4gYXJyYXkuIEVhY2ggYXJyYXlcbiAgICAgICAgLy8gY29udGFpbnMgdGhlIGludGVnZXIgaWRlbnRpZmllcnMgb2YgdGhlIHVuaXF1ZSB2YWx1ZXMgdGhhdCBhcHBseSB0byB0aGF0IHJlY29yZC5cbiAgICAgICAgLy8gKEl0J3MgcmFyZSwgYnV0IHRoZXJlIGNhbiBhY3R1YWxseSBiZSBtb3JlIHRoYW4gb25lIGNyaXRlcmlhIHRoYXQgbWF0Y2hlcyBhIGdpdmVuIElELFxuICAgICAgICAvLyAgZm9yIGV4YW1wbGUgYSBMaW5lIHdpdGggdHdvIGZlZWRzIGFzc2lnbmVkIHRvIGl0LilcbiAgICAgICAgZmlsdGVySGFzaDogVmFsdWVUb1VuaXF1ZUxpc3Q7XG4gICAgICAgIC8vIERpY3Rpb25hcnkgcmVzb2x2aW5nIHRoZSBmaWx0ZXIgdmFsdWUgaW50ZWdlciBpZGVudGlmaWVycyB0byBIVE1MIElucHV0IGNoZWNrYm94ZXMuXG4gICAgICAgIGNoZWNrYm94ZXM6IHtbaW5kZXg6IG51bWJlcl06IEpRdWVyeX07XG4gICAgICAgIC8vIERpY3Rpb25hcnkgdXNlZCB0byBjb21wYXJlIGNoZWNrYm94ZXMgd2l0aCBhIHByZXZpb3VzIHN0YXRlIHRvIGRldGVybWluZSB3aGV0aGVyIGFuXG4gICAgICAgIC8vIHVwZGF0ZSBpcyByZXF1aXJlZC4gVmFsdWVzIGFyZSAnQycgZm9yIGNoZWNrZWQsICdVJyBmb3IgdW5jaGVja2VkLCBhbmQgJ04nIGZvciBub3RcbiAgICAgICAgLy8gZXhpc3RpbmcgYXQgdGhlIHRpbWUuICgnTicgY2FuIGJlIHVzZWZ1bCB3aGVuIGNoZWNrYm94ZXMgYXJlIHJlbW92ZWQgZnJvbSBhIGZpbHRlciBkdWUgdG9cbiAgICAgICAgLy8gdGhlIGJhY2stZW5kIGRhdGEgY2hhbmdpbmcuKVxuICAgICAgICBwcmV2aW91c0NoZWNrYm94U3RhdGU6IFVuaXF1ZUlEVG9WYWx1ZTtcbiAgICAgICAgLy8gRGljdGlvbmFyeSByZXNvbHZpbmcgdGhlIGZpbHRlciB2YWx1ZSBpbnRlZ2VyIGlkZW50aWZpZXJzIHRvIEhUTUwgdGFibGUgcm93IGVsZW1lbnRzLlxuICAgICAgICB0YWJsZVJvd3M6IHtbaW5kZXg6IG51bWJlcl06IEhUTUxUYWJsZVJvd0VsZW1lbnR9O1xuXG4gICAgICAgIC8vIFJlZmVyZW5jZXMgdG8gSFRNTCBlbGVtZW50cyBjcmVhdGVkIGJ5IHRoZSBmaWx0ZXJcbiAgICAgICAgZmlsdGVyQ29sdW1uRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgdGl0bGVFbGVtZW50OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2VhcmNoQm94RWxlbWVudDpIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBzY3JvbGxab25lRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgZmlsdGVyaW5nVGFibGU6IEpRdWVyeTtcbiAgICAgICAgdGFibGVCb2R5RWxlbWVudDogSFRNTFRhYmxlRWxlbWVudDtcblxuICAgICAgICAvLyBTZWFyY2ggYm94IHJlbGF0ZWRcbiAgICAgICAgdHlwaW5nVGltZW91dDogbnVtYmVyO1xuICAgICAgICB0eXBpbmdEZWxheTogbnVtYmVyO1xuICAgICAgICBjdXJyZW50U2VhcmNoU2VsZWN0aW9uOiBzdHJpbmc7XG4gICAgICAgIHByZXZpb3VzU2VhcmNoU2VsZWN0aW9uOiBzdHJpbmc7XG4gICAgICAgIG1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoOiBudW1iZXI7XG5cbiAgICAgICAgYW55Q2hlY2tib3hlc0NoZWNrZWQ6IGJvb2xlYW47XG5cbiAgICAgICAgc2VjdGlvblRpdGxlOiBzdHJpbmc7XG4gICAgICAgIHNlY3Rpb25TaG9ydExhYmVsOiBzdHJpbmc7XG5cbiAgICAgICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4Q291bnRlciA9IDA7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyID0gW107XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0ge307XG5cbiAgICAgICAgICAgIHRoaXMudHlwaW5nVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnR5cGluZ0RlbGF5ID0gMzMwOyAgICAvLyBUT0RPOiBOb3QgaW1wbGVtZW50ZWRcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9ICcnO1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9ICcnO1xuICAgICAgICAgICAgdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCA9IDE7XG5cbiAgICAgICAgICAgIHRoaXMuY29uZmlndXJlKCk7XG4gICAgICAgICAgICB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUNvbnRhaW5lck9iamVjdHMoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnR2VuZXJpYyBGaWx0ZXInO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdnZic7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENyZWF0ZSBhbGwgdGhlIGNvbnRhaW5lciBIVE1MIG9iamVjdHNcbiAgICAgICAgY3JlYXRlQ29udGFpbmVyT2JqZWN0cygpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBzQm94SUQ6IHN0cmluZyA9ICdmaWx0ZXInICsgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCArICdTZWFyY2hCb3gnLFxuICAgICAgICAgICAgICAgIHNCb3g6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckNvbHVtbkRpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ29sdW1uJylbMF07XG4gICAgICAgICAgICB0aGlzLnRpdGxlRWxlbWVudCA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckhlYWQnKS50ZXh0KHRoaXMuc2VjdGlvblRpdGxlKVswXTtcblxuICAgICAgICAgICAgJChzQm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2lkJzogc0JveElELCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogc0JveElELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3BsYWNlaG9sZGVyJzogdGhpcy5zZWN0aW9uVGl0bGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnc2l6ZSc6IDE0fSlcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ3NlYXJjaEJveCBmaWx0ZXJIZWFkJyk7XG4gICAgICAgICAgICBzQm94LnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0Jyk7IC8vIEpRdWVyeSAuYXR0cigpIGNhbm5vdCBzZXQgdGhpc1xuICAgICAgICAgICAgdGhpcy5zZWFyY2hCb3hFbGVtZW50ID0gc0JveDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWm9uZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFTY3JvbGxab25lJylbMF07XG4gICAgICAgICAgICB0aGlzLmZpbHRlcmluZ1RhYmxlID0gJChcIjx0YWJsZT5cIilcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2ZpbHRlckNyaXRlcmlhVGFibGUgZHJhZ2JveGVzJylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdjZWxscGFkZGluZyc6IDAsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kKHRoaXMudGFibGVCb2R5RWxlbWVudCA9IDxIVE1MVGFibGVFbGVtZW50PiQoXCI8dGJvZHk+XCIpWzBdKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciB1c2VkVmFsdWVzOiBWYWx1ZVRvVW5pcXVlSUQsIGNyU2V0OiBudW1iZXJbXSwgY0hhc2g6IFVuaXF1ZUlEVG9WYWx1ZSxcbiAgICAgICAgICAgICAgICBwcmV2aW91c0lkczogc3RyaW5nW107XG4gICAgICAgICAgICAvLyBjYW4gZ2V0IElEcyBmcm9tIG11bHRpcGxlIGFzc2F5cywgZmlyc3QgbWVyZ2Ugd2l0aCB0aGlzLmZpbHRlckhhc2hcbiAgICAgICAgICAgIHByZXZpb3VzSWRzID0gJC5tYXAodGhpcy5maWx0ZXJIYXNoIHx8IHt9LCAoXywgcHJldmlvdXNJZDogc3RyaW5nKSA9PiBwcmV2aW91c0lkKTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhZGRlZElkOiBzdHJpbmcpOiB2b2lkID0+IHsgdGhpcy5maWx0ZXJIYXNoW2FkZGVkSWRdID0gW107IH0pO1xuICAgICAgICAgICAgaWRzID0gJC5tYXAodGhpcy5maWx0ZXJIYXNoIHx8IHt9LCAoXywgcHJldmlvdXNJZDogc3RyaW5nKSA9PiBwcmV2aW91c0lkKTtcbiAgICAgICAgICAgIC8vIHNraXAgb3ZlciBidWlsZGluZyB1bmlxdWUgdmFsdWVzIGFuZCBzb3J0aW5nIHdoZW4gbm8gbmV3IElEcyBhZGRlZFxuICAgICAgICAgICAgaWYgKGlkcy5sZW5ndGggPiBwcmV2aW91c0lkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkcyk7XG4gICAgICAgICAgICAgICAgY3JTZXQgPSBbXTtcbiAgICAgICAgICAgICAgICBjSGFzaCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhIHJldmVyc2VkIGhhc2ggc28ga2V5cyBtYXAgdmFsdWVzIGFuZCB2YWx1ZXMgbWFwIGtleXNcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy51bmlxdWVJbmRleGVzLCAodmFsdWU6IHN0cmluZywgdW5pcXVlSUQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjSGFzaFt1bmlxdWVJRF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgY3JTZXQucHVzaCh1bmlxdWVJRCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gQWxwaGFiZXRpY2FsbHkgc29ydCBhbiBhcnJheSBvZiB0aGUga2V5cyBhY2NvcmRpbmcgdG8gdmFsdWVzXG4gICAgICAgICAgICAgICAgY3JTZXQuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX2E6c3RyaW5nID0gY0hhc2hbYV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9iOnN0cmluZyA9IGNIYXNoW2JdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBfYSA8IF9iID8gLTEgOiBfYSA+IF9iID8gMSA6IDA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSBjSGFzaDtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyID0gY3JTZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEluIHRoaXMgZnVuY3Rpb24gYXJlIHJ1bm5pbmcgdGhyb3VnaCB0aGUgZ2l2ZW4gbGlzdCBvZiBtZWFzdXJlbWVudCBJRHMgYW5kIGV4YW1pbmluZ1xuICAgICAgICAvLyB0aGVpciByZWNvcmRzIGFuZCByZWxhdGVkIHJlY29yZHMsIGxvY2F0aW5nIHRoZSBwYXJ0aWN1bGFyIGZpZWxkIHdlIGFyZSBpbnRlcmVzdGVkIGluLFxuICAgICAgICAvLyBhbmQgY3JlYXRpbmcgYSBsaXN0IG9mIGFsbCB0aGUgdW5pcXVlIHZhbHVlcyBmb3IgdGhhdCBmaWVsZC4gIEFzIHdlIGdvLCB3ZSBtYXJrIGVhY2hcbiAgICAgICAgLy8gdW5pcXVlIHZhbHVlIHdpdGggYW4gaW50ZWdlciBVSUQsIGFuZCBjb25zdHJ1Y3QgYSBoYXNoIHJlc29sdmluZyBlYWNoIHJlY29yZCB0byBvbmUgKG9yXG4gICAgICAgIC8vIHBvc3NpYmx5IG1vcmUpIG9mIHRob3NlIGludGVnZXIgVUlEcy4gIFRoaXMgcHJlcGFyZXMgdXMgZm9yIHF1aWNrIGZpbHRlcmluZyBsYXRlciBvbi5cbiAgICAgICAgLy8gKFRoaXMgZ2VuZXJpYyBmaWx0ZXIgZG9lcyBub3RoaW5nLCBzbyB3ZSBsZWF2ZSB0aGVzZSBzdHJ1Y3R1cmVzIGJsYW5rLilcbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY29tZSB1cCB3aXRoIDIgb3IgbW9yZSBjcml0ZXJpYSwgdGhlcmUgaXMgbm8gcG9pbnQgaW4gZGlzcGxheWluZyB0aGUgZmlsdGVyLlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICBhZGRUb1BhcmVudChwYXJlbnREaXYpOnZvaWQge1xuICAgICAgICAgICAgcGFyZW50RGl2LmFwcGVuZENoaWxkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgYXBwbHlCYWNrZ3JvdW5kU3R5bGUoZGFya2VyOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICAgICAgJCh0aGlzLmZpbHRlckNvbHVtbkRpdikucmVtb3ZlQ2xhc3MoZGFya2VyID8gJ3N0cmlwZVJvd0InIDogJ3N0cmlwZVJvd0EnKTtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmFkZENsYXNzKGRhcmtlciA/ICdzdHJpcGVSb3dBJyA6ICdzdHJpcGVSb3dCJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJ1bnMgdGhyb3VnaCB0aGUgdmFsdWVzIGluIHVuaXF1ZVZhbHVlc09yZGVyLCBhZGRpbmcgYSBjaGVja2JveCBhbmQgbGFiZWwgZm9yIGVhY2hcbiAgICAgICAgLy8gZmlsdGVyaW5nIHZhbHVlIHJlcHJlc2VudGVkLiAgSWYgdGhlcmUgYXJlIG1vcmUgdGhhbiAxNSB2YWx1ZXMsIHRoZSBmaWx0ZXIgZ2V0c1xuICAgICAgICAvLyBhIHNlYXJjaCBib3ggYW5kIHNjcm9sbGJhci5cbiAgICAgICAgcG9wdWxhdGVUYWJsZSgpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGZDb2wgPSAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KS5lbXB0eSgpO1xuICAgICAgICAgICAgLy8gT25seSB1c2UgdGhlIHNjcm9sbGluZyBjb250YWluZXIgZGl2IGlmIHRoZSBzaXplIG9mIHRoZSBsaXN0IHdhcnJhbnRzIGl0LCBiZWNhdXNlXG4gICAgICAgICAgICAvLyB0aGUgc2Nyb2xsaW5nIGNvbnRhaW5lciBkaXYgZGVjbGFyZXMgYSBsYXJnZSBwYWRkaW5nIG1hcmdpbiBmb3IgdGhlIHNjcm9sbCBiYXIsXG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBwYWRkaW5nIG1hcmdpbiB3b3VsZCBiZSBhbiBlbXB0eSB3YXN0ZSBvZiBzcGFjZSBvdGhlcndpc2UuXG4gICAgICAgICAgICBpZiAodGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAxNSkge1xuICAgICAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMuc2VhcmNoQm94RWxlbWVudCkuYXBwZW5kKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICAgICAgLy8gQ2hhbmdlIHRoZSByZWZlcmVuY2Ugc28gd2UncmUgYWZmZWN0aW5nIHRoZSBpbm5lckhUTUwgb2YgdGhlIGNvcnJlY3QgZGl2IGxhdGVyIG9uXG4gICAgICAgICAgICAgICAgZkNvbCA9ICQodGhpcy5zY3JvbGxab25lRGl2KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy50aXRsZUVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5maWx0ZXJpbmdUYWJsZSk7XG5cbiAgICAgICAgICAgIHZhciB0Qm9keSA9IHRoaXMudGFibGVCb2R5RWxlbWVudDtcbiAgICAgICAgICAgIC8vIENsZWFyIG91dCBhbnkgb2xkIHRhYmxlIGNvbnRlbnRzXG4gICAgICAgICAgICAkKHRoaXMudGFibGVCb2R5RWxlbWVudCkuZW1wdHkoKTtcblxuICAgICAgICAgICAgdGhpcy50YWJsZVJvd3MgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKCh1bmlxdWVJZDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNib3hOYW1lLCBjZWxsLCBwLCBxLCByO1xuICAgICAgICAgICAgICAgIGNib3hOYW1lID0gWydmaWx0ZXInLCB0aGlzLnNlY3Rpb25TaG9ydExhYmVsLCAnbicsIHVuaXF1ZUlkLCAnY2JveCddLmpvaW4oJycpO1xuICAgICAgICAgICAgICAgIHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXSA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGVCb2R5RWxlbWVudC5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICBjZWxsID0gdGhpcy50YWJsZVJvd3NbdW5pcXVlSWRdLmluc2VydENlbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXNbdW5pcXVlSWRdID0gJChcIjxpbnB1dCB0eXBlPSdjaGVja2JveCc+XCIpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ25hbWUnOiBjYm94TmFtZSwgJ2lkJzogY2JveE5hbWUgfSlcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCBjYm94TmFtZSkudGV4dCh0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF0pXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgRHJhZ2JveGVzLmluaXRUYWJsZSh0aGlzLmZpbHRlcmluZ1RhYmxlKTsgICAgLy8gVE9ETzogRHJhZyBzZWxlY3QgaXMgYnJva2VuIGluIFNhZmFyaVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIHRydWUgaWYgYW55IG9mIHRoZSBjaGVja2JveGVzIHNob3cgYSBkaWZmZXJlbnQgc3RhdGUgdGhhbiB3aGVuIHRoaXMgZnVuY3Rpb24gd2FzXG4gICAgICAgIC8vIGxhc3QgY2FsbGVkXG4gICAgICAgIGFueUNoZWNrYm94ZXNDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIGNoYW5nZWQ6Ym9vbGVhbiA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGN1cnJlbnRDaGVja2JveFN0YXRlOiBVbmlxdWVJRFRvVmFsdWUgPSB7fSxcbiAgICAgICAgICAgICAgICB2OnN0cmluZyA9ICQodGhpcy5zZWFyY2hCb3hFbGVtZW50KS52YWwoKTtcbiAgICAgICAgICAgIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmNoZWNrYm94ZXMgfHwge30sICh1bmlxdWVJZDogbnVtYmVyLCBjaGVja2JveDogSlF1ZXJ5KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQsIHByZXZpb3VzO1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSAoY2hlY2tib3gucHJvcCgnY2hlY2tlZCcpICYmICFjaGVja2JveC5wcm9wKCdkaXNhYmxlZCcpKSA/ICdDJyA6ICdVJztcbiAgICAgICAgICAgICAgICBwcmV2aW91cyA9IHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlW3VuaXF1ZUlkXSB8fCAnTic7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQgIT09IHByZXZpb3VzKSBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gJ0MnKSB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2hlY2tib3hTdGF0ZVt1bmlxdWVJZF0gPSBjdXJyZW50O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHYgPSB2LnRyaW0oKTsgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgICAgIHYgPSB2LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB2ID0gdi5yZXBsYWNlKC9cXHNcXHMqLywgJyAnKTsgLy8gUmVwbGFjZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIHdpdGggc2luZ2xlIHNwYWNlc1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uID0gdjtcbiAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzLnByZXZpb3VzU2VhcmNoU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmICghY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmVuJ3QgZGV0ZWN0ZWQgYW55IGNoYW5nZSBzbyBmYXIsIHRoZXJlIGlzIG9uZSBtb3JlIGFuZ2xlIHRvIGNvdmVyOlxuICAgICAgICAgICAgICAgIC8vIENoZWNrYm94ZXMgdGhhdCB1c2VkIHRvIGV4aXN0LCBidXQgaGF2ZSBzaW5jZSBiZWVuIHJlbW92ZWQgZnJvbSB0aGUgc2V0LlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSwgKHJvd0lkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Q2hlY2tib3hTdGF0ZVtyb3dJZF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0gY3VycmVudENoZWNrYm94U3RhdGU7XG4gICAgICAgICAgICByZXR1cm4gY2hhbmdlZDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGFrZXMgYSBzZXQgb2YgcmVjb3JkIElEcywgYW5kIGlmIGFueSBjaGVja2JveGVzIGluIHRoZSBmaWx0ZXIncyBVSSBhcmUgY2hlY2tlZCxcbiAgICAgICAgLy8gdGhlIElEIHNldCBpcyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgICAgICAvLyBDaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBnaXZlbiBJRHMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkXG4gICAgICAgIC8vIGFuZCBzb3J0ZWQgdG8gdGhlIGJvdHRvbSBvZiB0aGUgbGlzdCwgdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdFxuICAgICAgICAvLyBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLlxuICAgICAgICAvLyBUaGUgbmFycm93ZWQgc2V0IG9mIElEcyBpcyB0aGVuIHJldHVybmVkLCBmb3IgdXNlIGJ5IHRoZSBuZXh0IGZpbHRlci5cbiAgICAgICAgYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhpZHM6YW55W10pOmFueSB7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSBmaWx0ZXIgb25seSBjb250YWlucyBvbmUgaXRlbSwgaXQncyBwb2ludGxlc3MgdG8gYXBwbHkgaXQuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpZHM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBpZHNQb3N0RmlsdGVyaW5nOiBhbnlbXTtcblxuICAgICAgICAgICAgdmFyIHVzZVNlYXJjaEJveDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICB2YXIgcXVlcnlTdHJzID0gW107XG5cbiAgICAgICAgICAgIHZhciB2ID0gdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uO1xuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICh2Lmxlbmd0aCA+PSB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSB3b3Jkcywgd2UgbWF0Y2ggZWFjaCBzZXBhcmF0ZWx5LlxuICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIG5vdCBhdHRlbXB0IHRvIG1hdGNoIGFnYWluc3QgZW1wdHkgc3RyaW5ncywgc28gd2UgZmlsdGVyIHRob3NlIG91dCBpZlxuICAgICAgICAgICAgICAgICAgICAvLyBhbnkgc2xpcHBlZCB0aHJvdWdoLlxuICAgICAgICAgICAgICAgICAgICBxdWVyeVN0cnMgPSB2LnNwbGl0KC9cXHMrLykuZmlsdGVyKChvbmUpID0+IHsgcmV0dXJuIG9uZS5sZW5ndGggPiAwOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHVzZXIgbWlnaHQgaGF2ZSBwYXN0ZWQvdHlwZWQgb25seSB3aGl0ZXNwYWNlLCBzbzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1ZXJ5U3Rycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1c2VTZWFyY2hCb3ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZyA9IHt9O1xuXG4gICAgICAgICAgICB2YXIgaW5kZXhJc1Zpc2libGUgPSAoaW5kZXgpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtYXRjaDpib29sZWFuID0gdHJ1ZSwgdGV4dDpzdHJpbmc7XG4gICAgICAgICAgICAgICAgaWYgKHVzZVNlYXJjaEJveCkge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gdGhpcy51bmlxdWVWYWx1ZXNbaW5kZXhdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoID0gcXVlcnlTdHJzLnNvbWUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0ZXh0Lmxlbmd0aCA+PSB2Lmxlbmd0aCAmJiB0ZXh0LmluZGV4T2YodikgPj0gMDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2luZGV4XSA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbaW5kZXhdID09PSAnQycpIHx8ICF0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZHNQb3N0RmlsdGVyaW5nID0gaWRzLmZpbHRlcigoaWQpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGZpbHRlcmluZyBkYXRhIGZvciB0aGlzIGlkLCB1c2UgaXQuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgZG9uJ3QsIHRoZSBpZCBwcm9iYWJseSBiZWxvbmdzIHRvIHNvbWUgb3RoZXIgbWVhc3VyZW1lbnQgY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgLy8gc28gd2UgaWdub3JlIGl0LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpbHRlckhhc2hbaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbHRlckhhc2hbaWRdLnNvbWUoaW5kZXhJc1Zpc2libGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIHJvd3NUb0FwcGVuZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKChjcklEKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94OiBKUXVlcnkgPSB0aGlzLmNoZWNrYm94ZXNbY3JJRF0sXG4gICAgICAgICAgICAgICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCA9IHRoaXMudGFibGVSb3dzW2NySURdLFxuICAgICAgICAgICAgICAgICAgICBzaG93OiBib29sZWFuID0gISF2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2NySURdO1xuICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJywgIXNob3cpXG4gICAgICAgICAgICAgICAgJChyb3cpLnRvZ2dsZUNsYXNzKCdub2RhdGEnLCAhc2hvdyk7XG4gICAgICAgICAgICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWJsZUJvZHlFbGVtZW50LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93c1RvQXBwZW5kLnB1c2gocm93KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIE5vdywgKHJlKWFwcGVuZCBhbGwgdGhlIHJvd3Mgd2UgZGlzYWJsZWQsIHNvIHRoZXkgZ28gdG8gdGhlIGJvdHRvbSBvZiB0aGUgdGFibGVcbiAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5mb3JFYWNoKChyb3cpID0+IHRoaXMudGFibGVCb2R5RWxlbWVudC5hcHBlbmRDaGlsZChyb3cpKTtcbiAgICAgICAgICAgIHJldHVybiBpZHNQb3N0RmlsdGVyaW5nO1xuICAgICAgICB9XG5cblxuICAgICAgICBfYXNzYXlJZFRvQXNzYXkoYXNzYXlJZDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgfVxuICAgICAgICBfYXNzYXlJZFRvTGluZShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9Qcm90b2NvbChhc3NheUlkOnN0cmluZyk6IFByb3RvY29sUmVjb3JkIHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSByZXR1cm4gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRJZE1hcFRvVmFsdWVzKCk6KGlkOnN0cmluZykgPT4gYW55W10ge1xuICAgICAgICAgICAgcmV0dXJuICgpID0+IFtdO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBTdHJhaW5GaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ1N0cmFpbic7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ3N0JztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgc3RyYWluIG5hbWVcbiAgICAgICAgICAgICAgICAobGluZS5zdHJhaW4gfHwgW10pLmZvckVhY2goKHN0cmFpbklkOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tzdHJhaW5JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdHJhaW4gJiYgc3RyYWluLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIENhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnQ2FyYm9uIFNvdXJjZSc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ2NzJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBjYXJib24gc291cmNlIG5hbWVcbiAgICAgICAgICAgICAgICAobGluZS5jYXJib24gfHwgW10pLmZvckVhY2goKGNhcmJvbklkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3JjID0gRURERGF0YS5DU291cmNlc1tjYXJib25JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzcmMgJiYgc3JjLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIENhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdMYWJlbGluZyc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ2wnO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIGNhcmJvbiBzb3VyY2UgbGFiZWxpbmcgZGVzY3JpcHRpb25cbiAgICAgICAgICAgICAgICAobGluZS5jYXJib24gfHwgW10pLmZvckVhY2goKGNhcmJvbklkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3JjID0gRURERGF0YS5DU291cmNlc1tjYXJib25JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzcmMgJiYgc3JjLmxhYmVsaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBMaW5lTmFtZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnTGluZSc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ2xuJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgUHJvdG9jb2xGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ1Byb3RvY29sJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAncCc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcm90b2NvbDogUHJvdG9jb2xSZWNvcmQgPSB0aGlzLl9hc3NheUlkVG9Qcm90b2NvbChhc3NheUlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5U3VmZml4RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdBc3NheSBTdWZmaXgnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdhJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgbWV0YURhdGFJRDpzdHJpbmc7XG4gICAgICAgIHByZTpzdHJpbmc7XG4gICAgICAgIHBvc3Q6c3RyaW5nO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG1ldGFEYXRhSUQ6c3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgTURUID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW21ldGFEYXRhSURdO1xuICAgICAgICAgICAgdGhpcy5tZXRhRGF0YUlEID0gbWV0YURhdGFJRDtcbiAgICAgICAgICAgIHRoaXMucHJlID0gTURULnByZSB8fCAnJztcbiAgICAgICAgICAgIHRoaXMucG9zdCA9IE1EVC5wb3N0IHx8ICcnO1xuICAgICAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1t0aGlzLm1ldGFEYXRhSURdLm5hbWU7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ21kJyt0aGlzLm1ldGFEYXRhSUQ7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIExpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOiBhbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9LCB2YWx1ZSA9ICcoRW1wdHkpJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUubWV0YSAmJiBsaW5lLm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdLCB0aGlzLnBvc3QgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpIHx8IHt9LCB2YWx1ZSA9ICcoRW1wdHkpJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm1ldGEgJiYgYXNzYXkubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgYXNzYXkubWV0YVt0aGlzLm1ldGFEYXRhSURdLCB0aGlzLnBvc3QgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0NvbXBhcnRtZW50JztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnY29tJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgdmFsdWU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVDb21wYXJ0bWVudHNbbWVhc3VyZS5jb21wYXJ0bWVudF0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOiBib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ01lYXN1cmVtZW50JztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnbW0nO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKG1JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBtSWRzLmZvckVhY2goKG1lYXN1cmVJZDogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fTtcbiAgICAgICAgICAgICAgICB2YXIgbVR5cGU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBtVHlwZSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobVR5cGUgJiYgbVR5cGUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6Ym9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ01ldGFib2xpdGUnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdtZSc7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gT3ZlcnJpZGU6IElmIHRoZSBmaWx0ZXIgaGFzIGEgbG9hZCBwZW5kaW5nLCBpdCdzIFwidXNlZnVsXCIsIGkuZS4gZGlzcGxheSBpdC5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIG1ldGFib2xpdGU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBtZXRhYm9saXRlID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGFib2xpdGUgJiYgbWV0YWJvbGl0ZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIFByb3RlaW5GaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6Ym9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ1Byb3RlaW4nO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdwcic7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gT3ZlcnJpZGU6IElmIHRoZSBmaWx0ZXIgaGFzIGEgbG9hZCBwZW5kaW5nLCBpdCdzIFwidXNlZnVsXCIsIGkuZS4gZGlzcGxheSBpdC5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgcHJvdGVpbjogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3RlaW4gPSBFREREYXRhLlByb3RlaW5UeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvdGVpbiAmJiBwcm90ZWluLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgR2VuZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzpib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnR2VuZSc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ2duJztcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZTogSWYgdGhlIGZpbHRlciBoYXMgYSBsb2FkIHBlbmRpbmcsIGl0J3MgXCJ1c2VmdWxcIiwgaS5lLiBkaXNwbGF5IGl0LlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBnZW5lOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2VuZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChnZW5lICYmIGdlbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZSBwYWdlIGxvYWRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlSXQoKSB7XG5cbiAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QgPSBudWxsO1xuXG4gICAgICAgIHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQgPSBuZXcgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YSA9IG51bGw7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5hdHRhY2htZW50SURzID0gbnVsbDtcbiAgICAgICAgdGhpcy5hdHRhY2htZW50c0J5SUQgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50ID0gbnVsbDtcblxuICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gLTE7XG4gICAgICAgIHRoaXMubWV0YWJvbGljTWFwTmFtZSA9IG51bGw7XG4gICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gLTE7XG5cbiAgICAgICAgdGhpcy5jU291cmNlRW50cmllcyA9IFtdO1xuICAgICAgICB0aGlzLm1UeXBlRW50cmllcyA9IFtdO1xuXG4gICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgICAgIHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRTcGVjcyA9IHt9O1xuICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkcyA9IHt9O1xuXG4gICAgICAgIC8vIHB1dCB0aGUgY2xpY2sgaGFuZGxlciBhdCB0aGUgZG9jdW1lbnQgbGV2ZWwsIHRoZW4gZmlsdGVyIHRvIGFueSBsaW5rIGluc2lkZSBhIC5kaXNjbG9zZVxuICAgICAgICAkKGRvY3VtZW50KS5vbignY2xpY2snLCAnLmRpc2Nsb3NlIC5kaXNjbG9zZUxpbmsnLCAoZSkgPT4ge1xuICAgICAgICAgICAgJChlLnRhcmdldCkuY2xvc2VzdCgnLmRpc2Nsb3NlJykudG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgJ3VybCc6ICdlZGRkYXRhLycsXG4gICAgICAgICAgICAndHlwZSc6ICdHRVQnLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydMb2FkaW5nIEVERERhdGEgZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZV0uam9pbignJykpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdzdWNjZXNzJzogKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBFREREYXRhID0gJC5leHRlbmQoRURERGF0YSB8fCB7fSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5wcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIGEgdGFibGUgc3BlY2lmaWNhdGlvbiBmb3IgdGhlIExpbmVzIHRhYmxlXG4gICAgICAgICAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNMaW5lcygpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIHRoZSB0YWJsZSBpdHNlbGYgd2l0aCB0aGUgc3BlY1xuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZCA9IG5ldyBEYXRhR3JpZCh0aGlzLmxpbmVzRGF0YUdyaWRTcGVjKTtcbiAgICAgICAgICAgICAgICAvLyBGaW5kIG91dCB3aGljaCBwcm90b2NvbHMgaGF2ZSBhc3NheXMgd2l0aCBtZWFzdXJlbWVudHMgLSBkaXNhYmxlZCBvciBub1xuICAgICAgICAgICAgICAgIHZhciBwcm90b2NvbHNXaXRoTWVhc3VyZW1lbnRzOmFueSA9IHt9O1xuICAgICAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQsIGFzc2F5KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIHByb3RvY29sc1dpdGhNZWFzdXJlbWVudHNbYXNzYXkucGlkXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gRm9yIGVhY2ggcHJvdG9jb2wgd2l0aCBtZWFzdXJlbWVudHMsIGNyZWF0ZSBhIERhdGFHcmlkQXNzYXlzIG9iamVjdC5cbiAgICAgICAgICAgICAgICAkLmVhY2goRURERGF0YS5Qcm90b2NvbHMsIChpZCwgcHJvdG9jb2wpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNwZWM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm90b2NvbHNXaXRoTWVhc3VyZW1lbnRzW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZFNwZWNzW2lkXSA9IHNwZWMgPSBuZXcgRGF0YUdyaWRTcGVjQXNzYXlzKHByb3RvY29sLmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRzW2lkXSA9IG5ldyBEYXRhR3JpZEFzc2F5cyhzcGVjKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAkKCdmb3JtLmxpbmUtZWRpdCcpLm9uKCdjaGFuZ2UnLCAnLmxpbmUtbWV0YSA+IDppbnB1dCcsIChldikgPT4ge1xuICAgICAgICAgICAgLy8gd2F0Y2ggZm9yIGNoYW5nZXMgdG8gbWV0YWRhdGEgdmFsdWVzLCBhbmQgc2VyaWFsaXplIHRvIHRoZSBtZXRhX3N0b3JlIGZpZWxkXG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpO1xuICAgICAgICAgICAgZm9ybS5maW5kKCcubGluZS1tZXRhID4gOmlucHV0JykuZWFjaCgoaSwgaW5wdXQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gJChpbnB1dCkuYXR0cignaWQnKS5tYXRjaCgvLShcXGQrKSQvKVsxXTtcbiAgICAgICAgICAgICAgICBtZXRhW2tleV0gPSAkKGlucHV0KS52YWwoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgbWV0YUluLnZhbChKU09OLnN0cmluZ2lmeShtZXRhKSk7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICcubGluZS1tZXRhLWFkZCcsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyBtYWtlIG1ldGFkYXRhIEFkZCBWYWx1ZSBidXR0b24gd29yayBhbmQgbm90IHN1Ym1pdCB0aGUgZm9ybVxuICAgICAgICAgICAgdmFyIGFkZHJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1lZGl0LW1ldGEnKSwgdHlwZSwgdmFsdWU7XG4gICAgICAgICAgICB0eXBlID0gYWRkcm93LmZpbmQoJy5saW5lLW1ldGEtdHlwZScpLnZhbCgpO1xuICAgICAgICAgICAgdmFsdWUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS12YWx1ZScpLnZhbCgpO1xuICAgICAgICAgICAgYWRkcm93LmZpbmQoJzppbnB1dCcpLnZhbCgnJyk7IC8vIGNsZWFyIG91dCBpbnB1dHMgc28gYW5vdGhlciB2YWx1ZSBjYW4gYmUgZW50ZXJlZFxuICAgICAgICAgICAgaWYgKEVERERhdGEuTWV0YURhdGFUeXBlc1t0eXBlXSkge1xuICAgICAgICAgICAgICAgIGluc2VydExpbmVNZXRhZGF0YVJvdyhhZGRyb3csIHR5cGUsIHZhbHVlKS5maW5kKCc6aW5wdXQnKS50cmlnZ2VyKCdjaGFuZ2UnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5tZXRhLXJlbW92ZScsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyByZW1vdmUgbWV0YWRhdGEgcm93IGFuZCBpbnNlcnQgbnVsbCB2YWx1ZSBmb3IgdGhlIG1ldGFkYXRhIGtleVxuICAgICAgICAgICAgdmFyIGZvcm0gPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnZm9ybScpLFxuICAgICAgICAgICAgICAgIG1ldGFSb3cgPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnLmxpbmUtbWV0YScpLFxuICAgICAgICAgICAgICAgIG1ldGFJbiA9IGZvcm0uZmluZCgnW25hbWU9bGluZS1tZXRhX3N0b3JlXScpLFxuICAgICAgICAgICAgICAgIG1ldGEgPSBKU09OLnBhcnNlKG1ldGFJbi52YWwoKSB8fCAne30nKSxcbiAgICAgICAgICAgICAgICBrZXkgPSBtZXRhUm93LmF0dHIoJ2lkJykubWF0Y2goLy0oXFxkKykkLylbMV07XG4gICAgICAgICAgICBtZXRhW2tleV0gPSBudWxsO1xuICAgICAgICAgICAgbWV0YUluLnZhbChKU09OLnN0cmluZ2lmeShtZXRhKSk7XG4gICAgICAgICAgICBtZXRhUm93LnJlbW92ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgJCh3aW5kb3cpLmxvYWQocHJlcGFyZVBlcm1pc3Npb25zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcmVwYXJlUGVybWlzc2lvbnMoKSB7XG4gICAgICAgIHZhciB1c2VyOiBKUXVlcnksIGdyb3VwOiBKUXVlcnk7XG4gICAgICAgIC8vIFRPRE8gdGhlIERPTSB0cmF2ZXJzaW5nIGFuZCBmaWx0ZXJpbmcgaGVyZSBpcyB2ZXJ5IGhhY2t5LCBkbyBpdCBiZXR0ZXIgbGF0ZXJcbiAgICAgICAgdXNlciA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUoJCgnI3Blcm1pc3Npb25fdXNlcl9ib3gnKSk7XG4gICAgICAgIGdyb3VwID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZSgkKCcjcGVybWlzc2lvbl9ncm91cF9ib3gnKSk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSh1c2VyLCAnVXNlcicpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZ3JvdXAsICdHcm91cCcpO1xuICAgICAgICAkKCdmb3JtLnBlcm1pc3Npb25zJylcbiAgICAgICAgICAgIC5vbignY2hhbmdlJywgJzpyYWRpbycsIChldjpKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcmFkaW86IEpRdWVyeSA9ICQoZXYudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAkKCcucGVybWlzc2lvbnMnKS5maW5kKCc6cmFkaW8nKS5lYWNoKChpOiBudW1iZXIsIHI6IEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJChyKS5jbG9zZXN0KCdzcGFuJykuZmluZCgnLmF1dG9jb21wJykucHJvcCgnZGlzYWJsZWQnLCAhJChyKS5wcm9wKCdjaGVja2VkJykpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChyYWRpby5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFkaW8uY2xvc2VzdCgnc3BhbicpLmZpbmQoJy5hdXRvY29tcDp2aXNpYmxlJykuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdzdWJtaXQnLCAoZXY6SlF1ZXJ5RXZlbnRPYmplY3QpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcGVybTogYW55ID0ge30sIGtsYXNzOiBzdHJpbmcsIGF1dG86IEpRdWVyeTtcbiAgICAgICAgICAgICAgICBhdXRvID0gJCgnZm9ybS5wZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPWNsYXNzXTpjaGVja2VkJyk7XG4gICAgICAgICAgICAgICAga2xhc3MgPSBhdXRvLnZhbCgpO1xuICAgICAgICAgICAgICAgIHBlcm0udHlwZSA9ICQoJ2Zvcm0ucGVybWlzc2lvbnMnKS5maW5kKCdbbmFtZT10eXBlXScpLnZhbCgpO1xuICAgICAgICAgICAgICAgIHBlcm1ba2xhc3MudG9Mb3dlckNhc2UoKV0gPSB7ICdpZCc6IGF1dG8uY2xvc2VzdCgnc3BhbicpLmZpbmQoJ2lucHV0OmhpZGRlbicpLnZhbCgpIH07XG4gICAgICAgICAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICAgICAgICAgJ3VybCc6ICdwZXJtaXNzaW9ucy8nLFxuICAgICAgICAgICAgICAgICAgICAndHlwZSc6ICdQT1NUJyxcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IEpTT04uc3RyaW5naWZ5KFtwZXJtXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAnY3NyZm1pZGRsZXdhcmV0b2tlbic6ICQoJ2Zvcm0ucGVybWlzc2lvbnMnKS5maW5kKCdbbmFtZT1jc3JmbWlkZGxld2FyZXRva2VuXScpLnZhbCgpXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICdzdWNjZXNzJzogKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydTZXQgcGVybWlzc2lvbjogJywgSlNPTi5zdHJpbmdpZnkocGVybSldLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dCgnU2V0IFBlcm1pc3Npb24nKS5hZGRDbGFzcygnc3VjY2VzcycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKCQoJ2Zvcm0ucGVybWlzc2lvbnMnKSkuZGVsYXkoNTAwMCkuZmFkZU91dCgyMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlcnIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnU2V0dGluZyBwZXJtaXNzaW9uIGZhaWxlZDogJywgc3RhdHVzLCAnOycsIGVycl0uam9pbignJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KCdTZXJ2ZXIgRXJyb3I6ICcgKyBlcnIpLmFkZENsYXNzKCdiYWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCdmb3JtLnBlcm1pc3Npb25zJykpLmRlbGF5KDUwMDApLmZhZGVPdXQoMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbmQoJzpyYWRpbycpLnRyaWdnZXIoJ2NoYW5nZScpLmVuZCgpXG4gICAgICAgICAgICAucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NDYXJib25CYWxhbmNlRGF0YSgpIHtcbiAgICAgICAgLy8gUHJlcGFyZSB0aGUgY2FyYm9uIGJhbGFuY2UgZ3JhcGhcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YSA9IG5ldyBDYXJib25CYWxhbmNlLkRpc3BsYXkoKTtcbiAgICAgICAgdmFyIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQgPSBmYWxzZTtcbiAgICAgICAgaWYgKCB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA+IC0xICkge1xuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YS5jYWxjdWxhdGVDYXJib25CYWxhbmNlcyh0aGlzLm1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICAvLyBIaWdobGlnaHQgdGhlIFwiU2hvdyBDYXJib24gQmFsYW5jZVwiIGNoZWNrYm94IGluIHJlZCBpZiB0aGVyZSBhcmUgQ0IgaXNzdWVzLlxuICAgICAgICAgICAgaWYgKHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuZ2V0TnVtYmVyT2ZJbWJhbGFuY2VzKCkgPiAwKSB7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBIaWdobGlnaHQgdGhlIGNhcmJvbiBiYWxhbmNlIGluIHJlZCB0byBpbmRpY2F0ZSB0aGF0IHdlIGNhbid0IGNhbGN1bGF0ZVxuICAgICAgICAgICAgLy8gY2FyYm9uIGJhbGFuY2VzIHlldC4gV2hlbiB0aGV5IGNsaWNrIHRoZSBjaGVja2JveCwgd2UnbGwgZ2V0IHRoZW0gdG9cbiAgICAgICAgICAgIC8vIHNwZWNpZnkgd2hpY2ggU0JNTCBmaWxlIHRvIHVzZSBmb3IgYmlvbWFzcy5cbiAgICAgICAgICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMuaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldChoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGZpbHRlclRhYmxlS2V5RG93bihjb250ZXh0LCBlKSB7XG4gICAgICAgIHN3aXRjaCAoZS5rZXlDb2RlKSB7XG4gICAgICAgICAgICBjYXNlIDM4OiAvLyB1cFxuICAgICAgICAgICAgY2FzZSA0MDogLy8gZG93blxuICAgICAgICAgICAgY2FzZSA5OiAgLy8gdGFiXG4gICAgICAgICAgICBjYXNlIDEzOiAvLyByZXR1cm5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIC8vIGlnbm9yZSBpZiB0aGUgZm9sbG93aW5nIGtleXMgYXJlIHByZXNzZWQ6IFtzaGlmdF0gW2NhcHNsb2NrXVxuICAgICAgICAgICAgICAgIGlmIChlLmtleUNvZGUgPiA4ICYmIGUua2V5Q29kZSA8IDMyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29udGV4dC5xdWV1ZU1haW5HcmFwaFJlbWFrZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgYnkgRGF0YUdyaWQgYWZ0ZXIgdGhlIExpbmVzIHRhYmxlIGlzIHJlbmRlcmVkXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVBZnRlckxpbmVzVGFibGUoKSB7XG4gICAgICAgIHZhciBjc0lEcztcbiAgICAgICAgLy8gUHJlcGFyZSB0aGUgbWFpbiBkYXRhIG92ZXJ2aWV3IGdyYXBoIGF0IHRoZSB0b3Agb2YgdGhlIHBhZ2VcbiAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoT2JqZWN0ID09PSBudWxsICYmICQoJyNtYWluZ3JhcGgnKS5zaXplKCkgPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0ID0gT2JqZWN0LmNyZWF0ZShTdHVkeURHcmFwaGluZyk7XG4gICAgICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdC5TZXR1cCgnbWFpbmdyYXBoJyk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQubWFpbkdyYXBoT2JqZWN0ID0gdGhpcy5tYWluR3JhcGhPYmplY3Q7XG4gICAgICAgIH1cblxuICAgICAgICAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5vbignbW91c2VvdmVyIG1vdXNlZG93biBtb3VzZXVwJywgKCkgPT4gdGhpcy5xdWV1ZU1haW5HcmFwaFJlbWFrZSgpKVxuICAgICAgICAgICAgICAgIC5vbigna2V5ZG93bicsIChlKSA9PiBmaWx0ZXJUYWJsZUtleURvd24odGhpcywgZSkpO1xuICAgICAgICAkKCcjc2VwYXJhdGVBeGVzQ2hlY2tib3gnKS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5xdWV1ZU1haW5HcmFwaFJlbWFrZSh0cnVlKSk7XG5cbiAgICAgICAgLy8gRW5hYmxlIGVkaXQgbGluZXMgYnV0dG9uXG4gICAgICAgICQoJyNlZGl0TGluZUJ1dHRvbicpLm9uKCdjbGljaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBidXR0b24gPSAkKGV2LnRhcmdldCksIGRhdGEgPSBidXR0b24uZGF0YSgpLCBmb3JtID0gY2xlYXJMaW5lRm9ybSgpLFxuICAgICAgICAgICAgICAgIGFsbE1ldGEgPSB7fSwgbWV0YVJvdztcbiAgICAgICAgICAgIGlmIChkYXRhLmlkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICBmaWxsTGluZUZvcm0oZm9ybSwgRURERGF0YS5MaW5lc1tkYXRhLmlkc1swXV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb21wdXRlIHVzZWQgbWV0YWRhdGEgZmllbGRzIG9uIGFsbCBkYXRhLmlkcywgaW5zZXJ0IG1ldGFkYXRhIHJvd3M/XG4gICAgICAgICAgICAgICAgZGF0YS5pZHMubWFwKChpZDpudW1iZXIpID0+IEVERERhdGEuTGluZXNbaWRdIHx8IHt9KS5mb3JFYWNoKChsaW5lOkxpbmVSZWNvcmQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJC5leHRlbmQoYWxsTWV0YSwgbGluZS5tZXRhIHx8IHt9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBtZXRhUm93ID0gZm9ybS5maW5kKCcubGluZS1lZGl0LW1ldGEnKTtcbiAgICAgICAgICAgICAgICAvLyBSdW4gdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBvZiBtZXRhZGF0YSwgYW5kIGFkZCBhIGZvcm0gZWxlbWVudCBlbnRyeSBmb3IgZWFjaFxuICAgICAgICAgICAgICAgICQuZWFjaChhbGxNZXRhLCAoa2V5KSA9PiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCAnJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlVUlMaW5lRm9ybShmb3JtLCBkYXRhLmNvdW50ID4gMSk7XG4gICAgICAgICAgICBzY3JvbGxUb0Zvcm0oZm9ybSk7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtaWRzXScpLnZhbChkYXRhLmlkcy5qb2luKCcsJykpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYWNreSBidXR0b24gZm9yIGNoYW5naW5nIHRoZSBtZXRhYm9saWMgbWFwXG4gICAgICAgICQoXCIjbWV0YWJvbGljTWFwTmFtZVwiKS5jbGljayggKCkgPT4gdGhpcy5vbkNsaWNrZWRNZXRhYm9saWNNYXBOYW1lKCkgKTtcblxuICAgICAgICByZXF1ZXN0QWxsTWV0YWJvbGl0ZURhdGEodGhpcyk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiByZXF1ZXN0QWxsTWV0YWJvbGl0ZURhdGEoY29udGV4dCkge1xuICAgICAgICAkLmVhY2goRURERGF0YS5Qcm90b2NvbHMsIChpZCwgcHJvdG9jb2wpID0+IHtcbiAgICAgICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAgICAgdXJsOiAnbWVhc3VyZW1lbnRzLycgKyBpZCArICcvJyxcbiAgICAgICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgICAgIGVycm9yOiAoeGhyLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBmZXRjaCBtZWFzdXJlbWVudCBkYXRhIG9uICcgKyBwcm90b2NvbC5uYW1lICsgJyEnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IChkYXRhKSA9PiB7IHByb2Nlc3NNZWFzdXJlbWVudERhdGEoY29udGV4dCwgZGF0YSwgcHJvdG9jb2wpOyB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RBc3NheURhdGEoYXNzYXkpIHtcbiAgICAgICAgdmFyIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIHVybDogWydtZWFzdXJlbWVudHMnLCBhc3NheS5waWQsIGFzc2F5LmlkLCAnJ10uam9pbignLycpLFxuICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgZXJyb3I6ICh4aHIsIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgYXNzYXkubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdWNjZXNzOiAoZGF0YSkgPT4geyBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKHRoaXMsIGRhdGEsIHByb3RvY29sKTsgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NNZWFzdXJlbWVudERhdGEoY29udGV4dCwgZGF0YSwgcHJvdG9jb2wpIHtcbiAgICAgICAgdmFyIGFzc2F5U2VlbiA9IHt9LFxuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5ID0ge30sXG4gICAgICAgICAgICBjb3VudF90b3RhbDpudW1iZXIgPSAwLFxuICAgICAgICAgICAgY291bnRfcmVjOm51bWJlciA9IDA7XG4gICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9O1xuICAgICAgICBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgPSAkLmV4dGVuZChFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgfHwge30sIGRhdGEudHlwZXMpO1xuICAgICAgICAvLyBhdHRhY2ggbWVhc3VyZW1lbnQgY291bnRzIHRvIGVhY2ggYXNzYXlcbiAgICAgICAgJC5lYWNoKGRhdGEudG90YWxfbWVhc3VyZXMsIChhc3NheUlkOnN0cmluZywgY291bnQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIC8vIGF0dGFjaCB2YWx1ZXNcbiAgICAgICAgICAgICQuZXh0ZW5kKG1lYXN1cmVtZW50LCB7ICd2YWx1ZXMnOiBkYXRhLmRhdGFbbWVhc3VyZW1lbnQuaWRdIHx8IFtdIH0pXG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50LmlkXSA9IG1lYXN1cmVtZW50O1xuICAgICAgICAgICAgLy8gdHJhY2sgd2hpY2ggYXNzYXlzIHJlY2VpdmVkIHVwZGF0ZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBhc3NheVNlZW5bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdID0gcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXVthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgLy8gaGFuZGxlIG1lYXN1cmVtZW50IGRhdGEgYmFzZWQgb24gdHlwZVxuICAgICAgICAgICAgbXR5cGUgPSBkYXRhLnR5cGVzW21lYXN1cmVtZW50LnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgKGFzc2F5Lm1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAoYXNzYXkubWV0YWJvbGl0ZXMgPSBhc3NheS5tZXRhYm9saXRlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAoYXNzYXkucHJvdGVpbnMgPSBhc3NheS5wcm90ZWlucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ2cnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIGdlbmUgLyB0cmFuc2NyaXB0XG4gICAgICAgICAgICAgICAgKGFzc2F5LnRyYW5zY3JpcHRpb25zID0gYXNzYXkudHJhbnNjcmlwdGlvbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAoYXNzYXkuZ2VuZXJhbCA9IGFzc2F5LmdlbmVyYWwgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb250ZXh0LnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhkYXRhLm1lYXN1cmVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICBpZiAoY291bnRfcmVjIDwgY291bnRfdG90YWwpIHtcbiAgICAgICAgICAgIC8vIFRPRE8gbm90IGFsbCBtZWFzdXJlbWVudHMgZG93bmxvYWRlZDsgZGlzcGxheSBhIG1lc3NhZ2UgaW5kaWNhdGluZyB0aGlzXG4gICAgICAgICAgICAvLyBleHBsYWluIGRvd25sb2FkaW5nIGluZGl2aWR1YWwgYXNzYXkgbWVhc3VyZW1lbnRzIHRvb1xuICAgICAgICB9XG4gICAgICAgIC8vIGludmFsaWRhdGUgYXNzYXlzIG9uIGFsbCBEYXRhR3JpZHM7IHJlZHJhd3MgdGhlIGFmZmVjdGVkIHJvd3NcbiAgICAgICAgJC5lYWNoKGNvbnRleHQuYXNzYXlzRGF0YUdyaWRzLCAocHJvdG9jb2xJZCwgZGF0YUdyaWQpID0+IHtcbiAgICAgICAgICAgIGRhdGFHcmlkLmludmFsaWRhdGVBc3NheVJlY29yZHMoT2JqZWN0LmtleXMocHJvdG9jb2xUb0Fzc2F5W3Byb3RvY29sSWRdIHx8IHt9KSk7XG4gICAgICAgIH0pO1xuICAgICAgICBjb250ZXh0LmxpbmVzRGF0YUdyaWRTcGVjLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodHJ1ZSk7XG4gICAgICAgIGNvbnRleHQucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCk7XG4gICAgICAgIGNvbnRleHQucXVldWVNYWluR3JhcGhSZW1ha2UoKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBjYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFjayhzcGVjOkRhdGFHcmlkU3BlY0xpbmVzLFxuICAgICAgICAgICAgZGF0YUdyaWRPYmo6RGF0YUdyaWQpIHtcbiAgICAgICAgU3R1ZHlELnJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzKCk7XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCBzaG93cyB0aGUgYWN0aW9ucyBwYW5lbC5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdygpIHtcbiAgICAgICAgaWYgKHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0ICh0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gbGluZXNBY3Rpb25QYW5lbFNob3codGhpcyksIDE1MCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBsaW5lc0FjdGlvblBhbmVsU2hvdyhjb250ZXh0KSB7XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgbGluZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICB2YXIgY2hlY2tlZEJveGVzID0gW10sIGNoZWNrZWRMZW4sIGxpbmVzQWN0aW9uUGFuZWw7XG4gICAgICAgIGlmIChjb250ZXh0LmxpbmVzRGF0YUdyaWQpIHtcbiAgICAgICAgICAgIGNoZWNrZWRCb3hlcyA9IGNvbnRleHQubGluZXNEYXRhR3JpZC5nZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTtcbiAgICAgICAgfVxuICAgICAgICBjaGVja2VkTGVuID0gY2hlY2tlZEJveGVzLmxlbmd0aDtcbiAgICAgICAgbGluZXNBY3Rpb25QYW5lbCA9ICQoJyNsaW5lc0FjdGlvblBhbmVsJykudG9nZ2xlQ2xhc3MoJ29mZicsICFjaGVja2VkTGVuKTtcbiAgICAgICAgJCgnI2xpbmVzU2VsZWN0ZWRDZWxsJykuZW1wdHkoKS50ZXh0KGNoZWNrZWRMZW4gKyAnIHNlbGVjdGVkJyk7XG4gICAgICAgIC8vIGVuYWJsZSBzaW5ndWxhci9wbHVyYWwgY2hhbmdlc1xuICAgICAgICAkKCcjY2xvbmVMaW5lQnV0dG9uJykudGV4dCgnQ2xvbmUgTGluZScgKyAoY2hlY2tlZExlbiA+IDEgPyAncycgOiAnJykpO1xuICAgICAgICAkKCcjZWRpdExpbmVCdXR0b24nKS50ZXh0KCdFZGl0IExpbmUnICsgKGNoZWNrZWRMZW4gPiAxID8gJ3MnIDogJycpKS5kYXRhKHtcbiAgICAgICAgICAgICdjb3VudCc6IGNoZWNrZWRMZW4sXG4gICAgICAgICAgICAnaWRzJzogY2hlY2tlZEJveGVzLm1hcCgoYm94OkhUTUxJbnB1dEVsZW1lbnQpID0+IGJveC52YWx1ZSlcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNncm91cExpbmVCdXR0b24nKS50b2dnbGVDbGFzcygnb2ZmJywgY2hlY2tlZExlbiA8IDIpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICAgICAgLy8gVGhpcyB3YXkgd2UncmUgbm90IGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW5cbiAgICAgICAgLy8gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgICAgIGlmICh0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gYXNzYXlzQWN0aW9uUGFuZWxTaG93KHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gYXNzYXlzQWN0aW9uUGFuZWxTaG93KGNvbnRleHQpIHtcbiAgICAgICAgdmFyIGNoZWNrZWRCb3hlcyA9IFtdLCBjaGVja2VkQXNzYXlzLCBjaGVja2VkTWVhc3VyZSwgcGFuZWwsIGluZm9ib3g7XG4gICAgICAgIHBhbmVsID0gJCgnI2Fzc2F5c0FjdGlvblBhbmVsJyk7XG4gICAgICAgIGlmICghcGFuZWwuc2l6ZSgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmlndXJlIG91dCBob3cgbWFueSBhc3NheXMvY2hlY2tib3hlcyBhcmUgc2VsZWN0ZWQuXG4gICAgICAgICQuZWFjaChjb250ZXh0LmFzc2F5c0RhdGFHcmlkcywgKHBJRCwgZGF0YUdyaWQpID0+IHtcbiAgICAgICAgICAgIGNoZWNrZWRCb3hlcyA9IGNoZWNrZWRCb3hlcy5jb25jYXQoZGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzKCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgY2hlY2tlZEFzc2F5cyA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJ1tpZF49YXNzYXldJykuc2l6ZSgpO1xuICAgICAgICBjaGVja2VkTWVhc3VyZSA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJzpub3QoW2lkXj1hc3NheV0pJykuc2l6ZSgpO1xuICAgICAgICBwYW5lbC50b2dnbGVDbGFzcygnb2ZmJywgIWNoZWNrZWRBc3NheXMgJiYgIWNoZWNrZWRNZWFzdXJlKTtcbiAgICAgICAgaWYgKGNoZWNrZWRBc3NheXMgfHwgY2hlY2tlZE1lYXN1cmUpIHtcbiAgICAgICAgICAgIGluZm9ib3ggPSAkKCcjYXNzYXlzU2VsZWN0ZWRDZWxsJykuZW1wdHkoKTtcbiAgICAgICAgICAgIGlmIChjaGVja2VkQXNzYXlzKSB7XG4gICAgICAgICAgICAgICAgJChcIjxwPlwiKS5hcHBlbmRUbyhpbmZvYm94KS50ZXh0KChjaGVja2VkQXNzYXlzID4gMSkgP1xuICAgICAgICAgICAgICAgICAgICAgICAgKGNoZWNrZWRBc3NheXMgKyBcIiBBc3NheXMgc2VsZWN0ZWRcIikgOiBcIjEgQXNzYXkgc2VsZWN0ZWRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2hlY2tlZE1lYXN1cmUpIHtcbiAgICAgICAgICAgICAgICAkKFwiPHA+XCIpLmFwcGVuZFRvKGluZm9ib3gpLnRleHQoKGNoZWNrZWRNZWFzdXJlID4gMSkgP1xuICAgICAgICAgICAgICAgICAgICAgICAgKGNoZWNrZWRNZWFzdXJlICsgXCIgTWVhc3VyZW1lbnRzIHNlbGVjdGVkXCIpIDogXCIxIE1lYXN1cmVtZW50IHNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIGEgZ3JhcGguIFRoaXMgd2F5IHdlJ3JlIG5vdFxuICAgIC8vIGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW4gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlTWFpbkdyYXBoUmVtYWtlKGZvcmNlPzpib29sZWFuKSB7XG4gICAgICAgIGlmICh0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQoKCkgPT4gcmVtYWtlTWFpbkdyYXBoQXJlYSh0aGlzLCBmb3JjZSksIDIwMCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiByZW1ha2VNYWluR3JhcGhBcmVhKGNvbnRleHQ6YW55LCBmb3JjZT86Ym9vbGVhbikge1xuICAgICAgICB2YXIgcHJldmlvdXNJRFNldDphbnlbXSwgcG9zdEZpbHRlcmluZ01lYXN1cmVtZW50czphbnlbXSxcbiAgICAgICAgICAgIGRhdGFQb2ludHNEaXNwbGF5ZWQgPSAwLFxuICAgICAgICAgICAgZGF0YVBvaW50c1RvdGFsID0gMCxcbiAgICAgICAgICAgIHNlcGFyYXRlQXhlcyA9ICQoJyNzZXBhcmF0ZUF4ZXNDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSxcbiAgICAgICAgICAgIC8vIEZJWE1FIGFzc3VtZXMgKHgwLCB5MCkgcG9pbnRzXG4gICAgICAgICAgICBjb252ZXJ0ID0gKGQpID0+IHsgcmV0dXJuIFtbIGRbMF1bMF0sIGRbMV1bMF0gXV07IH0sXG4gICAgICAgICAgICBjb21wYXJlID0gKGEsIGIpID0+IHsgcmV0dXJuIGFbMF0gLSBiWzBdOyB9O1xuICAgICAgICBjb250ZXh0Lm1haW5HcmFwaFJlZnJlc2hUaW1lcklEID0gMDtcbiAgICAgICAgaWYgKCFjb250ZXh0LnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmNoZWNrUmVkcmF3UmVxdWlyZWQoZm9yY2UpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gU3RhcnQgb3V0IHdpdGggYSBibGFuayBncmFwaC4gIFdlIHdpbGwgcmUtYWRkIGFsbCB0aGUgcmVsZXZhbnQgc2V0cy5cbiAgICAgICAgY29udGV4dC5tYWluR3JhcGhPYmplY3QuY2xlYXJBbGxTZXRzKCk7XG4gICAgICAgIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMgPSBjb250ZXh0LnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkRmlsdGVyZWRNZWFzdXJlbWVudHMoKTtcblxuICAgICAgICAkLmVhY2gocG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cywgKGksIG1lYXN1cmVtZW50SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50SWRdLFxuICAgICAgICAgICAgICAgIG10eXBlOk1lYXN1cmVtZW50VHlwZVJlY29yZCA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdLFxuICAgICAgICAgICAgICAgIHBvaW50cyA9IChtZWFzdXJlLnZhbHVlcyA/IG1lYXN1cmUudmFsdWVzLmxlbmd0aCA6IDApLFxuICAgICAgICAgICAgICAgIGFzc2F5LCBsaW5lLCBwcm90b2NvbCwgbmV3U2V0O1xuICAgICAgICAgICAgZGF0YVBvaW50c1RvdGFsICs9IHBvaW50cztcbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzRGlzcGxheWVkID4gMTUwMDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIFNraXAgdGhlIHJlc3QgaWYgd2UndmUgaGl0IG91ciBsaW1pdFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGF0YVBvaW50c0Rpc3BsYXllZCArPSBwb2ludHM7XG4gICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldIHx8IHt9O1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSB8fCB7fTtcbiAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXSB8fCB7fTtcbiAgICAgICAgICAgIG5ld1NldCA9IHtcbiAgICAgICAgICAgICAgICAnbGFiZWwnOiAnZHQnICsgbWVhc3VyZW1lbnRJZCxcbiAgICAgICAgICAgICAgICAnbWVhc3VyZW1lbnRuYW1lJzogVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb05hbWUobWVhc3VyZSksXG4gICAgICAgICAgICAgICAgJ25hbWUnOiBbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyksXG4gICAgICAgICAgICAgICAgJ3VuaXRzJzogVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb1VuaXRzKG1lYXN1cmUpLFxuICAgICAgICAgICAgICAgICdkYXRhJzogJC5tYXAobWVhc3VyZS52YWx1ZXMsIGNvbnZlcnQpLnNvcnQoY29tcGFyZSlcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAobGluZS5jb250cm9sKSBuZXdTZXQuaXNjb250cm9sID0gMTtcbiAgICAgICAgICAgIGlmIChzZXBhcmF0ZUF4ZXMpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgbWVhc3VyZW1lbnQgaXMgYSBtZXRhYm9saXRlLCBjaG9vc2UgdGhlIGF4aXMgYnkgdHlwZS4gSWYgaXQncyBhbnlcbiAgICAgICAgICAgICAgICAvLyBvdGhlciBzdWJ0eXBlLCBjaG9vc2UgdGhlIGF4aXMgYmFzZWQgb24gdGhhdCBzdWJ0eXBlLCB3aXRoIGFuIG9mZnNldCB0byBhdm9pZFxuICAgICAgICAgICAgICAgIC8vIGNvbGxpZGluZyB3aXRoIHRoZSBtZXRhYm9saXRlIGF4ZXMuXG4gICAgICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ld1NldC55YXhpc0J5TWVhc3VyZW1lbnRUeXBlSUQgPSBtdHlwZS5pZDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXdTZXQueWF4aXNCeU1lYXN1cmVtZW50VHlwZUlEID0gbXR5cGUuZmFtaWx5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRleHQubWFpbkdyYXBoT2JqZWN0LmFkZE5ld1NldChuZXdTZXQpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlzcGxheVRleHQgPSBkYXRhUG9pbnRzRGlzcGxheWVkICsgXCIgcG9pbnRzIGRpc3BsYXllZFwiO1xuICAgICAgICBpZiAoZGF0YVBvaW50c0Rpc3BsYXllZCAhPSBkYXRhUG9pbnRzVG90YWwpIHtcbiAgICAgICAgICAgIGRpc3BsYXlUZXh0ICs9IFwiIChvdXQgb2YgXCIgKyBkYXRhUG9pbnRzVG90YWwgKyBcIilcIjtcbiAgICAgICAgfVxuICAgICAgICAkKCcjcG9pbnRzRGlzcGxheWVkU3BhbicpLmVtcHR5KCkudGV4dChkaXNwbGF5VGV4dCk7XG5cbiAgICAgICAgY29udGV4dC5tYWluR3JhcGhPYmplY3QuZHJhd1NldHMoKTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGNsZWFyQXNzYXlGb3JtKCk6SlF1ZXJ5IHtcbiAgICAgICAgdmFyIGZvcm06SlF1ZXJ5ID0gJCgnI2lkX2Fzc2F5LWFzc2F5X2lkJykuY2xvc2VzdCgnLmRpc2Nsb3NlJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWFzc2F5LV0nKS52YWwoJycpLmVuZCgpLmZpbmQoJy5jYW5jZWwtbGluaycpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5lcnJvcmxpc3QnKS5yZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGZvcm07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJMaW5lRm9ybSgpIHtcbiAgICAgICAgdmFyIGZvcm0gPSAkKCcjaWRfbGluZS1pZHMnKS5jbG9zZXN0KCcuZGlzY2xvc2UnKTtcbiAgICAgICAgZm9ybS5maW5kKCcubGluZS1tZXRhJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnOmlucHV0JykuZmlsdGVyKCdbbmFtZV49bGluZS1dJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmNhbmNlbC1saW5rJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmJ1bGsnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIGZvcm0ub2ZmKCdjaGFuZ2UuYnVsaycpO1xuICAgICAgICByZXR1cm4gZm9ybTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaWxsQXNzYXlGb3JtKGZvcm0sIHJlY29yZCkge1xuICAgICAgICB2YXIgdXNlciA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmV4cGVyaW1lbnRlcl07XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktYXNzYXlfaWRdJykudmFsKHJlY29yZC5pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktbmFtZV0nKS52YWwocmVjb3JkLm5hbWUpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWRlc2NyaXB0aW9uXScpLnZhbChyZWNvcmQuZGVzY3JpcHRpb24pO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LXByb3RvY29sXScpLnZhbChyZWNvcmQucGlkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1leHBlcmltZW50ZXJfMF0nKS52YWwodXNlciAmJiB1c2VyLnVpZCA/IHVzZXIudWlkIDogJy0tJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzFdJykudmFsKHJlY29yZC5leHBlcmltZW50ZXIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbGxMaW5lRm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIG1ldGFSb3csIGV4cGVyaW1lbnRlciwgY29udGFjdDtcbiAgICAgICAgZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1tyZWNvcmQuZXhwZXJpbWVudGVyXTtcbiAgICAgICAgY29udGFjdCA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmNvbnRhY3QudXNlcl9pZF07XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1pZHNdJykudmFsKHJlY29yZC5pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1uYW1lXScpLnZhbChyZWNvcmQubmFtZSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRyb2xdJykucHJvcCgnY2hlY2tlZCcsIHJlY29yZC5jb250cm9sKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRhY3RfMF0nKS52YWwocmVjb3JkLmNvbnRhY3QudGV4dCB8fCAoY29udGFjdCAmJiBjb250YWN0LnVpZCA/IGNvbnRhY3QudWlkIDogJy0tJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY29udGFjdF8xXScpLnZhbChyZWNvcmQuY29udGFjdC51c2VyX2lkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWV4cGVyaW1lbnRlcl8wXScpLnZhbChleHBlcmltZW50ZXIgJiYgZXhwZXJpbWVudGVyLnVpZCA/IGV4cGVyaW1lbnRlci51aWQgOiAnLS0nKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNhcmJvbl9zb3VyY2VfMF0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLmNhcmJvbi5tYXAoKHYpID0+IChFREREYXRhLkNTb3VyY2VzW3ZdIHx8IDxDYXJib25Tb3VyY2VSZWNvcmQ+e30pLm5hbWUgfHwgJy0tJykuam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNhcmJvbl9zb3VyY2VfMV0nKS52YWwocmVjb3JkLmNhcmJvbi5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18wXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuc3RyYWluLm1hcCgodikgPT4gKEVERERhdGEuU3RyYWluc1t2XSB8fCA8U3RyYWluUmVjb3JkPnt9KS5uYW1lIHx8ICctLScpLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzFdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5zdHJhaW4ubWFwKCh2KSA9PiAoRURERGF0YS5TdHJhaW5zW3ZdIHx8IDxTdHJhaW5SZWNvcmQ+e30pLnJlZ2lzdHJ5X2lkIHx8ICcnKS5qb2luKCcsJykpO1xuICAgICAgICBpZiAocmVjb3JkLnN0cmFpbi5sZW5ndGggJiYgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMV0nKS52YWwoKSA9PT0gJycpIHtcbiAgICAgICAgICAgICQoJzxsaT4nKS50ZXh0KCdTdHJhaW4gZG9lcyBub3QgaGF2ZSBhIGxpbmtlZCBJQ0UgZW50cnkhICcgK1xuICAgICAgICAgICAgICAgICAgICAnU2F2aW5nIHRoZSBsaW5lIHdpdGhvdXQgbGlua2luZyB0byBJQ0Ugd2lsbCByZW1vdmUgdGhlIHN0cmFpbi4nKVxuICAgICAgICAgICAgICAgIC53cmFwKCc8dWw+JykucGFyZW50KCkuYWRkQ2xhc3MoJ2Vycm9ybGlzdCcpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzBdJykucGFyZW50KCkpO1xuICAgICAgICB9XG4gICAgICAgIG1ldGFSb3cgPSBmb3JtLmZpbmQoJy5saW5lLWVkaXQtbWV0YScpO1xuICAgICAgICAvLyBSdW4gdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBvZiBtZXRhZGF0YSwgYW5kIGFkZCBhIGZvcm0gZWxlbWVudCBlbnRyeSBmb3IgZWFjaFxuICAgICAgICAkLmVhY2gocmVjb3JkLm1ldGEsIChrZXksIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCB2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBzdG9yZSBvcmlnaW5hbCBtZXRhZGF0YSBpbiBpbml0aWFsLSBmaWVsZFxuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKS52YWwoSlNPTi5zdHJpbmdpZnkocmVjb3JkLm1ldGEpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1pbml0aWFsLWxpbmUtbWV0YV9zdG9yZV0nKS52YWwoSlNPTi5zdHJpbmdpZnkocmVjb3JkLm1ldGEpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY3JvbGxUb0Zvcm0oZm9ybSkge1xuICAgICAgICAvLyBtYWtlIHN1cmUgZm9ybSBpcyBkaXNjbG9zZWRcbiAgICAgICAgdmFyIHRvcCA9IGZvcm0udG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScsIGZhbHNlKS5vZmZzZXQoKS50b3A7XG4gICAgICAgICQoJ2h0bWwnKS5hbmltYXRlKHsgJ3Njcm9sbFRvcCc6IHRvcCB9LCAnc2xvdycpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZVVJQXNzYXlGb3JtKGZvcm0pIHtcbiAgICAgICAgdmFyIHRpdGxlLCBidXR0b247XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgZGlzY2xvc2UgdGl0bGUgdG8gcmVhZCBFZGl0XG4gICAgICAgIHRpdGxlID0gZm9ybS5maW5kKCcuZGlzY2xvc2VMaW5rID4gYScpLnRleHQoJ0VkaXQgQXNzYXknKTtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBidXR0b24gdG8gcmVhZCBFZGl0XG4gICAgICAgIGJ1dHRvbiA9IGZvcm0uZmluZCgnW25hbWU9YWN0aW9uXVt2YWx1ZT1hc3NheV0nKS50ZXh0KCdFZGl0IEFzc2F5Jyk7XG4gICAgICAgIC8vIEFkZCBsaW5rIHRvIHJldmVydCBiYWNrIHRvICdBZGQgTGluZScgZm9ybVxuICAgICAgICAkKCc8YSBocmVmPVwiI1wiPkNhbmNlbDwvYT4nKS5hZGRDbGFzcygnY2FuY2VsLWxpbmsnKS5vbignY2xpY2snLCAoZXYpID0+IHtcbiAgICAgICAgICAgIGNsZWFyQXNzYXlGb3JtKCk7XG4gICAgICAgICAgICB0aXRsZS50ZXh0KCdBZGQgQXNzYXlzIFRvIFNlbGVjdGVkIExpbmVzJyk7XG4gICAgICAgICAgICBidXR0b24udGV4dCgnQWRkIEFzc2F5Jyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLmluc2VydEFmdGVyKGJ1dHRvbik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlVUlMaW5lRm9ybShmb3JtLCBwbHVyYWw/KSB7XG4gICAgICAgIHZhciB0aXRsZSwgYnV0dG9uLCB0ZXh0ID0gJ0VkaXQgTGluZScgKyAocGx1cmFsID8gJ3MnIDogJycpO1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGRpc2Nsb3NlIHRpdGxlIHRvIHJlYWQgJ0VkaXQgTGluZSdcbiAgICAgICAgdGl0bGUgPSBmb3JtLmZpbmQoJy5kaXNjbG9zZUxpbmsgPiBhJykudGV4dCh0ZXh0KTtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBidXR0b24gdG8gcmVhZCAnRWRpdCBMaW5lJ1xuICAgICAgICBidXR0b24gPSBmb3JtLmZpbmQoJ1tuYW1lPWFjdGlvbl1bdmFsdWU9bGluZV0nKS50ZXh0KHRleHQpO1xuICAgICAgICBpZiAocGx1cmFsKSB7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5idWxrJykucHJvcCgnY2hlY2tlZCcsIGZhbHNlKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBmb3JtLm9uKCdjaGFuZ2UuYnVsaycsICc6aW5wdXQnLCAoZXY6SlF1ZXJ5RXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAkKGV2LnRhcmdldCkuc2libGluZ3MoJ2xhYmVsJykuZmluZCgnLmJ1bGsnKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBZGQgbGluayB0byByZXZlcnQgYmFjayB0byAnQWRkIExpbmUnIGZvcm1cbiAgICAgICAgJCgnPGEgaHJlZj1cIiNcIj5DYW5jZWw8L2E+JykuYWRkQ2xhc3MoJ2NhbmNlbC1saW5rJykub24oJ2NsaWNrJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBjbGVhckxpbmVGb3JtKCk7XG4gICAgICAgICAgICB0aXRsZS50ZXh0KCdBZGQgQSBOZXcgTGluZScpO1xuICAgICAgICAgICAgYnV0dG9uLnRleHQoJ0FkZCBMaW5lJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLmluc2VydEFmdGVyKGJ1dHRvbik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5zZXJ0TGluZU1ldGFkYXRhUm93KHJlZlJvdywga2V5LCB2YWx1ZSkge1xuICAgICAgICB2YXIgcm93LCB0eXBlLCBsYWJlbCwgaW5wdXQsIGlkID0gJ2xpbmUtbWV0YS0nICsga2V5O1xuICAgICAgICByb3cgPSAkKCc8cD4nKS5hdHRyKCdpZCcsICdyb3dfJyArIGlkKS5hZGRDbGFzcygnbGluZS1tZXRhJykuaW5zZXJ0QmVmb3JlKHJlZlJvdyk7XG4gICAgICAgIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNba2V5XTtcbiAgICAgICAgbGFiZWwgPSAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgJ2lkXycgKyBpZCkudGV4dCh0eXBlLm5hbWUpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgIC8vIGJ1bGsgY2hlY2tib3g/XG4gICAgICAgIGlucHV0ID0gJCgnPGlucHV0IHR5cGU9XCJ0ZXh0XCI+JykuYXR0cignaWQnLCAnaWRfJyArIGlkKS52YWwodmFsdWUpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgIGlmICh0eXBlLnByZSkge1xuICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcHJlZml4JykudGV4dCh0eXBlLnByZSkuaW5zZXJ0QmVmb3JlKGlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1yZW1vdmUnKS50ZXh0KCdSZW1vdmUnKS5pbnNlcnRBZnRlcihpbnB1dCk7XG4gICAgICAgIGlmICh0eXBlLnBvc3RmaXgpIHtcbiAgICAgICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXBvc3RmaXgnKS50ZXh0KHR5cGUucG9zdGZpeCkuaW5zZXJ0QWZ0ZXIoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3c7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGVkaXRBc3NheShpbmRleDpudW1iZXIpOnZvaWQge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBmb3JtO1xuICAgICAgICBpZiAoIXJlY29yZCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ludmFsaWQgQXNzYXkgcmVjb3JkIGZvciBlZGl0aW5nOiAnICsgaW5kZXgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9ybSA9IGNsZWFyQXNzYXlGb3JtKCk7IC8vIFwiZm9ybVwiIGlzIGFjdHVhbGx5IHRoZSBkaXNjbG9zZSBibG9ja1xuICAgICAgICBmaWxsQXNzYXlGb3JtKGZvcm0sIHJlY29yZCk7XG4gICAgICAgIHVwZGF0ZVVJQXNzYXlGb3JtKGZvcm0pO1xuICAgICAgICBzY3JvbGxUb0Zvcm0oZm9ybSk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGVkaXRMaW5lKGluZGV4Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkxpbmVzW2luZGV4XSwgZm9ybTtcbiAgICAgICAgaWYgKCFyZWNvcmQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJbnZhbGlkIExpbmUgcmVjb3JkIGZvciBlZGl0aW5nOiAnICsgaW5kZXgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9ybSA9IGNsZWFyTGluZUZvcm0oKTsgLy8gXCJmb3JtXCIgaXMgYWN0dWFsbHkgdGhlIGRpc2Nsb3NlIGJsb2NrXG4gICAgICAgIGZpbGxMaW5lRm9ybShmb3JtLCByZWNvcmQpO1xuICAgICAgICB1cGRhdGVVSUxpbmVGb3JtKGZvcm0pO1xuICAgICAgICBzY3JvbGxUb0Zvcm0oZm9ybSk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DaGFuZ2VkTWV0YWJvbGljTWFwKCkge1xuICAgICAgICBpZiAodGhpcy5tZXRhYm9saWNNYXBOYW1lKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgdGhlIFVJIHRvIHNob3cgdGhlIG5ldyBmaWxlbmFtZSBmb3IgdGhlIG1ldGFib2xpYyBtYXAuXG4gICAgICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuaHRtbCh0aGlzLm1ldGFib2xpY01hcE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmh0bWwoJyhub25lKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICYmIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICE9IC0xKSB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2FyYm9uIGJhbGFuY2VzIG5vdyB0aGF0IHdlIGNhbi5cbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY2FsY3VsYXRlQ2FyYm9uQmFsYW5jZXModGhpcy5tZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBSZWJ1aWxkIHRoZSBDQiBncmFwaHMuXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKSB7XG4gICAgICAgIHZhciBjZWxsT2JqczpEYXRhR3JpZERhdGFDZWxsW10sXG4gICAgICAgICAgICBncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyA9IHRoaXMubGluZXNEYXRhR3JpZFNwZWMuY2FyYm9uQmFsYW5jZUNvbDtcbiAgICAgICAgaWYgKHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJvcCBhbnkgcHJldmlvdXNseSBjcmVhdGVkIENhcmJvbiBCYWxhbmNlIFNWRyBlbGVtZW50cyBmcm9tIHRoZSBET00uXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEucmVtb3ZlQWxsQ0JHcmFwaHMoKTtcbiAgICAgICAgY2VsbE9ianMgPSBbXTtcbiAgICAgICAgLy8gZ2V0IGFsbCBjZWxscyBmcm9tIGFsbCBjb2x1bW5zIGluIHRoZSBjb2x1bW4gZ3JvdXBcbiAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucy5mb3JFYWNoKChjb2w6RGF0YUdyaWRDb2x1bW5TcGVjKTp2b2lkID0+IHtcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGNlbGxPYmpzLCBjb2wuZ2V0RW50aXJlSW5kZXgoKSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBjcmVhdGUgY2FyYm9uIGJhbGFuY2UgZ3JhcGggZm9yIGVhY2ggY2VsbFxuICAgICAgICBjZWxsT2Jqcy5mb3JFYWNoKChjZWxsOkRhdGFHcmlkRGF0YUNlbGwpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY3JlYXRlQ0JHcmFwaEZvckxpbmUoY2VsbC5yZWNvcmRJRCwgY2VsbC5jZWxsRWxlbWVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IHRydWU7XG4gICAgfVxuXG5cbiAgICAvLyBUaGV5IHdhbnQgdG8gc2VsZWN0IGEgZGlmZmVyZW50IG1ldGFib2xpYyBtYXAuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUoKTp2b2lkIHtcbiAgICAgICAgdmFyIHVpOlN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlcixcbiAgICAgICAgICAgIGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQgPSAoZXJyb3I6c3RyaW5nLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwTmFtZT86c3RyaW5nLFxuICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzcz86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gbWV0YWJvbGljTWFwSUQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBOYW1lID0gbWV0YWJvbGljTWFwTmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA9IGZpbmFsQmlvbWFzcztcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2hhbmdlZE1ldGFib2xpY01hcCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIm9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUgZXJyb3I6IFwiICsgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB1aSA9IG5ldyBTdHVkeU1ldGFib2xpY01hcENob29zZXIoZmFsc2UsIGNhbGxiYWNrKTtcbiAgICB9XG59O1xuXG5cblxuLy8gVGhlIHNwZWMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gRGF0YUdyaWQgdG8gY3JlYXRlIHRoZSBMaW5lcyB0YWJsZVxuY2xhc3MgRGF0YUdyaWRTcGVjTGluZXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIG1ldGFEYXRhSURzVXNlZEluTGluZXM6YW55O1xuICAgIGdyb3VwSURzSW5PcmRlcjphbnk7XG4gICAgZ3JvdXBJRHNUb0dyb3VwSW5kZXhlczphbnk7XG4gICAgZ3JvdXBJRHNUb0dyb3VwTmFtZXM6YW55O1xuICAgIGNhcmJvbkJhbGFuY2VDb2w6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWM7XG4gICAgY2FyYm9uQmFsYW5jZVdpZGdldDpER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuXG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5maW5kTWV0YURhdGFJRHNVc2VkSW5MaW5lcygpO1xuICAgICAgICB0aGlzLmZpbmRHcm91cElEc0FuZE5hbWVzKCk7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgfVxuXG5cbiAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KHY6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldC5oaWdobGlnaHQodik7XG4gICAgfVxuXG5cbiAgICBlbmFibGVDYXJib25CYWxhbmNlV2lkZ2V0KHY6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldC5lbmFibGUodik7XG4gICAgfVxuXG5cbiAgICBmaW5kTWV0YURhdGFJRHNVc2VkSW5MaW5lcygpIHtcbiAgICAgICAgdmFyIHNlZW5IYXNoOmFueSA9IHt9O1xuICAgICAgICAvLyBsb29wIGxpbmVzXG4gICAgICAgICQuZWFjaCh0aGlzLmdldFJlY29yZElEcygpLCAoaW5kZXgsIGlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGxpbmUpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2gobGluZS5tZXRhIHx8IHt9LCAoa2V5KSA9PiBzZWVuSGFzaFtrZXldID0gdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBzdG9yZSBhbGwgbWV0YWRhdGEgSURzIHNlZW5cbiAgICAgICAgdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzID0gT2JqZWN0LmtleXMoc2Vlbkhhc2gpO1xuICAgIH1cblxuXG4gICAgZmluZEdyb3VwSURzQW5kTmFtZXMoKSB7XG4gICAgICAgIHZhciByb3dHcm91cHMgPSB7fTtcbiAgICAgICAgLy8gR2F0aGVyIGFsbCB0aGUgcm93IElEcyB1bmRlciB0aGUgZ3JvdXAgSUQgZWFjaCBiZWxvbmdzIHRvLlxuICAgICAgICAkLmVhY2godGhpcy5nZXRSZWNvcmRJRHMoKSwgKGluZGV4LCBpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2lkXSwgcmVwID0gbGluZS5yZXBsaWNhdGU7XG4gICAgICAgICAgICBpZiAocmVwKSB7XG4gICAgICAgICAgICAgICAgLy8gdXNlIHBhcmVudCByZXBsaWNhdGUgYXMgYSByZXBsaWNhdGUgZ3JvdXAgSUQsIHB1c2ggYWxsIG1hdGNoaW5nIGxpbmUgSURzXG4gICAgICAgICAgICAgICAgKHJvd0dyb3Vwc1tyZXBdID0gcm93R3JvdXBzW3JlcF0gfHwgWyByZXAgXSkucHVzaChpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzID0ge307XG4gICAgICAgIC8vIEZvciBlYWNoIGdyb3VwIElELCBqdXN0IHVzZSBwYXJlbnQgcmVwbGljYXRlIG5hbWVcbiAgICAgICAgJC5lYWNoKHJvd0dyb3VwcywgKGdyb3VwLCBsaW5lcykgPT4ge1xuICAgICAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tncm91cF0gPSBFREREYXRhLkxpbmVzW2dyb3VwXS5uYW1lO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gYWxwaGFudW1lcmljIHNvcnQgb2YgZ3JvdXAgSURzIGJ5IG5hbWUgYXR0YWNoZWQgdG8gdGhvc2UgcmVwbGljYXRlIGdyb3Vwc1xuICAgICAgICB0aGlzLmdyb3VwSURzSW5PcmRlciA9IE9iamVjdC5rZXlzKHJvd0dyb3Vwcykuc29ydCgoYSxiKSA9PiB7XG4gICAgICAgICAgICB2YXIgdTpzdHJpbmcgPSB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2FdLCB2OnN0cmluZyA9IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbYl07XG4gICAgICAgICAgICByZXR1cm4gdSA8IHYgPyAtMSA6IHUgPiB2ID8gMSA6IDA7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBOb3cgdGhhdCB0aGV5J3JlIHNvcnRlZCBieSBuYW1lLCBjcmVhdGUgYSBoYXNoIGZvciBxdWlja2x5IHJlc29sdmluZyBJRHMgdG8gaW5kZXhlcyBpblxuICAgICAgICAvLyB0aGUgc29ydGVkIGFycmF5XG4gICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwSW5kZXhlcyA9IHt9O1xuICAgICAgICAkLmVhY2godGhpcy5ncm91cElEc0luT3JkZXIsIChpbmRleCwgZ3JvdXApID0+IHRoaXMuZ3JvdXBJRHNUb0dyb3VwSW5kZXhlc1tncm91cF0gPSBpbmRleCk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnbGluZXMnLCB7ICduYW1lJzogJ0xpbmVzJyB9KTtcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkTGluZU5hbWUoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRTdHJhaW5OYW1lKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGEgc3RyYWluIElEIGV4aXN0cyBvbiBsaW5lLCBpcyBhIGtub3duIHN0cmFpbiwgdXBwZXJjYXNlIGZpcnN0IGZvdW5kIG5hbWUgb3IgJz8nXG4gICAgICAgIHZhciBsaW5lLCBzdHJhaW47XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuc3RyYWluICYmIGxpbmUuc3RyYWluLmxlbmd0aCAmJiAoc3RyYWluID0gRURERGF0YS5TdHJhaW5zW2xpbmUuc3RyYWluWzBdXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyYWluLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXg6c3RyaW5nKTphbnkge1xuICAgICAgICAvLyBlbnN1cmUgY2FyYm9uIHNvdXJjZSBJRChzKSBleGlzdCBvbiBsaW5lLCBlbnN1cmUgYXQgbGVhc3Qgb25lIHNvdXJjZSBJRCwgZW5zdXJlIGZpcnN0IElEXG4gICAgICAgIC8vIGlzIGtub3duIGNhcmJvbiBzb3VyY2VcbiAgICAgICAgdmFyIGxpbmUsIHNvdXJjZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoICYmIChzb3VyY2UgPSBFREREYXRhLkNTb3VyY2VzW2xpbmUuY2FyYm9uWzBdXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZENhcmJvblNvdXJjZShpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzb3VyY2UgPSB0aGlzLmxvYWRGaXJzdENhcmJvblNvdXJjZShpbmRleCk7XG4gICAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICAgIHJldHVybiBzb3VyY2UubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZENhcmJvblNvdXJjZUxhYmVsaW5nKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMubG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4KTtcbiAgICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZS5sYWJlbGluZy50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGxpbmUsIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRMaW5lTW9kaWZpY2F0aW9uKGluZGV4OnN0cmluZyk6bnVtYmVyIHtcbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgcmV0dXJuIGxpbmUubW9kaWZpZWQudGltZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoTGluZXNOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ05hbWUnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hMaW5lc1N0cmFpbicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdTdHJhaW4nLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRTdHJhaW5OYW1lLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygzLCAnaExpbmVzQ2FyYm9uJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NhcmJvbiBTb3VyY2UocyknLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRDYXJib25Tb3VyY2UsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQsICdoTGluZXNMYWJlbGluZycsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYWJlbGluZycsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZENhcmJvblNvdXJjZUxhYmVsaW5nLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg1LCAnaExpbmVzQ2FyYm9uQmFsYW5jZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdDYXJib24gQmFsYW5jZScsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZExpbmVOYW1lIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gbWFwIGFsbCBtZXRhZGF0YSBJRHMgdG8gSGVhZGVyU3BlYyBvYmplY3RzXG4gICAgICAgIHZhciBtZXRhRGF0YUhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNiArIGluZGV4LCAnaExpbmVzTWV0YScgKyBpZCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogbWRUeXBlLm5hbWUsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNiArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsICdoTGluZXNFeHBlcmltZW50ZXInLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnRXhwZXJpbWVudGVyJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDcgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLCAnaExpbmVzTW9kaWZpZWQnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFzdCBNb2RpZmllZCcsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZExpbmVNb2RpZmljYXRpb24sXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhSGVhZGVycywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkOnN0cmluZykge1xuICAgICAgICByZXR1cm4gKGk6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaV07XG4gICAgICAgICAgICBpZiAobGluZSAmJiBsaW5lLm1ldGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbGluZS5tZXRhW2lkXSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gVGhlIGNvbHNwYW4gdmFsdWUgZm9yIGFsbCB0aGUgY2VsbHMgdGhhdCBhcmUgbm90ICdjYXJib24gc291cmNlJyBvciAnbGFiZWxpbmcnXG4gICAgLy8gaXMgYmFzZWQgb24gdGhlIG51bWJlciBvZiBjYXJib24gc291cmNlcyBmb3IgdGhlIHJlc3BlY3RpdmUgcmVjb3JkLlxuICAgIC8vIFNwZWNpZmljYWxseSwgaXQncyBlaXRoZXIgdGhlIG51bWJlciBvZiBjYXJib24gc291cmNlcywgb3IgMSwgd2hpY2hldmVyIGlzIGhpZ2hlci5cbiAgICBwcml2YXRlIHJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIChFREREYXRhLkxpbmVzW2luZGV4XS5jYXJib24gfHwgW10pLmxlbmd0aCB8fCAxO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF07XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hOYW1lJzogJ2xpbmVJZCcsXG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKGlkKSA9PiB7IHJldHVybiAnbGluZScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IFtcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIjZWRpdGxpbmVcIiBjbGFzcz1cImxpbmUtZWRpdC1saW5rXCI+RWRpdCBMaW5lPC9hPicsXG4gICAgICAgICAgICAgICAgICAgICc8YSBocmVmPVwiL2V4cG9ydD9saW5lSWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIENTVi9ldGM8L2E+J1xuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogbGluZS5uYW1lICsgKGxpbmUuY3RybCA/ICc8YiBjbGFzcz1cImlzY29udHJvbGRhdGFcIj5DPC9iPicgOiAnJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZVN0cmFpbk5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgY29udGVudCA9IFtdO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBsaW5lLnN0cmFpbi5tYXAoKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tpZF07XG4gICAgICAgICAgICAgICAgcmV0dXJuIFsgJzxhIGhyZWY9XCInLCBzdHJhaW4ucmVnaXN0cnlfdXJsLCAnXCI+Jywgc3RyYWluLm5hbWUsICc8L2E+JyBdLmpvaW4oJycpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50LmpvaW4oJzsgJykgfHwgJy0tJ1xuICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ2FyYm9uU291cmNlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIHN0cmluZ3MgPSBbJy0tJ107XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuY2FyYm9uICYmIGxpbmUuY2FyYm9uLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHN0cmluZ3MgPSBsaW5lLmNhcmJvbi5tYXAoKGlkKSA9PiB7IHJldHVybiBFREREYXRhLkNTb3VyY2VzW2lkXS5uYW1lOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5ncy5tYXAoKG5hbWUpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHsgJ2NvbnRlbnRTdHJpbmcnOiBuYW1lIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDYXJib25Tb3VyY2VMYWJlbGluZ0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBzdHJpbmdzID0gWyctLSddO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmNhcmJvbiAmJiBsaW5lLmNhcmJvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmdzID0gbGluZS5jYXJib24ubWFwKChpZCkgPT4geyByZXR1cm4gRURERGF0YS5DU291cmNlc1tpZF0ubGFiZWxpbmc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmdzLm1hcCgobGFiZWxpbmcpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHsgJ2NvbnRlbnRTdHJpbmcnOiBsYWJlbGluZyB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ2FyYm9uQmFsYW5jZUJsYW5rQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ21pbldpZHRoJzogMjAwXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJJbml0aWFsc0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBleHAsIGNvbnRlbnQ7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuVXNlcnMgJiYgKGV4cCA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBleHAuaW5pdGlhbHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50IHx8ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcoRURERGF0YS5MaW5lc1tpbmRleF0ubW9kaWZpZWQudGltZSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBtYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdID0+IHtcbiAgICAgICAgICAgIHZhciBjb250ZW50U3RyID0gJycsIGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSwgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICBpZiAobGluZSAmJiB0eXBlICYmIGxpbmUubWV0YSAmJiAoY29udGVudFN0ciA9IGxpbmUubWV0YVtpZF0gfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgY29udGVudFN0ciA9IFsgdHlwZS5wcmUgfHwgJycsIGNvbnRlbnRTdHIsIHR5cGUucG9zdGZpeCB8fCAnJyBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnRTdHJcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgXTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZGF0YSBjb2x1bW5zIHRoYXQgd2lsbCBtYWtlIHVwIHRoZSBib2R5IG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIG1ldGFEYXRhQ29sczpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIHJpZ2h0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICAgICAgLy8gYWRkIGNsaWNrIGhhbmRsZXIgZm9yIG1lbnUgb24gbGluZSBuYW1lIGNlbGxzXG4gICAgICAgICQodGhpcy50YWJsZUVsZW1lbnQpLm9uKCdjbGljaycsICdhLmxpbmUtZWRpdC1saW5rJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBTdHVkeUQuZWRpdExpbmUoJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxlZnRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCB0aGlzLmdlbmVyYXRlTGluZU5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIsIHRoaXMuZ2VuZXJhdGVTdHJhaW5OYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzLCB0aGlzLmdlbmVyYXRlQ2FyYm9uU291cmNlQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg0LCB0aGlzLmdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyksXG4gICAgICAgICAgICAvLyBUaGUgQ2FyYm9uIEJhbGFuY2UgY2VsbHMgYXJlIHBvcHVsYXRlZCBieSBhIGNhbGxiYWNrLCB0cmlnZ2VyZWQgd2hlbiBmaXJzdCBkaXNwbGF5ZWRcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNSwgdGhpcy5nZW5lcmF0ZUNhcmJvbkJhbGFuY2VCbGFua0NlbGxzKVxuICAgICAgICBdO1xuICAgICAgICBtZXRhRGF0YUNvbHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBpbmRleCwgdGhpcy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSk7XG4gICAgICAgIH0pO1xuICAgICAgICByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVySW5pdGlhbHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDcgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFDb2xzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cbiAgICBkZWZpbmVDb2x1bW5Hcm91cFNwZWMoKTpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdIHtcbiAgICAgICAgdmFyIHRvcFNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGluZSBOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnU3RyYWluJyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NhcmJvbiBTb3VyY2UocyknKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFiZWxpbmcnKSxcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZUNvbCA9IG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnQ2FyYm9uIEJhbGFuY2UnLCB7XG4gICAgICAgICAgICAgICAgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UsICAgIC8vIEhhcyBpdHMgb3duIGhlYWRlciB3aWRnZXRcbiAgICAgICAgICAgICAgICAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncmV2ZWFsZWRDYWxsYmFjayc6IFN0dWR5RC5jYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFja1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB2YXIgbWV0YURhdGFDb2xHcm91cHM6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXTtcbiAgICAgICAgbWV0YURhdGFDb2xHcm91cHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBncm91cHMgdGhhdCByb3dzIGNhbiBiZSBnYXRoZXJlZCBpbnRvXG4gICAgZGVmaW5lUm93R3JvdXBTcGVjKCk6YW55IHtcblxuICAgICAgICB2YXIgcm93R3JvdXBTcGVjID0gW107XG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgdGhpcy5ncm91cElEc0luT3JkZXIubGVuZ3RoOyB4KyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHRoaXMuZ3JvdXBJRHNJbk9yZGVyW3hdO1xuXG4gICAgICAgICAgICB2YXIgcm93R3JvdXBTcGVjRW50cnk6YW55ID0geyAgICAvLyBHcm91cHMgYXJlIG51bWJlcmVkIHN0YXJ0aW5nIGZyb20gMFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbaWRdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcm93R3JvdXBTcGVjLnB1c2gocm93R3JvdXBTcGVjRW50cnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJvd0dyb3VwU3BlYztcbiAgICB9XG5cblxuICAgIC8vIFRoZSB0YWJsZSBlbGVtZW50IG9uIHRoZSBwYWdlIHRoYXQgd2lsbCBiZSB0dXJuZWQgaW50byB0aGUgRGF0YUdyaWQuICBBbnkgcHJlZXhpc3RpbmcgdGFibGVcbiAgICAvLyBjb250ZW50IHdpbGwgYmUgcmVtb3ZlZC5cbiAgICBnZXRUYWJsZUVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0dWR5TGluZXNUYWJsZVwiKTtcbiAgICB9XG5cblxuICAgIC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycyAobnVtYmVycywgbm90IHN0cmluZ3MpLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZVxuICAgIC8vIGRhdGEgc2V0IGJlaW5nIGRpc3BsYXllZFxuICAgIGdldFJlY29yZElEcygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKEVERERhdGEuTGluZXMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBoZWFkZXIgd2lkZ2V0cy4gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlXG4gICAgLy8gdGhlIG9yZGVyIHRoZXkgYXJlIGFkZGVkIHRvIHRoZSBoZWFkZXIgYmFyLiBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc3Vic3RyaW5nIHNlYXJjaGluZ1xuICAgICAgICB2YXIgc2VhcmNoTGluZXNXaWRnZXQgPSBuZXcgREdMaW5lc1NlYXJjaFdpZGdldChkYXRhR3JpZCwgdGhpcywgJ1NlYXJjaCBMaW5lcycsIDMwLCBmYWxzZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlYXJjaExpbmVzV2lkZ2V0KTtcbiAgICAgICAgLy8gQSBcIkNhcmJvbiBCYWxhbmNlXCIgY2hlY2tib3hcbiAgICAgICAgdmFyIHNob3dDYXJib25CYWxhbmNlV2lkZ2V0ID0gbmV3IERHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNob3dDYXJib25CYWxhbmNlV2lkZ2V0KTtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlV2lkZ2V0ID0gc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQ7XG4gICAgICAgIC8vIEEgXCJzZWxlY3QgYWxsXCIgYnV0dG9uXG4gICAgICAgIHZhciBzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdTZWxlY3RBbGxXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICBzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWxlY3RBbGxXaWRnZXQpO1xuXG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzLiBUaGUgb3JkZXIgb2YgdGhlIGFycmF5XG4gICAgLy8gd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LiBFbXB0eSBhcnJheSA9IE9LLlxuICAgIGNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZE9wdGlvbldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZE9wdGlvbldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBMaW5lc1xuICAgICAgICB2YXIgZ3JvdXBMaW5lc1dpZGdldCA9IG5ldyBER0dyb3VwU3R1ZHlSZXBsaWNhdGVzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZ3JvdXBMaW5lc1dpZGdldCk7XG4gICAgICAgIHZhciBkaXNhYmxlZExpbmVzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRMaW5lc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkTGluZXNXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcblxuICAgICAgICAvLyBXaXJlIHVwIHRoZSAnYWN0aW9uIHBhbmVscycgZm9yIHRoZSBMaW5lcyBhbmQgQXNzYXlzIHNlY3Rpb25zXG4gICAgICAgIHZhciBsaW5lc1RhYmxlID0gdGhpcy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgJChsaW5lc1RhYmxlKS5vbignY2hhbmdlJywgJzpjaGVja2JveCcsICgpID0+IFN0dWR5RC5xdWV1ZUxpbmVzQWN0aW9uUGFuZWxTaG93KCkpO1xuXG4gICAgICAgIC8vIFRoaXMgY2FsbHMgZG93biBpbnRvIHRoZSBpbnN0YW50aWF0ZWQgd2lkZ2V0IGFuZCBhbHRlcnMgaXRzIHN0eWxpbmcsXG4gICAgICAgIC8vIHNvIHdlIG5lZWQgdG8gZG8gaXQgYWZ0ZXIgdGhlIHRhYmxlIGhhcyBiZWVuIGNyZWF0ZWQuXG4gICAgICAgIHRoaXMuZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldChmYWxzZSk7XG5cbiAgICAgICAgLy8gV2lyZS1pbiBvdXIgY3VzdG9tIGVkaXQgZmllbGRzIGZvciB0aGUgU3R1ZGllcyBwYWdlLCBhbmQgY29udGludWUgd2l0aCBnZW5lcmFsIGluaXRcbiAgICAgICAgU3R1ZHlELnByZXBhcmVBZnRlckxpbmVzVGFibGUoKTtcbiAgICB9XG59XG5cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIExpbmVzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRMaW5lc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnU2hvd0RMaW5lc0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayggKGUpID0+IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ1Nob3cgRGlzYWJsZWQnLCBjYklEKTs7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IHRydWU7XG4gICAgfVxuXG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIHZhciBjaGVja2VkOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIGNoZWNrZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZSBib3ggaXMgY2hlY2tlZCwgcmV0dXJuIHRoZSBzZXQgb2YgSURzIHVuZmlsdGVyZWRcbiAgICAgICAgaWYgKGNoZWNrZWQpIHtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZmlsdGVyZWRJRHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCByb3dJRHMubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHJvd0lEc1tyXTtcbiAgICAgICAgICAgIC8vIEhlcmUgaXMgdGhlIGNvbmRpdGlvbiB0aGF0IGRldGVybWluZXMgd2hldGhlciB0aGUgcm93cyBhc3NvY2lhdGVkIHdpdGggdGhpcyBJRCBhcmVcbiAgICAgICAgICAgIC8vIHNob3duIG9yIGhpZGRlbi5cbiAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKGlkKTsgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOnN0cmluZyk6YW55IHtcbiAgICAgICAgaWYgKCFFREREYXRhLkxpbmVzW3Jvd0lEXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICQuZWFjaChkYXRhUm93T2JqZWN0cywgKHgsIHJvdykgPT4gJChyb3cuZ2V0RWxlbWVudCgpKS5hZGRDbGFzcygnZGlzYWJsZWRSZWNvcmQnKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG4vLyBBIHdpZGdldCB0byB0b2dnbGUgcmVwbGljYXRlIGdyb3VwaW5nIG9uIGFuZCBvZmZcbmNsYXNzIERHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgcFRoaXMgPSB0aGlzO1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ0dyb3VwU3R1ZHlSZXBsaWNhdGVzQ0InK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgICQoY2IpLmNsaWNrKFxuICAgICAgICAgICAgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIGlmIChwVGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICBwVGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnR1cm5PblJvd0dyb3VwaW5nKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcFRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50dXJuT2ZmUm93R3JvdXBpbmcoKTsgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdHcm91cCBSZXBsaWNhdGVzJywgY2JJRCk7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IHRydWU7XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyBhIERhdGFHcmlkSGVhZGVyV2lkZ2V0IGRlcml2ZWQgZnJvbSBER1NlYXJjaFdpZGdldC4gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVyc1xuLy8gb3B0aW9ucyBmb3IgYWRkaXRpb25hbCBkYXRhIHR5cGVzLCBxdWVyeWluZyB0aGUgc2VydmVyIGZvciByZXN1bHRzLlxuY2xhc3MgREdMaW5lc1NlYXJjaFdpZGdldCBleHRlbmRzIERHU2VhcmNoV2lkZ2V0IHtcblxuICAgIHNlYXJjaERpc2Nsb3N1cmVFbGVtZW50OmFueTtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDphbnksIGRhdGFHcmlkU3BlYzphbnksIHBsYWNlSG9sZGVyOnN0cmluZywgc2l6ZTpudW1iZXIsXG4gICAgICAgICAgICBnZXRzRm9jdXM6Ym9vbGVhbikge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMsIHBsYWNlSG9sZGVyLCBzaXplLCBnZXRzRm9jdXMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnMgd2hlbiBjcmVhdGluZyBpbnB1dFxuICAgIC8vIGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgc3VwZXIuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50cyBoYXZlXG4gICAgLy8gbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjphbnksIHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMoKSkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgfVxufVxuXG5cblxuLy8gQSBoZWFkZXIgd2lkZ2V0IHRvIHByZXBhcmUgdGhlIENhcmJvbiBCYWxhbmNlIHRhYmxlIGNlbGxzLCBhbmQgc2hvdyBvciBoaWRlIHRoZW0uXG5jbGFzcyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRIZWFkZXJXaWRnZXQge1xuXG4gICAgY2hlY2tCb3hFbGVtZW50OmFueTtcbiAgICBsYWJlbEVsZW1lbnQ6YW55O1xuICAgIGhpZ2hsaWdodGVkOmJvb2xlYW47XG4gICAgY2hlY2tib3hFbmFibGVkOmJvb2xlYW47XG5cbiAgICAvLyBzdG9yZSBtb3JlIHNwZWNpZmljIHR5cGUgb2Ygc3BlYyB0byBnZXQgdG8gY2FyYm9uQmFsYW5jZUNvbCBsYXRlclxuICAgIHByaXZhdGUgX2xpbmVTcGVjOkRhdGFHcmlkU3BlY0xpbmVzO1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMuY2hlY2tib3hFbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5oaWdobGlnaHRlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9saW5lU3BlYyA9IGRhdGFHcmlkU3BlYztcbiAgICB9XG4gICAgXG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAnQ2FyQmFsJyArIHVuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgIGNiLmNsYXNzTmFtZSA9ICd0YWJsZUNvbnRyb2wnO1xuICAgICAgICAkKGNiKS5jbGljaygoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6dm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2YXRlQ2FyYm9uQmFsYW5jZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGFiZWw6SFRNTEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnQ2FyYm9uIEJhbGFuY2UnLCBjYklEKTtcblxuICAgICAgICB2YXIgc3BhbjpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgICBzcGFuLmNsYXNzTmFtZSA9ICd0YWJsZUNvbnRyb2wnO1xuICAgICAgICBzcGFuLmFwcGVuZENoaWxkKGNiKTtcbiAgICAgICAgc3Bhbi5hcHBlbmRDaGlsZChsYWJlbCk7XG5cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSBsYWJlbDtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gc3BhbjtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG4gICAgaGlnaGxpZ2h0KGg6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0ZWQgPSBoO1xuICAgICAgICBpZiAodGhpcy5jaGVja2JveEVuYWJsZWQpIHtcbiAgICAgICAgICAgIGlmIChoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAncmVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVuYWJsZShoOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNoZWNrYm94RW5hYmxlZCA9IGg7XG4gICAgICAgIGlmIChoKSB7XG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodCh0aGlzLmhpZ2hsaWdodGVkKTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJ2dyYXknO1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3RpdmF0ZUNhcmJvbkJhbGFuY2UoKTp2b2lkIHtcbiAgICAgICAgdmFyIHVpOkZ1bGxTdHVkeUJpb21hc3NVSSxcbiAgICAgICAgICAgIGNhbGxiYWNrOkZ1bGxTdHVkeUJpb21hc3NVSVJlc3VsdHNDYWxsYmFjaztcbiAgICAgICAgY2FsbGJhY2sgPSAoZXJyb3I6c3RyaW5nLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwRmlsZW5hbWU/OnN0cmluZyxcbiAgICAgICAgICAgICAgICBmaW5hbEJpb21hc3M/Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgICAgICAgU3R1ZHlELm1ldGFib2xpY01hcElEID0gbWV0YWJvbGljTWFwSUQ7XG4gICAgICAgICAgICAgICAgU3R1ZHlELm1ldGFib2xpY01hcE5hbWUgPSBtZXRhYm9saWNNYXBGaWxlbmFtZTtcbiAgICAgICAgICAgICAgICBTdHVkeUQuYmlvbWFzc0NhbGN1bGF0aW9uID0gZmluYWxCaW9tYXNzO1xuICAgICAgICAgICAgICAgIFN0dWR5RC5vbkNoYW5nZWRNZXRhYm9saWNNYXAoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3Quc2hvd0NvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gZ2V0IGEgYmlvbWFzcyBjYWxjdWxhdGlvbiB0byBtdWx0aXBseSBhZ2FpbnN0IE9ELlxuICAgICAgICAgICAgLy8gSGF2ZSB0aGV5IHNldCB0aGlzIHVwIHlldD9cbiAgICAgICAgICAgIGlmICghU3R1ZHlELmJpb21hc3NDYWxjdWxhdGlvbiB8fCBTdHVkeUQuYmlvbWFzc0NhbGN1bGF0aW9uID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBNdXN0IHNldHVwIHRoZSBiaW9tYXNzXG4gICAgICAgICAgICAgICAgdWkgPSBuZXcgRnVsbFN0dWR5QmlvbWFzc1VJKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnNob3dDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuaGlkZUNvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbmNsYXNzIERhdGFHcmlkQXNzYXlzIGV4dGVuZHMgRGF0YUdyaWQge1xuXG5cbiAgICBzZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkOmJvb2xlYW47XG4gICAgZ3JhcGhSZWZyZXNoVGltZXJJRDphbnk7XG4gICAgLy8gUmlnaHQgbm93IHdlJ3JlIG5vdCBhY3R1YWxseSB1c2luZyB0aGUgY29udGVudHMgb2YgdGhpcyBhcnJheSwganVzdFxuICAgIC8vIGNoZWNraW5nIHRvIHNlZSBpZiBpdCdzIG5vbi1lbXB0eS5cbiAgICByZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQ6bnVtYmVyW107XG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlKSB7XG4gICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gW107XG4gICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IGZhbHNlO1xuICAgICAgICBzdXBlcihkYXRhR3JpZFNwZWMpO1xuICAgIH1cblxuXG4gICAgaW52YWxpZGF0ZUFzc2F5UmVjb3JkcyhyZWNvcmRzOm51bWJlcltdKTp2b2lkIHtcbiAgICAgICAgdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQgPSB0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZC5jb25jYXQocmVjb3Jkcyk7XG4gICAgICAgIGlmICghdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCkge1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBjbGlja2VkRGlzY2xvc2UoZGlzY2xvc2U6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHZhciBzcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cyA9IHRoaXMuZ2V0U3BlYygpO1xuICAgICAgICB2YXIgdGFibGUgPSBzcGVjLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICB2YXIgZGl2ID0gc3BlYy51bmRpc2Nsb3NlZFNlY3Rpb25EaXY7XG4gICAgICAgIGlmICghZGl2IHx8ICF0YWJsZSkgeyByZXR1cm47IH1cbiAgICAgICAgaWYgKGRpc2Nsb3NlKSB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQgPSB0cnVlO1xuICAgICAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyBhIHRhYmxlLiBUaGlzIGJyZWFrcyB1cFxuICAgICAgICAgICAgLy8gdGFibGUgcmVjcmVhdGlvbiBpbnRvIHNlcGFyYXRlIGV2ZW50cywgc28gdGhlIGJyb3dzZXIgY2FuIHVwZGF0ZSBVSS5cbiAgICAgICAgICAgIGlmICh0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKSwgMTApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk6dm9pZCB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gW107XG4gICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBleGVjdXRlIHJlY29yZHMgcmVmcmVzaDogJyArIGUpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9jYW5jZWxHcmFwaCgpIHtcbiAgICAgICAgaWYgKHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCk7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICBxdWV1ZUdyYXBoUmVtYWtlKCkge1xuICAgICAgICB0aGlzLl9jYW5jZWxHcmFwaCgpO1xuICAgICAgICB0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KCAoKSA9PiB0aGlzLnJlbWFrZUdyYXBoQXJlYSgpLCAxMDAgKTtcbiAgICB9XG5cblxuICAgIHJlbWFrZUdyYXBoQXJlYSgpIHtcbiAgICAgICAgdmFyIHNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzID0gdGhpcy5nZXRTcGVjKCksIGcsIGNvbnZlcnQsIGNvbXBhcmU7XG4gICAgICAgIC8vIGlmIGNhbGxlZCBkaXJlY3RseSwgY2FuY2VsIGFueSBwZW5kaW5nIHJlcXVlc3RzIGluIFwicXVldWVcIlxuICAgICAgICB0aGlzLl9jYW5jZWxHcmFwaCgpO1xuXG4gICAgICAgIGlmICghU3R1ZHlER3JhcGhpbmcgfHwgIXNwZWMgfHwgIXNwZWMuZ3JhcGhPYmplY3QpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGcgPSBzcGVjLmdyYXBoT2JqZWN0O1xuICAgICAgICBnLmNsZWFyQWxsU2V0cygpO1xuXG4gICAgICAgIC8vIGZ1bmN0aW9uIGNvbnZlcnRzIGRvd25sb2FkZWQgZGF0YSBwb2ludCB0byBmb3JtIHVzYWJsZSBieSBmbG90XG4gICAgICAgIC8vIEZJWE1FIGFzc3VtZXMgKHgwLCB5MCkgcG9pbnRzIG9ubHlcbiAgICAgICAgY29udmVydCA9IChkKSA9PiB7IHJldHVybiBbWyBkWzBdWzBdLCBkWzFdWzBdIF1dOyB9O1xuXG4gICAgICAgIC8vIGZ1bmN0aW9uIGNvbXBhcmluZyB0d28gcG9pbnRzLCB0byBzb3J0IGRhdGEgc2VudCB0byBmbG90XG4gICAgICAgIGNvbXBhcmUgPSAoYSwgYikgPT4geyByZXR1cm4gYVswXSAtIGJbMF07IH07XG5cbiAgICAgICAgc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5OmFueSA9IEVERERhdGEuQXNzYXlzW2lkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICBsaW5lOmFueSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlcztcbiAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlIHx8ICFsaW5lLmFjdGl2ZSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgIG1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW107XG4gICAgICAgICAgICBtZWFzdXJlcy5mb3JFYWNoKChtKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmUgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21dLCBzZXQ7XG4gICAgICAgICAgICAgICAgc2V0ID0ge1xuICAgICAgICAgICAgICAgICAgICAnbGFiZWwnOiAnZHQnICsgbSxcbiAgICAgICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50bmFtZSc6IFV0bC5FREQucmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9OYW1lKG0pLFxuICAgICAgICAgICAgICAgICAgICAnbmFtZSc6IGFzc2F5Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhaWQnOiBpZCxcbiAgICAgICAgICAgICAgICAgICAgJ210aWQnOiBtZWFzdXJlLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICd1bml0cyc6IFV0bC5FREQucmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9Vbml0cyhtKSxcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiAkLm1hcChtZWFzdXJlLnZhbHVlcywgY29udmVydCkuc29ydChjb21wYXJlKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUuY29udHJvbCkgc2V0LmlzY29udHJvbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgZy5hZGROZXdTZXQoc2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBnLmRyYXdTZXRzKCk7XG4gICAgfVxuXG5cbiAgICAvLyBOb3RlOiBDdXJyZW50bHkgbm90IGJlaW5nIGNhbGxlZC5cbiAgICByZXNpemVHcmFwaChnKSB7XG4gICAgICAgIHZhciBzcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cyA9IHRoaXMuZ2V0U3BlYygpO1xuICAgICAgICB2YXIgZ3JhcGhPYmogPSBzcGVjLmdyYXBoT2JqZWN0O1xuICAgICAgICBpZiAoIWdyYXBoT2JqKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFncmFwaE9iai5wbG90T2JqZWN0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgZ3JhcGhPYmoucGxvdE9iamVjdC5yZXNpemUoKTtcbiAgICAgICAgZ3JhcGhPYmoucGxvdE9iamVjdC5zZXR1cEdyaWQoKTtcbiAgICAgICAgZ3JhcGhPYmoucGxvdE9iamVjdC5kcmF3KCk7XG4gICAgfVxufVxuXG5cblxuLy8gVGhlIHNwZWMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gRGF0YUdyaWQgdG8gY3JlYXRlIHRoZSBBc3NheXMgdGFibGUocylcbmNsYXNzIERhdGFHcmlkU3BlY0Fzc2F5cyBleHRlbmRzIERhdGFHcmlkU3BlY0Jhc2Uge1xuXG4gICAgcHJvdG9jb2xJRDphbnk7XG4gICAgcHJvdG9jb2xOYW1lOnN0cmluZztcbiAgICBhc3NheUlEc0luUHJvdG9jb2w6bnVtYmVyW107XG4gICAgbWV0YURhdGFJRHNVc2VkSW5Bc3NheXM6YW55O1xuICAgIG1heGltdW1YVmFsdWVJbkRhdGE6bnVtYmVyO1xuXG4gICAgdW5kaXNjbG9zZWRTZWN0aW9uRGl2OmFueTtcblxuICAgIG1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG4gICAgZ3JhcGhBcmVhSGVhZGVyU3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG5cbiAgICBncmFwaE9iamVjdDphbnk7XG5cblxuICAgIGNvbnN0cnVjdG9yKHByb3RvY29sSUQpIHtcbiAgICAgICAgdGhpcy5wcm90b2NvbElEID0gcHJvdG9jb2xJRDtcbiAgICAgICAgdGhpcy5wcm90b2NvbE5hbWUgPSBFREREYXRhLlByb3RvY29sc1twcm90b2NvbElEXS5uYW1lO1xuICAgICAgICB0aGlzLmdyYXBoT2JqZWN0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLnJlZnJlc2hJRExpc3QoKTtcbiAgICAgICAgdGhpcy5maW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpO1xuICAgICAgICB0aGlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkFzc2F5cygpO1xuICAgICAgICBzdXBlcigpO1xuICAgIH1cblxuXG4gICAgcmVmcmVzaElETGlzdCgpOnZvaWQge1xuICAgICAgICAvLyBGaW5kIG91dCB3aGljaCBwcm90b2NvbHMgaGF2ZSBhc3NheXMgd2l0aCBtZWFzdXJlbWVudHMgLSBkaXNhYmxlZCBvciBub1xuICAgICAgICB0aGlzLmFzc2F5SURzSW5Qcm90b2NvbCA9IFtdO1xuICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkOnN0cmluZywgYXNzYXk6QXNzYXlSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmU6TGluZVJlY29yZDtcbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RvY29sSUQgIT09IGFzc2F5LnBpZCkge1xuICAgICAgICAgICAgICAgIC8vIHNraXAgYXNzYXlzIGZvciBvdGhlciBwcm90b2NvbHNcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIShsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdKSB8fCAhbGluZS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAvLyBza2lwIGFzc2F5cyB3aXRob3V0IGEgdmFsaWQgbGluZSBvciB3aXRoIGEgZGlzYWJsZWQgbGluZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2F5SURzSW5Qcm90b2NvbC5wdXNoKGFzc2F5LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBBbiBhcnJheSBvZiB1bmlxdWUgaWRlbnRpZmllcnMsIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHJlY29yZHMgaW4gdGhlIGRhdGEgc2V0IGJlaW5nIGRpc3BsYXllZFxuICAgIGdldFJlY29yZElEcygpOmFueVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXNzYXlJRHNJblByb3RvY29sO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBhbiBvdmVycmlkZS4gIENhbGxlZCB3aGVuIGEgZGF0YSByZXN0IGlzIHRyaWdnZXJlZCwgYnV0IGJlZm9yZSB0aGUgdGFibGUgcm93cyBhcmVcbiAgICAvLyByZWJ1aWx0LlxuICAgIG9uRGF0YVJlc2V0KGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcbiAgICAgICAgdGhpcy5maW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpO1xuICAgICAgICBpZiAodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgJiYgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkge1xuICAgICAgICAgICAgJCh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KS5jaGlsZHJlbignOmZpcnN0JykudGV4dChcbiAgICAgICAgICAgICAgICAgICAgJ01lYXN1cmluZyBUaW1lcyAoUmFuZ2UgMCB0byAnICsgdGhpcy5tYXhpbXVtWFZhbHVlSW5EYXRhICsgJyknKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgdmFyIHNlY3Rpb24sIHByb3RvY29sRGl2LCB0aXRsZURpdiwgdGl0bGVMaW5rLCB0YWJsZSxcbiAgICAgICAgICAgIHAgPSB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICB0YWJsZUlEOnN0cmluZyA9ICdwcm8nICsgcCArICdhc3NheXN0YWJsZSc7XG4gICAgICAgIC8vIElmIHdlIGNhbid0IGZpbmQgYSB0YWJsZSwgd2UgaW5zZXJ0IGEgY2xpY2stdG8tZGlzY2xvc2UgZGl2LCBhbmQgdGhlbiBhIHRhYmxlIGRpcmVjdGx5XG4gICAgICAgIC8vIGFmdGVyIGl0LlxuICAgICAgICBpZiAoJCgnIycgKyB0YWJsZUlEKS5zaXplKCkgPT09IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb24gPSAkKCcjYXNzYXlzU2VjdGlvbicpO1xuICAgICAgICAgICAgcHJvdG9jb2xEaXYgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdkaXNjbG9zZSBkaXNjbG9zZUhpZGUnKS5hcHBlbmRUbyhzZWN0aW9uKTtcbiAgICAgICAgICAgIHRoaXMudW5kaXNjbG9zZWRTZWN0aW9uRGl2ID0gcHJvdG9jb2xEaXZbMF07XG4gICAgICAgICAgICB0aXRsZURpdiA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ3NlY3Rpb25DaGFwdGVyJykuYXBwZW5kVG8ocHJvdG9jb2xEaXYpO1xuICAgICAgICAgICAgdGl0bGVMaW5rID0gJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ2Rpc2Nsb3NlTGluaycpXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0KHRoaXMucHJvdG9jb2xOYW1lICsgJyBBc3NheXMnKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8odGl0bGVEaXYpO1xuICAgICAgICAgICAgdGFibGUgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0YWJsZVwiKSlcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoJ2lkJywgdGFibGVJRCkuYWRkQ2xhc3MoJ2Rpc2Nsb3NlQm9keScpXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhwcm90b2NvbERpdik7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhlIGFjdGlvbnMgcGFuZWwgcmVtYWlucyBhdCB0aGUgYm90dG9tLlxuICAgICAgICAgICAgJCgnI2Fzc2F5c0FjdGlvblBhbmVsJykuYXBwZW5kVG8oc2VjdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhYmxlSUQpO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ2Fzc2F5cycrdGhpcy5wcm90b2NvbElELCB7XG4gICAgICAgICAgICAnZGVmYXVsdFNvcnQnOiAxXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCkge1xuICAgICAgICB2YXIgc2Vlbkhhc2g6YW55ID0ge307XG4gICAgICAgIHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMgPSBbXTtcbiAgICAgICAgdGhpcy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICQuZWFjaChhc3NheS5tZXRhIHx8IHt9LCAobWV0YUlkKSA9PiB7IHNlZW5IYXNoW21ldGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIFtdLnB1c2guYXBwbHkodGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cywgT2JqZWN0LmtleXMoc2Vlbkhhc2gpKTtcbiAgICB9XG5cblxuICAgIGZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk6dm9pZCB7XG4gICAgICAgIHZhciBtYXhGb3JBbGw6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIHJlY29yZHNcbiAgICAgICAgbWF4Rm9yQWxsID0gdGhpcy5nZXRSZWNvcmRJRHMoKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXSwgbWVhc3VyZXMsIG1heEZvclJlY29yZDtcbiAgICAgICAgICAgIG1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW107XG4gICAgICAgICAgICAvLyByZWR1Y2UgdG8gZmluZCBoaWdoZXN0IHZhbHVlIGFjcm9zcyBhbGwgbWVhc3VyZXNcbiAgICAgICAgICAgIG1heEZvclJlY29yZCA9IG1lYXN1cmVzLnJlZHVjZSgocHJldjpudW1iZXIsIG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsb29rdXA6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbWVhc3VyZTphbnkgPSBsb29rdXBbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbWF4Rm9yTWVhc3VyZTtcbiAgICAgICAgICAgICAgICAvLyByZWR1Y2UgdG8gZmluZCBoaWdoZXN0IHZhbHVlIGFjcm9zcyBhbGwgZGF0YSBpbiBtZWFzdXJlbWVudFxuICAgICAgICAgICAgICAgIG1heEZvck1lYXN1cmUgPSAobWVhc3VyZS52YWx1ZXMgfHwgW10pLnJlZHVjZSgocHJldjpudW1iZXIsIHBvaW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBwb2ludFswXVswXSk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIG1heEZvck1lYXN1cmUpO1xuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgbWF4Rm9yUmVjb3JkKTtcbiAgICAgICAgfSwgMCk7XG4gICAgICAgIC8vIEFueXRoaW5nIGFib3ZlIDAgaXMgYWNjZXB0YWJsZSwgYnV0IDAgd2lsbCBkZWZhdWx0IGluc3RlYWQgdG8gMS5cbiAgICAgICAgdGhpcy5tYXhpbXVtWFZhbHVlSW5EYXRhID0gbWF4Rm9yQWxsIHx8IDE7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRBc3NheU5hbWUoaW5kZXg6YW55KTpzdHJpbmcge1xuICAgICAgICAvLyBJbiBhbiBvbGQgdHlwaWNhbCBFREREYXRhLkFzc2F5cyByZWNvcmQgdGhpcyBzdHJpbmcgaXMgY3VycmVudGx5IHByZS1hc3NlbWJsZWQgYW5kIHN0b3JlZFxuICAgICAgICAvLyBpbiAnZm4nLiBCdXQgd2UncmUgcGhhc2luZyB0aGF0IG91dC5cbiAgICAgICAgdmFyIGFzc2F5LCBsaW5lO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBbbGluZS5uLCB0aGlzLnByb3RvY29sTmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRFeHBlcmltZW50ZXJJbml0aWFscyhpbmRleDphbnkpOnN0cmluZyB7XG4gICAgICAgIC8vIGVuc3VyZSBpbmRleCBJRCBleGlzdHMsIGVuc3VyZSBleHBlcmltZW50ZXIgdXNlciBJRCBleGlzdHMsIHVwcGVyY2FzZSBpbml0aWFscyBvciA/XG4gICAgICAgIHZhciBhc3NheSwgZXhwZXJpbWVudGVyO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChleHBlcmltZW50ZXIgPSBFREREYXRhLlVzZXJzW2Fzc2F5LmV4cF0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cGVyaW1lbnRlci5pbml0aWFscy50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZEFzc2F5TW9kaWZpY2F0aW9uKGluZGV4OmFueSk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2Q7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgaGVhZGVycyBhbG9uZyB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUhlYWRlclNwZWMoKTpEYXRhR3JpZEhlYWRlclNwZWNbXSB7XG4gICAgICAgIC8vIG1hcCBhbGwgbWV0YWRhdGEgSURzIHRvIEhlYWRlclNwZWMgb2JqZWN0c1xuICAgICAgICB2YXIgbWV0YURhdGFIZWFkZXJzOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyICsgaW5kZXgsICdoQXNzYXlzTWV0YScrdGhpcy5wcm90b2NvbElEKydpZCcgKyBpZCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogbWRUeXBlLm5hbWUsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsIFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLm1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCksXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMgPSBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDggKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICdoQXNzYXlzR3JhcGgnICsgdGhpcy5wcm90b2NvbElELCB7ICdjb2xzcGFuJzogNyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGggfSk7XG5cbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gW1xuICAgICAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygxLCAnaEFzc2F5c05hbWUnK3RoaXMucHJvdG9jb2xJRCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ05hbWUnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLCBcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlOYW1lXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjID0gbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg1ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAnaEFzc2F5c01UaW1lcycrdGhpcy5wcm90b2NvbElELCB7ICduYW1lJzogJ01lYXN1cmluZyBUaW1lcycsICdoZWFkZXJSb3cnOiAyIH0pO1xuXG4gICAgICAgIHZhciByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c01OYW1lJyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAgeyAnbmFtZSc6ICdNZWFzdXJlbWVudCcsICdoZWFkZXJSb3cnOiAyIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygzICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNVbml0cycgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHsgJ25hbWUnOiAnVW5pdHMnLCAnaGVhZGVyUm93JzogMiB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNCArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzQ291bnQnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7ICduYW1lJzogJ0NvdW50JywgJ2hlYWRlclJvdyc6IDIgfSksXG4gICAgICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNiArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzRXhwZXJpbWVudGVyJyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiAnRXhwZXJpbWVudGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEV4cGVyaW1lbnRlckluaXRpYWxzLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDcgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c01vZGlmaWVkJyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFzdCBNb2RpZmllZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRBc3NheU1vZGlmaWNhdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAxXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUhlYWRlcnMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGkpID0+IHtcbiAgICAgICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpXTtcbiAgICAgICAgICAgIGlmIChyZWNvcmQgJiYgcmVjb3JkLm1ldGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkLm1ldGFbaWRdIHx8ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY29sc3BhbiB2YWx1ZSBmb3IgYWxsIHRoZSBjZWxscyB0aGF0IGFyZSBhc3NheS1sZXZlbCAobm90IG1lYXN1cmVtZW50LWxldmVsKSBpcyBiYXNlZCBvblxuICAgIC8vIHRoZSBudW1iZXIgb2YgbWVhc3VyZW1lbnRzIGZvciB0aGUgcmVzcGVjdGl2ZSByZWNvcmQuIFNwZWNpZmljYWxseSwgaXQncyB0aGUgbnVtYmVyIG9mXG4gICAgLy8gbWV0YWJvbGl0ZSBtZWFzdXJlbWVudHMsIHBsdXMgMSBpZiB0aGVyZSBhcmUgdHJhbnNjcmlwdG9taWNzIG1lYXN1cmVtZW50cywgcGx1cyAxIGlmIHRoZXJlXG4gICAgLy8gYXJlIHByb3Rlb21pY3MgbWVhc3VyZW1lbnRzLCBhbGwgYWRkZWQgdG9nZXRoZXIuICAoT3IgMSwgd2hpY2hldmVyIGlzIGhpZ2hlci4pXG4gICAgcHJpdmF0ZSByb3dTcGFuRm9yUmVjb3JkKGluZGV4KTpudW1iZXIge1xuICAgICAgICB2YXIgcmVjID0gRURERGF0YS5Bc3NheXNbaW5kZXhdO1xuICAgICAgICB2YXIgdjpudW1iZXIgPSAoKHJlYy5tZXRhYm9saXRlcyB8fCBbXSkubGVuZ3RoICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgocmVjLnRyYW5zY3JpcHRpb25zIHx8IFtdKS5sZW5ndGggPyAxIDogMCkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgKChyZWMucHJvdGVpbnMgfHwgW10pLmxlbmd0aCA/IDEgOiAwKSkgfHwgMTtcbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUFzc2F5TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBsaW5lID0gRURERGF0YS5MaW5lc1tyZWNvcmQubGlkXSwgc2lkZU1lbnVJdGVtcyA9IFtcbiAgICAgICAgICAgICc8YSBjbGFzcz1cImFzc2F5LWVkaXQtbGlua1wiPkVkaXQgQXNzYXk8L2E+JyxcbiAgICAgICAgICAgICc8YSBjbGFzcz1cImFzc2F5LXJlbG9hZC1saW5rXCI+UmVsb2FkIERhdGE8L2E+JyxcbiAgICAgICAgICAgICc8YSBocmVmPVwiL2V4cG9ydD9hc3NheUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBDU1YvZXRjPC9hPidcbiAgICAgICAgXTtcbiAgICAgICAgLy8gVE9ETyB3ZSBwcm9iYWJseSBkb24ndCB3YW50IHRvIHNwZWNpYWwtY2FzZSBsaWtlIHRoaXMgYnkgbmFtZVxuICAgICAgICBpZiAoZ3JpZFNwZWMucHJvdG9jb2xOYW1lID09IFwiVHJhbnNjcmlwdG9taWNzXCIpIHtcbiAgICAgICAgICAgIHNpZGVNZW51SXRlbXMucHVzaCgnPGEgaHJlZj1cImltcG9ydC9ybmFzZXEvZWRnZXBybz9hc3NheT0nK2luZGV4KydcIj5JbXBvcnQgUk5BLXNlcSBkYXRhIGZyb20gRURHRS1wcm88L2E+Jyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnYXNzYXlJZCcsXG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKGlkKSA9PiB7IHJldHVybiAnYXNzYXknICsgaWQgKyAnaW5jbHVkZSc7IH0sXG4gICAgICAgICAgICAgICAgJ3NpZGVNZW51SXRlbXMnOiBzaWRlTWVudUl0ZW1zLFxuICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFtsaW5lLm5hbWUsIGdyaWRTcGVjLnByb3RvY29sTmFtZSwgcmVjb3JkLm5hbWVdLmpvaW4oJy0nKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIG1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdID0+IHtcbiAgICAgICAgICAgIHZhciBjb250ZW50U3RyID0gJycsIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCB0eXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIGlmIChhc3NheSAmJiB0eXBlICYmIGFzc2F5Lm1ldGEgJiYgKGNvbnRlbnRTdHIgPSBhc3NheS5tZXRhW2lkXSB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50U3RyID0gWyB0eXBlLnByZSB8fCAnJywgY29udGVudFN0ciwgdHlwZS5wb3N0Zml4IHx8ICcnIF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudFN0clxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyxcbiAgICAgICAgICAgIG9wdDphbnkpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGNlbGxzID0gW10sXG4gICAgICAgICAgICBmYWN0b3J5ID0gKCk6RGF0YUdyaWREYXRhQ2VsbCA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgpO1xuXG4gICAgICAgIGlmICgocmVjb3JkLm1ldGFib2xpdGVzIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICB7ICdyb3dzcGFuJzogcmVjb3JkLm1ldGFib2xpdGVzLmxlbmd0aCB9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgSURzIHRvIG1lYXN1cmVtZW50cywgc29ydCBieSBuYW1lLCB0aGVuIGNvbnZlcnQgdG8gY2VsbCBvYmplY3RzXG4gICAgICAgICAgICAgICAgY2VsbHMgPSByZWNvcmQubWV0YWJvbGl0ZXMubWFwKG9wdC5tZXRhYm9saXRlVG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zb3J0KG9wdC5tZXRhYm9saXRlVmFsdWVTb3J0KVxuICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChvcHQubWV0YWJvbGl0ZVZhbHVlVG9DZWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoKHJlY29yZC5nZW5lcmFsIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIHsgJ3Jvd3NwYW4nOiByZWNvcmQuZ2VuZXJhbC5sZW5ndGggfSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IElEcyB0byBtZWFzdXJlbWVudHMsIHNvcnQgYnkgbmFtZSwgdGhlbiBjb252ZXJ0IHRvIGNlbGwgb2JqZWN0c1xuICAgICAgICAgICAgICAgIGNlbGxzID0gcmVjb3JkLmdlbmVyYWwubWFwKG9wdC5tZXRhYm9saXRlVG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQob3B0Lm1ldGFib2xpdGVWYWx1ZVNvcnQpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAob3B0Lm1ldGFib2xpdGVWYWx1ZVRvQ2VsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgb25seSBvbmUgY2VsbCBpZiB0aGVyZSBpcyBhbnkgdHJhbnNjcmlwdG9taWNzIGRhdGFcbiAgICAgICAgaWYgKChyZWNvcmQudHJhbnNjcmlwdGlvbnMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC50cmFuc2NyaXB0VG9DZWxsKHJlY29yZC50cmFuc2NyaXB0aW9ucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIG9ubHkgb25lIGNlbGwgaWYgdGhlcmUgaXMgYW55IHByb3Rlb21pY3MgZGF0YVxuICAgICAgICBpZiAoKHJlY29yZC5wcm90ZWlucyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LnByb3RlaW5Ub0NlbGwocmVjb3JkLnByb3RlaW5zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgYSBsb2FkaW5nIGNlbGwgaWYgbm9uZSBjcmVhdGVkIGJ5IG1lYXN1cmVtZW50c1xuICAgICAgICBpZiAoIWNlbGxzLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKHJlY29yZC5jb3VudCkge1xuICAgICAgICAgICAgICAgIC8vIHdlIGhhdmUgYSBjb3VudCwgYnV0IG5vIGRhdGEgeWV0OyBzdGlsbCBsb2FkaW5nXG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmVtcHR5KSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQuZW1wdHkuY2FsbCh7fSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKGZhY3RvcnkoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNlbGxzO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVNZWFzdXJlbWVudE5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAnY2hlY2tib3hOYW1lJzogJ21lYXN1cmVtZW50SWQnLFxuICAgICAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoKSA9PiB7IHJldHVybiAnbWVhc3VyZW1lbnQnICsgdmFsdWUuaWQgKyAnaW5jbHVkZSc7IH0sXG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdmFsdWUubmFtZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1RyYW5zY3JpcHRvbWljcyBEYXRhJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1Byb3Rlb21pY3MgRGF0YSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImVtcHR5XCI6ICgpID0+IG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJzxpPk5vIE1lYXN1cmVtZW50czwvaT4nXG4gICAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlVW5pdHNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICB1bml0OmFueSA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmUueV91bml0c10gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICd1bml0JzogdW5pdC5uYW1lIHx8ICcnIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHZhbHVlLnVuaXRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdSUEtNJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJycgLy8gVE9ETzogd2hhdCBhcmUgcHJvdGVvbWljcyBtZWFzdXJlbWVudCB1bml0cz9cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNvdW50Q2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIC8vIGZ1bmN0aW9uIHRvIHVzZSBpbiBBcnJheSNyZWR1Y2UgdG8gY291bnQgYWxsIHRoZSB2YWx1ZXMgaW4gYSBzZXQgb2YgbWVhc3VyZW1lbnRzXG4gICAgICAgIHZhciByZWR1Y2VDb3VudCA9IChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICByZXR1cm4gcHJldiArIChtZWFzdXJlLnZhbHVlcyB8fCBbXSkubGVuZ3RoO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgKHZhbHVlLm1lYXN1cmUudmFsdWVzIHx8IFtdKS5sZW5ndGgsICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsIGlkcy5yZWR1Y2UocmVkdWNlQ291bnQsIDApLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCBpZHMucmVkdWNlKHJlZHVjZUNvdW50LCAwKSwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTWVhc3VyaW5nVGltZXNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHR1cGxlVGltZUNvdW50ID0gKHZhbHVlLCBrZXkpID0+IHsgcmV0dXJuIFtbIGtleSwgdmFsdWUgXV07IH0sXG4gICAgICAgICAgICBzb3J0QnlUaW1lID0gKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gcGFyc2VGbG9hdChhWzBdKSwgeiA9IHBhcnNlRmxvYXQoYlswXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN2Z0NlbGxGb3JUaW1lQ291bnRzID0gKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjb25zb2xpZGF0ZWQsIHN2ZyA9ICcnLCB0aW1lQ291bnQgPSB7fTtcbiAgICAgICAgICAgICAgICAvLyBjb3VudCB2YWx1ZXMgYXQgZWFjaCB4IGZvciBhbGwgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICAgICAgaWRzLmZvckVhY2goKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOmFueVtdID0gbWVhc3VyZS52YWx1ZXMgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIGRhdGEuZm9yRWFjaCgocG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVDb3VudFtwb2ludFswXVswXV0gPSB0aW1lQ291bnRbcG9pbnRbMF1bMF1dIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUeXBlc2NyaXB0IGNvbXBpbGVyIGRvZXMgbm90IGxpa2UgdXNpbmcgaW5jcmVtZW50IG9wZXJhdG9yIG9uIGV4cHJlc3Npb25cbiAgICAgICAgICAgICAgICAgICAgICAgICsrdGltZUNvdW50W3BvaW50WzBdWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gbWFwIHRoZSBjb3VudHMgdG8gW3gsIHldIHR1cGxlcywgc29ydGVkIGJ5IHggdmFsdWVcbiAgICAgICAgICAgICAgICBjb25zb2xpZGF0ZWQgPSAkLm1hcCh0aW1lQ291bnQsIHR1cGxlVGltZUNvdW50KS5zb3J0KHNvcnRCeVRpbWUpO1xuICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIFNWRyBzdHJpbmdcbiAgICAgICAgICAgICAgICBpZiAoY29uc29saWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdmcgPSBncmlkU3BlYy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMoY29uc29saWRhdGVkLCAnJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlID0gdmFsdWUubWVhc3VyZSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0ID0gbWVhc3VyZS5mb3JtYXQgPT09IDEgPyAnY2FyYm9uJyA6ICcnLFxuICAgICAgICAgICAgICAgICAgICBkYXRhID0gdmFsdWUubWVhc3VyZS52YWx1ZXMgfHwgW10sXG4gICAgICAgICAgICAgICAgICAgIHN2ZyA9IGdyaWRTcGVjLmFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhkYXRhLCBmb3JtYXQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBzdmdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IHN2Z0NlbGxGb3JUaW1lQ291bnRzLFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiBzdmdDZWxsRm9yVGltZUNvdW50c1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBleHAgPSBFREREYXRhLkFzc2F5c1tpbmRleF0uZXhwO1xuICAgICAgICB2YXIgdVJlY29yZCA9IEVERERhdGEuVXNlcnNbZXhwXTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB1UmVjb3JkID8gdVJlY29yZC5pbml0aWFscyA6ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2QpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKHBvaW50cywgZm9ybWF0OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHN2ZyA9ICc8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2ZXJzaW9uPVwiMS4yXCIgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTBweFwiXFxcbiAgICAgICAgICAgICAgICAgICAgdmlld0JveD1cIjAgMCA0NzAgMTBcIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPVwibm9uZVwiPlxcXG4gICAgICAgICAgICAgICAgPHN0eWxlIHR5cGU9XCJ0ZXh0L2Nzc1wiPjwhW0NEQVRBW1xcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY1AgeyBzdHJva2U6cmdiYSgwLDAsMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNWIHsgc3Ryb2tlOnJnYmEoMCwwLDIzMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNFIHsgc3Ryb2tlOnJnYmEoMjU1LDEyOCwwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgIF1dPjwvc3R5bGU+XFxcbiAgICAgICAgICAgICAgICA8cGF0aCBmaWxsPVwicmdiYSgwLDAsMCwwLjAuMDUpXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3Ryb2tlPVwicmdiYSgwLDAsMCwwLjA1KVwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIGQ9XCJNMTAsNWg0NTBcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT1cInN0cm9rZS13aWR0aDoycHg7XCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3Ryb2tlLXdpZHRoPVwiMlwiPjwvcGF0aD4nO1xuICAgICAgICB2YXIgcGF0aHMgPSBbIHN2ZyBdO1xuICAgICAgICBwb2ludHMuc29ydCgoYSxiKSA9PiB7IHJldHVybiBhWzBdIC0gYlswXTsgfSkuZm9yRWFjaCgocG9pbnQpID0+IHtcbiAgICAgICAgICAgIHZhciB4ID0gcG9pbnRbMF1bMF0sXG4gICAgICAgICAgICAgICAgeSA9IHBvaW50WzFdWzBdLFxuICAgICAgICAgICAgICAgIHJ4ID0gKCh4IC8gdGhpcy5tYXhpbXVtWFZhbHVlSW5EYXRhKSAqIDQ1MCkgKyAxMCxcbiAgICAgICAgICAgICAgICB0dCA9IFt5LCAnIGF0ICcsIHgsICdoJ10uam9pbignJyk7XG4gICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjRVwiIGQ9XCJNJywgcngsICcsNXY0XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIGlmICh5ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY0VcIiBkPVwiTScsIHJ4LCAnLDJ2NlwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1BcIiBkPVwiTScsIHJ4LCAnLDF2NFwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICBpZiAoZm9ybWF0ID09PSAnY2FyYm9uJykge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNWXCIgZD1cIk0nLCByeCwgJywxdjhcIj48dGl0bGU+JywgdHQsICc8L3RpdGxlPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNQXCIgZD1cIk0nLCByeCwgJywxdjhcIj48dGl0bGU+JywgdHQsICc8L3RpdGxlPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBwYXRocy5wdXNoKCc8L3N2Zz4nKTtcbiAgICAgICAgcmV0dXJuIHBhdGhzLmpvaW4oJ1xcbicpO1xuICAgIH1cbiAgICBcblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGRhdGEgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVDb2x1bW5TcGVjKCk6RGF0YUdyaWRDb2x1bW5TcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICBtZXRhRGF0YUNvbHM6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICByaWdodFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW107XG4gICAgICAgIC8vIGFkZCBjbGljayBoYW5kbGVyIGZvciBtZW51IG9uIGFzc2F5IG5hbWUgY2VsbHNcbiAgICAgICAgJCh0aGlzLnRhYmxlRWxlbWVudCkub24oJ2NsaWNrJywgJ2EuYXNzYXktZWRpdC1saW5rJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBTdHVkeUQuZWRpdEFzc2F5KCQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICdhLmFzc2F5LXJlbG9hZC1saW5rJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgdmFyIGlkID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpLFxuICAgICAgICAgICAgICAgIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgU3R1ZHlELnJlcXVlc3RBc3NheURhdGEoYXNzYXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgbGVmdFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIHRoaXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscylcbiAgICAgICAgICAgXTtcblxuICAgICAgICBtZXRhRGF0YUNvbHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIgKyBpbmRleCwgdGhpcy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNZWFzdXJlbWVudE5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDMgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlVW5pdHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDQgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlQ291bnRDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDUgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTWVhc3VyaW5nVGltZXNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG4gICAgZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSB7XG4gICAgICAgIHZhciB0b3BTZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ05hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdmFyIG1ldGFEYXRhQ29sR3JvdXBzOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgICAgIG1ldGFEYXRhQ29sR3JvdXBzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKG1kVHlwZS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGJvdHRvbVNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyZW1lbnQnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdVbml0cycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NvdW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyaW5nIFRpbWVzJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRXhwZXJpbWVudGVyJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFzdCBNb2RpZmllZCcsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gdG9wU2VjdGlvbi5jb25jYXQobWV0YURhdGFDb2xHcm91cHMsIGJvdHRvbVNlY3Rpb24pO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBoZWFkZXIgd2lkZ2V0cy5cbiAgICAvLyBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGFkZGVkIHRvIHRoZSBoZWFkZXIgYmFyLlxuICAgIC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzdWJzdHJpbmcgc2VhcmNoaW5nXG4gICAgICAgIHZhciBzZWFyY2hBc3NheXNXaWRnZXQgPSBuZXcgREdBc3NheXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggQXNzYXlzJywgMzAsXG4gICAgICAgICAgICAgICAgZmFsc2UpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWFyY2hBc3NheXNXaWRnZXQpO1xuICAgICAgICAvLyBBIFwic2VsZWN0IGFsbFwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy5cbiAgICAvLyBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGRpc3BsYXllZCBpbiB0aGUgbWVudS5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIEFzc2F5c1xuICAgICAgICB2YXIgZGlzYWJsZWRBc3NheXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZEFzc2F5c1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkQXNzYXlzV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG4gICAgb25Jbml0aWFsaXplZChkYXRhR3JpZDpEYXRhR3JpZEFzc2F5cyk6dm9pZCB7XG5cbiAgICAgICAgLy8gV2lyZSB1cCB0aGUgJ2FjdGlvbiBwYW5lbHMnIGZvciB0aGUgQXNzYXlzIHNlY3Rpb25zXG4gICAgICAgIHZhciB0YWJsZSA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgICQodGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gU3R1ZHlELnF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93KCkpO1xuXG4gICAgICAgIGlmICh0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdikge1xuICAgICAgICAgICAgJCh0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdikuY2xpY2soKCkgPT4gZGF0YUdyaWQuY2xpY2tlZERpc2Nsb3NlKHRydWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwID0gdGhpcy5wcm90b2NvbElEO1xuICAgICAgICB2YXIgZ3JhcGhpZCA9IFwicHJvXCIgKyBwICsgXCJncmFwaFwiO1xuICAgICAgICBpZiAodGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICQodGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjLmVsZW1lbnQpLmh0bWwoJzxkaXYgaWQ9XCInICsgZ3JhcGhpZCArXG4gICAgICAgICAgICAgICAgICAgICAgICAnXCIgY2xhc3M9XCJncmFwaENvbnRhaW5lclwiPjwvZGl2PicpO1xuICAgICAgICAgICAgICAgIC8vIEluaXRpYWxpemUgdGhlIGdyYXBoIG9iamVjdFxuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhPYmplY3QgPSBPYmplY3QuY3JlYXRlKFN0dWR5REdyYXBoaW5nKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoT2JqZWN0LlNldHVwKGdyYXBoaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIFJ1biBpdCBvbmNlIGluIGNhc2UgdGhlIHBhZ2Ugd2FzIGdlbmVyYXRlZCB3aXRoIGNoZWNrZWQgQXNzYXlzXG4gICAgICAgIFN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpO1xuICAgIH1cbn1cblxuXG5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgQXNzYXlzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRBc3NheXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ1Nob3dEQXNzYXlzQ0InK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgICQoY2IpLmNsaWNrKCAoZSkgPT4gdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmNsaWNrZWRPcHRpb25XaWRnZXQoZSkgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnU2hvdyBEaXNhYmxlZCcsIGNiSUQpOztcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IHJvd0lEcy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gcm93SURzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKGlkKTsgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOmFueSk6YW55IHtcbiAgICAgICAgaWYgKCFFREREYXRhLkFzc2F5c1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyBhIERhdGFHcmlkSGVhZGVyV2lkZ2V0IGRlcml2ZWQgZnJvbSBER1NlYXJjaFdpZGdldC4gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVyc1xuLy8gb3B0aW9ucyBmb3IgYWRkaXRpb25hbCBkYXRhIHR5cGVzLCBxdWVyeWluZyB0aGUgc2VydmVyIGZvciByZXN1bHRzLlxuY2xhc3MgREdBc3NheXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBzZWFyY2hEaXNjbG9zdXJlRWxlbWVudDphbnk7XG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6YW55LCBkYXRhR3JpZFNwZWM6YW55LCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLFxuICAgICAgICAgICAgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjLCBwbGFjZUhvbGRlciwgc2l6ZSwgZ2V0c0ZvY3VzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zIHdoZW4gY3JlYXRpbmcgaW5wdXRcbiAgICAvLyBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHN1cGVyLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBhcHBlbmQgdGhlIHdpZGdldCBlbGVtZW50cyBiZW5lYXRoIHRoZSBnaXZlbiBlbGVtZW50LiBJZiB0aGUgZWxlbWVudHMgaGF2ZVxuICAgIC8vIG5vdCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgdGhlIHVuaXF1ZUlEIGlzIHBhc3NlZCBhbG9uZy5cbiAgICBhcHBlbmRFbGVtZW50cyhjb250YWluZXI6YW55LCB1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICAgIH1cbn1cblxuXG4vLyB1c2UgSlF1ZXJ5IHJlYWR5IGV2ZW50IHNob3J0Y3V0IHRvIGNhbGwgcHJlcGFyZUl0IHdoZW4gcGFnZSBpcyByZWFkeVxuJCgoKSA9PiBTdHVkeUQucHJlcGFyZUl0KCkpO1xuXG4iXX0=