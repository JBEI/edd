// File last modified on: Wed Oct 26 2016 17:06:25  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQixxQ0FBcUM7QUFDckMsZ0RBQWdEO0FBQ2hELDJDQUEyQztBQUMzQyxvQ0FBb0M7QUFDcEMseUNBQXlDO0FBQ3pDLDhDQUE4QztBQUM5Qyw2Q0FBNkM7QUFDN0Msa0RBQWtEOzs7Ozs7QUFJbEQsSUFBTyxNQUFNLENBKzZEWjtBQS82REQsV0FBTyxNQUFNLEVBQUMsQ0FBQztJQUNYLFlBQVksQ0FBQztJQUViLElBQUksZUFBbUIsQ0FBQztJQUN4QixJQUFJLDBCQUFzRCxDQUFDO0lBRTNELElBQUksT0FBZ0IsQ0FBQztJQUVyQixJQUFJLHVCQUEyQixDQUFDO0lBRWhDLElBQUksNEJBQWdDLENBQUM7SUFDckMsSUFBSSw2QkFBaUMsQ0FBQztJQUV0QyxJQUFJLGFBQWlCLENBQUM7SUFDdEIsSUFBSSxlQUFtQixDQUFDO0lBQ3hCLElBQUksMEJBQThCLENBQUM7SUFRbkMsSUFBSSxpQkFBcUIsQ0FBQztJQUMxQixJQUFJLDJCQUFtQyxDQUFDO0lBRXhDLElBQUksY0FBa0IsQ0FBQztJQUN2QixJQUFJLFlBQWdCLENBQUM7SUFFckIsOERBQThEO0lBQzlELElBQUksaUJBQWlCLENBQUM7SUFDdEIsSUFBSSxhQUFhLENBQUM7SUFDbEIsbUVBQW1FO0lBQ25FLElBQUksbUJBQW1CLENBQUM7SUFDeEIsSUFBSSxlQUFlLENBQUM7SUFtQnBCLDhDQUE4QztJQUM5QztRQW9CSSw2REFBNkQ7UUFDN0Qsb0NBQVksWUFBaUI7WUFFekIsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7WUFFakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEVB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QUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzFCLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUNELFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFDTCwyQkFBQztBQUFELENBQUMsQUEzQkQsQ0FBbUMsY0FBYyxHQTJCaEQ7QUFHRCx1RUFBdUU7QUFDdkUsQ0FBQyxDQUFDLGNBQU0sT0FBQSxNQUFNLENBQUMsU0FBUyxFQUFFLEVBQWxCLENBQWtCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGUgbGFzdCBtb2RpZmllZCBvbjogV2VkIE9jdCAyNiAyMDE2IDE3OjA2OjI1ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJVdGwudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRyYWdib3hlcy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQmlvbWFzc0NhbGN1bGF0aW9uVUkudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkNhcmJvblN1bW1hdGlvbi50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRGF0YUdyaWQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlN0dWR5R3JhcGhpbmcudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkdyYXBoSGVscGVyTWV0aG9kcy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vdHlwaW5ncy9kMy9kMy5kLnRzXCIvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uL3R5cGluZ3Mvc3Bpbi9zcGluLmQudHNcIi8+O1xuXG5kZWNsYXJlIHZhciBFREREYXRhOkVERERhdGE7XG5cbm1vZHVsZSBTdHVkeUQge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIHZhciBtYWluR3JhcGhPYmplY3Q6YW55O1xuICAgIHZhciBwcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldDogUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQ7XG5cbiAgICB2YXIgc3Bpbm5lcjogU3Bpbm5lcjtcblxuICAgIHZhciBtYWluR3JhcGhSZWZyZXNoVGltZXJJRDphbnk7XG5cbiAgICB2YXIgbGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcjphbnk7XG4gICAgdmFyIGFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyOmFueTtcblxuICAgIHZhciBhdHRhY2htZW50SURzOmFueTtcbiAgICB2YXIgYXR0YWNobWVudHNCeUlEOmFueTtcbiAgICB2YXIgcHJldkRlc2NyaXB0aW9uRWRpdEVsZW1lbnQ6YW55O1xuXG4gICAgLy8gV2UgY2FuIGhhdmUgYSB2YWxpZCBtZXRhYm9saWMgbWFwIGJ1dCBubyB2YWxpZCBiaW9tYXNzIGNhbGN1bGF0aW9uLlxuICAgIC8vIElmIHRoZXkgdHJ5IHRvIHNob3cgY2FyYm9uIGJhbGFuY2UgaW4gdGhhdCBjYXNlLCB3ZSdsbCBicmluZyB1cCB0aGUgVUkgdG8gXG4gICAgLy8gY2FsY3VsYXRlIGJpb21hc3MgZm9yIHRoZSBzcGVjaWZpZWQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcElEOmFueTtcbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcE5hbWU6YW55O1xuICAgIGV4cG9ydCB2YXIgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcjtcbiAgICB2YXIgY2FyYm9uQmFsYW5jZURhdGE6YW55O1xuICAgIHZhciBjYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2g6Ym9vbGVhbjtcblxuICAgIHZhciBjU291cmNlRW50cmllczphbnk7XG4gICAgdmFyIG1UeXBlRW50cmllczphbnk7XG5cbiAgICAvLyBUaGUgdGFibGUgc3BlYyBvYmplY3QgYW5kIHRhYmxlIG9iamVjdCBmb3IgdGhlIExpbmVzIHRhYmxlLlxuICAgIHZhciBsaW5lc0RhdGFHcmlkU3BlYztcbiAgICB2YXIgbGluZXNEYXRhR3JpZDtcbiAgICAvLyBUYWJsZSBzcGVjIGFuZCB0YWJsZSBvYmplY3RzLCBvbmUgZWFjaCBwZXIgUHJvdG9jb2wsIGZvciBBc3NheXMuXG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkU3BlY3M7XG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkcztcblxuXG4gICAgLy8gVXRpbGl0eSBpbnRlcmZhY2UgdXNlZCBieSBHZW5lcmljRmlsdGVyU2VjdGlvbiN1cGRhdGVVbmlxdWVJbmRleGVzSGFzaFxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUlEIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXI7XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUxpc3Qge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcltdO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFVuaXF1ZUlEVG9WYWx1ZSB7XG4gICAgICAgIFtpbmRleDogbnVtYmVyXTogc3RyaW5nO1xuICAgIH1cbiAgICAvLyBVc2VkIGluIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0I3ByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uXG4gICAgZXhwb3J0IGludGVyZmFjZSBSZWNvcmRJRFRvQm9vbGVhbiB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogYm9vbGVhbjtcbiAgICB9XG5cblxuICAgIC8vIEZvciB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gb24gdGhlIG1haW4gZ3JhcGhcbiAgICBleHBvcnQgY2xhc3MgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQge1xuXG4gICAgICAgIGFsbEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGFzc2F5RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8ga2VlcCBhIHNlcGFyYXRlIGZpbHRlciBsaXN0IGZvciBlYWNoIHR5cGUuXG4gICAgICAgIG1ldGFib2xpdGVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBwcm90ZWluRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgZ2VuZUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIG1lYXN1cmVtZW50RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcblxuICAgICAgICBtZXRhYm9saXRlRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcbiAgICAgICAgcHJvdGVpbkRhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBnZW5lcmljRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcblxuICAgICAgICBmaWx0ZXJUYWJsZUpROiBKUXVlcnk7XG4gICAgICAgIHN0dWR5RE9iamVjdDogYW55O1xuICAgICAgICBtYWluR3JhcGhPYmplY3Q6IGFueTtcblxuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGluaXRpYWxpemUgZWFjaCBmaWx0ZXIgbGlzdC5cbiAgICAgICAgY29uc3RydWN0b3Ioc3R1ZHlET2JqZWN0OiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5zdHVkeURPYmplY3QgPSBzdHVkeURPYmplY3Q7XG5cbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkRhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcm9jZXNzZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gbnVsbDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmVhZCB0aHJvdWdoIHRoZSBMaW5lcywgQXNzYXlzLCBhbmQgQXNzYXlNZWFzdXJlbWVudHMgc3RydWN0dXJlcyB0byBsZWFybiB3aGF0IHR5cGVzIGFyZSBwcmVzZW50LFxuICAgICAgICAvLyB0aGVuIGluc3RhbnRpYXRlIHRoZSByZWxldmFudCBzdWJjbGFzc2VzIG9mIEdlbmVyaWNGaWx0ZXJTZWN0aW9uLCB0byBjcmVhdGUgYSBzZXJpZXMgb2ZcbiAgICAgICAgLy8gY29sdW1ucyBmb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIHVuZGVyIHRoZSBtYWluIGdyYXBoIG9uIHRoZSBwYWdlLlxuICAgICAgICAvLyBUaGlzIG11c3QgYmUgb3V0c2lkZSB0aGUgY29uc3RydWN0b3IgYmVjYXVzZSBFREREYXRhLkxpbmVzIGFuZCBFREREYXRhLkFzc2F5cyBhcmUgbm90IGltbWVkaWF0ZWx5IGF2YWlsYWJsZVxuICAgICAgICAvLyBvbiBwYWdlIGxvYWQuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGNyZWF0ZSBhbmQgYWRkIHJlbGV2YW50IGZpbHRlcnMgZm9yIGVhY2ggZ3JvdXAuXG4gICAgICAgIHByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgc2VlbkluTGluZXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5JbkFzc2F5c0hhc2g6IFJlY29yZElEVG9Cb29sZWFuID0ge307XG4gICAgICAgICAgICB2YXIgYUlEc1RvVXNlOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRhYmxlSlEgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdmaWx0ZXJUYWJsZScpLmFwcGVuZFRvKCQoJyNtYWluRmlsdGVyU2VjdGlvbicpKTtcblxuICAgICAgICAgICAgLy8gRmlyc3QgZG8gc29tZSBiYXNpYyBzYW5pdHkgZmlsdGVyaW5nIG9uIHRoZSBsaXN0XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkOiBzdHJpbmcsIGFzc2F5OiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSB8fCAhbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluQXNzYXlzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwgW10sIChtZXRhZGF0YUlkKSA9PiB7IHNlZW5JbkxpbmVzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgIGFJRHNUb1VzZS5wdXNoKGFzc2F5SWQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBmaWx0ZXJzIG9uIGFzc2F5IHRhYmxlc1xuICAgICAgICAgICAgLy8gVE9ETyBtZWRpYSBpcyBub3cgYSBtZXRhZGF0YSB0eXBlLCBzdHJhaW4gYW5kIGNhcmJvbiBzb3VyY2Ugc2hvdWxkIGJlIHRvb1xuICAgICAgICAgICAgdmFyIGFzc2F5RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFByb3RvY29sRmlsdGVyU2VjdGlvbigpKTsgLy8gUHJvdG9jb2xcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBTdHJhaW5GaWx0ZXJTZWN0aW9uKCkpOyAvLyBmaXJzdCBjb2x1bW4gaW4gZmlsdGVyaW5nIHNlY3Rpb25cbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBMaW5lTmFtZUZpbHRlclNlY3Rpb24oKSk7IC8vIExJTkVcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IENhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBBc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24oKSk7IC8vQXNzYXN5IHN1ZmZpeFxuICAgICAgICAgICAgLy8gY29udmVydCBzZWVuIG1ldGFkYXRhIElEcyB0byBGaWx0ZXJTZWN0aW9uIG9iamVjdHMsIGFuZCBwdXNoIHRvIGVuZCBvZiBhc3NheUZpbHRlcnNcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoLmFwcGx5KGFzc2F5RmlsdGVycywgXG4gICAgICAgICAgICAgICAgJC5tYXAoc2VlbkluQXNzYXlzSGFzaCwgKF8sIGlkOiBzdHJpbmcpID0+IG5ldyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoLmFwcGx5KGFzc2F5RmlsdGVycyxcbiAgICAgICAgICAgICAgICAkLm1hcChzZWVuSW5MaW5lc0hhc2gsIChfLCBpZDogc3RyaW5nKSA9PiBuZXcgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpKTtcblxuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycy5wdXNoKG5ldyBNZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycy5wdXNoKG5ldyBNZXRhYm9saXRlRmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycy5wdXNoKG5ldyBQcm90ZWluRmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycy5wdXNoKG5ldyBHZW5lRmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLnB1c2gobmV3IE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgLy8gQWxsIGZpbHRlciBzZWN0aW9ucyBhcmUgY29uc3RydWN0ZWQ7IG5vdyBuZWVkIHRvIGNhbGwgY29uZmlndXJlKCkgb24gYWxsXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXS5jb25jYXQoXG4gICAgICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzKTtcbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycy5mb3JFYWNoKChzZWN0aW9uKSA9PiBzZWN0aW9uLmNvbmZpZ3VyZSgpKTtcblxuICAgICAgICAgICAgLy8gV2UgY2FuIGluaXRpYWxpemUgYWxsIHRoZSBBc3NheS0gYW5kIExpbmUtbGV2ZWwgZmlsdGVycyBpbW1lZGlhdGVseVxuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMgPSBhc3NheUZpbHRlcnM7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMuZm9yRWFjaCgoZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsdGVyLnBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhhSURzVG9Vc2UpO1xuICAgICAgICAgICAgICAgIGZpbHRlci5wb3B1bGF0ZVRhYmxlKCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCBmaWx0ZXJzIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiwgYW5kIGFkZCBpbiB0aGUgb25lcyB0aGF0XG4gICAgICAgIC8vIGNsYWltIHRvIGJlIFwidXNlZnVsXCIuXG4gICAgICAgIHJlcG9wdWxhdGVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGRhcms6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYWxsRmlsdGVycywgKGksIHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh3aWRnZXQuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuYWRkVG9QYXJlbnQodGhpcy5maWx0ZXJUYWJsZUpRWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFwcGx5QmFja2dyb3VuZFN0eWxlKGRhcmspO1xuICAgICAgICAgICAgICAgICAgICBkYXJrID0gIWRhcms7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBHaXZlbiBhIHNldCBvZiBtZWFzdXJlbWVudCByZWNvcmRzIGFuZCBhIGRpY3Rpb25hcnkgb2YgY29ycmVzcG9uZGluZyB0eXBlc1xuICAgICAgICAvLyAocGFzc2VkIGRvd24gZnJvbSB0aGUgc2VydmVyIGFzIGEgcmVzdWx0IG9mIGEgZGF0YSByZXF1ZXN0KSwgc29ydCB0aGVtIGludG9cbiAgICAgICAgLy8gdGhlaXIgdmFyaW91cyBjYXRlZ29yaWVzLCB0aGVuIHBhc3MgZWFjaCBjYXRlZ29yeSB0byB0aGVpciByZWxldmFudCBmaWx0ZXIgb2JqZWN0c1xuICAgICAgICAvLyAocG9zc2libHkgYWRkaW5nIHRvIHRoZSB2YWx1ZXMgaW4gdGhlIGZpbHRlcikgYW5kIHJlZnJlc2ggdGhlIFVJIGZvciBlYWNoIGZpbHRlci5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gcHJvY2VzcyBlYWNoIGdyb3VwIHNlcGFyYXRlbHkgaGVyZS5cbiAgICAgICAgcHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzKG1lYXN1cmVzLCB0eXBlcyk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgcHJvY2VzczogKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbikgPT4gdm9pZDtcblxuICAgICAgICAgICAgdmFyIGZpbHRlcklkcyA9IHsgJ20nOiBbXSwgJ3AnOiBbXSwgJ2cnOiBbXSwgJ18nOiBbXSB9O1xuICAgICAgICAgICAgLy8gbG9vcCBvdmVyIGFsbCBkb3dubG9hZGVkIG1lYXN1cmVtZW50cy4gbWVhc3VyZXMgY29ycmVzcG9uZHMgdG8gQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgICAgICQuZWFjaChtZWFzdXJlcyB8fCB7fSwgKGluZGV4LCBtZWFzdXJlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheSB8fCAhYXNzYXkuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbXR5cGUgPSB0eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJJZHMubS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLnAucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJJZHMuZy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLl8ucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHByb2Nlc3MgPSAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LnBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHMpO1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZVRhYmxlKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5tLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGZpbHRlcklkcy5tKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZmlsdGVySWRzLnAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLnApKTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMuZy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMuZykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5fLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMuXykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBCdWlsZCBhIGxpc3Qgb2YgYWxsIHRoZSBub24tZGlzYWJsZWQgQXNzYXkgSURzIGluIHRoZSBTdHVkeS5cbiAgICAgICAgYnVpbGRBc3NheUlEU2V0KCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBhc3NheUlkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQsIGFzc2F5KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgfHwgIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgYXNzYXlJZHMucHVzaChhc3NheUlkKTtcblxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYXNzYXlJZHM7XG4gICAgICAgIH1cbiAgICAgXG5cbiAgICAgICAgLy8gU3RhcnRpbmcgd2l0aCBhIGxpc3Qgb2YgYWxsIHRoZSBub24tZGlzYWJsZWQgQXNzYXkgSURzIGluIHRoZSBTdHVkeSwgd2UgbG9vcCBpdCB0aHJvdWdoIHRoZVxuICAgICAgICAvLyBMaW5lIGFuZCBBc3NheS1sZXZlbCBmaWx0ZXJzLCBjYXVzaW5nIHRoZSBmaWx0ZXJzIHRvIHJlZnJlc2ggdGhlaXIgVUksIG5hcnJvd2luZyB0aGUgc2V0IGRvd24uXG4gICAgICAgIC8vIFdlIHJlc29sdmUgdGhlIHJlc3VsdGluZyBzZXQgb2YgQXNzYXkgSURzIGludG8gbWVhc3VyZW1lbnQgSURzLCB0aGVuIHBhc3MgdGhlbSBvbiB0byB0aGVcbiAgICAgICAgLy8gbWVhc3VyZW1lbnQtbGV2ZWwgZmlsdGVycy4gIEluIHRoZSBlbmQgd2UgcmV0dXJuIGEgc2V0IG9mIG1lYXN1cmVtZW50IElEcyByZXByZXNlbnRpbmcgdGhlXG4gICAgICAgIC8vIGVuZCByZXN1bHQgb2YgYWxsIHRoZSBmaWx0ZXJzLCBzdWl0YWJsZSBmb3IgcGFzc2luZyB0byB0aGUgZ3JhcGhpbmcgZnVuY3Rpb25zLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBwcm9jZXNzIGVhY2ggZ3JvdXAgc2VwYXJhdGVseSBoZXJlLlxuICAgICAgICBidWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5SWRzID0gdGhpcy5idWlsZEFzc2F5SURTZXQoKTtcblxuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRBc3NheUlkcyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGZpbHRlcmVkQXNzYXlJZHMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudElkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChmaWx0ZXJlZEFzc2F5SWRzLCAoaSwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgICAgICQubWVyZ2UobWVhc3VyZW1lbnRJZHMsIGFzc2F5Lm1lYXN1cmVzIHx8IFtdKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBzdGFydCBvdXQgd2l0aCBmb3VyIHJlZmVyZW5jZXMgdG8gdGhlIGFycmF5IG9mIGF2YWlsYWJsZSBtZWFzdXJlbWVudCBJRHMsIG9uZSBmb3IgZWFjaCBtYWpvciBjYXRlZ29yeS5cbiAgICAgICAgICAgIC8vIEVhY2ggb2YgdGhlc2Ugd2lsbCBiZWNvbWUgaXRzIG93biBhcnJheSBpbiB0dXJuIGFzIHdlIG5hcnJvdyBpdCBkb3duLlxuICAgICAgICAgICAgLy8gVGhpcyBpcyB0byBwcmV2ZW50IGEgc3ViLXNlbGVjdGlvbiBpbiBvbmUgY2F0ZWdvcnkgZnJvbSBvdmVycmlkaW5nIGEgc3ViLXNlbGVjdGlvbiBpbiB0aGUgb3RoZXJzLlxuXG4gICAgICAgICAgICB2YXIgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIHByb3RlaW5NZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBnZW5lTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZXJpY01lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgd2Ugb25seSB0cnkgdG8gZmlsdGVyIGlmIHdlIGdvdCBtZWFzdXJlbWVudHMgdGhhdCBhcHBseSB0byB0aGUgd2lkZ2V0IHR5cGVzXG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKG1ldGFib2xpdGVNZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucHJvdGVpbkRhdGFQcm9jZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcm90ZWluRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcocHJvdGVpbk1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmdlbmVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lcmljTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT25jZSB3ZSd2ZSBmaW5pc2hlZCB3aXRoIHRoZSBmaWx0ZXJpbmcsIHdlIHdhbnQgdG8gc2VlIGlmIGFueSBzdWItc2VsZWN0aW9ucyBoYXZlIGJlZW4gbWFkZSBhY3Jvc3NcbiAgICAgICAgICAgIC8vIGFueSBvZiB0aGUgY2F0ZWdvcmllcywgYW5kIGlmIHNvLCBtZXJnZSB0aG9zZSBzdWItc2VsZWN0aW9ucyBpbnRvIG9uZS5cblxuICAgICAgICAgICAgLy8gVGhlIGlkZWEgaXMsIHdlIGRpc3BsYXkgZXZlcnl0aGluZyB1bnRpbCB0aGUgdXNlciBtYWtlcyBhIHNlbGVjdGlvbiBpbiBvbmUgb3IgbW9yZSBvZiB0aGUgbWFpbiBjYXRlZ29yaWVzLFxuICAgICAgICAgICAgLy8gdGhlbiBkcm9wIGV2ZXJ5dGhpbmcgZnJvbSB0aGUgY2F0ZWdvcmllcyB0aGF0IGNvbnRhaW4gbm8gc2VsZWN0aW9ucy5cblxuICAgICAgICAgICAgLy8gQW4gZXhhbXBsZSBzY2VuYXJpbyB3aWxsIGV4cGxhaW4gd2h5IHRoaXMgaXMgaW1wb3J0YW50OlxuXG4gICAgICAgICAgICAvLyBTYXkgYSB1c2VyIGlzIHByZXNlbnRlZCB3aXRoIHR3byBjYXRlZ29yaWVzLCBNZXRhYm9saXRlIGFuZCBNZWFzdXJlbWVudC5cbiAgICAgICAgICAgIC8vIE1ldGFib2xpdGUgaGFzIGNyaXRlcmlhICdBY2V0YXRlJyBhbmQgJ0V0aGFub2wnIGF2YWlsYWJsZS5cbiAgICAgICAgICAgIC8vIE1lYXN1cmVtZW50IGhhcyBvbmx5IG9uZSBjcml0ZXJpYSBhdmFpbGFibGUsICdPcHRpY2FsIERlbnNpdHknLlxuICAgICAgICAgICAgLy8gQnkgZGVmYXVsdCwgQWNldGF0ZSwgRXRoYW5vbCwgYW5kIE9wdGljYWwgRGVuc2l0eSBhcmUgYWxsIHVuY2hlY2tlZCwgYW5kIGFsbCB2aXNpYmxlIG9uIHRoZSBncmFwaC5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgZXF1aXZhbGVudCB0byAncmV0dXJuIG1lYXN1cmVtZW50cycgYmVsb3cuXG5cbiAgICAgICAgICAgIC8vIElmIHRoZSB1c2VyIGNoZWNrcyAnQWNldGF0ZScsIHRoZXkgZXhwZWN0IG9ubHkgQWNldGF0ZSB0byBiZSBkaXNwbGF5ZWQsIGV2ZW4gdGhvdWdoIG5vIGNoYW5nZSBoYXMgYmVlbiBtYWRlIHRvXG4gICAgICAgICAgICAvLyB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiB3aGVyZSBPcHRpY2FsIERlbnNpdHkgaXMgbGlzdGVkLlxuICAgICAgICAgICAgLy8gSW4gdGhlIGNvZGUgYmVsb3csIGJ5IHRlc3RpbmcgZm9yIGFueSBjaGVja2VkIGJveGVzIGluIHRoZSBtZXRhYm9saXRlRmlsdGVycyBmaWx0ZXJzLFxuICAgICAgICAgICAgLy8gd2UgcmVhbGl6ZSB0aGF0IHRoZSBzZWxlY3Rpb24gaGFzIGJlZW4gbmFycm93ZWQgZG93biwgc28gd2UgYXBwZW5kIHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cyBvbnRvIGRTTS5cbiAgICAgICAgICAgIC8vIFRoZW4gd2hlbiB3ZSBjaGVjayB0aGUgbWVhc3VyZW1lbnRGaWx0ZXJzIGZpbHRlcnMsIHdlIHNlZSB0aGF0IHRoZSBNZWFzdXJlbWVudCBzZWN0aW9uIGhhc1xuICAgICAgICAgICAgLy8gbm90IG5hcnJvd2VkIGRvd24gaXRzIHNldCBvZiBtZWFzdXJlbWVudHMsIHNvIHdlIHNraXAgYXBwZW5kaW5nIHRob3NlIHRvIGRTTS5cbiAgICAgICAgICAgIC8vIFRoZSBlbmQgcmVzdWx0IGlzIG9ubHkgdGhlIEFjZXRhdGUgbWVhc3VyZW1lbnRzLlxuXG4gICAgICAgICAgICAvLyBUaGVuIHN1cHBvc2UgdGhlIHVzZXIgY2hlY2tzICdPcHRpY2FsIERlbnNpdHknLCBpbnRlbmRpbmcgdG8gY29tcGFyZSBBY2V0YXRlIGRpcmVjdGx5IGFnYWluc3QgT3B0aWNhbCBEZW5zaXR5LlxuICAgICAgICAgICAgLy8gU2luY2UgbWVhc3VyZW1lbnRGaWx0ZXJzIG5vdyBoYXMgY2hlY2tlZCBib3hlcywgd2UgcHVzaCBpdHMgbWVhc3VyZW1lbnRzIG9udG8gZFNNLFxuICAgICAgICAgICAgLy8gd2hlcmUgaXQgY29tYmluZXMgd2l0aCB0aGUgQWNldGF0ZS5cblxuICAgICAgICAgICAgdmFyIGFueUNoZWNrZWQgPSAoZmlsdGVyOiBHZW5lcmljRmlsdGVyU2VjdGlvbik6IGJvb2xlYW4gPT4geyByZXR1cm4gZmlsdGVyLmFueUNoZWNrYm94ZXNDaGVja2VkOyB9O1xuXG4gICAgICAgICAgICB2YXIgZFNNOiBhbnlbXSA9IFtdOyAgICAvLyBcIkRlbGliZXJhdGVseSBzZWxlY3RlZCBtZWFzdXJlbWVudHNcIlxuICAgICAgICAgICAgaWYgKCB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChtZXRhYm9saXRlTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKCAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChwcm90ZWluTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKCAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChnZW5lTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChnZW5lcmljTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKGRTTS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZFNNO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1lYXN1cmVtZW50SWRzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVkcmF3IGdyYXBoIHdpdGggbmV3IG1lYXN1cmVtZW50IHR5cGVzLlxuICAgICAgICBjaGVja1JlZHJhd1JlcXVpcmVkKGZvcmNlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHJlZHJhdzogYm9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgLy8gZG8gbm90IHJlZHJhdyBpZiBncmFwaCBpcyBub3QgaW5pdGlhbGl6ZWQgeWV0XG4gICAgICAgICAgICBpZiAodGhpcy5tYWluR3JhcGhPYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZWRyYXcgPSAhIWZvcmNlO1xuICAgICAgICAgICAgICAgIC8vIFdhbGsgZG93biB0aGUgZmlsdGVyIHdpZGdldCBsaXN0LiAgSWYgd2UgZW5jb3VudGVyIG9uZSB3aG9zZSBjb2xsZWN0aXZlIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgLy8gc3RhdGUgaGFzIGNoYW5nZWQgc2luY2Ugd2UgbGFzdCBtYWRlIHRoaXMgd2FsaywgdGhlbiBhIHJlZHJhdyBpcyByZXF1aXJlZC4gTm90ZSB0aGF0XG4gICAgICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIG5vdCBza2lwIHRoaXMgbG9vcCwgZXZlbiBpZiB3ZSBhbHJlYWR5IGtub3cgYSByZWRyYXcgaXMgcmVxdWlyZWQsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgIC8vIGNhbGwgdG8gYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IHNldHMgaW50ZXJuYWwgc3RhdGUgaW4gdGhlIGZpbHRlclxuICAgICAgICAgICAgICAgIC8vIHdpZGdldHMgdGhhdCB3ZSB3aWxsIHVzZSBuZXh0IHRpbWUgYXJvdW5kLlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpbHRlci5hbnlDaGVja2JveGVzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVkcmF3ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlZHJhdztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gQSBnZW5lcmljIHZlcnNpb24gb2YgYSBmaWx0ZXJpbmcgY29sdW1uIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiBiZW5lYXRoIHRoZSBncmFwaCBhcmVhIG9uIHRoZSBwYWdlLFxuICAgIC8vIG1lYW50IHRvIGJlIHN1YmNsYXNzZWQgZm9yIHNwZWNpZmljIGNyaXRlcmlhLlxuICAgIC8vIFdoZW4gaW5pdGlhbGl6ZWQgd2l0aCBhIHNldCBvZiByZWNvcmQgSURzLCB0aGUgY29sdW1uIGlzIGZpbGxlZCB3aXRoIGxhYmVsZWQgY2hlY2tib3hlcywgb25lIGZvciBlYWNoXG4gICAgLy8gdW5pcXVlIHZhbHVlIG9mIHRoZSBnaXZlbiBjcml0ZXJpYSBlbmNvdW50ZXJlZCBpbiB0aGUgcmVjb3Jkcy5cbiAgICAvLyBEdXJpbmcgdXNlLCBhbm90aGVyIHNldCBvZiByZWNvcmQgSURzIGlzIHBhc3NlZCBpbiwgYW5kIGlmIGFueSBjaGVja2JveGVzIGFyZSBjaGVja2VkLCB0aGUgSUQgc2V0IGlzXG4gICAgLy8gbmFycm93ZWQgZG93biB0byBvbmx5IHRob3NlIHJlY29yZHMgdGhhdCBjb250YWluIHRoZSBjaGVja2VkIHZhbHVlcy5cbiAgICAvLyBDaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBnaXZlbiBJRHMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkLFxuICAgIC8vIHZpc3VhbGx5IGluZGljYXRpbmcgdG8gYSB1c2VyIHRoYXQgdGhvc2UgdmFsdWVzIGFyZSBub3QgYXZhaWxhYmxlIGZvciBmdXJ0aGVyIGZpbHRlcmluZy4gXG4gICAgLy8gVGhlIGZpbHRlcnMgYXJlIG1lYW50IHRvIGJlIGNhbGxlZCBpbiBzZXF1ZW5jZSwgZmVlZGluZyBlYWNoIHJldHVybmVkIElEIHNldCBpbnRvIHRoZSBuZXh0LFxuICAgIC8vIHByb2dyZXNzaXZlbHkgbmFycm93aW5nIGRvd24gdGhlIGVuYWJsZWQgY2hlY2tib3hlcy5cbiAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBzdWJjbGFzcyB0aGlzIGZvciBlYWNoIGdyb3VwIHR5cGUuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICAvLyBBIGRpY3Rpb25hcnkgb2YgdGhlIHVuaXF1ZSB2YWx1ZXMgZm91bmQgZm9yIGZpbHRlcmluZyBhZ2FpbnN0LCBhbmQgdGhlIGRpY3Rpb25hcnkncyBjb21wbGVtZW50LlxuICAgICAgICAvLyBFYWNoIHVuaXF1ZSBJRCBpcyBhbiBpbnRlZ2VyLCBhc2NlbmRpbmcgZnJvbSAxLCBpbiB0aGUgb3JkZXIgdGhlIHZhbHVlIHdhcyBmaXJzdCBlbmNvdW50ZXJlZFxuICAgICAgICAvLyB3aGVuIGV4YW1pbmluZyB0aGUgcmVjb3JkIGRhdGEgaW4gdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2guXG4gICAgICAgIHVuaXF1ZVZhbHVlczogVW5pcXVlSURUb1ZhbHVlO1xuICAgICAgICB1bmlxdWVJbmRleGVzOiBWYWx1ZVRvVW5pcXVlSUQ7XG4gICAgICAgIHVuaXF1ZUluZGV4Q291bnRlcjogbnVtYmVyO1xuXG4gICAgICAgIC8vIFRoZSBzb3J0ZWQgb3JkZXIgb2YgdGhlIGxpc3Qgb2YgdW5pcXVlIHZhbHVlcyBmb3VuZCBpbiB0aGUgZmlsdGVyXG4gICAgICAgIHVuaXF1ZVZhbHVlc09yZGVyOiBudW1iZXJbXTtcblxuICAgICAgICAvLyBBIGRpY3Rpb25hcnkgcmVzb2x2aW5nIGEgcmVjb3JkIElEIChhc3NheSBJRCwgbWVhc3VyZW1lbnQgSUQpIHRvIGFuIGFycmF5LiBFYWNoIGFycmF5XG4gICAgICAgIC8vIGNvbnRhaW5zIHRoZSBpbnRlZ2VyIGlkZW50aWZpZXJzIG9mIHRoZSB1bmlxdWUgdmFsdWVzIHRoYXQgYXBwbHkgdG8gdGhhdCByZWNvcmQuXG4gICAgICAgIC8vIChJdCdzIHJhcmUsIGJ1dCB0aGVyZSBjYW4gYWN0dWFsbHkgYmUgbW9yZSB0aGFuIG9uZSBjcml0ZXJpYSB0aGF0IG1hdGNoZXMgYSBnaXZlbiBJRCxcbiAgICAgICAgLy8gIGZvciBleGFtcGxlIGEgTGluZSB3aXRoIHR3byBmZWVkcyBhc3NpZ25lZCB0byBpdC4pXG4gICAgICAgIGZpbHRlckhhc2g6IFZhbHVlVG9VbmlxdWVMaXN0O1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHJlc29sdmluZyB0aGUgZmlsdGVyIHZhbHVlIGludGVnZXIgaWRlbnRpZmllcnMgdG8gSFRNTCBJbnB1dCBjaGVja2JveGVzLlxuICAgICAgICBjaGVja2JveGVzOiB7W2luZGV4OiBudW1iZXJdOiBKUXVlcnl9O1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHVzZWQgdG8gY29tcGFyZSBjaGVja2JveGVzIHdpdGggYSBwcmV2aW91cyBzdGF0ZSB0byBkZXRlcm1pbmUgd2hldGhlciBhblxuICAgICAgICAvLyB1cGRhdGUgaXMgcmVxdWlyZWQuIFZhbHVlcyBhcmUgJ0MnIGZvciBjaGVja2VkLCAnVScgZm9yIHVuY2hlY2tlZCwgYW5kICdOJyBmb3Igbm90XG4gICAgICAgIC8vIGV4aXN0aW5nIGF0IHRoZSB0aW1lLiAoJ04nIGNhbiBiZSB1c2VmdWwgd2hlbiBjaGVja2JveGVzIGFyZSByZW1vdmVkIGZyb20gYSBmaWx0ZXIgZHVlIHRvXG4gICAgICAgIC8vIHRoZSBiYWNrLWVuZCBkYXRhIGNoYW5naW5nLilcbiAgICAgICAgcHJldmlvdXNDaGVja2JveFN0YXRlOiBVbmlxdWVJRFRvVmFsdWU7XG4gICAgICAgIC8vIERpY3Rpb25hcnkgcmVzb2x2aW5nIHRoZSBmaWx0ZXIgdmFsdWUgaW50ZWdlciBpZGVudGlmaWVycyB0byBIVE1MIHRhYmxlIHJvdyBlbGVtZW50cy5cbiAgICAgICAgdGFibGVSb3dzOiB7W2luZGV4OiBudW1iZXJdOiBIVE1MVGFibGVSb3dFbGVtZW50fTtcblxuICAgICAgICAvLyBSZWZlcmVuY2VzIHRvIEhUTUwgZWxlbWVudHMgY3JlYXRlZCBieSB0aGUgZmlsdGVyXG4gICAgICAgIGZpbHRlckNvbHVtbkRpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNsZWFySWNvbnM6IEpRdWVyeTtcbiAgICAgICAgcGxhaW50ZXh0VGl0bGVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBzZWFyY2hCb3g6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIHNlYXJjaEJveFRpdGxlRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2Nyb2xsWm9uZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIGZpbHRlcmluZ1RhYmxlOiBKUXVlcnk7XG4gICAgICAgIHRhYmxlQm9keUVsZW1lbnQ6IEhUTUxUYWJsZUVsZW1lbnQ7XG5cbiAgICAgICAgLy8gU2VhcmNoIGJveCByZWxhdGVkXG4gICAgICAgIHR5cGluZ1RpbWVvdXQ6IG51bWJlcjtcbiAgICAgICAgdHlwaW5nRGVsYXk6IG51bWJlcjtcbiAgICAgICAgY3VycmVudFNlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBwcmV2aW91c1NlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBtaW5DaGFyc1RvVHJpZ2dlclNlYXJjaDogbnVtYmVyO1xuXG4gICAgICAgIGFueUNoZWNrYm94ZXNDaGVja2VkOiBib29sZWFuO1xuXG4gICAgICAgIHNlY3Rpb25UaXRsZTogc3RyaW5nO1xuICAgICAgICBzZWN0aW9uU2hvcnRMYWJlbDogc3RyaW5nO1xuXG4gICAgICAgIC8vIFRPRE86IENvbnZlcnQgdG8gYSBwcm90ZWN0ZWQgY29uc3RydWN0b3IhIFRoZW4gdXNlIGEgZmFjdG9yeSBtZXRob2QgdG8gY3JlYXRlIG9iamVjdHNcbiAgICAgICAgLy8gICAgd2l0aCBjb25maWd1cmUoKSBhbHJlYWR5IGNhbGxlZC4gVHlwZXNjcmlwdCAxLjggZG9lcyBub3Qgc3VwcG9ydCB2aXNpYmlsaXR5XG4gICAgICAgIC8vICAgIG1vZGlmaWVycyBvbiBjb25zdHJ1Y3RvcnMsIHN1cHBvcnQgaXMgYWRkZWQgaW4gVHlwZXNjcmlwdCAyLjBcbiAgICAgICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4Q291bnRlciA9IDA7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyID0gW107XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0ge307XG5cbiAgICAgICAgICAgIHRoaXMudHlwaW5nVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnR5cGluZ0RlbGF5ID0gMzMwOyAgICAvLyBUT0RPOiBOb3QgaW1wbGVtZW50ZWRcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9ICcnO1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9ICcnO1xuICAgICAgICAgICAgdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCA9IDE7XG4gICAgICAgICAgICB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gZmFsc2U7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNvbmZpZ3VyZSh0aXRsZTogc3RyaW5nPSdHZW5lcmljIEZpbHRlcicsIHNob3J0TGFiZWw6IHN0cmluZz0nZ2YnKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9IHRpdGxlO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9IHNob3J0TGFiZWw7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUNvbnRhaW5lck9iamVjdHMoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ3JlYXRlIGFsbCB0aGUgY29udGFpbmVyIEhUTUwgb2JqZWN0c1xuICAgICAgICBjcmVhdGVDb250YWluZXJPYmplY3RzKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHNCb3hJRDogc3RyaW5nID0gJ2ZpbHRlcicgKyB0aGlzLnNlY3Rpb25TaG9ydExhYmVsICsgJ1NlYXJjaEJveCcsXG4gICAgICAgICAgICAgICAgc0JveDogSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyQ29sdW1uRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJDb2x1bW4nKVswXTtcbiAgICAgICAgICAgIHZhciB0ZXh0VGl0bGUgPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJUaXRsZScpLnRleHQodGhpcy5zZWN0aW9uVGl0bGUpO1xuICAgICAgICAgICAgdmFyIGNsZWFySWNvbiA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNsZWFySWNvbicpO1xuICAgICAgICAgICAgdGhpcy5wbGFpbnRleHRUaXRsZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVySGVhZCcpLmFwcGVuZChjbGVhckljb24pLmFwcGVuZCh0ZXh0VGl0bGUpWzBdO1xuXG4gICAgICAgICAgICAkKHNCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIikpXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xuICAgICAgICAgICAgICAgICAgICAnaWQnOiBzQm94SUQsXG4gICAgICAgICAgICAgICAgICAgICduYW1lJzogc0JveElELFxuICAgICAgICAgICAgICAgICAgICAncGxhY2Vob2xkZXInOiB0aGlzLnNlY3Rpb25UaXRsZSxcbiAgICAgICAgICAgICAgICAgICAgJ3NpemUnOiAxNFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc0JveC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dCcpOyAvLyBKUXVlcnkgLmF0dHIoKSBjYW5ub3Qgc2V0IHRoaXNcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoQm94ID0gc0JveDtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdHdvIGNsZWFyIGljY29ucyBmb3IgdGhlIHR3byB2ZXJzaW9ucyBvZiB0aGUgaGVhZGVyXG4gICAgICAgICAgICB2YXIgc2VhcmNoQ2xlYXJJY29uID0gJChcIjxzcGFuPlwiKS5hZGRDbGFzcygnZmlsdGVyQ2xlYXJJY29uJyk7XG4gICAgICAgICAgICB0aGlzLnNlYXJjaEJveFRpdGxlRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJIZWFkU2VhcmNoJykuYXBwZW5kKHNlYXJjaENsZWFySWNvbikuYXBwZW5kKHNCb3gpWzBdO1xuXG4gICAgICAgICAgICB0aGlzLmNsZWFySWNvbnMgPSBjbGVhckljb24uYWRkKHNlYXJjaENsZWFySWNvbik7ICAgIC8vIENvbnNvbGlkYXRlIHRoZSB0d28gSlF1ZXJ5IGVsZW1lbnRzIGludG8gb25lXG5cbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucy5vbignY2xpY2snLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBDaGFuZ2luZyB0aGUgY2hlY2tlZCBzdGF0dXMgd2lsbCBhdXRvbWF0aWNhbGx5IHRyaWdnZXIgYSByZWZyZXNoIGV2ZW50XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuY2hlY2tib3hlcyB8fCB7fSwgKGlkOiBudW1iZXIsIGNoZWNrYm94OiBKUXVlcnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tib3gucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5zY3JvbGxab25lRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJDcml0ZXJpYVNjcm9sbFpvbmUnKVswXTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyaW5nVGFibGUgPSAkKFwiPHRhYmxlPlwiKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFUYWJsZSBkcmFnYm94ZXMnKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2NlbGxwYWRkaW5nJzogMCwgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmQodGhpcy50YWJsZUJvZHlFbGVtZW50ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JChcIjx0Ym9keT5cIilbMF0pO1xuICAgICAgICB9XG5cblxuICAgICAgICBwb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHVzZWRWYWx1ZXM6IFZhbHVlVG9VbmlxdWVJRCwgY3JTZXQ6IG51bWJlcltdLCBjSGFzaDogVW5pcXVlSURUb1ZhbHVlLFxuICAgICAgICAgICAgICAgIHByZXZpb3VzSWRzOiBzdHJpbmdbXTtcbiAgICAgICAgICAgIC8vIGNhbiBnZXQgSURzIGZyb20gbXVsdGlwbGUgYXNzYXlzLCBmaXJzdCBtZXJnZSB3aXRoIHRoaXMuZmlsdGVySGFzaFxuICAgICAgICAgICAgcHJldmlvdXNJZHMgPSAkLm1hcCh0aGlzLmZpbHRlckhhc2ggfHwge30sIChfLCBwcmV2aW91c0lkOiBzdHJpbmcpID0+IHByZXZpb3VzSWQpO1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFkZGVkSWQ6IHN0cmluZyk6IHZvaWQgPT4geyB0aGlzLmZpbHRlckhhc2hbYWRkZWRJZF0gPSBbXTsgfSk7XG4gICAgICAgICAgICBpZHMgPSAkLm1hcCh0aGlzLmZpbHRlckhhc2ggfHwge30sIChfLCBwcmV2aW91c0lkOiBzdHJpbmcpID0+IHByZXZpb3VzSWQpO1xuICAgICAgICAgICAgLy8gc2tpcCBvdmVyIGJ1aWxkaW5nIHVuaXF1ZSB2YWx1ZXMgYW5kIHNvcnRpbmcgd2hlbiBubyBuZXcgSURzIGFkZGVkXG4gICAgICAgICAgICBpZiAoaWRzLmxlbmd0aCA+IHByZXZpb3VzSWRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzKTtcbiAgICAgICAgICAgICAgICBjclNldCA9IFtdO1xuICAgICAgICAgICAgICAgIGNIYXNoID0ge307XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIGEgcmV2ZXJzZWQgaGFzaCBzbyBrZXlzIG1hcCB2YWx1ZXMgYW5kIHZhbHVlcyBtYXAga2V5c1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnVuaXF1ZUluZGV4ZXMsICh2YWx1ZTogc3RyaW5nLCB1bmlxdWVJRDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNIYXNoW3VuaXF1ZUlEXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBjclNldC5wdXNoKHVuaXF1ZUlEKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBBbHBoYWJldGljYWxseSBzb3J0IGFuIGFycmF5IG9mIHRoZSBrZXlzIGFjY29yZGluZyB0byB2YWx1ZXNcbiAgICAgICAgICAgICAgICBjclNldC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfYTpzdHJpbmcgPSBjSGFzaFthXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgX2I6c3RyaW5nID0gY0hhc2hbYl0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIF9hIDwgX2IgPyAtMSA6IF9hID4gX2IgPyAxIDogMDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlcyA9IGNIYXNoO1xuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIgPSBjclNldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSW4gdGhpcyBmdW5jdGlvbiBhcmUgcnVubmluZyB0aHJvdWdoIHRoZSBnaXZlbiBsaXN0IG9mIG1lYXN1cmVtZW50IElEcyBhbmQgZXhhbWluaW5nXG4gICAgICAgIC8vIHRoZWlyIHJlY29yZHMgYW5kIHJlbGF0ZWQgcmVjb3JkcywgbG9jYXRpbmcgdGhlIHBhcnRpY3VsYXIgZmllbGQgd2UgYXJlIGludGVyZXN0ZWQgaW4sXG4gICAgICAgIC8vIGFuZCBjcmVhdGluZyBhIGxpc3Qgb2YgYWxsIHRoZSB1bmlxdWUgdmFsdWVzIGZvciB0aGF0IGZpZWxkLiAgQXMgd2UgZ28sIHdlIG1hcmsgZWFjaFxuICAgICAgICAvLyB1bmlxdWUgdmFsdWUgd2l0aCBhbiBpbnRlZ2VyIFVJRCwgYW5kIGNvbnN0cnVjdCBhIGhhc2ggcmVzb2x2aW5nIGVhY2ggcmVjb3JkIHRvIG9uZSAob3JcbiAgICAgICAgLy8gcG9zc2libHkgbW9yZSkgb2YgdGhvc2UgaW50ZWdlciBVSURzLiAgVGhpcyBwcmVwYXJlcyB1cyBmb3IgcXVpY2sgZmlsdGVyaW5nIGxhdGVyIG9uLlxuICAgICAgICAvLyAoVGhpcyBnZW5lcmljIGZpbHRlciBkb2VzIG5vdGhpbmcsIHNvIHdlIGxlYXZlIHRoZXNlIHN0cnVjdHVyZXMgYmxhbmsuKVxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIElmIHdlIGRpZG4ndCBjb21lIHVwIHdpdGggMiBvciBtb3JlIGNyaXRlcmlhLCB0aGVyZSBpcyBubyBwb2ludCBpbiBkaXNwbGF5aW5nIHRoZSBmaWx0ZXIuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICBpZiAodGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGFkZFRvUGFyZW50KHBhcmVudERpdik6dm9pZCB7XG4gICAgICAgICAgICBwYXJlbnREaXYuYXBwZW5kQ2hpbGQodGhpcy5maWx0ZXJDb2x1bW5EaXYpO1xuICAgICAgICB9XG5cblxuICAgICAgICBkZXRhY2goKTp2b2lkIHtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmRldGFjaCgpO1xuICAgICAgICB9XG5cblxuICAgICAgICBhcHBseUJhY2tncm91bmRTdHlsZShkYXJrZXI6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgICAgICAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KS5yZW1vdmVDbGFzcyhkYXJrZXIgPyAnc3RyaXBlUm93QicgOiAnc3RyaXBlUm93QScpO1xuICAgICAgICAgICAgJCh0aGlzLmZpbHRlckNvbHVtbkRpdikuYWRkQ2xhc3MoZGFya2VyID8gJ3N0cmlwZVJvd0EnIDogJ3N0cmlwZVJvd0InKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUnVucyB0aHJvdWdoIHRoZSB2YWx1ZXMgaW4gdW5pcXVlVmFsdWVzT3JkZXIsIGFkZGluZyBhIGNoZWNrYm94IGFuZCBsYWJlbCBmb3IgZWFjaFxuICAgICAgICAvLyBmaWx0ZXJpbmcgdmFsdWUgcmVwcmVzZW50ZWQuICBJZiB0aGVyZSBhcmUgbW9yZSB0aGFuIDE1IHZhbHVlcywgdGhlIGZpbHRlciBnZXRzXG4gICAgICAgIC8vIGEgc2VhcmNoIGJveCBhbmQgc2Nyb2xsYmFyLlxuICAgICAgICBwb3B1bGF0ZVRhYmxlKCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgZkNvbCA9ICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpO1xuICAgICAgICAgICAgZkNvbC5jaGlsZHJlbigpLmRldGFjaCgpO1xuICAgICAgICAgICAgLy8gT25seSB1c2UgdGhlIHNjcm9sbGluZyBjb250YWluZXIgZGl2IGlmIHRoZSBzaXplIG9mIHRoZSBsaXN0IHdhcnJhbnRzIGl0LCBiZWNhdXNlXG4gICAgICAgICAgICAvLyB0aGUgc2Nyb2xsaW5nIGNvbnRhaW5lciBkaXYgZGVjbGFyZXMgYSBsYXJnZSBwYWRkaW5nIG1hcmdpbiBmb3IgdGhlIHNjcm9sbCBiYXIsXG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBwYWRkaW5nIG1hcmdpbiB3b3VsZCBiZSBhbiBlbXB0eSB3YXN0ZSBvZiBzcGFjZSBvdGhlcndpc2UuXG4gICAgICAgICAgICBpZiAodGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAxNSkge1xuICAgICAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMuc2VhcmNoQm94VGl0bGVEaXYpLmFwcGVuZCh0aGlzLnNjcm9sbFpvbmVEaXYpO1xuICAgICAgICAgICAgICAgIC8vIENoYW5nZSB0aGUgcmVmZXJlbmNlIHNvIHdlJ3JlIGFmZmVjdGluZyB0aGUgaW5uZXJIVE1MIG9mIHRoZSBjb3JyZWN0IGRpdiBsYXRlciBvblxuICAgICAgICAgICAgICAgIGZDb2wgPSAkKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMucGxhaW50ZXh0VGl0bGVEaXYpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5maWx0ZXJpbmdUYWJsZSk7XG5cbiAgICAgICAgICAgIHZhciB0Qm9keSA9IHRoaXMudGFibGVCb2R5RWxlbWVudDtcbiAgICAgICAgICAgIC8vIENsZWFyIG91dCBhbnkgb2xkIHRhYmxlIGNvbnRlbnRzXG4gICAgICAgICAgICAkKHRoaXMudGFibGVCb2R5RWxlbWVudCkuZW1wdHkoKTtcblxuICAgICAgICAgICAgdGhpcy50YWJsZVJvd3MgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlcyA9IHt9O1xuXG4gICAgICAgICAgICB2YXIgZ3JhcGhIZWxwZXIgPSBPYmplY3QuY3JlYXRlKEdyYXBoSGVscGVyTWV0aG9kcyk7XG4gICAgICAgICAgICB2YXIgY29sb3JPYmogPSBncmFwaEhlbHBlci5yZW5kZXJDb2xvcihFREREYXRhLkxpbmVzKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9hZGQgY29sb3Igb2JqIHRvIEVERERhdGEgXG4gICAgICAgICAgICBFREREYXRhWydjb2xvciddID0gY29sb3JPYmo7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIGxpbmUgbGFiZWwgY29sb3IgYmFzZWQgb24gZ3JhcGggY29sb3Igb2YgbGluZSBcbiAgICAgICAgICAgIGlmICh0aGlzLnNlY3Rpb25UaXRsZSA9PT0gXCJMaW5lXCIpIHsgICAgLy8gVE9ETzogRmluZCBhIGJldHRlciB3YXkgdG8gaWRlbnRpZnkgdGhpcyBzZWN0aW9uXG4gICAgICAgICAgICAgICAgdmFyIGNvbG9yczphbnkgPSB7fTtcblxuICAgICAgICAgICAgICAgIC8vY3JlYXRlIG5ldyBjb2xvcnMgb2JqZWN0IHdpdGggbGluZSBuYW1lcyBhIGtleXMgYW5kIGNvbG9yIGhleCBhcyB2YWx1ZXMgXG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIEVERERhdGEuTGluZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JzW0VERERhdGEuTGluZXNba2V5XS5uYW1lXSA9IGNvbG9yT2JqW2tleV1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKCh1bmlxdWVJZDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNib3hOYW1lLCBjZWxsLCBwLCBxLCByO1xuICAgICAgICAgICAgICAgIGNib3hOYW1lID0gWydmaWx0ZXInLCB0aGlzLnNlY3Rpb25TaG9ydExhYmVsLCAnbicsIHVuaXF1ZUlkLCAnY2JveCddLmpvaW4oJycpO1xuICAgICAgICAgICAgICAgIHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXSA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGVCb2R5RWxlbWVudC5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICBjZWxsID0gdGhpcy50YWJsZVJvd3NbdW5pcXVlSWRdLmluc2VydENlbGwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXNbdW5pcXVlSWRdID0gJChcIjxpbnB1dCB0eXBlPSdjaGVja2JveCc+XCIpXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ25hbWUnOiBjYm94TmFtZSwgJ2lkJzogY2JveE5hbWUgfSlcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIEVERERhdGEuTGluZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNba2V5XS5uYW1lID09IHRoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAoRURERGF0YS5MaW5lc1trZXldWydpZGVudGlmaWVyJ10gPSBjYm94TmFtZSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCBjYm94TmFtZSkudGV4dCh0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF0pXG4gICAgICAgICAgICAgICAgICAgIC5jc3MoJ2ZvbnQtd2VpZ2h0JywgJ0JvbGQnKS5hcHBlbmRUbyhjZWxsKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmZvckVhY2goKHVuaXF1ZUlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNib3hOYW1lLCBjZWxsLCBwLCBxLCByO1xuICAgICAgICAgICAgICAgICAgICBjYm94TmFtZSA9IFsnZmlsdGVyJywgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCwgJ24nLCB1bmlxdWVJZCwgJ2Nib3gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWJsZVJvd3NbdW5pcXVlSWRdID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+dGhpcy50YWJsZUJvZHlFbGVtZW50Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgICAgICBjZWxsID0gdGhpcy50YWJsZVJvd3NbdW5pcXVlSWRdLmluc2VydENlbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzW3VuaXF1ZUlkXSA9ICQoXCI8aW5wdXQgdHlwZT0nY2hlY2tib3gnPlwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnbmFtZSc6IGNib3hOYW1lLCAnaWQnOiBjYm94TmFtZSB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgY2JveE5hbWUpLnRleHQodGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVE9ETzogRHJhZyBzZWxlY3QgaXMgdHdpdGNoeSAtIGNsaWNraW5nIGEgdGFibGUgY2VsbCBiYWNrZ3JvdW5kIHNob3VsZCBjaGVjayB0aGUgYm94LFxuICAgICAgICAgICAgLy8gZXZlbiBpZiB0aGUgdXNlciBpc24ndCBoaXR0aW5nIHRoZSBsYWJlbCBvciB0aGUgY2hlY2tib3ggaXRzZWxmLlxuICAgICAgICAgICAgRHJhZ2JveGVzLmluaXRUYWJsZSh0aGlzLmZpbHRlcmluZ1RhYmxlKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmV0dXJucyB0cnVlIGlmIGFueSBvZiB0aGUgY2hlY2tib3hlcyBzaG93IGEgZGlmZmVyZW50IHN0YXRlIHRoYW4gd2hlbiB0aGlzIGZ1bmN0aW9uIHdhc1xuICAgICAgICAvLyBsYXN0IGNhbGxlZFxuICAgICAgICBhbnlDaGVja2JveGVzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOmJvb2xlYW4gPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2hlY2tib3hTdGF0ZTogVW5pcXVlSURUb1ZhbHVlID0ge30sXG4gICAgICAgICAgICAgICAgdjogc3RyaW5nID0gJCh0aGlzLnNlYXJjaEJveCkudmFsKCk7XG4gICAgICAgICAgICB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAkLmVhY2godGhpcy5jaGVja2JveGVzIHx8IHt9LCAodW5pcXVlSWQ6IG51bWJlciwgY2hlY2tib3g6IEpRdWVyeSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50LCBwcmV2aW91cztcbiAgICAgICAgICAgICAgICAvLyBcIkNcIiAtIGNoZWNrZWQsIFwiVVwiIC0gdW5jaGVja2VkLCBcIk5cIiAtIGRvZXNuJ3QgZXhpc3RcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gKGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnKSAmJiAhY2hlY2tib3gucHJvcCgnZGlzYWJsZWQnKSkgPyAnQycgOiAnVSc7XG4gICAgICAgICAgICAgICAgcHJldmlvdXMgPSB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZVt1bmlxdWVJZF0gfHwgJ04nO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ICE9PSBwcmV2aW91cykgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09ICdDJykgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY3VycmVudENoZWNrYm94U3RhdGVbdW5pcXVlSWRdID0gY3VycmVudDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5jbGVhckljb25zLnRvZ2dsZUNsYXNzKCdlbmFibGVkJywgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCk7XG5cbiAgICAgICAgICAgIHYgPSB2LnRyaW0oKTsgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgICAgIHYgPSB2LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB2ID0gdi5yZXBsYWNlKC9cXHNcXHMqLywgJyAnKTsgLy8gUmVwbGFjZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIHdpdGggc2luZ2xlIHNwYWNlc1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uID0gdjtcbiAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzLnByZXZpb3VzU2VhcmNoU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmICghY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmVuJ3QgZGV0ZWN0ZWQgYW55IGNoYW5nZSBzbyBmYXIsIHRoZXJlIGlzIG9uZSBtb3JlIGFuZ2xlIHRvIGNvdmVyOlxuICAgICAgICAgICAgICAgIC8vIENoZWNrYm94ZXMgdGhhdCB1c2VkIHRvIGV4aXN0LCBidXQgaGF2ZSBzaW5jZSBiZWVuIHJlbW92ZWQgZnJvbSB0aGUgc2V0LlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSwgKHJvd0lkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Q2hlY2tib3hTdGF0ZVtyb3dJZF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0gY3VycmVudENoZWNrYm94U3RhdGU7XG4gICAgICAgICAgICByZXR1cm4gY2hhbmdlZDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGFrZXMgYSBzZXQgb2YgcmVjb3JkIElEcywgYW5kIGlmIGFueSBjaGVja2JveGVzIGluIHRoZSBmaWx0ZXIncyBVSSBhcmUgY2hlY2tlZCxcbiAgICAgICAgLy8gdGhlIElEIHNldCBpcyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgICAgICAvLyBDaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBnaXZlbiBJRHMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkXG4gICAgICAgIC8vIGFuZCBzb3J0ZWQgdG8gdGhlIGJvdHRvbSBvZiB0aGUgbGlzdCwgdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdFxuICAgICAgICAvLyBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLlxuICAgICAgICAvLyBUaGUgbmFycm93ZWQgc2V0IG9mIElEcyBpcyB0aGVuIHJldHVybmVkLCBmb3IgdXNlIGJ5IHRoZSBuZXh0IGZpbHRlci5cbiAgICAgICAgYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhpZHM6YW55W10pOmFueSB7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSBmaWx0ZXIgb25seSBjb250YWlucyBvbmUgaXRlbSwgaXQncyBwb2ludGxlc3MgdG8gYXBwbHkgaXQuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpZHM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBpZHNQb3N0RmlsdGVyaW5nOiBhbnlbXTtcblxuICAgICAgICAgICAgdmFyIHVzZVNlYXJjaEJveDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICB2YXIgcXVlcnlTdHJzID0gW107XG5cbiAgICAgICAgICAgIHZhciB2ID0gdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uO1xuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICh2Lmxlbmd0aCA+PSB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSB3b3Jkcywgd2UgbWF0Y2ggZWFjaCBzZXBhcmF0ZWx5LlxuICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIG5vdCBhdHRlbXB0IHRvIG1hdGNoIGFnYWluc3QgZW1wdHkgc3RyaW5ncywgc28gd2UgZmlsdGVyIHRob3NlIG91dCBpZlxuICAgICAgICAgICAgICAgICAgICAvLyBhbnkgc2xpcHBlZCB0aHJvdWdoLlxuICAgICAgICAgICAgICAgICAgICBxdWVyeVN0cnMgPSB2LnNwbGl0KC9cXHMrLykuZmlsdGVyKChvbmUpID0+IHsgcmV0dXJuIG9uZS5sZW5ndGggPiAwOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHVzZXIgbWlnaHQgaGF2ZSBwYXN0ZWQvdHlwZWQgb25seSB3aGl0ZXNwYWNlLCBzbzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1ZXJ5U3Rycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1c2VTZWFyY2hCb3ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZyA9IHt9O1xuXG4gICAgICAgICAgICB2YXIgaW5kZXhJc1Zpc2libGUgPSAoaW5kZXgpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtYXRjaDpib29sZWFuID0gdHJ1ZSwgdGV4dDpzdHJpbmc7XG4gICAgICAgICAgICAgICAgaWYgKHVzZVNlYXJjaEJveCkge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gdGhpcy51bmlxdWVWYWx1ZXNbaW5kZXhdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoID0gcXVlcnlTdHJzLnNvbWUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0ZXh0Lmxlbmd0aCA+PSB2Lmxlbmd0aCAmJiB0ZXh0LmluZGV4T2YodikgPj0gMDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2luZGV4XSA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbaW5kZXhdID09PSAnQycpIHx8ICF0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZHNQb3N0RmlsdGVyaW5nID0gaWRzLmZpbHRlcigoaWQpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGZpbHRlcmluZyBkYXRhIGZvciB0aGlzIGlkLCB1c2UgaXQuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgZG9uJ3QsIHRoZSBpZCBwcm9iYWJseSBiZWxvbmdzIHRvIHNvbWUgb3RoZXIgbWVhc3VyZW1lbnQgY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgLy8gc28gd2UgaWdub3JlIGl0LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpbHRlckhhc2hbaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbHRlckhhc2hbaWRdLnNvbWUoaW5kZXhJc1Zpc2libGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgZG9jdW1lbnQgZnJhZ21lbnQsIGFuZCBhY2N1bXVsYXRlIGluc2lkZSBpdCBhbGwgdGhlIHJvd3Mgd2Ugd2FudCB0byBkaXNwbGF5LCBpbiBzb3J0ZWQgb3JkZXIuXG4gICAgICAgICAgICB2YXIgZnJhZyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblxuICAgICAgICAgICAgdmFyIHJvd3NUb0FwcGVuZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKChjcklEKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94OiBKUXVlcnkgPSB0aGlzLmNoZWNrYm94ZXNbY3JJRF0sXG4gICAgICAgICAgICAgICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCA9IHRoaXMudGFibGVSb3dzW2NySURdLFxuICAgICAgICAgICAgICAgICAgICBzaG93OiBib29sZWFuID0gISF2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2NySURdO1xuICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJywgIXNob3cpXG4gICAgICAgICAgICAgICAgJChyb3cpLnRvZ2dsZUNsYXNzKCdub2RhdGEnLCAhc2hvdyk7XG4gICAgICAgICAgICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgICAgICAgICAgICAgZnJhZy5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBOb3csIGFwcGVuZCBhbGwgdGhlIHJvd3Mgd2UgZGlzYWJsZWQsIHNvIHRoZXkgZ28gdG8gdGhlIGJvdHRvbSBvZiB0aGUgdGFibGVcbiAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5mb3JFYWNoKChyb3cpID0+IGZyYWcuYXBwZW5kQ2hpbGQocm93KSk7XG5cbiAgICAgICAgICAgIC8vIFJlbWVtYmVyIHRoYXQgd2UgbGFzdCBzb3J0ZWQgYnkgdGhpcyBjb2x1bW5cbiAgICAgICAgICAgIHRoaXMudGFibGVCb2R5RWxlbWVudC5hcHBlbmRDaGlsZChmcmFnKTtcblxuICAgICAgICAgICAgcmV0dXJuIGlkc1Bvc3RGaWx0ZXJpbmc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIF9hc3NheUlkVG9Bc3NheShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9MaW5lKGFzc2F5SWQ6c3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKTtcbiAgICAgICAgICAgIGlmIChhc3NheSkgcmV0dXJuIEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgX2Fzc2F5SWRUb1Byb3RvY29sKGFzc2F5SWQ6c3RyaW5nKTogUHJvdG9jb2xSZWNvcmQge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldElkTWFwVG9WYWx1ZXMoKTooaWQ6c3RyaW5nKSA9PiBhbnlbXSB7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4gW107XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBTdHJhaW5GaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnU3RyYWluJywgJ3N0Jyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIHN0cmFpbiBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuc3RyYWluIHx8IFtdKS5mb3JFYWNoKChzdHJhaW5JZDogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbc3RyYWluSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RyYWluICYmIHN0cmFpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0NhcmJvbiBTb3VyY2UnLCAnY3MnKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBjYXJib24gc291cmNlIG5hbWVcbiAgICAgICAgICAgICAgICAobGluZS5jYXJib24gfHwgW10pLmZvckVhY2goKGNhcmJvbklkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3JjID0gRURERGF0YS5DU291cmNlc1tjYXJib25JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzcmMgJiYgc3JjLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdMYWJlbGluZycsICdsJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBsYWJlbGluZyBkZXNjcmlwdGlvblxuICAgICAgICAgICAgICAgIChsaW5lLmNhcmJvbiB8fCBbXSkuZm9yRWFjaCgoY2FyYm9uSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcmMgPSBFREREYXRhLkNTb3VyY2VzW2NhcmJvbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNyYyAmJiBzcmMubGFiZWxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBMaW5lTmFtZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdMaW5lJywgJ2xuJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBQcm90b2NvbEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdQcm90b2NvbCcsICdwJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcm90b2NvbDogUHJvdG9jb2xSZWNvcmQgPSB0aGlzLl9hc3NheUlkVG9Qcm90b2NvbChhc3NheUlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheVN1ZmZpeEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdBc3NheSBTdWZmaXgnLCAnYScpO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgbWV0YURhdGFJRDpzdHJpbmc7XG4gICAgICAgIHByZTpzdHJpbmc7XG4gICAgICAgIHBvc3Q6c3RyaW5nO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG1ldGFEYXRhSUQ6c3RyaW5nKSB7XG4gICAgICAgICAgICBzdXBlcigpO1xuICAgICAgICAgICAgdmFyIE1EVCA9IEVERERhdGEuTWV0YURhdGFUeXBlc1ttZXRhRGF0YUlEXTtcbiAgICAgICAgICAgIHRoaXMubWV0YURhdGFJRCA9IG1ldGFEYXRhSUQ7XG4gICAgICAgICAgICB0aGlzLnByZSA9IE1EVC5wcmUgfHwgJyc7XG4gICAgICAgICAgICB0aGlzLnBvc3QgPSBNRFQucG9zdCB8fCAnJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoRURERGF0YS5NZXRhRGF0YVR5cGVzW3RoaXMubWV0YURhdGFJRF0ubmFtZSwgJ21kJyt0aGlzLm1ldGFEYXRhSUQpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge30sIHZhbHVlID0gJyhFbXB0eSknO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5tZXRhICYmIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgbGluZS5tZXRhW3RoaXMubWV0YURhdGFJRF0sIHRoaXMucG9zdCBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpIHx8IHt9LCB2YWx1ZSA9ICcoRW1wdHkpJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm1ldGEgJiYgYXNzYXkubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgYXNzYXkubWV0YVt0aGlzLm1ldGFEYXRhSURdLCB0aGlzLnBvc3QgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0NvbXBhcnRtZW50JywgJ2NvbScpO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCB2YWx1ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZUNvbXBhcnRtZW50c1ttZWFzdXJlLmNvbXBhcnRtZW50XSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgdmFsdWUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6IGJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ01lYXN1cmVtZW50JywgJ21tJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKG1JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBtSWRzLmZvckVhY2goKG1lYXN1cmVJZDogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fTtcbiAgICAgICAgICAgICAgICB2YXIgbVR5cGU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBtVHlwZSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobVR5cGUgJiYgbVR5cGUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6Ym9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdNZXRhYm9saXRlJywgJ21lJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBtZXRhYm9saXRlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZSA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXRhYm9saXRlICYmIG1ldGFib2xpdGUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgUHJvdGVpbkZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzpib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ1Byb3RlaW4nLCAncHInKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gT3ZlcnJpZGU6IElmIHRoZSBmaWx0ZXIgaGFzIGEgbG9hZCBwZW5kaW5nLCBpdCdzIFwidXNlZnVsXCIsIGkuZS4gZGlzcGxheSBpdC5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgcHJvdGVpbjogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3RlaW4gPSBFREREYXRhLlByb3RlaW5UeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvdGVpbiAmJiBwcm90ZWluLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgbG9hZFBlbmRpbmc6Ym9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdHZW5lJywgJ2duJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIGdlbmU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBnZW5lID0gRURERGF0YS5HZW5lVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdlbmUgJiYgZ2VuZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZSBwYWdlIGxvYWRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlSXQoKSB7XG5cbiAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QgPSBudWxsO1xuXG4gICAgICAgIHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQgPSBuZXcgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YSA9IG51bGw7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5tYWluR3JhcGhSZWZyZXNoVGltZXJJRCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5hdHRhY2htZW50SURzID0gbnVsbDtcbiAgICAgICAgdGhpcy5hdHRhY2htZW50c0J5SUQgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50ID0gbnVsbDtcblxuICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gLTE7XG4gICAgICAgIHRoaXMubWV0YWJvbGljTWFwTmFtZSA9IG51bGw7XG4gICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gLTE7XG5cbiAgICAgICAgdGhpcy5jU291cmNlRW50cmllcyA9IFtdO1xuICAgICAgICB0aGlzLm1UeXBlRW50cmllcyA9IFtdO1xuXG4gICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgICAgIHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRTcGVjcyA9IHt9O1xuICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkcyA9IHt9O1xuXG4gICAgICAgIC8vIHB1dCB0aGUgY2xpY2sgaGFuZGxlciBhdCB0aGUgZG9jdW1lbnQgbGV2ZWwsIHRoZW4gZmlsdGVyIHRvIGFueSBsaW5rIGluc2lkZSBhIC5kaXNjbG9zZVxuICAgICAgICAkKGRvY3VtZW50KS5vbignY2xpY2snLCAnLmRpc2Nsb3NlIC5kaXNjbG9zZUxpbmsnLCAoZSkgPT4ge1xuICAgICAgICAgICAgJChlLnRhcmdldCkuY2xvc2VzdCgnLmRpc2Nsb3NlJykudG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgJ3VybCc6ICdlZGRkYXRhLycsXG4gICAgICAgICAgICAndHlwZSc6ICdHRVQnLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydMb2FkaW5nIEVERERhdGEgZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZV0uam9pbignJykpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdzdWNjZXNzJzogKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBFREREYXRhID0gJC5leHRlbmQoRURERGF0YSB8fCB7fSwgZGF0YSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5wcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIGEgdGFibGUgc3BlY2lmaWNhdGlvbiBmb3IgdGhlIExpbmVzIHRhYmxlXG4gICAgICAgICAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNMaW5lcygpO1xuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMuaW5pdCgpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIHRoZSB0YWJsZSBpdHNlbGYgd2l0aCB0aGUgc3BlY1xuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZCA9IG5ldyBEYXRhR3JpZCh0aGlzLmxpbmVzRGF0YUdyaWRTcGVjKTtcbiAgICAgICAgICAgICAgICAvLyBGaW5kIG91dCB3aGljaCBwcm90b2NvbHMgaGF2ZSBhc3NheXMgd2l0aCBtZWFzdXJlbWVudHMgLSBkaXNhYmxlZCBvciBub1xuICAgICAgICAgICAgICAgIHZhciBwcm90b2NvbHNXaXRoTWVhc3VyZW1lbnRzOmFueSA9IHt9O1xuICAgICAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQsIGFzc2F5KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIHByb3RvY29sc1dpdGhNZWFzdXJlbWVudHNbYXNzYXkucGlkXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gRm9yIGVhY2ggcHJvdG9jb2wgd2l0aCBtZWFzdXJlbWVudHMsIGNyZWF0ZSBhIERhdGFHcmlkQXNzYXlzIG9iamVjdC5cbiAgICAgICAgICAgICAgICAkLmVhY2goRURERGF0YS5Qcm90b2NvbHMsIChpZCwgcHJvdG9jb2wpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNwZWM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm90b2NvbHNXaXRoTWVhc3VyZW1lbnRzW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZFNwZWNzW2lkXSA9IHNwZWMgPSBuZXcgRGF0YUdyaWRTcGVjQXNzYXlzKHByb3RvY29sLmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwZWMuaW5pdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZHNbaWRdID0gbmV3IERhdGFHcmlkQXNzYXlzKHNwZWMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoJ2Zvcm0ubGluZS1lZGl0Jykub24oJ2NoYW5nZScsICcubGluZS1tZXRhID4gOmlucHV0JywgKGV2KSA9PiB7XG4gICAgICAgICAgICAvLyB3YXRjaCBmb3IgY2hhbmdlcyB0byBtZXRhZGF0YSB2YWx1ZXMsIGFuZCBzZXJpYWxpemUgdG8gdGhlIG1ldGFfc3RvcmUgZmllbGRcbiAgICAgICAgICAgIHZhciBmb3JtID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJ2Zvcm0nKSxcbiAgICAgICAgICAgICAgICBtZXRhSW4gPSBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKSxcbiAgICAgICAgICAgICAgICBtZXRhID0gSlNPTi5wYXJzZShtZXRhSW4udmFsKCkgfHwgJ3t9Jyk7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5saW5lLW1ldGEgPiA6aW5wdXQnKS5lYWNoKChpLCBpbnB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSAkKGlucHV0KS5hdHRyKCdpZCcpLm1hdGNoKC8tKFxcZCspJC8pWzFdO1xuICAgICAgICAgICAgICAgIG1ldGFba2V5XSA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5saW5lLW1ldGEtYWRkJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIG1ha2UgbWV0YWRhdGEgQWRkIFZhbHVlIGJ1dHRvbiB3b3JrIGFuZCBub3Qgc3VibWl0IHRoZSBmb3JtXG4gICAgICAgICAgICB2YXIgYWRkcm93ID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5saW5lLWVkaXQtbWV0YScpLCB0eXBlLCB2YWx1ZTtcbiAgICAgICAgICAgIHR5cGUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS10eXBlJykudmFsKCk7XG4gICAgICAgICAgICB2YWx1ZSA9IGFkZHJvdy5maW5kKCcubGluZS1tZXRhLXZhbHVlJykudmFsKCk7XG4gICAgICAgICAgICAvLyBjbGVhciBvdXQgaW5wdXRzIHNvIGFub3RoZXIgdmFsdWUgY2FuIGJlIGVudGVyZWRcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6aW5wdXQnKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6Y2hlY2tib3gsIDpyYWRpbycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5NZXRhRGF0YVR5cGVzW3R5cGVdKSB7XG4gICAgICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KGFkZHJvdywgdHlwZSwgdmFsdWUpLmZpbmQoJzppbnB1dCcpLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnLm1ldGEtcmVtb3ZlJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIHJlbW92ZSBtZXRhZGF0YSByb3cgYW5kIGluc2VydCBudWxsIHZhbHVlIGZvciB0aGUgbWV0YWRhdGEga2V5XG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YVJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1tZXRhJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpLFxuICAgICAgICAgICAgICAgIGtleSA9IG1ldGFSb3cuYXR0cignaWQnKS5tYXRjaCgvLShcXGQrKSQvKVsxXTtcbiAgICAgICAgICAgIG1ldGFba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgICAgIG1ldGFSb3cucmVtb3ZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKHdpbmRvdykub24oJ2xvYWQnLCBwcmVwYXJlUGVybWlzc2lvbnMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByZXBhcmVQZXJtaXNzaW9ucygpIHtcbiAgICAgICAgdmFyIHVzZXI6IEpRdWVyeSwgZ3JvdXA6IEpRdWVyeTtcbiAgICAgICAgLy8gVE9ETyB0aGUgRE9NIHRyYXZlcnNpbmcgYW5kIGZpbHRlcmluZyBoZXJlIGlzIHZlcnkgaGFja3ksIGRvIGl0IGJldHRlciBsYXRlclxuICAgICAgICB1c2VyID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZSgkKCcjcGVybWlzc2lvbl91c2VyX2JveCcpKTtcbiAgICAgICAgZ3JvdXAgPSBFRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlKCQoJyNwZXJtaXNzaW9uX2dyb3VwX2JveCcpKTtcbiAgICAgICAgRUREX2F1dG8uc2V0dXBfZmllbGRfYXV0b2NvbXBsZXRlKHVzZXIsICdVc2VyJyk7XG4gICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShncm91cCwgJ0dyb3VwJyk7XG4gICAgICAgICQoJ2Zvcm0ucGVybWlzc2lvbnMnKVxuICAgICAgICAgICAgLm9uKCdjaGFuZ2UnLCAnOnJhZGlvJywgKGV2OkpRdWVyeUlucHV0RXZlbnRPYmplY3QpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByYWRpbzogSlF1ZXJ5ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgICQoJy5wZXJtaXNzaW9ucycpLmZpbmQoJzpyYWRpbycpLmVhY2goKGk6IG51bWJlciwgcjogRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAkKHIpLmNsb3Nlc3QoJ3NwYW4nKS5maW5kKCcuYXV0b2NvbXAnKS5wcm9wKCdkaXNhYmxlZCcsICEkKHIpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHJhZGlvLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgICAgICByYWRpby5jbG9zZXN0KCdzcGFuJykuZmluZCgnLmF1dG9jb21wOnZpc2libGUnKS5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ3N1Ym1pdCcsIChldjpKUXVlcnlFdmVudE9iamVjdCk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwZXJtOiBhbnkgPSB7fSwga2xhc3M6IHN0cmluZywgYXV0bzogSlF1ZXJ5O1xuICAgICAgICAgICAgICAgIGF1dG8gPSAkKCdmb3JtLnBlcm1pc3Npb25zJykuZmluZCgnW25hbWU9Y2xhc3NdOmNoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICBrbGFzcyA9IGF1dG8udmFsKCk7XG4gICAgICAgICAgICAgICAgcGVybS50eXBlID0gJCgnZm9ybS5wZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPXR5cGVdJykudmFsKCk7XG4gICAgICAgICAgICAgICAgcGVybVtrbGFzcy50b0xvd2VyQ2FzZSgpXSA9IHsgJ2lkJzogYXV0by5jbG9zZXN0KCdzcGFuJykuZmluZCgnaW5wdXQ6aGlkZGVuJykudmFsKCkgfTtcbiAgICAgICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgICAgICAndXJsJzogJ3Blcm1pc3Npb25zLycsXG4gICAgICAgICAgICAgICAgICAgICd0eXBlJzogJ1BPU1QnLFxuICAgICAgICAgICAgICAgICAgICAnZGF0YSc6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICdkYXRhJzogSlNPTi5zdHJpbmdpZnkoW3Blcm1dKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdjc3JmbWlkZGxld2FyZXRva2VuJzogJCgnZm9ybS5wZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPWNzcmZtaWRkbGV3YXJldG9rZW5dJykudmFsKClcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ1NldCBwZXJtaXNzaW9uOiAnLCBKU09OLnN0cmluZ2lmeShwZXJtKV0uam9pbignJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgJCgnPGRpdj4nKS50ZXh0KCdTZXQgUGVybWlzc2lvbicpLmFkZENsYXNzKCdzdWNjZXNzJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oJCgnZm9ybS5wZXJtaXNzaW9ucycpKS5kZWxheSg1MDAwKS5mYWRlT3V0KDIwMDApO1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAnZXJyb3InOiAoeGhyLCBzdGF0dXMsIGVycik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydTZXR0aW5nIHBlcm1pc3Npb24gZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZXJyXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQoJ1NlcnZlciBFcnJvcjogJyArIGVycikuYWRkQ2xhc3MoJ2JhZCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKCQoJ2Zvcm0ucGVybWlzc2lvbnMnKSkuZGVsYXkoNTAwMCkuZmFkZU91dCgyMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuZmluZCgnOnJhZGlvJykudHJpZ2dlcignY2hhbmdlJykuZW5kKClcbiAgICAgICAgICAgIC5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCkge1xuICAgICAgICAvLyBQcmVwYXJlIHRoZSBjYXJib24gYmFsYW5jZSBncmFwaFxuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhID0gbmV3IENhcmJvbkJhbGFuY2UuRGlzcGxheSgpO1xuICAgICAgICB2YXIgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IGZhbHNlO1xuICAgICAgICBpZiAoIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID4gLTEgKSB7XG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNhbGN1bGF0ZUNhcmJvbkJhbGFuY2VzKHRoaXMubWV0YWJvbGljTWFwSUQsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgXCJTaG93IENhcmJvbiBCYWxhbmNlXCIgY2hlY2tib3ggaW4gcmVkIGlmIHRoZXJlIGFyZSBDQiBpc3N1ZXMuXG4gICAgICAgICAgICBpZiAodGhpcy5jYXJib25CYWxhbmNlRGF0YS5nZXROdW1iZXJPZkltYmFsYW5jZXMoKSA+IDApIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgY2FyYm9uIGJhbGFuY2UgaW4gcmVkIHRvIGluZGljYXRlIHRoYXQgd2UgY2FuJ3QgY2FsY3VsYXRlXG4gICAgICAgICAgICAvLyBjYXJib24gYmFsYW5jZXMgeWV0LiBXaGVuIHRoZXkgY2xpY2sgdGhlIGNoZWNrYm94LCB3ZSdsbCBnZXQgdGhlbSB0b1xuICAgICAgICAgICAgLy8gc3BlY2lmeSB3aGljaCBTQk1MIGZpbGUgdG8gdXNlIGZvciBiaW9tYXNzLlxuICAgICAgICAgICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYy5oaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZmlsdGVyVGFibGVLZXlEb3duKGUpIHtcbiAgICAgICAgc3dpdGNoIChlLmtleUNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgMzg6IC8vIHVwXG4gICAgICAgICAgICBjYXNlIDQwOiAvLyBkb3duXG4gICAgICAgICAgICBjYXNlIDk6ICAvLyB0YWJcbiAgICAgICAgICAgIGNhc2UgMTM6IC8vIHJldHVyblxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8gaWdub3JlIGlmIHRoZSBmb2xsb3dpbmcga2V5cyBhcmUgcHJlc3NlZDogW3NoaWZ0XSBbY2Fwc2xvY2tdXG4gICAgICAgICAgICAgICAgaWYgKGUua2V5Q29kZSA+IDggJiYgZS5rZXlDb2RlIDwgMzIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXVlTWFpbkdyYXBoUmVtYWtlKGZhbHNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIGJ5IERhdGFHcmlkIGFmdGVyIHRoZSBMaW5lcyB0YWJsZSBpcyByZW5kZXJlZFxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCkge1xuICAgICAgICB2YXIgY3NJRHM7XG4gICAgICAgIHZhciBvcHRzID0ge1xuICAgICAgICAgIGxpbmVzOiA5LCAvLyBudW1iZXIgb2YgbGluZXMgb24gdGhlIHNwaW5uZXJcbiAgICAgICAgICBsZW5ndGg6IDksXG4gICAgICAgICAgd2lkdGg6IDUsXG4gICAgICAgICAgcmFkaXVzOiAxNCwgLy8gcmFkaXVzIG9mIGlubmVyIGNpcmNsZVxuICAgICAgICAgIGNvbG9yOiAnIzE4NzVBNicsIC8vIGNvbG9yIG9mIHNwaW5uZXIgIChibHVlKVxuICAgICAgICAgIHNwZWVkOiAxLjksIC8vIFJvdW5kcyBwZXIgc2Vjb25kXG4gICAgICAgICAgdHJhaWw6IDQwLCAvLyBBZnRlcmdsb3cgcGVyY2VudGFnZVxuICAgICAgICAgIGNsYXNzTmFtZTogJ3NwaW5uZXInLFxuICAgICAgICAgIHpJbmRleDogMmU5LFxuICAgICAgICAgIHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuICAgICAgICAgIHRvcDogJzcwJScsXG4gICAgICAgICAgbGVmdDogJzUwJSdcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBQcmVwYXJlIHRoZSBtYWluIGRhdGEgb3ZlcnZpZXcgZ3JhcGggYXQgdGhlIHRvcCBvZiB0aGUgcGFnZVxuICAgICAgICBpZiAodGhpcy5tYWluR3JhcGhPYmplY3QgPT09IG51bGwgJiYgJCgnI21haW5ncmFwaCcpLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QgPSBPYmplY3QuY3JlYXRlKFN0dWR5REdyYXBoaW5nKTtcbiAgICAgICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0LlNldHVwKCdtYWluZ3JhcGgnKTtcbiAgICAgICAgICAgIC8vbG9hZCBzcGlubmVyXG4gICAgICAgICAgICB0aGlzLnNwaW5uZXIgPSBuZXcgU3Bpbm5lcihvcHRzKS5zcGluKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3ZlcnZpZXdTZWN0aW9uXCIpKTtcbiAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQubWFpbkdyYXBoT2JqZWN0ID0gdGhpcy5tYWluR3JhcGhPYmplY3Q7XG4gICAgICAgIH1cblxuICAgICAgICAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5vbignbW91c2VvdmVyIG1vdXNlZG93biBtb3VzZXVwJywgdGhpcy5xdWV1ZU1haW5HcmFwaFJlbWFrZS5iaW5kKHRoaXMsIGZhbHNlKSlcbiAgICAgICAgICAgICAgICAub24oJ2tleWRvd24nLCBmaWx0ZXJUYWJsZUtleURvd24uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy8gRW5hYmxlIGVkaXQgbGluZXMgYnV0dG9uXG4gICAgICAgICQoJyNlZGl0TGluZUJ1dHRvbicpLm9uKCdjbGljaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBidXR0b24gPSAkKGV2LnRhcmdldCksIGRhdGEgPSBidXR0b24uZGF0YSgpLCBmb3JtID0gY2xlYXJMaW5lRm9ybSgpLFxuICAgICAgICAgICAgICAgIGFsbE1ldGEgPSB7fSwgbWV0YVJvdztcbiAgICAgICAgICAgIGlmIChkYXRhLmlkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICBmaWxsTGluZUZvcm0oZm9ybSwgRURERGF0YS5MaW5lc1tkYXRhLmlkc1swXV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb21wdXRlIHVzZWQgbWV0YWRhdGEgZmllbGRzIG9uIGFsbCBkYXRhLmlkcywgaW5zZXJ0IG1ldGFkYXRhIHJvd3M/XG4gICAgICAgICAgICAgICAgZGF0YS5pZHMubWFwKChpZDpudW1iZXIpID0+IEVERERhdGEuTGluZXNbaWRdIHx8IHt9KS5mb3JFYWNoKChsaW5lOkxpbmVSZWNvcmQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJC5leHRlbmQoYWxsTWV0YSwgbGluZS5tZXRhIHx8IHt9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBtZXRhUm93ID0gZm9ybS5maW5kKCcubGluZS1lZGl0LW1ldGEnKTtcbiAgICAgICAgICAgICAgICAvLyBSdW4gdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBvZiBtZXRhZGF0YSwgYW5kIGFkZCBhIGZvcm0gZWxlbWVudCBlbnRyeSBmb3IgZWFjaFxuICAgICAgICAgICAgICAgICQuZWFjaChhbGxNZXRhLCAoa2V5KSA9PiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCAnJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlVUlMaW5lRm9ybShmb3JtLCBkYXRhLmNvdW50ID4gMSk7XG4gICAgICAgICAgICBzY3JvbGxUb0Zvcm0oZm9ybSk7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtaWRzXScpLnZhbChkYXRhLmlkcy5qb2luKCcsJykpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYWNreSBidXR0b24gZm9yIGNoYW5naW5nIHRoZSBtZXRhYm9saWMgbWFwXG4gICAgICAgICQoXCIjbWV0YWJvbGljTWFwTmFtZVwiKS5jbGljayggKCkgPT4gdGhpcy5vbkNsaWNrZWRNZXRhYm9saWNNYXBOYW1lKCkgKTtcbiAgICAgICAgLy9wdWxsaW5nIGluIHByb3RvY29sIG1lYXN1cmVtZW50cyBBc3NheU1lYXN1cmVtZW50c1xuICAgICAgICAkLmVhY2goRURERGF0YS5Qcm90b2NvbHMsIChpZCwgcHJvdG9jb2wpID0+IHtcbiAgICAgICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAgICAgdXJsOiAnbWVhc3VyZW1lbnRzLycgKyBpZCArICcvJyxcbiAgICAgICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgICAgIGVycm9yOiAoeGhyLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBmZXRjaCBtZWFzdXJlbWVudCBkYXRhIG9uICcgKyBwcm90b2NvbC5uYW1lICsgJyEnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHByb2Nlc3NNZWFzdXJlbWVudERhdGEuYmluZCh0aGlzLCBwcm90b2NvbClcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmVxdWVzdEFzc2F5RGF0YShhc3NheSkge1xuICAgICAgICB2YXIgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgdXJsOiBbJ21lYXN1cmVtZW50cycsIGFzc2F5LnBpZCwgYXNzYXkuaWQsICcnXS5qb2luKCcvJyksXG4gICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBmZXRjaCBtZWFzdXJlbWVudCBkYXRhIG9uICcgKyBhc3NheS5uYW1lICsgJyEnKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzdGF0dXMpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHByb2Nlc3NNZWFzdXJlbWVudERhdGEuYmluZCh0aGlzLCBwcm90b2NvbClcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKHByb3RvY29sLCBkYXRhKSB7XG4gICAgICAgIHZhciBhc3NheVNlZW4gPSB7fSxcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheSA9IHt9LFxuICAgICAgICAgICAgY291bnRfdG90YWw6bnVtYmVyID0gMCxcbiAgICAgICAgICAgIGNvdW50X3JlYzpudW1iZXIgPSAwO1xuICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fTtcblxuICAgICAgICBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgPSAkLmV4dGVuZChFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgfHwge30sIGRhdGEudHlwZXMpO1xuICAgICAgICAvLyBhdHRhY2ggbWVhc3VyZW1lbnQgY291bnRzIHRvIGVhY2ggYXNzYXlcbiAgICAgICAgJC5lYWNoKGRhdGEudG90YWxfbWVhc3VyZXMsIChhc3NheUlkOnN0cmluZywgY291bnQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIC8vIGF0dGFjaCB2YWx1ZXNcbiAgICAgICAgICAgICQuZXh0ZW5kKG1lYXN1cmVtZW50LCB7ICd2YWx1ZXMnOiBkYXRhLmRhdGFbbWVhc3VyZW1lbnQuaWRdIHx8IFtdIH0pXG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50LmlkXSA9IG1lYXN1cmVtZW50O1xuICAgICAgICAgICAgLy8gdHJhY2sgd2hpY2ggYXNzYXlzIHJlY2VpdmVkIHVwZGF0ZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBhc3NheVNlZW5bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdID0gcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXVthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgLy8gaGFuZGxlIG1lYXN1cmVtZW50IGRhdGEgYmFzZWQgb24gdHlwZVxuICAgICAgICAgICAgbXR5cGUgPSBkYXRhLnR5cGVzW21lYXN1cmVtZW50LnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgKGFzc2F5Lm1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAoYXNzYXkubWV0YWJvbGl0ZXMgPSBhc3NheS5tZXRhYm9saXRlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAoYXNzYXkucHJvdGVpbnMgPSBhc3NheS5wcm90ZWlucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ2cnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIGdlbmUgLyB0cmFuc2NyaXB0XG4gICAgICAgICAgICAgICAgKGFzc2F5LnRyYW5zY3JpcHRpb25zID0gYXNzYXkudHJhbnNjcmlwdGlvbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAoYXNzYXkuZ2VuZXJhbCA9IGFzc2F5LmdlbmVyYWwgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhkYXRhLm1lYXN1cmVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICBpZiAoY291bnRfcmVjIDwgY291bnRfdG90YWwpIHtcbiAgICAgICAgICAgIC8vIFRPRE8gbm90IGFsbCBtZWFzdXJlbWVudHMgZG93bmxvYWRlZDsgZGlzcGxheSBhIG1lc3NhZ2UgaW5kaWNhdGluZyB0aGlzXG4gICAgICAgICAgICAvLyBleHBsYWluIGRvd25sb2FkaW5nIGluZGl2aWR1YWwgYXNzYXkgbWVhc3VyZW1lbnRzIHRvb1xuICAgICAgICB9XG4gICAgICAgIC8vIGludmFsaWRhdGUgYXNzYXlzIG9uIGFsbCBEYXRhR3JpZHM7IHJlZHJhd3MgdGhlIGFmZmVjdGVkIHJvd3NcbiAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlzRGF0YUdyaWRzLCAocHJvdG9jb2xJZCwgZGF0YUdyaWQpID0+IHtcbiAgICAgICAgICAgIGRhdGFHcmlkLmludmFsaWRhdGVBc3NheVJlY29yZHMoT2JqZWN0LmtleXMocHJvdG9jb2xUb0Fzc2F5W3Byb3RvY29sSWRdIHx8IHt9KSk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodHJ1ZSk7XG4gICAgICAgIHRoaXMucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCk7XG4gICAgICAgIHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UoZmFsc2UpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGNhcmJvbkJhbGFuY2VDb2x1bW5SZXZlYWxlZENhbGxiYWNrKHNwZWM6RGF0YUdyaWRTcGVjTGluZXMsXG4gICAgICAgICAgICBkYXRhR3JpZE9iajpEYXRhR3JpZCkge1xuICAgICAgICBTdHVkeUQucmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKTtcbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHNob3dzIHRoZSBhY3Rpb25zIHBhbmVsLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZUxpbmVzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICBpZiAodGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQgKHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gc2V0VGltZW91dChsaW5lc0FjdGlvblBhbmVsU2hvdy5iaW5kKHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gbGluZXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgbGluZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICB2YXIgY2hlY2tlZEJveGVzID0gW10sIGNoZWNrZWRMZW4sIGxpbmVzQWN0aW9uUGFuZWw7XG4gICAgICAgIGlmICh0aGlzLmxpbmVzRGF0YUdyaWQpIHtcbiAgICAgICAgICAgIGNoZWNrZWRCb3hlcyA9IHRoaXMubGluZXNEYXRhR3JpZC5nZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTtcbiAgICAgICAgfVxuICAgICAgICBjaGVja2VkTGVuID0gY2hlY2tlZEJveGVzLmxlbmd0aDtcbiAgICAgICAgbGluZXNBY3Rpb25QYW5lbCA9ICQoJyNsaW5lc0FjdGlvblBhbmVsJykudG9nZ2xlQ2xhc3MoJ29mZicsICFjaGVja2VkTGVuKTtcbiAgICAgICAgJCgnI2xpbmVzU2VsZWN0ZWRDZWxsJykuZW1wdHkoKS50ZXh0KGNoZWNrZWRMZW4gKyAnIHNlbGVjdGVkJyk7XG4gICAgICAgIC8vIGVuYWJsZSBzaW5ndWxhci9wbHVyYWwgY2hhbmdlc1xuICAgICAgICAkKCcjY2xvbmVMaW5lQnV0dG9uJykudGV4dCgnQ2xvbmUgTGluZScgKyAoY2hlY2tlZExlbiA+IDEgPyAncycgOiAnJykpO1xuICAgICAgICAkKCcjZWRpdExpbmVCdXR0b24nKS50ZXh0KCdFZGl0IExpbmUnICsgKGNoZWNrZWRMZW4gPiAxID8gJ3MnIDogJycpKS5kYXRhKHtcbiAgICAgICAgICAgICdjb3VudCc6IGNoZWNrZWRMZW4sXG4gICAgICAgICAgICAnaWRzJzogY2hlY2tlZEJveGVzLm1hcCgoYm94OkhUTUxJbnB1dEVsZW1lbnQpID0+IGJveC52YWx1ZSlcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNncm91cExpbmVCdXR0b24nKS50b2dnbGVDbGFzcygnb2ZmJywgY2hlY2tlZExlbiA8IDIpO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlQXNzYXlzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICAgICAgLy8gVGhpcyB3YXkgd2UncmUgbm90IGJvdGhlcmluZyB0aGUgdXNlciB3aXRoIHRoZSBsb25nIHJlZHJhdyBwcm9jZXNzIHdoZW5cbiAgICAgICAgLy8gdGhleSBhcmUgbWFraW5nIGZhc3QgZWRpdHMuXG4gICAgICAgIGlmICh0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoYXNzYXlzQWN0aW9uUGFuZWxTaG93LmJpbmQodGhpcyksIDE1MCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBhc3NheXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgICAgICB2YXIgY2hlY2tlZEJveGVzID0gW10sIGNoZWNrZWRBc3NheXMsIGNoZWNrZWRNZWFzdXJlLCBwYW5lbCwgaW5mb2JveDtcbiAgICAgICAgcGFuZWwgPSAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKTtcbiAgICAgICAgaWYgKCFwYW5lbC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBGaWd1cmUgb3V0IGhvdyBtYW55IGFzc2F5cy9jaGVja2JveGVzIGFyZSBzZWxlY3RlZC5cbiAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlzRGF0YUdyaWRzLCAocElELCBkYXRhR3JpZCkgPT4ge1xuICAgICAgICAgICAgY2hlY2tlZEJveGVzID0gY2hlY2tlZEJveGVzLmNvbmNhdChkYXRhR3JpZC5nZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKSk7XG4gICAgICAgIH0pO1xuICAgICAgICBjaGVja2VkQXNzYXlzID0gJChjaGVja2VkQm94ZXMpLmZpbHRlcignW2lkXj1hc3NheV0nKS5sZW5ndGg7XG4gICAgICAgIGNoZWNrZWRNZWFzdXJlID0gJChjaGVja2VkQm94ZXMpLmZpbHRlcignOm5vdChbaWRePWFzc2F5XSknKS5sZW5ndGg7XG4gICAgICAgIHBhbmVsLnRvZ2dsZUNsYXNzKCdvZmYnLCAhY2hlY2tlZEFzc2F5cyAmJiAhY2hlY2tlZE1lYXN1cmUpO1xuICAgICAgICBpZiAoY2hlY2tlZEFzc2F5cyB8fCBjaGVja2VkTWVhc3VyZSkge1xuICAgICAgICAgICAgaW5mb2JveCA9ICQoJyNhc3NheXNTZWxlY3RlZENlbGwnKS5lbXB0eSgpO1xuICAgICAgICAgICAgaWYgKGNoZWNrZWRBc3NheXMpIHtcbiAgICAgICAgICAgICAgICAkKFwiPHA+XCIpLmFwcGVuZFRvKGluZm9ib3gpLnRleHQoKGNoZWNrZWRBc3NheXMgPiAxKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAoY2hlY2tlZEFzc2F5cyArIFwiIEFzc2F5cyBzZWxlY3RlZFwiKSA6IFwiMSBBc3NheSBzZWxlY3RlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjaGVja2VkTWVhc3VyZSkge1xuICAgICAgICAgICAgICAgICQoXCI8cD5cIikuYXBwZW5kVG8oaW5mb2JveCkudGV4dCgoY2hlY2tlZE1lYXN1cmUgPiAxKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAoY2hlY2tlZE1lYXN1cmUgKyBcIiBNZWFzdXJlbWVudHMgc2VsZWN0ZWRcIikgOiBcIjEgTWVhc3VyZW1lbnQgc2VsZWN0ZWRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgYSBncmFwaC4gVGhpcyB3YXkgd2UncmUgbm90XG4gICAgLy8gYm90aGVyaW5nIHRoZSB1c2VyIHdpdGggdGhlIGxvbmcgcmVkcmF3IHByb2Nlc3Mgd2hlbiB0aGV5IGFyZSBtYWtpbmcgZmFzdCBlZGl0cy5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVNYWluR3JhcGhSZW1ha2UoZm9yY2U/OmJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dChyZW1ha2VNYWluR3JhcGhBcmVhLmJpbmQodGhpcywgZm9yY2UpLCAyMDApO1xuICAgIH1cblxuICAgIHZhciByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPSAwO1xuXG4gICAgZnVuY3Rpb24gcmVtYWtlTWFpbkdyYXBoQXJlYShmb3JjZT86Ym9vbGVhbikge1xuICAgICAgICAvL3N0b3Agc3Bpbm5lci5cbiAgICAgICAgdGhpcy5zcGlubmVyLnN0b3AoKTtcbiAgICAgICAgXG4gICAgICAgIHZhciBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzOmFueVtdLFxuICAgICAgICAgICAgZGF0YVBvaW50c0Rpc3BsYXllZCA9IDAsXG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgPSAwLFxuICAgICAgICAgICAgY29sb3JPYmo7XG5cbiAgICAgICAgaWYgKCF0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmNoZWNrUmVkcmF3UmVxdWlyZWQoZm9yY2UpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvL3JlbW92ZSBTVkcuXG4gICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0LmNsZWFyQWxsU2V0cygpO1xuICAgICAgICB0aGlzLmdyYXBoSGVscGVyID0gT2JqZWN0LmNyZWF0ZShHcmFwaEhlbHBlck1ldGhvZHMpO1xuICAgICAgICBjb2xvck9iaiA9IEVERERhdGFbJ2NvbG9yJ107XG4gICAgICAgIC8vR2l2ZXMgaWRzIG9mIGxpbmVzIHRvIHNob3cuXG4gICAgICAgIHZhciBkYXRhU2V0cyA9IFtdLCBwcmV2O1xuICAgICAgICBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzID0gdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk7XG4gICAgICAgICQuZWFjaChwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzLCAoaSwgbWVhc3VyZW1lbnRJZCkgPT4ge1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElkXSxcbiAgICAgICAgICAgICAgICBwb2ludHMgPSAobWVhc3VyZS52YWx1ZXMgPyBtZWFzdXJlLnZhbHVlcy5sZW5ndGggOiAwKSxcbiAgICAgICAgICAgICAgICBhc3NheSwgbGluZSwgbmFtZSwgc2luZ2xlQXNzYXlPYmosIGNvbG9yLCBwcm90b2NvbCwgbGluZU5hbWUsIGRhdGFPYmo7XG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgKz0gcG9pbnRzO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50c0Rpc3BsYXllZCA+IDE1MDAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoZSByZXN0IGlmIHdlJ3ZlIGhpdCBvdXIgbGltaXRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGF0YVBvaW50c0Rpc3BsYXllZCArPSBwb2ludHM7XG4gICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldIHx8IHt9O1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSB8fCB7fTtcbiAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXSB8fCB7fTtcbiAgICAgICAgICAgIG5hbWUgPSBbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG4gICAgICAgICAgICBsaW5lTmFtZSA9IGxpbmUubmFtZTtcblxuICAgICAgICAgICAgdmFyIGxhYmVsID0gJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLm5leHQoKTtcblxuICAgICAgICAgICAgaWYgKF8ua2V5cyhFREREYXRhLkxpbmVzKS5sZW5ndGggPiAyMikge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY2hhbmdlTGluZUNvbG9yKGxpbmUsIGNvbG9yT2JqLCBhc3NheS5saWQsIHRoaXMuZ3JhcGhIZWxwZXIpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ncmFwaEhlbHBlci5sYWJlbHMucHVzaChsYWJlbCk7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChyZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPj0gMSAmJiAkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgLy91bmNoZWNrZWQgbGFiZWxzIGJsYWNrXG4gICAgICAgICAgICAgICAgbWFrZUxhYmVsc0JsYWNrKHRoaXMuZ3JhcGhIZWxwZXIubGFiZWxzKTtcbiAgICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgICAgIGlmIChjb2xvciA9PT0gbnVsbCB8fCBjb2xvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjb3VudCA9IG5vQ2hlY2tlZEJveGVzKHRoaXMuZ3JhcGhIZWxwZXIubGFiZWxzKTtcbiAgICAgICAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmFwaEhlbHBlci5uZXh0Q29sb3IgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBhZGRDb2xvcih0aGlzLmdyYXBoSGVscGVyLmxhYmVscywgY29sb3JPYmosIGFzc2F5LmxpZClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBibGFja1xuICAgICAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY29sb3IgPT09IG51bGwgfHwgY29sb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGF0YU9iaiA9IHtcbiAgICAgICAgICAgICAgICAnbWVhc3VyZSc6IG1lYXN1cmUsXG4gICAgICAgICAgICAgICAgJ2RhdGEnOiBFREREYXRhLFxuICAgICAgICAgICAgICAgICduYW1lJzogbmFtZSxcbiAgICAgICAgICAgICAgICAnY29sb3InOiBjb2xvcixcbiAgICAgICAgICAgICAgICAnbGluZU5hbWUnOiBsaW5lTmFtZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzaW5nbGVBc3NheU9iaiA9IHRoaXMuZ3JhcGhIZWxwZXIudHJhbnNmb3JtU2luZ2xlTGluZUl0ZW0oZGF0YU9iaik7XG4gICAgICAgICAgICBkYXRhU2V0cy5wdXNoKHNpbmdsZUFzc2F5T2JqKTtcbiAgICAgICAgICAgIHByZXYgPSBsaW5lTmFtZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscysrO1xuICAgICAgICB1bmNoZWNrRXZlbnRIYW5kbGVyKHRoaXMuZ3JhcGhIZWxwZXIubGFiZWxzKTtcbiAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuYWRkTmV3U2V0KGRhdGFTZXRzLCBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gbWFrZXMgdW5jaGVja2VkIGxhYmVscyBibGFja1xuICAgICAqIEBwYXJhbSBzZWxlY3RvcnNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlTGFiZWxzQmxhY2soc2VsZWN0b3JzOkpRdWVyeVtdKSB7XG4gICAgICAgIF8uZWFjaChzZWxlY3RvcnMsIGZ1bmN0aW9uKHNlbGVjdG9yOkpRdWVyeSkge1xuICAgICAgICAgICAgaWYgKHNlbGVjdG9yLnByZXYoKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAkKHNlbGVjdG9yKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiBjcmVhdGVzIGFuIGV2ZW50IGhhbmRsZXIgZm9yIHVuY2hlY2tpbmcgYSBjaGVja2VkIGNoZWNrYm94XG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIHVuY2hlY2tFdmVudEhhbmRsZXIobGFiZWxzKSB7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsKXtcbiAgICAgICAgICAgIHZhciBpZCA9ICQobGFiZWwpLnByZXYoKS5hdHRyKCdpZCcpO1xuICAgICAgICAgICAgJCgnIycgKyBpZCkuY2hhbmdlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgaXNjaGVja2VkPSAkKHRoaXMpLmlzKCc6Y2hlY2tlZCcpO1xuICAgICAgICAgICAgICAgICAgICBpZighaXNjaGVja2VkKVxuICAgICAgICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCAnYmxhY2snKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIHJldHVybnMgaG93IG1hbnkgY2hlY2tib3hlcyBhcmUgY2hlY2tlZC5cbiAgICAgKiBAcGFyYW0gbGFiZWxzXG4gICAgICogQHJldHVybnMgY291bnQgb2YgY2hlY2tlZCBib3hlcy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBub0NoZWNrZWRCb3hlcyhsYWJlbHMpIHtcbiAgICAgICAgdmFyIGNvdW50ID0gMDtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWwpIHtcbiAgICAgICAgICAgIHZhciBjaGVja2JveCA9ICQobGFiZWwpLnByZXYoKTtcbiAgICAgICAgICAgIGlmICgkKGNoZWNrYm94KS5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWRkcyBjb2xvcnMgYWZ0ZXIgdXNlciBoYXMgY2xpY2tlZCBhIGxpbmUgYW5kIHRoZW4gdW5jbGlja2VkIGFsbCB0aGUgbGluZXMuXG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqIEBwYXJhbSBjb2xvck9ialxuICAgICAqIEBwYXJhbSBhc3NheVxuICAgICAqIEByZXR1cm5zIGxhYmVsc1xuICAgICAqL1xuXG4gICAgZnVuY3Rpb24gYWRkQ29sb3IobGFiZWxzOkpRdWVyeVtdLCBjb2xvck9iaiwgYXNzYXkpIHtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWw6SlF1ZXJ5KSB7XG4gICAgICAgICAgICB2YXIgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1thc3NheV0ubmFtZSA9PT0gbGFiZWwudGV4dCgpKSB7XG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBsYWJlbHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGxpbmVcbiAgICAgKiBAcGFyYW0gY29sb3JPYmpcbiAgICAgKiBAcGFyYW0gYXNzYXlcbiAgICAgKiBAcGFyYW0gZ3JhcGhIZWxwZXJcbiAgICAgKiBAcmV0dXJucyBjb2xvciBmb3IgbGluZS5cbiAgICAgKiB0aGlzIGZ1bmN0aW9uIHJldHVybnMgdGhlIGNvbG9yIGluIHRoZSBjb2xvciBxdWV1ZSBmb3Igc3R1ZGllcyA+MjIgbGluZXMuIEluc3RhbnRpYXRlZFxuICAgICAqIHdoZW4gdXNlciBjbGlja3Mgb24gYSBsaW5lLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoYW5nZUxpbmVDb2xvcihsaW5lLCBjb2xvck9iaiwgYXNzYXksIGdyYXBoSGVscGVyKSB7XG5cbiAgICAgICAgdmFyIGNvbG9yO1xuXG4gICAgICAgIGlmKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID09PSAxKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBsaW5lWydjb2xvciddO1xuICAgICAgICAgICAgICAgIGxpbmVbJ2RvTm90Q2hhbmdlJ10gPSB0cnVlO1xuICAgICAgICAgICAgICAgIGdyYXBoSGVscGVyLmNvbG9yUXVldWUoY29sb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID49IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAobGluZVsnZG9Ob3RDaGFuZ2UnXSkge1xuICAgICAgICAgICAgICAgICAgIGNvbG9yID0gbGluZVsnY29sb3InXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb2xvciA9IGdyYXBoSGVscGVyLm5leHRDb2xvcjtcbiAgICAgICAgICAgICAgICAgICAgbGluZVsnZG9Ob3RDaGFuZ2UnXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVbJ2NvbG9yJ10gPSBjb2xvcjtcbiAgICAgICAgICAgICAgICAgICAgLy90ZXh0IGxhYmVsIG5leHQgdG8gY2hlY2tib3hcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgICAgICAgICBncmFwaEhlbHBlci5jb2xvclF1ZXVlKGNvbG9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA+MSApe1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkubmV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA9PSAwKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb2xvcjtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGNsZWFyQXNzYXlGb3JtKCk6SlF1ZXJ5IHtcbiAgICAgICAgdmFyIGZvcm06SlF1ZXJ5ID0gJCgnI2lkX2Fzc2F5LWFzc2F5X2lkJykuY2xvc2VzdCgnLmRpc2Nsb3NlJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWFzc2F5LV0nKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49YXNzYXktXScpLmZpbHRlcignOmNoZWNrYm94LCA6cmFkaW8nKS5wcm9wKCdzZWxlY3RlZCcsIGZhbHNlKTtcbiAgICAgICAgZm9ybS5maW5kKCcuY2FuY2VsLWxpbmsnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIHJldHVybiBmb3JtO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsZWFyTGluZUZvcm0oKSB7XG4gICAgICAgIHZhciBmb3JtID0gJCgnI2lkX2xpbmUtaWRzJykuY2xvc2VzdCgnLmRpc2Nsb3NlJyk7XG4gICAgICAgIGZvcm0uZmluZCgnLmxpbmUtbWV0YScpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1saW5lLV0nKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49bGluZS1dJykuZmlsdGVyKCc6Y2hlY2tib3gsIDpyYWRpbycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgIGZvcm0uZmluZCgnLmVycm9ybGlzdCcpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5jYW5jZWwtbGluaycpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5idWxrJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICBmb3JtLm9mZignY2hhbmdlLmJ1bGsnKTtcbiAgICAgICAgcmV0dXJuIGZvcm07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBFREREYXRhLlVzZXJzW3JlY29yZC5leHBlcmltZW50ZXJdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWFzc2F5X2lkXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LW5hbWVdJykudmFsKHJlY29yZC5uYW1lKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1wcm90b2NvbF0nKS52YWwocmVjb3JkLnBpZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzBdJykudmFsKHVzZXIgJiYgdXNlci51aWQgPyB1c2VyLnVpZCA6ICctLScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaWxsTGluZUZvcm0oZm9ybSwgcmVjb3JkKSB7XG4gICAgICAgIHZhciBtZXRhUm93LCBleHBlcmltZW50ZXIsIGNvbnRhY3Q7XG4gICAgICAgIGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmV4cGVyaW1lbnRlcl07XG4gICAgICAgIGNvbnRhY3QgPSBFREREYXRhLlVzZXJzW3JlY29yZC5jb250YWN0LnVzZXJfaWRdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtaWRzXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbmFtZV0nKS52YWwocmVjb3JkLm5hbWUpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtZGVzY3JpcHRpb25dJykudmFsKHJlY29yZC5kZXNjcmlwdGlvbik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250cm9sXScpLnByb3AoJ2NoZWNrZWQnLCByZWNvcmQuY29udHJvbCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250YWN0XzBdJykudmFsKHJlY29yZC5jb250YWN0LnRleHQgfHwgKGNvbnRhY3QgJiYgY29udGFjdC51aWQgPyBjb250YWN0LnVpZCA6ICctLScpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRhY3RfMV0nKS52YWwocmVjb3JkLmNvbnRhY3QudXNlcl9pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1leHBlcmltZW50ZXJfMF0nKS52YWwoZXhwZXJpbWVudGVyICYmIGV4cGVyaW1lbnRlci51aWQgPyBleHBlcmltZW50ZXIudWlkIDogJy0tJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1leHBlcmltZW50ZXJfMV0nKS52YWwocmVjb3JkLmV4cGVyaW1lbnRlcik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jYXJib25fc291cmNlXzBdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5jYXJib24ubWFwKCh2KSA9PiAoRURERGF0YS5DU291cmNlc1t2XSB8fCA8Q2FyYm9uU291cmNlUmVjb3JkPnt9KS5uYW1lIHx8ICctLScpLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jYXJib25fc291cmNlXzFdJykudmFsKHJlY29yZC5jYXJib24uam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMF0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLnN0cmFpbi5tYXAoKHYpID0+IChFREREYXRhLlN0cmFpbnNbdl0gfHwgPFN0cmFpblJlY29yZD57fSkubmFtZSB8fCAnLS0nKS5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18xXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuc3RyYWluLm1hcCgodikgPT4gKEVERERhdGEuU3RyYWluc1t2XSB8fCA8U3RyYWluUmVjb3JkPnt9KS5yZWdpc3RyeV9pZCB8fCAnJykuam9pbignLCcpKTtcbiAgICAgICAgaWYgKHJlY29yZC5zdHJhaW4ubGVuZ3RoICYmIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzFdJykudmFsKCkgPT09ICcnKSB7XG4gICAgICAgICAgICAkKCc8bGk+JykudGV4dCgnU3RyYWluIGRvZXMgbm90IGhhdmUgYSBsaW5rZWQgSUNFIGVudHJ5ISAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1NhdmluZyB0aGUgbGluZSB3aXRob3V0IGxpbmtpbmcgdG8gSUNFIHdpbGwgcmVtb3ZlIHRoZSBzdHJhaW4uJylcbiAgICAgICAgICAgICAgICAud3JhcCgnPHVsPicpLnBhcmVudCgpLmFkZENsYXNzKCdlcnJvcmxpc3QnKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18wXScpLnBhcmVudCgpKTtcbiAgICAgICAgfVxuICAgICAgICBtZXRhUm93ID0gZm9ybS5maW5kKCcubGluZS1lZGl0LW1ldGEnKTtcbiAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgJC5lYWNoKHJlY29yZC5tZXRhLCAoa2V5LCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KG1ldGFSb3csIGtleSwgdmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gc3RvcmUgb3JpZ2luYWwgbWV0YWRhdGEgaW4gaW5pdGlhbC0gZmllbGRcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJykudmFsKEpTT04uc3RyaW5naWZ5KHJlY29yZC5tZXRhKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9aW5pdGlhbC1saW5lLW1ldGFfc3RvcmVdJykudmFsKEpTT04uc3RyaW5naWZ5KHJlY29yZC5tZXRhKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2Nyb2xsVG9Gb3JtKGZvcm0pIHtcbiAgICAgICAgLy8gbWFrZSBzdXJlIGZvcm0gaXMgZGlzY2xvc2VkXG4gICAgICAgIHZhciB0b3AgPSBmb3JtLnRvZ2dsZUNsYXNzKCdkaXNjbG9zZUhpZGUnLCBmYWxzZSkub2Zmc2V0KCkudG9wO1xuICAgICAgICAkKCdodG1sLCBib2R5JykuYW5pbWF0ZSh7ICdzY3JvbGxUb3AnOiB0b3AgfSwgJ3Nsb3cnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVVSUFzc2F5Rm9ybShmb3JtKSB7XG4gICAgICAgIHZhciB0aXRsZSwgYnV0dG9uO1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGRpc2Nsb3NlIHRpdGxlIHRvIHJlYWQgRWRpdFxuICAgICAgICB0aXRsZSA9IGZvcm0uZmluZCgnLmRpc2Nsb3NlTGluayA+IGEnKS50ZXh0KCdFZGl0IEFzc2F5Jyk7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYnV0dG9uIHRvIHJlYWQgRWRpdFxuICAgICAgICBidXR0b24gPSBmb3JtLmZpbmQoJ1tuYW1lPWFjdGlvbl1bdmFsdWU9YXNzYXldJykudGV4dCgnRWRpdCBBc3NheScpO1xuICAgICAgICAvLyBBZGQgbGluayB0byByZXZlcnQgYmFjayB0byAnQWRkIExpbmUnIGZvcm1cbiAgICAgICAgJCgnPGEgaHJlZj1cIiNcIj5DYW5jZWw8L2E+JykuYWRkQ2xhc3MoJ2NhbmNlbC1saW5rJykub24oJ2NsaWNrJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBjbGVhckFzc2F5Rm9ybSgpO1xuICAgICAgICAgICAgdGl0bGUudGV4dCgnQWRkIEFzc2F5cyBUbyBTZWxlY3RlZCBMaW5lcycpO1xuICAgICAgICAgICAgYnV0dG9uLnRleHQoJ0FkZCBBc3NheScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5pbnNlcnRBZnRlcihidXR0b24pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZVVJTGluZUZvcm0oZm9ybSwgcGx1cmFsPykge1xuICAgICAgICB2YXIgdGl0bGUsIGJ1dHRvbiwgdGV4dCA9ICdFZGl0IExpbmUnICsgKHBsdXJhbCA/ICdzJyA6ICcnKTtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBkaXNjbG9zZSB0aXRsZSB0byByZWFkICdFZGl0IExpbmUnXG4gICAgICAgIHRpdGxlID0gZm9ybS5maW5kKCcuZGlzY2xvc2VMaW5rID4gYScpLnRleHQodGV4dCk7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYnV0dG9uIHRvIHJlYWQgJ0VkaXQgTGluZSdcbiAgICAgICAgYnV0dG9uID0gZm9ybS5maW5kKCdbbmFtZT1hY3Rpb25dW3ZhbHVlPWxpbmVdJykudGV4dCh0ZXh0KTtcbiAgICAgICAgaWYgKHBsdXJhbCkge1xuICAgICAgICAgICAgZm9ybS5maW5kKCcuYnVsaycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgZm9ybS5vbignY2hhbmdlLmJ1bGsnLCAnOmlucHV0JywgKGV2OkpRdWVyeUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgJChldi50YXJnZXQpLnNpYmxpbmdzKCdsYWJlbCcpLmZpbmQoJy5idWxrJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWRkIGxpbmsgdG8gcmV2ZXJ0IGJhY2sgdG8gJ0FkZCBMaW5lJyBmb3JtXG4gICAgICAgICQoJzxhIGhyZWY9XCIjXCI+Q2FuY2VsPC9hPicpLmFkZENsYXNzKCdjYW5jZWwtbGluaycpLm9uKCdjbGljaycsIChldikgPT4ge1xuICAgICAgICAgICAgY2xlYXJMaW5lRm9ybSgpO1xuICAgICAgICAgICAgdGl0bGUudGV4dCgnQWRkIEEgTmV3IExpbmUnKTtcbiAgICAgICAgICAgIGJ1dHRvbi50ZXh0KCdBZGQgTGluZScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5pbnNlcnRBZnRlcihidXR0b24pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluc2VydExpbmVNZXRhZGF0YVJvdyhyZWZSb3csIGtleSwgdmFsdWUpIHtcbiAgICAgICAgdmFyIHJvdywgdHlwZSwgbGFiZWwsIGlucHV0LCBpZCA9ICdsaW5lLW1ldGEtJyArIGtleTtcbiAgICAgICAgcm93ID0gJCgnPHA+JykuYXR0cignaWQnLCAncm93XycgKyBpZCkuYWRkQ2xhc3MoJ2xpbmUtbWV0YScpLmluc2VydEJlZm9yZShyZWZSb3cpO1xuICAgICAgICB0eXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2tleV07XG4gICAgICAgIGxhYmVsID0gJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsICdpZF8nICsgaWQpLnRleHQodHlwZS5uYW1lKS5hcHBlbmRUbyhyb3cpO1xuICAgICAgICAvLyBidWxrIGNoZWNrYm94P1xuICAgICAgICBpbnB1dCA9ICQoJzxpbnB1dCB0eXBlPVwidGV4dFwiPicpLmF0dHIoJ2lkJywgJ2lkXycgKyBpZCkudmFsKHZhbHVlKS5hcHBlbmRUbyhyb3cpO1xuICAgICAgICBpZiAodHlwZS5wcmUpIHtcbiAgICAgICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXByZWZpeCcpLnRleHQodHlwZS5wcmUpLmluc2VydEJlZm9yZShpbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcmVtb3ZlJykudGV4dCgnUmVtb3ZlJykuaW5zZXJ0QWZ0ZXIoaW5wdXQpO1xuICAgICAgICBpZiAodHlwZS5wb3N0Zml4KSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wb3N0Zml4JykudGV4dCh0eXBlLnBvc3RmaXgpLmluc2VydEFmdGVyKGlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcm93O1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0QXNzYXkoaW5kZXg6bnVtYmVyKTp2b2lkIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgZm9ybTtcbiAgICAgICAgaWYgKCFyZWNvcmQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJbnZhbGlkIEFzc2F5IHJlY29yZCBmb3IgZWRpdGluZzogJyArIGluZGV4KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcm0gPSBjbGVhckFzc2F5Rm9ybSgpOyAvLyBcImZvcm1cIiBpcyBhY3R1YWxseSB0aGUgZGlzY2xvc2UgYmxvY2tcbiAgICAgICAgZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpO1xuICAgICAgICB1cGRhdGVVSUFzc2F5Rm9ybShmb3JtKTtcbiAgICAgICAgc2Nyb2xsVG9Gb3JtKGZvcm0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0TGluZShpbmRleDpudW1iZXIpOnZvaWQge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5MaW5lc1tpbmRleF0sIGZvcm07XG4gICAgICAgIGlmICghcmVjb3JkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnSW52YWxpZCBMaW5lIHJlY29yZCBmb3IgZWRpdGluZzogJyArIGluZGV4KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcm0gPSBjbGVhckxpbmVGb3JtKCk7IC8vIFwiZm9ybVwiIGlzIGFjdHVhbGx5IHRoZSBkaXNjbG9zZSBibG9ja1xuICAgICAgICBmaWxsTGluZUZvcm0oZm9ybSwgcmVjb3JkKTtcbiAgICAgICAgdXBkYXRlVUlMaW5lRm9ybShmb3JtKTtcbiAgICAgICAgc2Nyb2xsVG9Gb3JtKGZvcm0pO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uQ2hhbmdlZE1ldGFib2xpY01hcCgpIHtcbiAgICAgICAgaWYgKHRoaXMubWV0YWJvbGljTWFwTmFtZSkge1xuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBVSSB0byBzaG93IHRoZSBuZXcgZmlsZW5hbWUgZm9yIHRoZSBtZXRhYm9saWMgbWFwLlxuICAgICAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmh0bWwodGhpcy5tZXRhYm9saWNNYXBOYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoXCIjbWV0YWJvbGljTWFwTmFtZVwiKS5odG1sKCcobm9uZSknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiAmJiB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiAhPSAtMSkge1xuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGNhcmJvbiBiYWxhbmNlcyBub3cgdGhhdCB3ZSBjYW4uXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNhbGN1bGF0ZUNhcmJvbkJhbGFuY2VzKHRoaXMubWV0YWJvbGljTWFwSUQsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uKTtcblxuICAgICAgICAgICAgLy8gUmVidWlsZCB0aGUgQ0IgZ3JhcGhzLlxuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJlYnVpbGRDYXJib25CYWxhbmNlR3JhcGhzKCkge1xuICAgICAgICB2YXIgY2VsbE9ianM6RGF0YUdyaWREYXRhQ2VsbFtdLFxuICAgICAgICAgICAgZ3JvdXA6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMgPSB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmNhcmJvbkJhbGFuY2VDb2w7XG4gICAgICAgIGlmICh0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIERyb3AgYW55IHByZXZpb3VzbHkgY3JlYXRlZCBDYXJib24gQmFsYW5jZSBTVkcgZWxlbWVudHMgZnJvbSB0aGUgRE9NLlxuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLnJlbW92ZUFsbENCR3JhcGhzKCk7XG4gICAgICAgIGNlbGxPYmpzID0gW107XG4gICAgICAgIC8vIGdldCBhbGwgY2VsbHMgZnJvbSBhbGwgY29sdW1ucyBpbiB0aGUgY29sdW1uIGdyb3VwXG4gICAgICAgIGdyb3VwLm1lbWJlckNvbHVtbnMuZm9yRWFjaCgoY29sOkRhdGFHcmlkQ29sdW1uU3BlYyk6dm9pZCA9PiB7XG4gICAgICAgICAgICBBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShjZWxsT2JqcywgY29sLmdldEVudGlyZUluZGV4KCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gY3JlYXRlIGNhcmJvbiBiYWxhbmNlIGdyYXBoIGZvciBlYWNoIGNlbGxcbiAgICAgICAgY2VsbE9ianMuZm9yRWFjaCgoY2VsbDpEYXRhR3JpZERhdGFDZWxsKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNyZWF0ZUNCR3JhcGhGb3JMaW5lKGNlbGwucmVjb3JkSUQsIGNlbGwuY2VsbEVsZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGlzcGxheUlzRnJlc2ggPSB0cnVlO1xuICAgIH1cblxuXG4gICAgLy8gVGhleSB3YW50IHRvIHNlbGVjdCBhIGRpZmZlcmVudCBtZXRhYm9saWMgbWFwLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBvbkNsaWNrZWRNZXRhYm9saWNNYXBOYW1lKCk6dm9pZCB7XG4gICAgICAgIHZhciB1aTpTdHVkeU1ldGFib2xpY01hcENob29zZXIsXG4gICAgICAgICAgICBjYWxsYmFjazpNZXRhYm9saWNNYXBDaG9vc2VyUmVzdWx0ID0gKGVycm9yOnN0cmluZyxcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcE5hbWU/OnN0cmluZyxcbiAgICAgICAgICAgICAgICBmaW5hbEJpb21hc3M/Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBJRCA9IG1ldGFib2xpY01hcElEO1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGljTWFwTmFtZSA9IG1ldGFib2xpY01hcE5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gPSBmaW5hbEJpb21hc3M7XG4gICAgICAgICAgICAgICAgdGhpcy5vbkNoYW5nZWRNZXRhYm9saWNNYXAoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJvbkNsaWNrZWRNZXRhYm9saWNNYXBOYW1lIGVycm9yOiBcIiArIGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdWkgPSBuZXcgU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyKGZhbHNlLCBjYWxsYmFjayk7XG4gICAgfVxufTtcblxuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgTGluZXMgdGFibGVcbmNsYXNzIERhdGFHcmlkU3BlY0xpbmVzIGV4dGVuZHMgRGF0YUdyaWRTcGVjQmFzZSB7XG5cbiAgICBtZXRhRGF0YUlEc1VzZWRJbkxpbmVzOmFueTtcbiAgICBncm91cElEc0luT3JkZXI6YW55O1xuICAgIGdyb3VwSURzVG9Hcm91cEluZGV4ZXM6YW55O1xuICAgIGdyb3VwSURzVG9Hcm91cE5hbWVzOmFueTtcbiAgICBjYXJib25CYWxhbmNlQ29sOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjO1xuICAgIGNhcmJvbkJhbGFuY2VXaWRnZXQ6REdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldDtcblxuXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5maW5kTWV0YURhdGFJRHNVc2VkSW5MaW5lcygpO1xuICAgICAgICB0aGlzLmZpbmRHcm91cElEc0FuZE5hbWVzKCk7XG4gICAgICAgIHN1cGVyLmluaXQoKTtcbiAgICB9XG5cblxuICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQodjpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlV2lkZ2V0LmhpZ2hsaWdodCh2KTtcbiAgICB9XG5cblxuICAgIGVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodjpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlV2lkZ2V0LmVuYWJsZSh2KTtcbiAgICB9XG5cblxuICAgIGZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzKCkge1xuICAgICAgICB2YXIgc2Vlbkhhc2g6YW55ID0ge307XG4gICAgICAgIC8vIGxvb3AgbGluZXNcbiAgICAgICAgJC5lYWNoKHRoaXMuZ2V0UmVjb3JkSURzKCksIChpbmRleCwgaWQpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpZF07XG4gICAgICAgICAgICBpZiAobGluZSkge1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwge30sIChrZXkpID0+IHNlZW5IYXNoW2tleV0gPSB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHN0b3JlIGFsbCBtZXRhZGF0YSBJRHMgc2VlblxuICAgICAgICB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMgPSBPYmplY3Qua2V5cyhzZWVuSGFzaCk7XG4gICAgfVxuXG5cbiAgICBmaW5kR3JvdXBJRHNBbmROYW1lcygpIHtcbiAgICAgICAgdmFyIHJvd0dyb3VwcyA9IHt9O1xuICAgICAgICAvLyBHYXRoZXIgYWxsIHRoZSByb3cgSURzIHVuZGVyIHRoZSBncm91cCBJRCBlYWNoIGJlbG9uZ3MgdG8uXG4gICAgICAgICQuZWFjaCh0aGlzLmdldFJlY29yZElEcygpLCAoaW5kZXgsIGlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaWRdLCByZXAgPSBsaW5lLnJlcGxpY2F0ZTtcbiAgICAgICAgICAgIGlmIChyZXApIHtcbiAgICAgICAgICAgICAgICAvLyB1c2UgcGFyZW50IHJlcGxpY2F0ZSBhcyBhIHJlcGxpY2F0ZSBncm91cCBJRCwgcHVzaCBhbGwgbWF0Y2hpbmcgbGluZSBJRHNcbiAgICAgICAgICAgICAgICAocm93R3JvdXBzW3JlcF0gPSByb3dHcm91cHNbcmVwXSB8fCBbIHJlcCBdKS5wdXNoKGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXMgPSB7fTtcbiAgICAgICAgLy8gRm9yIGVhY2ggZ3JvdXAgSUQsIGp1c3QgdXNlIHBhcmVudCByZXBsaWNhdGUgbmFtZVxuICAgICAgICAkLmVhY2gocm93R3JvdXBzLCAoZ3JvdXAsIGxpbmVzKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2dyb3VwXSA9IEVERERhdGEuTGluZXNbZ3JvdXBdLm5hbWU7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBhbHBoYW51bWVyaWMgc29ydCBvZiBncm91cCBJRHMgYnkgbmFtZSBhdHRhY2hlZCB0byB0aG9zZSByZXBsaWNhdGUgZ3JvdXBzXG4gICAgICAgIHRoaXMuZ3JvdXBJRHNJbk9yZGVyID0gT2JqZWN0LmtleXMocm93R3JvdXBzKS5zb3J0KChhLGIpID0+IHtcbiAgICAgICAgICAgIHZhciB1OnN0cmluZyA9IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbYV0sIHY6c3RyaW5nID0gdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tiXTtcbiAgICAgICAgICAgIHJldHVybiB1IDwgdiA/IC0xIDogdSA+IHYgPyAxIDogMDtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIE5vdyB0aGF0IHRoZXkncmUgc29ydGVkIGJ5IG5hbWUsIGNyZWF0ZSBhIGhhc2ggZm9yIHF1aWNrbHkgcmVzb2x2aW5nIElEcyB0byBpbmRleGVzIGluXG4gICAgICAgIC8vIHRoZSBzb3J0ZWQgYXJyYXlcbiAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBJbmRleGVzID0ge307XG4gICAgICAgICQuZWFjaCh0aGlzLmdyb3VwSURzSW5PcmRlciwgKGluZGV4LCBncm91cCkgPT4gdGhpcy5ncm91cElEc1RvR3JvdXBJbmRleGVzW2dyb3VwXSA9IGluZGV4KTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSB0YWJsZSBhcyBhIHdob2xlXG4gICAgZGVmaW5lVGFibGVTcGVjKCk6RGF0YUdyaWRUYWJsZVNwZWMge1xuICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkVGFibGVTcGVjKCdsaW5lcycsIHsgJ25hbWUnOiAnTGluZXMnIH0pO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkTGluZU5hbWUoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkU3RyYWluTmFtZShpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIC8vIGVuc3VyZSBhIHN0cmFpbiBJRCBleGlzdHMgb24gbGluZSwgaXMgYSBrbm93biBzdHJhaW4sIHVwcGVyY2FzZSBmaXJzdCBmb3VuZCBuYW1lIG9yICc/J1xuICAgICAgICB2YXIgbGluZSwgc3RyYWluO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLnN0cmFpbiAmJiBsaW5lLnN0cmFpbi5sZW5ndGggJiYgKHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tsaW5lLnN0cmFpblswXV0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0cmFpbi5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4OnN0cmluZyk6YW55IHtcbiAgICAgICAgLy8gZW5zdXJlIGNhcmJvbiBzb3VyY2UgSUQocykgZXhpc3Qgb24gbGluZSwgZW5zdXJlIGF0IGxlYXN0IG9uZSBzb3VyY2UgSUQsIGVuc3VyZSBmaXJzdCBJRFxuICAgICAgICAvLyBpcyBrbm93biBjYXJib24gc291cmNlXG4gICAgICAgIHZhciBsaW5lLCBzb3VyY2U7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuY2FyYm9uICYmIGxpbmUuY2FyYm9uLmxlbmd0aCAmJiAoc291cmNlID0gRURERGF0YS5DU291cmNlc1tsaW5lLmNhcmJvblswXV0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBsb2FkQ2FyYm9uU291cmNlKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMubG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4KTtcbiAgICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZENhcmJvblNvdXJjZUxhYmVsaW5nKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMubG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4KTtcbiAgICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZS5sYWJlbGluZy50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRFeHBlcmltZW50ZXJJbml0aWFscyhpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIC8vIGVuc3VyZSBpbmRleCBJRCBleGlzdHMsIGVuc3VyZSBleHBlcmltZW50ZXIgdXNlciBJRCBleGlzdHMsIHVwcGVyY2FzZSBpbml0aWFscyBvciA/XG4gICAgICAgIHZhciBsaW5lLCBleHBlcmltZW50ZXI7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChleHBlcmltZW50ZXIgPSBFREREYXRhLlVzZXJzW2xpbmUuZXhwZXJpbWVudGVyXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwZXJpbWVudGVyLmluaXRpYWxzLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZExpbmVNb2RpZmljYXRpb24oaW5kZXg6c3RyaW5nKTpudW1iZXIge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5tb2RpZmllZC50aW1lO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgaGVhZGVycyBhbG9uZyB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUhlYWRlclNwZWMoKTpEYXRhR3JpZEhlYWRlclNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMSwgJ2hMaW5lc05hbWUnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTmFtZScsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZExpbmVOYW1lIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyLCAnaExpbmVzU3RyYWluJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1N0cmFpbicsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZFN0cmFpbk5hbWUsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDMsICdoTGluZXNDYXJib24nLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ2FyYm9uIFNvdXJjZShzKScsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZENhcmJvblNvdXJjZSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNCwgJ2hMaW5lc0xhYmVsaW5nJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhYmVsaW5nJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQ2FyYm9uU291cmNlTGFiZWxpbmcsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDUsICdoTGluZXNDYXJib25CYWxhbmNlJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NhcmJvbiBCYWxhbmNlJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU5hbWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg2ICsgaW5kZXgsICdoTGluZXNNZXRhJyArIGlkLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiBtZFR5cGUubmFtZSxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5tYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg2ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCwgJ2hMaW5lc0V4cGVyaW1lbnRlcicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdFeHBlcmltZW50ZXInLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsICdoTGluZXNNb2RpZmllZCcsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU1vZGlmaWNhdGlvbixcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFIZWFkZXJzLCByaWdodFNpZGUpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBtYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQ6c3RyaW5nKSB7XG4gICAgICAgIHJldHVybiAoaTpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpXTtcbiAgICAgICAgICAgIGlmIChsaW5lICYmIGxpbmUubWV0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsaW5lLm1ldGFbaWRdIHx8ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgY29sc3BhbiB2YWx1ZSBmb3IgYWxsIHRoZSBjZWxscyB0aGF0IGFyZSBub3QgJ2NhcmJvbiBzb3VyY2UnIG9yICdsYWJlbGluZydcbiAgICAvLyBpcyBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGNhcmJvbiBzb3VyY2VzIGZvciB0aGUgcmVzcGVjdGl2ZSByZWNvcmQuXG4gICAgLy8gU3BlY2lmaWNhbGx5LCBpdCdzIGVpdGhlciB0aGUgbnVtYmVyIG9mIGNhcmJvbiBzb3VyY2VzLCBvciAxLCB3aGljaGV2ZXIgaXMgaGlnaGVyLlxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCkge1xuICAgICAgICByZXR1cm4gKEVERERhdGEuTGluZXNbaW5kZXhdLmNhcmJvbiB8fCBbXSkubGVuZ3RoIHx8IDE7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUxpbmVOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbGluZUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdsaW5lJyArIGlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogW1xuICAgICAgICAgICAgICAgICAgICAnPGEgaHJlZj1cIiNlZGl0bGluZVwiIGNsYXNzPVwibGluZS1lZGl0LWxpbmtcIj5FZGl0IExpbmU8L2E+JyxcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2xpbmVJZD0nICsgaW5kZXggKyAnXCI+RXhwb3J0IERhdGEgYXMgQ1NWL0V4Y2VsPC9hPicsXG4gICAgICAgICAgICAgICAgICAgICc8YSBocmVmPVwiL3NibWw/bGluZUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBTQk1MPC9hPidcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGxpbmUubmFtZSArIChsaW5lLmN0cmwgPyAnPGIgY2xhc3M9XCJpc2NvbnRyb2xkYXRhXCI+QzwvYj4nIDogJycpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVTdHJhaW5OYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIGNvbnRlbnQgPSBbXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gbGluZS5zdHJhaW4ubWFwKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbaWRdO1xuICAgICAgICAgICAgICAgIHJldHVybiBbICc8YSBocmVmPVwiJywgc3RyYWluLnJlZ2lzdHJ5X3VybCwgJ1wiPicsIHN0cmFpbi5uYW1lLCAnPC9hPicgXS5qb2luKCcnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudC5qb2luKCc7ICcpIHx8ICctLSdcbiAgICAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBzdHJpbmdzID0gWyctLSddO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmNhcmJvbiAmJiBsaW5lLmNhcmJvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmdzID0gbGluZS5jYXJib24ubWFwKChpZCkgPT4geyByZXR1cm4gRURERGF0YS5DU291cmNlc1tpZF0ubmFtZTsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZ3MubWFwKChuYW1lKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7ICdjb250ZW50U3RyaW5nJzogbmFtZSB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgc3RyaW5ncyA9IFsnLS0nXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5ncyA9IGxpbmUuY2FyYm9uLm1hcCgoaWQpID0+IHsgcmV0dXJuIEVERERhdGEuQ1NvdXJjZXNbaWRdLmxhYmVsaW5nOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5ncy5tYXAoKGxhYmVsaW5nKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7ICdjb250ZW50U3RyaW5nJzogbGFiZWxpbmcgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZUNhcmJvbkJhbGFuY2VCbGFua0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdtaW5XaWR0aCc6IDIwMFxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlRXhwZXJpbWVudGVySW5pdGlhbHNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgZXhwLCBjb250ZW50O1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLlVzZXJzICYmIChleHAgPSBFREREYXRhLlVzZXJzW2xpbmUuZXhwZXJpbWVudGVyXSkpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50ID0gZXhwLmluaXRpYWxzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudCB8fCAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKEVERERhdGEuTGluZXNbaW5kZXhdLm1vZGlmaWVkLnRpbWUpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29udGVudFN0ciA9ICcnLCBsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGxpbmUgJiYgdHlwZSAmJiBsaW5lLm1ldGEgJiYgKGNvbnRlbnRTdHIgPSBsaW5lLm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGRhdGEgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVDb2x1bW5TcGVjKCk6RGF0YUdyaWRDb2x1bW5TcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICBtZXRhRGF0YUNvbHM6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICByaWdodFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW107XG4gICAgICAgIC8vIGFkZCBjbGljayBoYW5kbGVyIGZvciBtZW51IG9uIGxpbmUgbmFtZSBjZWxsc1xuICAgICAgICAkKHRoaXMudGFibGVFbGVtZW50KS5vbignY2xpY2snLCAnYS5saW5lLWVkaXQtbGluaycsIChldikgPT4ge1xuICAgICAgICAgICAgU3R1ZHlELmVkaXRMaW5lKCQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgICAgICBsZWZ0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMSwgdGhpcy5nZW5lcmF0ZUxpbmVOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyLCB0aGlzLmdlbmVyYXRlU3RyYWluTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMywgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCwgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUxhYmVsaW5nQ2VsbHMpLFxuICAgICAgICAgICAgLy8gVGhlIENhcmJvbiBCYWxhbmNlIGNlbGxzIGFyZSBwb3B1bGF0ZWQgYnkgYSBjYWxsYmFjaywgdHJpZ2dlcmVkIHdoZW4gZmlyc3QgZGlzcGxheWVkXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDUsIHRoaXMuZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscylcbiAgICAgICAgXTtcbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgaW5kZXgsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG4gICAgZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSB7XG4gICAgICAgIHZhciB0b3BTZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xpbmUgTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ1N0cmFpbicpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDYXJib24gU291cmNlKHMpJyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhYmVsaW5nJyksXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VDb2wgPSBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NhcmJvbiBCYWxhbmNlJywge1xuICAgICAgICAgICAgICAgICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlLCAgICAvLyBIYXMgaXRzIG93biBoZWFkZXIgd2lkZ2V0XG4gICAgICAgICAgICAgICAgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3JldmVhbGVkQ2FsbGJhY2snOiBTdHVkeUQuY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2tcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdmFyIG1ldGFEYXRhQ29sR3JvdXBzOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgICAgIG1ldGFEYXRhQ29sR3JvdXBzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMobWRUeXBlLm5hbWUpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgYm90dG9tU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdFeHBlcmltZW50ZXInLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYXN0IE1vZGlmaWVkJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiB0b3BTZWN0aW9uLmNvbmNhdChtZXRhRGF0YUNvbEdyb3VwcywgYm90dG9tU2VjdGlvbik7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgZ3JvdXBzIHRoYXQgcm93cyBjYW4gYmUgZ2F0aGVyZWQgaW50b1xuICAgIGRlZmluZVJvd0dyb3VwU3BlYygpOmFueSB7XG5cbiAgICAgICAgdmFyIHJvd0dyb3VwU3BlYyA9IFtdO1xuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHRoaXMuZ3JvdXBJRHNJbk9yZGVyLmxlbmd0aDsgeCsrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSB0aGlzLmdyb3VwSURzSW5PcmRlclt4XTtcblxuICAgICAgICAgICAgdmFyIHJvd0dyb3VwU3BlY0VudHJ5OmFueSA9IHsgICAgLy8gR3JvdXBzIGFyZSBudW1iZXJlZCBzdGFydGluZyBmcm9tIDBcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2lkXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJvd0dyb3VwU3BlYy5wdXNoKHJvd0dyb3VwU3BlY0VudHJ5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dHcm91cFNwZWM7XG4gICAgfVxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZHlMaW5lc1RhYmxlXCIpO1xuICAgIH1cblxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzIChudW1iZXJzLCBub3Qgc3RyaW5ncyksIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHJlY29yZHMgaW4gdGhlXG4gICAgLy8gZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG4gICAgZ2V0UmVjb3JkSURzKCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoRURERGF0YS5MaW5lcyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzLiBUaGUgb3JkZXIgb2YgdGhlIGFycmF5IHdpbGwgYmVcbiAgICAvLyB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzdWJzdHJpbmcgc2VhcmNoaW5nXG4gICAgICAgIHZhciBzZWFyY2hMaW5lc1dpZGdldCA9IG5ldyBER0xpbmVzU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIExpbmVzJywgMzAsIGZhbHNlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VhcmNoTGluZXNXaWRnZXQpO1xuICAgICAgICAvLyBBIFwiQ2FyYm9uIEJhbGFuY2VcIiBjaGVja2JveFxuICAgICAgICB2YXIgc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQgPSBuZXcgREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNob3dDYXJib25CYWxhbmNlV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQpO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQgPSBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldDtcbiAgICAgICAgLy8gQSBcImRlc2VsZWN0IGFsbFwiIGJ1dHRvblxuICAgICAgICB2YXIgZGVzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdEZXNlbGVjdEFsbFdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIGRlc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZGVzZWxlY3RBbGxXaWRnZXQpO1xuICAgICAgICAvLyBBIFwic2VsZWN0IGFsbFwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXlcbiAgICAvLyB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuIEVtcHR5IGFycmF5ID0gT0suXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIExpbmVzXG4gICAgICAgIHZhciBncm91cExpbmVzV2lkZ2V0ID0gbmV3IERHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChncm91cExpbmVzV2lkZ2V0KTtcbiAgICAgICAgdmFyIGRpc2FibGVkTGluZXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZExpbmVzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZGlzYWJsZWRMaW5lc1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlICdhY3Rpb24gcGFuZWxzJyBmb3IgdGhlIExpbmVzIGFuZCBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIGxpbmVzVGFibGUgPSB0aGlzLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICAkKGxpbmVzVGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gU3R1ZHlELnF1ZXVlTGluZXNBY3Rpb25QYW5lbFNob3coKSk7XG5cbiAgICAgICAgLy8gVGhpcyBjYWxscyBkb3duIGludG8gdGhlIGluc3RhbnRpYXRlZCB3aWRnZXQgYW5kIGFsdGVycyBpdHMgc3R5bGluZyxcbiAgICAgICAgLy8gc28gd2UgbmVlZCB0byBkbyBpdCBhZnRlciB0aGUgdGFibGUgaGFzIGJlZW4gY3JlYXRlZC5cbiAgICAgICAgdGhpcy5lbmFibGVDYXJib25CYWxhbmNlV2lkZ2V0KGZhbHNlKTtcblxuICAgICAgICAvLyBXaXJlLWluIG91ciBjdXN0b20gZWRpdCBmaWVsZHMgZm9yIHRoZSBTdHVkaWVzIHBhZ2UsIGFuZCBjb250aW51ZSB3aXRoIGdlbmVyYWwgaW5pdFxuICAgICAgICBTdHVkeUQucHJlcGFyZUFmdGVyTGluZXNUYWJsZSgpO1xuICAgIH1cbn1cblxuXG5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgTGluZXMgdGhhdCBhcmUgbWFya2VkIGFzIGRpc2FibGVkLlxuY2xhc3MgREdEaXNhYmxlZExpbmVzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydTaG93RExpbmVzQ0InK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgICQoY2IpLmNsaWNrKCAoZSkgPT4gdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmNsaWNrZWRPcHRpb25XaWRnZXQoZSkgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnU2hvdyBEaXNhYmxlZCcsIGNiSUQpOztcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIGNoZWNrZWQ6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAoY2hlY2tlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IHJvd0lEcy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gcm93SURzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNbaWRdLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkSURzLnB1c2goaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZElEcztcbiAgICB9XG5cblxuICAgIGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOmFueSwgcm93SUQ6c3RyaW5nKTphbnkge1xuICAgICAgICBpZiAoIUVERERhdGEuTGluZXNbcm93SURdLmFjdGl2ZSkge1xuICAgICAgICAgICAgJC5lYWNoKGRhdGFSb3dPYmplY3RzLCAoeCwgcm93KSA9PiAkKHJvdy5nZXRFbGVtZW50KCkpLmFkZENsYXNzKCdkaXNhYmxlZFJlY29yZCcpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbi8vIEEgd2lkZ2V0IHRvIHRvZ2dsZSByZXBsaWNhdGUgZ3JvdXBpbmcgb24gYW5kIG9mZlxuY2xhc3MgREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBwVGhpcyA9IHRoaXM7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnR3JvdXBTdHVkeVJlcGxpY2F0ZXNDQicrdW5pcXVlSUQ7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgJChjYikuY2xpY2soXG4gICAgICAgICAgICBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBUaGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHBUaGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHVybk9uUm93R3JvdXBpbmcoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwVGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnR1cm5PZmZSb3dHcm91cGluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnR3JvdXAgUmVwbGljYXRlcycsIGNiSUQpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cbn1cblxuXG5cbi8vIFRoaXMgaXMgYSBEYXRhR3JpZEhlYWRlcldpZGdldCBkZXJpdmVkIGZyb20gREdTZWFyY2hXaWRnZXQuIEl0J3MgYSBzZWFyY2ggZmllbGQgdGhhdCBvZmZlcnNcbi8vIG9wdGlvbnMgZm9yIGFkZGl0aW9uYWwgZGF0YSB0eXBlcywgcXVlcnlpbmcgdGhlIHNlcnZlciBmb3IgcmVzdWx0cy5cbmNsYXNzIERHTGluZXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBzZWFyY2hEaXNjbG9zdXJlRWxlbWVudDphbnk7XG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6YW55LCBkYXRhR3JpZFNwZWM6YW55LCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLFxuICAgICAgICAgICAgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjLCBwbGFjZUhvbGRlciwgc2l6ZSwgZ2V0c0ZvY3VzKTtcbiAgICB9XG5cblxuICAgIC8vIFRoZSB1bmlxdWVJRCBpcyBwcm92aWRlZCB0byBhc3Npc3QgdGhlIHdpZGdldCBpbiBhdm9pZGluZyBjb2xsaXNpb25zIHdoZW4gY3JlYXRpbmcgaW5wdXRcbiAgICAvLyBlbGVtZW50IGxhYmVscyBvciBvdGhlciB0aGluZ3MgcmVxdWlyaW5nIGFuIElELlxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHN1cGVyLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBhcHBlbmQgdGhlIHdpZGdldCBlbGVtZW50cyBiZW5lYXRoIHRoZSBnaXZlbiBlbGVtZW50LiBJZiB0aGUgZWxlbWVudHMgaGF2ZVxuICAgIC8vIG5vdCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgdGhlIHVuaXF1ZUlEIGlzIHBhc3NlZCBhbG9uZy5cbiAgICBhcHBlbmRFbGVtZW50cyhjb250YWluZXI6YW55LCB1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICAgIH1cbn1cblxuXG5cbi8vIEEgaGVhZGVyIHdpZGdldCB0byBwcmVwYXJlIHRoZSBDYXJib24gQmFsYW5jZSB0YWJsZSBjZWxscywgYW5kIHNob3cgb3IgaGlkZSB0aGVtLlxuY2xhc3MgREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIGNoZWNrQm94RWxlbWVudDphbnk7XG4gICAgbGFiZWxFbGVtZW50OmFueTtcbiAgICBoaWdobGlnaHRlZDpib29sZWFuO1xuICAgIGNoZWNrYm94RW5hYmxlZDpib29sZWFuO1xuXG4gICAgLy8gc3RvcmUgbW9yZSBzcGVjaWZpYyB0eXBlIG9mIHNwZWMgdG8gZ2V0IHRvIGNhcmJvbkJhbGFuY2VDb2wgbGF0ZXJcbiAgICBwcml2YXRlIF9saW5lU3BlYzpEYXRhR3JpZFNwZWNMaW5lcztcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcykge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLmNoZWNrYm94RW5hYmxlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fbGluZVNwZWMgPSBkYXRhR3JpZFNwZWM7XG4gICAgfVxuXG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAnQ2FyQmFsJyArIHVuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgIGNiLmNsYXNzTmFtZSA9ICd0YWJsZUNvbnRyb2wnO1xuICAgICAgICAkKGNiKS5jbGljaygoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6dm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2YXRlQ2FyYm9uQmFsYW5jZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGFiZWw6SFRNTEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnQ2FyYm9uIEJhbGFuY2UnLCBjYklEKTtcblxuICAgICAgICB2YXIgc3BhbjpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgICBzcGFuLmNsYXNzTmFtZSA9ICd0YWJsZUNvbnRyb2wnO1xuICAgICAgICBzcGFuLmFwcGVuZENoaWxkKGNiKTtcbiAgICAgICAgc3Bhbi5hcHBlbmRDaGlsZChsYWJlbCk7XG5cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSBsYWJlbDtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gc3BhbjtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG4gICAgaGlnaGxpZ2h0KGg6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0ZWQgPSBoO1xuICAgICAgICBpZiAodGhpcy5jaGVja2JveEVuYWJsZWQpIHtcbiAgICAgICAgICAgIGlmIChoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAncmVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVuYWJsZShoOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNoZWNrYm94RW5hYmxlZCA9IGg7XG4gICAgICAgIGlmIChoKSB7XG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodCh0aGlzLmhpZ2hsaWdodGVkKTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJ2dyYXknO1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3RpdmF0ZUNhcmJvbkJhbGFuY2UoKTp2b2lkIHtcbiAgICAgICAgdmFyIHVpOkZ1bGxTdHVkeUJpb21hc3NVSSxcbiAgICAgICAgICAgIGNhbGxiYWNrOkZ1bGxTdHVkeUJpb21hc3NVSVJlc3VsdHNDYWxsYmFjaztcbiAgICAgICAgY2FsbGJhY2sgPSAoZXJyb3I6c3RyaW5nLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwRmlsZW5hbWU/OnN0cmluZyxcbiAgICAgICAgICAgICAgICBmaW5hbEJpb21hc3M/Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgICAgICAgU3R1ZHlELm1ldGFib2xpY01hcElEID0gbWV0YWJvbGljTWFwSUQ7XG4gICAgICAgICAgICAgICAgU3R1ZHlELm1ldGFib2xpY01hcE5hbWUgPSBtZXRhYm9saWNNYXBGaWxlbmFtZTtcbiAgICAgICAgICAgICAgICBTdHVkeUQuYmlvbWFzc0NhbGN1bGF0aW9uID0gZmluYWxCaW9tYXNzO1xuICAgICAgICAgICAgICAgIFN0dWR5RC5vbkNoYW5nZWRNZXRhYm9saWNNYXAoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3Quc2hvd0NvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gZ2V0IGEgYmlvbWFzcyBjYWxjdWxhdGlvbiB0byBtdWx0aXBseSBhZ2FpbnN0IE9ELlxuICAgICAgICAgICAgLy8gSGF2ZSB0aGV5IHNldCB0aGlzIHVwIHlldD9cbiAgICAgICAgICAgIGlmICghU3R1ZHlELmJpb21hc3NDYWxjdWxhdGlvbiB8fCBTdHVkeUQuYmlvbWFzc0NhbGN1bGF0aW9uID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBNdXN0IHNldHVwIHRoZSBiaW9tYXNzXG4gICAgICAgICAgICAgICAgdWkgPSBuZXcgRnVsbFN0dWR5QmlvbWFzc1VJKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnNob3dDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuaGlkZUNvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbmNsYXNzIERhdGFHcmlkQXNzYXlzIGV4dGVuZHMgRGF0YUdyaWQge1xuXG5cbiAgICBzZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkOmJvb2xlYW47XG4gICAgZ3JhcGhSZWZyZXNoVGltZXJJRDphbnk7XG4gICAgLy8gUmlnaHQgbm93IHdlJ3JlIG5vdCBhY3R1YWxseSB1c2luZyB0aGUgY29udGVudHMgb2YgdGhpcyBhcnJheSwganVzdFxuICAgIC8vIGNoZWNraW5nIHRvIHNlZSBpZiBpdCdzIG5vbi1lbXB0eS5cbiAgICByZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQ6bnVtYmVyW107XG5cblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gW107XG4gICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IGZhbHNlO1xuICAgIH1cblxuXG4gICAgaW52YWxpZGF0ZUFzc2F5UmVjb3JkcyhyZWNvcmRzOm51bWJlcltdKTp2b2lkIHtcbiAgICAgICAgdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQgPSB0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZC5jb25jYXQocmVjb3Jkcyk7XG4gICAgICAgIGlmICghdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCkge1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBjbGlja2VkRGlzY2xvc2UoZGlzY2xvc2U6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHZhciBzcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cyA9IHRoaXMuZ2V0U3BlYygpO1xuICAgICAgICB2YXIgdGFibGUgPSBzcGVjLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICB2YXIgZGl2ID0gc3BlYy51bmRpc2Nsb3NlZFNlY3Rpb25EaXY7XG4gICAgICAgIGlmICghZGl2IHx8ICF0YWJsZSkgeyByZXR1cm47IH1cbiAgICAgICAgaWYgKGRpc2Nsb3NlKSB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQgPSB0cnVlO1xuICAgICAgICAgICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgcmVtYWtlcyBhIHRhYmxlLiBUaGlzIGJyZWFrcyB1cFxuICAgICAgICAgICAgLy8gdGFibGUgcmVjcmVhdGlvbiBpbnRvIHNlcGFyYXRlIGV2ZW50cywgc28gdGhlIGJyb3dzZXIgY2FuIHVwZGF0ZSBVSS5cbiAgICAgICAgICAgIGlmICh0aGlzLnJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKSwgMTApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uQ3VycmVudGx5RGlzY2xvc2VkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk6dm9pZCB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gW107XG4gICAgICAgICAgICB0aGlzLnF1ZXVlR3JhcGhSZW1ha2UoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBleGVjdXRlIHJlY29yZHMgcmVmcmVzaDogJyArIGUpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9jYW5jZWxHcmFwaCgpIHtcbiAgICAgICAgaWYgKHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuZ3JhcGhSZWZyZXNoVGltZXJJRCk7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5ncmFwaFJlZnJlc2hUaW1lcklEO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIHRoZSBncmFwaC5cbiAgICBxdWV1ZUdyYXBoUmVtYWtlKCkge1xuICAgICAgICB0aGlzLl9jYW5jZWxHcmFwaCgpO1xuICAgICAgICB0aGlzLmdyYXBoUmVmcmVzaFRpbWVySUQgPSBzZXRUaW1lb3V0KCAoKSA9PiB0aGlzLnJlbWFrZUdyYXBoQXJlYSgpLCAxMDAgKTtcbiAgICB9XG5cblxuICAgIHJlbWFrZUdyYXBoQXJlYSgpIHtcbiAgICAgICAgdmFyIHNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzID0gdGhpcy5nZXRTcGVjKCksIGcsIGNvbnZlcnQsIGNvbXBhcmU7XG4gICAgICAgIC8vIGlmIGNhbGxlZCBkaXJlY3RseSwgY2FuY2VsIGFueSBwZW5kaW5nIHJlcXVlc3RzIGluIFwicXVldWVcIlxuICAgICAgICB0aGlzLl9jYW5jZWxHcmFwaCgpO1xuXG4gICAgICAgIGlmICghU3R1ZHlER3JhcGhpbmcgfHwgIXNwZWMgfHwgIXNwZWMuZ3JhcGhPYmplY3QpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGcgPSBzcGVjLmdyYXBoT2JqZWN0O1xuICAgICAgICB2YXIgY29sb3JPYmogPSBFREREYXRhWydjb2xvciddO1xuICAgICAgICB2YXIgZGF0YVNldHMgPSBbXTtcbiAgICAgICAgc3BlYy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5OmFueSA9IEVERERhdGEuQXNzYXlzW2lkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICBsaW5lOmFueSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlcztcbiAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlIHx8ICFsaW5lLmFjdGl2ZSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgIG1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW107XG4gICAgICAgICAgICBtZWFzdXJlcy5mb3JFYWNoKChtKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmUgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21dLCBzZXQ7XG4gICAgICAgICAgICAgICAgdmFyIG5hbWUgPSBhc3NheS5uYW1lO1xuICAgICAgICAgICAgICAgIHZhciBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgdmFyIGxpbmVOYW1lID0gbGluZS5uYW1lO1xuICAgICAgICAgICAgICAgIHZhciBkYXRhT2JqID0ge1xuICAgICAgICAgICAgICAgICAgICAnbWVhc3VyZSc6IG1lYXN1cmUsXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzogRURERGF0YSxcbiAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAnY29sb3InOiBjb2xvcixcbiAgICAgICAgICAgICAgICAgICAgJ2xpbmVOYW1lJzogbGluZU5hbWVcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHZhciBzaW5nbGVBc3NheU9iaiA9IEdyYXBoSGVscGVyTWV0aG9kcy50cmFuc2Zvcm1TaW5nbGVMaW5lSXRlbShkYXRhT2JqKTtcblxuICAgICAgICAgICAgICAgIGlmIChsaW5lLmNvbnRyb2wpIHNpbmdsZUFzc2F5T2JqLmlzY29udHJvbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgZGF0YVNldHMucHVzaChzaW5nbGVBc3NheU9iaik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZy5hZGROZXdTZXQoZGF0YVNldHMpO1xuICAgIH1cbn1cblxuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgQXNzYXlzIHRhYmxlKHMpXG5jbGFzcyBEYXRhR3JpZFNwZWNBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIHByb3RvY29sSUQ6YW55O1xuICAgIHByb3RvY29sTmFtZTpzdHJpbmc7XG4gICAgYXNzYXlJRHNJblByb3RvY29sOm51bWJlcltdO1xuICAgIG1ldGFEYXRhSURzVXNlZEluQXNzYXlzOmFueTtcbiAgICBtYXhpbXVtWFZhbHVlSW5EYXRhOm51bWJlcjtcblxuICAgIHVuZGlzY2xvc2VkU2VjdGlvbkRpdjphbnk7XG5cbiAgICBtZWFzdXJpbmdUaW1lc0hlYWRlclNwZWM6RGF0YUdyaWRIZWFkZXJTcGVjO1xuICAgIGdyYXBoQXJlYUhlYWRlclNwZWM6RGF0YUdyaWRIZWFkZXJTcGVjO1xuXG4gICAgZ3JhcGhPYmplY3Q6YW55O1xuXG5cbiAgICBjb25zdHJ1Y3Rvcihwcm90b2NvbElEKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMucHJvdG9jb2xJRCA9IHByb3RvY29sSUQ7XG4gICAgICAgIHRoaXMucHJvdG9jb2xOYW1lID0gRURERGF0YS5Qcm90b2NvbHNbcHJvdG9jb2xJRF0ubmFtZTtcbiAgICAgICAgdGhpcy5ncmFwaE9iamVjdCA9IG51bGw7XG4gICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjID0gbnVsbDtcbiAgICB9XG5cblxuICAgIGluaXQoKSB7XG4gICAgICAgIHRoaXMucmVmcmVzaElETGlzdCgpO1xuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIHRoaXMuZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCk7XG4gICAgICAgIHN1cGVyLmluaXQoKTtcbiAgICB9XG5cblxuICAgIHJlZnJlc2hJRExpc3QoKTp2b2lkIHtcbiAgICAgICAgLy8gRmluZCBvdXQgd2hpY2ggcHJvdG9jb2xzIGhhdmUgYXNzYXlzIHdpdGggbWVhc3VyZW1lbnRzIC0gZGlzYWJsZWQgb3Igbm9cbiAgICAgICAgdGhpcy5hc3NheUlEc0luUHJvdG9jb2wgPSBbXTtcbiAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZDpzdHJpbmcsIGFzc2F5OkFzc2F5UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lOkxpbmVSZWNvcmQ7XG4gICAgICAgICAgICAvLyBza2lwIGFzc2F5cyBmb3Igb3RoZXIgcHJvdG9jb2xzXG4gICAgICAgICAgICBpZiAodGhpcy5wcm90b2NvbElEID09PSBhc3NheS5waWQpIHtcbiAgICAgICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIC8vIHNraXAgYXNzYXlzIHdpdGhvdXQgYSB2YWxpZCBsaW5lIG9yIHdpdGggYSBkaXNhYmxlZCBsaW5lXG4gICAgICAgICAgICAgICAgaWYgKGxpbmUgJiYgbGluZS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NheUlEc0luUHJvdG9jb2wucHVzaChhc3NheS5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycywgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGUgZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG4gICAgZ2V0UmVjb3JkSURzKCk6YW55W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5hc3NheUlEc0luUHJvdG9jb2w7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGFuIG92ZXJyaWRlLiAgQ2FsbGVkIHdoZW4gYSBkYXRhIHJlc3QgaXMgdHJpZ2dlcmVkLCBidXQgYmVmb3JlIHRoZSB0YWJsZSByb3dzIGFyZVxuICAgIC8vIHJlYnVpbHQuXG4gICAgb25EYXRhUmVzZXQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIGlmICh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyAmJiB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KSB7XG4gICAgICAgICAgICAkKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpLmNoaWxkcmVuKCc6Zmlyc3QnKS50ZXh0KFxuICAgICAgICAgICAgICAgICAgICAnTWVhc3VyaW5nIFRpbWVzIChSYW5nZSAwIHRvICcgKyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEgKyAnKScpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlXG4gICAgLy8gY29udGVudCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgZ2V0VGFibGVFbGVtZW50KCkge1xuICAgICAgICB2YXIgc2VjdGlvbiwgcHJvdG9jb2xEaXYsIHRpdGxlRGl2LCB0aXRsZUxpbmssIHRhYmxlLFxuICAgICAgICAgICAgcCA9IHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgIHRhYmxlSUQ6c3RyaW5nID0gJ3BybycgKyBwICsgJ2Fzc2F5c3RhYmxlJztcbiAgICAgICAgLy8gSWYgd2UgY2FuJ3QgZmluZCBhIHRhYmxlLCB3ZSBpbnNlcnQgYSBjbGljay10by1kaXNjbG9zZSBkaXYsIGFuZCB0aGVuIGEgdGFibGUgZGlyZWN0bHlcbiAgICAgICAgLy8gYWZ0ZXIgaXQuXG4gICAgICAgIGlmICgkKCcjJyArIHRhYmxlSUQpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgc2VjdGlvbiA9ICQoJyNhc3NheXNTZWN0aW9uJyk7XG4gICAgICAgICAgICBwcm90b2NvbERpdiA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2Rpc2Nsb3NlIGRpc2Nsb3NlSGlkZScpLmFwcGVuZFRvKHNlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy51bmRpc2Nsb3NlZFNlY3Rpb25EaXYgPSBwcm90b2NvbERpdlswXTtcbiAgICAgICAgICAgIHRpdGxlRGl2ID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnc2VjdGlvbkNoYXB0ZXInKS5hcHBlbmRUbyhwcm90b2NvbERpdik7XG4gICAgICAgICAgICB0aXRsZUxpbmsgPSAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnZGlzY2xvc2VMaW5rJylcbiAgICAgICAgICAgICAgICAgICAgLnRleHQodGhpcy5wcm90b2NvbE5hbWUgKyAnIEFzc2F5cycpXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyh0aXRsZURpdik7XG4gICAgICAgICAgICB0YWJsZSA9ICQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRhYmxlXCIpKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cignaWQnLCB0YWJsZUlEKS5hZGRDbGFzcygnZGlzY2xvc2VCb2R5JylcbiAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKHByb3RvY29sRGl2KTtcbiAgICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgYWN0aW9ucyBwYW5lbCByZW1haW5zIGF0IHRoZSBib3R0b20uXG4gICAgICAgICAgICAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKS5hcHBlbmRUbyhzZWN0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGFibGVJRCk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnYXNzYXlzJyt0aGlzLnByb3RvY29sSUQsIHtcbiAgICAgICAgICAgICdkZWZhdWx0U29ydCc6IDFcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBmaW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cyA9IFtdO1xuICAgICAgICB0aGlzLmdldFJlY29yZElEcygpLmZvckVhY2goKGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgJC5lYWNoKGFzc2F5Lm1ldGEgfHwge30sIChtZXRhSWQpID0+IHsgc2Vlbkhhc2hbbWV0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgW10ucHVzaC5hcHBseSh0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLCBPYmplY3Qua2V5cyhzZWVuSGFzaCkpO1xuICAgIH1cblxuXG4gICAgZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTp2b2lkIHtcbiAgICAgICAgdmFyIG1heEZvckFsbDpudW1iZXIgPSAwO1xuICAgICAgICAvLyByZWR1Y2UgdG8gZmluZCBoaWdoZXN0IHZhbHVlIGFjcm9zcyBhbGwgcmVjb3Jkc1xuICAgICAgICBtYXhGb3JBbGwgPSB0aGlzLmdldFJlY29yZElEcygpLnJlZHVjZSgocHJldjpudW1iZXIsIGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdLCBtZWFzdXJlcywgbWF4Rm9yUmVjb3JkO1xuICAgICAgICAgICAgbWVhc3VyZXMgPSBhc3NheS5tZWFzdXJlcyB8fCBbXTtcbiAgICAgICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCBtZWFzdXJlc1xuICAgICAgICAgICAgbWF4Rm9yUmVjb3JkID0gbWVhc3VyZXMucmVkdWNlKChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxvb2t1cDphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlOmFueSA9IGxvb2t1cFttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlO1xuICAgICAgICAgICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCBkYXRhIGluIG1lYXN1cmVtZW50XG4gICAgICAgICAgICAgICAgbWF4Rm9yTWVhc3VyZSA9IChtZWFzdXJlLnZhbHVlcyB8fCBbXSkucmVkdWNlKChwcmV2Om51bWJlciwgcG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHBvaW50WzBdWzBdKTtcbiAgICAgICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgbWF4Rm9yTWVhc3VyZSk7XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JSZWNvcmQpO1xuICAgICAgICB9LCAwKTtcbiAgICAgICAgLy8gQW55dGhpbmcgYWJvdmUgMCBpcyBhY2NlcHRhYmxlLCBidXQgMCB3aWxsIGRlZmF1bHQgaW5zdGVhZCB0byAxLlxuICAgICAgICB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEgPSBtYXhGb3JBbGwgfHwgMTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TmFtZShpbmRleDphbnkpOnN0cmluZyB7XG4gICAgICAgIC8vIEluIGFuIG9sZCB0eXBpY2FsIEVERERhdGEuQXNzYXlzIHJlY29yZCB0aGlzIHN0cmluZyBpcyBjdXJyZW50bHkgcHJlLWFzc2VtYmxlZCBhbmQgc3RvcmVkXG4gICAgICAgIC8vIGluICdmbicuIEJ1dCB3ZSdyZSBwaGFzaW5nIHRoYXQgb3V0LlxuICAgICAgICB2YXIgYXNzYXksIGxpbmU7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtsaW5lLm4sIHRoaXMucHJvdG9jb2xOYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRFeHBlcmltZW50ZXJJbml0aWFscyhpbmRleDphbnkpOnN0cmluZyB7XG4gICAgICAgIC8vIGVuc3VyZSBpbmRleCBJRCBleGlzdHMsIGVuc3VyZSBleHBlcmltZW50ZXIgdXNlciBJRCBleGlzdHMsIHVwcGVyY2FzZSBpbml0aWFscyBvciA/XG4gICAgICAgIHZhciBhc3NheSwgZXhwZXJpbWVudGVyO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChleHBlcmltZW50ZXIgPSBFREREYXRhLlVzZXJzW2Fzc2F5LmV4cF0pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4cGVyaW1lbnRlci5pbml0aWFscy50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIGxvYWRBc3NheU1vZGlmaWNhdGlvbihpbmRleDphbnkpOm51bWJlciB7XG4gICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kO1xuICAgIH1cblxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiArIGluZGV4LCAnaEFzc2F5c01ldGEnK3RoaXMucHJvdG9jb2xJRCsnaWQnICsgaWQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG1kVHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLm1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCksXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMgPSBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDggKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICdoQXNzYXlzR3JhcGgnICsgdGhpcy5wcm90b2NvbElELCB7ICdjb2xzcGFuJzogNyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGggfSk7XG5cbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gW1xuICAgICAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygxLCAnaEFzc2F5c05hbWUnK3RoaXMucHJvdG9jb2xJRCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ05hbWUnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRBc3NheU5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgPSBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDUgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICdoQXNzYXlzTVRpbWVzJyt0aGlzLnByb3RvY29sSUQsIHsgJ25hbWUnOiAnTWVhc3VyaW5nIFRpbWVzJywgJ2hlYWRlclJvdyc6IDIgfSk7XG5cbiAgICAgICAgdmFyIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzTU5hbWUnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7ICduYW1lJzogJ01lYXN1cmVtZW50JywgJ2hlYWRlclJvdyc6IDIgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDMgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c1VuaXRzJyArIHRoaXMucHJvdG9jb2xJRCxcbiAgICAgICAgICAgICAgICAgICAgeyAnbmFtZSc6ICdVbml0cycsICdoZWFkZXJSb3cnOiAyIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg0ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNDb3VudCcgKyB0aGlzLnByb3RvY29sSUQsXG4gICAgICAgICAgICAgICAgICAgIHsgJ25hbWUnOiAnQ291bnQnLCAnaGVhZGVyUm93JzogMiB9KSxcbiAgICAgICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg2ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNFeHBlcmltZW50ZXInICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdFeHBlcmltZW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzTW9kaWZpZWQnICsgdGhpcy5wcm90b2NvbElELFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEFzc2F5TW9kaWZpY2F0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhSGVhZGVycywgcmlnaHRTaWRlKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgbWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoaSkgPT4ge1xuICAgICAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2ldO1xuICAgICAgICAgICAgaWYgKHJlY29yZCAmJiByZWNvcmQubWV0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQubWV0YVtpZF0gfHwgJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZSBjb2xzcGFuIHZhbHVlIGZvciBhbGwgdGhlIGNlbGxzIHRoYXQgYXJlIGFzc2F5LWxldmVsIChub3QgbWVhc3VyZW1lbnQtbGV2ZWwpIGlzIGJhc2VkIG9uXG4gICAgLy8gdGhlIG51bWJlciBvZiBtZWFzdXJlbWVudHMgZm9yIHRoZSByZXNwZWN0aXZlIHJlY29yZC4gU3BlY2lmaWNhbGx5LCBpdCdzIHRoZSBudW1iZXIgb2ZcbiAgICAvLyBtZXRhYm9saXRlIGFuZCBnZW5lcmFsIG1lYXN1cmVtZW50cywgcGx1cyAxIGlmIHRoZXJlIGFyZSB0cmFuc2NyaXB0b21pY3MgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmVcbiAgICAvLyBhcmUgcHJvdGVvbWljcyBtZWFzdXJlbWVudHMsIGFsbCBhZGRlZCB0b2dldGhlci4gIChPciAxLCB3aGljaGV2ZXIgaXMgaGlnaGVyLilcbiAgICBwcml2YXRlIHJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpOm51bWJlciB7XG4gICAgICAgIHZhciByZWMgPSBFREREYXRhLkFzc2F5c1tpbmRleF07XG4gICAgICAgIHZhciB2Om51bWJlciA9ICgocmVjLmdlbmVyYWwgICAgICAgICB8fCBbXSkubGVuZ3RoICtcbiAgICAgICAgICAgICAgICAgICAgICAgIChyZWMubWV0YWJvbGl0ZXMgICAgIHx8IFtdKS5sZW5ndGggK1xuICAgICAgICAgICAgICAgICAgICAgICAgKChyZWMudHJhbnNjcmlwdGlvbnMgfHwgW10pLmxlbmd0aCA/IDEgOiAwKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy5wcm90ZWlucyAgICAgICB8fCBbXSkubGVuZ3RoID8gMSA6IDApICAgKSB8fCAxO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGxpbmUgPSBFREREYXRhLkxpbmVzW3JlY29yZC5saWRdLCBzaWRlTWVudUl0ZW1zID0gW1xuICAgICAgICAgICAgJzxhIGNsYXNzPVwiYXNzYXktZWRpdC1saW5rXCI+RWRpdCBBc3NheTwvYT4nLFxuICAgICAgICAgICAgJzxhIGNsYXNzPVwiYXNzYXktcmVsb2FkLWxpbmtcIj5SZWxvYWQgRGF0YTwvYT4nLFxuICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2Fzc2F5SWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIENTVi9ldGM8L2E+J1xuICAgICAgICBdO1xuICAgICAgICAvLyBUT0RPIHdlIHByb2JhYmx5IGRvbid0IHdhbnQgdG8gc3BlY2lhbC1jYXNlIGxpa2UgdGhpcyBieSBuYW1lXG4gICAgICAgIGlmIChncmlkU3BlYy5wcm90b2NvbE5hbWUgPT0gXCJUcmFuc2NyaXB0b21pY3NcIikge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcy5wdXNoKCc8YSBocmVmPVwiaW1wb3J0L3JuYXNlcS9lZGdlcHJvP2Fzc2F5PScraW5kZXgrJ1wiPkltcG9ydCBSTkEtc2VxIGRhdGEgZnJvbSBFREdFLXBybzwvYT4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdhc3NheUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdhc3NheScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IHNpZGVNZW51SXRlbXMsXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogW2xpbmUubmFtZSwgZ3JpZFNwZWMucHJvdG9jb2xOYW1lLCByZWNvcmQubmFtZV0uam9pbignLScpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbnRlbnRTdHIgPSAnJywgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5ICYmIHR5cGUgJiYgYXNzYXkubWV0YSAmJiAoY29udGVudFN0ciA9IGFzc2F5Lm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nLFxuICAgICAgICAgICAgb3B0OmFueSk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgY2VsbHMgPSBbXSxcbiAgICAgICAgICAgIGZhY3RvcnkgPSAoKTpEYXRhR3JpZERhdGFDZWxsID0+IG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCk7XG5cbiAgICAgICAgaWYgKChyZWNvcmQubWV0YWJvbGl0ZXMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgJ3Jvd3NwYW4nOiByZWNvcmQubWV0YWJvbGl0ZXMubGVuZ3RoIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udmVydCBJRHMgdG8gbWVhc3VyZW1lbnRzLCBzb3J0IGJ5IG5hbWUsIHRoZW4gY29udmVydCB0byBjZWxsIG9iamVjdHNcbiAgICAgICAgICAgICAgICBjZWxscyA9IHJlY29yZC5tZXRhYm9saXRlcy5tYXAob3B0Lm1ldGFib2xpdGVUb1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnNvcnQob3B0Lm1ldGFib2xpdGVWYWx1ZVNvcnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKG9wdC5tZXRhYm9saXRlVmFsdWVUb0NlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICgocmVjb3JkLmdlbmVyYWwgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgeyAncm93c3Bhbic6IHJlY29yZC5nZW5lcmFsLmxlbmd0aCB9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgSURzIHRvIG1lYXN1cmVtZW50cywgc29ydCBieSBuYW1lLCB0aGVuIGNvbnZlcnQgdG8gY2VsbCBvYmplY3RzXG4gICAgICAgICAgICAgICAgY2VsbHMgPSByZWNvcmQuZ2VuZXJhbC5tYXAob3B0Lm1ldGFib2xpdGVUb1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAuc29ydChvcHQubWV0YWJvbGl0ZVZhbHVlU29ydClcbiAgICAgICAgICAgICAgICAgICAgLm1hcChvcHQubWV0YWJvbGl0ZVZhbHVlVG9DZWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBvbmx5IG9uZSBjZWxsIGlmIHRoZXJlIGlzIGFueSB0cmFuc2NyaXB0b21pY3MgZGF0YVxuICAgICAgICBpZiAoKHJlY29yZC50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LnRyYW5zY3JpcHRUb0NlbGwocmVjb3JkLnRyYW5zY3JpcHRpb25zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgb25seSBvbmUgY2VsbCBpZiB0aGVyZSBpcyBhbnkgcHJvdGVvbWljcyBkYXRhXG4gICAgICAgIGlmICgocmVjb3JkLnByb3RlaW5zIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQucHJvdGVpblRvQ2VsbChyZWNvcmQucHJvdGVpbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBhIGxvYWRpbmcgY2VsbCBpZiBub25lIGNyZWF0ZWQgYnkgbWVhc3VyZW1lbnRzXG4gICAgICAgIGlmICghY2VsbHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAocmVjb3JkLmNvdW50KSB7XG4gICAgICAgICAgICAgICAgLy8gd2UgaGF2ZSBhIGNvdW50LCBidXQgbm8gZGF0YSB5ZXQ7IHN0aWxsIGxvYWRpbmdcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHQuZW1wdHkpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC5lbXB0eS5jYWxsKHt9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2goZmFjdG9yeSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2VsbHM7XG4gICAgfVxuXG5cbiAgICBnZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIHZhbHVlLmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbWVhc3VyZW1lbnRJZCcsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6ICgpID0+IHsgcmV0dXJuICdtZWFzdXJlbWVudCcgKyB2YWx1ZS5pZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS5uYW1lXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnVHJhbnNjcmlwdG9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnUHJvdGVvbWljcyBEYXRhJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZW1wdHlcIjogKCkgPT4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnPGk+Tm8gTWVhc3VyZW1lbnRzPC9pPidcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVVbml0c0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHVuaXQ6YW55ID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ3VuaXQnOiB1bml0Lm5hbWUgfHwgJycgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdmFsdWUudW5pdFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1JQS00nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnJyAvLyBUT0RPOiB3aGF0IGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50IHVuaXRzP1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGdlbmVyYXRlQ291bnRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgLy8gZnVuY3Rpb24gdG8gdXNlIGluIEFycmF5I3JlZHVjZSB0byBjb3VudCBhbGwgdGhlIHZhbHVlcyBpbiBhIHNldCBvZiBtZWFzdXJlbWVudHNcbiAgICAgICAgdmFyIHJlZHVjZUNvdW50ID0gKHByZXY6bnVtYmVyLCBtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiBwcmV2ICsgKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5sZW5ndGg7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ21lYXN1cmUnOiBtZWFzdXJlIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCAodmFsdWUubWVhc3VyZS52YWx1ZXMgfHwgW10pLmxlbmd0aCwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgaWRzLnJlZHVjZShyZWR1Y2VDb3VudCwgMCksICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsIGlkcy5yZWR1Y2UocmVkdWNlQ291bnQsIDApLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgc3ZnQ2VsbEZvclRpbWVDb3VudHMgPSAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnNvbGlkYXRlZCwgc3ZnID0gJycsIHRpbWVDb3VudCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vIGNvdW50IHZhbHVlcyBhdCBlYWNoIHggZm9yIGFsbCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgICAgICBpZHMuZm9yRWFjaCgobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50czpudW1iZXJbXVtdW10gPSBtZWFzdXJlLnZhbHVlcyB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRzLmZvckVhY2goKHBvaW50Om51bWJlcltdW10pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVDb3VudFtwb2ludFswXVswXV0gPSB0aW1lQ291bnRbcG9pbnRbMF1bMF1dIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUeXBlc2NyaXB0IGNvbXBpbGVyIGRvZXMgbm90IGxpa2UgdXNpbmcgaW5jcmVtZW50IG9wZXJhdG9yIG9uIGV4cHJlc3Npb25cbiAgICAgICAgICAgICAgICAgICAgICAgICsrdGltZUNvdW50W3BvaW50WzBdWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gbWFwIHRoZSBjb3VudHMgdG8gW3gsIHldIHR1cGxlc1xuICAgICAgICAgICAgICAgIGNvbnNvbGlkYXRlZCA9ICQubWFwKHRpbWVDb3VudCwgKHZhbHVlLCBrZXkpID0+IFtbIFtwYXJzZUZsb2F0KGtleSldLCBbdmFsdWVdIF1dKTtcbiAgICAgICAgICAgICAgICAvLyBnZW5lcmF0ZSBTVkcgc3RyaW5nXG4gICAgICAgICAgICAgICAgaWYgKGNvbnNvbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKGNvbnNvbGlkYXRlZCwgJycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN2Z1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAnbWVhc3VyZSc6IG1lYXN1cmUgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZSA9IHZhbHVlLm1lYXN1cmUgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdCA9IG1lYXN1cmUuZm9ybWF0ID09PSAxID8gJ2NhcmJvbicgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRzID0gdmFsdWUubWVhc3VyZS52YWx1ZXMgfHwgW10sXG4gICAgICAgICAgICAgICAgICAgIHN2ZyA9IGdyaWRTcGVjLmFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhwb2ludHMsIGZvcm1hdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN2Z1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHMsXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IHN2Z0NlbGxGb3JUaW1lQ291bnRzXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGV4cCA9IEVERERhdGEuQXNzYXlzW2luZGV4XS5leHA7XG4gICAgICAgIHZhciB1UmVjb3JkID0gRURERGF0YS5Vc2Vyc1tleHBdO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHVSZWNvcmQgPyB1UmVjb3JkLmluaXRpYWxzIDogJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuXG4gICAgZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcoRURERGF0YS5Bc3NheXNbaW5kZXhdLm1vZClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cbiAgICBhc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMocG9pbnRzLCBmb3JtYXQ6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc3ZnID0gJzxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZlcnNpb249XCIxLjJcIiB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMHB4XCJcXFxuICAgICAgICAgICAgICAgICAgICB2aWV3Qm94PVwiMCAwIDQ3MCAxMFwiIHByZXNlcnZlQXNwZWN0UmF0aW89XCJub25lXCI+XFxcbiAgICAgICAgICAgICAgICA8c3R5bGUgdHlwZT1cInRleHQvY3NzXCI+PCFbQ0RBVEFbXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jUCB7IHN0cm9rZTpyZ2JhKDAsMCwwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY1YgeyBzdHJva2U6cmdiYSgwLDAsMjMwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY0UgeyBzdHJva2U6cmdiYSgyNTUsMTI4LDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgXV0+PC9zdHlsZT5cXFxuICAgICAgICAgICAgICAgIDxwYXRoIGZpbGw9XCJyZ2JhKDAsMCwwLDAuMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2U9XCJyZ2JhKDAsMCwwLDAuMDUpXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgZD1cIk0xMCw1aDQ1MFwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPVwic3Ryb2tlLXdpZHRoOjJweDtcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2Utd2lkdGg9XCIyXCI+PC9wYXRoPic7XG4gICAgICAgIHZhciBwYXRocyA9IFsgc3ZnIF07XG4gICAgICAgIHBvaW50cy5zb3J0KChhLGIpID0+IHsgcmV0dXJuIGFbMF0gLSBiWzBdOyB9KS5mb3JFYWNoKChwb2ludCkgPT4ge1xuICAgICAgICAgICAgdmFyIHggPSBwb2ludFswXVswXSxcbiAgICAgICAgICAgICAgICB5ID0gcG9pbnRbMV1bMF0sXG4gICAgICAgICAgICAgICAgcnggPSAoKHggLyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEpICogNDUwKSArIDEwLFxuICAgICAgICAgICAgICAgIHR0ID0gW3ksICcgYXQgJywgeCwgJ2gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJyw1djRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKHkgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjRVwiIGQ9XCJNJywgcngsICcsMnY2XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY0XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIGlmIChmb3JtYXQgPT09ICdjYXJib24nKSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1ZcIiBkPVwiTScsIHJ4LCAnLDF2OFwiPjx0aXRsZT4nLCB0dCwgJzwvdGl0bGU+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1BcIiBkPVwiTScsIHJ4LCAnLDF2OFwiPjx0aXRsZT4nLCB0dCwgJzwvdGl0bGU+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHBhdGhzLnB1c2goJzwvc3ZnPicpO1xuICAgICAgICByZXR1cm4gcGF0aHMuam9pbignXFxuJyk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgbWV0YURhdGFDb2xzOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgcmlnaHRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdO1xuICAgICAgICAvLyBhZGQgY2xpY2sgaGFuZGxlciBmb3IgbWVudSBvbiBhc3NheSBuYW1lIGNlbGxzXG4gICAgICAgICQodGhpcy50YWJsZUVsZW1lbnQpLm9uKCdjbGljaycsICdhLmFzc2F5LWVkaXQtbGluaycsIChldikgPT4ge1xuICAgICAgICAgICAgU3R1ZHlELmVkaXRBc3NheSgkKGV2LnRhcmdldCkuY2xvc2VzdCgnLnBvcHVwY2VsbCcpLmZpbmQoJ2lucHV0JykudmFsKCkpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnYS5hc3NheS1yZWxvYWQtbGluaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBpZCA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSxcbiAgICAgICAgICAgICAgICBhc3NheTpBc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW2lkXTtcbiAgICAgICAgICAgIGlmIChhc3NheSkge1xuICAgICAgICAgICAgICAgIFN0dWR5RC5yZXF1ZXN0QXNzYXlEYXRhKGFzc2F5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxlZnRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCB0aGlzLmdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMpXG4gICAgICAgICAgIF07XG5cbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyICsgaW5kZXgsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcblxuICAgICAgICByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZVVuaXRzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg0ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUNvdW50Q2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg1ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNyArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUNvbHMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICB2YXIgdG9wU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHZhciBtZXRhRGF0YUNvbEdyb3VwczpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgICAgICBtZXRhRGF0YUNvbEdyb3VwcyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmVtZW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnVW5pdHMnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDb3VudCcsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmluZyBUaW1lcycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc3Vic3RyaW5nIHNlYXJjaGluZ1xuICAgICAgICB2YXIgc2VhcmNoQXNzYXlzV2lkZ2V0ID0gbmV3IERHQXNzYXlzU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIEFzc2F5cycsIDMwLFxuICAgICAgICAgICAgICAgIGZhbHNlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VhcmNoQXNzYXlzV2lkZ2V0KTtcblxuICAgICAgICB2YXIgZGVzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdEZXNlbGVjdEFsbFdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIGRlc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZGVzZWxlY3RBbGxXaWRnZXQpO1xuICAgICAgICBcbiAgICAgICAgLy8gQSBcInNlbGVjdCBhbGxcIiBidXR0b25cbiAgICAgICAgdmFyIHNlbGVjdEFsbFdpZGdldCA9IG5ldyBER1NlbGVjdEFsbFdpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNlbGVjdEFsbFdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlbGVjdEFsbFdpZGdldCk7XG5cbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBBc3NheXNcbiAgICAgICAgdmFyIGRpc2FibGVkQXNzYXlzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRBc3NheXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZEFzc2F5c1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWRBc3NheXMpOnZvaWQge1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlICdhY3Rpb24gcGFuZWxzJyBmb3IgdGhlIEFzc2F5cyBzZWN0aW9uc1xuICAgICAgICB2YXIgdGFibGUgPSB0aGlzLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICAkKHRhYmxlKS5vbignY2hhbmdlJywgJzpjaGVja2JveCcsICgpID0+IFN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpKTtcblxuICAgICAgICBpZiAodGhpcy51bmRpc2Nsb3NlZFNlY3Rpb25EaXYpIHtcbiAgICAgICAgICAgICQodGhpcy51bmRpc2Nsb3NlZFNlY3Rpb25EaXYpLmNsaWNrKCgpID0+IGRhdGFHcmlkLmNsaWNrZWREaXNjbG9zZSh0cnVlKSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcCA9IHRoaXMucHJvdG9jb2xJRDtcbiAgICAgICAgdmFyIGdyYXBoaWQgPSBcInByb1wiICsgcCArIFwiZ3JhcGhcIjtcbiAgICAgICAgICBpZiAodGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIC8vaHRtbCBmb3IgdGhlIGRpZmZlcmVudCBncmFwaHNcbiAgICAgICAgICAgICAgICAgICAgdmFyIGh0bWwgPVxuICAgICAgICAgICAgICAgICAgICAgICAgJzxkaXYgY2xhc3M9XCJncmFwaENvbnRhaW5lclwiIGlkPSAnICsgZ3JhcGhpZCArICc+PC9kaXY+J1xuICAgICAgICAgICAgICAgICAgICB2YXIgZG9tID0gJCggaHRtbCApO1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2xvbmVkQnV0dG9ucyA9ICQoJy5hc3NheS1zZWN0aW9uOmZpcnN0JykuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNsb25lZENsYXNzZXMgPSAkKCcuY2hhcnRJZHM6Zmlyc3QnKS5jbG9uZSgpO1xuICAgICAgICAgICAgICAgICAgICAkKGNsb25lZEJ1dHRvbnMpLmFwcGVuZFRvKHRoaXMuZ3JhcGhBcmVhSGVhZGVyU3BlYy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgJChjbG9uZWRDbGFzc2VzKS5hcHBlbmRUbyh0aGlzLmdyYXBoQXJlYUhlYWRlclNwZWMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjLmVsZW1lbnQpLmFwcGVuZChkb20pO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBJbml0aWFsaXplIHRoZSBncmFwaCBvYmplY3RcbiAgICAgICAgICAgICAgICB0aGlzLmdyYXBoT2JqZWN0ID0gT2JqZWN0LmNyZWF0ZShTdHVkeURHcmFwaGluZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5ncmFwaE9iamVjdC5TZXR1cChncmFwaGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBSdW4gaXQgb25jZSBpbiBjYXNlIHRoZSBwYWdlIHdhcyBnZW5lcmF0ZWQgd2l0aCBjaGVja2VkIEFzc2F5c1xuICAgICAgICBTdHVkeUQucXVldWVBc3NheXNBY3Rpb25QYW5lbFNob3coKTtcbiAgICB9XG59XG5cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIEFzc2F5cyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkQXNzYXlzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydTaG93REFzc2F5c0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayggKGUpID0+IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ1Nob3cgRGlzYWJsZWQnLCBjYklEKTs7XG4gICAgICAgIHRoaXMuX2NyZWF0ZWRFbGVtZW50cyA9IHRydWU7XG4gICAgfVxuXG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIC8vIElmIHRoZSBib3ggaXMgY2hlY2tlZCwgcmV0dXJuIHRoZSBzZXQgb2YgSURzIHVuZmlsdGVyZWRcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZmlsdGVyZWRJRHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCByb3dJRHMubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHJvd0lEc1tyXTtcbiAgICAgICAgICAgIC8vIEhlcmUgaXMgdGhlIGNvbmRpdGlvbiB0aGF0IGRldGVybWluZXMgd2hldGhlciB0aGUgcm93cyBhc3NvY2lhdGVkIHdpdGggdGhpcyBJRCBhcmVcbiAgICAgICAgICAgIC8vIHNob3duIG9yIGhpZGRlbi5cbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5c1tpZF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkSURzO1xuICAgIH1cblxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDphbnkpOmFueSB7XG4gICAgICAgIGlmICghRURERGF0YS5Bc3NheXNbcm93SURdLmFjdGl2ZSkge1xuICAgICAgICAgICAgJC5lYWNoKGRhdGFSb3dPYmplY3RzLCAoeCwgcm93KSA9PiAkKHJvdy5nZXRFbGVtZW50KCkpLmFkZENsYXNzKCdkaXNhYmxlZFJlY29yZCcpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbi8vIFRoaXMgaXMgYSBEYXRhR3JpZEhlYWRlcldpZGdldCBkZXJpdmVkIGZyb20gREdTZWFyY2hXaWRnZXQuIEl0J3MgYSBzZWFyY2ggZmllbGQgdGhhdCBvZmZlcnNcbi8vIG9wdGlvbnMgZm9yIGFkZGl0aW9uYWwgZGF0YSB0eXBlcywgcXVlcnlpbmcgdGhlIHNlcnZlciBmb3IgcmVzdWx0cy5cbmNsYXNzIERHQXNzYXlzU2VhcmNoV2lkZ2V0IGV4dGVuZHMgREdTZWFyY2hXaWRnZXQge1xuXG4gICAgc2VhcmNoRGlzY2xvc3VyZUVsZW1lbnQ6YW55O1xuXG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OmFueSwgZGF0YUdyaWRTcGVjOmFueSwgcGxhY2VIb2xkZXI6c3RyaW5nLCBzaXplOm51bWJlcixcbiAgICAgICAgICAgIGdldHNGb2N1czpib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYywgcGxhY2VIb2xkZXIsIHNpemUsIGdldHNGb2N1cyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9ucyB3aGVuIGNyZWF0aW5nIGlucHV0XG4gICAgLy8gZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBzdXBlci5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC4gSWYgdGhlIGVsZW1lbnRzIGhhdmVcbiAgICAvLyBub3QgYmVlbiBjcmVhdGVkIHlldCwgdGhleSBhcmUgY3JlYXRlZCwgYW5kIHRoZSB1bmlxdWVJRCBpcyBwYXNzZWQgYWxvbmcuXG4gICAgYXBwZW5kRWxlbWVudHMoY29udGFpbmVyOmFueSwgdW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmNyZWF0ZWRFbGVtZW50cygpKSB7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICB9XG59XG5cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoKCkgPT4gU3R1ZHlELnByZXBhcmVJdCgpKTtcbiJdfQ==