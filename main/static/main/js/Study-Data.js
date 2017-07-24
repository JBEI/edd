// File last modified on: Mon Jul 24 2017 16:36:23  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="EDDGraphingTools.ts" />
/// <reference path="../typings/d3/d3.d.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var StudyDataPage;
(function (StudyDataPage) {
    'use strict';
    var viewingMode; // An enum: 'linegraph', 'bargraph', or 'table'
    var viewingModeIsStale;
    var barGraphMode; // an enum: 'time', 'line', 'measurement'
    var barGraphTypeButtonsJQ;
    var postFilteringAssays;
    var postFilteringMeasurements;
    var actionPanelRefreshTimer;
    var actionPanelIsInBottomBar;
    var refresDataDisplayIfStaleTimer;
    var remakeMainGraphAreaCalls = 0;
    var colorObj;
    // Table spec and table objects, one each per Protocol, for Assays.
    var assaysDataGridSpec;
    // For the filtering section on the main graph
    var ProgressiveFilteringWidget = (function () {
        // MeasurementGroupCode: Need to initialize each filter list.
        function ProgressiveFilteringWidget() {
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
        // Read through the Lines, Assays, and AssayMeasurements structures to learn what types are present,
        // then instantiate the relevant subclasses of GenericFilterSection, to create a series of
        // columns for the filtering section under the main graph on the page.
        // This must be outside the constructor because EDDData.Lines and EDDData.Assays are not immediately available
        // on page load.
        // MeasurementGroupCode: Need to create and add relevant filters for each group.
        ProgressiveFilteringWidget.prototype.prepareFilteringSection = function () {
            var seenInLinesHash = {};
            var seenInAssaysHash = {};
            this.filterTableJQ = $('<div>').addClass('filterTable');
            $('#mainFilterSection').append(this.filterTableJQ);
            // First do some basic sanity filtering on the list
            $.each(EDDData.Assays, function (assayId, assay) {
                var line = EDDData.Lines[assay.lid];
                if (!line || !line.active)
                    return;
                $.each(assay.meta || [], function (metadataId) { seenInAssaysHash[metadataId] = true; });
                $.each(line.meta || [], function (metadataId) { seenInLinesHash[metadataId] = true; });
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
            this.measurementFilters.push(new GeneralMeasurementFilterSection());
            // All filter sections are constructed; now need to call configure() on all
            this.allFilters = [].concat(assayFilters, this.metaboliteFilters, this.proteinFilters, this.geneFilters, this.measurementFilters);
            this.allFilters.forEach(function (section) { return section.configure(); });
            // We can initialize all the Assay- and Line-level filters immediately
            this.assayFilters = assayFilters;
            this.repopulateLineFilters();
            this.repopulateColumns();
        };
        // Clear out any old filters in the filtering section, and add in the ones that
        // claim to be "useful".
        ProgressiveFilteringWidget.prototype.repopulateColumns = function () {
            var _this = this;
            var dark = false;
            $.each(this.allFilters, function (i, widget) {
                if (widget.isFilterUseful()) {
                    widget.addToParent(_this.filterTableJQ[0]);
                    dark = !dark;
                }
                else {
                    widget.detach();
                }
            });
        };
        // Given a set of measurement records and a dictionary of corresponding types
        // (passed down from the server as a result of a data request), sort them into
        // their various categories, and flag them as available for popualting the
        // filtering section.  Then call to repopulate the filtering based on the expanded sets.
        ProgressiveFilteringWidget.prototype.processIncomingMeasurementRecords = function (measures, types) {
            var _this = this;
            // loop over all downloaded measurements. measures corresponds to AssayMeasurements
            $.each(measures || {}, function (index, measurement) {
                var assay = EDDData.Assays[measurement.assay], line, mtype;
                // If we've seen it already (rather unlikely), skip it.
                if (_this.accumulatedRecordIDs.seenRecordFlags[measurement.id]) {
                    return;
                }
                _this.accumulatedRecordIDs.seenRecordFlags[measurement.id] = true;
                if (!assay) {
                    return;
                }
                ;
                line = EDDData.Lines[assay.lid];
                if (!line || !line.active) {
                    return;
                }
                ;
                mtype = types[measurement.type] || {};
                if (mtype.family === 'm') {
                    _this.accumulatedRecordIDs.metaboliteIDs.push(measurement.id);
                }
                else if (mtype.family === 'p') {
                    _this.accumulatedRecordIDs.proteinIDs.push(measurement.id);
                }
                else if (mtype.family === 'g') {
                    _this.accumulatedRecordIDs.geneIDs.push(measurement.id);
                }
                else {
                    // throw everything else in a general area
                    _this.accumulatedRecordIDs.measurementIDs.push(measurement.id);
                }
            });
            this.repopulateAllFilters(); // Skip the queue - we need to repopulate immediately
        };
        ProgressiveFilteringWidget.prototype.repopulateAllFilters = function () {
            this.repopulateLineFilters();
            this.repopulateMeasurementFilters();
            this.repopulateColumns();
        };
        ProgressiveFilteringWidget.prototype.repopulateLineFilters = function () {
            var filteredAssayIds = this.buildAssayIDSet();
            this.assayFilters.forEach(function (filter) {
                filter.populateFilterFromRecordIDs(filteredAssayIds);
                filter.populateTable();
            });
        };
        ProgressiveFilteringWidget.prototype.repopulateMeasurementFilters = function () {
            var filterDisabled;
            var process;
            var m = this.accumulatedRecordIDs.metaboliteIDs;
            var p = this.accumulatedRecordIDs.proteinIDs;
            var g = this.accumulatedRecordIDs.geneIDs;
            var gen = this.accumulatedRecordIDs.measurementIDs;
            if (!this.showingDisabled) {
                filterDisabled = function (measureId) {
                    var measure = EDDData.AssayMeasurements[measureId];
                    if (!measure) {
                        return false;
                    }
                    var assay = EDDData.Assays[measure.assay];
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
            process = function (ids, i, widget) {
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
        };
        // Build a list of all the Assay IDs in the Study.
        ProgressiveFilteringWidget.prototype.buildAssayIDSet = function () {
            var _this = this;
            var assayIds = [];
            $.each(EDDData.Assays, function (assayId, assay) {
                var line = EDDData.Lines[assay.lid];
                if (!line || !line.active)
                    return;
                if (!assay.active && !_this.showingDisabled)
                    return;
                if (!assay.count && !_this.showingEmpty)
                    return;
                assayIds.push(assayId);
            });
            return assayIds;
        };
        // Check if the global settings for the filtering section are different, and rebuild the
        // sections if so.  Then, starting with a list of all the Assay IDs in the Study, we loop it through the
        // Line and Assay-level filters, causing the filters to refresh their UI, narrowing the set down.
        // We resolve the resulting set of Assay IDs into measurement IDs, then pass them on to the
        // measurement-level filters.  In the end we return a set of measurement IDs representing the
        // end result of all the filters, suitable for passing to the graphing functions.
        // MeasurementGroupCode: Need to process each group separately here.
        ProgressiveFilteringWidget.prototype.buildFilteredMeasurements = function () {
            var showingDisabledCB = !!($('#filteringShowDisabledCheckbox').prop('checked'));
            var showingEmptyCB = !!($('#filteringShowEmptyCheckbox').prop('checked'));
            if ((this.showingDisabled != showingDisabledCB) || (this.showingEmpty != showingEmptyCB)) {
                this.showingDisabled = showingDisabledCB;
                this.showingEmpty = showingEmptyCB;
                this.repopulateAllFilters();
            }
            var filteredAssayIds = this.buildAssayIDSet();
            var filteringResults = {};
            filteringResults['allAssays'] = filteredAssayIds;
            $.each(this.assayFilters, function (i, filter) {
                filteredAssayIds = filter.applyProgressiveFiltering(filteredAssayIds);
                filteringResults[filter.sectionShortLabel] = filteredAssayIds;
            });
            filteringResults['filteredAssays'] = filteredAssayIds;
            var measurementIds = [];
            $.each(filteredAssayIds, function (i, assayId) {
                var assay = EDDData.Assays[assayId];
                $.merge(measurementIds, assay.measures || []);
            });
            filteringResults['allMeasurements'] = measurementIds;
            // We start out with four references to the array of available measurement IDs, one for each major category.
            // Each of these will become its own array in turn as we narrow it down.
            // This is to prevent a sub-selection in one category from overriding a sub-selection in the others.
            var metaboliteMeasurements = measurementIds;
            var proteinMeasurements = measurementIds;
            var geneMeasurements = measurementIds;
            var genericMeasurements = measurementIds;
            // Note that we only try to filter if we got measurements that apply to the widget types
            if (this.metaboliteDataPresent) {
                $.each(this.metaboliteFilters, function (i, filter) {
                    metaboliteMeasurements = filter.applyProgressiveFiltering(metaboliteMeasurements);
                    filteringResults[filter.sectionShortLabel] = metaboliteMeasurements;
                });
            }
            if (this.proteinDataPresent) {
                $.each(this.proteinFilters, function (i, filter) {
                    proteinMeasurements = filter.applyProgressiveFiltering(proteinMeasurements);
                    filteringResults[filter.sectionShortLabel] = proteinMeasurements;
                });
            }
            if (this.geneDataPresent) {
                $.each(this.geneFilters, function (i, filter) {
                    geneMeasurements = filter.applyProgressiveFiltering(geneMeasurements);
                    filteringResults[filter.sectionShortLabel] = geneMeasurements;
                });
            }
            if (this.genericDataPresent) {
                $.each(this.measurementFilters, function (i, filter) {
                    genericMeasurements = filter.applyProgressiveFiltering(genericMeasurements);
                    filteringResults[filter.sectionShortLabel] = genericMeasurements;
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
                filteringResults['filteredMeasurements'] = dSM;
            }
            else {
                filteringResults['filteredMeasurements'] = measurementIds;
            }
            this.lastFilteringResults = filteringResults;
            return filteringResults;
        };
        // If any of the global filter settings or any of the settings in the individual filters
        // have changed, return true, indicating that the filter will generate different results if
        // queried.
        ProgressiveFilteringWidget.prototype.checkRedrawRequired = function (force) {
            var redraw = !!force;
            var showingDisabledCB = !!($('#filteringShowDisabledCheckbox').prop('checked'));
            var showingEmptyCB = !!($('#filteringShowEmptyCheckbox').prop('checked'));
            // We know the internal state differs, but we're not here to update it...
            if (this.showingDisabled != showingDisabledCB) {
                redraw = true;
            }
            if (this.showingEmpty != showingEmptyCB) {
                redraw = true;
            }
            // Walk down the filter widget list.  If we encounter one whose collective checkbox
            // state has changed since we last made this walk, then a redraw is required. Note that
            // we should not skip this loop, even if we already know a redraw is required, since the
            // call to anyFilterSettingsChangedSinceLastInquiry sets internal state in the filter
            // widgets that we will use next time around.
            $.each(this.allFilters, function (i, filter) {
                if (filter.anyFilterSettingsChangedSinceLastInquiry()) {
                    redraw = true;
                }
            });
            return redraw;
        };
        return ProgressiveFilteringWidget;
    }());
    StudyDataPage.ProgressiveFilteringWidget = ProgressiveFilteringWidget;
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
            this.tableRows = {};
            this.checkboxes = {};
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
            // We need two clear icons for the two versions of the header (with search and without)
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
        // By calling updateUniqueIndexesHash, we go through the records and find all the unique
        // values in them (for the criteria this particular filter is based on.)
        // Next we create an inverted version of that data structure, so that the unique identifiers
        // we've created map to the values they represent, as well as an array
        // of the unique identifiers sorted by the values.  These are what we'll use to construct
        // the rows of criteria visible in the filter's UI.
        GenericFilterSection.prototype.populateFilterFromRecordIDs = function (ids) {
            var crSet, cHash;
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
        };
        // In this function (or at least the subclassed versions of it) we are running through the given
        // list of measurement (or assay) IDs and examining their records and related records,
        // locating the particular field we are interested in, and creating a list of all the
        // unique values for that field.  As we go, we mark each unique value with an integer UID,
        // and construct a hash resolving each record to one (or possibly more) of those integer UIDs.
        // This prepares us for quick filtering later on.
        // (This generic filter does nothing, leaving these structures blank.)
        GenericFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            this.filterHash = this.filterHash || {};
            this.uniqueIndexes = this.uniqueIndexes || {};
        };
        // If we didn't come up with 2 or more criteria, there is no point in displaying the filter,
        // since it doesn't represent a meaningful choice.
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
        // Runs through the values in uniqueValuesOrder, adding a checkbox and label for each
        // filtering value represented.  If there are more than 15 values, the filter gets
        // a search box and scrollbar.
        // The checkbox, and the table row that encloses the checkbox and label, are saved in
        // a dictionary mapped by the unique value they represent, so they can be re-used if the
        // filter is rebuilt (i.e. if populateTable is called again.)
        GenericFilterSection.prototype.populateTable = function () {
            var _this = this;
            var fCol = $(this.filterColumnDiv);
            fCol.children().detach();
            // Only use the scrolling container div if the size of the list warrants it, because
            // the scrolling container div declares a large padding margin for the scroll bar,
            // and that padding margin would be an empty waste of space otherwise.
            if (this.uniqueValuesOrder.length > 10) {
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
            // line label color based on graph color of line
            if (this.sectionTitle === "Line") {
                var colors = {};
                //create new colors object with line names a keys and color hex as values
                for (var key in EDDData.Lines) {
                    colors[EDDData.Lines[key].name] = colorObj[key];
                }
            }
            // For each value, if a table row isn't already defined, build one.
            // There's extra code in here to assign colors to rows in the Lines filter
            // which should probably be isolated in a subclass.
            this.uniqueValuesOrder.forEach(function (uniqueId) {
                var cboxName, cell, p, q, r;
                cboxName = ['filter', _this.sectionShortLabel, 'n', uniqueId, 'cbox'].join('');
                var row = _this.tableRows[_this.uniqueValues[uniqueId]];
                if (!row) {
                    // No need to append a new row in a separate call:
                    // insertRow() creates, and appends, and returns one.
                    _this.tableRows[_this.uniqueValues[uniqueId]] = _this.tableBodyElement.insertRow();
                    cell = _this.tableRows[_this.uniqueValues[uniqueId]].insertCell();
                    _this.checkboxes[_this.uniqueValues[uniqueId]] = $("<input type='checkbox'>")
                        .attr({ 'name': cboxName, 'id': cboxName })
                        .appendTo(cell);
                    var label = $('<label>').attr('for', cboxName).text(_this.uniqueValues[uniqueId])
                        .appendTo(cell);
                    if (_this.sectionTitle === "Line") {
                        label.css('font-weight', 'Bold');
                        for (var key in EDDData.Lines) {
                            if (EDDData.Lines[key].name == _this.uniqueValues[uniqueId]) {
                                (EDDData.Lines[key]['identifier'] = cboxName);
                            }
                        }
                    }
                }
                else {
                    $(row).appendTo(_this.tableBodyElement);
                }
            });
            // TODO: Drag select is twitchy - clicking a table cell background should check the box,
            // even if the user isn't hitting the label or the checkbox itself.
            // Fixing this may mean adding additional code to the mousedown/mouseover handler for the
            // whole table (currently in StudyDataPage.prepareIt()).
            Dragboxes.initTable(this.filteringTable);
        };
        // Returns true if any of this filter's UI (checkboxes, search field)
        // shows a different state than when this function was last called.
        // This is accomplished by keeping a dictionary - previousCheckboxState - that is organized by
        // the same unique criteria values as the checkboxes.
        // We build a relpacement for this dictionary, and compare its contents with the old one.
        // Each checkbox can have one of three prior states, each represented in the dictionary by a letter:
        // "C" - checked, "U" - unchecked, "N" - doesn't exist (in the currently visible set.)
        // We also compare the current content of the search box with the old content.
        // Note: Regardless of where or whether we find a difference, it is important that we finish
        // building the replacement version of previousCheckboxState.
        // So though it's tempting to exit early from these loops, it would make a mess.
        GenericFilterSection.prototype.anyFilterSettingsChangedSinceLastInquiry = function () {
            var _this = this;
            var changed = false, currentCheckboxState = {}, v = $(this.searchBox).val();
            this.anyCheckboxesChecked = false;
            this.uniqueValuesOrder.forEach(function (uniqueId) {
                var checkbox = _this.checkboxes[_this.uniqueValues[uniqueId]];
                var current, previous;
                // "C" - checked, "U" - unchecked, "N" - doesn't exist
                current = (checkbox.prop('checked') && !checkbox.prop('disabled')) ? 'C' : 'U';
                previous = _this.previousCheckboxState[_this.uniqueValues[uniqueId]] || 'N';
                if (current !== previous)
                    changed = true;
                if (current === 'C')
                    _this.anyCheckboxesChecked = true;
                currentCheckboxState[_this.uniqueValues[uniqueId]] = current;
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
                $.each(this.previousCheckboxState, function (uniqueValue) {
                    if (currentCheckboxState[uniqueValue] === undefined) {
                        changed = true;
                        // If it was taken out of the set, clear it so it will be
                        // blank when re-added later.
                        _this.checkboxes[uniqueValue].prop('checked', false);
                    }
                });
            }
            this.previousCheckboxState = currentCheckboxState;
            return changed;
        };
        // Takes a set of record IDs, and if any checkboxes in the filter's UI are checked,
        // the ID set is narrowed down to only those records that contain the checked values.
        // In addition, checkboxes whose values are not represented anywhere in the incoming IDs
        // are temporarily disabled and sorted to the bottom of the list, visually indicating
        // to a user that those values are not available for further filtering.
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
            idsPostFiltering = ids.filter(function (id) {
                var pass = false;
                // If we have filtering data for this id, use it.
                // If we don't, the id probably belongs to some other measurement category,
                // so we ignore it.
                if (_this.filterHash[id]) {
                    // If any of this ID's criteria are checked, this ID passes the filter.
                    // Note that we cannot optimize to use '.some' here becuase we need to
                    // loop through all the criteria to set valuesVisiblePreFiltering.
                    _this.filterHash[id].forEach(function (index) {
                        var match = true, text;
                        if (useSearchBox) {
                            text = _this.uniqueValues[index].toLowerCase();
                            match = queryStrs.some(function (v) {
                                return text.length >= v.length && text.indexOf(v) >= 0;
                            });
                        }
                        if (match) {
                            valuesVisiblePreFiltering[index] = 1;
                            if ((_this.previousCheckboxState[_this.uniqueValues[index]] === 'C') || !_this.anyCheckboxesChecked) {
                                pass = true;
                            }
                        }
                    });
                }
                return pass;
            });
            // Apply enabled/disabled status and ordering:
            var rowsToAppend = [];
            this.uniqueValuesOrder.forEach(function (crID) {
                var checkbox = _this.checkboxes[_this.uniqueValues[crID]], row = _this.tableRows[_this.uniqueValues[crID]], show = !!valuesVisiblePreFiltering[crID];
                checkbox.prop('disabled', !show);
                $(row).toggleClass('nodata', !show);
                if (show) {
                    _this.tableBodyElement.appendChild(row);
                }
                else {
                    rowsToAppend.push(row);
                }
            });
            // Append all the rows we disabled, as a last step,
            // so they go to the bottom of the table.
            rowsToAppend.forEach(function (row) { return _this.tableBodyElement.appendChild(row); });
            return idsPostFiltering;
        };
        // A few utility functions:
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
        return GenericFilterSection;
    }());
    StudyDataPage.GenericFilterSection = GenericFilterSection;
    // One of the highest-level filters: Strain.
    // Note that an Assay's Line can have more than one Strain assigned to it,
    // which is an example of why 'this.filterHash' is built with arrays.
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
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.StrainFilterSection = StrainFilterSection;
    // Just as with the Strain filter, an Assay's Line can have more than one
    // Carbon Source assigned to it.
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
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.CarbonSourceFilterSection = CarbonSourceFilterSection;
    // A filter for the 'Carbon Source Labeling' field for each Assay's Line
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
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.CarbonLabelingFilterSection = CarbonLabelingFilterSection;
    // A filter for the name of each Assay's Line
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
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.LineNameFilterSection = LineNameFilterSection;
    // A filter for the Protocol of each Assay
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
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.ProtocolFilterSection = ProtocolFilterSection;
    // A filter for the name of each Assay
    var AssayFilterSection = (function (_super) {
        __extends(AssayFilterSection, _super);
        function AssayFilterSection() {
            _super.apply(this, arguments);
        }
        AssayFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Assay', 'a');
        };
        AssayFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var assay = _this._assayIdToAssay(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                if (assay.name) {
                    _this.uniqueIndexes[assay.name] = _this.uniqueIndexes[assay.name] || ++_this.uniqueIndexCounter;
                    _this.filterHash[assayId].push(_this.uniqueIndexes[assay.name]);
                }
            });
        };
        return AssayFilterSection;
    }(GenericFilterSection));
    StudyDataPage.AssayFilterSection = AssayFilterSection;
    // A class defining some additional logic for metadata-type filters,
    // meant to be subclassed.  Note how we pass in the particular metadata we
    // are constructing this filter for, in the constructor.
    // Unlike the other filters, we will be instantiating more than one of these.
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
    StudyDataPage.MetaDataFilterSection = MetaDataFilterSection;
    var LineMetaDataFilterSection = (function (_super) {
        __extends(LineMetaDataFilterSection, _super);
        function LineMetaDataFilterSection() {
            _super.apply(this, arguments);
        }
        LineMetaDataFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.LineMetaDataFilterSection = LineMetaDataFilterSection;
    var AssayMetaDataFilterSection = (function (_super) {
        __extends(AssayMetaDataFilterSection, _super);
        function AssayMetaDataFilterSection() {
            _super.apply(this, arguments);
        }
        AssayMetaDataFilterSection.prototype.updateUniqueIndexesHash = function (ids) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.AssayMetaDataFilterSection = AssayMetaDataFilterSection;
    // These remaining filters work on Measurement IDs rather than Assay IDs.
    // A filter for the compartment of each Metabolite.
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
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    StudyDataPage.MetaboliteCompartmentFilterSection = MetaboliteCompartmentFilterSection;
    // A generic filter for Measurements, meant to be subclassed.
    // It introduces a 'loadPending' attribute, which is used to make the filter
    // appear in the UI even if it has no data, because we anticipate data to eventually
    // appear in it.
    //      The idea is, we know whether to instantiate a given subclass of this filter by
    // looking at the measurement count for each Assay, which is given to us in the first
    // chunk of data from the server.  So, we instantiate it, then it appears in a
    // 'load pending' state until actual measurement values are received from the server.
    var MeasurementFilterSection = (function (_super) {
        __extends(MeasurementFilterSection, _super);
        function MeasurementFilterSection() {
            _super.apply(this, arguments);
        }
        MeasurementFilterSection.prototype.configure = function (title, shortLabel) {
            this.loadPending = true;
            _super.prototype.configure.call(this, title, shortLabel);
        };
        // Overriding to make use of loadPending.
        MeasurementFilterSection.prototype.isFilterUseful = function () {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        };
        return MeasurementFilterSection;
    }(GenericFilterSection));
    StudyDataPage.MeasurementFilterSection = MeasurementFilterSection;
    // A filter for the names of General Measurements.
    var GeneralMeasurementFilterSection = (function (_super) {
        __extends(GeneralMeasurementFilterSection, _super);
        function GeneralMeasurementFilterSection() {
            _super.apply(this, arguments);
        }
        GeneralMeasurementFilterSection.prototype.configure = function () {
            this.loadPending = true;
            _super.prototype.configure.call(this, 'Measurement', 'mm');
        };
        GeneralMeasurementFilterSection.prototype.isFilterUseful = function () {
            return this.loadPending || this.uniqueValuesOrder.length > 0;
        };
        GeneralMeasurementFilterSection.prototype.updateUniqueIndexesHash = function (mIds) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
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
        return GeneralMeasurementFilterSection;
    }(MeasurementFilterSection));
    StudyDataPage.GeneralMeasurementFilterSection = GeneralMeasurementFilterSection;
    // A filter for the names of Metabolite Measurements.
    var MetaboliteFilterSection = (function (_super) {
        __extends(MetaboliteFilterSection, _super);
        function MetaboliteFilterSection() {
            _super.apply(this, arguments);
        }
        MetaboliteFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Metabolite', 'me');
        };
        MetaboliteFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    }(MeasurementFilterSection));
    StudyDataPage.MetaboliteFilterSection = MetaboliteFilterSection;
    // A filter for the names of Protein Measurements.
    var ProteinFilterSection = (function (_super) {
        __extends(ProteinFilterSection, _super);
        function ProteinFilterSection() {
            _super.apply(this, arguments);
        }
        ProteinFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Protein', 'pr');
        };
        ProteinFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    }(MeasurementFilterSection));
    StudyDataPage.ProteinFilterSection = ProteinFilterSection;
    // A filter for the names of Gene Measurements.
    var GeneFilterSection = (function (_super) {
        __extends(GeneFilterSection, _super);
        function GeneFilterSection() {
            _super.apply(this, arguments);
        }
        GeneFilterSection.prototype.configure = function () {
            _super.prototype.configure.call(this, 'Gene', 'gn');
        };
        GeneFilterSection.prototype.updateUniqueIndexesHash = function (amIDs) {
            var _this = this;
            this.uniqueIndexes = {};
            this.filterHash = {};
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
    }(MeasurementFilterSection));
    StudyDataPage.GeneFilterSection = GeneFilterSection;
    // Called when the page loads.
    function prepareIt() {
        StudyDataPage.progressiveFilteringWidget = new ProgressiveFilteringWidget();
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
        StudyDataPage.assaysDataGrid = null;
        actionPanelRefreshTimer = null;
        $('#studyAssaysTable').tooltip({
            content: function () {
                return $(this).prop('title');
            },
            position: { my: "left-50 center", at: "right center" },
            show: null,
            close: function (event, ui) {
                ui.tooltip.hover(function () {
                    $(this).stop(true).fadeTo(400, 1);
                }, function () {
                    $(this).fadeOut("400", function () {
                        $(this).remove();
                    });
                });
            }
        });
        // This only adds code that turns the other buttons off when a button is made active,
        // and does the same to elements named in the 'for' attributes of each button.
        // We still need to add our own responders to actually do stuff.
        Utl.ButtonBar.prepareButtonBars();
        copyActionButtons();
        // Prepend show/hide filter button for better alignment
        // Note: this will be removed when we implement left side filtering
        //when all ajax requests are finished, determine if there are AssayMeasurements.
        $(document).ajaxStop(function () {
            // show assay table by default if there are assays but no assay measurements
            if (_.keys(EDDData.Assays).length > 0 && _.keys(EDDData.AssayMeasurements).length === 0) {
                //TODO: create prepare it for no data?
                $('#dataTableButton').click();
                $('.exportButton').prop('disabled', true);
            }
            else {
                $('.exportButton').prop('disabled', false);
            }
        });
        $("#dataTableButton").click(function () {
            viewingMode = 'table';
            queueActionPanelRefresh();
            makeLabelsBlack(EDDGraphingTools.labels);
            $("#tableControlsArea").removeClass('off');
            $("#filterControlsArea").addClass('off');
            $(".tableActionButtons").removeClass('off');
            barGraphTypeButtonsJQ.addClass('off');
            queueRefreshDataDisplayIfStale();
            //TODO: enable users to export filtered data from graph
            $('.exportButton').removeClass('off');
        });
        //click handler for edit assay measurements
        $('.editMeasurementButton').click(function (ev) {
            ev.preventDefault();
            $('input[name="assay_action"][value="edit"]').prop('checked', true);
            $('button[value="assay_action"]').click();
            return false;
        });
        //click handler for delete assay measurements
        $('.deleteButton').click(function (ev) {
            ev.preventDefault();
            $('input[name="assay_action"][value="delete"]').prop('checked', true);
            $('button[value="assay_action"]').click();
            return false;
        });
        //click handler for export assay measurements
        $('.exportButton').click(function (ev) {
            ev.preventDefault();
            includeAllLinesIfEmpty();
            $('input[value="export"]').prop('checked', true);
            $('button[value="assay_action"]').click();
            return false;
        });
        //click handler for disable assay measurements
        $('.disableButton').click(function (ev) {
            ev.preventDefault();
            $('input[value="mark"]').prop('checked', true);
            $('select[name="disable"]').val('true');
            $('button[value="assay_action"]').click();
            return false;
        });
        //click handler for re-enable assay measurements
        $('.enableButton').click(function (ev) {
            ev.preventDefault();
            $('input[value="mark"]').prop('checked', true);
            $('select[name="disable"]').val('false');
            $('button[value="assay_action"]').click();
            return false;
        });
        // This one is active by default
        $("#lineGraphButton").click(function () {
            $('.exportButton, #tableControlsArea, .tableActionButtons').addClass('off');
            $('#filterControlsArea').removeClass('off');
            queueActionPanelRefresh();
            viewingMode = 'linegraph';
            updateGraphViewFlag({ 'buttonElem': "#lineGraphButton", 'type': viewingMode,
                'study_id': EDDData.currentStudyID });
            barGraphTypeButtonsJQ.addClass('off');
            $('#lineGraph').removeClass('off');
            $('#barGraphByTime').addClass('off');
            $('#barGraphByLine').addClass('off');
            $('#barGraphByMeasurement').addClass('off');
            $('#mainFilterSection').appendTo('#content');
            queueRefreshDataDisplayIfStale();
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
        $("#barGraphButton").click(function () {
            $('.exportButton, #tableControlsArea, .tableActionButtons').addClass('off');
            $('#filterControlsArea').removeClass('off');
            queueActionPanelRefresh();
            viewingMode = 'bargraph';
            barGraphTypeButtonsJQ.removeClass('off');
            $('#lineGraph').addClass('off');
            $('#barGraphByTime').toggleClass('off', 'time' !== barGraphMode);
            $('#barGraphByLine').toggleClass('off', 'line' !== barGraphMode);
            $('#barGraphByMeasurement').toggleClass('off', 'measurement' !== barGraphMode);
            queueRefreshDataDisplayIfStale();
            $('#mainFilterSection').appendTo('#content');
            updateGraphViewFlag({ 'buttonElem': '#measurementBarGraphButton', 'type': barGraphMode,
                'study_id': EDDData.currentStudyID });
        });
        $("#timeBarGraphButton").click(function () {
            barGraphMode = 'time';
            updateGraphViewFlag({ 'buttonElem': "#timeBarGraphButton", 'type': barGraphMode,
                'study_id': EDDData.currentStudyID });
            queueRefreshDataDisplayIfStale();
        });
        $("#lineBarGraphButton").click(function () {
            barGraphMode = 'line';
            updateGraphViewFlag({ 'buttonElem': '#lineBarGraphButton', 'type': barGraphMode,
                'study_id': EDDData.currentStudyID });
            queueRefreshDataDisplayIfStale();
        });
        $("#measurementBarGraphButton").click(function () {
            barGraphMode = 'measurement';
            updateGraphViewFlag({ 'buttonElem': '#measurementBarGraphButton', 'type': barGraphMode,
                'study_id': EDDData.currentStudyID });
            queueRefreshDataDisplayIfStale();
            $('#graphLoading').addClass('off');
        });
        //hides/shows filter section.
        var hideButtons = $('.hideFilterSection');
        hideButtons.click(function (event) {
            var self = $(this), old, replace;
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
        menuLabel.click(function () {
            if (menuLabel.hasClass('pulldownMenuLabelOff')) {
                menuLabel.removeClass('pulldownMenuLabelOff').addClass('pulldownMenuLabelOn');
                $('#filterControlsMenu > div.pulldownMenuMenuBlock').removeClass('off');
            }
        });
        // event handlers to hide menu if clicking outside menu block or pressing ESC
        $(document).click(function (ev) {
            var t = $(ev.target);
            if (t.closest($('#filterControlsMenu').get(0)).length === 0) {
                menuLabel.removeClass('pulldownMenuLabelOn').addClass('pulldownMenuLabelOff');
                $('#filterControlsMenu > div.pulldownMenuMenuBlock').addClass('off');
            }
        }).keydown(function (ev) {
            if (ev.keyCode === 27) {
                menuLabel.removeClass('pulldownMenuLabelOn').addClass('pulldownMenuLabelOff');
                $('#filterControlsMenu > div.pulldownMenuMenuBlock').addClass('off');
            }
        });
        fetchEDDData(onSuccess);
        fetchSettings('measurement-' + EDDData.currentStudyID, function (data) {
            if (data.type === 'linegraph') {
                $(data.buttonElem).click();
            }
            else if (typeof (data.type) === 'undefined') {
                return;
            }
            else if (data.type === 'measurement') {
                $("#barGraphButton").click();
            }
            else {
                $("#barGraphButton").click();
                $(data.buttonElem).click();
            }
        }, []);
        // Set up the Add Measurement to Assay modal
        $("#addMeasurement").dialog({
            minWidth: 500,
            autoOpen: false
        });
        $(".addMeasurementButton").click(function () {
            $("#addMeasurement").removeClass('off').dialog("open");
            return false;
        });
        // Callbacks to respond to the filtering section
        $('#mainFilterSection').on('mouseover mousedown mouseup', queueRefreshDataDisplayIfStale.bind(this))
            .on('keydown', filterTableKeyDown.bind(this));
    }
    StudyDataPage.prepareIt = prepareIt;
    function basePayload() {
        var token = document.cookie.replace(/(?:(?:^|.*;\s*)csrftoken\s*\=\s*([^;]*).*$)|^.*$/, '$1');
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
        var original, copy;
        original = $('#assaysActionPanel');
        copy = original.clone().appendTo('#bottomBar').attr('id', 'copyActionPanel').hide();
        // forward click events on copy to the original button
        copy.on('click', '.actionButton', function (e) {
            original.find('#' + e.target.id).trigger(e);
        });
    }
    function fetchEDDData(success) {
        $.ajax({
            'url': 'edddata/',
            'type': 'GET',
            'error': function (xhr, status, e) {
                $('#content').prepend("<div class='noData'>Error. Please reload</div>");
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': success
        });
    }
    StudyDataPage.fetchEDDData = fetchEDDData;
    function fetchSettings(propKey, callback, defaultValue) {
        $.ajax('/profile/settings/' + propKey, {
            'dataType': 'json',
            'success': function (data) {
                data = data || defaultValue;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    }
                    catch (e) { }
                }
                callback.call({}, data);
            }
        });
    }
    StudyDataPage.fetchSettings = fetchSettings;
    function onSuccess(data) {
        EDDData = $.extend(EDDData || {}, data);
        colorObj = EDDGraphingTools.renderColor(EDDData.Lines);
        StudyDataPage.progressiveFilteringWidget.prepareFilteringSection();
        $('#filteringShowDisabledCheckbox, #filteringShowEmptyCheckbox').change(function () {
            queueRefreshDataDisplayIfStale();
        });
        fetchMeasurements(EDDData);
    }
    function fetchMeasurements(EDDData) {
        var _this = this;
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
            case 9: // tab
            case 13:
                return;
            default:
                // ignore if the following keys are pressed: [shift] [capslock]
                if (e.keyCode > 8 && e.keyCode < 32) {
                    return;
                }
                queueRefreshDataDisplayIfStale();
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
    StudyDataPage.requestAssayData = requestAssayData;
    function processMeasurementData(protocol, data) {
        var assaySeen = {}, protocolToAssay = {}, count_total = 0, count_rec = 0;
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);
        // attach measurement counts to each assay
        $.each(data.total_measures, function (assayId, count) {
            var assay = EDDData.Assays[assayId];
            if (assay) {
                // TODO: If we ever fetch by something other than protocol,
                // Isn't there a chance this is cumulative, and we should += ?
                assay.count = count;
                count_total += count;
            }
        });
        // loop over all downloaded measurements
        $.each(data.measures || {}, function (index, measurement) {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            ++count_rec;
            if (!assay || assay.count === undefined)
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
        StudyDataPage.progressiveFilteringWidget.processIncomingMeasurementRecords(data.measures || {}, data.types);
        if (count_rec < count_total) {
        }
        queueRefreshDataDisplayIfStale();
    }
    function queueRefreshDataDisplayIfStale() {
        if (refresDataDisplayIfStaleTimer) {
            clearTimeout(refresDataDisplayIfStaleTimer);
        }
        refresDataDisplayIfStaleTimer = setTimeout(refreshDataDisplayIfStale.bind(this), 100);
    }
    StudyDataPage.queueRefreshDataDisplayIfStale = queueRefreshDataDisplayIfStale;
    function queueActionPanelRefresh() {
        if (actionPanelRefreshTimer) {
            clearTimeout(actionPanelRefreshTimer);
        }
        actionPanelRefreshTimer = setTimeout(actionPanelRefresh.bind(this), 150);
    }
    StudyDataPage.queueActionPanelRefresh = queueActionPanelRefresh;
    // This function determines if the filtering sections (or settings related to them) have changed
    // since the last time we were in the current display mode (e.g. line graph, table, bar graph
    // in various modes, etc) and updates the display only if a change is detected.
    function refreshDataDisplayIfStale(force) {
        // Any switch between viewing modes, or change in filtering, is also cause to check the UI
        // in the action panel and make sure it's current.
        queueActionPanelRefresh();
        // If the filtering widget claims a change since the last inquiry,
        // then all the viewing modes are stale, no matter what.
        // So we mark them all.
        if (StudyDataPage.progressiveFilteringWidget.checkRedrawRequired(force)) {
            viewingModeIsStale['linegraph'] = true;
            viewingModeIsStale['bargraph-time'] = true;
            viewingModeIsStale['bargraph-line'] = true;
            viewingModeIsStale['bargraph-measurement'] = true;
            viewingModeIsStale['table'] = true;
            // Pull out a fresh set of filtered measurements and assays
            var filterResults = StudyDataPage.progressiveFilteringWidget.buildFilteredMeasurements();
            postFilteringMeasurements = filterResults['filteredMeasurements'];
            postFilteringAssays = filterResults['filteredAssays'];
        }
        else if (viewingMode == 'bargraph') {
            // Special case to handle the extra sub-modes of the bar graph
            if (!viewingModeIsStale[viewingMode + '-' + barGraphMode]) {
                return;
            }
        }
        else if (!viewingModeIsStale[viewingMode]) {
            return;
        }
        if (viewingMode == 'table') {
            if (assaysDataGridSpec === null) {
                assaysDataGridSpec = new DataGridSpecAssays();
                assaysDataGridSpec.init();
                StudyDataPage.assaysDataGrid = new DataGridAssays(assaysDataGridSpec);
            }
            else {
                StudyDataPage.assaysDataGrid.triggerDataReset();
            }
            viewingModeIsStale['table'] = false;
            makeLabelsBlack(EDDGraphingTools.labels);
        }
        else {
            remakeMainGraphArea();
            if (viewingMode == 'bargraph') {
                viewingModeIsStale[viewingMode + '-' + barGraphMode] = false;
            }
            else {
                viewingModeIsStale['linegraph'] = false;
            }
        }
    }
    function actionPanelRefresh() {
        var checkedBoxes, checkedAssays, checkedMeasure, nothingSelected, contentScrolling, filterInBottom;
        // Figure out how many assays/checkboxes are selected.
        // Don't show the selected item count if we're not looking at the table.
        // (Only the visible item count makes sense in that case.)
        if (viewingMode == 'table') {
            $('.displayedDiv').addClass('off');
            if (StudyDataPage.assaysDataGrid) {
                checkedBoxes = StudyDataPage.assaysDataGrid.getSelectedCheckboxElements();
            }
            else {
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
                    selectedStrs.push((checkedAssays > 1) ? (checkedAssays + " Assays") : "1 Assay");
                }
                if (checkedMeasure) {
                    selectedStrs.push((checkedMeasure > 1) ? (checkedMeasure + " Measurements") : "1 Measurement");
                }
                var selectedStr = selectedStrs.join(', ');
                $('.selectedDiv').text(selectedStr + ' selected');
            }
        }
        else {
            $('.selectedDiv').addClass('off');
            $('.displayedDiv').removeClass('off');
        }
        //if there are assays but no data, show empty assays
        //note: this is to combat the current default setting for showing graph on page load
        if (_.keys(EDDData.Assays).length > 0 && _.keys(EDDData.AssayMeasurements).length === 0) {
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
        }
        else if (!actionPanelIsInBottomBar && contentScrolling) {
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
            }
            else if (!filterInBottom && contentScrolling) {
                $('#mainFilterSection').appendTo('#bottomBar');
            }
        }
    }
    function isContentScrolling() {
        var viewHeight = 0, itemsHeight = 0;
        viewHeight = $('#content').height();
        $('#content').children().each(function (i, e) { itemsHeight += e.scrollHeight; });
        return viewHeight < itemsHeight;
    }
    function remakeMainGraphArea() {
        var dataPointsDisplayed = 0, dataPointsTotal = 0, dataSets = [];
        $('#tooManyPoints').hide();
        $('#lineGraph').addClass('off');
        $('#barGraphByTime').addClass('off');
        $('#barGraphByLine').addClass('off');
        $('#barGraphByMeasurement').addClass('off');
        // show message that there's no data to display
        if (postFilteringMeasurements.length === 0) {
            $('#graphLoading').addClass('off'); // Remove load spinner if still present
            $('#noData').removeClass('off');
            return;
        }
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
            name = assay.name;
            lineName = line.name;
            var label = $('#' + line['identifier']).next();
            if (_.keys(EDDData.Lines).length > 22) {
                color = changeLineColor(line, assay.lid);
            }
            else {
                color = colorObj[assay.lid];
            }
            if (remakeMainGraphAreaCalls < 1) {
                EDDGraphingTools.labels.push(label);
                color = colorObj[assay.lid];
                // update label color to line color
                $(label).css('color', color);
            }
            else if ($('#' + line['identifier']).prop('checked')) {
                // unchecked labels black
                makeLabelsBlack(EDDGraphingTools.labels);
                // update label color to line color
                if (color === null || color === undefined) {
                    color = colorObj[assay.lid];
                }
                $(label).css('color', color);
            }
            else {
                var count = noCheckedBoxes(EDDGraphingTools.labels);
                if (count === 0) {
                    EDDGraphingTools.nextColor = null;
                    addColor(EDDGraphingTools.labels, assay.lid);
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
                'lineName': lineName
            };
            singleAssayObj = EDDGraphingTools.transformSingleLineItem(dataObj);
            dataSets.push(singleAssayObj);
        });
        $('.displayedDiv').text(dataPointsDisplayed + " measurements displayed");
        $('#noData').addClass('off');
        remakeMainGraphAreaCalls++;
        uncheckEventHandler(EDDGraphingTools.labels);
        var barAssayObj = EDDGraphingTools.concatAssays(dataSets);
        //data for graphs
        var graphSet = {
            barAssayObj: EDDGraphingTools.concatAssays(dataSets),
            create_x_axis: EDDGraphingTools.createXAxis,
            create_right_y_axis: EDDGraphingTools.createRightYAxis,
            create_y_axis: EDDGraphingTools.createLeftYAxis,
            x_axis: EDDGraphingTools.make_x_axis,
            y_axis: EDDGraphingTools.make_right_y_axis,
            individualData: dataSets,
            assayMeasurements: barAssayObj,
            width: 750,
            height: 220
        };
        if (viewingMode == 'linegraph') {
            $('#lineGraph').empty().removeClass('off');
            var s = EDDGraphingTools.createSvg($('#lineGraph').get(0));
            EDDGraphingTools.createMultiLineGraph(graphSet, s);
        }
        else if (barGraphMode == 'time') {
            $('#barGraphByTime').empty().removeClass('off');
            var s = EDDGraphingTools.createSvg($('#barGraphByTime').get(0));
            createGroupedBarGraph(graphSet, s);
        }
        else if (barGraphMode == 'line') {
            $('#barGraphByLine').empty().removeClass('off');
            var s = EDDGraphingTools.createSvg($('#barGraphByLine').get(0));
            createGroupedBarGraph(graphSet, s);
        }
        else if (barGraphMode == 'measurement') {
            $('#barGraphByMeasurement').empty().removeClass('off');
            var s = EDDGraphingTools.createSvg($('#barGraphByMeasurement').get(0));
            createGroupedBarGraph(graphSet, s);
        }
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
     * @param assay
     * @returns labels
     */
    function addColor(labels, assay) {
        _.each(labels, function (label) {
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
        _.each(rectArray, function (rectElem) {
            if (rectElem.getAttribute("width") != 0) {
                sum++;
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
    function measurementType(types) {
        var proteomics = {};
        for (var type in types) {
            if (proteomics.hasOwnProperty(types[type].family)) {
                proteomics[types[type].family]++;
            }
            else {
                proteomics[types[type].family] = 0;
            }
        }
        for (var key in proteomics) {
            var max = 0;
            var maxType;
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
    function createGroupedBarGraph(graphSet, svg) {
        var assayMeasurements = graphSet.assayMeasurements, typeID = {
            'measurement': "#barGraphByMeasurement",
            'x': "#barGraphByTime",
            'name': '#barGraphByLine'
        }, modeToField = {
            'line': 'name',
            'time': 'x',
            'measurement': 'measurement'
        }, numUnits = EDDGraphingTools.howManyUnits(assayMeasurements), yRange = [], unitMeasurementData = [], yMin = [], data, nested, typeNames, xValues, yvalueIds, x_name, xValueLabels, sortedXvalues, div, x_xValue, lineID, meas, y, wordLength;
        var type = modeToField[barGraphMode];
        if (type === 'x') {
            var entries = d3.nest(type)
                .key(function (d) {
                return d[type];
            })
                .entries(assayMeasurements);
            var timeMeasurements = _.clone(assayMeasurements);
            var nestedByTime = EDDGraphingTools.findAllTime(entries);
            var howManyToInsertObj = EDDGraphingTools.findMaxTimeDifference(nestedByTime);
            var max = Math.max.apply(null, _.values(howManyToInsertObj));
            if (max > 400) {
                $(typeID[type]).prepend("<p class='noData'>Too many missing data fields. Please filter</p>");
                $('.tooMuchData').remove();
            }
            else {
                $('.noData').remove();
            }
            EDDGraphingTools.insertFakeValues(entries, howManyToInsertObj, timeMeasurements);
        }
        //x axis scale for type
        x_name = d3.scale.ordinal()
            .rangeRoundBands([0, graphSet.width], 0.1);
        //x axis scale for x values
        x_xValue = d3.scale.ordinal();
        //x axis scale for line id to differentiate multiple lines associated with the same name/type
        lineID = d3.scale.ordinal();
        // y axis range scale
        y = d3.scale.linear()
            .range([graphSet.height, 0]);
        div = d3.select("body").append("div")
            .attr("class", "tooltip2")
            .style("opacity", 0);
        var d3_entries = type === 'x' ? timeMeasurements : assayMeasurements;
        meas = d3.nest()
            .key(function (d) {
            return d.y_unit;
        })
            .entries(d3_entries);
        // if there is no data - show no data error message
        if (assayMeasurements.length === 0) {
            $(typeID[type]).prepend("<p class='noData'>No data selected - please " +
                "filter</p>");
            $('.tooMuchData').remove();
        }
        else {
            $('.noData').remove();
        }
        for (var i = 0; i < numUnits; i++) {
            yRange.push(d3.scale.linear().rangeRound([graphSet.height, 0]));
            unitMeasurementData.push(d3.nest()
                .key(function (d) {
                return d.y;
            })
                .entries(meas[i].values));
            yMin.push(d3.min(unitMeasurementData[i], function (d) {
                return d3.min(d.values, function (d) {
                    return d.y;
                });
            }));
        }
        if (type === 'x') {
            // nest data by type (ie measurement) and by x value
            nested = d3.nest(type)
                .key(function (d) {
                return d[type];
            })
                .key(function (d) {
                return parseFloat(d.x);
            })
                .entries(timeMeasurements);
        }
        else {
            // nest data by type (ie measurement) and by x value
            nested = d3.nest(type)
                .key(function (d) {
                return d[type];
            })
                .key(function (d) {
                return parseFloat(d.x);
            })
                .entries(assayMeasurements);
        }
        //insert y value to distinguish between lines
        data = EDDGraphingTools.getXYValues(nested);
        if (data.length === 0) {
            return svg;
        }
        //get type names for x labels
        typeNames = data.map(function (d) { return d.key; });
        //sort x values
        typeNames.sort(function (a, b) { return a - b; });
        xValues = data.map(function (d) { return d.values; });
        yvalueIds = data[0].values[0].values.map(function (d) { return d.key; });
        // returns time values
        xValueLabels = xValues[0].map(function (d) { return d.key; });
        //sort time values
        sortedXvalues = xValueLabels.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
        x_name.domain(typeNames);
        x_xValue.domain(sortedXvalues).rangeRoundBands([0, x_name.rangeBand()]);
        lineID.domain(yvalueIds).rangeRoundBands([0, x_xValue.rangeBand()]);
        // create x axis
        graphSet.create_x_axis(graphSet, x_name, svg, type);
        // loop through different units
        for (var index = 0; index < numUnits; index++) {
            if (yMin[index] > 0) {
                yMin[index] = 0;
            }
            //y axis min and max domain
            y.domain([yMin[index], d3.max(unitMeasurementData[index], function (d) {
                    return d3.max(d.values, function (d) {
                        return d.y;
                    });
                })]);
            //nest data associated with one unit by type and time value
            data = d3.nest(type)
                .key(function (d) {
                return d[type];
            })
                .key(function (d) {
                return parseFloat(d.x);
            })
                .entries(meas[index].values);
            // //hide values if there are different time points
            if (type != 'x') {
                var nestedByTime = EDDGraphingTools.findAllTime(data);
                var howManyToInsertObj = EDDGraphingTools.findMaxTimeDifference(nestedByTime);
                var max = Math.max.apply(null, _.values(howManyToInsertObj));
                var graphSvg = $(typeID[type])[0];
                if (max > 1) {
                    $('.tooMuchData').remove();
                    var arects = d3.selectAll(typeID[type] + ' rect')[0];
                    svgWidth(graphSvg, arects);
                    //get word length
                    wordLength = EDDGraphingTools.getSum(typeNames);
                    d3.selectAll(typeID[type] + ' .x.axis text').remove();
                    return svg;
                }
                else {
                    $('.noData').remove();
                }
            }
            //right axis
            if (index == 0) {
                graphSet.create_y_axis(graphSet, meas[index].key, y, svg);
            }
            else {
                var spacing = {
                    1: graphSet.width,
                    2: graphSet.width + 50,
                    3: graphSet.width + 100,
                    4: graphSet.width + 150
                };
                //create right axis
                graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
            }
            var names_g = svg.selectAll(".group" + index)
                .data(data)
                .enter().append("g")
                .attr("transform", function (d) {
                return "translate(" + x_name(d.key) + ",0)";
            });
            var categories_g = names_g.selectAll(".category" + index)
                .data(function (d) {
                return d.values;
            })
                .enter().append("g")
                .attr("transform", function (d) {
                return "translate(" + x_xValue(d.key) + ",0)";
            });
            var categories_labels = categories_g.selectAll('.category-label' + index)
                .data(function (d) {
                return [d.key];
            })
                .enter()
                .append("text")
                .attr("x", function () {
                return x_xValue.rangeBand() / 2;
            })
                .attr('y', function () {
                return graphSet.height + 27;
            })
                .attr('text-anchor', 'middle');
            var values_g = categories_g.selectAll(".value" + index)
                .data(function (d) {
                return d.values;
            })
                .enter().append("g")
                .attr("class", function (d) {
                d.lineName = d.lineName.split(' ').join('');
                d.lineName = d.lineName.split('/').join('');
                return 'value value-' + d.lineName;
            })
                .attr("transform", function (d) {
                return "translate(" + lineID(d.key) + ",0)";
            })
                .on('mouseover', function (d) {
                d3.selectAll('.value').style('opacity', 0.3);
                d3.selectAll('.value-' + d.lineName).style('opacity', 1);
            })
                .on('mouseout', function (d) {
                d3.selectAll('.value').style('opacity', 1);
            });
            var rects = values_g.selectAll('.rect' + index)
                .data(function (d) {
                return [d];
            })
                .enter().append("rect")
                .attr("class", "rect")
                .attr("width", lineID.rangeBand())
                .attr("y", function (d) {
                return y(d.y);
            })
                .attr("height", function (d) {
                return graphSet.height - y(d.y);
            })
                .style("fill", function (d) {
                return d.color;
            })
                .style("opacity", 1);
            categories_g.selectAll('.rect')
                .data(function (d) {
                return d.values;
            })
                .on("mouseover", function (d) {
                div.transition()
                    .style("opacity", 0.9);
                div.html('<strong>' + d.name + '</strong>' + ": "
                    + "</br>" + d.measurement + '</br>' + d.y + " " + d.y_unit + "</br>" + " @" +
                    " " + d.x + " hours")
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
                .on("mouseout", function () {
                div.transition()
                    .style("opacity", 0);
            });
            //get word length
            wordLength = EDDGraphingTools.getSum(typeNames);
            if (wordLength > 90 && type != 'x') {
                d3.selectAll(typeID[type] + ' .x.axis text').remove();
            }
            if (wordLength > 150 && type === 'x') {
                d3.selectAll(typeID[type] + ' .x.axis text').remove();
            }
        }
        $('#graphLoading').addClass('off');
    }
    StudyDataPage.createGroupedBarGraph = createGroupedBarGraph;
    /**
     * this function takes in the type of measurement, selectors obj, selector type and
     * button obj and shows the measurement graph is the main type is proteomic
     */
    function showProteomicGraph(type, selectors, selector, buttons) {
        if (type === 'p') {
            d3.select(selectors['line']).style('display', 'none');
            d3.select(selectors['bar-measurement']).style('display', 'block');
            $('label.btn').removeClass('active');
            var rects = d3.selectAll('.groupedMeasurement rect')[0];
            svgWidth(selectors[selector], rects);
            var button = $('.groupByMeasurementBar')[0];
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
        if ($('#' + line['identifier']).prop('checked') && remakeMainGraphAreaCalls === 1) {
            color = line['color'];
            line['doNotChange'] = true;
            EDDGraphingTools.colorQueue(color);
        }
        if ($('#' + line['identifier']).prop('checked') && remakeMainGraphAreaCalls >= 1) {
            if (line['doNotChange']) {
                color = line['color'];
            }
            else {
                color = EDDGraphingTools.nextColor;
                line['doNotChange'] = true;
                line['color'] = color;
                //text label next to checkbox
                var label = $('#' + line['identifier']).next();
                //update label color to line color
                $(label).css('color', color);
                EDDGraphingTools.colorQueue(color);
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
    StudyDataPage.editAssay = editAssay;
})(StudyDataPage || (StudyDataPage = {}));
;
var DataGridAssays = (function (_super) {
    __extends(DataGridAssays, _super);
    function DataGridAssays(dataGridSpec) {
        _super.call(this, dataGridSpec);
    }
    DataGridAssays.prototype._getClasses = function () {
        return 'dataTable sortable dragboxes hastablecontrols table-striped';
    };
    DataGridAssays.prototype.getCustomControlsArea = function () {
        return $('#tableControlsArea').get(0);
    };
    return DataGridAssays;
}(DataGrid));
// The spec object that will be passed to DataGrid to create the Assays table(s)
var DataGridSpecAssays = (function (_super) {
    __extends(DataGridSpecAssays, _super);
    function DataGridSpecAssays() {
        _super.call(this);
        this.graphObject = null;
        this.measuringTimesHeaderSpec = null;
    }
    DataGridSpecAssays.prototype.init = function () {
        this.findMaximumXValueInData();
        this.findMetaDataIDsUsedInAssays();
        _super.prototype.init.call(this);
    };
    // An array of unique identifiers, used to identify the records in the data set being displayed
    DataGridSpecAssays.prototype.getRecordIDs = function () {
        var lr = StudyDataPage.progressiveFilteringWidget.lastFilteringResults;
        if (lr) {
            return lr['filteredAssays'];
        }
        return [];
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
        return document.getElementById('studyAssaysTable');
    };
    // Specification for the table as a whole
    DataGridSpecAssays.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('assays', {
            'defaultSort': 0
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
            // Some caching to speed subsequent runs way up...
            if (assay.maxXValue !== undefined) {
                maxForRecord = assay.maxXValue;
            }
            else {
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
                assay.maxXValue = maxForRecord;
            }
            return Math.max(prev, maxForRecord);
        }, 0);
        // Anything above 0 is acceptable, but 0 will default instead to 1.
        this.maximumXValueInData = maxForAll || 1;
    };
    DataGridSpecAssays.prototype.loadAssayName = function (index) {
        // In an old typical EDDData.Assays record this string is currently pre-assembled and stored
        // in 'fn'. But we're phasing that out. Eventually the name will just be .name, without
        // decoration.
        var assay, line, protocolNaming;
        if ((assay = EDDData.Assays[index])) {
            return assay.name.toUpperCase();
        }
        return '';
    };
    DataGridSpecAssays.prototype.loadLineName = function (index) {
        var assay, line;
        if ((assay = EDDData.Assays[index])) {
            if ((line = EDDData.Lines[assay.lid])) {
                return line.name.toUpperCase();
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
        // The left section of the table has Assay Name and Line (Name)
        var leftSide = [
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
            this.measuringTimesHeaderSpec = new DataGridHeaderSpec(++rightOffset, 'hAssaysCount', {
                'name': 'Measuring Times',
                'headerRow': 2
            }),
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
        var record = EDDData.Assays[index], line = EDDData.Lines[record.lid];
        var sideMenuItems = [
            '<a class="assay-edit-link" onclick="StudyDataPage.editAssay([' + index + '])">Edit Assay</a>',
            '<a href="/export?assayId=' + index + '">Export Data as CSV</a>'
        ];
        // Set up jQuery modals
        $("#assayMain").dialog({ minWidth: 500, autoOpen: false });
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
                'contentString': record.name
            })
        ];
    };
    DataGridSpecAssays.prototype.generateLineNameCells = function (gridSpec, index) {
        var record = EDDData.Assays[index], line = EDDData.Lines[record.lid];
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name
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
        var leftSide, metaDataCols, rightSide, counter = 0;
        leftSide = [
            new DataGridColumnSpec(++counter, this.generateAssayNameCells),
            new DataGridColumnSpec(++counter, this.generateLineNameCells)
        ];
        metaDataCols = this.metaDataIDsUsedInAssays.map(function (id) {
            return new DataGridColumnSpec(++counter, _this.makeMetaDataCellsGeneratorFunction(id));
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
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecAssays.prototype.defineColumnGroupSpec = function () {
        var topSection = [
            new DataGridColumnGroupSpec('Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Line', { 'showInVisibilityList': false })
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
        // A "select all / select none" button
        var selectAllWidget = new DGSelectAllAssaysMeasurementsWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);
        return widgetSet;
    };
    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    DataGridSpecAssays.prototype.createCustomOptionsWidgets = function (dataGrid) {
        var widgetSet = [];
        var disabledAssaysWidget = new DGDisabledAssaysWidget(dataGrid, this);
        var emptyAssaysWidget = new DGEmptyAssaysWidget(dataGrid, this);
        widgetSet.push(disabledAssaysWidget);
        widgetSet.push(emptyAssaysWidget);
        return widgetSet;
    };
    // This is called after everything is initialized, including the creation of the table content.
    DataGridSpecAssays.prototype.onInitialized = function (dataGrid) {
        // Wire up the 'action panels' for the Assays sections
        var table = this.getTableElement();
        $(table).on('change', ':checkbox', function () { return StudyDataPage.queueActionPanelRefresh(); });
        // Run it once in case the page was generated with checked Assays
        StudyDataPage.queueActionPanelRefresh();
    };
    return DataGridSpecAssays;
}(DataGridSpecBase));
// A slightly modified "Select All" header widget
// that triggers a refresh of the actions panel when it changes the checkbox state.
var DGSelectAllAssaysMeasurementsWidget = (function (_super) {
    __extends(DGSelectAllAssaysMeasurementsWidget, _super);
    function DGSelectAllAssaysMeasurementsWidget() {
        _super.apply(this, arguments);
    }
    DGSelectAllAssaysMeasurementsWidget.prototype.clickHandler = function () {
        _super.prototype.clickHandler.call(this);
        StudyDataPage.queueActionPanelRefresh();
    };
    return DGSelectAllAssaysMeasurementsWidget;
}(DGSelectAllWidget));
// When unchecked, this hides the set of Assays that are marked as disabled.
var DGDisabledAssaysWidget = (function (_super) {
    __extends(DGDisabledAssaysWidget, _super);
    function DGDisabledAssaysWidget() {
        _super.apply(this, arguments);
    }
    // Return a fragment to use in generating option widget IDs
    DGDisabledAssaysWidget.prototype.getIDFragment = function (uniqueID) {
        return 'TableShowDAssaysCB';
    };
    // Return text used to label the widget
    DGDisabledAssaysWidget.prototype.getLabelText = function () {
        return 'Show Disabled';
    };
    DGDisabledAssaysWidget.prototype.getLabelTitle = function () {
        return "Show assays that have been disabled.";
    };
    // Returns true if the control should be enabled by default
    DGDisabledAssaysWidget.prototype.isEnabledByDefault = function () {
        return !!($('#filteringShowDisabledCheckbox').prop('checked'));
    };
    // Handle activation of widget
    DGDisabledAssaysWidget.prototype.onWidgetChange = function (e) {
        var amIChecked = !!(this.checkBoxElement.checked);
        var isOtherChecked = $('#filteringShowDisabledCheckbox').prop('checked');
        $('#filteringShowDisabledCheckbox').prop('checked', amIChecked);
        if (amIChecked != isOtherChecked) {
            StudyDataPage.queueRefreshDataDisplayIfStale();
        }
        // We don't call the superclass version of this function because we don't
        // want to trigger a call to arrangeTableDataRows just yet.
        // The queueRefreshDataDisplayIfStale function will do it for us, after
        // rebuilding the filtering section.
    };
    DGDisabledAssaysWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var checked = !!(this.checkBoxElement.checked);
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs && EDDData.currentStudyWritable) {
            $("#enableButton").removeClass('off');
        }
        else {
            $("#enableButton").addClass('off');
        }
        var disabledRows = $('.disabledRecord');
        var checkedDisabledRows = 0;
        _.each(disabledRows, function (row) {
            if ($(row).find('input').prop('checked')) {
                checkedDisabledRows++;
            }
        });
        if (checkedDisabledRows > 0) {
            $('#enableButton').prop('disabled', false);
        }
        else {
            $('#enableButton').prop('disabled', true);
        }
        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        return rowIDs.filter(function (id) {
            return !!(EDDData.Assays[id].active);
        });
    };
    DGDisabledAssaysWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        var assay = EDDData.Assays[rowID];
        if (!assay.active) {
            $.each(dataRowObjects, function (x, row) { return $(row.getElement()).addClass('disabledRecord'); });
        }
    };
    return DGDisabledAssaysWidget;
}(DataGridOptionWidget));
// When unchecked, this hides the set of Assays that have no measurement data.
var DGEmptyAssaysWidget = (function (_super) {
    __extends(DGEmptyAssaysWidget, _super);
    function DGEmptyAssaysWidget() {
        _super.apply(this, arguments);
    }
    // Return a fragment to use in generating option widget IDs
    DGEmptyAssaysWidget.prototype.getIDFragment = function (uniqueID) {
        return 'TableShowEAssaysCB';
    };
    // Return text used to label the widget
    DGEmptyAssaysWidget.prototype.getLabelText = function () {
        return 'Show Empty';
    };
    DGEmptyAssaysWidget.prototype.getLabelTitle = function () {
        return "Show assays that don't have any measurements in them.";
    };
    // Returns true if the control should be enabled by default
    DGEmptyAssaysWidget.prototype.isEnabledByDefault = function () {
        return !!($('#filteringShowEmptyCheckbox').prop('checked'));
    };
    // Handle activation of widget
    DGEmptyAssaysWidget.prototype.onWidgetChange = function (e) {
        var amIChecked = !!(this.checkBoxElement.checked);
        var isOtherChecked = !!($('#filteringShowEmptyCheckbox').prop('checked'));
        $('#filteringShowEmptyCheckbox').prop('checked', amIChecked);
        if (amIChecked != isOtherChecked) {
            StudyDataPage.queueRefreshDataDisplayIfStale();
        }
        // We don't call the superclass version of this function because we don't
        // want to trigger a call to arrangeTableDataRows just yet.
        // The queueRefreshDataDisplayIfStale function will do it for us, after
        // rebuilding the filtering section.
    };
    DGEmptyAssaysWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var checked = !!(this.checkBoxElement.checked);
        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        return rowIDs.filter(function (id) {
            return !!(EDDData.Assays[id].count);
        });
    };
    DGEmptyAssaysWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        var assay = EDDData.Assays[rowID];
        if (!assay.count) {
            $.each(dataRowObjects, function (x, row) { return $(row.getElement()).addClass('emptyRecord'); });
        }
    };
    return DGEmptyAssaysWidget;
}(DataGridOptionWidget));
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyDataPage.prepareIt(); });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktRGF0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlN0dWR5LURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0RBQW9EO0FBQ3BELHFEQUFxRDtBQUNyRCwrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLG9DQUFvQztBQUNwQyw0Q0FBNEM7QUFDNUMsNkNBQTZDOzs7Ozs7QUFLN0MsSUFBVSxhQUFhLENBdzRFdEI7QUF4NEVELFdBQVUsYUFBYSxFQUFDLENBQUM7SUFDckIsWUFBWSxDQUFDO0lBRWIsSUFBSSxXQUFXLENBQUMsQ0FBSSwrQ0FBK0M7SUFDbkUsSUFBSSxrQkFBeUMsQ0FBQztJQUM5QyxJQUFJLFlBQVksQ0FBQyxDQUFJLHlDQUF5QztJQUM5RCxJQUFJLHFCQUE0QixDQUFDO0lBR2pDLElBQUksbUJBQXlCLENBQUM7SUFDOUIsSUFBSSx5QkFBK0IsQ0FBQztJQUVwQyxJQUFJLHVCQUEyQixDQUFDO0lBQ2hDLElBQUksd0JBQWdDLENBQUM7SUFDckMsSUFBSSw2QkFBaUMsQ0FBQztJQUV0QyxJQUFJLHdCQUF3QixHQUFHLENBQUMsQ0FBQztJQUVqQyxJQUFJLFFBQVksQ0FBQztJQUVqQixtRUFBbUU7SUFDbkUsSUFBSSxrQkFBa0IsQ0FBQztJQWtDdkIsOENBQThDO0lBQzlDO1FBeUJJLDZEQUE2RDtRQUM3RDtZQUVJLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQzdCLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBRTFCLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLGtCQUFrQixHQUFH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QUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNmLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQUMsQ0FBQyxFQUFFLEdBQUcsSUFBSyxPQUFBLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQTNDLENBQTJDLENBQUMsQ0FBQztRQUNwRixDQUFDO0lBQ0wsQ0FBQztJQUNMLDBCQUFDO0FBQUQsQ0FBQyxBQW5ERCxDQUFrQyxvQkFBb0IsR0FtRHJEO0FBR0QsdUVBQXVFO0FBQ3ZFLENBQUMsQ0FBQyxjQUFNLE9BQUEsYUFBYSxDQUFDLFNBQVMsRUFBRSxFQUF6QixDQUF5QixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IE1vbiBKdWwgMjQgMjAxNyAxNjozNjoyMyAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEcmFnYm94ZXMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRhdGFHcmlkLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJFRERHcmFwaGluZ1Rvb2xzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL2QzL2QzLmQudHNcIi8+XG5cblxuZGVjbGFyZSB2YXIgRURERGF0YTpFREREYXRhO1xuXG5uYW1lc3BhY2UgU3R1ZHlEYXRhUGFnZSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIHZpZXdpbmdNb2RlOyAgICAvLyBBbiBlbnVtOiAnbGluZWdyYXBoJywgJ2JhcmdyYXBoJywgb3IgJ3RhYmxlJ1xuICAgIHZhciB2aWV3aW5nTW9kZUlzU3RhbGU6e1tpZDpzdHJpbmddOiBib29sZWFufTtcbiAgICB2YXIgYmFyR3JhcGhNb2RlOyAgICAvLyBhbiBlbnVtOiAndGltZScsICdsaW5lJywgJ21lYXN1cmVtZW50J1xuICAgIHZhciBiYXJHcmFwaFR5cGVCdXR0b25zSlE6SlF1ZXJ5O1xuXG4gICAgZXhwb3J0IHZhciBwcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldDogUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQ7XG4gICAgdmFyIHBvc3RGaWx0ZXJpbmdBc3NheXM6YW55W107XG4gICAgdmFyIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHM6YW55W107XG5cbiAgICB2YXIgYWN0aW9uUGFuZWxSZWZyZXNoVGltZXI6YW55O1xuICAgIHZhciBhY3Rpb25QYW5lbElzSW5Cb3R0b21CYXI6Ym9vbGVhbjtcbiAgICB2YXIgcmVmcmVzRGF0YURpc3BsYXlJZlN0YWxlVGltZXI6YW55O1xuXG4gICAgdmFyIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA9IDA7XG5cbiAgICB2YXIgY29sb3JPYmo6YW55O1xuXG4gICAgLy8gVGFibGUgc3BlYyBhbmQgdGFibGUgb2JqZWN0cywgb25lIGVhY2ggcGVyIFByb3RvY29sLCBmb3IgQXNzYXlzLlxuICAgIHZhciBhc3NheXNEYXRhR3JpZFNwZWM7XG4gICAgZXhwb3J0IHZhciBhc3NheXNEYXRhR3JpZDtcblxuICAgIC8vIFV0aWxpdHkgaW50ZXJmYWNlIHVzZWQgYnkgR2VuZXJpY0ZpbHRlclNlY3Rpb24jdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2hcbiAgICBleHBvcnQgaW50ZXJmYWNlIFZhbHVlVG9VbmlxdWVJRCB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogbnVtYmVyO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFZhbHVlVG9TdHJpbmcge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IHN0cmluZztcbiAgICB9XG4gICAgZXhwb3J0IGludGVyZmFjZSBWYWx1ZVRvVW5pcXVlTGlzdCB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogbnVtYmVyW107XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVW5pcXVlSURUb1ZhbHVlIHtcbiAgICAgICAgW2luZGV4OiBudW1iZXJdOiBzdHJpbmc7XG4gICAgfVxuICAgIC8vIFVzZWQgaW4gUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQjcHJlcGFyZUZpbHRlcmluZ1NlY3Rpb25cbiAgICBleHBvcnQgaW50ZXJmYWNlIFJlY29yZElEVG9Cb29sZWFuIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBib29sZWFuO1xuICAgIH1cbiAgICAvLyBVc2VkIHRvIGtlZXAgdHJhY2sgb2YgYWxsIHRoZSBhY2N1bXVsYXRlZCByZWNvcmQgSURzIHRoYXQgY2FuIGJlIHVzZWQgdG9cbiAgICAvLyBwb3B1bGF0ZSB0aGUgZmlsdGVycy4gIFdlIHVzZSB0aGlzIHRvIHJlcG9wdWxhdGUgZmlsdGVycyB3aGVuIHRoZSBtb2RlIGhhcyBjaGFuZ2VkLFxuICAgIC8vIGZvciBleGFtcGxlLCB0byBzaG93IGNyaXRlcmlhIGZvciBkaXNhYmxlZCBhc3NheXMsIG9yIGFzc2F5cyB3aXRoIG5vIG1lYXN1cmVtZW50cy5cbiAgICAvLyBUbyBzcGVlZCB0aGluZ3MgdXAgd2Ugd2lsbCBhY2N1bXVsYXRlIGFycmF5cywgZW5zdXJpbmcgdGhhdCB0aGUgSURzIGluIGVhY2ggYXJyYXlcbiAgICAvLyBhcmUgdW5pcXVlICh0byB0aGUgZ2l2ZW4gYXJyYXkpIGJ5IHRyYWNraW5nIGFscmVhZHktc2VlbiBJRHMgd2l0aCBib29sZWFuIGZsYWdzLlxuICAgIGV4cG9ydCBpbnRlcmZhY2UgQWNjdW11bGF0ZWRSZWNvcmRJRHMge1xuICAgICAgICBzZWVuUmVjb3JkRmxhZ3M6IFJlY29yZElEVG9Cb29sZWFuO1xuICAgICAgICBtZXRhYm9saXRlSURzOiBzdHJpbmdbXTtcbiAgICAgICAgcHJvdGVpbklEczogc3RyaW5nW107XG4gICAgICAgIGdlbmVJRHM6IHN0cmluZ1tdO1xuICAgICAgICBtZWFzdXJlbWVudElEczogc3RyaW5nW107XG4gICAgfVxuXG5cbiAgICAvLyBGb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIG9uIHRoZSBtYWluIGdyYXBoXG4gICAgZXhwb3J0IGNsYXNzIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0IHtcblxuICAgICAgICAvLyBUaGVzZSBhcmUgdGhlIGludGVybmFsIHNldHRpbmdzIGZvciB0aGUgd2lkZ2V0LlxuICAgICAgICAvLyBUaGV5IG1heSBkaWZmZXIgZnJvbSB0aGUgVUksIGlmIHdlIGhhdmVuJ3QgcmVmcmVzaGVkIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbi5cbiAgICAgICAgc2hvd2luZ0Rpc2FibGVkOmJvb2xlYW47XG4gICAgICAgIHNob3dpbmdFbXB0eTpib29sZWFuO1xuXG4gICAgICAgIGFsbEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGFzc2F5RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8ga2VlcCBhIHNlcGFyYXRlIGZpbHRlciBsaXN0IGZvciBlYWNoIHR5cGUuXG4gICAgICAgIG1ldGFib2xpdGVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBwcm90ZWluRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgZ2VuZUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIG1lYXN1cmVtZW50RmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcblxuICAgICAgICBtZXRhYm9saXRlRGF0YVByZXNlbnQ6IGJvb2xlYW47XG4gICAgICAgIHByb3RlaW5EYXRhUHJlc2VudDogYm9vbGVhbjtcbiAgICAgICAgZ2VuZURhdGFQcmVzZW50OiBib29sZWFuO1xuICAgICAgICBnZW5lcmljRGF0YVByZXNlbnQ6IGJvb2xlYW47XG5cbiAgICAgICAgZmlsdGVyVGFibGVKUTogSlF1ZXJ5O1xuICAgICAgICBhY2N1bXVsYXRlZFJlY29yZElEczogQWNjdW11bGF0ZWRSZWNvcmRJRHM7XG4gICAgICAgIGxhc3RGaWx0ZXJpbmdSZXN1bHRzOiBhbnk7XG5cblxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBpbml0aWFsaXplIGVhY2ggZmlsdGVyIGxpc3QuXG4gICAgICAgIGNvbnN0cnVjdG9yKCkge1xuXG4gICAgICAgICAgICB0aGlzLnNob3dpbmdEaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5zaG93aW5nRW1wdHkgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy5hbGxGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmFzc2F5RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5nZW5lRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmZpbHRlclRhYmxlSlEgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcyA9IHtcbiAgICAgICAgICAgICAgICBzZWVuUmVjb3JkRmxhZ3M6IHt9LFxuICAgICAgICAgICAgICAgIG1ldGFib2xpdGVJRHM6IFtdLFxuICAgICAgICAgICAgICAgIHByb3RlaW5JRHM6IFtdLFxuICAgICAgICAgICAgICAgIGdlbmVJRHM6IFtdLFxuICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50SURzOiBbXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMubGFzdEZpbHRlcmluZ1Jlc3VsdHMgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVhZCB0aHJvdWdoIHRoZSBMaW5lcywgQXNzYXlzLCBhbmQgQXNzYXlNZWFzdXJlbWVudHMgc3RydWN0dXJlcyB0byBsZWFybiB3aGF0IHR5cGVzIGFyZSBwcmVzZW50LFxuICAgICAgICAvLyB0aGVuIGluc3RhbnRpYXRlIHRoZSByZWxldmFudCBzdWJjbGFzc2VzIG9mIEdlbmVyaWNGaWx0ZXJTZWN0aW9uLCB0byBjcmVhdGUgYSBzZXJpZXMgb2ZcbiAgICAgICAgLy8gY29sdW1ucyBmb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIHVuZGVyIHRoZSBtYWluIGdyYXBoIG9uIHRoZSBwYWdlLlxuICAgICAgICAvLyBUaGlzIG11c3QgYmUgb3V0c2lkZSB0aGUgY29uc3RydWN0b3IgYmVjYXVzZSBFREREYXRhLkxpbmVzIGFuZCBFREREYXRhLkFzc2F5cyBhcmUgbm90IGltbWVkaWF0ZWx5IGF2YWlsYWJsZVxuICAgICAgICAvLyBvbiBwYWdlIGxvYWQuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGNyZWF0ZSBhbmQgYWRkIHJlbGV2YW50IGZpbHRlcnMgZm9yIGVhY2ggZ3JvdXAuXG4gICAgICAgIHByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgc2VlbkluTGluZXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuICAgICAgICAgICAgdmFyIHNlZW5JbkFzc2F5c0hhc2g6IFJlY29yZElEVG9Cb29sZWFuID0ge307XG5cbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGFibGVKUSA9ICQoJzxkaXY+JykuYWRkQ2xhc3MoJ2ZpbHRlclRhYmxlJyk7XG4gICAgICAgICAgICAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5hcHBlbmQodGhpcy5maWx0ZXJUYWJsZUpRKTtcblxuICAgICAgICAgICAgLy8gRmlyc3QgZG8gc29tZSBiYXNpYyBzYW5pdHkgZmlsdGVyaW5nIG9uIHRoZSBsaXN0XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkOiBzdHJpbmcsIGFzc2F5OiBhbnkpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgJC5lYWNoKGFzc2F5Lm1ldGEgfHwgW10sIChtZXRhZGF0YUlkKSA9PiB7IHNlZW5JbkFzc2F5c0hhc2hbbWV0YWRhdGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgICAgICAgICAkLmVhY2gobGluZS5tZXRhIHx8IFtdLCAobWV0YWRhdGFJZCkgPT4geyBzZWVuSW5MaW5lc0hhc2hbbWV0YWRhdGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgZmlsdGVycyBvbiBhc3NheSB0YWJsZXNcbiAgICAgICAgICAgIC8vIFRPRE8gbWVkaWEgaXMgbm93IGEgbWV0YWRhdGEgdHlwZSwgc3RyYWluIGFuZCBjYXJib24gc291cmNlIHNob3VsZCBiZSB0b29cbiAgICAgICAgICAgIHZhciBhc3NheUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBQcm90b2NvbEZpbHRlclNlY3Rpb24oKSk7IC8vIFByb3RvY29sXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgU3RyYWluRmlsdGVyU2VjdGlvbigpKTsgLy8gZmlyc3QgY29sdW1uIGluIGZpbHRlcmluZyBzZWN0aW9uXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgTGluZU5hbWVGaWx0ZXJTZWN0aW9uKCkpOyAvLyBMSU5FXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQXNzYXlGaWx0ZXJTZWN0aW9uKCkpOyAvLyBBc3NheVxuICAgICAgICAgICAgLy8gY29udmVydCBzZWVuIG1ldGFkYXRhIElEcyB0byBGaWx0ZXJTZWN0aW9uIG9iamVjdHMsIGFuZCBwdXNoIHRvIGVuZCBvZiBhc3NheUZpbHRlcnNcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoLmFwcGx5KGFzc2F5RmlsdGVycyxcbiAgICAgICAgICAgICAgICAkLm1hcChzZWVuSW5Bc3NheXNIYXNoLCAoXywgaWQ6IHN0cmluZykgPT4gbmV3IEFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uKGlkKSkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2guYXBwbHkoYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgICQubWFwKHNlZW5JbkxpbmVzSGFzaCwgKF8sIGlkOiBzdHJpbmcpID0+IG5ldyBMaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uKGlkKSkpO1xuXG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnB1c2gobmV3IE1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnB1c2gobmV3IE1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLnB1c2gobmV3IFByb3RlaW5GaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLnB1c2gobmV3IEdlbmVGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMucHVzaChuZXcgR2VuZXJhbE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgLy8gQWxsIGZpbHRlciBzZWN0aW9ucyBhcmUgY29uc3RydWN0ZWQ7IG5vdyBuZWVkIHRvIGNhbGwgY29uZmlndXJlKCkgb24gYWxsXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXS5jb25jYXQoXG4gICAgICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzKTtcbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycy5mb3JFYWNoKChzZWN0aW9uKSA9PiBzZWN0aW9uLmNvbmZpZ3VyZSgpKTtcblxuICAgICAgICAgICAgLy8gV2UgY2FuIGluaXRpYWxpemUgYWxsIHRoZSBBc3NheS0gYW5kIExpbmUtbGV2ZWwgZmlsdGVycyBpbW1lZGlhdGVseVxuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMgPSBhc3NheUZpbHRlcnM7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVMaW5lRmlsdGVycygpO1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlQ29sdW1ucygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgZmlsdGVycyBpbiB0aGUgZmlsdGVyaW5nIHNlY3Rpb24sIGFuZCBhZGQgaW4gdGhlIG9uZXMgdGhhdFxuICAgICAgICAvLyBjbGFpbSB0byBiZSBcInVzZWZ1bFwiLlxuICAgICAgICByZXBvcHVsYXRlQ29sdW1ucygpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBkYXJrOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCB3aWRnZXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAod2lkZ2V0LmlzRmlsdGVyVXNlZnVsKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmFkZFRvUGFyZW50KHRoaXMuZmlsdGVyVGFibGVKUVswXSk7XG4gICAgICAgICAgICAgICAgICAgIGRhcmsgPSAhZGFyaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuZGV0YWNoKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHaXZlbiBhIHNldCBvZiBtZWFzdXJlbWVudCByZWNvcmRzIGFuZCBhIGRpY3Rpb25hcnkgb2YgY29ycmVzcG9uZGluZyB0eXBlc1xuICAgICAgICAvLyAocGFzc2VkIGRvd24gZnJvbSB0aGUgc2VydmVyIGFzIGEgcmVzdWx0IG9mIGEgZGF0YSByZXF1ZXN0KSwgc29ydCB0aGVtIGludG9cbiAgICAgICAgLy8gdGhlaXIgdmFyaW91cyBjYXRlZ29yaWVzLCBhbmQgZmxhZyB0aGVtIGFzIGF2YWlsYWJsZSBmb3IgcG9wdWFsdGluZyB0aGVcbiAgICAgICAgLy8gZmlsdGVyaW5nIHNlY3Rpb24uICBUaGVuIGNhbGwgdG8gcmVwb3B1bGF0ZSB0aGUgZmlsdGVyaW5nIGJhc2VkIG9uIHRoZSBleHBhbmRlZCBzZXRzLlxuICAgICAgICBwcm9jZXNzSW5jb21pbmdNZWFzdXJlbWVudFJlY29yZHMobWVhc3VyZXMsIHR5cGVzKTogdm9pZCB7XG5cbiAgICAgICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHMuIG1lYXN1cmVzIGNvcnJlc3BvbmRzIHRvIEFzc2F5TWVhc3VyZW1lbnRzXG4gICAgICAgICAgICAkLmVhY2gobWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgICAgIC8vIElmIHdlJ3ZlIHNlZW4gaXQgYWxyZWFkeSAocmF0aGVyIHVubGlrZWx5KSwgc2tpcCBpdC5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5zZWVuUmVjb3JkRmxhZ3NbbWVhc3VyZW1lbnQuaWRdKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMuc2VlblJlY29yZEZsYWdzW21lYXN1cmVtZW50LmlkXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheSkgeyByZXR1cm4gfTtcbiAgICAgICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHsgcmV0dXJuIH07XG4gICAgICAgICAgICAgICAgbXR5cGUgPSB0eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLm1ldGFib2xpdGVJRHMucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMucHJvdGVpbklEcy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ2cnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIGdlbmUgLyB0cmFuc2NyaXB0XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMuZ2VuZUlEcy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5tZWFzdXJlbWVudElEcy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUFsbEZpbHRlcnMoKTsgICAgLy8gU2tpcCB0aGUgcXVldWUgLSB3ZSBuZWVkIHRvIHJlcG9wdWxhdGUgaW1tZWRpYXRlbHlcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVwb3B1bGF0ZUFsbEZpbHRlcnMoKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVMaW5lRmlsdGVycygpO1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlTWVhc3VyZW1lbnRGaWx0ZXJzKCk7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVDb2x1bW5zKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlcG9wdWxhdGVMaW5lRmlsdGVycygpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5SWRzID0gdGhpcy5idWlsZEFzc2F5SURTZXQoKTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzLmZvckVhY2goKGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlci5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoZmlsdGVyZWRBc3NheUlkcyk7XG4gICAgICAgICAgICAgICAgZmlsdGVyLnBvcHVsYXRlVGFibGUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVwb3B1bGF0ZU1lYXN1cmVtZW50RmlsdGVycygpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIGZpbHRlckRpc2FibGVkOiAoaWQ6c3RyaW5nKSA9PiBib29sZWFuO1xuICAgICAgICAgICAgdmFyIHByb2Nlc3M6IChpZHM6IHN0cmluZ1tdLCBpOiBudW1iZXIsIHdpZGdldDogR2VuZXJpY0ZpbHRlclNlY3Rpb24pID0+IHZvaWQ7XG5cbiAgICAgICAgICAgIHZhciBtID0gdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5tZXRhYm9saXRlSURzO1xuICAgICAgICAgICAgdmFyIHAgPSB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLnByb3RlaW5JRHM7XG4gICAgICAgICAgICB2YXIgZyA9IHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMuZ2VuZUlEcztcbiAgICAgICAgICAgIHZhciBnZW4gPSB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLm1lYXN1cmVtZW50SURzO1xuXG4gICAgICAgICAgICBpZiAoIXRoaXMuc2hvd2luZ0Rpc2FibGVkKSB7XG5cbiAgICAgICAgICAgICAgICBmaWx0ZXJEaXNhYmxlZCA9IChtZWFzdXJlSWQ6c3RyaW5nKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghbWVhc3VyZSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZS5hc3NheV07XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXNzYXkpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhIWFzc2F5LmFjdGl2ZTtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgbSA9IG0uZmlsdGVyKGZpbHRlckRpc2FibGVkKTtcbiAgICAgICAgICAgICAgICBwID0gcC5maWx0ZXIoZmlsdGVyRGlzYWJsZWQpO1xuICAgICAgICAgICAgICAgIGcgPSBnLmZpbHRlcihmaWx0ZXJEaXNhYmxlZCk7XG4gICAgICAgICAgICAgICAgZ2VuID0gZ2VuLmZpbHRlcihmaWx0ZXJEaXNhYmxlZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5nZW5lRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcmVzZW50ID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHByb2Nlc3MgPSAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LnBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHMpO1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZVRhYmxlKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAobS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZXRhYm9saXRlRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBtKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByZXNlbnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgcCkpO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvdGVpbkRhdGFQcmVzZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmdlbmVGaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGcpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZ2VuLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBnZW4pKTtcbiAgICAgICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCdWlsZCBhIGxpc3Qgb2YgYWxsIHRoZSBBc3NheSBJRHMgaW4gdGhlIFN0dWR5LlxuICAgICAgICBidWlsZEFzc2F5SURTZXQoKTogYW55W10ge1xuICAgICAgICAgICAgdmFyIGFzc2F5SWRzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZCwgYXNzYXkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUgJiYgIXRoaXMuc2hvd2luZ0Rpc2FibGVkKSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NheS5jb3VudCAmJiAhdGhpcy5zaG93aW5nRW1wdHkpIHJldHVybjtcbiAgICAgICAgICAgICAgICBhc3NheUlkcy5wdXNoKGFzc2F5SWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gYXNzYXlJZHM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZ2xvYmFsIHNldHRpbmdzIGZvciB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gYXJlIGRpZmZlcmVudCwgYW5kIHJlYnVpbGQgdGhlXG4gICAgICAgIC8vIHNlY3Rpb25zIGlmIHNvLiAgVGhlbiwgc3RhcnRpbmcgd2l0aCBhIGxpc3Qgb2YgYWxsIHRoZSBBc3NheSBJRHMgaW4gdGhlIFN0dWR5LCB3ZSBsb29wIGl0IHRocm91Z2ggdGhlXG4gICAgICAgIC8vIExpbmUgYW5kIEFzc2F5LWxldmVsIGZpbHRlcnMsIGNhdXNpbmcgdGhlIGZpbHRlcnMgdG8gcmVmcmVzaCB0aGVpciBVSSwgbmFycm93aW5nIHRoZSBzZXQgZG93bi5cbiAgICAgICAgLy8gV2UgcmVzb2x2ZSB0aGUgcmVzdWx0aW5nIHNldCBvZiBBc3NheSBJRHMgaW50byBtZWFzdXJlbWVudCBJRHMsIHRoZW4gcGFzcyB0aGVtIG9uIHRvIHRoZVxuICAgICAgICAvLyBtZWFzdXJlbWVudC1sZXZlbCBmaWx0ZXJzLiAgSW4gdGhlIGVuZCB3ZSByZXR1cm4gYSBzZXQgb2YgbWVhc3VyZW1lbnQgSURzIHJlcHJlc2VudGluZyB0aGVcbiAgICAgICAgLy8gZW5kIHJlc3VsdCBvZiBhbGwgdGhlIGZpbHRlcnMsIHN1aXRhYmxlIGZvciBwYXNzaW5nIHRvIHRoZSBncmFwaGluZyBmdW5jdGlvbnMuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIHByb2Nlc3MgZWFjaCBncm91cCBzZXBhcmF0ZWx5IGhlcmUuXG4gICAgICAgIGJ1aWxkRmlsdGVyZWRNZWFzdXJlbWVudHMoKTogVmFsdWVUb1VuaXF1ZUxpc3Qge1xuXG4gICAgICAgICAgICB2YXIgc2hvd2luZ0Rpc2FibGVkQ0I6Ym9vbGVhbiA9ICEhKCQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgICAgICAgICB2YXIgc2hvd2luZ0VtcHR5Q0I6Ym9vbGVhbiA9ICEhKCQoJyNmaWx0ZXJpbmdTaG93RW1wdHlDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSk7XG5cbiAgICAgICAgICAgIGlmICgodGhpcy5zaG93aW5nRGlzYWJsZWQgIT0gc2hvd2luZ0Rpc2FibGVkQ0IpIHx8ICh0aGlzLnNob3dpbmdFbXB0eSAhPSBzaG93aW5nRW1wdHlDQikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNob3dpbmdEaXNhYmxlZCA9IHNob3dpbmdEaXNhYmxlZENCO1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd2luZ0VtcHR5ID0gc2hvd2luZ0VtcHR5Q0I7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVBbGxGaWx0ZXJzKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5SWRzID0gdGhpcy5idWlsZEFzc2F5SURTZXQoKTtcblxuICAgICAgICAgICAgdmFyIGZpbHRlcmluZ1Jlc3VsdHM6VmFsdWVUb1VuaXF1ZUxpc3QgPSB7fTtcbiAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbJ2FsbEFzc2F5cyddID0gZmlsdGVyZWRBc3NheUlkcztcblxuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRBc3NheUlkcyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGZpbHRlcmVkQXNzYXlJZHMpO1xuICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbZmlsdGVyLnNlY3Rpb25TaG9ydExhYmVsXSA9IGZpbHRlcmVkQXNzYXlJZHM7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1snZmlsdGVyZWRBc3NheXMnXSA9IGZpbHRlcmVkQXNzYXlJZHM7XG5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudElkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChmaWx0ZXJlZEFzc2F5SWRzLCAoaSwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgICAgICQubWVyZ2UobWVhc3VyZW1lbnRJZHMsIGFzc2F5Lm1lYXN1cmVzIHx8IFtdKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzWydhbGxNZWFzdXJlbWVudHMnXSA9IG1lYXN1cmVtZW50SWRzO1xuXG4gICAgICAgICAgICAvLyBXZSBzdGFydCBvdXQgd2l0aCBmb3VyIHJlZmVyZW5jZXMgdG8gdGhlIGFycmF5IG9mIGF2YWlsYWJsZSBtZWFzdXJlbWVudCBJRHMsIG9uZSBmb3IgZWFjaCBtYWpvciBjYXRlZ29yeS5cbiAgICAgICAgICAgIC8vIEVhY2ggb2YgdGhlc2Ugd2lsbCBiZWNvbWUgaXRzIG93biBhcnJheSBpbiB0dXJuIGFzIHdlIG5hcnJvdyBpdCBkb3duLlxuICAgICAgICAgICAgLy8gVGhpcyBpcyB0byBwcmV2ZW50IGEgc3ViLXNlbGVjdGlvbiBpbiBvbmUgY2F0ZWdvcnkgZnJvbSBvdmVycmlkaW5nIGEgc3ViLXNlbGVjdGlvbiBpbiB0aGUgb3RoZXJzLlxuXG4gICAgICAgICAgICB2YXIgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIHByb3RlaW5NZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBnZW5lTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZXJpY01lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgd2Ugb25seSB0cnkgdG8gZmlsdGVyIGlmIHdlIGdvdCBtZWFzdXJlbWVudHMgdGhhdCBhcHBseSB0byB0aGUgd2lkZ2V0IHR5cGVzXG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1ldGFib2xpdGVEYXRhUHJlc2VudCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhtZXRhYm9saXRlTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1tmaWx0ZXIuc2VjdGlvblNob3J0TGFiZWxdID0gbWV0YWJvbGl0ZU1lYXN1cmVtZW50cztcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RlaW5EYXRhUHJlc2VudCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByb3RlaW5GaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHByb3RlaW5NZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhwcm90ZWluTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1tmaWx0ZXIuc2VjdGlvblNob3J0TGFiZWxdID0gcHJvdGVpbk1lYXN1cmVtZW50cztcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdlbmVEYXRhUHJlc2VudCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmdlbmVGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1tmaWx0ZXIuc2VjdGlvblNob3J0TGFiZWxdID0gZ2VuZU1lYXN1cmVtZW50cztcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmdlbmVyaWNEYXRhUHJlc2VudCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1lYXN1cmVtZW50RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lcmljTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZXJpY01lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbZmlsdGVyLnNlY3Rpb25TaG9ydExhYmVsXSA9IGdlbmVyaWNNZWFzdXJlbWVudHM7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9uY2Ugd2UndmUgZmluaXNoZWQgd2l0aCB0aGUgZmlsdGVyaW5nLCB3ZSB3YW50IHRvIHNlZSBpZiBhbnkgc3ViLXNlbGVjdGlvbnMgaGF2ZSBiZWVuIG1hZGUgYWNyb3NzXG4gICAgICAgICAgICAvLyBhbnkgb2YgdGhlIGNhdGVnb3JpZXMsIGFuZCBpZiBzbywgbWVyZ2UgdGhvc2Ugc3ViLXNlbGVjdGlvbnMgaW50byBvbmUuXG5cbiAgICAgICAgICAgIC8vIFRoZSBpZGVhIGlzLCB3ZSBkaXNwbGF5IGV2ZXJ5dGhpbmcgdW50aWwgdGhlIHVzZXIgbWFrZXMgYSBzZWxlY3Rpb24gaW4gb25lIG9yIG1vcmUgb2YgdGhlIG1haW4gY2F0ZWdvcmllcyxcbiAgICAgICAgICAgIC8vIHRoZW4gZHJvcCBldmVyeXRoaW5nIGZyb20gdGhlIGNhdGVnb3JpZXMgdGhhdCBjb250YWluIG5vIHNlbGVjdGlvbnMuXG5cbiAgICAgICAgICAgIC8vIEFuIGV4YW1wbGUgc2NlbmFyaW8gd2lsbCBleHBsYWluIHdoeSB0aGlzIGlzIGltcG9ydGFudDpcblxuICAgICAgICAgICAgLy8gU2F5IGEgdXNlciBpcyBwcmVzZW50ZWQgd2l0aCB0d28gY2F0ZWdvcmllcywgTWV0YWJvbGl0ZSBhbmQgTWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAvLyBNZXRhYm9saXRlIGhhcyBjcml0ZXJpYSAnQWNldGF0ZScgYW5kICdFdGhhbm9sJyBhdmFpbGFibGUuXG4gICAgICAgICAgICAvLyBNZWFzdXJlbWVudCBoYXMgb25seSBvbmUgY3JpdGVyaWEgYXZhaWxhYmxlLCAnT3B0aWNhbCBEZW5zaXR5Jy5cbiAgICAgICAgICAgIC8vIEJ5IGRlZmF1bHQsIEFjZXRhdGUsIEV0aGFub2wsIGFuZCBPcHRpY2FsIERlbnNpdHkgYXJlIGFsbCB1bmNoZWNrZWQsIGFuZCBhbGwgdmlzaWJsZSBvbiB0aGUgZ3JhcGguXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gJ3JldHVybiBtZWFzdXJlbWVudHMnIGJlbG93LlxuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjaGVja3MgJ0FjZXRhdGUnLCB0aGV5IGV4cGVjdCBvbmx5IEFjZXRhdGUgdG8gYmUgZGlzcGxheWVkLCBldmVuIHRob3VnaCBubyBjaGFuZ2UgaGFzIGJlZW4gbWFkZSB0b1xuICAgICAgICAgICAgLy8gdGhlIE1lYXN1cmVtZW50IHNlY3Rpb24gd2hlcmUgT3B0aWNhbCBEZW5zaXR5IGlzIGxpc3RlZC5cbiAgICAgICAgICAgIC8vIEluIHRoZSBjb2RlIGJlbG93LCBieSB0ZXN0aW5nIGZvciBhbnkgY2hlY2tlZCBib3hlcyBpbiB0aGUgbWV0YWJvbGl0ZUZpbHRlcnMgZmlsdGVycyxcbiAgICAgICAgICAgIC8vIHdlIHJlYWxpemUgdGhhdCB0aGUgc2VsZWN0aW9uIGhhcyBiZWVuIG5hcnJvd2VkIGRvd24sIHNvIHdlIGFwcGVuZCB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMgb250byBkU00uXG4gICAgICAgICAgICAvLyBUaGVuIHdoZW4gd2UgY2hlY2sgdGhlIG1lYXN1cmVtZW50RmlsdGVycyBmaWx0ZXJzLCB3ZSBzZWUgdGhhdCB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiBoYXNcbiAgICAgICAgICAgIC8vIG5vdCBuYXJyb3dlZCBkb3duIGl0cyBzZXQgb2YgbWVhc3VyZW1lbnRzLCBzbyB3ZSBza2lwIGFwcGVuZGluZyB0aG9zZSB0byBkU00uXG4gICAgICAgICAgICAvLyBUaGUgZW5kIHJlc3VsdCBpcyBvbmx5IHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cy5cblxuICAgICAgICAgICAgLy8gVGhlbiBzdXBwb3NlIHRoZSB1c2VyIGNoZWNrcyAnT3B0aWNhbCBEZW5zaXR5JywgaW50ZW5kaW5nIHRvIGNvbXBhcmUgQWNldGF0ZSBkaXJlY3RseSBhZ2FpbnN0IE9wdGljYWwgRGVuc2l0eS5cbiAgICAgICAgICAgIC8vIFNpbmNlIG1lYXN1cmVtZW50RmlsdGVycyBub3cgaGFzIGNoZWNrZWQgYm94ZXMsIHdlIHB1c2ggaXRzIG1lYXN1cmVtZW50cyBvbnRvIGRTTSxcbiAgICAgICAgICAgIC8vIHdoZXJlIGl0IGNvbWJpbmVzIHdpdGggdGhlIEFjZXRhdGUuXG5cbiAgICAgICAgICAgIHZhciBhbnlDaGVja2VkID0gKGZpbHRlcjogR2VuZXJpY0ZpbHRlclNlY3Rpb24pOiBib29sZWFuID0+IHsgcmV0dXJuIGZpbHRlci5hbnlDaGVja2JveGVzQ2hlY2tlZDsgfTtcblxuICAgICAgICAgICAgdmFyIGRTTTogYW55W10gPSBbXTsgICAgLy8gXCJEZWxpYmVyYXRlbHkgc2VsZWN0ZWQgbWVhc3VyZW1lbnRzXCJcbiAgICAgICAgICAgIGlmICggdGhpcy5tZXRhYm9saXRlRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQobWV0YWJvbGl0ZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgdGhpcy5wcm90ZWluRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQocHJvdGVpbk1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICggICAgICAgdGhpcy5nZW5lRmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZU1lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmICh0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5zb21lKGFueUNoZWNrZWQpKSB7IGRTTSA9IGRTTS5jb25jYXQoZ2VuZXJpY01lYXN1cmVtZW50cyk7IH1cbiAgICAgICAgICAgIGlmIChkU00ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1snZmlsdGVyZWRNZWFzdXJlbWVudHMnXSA9IGRTTTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1snZmlsdGVyZWRNZWFzdXJlbWVudHMnXSA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5sYXN0RmlsdGVyaW5nUmVzdWx0cyA9IGZpbHRlcmluZ1Jlc3VsdHM7XG4gICAgICAgICAgICByZXR1cm4gZmlsdGVyaW5nUmVzdWx0cztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIGFueSBvZiB0aGUgZ2xvYmFsIGZpbHRlciBzZXR0aW5ncyBvciBhbnkgb2YgdGhlIHNldHRpbmdzIGluIHRoZSBpbmRpdmlkdWFsIGZpbHRlcnNcbiAgICAgICAgLy8gaGF2ZSBjaGFuZ2VkLCByZXR1cm4gdHJ1ZSwgaW5kaWNhdGluZyB0aGF0IHRoZSBmaWx0ZXIgd2lsbCBnZW5lcmF0ZSBkaWZmZXJlbnQgcmVzdWx0cyBpZlxuICAgICAgICAvLyBxdWVyaWVkLlxuICAgICAgICBjaGVja1JlZHJhd1JlcXVpcmVkKGZvcmNlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHJlZHJhdzpib29sZWFuID0gISFmb3JjZTtcbiAgICAgICAgICAgIHZhciBzaG93aW5nRGlzYWJsZWRDQjpib29sZWFuID0gISEoJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICAgICAgICAgIHZhciBzaG93aW5nRW1wdHlDQjpib29sZWFuID0gISEoJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcblxuICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgaW50ZXJuYWwgc3RhdGUgZGlmZmVycywgYnV0IHdlJ3JlIG5vdCBoZXJlIHRvIHVwZGF0ZSBpdC4uLlxuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd2luZ0Rpc2FibGVkICE9IHNob3dpbmdEaXNhYmxlZENCKSB7IHJlZHJhdyA9IHRydWU7IH1cbiAgICAgICAgICAgIGlmICh0aGlzLnNob3dpbmdFbXB0eSAhPSBzaG93aW5nRW1wdHlDQikgeyByZWRyYXcgPSB0cnVlOyB9XG5cbiAgICAgICAgICAgIC8vIFdhbGsgZG93biB0aGUgZmlsdGVyIHdpZGdldCBsaXN0LiAgSWYgd2UgZW5jb3VudGVyIG9uZSB3aG9zZSBjb2xsZWN0aXZlIGNoZWNrYm94XG4gICAgICAgICAgICAvLyBzdGF0ZSBoYXMgY2hhbmdlZCBzaW5jZSB3ZSBsYXN0IG1hZGUgdGhpcyB3YWxrLCB0aGVuIGEgcmVkcmF3IGlzIHJlcXVpcmVkLiBOb3RlIHRoYXRcbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCBub3Qgc2tpcCB0aGlzIGxvb3AsIGV2ZW4gaWYgd2UgYWxyZWFkeSBrbm93IGEgcmVkcmF3IGlzIHJlcXVpcmVkLCBzaW5jZSB0aGVcbiAgICAgICAgICAgIC8vIGNhbGwgdG8gYW55RmlsdGVyU2V0dGluZ3NDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSBzZXRzIGludGVybmFsIHN0YXRlIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgICAgIC8vIHdpZGdldHMgdGhhdCB3ZSB3aWxsIHVzZSBuZXh0IHRpbWUgYXJvdW5kLlxuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYWxsRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWx0ZXIuYW55RmlsdGVyU2V0dGluZ3NDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSgpKSB7IHJlZHJhdyA9IHRydWU7IH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHJlZHJhdztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZ2VuZXJpYyB2ZXJzaW9uIG9mIGEgZmlsdGVyaW5nIGNvbHVtbiBpbiB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gYmVuZWF0aCB0aGUgZ3JhcGggYXJlYSBvbiB0aGUgcGFnZSxcbiAgICAvLyBtZWFudCB0byBiZSBzdWJjbGFzc2VkIGZvciBzcGVjaWZpYyBjcml0ZXJpYS5cbiAgICAvLyBXaGVuIGluaXRpYWxpemVkIHdpdGggYSBzZXQgb2YgcmVjb3JkIElEcywgdGhlIGNvbHVtbiBpcyBmaWxsZWQgd2l0aCBsYWJlbGVkIGNoZWNrYm94ZXMsIG9uZSBmb3IgZWFjaFxuICAgIC8vIHVuaXF1ZSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gY3JpdGVyaWEgZW5jb3VudGVyZWQgaW4gdGhlIHJlY29yZHMuXG4gICAgLy8gRHVyaW5nIHVzZSwgYW5vdGhlciBzZXQgb2YgcmVjb3JkIElEcyBpcyBwYXNzZWQgaW4sIGFuZCBpZiBhbnkgY2hlY2tib3hlcyBhcmUgY2hlY2tlZCwgdGhlIElEIHNldCBpc1xuICAgIC8vIG5hcnJvd2VkIGRvd24gdG8gb25seSB0aG9zZSByZWNvcmRzIHRoYXQgY29udGFpbiB0aGUgY2hlY2tlZCB2YWx1ZXMuXG4gICAgLy8gQ2hlY2tib3hlcyB3aG9zZSB2YWx1ZXMgYXJlIG5vdCByZXByZXNlbnRlZCBhbnl3aGVyZSBpbiB0aGUgZ2l2ZW4gSURzIGFyZSB0ZW1wb3JhcmlseSBkaXNhYmxlZCxcbiAgICAvLyB2aXN1YWxseSBpbmRpY2F0aW5nIHRvIGEgdXNlciB0aGF0IHRob3NlIHZhbHVlcyBhcmUgbm90IGF2YWlsYWJsZSBmb3IgZnVydGhlciBmaWx0ZXJpbmcuXG4gICAgLy8gVGhlIGZpbHRlcnMgYXJlIG1lYW50IHRvIGJlIGNhbGxlZCBpbiBzZXF1ZW5jZSwgZmVlZGluZyBlYWNoIHJldHVybmVkIElEIHNldCBpbnRvIHRoZSBuZXh0LFxuICAgIC8vIHByb2dyZXNzaXZlbHkgbmFycm93aW5nIGRvd24gdGhlIGVuYWJsZWQgY2hlY2tib3hlcy5cbiAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBzdWJjbGFzcyB0aGlzIGZvciBlYWNoIGdyb3VwIHR5cGUuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICAvLyBBIGRpY3Rpb25hcnkgb2YgdGhlIHVuaXF1ZSB2YWx1ZXMgZm91bmQgZm9yIGZpbHRlcmluZyBhZ2FpbnN0LCBhbmQgdGhlIGRpY3Rpb25hcnkncyBjb21wbGVtZW50LlxuICAgICAgICAvLyBFYWNoIHVuaXF1ZSBJRCBpcyBhbiBpbnRlZ2VyLCBhc2NlbmRpbmcgZnJvbSAxLCBpbiB0aGUgb3JkZXIgdGhlIHZhbHVlIHdhcyBmaXJzdCBlbmNvdW50ZXJlZFxuICAgICAgICAvLyB3aGVuIGV4YW1pbmluZyB0aGUgcmVjb3JkIGRhdGEgaW4gdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2guXG4gICAgICAgIHVuaXF1ZVZhbHVlczogVW5pcXVlSURUb1ZhbHVlO1xuICAgICAgICB1bmlxdWVJbmRleGVzOiBWYWx1ZVRvVW5pcXVlSUQ7XG4gICAgICAgIHVuaXF1ZUluZGV4Q291bnRlcjogbnVtYmVyO1xuXG4gICAgICAgIC8vIFRoZSBzb3J0ZWQgb3JkZXIgb2YgdGhlIGxpc3Qgb2YgdW5pcXVlIHZhbHVlcyBmb3VuZCBpbiB0aGUgZmlsdGVyXG4gICAgICAgIHVuaXF1ZVZhbHVlc09yZGVyOiBudW1iZXJbXTtcblxuICAgICAgICAvLyBBIGRpY3Rpb25hcnkgcmVzb2x2aW5nIGEgcmVjb3JkIElEIChhc3NheSBJRCwgbWVhc3VyZW1lbnQgSUQpIHRvIGFuIGFycmF5LiBFYWNoIGFycmF5XG4gICAgICAgIC8vIGNvbnRhaW5zIHRoZSBpbnRlZ2VyIGlkZW50aWZpZXJzIG9mIHRoZSB1bmlxdWUgdmFsdWVzIHRoYXQgYXBwbHkgdG8gdGhhdCByZWNvcmQuXG4gICAgICAgIC8vIChJdCdzIHJhcmUsIGJ1dCB0aGVyZSBjYW4gYWN0dWFsbHkgYmUgbW9yZSB0aGFuIG9uZSBjcml0ZXJpYSB0aGF0IG1hdGNoZXMgYSBnaXZlbiBJRCxcbiAgICAgICAgLy8gIGZvciBleGFtcGxlIGEgTGluZSB3aXRoIHR3byBmZWVkcyBhc3NpZ25lZCB0byBpdC4pXG4gICAgICAgIGZpbHRlckhhc2g6IFZhbHVlVG9VbmlxdWVMaXN0O1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHJlc29sdmluZyB0aGUgZmlsdGVyIHZhbHVlcyB0byBIVE1MIElucHV0IGNoZWNrYm94ZXMuXG4gICAgICAgIGNoZWNrYm94ZXM6IHtbaW5kZXg6IHN0cmluZ106IEpRdWVyeX07XG4gICAgICAgIC8vIERpY3Rpb25hcnkgdXNlZCB0byBjb21wYXJlIGNoZWNrYm94ZXMgd2l0aCBhIHByZXZpb3VzIHN0YXRlIHRvIGRldGVybWluZSB3aGV0aGVyIGFuXG4gICAgICAgIC8vIHVwZGF0ZSBpcyByZXF1aXJlZC4gVmFsdWVzIGFyZSAnQycgZm9yIGNoZWNrZWQsICdVJyBmb3IgdW5jaGVja2VkLCBhbmQgJ04nIGZvciBub3RcbiAgICAgICAgLy8gZXhpc3RpbmcgYXQgdGhlIHRpbWUuICgnTicgY2FuIGJlIHVzZWZ1bCB3aGVuIGNoZWNrYm94ZXMgYXJlIHJlbW92ZWQgZnJvbSBhIGZpbHRlciBkdWUgdG9cbiAgICAgICAgLy8gdGhlIGJhY2stZW5kIGRhdGEgY2hhbmdpbmcuKVxuICAgICAgICBwcmV2aW91c0NoZWNrYm94U3RhdGU6IFZhbHVlVG9TdHJpbmc7XG4gICAgICAgIC8vIERpY3Rpb25hcnkgcmVzb2x2aW5nIHRoZSBmaWx0ZXIgdmFsdWVzIHRvIEhUTUwgdGFibGUgcm93IGVsZW1lbnRzLlxuICAgICAgICB0YWJsZVJvd3M6IHtbaW5kZXg6IHN0cmluZ106IEhUTUxUYWJsZVJvd0VsZW1lbnR9O1xuXG4gICAgICAgIC8vIFJlZmVyZW5jZXMgdG8gSFRNTCBlbGVtZW50cyBjcmVhdGVkIGJ5IHRoZSBmaWx0ZXJcbiAgICAgICAgZmlsdGVyQ29sdW1uRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgY2xlYXJJY29uczogSlF1ZXJ5O1xuICAgICAgICBwbGFpbnRleHRUaXRsZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHNlYXJjaEJveDogSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgc2VhcmNoQm94VGl0bGVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBzY3JvbGxab25lRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgZmlsdGVyaW5nVGFibGU6IEpRdWVyeTtcbiAgICAgICAgdGFibGVCb2R5RWxlbWVudDogSFRNTFRhYmxlRWxlbWVudDtcblxuICAgICAgICAvLyBTZWFyY2ggYm94IHJlbGF0ZWRcbiAgICAgICAgdHlwaW5nVGltZW91dDogbnVtYmVyO1xuICAgICAgICB0eXBpbmdEZWxheTogbnVtYmVyO1xuICAgICAgICBjdXJyZW50U2VhcmNoU2VsZWN0aW9uOiBzdHJpbmc7XG4gICAgICAgIHByZXZpb3VzU2VhcmNoU2VsZWN0aW9uOiBzdHJpbmc7XG4gICAgICAgIG1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoOiBudW1iZXI7XG5cbiAgICAgICAgYW55Q2hlY2tib3hlc0NoZWNrZWQ6IGJvb2xlYW47XG5cbiAgICAgICAgc2VjdGlvblRpdGxlOiBzdHJpbmc7XG4gICAgICAgIHNlY3Rpb25TaG9ydExhYmVsOiBzdHJpbmc7XG5cbiAgICAgICAgLy8gVE9ETzogQ29udmVydCB0byBhIHByb3RlY3RlZCBjb25zdHJ1Y3RvciEgVGhlbiB1c2UgYSBmYWN0b3J5IG1ldGhvZCB0byBjcmVhdGUgb2JqZWN0c1xuICAgICAgICAvLyAgICB3aXRoIGNvbmZpZ3VyZSgpIGFscmVhZHkgY2FsbGVkLiBUeXBlc2NyaXB0IDEuOCBkb2VzIG5vdCBzdXBwb3J0IHZpc2liaWxpdHlcbiAgICAgICAgLy8gICAgbW9kaWZpZXJzIG9uIGNvbnN0cnVjdG9ycywgc3VwcG9ydCBpcyBhZGRlZCBpbiBUeXBlc2NyaXB0IDIuMFxuICAgICAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzID0ge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhDb3VudGVyID0gMDtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGUgPSB7fTtcblxuICAgICAgICAgICAgdGhpcy50YWJsZVJvd3MgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlcyA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnR5cGluZ1RpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy50eXBpbmdEZWxheSA9IDMzMDsgICAgLy8gVE9ETzogTm90IGltcGxlbWVudGVkXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSAnJztcbiAgICAgICAgICAgIHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2ggPSAxO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uZmlndXJlKHRpdGxlOiBzdHJpbmc9J0dlbmVyaWMgRmlsdGVyJywgc2hvcnRMYWJlbDogc3RyaW5nPSdnZicpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblRpdGxlID0gdGl0bGU7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25TaG9ydExhYmVsID0gc2hvcnRMYWJlbDtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlQ29udGFpbmVyT2JqZWN0cygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ3JlYXRlIGFsbCB0aGUgY29udGFpbmVyIEhUTUwgb2JqZWN0c1xuICAgICAgICBjcmVhdGVDb250YWluZXJPYmplY3RzKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIHNCb3hJRDogc3RyaW5nID0gJ2ZpbHRlcicgKyB0aGlzLnNlY3Rpb25TaG9ydExhYmVsICsgJ1NlYXJjaEJveCcsXG4gICAgICAgICAgICAgICAgc0JveDogSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyQ29sdW1uRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJDb2x1bW4nKVswXTtcbiAgICAgICAgICAgIHZhciB0ZXh0VGl0bGUgPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJUaXRsZScpLnRleHQodGhpcy5zZWN0aW9uVGl0bGUpO1xuICAgICAgICAgICAgdmFyIGNsZWFySWNvbiA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNsZWFySWNvbicpO1xuICAgICAgICAgICAgdGhpcy5wbGFpbnRleHRUaXRsZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVySGVhZCcpLmFwcGVuZChjbGVhckljb24pLmFwcGVuZCh0ZXh0VGl0bGUpWzBdO1xuXG4gICAgICAgICAgICAkKHNCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIikpXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xuICAgICAgICAgICAgICAgICAgICAnaWQnOiBzQm94SUQsXG4gICAgICAgICAgICAgICAgICAgICduYW1lJzogc0JveElELFxuICAgICAgICAgICAgICAgICAgICAncGxhY2Vob2xkZXInOiB0aGlzLnNlY3Rpb25UaXRsZSxcbiAgICAgICAgICAgICAgICAgICAgJ3NpemUnOiAxNFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc0JveC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dCcpOyAvLyBKUXVlcnkgLmF0dHIoKSBjYW5ub3Qgc2V0IHRoaXNcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoQm94ID0gc0JveDtcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdHdvIGNsZWFyIGljb25zIGZvciB0aGUgdHdvIHZlcnNpb25zIG9mIHRoZSBoZWFkZXIgKHdpdGggc2VhcmNoIGFuZCB3aXRob3V0KVxuICAgICAgICAgICAgdmFyIHNlYXJjaENsZWFySWNvbiA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNsZWFySWNvbicpO1xuICAgICAgICAgICAgdGhpcy5zZWFyY2hCb3hUaXRsZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVySGVhZFNlYXJjaCcpLmFwcGVuZChzZWFyY2hDbGVhckljb24pLmFwcGVuZChzQm94KVswXTtcblxuICAgICAgICAgICAgdGhpcy5jbGVhckljb25zID0gY2xlYXJJY29uLmFkZChzZWFyY2hDbGVhckljb24pOyAgICAvLyBDb25zb2xpZGF0ZSB0aGUgdHdvIEpRdWVyeSBlbGVtZW50cyBpbnRvIG9uZVxuXG4gICAgICAgICAgICB0aGlzLmNsZWFySWNvbnMub24oJ2NsaWNrJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gQ2hhbmdpbmcgdGhlIGNoZWNrZWQgc3RhdHVzIHdpbGwgYXV0b21hdGljYWxseSB0cmlnZ2VyIGEgcmVmcmVzaCBldmVudFxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLmNoZWNrYm94ZXMgfHwge30sIChpZDogbnVtYmVyLCBjaGVja2JveDogSlF1ZXJ5KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFpvbmVEaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNyaXRlcmlhU2Nyb2xsWm9uZScpWzBdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJpbmdUYWJsZSA9ICQoXCI8dGFibGU+XCIpXG4gICAgICAgICAgICAgICAgLmFkZENsYXNzKCdmaWx0ZXJDcml0ZXJpYVRhYmxlIGRyYWdib3hlcycpXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAnY2VsbHBhZGRpbmcnOiAwLCAnY2VsbHNwYWNpbmcnOiAwIH0pXG4gICAgICAgICAgICAgICAgLmFwcGVuZCh0aGlzLnRhYmxlQm9keUVsZW1lbnQgPSA8SFRNTFRhYmxlRWxlbWVudD4kKFwiPHRib2R5PlwiKVswXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCeSBjYWxsaW5nIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoLCB3ZSBnbyB0aHJvdWdoIHRoZSByZWNvcmRzIGFuZCBmaW5kIGFsbCB0aGUgdW5pcXVlXG4gICAgICAgIC8vIHZhbHVlcyBpbiB0aGVtIChmb3IgdGhlIGNyaXRlcmlhIHRoaXMgcGFydGljdWxhciBmaWx0ZXIgaXMgYmFzZWQgb24uKVxuICAgICAgICAvLyBOZXh0IHdlIGNyZWF0ZSBhbiBpbnZlcnRlZCB2ZXJzaW9uIG9mIHRoYXQgZGF0YSBzdHJ1Y3R1cmUsIHNvIHRoYXQgdGhlIHVuaXF1ZSBpZGVudGlmaWVyc1xuICAgICAgICAvLyB3ZSd2ZSBjcmVhdGVkIG1hcCB0byB0aGUgdmFsdWVzIHRoZXkgcmVwcmVzZW50LCBhcyB3ZWxsIGFzIGFuIGFycmF5XG4gICAgICAgIC8vIG9mIHRoZSB1bmlxdWUgaWRlbnRpZmllcnMgc29ydGVkIGJ5IHRoZSB2YWx1ZXMuICBUaGVzZSBhcmUgd2hhdCB3ZSdsbCB1c2UgdG8gY29uc3RydWN0XG4gICAgICAgIC8vIHRoZSByb3dzIG9mIGNyaXRlcmlhIHZpc2libGUgaW4gdGhlIGZpbHRlcidzIFVJLlxuICAgICAgICBwb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGNyU2V0OiBudW1iZXJbXSwgY0hhc2g6IFVuaXF1ZUlEVG9WYWx1ZTtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzKTtcbiAgICAgICAgICAgIGNyU2V0ID0gW107XG4gICAgICAgICAgICBjSGFzaCA9IHt9O1xuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgcmV2ZXJzZWQgaGFzaCBzbyBrZXlzIG1hcCB2YWx1ZXMgYW5kIHZhbHVlcyBtYXAga2V5c1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMudW5pcXVlSW5kZXhlcywgKHZhbHVlOiBzdHJpbmcsIHVuaXF1ZUlEOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBjSGFzaFt1bmlxdWVJRF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBjclNldC5wdXNoKHVuaXF1ZUlEKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQWxwaGFiZXRpY2FsbHkgc29ydCBhbiBhcnJheSBvZiB0aGUga2V5cyBhY2NvcmRpbmcgdG8gdmFsdWVzXG4gICAgICAgICAgICBjclNldC5zb3J0KChhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIF9hOnN0cmluZyA9IGNIYXNoW2FdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgdmFyIF9iOnN0cmluZyA9IGNIYXNoW2JdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF9hIDwgX2IgPyAtMSA6IF9hID4gX2IgPyAxIDogMDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSBjSGFzaDtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIgPSBjclNldDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEluIHRoaXMgZnVuY3Rpb24gKG9yIGF0IGxlYXN0IHRoZSBzdWJjbGFzc2VkIHZlcnNpb25zIG9mIGl0KSB3ZSBhcmUgcnVubmluZyB0aHJvdWdoIHRoZSBnaXZlblxuICAgICAgICAvLyBsaXN0IG9mIG1lYXN1cmVtZW50IChvciBhc3NheSkgSURzIGFuZCBleGFtaW5pbmcgdGhlaXIgcmVjb3JkcyBhbmQgcmVsYXRlZCByZWNvcmRzLFxuICAgICAgICAvLyBsb2NhdGluZyB0aGUgcGFydGljdWxhciBmaWVsZCB3ZSBhcmUgaW50ZXJlc3RlZCBpbiwgYW5kIGNyZWF0aW5nIGEgbGlzdCBvZiBhbGwgdGhlXG4gICAgICAgIC8vIHVuaXF1ZSB2YWx1ZXMgZm9yIHRoYXQgZmllbGQuICBBcyB3ZSBnbywgd2UgbWFyayBlYWNoIHVuaXF1ZSB2YWx1ZSB3aXRoIGFuIGludGVnZXIgVUlELFxuICAgICAgICAvLyBhbmQgY29uc3RydWN0IGEgaGFzaCByZXNvbHZpbmcgZWFjaCByZWNvcmQgdG8gb25lIChvciBwb3NzaWJseSBtb3JlKSBvZiB0aG9zZSBpbnRlZ2VyIFVJRHMuXG4gICAgICAgIC8vIFRoaXMgcHJlcGFyZXMgdXMgZm9yIHF1aWNrIGZpbHRlcmluZyBsYXRlciBvbi5cbiAgICAgICAgLy8gKFRoaXMgZ2VuZXJpYyBmaWx0ZXIgZG9lcyBub3RoaW5nLCBsZWF2aW5nIHRoZXNlIHN0cnVjdHVyZXMgYmxhbmsuKVxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB0aGlzLmZpbHRlckhhc2ggfHwge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB0aGlzLnVuaXF1ZUluZGV4ZXMgfHwge307XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY29tZSB1cCB3aXRoIDIgb3IgbW9yZSBjcml0ZXJpYSwgdGhlcmUgaXMgbm8gcG9pbnQgaW4gZGlzcGxheWluZyB0aGUgZmlsdGVyLFxuICAgICAgICAvLyBzaW5jZSBpdCBkb2Vzbid0IHJlcHJlc2VudCBhIG1lYW5pbmdmdWwgY2hvaWNlLlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYWRkVG9QYXJlbnQocGFyZW50RGl2KTp2b2lkIHtcbiAgICAgICAgICAgIHBhcmVudERpdi5hcHBlbmRDaGlsZCh0aGlzLmZpbHRlckNvbHVtbkRpdik7XG4gICAgICAgIH1cblxuICAgICAgICBkZXRhY2goKTp2b2lkIHtcbiAgICAgICAgICAgICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpLmRldGFjaCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUnVucyB0aHJvdWdoIHRoZSB2YWx1ZXMgaW4gdW5pcXVlVmFsdWVzT3JkZXIsIGFkZGluZyBhIGNoZWNrYm94IGFuZCBsYWJlbCBmb3IgZWFjaFxuICAgICAgICAvLyBmaWx0ZXJpbmcgdmFsdWUgcmVwcmVzZW50ZWQuICBJZiB0aGVyZSBhcmUgbW9yZSB0aGFuIDE1IHZhbHVlcywgdGhlIGZpbHRlciBnZXRzXG4gICAgICAgIC8vIGEgc2VhcmNoIGJveCBhbmQgc2Nyb2xsYmFyLlxuICAgICAgICAvLyBUaGUgY2hlY2tib3gsIGFuZCB0aGUgdGFibGUgcm93IHRoYXQgZW5jbG9zZXMgdGhlIGNoZWNrYm94IGFuZCBsYWJlbCwgYXJlIHNhdmVkIGluXG4gICAgICAgIC8vIGEgZGljdGlvbmFyeSBtYXBwZWQgYnkgdGhlIHVuaXF1ZSB2YWx1ZSB0aGV5IHJlcHJlc2VudCwgc28gdGhleSBjYW4gYmUgcmUtdXNlZCBpZiB0aGVcbiAgICAgICAgLy8gZmlsdGVyIGlzIHJlYnVpbHQgKGkuZS4gaWYgcG9wdWxhdGVUYWJsZSBpcyBjYWxsZWQgYWdhaW4uKVxuICAgICAgICBwb3B1bGF0ZVRhYmxlKCk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgZkNvbCA9ICQodGhpcy5maWx0ZXJDb2x1bW5EaXYpO1xuXG4gICAgICAgICAgICBmQ29sLmNoaWxkcmVuKCkuZGV0YWNoKCk7XG4gICAgICAgICAgICAvLyBPbmx5IHVzZSB0aGUgc2Nyb2xsaW5nIGNvbnRhaW5lciBkaXYgaWYgdGhlIHNpemUgb2YgdGhlIGxpc3Qgd2FycmFudHMgaXQsIGJlY2F1c2VcbiAgICAgICAgICAgIC8vIHRoZSBzY3JvbGxpbmcgY29udGFpbmVyIGRpdiBkZWNsYXJlcyBhIGxhcmdlIHBhZGRpbmcgbWFyZ2luIGZvciB0aGUgc2Nyb2xsIGJhcixcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHBhZGRpbmcgbWFyZ2luIHdvdWxkIGJlIGFuIGVtcHR5IHdhc3RlIG9mIHNwYWNlIG90aGVyd2lzZS5cbiAgICAgICAgICAgIGlmICh0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDEwKSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5zZWFyY2hCb3hUaXRsZURpdikuYXBwZW5kKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICAgICAgLy8gQ2hhbmdlIHRoZSByZWZlcmVuY2Ugc28gd2UncmUgYWZmZWN0aW5nIHRoZSBpbm5lckhUTUwgb2YgdGhlIGNvcnJlY3QgZGl2IGxhdGVyIG9uXG4gICAgICAgICAgICAgICAgZkNvbCA9ICQodGhpcy5zY3JvbGxab25lRGl2KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5wbGFpbnRleHRUaXRsZURpdik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLmZpbHRlcmluZ1RhYmxlKTtcblxuICAgICAgICAgICAgdmFyIHRCb2R5ID0gdGhpcy50YWJsZUJvZHlFbGVtZW50O1xuICAgICAgICAgICAgLy8gQ2xlYXIgb3V0IGFueSBvbGQgdGFibGUgY29udGVudHNcbiAgICAgICAgICAgICQodGhpcy50YWJsZUJvZHlFbGVtZW50KS5lbXB0eSgpO1xuXG4gICAgICAgICAgICAvLyBsaW5lIGxhYmVsIGNvbG9yIGJhc2VkIG9uIGdyYXBoIGNvbG9yIG9mIGxpbmVcbiAgICAgICAgICAgIGlmICh0aGlzLnNlY3Rpb25UaXRsZSA9PT0gXCJMaW5lXCIpIHsgICAgLy8gVE9ETzogRmluZCBhIGJldHRlciB3YXkgdG8gaWRlbnRpZnkgdGhpcyBzZWN0aW9uXG4gICAgICAgICAgICAgICAgdmFyIGNvbG9yczphbnkgPSB7fTtcblxuICAgICAgICAgICAgICAgIC8vY3JlYXRlIG5ldyBjb2xvcnMgb2JqZWN0IHdpdGggbGluZSBuYW1lcyBhIGtleXMgYW5kIGNvbG9yIGhleCBhcyB2YWx1ZXNcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gRURERGF0YS5MaW5lcykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvcnNbRURERGF0YS5MaW5lc1trZXldLm5hbWVdID0gY29sb3JPYmpba2V5XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZvciBlYWNoIHZhbHVlLCBpZiBhIHRhYmxlIHJvdyBpc24ndCBhbHJlYWR5IGRlZmluZWQsIGJ1aWxkIG9uZS5cbiAgICAgICAgICAgIC8vIFRoZXJlJ3MgZXh0cmEgY29kZSBpbiBoZXJlIHRvIGFzc2lnbiBjb2xvcnMgdG8gcm93cyBpbiB0aGUgTGluZXMgZmlsdGVyXG4gICAgICAgICAgICAvLyB3aGljaCBzaG91bGQgcHJvYmFibHkgYmUgaXNvbGF0ZWQgaW4gYSBzdWJjbGFzcy5cbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgodW5pcXVlSWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuXG4gICAgICAgICAgICAgICAgdmFyIGNib3hOYW1lLCBjZWxsLCBwLCBxLCByO1xuICAgICAgICAgICAgICAgIGNib3hOYW1lID0gWydmaWx0ZXInLCB0aGlzLnNlY3Rpb25TaG9ydExhYmVsLCAnbicsIHVuaXF1ZUlkLCAnY2JveCddLmpvaW4oJycpO1xuICAgICAgICAgICAgICAgIHZhciByb3cgPSB0aGlzLnRhYmxlUm93c1t0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dO1xuICAgICAgICAgICAgICAgIGlmICghcm93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vIG5lZWQgdG8gYXBwZW5kIGEgbmV3IHJvdyBpbiBhIHNlcGFyYXRlIGNhbGw6XG4gICAgICAgICAgICAgICAgICAgIC8vIGluc2VydFJvdygpIGNyZWF0ZXMsIGFuZCBhcHBlbmRzLCBhbmQgcmV0dXJucyBvbmUuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFibGVSb3dzW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV0gPSA8SFRNTFRhYmxlUm93RWxlbWVudD50aGlzLnRhYmxlQm9keUVsZW1lbnQuaW5zZXJ0Um93KCk7XG4gICAgICAgICAgICAgICAgICAgIGNlbGwgPSB0aGlzLnRhYmxlUm93c1t0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dLmluc2VydENlbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV0gPSAkKFwiPGlucHV0IHR5cGU9J2NoZWNrYm94Jz5cIilcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hdHRyKHsgJ25hbWUnOiBjYm94TmFtZSwgJ2lkJzogY2JveE5hbWUgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCc8bGFiZWw+JykuYXR0cignZm9yJywgY2JveE5hbWUpLnRleHQodGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNlY3Rpb25UaXRsZSA9PT0gXCJMaW5lXCIpIHsgICAgLy8gVE9ETzogRmluZCBhIGJldHRlciB3YXkgdG8gaWRlbnRpZnkgdGhpcyBzZWN0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5jc3MoJ2ZvbnQtd2VpZ2h0JywgJ0JvbGQnKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIEVERERhdGEuTGluZXMpIHsgICAgLy8gVE9ETzogTWFrZSB0aGlzIGFzc2lnbm1lbnQgd2l0aG91dCB1c2luZyBhIGxvb3BcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1trZXldLm5hbWUgPT0gdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKEVERERhdGEuTGluZXNba2V5XVsnaWRlbnRpZmllciddID0gY2JveE5hbWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgJChyb3cpLmFwcGVuZFRvKHRoaXMudGFibGVCb2R5RWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBUT0RPOiBEcmFnIHNlbGVjdCBpcyB0d2l0Y2h5IC0gY2xpY2tpbmcgYSB0YWJsZSBjZWxsIGJhY2tncm91bmQgc2hvdWxkIGNoZWNrIHRoZSBib3gsXG4gICAgICAgICAgICAvLyBldmVuIGlmIHRoZSB1c2VyIGlzbid0IGhpdHRpbmcgdGhlIGxhYmVsIG9yIHRoZSBjaGVja2JveCBpdHNlbGYuXG4gICAgICAgICAgICAvLyBGaXhpbmcgdGhpcyBtYXkgbWVhbiBhZGRpbmcgYWRkaXRpb25hbCBjb2RlIHRvIHRoZSBtb3VzZWRvd24vbW91c2VvdmVyIGhhbmRsZXIgZm9yIHRoZVxuICAgICAgICAgICAgLy8gd2hvbGUgdGFibGUgKGN1cnJlbnRseSBpbiBTdHVkeURhdGFQYWdlLnByZXBhcmVJdCgpKS5cbiAgICAgICAgICAgIERyYWdib3hlcy5pbml0VGFibGUodGhpcy5maWx0ZXJpbmdUYWJsZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm5zIHRydWUgaWYgYW55IG9mIHRoaXMgZmlsdGVyJ3MgVUkgKGNoZWNrYm94ZXMsIHNlYXJjaCBmaWVsZClcbiAgICAgICAgLy8gc2hvd3MgYSBkaWZmZXJlbnQgc3RhdGUgdGhhbiB3aGVuIHRoaXMgZnVuY3Rpb24gd2FzIGxhc3QgY2FsbGVkLlxuICAgICAgICAvLyBUaGlzIGlzIGFjY29tcGxpc2hlZCBieSBrZWVwaW5nIGEgZGljdGlvbmFyeSAtIHByZXZpb3VzQ2hlY2tib3hTdGF0ZSAtIHRoYXQgaXMgb3JnYW5pemVkIGJ5XG4gICAgICAgIC8vIHRoZSBzYW1lIHVuaXF1ZSBjcml0ZXJpYSB2YWx1ZXMgYXMgdGhlIGNoZWNrYm94ZXMuXG4gICAgICAgIC8vIFdlIGJ1aWxkIGEgcmVscGFjZW1lbnQgZm9yIHRoaXMgZGljdGlvbmFyeSwgYW5kIGNvbXBhcmUgaXRzIGNvbnRlbnRzIHdpdGggdGhlIG9sZCBvbmUuXG4gICAgICAgIC8vIEVhY2ggY2hlY2tib3ggY2FuIGhhdmUgb25lIG9mIHRocmVlIHByaW9yIHN0YXRlcywgZWFjaCByZXByZXNlbnRlZCBpbiB0aGUgZGljdGlvbmFyeSBieSBhIGxldHRlcjpcbiAgICAgICAgLy8gXCJDXCIgLSBjaGVja2VkLCBcIlVcIiAtIHVuY2hlY2tlZCwgXCJOXCIgLSBkb2Vzbid0IGV4aXN0IChpbiB0aGUgY3VycmVudGx5IHZpc2libGUgc2V0LilcbiAgICAgICAgLy8gV2UgYWxzbyBjb21wYXJlIHRoZSBjdXJyZW50IGNvbnRlbnQgb2YgdGhlIHNlYXJjaCBib3ggd2l0aCB0aGUgb2xkIGNvbnRlbnQuXG4gICAgICAgIC8vIE5vdGU6IFJlZ2FyZGxlc3Mgb2Ygd2hlcmUgb3Igd2hldGhlciB3ZSBmaW5kIGEgZGlmZmVyZW5jZSwgaXQgaXMgaW1wb3J0YW50IHRoYXQgd2UgZmluaXNoXG4gICAgICAgIC8vIGJ1aWxkaW5nIHRoZSByZXBsYWNlbWVudCB2ZXJzaW9uIG9mIHByZXZpb3VzQ2hlY2tib3hTdGF0ZS5cbiAgICAgICAgLy8gU28gdGhvdWdoIGl0J3MgdGVtcHRpbmcgdG8gZXhpdCBlYXJseSBmcm9tIHRoZXNlIGxvb3BzLCBpdCB3b3VsZCBtYWtlIGEgbWVzcy5cbiAgICAgICAgYW55RmlsdGVyU2V0dGluZ3NDaGFuZ2VkU2luY2VMYXN0SW5xdWlyeSgpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIGNoYW5nZWQ6Ym9vbGVhbiA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGN1cnJlbnRDaGVja2JveFN0YXRlOiBWYWx1ZVRvU3RyaW5nID0ge30sXG4gICAgICAgICAgICAgICAgdjogc3RyaW5nID0gJCh0aGlzLnNlYXJjaEJveCkudmFsKCk7XG4gICAgICAgICAgICB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgodW5pcXVlSWQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjaGVja2JveDogSlF1ZXJ5ID0gdGhpcy5jaGVja2JveGVzW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV07XG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQsIHByZXZpb3VzO1xuICAgICAgICAgICAgICAgIC8vIFwiQ1wiIC0gY2hlY2tlZCwgXCJVXCIgLSB1bmNoZWNrZWQsIFwiTlwiIC0gZG9lc24ndCBleGlzdFxuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSAoY2hlY2tib3gucHJvcCgnY2hlY2tlZCcpICYmICFjaGVja2JveC5wcm9wKCdkaXNhYmxlZCcpKSA/ICdDJyA6ICdVJztcbiAgICAgICAgICAgICAgICBwcmV2aW91cyA9IHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV0gfHwgJ04nO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ICE9PSBwcmV2aW91cykgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09ICdDJykgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY3VycmVudENoZWNrYm94U3RhdGVbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXSA9IGN1cnJlbnQ7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5jbGVhckljb25zLnRvZ2dsZUNsYXNzKCdlbmFibGVkJywgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCk7XG5cbiAgICAgICAgICAgIHYgPSB2LnRyaW0oKTsgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgICAgIHYgPSB2LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB2ID0gdi5yZXBsYWNlKC9cXHNcXHMqLywgJyAnKTsgLy8gUmVwbGFjZSBpbnRlcm5hbCB3aGl0ZXNwYWNlIHdpdGggc2luZ2xlIHNwYWNlc1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uID0gdjtcbiAgICAgICAgICAgIGlmICh2ICE9PSB0aGlzLnByZXZpb3VzU2VhcmNoU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmVuJ3QgZGV0ZWN0ZWQgYW55IGNoYW5nZSBzbyBmYXIsIHRoZXJlIGlzIG9uZSBtb3JlIGFuZ2xlIHRvIGNvdmVyOlxuICAgICAgICAgICAgICAgIC8vIENoZWNrYm94ZXMgdGhhdCB1c2VkIHRvIGV4aXN0LCBidXQgaGF2ZSBzaW5jZSBiZWVuIHJlbW92ZWQgZnJvbSB0aGUgc2V0LlxuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSwgKHVuaXF1ZVZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Q2hlY2tib3hTdGF0ZVt1bmlxdWVWYWx1ZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBpdCB3YXMgdGFrZW4gb3V0IG9mIHRoZSBzZXQsIGNsZWFyIGl0IHNvIGl0IHdpbGwgYmVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJsYW5rIHdoZW4gcmUtYWRkZWQgbGF0ZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXNbdW5pcXVlVmFsdWVdLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0gY3VycmVudENoZWNrYm94U3RhdGU7XG4gICAgICAgICAgICByZXR1cm4gY2hhbmdlZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRha2VzIGEgc2V0IG9mIHJlY29yZCBJRHMsIGFuZCBpZiBhbnkgY2hlY2tib3hlcyBpbiB0aGUgZmlsdGVyJ3MgVUkgYXJlIGNoZWNrZWQsXG4gICAgICAgIC8vIHRoZSBJRCBzZXQgaXMgbmFycm93ZWQgZG93biB0byBvbmx5IHRob3NlIHJlY29yZHMgdGhhdCBjb250YWluIHRoZSBjaGVja2VkIHZhbHVlcy5cbiAgICAgICAgLy8gSW4gYWRkaXRpb24sIGNoZWNrYm94ZXMgd2hvc2UgdmFsdWVzIGFyZSBub3QgcmVwcmVzZW50ZWQgYW55d2hlcmUgaW4gdGhlIGluY29taW5nIElEc1xuICAgICAgICAvLyBhcmUgdGVtcG9yYXJpbHkgZGlzYWJsZWQgYW5kIHNvcnRlZCB0byB0aGUgYm90dG9tIG9mIHRoZSBsaXN0LCB2aXN1YWxseSBpbmRpY2F0aW5nXG4gICAgICAgIC8vIHRvIGEgdXNlciB0aGF0IHRob3NlIHZhbHVlcyBhcmUgbm90IGF2YWlsYWJsZSBmb3IgZnVydGhlciBmaWx0ZXJpbmcuXG4gICAgICAgIC8vIFRoZSBuYXJyb3dlZCBzZXQgb2YgSURzIGlzIHRoZW4gcmV0dXJuZWQsIGZvciB1c2UgYnkgdGhlIG5leHQgZmlsdGVyLlxuICAgICAgICBhcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGlkczphbnlbXSk6YW55IHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBmaWx0ZXIgb25seSBjb250YWlucyBvbmUgaXRlbSwgaXQncyBwb2ludGxlc3MgdG8gYXBwbHkgaXQuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpZHM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBpZHNQb3N0RmlsdGVyaW5nOiBhbnlbXTtcblxuICAgICAgICAgICAgdmFyIHVzZVNlYXJjaEJveDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICB2YXIgcXVlcnlTdHJzID0gW107XG5cbiAgICAgICAgICAgIHZhciB2ID0gdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uO1xuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICh2Lmxlbmd0aCA+PSB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSB3b3Jkcywgd2UgbWF0Y2ggZWFjaCBzZXBhcmF0ZWx5LlxuICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIG5vdCBhdHRlbXB0IHRvIG1hdGNoIGFnYWluc3QgZW1wdHkgc3RyaW5ncywgc28gd2UgZmlsdGVyIHRob3NlIG91dCBpZlxuICAgICAgICAgICAgICAgICAgICAvLyBhbnkgc2xpcHBlZCB0aHJvdWdoLlxuICAgICAgICAgICAgICAgICAgICBxdWVyeVN0cnMgPSB2LnNwbGl0KC9cXHMrLykuZmlsdGVyKChvbmUpID0+IHsgcmV0dXJuIG9uZS5sZW5ndGggPiAwOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHVzZXIgbWlnaHQgaGF2ZSBwYXN0ZWQvdHlwZWQgb25seSB3aGl0ZXNwYWNlLCBzbzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1ZXJ5U3Rycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1c2VTZWFyY2hCb3ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZyA9IHt9O1xuXG4gICAgICAgICAgICBpZHNQb3N0RmlsdGVyaW5nID0gaWRzLmZpbHRlcigoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcGFzczogYm9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIC8vIElmIHdlIGhhdmUgZmlsdGVyaW5nIGRhdGEgZm9yIHRoaXMgaWQsIHVzZSBpdC5cbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBkb24ndCwgdGhlIGlkIHByb2JhYmx5IGJlbG9uZ3MgdG8gc29tZSBvdGhlciBtZWFzdXJlbWVudCBjYXRlZ29yeSxcbiAgICAgICAgICAgICAgICAvLyBzbyB3ZSBpZ25vcmUgaXQuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlsdGVySGFzaFtpZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgYW55IG9mIHRoaXMgSUQncyBjcml0ZXJpYSBhcmUgY2hlY2tlZCwgdGhpcyBJRCBwYXNzZXMgdGhlIGZpbHRlci5cbiAgICAgICAgICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdlIGNhbm5vdCBvcHRpbWl6ZSB0byB1c2UgJy5zb21lJyBoZXJlIGJlY3Vhc2Ugd2UgbmVlZCB0b1xuICAgICAgICAgICAgICAgICAgICAvLyBsb29wIHRocm91Z2ggYWxsIHRoZSBjcml0ZXJpYSB0byBzZXQgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZy5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2lkXS5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1hdGNoOmJvb2xlYW4gPSB0cnVlLCB0ZXh0OnN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1c2VTZWFyY2hCb3gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gdGhpcy51bmlxdWVWYWx1ZXNbaW5kZXhdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2ggPSBxdWVyeVN0cnMuc29tZSgodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGV4dC5sZW5ndGggPj0gdi5sZW5ndGggJiYgdGV4dC5pbmRleE9mKHYpID49IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2luZGV4XSA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCh0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZVt0aGlzLnVuaXF1ZVZhbHVlc1tpbmRleF1dID09PSAnQycpIHx8ICF0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhc3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBwYXNzO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIEFwcGx5IGVuYWJsZWQvZGlzYWJsZWQgc3RhdHVzIGFuZCBvcmRlcmluZzpcbiAgICAgICAgICAgIHZhciByb3dzVG9BcHBlbmQgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzT3JkZXIuZm9yRWFjaCgoY3JJRCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBjaGVja2JveDogSlF1ZXJ5ID0gdGhpcy5jaGVja2JveGVzW3RoaXMudW5pcXVlVmFsdWVzW2NySURdXSxcbiAgICAgICAgICAgICAgICAgICAgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50ID0gdGhpcy50YWJsZVJvd3NbdGhpcy51bmlxdWVWYWx1ZXNbY3JJRF1dLFxuICAgICAgICAgICAgICAgICAgICBzaG93OiBib29sZWFuID0gISF2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nW2NySURdO1xuICAgICAgICAgICAgICAgIGNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJywgIXNob3cpXG4gICAgICAgICAgICAgICAgJChyb3cpLnRvZ2dsZUNsYXNzKCdub2RhdGEnLCAhc2hvdyk7XG4gICAgICAgICAgICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWJsZUJvZHlFbGVtZW50LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93c1RvQXBwZW5kLnB1c2gocm93KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIEFwcGVuZCBhbGwgdGhlIHJvd3Mgd2UgZGlzYWJsZWQsIGFzIGEgbGFzdCBzdGVwLFxuICAgICAgICAgICAgLy8gc28gdGhleSBnbyB0byB0aGUgYm90dG9tIG9mIHRoZSB0YWJsZS5cbiAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5mb3JFYWNoKChyb3cpID0+IHRoaXMudGFibGVCb2R5RWxlbWVudC5hcHBlbmRDaGlsZChyb3cpKTtcblxuICAgICAgICAgICAgcmV0dXJuIGlkc1Bvc3RGaWx0ZXJpbmc7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBIGZldyB1dGlsaXR5IGZ1bmN0aW9uczpcbiAgICAgICAgX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQ6c3RyaW5nKSB7XG4gICAgICAgICAgICByZXR1cm4gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgIH1cbiAgICAgICAgX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSByZXR1cm4gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBfYXNzYXlJZFRvUHJvdG9jb2woYXNzYXlJZDpzdHJpbmcpOiBQcm90b2NvbFJlY29yZCB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKTtcbiAgICAgICAgICAgIGlmIChhc3NheSkgcmV0dXJuIEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gT25lIG9mIHRoZSBoaWdoZXN0LWxldmVsIGZpbHRlcnM6IFN0cmFpbi5cbiAgICAvLyBOb3RlIHRoYXQgYW4gQXNzYXkncyBMaW5lIGNhbiBoYXZlIG1vcmUgdGhhbiBvbmUgU3RyYWluIGFzc2lnbmVkIHRvIGl0LFxuICAgIC8vIHdoaWNoIGlzIGFuIGV4YW1wbGUgb2Ygd2h5ICd0aGlzLmZpbHRlckhhc2gnIGlzIGJ1aWx0IHdpdGggYXJyYXlzLlxuICAgIGV4cG9ydCBjbGFzcyBTdHJhaW5GaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnU3RyYWluJywgJ3N0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgc3RyYWluIG5hbWVcbiAgICAgICAgICAgICAgICAobGluZS5zdHJhaW4gfHwgW10pLmZvckVhY2goKHN0cmFpbklkOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0cmFpbiA9IEVERERhdGEuU3RyYWluc1tzdHJhaW5JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdHJhaW4gJiYgc3RyYWluLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBKdXN0IGFzIHdpdGggdGhlIFN0cmFpbiBmaWx0ZXIsIGFuIEFzc2F5J3MgTGluZSBjYW4gaGF2ZSBtb3JlIHRoYW4gb25lXG4gICAgLy8gQ2FyYm9uIFNvdXJjZSBhc3NpZ25lZCB0byBpdC5cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uU291cmNlRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0NhcmJvbiBTb3VyY2UnLCAnY3MnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIGNhcmJvbiBzb3VyY2UgbmFtZVxuICAgICAgICAgICAgICAgIChsaW5lLmNhcmJvbiB8fCBbXSkuZm9yRWFjaCgoY2FyYm9uSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcmMgPSBFREREYXRhLkNTb3VyY2VzW2NhcmJvbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNyYyAmJiBzcmMubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgJ0NhcmJvbiBTb3VyY2UgTGFiZWxpbmcnIGZpZWxkIGZvciBlYWNoIEFzc2F5J3MgTGluZVxuICAgIGV4cG9ydCBjbGFzcyBDYXJib25MYWJlbGluZ0ZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdMYWJlbGluZycsICdsJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBjYXJib24gc291cmNlIGxhYmVsaW5nIGRlc2NyaXB0aW9uXG4gICAgICAgICAgICAgICAgKGxpbmUuY2FyYm9uIHx8IFtdKS5mb3JFYWNoKChjYXJib25JZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNyYyA9IEVERERhdGEuQ1NvdXJjZXNbY2FyYm9uSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3JjICYmIHNyYy5sYWJlbGluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgbmFtZSBvZiBlYWNoIEFzc2F5J3MgTGluZVxuICAgIGV4cG9ydCBjbGFzcyBMaW5lTmFtZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdMaW5lJywgJ2xuJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgUHJvdG9jb2wgb2YgZWFjaCBBc3NheVxuICAgIGV4cG9ydCBjbGFzcyBQcm90b2NvbEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdQcm90b2NvbCcsICdwJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHByb3RvY29sOiBQcm90b2NvbFJlY29yZCA9IHRoaXMuX2Fzc2F5SWRUb1Byb3RvY29sKGFzc2F5SWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgbmFtZSBvZiBlYWNoIEFzc2F5XG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0Fzc2F5JywgJ2EnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGNsYXNzIGRlZmluaW5nIHNvbWUgYWRkaXRpb25hbCBsb2dpYyBmb3IgbWV0YWRhdGEtdHlwZSBmaWx0ZXJzLFxuICAgIC8vIG1lYW50IHRvIGJlIHN1YmNsYXNzZWQuICBOb3RlIGhvdyB3ZSBwYXNzIGluIHRoZSBwYXJ0aWN1bGFyIG1ldGFkYXRhIHdlXG4gICAgLy8gYXJlIGNvbnN0cnVjdGluZyB0aGlzIGZpbHRlciBmb3IsIGluIHRoZSBjb25zdHJ1Y3Rvci5cbiAgICAvLyBVbmxpa2UgdGhlIG90aGVyIGZpbHRlcnMsIHdlIHdpbGwgYmUgaW5zdGFudGlhdGluZyBtb3JlIHRoYW4gb25lIG9mIHRoZXNlLlxuICAgIGV4cG9ydCBjbGFzcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgbWV0YURhdGFJRDpzdHJpbmc7XG4gICAgICAgIHByZTpzdHJpbmc7XG4gICAgICAgIHBvc3Q6c3RyaW5nO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG1ldGFEYXRhSUQ6c3RyaW5nKSB7XG4gICAgICAgICAgICBzdXBlcigpO1xuICAgICAgICAgICAgdmFyIE1EVCA9IEVERERhdGEuTWV0YURhdGFUeXBlc1ttZXRhRGF0YUlEXTtcbiAgICAgICAgICAgIHRoaXMubWV0YURhdGFJRCA9IG1ldGFEYXRhSUQ7XG4gICAgICAgICAgICB0aGlzLnByZSA9IE1EVC5wcmUgfHwgJyc7XG4gICAgICAgICAgICB0aGlzLnBvc3QgPSBNRFQucG9zdCB8fCAnJztcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKEVERERhdGEuTWV0YURhdGFUeXBlc1t0aGlzLm1ldGFEYXRhSURdLm5hbWUsICdtZCcrdGhpcy5tZXRhRGF0YUlEKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBMaW5lTWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge30sIHZhbHVlID0gJyhFbXB0eSknO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5tZXRhICYmIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgbGluZS5tZXRhW3RoaXMubWV0YURhdGFJRF0sIHRoaXMucG9zdCBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheTogYW55ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCkgfHwge30sIHZhbHVlID0gJyhFbXB0eSknO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXkubWV0YSAmJiBhc3NheS5tZXRhW3RoaXMubWV0YURhdGFJRF0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBbIHRoaXMucHJlLCBhc3NheS5tZXRhW3RoaXMubWV0YURhdGFJRF0sIHRoaXMucG9zdCBdLmpvaW4oJyAnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRoZXNlIHJlbWFpbmluZyBmaWx0ZXJzIHdvcmsgb24gTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEcy5cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgY29tcGFydG1lbnQgb2YgZWFjaCBNZXRhYm9saXRlLlxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGZpbHRlciBjbGFzcyB3b3JrcyB3aXRoIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHNcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0NvbXBhcnRtZW50JywgJ2NvbScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIHZhbHVlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlQ29tcGFydG1lbnRzW21lYXN1cmUuY29tcGFydG1lbnRdIHx8IHt9O1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGdlbmVyaWMgZmlsdGVyIGZvciBNZWFzdXJlbWVudHMsIG1lYW50IHRvIGJlIHN1YmNsYXNzZWQuXG4gICAgLy8gSXQgaW50cm9kdWNlcyBhICdsb2FkUGVuZGluZycgYXR0cmlidXRlLCB3aGljaCBpcyB1c2VkIHRvIG1ha2UgdGhlIGZpbHRlclxuICAgIC8vIGFwcGVhciBpbiB0aGUgVUkgZXZlbiBpZiBpdCBoYXMgbm8gZGF0YSwgYmVjYXVzZSB3ZSBhbnRpY2lwYXRlIGRhdGEgdG8gZXZlbnR1YWxseVxuICAgIC8vIGFwcGVhciBpbiBpdC5cbiAgICAvLyAgICAgIFRoZSBpZGVhIGlzLCB3ZSBrbm93IHdoZXRoZXIgdG8gaW5zdGFudGlhdGUgYSBnaXZlbiBzdWJjbGFzcyBvZiB0aGlzIGZpbHRlciBieVxuICAgIC8vIGxvb2tpbmcgYXQgdGhlIG1lYXN1cmVtZW50IGNvdW50IGZvciBlYWNoIEFzc2F5LCB3aGljaCBpcyBnaXZlbiB0byB1cyBpbiB0aGUgZmlyc3RcbiAgICAvLyBjaHVuayBvZiBkYXRhIGZyb20gdGhlIHNlcnZlci4gIFNvLCB3ZSBpbnN0YW50aWF0ZSBpdCwgdGhlbiBpdCBhcHBlYXJzIGluIGFcbiAgICAvLyAnbG9hZCBwZW5kaW5nJyBzdGF0ZSB1bnRpbCBhY3R1YWwgbWVhc3VyZW1lbnQgdmFsdWVzIGFyZSByZWNlaXZlZCBmcm9tIHRoZSBzZXJ2ZXIuXG4gICAgZXhwb3J0IGNsYXNzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gV2hlbmV2ZXIgdGhpcyBmaWx0ZXIgaXMgaW5zdGFudGlhdGVkLCB3ZVxuICAgICAgICBsb2FkUGVuZGluZzogYm9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUodGl0bGU6c3RyaW5nLCBzaG9ydExhYmVsOnN0cmluZyk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUodGl0bGUsIHNob3J0TGFiZWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3ZlcnJpZGluZyB0byBtYWtlIHVzZSBvZiBsb2FkUGVuZGluZy5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIG5hbWVzIG9mIEdlbmVyYWwgTWVhc3VyZW1lbnRzLlxuICAgIGV4cG9ydCBjbGFzcyBHZW5lcmFsTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gV2hlbmV2ZXIgdGhpcyBmaWx0ZXIgaXMgaW5zdGFudGlhdGVkLCB3ZVxuICAgICAgICBsb2FkUGVuZGluZzogYm9vbGVhbjtcblxuICAgICAgICBjb25maWd1cmUoKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTWVhc3VyZW1lbnQnLCAnbW0nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2gobUlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBtSWRzLmZvckVhY2goKG1lYXN1cmVJZDogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fTtcbiAgICAgICAgICAgICAgICB2YXIgbVR5cGU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBtVHlwZSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobVR5cGUgJiYgbVR5cGUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgbmFtZXMgb2YgTWV0YWJvbGl0ZSBNZWFzdXJlbWVudHMuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTWV0YWJvbGl0ZScsICdtZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIG1ldGFib2xpdGU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBtZXRhYm9saXRlID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGFib2xpdGUgJiYgbWV0YWJvbGl0ZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIG5hbWVzIG9mIFByb3RlaW4gTWVhc3VyZW1lbnRzLlxuICAgIGV4cG9ydCBjbGFzcyBQcm90ZWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ1Byb3RlaW4nLCAncHInKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBwcm90ZWluOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdGVpbiA9IEVERERhdGEuUHJvdGVpblR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm90ZWluICYmIHByb3RlaW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBuYW1lcyBvZiBHZW5lIE1lYXN1cmVtZW50cy5cbiAgICBleHBvcnQgY2xhc3MgR2VuZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdHZW5lJywgJ2duJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgZ2VuZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmUgPSBFREREYXRhLkdlbmVUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAoZ2VuZSAmJiBnZW5lLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHBhZ2UgbG9hZHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVJdCgpIHtcblxuICAgICAgICBwcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCA9IG5ldyBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCgpO1xuICAgICAgICBwb3N0RmlsdGVyaW5nQXNzYXlzID0gW107XG4gICAgICAgIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMgPSBbXTtcblxuICAgICAgICAvLyBCeSBkZWZhdWx0LCB3ZSBhbHdheXMgc2hvdyB0aGUgZ3JhcGhcbiAgICAgICAgdmlld2luZ01vZGUgPSAnbGluZWdyYXBoJztcbiAgICAgICAgYmFyR3JhcGhNb2RlID0gJ21lYXN1cmVtZW50JztcbiAgICAgICAgYmFyR3JhcGhUeXBlQnV0dG9uc0pRID0gJCgnI2JhckdyYXBoVHlwZUJ1dHRvbnMnKTtcbiAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gZmFsc2U7XG4gICAgICAgIC8vIFN0YXJ0IG91dCB3aXRoIGV2ZXJ5IGRpc3BsYXkgbW9kZSBuZWVkaW5nIGEgcmVmcmVzaFxuICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGUgPSB7XG4gICAgICAgICAgICAnbGluZWdyYXBoJzogdHJ1ZSxcbiAgICAgICAgICAgICdiYXJncmFwaCc6IHRydWUsXG4gICAgICAgICAgICAndGFibGUnOiB0cnVlXG4gICAgICAgIH07XG4gICAgICAgIHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyID0gbnVsbDtcblxuICAgICAgICBjb2xvck9iaiA9IG51bGw7XG5cbiAgICAgICAgYXNzYXlzRGF0YUdyaWRTcGVjID0gbnVsbDtcbiAgICAgICAgYXNzYXlzRGF0YUdyaWQgPSBudWxsO1xuXG4gICAgICAgIGFjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gbnVsbDtcblxuICAgICAgICAkKCcjc3R1ZHlBc3NheXNUYWJsZScpLnRvb2x0aXAoe1xuICAgICAgICAgICAgY29udGVudDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkKHRoaXMpLnByb3AoJ3RpdGxlJyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcG9zaXRpb246IHsgbXk6IFwibGVmdC01MCBjZW50ZXJcIiwgYXQ6IFwicmlnaHQgY2VudGVyXCIgfSxcbiAgICAgICAgICAgIHNob3c6IG51bGwsXG4gICAgICAgICAgICBjbG9zZTogZnVuY3Rpb24gKGV2ZW50LCB1aTphbnkpIHtcbiAgICAgICAgICAgICAgICB1aS50b29sdGlwLmhvdmVyKFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzKS5zdG9wKHRydWUpLmZhZGVUbyg0MDAsIDEpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAkKHRoaXMpLmZhZGVPdXQoXCI0MDBcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgJCh0aGlzKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFRoaXMgb25seSBhZGRzIGNvZGUgdGhhdCB0dXJucyB0aGUgb3RoZXIgYnV0dG9ucyBvZmYgd2hlbiBhIGJ1dHRvbiBpcyBtYWRlIGFjdGl2ZSxcbiAgICAgICAgLy8gYW5kIGRvZXMgdGhlIHNhbWUgdG8gZWxlbWVudHMgbmFtZWQgaW4gdGhlICdmb3InIGF0dHJpYnV0ZXMgb2YgZWFjaCBidXR0b24uXG4gICAgICAgIC8vIFdlIHN0aWxsIG5lZWQgdG8gYWRkIG91ciBvd24gcmVzcG9uZGVycyB0byBhY3R1YWxseSBkbyBzdHVmZi5cbiAgICAgICAgVXRsLkJ1dHRvbkJhci5wcmVwYXJlQnV0dG9uQmFycygpO1xuICAgICAgICBjb3B5QWN0aW9uQnV0dG9ucygpO1xuICAgICAgICAvLyBQcmVwZW5kIHNob3cvaGlkZSBmaWx0ZXIgYnV0dG9uIGZvciBiZXR0ZXIgYWxpZ25tZW50XG4gICAgICAgIC8vIE5vdGU6IHRoaXMgd2lsbCBiZSByZW1vdmVkIHdoZW4gd2UgaW1wbGVtZW50IGxlZnQgc2lkZSBmaWx0ZXJpbmdcblxuICAgICAgICAvL3doZW4gYWxsIGFqYXggcmVxdWVzdHMgYXJlIGZpbmlzaGVkLCBkZXRlcm1pbmUgaWYgdGhlcmUgYXJlIEFzc2F5TWVhc3VyZW1lbnRzLlxuICAgICAgICAkKGRvY3VtZW50KS5hamF4U3RvcChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIHNob3cgYXNzYXkgdGFibGUgYnkgZGVmYXVsdCBpZiB0aGVyZSBhcmUgYXNzYXlzIGJ1dCBubyBhc3NheSBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgIGlmIChfLmtleXMoRURERGF0YS5Bc3NheXMpLmxlbmd0aCA+IDAgJiYgXy5rZXlzKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIC8vVE9ETzogY3JlYXRlIHByZXBhcmUgaXQgZm9yIG5vIGRhdGE/XG4gICAgICAgICAgICAgICAgJCgnI2RhdGFUYWJsZUJ1dHRvbicpLmNsaWNrKCk7XG4gICAgICAgICAgICAgICAgJCgnLmV4cG9ydEJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICQoJy5leHBvcnRCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgJChcIiNkYXRhVGFibGVCdXR0b25cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZSA9ICd0YWJsZSc7XG4gICAgICAgICAgICBxdWV1ZUFjdGlvblBhbmVsUmVmcmVzaCgpO1xuICAgICAgICAgICAgbWFrZUxhYmVsc0JsYWNrKEVEREdyYXBoaW5nVG9vbHMubGFiZWxzKTtcbiAgICAgICAgICAgICQoXCIjdGFibGVDb250cm9sc0FyZWFcIikucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJChcIiNmaWx0ZXJDb250cm9sc0FyZWFcIikuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJChcIi50YWJsZUFjdGlvbkJ1dHRvbnNcIikucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgYmFyR3JhcGhUeXBlQnV0dG9uc0pRLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICAgICAgLy9UT0RPOiBlbmFibGUgdXNlcnMgdG8gZXhwb3J0IGZpbHRlcmVkIGRhdGEgZnJvbSBncmFwaFxuICAgICAgICAgICAgJCgnLmV4cG9ydEJ1dHRvbicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9jbGljayBoYW5kbGVyIGZvciBlZGl0IGFzc2F5IG1lYXN1cmVtZW50c1xuICAgICAgICAkKCcuZWRpdE1lYXN1cmVtZW50QnV0dG9uJykuY2xpY2soZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAkKCdpbnB1dFtuYW1lPVwiYXNzYXlfYWN0aW9uXCJdW3ZhbHVlPVwiZWRpdFwiXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICQoJ2J1dHRvblt2YWx1ZT1cImFzc2F5X2FjdGlvblwiXScpLmNsaWNrKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vY2xpY2sgaGFuZGxlciBmb3IgZGVsZXRlIGFzc2F5IG1lYXN1cmVtZW50c1xuICAgICAgICAkKCcuZGVsZXRlQnV0dG9uJykuY2xpY2soZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAkKCdpbnB1dFtuYW1lPVwiYXNzYXlfYWN0aW9uXCJdW3ZhbHVlPVwiZGVsZXRlXCJdJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgJCgnYnV0dG9uW3ZhbHVlPVwiYXNzYXlfYWN0aW9uXCJdJykuY2xpY2soKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9jbGljayBoYW5kbGVyIGZvciBleHBvcnQgYXNzYXkgbWVhc3VyZW1lbnRzXG4gICAgICAgICQoJy5leHBvcnRCdXR0b24nKS5jbGljayhmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGluY2x1ZGVBbGxMaW5lc0lmRW1wdHkoKTtcbiAgICAgICAgICAgICQoJ2lucHV0W3ZhbHVlPVwiZXhwb3J0XCJdJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgJCgnYnV0dG9uW3ZhbHVlPVwiYXNzYXlfYWN0aW9uXCJdJykuY2xpY2soKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9jbGljayBoYW5kbGVyIGZvciBkaXNhYmxlIGFzc2F5IG1lYXN1cmVtZW50c1xuICAgICAgICAkKCcuZGlzYWJsZUJ1dHRvbicpLmNsaWNrKGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCgnaW5wdXRbdmFsdWU9XCJtYXJrXCJdJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgJCgnc2VsZWN0W25hbWU9XCJkaXNhYmxlXCJdJykudmFsKCd0cnVlJyk7XG4gICAgICAgICAgICAkKCdidXR0b25bdmFsdWU9XCJhc3NheV9hY3Rpb25cIl0nKS5jbGljaygpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL2NsaWNrIGhhbmRsZXIgZm9yIHJlLWVuYWJsZSBhc3NheSBtZWFzdXJlbWVudHNcbiAgICAgICAgJCgnLmVuYWJsZUJ1dHRvbicpLmNsaWNrKGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCgnaW5wdXRbdmFsdWU9XCJtYXJrXCJdJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgJCgnc2VsZWN0W25hbWU9XCJkaXNhYmxlXCJdJykudmFsKCdmYWxzZScpO1xuICAgICAgICAgICAgJCgnYnV0dG9uW3ZhbHVlPVwiYXNzYXlfYWN0aW9uXCJdJykuY2xpY2soKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVGhpcyBvbmUgaXMgYWN0aXZlIGJ5IGRlZmF1bHRcbiAgICAgICAgJChcIiNsaW5lR3JhcGhCdXR0b25cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAkKCcuZXhwb3J0QnV0dG9uLCAjdGFibGVDb250cm9sc0FyZWEsIC50YWJsZUFjdGlvbkJ1dHRvbnMnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZmlsdGVyQ29udHJvbHNBcmVhJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgcXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICAgICAgICAgIHZpZXdpbmdNb2RlID0gJ2xpbmVncmFwaCc7XG4gICAgICAgICAgICB1cGRhdGVHcmFwaFZpZXdGbGFnKHsnYnV0dG9uRWxlbSc6IFwiI2xpbmVHcmFwaEJ1dHRvblwiLCAndHlwZSc6IHZpZXdpbmdNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc3R1ZHlfaWQnOiBFREREYXRhLmN1cnJlbnRTdHVkeUlEfSk7XG4gICAgICAgICAgICBiYXJHcmFwaFR5cGVCdXR0b25zSlEuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2xpbmVHcmFwaCcpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5VGltZScpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TWVhc3VyZW1lbnQnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5hcHBlbmRUbygnI2NvbnRlbnQnKTtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL29uZSB0aW1lIGNsaWNrIGV2ZW50IGhhbmRsZXIgZm9yIGxvYWRpbmcgc3Bpbm5lclxuICAgICAgICAkKCcjYmFyR3JhcGhCdXR0b24nKS5vbmUoXCJjbGlja1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICB9KTtcbiAgICAgICAgJCgnI3RpbWVCYXJHcmFwaEJ1dHRvbicpLm9uZShcImNsaWNrXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjbGluZUJhckdyYXBoQnV0dG9uJykub25lKFwiY2xpY2tcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJCgnI2dyYXBoTG9hZGluZycpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNtZWFzdXJlbWVudEJhckdyYXBoQnV0dG9uJykub25lKFwiY2xpY2tcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJCgnI2dyYXBoTG9hZGluZycpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoXCIjYmFyR3JhcGhCdXR0b25cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAkKCcuZXhwb3J0QnV0dG9uLCAjdGFibGVDb250cm9sc0FyZWEsIC50YWJsZUFjdGlvbkJ1dHRvbnMnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjZmlsdGVyQ29udHJvbHNBcmVhJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgcXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICAgICAgICAgIHZpZXdpbmdNb2RlID0gJ2JhcmdyYXBoJztcbiAgICAgICAgICAgIGJhckdyYXBoVHlwZUJ1dHRvbnNKUS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbGluZUdyYXBoJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlUaW1lJykudG9nZ2xlQ2xhc3MoJ29mZicsICd0aW1lJyAhPT0gYmFyR3JhcGhNb2RlKTtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLnRvZ2dsZUNsYXNzKCdvZmYnLCAnbGluZScgIT09IGJhckdyYXBoTW9kZSk7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeU1lYXN1cmVtZW50JykudG9nZ2xlQ2xhc3MoJ29mZicsICdtZWFzdXJlbWVudCcgIT09IGJhckdyYXBoTW9kZSk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLmFwcGVuZFRvKCcjY29udGVudCcpO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOiAnI21lYXN1cmVtZW50QmFyR3JhcGhCdXR0b24nLCAndHlwZSc6IGJhckdyYXBoTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgJChcIiN0aW1lQmFyR3JhcGhCdXR0b25cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBiYXJHcmFwaE1vZGUgPSAndGltZSc7XG4gICAgICAgICAgICB1cGRhdGVHcmFwaFZpZXdGbGFnKHsnYnV0dG9uRWxlbSc6IFwiI3RpbWVCYXJHcmFwaEJ1dHRvblwiLCAndHlwZSc6IGJhckdyYXBoTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzdHVkeV9pZCc6IEVERERhdGEuY3VycmVudFN0dWR5SUR9KTtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgJChcIiNsaW5lQmFyR3JhcGhCdXR0b25cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBiYXJHcmFwaE1vZGUgPSAnbGluZSc7XG4gICAgICAgICAgICB1cGRhdGVHcmFwaFZpZXdGbGFnKHsnYnV0dG9uRWxlbSc6JyNsaW5lQmFyR3JhcGhCdXR0b24nLCAndHlwZSc6IGJhckdyYXBoTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKFwiI21lYXN1cmVtZW50QmFyR3JhcGhCdXR0b25cIikuY2xpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBiYXJHcmFwaE1vZGUgPSAnbWVhc3VyZW1lbnQnO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOiAnI21lYXN1cmVtZW50QmFyR3JhcGhCdXR0b24nLCAndHlwZSc6IGJhckdyYXBoTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL2hpZGVzL3Nob3dzIGZpbHRlciBzZWN0aW9uLlxuICAgICAgICB2YXIgaGlkZUJ1dHRvbnM6IEpRdWVyeSA9ICQoJy5oaWRlRmlsdGVyU2VjdGlvbicpO1xuICAgICAgICBoaWRlQnV0dG9ucy5jbGljayhmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgdmFyIHNlbGY6IEpRdWVyeSA9ICQodGhpcyksIG9sZDogc3RyaW5nLCByZXBsYWNlOiBzdHJpbmc7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgb2xkID0gc2VsZi50ZXh0KCk7XG4gICAgICAgICAgICByZXBsYWNlID0gc2VsZi5hdHRyKCdkYXRhLW9mZi10ZXh0Jyk7XG4gICAgICAgICAgICAvLyBkb2luZyB0aGlzIGZvciBhbGxcbiAgICAgICAgICAgIGhpZGVCdXR0b25zLmF0dHIoJ2RhdGEtb2ZmLXRleHQnLCBvbGQpLnRleHQocmVwbGFjZSk7XG4gICAgICAgICAgICAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS50b2dnbGUoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVGhlIG5leHQgZmV3IGxpbmVzIHdpcmUgdXAgZXZlbnQgaGFuZGxlcnMgZm9yIGEgcHVsbGRvd25NZW51IHRoYXQgd2UgdXNlIHRvIGNvbnRhaW4gYVxuICAgICAgICAvLyBjb3VwbGUgb2YgY29udHJvbHMgcmVsYXRlZCB0byB0aGUgZmlsdGVyaW5nIHNlY3Rpb24uICBUaGlzIG1lbnUgaXMgc3R5bGVkIHRvIGxvb2tcbiAgICAgICAgLy8gZXhhY3RseSBsaWtlIHRoZSB0eXBpY2FsICd2aWV3IG9wdGlvbnMnIG1lbnUgZ2VuZXJhdGVkIGJ5IERhdGFHcmlkLlxuXG4gICAgICAgIHZhciBtZW51TGFiZWwgPSAkKCcjZmlsdGVyQ29udHJvbHNNZW51TGFiZWwnKTtcbiAgICAgICAgbWVudUxhYmVsLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgIGlmIChtZW51TGFiZWwuaGFzQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJykpIHtcbiAgICAgICAgICAgICAgICBtZW51TGFiZWwucmVtb3ZlQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJykuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT24nKTtcbiAgICAgICAgICAgICAgICAkKCcjZmlsdGVyQ29udHJvbHNNZW51ID4gZGl2LnB1bGxkb3duTWVudU1lbnVCbG9jaycpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZXZlbnQgaGFuZGxlcnMgdG8gaGlkZSBtZW51IGlmIGNsaWNraW5nIG91dHNpZGUgbWVudSBibG9jayBvciBwcmVzc2luZyBFU0NcbiAgICAgICAgJChkb2N1bWVudCkuY2xpY2soKGV2KSA9PiB7XG4gICAgICAgICAgICB2YXIgdCA9ICQoZXYudGFyZ2V0KTtcbiAgICAgICAgICAgIGlmICh0LmNsb3Nlc3QoJCgnI2ZpbHRlckNvbnRyb2xzTWVudScpLmdldCgwKSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgbWVudUxhYmVsLnJlbW92ZUNsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9uJykuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJyk7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbHRlckNvbnRyb2xzTWVudSA+IGRpdi5wdWxsZG93bk1lbnVNZW51QmxvY2snKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLmtleWRvd24oKGV2KSA9PiB7XG4gICAgICAgICAgICBpZiAoZXYua2V5Q29kZSA9PT0gMjcpIHtcbiAgICAgICAgICAgICAgICBtZW51TGFiZWwucmVtb3ZlQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT24nKS5hZGRDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKTtcbiAgICAgICAgICAgICAgICAkKCcjZmlsdGVyQ29udHJvbHNNZW51ID4gZGl2LnB1bGxkb3duTWVudU1lbnVCbG9jaycpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZmV0Y2hFREREYXRhKG9uU3VjY2Vzcyk7XG5cbiAgICAgICAgZmV0Y2hTZXR0aW5ncygnbWVhc3VyZW1lbnQtJyArIEVERERhdGEuY3VycmVudFN0dWR5SUQsIChkYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAoZGF0YS50eXBlID09PSAnbGluZWdyYXBoJykge1xuICAgICAgICAgICAgICAgICQoZGF0YS5idXR0b25FbGVtKS5jbGljaygpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YoZGF0YS50eXBlKSA9PT0gJ3VuZGVmaW5lZCcpICB7XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEudHlwZSA9PT0gJ21lYXN1cmVtZW50Jykge1xuICAgICAgICAgICAgICAgICQoXCIjYmFyR3JhcGhCdXR0b25cIikuY2xpY2soKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJChcIiNiYXJHcmFwaEJ1dHRvblwiKS5jbGljaygpO1xuICAgICAgICAgICAgICAgICQoZGF0YS5idXR0b25FbGVtKS5jbGljaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgIC8vIFNldCB1cCB0aGUgQWRkIE1lYXN1cmVtZW50IHRvIEFzc2F5IG1vZGFsXG4gICAgICAgICQoXCIjYWRkTWVhc3VyZW1lbnRcIikuZGlhbG9nKHtcbiAgICAgICAgICAgIG1pbldpZHRoOiA1MDAsXG4gICAgICAgICAgICBhdXRvT3BlbjogZmFsc2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJChcIi5hZGRNZWFzdXJlbWVudEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoXCIjYWRkTWVhc3VyZW1lbnRcIikucmVtb3ZlQ2xhc3MoJ29mZicpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2FsbGJhY2tzIHRvIHJlc3BvbmQgdG8gdGhlIGZpbHRlcmluZyBzZWN0aW9uXG4gICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLm9uKCdtb3VzZW92ZXIgbW91c2Vkb3duIG1vdXNldXAnLCBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUuYmluZCh0aGlzKSlcbiAgICAgICAgICAgIC5vbigna2V5ZG93bicsIGZpbHRlclRhYmxlS2V5RG93bi5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBiYXNlUGF5bG9hZCgpOmFueSB7XG4gICAgICAgIHZhciB0b2tlbjpzdHJpbmcgPSBkb2N1bWVudC5jb29raWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oPzooPzpefC4qO1xccyopY3NyZnRva2VuXFxzKlxcPVxccyooW147XSopLiokKXxeLiokLyxcbiAgICAgICAgICAgICckMScpO1xuICAgICAgICByZXR1cm4geyAnY3NyZm1pZGRsZXdhcmV0b2tlbic6IHRva2VuIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlR3JhcGhWaWV3RmxhZyh0eXBlKSB7XG4gICAgICAgICQuYWpheCgnL3Byb2ZpbGUvc2V0dGluZ3MvbWVhc3VyZW1lbnQtJyArIHR5cGUuc3R1ZHlfaWQsIHtcbiAgICAgICAgICAgICAgICAnZGF0YSc6ICQuZXh0ZW5kKHt9LCBiYXNlUGF5bG9hZCgpLCB7ICdkYXRhJzogSlNPTi5zdHJpbmdpZnkodHlwZSkgfSksXG4gICAgICAgICAgICAgICAgJ3R5cGUnOiAnUE9TVCdcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvcHlBY3Rpb25CdXR0b25zKCkge1xuICAgICAgICAvLyBjcmVhdGUgYSBjb3B5IG9mIHRoZSBidXR0b25zIGluIHRoZSBmbGV4IGxheW91dCBib3R0b20gYmFyXG4gICAgICAgIC8vIHRoZSBvcmlnaW5hbCBtdXN0IHN0YXkgaW5zaWRlIGZvcm1cbiAgICAgICAgdmFyIG9yaWdpbmFsOiBKUXVlcnksIGNvcHk6IEpRdWVyeTtcbiAgICAgICAgb3JpZ2luYWwgPSAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKTtcbiAgICAgICAgY29weSA9IG9yaWdpbmFsLmNsb25lKCkuYXBwZW5kVG8oJyNib3R0b21CYXInKS5hdHRyKCdpZCcsICdjb3B5QWN0aW9uUGFuZWwnKS5oaWRlKCk7XG4gICAgICAgIC8vIGZvcndhcmQgY2xpY2sgZXZlbnRzIG9uIGNvcHkgdG8gdGhlIG9yaWdpbmFsIGJ1dHRvblxuICAgICAgICBjb3B5Lm9uKCdjbGljaycsICcuYWN0aW9uQnV0dG9uJywgKGUpID0+IHtcbiAgICAgICAgICAgIG9yaWdpbmFsLmZpbmQoJyMnICsgZS50YXJnZXQuaWQpLnRyaWdnZXIoZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBmZXRjaEVERERhdGEoc3VjY2Vzcykge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgJ3VybCc6ICdlZGRkYXRhLycsXG4gICAgICAgICAgICAndHlwZSc6ICdHRVQnLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgJCgnI2NvbnRlbnQnKS5wcmVwZW5kKFwiPGRpdiBjbGFzcz0nbm9EYXRhJz5FcnJvci4gUGxlYXNlIHJlbG9hZDwvZGl2PlwiKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ0xvYWRpbmcgRURERGF0YSBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiBzdWNjZXNzXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBmZXRjaFNldHRpbmdzKHByb3BLZXk6c3RyaW5nLCBjYWxsYmFjazoodmFsdWU6YW55KT0+dm9pZCwgZGVmYXVsdFZhbHVlPzphbnkpOnZvaWQge1xuICAgICAgICAkLmFqYXgoJy9wcm9maWxlL3NldHRpbmdzLycgKyBwcm9wS2V5LCB7XG4gICAgICAgICAgICAnZGF0YVR5cGUnOiAnanNvbicsXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhOmFueSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGEgfHwgZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8qIFBhcnNlRXJyb3IsIGp1c3QgdXNlIHN0cmluZyB2YWx1ZSAqLyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblN1Y2Nlc3MoZGF0YSkge1xuICAgICAgICBFREREYXRhID0gJC5leHRlbmQoRURERGF0YSB8fCB7fSwgZGF0YSk7XG5cbiAgICAgICAgY29sb3JPYmogPSBFRERHcmFwaGluZ1Rvb2xzLnJlbmRlckNvbG9yKEVERERhdGEuTGluZXMpO1xuXG4gICAgICAgIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk7XG5cbiAgICAgICAgJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94LCAjZmlsdGVyaW5nU2hvd0VtcHR5Q2hlY2tib3gnKS5jaGFuZ2UoKCkgPT4ge1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBmZXRjaE1lYXN1cmVtZW50cyhFREREYXRhKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmZXRjaE1lYXN1cmVtZW50cyhFREREYXRhKSB7XG4gICAgICAgIC8vcHVsbGluZyBpbiBwcm90b2NvbCBtZWFzdXJlbWVudHMgQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgIHVybDogJ21lYXN1cmVtZW50cy8nICsgaWQgKyAnLycsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgcHJvdG9jb2wubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5jbHVkZUFsbExpbmVzSWZFbXB0eSgpIHtcbiAgICAgICAgaWYgKCQoJyNzdHVkeUFzc2F5c1RhYmxlJykuZmluZCgndGJvZHkgaW5wdXRbdHlwZT1jaGVja2JveF06Y2hlY2tlZCcpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgLy9hcHBlbmQgc3R1ZHkgaWQgdG8gZm9ybVxuICAgICAgICAgICAgdmFyIHN0dWR5ID0gXy5rZXlzKEVERERhdGEuU3R1ZGllcylbMF07XG4gICAgICAgICAgICAkKCc8aW5wdXQ+JykuYXR0cih7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2hpZGRlbicsXG4gICAgICAgICAgICAgICAgdmFsdWU6IHN0dWR5LFxuICAgICAgICAgICAgICAgIG5hbWU6ICdzdHVkeUlkJyxcbiAgICAgICAgICAgIH0pLmFwcGVuZFRvKCdmb3JtJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhbGxBY3RpdmVBc3NheXMoKSB7XG4gICAgICAgIHZhciBhc3NheXMgPSBfLmtleXMoRURERGF0YS5Bc3NheXMpO1xuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IGFzc2F5cy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gYXNzYXlzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKHBhcnNlSW50KGlkKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBmaWx0ZXJUYWJsZUtleURvd24oZSkge1xuICAgICAgICBzd2l0Y2ggKGUua2V5Q29kZSkge1xuICAgICAgICAgICAgY2FzZSAzODogLy8gdXBcbiAgICAgICAgICAgIGNhc2UgNDA6IC8vIGRvd25cbiAgICAgICAgICAgIGNhc2UgOTogIC8vIHRhYlxuICAgICAgICAgICAgY2FzZSAxMzogLy8gcmV0dXJuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgICAgICAgICBpZiAoZS5rZXlDb2RlID4gOCAmJiBlLmtleUNvZGUgPCAzMikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RBc3NheURhdGEoYXNzYXkpIHtcbiAgICAgICAgdmFyIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIHVybDogWydtZWFzdXJlbWVudHMnLCBhc3NheS5waWQsIGFzc2F5LmlkLCAnJ10uam9pbignLycpLFxuICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgZXJyb3I6ICh4aHIsIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgYXNzYXkubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NNZWFzdXJlbWVudERhdGEocHJvdG9jb2wsIGRhdGEpIHtcbiAgICAgICAgdmFyIGFzc2F5U2VlbiA9IHt9LFxuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5ID0ge30sXG4gICAgICAgICAgICBjb3VudF90b3RhbDpudW1iZXIgPSAwLFxuICAgICAgICAgICAgY291bnRfcmVjOm51bWJlciA9IDA7XG4gICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9O1xuICAgICAgICBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgPSAkLmV4dGVuZChFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgfHwge30sIGRhdGEudHlwZXMpO1xuXG4gICAgICAgIC8vIGF0dGFjaCBtZWFzdXJlbWVudCBjb3VudHMgdG8gZWFjaCBhc3NheVxuICAgICAgICAkLmVhY2goZGF0YS50b3RhbF9tZWFzdXJlcywgKGFzc2F5SWQ6c3RyaW5nLCBjb3VudDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBJZiB3ZSBldmVyIGZldGNoIGJ5IHNvbWV0aGluZyBvdGhlciB0aGFuIHByb3RvY29sLFxuICAgICAgICAgICAgICAgIC8vIElzbid0IHRoZXJlIGEgY2hhbmNlIHRoaXMgaXMgY3VtdWxhdGl2ZSwgYW5kIHdlIHNob3VsZCArPSA/XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgYXNzYXkuY291bnQgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIC8vIGF0dGFjaCB2YWx1ZXNcbiAgICAgICAgICAgICQuZXh0ZW5kKG1lYXN1cmVtZW50LCB7ICd2YWx1ZXMnOiBkYXRhLmRhdGFbbWVhc3VyZW1lbnQuaWRdIHx8IFtdIH0pO1xuICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudC5pZF0gPSBtZWFzdXJlbWVudDtcbiAgICAgICAgICAgIC8vIHRyYWNrIHdoaWNoIGFzc2F5cyByZWNlaXZlZCB1cGRhdGVkIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgYXNzYXlTZWVuW2Fzc2F5LmlkXSA9IHRydWU7XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXSA9IHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdIHx8IHt9O1xuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF1bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGhhbmRsZSBtZWFzdXJlbWVudCBkYXRhIGJhc2VkIG9uIHR5cGVcbiAgICAgICAgICAgIG10eXBlID0gZGF0YS50eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgIChhc3NheS5tZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIGlmIChtdHlwZS5mYW1pbHkgPT09ICdtJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBtZXRhYm9saXRlXG4gICAgICAgICAgICAgICAgKGFzc2F5Lm1ldGFib2xpdGVzID0gYXNzYXkubWV0YWJvbGl0ZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgKGFzc2F5LnByb3RlaW5zID0gYXNzYXkucHJvdGVpbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgIChhc3NheS50cmFuc2NyaXB0aW9ucyA9IGFzc2F5LnRyYW5zY3JpcHRpb25zIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgKGFzc2F5LmdlbmVyYWwgPSBhc3NheS5nZW5lcmFsIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzKGRhdGEubWVhc3VyZXMgfHwge30sIGRhdGEudHlwZXMpO1xuXG4gICAgICAgIGlmIChjb3VudF9yZWMgPCBjb3VudF90b3RhbCkge1xuICAgICAgICAgICAgLy8gVE9ETyBub3QgYWxsIG1lYXN1cmVtZW50cyBkb3dubG9hZGVkOyBkaXNwbGF5IGEgbWVzc2FnZSBpbmRpY2F0aW5nIHRoaXNcbiAgICAgICAgICAgIC8vIGV4cGxhaW4gZG93bmxvYWRpbmcgaW5kaXZpZHVhbCBhc3NheSBtZWFzdXJlbWVudHMgdG9vXG4gICAgICAgIH1cbiAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpIHtcbiAgICAgICAgaWYgKHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQocmVmcmVzRGF0YURpc3BsYXlJZlN0YWxlVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyID0gc2V0VGltZW91dChyZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlLmJpbmQodGhpcyksIDEwMCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKSB7XG4gICAgICAgIGlmIChhY3Rpb25QYW5lbFJlZnJlc2hUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGFjdGlvblBhbmVsUmVmcmVzaFRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICBhY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoYWN0aW9uUGFuZWxSZWZyZXNoLmJpbmQodGhpcyksIDE1MCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGZ1bmN0aW9uIGRldGVybWluZXMgaWYgdGhlIGZpbHRlcmluZyBzZWN0aW9ucyAob3Igc2V0dGluZ3MgcmVsYXRlZCB0byB0aGVtKSBoYXZlIGNoYW5nZWRcbiAgICAvLyBzaW5jZSB0aGUgbGFzdCB0aW1lIHdlIHdlcmUgaW4gdGhlIGN1cnJlbnQgZGlzcGxheSBtb2RlIChlLmcuIGxpbmUgZ3JhcGgsIHRhYmxlLCBiYXIgZ3JhcGhcbiAgICAvLyBpbiB2YXJpb3VzIG1vZGVzLCBldGMpIGFuZCB1cGRhdGVzIHRoZSBkaXNwbGF5IG9ubHkgaWYgYSBjaGFuZ2UgaXMgZGV0ZWN0ZWQuXG4gICAgZnVuY3Rpb24gcmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZShmb3JjZT86Ym9vbGVhbikge1xuXG4gICAgICAgIC8vIEFueSBzd2l0Y2ggYmV0d2VlbiB2aWV3aW5nIG1vZGVzLCBvciBjaGFuZ2UgaW4gZmlsdGVyaW5nLCBpcyBhbHNvIGNhdXNlIHRvIGNoZWNrIHRoZSBVSVxuICAgICAgICAvLyBpbiB0aGUgYWN0aW9uIHBhbmVsIGFuZCBtYWtlIHN1cmUgaXQncyBjdXJyZW50LlxuICAgICAgICBxdWV1ZUFjdGlvblBhbmVsUmVmcmVzaCgpO1xuXG4gICAgICAgIC8vIElmIHRoZSBmaWx0ZXJpbmcgd2lkZ2V0IGNsYWltcyBhIGNoYW5nZSBzaW5jZSB0aGUgbGFzdCBpbnF1aXJ5LFxuICAgICAgICAvLyB0aGVuIGFsbCB0aGUgdmlld2luZyBtb2RlcyBhcmUgc3RhbGUsIG5vIG1hdHRlciB3aGF0LlxuICAgICAgICAvLyBTbyB3ZSBtYXJrIHRoZW0gYWxsLlxuICAgICAgICBpZiAocHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZSkpIHtcblxuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydsaW5lZ3JhcGgnXSA9IHRydWU7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbJ2JhcmdyYXBoLXRpbWUnXSA9IHRydWU7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbJ2JhcmdyYXBoLWxpbmUnXSA9IHRydWU7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbJ2JhcmdyYXBoLW1lYXN1cmVtZW50J10gPSB0cnVlO1xuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWyd0YWJsZSddID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIFB1bGwgb3V0IGEgZnJlc2ggc2V0IG9mIGZpbHRlcmVkIG1lYXN1cmVtZW50cyBhbmQgYXNzYXlzXG4gICAgICAgICAgICB2YXIgZmlsdGVyUmVzdWx0cyA9IHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkRmlsdGVyZWRNZWFzdXJlbWVudHMoKTtcbiAgICAgICAgICAgIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMgPSBmaWx0ZXJSZXN1bHRzWydmaWx0ZXJlZE1lYXN1cmVtZW50cyddO1xuICAgICAgICAgICAgcG9zdEZpbHRlcmluZ0Fzc2F5cyA9IGZpbHRlclJlc3VsdHNbJ2ZpbHRlcmVkQXNzYXlzJ107XG5cbiAgICAgICAgLy8gSWYgdGhlIGZpbHRlcmluZyB3aWRnZXQgaGFzbid0IGNoYW5nZWQgYW5kIHRoZSBjdXJyZW50IG1vZGUgZG9lc24ndCBjbGFpbSB0byBiZSBzdGFsZSwgd2UncmUgZG9uZS5cbiAgICAgICAgfSBlbHNlIGlmICh2aWV3aW5nTW9kZSA9PSAnYmFyZ3JhcGgnKSB7XG4gICAgICAgICAgICAvLyBTcGVjaWFsIGNhc2UgdG8gaGFuZGxlIHRoZSBleHRyYSBzdWItbW9kZXMgb2YgdGhlIGJhciBncmFwaFxuICAgICAgICAgICAgaWYgKCF2aWV3aW5nTW9kZUlzU3RhbGVbdmlld2luZ01vZGUrJy0nK2JhckdyYXBoTW9kZV0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIXZpZXdpbmdNb2RlSXNTdGFsZVt2aWV3aW5nTW9kZV0pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2aWV3aW5nTW9kZSA9PSAndGFibGUnKSB7XG4gICAgICAgICAgICBpZiAoYXNzYXlzRGF0YUdyaWRTcGVjID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYXNzYXlzRGF0YUdyaWRTcGVjID0gbmV3IERhdGFHcmlkU3BlY0Fzc2F5cygpO1xuICAgICAgICAgICAgICAgIGFzc2F5c0RhdGFHcmlkU3BlYy5pbml0KCk7XG4gICAgICAgICAgICAgICAgYXNzYXlzRGF0YUdyaWQgPSBuZXcgRGF0YUdyaWRBc3NheXMoYXNzYXlzRGF0YUdyaWRTcGVjKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXNzYXlzRGF0YUdyaWQudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWyd0YWJsZSddID0gZmFsc2U7XG4gICAgICAgICAgICBtYWtlTGFiZWxzQmxhY2soRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVtYWtlTWFpbkdyYXBoQXJlYSgpO1xuICAgICAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICdiYXJncmFwaCcpIHtcbiAgICAgICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbdmlld2luZ01vZGUrJy0nK2JhckdyYXBoTW9kZV0gPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydsaW5lZ3JhcGgnXSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBhY3Rpb25QYW5lbFJlZnJlc2goKSB7XG4gICAgICAgIHZhciBjaGVja2VkQm94ZXM6IEhUTUxJbnB1dEVsZW1lbnRbXSwgY2hlY2tlZEFzc2F5czogbnVtYmVyLCBjaGVja2VkTWVhc3VyZTogbnVtYmVyLFxuICAgICAgICAgICAgbm90aGluZ1NlbGVjdGVkOiBib29sZWFuLCBjb250ZW50U2Nyb2xsaW5nOiBib29sZWFuLCBmaWx0ZXJJbkJvdHRvbTogYm9vbGVhbjtcbiAgICAgICAgLy8gRmlndXJlIG91dCBob3cgbWFueSBhc3NheXMvY2hlY2tib3hlcyBhcmUgc2VsZWN0ZWQuXG5cbiAgICAgICAgLy8gRG9uJ3Qgc2hvdyB0aGUgc2VsZWN0ZWQgaXRlbSBjb3VudCBpZiB3ZSdyZSBub3QgbG9va2luZyBhdCB0aGUgdGFibGUuXG4gICAgICAgIC8vIChPbmx5IHRoZSB2aXNpYmxlIGl0ZW0gY291bnQgbWFrZXMgc2Vuc2UgaW4gdGhhdCBjYXNlLilcbiAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICd0YWJsZScpIHtcbiAgICAgICAgICAgICQoJy5kaXNwbGF5ZWREaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBpZiAoYXNzYXlzRGF0YUdyaWQpIHtcbiAgICAgICAgICAgICAgICBjaGVja2VkQm94ZXMgPSBhc3NheXNEYXRhR3JpZC5nZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2hlY2tlZEJveGVzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGVja2VkQXNzYXlzID0gJChjaGVja2VkQm94ZXMpLmZpbHRlcignW25hbWU9YXNzYXlJZF0nKS5sZW5ndGg7XG4gICAgICAgICAgICBjaGVja2VkTWVhc3VyZSA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJ1tuYW1lPW1lYXN1cmVtZW50SWRdJykubGVuZ3RoO1xuICAgICAgICAgICAgbm90aGluZ1NlbGVjdGVkID0gIWNoZWNrZWRBc3NheXMgJiYgIWNoZWNrZWRNZWFzdXJlO1xuICAgICAgICAgICAgLy9lbmFibGUgYWN0aW9uIGJ1dHRvbnMgaWYgc29tZXRoaW5nIGlzIHNlbGVjdGVkXG4gICAgICAgICAgICAkKCcudGFibGVBY3Rpb25CdXR0b25zJykuZmluZCgnYnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCBub3RoaW5nU2VsZWN0ZWQpO1xuICAgICAgICAgICAgJCgnLnNlbGVjdGVkRGl2JykudG9nZ2xlQ2xhc3MoJ29mZicsIG5vdGhpbmdTZWxlY3RlZCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRTdHJzID0gW107XG4gICAgICAgICAgICBpZiAoIW5vdGhpbmdTZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGlmIChjaGVja2VkQXNzYXlzKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU3Rycy5wdXNoKChjaGVja2VkQXNzYXlzID4gMSkgPyAoY2hlY2tlZEFzc2F5cyArIFwiIEFzc2F5c1wiKSA6IFwiMSBBc3NheVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU3Rycy5wdXNoKChjaGVja2VkTWVhc3VyZSA+IDEpID8gKGNoZWNrZWRNZWFzdXJlICsgXCIgTWVhc3VyZW1lbnRzXCIpIDogXCIxIE1lYXN1cmVtZW50XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0ZWRTdHIgPSBzZWxlY3RlZFN0cnMuam9pbignLCAnKTtcbiAgICAgICAgICAgICAgICAkKCcuc2VsZWN0ZWREaXYnKS50ZXh0KHNlbGVjdGVkU3RyICsgJyBzZWxlY3RlZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCgnLnNlbGVjdGVkRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnLmRpc3BsYXllZERpdicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfVxuICAgICAgICAvL2lmIHRoZXJlIGFyZSBhc3NheXMgYnV0IG5vIGRhdGEsIHNob3cgZW1wdHkgYXNzYXlzXG4gICAgICAgIC8vbm90ZTogdGhpcyBpcyB0byBjb21iYXQgdGhlIGN1cnJlbnQgZGVmYXVsdCBzZXR0aW5nIGZvciBzaG93aW5nIGdyYXBoIG9uIHBhZ2UgbG9hZFxuICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuQXNzYXlzKS5sZW5ndGggPiAwICYmIF8ua2V5cyhFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzKS5sZW5ndGggPT09IDAgKSB7XG4gICAgICAgICAgICBpZiAoISQoJyNUYWJsZVNob3dFQXNzYXlzQ0InKS5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICAkKCcjVGFibGVTaG93RUFzc2F5c0NCJykuY2xpY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1vdmUgYnV0dG9ucyBzbyB0aGV5IGFyZSBhbHdheXMgdmlzaWJsZSBpZiB0aGUgcGFnZSBpcyBzY3JvbGxpbmdcbiAgICAgICAgY29udGVudFNjcm9sbGluZyA9IGlzQ29udGVudFNjcm9sbGluZygpO1xuICAgICAgICBpZiAoYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyICYmICFjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKS5zaG93KCk7XG4gICAgICAgICAgICAkKCcjY29weUFjdGlvblBhbmVsJykuaGlkZSgpO1xuICAgICAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAoIWFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciAmJiBjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjY29weUFjdGlvblBhbmVsJykuc2hvdygpO1xuICAgICAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG9ubHkgbW92ZSB0aGUgZmlsdGVyIHNlY3Rpb24gd2hlbiB0aGUgcGFnZSBpcyBzY3JvbGxpbmcgaW4gdGFibGUgdmlld1xuICAgICAgICBpZiAodmlld2luZ01vZGUgPT0gJ3RhYmxlJykge1xuICAgICAgICAgICAgY29udGVudFNjcm9sbGluZyA9IGlzQ29udGVudFNjcm9sbGluZygpO1xuICAgICAgICAgICAgZmlsdGVySW5Cb3R0b20gPSAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5wYXJlbnQoKS5pcygnI2JvdHRvbUJhcicpO1xuICAgICAgICAgICAgaWYgKGZpbHRlckluQm90dG9tICYmICFjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kVG8oJyNjb250ZW50Jyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFmaWx0ZXJJbkJvdHRvbSAmJiBjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kVG8oJyNib3R0b21CYXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gaXNDb250ZW50U2Nyb2xsaW5nKCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgdmlld0hlaWdodDogbnVtYmVyID0gMCwgaXRlbXNIZWlnaHQ6IG51bWJlciA9IDA7XG4gICAgICAgIHZpZXdIZWlnaHQgPSAkKCcjY29udGVudCcpLmhlaWdodCgpO1xuICAgICAgICAkKCcjY29udGVudCcpLmNoaWxkcmVuKCkuZWFjaCgoaSwgZSkgPT4geyBpdGVtc0hlaWdodCArPSBlLnNjcm9sbEhlaWdodDsgfSk7XG4gICAgICAgIHJldHVybiB2aWV3SGVpZ2h0IDwgaXRlbXNIZWlnaHQ7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiByZW1ha2VNYWluR3JhcGhBcmVhKCkge1xuXG4gICAgICAgIHZhciBkYXRhUG9pbnRzRGlzcGxheWVkID0gMCxcbiAgICAgICAgICAgIGRhdGFQb2ludHNUb3RhbCA9IDAsXG4gICAgICAgICAgICBkYXRhU2V0cyA9IFtdO1xuXG4gICAgICAgICQoJyN0b29NYW55UG9pbnRzJykuaGlkZSgpO1xuICAgICAgICAkKCcjbGluZUdyYXBoJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAkKCcjYmFyR3JhcGhCeVRpbWUnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgJCgnI2JhckdyYXBoQnlNZWFzdXJlbWVudCcpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICAvLyBzaG93IG1lc3NhZ2UgdGhhdCB0aGVyZSdzIG5vIGRhdGEgdG8gZGlzcGxheVxuICAgICAgICBpZiAocG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7ICAgIC8vIFJlbW92ZSBsb2FkIHNwaW5uZXIgaWYgc3RpbGwgcHJlc2VudFxuICAgICAgICAgICAgJCgnI25vRGF0YScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgICQuZWFjaChwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzLCAoaSwgbWVhc3VyZW1lbnRJZCkgPT4ge1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElkXSxcbiAgICAgICAgICAgICAgICBwb2ludHMgPSAobWVhc3VyZS52YWx1ZXMgPyBtZWFzdXJlLnZhbHVlcy5sZW5ndGggOiAwKSxcbiAgICAgICAgICAgICAgICBhc3NheSwgbGluZSwgbmFtZSwgc2luZ2xlQXNzYXlPYmosIGNvbG9yLCBwcm90b2NvbCwgbGluZU5hbWUsIGRhdGFPYmo7XG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgKz0gcG9pbnRzO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50c0Rpc3BsYXllZCA+IDE1MDAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoZSByZXN0IGlmIHdlJ3ZlIGhpdCBvdXIgbGltaXRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGF0YVBvaW50c0Rpc3BsYXllZCArPSBwb2ludHM7XG4gICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldIHx8IHt9O1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSB8fCB7fTtcbiAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXSB8fCB7fTtcbiAgICAgICAgICAgIG5hbWUgPSBhc3NheS5uYW1lO1xuICAgICAgICAgICAgbGluZU5hbWUgPSBsaW5lLm5hbWU7XG5cbiAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG5cbiAgICAgICAgICAgIGlmIChfLmtleXMoRURERGF0YS5MaW5lcykubGVuZ3RoID4gMjIpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNoYW5nZUxpbmVDb2xvcihsaW5lLCBhc3NheS5saWQpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA8IDEpIHtcbiAgICAgICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLmxhYmVscy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgLy8gdW5jaGVja2VkIGxhYmVscyBibGFja1xuICAgICAgICAgICAgICAgIG1ha2VMYWJlbHNCbGFjayhFRERHcmFwaGluZ1Rvb2xzLmxhYmVscyk7XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICBpZiAoY29sb3IgPT09IG51bGwgfHwgY29sb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvdW50ID0gbm9DaGVja2VkQm94ZXMoRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLm5leHRDb2xvciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGFkZENvbG9yKEVEREdyYXBoaW5nVG9vbHMubGFiZWxzLCBhc3NheS5saWQpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gYmxhY2tcbiAgICAgICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNvbG9yID09PSBudWxsIHx8IGNvbG9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRhdGFPYmogPSB7XG4gICAgICAgICAgICAgICAgJ21lYXN1cmUnOiBtZWFzdXJlLFxuICAgICAgICAgICAgICAgICdkYXRhJzogRURERGF0YSxcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG5hbWUsXG4gICAgICAgICAgICAgICAgJ2NvbG9yJzogY29sb3IsXG4gICAgICAgICAgICAgICAgJ2xpbmVOYW1lJzogbGluZU5hbWVcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzaW5nbGVBc3NheU9iaiA9IEVEREdyYXBoaW5nVG9vbHMudHJhbnNmb3JtU2luZ2xlTGluZUl0ZW0oZGF0YU9iaik7XG4gICAgICAgICAgICBkYXRhU2V0cy5wdXNoKHNpbmdsZUFzc2F5T2JqKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnLmRpc3BsYXllZERpdicpLnRleHQoZGF0YVBvaW50c0Rpc3BsYXllZCArIFwiIG1lYXN1cmVtZW50cyBkaXNwbGF5ZWRcIik7XG5cbiAgICAgICAgJCgnI25vRGF0YScpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMrKztcbiAgICAgICAgdW5jaGVja0V2ZW50SGFuZGxlcihFRERHcmFwaGluZ1Rvb2xzLmxhYmVscyk7XG5cbiAgICAgICAgdmFyIGJhckFzc2F5T2JqICA9IEVEREdyYXBoaW5nVG9vbHMuY29uY2F0QXNzYXlzKGRhdGFTZXRzKTtcblxuICAgICAgICAvL2RhdGEgZm9yIGdyYXBoc1xuICAgICAgICB2YXIgZ3JhcGhTZXQgPSB7XG4gICAgICAgICAgICBiYXJBc3NheU9iajogRURER3JhcGhpbmdUb29scy5jb25jYXRBc3NheXMoZGF0YVNldHMpLFxuICAgICAgICAgICAgY3JlYXRlX3hfYXhpczogRURER3JhcGhpbmdUb29scy5jcmVhdGVYQXhpcyxcbiAgICAgICAgICAgIGNyZWF0ZV9yaWdodF95X2F4aXM6IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlUmlnaHRZQXhpcyxcbiAgICAgICAgICAgIGNyZWF0ZV95X2F4aXM6IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlTGVmdFlBeGlzLFxuICAgICAgICAgICAgeF9heGlzOiBFRERHcmFwaGluZ1Rvb2xzLm1ha2VfeF9heGlzLFxuICAgICAgICAgICAgeV9heGlzOiBFRERHcmFwaGluZ1Rvb2xzLm1ha2VfcmlnaHRfeV9heGlzLFxuICAgICAgICAgICAgaW5kaXZpZHVhbERhdGE6IGRhdGFTZXRzLFxuICAgICAgICAgICAgYXNzYXlNZWFzdXJlbWVudHM6IGJhckFzc2F5T2JqLFxuICAgICAgICAgICAgd2lkdGg6IDc1MCxcbiAgICAgICAgICAgIGhlaWdodDogMjIwXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICdsaW5lZ3JhcGgnKSB7XG4gICAgICAgICAgICAkKCcjbGluZUdyYXBoJykuZW1wdHkoKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB2YXIgcyA9IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlU3ZnKCQoJyNsaW5lR3JhcGgnKS5nZXQoMCkpO1xuICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5jcmVhdGVNdWx0aUxpbmVHcmFwaChncmFwaFNldCwgcyk7XG4gICAgICAgIH0gZWxzZSBpZiAoYmFyR3JhcGhNb2RlID09ICd0aW1lJykge1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlUaW1lJykuZW1wdHkoKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB2YXIgcyA9IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlU3ZnKCQoJyNiYXJHcmFwaEJ5VGltZScpLmdldCgwKSk7XG4gICAgICAgICAgICBjcmVhdGVHcm91cGVkQmFyR3JhcGgoZ3JhcGhTZXQsIHMpO1xuICAgICAgICB9IGVsc2UgaWYgKGJhckdyYXBoTW9kZSA9PSAnbGluZScpIHtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLmVtcHR5KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdmFyIHMgPSBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVN2ZygkKCcjYmFyR3JhcGhCeUxpbmUnKS5nZXQoMCkpO1xuICAgICAgICAgICAgY3JlYXRlR3JvdXBlZEJhckdyYXBoKGdyYXBoU2V0LCBzKTtcbiAgICAgICAgfSBlbHNlIGlmIChiYXJHcmFwaE1vZGUgPT0gJ21lYXN1cmVtZW50Jykge1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlNZWFzdXJlbWVudCcpLmVtcHR5KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdmFyIHMgPSBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVN2ZygkKCcjYmFyR3JhcGhCeU1lYXN1cmVtZW50JykuZ2V0KDApKTtcbiAgICAgICAgICAgIGNyZWF0ZUdyb3VwZWRCYXJHcmFwaChncmFwaFNldCwgcyk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gbWFrZXMgdW5jaGVja2VkIGxhYmVscyBibGFja1xuICAgICAqIEBwYXJhbSBzZWxlY3RvcnNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlTGFiZWxzQmxhY2soc2VsZWN0b3JzOkpRdWVyeVtdKSB7XG4gICAgICAgIF8uZWFjaChzZWxlY3RvcnMsIGZ1bmN0aW9uKHNlbGVjdG9yOkpRdWVyeSkge1xuICAgICAgICAgICAgaWYgKHNlbGVjdG9yLnByZXYoKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAkKHNlbGVjdG9yKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIGNyZWF0ZXMgYW4gZXZlbnQgaGFuZGxlciBmb3IgdW5jaGVja2luZyBhIGNoZWNrZWQgY2hlY2tib3hcbiAgICAgKiBAcGFyYW0gbGFiZWxzXG4gICAgICovXG4gICAgZnVuY3Rpb24gdW5jaGVja0V2ZW50SGFuZGxlcihsYWJlbHMpIHtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWwpe1xuICAgICAgICAgICAgdmFyIGlkID0gJChsYWJlbCkucHJldigpLmF0dHIoJ2lkJyk7XG4gICAgICAgICAgICAkKCcjJyArIGlkKS5jaGFuZ2UoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGlzY2hlY2tlZD0gJCh0aGlzKS5pcygnOmNoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICBpZiAoIWlzY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiByZXR1cm5zIGhvdyBtYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQuXG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqIEByZXR1cm5zIGNvdW50IG9mIGNoZWNrZWQgYm94ZXMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbm9DaGVja2VkQm94ZXMobGFiZWxzKSB7XG4gICAgICAgIHZhciBjb3VudCA9IDA7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsKSB7XG4gICAgICAgICAgICB2YXIgY2hlY2tib3ggPSAkKGxhYmVsKS5wcmV2KCk7XG4gICAgICAgICAgICBpZiAoJChjaGVja2JveCkucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWRkcyBjb2xvcnMgYWZ0ZXIgdXNlciBoYXMgY2xpY2tlZCBhIGxpbmUgYW5kIHRoZW4gdW5jbGlja2VkIGFsbCB0aGUgbGluZXMuXG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqIEBwYXJhbSBhc3NheVxuICAgICAqIEByZXR1cm5zIGxhYmVsc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZENvbG9yKGxhYmVsczpKUXVlcnlbXSwgYXNzYXkpIHtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWw6SlF1ZXJ5KSB7XG4gICAgICAgICAgICB2YXIgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1thc3NheV0ubmFtZSA9PT0gbGFiZWwudGV4dCgpKSB7XG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBsYWJlbHM7XG4gICAgfVxuXG5cbiAgICAvKiogdGhpcyBmdW5jdGlvbiB0YWtlcyBpbiBhbiBlbGVtZW50IHNlbGVjdG9yIGFuZCBhbiBhcnJheSBvZiBzdmcgcmVjdHMgYW5kIHJldHVybnNcbiAgICAgKiByZXR1cm5zIG1lc3NhZ2Ugb3Igbm90aGluZy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzdmdXaWR0aChzZWxlY3RvciwgcmVjdEFycmF5KSB7XG4gICAgICAgICQoJy50b29NdWNoRGF0YScpLmhpZGUoKTtcbiAgICAgICAgJCgnLm5vRGF0YScpLmhpZGUoKTtcbiAgICAgICAgdmFyIHN1bSA9IDA7XG4gICAgICAgIF8uZWFjaChyZWN0QXJyYXksIGZ1bmN0aW9uKHJlY3RFbGVtOmFueSkge1xuICAgICAgICAgICAgaWYgKHJlY3RFbGVtLmdldEF0dHJpYnV0ZShcIndpZHRoXCIpICE9IDApIHtcbiAgICAgICAgICAgICAgICBzdW0rK1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKHN1bSA9PT0gMCkge1xuICAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKHNlbGVjdG9yKS5wcmVwZW5kKFwiPHAgY2xhc3M9JyB0b29NdWNoRGF0YSc+VG9vIG1hbnkgZGF0YSBwb2ludHMgdG8gZGlzcGxheVwiICtcbiAgICAgICAgICAgICAgICBcIjwvcD48cCAgY2xhc3M9JyB0b29NdWNoRGF0YSc+UmVjb21tZW5kIGZpbHRlcmluZyBieSBwcm90b2NvbDwvcD5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qKiB0aGlzIGZ1bmN0aW9uIHRha2VzIGluIHRoZSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgb2JqZWN0IGFuZCByZXR1cm5zIHRoZSBtZWFzdXJlbWVudCB0eXBlXG4gICAgICogIHRoYXQgaGFzIHRoZSBtb3N0IGRhdGEgcG9pbnRzIC0gb3B0aW9ucyBhcmUgYmFzZWQgb24gZmFtaWx5IHAsIG0sIC0sIGV0Yy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtZWFzdXJlbWVudFR5cGUodHlwZXMpIHsgICAgLy8gVE9ETzogUkVOQU1FXG4gICAgICAgIHZhciBwcm90ZW9taWNzID0ge307XG4gICAgICAgIGZvciAodmFyIHR5cGUgaW4gdHlwZXMpIHtcbiAgICAgICAgICAgIGlmIChwcm90ZW9taWNzLmhhc093blByb3BlcnR5KHR5cGVzW3R5cGVdLmZhbWlseSkpIHtcbiAgICAgICAgICAgICAgICBwcm90ZW9taWNzW3R5cGVzW3R5cGVdLmZhbWlseV0rKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHJvdGVvbWljc1t0eXBlc1t0eXBlXS5mYW1pbHldID0gMFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBwcm90ZW9taWNzKSB7XG4gICAgICAgICAgICB2YXIgbWF4OmFueSA9IDA7XG4gICAgICAgICAgICB2YXIgbWF4VHlwZTphbnk7XG4gICAgICAgICAgICBpZiAocHJvdGVvbWljc1trZXldID4gbWF4KSB7XG4gICAgICAgICAgICAgICAgbWF4ID0gcHJvdGVvbWljc1trZXldO1xuICAgICAgICAgICAgICAgIG1heFR5cGUgPSBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1heFR5cGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiB0YWtlcyBpbiBpbnB1dCBtaW4geSB2YWx1ZSwgbWF4IHkgdmFsdWUsIGFuZCB0aGUgc29ydGVkIGpzb24gb2JqZWN0LlxuICAgICAqICBvdXRwdXRzIGEgZ3JvdXBlZCBiYXIgZ3JhcGggd2l0aCB2YWx1ZXMgZ3JvdXBlZCBieSBhc3NheSBuYW1lXG4gICAgICoqL1xuICAgIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVHcm91cGVkQmFyR3JhcGgoZ3JhcGhTZXQsIHN2Zykge1xuXG4gICAgICAgIHZhciBhc3NheU1lYXN1cmVtZW50cyA9IGdyYXBoU2V0LmFzc2F5TWVhc3VyZW1lbnRzLFxuICAgICAgICAgICAgdHlwZUlEID0ge1xuICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudCc6IFwiI2JhckdyYXBoQnlNZWFzdXJlbWVudFwiLFxuICAgICAgICAgICAgICAgICd4JzogXCIjYmFyR3JhcGhCeVRpbWVcIixcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICcjYmFyR3JhcGhCeUxpbmUnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbW9kZVRvRmllbGQgPSB7XG4gICAgICAgICAgICAgICAgJ2xpbmUnOiAnbmFtZScsXG4gICAgICAgICAgICAgICAgJ3RpbWUnOiAneCcsXG4gICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50JzogJ21lYXN1cmVtZW50J1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG51bVVuaXRzID0gRURER3JhcGhpbmdUb29scy5ob3dNYW55VW5pdHMoYXNzYXlNZWFzdXJlbWVudHMpLFxuICAgICAgICAgICAgeVJhbmdlID0gW10sXG4gICAgICAgICAgICB1bml0TWVhc3VyZW1lbnREYXRhID0gW10sXG4gICAgICAgICAgICB5TWluID0gW10sXG4gICAgICAgICAgICBkYXRhLCBuZXN0ZWQsIHR5cGVOYW1lcywgeFZhbHVlcywgeXZhbHVlSWRzLCB4X25hbWUsIHhWYWx1ZUxhYmVscyxcbiAgICAgICAgICAgIHNvcnRlZFh2YWx1ZXMsIGRpdiwgeF94VmFsdWUsIGxpbmVJRCwgbWVhcywgeSwgd29yZExlbmd0aDtcblxuICAgICAgICB2YXIgdHlwZSA9IG1vZGVUb0ZpZWxkW2JhckdyYXBoTW9kZV07XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICd4Jykge1xuICAgICAgICAgICAgIHZhciBlbnRyaWVzID0gKDxhbnk+ZDMpLm5lc3QodHlwZSlcbiAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZFt0eXBlXTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKGFzc2F5TWVhc3VyZW1lbnRzKTtcblxuICAgICAgICAgICAgdmFyIHRpbWVNZWFzdXJlbWVudHMgPSBfLmNsb25lKGFzc2F5TWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgIHZhciBuZXN0ZWRCeVRpbWUgPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRBbGxUaW1lKGVudHJpZXMpO1xuICAgICAgICAgICAgdmFyIGhvd01hbnlUb0luc2VydE9iaiA9IEVEREdyYXBoaW5nVG9vbHMuZmluZE1heFRpbWVEaWZmZXJlbmNlKG5lc3RlZEJ5VGltZSk7XG4gICAgICAgICAgICB2YXIgbWF4ID0gTWF0aC5tYXguYXBwbHkobnVsbCwgXy52YWx1ZXMoaG93TWFueVRvSW5zZXJ0T2JqKSk7XG4gICAgICAgICAgICBpZiAobWF4ID4gNDAwKSB7XG4gICAgICAgICAgICAgICAgJCh0eXBlSURbdHlwZV0pLnByZXBlbmQoXCI8cCBjbGFzcz0nbm9EYXRhJz5Ub28gbWFueSBtaXNzaW5nIGRhdGEgZmllbGRzLiBQbGVhc2UgZmlsdGVyPC9wPlwiKTtcbiAgICAgICAgICAgICAgICAkKCcudG9vTXVjaERhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJCgnLm5vRGF0YScpLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5pbnNlcnRGYWtlVmFsdWVzKGVudHJpZXMsIGhvd01hbnlUb0luc2VydE9iaiwgdGltZU1lYXN1cmVtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgLy94IGF4aXMgc2NhbGUgZm9yIHR5cGVcbiAgICAgICAgeF9uYW1lID0gZDMuc2NhbGUub3JkaW5hbCgpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZEJhbmRzKFswLCBncmFwaFNldC53aWR0aF0sIDAuMSk7XG5cbiAgICAgICAgLy94IGF4aXMgc2NhbGUgZm9yIHggdmFsdWVzXG4gICAgICAgIHhfeFZhbHVlID0gZDMuc2NhbGUub3JkaW5hbCgpO1xuXG4gICAgICAgIC8veCBheGlzIHNjYWxlIGZvciBsaW5lIGlkIHRvIGRpZmZlcmVudGlhdGUgbXVsdGlwbGUgbGluZXMgYXNzb2NpYXRlZCB3aXRoIHRoZSBzYW1lIG5hbWUvdHlwZVxuICAgICAgICBsaW5lSUQgPSBkMy5zY2FsZS5vcmRpbmFsKCk7XG5cbiAgICAgICAgLy8geSBheGlzIHJhbmdlIHNjYWxlXG4gICAgICAgIHkgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgLnJhbmdlKFtncmFwaFNldC5oZWlnaHQsIDBdKTtcblxuICAgICAgICBkaXYgPSBkMy5zZWxlY3QoXCJib2R5XCIpLmFwcGVuZChcImRpdlwiKVxuICAgICAgICAgICAgLmF0dHIoXCJjbGFzc1wiLCBcInRvb2x0aXAyXCIpXG4gICAgICAgICAgICAuc3R5bGUoXCJvcGFjaXR5XCIsIDApO1xuXG4gICAgICAgIHZhciBkM19lbnRyaWVzID0gdHlwZSA9PT0gJ3gnID8gdGltZU1lYXN1cmVtZW50cyA6IGFzc2F5TWVhc3VyZW1lbnRzO1xuICAgICAgICAgICAgbWVhcyA9IGQzLm5lc3QoKVxuICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZC55X3VuaXQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmVudHJpZXMoZDNfZW50cmllcyk7XG5cbiAgICAgICAgLy8gaWYgdGhlcmUgaXMgbm8gZGF0YSAtIHNob3cgbm8gZGF0YSBlcnJvciBtZXNzYWdlXG4gICAgICAgIGlmIChhc3NheU1lYXN1cmVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICQodHlwZUlEW3R5cGVdKS5wcmVwZW5kKFwiPHAgY2xhc3M9J25vRGF0YSc+Tm8gZGF0YSBzZWxlY3RlZCAtIHBsZWFzZSBcIiArXG4gICAgICAgICAgICBcImZpbHRlcjwvcD5cIik7XG5cbiAgICAgICAgICAgICQoJy50b29NdWNoRGF0YScpLnJlbW92ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCgnLm5vRGF0YScpLnJlbW92ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Vbml0czsgaSsrKSB7XG4gICAgICAgICAgICB5UmFuZ2UucHVzaChkMy5zY2FsZS5saW5lYXIoKS5yYW5nZVJvdW5kKFtncmFwaFNldC5oZWlnaHQsIDBdKSk7XG4gICAgICAgICAgICB1bml0TWVhc3VyZW1lbnREYXRhLnB1c2goZDMubmVzdCgpXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQueTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKG1lYXNbaV0udmFsdWVzKSk7XG4gICAgICAgICAgICB5TWluLnB1c2goZDMubWluKHVuaXRNZWFzdXJlbWVudERhdGFbaV0sIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkMy5taW4oZC52YWx1ZXMsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC55O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gJ3gnKSB7XG4gICAgICAgICAgICAvLyBuZXN0IGRhdGEgYnkgdHlwZSAoaWUgbWVhc3VyZW1lbnQpIGFuZCBieSB4IHZhbHVlXG4gICAgICAgICAgICBuZXN0ZWQgPSAoPGFueT5kMykubmVzdCh0eXBlKVxuICAgICAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkW3R5cGVdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoZC54KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKHRpbWVNZWFzdXJlbWVudHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gbmVzdCBkYXRhIGJ5IHR5cGUgKGllIG1lYXN1cmVtZW50KSBhbmQgYnkgeCB2YWx1ZVxuICAgICAgICAgICAgbmVzdGVkID0gKDxhbnk+ZDMpLm5lc3QodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkW3R5cGVdO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoZC54KTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmVudHJpZXMoYXNzYXlNZWFzdXJlbWVudHMpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvL2luc2VydCB5IHZhbHVlIHRvIGRpc3Rpbmd1aXNoIGJldHdlZW4gbGluZXNcbiAgICAgICAgZGF0YSA9IEVEREdyYXBoaW5nVG9vbHMuZ2V0WFlWYWx1ZXMobmVzdGVkKTtcblxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBzdmdcbiAgICAgICAgfVxuXG4gICAgICAgIC8vZ2V0IHR5cGUgbmFtZXMgZm9yIHggbGFiZWxzXG4gICAgICAgIHR5cGVOYW1lcyA9IGRhdGEubWFwKChkOmFueSkgPT4gZC5rZXkpO1xuXG4gICAgICAgIC8vc29ydCB4IHZhbHVlc1xuICAgICAgICB0eXBlTmFtZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXG4gICAgICAgIHhWYWx1ZXMgPSBkYXRhLm1hcCgoZDphbnkpID0+IGQudmFsdWVzKTtcblxuICAgICAgICB5dmFsdWVJZHMgPSBkYXRhWzBdLnZhbHVlc1swXS52YWx1ZXMubWFwKChkOmFueSkgPT4gZC5rZXkpO1xuXG4gICAgICAgIC8vIHJldHVybnMgdGltZSB2YWx1ZXNcbiAgICAgICAgeFZhbHVlTGFiZWxzID0geFZhbHVlc1swXS5tYXAoKGQ6YW55KSA9PiBkLmtleSk7XG5cbiAgICAgICAgLy9zb3J0IHRpbWUgdmFsdWVzXG4gICAgICAgIHNvcnRlZFh2YWx1ZXMgPSB4VmFsdWVMYWJlbHMuc29ydCgoYSwgYikgPT4gcGFyc2VGbG9hdChhKSAtIHBhcnNlRmxvYXQoYikpO1xuXG4gICAgICAgIHhfbmFtZS5kb21haW4odHlwZU5hbWVzKTtcblxuICAgICAgICB4X3hWYWx1ZS5kb21haW4oc29ydGVkWHZhbHVlcykucmFuZ2VSb3VuZEJhbmRzKFswLCB4X25hbWUucmFuZ2VCYW5kKCldKTtcblxuICAgICAgICBsaW5lSUQuZG9tYWluKHl2YWx1ZUlkcykucmFuZ2VSb3VuZEJhbmRzKFswLCB4X3hWYWx1ZS5yYW5nZUJhbmQoKV0pO1xuXG4gICAgICAgIC8vIGNyZWF0ZSB4IGF4aXNcbiAgICAgICAgZ3JhcGhTZXQuY3JlYXRlX3hfYXhpcyhncmFwaFNldCwgeF9uYW1lLCBzdmcsIHR5cGUpO1xuXG4gICAgICAgIC8vIGxvb3AgdGhyb3VnaCBkaWZmZXJlbnQgdW5pdHNcbiAgICAgICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IG51bVVuaXRzOyBpbmRleCsrKSB7XG5cbiAgICAgICAgICAgIGlmICh5TWluW2luZGV4XSA+IDAgKSB7XG4gICAgICAgICAgICAgICAgeU1pbltpbmRleF0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy95IGF4aXMgbWluIGFuZCBtYXggZG9tYWluXG4gICAgICAgICAgICB5LmRvbWFpbihbeU1pbltpbmRleF0sIGQzLm1heCh1bml0TWVhc3VyZW1lbnREYXRhW2luZGV4XSwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGQzLm1heChkLnZhbHVlcywgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkLnk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KV0pO1xuXG4gICAgICAgICAgICAvL25lc3QgZGF0YSBhc3NvY2lhdGVkIHdpdGggb25lIHVuaXQgYnkgdHlwZSBhbmQgdGltZSB2YWx1ZVxuICAgICAgICAgICAgZGF0YSA9ICg8YW55PmQzKS5uZXN0KHR5cGUpXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRbdHlwZV07XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGFyc2VGbG9hdChkLngpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudHJpZXMobWVhc1tpbmRleF0udmFsdWVzKTtcblxuXG4gICAgICAgICAgICAvLyAvL2hpZGUgdmFsdWVzIGlmIHRoZXJlIGFyZSBkaWZmZXJlbnQgdGltZSBwb2ludHNcbiAgICAgICAgICAgIGlmICh0eXBlICE9ICd4Jykge1xuICAgICAgICAgICAgICAgIHZhciBuZXN0ZWRCeVRpbWUgPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRBbGxUaW1lKGRhdGEpO1xuICAgICAgICAgICAgICAgIHZhciBob3dNYW55VG9JbnNlcnRPYmogPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRNYXhUaW1lRGlmZmVyZW5jZShuZXN0ZWRCeVRpbWUpO1xuICAgICAgICAgICAgICAgIHZhciBtYXggPSBNYXRoLm1heC5hcHBseShudWxsLCBfLnZhbHVlcyhob3dNYW55VG9JbnNlcnRPYmopKTtcbiAgICAgICAgICAgICAgICB2YXIgZ3JhcGhTdmcgPSAkKHR5cGVJRFt0eXBlXSlbMF07XG5cbiAgICAgICAgICAgICAgICBpZiAobWF4ID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcudG9vTXVjaERhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZWN0cyA9IGQzLnNlbGVjdEFsbCh0eXBlSURbdHlwZV0gKyAgJyByZWN0JylbMF07XG4gICAgICAgICAgICAgICAgICAgIHN2Z1dpZHRoKGdyYXBoU3ZnLCBhcmVjdHMpO1xuICAgICAgICAgICAgICAgICAgICAgLy9nZXQgd29yZCBsZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgd29yZExlbmd0aCA9IEVEREdyYXBoaW5nVG9vbHMuZ2V0U3VtKHR5cGVOYW1lcyk7XG4gICAgICAgICAgICAgICAgICAgIGQzLnNlbGVjdEFsbCh0eXBlSURbdHlwZV0gKyAnIC54LmF4aXMgdGV4dCcpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3ZnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5ub0RhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vcmlnaHQgYXhpc1xuICAgICAgICAgICAgaWYgKGluZGV4ID09IDApIHtcbiAgICAgICAgICAgICAgICBncmFwaFNldC5jcmVhdGVfeV9heGlzKGdyYXBoU2V0LCBtZWFzW2luZGV4XS5rZXksIHksIHN2Zyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBzcGFjaW5nID0ge1xuICAgICAgICAgICAgICAgICAgICAxOiBncmFwaFNldC53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgMjogZ3JhcGhTZXQud2lkdGggKyA1MCxcbiAgICAgICAgICAgICAgICAgICAgMzogZ3JhcGhTZXQud2lkdGggKyAxMDAsXG4gICAgICAgICAgICAgICAgICAgIDQ6IGdyYXBoU2V0LndpZHRoICsgMTUwXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAvL2NyZWF0ZSByaWdodCBheGlzXG4gICAgICAgICAgICAgICAgZ3JhcGhTZXQuY3JlYXRlX3JpZ2h0X3lfYXhpcyhtZWFzW2luZGV4XS5rZXksIHksIHN2Zywgc3BhY2luZ1tpbmRleF0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBuYW1lc19nID0gc3ZnLnNlbGVjdEFsbChcIi5ncm91cFwiICsgaW5kZXgpXG4gICAgICAgICAgICAgICAgLmRhdGEoZGF0YSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoXCJnXCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInRyYW5zbGF0ZShcIiArIHhfbmFtZShkLmtleSkgKyBcIiwwKVwiO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgY2F0ZWdvcmllc19nID0gbmFtZXNfZy5zZWxlY3RBbGwoXCIuY2F0ZWdvcnlcIiArIGluZGV4KVxuICAgICAgICAgICAgICAgIC5kYXRhKGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC52YWx1ZXM7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoXCJnXCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInRyYW5zbGF0ZShcIiArIHhfeFZhbHVlKGQua2V5KSArIFwiLDApXCI7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBjYXRlZ29yaWVzX2xhYmVscyA9IGNhdGVnb3JpZXNfZy5zZWxlY3RBbGwoJy5jYXRlZ29yeS1sYWJlbCcgKyBpbmRleClcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtkLmtleV07XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgICAgIC5hcHBlbmQoXCJ0ZXh0XCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ4XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhfeFZhbHVlLnJhbmdlQmFuZCgpIC8gMjtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5hdHRyKCd5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ3JhcGhTZXQuaGVpZ2h0ICsgMjc7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuYXR0cigndGV4dC1hbmNob3InLCAnbWlkZGxlJyk7XG5cbiAgICAgICAgICAgICB2YXIgdmFsdWVzX2cgPSBjYXRlZ29yaWVzX2cuc2VsZWN0QWxsKFwiLnZhbHVlXCIgKyBpbmRleClcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQudmFsdWVzO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGQubGluZU5hbWUgPSBkLmxpbmVOYW1lLnNwbGl0KCcgJykuam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIGQubGluZU5hbWUgPSBkLmxpbmVOYW1lLnNwbGl0KCcvJykuam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAndmFsdWUgdmFsdWUtJyArIGQubGluZU5hbWU7XG4gICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInRyYW5zbGF0ZShcIiArIGxpbmVJRChkLmtleSkgKyBcIiwwKVwiO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkKSB7XG4gICAgICAgICAgICAgICAgICAgIGQzLnNlbGVjdEFsbCgnLnZhbHVlJykuc3R5bGUoJ29wYWNpdHknLCAwLjMpO1xuICAgICAgICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwoJy52YWx1ZS0nICsgZC5saW5lTmFtZSkuc3R5bGUoJ29wYWNpdHknLCAxKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgICAgICAgICAgZDMuc2VsZWN0QWxsKCcudmFsdWUnKS5zdHlsZSgnb3BhY2l0eScsIDEpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgcmVjdHMgPSB2YWx1ZXNfZy5zZWxlY3RBbGwoJy5yZWN0JyArIGluZGV4KVxuICAgICAgICAgICAgICAgIC5kYXRhKGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW2RdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKFwicmVjdFwiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJyZWN0XCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ3aWR0aFwiLCBsaW5lSUQucmFuZ2VCYW5kKCkpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ5XCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geShkLnkpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJoZWlnaHRcIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBncmFwaFNldC5oZWlnaHQgLSB5KGQueSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuc3R5bGUoXCJmaWxsXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC5jb2xvclxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnN0eWxlKFwib3BhY2l0eVwiLCAxKTtcblxuICAgICAgICAgICAgY2F0ZWdvcmllc19nLnNlbGVjdEFsbCgnLnJlY3QnKVxuICAgICAgICAgICAgICAgIC5kYXRhKGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC52YWx1ZXM7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAub24oXCJtb3VzZW92ZXJcIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRpdi50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zdHlsZShcIm9wYWNpdHlcIiwgMC45KTtcblxuICAgICAgICAgICAgICAgICAgICBkaXYuaHRtbCgnPHN0cm9uZz4nICsgZC5uYW1lICsgJzwvc3Ryb25nPicgKyBcIjogXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArIFwiPC9icj5cIiArIGQubWVhc3VyZW1lbnQgKyAnPC9icj4nICsgZC55ICsgXCIgXCIgKyBkLnlfdW5pdCArIFwiPC9icj5cIiArIFwiIEBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICBcIiBcIiArIGQueCArIFwiIGhvdXJzXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc3R5bGUoXCJsZWZ0XCIsICgoPGFueT5kMy5ldmVudCkucGFnZVgpICsgXCJweFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnN0eWxlKFwidG9wXCIsICgoPGFueT5kMy5ldmVudCkucGFnZVkgLSAzMCkgKyBcInB4XCIpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKFwibW91c2VvdXRcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBkaXYudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc3R5bGUoXCJvcGFjaXR5XCIsIDApO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy9nZXQgd29yZCBsZW5ndGhcbiAgICAgICAgICAgIHdvcmRMZW5ndGggPSBFRERHcmFwaGluZ1Rvb2xzLmdldFN1bSh0eXBlTmFtZXMpO1xuXG4gICAgICAgICAgICBpZiAod29yZExlbmd0aCA+IDkwICYmIHR5cGUgIT0gJ3gnKSB7XG4gICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwodHlwZUlEW3R5cGVdICsgJyAueC5heGlzIHRleHQnKS5yZW1vdmUoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdvcmRMZW5ndGggPiAxNTAgJiYgdHlwZSA9PT0gJ3gnKSB7XG4gICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwodHlwZUlEW3R5cGVdICsgJyAueC5heGlzIHRleHQnKS5yZW1vdmUoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIHRha2VzIGluIHRoZSB0eXBlIG9mIG1lYXN1cmVtZW50LCBzZWxlY3RvcnMgb2JqLCBzZWxlY3RvciB0eXBlIGFuZFxuICAgICAqIGJ1dHRvbiBvYmogYW5kIHNob3dzIHRoZSBtZWFzdXJlbWVudCBncmFwaCBpcyB0aGUgbWFpbiB0eXBlIGlzIHByb3Rlb21pY1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIHNob3dQcm90ZW9taWNHcmFwaCh0eXBlLCBzZWxlY3RvcnMsIHNlbGVjdG9yLCBidXR0b25zKSB7XG4gICAgICAgIGlmICh0eXBlID09PSdwJykge1xuICAgICAgICAgICAgZDMuc2VsZWN0KHNlbGVjdG9yc1snbGluZSddKS5zdHlsZSgnZGlzcGxheScsICdub25lJyk7XG4gICAgICAgICAgICBkMy5zZWxlY3Qoc2VsZWN0b3JzWydiYXItbWVhc3VyZW1lbnQnXSkuc3R5bGUoJ2Rpc3BsYXknLCAnYmxvY2snKTtcbiAgICAgICAgICAgICQoJ2xhYmVsLmJ0bicpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIHZhciByZWN0cyA9IGQzLnNlbGVjdEFsbCgnLmdyb3VwZWRNZWFzdXJlbWVudCByZWN0JylbMF07XG4gICAgICAgICAgICBzdmdXaWR0aChzZWxlY3RvcnNbc2VsZWN0b3JdLCByZWN0cyk7XG4gICAgICAgICAgICB2YXIgYnV0dG9uID0gICQoJy5ncm91cEJ5TWVhc3VyZW1lbnRCYXInKVswXTtcbiAgICAgICAgICAgICQoYnV0dG9uc1snYmFyLXRpbWUnXSkucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgJChidXR0b25zWydiYXItbGluZSddKS5yZW1vdmVDbGFzcygnaGlkZGVuJyk7XG4gICAgICAgICAgICAkKGJ1dHRvbnNbJ2Jhci1tZWFzdXJlbWVudCddKS5yZW1vdmVDbGFzcygnaGlkZGVuJyk7XG4gICAgICAgICAgICAkKGJ1dHRvbikuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJChidXR0b25zWydiYXItZW1wdHknXSkuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gbGluZVxuICAgICAqIEBwYXJhbSBhc3NheVxuICAgICAqIEByZXR1cm5zIGNvbG9yIGZvciBsaW5lLlxuICAgICAqIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgY29sb3IgaW4gdGhlIGNvbG9yIHF1ZXVlIGZvciBzdHVkaWVzID4yMiBsaW5lcy4gSW5zdGFudGlhdGVkXG4gICAgICogd2hlbiB1c2VyIGNsaWNrcyBvbiBhIGxpbmUuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY2hhbmdlTGluZUNvbG9yKGxpbmUsIGFzc2F5KSB7XG5cbiAgICAgICAgdmFyIGNvbG9yO1xuXG4gICAgICAgIGlmKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID09PSAxKSB7XG4gICAgICAgICAgICBjb2xvciA9IGxpbmVbJ2NvbG9yJ107XG4gICAgICAgICAgICBsaW5lWydkb05vdENoYW5nZSddID0gdHJ1ZTtcbiAgICAgICAgICAgIEVEREdyYXBoaW5nVG9vbHMuY29sb3JRdWV1ZShjb2xvcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID49IDEpIHtcbiAgICAgICAgICAgIGlmIChsaW5lWydkb05vdENoYW5nZSddKSB7XG4gICAgICAgICAgICAgICBjb2xvciA9IGxpbmVbJ2NvbG9yJ107XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gRURER3JhcGhpbmdUb29scy5uZXh0Q29sb3I7XG4gICAgICAgICAgICAgICAgbGluZVsnZG9Ob3RDaGFuZ2UnXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgbGluZVsnY29sb3InXSA9IGNvbG9yO1xuICAgICAgICAgICAgICAgIC8vdGV4dCBsYWJlbCBuZXh0IHRvIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLm5leHQoKTtcbiAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLmNvbG9yUXVldWUoY29sb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA+IDEgKXtcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG4gICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPT0gMCkge1xuICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbG9yO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gY2xlYXJBc3NheUZvcm0oKTpKUXVlcnkge1xuICAgICAgICB2YXIgZm9ybTpKUXVlcnkgPSAkKCcjYXNzYXlNYWluJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWFzc2F5LV0nKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49YXNzYXktXScpLmZpbHRlcignOmNoZWNrYm94LCA6cmFkaW8nKS5wcm9wKCdzZWxlY3RlZCcsIGZhbHNlKTtcbiAgICAgICAgZm9ybS5maW5kKCcuY2FuY2VsLWxpbmsnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIHJldHVybiBmb3JtO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBFREREYXRhLlVzZXJzW3JlY29yZC5leHBlcmltZW50ZXJdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWFzc2F5X2lkXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LW5hbWVdJykudmFsKHJlY29yZC5uYW1lKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1wcm90b2NvbF0nKS52YWwocmVjb3JkLnBpZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzBdJykudmFsKHVzZXIgJiYgdXNlci51aWQgPyB1c2VyLnVpZCA6ICctLScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0QXNzYXkoaW5kZXg6bnVtYmVyKTp2b2lkIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgZm9ybTtcbiAgICAgICAgaWYgKCFyZWNvcmQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJbnZhbGlkIEFzc2F5IHJlY29yZCBmb3IgZWRpdGluZzogJyArIGluZGV4KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBmb3JtID0gJCgnI2Fzc2F5TWFpbicpO1xuICAgICAgICBjbGVhckFzc2F5Rm9ybSgpO1xuICAgICAgICBmaWxsQXNzYXlGb3JtKGZvcm0sIHJlY29yZCk7XG4gICAgICAgIGZvcm0ucmVtb3ZlQ2xhc3MoJ29mZicpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICB9XG59O1xuXG5cblxuY2xhc3MgRGF0YUdyaWRBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZFNwZWMpO1xuICAgIH1cblxuICAgIF9nZXRDbGFzc2VzKCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdkYXRhVGFibGUgc29ydGFibGUgZHJhZ2JveGVzIGhhc3RhYmxlY29udHJvbHMgdGFibGUtc3RyaXBlZCc7XG4gICAgfVxuXG4gICAgZ2V0Q3VzdG9tQ29udHJvbHNBcmVhKCk6SFRNTEVsZW1lbnQge1xuICAgICAgICByZXR1cm4gJCgnI3RhYmxlQ29udHJvbHNBcmVhJykuZ2V0KDApO1xuICAgIH1cbn1cblxuXG5cbi8vIEV4dGVuZGluZyB0aGUgc3RhbmRhcmQgQXNzYXlSZWNvcmQgdG8gaG9sZCBzb21lIGNsaWVudC1zaWRlIGNhbGN1bGF0aW9ucy5cbi8vIFRoZSBpZGVhIGlzLCB0aGVzZSBzdGFydCBvdXQgdW5kZWZpbmVkLCBhbmQgYXJlIGNhbGN1bGF0ZWQgb24tZGVtYW5kLlxuaW50ZXJmYWNlIEFzc2F5UmVjb3JkRXhlbmRlZCBleHRlbmRzIEFzc2F5UmVjb3JkIHtcbiAgICBtYXhYVmFsdWU6bnVtYmVyO1xufVxuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgQXNzYXlzIHRhYmxlKHMpXG5jbGFzcyBEYXRhR3JpZFNwZWNBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIG1ldGFEYXRhSURzVXNlZEluQXNzYXlzOmFueTtcbiAgICBtYXhpbXVtWFZhbHVlSW5EYXRhOm51bWJlcjtcblxuICAgIG1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG5cbiAgICBncmFwaE9iamVjdDphbnk7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5ncmFwaE9iamVjdCA9IG51bGw7XG4gICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjID0gbnVsbDtcbiAgICB9XG5cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIHRoaXMuZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCk7XG4gICAgICAgIHN1cGVyLmluaXQoKTtcbiAgICB9XG5cbiAgICAvLyBBbiBhcnJheSBvZiB1bmlxdWUgaWRlbnRpZmllcnMsIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHJlY29yZHMgaW4gdGhlIGRhdGEgc2V0IGJlaW5nIGRpc3BsYXllZFxuICAgIGdldFJlY29yZElEcygpOmFueVtdIHtcbiAgICAgICAgdmFyIGxyID0gU3R1ZHlEYXRhUGFnZS5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5sYXN0RmlsdGVyaW5nUmVzdWx0cztcbiAgICAgICAgaWYgKGxyKSB7XG4gICAgICAgICAgICByZXR1cm4gbHJbJ2ZpbHRlcmVkQXNzYXlzJ107XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgYW4gb3ZlcnJpZGUuICBDYWxsZWQgd2hlbiBhIGRhdGEgcmVzZXQgaXMgdHJpZ2dlcmVkLCBidXQgYmVmb3JlIHRoZSB0YWJsZSByb3dzIGFyZVxuICAgIC8vIHJlYnVpbHQuXG4gICAgb25EYXRhUmVzZXQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXG4gICAgICAgIHRoaXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTtcbiAgICAgICAgaWYgKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjICYmIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICQodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkuY2hpbGRyZW4oJzpmaXJzdCcpLnRleHQoXG4gICAgICAgICAgICAgICAgICAgICdNZWFzdXJpbmcgVGltZXMgKFJhbmdlIDAgdG8gJyArIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSArICcpJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlXG4gICAgLy8gY29udGVudCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgZ2V0VGFibGVFbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0dWR5QXNzYXlzVGFibGUnKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnYXNzYXlzJywge1xuICAgICAgICAgICAgJ2RlZmF1bHRTb3J0JzogMFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmaW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cyA9IFtdO1xuICAgICAgICB0aGlzLmdldFJlY29yZElEcygpLmZvckVhY2goKGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgJC5lYWNoKGFzc2F5Lm1ldGEgfHwge30sIChtZXRhSWQpID0+IHsgc2Vlbkhhc2hbbWV0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgW10ucHVzaC5hcHBseSh0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLCBPYmplY3Qua2V5cyhzZWVuSGFzaCkpO1xuICAgIH1cblxuICAgIGZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk6dm9pZCB7XG4gICAgICAgIHZhciBtYXhGb3JBbGw6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIHJlY29yZHNcbiAgICAgICAgbWF4Rm9yQWxsID0gdGhpcy5nZXRSZWNvcmRJRHMoKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXk6QXNzYXlSZWNvcmRFeGVuZGVkID0gPEFzc2F5UmVjb3JkRXhlbmRlZD5FREREYXRhLkFzc2F5c1thc3NheUlkXSwgbWVhc3VyZXMsIG1heEZvclJlY29yZDtcbiAgICAgICAgICAgIC8vIFNvbWUgY2FjaGluZyB0byBzcGVlZCBzdWJzZXF1ZW50IHJ1bnMgd2F5IHVwLi4uXG4gICAgICAgICAgICBpZiAoYXNzYXkubWF4WFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBtYXhGb3JSZWNvcmQgPSBhc3NheS5tYXhYVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW107XG4gICAgICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIG1lYXN1cmVzXG4gICAgICAgICAgICAgICAgbWF4Rm9yUmVjb3JkID0gbWVhc3VyZXMucmVkdWNlKChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb29rdXA6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmU6YW55ID0gbG9va3VwW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlO1xuICAgICAgICAgICAgICAgICAgICAvLyByZWR1Y2UgdG8gZmluZCBoaWdoZXN0IHZhbHVlIGFjcm9zcyBhbGwgZGF0YSBpbiBtZWFzdXJlbWVudFxuICAgICAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlID0gKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBwb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHBvaW50WzBdWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JNZWFzdXJlKTtcbiAgICAgICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgICAgICBhc3NheS5tYXhYVmFsdWUgPSBtYXhGb3JSZWNvcmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgbWF4Rm9yUmVjb3JkKTtcbiAgICAgICAgfSwgMCk7XG4gICAgICAgIC8vIEFueXRoaW5nIGFib3ZlIDAgaXMgYWNjZXB0YWJsZSwgYnV0IDAgd2lsbCBkZWZhdWx0IGluc3RlYWQgdG8gMS5cbiAgICAgICAgdGhpcy5tYXhpbXVtWFZhbHVlSW5EYXRhID0gbWF4Rm9yQWxsIHx8IDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkQXNzYXlOYW1lKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gSW4gYW4gb2xkIHR5cGljYWwgRURERGF0YS5Bc3NheXMgcmVjb3JkIHRoaXMgc3RyaW5nIGlzIGN1cnJlbnRseSBwcmUtYXNzZW1ibGVkIGFuZCBzdG9yZWRcbiAgICAgICAgLy8gaW4gJ2ZuJy4gQnV0IHdlJ3JlIHBoYXNpbmcgdGhhdCBvdXQuIEV2ZW50dWFsbHkgdGhlIG5hbWUgd2lsbCBqdXN0IGJlIC5uYW1lLCB3aXRob3V0XG4gICAgICAgIC8vIGRlY29yYXRpb24uXG4gICAgICAgIHZhciBhc3NheSwgbGluZSwgcHJvdG9jb2xOYW1pbmc7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gYXNzYXkubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRMaW5lTmFtZShpbmRleDogYW55KTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGFzc2F5LCBsaW5lO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsaW5lLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkRXhwZXJpbWVudGVySW5pdGlhbHMoaW5kZXg6YW55KTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgaW5kZXggSUQgZXhpc3RzLCBlbnN1cmUgZXhwZXJpbWVudGVyIHVzZXIgSUQgZXhpc3RzLCB1cHBlcmNhc2UgaW5pdGlhbHMgb3IgP1xuICAgICAgICB2YXIgYXNzYXksIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgoZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1thc3NheS5leHBdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TW9kaWZpY2F0aW9uKGluZGV4OmFueSk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2Q7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiArIGluZGV4LCAnaEFzc2F5c01ldGFpZCcgKyBpZCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogbWRUeXBlLm5hbWUsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBsZWZ0IHNlY3Rpb24gb2YgdGhlIHRhYmxlIGhhcyBBc3NheSBOYW1lIGFuZCBMaW5lIChOYW1lKVxuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoQXNzYXlzTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdBc3NheSBOYW1lJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlOYW1lXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hBc3NheUxpbmVOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xpbmUnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICAvLyBPZmZzZXRzIGZvciB0aGUgcmlnaHQgc2lkZSBvZiB0aGUgdGFibGUgZGVwZW5kcyBvbiBzaXplIG9mIHRoZSBwcmVjZWRpbmcgc2VjdGlvbnNcbiAgICAgICAgdmFyIHJpZ2h0T2Zmc2V0ID0gbGVmdFNpZGUubGVuZ3RoICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aDtcbiAgICAgICAgdmFyIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoKytyaWdodE9mZnNldCwgJ2hBc3NheXNNTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdNZWFzdXJlbWVudCcsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDJcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygrK3JpZ2h0T2Zmc2V0LCAnaEFzc2F5c1VuaXRzJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1VuaXRzJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMlxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKCsrcmlnaHRPZmZzZXQsICdoQXNzYXlzQ291bnQnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ291bnQnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIFRoZSBtZWFzdXJlbWVudCB0aW1lcyBhcmUgcmVmZXJlbmNlZCBlbHNld2hlcmUsIHNvIGFyZSBzYXZlZCB0byB0aGUgb2JqZWN0XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyA9IG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoXG4gICAgICAgICAgICAgICAgKytyaWdodE9mZnNldCxcbiAgICAgICAgICAgICAgICAnaEFzc2F5c0NvdW50JyxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICduYW1lJzogJ01lYXN1cmluZyBUaW1lcycsXG4gICAgICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoKytyaWdodE9mZnNldCwgJ2hBc3NheXNFeHBlcmltZW50ZXInLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnRXhwZXJpbWVudGVyJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygrK3JpZ2h0T2Zmc2V0LCAnaEFzc2F5c01vZGlmaWVkJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRBc3NheU1vZGlmaWNhdGlvbixcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhSGVhZGVycywgcmlnaHRTaWRlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGkpID0+IHtcbiAgICAgICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpXTtcbiAgICAgICAgICAgIGlmIChyZWNvcmQgJiYgcmVjb3JkLm1ldGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkLm1ldGFbaWRdIHx8ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhlIGNvbHNwYW4gdmFsdWUgZm9yIGFsbCB0aGUgY2VsbHMgdGhhdCBhcmUgYXNzYXktbGV2ZWwgKG5vdCBtZWFzdXJlbWVudC1sZXZlbCkgaXMgYmFzZWQgb25cbiAgICAvLyB0aGUgbnVtYmVyIG9mIG1lYXN1cmVtZW50cyBmb3IgdGhlIHJlc3BlY3RpdmUgcmVjb3JkLiBTcGVjaWZpY2FsbHksIGl0J3MgdGhlIG51bWJlciBvZlxuICAgIC8vIG1ldGFib2xpdGUgYW5kIGdlbmVyYWwgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmUgYXJlIHRyYW5zY3JpcHRvbWljcyBtZWFzdXJlbWVudHMsIHBsdXMgMSBpZiB0aGVyZVxuICAgIC8vIGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50cywgYWxsIGFkZGVkIHRvZ2V0aGVyLiAgKE9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuKVxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCk6bnVtYmVyIHtcbiAgICAgICAgdmFyIHJlYyA9IEVERERhdGEuQXNzYXlzW2luZGV4XTtcbiAgICAgICAgdmFyIHY6bnVtYmVyID0gKChyZWMuZ2VuZXJhbCAgICAgICAgIHx8IFtdKS5sZW5ndGggK1xuICAgICAgICAgICAgICAgICAgICAgICAgKHJlYy5tZXRhYm9saXRlcyAgICAgfHwgW10pLmxlbmd0aCArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID8gMSA6IDApICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgocmVjLnByb3RlaW5zICAgICAgIHx8IFtdKS5sZW5ndGggPyAxIDogMCkgICApIHx8IDE7XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIGdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGxpbmUgPSBFREREYXRhLkxpbmVzW3JlY29yZC5saWRdO1xuICAgICAgICB2YXIgc2lkZU1lbnVJdGVtcyA9IFtcbiAgICAgICAgICAgICc8YSBjbGFzcz1cImFzc2F5LWVkaXQtbGlua1wiIG9uY2xpY2s9XCJTdHVkeURhdGFQYWdlLmVkaXRBc3NheShbJyArIGluZGV4ICsgJ10pXCI+RWRpdCBBc3NheTwvYT4nLFxuICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2Fzc2F5SWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIENTVjwvYT4nXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gU2V0IHVwIGpRdWVyeSBtb2RhbHNcbiAgICAgICAgJChcIiNhc3NheU1haW5cIikuZGlhbG9nKHsgbWluV2lkdGg6IDUwMCwgYXV0b09wZW46IGZhbHNlIH0pO1xuXG4gICAgICAgIC8vIFRPRE8gd2UgcHJvYmFibHkgZG9uJ3Qgd2FudCB0byBzcGVjaWFsLWNhc2UgbGlrZSB0aGlzIGJ5IG5hbWVcbiAgICAgICAgaWYgKEVERERhdGEuUHJvdG9jb2xzW3JlY29yZC5waWRdLm5hbWUgPT0gXCJUcmFuc2NyaXB0b21pY3NcIikge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcy5wdXNoKCc8YSBocmVmPVwiaW1wb3J0L3JuYXNlcS9lZGdlcHJvP2Fzc2F5PScraW5kZXgrJ1wiPkltcG9ydCBSTkEtc2VxIGRhdGEgZnJvbSBFREdFLXBybzwvYT4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdhc3NheUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdhc3NheScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IHNpZGVNZW51SXRlbXMsXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogcmVjb3JkLm5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKGdyaWRTcGVjOiBEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OiBzdHJpbmcpOiBEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBsaW5lID0gRURERGF0YS5MaW5lc1tyZWNvcmQubGlkXTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBsaW5lLm5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbnRlbnRTdHIgPSAnJywgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5ICYmIHR5cGUgJiYgYXNzYXkubWV0YSAmJiAoY29udGVudFN0ciA9IGFzc2F5Lm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyxcbiAgICAgICAgICAgIG9wdDphbnkpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGNlbGxzID0gW10sXG4gICAgICAgICAgICBmYWN0b3J5ID0gKCk6RGF0YUdyaWREYXRhQ2VsbCA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgpO1xuXG4gICAgICAgIGlmICgocmVjb3JkLm1ldGFib2xpdGVzIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICB7ICdyb3dzcGFuJzogcmVjb3JkLm1ldGFib2xpdGVzLmxlbmd0aCB9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgSURzIHRvIG1lYXN1cmVtZW50cywgc29ydCBieSBuYW1lLCB0aGVuIGNvbnZlcnQgdG8gY2VsbCBvYmplY3RzXG4gICAgICAgICAgICAgICAgY2VsbHMgPSByZWNvcmQubWV0YWJvbGl0ZXMubWFwKG9wdC5tZXRhYm9saXRlVG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zb3J0KG9wdC5tZXRhYm9saXRlVmFsdWVTb3J0KVxuICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChvcHQubWV0YWJvbGl0ZVZhbHVlVG9DZWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoKHJlY29yZC5nZW5lcmFsIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIHsgJ3Jvd3NwYW4nOiByZWNvcmQuZ2VuZXJhbC5sZW5ndGggfSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IElEcyB0byBtZWFzdXJlbWVudHMsIHNvcnQgYnkgbmFtZSwgdGhlbiBjb252ZXJ0IHRvIGNlbGwgb2JqZWN0c1xuICAgICAgICAgICAgICAgIGNlbGxzID0gcmVjb3JkLmdlbmVyYWwubWFwKG9wdC5tZXRhYm9saXRlVG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQob3B0Lm1ldGFib2xpdGVWYWx1ZVNvcnQpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAob3B0Lm1ldGFib2xpdGVWYWx1ZVRvQ2VsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgb25seSBvbmUgY2VsbCBpZiB0aGVyZSBpcyBhbnkgdHJhbnNjcmlwdG9taWNzIGRhdGFcbiAgICAgICAgaWYgKChyZWNvcmQudHJhbnNjcmlwdGlvbnMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC50cmFuc2NyaXB0VG9DZWxsKHJlY29yZC50cmFuc2NyaXB0aW9ucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIG9ubHkgb25lIGNlbGwgaWYgdGhlcmUgaXMgYW55IHByb3Rlb21pY3MgZGF0YVxuICAgICAgICBpZiAoKHJlY29yZC5wcm90ZWlucyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LnByb3RlaW5Ub0NlbGwocmVjb3JkLnByb3RlaW5zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgYSBsb2FkaW5nIGNlbGwgaWYgbm9uZSBjcmVhdGVkIGJ5IG1lYXN1cmVtZW50c1xuICAgICAgICBpZiAoIWNlbGxzLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKHJlY29yZC5jb3VudCkge1xuICAgICAgICAgICAgICAgIC8vIHdlIGhhdmUgYSBjb3VudCwgYnV0IG5vIGRhdGEgeWV0OyBzdGlsbCBsb2FkaW5nXG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmVtcHR5KSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQuZW1wdHkuY2FsbCh7fSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKGZhY3RvcnkoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNlbGxzO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgdmFsdWUuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdtZWFzdXJlbWVudElkJyxcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKCkgPT4geyByZXR1cm4gJ21lYXN1cmVtZW50JyArIHZhbHVlLmlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHZhbHVlLm5hbWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdUcmFuc2NyaXB0b21pY3MgRGF0YSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdQcm90ZW9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJlbXB0eVwiOiAoKSA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICc8aT5ObyBNZWFzdXJlbWVudHM8L2k+J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVVbml0c0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHVuaXQ6YW55ID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ3VuaXQnOiB1bml0Lm5hbWUgfHwgJycgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdmFsdWUudW5pdFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1JQS00nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnJyAvLyBUT0RPOiB3aGF0IGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50IHVuaXRzP1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUNvdW50Q2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIC8vIGZ1bmN0aW9uIHRvIHVzZSBpbiBBcnJheSNyZWR1Y2UgdG8gY291bnQgYWxsIHRoZSB2YWx1ZXMgaW4gYSBzZXQgb2YgbWVhc3VyZW1lbnRzXG4gICAgICAgIHZhciByZWR1Y2VDb3VudCA9IChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICByZXR1cm4gcHJldiArIChtZWFzdXJlLnZhbHVlcyB8fCBbXSkubGVuZ3RoO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgKHZhbHVlLm1lYXN1cmUudmFsdWVzIHx8IFtdKS5sZW5ndGgsICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsIGlkcy5yZWR1Y2UocmVkdWNlQ291bnQsIDApLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCBpZHMucmVkdWNlKHJlZHVjZUNvdW50LCAwKSwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBzdmdDZWxsRm9yVGltZUNvdW50cyA9IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY29uc29saWRhdGVkLCBzdmcgPSAnJywgdGltZUNvdW50ID0ge307XG4gICAgICAgICAgICAgICAgLy8gY291bnQgdmFsdWVzIGF0IGVhY2ggeCBmb3IgYWxsIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgICAgIGlkcy5mb3JFYWNoKChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzOm51bWJlcltdW11bXSA9IG1lYXN1cmUudmFsdWVzIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICBwb2ludHMuZm9yRWFjaCgocG9pbnQ6bnVtYmVyW11bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGltZUNvdW50W3BvaW50WzBdWzBdXSA9IHRpbWVDb3VudFtwb2ludFswXVswXV0gfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFR5cGVzY3JpcHQgY29tcGlsZXIgZG9lcyBub3QgbGlrZSB1c2luZyBpbmNyZW1lbnQgb3BlcmF0b3Igb24gZXhwcmVzc2lvblxuICAgICAgICAgICAgICAgICAgICAgICAgKyt0aW1lQ291bnRbcG9pbnRbMF1bMF1dO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBtYXAgdGhlIGNvdW50cyB0byBbeCwgeV0gdHVwbGVzXG4gICAgICAgICAgICAgICAgY29uc29saWRhdGVkID0gJC5tYXAodGltZUNvdW50LCAodmFsdWUsIGtleSkgPT4gW1sgW3BhcnNlRmxvYXQoa2V5KV0sIFt2YWx1ZV0gXV0pO1xuICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIFNWRyBzdHJpbmdcbiAgICAgICAgICAgICAgICBpZiAoY29uc29saWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdmcgPSBncmlkU3BlYy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMoY29uc29saWRhdGVkLCAnJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlID0gdmFsdWUubWVhc3VyZSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0ID0gbWVhc3VyZS5mb3JtYXQgPT09IDEgPyAnY2FyYm9uJyA6ICcnLFxuICAgICAgICAgICAgICAgICAgICBwb2ludHMgPSB2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKHBvaW50cywgZm9ybWF0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiBzdmdDZWxsRm9yVGltZUNvdW50cyxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHNcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGV4cCA9IEVERERhdGEuQXNzYXlzW2luZGV4XS5leHA7XG4gICAgICAgIHZhciB1UmVjb3JkID0gRURERGF0YS5Vc2Vyc1tleHBdO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHVSZWNvcmQgPyB1UmVjb3JkLmluaXRpYWxzIDogJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2QpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhwb2ludHMsIGZvcm1hdDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzdmcgPSAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmVyc2lvbj1cIjEuMlwiIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwcHhcIlxcXG4gICAgICAgICAgICAgICAgICAgIHZpZXdCb3g9XCIwIDAgNDcwIDEwXCIgcHJlc2VydmVBc3BlY3RSYXRpbz1cIm5vbmVcIj5cXFxuICAgICAgICAgICAgICAgIDxzdHlsZSB0eXBlPVwidGV4dC9jc3NcIj48IVtDREFUQVtcXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNQIHsgc3Ryb2tlOnJnYmEoMCwwLDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jViB7IHN0cm9rZTpyZ2JhKDAsMCwyMzAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jRSB7IHN0cm9rZTpyZ2JhKDI1NSwxMjgsMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICBdXT48L3N0eWxlPlxcXG4gICAgICAgICAgICAgICAgPHBhdGggZmlsbD1cInJnYmEoMCwwLDAsMC4wLjA1KVwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZT1cInJnYmEoMCwwLDAsMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBkPVwiTTEwLDVoNDUwXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9XCJzdHJva2Utd2lkdGg6MnB4O1wiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZS13aWR0aD1cIjJcIj48L3BhdGg+JztcbiAgICAgICAgdmFyIHBhdGhzID0gWyBzdmcgXTtcbiAgICAgICAgcG9pbnRzLnNvcnQoKGEsYikgPT4geyByZXR1cm4gYVswXSAtIGJbMF07IH0pLmZvckVhY2goKHBvaW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgeCA9IHBvaW50WzBdWzBdLFxuICAgICAgICAgICAgICAgIHkgPSBwb2ludFsxXVswXSxcbiAgICAgICAgICAgICAgICByeCA9ICgoeCAvIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSkgKiA0NTApICsgMTAsXG4gICAgICAgICAgICAgICAgdHQgPSBbeSwgJyBhdCAnLCB4LCAnaCddLmpvaW4oJycpO1xuICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY0VcIiBkPVwiTScsIHJ4LCAnLDV2NFwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICBpZiAoeSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJywydjZcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNQXCIgZD1cIk0nLCByeCwgJywxdjRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKGZvcm1hdCA9PT0gJ2NhcmJvbicpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjVlwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcGF0aHMucHVzaCgnPC9zdmc+Jyk7XG4gICAgICAgIHJldHVybiBwYXRocy5qb2luKCdcXG4nKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgbWV0YURhdGFDb2xzOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgcmlnaHRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgY291bnRlcjpudW1iZXIgPSAwO1xuXG4gICAgICAgIGxlZnRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZUxpbmVOYW1lQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcblxuICAgICAgICByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlVW5pdHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZUNvdW50Q2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUNvbHMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cbiAgICBkZWZpbmVDb2x1bW5Hcm91cFNwZWMoKTpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdIHtcbiAgICAgICAgdmFyIHRvcFNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xpbmUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdmFyIG1ldGFEYXRhQ29sR3JvdXBzOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgICAgIG1ldGFEYXRhQ29sR3JvdXBzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKG1kVHlwZS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGJvdHRvbVNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyZW1lbnQnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdVbml0cycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NvdW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyaW5nIFRpbWVzJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRXhwZXJpbWVudGVyJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFzdCBNb2RpZmllZCcsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gdG9wU2VjdGlvbi5jb25jYXQobWV0YURhdGFDb2xHcm91cHMsIGJvdHRvbVNlY3Rpb24pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQSBcInNlbGVjdCBhbGwgLyBzZWxlY3Qgbm9uZVwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsQXNzYXlzTWVhc3VyZW1lbnRzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcbiAgICAgICAgdmFyIGRpc2FibGVkQXNzYXlzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRBc3NheXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB2YXIgZW1wdHlBc3NheXNXaWRnZXQgPSBuZXcgREdFbXB0eUFzc2F5c1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkQXNzYXlzV2lkZ2V0KTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZW1wdHlBc3NheXNXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkQXNzYXlzKTp2b2lkIHtcblxuICAgICAgICAvLyBXaXJlIHVwIHRoZSAnYWN0aW9uIHBhbmVscycgZm9yIHRoZSBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgJCh0YWJsZSkub24oJ2NoYW5nZScsICc6Y2hlY2tib3gnLCAoKSA9PiBTdHVkeURhdGFQYWdlLnF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCkpO1xuXG4gICAgICAgIC8vIFJ1biBpdCBvbmNlIGluIGNhc2UgdGhlIHBhZ2Ugd2FzIGdlbmVyYXRlZCB3aXRoIGNoZWNrZWQgQXNzYXlzXG4gICAgICAgIFN0dWR5RGF0YVBhZ2UucXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICB9XG59XG5cblxuLy8gQSBzbGlnaHRseSBtb2RpZmllZCBcIlNlbGVjdCBBbGxcIiBoZWFkZXIgd2lkZ2V0XG4vLyB0aGF0IHRyaWdnZXJzIGEgcmVmcmVzaCBvZiB0aGUgYWN0aW9ucyBwYW5lbCB3aGVuIGl0IGNoYW5nZXMgdGhlIGNoZWNrYm94IHN0YXRlLlxuY2xhc3MgREdTZWxlY3RBbGxBc3NheXNNZWFzdXJlbWVudHNXaWRnZXQgZXh0ZW5kcyBER1NlbGVjdEFsbFdpZGdldCB7XG5cbiAgICBjbGlja0hhbmRsZXIoKTp2b2lkIHtcbiAgICAgICAgc3VwZXIuY2xpY2tIYW5kbGVyKCk7XG4gICAgICAgIFN0dWR5RGF0YVBhZ2UucXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICAgfVxufVxuXG5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgQXNzYXlzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRBc3NheXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICAvLyBSZXR1cm4gYSBmcmFnbWVudCB0byB1c2UgaW4gZ2VuZXJhdGluZyBvcHRpb24gd2lkZ2V0IElEc1xuICAgIGdldElERnJhZ21lbnQodW5pcXVlSUQpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnVGFibGVTaG93REFzc2F5c0NCJztcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gdGV4dCB1c2VkIHRvIGxhYmVsIHRoZSB3aWRnZXRcbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3cgRGlzYWJsZWQnO1xuICAgIH1cblxuICAgIGdldExhYmVsVGl0bGUoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJTaG93IGFzc2F5cyB0aGF0IGhhdmUgYmVlbiBkaXNhYmxlZC5cIjtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyb2wgc2hvdWxkIGJlIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgIGlzRW5hYmxlZEJ5RGVmYXVsdCgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gISEoJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgYWN0aXZhdGlvbiBvZiB3aWRnZXRcbiAgICBvbldpZGdldENoYW5nZShlKTp2b2lkIHtcbiAgICAgICAgdmFyIGFtSUNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICB2YXIgaXNPdGhlckNoZWNrZWQ6Ym9vbGVhbiA9ICQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94JykucHJvcCgnY2hlY2tlZCcsIGFtSUNoZWNrZWQpO1xuICAgICAgICBpZiAoYW1JQ2hlY2tlZCAhPSBpc090aGVyQ2hlY2tlZCkge1xuICAgICAgICAgICAgU3R1ZHlEYXRhUGFnZS5xdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBkb24ndCBjYWxsIHRoZSBzdXBlcmNsYXNzIHZlcnNpb24gb2YgdGhpcyBmdW5jdGlvbiBiZWNhdXNlIHdlIGRvbid0XG4gICAgICAgIC8vIHdhbnQgdG8gdHJpZ2dlciBhIGNhbGwgdG8gYXJyYW5nZVRhYmxlRGF0YVJvd3MganVzdCB5ZXQuXG4gICAgICAgIC8vIFRoZSBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUgZnVuY3Rpb24gd2lsbCBkbyBpdCBmb3IgdXMsIGFmdGVyXG4gICAgICAgIC8vIHJlYnVpbGRpbmcgdGhlIGZpbHRlcmluZyBzZWN0aW9uLlxuICAgIH1cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIGNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkICYmIHJvd0lEcyAmJiBFREREYXRhLmN1cnJlbnRTdHVkeVdyaXRhYmxlKSB7XG4gICAgICAgICAgICAkKFwiI2VuYWJsZUJ1dHRvblwiKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKFwiI2VuYWJsZUJ1dHRvblwiKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRpc2FibGVkUm93cyA9ICQoJy5kaXNhYmxlZFJlY29yZCcpO1xuXG4gICAgICAgIHZhciBjaGVja2VkRGlzYWJsZWRSb3dzID0gMDtcbiAgICAgICAgXy5lYWNoKGRpc2FibGVkUm93cywgZnVuY3Rpb24ocm93KSB7XG4gICAgICAgICAgICBpZiAoJChyb3cpLmZpbmQoJ2lucHV0JykucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgY2hlY2tlZERpc2FibGVkUm93cysrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY2hlY2tlZERpc2FibGVkUm93cyA+IDApIHtcbiAgICAgICAgICAgICQoJyNlbmFibGVCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIGZhbHNlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoJyNlbmFibGVCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkKSB7IHJldHVybiByb3dJRHM7IH1cbiAgICAgICAgcmV0dXJuIHJvd0lEcy5maWx0ZXIoKGlkOnN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuICEhKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOnN0cmluZyk6YW55IHtcbiAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbcm93SURdO1xuICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSkge1xuICAgICAgICAgICAgJC5lYWNoKGRhdGFSb3dPYmplY3RzLCAoeCwgcm93KSA9PiAkKHJvdy5nZXRFbGVtZW50KCkpLmFkZENsYXNzKCdkaXNhYmxlZFJlY29yZCcpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIEFzc2F5cyB0aGF0IGhhdmUgbm8gbWVhc3VyZW1lbnQgZGF0YS5cbmNsYXNzIERHRW1wdHlBc3NheXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICAvLyBSZXR1cm4gYSBmcmFnbWVudCB0byB1c2UgaW4gZ2VuZXJhdGluZyBvcHRpb24gd2lkZ2V0IElEc1xuICAgIGdldElERnJhZ21lbnQodW5pcXVlSUQpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnVGFibGVTaG93RUFzc2F5c0NCJztcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gdGV4dCB1c2VkIHRvIGxhYmVsIHRoZSB3aWRnZXRcbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3cgRW1wdHknO1xuICAgIH1cblxuICAgIGdldExhYmVsVGl0bGUoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJTaG93IGFzc2F5cyB0aGF0IGRvbid0IGhhdmUgYW55IG1lYXN1cmVtZW50cyBpbiB0aGVtLlwiO1xuICAgIH1cblxuICAgIC8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgY29udHJvbCBzaG91bGQgYmUgZW5hYmxlZCBieSBkZWZhdWx0XG4gICAgaXNFbmFibGVkQnlEZWZhdWx0KCk6Ym9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhISgkKCcjZmlsdGVyaW5nU2hvd0VtcHR5Q2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJykpO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBhY3RpdmF0aW9uIG9mIHdpZGdldFxuICAgIG9uV2lkZ2V0Q2hhbmdlKGUpOnZvaWQge1xuICAgICAgICB2YXIgYW1JQ2hlY2tlZDpib29sZWFuID0gISEodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCk7XG4gICAgICAgIHZhciBpc090aGVyQ2hlY2tlZDpib29sZWFuID0gISEoJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICAgICAgJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcsIGFtSUNoZWNrZWQpO1xuICAgICAgICBpZiAoYW1JQ2hlY2tlZCAhPSBpc090aGVyQ2hlY2tlZCkge1xuICAgICAgICAgICAgU3R1ZHlEYXRhUGFnZS5xdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBkb24ndCBjYWxsIHRoZSBzdXBlcmNsYXNzIHZlcnNpb24gb2YgdGhpcyBmdW5jdGlvbiBiZWNhdXNlIHdlIGRvbid0XG4gICAgICAgIC8vIHdhbnQgdG8gdHJpZ2dlciBhIGNhbGwgdG8gYXJyYW5nZVRhYmxlRGF0YVJvd3MganVzdCB5ZXQuXG4gICAgICAgIC8vIFRoZSBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUgZnVuY3Rpb24gd2lsbCBkbyBpdCBmb3IgdXMsIGFmdGVyXG4gICAgICAgIC8vIHJlYnVpbGRpbmcgdGhlIGZpbHRlcmluZyBzZWN0aW9uLlxuICAgIH1cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIGNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkKSB7IHJldHVybiByb3dJRHM7IH1cbiAgICAgICAgcmV0dXJuIHJvd0lEcy5maWx0ZXIoKGlkOnN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuICEhKEVERERhdGEuQXNzYXlzW2lkXS5jb3VudCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOmFueSwgcm93SUQ6c3RyaW5nKTphbnkge1xuICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tyb3dJRF07XG4gICAgICAgIGlmICghYXNzYXkuY291bnQpIHtcbiAgICAgICAgICAgICQuZWFjaChkYXRhUm93T2JqZWN0cywgKHgsIHJvdykgPT4gJChyb3cuZ2V0RWxlbWVudCgpKS5hZGRDbGFzcygnZW1wdHlSZWNvcmQnKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoKCkgPT4gU3R1ZHlEYXRhUGFnZS5wcmVwYXJlSXQoKSk7XG4iXX0=