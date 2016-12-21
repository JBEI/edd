// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="StudyGraphing.ts" />
/// <reference path="GraphHelperMethods.ts" />
/// <reference path="../typings/d3/d3.d.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var StudyD;
(function (StudyD) {
    'use strict';
    var mainGraphObject;
    var mainGraphRefreshTimerID;
    var linesActionPanelRefreshTimer;
    var assaysActionPanelRefreshTimer;
    var prevDescriptionEditElement;
    // Table spec and table objects, one each per Protocol, for Assays.
    var assaysDataGridSpecs;
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
            this.filterTableJQ = $('<div>').addClass('filterTable');
            $('#mainFilterSection').append(this.filterTableJQ);
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
        this.mainGraphRefreshTimerID = null;
        this.prevDescriptionEditElement = null;
        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.linesActionPanelRefreshTimer = null;
        this.assaysActionPanelRefreshTimer = null;
        this.assaysDataGridSpecs = {};
        this.assaysDataGrids = {};
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        measurementToAssayModal();
        showStudyGraph();
        showStudyTable();
        show_assay_measurements();
        $.ajax({
            'url': 'edddata/',
            'type': 'GET',
            'error': function (xhr, status, e) {
                $('#overviewSection').prepend("<div class='noData'>Error. Please reload</div>");
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': function (data) {
                EDDData = $.extend(EDDData || {}, data);
                _this.progressiveFilteringWidget.prepareFilteringSection();
                if (_.keys(EDDData.Assays).length === 0) {
                    //stop spinner
                    $('#loadingDiv').hide();
                    $('.scroll').css('height', 100);
                }
                else {
                    $('.scroll').css('height', 300);
                    $('#chartType').show();
                }
                //show empty graph div if there are no
                if (_.keys(EDDData.Lines).length === 0) {
                }
                else {
                }
                var spec;
                _this.assaysDataGridSpecs = spec = new DataGridSpecAssays(EDDData.Assays);
                spec.init();
                _this.assaysDataGrids = new DataGridAssays(spec);
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
        // Prepare the main data overview graph at the top of the page
        if (this.mainGraphObject === null && $('#maingraph').length === 1) {
            this.mainGraphObject = Object.create(StudyDGraphing);
            this.mainGraphObject.Setup('maingraph');
            this.progressiveFilteringWidget.mainGraphObject = this.mainGraphObject;
        }
        $('#mainFilterSection').on('mouseover mousedown mouseup', this.queueMainGraphRemake.bind(this, false))
            .on('keydown', filterTableKeyDown.bind(this));
    }
    StudyD.prepareIt = prepareIt;
    //click handler for add measurements to selected assays modal
    function measurementToAssayModal() {
        var dlg = $("#addMeasToAssay").dialog({
            autoOpen: false
        });
        $("#measurementMain").click(function () {
            $("#addMeasToAssay").dialog("open");
            return false;
        });
        return false;
    }
    ;
    //show hide for clicking graph tab under data
    function showStudyGraph() {
        $('#studyGraph').click(function (event) {
            event.preventDefault();
            $('#studyTable').removeClass('active');
            $(this).addClass('active');
            $('#overviewSection').css('display', 'block');
            $('#assaysSection').css('display', 'none');
            return false;
        });
    }
    //show hide for clicking table tab under data
    function showStudyTable() {
        $("#studyTable").one("click", function () {
            //first build table
            StudyD.assaysDataGrids.triggerAssayRecordsRefresh();
            //if any checkboxes have been check in filtering section, showHide rows
            if ($(".filterTable input:checkbox:checked").length > 0) {
                $('#showNoMeasurements').text("show all");
                StudyD.showHideAssayRows(StudyD.progressiveFilteringWidget.filteredAssayIDs);
            }
            else {
                $('#showNoMeasurements').text("show only with measurements");
            }
        });
        $('#studyTable').click(function (event) {
            event.preventDefault();
            //on page load of table show assays search header
            $("input[name*='assaysSearch']").parents('thead').show();
            //remove sorter on measurement tab in table
            $('#hAssaysMName').removeClass();
            $('#studyGraph').removeClass('active');
            $(this).addClass('active');
            $('#assaysSection').css('display', 'block');
            $('#overviewSection').css('display', 'none');
            return false;
        });
    }
    ;
    //click handler for show assays with no measurements
    function show_assay_measurements() {
        $('#showNoMeasurements').click(function (event) {
            event.preventDefault();
            $(this).text() == "show only with measurements" ? show_hide() : show_int();
            return false;
        });
    }
    function show_int() {
        $('#showNoMeasurements').text("show only with measurements");
        //function to show assays with no measurements
        StudyD.showHideAssayRows(show_assay_no_measurements());
    }
    function show_hide() {
        $('#showNoMeasurements').text("show all");
        //function to show assays with measurements
        StudyD.showHideAssayRows(StudyD.progressiveFilteringWidget.filteredAssayIDs);
    }
    function show_assay_no_measurements() {
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
            if (!assay || !assay.active || assay.count === undefined)
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
        this.queueMainGraphRemake(false);
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
    //this function shows and hides rows based on filtered data.
    function showHideAssayRows(progressiveFilteringMeasurements) {
        var assays = _.keys(EDDData.Assays);
        var hideArray = _.filter(assays, function (el) {
            return !progressiveFilteringMeasurements.includes(parseInt(el));
        });
        var showArray = _.filter(assays, function (el) {
            return progressiveFilteringMeasurements.includes(parseInt(el));
        });
        //hide elements not in progressive filtering measurements
        _.each(hideArray, function (assayId) {
            $("input[value='" + assayId + "']").parents('tr').hide();
        });
        //show elements in progressive filtering measurements
        _.each(showArray, function (assayId) {
            //if the row does not exist, reset table 
            if ($("input[value='" + assayId + "']").parents('tr').length === 0) {
                StudyD.assaysDataGrids.triggerAssayRecordsRefresh();
            }
            $("input[value='" + assayId + "']").parents('tr').show();
        });
    }
    StudyD.showHideAssayRows = showHideAssayRows;
    function showAssaysWithNoMeasurements(allAssays) {
        var assays = _.keys(EDDData.Assays);
        //show elements in progressive filtering measurements
        _.each(assays, function (assayId) {
            //if the row does not exist, reset table
            if ($("input[value='" + assayId + "']").parents('tr').length === 0) {
                StudyD.assaysDataGrids.triggerAssayRecordsRefresh();
            }
            $("input[value='" + assayId + "']").parents('tr').show();
        });
    }
    StudyD.showAssaysWithNoMeasurements = showAssaysWithNoMeasurements;
    //convert post filtered measuremnts to array of assay ids
    function convertPostFilteringMeasurements(postFilteringMeasurements) {
        //array of assays
        var filteredAssayMeasurements = [];
        _.each(postFilteringMeasurements, function (meas) {
            filteredAssayMeasurements.push(EDDData.AssayMeasurements[meas].assay);
        });
        return filteredAssayMeasurements;
    }
    StudyD.convertPostFilteringMeasurements = convertPostFilteringMeasurements;
    function remakeMainGraphArea(force) {
        var _this = this;
        var postFilteringMeasurements, dataPointsDisplayed = 0, dataPointsTotal = 0, colorObj;
        if (!this.progressiveFilteringWidget.checkRedrawRequired(force)) {
            return;
        }
        // stop spinner
        $('#loadingDiv').hide();
        $('.blankSvg').hide();
        // remove disabled from table because measurements are now there
        $('#studyTable').removeClass('disabled');
        // remove SVG.
        this.mainGraphObject.clearAllSets();
        this.graphHelper = Object.create(GraphHelperMethods);
        colorObj = EDDData['color'];
        // Gives ids of lines to show.
        var dataSets = [], prev;
        postFilteringMeasurements = this.progressiveFilteringWidget.buildFilteredMeasurements();
        // show message that there's no data to display
        if (postFilteringMeasurements.length === 0) {
            $('.lineNoData').show();
        }
        else {
            $('.lineNoData').hide();
        }
        // store filtered data here.
        StudyD.progressiveFilteringWidget.filteredAssayIDs = StudyD.convertPostFilteringMeasurements(postFilteringMeasurements);
        // show hide filtered data on assay table.
        StudyD.showHideAssayRows(StudyD.progressiveFilteringWidget.filteredAssayIDs);
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
        var form = $('#assayMain');
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
        form = $('#assayMain');
        clearAssayForm();
        fillAssayForm(form, record);
        form.removeClass('off').dialog("open");
    }
    StudyD.editAssay = editAssay;
})(StudyD || (StudyD = {}));
;
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
        }
        catch (e) {
            console.log('Failed to execute records refresh: ' + e);
        }
    };
    return DataGridAssays;
}(AssayResults));
// The spec object that will be passed to DataGrid to create the Assays table(s)
var DataGridSpecAssays = (function (_super) {
    __extends(DataGridSpecAssays, _super);
    function DataGridSpecAssays(assayID) {
        _super.call(this);
        this.assayID = assayID;
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
    //pass in filtered ids. this.assayIDsInProtocol change to this.filteredIDsInTable
    DataGridSpecAssays.prototype.refreshIDList = function () {
        // Find out which protocols have assays with measurements - disabled or no
        this.filteredIdsInTable = [];
        this.filterIdsInTable(this.filteredIdsInTable, EDDData.Assays);
    };
    DataGridSpecAssays.prototype.filterIdsInTable = function (filteredTables, assays) {
        $.each(assays, function (assayId, assay) {
            var line;
            line = EDDData.Lines[assay.lid];
            // skip assays without a valid line or with a disabled line
            if (line && line.active) {
                filteredTables.push(assay.id);
            }
        });
    };
    // An array of unique identifiers, used to identify the records in the data set being displayed
    DataGridSpecAssays.prototype.getRecordIDs = function () {
        return this.filteredIdsInTable;
    };
    // This is an override.  Called when a data reset is triggered, but before the table rows are
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
        var section = $('#assaysSection');
        var table = $(document.createElement("table")).attr('id', 'assayTable');
        $(section).append(table);
        // Make sure the actions panel remains at the bottom.
        $('#assaysActionPanel').appendTo(table);
        return document.getElementById('assaysSection');
    };
    // Specification for the table as a whole
    DataGridSpecAssays.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('assays', {
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
        var protocolNaming = EDDData.Protocols[this.assayID[index].pid].name;
        var assay, line;
        if ((assay = EDDData.Assays[index])) {
            if ((line = EDDData.Lines[assay.lid])) {
                return [line.n, protocolNaming, assay.name].join('-').toUpperCase();
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
            return new DataGridHeaderSpec(2 + index, 'hAssaysMetaid' + id, {
                'name': mdType.name,
                'headerRow': 2,
                'size': 's',
                'sortBy': _this.makeMetaDataSortFunction(id),
                'sortAfter': 1
            });
        });
        this.graphAreaHeaderSpec = new DataGridHeaderSpec(8 + metaDataHeaders.length, 'hAssaysGraph', { 'colspan': 7 + metaDataHeaders.length });
        var leftSide = [
            new DataGridHeaderSpec(1, 'hAssaysName', {
                'name': 'Name',
                'headerRow': 2,
                'sortBy': this.loadAssayName
            })
        ];
        this.measuringTimesHeaderSpec = new DataGridHeaderSpec(5 + metaDataHeaders.length, 'hAssaysMTimes', { 'name': 'Measuring Times', 'headerRow': 2 });
        var rightSide = [
            new DataGridHeaderSpec(2 + metaDataHeaders.length, 'hAssaysMName', { 'name': 'Measurement', 'headerRow': 2 }),
            new DataGridHeaderSpec(3 + metaDataHeaders.length, 'hAssaysUnits', { 'name': 'Units', 'headerRow': 2 }),
            new DataGridHeaderSpec(4 + metaDataHeaders.length, 'hAssaysCount', { 'name': 'Count', 'headerRow': 2 }),
            this.measuringTimesHeaderSpec,
            new DataGridHeaderSpec(6 + metaDataHeaders.length, 'hAssaysExperimenter', {
                'name': 'Experimenter',
                'headerRow': 2,
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 1
            }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hAssaysModified', {
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
        // Set up jQuery modals
        $("#assayMain").dialog({ autoOpen: false });
        // TODO we probably don't want to special-case like this by name
        if (EDDData.Protocols[record.pid].name == "Transcriptomics") {
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
                'contentString': [line.name, EDDData.Protocols[record.pid].name, record.name].join('-')
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
        var _this = this;
        // Wire up the 'action panels' for the Assays sections
        var table = this.getTableElement();
        $(table).on('change', ':checkbox', function () { return StudyD.queueAssaysActionPanelShow(); });
        $(table).on('change', ':checkbox', function () { return _this.refreshIDList(); });
        if (this.undisclosedSectionDiv) {
            $(this.undisclosedSectionDiv).click(function () { return dataGrid.clickedDisclose(true); });
        }
        //on page load of data hide assays section
        $("input[name*='assaysSearch']").parents('thead').hide();
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
        this._createdElements = true;
    };
    DGDisabledAssaysWidget.prototype.applyFilterToIDs = function (rowIDs) {
        // If the box is checked, return the set of IDs unfiltered
        if (this.checkBoxElement.checked) {
            return rowIDs;
        }
        else {
            var filteredIDs = [];
            for (var r = 0; r < rowIDs.length; r++) {
                var id = rowIDs[r];
                // Here is the condition that determines whether the rows associated with this ID are
                // shown or hidden.
                if (EDDData.Assays[id].active) {
                    filteredIDs.push(id);
                }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktRGF0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlN0dWR5LURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0RBQW9EO0FBQ3BELHFEQUFxRDtBQUNyRCwrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLG9DQUFvQztBQUNwQyx5Q0FBeUM7QUFDekMsOENBQThDO0FBQzlDLDZDQUE2Qzs7Ozs7O0FBSTdDLElBQU8sTUFBTSxDQW1zRFo7QUFuc0RELFdBQU8sTUFBTSxFQUFDLENBQUM7SUFDWCxZQUFZLENBQUM7SUFFYixJQUFJLGVBQW1CLENBQUM7SUFJeEIsSUFBSSx1QkFBMkIsQ0FBQztJQUNoQyxJQUFJLDRCQUFnQyxDQUFDO0lBQ3JDLElBQUksNkJBQWlDLENBQUM7SUFDdEMsSUFBSSwwQkFBOEIsQ0FBQztJQVFuQyxtRUFBbUU7SUFDbkUsSUFBSSxtQkFBbUIsQ0FBQztJQWtCeEIsOENBQThDO0lBQzlDO1FBa0JJLDZEQUE2RDtRQUM3RCxvQ0FBWSxZQUFpQjtZQUV6QixJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztZQUNqQyxJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLHVCQUF1QixHQUFHLEtBQUssQ0FBQztZQUNyQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUM7WUFDL0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztZQUNsQyxJQUFJLENBQUMs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QUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxHQUFHLFlBQVksR0FBRyxHQUFHLENBQUM7UUFDckQsR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xGLElBQUksR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLEtBQUssR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxLQUFLLEdBQUcsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDM0UsaUJBQWlCO1FBQ2pCLEtBQUssR0FBRyxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pGLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBQ0QsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2YsQ0FBQyxDQUFDLFFBQVEs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OEZBQThGO0FBQzlGLHNFQUFzRTtBQUN0RTtJQUFtQyx3Q0FBYztJQUk3Qyw4QkFBWSxtQkFBdUIsRUFBRSxZQUFnQixFQUFFLFdBQWtCLEVBQUUsSUFBVyxFQUM5RSxTQUFpQjtRQUNyQixrQkFBTSxtQkFBbUIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRUQsMkZBQTJGO0lBQzNGLGtEQUFrRDtJQUNsRCw2Q0FBYyxHQUFkLFVBQWUsUUFBWTtRQUN2QixnQkFBSyxDQUFDLGNBQWMsWUFBQyxRQUFRLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRCwrRkFBK0Y7SUFDL0YsNEVBQTRFO0lBQzVFLDZDQUFjLEdBQWQsVUFBZSxTQUFhLEVBQUUsUUFBWTtRQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDMUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUNMLDJCQUFDO0FBQUQsQ0FBQyxBQXhCRCxDQUFtQyxjQUFjLEdBd0JoRDtBQUVELHVFQUF1RTtBQUN2RSxDQUFDLENBQUMsY0FBTSxPQUFBLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBbEIsQ0FBa0IsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gRmlsZSBsYXN0IG1vZGlmaWVkIG9uOiBXZWQgRGVjIDIxIDIwMTYgMTQ6NTM6MzUgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiU3R1ZHlHcmFwaGluZy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiR3JhcGhIZWxwZXJNZXRob2RzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL2QzL2QzLmQudHNcIi8+XG5cbmRlY2xhcmUgdmFyIEVERERhdGE6RURERGF0YTtcblxubW9kdWxlIFN0dWR5RCB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIG1haW5HcmFwaE9iamVjdDphbnk7XG5cbiAgICBleHBvcnQgdmFyIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0OiBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldDtcblxuICAgIHZhciBtYWluR3JhcGhSZWZyZXNoVGltZXJJRDphbnk7XG4gICAgdmFyIGxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXI6YW55O1xuICAgIHZhciBhc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcjphbnk7XG4gICAgdmFyIHByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50OmFueTtcblxuICAgIC8vIFdlIGNhbiBoYXZlIGEgdmFsaWQgbWV0YWJvbGljIG1hcCBidXQgbm8gdmFsaWQgYmlvbWFzcyBjYWxjdWxhdGlvbi5cbiAgICAvLyBJZiB0aGV5IHRyeSB0byBzaG93IGNhcmJvbiBiYWxhbmNlIGluIHRoYXQgY2FzZSwgd2UnbGwgYnJpbmcgdXAgdGhlIFVJIHRvXG4gICAgLy8gY2FsY3VsYXRlIGJpb21hc3MgZm9yIHRoZSBzcGVjaWZpZWQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcElEOmFueTtcbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcE5hbWU6YW55O1xuXG4gICAgLy8gVGFibGUgc3BlYyBhbmQgdGFibGUgb2JqZWN0cywgb25lIGVhY2ggcGVyIFByb3RvY29sLCBmb3IgQXNzYXlzLlxuICAgIHZhciBhc3NheXNEYXRhR3JpZFNwZWNzO1xuICAgIGV4cG9ydCB2YXIgYXNzYXlzRGF0YUdyaWRzO1xuXG4gICAgLy8gVXRpbGl0eSBpbnRlcmZhY2UgdXNlZCBieSBHZW5lcmljRmlsdGVyU2VjdGlvbiN1cGRhdGVVbmlxdWVJbmRleGVzSGFzaFxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUlEIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXI7XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUxpc3Qge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcltdO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFVuaXF1ZUlEVG9WYWx1ZSB7XG4gICAgICAgIFtpbmRleDogbnVtYmVyXTogc3RyaW5nO1xuICAgIH1cbiAgICAvLyBVc2VkIGluIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0I3ByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uXG4gICAgZXhwb3J0IGludGVyZmFjZSBSZWNvcmRJRFRvQm9vbGVhbiB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogYm9vbGVhbjtcbiAgICB9XG5cbiAgICAvLyBGb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIG9uIHRoZSBtYWluIGdyYXBoXG4gICAgZXhwb3J0IGNsYXNzIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0IHtcblxuICAgICAgICBhbGxGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBhc3NheUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGtlZXAgYSBzZXBhcmF0ZSBmaWx0ZXIgbGlzdCBmb3IgZWFjaCB0eXBlLlxuICAgICAgICBtZXRhYm9saXRlRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgcHJvdGVpbkZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGdlbmVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBtZWFzdXJlbWVudEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIG1ldGFib2xpdGVEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBwcm90ZWluRGF0YVByb2Nlc3NlZDogYm9vbGVhbjtcbiAgICAgICAgZ2VuZURhdGFQcm9jZXNzZWQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVyaWNEYXRhUHJvY2Vzc2VkOiBib29sZWFuO1xuICAgICAgICBmaWx0ZXJUYWJsZUpROiBKUXVlcnk7XG4gICAgICAgIHN0dWR5RE9iamVjdDogYW55O1xuICAgICAgICBtYWluR3JhcGhPYmplY3Q6IGFueTtcbiAgICAgICAgZmlsdGVyZWRBc3NheUlEczogYW55O1xuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGluaXRpYWxpemUgZWFjaCBmaWx0ZXIgbGlzdC5cbiAgICAgICAgY29uc3RydWN0b3Ioc3R1ZHlET2JqZWN0OiBhbnkpIHtcblxuICAgICAgICAgICAgdGhpcy5zdHVkeURPYmplY3QgPSBzdHVkeURPYmplY3Q7XG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByb2Nlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5nZW5lRGF0YVByb2Nlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5nZW5lcmljRGF0YVByb2Nlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlYWQgdGhyb3VnaCB0aGUgTGluZXMsIEFzc2F5cywgYW5kIEFzc2F5TWVhc3VyZW1lbnRzIHN0cnVjdHVyZXMgdG8gbGVhcm4gd2hhdCB0eXBlcyBhcmUgcHJlc2VudCxcbiAgICAgICAgLy8gdGhlbiBpbnN0YW50aWF0ZSB0aGUgcmVsZXZhbnQgc3ViY2xhc3NlcyBvZiBHZW5lcmljRmlsdGVyU2VjdGlvbiwgdG8gY3JlYXRlIGEgc2VyaWVzIG9mXG4gICAgICAgIC8vIGNvbHVtbnMgZm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiB1bmRlciB0aGUgbWFpbiBncmFwaCBvbiB0aGUgcGFnZS5cbiAgICAgICAgLy8gVGhpcyBtdXN0IGJlIG91dHNpZGUgdGhlIGNvbnN0cnVjdG9yIGJlY2F1c2UgRURERGF0YS5MaW5lcyBhbmQgRURERGF0YS5Bc3NheXMgYXJlIG5vdCBpbW1lZGlhdGVseSBhdmFpbGFibGVcbiAgICAgICAgLy8gb24gcGFnZSBsb2FkLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBjcmVhdGUgYW5kIGFkZCByZWxldmFudCBmaWx0ZXJzIGZvciBlYWNoIGdyb3VwLlxuICAgICAgICBwcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIHNlZW5JbkxpbmVzSGFzaDogUmVjb3JkSURUb0Jvb2xlYW4gPSB7fTtcbiAgICAgICAgICAgIHZhciBzZWVuSW5Bc3NheXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIGFJRHNUb1VzZTogc3RyaW5nW10gPSBbXTtcblxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZmlsdGVyVGFibGUnKTtcbiAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLmFwcGVuZCh0aGlzLmZpbHRlclRhYmxlSlEpO1xuXG4gICAgICAgICAgICAvLyBGaXJzdCBkbyBzb21lIGJhc2ljIHNhbml0eSBmaWx0ZXJpbmcgb24gdGhlIGxpc3RcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQ6IHN0cmluZywgYXNzYXk6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlIHx8ICFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS5tZXRhIHx8IFtdLCAobWV0YWRhdGFJZCkgPT4geyBzZWVuSW5Bc3NheXNIYXNoW21ldGFkYXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGxpbmUubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluTGluZXNIYXNoW21ldGFkYXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgICAgICAgICAgYUlEc1RvVXNlLnB1c2goYXNzYXlJZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGZpbHRlcnMgb24gYXNzYXkgdGFibGVzXG4gICAgICAgICAgICAvLyBUT0RPIG1lZGlhIGlzIG5vdyBhIG1ldGFkYXRhIHR5cGUsIHN0cmFpbiBhbmQgY2FyYm9uIHNvdXJjZSBzaG91bGQgYmUgdG9vXG4gICAgICAgICAgICB2YXIgYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgUHJvdG9jb2xGaWx0ZXJTZWN0aW9uKCkpOyAvLyBQcm90b2NvbFxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFN0cmFpbkZpbHRlclNlY3Rpb24oKSk7IC8vIGZpcnN0IGNvbHVtbiBpbiBmaWx0ZXJpbmcgc2VjdGlvblxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IExpbmVOYW1lRmlsdGVyU2VjdGlvbigpKTsgLy8gTElORVxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IENhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IEFzc2F5U3VmZml4RmlsdGVyU2VjdGlvbigpKTsgLy9Bc3Nhc3kgc3VmZml4XG4gICAgICAgICAgICAvLyBjb252ZXJ0IHNlZW4gbWV0YWRhdGEgSURzIHRvIEZpbHRlclNlY3Rpb24gb2JqZWN0cywgYW5kIHB1c2ggdG8gZW5kIG9mIGFzc2F5RmlsdGVyc1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2guYXBwbHkoYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgICQubWFwKHNlZW5JbkFzc2F5c0hhc2gsIChfLCBpZDogc3RyaW5nKSA9PiBuZXcgQXNzYXlNZXRhRGF0YUZpbHRlclNlY3Rpb24oaWQpKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaC5hcHBseShhc3NheUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgJC5tYXAoc2VlbkluTGluZXNIYXNoLCAoXywgaWQ6IHN0cmluZykgPT4gbmV3IExpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24oaWQpKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMucHVzaChuZXcgUHJvdGVpbkZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMucHVzaChuZXcgR2VuZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5wdXNoKG5ldyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIC8vIEFsbCBmaWx0ZXIgc2VjdGlvbnMgYXJlIGNvbnN0cnVjdGVkOyBub3cgbmVlZCB0byBjYWxsIGNvbmZpZ3VyZSgpIG9uIGFsbFxuICAgICAgICAgICAgdGhpcy5hbGxGaWx0ZXJzID0gW10uY29uY2F0KFxuICAgICAgICAgICAgICAgIGFzc2F5RmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyk7XG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMuZm9yRWFjaCgoc2VjdGlvbikgPT4gc2VjdGlvbi5jb25maWd1cmUoKSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGNhbiBpbml0aWFsaXplIGFsbCB0aGUgQXNzYXktIGFuZCBMaW5lLWxldmVsIGZpbHRlcnMgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gYXNzYXlGaWx0ZXJzO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLmZvckVhY2goKGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlci5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoYUlEc1RvVXNlKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVGaWx0ZXJpbmdTZWN0aW9uKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCBmaWx0ZXJzIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiwgYW5kIGFkZCBpbiB0aGUgb25lcyB0aGF0XG4gICAgICAgIC8vIGNsYWltIHRvIGJlIFwidXNlZnVsXCIuXG4gICAgICAgIHJlcG9wdWxhdGVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGRhcms6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYWxsRmlsdGVycywgKGksIHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh3aWRnZXQuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuYWRkVG9QYXJlbnQodGhpcy5maWx0ZXJUYWJsZUpRWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFwcGx5QmFja2dyb3VuZFN0eWxlKGRhcmspO1xuICAgICAgICAgICAgICAgICAgICBkYXJrID0gIWRhcms7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gR2l2ZW4gYSBzZXQgb2YgbWVhc3VyZW1lbnQgcmVjb3JkcyBhbmQgYSBkaWN0aW9uYXJ5IG9mIGNvcnJlc3BvbmRpbmcgdHlwZXNcbiAgICAgICAgLy8gKHBhc3NlZCBkb3duIGZyb20gdGhlIHNlcnZlciBhcyBhIHJlc3VsdCBvZiBhIGRhdGEgcmVxdWVzdCksIHNvcnQgdGhlbSBpbnRvXG4gICAgICAgIC8vIHRoZWlyIHZhcmlvdXMgY2F0ZWdvcmllcywgdGhlbiBwYXNzIGVhY2ggY2F0ZWdvcnkgdG8gdGhlaXIgcmVsZXZhbnQgZmlsdGVyIG9iamVjdHNcbiAgICAgICAgLy8gKHBvc3NpYmx5IGFkZGluZyB0byB0aGUgdmFsdWVzIGluIHRoZSBmaWx0ZXIpIGFuZCByZWZyZXNoIHRoZSBVSSBmb3IgZWFjaCBmaWx0ZXIuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIHByb2Nlc3MgZWFjaCBncm91cCBzZXBhcmF0ZWx5IGhlcmUuXG4gICAgICAgIHByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhtZWFzdXJlcywgdHlwZXMpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIHByb2Nlc3M6IChpZHM6IHN0cmluZ1tdLCBpOiBudW1iZXIsIHdpZGdldDogR2VuZXJpY0ZpbHRlclNlY3Rpb24pID0+IHZvaWQ7XG5cbiAgICAgICAgICAgIHZhciBmaWx0ZXJJZHMgPSB7ICdtJzogW10sICdwJzogW10sICdnJzogW10sICdfJzogW10gfTtcbiAgICAgICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHMuIG1lYXN1cmVzIGNvcnJlc3BvbmRzIHRvIEFzc2F5TWVhc3VyZW1lbnRzXG4gICAgICAgICAgICAkLmVhY2gobWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIG10eXBlID0gdHlwZXNbbWVhc3VyZW1lbnQudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLm0ucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcklkcy5wLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAnZycpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgZ2VuZSAvIHRyYW5zY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVySWRzLmcucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcklkcy5fLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBwcm9jZXNzID0gKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzKTtcbiAgICAgICAgICAgICAgICB3aWRnZXQucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMubS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZXRhYm9saXRlRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBmaWx0ZXJJZHMubSkpO1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcm9jZXNzZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZpbHRlcklkcy5wLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByb3RlaW5GaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGZpbHRlcklkcy5wKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByb2Nlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZmlsdGVySWRzLmcubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuZ2VuZUZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLmcpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWx0ZXJJZHMuXy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZWFzdXJlbWVudEZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZmlsdGVySWRzLl8pKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJvY2Vzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUZpbHRlcmluZ1NlY3Rpb24oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ1aWxkIGEgbGlzdCBvZiBhbGwgdGhlIG5vbi1kaXNhYmxlZCBBc3NheSBJRHMgaW4gdGhlIFN0dWR5LlxuICAgICAgICBidWlsZEFzc2F5SURTZXQoKTogYW55W10ge1xuICAgICAgICAgICAgdmFyIGFzc2F5SWRzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZCwgYXNzYXkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSB8fCAhbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICBhc3NheUlkcy5wdXNoKGFzc2F5SWQpO1xuXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBhc3NheUlkcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN0YXJ0aW5nIHdpdGggYSBsaXN0IG9mIGFsbCB0aGUgbm9uLWRpc2FibGVkIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHksIHdlIGxvb3AgaXQgdGhyb3VnaCB0aGVcbiAgICAgICAgLy8gTGluZSBhbmQgQXNzYXktbGV2ZWwgZmlsdGVycywgY2F1c2luZyB0aGUgZmlsdGVycyB0byByZWZyZXNoIHRoZWlyIFVJLCBuYXJyb3dpbmcgdGhlIHNldCBkb3duLlxuICAgICAgICAvLyBXZSByZXNvbHZlIHRoZSByZXN1bHRpbmcgc2V0IG9mIEFzc2F5IElEcyBpbnRvIG1lYXN1cmVtZW50IElEcywgdGhlbiBwYXNzIHRoZW0gb24gdG8gdGhlXG4gICAgICAgIC8vIG1lYXN1cmVtZW50LWxldmVsIGZpbHRlcnMuICBJbiB0aGUgZW5kIHdlIHJldHVybiBhIHNldCBvZiBtZWFzdXJlbWVudCBJRHMgcmVwcmVzZW50aW5nIHRoZVxuICAgICAgICAvLyBlbmQgcmVzdWx0IG9mIGFsbCB0aGUgZmlsdGVycywgc3VpdGFibGUgZm9yIHBhc3NpbmcgdG8gdGhlIGdyYXBoaW5nIGZ1bmN0aW9ucy5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gcHJvY2VzcyBlYWNoIGdyb3VwIHNlcGFyYXRlbHkgaGVyZS5cbiAgICAgICAgYnVpbGRGaWx0ZXJlZE1lYXN1cmVtZW50cygpOiBhbnlbXSB7XG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBc3NheUlkcyA9IHRoaXMuYnVpbGRBc3NheUlEU2V0KCk7XG5cbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFzc2F5RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkQXNzYXlJZHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhmaWx0ZXJlZEFzc2F5SWRzKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnRJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goZmlsdGVyZWRBc3NheUlkcywgKGksIGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICAgICAkLm1lcmdlKG1lYXN1cmVtZW50SWRzLCBhc3NheS5tZWFzdXJlcyB8fCBbXSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2Ugc3RhcnQgb3V0IHdpdGggZm91ciByZWZlcmVuY2VzIHRvIHRoZSBhcnJheSBvZiBhdmFpbGFibGUgbWVhc3VyZW1lbnQgSURzLCBvbmUgZm9yIGVhY2ggbWFqb3IgY2F0ZWdvcnkuXG4gICAgICAgICAgICAvLyBFYWNoIG9mIHRoZXNlIHdpbGwgYmVjb21lIGl0cyBvd24gYXJyYXkgaW4gdHVybiBhcyB3ZSBuYXJyb3cgaXQgZG93bi5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgdG8gcHJldmVudCBhIHN1Yi1zZWxlY3Rpb24gaW4gb25lIGNhdGVnb3J5IGZyb20gb3ZlcnJpZGluZyBhIHN1Yi1zZWxlY3Rpb24gaW4gdGhlIG90aGVycy5cblxuICAgICAgICAgICAgdmFyIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBwcm90ZWluTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcblxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdlIG9ubHkgdHJ5IHRvIGZpbHRlciBpZiB3ZSBnb3QgbWVhc3VyZW1lbnRzIHRoYXQgYXBwbHkgdG8gdGhlIHdpZGdldCB0eXBlc1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZXRhYm9saXRlRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhtZXRhYm9saXRlTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RlaW5EYXRhUHJvY2Vzc2VkKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdGVpbk1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKHByb3RlaW5NZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2VuZURhdGFQcm9jZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZU1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lcmljRGF0YVByb2Nlc3NlZCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lcmljTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZXJpY01lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9uY2Ugd2UndmUgZmluaXNoZWQgd2l0aCB0aGUgZmlsdGVyaW5nLCB3ZSB3YW50IHRvIHNlZSBpZiBhbnkgc3ViLXNlbGVjdGlvbnMgaGF2ZSBiZWVuIG1hZGUgYWNyb3NzXG4gICAgICAgICAgICAvLyBhbnkgb2YgdGhlIGNhdGVnb3JpZXMsIGFuZCBpZiBzbywgbWVyZ2UgdGhvc2Ugc3ViLXNlbGVjdGlvbnMgaW50byBvbmUuXG5cbiAgICAgICAgICAgIC8vIFRoZSBpZGVhIGlzLCB3ZSBkaXNwbGF5IGV2ZXJ5dGhpbmcgdW50aWwgdGhlIHVzZXIgbWFrZXMgYSBzZWxlY3Rpb24gaW4gb25lIG9yIG1vcmUgb2YgdGhlIG1haW4gY2F0ZWdvcmllcyxcbiAgICAgICAgICAgIC8vIHRoZW4gZHJvcCBldmVyeXRoaW5nIGZyb20gdGhlIGNhdGVnb3JpZXMgdGhhdCBjb250YWluIG5vIHNlbGVjdGlvbnMuXG5cbiAgICAgICAgICAgIC8vIEFuIGV4YW1wbGUgc2NlbmFyaW8gd2lsbCBleHBsYWluIHdoeSB0aGlzIGlzIGltcG9ydGFudDpcblxuICAgICAgICAgICAgLy8gU2F5IGEgdXNlciBpcyBwcmVzZW50ZWQgd2l0aCB0d28gY2F0ZWdvcmllcywgTWV0YWJvbGl0ZSBhbmQgTWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAvLyBNZXRhYm9saXRlIGhhcyBjcml0ZXJpYSAnQWNldGF0ZScgYW5kICdFdGhhbm9sJyBhdmFpbGFibGUuXG4gICAgICAgICAgICAvLyBNZWFzdXJlbWVudCBoYXMgb25seSBvbmUgY3JpdGVyaWEgYXZhaWxhYmxlLCAnT3B0aWNhbCBEZW5zaXR5Jy5cbiAgICAgICAgICAgIC8vIEJ5IGRlZmF1bHQsIEFjZXRhdGUsIEV0aGFub2wsIGFuZCBPcHRpY2FsIERlbnNpdHkgYXJlIGFsbCB1bmNoZWNrZWQsIGFuZCBhbGwgdmlzaWJsZSBvbiB0aGUgZ3JhcGguXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gJ3JldHVybiBtZWFzdXJlbWVudHMnIGJlbG93LlxuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjaGVja3MgJ0FjZXRhdGUnLCB0aGV5IGV4cGVjdCBvbmx5IEFjZXRhdGUgdG8gYmUgZGlzcGxheWVkLCBldmVuIHRob3VnaCBubyBjaGFuZ2UgaGFzIGJlZW4gbWFkZSB0b1xuICAgICAgICAgICAgLy8gdGhlIE1lYXN1cmVtZW50IHNlY3Rpb24gd2hlcmUgT3B0aWNhbCBEZW5zaXR5IGlzIGxpc3RlZC5cbiAgICAgICAgICAgIC8vIEluIHRoZSBjb2RlIGJlbG93LCBieSB0ZXN0aW5nIGZvciBhbnkgY2hlY2tlZCBib3hlcyBpbiB0aGUgbWV0YWJvbGl0ZUZpbHRlcnMgZmlsdGVycyxcbiAgICAgICAgICAgIC8vIHdlIHJlYWxpemUgdGhhdCB0aGUgc2VsZWN0aW9uIGhhcyBiZWVuIG5hcnJvd2VkIGRvd24sIHNvIHdlIGFwcGVuZCB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMgb250byBkU00uXG4gICAgICAgICAgICAvLyBUaGVuIHdoZW4gd2UgY2hlY2sgdGhlIG1lYXN1cmVtZW50RmlsdGVycyBmaWx0ZXJzLCB3ZSBzZWUgdGhhdCB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiBoYXNcbiAgICAgICAgICAgIC8vIG5vdCBuYXJyb3dlZCBkb3duIGl0cyBzZXQgb2YgbWVhc3VyZW1lbnRzLCBzbyB3ZSBza2lwIGFwcGVuZGluZyB0aG9zZSB0byBkU00uXG4gICAgICAgICAgICAvLyBUaGUgZW5kIHJlc3VsdCBpcyBvbmx5IHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cy5cblxuICAgICAgICAgICAgLy8gVGhlbiBzdXBwb3NlIHRoZSB1c2VyIGNoZWNrcyAnT3B0aWNhbCBEZW5zaXR5JywgaW50ZW5kaW5nIHRvIGNvbXBhcmUgQWNldGF0ZSBkaXJlY3RseSBhZ2FpbnN0IE9wdGljYWwgRGVuc2l0eS5cbiAgICAgICAgICAgIC8vIFNpbmNlIG1lYXN1cmVtZW50RmlsdGVycyBub3cgaGFzIGNoZWNrZWQgYm94ZXMsIHdlIHB1c2ggaXRzIG1lYXN1cmVtZW50cyBvbnRvIGRTTSxcbiAgICAgICAgICAgIC8vIHdoZXJlIGl0IGNvbWJpbmVzIHdpdGggdGhlIEFjZXRhdGUuXG5cbiAgICAgICAgICAgIHZhciBhbnlDaGVja2VkID0gKGZpbHRlcjogR2VuZXJpY0ZpbHRlclNlY3Rpb24pOiBib29sZWFuID0+IHsgcmV0dXJuIGZpbHRlci5hbnlDaGVja2JveGVzQ2hlY2tlZDsgfTtcblxuICAgICAgICAgICAgdmFyIGRTTTogYW55W10gPSBbXTsgICAgLy8gXCJEZWxpYmVyYXRlbHkgc2VsZWN0ZWQgbWVhc3VyZW1lbnRzXCJcbiAgICAgICAgICAgIGlmICggdGhpcy5tZXRhYm9saXRlRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQobWV0YWJvbGl0ZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgdGhpcy5wcm90ZWluRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQocHJvdGVpbk1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgICAgdGhpcy5nZW5lRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZXJpY01lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmIChkU00ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRTTTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtZWFzdXJlbWVudElkcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlZHJhdyBncmFwaCB3aXRoIG5ldyBtZWFzdXJlbWVudCB0eXBlcy5cbiAgICAgICAgY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZT86IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICAgICAgICAgIHZhciByZWRyYXc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgIC8vIGRvIG5vdCByZWRyYXcgaWYgZ3JhcGggaXMgbm90IGluaXRpYWxpemVkIHlldFxuICAgICAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVkcmF3ID0gISFmb3JjZTtcbiAgICAgICAgICAgICAgICAvLyBXYWxrIGRvd24gdGhlIGZpbHRlciB3aWRnZXQgbGlzdC4gIElmIHdlIGVuY291bnRlciBvbmUgd2hvc2UgY29sbGVjdGl2ZSBjaGVja2JveFxuICAgICAgICAgICAgICAgIC8vIHN0YXRlIGhhcyBjaGFuZ2VkIHNpbmNlIHdlIGxhc3QgbWFkZSB0aGlzIHdhbGssIHRoZW4gYSByZWRyYXcgaXMgcmVxdWlyZWQuIE5vdGUgdGhhdFxuICAgICAgICAgICAgICAgIC8vIHdlIHNob3VsZCBub3Qgc2tpcCB0aGlzIGxvb3AsIGV2ZW4gaWYgd2UgYWxyZWFkeSBrbm93IGEgcmVkcmF3IGlzIHJlcXVpcmVkLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBjYWxsIHRvIGFueUNoZWNrYm94ZXNDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSBzZXRzIGludGVybmFsIHN0YXRlIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgICAgICAgICAvLyB3aWRnZXRzIHRoYXQgd2Ugd2lsbCB1c2UgbmV4dCB0aW1lIGFyb3VuZC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5hbGxGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWx0ZXIuYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZHJhdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZWRyYXc7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGdlbmVyaWMgdmVyc2lvbiBvZiBhIGZpbHRlcmluZyBjb2x1bW4gaW4gdGhlIGZpbHRlcmluZyBzZWN0aW9uIGJlbmVhdGggdGhlIGdyYXBoIGFyZWEgb24gdGhlIHBhZ2UsXG4gICAgLy8gbWVhbnQgdG8gYmUgc3ViY2xhc3NlZCBmb3Igc3BlY2lmaWMgY3JpdGVyaWEuXG4gICAgLy8gV2hlbiBpbml0aWFsaXplZCB3aXRoIGEgc2V0IG9mIHJlY29yZCBJRHMsIHRoZSBjb2x1bW4gaXMgZmlsbGVkIHdpdGggbGFiZWxlZCBjaGVja2JveGVzLCBvbmUgZm9yIGVhY2hcbiAgICAvLyB1bmlxdWUgdmFsdWUgb2YgdGhlIGdpdmVuIGNyaXRlcmlhIGVuY291bnRlcmVkIGluIHRoZSByZWNvcmRzLlxuICAgIC8vIER1cmluZyB1c2UsIGFub3RoZXIgc2V0IG9mIHJlY29yZCBJRHMgaXMgcGFzc2VkIGluLCBhbmQgaWYgYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQsIHRoZSBJRCBzZXQgaXNcbiAgICAvLyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgIC8vIENoZWNrYm94ZXMgd2hvc2UgdmFsdWVzIGFyZSBub3QgcmVwcmVzZW50ZWQgYW55d2hlcmUgaW4gdGhlIGdpdmVuIElEcyBhcmUgdGVtcG9yYXJpbHkgZGlzYWJsZWQsXG4gICAgLy8gdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdCBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLlxuICAgIC8vIFRoZSBmaWx0ZXJzIGFyZSBtZWFudCB0byBiZSBjYWxsZWQgaW4gc2VxdWVuY2UsIGZlZWRpbmcgZWFjaCByZXR1cm5lZCBJRCBzZXQgaW50byB0aGUgbmV4dCxcbiAgICAvLyBwcm9ncmVzc2l2ZWx5IG5hcnJvd2luZyBkb3duIHRoZSBlbmFibGVkIGNoZWNrYm94ZXMuXG4gICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gc3ViY2xhc3MgdGhpcyBmb3IgZWFjaCBncm91cCB0eXBlLlxuICAgIGV4cG9ydCBjbGFzcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgLy8gQSBkaWN0aW9uYXJ5IG9mIHRoZSB1bmlxdWUgdmFsdWVzIGZvdW5kIGZvciBmaWx0ZXJpbmcgYWdhaW5zdCwgYW5kIHRoZSBkaWN0aW9uYXJ5J3MgY29tcGxlbWVudC5cbiAgICAgICAgLy8gRWFjaCB1bmlxdWUgSUQgaXMgYW4gaW50ZWdlciwgYXNjZW5kaW5nIGZyb20gMSwgaW4gdGhlIG9yZGVyIHRoZSB2YWx1ZSB3YXMgZmlyc3QgZW5jb3VudGVyZWRcbiAgICAgICAgLy8gd2hlbiBleGFtaW5pbmcgdGhlIHJlY29yZCBkYXRhIGluIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoLlxuICAgICAgICB1bmlxdWVWYWx1ZXM6IFVuaXF1ZUlEVG9WYWx1ZTtcbiAgICAgICAgdW5pcXVlSW5kZXhlczogVmFsdWVUb1VuaXF1ZUlEO1xuICAgICAgICB1bmlxdWVJbmRleENvdW50ZXI6IG51bWJlcjtcblxuICAgICAgICAvLyBUaGUgc29ydGVkIG9yZGVyIG9mIHRoZSBsaXN0IG9mIHVuaXF1ZSB2YWx1ZXMgZm91bmQgaW4gdGhlIGZpbHRlclxuICAgICAgICB1bmlxdWVWYWx1ZXNPcmRlcjogbnVtYmVyW107XG5cbiAgICAgICAgLy8gQSBkaWN0aW9uYXJ5IHJlc29sdmluZyBhIHJlY29yZCBJRCAoYXNzYXkgSUQsIG1lYXN1cmVtZW50IElEKSB0byBhbiBhcnJheS4gRWFjaCBhcnJheVxuICAgICAgICAvLyBjb250YWlucyB0aGUgaW50ZWdlciBpZGVudGlmaWVycyBvZiB0aGUgdW5pcXVlIHZhbHVlcyB0aGF0IGFwcGx5IHRvIHRoYXQgcmVjb3JkLlxuICAgICAgICAvLyAoSXQncyByYXJlLCBidXQgdGhlcmUgY2FuIGFjdHVhbGx5IGJlIG1vcmUgdGhhbiBvbmUgY3JpdGVyaWEgdGhhdCBtYXRjaGVzIGEgZ2l2ZW4gSUQsXG4gICAgICAgIC8vICBmb3IgZXhhbXBsZSBhIExpbmUgd2l0aCB0d28gZmVlZHMgYXNzaWduZWQgdG8gaXQuKVxuICAgICAgICBmaWx0ZXJIYXNoOiBWYWx1ZVRvVW5pcXVlTGlzdDtcbiAgICAgICAgLy8gRGljdGlvbmFyeSByZXNvbHZpbmcgdGhlIGZpbHRlciB2YWx1ZSBpbnRlZ2VyIGlkZW50aWZpZXJzIHRvIEhUTUwgSW5wdXQgY2hlY2tib3hlcy5cbiAgICAgICAgY2hlY2tib3hlczoge1tpbmRleDogbnVtYmVyXTogSlF1ZXJ5fTtcbiAgICAgICAgLy8gRGljdGlvbmFyeSB1c2VkIHRvIGNvbXBhcmUgY2hlY2tib3hlcyB3aXRoIGEgcHJldmlvdXMgc3RhdGUgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYW5cbiAgICAgICAgLy8gdXBkYXRlIGlzIHJlcXVpcmVkLiBWYWx1ZXMgYXJlICdDJyBmb3IgY2hlY2tlZCwgJ1UnIGZvciB1bmNoZWNrZWQsIGFuZCAnTicgZm9yIG5vdFxuICAgICAgICAvLyBleGlzdGluZyBhdCB0aGUgdGltZS4gKCdOJyBjYW4gYmUgdXNlZnVsIHdoZW4gY2hlY2tib3hlcyBhcmUgcmVtb3ZlZCBmcm9tIGEgZmlsdGVyIGR1ZSB0b1xuICAgICAgICAvLyB0aGUgYmFjay1lbmQgZGF0YSBjaGFuZ2luZy4pXG4gICAgICAgIHByZXZpb3VzQ2hlY2tib3hTdGF0ZTogVW5pcXVlSURUb1ZhbHVlO1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHJlc29sdmluZyB0aGUgZmlsdGVyIHZhbHVlIGludGVnZXIgaWRlbnRpZmllcnMgdG8gSFRNTCB0YWJsZSByb3cgZWxlbWVudHMuXG4gICAgICAgIHRhYmxlUm93czoge1tpbmRleDogbnVtYmVyXTogSFRNTFRhYmxlUm93RWxlbWVudH07XG5cbiAgICAgICAgLy8gUmVmZXJlbmNlcyB0byBIVE1MIGVsZW1lbnRzIGNyZWF0ZWQgYnkgdGhlIGZpbHRlclxuICAgICAgICBmaWx0ZXJDb2x1bW5EaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBjbGVhckljb25zOiBKUXVlcnk7XG4gICAgICAgIHBsYWludGV4dFRpdGxlRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2VhcmNoQm94OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBzZWFyY2hCb3hUaXRsZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHNjcm9sbFpvbmVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBmaWx0ZXJpbmdUYWJsZTogSlF1ZXJ5O1xuICAgICAgICB0YWJsZUJvZHlFbGVtZW50OiBIVE1MVGFibGVFbGVtZW50O1xuXG4gICAgICAgIC8vIFNlYXJjaCBib3ggcmVsYXRlZFxuICAgICAgICB0eXBpbmdUaW1lb3V0OiBudW1iZXI7XG4gICAgICAgIHR5cGluZ0RlbGF5OiBudW1iZXI7XG4gICAgICAgIGN1cnJlbnRTZWFyY2hTZWxlY3Rpb246IHN0cmluZztcbiAgICAgICAgcHJldmlvdXNTZWFyY2hTZWxlY3Rpb246IHN0cmluZztcbiAgICAgICAgbWluQ2hhcnNUb1RyaWdnZXJTZWFyY2g6IG51bWJlcjtcblxuICAgICAgICBhbnlDaGVja2JveGVzQ2hlY2tlZDogYm9vbGVhbjtcblxuICAgICAgICBzZWN0aW9uVGl0bGU6IHN0cmluZztcbiAgICAgICAgc2VjdGlvblNob3J0TGFiZWw6IHN0cmluZztcblxuICAgICAgICAvLyBUT0RPOiBDb252ZXJ0IHRvIGEgcHJvdGVjdGVkIGNvbnN0cnVjdG9yISBUaGVuIHVzZSBhIGZhY3RvcnkgbWV0aG9kIHRvIGNyZWF0ZSBvYmplY3RzXG4gICAgICAgIC8vICAgIHdpdGggY29uZmlndXJlKCkgYWxyZWFkeSBjYWxsZWQuIFR5cGVzY3JpcHQgMS44IGRvZXMgbm90IHN1cHBvcnQgdmlzaWJpbGl0eVxuICAgICAgICAvLyAgICBtb2RpZmllcnMgb24gY29uc3RydWN0b3JzLCBzdXBwb3J0IGlzIGFkZGVkIGluIFR5cGVzY3JpcHQgMi4wXG4gICAgICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleENvdW50ZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IFtdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy50eXBpbmdEZWxheSA9IDMzMDsgICAgLy8gVE9ETzogTm90IGltcGxlbWVudGVkXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2ggPSAxO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uZmlndXJlKHRpdGxlOiBzdHJpbmc9J0dlbmVyaWMgRmlsdGVyJywgc2hvcnRMYWJlbDogc3RyaW5nPSdnZicpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gdGl0bGU7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gc2hvcnRMYWJlbDtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlQ29udGFpbmVyT2JqZWN0cygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ3JlYXRlIGFsbCB0aGUgY29udGFpbmVyIEhUTUwgb2JqZWN0c1xuICAgICAgICBjcmVhdGVDb250YWluZXJPYmplY3RzKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHNCb3hJRDogc3RyaW5nID0gJ2ZpbHRlcicgKyB0aGlzLnNlY3Rpb25TaG9ydExhYmVsICsgJ1NlYXJjaEJveCcsXG4gICAgICAgICAgICAgICAgc0JveDogSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyQ29sdW1uRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJDb2x1bW4nKVswXTtcbiAgICAgICAgICAgIHZhciB0ZXh0VGl0bGUgPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJUaXRsZScpLnRleHQodGhpcy5zZWN0aW9uVGl0bGUpO1xuICAgICAgICAgICAgdmFyIGNsZWFySWNvbiA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNsZWFySWNvbicpO1xuICAgICAgICAgICAgdGhpcy5wbGFpbnRleHRUaXRsZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVySGVhZCcpLmFwcGVuZChjbGVhckljb24pLmFwcGVuZCh0ZXh0VGl0bGUpWzBdO1xuXG4gICAgICAgICAgICAkKHNCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIikpXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xuICAgICAgICAgICAgICAgICAgICAnaWQnOiBzQm94SUQsXG4gICAgICAgICAgICAgICAgICAgICduYW1lJzogc0JveElELFxuICAgICAgICAgICAgICAgICAgICAncGxhY2Vob2xkZXInOiB0aGlzLnNlY3Rpb25UaXRsZSxcbiAgICAgICAgICAgICAgICAgICAgJ3NpemUnOiAxNFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc0JveC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dCcpOyAvLyBKUXVlcnkgLmF0dHIoKSBjYW5ub3Qgc2V0IHRoaXNcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoQm94ID0gc0JveDtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdHdvIGNsZWFyIGljY29ucyBmb3IgdGhlIHR3byB2ZXJzaW9ucyBvZiB0aGUgaGVhZGVyXG4gICAgICAgICAgICB2YXIgc2VhcmNoQ2xlYXJJY29uID0gJChcIjxzcGFuPlwiKS5hZGRDbGFzcygnZmlsdGVyQ2xlYXJJY29uJyk7XG4gICAgICAgICAgICB0aGlzLnNlYXJjaEJveFRpdGxlRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJIZWFkU2VhcmNoJykuYXBwZW5kKHNlYXJjaENsZWFySWNvbikuYXBwZW5kKHNCb3gpWzBdO1xuXG4gICAgICAgICAgICB0aGlzLmNsZWFySWNvbnMgPSBjbGVhckljb24uYWRkKHNlYXJjaENsZWFySWNvbik7ICAgIC8vIENvbnNvbGlkYXRlIHRoZSB0d28gSlF1ZXJ5IGVsZW1lbnRzIGludG8gb25lXG5cbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucy5vbignY2xpY2snLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBDaGFuZ2luZyB0aGUgY2hlY2tlZCBzdGF0dXMgd2lsbCBhdXRvbWF0aWNhbGx5IHRyaWdnZXIgYSByZWZyZXNoIGV2ZW50XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuY2hlY2tib3hlcyB8fCB7fSwgKGlkOiBudW1iZXIsIGNoZWNrYm94OiBKUXVlcnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tib3gucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWm9uZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFTY3JvbGxab25lJylbMF07XG4gICAgICAgICAgICB0aGlzLmZpbHRlcmluZ1RhYmxlID0gJChcIjx0YWJsZT5cIilcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2ZpbHRlckNyaXRlcmlhVGFibGUgZHJhZ2JveGVzJylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdjZWxscGFkZGluZyc6IDAsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kKHRoaXMudGFibGVCb2R5RWxlbWVudCA9IDxIVE1MVGFibGVFbGVtZW50PiQoXCI8dGJvZHk+XCIpWzBdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgdXNlZFZhbHVlczogVmFsdWVUb1VuaXF1ZUlELCBjclNldDogbnVtYmVyW10sIGNIYXNoOiBVbmlxdWVJRFRvVmFsdWUsXG4gICAgICAgICAgICAgICAgcHJldmlvdXNJZHM6IHN0cmluZ1tdO1xuICAgICAgICAgICAgLy8gY2FuIGdldCBJRHMgZnJvbSBtdWx0aXBsZSBhc3NheXMsIGZpcnN0IG1lcmdlIHdpdGggdGhpcy5maWx0ZXJIYXNoXG4gICAgICAgICAgICBwcmV2aW91c0lkcyA9ICQubWFwKHRoaXMuZmlsdGVySGFzaCB8fCB7fSwgKF8sIHByZXZpb3VzSWQ6IHN0cmluZykgPT4gcHJldmlvdXNJZCk7XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYWRkZWRJZDogc3RyaW5nKTogdm9pZCA9PiB7IHRoaXMuZmlsdGVySGFzaFthZGRlZElkXSA9IFtdOyB9KTtcbiAgICAgICAgICAgIGlkcyA9ICQubWFwKHRoaXMuZmlsdGVySGFzaCB8fCB7fSwgKF8sIHByZXZpb3VzSWQ6IHN0cmluZykgPT4gcHJldmlvdXNJZCk7XG4gICAgICAgICAgICAvLyBza2lwIG92ZXIgYnVpbGRpbmcgdW5pcXVlIHZhbHVlcyBhbmQgc29ydGluZyB3aGVuIG5vIG5ldyBJRHMgYWRkZWRcbiAgICAgICAgICAgIGlmIChpZHMubGVuZ3RoID4gcHJldmlvdXNJZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHMpO1xuICAgICAgICAgICAgICAgIGNyU2V0ID0gW107XG4gICAgICAgICAgICAgICAgY0hhc2ggPSB7fTtcbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgYSByZXZlcnNlZCBoYXNoIHNvIGtleXMgbWFwIHZhbHVlcyBhbmQgdmFsdWVzIG1hcCBrZXlzXG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMudW5pcXVlSW5kZXhlcywgKHZhbHVlOiBzdHJpbmcsIHVuaXF1ZUlEOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY0hhc2hbdW5pcXVlSURdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGNyU2V0LnB1c2godW5pcXVlSUQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIEFscGhhYmV0aWNhbGx5IHNvcnQgYW4gYXJyYXkgb2YgdGhlIGtleXMgYWNjb3JkaW5nIHRvIHZhbHVlc1xuICAgICAgICAgICAgICAgIGNyU2V0LnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIF9hOnN0cmluZyA9IGNIYXNoW2FdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBfYjpzdHJpbmcgPSBjSGFzaFtiXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gX2EgPCBfYiA/IC0xIDogX2EgPiBfYiA/IDEgOiAwO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzID0gY0hhc2g7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IGNyU2V0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSW4gdGhpcyBmdW5jdGlvbiBhcmUgcnVubmluZyB0aHJvdWdoIHRoZSBnaXZlbiBsaXN0IG9mIG1lYXN1cmVtZW50IElEcyBhbmQgZXhhbWluaW5nXG4gICAgICAgIC8vIHRoZWlyIHJlY29yZHMgYW5kIHJlbGF0ZWQgcmVjb3JkcywgbG9jYXRpbmcgdGhlIHBhcnRpY3VsYXIgZmllbGQgd2UgYXJlIGludGVyZXN0ZWQgaW4sXG4gICAgICAgIC8vIGFuZCBjcmVhdGluZyBhIGxpc3Qgb2YgYWxsIHRoZSB1bmlxdWUgdmFsdWVzIGZvciB0aGF0IGZpZWxkLiAgQXMgd2UgZ28sIHdlIG1hcmsgZWFjaFxuICAgICAgICAvLyB1bmlxdWUgdmFsdWUgd2l0aCBhbiBpbnRlZ2VyIFVJRCwgYW5kIGNvbnN0cnVjdCBhIGhhc2ggcmVzb2x2aW5nIGVhY2ggcmVjb3JkIHRvIG9uZSAob3JcbiAgICAgICAgLy8gcG9zc2libHkgbW9yZSkgb2YgdGhvc2UgaW50ZWdlciBVSURzLiAgVGhpcyBwcmVwYXJlcyB1cyBmb3IgcXVpY2sgZmlsdGVyaW5nIGxhdGVyIG9uLlxuICAgICAgICAvLyAoVGhpcyBnZW5lcmljIGZpbHRlciBkb2VzIG5vdGhpbmcsIHNvIHdlIGxlYXZlIHRoZXNlIHN0cnVjdHVyZXMgYmxhbmsuKVxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY29tZSB1cCB3aXRoIDIgb3IgbW9yZSBjcml0ZXJpYSwgdGhlcmUgaXMgbm8gcG9pbnQgaW4gZGlzcGxheWluZyB0aGUgZmlsdGVyLlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYWRkVG9QYXJlbnQocGFyZW50RGl2KTp2b2lkIHtcbiAgICAgICAgICAgIHBhcmVudERpdi5hcHBlbmRDaGlsZCh0aGlzLmZpbHRlckNvbHVtbkRpdik7XG4gICAgICAgIH1cblxuICAgICAgICBkZXRhY2goKTp2b2lkIHtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmRldGFjaCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgYXBwbHlCYWNrZ3JvdW5kU3R5bGUoZGFya2VyOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICAgICAgJCh0aGlzLmZpbHRlckNvbHVtbkRpdikucmVtb3ZlQ2xhc3MoZGFya2VyID8gJ3N0cmlwZVJvd0InIDogJ3N0cmlwZVJvd0EnKTtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmFkZENsYXNzKGRhcmtlciA/ICdzdHJpcGVSb3dBJyA6ICdzdHJpcGVSb3dCJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSdW5zIHRocm91Z2ggdGhlIHZhbHVlcyBpbiB1bmlxdWVWYWx1ZXNPcmRlciwgYWRkaW5nIGEgY2hlY2tib3ggYW5kIGxhYmVsIGZvciBlYWNoXG4gICAgICAgIC8vIGZpbHRlcmluZyB2YWx1ZSByZXByZXNlbnRlZC4gIElmIHRoZXJlIGFyZSBtb3JlIHRoYW4gMTUgdmFsdWVzLCB0aGUgZmlsdGVyIGdldHNcbiAgICAgICAgLy8gYSBzZWFyY2ggYm94IGFuZCBzY3JvbGxiYXIuXG4gICAgICAgIHBvcHVsYXRlVGFibGUoKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBmQ29sID0gJCh0aGlzLmZpbHRlckNvbHVtbkRpdik7XG4gICAgICAgICAgICBmQ29sLmNoaWxkcmVuKCkuZGV0YWNoKCk7XG4gICAgICAgICAgICAvLyBPbmx5IHVzZSB0aGUgc2Nyb2xsaW5nIGNvbnRhaW5lciBkaXYgaWYgdGhlIHNpemUgb2YgdGhlIGxpc3Qgd2FycmFudHMgaXQsIGJlY2F1c2VcbiAgICAgICAgICAgIC8vIHRoZSBzY3JvbGxpbmcgY29udGFpbmVyIGRpdiBkZWNsYXJlcyBhIGxhcmdlIHBhZGRpbmcgbWFyZ2luIGZvciB0aGUgc2Nyb2xsIGJhcixcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHBhZGRpbmcgbWFyZ2luIHdvdWxkIGJlIGFuIGVtcHR5IHdhc3RlIG9mIHNwYWNlIG90aGVyd2lzZS5cbiAgICAgICAgICAgIGlmICh0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDE1KSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5zZWFyY2hCb3hUaXRsZURpdikuYXBwZW5kKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICAgICAgLy8gQ2hhbmdlIHRoZSByZWZlcmVuY2Ugc28gd2UncmUgYWZmZWN0aW5nIHRoZSBpbm5lckhUTUwgb2YgdGhlIGNvcnJlY3QgZGl2IGxhdGVyIG9uXG4gICAgICAgICAgICAgICAgZkNvbCA9ICQodGhpcy5zY3JvbGxab25lRGl2KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5wbGFpbnRleHRUaXRsZURpdik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLmZpbHRlcmluZ1RhYmxlKTtcblxuICAgICAgICAgICAgdmFyIHRCb2R5ID0gdGhpcy50YWJsZUJvZHlFbGVtZW50O1xuICAgICAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgdGFibGUgY29udGVudHNcbiAgICAgICAgICAgICQodGhpcy50YWJsZUJvZHlFbGVtZW50KS5lbXB0eSgpO1xuXG4gICAgICAgICAgICB0aGlzLnRhYmxlUm93cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzID0ge307XG5cbiAgICAgICAgICAgIHZhciBncmFwaEhlbHBlciA9IE9iamVjdC5jcmVhdGUoR3JhcGhIZWxwZXJNZXRob2RzKTtcbiAgICAgICAgICAgIHZhciBjb2xvck9iaiA9IGdyYXBoSGVscGVyLnJlbmRlckNvbG9yKEVERERhdGEuTGluZXMpO1xuXG4gICAgICAgICAgICAvL2FkZCBjb2xvciBvYmogdG8gRURERGF0YVxuICAgICAgICAgICAgRURERGF0YVsnY29sb3InXSA9IGNvbG9yT2JqO1xuXG4gICAgICAgICAgICAvLyBsaW5lIGxhYmVsIGNvbG9yIGJhc2VkIG9uIGdyYXBoIGNvbG9yIG9mIGxpbmVcbiAgICAgICAgICAgIGlmICh0aGlzLnNlY3Rpb25UaXRsZSA9PT0gXCJMaW5lXCIpIHsgICAgLy8gVE9ETzogRmluZCBhIGJldHRlciB3YXkgdG8gaWRlbnRpZnkgdGhpcyBzZWN0aW9uXG4gICAgICAgICAgICAgICAgdmFyIGNvbG9yczphbnkgPSB7fTtcblxuICAgICAgICAgICAgICAgIC8vY3JlYXRlIG5ldyBjb2xvcnMgb2JqZWN0IHdpdGggbGluZSBuYW1lcyBhIGtleXMgYW5kIGNvbG9yIGhleCBhcyB2YWx1ZXNcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gRURERGF0YS5MaW5lcykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvcnNbRURERGF0YS5MaW5lc1trZXldLm5hbWVdID0gY29sb3JPYmpba2V5XVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgodW5pcXVlSWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjYm94TmFtZSwgY2VsbCwgcCwgcSwgcjtcbiAgICAgICAgICAgICAgICBjYm94TmFtZSA9IFsnZmlsdGVyJywgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCwgJ24nLCB1bmlxdWVJZCwgJ2Nib3gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlUm93c1t1bmlxdWVJZF0gPSA8SFRNTFRhYmxlUm93RWxlbWVudD50aGlzLnRhYmxlQm9keUVsZW1lbnQuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXS5pbnNlcnRDZWxsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzW3VuaXF1ZUlkXSA9ICQoXCI8aW5wdXQgdHlwZT0nY2hlY2tib3gnPlwiKVxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICduYW1lJzogY2JveE5hbWUsICdpZCc6IGNib3hOYW1lIH0pXG4gICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBFREREYXRhLkxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2tleV0ubmFtZSA9PSB0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgKEVERERhdGEuTGluZXNba2V5XVsnaWRlbnRpZmllciddID0gY2JveE5hbWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgY2JveE5hbWUpLnRleHQodGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKVxuICAgICAgICAgICAgICAgICAgICAuY3NzKCdmb250LXdlaWdodCcsICdCb2xkJykuYXBwZW5kVG8oY2VsbCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKCh1bmlxdWVJZDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjYm94TmFtZSwgY2VsbCwgcCwgcSwgcjtcbiAgICAgICAgICAgICAgICAgICAgY2JveE5hbWUgPSBbJ2ZpbHRlcicsIHRoaXMuc2VjdGlvblNob3J0TGFiZWwsICduJywgdW5pcXVlSWQsICdjYm94J10uam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXSA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGVCb2R5RWxlbWVudC5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMudGFibGVSb3dzW3VuaXF1ZUlkXS5pbnNlcnRDZWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlc1t1bmlxdWVJZF0gPSAkKFwiPGlucHV0IHR5cGU9J2NoZWNrYm94Jz5cIilcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ25hbWUnOiBjYm94TmFtZSwgJ2lkJzogY2JveE5hbWUgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcblxuICAgICAgICAgICAgICAgICAgICAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgY2JveE5hbWUpLnRleHQodGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVE9ETzogRHJhZyBzZWxlY3QgaXMgdHdpdGNoeSAtIGNsaWNraW5nIGEgdGFibGUgY2VsbCBiYWNrZ3JvdW5kIHNob3VsZCBjaGVjayB0aGUgYm94LFxuICAgICAgICAgICAgLy8gZXZlbiBpZiB0aGUgdXNlciBpc24ndCBoaXR0aW5nIHRoZSBsYWJlbCBvciB0aGUgY2hlY2tib3ggaXRzZWxmLlxuICAgICAgICAgICAgRHJhZ2JveGVzLmluaXRUYWJsZSh0aGlzLmZpbHRlcmluZ1RhYmxlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybnMgdHJ1ZSBpZiBhbnkgb2YgdGhlIGNoZWNrYm94ZXMgc2hvdyBhIGRpZmZlcmVudCBzdGF0ZSB0aGFuIHdoZW4gdGhpcyBmdW5jdGlvbiB3YXNcbiAgICAgICAgLy8gbGFzdCBjYWxsZWRcbiAgICAgICAgYW55Q2hlY2tib3hlc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgY3VycmVudENoZWNrYm94U3RhdGU6IFVuaXF1ZUlEVG9WYWx1ZSA9IHt9LFxuICAgICAgICAgICAgICAgIHY6IHN0cmluZyA9ICQodGhpcy5zZWFyY2hCb3gpLnZhbCgpO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuY2hlY2tib3hlcyB8fCB7fSwgKHVuaXF1ZUlkOiBudW1iZXIsIGNoZWNrYm94OiBKUXVlcnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudCwgcHJldmlvdXM7XG4gICAgICAgICAgICAgICAgLy8gXCJDXCIgLSBjaGVja2VkLCBcIlVcIiAtIHVuY2hlY2tlZCwgXCJOXCIgLSBkb2Vzbid0IGV4aXN0XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IChjaGVja2JveC5wcm9wKCdjaGVja2VkJykgJiYgIWNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJykpID8gJ0MnIDogJ1UnO1xuICAgICAgICAgICAgICAgIHByZXZpb3VzID0gdGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbdW5pcXVlSWRdIHx8ICdOJztcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCAhPT0gcHJldmlvdXMpIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ID09PSAnQycpIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDaGVja2JveFN0YXRlW3VuaXF1ZUlkXSA9IGN1cnJlbnQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucy50b2dnbGVDbGFzcygnZW5hYmxlZCcsIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQpO1xuXG4gICAgICAgICAgICB2ID0gdi50cmltKCk7ICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4gICAgICAgICAgICB2ID0gdi50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgdiA9IHYucmVwbGFjZSgvXFxzXFxzKi8sICcgJyk7IC8vIFJlcGxhY2UgaW50ZXJuYWwgd2hpdGVzcGFjZSB3aXRoIHNpbmdsZSBzcGFjZXNcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICBpZiAodiAhPT0gdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSB2O1xuICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlbid0IGRldGVjdGVkIGFueSBjaGFuZ2Ugc28gZmFyLCB0aGVyZSBpcyBvbmUgbW9yZSBhbmdsZSB0byBjb3ZlcjpcbiAgICAgICAgICAgICAgICAvLyBDaGVja2JveGVzIHRoYXQgdXNlZCB0byBleGlzdCwgYnV0IGhhdmUgc2luY2UgYmVlbiByZW1vdmVkIGZyb20gdGhlIHNldC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGUsIChyb3dJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudENoZWNrYm94U3RhdGVbcm93SWRdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IGN1cnJlbnRDaGVja2JveFN0YXRlO1xuICAgICAgICAgICAgcmV0dXJuIGNoYW5nZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUYWtlcyBhIHNldCBvZiByZWNvcmQgSURzLCBhbmQgaWYgYW55IGNoZWNrYm94ZXMgaW4gdGhlIGZpbHRlcidzIFVJIGFyZSBjaGVja2VkLFxuICAgICAgICAvLyB0aGUgSUQgc2V0IGlzIG5hcnJvd2VkIGRvd24gdG8gb25seSB0aG9zZSByZWNvcmRzIHRoYXQgY29udGFpbiB0aGUgY2hlY2tlZCB2YWx1ZXMuXG4gICAgICAgIC8vIENoZWNrYm94ZXMgd2hvc2UgdmFsdWVzIGFyZSBub3QgcmVwcmVzZW50ZWQgYW55d2hlcmUgaW4gdGhlIGdpdmVuIElEcyBhcmUgdGVtcG9yYXJpbHkgZGlzYWJsZWRcbiAgICAgICAgLy8gYW5kIHNvcnRlZCB0byB0aGUgYm90dG9tIG9mIHRoZSBsaXN0LCB2aXN1YWxseSBpbmRpY2F0aW5nIHRvIGEgdXNlciB0aGF0IHRob3NlIHZhbHVlcyBhcmUgbm90XG4gICAgICAgIC8vIGF2YWlsYWJsZSBmb3IgZnVydGhlciBmaWx0ZXJpbmcuXG4gICAgICAgIC8vIFRoZSBuYXJyb3dlZCBzZXQgb2YgSURzIGlzIHRoZW4gcmV0dXJuZWQsIGZvciB1c2UgYnkgdGhlIG5leHQgZmlsdGVyLlxuICAgICAgICBhcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGlkczphbnlbXSk6YW55IHtcblxuICAgICAgICAgICAgLy8gSWYgdGhlIGZpbHRlciBvbmx5IGNvbnRhaW5zIG9uZSBpdGVtLCBpdCdzIHBvaW50bGVzcyB0byBhcHBseSBpdC5cbiAgICAgICAgICAgIGlmICghdGhpcy5pc0ZpbHRlclVzZWZ1bCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlkcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGlkc1Bvc3RGaWx0ZXJpbmc6IGFueVtdO1xuXG4gICAgICAgICAgICB2YXIgdXNlU2VhcmNoQm94OmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgIHZhciBxdWVyeVN0cnMgPSBbXTtcblxuICAgICAgICAgICAgdmFyIHYgPSB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb247XG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYubGVuZ3RoID49IHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2gpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUgYXJlIG11bHRpcGxlIHdvcmRzLCB3ZSBtYXRjaCBlYWNoIHNlcGFyYXRlbHkuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgbm90IGF0dGVtcHQgdG8gbWF0Y2ggYWdhaW5zdCBlbXB0eSBzdHJpbmdzLCBzbyB3ZSBmaWx0ZXIgdGhvc2Ugb3V0IGlmXG4gICAgICAgICAgICAgICAgICAgIC8vIGFueSBzbGlwcGVkIHRocm91Z2guXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5U3RycyA9IHYuc3BsaXQoL1xccysvKS5maWx0ZXIoKG9uZSkgPT4geyByZXR1cm4gb25lLmxlbmd0aCA+IDA7IH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgdXNlciBtaWdodCBoYXZlIHBhc3RlZC90eXBlZCBvbmx5IHdoaXRlc3BhY2UsIHNvOlxuICAgICAgICAgICAgICAgICAgICBpZiAocXVlcnlTdHJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVzZVNlYXJjaEJveCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nID0ge307XG5cbiAgICAgICAgICAgIHZhciBpbmRleElzVmlzaWJsZSA9IChpbmRleCk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoOmJvb2xlYW4gPSB0cnVlLCB0ZXh0OnN0cmluZztcbiAgICAgICAgICAgICAgICBpZiAodXNlU2VhcmNoQm94KSB7XG4gICAgICAgICAgICAgICAgICAgIHRleHQgPSB0aGlzLnVuaXF1ZVZhbHVlc1tpbmRleF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2ggPSBxdWVyeVN0cnMuc29tZSgodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRleHQubGVuZ3RoID49IHYubGVuZ3RoICYmIHRleHQuaW5kZXhPZih2KSA+PSAwO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmdbaW5kZXhdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZVtpbmRleF0gPT09ICdDJykgfHwgIXRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlkc1Bvc3RGaWx0ZXJpbmcgPSBpZHMuZmlsdGVyKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmUgZmlsdGVyaW5nIGRhdGEgZm9yIHRoaXMgaWQsIHVzZSBpdC5cbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBkb24ndCwgdGhlIGlkIHByb2JhYmx5IGJlbG9uZ3MgdG8gc29tZSBvdGhlciBtZWFzdXJlbWVudCBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICAvLyBzbyB3ZSBpZ25vcmUgaXQuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlsdGVySGFzaFtpZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmlsdGVySGFzaFtpZF0uc29tZShpbmRleElzVmlzaWJsZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBkb2N1bWVudCBmcmFnbWVudCwgYW5kIGFjY3VtdWxhdGUgaW5zaWRlIGl0IGFsbCB0aGUgcm93cyB3ZSB3YW50IHRvIGRpc3BsYXksIGluIHNvcnRlZCBvcmRlci5cbiAgICAgICAgICAgIHZhciBmcmFnID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXG4gICAgICAgICAgICB2YXIgcm93c1RvQXBwZW5kID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmZvckVhY2goKGNySUQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2hlY2tib3g6IEpRdWVyeSA9IHRoaXMuY2hlY2tib3hlc1tjcklEXSxcbiAgICAgICAgICAgICAgICAgICAgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50ID0gdGhpcy50YWJsZVJvd3NbY3JJRF0sXG4gICAgICAgICAgICAgICAgICAgIHNob3c6IGJvb2xlYW4gPSAhIXZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmdbY3JJRF07XG4gICAgICAgICAgICAgICAgY2hlY2tib3gucHJvcCgnZGlzYWJsZWQnLCAhc2hvdylcbiAgICAgICAgICAgICAgICAkKHJvdykudG9nZ2xlQ2xhc3MoJ25vZGF0YScsICFzaG93KTtcbiAgICAgICAgICAgICAgICBpZiAoc2hvdykge1xuICAgICAgICAgICAgICAgICAgICBmcmFnLmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93c1RvQXBwZW5kLnB1c2gocm93KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIE5vdywgYXBwZW5kIGFsbCB0aGUgcm93cyB3ZSBkaXNhYmxlZCwgc28gdGhleSBnbyB0byB0aGUgYm90dG9tIG9mIHRoZSB0YWJsZVxuICAgICAgICAgICAgcm93c1RvQXBwZW5kLmZvckVhY2goKHJvdykgPT4gZnJhZy5hcHBlbmRDaGlsZChyb3cpKTtcblxuICAgICAgICAgICAgLy8gUmVtZW1iZXIgdGhhdCB3ZSBsYXN0IHNvcnRlZCBieSB0aGlzIGNvbHVtblxuICAgICAgICAgICAgdGhpcy50YWJsZUJvZHlFbGVtZW50LmFwcGVuZENoaWxkKGZyYWcpO1xuXG4gICAgICAgICAgICByZXR1cm4gaWRzUG9zdEZpbHRlcmluZztcbiAgICAgICAgfVxuXG4gICAgICAgIF9hc3NheUlkVG9Bc3NheShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9MaW5lKGFzc2F5SWQ6c3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKTtcbiAgICAgICAgICAgIGlmIChhc3NheSkgcmV0dXJuIEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgX2Fzc2F5SWRUb1Byb3RvY29sKGFzc2F5SWQ6c3RyaW5nKTogUHJvdG9jb2xSZWNvcmQge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldElkTWFwVG9WYWx1ZXMoKTooaWQ6c3RyaW5nKSA9PiBhbnlbXSB7XG4gICAgICAgICAgICByZXR1cm4gKCkgPT4gW107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgU3RyYWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ1N0cmFpbicsICdzdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgc3RyYWluIG5hbWVcbiAgICAgICAgICAgICAgICAobGluZS5zdHJhaW4gfHwgW10pLmZvckVhY2goKHN0cmFpbklkOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tzdHJhaW5JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdHJhaW4gJiYgc3RyYWluLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0NhcmJvbiBTb3VyY2UnLCAnY3MnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuY2FyYm9uIHx8IFtdKS5mb3JFYWNoKChjYXJib25JZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNyYyA9IEVERERhdGEuQ1NvdXJjZXNbY2FyYm9uSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3JjICYmIHNyYy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIENhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0xhYmVsaW5nJywgJ2wnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBsYWJlbGluZyBkZXNjcmlwdGlvblxuICAgICAgICAgICAgICAgIChsaW5lLmNhcmJvbiB8fCBbXSkuZm9yRWFjaCgoY2FyYm9uSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcmMgPSBFREREYXRhLkNTb3VyY2VzW2NhcmJvbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNyYyAmJiBzcmMubGFiZWxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU5hbWVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTGluZScsICdsbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBQcm90b2NvbEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdQcm90b2NvbCcsICdwJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvdG9jb2w6IFByb3RvY29sUmVjb3JkID0gdGhpcy5fYXNzYXlJZFRvUHJvdG9jb2woYXNzYXlJZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5U3VmZml4RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0Fzc2F5IFN1ZmZpeCcsICdhJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIG1ldGFEYXRhSUQ6c3RyaW5nO1xuICAgICAgICBwcmU6c3RyaW5nO1xuICAgICAgICBwb3N0OnN0cmluZztcblxuICAgICAgICBjb25zdHJ1Y3RvcihtZXRhRGF0YUlEOnN0cmluZykge1xuICAgICAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgICAgIHZhciBNRFQgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbbWV0YURhdGFJRF07XG4gICAgICAgICAgICB0aGlzLm1ldGFEYXRhSUQgPSBtZXRhRGF0YUlEO1xuICAgICAgICAgICAgdGhpcy5wcmUgPSBNRFQucHJlIHx8ICcnO1xuICAgICAgICAgICAgdGhpcy5wb3N0ID0gTURULnBvc3QgfHwgJyc7XG4gICAgICAgIH1cblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZShFREREYXRhLk1ldGFEYXRhVHlwZXNbdGhpcy5tZXRhRGF0YUlEXS5uYW1lLCAnbWQnK3RoaXMubWV0YURhdGFJRCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge30sIHZhbHVlID0gJyhFbXB0eSknO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5tZXRhICYmIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgbGluZS5tZXRhW3RoaXMubWV0YURhdGFJRF0sIHRoaXMucG9zdCBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBhbnkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fSwgdmFsdWUgPSAnKEVtcHR5KSc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5tZXRhICYmIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSwgdGhpcy5wb3N0IF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnQ29tcGFydG1lbnQnLCAnY29tJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCB2YWx1ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZUNvbXBhcnRtZW50c1ttZWFzdXJlLmNvbXBhcnRtZW50XSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgdmFsdWUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOiBib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdNZWFzdXJlbWVudCcsICdtbScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChtSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgbUlkcy5mb3JFYWNoKChtZWFzdXJlSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICAgICAgdmFyIG1UeXBlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbVR5cGUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1UeXBlICYmIG1UeXBlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzpib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ01ldGFib2xpdGUnLCAnbWUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgbWV0YWJvbGl0ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGUgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobWV0YWJvbGl0ZSAmJiBtZXRhYm9saXRlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBQcm90ZWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGxvYWRQZW5kaW5nOmJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnUHJvdGVpbicsICdwcicpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3ZlcnJpZGU6IElmIHRoZSBmaWx0ZXIgaGFzIGEgbG9hZCBwZW5kaW5nLCBpdCdzIFwidXNlZnVsXCIsIGkuZS4gZGlzcGxheSBpdC5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIHByb3RlaW46IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3RlaW4gJiYgcHJvdGVpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgR2VuZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBsb2FkUGVuZGluZzpib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0dlbmUnLCAnZ24nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE92ZXJyaWRlOiBJZiB0aGUgZmlsdGVyIGhhcyBhIGxvYWQgcGVuZGluZywgaXQncyBcInVzZWZ1bFwiLCBpLmUuIGRpc3BsYXkgaXQuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBnZW5lOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2VuZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChnZW5lICYmIGdlbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHBhZ2UgbG9hZHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVJdCgpIHtcblxuICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCA9IG5ldyBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCh0aGlzKTtcblxuICAgICAgICB0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEID0gbnVsbDtcblxuICAgICAgICB0aGlzLnByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50ID0gbnVsbDtcblxuICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gLTE7XG4gICAgICAgIHRoaXMubWV0YWJvbGljTWFwTmFtZSA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5hc3NheXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5hc3NheXNEYXRhR3JpZFNwZWNzID0ge307XG4gICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRzID0ge307XG5cbiAgICAgICAgLy8gcHV0IHRoZSBjbGljayBoYW5kbGVyIGF0IHRoZSBkb2N1bWVudCBsZXZlbCwgdGhlbiBmaWx0ZXIgdG8gYW55IGxpbmsgaW5zaWRlIGEgLmRpc2Nsb3NlXG4gICAgICAgICQoZG9jdW1lbnQpLm9uKCdjbGljaycsICcuZGlzY2xvc2UgLmRpc2Nsb3NlTGluaycsIChlKSA9PiB7XG4gICAgICAgICAgICAkKGUudGFyZ2V0KS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1lYXN1cmVtZW50VG9Bc3NheU1vZGFsKCk7XG4gICAgICAgIHNob3dTdHVkeUdyYXBoKCk7XG4gICAgICAgIHNob3dTdHVkeVRhYmxlKCk7XG4gICAgICAgIHNob3dfYXNzYXlfbWVhc3VyZW1lbnRzKCk7XG5cbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICd1cmwnOiAnZWRkZGF0YS8nLFxuICAgICAgICAgICAgJ3R5cGUnOiAnR0VUJyxcbiAgICAgICAgICAgICdlcnJvcic6ICh4aHIsIHN0YXR1cywgZSkgPT4ge1xuICAgICAgICAgICAgICAgICQoJyNvdmVydmlld1NlY3Rpb24nKS5wcmVwZW5kKFwiPGRpdiBjbGFzcz0nbm9EYXRhJz5FcnJvci4gUGxlYXNlIHJlbG9hZDwvZGl2PlwiKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ0xvYWRpbmcgRURERGF0YSBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIEVERERhdGEgPSAkLmV4dGVuZChFREREYXRhIHx8IHt9LCBkYXRhKTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuQXNzYXlzKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy9zdG9wIHNwaW5uZXJcbiAgICAgICAgICAgICAgICAgICAgJCgnI2xvYWRpbmdEaXYnKS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgICAgICQoJy5zY3JvbGwnKS5jc3MoJ2hlaWdodCcsIDEwMClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkKCcuc2Nyb2xsJykuY3NzKCdoZWlnaHQnLCAzMDApXG4gICAgICAgICAgICAgICAgICAgICQoJyNjaGFydFR5cGUnKS5zaG93KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9zaG93IGVtcHR5IGdyYXBoIGRpdiBpZiB0aGVyZSBhcmUgbm9cbiAgICAgICAgICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuTGluZXMpLmxlbmd0aCA9PT0gMCkge1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBzcGVjO1xuICAgICAgICAgICAgICAgIHRoaXMuYXNzYXlzRGF0YUdyaWRTcGVjcyA9IHNwZWMgPSBuZXcgRGF0YUdyaWRTcGVjQXNzYXlzKEVERERhdGEuQXNzYXlzKTtcbiAgICAgICAgICAgICAgICBzcGVjLmluaXQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2F5c0RhdGFHcmlkcyA9IG5ldyBEYXRhR3JpZEFzc2F5cyhzcGVjKTtcblxuICAgICAgICAgICAgICAgIC8vcHVsbGluZyBpbiBwcm90b2NvbCBtZWFzdXJlbWVudHMgQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgICAgICAgICAkLmVhY2goRURERGF0YS5Qcm90b2NvbHMsIChpZCwgcHJvdG9jb2wpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogJ21lYXN1cmVtZW50cy8nICsgaWQgKyAnLycsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBmZXRjaCBtZWFzdXJlbWVudCBkYXRhIG9uICcgKyBwcm90b2NvbC5uYW1lICsgJyEnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzdGF0dXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHByb2Nlc3NNZWFzdXJlbWVudERhdGEuYmluZCh0aGlzLCBwcm90b2NvbClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoJ2Zvcm0ubGluZS1lZGl0Jykub24oJ2NoYW5nZScsICcubGluZS1tZXRhID4gOmlucHV0JywgKGV2KSA9PiB7XG4gICAgICAgICAgICAvLyB3YXRjaCBmb3IgY2hhbmdlcyB0byBtZXRhZGF0YSB2YWx1ZXMsIGFuZCBzZXJpYWxpemUgdG8gdGhlIG1ldGFfc3RvcmUgZmllbGRcbiAgICAgICAgICAgIHZhciBmb3JtID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJ2Zvcm0nKSxcbiAgICAgICAgICAgICAgICBtZXRhSW4gPSBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKSxcbiAgICAgICAgICAgICAgICBtZXRhID0gSlNPTi5wYXJzZShtZXRhSW4udmFsKCkgfHwgJ3t9Jyk7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5saW5lLW1ldGEgPiA6aW5wdXQnKS5lYWNoKChpLCBpbnB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSAkKGlucHV0KS5hdHRyKCdpZCcpLm1hdGNoKC8tKFxcZCspJC8pWzFdO1xuICAgICAgICAgICAgICAgIG1ldGFba2V5XSA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5saW5lLW1ldGEtYWRkJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIG1ha2UgbWV0YWRhdGEgQWRkIFZhbHVlIGJ1dHRvbiB3b3JrIGFuZCBub3Qgc3VibWl0IHRoZSBmb3JtXG4gICAgICAgICAgICB2YXIgYWRkcm93ID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5saW5lLWVkaXQtbWV0YScpLCB0eXBlLCB2YWx1ZTtcbiAgICAgICAgICAgIHR5cGUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS10eXBlJykudmFsKCk7XG4gICAgICAgICAgICB2YWx1ZSA9IGFkZHJvdy5maW5kKCcubGluZS1tZXRhLXZhbHVlJykudmFsKCk7XG4gICAgICAgICAgICAvLyBjbGVhciBvdXQgaW5wdXRzIHNvIGFub3RoZXIgdmFsdWUgY2FuIGJlIGVudGVyZWRcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6aW5wdXQnKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6Y2hlY2tib3gsIDpyYWRpbycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5NZXRhRGF0YVR5cGVzW3R5cGVdKSB7XG4gICAgICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KGFkZHJvdywgdHlwZSwgdmFsdWUpLmZpbmQoJzppbnB1dCcpLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnLm1ldGEtcmVtb3ZlJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIHJlbW92ZSBtZXRhZGF0YSByb3cgYW5kIGluc2VydCBudWxsIHZhbHVlIGZvciB0aGUgbWV0YWRhdGEga2V5XG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YVJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1tZXRhJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpLFxuICAgICAgICAgICAgICAgIGtleSA9IG1ldGFSb3cuYXR0cignaWQnKS5tYXRjaCgvLShcXGQrKSQvKVsxXTtcbiAgICAgICAgICAgIG1ldGFba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgICAgIG1ldGFSb3cucmVtb3ZlKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFByZXBhcmUgdGhlIG1haW4gZGF0YSBvdmVydmlldyBncmFwaCBhdCB0aGUgdG9wIG9mIHRoZSBwYWdlXG4gICAgICAgIGlmICh0aGlzLm1haW5HcmFwaE9iamVjdCA9PT0gbnVsbCAmJiAkKCcjbWFpbmdyYXBoJykubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICB0aGlzLm1haW5HcmFwaE9iamVjdCA9IE9iamVjdC5jcmVhdGUoU3R1ZHlER3JhcGhpbmcpO1xuICAgICAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuU2V0dXAoJ21haW5ncmFwaCcpO1xuICAgICAgICAgICAgdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5tYWluR3JhcGhPYmplY3QgPSB0aGlzLm1haW5HcmFwaE9iamVjdDtcbiAgICAgICAgfVxuXG4gICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLm9uKCdtb3VzZW92ZXIgbW91c2Vkb3duIG1vdXNldXAnLCB0aGlzLnF1ZXVlTWFpbkdyYXBoUmVtYWtlLmJpbmQodGhpcywgZmFsc2UpKVxuICAgICAgICAgICAgICAgIC5vbigna2V5ZG93bicsIGZpbHRlclRhYmxlS2V5RG93bi5iaW5kKHRoaXMpKTtcbiAgICB9XG5cblxuICAgIC8vY2xpY2sgaGFuZGxlciBmb3IgYWRkIG1lYXN1cmVtZW50cyB0byBzZWxlY3RlZCBhc3NheXMgbW9kYWxcbiAgICBmdW5jdGlvbiBtZWFzdXJlbWVudFRvQXNzYXlNb2RhbCgpIHtcbiAgICAgICB2YXIgZGxnID0gJChcIiNhZGRNZWFzVG9Bc3NheVwiKS5kaWFsb2coe1xuICAgICAgICAgICBhdXRvT3BlbjogZmFsc2VcbiAgICAgICAgfSk7XG4gICAgICAgICQoXCIjbWVhc3VyZW1lbnRNYWluXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAkKFwiI2FkZE1lYXNUb0Fzc2F5XCIpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9O1xuXG5cbiAgICAvL3Nob3cgaGlkZSBmb3IgY2xpY2tpbmcgZ3JhcGggdGFiIHVuZGVyIGRhdGFcbiAgICBmdW5jdGlvbiBzaG93U3R1ZHlHcmFwaCgpIHtcbiAgICAgICAgJCgnI3N0dWR5R3JhcGgnKS5jbGljayhmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAkKCcjc3R1ZHlUYWJsZScpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQodGhpcykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJCgnI292ZXJ2aWV3U2VjdGlvbicpLmNzcygnZGlzcGxheScsICdibG9jaycpO1xuICAgICAgICAgICAgJCgnI2Fzc2F5c1NlY3Rpb24nKS5jc3MoJ2Rpc3BsYXknLCAnbm9uZScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy9zaG93IGhpZGUgZm9yIGNsaWNraW5nIHRhYmxlIHRhYiB1bmRlciBkYXRhXG4gICAgZnVuY3Rpb24gc2hvd1N0dWR5VGFibGUoKSB7XG4gICAgICAgICQoIFwiI3N0dWR5VGFibGVcIiApLm9uZSggXCJjbGlja1wiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vZmlyc3QgYnVpbGQgdGFibGVcbiAgICAgICAgICAgIFN0dWR5RC5hc3NheXNEYXRhR3JpZHMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKTtcbiAgICAgICAgICAgIC8vaWYgYW55IGNoZWNrYm94ZXMgaGF2ZSBiZWVuIGNoZWNrIGluIGZpbHRlcmluZyBzZWN0aW9uLCBzaG93SGlkZSByb3dzXG4gICAgICAgICAgICBpZiAoJChcIi5maWx0ZXJUYWJsZSBpbnB1dDpjaGVja2JveDpjaGVja2VkXCIpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAkKCcjc2hvd05vTWVhc3VyZW1lbnRzJykudGV4dChcInNob3cgYWxsXCIpO1xuICAgICAgICAgICAgICAgIFN0dWR5RC5zaG93SGlkZUFzc2F5Um93cyhTdHVkeUQucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuZmlsdGVyZWRBc3NheUlEcylcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJCgnI3Nob3dOb01lYXN1cmVtZW50cycpLnRleHQoXCJzaG93IG9ubHkgd2l0aCBtZWFzdXJlbWVudHNcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjc3R1ZHlUYWJsZScpLmNsaWNrKGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIC8vb24gcGFnZSBsb2FkIG9mIHRhYmxlIHNob3cgYXNzYXlzIHNlYXJjaCBoZWFkZXJcbiAgICAgICAgICAgICQoIFwiaW5wdXRbbmFtZSo9J2Fzc2F5c1NlYXJjaCddXCIgKS5wYXJlbnRzKCd0aGVhZCcpLnNob3coKTtcbiAgICAgICAgICAgIC8vcmVtb3ZlIHNvcnRlciBvbiBtZWFzdXJlbWVudCB0YWIgaW4gdGFibGVcbiAgICAgICAgICAgICQoJyNoQXNzYXlzTU5hbWUnKS5yZW1vdmVDbGFzcygpO1xuICAgICAgICAgICAgJCgnI3N0dWR5R3JhcGgnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAkKHRoaXMpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoJyNhc3NheXNTZWN0aW9uJykuY3NzKCdkaXNwbGF5JywgJ2Jsb2NrJyk7XG4gICAgICAgICAgICAkKCcjb3ZlcnZpZXdTZWN0aW9uJykuY3NzKCdkaXNwbGF5JywgJ25vbmUnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vY2xpY2sgaGFuZGxlciBmb3Igc2hvdyBhc3NheXMgd2l0aCBubyBtZWFzdXJlbWVudHNcbiAgICBmdW5jdGlvbiBzaG93X2Fzc2F5X21lYXN1cmVtZW50cygpIHtcbiAgICAgICAgJCgnI3Nob3dOb01lYXN1cmVtZW50cycpLmNsaWNrKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCh0aGlzKS50ZXh0KCkgPT0gXCJzaG93IG9ubHkgd2l0aCBtZWFzdXJlbWVudHNcIiA/IHNob3dfaGlkZSgpIDogc2hvd19pbnQoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3dfaW50KCkge1xuICAgICAgICAkKCcjc2hvd05vTWVhc3VyZW1lbnRzJykudGV4dChcInNob3cgb25seSB3aXRoIG1lYXN1cmVtZW50c1wiKTtcbiAgICAgICAgLy9mdW5jdGlvbiB0byBzaG93IGFzc2F5cyB3aXRoIG5vIG1lYXN1cmVtZW50c1xuICAgICAgICBTdHVkeUQuc2hvd0hpZGVBc3NheVJvd3Moc2hvd19hc3NheV9ub19tZWFzdXJlbWVudHMoKSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBzaG93X2hpZGUoKSB7XG4gICAgICAgICQoJyNzaG93Tm9NZWFzdXJlbWVudHMnKS50ZXh0KFwic2hvdyBhbGxcIik7XG4gICAgICAgIC8vZnVuY3Rpb24gdG8gc2hvdyBhc3NheXMgd2l0aCBtZWFzdXJlbWVudHNcbiAgICAgICAgU3R1ZHlELnNob3dIaWRlQXNzYXlSb3dzKFN0dWR5RC5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5maWx0ZXJlZEFzc2F5SURzKVxuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd19hc3NheV9ub19tZWFzdXJlbWVudHMoKSB7XG4gICAgICAgIHZhciBhc3NheXMgPSBfLmtleXMoRURERGF0YS5Bc3NheXMpO1xuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IGFzc2F5cy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gYXNzYXlzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKHBhcnNlSW50KGlkKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBmaWx0ZXJUYWJsZUtleURvd24oZSkge1xuICAgICAgICBzd2l0Y2ggKGUua2V5Q29kZSkge1xuICAgICAgICAgICAgY2FzZSAzODogLy8gdXBcbiAgICAgICAgICAgIGNhc2UgNDA6IC8vIGRvd25cbiAgICAgICAgICAgIGNhc2UgOTogIC8vIHRhYlxuICAgICAgICAgICAgY2FzZSAxMzogLy8gcmV0dXJuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgICAgICAgICBpZiAoZS5rZXlDb2RlID4gOCAmJiBlLmtleUNvZGUgPCAzMikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMucXVldWVNYWluR3JhcGhSZW1ha2UoZmFsc2UpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmVxdWVzdEFzc2F5RGF0YShhc3NheSkge1xuICAgICAgICB2YXIgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgdXJsOiBbJ21lYXN1cmVtZW50cycsIGFzc2F5LnBpZCwgYXNzYXkuaWQsICcnXS5qb2luKCcvJyksXG4gICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBmZXRjaCBtZWFzdXJlbWVudCBkYXRhIG9uICcgKyBhc3NheS5uYW1lICsgJyEnKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzdGF0dXMpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHByb2Nlc3NNZWFzdXJlbWVudERhdGEuYmluZCh0aGlzLCBwcm90b2NvbClcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKHByb3RvY29sLCBkYXRhKSB7XG4gICAgICAgIHZhciBhc3NheVNlZW4gPSB7fSxcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheSA9IHt9LFxuICAgICAgICAgICAgY291bnRfdG90YWw6bnVtYmVyID0gMCxcbiAgICAgICAgICAgIGNvdW50X3JlYzpudW1iZXIgPSAwO1xuICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fTtcbiAgICAgICAgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzID0gJC5leHRlbmQoRURERGF0YS5NZWFzdXJlbWVudFR5cGVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICAvLyBhdHRhY2ggbWVhc3VyZW1lbnQgY291bnRzIHRvIGVhY2ggYXNzYXlcbiAgICAgICAgJC5lYWNoKGRhdGEudG90YWxfbWVhc3VyZXMsIChhc3NheUlkOnN0cmluZywgY291bnQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSB8fCBhc3NheS5jb3VudCA9PT0gdW5kZWZpbmVkKSByZXR1cm47XG4gICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgLy8gYXR0YWNoIHZhbHVlc1xuICAgICAgICAgICAgJC5leHRlbmQobWVhc3VyZW1lbnQsIHsgJ3ZhbHVlcyc6IGRhdGEuZGF0YVttZWFzdXJlbWVudC5pZF0gfHwgW10gfSk7XG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50LmlkXSA9IG1lYXN1cmVtZW50O1xuICAgICAgICAgICAgLy8gdHJhY2sgd2hpY2ggYXNzYXlzIHJlY2VpdmVkIHVwZGF0ZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBhc3NheVNlZW5bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdID0gcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXVthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgLy8gaGFuZGxlIG1lYXN1cmVtZW50IGRhdGEgYmFzZWQgb24gdHlwZVxuICAgICAgICAgICAgbXR5cGUgPSBkYXRhLnR5cGVzW21lYXN1cmVtZW50LnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgKGFzc2F5Lm1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAoYXNzYXkubWV0YWJvbGl0ZXMgPSBhc3NheS5tZXRhYm9saXRlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAoYXNzYXkucHJvdGVpbnMgPSBhc3NheS5wcm90ZWlucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ2cnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIGdlbmUgLyB0cmFuc2NyaXB0XG4gICAgICAgICAgICAgICAgKGFzc2F5LnRyYW5zY3JpcHRpb25zID0gYXNzYXkudHJhbnNjcmlwdGlvbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAoYXNzYXkuZ2VuZXJhbCA9IGFzc2F5LmdlbmVyYWwgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhkYXRhLm1lYXN1cmVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICBpZiAoY291bnRfcmVjIDwgY291bnRfdG90YWwpIHtcbiAgICAgICAgICAgIC8vIFRPRE8gbm90IGFsbCBtZWFzdXJlbWVudHMgZG93bmxvYWRlZDsgZGlzcGxheSBhIG1lc3NhZ2UgaW5kaWNhdGluZyB0aGlzXG4gICAgICAgICAgICAvLyBleHBsYWluIGRvd25sb2FkaW5nIGluZGl2aWR1YWwgYXNzYXkgbWVhc3VyZW1lbnRzIHRvb1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5xdWV1ZU1haW5HcmFwaFJlbWFrZShmYWxzZSk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVBc3NheXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgdGhlIGdyYXBoLlxuICAgICAgICAvLyBUaGlzIHdheSB3ZSdyZSBub3QgYm90aGVyaW5nIHRoZSB1c2VyIHdpdGggdGhlIGxvbmcgcmVkcmF3IHByb2Nlc3Mgd2hlblxuICAgICAgICAvLyB0aGV5IGFyZSBtYWtpbmcgZmFzdCBlZGl0cy5cbiAgICAgICAgaWYgKHRoaXMuYXNzYXlzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFzc2F5c0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gc2V0VGltZW91dChhc3NheXNBY3Rpb25QYW5lbFNob3cuYmluZCh0aGlzKSwgMTUwKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhc3NheXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIHZhciBjaGVja2VkQm94ZXMgPSBbXSwgY2hlY2tlZEFzc2F5cywgY2hlY2tlZE1lYXN1cmUsIHBhbmVsLCBpbmZvYm94O1xuICAgICAgICBwYW5lbCA9ICQoJyNhc3NheXNBY3Rpb25QYW5lbCcpO1xuICAgICAgICBpZiAoIXBhbmVsLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgYXNzYXlzL2NoZWNrYm94ZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICAkLmVhY2godGhpcy5hc3NheXNEYXRhR3JpZHMsIChwSUQsIGRhdGFHcmlkKSA9PiB7XG4gICAgICAgICAgICBjaGVja2VkQm94ZXMgPSBjaGVja2VkQm94ZXMuY29uY2F0KGRhdGFHcmlkLmdldFNlbGVjdGVkQ2hlY2tib3hFbGVtZW50cygpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNoZWNrZWRBc3NheXMgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCdbaWRePWFzc2F5XScpLmxlbmd0aDtcbiAgICAgICAgY2hlY2tlZE1lYXN1cmUgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCc6bm90KFtpZF49YXNzYXldKScpLmxlbmd0aDtcbiAgICAgICAgcGFuZWwudG9nZ2xlQ2xhc3MoJ29mZicsICFjaGVja2VkQXNzYXlzICYmICFjaGVja2VkTWVhc3VyZSk7XG4gICAgICAgIGlmIChjaGVja2VkQXNzYXlzIHx8IGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICBpbmZvYm94ID0gJCgnI2Fzc2F5c1NlbGVjdGVkQ2VsbCcpLmVtcHR5KCk7XG4gICAgICAgICAgICBpZiAoY2hlY2tlZEFzc2F5cykge1xuICAgICAgICAgICAgICAgICQoXCI8cD5cIikuYXBwZW5kVG8oaW5mb2JveCkudGV4dCgoY2hlY2tlZEFzc2F5cyA+IDEpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIChjaGVja2VkQXNzYXlzICsgXCIgQXNzYXlzIHNlbGVjdGVkXCIpIDogXCIxIEFzc2F5IHNlbGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICAgICAgJChcIjxwPlwiKS5hcHBlbmRUbyhpbmZvYm94KS50ZXh0KChjaGVja2VkTWVhc3VyZSA+IDEpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIChjaGVja2VkTWVhc3VyZSArIFwiIE1lYXN1cmVtZW50cyBzZWxlY3RlZFwiKSA6IFwiMSBNZWFzdXJlbWVudCBzZWxlY3RlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHJlbWFrZXMgYSBncmFwaC4gVGhpcyB3YXkgd2UncmUgbm90XG4gICAgLy8gYm90aGVyaW5nIHRoZSB1c2VyIHdpdGggdGhlIGxvbmcgcmVkcmF3IHByb2Nlc3Mgd2hlbiB0aGV5IGFyZSBtYWtpbmcgZmFzdCBlZGl0cy5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVNYWluR3JhcGhSZW1ha2UoZm9yY2U/OmJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHRoaXMubWFpbkdyYXBoUmVmcmVzaFRpbWVySUQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1haW5HcmFwaFJlZnJlc2hUaW1lcklEID0gc2V0VGltZW91dChyZW1ha2VNYWluR3JhcGhBcmVhLmJpbmQodGhpcywgZm9yY2UpLCAyMDApO1xuICAgIH1cblxuICAgIHZhciByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPSAwO1xuXG4gICAgIC8vdGhpcyBmdW5jdGlvbiBzaG93cyBhbmQgaGlkZXMgcm93cyBiYXNlZCBvbiBmaWx0ZXJlZCBkYXRhLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBzaG93SGlkZUFzc2F5Um93cyhwcm9ncmVzc2l2ZUZpbHRlcmluZ01lYXN1cmVtZW50cyk6dm9pZCB7XG5cbiAgICAgICAgdmFyIGFzc2F5cyA9IF8ua2V5cyhFREREYXRhLkFzc2F5cyk7XG5cbiAgICAgICAgdmFyIGhpZGVBcnJheSA9IF8uZmlsdGVyKGFzc2F5cywgZnVuY3Rpb24oIGVsICkge1xuICAgICAgICAgIHJldHVybiAhcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdNZWFzdXJlbWVudHMuaW5jbHVkZXMoIHBhcnNlSW50KGVsKSApO1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIHNob3dBcnJheSA9Xy5maWx0ZXIoYXNzYXlzLCBmdW5jdGlvbiggZWwgKSB7XG4gICAgICAgICAgcmV0dXJuIHByb2dyZXNzaXZlRmlsdGVyaW5nTWVhc3VyZW1lbnRzLmluY2x1ZGVzKCBwYXJzZUludChlbCkgKTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vaGlkZSBlbGVtZW50cyBub3QgaW4gcHJvZ3Jlc3NpdmUgZmlsdGVyaW5nIG1lYXN1cmVtZW50c1xuICAgICAgICBfLmVhY2goaGlkZUFycmF5LCBmdW5jdGlvbihhc3NheUlkKSB7XG4gICAgICAgICAgICAkKCBcImlucHV0W3ZhbHVlPSdcIiArIGFzc2F5SWQgKyBcIiddXCIpLnBhcmVudHMoJ3RyJykuaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy9zaG93IGVsZW1lbnRzIGluIHByb2dyZXNzaXZlIGZpbHRlcmluZyBtZWFzdXJlbWVudHNcbiAgICAgICAgXy5lYWNoKHNob3dBcnJheSwgZnVuY3Rpb24oYXNzYXlJZCkge1xuICAgICAgICAgICAgLy9pZiB0aGUgcm93IGRvZXMgbm90IGV4aXN0LCByZXNldCB0YWJsZSBcbiAgICAgICAgICAgIGlmICgkKCBcImlucHV0W3ZhbHVlPSdcIiArIGFzc2F5SWQgKyBcIiddXCIpLnBhcmVudHMoJ3RyJykubGVuZ3RoID09PTApIHtcbiAgICAgICAgICAgICAgICBTdHVkeUQuYXNzYXlzRGF0YUdyaWRzLnRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKCBcImlucHV0W3ZhbHVlPSdcIiArIGFzc2F5SWQgKyBcIiddXCIpLnBhcmVudHMoJ3RyJykuc2hvdygpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gc2hvd0Fzc2F5c1dpdGhOb01lYXN1cmVtZW50cyhhbGxBc3NheXMpOnZvaWQge1xuXG4gICAgICAgIHZhciBhc3NheXMgPSBfLmtleXMoRURERGF0YS5Bc3NheXMpO1xuXG4gICAgICAgIC8vc2hvdyBlbGVtZW50cyBpbiBwcm9ncmVzc2l2ZSBmaWx0ZXJpbmcgbWVhc3VyZW1lbnRzXG4gICAgICAgIF8uZWFjaChhc3NheXMsIGZ1bmN0aW9uKGFzc2F5SWQpIHtcbiAgICAgICAgICAgIC8vaWYgdGhlIHJvdyBkb2VzIG5vdCBleGlzdCwgcmVzZXQgdGFibGVcbiAgICAgICAgICAgIGlmICgkKCBcImlucHV0W3ZhbHVlPSdcIiArIGFzc2F5SWQgKyBcIiddXCIpLnBhcmVudHMoJ3RyJykubGVuZ3RoID09PTApIHtcbiAgICAgICAgICAgICAgICBTdHVkeUQuYXNzYXlzRGF0YUdyaWRzLnRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKCBcImlucHV0W3ZhbHVlPSdcIiArIGFzc2F5SWQgKyBcIiddXCIpLnBhcmVudHMoJ3RyJykuc2hvdygpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvL2NvbnZlcnQgcG9zdCBmaWx0ZXJlZCBtZWFzdXJlbW50cyB0byBhcnJheSBvZiBhc3NheSBpZHNcbiAgICBleHBvcnQgZnVuY3Rpb24gY29udmVydFBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMocG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cykge1xuICAgICAgICAvL2FycmF5IG9mIGFzc2F5c1xuICAgICAgICB2YXIgZmlsdGVyZWRBc3NheU1lYXN1cmVtZW50czphbnlbXSA9IFtdO1xuXG4gICAgICAgIF8uZWFjaChwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzLCBmdW5jdGlvbihtZWFzOmFueSkge1xuICAgICAgICAgICAgZmlsdGVyZWRBc3NheU1lYXN1cmVtZW50cy5wdXNoKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc10uYXNzYXkpXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZmlsdGVyZWRBc3NheU1lYXN1cmVtZW50cztcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHJlbWFrZU1haW5HcmFwaEFyZWEoZm9yY2U/OmJvb2xlYW4pIHtcblxuICAgICAgICB2YXIgcG9zdEZpbHRlcmluZ01lYXN1cmVtZW50czphbnlbXSxcbiAgICAgICAgICAgIGRhdGFQb2ludHNEaXNwbGF5ZWQgPSAwLFxuICAgICAgICAgICAgZGF0YVBvaW50c1RvdGFsID0gMCxcbiAgICAgICAgICAgIGNvbG9yT2JqO1xuXG4gICAgICAgIGlmICghdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5jaGVja1JlZHJhd1JlcXVpcmVkKGZvcmNlKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gc3RvcCBzcGlubmVyXG4gICAgICAgICQoJyNsb2FkaW5nRGl2JykuaGlkZSgpO1xuICAgICAgICAkKCcuYmxhbmtTdmcnKS5oaWRlKCk7XG4gICAgICAgIC8vIHJlbW92ZSBkaXNhYmxlZCBmcm9tIHRhYmxlIGJlY2F1c2UgbWVhc3VyZW1lbnRzIGFyZSBub3cgdGhlcmVcbiAgICAgICAgJCgnI3N0dWR5VGFibGUnKS5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcbiAgICAgICAgLy8gcmVtb3ZlIFNWRy5cbiAgICAgICAgdGhpcy5tYWluR3JhcGhPYmplY3QuY2xlYXJBbGxTZXRzKCk7XG4gICAgICAgIHRoaXMuZ3JhcGhIZWxwZXIgPSBPYmplY3QuY3JlYXRlKEdyYXBoSGVscGVyTWV0aG9kcyk7XG4gICAgICAgIGNvbG9yT2JqID0gRURERGF0YVsnY29sb3InXTtcbiAgICAgICAgLy8gR2l2ZXMgaWRzIG9mIGxpbmVzIHRvIHNob3cuXG4gICAgICAgIHZhciBkYXRhU2V0cyA9IFtdLCBwcmV2O1xuICAgICAgICBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzID0gdGhpcy5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk7XG4gICAgICAgIC8vIHNob3cgbWVzc2FnZSB0aGF0IHRoZXJlJ3Mgbm8gZGF0YSB0byBkaXNwbGF5XG4gICAgICAgIGlmIChwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgJCgnLmxpbmVOb0RhdGEnKS5zaG93KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKCcubGluZU5vRGF0YScpLmhpZGUoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBzdG9yZSBmaWx0ZXJlZCBkYXRhIGhlcmUuXG4gICAgICAgIFN0dWR5RC5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5maWx0ZXJlZEFzc2F5SURzID0gU3R1ZHlELmNvbnZlcnRQb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzKHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMpO1xuICAgICAgICAvLyBzaG93IGhpZGUgZmlsdGVyZWQgZGF0YSBvbiBhc3NheSB0YWJsZS5cbiAgICAgICAgU3R1ZHlELnNob3dIaWRlQXNzYXlSb3dzKCBTdHVkeUQucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuZmlsdGVyZWRBc3NheUlEcyApO1xuICAgICAgICAkLmVhY2gocG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cywgKGksIG1lYXN1cmVtZW50SWQpID0+IHtcblxuICAgICAgICAgICAgdmFyIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnRJZF0sXG4gICAgICAgICAgICAgICAgcG9pbnRzID0gKG1lYXN1cmUudmFsdWVzID8gbWVhc3VyZS52YWx1ZXMubGVuZ3RoIDogMCksXG4gICAgICAgICAgICAgICAgYXNzYXksIGxpbmUsIG5hbWUsIHNpbmdsZUFzc2F5T2JqLCBjb2xvciwgcHJvdG9jb2wsIGxpbmVOYW1lLCBkYXRhT2JqO1xuICAgICAgICAgICAgZGF0YVBvaW50c1RvdGFsICs9IHBvaW50cztcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHNEaXNwbGF5ZWQgPiAxNTAwMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGUgcmVzdCBpZiB3ZSd2ZSBoaXQgb3VyIGxpbWl0XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRhdGFQb2ludHNEaXNwbGF5ZWQgKz0gcG9pbnRzO1xuICAgICAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlLmFzc2F5XSB8fCB7fTtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBuYW1lID0gW2xpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpO1xuICAgICAgICAgICAgbGluZU5hbWUgPSBsaW5lLm5hbWU7XG5cbiAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG5cbiAgICAgICAgICAgIGlmIChfLmtleXMoRURERGF0YS5MaW5lcykubGVuZ3RoID4gMjIpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNoYW5nZUxpbmVDb2xvcihsaW5lLCBjb2xvck9iaiwgYXNzYXkubGlkLCB0aGlzLmdyYXBoSGVscGVyKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID09PSAwICkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhIZWxwZXIubGFiZWxzLnB1c2gobGFiZWwpO1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID49IDEgJiYgJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgIC8vdW5jaGVja2VkIGxhYmVscyBibGFja1xuICAgICAgICAgICAgICAgIG1ha2VMYWJlbHNCbGFjayh0aGlzLmdyYXBoSGVscGVyLmxhYmVscyk7XG4gICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICBpZiAoY29sb3IgPT09IG51bGwgfHwgY29sb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY291bnQgPSBub0NoZWNrZWRCb3hlcyh0aGlzLmdyYXBoSGVscGVyLmxhYmVscyk7XG4gICAgICAgICAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JhcGhIZWxwZXIubmV4dENvbG9yID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgYWRkQ29sb3IodGhpcy5ncmFwaEhlbHBlci5sYWJlbHMsIGNvbG9yT2JqLCBhc3NheS5saWQpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gYmxhY2tcbiAgICAgICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNvbG9yID09PSBudWxsIHx8IGNvbG9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRhdGFPYmogPSB7XG4gICAgICAgICAgICAgICAgJ21lYXN1cmUnOiBtZWFzdXJlLFxuICAgICAgICAgICAgICAgICdkYXRhJzogRURERGF0YSxcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG5hbWUsXG4gICAgICAgICAgICAgICAgJ2NvbG9yJzogY29sb3IsXG4gICAgICAgICAgICAgICAgJ2xpbmVOYW1lJzogbGluZU5hbWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2luZ2xlQXNzYXlPYmogPSB0aGlzLmdyYXBoSGVscGVyLnRyYW5zZm9ybVNpbmdsZUxpbmVJdGVtKGRhdGFPYmopO1xuICAgICAgICAgICAgZGF0YVNldHMucHVzaChzaW5nbGVBc3NheU9iaik7XG4gICAgICAgICAgICBwcmV2ID0gbGluZU5hbWU7XG4gICAgICAgIH0pO1xuICAgICAgICByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMrKztcbiAgICAgICAgdW5jaGVja0V2ZW50SGFuZGxlcih0aGlzLmdyYXBoSGVscGVyLmxhYmVscyk7XG4gICAgICAgIHRoaXMubWFpbkdyYXBoT2JqZWN0LmFkZE5ld1NldChkYXRhU2V0cywgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIG1ha2VzIHVuY2hlY2tlZCBsYWJlbHMgYmxhY2tcbiAgICAgKiBAcGFyYW0gc2VsZWN0b3JzXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZUxhYmVsc0JsYWNrKHNlbGVjdG9yczpKUXVlcnlbXSkge1xuICAgICAgICBfLmVhY2goc2VsZWN0b3JzLCBmdW5jdGlvbihzZWxlY3RvcjpKUXVlcnkpIHtcbiAgICAgICAgICAgIGlmIChzZWxlY3Rvci5wcmV2KCkucHJvcCgnY2hlY2tlZCcpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgJChzZWxlY3RvcikuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gY3JlYXRlcyBhbiBldmVudCBoYW5kbGVyIGZvciB1bmNoZWNraW5nIGEgY2hlY2tlZCBjaGVja2JveFxuICAgICAqIEBwYXJhbSBsYWJlbHNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiB1bmNoZWNrRXZlbnRIYW5kbGVyKGxhYmVscykge1xuICAgICAgICBfLmVhY2gobGFiZWxzLCBmdW5jdGlvbihsYWJlbCl7XG4gICAgICAgICAgICB2YXIgaWQgPSAkKGxhYmVsKS5wcmV2KCkuYXR0cignaWQnKTtcbiAgICAgICAgICAgICQoJyMnICsgaWQpLmNoYW5nZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGlzY2hlY2tlZD0gJCh0aGlzKS5pcygnOmNoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoIWlzY2hlY2tlZClcbiAgICAgICAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiByZXR1cm5zIGhvdyBtYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQuXG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqIEByZXR1cm5zIGNvdW50IG9mIGNoZWNrZWQgYm94ZXMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbm9DaGVja2VkQm94ZXMobGFiZWxzKSB7XG4gICAgICAgIHZhciBjb3VudCA9IDA7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsKSB7XG4gICAgICAgICAgICB2YXIgY2hlY2tib3ggPSAkKGxhYmVsKS5wcmV2KCk7XG4gICAgICAgICAgICBpZiAoJChjaGVja2JveCkucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFkZHMgY29sb3JzIGFmdGVyIHVzZXIgaGFzIGNsaWNrZWQgYSBsaW5lIGFuZCB0aGVuIHVuY2xpY2tlZCBhbGwgdGhlIGxpbmVzLlxuICAgICAqIEBwYXJhbSBsYWJlbHNcbiAgICAgKiBAcGFyYW0gY29sb3JPYmpcbiAgICAgKiBAcGFyYW0gYXNzYXlcbiAgICAgKiBAcmV0dXJucyBsYWJlbHNcbiAgICAgKi9cblxuICAgIGZ1bmN0aW9uIGFkZENvbG9yKGxhYmVsczpKUXVlcnlbXSwgY29sb3JPYmosIGFzc2F5KSB7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsOkpRdWVyeSkge1xuICAgICAgICAgICAgdmFyIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNbYXNzYXldLm5hbWUgPT09IGxhYmVsLnRleHQoKSkge1xuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbGFiZWxzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBsaW5lXG4gICAgICogQHBhcmFtIGNvbG9yT2JqXG4gICAgICogQHBhcmFtIGFzc2F5XG4gICAgICogQHBhcmFtIGdyYXBoSGVscGVyXG4gICAgICogQHJldHVybnMgY29sb3IgZm9yIGxpbmUuXG4gICAgICogdGhpcyBmdW5jdGlvbiByZXR1cm5zIHRoZSBjb2xvciBpbiB0aGUgY29sb3IgcXVldWUgZm9yIHN0dWRpZXMgPjIyIGxpbmVzLiBJbnN0YW50aWF0ZWRcbiAgICAgKiB3aGVuIHVzZXIgY2xpY2tzIG9uIGEgbGluZS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjaGFuZ2VMaW5lQ29sb3IobGluZSwgY29sb3JPYmosIGFzc2F5LCBncmFwaEhlbHBlcikge1xuXG4gICAgICAgIHZhciBjb2xvcjtcblxuICAgICAgICBpZigkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gbGluZVsnY29sb3InXTtcbiAgICAgICAgICAgICAgICBsaW5lWydkb05vdENoYW5nZSddID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBncmFwaEhlbHBlci5jb2xvclF1ZXVlKGNvbG9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA+PSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpbmVbJ2RvTm90Q2hhbmdlJ10pIHtcbiAgICAgICAgICAgICAgICAgICBjb2xvciA9IGxpbmVbJ2NvbG9yJ107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3IgPSBncmFwaEhlbHBlci5uZXh0Q29sb3I7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVbJ2RvTm90Q2hhbmdlJ10gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBsaW5lWydjb2xvciddID0gY29sb3I7XG4gICAgICAgICAgICAgICAgICAgIC8vdGV4dCBsYWJlbCBuZXh0IHRvIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgICAgICAgICAgZ3JhcGhIZWxwZXIuY29sb3JRdWV1ZShjb2xvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICgkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpID09PSBmYWxzZSAmJiByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPjEgKXtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5XTtcbiAgICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29sb3I7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJBc3NheUZvcm0oKTpKUXVlcnkge1xuICAgICAgICB2YXIgZm9ybTpKUXVlcnkgPSAkKCcjYXNzYXlNYWluJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWFzc2F5LV0nKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49YXNzYXktXScpLmZpbHRlcignOmNoZWNrYm94LCA6cmFkaW8nKS5wcm9wKCdzZWxlY3RlZCcsIGZhbHNlKTtcbiAgICAgICAgZm9ybS5maW5kKCcuY2FuY2VsLWxpbmsnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIHJldHVybiBmb3JtO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBFREREYXRhLlVzZXJzW3JlY29yZC5leHBlcmltZW50ZXJdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWFzc2F5X2lkXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LW5hbWVdJykudmFsKHJlY29yZC5uYW1lKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1wcm90b2NvbF0nKS52YWwocmVjb3JkLnBpZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzBdJykudmFsKHVzZXIgJiYgdXNlci51aWQgPyB1c2VyLnVpZCA6ICctLScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cocmVmUm93LCBrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciByb3csIHR5cGUsIGxhYmVsLCBpbnB1dCwgaWQgPSAnbGluZS1tZXRhLScgKyBrZXk7XG4gICAgICAgIHJvdyA9ICQoJzxwPicpLmF0dHIoJ2lkJywgJ3Jvd18nICsgaWQpLmFkZENsYXNzKCdsaW5lLW1ldGEnKS5pbnNlcnRCZWZvcmUocmVmUm93KTtcbiAgICAgICAgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1trZXldO1xuICAgICAgICBsYWJlbCA9ICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCAnaWRfJyArIGlkKS50ZXh0KHR5cGUubmFtZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgLy8gYnVsayBjaGVja2JveD9cbiAgICAgICAgaW5wdXQgPSAkKCc8aW5wdXQgdHlwZT1cInRleHRcIj4nKS5hdHRyKCdpZCcsICdpZF8nICsgaWQpLnZhbCh2YWx1ZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgaWYgKHR5cGUucHJlKSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wcmVmaXgnKS50ZXh0KHR5cGUucHJlKS5pbnNlcnRCZWZvcmUoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXJlbW92ZScpLnRleHQoJ1JlbW92ZScpLmluc2VydEFmdGVyKGlucHV0KTtcbiAgICAgICAgaWYgKHR5cGUucG9zdGZpeCkge1xuICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcG9zdGZpeCcpLnRleHQodHlwZS5wb3N0Zml4KS5pbnNlcnRBZnRlcihpbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvdztcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZWRpdEFzc2F5KGluZGV4Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGZvcm07XG4gICAgICAgIGlmICghcmVjb3JkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnSW52YWxpZCBBc3NheSByZWNvcmQgZm9yIGVkaXRpbmc6ICcgKyBpbmRleCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZm9ybSA9ICQoJyNhc3NheU1haW4nKTtcbiAgICAgICAgY2xlYXJBc3NheUZvcm0oKTtcbiAgICAgICAgZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpO1xuICAgICAgICBmb3JtLnJlbW92ZUNsYXNzKCdvZmYnKS5kaWFsb2coIFwib3BlblwiICk7XG4gICAgfVxufTtcblxuXG5cbmNsYXNzIERhdGFHcmlkQXNzYXlzIGV4dGVuZHMgQXNzYXlSZXN1bHRzIHtcblxuICAgIHNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQ6Ym9vbGVhbjtcbiAgICBncmFwaFJlZnJlc2hUaW1lcklEOmFueTtcbiAgICAvLyBSaWdodCBub3cgd2UncmUgbm90IGFjdHVhbGx5IHVzaW5nIHRoZSBjb250ZW50cyBvZiB0aGlzIGFycmF5LCBqdXN0XG4gICAgLy8gY2hlY2tpbmcgdG8gc2VlIGlmIGl0J3Mgbm9uLWVtcHR5LlxuICAgIHJlY29yZHNDdXJyZW50bHlJbnZhbGlkYXRlZDpudW1iZXJbXTtcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNCYXNlKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gW107XG4gICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IGZhbHNlO1xuICAgIH1cblxuICAgIGludmFsaWRhdGVBc3NheVJlY29yZHMocmVjb3JkczpudW1iZXJbXSk6dm9pZCB7XG4gICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gdGhpcy5yZWNvcmRzQ3VycmVudGx5SW52YWxpZGF0ZWQuY29uY2F0KHJlY29yZHMpO1xuICAgICAgICBpZiAoIXRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQpIHtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlckFzc2F5UmVjb3Jkc1JlZnJlc2goKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNsaWNrZWREaXNjbG9zZShkaXNjbG9zZTpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdmFyIHNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzID0gdGhpcy5nZXRTcGVjKCk7XG4gICAgICAgIHZhciB0YWJsZSA9IHNwZWMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgIHZhciBkaXYgPSBzcGVjLnVuZGlzY2xvc2VkU2VjdGlvbkRpdjtcbiAgICAgICAgaWYgKCFkaXYgfHwgIXRhYmxlKSB7IHJldHVybjsgfVxuICAgICAgICBpZiAoZGlzY2xvc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvbkN1cnJlbnRseURpc2Nsb3NlZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBTdGFydCBhIHRpbWVyIHRvIHdhaXQgYmVmb3JlIGNhbGxpbmcgdGhlIHJvdXRpbmUgdGhhdCByZW1ha2VzIGEgdGFibGUuIFRoaXMgYnJlYWtzIHVwXG4gICAgICAgICAgICAvLyB0YWJsZSByZWNyZWF0aW9uIGludG8gc2VwYXJhdGUgZXZlbnRzLCBzbyB0aGUgYnJvd3NlciBjYW4gdXBkYXRlIFVJLlxuICAgICAgICAgICAgaWYgKHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy50cmlnZ2VyQXNzYXlSZWNvcmRzUmVmcmVzaCgpLCAxMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25DdXJyZW50bHlEaXNjbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRyaWdnZXJBc3NheVJlY29yZHNSZWZyZXNoKCk6dm9pZCB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkc0N1cnJlbnRseUludmFsaWRhdGVkID0gW107XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZXhlY3V0ZSByZWNvcmRzIHJlZnJlc2g6ICcgKyBlKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gVGhlIHNwZWMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gRGF0YUdyaWQgdG8gY3JlYXRlIHRoZSBBc3NheXMgdGFibGUocylcbmNsYXNzIERhdGFHcmlkU3BlY0Fzc2F5cyBleHRlbmRzIERhdGFHcmlkU3BlY0Jhc2Uge1xuXG4gICAgYXNzYXlJRDphbnk7XG4gICAgZmlsdGVyZWRJZHNJblRhYmxlOm51bWJlcltdO1xuICAgIG1ldGFEYXRhSURzVXNlZEluQXNzYXlzOmFueTtcbiAgICBtYXhpbXVtWFZhbHVlSW5EYXRhOm51bWJlcjtcbiAgICB1bmRpc2Nsb3NlZFNlY3Rpb25EaXY6YW55O1xuXG4gICAgbWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjOkRhdGFHcmlkSGVhZGVyU3BlYztcbiAgICBncmFwaEFyZWFIZWFkZXJTcGVjOkRhdGFHcmlkSGVhZGVyU3BlYztcblxuICAgIGdyYXBoT2JqZWN0OmFueTtcblxuICAgIGNvbnN0cnVjdG9yKGFzc2F5SUQpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5hc3NheUlEID0gYXNzYXlJRDtcbiAgICAgICAgdGhpcy5ncmFwaE9iamVjdCA9IG51bGw7XG4gICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjID0gbnVsbDtcbiAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjID0gbnVsbDtcbiAgICB9XG5cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLnJlZnJlc2hJRExpc3QoKTtcbiAgICAgICAgdGhpcy5maW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpO1xuICAgICAgICB0aGlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkFzc2F5cygpO1xuICAgICAgICBzdXBlci5pbml0KCk7XG4gICAgfVxuXG4gICAgLy9wYXNzIGluIGZpbHRlcmVkIGlkcy4gdGhpcy5hc3NheUlEc0luUHJvdG9jb2wgY2hhbmdlIHRvIHRoaXMuZmlsdGVyZWRJRHNJblRhYmxlXG4gICAgcmVmcmVzaElETGlzdCgpOnZvaWQge1xuICAgICAgICAvLyBGaW5kIG91dCB3aGljaCBwcm90b2NvbHMgaGF2ZSBhc3NheXMgd2l0aCBtZWFzdXJlbWVudHMgLSBkaXNhYmxlZCBvciBub1xuICAgICAgICB0aGlzLmZpbHRlcmVkSWRzSW5UYWJsZSA9IFtdO1xuICAgICAgICB0aGlzLmZpbHRlcklkc0luVGFibGUodGhpcy5maWx0ZXJlZElkc0luVGFibGUsIEVERERhdGEuQXNzYXlzKVxuXG4gICAgfVxuXG4gICAgZmlsdGVySWRzSW5UYWJsZShmaWx0ZXJlZFRhYmxlcywgYXNzYXlzKTp2b2lkIHtcbiAgICAgICAgJC5lYWNoKGFzc2F5cywgKGFzc2F5SWQ6c3RyaW5nLCBhc3NheTpBc3NheVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZTpMaW5lUmVjb3JkO1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAvLyBza2lwIGFzc2F5cyB3aXRob3V0IGEgdmFsaWQgbGluZSBvciB3aXRoIGEgZGlzYWJsZWQgbGluZVxuICAgICAgICAgICAgaWYgKGxpbmUgJiYgbGluZS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZFRhYmxlcy5wdXNoKGFzc2F5LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKTphbnlbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZpbHRlcmVkSWRzSW5UYWJsZTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGFuIG92ZXJyaWRlLiAgQ2FsbGVkIHdoZW4gYSBkYXRhIHJlc2V0IGlzIHRyaWdnZXJlZCwgYnV0IGJlZm9yZSB0aGUgdGFibGUgcm93cyBhcmVcbiAgICAvLyByZWJ1aWx0LlxuICAgIG9uRGF0YVJlc2V0KGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcblxuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIGlmICh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyAmJiB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KSB7XG4gICAgICAgICAgICAkKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpLmNoaWxkcmVuKCc6Zmlyc3QnKS50ZXh0KFxuICAgICAgICAgICAgICAgICAgICAnTWVhc3VyaW5nIFRpbWVzIChSYW5nZSAwIHRvICcgKyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEgKyAnKScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgdmFyIHNlY3Rpb24gPSAkKCcjYXNzYXlzU2VjdGlvbicpO1xuICAgICAgICB2YXIgdGFibGUgPSAkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0YWJsZVwiKSkuYXR0cignaWQnLCAnYXNzYXlUYWJsZScpO1xuICAgICAgICAkKHNlY3Rpb24pLmFwcGVuZCh0YWJsZSk7XG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgYWN0aW9ucyBwYW5lbCByZW1haW5zIGF0IHRoZSBib3R0b20uXG4gICAgICAgICQoJyNhc3NheXNBY3Rpb25QYW5lbCcpLmFwcGVuZFRvKHRhYmxlKTtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhc3NheXNTZWN0aW9uJyk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ2Fzc2F5cycsIHtcbiAgICAgICAgICAgICdkZWZhdWx0U29ydCc6IDFcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCkge1xuICAgICAgICB2YXIgc2Vlbkhhc2g6YW55ID0ge307XG4gICAgICAgIHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMgPSBbXTtcbiAgICAgICAgdGhpcy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICQuZWFjaChhc3NheS5tZXRhIHx8IHt9LCAobWV0YUlkKSA9PiB7IHNlZW5IYXNoW21ldGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIFtdLnB1c2guYXBwbHkodGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cywgT2JqZWN0LmtleXMoc2Vlbkhhc2gpKTtcbiAgICB9XG5cbiAgICBmaW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpOnZvaWQge1xuICAgICAgICB2YXIgbWF4Rm9yQWxsOm51bWJlciA9IDA7XG4gICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCByZWNvcmRzXG4gICAgICAgIG1heEZvckFsbCA9IHRoaXMuZ2V0UmVjb3JkSURzKCkucmVkdWNlKChwcmV2Om51bWJlciwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF0sIG1lYXN1cmVzLCBtYXhGb3JSZWNvcmQ7XG4gICAgICAgICAgICBtZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdO1xuICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIG1lYXN1cmVzXG4gICAgICAgICAgICBtYXhGb3JSZWNvcmQgPSBtZWFzdXJlcy5yZWR1Y2UoKHByZXY6bnVtYmVyLCBtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbG9va3VwOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmU6YW55ID0gbG9va3VwW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG1heEZvck1lYXN1cmU7XG4gICAgICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIGRhdGEgaW4gbWVhc3VyZW1lbnRcbiAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlID0gKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBwb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgcG9pbnRbMF1bMF0pO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JNZWFzdXJlKTtcbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIG1heEZvclJlY29yZCk7XG4gICAgICAgIH0sIDApO1xuICAgICAgICAvLyBBbnl0aGluZyBhYm92ZSAwIGlzIGFjY2VwdGFibGUsIGJ1dCAwIHdpbGwgZGVmYXVsdCBpbnN0ZWFkIHRvIDEuXG4gICAgICAgIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSA9IG1heEZvckFsbCB8fCAxO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TmFtZShpbmRleDphbnkpOnN0cmluZyB7XG4gICAgICAgIC8vIEluIGFuIG9sZCB0eXBpY2FsIEVERERhdGEuQXNzYXlzIHJlY29yZCB0aGlzIHN0cmluZyBpcyBjdXJyZW50bHkgcHJlLWFzc2VtYmxlZCBhbmQgc3RvcmVkXG4gICAgICAgIC8vIGluICdmbicuIEJ1dCB3ZSdyZSBwaGFzaW5nIHRoYXQgb3V0LlxuICAgICAgICB2YXIgcHJvdG9jb2xOYW1pbmcgPSBFREREYXRhLlByb3RvY29sc1t0aGlzLmFzc2F5SURbaW5kZXhdLnBpZF0ubmFtZTtcbiAgICAgICAgdmFyIGFzc2F5LCBsaW5lO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBbbGluZS5uLCBwcm90b2NvbE5hbWluZywgYXNzYXkubmFtZV0uam9pbignLScpLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGFzc2F5LCBleHBlcmltZW50ZXI7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbYXNzYXkuZXhwXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwZXJpbWVudGVyLmluaXRpYWxzLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRBc3NheU1vZGlmaWNhdGlvbihpbmRleDphbnkpOm51bWJlciB7XG4gICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kO1xuICAgIH1cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBoZWFkZXJzIGFsb25nIHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgLy8gbWFwIGFsbCBtZXRhZGF0YSBJRHMgdG8gSGVhZGVyU3BlYyBvYmplY3RzXG4gICAgICAgIHZhciBtZXRhRGF0YUhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIgKyBpbmRleCwgJ2hBc3NheXNNZXRhaWQnICsgaWQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG1kVHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLm1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCksXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAgdGhpcy5ncmFwaEFyZWFIZWFkZXJTcGVjID0gbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg4ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAnaEFzc2F5c0dyYXBoJywgeyAnY29sc3Bhbic6IDcgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoIH0pO1xuXG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMSwgJ2hBc3NheXNOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ05hbWUnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRBc3NheU5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgPSBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDUgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICdoQXNzYXlzTVRpbWVzJywgeyAnbmFtZSc6ICdNZWFzdXJpbmcgVGltZXMnLCAnaGVhZGVyUm93JzogMiB9KTtcblxuICAgICAgICB2YXIgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNNTmFtZScsXG4gICAgICAgICAgICAgICAgICAgIHsgJ25hbWUnOiAnTWVhc3VyZW1lbnQnLCAnaGVhZGVyUm93JzogMiB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMyArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICdoQXNzYXlzVW5pdHMnLFxuICAgICAgICAgICAgICAgICAgICB7ICduYW1lJzogJ1VuaXRzJywgJ2hlYWRlclJvdyc6IDIgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c0NvdW50JyxcbiAgICAgICAgICAgICAgICAgICAgeyAnbmFtZSc6ICdDb3VudCcsICdoZWFkZXJSb3cnOiAyIH0pLFxuICAgICAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMsXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAnaEFzc2F5c0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAxXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgJ2hBc3NheXNNb2RpZmllZCcsXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlNb2RpZmljYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFIZWFkZXJzLCByaWdodFNpZGUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoaSkgPT4ge1xuICAgICAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2ldO1xuICAgICAgICAgICAgaWYgKHJlY29yZCAmJiByZWNvcmQubWV0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmQubWV0YVtpZF0gfHwgJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGUgY29sc3BhbiB2YWx1ZSBmb3IgYWxsIHRoZSBjZWxscyB0aGF0IGFyZSBhc3NheS1sZXZlbCAobm90IG1lYXN1cmVtZW50LWxldmVsKSBpcyBiYXNlZCBvblxuICAgIC8vIHRoZSBudW1iZXIgb2YgbWVhc3VyZW1lbnRzIGZvciB0aGUgcmVzcGVjdGl2ZSByZWNvcmQuIFNwZWNpZmljYWxseSwgaXQncyB0aGUgbnVtYmVyIG9mXG4gICAgLy8gbWV0YWJvbGl0ZSBhbmQgZ2VuZXJhbCBtZWFzdXJlbWVudHMsIHBsdXMgMSBpZiB0aGVyZSBhcmUgdHJhbnNjcmlwdG9taWNzIG1lYXN1cmVtZW50cywgcGx1cyAxIGlmIHRoZXJlXG4gICAgLy8gYXJlIHByb3Rlb21pY3MgbWVhc3VyZW1lbnRzLCBhbGwgYWRkZWQgdG9nZXRoZXIuICAoT3IgMSwgd2hpY2hldmVyIGlzIGhpZ2hlci4pXG4gICAgcHJpdmF0ZSByb3dTcGFuRm9yUmVjb3JkKGluZGV4KTpudW1iZXIge1xuICAgICAgICB2YXIgcmVjID0gRURERGF0YS5Bc3NheXNbaW5kZXhdO1xuICAgICAgICB2YXIgdjpudW1iZXIgPSAoKHJlYy5nZW5lcmFsICAgICAgICAgfHwgW10pLmxlbmd0aCArXG4gICAgICAgICAgICAgICAgICAgICAgICAocmVjLm1ldGFib2xpdGVzICAgICB8fCBbXSkubGVuZ3RoICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgocmVjLnRyYW5zY3JpcHRpb25zIHx8IFtdKS5sZW5ndGggPyAxIDogMCkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgKChyZWMucHJvdGVpbnMgICAgICAgfHwgW10pLmxlbmd0aCA/IDEgOiAwKSAgICkgfHwgMTtcbiAgICAgICAgcmV0dXJuIHY7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVBc3NheU5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgbGluZSA9IEVERERhdGEuTGluZXNbcmVjb3JkLmxpZF0sIHNpZGVNZW51SXRlbXMgPSBbXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1lZGl0LWxpbmtcIj5FZGl0IEFzc2F5PC9hPicsXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1yZWxvYWQtbGlua1wiPlJlbG9hZCBEYXRhPC9hPicsXG4gICAgICAgICAgICAnPGEgaHJlZj1cIi9leHBvcnQ/YXNzYXlJZD0nICsgaW5kZXggKyAnXCI+RXhwb3J0IERhdGEgYXMgQ1NWL2V0YzwvYT4nXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gU2V0IHVwIGpRdWVyeSBtb2RhbHNcbiAgICAgICAgJChcIiNhc3NheU1haW5cIikuZGlhbG9nKHsgYXV0b09wZW46IGZhbHNlIH0pO1xuXG4gICAgICAgIC8vIFRPRE8gd2UgcHJvYmFibHkgZG9uJ3Qgd2FudCB0byBzcGVjaWFsLWNhc2UgbGlrZSB0aGlzIGJ5IG5hbWVcbiAgICAgICAgaWYgKEVERERhdGEuUHJvdG9jb2xzW3JlY29yZC5waWRdLm5hbWUgPT0gXCJUcmFuc2NyaXB0b21pY3NcIikge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcy5wdXNoKCc8YSBocmVmPVwiaW1wb3J0L3JuYXNlcS9lZGdlcHJvP2Fzc2F5PScraW5kZXgrJ1wiPkltcG9ydCBSTkEtc2VxIGRhdGEgZnJvbSBFREdFLXBybzwvYT4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdhc3NheUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdhc3NheScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IHNpZGVNZW51SXRlbXMsXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogW2xpbmUubmFtZSwgRURERGF0YS5Qcm90b2NvbHNbcmVjb3JkLnBpZF0ubmFtZSwgcmVjb3JkLm5hbWVdLmpvaW4oJy0nKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBtYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHJldHVybiAoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29udGVudFN0ciA9ICcnLCBhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkgJiYgdHlwZSAmJiBhc3NheS5tZXRhICYmIChjb250ZW50U3RyID0gYXNzYXkubWV0YVtpZF0gfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgY29udGVudFN0ciA9IFsgdHlwZS5wcmUgfHwgJycsIGNvbnRlbnRTdHIsIHR5cGUucG9zdGZpeCB8fCAnJyBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnRTdHJcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nLFxuICAgICAgICAgICAgb3B0OmFueSk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgY2VsbHMgPSBbXSxcbiAgICAgICAgICAgIGZhY3RvcnkgPSAoKTpEYXRhR3JpZERhdGFDZWxsID0+IG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCk7XG5cbiAgICAgICAgaWYgKChyZWNvcmQubWV0YWJvbGl0ZXMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgJ3Jvd3NwYW4nOiByZWNvcmQubWV0YWJvbGl0ZXMubGVuZ3RoIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udmVydCBJRHMgdG8gbWVhc3VyZW1lbnRzLCBzb3J0IGJ5IG5hbWUsIHRoZW4gY29udmVydCB0byBjZWxsIG9iamVjdHNcbiAgICAgICAgICAgICAgICBjZWxscyA9IHJlY29yZC5tZXRhYm9saXRlcy5tYXAob3B0Lm1ldGFib2xpdGVUb1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnNvcnQob3B0Lm1ldGFib2xpdGVWYWx1ZVNvcnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKG9wdC5tZXRhYm9saXRlVmFsdWVUb0NlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICgocmVjb3JkLmdlbmVyYWwgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgeyAncm93c3Bhbic6IHJlY29yZC5nZW5lcmFsLmxlbmd0aCB9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgSURzIHRvIG1lYXN1cmVtZW50cywgc29ydCBieSBuYW1lLCB0aGVuIGNvbnZlcnQgdG8gY2VsbCBvYmplY3RzXG4gICAgICAgICAgICAgICAgY2VsbHMgPSByZWNvcmQuZ2VuZXJhbC5tYXAob3B0Lm1ldGFib2xpdGVUb1ZhbHVlKVxuICAgICAgICAgICAgICAgICAgICAuc29ydChvcHQubWV0YWJvbGl0ZVZhbHVlU29ydClcbiAgICAgICAgICAgICAgICAgICAgLm1hcChvcHQubWV0YWJvbGl0ZVZhbHVlVG9DZWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBvbmx5IG9uZSBjZWxsIGlmIHRoZXJlIGlzIGFueSB0cmFuc2NyaXB0b21pY3MgZGF0YVxuICAgICAgICBpZiAoKHJlY29yZC50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LnRyYW5zY3JpcHRUb0NlbGwocmVjb3JkLnRyYW5zY3JpcHRpb25zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgb25seSBvbmUgY2VsbCBpZiB0aGVyZSBpcyBhbnkgcHJvdGVvbWljcyBkYXRhXG4gICAgICAgIGlmICgocmVjb3JkLnByb3RlaW5zIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQucHJvdGVpblRvQ2VsbChyZWNvcmQucHJvdGVpbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBhIGxvYWRpbmcgY2VsbCBpZiBub25lIGNyZWF0ZWQgYnkgbWVhc3VyZW1lbnRzXG4gICAgICAgIGlmICghY2VsbHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAocmVjb3JkLmNvdW50KSB7XG4gICAgICAgICAgICAgICAgLy8gd2UgaGF2ZSBhIGNvdW50LCBidXQgbm8gZGF0YSB5ZXQ7IHN0aWxsIGxvYWRpbmdcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvcHQuZW1wdHkpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC5lbXB0eS5jYWxsKHt9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2goZmFjdG9yeSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2VsbHM7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVNZWFzdXJlbWVudE5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCB2YWx1ZS5pZCwge1xuICAgICAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAnY2hlY2tib3hOYW1lJzogJ21lYXN1cmVtZW50SWQnLFxuICAgICAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoKSA9PiB7IHJldHVybiAnbWVhc3VyZW1lbnQnICsgdmFsdWUuaWQgKyAnaW5jbHVkZSc7IH0sXG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdmFsdWUubmFtZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1RyYW5zY3JpcHRvbWljcyBEYXRhJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1Byb3Rlb21pY3MgRGF0YSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImVtcHR5XCI6ICgpID0+IG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJzxpPk5vIE1lYXN1cmVtZW50czwvaT4nXG4gICAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZVVuaXRzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgdW5pdDphbnkgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlLnlfdW5pdHNdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAndW5pdCc6IHVuaXQubmFtZSB8fCAnJyB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS51bml0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnUlBLTSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICcnIC8vIFRPRE86IHdoYXQgYXJlIHByb3Rlb21pY3MgbWVhc3VyZW1lbnQgdW5pdHM/XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdlbmVyYXRlQ291bnRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgLy8gZnVuY3Rpb24gdG8gdXNlIGluIEFycmF5I3JlZHVjZSB0byBjb3VudCBhbGwgdGhlIHZhbHVlcyBpbiBhIHNldCBvZiBtZWFzdXJlbWVudHNcbiAgICAgICAgdmFyIHJlZHVjZUNvdW50ID0gKHByZXY6bnVtYmVyLCBtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fTtcbiAgICAgICAgICAgIHJldHVybiBwcmV2ICsgKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5sZW5ndGg7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ21lYXN1cmUnOiBtZWFzdXJlIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCAodmFsdWUubWVhc3VyZS52YWx1ZXMgfHwgW10pLmxlbmd0aCwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgaWRzLnJlZHVjZShyZWR1Y2VDb3VudCwgMCksICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsIGlkcy5yZWR1Y2UocmVkdWNlQ291bnQsIDApLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTWVhc3VyaW5nVGltZXNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHN2Z0NlbGxGb3JUaW1lQ291bnRzID0gKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjb25zb2xpZGF0ZWQsIHN2ZyA9ICcnLCB0aW1lQ291bnQgPSB7fTtcbiAgICAgICAgICAgICAgICAvLyBjb3VudCB2YWx1ZXMgYXQgZWFjaCB4IGZvciBhbGwgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICAgICAgaWRzLmZvckVhY2goKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgICAgICBwb2ludHM6bnVtYmVyW11bXVtdID0gbWVhc3VyZS52YWx1ZXMgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHBvaW50cy5mb3JFYWNoKChwb2ludDpudW1iZXJbXVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lQ291bnRbcG9pbnRbMF1bMF1dID0gdGltZUNvdW50W3BvaW50WzBdWzBdXSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVHlwZXNjcmlwdCBjb21waWxlciBkb2VzIG5vdCBsaWtlIHVzaW5nIGluY3JlbWVudCBvcGVyYXRvciBvbiBleHByZXNzaW9uXG4gICAgICAgICAgICAgICAgICAgICAgICArK3RpbWVDb3VudFtwb2ludFswXVswXV07XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIG1hcCB0aGUgY291bnRzIHRvIFt4LCB5XSB0dXBsZXNcbiAgICAgICAgICAgICAgICBjb25zb2xpZGF0ZWQgPSAkLm1hcCh0aW1lQ291bnQsICh2YWx1ZSwga2V5KSA9PiBbWyBbcGFyc2VGbG9hdChrZXkpXSwgW3ZhbHVlXSBdXSk7XG4gICAgICAgICAgICAgICAgLy8gZ2VuZXJhdGUgU1ZHIHN0cmluZ1xuICAgICAgICAgICAgICAgIGlmIChjb25zb2xpZGF0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN2ZyA9IGdyaWRTcGVjLmFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhjb25zb2xpZGF0ZWQsICcnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBzdmdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ21lYXN1cmUnOiBtZWFzdXJlIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmUgPSB2YWx1ZS5tZWFzdXJlIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBmb3JtYXQgPSBtZWFzdXJlLmZvcm1hdCA9PT0gMSA/ICdjYXJib24nIDogJycsXG4gICAgICAgICAgICAgICAgICAgIHBvaW50cyA9IHZhbHVlLm1lYXN1cmUudmFsdWVzIHx8IFtdLFxuICAgICAgICAgICAgICAgICAgICBzdmcgPSBncmlkU3BlYy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMocG9pbnRzLCBmb3JtYXQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBzdmdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IHN2Z0NlbGxGb3JUaW1lQ291bnRzLFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiBzdmdDZWxsRm9yVGltZUNvdW50c1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUV4cGVyaW1lbnRlckNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgZXhwID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLmV4cDtcbiAgICAgICAgdmFyIHVSZWNvcmQgPSBFREREYXRhLlVzZXJzW2V4cF07XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdVJlY29yZCA/IHVSZWNvcmQuaW5pdGlhbHMgOiAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcoRURERGF0YS5Bc3NheXNbaW5kZXhdLm1vZClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKHBvaW50cywgZm9ybWF0OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHN2ZyA9ICc8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2ZXJzaW9uPVwiMS4yXCIgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTBweFwiXFxcbiAgICAgICAgICAgICAgICAgICAgdmlld0JveD1cIjAgMCA0NzAgMTBcIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPVwibm9uZVwiPlxcXG4gICAgICAgICAgICAgICAgPHN0eWxlIHR5cGU9XCJ0ZXh0L2Nzc1wiPjwhW0NEQVRBW1xcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY1AgeyBzdHJva2U6cmdiYSgwLDAsMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNWIHsgc3Ryb2tlOnJnYmEoMCwwLDIzMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNFIHsgc3Ryb2tlOnJnYmEoMjU1LDEyOCwwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgIF1dPjwvc3R5bGU+XFxcbiAgICAgICAgICAgICAgICA8cGF0aCBmaWxsPVwicmdiYSgwLDAsMCwwLjAuMDUpXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3Ryb2tlPVwicmdiYSgwLDAsMCwwLjA1KVwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIGQ9XCJNMTAsNWg0NTBcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT1cInN0cm9rZS13aWR0aDoycHg7XCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3Ryb2tlLXdpZHRoPVwiMlwiPjwvcGF0aD4nO1xuICAgICAgICB2YXIgcGF0aHMgPSBbIHN2ZyBdO1xuICAgICAgICBwb2ludHMuc29ydCgoYSxiKSA9PiB7IHJldHVybiBhWzBdIC0gYlswXTsgfSkuZm9yRWFjaCgocG9pbnQpID0+IHtcbiAgICAgICAgICAgIHZhciB4ID0gcG9pbnRbMF1bMF0sXG4gICAgICAgICAgICAgICAgeSA9IHBvaW50WzFdWzBdLFxuICAgICAgICAgICAgICAgIHJ4ID0gKCh4IC8gdGhpcy5tYXhpbXVtWFZhbHVlSW5EYXRhKSAqIDQ1MCkgKyAxMCxcbiAgICAgICAgICAgICAgICB0dCA9IFt5LCAnIGF0ICcsIHgsICdoJ10uam9pbignJyk7XG4gICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjRVwiIGQ9XCJNJywgcngsICcsNXY0XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIGlmICh5ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY0VcIiBkPVwiTScsIHJ4LCAnLDJ2NlwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1BcIiBkPVwiTScsIHJ4LCAnLDF2NFwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICBpZiAoZm9ybWF0ID09PSAnY2FyYm9uJykge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNWXCIgZD1cIk0nLCByeCwgJywxdjhcIj48dGl0bGU+JywgdHQsICc8L3RpdGxlPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNQXCIgZD1cIk0nLCByeCwgJywxdjhcIj48dGl0bGU+JywgdHQsICc8L3RpdGxlPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBwYXRocy5wdXNoKCc8L3N2Zz4nKTtcbiAgICAgICAgcmV0dXJuIHBhdGhzLmpvaW4oJ1xcbicpO1xuICAgIH1cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGRhdGEgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVDb2x1bW5TcGVjKCk6RGF0YUdyaWRDb2x1bW5TcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICBtZXRhRGF0YUNvbHM6RGF0YUdyaWRDb2x1bW5TcGVjW10sXG4gICAgICAgICAgICByaWdodFNpZGU6RGF0YUdyaWRDb2x1bW5TcGVjW107XG4gICAgICAgIC8vIGFkZCBjbGljayBoYW5kbGVyIGZvciBtZW51IG9uIGFzc2F5IG5hbWUgY2VsbHNcbiAgICAgICAgJCh0aGlzLnRhYmxlRWxlbWVudCkub24oJ2NsaWNrJywgJ2EuYXNzYXktZWRpdC1saW5rJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBTdHVkeUQuZWRpdEFzc2F5KCQoZXYudGFyZ2V0KS5jbG9zZXN0KCcucG9wdXBjZWxsJykuZmluZCgnaW5wdXQnKS52YWwoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICdhLmFzc2F5LXJlbG9hZC1saW5rJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgdmFyIGlkID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpLFxuICAgICAgICAgICAgICAgIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgU3R1ZHlELnJlcXVlc3RBc3NheURhdGEoYXNzYXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgbGVmdFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIHRoaXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscylcbiAgICAgICAgICAgXTtcblxuICAgICAgICBtZXRhRGF0YUNvbHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDIgKyBpbmRleCwgdGhpcy5tYWtlTWV0YURhdGFDZWxsc0dlbmVyYXRvckZ1bmN0aW9uKGlkKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiArIG1ldGFEYXRhQ29scy5sZW5ndGgsIHRoaXMuZ2VuZXJhdGVNZWFzdXJlbWVudE5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDMgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlVW5pdHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDQgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlQ291bnRDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDUgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlTWVhc3VyaW5nVGltZXNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYgKyBtZXRhRGF0YUNvbHMubGVuZ3RoLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICB2YXIgdG9wU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdOYW1lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHZhciBtZXRhRGF0YUNvbEdyb3VwczpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgICAgICBtZXRhRGF0YUNvbEdyb3VwcyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmVtZW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnVW5pdHMnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDb3VudCcsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmluZyBUaW1lcycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHN1YnN0cmluZyBzZWFyY2hpbmdcbiAgICAgICAgdmFyIHNlYXJjaEFzc2F5c1dpZGdldCA9IG5ldyBER0Fzc2F5c1NlYXJjaFdpZGdldChkYXRhR3JpZCwgdGhpcywgJ1NlYXJjaCBBc3NheXMnLCAzMCxcbiAgICAgICAgICAgICAgICBmYWxzZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlYXJjaEFzc2F5c1dpZGdldCk7XG5cbiAgICAgICAgdmFyIGRlc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHRGVzZWxlY3RBbGxXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICBkZXNlbGVjdEFsbFdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGRlc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICAvLyBBIFwic2VsZWN0IGFsbFwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBBc3NheXNcbiAgICAgICAgdmFyIGRpc2FibGVkQXNzYXlzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRBc3NheXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZEFzc2F5c1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkQXNzYXlzKTp2b2lkIHtcblxuICAgICAgICAvLyBXaXJlIHVwIHRoZSAnYWN0aW9uIHBhbmVscycgZm9yIHRoZSBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgJCh0YWJsZSkub24oJ2NoYW5nZScsICc6Y2hlY2tib3gnLCAoKSA9PiBTdHVkeUQucXVldWVBc3NheXNBY3Rpb25QYW5lbFNob3coKSk7XG4gICAgICAgICQodGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gdGhpcy5yZWZyZXNoSURMaXN0KCkpO1xuXG4gICAgICAgIGlmICh0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdikge1xuICAgICAgICAgICAgJCh0aGlzLnVuZGlzY2xvc2VkU2VjdGlvbkRpdikuY2xpY2soKCkgPT4gZGF0YUdyaWQuY2xpY2tlZERpc2Nsb3NlKHRydWUpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vb24gcGFnZSBsb2FkIG9mIGRhdGEgaGlkZSBhc3NheXMgc2VjdGlvblxuICAgICAgICAkKCBcImlucHV0W25hbWUqPSdhc3NheXNTZWFyY2gnXVwiICkucGFyZW50cygndGhlYWQnKS5oaWRlKCk7XG4gICAgICAgIC8vIFJ1biBpdCBvbmNlIGluIGNhc2UgdGhlIHBhZ2Ugd2FzIGdlbmVyYXRlZCB3aXRoIGNoZWNrZWQgQXNzYXlzXG4gICAgICAgIFN0dWR5RC5xdWV1ZUFzc2F5c0FjdGlvblBhbmVsU2hvdygpO1xuICAgIH1cbn1cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIEFzc2F5cyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkQXNzYXlzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkKydTaG93REFzc2F5c0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayggKGUpID0+IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ1Nob3cgRGlzYWJsZWQnLCBjYklEKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIC8vIElmIHRoZSBib3ggaXMgY2hlY2tlZCwgcmV0dXJuIHRoZSBzZXQgb2YgSURzIHVuZmlsdGVyZWRcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH1cbi8vICAgICAgICAgLy8gSWYgdGhlIGJveCBpcyB1bmNoZWNrZWQsIHJldHVybiB0aGUgc2V0IGZpbHRlcmVkIElEc1xuICAgICAgICBlbHNlIHtcblxuICAgICAgICAgICAgdmFyIGZpbHRlcmVkSURzID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IHJvd0lEcy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgICAgIHZhciBpZCA9IHJvd0lEc1tyXTtcbiAgICAgICAgICAgICAgICAvLyBIZXJlIGlzIHRoZSBjb25kaXRpb24gdGhhdCBkZXRlcm1pbmVzIHdoZXRoZXIgdGhlIHJvd3MgYXNzb2NpYXRlZCB3aXRoIHRoaXMgSUQgYXJlXG4gICAgICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5c1tpZF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkSURzLnB1c2goaWQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaWx0ZXJlZElEcztcbiAgICB9XG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOmFueSk6YW55IHtcbiAgICAgICAgaWYgKCFFREREYXRhLkFzc2F5c1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBUaGlzIGlzIGEgRGF0YUdyaWRIZWFkZXJXaWRnZXQgZGVyaXZlZCBmcm9tIERHU2VhcmNoV2lkZ2V0LiBJdCdzIGEgc2VhcmNoIGZpZWxkIHRoYXQgb2ZmZXJzXG4vLyBvcHRpb25zIGZvciBhZGRpdGlvbmFsIGRhdGEgdHlwZXMsIHF1ZXJ5aW5nIHRoZSBzZXJ2ZXIgZm9yIHJlc3VsdHMuXG5jbGFzcyBER0Fzc2F5c1NlYXJjaFdpZGdldCBleHRlbmRzIERHU2VhcmNoV2lkZ2V0IHtcblxuICAgIHNlYXJjaERpc2Nsb3N1cmVFbGVtZW50OmFueTtcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6YW55LCBkYXRhR3JpZFNwZWM6YW55LCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLFxuICAgICAgICAgICAgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjLCBwbGFjZUhvbGRlciwgc2l6ZSwgZ2V0c0ZvY3VzKTtcbiAgICB9XG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9ucyB3aGVuIGNyZWF0aW5nIGlucHV0XG4gICAgLy8gZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBzdXBlci5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50cyBoYXZlXG4gICAgLy8gbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjphbnksIHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMoKSkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgfVxufVxuXG4vLyB1c2UgSlF1ZXJ5IHJlYWR5IGV2ZW50IHNob3J0Y3V0IHRvIGNhbGwgcHJlcGFyZUl0IHdoZW4gcGFnZSBpcyByZWFkeVxuJCgoKSA9PiBTdHVkeUQucHJlcGFyZUl0KCkpOyJdfQ==