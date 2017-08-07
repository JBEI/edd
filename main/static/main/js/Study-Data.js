// File last modified on: Mon Aug 07 2017 13:05:43  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="EDDGraphingTools.ts" />
/// <reference path="../typings/d3/d3.d.ts"/>
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            var _this = _super.call(this) || this;
            var MDT = EDDData.MetaDataTypes[metaDataID];
            _this.metaDataID = metaDataID;
            _this.pre = MDT.pre || '';
            _this.post = MDT.post || '';
            return _this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            return _super !== null && _super.apply(this, arguments) || this;
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
            updateGraphViewFlag({ 'buttonElem': "#dataTableButton", 'type': viewingMode,
                'study_id': EDDData.currentStudyID });
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
            if (barGraphMode === 'measurement') {
                updateGraphViewFlag({ 'buttonElem': '#measurementBarGraphButton', 'type': barGraphMode,
                    'study_id': EDDData.currentStudyID });
            }
            $('#mainFilterSection').appendTo('#content');
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
            if (data.type === 'linegraph' || data.type === 'table') {
                $(data.buttonElem).click();
            }
            else if (typeof (data.type) === 'undefined') {
                return;
            }
            else if (data.type === 'measurement') {
                $("#barGraphButton").click();
            }
            else {
                barGraphMode = data.type;
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
            case 13:// return
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
            // TODO not all measurements downloaded; display a message indicating this
            // explain downloading individual assay measurements too
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
            // If the filtering widget hasn't changed and the current mode doesn't claim to be stale, we're done.
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
        return _super.call(this, dataGridSpec) || this;
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
        var _this = _super.call(this) || this;
        _this.graphObject = null;
        _this.measuringTimesHeaderSpec = null;
        return _this;
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
        return _super !== null && _super.apply(this, arguments) || this;
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
        return _super !== null && _super.apply(this, arguments) || this;
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
        return _super !== null && _super.apply(this, arguments) || this;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktRGF0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlN0dWR5LURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0RBQW9EO0FBQ3BELHFEQUFxRDtBQUNyRCwrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLG9DQUFvQztBQUNwQyw0Q0FBNEM7QUFDNUMsNkNBQTZDOzs7Ozs7Ozs7OztBQUs3QyxJQUFVLGFBQWEsQ0E2NEV0QjtBQTc0RUQsV0FBVSxhQUFhO0lBQ25CLFlBQVksQ0FBQztJQUViLElBQUksV0FBVyxDQUFDLENBQUksK0NBQStDO0lBQ25FLElBQUksa0JBQXlDLENBQUM7SUFDOUMsSUFBSSxZQUFZLENBQUMsQ0FBSSx5Q0FBeUM7SUFDOUQsSUFBSSxxQkFBNEIsQ0FBQztJQUdqQyxJQUFJLG1CQUF5QixDQUFDO0lBQzlCLElBQUkseUJBQStCLENBQUM7SUFFcEMsSUFBSSx1QkFBMkIsQ0FBQztJQUNoQyxJQUFJLHdCQUFnQyxDQUFDO0lBQ3JDLElBQUksNkJBQWlDLENBQUM7SUFFdEMsSUFBSSx3QkFBd0IsR0FBRyxDQUFDLENBQUM7SUFFakMsSUFBSSxRQUFZLENBQUM7SUFFakIsbUVBQW1FO0lBQ25FLElBQUksa0JBQWtCLENBQUM7SUFrQ3ZCLDhDQUE4QztJQUM5QztRQXlCSSw2REFBNkQ7UUFDN0Q7WUFFSSxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQztZQUM3QixJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQztZQUUxQixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQztZQUNuQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQzdCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7WUFDaEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFDMUIsSUFBSSxDQUFDLG9CQUFvQixHQUFHO2dCQUN4QixlQUFlLEVBQUUsRUFBRTtnQkFDbkIsYUFBYSxFQUFFLEVBQUU7Z0JBQ2pCLFVBQVUsRUFBRSxFQUFFO2dCQUNkLE9BQU8sRUFBRSxFQUFFO2dCQUNYLGNBQWMsRUFBRSxFQUFFO2FBQ3JCLENBQUM7WUFDRixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO1FBQ3JDLENBQUM7UUFFRCxvR0FBb0c7UUFDcEcsMEZBQTBGO1FBQzFGLHNFQUFzRTtRQUN0RSw4R0FBOEc7UUFDOUcsZ0JBQWdCO1FBQ2hCLGdGQUFnRjtRQUNoRiw0REFBdUIsR0FBdkI7WUFFSSxJQUFJLGVBQWUsR0FBc0IsRUFBRSxDQUFDO1lBQzVDLElBQUksZ0JBQWdCLEdBQXNCLEVBQUUsQ0FBQztZQUU3QyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDeEQsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUVuRCxtREFBbUQ7WUFDbkQsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFVBQUMsT0FBZSxFQUFFLEtBQVU7Z0JBQy9DLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7b0JBQUMsTUFBTSxDQUFDO2dCQUNsQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRSxFQUFFLFVBQUMsVUFBVSxJQUFPLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuRixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxFQUFFLFVBQUMsVUFBVSxJQUFPLGVBQWUsQ0FBQyxVQUFVLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyRixDQUFDLENBQUMsQ0FBQztZQUVILGlDQUFpQztZQUNqQyw0RUFBNEU7WUFDNUUsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxxQkFBcUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXO1lBQzNELFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQ0FBb0M7WUFDbEYsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU87WUFDdkQsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUF5QixFQUFFLENBQUMsQ0FBQztZQUNuRCxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksMkJBQTJCLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRO1lBQ3JELHNGQUFzRjtZQUN0RixZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQ2hDLENBQUMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsVUFBQyxDQUFDLEVBQUUsRUFBVSxJQUFLLE9BQUEsSUFBSSwwQkFBMEIsQ0FBQyxFQUFFLENBQUMsRUFBbEMsQ0FBa0MsQ0FBQyxDQUFDLENBQUM7WUFDcEYsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUNoQyxDQUFDLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxVQUFDLENBQUMsRUFBRSxFQUFVLElBQUssT0FBQSxJQUFJLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxFQUFqQyxDQUFpQyxDQUFDLENBQUMsQ0FBQztZQUVsRixJQUFJLENBQUMsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxrQ0FBa0MsRUFBRSxDQUFDLENBQUM7WUFDdEUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztZQUUzRCxJQUFJLENBQUMsY0FBYyxHQUFHLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLG9CQUFvQixFQUFFLENBQUMsQ0FBQztZQUVyRCxJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztZQUUvQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSwrQkFBK0IsRUFBRSxDQUFDLENBQUM7WUFFcEUsMkVBQTJFO1lBQzNFLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FDdkIsWUFBWSxFQUNaLElBQUksQ0FBQyxpQkFBaUIsRUFDdEIsSUFBSSxDQUFDLGNBQWMsRUFDbkIsSUFBSSxDQUFDLFdBQVcsRUFDaEIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsVUFBQyxPQUFPLElBQUssT0FBQSxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQW5CLENBQW1CLENBQUMsQ0FBQztZQUUxRCxzRUFBc0U7WUFDdEUsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7WUFDakMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDN0IsQ0FBQztRQUVELCtFQUErRTtRQUMvRSx3QkFBd0I7UUFDeEIsc0RBQWlCLEdBQWpCO1lBQUEsaUJBVUM7WUFURyxJQUFJLElBQUksR0FBVyxLQUFLLENBQUM7WUFDekIsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQUMsQ0FBQyxFQUFFLE1BQU07Z0JBQzlCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQzFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxQyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ0osTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNwQixDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBRUQsNkVBQTZFO1FBQzdFLDhFQUE4RTtRQUM5RSwwRUFBMEU7UUFDMUUsd0ZBQXdGO1FBQ3hGLHNFQUFpQyxHQUFqQyxVQUFrQyxRQUFRLEVBQUUsS0FBSztZQUFqRCxpQkF3QkM7WUF0QkcsbUZBQW1GO1lBQ25GLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUUsRUFBRSxVQUFDLEtBQUssRUFBRSxXQUFXO2dCQUN0QyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDO2dCQUMzRCx1REFBdUQ7Z0JBQ3ZELEVBQUUsQ0FBQyxDQUFDLEtBQUksQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFBQyxNQUFNLENBQUM7Z0JBQUMsQ0FBQztnQkFDMUUsS0FBSSxDQUFDLG9CQUFvQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUNqRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQUMsTUFBTSxDQUFBO2dCQUFDLENBQUM7Z0JBQUEsQ0FBQztnQkFDdkIsSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNoQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUFDLE1BQU0sQ0FBQTtnQkFBQyxDQUFDO2dCQUFBLENBQUM7Z0JBQ3RDLEtBQUssR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDdEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUN2QixLQUFJLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2pFLENBQUM7Z0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDOUIsS0FBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM5RCxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLEtBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0QsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSiwwQ0FBMEM7b0JBQzFDLEtBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDbEUsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBSSxxREFBcUQ7UUFDekYsQ0FBQztRQUdELHlEQUFvQixHQUFwQjtZQUNJLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzdCLENBQUM7UUFHRCwwREFBcUIsR0FBckI7WUFDSSxJQUFJLGdCQUFnQixHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM5QyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxVQUFDLE1BQU07Z0JBQzdCLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUNyRCxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0IsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBRUQsaUVBQTRCLEdBQTVCO1lBRUksSUFBSSxjQUFzQyxDQUFDO1lBQzNDLElBQUksT0FBeUUsQ0FBQztZQUU5RSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDO1lBQ2hELElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUM7WUFDN0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQztZQUMxQyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDO1lBRW5ELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7Z0JBRXhCLGNBQWMsR0FBRyxVQUFDLFNBQWdCO29CQUM5QixJQUFJLE9BQU8sR0FBUSxPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ3hELEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFBQyxNQUFNLENBQUMsS0FBSyxDQUFDO29CQUFDLENBQUM7b0JBQy9CLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUMxQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7d0JBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztvQkFBQyxDQUFDO29CQUM3QixNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7Z0JBQzFCLENBQUMsQ0FBQztnQkFFRixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDN0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQzdCLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUM3QixHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNyQyxDQUFDO1lBRUQsSUFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQztZQUNuQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQzdCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7WUFFaEMsT0FBTyxHQUFHLFVBQUMsR0FBYSxFQUFFLENBQVMsRUFBRSxNQUE0QjtnQkFDN0QsTUFBTSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN4QyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDM0IsQ0FBQyxDQUFDO1lBRUYsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQztZQUN0QyxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7WUFDbkMsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNYLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM5QyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztZQUNoQyxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2IsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDdkQsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztZQUNuQyxDQUFDO1FBQ0wsQ0FBQztRQUVELGtEQUFrRDtRQUNsRCxvREFBZSxHQUFmO1lBQUEsaUJBVUM7WUFURyxJQUFJLFFBQVEsR0FBVSxFQUFFLENBQUM7WUFDekIsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFVBQUMsT0FBTyxFQUFFLEtBQUs7Z0JBQ2xDLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7b0JBQUMsTUFBTSxDQUFDO2dCQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFJLENBQUMsZUFBZSxDQUFDO29CQUFDLE1BQU0sQ0FBQztnQkFDbkQsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSSxDQUFDLFlBQVksQ0FBQztvQkFBQyxNQUFNLENBQUM7Z0JBQy9DLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0IsQ0FBQyxDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ3BCLENBQUM7UUFFRCx3RkFBd0Y7UUFDeEYsd0dBQXdHO1FBQ3hHLGlHQUFpRztRQUNqRywyRkFBMkY7UUFDM0YsNkZBQTZGO1FBQzdGLGlGQUFpRjtRQUNqRixvRUFBb0U7UUFDcEUsOERBQXlCLEdBQXpCO1lBRUksSUFBSSxpQkFBaUIsR0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUN4RixJQUFJLGNBQWMsR0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUVsRixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2RixJQUFJLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO2dCQUN6QyxJQUFJLENBQUMsWUFBWSxHQUFHLGNBQWMsQ0FBQztnQkFFbkMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDaEMsQ0FBQztZQUVELElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBRTlDLElBQUksZ0JBQWdCLEdBQXFCLEVBQUUsQ0FBQztZQUM1QyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztZQUVqRCxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsVUFBQyxDQUFDLEVBQUUsTUFBTTtnQkFDaEMsZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLHlCQUF5QixDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQ3RFLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO1lBQ2xFLENBQUMsQ0FBQyxDQUFDO1lBRUgsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztZQUV0RCxJQUFJLGNBQWMsR0FBVSxFQUFFLENBQUM7WUFDL0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxVQUFDLENBQUMsRUFBRSxPQUFPO2dCQUNoQyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2xELENBQUMsQ0FBQyxDQUFDO1lBRUgsZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsR0FBRyxjQUFjLENBQUM7WUFFckQsNEdBQTRHO1lBQzVHLHdFQUF3RTtZQUN4RSxvR0FBb0c7WUFFcEcsSUFBSSxzQkFBc0IsR0FBRyxjQUFjLENBQUM7WUFDNUMsSUFBSSxtQkFBbUIsR0FBRyxjQUFjLENBQUM7WUFDekMsSUFBSSxnQkFBZ0IsR0FBRyxjQUFjLENBQUM7WUFDdEMsSUFBSSxtQkFBbUIsR0FBRyxjQUFjLENBQUM7WUFFekMsd0ZBQXdGO1lBRXhGLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7Z0JBQzdCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLFVBQUMsQ0FBQyxFQUFFLE1BQU07b0JBQ3JDLHNCQUFzQixHQUFHLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUNsRixnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxzQkFBc0IsQ0FBQztnQkFDeEUsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztnQkFDMUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQUMsQ0FBQyxFQUFFLE1BQU07b0JBQ2xDLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO29CQUM1RSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxtQkFBbUIsQ0FBQztnQkFDckUsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxVQUFDLENBQUMsRUFBRSxNQUFNO29CQUMvQixnQkFBZ0IsR0FBRyxNQUFNLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztvQkFDdEUsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsZ0JBQWdCLENBQUM7Z0JBQ2xFLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLFVBQUMsQ0FBQyxFQUFFLE1BQU07b0JBQ3RDLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO29CQUM1RSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxtQkFBbUIsQ0FBQztnQkFDckUsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBRUQscUdBQXFHO1lBQ3JHLHlFQUF5RTtZQUV6RSw2R0FBNkc7WUFDN0csdUVBQXVFO1lBRXZFLDBEQUEwRDtZQUUxRCwyRUFBMkU7WUFDM0UsNkRBQTZEO1lBQzdELGtFQUFrRTtZQUNsRSxxR0FBcUc7WUFDckcscURBQXFEO1lBRXJELGlIQUFpSDtZQUNqSCwyREFBMkQ7WUFDM0Qsd0ZBQXdGO1lBQ3hGLHdHQUF3RztZQUN4Ryw2RkFBNkY7WUFDN0YsZ0ZBQWdGO1lBQ2hGLG1EQUFtRDtZQUVuRCxpSEFBaUg7WUFDakgscUZBQXFGO1lBQ3JGLHNDQUFzQztZQUV0QyxJQUFJLFVBQVUsR0FBRyxVQUFDLE1BQTRCLElBQWdCLE1BQU0sQ0FBQyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEcsSUFBSSxHQUFHLEdBQVUsRUFBRSxDQUFDLENBQUksdUNBQXVDO1lBQy9ELEVBQUUsQ0FBQyxDQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFBQyxDQUFDO1lBQzNGLEVBQUUsQ0FBQyxDQUFLLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQUMsQ0FBQztZQUN4RixFQUFFLENBQUMsQ0FBUSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDckYsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDeEYsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2IsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUMsR0FBRyxHQUFHLENBQUM7WUFDbkQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDLEdBQUcsY0FBYyxDQUFDO1lBQzlELENBQUM7WUFDRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsZ0JBQWdCLENBQUM7WUFDN0MsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1FBQzVCLENBQUM7UUFFRCx3RkFBd0Y7UUFDeEYsMkZBQTJGO1FBQzNGLFdBQVc7UUFDWCx3REFBbUIsR0FBbkIsVUFBb0IsS0FBZTtZQUMvQixJQUFJLE1BQU0sR0FBVyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQzdCLElBQUksaUJBQWlCLEdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDeEYsSUFBSSxjQUFjLEdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFFbEYseUVBQXlFO1lBQ3pFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7WUFBQyxDQUFDO1lBQ2pFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBQUMsQ0FBQztZQUUzRCxtRkFBbUY7WUFDbkYsdUZBQXVGO1lBQ3ZGLHdGQUF3RjtZQUN4RixxRkFBcUY7WUFDckYsNkNBQTZDO1lBQzdDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxVQUFDLENBQUMsRUFBRSxNQUFNO2dCQUM5QixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsd0NBQXdDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztnQkFBQyxDQUFDO1lBQzdFLENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQztRQUNsQixDQUFDO1FBQ0wsaUNBQUM7SUFBRCxDQUFDLEFBL1hELElBK1hDO0lBL1hZLHdDQUEwQiw2QkErWHRDLENBQUE7SUFFRCx1R0FBdUc7SUFDdkcsZ0RBQWdEO0lBQ2hELHdHQUF3RztJQUN4RyxpRUFBaUU7SUFDakUsdUdBQXVHO0lBQ3ZHLHVFQUF1RTtJQUN2RSxrR0FBa0c7SUFDbEcsMkZBQTJGO0lBQzNGLDhGQUE4RjtJQUM5Rix1REFBdUQ7SUFDdkQsbUVBQW1FO0lBQ25FO1FBaURJLHdGQUF3RjtRQUN4RixpRkFBaUY7UUFDakYsbUVBQW1FO1FBQ25FO1lBQ0ksSUFBSSxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxFQUFFLENBQUM7WUFFaEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFFckIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFDMUIsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsQ0FBSSx3QkFBd0I7WUFDbkQsSUFBSSxDQUFDLHNCQUFzQixHQUFHLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxDQUFDLENBQUM7WUFDakMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztRQUN0QyxDQUFDO1FBRUQsd0NBQVMsR0FBVCxVQUFVLEtBQThCLEVBQUUsVUFBdUI7WUFBdkQsc0JBQUEsRUFBQSx3QkFBOEI7WUFBRSwyQkFBQSxFQUFBLGlCQUF1QjtZQUM3RCxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQztZQUMxQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsVUFBVSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQ2xDLENBQUM7UUFFRCx3Q0FBd0M7UUFDeEMscURBQXNCLEdBQXRCO1lBQUEsaUJBbUNDO1lBbENHLElBQUksTUFBTSxHQUFXLFFBQVEsR0FBRyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsV0FBVyxFQUNoRSxJQUFzQixDQUFDO1lBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5RCxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDNUUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFbEcsQ0FBQyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2lCQUNwQyxJQUFJLENBQUM7Z0JBQ0YsSUFBSSxFQUFFLE1BQU07Z0JBQ1osTUFBTSxFQUFFLE1BQU07Z0JBQ2QsYUFBYSxFQUFFLElBQUksQ0FBQyxZQUFZO2dCQUNoQyxNQUFNLEVBQUUsRUFBRTthQUNiLENBQUMsQ0FBQztZQUNQLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsaUNBQWlDO1lBQ3BFLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLHVGQUF1RjtZQUN2RixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDOUQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXpHLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFJLCtDQUErQztZQUVwRyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsVUFBQyxFQUFFO2dCQUMzQix5RUFBeUU7Z0JBQ3pFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLFVBQVUsSUFBSSxFQUFFLEVBQUUsVUFBQyxFQUFVLEVBQUUsUUFBZ0I7b0JBQ3ZELFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNwQyxDQUFDLENBQUMsQ0FBQztnQkFDSCxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQ2pCLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEUsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDO2lCQUM3QixRQUFRLENBQUMsK0JBQStCLENBQUM7aUJBQ3pDLElBQUksQ0FBQyxFQUFFLGFBQWEsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxDQUFDO2lCQUM1QyxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFxQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBRUQsd0ZBQXdGO1FBQ3hGLHdFQUF3RTtRQUN4RSw0RkFBNEY7UUFDNUYsc0VBQXNFO1FBQ3RFLHlGQUF5RjtRQUN6RixtREFBbUQ7UUFDbkQsMERBQTJCLEdBQTNCLFVBQTRCLEdBQWE7WUFDckMsSUFBSSxLQUFlLEVBQUUsS0FBc0IsQ0FBQztZQUM1QyxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEMsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNYLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDWCxnRUFBZ0U7WUFDaEUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFVBQUMsS0FBYSxFQUFFLFFBQWdCO2dCQUN2RCxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUN4QixLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3pCLENBQUMsQ0FBQyxDQUFDO1lBQ0gsK0RBQStEO1lBQy9ELEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBQyxDQUFTLEVBQUUsQ0FBUztnQkFDNUIsSUFBSSxFQUFFLEdBQVUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN2QyxJQUFJLEVBQUUsR0FBVSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3ZDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxQyxDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBQzFCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUM7UUFDbkMsQ0FBQztRQUVELGdHQUFnRztRQUNoRyxzRkFBc0Y7UUFDdEYscUZBQXFGO1FBQ3JGLDBGQUEwRjtRQUMxRiw4RkFBOEY7UUFDOUYsaURBQWlEO1FBQ2pELHNFQUFzRTtRQUN0RSxzREFBdUIsR0FBdkIsVUFBd0IsR0FBYTtZQUNqQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUM7UUFDbEQsQ0FBQztRQUVELDRGQUE0RjtRQUM1RixrREFBa0Q7UUFDbEQsNkNBQWMsR0FBZDtZQUNJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsMENBQVcsR0FBWCxVQUFZLFNBQVM7WUFDakIsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELHFDQUFNLEdBQU47WUFDSSxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3JDLENBQUM7UUFFRCxxRkFBcUY7UUFDckYsa0ZBQWtGO1FBQ2xGLDhCQUE4QjtRQUM5QixxRkFBcUY7UUFDckYsd0ZBQXdGO1FBQ3hGLDZEQUE2RDtRQUM3RCw0Q0FBYSxHQUFiO1lBQUEsaUJBb0VDO1lBbkVHLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFFbkMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLG9GQUFvRjtZQUNwRixrRkFBa0Y7WUFDbEYsc0VBQXNFO1lBQ3RFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDckMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUMvRCxvRkFBb0Y7Z0JBQ3BGLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUVqQyxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7WUFDbEMsbUNBQW1DO1lBQ25DLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUVqQyxnREFBZ0Q7WUFDaEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixJQUFJLE1BQU0sR0FBTyxFQUFFLENBQUM7Z0JBRXBCLHlFQUF5RTtnQkFDekUsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQzVCLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEQsQ0FBQztZQUNMLENBQUM7WUFFRCxtRUFBbUU7WUFDbkUsMEVBQTBFO1lBQzFFLG1EQUFtRDtZQUNuRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFVBQUMsUUFBZ0I7Z0JBRTVDLElBQUksUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUIsUUFBUSxHQUFHLENBQUMsUUFBUSxFQUFFLEtBQUksQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDOUUsSUFBSSxHQUFHLEdBQUcsS0FBSSxDQUFDLFNBQVMsQ0FBQyxLQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDUCxrREFBa0Q7b0JBQ2xELHFEQUFxRDtvQkFDckQsS0FBSSxDQUFDLFNBQVMsQ0FBQyxLQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQXdCLEtBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDckcsSUFBSSxHQUFHLEtBQUksQ0FBQyxTQUFTLENBQUMsS0FBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNoRSxLQUFJLENBQUMsVUFBVSxDQUFDLEtBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMseUJBQXlCLENBQUM7eUJBQ3RFLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDO3lCQUMxQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRXBCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO3lCQUMzRSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRXBCLEVBQUUsQ0FBQyxDQUFDLEtBQUksQ0FBQyxZQUFZLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQzt3QkFDL0IsS0FBSyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7d0JBRWpDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDOzRCQUM1QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQ0FDMUQsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFBOzRCQUNoRCxDQUFDO3dCQUNMLENBQUM7b0JBQ0wsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQzNDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUNILHdGQUF3RjtZQUN4RixtRUFBbUU7WUFDbkUseUZBQXlGO1lBQ3pGLHdEQUF3RDtZQUN4RCxTQUFTLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBRUQscUVBQXFFO1FBQ3JFLG1FQUFtRTtRQUNuRSw4RkFBOEY7UUFDOUYscURBQXFEO1FBQ3JELHlGQUF5RjtRQUN6RixvR0FBb0c7UUFDcEcsc0ZBQXNGO1FBQ3RGLDhFQUE4RTtRQUM5RSw0RkFBNEY7UUFDNUYsNkRBQTZEO1FBQzdELGdGQUFnRjtRQUNoRix1RUFBd0MsR0FBeEM7WUFBQSxpQkEwQ0M7WUF6Q0csSUFBSSxPQUFPLEdBQVcsS0FBSyxFQUN2QixvQkFBb0IsR0FBa0IsRUFBRSxFQUN4QyxDQUFDLEdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBRWxDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsVUFBQyxRQUFnQjtnQkFDNUMsSUFBSSxRQUFRLEdBQVcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxLQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BFLElBQUksT0FBTyxFQUFFLFFBQVEsQ0FBQztnQkFDdEIsc0RBQXNEO2dCQUN0RCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7Z0JBQy9FLFFBQVEsR0FBRyxLQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQztnQkFDMUUsRUFBRSxDQUFDLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQztvQkFBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO2dCQUN6QyxFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssR0FBRyxDQUFDO29CQUFDLEtBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7Z0JBQ3RELG9CQUFvQixDQUFDLEtBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDaEUsQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFFbEUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFnQix5Q0FBeUM7WUFDdEUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNwQixDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxpREFBaUQ7WUFDOUUsSUFBSSxDQUFDLHNCQUFzQixHQUFHLENBQUMsQ0FBQztZQUNoQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztnQkFDckMsSUFBSSxDQUFDLHVCQUF1QixHQUFHLENBQUMsQ0FBQztnQkFDakMsT0FBTyxHQUFHLElBQUksQ0FBQztZQUNuQixDQUFDO1lBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNYLDhFQUE4RTtnQkFDOUUsMkVBQTJFO2dCQUMzRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxVQUFDLFdBQVc7b0JBQzNDLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7d0JBQ2xELE9BQU8sR0FBRyxJQUFJLENBQUM7d0JBQ2YseURBQXlEO3dCQUN6RCw2QkFBNkI7d0JBQzdCLEtBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDeEQsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxJQUFJLENBQUMscUJBQXFCLEdBQUcsb0JBQW9CLENBQUM7WUFDbEQsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUNuQixDQUFDO1FBRUQsbUZBQW1GO1FBQ25GLHFGQUFxRjtRQUNyRix3RkFBd0Y7UUFDeEYscUZBQXFGO1FBQ3JGLHVFQUF1RTtRQUN2RSx3RUFBd0U7UUFDeEUsd0RBQXlCLEdBQXpCLFVBQTBCLEdBQVM7WUFBbkMsaUJBMEVDO1lBekVHLG9FQUFvRTtZQUNwRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLE1BQU0sQ0FBQyxHQUFHLENBQUM7WUFDZixDQUFDO1lBRUQsSUFBSSxnQkFBdUIsQ0FBQztZQUU1QixJQUFJLFlBQVksR0FBVyxLQUFLLENBQUM7WUFDakMsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO1lBRW5CLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztZQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDWixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7b0JBQzNDLHlEQUF5RDtvQkFDekQsZ0ZBQWdGO29CQUNoRix1QkFBdUI7b0JBQ3ZCLFNBQVMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFDLEdBQUcsSUFBTyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkUsd0RBQXdEO29CQUN4RCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZCLFlBQVksR0FBRyxJQUFJLENBQUM7b0JBQ3hCLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7WUFFRCxJQUFJLHlCQUF5QixHQUFHLEVBQUUsQ0FBQztZQUVuQyxnQkFBZ0IsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQUMsRUFBRTtnQkFDN0IsSUFBSSxJQUFJLEdBQVksS0FBSyxDQUFDO2dCQUMxQixpREFBaUQ7Z0JBQ2pELDJFQUEyRTtnQkFDM0UsbUJBQW1CO2dCQUNuQixFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdEIsdUVBQXVFO29CQUN2RSxzRUFBc0U7b0JBQ3RFLGtFQUFrRTtvQkFDbEUsS0FBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBQyxLQUFLO3dCQUM5QixJQUFJLEtBQUssR0FBVyxJQUFJLEVBQUUsSUFBVyxDQUFDO3dCQUN0QyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDOzRCQUNmLElBQUksR0FBRyxLQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDOzRCQUM5QyxLQUFLLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFDLENBQUM7Z0NBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7NEJBQzNELENBQUMsQ0FBQyxDQUFDO3dCQUNQLENBQUM7d0JBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzs0QkFDUix5QkFBeUIsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7NEJBQ3JDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7Z0NBQy9GLElBQUksR0FBRyxJQUFJLENBQUM7NEJBQ2hCLENBQUM7d0JBQ0wsQ0FBQztvQkFDTCxDQUFDLENBQUMsQ0FBQztnQkFDUCxDQUFDO2dCQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7WUFFSCw4Q0FBOEM7WUFDOUMsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsVUFBQyxJQUFJO2dCQUNoQyxJQUFJLFFBQVEsR0FBVyxLQUFJLENBQUMsVUFBVSxDQUFDLEtBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDM0QsR0FBRyxHQUF3QixLQUFJLENBQUMsU0FBUyxDQUFDLEtBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDbEUsSUFBSSxHQUFZLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdEQsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtnQkFDaEMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDcEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDUCxLQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUMzQyxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNCLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUNILG1EQUFtRDtZQUNuRCx5Q0FBeUM7WUFDekMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEdBQUcsSUFBSyxPQUFBLEtBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQXRDLENBQXNDLENBQUMsQ0FBQztZQUV0RSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7UUFDNUIsQ0FBQztRQUVELDJCQUEyQjtRQUMzQiw4Q0FBZSxHQUFmLFVBQWdCLE9BQWM7WUFDMUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELDZDQUFjLEdBQWQsVUFBZSxPQUFjO1lBQ3pCLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDMUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3JCLENBQUM7UUFDRCxpREFBa0IsR0FBbEIsVUFBbUIsT0FBYztZQUM3QixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQztnQkFBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUNyQixDQUFDO1FBQ0wsMkJBQUM7SUFBRCxDQUFDLEFBN1lELElBNllDO0lBN1lZLGtDQUFvQix1QkE2WWhDLENBQUE7SUFFRCw0Q0FBNEM7SUFDNUMsMEVBQTBFO0lBQzFFLHFFQUFxRTtJQUNyRTtRQUF5Qyx1Q0FBb0I7UUFBN0Q7O1FBcUJBLENBQUM7UUFwQkcsdUNBQVMsR0FBVDtZQUNJLGlCQUFNLFNBQVMsWUFBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUVELHFEQUF1QixHQUF2QixVQUF3QixHQUFhO1lBQXJDLGlCQWVDO1lBZEcsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFDLE9BQWU7Z0JBQ3hCLElBQUksSUFBSSxHQUFPLEtBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNsRCxLQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMxRCxvREFBb0Q7Z0JBQ3BELENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBQyxRQUFnQjtvQkFDekMsSUFBSSxNQUFNLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDdkMsRUFBRSxDQUFDLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUN4QixLQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUksQ0FBQyxrQkFBa0IsQ0FBQzt3QkFDL0YsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbkUsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNMLDBCQUFDO0lBQUQsQ0FBQyxBQXJCRCxDQUF5QyxvQkFBb0IsR0FxQjVEO0lBckJZLGlDQUFtQixzQkFxQi9CLENBQUE7SUFFRCx5RUFBeUU7SUFDekUsZ0NBQWdDO0lBQ2hDO1FBQStDLDZDQUFvQjtRQUFuRTs7UUFxQkEsQ0FBQztRQXBCRyw2Q0FBUyxHQUFUO1lBQ0ksaUJBQU0sU0FBUyxZQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBRUQsMkRBQXVCLEdBQXZCLFVBQXdCLEdBQWE7WUFBckMsaUJBZUM7WUFkRyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBYztnQkFDdkIsSUFBSSxJQUFJLEdBQU8sS0FBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2xELEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFELDJEQUEyRDtnQkFDM0QsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFDLFFBQWU7b0JBQ3hDLElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3JDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDbEIsS0FBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsa0JBQWtCLENBQUM7d0JBQ3pGLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hFLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDTCxnQ0FBQztJQUFELENBQUMsQUFyQkQsQ0FBK0Msb0JBQW9CLEdBcUJsRTtJQXJCWSx1Q0FBeUIsNEJBcUJyQyxDQUFBO0lBRUQsd0VBQXdFO0lBQ3hFO1FBQWlELCtDQUFvQjtRQUFyRTs7UUFxQkEsQ0FBQztRQXBCRywrQ0FBUyxHQUFUO1lBQ0ksaUJBQU0sU0FBUyxZQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBRUQsNkRBQXVCLEdBQXZCLFVBQXdCLEdBQWE7WUFBckMsaUJBZUM7WUFkRyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBYztnQkFDdkIsSUFBSSxJQUFJLEdBQU8sS0FBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2xELEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFELDJFQUEyRTtnQkFDM0UsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFDLFFBQWU7b0JBQ3hDLElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3JDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDdEIsS0FBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsa0JBQWtCLENBQUM7d0JBQ2pHLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7b0JBQ3BFLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDTCxrQ0FBQztJQUFELENBQUMsQUFyQkQsQ0FBaUQsb0JBQW9CLEdBcUJwRTtJQXJCWSx5Q0FBMkIsOEJBcUJ2QyxDQUFBO0lBRUQsNkNBQTZDO0lBQzdDO1FBQTJDLHlDQUFvQjtRQUEvRDs7UUFpQkEsQ0FBQztRQWhCRyx5Q0FBUyxHQUFUO1lBQ0ksaUJBQU0sU0FBUyxZQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsdURBQXVCLEdBQXZCLFVBQXdCLEdBQWE7WUFBckMsaUJBV0M7WUFWRyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBYztnQkFDdkIsSUFBSSxJQUFJLEdBQU8sS0FBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2xELEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNaLEtBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSSxDQUFDLGtCQUFrQixDQUFDO29CQUMzRixLQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNqRSxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0wsNEJBQUM7SUFBRCxDQUFDLEFBakJELENBQTJDLG9CQUFvQixHQWlCOUQ7SUFqQlksbUNBQXFCLHdCQWlCakMsQ0FBQTtJQUVELDBDQUEwQztJQUMxQztRQUEyQyx5Q0FBb0I7UUFBL0Q7O1FBaUJBLENBQUM7UUFoQkcseUNBQVMsR0FBVDtZQUNJLGlCQUFNLFNBQVMsWUFBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVELHVEQUF1QixHQUF2QixVQUF3QixHQUFhO1lBQXJDLGlCQVdDO1lBVkcsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFDLE9BQWM7Z0JBQ3ZCLElBQUksUUFBUSxHQUFtQixLQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2hFLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFELEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDNUIsS0FBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsa0JBQWtCLENBQUM7b0JBQ25HLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3JFLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDTCw0QkFBQztJQUFELENBQUMsQUFqQkQsQ0FBMkMsb0JBQW9CLEdBaUI5RDtJQWpCWSxtQ0FBcUIsd0JBaUJqQyxDQUFBO0lBRUQsc0NBQXNDO0lBQ3RDO1FBQXdDLHNDQUFvQjtRQUE1RDs7UUFpQkEsQ0FBQztRQWhCRyxzQ0FBUyxHQUFUO1lBQ0ksaUJBQU0sU0FBUyxZQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsb0RBQXVCLEdBQXZCLFVBQXdCLEdBQWE7WUFBckMsaUJBV0M7WUFWRyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBYztnQkFDdkIsSUFBSSxLQUFLLEdBQUcsS0FBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2hELEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNiLEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSSxDQUFDLGtCQUFrQixDQUFDO29CQUM3RixLQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0wseUJBQUM7SUFBRCxDQUFDLEFBakJELENBQXdDLG9CQUFvQixHQWlCM0Q7SUFqQlksZ0NBQWtCLHFCQWlCOUIsQ0FBQTtJQUVELG9FQUFvRTtJQUNwRSwwRUFBMEU7SUFDMUUsd0RBQXdEO0lBQ3hELDZFQUE2RTtJQUM3RTtRQUEyQyx5Q0FBb0I7UUFNM0QsK0JBQVksVUFBaUI7WUFBN0IsWUFDSSxpQkFBTyxTQUtWO1lBSkcsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM1QyxLQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztZQUM3QixLQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDO1lBQ3pCLEtBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7O1FBQy9CLENBQUM7UUFFRCx5Q0FBUyxHQUFUO1lBQ0ksaUJBQU0sU0FBUyxZQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEdBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZGLENBQUM7UUFDTCw0QkFBQztJQUFELENBQUMsQUFqQkQsQ0FBMkMsb0JBQW9CLEdBaUI5RDtJQWpCWSxtQ0FBcUIsd0JBaUJqQyxDQUFBO0lBRUQ7UUFBK0MsNkNBQXFCO1FBQXBFOztRQWVBLENBQUM7UUFiRywyREFBdUIsR0FBdkIsVUFBd0IsR0FBYTtZQUFyQyxpQkFZQztZQVhHLElBQUksQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBQyxPQUFjO2dCQUN2QixJQUFJLElBQUksR0FBUSxLQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsRUFBRSxLQUFLLEdBQUcsU0FBUyxDQUFDO2dCQUN0RSxLQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMxRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUMsS0FBSyxHQUFHLENBQUUsS0FBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFJLENBQUMsSUFBSSxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNqRixDQUFDO2dCQUNELEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUksQ0FBQyxrQkFBa0IsQ0FBQztnQkFDbkYsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzdELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNMLGdDQUFDO0lBQUQsQ0FBQyxBQWZELENBQStDLHFCQUFxQixHQWVuRTtJQWZZLHVDQUF5Qiw0QkFlckMsQ0FBQTtJQUVEO1FBQWdELDhDQUFxQjtRQUFyRTs7UUFlQSxDQUFDO1FBYkcsNERBQXVCLEdBQXZCLFVBQXdCLEdBQWE7WUFBckMsaUJBWUM7WUFYRyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBYztnQkFDdkIsSUFBSSxLQUFLLEdBQVEsS0FBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsS0FBSyxHQUFHLFNBQVMsQ0FBQztnQkFDeEUsS0FBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxLQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDMUQsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVDLEtBQUssR0FBRyxDQUFFLEtBQUksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSSxDQUFDLElBQUksQ0FBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbEYsQ0FBQztnQkFDRCxLQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsa0JBQWtCLENBQUM7Z0JBQ25GLEtBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUM3RCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDTCxpQ0FBQztJQUFELENBQUMsQUFmRCxDQUFnRCxxQkFBcUIsR0FlcEU7SUFmWSx3Q0FBMEIsNkJBZXRDLENBQUE7SUFFRCx5RUFBeUU7SUFFekUsbURBQW1EO0lBQ25EO1FBQXdELHNEQUFvQjtRQUE1RTs7UUFtQkEsQ0FBQztRQWxCRywyRUFBMkU7UUFDM0Usc0RBQVMsR0FBVDtZQUNJLGlCQUFNLFNBQVMsWUFBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUVELG9FQUF1QixHQUF2QixVQUF3QixLQUFlO1lBQXZDLGlCQVlDO1lBWEcsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFDLFNBQWdCO2dCQUMzQixJQUFJLE9BQU8sR0FBUSxPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLEtBQVUsQ0FBQztnQkFDMUUsS0FBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxLQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsS0FBSyxHQUFHLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN2RSxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3RCLEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSSxDQUFDLGtCQUFrQixDQUFDO29CQUM3RixLQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0wseUNBQUM7SUFBRCxDQUFDLEFBbkJELENBQXdELG9CQUFvQixHQW1CM0U7SUFuQlksZ0RBQWtDLHFDQW1COUMsQ0FBQTtJQUVELDZEQUE2RDtJQUM3RCw0RUFBNEU7SUFDNUUsb0ZBQW9GO0lBQ3BGLGdCQUFnQjtJQUNoQixzRkFBc0Y7SUFDdEYscUZBQXFGO0lBQ3JGLDhFQUE4RTtJQUM5RSxxRkFBcUY7SUFDckY7UUFBOEMsNENBQW9CO1FBQWxFOztRQWFBLENBQUM7UUFURyw0Q0FBUyxHQUFULFVBQVUsS0FBWSxFQUFFLFVBQWlCO1lBQ3JDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLGlCQUFNLFNBQVMsWUFBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUVELHlDQUF5QztRQUN6QyxpREFBYyxHQUFkO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDakUsQ0FBQztRQUNMLCtCQUFDO0lBQUQsQ0FBQyxBQWJELENBQThDLG9CQUFvQixHQWFqRTtJQWJZLHNDQUF3QiwyQkFhcEMsQ0FBQTtJQUVELGtEQUFrRDtJQUNsRDtRQUFxRCxtREFBd0I7UUFBN0U7O1FBOEJBLENBQUM7UUExQkcsbURBQVMsR0FBVDtZQUNJLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLGlCQUFNLFNBQVMsWUFBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekMsQ0FBQztRQUVELHdEQUFjLEdBQWQ7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBRUQsaUVBQXVCLEdBQXZCLFVBQXdCLElBQWM7WUFBdEMsaUJBZ0JDO1lBZkcsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFDLFNBQWlCO2dCQUMzQixJQUFJLE9BQU8sR0FBUSxPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM5RCxJQUFJLEtBQVUsQ0FBQztnQkFDZixLQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEtBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM5RCxFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQzFCLEtBQUssR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDckQsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUN0QixLQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUksQ0FBQyxrQkFBa0IsQ0FBQzt3QkFDN0YsS0FBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDcEUsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUM3QixDQUFDO1FBQ0wsc0NBQUM7SUFBRCxDQUFDLEFBOUJELENBQXFELHdCQUF3QixHQThCNUU7SUE5QlksNkNBQStCLGtDQThCM0MsQ0FBQTtJQUVELHFEQUFxRDtJQUNyRDtRQUE2QywyQ0FBd0I7UUFBckU7O1FBdUJBLENBQUM7UUFyQkcsMkNBQVMsR0FBVDtZQUNJLGlCQUFNLFNBQVMsWUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUVELHlEQUF1QixHQUF2QixVQUF3QixLQUFlO1lBQXZDLGlCQWdCQztZQWZHLElBQUksQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBQyxTQUFnQjtnQkFDM0IsSUFBSSxPQUFPLEdBQVEsT0FBTyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxVQUFlLENBQUM7Z0JBQy9FLEtBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzlELEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDMUIsVUFBVSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDekQsRUFBRSxDQUFDLENBQUMsVUFBVSxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUNoQyxLQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUksQ0FBQyxrQkFBa0IsQ0FBQzt3QkFDdkcsS0FBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekUsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDSCwyRUFBMkU7WUFDM0UsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFDN0IsQ0FBQztRQUNMLDhCQUFDO0lBQUQsQ0FBQyxBQXZCRCxDQUE2Qyx3QkFBd0IsR0F1QnBFO0lBdkJZLHFDQUF1QiwwQkF1Qm5DLENBQUE7SUFFRCxrREFBa0Q7SUFDbEQ7UUFBMEMsd0NBQXdCO1FBQWxFOztRQXVCQSxDQUFDO1FBckJHLHdDQUFTLEdBQVQ7WUFDSSxpQkFBTSxTQUFTLFlBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFFRCxzREFBdUIsR0FBdkIsVUFBd0IsS0FBZTtZQUF2QyxpQkFnQkM7WUFmRyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztZQUNyQixLQUFLLENBQUMsT0FBTyxDQUFDLFVBQUMsU0FBZ0I7Z0JBQzNCLElBQUksT0FBTyxHQUFRLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEVBQUUsT0FBWSxDQUFDO2dCQUM1RSxLQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEtBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM5RCxFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQzFCLE9BQU8sR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ25ELEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDMUIsS0FBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsa0JBQWtCLENBQUM7d0JBQ2pHLEtBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3RFLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsMkVBQTJFO1lBQzNFLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQzdCLENBQUM7UUFDTCwyQkFBQztJQUFELENBQUMsQUF2QkQsQ0FBMEMsd0JBQXdCLEdBdUJqRTtJQXZCWSxrQ0FBb0IsdUJBdUJoQyxDQUFBO0lBRUQsK0NBQStDO0lBQy9DO1FBQXVDLHFDQUF3QjtRQUEvRDs7UUF1QkEsQ0FBQztRQXJCRyxxQ0FBUyxHQUFUO1lBQ0ksaUJBQU0sU0FBUyxZQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsbURBQXVCLEdBQXZCLFVBQXdCLEtBQWU7WUFBdkMsaUJBZ0JDO1lBZkcsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDckIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFDLFNBQWdCO2dCQUMzQixJQUFJLE9BQU8sR0FBUSxPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLElBQVMsQ0FBQztnQkFDekUsS0FBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxLQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUMxQixJQUFJLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUM3QyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQ3BCLEtBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSSxDQUFDLGtCQUFrQixDQUFDO3dCQUMzRixLQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNuRSxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUNILDJFQUEyRTtZQUMzRSxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUM3QixDQUFDO1FBQ0wsd0JBQUM7SUFBRCxDQUFDLEFBdkJELENBQXVDLHdCQUF3QixHQXVCOUQ7SUF2QlksK0JBQWlCLG9CQXVCN0IsQ0FBQTtJQUdELDhCQUE4QjtJQUM5QjtRQUVJLGNBQUEsMEJBQTBCLEdBQUcsSUFBSSwwQkFBMEIsRUFBRSxDQUFDO1FBQzlELG1CQUFtQixHQUFHLEVBQUUsQ0FBQztRQUN6Qix5QkFBeUIsR0FBRyxFQUFFLENBQUM7UUFFL0IsdUNBQXVDO1FBQ3ZDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDMUIsWUFBWSxHQUFHLGFBQWEsQ0FBQztRQUM3QixxQkFBcUIsR0FBRyxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNsRCx3QkFBd0IsR0FBRyxLQUFLLENBQUM7UUFDakMsc0RBQXNEO1FBQ3RELGtCQUFrQixHQUFHO1lBQ2pCLFdBQVcsRUFBRSxJQUFJO1lBQ2pCLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLE9BQU8sRUFBRSxJQUFJO1NBQ2hCLENBQUM7UUFDRiw2QkFBNkIsR0FBRyxJQUFJLENBQUM7UUFFckMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUVoQixrQkFBa0IsR0FBRyxJQUFJLENBQUM7UUFDMUIsY0FBQSxjQUFjLEdBQUcsSUFBSSxDQUFDO1FBRXRCLHVCQUF1QixHQUFHLElBQUksQ0FBQztRQUUvQixDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDM0IsT0FBTyxFQUFFO2dCQUNMLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2pDLENBQUM7WUFDRCxRQUFRLEVBQUUsRUFBRSxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxFQUFFLGNBQWMsRUFBRTtZQUN0RCxJQUFJLEVBQUUsSUFBSTtZQUNWLEtBQUssRUFBRSxVQUFVLEtBQUssRUFBRSxFQUFNO2dCQUMxQixFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FDaEI7b0JBQ0ksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN0QyxDQUFDLEVBQ0Q7b0JBQ0ksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUU7d0JBQ25CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDckIsQ0FBQyxDQUFDLENBQUE7Z0JBQ04sQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDO1NBQ0osQ0FBQyxDQUFDO1FBQ0gscUZBQXFGO1FBQ3JGLDhFQUE4RTtRQUM5RSxnRUFBZ0U7UUFDaEUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ2xDLGlCQUFpQixFQUFFLENBQUM7UUFDcEIsdURBQXVEO1FBQ3ZELG1FQUFtRTtRQUVuRSxnRkFBZ0Y7UUFDaEYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUNqQiw0RUFBNEU7WUFDNUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0RixzQ0FBc0M7Z0JBQ3RDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM5QixDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM5QyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ3hCLFdBQVcsR0FBRyxPQUFPLENBQUM7WUFDdEIsdUJBQXVCLEVBQUUsQ0FBQztZQUMxQixlQUFlLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekMsbUJBQW1CLENBQUMsRUFBQyxZQUFZLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLFdBQVc7Z0JBQ3RELFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFDLENBQUMsQ0FBQztZQUN6RCxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0MsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1QyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEMsOEJBQThCLEVBQUUsQ0FBQztZQUNqQyx1REFBdUQ7WUFDdkQsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVILDJDQUEyQztRQUMzQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBUyxFQUFFO1lBQ3pDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNwQixDQUFDLENBQUMsMENBQTBDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3BFLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFTLEVBQUU7WUFDaEMsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLENBQUMsQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdEUsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVMsRUFBRTtZQUNoQyxFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDcEIsc0JBQXNCLEVBQUUsQ0FBQztZQUN6QixDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ2pELENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCw4Q0FBOEM7UUFDOUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVMsRUFBRTtZQUNqQyxFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDcEIsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDeEMsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILGdEQUFnRDtRQUNoRCxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVMsRUFBRTtZQUNoQyxFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDcEIsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDekMsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDeEIsQ0FBQyxDQUFDLHdEQUF3RCxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVFLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1Qyx1QkFBdUIsRUFBRSxDQUFDO1lBQzFCLFdBQVcsR0FBRyxXQUFXLENBQUM7WUFDMUIsbUJBQW1CLENBQUMsRUFBQyxZQUFZLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLFdBQVc7Z0JBQ3RELFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFDLENBQUMsQ0FBQztZQUN6RCxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdEMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNuQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1QyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDN0MsOEJBQThCLEVBQUUsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO1lBQzlCLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO1lBQ2xDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO1lBQ2xDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO1lBQ3pDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDdkIsQ0FBQyxDQUFDLHdEQUF3RCxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVFLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1Qyx1QkFBdUIsRUFBRSxDQUFDO1lBQzFCLFdBQVcsR0FBRyxVQUFVLENBQUM7WUFDekIscUJBQXFCLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxNQUFNLEtBQUssWUFBWSxDQUFDLENBQUM7WUFDakUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxNQUFNLEtBQUssWUFBWSxDQUFDLENBQUM7WUFDakUsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxhQUFhLEtBQUssWUFBWSxDQUFDLENBQUM7WUFDL0UsOEJBQThCLEVBQUUsQ0FBQztZQUNqQyxFQUFFLENBQUMsQ0FBQyxZQUFZLEtBQUssYUFBYSxDQUFDLENBQUMsQ0FBQztnQkFDaEMsbUJBQW1CLENBQUMsRUFBQyxZQUFZLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxFQUFFLFlBQVk7b0JBQ3RFLFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFDLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBQ0QsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsS0FBSyxDQUFDO1lBQzNCLFlBQVksR0FBRyxNQUFNLENBQUM7WUFDdEIsbUJBQW1CLENBQUMsRUFBQyxZQUFZLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxFQUFFLFlBQVk7Z0JBQ3pELFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFDLENBQUMsQ0FBQztZQUMxRCw4QkFBOEIsRUFBRSxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsS0FBSyxDQUFDO1lBQzNCLFlBQVksR0FBRyxNQUFNLENBQUM7WUFDdEIsbUJBQW1CLENBQUMsRUFBQyxZQUFZLEVBQUMscUJBQXFCLEVBQUUsTUFBTSxFQUFFLFlBQVk7Z0JBQ3pELFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFDLENBQUMsQ0FBQztZQUN6RCw4QkFBOEIsRUFBRSxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ2xDLFlBQVksR0FBRyxhQUFhLENBQUM7WUFDN0IsbUJBQW1CLENBQUMsRUFBQyxZQUFZLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxFQUFFLFlBQVk7Z0JBQ2pFLFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFDLENBQUMsQ0FBQztZQUN6RCw4QkFBOEIsRUFBRSxDQUFDO1lBQ2pDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSxXQUFXLEdBQVcsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDbEQsV0FBVyxDQUFDLEtBQUssQ0FBQyxVQUFTLEtBQUs7WUFDNUIsSUFBSSxJQUFJLEdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQVcsRUFBRSxPQUFlLENBQUM7WUFDekQsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbEIsT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDckMscUJBQXFCO1lBQ3JCLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyRCxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBRUgsd0ZBQXdGO1FBQ3hGLG9GQUFvRjtRQUNwRixzRUFBc0U7UUFFdEUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDOUMsU0FBUyxDQUFDLEtBQUssQ0FBQztZQUNaLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLFNBQVMsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDOUUsQ0FBQyxDQUFDLGlEQUFpRCxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzVFLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILDZFQUE2RTtRQUM3RSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQUMsRUFBRTtZQUNqQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELFNBQVMsQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUMsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsQ0FBQztnQkFDOUUsQ0FBQyxDQUFDLGlEQUFpRCxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pFLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBQyxFQUFFO1lBQ1YsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNwQixTQUFTLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUM7Z0JBQzlFLENBQUMsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN6RSxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFeEIsYUFBYSxDQUFDLGNBQWMsR0FBRyxPQUFPLENBQUMsY0FBYyxFQUFFLFVBQUMsSUFBSTtZQUN4RCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ3JELENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDL0IsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLFdBQVcsQ0FBQyxDQUFFLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQTtZQUNWLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDO2dCQUNyQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBQ3pCLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM3QixDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQy9CLENBQUM7UUFDRCxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFWCw0Q0FBNEM7UUFDNUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ3hCLFFBQVEsRUFBRSxHQUFHO1lBQ2IsUUFBUSxFQUFFLEtBQUs7U0FDbEIsQ0FBQyxDQUFDO1FBRUgsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsS0FBSyxDQUFDO1lBQzdCLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUUsTUFBTSxDQUFFLENBQUM7WUFDekQsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILGdEQUFnRDtRQUNoRCxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxFQUFFLENBQUMsNkJBQTZCLEVBQUUsOEJBQThCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQy9GLEVBQUUsQ0FBQyxTQUFTLEVBQUUsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQWxRZSx1QkFBUyxZQWtReEIsQ0FBQTtJQUVEO1FBQ0ksSUFBSSxLQUFLLEdBQVUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQ3RDLGtEQUFrRCxFQUNsRCxJQUFJLENBQUMsQ0FBQztRQUNWLE1BQU0sQ0FBQyxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxDQUFDO0lBQzVDLENBQUM7SUFFRCw2QkFBNkIsSUFBSTtRQUM3QixDQUFDLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDakQsTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyRSxNQUFNLEVBQUUsTUFBTTtTQUNqQixDQUFDLENBQUM7SUFDWCxDQUFDO0lBRUQ7UUFDSSw2REFBNkQ7UUFDN0QscUNBQXFDO1FBQ3JDLElBQUksUUFBZ0IsRUFBRSxJQUFZLENBQUM7UUFDbkMsUUFBUSxHQUFHLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ25DLElBQUksR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwRixzREFBc0Q7UUFDdEQsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsZUFBZSxFQUFFLFVBQUMsQ0FBQztZQUNoQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxzQkFBNkIsT0FBTztRQUNoQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ0gsS0FBSyxFQUFFLFVBQVU7WUFDakIsTUFBTSxFQUFFLEtBQUs7WUFDYixPQUFPLEVBQUUsVUFBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUM7Z0JBQ3BCLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0RBQWdELENBQUMsQ0FBQztnQkFDeEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLDBCQUEwQixFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkUsQ0FBQztZQUNELFNBQVMsRUFBRSxPQUFPO1NBQ3JCLENBQUMsQ0FBQztJQUNQLENBQUM7SUFWZSwwQkFBWSxlQVUzQixDQUFBO0lBRUQsdUJBQThCLE9BQWMsRUFBRSxRQUEwQixFQUFFLFlBQWlCO1FBQ3ZGLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsT0FBTyxFQUFFO1lBQ25DLFVBQVUsRUFBRSxNQUFNO1lBQ2xCLFNBQVMsRUFBRSxVQUFDLElBQVE7Z0JBQ2hCLElBQUksR0FBRyxJQUFJLElBQUksWUFBWSxDQUFDO2dCQUM1QixFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUMzQixJQUFJLENBQUM7d0JBQ0QsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzVCLENBQUM7b0JBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUF5QyxDQUFDO2dCQUMzRCxDQUFDO2dCQUNELFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzVCLENBQUM7U0FDSixDQUFDLENBQUM7SUFDUCxDQUFDO0lBYmUsMkJBQWEsZ0JBYTVCLENBQUE7SUFFRCxtQkFBbUIsSUFBSTtRQUNuQixPQUFPLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXhDLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZELGNBQUEsMEJBQTBCLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUVyRCxDQUFDLENBQUMsNkRBQTZELENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDcEUsOEJBQThCLEVBQUUsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQztRQUNILGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRCwyQkFBMkIsT0FBTztRQUFsQyxpQkFjQztRQWJHLG9EQUFvRDtRQUNwRCxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsVUFBQyxFQUFFLEVBQUUsUUFBUTtZQUNuQyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUNILEdBQUcsRUFBRSxlQUFlLEdBQUcsRUFBRSxHQUFHLEdBQUc7Z0JBQy9CLElBQUksRUFBRSxLQUFLO2dCQUNYLFFBQVEsRUFBRSxNQUFNO2dCQUNoQixLQUFLLEVBQUUsVUFBQyxHQUFHLEVBQUUsTUFBTTtvQkFDZixPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7b0JBQzFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hCLENBQUM7Z0JBQ0QsT0FBTyxFQUFFLHNCQUFzQixDQUFDLElBQUksQ0FBQyxLQUFJLEVBQUUsUUFBUSxDQUFDO2FBQ3ZELENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVEO1FBQ0ksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakYseUJBQXlCO1lBQ3pCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ2QsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsS0FBSyxFQUFFLEtBQUs7Z0JBQ1osSUFBSSxFQUFFLFNBQVM7YUFDbEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN4QixDQUFDO0lBQ0wsQ0FBQztJQUVEO1FBQ0ksSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEMsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JDLElBQUksRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuQixxRkFBcUY7WUFDckYsbUJBQW1CO1lBQ25CLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDNUIsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuQyxDQUFDO1FBRUwsQ0FBQztRQUNELE1BQU0sQ0FBQyxXQUFXLENBQUM7SUFDdkIsQ0FBQztJQUdELDRCQUE0QixDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSztZQUNkLEtBQUssRUFBRSxDQUFDLENBQUMsT0FBTztZQUNoQixLQUFLLENBQUMsQ0FBQyxDQUFFLE1BQU07WUFDZixLQUFLLEVBQUUsQ0FBRSxTQUFTO2dCQUNkLE1BQU0sQ0FBQztZQUNYO2dCQUNJLCtEQUErRDtnQkFDL0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUNsQyxNQUFNLENBQUM7Z0JBQ1gsQ0FBQztnQkFDRCw4QkFBOEIsRUFBRSxDQUFDO1FBQ3pDLENBQUM7SUFDTCxDQUFDO0lBRUQsMEJBQWlDLEtBQUs7UUFDbEMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNILEdBQUcsRUFBRSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUN4RCxJQUFJLEVBQUUsS0FBSztZQUNYLFFBQVEsRUFBRSxNQUFNO1lBQ2hCLEtBQUssRUFBRSxVQUFDLEdBQUcsRUFBRSxNQUFNO2dCQUNmLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLEdBQUcsS0FBSyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFDdkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4QixDQUFDO1lBQ0QsT0FBTyxFQUFFLHNCQUFzQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDO1NBQ3ZELENBQUMsQ0FBQztJQUNQLENBQUM7SUFaZSw4QkFBZ0IsbUJBWS9CLENBQUE7SUFFRCxnQ0FBZ0MsUUFBUSxFQUFFLElBQUk7UUFDMUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxFQUNkLGVBQWUsR0FBRyxFQUFFLEVBQ3BCLFdBQVcsR0FBVSxDQUFDLEVBQ3RCLFNBQVMsR0FBVSxDQUFDLENBQUM7UUFDekIsT0FBTyxDQUFDLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUM7UUFDNUQsT0FBTyxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGdCQUFnQixJQUFJLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFaEYsMENBQTBDO1FBQzFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFDLE9BQWMsRUFBRSxLQUFZO1lBQ3JELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDUiwyREFBMkQ7Z0JBQzNELDhEQUE4RDtnQkFDOUQsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7Z0JBQ3BCLFdBQVcsSUFBSSxLQUFLLENBQUM7WUFDekIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsd0NBQXdDO1FBQ3hDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsVUFBQyxLQUFLLEVBQUUsV0FBVztZQUMzQyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDO1lBQzNELEVBQUUsU0FBUyxDQUFDO1lBQ1osRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBQ2hELElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBQ2xDLGdCQUFnQjtZQUNoQixDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3JFLHlCQUF5QjtZQUN6QixPQUFPLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQztZQUN4RCxtREFBbUQ7WUFDbkQsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDM0IsZUFBZSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxlQUFlLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM5RCxlQUFlLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDNUMsd0NBQXdDO1lBQ3hDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDM0MsQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3RCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdkUsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDakUsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLENBQUMsS0FBSyxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDN0UsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLDBDQUEwQztnQkFDMUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxjQUFBLDBCQUEwQixDQUFDLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU5RixFQUFFLENBQUMsQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUMxQiwwRUFBMEU7WUFDMUUsd0RBQXdEO1FBQzVELENBQUM7UUFDRCw4QkFBOEIsRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRDtRQUNJLEVBQUUsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztZQUNoQyxZQUFZLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBQ0QsNkJBQTZCLEdBQUcsVUFBVSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMxRixDQUFDO0lBTGUsNENBQThCLGlDQUs3QyxDQUFBO0lBR0Q7UUFDSSxFQUFFLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7WUFDMUIsWUFBWSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUNELHVCQUF1QixHQUFHLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0UsQ0FBQztJQUxlLHFDQUF1QiwwQkFLdEMsQ0FBQTtJQUdELGdHQUFnRztJQUNoRyw2RkFBNkY7SUFDN0YsK0VBQStFO0lBQy9FLG1DQUFtQyxLQUFjO1FBRTdDLDBGQUEwRjtRQUMxRixrREFBa0Q7UUFDbEQsdUJBQXVCLEVBQUUsQ0FBQztRQUUxQixrRUFBa0U7UUFDbEUsd0RBQXdEO1FBQ3hELHVCQUF1QjtRQUN2QixFQUFFLENBQUMsQ0FBQyxjQUFBLDBCQUEwQixDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV4RCxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDdkMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQzNDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUMzQyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUNsRCxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDbkMsMkRBQTJEO1lBQzNELElBQUksYUFBYSxHQUFHLGNBQUEsMEJBQTBCLENBQUMseUJBQXlCLEVBQUUsQ0FBQztZQUMzRSx5QkFBeUIsR0FBRyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNsRSxtQkFBbUIsR0FBRyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUUxRCxxR0FBcUc7UUFDckcsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNuQyw4REFBOEQ7WUFDOUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLEdBQUMsR0FBRyxHQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEQsTUFBTSxDQUFDO1lBQ1gsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLGtCQUFrQixHQUFHLElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDOUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFCLGNBQUEsY0FBYyxHQUFHLElBQUksY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDNUQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLGNBQUEsY0FBYyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDdEMsQ0FBQztZQUNELGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUNwQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osbUJBQW1CLEVBQUUsQ0FBQztZQUN0QixFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDNUIsa0JBQWtCLENBQUMsV0FBVyxHQUFDLEdBQUcsR0FBQyxZQUFZLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDN0QsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUM1QyxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFHRDtRQUNJLElBQUksWUFBZ0MsRUFBRSxhQUFxQixFQUFFLGNBQXNCLEVBQy9FLGVBQXdCLEVBQUUsZ0JBQXlCLEVBQUUsY0FBdUIsQ0FBQztRQUNqRixzREFBc0Q7UUFFdEQsd0VBQXdFO1FBQ3hFLDBEQUEwRDtRQUMxRCxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN6QixDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25DLEVBQUUsQ0FBQyxDQUFDLGNBQUEsY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDakIsWUFBWSxHQUFHLGNBQUEsY0FBYyxDQUFDLDJCQUEyQixFQUFFLENBQUM7WUFDaEUsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDdEIsQ0FBQztZQUNELGFBQWEsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2hFLGNBQWMsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxDQUFDLHNCQUFzQixDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ3ZFLGVBQWUsR0FBRyxDQUFDLGFBQWEsSUFBSSxDQUFDLGNBQWMsQ0FBQztZQUNwRCxnREFBZ0Q7WUFDaEQsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDMUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDdEQsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztnQkFDbkIsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztvQkFDaEIsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsR0FBRyxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsQ0FBQztnQkFDckYsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO29CQUNqQixZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxHQUFHLGVBQWUsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxDQUFDO2dCQUNuRyxDQUFDO2dCQUNELElBQUksV0FBVyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxDQUFDO1lBQ3RELENBQUM7UUFDTCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUNELG9EQUFvRDtRQUNwRCxvRkFBb0Y7UUFDcEYsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDNUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDckMsQ0FBQztRQUNMLENBQUM7UUFFRCxtRUFBbUU7UUFDbkUsZ0JBQWdCLEdBQUcsa0JBQWtCLEVBQUUsQ0FBQztRQUN4QyxFQUFFLENBQUMsQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUNoRCxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMvQixDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM3Qix3QkFBd0IsR0FBRyxLQUFLLENBQUM7UUFDckMsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixJQUFJLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUN2RCxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMvQixDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM3Qix3QkFBd0IsR0FBRyxJQUFJLENBQUM7UUFDcEMsQ0FBQztRQUVELHdFQUF3RTtRQUN4RSxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN6QixnQkFBZ0IsR0FBRyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3hDLGNBQWMsR0FBRyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDbkUsRUFBRSxDQUFDLENBQUMsY0FBYyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO2dCQUN0QyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDakQsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFHRDtRQUNJLElBQUksVUFBVSxHQUFXLENBQUMsRUFBRSxXQUFXLEdBQVcsQ0FBQyxDQUFDO1FBQ3BELFVBQVUsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDcEMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFDLENBQUMsRUFBRSxDQUFDLElBQU8sV0FBVyxJQUFJLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsVUFBVSxHQUFHLFdBQVcsQ0FBQztJQUNwQyxDQUFDO0lBR0Q7UUFFSSxJQUFJLG1CQUFtQixHQUFHLENBQUMsRUFDdkIsZUFBZSxHQUFHLENBQUMsRUFDbkIsUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUVsQixDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTVDLCtDQUErQztRQUMvQyxFQUFFLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUksdUNBQXVDO1lBQzlFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEMsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUVELENBQUMsQ0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsVUFBQyxDQUFDLEVBQUUsYUFBYTtZQUUvQyxJQUFJLE9BQU8sR0FBMEIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUN6RSxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUNyRCxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDO1lBQzFFLGVBQWUsSUFBSSxNQUFNLENBQUM7WUFFMUIsRUFBRSxDQUFDLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDOUIsTUFBTSxDQUFDLENBQUMsdUNBQXVDO1lBQ25ELENBQUM7WUFFRCxtQkFBbUIsSUFBSSxNQUFNLENBQUM7WUFDOUIsS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM1QyxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3RDLFFBQVEsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDOUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDbEIsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7WUFFckIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUUvQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxHQUFHLGVBQWUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQzVDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxDQUFDO1lBRUQsRUFBRSxDQUFDLENBQUMsd0JBQXdCLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDL0IsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzVCLG1DQUFtQztnQkFDbkMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDakMsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JELHlCQUF5QjtnQkFDekIsZUFBZSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN6QyxtQ0FBbUM7Z0JBQ25DLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxJQUFJLElBQUksS0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ3hDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO2dCQUMvQixDQUFDO2dCQUNELENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixJQUFJLEtBQUssR0FBRyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3BELEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNkLGdCQUFnQixDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ2xDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO2dCQUNoRCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLDZCQUE2QjtvQkFDN0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ25DLENBQUM7WUFDTCxDQUFDO1lBRUQsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDeEMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDL0IsQ0FBQztZQUNELE9BQU8sR0FBRztnQkFDTixTQUFTLEVBQUUsT0FBTztnQkFDbEIsTUFBTSxFQUFFLE9BQU87Z0JBQ2YsTUFBTSxFQUFFLElBQUk7Z0JBQ1osT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsVUFBVSxFQUFFLFFBQVE7YUFDdkIsQ0FBQztZQUNGLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNuRSxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDO1FBRUgsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyx5QkFBeUIsQ0FBQyxDQUFDO1FBRXpFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFN0Isd0JBQXdCLEVBQUUsQ0FBQztRQUMzQixtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU3QyxJQUFJLFdBQVcsR0FBSSxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFM0QsaUJBQWlCO1FBQ2pCLElBQUksUUFBUSxHQUFHO1lBQ1gsV0FBVyxFQUFFLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7WUFDcEQsYUFBYSxFQUFFLGdCQUFnQixDQUFDLFdBQVc7WUFDM0MsbUJBQW1CLEVBQUUsZ0JBQWdCLENBQUMsZ0JBQWdCO1lBQ3RELGFBQWEsRUFBRSxnQkFBZ0IsQ0FBQyxlQUFlO1lBQy9DLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxXQUFXO1lBQ3BDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxpQkFBaUI7WUFDMUMsY0FBYyxFQUFFLFFBQVE7WUFDeEIsaUJBQWlCLEVBQUUsV0FBVztZQUM5QixLQUFLLEVBQUUsR0FBRztZQUNWLE1BQU0sRUFBRSxHQUFHO1NBQ2QsQ0FBQztRQUVGLEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQzdCLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzRCxnQkFBZ0IsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxZQUFZLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEQsSUFBSSxDQUFDLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoRCxJQUFJLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEUscUJBQXFCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWSxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDdkMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQyxHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2RSxxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsQ0FBQztJQUNMLENBQUM7SUFHRDs7O09BR0c7SUFDSCx5QkFBeUIsU0FBa0I7UUFDdkMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsVUFBUyxRQUFlO1lBQ3RDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDaEQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFBO0lBQ04sQ0FBQztJQUdEOzs7T0FHRztJQUNILDZCQUE2QixNQUFNO1FBQy9CLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQVMsS0FBSztZQUN6QixJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDO2dCQUNmLElBQUksU0FBUyxHQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3RDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDYixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDbkMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBR0Q7Ozs7T0FJRztJQUNILHdCQUF3QixNQUFNO1FBQzFCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFVBQVMsS0FBSztZQUN6QixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDL0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLEtBQUssRUFBRSxDQUFDO1lBQ1osQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBR0Q7Ozs7O09BS0c7SUFDSCxrQkFBa0IsTUFBZSxFQUFFLEtBQUs7UUFDcEMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBUyxLQUFZO1lBQ2hDLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFHRDs7T0FFRztJQUNILGtCQUFrQixRQUFRLEVBQUUsU0FBUztRQUNqQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekIsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BCLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFVBQVMsUUFBWTtZQUNuQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RDLEdBQUcsRUFBRSxDQUFBO1lBQ1QsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDWCxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMseURBQXlEO2dCQUN6RSxrRUFBa0UsQ0FBQyxDQUFDO1FBQzVFLENBQUM7SUFDTCxDQUFDO0lBR0Q7O09BRUc7SUFDSCx5QkFBeUIsS0FBSztRQUMxQixJQUFJLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDcEIsR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNyQixFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hELFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNyQyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDdEMsQ0FBQztRQUNMLENBQUM7UUFDRCxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLElBQUksR0FBRyxHQUFPLENBQUMsQ0FBQztZQUNoQixJQUFJLE9BQVcsQ0FBQztZQUNoQixFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsR0FBRyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEIsT0FBTyxHQUFHLEdBQUcsQ0FBQztZQUNsQixDQUFDO1FBQ0wsQ0FBQztRQUNELE1BQU0sQ0FBQyxPQUFPLENBQUM7SUFDbkIsQ0FBQztJQUVEOzs7UUFHSTtJQUNKLCtCQUFzQyxRQUFRLEVBQUUsR0FBRztRQUUvQyxJQUFJLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsRUFDOUMsTUFBTSxHQUFHO1lBQ0wsYUFBYSxFQUFFLHdCQUF3QjtZQUN2QyxHQUFHLEVBQUUsaUJBQWlCO1lBQ3RCLE1BQU0sRUFBRSxpQkFBaUI7U0FDNUIsRUFDRCxXQUFXLEdBQUc7WUFDVixNQUFNLEVBQUUsTUFBTTtZQUNkLE1BQU0sRUFBRSxHQUFHO1lBQ1gsYUFBYSxFQUFFLGFBQWE7U0FDL0IsRUFDRCxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLEVBQzNELE1BQU0sR0FBRyxFQUFFLEVBQ1gsbUJBQW1CLEdBQUcsRUFBRSxFQUN4QixJQUFJLEdBQUcsRUFBRSxFQUNULElBQUksRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFDakUsYUFBYSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVSxDQUFDO1FBRTlELElBQUksSUFBSSxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVyQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNkLElBQUksT0FBTyxHQUFTLEVBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2lCQUM5QixHQUFHLENBQUMsVUFBVSxDQUFLO2dCQUNoQixNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25CLENBQUMsQ0FBQztpQkFDRCxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUVoQyxJQUFJLGdCQUFnQixHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUNsRCxJQUFJLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDekQsSUFBSSxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5RSxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7WUFDN0QsRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxtRUFBbUUsQ0FBQyxDQUFDO2dCQUM3RixDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxQixDQUFDO1lBQ0QsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDckYsQ0FBQztRQUNELHVCQUF1QjtRQUN2QixNQUFNLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUU7YUFDdEIsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUUvQywyQkFBMkI7UUFDM0IsUUFBUSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFOUIsNkZBQTZGO1FBQzdGLE1BQU0sR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRTVCLHFCQUFxQjtRQUNyQixDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUU7YUFDaEIsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWpDLEdBQUcsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7YUFDaEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUM7YUFDekIsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV6QixJQUFJLFVBQVUsR0FBRyxJQUFJLEtBQUssR0FBRyxHQUFHLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDO1FBQ2pFLElBQUksR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFO2FBQ2YsR0FBRyxDQUFDLFVBQVUsQ0FBSztZQUNoQixNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNwQixDQUFDLENBQUM7YUFDRCxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFekIsbURBQW1EO1FBQ25ELEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsOENBQThDO2dCQUN0RSxZQUFZLENBQUMsQ0FBQztZQUVkLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUMvQixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUVELEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO2lCQUM3QixHQUFHLENBQUMsVUFBVSxDQUFLO2dCQUNoQixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNmLENBQUMsQ0FBQztpQkFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBSztnQkFDcEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUs7b0JBQ25DLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNmLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNQLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNmLG9EQUFvRDtZQUNwRCxNQUFNLEdBQVMsRUFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7aUJBQ3hCLEdBQUcsQ0FBQyxVQUFVLENBQUs7Z0JBQ2hCLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkIsQ0FBQyxDQUFDO2lCQUNELEdBQUcsQ0FBQyxVQUFVLENBQUs7Z0JBQ2hCLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQztpQkFDRCxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixvREFBb0Q7WUFDcEQsTUFBTSxHQUFTLEVBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2lCQUNwQixHQUFHLENBQUMsVUFBVSxDQUFLO2dCQUNoQixNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25CLENBQUMsQ0FBQztpQkFDRCxHQUFHLENBQUMsVUFBVSxDQUFLO2dCQUNoQixNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUM7aUJBQ0QsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUdELDZDQUE2QztRQUM3QyxJQUFJLEdBQUcsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTVDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixNQUFNLENBQUMsR0FBRyxDQUFBO1FBQ2QsQ0FBQztRQUVELDZCQUE2QjtRQUM3QixTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFDLENBQUssSUFBSyxPQUFBLENBQUMsQ0FBQyxHQUFHLEVBQUwsQ0FBSyxDQUFDLENBQUM7UUFFdkMsZUFBZTtRQUNmLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBQyxJQUFLLE9BQUEsQ0FBQyxHQUFHLENBQUMsRUFBTCxDQUFLLENBQUMsQ0FBQztRQUVoQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFDLENBQUssSUFBSyxPQUFBLENBQUMsQ0FBQyxNQUFNLEVBQVIsQ0FBUSxDQUFDLENBQUM7UUFFeEMsU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFDLENBQUssSUFBSyxPQUFBLENBQUMsQ0FBQyxHQUFHLEVBQUwsQ0FBSyxDQUFDLENBQUM7UUFFM0Qsc0JBQXNCO1FBQ3RCLFlBQVksR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUMsQ0FBSyxJQUFLLE9BQUEsQ0FBQyxDQUFDLEdBQUcsRUFBTCxDQUFLLENBQUMsQ0FBQztRQUVoRCxrQkFBa0I7UUFDbEIsYUFBYSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBQyxJQUFLLE9BQUEsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBN0IsQ0FBNkIsQ0FBQyxDQUFDO1FBRTNFLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFekIsUUFBUSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV4RSxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXBFLGdCQUFnQjtRQUNoQixRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXBELCtCQUErQjtRQUMvQixHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLFFBQVEsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBRTVDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BCLENBQUM7WUFDRCwyQkFBMkI7WUFDM0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVUsQ0FBSztvQkFDckUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUs7d0JBQ25DLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNmLENBQUMsQ0FBQyxDQUFDO2dCQUNQLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVMLDJEQUEyRDtZQUMzRCxJQUFJLEdBQVMsRUFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7aUJBQ3RCLEdBQUcsQ0FBQyxVQUFVLENBQUs7Z0JBQ2hCLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkIsQ0FBQyxDQUFDO2lCQUNELEdBQUcsQ0FBQyxVQUFVLENBQUs7Z0JBQ2hCLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQztpQkFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBR2pDLG1EQUFtRDtZQUNuRCxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDZCxJQUFJLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RELElBQUksa0JBQWtCLEdBQUcsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQzlFLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztnQkFDN0QsSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVsQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDVixDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQzNCLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN0RCxRQUFRLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUMxQixpQkFBaUI7b0JBQ2xCLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ2hELEVBQUUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLGVBQWUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN0RCxNQUFNLENBQUMsR0FBRyxDQUFDO2dCQUNmLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ0osQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMxQixDQUFDO1lBQ0wsQ0FBQztZQUVELFlBQVk7WUFDWixFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDYixRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxPQUFPLEdBQUc7b0JBQ1YsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxLQUFLO29CQUNqQixDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssR0FBRyxFQUFFO29CQUN0QixDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssR0FBRyxHQUFHO29CQUN2QixDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssR0FBRyxHQUFHO2lCQUMxQixDQUFDO2dCQUNGLG1CQUFtQjtnQkFDbkIsUUFBUSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtZQUN6RSxDQUFDO1lBRUQsSUFBSSxPQUFPLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO2lCQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDO2lCQUNWLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7aUJBQ25CLElBQUksQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFLO2dCQUM5QixNQUFNLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ2hELENBQUMsQ0FBQyxDQUFDO1lBRVAsSUFBSSxZQUFZLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO2lCQUNwRCxJQUFJLENBQUMsVUFBVSxDQUFLO2dCQUNqQixNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUNwQixDQUFDLENBQUM7aUJBQ0QsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztpQkFDbkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUs7Z0JBQzlCLE1BQU0sQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDbEQsQ0FBQyxDQUFDLENBQUM7WUFFUCxJQUFJLGlCQUFpQixHQUFHLFlBQVksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO2lCQUNwRSxJQUFJLENBQUMsVUFBVSxDQUFLO2dCQUNqQixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkIsQ0FBQyxDQUFDO2lCQUNELEtBQUssRUFBRTtpQkFDUCxNQUFNLENBQUMsTUFBTSxDQUFDO2lCQUNkLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ1AsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDcEMsQ0FBQyxDQUFDO2lCQUNELElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ1AsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO1lBQ2hDLENBQUMsQ0FBQztpQkFDRCxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBRWxDLElBQUksUUFBUSxHQUFHLFlBQVksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztpQkFDbkQsSUFBSSxDQUFDLFVBQVUsQ0FBSztnQkFDakIsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDcEIsQ0FBQyxDQUFDO2lCQUNELEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7aUJBQ25CLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFLO2dCQUMxQixDQUFDLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUMsQ0FBQyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUN0QyxDQUFDLENBQUM7aUJBQ0YsSUFBSSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUs7Z0JBQzlCLE1BQU0sQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDaEQsQ0FBQyxDQUFDO2lCQUNELEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBUyxDQUFDO2dCQUN2QixFQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzdDLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFBO1lBQzVELENBQUMsQ0FBQztpQkFDRCxFQUFFLENBQUMsVUFBVSxFQUFFLFVBQVMsQ0FBQztnQkFDdEIsRUFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9DLENBQUMsQ0FBQyxDQUFDO1lBRVAsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO2lCQUMxQyxJQUFJLENBQUMsVUFBVSxDQUFLO2dCQUNqQixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNmLENBQUMsQ0FBQztpQkFDRCxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2lCQUN0QixJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztpQkFDckIsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7aUJBQ2pDLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFLO2dCQUN0QixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQixDQUFDLENBQUM7aUJBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUs7Z0JBQzNCLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsQ0FBQyxDQUFDO2lCQUNELEtBQUssQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFLO2dCQUMxQixNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQTtZQUNsQixDQUFDLENBQUM7aUJBQ0QsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV6QixZQUFZLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztpQkFDMUIsSUFBSSxDQUFDLFVBQVUsQ0FBSztnQkFDakIsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDcEIsQ0FBQyxDQUFDO2lCQUNELEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFLO2dCQUM1QixHQUFHLENBQUMsVUFBVSxFQUFFO3FCQUNYLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBRTNCLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsV0FBVyxHQUFHLElBQUk7c0JBQ3ZDLE9BQU8sR0FBRyxDQUFDLENBQUMsV0FBVyxHQUFHLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxHQUFHLE9BQU8sR0FBRyxJQUFJO29CQUMvRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUM7cUJBQ3BCLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBTyxFQUFFLENBQUMsS0FBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQztxQkFDN0MsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFPLEVBQUUsQ0FBQyxLQUFNLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQzNELENBQUMsQ0FBQztpQkFDRCxFQUFFLENBQUMsVUFBVSxFQUFFO2dCQUNaLEdBQUcsQ0FBQyxVQUFVLEVBQUU7cUJBQ1gsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixDQUFDLENBQUMsQ0FBQztZQUNQLGlCQUFpQjtZQUNqQixVQUFVLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRWhELEVBQUUsQ0FBQyxDQUFDLFVBQVUsR0FBRyxFQUFFLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLEVBQUUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLGVBQWUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFBO1lBQ3hELENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxVQUFVLEdBQUcsR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxlQUFlLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQTtZQUN4RCxDQUFDO1FBQ0wsQ0FBQztRQUNELENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQTdTZSxtQ0FBcUIsd0JBNlNwQyxDQUFBO0lBR0Q7OztPQUdHO0lBQ0gsNEJBQTRCLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU87UUFDMUQsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDZCxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDdEQsRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNyQyxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEQsUUFBUSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyQyxJQUFJLE1BQU0sR0FBSSxDQUFDLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdDLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0MsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQyxDQUFDO0lBQ0wsQ0FBQztJQUdEOzs7Ozs7T0FNRztJQUNILHlCQUF5QixJQUFJLEVBQUUsS0FBSztRQUVoQyxJQUFJLEtBQUssQ0FBQztRQUVWLEVBQUUsQ0FBQSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLHdCQUF3QixLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0UsS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQzNCLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksd0JBQXdCLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3pCLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxDQUFDO2dCQUNuQyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUMzQixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUN0Qiw2QkFBNkI7Z0JBQzdCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQy9DLGtDQUFrQztnQkFDbEMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQzdCLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2QyxDQUFDO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxLQUFLLElBQUksd0JBQXdCLEdBQUcsQ0FBRSxDQUFDLENBQUEsQ0FBQztZQUMvRixLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDNUMsa0NBQWtDO1lBQ3RDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUdEO1FBQ0ksSUFBSSxJQUFJLEdBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUdELHVCQUF1QixJQUFJLEVBQUUsTUFBTTtRQUMvQixJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUdELG1CQUEwQixLQUFZO1FBQ2xDLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDO1FBQ3pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEdBQUcsS0FBSyxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUNELElBQUksR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkIsY0FBYyxFQUFFLENBQUM7UUFDakIsYUFBYSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBRSxNQUFNLENBQUUsQ0FBQztJQUM3QyxDQUFDO0lBVmUsdUJBQVMsWUFVeEIsQ0FBQTtBQUNMLENBQUMsRUE3NEVTLGFBQWEsS0FBYixhQUFhLFFBNjRFdEI7QUFBQSxDQUFDO0FBSUY7SUFBNkIsa0NBQVE7SUFFakMsd0JBQVksWUFBNkI7ZUFDckMsa0JBQU0sWUFBWSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxvQ0FBVyxHQUFYO1FBQ0ksTUFBTSxDQUFDLDZEQUE2RCxDQUFDO0lBQ3pFLENBQUM7SUFFRCw4Q0FBcUIsR0FBckI7UUFDSSxNQUFNLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFDTCxxQkFBQztBQUFELENBQUMsQUFiRCxDQUE2QixRQUFRLEdBYXBDO0FBV0QsZ0ZBQWdGO0FBQ2hGO0lBQWlDLHNDQUFnQjtJQVM3QztRQUFBLFlBQ0ksaUJBQU8sU0FHVjtRQUZHLEtBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLEtBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUM7O0lBQ3pDLENBQUM7SUFFRCxpQ0FBSSxHQUFKO1FBQ0ksSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDbkMsaUJBQU0sSUFBSSxXQUFFLENBQUM7SUFDakIsQ0FBQztJQUVELCtGQUErRjtJQUMvRix5Q0FBWSxHQUFaO1FBQ0ksSUFBSSxFQUFFLEdBQUcsYUFBYSxDQUFDLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDO1FBQ3ZFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDTCxNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUNELE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBRUQsNkZBQTZGO0lBQzdGLFdBQVc7SUFDWCx3Q0FBVyxHQUFYLFVBQVksUUFBaUI7UUFFekIsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDL0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLHdCQUF3QixJQUFJLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3pFLENBQUMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FDeEQsOEJBQThCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxDQUFDO1FBQzdFLENBQUM7SUFDTCxDQUFDO0lBRUQsOEZBQThGO0lBQzlGLDJCQUEyQjtJQUMzQiw0Q0FBZSxHQUFmO1FBQ0ksTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQseUNBQXlDO0lBQ3pDLDRDQUFlLEdBQWY7UUFDSSxNQUFNLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxRQUFRLEVBQUU7WUFDbkMsYUFBYSxFQUFFLENBQUM7U0FDbkIsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELHdEQUEyQixHQUEzQjtRQUNJLElBQUksUUFBUSxHQUFPLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsdUJBQXVCLEdBQUcsRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxPQUFPLENBQUMsVUFBQyxPQUFPO1lBQ2hDLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLEVBQUUsRUFBRSxVQUFDLE1BQU0sSUFBTyxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7UUFDSCxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFFRCxvREFBdUIsR0FBdkI7UUFDSSxJQUFJLFNBQVMsR0FBVSxDQUFDLENBQUM7UUFDekIsa0RBQWtEO1FBQ2xELFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsTUFBTSxDQUFDLFVBQUMsSUFBVyxFQUFFLE9BQU87WUFDeEQsSUFBSSxLQUFLLEdBQTBDLE9BQU8sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQztZQUNuRyxrREFBa0Q7WUFDbEQsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxZQUFZLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztZQUNuQyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDO2dCQUNoQyxtREFBbUQ7Z0JBQ25ELFlBQVksR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLFVBQUMsSUFBVyxFQUFFLFNBQVM7b0JBQ2xELElBQUksTUFBTSxHQUFPLE9BQU8sQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLEVBQzVDLE9BQU8sR0FBTyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUNyQyxhQUFhLENBQUM7b0JBQ2xCLDhEQUE4RDtvQkFDOUQsYUFBYSxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBQyxJQUFXLEVBQUUsS0FBSzt3QkFDN0QsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN2QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ04sTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxDQUFDO2dCQUN6QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ04sS0FBSyxDQUFDLFNBQVMsR0FBRyxZQUFZLENBQUM7WUFDbkMsQ0FBQztZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN4QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDTixtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFNBQVMsSUFBSSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVPLDBDQUFhLEdBQXJCLFVBQXNCLEtBQVM7UUFDM0IsNEZBQTRGO1FBQzVGLHVGQUF1RjtRQUN2RixjQUFjO1FBQ2QsSUFBSSxLQUFLLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQztRQUNoQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3BDLENBQUM7UUFDRCxNQUFNLENBQUMsRUFBRSxDQUFDO0lBQ2QsQ0FBQztJQUVPLHlDQUFZLEdBQXBCLFVBQXFCLEtBQVU7UUFDM0IsSUFBSSxLQUFLLEVBQUUsSUFBSSxDQUFDO1FBQ2hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ25DLENBQUM7UUFDTCxDQUFDO1FBQ0QsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUNkLENBQUM7SUFFTyxxREFBd0IsR0FBaEMsVUFBaUMsS0FBUztRQUN0QyxzRkFBc0Y7UUFDdEYsSUFBSSxLQUFLLEVBQUUsWUFBWSxDQUFDO1FBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQy9DLENBQUM7UUFDTCxDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmLENBQUM7SUFFTyxrREFBcUIsR0FBN0IsVUFBOEIsS0FBUztRQUNuQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDckMsQ0FBQztJQUVELDJEQUEyRDtJQUMzRCw2Q0FBZ0IsR0FBaEI7UUFBQSxpQkFrRUM7UUFqRUcsNkNBQTZDO1FBQzdDLElBQUksZUFBZSxHQUF3QixJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLFVBQUMsRUFBRSxFQUFFLEtBQUs7WUFDbEYsSUFBSSxNQUFNLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEdBQUcsS0FBSyxFQUFFLGVBQWUsR0FBRyxFQUFFLEVBQUU7Z0JBQzNELE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSTtnQkFDbkIsV0FBVyxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxFQUFFLEdBQUc7Z0JBQ1gsUUFBUSxFQUFFLEtBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLENBQUM7Z0JBQzNDLFdBQVcsRUFBRSxDQUFDO2FBQ2pCLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO1FBRUgsK0RBQStEO1FBQy9ELElBQUksUUFBUSxHQUF3QjtZQUNoQyxJQUFJLGtCQUFrQixDQUFDLENBQUMsRUFBRSxhQUFhLEVBQUU7Z0JBQ3JDLE1BQU0sRUFBRSxZQUFZO2dCQUNwQixXQUFXLEVBQUUsQ0FBQztnQkFDZCxRQUFRLEVBQUUsSUFBSSxDQUFDLGFBQWE7YUFDL0IsQ0FBQztZQUNGLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFLGdCQUFnQixFQUFFO2dCQUN4QyxNQUFNLEVBQUUsTUFBTTtnQkFDZCxXQUFXLEVBQUUsQ0FBQztnQkFDZCxRQUFRLEVBQUUsSUFBSSxDQUFDLFlBQVk7YUFDOUIsQ0FBQztTQUNMLENBQUM7UUFFRixvRkFBb0Y7UUFDcEYsSUFBSSxXQUFXLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDO1FBQzNELElBQUksU0FBUyxHQUFHO1lBQ1osSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUU7Z0JBQ2xELE1BQU0sRUFBRSxhQUFhO2dCQUNyQixXQUFXLEVBQUUsQ0FBQzthQUNqQixDQUFDO1lBQ0YsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUU7Z0JBQ2xELE1BQU0sRUFBRSxPQUFPO2dCQUNmLFdBQVcsRUFBRSxDQUFDO2FBQ2pCLENBQUM7WUFDRixJQUFJLGtCQUFrQixDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRTtnQkFDbEQsTUFBTSxFQUFFLE9BQU87Z0JBQ2YsV0FBVyxFQUFFLENBQUM7YUFDakIsQ0FBQztZQUNGLDZFQUE2RTtZQUM3RSxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxrQkFBa0IsQ0FDbEQsRUFBRSxXQUFXLEVBQ2IsY0FBYyxFQUNkO2dCQUNJLE1BQU0sRUFBRSxpQkFBaUI7Z0JBQ3pCLFdBQVcsRUFBRSxDQUFDO2FBQ2pCLENBQ0o7WUFDRCxJQUFJLGtCQUFrQixDQUFDLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFO2dCQUN6RCxNQUFNLEVBQUUsY0FBYztnQkFDdEIsV0FBVyxFQUFFLENBQUM7Z0JBQ2QsUUFBUSxFQUFFLElBQUksQ0FBQyx3QkFBd0I7Z0JBQ3ZDLFdBQVcsRUFBRSxDQUFDO2FBQ2pCLENBQUM7WUFDRixJQUFJLGtCQUFrQixDQUFDLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixFQUFFO2dCQUNyRCxNQUFNLEVBQUUsZUFBZTtnQkFDdkIsV0FBVyxFQUFFLENBQUM7Z0JBQ2QsUUFBUSxFQUFFLElBQUksQ0FBQyxxQkFBcUI7Z0JBQ3BDLFdBQVcsRUFBRSxDQUFDO2FBQ2pCLENBQUM7U0FDTCxDQUFDO1FBRUYsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFTyxxREFBd0IsR0FBaEMsVUFBaUMsRUFBRTtRQUMvQixNQUFNLENBQUMsVUFBQyxDQUFDO1lBQ0wsSUFBSSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvQixFQUFFLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1lBQ0QsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUNkLENBQUMsQ0FBQTtJQUNMLENBQUM7SUFFRCwrRkFBK0Y7SUFDL0YseUZBQXlGO0lBQ3pGLHlHQUF5RztJQUN6RyxpRkFBaUY7SUFDekUsNkNBQWdCLEdBQXhCLFVBQXlCLEtBQUs7UUFDMUIsSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsR0FBVSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBWSxFQUFFLENBQUMsQ0FBQyxNQUFNO1lBQ2xDLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBUSxFQUFFLENBQUMsQ0FBQyxNQUFNO1lBQ2xDLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzNDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFVLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUksSUFBSSxDQUFDLENBQUM7UUFDckUsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxtREFBc0IsR0FBdEIsVUFBdUIsUUFBMkIsRUFBRSxLQUFZO1FBQzVELElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JFLElBQUksYUFBYSxHQUFHO1lBQ2hCLCtEQUErRCxHQUFHLEtBQUssR0FBRyxvQkFBb0I7WUFDOUYsMkJBQTJCLEdBQUcsS0FBSyxHQUFHLDBCQUEwQjtTQUNuRSxDQUFDO1FBRUYsdUJBQXVCO1FBQ3ZCLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBRTNELGdFQUFnRTtRQUNoRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQzFELGFBQWEsQ0FBQyxJQUFJLENBQUMsdUNBQXVDLEdBQUMsS0FBSyxHQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDaEgsQ0FBQztRQUNELE1BQU0sQ0FBQztZQUNILElBQUksZ0JBQWdCLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRTtnQkFDbEMsY0FBYyxFQUFFLFNBQVM7Z0JBQ3pCLGdCQUFnQixFQUFFLFVBQUMsRUFBRSxJQUFPLE1BQU0sQ0FBQyxPQUFPLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlELGVBQWUsRUFBRSxhQUFhO2dCQUM5QixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsUUFBUSxFQUFFLElBQUk7Z0JBQ2QsU0FBUyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7Z0JBQzNDLGVBQWUsRUFBRSxNQUFNLENBQUMsSUFBSTthQUMvQixDQUFDO1NBQ0wsQ0FBQztJQUNOLENBQUM7SUFFRCxrREFBcUIsR0FBckIsVUFBc0IsUUFBNEIsRUFBRSxLQUFhO1FBQzdELElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQztZQUNILElBQUksZ0JBQWdCLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRTtnQkFDbEMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7Z0JBQzNDLGVBQWUsRUFBRSxJQUFJLENBQUMsSUFBSTthQUM3QixDQUFDO1NBQ0wsQ0FBQztJQUNOLENBQUM7SUFFRCwrREFBa0MsR0FBbEMsVUFBbUMsRUFBRTtRQUNqQyxNQUFNLENBQUMsVUFBQyxRQUEyQixFQUFFLEtBQVk7WUFDN0MsSUFBSSxVQUFVLEdBQUcsRUFBRSxFQUFFLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JGLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckUsVUFBVSxHQUFHLENBQUUsSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3JGLENBQUM7WUFDRCxNQUFNLENBQUM7Z0JBQ0gsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO29CQUNsQyxTQUFTLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQztvQkFDM0MsZUFBZSxFQUFFLFVBQVU7aUJBQzlCLENBQUM7YUFDTCxDQUFDO1FBQ04sQ0FBQyxDQUFBO0lBQ0wsQ0FBQztJQUVPLHFEQUF3QixHQUFoQyxVQUFpQyxRQUEyQixFQUFFLEtBQVksRUFDbEUsR0FBTztRQUNYLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxHQUFHLEVBQUUsRUFDMUMsT0FBTyxHQUFHLGNBQXVCLE9BQUEsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQXJDLENBQXFDLENBQUM7UUFFM0UsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUMxQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQW1CLENBQUMsUUFBUSxFQUFFLEtBQUssRUFDMUMsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLDBFQUEwRTtnQkFDMUUsS0FBSyxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztxQkFDNUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztxQkFDN0IsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQzVDLENBQUM7UUFDTCxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUMxQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQW1CLENBQUMsUUFBUSxFQUFFLEtBQUssRUFDOUMsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0MsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLDBFQUEwRTtnQkFDMUUsS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztxQkFDNUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztxQkFDN0IsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7UUFDTCxDQUFDO1FBQ0QsOERBQThEO1FBQzlELEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDMUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3pELENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUM1RCxDQUFDO1FBQ0wsQ0FBQztRQUNELHlEQUF5RDtRQUN6RCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLGlCQUFpQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ25ELENBQUM7UUFDTCxDQUFDO1FBQ0QsMERBQTBEO1FBQzFELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDaEIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ2Ysa0RBQWtEO2dCQUNsRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksbUJBQW1CLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDbkIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25DLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNMLENBQUM7UUFDRCxNQUFNLENBQUMsS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRCx5REFBNEIsR0FBNUIsVUFBNkIsUUFBMkIsRUFBRSxLQUFZO1FBQ2xFLE1BQU0sQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRTtZQUN0RCxtQkFBbUIsRUFBRSxVQUFDLFNBQVM7Z0JBQzNCLElBQUksT0FBTyxHQUFPLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEVBQ3hELEtBQUssR0FBTyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDN0QsTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztZQUN6RCxDQUFDO1lBQ0QscUJBQXFCLEVBQUUsVUFBQyxDQUFLLEVBQUUsQ0FBSztnQkFDaEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDdkQsTUFBTSxDQUFDLENBQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QyxDQUFDO1lBQ0QsdUJBQXVCLEVBQUUsVUFBQyxLQUFLO2dCQUMzQixNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBRTtvQkFDNUMsYUFBYSxFQUFFLElBQUk7b0JBQ25CLGNBQWMsRUFBRSxlQUFlO29CQUMvQixnQkFBZ0IsRUFBRSxjQUFRLE1BQU0sQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUN4RSxlQUFlLEVBQUUsS0FBSyxDQUFDLElBQUk7aUJBQzlCLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxrQkFBa0IsRUFBRSxVQUFDLEdBQVM7Z0JBQzFCLE1BQU0sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7b0JBQzNDLGVBQWUsRUFBRSxzQkFBc0I7aUJBQ3hDLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxlQUFlLEVBQUUsVUFBQyxHQUFTO2dCQUN2QixNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO29CQUMzQyxlQUFlLEVBQUUsaUJBQWlCO2lCQUNuQyxDQUFDLENBQUM7WUFDUCxDQUFDO1lBQ0QsT0FBTyxFQUFFLGNBQU0sT0FBQSxJQUFJLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7Z0JBQ2pELGVBQWUsRUFBRSx3QkFBd0I7YUFDNUMsQ0FBQyxFQUZhLENBRWI7U0FDTCxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsK0NBQWtCLEdBQWxCLFVBQW1CLFFBQTJCLEVBQUUsS0FBWTtRQUN4RCxNQUFNLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7WUFDdEQsbUJBQW1CLEVBQUUsVUFBQyxTQUFTO2dCQUMzQixJQUFJLE9BQU8sR0FBTyxPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUN4RCxLQUFLLEdBQU8sT0FBTyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQ3hELElBQUksR0FBTyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3hELE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ2xGLENBQUM7WUFDRCxxQkFBcUIsRUFBRSxVQUFDLENBQUssRUFBRSxDQUFLO2dCQUNoQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN2RCxNQUFNLENBQUMsQ0FBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7WUFDRCx1QkFBdUIsRUFBRSxVQUFDLEtBQUs7Z0JBQzNCLE1BQU0sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7b0JBQ3pDLGVBQWUsRUFBRSxLQUFLLENBQUMsSUFBSTtpQkFDOUIsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUNELGtCQUFrQixFQUFFLFVBQUMsR0FBUztnQkFDMUIsTUFBTSxDQUFDLElBQUksZ0JBQWdCLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRTtvQkFDM0MsZUFBZSxFQUFFLE1BQU07aUJBQ3hCLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxlQUFlLEVBQUUsVUFBQyxHQUFTO2dCQUN2QixNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO29CQUMzQyxlQUFlLEVBQUUsRUFBRSxDQUFDLCtDQUErQztpQkFDcEUsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztTQUNKLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCwrQ0FBa0IsR0FBbEIsVUFBbUIsUUFBMkIsRUFBRSxLQUFZO1FBQ3hELG1GQUFtRjtRQUNuRixJQUFJLFdBQVcsR0FBRyxVQUFDLElBQVcsRUFBRSxTQUFTO1lBQ3JDLElBQUksT0FBTyxHQUFPLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDN0QsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2hELENBQUMsQ0FBQztRQUNGLE1BQU0sQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRTtZQUN0RCxtQkFBbUIsRUFBRSxVQUFDLFNBQVM7Z0JBQzNCLElBQUksT0FBTyxHQUFPLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEVBQ3hELEtBQUssR0FBTyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDN0QsTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBQzdFLENBQUM7WUFDRCxxQkFBcUIsRUFBRSxVQUFDLENBQUssRUFBRSxDQUFLO2dCQUNoQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN2RCxNQUFNLENBQUMsQ0FBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7WUFDRCx1QkFBdUIsRUFBRSxVQUFDLEtBQUs7Z0JBQzNCLE1BQU0sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7b0JBQ3pDLGVBQWUsRUFBRSxDQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2lCQUM3RSxDQUFDLENBQUM7WUFDUCxDQUFDO1lBQ0Qsa0JBQWtCLEVBQUUsVUFBQyxHQUFTO2dCQUMxQixNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO29CQUN6QyxlQUFlLEVBQUUsQ0FBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztpQkFDcEUsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUNELGVBQWUsRUFBRSxVQUFDLEdBQVM7Z0JBQ3ZCLE1BQU0sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7b0JBQ3pDLGVBQWUsRUFBRSxDQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2lCQUNwRSxDQUFDLENBQUM7WUFDUCxDQUFDO1NBQ0osQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELHdEQUEyQixHQUEzQixVQUE0QixRQUEyQixFQUFFLEtBQVk7UUFDakUsSUFBSSxvQkFBb0IsR0FBRyxVQUFDLEdBQVM7WUFDN0IsSUFBSSxZQUFZLEVBQUUsR0FBRyxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsRUFBRSxDQUFDO1lBQzNDLDhDQUE4QztZQUM5QyxHQUFHLENBQUMsT0FBTyxDQUFDLFVBQUMsU0FBUztnQkFDbEIsSUFBSSxPQUFPLEdBQU8sT0FBTyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsRUFDeEQsTUFBTSxHQUFnQixPQUFPLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFDLEtBQWdCO29CQUM1QixTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDckQsMkVBQTJFO29CQUMzRSxFQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNILGtDQUFrQztZQUNsQyxZQUFZLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsVUFBQyxLQUFLLEVBQUUsR0FBRyxJQUFLLE9BQUEsQ0FBQyxDQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBRSxDQUFDLEVBQWhDLENBQWdDLENBQUMsQ0FBQztZQUNsRixzQkFBc0I7WUFDdEIsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLEdBQUcsR0FBRyxRQUFRLENBQUMsOEJBQThCLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO2dCQUMzQyxlQUFlLEVBQUUsR0FBRzthQUNyQixDQUFDLENBQUM7UUFDUCxDQUFDLENBQUM7UUFDTixNQUFNLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7WUFDdEQsbUJBQW1CLEVBQUUsVUFBQyxTQUFTO2dCQUMzQixJQUFJLE9BQU8sR0FBTyxPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUN4RCxLQUFLLEdBQU8sT0FBTyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzdELE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUM3RSxDQUFDO1lBQ0QscUJBQXFCLEVBQUUsVUFBQyxDQUFLLEVBQUUsQ0FBSztnQkFDaEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDdkQsTUFBTSxDQUFDLENBQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QyxDQUFDO1lBQ0QsdUJBQXVCLEVBQUUsVUFBQyxLQUFLO2dCQUMzQixJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxJQUFJLEVBQUUsRUFDN0IsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxHQUFHLFFBQVEsR0FBRyxFQUFFLEVBQzdDLE1BQU0sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sSUFBSSxFQUFFLEVBQ25DLEdBQUcsR0FBRyxRQUFRLENBQUMsOEJBQThCLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNsRSxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO29CQUN6QyxlQUFlLEVBQUUsR0FBRztpQkFDdkIsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUNELGtCQUFrQixFQUFFLG9CQUFvQjtZQUN4QyxlQUFlLEVBQUUsb0JBQW9CO1NBQ3hDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxzREFBeUIsR0FBekIsVUFBMEIsUUFBMkIsRUFBRSxLQUFZO1FBQy9ELElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3BDLElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDO1lBQ0gsSUFBSSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFO2dCQUNsQyxTQUFTLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQztnQkFDM0MsZUFBZSxFQUFFLE9BQU8sR0FBRyxPQUFPLENBQUMsUUFBUSxHQUFHLEdBQUc7YUFDcEQsQ0FBQztTQUNMLENBQUM7SUFDTixDQUFDO0lBRUQsMERBQTZCLEdBQTdCLFVBQThCLFFBQTJCLEVBQUUsS0FBWTtRQUNuRSxNQUFNLENBQUM7WUFDSCxJQUFJLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUU7Z0JBQ2xDLFNBQVMsRUFBRSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO2dCQUMzQyxlQUFlLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQzthQUM1RSxDQUFDO1NBQ0wsQ0FBQztJQUNOLENBQUM7SUFFRCwyREFBOEIsR0FBOUIsVUFBK0IsTUFBTSxFQUFFLE1BQWE7UUFBcEQsaUJBaUNDO1FBaENHLElBQUksR0FBRyxHQUFHOzs7Ozs7Ozs7OztpREFXK0IsQ0FBQztRQUMxQyxJQUFJLEtBQUssR0FBRyxDQUFFLEdBQUcsQ0FBRSxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBQyxDQUFDLEVBQUMsQ0FBQyxJQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsS0FBSztZQUN4RCxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ2YsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDZixFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQ2hELEVBQUUsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0QyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxFQUFFLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNiLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLEVBQUUsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BFLE1BQU0sQ0FBQztZQUNYLENBQUM7WUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxFQUFFLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvRixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLHVCQUF1QixFQUFFLEVBQUUsRUFBRSxlQUFlLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0YsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyQixNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQscUZBQXFGO0lBQ3JGLDZDQUFnQixHQUFoQjtRQUFBLGlCQXlCQztRQXhCRyxJQUFJLFFBQTZCLEVBQzdCLFlBQWlDLEVBQ2pDLFNBQThCLEVBQzlCLE9BQU8sR0FBVSxDQUFDLENBQUM7UUFFdkIsUUFBUSxHQUFHO1lBQ1AsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUM7WUFDOUQsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUM7U0FDaEUsQ0FBQztRQUVGLFlBQVksR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLFVBQUMsRUFBRTtZQUMvQyxNQUFNLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFJLENBQUMsa0NBQWtDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxRixDQUFDLENBQUMsQ0FBQztRQUVILFNBQVMsR0FBRztZQUNSLElBQUksa0JBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLDRCQUE0QixDQUFDO1lBQ3BFLElBQUksa0JBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDO1lBQzFELElBQUksa0JBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDO1lBQzFELElBQUksa0JBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLDJCQUEyQixDQUFDO1lBQ25FLElBQUksa0JBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixDQUFDO1lBQ2pFLElBQUksa0JBQWtCLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLDZCQUE2QixDQUFDO1NBQ3hFLENBQUM7UUFFRixNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVELDRGQUE0RjtJQUM1RixrREFBcUIsR0FBckI7UUFDSSxJQUFJLFVBQVUsR0FBNkI7WUFDdkMsSUFBSSx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUN0RSxJQUFJLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxFQUFFLHNCQUFzQixFQUFFLEtBQUssRUFBRSxDQUFDO1NBQ3pFLENBQUM7UUFFRixJQUFJLGlCQUEyQyxDQUFDO1FBQ2hELGlCQUFpQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsVUFBQyxFQUFFLEVBQUUsS0FBSztZQUMzRCxJQUFJLE1BQU0sR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxJQUFJLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksYUFBYSxHQUE2QjtZQUMxQyxJQUFJLHVCQUF1QixDQUFDLGFBQWEsRUFBRSxFQUFFLHNCQUFzQixFQUFFLEtBQUssRUFBRSxDQUFDO1lBQzdFLElBQUksdUJBQXVCLENBQUMsT0FBTyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDdkUsSUFBSSx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUN2RSxJQUFJLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLEVBQUUsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDakYsSUFBSSx1QkFBdUIsQ0FBQyxjQUFjLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQztZQUN4RSxJQUFJLHVCQUF1QixDQUFDLGVBQWUsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDO1NBQzVFLENBQUM7UUFFRixNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQsaUVBQWlFO0lBQ2pFLDZFQUE2RTtJQUM3RSxnREFBZ0Q7SUFDaEQsc0RBQXlCLEdBQXpCLFVBQTBCLFFBQWlCO1FBQ3ZDLElBQUksU0FBUyxHQUEwQixFQUFFLENBQUM7UUFFMUMsc0NBQXNDO1FBQ3RDLElBQUksZUFBZSxHQUFHLElBQUksbUNBQW1DLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlFLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QyxTQUFTLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRWhDLE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDckIsQ0FBQztJQUVELHVFQUF1RTtJQUN2RSwyRUFBMkU7SUFDM0UsZ0RBQWdEO0lBQ2hELHVEQUEwQixHQUExQixVQUEyQixRQUFpQjtRQUN4QyxJQUFJLFNBQVMsR0FBMEIsRUFBRSxDQUFDO1FBQzFDLElBQUksb0JBQW9CLEdBQUcsSUFBSSxzQkFBc0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEUsSUFBSSxpQkFBaUIsR0FBRyxJQUFJLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoRSxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDckMsU0FBUyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDckIsQ0FBQztJQUdELCtGQUErRjtJQUMvRiwwQ0FBYSxHQUFiLFVBQWMsUUFBdUI7UUFFakMsc0RBQXNEO1FBQ3RELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxXQUFXLEVBQUUsY0FBTSxPQUFBLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxFQUF2QyxDQUF1QyxDQUFDLENBQUM7UUFFbEYsaUVBQWlFO1FBQ2pFLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO0lBQzVDLENBQUM7SUFDTCx5QkFBQztBQUFELENBQUMsQUE3bUJELENBQWlDLGdCQUFnQixHQTZtQmhEO0FBR0QsaURBQWlEO0FBQ2pELG1GQUFtRjtBQUNuRjtJQUFrRCx1REFBaUI7SUFBbkU7O0lBTUEsQ0FBQztJQUpHLDBEQUFZLEdBQVo7UUFDSSxpQkFBTSxZQUFZLFdBQUUsQ0FBQztRQUNyQixhQUFhLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBQ04sMENBQUM7QUFBRCxDQUFDLEFBTkQsQ0FBa0QsaUJBQWlCLEdBTWxFO0FBR0QsNEVBQTRFO0FBQzVFO0lBQXFDLDBDQUFvQjtJQUF6RDs7SUF5RUEsQ0FBQztJQXZFRywyREFBMkQ7SUFDM0QsOENBQWEsR0FBYixVQUFjLFFBQVE7UUFDbEIsTUFBTSxDQUFDLG9CQUFvQixDQUFDO0lBQ2hDLENBQUM7SUFFRCx1Q0FBdUM7SUFDdkMsNkNBQVksR0FBWjtRQUNJLE1BQU0sQ0FBQyxlQUFlLENBQUM7SUFDM0IsQ0FBQztJQUVELDhDQUFhLEdBQWI7UUFDSSxNQUFNLENBQUMsc0NBQXNDLENBQUM7SUFDbEQsQ0FBQztJQUVELDJEQUEyRDtJQUMzRCxtREFBa0IsR0FBbEI7UUFDSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELDhCQUE4QjtJQUM5QiwrQ0FBYyxHQUFkLFVBQWUsQ0FBQztRQUNaLElBQUksVUFBVSxHQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUQsSUFBSSxjQUFjLEdBQVcsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pGLENBQUMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEUsRUFBRSxDQUFDLENBQUMsVUFBVSxJQUFJLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDL0IsYUFBYSxDQUFDLDhCQUE4QixFQUFFLENBQUM7UUFDbkQsQ0FBQztRQUNELHlFQUF5RTtRQUN6RSwyREFBMkQ7UUFDM0QsdUVBQXVFO1FBQ3ZFLG9DQUFvQztJQUN4QyxDQUFDO0lBRUQsaURBQWdCLEdBQWhCLFVBQWlCLE1BQWU7UUFFNUIsSUFBSSxPQUFPLEdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RCwwREFBMEQ7UUFDMUQsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE1BQU0sSUFBSSxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1lBQ3BELENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFeEMsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsVUFBUyxHQUFHO1lBQzdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFHRCwwREFBMEQ7UUFDMUQsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQUMsRUFBUztZQUMzQixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCw4REFBNkIsR0FBN0IsVUFBOEIsY0FBa0IsRUFBRSxLQUFZO1FBQzFELElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQixDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFDLENBQUMsRUFBRSxHQUFHLElBQUssT0FBQSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLEVBQTlDLENBQThDLENBQUMsQ0FBQztRQUN2RixDQUFDO0lBQ0wsQ0FBQztJQUNMLDZCQUFDO0FBQUQsQ0FBQyxBQXpFRCxDQUFxQyxvQkFBb0IsR0F5RXhEO0FBR0QsOEVBQThFO0FBQzlFO0lBQWtDLHVDQUFvQjtJQUF0RDs7SUFtREEsQ0FBQztJQWpERywyREFBMkQ7SUFDM0QsMkNBQWEsR0FBYixVQUFjLFFBQVE7UUFDbEIsTUFBTSxDQUFDLG9CQUFvQixDQUFDO0lBQ2hDLENBQUM7SUFFRCx1Q0FBdUM7SUFDdkMsMENBQVksR0FBWjtRQUNJLE1BQU0sQ0FBQyxZQUFZLENBQUM7SUFDeEIsQ0FBQztJQUVELDJDQUFhLEdBQWI7UUFDSSxNQUFNLENBQUMsdURBQXVELENBQUM7SUFDbkUsQ0FBQztJQUVELDJEQUEyRDtJQUMzRCxnREFBa0IsR0FBbEI7UUFDSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELDhCQUE4QjtJQUM5Qiw0Q0FBYyxHQUFkLFVBQWUsQ0FBQztRQUNaLElBQUksVUFBVSxHQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUQsSUFBSSxjQUFjLEdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDbEYsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3RCxFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQztZQUMvQixhQUFhLENBQUMsOEJBQThCLEVBQUUsQ0FBQztRQUNuRCxDQUFDO1FBQ0QseUVBQXlFO1FBQ3pFLDJEQUEyRDtRQUMzRCx1RUFBdUU7UUFDdkUsb0NBQW9DO0lBQ3hDLENBQUM7SUFFRCw4Q0FBZ0IsR0FBaEIsVUFBaUIsTUFBZTtRQUU1QixJQUFJLE9BQU8sR0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELDBEQUEwRDtRQUMxRCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztRQUFDLENBQUM7UUFDL0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBQyxFQUFTO1lBQzNCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELDJEQUE2QixHQUE3QixVQUE4QixjQUFrQixFQUFFLEtBQVk7UUFDMUQsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2YsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsVUFBQyxDQUFDLEVBQUUsR0FBRyxJQUFLLE9BQUEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBM0MsQ0FBMkMsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7SUFDTCxDQUFDO0lBQ0wsMEJBQUM7QUFBRCxDQUFDLEFBbkRELENBQWtDLG9CQUFvQixHQW1EckQ7QUFHRCx1RUFBdUU7QUFDdkUsQ0FBQyxDQUFDLGNBQU0sT0FBQSxhQUFhLENBQUMsU0FBUyxFQUFFLEVBQXpCLENBQXlCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGUgbGFzdCBtb2RpZmllZCBvbjogTW9uIEF1ZyAwNyAyMDE3IDEzOjA1OjQzICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJVdGwudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRyYWdib3hlcy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRGF0YUdyaWQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkVEREdyYXBoaW5nVG9vbHMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uL3R5cGluZ3MvZDMvZDMuZC50c1wiLz5cblxuXG5kZWNsYXJlIHZhciBFREREYXRhOkVERERhdGE7XG5cbm5hbWVzcGFjZSBTdHVkeURhdGFQYWdlIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgdmlld2luZ01vZGU7ICAgIC8vIEFuIGVudW06ICdsaW5lZ3JhcGgnLCAnYmFyZ3JhcGgnLCBvciAndGFibGUnXG4gICAgdmFyIHZpZXdpbmdNb2RlSXNTdGFsZTp7W2lkOnN0cmluZ106IGJvb2xlYW59O1xuICAgIHZhciBiYXJHcmFwaE1vZGU7ICAgIC8vIGFuIGVudW06ICd0aW1lJywgJ2xpbmUnLCAnbWVhc3VyZW1lbnQnXG4gICAgdmFyIGJhckdyYXBoVHlwZUJ1dHRvbnNKUTpKUXVlcnk7XG5cbiAgICBleHBvcnQgdmFyIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0OiBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldDtcbiAgICB2YXIgcG9zdEZpbHRlcmluZ0Fzc2F5czphbnlbXTtcbiAgICB2YXIgcG9zdEZpbHRlcmluZ01lYXN1cmVtZW50czphbnlbXTtcblxuICAgIHZhciBhY3Rpb25QYW5lbFJlZnJlc2hUaW1lcjphbnk7XG4gICAgdmFyIGFjdGlvblBhbmVsSXNJbkJvdHRvbUJhcjpib29sZWFuO1xuICAgIHZhciByZWZyZXNEYXRhRGlzcGxheUlmU3RhbGVUaW1lcjphbnk7XG5cbiAgICB2YXIgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID0gMDtcblxuICAgIHZhciBjb2xvck9iajphbnk7XG5cbiAgICAvLyBUYWJsZSBzcGVjIGFuZCB0YWJsZSBvYmplY3RzLCBvbmUgZWFjaCBwZXIgUHJvdG9jb2wsIGZvciBBc3NheXMuXG4gICAgdmFyIGFzc2F5c0RhdGFHcmlkU3BlYztcbiAgICBleHBvcnQgdmFyIGFzc2F5c0RhdGFHcmlkO1xuXG4gICAgLy8gVXRpbGl0eSBpbnRlcmZhY2UgdXNlZCBieSBHZW5lcmljRmlsdGVyU2VjdGlvbiN1cGRhdGVVbmlxdWVJbmRleGVzSGFzaFxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUlEIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXI7XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1N0cmluZyB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogc3RyaW5nO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFZhbHVlVG9VbmlxdWVMaXN0IHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBudW1iZXJbXTtcbiAgICB9XG4gICAgZXhwb3J0IGludGVyZmFjZSBVbmlxdWVJRFRvVmFsdWUge1xuICAgICAgICBbaW5kZXg6IG51bWJlcl06IHN0cmluZztcbiAgICB9XG4gICAgLy8gVXNlZCBpbiBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCNwcmVwYXJlRmlsdGVyaW5nU2VjdGlvblxuICAgIGV4cG9ydCBpbnRlcmZhY2UgUmVjb3JkSURUb0Jvb2xlYW4ge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IGJvb2xlYW47XG4gICAgfVxuICAgIC8vIFVzZWQgdG8ga2VlcCB0cmFjayBvZiBhbGwgdGhlIGFjY3VtdWxhdGVkIHJlY29yZCBJRHMgdGhhdCBjYW4gYmUgdXNlZCB0b1xuICAgIC8vIHBvcHVsYXRlIHRoZSBmaWx0ZXJzLiAgV2UgdXNlIHRoaXMgdG8gcmVwb3B1bGF0ZSBmaWx0ZXJzIHdoZW4gdGhlIG1vZGUgaGFzIGNoYW5nZWQsXG4gICAgLy8gZm9yIGV4YW1wbGUsIHRvIHNob3cgY3JpdGVyaWEgZm9yIGRpc2FibGVkIGFzc2F5cywgb3IgYXNzYXlzIHdpdGggbm8gbWVhc3VyZW1lbnRzLlxuICAgIC8vIFRvIHNwZWVkIHRoaW5ncyB1cCB3ZSB3aWxsIGFjY3VtdWxhdGUgYXJyYXlzLCBlbnN1cmluZyB0aGF0IHRoZSBJRHMgaW4gZWFjaCBhcnJheVxuICAgIC8vIGFyZSB1bmlxdWUgKHRvIHRoZSBnaXZlbiBhcnJheSkgYnkgdHJhY2tpbmcgYWxyZWFkeS1zZWVuIElEcyB3aXRoIGJvb2xlYW4gZmxhZ3MuXG4gICAgZXhwb3J0IGludGVyZmFjZSBBY2N1bXVsYXRlZFJlY29yZElEcyB7XG4gICAgICAgIHNlZW5SZWNvcmRGbGFnczogUmVjb3JkSURUb0Jvb2xlYW47XG4gICAgICAgIG1ldGFib2xpdGVJRHM6IHN0cmluZ1tdO1xuICAgICAgICBwcm90ZWluSURzOiBzdHJpbmdbXTtcbiAgICAgICAgZ2VuZUlEczogc3RyaW5nW107XG4gICAgICAgIG1lYXN1cmVtZW50SURzOiBzdHJpbmdbXTtcbiAgICB9XG5cblxuICAgIC8vIEZvciB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gb24gdGhlIG1haW4gZ3JhcGhcbiAgICBleHBvcnQgY2xhc3MgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQge1xuXG4gICAgICAgIC8vIFRoZXNlIGFyZSB0aGUgaW50ZXJuYWwgc2V0dGluZ3MgZm9yIHRoZSB3aWRnZXQuXG4gICAgICAgIC8vIFRoZXkgbWF5IGRpZmZlciBmcm9tIHRoZSBVSSwgaWYgd2UgaGF2ZW4ndCByZWZyZXNoZWQgdGhlIGZpbHRlcmluZyBzZWN0aW9uLlxuICAgICAgICBzaG93aW5nRGlzYWJsZWQ6Ym9vbGVhbjtcbiAgICAgICAgc2hvd2luZ0VtcHR5OmJvb2xlYW47XG5cbiAgICAgICAgYWxsRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgYXNzYXlGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBrZWVwIGEgc2VwYXJhdGUgZmlsdGVyIGxpc3QgZm9yIGVhY2ggdHlwZS5cbiAgICAgICAgbWV0YWJvbGl0ZUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIHByb3RlaW5GaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBnZW5lRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgbWVhc3VyZW1lbnRGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuXG4gICAgICAgIG1ldGFib2xpdGVEYXRhUHJlc2VudDogYm9vbGVhbjtcbiAgICAgICAgcHJvdGVpbkRhdGFQcmVzZW50OiBib29sZWFuO1xuICAgICAgICBnZW5lRGF0YVByZXNlbnQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVyaWNEYXRhUHJlc2VudDogYm9vbGVhbjtcblxuICAgICAgICBmaWx0ZXJUYWJsZUpROiBKUXVlcnk7XG4gICAgICAgIGFjY3VtdWxhdGVkUmVjb3JkSURzOiBBY2N1bXVsYXRlZFJlY29yZElEcztcbiAgICAgICAgbGFzdEZpbHRlcmluZ1Jlc3VsdHM6IGFueTtcblxuXG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGluaXRpYWxpemUgZWFjaCBmaWx0ZXIgbGlzdC5cbiAgICAgICAgY29uc3RydWN0b3IoKSB7XG5cbiAgICAgICAgICAgIHRoaXMuc2hvd2luZ0Rpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnNob3dpbmdFbXB0eSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLmdlbmVGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkRhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5nZW5lcmljRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyVGFibGVKUSA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzID0ge1xuICAgICAgICAgICAgICAgIHNlZW5SZWNvcmRGbGFnczoge30sXG4gICAgICAgICAgICAgICAgbWV0YWJvbGl0ZUlEczogW10sXG4gICAgICAgICAgICAgICAgcHJvdGVpbklEczogW10sXG4gICAgICAgICAgICAgICAgZ2VuZUlEczogW10sXG4gICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRJRHM6IFtdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy5sYXN0RmlsdGVyaW5nUmVzdWx0cyA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZWFkIHRocm91Z2ggdGhlIExpbmVzLCBBc3NheXMsIGFuZCBBc3NheU1lYXN1cmVtZW50cyBzdHJ1Y3R1cmVzIHRvIGxlYXJuIHdoYXQgdHlwZXMgYXJlIHByZXNlbnQsXG4gICAgICAgIC8vIHRoZW4gaW5zdGFudGlhdGUgdGhlIHJlbGV2YW50IHN1YmNsYXNzZXMgb2YgR2VuZXJpY0ZpbHRlclNlY3Rpb24sIHRvIGNyZWF0ZSBhIHNlcmllcyBvZlxuICAgICAgICAvLyBjb2x1bW5zIGZvciB0aGUgZmlsdGVyaW5nIHNlY3Rpb24gdW5kZXIgdGhlIG1haW4gZ3JhcGggb24gdGhlIHBhZ2UuXG4gICAgICAgIC8vIFRoaXMgbXVzdCBiZSBvdXRzaWRlIHRoZSBjb25zdHJ1Y3RvciBiZWNhdXNlIEVERERhdGEuTGluZXMgYW5kIEVERERhdGEuQXNzYXlzIGFyZSBub3QgaW1tZWRpYXRlbHkgYXZhaWxhYmxlXG4gICAgICAgIC8vIG9uIHBhZ2UgbG9hZC5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gY3JlYXRlIGFuZCBhZGQgcmVsZXZhbnQgZmlsdGVycyBmb3IgZWFjaCBncm91cC5cbiAgICAgICAgcHJlcGFyZUZpbHRlcmluZ1NlY3Rpb24oKTogdm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBzZWVuSW5MaW5lc0hhc2g6IFJlY29yZElEVG9Cb29sZWFuID0ge307XG4gICAgICAgICAgICB2YXIgc2VlbkluQXNzYXlzSGFzaDogUmVjb3JkSURUb0Jvb2xlYW4gPSB7fTtcblxuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gJCgnPGRpdj4nKS5hZGRDbGFzcygnZmlsdGVyVGFibGUnKTtcbiAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLmFwcGVuZCh0aGlzLmZpbHRlclRhYmxlSlEpO1xuXG4gICAgICAgICAgICAvLyBGaXJzdCBkbyBzb21lIGJhc2ljIHNhbml0eSBmaWx0ZXJpbmcgb24gdGhlIGxpc3RcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQ6IHN0cmluZywgYXNzYXk6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluQXNzYXlzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwgW10sIChtZXRhZGF0YUlkKSA9PiB7IHNlZW5JbkxpbmVzSGFzaFttZXRhZGF0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBmaWx0ZXJzIG9uIGFzc2F5IHRhYmxlc1xuICAgICAgICAgICAgLy8gVE9ETyBtZWRpYSBpcyBub3cgYSBtZXRhZGF0YSB0eXBlLCBzdHJhaW4gYW5kIGNhcmJvbiBzb3VyY2Ugc2hvdWxkIGJlIHRvb1xuICAgICAgICAgICAgdmFyIGFzc2F5RmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFByb3RvY29sRmlsdGVyU2VjdGlvbigpKTsgLy8gUHJvdG9jb2xcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBTdHJhaW5GaWx0ZXJTZWN0aW9uKCkpOyAvLyBmaXJzdCBjb2x1bW4gaW4gZmlsdGVyaW5nIHNlY3Rpb25cbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBMaW5lTmFtZUZpbHRlclNlY3Rpb24oKSk7IC8vIExJTkVcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBDYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IENhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoKG5ldyBBc3NheUZpbHRlclNlY3Rpb24oKSk7IC8vIEFzc2F5XG4gICAgICAgICAgICAvLyBjb252ZXJ0IHNlZW4gbWV0YWRhdGEgSURzIHRvIEZpbHRlclNlY3Rpb24gb2JqZWN0cywgYW5kIHB1c2ggdG8gZW5kIG9mIGFzc2F5RmlsdGVyc1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2guYXBwbHkoYXNzYXlGaWx0ZXJzLFxuICAgICAgICAgICAgICAgICQubWFwKHNlZW5JbkFzc2F5c0hhc2gsIChfLCBpZDogc3RyaW5nKSA9PiBuZXcgQXNzYXlNZXRhRGF0YUZpbHRlclNlY3Rpb24oaWQpKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaC5hcHBseShhc3NheUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgJC5tYXAoc2VlbkluTGluZXNIYXNoLCAoXywgaWQ6IHN0cmluZykgPT4gbmV3IExpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24oaWQpKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbigpKTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMucHVzaChuZXcgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMucHVzaChuZXcgUHJvdGVpbkZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMucHVzaChuZXcgR2VuZUZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycy5wdXNoKG5ldyBHZW5lcmFsTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICAvLyBBbGwgZmlsdGVyIHNlY3Rpb25zIGFyZSBjb25zdHJ1Y3RlZDsgbm93IG5lZWQgdG8gY2FsbCBjb25maWd1cmUoKSBvbiBhbGxcbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycyA9IFtdLmNvbmNhdChcbiAgICAgICAgICAgICAgICBhc3NheUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMpO1xuICAgICAgICAgICAgdGhpcy5hbGxGaWx0ZXJzLmZvckVhY2goKHNlY3Rpb24pID0+IHNlY3Rpb24uY29uZmlndXJlKCkpO1xuXG4gICAgICAgICAgICAvLyBXZSBjYW4gaW5pdGlhbGl6ZSBhbGwgdGhlIEFzc2F5LSBhbmQgTGluZS1sZXZlbCBmaWx0ZXJzIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICB0aGlzLmFzc2F5RmlsdGVycyA9IGFzc2F5RmlsdGVycztcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUxpbmVGaWx0ZXJzKCk7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVDb2x1bW5zKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCBmaWx0ZXJzIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiwgYW5kIGFkZCBpbiB0aGUgb25lcyB0aGF0XG4gICAgICAgIC8vIGNsYWltIHRvIGJlIFwidXNlZnVsXCIuXG4gICAgICAgIHJlcG9wdWxhdGVDb2x1bW5zKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGRhcms6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYWxsRmlsdGVycywgKGksIHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh3aWRnZXQuaXNGaWx0ZXJVc2VmdWwoKSkge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuYWRkVG9QYXJlbnQodGhpcy5maWx0ZXJUYWJsZUpRWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgZGFyayA9ICFkYXJrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdpdmVuIGEgc2V0IG9mIG1lYXN1cmVtZW50IHJlY29yZHMgYW5kIGEgZGljdGlvbmFyeSBvZiBjb3JyZXNwb25kaW5nIHR5cGVzXG4gICAgICAgIC8vIChwYXNzZWQgZG93biBmcm9tIHRoZSBzZXJ2ZXIgYXMgYSByZXN1bHQgb2YgYSBkYXRhIHJlcXVlc3QpLCBzb3J0IHRoZW0gaW50b1xuICAgICAgICAvLyB0aGVpciB2YXJpb3VzIGNhdGVnb3JpZXMsIGFuZCBmbGFnIHRoZW0gYXMgYXZhaWxhYmxlIGZvciBwb3B1YWx0aW5nIHRoZVxuICAgICAgICAvLyBmaWx0ZXJpbmcgc2VjdGlvbi4gIFRoZW4gY2FsbCB0byByZXBvcHVsYXRlIHRoZSBmaWx0ZXJpbmcgYmFzZWQgb24gdGhlIGV4cGFuZGVkIHNldHMuXG4gICAgICAgIHByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhtZWFzdXJlcywgdHlwZXMpOiB2b2lkIHtcblxuICAgICAgICAgICAgLy8gbG9vcCBvdmVyIGFsbCBkb3dubG9hZGVkIG1lYXN1cmVtZW50cy4gbWVhc3VyZXMgY29ycmVzcG9uZHMgdG8gQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgICAgICQuZWFjaChtZWFzdXJlcyB8fCB7fSwgKGluZGV4LCBtZWFzdXJlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UndmUgc2VlbiBpdCBhbHJlYWR5IChyYXRoZXIgdW5saWtlbHkpLCBza2lwIGl0LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLnNlZW5SZWNvcmRGbGFnc1ttZWFzdXJlbWVudC5pZF0pIHsgcmV0dXJuOyB9XG4gICAgICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5zZWVuUmVjb3JkRmxhZ3NbbWVhc3VyZW1lbnQuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5KSB7IHJldHVybiB9O1xuICAgICAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgeyByZXR1cm4gfTtcbiAgICAgICAgICAgICAgICBtdHlwZSA9IHR5cGVzW21lYXN1cmVtZW50LnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIGlmIChtdHlwZS5mYW1pbHkgPT09ICdtJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBtZXRhYm9saXRlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMubWV0YWJvbGl0ZUlEcy5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5wcm90ZWluSURzLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAnZycpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgZ2VuZSAvIHRyYW5zY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5nZW5lSURzLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHRocm93IGV2ZXJ5dGhpbmcgZWxzZSBpbiBhIGdlbmVyYWwgYXJlYVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLm1lYXN1cmVtZW50SURzLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlQWxsRmlsdGVycygpOyAgICAvLyBTa2lwIHRoZSBxdWV1ZSAtIHdlIG5lZWQgdG8gcmVwb3B1bGF0ZSBpbW1lZGlhdGVseVxuICAgICAgICB9XG5cblxuICAgICAgICByZXBvcHVsYXRlQWxsRmlsdGVycygpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUxpbmVGaWx0ZXJzKCk7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVNZWFzdXJlbWVudEZpbHRlcnMoKTtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUNvbHVtbnMoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcmVwb3B1bGF0ZUxpbmVGaWx0ZXJzKCk6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGZpbHRlcmVkQXNzYXlJZHMgPSB0aGlzLmJ1aWxkQXNzYXlJRFNldCgpO1xuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMuZm9yRWFjaCgoZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsdGVyLnBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhmaWx0ZXJlZEFzc2F5SWRzKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXBvcHVsYXRlTWVhc3VyZW1lbnRGaWx0ZXJzKCk6IHZvaWQge1xuXG4gICAgICAgICAgICB2YXIgZmlsdGVyRGlzYWJsZWQ6IChpZDpzdHJpbmcpID0+IGJvb2xlYW47XG4gICAgICAgICAgICB2YXIgcHJvY2VzczogKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbikgPT4gdm9pZDtcblxuICAgICAgICAgICAgdmFyIG0gPSB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLm1ldGFib2xpdGVJRHM7XG4gICAgICAgICAgICB2YXIgcCA9IHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMucHJvdGVpbklEcztcbiAgICAgICAgICAgIHZhciBnID0gdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5nZW5lSURzO1xuICAgICAgICAgICAgdmFyIGdlbiA9IHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMubWVhc3VyZW1lbnRJRHM7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5zaG93aW5nRGlzYWJsZWQpIHtcblxuICAgICAgICAgICAgICAgIGZpbHRlckRpc2FibGVkID0gKG1lYXN1cmVJZDpzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFtZWFzdXJlKSB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlLmFzc2F5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhc3NheSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICEhYXNzYXkuYWN0aXZlO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBtID0gbS5maWx0ZXIoZmlsdGVyRGlzYWJsZWQpO1xuICAgICAgICAgICAgICAgIHAgPSBwLmZpbHRlcihmaWx0ZXJEaXNhYmxlZCk7XG4gICAgICAgICAgICAgICAgZyA9IGcuZmlsdGVyKGZpbHRlckRpc2FibGVkKTtcbiAgICAgICAgICAgICAgICBnZW4gPSBnZW4uZmlsdGVyKGZpbHRlckRpc2FibGVkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkRhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVEYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5nZW5lcmljRGF0YVByZXNlbnQgPSBmYWxzZTtcblxuICAgICAgICAgICAgcHJvY2VzcyA9IChpZHM6IHN0cmluZ1tdLCBpOiBudW1iZXIsIHdpZGdldDogR2VuZXJpY0ZpbHRlclNlY3Rpb24pOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB3aWRnZXQucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGlkcyk7XG4gICAgICAgICAgICAgICAgd2lkZ2V0LnBvcHVsYXRlVGFibGUoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChtLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIG0pKTtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVEYXRhUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcm90ZWluRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBwKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByZXNlbnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGcubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuZ2VuZUZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZykpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcmVzZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnZW4ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIGdlbikpO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2VuZXJpY0RhdGFQcmVzZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ1aWxkIGEgbGlzdCBvZiBhbGwgdGhlIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHkuXG4gICAgICAgIGJ1aWxkQXNzYXlJRFNldCgpOiBhbnlbXSB7XG4gICAgICAgICAgICB2YXIgYXNzYXlJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChhc3NheUlkLCBhc3NheSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSAmJiAhdGhpcy5zaG93aW5nRGlzYWJsZWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2F5LmNvdW50ICYmICF0aGlzLnNob3dpbmdFbXB0eSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGFzc2F5SWRzLnB1c2goYXNzYXlJZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBhc3NheUlkcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBnbG9iYWwgc2V0dGluZ3MgZm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiBhcmUgZGlmZmVyZW50LCBhbmQgcmVidWlsZCB0aGVcbiAgICAgICAgLy8gc2VjdGlvbnMgaWYgc28uICBUaGVuLCBzdGFydGluZyB3aXRoIGEgbGlzdCBvZiBhbGwgdGhlIEFzc2F5IElEcyBpbiB0aGUgU3R1ZHksIHdlIGxvb3AgaXQgdGhyb3VnaCB0aGVcbiAgICAgICAgLy8gTGluZSBhbmQgQXNzYXktbGV2ZWwgZmlsdGVycywgY2F1c2luZyB0aGUgZmlsdGVycyB0byByZWZyZXNoIHRoZWlyIFVJLCBuYXJyb3dpbmcgdGhlIHNldCBkb3duLlxuICAgICAgICAvLyBXZSByZXNvbHZlIHRoZSByZXN1bHRpbmcgc2V0IG9mIEFzc2F5IElEcyBpbnRvIG1lYXN1cmVtZW50IElEcywgdGhlbiBwYXNzIHRoZW0gb24gdG8gdGhlXG4gICAgICAgIC8vIG1lYXN1cmVtZW50LWxldmVsIGZpbHRlcnMuICBJbiB0aGUgZW5kIHdlIHJldHVybiBhIHNldCBvZiBtZWFzdXJlbWVudCBJRHMgcmVwcmVzZW50aW5nIHRoZVxuICAgICAgICAvLyBlbmQgcmVzdWx0IG9mIGFsbCB0aGUgZmlsdGVycywgc3VpdGFibGUgZm9yIHBhc3NpbmcgdG8gdGhlIGdyYXBoaW5nIGZ1bmN0aW9ucy5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gcHJvY2VzcyBlYWNoIGdyb3VwIHNlcGFyYXRlbHkgaGVyZS5cbiAgICAgICAgYnVpbGRGaWx0ZXJlZE1lYXN1cmVtZW50cygpOiBWYWx1ZVRvVW5pcXVlTGlzdCB7XG5cbiAgICAgICAgICAgIHZhciBzaG93aW5nRGlzYWJsZWRDQjpib29sZWFuID0gISEoJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICAgICAgICAgIHZhciBzaG93aW5nRW1wdHlDQjpib29sZWFuID0gISEoJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcblxuICAgICAgICAgICAgaWYgKCh0aGlzLnNob3dpbmdEaXNhYmxlZCAhPSBzaG93aW5nRGlzYWJsZWRDQikgfHwgKHRoaXMuc2hvd2luZ0VtcHR5ICE9IHNob3dpbmdFbXB0eUNCKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd2luZ0Rpc2FibGVkID0gc2hvd2luZ0Rpc2FibGVkQ0I7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93aW5nRW1wdHkgPSBzaG93aW5nRW1wdHlDQjtcblxuICAgICAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUFsbEZpbHRlcnMoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGZpbHRlcmVkQXNzYXlJZHMgPSB0aGlzLmJ1aWxkQXNzYXlJRFNldCgpO1xuXG4gICAgICAgICAgICB2YXIgZmlsdGVyaW5nUmVzdWx0czpWYWx1ZVRvVW5pcXVlTGlzdCA9IHt9O1xuICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1snYWxsQXNzYXlzJ10gPSBmaWx0ZXJlZEFzc2F5SWRzO1xuXG4gICAgICAgICAgICAkLmVhY2godGhpcy5hc3NheUZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZEFzc2F5SWRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZmlsdGVyZWRBc3NheUlkcyk7XG4gICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1tmaWx0ZXIuc2VjdGlvblNob3J0TGFiZWxdID0gZmlsdGVyZWRBc3NheUlkcztcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzWydmaWx0ZXJlZEFzc2F5cyddID0gZmlsdGVyZWRBc3NheUlkcztcblxuICAgICAgICAgICAgdmFyIG1lYXN1cmVtZW50SWRzOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgJC5lYWNoKGZpbHRlcmVkQXNzYXlJZHMsIChpLCBhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgICAgICAgICAgJC5tZXJnZShtZWFzdXJlbWVudElkcywgYXNzYXkubWVhc3VyZXMgfHwgW10pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbJ2FsbE1lYXN1cmVtZW50cyddID0gbWVhc3VyZW1lbnRJZHM7XG5cbiAgICAgICAgICAgIC8vIFdlIHN0YXJ0IG91dCB3aXRoIGZvdXIgcmVmZXJlbmNlcyB0byB0aGUgYXJyYXkgb2YgYXZhaWxhYmxlIG1lYXN1cmVtZW50IElEcywgb25lIGZvciBlYWNoIG1ham9yIGNhdGVnb3J5LlxuICAgICAgICAgICAgLy8gRWFjaCBvZiB0aGVzZSB3aWxsIGJlY29tZSBpdHMgb3duIGFycmF5IGluIHR1cm4gYXMgd2UgbmFycm93IGl0IGRvd24uXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHRvIHByZXZlbnQgYSBzdWItc2VsZWN0aW9uIGluIG9uZSBjYXRlZ29yeSBmcm9tIG92ZXJyaWRpbmcgYSBzdWItc2VsZWN0aW9uIGluIHRoZSBvdGhlcnMuXG5cbiAgICAgICAgICAgIHZhciBtZXRhYm9saXRlTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgcHJvdGVpbk1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIGdlbmVNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBnZW5lcmljTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG5cbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCB3ZSBvbmx5IHRyeSB0byBmaWx0ZXIgaWYgd2UgZ290IG1lYXN1cmVtZW50cyB0aGF0IGFwcGx5IHRvIHRoZSB3aWRnZXQgdHlwZXNcblxuICAgICAgICAgICAgaWYgKHRoaXMubWV0YWJvbGl0ZURhdGFQcmVzZW50KSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZU1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKG1ldGFib2xpdGVNZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzW2ZpbHRlci5zZWN0aW9uU2hvcnRMYWJlbF0gPSBtZXRhYm9saXRlTWVhc3VyZW1lbnRzO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucHJvdGVpbkRhdGFQcmVzZW50KSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJvdGVpbkZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdGVpbk1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKHByb3RlaW5NZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzW2ZpbHRlci5zZWN0aW9uU2hvcnRMYWJlbF0gPSBwcm90ZWluTWVhc3VyZW1lbnRzO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2VuZURhdGFQcmVzZW50KSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuZ2VuZUZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZ2VuZU1lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGdlbmVNZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzW2ZpbHRlci5zZWN0aW9uU2hvcnRMYWJlbF0gPSBnZW5lTWVhc3VyZW1lbnRzO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZ2VuZXJpY0RhdGFQcmVzZW50KSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhnZW5lcmljTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1tmaWx0ZXIuc2VjdGlvblNob3J0TGFiZWxdID0gZ2VuZXJpY01lYXN1cmVtZW50cztcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT25jZSB3ZSd2ZSBmaW5pc2hlZCB3aXRoIHRoZSBmaWx0ZXJpbmcsIHdlIHdhbnQgdG8gc2VlIGlmIGFueSBzdWItc2VsZWN0aW9ucyBoYXZlIGJlZW4gbWFkZSBhY3Jvc3NcbiAgICAgICAgICAgIC8vIGFueSBvZiB0aGUgY2F0ZWdvcmllcywgYW5kIGlmIHNvLCBtZXJnZSB0aG9zZSBzdWItc2VsZWN0aW9ucyBpbnRvIG9uZS5cblxuICAgICAgICAgICAgLy8gVGhlIGlkZWEgaXMsIHdlIGRpc3BsYXkgZXZlcnl0aGluZyB1bnRpbCB0aGUgdXNlciBtYWtlcyBhIHNlbGVjdGlvbiBpbiBvbmUgb3IgbW9yZSBvZiB0aGUgbWFpbiBjYXRlZ29yaWVzLFxuICAgICAgICAgICAgLy8gdGhlbiBkcm9wIGV2ZXJ5dGhpbmcgZnJvbSB0aGUgY2F0ZWdvcmllcyB0aGF0IGNvbnRhaW4gbm8gc2VsZWN0aW9ucy5cblxuICAgICAgICAgICAgLy8gQW4gZXhhbXBsZSBzY2VuYXJpbyB3aWxsIGV4cGxhaW4gd2h5IHRoaXMgaXMgaW1wb3J0YW50OlxuXG4gICAgICAgICAgICAvLyBTYXkgYSB1c2VyIGlzIHByZXNlbnRlZCB3aXRoIHR3byBjYXRlZ29yaWVzLCBNZXRhYm9saXRlIGFuZCBNZWFzdXJlbWVudC5cbiAgICAgICAgICAgIC8vIE1ldGFib2xpdGUgaGFzIGNyaXRlcmlhICdBY2V0YXRlJyBhbmQgJ0V0aGFub2wnIGF2YWlsYWJsZS5cbiAgICAgICAgICAgIC8vIE1lYXN1cmVtZW50IGhhcyBvbmx5IG9uZSBjcml0ZXJpYSBhdmFpbGFibGUsICdPcHRpY2FsIERlbnNpdHknLlxuICAgICAgICAgICAgLy8gQnkgZGVmYXVsdCwgQWNldGF0ZSwgRXRoYW5vbCwgYW5kIE9wdGljYWwgRGVuc2l0eSBhcmUgYWxsIHVuY2hlY2tlZCwgYW5kIGFsbCB2aXNpYmxlIG9uIHRoZSBncmFwaC5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgZXF1aXZhbGVudCB0byAncmV0dXJuIG1lYXN1cmVtZW50cycgYmVsb3cuXG5cbiAgICAgICAgICAgIC8vIElmIHRoZSB1c2VyIGNoZWNrcyAnQWNldGF0ZScsIHRoZXkgZXhwZWN0IG9ubHkgQWNldGF0ZSB0byBiZSBkaXNwbGF5ZWQsIGV2ZW4gdGhvdWdoIG5vIGNoYW5nZSBoYXMgYmVlbiBtYWRlIHRvXG4gICAgICAgICAgICAvLyB0aGUgTWVhc3VyZW1lbnQgc2VjdGlvbiB3aGVyZSBPcHRpY2FsIERlbnNpdHkgaXMgbGlzdGVkLlxuICAgICAgICAgICAgLy8gSW4gdGhlIGNvZGUgYmVsb3csIGJ5IHRlc3RpbmcgZm9yIGFueSBjaGVja2VkIGJveGVzIGluIHRoZSBtZXRhYm9saXRlRmlsdGVycyBmaWx0ZXJzLFxuICAgICAgICAgICAgLy8gd2UgcmVhbGl6ZSB0aGF0IHRoZSBzZWxlY3Rpb24gaGFzIGJlZW4gbmFycm93ZWQgZG93biwgc28gd2UgYXBwZW5kIHRoZSBBY2V0YXRlIG1lYXN1cmVtZW50cyBvbnRvIGRTTS5cbiAgICAgICAgICAgIC8vIFRoZW4gd2hlbiB3ZSBjaGVjayB0aGUgbWVhc3VyZW1lbnRGaWx0ZXJzIGZpbHRlcnMsIHdlIHNlZSB0aGF0IHRoZSBNZWFzdXJlbWVudCBzZWN0aW9uIGhhc1xuICAgICAgICAgICAgLy8gbm90IG5hcnJvd2VkIGRvd24gaXRzIHNldCBvZiBtZWFzdXJlbWVudHMsIHNvIHdlIHNraXAgYXBwZW5kaW5nIHRob3NlIHRvIGRTTS5cbiAgICAgICAgICAgIC8vIFRoZSBlbmQgcmVzdWx0IGlzIG9ubHkgdGhlIEFjZXRhdGUgbWVhc3VyZW1lbnRzLlxuXG4gICAgICAgICAgICAvLyBUaGVuIHN1cHBvc2UgdGhlIHVzZXIgY2hlY2tzICdPcHRpY2FsIERlbnNpdHknLCBpbnRlbmRpbmcgdG8gY29tcGFyZSBBY2V0YXRlIGRpcmVjdGx5IGFnYWluc3QgT3B0aWNhbCBEZW5zaXR5LlxuICAgICAgICAgICAgLy8gU2luY2UgbWVhc3VyZW1lbnRGaWx0ZXJzIG5vdyBoYXMgY2hlY2tlZCBib3hlcywgd2UgcHVzaCBpdHMgbWVhc3VyZW1lbnRzIG9udG8gZFNNLFxuICAgICAgICAgICAgLy8gd2hlcmUgaXQgY29tYmluZXMgd2l0aCB0aGUgQWNldGF0ZS5cblxuICAgICAgICAgICAgdmFyIGFueUNoZWNrZWQgPSAoZmlsdGVyOiBHZW5lcmljRmlsdGVyU2VjdGlvbik6IGJvb2xlYW4gPT4geyByZXR1cm4gZmlsdGVyLmFueUNoZWNrYm94ZXNDaGVja2VkOyB9O1xuXG4gICAgICAgICAgICB2YXIgZFNNOiBhbnlbXSA9IFtdOyAgICAvLyBcIkRlbGliZXJhdGVseSBzZWxlY3RlZCBtZWFzdXJlbWVudHNcIlxuICAgICAgICAgICAgaWYgKCB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChtZXRhYm9saXRlTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKCAgICB0aGlzLnByb3RlaW5GaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChwcm90ZWluTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKCAgICAgICB0aGlzLmdlbmVGaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChnZW5lTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLnNvbWUoYW55Q2hlY2tlZCkpIHsgZFNNID0gZFNNLmNvbmNhdChnZW5lcmljTWVhc3VyZW1lbnRzKTsgfVxuICAgICAgICAgICAgaWYgKGRTTS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzWydmaWx0ZXJlZE1lYXN1cmVtZW50cyddID0gZFNNO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzWydmaWx0ZXJlZE1lYXN1cmVtZW50cyddID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmxhc3RGaWx0ZXJpbmdSZXN1bHRzID0gZmlsdGVyaW5nUmVzdWx0cztcbiAgICAgICAgICAgIHJldHVybiBmaWx0ZXJpbmdSZXN1bHRzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgYW55IG9mIHRoZSBnbG9iYWwgZmlsdGVyIHNldHRpbmdzIG9yIGFueSBvZiB0aGUgc2V0dGluZ3MgaW4gdGhlIGluZGl2aWR1YWwgZmlsdGVyc1xuICAgICAgICAvLyBoYXZlIGNoYW5nZWQsIHJldHVybiB0cnVlLCBpbmRpY2F0aW5nIHRoYXQgdGhlIGZpbHRlciB3aWxsIGdlbmVyYXRlIGRpZmZlcmVudCByZXN1bHRzIGlmXG4gICAgICAgIC8vIHF1ZXJpZWQuXG4gICAgICAgIGNoZWNrUmVkcmF3UmVxdWlyZWQoZm9yY2U/OiBib29sZWFuKTogYm9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgcmVkcmF3OmJvb2xlYW4gPSAhIWZvcmNlO1xuICAgICAgICAgICAgdmFyIHNob3dpbmdEaXNhYmxlZENCOmJvb2xlYW4gPSAhISgkKCcjZmlsdGVyaW5nU2hvd0Rpc2FibGVkQ2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJykpO1xuICAgICAgICAgICAgdmFyIHNob3dpbmdFbXB0eUNCOmJvb2xlYW4gPSAhISgkKCcjZmlsdGVyaW5nU2hvd0VtcHR5Q2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJykpO1xuXG4gICAgICAgICAgICAvLyBXZSBrbm93IHRoZSBpbnRlcm5hbCBzdGF0ZSBkaWZmZXJzLCBidXQgd2UncmUgbm90IGhlcmUgdG8gdXBkYXRlIGl0Li4uXG4gICAgICAgICAgICBpZiAodGhpcy5zaG93aW5nRGlzYWJsZWQgIT0gc2hvd2luZ0Rpc2FibGVkQ0IpIHsgcmVkcmF3ID0gdHJ1ZTsgfVxuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd2luZ0VtcHR5ICE9IHNob3dpbmdFbXB0eUNCKSB7IHJlZHJhdyA9IHRydWU7IH1cblxuICAgICAgICAgICAgLy8gV2FsayBkb3duIHRoZSBmaWx0ZXIgd2lkZ2V0IGxpc3QuICBJZiB3ZSBlbmNvdW50ZXIgb25lIHdob3NlIGNvbGxlY3RpdmUgY2hlY2tib3hcbiAgICAgICAgICAgIC8vIHN0YXRlIGhhcyBjaGFuZ2VkIHNpbmNlIHdlIGxhc3QgbWFkZSB0aGlzIHdhbGssIHRoZW4gYSByZWRyYXcgaXMgcmVxdWlyZWQuIE5vdGUgdGhhdFxuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIG5vdCBza2lwIHRoaXMgbG9vcCwgZXZlbiBpZiB3ZSBhbHJlYWR5IGtub3cgYSByZWRyYXcgaXMgcmVxdWlyZWQsIHNpbmNlIHRoZVxuICAgICAgICAgICAgLy8gY2FsbCB0byBhbnlGaWx0ZXJTZXR0aW5nc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5IHNldHMgaW50ZXJuYWwgc3RhdGUgaW4gdGhlIGZpbHRlclxuICAgICAgICAgICAgLy8gd2lkZ2V0cyB0aGF0IHdlIHdpbGwgdXNlIG5leHQgdGltZSBhcm91bmQuXG4gICAgICAgICAgICAkLmVhY2godGhpcy5hbGxGaWx0ZXJzLCAoaSwgZmlsdGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbHRlci5hbnlGaWx0ZXJTZXR0aW5nc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCkpIHsgcmVkcmF3ID0gdHJ1ZTsgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gcmVkcmF3O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBnZW5lcmljIHZlcnNpb24gb2YgYSBmaWx0ZXJpbmcgY29sdW1uIGluIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiBiZW5lYXRoIHRoZSBncmFwaCBhcmVhIG9uIHRoZSBwYWdlLFxuICAgIC8vIG1lYW50IHRvIGJlIHN1YmNsYXNzZWQgZm9yIHNwZWNpZmljIGNyaXRlcmlhLlxuICAgIC8vIFdoZW4gaW5pdGlhbGl6ZWQgd2l0aCBhIHNldCBvZiByZWNvcmQgSURzLCB0aGUgY29sdW1uIGlzIGZpbGxlZCB3aXRoIGxhYmVsZWQgY2hlY2tib3hlcywgb25lIGZvciBlYWNoXG4gICAgLy8gdW5pcXVlIHZhbHVlIG9mIHRoZSBnaXZlbiBjcml0ZXJpYSBlbmNvdW50ZXJlZCBpbiB0aGUgcmVjb3Jkcy5cbiAgICAvLyBEdXJpbmcgdXNlLCBhbm90aGVyIHNldCBvZiByZWNvcmQgSURzIGlzIHBhc3NlZCBpbiwgYW5kIGlmIGFueSBjaGVja2JveGVzIGFyZSBjaGVja2VkLCB0aGUgSUQgc2V0IGlzXG4gICAgLy8gbmFycm93ZWQgZG93biB0byBvbmx5IHRob3NlIHJlY29yZHMgdGhhdCBjb250YWluIHRoZSBjaGVja2VkIHZhbHVlcy5cbiAgICAvLyBDaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBnaXZlbiBJRHMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkLFxuICAgIC8vIHZpc3VhbGx5IGluZGljYXRpbmcgdG8gYSB1c2VyIHRoYXQgdGhvc2UgdmFsdWVzIGFyZSBub3QgYXZhaWxhYmxlIGZvciBmdXJ0aGVyIGZpbHRlcmluZy5cbiAgICAvLyBUaGUgZmlsdGVycyBhcmUgbWVhbnQgdG8gYmUgY2FsbGVkIGluIHNlcXVlbmNlLCBmZWVkaW5nIGVhY2ggcmV0dXJuZWQgSUQgc2V0IGludG8gdGhlIG5leHQsXG4gICAgLy8gcHJvZ3Jlc3NpdmVseSBuYXJyb3dpbmcgZG93biB0aGUgZW5hYmxlZCBjaGVja2JveGVzLlxuICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIHN1YmNsYXNzIHRoaXMgZm9yIGVhY2ggZ3JvdXAgdHlwZS5cbiAgICBleHBvcnQgY2xhc3MgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIC8vIEEgZGljdGlvbmFyeSBvZiB0aGUgdW5pcXVlIHZhbHVlcyBmb3VuZCBmb3IgZmlsdGVyaW5nIGFnYWluc3QsIGFuZCB0aGUgZGljdGlvbmFyeSdzIGNvbXBsZW1lbnQuXG4gICAgICAgIC8vIEVhY2ggdW5pcXVlIElEIGlzIGFuIGludGVnZXIsIGFzY2VuZGluZyBmcm9tIDEsIGluIHRoZSBvcmRlciB0aGUgdmFsdWUgd2FzIGZpcnN0IGVuY291bnRlcmVkXG4gICAgICAgIC8vIHdoZW4gZXhhbWluaW5nIHRoZSByZWNvcmQgZGF0YSBpbiB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaC5cbiAgICAgICAgdW5pcXVlVmFsdWVzOiBVbmlxdWVJRFRvVmFsdWU7XG4gICAgICAgIHVuaXF1ZUluZGV4ZXM6IFZhbHVlVG9VbmlxdWVJRDtcbiAgICAgICAgdW5pcXVlSW5kZXhDb3VudGVyOiBudW1iZXI7XG5cbiAgICAgICAgLy8gVGhlIHNvcnRlZCBvcmRlciBvZiB0aGUgbGlzdCBvZiB1bmlxdWUgdmFsdWVzIGZvdW5kIGluIHRoZSBmaWx0ZXJcbiAgICAgICAgdW5pcXVlVmFsdWVzT3JkZXI6IG51bWJlcltdO1xuXG4gICAgICAgIC8vIEEgZGljdGlvbmFyeSByZXNvbHZpbmcgYSByZWNvcmQgSUQgKGFzc2F5IElELCBtZWFzdXJlbWVudCBJRCkgdG8gYW4gYXJyYXkuIEVhY2ggYXJyYXlcbiAgICAgICAgLy8gY29udGFpbnMgdGhlIGludGVnZXIgaWRlbnRpZmllcnMgb2YgdGhlIHVuaXF1ZSB2YWx1ZXMgdGhhdCBhcHBseSB0byB0aGF0IHJlY29yZC5cbiAgICAgICAgLy8gKEl0J3MgcmFyZSwgYnV0IHRoZXJlIGNhbiBhY3R1YWxseSBiZSBtb3JlIHRoYW4gb25lIGNyaXRlcmlhIHRoYXQgbWF0Y2hlcyBhIGdpdmVuIElELFxuICAgICAgICAvLyAgZm9yIGV4YW1wbGUgYSBMaW5lIHdpdGggdHdvIGZlZWRzIGFzc2lnbmVkIHRvIGl0LilcbiAgICAgICAgZmlsdGVySGFzaDogVmFsdWVUb1VuaXF1ZUxpc3Q7XG4gICAgICAgIC8vIERpY3Rpb25hcnkgcmVzb2x2aW5nIHRoZSBmaWx0ZXIgdmFsdWVzIHRvIEhUTUwgSW5wdXQgY2hlY2tib3hlcy5cbiAgICAgICAgY2hlY2tib3hlczoge1tpbmRleDogc3RyaW5nXTogSlF1ZXJ5fTtcbiAgICAgICAgLy8gRGljdGlvbmFyeSB1c2VkIHRvIGNvbXBhcmUgY2hlY2tib3hlcyB3aXRoIGEgcHJldmlvdXMgc3RhdGUgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYW5cbiAgICAgICAgLy8gdXBkYXRlIGlzIHJlcXVpcmVkLiBWYWx1ZXMgYXJlICdDJyBmb3IgY2hlY2tlZCwgJ1UnIGZvciB1bmNoZWNrZWQsIGFuZCAnTicgZm9yIG5vdFxuICAgICAgICAvLyBleGlzdGluZyBhdCB0aGUgdGltZS4gKCdOJyBjYW4gYmUgdXNlZnVsIHdoZW4gY2hlY2tib3hlcyBhcmUgcmVtb3ZlZCBmcm9tIGEgZmlsdGVyIGR1ZSB0b1xuICAgICAgICAvLyB0aGUgYmFjay1lbmQgZGF0YSBjaGFuZ2luZy4pXG4gICAgICAgIHByZXZpb3VzQ2hlY2tib3hTdGF0ZTogVmFsdWVUb1N0cmluZztcbiAgICAgICAgLy8gRGljdGlvbmFyeSByZXNvbHZpbmcgdGhlIGZpbHRlciB2YWx1ZXMgdG8gSFRNTCB0YWJsZSByb3cgZWxlbWVudHMuXG4gICAgICAgIHRhYmxlUm93czoge1tpbmRleDogc3RyaW5nXTogSFRNTFRhYmxlUm93RWxlbWVudH07XG5cbiAgICAgICAgLy8gUmVmZXJlbmNlcyB0byBIVE1MIGVsZW1lbnRzIGNyZWF0ZWQgYnkgdGhlIGZpbHRlclxuICAgICAgICBmaWx0ZXJDb2x1bW5EaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBjbGVhckljb25zOiBKUXVlcnk7XG4gICAgICAgIHBsYWludGV4dFRpdGxlRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2VhcmNoQm94OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBzZWFyY2hCb3hUaXRsZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHNjcm9sbFpvbmVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBmaWx0ZXJpbmdUYWJsZTogSlF1ZXJ5O1xuICAgICAgICB0YWJsZUJvZHlFbGVtZW50OiBIVE1MVGFibGVFbGVtZW50O1xuXG4gICAgICAgIC8vIFNlYXJjaCBib3ggcmVsYXRlZFxuICAgICAgICB0eXBpbmdUaW1lb3V0OiBudW1iZXI7XG4gICAgICAgIHR5cGluZ0RlbGF5OiBudW1iZXI7XG4gICAgICAgIGN1cnJlbnRTZWFyY2hTZWxlY3Rpb246IHN0cmluZztcbiAgICAgICAgcHJldmlvdXNTZWFyY2hTZWxlY3Rpb246IHN0cmluZztcbiAgICAgICAgbWluQ2hhcnNUb1RyaWdnZXJTZWFyY2g6IG51bWJlcjtcblxuICAgICAgICBhbnlDaGVja2JveGVzQ2hlY2tlZDogYm9vbGVhbjtcblxuICAgICAgICBzZWN0aW9uVGl0bGU6IHN0cmluZztcbiAgICAgICAgc2VjdGlvblNob3J0TGFiZWw6IHN0cmluZztcblxuICAgICAgICAvLyBUT0RPOiBDb252ZXJ0IHRvIGEgcHJvdGVjdGVkIGNvbnN0cnVjdG9yISBUaGVuIHVzZSBhIGZhY3RvcnkgbWV0aG9kIHRvIGNyZWF0ZSBvYmplY3RzXG4gICAgICAgIC8vICAgIHdpdGggY29uZmlndXJlKCkgYWxyZWFkeSBjYWxsZWQuIFR5cGVzY3JpcHQgMS44IGRvZXMgbm90IHN1cHBvcnQgdmlzaWJpbGl0eVxuICAgICAgICAvLyAgICBtb2RpZmllcnMgb24gY29uc3RydWN0b3JzLCBzdXBwb3J0IGlzIGFkZGVkIGluIFR5cGVzY3JpcHQgMi4wXG4gICAgICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleENvdW50ZXIgPSAwO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IFtdO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLnRhYmxlUm93cyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzID0ge307XG5cbiAgICAgICAgICAgIHRoaXMudHlwaW5nVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnR5cGluZ0RlbGF5ID0gMzMwOyAgICAvLyBUT0RPOiBOb3QgaW1wbGVtZW50ZWRcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9ICcnO1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbiA9ICcnO1xuICAgICAgICAgICAgdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCA9IDE7XG4gICAgICAgICAgICB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBjb25maWd1cmUodGl0bGU6IHN0cmluZz0nR2VuZXJpYyBGaWx0ZXInLCBzaG9ydExhYmVsOiBzdHJpbmc9J2dmJyk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uVGl0bGUgPSB0aXRsZTtcbiAgICAgICAgICAgIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgPSBzaG9ydExhYmVsO1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVDb250YWluZXJPYmplY3RzKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDcmVhdGUgYWxsIHRoZSBjb250YWluZXIgSFRNTCBvYmplY3RzXG4gICAgICAgIGNyZWF0ZUNvbnRhaW5lck9iamVjdHMoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgc0JveElEOiBzdHJpbmcgPSAnZmlsdGVyJyArIHRoaXMuc2VjdGlvblNob3J0TGFiZWwgKyAnU2VhcmNoQm94JyxcbiAgICAgICAgICAgICAgICBzQm94OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJDb2x1bW5EaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckNvbHVtbicpWzBdO1xuICAgICAgICAgICAgdmFyIHRleHRUaXRsZSA9ICQoXCI8c3Bhbj5cIikuYWRkQ2xhc3MoJ2ZpbHRlclRpdGxlJykudGV4dCh0aGlzLnNlY3Rpb25UaXRsZSk7XG4gICAgICAgICAgICB2YXIgY2xlYXJJY29uID0gJChcIjxzcGFuPlwiKS5hZGRDbGFzcygnZmlsdGVyQ2xlYXJJY29uJyk7XG4gICAgICAgICAgICB0aGlzLnBsYWludGV4dFRpdGxlRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJIZWFkJykuYXBwZW5kKGNsZWFySWNvbikuYXBwZW5kKHRleHRUaXRsZSlbMF07XG5cbiAgICAgICAgICAgICQoc0JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKSlcbiAgICAgICAgICAgICAgICAuYXR0cih7XG4gICAgICAgICAgICAgICAgICAgICdpZCc6IHNCb3hJRCxcbiAgICAgICAgICAgICAgICAgICAgJ25hbWUnOiBzQm94SUQsXG4gICAgICAgICAgICAgICAgICAgICdwbGFjZWhvbGRlcic6IHRoaXMuc2VjdGlvblRpdGxlLFxuICAgICAgICAgICAgICAgICAgICAnc2l6ZSc6IDE0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzQm94LnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0Jyk7IC8vIEpRdWVyeSAuYXR0cigpIGNhbm5vdCBzZXQgdGhpc1xuICAgICAgICAgICAgdGhpcy5zZWFyY2hCb3ggPSBzQm94O1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0d28gY2xlYXIgaWNvbnMgZm9yIHRoZSB0d28gdmVyc2lvbnMgb2YgdGhlIGhlYWRlciAod2l0aCBzZWFyY2ggYW5kIHdpdGhvdXQpXG4gICAgICAgICAgICB2YXIgc2VhcmNoQ2xlYXJJY29uID0gJChcIjxzcGFuPlwiKS5hZGRDbGFzcygnZmlsdGVyQ2xlYXJJY29uJyk7XG4gICAgICAgICAgICB0aGlzLnNlYXJjaEJveFRpdGxlRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJIZWFkU2VhcmNoJykuYXBwZW5kKHNlYXJjaENsZWFySWNvbikuYXBwZW5kKHNCb3gpWzBdO1xuXG4gICAgICAgICAgICB0aGlzLmNsZWFySWNvbnMgPSBjbGVhckljb24uYWRkKHNlYXJjaENsZWFySWNvbik7ICAgIC8vIENvbnNvbGlkYXRlIHRoZSB0d28gSlF1ZXJ5IGVsZW1lbnRzIGludG8gb25lXG5cbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucy5vbignY2xpY2snLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBDaGFuZ2luZyB0aGUgY2hlY2tlZCBzdGF0dXMgd2lsbCBhdXRvbWF0aWNhbGx5IHRyaWdnZXIgYSByZWZyZXNoIGV2ZW50XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMuY2hlY2tib3hlcyB8fCB7fSwgKGlkOiBudW1iZXIsIGNoZWNrYm94OiBKUXVlcnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tib3gucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWm9uZURpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFTY3JvbGxab25lJylbMF07XG4gICAgICAgICAgICB0aGlzLmZpbHRlcmluZ1RhYmxlID0gJChcIjx0YWJsZT5cIilcbiAgICAgICAgICAgICAgICAuYWRkQ2xhc3MoJ2ZpbHRlckNyaXRlcmlhVGFibGUgZHJhZ2JveGVzJylcbiAgICAgICAgICAgICAgICAuYXR0cih7ICdjZWxscGFkZGluZyc6IDAsICdjZWxsc3BhY2luZyc6IDAgfSlcbiAgICAgICAgICAgICAgICAuYXBwZW5kKHRoaXMudGFibGVCb2R5RWxlbWVudCA9IDxIVE1MVGFibGVFbGVtZW50PiQoXCI8dGJvZHk+XCIpWzBdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ5IGNhbGxpbmcgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2gsIHdlIGdvIHRocm91Z2ggdGhlIHJlY29yZHMgYW5kIGZpbmQgYWxsIHRoZSB1bmlxdWVcbiAgICAgICAgLy8gdmFsdWVzIGluIHRoZW0gKGZvciB0aGUgY3JpdGVyaWEgdGhpcyBwYXJ0aWN1bGFyIGZpbHRlciBpcyBiYXNlZCBvbi4pXG4gICAgICAgIC8vIE5leHQgd2UgY3JlYXRlIGFuIGludmVydGVkIHZlcnNpb24gb2YgdGhhdCBkYXRhIHN0cnVjdHVyZSwgc28gdGhhdCB0aGUgdW5pcXVlIGlkZW50aWZpZXJzXG4gICAgICAgIC8vIHdlJ3ZlIGNyZWF0ZWQgbWFwIHRvIHRoZSB2YWx1ZXMgdGhleSByZXByZXNlbnQsIGFzIHdlbGwgYXMgYW4gYXJyYXlcbiAgICAgICAgLy8gb2YgdGhlIHVuaXF1ZSBpZGVudGlmaWVycyBzb3J0ZWQgYnkgdGhlIHZhbHVlcy4gIFRoZXNlIGFyZSB3aGF0IHdlJ2xsIHVzZSB0byBjb25zdHJ1Y3RcbiAgICAgICAgLy8gdGhlIHJvd3Mgb2YgY3JpdGVyaWEgdmlzaWJsZSBpbiB0aGUgZmlsdGVyJ3MgVUkuXG4gICAgICAgIHBvcHVsYXRlRmlsdGVyRnJvbVJlY29yZElEcyhpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgY3JTZXQ6IG51bWJlcltdLCBjSGFzaDogVW5pcXVlSURUb1ZhbHVlO1xuICAgICAgICAgICAgdGhpcy51cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHMpO1xuICAgICAgICAgICAgY3JTZXQgPSBbXTtcbiAgICAgICAgICAgIGNIYXNoID0ge307XG4gICAgICAgICAgICAvLyBDcmVhdGUgYSByZXZlcnNlZCBoYXNoIHNvIGtleXMgbWFwIHZhbHVlcyBhbmQgdmFsdWVzIG1hcCBrZXlzXG4gICAgICAgICAgICAkLmVhY2godGhpcy51bmlxdWVJbmRleGVzLCAodmFsdWU6IHN0cmluZywgdW5pcXVlSUQ6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGNIYXNoW3VuaXF1ZUlEXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIGNyU2V0LnB1c2godW5pcXVlSUQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBBbHBoYWJldGljYWxseSBzb3J0IGFuIGFycmF5IG9mIHRoZSBrZXlzIGFjY29yZGluZyB0byB2YWx1ZXNcbiAgICAgICAgICAgIGNyU2V0LnNvcnQoKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgX2E6c3RyaW5nID0gY0hhc2hbYV0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB2YXIgX2I6c3RyaW5nID0gY0hhc2hbYl0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gX2EgPCBfYiA/IC0xIDogX2EgPiBfYiA/IDEgOiAwO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlcyA9IGNIYXNoO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlciA9IGNyU2V0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSW4gdGhpcyBmdW5jdGlvbiAob3IgYXQgbGVhc3QgdGhlIHN1YmNsYXNzZWQgdmVyc2lvbnMgb2YgaXQpIHdlIGFyZSBydW5uaW5nIHRocm91Z2ggdGhlIGdpdmVuXG4gICAgICAgIC8vIGxpc3Qgb2YgbWVhc3VyZW1lbnQgKG9yIGFzc2F5KSBJRHMgYW5kIGV4YW1pbmluZyB0aGVpciByZWNvcmRzIGFuZCByZWxhdGVkIHJlY29yZHMsXG4gICAgICAgIC8vIGxvY2F0aW5nIHRoZSBwYXJ0aWN1bGFyIGZpZWxkIHdlIGFyZSBpbnRlcmVzdGVkIGluLCBhbmQgY3JlYXRpbmcgYSBsaXN0IG9mIGFsbCB0aGVcbiAgICAgICAgLy8gdW5pcXVlIHZhbHVlcyBmb3IgdGhhdCBmaWVsZC4gIEFzIHdlIGdvLCB3ZSBtYXJrIGVhY2ggdW5pcXVlIHZhbHVlIHdpdGggYW4gaW50ZWdlciBVSUQsXG4gICAgICAgIC8vIGFuZCBjb25zdHJ1Y3QgYSBoYXNoIHJlc29sdmluZyBlYWNoIHJlY29yZCB0byBvbmUgKG9yIHBvc3NpYmx5IG1vcmUpIG9mIHRob3NlIGludGVnZXIgVUlEcy5cbiAgICAgICAgLy8gVGhpcyBwcmVwYXJlcyB1cyBmb3IgcXVpY2sgZmlsdGVyaW5nIGxhdGVyIG9uLlxuICAgICAgICAvLyAoVGhpcyBnZW5lcmljIGZpbHRlciBkb2VzIG5vdGhpbmcsIGxlYXZpbmcgdGhlc2Ugc3RydWN0dXJlcyBibGFuay4pXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHRoaXMuZmlsdGVySGFzaCB8fCB7fTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHRoaXMudW5pcXVlSW5kZXhlcyB8fCB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlIGRpZG4ndCBjb21lIHVwIHdpdGggMiBvciBtb3JlIGNyaXRlcmlhLCB0aGVyZSBpcyBubyBwb2ludCBpbiBkaXNwbGF5aW5nIHRoZSBmaWx0ZXIsXG4gICAgICAgIC8vIHNpbmNlIGl0IGRvZXNuJ3QgcmVwcmVzZW50IGEgbWVhbmluZ2Z1bCBjaG9pY2UuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICBpZiAodGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBhZGRUb1BhcmVudChwYXJlbnREaXYpOnZvaWQge1xuICAgICAgICAgICAgcGFyZW50RGl2LmFwcGVuZENoaWxkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRldGFjaCgpOnZvaWQge1xuICAgICAgICAgICAgJCh0aGlzLmZpbHRlckNvbHVtbkRpdikuZGV0YWNoKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSdW5zIHRocm91Z2ggdGhlIHZhbHVlcyBpbiB1bmlxdWVWYWx1ZXNPcmRlciwgYWRkaW5nIGEgY2hlY2tib3ggYW5kIGxhYmVsIGZvciBlYWNoXG4gICAgICAgIC8vIGZpbHRlcmluZyB2YWx1ZSByZXByZXNlbnRlZC4gIElmIHRoZXJlIGFyZSBtb3JlIHRoYW4gMTUgdmFsdWVzLCB0aGUgZmlsdGVyIGdldHNcbiAgICAgICAgLy8gYSBzZWFyY2ggYm94IGFuZCBzY3JvbGxiYXIuXG4gICAgICAgIC8vIFRoZSBjaGVja2JveCwgYW5kIHRoZSB0YWJsZSByb3cgdGhhdCBlbmNsb3NlcyB0aGUgY2hlY2tib3ggYW5kIGxhYmVsLCBhcmUgc2F2ZWQgaW5cbiAgICAgICAgLy8gYSBkaWN0aW9uYXJ5IG1hcHBlZCBieSB0aGUgdW5pcXVlIHZhbHVlIHRoZXkgcmVwcmVzZW50LCBzbyB0aGV5IGNhbiBiZSByZS11c2VkIGlmIHRoZVxuICAgICAgICAvLyBmaWx0ZXIgaXMgcmVidWlsdCAoaS5lLiBpZiBwb3B1bGF0ZVRhYmxlIGlzIGNhbGxlZCBhZ2Fpbi4pXG4gICAgICAgIHBvcHVsYXRlVGFibGUoKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBmQ29sID0gJCh0aGlzLmZpbHRlckNvbHVtbkRpdik7XG5cbiAgICAgICAgICAgIGZDb2wuY2hpbGRyZW4oKS5kZXRhY2goKTtcbiAgICAgICAgICAgIC8vIE9ubHkgdXNlIHRoZSBzY3JvbGxpbmcgY29udGFpbmVyIGRpdiBpZiB0aGUgc2l6ZSBvZiB0aGUgbGlzdCB3YXJyYW50cyBpdCwgYmVjYXVzZVxuICAgICAgICAgICAgLy8gdGhlIHNjcm9sbGluZyBjb250YWluZXIgZGl2IGRlY2xhcmVzIGEgbGFyZ2UgcGFkZGluZyBtYXJnaW4gZm9yIHRoZSBzY3JvbGwgYmFyLFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgcGFkZGluZyBtYXJnaW4gd291bGQgYmUgYW4gZW1wdHkgd2FzdGUgb2Ygc3BhY2Ugb3RoZXJ3aXNlLlxuICAgICAgICAgICAgaWYgKHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMTApIHtcbiAgICAgICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLnNlYXJjaEJveFRpdGxlRGl2KS5hcHBlbmQodGhpcy5zY3JvbGxab25lRGl2KTtcbiAgICAgICAgICAgICAgICAvLyBDaGFuZ2UgdGhlIHJlZmVyZW5jZSBzbyB3ZSdyZSBhZmZlY3RpbmcgdGhlIGlubmVySFRNTCBvZiB0aGUgY29ycmVjdCBkaXYgbGF0ZXIgb25cbiAgICAgICAgICAgICAgICBmQ29sID0gJCh0aGlzLnNjcm9sbFpvbmVEaXYpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmQ29sLmFwcGVuZCh0aGlzLnBsYWludGV4dFRpdGxlRGl2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMuZmlsdGVyaW5nVGFibGUpO1xuXG4gICAgICAgICAgICB2YXIgdEJvZHkgPSB0aGlzLnRhYmxlQm9keUVsZW1lbnQ7XG4gICAgICAgICAgICAvLyBDbGVhciBvdXQgYW55IG9sZCB0YWJsZSBjb250ZW50c1xuICAgICAgICAgICAgJCh0aGlzLnRhYmxlQm9keUVsZW1lbnQpLmVtcHR5KCk7XG5cbiAgICAgICAgICAgIC8vIGxpbmUgbGFiZWwgY29sb3IgYmFzZWQgb24gZ3JhcGggY29sb3Igb2YgbGluZVxuICAgICAgICAgICAgaWYgKHRoaXMuc2VjdGlvblRpdGxlID09PSBcIkxpbmVcIikgeyAgICAvLyBUT0RPOiBGaW5kIGEgYmV0dGVyIHdheSB0byBpZGVudGlmeSB0aGlzIHNlY3Rpb25cbiAgICAgICAgICAgICAgICB2YXIgY29sb3JzOmFueSA9IHt9O1xuXG4gICAgICAgICAgICAgICAgLy9jcmVhdGUgbmV3IGNvbG9ycyBvYmplY3Qgd2l0aCBsaW5lIG5hbWVzIGEga2V5cyBhbmQgY29sb3IgaGV4IGFzIHZhbHVlc1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBFREREYXRhLkxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yc1tFREREYXRhLkxpbmVzW2tleV0ubmFtZV0gPSBjb2xvck9ialtrZXldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRm9yIGVhY2ggdmFsdWUsIGlmIGEgdGFibGUgcm93IGlzbid0IGFscmVhZHkgZGVmaW5lZCwgYnVpbGQgb25lLlxuICAgICAgICAgICAgLy8gVGhlcmUncyBleHRyYSBjb2RlIGluIGhlcmUgdG8gYXNzaWduIGNvbG9ycyB0byByb3dzIGluIHRoZSBMaW5lcyBmaWx0ZXJcbiAgICAgICAgICAgIC8vIHdoaWNoIHNob3VsZCBwcm9iYWJseSBiZSBpc29sYXRlZCBpbiBhIHN1YmNsYXNzLlxuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKCh1bmlxdWVJZDogbnVtYmVyKTogdm9pZCA9PiB7XG5cbiAgICAgICAgICAgICAgICB2YXIgY2JveE5hbWUsIGNlbGwsIHAsIHEsIHI7XG4gICAgICAgICAgICAgICAgY2JveE5hbWUgPSBbJ2ZpbHRlcicsIHRoaXMuc2VjdGlvblNob3J0TGFiZWwsICduJywgdW5pcXVlSWQsICdjYm94J10uam9pbignJyk7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IHRoaXMudGFibGVSb3dzW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV07XG4gICAgICAgICAgICAgICAgaWYgKCFyb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBhcHBlbmQgYSBuZXcgcm93IGluIGEgc2VwYXJhdGUgY2FsbDpcbiAgICAgICAgICAgICAgICAgICAgLy8gaW5zZXJ0Um93KCkgY3JlYXRlcywgYW5kIGFwcGVuZHMsIGFuZCByZXR1cm5zIG9uZS5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWJsZVJvd3NbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXSA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGVCb2R5RWxlbWVudC5pbnNlcnRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMudGFibGVSb3dzW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV0uaW5zZXJ0Q2VsbCgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXNbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXSA9ICQoXCI8aW5wdXQgdHlwZT0nY2hlY2tib3gnPlwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgLmF0dHIoeyAnbmFtZSc6IGNib3hOYW1lLCAnaWQnOiBjYm94TmFtZSB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLmFwcGVuZFRvKGNlbGwpO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCBjYm94TmFtZSkudGV4dCh0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF0pXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2VjdGlvblRpdGxlID09PSBcIkxpbmVcIikgeyAgICAvLyBUT0RPOiBGaW5kIGEgYmV0dGVyIHdheSB0byBpZGVudGlmeSB0aGlzIHNlY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsLmNzcygnZm9udC13ZWlnaHQnLCAnQm9sZCcpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gRURERGF0YS5MaW5lcykgeyAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYXNzaWdubWVudCB3aXRob3V0IHVzaW5nIGEgbG9vcFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2tleV0ubmFtZSA9PSB0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoRURERGF0YS5MaW5lc1trZXldWydpZGVudGlmaWVyJ10gPSBjYm94TmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkKHJvdykuYXBwZW5kVG8odGhpcy50YWJsZUJvZHlFbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIFRPRE86IERyYWcgc2VsZWN0IGlzIHR3aXRjaHkgLSBjbGlja2luZyBhIHRhYmxlIGNlbGwgYmFja2dyb3VuZCBzaG91bGQgY2hlY2sgdGhlIGJveCxcbiAgICAgICAgICAgIC8vIGV2ZW4gaWYgdGhlIHVzZXIgaXNuJ3QgaGl0dGluZyB0aGUgbGFiZWwgb3IgdGhlIGNoZWNrYm94IGl0c2VsZi5cbiAgICAgICAgICAgIC8vIEZpeGluZyB0aGlzIG1heSBtZWFuIGFkZGluZyBhZGRpdGlvbmFsIGNvZGUgdG8gdGhlIG1vdXNlZG93bi9tb3VzZW92ZXIgaGFuZGxlciBmb3IgdGhlXG4gICAgICAgICAgICAvLyB3aG9sZSB0YWJsZSAoY3VycmVudGx5IGluIFN0dWR5RGF0YVBhZ2UucHJlcGFyZUl0KCkpLlxuICAgICAgICAgICAgRHJhZ2JveGVzLmluaXRUYWJsZSh0aGlzLmZpbHRlcmluZ1RhYmxlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybnMgdHJ1ZSBpZiBhbnkgb2YgdGhpcyBmaWx0ZXIncyBVSSAoY2hlY2tib3hlcywgc2VhcmNoIGZpZWxkKVxuICAgICAgICAvLyBzaG93cyBhIGRpZmZlcmVudCBzdGF0ZSB0aGFuIHdoZW4gdGhpcyBmdW5jdGlvbiB3YXMgbGFzdCBjYWxsZWQuXG4gICAgICAgIC8vIFRoaXMgaXMgYWNjb21wbGlzaGVkIGJ5IGtlZXBpbmcgYSBkaWN0aW9uYXJ5IC0gcHJldmlvdXNDaGVja2JveFN0YXRlIC0gdGhhdCBpcyBvcmdhbml6ZWQgYnlcbiAgICAgICAgLy8gdGhlIHNhbWUgdW5pcXVlIGNyaXRlcmlhIHZhbHVlcyBhcyB0aGUgY2hlY2tib3hlcy5cbiAgICAgICAgLy8gV2UgYnVpbGQgYSByZWxwYWNlbWVudCBmb3IgdGhpcyBkaWN0aW9uYXJ5LCBhbmQgY29tcGFyZSBpdHMgY29udGVudHMgd2l0aCB0aGUgb2xkIG9uZS5cbiAgICAgICAgLy8gRWFjaCBjaGVja2JveCBjYW4gaGF2ZSBvbmUgb2YgdGhyZWUgcHJpb3Igc3RhdGVzLCBlYWNoIHJlcHJlc2VudGVkIGluIHRoZSBkaWN0aW9uYXJ5IGJ5IGEgbGV0dGVyOlxuICAgICAgICAvLyBcIkNcIiAtIGNoZWNrZWQsIFwiVVwiIC0gdW5jaGVja2VkLCBcIk5cIiAtIGRvZXNuJ3QgZXhpc3QgKGluIHRoZSBjdXJyZW50bHkgdmlzaWJsZSBzZXQuKVxuICAgICAgICAvLyBXZSBhbHNvIGNvbXBhcmUgdGhlIGN1cnJlbnQgY29udGVudCBvZiB0aGUgc2VhcmNoIGJveCB3aXRoIHRoZSBvbGQgY29udGVudC5cbiAgICAgICAgLy8gTm90ZTogUmVnYXJkbGVzcyBvZiB3aGVyZSBvciB3aGV0aGVyIHdlIGZpbmQgYSBkaWZmZXJlbmNlLCBpdCBpcyBpbXBvcnRhbnQgdGhhdCB3ZSBmaW5pc2hcbiAgICAgICAgLy8gYnVpbGRpbmcgdGhlIHJlcGxhY2VtZW50IHZlcnNpb24gb2YgcHJldmlvdXNDaGVja2JveFN0YXRlLlxuICAgICAgICAvLyBTbyB0aG91Z2ggaXQncyB0ZW1wdGluZyB0byBleGl0IGVhcmx5IGZyb20gdGhlc2UgbG9vcHMsIGl0IHdvdWxkIG1ha2UgYSBtZXNzLlxuICAgICAgICBhbnlGaWx0ZXJTZXR0aW5nc0NoYW5nZWRTaW5jZUxhc3RJbnF1aXJ5KCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgY3VycmVudENoZWNrYm94U3RhdGU6IFZhbHVlVG9TdHJpbmcgPSB7fSxcbiAgICAgICAgICAgICAgICB2OiBzdHJpbmcgPSAkKHRoaXMuc2VhcmNoQm94KS52YWwoKTtcbiAgICAgICAgICAgIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKCh1bmlxdWVJZDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94OiBKUXVlcnkgPSB0aGlzLmNoZWNrYm94ZXNbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXTtcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudCwgcHJldmlvdXM7XG4gICAgICAgICAgICAgICAgLy8gXCJDXCIgLSBjaGVja2VkLCBcIlVcIiAtIHVuY2hlY2tlZCwgXCJOXCIgLSBkb2Vzbid0IGV4aXN0XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IChjaGVja2JveC5wcm9wKCdjaGVja2VkJykgJiYgIWNoZWNrYm94LnByb3AoJ2Rpc2FibGVkJykpID8gJ0MnIDogJ1UnO1xuICAgICAgICAgICAgICAgIHByZXZpb3VzID0gdGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXSB8fCAnTic7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQgIT09IHByZXZpb3VzKSBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gJ0MnKSB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2hlY2tib3hTdGF0ZVt0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dID0gY3VycmVudDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmNsZWFySWNvbnMudG9nZ2xlQ2xhc3MoJ2VuYWJsZWQnLCB0aGlzLmFueUNoZWNrYm94ZXNDaGVja2VkKTtcblxuICAgICAgICAgICAgdiA9IHYudHJpbSgpOyAgICAgICAgICAgICAgICAvLyBSZW1vdmUgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxuICAgICAgICAgICAgdiA9IHYudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHYgPSB2LnJlcGxhY2UoL1xcc1xccyovLCAnICcpOyAvLyBSZXBsYWNlIGludGVybmFsIHdoaXRlc3BhY2Ugd2l0aCBzaW5nbGUgc3BhY2VzXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb24gPSB2O1xuICAgICAgICAgICAgaWYgKHYgIT09IHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXZpb3VzU2VhcmNoU2VsZWN0aW9uID0gdjtcbiAgICAgICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFjaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZW4ndCBkZXRlY3RlZCBhbnkgY2hhbmdlIHNvIGZhciwgdGhlcmUgaXMgb25lIG1vcmUgYW5nbGUgdG8gY292ZXI6XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2tib3hlcyB0aGF0IHVzZWQgdG8gZXhpc3QsIGJ1dCBoYXZlIHNpbmNlIGJlZW4gcmVtb3ZlZCBmcm9tIHRoZSBzZXQuXG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlLCAodW5pcXVlVmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRDaGVja2JveFN0YXRlW3VuaXF1ZVZhbHVlXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGl0IHdhcyB0YWtlbiBvdXQgb2YgdGhlIHNldCwgY2xlYXIgaXQgc28gaXQgd2lsbCBiZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmxhbmsgd2hlbiByZS1hZGRlZCBsYXRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlc1t1bmlxdWVWYWx1ZV0ucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGUgPSBjdXJyZW50Q2hlY2tib3hTdGF0ZTtcbiAgICAgICAgICAgIHJldHVybiBjaGFuZ2VkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGFrZXMgYSBzZXQgb2YgcmVjb3JkIElEcywgYW5kIGlmIGFueSBjaGVja2JveGVzIGluIHRoZSBmaWx0ZXIncyBVSSBhcmUgY2hlY2tlZCxcbiAgICAgICAgLy8gdGhlIElEIHNldCBpcyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgICAgICAvLyBJbiBhZGRpdGlvbiwgY2hlY2tib3hlcyB3aG9zZSB2YWx1ZXMgYXJlIG5vdCByZXByZXNlbnRlZCBhbnl3aGVyZSBpbiB0aGUgaW5jb21pbmcgSURzXG4gICAgICAgIC8vIGFyZSB0ZW1wb3JhcmlseSBkaXNhYmxlZCBhbmQgc29ydGVkIHRvIHRoZSBib3R0b20gb2YgdGhlIGxpc3QsIHZpc3VhbGx5IGluZGljYXRpbmdcbiAgICAgICAgLy8gdG8gYSB1c2VyIHRoYXQgdGhvc2UgdmFsdWVzIGFyZSBub3QgYXZhaWxhYmxlIGZvciBmdXJ0aGVyIGZpbHRlcmluZy5cbiAgICAgICAgLy8gVGhlIG5hcnJvd2VkIHNldCBvZiBJRHMgaXMgdGhlbiByZXR1cm5lZCwgZm9yIHVzZSBieSB0aGUgbmV4dCBmaWx0ZXIuXG4gICAgICAgIGFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoaWRzOmFueVtdKTphbnkge1xuICAgICAgICAgICAgLy8gSWYgdGhlIGZpbHRlciBvbmx5IGNvbnRhaW5zIG9uZSBpdGVtLCBpdCdzIHBvaW50bGVzcyB0byBhcHBseSBpdC5cbiAgICAgICAgICAgIGlmICghdGhpcy5pc0ZpbHRlclVzZWZ1bCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlkcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGlkc1Bvc3RGaWx0ZXJpbmc6IGFueVtdO1xuXG4gICAgICAgICAgICB2YXIgdXNlU2VhcmNoQm94OmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgIHZhciBxdWVyeVN0cnMgPSBbXTtcblxuICAgICAgICAgICAgdmFyIHYgPSB0aGlzLmN1cnJlbnRTZWFyY2hTZWxlY3Rpb247XG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYubGVuZ3RoID49IHRoaXMubWluQ2hhcnNUb1RyaWdnZXJTZWFyY2gpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUgYXJlIG11bHRpcGxlIHdvcmRzLCB3ZSBtYXRjaCBlYWNoIHNlcGFyYXRlbHkuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgbm90IGF0dGVtcHQgdG8gbWF0Y2ggYWdhaW5zdCBlbXB0eSBzdHJpbmdzLCBzbyB3ZSBmaWx0ZXIgdGhvc2Ugb3V0IGlmXG4gICAgICAgICAgICAgICAgICAgIC8vIGFueSBzbGlwcGVkIHRocm91Z2guXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5U3RycyA9IHYuc3BsaXQoL1xccysvKS5maWx0ZXIoKG9uZSkgPT4geyByZXR1cm4gb25lLmxlbmd0aCA+IDA7IH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgdXNlciBtaWdodCBoYXZlIHBhc3RlZC90eXBlZCBvbmx5IHdoaXRlc3BhY2UsIHNvOlxuICAgICAgICAgICAgICAgICAgICBpZiAocXVlcnlTdHJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVzZVNlYXJjaEJveCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nID0ge307XG5cbiAgICAgICAgICAgIGlkc1Bvc3RGaWx0ZXJpbmcgPSBpZHMuZmlsdGVyKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwYXNzOiBib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBmaWx0ZXJpbmcgZGF0YSBmb3IgdGhpcyBpZCwgdXNlIGl0LlxuICAgICAgICAgICAgICAgIC8vIElmIHdlIGRvbid0LCB0aGUgaWQgcHJvYmFibHkgYmVsb25ncyB0byBzb21lIG90aGVyIG1lYXN1cmVtZW50IGNhdGVnb3J5LFxuICAgICAgICAgICAgICAgIC8vIHNvIHdlIGlnbm9yZSBpdC5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maWx0ZXJIYXNoW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiBhbnkgb2YgdGhpcyBJRCdzIGNyaXRlcmlhIGFyZSBjaGVja2VkLCB0aGlzIElEIHBhc3NlcyB0aGUgZmlsdGVyLlxuICAgICAgICAgICAgICAgICAgICAvLyBOb3RlIHRoYXQgd2UgY2Fubm90IG9wdGltaXplIHRvIHVzZSAnLnNvbWUnIGhlcmUgYmVjdWFzZSB3ZSBuZWVkIHRvXG4gICAgICAgICAgICAgICAgICAgIC8vIGxvb3AgdGhyb3VnaCBhbGwgdGhlIGNyaXRlcmlhIHRvIHNldCB2YWx1ZXNWaXNpYmxlUHJlRmlsdGVyaW5nLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbaWRdLmZvckVhY2goKGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbWF0Y2g6Ym9vbGVhbiA9IHRydWUsIHRleHQ6c3RyaW5nO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVzZVNlYXJjaEJveCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRleHQgPSB0aGlzLnVuaXF1ZVZhbHVlc1tpbmRleF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaCA9IHF1ZXJ5U3Rycy5zb21lKCh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0ZXh0Lmxlbmd0aCA+PSB2Lmxlbmd0aCAmJiB0ZXh0LmluZGV4T2YodikgPj0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmdbaW5kZXhdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoKHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlW3RoaXMudW5pcXVlVmFsdWVzW2luZGV4XV0gPT09ICdDJykgfHwgIXRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFzcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhc3M7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQXBwbHkgZW5hYmxlZC9kaXNhYmxlZCBzdGF0dXMgYW5kIG9yZGVyaW5nOlxuICAgICAgICAgICAgdmFyIHJvd3NUb0FwcGVuZCA9IFtdO1xuICAgICAgICAgICAgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5mb3JFYWNoKChjcklEKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNoZWNrYm94OiBKUXVlcnkgPSB0aGlzLmNoZWNrYm94ZXNbdGhpcy51bmlxdWVWYWx1ZXNbY3JJRF1dLFxuICAgICAgICAgICAgICAgICAgICByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQgPSB0aGlzLnRhYmxlUm93c1t0aGlzLnVuaXF1ZVZhbHVlc1tjcklEXV0sXG4gICAgICAgICAgICAgICAgICAgIHNob3c6IGJvb2xlYW4gPSAhIXZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmdbY3JJRF07XG4gICAgICAgICAgICAgICAgY2hlY2tib3gucHJvcCgnZGlzYWJsZWQnLCAhc2hvdylcbiAgICAgICAgICAgICAgICAkKHJvdykudG9nZ2xlQ2xhc3MoJ25vZGF0YScsICFzaG93KTtcbiAgICAgICAgICAgICAgICBpZiAoc2hvdykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRhYmxlQm9keUVsZW1lbnQuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByb3dzVG9BcHBlbmQucHVzaChyb3cpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gQXBwZW5kIGFsbCB0aGUgcm93cyB3ZSBkaXNhYmxlZCwgYXMgYSBsYXN0IHN0ZXAsXG4gICAgICAgICAgICAvLyBzbyB0aGV5IGdvIHRvIHRoZSBib3R0b20gb2YgdGhlIHRhYmxlLlxuICAgICAgICAgICAgcm93c1RvQXBwZW5kLmZvckVhY2goKHJvdykgPT4gdGhpcy50YWJsZUJvZHlFbGVtZW50LmFwcGVuZENoaWxkKHJvdykpO1xuXG4gICAgICAgICAgICByZXR1cm4gaWRzUG9zdEZpbHRlcmluZztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEEgZmV3IHV0aWxpdHkgZnVuY3Rpb25zOlxuICAgICAgICBfYXNzYXlJZFRvQXNzYXkoYXNzYXlJZDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgfVxuICAgICAgICBfYXNzYXlJZFRvTGluZShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9Qcm90b2NvbChhc3NheUlkOnN0cmluZyk6IFByb3RvY29sUmVjb3JkIHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSByZXR1cm4gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPbmUgb2YgdGhlIGhpZ2hlc3QtbGV2ZWwgZmlsdGVyczogU3RyYWluLlxuICAgIC8vIE5vdGUgdGhhdCBhbiBBc3NheSdzIExpbmUgY2FuIGhhdmUgbW9yZSB0aGFuIG9uZSBTdHJhaW4gYXNzaWduZWQgdG8gaXQsXG4gICAgLy8gd2hpY2ggaXMgYW4gZXhhbXBsZSBvZiB3aHkgJ3RoaXMuZmlsdGVySGFzaCcgaXMgYnVpbHQgd2l0aCBhcnJheXMuXG4gICAgZXhwb3J0IGNsYXNzIFN0cmFpbkZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdTdHJhaW4nLCAnc3QnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBzdHJhaW4gbmFtZVxuICAgICAgICAgICAgICAgIChsaW5lLnN0cmFpbiB8fCBbXSkuZm9yRWFjaCgoc3RyYWluSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3RyYWluID0gRURERGF0YS5TdHJhaW5zW3N0cmFpbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0cmFpbiAmJiBzdHJhaW4ubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzdHJhaW4ubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEp1c3QgYXMgd2l0aCB0aGUgU3RyYWluIGZpbHRlciwgYW4gQXNzYXkncyBMaW5lIGNhbiBoYXZlIG1vcmUgdGhhbiBvbmVcbiAgICAvLyBDYXJib24gU291cmNlIGFzc2lnbmVkIHRvIGl0LlxuICAgIGV4cG9ydCBjbGFzcyBDYXJib25Tb3VyY2VGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnQ2FyYm9uIFNvdXJjZScsICdjcycpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuY2FyYm9uIHx8IFtdKS5mb3JFYWNoKChjYXJib25JZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNyYyA9IEVERERhdGEuQ1NvdXJjZXNbY2FyYm9uSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3JjICYmIHNyYy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3NyYy5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSAnQ2FyYm9uIFNvdXJjZSBMYWJlbGluZycgZmllbGQgZm9yIGVhY2ggQXNzYXkncyBMaW5lXG4gICAgZXhwb3J0IGNsYXNzIENhcmJvbkxhYmVsaW5nRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0xhYmVsaW5nJywgJ2wnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIGNhcmJvbiBzb3VyY2UgbGFiZWxpbmcgZGVzY3JpcHRpb25cbiAgICAgICAgICAgICAgICAobGluZS5jYXJib24gfHwgW10pLmZvckVhY2goKGNhcmJvbklkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3JjID0gRURERGF0YS5DU291cmNlc1tjYXJib25JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzcmMgJiYgc3JjLmxhYmVsaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLmxhYmVsaW5nXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBuYW1lIG9mIGVhY2ggQXNzYXkncyBMaW5lXG4gICAgZXhwb3J0IGNsYXNzIExpbmVOYW1lRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0xpbmUnLCAnbG4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tsaW5lLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBQcm90b2NvbCBvZiBlYWNoIEFzc2F5XG4gICAgZXhwb3J0IGNsYXNzIFByb3RvY29sRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ1Byb3RvY29sJywgJ3AnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvdG9jb2w6IFByb3RvY29sUmVjb3JkID0gdGhpcy5fYXNzYXlJZFRvUHJvdG9jb2woYXNzYXlJZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdG9jb2wubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBuYW1lIG9mIGVhY2ggQXNzYXlcbiAgICBleHBvcnQgY2xhc3MgQXNzYXlGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnQXNzYXknLCAnYScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXkubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW2Fzc2F5Lm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgY2xhc3MgZGVmaW5pbmcgc29tZSBhZGRpdGlvbmFsIGxvZ2ljIGZvciBtZXRhZGF0YS10eXBlIGZpbHRlcnMsXG4gICAgLy8gbWVhbnQgdG8gYmUgc3ViY2xhc3NlZC4gIE5vdGUgaG93IHdlIHBhc3MgaW4gdGhlIHBhcnRpY3VsYXIgbWV0YWRhdGEgd2VcbiAgICAvLyBhcmUgY29uc3RydWN0aW5nIHRoaXMgZmlsdGVyIGZvciwgaW4gdGhlIGNvbnN0cnVjdG9yLlxuICAgIC8vIFVubGlrZSB0aGUgb3RoZXIgZmlsdGVycywgd2Ugd2lsbCBiZSBpbnN0YW50aWF0aW5nIG1vcmUgdGhhbiBvbmUgb2YgdGhlc2UuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICBtZXRhRGF0YUlEOnN0cmluZztcbiAgICAgICAgcHJlOnN0cmluZztcbiAgICAgICAgcG9zdDpzdHJpbmc7XG5cbiAgICAgICAgY29uc3RydWN0b3IobWV0YURhdGFJRDpzdHJpbmcpIHtcbiAgICAgICAgICAgIHN1cGVyKCk7XG4gICAgICAgICAgICB2YXIgTURUID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW21ldGFEYXRhSURdO1xuICAgICAgICAgICAgdGhpcy5tZXRhRGF0YUlEID0gbWV0YURhdGFJRDtcbiAgICAgICAgICAgIHRoaXMucHJlID0gTURULnByZSB8fCAnJztcbiAgICAgICAgICAgIHRoaXMucG9zdCA9IE1EVC5wb3N0IHx8ICcnO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoRURERGF0YS5NZXRhRGF0YVR5cGVzW3RoaXMubWV0YURhdGFJRF0ubmFtZSwgJ21kJyt0aGlzLm1ldGFEYXRhSUQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIExpbmVNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTogYW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fSwgdmFsdWUgPSAnKEVtcHR5KSc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLm1ldGEgJiYgbGluZS5tZXRhW3RoaXMubWV0YURhdGFJRF0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBbIHRoaXMucHJlLCBsaW5lLm1ldGFbdGhpcy5tZXRhRGF0YUlEXSwgdGhpcy5wb3N0IF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5TWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5OiBhbnkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKSB8fCB7fSwgdmFsdWUgPSAnKEVtcHR5KSc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5tZXRhICYmIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGFzc2F5Lm1ldGFbdGhpcy5tZXRhRGF0YUlEXSwgdGhpcy5wb3N0IF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSA9IHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhlc2UgcmVtYWluaW5nIGZpbHRlcnMgd29yayBvbiBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzLlxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBjb21wYXJ0bWVudCBvZiBlYWNoIE1ldGFib2xpdGUuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVDb21wYXJ0bWVudEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIE5PVEU6IHRoaXMgZmlsdGVyIGNsYXNzIHdvcmtzIHdpdGggTWVhc3VyZW1lbnQgSURzIHJhdGhlciB0aGFuIEFzc2F5IElEc1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnQ29tcGFydG1lbnQnLCAnY29tJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgdmFsdWU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVDb21wYXJ0bWVudHNbbWVhc3VyZS5jb21wYXJ0bWVudF0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZ2VuZXJpYyBmaWx0ZXIgZm9yIE1lYXN1cmVtZW50cywgbWVhbnQgdG8gYmUgc3ViY2xhc3NlZC5cbiAgICAvLyBJdCBpbnRyb2R1Y2VzIGEgJ2xvYWRQZW5kaW5nJyBhdHRyaWJ1dGUsIHdoaWNoIGlzIHVzZWQgdG8gbWFrZSB0aGUgZmlsdGVyXG4gICAgLy8gYXBwZWFyIGluIHRoZSBVSSBldmVuIGlmIGl0IGhhcyBubyBkYXRhLCBiZWNhdXNlIHdlIGFudGljaXBhdGUgZGF0YSB0byBldmVudHVhbGx5XG4gICAgLy8gYXBwZWFyIGluIGl0LlxuICAgIC8vICAgICAgVGhlIGlkZWEgaXMsIHdlIGtub3cgd2hldGhlciB0byBpbnN0YW50aWF0ZSBhIGdpdmVuIHN1YmNsYXNzIG9mIHRoaXMgZmlsdGVyIGJ5XG4gICAgLy8gbG9va2luZyBhdCB0aGUgbWVhc3VyZW1lbnQgY291bnQgZm9yIGVhY2ggQXNzYXksIHdoaWNoIGlzIGdpdmVuIHRvIHVzIGluIHRoZSBmaXJzdFxuICAgIC8vIGNodW5rIG9mIGRhdGEgZnJvbSB0aGUgc2VydmVyLiAgU28sIHdlIGluc3RhbnRpYXRlIGl0LCB0aGVuIGl0IGFwcGVhcnMgaW4gYVxuICAgIC8vICdsb2FkIHBlbmRpbmcnIHN0YXRlIHVudGlsIGFjdHVhbCBtZWFzdXJlbWVudCB2YWx1ZXMgYXJlIHJlY2VpdmVkIGZyb20gdGhlIHNlcnZlci5cbiAgICBleHBvcnQgY2xhc3MgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBXaGVuZXZlciB0aGlzIGZpbHRlciBpcyBpbnN0YW50aWF0ZWQsIHdlXG4gICAgICAgIGxvYWRQZW5kaW5nOiBib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSh0aXRsZTpzdHJpbmcsIHNob3J0TGFiZWw6c3RyaW5nKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSh0aXRsZSwgc2hvcnRMYWJlbCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPdmVycmlkaW5nIHRvIG1ha2UgdXNlIG9mIGxvYWRQZW5kaW5nLlxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgbmFtZXMgb2YgR2VuZXJhbCBNZWFzdXJlbWVudHMuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVyYWxNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24ge1xuICAgICAgICAvLyBXaGVuZXZlciB0aGlzIGZpbHRlciBpcyBpbnN0YW50aWF0ZWQsIHdlXG4gICAgICAgIGxvYWRQZW5kaW5nOiBib29sZWFuO1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdNZWFzdXJlbWVudCcsICdtbScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5sb2FkUGVuZGluZyB8fCB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA+IDA7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChtSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIG1JZHMuZm9yRWFjaCgobWVhc3VyZUlkOiBzdHJpbmcpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHZhciBtVHlwZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1UeXBlID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChtVHlwZSAmJiBtVHlwZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW21UeXBlLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBuYW1lcyBvZiBNZXRhYm9saXRlIE1lYXN1cmVtZW50cy5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdNZXRhYm9saXRlJywgJ21lJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgbWV0YWJvbGl0ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGFib2xpdGUgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAobWV0YWJvbGl0ZSAmJiBtZXRhYm9saXRlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttZXRhYm9saXRlLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgbmFtZXMgb2YgUHJvdGVpbiBNZWFzdXJlbWVudHMuXG4gICAgZXhwb3J0IGNsYXNzIFByb3RlaW5GaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnUHJvdGVpbicsICdwcicpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIHByb3RlaW46IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3RlaW4gJiYgcHJvdGVpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbcHJvdGVpbi5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIG5hbWVzIG9mIEdlbmUgTWVhc3VyZW1lbnRzLlxuICAgIGV4cG9ydCBjbGFzcyBHZW5lRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ0dlbmUnLCAnZ24nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBnZW5lOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2VuZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChnZW5lICYmIGdlbmUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2dlbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGUgcGFnZSBsb2Fkcy5cbiAgICBleHBvcnQgZnVuY3Rpb24gcHJlcGFyZUl0KCkge1xuXG4gICAgICAgIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0ID0gbmV3IFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0KCk7XG4gICAgICAgIHBvc3RGaWx0ZXJpbmdBc3NheXMgPSBbXTtcbiAgICAgICAgcG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cyA9IFtdO1xuXG4gICAgICAgIC8vIEJ5IGRlZmF1bHQsIHdlIGFsd2F5cyBzaG93IHRoZSBncmFwaFxuICAgICAgICB2aWV3aW5nTW9kZSA9ICdsaW5lZ3JhcGgnO1xuICAgICAgICBiYXJHcmFwaE1vZGUgPSAnbWVhc3VyZW1lbnQnO1xuICAgICAgICBiYXJHcmFwaFR5cGVCdXR0b25zSlEgPSAkKCcjYmFyR3JhcGhUeXBlQnV0dG9ucycpO1xuICAgICAgICBhY3Rpb25QYW5lbElzSW5Cb3R0b21CYXIgPSBmYWxzZTtcbiAgICAgICAgLy8gU3RhcnQgb3V0IHdpdGggZXZlcnkgZGlzcGxheSBtb2RlIG5lZWRpbmcgYSByZWZyZXNoXG4gICAgICAgIHZpZXdpbmdNb2RlSXNTdGFsZSA9IHtcbiAgICAgICAgICAgICdsaW5lZ3JhcGgnOiB0cnVlLFxuICAgICAgICAgICAgJ2JhcmdyYXBoJzogdHJ1ZSxcbiAgICAgICAgICAgICd0YWJsZSc6IHRydWVcbiAgICAgICAgfTtcbiAgICAgICAgcmVmcmVzRGF0YURpc3BsYXlJZlN0YWxlVGltZXIgPSBudWxsO1xuXG4gICAgICAgIGNvbG9yT2JqID0gbnVsbDtcblxuICAgICAgICBhc3NheXNEYXRhR3JpZFNwZWMgPSBudWxsO1xuICAgICAgICBhc3NheXNEYXRhR3JpZCA9IG51bGw7XG5cbiAgICAgICAgYWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBudWxsO1xuXG4gICAgICAgICQoJyNzdHVkeUFzc2F5c1RhYmxlJykudG9vbHRpcCh7XG4gICAgICAgICAgICBjb250ZW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICQodGhpcykucHJvcCgndGl0bGUnKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwb3NpdGlvbjogeyBteTogXCJsZWZ0LTUwIGNlbnRlclwiLCBhdDogXCJyaWdodCBjZW50ZXJcIiB9LFxuICAgICAgICAgICAgc2hvdzogbnVsbCxcbiAgICAgICAgICAgIGNsb3NlOiBmdW5jdGlvbiAoZXZlbnQsIHVpOmFueSkge1xuICAgICAgICAgICAgICAgIHVpLnRvb2x0aXAuaG92ZXIoXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAkKHRoaXMpLnN0b3AodHJ1ZSkuZmFkZVRvKDQwMCwgMSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcykuZmFkZU91dChcIjQwMFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAkKHRoaXMpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gVGhpcyBvbmx5IGFkZHMgY29kZSB0aGF0IHR1cm5zIHRoZSBvdGhlciBidXR0b25zIG9mZiB3aGVuIGEgYnV0dG9uIGlzIG1hZGUgYWN0aXZlLFxuICAgICAgICAvLyBhbmQgZG9lcyB0aGUgc2FtZSB0byBlbGVtZW50cyBuYW1lZCBpbiB0aGUgJ2ZvcicgYXR0cmlidXRlcyBvZiBlYWNoIGJ1dHRvbi5cbiAgICAgICAgLy8gV2Ugc3RpbGwgbmVlZCB0byBhZGQgb3VyIG93biByZXNwb25kZXJzIHRvIGFjdHVhbGx5IGRvIHN0dWZmLlxuICAgICAgICBVdGwuQnV0dG9uQmFyLnByZXBhcmVCdXR0b25CYXJzKCk7XG4gICAgICAgIGNvcHlBY3Rpb25CdXR0b25zKCk7XG4gICAgICAgIC8vIFByZXBlbmQgc2hvdy9oaWRlIGZpbHRlciBidXR0b24gZm9yIGJldHRlciBhbGlnbm1lbnRcbiAgICAgICAgLy8gTm90ZTogdGhpcyB3aWxsIGJlIHJlbW92ZWQgd2hlbiB3ZSBpbXBsZW1lbnQgbGVmdCBzaWRlIGZpbHRlcmluZ1xuXG4gICAgICAgIC8vd2hlbiBhbGwgYWpheCByZXF1ZXN0cyBhcmUgZmluaXNoZWQsIGRldGVybWluZSBpZiB0aGVyZSBhcmUgQXNzYXlNZWFzdXJlbWVudHMuXG4gICAgICAgICQoZG9jdW1lbnQpLmFqYXhTdG9wKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy8gc2hvdyBhc3NheSB0YWJsZSBieSBkZWZhdWx0IGlmIHRoZXJlIGFyZSBhc3NheXMgYnV0IG5vIGFzc2F5IG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgaWYgKF8ua2V5cyhFREREYXRhLkFzc2F5cykubGVuZ3RoID4gMCAmJiBfLmtleXMoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgLy9UT0RPOiBjcmVhdGUgcHJlcGFyZSBpdCBmb3Igbm8gZGF0YT9cbiAgICAgICAgICAgICAgICAkKCcjZGF0YVRhYmxlQnV0dG9uJykuY2xpY2soKTtcbiAgICAgICAgICAgICAgICAkKCcuZXhwb3J0QnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCB0cnVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJCgnLmV4cG9ydEJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAkKFwiI2RhdGFUYWJsZUJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZpZXdpbmdNb2RlID0gJ3RhYmxlJztcbiAgICAgICAgICAgIHF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCk7XG4gICAgICAgICAgICBtYWtlTGFiZWxzQmxhY2soRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOiBcIiNkYXRhVGFibGVCdXR0b25cIiwgJ3R5cGUnOiB2aWV3aW5nTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICAgICAgJChcIiN0YWJsZUNvbnRyb2xzQXJlYVwiKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKFwiI2ZpbHRlckNvbnRyb2xzQXJlYVwiKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKFwiLnRhYmxlQWN0aW9uQnV0dG9uc1wiKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBiYXJHcmFwaFR5cGVCdXR0b25zSlEuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgICAgICAvL1RPRE86IGVuYWJsZSB1c2VycyB0byBleHBvcnQgZmlsdGVyZWQgZGF0YSBmcm9tIGdyYXBoXG4gICAgICAgICAgICAkKCcuZXhwb3J0QnV0dG9uJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL2NsaWNrIGhhbmRsZXIgZm9yIGVkaXQgYXNzYXkgbWVhc3VyZW1lbnRzXG4gICAgICAgICQoJy5lZGl0TWVhc3VyZW1lbnRCdXR0b24nKS5jbGljayhmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICQoJ2lucHV0W25hbWU9XCJhc3NheV9hY3Rpb25cIl1bdmFsdWU9XCJlZGl0XCJdJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgJCgnYnV0dG9uW3ZhbHVlPVwiYXNzYXlfYWN0aW9uXCJdJykuY2xpY2soKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9jbGljayBoYW5kbGVyIGZvciBkZWxldGUgYXNzYXkgbWVhc3VyZW1lbnRzXG4gICAgICAgICQoJy5kZWxldGVCdXR0b24nKS5jbGljayhmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICQoJ2lucHV0W25hbWU9XCJhc3NheV9hY3Rpb25cIl1bdmFsdWU9XCJkZWxldGVcIl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAkKCdidXR0b25bdmFsdWU9XCJhc3NheV9hY3Rpb25cIl0nKS5jbGljaygpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL2NsaWNrIGhhbmRsZXIgZm9yIGV4cG9ydCBhc3NheSBtZWFzdXJlbWVudHNcbiAgICAgICAgJCgnLmV4cG9ydEJ1dHRvbicpLmNsaWNrKGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgaW5jbHVkZUFsbExpbmVzSWZFbXB0eSgpO1xuICAgICAgICAgICAgJCgnaW5wdXRbdmFsdWU9XCJleHBvcnRcIl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAkKCdidXR0b25bdmFsdWU9XCJhc3NheV9hY3Rpb25cIl0nKS5jbGljaygpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL2NsaWNrIGhhbmRsZXIgZm9yIGRpc2FibGUgYXNzYXkgbWVhc3VyZW1lbnRzXG4gICAgICAgICQoJy5kaXNhYmxlQnV0dG9uJykuY2xpY2soZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAkKCdpbnB1dFt2YWx1ZT1cIm1hcmtcIl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAkKCdzZWxlY3RbbmFtZT1cImRpc2FibGVcIl0nKS52YWwoJ3RydWUnKTtcbiAgICAgICAgICAgICQoJ2J1dHRvblt2YWx1ZT1cImFzc2F5X2FjdGlvblwiXScpLmNsaWNrKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vY2xpY2sgaGFuZGxlciBmb3IgcmUtZW5hYmxlIGFzc2F5IG1lYXN1cmVtZW50c1xuICAgICAgICAkKCcuZW5hYmxlQnV0dG9uJykuY2xpY2soZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAkKCdpbnB1dFt2YWx1ZT1cIm1hcmtcIl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAkKCdzZWxlY3RbbmFtZT1cImRpc2FibGVcIl0nKS52YWwoJ2ZhbHNlJyk7XG4gICAgICAgICAgICAkKCdidXR0b25bdmFsdWU9XCJhc3NheV9hY3Rpb25cIl0nKS5jbGljaygpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUaGlzIG9uZSBpcyBhY3RpdmUgYnkgZGVmYXVsdFxuICAgICAgICAkKFwiI2xpbmVHcmFwaEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoJy5leHBvcnRCdXR0b24sICN0YWJsZUNvbnRyb2xzQXJlYSwgLnRhYmxlQWN0aW9uQnV0dG9ucycpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNmaWx0ZXJDb250cm9sc0FyZWEnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBxdWV1ZUFjdGlvblBhbmVsUmVmcmVzaCgpO1xuICAgICAgICAgICAgdmlld2luZ01vZGUgPSAnbGluZWdyYXBoJztcbiAgICAgICAgICAgIHVwZGF0ZUdyYXBoVmlld0ZsYWcoeydidXR0b25FbGVtJzogXCIjbGluZUdyYXBoQnV0dG9uXCIsICd0eXBlJzogdmlld2luZ01vZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzdHVkeV9pZCc6IEVERERhdGEuY3VycmVudFN0dWR5SUR9KTtcbiAgICAgICAgICAgIGJhckdyYXBoVHlwZUJ1dHRvbnNKUS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbGluZUdyYXBoJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlUaW1lJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlMaW5lJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlNZWFzdXJlbWVudCcpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLmFwcGVuZFRvKCcjY29udGVudCcpO1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vb25lIHRpbWUgY2xpY2sgZXZlbnQgaGFuZGxlciBmb3IgbG9hZGluZyBzcGlubmVyXG4gICAgICAgICQoJyNiYXJHcmFwaEJ1dHRvbicpLm9uZShcImNsaWNrXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjdGltZUJhckdyYXBoQnV0dG9uJykub25lKFwiY2xpY2tcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJCgnI2dyYXBoTG9hZGluZycpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNsaW5lQmFyR3JhcGhCdXR0b24nKS5vbmUoXCJjbGlja1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICB9KTtcbiAgICAgICAgJCgnI21lYXN1cmVtZW50QmFyR3JhcGhCdXR0b24nKS5vbmUoXCJjbGlja1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICB9KTtcbiAgICAgICAgJChcIiNiYXJHcmFwaEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoJy5leHBvcnRCdXR0b24sICN0YWJsZUNvbnRyb2xzQXJlYSwgLnRhYmxlQWN0aW9uQnV0dG9ucycpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNmaWx0ZXJDb250cm9sc0FyZWEnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBxdWV1ZUFjdGlvblBhbmVsUmVmcmVzaCgpO1xuICAgICAgICAgICAgdmlld2luZ01vZGUgPSAnYmFyZ3JhcGgnO1xuICAgICAgICAgICAgYmFyR3JhcGhUeXBlQnV0dG9uc0pRLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNsaW5lR3JhcGgnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeVRpbWUnKS50b2dnbGVDbGFzcygnb2ZmJywgJ3RpbWUnICE9PSBiYXJHcmFwaE1vZGUpO1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlMaW5lJykudG9nZ2xlQ2xhc3MoJ29mZicsICdsaW5lJyAhPT0gYmFyR3JhcGhNb2RlKTtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TWVhc3VyZW1lbnQnKS50b2dnbGVDbGFzcygnb2ZmJywgJ21lYXN1cmVtZW50JyAhPT0gYmFyR3JhcGhNb2RlKTtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICAgICAgaWYgKGJhckdyYXBoTW9kZSA9PT0gJ21lYXN1cmVtZW50Jykge1xuICAgICAgICAgICAgICAgICB1cGRhdGVHcmFwaFZpZXdGbGFnKHsnYnV0dG9uRWxlbSc6ICcjbWVhc3VyZW1lbnRCYXJHcmFwaEJ1dHRvbicsICd0eXBlJzogYmFyR3JhcGhNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc3R1ZHlfaWQnOiBFREREYXRhLmN1cnJlbnRTdHVkeUlEfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5hcHBlbmRUbygnI2NvbnRlbnQnKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoXCIjdGltZUJhckdyYXBoQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgYmFyR3JhcGhNb2RlID0gJ3RpbWUnO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOiBcIiN0aW1lQmFyR3JhcGhCdXR0b25cIiwgJ3R5cGUnOiBiYXJHcmFwaE1vZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc3R1ZHlfaWQnOiBFREREYXRhLmN1cnJlbnRTdHVkeUlEfSk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoXCIjbGluZUJhckdyYXBoQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgYmFyR3JhcGhNb2RlID0gJ2xpbmUnO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOicjbGluZUJhckdyYXBoQnV0dG9uJywgJ3R5cGUnOiBiYXJHcmFwaE1vZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzdHVkeV9pZCc6IEVERERhdGEuY3VycmVudFN0dWR5SUR9KTtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgJChcIiNtZWFzdXJlbWVudEJhckdyYXBoQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgYmFyR3JhcGhNb2RlID0gJ21lYXN1cmVtZW50JztcbiAgICAgICAgICAgIHVwZGF0ZUdyYXBoVmlld0ZsYWcoeydidXR0b25FbGVtJzogJyNtZWFzdXJlbWVudEJhckdyYXBoQnV0dG9uJywgJ3R5cGUnOiBiYXJHcmFwaE1vZGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzdHVkeV9pZCc6IEVERERhdGEuY3VycmVudFN0dWR5SUR9KTtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICAgICAgJCgnI2dyYXBoTG9hZGluZycpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9oaWRlcy9zaG93cyBmaWx0ZXIgc2VjdGlvbi5cbiAgICAgICAgdmFyIGhpZGVCdXR0b25zOiBKUXVlcnkgPSAkKCcuaGlkZUZpbHRlclNlY3Rpb24nKTtcbiAgICAgICAgaGlkZUJ1dHRvbnMuY2xpY2soZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBzZWxmOiBKUXVlcnkgPSAkKHRoaXMpLCBvbGQ6IHN0cmluZywgcmVwbGFjZTogc3RyaW5nO1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIG9sZCA9IHNlbGYudGV4dCgpO1xuICAgICAgICAgICAgcmVwbGFjZSA9IHNlbGYuYXR0cignZGF0YS1vZmYtdGV4dCcpO1xuICAgICAgICAgICAgLy8gZG9pbmcgdGhpcyBmb3IgYWxsXG4gICAgICAgICAgICBoaWRlQnV0dG9ucy5hdHRyKCdkYXRhLW9mZi10ZXh0Jywgb2xkKS50ZXh0KHJlcGxhY2UpO1xuICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykudG9nZ2xlKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBuZXh0IGZldyBsaW5lcyB3aXJlIHVwIGV2ZW50IGhhbmRsZXJzIGZvciBhIHB1bGxkb3duTWVudSB0aGF0IHdlIHVzZSB0byBjb250YWluIGFcbiAgICAgICAgLy8gY291cGxlIG9mIGNvbnRyb2xzIHJlbGF0ZWQgdG8gdGhlIGZpbHRlcmluZyBzZWN0aW9uLiAgVGhpcyBtZW51IGlzIHN0eWxlZCB0byBsb29rXG4gICAgICAgIC8vIGV4YWN0bHkgbGlrZSB0aGUgdHlwaWNhbCAndmlldyBvcHRpb25zJyBtZW51IGdlbmVyYXRlZCBieSBEYXRhR3JpZC5cblxuICAgICAgICB2YXIgbWVudUxhYmVsID0gJCgnI2ZpbHRlckNvbnRyb2xzTWVudUxhYmVsJyk7XG4gICAgICAgIG1lbnVMYWJlbC5jbGljaygoKSA9PiB7XG4gICAgICAgICAgICBpZiAobWVudUxhYmVsLmhhc0NsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpKSB7XG4gICAgICAgICAgICAgICAgbWVudUxhYmVsLnJlbW92ZUNsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9uJyk7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbHRlckNvbnRyb2xzTWVudSA+IGRpdi5wdWxsZG93bk1lbnVNZW51QmxvY2snKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGV2ZW50IGhhbmRsZXJzIHRvIGhpZGUgbWVudSBpZiBjbGlja2luZyBvdXRzaWRlIG1lbnUgYmxvY2sgb3IgcHJlc3NpbmcgRVNDXG4gICAgICAgICQoZG9jdW1lbnQpLmNsaWNrKChldikgPT4ge1xuICAgICAgICAgICAgdmFyIHQgPSAkKGV2LnRhcmdldCk7XG4gICAgICAgICAgICBpZiAodC5jbG9zZXN0KCQoJyNmaWx0ZXJDb250cm9sc01lbnUnKS5nZXQoMCkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG1lbnVMYWJlbC5yZW1vdmVDbGFzcygncHVsbGRvd25NZW51TGFiZWxPbicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpO1xuICAgICAgICAgICAgICAgICQoJyNmaWx0ZXJDb250cm9sc01lbnUgPiBkaXYucHVsbGRvd25NZW51TWVudUJsb2NrJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KS5rZXlkb3duKChldikgPT4ge1xuICAgICAgICAgICAgaWYgKGV2LmtleUNvZGUgPT09IDI3KSB7XG4gICAgICAgICAgICAgICAgbWVudUxhYmVsLnJlbW92ZUNsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9uJykuYWRkQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT2ZmJyk7XG4gICAgICAgICAgICAgICAgJCgnI2ZpbHRlckNvbnRyb2xzTWVudSA+IGRpdi5wdWxsZG93bk1lbnVNZW51QmxvY2snKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZldGNoRURERGF0YShvblN1Y2Nlc3MpO1xuXG4gICAgICAgIGZldGNoU2V0dGluZ3MoJ21lYXN1cmVtZW50LScgKyBFREREYXRhLmN1cnJlbnRTdHVkeUlELCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKGRhdGEudHlwZSA9PT0gJ2xpbmVncmFwaCcgfHwgZGF0YS50eXBlID09PSAndGFibGUnKSB7XG4gICAgICAgICAgICAgICAgJChkYXRhLmJ1dHRvbkVsZW0pLmNsaWNrKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZihkYXRhLnR5cGUpID09PSAndW5kZWZpbmVkJykgIHtcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YS50eXBlID09PSAnbWVhc3VyZW1lbnQnKSB7XG4gICAgICAgICAgICAgICAgJChcIiNiYXJHcmFwaEJ1dHRvblwiKS5jbGljaygpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBiYXJHcmFwaE1vZGUgPSBkYXRhLnR5cGU7XG4gICAgICAgICAgICAgICAgJChcIiNiYXJHcmFwaEJ1dHRvblwiKS5jbGljaygpO1xuICAgICAgICAgICAgICAgICQoZGF0YS5idXR0b25FbGVtKS5jbGljaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgIC8vIFNldCB1cCB0aGUgQWRkIE1lYXN1cmVtZW50IHRvIEFzc2F5IG1vZGFsXG4gICAgICAgICQoXCIjYWRkTWVhc3VyZW1lbnRcIikuZGlhbG9nKHtcbiAgICAgICAgICAgIG1pbldpZHRoOiA1MDAsXG4gICAgICAgICAgICBhdXRvT3BlbjogZmFsc2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJChcIi5hZGRNZWFzdXJlbWVudEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoXCIjYWRkTWVhc3VyZW1lbnRcIikucmVtb3ZlQ2xhc3MoJ29mZicpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2FsbGJhY2tzIHRvIHJlc3BvbmQgdG8gdGhlIGZpbHRlcmluZyBzZWN0aW9uXG4gICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLm9uKCdtb3VzZW92ZXIgbW91c2Vkb3duIG1vdXNldXAnLCBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUuYmluZCh0aGlzKSlcbiAgICAgICAgICAgIC5vbigna2V5ZG93bicsIGZpbHRlclRhYmxlS2V5RG93bi5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBiYXNlUGF5bG9hZCgpOmFueSB7XG4gICAgICAgIHZhciB0b2tlbjpzdHJpbmcgPSBkb2N1bWVudC5jb29raWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oPzooPzpefC4qO1xccyopY3NyZnRva2VuXFxzKlxcPVxccyooW147XSopLiokKXxeLiokLyxcbiAgICAgICAgICAgICckMScpO1xuICAgICAgICByZXR1cm4geyAnY3NyZm1pZGRsZXdhcmV0b2tlbic6IHRva2VuIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlR3JhcGhWaWV3RmxhZyh0eXBlKSB7XG4gICAgICAgICQuYWpheCgnL3Byb2ZpbGUvc2V0dGluZ3MvbWVhc3VyZW1lbnQtJyArIHR5cGUuc3R1ZHlfaWQsIHtcbiAgICAgICAgICAgICAgICAnZGF0YSc6ICQuZXh0ZW5kKHt9LCBiYXNlUGF5bG9hZCgpLCB7ICdkYXRhJzogSlNPTi5zdHJpbmdpZnkodHlwZSkgfSksXG4gICAgICAgICAgICAgICAgJ3R5cGUnOiAnUE9TVCdcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvcHlBY3Rpb25CdXR0b25zKCkge1xuICAgICAgICAvLyBjcmVhdGUgYSBjb3B5IG9mIHRoZSBidXR0b25zIGluIHRoZSBmbGV4IGxheW91dCBib3R0b20gYmFyXG4gICAgICAgIC8vIHRoZSBvcmlnaW5hbCBtdXN0IHN0YXkgaW5zaWRlIGZvcm1cbiAgICAgICAgdmFyIG9yaWdpbmFsOiBKUXVlcnksIGNvcHk6IEpRdWVyeTtcbiAgICAgICAgb3JpZ2luYWwgPSAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKTtcbiAgICAgICAgY29weSA9IG9yaWdpbmFsLmNsb25lKCkuYXBwZW5kVG8oJyNib3R0b21CYXInKS5hdHRyKCdpZCcsICdjb3B5QWN0aW9uUGFuZWwnKS5oaWRlKCk7XG4gICAgICAgIC8vIGZvcndhcmQgY2xpY2sgZXZlbnRzIG9uIGNvcHkgdG8gdGhlIG9yaWdpbmFsIGJ1dHRvblxuICAgICAgICBjb3B5Lm9uKCdjbGljaycsICcuYWN0aW9uQnV0dG9uJywgKGUpID0+IHtcbiAgICAgICAgICAgIG9yaWdpbmFsLmZpbmQoJyMnICsgZS50YXJnZXQuaWQpLnRyaWdnZXIoZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBmZXRjaEVERERhdGEoc3VjY2Vzcykge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgJ3VybCc6ICdlZGRkYXRhLycsXG4gICAgICAgICAgICAndHlwZSc6ICdHRVQnLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgJCgnI2NvbnRlbnQnKS5wcmVwZW5kKFwiPGRpdiBjbGFzcz0nbm9EYXRhJz5FcnJvci4gUGxlYXNlIHJlbG9hZDwvZGl2PlwiKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ0xvYWRpbmcgRURERGF0YSBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlXS5qb2luKCcnKSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiBzdWNjZXNzXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBmZXRjaFNldHRpbmdzKHByb3BLZXk6c3RyaW5nLCBjYWxsYmFjazoodmFsdWU6YW55KT0+dm9pZCwgZGVmYXVsdFZhbHVlPzphbnkpOnZvaWQge1xuICAgICAgICAkLmFqYXgoJy9wcm9maWxlL3NldHRpbmdzLycgKyBwcm9wS2V5LCB7XG4gICAgICAgICAgICAnZGF0YVR5cGUnOiAnanNvbicsXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhOmFueSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGEgfHwgZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IC8qIFBhcnNlRXJyb3IsIGp1c3QgdXNlIHN0cmluZyB2YWx1ZSAqLyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblN1Y2Nlc3MoZGF0YSkge1xuICAgICAgICBFREREYXRhID0gJC5leHRlbmQoRURERGF0YSB8fCB7fSwgZGF0YSk7XG5cbiAgICAgICAgY29sb3JPYmogPSBFRERHcmFwaGluZ1Rvb2xzLnJlbmRlckNvbG9yKEVERERhdGEuTGluZXMpO1xuXG4gICAgICAgIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uKCk7XG5cbiAgICAgICAgJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94LCAjZmlsdGVyaW5nU2hvd0VtcHR5Q2hlY2tib3gnKS5jaGFuZ2UoKCkgPT4ge1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBmZXRjaE1lYXN1cmVtZW50cyhFREREYXRhKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmZXRjaE1lYXN1cmVtZW50cyhFREREYXRhKSB7XG4gICAgICAgIC8vcHVsbGluZyBpbiBwcm90b2NvbCBtZWFzdXJlbWVudHMgQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgIHVybDogJ21lYXN1cmVtZW50cy8nICsgaWQgKyAnLycsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgcHJvdG9jb2wubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5jbHVkZUFsbExpbmVzSWZFbXB0eSgpIHtcbiAgICAgICAgaWYgKCQoJyNzdHVkeUFzc2F5c1RhYmxlJykuZmluZCgndGJvZHkgaW5wdXRbdHlwZT1jaGVja2JveF06Y2hlY2tlZCcpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgLy9hcHBlbmQgc3R1ZHkgaWQgdG8gZm9ybVxuICAgICAgICAgICAgdmFyIHN0dWR5ID0gXy5rZXlzKEVERERhdGEuU3R1ZGllcylbMF07XG4gICAgICAgICAgICAkKCc8aW5wdXQ+JykuYXR0cih7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2hpZGRlbicsXG4gICAgICAgICAgICAgICAgdmFsdWU6IHN0dWR5LFxuICAgICAgICAgICAgICAgIG5hbWU6ICdzdHVkeUlkJyxcbiAgICAgICAgICAgIH0pLmFwcGVuZFRvKCdmb3JtJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhbGxBY3RpdmVBc3NheXMoKSB7XG4gICAgICAgIHZhciBhc3NheXMgPSBfLmtleXMoRURERGF0YS5Bc3NheXMpO1xuXG4gICAgICAgIHZhciBmaWx0ZXJlZElEcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IGFzc2F5cy5sZW5ndGg7IHIrKykge1xuICAgICAgICAgICAgdmFyIGlkID0gYXNzYXlzW3JdO1xuICAgICAgICAgICAgLy8gSGVyZSBpcyB0aGUgY29uZGl0aW9uIHRoYXQgZGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSByb3dzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEIGFyZVxuICAgICAgICAgICAgLy8gc2hvd24gb3IgaGlkZGVuLlxuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKHBhcnNlSW50KGlkKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBmaWx0ZXJUYWJsZUtleURvd24oZSkge1xuICAgICAgICBzd2l0Y2ggKGUua2V5Q29kZSkge1xuICAgICAgICAgICAgY2FzZSAzODogLy8gdXBcbiAgICAgICAgICAgIGNhc2UgNDA6IC8vIGRvd25cbiAgICAgICAgICAgIGNhc2UgOTogIC8vIHRhYlxuICAgICAgICAgICAgY2FzZSAxMzogLy8gcmV0dXJuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgICAgICAgICBpZiAoZS5rZXlDb2RlID4gOCAmJiBlLmtleUNvZGUgPCAzMikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RBc3NheURhdGEoYXNzYXkpIHtcbiAgICAgICAgdmFyIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIHVybDogWydtZWFzdXJlbWVudHMnLCBhc3NheS5waWQsIGFzc2F5LmlkLCAnJ10uam9pbignLycpLFxuICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgZXJyb3I6ICh4aHIsIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgYXNzYXkubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NNZWFzdXJlbWVudERhdGEocHJvdG9jb2wsIGRhdGEpIHtcbiAgICAgICAgdmFyIGFzc2F5U2VlbiA9IHt9LFxuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5ID0ge30sXG4gICAgICAgICAgICBjb3VudF90b3RhbDpudW1iZXIgPSAwLFxuICAgICAgICAgICAgY291bnRfcmVjOm51bWJlciA9IDA7XG4gICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9O1xuICAgICAgICBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgPSAkLmV4dGVuZChFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgfHwge30sIGRhdGEudHlwZXMpO1xuXG4gICAgICAgIC8vIGF0dGFjaCBtZWFzdXJlbWVudCBjb3VudHMgdG8gZWFjaCBhc3NheVxuICAgICAgICAkLmVhY2goZGF0YS50b3RhbF9tZWFzdXJlcywgKGFzc2F5SWQ6c3RyaW5nLCBjb3VudDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBJZiB3ZSBldmVyIGZldGNoIGJ5IHNvbWV0aGluZyBvdGhlciB0aGFuIHByb3RvY29sLFxuICAgICAgICAgICAgICAgIC8vIElzbid0IHRoZXJlIGEgY2hhbmNlIHRoaXMgaXMgY3VtdWxhdGl2ZSwgYW5kIHdlIHNob3VsZCArPSA/XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgYXNzYXkuY291bnQgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIGlmICghbGluZSB8fCAhbGluZS5hY3RpdmUpIHJldHVybjtcbiAgICAgICAgICAgIC8vIGF0dGFjaCB2YWx1ZXNcbiAgICAgICAgICAgICQuZXh0ZW5kKG1lYXN1cmVtZW50LCB7ICd2YWx1ZXMnOiBkYXRhLmRhdGFbbWVhc3VyZW1lbnQuaWRdIHx8IFtdIH0pO1xuICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudC5pZF0gPSBtZWFzdXJlbWVudDtcbiAgICAgICAgICAgIC8vIHRyYWNrIHdoaWNoIGFzc2F5cyByZWNlaXZlZCB1cGRhdGVkIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgYXNzYXlTZWVuW2Fzc2F5LmlkXSA9IHRydWU7XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXSA9IHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdIHx8IHt9O1xuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF1bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGhhbmRsZSBtZWFzdXJlbWVudCBkYXRhIGJhc2VkIG9uIHR5cGVcbiAgICAgICAgICAgIG10eXBlID0gZGF0YS50eXBlc1ttZWFzdXJlbWVudC50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgIChhc3NheS5tZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIGlmIChtdHlwZS5mYW1pbHkgPT09ICdtJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBtZXRhYm9saXRlXG4gICAgICAgICAgICAgICAgKGFzc2F5Lm1ldGFib2xpdGVzID0gYXNzYXkubWV0YWJvbGl0ZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdwJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBwcm90ZWluXG4gICAgICAgICAgICAgICAgKGFzc2F5LnByb3RlaW5zID0gYXNzYXkucHJvdGVpbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgIChhc3NheS50cmFuc2NyaXB0aW9ucyA9IGFzc2F5LnRyYW5zY3JpcHRpb25zIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgKGFzc2F5LmdlbmVyYWwgPSBhc3NheS5nZW5lcmFsIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQucHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzKGRhdGEubWVhc3VyZXMgfHwge30sIGRhdGEudHlwZXMpO1xuXG4gICAgICAgIGlmIChjb3VudF9yZWMgPCBjb3VudF90b3RhbCkge1xuICAgICAgICAgICAgLy8gVE9ETyBub3QgYWxsIG1lYXN1cmVtZW50cyBkb3dubG9hZGVkOyBkaXNwbGF5IGEgbWVzc2FnZSBpbmRpY2F0aW5nIHRoaXNcbiAgICAgICAgICAgIC8vIGV4cGxhaW4gZG93bmxvYWRpbmcgaW5kaXZpZHVhbCBhc3NheSBtZWFzdXJlbWVudHMgdG9vXG4gICAgICAgIH1cbiAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpIHtcbiAgICAgICAgaWYgKHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQocmVmcmVzRGF0YURpc3BsYXlJZlN0YWxlVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyID0gc2V0VGltZW91dChyZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlLmJpbmQodGhpcyksIDEwMCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKSB7XG4gICAgICAgIGlmIChhY3Rpb25QYW5lbFJlZnJlc2hUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGFjdGlvblBhbmVsUmVmcmVzaFRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICBhY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoYWN0aW9uUGFuZWxSZWZyZXNoLmJpbmQodGhpcyksIDE1MCk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGZ1bmN0aW9uIGRldGVybWluZXMgaWYgdGhlIGZpbHRlcmluZyBzZWN0aW9ucyAob3Igc2V0dGluZ3MgcmVsYXRlZCB0byB0aGVtKSBoYXZlIGNoYW5nZWRcbiAgICAvLyBzaW5jZSB0aGUgbGFzdCB0aW1lIHdlIHdlcmUgaW4gdGhlIGN1cnJlbnQgZGlzcGxheSBtb2RlIChlLmcuIGxpbmUgZ3JhcGgsIHRhYmxlLCBiYXIgZ3JhcGhcbiAgICAvLyBpbiB2YXJpb3VzIG1vZGVzLCBldGMpIGFuZCB1cGRhdGVzIHRoZSBkaXNwbGF5IG9ubHkgaWYgYSBjaGFuZ2UgaXMgZGV0ZWN0ZWQuXG4gICAgZnVuY3Rpb24gcmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZShmb3JjZT86Ym9vbGVhbikge1xuXG4gICAgICAgIC8vIEFueSBzd2l0Y2ggYmV0d2VlbiB2aWV3aW5nIG1vZGVzLCBvciBjaGFuZ2UgaW4gZmlsdGVyaW5nLCBpcyBhbHNvIGNhdXNlIHRvIGNoZWNrIHRoZSBVSVxuICAgICAgICAvLyBpbiB0aGUgYWN0aW9uIHBhbmVsIGFuZCBtYWtlIHN1cmUgaXQncyBjdXJyZW50LlxuICAgICAgICBxdWV1ZUFjdGlvblBhbmVsUmVmcmVzaCgpO1xuXG4gICAgICAgIC8vIElmIHRoZSBmaWx0ZXJpbmcgd2lkZ2V0IGNsYWltcyBhIGNoYW5nZSBzaW5jZSB0aGUgbGFzdCBpbnF1aXJ5LFxuICAgICAgICAvLyB0aGVuIGFsbCB0aGUgdmlld2luZyBtb2RlcyBhcmUgc3RhbGUsIG5vIG1hdHRlciB3aGF0LlxuICAgICAgICAvLyBTbyB3ZSBtYXJrIHRoZW0gYWxsLlxuICAgICAgICBpZiAocHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQuY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZSkpIHtcblxuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydsaW5lZ3JhcGgnXSA9IHRydWU7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbJ2JhcmdyYXBoLXRpbWUnXSA9IHRydWU7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbJ2JhcmdyYXBoLWxpbmUnXSA9IHRydWU7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbJ2JhcmdyYXBoLW1lYXN1cmVtZW50J10gPSB0cnVlO1xuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWyd0YWJsZSddID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIFB1bGwgb3V0IGEgZnJlc2ggc2V0IG9mIGZpbHRlcmVkIG1lYXN1cmVtZW50cyBhbmQgYXNzYXlzXG4gICAgICAgICAgICB2YXIgZmlsdGVyUmVzdWx0cyA9IHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmJ1aWxkRmlsdGVyZWRNZWFzdXJlbWVudHMoKTtcbiAgICAgICAgICAgIHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMgPSBmaWx0ZXJSZXN1bHRzWydmaWx0ZXJlZE1lYXN1cmVtZW50cyddO1xuICAgICAgICAgICAgcG9zdEZpbHRlcmluZ0Fzc2F5cyA9IGZpbHRlclJlc3VsdHNbJ2ZpbHRlcmVkQXNzYXlzJ107XG5cbiAgICAgICAgLy8gSWYgdGhlIGZpbHRlcmluZyB3aWRnZXQgaGFzbid0IGNoYW5nZWQgYW5kIHRoZSBjdXJyZW50IG1vZGUgZG9lc24ndCBjbGFpbSB0byBiZSBzdGFsZSwgd2UncmUgZG9uZS5cbiAgICAgICAgfSBlbHNlIGlmICh2aWV3aW5nTW9kZSA9PSAnYmFyZ3JhcGgnKSB7XG4gICAgICAgICAgICAvLyBTcGVjaWFsIGNhc2UgdG8gaGFuZGxlIHRoZSBleHRyYSBzdWItbW9kZXMgb2YgdGhlIGJhciBncmFwaFxuICAgICAgICAgICAgaWYgKCF2aWV3aW5nTW9kZUlzU3RhbGVbdmlld2luZ01vZGUrJy0nK2JhckdyYXBoTW9kZV0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIXZpZXdpbmdNb2RlSXNTdGFsZVt2aWV3aW5nTW9kZV0pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2aWV3aW5nTW9kZSA9PSAndGFibGUnKSB7XG4gICAgICAgICAgICBpZiAoYXNzYXlzRGF0YUdyaWRTcGVjID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYXNzYXlzRGF0YUdyaWRTcGVjID0gbmV3IERhdGFHcmlkU3BlY0Fzc2F5cygpO1xuICAgICAgICAgICAgICAgIGFzc2F5c0RhdGFHcmlkU3BlYy5pbml0KCk7XG4gICAgICAgICAgICAgICAgYXNzYXlzRGF0YUdyaWQgPSBuZXcgRGF0YUdyaWRBc3NheXMoYXNzYXlzRGF0YUdyaWRTcGVjKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXNzYXlzRGF0YUdyaWQudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWyd0YWJsZSddID0gZmFsc2U7XG4gICAgICAgICAgICBtYWtlTGFiZWxzQmxhY2soRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVtYWtlTWFpbkdyYXBoQXJlYSgpO1xuICAgICAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICdiYXJncmFwaCcpIHtcbiAgICAgICAgICAgICAgICB2aWV3aW5nTW9kZUlzU3RhbGVbdmlld2luZ01vZGUrJy0nK2JhckdyYXBoTW9kZV0gPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydsaW5lZ3JhcGgnXSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBhY3Rpb25QYW5lbFJlZnJlc2goKSB7XG4gICAgICAgIHZhciBjaGVja2VkQm94ZXM6IEhUTUxJbnB1dEVsZW1lbnRbXSwgY2hlY2tlZEFzc2F5czogbnVtYmVyLCBjaGVja2VkTWVhc3VyZTogbnVtYmVyLFxuICAgICAgICAgICAgbm90aGluZ1NlbGVjdGVkOiBib29sZWFuLCBjb250ZW50U2Nyb2xsaW5nOiBib29sZWFuLCBmaWx0ZXJJbkJvdHRvbTogYm9vbGVhbjtcbiAgICAgICAgLy8gRmlndXJlIG91dCBob3cgbWFueSBhc3NheXMvY2hlY2tib3hlcyBhcmUgc2VsZWN0ZWQuXG5cbiAgICAgICAgLy8gRG9uJ3Qgc2hvdyB0aGUgc2VsZWN0ZWQgaXRlbSBjb3VudCBpZiB3ZSdyZSBub3QgbG9va2luZyBhdCB0aGUgdGFibGUuXG4gICAgICAgIC8vIChPbmx5IHRoZSB2aXNpYmxlIGl0ZW0gY291bnQgbWFrZXMgc2Vuc2UgaW4gdGhhdCBjYXNlLilcbiAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICd0YWJsZScpIHtcbiAgICAgICAgICAgICQoJy5kaXNwbGF5ZWREaXYnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBpZiAoYXNzYXlzRGF0YUdyaWQpIHtcbiAgICAgICAgICAgICAgICBjaGVja2VkQm94ZXMgPSBhc3NheXNEYXRhR3JpZC5nZXRTZWxlY3RlZENoZWNrYm94RWxlbWVudHMoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2hlY2tlZEJveGVzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGVja2VkQXNzYXlzID0gJChjaGVja2VkQm94ZXMpLmZpbHRlcignW25hbWU9YXNzYXlJZF0nKS5sZW5ndGg7XG4gICAgICAgICAgICBjaGVja2VkTWVhc3VyZSA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJ1tuYW1lPW1lYXN1cmVtZW50SWRdJykubGVuZ3RoO1xuICAgICAgICAgICAgbm90aGluZ1NlbGVjdGVkID0gIWNoZWNrZWRBc3NheXMgJiYgIWNoZWNrZWRNZWFzdXJlO1xuICAgICAgICAgICAgLy9lbmFibGUgYWN0aW9uIGJ1dHRvbnMgaWYgc29tZXRoaW5nIGlzIHNlbGVjdGVkXG4gICAgICAgICAgICAkKCcudGFibGVBY3Rpb25CdXR0b25zJykuZmluZCgnYnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCBub3RoaW5nU2VsZWN0ZWQpO1xuICAgICAgICAgICAgJCgnLnNlbGVjdGVkRGl2JykudG9nZ2xlQ2xhc3MoJ29mZicsIG5vdGhpbmdTZWxlY3RlZCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRTdHJzID0gW107XG4gICAgICAgICAgICBpZiAoIW5vdGhpbmdTZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGlmIChjaGVja2VkQXNzYXlzKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU3Rycy5wdXNoKChjaGVja2VkQXNzYXlzID4gMSkgPyAoY2hlY2tlZEFzc2F5cyArIFwiIEFzc2F5c1wiKSA6IFwiMSBBc3NheVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrZWRNZWFzdXJlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU3Rycy5wdXNoKChjaGVja2VkTWVhc3VyZSA+IDEpID8gKGNoZWNrZWRNZWFzdXJlICsgXCIgTWVhc3VyZW1lbnRzXCIpIDogXCIxIE1lYXN1cmVtZW50XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0ZWRTdHIgPSBzZWxlY3RlZFN0cnMuam9pbignLCAnKTtcbiAgICAgICAgICAgICAgICAkKCcuc2VsZWN0ZWREaXYnKS50ZXh0KHNlbGVjdGVkU3RyICsgJyBzZWxlY3RlZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCgnLnNlbGVjdGVkRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnLmRpc3BsYXllZERpdicpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfVxuICAgICAgICAvL2lmIHRoZXJlIGFyZSBhc3NheXMgYnV0IG5vIGRhdGEsIHNob3cgZW1wdHkgYXNzYXlzXG4gICAgICAgIC8vbm90ZTogdGhpcyBpcyB0byBjb21iYXQgdGhlIGN1cnJlbnQgZGVmYXVsdCBzZXR0aW5nIGZvciBzaG93aW5nIGdyYXBoIG9uIHBhZ2UgbG9hZFxuICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuQXNzYXlzKS5sZW5ndGggPiAwICYmIF8ua2V5cyhFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzKS5sZW5ndGggPT09IDAgKSB7XG4gICAgICAgICAgICBpZiAoISQoJyNUYWJsZVNob3dFQXNzYXlzQ0InKS5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICAkKCcjVGFibGVTaG93RUFzc2F5c0NCJykuY2xpY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG1vdmUgYnV0dG9ucyBzbyB0aGV5IGFyZSBhbHdheXMgdmlzaWJsZSBpZiB0aGUgcGFnZSBpcyBzY3JvbGxpbmdcbiAgICAgICAgY29udGVudFNjcm9sbGluZyA9IGlzQ29udGVudFNjcm9sbGluZygpO1xuICAgICAgICBpZiAoYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyICYmICFjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKS5zaG93KCk7XG4gICAgICAgICAgICAkKCcjY29weUFjdGlvblBhbmVsJykuaGlkZSgpO1xuICAgICAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAoIWFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciAmJiBjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAkKCcjYXNzYXlzQWN0aW9uUGFuZWwnKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjY29weUFjdGlvblBhbmVsJykuc2hvdygpO1xuICAgICAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG9ubHkgbW92ZSB0aGUgZmlsdGVyIHNlY3Rpb24gd2hlbiB0aGUgcGFnZSBpcyBzY3JvbGxpbmcgaW4gdGFibGUgdmlld1xuICAgICAgICBpZiAodmlld2luZ01vZGUgPT0gJ3RhYmxlJykge1xuICAgICAgICAgICAgY29udGVudFNjcm9sbGluZyA9IGlzQ29udGVudFNjcm9sbGluZygpO1xuICAgICAgICAgICAgZmlsdGVySW5Cb3R0b20gPSAkKCcjbWFpbkZpbHRlclNlY3Rpb24nKS5wYXJlbnQoKS5pcygnI2JvdHRvbUJhcicpO1xuICAgICAgICAgICAgaWYgKGZpbHRlckluQm90dG9tICYmICFjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kVG8oJyNjb250ZW50Jyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFmaWx0ZXJJbkJvdHRvbSAmJiBjb250ZW50U2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kVG8oJyNib3R0b21CYXInKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gaXNDb250ZW50U2Nyb2xsaW5nKCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgdmlld0hlaWdodDogbnVtYmVyID0gMCwgaXRlbXNIZWlnaHQ6IG51bWJlciA9IDA7XG4gICAgICAgIHZpZXdIZWlnaHQgPSAkKCcjY29udGVudCcpLmhlaWdodCgpO1xuICAgICAgICAkKCcjY29udGVudCcpLmNoaWxkcmVuKCkuZWFjaCgoaSwgZSkgPT4geyBpdGVtc0hlaWdodCArPSBlLnNjcm9sbEhlaWdodDsgfSk7XG4gICAgICAgIHJldHVybiB2aWV3SGVpZ2h0IDwgaXRlbXNIZWlnaHQ7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiByZW1ha2VNYWluR3JhcGhBcmVhKCkge1xuXG4gICAgICAgIHZhciBkYXRhUG9pbnRzRGlzcGxheWVkID0gMCxcbiAgICAgICAgICAgIGRhdGFQb2ludHNUb3RhbCA9IDAsXG4gICAgICAgICAgICBkYXRhU2V0cyA9IFtdO1xuXG4gICAgICAgICQoJyN0b29NYW55UG9pbnRzJykuaGlkZSgpO1xuICAgICAgICAkKCcjbGluZUdyYXBoJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAkKCcjYmFyR3JhcGhCeVRpbWUnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgJCgnI2JhckdyYXBoQnlNZWFzdXJlbWVudCcpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICAvLyBzaG93IG1lc3NhZ2UgdGhhdCB0aGVyZSdzIG5vIGRhdGEgdG8gZGlzcGxheVxuICAgICAgICBpZiAocG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7ICAgIC8vIFJlbW92ZSBsb2FkIHNwaW5uZXIgaWYgc3RpbGwgcHJlc2VudFxuICAgICAgICAgICAgJCgnI25vRGF0YScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgICQuZWFjaChwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzLCAoaSwgbWVhc3VyZW1lbnRJZCkgPT4ge1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElkXSxcbiAgICAgICAgICAgICAgICBwb2ludHMgPSAobWVhc3VyZS52YWx1ZXMgPyBtZWFzdXJlLnZhbHVlcy5sZW5ndGggOiAwKSxcbiAgICAgICAgICAgICAgICBhc3NheSwgbGluZSwgbmFtZSwgc2luZ2xlQXNzYXlPYmosIGNvbG9yLCBwcm90b2NvbCwgbGluZU5hbWUsIGRhdGFPYmo7XG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgKz0gcG9pbnRzO1xuXG4gICAgICAgICAgICBpZiAoZGF0YVBvaW50c0Rpc3BsYXllZCA+IDE1MDAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoZSByZXN0IGlmIHdlJ3ZlIGhpdCBvdXIgbGltaXRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGF0YVBvaW50c0Rpc3BsYXllZCArPSBwb2ludHM7XG4gICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldIHx8IHt9O1xuICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSB8fCB7fTtcbiAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXSB8fCB7fTtcbiAgICAgICAgICAgIG5hbWUgPSBhc3NheS5uYW1lO1xuICAgICAgICAgICAgbGluZU5hbWUgPSBsaW5lLm5hbWU7XG5cbiAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG5cbiAgICAgICAgICAgIGlmIChfLmtleXMoRURERGF0YS5MaW5lcykubGVuZ3RoID4gMjIpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNoYW5nZUxpbmVDb2xvcihsaW5lLCBhc3NheS5saWQpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA8IDEpIHtcbiAgICAgICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLmxhYmVscy5wdXNoKGxhYmVsKTtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgLy8gdW5jaGVja2VkIGxhYmVscyBibGFja1xuICAgICAgICAgICAgICAgIG1ha2VMYWJlbHNCbGFjayhFRERHcmFwaGluZ1Rvb2xzLmxhYmVscyk7XG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICAgICBpZiAoY29sb3IgPT09IG51bGwgfHwgY29sb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvdW50ID0gbm9DaGVja2VkQm94ZXMoRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLm5leHRDb2xvciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGFkZENvbG9yKEVEREdyYXBoaW5nVG9vbHMubGFiZWxzLCBhc3NheS5saWQpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gYmxhY2tcbiAgICAgICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNvbG9yID09PSBudWxsIHx8IGNvbG9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRhdGFPYmogPSB7XG4gICAgICAgICAgICAgICAgJ21lYXN1cmUnOiBtZWFzdXJlLFxuICAgICAgICAgICAgICAgICdkYXRhJzogRURERGF0YSxcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG5hbWUsXG4gICAgICAgICAgICAgICAgJ2NvbG9yJzogY29sb3IsXG4gICAgICAgICAgICAgICAgJ2xpbmVOYW1lJzogbGluZU5hbWVcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzaW5nbGVBc3NheU9iaiA9IEVEREdyYXBoaW5nVG9vbHMudHJhbnNmb3JtU2luZ2xlTGluZUl0ZW0oZGF0YU9iaik7XG4gICAgICAgICAgICBkYXRhU2V0cy5wdXNoKHNpbmdsZUFzc2F5T2JqKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnLmRpc3BsYXllZERpdicpLnRleHQoZGF0YVBvaW50c0Rpc3BsYXllZCArIFwiIG1lYXN1cmVtZW50cyBkaXNwbGF5ZWRcIik7XG5cbiAgICAgICAgJCgnI25vRGF0YScpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMrKztcbiAgICAgICAgdW5jaGVja0V2ZW50SGFuZGxlcihFRERHcmFwaGluZ1Rvb2xzLmxhYmVscyk7XG5cbiAgICAgICAgdmFyIGJhckFzc2F5T2JqICA9IEVEREdyYXBoaW5nVG9vbHMuY29uY2F0QXNzYXlzKGRhdGFTZXRzKTtcblxuICAgICAgICAvL2RhdGEgZm9yIGdyYXBoc1xuICAgICAgICB2YXIgZ3JhcGhTZXQgPSB7XG4gICAgICAgICAgICBiYXJBc3NheU9iajogRURER3JhcGhpbmdUb29scy5jb25jYXRBc3NheXMoZGF0YVNldHMpLFxuICAgICAgICAgICAgY3JlYXRlX3hfYXhpczogRURER3JhcGhpbmdUb29scy5jcmVhdGVYQXhpcyxcbiAgICAgICAgICAgIGNyZWF0ZV9yaWdodF95X2F4aXM6IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlUmlnaHRZQXhpcyxcbiAgICAgICAgICAgIGNyZWF0ZV95X2F4aXM6IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlTGVmdFlBeGlzLFxuICAgICAgICAgICAgeF9heGlzOiBFRERHcmFwaGluZ1Rvb2xzLm1ha2VfeF9heGlzLFxuICAgICAgICAgICAgeV9heGlzOiBFRERHcmFwaGluZ1Rvb2xzLm1ha2VfcmlnaHRfeV9heGlzLFxuICAgICAgICAgICAgaW5kaXZpZHVhbERhdGE6IGRhdGFTZXRzLFxuICAgICAgICAgICAgYXNzYXlNZWFzdXJlbWVudHM6IGJhckFzc2F5T2JqLFxuICAgICAgICAgICAgd2lkdGg6IDc1MCxcbiAgICAgICAgICAgIGhlaWdodDogMjIwXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICdsaW5lZ3JhcGgnKSB7XG4gICAgICAgICAgICAkKCcjbGluZUdyYXBoJykuZW1wdHkoKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB2YXIgcyA9IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlU3ZnKCQoJyNsaW5lR3JhcGgnKS5nZXQoMCkpO1xuICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5jcmVhdGVNdWx0aUxpbmVHcmFwaChncmFwaFNldCwgcyk7XG4gICAgICAgIH0gZWxzZSBpZiAoYmFyR3JhcGhNb2RlID09ICd0aW1lJykge1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlUaW1lJykuZW1wdHkoKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICB2YXIgcyA9IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlU3ZnKCQoJyNiYXJHcmFwaEJ5VGltZScpLmdldCgwKSk7XG4gICAgICAgICAgICBjcmVhdGVHcm91cGVkQmFyR3JhcGgoZ3JhcGhTZXQsIHMpO1xuICAgICAgICB9IGVsc2UgaWYgKGJhckdyYXBoTW9kZSA9PSAnbGluZScpIHtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLmVtcHR5KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdmFyIHMgPSBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVN2ZygkKCcjYmFyR3JhcGhCeUxpbmUnKS5nZXQoMCkpO1xuICAgICAgICAgICAgY3JlYXRlR3JvdXBlZEJhckdyYXBoKGdyYXBoU2V0LCBzKTtcbiAgICAgICAgfSBlbHNlIGlmIChiYXJHcmFwaE1vZGUgPT0gJ21lYXN1cmVtZW50Jykge1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlNZWFzdXJlbWVudCcpLmVtcHR5KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdmFyIHMgPSBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVN2ZygkKCcjYmFyR3JhcGhCeU1lYXN1cmVtZW50JykuZ2V0KDApKTtcbiAgICAgICAgICAgIGNyZWF0ZUdyb3VwZWRCYXJHcmFwaChncmFwaFNldCwgcyk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gbWFrZXMgdW5jaGVja2VkIGxhYmVscyBibGFja1xuICAgICAqIEBwYXJhbSBzZWxlY3RvcnNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlTGFiZWxzQmxhY2soc2VsZWN0b3JzOkpRdWVyeVtdKSB7XG4gICAgICAgIF8uZWFjaChzZWxlY3RvcnMsIGZ1bmN0aW9uKHNlbGVjdG9yOkpRdWVyeSkge1xuICAgICAgICAgICAgaWYgKHNlbGVjdG9yLnByZXYoKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAkKHNlbGVjdG9yKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIGNyZWF0ZXMgYW4gZXZlbnQgaGFuZGxlciBmb3IgdW5jaGVja2luZyBhIGNoZWNrZWQgY2hlY2tib3hcbiAgICAgKiBAcGFyYW0gbGFiZWxzXG4gICAgICovXG4gICAgZnVuY3Rpb24gdW5jaGVja0V2ZW50SGFuZGxlcihsYWJlbHMpIHtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWwpe1xuICAgICAgICAgICAgdmFyIGlkID0gJChsYWJlbCkucHJldigpLmF0dHIoJ2lkJyk7XG4gICAgICAgICAgICAkKCcjJyArIGlkKS5jaGFuZ2UoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGlzY2hlY2tlZD0gJCh0aGlzKS5pcygnOmNoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICBpZiAoIWlzY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAkKGxhYmVsKS5jc3MoJ2NvbG9yJywgJ2JsYWNrJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiByZXR1cm5zIGhvdyBtYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQuXG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqIEByZXR1cm5zIGNvdW50IG9mIGNoZWNrZWQgYm94ZXMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbm9DaGVja2VkQm94ZXMobGFiZWxzKSB7XG4gICAgICAgIHZhciBjb3VudCA9IDA7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsKSB7XG4gICAgICAgICAgICB2YXIgY2hlY2tib3ggPSAkKGxhYmVsKS5wcmV2KCk7XG4gICAgICAgICAgICBpZiAoJChjaGVja2JveCkucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWRkcyBjb2xvcnMgYWZ0ZXIgdXNlciBoYXMgY2xpY2tlZCBhIGxpbmUgYW5kIHRoZW4gdW5jbGlja2VkIGFsbCB0aGUgbGluZXMuXG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqIEBwYXJhbSBhc3NheVxuICAgICAqIEByZXR1cm5zIGxhYmVsc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZENvbG9yKGxhYmVsczpKUXVlcnlbXSwgYXNzYXkpIHtcbiAgICAgICAgXy5lYWNoKGxhYmVscywgZnVuY3Rpb24obGFiZWw6SlF1ZXJ5KSB7XG4gICAgICAgICAgICB2YXIgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1thc3NheV0ubmFtZSA9PT0gbGFiZWwudGV4dCgpKSB7XG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBsYWJlbHM7XG4gICAgfVxuXG5cbiAgICAvKiogdGhpcyBmdW5jdGlvbiB0YWtlcyBpbiBhbiBlbGVtZW50IHNlbGVjdG9yIGFuZCBhbiBhcnJheSBvZiBzdmcgcmVjdHMgYW5kIHJldHVybnNcbiAgICAgKiByZXR1cm5zIG1lc3NhZ2Ugb3Igbm90aGluZy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzdmdXaWR0aChzZWxlY3RvciwgcmVjdEFycmF5KSB7XG4gICAgICAgICQoJy50b29NdWNoRGF0YScpLmhpZGUoKTtcbiAgICAgICAgJCgnLm5vRGF0YScpLmhpZGUoKTtcbiAgICAgICAgdmFyIHN1bSA9IDA7XG4gICAgICAgIF8uZWFjaChyZWN0QXJyYXksIGZ1bmN0aW9uKHJlY3RFbGVtOmFueSkge1xuICAgICAgICAgICAgaWYgKHJlY3RFbGVtLmdldEF0dHJpYnV0ZShcIndpZHRoXCIpICE9IDApIHtcbiAgICAgICAgICAgICAgICBzdW0rK1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKHN1bSA9PT0gMCkge1xuICAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKHNlbGVjdG9yKS5wcmVwZW5kKFwiPHAgY2xhc3M9JyB0b29NdWNoRGF0YSc+VG9vIG1hbnkgZGF0YSBwb2ludHMgdG8gZGlzcGxheVwiICtcbiAgICAgICAgICAgICAgICBcIjwvcD48cCAgY2xhc3M9JyB0b29NdWNoRGF0YSc+UmVjb21tZW5kIGZpbHRlcmluZyBieSBwcm90b2NvbDwvcD5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qKiB0aGlzIGZ1bmN0aW9uIHRha2VzIGluIHRoZSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgb2JqZWN0IGFuZCByZXR1cm5zIHRoZSBtZWFzdXJlbWVudCB0eXBlXG4gICAgICogIHRoYXQgaGFzIHRoZSBtb3N0IGRhdGEgcG9pbnRzIC0gb3B0aW9ucyBhcmUgYmFzZWQgb24gZmFtaWx5IHAsIG0sIC0sIGV0Yy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtZWFzdXJlbWVudFR5cGUodHlwZXMpIHsgICAgLy8gVE9ETzogUkVOQU1FXG4gICAgICAgIHZhciBwcm90ZW9taWNzID0ge307XG4gICAgICAgIGZvciAodmFyIHR5cGUgaW4gdHlwZXMpIHtcbiAgICAgICAgICAgIGlmIChwcm90ZW9taWNzLmhhc093blByb3BlcnR5KHR5cGVzW3R5cGVdLmZhbWlseSkpIHtcbiAgICAgICAgICAgICAgICBwcm90ZW9taWNzW3R5cGVzW3R5cGVdLmZhbWlseV0rKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHJvdGVvbWljc1t0eXBlc1t0eXBlXS5mYW1pbHldID0gMFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBwcm90ZW9taWNzKSB7XG4gICAgICAgICAgICB2YXIgbWF4OmFueSA9IDA7XG4gICAgICAgICAgICB2YXIgbWF4VHlwZTphbnk7XG4gICAgICAgICAgICBpZiAocHJvdGVvbWljc1trZXldID4gbWF4KSB7XG4gICAgICAgICAgICAgICAgbWF4ID0gcHJvdGVvbWljc1trZXldO1xuICAgICAgICAgICAgICAgIG1heFR5cGUgPSBrZXk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1heFR5cGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiB0YWtlcyBpbiBpbnB1dCBtaW4geSB2YWx1ZSwgbWF4IHkgdmFsdWUsIGFuZCB0aGUgc29ydGVkIGpzb24gb2JqZWN0LlxuICAgICAqICBvdXRwdXRzIGEgZ3JvdXBlZCBiYXIgZ3JhcGggd2l0aCB2YWx1ZXMgZ3JvdXBlZCBieSBhc3NheSBuYW1lXG4gICAgICoqL1xuICAgIGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVHcm91cGVkQmFyR3JhcGgoZ3JhcGhTZXQsIHN2Zykge1xuXG4gICAgICAgIHZhciBhc3NheU1lYXN1cmVtZW50cyA9IGdyYXBoU2V0LmFzc2F5TWVhc3VyZW1lbnRzLFxuICAgICAgICAgICAgdHlwZUlEID0ge1xuICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudCc6IFwiI2JhckdyYXBoQnlNZWFzdXJlbWVudFwiLFxuICAgICAgICAgICAgICAgICd4JzogXCIjYmFyR3JhcGhCeVRpbWVcIixcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICcjYmFyR3JhcGhCeUxpbmUnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbW9kZVRvRmllbGQgPSB7XG4gICAgICAgICAgICAgICAgJ2xpbmUnOiAnbmFtZScsXG4gICAgICAgICAgICAgICAgJ3RpbWUnOiAneCcsXG4gICAgICAgICAgICAgICAgJ21lYXN1cmVtZW50JzogJ21lYXN1cmVtZW50J1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG51bVVuaXRzID0gRURER3JhcGhpbmdUb29scy5ob3dNYW55VW5pdHMoYXNzYXlNZWFzdXJlbWVudHMpLFxuICAgICAgICAgICAgeVJhbmdlID0gW10sXG4gICAgICAgICAgICB1bml0TWVhc3VyZW1lbnREYXRhID0gW10sXG4gICAgICAgICAgICB5TWluID0gW10sXG4gICAgICAgICAgICBkYXRhLCBuZXN0ZWQsIHR5cGVOYW1lcywgeFZhbHVlcywgeXZhbHVlSWRzLCB4X25hbWUsIHhWYWx1ZUxhYmVscyxcbiAgICAgICAgICAgIHNvcnRlZFh2YWx1ZXMsIGRpdiwgeF94VmFsdWUsIGxpbmVJRCwgbWVhcywgeSwgd29yZExlbmd0aDtcblxuICAgICAgICB2YXIgdHlwZSA9IG1vZGVUb0ZpZWxkW2JhckdyYXBoTW9kZV07XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICd4Jykge1xuICAgICAgICAgICAgIHZhciBlbnRyaWVzID0gKDxhbnk+ZDMpLm5lc3QodHlwZSlcbiAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZFt0eXBlXTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKGFzc2F5TWVhc3VyZW1lbnRzKTtcblxuICAgICAgICAgICAgdmFyIHRpbWVNZWFzdXJlbWVudHMgPSBfLmNsb25lKGFzc2F5TWVhc3VyZW1lbnRzKTtcbiAgICAgICAgICAgIHZhciBuZXN0ZWRCeVRpbWUgPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRBbGxUaW1lKGVudHJpZXMpO1xuICAgICAgICAgICAgdmFyIGhvd01hbnlUb0luc2VydE9iaiA9IEVEREdyYXBoaW5nVG9vbHMuZmluZE1heFRpbWVEaWZmZXJlbmNlKG5lc3RlZEJ5VGltZSk7XG4gICAgICAgICAgICB2YXIgbWF4ID0gTWF0aC5tYXguYXBwbHkobnVsbCwgXy52YWx1ZXMoaG93TWFueVRvSW5zZXJ0T2JqKSk7XG4gICAgICAgICAgICBpZiAobWF4ID4gNDAwKSB7XG4gICAgICAgICAgICAgICAgJCh0eXBlSURbdHlwZV0pLnByZXBlbmQoXCI8cCBjbGFzcz0nbm9EYXRhJz5Ub28gbWFueSBtaXNzaW5nIGRhdGEgZmllbGRzLiBQbGVhc2UgZmlsdGVyPC9wPlwiKTtcbiAgICAgICAgICAgICAgICAkKCcudG9vTXVjaERhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJCgnLm5vRGF0YScpLnJlbW92ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5pbnNlcnRGYWtlVmFsdWVzKGVudHJpZXMsIGhvd01hbnlUb0luc2VydE9iaiwgdGltZU1lYXN1cmVtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgLy94IGF4aXMgc2NhbGUgZm9yIHR5cGVcbiAgICAgICAgeF9uYW1lID0gZDMuc2NhbGUub3JkaW5hbCgpXG4gICAgICAgICAgICAucmFuZ2VSb3VuZEJhbmRzKFswLCBncmFwaFNldC53aWR0aF0sIDAuMSk7XG5cbiAgICAgICAgLy94IGF4aXMgc2NhbGUgZm9yIHggdmFsdWVzXG4gICAgICAgIHhfeFZhbHVlID0gZDMuc2NhbGUub3JkaW5hbCgpO1xuXG4gICAgICAgIC8veCBheGlzIHNjYWxlIGZvciBsaW5lIGlkIHRvIGRpZmZlcmVudGlhdGUgbXVsdGlwbGUgbGluZXMgYXNzb2NpYXRlZCB3aXRoIHRoZSBzYW1lIG5hbWUvdHlwZVxuICAgICAgICBsaW5lSUQgPSBkMy5zY2FsZS5vcmRpbmFsKCk7XG5cbiAgICAgICAgLy8geSBheGlzIHJhbmdlIHNjYWxlXG4gICAgICAgIHkgPSBkMy5zY2FsZS5saW5lYXIoKVxuICAgICAgICAgICAgLnJhbmdlKFtncmFwaFNldC5oZWlnaHQsIDBdKTtcblxuICAgICAgICBkaXYgPSBkMy5zZWxlY3QoXCJib2R5XCIpLmFwcGVuZChcImRpdlwiKVxuICAgICAgICAgICAgLmF0dHIoXCJjbGFzc1wiLCBcInRvb2x0aXAyXCIpXG4gICAgICAgICAgICAuc3R5bGUoXCJvcGFjaXR5XCIsIDApO1xuXG4gICAgICAgIHZhciBkM19lbnRyaWVzID0gdHlwZSA9PT0gJ3gnID8gdGltZU1lYXN1cmVtZW50cyA6IGFzc2F5TWVhc3VyZW1lbnRzO1xuICAgICAgICAgICAgbWVhcyA9IGQzLm5lc3QoKVxuICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZC55X3VuaXQ7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmVudHJpZXMoZDNfZW50cmllcyk7XG5cbiAgICAgICAgLy8gaWYgdGhlcmUgaXMgbm8gZGF0YSAtIHNob3cgbm8gZGF0YSBlcnJvciBtZXNzYWdlXG4gICAgICAgIGlmIChhc3NheU1lYXN1cmVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICQodHlwZUlEW3R5cGVdKS5wcmVwZW5kKFwiPHAgY2xhc3M9J25vRGF0YSc+Tm8gZGF0YSBzZWxlY3RlZCAtIHBsZWFzZSBcIiArXG4gICAgICAgICAgICBcImZpbHRlcjwvcD5cIik7XG5cbiAgICAgICAgICAgICQoJy50b29NdWNoRGF0YScpLnJlbW92ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCgnLm5vRGF0YScpLnJlbW92ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Vbml0czsgaSsrKSB7XG4gICAgICAgICAgICB5UmFuZ2UucHVzaChkMy5zY2FsZS5saW5lYXIoKS5yYW5nZVJvdW5kKFtncmFwaFNldC5oZWlnaHQsIDBdKSk7XG4gICAgICAgICAgICB1bml0TWVhc3VyZW1lbnREYXRhLnB1c2goZDMubmVzdCgpXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQueTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKG1lYXNbaV0udmFsdWVzKSk7XG4gICAgICAgICAgICB5TWluLnB1c2goZDMubWluKHVuaXRNZWFzdXJlbWVudERhdGFbaV0sIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkMy5taW4oZC52YWx1ZXMsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC55O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gJ3gnKSB7XG4gICAgICAgICAgICAvLyBuZXN0IGRhdGEgYnkgdHlwZSAoaWUgbWVhc3VyZW1lbnQpIGFuZCBieSB4IHZhbHVlXG4gICAgICAgICAgICBuZXN0ZWQgPSAoPGFueT5kMykubmVzdCh0eXBlKVxuICAgICAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkW3R5cGVdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoZC54KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKHRpbWVNZWFzdXJlbWVudHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gbmVzdCBkYXRhIGJ5IHR5cGUgKGllIG1lYXN1cmVtZW50KSBhbmQgYnkgeCB2YWx1ZVxuICAgICAgICAgICAgbmVzdGVkID0gKDxhbnk+ZDMpLm5lc3QodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkW3R5cGVdO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoZC54KTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmVudHJpZXMoYXNzYXlNZWFzdXJlbWVudHMpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvL2luc2VydCB5IHZhbHVlIHRvIGRpc3Rpbmd1aXNoIGJldHdlZW4gbGluZXNcbiAgICAgICAgZGF0YSA9IEVEREdyYXBoaW5nVG9vbHMuZ2V0WFlWYWx1ZXMobmVzdGVkKTtcblxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBzdmdcbiAgICAgICAgfVxuXG4gICAgICAgIC8vZ2V0IHR5cGUgbmFtZXMgZm9yIHggbGFiZWxzXG4gICAgICAgIHR5cGVOYW1lcyA9IGRhdGEubWFwKChkOmFueSkgPT4gZC5rZXkpO1xuXG4gICAgICAgIC8vc29ydCB4IHZhbHVlc1xuICAgICAgICB0eXBlTmFtZXMuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXG4gICAgICAgIHhWYWx1ZXMgPSBkYXRhLm1hcCgoZDphbnkpID0+IGQudmFsdWVzKTtcblxuICAgICAgICB5dmFsdWVJZHMgPSBkYXRhWzBdLnZhbHVlc1swXS52YWx1ZXMubWFwKChkOmFueSkgPT4gZC5rZXkpO1xuXG4gICAgICAgIC8vIHJldHVybnMgdGltZSB2YWx1ZXNcbiAgICAgICAgeFZhbHVlTGFiZWxzID0geFZhbHVlc1swXS5tYXAoKGQ6YW55KSA9PiBkLmtleSk7XG5cbiAgICAgICAgLy9zb3J0IHRpbWUgdmFsdWVzXG4gICAgICAgIHNvcnRlZFh2YWx1ZXMgPSB4VmFsdWVMYWJlbHMuc29ydCgoYSwgYikgPT4gcGFyc2VGbG9hdChhKSAtIHBhcnNlRmxvYXQoYikpO1xuXG4gICAgICAgIHhfbmFtZS5kb21haW4odHlwZU5hbWVzKTtcblxuICAgICAgICB4X3hWYWx1ZS5kb21haW4oc29ydGVkWHZhbHVlcykucmFuZ2VSb3VuZEJhbmRzKFswLCB4X25hbWUucmFuZ2VCYW5kKCldKTtcblxuICAgICAgICBsaW5lSUQuZG9tYWluKHl2YWx1ZUlkcykucmFuZ2VSb3VuZEJhbmRzKFswLCB4X3hWYWx1ZS5yYW5nZUJhbmQoKV0pO1xuXG4gICAgICAgIC8vIGNyZWF0ZSB4IGF4aXNcbiAgICAgICAgZ3JhcGhTZXQuY3JlYXRlX3hfYXhpcyhncmFwaFNldCwgeF9uYW1lLCBzdmcsIHR5cGUpO1xuXG4gICAgICAgIC8vIGxvb3AgdGhyb3VnaCBkaWZmZXJlbnQgdW5pdHNcbiAgICAgICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IG51bVVuaXRzOyBpbmRleCsrKSB7XG5cbiAgICAgICAgICAgIGlmICh5TWluW2luZGV4XSA+IDAgKSB7XG4gICAgICAgICAgICAgICAgeU1pbltpbmRleF0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy95IGF4aXMgbWluIGFuZCBtYXggZG9tYWluXG4gICAgICAgICAgICB5LmRvbWFpbihbeU1pbltpbmRleF0sIGQzLm1heCh1bml0TWVhc3VyZW1lbnREYXRhW2luZGV4XSwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGQzLm1heChkLnZhbHVlcywgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkLnk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KV0pO1xuXG4gICAgICAgICAgICAvL25lc3QgZGF0YSBhc3NvY2lhdGVkIHdpdGggb25lIHVuaXQgYnkgdHlwZSBhbmQgdGltZSB2YWx1ZVxuICAgICAgICAgICAgZGF0YSA9ICg8YW55PmQzKS5uZXN0KHR5cGUpXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRbdHlwZV07XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGFyc2VGbG9hdChkLngpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudHJpZXMobWVhc1tpbmRleF0udmFsdWVzKTtcblxuXG4gICAgICAgICAgICAvLyAvL2hpZGUgdmFsdWVzIGlmIHRoZXJlIGFyZSBkaWZmZXJlbnQgdGltZSBwb2ludHNcbiAgICAgICAgICAgIGlmICh0eXBlICE9ICd4Jykge1xuICAgICAgICAgICAgICAgIHZhciBuZXN0ZWRCeVRpbWUgPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRBbGxUaW1lKGRhdGEpO1xuICAgICAgICAgICAgICAgIHZhciBob3dNYW55VG9JbnNlcnRPYmogPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRNYXhUaW1lRGlmZmVyZW5jZShuZXN0ZWRCeVRpbWUpO1xuICAgICAgICAgICAgICAgIHZhciBtYXggPSBNYXRoLm1heC5hcHBseShudWxsLCBfLnZhbHVlcyhob3dNYW55VG9JbnNlcnRPYmopKTtcbiAgICAgICAgICAgICAgICB2YXIgZ3JhcGhTdmcgPSAkKHR5cGVJRFt0eXBlXSlbMF07XG5cbiAgICAgICAgICAgICAgICBpZiAobWF4ID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcudG9vTXVjaERhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZWN0cyA9IGQzLnNlbGVjdEFsbCh0eXBlSURbdHlwZV0gKyAgJyByZWN0JylbMF07XG4gICAgICAgICAgICAgICAgICAgIHN2Z1dpZHRoKGdyYXBoU3ZnLCBhcmVjdHMpO1xuICAgICAgICAgICAgICAgICAgICAgLy9nZXQgd29yZCBsZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgd29yZExlbmd0aCA9IEVEREdyYXBoaW5nVG9vbHMuZ2V0U3VtKHR5cGVOYW1lcyk7XG4gICAgICAgICAgICAgICAgICAgIGQzLnNlbGVjdEFsbCh0eXBlSURbdHlwZV0gKyAnIC54LmF4aXMgdGV4dCcpLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3ZnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5ub0RhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vcmlnaHQgYXhpc1xuICAgICAgICAgICAgaWYgKGluZGV4ID09IDApIHtcbiAgICAgICAgICAgICAgICBncmFwaFNldC5jcmVhdGVfeV9heGlzKGdyYXBoU2V0LCBtZWFzW2luZGV4XS5rZXksIHksIHN2Zyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBzcGFjaW5nID0ge1xuICAgICAgICAgICAgICAgICAgICAxOiBncmFwaFNldC53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgMjogZ3JhcGhTZXQud2lkdGggKyA1MCxcbiAgICAgICAgICAgICAgICAgICAgMzogZ3JhcGhTZXQud2lkdGggKyAxMDAsXG4gICAgICAgICAgICAgICAgICAgIDQ6IGdyYXBoU2V0LndpZHRoICsgMTUwXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAvL2NyZWF0ZSByaWdodCBheGlzXG4gICAgICAgICAgICAgICAgZ3JhcGhTZXQuY3JlYXRlX3JpZ2h0X3lfYXhpcyhtZWFzW2luZGV4XS5rZXksIHksIHN2Zywgc3BhY2luZ1tpbmRleF0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBuYW1lc19nID0gc3ZnLnNlbGVjdEFsbChcIi5ncm91cFwiICsgaW5kZXgpXG4gICAgICAgICAgICAgICAgLmRhdGEoZGF0YSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoXCJnXCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInRyYW5zbGF0ZShcIiArIHhfbmFtZShkLmtleSkgKyBcIiwwKVwiO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgY2F0ZWdvcmllc19nID0gbmFtZXNfZy5zZWxlY3RBbGwoXCIuY2F0ZWdvcnlcIiArIGluZGV4KVxuICAgICAgICAgICAgICAgIC5kYXRhKGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC52YWx1ZXM7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKS5hcHBlbmQoXCJnXCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInRyYW5zbGF0ZShcIiArIHhfeFZhbHVlKGQua2V5KSArIFwiLDApXCI7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBjYXRlZ29yaWVzX2xhYmVscyA9IGNhdGVnb3JpZXNfZy5zZWxlY3RBbGwoJy5jYXRlZ29yeS1sYWJlbCcgKyBpbmRleClcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtkLmtleV07XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50ZXIoKVxuICAgICAgICAgICAgICAgIC5hcHBlbmQoXCJ0ZXh0XCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ4XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhfeFZhbHVlLnJhbmdlQmFuZCgpIC8gMjtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5hdHRyKCd5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ3JhcGhTZXQuaGVpZ2h0ICsgMjc7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuYXR0cigndGV4dC1hbmNob3InLCAnbWlkZGxlJyk7XG5cbiAgICAgICAgICAgICB2YXIgdmFsdWVzX2cgPSBjYXRlZ29yaWVzX2cuc2VsZWN0QWxsKFwiLnZhbHVlXCIgKyBpbmRleClcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQudmFsdWVzO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGQubGluZU5hbWUgPSBkLmxpbmVOYW1lLnNwbGl0KCcgJykuam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIGQubGluZU5hbWUgPSBkLmxpbmVOYW1lLnNwbGl0KCcvJykuam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAndmFsdWUgdmFsdWUtJyArIGQubGluZU5hbWU7XG4gICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInRyYW5zbGF0ZShcIiArIGxpbmVJRChkLmtleSkgKyBcIiwwKVwiO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKCdtb3VzZW92ZXInLCBmdW5jdGlvbihkKSB7XG4gICAgICAgICAgICAgICAgICAgIGQzLnNlbGVjdEFsbCgnLnZhbHVlJykuc3R5bGUoJ29wYWNpdHknLCAwLjMpO1xuICAgICAgICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwoJy52YWx1ZS0nICsgZC5saW5lTmFtZSkuc3R5bGUoJ29wYWNpdHknLCAxKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKCdtb3VzZW91dCcsIGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgICAgICAgICAgZDMuc2VsZWN0QWxsKCcudmFsdWUnKS5zdHlsZSgnb3BhY2l0eScsIDEpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgcmVjdHMgPSB2YWx1ZXNfZy5zZWxlY3RBbGwoJy5yZWN0JyArIGluZGV4KVxuICAgICAgICAgICAgICAgIC5kYXRhKGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW2RdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKFwicmVjdFwiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJyZWN0XCIpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ3aWR0aFwiLCBsaW5lSUQucmFuZ2VCYW5kKCkpXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJ5XCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geShkLnkpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoXCJoZWlnaHRcIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBncmFwaFNldC5oZWlnaHQgLSB5KGQueSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuc3R5bGUoXCJmaWxsXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC5jb2xvclxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnN0eWxlKFwib3BhY2l0eVwiLCAxKTtcblxuICAgICAgICAgICAgY2F0ZWdvcmllc19nLnNlbGVjdEFsbCgnLnJlY3QnKVxuICAgICAgICAgICAgICAgIC5kYXRhKGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC52YWx1ZXM7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAub24oXCJtb3VzZW92ZXJcIiwgZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIGRpdi50cmFuc2l0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zdHlsZShcIm9wYWNpdHlcIiwgMC45KTtcblxuICAgICAgICAgICAgICAgICAgICBkaXYuaHRtbCgnPHN0cm9uZz4nICsgZC5uYW1lICsgJzwvc3Ryb25nPicgKyBcIjogXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArIFwiPC9icj5cIiArIGQubWVhc3VyZW1lbnQgKyAnPC9icj4nICsgZC55ICsgXCIgXCIgKyBkLnlfdW5pdCArIFwiPC9icj5cIiArIFwiIEBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICBcIiBcIiArIGQueCArIFwiIGhvdXJzXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc3R5bGUoXCJsZWZ0XCIsICgoPGFueT5kMy5ldmVudCkucGFnZVgpICsgXCJweFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnN0eWxlKFwidG9wXCIsICgoPGFueT5kMy5ldmVudCkucGFnZVkgLSAzMCkgKyBcInB4XCIpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKFwibW91c2VvdXRcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBkaXYudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc3R5bGUoXCJvcGFjaXR5XCIsIDApO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy9nZXQgd29yZCBsZW5ndGhcbiAgICAgICAgICAgIHdvcmRMZW5ndGggPSBFRERHcmFwaGluZ1Rvb2xzLmdldFN1bSh0eXBlTmFtZXMpO1xuXG4gICAgICAgICAgICBpZiAod29yZExlbmd0aCA+IDkwICYmIHR5cGUgIT0gJ3gnKSB7XG4gICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwodHlwZUlEW3R5cGVdICsgJyAueC5heGlzIHRleHQnKS5yZW1vdmUoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdvcmRMZW5ndGggPiAxNTAgJiYgdHlwZSA9PT0gJ3gnKSB7XG4gICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwodHlwZUlEW3R5cGVdICsgJyAueC5heGlzIHRleHQnKS5yZW1vdmUoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIHRha2VzIGluIHRoZSB0eXBlIG9mIG1lYXN1cmVtZW50LCBzZWxlY3RvcnMgb2JqLCBzZWxlY3RvciB0eXBlIGFuZFxuICAgICAqIGJ1dHRvbiBvYmogYW5kIHNob3dzIHRoZSBtZWFzdXJlbWVudCBncmFwaCBpcyB0aGUgbWFpbiB0eXBlIGlzIHByb3Rlb21pY1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIHNob3dQcm90ZW9taWNHcmFwaCh0eXBlLCBzZWxlY3RvcnMsIHNlbGVjdG9yLCBidXR0b25zKSB7XG4gICAgICAgIGlmICh0eXBlID09PSdwJykge1xuICAgICAgICAgICAgZDMuc2VsZWN0KHNlbGVjdG9yc1snbGluZSddKS5zdHlsZSgnZGlzcGxheScsICdub25lJyk7XG4gICAgICAgICAgICBkMy5zZWxlY3Qoc2VsZWN0b3JzWydiYXItbWVhc3VyZW1lbnQnXSkuc3R5bGUoJ2Rpc3BsYXknLCAnYmxvY2snKTtcbiAgICAgICAgICAgICQoJ2xhYmVsLmJ0bicpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIHZhciByZWN0cyA9IGQzLnNlbGVjdEFsbCgnLmdyb3VwZWRNZWFzdXJlbWVudCByZWN0JylbMF07XG4gICAgICAgICAgICBzdmdXaWR0aChzZWxlY3RvcnNbc2VsZWN0b3JdLCByZWN0cyk7XG4gICAgICAgICAgICB2YXIgYnV0dG9uID0gICQoJy5ncm91cEJ5TWVhc3VyZW1lbnRCYXInKVswXTtcbiAgICAgICAgICAgICQoYnV0dG9uc1snYmFyLXRpbWUnXSkucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgJChidXR0b25zWydiYXItbGluZSddKS5yZW1vdmVDbGFzcygnaGlkZGVuJyk7XG4gICAgICAgICAgICAkKGJ1dHRvbnNbJ2Jhci1tZWFzdXJlbWVudCddKS5yZW1vdmVDbGFzcygnaGlkZGVuJyk7XG4gICAgICAgICAgICAkKGJ1dHRvbikuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJChidXR0b25zWydiYXItZW1wdHknXSkuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gbGluZVxuICAgICAqIEBwYXJhbSBhc3NheVxuICAgICAqIEByZXR1cm5zIGNvbG9yIGZvciBsaW5lLlxuICAgICAqIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgY29sb3IgaW4gdGhlIGNvbG9yIHF1ZXVlIGZvciBzdHVkaWVzID4yMiBsaW5lcy4gSW5zdGFudGlhdGVkXG4gICAgICogd2hlbiB1c2VyIGNsaWNrcyBvbiBhIGxpbmUuXG4gICAgICovXG4gICAgZnVuY3Rpb24gY2hhbmdlTGluZUNvbG9yKGxpbmUsIGFzc2F5KSB7XG5cbiAgICAgICAgdmFyIGNvbG9yO1xuXG4gICAgICAgIGlmKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID09PSAxKSB7XG4gICAgICAgICAgICBjb2xvciA9IGxpbmVbJ2NvbG9yJ107XG4gICAgICAgICAgICBsaW5lWydkb05vdENoYW5nZSddID0gdHJ1ZTtcbiAgICAgICAgICAgIEVEREdyYXBoaW5nVG9vbHMuY29sb3JRdWV1ZShjb2xvcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgJiYgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID49IDEpIHtcbiAgICAgICAgICAgIGlmIChsaW5lWydkb05vdENoYW5nZSddKSB7XG4gICAgICAgICAgICAgICBjb2xvciA9IGxpbmVbJ2NvbG9yJ107XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gRURER3JhcGhpbmdUb29scy5uZXh0Q29sb3I7XG4gICAgICAgICAgICAgICAgbGluZVsnZG9Ob3RDaGFuZ2UnXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgbGluZVsnY29sb3InXSA9IGNvbG9yO1xuICAgICAgICAgICAgICAgIC8vdGV4dCBsYWJlbCBuZXh0IHRvIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLm5leHQoKTtcbiAgICAgICAgICAgICAgICAvL3VwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLmNvbG9yUXVldWUoY29sb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5wcm9wKCdjaGVja2VkJykgPT09IGZhbHNlICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA+IDEgKXtcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG4gICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPT0gMCkge1xuICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbG9yO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gY2xlYXJBc3NheUZvcm0oKTpKUXVlcnkge1xuICAgICAgICB2YXIgZm9ybTpKUXVlcnkgPSAkKCcjYXNzYXlNYWluJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWFzc2F5LV0nKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49YXNzYXktXScpLmZpbHRlcignOmNoZWNrYm94LCA6cmFkaW8nKS5wcm9wKCdzZWxlY3RlZCcsIGZhbHNlKTtcbiAgICAgICAgZm9ybS5maW5kKCcuY2FuY2VsLWxpbmsnKS5yZW1vdmUoKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIHJldHVybiBmb3JtO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpIHtcbiAgICAgICAgdmFyIHVzZXIgPSBFREREYXRhLlVzZXJzW3JlY29yZC5leHBlcmltZW50ZXJdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWFzc2F5X2lkXScpLnZhbChyZWNvcmQuaWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LW5hbWVdJykudmFsKHJlY29yZC5uYW1lKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1wcm90b2NvbF0nKS52YWwocmVjb3JkLnBpZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZXhwZXJpbWVudGVyXzBdJykudmFsKHVzZXIgJiYgdXNlci51aWQgPyB1c2VyLnVpZCA6ICctLScpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0QXNzYXkoaW5kZXg6bnVtYmVyKTp2b2lkIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgZm9ybTtcbiAgICAgICAgaWYgKCFyZWNvcmQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJbnZhbGlkIEFzc2F5IHJlY29yZCBmb3IgZWRpdGluZzogJyArIGluZGV4KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBmb3JtID0gJCgnI2Fzc2F5TWFpbicpO1xuICAgICAgICBjbGVhckFzc2F5Rm9ybSgpO1xuICAgICAgICBmaWxsQXNzYXlGb3JtKGZvcm0sIHJlY29yZCk7XG4gICAgICAgIGZvcm0ucmVtb3ZlQ2xhc3MoJ29mZicpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICB9XG59O1xuXG5cblxuY2xhc3MgRGF0YUdyaWRBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjQmFzZSkge1xuICAgICAgICBzdXBlcihkYXRhR3JpZFNwZWMpO1xuICAgIH1cblxuICAgIF9nZXRDbGFzc2VzKCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdkYXRhVGFibGUgc29ydGFibGUgZHJhZ2JveGVzIGhhc3RhYmxlY29udHJvbHMgdGFibGUtc3RyaXBlZCc7XG4gICAgfVxuXG4gICAgZ2V0Q3VzdG9tQ29udHJvbHNBcmVhKCk6SFRNTEVsZW1lbnQge1xuICAgICAgICByZXR1cm4gJCgnI3RhYmxlQ29udHJvbHNBcmVhJykuZ2V0KDApO1xuICAgIH1cbn1cblxuXG5cbi8vIEV4dGVuZGluZyB0aGUgc3RhbmRhcmQgQXNzYXlSZWNvcmQgdG8gaG9sZCBzb21lIGNsaWVudC1zaWRlIGNhbGN1bGF0aW9ucy5cbi8vIFRoZSBpZGVhIGlzLCB0aGVzZSBzdGFydCBvdXQgdW5kZWZpbmVkLCBhbmQgYXJlIGNhbGN1bGF0ZWQgb24tZGVtYW5kLlxuaW50ZXJmYWNlIEFzc2F5UmVjb3JkRXhlbmRlZCBleHRlbmRzIEFzc2F5UmVjb3JkIHtcbiAgICBtYXhYVmFsdWU6bnVtYmVyO1xufVxuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgQXNzYXlzIHRhYmxlKHMpXG5jbGFzcyBEYXRhR3JpZFNwZWNBc3NheXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIG1ldGFEYXRhSURzVXNlZEluQXNzYXlzOmFueTtcbiAgICBtYXhpbXVtWFZhbHVlSW5EYXRhOm51bWJlcjtcblxuICAgIG1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYzpEYXRhR3JpZEhlYWRlclNwZWM7XG5cbiAgICBncmFwaE9iamVjdDphbnk7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5ncmFwaE9iamVjdCA9IG51bGw7XG4gICAgICAgIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjID0gbnVsbDtcbiAgICB9XG5cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIHRoaXMuZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCk7XG4gICAgICAgIHN1cGVyLmluaXQoKTtcbiAgICB9XG5cbiAgICAvLyBBbiBhcnJheSBvZiB1bmlxdWUgaWRlbnRpZmllcnMsIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHJlY29yZHMgaW4gdGhlIGRhdGEgc2V0IGJlaW5nIGRpc3BsYXllZFxuICAgIGdldFJlY29yZElEcygpOmFueVtdIHtcbiAgICAgICAgdmFyIGxyID0gU3R1ZHlEYXRhUGFnZS5wcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5sYXN0RmlsdGVyaW5nUmVzdWx0cztcbiAgICAgICAgaWYgKGxyKSB7XG4gICAgICAgICAgICByZXR1cm4gbHJbJ2ZpbHRlcmVkQXNzYXlzJ107XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgYW4gb3ZlcnJpZGUuICBDYWxsZWQgd2hlbiBhIGRhdGEgcmVzZXQgaXMgdHJpZ2dlcmVkLCBidXQgYmVmb3JlIHRoZSB0YWJsZSByb3dzIGFyZVxuICAgIC8vIHJlYnVpbHQuXG4gICAgb25EYXRhUmVzZXQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXG4gICAgICAgIHRoaXMuZmluZE1heGltdW1YVmFsdWVJbkRhdGEoKTtcbiAgICAgICAgaWYgKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjICYmIHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICQodGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMuZWxlbWVudCkuY2hpbGRyZW4oJzpmaXJzdCcpLnRleHQoXG4gICAgICAgICAgICAgICAgICAgICdNZWFzdXJpbmcgVGltZXMgKFJhbmdlIDAgdG8gJyArIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSArICcpJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlXG4gICAgLy8gY29udGVudCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgZ2V0VGFibGVFbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0dWR5QXNzYXlzVGFibGUnKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnYXNzYXlzJywge1xuICAgICAgICAgICAgJ2RlZmF1bHRTb3J0JzogMFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmaW5kTWV0YURhdGFJRHNVc2VkSW5Bc3NheXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cyA9IFtdO1xuICAgICAgICB0aGlzLmdldFJlY29yZElEcygpLmZvckVhY2goKGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgJC5lYWNoKGFzc2F5Lm1ldGEgfHwge30sIChtZXRhSWQpID0+IHsgc2Vlbkhhc2hbbWV0YUlkXSA9IHRydWU7IH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgW10ucHVzaC5hcHBseSh0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLCBPYmplY3Qua2V5cyhzZWVuSGFzaCkpO1xuICAgIH1cblxuICAgIGZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk6dm9pZCB7XG4gICAgICAgIHZhciBtYXhGb3JBbGw6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIHJlY29yZHNcbiAgICAgICAgbWF4Rm9yQWxsID0gdGhpcy5nZXRSZWNvcmRJRHMoKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXk6QXNzYXlSZWNvcmRFeGVuZGVkID0gPEFzc2F5UmVjb3JkRXhlbmRlZD5FREREYXRhLkFzc2F5c1thc3NheUlkXSwgbWVhc3VyZXMsIG1heEZvclJlY29yZDtcbiAgICAgICAgICAgIC8vIFNvbWUgY2FjaGluZyB0byBzcGVlZCBzdWJzZXF1ZW50IHJ1bnMgd2F5IHVwLi4uXG4gICAgICAgICAgICBpZiAoYXNzYXkubWF4WFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBtYXhGb3JSZWNvcmQgPSBhc3NheS5tYXhYVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW107XG4gICAgICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIG1lYXN1cmVzXG4gICAgICAgICAgICAgICAgbWF4Rm9yUmVjb3JkID0gbWVhc3VyZXMucmVkdWNlKChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb29rdXA6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmU6YW55ID0gbG9va3VwW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlO1xuICAgICAgICAgICAgICAgICAgICAvLyByZWR1Y2UgdG8gZmluZCBoaWdoZXN0IHZhbHVlIGFjcm9zcyBhbGwgZGF0YSBpbiBtZWFzdXJlbWVudFxuICAgICAgICAgICAgICAgICAgICBtYXhGb3JNZWFzdXJlID0gKG1lYXN1cmUudmFsdWVzIHx8IFtdKS5yZWR1Y2UoKHByZXY6bnVtYmVyLCBwb2ludCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIHBvaW50WzBdWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBtYXhGb3JNZWFzdXJlKTtcbiAgICAgICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgICAgICBhc3NheS5tYXhYVmFsdWUgPSBtYXhGb3JSZWNvcmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgbWF4Rm9yUmVjb3JkKTtcbiAgICAgICAgfSwgMCk7XG4gICAgICAgIC8vIEFueXRoaW5nIGFib3ZlIDAgaXMgYWNjZXB0YWJsZSwgYnV0IDAgd2lsbCBkZWZhdWx0IGluc3RlYWQgdG8gMS5cbiAgICAgICAgdGhpcy5tYXhpbXVtWFZhbHVlSW5EYXRhID0gbWF4Rm9yQWxsIHx8IDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkQXNzYXlOYW1lKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gSW4gYW4gb2xkIHR5cGljYWwgRURERGF0YS5Bc3NheXMgcmVjb3JkIHRoaXMgc3RyaW5nIGlzIGN1cnJlbnRseSBwcmUtYXNzZW1ibGVkIGFuZCBzdG9yZWRcbiAgICAgICAgLy8gaW4gJ2ZuJy4gQnV0IHdlJ3JlIHBoYXNpbmcgdGhhdCBvdXQuIEV2ZW50dWFsbHkgdGhlIG5hbWUgd2lsbCBqdXN0IGJlIC5uYW1lLCB3aXRob3V0XG4gICAgICAgIC8vIGRlY29yYXRpb24uXG4gICAgICAgIHZhciBhc3NheSwgbGluZSwgcHJvdG9jb2xOYW1pbmc7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gYXNzYXkubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRMaW5lTmFtZShpbmRleDogYW55KTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGFzc2F5LCBsaW5lO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsaW5lLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkRXhwZXJpbWVudGVySW5pdGlhbHMoaW5kZXg6YW55KTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgaW5kZXggSUQgZXhpc3RzLCBlbnN1cmUgZXhwZXJpbWVudGVyIHVzZXIgSUQgZXhpc3RzLCB1cHBlcmNhc2UgaW5pdGlhbHMgb3IgP1xuICAgICAgICB2YXIgYXNzYXksIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgoZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1thc3NheS5leHBdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TW9kaWZpY2F0aW9uKGluZGV4OmFueSk6bnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2Q7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiArIGluZGV4LCAnaEFzc2F5c01ldGFpZCcgKyBpZCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogbWRUeXBlLm5hbWUsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBsZWZ0IHNlY3Rpb24gb2YgdGhlIHRhYmxlIGhhcyBBc3NheSBOYW1lIGFuZCBMaW5lIChOYW1lKVxuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoQXNzYXlzTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdBc3NheSBOYW1lJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlOYW1lXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hBc3NheUxpbmVOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xpbmUnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICAvLyBPZmZzZXRzIGZvciB0aGUgcmlnaHQgc2lkZSBvZiB0aGUgdGFibGUgZGVwZW5kcyBvbiBzaXplIG9mIHRoZSBwcmVjZWRpbmcgc2VjdGlvbnNcbiAgICAgICAgdmFyIHJpZ2h0T2Zmc2V0ID0gbGVmdFNpZGUubGVuZ3RoICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aDtcbiAgICAgICAgdmFyIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoKytyaWdodE9mZnNldCwgJ2hBc3NheXNNTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdNZWFzdXJlbWVudCcsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDJcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygrK3JpZ2h0T2Zmc2V0LCAnaEFzc2F5c1VuaXRzJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1VuaXRzJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMlxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKCsrcmlnaHRPZmZzZXQsICdoQXNzYXlzQ291bnQnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ291bnQnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIC8vIFRoZSBtZWFzdXJlbWVudCB0aW1lcyBhcmUgcmVmZXJlbmNlZCBlbHNld2hlcmUsIHNvIGFyZSBzYXZlZCB0byB0aGUgb2JqZWN0XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyA9IG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoXG4gICAgICAgICAgICAgICAgKytyaWdodE9mZnNldCxcbiAgICAgICAgICAgICAgICAnaEFzc2F5c0NvdW50JyxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICduYW1lJzogJ01lYXN1cmluZyBUaW1lcycsXG4gICAgICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoKytyaWdodE9mZnNldCwgJ2hBc3NheXNFeHBlcmltZW50ZXInLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnRXhwZXJpbWVudGVyJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygrK3JpZ2h0T2Zmc2V0LCAnaEFzc2F5c01vZGlmaWVkJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhc3QgTW9kaWZpZWQnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRBc3NheU1vZGlmaWNhdGlvbixcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhSGVhZGVycywgcmlnaHRTaWRlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGkpID0+IHtcbiAgICAgICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpXTtcbiAgICAgICAgICAgIGlmIChyZWNvcmQgJiYgcmVjb3JkLm1ldGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb3JkLm1ldGFbaWRdIHx8ICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhlIGNvbHNwYW4gdmFsdWUgZm9yIGFsbCB0aGUgY2VsbHMgdGhhdCBhcmUgYXNzYXktbGV2ZWwgKG5vdCBtZWFzdXJlbWVudC1sZXZlbCkgaXMgYmFzZWQgb25cbiAgICAvLyB0aGUgbnVtYmVyIG9mIG1lYXN1cmVtZW50cyBmb3IgdGhlIHJlc3BlY3RpdmUgcmVjb3JkLiBTcGVjaWZpY2FsbHksIGl0J3MgdGhlIG51bWJlciBvZlxuICAgIC8vIG1ldGFib2xpdGUgYW5kIGdlbmVyYWwgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmUgYXJlIHRyYW5zY3JpcHRvbWljcyBtZWFzdXJlbWVudHMsIHBsdXMgMSBpZiB0aGVyZVxuICAgIC8vIGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50cywgYWxsIGFkZGVkIHRvZ2V0aGVyLiAgKE9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuKVxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCk6bnVtYmVyIHtcbiAgICAgICAgdmFyIHJlYyA9IEVERERhdGEuQXNzYXlzW2luZGV4XTtcbiAgICAgICAgdmFyIHY6bnVtYmVyID0gKChyZWMuZ2VuZXJhbCAgICAgICAgIHx8IFtdKS5sZW5ndGggK1xuICAgICAgICAgICAgICAgICAgICAgICAgKHJlYy5tZXRhYm9saXRlcyAgICAgfHwgW10pLmxlbmd0aCArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy50cmFuc2NyaXB0aW9ucyB8fCBbXSkubGVuZ3RoID8gMSA6IDApICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgocmVjLnByb3RlaW5zICAgICAgIHx8IFtdKS5sZW5ndGggPyAxIDogMCkgICApIHx8IDE7XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIGdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGxpbmUgPSBFREREYXRhLkxpbmVzW3JlY29yZC5saWRdO1xuICAgICAgICB2YXIgc2lkZU1lbnVJdGVtcyA9IFtcbiAgICAgICAgICAgICc8YSBjbGFzcz1cImFzc2F5LWVkaXQtbGlua1wiIG9uY2xpY2s9XCJTdHVkeURhdGFQYWdlLmVkaXRBc3NheShbJyArIGluZGV4ICsgJ10pXCI+RWRpdCBBc3NheTwvYT4nLFxuICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2Fzc2F5SWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIENTVjwvYT4nXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gU2V0IHVwIGpRdWVyeSBtb2RhbHNcbiAgICAgICAgJChcIiNhc3NheU1haW5cIikuZGlhbG9nKHsgbWluV2lkdGg6IDUwMCwgYXV0b09wZW46IGZhbHNlIH0pO1xuXG4gICAgICAgIC8vIFRPRE8gd2UgcHJvYmFibHkgZG9uJ3Qgd2FudCB0byBzcGVjaWFsLWNhc2UgbGlrZSB0aGlzIGJ5IG5hbWVcbiAgICAgICAgaWYgKEVERERhdGEuUHJvdG9jb2xzW3JlY29yZC5waWRdLm5hbWUgPT0gXCJUcmFuc2NyaXB0b21pY3NcIikge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcy5wdXNoKCc8YSBocmVmPVwiaW1wb3J0L3JuYXNlcS9lZGdlcHJvP2Fzc2F5PScraW5kZXgrJ1wiPkltcG9ydCBSTkEtc2VxIGRhdGEgZnJvbSBFREdFLXBybzwvYT4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdhc3NheUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdhc3NheScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IHNpZGVNZW51SXRlbXMsXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogcmVjb3JkLm5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKGdyaWRTcGVjOiBEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OiBzdHJpbmcpOiBEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBsaW5lID0gRURERGF0YS5MaW5lc1tyZWNvcmQubGlkXTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBsaW5lLm5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbnRlbnRTdHIgPSAnJywgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5ICYmIHR5cGUgJiYgYXNzYXkubWV0YSAmJiAoY29udGVudFN0ciA9IGFzc2F5Lm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyxcbiAgICAgICAgICAgIG9wdDphbnkpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGNlbGxzID0gW10sXG4gICAgICAgICAgICBmYWN0b3J5ID0gKCk6RGF0YUdyaWREYXRhQ2VsbCA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgpO1xuXG4gICAgICAgIGlmICgocmVjb3JkLm1ldGFib2xpdGVzIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICB7ICdyb3dzcGFuJzogcmVjb3JkLm1ldGFib2xpdGVzLmxlbmd0aCB9KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnZlcnQgSURzIHRvIG1lYXN1cmVtZW50cywgc29ydCBieSBuYW1lLCB0aGVuIGNvbnZlcnQgdG8gY2VsbCBvYmplY3RzXG4gICAgICAgICAgICAgICAgY2VsbHMgPSByZWNvcmQubWV0YWJvbGl0ZXMubWFwKG9wdC5tZXRhYm9saXRlVG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zb3J0KG9wdC5tZXRhYm9saXRlVmFsdWVTb3J0KVxuICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChvcHQubWV0YWJvbGl0ZVZhbHVlVG9DZWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoKHJlY29yZC5nZW5lcmFsIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIHsgJ3Jvd3NwYW4nOiByZWNvcmQuZ2VuZXJhbC5sZW5ndGggfSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IElEcyB0byBtZWFzdXJlbWVudHMsIHNvcnQgYnkgbmFtZSwgdGhlbiBjb252ZXJ0IHRvIGNlbGwgb2JqZWN0c1xuICAgICAgICAgICAgICAgIGNlbGxzID0gcmVjb3JkLmdlbmVyYWwubWFwKG9wdC5tZXRhYm9saXRlVG9WYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQob3B0Lm1ldGFib2xpdGVWYWx1ZVNvcnQpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAob3B0Lm1ldGFib2xpdGVWYWx1ZVRvQ2VsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgb25seSBvbmUgY2VsbCBpZiB0aGVyZSBpcyBhbnkgdHJhbnNjcmlwdG9taWNzIGRhdGFcbiAgICAgICAgaWYgKChyZWNvcmQudHJhbnNjcmlwdGlvbnMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC50cmFuc2NyaXB0VG9DZWxsKHJlY29yZC50cmFuc2NyaXB0aW9ucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIG9ubHkgb25lIGNlbGwgaWYgdGhlcmUgaXMgYW55IHByb3Rlb21pY3MgZGF0YVxuICAgICAgICBpZiAoKHJlY29yZC5wcm90ZWlucyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LnByb3RlaW5Ub0NlbGwocmVjb3JkLnByb3RlaW5zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZ2VuZXJhdGUgYSBsb2FkaW5nIGNlbGwgaWYgbm9uZSBjcmVhdGVkIGJ5IG1lYXN1cmVtZW50c1xuICAgICAgICBpZiAoIWNlbGxzLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKHJlY29yZC5jb3VudCkge1xuICAgICAgICAgICAgICAgIC8vIHdlIGhhdmUgYSBjb3VudCwgYnV0IG5vIGRhdGEgeWV0OyBzdGlsbCBsb2FkaW5nXG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmVtcHR5KSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQuZW1wdHkuY2FsbCh7fSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKGZhY3RvcnkoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNlbGxzO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTWVhc3VyZW1lbnROYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBncmlkU3BlYy5nZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVRvVmFsdWUnOiAobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBtdHlwZTphbnkgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgdmFsdWUuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94TmFtZSc6ICdtZWFzdXJlbWVudElkJyxcbiAgICAgICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKCkgPT4geyByZXR1cm4gJ21lYXN1cmVtZW50JyArIHZhbHVlLmlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHZhbHVlLm5hbWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdUcmFuc2NyaXB0b21pY3MgRGF0YSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdQcm90ZW9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJlbXB0eVwiOiAoKSA9PiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICc8aT5ObyBNZWFzdXJlbWVudHM8L2k+J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVVbml0c0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIHVuaXQ6YW55ID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXSB8fCB7fTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAnbmFtZSc6IG10eXBlLm5hbWUgfHwgJycsICdpZCc6IG1lYXN1cmVJZCwgJ3VuaXQnOiB1bml0Lm5hbWUgfHwgJycgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogdmFsdWUudW5pdFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJ1JQS00nXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnJyAvLyBUT0RPOiB3aGF0IGFyZSBwcm90ZW9taWNzIG1lYXN1cmVtZW50IHVuaXRzP1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUNvdW50Q2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIC8vIGZ1bmN0aW9uIHRvIHVzZSBpbiBBcnJheSNyZWR1Y2UgdG8gY291bnQgYWxsIHRoZSB2YWx1ZXMgaW4gYSBzZXQgb2YgbWVhc3VyZW1lbnRzXG4gICAgICAgIHZhciByZWR1Y2VDb3VudCA9IChwcmV2Om51bWJlciwgbWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICByZXR1cm4gcHJldiArIChtZWFzdXJlLnZhbHVlcyB8fCBbXSkubGVuZ3RoO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgKHZhbHVlLm1lYXN1cmUudmFsdWVzIHx8IFtdKS5sZW5ndGgsICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsIGlkcy5yZWR1Y2UocmVkdWNlQ291bnQsIDApLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCBpZHMucmVkdWNlKHJlZHVjZUNvdW50LCAwKSwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU1lYXN1cmluZ1RpbWVzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBzdmdDZWxsRm9yVGltZUNvdW50cyA9IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY29uc29saWRhdGVkLCBzdmcgPSAnJywgdGltZUNvdW50ID0ge307XG4gICAgICAgICAgICAgICAgLy8gY291bnQgdmFsdWVzIGF0IGVhY2ggeCBmb3IgYWxsIG1lYXN1cmVtZW50c1xuICAgICAgICAgICAgICAgIGlkcy5mb3JFYWNoKChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRzOm51bWJlcltdW11bXSA9IG1lYXN1cmUudmFsdWVzIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICBwb2ludHMuZm9yRWFjaCgocG9pbnQ6bnVtYmVyW11bXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGltZUNvdW50W3BvaW50WzBdWzBdXSA9IHRpbWVDb3VudFtwb2ludFswXVswXV0gfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFR5cGVzY3JpcHQgY29tcGlsZXIgZG9lcyBub3QgbGlrZSB1c2luZyBpbmNyZW1lbnQgb3BlcmF0b3Igb24gZXhwcmVzc2lvblxuICAgICAgICAgICAgICAgICAgICAgICAgKyt0aW1lQ291bnRbcG9pbnRbMF1bMF1dO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBtYXAgdGhlIGNvdW50cyB0byBbeCwgeV0gdHVwbGVzXG4gICAgICAgICAgICAgICAgY29uc29saWRhdGVkID0gJC5tYXAodGltZUNvdW50LCAodmFsdWUsIGtleSkgPT4gW1sgW3BhcnNlRmxvYXQoa2V5KV0sIFt2YWx1ZV0gXV0pO1xuICAgICAgICAgICAgICAgIC8vIGdlbmVyYXRlIFNWRyBzdHJpbmdcbiAgICAgICAgICAgICAgICBpZiAoY29uc29saWRhdGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdmcgPSBncmlkU3BlYy5hc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMoY29uc29saWRhdGVkLCAnJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICdtZWFzdXJlJzogbWVhc3VyZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVTb3J0JzogKGE6YW55LCBiOmFueSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB5ID0gYS5uYW1lLnRvTG93ZXJDYXNlKCksIHogPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKDxhbnk+KHkgPiB6KSAtIDxhbnk+KHogPiB5KSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVRvQ2VsbCc6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlID0gdmFsdWUubWVhc3VyZSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0ID0gbWVhc3VyZS5mb3JtYXQgPT09IDEgPyAnY2FyYm9uJyA6ICcnLFxuICAgICAgICAgICAgICAgICAgICBwb2ludHMgPSB2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSxcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKHBvaW50cywgZm9ybWF0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogc3ZnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiBzdmdDZWxsRm9yVGltZUNvdW50cyxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHNcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGV4cCA9IEVERERhdGEuQXNzYXlzW2luZGV4XS5leHA7XG4gICAgICAgIHZhciB1UmVjb3JkID0gRURERGF0YS5Vc2Vyc1tleHBdO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHVSZWNvcmQgPyB1UmVjb3JkLmluaXRpYWxzIDogJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKEVERERhdGEuQXNzYXlzW2luZGV4XS5tb2QpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhwb2ludHMsIGZvcm1hdDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzdmcgPSAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmVyc2lvbj1cIjEuMlwiIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwcHhcIlxcXG4gICAgICAgICAgICAgICAgICAgIHZpZXdCb3g9XCIwIDAgNDcwIDEwXCIgcHJlc2VydmVBc3BlY3RSYXRpbz1cIm5vbmVcIj5cXFxuICAgICAgICAgICAgICAgIDxzdHlsZSB0eXBlPVwidGV4dC9jc3NcIj48IVtDREFUQVtcXFxuICAgICAgICAgICAgICAgICAgICAgICAgLmNQIHsgc3Ryb2tlOnJnYmEoMCwwLDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jViB7IHN0cm9rZTpyZ2JhKDAsMCwyMzAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jRSB7IHN0cm9rZTpyZ2JhKDI1NSwxMjgsMCwxKTsgc3Ryb2tlLXdpZHRoOjRweDsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7IH1cXFxuICAgICAgICAgICAgICAgICAgICBdXT48L3N0eWxlPlxcXG4gICAgICAgICAgICAgICAgPHBhdGggZmlsbD1cInJnYmEoMCwwLDAsMC4wLjA1KVwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZT1cInJnYmEoMCwwLDAsMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBkPVwiTTEwLDVoNDUwXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9XCJzdHJva2Utd2lkdGg6MnB4O1wiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cm9rZS13aWR0aD1cIjJcIj48L3BhdGg+JztcbiAgICAgICAgdmFyIHBhdGhzID0gWyBzdmcgXTtcbiAgICAgICAgcG9pbnRzLnNvcnQoKGEsYikgPT4geyByZXR1cm4gYVswXSAtIGJbMF07IH0pLmZvckVhY2goKHBvaW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgeCA9IHBvaW50WzBdWzBdLFxuICAgICAgICAgICAgICAgIHkgPSBwb2ludFsxXVswXSxcbiAgICAgICAgICAgICAgICByeCA9ICgoeCAvIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSkgKiA0NTApICsgMTAsXG4gICAgICAgICAgICAgICAgdHQgPSBbeSwgJyBhdCAnLCB4LCAnaCddLmpvaW4oJycpO1xuICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY0VcIiBkPVwiTScsIHJ4LCAnLDV2NFwiPjwvcGF0aD4nXS5qb2luKCcnKSk7XG4gICAgICAgICAgICBpZiAoeSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJywydjZcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNQXCIgZD1cIk0nLCByeCwgJywxdjRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKGZvcm1hdCA9PT0gJ2NhcmJvbicpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjVlwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY4XCI+PHRpdGxlPicsIHR0LCAnPC90aXRsZT48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcGF0aHMucHVzaCgnPC9zdmc+Jyk7XG4gICAgICAgIHJldHVybiBwYXRocy5qb2luKCdcXG4nKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgbWV0YURhdGFDb2xzOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgcmlnaHRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgY291bnRlcjpudW1iZXIgPSAwO1xuXG4gICAgICAgIGxlZnRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVBc3NheU5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZUxpbmVOYW1lQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcblxuICAgICAgICByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlVW5pdHNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZUNvdW50Q2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVNb2RpZmljYXRpb25EYXRlQ2VsbHMpXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUNvbHMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cbiAgICBkZWZpbmVDb2x1bW5Hcm91cFNwZWMoKTpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdIHtcbiAgICAgICAgdmFyIHRvcFNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xpbmUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgdmFyIG1ldGFEYXRhQ29sR3JvdXBzOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW107XG4gICAgICAgIG1ldGFEYXRhQ29sR3JvdXBzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKG1kVHlwZS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGJvdHRvbVNlY3Rpb246RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyZW1lbnQnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdVbml0cycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0NvdW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTWVhc3VyaW5nIFRpbWVzJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnRXhwZXJpbWVudGVyJywgeyAnaGlkZGVuQnlEZWZhdWx0JzogdHJ1ZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnTGFzdCBNb2RpZmllZCcsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gdG9wU2VjdGlvbi5jb25jYXQobWV0YURhdGFDb2xHcm91cHMsIGJvdHRvbVNlY3Rpb24pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cbiAgICAvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cbiAgICBjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZEhlYWRlcldpZGdldFtdID0gW107XG5cbiAgICAgICAgLy8gQSBcInNlbGVjdCBhbGwgLyBzZWxlY3Qgbm9uZVwiIGJ1dHRvblxuICAgICAgICB2YXIgc2VsZWN0QWxsV2lkZ2V0ID0gbmV3IERHU2VsZWN0QWxsQXNzYXlzTWVhc3VyZW1lbnRzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2VsZWN0QWxsV2lkZ2V0LmRpc3BsYXlCZWZvcmVWaWV3TWVudSh0cnVlKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goc2VsZWN0QWxsV2lkZ2V0KTtcblxuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG4gICAgLy8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcbiAgICAgICAgdmFyIGRpc2FibGVkQXNzYXlzV2lkZ2V0ID0gbmV3IERHRGlzYWJsZWRBc3NheXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB2YXIgZW1wdHlBc3NheXNXaWRnZXQgPSBuZXcgREdFbXB0eUFzc2F5c1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGRpc2FibGVkQXNzYXlzV2lkZ2V0KTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZW1wdHlBc3NheXNXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkQXNzYXlzKTp2b2lkIHtcblxuICAgICAgICAvLyBXaXJlIHVwIHRoZSAnYWN0aW9uIHBhbmVscycgZm9yIHRoZSBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgJCh0YWJsZSkub24oJ2NoYW5nZScsICc6Y2hlY2tib3gnLCAoKSA9PiBTdHVkeURhdGFQYWdlLnF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCkpO1xuXG4gICAgICAgIC8vIFJ1biBpdCBvbmNlIGluIGNhc2UgdGhlIHBhZ2Ugd2FzIGdlbmVyYXRlZCB3aXRoIGNoZWNrZWQgQXNzYXlzXG4gICAgICAgIFN0dWR5RGF0YVBhZ2UucXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICB9XG59XG5cblxuLy8gQSBzbGlnaHRseSBtb2RpZmllZCBcIlNlbGVjdCBBbGxcIiBoZWFkZXIgd2lkZ2V0XG4vLyB0aGF0IHRyaWdnZXJzIGEgcmVmcmVzaCBvZiB0aGUgYWN0aW9ucyBwYW5lbCB3aGVuIGl0IGNoYW5nZXMgdGhlIGNoZWNrYm94IHN0YXRlLlxuY2xhc3MgREdTZWxlY3RBbGxBc3NheXNNZWFzdXJlbWVudHNXaWRnZXQgZXh0ZW5kcyBER1NlbGVjdEFsbFdpZGdldCB7XG5cbiAgICBjbGlja0hhbmRsZXIoKTp2b2lkIHtcbiAgICAgICAgc3VwZXIuY2xpY2tIYW5kbGVyKCk7XG4gICAgICAgIFN0dWR5RGF0YVBhZ2UucXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICAgfVxufVxuXG5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgQXNzYXlzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRBc3NheXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICAvLyBSZXR1cm4gYSBmcmFnbWVudCB0byB1c2UgaW4gZ2VuZXJhdGluZyBvcHRpb24gd2lkZ2V0IElEc1xuICAgIGdldElERnJhZ21lbnQodW5pcXVlSUQpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnVGFibGVTaG93REFzc2F5c0NCJztcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gdGV4dCB1c2VkIHRvIGxhYmVsIHRoZSB3aWRnZXRcbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3cgRGlzYWJsZWQnO1xuICAgIH1cblxuICAgIGdldExhYmVsVGl0bGUoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJTaG93IGFzc2F5cyB0aGF0IGhhdmUgYmVlbiBkaXNhYmxlZC5cIjtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyb2wgc2hvdWxkIGJlIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgIGlzRW5hYmxlZEJ5RGVmYXVsdCgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gISEoJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgYWN0aXZhdGlvbiBvZiB3aWRnZXRcbiAgICBvbldpZGdldENoYW5nZShlKTp2b2lkIHtcbiAgICAgICAgdmFyIGFtSUNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICB2YXIgaXNPdGhlckNoZWNrZWQ6Ym9vbGVhbiA9ICQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKTtcbiAgICAgICAgJCgnI2ZpbHRlcmluZ1Nob3dEaXNhYmxlZENoZWNrYm94JykucHJvcCgnY2hlY2tlZCcsIGFtSUNoZWNrZWQpO1xuICAgICAgICBpZiAoYW1JQ2hlY2tlZCAhPSBpc090aGVyQ2hlY2tlZCkge1xuICAgICAgICAgICAgU3R1ZHlEYXRhUGFnZS5xdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBkb24ndCBjYWxsIHRoZSBzdXBlcmNsYXNzIHZlcnNpb24gb2YgdGhpcyBmdW5jdGlvbiBiZWNhdXNlIHdlIGRvbid0XG4gICAgICAgIC8vIHdhbnQgdG8gdHJpZ2dlciBhIGNhbGwgdG8gYXJyYW5nZVRhYmxlRGF0YVJvd3MganVzdCB5ZXQuXG4gICAgICAgIC8vIFRoZSBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUgZnVuY3Rpb24gd2lsbCBkbyBpdCBmb3IgdXMsIGFmdGVyXG4gICAgICAgIC8vIHJlYnVpbGRpbmcgdGhlIGZpbHRlcmluZyBzZWN0aW9uLlxuICAgIH1cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIGNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkICYmIHJvd0lEcyAmJiBFREREYXRhLmN1cnJlbnRTdHVkeVdyaXRhYmxlKSB7XG4gICAgICAgICAgICAkKFwiI2VuYWJsZUJ1dHRvblwiKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKFwiI2VuYWJsZUJ1dHRvblwiKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRpc2FibGVkUm93cyA9ICQoJy5kaXNhYmxlZFJlY29yZCcpO1xuXG4gICAgICAgIHZhciBjaGVja2VkRGlzYWJsZWRSb3dzID0gMDtcbiAgICAgICAgXy5lYWNoKGRpc2FibGVkUm93cywgZnVuY3Rpb24ocm93KSB7XG4gICAgICAgICAgICBpZiAoJChyb3cpLmZpbmQoJ2lucHV0JykucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgY2hlY2tlZERpc2FibGVkUm93cysrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY2hlY2tlZERpc2FibGVkUm93cyA+IDApIHtcbiAgICAgICAgICAgICQoJyNlbmFibGVCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIGZhbHNlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoJyNlbmFibGVCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkKSB7IHJldHVybiByb3dJRHM7IH1cbiAgICAgICAgcmV0dXJuIHJvd0lEcy5maWx0ZXIoKGlkOnN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuICEhKEVERERhdGEuQXNzYXlzW2lkXS5hY3RpdmUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOnN0cmluZyk6YW55IHtcbiAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbcm93SURdO1xuICAgICAgICBpZiAoIWFzc2F5LmFjdGl2ZSkge1xuICAgICAgICAgICAgJC5lYWNoKGRhdGFSb3dPYmplY3RzLCAoeCwgcm93KSA9PiAkKHJvdy5nZXRFbGVtZW50KCkpLmFkZENsYXNzKCdkaXNhYmxlZFJlY29yZCcpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIEFzc2F5cyB0aGF0IGhhdmUgbm8gbWVhc3VyZW1lbnQgZGF0YS5cbmNsYXNzIERHRW1wdHlBc3NheXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICAvLyBSZXR1cm4gYSBmcmFnbWVudCB0byB1c2UgaW4gZ2VuZXJhdGluZyBvcHRpb24gd2lkZ2V0IElEc1xuICAgIGdldElERnJhZ21lbnQodW5pcXVlSUQpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnVGFibGVTaG93RUFzc2F5c0NCJztcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gdGV4dCB1c2VkIHRvIGxhYmVsIHRoZSB3aWRnZXRcbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3cgRW1wdHknO1xuICAgIH1cblxuICAgIGdldExhYmVsVGl0bGUoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJTaG93IGFzc2F5cyB0aGF0IGRvbid0IGhhdmUgYW55IG1lYXN1cmVtZW50cyBpbiB0aGVtLlwiO1xuICAgIH1cblxuICAgIC8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgY29udHJvbCBzaG91bGQgYmUgZW5hYmxlZCBieSBkZWZhdWx0XG4gICAgaXNFbmFibGVkQnlEZWZhdWx0KCk6Ym9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhISgkKCcjZmlsdGVyaW5nU2hvd0VtcHR5Q2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJykpO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBhY3RpdmF0aW9uIG9mIHdpZGdldFxuICAgIG9uV2lkZ2V0Q2hhbmdlKGUpOnZvaWQge1xuICAgICAgICB2YXIgYW1JQ2hlY2tlZDpib29sZWFuID0gISEodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCk7XG4gICAgICAgIHZhciBpc090aGVyQ2hlY2tlZDpib29sZWFuID0gISEoJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICAgICAgJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcsIGFtSUNoZWNrZWQpO1xuICAgICAgICBpZiAoYW1JQ2hlY2tlZCAhPSBpc090aGVyQ2hlY2tlZCkge1xuICAgICAgICAgICAgU3R1ZHlEYXRhUGFnZS5xdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBkb24ndCBjYWxsIHRoZSBzdXBlcmNsYXNzIHZlcnNpb24gb2YgdGhpcyBmdW5jdGlvbiBiZWNhdXNlIHdlIGRvbid0XG4gICAgICAgIC8vIHdhbnQgdG8gdHJpZ2dlciBhIGNhbGwgdG8gYXJyYW5nZVRhYmxlRGF0YVJvd3MganVzdCB5ZXQuXG4gICAgICAgIC8vIFRoZSBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUgZnVuY3Rpb24gd2lsbCBkbyBpdCBmb3IgdXMsIGFmdGVyXG4gICAgICAgIC8vIHJlYnVpbGRpbmcgdGhlIGZpbHRlcmluZyBzZWN0aW9uLlxuICAgIH1cblxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG5cbiAgICAgICAgdmFyIGNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICAvLyBJZiB0aGUgYm94IGlzIGNoZWNrZWQsIHJldHVybiB0aGUgc2V0IG9mIElEcyB1bmZpbHRlcmVkXG4gICAgICAgIGlmIChjaGVja2VkKSB7IHJldHVybiByb3dJRHM7IH1cbiAgICAgICAgcmV0dXJuIHJvd0lEcy5maWx0ZXIoKGlkOnN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuICEhKEVERERhdGEuQXNzYXlzW2lkXS5jb3VudCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOmFueSwgcm93SUQ6c3RyaW5nKTphbnkge1xuICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1tyb3dJRF07XG4gICAgICAgIGlmICghYXNzYXkuY291bnQpIHtcbiAgICAgICAgICAgICQuZWFjaChkYXRhUm93T2JqZWN0cywgKHgsIHJvdykgPT4gJChyb3cuZ2V0RWxlbWVudCgpKS5hZGRDbGFzcygnZW1wdHlSZWNvcmQnKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoKCkgPT4gU3R1ZHlEYXRhUGFnZS5wcmVwYXJlSXQoKSk7XG4iXX0=