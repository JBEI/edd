// File last modified on: Wed Oct 26 2016 16:45:38  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="CarbonSummation.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="StudyGraphing.ts" />
/// <reference path="GraphHelperMethods.ts" />
/// <reference path="../typings/d3/d3.d.ts"/>
/// <reference path="../typings/spin/spin.d.ts"/>;
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
    var spinner;
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
            assayFilters.push(new ProtocolFilterSection()); // Protocol
            assayFilters.push(new StrainFilterSection()); // first column in filtering section
            assayFilters.push(new LineNameFilterSection()); // LINE
            assayFilters.push(new CarbonSourceFilterSection());
            assayFilters.push(new CarbonLabelingFilterSection());
            assayFilters.push(new AssaySuffixFilterSection()); //Assasy suffix
            // convert seen metadata IDs to FilterSection objects, and push to end of assayFilters
            assayFilters.push.apply(assayFilters, $.map(seenInAssaysHash, function (_, id) { return new AssayMetaDataFilterSection(id); }));
            assayFilters.push.apply(assayFilters, $.map(seenInLinesHash, function (_, id) { return new LineMetaDataFilterSection(id); }));
            this.metaboliteFilters = [];
            this.metaboliteFilters.push(new MetaboliteCompartmentFilterSection());
            this.metaboliteFilters.push(new MetaboliteFilterSection());
            this.proteinFilters = [];
            this.proteinFilters.push(new ProteinFilterSection());
            this.geneFilters = [];
            this.geneFilters.push(new GeneFilterSection());
            this.measurementFilters = [];
            this.measurementFilters.push(new MeasurementFilterSection());
            // All filter sections are constructed; now need to call configure() on all
            this.allFilters = [].concat(assayFilters, this.metaboliteFilters, this.proteinFilters, this.geneFilters, this.measurementFilters);
            this.allFilters.forEach(function (section) { return section.configure(); });
            // We can initialize all the Assay- and Line-level filters immediately
            this.assayFilters = assayFilters;
            assayFilters.forEach(function (filter) {
                filter.populateFilterFromRecordIDs(aIDsToUse);
                filter.populateTable();
            });
            this.repopulateFilteringSection();
        };
        // Clear out any old filters in the filtering section, and add in the ones that
        // claim to be "useful".
        ProgressiveFilteringWidget.prototype.repopulateFilteringSection = function () {
            var _this = this;
            var dark = false;
            $.each(this.allFilters, function (i, widget) {
                if (widget.isFilterUseful()) {
                    widget.addToParent(_this.filterTableJQ[0]);
                    widget.applyBackgroundStyle(dark);
                    dark = !dark;
                }
                else {
                    widget.detach();
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
            // loop over all downloaded measurements. measures corresponds to AssayMeasurements
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
            // we realize that the selection has been narrowed down, so we append the Acetate measurements onto dSM.
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
        // redraw graph with new measurement types.
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
    }());
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
        // TODO: Convert to a protected constructor! Then use a factory method to create objects
        //    with configure() already called. Typescript 1.8 does not support visibility
        //    modifiers on constructors, support is added in Typescript 2.0
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
            this.anyCheckboxesChecked = false;
        }
        GenericFilterSection.prototype.configure = function (title, shortLabel) {
            if (title === void 0) { title = 'Generic Filter'; }
            if (shortLabel === void 0) { shortLabel = 'gf'; }
            this.sectionTitle = title;
            this.sectionShortLabel = shortLabel;
            this.createContainerObjects();
        };
        // Create all the container HTML objects
        GenericFilterSection.prototype.createContainerObjects = function () {
            var _this = this;
            var sBoxID = 'filter' + this.sectionShortLabel + 'SearchBox', sBox;
            this.filterColumnDiv = $("<div>").addClass('filterColumn')[0];
            var textTitle = $("<span>").addClass('filterTitle').text(this.sectionTitle);
            var clearIcon = $("<span>").addClass('filterClearIcon');
            this.plaintextTitleDiv = $("<div>").addClass('filterHead').append(clearIcon).append(textTitle)[0];
            $(sBox = document.createElement("input"))
                .attr({
                'id': sBoxID,
                'name': sBoxID,
                'placeholder': this.sectionTitle,
                'size': 14
            });
            sBox.setAttribute('type', 'text'); // JQuery .attr() cannot set this
            this.searchBox = sBox;
            // We need two clear iccons for the two versions of the header
            var searchClearIcon = $("<span>").addClass('filterClearIcon');
            this.searchBoxTitleDiv = $("<div>").addClass('filterHeadSearch').append(searchClearIcon).append(sBox)[0];
            this.clearIcons = clearIcon.add(searchClearIcon); // Consolidate the two JQuery elements into one
            this.clearIcons.on('click', function (ev) {
                // Changing the checked status will automatically trigger a refresh event
                $.each(_this.checkboxes || {}, function (id, checkbox) {
                    checkbox.prop('checked', false);
                });
                return false;
            });
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
        GenericFilterSection.prototype.detach = function () {
            $(this.filterColumnDiv).detach();
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
            var fCol = $(this.filterColumnDiv);
            fCol.children().detach();
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
            var graphHelper = Object.create(GraphHelperMethods);
            var colorObj = graphHelper.renderColor(EDDData.Lines);
            //add color obj to EDDData 
            EDDData['color'] = colorObj;
            // line label color based on graph color of line 
            if (this.sectionTitle === "Line") {
                var colors = {};
                //create new colors object with line names a keys and color hex as values 
                for (var key in EDDData.Lines) {
                    colors[EDDData.Lines[key].name] = colorObj[key];
                }
                this.uniqueValuesOrder.forEach(function (uniqueId) {
                    var cboxName, cell, p, q, r;
                    cboxName = ['filter', _this.sectionShortLabel, 'n', uniqueId, 'cbox'].join('');
                    _this.tableRows[uniqueId] = _this.tableBodyElement.insertRow();
                    cell = _this.tableRows[uniqueId].insertCell();
                    _this.checkboxes[uniqueId] = $("<input type='checkbox'>")
                        .attr({ 'name': cboxName, 'id': cboxName })
                        .appendTo(cell);
                    for (var key in EDDData.Lines) {
                        if (EDDData.Lines[key].name == _this.uniqueValues[uniqueId]) {
                            (EDDData.Lines[key]['identifier'] = cboxName);
                        }
                    }
                    $('<label>').attr('for', cboxName).text(_this.uniqueValues[uniqueId])
                        .css('font-weight', 'Bold').appendTo(cell);
                });
            }
            else {
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
            }
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
                // "C" - checked, "U" - unchecked, "N" - doesn't exist
                current = (checkbox.prop('checked') && !checkbox.prop('disabled')) ? 'C' : 'U';
                previous = _this.previousCheckboxState[uniqueId] || 'N';
                if (current !== previous)
                    changed = true;
                if (current === 'C')
                    _this.anyCheckboxesChecked = true;
                currentCheckboxState[uniqueId] = current;
            });
            this.clearIcons.toggleClass('enabled', this.anyCheckboxesChecked);
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
    }());
    StudyD.GenericFilterSection = GenericFilterSection;
    var StrainFilterSection = (function (_super) {
        __extends(StrainFilterSection, _super);
        function StrainFilterSection() {
            _super.apply(this, arguments);
        }
        StrainFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Strain', 'st');
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
    }(GenericFilterSection));
    StudyD.StrainFilterSection = StrainFilterSection;
    var CarbonSourceFilterSection = (function (_super) {
        __extends(CarbonSourceFilterSection, _super);
        function CarbonSourceFilterSection() {
            _super.apply(this, arguments);
        }
        CarbonSourceFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Carbon Source', 'cs');
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
    }(GenericFilterSection));
    StudyD.CarbonSourceFilterSection = CarbonSourceFilterSection;
    var CarbonLabelingFilterSection = (function (_super) {
        __extends(CarbonLabelingFilterSection, _super);
        function CarbonLabelingFilterSection() {
            _super.apply(this, arguments);
        }
        CarbonLabelingFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Labeling', 'l');
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
    }(GenericFilterSection));
    StudyD.CarbonLabelingFilterSection = CarbonLabelingFilterSection;
    var LineNameFilterSection = (function (_super) {
        __extends(LineNameFilterSection, _super);
        function LineNameFilterSection() {
            _super.apply(this, arguments);
        }
        LineNameFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Line', 'ln');
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
    }(GenericFilterSection));
    StudyD.LineNameFilterSection = LineNameFilterSection;
    var ProtocolFilterSection = (function (_super) {
        __extends(ProtocolFilterSection, _super);
        function ProtocolFilterSection() {
            _super.apply(this, arguments);
        }
        ProtocolFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Protocol', 'p');
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
    }(GenericFilterSection));
    StudyD.ProtocolFilterSection = ProtocolFilterSection;
    var AssaySuffixFilterSection = (function (_super) {
        __extends(AssaySuffixFilterSection, _super);
        function AssaySuffixFilterSection() {
            _super.apply(this, arguments);
        }
        AssaySuffixFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Assay Suffix', 'a');
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
    }(GenericFilterSection));
    StudyD.AssaySuffixFilterSection = AssaySuffixFilterSection;
    var MetaDataFilterSection = (function (_super) {
        __extends(MetaDataFilterSection, _super);
        function MetaDataFilterSection(metaDataID) {
            _super.call(this);
            var MDT = EDDData.MetaDataTypes[metaDataID];
            this.metaDataID = metaDataID;
            this.pre = MDT.pre || '';
            this.post = MDT.post || '';
        }
        MetaDataFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, EDDData.MetaDataTypes[this.metaDataID].name, 'md' + this.metaDataID);
        };
        return MetaDataFilterSection;
    }(GenericFilterSection));
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
    }(MetaDataFilterSection));
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
    }(MetaDataFilterSection));
    StudyD.AssayMetaDataFilterSection = AssayMetaDataFilterSection;
    var MetaboliteCompartmentFilterSection = (function (_super) {
        __extends(MetaboliteCompartmentFilterSection, _super);
        function MetaboliteCompartmentFilterSection() {
            _super.apply(this, arguments);
        }
        // NOTE: this filter class works with Measurement IDs rather than Assay IDs
        MetaboliteCompartmentFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Compartment', 'com');
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
    }(GenericFilterSection));
    StudyD.MetaboliteCompartmentFilterSection = MetaboliteCompartmentFilterSection;
    var MeasurementFilterSection = (function (_super) {
        __extends(MeasurementFilterSection, _super);
        function MeasurementFilterSection() {
            _super.apply(this, arguments);
        }
        MeasurementFilterSection.prototype.configure = function () {
            this.loadPending = true;
            _super.prototype.configure.call(this, 'Measurement', 'mm');
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
    }(GenericFilterSection));
    StudyD.MeasurementFilterSection = MeasurementFilterSection;
    var MetaboliteFilterSection = (function (_super) {
        __extends(MetaboliteFilterSection, _super);
        function MetaboliteFilterSection() {
            _super.apply(this, arguments);
        }
        MetaboliteFilterSection.prototype.configure = function () {
            this.loadPending = true;
            _super.prototype.configure.call(this, 'Metabolite', 'me');
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
    }(GenericFilterSection));
    StudyD.MetaboliteFilterSection = MetaboliteFilterSection;
    var ProteinFilterSection = (function (_super) {
        __extends(ProteinFilterSection, _super);
        function ProteinFilterSection() {
            _super.apply(this, arguments);
        }
        ProteinFilterSection.prototype.configure = function () {
            this.loadPending = true;
            _super.prototype.configure.call(this, 'Protein', 'pr');
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
    }(GenericFilterSection));
    StudyD.ProteinFilterSection = ProteinFilterSection;
    var GeneFilterSection = (function (_super) {
        __extends(GeneFilterSection, _super);
        function GeneFilterSection() {
            _super.apply(this, arguments);
        }
        GeneFilterSection.prototype.configure = function () {
            this.loadPending = true;
            _super.prototype.configure.call(this, 'Gene', 'gn');
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
    }(GenericFilterSection));
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
                _this.linesDataGridSpec.init();
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
                        spec.init();
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
            // clear out inputs so another value can be entered
            addrow.find(':input').not(':checkbox, :radio').val('');
            addrow.find(':checkbox, :radio').prop('checked', false);
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
        $(window).on('load', preparePermissions);
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
        var opts = {
            lines: 9,
            length: 9,
            width: 5,
            radius: 14,
            color: '#1875A6',
            speed: 1.9,
            trail: 40,
            className: 'spinner',
            zIndex: 2e9,
            position: 'relative',
            top: '70%',
            left: '50%'
        };
        // Prepare the main data overview graph at the top of the page
        if (this.mainGraphObject === null && $('#maingraph').length === 1) {
            this.mainGraphObject = Object.create(StudyDGraphing);
            this.mainGraphObject.Setup('maingraph');
            //load spinner
            this.spinner = new Spinner(opts).spin(document.getElementById("overviewSection"));
            this.progressiveFilteringWidget.mainGraphObject = this.mainGraphObject;
        }
        $('#mainFilterSection').on('mouseover mousedown mouseup', this.queueMainGraphRemake.bind(this, false))
            .on('keydown', filterTableKeyDown.bind(this));
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
        //pulling in protocol measurements AssayMeasurements
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
        if (!panel.length) {
            return;
        }
        // Figure out how many assays/checkboxes are selected.
        $.each(this.assaysDataGrids, function (pID, dataGrid) {
            checkedBoxes = checkedBoxes.concat(dataGrid.getSelectedCheckboxElements());
        });
        checkedAssays = $(checkedBoxes).filter('[id^=assay]').length;
        checkedMeasure = $(checkedBoxes).filter(':not([id^=assay])').length;
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
    var remakeMainGraphAreaCalls = 0;
    function remakeMainGraphArea(force) {
        var _this = this;
        //stop spinner. 
        this.spinner.stop();
        // loader settings
        var postFilteringMeasurements, dataPointsDisplayed = 0, dataPointsTotal = 0, colorObj;
        if (!this.progressiveFilteringWidget.checkRedrawRequired(force)) {
            return;
        }
        //remove SVG.
        this.mainGraphObject.clearAllSets();
        this.graphHelper = Object.create(GraphHelperMethods);
        colorObj = EDDData['color'];
        //Gives ids of lines to show.
        var dataSets = [], prev;
        postFilteringMeasurements = this.progressiveFilteringWidget.buildFilteredMeasurements();
        $.each(postFilteringMeasurements, function (i, measurementId) {
            var measure = EDDData.AssayMeasurements[measurementId], points = (measure.values ? measure.values.length : 0), assay, line, name, singleAssayObj, color, protocol, lineName, dataObj;
            dataPointsTotal += points;
            if (dataPointsDisplayed > 15000) {
                return; // Skip the rest if we've hit our limit
            }
            dataPointsDisplayed += points;
            assay = EDDData.Assays[measure.assay] || {};
            line = EDDData.Lines[assay.lid] || {};
            protocol = EDDData.Protocols[assay.pid] || {};
            name = [line.name, protocol.name, assay.name].join('-');
            lineName = line.name;
            var label = $('#' + line['identifier']).next();
            if (_.keys(EDDData.Lines).length > 22) {
                color = changeLineColor(line, colorObj, assay.lid, _this.graphHelper);
            }
            else {
                color = colorObj[assay.lid];
            }
            if (remakeMainGraphAreaCalls === 0) {
                _this.graphHelper.labels.push(label);
                color = colorObj[assay.lid];
                //update label color to line color
                $(label).css('color', color);
            }
            else if (remakeMainGraphAreaCalls >= 1 && $('#' + line['identifier']).prop('checked')) {
                //unchecked labels black
                makeLabelsBlack(_this.graphHelper.labels);
                //update label color to line color
                if (color === null || color === undefined) {
                    color = colorObj[assay.lid];
                }
                $(label).css('color', color);
            }
            else {
                var count = noCheckedBoxes(_this.graphHelper.labels);
                if (count === 0) {
                    _this.graphHelper.nextColor = null;
                    addColor(_this.graphHelper.labels, colorObj, assay.lid);
                }
                else {
                    //update label color to black
                    $(label).css('color', 'black');
                }
            }
            if (color === null || color === undefined) {
                color = colorObj[assay.lid];
            }
            dataObj = {
                'measure': measure,
                'data': EDDData,
                'name': name,
                'color': color,
                'lineName': lineName,
            };
            singleAssayObj = _this.graphHelper.transformSingleLineItem(dataObj);
            dataSets.push(singleAssayObj);
            prev = lineName;
        });
        remakeMainGraphAreaCalls++;
        uncheckEventHandler(this.graphHelper.labels);
        this.mainGraphObject.addNewSet(dataSets, EDDData.MeasurementTypes);
    }
    /**
     * this function makes unchecked labels black
     * @param selectors
     */
    function makeLabelsBlack(selectors) {
        _.each(selectors, function (selector) {
            if (selector.prev().prop('checked') === false) {
                $(selector).css('color', 'black');
            }
        });
    }
    /**
     * this function creates an event handler for unchecking a checked checkbox
     * @param labels
     */
    function uncheckEventHandler(labels) {
        _.each(labels, function (label) {
            var id = $(label).prev().attr('id');
            $('#' + id).change(function () {
                var ischecked = $(this).is(':checked');
                if (!ischecked)
                    $(label).css('color', 'black');
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
        _.each(labels, function (label) {
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
     * @param colorObj
     * @param assay
     * @returns labels
     */
    function addColor(labels, colorObj, assay) {
        _.each(labels, function (label) {
            var color = colorObj[assay];
            if (EDDData.Lines[assay].name === label.text()) {
                $(label).css('color', color);
            }
        });
        return labels;
    }
    /**
     * @param line
     * @param colorObj
     * @param assay
     * @param graphHelper
     * @returns color for line.
     * this function returns the color in the color queue for studies >22 lines. Instantiated
     * when user clicks on a line.
     */
    function changeLineColor(line, colorObj, assay, graphHelper) {
        var color;
        if ($('#' + line['identifier']).prop('checked') && remakeMainGraphAreaCalls === 1) {
            color = line['color'];
            line['doNotChange'] = true;
            graphHelper.colorQueue(color);
        }
        if ($('#' + line['identifier']).prop('checked') && remakeMainGraphAreaCalls >= 1) {
            if (line['doNotChange']) {
                color = line['color'];
            }
            else {
                color = graphHelper.nextColor;
                line['doNotChange'] = true;
                line['color'] = color;
                //text label next to checkbox
                var label = $('#' + line['identifier']).next();
                //update label color to line color
                $(label).css('color', color);
                graphHelper.colorQueue(color);
            }
        }
        else if ($('#' + line['identifier']).prop('checked') === false && remakeMainGraphAreaCalls > 1) {
            color = colorObj[assay];
            var label = $('#' + line['identifier']).next();
            //update label color to line color
            $(label).css('color', color);
        }
        if (remakeMainGraphAreaCalls == 0) {
            color = colorObj[assay];
        }
        return color;
    }
    function clearAssayForm() {
        var form = $('#id_assay-assay_id').closest('.disclose');
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
        $('html, body').animate({ 'scrollTop': top }, 'slow');
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
        _super.apply(this, arguments);
    }
    DataGridSpecLines.prototype.init = function () {
        this.findMetaDataIDsUsedInLines();
        this.findGroupIDsAndNames();
        _super.prototype.init.call(this);
    };
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
                    '<a href="/export?lineId=' + index + '">Export Data as CSV/Excel</a>',
                    '<a href="/sbml?lineId=' + index + '">Export Data as SBML</a>'
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
        // A "deselect all" button
        var deselectAllWidget = new DGDeselectAllWidget(dataGrid, this);
        deselectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(deselectAllWidget);
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
}(DataGridSpecBase));
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
}(DataGridOptionWidget));
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
}(DataGridOptionWidget));
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
}(DGSearchWidget));
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
}(DataGridHeaderWidget));
var DataGridAssays = (function (_super) {
    __extends(DataGridAssays, _super);
    function DataGridAssays(dataGridSpec) {
        _super.call(this, dataGridSpec);
        this.recordsCurrentlyInvalidated = [];
        this.sectionCurrentlyDisclosed = false;
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
        var colorObj = EDDData['color'];
        var dataSets = [];
        spec.getRecordIDs().forEach(function (id) {
            var assay = EDDData.Assays[id] || {}, line = EDDData.Lines[assay.lid] || {}, measures;
            if (!assay.active || !line.active) {
                return;
            }
            measures = assay.measures || [];
            measures.forEach(function (m) {
                var measure = EDDData.AssayMeasurements[m], set;
                var name = assay.name;
                var color = colorObj[assay.lid];
                var lineName = line.name;
                var dataObj = {
                    'measure': measure,
                    'data': EDDData,
                    'name': name,
                    'color': color,
                    'lineName': lineName
                };
                var singleAssayObj = GraphHelperMethods.transformSingleLineItem(dataObj);
                if (line.control)
                    singleAssayObj.iscontrol = true;
                dataSets.push(singleAssayObj);
            });
        });
        g.addNewSet(dataSets);
    };
    return DataGridAssays;
}(DataGrid));
// The spec object that will be passed to DataGrid to create the Assays table(s)
var DataGridSpecAssays = (function (_super) {
    __extends(DataGridSpecAssays, _super);
    function DataGridSpecAssays(protocolID) {
        _super.call(this);
        this.protocolID = protocolID;
        this.protocolName = EDDData.Protocols[protocolID].name;
        this.graphObject = null;
        this.measuringTimesHeaderSpec = null;
        this.graphAreaHeaderSpec = null;
    }
    DataGridSpecAssays.prototype.init = function () {
        this.refreshIDList();
        this.findMaximumXValueInData();
        this.findMetaDataIDsUsedInAssays();
        _super.prototype.init.call(this);
    };
    DataGridSpecAssays.prototype.refreshIDList = function () {
        var _this = this;
        // Find out which protocols have assays with measurements - disabled or no
        this.assayIDsInProtocol = [];
        $.each(EDDData.Assays, function (assayId, assay) {
            var line;
            // skip assays for other protocols
            if (_this.protocolID === assay.pid) {
                line = EDDData.Lines[assay.lid];
                // skip assays without a valid line or with a disabled line
                if (line && line.active) {
                    _this.assayIDsInProtocol.push(assay.id);
                }
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
        if ($('#' + tableID).length === 0) {
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
    // metabolite and general measurements, plus 1 if there are transcriptomics measurements, plus 1 if there
    // are proteomics measurements, all added together.  (Or 1, whichever is higher.)
    DataGridSpecAssays.prototype.rowSpanForRecord = function (index) {
        var rec = EDDData.Assays[index];
        var v = ((rec.general || []).length +
            (rec.metabolites || []).length +
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
                return new DataGridDataCell(gridSpec, value.id, {
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
        var svgCellForTimeCounts = function (ids) {
            var consolidated, svg = '', timeCount = {};
            // count values at each x for all measurements
            ids.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, points = measure.values || [];
                points.forEach(function (point) {
                    timeCount[point[0][0]] = timeCount[point[0][0]] || 0;
                    // Typescript compiler does not like using increment operator on expression
                    ++timeCount[point[0][0]];
                });
            });
            // map the counts to [x, y] tuples
            consolidated = $.map(timeCount, function (value, key) { return [[[parseFloat(key)], [value]]]; });
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
                var measure = value.measure || {}, format = measure.format === 1 ? 'carbon' : '', points = value.measure.values || [], svg = gridSpec.assembleSVGStringForDataPoints(points, format);
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
        var deselectAllWidget = new DGDeselectAllWidget(dataGrid, this);
        deselectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(deselectAllWidget);
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
                //html for the different graphs
                var html = '<div class="graphContainer" id= ' + graphid + '></div>';
                var dom = $(html);
                var clonedButtons = $('.assay-section:first').clone();
                var clonedClasses = $('.chartIds:first').clone();
                $(clonedButtons).appendTo(this.graphAreaHeaderSpec.element);
                $(clonedClasses).appendTo(this.graphAreaHeaderSpec.element);
                $(this.graphAreaHeaderSpec.element).append(dom);
                // Initialize the graph object
                this.graphObject = Object.create(StudyDGraphing);
                this.graphObject.Setup(graphid);
            }
        }
        // Run it once in case the page was generated with checked Assays
        StudyD.queueAssaysActionPanelShow();
    };
    return DataGridSpecAssays;
}(DataGridSpecBase));
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
}(DataGridOptionWidget));
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
}(DGSearchWidget));
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyD.prepareIt(); });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQixxQ0FBcUM7QUFDckMsZ0RBQWdEO0FBQ2hELDJDQUEyQztBQUMzQyxvQ0FBb0M7QUFDcEMseUNBQXlDO0FBQ3pDLDhDQUE4QztBQUM5Qyw2Q0FBNkM7QUFDN0Msa0RBQWtEOzs7Ozs7QUFJbEQsSUFBTyxNQUFNLENBKzZEWjtBQS82REQsV0FBTyxNQUFNLEVBQUMsQ0FBQztJQUNYLFlBQVksQ0FBQztJQUViLElBQUksZUFBbUIsQ0FBQztJQUN4QixJQUFJLDBCQUFzRCxDQUFDO0lBRTNELElBQUksT0FBZ0IsQ0FBQztJQUVyQixJQUFJLHVCQUEyQixDQUFDO0lBRWhDLElBQUksNEJBQWdDLENBQUM7SUFDckMsSUFBSSw2QkFBaUMsQ0FBQztJQUV0QyxJQUFJLGFBQWlCLENBQUM7SUFDdEIsSUFBSSxlQUFtQixDQUFDO0lBQ3hCLElBQUksMEJBQThCLENBQUM7SUFRbkMsSUFBSSxpQkFBcUIsQ0FBQztJQUMxQixJQUFJLDJCQUFtQyxDQUFDO0lBRXhDLElBQUksY0FBa0IsQ0FBQztJQUN2QixJQUFJLFlBQWdCLENBQUM7SUFFckIsOERBQThEO0lBQzlELElBQUksaUJBQWlCLENBQUM7SUFDdEIsSUFBSSxhQUFhLENBQUM7SUFDbEIsbUVBQW1FO0lBQ25FLElBQUksbUJBQW1CLENBQUM7SUFDeEIsSUFBSSxlQUFlLENBQUM7SUFtQnBCLDhDQUE4QztJQUM5QztRQW9CSSw2REFBNkQ7UUFDN0Qsb0NBQVksWUFBaUI7WUFFekIsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7WUFFakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEVB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QUFZO1FBQ3RDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBQ0wsMkJBQUM7QUFBRCxDQUFDLEFBM0JELENBQW1DLGNBQWMsR0EyQmhEO0FBR0QsdUVBQXVFO0FBQ3ZFLENBQUMsQ0FBQyxjQUFNLE9BQUEsTUFBTSxDQUFDLFNBQVMsRUFBRSxFQUFsQixDQUFrQixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBPY3QgMjYgMjAxNiAxNjo0NTozOCAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEcmFnYm94ZXMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJpb21hc3NDYWxjdWxhdGlvblVJLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJDYXJib25TdW1tYXRpb24udHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRhdGFHcmlkLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJTdHVkeUdyYXBoaW5nLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJHcmFwaEhlbHBlck1ldGhvZHMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uL3R5cGluZ3MvZDMvZDMuZC50c1wiLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL3NwaW4vc3Bpbi5kLnRzXCIvPjtcblxuZGVjbGFyZSB2YXIgRURERGF0YTpFREREYXRhO1xuXG5tb2R1bGUgU3R1ZHlEIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgbWFpbkdyYXBoT2JqZWN0OmFueTtcbiAgICB2YXIgcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQ6IFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0O1xuXG4gICAgdmFyIHNwaW5uZXI6IFNwaW5uZXI7XG5cbiAgICB2YXIgbWFpbkdyYXBoUmVmcmVzaFRpbWVySUQ6YW55O1xuXG4gICAgdmFyIGxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXI6YW55O1xuICAgIHZhciBhc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcjphbnk7XG5cbiAgICB2YXIgYXR0YWNobWVudElEczphbnk7XG4gICAgdmFyIGF0dGFjaG1lbnRzQnlJRDphbnk7XG4gICAgdmFyIHByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50OmFueTtcblxuICAgIC8vIFdlIGNhbiBoYXZlIGEgdmFsaWQgbWV0YWJvbGljIG1hcCBidXQgbm8gdmFsaWQgYmlvbWFzcyBjYWxjdWxhdGlvbi5cbiAgICAvLyBJZiB0aGV5IHRyeSB0byBzaG93IGNhcmJvbiBiYWxhbmNlIGluIHRoYXQgY2FzZSwgd2UnbGwgYnJpbmcgdXAgdGhlIFVJIHRvIFxuICAgIC8vIGNhbGN1bGF0ZSBiaW9tYXNzIGZvciB0aGUgc3BlY2lmaWVkIG1ldGFib2xpYyBtYXAuXG4gICAgZXhwb3J0IHZhciBtZXRhYm9saWNNYXBJRDphbnk7XG4gICAgZXhwb3J0IHZhciBtZXRhYm9saWNNYXBOYW1lOmFueTtcbiAgICBleHBvcnQgdmFyIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXI7XG4gICAgdmFyIGNhcmJvbkJhbGFuY2VEYXRhOmFueTtcbiAgICB2YXIgY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoOmJvb2xlYW47XG5cbiAgICB2YXIgY1NvdXJjZUVudHJpZXM6YW55O1xuICAgIHZhciBtVHlwZUVudHJpZXM6YW55O1xuXG4gICAgLy8gVGhlIHRhYmxlIHNwZWMgb2JqZWN0IGFuZCB0YWJsZSBvYmplY3QgZm9yIHRoZSBMaW5lcyB0YWJsZS5cbiAgICB2YXIgbGluZXNEYXRhR3JpZFNwZWM7XG4gICAgdmFyIGxpbmVzRGF0YUdyaWQ7XG4gICAgLy8gVGFibGUgc3BlYyBhbmQgdGFibGUgb2JqZWN0cywgb25lIGVhY2ggcGVyIFByb3RvY29sLCBmb3IgQXNzYXlzLlxuICAgIHZhciBhc3NheXNEYXRhR3JpZFNwZWNzO1xuICAgIHZhciBhc3NheXNEYXRhR3JpZHM7XG5cblxuICAgIC8vIFV0aWxpdHkgaW50ZXJmYWNlIHVzZWQgYnkgR2VuZXJpY0ZpbHRlclNlY3Rpb24jdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2hcbiAgICBleHBvcnQgaW50ZXJmYWNlIFZhbHVlVG9VbmlxdWVJRCB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogbnVtYmVyO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFZhbHVlVG9VbmlxdWVMaXN0IHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXJbXTtcbiAgICB9XG4gICAgZXhwb3J0IGludGVyZmFjZSBVbmlxdWVJRFRvVmFsdWUge1xuICAgICAgICBbaW5kZXg6IG51bWJlcl06IHN0cmluZztcbiAgICB9XG4gICAgLy8gVXNlZCBpbiBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCNwcmVwYXJlRmlsdGVyaW5nU2VjdGlvblxuICAgIGV4cG9ydCBpbnRlcmZhY2UgUmVjb3JkSURUb0Jvb2xlYW4ge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IGJvb2xlYW47XG4gICAgfVxuXG5cbiAgICAvLyBGb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIG9uIHRoZSBtYWluIGdyYXBoXG4gICAgZXhwb3J0IGNsYXNzIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0IHtcblxuICAgICAgICBhbGxGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBhc3NheUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGtlZXAgYSBzZXBhcmF0ZSBmaWx0ZXIgbGlzdCBmb3IgZWFjaCB0eXBlLlxuICAgICAgICBtZXRhYm9saXRlRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgcHJvdGVpbkZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGdlbmVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBtZWFzdXJlbWVudEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG5cbiAgICAgICAgbWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG4gICAgICAgIHByb3RlaW5EYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBnZW5lRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcbiAgICAgICAgZ2VuZXJpY0RhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG5cbiAgICAgICAgZmlsdGVyVGFibGVKUTogSlF1ZXJ5O1xuICAgICAgICBzdHVkeURPYmplY3Q6IGFueTtcbiAgICAgICAgbWFpbkdyYXBoT2JqZWN0OiBhbnk7XG5cblxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBpbml0aWFsaXplIGVhY2ggZmlsdGVyIGxpc3QuXG4gICAgICAgIGNvbnN0cnVjdG9yKHN0dWR5RE9iamVjdDogYW55KSB7XG5cbiAgICAgICAgICAgIHRoaXMuc3R1ZHlET2JqZWN0ID0gc3R1ZHlET2JqZWN0O1xuXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGFibGVKUSA9IG51bGw7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJlYWQgdGhyb3VnaCB0aGUgTGluZXMsIEFzc2F5cywgYW5kIEFzc2F5TWVhc3VyZW1lbnRzIHN0cnVjdHVyZXMgdG8gbGVhcm4gd2hhdCB0eXBlcyBhcmUgcHJlc2VudCxcbiAgICAgICAgLy8gdGhlbiBpbnN0YW50aWF0ZSB0aGUgcmVsZXZhbnQgc3ViY2xhc3NlcyBvZiBHZW5lcmljRmlsdGVyU2VjdGlvbiwgdG8gY3JlYXRlIGEgc2VyaWVzIG9mXG4gICAgICAgIC8vIGNvbHVtbnMgZm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiB1bmRlciB0aGUgbWFpbiBncmFwaCBvbiB0aGUgcGFnZS5cbiAgICAgICAgLy8gVGhpcyBtdXN0IGJlIG91dHNpZGUgdGhlIGNvbnN0cnVjdG9yIGJlY2F1c2UgRURERGF0YS5MaW5lcyBhbmQgRURERGF0YS5Bc3NheXMgYXJlIG5vdCBpbW1lZGlhdGVseSBhdmFpbGFibGVcbiAgICAgICAgLy8gb24gcGFnZSBsb2FkLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBjcmVhdGUgYW5kIGFkZCByZWxldmFudCBmaWx0ZXJzIGZvciBlYWNoIGdyb3VwLlxuICAgICAgICBwcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIHNlZW5JbkxpbmVzSGFzaDogUmVjb3JkSURUb0Jvb2xlYW4gPSB7fTtcbiAgICAgICAgICAgIHZhciBzZWVuSW5Bc3NheXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIGFJRHNUb1VzZTogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZmlsdGVyVGFibGUnKS5hcHBlbmRUbygkKCcjbWFpbkZpbHRlclNlY3Rpb24nKSk7XG5cbiAgICAgICAgICAgIC8vIEZpcnN0IGRvIHNvbWUgYmFzaWMgc2FuaXR5IGZpbHRlcmluZyBvbiB0aGUgbGlzdFxuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZDogc3RyaW5nLCBhc3NheTogYW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgfHwgIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgJC5lYWNoKGFzc2F5Lm1ldGEgfHwgW10sIChtZXRhZGF0YUlkKSA9PiB7IHNlZW5JbkFzc2F5c0hhc2hbbWV0YWRhdGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgICAgICAgICAkLmVhY2gobGluZS5tZXRhIHx8IFtdLCAobWV0YWRhdGFJZCkgPT4geyBzZWVuSW5MaW5lc0hhc2hbbWV0YWRhdGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgICAgICAgICBhSURzVG9Vc2UucHVzaChhc3NheUlkKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgZmlsdGVycyBvbiBhc3NheSB0YWJsZXNcbiAgICAgICAgICAgIC8vIFRPRE8gbWVkaWEgaXMgbm93IGEgbWV0YWRhdGEgdHlwZSwgc3RyYWluIGFuZCBjYXJib24gc291cmNlIHNob3VsZCBiZSB0b29cbiAgICAgICAgICAgIHZhciBhc3NheUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBQcm90b2NvbEZpbHRlclNlY3Rpb24oKSk7IC8vIFByb3RvY29sXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgU3RyYWluRmlsdGVyU2VjdGlvbigpKTsgLy8gZmlyc3QgY29sdW1uIGluIGZpbHRlcmluZyBzZWN0aW9uXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgTGluZU5hbWVGaWx0ZXJTZWN0aW9uKCkpOyAvLyBMSU5FXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uKCkpOyAvL0Fzc2FzeSBzdWZmaXhcbiAgICAgICAgICAgIC8vIGNvbnZlcnQgc2VlbiBtZXRhZGF0YSBJRHMgdG8gRmlsdGVyU2VjdGlvbiBvYmplY3RzLCBhbmQgcHVzaCB0byBlbmQgb2YgYXNzYXlGaWx0ZXJzXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaC5hcHBseShhc3NheUZpbHRlcnMsIFxuICAgICAgICAgICAgICAgICQubWFwKHNlZW5JbkFzc2F5c0hhc2gsIChfLCBpZDogc3RyaW5nKSA9PiBuZXcgQXNzYXlNZXRhRGF0YUZpbHRlclNlY3Rpb24oaWQpKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaC5hcHBseShhc3NheUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgJC5tYXAoc2VlbkluTGluZXNIYXNoLCAoXywgaWQ6IHN0cmluZykgPT4gbmV3IExpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24oaWQpKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMucHVzaChuZXcgUHJvdGVpbkZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMucHVzaChuZXcgR2VuZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5wdXNoKG5ldyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIC8vIEFsbCBmaWx0ZXIgc2VjdGlvbnMgYXJlIGNvbnN0cnVjdGVkOyBub3cgbmVlZCB0byBjYWxsIGNvbmZpZ3VyZSgpIG9uIGFsbFxuICAgICAgICAgICAgdGhpcy5hbGxGaWx0ZXJzID0gW10uY29uY2F0KFxuICAgICAgICAgICAgICAgIGFzc2F5RmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyk7XG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMuZm9yRWFjaCgoc2VjdGlvbikgPT4gc2VjdGlvbi5jb25maWd1cmUoKSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGNhbiBpbml0aWFsaXplIGFsbCB0aGUgQXNzYXktIGFuZCBMaW5lLWxldmVsIGZpbHRlcnMgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gYXNzYXlGaWx0ZXJzO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLmZvckVhY2goKGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlci5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoYUlEc1RvVXNlKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgZmlsdGVycyBpbiB0aGUgZmlsdGVyaW5nIHNlY3Rpb24sIGFuZCBhZGQgaW4gdGhlIG9uZXMgdGhhdFxuICAgICAgICAvLyBjbGFpbSB0byBiZSBcInVzZWZ1bFwiLlxuICAgICAgICByZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBkYXJrOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCB3aWRnZXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAod2lkZ2V0LmlzRmlsdGVyVXNlZnVsKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFkZFRvUGFyZW50KHRoaXMuZmlsdGVyVGFibGVKUVswXSk7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5hcHBseUJhY2tncm91bmRTdHlsZShkYXJrKTtcbiAgICAgICAgICAgICAgICAgICAgZGFyayA9ICFkYXJrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gR2l2ZW4gYSBzZXQgb2YgbWVhc3VyZW1lbnQgcmVjb3JkcyBhbmQgYSBkaWN0aW9uYXJ5IG9mIGNvcnJlc3BvbmRpbmcgdHlwZXNcbiAgICAgICAgLy8gKHBhc3NlZCBkb3duIGZyb20gdGhlIHNlcnZlciBhcyBhIHJlc3VsdCBvZiBhIGRhdGEgcmVxdWVzdCksIHNvcnQgdGhlbSBpbnRvXG4gICAgICAgIC8vIHRoZWlyIHZhcmlvdXMgY2F0ZWdvcmllcywgdGhlbiBwYXNzIGVhY2ggY2F0ZWdvcnkgdG8gdGhlaXIgcmVsZXZhbnQgZmlsdGVyIG9iamVjdHNcbiAgICAgICAgLy8gKHBvc3NpYmx5IGFkZGluZyB0byB0aGUgdmFsdWVzIGluIHRoZSBmaWx0ZXIpIGFuZCByZWZyZXNoIHRoZSBVSSBmb3IgZWFjaCBmaWx0ZXIuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIHByb2Nlc3MgZWFjaCBncm91cCBzZXBhcmF0ZWx5IGhlcmUuXG4gICAgICAgIHByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhtZWFzdXJlcywgdHlwZXMpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIHByb2Nlc3M6IChpZHM6IHN0cmluZ1tdLCBpOiBudW1iZXIsIHdpZGdldDogR2VuZXJpY0ZpbHRlclNlY3Rpb24pID0+IHZvaWQ7XG5cbiAgICAgICAgICAgIHZhciBmaWx0ZXJJZHMgPSB7ICdtJzogW10sICdwJzogW10sICdnJzogW10sICdfJzogW10gfTtcbiAgICAgICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHMuIG1lYXN1cmVzIGNvcnJlc3BvbmRzIHRvIEFzc2F5TWVhc3VyZW1lbnRzXG4gICAgICAgICAgICAkLmVhY2gobWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIG10eXBlID0gdHlwZXNbbWVhc3VyZW1lbnQudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLm0ucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcklkcy5wLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAnZycpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgZ2VuZSAvIHRyYW5zY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLmcucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcklkcy5fLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBwcm9jZXNzID0gKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzKTtcbiAgICAgICAgICAgICAgICB3aWRnZXQucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMubS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZXRhYm9saXRlRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMubSkpO1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5wLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByb3RlaW5GaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGZpbHRlcklkcy5wKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByb2Nlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZmlsdGVySWRzLmcubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuZ2VuZUZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLmcpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMuXy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZWFzdXJlbWVudEZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLl8pKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQnVpbGQgYSBsaXN0IG9mIGFsbCB0aGUgbm9uLWRpc2FibGVkIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHkuXG4gICAgICAgIGJ1aWxkQXNzYXlJRFNldCgpOiBhbnlbXSB7XG4gICAgICAgICAgICB2YXIgYXNzYXlJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkLCBhc3NheSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlIHx8ICFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGFzc2F5SWRzLnB1c2goYXNzYXlJZCk7XG5cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGFzc2F5SWRzO1xuICAgICAgICB9XG4gICAgIFxuXG4gICAgICAgIC8vIFN0YXJ0aW5nIHdpdGggYSBsaXN0IG9mIGFsbCB0aGUgbm9uLWRpc2FibGVkIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHksIHdlIGxvb3AgaXQgdGhyb3VnaCB0aGVcbiAgICAgICAgLy8gTGluZSBhbmQgQXNzYXktbGV2ZWwgZmlsdGVycywgY2F1c2luZyB0aGUgZmlsdGVycyB0byByZWZyZXNoIHRoZWlyIFVJLCBuYXJyb3dpbmcgdGhlIHNldCBkb3duLlxuICAgICAgICAvLyBXZSByZXNvbHZlIHRoZSByZXN1bHRpbmcgc2V0IG9mIEFzc2F5IElEcyBpbnRvIG1lYXN1cmVtZW50IElEcywgdGhlbiBwYXNzIHRoZW0gb24gdG8gdGhlXG4gICAgICAgIC8vIG1lYXN1cmVtZW50LWxldmVsIGZpbHRlcnMuICBJbiB0aGUgZW5kIHdlIHJldHVybiBhIHNldCBvZiBtZWFzdXJlbWVudCBJRHMgcmVwcmVzZW50aW5nIHRoZVxuICAgICAgICAvLyBlbmQgcmVzdWx0IG9mIGFsbCB0aGUgZmlsdGVycywgc3VpdGFibGUgZm9yIHBhc3NpbmcgdG8gdGhlIGdyYXBoaW5nIGZ1bmN0aW9ucy5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gcHJvY2VzcyBlYWNoIGdyb3VwIHNlcGFyYXRlbHkgaGVyZS5cbiAgICAgICAgYnVpbGRGaWx0ZXJlZE1lYXN1cmVtZW50cygpOiBhbnlbXSB7XG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBc3NheUlkcyA9IHRoaXMuYnVpbGRBc3NheUlEU2V0KCk7XG5cbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFzc2F5RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkQXNzYXlJZHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhmaWx0ZXJlZEFzc2F5SWRzKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnRJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goZmlsdGVyZWRBc3NheUlkcywgKGksIGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICAgICAkLm1lcmdlKG1lYXN1cmVtZW50SWRzLCBhc3NheS5tZWFzdXJlcyB8fCBbXSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2Ugc3RhcnQgb3V0IHdpdGggZm91ciByZWZlcmVuY2VzIHRvIHRoZSBhcnJheSBvZiBhdmFpbGFibGUgbWVhc3VyZW1lbnQgSURzLCBvbmUgZm9yIGVhY2ggbWFqb3IgY2F0ZWdvcnkuXG4gICAgICAgICAgICAvLyBFYWNoIG9mIHRoZXNlIHdpbGwgYmVjb21lIGl0cyBvd24gYXJyYXkgaW4gdHVybiBhcyB3ZSBuYXJyb3cgaXQgZG93bi5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgdG8gcHJldmVudCBhIHN1Yi1zZWxlY3Rpb24gaW4gb25lIGNhdGVnb3J5IGZyb20gb3ZlcnJpZGluZyBhIHN1Yi1zZWxlY3Rpb24gaW4gdGhlIG90aGVycy5cblxuICAgICAgICAgICAgdmFyIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBwcm90ZWluTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcblxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdlIG9ubHkgdHJ5IHRvIGZpbHRlciBpZiB3ZSBnb3QgbWVhc3VyZW1lbnRzIHRoYXQgYXBwbHkgdG8gdGhlIHdpZGdldCB0eXBlc1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhtZXRhYm9saXRlTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdGVpbk1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKHByb3RlaW5NZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZU1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lcmljRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lcmljTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZXJpY01lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9uY2Ugd2UndmUgZmluaXNoZWQgd2l0aCB0aGUgZmlsdGVyaW5nLCB3ZSB3YW50IHRvIHNlZSBpZiBhbnkgc3ViLXNlbGVjdGlvbnMgaGF2ZSBiZWVuIG1hZGUgYWNyb3NzXG4gICAgICAgICAgICAvLyBhbnkgb2YgdGhlIGNhdGVnb3JpZXMsIGFuZCBpZiBzbywgbWVyZ2UgdGhvc2Ugc3ViLXNlbGVjdGlvbnMgaW50byBvbmUuXG5cbiAgICAgICAgICAgIC8vIFRoZSBpZGVhIGlzLCB3ZSBkaXNwbGF5IGV2ZXJ5dGhpbmcgdW50aWwgdGhlIHVzZXIgbWFrZXMgYSBzZWxlY3Rpb24gaW4gb25lIG9yIG1vcmUgb2YgdGhlIG1haW4gY2F0ZWdvcmllcyxcbiAgICAgICAgICAgIC8vIHRoZW4gZHJvcCBldmVyeXRoaW5nIGZyb20gdGhlIGNhdGVnb3JpZXMgdGhhdCBjb250YWluIG5vIHNlbGVjdGlvbnMuXG5cbiAgICAgICAgICAgIC8vIEFuIGV4YW1wbGUgc2NlbmFyaW8gd2lsbCBleHBsYWluIHdoeSB0aGlzIGlzIGltcG9ydGFudDpcblxuICAgICAgICAgICAgLy8gU2F5IGEgdXNlciBpcyBwcmVzZW50ZWQgd2l0aCB0d28gY2F0ZWdvcmllcywgTWV0YWJvbGl0ZSBhbmQgTWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAvLyBNZXRhYm9saXRlIGhhcyBjcml0ZXJpYSAnQWNldGF0ZScgYW5kICdFdGhhbm9sJyBhdmFpbGFibGUuXG4gICAgICAgICAgICAvLyBNZWFzdXJlbWVudCBoYXMgb25seSBvbmUgY3JpdGVyaWEgYXZhaWxhYmxlLCAnT3B0aWNhbCBEZW5zaXR5Jy5cbiAgICAgICAgICAgIC8vIEJ5IGRlZmF1bHQsIEFjZXRhdGUsIEV0aGFub2wsIGFuZCBPcHRpY2FsIERlbnNpdHkgYXJlIGFsbCB1bmNoZWNrZWQsIGFuZCBhbGwgdmlzaWJsZSBvbiB0aGUgZ3JhcGguXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gJ3JldHVybiBtZWFzdXJlbWVudHMnIGJlbG93LlxuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjaGVja3MgJ0FjZXRhdGUnLCB0aGV5IGV4cGVjdCBvbmx5IEFjZXRhdGUgdG8gYmUgZGlzcGxheWVkLCBldmVuIHRob3VnaCBubyBjaGFuZ2UgaGFzIGJlZW4gbWFkZSB0b1xuICAgICAgICAgICAgLy8gdGhlIE1lYXN1cmVtZW50IHNlY3Rpb24gd2hlcmUgT3B0aWNhbCBEZW5zaXR5IGlzIGxpc3RlZC5cbiAgICAgICAgICAgIC8vIEluIHRoZSBjb2RlIGJlbG93LCBieSB0ZXN0aW5nIGZvciBhbnkgY2hlY2tlZCBib3hlcyBpbiB0aGUgbWV0YWJvbGl0ZUZpbHRlcnMgZmlsdGVycyxcbiAgICAgICAgICAgIC8vIHdlIHJlYWxpemUgdGhhdCB0aGUgc2VsZWN0aW9uIGhhcyBiZWVuIG5hcnJvd2VkIGRvd24sIHNvIHdlIGFwcGVuZCB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMgb250byBkU00uXG4gICAgICAgICAgICAvLyBUaGVuIHdoZW4gd2UgY2hlY2sgdGhlIG1lYXN1cmVtZW50RmlsdGVycyBmaWx0ZXJzLCB3ZSBzZWUgdGhhdCB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiBoYXNcbiAgICAgICAgICAgIC8vIG5vdCBuYXJyb3dlZCBkb3duIGl0cyBzZXQgb2YgbWVhc3VyZW1lbnRzLCBzbyB3ZSBza2lwIGFwcGVuZGluZyB0aG9zZSB0byBkU00uXG4gICAgICAgICAgICAvLyBUaGUgZW5kIHJlc3VsdCBpcyBvbmx5IHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cy5cblxuICAgICAgICAgICAgLy8gVGhlbiBzdXBwb3NlIHRoZSB1c2VyIGNoZWNrcyAnT3B0aWNhbCBEZW5zaXR5JywgaW50ZW5kaW5nIHRvIGNvbXBhcmUgQWNldGF0ZSBkaXJlY3RseSBhZ2FpbnN0IE9wdGljYWwgRGVuc2l0eS5cbiAgICAgICAgICAgIC8vIFNpbmNlIG1lYXN1cmVtZW50RmlsdGVycyBub3cgaGFzIGNoZWNrZWQgYm94ZXMsIHdlIHB1c2ggaXRzIG1lYXN1cmVtZW50cyBvbnRvIGRTTSxcbiAgICAgICAgICAgIC8vIHdoZXJlIGl0IGNvbWJpbmVzIHdpdGggdGhlIEFjZXRhdGUuXG5cbiAgICAgICAgICAgIHZhciBhbnlDaGVja2VkID0gKGZpbHRlcjogR2VuZXJpY0ZpbHRlclNlY3Rpb24pOiBib29sZWFuID0+IHsgcmV0dXJuIGZpbHRlci5hbnlDaGVja2JveGVzQ2hlY2tlZDsgfTtcblxuICAgICAgICAgICAgdmFyIGRTTTogYW55W10gPSBbXTsgICAgLy8gXCJEZWxpYmVyYXRlbHkgc2VsZWN0ZWQgbWVhc3VyZW1lbnRzXCJcbiAgICAgICAgICAgIGlmICggdGhpcy5tZXRhYm9saXRlRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQobWV0YWJvbGl0ZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgdGhpcy5wcm90ZWluRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQocHJvdGVpbk1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgICAgdGhpcy5nZW5lRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZXJpY01lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmIChkU00ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRTTTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtZWFzdXJlbWVudElkcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlZHJhdyBncmFwaCB3aXRoIG5ldyBtZWFzdXJlbWVudCB0eXBlcy5cbiAgICAgICAgY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZT86IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICAgICAgICAgIHZhciByZWRyYXc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIGRvIG5vdCByZWRyYXcgaWYgZ3JhcGggaXMgbm90IGluaXRpYWxpemVkIHlldFxuICAgICAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVkcmF3ID0gISFmb3JjZTtcbiAgICAgICAgICAgICAgICAvLyBXYWxrIGRvd24gdGhlIGZpbHRlciB3aWRnZXQgbGlzdC4gIElmIHdlIGVuY291bnRlciBvbmUgd2hvc2UgY29sbGVjdGl2ZSBjaGVja2JveFxuICAgICAgICAgICAgICAgIC8vIHN0YXRlIGhhcyBjaGFuZ2VkIHNpbmNlIHdlIGxhc3QgbWFkZSB0aGlzIHdhbGssIHRoZW4gYSByZWRyYXcgaXMgcmVxdWlyZWQuIE5vdGUgdGhhdFxuICAgICAgICAgICAgICAgIC8vIHdlIHNob3VsZCBub3Qgc2tpcCB0aGlzIGxvb3AsIGV2ZW4gaWYgd2UgYWxyZWFkeSBrbm93IGEgcmVkcmF3IGlzIHJlcXVpcmVkLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBjYWxsIHRvIGFueUNoZWNrYm94ZXNDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSBzZXRzIGludGVybmFsIHN0YXRlIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgICAgICAgICAvLyB3aWRnZXRzIHRoYXQgd2Ugd2lsbCB1c2UgbmV4dCB0aW1lIGFyb3VuZC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5hbGxGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWx0ZXIuYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZHJhdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZWRyYXc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIEEgZ2VuZXJpYyB2ZXJzaW9uIG9mIGEgZmlsdGVyaW5nIGNvbHVtbiBpbiB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gYmVuZWF0aCB0aGUgZ3JhcGggYXJlYSBvbiB0aGUgcGFnZSxcbiAgICAvLyBtZWFudCB0byBiZSBzdWJjbGFzc2VkIGZvciBzcGVjaWZpYyBjcml0ZXJpYS5cbiAgICAvLyBXaGVuIGluaXRpYWxpemVkIHdpdGggYSBzZXQgb2YgcmVjb3JkIElEcywgdGhlIGNvbHVtbiBpcyBmaWxsZWQgd2l0aCBsYWJlbGVkIGNoZWNrYm94ZXMsIG9uZSBmb3IgZWFjaFxuICAgIC8vIHVuaXF1ZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gY3JpdGVyaWEgZW5jb3VudGVyZWQgaW4gdGhlIHJlY29yZHMuXG4gICAgLy8gRHVyaW5nIHVzZSwgYW5vdGhlciBzZXQgb2YgcmVjb3JkIElEcyBpcyBwYXNzZWQgaW4sIGFuZCBpZiBhbnkgY2hlY2tib3hlcyBhcmUgY2hlY2tlZCwgdGhlIElEIHNldCBpc1xuICAgIC8vIG5hcnJvd2VkIGRvd24gdG8gb25seSB0aG9zZSByZWNvcmRzIHRoYXQgY29udGFpbiB0aGUgY2hlY2tlZCB2YWx1ZXMuXG4gICAgLy8gQ2hlY2tib3hlcyB3aG9zZSB2YWx1ZXMgYXJlIG5vdCByZXByZXNlbnRlZCBhbnl3aGVyZSBpbiB0aGUgZ2l2ZW4gSURzIGFyZSB0ZW1wb3JhcmlseSBkaXNhYmxlZCxcbiAgICAvLyB2aXN1YWxseSBpbmRpY2F0aW5nIHRvIGEgdXNlciB0aGF0IHRob3NlIHZhbHVlcyBhcmUgbm90IGF2YWlsYWJsZSBmb3IgZnVydGhlciBmaWx0ZXJpbmcuIFxuICAgIC8vIFRoZSBmaWx0ZXJzIGFyZSBtZWFudCB0byBiZSBjYWxsZWQgaW4gc2VxdWVuY2UsIGZlZWRpbmcgZWFjaCByZXR1cm5lZCBJRCBzZXQgaW50byB0aGUgbmV4dCxcbiAgICAvLyBwcm9ncmVzc2l2ZWx5IG5hcnJvd2luZyBkb3duIHRoZSBlbmFibGVkIGNoZWNrYm94ZXMuXG4gICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gc3ViY2xhc3MgdGhpcyBmb3IgZWFjaCBncm91cCB0eXBlLlxuICAgIGV4cG9ydCBjbGFzcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgLy8gQSBkaWN0aW9uYXJ5IG9mIHRoZSB1bmlxdWUgdmFsdWVzIGZvdW5kIGZvciBmaWx0ZXJpbmcgYWdhaW5zdCwgYW5kIHRoZSBkaWN0aW9uYXJ5J3MgY29tcGxlbWVudC5cbiAgICAgICAgLy8gRWFjaCB1bmlxdWUgSUQgaXMgYW4gaW50ZWdlciwgYXNjZW5kaW5nIGZyb20gMSwgaW4gdGhlIG9yZGVyIHRoZSB2YWx1ZSB3YXMgZmlyc3QgZW5jb3VudGVyZWRcbiAgICAgICAgLy8gd2hlbiBleGFtaW5pbmcgdGhlIHJlY29yZCBkYXRhIGluIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoLlxuICAgICAgICB1bmlxdWVWYWx1ZXM6IFVuaXF1ZUlEVG9WYWx1ZTtcbiAgICAgICAgdW5pcXVlSW5kZXhlczogVmFsdWVUb1VuaXF1ZUlEO1xuICAgICAgICB1bmlxdWVJbmRleENvdW50ZXI6IG51bWJlcjtcblxuICAgICAgICAvLyBUaGUgc29ydGVkIG9yZGVyIG9mIHRoZSBsaXN0IG9mIHVuaXF1ZSB2YWx1ZXMgZm91bmQgaW4gdGhlIGZpbHRlclxuICAgICAgICB1bmlxdWVWYWx1ZXNPcmRlcjogbnVtYmVyW107XG5cbiAgICAgICAgLy8gQSBkaWN0aW9uYXJ5IHJlc29sdmluZyBhIHJlY29yZCBJRCAoYXNzYXkgSUQsIG1lYXN1cmVtZW50IElEKSB0byBhbiBhcnJheS4gRWFjaCBhcnJheVxuICAgICAgICAvLyBjb250YWlucyB0aGUgaW50ZWdlciBpZGVudGlmaWVycyBvZiB0aGUgdW5pcXVlIHZhbHVlcyB0aGF0IGFwcGx5IHRvIHRoYXQgcmVjb3JkLlxuICAgICAgICAvLyAoSXQncyByYXJlLCBidXQgdGhlcmUgY2FuIGFjdHVhbGx5IGJlIG1vcmUgdGhhbiBvbmUgY3JpdGVyaWEgdGhhdCBtYXRjaGVzIGEgZ2l2ZW4gSUQsXG4gICAgICAgIC8vICBmb3IgZXhhbXBsZSBhIExpbmUgd2l0aCB0d28gZmVlZHMgYXNzaWduZWQgdG8gaXQuKVxuICAgICAgICBmaWx0ZXJIYXNoOiBWYWx1ZVRvVW5pcXVlTGlzdDtcbiAgICAgICAgLy8gRGljdGlvbmFyeSByZXNvbHZpbmcgdGhlIGZpbHRlciB2YWx1ZSBpbnRlZ2VyIGlkZW50aWZpZXJzIHRvIEhUTUwgSW5wdXQgY2hlY2tib3hlcy5cbiAgICAgICAgY2hlY2tib3hlczoge1tpbmRleDogbnVtYmVyXTogSlF1ZXJ5fTtcbiAgICAgICAgLy8gRGljdGlvbmFyeSB1c2VkIHRvIGNvbXBhcmUgY2hlY2tib3hlcyB3aXRoIGEgcHJldmlvdXMgc3RhdGUgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYW5cbiAgICAgICAgLy8gdXBkYXRlIGlzIHJlcXVpcmVkLiBWYWx1ZXMgYXJlICdDJyBmb3IgY2hlY2tlZCwgJ1UnIGZvciB1bmNoZWNrZWQsIGFuZCAnTicgZm9yIG5vdFxuICAgICAgICAvLyBleGlzdGluZyBhdCB0aGUgdGltZS4gKCdOJyBjYW4gYmUgdXNlZnVsIHdoZW4gY2hlY2tib3hlcyBhcmUgcmVtb3ZlZCBmcm9tIGEgZmlsdGVyIGR1ZSB0b1xuICAgICAgICAvLyB0aGUgYmFjay1lbmQgZGF0YSBjaGFuZ2luZy4pXG4gICAgICAgIHByZXZpb3VzQ2hlY2tib3hTdGF0ZTogVW5pcXVlSURUb1ZhbHVlO1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHJlc29sdmluZyB0aGUgZmlsdGVyIHZhbHVlIGludGVnZXIgaWRlbnRpZmllcnMgdG8gSFRNTCB0YWJsZSByb3cgZWxlbWVudHMuXG4gICAgICAgIHRhYmxlUm93czoge1tpbmRleDogbnVtYmVyXTogSFRNTFRhYmxlUm93RWxlbWVudH07XG5cbiAgICAgICAgLy8gUmVmZXJlbmNlcyB0byBIVE1MIGVsZW1lbnRzIGNyZWF0ZWQgYnkgdGhlIGZpbHRlclxuICAgICAgICBmaWx0ZXJDb2x1bW5EaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBjbGVhckljb25zOiBKUXVlcnk7XG4gICAgICAgIHBsYWludGV4dFRpdGxlRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2VhcmNoQm94OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBzZWFyY2hCb3hUaXRsZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHNjcm9sbFpvbmVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBmaWx0ZXJpbmdUYWJsZTogSlF1ZXJ5O1xuICAgICAgICB0YWJsZUJvZHlFbGVtZW50OiBIVE1MVGFibGVFbGVtZW50O1xuXG4gICAgICAgIC8vIFNlYXJjaCBib3ggcmVsYXRlZFxuICAgICAgICB0eXBpbmdUaW1lb3V0OiBudW1iZXI7XG4gICAgICAgIHR5cGluZ0RlbGF5OiBudW1iZXI7XG4gICAgICAgIGN1cnJlbnRTZWFyY2hTZWxlY3Rpb246IHN0cmluZztcbiAgICAgICAgcHJldmlvdXNTZWFyY2hTZWxlY3Rpb246IHN0cmluZztcbiAgICAgICAgbWluQ2hhcnNUb1RyaWdnZXJTZWFyY2g6IG51bWJlcjtcblxuICAgICAgICBhbnlDaGVja2JveGVzQ2hlY2tlZDogYm9vbGVhbjtcblxuICAgICAgICBzZWN0aW9uVGl0bGU6IHN0cmluZztcbiAgICAgICAgc2VjdGlvblNob3J0TGFiZWw6IHN0cmluZztcblxuICAgICAgICAvLyBUT0RPOiBDb252ZXJ0IHRvIGEgcHJvdGVjdGVkIGNvbnN0cnVjdG9yISBUaGVuIHVzZSBhIGZhY3RvcnkgbWV0aG9kIHRvIGNyZWF0ZSBvYmplY3RzXG4gICAgICAgIC8vICAgIHdpdGggY29uZmlndXJlKCkgYWxyZWFkeSBjYWxsZWQuIFR5cGVzY3JpcHQgMS44IGRvZXMgbm90IHN1cHBvcnQgdmlzaWJpbGl0eVxuICAgICAgICAvLyAgICBtb2RpZmllcnMgb24gY29uc3RydWN0b3JzLCBzdXBwb3J0IGlzIGFkZGVkIGluIFR5cGVzY3JpcHQgMi4wXG4gICAgICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleENvdW50ZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IFtdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy50eXBpbmdEZWxheSA9IDMzMDsgICAgLy8gVE9ETzogTm90IGltcGxlbWVudGVkXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2ggPSAxO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICB9XG5cblxuICAgICAgICBjb25maWd1cmUodGl0bGU6IHN0cmluZz0nR2VuZXJpYyBGaWx0ZXInLCBzaG9ydExhYmVsOiBzdHJpbmc9J2dmJyk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSB0aXRsZTtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSBzaG9ydExhYmVsO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVDb250YWluZXJPYmplY3RzKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENyZWF0ZSBhbGwgdGhlIGNvbnRhaW5lciBIVE1MIG9iamVjdHNcbiAgICAgICAgY3JlYXRlQ29udGFpbmVyT2JqZWN0cygpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBzQm94SUQ6IHN0cmluZyA9ICdmaWx0ZXInICsgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCArICdTZWFyY2hCb3gnLFxuICAgICAgICAgICAgICAgIHNCb3g6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckNvbHVtbkRpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ29sdW1uJylbMF07XG4gICAgICAgICAgICB2YXIgdGV4dFRpdGxlID0gJChcIjxzcGFuPlwiKS5hZGRDbGFzcygnZmlsdGVyVGl0bGUnKS50ZXh0KHRoaXMuc2VjdGlvblRpdGxlKTtcbiAgICAgICAgICAgIHZhciBjbGVhckljb24gPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJDbGVhckljb24nKTtcbiAgICAgICAgICAgIHRoaXMucGxhaW50ZXh0VGl0bGVEaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckhlYWQnKS5hcHBlbmQoY2xlYXJJY29uKS5hcHBlbmQodGV4dFRpdGxlKVswXTtcblxuICAgICAgICAgICAgJChzQm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpKVxuICAgICAgICAgICAgICAgIC5hdHRyKHtcbiAgICAgICAgICAgICAgICAgICAgJ2lkJzogc0JveElELFxuICAgICAgICAgICAgICAgICAgICAnbmFtZSc6IHNCb3hJRCxcbiAgICAgICAgICAgICAgICAgICAgJ3BsYWNlaG9sZGVyJzogdGhpcy5zZWN0aW9uVGl0bGUsXG4gICAgICAgICAgICAgICAgICAgICdzaXplJzogMTRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNCb3guc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RleHQnKTsgLy8gSlF1ZXJ5IC5hdHRyKCkgY2Fubm90IHNldCB0aGlzXG4gICAgICAgICAgICB0aGlzLnNlYXJjaEJveCA9IHNCb3g7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHR3byBjbGVhciBpY2NvbnMgZm9yIHRoZSB0d28gdmVyc2lvbnMgb2YgdGhlIGhlYWRlclxuICAgICAgICAgICAgdmFyIHNlYXJjaENsZWFySWNvbiA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNsZWFySWNvbicpO1xuICAgICAgICAgICAgdGhpcy5zZWFyY2hCb3hUaXRsZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVySGVhZFNlYXJjaCcpLmFwcGVuZChzZWFyY2hDbGVhckljb24pLmFwcGVuZChzQm94KVswXTtcblxuICAgICAgICAgICAgdGhpcy5jbGVhckljb25zID0gY2xlYXJJY29uLmFkZChzZWFyY2hDbGVhckljb24pOyAgICAvLyBDb25zb2xpZGF0ZSB0aGUgdHdvIEpRdWVyeSBlbGVtZW50cyBpbnRvIG9uZVxuXG4gICAgICAgICAgICB0aGlzLmNsZWFySWNvbnMub24oJ2NsaWNrJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gQ2hhbmdpbmcgdGhlIGNoZWNrZWQgc3RhdHVzIHdpbGwgYXV0b21hdGljYWxseSB0cmlnZ2VyIGEgcmVmcmVzaCBldmVudFxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmNoZWNrYm94ZXMgfHwge30sIChpZDogbnVtYmVyLCBjaGVja2JveDogSlF1ZXJ5KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWm9uZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFTY3JvbGxab25lJylbMF07XG4gICAgICAgICAgICB0aGlzLmZpbHRlcmluZ1RhYmxlID0gJChcIjx0YWJsZT5cIilcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2ZpbHRlckNyaXRlcmlhVGFibGUgZHJhZ2JveGVzJylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdjZWxscGFkZGluZyc6IDAsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kKHRoaXMudGFibGVCb2R5RWxlbWVudCA9IDxIVE1MVGFibGVFbGVtZW50PiQoXCI8dGJvZHk+XCIpWzBdKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciB1c2VkVmFsdWVzOiBWYWx1ZVRvVW5pcXVlSUQsIGNyU2V0OiBudW1iZXJbXSwgY0hhc2g6IFVuaXF1ZUlEVG9WYWx1ZSxcbiAgICAgICAgICAgICAgICBwcmV2aW91c0lkczogc3RyaW5nW107XG4gICAgICAgICAgICAvLyBjYW4gZ2V0IElEcyBmcm9tIG11bHRpcGxlIGFzc2F5cywgZmlyc3QgbWVyZ2Ugd2l0aCB0aGlzLmZpbHRlckhhc2hcbiAgICAgICAgICAgIHByZXZpb3VzSWRzID0gJC5tYXAodGhpcy5maWx0ZXJIYXNoIHx8IHt9LCAoXywgcHJldmlvdXNJZDogc3RyaW5nKSA9PiBwcmV2aW91c0lkKTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhZGRlZElkOiBzdHJpbmcpOiB2b2lkID0+IHsgdGhpcy5maWx0ZXJIYXNoW2FkZGVkSWRdID0gW107IH0pO1xuICAgICAgICAgICAgaWRzID0gJC5tYXAodGhpcy5maWx0ZXJIYXNoIHx8IHt9LCAoXywgcHJldmlvdXNJZDogc3RyaW5nKSA9PiBwcmV2aW91c0lkKTtcbiAgICAgICAgICAgIC8vIHNraXAgb3ZlciBidWlsZGluZyB1bmlxdWUgdmFsdWVzIGFuZCBzb3J0aW5nIHdoZW4gbm8gbmV3IElEcyBhZGRlZFxuICAgICAgICAgICAgaWYgKGlkcy5sZW5ndGggPiBwcmV2aW91c0lkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkcyk7XG4gICAgICAgICAgICAgICAgY3JTZXQgPSBbXTtcbiAgICAgICAgICAgICAgICBjSGFzaCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhIHJldmVyc2VkIGhhc2ggc28ga2V5cyBtYXAgdmFsdWVzIGFuZCB2YWx1ZXMgbWFwIGtleXNcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy51bmlxdWVJbmRleGVzLCAodmFsdWU6IHN0cmluZywgdW5pcXVlSUQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjSGFzaFt1bmlxdWVJRF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgY3JTZXQucHVzaCh1bmlxdWVJRCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gQWxwaGFiZXRpY2FsbHkgc29ydCBhbiBhcnJheSBvZiB0aGUga2V5cyBhY2NvcmRpbmcgdG8gdmFsdWVzXG4gICAgICAgICAgICAgICAgY3JTZXQuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgX2E6c3RyaW5nID0gY0hhc2hbYV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9iOnN0cmluZyA9IGNIYXNoW2JdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBfYSA8IF9iID8gLTEgOiBfYSA+IF9iID8gMSA6IDA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSBjSGFzaDtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyID0gY3JTZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEluIHRoaXMgZnVuY3Rpb24gYXJlIHJ1bm5pbmcgdGhyb3VnaCB0aGUgZ2l2ZW4gbGlzdCBvZiBtZWFzdXJlbWVudCBJRHMgYW5kIGV4YW1pbmluZ1xuICAgICAgICAvLyB0aGVpciByZWNvcmRzIGFuZCByZWxhdGVkIHJlY29yZHMsIGxvY2F0aW5nIHRoZSBwYXJ0aWN1bGFyIGZpZWxkIHdlIGFyZSBpbnRlcmVzdGVkIGluLFxuICAgICAgICAvLyBhbmQgY3JlYXRpbmcgYSBsaXN0IG9mIGFsbCB0aGUgdW5pcXVlIHZhbHVlcyBmb3IgdGhhdCBmaWVsZC4gIEFzIHdlIGdvLCB3ZSBtYXJrIGVhY2hcbiAgICAgICAgLy8gdW5pcXVlIHZhbHVlIHdpdGggYW4gaW50ZWdlciBVSUQsIGFuZCBjb25zdHJ1Y3QgYSBoYXNoIHJlc29sdmluZyBlYWNoIHJlY29yZCB0byBvbmUgKG9yXG4gICAgICAgIC8vIHBvc3NpYmx5IG1vcmUpIG9mIHRob3NlIGludGVnZXIgVUlEcy4gIFRoaXMgcHJlcGFyZXMgdXMgZm9yIHF1aWNrIGZpbHRlcmluZyBsYXRlciBvbi5cbiAgICAgICAgLy8gKFRoaXMgZ2VuZXJpYyBmaWx0ZXIgZG9lcyBub3RoaW5nLCBzbyB3ZSBsZWF2ZSB0aGVzZSBzdHJ1Y3R1cmVzIGJsYW5rLilcbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY29tZSB1cCB3aXRoIDIgb3IgbW9yZSBjcml0ZXJpYSwgdGhlcmUgaXMgbm8gcG9pbnQgaW4gZGlzcGxheWluZyB0aGUgZmlsdGVyLlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICBhZGRUb1BhcmVudChwYXJlbnREaXYpOnZvaWQge1xuICAgICAgICAgICAgcGFyZW50RGl2LmFwcGVuZENoaWxkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgZGV0YWNoKCk6dm9pZCB7XG4gICAgICAgICAgICAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KS5kZXRhY2goKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgYXBwbHlCYWNrZ3JvdW5kU3R5bGUoZGFya2VyOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICAgICAgJCh0aGlzLmZpbHRlckNvbHVtbkRpdikucmVtb3ZlQ2xhc3MoZGFya2VyID8gJ3N0cmlwZVJvd0InIDogJ3N0cmlwZVJvd0EnKTtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmFkZENsYXNzKGRhcmtlciA/ICdzdHJpcGVSb3dBJyA6ICdzdHJpcGVSb3dCJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJ1bnMgdGhyb3VnaCB0aGUgdmFsdWVzIGluIHVuaXF1ZVZhbHVlc09yZGVyLCBhZGRpbmcgYSBjaGVja2JveCBhbmQgbGFiZWwgZm9yIGVhY2hcbiAgICAgICAgLy8gZmlsdGVyaW5nIHZhbHVlIHJlcHJlc2VudGVkLiAgSWYgdGhlcmUgYXJlIG1vcmUgdGhhbiAxNSB2YWx1ZXMsIHRoZSBmaWx0ZXIgZ2V0c1xuICAgICAgICAvLyBhIHNlYXJjaCBib3ggYW5kIHNjcm9sbGJhci5cbiAgICAgICAgcG9wdWxhdGVUYWJsZSgpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGZDb2wgPSAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KTtcbiAgICAgICAgICAgIGZDb2wuY2hpbGRyZW4oKS5kZXRhY2goKTtcbiAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoZSBzY3JvbGxpbmcgY29udGFpbmVyIGRpdiBpZiB0aGUgc2l6ZSBvZiB0aGUgbGlzdCB3YXJyYW50cyBpdCwgYmVjYXVzZVxuICAgICAgICAgICAgLy8gdGhlIHNjcm9sbGluZyBjb250YWluZXIgZGl2IGRlY2xhcmVzIGEgbGFyZ2UgcGFkZGluZyBtYXJnaW4gZm9yIHRoZSBzY3JvbGwgYmFyLFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgcGFkZGluZyBtYXJnaW4gd291bGQgYmUgYW4gZW1wdHkgd2FzdGUgb2Ygc3BhY2Ugb3RoZXJ3aXNlLlxuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMTUpIHtcbiAgICAgICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLnNlYXJjaEJveFRpdGxlRGl2KS5hcHBlbmQodGhpcy5zY3JvbGxab25lRGl2KTtcbiAgICAgICAgICAgICAgICAvLyBDaGFuZ2UgdGhlIHJlZmVyZW5jZSBzbyB3ZSdyZSBhZmZlY3RpbmcgdGhlIGlubmVySFRNTCBvZiB0aGUgY29ycmVjdCBkaXYgbGF0ZXIgb25cbiAgICAgICAgICAgICAgICBmQ29sID0gJCh0aGlzLnNjcm9sbFpvbmVEaXYpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLnBsYWludGV4dFRpdGxlRGl2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMuZmlsdGVyaW5nVGFibGUpO1xuXG4gICAgICAgICAgICB2YXIgdEJvZHkgPSB0aGlzLnRhYmxlQm9keUVsZW1lbnQ7XG4gICAgICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCB0YWJsZSBjb250ZW50c1xuICAgICAgICAgICAgJCh0aGlzLnRhYmxlQm9keUVsZW1lbnQpLmVtcHR5KCk7XG5cbiAgICAgICAgICAgIHRoaXMudGFibGVSb3dzID0ge307XG4gICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXMgPSB7fTtcblxuICAgICAgICAgICAgdmFyIGdyYXBoSGVscGVyID0gT2JqZWN0LmNyZWF0ZShHcmFwaEhlbHBlck1ldGhvZHMpO1xuICAgICAgICAgICAgdmFyIGNvbG9yT2JqID0gZ3JhcGhIZWxwZXIucmVuZGVyQ29sb3IoRURERGF0YS5MaW5lcyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vYWRkIGNvbG9yIG9iaiB0byBFREREYXRhIFxuICAgICAgICAgICAgRURERGF0YVsnY29sb3InXSA9IGNvbG9yT2JqO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBsaW5lIGxhYmVsIGNvbG9yIGJhc2VkIG9uIGdyYXBoIGNvbG9yIG9mIGxpbmUgXG4gICAgICAgICAgICBpZiAodGhpcy5zZWN0aW9uVGl0bGUgPT09IFwiTGluZVwiKSB7ICAgIC8vIFRPRE86IEZpbmQgYSBiZXR0ZXIgd2F5IHRvIGlkZW50aWZ5IHRoaXMgc2VjdGlvblxuICAgICAgICAgICAgICAgIHZhciBjb2xvcnM6YW55ID0ge307XG5cbiAgICAgICAgICAgICAgICAvL2NyZWF0ZSBuZXcgY29sb3JzIG9iamVjdCB3aXRoIGxpbmUgbmFtZXMgYSBrZXlzIGFuZCBjb2xvciBoZXggYXMgdmFsdWVzIFxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBFREREYXRhLkxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yc1tFREREYXRhLkxpbmVzW2tleV0ubmFtZV0gPSBjb2xvck9ialtrZXldXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgodW5pcXVlSWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjYm94TmFtZSwgY2VsbCwgcCwgcSwgcjtcbiAgICAgICAgICAgICAgICBjYm94TmFtZSA9IFsnZmlsdGVyJywgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCwgJ24nLCB1bmlxdWVJZCwgJ2Nib3gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlUm93c1t1bmlxdWVJZF0gPSA8SFRNTFRhYmxlUm93RWxlbWVudD50aGlzLnRhYmxlQm9keUVsZW1lbnQuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXS5pbnNlcnRDZWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzW3VuaXF1ZUlkXSA9ICQoXCI8aW5wdXQgdHlwZT0nY2hlY2tib3gnPlwiKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICduYW1lJzogY2JveE5hbWUsICdpZCc6IGNib3hOYW1lIH0pXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBFREREYXRhLkxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2tleV0ubmFtZSA9PSB0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgKEVERERhdGEuTGluZXNba2V5XVsnaWRlbnRpZmllciddID0gY2JveE5hbWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgY2JveE5hbWUpLnRleHQodGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKVxuICAgICAgICAgICAgICAgICAgICAuY3NzKCdmb250LXdlaWdodCcsICdCb2xkJykuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKCh1bmlxdWVJZDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjYm94TmFtZSwgY2VsbCwgcCwgcSwgcjtcbiAgICAgICAgICAgICAgICAgICAgY2JveE5hbWUgPSBbJ2ZpbHRlcicsIHRoaXMuc2VjdGlvblNob3J0TGFiZWwsICduJywgdW5pcXVlSWQsICdjYm94J10uam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXSA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGVCb2R5RWxlbWVudC5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXS5pbnNlcnRDZWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlc1t1bmlxdWVJZF0gPSAkKFwiPGlucHV0IHR5cGU9J2NoZWNrYm94Jz5cIilcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ25hbWUnOiBjYm94TmFtZSwgJ2lkJzogY2JveE5hbWUgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsIGNib3hOYW1lKS50ZXh0KHRoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFRPRE86IERyYWcgc2VsZWN0IGlzIHR3aXRjaHkgLSBjbGlja2luZyBhIHRhYmxlIGNlbGwgYmFja2dyb3VuZCBzaG91bGQgY2hlY2sgdGhlIGJveCxcbiAgICAgICAgICAgIC8vIGV2ZW4gaWYgdGhlIHVzZXIgaXNuJ3QgaGl0dGluZyB0aGUgbGFiZWwgb3IgdGhlIGNoZWNrYm94IGl0c2VsZi5cbiAgICAgICAgICAgIERyYWdib3hlcy5pbml0VGFibGUodGhpcy5maWx0ZXJpbmdUYWJsZSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJldHVybnMgdHJ1ZSBpZiBhbnkgb2YgdGhlIGNoZWNrYm94ZXMgc2hvdyBhIGRpZmZlcmVudCBzdGF0ZSB0aGFuIHdoZW4gdGhpcyBmdW5jdGlvbiB3YXNcbiAgICAgICAgLy8gbGFzdCBjYWxsZWRcbiAgICAgICAgYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgY3VycmVudENoZWNrYm94U3RhdGU6IFVuaXF1ZUlEVG9WYWx1ZSA9IHt9LFxuICAgICAgICAgICAgICAgIHY6IHN0cmluZyA9ICQodGhpcy5zZWFyY2hCb3gpLnZhbCgpO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuY2hlY2tib3hlcyB8fCB7fSwgKHVuaXF1ZUlkOiBudW1iZXIsIGNoZWNrYm94OiBKUXVlcnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudCwgcHJldmlvdXM7XG4gICAgICAgICAgICAgICAgLy8gXCJDXCIgLSBjaGVja2VkLCBcIlVcIiAtIHVuY2hlY2tlZCwgXCJOXCIgLSBkb2Vzbid0IGV4aXN0XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IChjaGVja2JveC5wcm9wKCdjaGVja2VkJykgJiYgIWNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJykpID8gJ0MnIDogJ1UnO1xuICAgICAgICAgICAgICAgIHByZXZpb3VzID0gdGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbdW5pcXVlSWRdIHx8ICdOJztcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCAhPT0gcHJldmlvdXMpIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ID09PSAnQycpIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDaGVja2JveFN0YXRlW3VuaXF1ZUlkXSA9IGN1cnJlbnQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucy50b2dnbGVDbGFzcygnZW5hYmxlZCcsIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQpO1xuXG4gICAgICAgICAgICB2ID0gdi50cmltKCk7ICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4gICAgICAgICAgICB2ID0gdi50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgdiA9IHYucmVwbGFjZSgvXFxzXFxzKi8sICcgJyk7IC8vIFJlcGxhY2UgaW50ZXJuYWwgd2hpdGVzcGFjZSB3aXRoIHNpbmdsZSBzcGFjZXNcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICBpZiAodiAhPT0gdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSB2O1xuICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlbid0IGRldGVjdGVkIGFueSBjaGFuZ2Ugc28gZmFyLCB0aGVyZSBpcyBvbmUgbW9yZSBhbmdsZSB0byBjb3ZlcjpcbiAgICAgICAgICAgICAgICAvLyBDaGVja2JveGVzIHRoYXQgdXNlZCB0byBleGlzdCwgYnV0IGhhdmUgc2luY2UgYmVlbiByZW1vdmVkIGZyb20gdGhlIHNldC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGUsIChyb3dJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudENoZWNrYm94U3RhdGVbcm93SWRdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IGN1cnJlbnRDaGVja2JveFN0YXRlO1xuICAgICAgICAgICAgcmV0dXJuIGNoYW5nZWQ7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRha2VzIGEgc2V0IG9mIHJlY29yZCBJRHMsIGFuZCBpZiBhbnkgY2hlY2tib3hlcyBpbiB0aGUgZmlsdGVyJ3MgVUkgYXJlIGNoZWNrZWQsXG4gICAgICAgIC8vIHRoZSBJRCBzZXQgaXMgbmFycm93ZWQgZG93biB0byBvbmx5IHRob3NlIHJlY29yZHMgdGhhdCBjb250YWluIHRoZSBjaGVja2VkIHZhbHVlcy5cbiAgICAgICAgLy8gQ2hlY2tib3hlcyB3aG9zZSB2YWx1ZXMgYXJlIG5vdCByZXByZXNlbnRlZCBhbnl3aGVyZSBpbiB0aGUgZ2l2ZW4gSURzIGFyZSB0ZW1wb3JhcmlseSBkaXNhYmxlZFxuICAgICAgICAvLyBhbmQgc29ydGVkIHRvIHRoZSBib3R0b20gb2YgdGhlIGxpc3QsIHZpc3VhbGx5IGluZGljYXRpbmcgdG8gYSB1c2VyIHRoYXQgdGhvc2UgdmFsdWVzIGFyZSBub3RcbiAgICAgICAgLy8gYXZhaWxhYmxlIGZvciBmdXJ0aGVyIGZpbHRlcmluZy5cbiAgICAgICAgLy8gVGhlIG5hcnJvd2VkIHNldCBvZiBJRHMgaXMgdGhlbiByZXR1cm5lZCwgZm9yIHVzZSBieSB0aGUgbmV4dCBmaWx0ZXIuXG4gICAgICAgIGFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoaWRzOmFueVtdKTphbnkge1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgZmlsdGVyIG9ubHkgY29udGFpbnMgb25lIGl0ZW0sIGl0J3MgcG9pbnRsZXNzIHRvIGFwcGx5IGl0LlxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzRmlsdGVyVXNlZnVsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWRzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgaWRzUG9zdEZpbHRlcmluZzogYW55W107XG5cbiAgICAgICAgICAgIHZhciB1c2VTZWFyY2hCb3g6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgdmFyIHF1ZXJ5U3RycyA9IFtdO1xuXG4gICAgICAgICAgICB2YXIgdiA9IHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbjtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAodi5sZW5ndGggPj0gdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgd29yZHMsIHdlIG1hdGNoIGVhY2ggc2VwYXJhdGVseS5cbiAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBub3QgYXR0ZW1wdCB0byBtYXRjaCBhZ2FpbnN0IGVtcHR5IHN0cmluZ3MsIHNvIHdlIGZpbHRlciB0aG9zZSBvdXQgaWZcbiAgICAgICAgICAgICAgICAgICAgLy8gYW55IHNsaXBwZWQgdGhyb3VnaC5cbiAgICAgICAgICAgICAgICAgICAgcXVlcnlTdHJzID0gdi5zcGxpdCgvXFxzKy8pLmZpbHRlcigob25lKSA9PiB7IHJldHVybiBvbmUubGVuZ3RoID4gMDsgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSB1c2VyIG1pZ2h0IGhhdmUgcGFzdGVkL3R5cGVkIG9ubHkgd2hpdGVzcGFjZSwgc286XG4gICAgICAgICAgICAgICAgICAgIGlmIChxdWVyeVN0cnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXNlU2VhcmNoQm94ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmcgPSB7fTtcblxuICAgICAgICAgICAgdmFyIGluZGV4SXNWaXNpYmxlID0gKGluZGV4KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2g6Ym9vbGVhbiA9IHRydWUsIHRleHQ6c3RyaW5nO1xuICAgICAgICAgICAgICAgIGlmICh1c2VTZWFyY2hCb3gpIHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dCA9IHRoaXMudW5pcXVlVmFsdWVzW2luZGV4XS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICBtYXRjaCA9IHF1ZXJ5U3Rycy5zb21lKCh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGV4dC5sZW5ndGggPj0gdi5sZW5ndGggJiYgdGV4dC5pbmRleE9mKHYpID49IDA7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZ1tpbmRleF0gPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlW2luZGV4XSA9PT0gJ0MnKSB8fCAhdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWRzUG9zdEZpbHRlcmluZyA9IGlkcy5maWx0ZXIoKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBmaWx0ZXJpbmcgZGF0YSBmb3IgdGhpcyBpZCwgdXNlIGl0LlxuICAgICAgICAgICAgICAgIC8vIElmIHdlIGRvbid0LCB0aGUgaWQgcHJvYmFibHkgYmVsb25ncyB0byBzb21lIG90aGVyIG1lYXN1cmVtZW50IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIC8vIHNvIHdlIGlnbm9yZSBpdC5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maWx0ZXJIYXNoW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5maWx0ZXJIYXNoW2lkXS5zb21lKGluZGV4SXNWaXNpYmxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIGRvY3VtZW50IGZyYWdtZW50LCBhbmQgYWNjdW11bGF0ZSBpbnNpZGUgaXQgYWxsIHRoZSByb3dzIHdlIHdhbnQgdG8gZGlzcGxheSwgaW4gc29ydGVkIG9yZGVyLlxuICAgICAgICAgICAgdmFyIGZyYWcgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cbiAgICAgICAgICAgIHZhciByb3dzVG9BcHBlbmQgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgoY3JJRCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjaGVja2JveDogSlF1ZXJ5ID0gdGhpcy5jaGVja2JveGVzW2NySURdLFxuICAgICAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQgPSB0aGlzLnRhYmxlUm93c1tjcklEXSxcbiAgICAgICAgICAgICAgICAgICAgc2hvdzogYm9vbGVhbiA9ICEhdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZ1tjcklEXTtcbiAgICAgICAgICAgICAgICBjaGVja2JveC5wcm9wKCdkaXNhYmxlZCcsICFzaG93KVxuICAgICAgICAgICAgICAgICQocm93KS50b2dnbGVDbGFzcygnbm9kYXRhJywgIXNob3cpO1xuICAgICAgICAgICAgICAgIGlmIChzaG93KSB7XG4gICAgICAgICAgICAgICAgICAgIGZyYWcuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByb3dzVG9BcHBlbmQucHVzaChyb3cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gTm93LCBhcHBlbmQgYWxsIHRoZSByb3dzIHdlIGRpc2FibGVkLCBzbyB0aGV5IGdvIHRvIHRoZSBib3R0b20gb2YgdGhlIHRhYmxlXG4gICAgICAgICAgICByb3dzVG9BcHBlbmQuZm9yRWFjaCgocm93KSA9PiBmcmFnLmFwcGVuZENoaWxkKHJvdykpO1xuXG4gICAgICAgICAgICAvLyBSZW1lbWJlciB0aGF0IHdlIGxhc3Qgc29ydGVkIGJ5IHRoaXMgY29sdW1uXG4gICAgICAgICAgICB0aGlzLnRhYmxlQm9keUVsZW1lbnQuYXBwZW5kQ2hpbGQoZnJhZyk7XG5cbiAgICAgICAgICAgIHJldHVybiBpZHNQb3N0RmlsdGVyaW5nO1xuICAgICAgICB9XG5cblxuICAgICAgICBfYXNzYXlJZFRvQXNzYXkoYXNzYXlJZDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgfVxuICAgICAgICBfYXNzYXlJZFRvTGluZShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9Qcm90b2NvbChhc3NheUlkOnN0cmluZyk6IFByb3RvY29sUmVjb3JkIHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSByZXR1cm4gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRJZE1hcFRvVmFsdWVzKCk6KGlkOnN0cmluZykgPT4gYW55W10ge1xuICAgICAgICAgICAgcmV0dXJuICgpID0+IFtdO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgU3RyYWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ1N0cmFpbicsICdzdCcpO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBzdHJhaW4gbmFtZVxuICAgICAgICAgICAgICAgIChsaW5lLnN0cmFpbiB8fCBbXSkuZm9yRWFjaCgoc3RyYWluSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3RyYWluID0gRURERGF0YS5TdHJhaW5zW3N0cmFpbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0cmFpbiAmJiBzdHJhaW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIENhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdDYXJib24gU291cmNlJywgJ2NzJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuY2FyYm9uIHx8IFtdKS5mb3JFYWNoKChjYXJib25JZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNyYyA9IEVERERhdGEuQ1NvdXJjZXNbY2FyYm9uSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3JjICYmIHNyYy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTGFiZWxpbmcnLCAnbCcpO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIGNhcmJvbiBzb3VyY2UgbGFiZWxpbmcgZGVzY3JpcHRpb25cbiAgICAgICAgICAgICAgICAobGluZS5jYXJib24gfHwgW10pLmZvckVhY2goKGNhcmJvbklkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3JjID0gRURERGF0YS5DU291cmNlc1tjYXJib25JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzcmMgJiYgc3JjLmxhYmVsaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU5hbWVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTGluZScsICdsbicpO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgUHJvdG9jb2xGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnUHJvdG9jb2wnLCAncCcpO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvdG9jb2w6IFByb3RvY29sUmVjb3JkID0gdGhpcy5fYXNzYXlJZFRvUHJvdG9jb2woYXNzYXlJZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgQXNzYXlTdWZmaXhGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnQXNzYXkgU3VmZml4JywgJ2EnKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIG1ldGFEYXRhSUQ6c3RyaW5nO1xuICAgICAgICBwcmU6c3RyaW5nO1xuICAgICAgICBwb3N0OnN0cmluZztcblxuICAgICAgICBjb25zdHJ1Y3RvcihtZXRhRGF0YUlEOnN0cmluZykge1xuICAgICAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgICAgIHZhciBNRFQgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbbWV0YURhdGFJRF07XG4gICAgICAgICAgICB0aGlzLm1ldGFEYXRhSUQgPSBtZXRhRGF0YUlEO1xuICAgICAgICAgICAgdGhpcy5wcmUgPSBNRFQucHJlIHx8ICcnO1xuICAgICAgICAgICAgdGhpcy5wb3N0ID0gTURULnBvc3QgfHwgJyc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKEVERERhdGEuTWV0YURhdGFUeXBlc1t0aGlzLm1ldGFEYXRhSURdLm5hbWUsICdtZCcrdGhpcy5tZXRhRGF0YUlEKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIExpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOiBhbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9LCB2YWx1ZSA9ICcoRW1wdHkpJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUubWV0YSAmJiBsaW5lLm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdLCB0aGlzLnBvc3QgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBhbnkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fSwgdmFsdWUgPSAnKEVtcHR5KSc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5tZXRhICYmIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSwgdGhpcy5wb3N0IF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdDb21wYXJ0bWVudCcsICdjb20nKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgdmFsdWU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVDb21wYXJ0bWVudHNbbWVhc3VyZS5jb21wYXJ0bWVudF0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOiBib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdNZWFzdXJlbWVudCcsICdtbScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChtSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgbUlkcy5mb3JFYWNoKChtZWFzdXJlSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICAgICAgdmFyIG1UeXBlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbVR5cGUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1UeXBlICYmIG1UeXBlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOmJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTWV0YWJvbGl0ZScsICdtZScpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZTogSWYgdGhlIGZpbHRlciBoYXMgYSBsb2FkIHBlbmRpbmcsIGl0J3MgXCJ1c2VmdWxcIiwgaS5lLiBkaXNwbGF5IGl0LlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgbWV0YWJvbGl0ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGUgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobWV0YWJvbGl0ZSAmJiBtZXRhYm9saXRlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIFByb3RlaW5GaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6Ym9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdQcm90ZWluJywgJ3ByJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIHByb3RlaW46IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3RlaW4gJiYgcHJvdGVpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBHZW5lRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOmJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnR2VuZScsICdnbicpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZTogSWYgdGhlIGZpbHRlciBoYXMgYSBsb2FkIHBlbmRpbmcsIGl0J3MgXCJ1c2VmdWxcIiwgaS5lLiBkaXNwbGF5IGl0LlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBnZW5lOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2VuZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChnZW5lICYmIGdlbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGUgcGFnZSBsb2Fkcy5cbiAgICBleHBvcnQgZnVuY3Rpb24gcHJlcGFyZUl0KCkge1xuXG4gICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0ID0gbmV3IFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0KHRoaXMpO1xuXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEgPSBudWxsO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuYXR0YWNobWVudElEcyA9IG51bGw7XG4gICAgICAgIHRoaXMuYXR0YWNobWVudHNCeUlEID0gbnVsbDtcbiAgICAgICAgdGhpcy5wcmV2RGVzY3JpcHRpb25FZGl0RWxlbWVudCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBJRCA9IC0xO1xuICAgICAgICB0aGlzLm1ldGFib2xpY01hcE5hbWUgPSBudWxsO1xuICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA9IC0xO1xuXG4gICAgICAgIHRoaXMuY1NvdXJjZUVudHJpZXMgPSBbXTtcbiAgICAgICAgdGhpcy5tVHlwZUVudHJpZXMgPSBbXTtcblxuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkID0gbnVsbDtcblxuICAgICAgICB0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBudWxsO1xuICAgICAgICB0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkU3BlY3MgPSB7fTtcbiAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZHMgPSB7fTtcblxuICAgICAgICAvLyBwdXQgdGhlIGNsaWNrIGhhbmRsZXIgYXQgdGhlIGRvY3VtZW50IGxldmVsLCB0aGVuIGZpbHRlciB0byBhbnkgbGluayBpbnNpZGUgYSAuZGlzY2xvc2VcbiAgICAgICAgJChkb2N1bWVudCkub24oJ2NsaWNrJywgJy5kaXNjbG9zZSAuZGlzY2xvc2VMaW5rJywgKGUpID0+IHtcbiAgICAgICAgICAgICQoZS50YXJnZXQpLmNsb3Nlc3QoJy5kaXNjbG9zZScpLnRvZ2dsZUNsYXNzKCdkaXNjbG9zZUhpZGUnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICd1cmwnOiAnZWRkZGF0YS8nLFxuICAgICAgICAgICAgJ3R5cGUnOiAnR0VUJyxcbiAgICAgICAgICAgICdlcnJvcic6ICh4aHIsIHN0YXR1cywgZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnTG9hZGluZyBFREREYXRhIGZhaWxlZDogJywgc3RhdHVzLCAnOycsIGVdLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgRURERGF0YSA9ICQuZXh0ZW5kKEVERERhdGEgfHwge30sIGRhdGEpO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJlcGFyZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YW50aWF0ZSBhIHRhYmxlIHNwZWNpZmljYXRpb24gZm9yIHRoZSBMaW5lcyB0YWJsZVxuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMgPSBuZXcgRGF0YUdyaWRTcGVjTGluZXMoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmluaXQoKTtcbiAgICAgICAgICAgICAgICAvLyBJbnN0YW50aWF0ZSB0aGUgdGFibGUgaXRzZWxmIHdpdGggdGhlIHNwZWNcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWQgPSBuZXcgRGF0YUdyaWQodGhpcy5saW5lc0RhdGFHcmlkU3BlYyk7XG4gICAgICAgICAgICAgICAgLy8gRmluZCBvdXQgd2hpY2ggcHJvdG9jb2xzIGhhdmUgYXNzYXlzIHdpdGggbWVhc3VyZW1lbnRzIC0gZGlzYWJsZWQgb3Igbm9cbiAgICAgICAgICAgICAgICB2YXIgcHJvdG9jb2xzV2l0aE1lYXN1cmVtZW50czphbnkgPSB7fTtcbiAgICAgICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkLCBhc3NheSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICBwcm90b2NvbHNXaXRoTWVhc3VyZW1lbnRzW2Fzc2F5LnBpZF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIEZvciBlYWNoIHByb3RvY29sIHdpdGggbWVhc3VyZW1lbnRzLCBjcmVhdGUgYSBEYXRhR3JpZEFzc2F5cyBvYmplY3QuXG4gICAgICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcGVjO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvdG9jb2xzV2l0aE1lYXN1cmVtZW50c1tpZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRTcGVjc1tpZF0gPSBzcGVjID0gbmV3IERhdGFHcmlkU3BlY0Fzc2F5cyhwcm90b2NvbC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzcGVjLmluaXQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRzW2lkXSA9IG5ldyBEYXRhR3JpZEFzc2F5cyhzcGVjKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAkKCdmb3JtLmxpbmUtZWRpdCcpLm9uKCdjaGFuZ2UnLCAnLmxpbmUtbWV0YSA+IDppbnB1dCcsIChldikgPT4ge1xuICAgICAgICAgICAgLy8gd2F0Y2ggZm9yIGNoYW5nZXMgdG8gbWV0YWRhdGEgdmFsdWVzLCBhbmQgc2VyaWFsaXplIHRvIHRoZSBtZXRhX3N0b3JlIGZpZWxkXG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpO1xuICAgICAgICAgICAgZm9ybS5maW5kKCcubGluZS1tZXRhID4gOmlucHV0JykuZWFjaCgoaSwgaW5wdXQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gJChpbnB1dCkuYXR0cignaWQnKS5tYXRjaCgvLShcXGQrKSQvKVsxXTtcbiAgICAgICAgICAgICAgICBtZXRhW2tleV0gPSAkKGlucHV0KS52YWwoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgbWV0YUluLnZhbChKU09OLnN0cmluZ2lmeShtZXRhKSk7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICcubGluZS1tZXRhLWFkZCcsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyBtYWtlIG1ldGFkYXRhIEFkZCBWYWx1ZSBidXR0b24gd29yayBhbmQgbm90IHN1Ym1pdCB0aGUgZm9ybVxuICAgICAgICAgICAgdmFyIGFkZHJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1lZGl0LW1ldGEnKSwgdHlwZSwgdmFsdWU7XG4gICAgICAgICAgICB0eXBlID0gYWRkcm93LmZpbmQoJy5saW5lLW1ldGEtdHlwZScpLnZhbCgpO1xuICAgICAgICAgICAgdmFsdWUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS12YWx1ZScpLnZhbCgpO1xuICAgICAgICAgICAgLy8gY2xlYXIgb3V0IGlucHV0cyBzbyBhbm90aGVyIHZhbHVlIGNhbiBiZSBlbnRlcmVkXG4gICAgICAgICAgICBhZGRyb3cuZmluZCgnOmlucHV0Jykubm90KCc6Y2hlY2tib3gsIDpyYWRpbycpLnZhbCgnJyk7XG4gICAgICAgICAgICBhZGRyb3cuZmluZCgnOmNoZWNrYm94LCA6cmFkaW8nKS5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICAgICAgaWYgKEVERERhdGEuTWV0YURhdGFUeXBlc1t0eXBlXSkge1xuICAgICAgICAgICAgICAgIGluc2VydExpbmVNZXRhZGF0YVJvdyhhZGRyb3csIHR5cGUsIHZhbHVlKS5maW5kKCc6aW5wdXQnKS50cmlnZ2VyKCdjaGFuZ2UnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5tZXRhLXJlbW92ZScsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyByZW1vdmUgbWV0YWRhdGEgcm93IGFuZCBpbnNlcnQgbnVsbCB2YWx1ZSBmb3IgdGhlIG1ldGFkYXRhIGtleVxuICAgICAgICAgICAgdmFyIGZvcm0gPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnZm9ybScpLFxuICAgICAgICAgICAgICAgIG1ldGFSb3cgPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnLmxpbmUtbWV0YScpLFxuICAgICAgICAgICAgICAgIG1ldGFJbiA9IGZvcm0uZmluZCgnW25hbWU9bGluZS1tZXRhX3N0b3JlXScpLFxuICAgICAgICAgICAgICAgIG1ldGEgPSBKU09OLnBhcnNlKG1ldGFJbi52YWwoKSB8fCAne30nKSxcbiAgICAgICAgICAgICAgICBrZXkgPSBtZXRhUm93LmF0dHIoJ2lkJykubWF0Y2goLy0oXFxkKykkLylbMV07XG4gICAgICAgICAgICBtZXRhW2tleV0gPSBudWxsO1xuICAgICAgICAgICAgbWV0YUluLnZhbChKU09OLnN0cmluZ2lmeShtZXRhKSk7XG4gICAgICAgICAgICBtZXRhUm93LnJlbW92ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgJCh3aW5kb3cpLm9uKCdsb2FkJywgcHJlcGFyZVBlcm1pc3Npb25zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcmVwYXJlUGVybWlzc2lvbnMoKSB7XG4gICAgICAgIHZhciB1c2VyOiBKUXVlcnksIGdyb3VwOiBKUXVlcnk7XG4gICAgICAgIC8vIFRPRE8gdGhlIERPTSB0cmF2ZXJzaW5nIGFuZCBmaWx0ZXJpbmcgaGVyZSBpcyB2ZXJ5IGhhY2t5LCBkbyBpdCBiZXR0ZXIgbGF0ZXJcbiAgICAgICAgdXNlciA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUoJCgnI3Blcm1pc3Npb25fdXNlcl9ib3gnKSk7XG4gICAgICAgIGdyb3VwID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZSgkKCcjcGVybWlzc2lvbl9ncm91cF9ib3gnKSk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZSh1c2VyLCAnVXNlcicpO1xuICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoZ3JvdXAsICdHcm91cCcpO1xuICAgICAgICAkKCdmb3JtLnBlcm1pc3Npb25zJylcbiAgICAgICAgICAgIC5vbignY2hhbmdlJywgJzpyYWRpbycsIChldjpKUXVlcnlJbnB1dEV2ZW50T2JqZWN0KTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcmFkaW86IEpRdWVyeSA9ICQoZXYudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAkKCcucGVybWlzc2lvbnMnKS5maW5kKCc6cmFkaW8nKS5lYWNoKChpOiBudW1iZXIsIHI6IEVsZW1lbnQpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJChyKS5jbG9zZXN0KCdzcGFuJykuZmluZCgnLmF1dG9jb21wJykucHJvcCgnZGlzYWJsZWQnLCAhJChyKS5wcm9wKCdjaGVja2VkJykpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChyYWRpby5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFkaW8uY2xvc2VzdCgnc3BhbicpLmZpbmQoJy5hdXRvY29tcDp2aXNpYmxlJykuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKCdzdWJtaXQnLCAoZXY6SlF1ZXJ5RXZlbnRPYmplY3QpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcGVybTogYW55ID0ge30sIGtsYXNzOiBzdHJpbmcsIGF1dG86IEpRdWVyeTtcbiAgICAgICAgICAgICAgICBhdXRvID0gJCgnZm9ybS5wZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPWNsYXNzXTpjaGVja2VkJyk7XG4gICAgICAgICAgICAgICAga2xhc3MgPSBhdXRvLnZhbCgpO1xuICAgICAgICAgICAgICAgIHBlcm0udHlwZSA9ICQoJ2Zvcm0ucGVybWlzc2lvbnMnKS5maW5kKCdbbmFtZT10eXBlXScpLnZhbCgpO1xuICAgICAgICAgICAgICAgIHBlcm1ba2xhc3MudG9Mb3dlckNhc2UoKV0gPSB7ICdpZCc6IGF1dG8uY2xvc2VzdCgnc3BhbicpLmZpbmQoJ2lucHV0OmhpZGRlbicpLnZhbCgpIH07XG4gICAgICAgICAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICAgICAgICAgJ3VybCc6ICdwZXJtaXNzaW9ucy8nLFxuICAgICAgICAgICAgICAgICAgICAndHlwZSc6ICdQT1NUJyxcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IEpTT04uc3RyaW5naWZ5KFtwZXJtXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAnY3NyZm1pZGRsZXdhcmV0b2tlbic6ICQoJ2Zvcm0ucGVybWlzc2lvbnMnKS5maW5kKCdbbmFtZT1jc3JmbWlkZGxld2FyZXRva2VuXScpLnZhbCgpXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICdzdWNjZXNzJzogKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydTZXQgcGVybWlzc2lvbjogJywgSlNPTi5zdHJpbmdpZnkocGVybSldLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dCgnU2V0IFBlcm1pc3Npb24nKS5hZGRDbGFzcygnc3VjY2VzcycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKCQoJ2Zvcm0ucGVybWlzc2lvbnMnKSkuZGVsYXkoNTAwMCkuZmFkZU91dCgyMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlcnIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnU2V0dGluZyBwZXJtaXNzaW9uIGZhaWxlZDogJywgc3RhdHVzLCAnOycsIGVycl0uam9pbignJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KCdTZXJ2ZXIgRXJyb3I6ICcgKyBlcnIpLmFkZENsYXNzKCdiYWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCdmb3JtLnBlcm1pc3Npb25zJykpLmRlbGF5KDUwMDApLmZhZGVPdXQoMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbmQoJzpyYWRpbycpLnRyaWdnZXIoJ2NoYW5nZScpLmVuZCgpXG4gICAgICAgICAgICAucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NDYXJib25CYWxhbmNlRGF0YSgpIHtcbiAgICAgICAgLy8gUHJlcGFyZSB0aGUgY2FyYm9uIGJhbGFuY2UgZ3JhcGhcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YSA9IG5ldyBDYXJib25CYWxhbmNlLkRpc3BsYXkoKTtcbiAgICAgICAgdmFyIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQgPSBmYWxzZTtcbiAgICAgICAgaWYgKCB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA+IC0xICkge1xuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YS5jYWxjdWxhdGVDYXJib25CYWxhbmNlcyh0aGlzLm1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICAvLyBIaWdobGlnaHQgdGhlIFwiU2hvdyBDYXJib24gQmFsYW5jZVwiIGNoZWNrYm94IGluIHJlZCBpZiB0aGVyZSBhcmUgQ0IgaXNzdWVzLlxuICAgICAgICAgICAgaWYgKHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuZ2V0TnVtYmVyT2ZJbWJhbGFuY2VzKCkgPiAwKSB7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBIaWdobGlnaHQgdGhlIGNhcmJvbiBiYWxhbmNlIGluIHJlZCB0byBpbmRpY2F0ZSB0aGF0IHdlIGNhbid0IGNhbGN1bGF0ZVxuICAgICAgICAgICAgLy8gY2FyYm9uIGJhbGFuY2VzIHlldC4gV2hlbiB0aGV5IGNsaWNrIHRoZSBjaGVja2JveCwgd2UnbGwgZ2V0IHRoZW0gdG9cbiAgICAgICAgICAgIC8vIHNwZWNpZnkgd2hpY2ggU0JNTCBmaWxlIHRvIHVzZSBmb3IgYmlvbWFzcy5cbiAgICAgICAgICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMuaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldChoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGZpbHRlclRhYmxlS2V5RG93bihlKSB7XG4gICAgICAgIHN3aXRjaCAoZS5rZXlDb2RlKSB7XG4gICAgICAgICAgICBjYXNlIDM4OiAvLyB1cFxuICAgICAgICAgICAgY2FzZSA0MDogLy8gZG93blxuICAgICAgICAgICAgY2FzZSA5OiAgLy8gdGFiXG4gICAgICAgICAgICBjYXNlIDEzOiAvLyByZXR1cm5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIC8vIGlnbm9yZSBpZiB0aGUgZm9sbG93aW5nIGtleXMgYXJlIHByZXNzZWQ6IFtzaGlmdF0gW2NhcHNsb2NrXVxuICAgICAgICAgICAgICAgIGlmIChlLmtleUNvZGUgPiA4ICYmIGUua2V5Q29kZSA8IDMyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5xdWV1ZU1haW5HcmFwaFJlbWFrZShmYWxzZSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIENhbGxlZCBieSBEYXRhR3JpZCBhZnRlciB0aGUgTGluZXMgdGFibGUgaXMgcmVuZGVyZWRcbiAgICBleHBvcnQgZnVuY3Rpb24gcHJlcGFyZUFmdGVyTGluZXNUYWJsZSgpIHtcbiAgICAgICAgdmFyIGNzSURzO1xuICAgICAgICB2YXIgb3B0cyA9IHtcbiAgICAgICAgICBsaW5lczogOSwgLy8gbnVtYmVyIG9mIGxpbmVzIG9uIHRoZSBzcGlubmVyXG4gICAgICAgICAgbGVuZ3RoOiA5LFxuICAgICAgICAgIHdpZHRoOiA1LFxuICAgICAgICAgIHJhZGl1czogMTQsIC8vIHJhZGl1cyBvZiBpbm5lciBjaXJjbGVcbiAgICAgICAgICBjb2xvcjogJyMxODc1QTYnLCAvLyBjb2xvciBvZiBzcGlubmVyICAoYmx1ZSlcbiAgICAgICAgICBzcGVlZDogMS45LCAvLyBSb3VuZHMgcGVyIHNlY29uZFxuICAgICAgICAgIHRyYWlsOiA0MCwgLy8gQWZ0ZXJnbG93IHBlcmNlbnRhZ2VcbiAgICAgICAgICBjbGFzc05hbWU6ICdzcGlubmVyJyxcbiAgICAgICAgICB6SW5kZXg6IDJlOSxcbiAgICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiAgICAgICAgICB0b3A6ICc3MCUnLFxuICAgICAgICAgIGxlZnQ6ICc1MCUnXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gUHJlcGFyZSB0aGUgbWFpbiBkYXRhIG92ZXJ2aWV3IGdyYXBoIGF0IHRoZSB0b3Agb2YgdGhlIHBhZ2VcbiAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoT2JqZWN0ID09PSBudWxsICYmICQoJyNtYWluZ3JhcGgnKS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0ID0gT2JqZWN0LmNyZWF0ZShTdHVkeURHcmFwaGluZyk7XG4gICAgICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdC5TZXR1cCgnbWFpbmdyYXBoJyk7XG4gICAgICAgICAgICAvL2xvYWQgc3Bpbm5lclxuICAgICAgICAgICAgdGhpcy5zcGlubmVyID0gbmV3IFNwaW5uZXIob3B0cykuc3Bpbihkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm92ZXJ2aWV3U2VjdGlvblwiKSk7XG4gICAgICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0Lm1haW5HcmFwaE9iamVjdCA9IHRoaXMubWFpbkdyYXBoT2JqZWN0O1xuICAgICAgICB9XG5cbiAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykub24oJ21vdXNlb3ZlciBtb3VzZWRvd24gbW91c2V1cCcsIHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UuYmluZCh0aGlzLCBmYWxzZSkpXG4gICAgICAgICAgICAgICAgLm9uKCdrZXlkb3duJywgZmlsdGVyVGFibGVLZXlEb3duLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIEVuYWJsZSBlZGl0IGxpbmVzIGJ1dHRvblxuICAgICAgICAkKCcjZWRpdExpbmVCdXR0b24nKS5vbignY2xpY2snLCAoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICB2YXIgYnV0dG9uID0gJChldi50YXJnZXQpLCBkYXRhID0gYnV0dG9uLmRhdGEoKSwgZm9ybSA9IGNsZWFyTGluZUZvcm0oKSxcbiAgICAgICAgICAgICAgICBhbGxNZXRhID0ge30sIG1ldGFSb3c7XG4gICAgICAgICAgICBpZiAoZGF0YS5pZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgZmlsbExpbmVGb3JtKGZvcm0sIEVERERhdGEuTGluZXNbZGF0YS5pZHNbMF1dKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29tcHV0ZSB1c2VkIG1ldGFkYXRhIGZpZWxkcyBvbiBhbGwgZGF0YS5pZHMsIGluc2VydCBtZXRhZGF0YSByb3dzP1xuICAgICAgICAgICAgICAgIGRhdGEuaWRzLm1hcCgoaWQ6bnVtYmVyKSA9PiBFREREYXRhLkxpbmVzW2lkXSB8fCB7fSkuZm9yRWFjaCgobGluZTpMaW5lUmVjb3JkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICQuZXh0ZW5kKGFsbE1ldGEsIGxpbmUubWV0YSB8fCB7fSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgbWV0YVJvdyA9IGZvcm0uZmluZCgnLmxpbmUtZWRpdC1tZXRhJyk7XG4gICAgICAgICAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgICAgICAgICAkLmVhY2goYWxsTWV0YSwgKGtleSkgPT4gaW5zZXJ0TGluZU1ldGFkYXRhUm93KG1ldGFSb3csIGtleSwgJycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHVwZGF0ZVVJTGluZUZvcm0oZm9ybSwgZGF0YS5jb3VudCA+IDEpO1xuICAgICAgICAgICAgc2Nyb2xsVG9Gb3JtKGZvcm0pO1xuICAgICAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWlkc10nKS52YWwoZGF0YS5pZHMuam9pbignLCcpKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSGFja3kgYnV0dG9uIGZvciBjaGFuZ2luZyB0aGUgbWV0YWJvbGljIG1hcFxuICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuY2xpY2soICgpID0+IHRoaXMub25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSgpICk7XG4gICAgICAgIC8vcHVsbGluZyBpbiBwcm90b2NvbCBtZWFzdXJlbWVudHMgQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgIHVybDogJ21lYXN1cmVtZW50cy8nICsgaWQgKyAnLycsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgcHJvdG9jb2wubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RBc3NheURhdGEoYXNzYXkpIHtcbiAgICAgICAgdmFyIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIHVybDogWydtZWFzdXJlbWVudHMnLCBhc3NheS5waWQsIGFzc2F5LmlkLCAnJ10uam9pbignLycpLFxuICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgZXJyb3I6ICh4aHIsIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgYXNzYXkubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc01lYXN1cmVtZW50RGF0YShwcm90b2NvbCwgZGF0YSkge1xuICAgICAgICB2YXIgYXNzYXlTZWVuID0ge30sXG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXkgPSB7fSxcbiAgICAgICAgICAgIGNvdW50X3RvdGFsOm51bWJlciA9IDAsXG4gICAgICAgICAgICBjb3VudF9yZWM6bnVtYmVyID0gMDtcbiAgICAgICAgRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgfHwge307XG5cbiAgICAgICAgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzID0gJC5leHRlbmQoRURERGF0YS5NZWFzdXJlbWVudFR5cGVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcbiAgICAgICAgLy8gYXR0YWNoIG1lYXN1cmVtZW50IGNvdW50cyB0byBlYWNoIGFzc2F5XG4gICAgICAgICQuZWFjaChkYXRhLnRvdGFsX21lYXN1cmVzLCAoYXNzYXlJZDpzdHJpbmcsIGNvdW50Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgIGlmIChhc3NheSkge1xuICAgICAgICAgICAgICAgIGFzc2F5LmNvdW50ID0gY291bnQ7XG4gICAgICAgICAgICAgICAgY291bnRfdG90YWwgKz0gY291bnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBsb29wIG92ZXIgYWxsIGRvd25sb2FkZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICQuZWFjaChkYXRhLm1lYXN1cmVzIHx8IHt9LCAoaW5kZXgsIG1lYXN1cmVtZW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgKytjb3VudF9yZWM7XG4gICAgICAgICAgICBpZiAoIWFzc2F5IHx8ICFhc3NheS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAvLyBhdHRhY2ggdmFsdWVzXG4gICAgICAgICAgICAkLmV4dGVuZChtZWFzdXJlbWVudCwgeyAndmFsdWVzJzogZGF0YS5kYXRhW21lYXN1cmVtZW50LmlkXSB8fCBbXSB9KVxuICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudC5pZF0gPSBtZWFzdXJlbWVudDtcbiAgICAgICAgICAgIC8vIHRyYWNrIHdoaWNoIGFzc2F5cyByZWNlaXZlZCB1cGRhdGVkIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgYXNzYXlTZWVuW2Fzc2F5LmlkXSA9IHRydWU7XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXSA9IHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdIHx8IHt9O1xuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF1bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGhhbmRsZSBtZWFzdXJlbWVudCBkYXRhIGJhc2VkIG9uIHR5cGVcbiAgICAgICAgICAgIG10eXBlID0gZGF0YS50eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgIChhc3NheS5tZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIGlmIChtdHlwZS5mYW1pbHkgPT09ICdtJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBtZXRhYm9saXRlXG4gICAgICAgICAgICAgICAgKGFzc2F5Lm1ldGFib2xpdGVzID0gYXNzYXkubWV0YWJvbGl0ZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgKGFzc2F5LnByb3RlaW5zID0gYXNzYXkucHJvdGVpbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgIChhc3NheS50cmFuc2NyaXB0aW9ucyA9IGFzc2F5LnRyYW5zY3JpcHRpb25zIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgKGFzc2F5LmdlbmVyYWwgPSBhc3NheS5nZW5lcmFsIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5wcm9jZXNzSW5jb21pbmdNZWFzdXJlbWVudFJlY29yZHMoZGF0YS5tZWFzdXJlcyB8fCB7fSwgZGF0YS50eXBlcyk7XG5cbiAgICAgICAgaWYgKGNvdW50X3JlYyA8IGNvdW50X3RvdGFsKSB7XG4gICAgICAgICAgICAvLyBUT0RPIG5vdCBhbGwgbWVhc3VyZW1lbnRzIGRvd25sb2FkZWQ7IGRpc3BsYXkgYSBtZXNzYWdlIGluZGljYXRpbmcgdGhpc1xuICAgICAgICAgICAgLy8gZXhwbGFpbiBkb3dubG9hZGluZyBpbmRpdmlkdWFsIGFzc2F5IG1lYXN1cmVtZW50cyB0b29cbiAgICAgICAgfVxuICAgICAgICAvLyBpbnZhbGlkYXRlIGFzc2F5cyBvbiBhbGwgRGF0YUdyaWRzOyByZWRyYXdzIHRoZSBhZmZlY3RlZCByb3dzXG4gICAgICAgICQuZWFjaCh0aGlzLmFzc2F5c0RhdGFHcmlkcywgKHByb3RvY29sSWQsIGRhdGFHcmlkKSA9PiB7XG4gICAgICAgICAgICBkYXRhR3JpZC5pbnZhbGlkYXRlQXNzYXlSZWNvcmRzKE9iamVjdC5rZXlzKHByb3RvY29sVG9Bc3NheVtwcm90b2NvbElkXSB8fCB7fSkpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYy5lbmFibGVDYXJib25CYWxhbmNlV2lkZ2V0KHRydWUpO1xuICAgICAgICB0aGlzLnByb2Nlc3NDYXJib25CYWxhbmNlRGF0YSgpO1xuICAgICAgICB0aGlzLnF1ZXVlTWFpbkdyYXBoUmVtYWtlKGZhbHNlKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBjYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFjayhzcGVjOkRhdGFHcmlkU3BlY0xpbmVzLFxuICAgICAgICAgICAgZGF0YUdyaWRPYmo6RGF0YUdyaWQpIHtcbiAgICAgICAgU3R1ZHlELnJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzKCk7XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCBzaG93cyB0aGUgYWN0aW9ucyBwYW5lbC5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdygpIHtcbiAgICAgICAgaWYgKHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0ICh0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQobGluZXNBY3Rpb25QYW5lbFNob3cuYmluZCh0aGlzKSwgMTUwKTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGxpbmVzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICAvLyBGaWd1cmUgb3V0IGhvdyBtYW55IGxpbmVzIGFyZSBzZWxlY3RlZC5cbiAgICAgICAgdmFyIGNoZWNrZWRCb3hlcyA9IFtdLCBjaGVja2VkTGVuLCBsaW5lc0FjdGlvblBhbmVsO1xuICAgICAgICBpZiAodGhpcy5saW5lc0RhdGFHcmlkKSB7XG4gICAgICAgICAgICBjaGVja2VkQm94ZXMgPSB0aGlzLmxpbmVzRGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgY2hlY2tlZExlbiA9IGNoZWNrZWRCb3hlcy5sZW5ndGg7XG4gICAgICAgIGxpbmVzQWN0aW9uUGFuZWwgPSAkKCcjbGluZXNBY3Rpb25QYW5lbCcpLnRvZ2dsZUNsYXNzKCdvZmYnLCAhY2hlY2tlZExlbik7XG4gICAgICAgICQoJyNsaW5lc1NlbGVjdGVkQ2VsbCcpLmVtcHR5KCkudGV4dChjaGVja2VkTGVuICsgJyBzZWxlY3RlZCcpO1xuICAgICAgICAvLyBlbmFibGUgc2luZ3VsYXIvcGx1cmFsIGNoYW5nZXNcbiAgICAgICAgJCgnI2Nsb25lTGluZUJ1dHRvbicpLnRleHQoJ0Nsb25lIExpbmUnICsgKGNoZWNrZWRMZW4gPiAxID8gJ3MnIDogJycpKTtcbiAgICAgICAgJCgnI2VkaXRMaW5lQnV0dG9uJykudGV4dCgnRWRpdCBMaW5lJyArIChjaGVja2VkTGVuID4gMSA/ICdzJyA6ICcnKSkuZGF0YSh7XG4gICAgICAgICAgICAnY291bnQnOiBjaGVja2VkTGVuLFxuICAgICAgICAgICAgJ2lkcyc6IGNoZWNrZWRCb3hlcy5tYXAoKGJveDpIVE1MSW5wdXRFbGVtZW50KSA9PiBib3gudmFsdWUpXG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjZ3JvdXBMaW5lQnV0dG9uJykudG9nZ2xlQ2xhc3MoJ29mZicsIGNoZWNrZWRMZW4gPCAyKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpIHtcbiAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyB0aGUgZ3JhcGguXG4gICAgICAgIC8vIFRoaXMgd2F5IHdlJ3JlIG5vdCBib3RoZXJpbmcgdGhlIHVzZXIgd2l0aCB0aGUgbG9uZyByZWRyYXcgcHJvY2VzcyB3aGVuXG4gICAgICAgIC8vIHRoZXkgYXJlIG1ha2luZyBmYXN0IGVkaXRzLlxuICAgICAgICBpZiAodGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KGFzc2F5c0FjdGlvblBhbmVsU2hvdy5iaW5kKHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gYXNzYXlzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICAgICAgdmFyIGNoZWNrZWRCb3hlcyA9IFtdLCBjaGVja2VkQXNzYXlzLCBjaGVja2VkTWVhc3VyZSwgcGFuZWwsIGluZm9ib3g7XG4gICAgICAgIHBhbmVsID0gJCgnI2Fzc2F5c0FjdGlvblBhbmVsJyk7XG4gICAgICAgIGlmICghcGFuZWwubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmlndXJlIG91dCBob3cgbWFueSBhc3NheXMvY2hlY2tib3hlcyBhcmUgc2VsZWN0ZWQuXG4gICAgICAgICQuZWFjaCh0aGlzLmFzc2F5c0RhdGFHcmlkcywgKHBJRCwgZGF0YUdyaWQpID0+IHtcbiAgICAgICAgICAgIGNoZWNrZWRCb3hlcyA9IGNoZWNrZWRCb3hlcy5jb25jYXQoZGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzKCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgY2hlY2tlZEFzc2F5cyA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJ1tpZF49YXNzYXldJykubGVuZ3RoO1xuICAgICAgICBjaGVja2VkTWVhc3VyZSA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJzpub3QoW2lkXj1hc3NheV0pJykubGVuZ3RoO1xuICAgICAgICBwYW5lbC50b2dnbGVDbGFzcygnb2ZmJywgIWNoZWNrZWRBc3NheXMgJiYgIWNoZWNrZWRNZWFzdXJlKTtcbiAgICAgICAgaWYgKGNoZWNrZWRBc3NheXMgfHwgY2hlY2tlZE1lYXN1cmUpIHtcbiAgICAgICAgICAgIGluZm9ib3ggPSAkKCcjYXNzYXlzU2VsZWN0ZWRDZWxsJykuZW1wdHkoKTtcbiAgICAgICAgICAgIGlmIChjaGVja2VkQXNzYXlzKSB7XG4gICAgICAgICAgICAgICAgJChcIjxwPlwiKS5hcHBlbmRUbyhpbmZvYm94KS50ZXh0KChjaGVja2VkQXNzYXlzID4gMSkgP1xuICAgICAgICAgICAgICAgICAgICAgICAgKGNoZWNrZWRBc3NheXMgKyBcIiBBc3NheXMgc2VsZWN0ZWRcIikgOiBcIjEgQXNzYXkgc2VsZWN0ZWRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2hlY2tlZE1lYXN1cmUpIHtcbiAgICAgICAgICAgICAgICAkKFwiPHA+XCIpLmFwcGVuZFRvKGluZm9ib3gpLnRleHQoKGNoZWNrZWRNZWFzdXJlID4gMSkgP1xuICAgICAgICAgICAgICAgICAgICAgICAgKGNoZWNrZWRNZWFzdXJlICsgXCIgTWVhc3VyZW1lbnRzIHNlbGVjdGVkXCIpIDogXCIxIE1lYXN1cmVtZW50IHNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIGEgZ3JhcGguIFRoaXMgd2F5IHdlJ3JlIG5vdFxuICAgIC8vIGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW4gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlTWFpbkdyYXBoUmVtYWtlKGZvcmNlPzpib29sZWFuKSB7XG4gICAgICAgIGlmICh0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQocmVtYWtlTWFpbkdyYXBoQXJlYS5iaW5kKHRoaXMsIGZvcmNlKSwgMjAwKTtcbiAgICB9XG5cbiAgICB2YXIgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID0gMDtcblxuICAgIGZ1bmN0aW9uIHJlbWFrZU1haW5HcmFwaEFyZWEoZm9yY2U/OmJvb2xlYW4pIHtcbiAgICAgICAgLy9zdG9wIHNwaW5uZXIuIFxuICAgICAgICB0aGlzLnNwaW5uZXIuc3RvcCgpO1xuICAgICAgICAvLyBsb2FkZXIgc2V0dGluZ3NcbiAgICAgICAgdmFyIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHM6YW55W10sXG4gICAgICAgICAgICBkYXRhUG9pbnRzRGlzcGxheWVkID0gMCxcbiAgICAgICAgICAgIGRhdGFQb2ludHNUb3RhbCA9IDAsXG4gICAgICAgICAgICBjb2xvck9iajtcblxuICAgICAgICBpZiAoIXRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZSkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vcmVtb3ZlIFNWRy5cbiAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuY2xlYXJBbGxTZXRzKCk7XG4gICAgICAgIHRoaXMuZ3JhcGhIZWxwZXIgPSBPYmplY3QuY3JlYXRlKEdyYXBoSGVscGVyTWV0aG9kcyk7XG4gICAgICAgIGNvbG9yT2JqID0gRURERGF0YVsnY29sb3InXTtcbiAgICAgICAgLy9HaXZlcyBpZHMgb2YgbGluZXMgdG8gc2hvdy5cbiAgICAgICAgdmFyIGRhdGFTZXRzID0gW10sIHByZXY7XG4gICAgICAgIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMgPSB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkRmlsdGVyZWRNZWFzdXJlbWVudHMoKTtcbiAgICAgICAgJC5lYWNoKHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMsIChpLCBtZWFzdXJlbWVudElkKSA9PiB7XG5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50SWRdLFxuICAgICAgICAgICAgICAgIHBvaW50cyA9IChtZWFzdXJlLnZhbHVlcyA/IG1lYXN1cmUudmFsdWVzLmxlbmd0aCA6IDApLFxuICAgICAgICAgICAgICAgIGFzc2F5LCBsaW5lLCBuYW1lLCBzaW5nbGVBc3NheU9iaiwgY29sb3IsIHByb3RvY29sLCBsaW5lTmFtZSwgZGF0YU9iajtcbiAgICAgICAgICAgIGRhdGFQb2ludHNUb3RhbCArPSBwb2ludHM7XG5cbiAgICAgICAgICAgIGlmIChkYXRhUG9pbnRzRGlzcGxheWVkID4gMTUwMDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIFNraXAgdGhlIHJlc3QgaWYgd2UndmUgaGl0IG91ciBsaW1pdFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkYXRhUG9pbnRzRGlzcGxheWVkICs9IHBvaW50cztcbiAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZS5hc3NheV0gfHwge307XG4gICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdIHx8IHt9O1xuICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdIHx8IHt9O1xuICAgICAgICAgICAgbmFtZSA9IFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKTtcbiAgICAgICAgICAgIGxpbmVOYW1lID0gbGluZS5uYW1lO1xuXG4gICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkubmV4dCgpO1xuXG4gICAgICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuTGluZXMpLmxlbmd0aCA+IDIyKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjaGFuZ2VMaW5lQ29sb3IobGluZSwgY29sb3JPYmosIGFzc2F5LmxpZCwgdGhpcy5ncmFwaEhlbHBlcilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA9PT0gMCApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoSGVscGVyLmxhYmVscy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA+PSAxICYmICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICAvL3VuY2hlY2tlZCBsYWJlbHMgYmxhY2tcbiAgICAgICAgICAgICAgICBtYWtlTGFiZWxzQmxhY2sodGhpcy5ncmFwaEhlbHBlci5sYWJlbHMpO1xuICAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgaWYgKGNvbG9yID09PSBudWxsIHx8IGNvbG9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvdW50ID0gbm9DaGVja2VkQm94ZXModGhpcy5ncmFwaEhlbHBlci5sYWJlbHMpO1xuICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyYXBoSGVscGVyLm5leHRDb2xvciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGFkZENvbG9yKHRoaXMuZ3JhcGhIZWxwZXIubGFiZWxzLCBjb2xvck9iaiwgYXNzYXkubGlkKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGJsYWNrXG4gICAgICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCAnYmxhY2snKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjb2xvciA9PT0gbnVsbCB8fCBjb2xvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkYXRhT2JqID0ge1xuICAgICAgICAgICAgICAgICdtZWFzdXJlJzogbWVhc3VyZSxcbiAgICAgICAgICAgICAgICAnZGF0YSc6IEVERERhdGEsXG4gICAgICAgICAgICAgICAgJ25hbWUnOiBuYW1lLFxuICAgICAgICAgICAgICAgICdjb2xvcic6IGNvbG9yLFxuICAgICAgICAgICAgICAgICdsaW5lTmFtZSc6IGxpbmVOYW1lLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHNpbmdsZUFzc2F5T2JqID0gdGhpcy5ncmFwaEhlbHBlci50cmFuc2Zvcm1TaW5nbGVMaW5lSXRlbShkYXRhT2JqKTtcbiAgICAgICAgICAgIGRhdGFTZXRzLnB1c2goc2luZ2xlQXNzYXlPYmopO1xuICAgICAgICAgICAgcHJldiA9IGxpbmVOYW1lO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzKys7XG4gICAgICAgIHVuY2hlY2tFdmVudEhhbmRsZXIodGhpcy5ncmFwaEhlbHBlci5sYWJlbHMpO1xuICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdC5hZGROZXdTZXQoZGF0YVNldHMsIEVERERhdGEuTWVhc3VyZW1lbnRUeXBlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiBtYWtlcyB1bmNoZWNrZWQgbGFiZWxzIGJsYWNrXG4gICAgICogQHBhcmFtIHNlbGVjdG9yc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VMYWJlbHNCbGFjayhzZWxlY3RvcnM6SlF1ZXJ5W10pIHtcbiAgICAgICAgXy5lYWNoKHNlbGVjdG9ycywgZnVuY3Rpb24oc2VsZWN0b3I6SlF1ZXJ5KSB7XG4gICAgICAgICAgICBpZiAoc2VsZWN0b3IucHJldigpLnByb3AoJ2NoZWNrZWQnKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICQoc2VsZWN0b3IpLmNzcygnY29sb3InLCAnYmxhY2snKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIGNyZWF0ZXMgYW4gZXZlbnQgaGFuZGxlciBmb3IgdW5jaGVja2luZyBhIGNoZWNrZWQgY2hlY2tib3hcbiAgICAgKiBAcGFyYW0gbGFiZWxzXG4gICAgICovXG4gICAgZnVuY3Rpb24gdW5jaGVja0V2ZW50SGFuZGxlcihsYWJlbHMpIHtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWwpe1xuICAgICAgICAgICAgdmFyIGlkID0gJChsYWJlbCkucHJldigpLmF0dHIoJ2lkJyk7XG4gICAgICAgICAgICAkKCcjJyArIGlkKS5jaGFuZ2UoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpc2NoZWNrZWQ9ICQodGhpcykuaXMoJzpjaGVja2VkJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmKCFpc2NoZWNrZWQpXG4gICAgICAgICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBob3cgbWFueSBjaGVja2JveGVzIGFyZSBjaGVja2VkLlxuICAgICAqIEBwYXJhbSBsYWJlbHNcbiAgICAgKiBAcmV0dXJucyBjb3VudCBvZiBjaGVja2VkIGJveGVzLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG5vQ2hlY2tlZEJveGVzKGxhYmVscykge1xuICAgICAgICB2YXIgY291bnQgPSAwO1xuICAgICAgICBfLmVhY2gobGFiZWxzLCBmdW5jdGlvbihsYWJlbCkge1xuICAgICAgICAgICAgdmFyIGNoZWNrYm94ID0gJChsYWJlbCkucHJldigpO1xuICAgICAgICAgICAgaWYgKCQoY2hlY2tib3gpLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhpcyBmdW5jdGlvbiBhZGRzIGNvbG9ycyBhZnRlciB1c2VyIGhhcyBjbGlja2VkIGEgbGluZSBhbmQgdGhlbiB1bmNsaWNrZWQgYWxsIHRoZSBsaW5lcy5cbiAgICAgKiBAcGFyYW0gbGFiZWxzXG4gICAgICogQHBhcmFtIGNvbG9yT2JqXG4gICAgICogQHBhcmFtIGFzc2F5XG4gICAgICogQHJldHVybnMgbGFiZWxzXG4gICAgICovXG5cbiAgICBmdW5jdGlvbiBhZGRDb2xvcihsYWJlbHM6SlF1ZXJ5W10sIGNvbG9yT2JqLCBhc3NheSkge1xuICAgICAgICBfLmVhY2gobGFiZWxzLCBmdW5jdGlvbihsYWJlbDpKUXVlcnkpIHtcbiAgICAgICAgICAgIHZhciBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5XTtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2Fzc2F5XS5uYW1lID09PSBsYWJlbC50ZXh0KCkpIHtcbiAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGxhYmVscztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gbGluZVxuICAgICAqIEBwYXJhbSBjb2xvck9ialxuICAgICAqIEBwYXJhbSBhc3NheVxuICAgICAqIEBwYXJhbSBncmFwaEhlbHBlclxuICAgICAqIEByZXR1cm5zIGNvbG9yIGZvciBsaW5lLlxuICAgICAqIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgY29sb3IgaW4gdGhlIGNvbG9yIHF1ZXVlIGZvciBzdHVkaWVzID4yMiBsaW5lcy4gSW5zdGFudGlhdGVkXG4gICAgICogd2hlbiB1c2VyIGNsaWNrcyBvbiBhIGxpbmUuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY2hhbmdlTGluZUNvbG9yKGxpbmUsIGNvbG9yT2JqLCBhc3NheSwgZ3JhcGhIZWxwZXIpIHtcblxuICAgICAgICB2YXIgY29sb3I7XG5cbiAgICAgICAgaWYoJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLnByb3AoJ2NoZWNrZWQnKSAmJiByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPT09IDEpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGxpbmVbJ2NvbG9yJ107XG4gICAgICAgICAgICAgICAgbGluZVsnZG9Ob3RDaGFuZ2UnXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgZ3JhcGhIZWxwZXIuY29sb3JRdWV1ZShjb2xvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLnByb3AoJ2NoZWNrZWQnKSAmJiByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPj0gMSkge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lWydkb05vdENoYW5nZSddKSB7XG4gICAgICAgICAgICAgICAgICAgY29sb3IgPSBsaW5lWydjb2xvciddO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yID0gZ3JhcGhIZWxwZXIubmV4dENvbG9yO1xuICAgICAgICAgICAgICAgICAgICBsaW5lWydkb05vdENoYW5nZSddID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbGluZVsnY29sb3InXSA9IGNvbG9yO1xuICAgICAgICAgICAgICAgICAgICAvL3RleHQgbGFiZWwgbmV4dCB0byBjaGVja2JveFxuICAgICAgICAgICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkubmV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICAgICAgICAgIGdyYXBoSGVscGVyLmNvbG9yUXVldWUoY29sb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLnByb3AoJ2NoZWNrZWQnKSA9PT0gZmFsc2UgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID4xICl7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID09IDApIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbG9yO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gY2xlYXJBc3NheUZvcm0oKTpKUXVlcnkge1xuICAgICAgICB2YXIgZm9ybTpKUXVlcnkgPSAkKCcjaWRfYXNzYXktYXNzYXlfaWQnKS5jbG9zZXN0KCcuZGlzY2xvc2UnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49YXNzYXktXScpLm5vdCgnOmNoZWNrYm94LCA6cmFkaW8nKS52YWwoJycpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1hc3NheS1dJykuZmlsdGVyKCc6Y2hlY2tib3gsIDpyYWRpbycpLnByb3AoJ3NlbGVjdGVkJywgZmFsc2UpO1xuICAgICAgICBmb3JtLmZpbmQoJy5jYW5jZWwtbGluaycpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5lcnJvcmxpc3QnKS5yZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGZvcm07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJMaW5lRm9ybSgpIHtcbiAgICAgICAgdmFyIGZvcm0gPSAkKCcjaWRfbGluZS1pZHMnKS5jbG9zZXN0KCcuZGlzY2xvc2UnKTtcbiAgICAgICAgZm9ybS5maW5kKCcubGluZS1tZXRhJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWxpbmUtXScpLm5vdCgnOmNoZWNrYm94LCA6cmFkaW8nKS52YWwoJycpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1saW5lLV0nKS5maWx0ZXIoJzpjaGVja2JveCwgOnJhZGlvJykucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmNhbmNlbC1saW5rJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmJ1bGsnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIGZvcm0ub2ZmKCdjaGFuZ2UuYnVsaycpO1xuICAgICAgICByZXR1cm4gZm9ybTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaWxsQXNzYXlGb3JtKGZvcm0sIHJlY29yZCkge1xuICAgICAgICB2YXIgdXNlciA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmV4cGVyaW1lbnRlcl07XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktYXNzYXlfaWRdJykudmFsKHJlY29yZC5pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktbmFtZV0nKS52YWwocmVjb3JkLm5hbWUpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWRlc2NyaXB0aW9uXScpLnZhbChyZWNvcmQuZGVzY3JpcHRpb24pO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LXByb3RvY29sXScpLnZhbChyZWNvcmQucGlkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1leHBlcmltZW50ZXJfMF0nKS52YWwodXNlciAmJiB1c2VyLnVpZCA/IHVzZXIudWlkIDogJy0tJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzFdJykudmFsKHJlY29yZC5leHBlcmltZW50ZXIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbGxMaW5lRm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIG1ldGFSb3csIGV4cGVyaW1lbnRlciwgY29udGFjdDtcbiAgICAgICAgZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1tyZWNvcmQuZXhwZXJpbWVudGVyXTtcbiAgICAgICAgY29udGFjdCA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmNvbnRhY3QudXNlcl9pZF07XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1pZHNdJykudmFsKHJlY29yZC5pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1uYW1lXScpLnZhbChyZWNvcmQubmFtZSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRyb2xdJykucHJvcCgnY2hlY2tlZCcsIHJlY29yZC5jb250cm9sKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRhY3RfMF0nKS52YWwocmVjb3JkLmNvbnRhY3QudGV4dCB8fCAoY29udGFjdCAmJiBjb250YWN0LnVpZCA/IGNvbnRhY3QudWlkIDogJy0tJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY29udGFjdF8xXScpLnZhbChyZWNvcmQuY29udGFjdC51c2VyX2lkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWV4cGVyaW1lbnRlcl8wXScpLnZhbChleHBlcmltZW50ZXIgJiYgZXhwZXJpbWVudGVyLnVpZCA/IGV4cGVyaW1lbnRlci51aWQgOiAnLS0nKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNhcmJvbl9zb3VyY2VfMF0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLmNhcmJvbi5tYXAoKHYpID0+IChFREREYXRhLkNTb3VyY2VzW3ZdIHx8IDxDYXJib25Tb3VyY2VSZWNvcmQ+e30pLm5hbWUgfHwgJy0tJykuam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNhcmJvbl9zb3VyY2VfMV0nKS52YWwocmVjb3JkLmNhcmJvbi5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18wXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuc3RyYWluLm1hcCgodikgPT4gKEVERERhdGEuU3RyYWluc1t2XSB8fCA8U3RyYWluUmVjb3JkPnt9KS5uYW1lIHx8ICctLScpLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzFdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5zdHJhaW4ubWFwKCh2KSA9PiAoRURERGF0YS5TdHJhaW5zW3ZdIHx8IDxTdHJhaW5SZWNvcmQ+e30pLnJlZ2lzdHJ5X2lkIHx8ICcnKS5qb2luKCcsJykpO1xuICAgICAgICBpZiAocmVjb3JkLnN0cmFpbi5sZW5ndGggJiYgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMV0nKS52YWwoKSA9PT0gJycpIHtcbiAgICAgICAgICAgICQoJzxsaT4nKS50ZXh0KCdTdHJhaW4gZG9lcyBub3QgaGF2ZSBhIGxpbmtlZCBJQ0UgZW50cnkhICcgK1xuICAgICAgICAgICAgICAgICAgICAnU2F2aW5nIHRoZSBsaW5lIHdpdGhvdXQgbGlua2luZyB0byBJQ0Ugd2lsbCByZW1vdmUgdGhlIHN0cmFpbi4nKVxuICAgICAgICAgICAgICAgIC53cmFwKCc8dWw+JykucGFyZW50KCkuYWRkQ2xhc3MoJ2Vycm9ybGlzdCcpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzBdJykucGFyZW50KCkpO1xuICAgICAgICB9XG4gICAgICAgIG1ldGFSb3cgPSBmb3JtLmZpbmQoJy5saW5lLWVkaXQtbWV0YScpO1xuICAgICAgICAvLyBSdW4gdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBvZiBtZXRhZGF0YSwgYW5kIGFkZCBhIGZvcm0gZWxlbWVudCBlbnRyeSBmb3IgZWFjaFxuICAgICAgICAkLmVhY2gocmVjb3JkLm1ldGEsIChrZXksIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCB2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBzdG9yZSBvcmlnaW5hbCBtZXRhZGF0YSBpbiBpbml0aWFsLSBmaWVsZFxuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKS52YWwoSlNPTi5zdHJpbmdpZnkocmVjb3JkLm1ldGEpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1pbml0aWFsLWxpbmUtbWV0YV9zdG9yZV0nKS52YWwoSlNPTi5zdHJpbmdpZnkocmVjb3JkLm1ldGEpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY3JvbGxUb0Zvcm0oZm9ybSkge1xuICAgICAgICAvLyBtYWtlIHN1cmUgZm9ybSBpcyBkaXNjbG9zZWRcbiAgICAgICAgdmFyIHRvcCA9IGZvcm0udG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScsIGZhbHNlKS5vZmZzZXQoKS50b3A7XG4gICAgICAgICQoJ2h0bWwsIGJvZHknKS5hbmltYXRlKHsgJ3Njcm9sbFRvcCc6IHRvcCB9LCAnc2xvdycpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZVVJQXNzYXlGb3JtKGZvcm0pIHtcbiAgICAgICAgdmFyIHRpdGxlLCBidXR0b247XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgZGlzY2xvc2UgdGl0bGUgdG8gcmVhZCBFZGl0XG4gICAgICAgIHRpdGxlID0gZm9ybS5maW5kKCcuZGlzY2xvc2VMaW5rID4gYScpLnRleHQoJ0VkaXQgQXNzYXknKTtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBidXR0b24gdG8gcmVhZCBFZGl0XG4gICAgICAgIGJ1dHRvbiA9IGZvcm0uZmluZCgnW25hbWU9YWN0aW9uXVt2YWx1ZT1hc3NheV0nKS50ZXh0KCdFZGl0IEFzc2F5Jyk7XG4gICAgICAgIC8vIEFkZCBsaW5rIHRvIHJldmVydCBiYWNrIHRvICdBZGQgTGluZScgZm9ybVxuICAgICAgICAkKCc8YSBocmVmPVwiI1wiPkNhbmNlbDwvYT4nKS5hZGRDbGFzcygnY2FuY2VsLWxpbmsnKS5vbignY2xpY2snLCAoZXYpID0+IHtcbiAgICAgICAgICAgIGNsZWFyQXNzYXlGb3JtKCk7XG4gICAgICAgICAgICB0aXRsZS50ZXh0KCdBZGQgQXNzYXlzIFRvIFNlbGVjdGVkIExpbmVzJyk7XG4gICAgICAgICAgICBidXR0b24udGV4dCgnQWRkIEFzc2F5Jyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLmluc2VydEFmdGVyKGJ1dHRvbik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlVUlMaW5lRm9ybShmb3JtLCBwbHVyYWw/KSB7XG4gICAgICAgIHZhciB0aXRsZSwgYnV0dG9uLCB0ZXh0ID0gJ0VkaXQgTGluZScgKyAocGx1cmFsID8gJ3MnIDogJycpO1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGRpc2Nsb3NlIHRpdGxlIHRvIHJlYWQgJ0VkaXQgTGluZSdcbiAgICAgICAgdGl0bGUgPSBmb3JtLmZpbmQoJy5kaXNjbG9zZUxpbmsgPiBhJykudGV4dCh0ZXh0KTtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBidXR0b24gdG8gcmVhZCAnRWRpdCBMaW5lJ1xuICAgICAgICBidXR0b24gPSBmb3JtLmZpbmQoJ1tuYW1lPWFjdGlvbl1bdmFsdWU9bGluZV0nKS50ZXh0KHRleHQpO1xuICAgICAgICBpZiAocGx1cmFsKSB7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5idWxrJykucHJvcCgnY2hlY2tlZCcsIGZhbHNlKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBmb3JtLm9uKCdjaGFuZ2UuYnVsaycsICc6aW5wdXQnLCAoZXY6SlF1ZXJ5RXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAkKGV2LnRhcmdldCkuc2libGluZ3MoJ2xhYmVsJykuZmluZCgnLmJ1bGsnKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBZGQgbGluayB0byByZXZlcnQgYmFjayB0byAnQWRkIExpbmUnIGZvcm1cbiAgICAgICAgJCgnPGEgaHJlZj1cIiNcIj5DYW5jZWw8L2E+JykuYWRkQ2xhc3MoJ2NhbmNlbC1saW5rJykub24oJ2NsaWNrJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBjbGVhckxpbmVGb3JtKCk7XG4gICAgICAgICAgICB0aXRsZS50ZXh0KCdBZGQgQSBOZXcgTGluZScpO1xuICAgICAgICAgICAgYnV0dG9uLnRleHQoJ0FkZCBMaW5lJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLmluc2VydEFmdGVyKGJ1dHRvbik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5zZXJ0TGluZU1ldGFkYXRhUm93KHJlZlJvdywga2V5LCB2YWx1ZSkge1xuICAgICAgICB2YXIgcm93LCB0eXBlLCBsYWJlbCwgaW5wdXQsIGlkID0gJ2xpbmUtbWV0YS0nICsga2V5O1xuICAgICAgICByb3cgPSAkKCc8cD4nKS5hdHRyKCdpZCcsICdyb3dfJyArIGlkKS5hZGRDbGFzcygnbGluZS1tZXRhJykuaW5zZXJ0QmVmb3JlKHJlZlJvdyk7XG4gICAgICAgIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNba2V5XTtcbiAgICAgICAgbGFiZWwgPSAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgJ2lkXycgKyBpZCkudGV4dCh0eXBlLm5hbWUpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgIC8vIGJ1bGsgY2hlY2tib3g/XG4gICAgICAgIGlucHV0ID0gJCgnPGlucHV0IHR5cGU9XCJ0ZXh0XCI+JykuYXR0cignaWQnLCAnaWRfJyArIGlkKS52YWwodmFsdWUpLmFwcGVuZFRvKHJvdyk7XG4gICAgICAgIGlmICh0eXBlLnByZSkge1xuICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcHJlZml4JykudGV4dCh0eXBlLnByZSkuaW5zZXJ0QmVmb3JlKGlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1yZW1vdmUnKS50ZXh0KCdSZW1vdmUnKS5pbnNlcnRBZnRlcihpbnB1dCk7XG4gICAgICAgIGlmICh0eXBlLnBvc3RmaXgpIHtcbiAgICAgICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXBvc3RmaXgnKS50ZXh0KHR5cGUucG9zdGZpeCkuaW5zZXJ0QWZ0ZXIoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3c7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGVkaXRBc3NheShpbmRleDpudW1iZXIpOnZvaWQge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBmb3JtO1xuICAgICAgICBpZiAoIXJlY29yZCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ludmFsaWQgQXNzYXkgcmVjb3JkIGZvciBlZGl0aW5nOiAnICsgaW5kZXgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9ybSA9IGNsZWFyQXNzYXlGb3JtKCk7IC8vIFwiZm9ybVwiIGlzIGFjdHVhbGx5IHRoZSBkaXNjbG9zZSBibG9ja1xuICAgICAgICBmaWxsQXNzYXlGb3JtKGZvcm0sIHJlY29yZCk7XG4gICAgICAgIHVwZGF0ZVVJQXNzYXlGb3JtKGZvcm0pO1xuICAgICAgICBzY3JvbGxUb0Zvcm0oZm9ybSk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGVkaXRMaW5lKGluZGV4Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkxpbmVzW2luZGV4XSwgZm9ybTtcbiAgICAgICAgaWYgKCFyZWNvcmQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJbnZhbGlkIExpbmUgcmVjb3JkIGZvciBlZGl0aW5nOiAnICsgaW5kZXgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9ybSA9IGNsZWFyTGluZUZvcm0oKTsgLy8gXCJmb3JtXCIgaXMgYWN0dWFsbHkgdGhlIGRpc2Nsb3NlIGJsb2NrXG4gICAgICAgIGZpbGxMaW5lRm9ybShmb3JtLCByZWNvcmQpO1xuICAgICAgICB1cGRhdGVVSUxpbmVGb3JtKGZvcm0pO1xuICAgICAgICBzY3JvbGxUb0Zvcm0oZm9ybSk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DaGFuZ2VkTWV0YWJvbGljTWFwKCkge1xuICAgICAgICBpZiAodGhpcy5tZXRhYm9saWNNYXBOYW1lKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgdGhlIFVJIHRvIHNob3cgdGhlIG5ldyBmaWxlbmFtZSBmb3IgdGhlIG1ldGFib2xpYyBtYXAuXG4gICAgICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuaHRtbCh0aGlzLm1ldGFib2xpY01hcE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmh0bWwoJyhub25lKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICYmIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICE9IC0xKSB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2FyYm9uIGJhbGFuY2VzIG5vdyB0aGF0IHdlIGNhbi5cbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY2FsY3VsYXRlQ2FyYm9uQmFsYW5jZXModGhpcy5tZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBSZWJ1aWxkIHRoZSBDQiBncmFwaHMuXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKSB7XG4gICAgICAgIHZhciBjZWxsT2JqczpEYXRhR3JpZERhdGFDZWxsW10sXG4gICAgICAgICAgICBncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyA9IHRoaXMubGluZXNEYXRhR3JpZFNwZWMuY2FyYm9uQmFsYW5jZUNvbDtcbiAgICAgICAgaWYgKHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJvcCBhbnkgcHJldmlvdXNseSBjcmVhdGVkIENhcmJvbiBCYWxhbmNlIFNWRyBlbGVtZW50cyBmcm9tIHRoZSBET00uXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEucmVtb3ZlQWxsQ0JHcmFwaHMoKTtcbiAgICAgICAgY2VsbE9ianMgPSBbXTtcbiAgICAgICAgLy8gZ2V0IGFsbCBjZWxscyBmcm9tIGFsbCBjb2x1bW5zIGluIHRoZSBjb2x1bW4gZ3JvdXBcbiAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucy5mb3JFYWNoKChjb2w6RGF0YUdyaWRDb2x1bW5TcGVjKTp2b2lkID0+IHtcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGNlbGxPYmpzLCBjb2wuZ2V0RW50aXJlSW5kZXgoKSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBjcmVhdGUgY2FyYm9uIGJhbGFuY2UgZ3JhcGggZm9yIGVhY2ggY2VsbFxuICAgICAgICBjZWxsT2Jqcy5mb3JFYWNoKChjZWxsOkRhdGFHcmlkRGF0YUNlbGwpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY3JlYXRlQ0JHcmFwaEZvckxpbmUoY2VsbC5yZWNvcmRJRCwgY2VsbC5jZWxsRWxlbWVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IHRydWU7XG4gICAgfVxuXG5cbiAgICAvLyBUaGV5IHdhbnQgdG8gc2VsZWN0IGEgZGlmZmVyZW50IG1ldGFib2xpYyBtYXAuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUoKTp2b2lkIHtcbiAgICAgICAgdmFyIHVpOlN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlcixcbiAgICAgICAgICAgIGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQgPSAoZXJyb3I6c3RyaW5nLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwTmFtZT86c3RyaW5nLFxuICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzcz86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gbWV0YWJvbGljTWFwSUQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBOYW1lID0gbWV0YWJvbGljTWFwTmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA9IGZpbmFsQmlvbWFzcztcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2hhbmdlZE1ldGFib2xpY01hcCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIm9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUgZXJyb3I6IFwiICsgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB1aSA9IG5ldyBTdHVkeU1ldGFib2xpY01hcENob29zZXIoZmFsc2UsIGNhbGxiYWNrKTtcbiAgICB9XG59O1xuXG5cblxuLy8gVGhlIHNwZWMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gRGF0YUdyaWQgdG8gY3JlYXRlIHRoZSBMaW5lcyB0YWJsZVxuY2xhc3MgRGF0YUdyaWRTcGVjTGluZXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIG1ldGFEYXRhSURzVXNlZEluTGluZXM6YW55O1xuICAgIGdyb3VwSURzSW5PcmRlcjphbnk7XG4gICAgZ3JvdXBJRHNUb0dyb3VwSW5kZXhlczphbnk7XG4gICAgZ3JvdXBJRHNUb0dyb3VwTmFtZXM6YW55O1xuICAgIGNhcmJvbkJhbGFuY2VDb2w6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWM7XG4gICAgY2FyYm9uQmFsYW5jZVdpZGdldDpER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuXG5cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzKCk7XG4gICAgICAgIHRoaXMuZmluZEdyb3VwSURzQW5kTmFtZXMoKTtcbiAgICAgICAgc3VwZXIuaW5pdCgpO1xuICAgIH1cblxuXG4gICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCh2OmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQuaGlnaGxpZ2h0KHYpO1xuICAgIH1cblxuXG4gICAgZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldCh2OmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQuZW5hYmxlKHYpO1xuICAgIH1cblxuXG4gICAgZmluZE1ldGFEYXRhSURzVXNlZEluTGluZXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgLy8gbG9vcCBsaW5lc1xuICAgICAgICAkLmVhY2godGhpcy5nZXRSZWNvcmRJRHMoKSwgKGluZGV4LCBpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2lkXTtcbiAgICAgICAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGxpbmUubWV0YSB8fCB7fSwgKGtleSkgPT4gc2Vlbkhhc2hba2V5XSA9IHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gc3RvcmUgYWxsIG1ldGFkYXRhIElEcyBzZWVuXG4gICAgICAgIHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcyA9IE9iamVjdC5rZXlzKHNlZW5IYXNoKTtcbiAgICB9XG5cblxuICAgIGZpbmRHcm91cElEc0FuZE5hbWVzKCkge1xuICAgICAgICB2YXIgcm93R3JvdXBzID0ge307XG4gICAgICAgIC8vIEdhdGhlciBhbGwgdGhlIHJvdyBJRHMgdW5kZXIgdGhlIGdyb3VwIElEIGVhY2ggYmVsb25ncyB0by5cbiAgICAgICAgJC5lYWNoKHRoaXMuZ2V0UmVjb3JkSURzKCksIChpbmRleCwgaWQpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpZF0sIHJlcCA9IGxpbmUucmVwbGljYXRlO1xuICAgICAgICAgICAgaWYgKHJlcCkge1xuICAgICAgICAgICAgICAgIC8vIHVzZSBwYXJlbnQgcmVwbGljYXRlIGFzIGEgcmVwbGljYXRlIGdyb3VwIElELCBwdXNoIGFsbCBtYXRjaGluZyBsaW5lIElEc1xuICAgICAgICAgICAgICAgIChyb3dHcm91cHNbcmVwXSA9IHJvd0dyb3Vwc1tyZXBdIHx8IFsgcmVwIF0pLnB1c2goaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lcyA9IHt9O1xuICAgICAgICAvLyBGb3IgZWFjaCBncm91cCBJRCwganVzdCB1c2UgcGFyZW50IHJlcGxpY2F0ZSBuYW1lXG4gICAgICAgICQuZWFjaChyb3dHcm91cHMsIChncm91cCwgbGluZXMpID0+IHtcbiAgICAgICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbZ3JvdXBdID0gRURERGF0YS5MaW5lc1tncm91cF0ubmFtZTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGFscGhhbnVtZXJpYyBzb3J0IG9mIGdyb3VwIElEcyBieSBuYW1lIGF0dGFjaGVkIHRvIHRob3NlIHJlcGxpY2F0ZSBncm91cHNcbiAgICAgICAgdGhpcy5ncm91cElEc0luT3JkZXIgPSBPYmplY3Qua2V5cyhyb3dHcm91cHMpLnNvcnQoKGEsYikgPT4ge1xuICAgICAgICAgICAgdmFyIHU6c3RyaW5nID0gdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1thXSwgdjpzdHJpbmcgPSB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2JdO1xuICAgICAgICAgICAgcmV0dXJuIHUgPCB2ID8gLTEgOiB1ID4gdiA/IDEgOiAwO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gTm93IHRoYXQgdGhleSdyZSBzb3J0ZWQgYnkgbmFtZSwgY3JlYXRlIGEgaGFzaCBmb3IgcXVpY2tseSByZXNvbHZpbmcgSURzIHRvIGluZGV4ZXMgaW5cbiAgICAgICAgLy8gdGhlIHNvcnRlZCBhcnJheVxuICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cEluZGV4ZXMgPSB7fTtcbiAgICAgICAgJC5lYWNoKHRoaXMuZ3JvdXBJRHNJbk9yZGVyLCAoaW5kZXgsIGdyb3VwKSA9PiB0aGlzLmdyb3VwSURzVG9Hcm91cEluZGV4ZXNbZ3JvdXBdID0gaW5kZXgpO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ2xpbmVzJywgeyAnbmFtZSc6ICdMaW5lcycgfSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRMaW5lTmFtZShpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBsaW5lO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRTdHJhaW5OYW1lKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGEgc3RyYWluIElEIGV4aXN0cyBvbiBsaW5lLCBpcyBhIGtub3duIHN0cmFpbiwgdXBwZXJjYXNlIGZpcnN0IGZvdW5kIG5hbWUgb3IgJz8nXG4gICAgICAgIHZhciBsaW5lLCBzdHJhaW47XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuc3RyYWluICYmIGxpbmUuc3RyYWluLmxlbmd0aCAmJiAoc3RyYWluID0gRURERGF0YS5TdHJhaW5zW2xpbmUuc3RyYWluWzBdXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyYWluLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXg6c3RyaW5nKTphbnkge1xuICAgICAgICAvLyBlbnN1cmUgY2FyYm9uIHNvdXJjZSBJRChzKSBleGlzdCBvbiBsaW5lLCBlbnN1cmUgYXQgbGVhc3Qgb25lIHNvdXJjZSBJRCwgZW5zdXJlIGZpcnN0IElEXG4gICAgICAgIC8vIGlzIGtub3duIGNhcmJvbiBzb3VyY2VcbiAgICAgICAgdmFyIGxpbmUsIHNvdXJjZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoICYmIChzb3VyY2UgPSBFREREYXRhLkNTb3VyY2VzW2xpbmUuY2FyYm9uWzBdXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRDYXJib25Tb3VyY2UoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc291cmNlID0gdGhpcy5sb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXgpO1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gc291cmNlLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkQ2FyYm9uU291cmNlTGFiZWxpbmcoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc291cmNlID0gdGhpcy5sb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXgpO1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gc291cmNlLmxhYmVsaW5nLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGxpbmUsIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkTGluZU1vZGlmaWNhdGlvbihpbmRleDpzdHJpbmcpOm51bWJlciB7XG4gICAgICAgIHZhciBsaW5lO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLm1vZGlmaWVkLnRpbWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBoZWFkZXJzIGFsb25nIHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygxLCAnaExpbmVzTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdOYW1lJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU5hbWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIsICdoTGluZXNTdHJhaW4nLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnU3RyYWluJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkU3RyYWluTmFtZSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMywgJ2hMaW5lc0NhcmJvbicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdDYXJib24gU291cmNlKHMpJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQ2FyYm9uU291cmNlLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg0LCAnaExpbmVzTGFiZWxpbmcnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFiZWxpbmcnLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRDYXJib25Tb3VyY2VMYWJlbGluZyxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSwgJ2hMaW5lc0NhcmJvbkJhbGFuY2UnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ2FyYm9uIEJhbGFuY2UnLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIC8vIG1hcCBhbGwgbWV0YWRhdGEgSURzIHRvIEhlYWRlclNwZWMgb2JqZWN0c1xuICAgICAgICB2YXIgbWV0YURhdGFIZWFkZXJzOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBpbmRleCwgJ2hMaW5lc01ldGEnICsgaWQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG1kVHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLm1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCksXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLCAnaExpbmVzRXhwZXJpbWVudGVyJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEV4cGVyaW1lbnRlckluaXRpYWxzLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCwgJ2hMaW5lc01vZGlmaWVkJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTW9kaWZpY2F0aW9uLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUhlYWRlcnMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZDpzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIChpOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2ldO1xuICAgICAgICAgICAgaWYgKGxpbmUgJiYgbGluZS5tZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxpbmUubWV0YVtpZF0gfHwgJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZSBjb2xzcGFuIHZhbHVlIGZvciBhbGwgdGhlIGNlbGxzIHRoYXQgYXJlIG5vdCAnY2FyYm9uIHNvdXJjZScgb3IgJ2xhYmVsaW5nJ1xuICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBudW1iZXIgb2YgY2FyYm9uIHNvdXJjZXMgZm9yIHRoZSByZXNwZWN0aXZlIHJlY29yZC5cbiAgICAvLyBTcGVjaWZpY2FsbHksIGl0J3MgZWl0aGVyIHRoZSBudW1iZXIgb2YgY2FyYm9uIHNvdXJjZXMsIG9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuXG4gICAgcHJpdmF0ZSByb3dTcGFuRm9yUmVjb3JkKGluZGV4KSB7XG4gICAgICAgIHJldHVybiAoRURERGF0YS5MaW5lc1tpbmRleF0uY2FyYm9uIHx8IFtdKS5sZW5ndGggfHwgMTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTGluZU5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdsaW5lSWQnLFxuICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6IChpZCkgPT4geyByZXR1cm4gJ2xpbmUnICsgaWQgKyAnaW5jbHVkZSc7IH0sXG4gICAgICAgICAgICAgICAgJ3NpZGVNZW51SXRlbXMnOiBbXG4gICAgICAgICAgICAgICAgICAgICc8YSBocmVmPVwiI2VkaXRsaW5lXCIgY2xhc3M9XCJsaW5lLWVkaXQtbGlua1wiPkVkaXQgTGluZTwvYT4nLFxuICAgICAgICAgICAgICAgICAgICAnPGEgaHJlZj1cIi9leHBvcnQ/bGluZUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBDU1YvRXhjZWw8L2E+JyxcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIvc2JtbD9saW5lSWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIFNCTUw8L2E+J1xuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogbGluZS5uYW1lICsgKGxpbmUuY3RybCA/ICc8YiBjbGFzcz1cImlzY29udHJvbGRhdGFcIj5DPC9iPicgOiAnJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZVN0cmFpbk5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgY29udGVudCA9IFtdO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBsaW5lLnN0cmFpbi5tYXAoKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tpZF07XG4gICAgICAgICAgICAgICAgcmV0dXJuIFsgJzxhIGhyZWY9XCInLCBzdHJhaW4ucmVnaXN0cnlfdXJsLCAnXCI+Jywgc3RyYWluLm5hbWUsICc8L2E+JyBdLmpvaW4oJycpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50LmpvaW4oJzsgJykgfHwgJy0tJ1xuICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ2FyYm9uU291cmNlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIHN0cmluZ3MgPSBbJy0tJ107XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuY2FyYm9uICYmIGxpbmUuY2FyYm9uLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHN0cmluZ3MgPSBsaW5lLmNhcmJvbi5tYXAoKGlkKSA9PiB7IHJldHVybiBFREREYXRhLkNTb3VyY2VzW2lkXS5uYW1lOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5ncy5tYXAoKG5hbWUpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHsgJ2NvbnRlbnRTdHJpbmcnOiBuYW1lIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDYXJib25Tb3VyY2VMYWJlbGluZ0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBzdHJpbmdzID0gWyctLSddO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmNhcmJvbiAmJiBsaW5lLmNhcmJvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmdzID0gbGluZS5jYXJib24ubWFwKChpZCkgPT4geyByZXR1cm4gRURERGF0YS5DU291cmNlc1tpZF0ubGFiZWxpbmc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmdzLm1hcCgobGFiZWxpbmcpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHsgJ2NvbnRlbnRTdHJpbmcnOiBsYWJlbGluZyB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ2FyYm9uQmFsYW5jZUJsYW5rQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ21pbldpZHRoJzogMjAwXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJJbml0aWFsc0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBleHAsIGNvbnRlbnQ7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuVXNlcnMgJiYgKGV4cCA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBleHAuaW5pdGlhbHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50IHx8ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcoRURERGF0YS5MaW5lc1tpbmRleF0ubW9kaWZpZWQudGltZSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBtYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdID0+IHtcbiAgICAgICAgICAgIHZhciBjb250ZW50U3RyID0gJycsIGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSwgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICBpZiAobGluZSAmJiB0eXBlICYmIGxpbmUubWV0YSAmJiAoY29udGVudFN0ciA9IGxpbmUubWV0YVtpZF0gfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgY29udGVudFN0ciA9IFsgdHlwZS5wcmUgfHwgJycsIGNvbnRlbnRTdHIsIHR5cGUucG9zdGZpeCB8fCAnJyBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnRTdHJcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgXTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZGF0YSBjb2x1bW5zIHRoYXQgd2lsbCBtYWtlIHVwIHRoZSBib2R5IG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIG1ldGFEYXRhQ29sczpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIHJpZ2h0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICAgICAgLy8gYWRkIGNsaWNrIGhhbmRsZXIgZm9yIG1lbnUgb24gbGluZSBuYW1lIGNlbGxzXG4gICAgICAgICQodGhpcy50YWJsZUVsZW1lbnQpLm9uKCdjbGljaycsICdhLmxpbmUtZWRpdC1saW5rJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBTdHVkeUQuZWRpdExpbmUoJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxlZnRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCB0aGlzLmdlbmVyYXRlTGluZU5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIsIHRoaXMuZ2VuZXJhdGVTdHJhaW5OYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzLCB0aGlzLmdlbmVyYXRlQ2FyYm9uU291cmNlQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg0LCB0aGlzLmdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyksXG4gICAgICAgICAgICAvLyBUaGUgQ2FyYm9uIEJhbGFuY2UgY2VsbHMgYXJlIHBvcHVsYXRlZCBieSBhIGNhbGxiYWNrLCB0cmlnZ2VyZWQgd2hlbiBmaXJzdCBkaXNwbGF5ZWRcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNSwgdGhpcy5nZW5lcmF0ZUNhcmJvbkJhbGFuY2VCbGFua0NlbGxzKVxuICAgICAgICBdO1xuICAgICAgICBtZXRhRGF0YUNvbHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBpbmRleCwgdGhpcy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSk7XG4gICAgICAgIH0pO1xuICAgICAgICByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVySW5pdGlhbHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDcgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFDb2xzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cbiAgICBkZWZpbmVDb2x1bW5Hcm91cFNwZWMoKTpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdIHtcbiAgICAgICAgdmFyIHRvcFNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGluZSBOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnU3RyYWluJyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NhcmJvbiBTb3VyY2UocyknKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFiZWxpbmcnKSxcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZUNvbCA9IG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnQ2FyYm9uIEJhbGFuY2UnLCB7XG4gICAgICAgICAgICAgICAgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UsICAgIC8vIEhhcyBpdHMgb3duIGhlYWRlciB3aWRnZXRcbiAgICAgICAgICAgICAgICAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncmV2ZWFsZWRDYWxsYmFjayc6IFN0dWR5RC5jYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFja1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB2YXIgbWV0YURhdGFDb2xHcm91cHM6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXTtcbiAgICAgICAgbWV0YURhdGFDb2xHcm91cHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBncm91cHMgdGhhdCByb3dzIGNhbiBiZSBnYXRoZXJlZCBpbnRvXG4gICAgZGVmaW5lUm93R3JvdXBTcGVjKCk6YW55IHtcblxuICAgICAgICB2YXIgcm93R3JvdXBTcGVjID0gW107XG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgdGhpcy5ncm91cElEc0luT3JkZXIubGVuZ3RoOyB4KyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHRoaXMuZ3JvdXBJRHNJbk9yZGVyW3hdO1xuXG4gICAgICAgICAgICB2YXIgcm93R3JvdXBTcGVjRW50cnk6YW55ID0geyAgICAvLyBHcm91cHMgYXJlIG51bWJlcmVkIHN0YXJ0aW5nIGZyb20gMFxuICAgICAgICAgICAgICAgIG5hbWU6IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbaWRdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcm93R3JvdXBTcGVjLnB1c2gocm93R3JvdXBTcGVjRW50cnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJvd0dyb3VwU3BlYztcbiAgICB9XG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlXG4gICAgLy8gY29udGVudCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgZ2V0VGFibGVFbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdHVkeUxpbmVzVGFibGVcIik7XG4gICAgfVxuXG5cbiAgICAvLyBBbiBhcnJheSBvZiB1bmlxdWUgaWRlbnRpZmllcnMgKG51bWJlcnMsIG5vdCBzdHJpbmdzKSwgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGVcbiAgICAvLyBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhFREREYXRhLkxpbmVzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZVxuICAgIC8vIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci4gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHN1YnN0cmluZyBzZWFyY2hpbmdcbiAgICAgICAgdmFyIHNlYXJjaExpbmVzV2lkZ2V0ID0gbmV3IERHTGluZXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggTGluZXMnLCAzMCwgZmFsc2UpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWFyY2hMaW5lc1dpZGdldCk7XG4gICAgICAgIC8vIEEgXCJDYXJib24gQmFsYW5jZVwiIGNoZWNrYm94XG4gICAgICAgIHZhciBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCA9IG5ldyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCk7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldCA9IHNob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuICAgICAgICAvLyBBIFwiZGVzZWxlY3QgYWxsXCIgYnV0dG9uXG4gICAgICAgIHZhciBkZXNlbGVjdEFsbFdpZGdldCA9IG5ldyBER0Rlc2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgZGVzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkZXNlbGVjdEFsbFdpZGdldCk7XG4gICAgICAgIC8vIEEgXCJzZWxlY3QgYWxsXCIgYnV0dG9uXG4gICAgICAgIHZhciBzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdTZWxlY3RBbGxXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICBzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWxlY3RBbGxXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy4gVGhlIG9yZGVyIG9mIHRoZSBhcnJheVxuICAgIC8vIHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGRpc3BsYXllZCBpbiB0aGUgbWVudS4gRW1wdHkgYXJyYXkgPSBPSy5cbiAgICBjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgTGluZXNcbiAgICAgICAgdmFyIGdyb3VwTGluZXNXaWRnZXQgPSBuZXcgREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGdyb3VwTGluZXNXaWRnZXQpO1xuICAgICAgICB2YXIgZGlzYWJsZWRMaW5lc1dpZGdldCA9IG5ldyBER0Rpc2FibGVkTGluZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZExpbmVzV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG4gICAgb25Jbml0aWFsaXplZChkYXRhR3JpZDpEYXRhR3JpZCk6dm9pZCB7XG5cbiAgICAgICAgLy8gV2lyZSB1cCB0aGUgJ2FjdGlvbiBwYW5lbHMnIGZvciB0aGUgTGluZXMgYW5kIEFzc2F5cyBzZWN0aW9uc1xuICAgICAgICB2YXIgbGluZXNUYWJsZSA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgICQobGluZXNUYWJsZSkub24oJ2NoYW5nZScsICc6Y2hlY2tib3gnLCAoKSA9PiBTdHVkeUQucXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdygpKTtcblxuICAgICAgICAvLyBUaGlzIGNhbGxzIGRvd24gaW50byB0aGUgaW5zdGFudGlhdGVkIHdpZGdldCBhbmQgYWx0ZXJzIGl0cyBzdHlsaW5nLFxuICAgICAgICAvLyBzbyB3ZSBuZWVkIHRvIGRvIGl0IGFmdGVyIHRoZSB0YWJsZSBoYXMgYmVlbiBjcmVhdGVkLlxuICAgICAgICB0aGlzLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQoZmFsc2UpO1xuXG4gICAgICAgIC8vIFdpcmUtaW4gb3VyIGN1c3RvbSBlZGl0IGZpZWxkcyBmb3IgdGhlIFN0dWRpZXMgcGFnZSwgYW5kIGNvbnRpbnVlIHdpdGggZ2VuZXJhbCBpbml0XG4gICAgICAgIFN0dWR5RC5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCk7XG4gICAgfVxufVxuXG5cblxuLy8gV2hlbiB1bmNoZWNrZWQsIHRoaXMgaGlkZXMgdGhlIHNldCBvZiBMaW5lcyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkTGluZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ1Nob3dETGluZXNDQicrdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgJChjYikuY2xpY2soIChlKSA9PiB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuY2xpY2tlZE9wdGlvbldpZGdldChlKSApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdTaG93IERpc2FibGVkJywgY2JJRCk7O1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcblxuICAgICAgICB2YXIgY2hlY2tlZDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICBjaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkKSB7XG4gICAgICAgICAgICByZXR1cm4gcm93SURzO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZpbHRlcmVkSURzID0gW107XG4gICAgICAgIGZvciAodmFyIHIgPSAwOyByIDwgcm93SURzLmxlbmd0aDsgcisrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSByb3dJRHNbcl07XG4gICAgICAgICAgICAvLyBIZXJlIGlzIHRoZSBjb25kaXRpb24gdGhhdCBkZXRlcm1pbmVzIHdoZXRoZXIgdGhlIHJvd3MgYXNzb2NpYXRlZCB3aXRoIHRoaXMgSUQgYXJlXG4gICAgICAgICAgICAvLyBzaG93biBvciBoaWRkZW4uXG4gICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1tpZF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkSURzO1xuICAgIH1cblxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDpzdHJpbmcpOmFueSB7XG4gICAgICAgIGlmICghRURERGF0YS5MaW5lc1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuLy8gQSB3aWRnZXQgdG8gdG9nZ2xlIHJlcGxpY2F0ZSBncm91cGluZyBvbiBhbmQgb2ZmXG5jbGFzcyBER0dyb3VwU3R1ZHlSZXBsaWNhdGVzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIHBUaGlzID0gdGhpcztcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydHcm91cFN0dWR5UmVwbGljYXRlc0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayhcbiAgICAgICAgICAgIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBpZiAocFRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcFRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50dXJuT25Sb3dHcm91cGluZygpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHBUaGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHVybk9mZlJvd0dyb3VwaW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWRCeURlZmF1bHQoKSkge1xuICAgICAgICAgICAgY2Iuc2V0QXR0cmlidXRlKCdjaGVja2VkJywgJ2NoZWNrZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdHcm91cCBSZXBsaWNhdGVzJywgY2JJRCk7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IHRydWU7XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyBhIERhdGFHcmlkSGVhZGVyV2lkZ2V0IGRlcml2ZWQgZnJvbSBER1NlYXJjaFdpZGdldC4gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVyc1xuLy8gb3B0aW9ucyBmb3IgYWRkaXRpb25hbCBkYXRhIHR5cGVzLCBxdWVyeWluZyB0aGUgc2VydmVyIGZvciByZXN1bHRzLlxuY2xhc3MgREdMaW5lc1NlYXJjaFdpZGdldCBleHRlbmRzIERHU2VhcmNoV2lkZ2V0IHtcblxuICAgIHNlYXJjaERpc2Nsb3N1cmVFbGVtZW50OmFueTtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDphbnksIGRhdGFHcmlkU3BlYzphbnksIHBsYWNlSG9sZGVyOnN0cmluZywgc2l6ZTpudW1iZXIsXG4gICAgICAgICAgICBnZXRzRm9jdXM6Ym9vbGVhbikge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMsIHBsYWNlSG9sZGVyLCBzaXplLCBnZXRzRm9jdXMpO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnMgd2hlbiBjcmVhdGluZyBpbnB1dFxuICAgIC8vIGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgc3VwZXIuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50cyBoYXZlXG4gICAgLy8gbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjphbnksIHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMoKSkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgfVxufVxuXG5cblxuLy8gQSBoZWFkZXIgd2lkZ2V0IHRvIHByZXBhcmUgdGhlIENhcmJvbiBCYWxhbmNlIHRhYmxlIGNlbGxzLCBhbmQgc2hvdyBvciBoaWRlIHRoZW0uXG5jbGFzcyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRIZWFkZXJXaWRnZXQge1xuXG4gICAgY2hlY2tCb3hFbGVtZW50OmFueTtcbiAgICBsYWJlbEVsZW1lbnQ6YW55O1xuICAgIGhpZ2hsaWdodGVkOmJvb2xlYW47XG4gICAgY2hlY2tib3hFbmFibGVkOmJvb2xlYW47XG5cbiAgICAvLyBzdG9yZSBtb3JlIHNwZWNpZmljIHR5cGUgb2Ygc3BlYyB0byBnZXQgdG8gY2FyYm9uQmFsYW5jZUNvbCBsYXRlclxuICAgIHByaXZhdGUgX2xpbmVTcGVjOkRhdGFHcmlkU3BlY0xpbmVzO1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMuY2hlY2tib3hFbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5oaWdobGlnaHRlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9saW5lU3BlYyA9IGRhdGFHcmlkU3BlYztcbiAgICB9XG5cblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCArICdDYXJCYWwnICsgdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgY2IuY2xhc3NOYW1lID0gJ3RhYmxlQ29udHJvbCc7XG4gICAgICAgICQoY2IpLmNsaWNrKChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZhdGVDYXJib25CYWxhbmNlKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBsYWJlbDpIVE1MRWxlbWVudCA9IHRoaXMuX2NyZWF0ZUxhYmVsKCdDYXJib24gQmFsYW5jZScsIGNiSUQpO1xuXG4gICAgICAgIHZhciBzcGFuOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICAgIHNwYW4uY2xhc3NOYW1lID0gJ3RhYmxlQ29udHJvbCc7XG4gICAgICAgIHNwYW4uYXBwZW5kQ2hpbGQoY2IpO1xuICAgICAgICBzcGFuLmFwcGVuZENoaWxkKGxhYmVsKTtcblxuICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudCA9IGNiO1xuICAgICAgICB0aGlzLmxhYmVsRWxlbWVudCA9IGxhYmVsO1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBzcGFuO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICB9XG5cbiAgICBoaWdobGlnaHQoaDpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5oaWdobGlnaHRlZCA9IGg7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrYm94RW5hYmxlZCkge1xuICAgICAgICAgICAgaWYgKGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhYmVsRWxlbWVudC5zdHlsZS5jb2xvciA9ICdyZWQnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhYmVsRWxlbWVudC5zdHlsZS5jb2xvciA9ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZW5hYmxlKGg6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2hlY2tib3hFbmFibGVkID0gaDtcbiAgICAgICAgaWYgKGgpIHtcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0KHRoaXMuaGlnaGxpZ2h0ZWQpO1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAnZ3JheSc7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFjdGl2YXRlQ2FyYm9uQmFsYW5jZSgpOnZvaWQge1xuICAgICAgICB2YXIgdWk6RnVsbFN0dWR5QmlvbWFzc1VJLFxuICAgICAgICAgICAgY2FsbGJhY2s6RnVsbFN0dWR5QmlvbWFzc1VJUmVzdWx0c0NhbGxiYWNrO1xuICAgICAgICBjYWxsYmFjayA9IChlcnJvcjpzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwSUQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBGaWxlbmFtZT86c3RyaW5nLFxuICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzcz86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBTdHVkeUQubWV0YWJvbGljTWFwSUQgPSBtZXRhYm9saWNNYXBJRDtcbiAgICAgICAgICAgICAgICBTdHVkeUQubWV0YWJvbGljTWFwTmFtZSA9IG1ldGFib2xpY01hcEZpbGVuYW1lO1xuICAgICAgICAgICAgICAgIFN0dWR5RC5iaW9tYXNzQ2FsY3VsYXRpb24gPSBmaW5hbEJpb21hc3M7XG4gICAgICAgICAgICAgICAgU3R1ZHlELm9uQ2hhbmdlZE1ldGFib2xpY01hcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5zaG93Q29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBnZXQgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIHRvIG11bHRpcGx5IGFnYWluc3QgT0QuXG4gICAgICAgICAgICAvLyBIYXZlIHRoZXkgc2V0IHRoaXMgdXAgeWV0P1xuICAgICAgICAgICAgaWYgKCFTdHVkeUQuYmlvbWFzc0NhbGN1bGF0aW9uIHx8IFN0dWR5RC5iaW9tYXNzQ2FsY3VsYXRpb24gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIC8vIE11c3Qgc2V0dXAgdGhlIGJpb21hc3NcbiAgICAgICAgICAgICAgICB1aSA9IG5ldyBGdWxsU3R1ZHlCaW9tYXNzVUkoY2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3Quc2hvd0NvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5oaWRlQ29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuY2xhc3MgRGF0YUdyaWRBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZCB7XG5cblxuICAgIHNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQ6Ym9vbGVhbjtcbiAgICBncmFwaFJlZnJlc2hUaW1lcklEOmFueTtcbiAgICAvLyBSaWdodCBub3cgd2UncmUgbm90IGFjdHVhbGx5IHVzaW5nIHRoZSBjb250ZW50cyBvZiB0aGlzIGFycmF5LCBqdXN0XG4gICAgLy8gY2hlY2tpbmcgdG8gc2VlIGlmIGl0J3Mgbm9uLWVtcHR5LlxuICAgIHJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZDpudW1iZXJbXTtcblxuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQgPSBbXTtcbiAgICAgICAgdGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkID0gZmFsc2U7XG4gICAgfVxuXG5cbiAgICBpbnZhbGlkYXRlQXNzYXlSZWNvcmRzKHJlY29yZHM6bnVtYmVyW10pOnZvaWQge1xuICAgICAgICB0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZCA9IHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmNvbmNhdChyZWNvcmRzKTtcbiAgICAgICAgaWYgKCF0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGNsaWNrZWREaXNjbG9zZShkaXNjbG9zZTpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdmFyIHNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzID0gdGhpcy5nZXRTcGVjKCk7XG4gICAgICAgIHZhciB0YWJsZSA9IHNwZWMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgIHZhciBkaXYgPSBzcGVjLnVuZGlzY2xvc2VkU2VjdGlvbkRpdjtcbiAgICAgICAgaWYgKCFkaXYgfHwgIXRhYmxlKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAoZGlzY2xvc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIGEgdGFibGUuIFRoaXMgYnJlYWtzIHVwXG4gICAgICAgICAgICAvLyB0YWJsZSByZWNyZWF0aW9uIGludG8gc2VwYXJhdGUgZXZlbnRzLCBzbyB0aGUgYnJvd3NlciBjYW4gdXBkYXRlIFVJLlxuICAgICAgICAgICAgaWYgKHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy50cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCgpLCAxMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgdHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKTp2b2lkIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucXVldWVHcmFwaFJlbWFrZSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGV4ZWN1dGUgcmVjb3JkcyByZWZyZXNoOiAnICsgZSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgX2NhbmNlbEdyYXBoKCkge1xuICAgICAgICBpZiAodGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQ7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgdGhlIGdyYXBoLlxuICAgIHF1ZXVlR3JhcGhSZW1ha2UoKSB7XG4gICAgICAgIHRoaXMuX2NhbmNlbEdyYXBoKCk7XG4gICAgICAgIHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCA9IHNldFRpbWVvdXQoICgpID0+IHRoaXMucmVtYWtlR3JhcGhBcmVhKCksIDEwMCApO1xuICAgIH1cblxuXG4gICAgcmVtYWtlR3JhcGhBcmVhKCkge1xuICAgICAgICB2YXIgc3BlYzpEYXRhR3JpZFNwZWNBc3NheXMgPSB0aGlzLmdldFNwZWMoKSwgZywgY29udmVydCwgY29tcGFyZTtcbiAgICAgICAgLy8gaWYgY2FsbGVkIGRpcmVjdGx5LCBjYW5jZWwgYW55IHBlbmRpbmcgcmVxdWVzdHMgaW4gXCJxdWV1ZVwiXG4gICAgICAgIHRoaXMuX2NhbmNlbEdyYXBoKCk7XG5cbiAgICAgICAgaWYgKCFTdHVkeURHcmFwaGluZyB8fCAhc3BlYyB8fCAhc3BlYy5ncmFwaE9iamVjdCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZyA9IHNwZWMuZ3JhcGhPYmplY3Q7XG4gICAgICAgIHZhciBjb2xvck9iaiA9IEVERERhdGFbJ2NvbG9yJ107XG4gICAgICAgIHZhciBkYXRhU2V0cyA9IFtdO1xuICAgICAgICBzcGVjLmdldFJlY29yZElEcygpLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXk6YW55ID0gRURERGF0YS5Bc3NheXNbaWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgIGxpbmU6YW55ID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgIG1lYXN1cmVzO1xuICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgfHwgIWxpbmUuYWN0aXZlKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgbWVhc3VyZXMgPSBhc3NheS5tZWFzdXJlcyB8fCBbXTtcbiAgICAgICAgICAgIG1lYXN1cmVzLmZvckVhY2goKG0pID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbV0sIHNldDtcbiAgICAgICAgICAgICAgICB2YXIgbmFtZSA9IGFzc2F5Lm5hbWU7XG4gICAgICAgICAgICAgICAgdmFyIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICB2YXIgbGluZU5hbWUgPSBsaW5lLm5hbWU7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGFPYmogPSB7XG4gICAgICAgICAgICAgICAgICAgICdtZWFzdXJlJzogbWVhc3VyZSxcbiAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBFREREYXRhLFxuICAgICAgICAgICAgICAgICAgICAnbmFtZSc6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICdjb2xvcic6IGNvbG9yLFxuICAgICAgICAgICAgICAgICAgICAnbGluZU5hbWUnOiBsaW5lTmFtZVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgdmFyIHNpbmdsZUFzc2F5T2JqID0gR3JhcGhIZWxwZXJNZXRob2RzLnRyYW5zZm9ybVNpbmdsZUxpbmVJdGVtKGRhdGFPYmopO1xuXG4gICAgICAgICAgICAgICAgaWYgKGxpbmUuY29udHJvbCkgc2luZ2xlQXNzYXlPYmouaXNjb250cm9sID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBkYXRhU2V0cy5wdXNoKHNpbmdsZUFzc2F5T2JqKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBnLmFkZE5ld1NldChkYXRhU2V0cyk7XG4gICAgfVxufVxuXG5cblxuLy8gVGhlIHNwZWMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gRGF0YUdyaWQgdG8gY3JlYXRlIHRoZSBBc3NheXMgdGFibGUocylcbmNsYXNzIERhdGFHcmlkU3BlY0Fzc2F5cyBleHRlbmRzIERhdGFHcmlkU3BlY0Jhc2Uge1xuXG4gICAgcHJvdG9jb2xJRDphbnk7XG4gICAgcHJvdG9jb2xOYW1lOnN0cmluZztcbiAgICBhc3NheUlEc0luUHJvdG9jb2w6bnVtYmVyW107XG4gICAgbWV0YURhdGFJRHNVc2VkSW5Bc3NheXM6YW55O1xuICAgIG1heGltdW1YVmFsdWVJbkRhdGE6bnVtYmVyO1xuXG4gICAgdW5kaXNjbG9zZWRTZWN0aW9uRGl2OmFueTtcblxuICAgIG1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG4gICAgZ3JhcGhBcmVhSGVhZGVyU3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG5cbiAgICBncmFwaE9iamVjdDphbnk7XG5cblxuICAgIGNvbnN0cnVjdG9yKHByb3RvY29sSUQpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5wcm90b2NvbElEID0gcHJvdG9jb2xJRDtcbiAgICAgICAgdGhpcy5wcm90b2NvbE5hbWUgPSBFREREYXRhLlByb3RvY29sc1twcm90b2NvbElEXS5uYW1lO1xuICAgICAgICB0aGlzLmdyYXBoT2JqZWN0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMgPSBudWxsO1xuICAgIH1cblxuXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5yZWZyZXNoSURMaXN0KCk7XG4gICAgICAgIHRoaXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTtcbiAgICAgICAgdGhpcy5maW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMoKTtcbiAgICAgICAgc3VwZXIuaW5pdCgpO1xuICAgIH1cblxuXG4gICAgcmVmcmVzaElETGlzdCgpOnZvaWQge1xuICAgICAgICAvLyBGaW5kIG91dCB3aGljaCBwcm90b2NvbHMgaGF2ZSBhc3NheXMgd2l0aCBtZWFzdXJlbWVudHMgLSBkaXNhYmxlZCBvciBub1xuICAgICAgICB0aGlzLmFzc2F5SURzSW5Qcm90b2NvbCA9IFtdO1xuICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkOnN0cmluZywgYXNzYXk6QXNzYXlSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmU6TGluZVJlY29yZDtcbiAgICAgICAgICAgIC8vIHNraXAgYXNzYXlzIGZvciBvdGhlciBwcm90b2NvbHNcbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RvY29sSUQgPT09IGFzc2F5LnBpZCkge1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgLy8gc2tpcCBhc3NheXMgd2l0aG91dCBhIHZhbGlkIGxpbmUgb3Igd2l0aCBhIGRpc2FibGVkIGxpbmVcbiAgICAgICAgICAgICAgICBpZiAobGluZSAmJiBsaW5lLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2F5SURzSW5Qcm90b2NvbC5wdXNoKGFzc2F5LmlkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKTphbnlbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFzc2F5SURzSW5Qcm90b2NvbDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgYW4gb3ZlcnJpZGUuICBDYWxsZWQgd2hlbiBhIGRhdGEgcmVzdCBpcyB0cmlnZ2VyZWQsIGJ1dCBiZWZvcmUgdGhlIHRhYmxlIHJvd3MgYXJlXG4gICAgLy8gcmVidWlsdC5cbiAgICBvbkRhdGFSZXNldChkYXRhR3JpZDpEYXRhR3JpZCk6dm9pZCB7XG4gICAgICAgIHRoaXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTtcbiAgICAgICAgaWYgKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjICYmIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICQodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkuY2hpbGRyZW4oJzpmaXJzdCcpLnRleHQoXG4gICAgICAgICAgICAgICAgICAgICdNZWFzdXJpbmcgVGltZXMgKFJhbmdlIDAgdG8gJyArIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSArICcpJyk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZSB0YWJsZSBlbGVtZW50IG9uIHRoZSBwYWdlIHRoYXQgd2lsbCBiZSB0dXJuZWQgaW50byB0aGUgRGF0YUdyaWQuICBBbnkgcHJlZXhpc3RpbmcgdGFibGVcbiAgICAvLyBjb250ZW50IHdpbGwgYmUgcmVtb3ZlZC5cbiAgICBnZXRUYWJsZUVsZW1lbnQoKSB7XG4gICAgICAgIHZhciBzZWN0aW9uLCBwcm90b2NvbERpdiwgdGl0bGVEaXYsIHRpdGxlTGluaywgdGFibGUsXG4gICAgICAgICAgICBwID0gdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgdGFibGVJRDpzdHJpbmcgPSAncHJvJyArIHAgKyAnYXNzYXlzdGFibGUnO1xuICAgICAgICAvLyBJZiB3ZSBjYW4ndCBmaW5kIGEgdGFibGUsIHdlIGluc2VydCBhIGNsaWNrLXRvLWRpc2Nsb3NlIGRpdiwgYW5kIHRoZW4gYSB0YWJsZSBkaXJlY3RseVxuICAgICAgICAvLyBhZnRlciBpdC5cbiAgICAgICAgaWYgKCQoJyMnICsgdGFibGVJRCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBzZWN0aW9uID0gJCgnI2Fzc2F5c1NlY3Rpb24nKTtcbiAgICAgICAgICAgIHByb3RvY29sRGl2ID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZGlzY2xvc2UgZGlzY2xvc2VIaWRlJykuYXBwZW5kVG8oc2VjdGlvbik7XG4gICAgICAgICAgICB0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdiA9IHByb3RvY29sRGl2WzBdO1xuICAgICAgICAgICAgdGl0bGVEaXYgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdzZWN0aW9uQ2hhcHRlcicpLmFwcGVuZFRvKHByb3RvY29sRGl2KTtcbiAgICAgICAgICAgIHRpdGxlTGluayA9ICQoJzxzcGFuPicpLmFkZENsYXNzKCdkaXNjbG9zZUxpbmsnKVxuICAgICAgICAgICAgICAgICAgICAudGV4dCh0aGlzLnByb3RvY29sTmFtZSArICcgQXNzYXlzJylcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKHRpdGxlRGl2KTtcbiAgICAgICAgICAgIHRhYmxlID0gJChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGFibGVcIikpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKCdpZCcsIHRhYmxlSUQpLmFkZENsYXNzKCdkaXNjbG9zZUJvZHknKVxuICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8ocHJvdG9jb2xEaXYpO1xuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHRoZSBhY3Rpb25zIHBhbmVsIHJlbWFpbnMgYXQgdGhlIGJvdHRvbS5cbiAgICAgICAgICAgICQoJyNhc3NheXNBY3Rpb25QYW5lbCcpLmFwcGVuZFRvKHNlY3Rpb24pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0YWJsZUlEKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSB0YWJsZSBhcyBhIHdob2xlXG4gICAgZGVmaW5lVGFibGVTcGVjKCk6RGF0YUdyaWRUYWJsZVNwZWMge1xuICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkVGFibGVTcGVjKCdhc3NheXMnK3RoaXMucHJvdG9jb2xJRCwge1xuICAgICAgICAgICAgJ2RlZmF1bHRTb3J0JzogMVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZpbmRNZXRhRGF0YUlEc1VzZWRJbkFzc2F5cygpIHtcbiAgICAgICAgdmFyIHNlZW5IYXNoOmFueSA9IHt9O1xuICAgICAgICB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzID0gW107XG4gICAgICAgIHRoaXMuZ2V0UmVjb3JkSURzKCkuZm9yRWFjaCgoYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgICAgICAkLmVhY2goYXNzYXkubWV0YSB8fCB7fSwgKG1ldGFJZCkgPT4geyBzZWVuSGFzaFttZXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBbXS5wdXNoLmFwcGx5KHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMsIE9iamVjdC5rZXlzKHNlZW5IYXNoKSk7XG4gICAgfVxuXG5cbiAgICBmaW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpOnZvaWQge1xuICAgICAgICB2YXIgbWF4Rm9yQWxsOm51bWJlciA9IDA7XG4gICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCByZWNvcmRzXG4gICAgICAgIG1heEZvckFsbCA9IHRoaXMuZ2V0UmVjb3JkSURzKCkucmVkdWNlKChwcmV2Om51bWJlciwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF0sIG1lYXN1cmVzLCBtYXhGb3JSZWNvcmQ7XG4gICAgICAgICAgICBtZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdO1xuICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIG1lYXN1cmVzXG4gICAgICAgICAgICBtYXhGb3JSZWNvcmQgPSBtZWFzdXJlcy5yZWR1Y2UoKHByZXY6bnVtYmVyLCBtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbG9va3VwOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmU6YW55ID0gbG9va3VwW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG1heEZvck1lYXN1cmU7XG4gICAgICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIGRhdGEgaW4gbWVhc3VyZW1lbnRcbiAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlID0gKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBwb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgcG9pbnRbMF1bMF0pO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JNZWFzdXJlKTtcbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIG1heEZvclJlY29yZCk7XG4gICAgICAgIH0sIDApO1xuICAgICAgICAvLyBBbnl0aGluZyBhYm92ZSAwIGlzIGFjY2VwdGFibGUsIGJ1dCAwIHdpbGwgZGVmYXVsdCBpbnN0ZWFkIHRvIDEuXG4gICAgICAgIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSA9IG1heEZvckFsbCB8fCAxO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkQXNzYXlOYW1lKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gSW4gYW4gb2xkIHR5cGljYWwgRURERGF0YS5Bc3NheXMgcmVjb3JkIHRoaXMgc3RyaW5nIGlzIGN1cnJlbnRseSBwcmUtYXNzZW1ibGVkIGFuZCBzdG9yZWRcbiAgICAgICAgLy8gaW4gJ2ZuJy4gQnV0IHdlJ3JlIHBoYXNpbmcgdGhhdCBvdXQuXG4gICAgICAgIHZhciBhc3NheSwgbGluZTtcbiAgICAgICAgaWYgKChhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gW2xpbmUubiwgdGhpcy5wcm90b2NvbE5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGFzc2F5LCBleHBlcmltZW50ZXI7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbYXNzYXkuZXhwXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwZXJpbWVudGVyLmluaXRpYWxzLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TW9kaWZpY2F0aW9uKGluZGV4OmFueSk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2Q7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgaGVhZGVycyBhbG9uZyB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUhlYWRlclNwZWMoKTpEYXRhR3JpZEhlYWRlclNwZWNbXSB7XG4gICAgICAgIC8vIG1hcCBhbGwgbWV0YWRhdGEgSURzIHRvIEhlYWRlclNwZWMgb2JqZWN0c1xuICAgICAgICB2YXIgbWV0YURhdGFIZWFkZXJzOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyICsgaW5kZXgsICdoQXNzYXlzTWV0YScrdGhpcy5wcm90b2NvbElEKydpZCcgKyBpZCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogbWRUeXBlLm5hbWUsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYyA9IG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoOCArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgJ2hBc3NheXNHcmFwaCcgKyB0aGlzLnByb3RvY29sSUQsIHsgJ2NvbHNwYW4nOiA3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCB9KTtcblxuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMsXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoQXNzYXlzTmFtZScrdGhpcy5wcm90b2NvbElELCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTmFtZScsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEFzc2F5TmFtZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyA9IG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgJ2hBc3NheXNNVGltZXMnK3RoaXMucHJvdG9jb2xJRCwgeyAnbmFtZSc6ICdNZWFzdXJpbmcgVGltZXMnLCAnaGVhZGVyUm93JzogMiB9KTtcblxuICAgICAgICB2YXIgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNNTmFtZScgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHsgJ25hbWUnOiAnTWVhc3VyZW1lbnQnLCAnaGVhZGVyUm93JzogMiB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzVW5pdHMnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7ICduYW1lJzogJ1VuaXRzJywgJ2hlYWRlclJvdyc6IDIgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c0NvdW50JyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAgeyAnbmFtZSc6ICdDb3VudCcsICdoZWFkZXJSb3cnOiAyIH0pLFxuICAgICAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMsXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c0V4cGVyaW1lbnRlcicgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAxXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNNb2RpZmllZCcgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlNb2RpZmljYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFIZWFkZXJzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBtYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChpKSA9PiB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaV07XG4gICAgICAgICAgICBpZiAocmVjb3JkICYmIHJlY29yZC5tZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZC5tZXRhW2lkXSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gVGhlIGNvbHNwYW4gdmFsdWUgZm9yIGFsbCB0aGUgY2VsbHMgdGhhdCBhcmUgYXNzYXktbGV2ZWwgKG5vdCBtZWFzdXJlbWVudC1sZXZlbCkgaXMgYmFzZWQgb25cbiAgICAvLyB0aGUgbnVtYmVyIG9mIG1lYXN1cmVtZW50cyBmb3IgdGhlIHJlc3BlY3RpdmUgcmVjb3JkLiBTcGVjaWZpY2FsbHksIGl0J3MgdGhlIG51bWJlciBvZlxuICAgIC8vIG1ldGFib2xpdGUgYW5kIGdlbmVyYWwgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmUgYXJlIHRyYW5zY3JpcHRvbWljcyBtZWFzdXJlbWVudHMsIHBsdXMgMSBpZiB0aGVyZVxuICAgIC8vIGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50cywgYWxsIGFkZGVkIHRvZ2V0aGVyLiAgKE9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuKVxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCk6bnVtYmVyIHtcbiAgICAgICAgdmFyIHJlYyA9IEVERERhdGEuQXNzYXlzW2luZGV4XTtcbiAgICAgICAgdmFyIHY6bnVtYmVyID0gKChyZWMuZ2VuZXJhbCAgICAgICAgIHx8IFtdKS5sZW5ndGggK1xuICAgICAgICAgICAgICAgICAgICAgICAgKHJlYy5tZXRhYm9saXRlcyAgICAgfHwgW10pLmxlbmd0aCArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID8gMSA6IDApICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgocmVjLnByb3RlaW5zICAgICAgIHx8IFtdKS5sZW5ndGggPyAxIDogMCkgICApIHx8IDE7XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVBc3NheU5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgbGluZSA9IEVERERhdGEuTGluZXNbcmVjb3JkLmxpZF0sIHNpZGVNZW51SXRlbXMgPSBbXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1lZGl0LWxpbmtcIj5FZGl0IEFzc2F5PC9hPicsXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1yZWxvYWQtbGlua1wiPlJlbG9hZCBEYXRhPC9hPicsXG4gICAgICAgICAgICAnPGEgaHJlZj1cIi9leHBvcnQ/YXNzYXlJZD0nICsgaW5kZXggKyAnXCI+RXhwb3J0IERhdGEgYXMgQ1NWL2V0YzwvYT4nXG4gICAgICAgIF07XG4gICAgICAgIC8vIFRPRE8gd2UgcHJvYmFibHkgZG9uJ3Qgd2FudCB0byBzcGVjaWFsLWNhc2UgbGlrZSB0aGlzIGJ5IG5hbWVcbiAgICAgICAgaWYgKGdyaWRTcGVjLnByb3RvY29sTmFtZSA9PSBcIlRyYW5zY3JpcHRvbWljc1wiKSB7XG4gICAgICAgICAgICBzaWRlTWVudUl0ZW1zLnB1c2goJzxhIGhyZWY9XCJpbXBvcnQvcm5hc2VxL2VkZ2Vwcm8/YXNzYXk9JytpbmRleCsnXCI+SW1wb3J0IFJOQS1zZXEgZGF0YSBmcm9tIEVER0UtcHJvPC9hPicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hOYW1lJzogJ2Fzc2F5SWQnLFxuICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6IChpZCkgPT4geyByZXR1cm4gJ2Fzc2F5JyArIGlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogc2lkZU1lbnVJdGVtcyxcbiAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbbGluZS5uYW1lLCBncmlkU3BlYy5wcm90b2NvbE5hbWUsIHJlY29yZC5uYW1lXS5qb2luKCctJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBtYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29udGVudFN0ciA9ICcnLCBhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkgJiYgdHlwZSAmJiBhc3NheS5tZXRhICYmIChjb250ZW50U3RyID0gYXNzYXkubWV0YVtpZF0gfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgY29udGVudFN0ciA9IFsgdHlwZS5wcmUgfHwgJycsIGNvbnRlbnRTdHIsIHR5cGUucG9zdGZpeCB8fCAnJyBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnRTdHJcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgXTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcsXG4gICAgICAgICAgICBvcHQ6YW55KTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBjZWxscyA9IFtdLFxuICAgICAgICAgICAgZmFjdG9yeSA9ICgpOkRhdGFHcmlkRGF0YUNlbGwgPT4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4KTtcblxuICAgICAgICBpZiAoKHJlY29yZC5tZXRhYm9saXRlcyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyAncm93c3Bhbic6IHJlY29yZC5tZXRhYm9saXRlcy5sZW5ndGggfSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IElEcyB0byBtZWFzdXJlbWVudHMsIHNvcnQgYnkgbmFtZSwgdGhlbiBjb252ZXJ0IHRvIGNlbGwgb2JqZWN0c1xuICAgICAgICAgICAgICAgIGNlbGxzID0gcmVjb3JkLm1ldGFib2xpdGVzLm1hcChvcHQubWV0YWJvbGl0ZVRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc29ydChvcHQubWV0YWJvbGl0ZVZhbHVlU29ydClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAob3B0Lm1ldGFib2xpdGVWYWx1ZVRvQ2VsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKChyZWNvcmQuZ2VuZXJhbCB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICB7ICdyb3dzcGFuJzogcmVjb3JkLmdlbmVyYWwubGVuZ3RoIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udmVydCBJRHMgdG8gbWVhc3VyZW1lbnRzLCBzb3J0IGJ5IG5hbWUsIHRoZW4gY29udmVydCB0byBjZWxsIG9iamVjdHNcbiAgICAgICAgICAgICAgICBjZWxscyA9IHJlY29yZC5nZW5lcmFsLm1hcChvcHQubWV0YWJvbGl0ZVRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KG9wdC5tZXRhYm9saXRlVmFsdWVTb3J0KVxuICAgICAgICAgICAgICAgICAgICAubWFwKG9wdC5tZXRhYm9saXRlVmFsdWVUb0NlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIG9ubHkgb25lIGNlbGwgaWYgdGhlcmUgaXMgYW55IHRyYW5zY3JpcHRvbWljcyBkYXRhXG4gICAgICAgIGlmICgocmVjb3JkLnRyYW5zY3JpcHRpb25zIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQudHJhbnNjcmlwdFRvQ2VsbChyZWNvcmQudHJhbnNjcmlwdGlvbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBvbmx5IG9uZSBjZWxsIGlmIHRoZXJlIGlzIGFueSBwcm90ZW9taWNzIGRhdGFcbiAgICAgICAgaWYgKChyZWNvcmQucHJvdGVpbnMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC5wcm90ZWluVG9DZWxsKHJlY29yZC5wcm90ZWlucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIGEgbG9hZGluZyBjZWxsIGlmIG5vbmUgY3JlYXRlZCBieSBtZWFzdXJlbWVudHNcbiAgICAgICAgaWYgKCFjZWxscy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmIChyZWNvcmQuY291bnQpIHtcbiAgICAgICAgICAgICAgICAvLyB3ZSBoYXZlIGEgY291bnQsIGJ1dCBubyBkYXRhIHlldDsgc3RpbGwgbG9hZGluZ1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5lbXB0eSkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LmVtcHR5LmNhbGwoe30pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChmYWN0b3J5KCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjZWxscztcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgdmFsdWUuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdtZWFzdXJlbWVudElkJyxcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKCkgPT4geyByZXR1cm4gJ21lYXN1cmVtZW50JyArIHZhbHVlLmlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHZhbHVlLm5hbWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdUcmFuc2NyaXB0b21pY3MgRGF0YSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdQcm90ZW9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJlbXB0eVwiOiAoKSA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICc8aT5ObyBNZWFzdXJlbWVudHM8L2k+J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZVVuaXRzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgdW5pdDphbnkgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlLnlfdW5pdHNdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAndW5pdCc6IHVuaXQubmFtZSB8fCAnJyB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS51bml0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnUlBLTSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICcnIC8vIFRPRE86IHdoYXQgYXJlIHByb3Rlb21pY3MgbWVhc3VyZW1lbnQgdW5pdHM/XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVDb3VudENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICAvLyBmdW5jdGlvbiB0byB1c2UgaW4gQXJyYXkjcmVkdWNlIHRvIGNvdW50IGFsbCB0aGUgdmFsdWVzIGluIGEgc2V0IG9mIG1lYXN1cmVtZW50c1xuICAgICAgICB2YXIgcmVkdWNlQ291bnQgPSAocHJldjpudW1iZXIsIG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHByZXYgKyAobWVhc3VyZS52YWx1ZXMgfHwgW10pLmxlbmd0aDtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAnbWVhc3VyZSc6IG1lYXN1cmUgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsICh2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSkubGVuZ3RoLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCBpZHMucmVkdWNlKHJlZHVjZUNvdW50LCAwKSwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgaWRzLnJlZHVjZShyZWR1Y2VDb3VudCwgMCksICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBzdmdDZWxsRm9yVGltZUNvdW50cyA9IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY29uc29saWRhdGVkLCBzdmcgPSAnJywgdGltZUNvdW50ID0ge307XG4gICAgICAgICAgICAgICAgLy8gY291bnQgdmFsdWVzIGF0IGVhY2ggeCBmb3IgYWxsIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgICAgIGlkcy5mb3JFYWNoKChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzOm51bWJlcltdW11bXSA9IG1lYXN1cmUudmFsdWVzIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICBwb2ludHMuZm9yRWFjaCgocG9pbnQ6bnVtYmVyW11bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGltZUNvdW50W3BvaW50WzBdWzBdXSA9IHRpbWVDb3VudFtwb2ludFswXVswXV0gfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFR5cGVzY3JpcHQgY29tcGlsZXIgZG9lcyBub3QgbGlrZSB1c2luZyBpbmNyZW1lbnQgb3BlcmF0b3Igb24gZXhwcmVzc2lvblxuICAgICAgICAgICAgICAgICAgICAgICAgKyt0aW1lQ291bnRbcG9pbnRbMF1bMF1dO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBtYXAgdGhlIGNvdW50cyB0byBbeCwgeV0gdHVwbGVzXG4gICAgICAgICAgICAgICAgY29uc29saWRhdGVkID0gJC5tYXAodGltZUNvdW50LCAodmFsdWUsIGtleSkgPT4gW1sgW3BhcnNlRmxvYXQoa2V5KV0sIFt2YWx1ZV0gXV0pO1xuICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIFNWRyBzdHJpbmdcbiAgICAgICAgICAgICAgICBpZiAoY29uc29saWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdmcgPSBncmlkU3BlYy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMoY29uc29saWRhdGVkLCAnJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlID0gdmFsdWUubWVhc3VyZSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0ID0gbWVhc3VyZS5mb3JtYXQgPT09IDEgPyAnY2FyYm9uJyA6ICcnLFxuICAgICAgICAgICAgICAgICAgICBwb2ludHMgPSB2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKHBvaW50cywgZm9ybWF0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiBzdmdDZWxsRm9yVGltZUNvdW50cyxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHNcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUV4cGVyaW1lbnRlckNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgZXhwID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLmV4cDtcbiAgICAgICAgdmFyIHVSZWNvcmQgPSBFREREYXRhLlVzZXJzW2V4cF07XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdVJlY29yZCA/IHVSZWNvcmQuaW5pdGlhbHMgOiAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyhFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhwb2ludHMsIGZvcm1hdDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzdmcgPSAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmVyc2lvbj1cIjEuMlwiIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwcHhcIlxcXG4gICAgICAgICAgICAgICAgICAgIHZpZXdCb3g9XCIwIDAgNDcwIDEwXCIgcHJlc2VydmVBc3BlY3RSYXRpbz1cIm5vbmVcIj5cXFxuICAgICAgICAgICAgICAgIDxzdHlsZSB0eXBlPVwidGV4dC9jc3NcIj48IVtDREFUQVtcXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNQIHsgc3Ryb2tlOnJnYmEoMCwwLDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jViB7IHN0cm9rZTpyZ2JhKDAsMCwyMzAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jRSB7IHN0cm9rZTpyZ2JhKDI1NSwxMjgsMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICBdXT48L3N0eWxlPlxcXG4gICAgICAgICAgICAgICAgPHBhdGggZmlsbD1cInJnYmEoMCwwLDAsMC4wLjA1KVwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZT1cInJnYmEoMCwwLDAsMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBkPVwiTTEwLDVoNDUwXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9XCJzdHJva2Utd2lkdGg6MnB4O1wiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZS13aWR0aD1cIjJcIj48L3BhdGg+JztcbiAgICAgICAgdmFyIHBhdGhzID0gWyBzdmcgXTtcbiAgICAgICAgcG9pbnRzLnNvcnQoKGEsYikgPT4geyByZXR1cm4gYVswXSAtIGJbMF07IH0pLmZvckVhY2goKHBvaW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgeCA9IHBvaW50WzBdWzBdLFxuICAgICAgICAgICAgICAgIHkgPSBwb2ludFsxXVswXSxcbiAgICAgICAgICAgICAgICByeCA9ICgoeCAvIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSkgKiA0NTApICsgMTAsXG4gICAgICAgICAgICAgICAgdHQgPSBbeSwgJyBhdCAnLCB4LCAnaCddLmpvaW4oJycpO1xuICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY0VcIiBkPVwiTScsIHJ4LCAnLDV2NFwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICBpZiAoeSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJywydjZcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNQXCIgZD1cIk0nLCByeCwgJywxdjRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKGZvcm1hdCA9PT0gJ2NhcmJvbicpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjVlwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcGF0aHMucHVzaCgnPC9zdmc+Jyk7XG4gICAgICAgIHJldHVybiBwYXRocy5qb2luKCdcXG4nKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGRhdGEgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVDb2x1bW5TcGVjKCk6RGF0YUdyaWRDb2x1bW5TcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICBtZXRhRGF0YUNvbHM6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICByaWdodFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW107XG4gICAgICAgIC8vIGFkZCBjbGljayBoYW5kbGVyIGZvciBtZW51IG9uIGFzc2F5IG5hbWUgY2VsbHNcbiAgICAgICAgJCh0aGlzLnRhYmxlRWxlbWVudCkub24oJ2NsaWNrJywgJ2EuYXNzYXktZWRpdC1saW5rJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBTdHVkeUQuZWRpdEFzc2F5KCQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICdhLmFzc2F5LXJlbG9hZC1saW5rJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgdmFyIGlkID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpLFxuICAgICAgICAgICAgICAgIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgU3R1ZHlELnJlcXVlc3RBc3NheURhdGEoYXNzYXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgbGVmdFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIHRoaXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscylcbiAgICAgICAgICAgXTtcblxuICAgICAgICBtZXRhRGF0YUNvbHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIgKyBpbmRleCwgdGhpcy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNZWFzdXJlbWVudE5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDMgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlVW5pdHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDQgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlQ291bnRDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDUgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTWVhc3VyaW5nVGltZXNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG4gICAgZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSB7XG4gICAgICAgIHZhciB0b3BTZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ05hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdmFyIG1ldGFEYXRhQ29sR3JvdXBzOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgICAgIG1ldGFEYXRhQ29sR3JvdXBzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKG1kVHlwZS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGJvdHRvbVNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyZW1lbnQnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdVbml0cycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NvdW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyaW5nIFRpbWVzJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRXhwZXJpbWVudGVyJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFzdCBNb2RpZmllZCcsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gdG9wU2VjdGlvbi5jb25jYXQobWV0YURhdGFDb2xHcm91cHMsIGJvdHRvbVNlY3Rpb24pO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBoZWFkZXIgd2lkZ2V0cy5cbiAgICAvLyBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGFkZGVkIHRvIHRoZSBoZWFkZXIgYmFyLlxuICAgIC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzdWJzdHJpbmcgc2VhcmNoaW5nXG4gICAgICAgIHZhciBzZWFyY2hBc3NheXNXaWRnZXQgPSBuZXcgREdBc3NheXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggQXNzYXlzJywgMzAsXG4gICAgICAgICAgICAgICAgZmFsc2UpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWFyY2hBc3NheXNXaWRnZXQpO1xuXG4gICAgICAgIHZhciBkZXNlbGVjdEFsbFdpZGdldCA9IG5ldyBER0Rlc2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgZGVzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkZXNlbGVjdEFsbFdpZGdldCk7XG4gICAgICAgIFxuICAgICAgICAvLyBBIFwic2VsZWN0IGFsbFwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy5cbiAgICAvLyBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGRpc3BsYXllZCBpbiB0aGUgbWVudS5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIEFzc2F5c1xuICAgICAgICB2YXIgZGlzYWJsZWRBc3NheXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZEFzc2F5c1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkQXNzYXlzV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG4gICAgb25Jbml0aWFsaXplZChkYXRhR3JpZDpEYXRhR3JpZEFzc2F5cyk6dm9pZCB7XG5cbiAgICAgICAgLy8gV2lyZSB1cCB0aGUgJ2FjdGlvbiBwYW5lbHMnIGZvciB0aGUgQXNzYXlzIHNlY3Rpb25zXG4gICAgICAgIHZhciB0YWJsZSA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgICQodGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gU3R1ZHlELnF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93KCkpO1xuXG4gICAgICAgIGlmICh0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdikge1xuICAgICAgICAgICAgJCh0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdikuY2xpY2soKCkgPT4gZGF0YUdyaWQuY2xpY2tlZERpc2Nsb3NlKHRydWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwID0gdGhpcy5wcm90b2NvbElEO1xuICAgICAgICB2YXIgZ3JhcGhpZCA9IFwicHJvXCIgKyBwICsgXCJncmFwaFwiO1xuICAgICAgICAgIGlmICh0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgLy9odG1sIGZvciB0aGUgZGlmZmVyZW50IGdyYXBoc1xuICAgICAgICAgICAgICAgICAgICB2YXIgaHRtbCA9XG4gICAgICAgICAgICAgICAgICAgICAgICAnPGRpdiBjbGFzcz1cImdyYXBoQ29udGFpbmVyXCIgaWQ9ICcgKyBncmFwaGlkICsgJz48L2Rpdj4nXG4gICAgICAgICAgICAgICAgICAgIHZhciBkb20gPSAkKCBodG1sICk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjbG9uZWRCdXR0b25zID0gJCgnLmFzc2F5LXNlY3Rpb246Zmlyc3QnKS5jbG9uZSgpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2xvbmVkQ2xhc3NlcyA9ICQoJy5jaGFydElkczpmaXJzdCcpLmNsb25lKCk7XG4gICAgICAgICAgICAgICAgICAgICQoY2xvbmVkQnV0dG9ucykuYXBwZW5kVG8odGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICAkKGNsb25lZENsYXNzZXMpLmFwcGVuZFRvKHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMuZWxlbWVudCkuYXBwZW5kKGRvbSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIEluaXRpYWxpemUgdGhlIGdyYXBoIG9iamVjdFxuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhPYmplY3QgPSBPYmplY3QuY3JlYXRlKFN0dWR5REdyYXBoaW5nKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoT2JqZWN0LlNldHVwKGdyYXBoaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIFJ1biBpdCBvbmNlIGluIGNhc2UgdGhlIHBhZ2Ugd2FzIGdlbmVyYXRlZCB3aXRoIGNoZWNrZWQgQXNzYXlzXG4gICAgICAgIFN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpO1xuICAgIH1cbn1cblxuXG5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgQXNzYXlzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRBc3NheXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ1Nob3dEQXNzYXlzQ0InK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgICQoY2IpLmNsaWNrKCAoZSkgPT4gdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmNsaWNrZWRPcHRpb25XaWRnZXQoZSkgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnU2hvdyBEaXNhYmxlZCcsIGNiSUQpOztcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IHJvd0lEcy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gcm93SURzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOmFueSk6YW55IHtcbiAgICAgICAgaWYgKCFFREREYXRhLkFzc2F5c1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyBhIERhdGFHcmlkSGVhZGVyV2lkZ2V0IGRlcml2ZWQgZnJvbSBER1NlYXJjaFdpZGdldC4gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVyc1xuLy8gb3B0aW9ucyBmb3IgYWRkaXRpb25hbCBkYXRhIHR5cGVzLCBxdWVyeWluZyB0aGUgc2VydmVyIGZvciByZXN1bHRzLlxuY2xhc3MgREdBc3NheXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBzZWFyY2hEaXNjbG9zdXJlRWxlbWVudDphbnk7XG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6YW55LCBkYXRhR3JpZFNwZWM6YW55LCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLFxuICAgICAgICAgICAgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjLCBwbGFjZUhvbGRlciwgc2l6ZSwgZ2V0c0ZvY3VzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zIHdoZW4gY3JlYXRpbmcgaW5wdXRcbiAgICAvLyBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHN1cGVyLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBhcHBlbmQgdGhlIHdpZGdldCBlbGVtZW50cyBiZW5lYXRoIHRoZSBnaXZlbiBlbGVtZW50LiBJZiB0aGUgZWxlbWVudHMgaGF2ZVxuICAgIC8vIG5vdCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgdGhlIHVuaXF1ZUlEIGlzIHBhc3NlZCBhbG9uZy5cbiAgICBhcHBlbmRFbGVtZW50cyhjb250YWluZXI6YW55LCB1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICAgIH1cbn1cblxuXG4vLyB1c2UgSlF1ZXJ5IHJlYWR5IGV2ZW50IHNob3J0Y3V0IHRvIGNhbGwgcHJlcGFyZUl0IHdoZW4gcGFnZSBpcyByZWFkeVxuJCgoKSA9PiBTdHVkeUQucHJlcGFyZUl0KCkpO1xuIl19