/// <reference path="typescript-declarations.d.ts" />
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
            this.filterTableJQ = null;
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
            this.filterTableJQ = $('<div>').addClass('filterTable').appendTo($('#mainFilterSection'));
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
            var _this = this;
            this.filterTableJQ.children().detach();
            var dark = false;
            $.each(this.allFilters, function (i, widget) {
                if (widget.isFilterUseful()) {
                    widget.addToParent(_this.filterTableJQ[0]);
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
                fCol.append(this.searchBoxTitleDiv).append(this.scrollZoneDiv);
                // Change the reference so we're affecting the innerHTML of the correct div later on
                fCol = $(this.scrollZoneDiv);
            }
            else {
                fCol.append(this.plaintextTitleDiv);
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
            // TODO: Drag select is twitchy - clicking a table cell background should check the box,
            // even if the user isn't hitting the label or the checkbox itself.
            Dragboxes.initTable(this.filteringTable);
        };
        // Returns true if any of the checkboxes show a different state than when this function was
        // last called
        GenericFilterSection.prototype.anyCheckboxesChangedSinceLastInquiry = function () {
            var _this = this;
            var changed = false, currentCheckboxState = {}, v = $(this.searchBox).val();
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
            // Create a document fragment, and accumulate inside it all the rows we want to display, in sorted order.
            var frag = document.createDocumentFragment();
            var rowsToAppend = [];
            this.uniqueValuesOrder.forEach(function (crID) {
                var checkbox = _this.checkboxes[crID], row = _this.tableRows[crID], show = !!valuesVisiblePreFiltering[crID];
                checkbox.prop('disabled', !show);
                $(row).toggleClass('nodata', !show);
                if (show) {
                    frag.appendChild(row);
                }
                else {
                    rowsToAppend.push(row);
                }
            });
            // Now, append all the rows we disabled, so they go to the bottom of the table
            rowsToAppend.forEach(function (row) { return frag.appendChild(row); });
            // Remember that we last sorted by this column
            this.tableBodyElement.appendChild(frag);
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
    function filterTableKeyDown(e) {
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
                this.queueMainGraphRemake(false);
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
        $('#mainFilterSection').on('mouseover mousedown mouseup', this.queueMainGraphRemake.bind(this, false))
            .on('keydown', filterTableKeyDown.bind(this));
        $('#separateAxesCheckbox').on('change', this.queueMainGraphRemake.bind(this, true));
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
        $.each(EDDData.Protocols, function (id, protocol) {
            $.ajax({
                url: 'measurements/' + id + '/',
                type: 'GET',
                dataType: 'json',
                error: function (xhr, status) {
                    console.log('Failed to fetch measurement data on ' + protocol.name + '!');
                    console.log(status);
                },
                success: processMeasurementData.bind(_this, protocol)
            });
        });
    }
    StudyD.prepareAfterLinesTable = prepareAfterLinesTable;
    function requestAssayData(assay) {
        var protocol = EDDData.Protocols[assay.pid];
        $.ajax({
            url: ['measurements', assay.pid, assay.id, ''].join('/'),
            type: 'GET',
            dataType: 'json',
            error: function (xhr, status) {
                console.log('Failed to fetch measurement data on ' + assay.name + '!');
                console.log(status);
            },
            success: processMeasurementData.bind(this, protocol)
        });
    }
    StudyD.requestAssayData = requestAssayData;
    function processMeasurementData(protocol, data) {
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
        this.progressiveFilteringWidget.processIncomingMeasurementRecords(data.measures || {}, data.types);
        if (count_rec < count_total) {
        }
        // invalidate assays on all DataGrids; redraws the affected rows
        $.each(this.assaysDataGrids, function (protocolId, dataGrid) {
            dataGrid.invalidateAssayRecords(Object.keys(protocolToAssay[protocolId] || {}));
        });
        this.linesDataGridSpec.enableCarbonBalanceWidget(true);
        this.processCarbonBalanceData();
        this.queueMainGraphRemake(false);
    }
    function carbonBalanceColumnRevealedCallback(spec, dataGridObj) {
        StudyD.rebuildCarbonBalanceGraphs();
    }
    StudyD.carbonBalanceColumnRevealedCallback = carbonBalanceColumnRevealedCallback;
    // Start a timer to wait before calling the routine that shows the actions panel.
    function queueLinesActionPanelShow() {
        if (this.linesActionPanelRefreshTimer) {
            clearTimeout(this.linesActionPanelRefreshTimer);
        }
        this.linesActionPanelRefreshTimer = setTimeout(linesActionPanelShow.bind(this), 150);
    }
    StudyD.queueLinesActionPanelShow = queueLinesActionPanelShow;
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
            'ids': checkedBoxes.map(function (box) { return box.value; })
        });
        $('#groupLineButton').toggleClass('off', checkedLen < 2);
    }
    function queueAssaysActionPanelShow() {
        // Start a timer to wait before calling the routine that remakes the graph.
        // This way we're not bothering the user with the long redraw process when
        // they are making fast edits.
        if (this.assaysActionPanelRefreshTimer) {
            clearTimeout(this.assaysActionPanelRefreshTimer);
        }
        this.assaysActionPanelRefreshTimer = setTimeout(assaysActionPanelShow.bind(this), 150);
    }
    StudyD.queueAssaysActionPanelShow = queueAssaysActionPanelShow;
    function assaysActionPanelShow() {
        var checkedBoxes = [], checkedAssays, checkedMeasure, panel, infobox;
        panel = $('#assaysActionPanel');
        if (!panel.size()) {
            return;
        }
        // Figure out how many assays/checkboxes are selected.
        $.each(this.assaysDataGrids, function (pID, dataGrid) {
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
        if (this.mainGraphRefreshTimerID) {
            clearTimeout(this.mainGraphRefreshTimerID);
        }
        this.mainGraphRefreshTimerID = setTimeout(remakeMainGraphArea.bind(this, force), 200);
    }
    StudyD.queueMainGraphRemake = queueMainGraphRemake;
    function remakeMainGraphArea(force) {
        var _this = this;
        var previousIDSet, postFilteringMeasurements, dataPointsDisplayed = 0, dataPointsTotal = 0, separateAxes = $('#separateAxesCheckbox').prop('checked'), 
        // FIXME assumes (x0, y0) points
        convert = function (d) { return [[d[0][0], d[1][0]]]; }, compare = function (a, b) { return a[0] - b[0]; };
        this.mainGraphRefreshTimerID = 0;
        if (!this.progressiveFilteringWidget.checkRedrawRequired(force)) {
            return;
        }
        // Start out with a blank graph.  We will re-add all the relevant sets.
        this.mainGraphObject.clearAllSets();
        postFilteringMeasurements = this.progressiveFilteringWidget.buildFilteredMeasurements();
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
            _this.mainGraphObject.addNewSet(newSet);
        });
        var displayText = dataPointsDisplayed + " points displayed";
        if (dataPointsDisplayed != dataPointsTotal) {
            displayText += " (out of " + dataPointsTotal + ")";
        }
        $('#pointsDisplayedSpan').empty().text(displayText);
        this.mainGraphObject.drawSets();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS50cyJdLCJuYW1lcyI6WyJTdHVkeUQiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY29uc3RydWN0b3IiLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJlcGFyZUZpbHRlcmluZ1NlY3Rpb24iLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24iLCJTdHVkeUQuUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzIiwiU3R1ZHlELlByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkQXNzYXlJRFNldCIsIlN0dWR5RC5Qcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzIiwiU3R1ZHlELlByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmNoZWNrUmVkcmF3UmVxdWlyZWQiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24iLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmNyZWF0ZUNvbnRhaW5lck9iamVjdHMiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24ucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmlzRmlsdGVyVXNlZnVsIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFkZFRvUGFyZW50IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFwcGx5QmFja2dyb3VuZFN0eWxlIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLnBvcHVsYXRlVGFibGUiLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmciLCJTdHVkeUQuR2VuZXJpY0ZpbHRlclNlY3Rpb24uX2Fzc2F5SWRUb0Fzc2F5IiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLl9hc3NheUlkVG9MaW5lIiwiU3R1ZHlELkdlbmVyaWNGaWx0ZXJTZWN0aW9uLl9hc3NheUlkVG9Qcm90b2NvbCIsIlN0dWR5RC5HZW5lcmljRmlsdGVyU2VjdGlvbi5nZXRJZE1hcFRvVmFsdWVzIiwiU3R1ZHlELlN0cmFpbkZpbHRlclNlY3Rpb24iLCJTdHVkeUQuU3RyYWluRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5TdHJhaW5GaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5TdHJhaW5GaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkNhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5DYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5DYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkNhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5DYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5DYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuTGluZU5hbWVGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELkxpbmVOYW1lRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5MaW5lTmFtZUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkxpbmVOYW1lRmlsdGVyU2VjdGlvbi51cGRhdGVVbmlxdWVJbmRleGVzSGFzaCIsIlN0dWR5RC5Qcm90b2NvbEZpbHRlclNlY3Rpb24iLCJTdHVkeUQuUHJvdG9jb2xGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELlByb3RvY29sRmlsdGVyU2VjdGlvbi5jb25maWd1cmUiLCJTdHVkeUQuUHJvdG9jb2xGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkFzc2F5U3VmZml4RmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5Bc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5Bc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuTWV0YURhdGFGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELk1ldGFEYXRhRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5NZXRhRGF0YUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkxpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5MaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELkFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24iLCJTdHVkeUQuTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5NZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5NZWFzdXJlbWVudEZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZWFzdXJlbWVudEZpbHRlclNlY3Rpb24uaXNGaWx0ZXJVc2VmdWwiLCJTdHVkeUQuTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uLmNvbnN0cnVjdG9yIiwiU3R1ZHlELk1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uLmNvbmZpZ3VyZSIsIlN0dWR5RC5NZXRhYm9saXRlRmlsdGVyU2VjdGlvbi5pc0ZpbHRlclVzZWZ1bCIsIlN0dWR5RC5NZXRhYm9saXRlRmlsdGVyU2VjdGlvbi51cGRhdGVVbmlxdWVJbmRleGVzSGFzaCIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbiIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbi5jb25zdHJ1Y3RvciIsIlN0dWR5RC5Qcm90ZWluRmlsdGVyU2VjdGlvbi5jb25maWd1cmUiLCJTdHVkeUQuUHJvdGVpbkZpbHRlclNlY3Rpb24uaXNGaWx0ZXJVc2VmdWwiLCJTdHVkeUQuUHJvdGVpbkZpbHRlclNlY3Rpb24udXBkYXRlVW5pcXVlSW5kZXhlc0hhc2giLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24iLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24uY29uc3RydWN0b3IiLCJTdHVkeUQuR2VuZUZpbHRlclNlY3Rpb24uY29uZmlndXJlIiwiU3R1ZHlELkdlbmVGaWx0ZXJTZWN0aW9uLmlzRmlsdGVyVXNlZnVsIiwiU3R1ZHlELkdlbmVGaWx0ZXJTZWN0aW9uLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoIiwiU3R1ZHlELnByZXBhcmVJdCIsIlN0dWR5RC5wcmVwYXJlUGVybWlzc2lvbnMiLCJTdHVkeUQucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhIiwiU3R1ZHlELmZpbHRlclRhYmxlS2V5RG93biIsIlN0dWR5RC5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlIiwiU3R1ZHlELnJlcXVlc3RBc3NheURhdGEiLCJTdHVkeUQucHJvY2Vzc01lYXN1cmVtZW50RGF0YSIsIlN0dWR5RC5jYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFjayIsIlN0dWR5RC5xdWV1ZUxpbmVzQWN0aW9uUGFuZWxTaG93IiwiU3R1ZHlELmxpbmVzQWN0aW9uUGFuZWxTaG93IiwiU3R1ZHlELnF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93IiwiU3R1ZHlELmFzc2F5c0FjdGlvblBhbmVsU2hvdyIsIlN0dWR5RC5xdWV1ZU1haW5HcmFwaFJlbWFrZSIsIlN0dWR5RC5yZW1ha2VNYWluR3JhcGhBcmVhIiwiU3R1ZHlELmNsZWFyQXNzYXlGb3JtIiwiU3R1ZHlELmNsZWFyTGluZUZvcm0iLCJTdHVkeUQuZmlsbEFzc2F5Rm9ybSIsIlN0dWR5RC5maWxsTGluZUZvcm0iLCJTdHVkeUQuc2Nyb2xsVG9Gb3JtIiwiU3R1ZHlELnVwZGF0ZVVJQXNzYXlGb3JtIiwiU3R1ZHlELnVwZGF0ZVVJTGluZUZvcm0iLCJTdHVkeUQuaW5zZXJ0TGluZU1ldGFkYXRhUm93IiwiU3R1ZHlELmVkaXRBc3NheSIsIlN0dWR5RC5lZGl0TGluZSIsIlN0dWR5RC5vbkNoYW5nZWRNZXRhYm9saWNNYXAiLCJTdHVkeUQucmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMiLCJTdHVkeUQub25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSIsIkRhdGFHcmlkU3BlY0xpbmVzIiwiRGF0YUdyaWRTcGVjTGluZXMuY29uc3RydWN0b3IiLCJEYXRhR3JpZFNwZWNMaW5lcy5oaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0IiwiRGF0YUdyaWRTcGVjTGluZXMuZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldCIsIkRhdGFHcmlkU3BlY0xpbmVzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzIiwiRGF0YUdyaWRTcGVjTGluZXMuZmluZEdyb3VwSURzQW5kTmFtZXMiLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVUYWJsZVNwZWMiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkTGluZU5hbWUiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkU3RyYWluTmFtZSIsIkRhdGFHcmlkU3BlY0xpbmVzLmxvYWRGaXJzdENhcmJvblNvdXJjZSIsIkRhdGFHcmlkU3BlY0xpbmVzLmxvYWRDYXJib25Tb3VyY2UiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkQ2FyYm9uU291cmNlTGFiZWxpbmciLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5sb2FkTGluZU1vZGlmaWNhdGlvbiIsIkRhdGFHcmlkU3BlY0xpbmVzLmRlZmluZUhlYWRlclNwZWMiLCJEYXRhR3JpZFNwZWNMaW5lcy5tYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24iLCJEYXRhR3JpZFNwZWNMaW5lcy5yb3dTcGFuRm9yUmVjb3JkIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2VuZXJhdGVMaW5lTmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2VuZXJhdGVTdHJhaW5OYW1lQ2VsbHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2VuZXJhdGVDYXJib25Tb3VyY2VMYWJlbGluZ0NlbGxzIiwiRGF0YUdyaWRTcGVjTGluZXMuZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlRXhwZXJpbWVudGVySW5pdGlhbHNDZWxscyIsIkRhdGFHcmlkU3BlY0xpbmVzLmdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzIiwiRGF0YUdyaWRTcGVjTGluZXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbiIsIkRhdGFHcmlkU3BlY0xpbmVzLmRlZmluZUNvbHVtblNwZWMiLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVDb2x1bW5Hcm91cFNwZWMiLCJEYXRhR3JpZFNwZWNMaW5lcy5kZWZpbmVSb3dHcm91cFNwZWMiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZXRUYWJsZUVsZW1lbnQiLCJEYXRhR3JpZFNwZWNMaW5lcy5nZXRSZWNvcmRJRHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5jcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzIiwiRGF0YUdyaWRTcGVjTGluZXMuY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMiLCJEYXRhR3JpZFNwZWNMaW5lcy5vbkluaXRpYWxpemVkIiwiREdEaXNhYmxlZExpbmVzV2lkZ2V0IiwiREdEaXNhYmxlZExpbmVzV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdEaXNhYmxlZExpbmVzV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdEaXNhYmxlZExpbmVzV2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMiLCJER0Rpc2FibGVkTGluZXNXaWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQiLCJER0dyb3VwU3R1ZHlSZXBsaWNhdGVzV2lkZ2V0IiwiREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldC5jb25zdHJ1Y3RvciIsIkRHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQuY3JlYXRlRWxlbWVudHMiLCJER0xpbmVzU2VhcmNoV2lkZ2V0IiwiREdMaW5lc1NlYXJjaFdpZGdldC5jb25zdHJ1Y3RvciIsIkRHTGluZXNTZWFyY2hXaWRnZXQuY3JlYXRlRWxlbWVudHMiLCJER0xpbmVzU2VhcmNoV2lkZ2V0LmFwcGVuZEVsZW1lbnRzIiwiREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldCIsIkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuY29uc3RydWN0b3IiLCJER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldC5oaWdobGlnaHQiLCJER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0LmVuYWJsZSIsIkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuYWN0aXZhdGVDYXJib25CYWxhbmNlIiwiRGF0YUdyaWRBc3NheXMiLCJEYXRhR3JpZEFzc2F5cy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkQXNzYXlzLmludmFsaWRhdGVBc3NheVJlY29yZHMiLCJEYXRhR3JpZEFzc2F5cy5jbGlja2VkRGlzY2xvc2UiLCJEYXRhR3JpZEFzc2F5cy50cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCIsIkRhdGFHcmlkQXNzYXlzLl9jYW5jZWxHcmFwaCIsIkRhdGFHcmlkQXNzYXlzLnF1ZXVlR3JhcGhSZW1ha2UiLCJEYXRhR3JpZEFzc2F5cy5yZW1ha2VHcmFwaEFyZWEiLCJEYXRhR3JpZEFzc2F5cy5yZXNpemVHcmFwaCIsIkRhdGFHcmlkU3BlY0Fzc2F5cyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5yZWZyZXNoSURMaXN0IiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdldFJlY29yZElEcyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5vbkRhdGFSZXNldCIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZXRUYWJsZUVsZW1lbnQiLCJEYXRhR3JpZFNwZWNBc3NheXMuZGVmaW5lVGFibGVTcGVjIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkFzc2F5cyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5maW5kTWF4aW11bVhWYWx1ZUluRGF0YSIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5sb2FkQXNzYXlOYW1lIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5sb2FkQXNzYXlNb2RpZmljYXRpb24iLCJEYXRhR3JpZFNwZWNBc3NheXMuZGVmaW5lSGVhZGVyU3BlYyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5tYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24iLCJEYXRhR3JpZFNwZWNBc3NheXMucm93U3BhbkZvclJlY29yZCIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZUFzc2F5TmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLm1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24iLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVVbml0c0NlbGxzIiwiRGF0YUdyaWRTcGVjQXNzYXlzLmdlbmVyYXRlQ291bnRDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZ2VuZXJhdGVFeHBlcmltZW50ZXJDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMiLCJEYXRhR3JpZFNwZWNBc3NheXMuZGVmaW5lQ29sdW1uU3BlYyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5kZWZpbmVDb2x1bW5Hcm91cFNwZWMiLCJEYXRhR3JpZFNwZWNBc3NheXMuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5jcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY0Fzc2F5cy5vbkluaXRpYWxpemVkIiwiREdEaXNhYmxlZEFzc2F5c1dpZGdldCIsIkRHRGlzYWJsZWRBc3NheXNXaWRnZXQuY29uc3RydWN0b3IiLCJER0Rpc2FibGVkQXNzYXlzV2lkZ2V0LmNyZWF0ZUVsZW1lbnRzIiwiREdEaXNhYmxlZEFzc2F5c1dpZGdldC5hcHBseUZpbHRlclRvSURzIiwiREdEaXNhYmxlZEFzc2F5c1dpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCIsIkRHQXNzYXlzU2VhcmNoV2lkZ2V0IiwiREdBc3NheXNTZWFyY2hXaWRnZXQuY29uc3RydWN0b3IiLCJER0Fzc2F5c1NlYXJjaFdpZGdldC5jcmVhdGVFbGVtZW50cyIsIkRHQXNzYXlzU2VhcmNoV2lkZ2V0LmFwcGVuZEVsZW1lbnRzIl0sIm1hcHBpbmdzIjoiQUFBQSxxREFBcUQ7QUFDckQsK0JBQStCO0FBQy9CLHFDQUFxQztBQUNyQyxnREFBZ0Q7QUFDaEQsMkNBQTJDO0FBQzNDLG9DQUFvQztBQUNwQyx5Q0FBeUM7Ozs7OztBQUl6QyxJQUFPLE1BQU0sQ0EwdURaO0FBMXVERCxXQUFPLE1BQU0sRUFBQyxDQUFDO0lBQ1hBLFlBQVlBLENBQUNBO0lBRWJBLElBQUlBLGVBQW1CQSxDQUFDQTtJQUN4QkEsSUFBSUEsMEJBQXNEQSxDQUFDQTtJQUUzREEsSUFBSUEsdUJBQTJCQSxDQUFDQTtJQUVoQ0EsSUFBSUEsNEJBQWdDQSxDQUFDQTtJQUNyQ0EsSUFBSUEsNkJBQWlDQSxDQUFDQTtJQUV0Q0EsSUFBSUEsYUFBaUJBLENBQUNBO0lBQ3RCQSxJQUFJQSxlQUFtQkEsQ0FBQ0E7SUFDeEJBLElBQUlBLDBCQUE4QkEsQ0FBQ0E7SUFRbkNBLElBQUlBLGlCQUFxQkEsQ0FBQ0E7SUFDMUJBLElBQUlBLDJCQUFtQ0EsQ0FB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QUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFDeENBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1lBRWpDQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBO1lBQ2xDQSxtQ0FBbUNBO1lBQ25DQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBRWpDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDckJBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsUUFBZ0JBO2dCQUM1Q0EsSUFBSUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVCQSxRQUFRQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLEdBQUdBLEVBQUVBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO2dCQUM5RUEsS0FBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBd0JBLEtBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7Z0JBQ2xGQSxJQUFJQSxHQUFHQSxLQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtnQkFDN0NBLEtBQUlBLENBQUNBLFVBQVVBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLHlCQUF5QkEsQ0FBQ0E7cUJBQ25EQSxJQUFJQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxRQUFRQSxFQUFFQSxJQUFJQSxFQUFFQSxRQUFRQSxF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QUlBLENBQUNBO1lBQzVDQSx3Q0FBd0NBO1lBQ3hDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUMzQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0EsV0FBV0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdkVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsUUFBUUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDakVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsR0FBR0EsS0FBS0EsQ0FBQ0EsY0FBY0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDN0VBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNB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QUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUM5Q0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNsREEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNoREEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsMEJBQTBCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUM5REEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuREEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNqRkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFFRGxHLHNCQUFzQkEsSUFBSUEsRUFBRUEsTUFBTUE7UUFDOUJtRyxJQUFJQSxPQUFPQSxFQUFFQSxZQUFZQSxFQUFFQSxPQUFPQSxDQUFDQTtRQUNuQ0EsWUFBWUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDbERBLE9BQU9BLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2hEQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQzdEQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQzdHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQy9EQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLFlBQVlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO1FBQ3hHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSw2QkFBNkJBLENBQUNBLENBQUNBLEdBQUdBLENBQ3BDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFDQSxDQUFDQSxJQUFLQSxPQUFBQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUF3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsRUFBNURBLENBQTREQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNkJBQTZCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0RUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUM5QkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQ0EsQ0FBQ0EsSUFBS0EsT0FBQUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBa0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLEVBQXJEQSxDQUFxREEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbkdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FDOUJBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLENBQUNBLElBQUtBLE9BQUFBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLElBQWtCQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxF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QUNBLG1CQUFtQkEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFDaERBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3RDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSx1QkFBdUJBLEVBQUVBLEVBQUVBLEVBQUVBLGVBQWVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxFQUFFQSxFQUFFQSxlQUFlQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEVBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1lBQ0RBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLHVCQUF1QkEsRUFBRUEsRUFBRUEsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0QkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxFQUFFQSxFQUFFQSxlQUFlQSxFQUFFQSxFQUFFQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQy9GQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxFQUFFQSxF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Q3ZCRSxnQkFBS0EsQ0FBQ0EsY0FBY0EsWUFBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQy9CQSxDQUFDQTtJQUdERiwrRkFBK0ZBO0lBQy9GQSw0RUFBNEVBO0lBQzVFQSw2Q0FBY0EsR0FBZEEsVUFBZUEsU0FBYUEsRUFBRUEsUUFBWUE7UUFDdENHLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFDREEsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBQ0xILDJCQUFDQTtBQUFEQSxDQUFDQSxBQTNCRCxFQUFtQyxjQUFjLEVBMkJoRDtBQUdELHVFQUF1RTtBQUN2RSxDQUFDLENBQUMsY0FBTSxPQUFBLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBbEIsQ0FBa0IsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJCaW9tYXNzQ2FsY3VsYXRpb25VSS50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQ2FyYm9uU3VtbWF0aW9uLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiU3R1ZHlHcmFwaGluZy50c1wiIC8+XG5cbmRlY2xhcmUgdmFyIEVERERhdGE6RURERGF0YTtcblxubW9kdWxlIFN0dWR5RCB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIG1haW5HcmFwaE9iamVjdDphbnk7XG4gICAgdmFyIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0OiBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldDtcblxuICAgIHZhciBtYWluR3JhcGhSZWZyZXNoVGltZXJJRDphbnk7XG5cbiAgICB2YXIgbGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcjphbnk7XG4gICAgdmFyIGFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyOmFueTtcblxuICAgIHZhciBhdHRhY2htZW50SURzOmFueTtcbiAgICB2YXIgYXR0YWNobWVudHNCeUlEOmFueTtcbiAgICB2YXIgcHJldkRlc2NyaXB0aW9uRWRpdEVsZW1lbnQ6YW55O1xuXG4gICAgLy8gV2UgY2FuIGhhdmUgYSB2YWxpZCBtZXRhYm9saWMgbWFwIGJ1dCBubyB2YWxpZCBiaW9tYXNzIGNhbGN1bGF0aW9uLlxuICAgIC8vIElmIHRoZXkgdHJ5IHRvIHNob3cgY2FyYm9uIGJhbGFuY2UgaW4gdGhhdCBjYXNlLCB3ZSdsbCBicmluZyB1cCB0aGUgVUkgdG8gXG4gICAgLy8gY2FsY3VsYXRlIGJpb21hc3MgZm9yIHRoZSBzcGVjaWZpZWQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcElEOmFueTtcbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcE5hbWU6YW55O1xuICAgIGV4cG9ydCB2YXIgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcjtcbiAgICB2YXIgY2FyYm9uQmFsYW5jZURhdGE6YW55O1xuICAgIHZhciBjYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2g6Ym9vbGVhbjtcblxuICAgIHZhciBjU291cmNlRW50cmllczphbnk7XG4gICAgdmFyIG1UeXBlRW50cmllczphbnk7XG5cbiAgICAvLyBUaGUgdGFibGUgc3BlYyBvYmplY3QgYW5kIHRhYmxlIG9iamVjdCBmb3IgdGhlIExpbmVzIHRhYmxlLlxuICAgIHZhciBsaW5lc0RhdGFHcmlkU3BlYztcbiAgICB2YXIgbGluZXNEYXRhR3JpZDtcbiAgICAvLyBUYWJsZSBzcGVjIGFuZCB0YWJsZSBvYmplY3RzLCBvbmUgZWFjaCBwZXIgUHJvdG9jb2wsIGZvciBBc3NheXMuXG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkU3BlY3M7XG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkcztcblxuXG4gICAgLy8gVXRpbGl0eSBpbnRlcmZhY2UgdXNlZCBieSBHZW5lcmljRmlsdGVyU2VjdGlvbiN1cGRhdGVVbmlxdWVJbmRleGVzSGFzaFxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUlEIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXI7XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUxpc3Qge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcltdO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFVuaXF1ZUlEVG9WYWx1ZSB7XG4gICAgICAgIFtpbmRleDogbnVtYmVyXTogc3RyaW5nO1xuICAgIH1cbiAgICAvLyBVc2VkIGluIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0I3ByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uXG4gICAgZXhwb3J0IGludGVyZmFjZSBSZWNvcmRJRFRvQm9vbGVhbiB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogYm9vbGVhbjtcbiAgICB9XG5cblxuICAgIC8vIEZvciB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gb24gdGhlIG1haW4gZ3JhcGhcbiAgICBleHBvcnQgY2xhc3MgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQge1xuXG4gICAgICAgIGFsbEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGFzc2F5RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8ga2VlcCBhIHNlcGFyYXRlIGZpbHRlciBsaXN0IGZvciBlYWNoIHR5cGUuXG4gICAgICAgIG1ldGFib2xpdGVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBwcm90ZWluRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgZ2VuZUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIG1lYXN1cmVtZW50RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcblxuICAgICAgICBtZXRhYm9saXRlRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcbiAgICAgICAgcHJvdGVpbkRhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBnZW5lcmljRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcblxuICAgICAgICBmaWx0ZXJUYWJsZUpROiBKUXVlcnk7XG4gICAgICAgIHN0dWR5RE9iamVjdDogYW55O1xuICAgICAgICBtYWluR3JhcGhPYmplY3Q6IGFueTtcblxuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGluaXRpYWxpemUgZWFjaCBmaWx0ZXIgbGlzdC5cbiAgICAgICAgY29uc3RydWN0b3Ioc3R1ZHlET2JqZWN0OiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5zdHVkeURPYmplY3QgPSBzdHVkeURPYmplY3Q7XG5cbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkRhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcm9jZXNzZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gbnVsbDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmVhZCB0aHJvdWdoIHRoZSBMaW5lcywgQXNzYXlzLCBhbmQgQXNzYXlNZWFzdXJlbWVudHMgc3RydWN0dXJlcyB0byBsZWFybiB3aGF0IHR5cGVzIGFyZSBwcmVzZW50LFxuICAgICAgICAvLyB0aGVuIGluc3RhbnRpYXRlIHRoZSByZWxldmFudCBzdWJjbGFzc2VzIG9mIEdlbmVyaWNGaWx0ZXJTZWN0aW9uLCB0byBjcmVhdGUgYSBzZXJpZXMgb2ZcbiAgICAgICAgLy8gY29sdW1ucyBmb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIHVuZGVyIHRoZSBtYWluIGdyYXBoIG9uIHRoZSBwYWdlLlxuICAgICAgICAvLyBUaGlzIG11c3QgYmUgb3V0c2lkZSB0aGUgY29uc3RydWN0b3IgYmVjYXVzZSBFREREYXRhLkxpbmVzIGFuZCBFREREYXRhLkFzc2F5cyBhcmUgbm90IGltbWVkaWF0ZWx5IGF2YWlsYWJsZVxuICAgICAgICAvLyBvbiBwYWdlIGxvYWQuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGNyZWF0ZSBhbmQgYWRkIHJlbGV2YW50IGZpbHRlcnMgZm9yIGVhY2ggZ3JvdXAuXG4gICAgICAgIHByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgc2VlbkluTGluZXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5JbkFzc2F5c0hhc2g6IFJlY29yZElEVG9Cb29sZWFuID0ge307XG4gICAgICAgICAgICB2YXIgYUlEc1RvVXNlOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRhYmxlSlEgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdmaWx0ZXJUYWJsZScpLmFwcGVuZFRvKCQoJyNtYWluRmlsdGVyU2VjdGlvbicpKTtcblxuICAgICAgICAgICAgLy8gRmlyc3QgZG8gc29tZSBiYXNpYyBzYW5pdHkgZmlsdGVyaW5nIG9uIHRoZSBsaXN0XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkOiBzdHJpbmcsIGFzc2F5OiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSB8fCAhbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluQXNzYXlzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwgW10sIChtZXRhZGF0YUlkKSA9PiB7IHNlZW5JbkxpbmVzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgIGFJRHNUb1VzZS5wdXNoKGFzc2F5SWQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBmaWx0ZXJzIG9uIGFzc2F5IHRhYmxlc1xuICAgICAgICAgICAgLy8gVE9ETyBtZWRpYSBpcyBub3cgYSBtZXRhZGF0YSB0eXBlLCBzdHJhaW4gYW5kIGNhcmJvbiBzb3VyY2Ugc2hvdWxkIGJlIHRvb1xuICAgICAgICAgICAgdmFyIGFzc2F5RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFN0cmFpbkZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBmb3IgKHZhciBpZCBpbiBzZWVuSW5MaW5lc0hhc2gpIHtcbiAgICAgICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IExpbmVOYW1lRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBQcm90b2NvbEZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaWQgaW4gc2VlbkluQXNzYXlzSGFzaCkge1xuICAgICAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSBjYW4gaW5pdGlhbGl6ZSBhbGwgdGhlIEFzc2F5LSBhbmQgTGluZS1sZXZlbCBmaWx0ZXJzIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICB0aGlzLmFzc2F5RmlsdGVycyA9IGFzc2F5RmlsdGVycztcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5mb3JFYWNoKChmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGFJRHNUb1VzZSk7XG4gICAgICAgICAgICAgICAgZmlsdGVyLnBvcHVsYXRlVGFibGUoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnB1c2gobmV3IE1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnB1c2gobmV3IE1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLnB1c2gobmV3IFByb3RlaW5GaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLnB1c2gobmV3IEdlbmVGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMucHVzaChuZXcgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXS5jb25jYXQoXG4gICAgICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzKTtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgZmlsdGVycyBpbiB0aGUgZmlsdGVyaW5nIHNlY3Rpb24sIGFuZCBhZGQgaW4gdGhlIG9uZXMgdGhhdFxuICAgICAgICAvLyBjbGFpbSB0byBiZSBcInVzZWZ1bFwiLlxuICAgICAgICByZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGFibGVKUS5jaGlsZHJlbigpLmRldGFjaCgpO1xuICAgICAgICAgICAgdmFyIGRhcms6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYWxsRmlsdGVycywgKGksIHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh3aWRnZXQuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuYWRkVG9QYXJlbnQodGhpcy5maWx0ZXJUYWJsZUpRWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFwcGx5QmFja2dyb3VuZFN0eWxlKGRhcmspO1xuICAgICAgICAgICAgICAgICAgICBkYXJrID0gIWRhcms7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdpdmVuIGEgc2V0IG9mIG1lYXN1cmVtZW50IHJlY29yZHMgYW5kIGEgZGljdGlvbmFyeSBvZiBjb3JyZXNwb25kaW5nIHR5cGVzXG4gICAgICAgIC8vIChwYXNzZWQgZG93biBmcm9tIHRoZSBzZXJ2ZXIgYXMgYSByZXN1bHQgb2YgYSBkYXRhIHJlcXVlc3QpLCBzb3J0IHRoZW0gaW50b1xuICAgICAgICAvLyB0aGVpciB2YXJpb3VzIGNhdGVnb3JpZXMsIHRoZW4gcGFzcyBlYWNoIGNhdGVnb3J5IHRvIHRoZWlyIHJlbGV2YW50IGZpbHRlciBvYmplY3RzXG4gICAgICAgIC8vIChwb3NzaWJseSBhZGRpbmcgdG8gdGhlIHZhbHVlcyBpbiB0aGUgZmlsdGVyKSBhbmQgcmVmcmVzaCB0aGUgVUkgZm9yIGVhY2ggZmlsdGVyLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBwcm9jZXNzIGVhY2ggZ3JvdXAgc2VwYXJhdGVseSBoZXJlLlxuICAgICAgICBwcm9jZXNzSW5jb21pbmdNZWFzdXJlbWVudFJlY29yZHMobWVhc3VyZXMsIHR5cGVzKTogdm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBwcm9jZXNzOiAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKSA9PiB2b2lkO1xuXG4gICAgICAgICAgICB2YXIgZmlsdGVySWRzID0geyAnbSc6IFtdLCAncCc6IFtdLCAnZyc6IFtdLCAnXyc6IFtdIH07XG5cbiAgICAgICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgICQuZWFjaChtZWFzdXJlcyB8fCB7fSwgKGluZGV4LCBtZWFzdXJlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheSB8fCAhYXNzYXkuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbXR5cGUgPSB0eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJJZHMubS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLnAucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJJZHMuZy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLl8ucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHByb2Nlc3MgPSAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LnBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHMpO1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZVRhYmxlKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5tLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGZpbHRlcklkcy5tKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZmlsdGVySWRzLnAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLnApKTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMuZy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMuZykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5fLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMuXykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBCdWlsZCBhIGxpc3Qgb2YgYWxsIHRoZSBub24tZGlzYWJsZWQgQXNzYXkgSURzIGluIHRoZSBTdHVkeS5cbiAgICAgICAgYnVpbGRBc3NheUlEU2V0KCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBhc3NheUlkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQsIGFzc2F5KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgfHwgIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgYXNzYXlJZHMucHVzaChhc3NheUlkKTtcblxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYXNzYXlJZHM7XG4gICAgICAgIH1cbiAgICAgXG5cbiAgICAgICAgLy8gU3RhcnRpbmcgd2l0aCBhIGxpc3Qgb2YgYWxsIHRoZSBub24tZGlzYWJsZWQgQXNzYXkgSURzIGluIHRoZSBTdHVkeSwgd2UgbG9vcCBpdCB0aHJvdWdoIHRoZVxuICAgICAgICAvLyBMaW5lIGFuZCBBc3NheS1sZXZlbCBmaWx0ZXJzLCBjYXVzaW5nIHRoZSBmaWx0ZXJzIHRvIHJlZnJlc2ggdGhlaXIgVUksIG5hcnJvd2luZyB0aGUgc2V0IGRvd24uXG4gICAgICAgIC8vIFdlIHJlc29sdmUgdGhlIHJlc3VsdGluZyBzZXQgb2YgQXNzYXkgSURzIGludG8gbWVhc3VyZW1lbnQgSURzLCB0aGVuIHBhc3MgdGhlbSBvbiB0byB0aGVcbiAgICAgICAgLy8gbWVhc3VyZW1lbnQtbGV2ZWwgZmlsdGVycy4gIEluIHRoZSBlbmQgd2UgcmV0dXJuIGEgc2V0IG9mIG1lYXN1cmVtZW50IElEcyByZXByZXNlbnRpbmcgdGhlXG4gICAgICAgIC8vIGVuZCByZXN1bHQgb2YgYWxsIHRoZSBmaWx0ZXJzLCBzdWl0YWJsZSBmb3IgcGFzc2luZyB0byB0aGUgZ3JhcGhpbmcgZnVuY3Rpb25zLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBwcm9jZXNzIGVhY2ggZ3JvdXAgc2VwYXJhdGVseSBoZXJlLlxuICAgICAgICBidWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5SWRzID0gdGhpcy5idWlsZEFzc2F5SURTZXQoKTtcblxuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRBc3NheUlkcyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGZpbHRlcmVkQXNzYXlJZHMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudElkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChmaWx0ZXJlZEFzc2F5SWRzLCAoaSwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgICAgICQubWVyZ2UobWVhc3VyZW1lbnRJZHMsIGFzc2F5Lm1lYXN1cmVzIHx8IFtdKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBzdGFydCBvdXQgd2l0aCBmb3VyIHJlZmVyZW5jZXMgdG8gdGhlIGFycmF5IG9mIGF2YWlsYWJsZSBtZWFzdXJlbWVudCBJRHMsIG9uZSBmb3IgZWFjaCBtYWpvciBjYXRlZ29yeS5cbiAgICAgICAgICAgIC8vIEVhY2ggb2YgdGhlc2Ugd2lsbCBiZWNvbWUgaXRzIG93biBhcnJheSBpbiB0dXJuIGFzIHdlIG5hcnJvdyBpdCBkb3duLlxuICAgICAgICAgICAgLy8gVGhpcyBpcyB0byBwcmV2ZW50IGEgc3ViLXNlbGVjdGlvbiBpbiBvbmUgY2F0ZWdvcnkgZnJvbSBvdmVycmlkaW5nIGEgc3ViLXNlbGVjdGlvbiBpbiB0aGUgb3RoZXJzLlxuXG4gICAgICAgICAgICB2YXIgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIHByb3RlaW5NZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBnZW5lTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZXJpY01lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgd2Ugb25seSB0cnkgdG8gZmlsdGVyIGlmIHdlIGdvdCBtZWFzdXJlbWVudHMgdGhhdCBhcHBseSB0byB0aGUgd2lkZ2V0IHR5cGVzXG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKG1ldGFib2xpdGVNZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucHJvdGVpbkRhdGFQcm9jZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcm90ZWluRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcocHJvdGVpbk1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmdlbmVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lcmljTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT25jZSB3ZSd2ZSBmaW5pc2hlZCB3aXRoIHRoZSBmaWx0ZXJpbmcsIHdlIHdhbnQgdG8gc2VlIGlmIGFueSBzdWItc2VsZWN0aW9ucyBoYXZlIGJlZW4gbWFkZSBhY3Jvc3NcbiAgICAgICAgICAgIC8vIGFueSBvZiB0aGUgY2F0ZWdvcmllcywgYW5kIGlmIHNvLCBtZXJnZSB0aG9zZSBzdWItc2VsZWN0aW9ucyBpbnRvIG9uZS5cblxuICAgICAgICAgICAgLy8gVGhlIGlkZWEgaXMsIHdlIGRpc3BsYXkgZXZlcnl0aGluZyB1bnRpbCB0aGUgdXNlciBtYWtlcyBhIHNlbGVjdGlvbiBpbiBvbmUgb3IgbW9yZSBvZiB0aGUgbWFpbiBjYXRlZ29yaWVzLFxuICAgICAgICAgICAgLy8gdGhlbiBkcm9wIGV2ZXJ5dGhpbmcgZnJvbSB0aGUgY2F0ZWdvcmllcyB0aGF0IGNvbnRhaW4gbm8gc2VsZWN0aW9ucy5cblxuICAgICAgICAgICAgLy8gQW4gZXhhbXBsZSBzY2VuYXJpbyB3aWxsIGV4cGxhaW4gd2h5IHRoaXMgaXMgaW1wb3J0YW50OlxuXG4gICAgICAgICAgICAvLyBTYXkgYSB1c2VyIGlzIHByZXNlbnRlZCB3aXRoIHR3byBjYXRlZ29yaWVzLCBNZXRhYm9saXRlIGFuZCBNZWFzdXJlbWVudC5cbiAgICAgICAgICAgIC8vIE1ldGFib2xpdGUgaGFzIGNyaXRlcmlhICdBY2V0YXRlJyBhbmQgJ0V0aGFub2wnIGF2YWlsYWJsZS5cbiAgICAgICAgICAgIC8vIE1lYXN1cmVtZW50IGhhcyBvbmx5IG9uZSBjcml0ZXJpYSBhdmFpbGFibGUsICdPcHRpY2FsIERlbnNpdHknLlxuICAgICAgICAgICAgLy8gQnkgZGVmYXVsdCwgQWNldGF0ZSwgRXRoYW5vbCwgYW5kIE9wdGljYWwgRGVuc2l0eSBhcmUgYWxsIHVuY2hlY2tlZCwgYW5kIGFsbCB2aXNpYmxlIG9uIHRoZSBncmFwaC5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgZXF1aXZhbGVudCB0byAncmV0dXJuIG1lYXN1cmVtZW50cycgYmVsb3cuXG5cbiAgICAgICAgICAgIC8vIElmIHRoZSB1c2VyIGNoZWNrcyAnQWNldGF0ZScsIHRoZXkgZXhwZWN0IG9ubHkgQWNldGF0ZSB0byBiZSBkaXNwbGF5ZWQsIGV2ZW4gdGhvdWdoIG5vIGNoYW5nZSBoYXMgYmVlbiBtYWRlIHRvXG4gICAgICAgICAgICAvLyB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiB3aGVyZSBPcHRpY2FsIERlbnNpdHkgaXMgbGlzdGVkLlxuICAgICAgICAgICAgLy8gSW4gdGhlIGNvZGUgYmVsb3csIGJ5IHRlc3RpbmcgZm9yIGFueSBjaGVja2VkIGJveGVzIGluIHRoZSBtZXRhYm9saXRlRmlsdGVycyBmaWx0ZXJzLFxuICAgICAgICAgICAgLy8gd2UgcmVhbGl6ZSB0aGF0IHRoZSBzZWxlY3Rpb24gaGFzIGJlZW4gbmFycm93ZWQgZG9vd24sIHNvIHdlIGFwcGVuZCB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMgb250byBkU00uXG4gICAgICAgICAgICAvLyBUaGVuIHdoZW4gd2UgY2hlY2sgdGhlIG1lYXN1cmVtZW50RmlsdGVycyBmaWx0ZXJzLCB3ZSBzZWUgdGhhdCB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiBoYXNcbiAgICAgICAgICAgIC8vIG5vdCBuYXJyb3dlZCBkb3duIGl0cyBzZXQgb2YgbWVhc3VyZW1lbnRzLCBzbyB3ZSBza2lwIGFwcGVuZGluZyB0aG9zZSB0byBkU00uXG4gICAgICAgICAgICAvLyBUaGUgZW5kIHJlc3VsdCBpcyBvbmx5IHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cy5cblxuICAgICAgICAgICAgLy8gVGhlbiBzdXBwb3NlIHRoZSB1c2VyIGNoZWNrcyAnT3B0aWNhbCBEZW5zaXR5JywgaW50ZW5kaW5nIHRvIGNvbXBhcmUgQWNldGF0ZSBkaXJlY3RseSBhZ2FpbnN0IE9wdGljYWwgRGVuc2l0eS5cbiAgICAgICAgICAgIC8vIFNpbmNlIG1lYXN1cmVtZW50RmlsdGVycyBub3cgaGFzIGNoZWNrZWQgYm94ZXMsIHdlIHB1c2ggaXRzIG1lYXN1cmVtZW50cyBvbnRvIGRTTSxcbiAgICAgICAgICAgIC8vIHdoZXJlIGl0IGNvbWJpbmVzIHdpdGggdGhlIEFjZXRhdGUuXG5cbiAgICAgICAgICAgIHZhciBhbnlDaGVja2VkID0gKGZpbHRlcjogR2VuZXJpY0ZpbHRlclNlY3Rpb24pOiBib29sZWFuID0+IHsgcmV0dXJuIGZpbHRlci5hbnlDaGVja2JveGVzQ2hlY2tlZDsgfTtcblxuICAgICAgICAgICAgdmFyIGRTTTogYW55W10gPSBbXTsgICAgLy8gXCJEZWxpYmVyYXRlbHkgc2VsZWN0ZWQgbWVhc3VyZW1lbnRzXCJcbiAgICAgICAgICAgIGlmICggdGhpcy5tZXRhYm9saXRlRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQobWV0YWJvbGl0ZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgdGhpcy5wcm90ZWluRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQocHJvdGVpbk1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgICAgdGhpcy5nZW5lRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZXJpY01lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmIChkU00ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRTTTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG1lYXN1cmVtZW50SWRzO1xuICAgICAgICB9XG5cblxuICAgICAgICBjaGVja1JlZHJhd1JlcXVpcmVkKGZvcmNlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHJlZHJhdzogYm9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgLy8gZG8gbm90IHJlZHJhdyBpZiBncmFwaCBpcyBub3QgaW5pdGlhbGl6ZWQgeWV0XG4gICAgICAgICAgICBpZiAodGhpcy5tYWluR3JhcGhPYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZWRyYXcgPSAhIWZvcmNlO1xuICAgICAgICAgICAgICAgIC8vIFdhbGsgZG93biB0aGUgZmlsdGVyIHdpZGdldCBsaXN0LiAgSWYgd2UgZW5jb3VudGVyIG9uZSB3aG9zZSBjb2xsZWN0aXZlIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgLy8gc3RhdGUgaGFzIGNoYW5nZWQgc2luY2Ugd2UgbGFzdCBtYWRlIHRoaXMgd2FsaywgdGhlbiBhIHJlZHJhdyBpcyByZXF1aXJlZC4gTm90ZSB0aGF0XG4gICAgICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIG5vdCBza2lwIHRoaXMgbG9vcCwgZXZlbiBpZiB3ZSBhbHJlYWR5IGtub3cgYSByZWRyYXcgaXMgcmVxdWlyZWQsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgIC8vIGNhbGwgdG8gYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IHNldHMgaW50ZXJuYWwgc3RhdGUgaW4gdGhlIGZpbHRlclxuICAgICAgICAgICAgICAgIC8vIHdpZGdldHMgdGhhdCB3ZSB3aWxsIHVzZSBuZXh0IHRpbWUgYXJvdW5kLlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpbHRlci5hbnlDaGVja2JveGVzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVkcmF3ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlZHJhdztcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyBBIGdlbmVyaWMgdmVyc2lvbiBvZiBhIGZpbHRlcmluZyBjb2x1bW4gaW4gdGhlIGZpbHRlcmluZyBzZWN0aW9uIGJlbmVhdGggdGhlIGdyYXBoIGFyZWEgb24gdGhlIHBhZ2UsXG4gICAgLy8gbWVhbnQgdG8gYmUgc3ViY2xhc3NlZCBmb3Igc3BlY2lmaWMgY3JpdGVyaWEuXG4gICAgLy8gV2hlbiBpbml0aWFsaXplZCB3aXRoIGEgc2V0IG9mIHJlY29yZCBJRHMsIHRoZSBjb2x1bW4gaXMgZmlsbGVkIHdpdGggbGFiZWxlZCBjaGVja2JveGVzLCBvbmUgZm9yIGVhY2hcbiAgICAvLyB1bmlxdWUgdmFsdWUgb2YgdGhlIGdpdmVuIGNyaXRlcmlhIGVuY291bnRlcmVkIGluIHRoZSByZWNvcmRzLlxuICAgIC8vIER1cmluZyB1c2UsIGFub3RoZXIgc2V0IG9mIHJlY29yZCBJRHMgaXMgcGFzc2VkIGluLCBhbmQgaWYgYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQsIHRoZSBJRCBzZXQgaXNcbiAgICAvLyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgIC8vIENoZWNrYm94ZXMgd2hvc2UgdmFsdWVzIGFyZSBub3QgcmVwcmVzZW50ZWQgYW55d2hlcmUgaW4gdGhlIGdpdmVuIElEcyBhcmUgdGVtcG9yYXJpbHkgZGlzYWJsZWQsXG4gICAgLy8gdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdCBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLiBcbiAgICAvLyBUaGUgZmlsdGVycyBhcmUgbWVhbnQgdG8gYmUgY2FsbGVkIGluIHNlcXVlbmNlLCBmZWVkaW5nIGVhY2ggcmV0dXJuZWQgSUQgc2V0IGludG8gdGhlIG5leHQsXG4gICAgLy8gcHJvZ3Jlc3NpdmVseSBuYXJyb3dpbmcgZG93biB0aGUgZW5hYmxlZCBjaGVja2JveGVzLlxuICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIHN1YmNsYXNzIHRoaXMgZm9yIGVhY2ggZ3JvdXAgdHlwZS5cbiAgICBleHBvcnQgY2xhc3MgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIC8vIEEgZGljdGlvbmFyeSBvZiB0aGUgdW5pcXVlIHZhbHVlcyBmb3VuZCBmb3IgZmlsdGVyaW5nIGFnYWluc3QsIGFuZCB0aGUgZGljdGlvbmFyeSdzIGNvbXBsZW1lbnQuXG4gICAgICAgIC8vIEVhY2ggdW5pcXVlIElEIGlzIGFuIGludGVnZXIsIGFzY2VuZGluZyBmcm9tIDEsIGluIHRoZSBvcmRlciB0aGUgdmFsdWUgd2FzIGZpcnN0IGVuY291bnRlcmVkXG4gICAgICAgIC8vIHdoZW4gZXhhbWluaW5nIHRoZSByZWNvcmQgZGF0YSBpbiB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaC5cbiAgICAgICAgdW5pcXVlVmFsdWVzOiBVbmlxdWVJRFRvVmFsdWU7XG4gICAgICAgIHVuaXF1ZUluZGV4ZXM6IFZhbHVlVG9VbmlxdWVJRDtcbiAgICAgICAgdW5pcXVlSW5kZXhDb3VudGVyOiBudW1iZXI7XG5cbiAgICAgICAgLy8gVGhlIHNvcnRlZCBvcmRlciBvZiB0aGUgbGlzdCBvZiB1bmlxdWUgdmFsdWVzIGZvdW5kIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgdW5pcXVlVmFsdWVzT3JkZXI6IG51bWJlcltdO1xuXG4gICAgICAgIC8vIEEgZGljdGlvbmFyeSByZXNvbHZpbmcgYSByZWNvcmQgSUQgKGFzc2F5IElELCBtZWFzdXJlbWVudCBJRCkgdG8gYW4gYXJyYXkuIEVhY2ggYXJyYXlcbiAgICAgICAgLy8gY29udGFpbnMgdGhlIGludGVnZXIgaWRlbnRpZmllcnMgb2YgdGhlIHVuaXF1ZSB2YWx1ZXMgdGhhdCBhcHBseSB0byB0aGF0IHJlY29yZC5cbiAgICAgICAgLy8gKEl0J3MgcmFyZSwgYnV0IHRoZXJlIGNhbiBhY3R1YWxseSBiZSBtb3JlIHRoYW4gb25lIGNyaXRlcmlhIHRoYXQgbWF0Y2hlcyBhIGdpdmVuIElELFxuICAgICAgICAvLyAgZm9yIGV4YW1wbGUgYSBMaW5lIHdpdGggdHdvIGZlZWRzIGFzc2lnbmVkIHRvIGl0LilcbiAgICAgICAgZmlsdGVySGFzaDogVmFsdWVUb1VuaXF1ZUxpc3Q7XG4gICAgICAgIC8vIERpY3Rpb25hcnkgcmVzb2x2aW5nIHRoZSBmaWx0ZXIgdmFsdWUgaW50ZWdlciBpZGVudGlmaWVycyB0byBIVE1MIElucHV0IGNoZWNrYm94ZXMuXG4gICAgICAgIGNoZWNrYm94ZXM6IHtbaW5kZXg6IG51bWJlcl06IEpRdWVyeX07XG4gICAgICAgIC8vIERpY3Rpb25hcnkgdXNlZCB0byBjb21wYXJlIGNoZWNrYm94ZXMgd2l0aCBhIHByZXZpb3VzIHN0YXRlIHRvIGRldGVybWluZSB3aGV0aGVyIGFuXG4gICAgICAgIC8vIHVwZGF0ZSBpcyByZXF1aXJlZC4gVmFsdWVzIGFyZSAnQycgZm9yIGNoZWNrZWQsICdVJyBmb3IgdW5jaGVja2VkLCBhbmQgJ04nIGZvciBub3RcbiAgICAgICAgLy8gZXhpc3RpbmcgYXQgdGhlIHRpbWUuICgnTicgY2FuIGJlIHVzZWZ1bCB3aGVuIGNoZWNrYm94ZXMgYXJlIHJlbW92ZWQgZnJvbSBhIGZpbHRlciBkdWUgdG9cbiAgICAgICAgLy8gdGhlIGJhY2stZW5kIGRhdGEgY2hhbmdpbmcuKVxuICAgICAgICBwcmV2aW91c0NoZWNrYm94U3RhdGU6IFVuaXF1ZUlEVG9WYWx1ZTtcbiAgICAgICAgLy8gRGljdGlvbmFyeSByZXNvbHZpbmcgdGhlIGZpbHRlciB2YWx1ZSBpbnRlZ2VyIGlkZW50aWZpZXJzIHRvIEhUTUwgdGFibGUgcm93IGVsZW1lbnRzLlxuICAgICAgICB0YWJsZVJvd3M6IHtbaW5kZXg6IG51bWJlcl06IEhUTUxUYWJsZVJvd0VsZW1lbnR9O1xuXG4gICAgICAgIC8vIFJlZmVyZW5jZXMgdG8gSFRNTCBlbGVtZW50cyBjcmVhdGVkIGJ5IHRoZSBmaWx0ZXJcbiAgICAgICAgZmlsdGVyQ29sdW1uRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgcGxhaW50ZXh0VGl0bGVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBzZWFyY2hCb3g6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIHNlYXJjaEJveFRpdGxlRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2Nyb2xsWm9uZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIGZpbHRlcmluZ1RhYmxlOiBKUXVlcnk7XG4gICAgICAgIHRhYmxlQm9keUVsZW1lbnQ6IEhUTUxUYWJsZUVsZW1lbnQ7XG5cbiAgICAgICAgLy8gU2VhcmNoIGJveCByZWxhdGVkXG4gICAgICAgIHR5cGluZ1RpbWVvdXQ6IG51bWJlcjtcbiAgICAgICAgdHlwaW5nRGVsYXk6IG51bWJlcjtcbiAgICAgICAgY3VycmVudFNlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBwcmV2aW91c1NlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBtaW5DaGFyc1RvVHJpZ2dlclNlYXJjaDogbnVtYmVyO1xuXG4gICAgICAgIGFueUNoZWNrYm94ZXNDaGVja2VkOiBib29sZWFuO1xuXG4gICAgICAgIHNlY3Rpb25UaXRsZTogc3RyaW5nO1xuICAgICAgICBzZWN0aW9uU2hvcnRMYWJlbDogc3RyaW5nO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleENvdW50ZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IFtdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy50eXBpbmdEZWxheSA9IDMzMDsgICAgLy8gVE9ETzogTm90IGltcGxlbWVudGVkXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2ggPSAxO1xuXG4gICAgICAgICAgICB0aGlzLmNvbmZpZ3VyZSgpO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVDb250YWluZXJPYmplY3RzKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0dlbmVyaWMgRmlsdGVyJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnZ2YnO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDcmVhdGUgYWxsIHRoZSBjb250YWluZXIgSFRNTCBvYmplY3RzXG4gICAgICAgIGNyZWF0ZUNvbnRhaW5lck9iamVjdHMoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgc0JveElEOiBzdHJpbmcgPSAnZmlsdGVyJyArIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgKyAnU2VhcmNoQm94JyxcbiAgICAgICAgICAgICAgICBzQm94OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJDb2x1bW5EaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNvbHVtbicpWzBdO1xuICAgICAgICAgICAgdmFyIHRleHRUaXRsZSA9ICQoXCI8c3Bhbj5cIikudGV4dCh0aGlzLnNlY3Rpb25UaXRsZSlbMF07XG4gICAgICAgICAgICB0aGlzLnBsYWludGV4dFRpdGxlRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJIZWFkJykuYXBwZW5kKHRleHRUaXRsZSlbMF07XG5cbiAgICAgICAgICAgICQoc0JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSlcbiAgICAgICAgICAgICAgICAuYXR0cih7XG4gICAgICAgICAgICAgICAgICAgICdpZCc6IHNCb3hJRCxcbiAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiBzQm94SUQsXG4gICAgICAgICAgICAgICAgICAgICdwbGFjZWhvbGRlcic6IHRoaXMuc2VjdGlvblRpdGxlLFxuICAgICAgICAgICAgICAgICAgICAnc2l6ZSc6IDE0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzQm94LnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0Jyk7IC8vIEpRdWVyeSAuYXR0cigpIGNhbm5vdCBzZXQgdGhpc1xuICAgICAgICAgICAgdGhpcy5zZWFyY2hCb3ggPSBzQm94O1xuICAgICAgICAgICAgdGhpcy5zZWFyY2hCb3hUaXRsZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVySGVhZFNlYXJjaCcpLmFwcGVuZChzQm94KVswXTtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxab25lRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJDcml0ZXJpYVNjcm9sbFpvbmUnKVswXTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyaW5nVGFibGUgPSAkKFwiPHRhYmxlPlwiKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFUYWJsZSBkcmFnYm94ZXMnKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2NlbGxwYWRkaW5nJzogMCwgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmQodGhpcy50YWJsZUJvZHlFbGVtZW50ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JChcIjx0Ym9keT5cIilbMF0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBwb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHVzZWRWYWx1ZXM6IFZhbHVlVG9VbmlxdWVJRCwgY3JTZXQ6IG51bWJlcltdLCBjSGFzaDogVW5pcXVlSURUb1ZhbHVlLFxuICAgICAgICAgICAgICAgIHByZXZpb3VzSWRzOiBzdHJpbmdbXTtcbiAgICAgICAgICAgIC8vIGNhbiBnZXQgSURzIGZyb20gbXVsdGlwbGUgYXNzYXlzLCBmaXJzdCBtZXJnZSB3aXRoIHRoaXMuZmlsdGVySGFzaFxuICAgICAgICAgICAgcHJldmlvdXNJZHMgPSAkLm1hcCh0aGlzLmZpbHRlckhhc2ggfHwge30sIChfLCBwcmV2aW91c0lkOiBzdHJpbmcpID0+IHByZXZpb3VzSWQpO1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFkZGVkSWQ6IHN0cmluZyk6IHZvaWQgPT4geyB0aGlzLmZpbHRlckhhc2hbYWRkZWRJZF0gPSBbXTsgfSk7XG4gICAgICAgICAgICBpZHMgPSAkLm1hcCh0aGlzLmZpbHRlckhhc2ggfHwge30sIChfLCBwcmV2aW91c0lkOiBzdHJpbmcpID0+IHByZXZpb3VzSWQpO1xuICAgICAgICAgICAgLy8gc2tpcCBvdmVyIGJ1aWxkaW5nIHVuaXF1ZSB2YWx1ZXMgYW5kIHNvcnRpbmcgd2hlbiBubyBuZXcgSURzIGFkZGVkXG4gICAgICAgICAgICBpZiAoaWRzLmxlbmd0aCA+IHByZXZpb3VzSWRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzKTtcbiAgICAgICAgICAgICAgICBjclNldCA9IFtdO1xuICAgICAgICAgICAgICAgIGNIYXNoID0ge307XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGEgcmV2ZXJzZWQgaGFzaCBzbyBrZXlzIG1hcCB2YWx1ZXMgYW5kIHZhbHVlcyBtYXAga2V5c1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnVuaXF1ZUluZGV4ZXMsICh2YWx1ZTogc3RyaW5nLCB1bmlxdWVJRDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNIYXNoW3VuaXF1ZUlEXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBjclNldC5wdXNoKHVuaXF1ZUlEKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBBbHBoYWJldGljYWxseSBzb3J0IGFuIGFycmF5IG9mIHRoZSBrZXlzIGFjY29yZGluZyB0byB2YWx1ZXNcbiAgICAgICAgICAgICAgICBjclNldC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfYTpzdHJpbmcgPSBjSGFzaFthXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgX2I6c3RyaW5nID0gY0hhc2hbYl0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIF9hIDwgX2IgPyAtMSA6IF9hID4gX2IgPyAxIDogMDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlcyA9IGNIYXNoO1xuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIgPSBjclNldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSW4gdGhpcyBmdW5jdGlvbiBhcmUgcnVubmluZyB0aHJvdWdoIHRoZSBnaXZlbiBsaXN0IG9mIG1lYXN1cmVtZW50IElEcyBhbmQgZXhhbWluaW5nXG4gICAgICAgIC8vIHRoZWlyIHJlY29yZHMgYW5kIHJlbGF0ZWQgcmVjb3JkcywgbG9jYXRpbmcgdGhlIHBhcnRpY3VsYXIgZmllbGQgd2UgYXJlIGludGVyZXN0ZWQgaW4sXG4gICAgICAgIC8vIGFuZCBjcmVhdGluZyBhIGxpc3Qgb2YgYWxsIHRoZSB1bmlxdWUgdmFsdWVzIGZvciB0aGF0IGZpZWxkLiAgQXMgd2UgZ28sIHdlIG1hcmsgZWFjaFxuICAgICAgICAvLyB1bmlxdWUgdmFsdWUgd2l0aCBhbiBpbnRlZ2VyIFVJRCwgYW5kIGNvbnN0cnVjdCBhIGhhc2ggcmVzb2x2aW5nIGVhY2ggcmVjb3JkIHRvIG9uZSAob3JcbiAgICAgICAgLy8gcG9zc2libHkgbW9yZSkgb2YgdGhvc2UgaW50ZWdlciBVSURzLiAgVGhpcyBwcmVwYXJlcyB1cyBmb3IgcXVpY2sgZmlsdGVyaW5nIGxhdGVyIG9uLlxuICAgICAgICAvLyAoVGhpcyBnZW5lcmljIGZpbHRlciBkb2VzIG5vdGhpbmcsIHNvIHdlIGxlYXZlIHRoZXNlIHN0cnVjdHVyZXMgYmxhbmsuKVxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIElmIHdlIGRpZG4ndCBjb21lIHVwIHdpdGggMiBvciBtb3JlIGNyaXRlcmlhLCB0aGVyZSBpcyBubyBwb2ludCBpbiBkaXNwbGF5aW5nIHRoZSBmaWx0ZXIuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICBpZiAodGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGFkZFRvUGFyZW50KHBhcmVudERpdik6dm9pZCB7XG4gICAgICAgICAgICBwYXJlbnREaXYuYXBwZW5kQ2hpbGQodGhpcy5maWx0ZXJDb2x1bW5EaXYpO1xuICAgICAgICB9XG5cblxuICAgICAgICBhcHBseUJhY2tncm91bmRTdHlsZShkYXJrZXI6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgICAgICAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KS5yZW1vdmVDbGFzcyhkYXJrZXIgPyAnc3RyaXBlUm93QicgOiAnc3RyaXBlUm93QScpO1xuICAgICAgICAgICAgJCh0aGlzLmZpbHRlckNvbHVtbkRpdikuYWRkQ2xhc3MoZGFya2VyID8gJ3N0cmlwZVJvd0EnIDogJ3N0cmlwZVJvd0InKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUnVucyB0aHJvdWdoIHRoZSB2YWx1ZXMgaW4gdW5pcXVlVmFsdWVzT3JkZXIsIGFkZGluZyBhIGNoZWNrYm94IGFuZCBsYWJlbCBmb3IgZWFjaFxuICAgICAgICAvLyBmaWx0ZXJpbmcgdmFsdWUgcmVwcmVzZW50ZWQuICBJZiB0aGVyZSBhcmUgbW9yZSB0aGFuIDE1IHZhbHVlcywgdGhlIGZpbHRlciBnZXRzXG4gICAgICAgIC8vIGEgc2VhcmNoIGJveCBhbmQgc2Nyb2xsYmFyLlxuICAgICAgICBwb3B1bGF0ZVRhYmxlKCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgZkNvbCA9ICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmVtcHR5KCk7XG4gICAgICAgICAgICAvLyBPbmx5IHVzZSB0aGUgc2Nyb2xsaW5nIGNvbnRhaW5lciBkaXYgaWYgdGhlIHNpemUgb2YgdGhlIGxpc3Qgd2FycmFudHMgaXQsIGJlY2F1c2VcbiAgICAgICAgICAgIC8vIHRoZSBzY3JvbGxpbmcgY29udGFpbmVyIGRpdiBkZWNsYXJlcyBhIGxhcmdlIHBhZGRpbmcgbWFyZ2luIGZvciB0aGUgc2Nyb2xsIGJhcixcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHBhZGRpbmcgbWFyZ2luIHdvdWxkIGJlIGFuIGVtcHR5IHdhc3RlIG9mIHNwYWNlIG90aGVyd2lzZS5cbiAgICAgICAgICAgIGlmICh0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDE1KSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5zZWFyY2hCb3hUaXRsZURpdikuYXBwZW5kKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICAgICAgLy8gQ2hhbmdlIHRoZSByZWZlcmVuY2Ugc28gd2UncmUgYWZmZWN0aW5nIHRoZSBpbm5lckhUTUwgb2YgdGhlIGNvcnJlY3QgZGl2IGxhdGVyIG9uXG4gICAgICAgICAgICAgICAgZkNvbCA9ICQodGhpcy5zY3JvbGxab25lRGl2KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5wbGFpbnRleHRUaXRsZURpdik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLmZpbHRlcmluZ1RhYmxlKTtcblxuICAgICAgICAgICAgdmFyIHRCb2R5ID0gdGhpcy50YWJsZUJvZHlFbGVtZW50O1xuICAgICAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgdGFibGUgY29udGVudHNcbiAgICAgICAgICAgICQodGhpcy50YWJsZUJvZHlFbGVtZW50KS5lbXB0eSgpO1xuXG4gICAgICAgICAgICB0aGlzLnRhYmxlUm93cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzID0ge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmZvckVhY2goKHVuaXF1ZUlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2JveE5hbWUsIGNlbGwsIHAsIHEsIHI7XG4gICAgICAgICAgICAgICAgY2JveE5hbWUgPSBbJ2ZpbHRlcicsIHRoaXMuc2VjdGlvblNob3J0TGFiZWwsICduJywgdW5pcXVlSWQsICdjYm94J10uam9pbignJyk7XG4gICAgICAgICAgICAgICAgdGhpcy50YWJsZVJvd3NbdW5pcXVlSWRdID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+dGhpcy50YWJsZUJvZHlFbGVtZW50Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgIGNlbGwgPSB0aGlzLnRhYmxlUm93c1t1bmlxdWVJZF0uaW5zZXJ0Q2VsbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlc1t1bmlxdWVJZF0gPSAkKFwiPGlucHV0IHR5cGU9J2NoZWNrYm94Jz5cIilcbiAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnbmFtZSc6IGNib3hOYW1lLCAnaWQnOiBjYm94TmFtZSB9KVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsIGNib3hOYW1lKS50ZXh0KHRoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXSlcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBUT0RPOiBEcmFnIHNlbGVjdCBpcyB0d2l0Y2h5IC0gY2xpY2tpbmcgYSB0YWJsZSBjZWxsIGJhY2tncm91bmQgc2hvdWxkIGNoZWNrIHRoZSBib3gsXG4gICAgICAgICAgICAvLyBldmVuIGlmIHRoZSB1c2VyIGlzbid0IGhpdHRpbmcgdGhlIGxhYmVsIG9yIHRoZSBjaGVja2JveCBpdHNlbGYuXG4gICAgICAgICAgICBEcmFnYm94ZXMuaW5pdFRhYmxlKHRoaXMuZmlsdGVyaW5nVGFibGUpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIHRydWUgaWYgYW55IG9mIHRoZSBjaGVja2JveGVzIHNob3cgYSBkaWZmZXJlbnQgc3RhdGUgdGhhbiB3aGVuIHRoaXMgZnVuY3Rpb24gd2FzXG4gICAgICAgIC8vIGxhc3QgY2FsbGVkXG4gICAgICAgIGFueUNoZWNrYm94ZXNDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIGNoYW5nZWQ6Ym9vbGVhbiA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGN1cnJlbnRDaGVja2JveFN0YXRlOiBVbmlxdWVJRFRvVmFsdWUgPSB7fSxcbiAgICAgICAgICAgICAgICB2OiBzdHJpbmcgPSAkKHRoaXMuc2VhcmNoQm94KS52YWwoKTtcbiAgICAgICAgICAgIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmNoZWNrYm94ZXMgfHwge30sICh1bmlxdWVJZDogbnVtYmVyLCBjaGVja2JveDogSlF1ZXJ5KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQsIHByZXZpb3VzO1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSAoY2hlY2tib3gucHJvcCgnY2hlY2tlZCcpICYmICFjaGVja2JveC5wcm9wKCdkaXNhYmxlZCcpKSA/ICdDJyA6ICdVJztcbiAgICAgICAgICAgICAgICBwcmV2aW91cyA9IHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlW3VuaXF1ZUlkXSB8fCAnTic7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQgIT09IHByZXZpb3VzKSBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gJ0MnKSB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2hlY2tib3hTdGF0ZVt1bmlxdWVJZF0gPSBjdXJyZW50O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHYgPSB2LnRyaW0oKTsgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgICAgIHYgPSB2LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB2ID0gdi5yZXBsYWNlKC9cXHNcXHMqLywgJyAnKTsgLy8gUmVwbGFjZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIHdpdGggc2luZ2xlIHNwYWNlc1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uID0gdjtcbiAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzLnByZXZpb3VzU2VhcmNoU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmICghY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmVuJ3QgZGV0ZWN0ZWQgYW55IGNoYW5nZSBzbyBmYXIsIHRoZXJlIGlzIG9uZSBtb3JlIGFuZ2xlIHRvIGNvdmVyOlxuICAgICAgICAgICAgICAgIC8vIENoZWNrYm94ZXMgdGhhdCB1c2VkIHRvIGV4aXN0LCBidXQgaGF2ZSBzaW5jZSBiZWVuIHJlbW92ZWQgZnJvbSB0aGUgc2V0LlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSwgKHJvd0lkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Q2hlY2tib3hTdGF0ZVtyb3dJZF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0gY3VycmVudENoZWNrYm94U3RhdGU7XG4gICAgICAgICAgICByZXR1cm4gY2hhbmdlZDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGFrZXMgYSBzZXQgb2YgcmVjb3JkIElEcywgYW5kIGlmIGFueSBjaGVja2JveGVzIGluIHRoZSBmaWx0ZXIncyBVSSBhcmUgY2hlY2tlZCxcbiAgICAgICAgLy8gdGhlIElEIHNldCBpcyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgICAgICAvLyBDaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBnaXZlbiBJRHMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkXG4gICAgICAgIC8vIGFuZCBzb3J0ZWQgdG8gdGhlIGJvdHRvbSBvZiB0aGUgbGlzdCwgdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdFxuICAgICAgICAvLyBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLlxuICAgICAgICAvLyBUaGUgbmFycm93ZWQgc2V0IG9mIElEcyBpcyB0aGVuIHJldHVybmVkLCBmb3IgdXNlIGJ5IHRoZSBuZXh0IGZpbHRlci5cbiAgICAgICAgYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhpZHM6YW55W10pOmFueSB7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSBmaWx0ZXIgb25seSBjb250YWlucyBvbmUgaXRlbSwgaXQncyBwb2ludGxlc3MgdG8gYXBwbHkgaXQuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpZHM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBpZHNQb3N0RmlsdGVyaW5nOiBhbnlbXTtcblxuICAgICAgICAgICAgdmFyIHVzZVNlYXJjaEJveDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICB2YXIgcXVlcnlTdHJzID0gW107XG5cbiAgICAgICAgICAgIHZhciB2ID0gdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uO1xuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICh2Lmxlbmd0aCA+PSB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSB3b3Jkcywgd2UgbWF0Y2ggZWFjaCBzZXBhcmF0ZWx5LlxuICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIG5vdCBhdHRlbXB0IHRvIG1hdGNoIGFnYWluc3QgZW1wdHkgc3RyaW5ncywgc28gd2UgZmlsdGVyIHRob3NlIG91dCBpZlxuICAgICAgICAgICAgICAgICAgICAvLyBhbnkgc2xpcHBlZCB0aHJvdWdoLlxuICAgICAgICAgICAgICAgICAgICBxdWVyeVN0cnMgPSB2LnNwbGl0KC9cXHMrLykuZmlsdGVyKChvbmUpID0+IHsgcmV0dXJuIG9uZS5sZW5ndGggPiAwOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHVzZXIgbWlnaHQgaGF2ZSBwYXN0ZWQvdHlwZWQgb25seSB3aGl0ZXNwYWNlLCBzbzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1ZXJ5U3Rycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1c2VTZWFyY2hCb3ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZyA9IHt9O1xuXG4gICAgICAgICAgICB2YXIgaW5kZXhJc1Zpc2libGUgPSAoaW5kZXgpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtYXRjaDpib29sZWFuID0gdHJ1ZSwgdGV4dDpzdHJpbmc7XG4gICAgICAgICAgICAgICAgaWYgKHVzZVNlYXJjaEJveCkge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gdGhpcy51bmlxdWVWYWx1ZXNbaW5kZXhdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoID0gcXVlcnlTdHJzLnNvbWUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0ZXh0Lmxlbmd0aCA+PSB2Lmxlbmd0aCAmJiB0ZXh0LmluZGV4T2YodikgPj0gMDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2luZGV4XSA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbaW5kZXhdID09PSAnQycpIHx8ICF0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZHNQb3N0RmlsdGVyaW5nID0gaWRzLmZpbHRlcigoaWQpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGZpbHRlcmluZyBkYXRhIGZvciB0aGlzIGlkLCB1c2UgaXQuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgZG9uJ3QsIHRoZSBpZCBwcm9iYWJseSBiZWxvbmdzIHRvIHNvbWUgb3RoZXIgbWVhc3VyZW1lbnQgY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgLy8gc28gd2UgaWdub3JlIGl0LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpbHRlckhhc2hbaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbHRlckhhc2hbaWRdLnNvbWUoaW5kZXhJc1Zpc2libGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgZG9jdW1lbnQgZnJhZ21lbnQsIGFuZCBhY2N1bXVsYXRlIGluc2lkZSBpdCBhbGwgdGhlIHJvd3Mgd2Ugd2FudCB0byBkaXNwbGF5LCBpbiBzb3J0ZWQgb3JkZXIuXG4gICAgICAgICAgICB2YXIgZnJhZyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblxuICAgICAgICAgICAgdmFyIHJvd3NUb0FwcGVuZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKChjcklEKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94OiBKUXVlcnkgPSB0aGlzLmNoZWNrYm94ZXNbY3JJRF0sXG4gICAgICAgICAgICAgICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCA9IHRoaXMudGFibGVSb3dzW2NySURdLFxuICAgICAgICAgICAgICAgICAgICBzaG93OiBib29sZWFuID0gISF2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2NySURdO1xuICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJywgIXNob3cpXG4gICAgICAgICAgICAgICAgJChyb3cpLnRvZ2dsZUNsYXNzKCdub2RhdGEnLCAhc2hvdyk7XG4gICAgICAgICAgICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgICAgICAgICAgICAgZnJhZy5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBOb3csIGFwcGVuZCBhbGwgdGhlIHJvd3Mgd2UgZGlzYWJsZWQsIHNvIHRoZXkgZ28gdG8gdGhlIGJvdHRvbSBvZiB0aGUgdGFibGVcbiAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5mb3JFYWNoKChyb3cpID0+IGZyYWcuYXBwZW5kQ2hpbGQocm93KSk7XG5cbiAgICAgICAgICAgIC8vIFJlbWVtYmVyIHRoYXQgd2UgbGFzdCBzb3J0ZWQgYnkgdGhpcyBjb2x1bW5cbiAgICAgICAgICAgIHRoaXMudGFibGVCb2R5RWxlbWVudC5hcHBlbmRDaGlsZChmcmFnKTtcblxuICAgICAgICAgICAgcmV0dXJuIGlkc1Bvc3RGaWx0ZXJpbmc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIF9hc3NheUlkVG9Bc3NheShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9MaW5lKGFzc2F5SWQ6c3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKTtcbiAgICAgICAgICAgIGlmIChhc3NheSkgcmV0dXJuIEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgX2Fzc2F5SWRUb1Byb3RvY29sKGFzc2F5SWQ6c3RyaW5nKTogUHJvdG9jb2xSZWNvcmQge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldElkTWFwVG9WYWx1ZXMoKTooaWQ6c3RyaW5nKSA9PiBhbnlbXSB7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4gW107XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIFN0cmFpbkZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnU3RyYWluJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnc3QnO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBzdHJhaW4gbmFtZVxuICAgICAgICAgICAgICAgIChsaW5lLnN0cmFpbiB8fCBbXSkuZm9yRWFjaCgoc3RyYWluSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3RyYWluID0gRURERGF0YS5TdHJhaW5zW3N0cmFpbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0cmFpbiAmJiBzdHJhaW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdDYXJib24gU291cmNlJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnY3MnO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIGNhcmJvbiBzb3VyY2UgbmFtZVxuICAgICAgICAgICAgICAgIChsaW5lLmNhcmJvbiB8fCBbXSkuZm9yRWFjaCgoY2FyYm9uSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcmMgPSBFREREYXRhLkNTb3VyY2VzW2NhcmJvbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNyYyAmJiBzcmMubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0xhYmVsaW5nJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnbCc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBsYWJlbGluZyBkZXNjcmlwdGlvblxuICAgICAgICAgICAgICAgIChsaW5lLmNhcmJvbiB8fCBbXSkuZm9yRWFjaCgoY2FyYm9uSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcmMgPSBFREREYXRhLkNTb3VyY2VzW2NhcmJvbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNyYyAmJiBzcmMubGFiZWxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIExpbmVOYW1lRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdMaW5lJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnbG4nO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBQcm90b2NvbEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnUHJvdG9jb2wnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdwJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHByb3RvY29sOiBQcm90b2NvbFJlY29yZCA9IHRoaXMuX2Fzc2F5SWRUb1Byb3RvY29sKGFzc2F5SWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gJ0Fzc2F5IFN1ZmZpeCc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ2EnO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICBtZXRhRGF0YUlEOnN0cmluZztcbiAgICAgICAgcHJlOnN0cmluZztcbiAgICAgICAgcG9zdDpzdHJpbmc7XG5cbiAgICAgICAgY29uc3RydWN0b3IobWV0YURhdGFJRDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciBNRFQgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbbWV0YURhdGFJRF07XG4gICAgICAgICAgICB0aGlzLm1ldGFEYXRhSUQgPSBtZXRhRGF0YUlEO1xuICAgICAgICAgICAgdGhpcy5wcmUgPSBNRFQucHJlIHx8ICcnO1xuICAgICAgICAgICAgdGhpcy5wb3N0ID0gTURULnBvc3QgfHwgJyc7XG4gICAgICAgICAgICBzdXBlcigpO1xuICAgICAgICB9XG5cblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW3RoaXMubWV0YURhdGFJRF0ubmFtZTtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnbWQnK3RoaXMubWV0YURhdGFJRDtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge30sIHZhbHVlID0gJyhFbXB0eSknO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5tZXRhICYmIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgbGluZS5tZXRhW3RoaXMubWV0YURhdGFJRF0sIHRoaXMucG9zdCBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgQXNzYXlNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheTogYW55ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCkgfHwge30sIHZhbHVlID0gJyhFbXB0eSknO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXkubWV0YSAmJiBhc3NheS5tZXRhW3RoaXMubWV0YURhdGFJRF0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBbIHRoaXMucHJlLCBhc3NheS5tZXRhW3RoaXMubWV0YURhdGFJRF0sIHRoaXMucG9zdCBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnQ29tcGFydG1lbnQnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdjb20nO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCB2YWx1ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZUNvbXBhcnRtZW50c1ttZWFzdXJlLmNvbXBhcnRtZW50XSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgdmFsdWUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6IGJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnTWVhc3VyZW1lbnQnO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9ICdtbSc7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2gobUlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIG1JZHMuZm9yRWFjaCgobWVhc3VyZUlkOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHZhciBtVHlwZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1UeXBlID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChtVHlwZSAmJiBtVHlwZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzpib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnTWV0YWJvbGl0ZSc7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ21lJztcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZTogSWYgdGhlIGZpbHRlciBoYXMgYSBsb2FkIHBlbmRpbmcsIGl0J3MgXCJ1c2VmdWxcIiwgaS5lLiBkaXNwbGF5IGl0LlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgbWV0YWJvbGl0ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGUgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobWV0YWJvbGl0ZSAmJiBtZXRhYm9saXRlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgUHJvdGVpbkZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzpib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSAnUHJvdGVpbic7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gJ3ByJztcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZTogSWYgdGhlIGZpbHRlciBoYXMgYSBsb2FkIHBlbmRpbmcsIGl0J3MgXCJ1c2VmdWxcIiwgaS5lLiBkaXNwbGF5IGl0LlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBwcm90ZWluOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdGVpbiA9IEVERERhdGEuUHJvdGVpblR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm90ZWluICYmIHByb3RlaW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBHZW5lRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOmJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9ICdHZW5lJztcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSAnZ24nO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIGdlbmU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBnZW5lID0gRURERGF0YS5HZW5lVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdlbmUgJiYgZ2VuZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHBhZ2UgbG9hZHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVJdCgpIHtcblxuICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCA9IG5ldyBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCh0aGlzKTtcblxuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhID0gbnVsbDtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2ggPSBmYWxzZTtcblxuICAgICAgICB0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEID0gbnVsbDtcblxuICAgICAgICB0aGlzLmF0dGFjaG1lbnRJRHMgPSBudWxsO1xuICAgICAgICB0aGlzLmF0dGFjaG1lbnRzQnlJRCA9IG51bGw7XG4gICAgICAgIHRoaXMucHJldkRlc2NyaXB0aW9uRWRpdEVsZW1lbnQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMubWV0YWJvbGljTWFwSUQgPSAtMTtcbiAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBOYW1lID0gbnVsbDtcbiAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gPSAtMTtcblxuICAgICAgICB0aGlzLmNTb3VyY2VFbnRyaWVzID0gW107XG4gICAgICAgIHRoaXMubVR5cGVFbnRyaWVzID0gW107XG5cbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYyA9IG51bGw7XG4gICAgICAgIHRoaXMubGluZXNEYXRhR3JpZCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZFNwZWNzID0ge307XG4gICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRzID0ge307XG5cbiAgICAgICAgLy8gcHV0IHRoZSBjbGljayBoYW5kbGVyIGF0IHRoZSBkb2N1bWVudCBsZXZlbCwgdGhlbiBmaWx0ZXIgdG8gYW55IGxpbmsgaW5zaWRlIGEgLmRpc2Nsb3NlXG4gICAgICAgICQoZG9jdW1lbnQpLm9uKCdjbGljaycsICcuZGlzY2xvc2UgLmRpc2Nsb3NlTGluaycsIChlKSA9PiB7XG4gICAgICAgICAgICAkKGUudGFyZ2V0KS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAndXJsJzogJ2VkZGRhdGEvJyxcbiAgICAgICAgICAgICd0eXBlJzogJ0dFVCcsXG4gICAgICAgICAgICAnZXJyb3InOiAoeGhyLCBzdGF0dXMsIGUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ0xvYWRpbmcgRURERGF0YSBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIEVERERhdGEgPSAkLmV4dGVuZChFREREYXRhIHx8IHt9LCBkYXRhKTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgLy8gSW5zdGFudGlhdGUgYSB0YWJsZSBzcGVjaWZpY2F0aW9uIGZvciB0aGUgTGluZXMgdGFibGVcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjID0gbmV3IERhdGFHcmlkU3BlY0xpbmVzKCk7XG4gICAgICAgICAgICAgICAgLy8gSW5zdGFudGlhdGUgdGhlIHRhYmxlIGl0c2VsZiB3aXRoIHRoZSBzcGVjXG4gICAgICAgICAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkID0gbmV3IERhdGFHcmlkKHRoaXMubGluZXNEYXRhR3JpZFNwZWMpO1xuICAgICAgICAgICAgICAgIC8vIEZpbmQgb3V0IHdoaWNoIHByb3RvY29scyBoYXZlIGFzc2F5cyB3aXRoIG1lYXN1cmVtZW50cyAtIGRpc2FibGVkIG9yIG5vXG4gICAgICAgICAgICAgICAgdmFyIHByb3RvY29sc1dpdGhNZWFzdXJlbWVudHM6YW55ID0ge307XG4gICAgICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZCwgYXNzYXkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2xzV2l0aE1lYXN1cmVtZW50c1thc3NheS5waWRdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBGb3IgZWFjaCBwcm90b2NvbCB3aXRoIG1lYXN1cmVtZW50cywgY3JlYXRlIGEgRGF0YUdyaWRBc3NheXMgb2JqZWN0LlxuICAgICAgICAgICAgICAgICQuZWFjaChFREREYXRhLlByb3RvY29scywgKGlkLCBwcm90b2NvbCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3BlYztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3RvY29sc1dpdGhNZWFzdXJlbWVudHNbaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkU3BlY3NbaWRdID0gc3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNBc3NheXMocHJvdG9jb2wuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZHNbaWRdID0gbmV3IERhdGFHcmlkQXNzYXlzKHNwZWMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoJ2Zvcm0ubGluZS1lZGl0Jykub24oJ2NoYW5nZScsICcubGluZS1tZXRhID4gOmlucHV0JywgKGV2KSA9PiB7XG4gICAgICAgICAgICAvLyB3YXRjaCBmb3IgY2hhbmdlcyB0byBtZXRhZGF0YSB2YWx1ZXMsIGFuZCBzZXJpYWxpemUgdG8gdGhlIG1ldGFfc3RvcmUgZmllbGRcbiAgICAgICAgICAgIHZhciBmb3JtID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJ2Zvcm0nKSxcbiAgICAgICAgICAgICAgICBtZXRhSW4gPSBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKSxcbiAgICAgICAgICAgICAgICBtZXRhID0gSlNPTi5wYXJzZShtZXRhSW4udmFsKCkgfHwgJ3t9Jyk7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5saW5lLW1ldGEgPiA6aW5wdXQnKS5lYWNoKChpLCBpbnB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSAkKGlucHV0KS5hdHRyKCdpZCcpLm1hdGNoKC8tKFxcZCspJC8pWzFdO1xuICAgICAgICAgICAgICAgIG1ldGFba2V5XSA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5saW5lLW1ldGEtYWRkJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIG1ha2UgbWV0YWRhdGEgQWRkIFZhbHVlIGJ1dHRvbiB3b3JrIGFuZCBub3Qgc3VibWl0IHRoZSBmb3JtXG4gICAgICAgICAgICB2YXIgYWRkcm93ID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5saW5lLWVkaXQtbWV0YScpLCB0eXBlLCB2YWx1ZTtcbiAgICAgICAgICAgIHR5cGUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS10eXBlJykudmFsKCk7XG4gICAgICAgICAgICB2YWx1ZSA9IGFkZHJvdy5maW5kKCcubGluZS1tZXRhLXZhbHVlJykudmFsKCk7XG4gICAgICAgICAgICBhZGRyb3cuZmluZCgnOmlucHV0JykudmFsKCcnKTsgLy8gY2xlYXIgb3V0IGlucHV0cyBzbyBhbm90aGVyIHZhbHVlIGNhbiBiZSBlbnRlcmVkXG4gICAgICAgICAgICBpZiAoRURERGF0YS5NZXRhRGF0YVR5cGVzW3R5cGVdKSB7XG4gICAgICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KGFkZHJvdywgdHlwZSwgdmFsdWUpLmZpbmQoJzppbnB1dCcpLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnLm1ldGEtcmVtb3ZlJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIHJlbW92ZSBtZXRhZGF0YSByb3cgYW5kIGluc2VydCBudWxsIHZhbHVlIGZvciB0aGUgbWV0YWRhdGEga2V5XG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YVJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1tZXRhJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpLFxuICAgICAgICAgICAgICAgIGtleSA9IG1ldGFSb3cuYXR0cignaWQnKS5tYXRjaCgvLShcXGQrKSQvKVsxXTtcbiAgICAgICAgICAgIG1ldGFba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgICAgIG1ldGFSb3cucmVtb3ZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKHdpbmRvdykubG9hZChwcmVwYXJlUGVybWlzc2lvbnMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByZXBhcmVQZXJtaXNzaW9ucygpIHtcbiAgICAgICAgdmFyIHVzZXI6IEpRdWVyeSwgZ3JvdXA6IEpRdWVyeTtcbiAgICAgICAgLy8gVE9ETyB0aGUgRE9NIHRyYXZlcnNpbmcgYW5kIGZpbHRlcmluZyBoZXJlIGlzIHZlcnkgaGFja3ksIGRvIGl0IGJldHRlciBsYXRlclxuICAgICAgICB1c2VyID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZSgkKCcjcGVybWlzc2lvbl91c2VyX2JveCcpKTtcbiAgICAgICAgZ3JvdXAgPSBFRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlKCQoJyNwZXJtaXNzaW9uX2dyb3VwX2JveCcpKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKHVzZXIsICdVc2VyJyk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShncm91cCwgJ0dyb3VwJyk7XG4gICAgICAgICQoJ2Zvcm0ucGVybWlzc2lvbnMnKVxuICAgICAgICAgICAgLm9uKCdjaGFuZ2UnLCAnOnJhZGlvJywgKGV2OkpRdWVyeUlucHV0RXZlbnRPYmplY3QpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByYWRpbzogSlF1ZXJ5ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgICQoJy5wZXJtaXNzaW9ucycpLmZpbmQoJzpyYWRpbycpLmVhY2goKGk6IG51bWJlciwgcjogRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAkKHIpLmNsb3Nlc3QoJ3NwYW4nKS5maW5kKCcuYXV0b2NvbXAnKS5wcm9wKCdkaXNhYmxlZCcsICEkKHIpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHJhZGlvLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgICAgICByYWRpby5jbG9zZXN0KCdzcGFuJykuZmluZCgnLmF1dG9jb21wOnZpc2libGUnKS5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ3N1Ym1pdCcsIChldjpKUXVlcnlFdmVudE9iamVjdCk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwZXJtOiBhbnkgPSB7fSwga2xhc3M6IHN0cmluZywgYXV0bzogSlF1ZXJ5O1xuICAgICAgICAgICAgICAgIGF1dG8gPSAkKCdmb3JtLnBlcm1pc3Npb25zJykuZmluZCgnW25hbWU9Y2xhc3NdOmNoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICBrbGFzcyA9IGF1dG8udmFsKCk7XG4gICAgICAgICAgICAgICAgcGVybS50eXBlID0gJCgnZm9ybS5wZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPXR5cGVdJykudmFsKCk7XG4gICAgICAgICAgICAgICAgcGVybVtrbGFzcy50b0xvd2VyQ2FzZSgpXSA9IHsgJ2lkJzogYXV0by5jbG9zZXN0KCdzcGFuJykuZmluZCgnaW5wdXQ6aGlkZGVuJykudmFsKCkgfTtcbiAgICAgICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgICAgICAndXJsJzogJ3Blcm1pc3Npb25zLycsXG4gICAgICAgICAgICAgICAgICAgICd0eXBlJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICdkYXRhJzogSlNPTi5zdHJpbmdpZnkoW3Blcm1dKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdjc3JmbWlkZGxld2FyZXRva2VuJzogJCgnZm9ybS5wZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPWNzcmZtaWRkbGV3YXJldG9rZW5dJykudmFsKClcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ1NldCBwZXJtaXNzaW9uOiAnLCBKU09OLnN0cmluZ2lmeShwZXJtKV0uam9pbignJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KCdTZXQgUGVybWlzc2lvbicpLmFkZENsYXNzKCdzdWNjZXNzJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oJCgnZm9ybS5wZXJtaXNzaW9ucycpKS5kZWxheSg1MDAwKS5mYWRlT3V0KDIwMDApO1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAnZXJyb3InOiAoeGhyLCBzdGF0dXMsIGVycik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydTZXR0aW5nIHBlcm1pc3Npb24gZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZXJyXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQoJ1NlcnZlciBFcnJvcjogJyArIGVycikuYWRkQ2xhc3MoJ2JhZCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKCQoJ2Zvcm0ucGVybWlzc2lvbnMnKSkuZGVsYXkoNTAwMCkuZmFkZU91dCgyMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmluZCgnOnJhZGlvJykudHJpZ2dlcignY2hhbmdlJykuZW5kKClcbiAgICAgICAgICAgIC5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCkge1xuICAgICAgICAvLyBQcmVwYXJlIHRoZSBjYXJib24gYmFsYW5jZSBncmFwaFxuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhID0gbmV3IENhcmJvbkJhbGFuY2UuRGlzcGxheSgpO1xuICAgICAgICB2YXIgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IGZhbHNlO1xuICAgICAgICBpZiAoIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID4gLTEgKSB7XG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNhbGN1bGF0ZUNhcmJvbkJhbGFuY2VzKHRoaXMubWV0YWJvbGljTWFwSUQsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgXCJTaG93IENhcmJvbiBCYWxhbmNlXCIgY2hlY2tib3ggaW4gcmVkIGlmIHRoZXJlIGFyZSBDQiBpc3N1ZXMuXG4gICAgICAgICAgICBpZiAodGhpcy5jYXJib25CYWxhbmNlRGF0YS5nZXROdW1iZXJPZkltYmFsYW5jZXMoKSA+IDApIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgY2FyYm9uIGJhbGFuY2UgaW4gcmVkIHRvIGluZGljYXRlIHRoYXQgd2UgY2FuJ3QgY2FsY3VsYXRlXG4gICAgICAgICAgICAvLyBjYXJib24gYmFsYW5jZXMgeWV0LiBXaGVuIHRoZXkgY2xpY2sgdGhlIGNoZWNrYm94LCB3ZSdsbCBnZXQgdGhlbSB0b1xuICAgICAgICAgICAgLy8gc3BlY2lmeSB3aGljaCBTQk1MIGZpbGUgdG8gdXNlIGZvciBiaW9tYXNzLlxuICAgICAgICAgICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYy5oaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZmlsdGVyVGFibGVLZXlEb3duKGUpIHtcbiAgICAgICAgc3dpdGNoIChlLmtleUNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgMzg6IC8vIHVwXG4gICAgICAgICAgICBjYXNlIDQwOiAvLyBkb3duXG4gICAgICAgICAgICBjYXNlIDk6ICAvLyB0YWJcbiAgICAgICAgICAgIGNhc2UgMTM6IC8vIHJldHVyblxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8gaWdub3JlIGlmIHRoZSBmb2xsb3dpbmcga2V5cyBhcmUgcHJlc3NlZDogW3NoaWZ0XSBbY2Fwc2xvY2tdXG4gICAgICAgICAgICAgICAgaWYgKGUua2V5Q29kZSA+IDggJiYgZS5rZXlDb2RlIDwgMzIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXVlTWFpbkdyYXBoUmVtYWtlKGZhbHNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIGJ5IERhdGFHcmlkIGFmdGVyIHRoZSBMaW5lcyB0YWJsZSBpcyByZW5kZXJlZFxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCkge1xuICAgICAgICB2YXIgY3NJRHM7XG4gICAgICAgIC8vIFByZXBhcmUgdGhlIG1haW4gZGF0YSBvdmVydmlldyBncmFwaCBhdCB0aGUgdG9wIG9mIHRoZSBwYWdlXG4gICAgICAgIGlmICh0aGlzLm1haW5HcmFwaE9iamVjdCA9PT0gbnVsbCAmJiAkKCcjbWFpbmdyYXBoJykuc2l6ZSgpID09PSAxKSB7XG4gICAgICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdCA9IE9iamVjdC5jcmVhdGUoU3R1ZHlER3JhcGhpbmcpO1xuICAgICAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuU2V0dXAoJ21haW5ncmFwaCcpO1xuXG4gICAgICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0Lm1haW5HcmFwaE9iamVjdCA9IHRoaXMubWFpbkdyYXBoT2JqZWN0O1xuICAgICAgICB9XG5cbiAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykub24oJ21vdXNlb3ZlciBtb3VzZWRvd24gbW91c2V1cCcsIHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UuYmluZCh0aGlzLCBmYWxzZSkpXG4gICAgICAgICAgICAgICAgLm9uKCdrZXlkb3duJywgZmlsdGVyVGFibGVLZXlEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAkKCcjc2VwYXJhdGVBeGVzQ2hlY2tib3gnKS5vbignY2hhbmdlJywgdGhpcy5xdWV1ZU1haW5HcmFwaFJlbWFrZS5iaW5kKHRoaXMsIHRydWUpKTtcblxuICAgICAgICAvLyBFbmFibGUgZWRpdCBsaW5lcyBidXR0b25cbiAgICAgICAgJCgnI2VkaXRMaW5lQnV0dG9uJykub24oJ2NsaWNrJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgdmFyIGJ1dHRvbiA9ICQoZXYudGFyZ2V0KSwgZGF0YSA9IGJ1dHRvbi5kYXRhKCksIGZvcm0gPSBjbGVhckxpbmVGb3JtKCksXG4gICAgICAgICAgICAgICAgYWxsTWV0YSA9IHt9LCBtZXRhUm93O1xuICAgICAgICAgICAgaWYgKGRhdGEuaWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGZpbGxMaW5lRm9ybShmb3JtLCBFREREYXRhLkxpbmVzW2RhdGEuaWRzWzBdXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbXB1dGUgdXNlZCBtZXRhZGF0YSBmaWVsZHMgb24gYWxsIGRhdGEuaWRzLCBpbnNlcnQgbWV0YWRhdGEgcm93cz9cbiAgICAgICAgICAgICAgICBkYXRhLmlkcy5tYXAoKGlkOm51bWJlcikgPT4gRURERGF0YS5MaW5lc1tpZF0gfHwge30pLmZvckVhY2goKGxpbmU6TGluZVJlY29yZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAkLmV4dGVuZChhbGxNZXRhLCBsaW5lLm1ldGEgfHwge30pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG1ldGFSb3cgPSBmb3JtLmZpbmQoJy5saW5lLWVkaXQtbWV0YScpO1xuICAgICAgICAgICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBjb2xsZWN0aW9uIG9mIG1ldGFkYXRhLCBhbmQgYWRkIGEgZm9ybSBlbGVtZW50IGVudHJ5IGZvciBlYWNoXG4gICAgICAgICAgICAgICAgJC5lYWNoKGFsbE1ldGEsIChrZXkpID0+IGluc2VydExpbmVNZXRhZGF0YVJvdyhtZXRhUm93LCBrZXksICcnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVVSUxpbmVGb3JtKGZvcm0sIGRhdGEuY291bnQgPiAxKTtcbiAgICAgICAgICAgIHNjcm9sbFRvRm9ybShmb3JtKTtcbiAgICAgICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1pZHNdJykudmFsKGRhdGEuaWRzLmpvaW4oJywnKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEhhY2t5IGJ1dHRvbiBmb3IgY2hhbmdpbmcgdGhlIG1ldGFib2xpYyBtYXBcbiAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmNsaWNrKCAoKSA9PiB0aGlzLm9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUoKSApO1xuXG4gICAgICAgICQuZWFjaChFREREYXRhLlByb3RvY29scywgKGlkLCBwcm90b2NvbCkgPT4ge1xuICAgICAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICAgICB1cmw6ICdtZWFzdXJlbWVudHMvJyArIGlkICsgJy8nLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICh4aHIsIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGZldGNoIG1lYXN1cmVtZW50IGRhdGEgb24gJyArIHByb3RvY29sLm5hbWUgKyAnIScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzdGF0dXMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc3VjY2VzczogcHJvY2Vzc01lYXN1cmVtZW50RGF0YS5iaW5kKHRoaXMsIHByb3RvY29sKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiByZXF1ZXN0QXNzYXlEYXRhKGFzc2F5KSB7XG4gICAgICAgIHZhciBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICB1cmw6IFsnbWVhc3VyZW1lbnRzJywgYXNzYXkucGlkLCBhc3NheS5pZCwgJyddLmpvaW4oJy8nKSxcbiAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgIGVycm9yOiAoeGhyLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGZldGNoIG1lYXN1cmVtZW50IGRhdGEgb24gJyArIGFzc2F5Lm5hbWUgKyAnIScpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3VjY2VzczogcHJvY2Vzc01lYXN1cmVtZW50RGF0YS5iaW5kKHRoaXMsIHByb3RvY29sKVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NNZWFzdXJlbWVudERhdGEocHJvdG9jb2wsIGRhdGEpIHtcbiAgICAgICAgdmFyIGFzc2F5U2VlbiA9IHt9LFxuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5ID0ge30sXG4gICAgICAgICAgICBjb3VudF90b3RhbDpudW1iZXIgPSAwLFxuICAgICAgICAgICAgY291bnRfcmVjOm51bWJlciA9IDA7XG4gICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9O1xuICAgICAgICBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgPSAkLmV4dGVuZChFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgfHwge30sIGRhdGEudHlwZXMpO1xuICAgICAgICAvLyBhdHRhY2ggbWVhc3VyZW1lbnQgY291bnRzIHRvIGVhY2ggYXNzYXlcbiAgICAgICAgJC5lYWNoKGRhdGEudG90YWxfbWVhc3VyZXMsIChhc3NheUlkOnN0cmluZywgY291bnQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIC8vIGF0dGFjaCB2YWx1ZXNcbiAgICAgICAgICAgICQuZXh0ZW5kKG1lYXN1cmVtZW50LCB7ICd2YWx1ZXMnOiBkYXRhLmRhdGFbbWVhc3VyZW1lbnQuaWRdIHx8IFtdIH0pXG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50LmlkXSA9IG1lYXN1cmVtZW50O1xuICAgICAgICAgICAgLy8gdHJhY2sgd2hpY2ggYXNzYXlzIHJlY2VpdmVkIHVwZGF0ZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBhc3NheVNlZW5bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdID0gcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXVthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgLy8gaGFuZGxlIG1lYXN1cmVtZW50IGRhdGEgYmFzZWQgb24gdHlwZVxuICAgICAgICAgICAgbXR5cGUgPSBkYXRhLnR5cGVzW21lYXN1cmVtZW50LnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgKGFzc2F5Lm1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAoYXNzYXkubWV0YWJvbGl0ZXMgPSBhc3NheS5tZXRhYm9saXRlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAoYXNzYXkucHJvdGVpbnMgPSBhc3NheS5wcm90ZWlucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ2cnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIGdlbmUgLyB0cmFuc2NyaXB0XG4gICAgICAgICAgICAgICAgKGFzc2F5LnRyYW5zY3JpcHRpb25zID0gYXNzYXkudHJhbnNjcmlwdGlvbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAoYXNzYXkuZ2VuZXJhbCA9IGFzc2F5LmdlbmVyYWwgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhkYXRhLm1lYXN1cmVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICBpZiAoY291bnRfcmVjIDwgY291bnRfdG90YWwpIHtcbiAgICAgICAgICAgIC8vIFRPRE8gbm90IGFsbCBtZWFzdXJlbWVudHMgZG93bmxvYWRlZDsgZGlzcGxheSBhIG1lc3NhZ2UgaW5kaWNhdGluZyB0aGlzXG4gICAgICAgICAgICAvLyBleHBsYWluIGRvd25sb2FkaW5nIGluZGl2aWR1YWwgYXNzYXkgbWVhc3VyZW1lbnRzIHRvb1xuICAgICAgICB9XG4gICAgICAgIC8vIGludmFsaWRhdGUgYXNzYXlzIG9uIGFsbCBEYXRhR3JpZHM7IHJlZHJhd3MgdGhlIGFmZmVjdGVkIHJvd3NcbiAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlzRGF0YUdyaWRzLCAocHJvdG9jb2xJZCwgZGF0YUdyaWQpID0+IHtcbiAgICAgICAgICAgIGRhdGFHcmlkLmludmFsaWRhdGVBc3NheVJlY29yZHMoT2JqZWN0LmtleXMocHJvdG9jb2xUb0Fzc2F5W3Byb3RvY29sSWRdIHx8IHt9KSk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodHJ1ZSk7XG4gICAgICAgIHRoaXMucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCk7XG4gICAgICAgIHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UoZmFsc2UpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGNhcmJvbkJhbGFuY2VDb2x1bW5SZXZlYWxlZENhbGxiYWNrKHNwZWM6RGF0YUdyaWRTcGVjTGluZXMsXG4gICAgICAgICAgICBkYXRhR3JpZE9iajpEYXRhR3JpZCkge1xuICAgICAgICBTdHVkeUQucmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKTtcbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHNob3dzIHRoZSBhY3Rpb25zIHBhbmVsLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZUxpbmVzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICBpZiAodGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQgKHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gc2V0VGltZW91dChsaW5lc0FjdGlvblBhbmVsU2hvdy5iaW5kKHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gbGluZXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgbGluZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICB2YXIgY2hlY2tlZEJveGVzID0gW10sIGNoZWNrZWRMZW4sIGxpbmVzQWN0aW9uUGFuZWw7XG4gICAgICAgIGlmICh0aGlzLmxpbmVzRGF0YUdyaWQpIHtcbiAgICAgICAgICAgIGNoZWNrZWRCb3hlcyA9IHRoaXMubGluZXNEYXRhR3JpZC5nZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTtcbiAgICAgICAgfVxuICAgICAgICBjaGVja2VkTGVuID0gY2hlY2tlZEJveGVzLmxlbmd0aDtcbiAgICAgICAgbGluZXNBY3Rpb25QYW5lbCA9ICQoJyNsaW5lc0FjdGlvblBhbmVsJykudG9nZ2xlQ2xhc3MoJ29mZicsICFjaGVja2VkTGVuKTtcbiAgICAgICAgJCgnI2xpbmVzU2VsZWN0ZWRDZWxsJykuZW1wdHkoKS50ZXh0KGNoZWNrZWRMZW4gKyAnIHNlbGVjdGVkJyk7XG4gICAgICAgIC8vIGVuYWJsZSBzaW5ndWxhci9wbHVyYWwgY2hhbmdlc1xuICAgICAgICAkKCcjY2xvbmVMaW5lQnV0dG9uJykudGV4dCgnQ2xvbmUgTGluZScgKyAoY2hlY2tlZExlbiA+IDEgPyAncycgOiAnJykpO1xuICAgICAgICAkKCcjZWRpdExpbmVCdXR0b24nKS50ZXh0KCdFZGl0IExpbmUnICsgKGNoZWNrZWRMZW4gPiAxID8gJ3MnIDogJycpKS5kYXRhKHtcbiAgICAgICAgICAgICdjb3VudCc6IGNoZWNrZWRMZW4sXG4gICAgICAgICAgICAnaWRzJzogY2hlY2tlZEJveGVzLm1hcCgoYm94OkhUTUxJbnB1dEVsZW1lbnQpID0+IGJveC52YWx1ZSlcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNncm91cExpbmVCdXR0b24nKS50b2dnbGVDbGFzcygnb2ZmJywgY2hlY2tlZExlbiA8IDIpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICAgICAgLy8gVGhpcyB3YXkgd2UncmUgbm90IGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW5cbiAgICAgICAgLy8gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgICAgIGlmICh0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoYXNzYXlzQWN0aW9uUGFuZWxTaG93LmJpbmQodGhpcyksIDE1MCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBhc3NheXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIHZhciBjaGVja2VkQm94ZXMgPSBbXSwgY2hlY2tlZEFzc2F5cywgY2hlY2tlZE1lYXN1cmUsIHBhbmVsLCBpbmZvYm94O1xuICAgICAgICBwYW5lbCA9ICQoJyNhc3NheXNBY3Rpb25QYW5lbCcpO1xuICAgICAgICBpZiAoIXBhbmVsLnNpemUoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgYXNzYXlzL2NoZWNrYm94ZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICAkLmVhY2godGhpcy5hc3NheXNEYXRhR3JpZHMsIChwSUQsIGRhdGFHcmlkKSA9PiB7XG4gICAgICAgICAgICBjaGVja2VkQm94ZXMgPSBjaGVja2VkQm94ZXMuY29uY2F0KGRhdGFHcmlkLmdldFNlbGVjdGVkQ2hlY2tib3hFbGVtZW50cygpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNoZWNrZWRBc3NheXMgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCdbaWRePWFzc2F5XScpLnNpemUoKTtcbiAgICAgICAgY2hlY2tlZE1lYXN1cmUgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCc6bm90KFtpZF49YXNzYXldKScpLnNpemUoKTtcbiAgICAgICAgcGFuZWwudG9nZ2xlQ2xhc3MoJ29mZicsICFjaGVja2VkQXNzYXlzICYmICFjaGVja2VkTWVhc3VyZSk7XG4gICAgICAgIGlmIChjaGVja2VkQXNzYXlzIHx8IGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICBpbmZvYm94ID0gJCgnI2Fzc2F5c1NlbGVjdGVkQ2VsbCcpLmVtcHR5KCk7XG4gICAgICAgICAgICBpZiAoY2hlY2tlZEFzc2F5cykge1xuICAgICAgICAgICAgICAgICQoXCI8cD5cIikuYXBwZW5kVG8oaW5mb2JveCkudGV4dCgoY2hlY2tlZEFzc2F5cyA+IDEpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIChjaGVja2VkQXNzYXlzICsgXCIgQXNzYXlzIHNlbGVjdGVkXCIpIDogXCIxIEFzc2F5IHNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICAgICAgJChcIjxwPlwiKS5hcHBlbmRUbyhpbmZvYm94KS50ZXh0KChjaGVja2VkTWVhc3VyZSA+IDEpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIChjaGVja2VkTWVhc3VyZSArIFwiIE1lYXN1cmVtZW50cyBzZWxlY3RlZFwiKSA6IFwiMSBNZWFzdXJlbWVudCBzZWxlY3RlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyBhIGdyYXBoLiBUaGlzIHdheSB3ZSdyZSBub3RcbiAgICAvLyBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZU1haW5HcmFwaFJlbWFrZShmb3JjZT86Ym9vbGVhbikge1xuICAgICAgICBpZiAodGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KHJlbWFrZU1haW5HcmFwaEFyZWEuYmluZCh0aGlzLCBmb3JjZSksIDIwMCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiByZW1ha2VNYWluR3JhcGhBcmVhKGZvcmNlPzpib29sZWFuKSB7XG4gICAgICAgIHZhciBwcmV2aW91c0lEU2V0OmFueVtdLCBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzOmFueVtdLFxuICAgICAgICAgICAgZGF0YVBvaW50c0Rpc3BsYXllZCA9IDAsXG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgPSAwLFxuICAgICAgICAgICAgc2VwYXJhdGVBeGVzID0gJCgnI3NlcGFyYXRlQXhlc0NoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpLFxuICAgICAgICAgICAgLy8gRklYTUUgYXNzdW1lcyAoeDAsIHkwKSBwb2ludHNcbiAgICAgICAgICAgIGNvbnZlcnQgPSAoZCkgPT4geyByZXR1cm4gW1sgZFswXVswXSwgZFsxXVswXSBdXTsgfSxcbiAgICAgICAgICAgIGNvbXBhcmUgPSAoYSwgYikgPT4geyByZXR1cm4gYVswXSAtIGJbMF07IH07XG4gICAgICAgIHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQgPSAwO1xuICAgICAgICBpZiAoIXRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZSkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBTdGFydCBvdXQgd2l0aCBhIGJsYW5rIGdyYXBoLiAgV2Ugd2lsbCByZS1hZGQgYWxsIHRoZSByZWxldmFudCBzZXRzLlxuICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdC5jbGVhckFsbFNldHMoKTtcbiAgICAgICAgcG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cyA9IHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuYnVpbGRGaWx0ZXJlZE1lYXN1cmVtZW50cygpO1xuXG4gICAgICAgICQuZWFjaChwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzLCAoaSwgbWVhc3VyZW1lbnRJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnRJZF0sXG4gICAgICAgICAgICAgICAgbXR5cGU6TWVhc3VyZW1lbnRUeXBlUmVjb3JkID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0sXG4gICAgICAgICAgICAgICAgcG9pbnRzID0gKG1lYXN1cmUudmFsdWVzID8gbWVhc3VyZS52YWx1ZXMubGVuZ3RoIDogMCksXG4gICAgICAgICAgICAgICAgYXNzYXksIGxpbmUsIHByb3RvY29sLCBuZXdTZXQ7XG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgKz0gcG9pbnRzO1xuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHNEaXNwbGF5ZWQgPiAxNTAwMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGUgcmVzdCBpZiB3ZSd2ZSBoaXQgb3VyIGxpbWl0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkYXRhUG9pbnRzRGlzcGxheWVkICs9IHBvaW50cztcbiAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZS5hc3NheV0gfHwge307XG4gICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdIHx8IHt9O1xuICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdIHx8IHt9O1xuICAgICAgICAgICAgbmV3U2V0ID0ge1xuICAgICAgICAgICAgICAgICdsYWJlbCc6ICdkdCcgKyBtZWFzdXJlbWVudElkLFxuICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudG5hbWUnOiBVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvTmFtZShtZWFzdXJlKSxcbiAgICAgICAgICAgICAgICAnbmFtZSc6IFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSxcbiAgICAgICAgICAgICAgICAndW5pdHMnOiBVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMobWVhc3VyZSksXG4gICAgICAgICAgICAgICAgJ2RhdGEnOiAkLm1hcChtZWFzdXJlLnZhbHVlcywgY29udmVydCkuc29ydChjb21wYXJlKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChsaW5lLmNvbnRyb2wpIG5ld1NldC5pc2NvbnRyb2wgPSAxO1xuICAgICAgICAgICAgaWYgKHNlcGFyYXRlQXhlcykge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBtZWFzdXJlbWVudCBpcyBhIG1ldGFib2xpdGUsIGNob29zZSB0aGUgYXhpcyBieSB0eXBlLiBJZiBpdCdzIGFueVxuICAgICAgICAgICAgICAgIC8vIG90aGVyIHN1YnR5cGUsIGNob29zZSB0aGUgYXhpcyBiYXNlZCBvbiB0aGF0IHN1YnR5cGUsIHdpdGggYW4gb2Zmc2V0IHRvIGF2b2lkXG4gICAgICAgICAgICAgICAgLy8gY29sbGlkaW5nIHdpdGggdGhlIG1ldGFib2xpdGUgYXhlcy5cbiAgICAgICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3U2V0LnlheGlzQnlNZWFzdXJlbWVudFR5cGVJRCA9IG10eXBlLmlkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG5ld1NldC55YXhpc0J5TWVhc3VyZW1lbnRUeXBlSUQgPSBtdHlwZS5mYW1pbHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuYWRkTmV3U2V0KG5ld1NldCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkaXNwbGF5VGV4dCA9IGRhdGFQb2ludHNEaXNwbGF5ZWQgKyBcIiBwb2ludHMgZGlzcGxheWVkXCI7XG4gICAgICAgIGlmIChkYXRhUG9pbnRzRGlzcGxheWVkICE9IGRhdGFQb2ludHNUb3RhbCkge1xuICAgICAgICAgICAgZGlzcGxheVRleHQgKz0gXCIgKG91dCBvZiBcIiArIGRhdGFQb2ludHNUb3RhbCArIFwiKVwiO1xuICAgICAgICB9XG4gICAgICAgICQoJyNwb2ludHNEaXNwbGF5ZWRTcGFuJykuZW1wdHkoKS50ZXh0KGRpc3BsYXlUZXh0KTtcblxuICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdC5kcmF3U2V0cygpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gY2xlYXJBc3NheUZvcm0oKTpKUXVlcnkge1xuICAgICAgICB2YXIgZm9ybTpKUXVlcnkgPSAkKCcjaWRfYXNzYXktYXNzYXlfaWQnKS5jbG9zZXN0KCcuZGlzY2xvc2UnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49YXNzYXktXScpLnZhbCgnJykuZW5kKCkuZmluZCgnLmNhbmNlbC1saW5rJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmVycm9ybGlzdCcpLnJlbW92ZSgpO1xuICAgICAgICByZXR1cm4gZm9ybTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhckxpbmVGb3JtKCkge1xuICAgICAgICB2YXIgZm9ybSA9ICQoJyNpZF9saW5lLWlkcycpLmNsb3Nlc3QoJy5kaXNjbG9zZScpO1xuICAgICAgICBmb3JtLmZpbmQoJy5saW5lLW1ldGEnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCc6aW5wdXQnKS5maWx0ZXIoJ1tuYW1lXj1saW5lLV0nKS52YWwoJycpO1xuICAgICAgICBmb3JtLmZpbmQoJy5lcnJvcmxpc3QnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuY2FuY2VsLWxpbmsnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuYnVsaycpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgZm9ybS5vZmYoJ2NoYW5nZS5idWxrJyk7XG4gICAgICAgIHJldHVybiBmb3JtO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbGxBc3NheUZvcm0oZm9ybSwgcmVjb3JkKSB7XG4gICAgICAgIHZhciB1c2VyID0gRURERGF0YS5Vc2Vyc1tyZWNvcmQuZXhwZXJpbWVudGVyXTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1hc3NheV9pZF0nKS52YWwocmVjb3JkLmlkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1uYW1lXScpLnZhbChyZWNvcmQubmFtZSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZGVzY3JpcHRpb25dJykudmFsKHJlY29yZC5kZXNjcmlwdGlvbik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktcHJvdG9jb2xdJykudmFsKHJlY29yZC5waWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8wXScpLnZhbCh1c2VyICYmIHVzZXIudWlkID8gdXNlci51aWQgOiAnLS0nKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1leHBlcmltZW50ZXJfMV0nKS52YWwocmVjb3JkLmV4cGVyaW1lbnRlcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmlsbExpbmVGb3JtKGZvcm0sIHJlY29yZCkge1xuICAgICAgICB2YXIgbWV0YVJvdywgZXhwZXJpbWVudGVyLCBjb250YWN0O1xuICAgICAgICBleHBlcmltZW50ZXIgPSBFREREYXRhLlVzZXJzW3JlY29yZC5leHBlcmltZW50ZXJdO1xuICAgICAgICBjb250YWN0ID0gRURERGF0YS5Vc2Vyc1tyZWNvcmQuY29udGFjdC51c2VyX2lkXTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWlkc10nKS52YWwocmVjb3JkLmlkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLW5hbWVdJykudmFsKHJlY29yZC5uYW1lKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWRlc2NyaXB0aW9uXScpLnZhbChyZWNvcmQuZGVzY3JpcHRpb24pO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY29udHJvbF0nKS5wcm9wKCdjaGVja2VkJywgcmVjb3JkLmNvbnRyb2wpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY29udGFjdF8wXScpLnZhbChyZWNvcmQuY29udGFjdC50ZXh0IHx8IChjb250YWN0ICYmIGNvbnRhY3QudWlkID8gY29udGFjdC51aWQgOiAnLS0nKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250YWN0XzFdJykudmFsKHJlY29yZC5jb250YWN0LnVzZXJfaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtZXhwZXJpbWVudGVyXzBdJykudmFsKGV4cGVyaW1lbnRlciAmJiBleHBlcmltZW50ZXIudWlkID8gZXhwZXJpbWVudGVyLnVpZCA6ICctLScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtZXhwZXJpbWVudGVyXzFdJykudmFsKHJlY29yZC5leHBlcmltZW50ZXIpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY2FyYm9uX3NvdXJjZV8wXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuY2FyYm9uLm1hcCgodikgPT4gKEVERERhdGEuQ1NvdXJjZXNbdl0gfHwgPENhcmJvblNvdXJjZVJlY29yZD57fSkubmFtZSB8fCAnLS0nKS5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY2FyYm9uX3NvdXJjZV8xXScpLnZhbChyZWNvcmQuY2FyYm9uLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzBdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5zdHJhaW4ubWFwKCh2KSA9PiAoRURERGF0YS5TdHJhaW5zW3ZdIHx8IDxTdHJhaW5SZWNvcmQ+e30pLm5hbWUgfHwgJy0tJykuam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMV0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLnN0cmFpbi5tYXAoKHYpID0+IChFREREYXRhLlN0cmFpbnNbdl0gfHwgPFN0cmFpblJlY29yZD57fSkucmVnaXN0cnlfaWQgfHwgJycpLmpvaW4oJywnKSk7XG4gICAgICAgIGlmIChyZWNvcmQuc3RyYWluLmxlbmd0aCAmJiBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18xXScpLnZhbCgpID09PSAnJykge1xuICAgICAgICAgICAgJCgnPGxpPicpLnRleHQoJ1N0cmFpbiBkb2VzIG5vdCBoYXZlIGEgbGlua2VkIElDRSBlbnRyeSEgJyArXG4gICAgICAgICAgICAgICAgICAgICdTYXZpbmcgdGhlIGxpbmUgd2l0aG91dCBsaW5raW5nIHRvIElDRSB3aWxsIHJlbW92ZSB0aGUgc3RyYWluLicpXG4gICAgICAgICAgICAgICAgLndyYXAoJzx1bD4nKS5wYXJlbnQoKS5hZGRDbGFzcygnZXJyb3JsaXN0JylcbiAgICAgICAgICAgICAgICAuYXBwZW5kVG8oZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMF0nKS5wYXJlbnQoKSk7XG4gICAgICAgIH1cbiAgICAgICAgbWV0YVJvdyA9IGZvcm0uZmluZCgnLmxpbmUtZWRpdC1tZXRhJyk7XG4gICAgICAgIC8vIFJ1biB0aHJvdWdoIHRoZSBjb2xsZWN0aW9uIG9mIG1ldGFkYXRhLCBhbmQgYWRkIGEgZm9ybSBlbGVtZW50IGVudHJ5IGZvciBlYWNoXG4gICAgICAgICQuZWFjaChyZWNvcmQubWV0YSwgKGtleSwgdmFsdWUpID0+IHtcbiAgICAgICAgICAgIGluc2VydExpbmVNZXRhZGF0YVJvdyhtZXRhUm93LCBrZXksIHZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHN0b3JlIG9yaWdpbmFsIG1ldGFkYXRhIGluIGluaXRpYWwtIGZpZWxkXG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1tZXRhX3N0b3JlXScpLnZhbChKU09OLnN0cmluZ2lmeShyZWNvcmQubWV0YSkpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWluaXRpYWwtbGluZS1tZXRhX3N0b3JlXScpLnZhbChKU09OLnN0cmluZ2lmeShyZWNvcmQubWV0YSkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNjcm9sbFRvRm9ybShmb3JtKSB7XG4gICAgICAgIC8vIG1ha2Ugc3VyZSBmb3JtIGlzIGRpc2Nsb3NlZFxuICAgICAgICB2YXIgdG9wID0gZm9ybS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJywgZmFsc2UpLm9mZnNldCgpLnRvcDtcbiAgICAgICAgJCgnaHRtbCcpLmFuaW1hdGUoeyAnc2Nyb2xsVG9wJzogdG9wIH0sICdzbG93Jyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlVUlBc3NheUZvcm0oZm9ybSkge1xuICAgICAgICB2YXIgdGl0bGUsIGJ1dHRvbjtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBkaXNjbG9zZSB0aXRsZSB0byByZWFkIEVkaXRcbiAgICAgICAgdGl0bGUgPSBmb3JtLmZpbmQoJy5kaXNjbG9zZUxpbmsgPiBhJykudGV4dCgnRWRpdCBBc3NheScpO1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGJ1dHRvbiB0byByZWFkIEVkaXRcbiAgICAgICAgYnV0dG9uID0gZm9ybS5maW5kKCdbbmFtZT1hY3Rpb25dW3ZhbHVlPWFzc2F5XScpLnRleHQoJ0VkaXQgQXNzYXknKTtcbiAgICAgICAgLy8gQWRkIGxpbmsgdG8gcmV2ZXJ0IGJhY2sgdG8gJ0FkZCBMaW5lJyBmb3JtXG4gICAgICAgICQoJzxhIGhyZWY9XCIjXCI+Q2FuY2VsPC9hPicpLmFkZENsYXNzKCdjYW5jZWwtbGluaycpLm9uKCdjbGljaycsIChldikgPT4ge1xuICAgICAgICAgICAgY2xlYXJBc3NheUZvcm0oKTtcbiAgICAgICAgICAgIHRpdGxlLnRleHQoJ0FkZCBBc3NheXMgVG8gU2VsZWN0ZWQgTGluZXMnKTtcbiAgICAgICAgICAgIGJ1dHRvbi50ZXh0KCdBZGQgQXNzYXknKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSkuaW5zZXJ0QWZ0ZXIoYnV0dG9uKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVVSUxpbmVGb3JtKGZvcm0sIHBsdXJhbD8pIHtcbiAgICAgICAgdmFyIHRpdGxlLCBidXR0b24sIHRleHQgPSAnRWRpdCBMaW5lJyArIChwbHVyYWwgPyAncycgOiAnJyk7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgZGlzY2xvc2UgdGl0bGUgdG8gcmVhZCAnRWRpdCBMaW5lJ1xuICAgICAgICB0aXRsZSA9IGZvcm0uZmluZCgnLmRpc2Nsb3NlTGluayA+IGEnKS50ZXh0KHRleHQpO1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGJ1dHRvbiB0byByZWFkICdFZGl0IExpbmUnXG4gICAgICAgIGJ1dHRvbiA9IGZvcm0uZmluZCgnW25hbWU9YWN0aW9uXVt2YWx1ZT1saW5lXScpLnRleHQodGV4dCk7XG4gICAgICAgIGlmIChwbHVyYWwpIHtcbiAgICAgICAgICAgIGZvcm0uZmluZCgnLmJ1bGsnKS5wcm9wKCdjaGVja2VkJywgZmFsc2UpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIGZvcm0ub24oJ2NoYW5nZS5idWxrJywgJzppbnB1dCcsIChldjpKUXVlcnlFdmVudE9iamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgICQoZXYudGFyZ2V0KS5zaWJsaW5ncygnbGFiZWwnKS5maW5kKCcuYnVsaycpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFkZCBsaW5rIHRvIHJldmVydCBiYWNrIHRvICdBZGQgTGluZScgZm9ybVxuICAgICAgICAkKCc8YSBocmVmPVwiI1wiPkNhbmNlbDwvYT4nKS5hZGRDbGFzcygnY2FuY2VsLWxpbmsnKS5vbignY2xpY2snLCAoZXYpID0+IHtcbiAgICAgICAgICAgIGNsZWFyTGluZUZvcm0oKTtcbiAgICAgICAgICAgIHRpdGxlLnRleHQoJ0FkZCBBIE5ldyBMaW5lJyk7XG4gICAgICAgICAgICBidXR0b24udGV4dCgnQWRkIExpbmUnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSkuaW5zZXJ0QWZ0ZXIoYnV0dG9uKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cocmVmUm93LCBrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciByb3csIHR5cGUsIGxhYmVsLCBpbnB1dCwgaWQgPSAnbGluZS1tZXRhLScgKyBrZXk7XG4gICAgICAgIHJvdyA9ICQoJzxwPicpLmF0dHIoJ2lkJywgJ3Jvd18nICsgaWQpLmFkZENsYXNzKCdsaW5lLW1ldGEnKS5pbnNlcnRCZWZvcmUocmVmUm93KTtcbiAgICAgICAgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1trZXldO1xuICAgICAgICBsYWJlbCA9ICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCAnaWRfJyArIGlkKS50ZXh0KHR5cGUubmFtZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgLy8gYnVsayBjaGVja2JveD9cbiAgICAgICAgaW5wdXQgPSAkKCc8aW5wdXQgdHlwZT1cInRleHRcIj4nKS5hdHRyKCdpZCcsICdpZF8nICsgaWQpLnZhbCh2YWx1ZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgaWYgKHR5cGUucHJlKSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wcmVmaXgnKS50ZXh0KHR5cGUucHJlKS5pbnNlcnRCZWZvcmUoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXJlbW92ZScpLnRleHQoJ1JlbW92ZScpLmluc2VydEFmdGVyKGlucHV0KTtcbiAgICAgICAgaWYgKHR5cGUucG9zdGZpeCkge1xuICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcG9zdGZpeCcpLnRleHQodHlwZS5wb3N0Zml4KS5pbnNlcnRBZnRlcihpbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvdztcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZWRpdEFzc2F5KGluZGV4Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGZvcm07XG4gICAgICAgIGlmICghcmVjb3JkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnSW52YWxpZCBBc3NheSByZWNvcmQgZm9yIGVkaXRpbmc6ICcgKyBpbmRleCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBmb3JtID0gY2xlYXJBc3NheUZvcm0oKTsgLy8gXCJmb3JtXCIgaXMgYWN0dWFsbHkgdGhlIGRpc2Nsb3NlIGJsb2NrXG4gICAgICAgIGZpbGxBc3NheUZvcm0oZm9ybSwgcmVjb3JkKTtcbiAgICAgICAgdXBkYXRlVUlBc3NheUZvcm0oZm9ybSk7XG4gICAgICAgIHNjcm9sbFRvRm9ybShmb3JtKTtcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZWRpdExpbmUoaW5kZXg6bnVtYmVyKTp2b2lkIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuTGluZXNbaW5kZXhdLCBmb3JtO1xuICAgICAgICBpZiAoIXJlY29yZCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ludmFsaWQgTGluZSByZWNvcmQgZm9yIGVkaXRpbmc6ICcgKyBpbmRleCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBmb3JtID0gY2xlYXJMaW5lRm9ybSgpOyAvLyBcImZvcm1cIiBpcyBhY3R1YWxseSB0aGUgZGlzY2xvc2UgYmxvY2tcbiAgICAgICAgZmlsbExpbmVGb3JtKGZvcm0sIHJlY29yZCk7XG4gICAgICAgIHVwZGF0ZVVJTGluZUZvcm0oZm9ybSk7XG4gICAgICAgIHNjcm9sbFRvRm9ybShmb3JtKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBvbkNoYW5nZWRNZXRhYm9saWNNYXAoKSB7XG4gICAgICAgIGlmICh0aGlzLm1ldGFib2xpY01hcE5hbWUpIHtcbiAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgVUkgdG8gc2hvdyB0aGUgbmV3IGZpbGVuYW1lIGZvciB0aGUgbWV0YWJvbGljIG1hcC5cbiAgICAgICAgICAgICQoXCIjbWV0YWJvbGljTWFwTmFtZVwiKS5odG1sKHRoaXMubWV0YWJvbGljTWFwTmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuaHRtbCgnKG5vbmUpJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gJiYgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gIT0gLTEpIHtcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBjYXJib24gYmFsYW5jZXMgbm93IHRoYXQgd2UgY2FuLlxuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YS5jYWxjdWxhdGVDYXJib25CYWxhbmNlcyh0aGlzLm1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbik7XG5cbiAgICAgICAgICAgIC8vIFJlYnVpbGQgdGhlIENCIGdyYXBocy5cbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiByZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpIHtcbiAgICAgICAgdmFyIGNlbGxPYmpzOkRhdGFHcmlkRGF0YUNlbGxbXSxcbiAgICAgICAgICAgIGdyb3VwOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjID0gdGhpcy5saW5lc0RhdGFHcmlkU3BlYy5jYXJib25CYWxhbmNlQ29sO1xuICAgICAgICBpZiAodGhpcy5jYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2gpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBEcm9wIGFueSBwcmV2aW91c2x5IGNyZWF0ZWQgQ2FyYm9uIEJhbGFuY2UgU1ZHIGVsZW1lbnRzIGZyb20gdGhlIERPTS5cbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YS5yZW1vdmVBbGxDQkdyYXBocygpO1xuICAgICAgICBjZWxsT2JqcyA9IFtdO1xuICAgICAgICAvLyBnZXQgYWxsIGNlbGxzIGZyb20gYWxsIGNvbHVtbnMgaW4gdGhlIGNvbHVtbiBncm91cFxuICAgICAgICBncm91cC5tZW1iZXJDb2x1bW5zLmZvckVhY2goKGNvbDpEYXRhR3JpZENvbHVtblNwZWMpOnZvaWQgPT4ge1xuICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoY2VsbE9ianMsIGNvbC5nZXRFbnRpcmVJbmRleCgpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGNyZWF0ZSBjYXJib24gYmFsYW5jZSBncmFwaCBmb3IgZWFjaCBjZWxsXG4gICAgICAgIGNlbGxPYmpzLmZvckVhY2goKGNlbGw6RGF0YUdyaWREYXRhQ2VsbCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YS5jcmVhdGVDQkdyYXBoRm9yTGluZShjZWxsLnJlY29yZElELCBjZWxsLmNlbGxFbGVtZW50KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIC8vIFRoZXkgd2FudCB0byBzZWxlY3QgYSBkaWZmZXJlbnQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSgpOnZvaWQge1xuICAgICAgICB2YXIgdWk6U3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLFxuICAgICAgICAgICAgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCA9IChlcnJvcjpzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwSUQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBOYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgZmluYWxCaW9tYXNzPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGljTWFwSUQgPSBtZXRhYm9saWNNYXBJRDtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpY01hcE5hbWUgPSBtZXRhYm9saWNNYXBOYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gZmluYWxCaW9tYXNzO1xuICAgICAgICAgICAgICAgIHRoaXMub25DaGFuZ2VkTWV0YWJvbGljTWFwKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSBlcnJvcjogXCIgKyBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHVpID0gbmV3IFN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlcihmYWxzZSwgY2FsbGJhY2spO1xuICAgIH1cbn07XG5cblxuXG4vLyBUaGUgc3BlYyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBEYXRhR3JpZCB0byBjcmVhdGUgdGhlIExpbmVzIHRhYmxlXG5jbGFzcyBEYXRhR3JpZFNwZWNMaW5lcyBleHRlbmRzIERhdGFHcmlkU3BlY0Jhc2Uge1xuXG4gICAgbWV0YURhdGFJRHNVc2VkSW5MaW5lczphbnk7XG4gICAgZ3JvdXBJRHNJbk9yZGVyOmFueTtcbiAgICBncm91cElEc1RvR3JvdXBJbmRleGVzOmFueTtcbiAgICBncm91cElEc1RvR3JvdXBOYW1lczphbnk7XG4gICAgY2FyYm9uQmFsYW5jZUNvbDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYztcbiAgICBjYXJib25CYWxhbmNlV2lkZ2V0OkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQ7XG5cblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzKCk7XG4gICAgICAgIHRoaXMuZmluZEdyb3VwSURzQW5kTmFtZXMoKTtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG5cblxuICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQodjpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlV2lkZ2V0LmhpZ2hsaWdodCh2KTtcbiAgICB9XG5cblxuICAgIGVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodjpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlV2lkZ2V0LmVuYWJsZSh2KTtcbiAgICB9XG5cblxuICAgIGZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzKCkge1xuICAgICAgICB2YXIgc2Vlbkhhc2g6YW55ID0ge307XG4gICAgICAgIC8vIGxvb3AgbGluZXNcbiAgICAgICAgJC5lYWNoKHRoaXMuZ2V0UmVjb3JkSURzKCksIChpbmRleCwgaWQpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpZF07XG4gICAgICAgICAgICBpZiAobGluZSkge1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwge30sIChrZXkpID0+IHNlZW5IYXNoW2tleV0gPSB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHN0b3JlIGFsbCBtZXRhZGF0YSBJRHMgc2VlblxuICAgICAgICB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMgPSBPYmplY3Qua2V5cyhzZWVuSGFzaCk7XG4gICAgfVxuXG5cbiAgICBmaW5kR3JvdXBJRHNBbmROYW1lcygpIHtcbiAgICAgICAgdmFyIHJvd0dyb3VwcyA9IHt9O1xuICAgICAgICAvLyBHYXRoZXIgYWxsIHRoZSByb3cgSURzIHVuZGVyIHRoZSBncm91cCBJRCBlYWNoIGJlbG9uZ3MgdG8uXG4gICAgICAgICQuZWFjaCh0aGlzLmdldFJlY29yZElEcygpLCAoaW5kZXgsIGlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaWRdLCByZXAgPSBsaW5lLnJlcGxpY2F0ZTtcbiAgICAgICAgICAgIGlmIChyZXApIHtcbiAgICAgICAgICAgICAgICAvLyB1c2UgcGFyZW50IHJlcGxpY2F0ZSBhcyBhIHJlcGxpY2F0ZSBncm91cCBJRCwgcHVzaCBhbGwgbWF0Y2hpbmcgbGluZSBJRHNcbiAgICAgICAgICAgICAgICAocm93R3JvdXBzW3JlcF0gPSByb3dHcm91cHNbcmVwXSB8fCBbIHJlcCBdKS5wdXNoKGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXMgPSB7fTtcbiAgICAgICAgLy8gRm9yIGVhY2ggZ3JvdXAgSUQsIGp1c3QgdXNlIHBhcmVudCByZXBsaWNhdGUgbmFtZVxuICAgICAgICAkLmVhY2gocm93R3JvdXBzLCAoZ3JvdXAsIGxpbmVzKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2dyb3VwXSA9IEVERERhdGEuTGluZXNbZ3JvdXBdLm5hbWU7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBhbHBoYW51bWVyaWMgc29ydCBvZiBncm91cCBJRHMgYnkgbmFtZSBhdHRhY2hlZCB0byB0aG9zZSByZXBsaWNhdGUgZ3JvdXBzXG4gICAgICAgIHRoaXMuZ3JvdXBJRHNJbk9yZGVyID0gT2JqZWN0LmtleXMocm93R3JvdXBzKS5zb3J0KChhLGIpID0+IHtcbiAgICAgICAgICAgIHZhciB1OnN0cmluZyA9IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbYV0sIHY6c3RyaW5nID0gdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tiXTtcbiAgICAgICAgICAgIHJldHVybiB1IDwgdiA/IC0xIDogdSA+IHYgPyAxIDogMDtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIE5vdyB0aGF0IHRoZXkncmUgc29ydGVkIGJ5IG5hbWUsIGNyZWF0ZSBhIGhhc2ggZm9yIHF1aWNrbHkgcmVzb2x2aW5nIElEcyB0byBpbmRleGVzIGluXG4gICAgICAgIC8vIHRoZSBzb3J0ZWQgYXJyYXlcbiAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBJbmRleGVzID0ge307XG4gICAgICAgICQuZWFjaCh0aGlzLmdyb3VwSURzSW5PcmRlciwgKGluZGV4LCBncm91cCkgPT4gdGhpcy5ncm91cElEc1RvR3JvdXBJbmRleGVzW2dyb3VwXSA9IGluZGV4KTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSB0YWJsZSBhcyBhIHdob2xlXG4gICAgZGVmaW5lVGFibGVTcGVjKCk6RGF0YUdyaWRUYWJsZVNwZWMge1xuICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkVGFibGVTcGVjKCdsaW5lcycsIHsgJ25hbWUnOiAnTGluZXMnIH0pO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBwcml2YXRlIGxvYWRMaW5lTmFtZShpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBsaW5lO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZFN0cmFpbk5hbWUoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgYSBzdHJhaW4gSUQgZXhpc3RzIG9uIGxpbmUsIGlzIGEga25vd24gc3RyYWluLCB1cHBlcmNhc2UgZmlyc3QgZm91bmQgbmFtZSBvciAnPydcbiAgICAgICAgdmFyIGxpbmUsIHN0cmFpbjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5zdHJhaW4gJiYgbGluZS5zdHJhaW4ubGVuZ3RoICYmIChzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbbGluZS5zdHJhaW5bMF1dKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHJhaW4ubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRGaXJzdENhcmJvblNvdXJjZShpbmRleDpzdHJpbmcpOmFueSB7XG4gICAgICAgIC8vIGVuc3VyZSBjYXJib24gc291cmNlIElEKHMpIGV4aXN0IG9uIGxpbmUsIGVuc3VyZSBhdCBsZWFzdCBvbmUgc291cmNlIElELCBlbnN1cmUgZmlyc3QgSURcbiAgICAgICAgLy8gaXMga25vd24gY2FyYm9uIHNvdXJjZVxuICAgICAgICB2YXIgbGluZSwgc291cmNlO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmNhcmJvbiAmJiBsaW5lLmNhcmJvbi5sZW5ndGggJiYgKHNvdXJjZSA9IEVERERhdGEuQ1NvdXJjZXNbbGluZS5jYXJib25bMF1dKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkQ2FyYm9uU291cmNlKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMubG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4KTtcbiAgICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkQ2FyYm9uU291cmNlTGFiZWxpbmcoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc291cmNlID0gdGhpcy5sb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXgpO1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gc291cmNlLmxhYmVsaW5nLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkRXhwZXJpbWVudGVySW5pdGlhbHMoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgaW5kZXggSUQgZXhpc3RzLCBlbnN1cmUgZXhwZXJpbWVudGVyIHVzZXIgSUQgZXhpc3RzLCB1cHBlcmNhc2UgaW5pdGlhbHMgb3IgP1xuICAgICAgICB2YXIgbGluZSwgZXhwZXJpbWVudGVyO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgoZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1tsaW5lLmV4cGVyaW1lbnRlcl0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cGVyaW1lbnRlci5pbml0aWFscy50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZExpbmVNb2RpZmljYXRpb24oaW5kZXg6c3RyaW5nKTpudW1iZXIge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5tb2RpZmllZC50aW1lO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgaGVhZGVycyBhbG9uZyB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUhlYWRlclNwZWMoKTpEYXRhR3JpZEhlYWRlclNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMSwgJ2hMaW5lc05hbWUnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTmFtZScsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZExpbmVOYW1lIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyLCAnaExpbmVzU3RyYWluJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1N0cmFpbicsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZFN0cmFpbk5hbWUsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDMsICdoTGluZXNDYXJib24nLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ2FyYm9uIFNvdXJjZShzKScsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZENhcmJvblNvdXJjZSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNCwgJ2hMaW5lc0xhYmVsaW5nJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhYmVsaW5nJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQ2FyYm9uU291cmNlTGFiZWxpbmcsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDUsICdoTGluZXNDYXJib25CYWxhbmNlJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NhcmJvbiBCYWxhbmNlJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU5hbWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg2ICsgaW5kZXgsICdoTGluZXNNZXRhJyArIGlkLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiBtZFR5cGUubmFtZSxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5tYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg2ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCwgJ2hMaW5lc0V4cGVyaW1lbnRlcicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdFeHBlcmltZW50ZXInLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsICdoTGluZXNNb2RpZmllZCcsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU1vZGlmaWNhdGlvbixcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFIZWFkZXJzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBtYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQ6c3RyaW5nKSB7XG4gICAgICAgIHJldHVybiAoaTpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpXTtcbiAgICAgICAgICAgIGlmIChsaW5lICYmIGxpbmUubWV0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsaW5lLm1ldGFbaWRdIHx8ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY29sc3BhbiB2YWx1ZSBmb3IgYWxsIHRoZSBjZWxscyB0aGF0IGFyZSBub3QgJ2NhcmJvbiBzb3VyY2UnIG9yICdsYWJlbGluZydcbiAgICAvLyBpcyBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGNhcmJvbiBzb3VyY2VzIGZvciB0aGUgcmVzcGVjdGl2ZSByZWNvcmQuXG4gICAgLy8gU3BlY2lmaWNhbGx5LCBpdCdzIGVpdGhlciB0aGUgbnVtYmVyIG9mIGNhcmJvbiBzb3VyY2VzLCBvciAxLCB3aGljaGV2ZXIgaXMgaGlnaGVyLlxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCkge1xuICAgICAgICByZXR1cm4gKEVERERhdGEuTGluZXNbaW5kZXhdLmNhcmJvbiB8fCBbXSkubGVuZ3RoIHx8IDE7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUxpbmVOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbGluZUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdsaW5lJyArIGlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogW1xuICAgICAgICAgICAgICAgICAgICAnPGEgaHJlZj1cIiNlZGl0bGluZVwiIGNsYXNzPVwibGluZS1lZGl0LWxpbmtcIj5FZGl0IExpbmU8L2E+JyxcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2xpbmVJZD0nICsgaW5kZXggKyAnXCI+RXhwb3J0IERhdGEgYXMgQ1NWL2V0YzwvYT4nXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBsaW5lLm5hbWUgKyAobGluZS5jdHJsID8gJzxiIGNsYXNzPVwiaXNjb250cm9sZGF0YVwiPkM8L2I+JyA6ICcnKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlU3RyYWluTmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBjb250ZW50ID0gW107XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgY29udGVudCA9IGxpbmUuc3RyYWluLm1hcCgoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc3RyYWluID0gRURERGF0YS5TdHJhaW5zW2lkXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gWyAnPGEgaHJlZj1cIicsIHN0cmFpbi5yZWdpc3RyeV91cmwsICdcIj4nLCBzdHJhaW4ubmFtZSwgJzwvYT4nIF0uam9pbignJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnQuam9pbignOyAnKSB8fCAnLS0nXG4gICAgICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDYXJib25Tb3VyY2VDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgc3RyaW5ncyA9IFsnLS0nXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5ncyA9IGxpbmUuY2FyYm9uLm1hcCgoaWQpID0+IHsgcmV0dXJuIEVERERhdGEuQ1NvdXJjZXNbaWRdLm5hbWU7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmdzLm1hcCgobmFtZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwgeyAnY29udGVudFN0cmluZyc6IG5hbWUgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNhcmJvblNvdXJjZUxhYmVsaW5nQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIHN0cmluZ3MgPSBbJy0tJ107XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuY2FyYm9uICYmIGxpbmUuY2FyYm9uLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHN0cmluZ3MgPSBsaW5lLmNhcmJvbi5tYXAoKGlkKSA9PiB7IHJldHVybiBFREREYXRhLkNTb3VyY2VzW2lkXS5sYWJlbGluZzsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZ3MubWFwKChsYWJlbGluZykgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwgeyAnY29udGVudFN0cmluZyc6IGxhYmVsaW5nIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnbWluV2lkdGgnOiAyMDBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIGV4cCwgY29udGVudDtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Vc2VycyAmJiAoZXhwID0gRURERGF0YS5Vc2Vyc1tsaW5lLmV4cGVyaW1lbnRlcl0pKSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGV4cC5pbml0aWFscztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnQgfHwgJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyhFREREYXRhLkxpbmVzW2luZGV4XS5tb2RpZmllZC50aW1lKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIG1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbnRlbnRTdHIgPSAnJywgbGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdLCB0eXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIGlmIChsaW5lICYmIHR5cGUgJiYgbGluZS5tZXRhICYmIChjb250ZW50U3RyID0gbGluZS5tZXRhW2lkXSB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50U3RyID0gWyB0eXBlLnByZSB8fCAnJywgY29udGVudFN0ciwgdHlwZS5wb3N0Zml4IHx8ICcnIF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudFN0clxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgbWV0YURhdGFDb2xzOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgcmlnaHRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdO1xuICAgICAgICAvLyBhZGQgY2xpY2sgaGFuZGxlciBmb3IgbWVudSBvbiBsaW5lIG5hbWUgY2VsbHNcbiAgICAgICAgJCh0aGlzLnRhYmxlRWxlbWVudCkub24oJ2NsaWNrJywgJ2EubGluZS1lZGl0LWxpbmsnLCAoZXYpID0+IHtcbiAgICAgICAgICAgIFN0dWR5RC5lZGl0TGluZSgkKGV2LnRhcmdldCkuY2xvc2VzdCgnLnBvcHVwY2VsbCcpLmZpbmQoJ2lucHV0JykudmFsKCkpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgbGVmdFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIHRoaXMuZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiwgdGhpcy5nZW5lcmF0ZVN0cmFpbk5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDMsIHRoaXMuZ2VuZXJhdGVDYXJib25Tb3VyY2VDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDQsIHRoaXMuZ2VuZXJhdGVDYXJib25Tb3VyY2VMYWJlbGluZ0NlbGxzKSxcbiAgICAgICAgICAgIC8vIFRoZSBDYXJib24gQmFsYW5jZSBjZWxscyBhcmUgcG9wdWxhdGVkIGJ5IGEgY2FsbGJhY2ssIHRyaWdnZXJlZCB3aGVuIGZpcnN0IGRpc3BsYXllZFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg1LCB0aGlzLmdlbmVyYXRlQ2FyYm9uQmFsYW5jZUJsYW5rQ2VsbHMpXG4gICAgICAgIF07XG4gICAgICAgIG1ldGFEYXRhQ29scyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNiArIGluZGV4LCB0aGlzLm1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNiArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVFeHBlcmltZW50ZXJJbml0aWFsc0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNyArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUNvbHMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICB2YXIgdG9wU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMaW5lIE5hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdTdHJhaW4nKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnQ2FyYm9uIFNvdXJjZShzKScpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYWJlbGluZycpLFxuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlQ29sID0gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDYXJib24gQmFsYW5jZScsIHtcbiAgICAgICAgICAgICAgICAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSwgICAgLy8gSGFzIGl0cyBvd24gaGVhZGVyIHdpZGdldFxuICAgICAgICAgICAgICAgICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdyZXZlYWxlZENhbGxiYWNrJzogU3R1ZHlELmNhcmJvbkJhbGFuY2VDb2x1bW5SZXZlYWxlZENhbGxiYWNrXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHZhciBtZXRhRGF0YUNvbEdyb3VwczpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgICAgICBtZXRhRGF0YUNvbEdyb3VwcyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKG1kVHlwZS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGJvdHRvbVNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRXhwZXJpbWVudGVyJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFzdCBNb2RpZmllZCcsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gdG9wU2VjdGlvbi5jb25jYXQobWV0YURhdGFDb2xHcm91cHMsIGJvdHRvbVNlY3Rpb24pO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGdyb3VwcyB0aGF0IHJvd3MgY2FuIGJlIGdhdGhlcmVkIGludG9cbiAgICBkZWZpbmVSb3dHcm91cFNwZWMoKTphbnkge1xuXG4gICAgICAgIHZhciByb3dHcm91cFNwZWMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCB0aGlzLmdyb3VwSURzSW5PcmRlci5sZW5ndGg7IHgrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gdGhpcy5ncm91cElEc0luT3JkZXJbeF07XG5cbiAgICAgICAgICAgIHZhciByb3dHcm91cFNwZWNFbnRyeTphbnkgPSB7ICAgIC8vIEdyb3VwcyBhcmUgbnVtYmVyZWQgc3RhcnRpbmcgZnJvbSAwXG4gICAgICAgICAgICAgICAgbmFtZTogdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tpZF1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByb3dHcm91cFNwZWMucHVzaChyb3dHcm91cFNwZWNFbnRyeSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcm93R3JvdXBTcGVjO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZHlMaW5lc1RhYmxlXCIpO1xuICAgIH1cblxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzIChudW1iZXJzLCBub3Qgc3RyaW5ncyksIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHJlY29yZHMgaW4gdGhlXG4gICAgLy8gZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG4gICAgZ2V0UmVjb3JkSURzKCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoRURERGF0YS5MaW5lcyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzLiBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmVcbiAgICAvLyB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzdWJzdHJpbmcgc2VhcmNoaW5nXG4gICAgICAgIHZhciBzZWFyY2hMaW5lc1dpZGdldCA9IG5ldyBER0xpbmVzU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIExpbmVzJywgMzAsIGZhbHNlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VhcmNoTGluZXNXaWRnZXQpO1xuICAgICAgICAvLyBBIFwiQ2FyYm9uIEJhbGFuY2VcIiBjaGVja2JveFxuICAgICAgICB2YXIgc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQgPSBuZXcgREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNob3dDYXJib25CYWxhbmNlV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQpO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQgPSBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldDtcbiAgICAgICAgLy8gQSBcInNlbGVjdCBhbGxcIiBidXR0b25cbiAgICAgICAgdmFyIHNlbGVjdEFsbFdpZGdldCA9IG5ldyBER1NlbGVjdEFsbFdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNlbGVjdEFsbFdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlbGVjdEFsbFdpZGdldCk7XG5cbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXlcbiAgICAvLyB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuIEVtcHR5IGFycmF5ID0gT0suXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIExpbmVzXG4gICAgICAgIHZhciBncm91cExpbmVzV2lkZ2V0ID0gbmV3IERHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChncm91cExpbmVzV2lkZ2V0KTtcbiAgICAgICAgdmFyIGRpc2FibGVkTGluZXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZExpbmVzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZGlzYWJsZWRMaW5lc1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlICdhY3Rpb24gcGFuZWxzJyBmb3IgdGhlIExpbmVzIGFuZCBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIGxpbmVzVGFibGUgPSB0aGlzLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICAkKGxpbmVzVGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gU3R1ZHlELnF1ZXVlTGluZXNBY3Rpb25QYW5lbFNob3coKSk7XG5cbiAgICAgICAgLy8gVGhpcyBjYWxscyBkb3duIGludG8gdGhlIGluc3RhbnRpYXRlZCB3aWRnZXQgYW5kIGFsdGVycyBpdHMgc3R5bGluZyxcbiAgICAgICAgLy8gc28gd2UgbmVlZCB0byBkbyBpdCBhZnRlciB0aGUgdGFibGUgaGFzIGJlZW4gY3JlYXRlZC5cbiAgICAgICAgdGhpcy5lbmFibGVDYXJib25CYWxhbmNlV2lkZ2V0KGZhbHNlKTtcblxuICAgICAgICAvLyBXaXJlLWluIG91ciBjdXN0b20gZWRpdCBmaWVsZHMgZm9yIHRoZSBTdHVkaWVzIHBhZ2UsIGFuZCBjb250aW51ZSB3aXRoIGdlbmVyYWwgaW5pdFxuICAgICAgICBTdHVkeUQucHJlcGFyZUFmdGVyTGluZXNUYWJsZSgpO1xuICAgIH1cbn1cblxuXG5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgTGluZXMgdGhhdCBhcmUgbWFya2VkIGFzIGRpc2FibGVkLlxuY2xhc3MgREdEaXNhYmxlZExpbmVzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydTaG93RExpbmVzQ0InK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgICQoY2IpLmNsaWNrKCAoZSkgPT4gdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmNsaWNrZWRPcHRpb25XaWRnZXQoZSkgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnU2hvdyBEaXNhYmxlZCcsIGNiSUQpOztcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIGNoZWNrZWQ6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAoY2hlY2tlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IHJvd0lEcy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gcm93SURzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNbaWRdLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkSURzLnB1c2goaWQpOyAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZElEcztcbiAgICB9XG5cblxuICAgIGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOmFueSwgcm93SUQ6c3RyaW5nKTphbnkge1xuICAgICAgICBpZiAoIUVERERhdGEuTGluZXNbcm93SURdLmFjdGl2ZSkge1xuICAgICAgICAgICAgJC5lYWNoKGRhdGFSb3dPYmplY3RzLCAoeCwgcm93KSA9PiAkKHJvdy5nZXRFbGVtZW50KCkpLmFkZENsYXNzKCdkaXNhYmxlZFJlY29yZCcpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbi8vIEEgd2lkZ2V0IHRvIHRvZ2dsZSByZXBsaWNhdGUgZ3JvdXBpbmcgb24gYW5kIG9mZlxuY2xhc3MgREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBwVGhpcyA9IHRoaXM7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnR3JvdXBTdHVkeVJlcGxpY2F0ZXNDQicrdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgJChjYikuY2xpY2soXG4gICAgICAgICAgICBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBUaGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHBUaGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHVybk9uUm93R3JvdXBpbmcoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwVGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnR1cm5PZmZSb3dHcm91cGluZygpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ0dyb3VwIFJlcGxpY2F0ZXMnLCBjYklEKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG59XG5cblxuXG4vLyBUaGlzIGlzIGEgRGF0YUdyaWRIZWFkZXJXaWRnZXQgZGVyaXZlZCBmcm9tIERHU2VhcmNoV2lkZ2V0LiBJdCdzIGEgc2VhcmNoIGZpZWxkIHRoYXQgb2ZmZXJzXG4vLyBvcHRpb25zIGZvciBhZGRpdGlvbmFsIGRhdGEgdHlwZXMsIHF1ZXJ5aW5nIHRoZSBzZXJ2ZXIgZm9yIHJlc3VsdHMuXG5jbGFzcyBER0xpbmVzU2VhcmNoV2lkZ2V0IGV4dGVuZHMgREdTZWFyY2hXaWRnZXQge1xuXG4gICAgc2VhcmNoRGlzY2xvc3VyZUVsZW1lbnQ6YW55O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OmFueSwgZGF0YUdyaWRTcGVjOmFueSwgcGxhY2VIb2xkZXI6c3RyaW5nLCBzaXplOm51bWJlcixcbiAgICAgICAgICAgIGdldHNGb2N1czpib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYywgcGxhY2VIb2xkZXIsIHNpemUsIGdldHNGb2N1cyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9ucyB3aGVuIGNyZWF0aW5nIGlucHV0XG4gICAgLy8gZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBzdXBlci5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC4gSWYgdGhlIGVsZW1lbnRzIGhhdmVcbiAgICAvLyBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOmFueSwgdW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cygpKSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICB9XG59XG5cblxuXG4vLyBBIGhlYWRlciB3aWRnZXQgdG8gcHJlcGFyZSB0aGUgQ2FyYm9uIEJhbGFuY2UgdGFibGUgY2VsbHMsIGFuZCBzaG93IG9yIGhpZGUgdGhlbS5cbmNsYXNzIERHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZEhlYWRlcldpZGdldCB7XG5cbiAgICBjaGVja0JveEVsZW1lbnQ6YW55O1xuICAgIGxhYmVsRWxlbWVudDphbnk7XG4gICAgaGlnaGxpZ2h0ZWQ6Ym9vbGVhbjtcbiAgICBjaGVja2JveEVuYWJsZWQ6Ym9vbGVhbjtcblxuICAgIC8vIHN0b3JlIG1vcmUgc3BlY2lmaWMgdHlwZSBvZiBzcGVjIHRvIGdldCB0byBjYXJib25CYWxhbmNlQ29sIGxhdGVyXG4gICAgcHJpdmF0ZSBfbGluZVNwZWM6RGF0YUdyaWRTcGVjTGluZXM7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OkRhdGFHcmlkLCBkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5jaGVja2JveEVuYWJsZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmhpZ2hsaWdodGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2xpbmVTcGVjID0gZGF0YUdyaWRTcGVjO1xuICAgIH1cbiAgICBcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCArICdDYXJCYWwnICsgdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgY2IuY2xhc3NOYW1lID0gJ3RhYmxlQ29udHJvbCc7XG4gICAgICAgICQoY2IpLmNsaWNrKChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZhdGVDYXJib25CYWxhbmNlKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBsYWJlbDpIVE1MRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdDYXJib24gQmFsYW5jZScsIGNiSUQpO1xuXG4gICAgICAgIHZhciBzcGFuOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICAgIHNwYW4uY2xhc3NOYW1lID0gJ3RhYmxlQ29udHJvbCc7XG4gICAgICAgIHNwYW4uYXBwZW5kQ2hpbGQoY2IpO1xuICAgICAgICBzcGFuLmFwcGVuZENoaWxkKGxhYmVsKTtcblxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IGxhYmVsO1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBzcGFuO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICB9XG5cbiAgICBoaWdobGlnaHQoaDpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5oaWdobGlnaHRlZCA9IGg7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrYm94RW5hYmxlZCkge1xuICAgICAgICAgICAgaWYgKGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhYmVsRWxlbWVudC5zdHlsZS5jb2xvciA9ICdyZWQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhYmVsRWxlbWVudC5zdHlsZS5jb2xvciA9ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZW5hYmxlKGg6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2hlY2tib3hFbmFibGVkID0gaDtcbiAgICAgICAgaWYgKGgpIHtcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0KHRoaXMuaGlnaGxpZ2h0ZWQpO1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAnZ3JheSc7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFjdGl2YXRlQ2FyYm9uQmFsYW5jZSgpOnZvaWQge1xuICAgICAgICB2YXIgdWk6RnVsbFN0dWR5QmlvbWFzc1VJLFxuICAgICAgICAgICAgY2FsbGJhY2s6RnVsbFN0dWR5QmlvbWFzc1VJUmVzdWx0c0NhbGxiYWNrO1xuICAgICAgICBjYWxsYmFjayA9IChlcnJvcjpzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwSUQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBGaWxlbmFtZT86c3RyaW5nLFxuICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzcz86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBTdHVkeUQubWV0YWJvbGljTWFwSUQgPSBtZXRhYm9saWNNYXBJRDtcbiAgICAgICAgICAgICAgICBTdHVkeUQubWV0YWJvbGljTWFwTmFtZSA9IG1ldGFib2xpY01hcEZpbGVuYW1lO1xuICAgICAgICAgICAgICAgIFN0dWR5RC5iaW9tYXNzQ2FsY3VsYXRpb24gPSBmaW5hbEJpb21hc3M7XG4gICAgICAgICAgICAgICAgU3R1ZHlELm9uQ2hhbmdlZE1ldGFib2xpY01hcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5zaG93Q29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBnZXQgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIHRvIG11bHRpcGx5IGFnYWluc3QgT0QuXG4gICAgICAgICAgICAvLyBIYXZlIHRoZXkgc2V0IHRoaXMgdXAgeWV0P1xuICAgICAgICAgICAgaWYgKCFTdHVkeUQuYmlvbWFzc0NhbGN1bGF0aW9uIHx8IFN0dWR5RC5iaW9tYXNzQ2FsY3VsYXRpb24gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIC8vIE11c3Qgc2V0dXAgdGhlIGJpb21hc3NcbiAgICAgICAgICAgICAgICB1aSA9IG5ldyBGdWxsU3R1ZHlCaW9tYXNzVUkoY2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3Quc2hvd0NvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5oaWRlQ29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuY2xhc3MgRGF0YUdyaWRBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZCB7XG5cblxuICAgIHNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQ6Ym9vbGVhbjtcbiAgICBncmFwaFJlZnJlc2hUaW1lcklEOmFueTtcbiAgICAvLyBSaWdodCBub3cgd2UncmUgbm90IGFjdHVhbGx5IHVzaW5nIHRoZSBjb250ZW50cyBvZiB0aGlzIGFycmF5LCBqdXN0XG4gICAgLy8gY2hlY2tpbmcgdG8gc2VlIGlmIGl0J3Mgbm9uLWVtcHR5LlxuICAgIHJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZDpudW1iZXJbXTtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQgPSBbXTtcbiAgICAgICAgdGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkID0gZmFsc2U7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkU3BlYyk7XG4gICAgfVxuXG5cbiAgICBpbnZhbGlkYXRlQXNzYXlSZWNvcmRzKHJlY29yZHM6bnVtYmVyW10pOnZvaWQge1xuICAgICAgICB0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZCA9IHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmNvbmNhdChyZWNvcmRzKTtcbiAgICAgICAgaWYgKCF0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGNsaWNrZWREaXNjbG9zZShkaXNjbG9zZTpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdmFyIHNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzID0gdGhpcy5nZXRTcGVjKCk7XG4gICAgICAgIHZhciB0YWJsZSA9IHNwZWMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgIHZhciBkaXYgPSBzcGVjLnVuZGlzY2xvc2VkU2VjdGlvbkRpdjtcbiAgICAgICAgaWYgKCFkaXYgfHwgIXRhYmxlKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAoZGlzY2xvc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIGEgdGFibGUuIFRoaXMgYnJlYWtzIHVwXG4gICAgICAgICAgICAvLyB0YWJsZSByZWNyZWF0aW9uIGludG8gc2VwYXJhdGUgZXZlbnRzLCBzbyB0aGUgYnJvd3NlciBjYW4gdXBkYXRlIFVJLlxuICAgICAgICAgICAgaWYgKHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy50cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCgpLCAxMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgdHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKTp2b2lkIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGV4ZWN1dGUgcmVjb3JkcyByZWZyZXNoOiAnICsgZSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgX2NhbmNlbEdyYXBoKCkge1xuICAgICAgICBpZiAodGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQ7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgdGhlIGdyYXBoLlxuICAgIHF1ZXVlR3JhcGhSZW1ha2UoKSB7XG4gICAgICAgIHRoaXMuX2NhbmNlbEdyYXBoKCk7XG4gICAgICAgIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQoICgpID0+IHRoaXMucmVtYWtlR3JhcGhBcmVhKCksIDEwMCApO1xuICAgIH1cblxuXG4gICAgcmVtYWtlR3JhcGhBcmVhKCkge1xuICAgICAgICB2YXIgc3BlYzpEYXRhR3JpZFNwZWNBc3NheXMgPSB0aGlzLmdldFNwZWMoKSwgZywgY29udmVydCwgY29tcGFyZTtcbiAgICAgICAgLy8gaWYgY2FsbGVkIGRpcmVjdGx5LCBjYW5jZWwgYW55IHBlbmRpbmcgcmVxdWVzdHMgaW4gXCJxdWV1ZVwiXG4gICAgICAgIHRoaXMuX2NhbmNlbEdyYXBoKCk7XG5cbiAgICAgICAgaWYgKCFTdHVkeURHcmFwaGluZyB8fCAhc3BlYyB8fCAhc3BlYy5ncmFwaE9iamVjdCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZyA9IHNwZWMuZ3JhcGhPYmplY3Q7XG4gICAgICAgIGcuY2xlYXJBbGxTZXRzKCk7XG5cbiAgICAgICAgLy8gZnVuY3Rpb24gY29udmVydHMgZG93bmxvYWRlZCBkYXRhIHBvaW50IHRvIGZvcm0gdXNhYmxlIGJ5IGZsb3RcbiAgICAgICAgLy8gRklYTUUgYXNzdW1lcyAoeDAsIHkwKSBwb2ludHMgb25seVxuICAgICAgICBjb252ZXJ0ID0gKGQpID0+IHsgcmV0dXJuIFtbIGRbMF1bMF0sIGRbMV1bMF0gXV07IH07XG5cbiAgICAgICAgLy8gZnVuY3Rpb24gY29tcGFyaW5nIHR3byBwb2ludHMsIHRvIHNvcnQgZGF0YSBzZW50IHRvIGZsb3RcbiAgICAgICAgY29tcGFyZSA9IChhLCBiKSA9PiB7IHJldHVybiBhWzBdIC0gYlswXTsgfTtcblxuICAgICAgICBzcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXk6YW55ID0gRURERGF0YS5Bc3NheXNbaWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgIGxpbmU6YW55ID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgIG1lYXN1cmVzO1xuICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgfHwgIWxpbmUuYWN0aXZlKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgbWVhc3VyZXMgPSBhc3NheS5tZWFzdXJlcyB8fCBbXTtcbiAgICAgICAgICAgIG1lYXN1cmVzLmZvckVhY2goKG0pID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbV0sIHNldDtcbiAgICAgICAgICAgICAgICBzZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICdsYWJlbCc6ICdkdCcgKyBtLFxuICAgICAgICAgICAgICAgICAgICAnbWVhc3VyZW1lbnRuYW1lJzogVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb05hbWUobSksXG4gICAgICAgICAgICAgICAgICAgICduYW1lJzogYXNzYXkubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FpZCc6IGlkLFxuICAgICAgICAgICAgICAgICAgICAnbXRpZCc6IG1lYXN1cmUudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgJ3VuaXRzJzogVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb1VuaXRzKG0pLFxuICAgICAgICAgICAgICAgICAgICAnZGF0YSc6ICQubWFwKG1lYXN1cmUudmFsdWVzLCBjb252ZXJ0KS5zb3J0KGNvbXBhcmUpXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5jb250cm9sKSBzZXQuaXNjb250cm9sID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBnLmFkZE5ld1NldChzZXQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGcuZHJhd1NldHMoKTtcbiAgICB9XG5cblxuICAgIC8vIE5vdGU6IEN1cnJlbnRseSBub3QgYmVpbmcgY2FsbGVkLlxuICAgIHJlc2l6ZUdyYXBoKGcpIHtcbiAgICAgICAgdmFyIHNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzID0gdGhpcy5nZXRTcGVjKCk7XG4gICAgICAgIHZhciBncmFwaE9iaiA9IHNwZWMuZ3JhcGhPYmplY3Q7XG4gICAgICAgIGlmICghZ3JhcGhPYmopIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWdyYXBoT2JqLnBsb3RPYmplY3QpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBncmFwaE9iai5wbG90T2JqZWN0LnJlc2l6ZSgpO1xuICAgICAgICBncmFwaE9iai5wbG90T2JqZWN0LnNldHVwR3JpZCgpO1xuICAgICAgICBncmFwaE9iai5wbG90T2JqZWN0LmRyYXcoKTtcbiAgICB9XG59XG5cblxuXG4vLyBUaGUgc3BlYyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBEYXRhR3JpZCB0byBjcmVhdGUgdGhlIEFzc2F5cyB0YWJsZShzKVxuY2xhc3MgRGF0YUdyaWRTcGVjQXNzYXlzIGV4dGVuZHMgRGF0YUdyaWRTcGVjQmFzZSB7XG5cbiAgICBwcm90b2NvbElEOmFueTtcbiAgICBwcm90b2NvbE5hbWU6c3RyaW5nO1xuICAgIGFzc2F5SURzSW5Qcm90b2NvbDpudW1iZXJbXTtcbiAgICBtZXRhRGF0YUlEc1VzZWRJbkFzc2F5czphbnk7XG4gICAgbWF4aW11bVhWYWx1ZUluRGF0YTpudW1iZXI7XG5cbiAgICB1bmRpc2Nsb3NlZFNlY3Rpb25EaXY6YW55O1xuXG4gICAgbWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjOkRhdGFHcmlkSGVhZGVyU3BlYztcbiAgICBncmFwaEFyZWFIZWFkZXJTcGVjOkRhdGFHcmlkSGVhZGVyU3BlYztcblxuICAgIGdyYXBoT2JqZWN0OmFueTtcblxuXG4gICAgY29uc3RydWN0b3IocHJvdG9jb2xJRCkge1xuICAgICAgICB0aGlzLnByb3RvY29sSUQgPSBwcm90b2NvbElEO1xuICAgICAgICB0aGlzLnByb3RvY29sTmFtZSA9IEVERERhdGEuUHJvdG9jb2xzW3Byb3RvY29sSURdLm5hbWU7XG4gICAgICAgIHRoaXMuZ3JhcGhPYmplY3QgPSBudWxsO1xuICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyA9IG51bGw7XG4gICAgICAgIHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYyA9IG51bGw7XG4gICAgICAgIHRoaXMucmVmcmVzaElETGlzdCgpO1xuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIHRoaXMuZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCk7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgfVxuXG5cbiAgICByZWZyZXNoSURMaXN0KCk6dm9pZCB7XG4gICAgICAgIC8vIEZpbmQgb3V0IHdoaWNoIHByb3RvY29scyBoYXZlIGFzc2F5cyB3aXRoIG1lYXN1cmVtZW50cyAtIGRpc2FibGVkIG9yIG5vXG4gICAgICAgIHRoaXMuYXNzYXlJRHNJblByb3RvY29sID0gW107XG4gICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQ6c3RyaW5nLCBhc3NheTpBc3NheVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZTpMaW5lUmVjb3JkO1xuICAgICAgICAgICAgaWYgKHRoaXMucHJvdG9jb2xJRCAhPT0gYXNzYXkucGlkKSB7XG4gICAgICAgICAgICAgICAgLy8gc2tpcCBhc3NheXMgZm9yIG90aGVyIHByb3RvY29sc1xuICAgICAgICAgICAgfSBlbHNlIGlmICghKGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0pIHx8ICFsaW5lLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIC8vIHNraXAgYXNzYXlzIHdpdGhvdXQgYSB2YWxpZCBsaW5lIG9yIHdpdGggYSBkaXNhYmxlZCBsaW5lXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlJRHNJblByb3RvY29sLnB1c2goYXNzYXkuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycywgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGUgZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG4gICAgZ2V0UmVjb3JkSURzKCk6YW55W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5hc3NheUlEc0luUHJvdG9jb2w7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGFuIG92ZXJyaWRlLiAgQ2FsbGVkIHdoZW4gYSBkYXRhIHJlc3QgaXMgdHJpZ2dlcmVkLCBidXQgYmVmb3JlIHRoZSB0YWJsZSByb3dzIGFyZVxuICAgIC8vIHJlYnVpbHQuXG4gICAgb25EYXRhUmVzZXQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIGlmICh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyAmJiB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KSB7XG4gICAgICAgICAgICAkKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpLmNoaWxkcmVuKCc6Zmlyc3QnKS50ZXh0KFxuICAgICAgICAgICAgICAgICAgICAnTWVhc3VyaW5nIFRpbWVzIChSYW5nZSAwIHRvICcgKyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEgKyAnKScpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlXG4gICAgLy8gY29udGVudCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgZ2V0VGFibGVFbGVtZW50KCkge1xuICAgICAgICB2YXIgc2VjdGlvbiwgcHJvdG9jb2xEaXYsIHRpdGxlRGl2LCB0aXRsZUxpbmssIHRhYmxlLFxuICAgICAgICAgICAgcCA9IHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgIHRhYmxlSUQ6c3RyaW5nID0gJ3BybycgKyBwICsgJ2Fzc2F5c3RhYmxlJztcbiAgICAgICAgLy8gSWYgd2UgY2FuJ3QgZmluZCBhIHRhYmxlLCB3ZSBpbnNlcnQgYSBjbGljay10by1kaXNjbG9zZSBkaXYsIGFuZCB0aGVuIGEgdGFibGUgZGlyZWN0bHlcbiAgICAgICAgLy8gYWZ0ZXIgaXQuXG4gICAgICAgIGlmICgkKCcjJyArIHRhYmxlSUQpLnNpemUoKSA9PT0gMCkge1xuICAgICAgICAgICAgc2VjdGlvbiA9ICQoJyNhc3NheXNTZWN0aW9uJyk7XG4gICAgICAgICAgICBwcm90b2NvbERpdiA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2Rpc2Nsb3NlIGRpc2Nsb3NlSGlkZScpLmFwcGVuZFRvKHNlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy51bmRpc2Nsb3NlZFNlY3Rpb25EaXYgPSBwcm90b2NvbERpdlswXTtcbiAgICAgICAgICAgIHRpdGxlRGl2ID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnc2VjdGlvbkNoYXB0ZXInKS5hcHBlbmRUbyhwcm90b2NvbERpdik7XG4gICAgICAgICAgICB0aXRsZUxpbmsgPSAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnZGlzY2xvc2VMaW5rJylcbiAgICAgICAgICAgICAgICAgICAgLnRleHQodGhpcy5wcm90b2NvbE5hbWUgKyAnIEFzc2F5cycpXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aXRsZURpdik7XG4gICAgICAgICAgICB0YWJsZSA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRhYmxlXCIpKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignaWQnLCB0YWJsZUlEKS5hZGRDbGFzcygnZGlzY2xvc2VCb2R5JylcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKHByb3RvY29sRGl2KTtcbiAgICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgYWN0aW9ucyBwYW5lbCByZW1haW5zIGF0IHRoZSBib3R0b20uXG4gICAgICAgICAgICAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKS5hcHBlbmRUbyhzZWN0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGFibGVJRCk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnYXNzYXlzJyt0aGlzLnByb3RvY29sSUQsIHtcbiAgICAgICAgICAgICdkZWZhdWx0U29ydCc6IDFcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBmaW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cyA9IFtdO1xuICAgICAgICB0aGlzLmdldFJlY29yZElEcygpLmZvckVhY2goKGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgJC5lYWNoKGFzc2F5Lm1ldGEgfHwge30sIChtZXRhSWQpID0+IHsgc2Vlbkhhc2hbbWV0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgW10ucHVzaC5hcHBseSh0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLCBPYmplY3Qua2V5cyhzZWVuSGFzaCkpO1xuICAgIH1cblxuXG4gICAgZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTp2b2lkIHtcbiAgICAgICAgdmFyIG1heEZvckFsbDpudW1iZXIgPSAwO1xuICAgICAgICAvLyByZWR1Y2UgdG8gZmluZCBoaWdoZXN0IHZhbHVlIGFjcm9zcyBhbGwgcmVjb3Jkc1xuICAgICAgICBtYXhGb3JBbGwgPSB0aGlzLmdldFJlY29yZElEcygpLnJlZHVjZSgocHJldjpudW1iZXIsIGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdLCBtZWFzdXJlcywgbWF4Rm9yUmVjb3JkO1xuICAgICAgICAgICAgbWVhc3VyZXMgPSBhc3NheS5tZWFzdXJlcyB8fCBbXTtcbiAgICAgICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCBtZWFzdXJlc1xuICAgICAgICAgICAgbWF4Rm9yUmVjb3JkID0gbWVhc3VyZXMucmVkdWNlKChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxvb2t1cDphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlOmFueSA9IGxvb2t1cFttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlO1xuICAgICAgICAgICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCBkYXRhIGluIG1lYXN1cmVtZW50XG4gICAgICAgICAgICAgICAgbWF4Rm9yTWVhc3VyZSA9IChtZWFzdXJlLnZhbHVlcyB8fCBbXSkucmVkdWNlKChwcmV2Om51bWJlciwgcG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHBvaW50WzBdWzBdKTtcbiAgICAgICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgbWF4Rm9yTWVhc3VyZSk7XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JSZWNvcmQpO1xuICAgICAgICB9LCAwKTtcbiAgICAgICAgLy8gQW55dGhpbmcgYWJvdmUgMCBpcyBhY2NlcHRhYmxlLCBidXQgMCB3aWxsIGRlZmF1bHQgaW5zdGVhZCB0byAxLlxuICAgICAgICB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEgPSBtYXhGb3JBbGwgfHwgMTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TmFtZShpbmRleDphbnkpOnN0cmluZyB7XG4gICAgICAgIC8vIEluIGFuIG9sZCB0eXBpY2FsIEVERERhdGEuQXNzYXlzIHJlY29yZCB0aGlzIHN0cmluZyBpcyBjdXJyZW50bHkgcHJlLWFzc2VtYmxlZCBhbmQgc3RvcmVkXG4gICAgICAgIC8vIGluICdmbicuIEJ1dCB3ZSdyZSBwaGFzaW5nIHRoYXQgb3V0LlxuICAgICAgICB2YXIgYXNzYXksIGxpbmU7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtsaW5lLm4sIHRoaXMucHJvdG9jb2xOYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGFzc2F5LCBleHBlcmltZW50ZXI7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbYXNzYXkuZXhwXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwZXJpbWVudGVyLmluaXRpYWxzLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG4gICAgXG4gICAgXG4gICAgcHJpdmF0ZSBsb2FkQXNzYXlNb2RpZmljYXRpb24oaW5kZXg6YW55KTpudW1iZXIge1xuICAgICAgICByZXR1cm4gRURERGF0YS5Bc3NheXNbaW5kZXhdLm1vZDtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBoZWFkZXJzIGFsb25nIHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgLy8gbWFwIGFsbCBtZXRhZGF0YSBJRHMgdG8gSGVhZGVyU3BlYyBvYmplY3RzXG4gICAgICAgIHZhciBtZXRhRGF0YUhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIgKyBpbmRleCwgJ2hBc3NheXNNZXRhJyt0aGlzLnByb3RvY29sSUQrJ2lkJyArIGlkLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiBtZFR5cGUubmFtZSxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMiwgXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYyA9IG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoOCArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgJ2hBc3NheXNHcmFwaCcgKyB0aGlzLnByb3RvY29sSUQsIHsgJ2NvbHNwYW4nOiA3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCB9KTtcblxuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMsXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoQXNzYXlzTmFtZScrdGhpcy5wcm90b2NvbElELCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTmFtZScsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsIFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRBc3NheU5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgPSBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDUgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICdoQXNzYXlzTVRpbWVzJyt0aGlzLnByb3RvY29sSUQsIHsgJ25hbWUnOiAnTWVhc3VyaW5nIFRpbWVzJywgJ2hlYWRlclJvdyc6IDIgfSk7XG5cbiAgICAgICAgdmFyIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzTU5hbWUnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7ICduYW1lJzogJ01lYXN1cmVtZW50JywgJ2hlYWRlclJvdyc6IDIgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDMgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c1VuaXRzJyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAgeyAnbmFtZSc6ICdVbml0cycsICdoZWFkZXJSb3cnOiAyIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg0ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNDb3VudCcgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHsgJ25hbWUnOiAnQ291bnQnLCAnaGVhZGVyUm93JzogMiB9KSxcbiAgICAgICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg2ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNFeHBlcmltZW50ZXInICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdFeHBlcmltZW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzTW9kaWZpZWQnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEFzc2F5TW9kaWZpY2F0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhSGVhZGVycywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoaSkgPT4ge1xuICAgICAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2ldO1xuICAgICAgICAgICAgaWYgKHJlY29yZCAmJiByZWNvcmQubWV0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQubWV0YVtpZF0gfHwgJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZSBjb2xzcGFuIHZhbHVlIGZvciBhbGwgdGhlIGNlbGxzIHRoYXQgYXJlIGFzc2F5LWxldmVsIChub3QgbWVhc3VyZW1lbnQtbGV2ZWwpIGlzIGJhc2VkIG9uXG4gICAgLy8gdGhlIG51bWJlciBvZiBtZWFzdXJlbWVudHMgZm9yIHRoZSByZXNwZWN0aXZlIHJlY29yZC4gU3BlY2lmaWNhbGx5LCBpdCdzIHRoZSBudW1iZXIgb2ZcbiAgICAvLyBtZXRhYm9saXRlIG1lYXN1cmVtZW50cywgcGx1cyAxIGlmIHRoZXJlIGFyZSB0cmFuc2NyaXB0b21pY3MgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmVcbiAgICAvLyBhcmUgcHJvdGVvbWljcyBtZWFzdXJlbWVudHMsIGFsbCBhZGRlZCB0b2dldGhlci4gIChPciAxLCB3aGljaGV2ZXIgaXMgaGlnaGVyLilcbiAgICBwcml2YXRlIHJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpOm51bWJlciB7XG4gICAgICAgIHZhciByZWMgPSBFREREYXRhLkFzc2F5c1tpbmRleF07XG4gICAgICAgIHZhciB2Om51bWJlciA9ICgocmVjLm1ldGFib2xpdGVzIHx8IFtdKS5sZW5ndGggK1xuICAgICAgICAgICAgICAgICAgICAgICAgKChyZWMudHJhbnNjcmlwdGlvbnMgfHwgW10pLmxlbmd0aCA/IDEgOiAwKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy5wcm90ZWlucyB8fCBbXSkubGVuZ3RoID8gMSA6IDApKSB8fCAxO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGxpbmUgPSBFREREYXRhLkxpbmVzW3JlY29yZC5saWRdLCBzaWRlTWVudUl0ZW1zID0gW1xuICAgICAgICAgICAgJzxhIGNsYXNzPVwiYXNzYXktZWRpdC1saW5rXCI+RWRpdCBBc3NheTwvYT4nLFxuICAgICAgICAgICAgJzxhIGNsYXNzPVwiYXNzYXktcmVsb2FkLWxpbmtcIj5SZWxvYWQgRGF0YTwvYT4nLFxuICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2Fzc2F5SWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIENTVi9ldGM8L2E+J1xuICAgICAgICBdO1xuICAgICAgICAvLyBUT0RPIHdlIHByb2JhYmx5IGRvbid0IHdhbnQgdG8gc3BlY2lhbC1jYXNlIGxpa2UgdGhpcyBieSBuYW1lXG4gICAgICAgIGlmIChncmlkU3BlYy5wcm90b2NvbE5hbWUgPT0gXCJUcmFuc2NyaXB0b21pY3NcIikge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcy5wdXNoKCc8YSBocmVmPVwiaW1wb3J0L3JuYXNlcS9lZGdlcHJvP2Fzc2F5PScraW5kZXgrJ1wiPkltcG9ydCBSTkEtc2VxIGRhdGEgZnJvbSBFREdFLXBybzwvYT4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdhc3NheUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdhc3NheScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IHNpZGVNZW51SXRlbXMsXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogW2xpbmUubmFtZSwgZ3JpZFNwZWMucHJvdG9jb2xOYW1lLCByZWNvcmQubmFtZV0uam9pbignLScpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbnRlbnRTdHIgPSAnJywgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5ICYmIHR5cGUgJiYgYXNzYXkubWV0YSAmJiAoY29udGVudFN0ciA9IGFzc2F5Lm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nLFxuICAgICAgICAgICAgb3B0OmFueSk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgY2VsbHMgPSBbXSxcbiAgICAgICAgICAgIGZhY3RvcnkgPSAoKTpEYXRhR3JpZERhdGFDZWxsID0+IG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCk7XG5cbiAgICAgICAgaWYgKChyZWNvcmQubWV0YWJvbGl0ZXMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgJ3Jvd3NwYW4nOiByZWNvcmQubWV0YWJvbGl0ZXMubGVuZ3RoIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udmVydCBJRHMgdG8gbWVhc3VyZW1lbnRzLCBzb3J0IGJ5IG5hbWUsIHRoZW4gY29udmVydCB0byBjZWxsIG9iamVjdHNcbiAgICAgICAgICAgICAgICBjZWxscyA9IHJlY29yZC5tZXRhYm9saXRlcy5tYXAob3B0Lm1ldGFib2xpdGVUb1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnNvcnQob3B0Lm1ldGFib2xpdGVWYWx1ZVNvcnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKG9wdC5tZXRhYm9saXRlVmFsdWVUb0NlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICgocmVjb3JkLmdlbmVyYWwgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgeyAncm93c3Bhbic6IHJlY29yZC5nZW5lcmFsLmxlbmd0aCB9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgSURzIHRvIG1lYXN1cmVtZW50cywgc29ydCBieSBuYW1lLCB0aGVuIGNvbnZlcnQgdG8gY2VsbCBvYmplY3RzXG4gICAgICAgICAgICAgICAgY2VsbHMgPSByZWNvcmQuZ2VuZXJhbC5tYXAob3B0Lm1ldGFib2xpdGVUb1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAuc29ydChvcHQubWV0YWJvbGl0ZVZhbHVlU29ydClcbiAgICAgICAgICAgICAgICAgICAgLm1hcChvcHQubWV0YWJvbGl0ZVZhbHVlVG9DZWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBvbmx5IG9uZSBjZWxsIGlmIHRoZXJlIGlzIGFueSB0cmFuc2NyaXB0b21pY3MgZGF0YVxuICAgICAgICBpZiAoKHJlY29yZC50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LnRyYW5zY3JpcHRUb0NlbGwocmVjb3JkLnRyYW5zY3JpcHRpb25zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgb25seSBvbmUgY2VsbCBpZiB0aGVyZSBpcyBhbnkgcHJvdGVvbWljcyBkYXRhXG4gICAgICAgIGlmICgocmVjb3JkLnByb3RlaW5zIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQucHJvdGVpblRvQ2VsbChyZWNvcmQucHJvdGVpbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBhIGxvYWRpbmcgY2VsbCBpZiBub25lIGNyZWF0ZWQgYnkgbWVhc3VyZW1lbnRzXG4gICAgICAgIGlmICghY2VsbHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAocmVjb3JkLmNvdW50KSB7XG4gICAgICAgICAgICAgICAgLy8gd2UgaGF2ZSBhIGNvdW50LCBidXQgbm8gZGF0YSB5ZXQ7IHN0aWxsIGxvYWRpbmdcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHQuZW1wdHkpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC5lbXB0eS5jYWxsKHt9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2goZmFjdG9yeSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2VsbHM7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdO1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbWVhc3VyZW1lbnRJZCcsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6ICgpID0+IHsgcmV0dXJuICdtZWFzdXJlbWVudCcgKyB2YWx1ZS5pZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS5uYW1lXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnVHJhbnNjcmlwdG9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnUHJvdGVvbWljcyBEYXRhJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZW1wdHlcIjogKCkgPT4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnPGk+Tm8gTWVhc3VyZW1lbnRzPC9pPidcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVVbml0c0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHVuaXQ6YW55ID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ3VuaXQnOiB1bml0Lm5hbWUgfHwgJycgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdmFsdWUudW5pdFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1JQS00nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnJyAvLyBUT0RPOiB3aGF0IGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50IHVuaXRzP1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ291bnRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgLy8gZnVuY3Rpb24gdG8gdXNlIGluIEFycmF5I3JlZHVjZSB0byBjb3VudCBhbGwgdGhlIHZhbHVlcyBpbiBhIHNldCBvZiBtZWFzdXJlbWVudHNcbiAgICAgICAgdmFyIHJlZHVjZUNvdW50ID0gKHByZXY6bnVtYmVyLCBtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiBwcmV2ICsgKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5sZW5ndGg7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ21lYXN1cmUnOiBtZWFzdXJlIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCAodmFsdWUubWVhc3VyZS52YWx1ZXMgfHwgW10pLmxlbmd0aCwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgaWRzLnJlZHVjZShyZWR1Y2VDb3VudCwgMCksICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsIGlkcy5yZWR1Y2UocmVkdWNlQ291bnQsIDApLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgdHVwbGVUaW1lQ291bnQgPSAodmFsdWUsIGtleSkgPT4geyByZXR1cm4gW1sga2V5LCB2YWx1ZSBdXTsgfSxcbiAgICAgICAgICAgIHNvcnRCeVRpbWUgPSAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBwYXJzZUZsb2F0KGFbMF0pLCB6ID0gcGFyc2VGbG9hdChiWzBdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3ZnQ2VsbEZvclRpbWVDb3VudHMgPSAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnNvbGlkYXRlZCwgc3ZnID0gJycsIHRpbWVDb3VudCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vIGNvdW50IHZhbHVlcyBhdCBlYWNoIHggZm9yIGFsbCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgICAgICBpZHMuZm9yRWFjaCgobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6YW55W10gPSBtZWFzdXJlLnZhbHVlcyB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS5mb3JFYWNoKChwb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGltZUNvdW50W3BvaW50WzBdWzBdXSA9IHRpbWVDb3VudFtwb2ludFswXVswXV0gfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFR5cGVzY3JpcHQgY29tcGlsZXIgZG9lcyBub3QgbGlrZSB1c2luZyBpbmNyZW1lbnQgb3BlcmF0b3Igb24gZXhwcmVzc2lvblxuICAgICAgICAgICAgICAgICAgICAgICAgKyt0aW1lQ291bnRbcG9pbnRbMF1bMF1dO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBtYXAgdGhlIGNvdW50cyB0byBbeCwgeV0gdHVwbGVzLCBzb3J0ZWQgYnkgeCB2YWx1ZVxuICAgICAgICAgICAgICAgIGNvbnNvbGlkYXRlZCA9ICQubWFwKHRpbWVDb3VudCwgdHVwbGVUaW1lQ291bnQpLnNvcnQoc29ydEJ5VGltZSk7XG4gICAgICAgICAgICAgICAgLy8gZ2VuZXJhdGUgU1ZHIHN0cmluZ1xuICAgICAgICAgICAgICAgIGlmIChjb25zb2xpZGF0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN2ZyA9IGdyaWRTcGVjLmFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhjb25zb2xpZGF0ZWQsICcnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBzdmdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ21lYXN1cmUnOiBtZWFzdXJlIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmUgPSB2YWx1ZS5tZWFzdXJlIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBmb3JtYXQgPSBtZWFzdXJlLmZvcm1hdCA9PT0gMSA/ICdjYXJib24nIDogJycsXG4gICAgICAgICAgICAgICAgICAgIGRhdGEgPSB2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKGRhdGEsIGZvcm1hdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN2Z1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHMsXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IHN2Z0NlbGxGb3JUaW1lQ291bnRzXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGV4cCA9IEVERERhdGEuQXNzYXlzW2luZGV4XS5leHA7XG4gICAgICAgIHZhciB1UmVjb3JkID0gRURERGF0YS5Vc2Vyc1tleHBdO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHVSZWNvcmQgPyB1UmVjb3JkLmluaXRpYWxzIDogJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcoRURERGF0YS5Bc3NheXNbaW5kZXhdLm1vZClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBhc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMocG9pbnRzLCBmb3JtYXQ6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc3ZnID0gJzxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZlcnNpb249XCIxLjJcIiB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMHB4XCJcXFxuICAgICAgICAgICAgICAgICAgICB2aWV3Qm94PVwiMCAwIDQ3MCAxMFwiIHByZXNlcnZlQXNwZWN0UmF0aW89XCJub25lXCI+XFxcbiAgICAgICAgICAgICAgICA8c3R5bGUgdHlwZT1cInRleHQvY3NzXCI+PCFbQ0RBVEFbXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jUCB7IHN0cm9rZTpyZ2JhKDAsMCwwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY1YgeyBzdHJva2U6cmdiYSgwLDAsMjMwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY0UgeyBzdHJva2U6cmdiYSgyNTUsMTI4LDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgXV0+PC9zdHlsZT5cXFxuICAgICAgICAgICAgICAgIDxwYXRoIGZpbGw9XCJyZ2JhKDAsMCwwLDAuMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2U9XCJyZ2JhKDAsMCwwLDAuMDUpXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgZD1cIk0xMCw1aDQ1MFwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPVwic3Ryb2tlLXdpZHRoOjJweDtcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2Utd2lkdGg9XCIyXCI+PC9wYXRoPic7XG4gICAgICAgIHZhciBwYXRocyA9IFsgc3ZnIF07XG4gICAgICAgIHBvaW50cy5zb3J0KChhLGIpID0+IHsgcmV0dXJuIGFbMF0gLSBiWzBdOyB9KS5mb3JFYWNoKChwb2ludCkgPT4ge1xuICAgICAgICAgICAgdmFyIHggPSBwb2ludFswXVswXSxcbiAgICAgICAgICAgICAgICB5ID0gcG9pbnRbMV1bMF0sXG4gICAgICAgICAgICAgICAgcnggPSAoKHggLyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEpICogNDUwKSArIDEwLFxuICAgICAgICAgICAgICAgIHR0ID0gW3ksICcgYXQgJywgeCwgJ2gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJyw1djRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKHkgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjRVwiIGQ9XCJNJywgcngsICcsMnY2XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY0XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIGlmIChmb3JtYXQgPT09ICdjYXJib24nKSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1ZcIiBkPVwiTScsIHJ4LCAnLDF2OFwiPjx0aXRsZT4nLCB0dCwgJzwvdGl0bGU+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1BcIiBkPVwiTScsIHJ4LCAnLDF2OFwiPjx0aXRsZT4nLCB0dCwgJzwvdGl0bGU+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHBhdGhzLnB1c2goJzwvc3ZnPicpO1xuICAgICAgICByZXR1cm4gcGF0aHMuam9pbignXFxuJyk7XG4gICAgfVxuICAgIFxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZGF0YSBjb2x1bW5zIHRoYXQgd2lsbCBtYWtlIHVwIHRoZSBib2R5IG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIG1ldGFEYXRhQ29sczpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIHJpZ2h0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICAgICAgLy8gYWRkIGNsaWNrIGhhbmRsZXIgZm9yIG1lbnUgb24gYXNzYXkgbmFtZSBjZWxsc1xuICAgICAgICAkKHRoaXMudGFibGVFbGVtZW50KS5vbignY2xpY2snLCAnYS5hc3NheS1lZGl0LWxpbmsnLCAoZXYpID0+IHtcbiAgICAgICAgICAgIFN0dWR5RC5lZGl0QXNzYXkoJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJ2EuYXNzYXktcmVsb2FkLWxpbmsnLCAoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICB2YXIgaWQgPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnLnBvcHVwY2VsbCcpLmZpbmQoJ2lucHV0JykudmFsKCksXG4gICAgICAgICAgICAgICAgYXNzYXk6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHtcbiAgICAgICAgICAgICAgICBTdHVkeUQucmVxdWVzdEFzc2F5RGF0YShhc3NheSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgICAgICBsZWZ0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMSwgdGhpcy5nZW5lcmF0ZUFzc2F5TmFtZUNlbGxzKVxuICAgICAgICAgICBdO1xuXG4gICAgICAgIG1ldGFEYXRhQ29scyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiArIGluZGV4LCB0aGlzLm1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMyArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVVbml0c0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVDb3VudENlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNSArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNiArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVFeHBlcmltZW50ZXJDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDcgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFDb2xzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cbiAgICBkZWZpbmVDb2x1bW5Hcm91cFNwZWMoKTpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdIHtcbiAgICAgICAgdmFyIHRvcFNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB2YXIgbWV0YURhdGFDb2xHcm91cHM6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXTtcbiAgICAgICAgbWV0YURhdGFDb2xHcm91cHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMobWRUeXBlLm5hbWUpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgYm90dG9tU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdNZWFzdXJlbWVudCcsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ1VuaXRzJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnQ291bnQnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdNZWFzdXJpbmcgVGltZXMnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdFeHBlcmltZW50ZXInLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYXN0IE1vZGlmaWVkJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiB0b3BTZWN0aW9uLmNvbmNhdChtZXRhRGF0YUNvbEdyb3VwcywgYm90dG9tU2VjdGlvbik7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHN1YnN0cmluZyBzZWFyY2hpbmdcbiAgICAgICAgdmFyIHNlYXJjaEFzc2F5c1dpZGdldCA9IG5ldyBER0Fzc2F5c1NlYXJjaFdpZGdldChkYXRhR3JpZCwgdGhpcywgJ1NlYXJjaCBBc3NheXMnLCAzMCxcbiAgICAgICAgICAgICAgICBmYWxzZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlYXJjaEFzc2F5c1dpZGdldCk7XG4gICAgICAgIC8vIEEgXCJzZWxlY3QgYWxsXCIgYnV0dG9uXG4gICAgICAgIHZhciBzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdTZWxlY3RBbGxXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICBzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWxlY3RBbGxXaWRnZXQpO1xuXG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LlxuICAgIC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZE9wdGlvbldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZE9wdGlvbldpZGdldFtdID0gW107XG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgQXNzYXlzXG4gICAgICAgIHZhciBkaXNhYmxlZEFzc2F5c1dpZGdldCA9IG5ldyBER0Rpc2FibGVkQXNzYXlzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZGlzYWJsZWRBc3NheXNXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkQXNzYXlzKTp2b2lkIHtcblxuICAgICAgICAvLyBXaXJlIHVwIHRoZSAnYWN0aW9uIHBhbmVscycgZm9yIHRoZSBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgJCh0YWJsZSkub24oJ2NoYW5nZScsICc6Y2hlY2tib3gnLCAoKSA9PiBTdHVkeUQucXVldWVBc3NheXNBY3Rpb25QYW5lbFNob3coKSk7XG5cbiAgICAgICAgaWYgKHRoaXMudW5kaXNjbG9zZWRTZWN0aW9uRGl2KSB7XG4gICAgICAgICAgICAkKHRoaXMudW5kaXNjbG9zZWRTZWN0aW9uRGl2KS5jbGljaygoKSA9PiBkYXRhR3JpZC5jbGlja2VkRGlzY2xvc2UodHJ1ZSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHAgPSB0aGlzLnByb3RvY29sSUQ7XG4gICAgICAgIHZhciBncmFwaGlkID0gXCJwcm9cIiArIHAgKyBcImdyYXBoXCI7XG4gICAgICAgIGlmICh0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgJCh0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMuZWxlbWVudCkuaHRtbCgnPGRpdiBpZD1cIicgKyBncmFwaGlkICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdcIiBjbGFzcz1cImdyYXBoQ29udGFpbmVyXCI+PC9kaXY+Jyk7XG4gICAgICAgICAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgZ3JhcGggb2JqZWN0XG4gICAgICAgICAgICAgICAgdGhpcy5ncmFwaE9iamVjdCA9IE9iamVjdC5jcmVhdGUoU3R1ZHlER3JhcGhpbmcpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhPYmplY3QuU2V0dXAoZ3JhcGhpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gUnVuIGl0IG9uY2UgaW4gY2FzZSB0aGUgcGFnZSB3YXMgZ2VuZXJhdGVkIHdpdGggY2hlY2tlZCBBc3NheXNcbiAgICAgICAgU3R1ZHlELnF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93KCk7XG4gICAgfVxufVxuXG5cblxuLy8gV2hlbiB1bmNoZWNrZWQsIHRoaXMgaGlkZXMgdGhlIHNldCBvZiBBc3NheXMgdGhhdCBhcmUgbWFya2VkIGFzIGRpc2FibGVkLlxuY2xhc3MgREdEaXNhYmxlZEFzc2F5c1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnU2hvd0RBc3NheXNDQicrdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgJChjYikuY2xpY2soIChlKSA9PiB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY2xpY2tlZE9wdGlvbldpZGdldChlKSApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdTaG93IERpc2FibGVkJywgY2JJRCk7O1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcblxuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICByZXR1cm4gcm93SURzO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZpbHRlcmVkSURzID0gW107XG4gICAgICAgIGZvciAodmFyIHIgPSAwOyByIDwgcm93SURzLmxlbmd0aDsgcisrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSByb3dJRHNbcl07XG4gICAgICAgICAgICAvLyBIZXJlIGlzIHRoZSBjb25kaXRpb24gdGhhdCBkZXRlcm1pbmVzIHdoZXRoZXIgdGhlIHJvd3MgYXNzb2NpYXRlZCB3aXRoIHRoaXMgSUQgYXJlXG4gICAgICAgICAgICAvLyBzaG93biBvciBoaWRkZW4uXG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheXNbaWRdLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkSURzLnB1c2goaWQpOyAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZElEcztcbiAgICB9XG5cblxuICAgIGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOmFueSwgcm93SUQ6YW55KTphbnkge1xuICAgICAgICBpZiAoIUVERERhdGEuQXNzYXlzW3Jvd0lEXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICQuZWFjaChkYXRhUm93T2JqZWN0cywgKHgsIHJvdykgPT4gJChyb3cuZ2V0RWxlbWVudCgpKS5hZGRDbGFzcygnZGlzYWJsZWRSZWNvcmQnKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG4vLyBUaGlzIGlzIGEgRGF0YUdyaWRIZWFkZXJXaWRnZXQgZGVyaXZlZCBmcm9tIERHU2VhcmNoV2lkZ2V0LiBJdCdzIGEgc2VhcmNoIGZpZWxkIHRoYXQgb2ZmZXJzXG4vLyBvcHRpb25zIGZvciBhZGRpdGlvbmFsIGRhdGEgdHlwZXMsIHF1ZXJ5aW5nIHRoZSBzZXJ2ZXIgZm9yIHJlc3VsdHMuXG5jbGFzcyBER0Fzc2F5c1NlYXJjaFdpZGdldCBleHRlbmRzIERHU2VhcmNoV2lkZ2V0IHtcblxuICAgIHNlYXJjaERpc2Nsb3N1cmVFbGVtZW50OmFueTtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDphbnksIGRhdGFHcmlkU3BlYzphbnksIHBsYWNlSG9sZGVyOnN0cmluZywgc2l6ZTpudW1iZXIsXG4gICAgICAgICAgICBnZXRzRm9jdXM6Ym9vbGVhbikge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMsIHBsYWNlSG9sZGVyLCBzaXplLCBnZXRzRm9jdXMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnMgd2hlbiBjcmVhdGluZyBpbnB1dFxuICAgIC8vIGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgc3VwZXIuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50cyBoYXZlXG4gICAgLy8gbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjphbnksIHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMoKSkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgfVxufVxuXG5cbi8vIHVzZSBKUXVlcnkgcmVhZHkgZXZlbnQgc2hvcnRjdXQgdG8gY2FsbCBwcmVwYXJlSXQgd2hlbiBwYWdlIGlzIHJlYWR5XG4kKCgpID0+IFN0dWR5RC5wcmVwYXJlSXQoKSk7XG5cbiJdfQ==