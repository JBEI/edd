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
        var token = Utl.EDD.findCSRFToken();
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
