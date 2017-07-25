// File last modified on: Mon Jul 24 2017 18:16:16  
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
            // clickOnBarGraph(barGraphMode);
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
    function clickOnBarGraph(type) {
        console.log(type);
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktRGF0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlN0dWR5LURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsb0RBQW9EO0FBQ3BELHFEQUFxRDtBQUNyRCwrQkFBK0I7QUFDL0IscUNBQXFDO0FBQ3JDLG9DQUFvQztBQUNwQyw0Q0FBNEM7QUFDNUMsNkNBQTZDOzs7Ozs7QUFLN0MsSUFBVSxhQUFhLENBZzVFdEI7QUFoNUVELFdBQVUsYUFBYSxFQUFDLENBQUM7SUFDckIsWUFBWSxDQUFDO0lBRWIsSUFBSSxXQUFXLENBQUMsQ0FBSSwrQ0FBK0M7SUFDbkUsSUFBSSxrQkFBeUMsQ0FBQztJQUM5QyxJQUFJLFlBQVksQ0FBQyxDQUFJLHlDQUF5QztJQUM5RCxJQUFJLHFCQUE0QixDQUFDO0lBR2pDLElBQUksbUJBQXlCLENBQUM7SUFDOUIsSUFBSSx5QkFBK0IsQ0FBQztJQUVwQyxJQUFJLHVCQUEyQixDQUFDO0lBQ2hDLElBQUksd0JBQWdDLENBQUM7SUFDckMsSUFBSSw2QkFBaUMsQ0FBQztJQUV0QyxJQUFJLHdCQUF3QixHQUFHLENBQUMsQ0FBQztJQUVqQyxJQUFJLFFBQVksQ0FBQztJQUVqQixtRUFBbUU7SUFDbkUsSUFBSSxrQkFBa0IsQ0FBQztJQWtDdkIsOENBQThDO0lBQzlDO1FBeUJJLDZEQUE2RDtRQUM3RDtZQUVJLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQzdCLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBRTFCLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLGtCQUFrQixHQUFH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RSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEMsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsMkRBQTZCLEdBQTdCLFVBQThCLGNBQWtCLEVBQUUsS0FBWTtRQUMxRCxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2xDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDZixDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFDLENBQUMsRUFBRSxHQUFHLElBQUssT0FBQSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUEzQyxDQUEyQyxDQUFDLENBQUM7UUFDcEYsQ0FBQztJQUNMLENBQUM7SUFDTCwwQkFBQztBQUFELENBQUMsQUFuREQsQ0FBa0Msb0JBQW9CLEdBbURyRDtBQUdELHVFQUF1RTtBQUN2RSxDQUFDLENBQUMsY0FBTSxPQUFBLGFBQWEsQ0FBQyxTQUFTLEVBQUUsRUFBekIsQ0FBeUIsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gRmlsZSBsYXN0IG1vZGlmaWVkIG9uOiBNb24gSnVsIDI0IDIwMTcgMTg6MTY6MTYgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRURER3JhcGhpbmdUb29scy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vdHlwaW5ncy9kMy9kMy5kLnRzXCIvPlxuXG5cbmRlY2xhcmUgdmFyIEVERERhdGE6RURERGF0YTtcblxubmFtZXNwYWNlIFN0dWR5RGF0YVBhZ2Uge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIHZhciB2aWV3aW5nTW9kZTsgICAgLy8gQW4gZW51bTogJ2xpbmVncmFwaCcsICdiYXJncmFwaCcsIG9yICd0YWJsZSdcbiAgICB2YXIgdmlld2luZ01vZGVJc1N0YWxlOntbaWQ6c3RyaW5nXTogYm9vbGVhbn07XG4gICAgdmFyIGJhckdyYXBoTW9kZTsgICAgLy8gYW4gZW51bTogJ3RpbWUnLCAnbGluZScsICdtZWFzdXJlbWVudCdcbiAgICB2YXIgYmFyR3JhcGhUeXBlQnV0dG9uc0pROkpRdWVyeTtcblxuICAgIGV4cG9ydCB2YXIgcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQ6IFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0O1xuICAgIHZhciBwb3N0RmlsdGVyaW5nQXNzYXlzOmFueVtdO1xuICAgIHZhciBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzOmFueVtdO1xuXG4gICAgdmFyIGFjdGlvblBhbmVsUmVmcmVzaFRpbWVyOmFueTtcbiAgICB2YXIgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyOmJvb2xlYW47XG4gICAgdmFyIHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyOmFueTtcblxuICAgIHZhciByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPSAwO1xuXG4gICAgdmFyIGNvbG9yT2JqOmFueTtcblxuICAgIC8vIFRhYmxlIHNwZWMgYW5kIHRhYmxlIG9iamVjdHMsIG9uZSBlYWNoIHBlciBQcm90b2NvbCwgZm9yIEFzc2F5cy5cbiAgICB2YXIgYXNzYXlzRGF0YUdyaWRTcGVjO1xuICAgIGV4cG9ydCB2YXIgYXNzYXlzRGF0YUdyaWQ7XG5cbiAgICAvLyBVdGlsaXR5IGludGVyZmFjZSB1c2VkIGJ5IEdlbmVyaWNGaWx0ZXJTZWN0aW9uI3VwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoXG4gICAgZXhwb3J0IGludGVyZmFjZSBWYWx1ZVRvVW5pcXVlSUQge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcjtcbiAgICB9XG4gICAgZXhwb3J0IGludGVyZmFjZSBWYWx1ZVRvU3RyaW5nIHtcbiAgICAgICAgW2luZGV4OiBzdHJpbmddOiBzdHJpbmc7XG4gICAgfVxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVmFsdWVUb1VuaXF1ZUxpc3Qge1xuICAgICAgICBbaW5kZXg6IHN0cmluZ106IG51bWJlcltdO1xuICAgIH1cbiAgICBleHBvcnQgaW50ZXJmYWNlIFVuaXF1ZUlEVG9WYWx1ZSB7XG4gICAgICAgIFtpbmRleDogbnVtYmVyXTogc3RyaW5nO1xuICAgIH1cbiAgICAvLyBVc2VkIGluIFByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0I3ByZXBhcmVGaWx0ZXJpbmdTZWN0aW9uXG4gICAgZXhwb3J0IGludGVyZmFjZSBSZWNvcmRJRFRvQm9vbGVhbiB7XG4gICAgICAgIFtpbmRleDogc3RyaW5nXTogYm9vbGVhbjtcbiAgICB9XG4gICAgLy8gVXNlZCB0byBrZWVwIHRyYWNrIG9mIGFsbCB0aGUgYWNjdW11bGF0ZWQgcmVjb3JkIElEcyB0aGF0IGNhbiBiZSB1c2VkIHRvXG4gICAgLy8gcG9wdWxhdGUgdGhlIGZpbHRlcnMuICBXZSB1c2UgdGhpcyB0byByZXBvcHVsYXRlIGZpbHRlcnMgd2hlbiB0aGUgbW9kZSBoYXMgY2hhbmdlZCxcbiAgICAvLyBmb3IgZXhhbXBsZSwgdG8gc2hvdyBjcml0ZXJpYSBmb3IgZGlzYWJsZWQgYXNzYXlzLCBvciBhc3NheXMgd2l0aCBubyBtZWFzdXJlbWVudHMuXG4gICAgLy8gVG8gc3BlZWQgdGhpbmdzIHVwIHdlIHdpbGwgYWNjdW11bGF0ZSBhcnJheXMsIGVuc3VyaW5nIHRoYXQgdGhlIElEcyBpbiBlYWNoIGFycmF5XG4gICAgLy8gYXJlIHVuaXF1ZSAodG8gdGhlIGdpdmVuIGFycmF5KSBieSB0cmFja2luZyBhbHJlYWR5LXNlZW4gSURzIHdpdGggYm9vbGVhbiBmbGFncy5cbiAgICBleHBvcnQgaW50ZXJmYWNlIEFjY3VtdWxhdGVkUmVjb3JkSURzIHtcbiAgICAgICAgc2VlblJlY29yZEZsYWdzOiBSZWNvcmRJRFRvQm9vbGVhbjtcbiAgICAgICAgbWV0YWJvbGl0ZUlEczogc3RyaW5nW107XG4gICAgICAgIHByb3RlaW5JRHM6IHN0cmluZ1tdO1xuICAgICAgICBnZW5lSURzOiBzdHJpbmdbXTtcbiAgICAgICAgbWVhc3VyZW1lbnRJRHM6IHN0cmluZ1tdO1xuICAgIH1cblxuXG4gICAgLy8gRm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiBvbiB0aGUgbWFpbiBncmFwaFxuICAgIGV4cG9ydCBjbGFzcyBQcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldCB7XG5cbiAgICAgICAgLy8gVGhlc2UgYXJlIHRoZSBpbnRlcm5hbCBzZXR0aW5ncyBmb3IgdGhlIHdpZGdldC5cbiAgICAgICAgLy8gVGhleSBtYXkgZGlmZmVyIGZyb20gdGhlIFVJLCBpZiB3ZSBoYXZlbid0IHJlZnJlc2hlZCB0aGUgZmlsdGVyaW5nIHNlY3Rpb24uXG4gICAgICAgIHNob3dpbmdEaXNhYmxlZDpib29sZWFuO1xuICAgICAgICBzaG93aW5nRW1wdHk6Ym9vbGVhbjtcblxuICAgICAgICBhbGxGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBhc3NheUZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIC8vIE1lYXN1cmVtZW50R3JvdXBDb2RlOiBOZWVkIHRvIGtlZXAgYSBzZXBhcmF0ZSBmaWx0ZXIgbGlzdCBmb3IgZWFjaCB0eXBlLlxuICAgICAgICBtZXRhYm9saXRlRmlsdGVyczogR2VuZXJpY0ZpbHRlclNlY3Rpb25bXTtcbiAgICAgICAgcHJvdGVpbkZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG4gICAgICAgIGdlbmVGaWx0ZXJzOiBHZW5lcmljRmlsdGVyU2VjdGlvbltdO1xuICAgICAgICBtZWFzdXJlbWVudEZpbHRlcnM6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uW107XG5cbiAgICAgICAgbWV0YWJvbGl0ZURhdGFQcmVzZW50OiBib29sZWFuO1xuICAgICAgICBwcm90ZWluRGF0YVByZXNlbnQ6IGJvb2xlYW47XG4gICAgICAgIGdlbmVEYXRhUHJlc2VudDogYm9vbGVhbjtcbiAgICAgICAgZ2VuZXJpY0RhdGFQcmVzZW50OiBib29sZWFuO1xuXG4gICAgICAgIGZpbHRlclRhYmxlSlE6IEpRdWVyeTtcbiAgICAgICAgYWNjdW11bGF0ZWRSZWNvcmRJRHM6IEFjY3VtdWxhdGVkUmVjb3JkSURzO1xuICAgICAgICBsYXN0RmlsdGVyaW5nUmVzdWx0czogYW55O1xuXG5cbiAgICAgICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gaW5pdGlhbGl6ZSBlYWNoIGZpbHRlciBsaXN0LlxuICAgICAgICBjb25zdHJ1Y3RvcigpIHtcblxuICAgICAgICAgICAgdGhpcy5zaG93aW5nRGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuc2hvd2luZ0VtcHR5ID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHRoaXMuYWxsRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hc3NheUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzID0gW107XG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVEYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJUYWJsZUpRID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMgPSB7XG4gICAgICAgICAgICAgICAgc2VlblJlY29yZEZsYWdzOiB7fSxcbiAgICAgICAgICAgICAgICBtZXRhYm9saXRlSURzOiBbXSxcbiAgICAgICAgICAgICAgICBwcm90ZWluSURzOiBbXSxcbiAgICAgICAgICAgICAgICBnZW5lSURzOiBbXSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlbWVudElEczogW11cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLmxhc3RGaWx0ZXJpbmdSZXN1bHRzID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlYWQgdGhyb3VnaCB0aGUgTGluZXMsIEFzc2F5cywgYW5kIEFzc2F5TWVhc3VyZW1lbnRzIHN0cnVjdHVyZXMgdG8gbGVhcm4gd2hhdCB0eXBlcyBhcmUgcHJlc2VudCxcbiAgICAgICAgLy8gdGhlbiBpbnN0YW50aWF0ZSB0aGUgcmVsZXZhbnQgc3ViY2xhc3NlcyBvZiBHZW5lcmljRmlsdGVyU2VjdGlvbiwgdG8gY3JlYXRlIGEgc2VyaWVzIG9mXG4gICAgICAgIC8vIGNvbHVtbnMgZm9yIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbiB1bmRlciB0aGUgbWFpbiBncmFwaCBvbiB0aGUgcGFnZS5cbiAgICAgICAgLy8gVGhpcyBtdXN0IGJlIG91dHNpZGUgdGhlIGNvbnN0cnVjdG9yIGJlY2F1c2UgRURERGF0YS5MaW5lcyBhbmQgRURERGF0YS5Bc3NheXMgYXJlIG5vdCBpbW1lZGlhdGVseSBhdmFpbGFibGVcbiAgICAgICAgLy8gb24gcGFnZSBsb2FkLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBjcmVhdGUgYW5kIGFkZCByZWxldmFudCBmaWx0ZXJzIGZvciBlYWNoIGdyb3VwLlxuICAgICAgICBwcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpOiB2b2lkIHtcblxuICAgICAgICAgICAgdmFyIHNlZW5JbkxpbmVzSGFzaDogUmVjb3JkSURUb0Jvb2xlYW4gPSB7fTtcbiAgICAgICAgICAgIHZhciBzZWVuSW5Bc3NheXNIYXNoOiBSZWNvcmRJRFRvQm9vbGVhbiA9IHt9O1xuXG4gICAgICAgICAgICB0aGlzLmZpbHRlclRhYmxlSlEgPSAkKCc8ZGl2PicpLmFkZENsYXNzKCdmaWx0ZXJUYWJsZScpO1xuICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kKHRoaXMuZmlsdGVyVGFibGVKUSk7XG5cbiAgICAgICAgICAgIC8vIEZpcnN0IGRvIHNvbWUgYmFzaWMgc2FuaXR5IGZpbHRlcmluZyBvbiB0aGUgbGlzdFxuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoYXNzYXlJZDogc3RyaW5nLCBhc3NheTogYW55KTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS5tZXRhIHx8IFtdLCAobWV0YWRhdGFJZCkgPT4geyBzZWVuSW5Bc3NheXNIYXNoW21ldGFkYXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGxpbmUubWV0YSB8fCBbXSwgKG1ldGFkYXRhSWQpID0+IHsgc2VlbkluTGluZXNIYXNoW21ldGFkYXRhSWRdID0gdHJ1ZTsgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGZpbHRlcnMgb24gYXNzYXkgdGFibGVzXG4gICAgICAgICAgICAvLyBUT0RPIG1lZGlhIGlzIG5vdyBhIG1ldGFkYXRhIHR5cGUsIHN0cmFpbiBhbmQgY2FyYm9uIHNvdXJjZSBzaG91bGQgYmUgdG9vXG4gICAgICAgICAgICB2YXIgYXNzYXlGaWx0ZXJzID0gW107XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgUHJvdG9jb2xGaWx0ZXJTZWN0aW9uKCkpOyAvLyBQcm90b2NvbFxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IFN0cmFpbkZpbHRlclNlY3Rpb24oKSk7IC8vIGZpcnN0IGNvbHVtbiBpbiBmaWx0ZXJpbmcgc2VjdGlvblxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IExpbmVOYW1lRmlsdGVyU2VjdGlvbigpKTsgLy8gTElORVxuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IENhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24oKSk7XG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaChuZXcgQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgYXNzYXlGaWx0ZXJzLnB1c2gobmV3IEFzc2F5RmlsdGVyU2VjdGlvbigpKTsgLy8gQXNzYXlcbiAgICAgICAgICAgIC8vIGNvbnZlcnQgc2VlbiBtZXRhZGF0YSBJRHMgdG8gRmlsdGVyU2VjdGlvbiBvYmplY3RzLCBhbmQgcHVzaCB0byBlbmQgb2YgYXNzYXlGaWx0ZXJzXG4gICAgICAgICAgICBhc3NheUZpbHRlcnMucHVzaC5hcHBseShhc3NheUZpbHRlcnMsXG4gICAgICAgICAgICAgICAgJC5tYXAoc2VlbkluQXNzYXlzSGFzaCwgKF8sIGlkOiBzdHJpbmcpID0+IG5ldyBBc3NheU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpKTtcbiAgICAgICAgICAgIGFzc2F5RmlsdGVycy5wdXNoLmFwcGx5KGFzc2F5RmlsdGVycyxcbiAgICAgICAgICAgICAgICAkLm1hcChzZWVuSW5MaW5lc0hhc2gsIChfLCBpZDogc3RyaW5nKSA9PiBuZXcgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbihpZCkpKTtcblxuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycy5wdXNoKG5ldyBNZXRhYm9saXRlQ29tcGFydG1lbnRGaWx0ZXJTZWN0aW9uKCkpO1xuICAgICAgICAgICAgdGhpcy5tZXRhYm9saXRlRmlsdGVycy5wdXNoKG5ldyBNZXRhYm9saXRlRmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5wcm90ZWluRmlsdGVycy5wdXNoKG5ldyBQcm90ZWluRmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycy5wdXNoKG5ldyBHZW5lRmlsdGVyU2VjdGlvbigpKTtcblxuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudEZpbHRlcnMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRGaWx0ZXJzLnB1c2gobmV3IEdlbmVyYWxNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIC8vIEFsbCBmaWx0ZXIgc2VjdGlvbnMgYXJlIGNvbnN0cnVjdGVkOyBub3cgbmVlZCB0byBjYWxsIGNvbmZpZ3VyZSgpIG9uIGFsbFxuICAgICAgICAgICAgdGhpcy5hbGxGaWx0ZXJzID0gW10uY29uY2F0KFxuICAgICAgICAgICAgICAgIGFzc2F5RmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVGaWx0ZXJzLFxuICAgICAgICAgICAgICAgIHRoaXMucHJvdGVpbkZpbHRlcnMsXG4gICAgICAgICAgICAgICAgdGhpcy5nZW5lRmlsdGVycyxcbiAgICAgICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50RmlsdGVycyk7XG4gICAgICAgICAgICB0aGlzLmFsbEZpbHRlcnMuZm9yRWFjaCgoc2VjdGlvbikgPT4gc2VjdGlvbi5jb25maWd1cmUoKSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGNhbiBpbml0aWFsaXplIGFsbCB0aGUgQXNzYXktIGFuZCBMaW5lLWxldmVsIGZpbHRlcnMgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgIHRoaXMuYXNzYXlGaWx0ZXJzID0gYXNzYXlGaWx0ZXJzO1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlTGluZUZpbHRlcnMoKTtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZUNvbHVtbnMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENsZWFyIG91dCBhbnkgb2xkIGZpbHRlcnMgaW4gdGhlIGZpbHRlcmluZyBzZWN0aW9uLCBhbmQgYWRkIGluIHRoZSBvbmVzIHRoYXRcbiAgICAgICAgLy8gY2xhaW0gdG8gYmUgXCJ1c2VmdWxcIi5cbiAgICAgICAgcmVwb3B1bGF0ZUNvbHVtbnMoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgZGFyazpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICAkLmVhY2godGhpcy5hbGxGaWx0ZXJzLCAoaSwgd2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHdpZGdldC5pc0ZpbHRlclVzZWZ1bCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5hZGRUb1BhcmVudCh0aGlzLmZpbHRlclRhYmxlSlFbMF0pO1xuICAgICAgICAgICAgICAgICAgICBkYXJrID0gIWRhcms7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gR2l2ZW4gYSBzZXQgb2YgbWVhc3VyZW1lbnQgcmVjb3JkcyBhbmQgYSBkaWN0aW9uYXJ5IG9mIGNvcnJlc3BvbmRpbmcgdHlwZXNcbiAgICAgICAgLy8gKHBhc3NlZCBkb3duIGZyb20gdGhlIHNlcnZlciBhcyBhIHJlc3VsdCBvZiBhIGRhdGEgcmVxdWVzdCksIHNvcnQgdGhlbSBpbnRvXG4gICAgICAgIC8vIHRoZWlyIHZhcmlvdXMgY2F0ZWdvcmllcywgYW5kIGZsYWcgdGhlbSBhcyBhdmFpbGFibGUgZm9yIHBvcHVhbHRpbmcgdGhlXG4gICAgICAgIC8vIGZpbHRlcmluZyBzZWN0aW9uLiAgVGhlbiBjYWxsIHRvIHJlcG9wdWxhdGUgdGhlIGZpbHRlcmluZyBiYXNlZCBvbiB0aGUgZXhwYW5kZWQgc2V0cy5cbiAgICAgICAgcHJvY2Vzc0luY29taW5nTWVhc3VyZW1lbnRSZWNvcmRzKG1lYXN1cmVzLCB0eXBlcyk6IHZvaWQge1xuXG4gICAgICAgICAgICAvLyBsb29wIG92ZXIgYWxsIGRvd25sb2FkZWQgbWVhc3VyZW1lbnRzLiBtZWFzdXJlcyBjb3JyZXNwb25kcyB0byBBc3NheU1lYXN1cmVtZW50c1xuICAgICAgICAgICAgJC5lYWNoKG1lYXN1cmVzIHx8IHt9LCAoaW5kZXgsIG1lYXN1cmVtZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZW1lbnQuYXNzYXldLCBsaW5lLCBtdHlwZTtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSd2ZSBzZWVuIGl0IGFscmVhZHkgKHJhdGhlciB1bmxpa2VseSksIHNraXAgaXQuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMuc2VlblJlY29yZEZsYWdzW21lYXN1cmVtZW50LmlkXSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLnNlZW5SZWNvcmRGbGFnc1ttZWFzdXJlbWVudC5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkpIHsgcmV0dXJuIH07XG4gICAgICAgICAgICAgICAgbGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSB7IHJldHVybiB9O1xuICAgICAgICAgICAgICAgIG10eXBlID0gdHlwZXNbbWVhc3VyZW1lbnQudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5tZXRhYm9saXRlSURzLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAncCcpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgcHJvdGVpblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLnByb3RlaW5JRHMucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtdHlwZS5mYW1pbHkgPT09ICdnJykgeyAvLyBtZWFzdXJlbWVudCBpcyBvZiBnZW5lIC8gdHJhbnNjcmlwdFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLmdlbmVJRHMucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhyb3cgZXZlcnl0aGluZyBlbHNlIGluIGEgZ2VuZXJhbCBhcmVhXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMubWVhc3VyZW1lbnRJRHMucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLnJlcG9wdWxhdGVBbGxGaWx0ZXJzKCk7ICAgIC8vIFNraXAgdGhlIHF1ZXVlIC0gd2UgbmVlZCB0byByZXBvcHVsYXRlIGltbWVkaWF0ZWx5XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlcG9wdWxhdGVBbGxGaWx0ZXJzKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlTGluZUZpbHRlcnMoKTtcbiAgICAgICAgICAgIHRoaXMucmVwb3B1bGF0ZU1lYXN1cmVtZW50RmlsdGVycygpO1xuICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlQ29sdW1ucygpO1xuICAgICAgICB9XG5cblxuICAgICAgICByZXBvcHVsYXRlTGluZUZpbHRlcnMoKTogdm9pZCB7XG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBc3NheUlkcyA9IHRoaXMuYnVpbGRBc3NheUlEU2V0KCk7XG4gICAgICAgICAgICB0aGlzLmFzc2F5RmlsdGVycy5mb3JFYWNoKChmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICBmaWx0ZXIucG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGZpbHRlcmVkQXNzYXlJZHMpO1xuICAgICAgICAgICAgICAgIGZpbHRlci5wb3B1bGF0ZVRhYmxlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlcG9wdWxhdGVNZWFzdXJlbWVudEZpbHRlcnMoKTogdm9pZCB7XG5cbiAgICAgICAgICAgIHZhciBmaWx0ZXJEaXNhYmxlZDogKGlkOnN0cmluZykgPT4gYm9vbGVhbjtcbiAgICAgICAgICAgIHZhciBwcm9jZXNzOiAoaWRzOiBzdHJpbmdbXSwgaTogbnVtYmVyLCB3aWRnZXQ6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKSA9PiB2b2lkO1xuXG4gICAgICAgICAgICB2YXIgbSA9IHRoaXMuYWNjdW11bGF0ZWRSZWNvcmRJRHMubWV0YWJvbGl0ZUlEcztcbiAgICAgICAgICAgIHZhciBwID0gdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5wcm90ZWluSURzO1xuICAgICAgICAgICAgdmFyIGcgPSB0aGlzLmFjY3VtdWxhdGVkUmVjb3JkSURzLmdlbmVJRHM7XG4gICAgICAgICAgICB2YXIgZ2VuID0gdGhpcy5hY2N1bXVsYXRlZFJlY29yZElEcy5tZWFzdXJlbWVudElEcztcblxuICAgICAgICAgICAgaWYgKCF0aGlzLnNob3dpbmdEaXNhYmxlZCkge1xuXG4gICAgICAgICAgICAgICAgZmlsdGVyRGlzYWJsZWQgPSAobWVhc3VyZUlkOnN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIW1lYXN1cmUpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgICAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFzc2F5KSB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gISFhc3NheS5hY3RpdmU7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIG0gPSBtLmZpbHRlcihmaWx0ZXJEaXNhYmxlZCk7XG4gICAgICAgICAgICAgICAgcCA9IHAuZmlsdGVyKGZpbHRlckRpc2FibGVkKTtcbiAgICAgICAgICAgICAgICBnID0gZy5maWx0ZXIoZmlsdGVyRGlzYWJsZWQpO1xuICAgICAgICAgICAgICAgIGdlbiA9IGdlbi5maWx0ZXIoZmlsdGVyRGlzYWJsZWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLm1ldGFib2xpdGVEYXRhUHJlc2VudCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wcm90ZWluRGF0YVByZXNlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZURhdGFQcmVzZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmdlbmVyaWNEYXRhUHJlc2VudCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBwcm9jZXNzID0gKGlkczogc3RyaW5nW10sIGk6IG51bWJlciwgd2lkZ2V0OiBHZW5lcmljRmlsdGVyU2VjdGlvbik6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHdpZGdldC5wb3B1bGF0ZUZpbHRlckZyb21SZWNvcmRJRHMoaWRzKTtcbiAgICAgICAgICAgICAgICB3aWRnZXQucG9wdWxhdGVUYWJsZSgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKG0ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgbSkpO1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGl0ZURhdGFQcmVzZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQuZWFjaCh0aGlzLnByb3RlaW5GaWx0ZXJzLCBwcm9jZXNzLmJpbmQoe30sIHApKTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb3RlaW5EYXRhUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgcHJvY2Vzcy5iaW5kKHt9LCBnKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5nZW5lRGF0YVByZXNlbnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGdlbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZWFzdXJlbWVudEZpbHRlcnMsIHByb2Nlc3MuYmluZCh7fSwgZ2VuKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5nZW5lcmljRGF0YVByZXNlbnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQnVpbGQgYSBsaXN0IG9mIGFsbCB0aGUgQXNzYXkgSURzIGluIHRoZSBTdHVkeS5cbiAgICAgICAgYnVpbGRBc3NheUlEU2V0KCk6IGFueVtdIHtcbiAgICAgICAgICAgIHZhciBhc3NheUlkczogYW55W10gPSBbXTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGFzc2F5SWQsIGFzc2F5KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkuYWN0aXZlICYmICF0aGlzLnNob3dpbmdEaXNhYmxlZCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmICghYXNzYXkuY291bnQgJiYgIXRoaXMuc2hvd2luZ0VtcHR5KSByZXR1cm47XG4gICAgICAgICAgICAgICAgYXNzYXlJZHMucHVzaChhc3NheUlkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGFzc2F5SWRzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGdsb2JhbCBzZXR0aW5ncyBmb3IgdGhlIGZpbHRlcmluZyBzZWN0aW9uIGFyZSBkaWZmZXJlbnQsIGFuZCByZWJ1aWxkIHRoZVxuICAgICAgICAvLyBzZWN0aW9ucyBpZiBzby4gIFRoZW4sIHN0YXJ0aW5nIHdpdGggYSBsaXN0IG9mIGFsbCB0aGUgQXNzYXkgSURzIGluIHRoZSBTdHVkeSwgd2UgbG9vcCBpdCB0aHJvdWdoIHRoZVxuICAgICAgICAvLyBMaW5lIGFuZCBBc3NheS1sZXZlbCBmaWx0ZXJzLCBjYXVzaW5nIHRoZSBmaWx0ZXJzIHRvIHJlZnJlc2ggdGhlaXIgVUksIG5hcnJvd2luZyB0aGUgc2V0IGRvd24uXG4gICAgICAgIC8vIFdlIHJlc29sdmUgdGhlIHJlc3VsdGluZyBzZXQgb2YgQXNzYXkgSURzIGludG8gbWVhc3VyZW1lbnQgSURzLCB0aGVuIHBhc3MgdGhlbSBvbiB0byB0aGVcbiAgICAgICAgLy8gbWVhc3VyZW1lbnQtbGV2ZWwgZmlsdGVycy4gIEluIHRoZSBlbmQgd2UgcmV0dXJuIGEgc2V0IG9mIG1lYXN1cmVtZW50IElEcyByZXByZXNlbnRpbmcgdGhlXG4gICAgICAgIC8vIGVuZCByZXN1bHQgb2YgYWxsIHRoZSBmaWx0ZXJzLCBzdWl0YWJsZSBmb3IgcGFzc2luZyB0byB0aGUgZ3JhcGhpbmcgZnVuY3Rpb25zLlxuICAgICAgICAvLyBNZWFzdXJlbWVudEdyb3VwQ29kZTogTmVlZCB0byBwcm9jZXNzIGVhY2ggZ3JvdXAgc2VwYXJhdGVseSBoZXJlLlxuICAgICAgICBidWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk6IFZhbHVlVG9VbmlxdWVMaXN0IHtcblxuICAgICAgICAgICAgdmFyIHNob3dpbmdEaXNhYmxlZENCOmJvb2xlYW4gPSAhISgkKCcjZmlsdGVyaW5nU2hvd0Rpc2FibGVkQ2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJykpO1xuICAgICAgICAgICAgdmFyIHNob3dpbmdFbXB0eUNCOmJvb2xlYW4gPSAhISgkKCcjZmlsdGVyaW5nU2hvd0VtcHR5Q2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJykpO1xuXG4gICAgICAgICAgICBpZiAoKHRoaXMuc2hvd2luZ0Rpc2FibGVkICE9IHNob3dpbmdEaXNhYmxlZENCKSB8fCAodGhpcy5zaG93aW5nRW1wdHkgIT0gc2hvd2luZ0VtcHR5Q0IpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93aW5nRGlzYWJsZWQgPSBzaG93aW5nRGlzYWJsZWRDQjtcbiAgICAgICAgICAgICAgICB0aGlzLnNob3dpbmdFbXB0eSA9IHNob3dpbmdFbXB0eUNCO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5yZXBvcHVsYXRlQWxsRmlsdGVycygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBc3NheUlkcyA9IHRoaXMuYnVpbGRBc3NheUlEU2V0KCk7XG5cbiAgICAgICAgICAgIHZhciBmaWx0ZXJpbmdSZXN1bHRzOlZhbHVlVG9VbmlxdWVMaXN0ID0ge307XG4gICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzWydhbGxBc3NheXMnXSA9IGZpbHRlcmVkQXNzYXlJZHM7XG5cbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFzc2F5RmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGZpbHRlcmVkQXNzYXlJZHMgPSBmaWx0ZXIuYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhmaWx0ZXJlZEFzc2F5SWRzKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzW2ZpbHRlci5zZWN0aW9uU2hvcnRMYWJlbF0gPSBmaWx0ZXJlZEFzc2F5SWRzO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbJ2ZpbHRlcmVkQXNzYXlzJ10gPSBmaWx0ZXJlZEFzc2F5SWRzO1xuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnRJZHM6IGFueVtdID0gW107XG4gICAgICAgICAgICAkLmVhY2goZmlsdGVyZWRBc3NheUlkcywgKGksIGFzc2F5SWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICAgICAkLm1lcmdlKG1lYXN1cmVtZW50SWRzLCBhc3NheS5tZWFzdXJlcyB8fCBbXSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZmlsdGVyaW5nUmVzdWx0c1snYWxsTWVhc3VyZW1lbnRzJ10gPSBtZWFzdXJlbWVudElkcztcblxuICAgICAgICAgICAgLy8gV2Ugc3RhcnQgb3V0IHdpdGggZm91ciByZWZlcmVuY2VzIHRvIHRoZSBhcnJheSBvZiBhdmFpbGFibGUgbWVhc3VyZW1lbnQgSURzLCBvbmUgZm9yIGVhY2ggbWFqb3IgY2F0ZWdvcnkuXG4gICAgICAgICAgICAvLyBFYWNoIG9mIHRoZXNlIHdpbGwgYmVjb21lIGl0cyBvd24gYXJyYXkgaW4gdHVybiBhcyB3ZSBuYXJyb3cgaXQgZG93bi5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgdG8gcHJldmVudCBhIHN1Yi1zZWxlY3Rpb24gaW4gb25lIGNhdGVnb3J5IGZyb20gb3ZlcnJpZGluZyBhIHN1Yi1zZWxlY3Rpb24gaW4gdGhlIG90aGVycy5cblxuICAgICAgICAgICAgdmFyIG1ldGFib2xpdGVNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIHZhciBwcm90ZWluTWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRJZHM7XG4gICAgICAgICAgICB2YXIgZ2VuZU1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50SWRzO1xuICAgICAgICAgICAgdmFyIGdlbmVyaWNNZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudElkcztcblxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHdlIG9ubHkgdHJ5IHRvIGZpbHRlciBpZiB3ZSBnb3QgbWVhc3VyZW1lbnRzIHRoYXQgYXBwbHkgdG8gdGhlIHdpZGdldCB0eXBlc1xuXG4gICAgICAgICAgICBpZiAodGhpcy5tZXRhYm9saXRlRGF0YVByZXNlbnQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZXRhYm9saXRlRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBtZXRhYm9saXRlTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcobWV0YWJvbGl0ZU1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbZmlsdGVyLnNlY3Rpb25TaG9ydExhYmVsXSA9IG1ldGFib2xpdGVNZWFzdXJlbWVudHM7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wcm90ZWluRGF0YVByZXNlbnQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcm90ZWluRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBwcm90ZWluTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcocHJvdGVpbk1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbZmlsdGVyLnNlY3Rpb25TaG9ydExhYmVsXSA9IHByb3RlaW5NZWFzdXJlbWVudHM7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lRGF0YVByZXNlbnQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5nZW5lRmlsdGVycywgKGksIGZpbHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnZW5lTWVhc3VyZW1lbnRzID0gZmlsdGVyLmFwcGx5UHJvZ3Jlc3NpdmVGaWx0ZXJpbmcoZ2VuZU1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbZmlsdGVyLnNlY3Rpb25TaG9ydExhYmVsXSA9IGdlbmVNZWFzdXJlbWVudHM7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5nZW5lcmljRGF0YVByZXNlbnQpIHtcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5tZWFzdXJlbWVudEZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZ2VuZXJpY01lYXN1cmVtZW50cyA9IGZpbHRlci5hcHBseVByb2dyZXNzaXZlRmlsdGVyaW5nKGdlbmVyaWNNZWFzdXJlbWVudHMpO1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJpbmdSZXN1bHRzW2ZpbHRlci5zZWN0aW9uU2hvcnRMYWJlbF0gPSBnZW5lcmljTWVhc3VyZW1lbnRzO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPbmNlIHdlJ3ZlIGZpbmlzaGVkIHdpdGggdGhlIGZpbHRlcmluZywgd2Ugd2FudCB0byBzZWUgaWYgYW55IHN1Yi1zZWxlY3Rpb25zIGhhdmUgYmVlbiBtYWRlIGFjcm9zc1xuICAgICAgICAgICAgLy8gYW55IG9mIHRoZSBjYXRlZ29yaWVzLCBhbmQgaWYgc28sIG1lcmdlIHRob3NlIHN1Yi1zZWxlY3Rpb25zIGludG8gb25lLlxuXG4gICAgICAgICAgICAvLyBUaGUgaWRlYSBpcywgd2UgZGlzcGxheSBldmVyeXRoaW5nIHVudGlsIHRoZSB1c2VyIG1ha2VzIGEgc2VsZWN0aW9uIGluIG9uZSBvciBtb3JlIG9mIHRoZSBtYWluIGNhdGVnb3JpZXMsXG4gICAgICAgICAgICAvLyB0aGVuIGRyb3AgZXZlcnl0aGluZyBmcm9tIHRoZSBjYXRlZ29yaWVzIHRoYXQgY29udGFpbiBubyBzZWxlY3Rpb25zLlxuXG4gICAgICAgICAgICAvLyBBbiBleGFtcGxlIHNjZW5hcmlvIHdpbGwgZXhwbGFpbiB3aHkgdGhpcyBpcyBpbXBvcnRhbnQ6XG5cbiAgICAgICAgICAgIC8vIFNheSBhIHVzZXIgaXMgcHJlc2VudGVkIHdpdGggdHdvIGNhdGVnb3JpZXMsIE1ldGFib2xpdGUgYW5kIE1lYXN1cmVtZW50LlxuICAgICAgICAgICAgLy8gTWV0YWJvbGl0ZSBoYXMgY3JpdGVyaWEgJ0FjZXRhdGUnIGFuZCAnRXRoYW5vbCcgYXZhaWxhYmxlLlxuICAgICAgICAgICAgLy8gTWVhc3VyZW1lbnQgaGFzIG9ubHkgb25lIGNyaXRlcmlhIGF2YWlsYWJsZSwgJ09wdGljYWwgRGVuc2l0eScuXG4gICAgICAgICAgICAvLyBCeSBkZWZhdWx0LCBBY2V0YXRlLCBFdGhhbm9sLCBhbmQgT3B0aWNhbCBEZW5zaXR5IGFyZSBhbGwgdW5jaGVja2VkLCBhbmQgYWxsIHZpc2libGUgb24gdGhlIGdyYXBoLlxuICAgICAgICAgICAgLy8gVGhpcyBpcyBlcXVpdmFsZW50IHRvICdyZXR1cm4gbWVhc3VyZW1lbnRzJyBiZWxvdy5cblxuICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgY2hlY2tzICdBY2V0YXRlJywgdGhleSBleHBlY3Qgb25seSBBY2V0YXRlIHRvIGJlIGRpc3BsYXllZCwgZXZlbiB0aG91Z2ggbm8gY2hhbmdlIGhhcyBiZWVuIG1hZGUgdG9cbiAgICAgICAgICAgIC8vIHRoZSBNZWFzdXJlbWVudCBzZWN0aW9uIHdoZXJlIE9wdGljYWwgRGVuc2l0eSBpcyBsaXN0ZWQuXG4gICAgICAgICAgICAvLyBJbiB0aGUgY29kZSBiZWxvdywgYnkgdGVzdGluZyBmb3IgYW55IGNoZWNrZWQgYm94ZXMgaW4gdGhlIG1ldGFib2xpdGVGaWx0ZXJzIGZpbHRlcnMsXG4gICAgICAgICAgICAvLyB3ZSByZWFsaXplIHRoYXQgdGhlIHNlbGVjdGlvbiBoYXMgYmVlbiBuYXJyb3dlZCBkb3duLCBzbyB3ZSBhcHBlbmQgdGhlIEFjZXRhdGUgbWVhc3VyZW1lbnRzIG9udG8gZFNNLlxuICAgICAgICAgICAgLy8gVGhlbiB3aGVuIHdlIGNoZWNrIHRoZSBtZWFzdXJlbWVudEZpbHRlcnMgZmlsdGVycywgd2Ugc2VlIHRoYXQgdGhlIE1lYXN1cmVtZW50IHNlY3Rpb24gaGFzXG4gICAgICAgICAgICAvLyBub3QgbmFycm93ZWQgZG93biBpdHMgc2V0IG9mIG1lYXN1cmVtZW50cywgc28gd2Ugc2tpcCBhcHBlbmRpbmcgdGhvc2UgdG8gZFNNLlxuICAgICAgICAgICAgLy8gVGhlIGVuZCByZXN1bHQgaXMgb25seSB0aGUgQWNldGF0ZSBtZWFzdXJlbWVudHMuXG5cbiAgICAgICAgICAgIC8vIFRoZW4gc3VwcG9zZSB0aGUgdXNlciBjaGVja3MgJ09wdGljYWwgRGVuc2l0eScsIGludGVuZGluZyB0byBjb21wYXJlIEFjZXRhdGUgZGlyZWN0bHkgYWdhaW5zdCBPcHRpY2FsIERlbnNpdHkuXG4gICAgICAgICAgICAvLyBTaW5jZSBtZWFzdXJlbWVudEZpbHRlcnMgbm93IGhhcyBjaGVja2VkIGJveGVzLCB3ZSBwdXNoIGl0cyBtZWFzdXJlbWVudHMgb250byBkU00sXG4gICAgICAgICAgICAvLyB3aGVyZSBpdCBjb21iaW5lcyB3aXRoIHRoZSBBY2V0YXRlLlxuXG4gICAgICAgICAgICB2YXIgYW55Q2hlY2tlZCA9IChmaWx0ZXI6IEdlbmVyaWNGaWx0ZXJTZWN0aW9uKTogYm9vbGVhbiA9PiB7IHJldHVybiBmaWx0ZXIuYW55Q2hlY2tib3hlc0NoZWNrZWQ7IH07XG5cbiAgICAgICAgICAgIHZhciBkU006IGFueVtdID0gW107ICAgIC8vIFwiRGVsaWJlcmF0ZWx5IHNlbGVjdGVkIG1lYXN1cmVtZW50c1wiXG4gICAgICAgICAgICBpZiAoIHRoaXMubWV0YWJvbGl0ZUZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KG1ldGFib2xpdGVNZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAoICAgIHRoaXMucHJvdGVpbkZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KHByb3RlaW5NZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAoICAgICAgIHRoaXMuZ2VuZUZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KGdlbmVNZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAodGhpcy5tZWFzdXJlbWVudEZpbHRlcnMuc29tZShhbnlDaGVja2VkKSkgeyBkU00gPSBkU00uY29uY2F0KGdlbmVyaWNNZWFzdXJlbWVudHMpOyB9XG4gICAgICAgICAgICBpZiAoZFNNLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbJ2ZpbHRlcmVkTWVhc3VyZW1lbnRzJ10gPSBkU007XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZpbHRlcmluZ1Jlc3VsdHNbJ2ZpbHRlcmVkTWVhc3VyZW1lbnRzJ10gPSBtZWFzdXJlbWVudElkcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubGFzdEZpbHRlcmluZ1Jlc3VsdHMgPSBmaWx0ZXJpbmdSZXN1bHRzO1xuICAgICAgICAgICAgcmV0dXJuIGZpbHRlcmluZ1Jlc3VsdHM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiBhbnkgb2YgdGhlIGdsb2JhbCBmaWx0ZXIgc2V0dGluZ3Mgb3IgYW55IG9mIHRoZSBzZXR0aW5ncyBpbiB0aGUgaW5kaXZpZHVhbCBmaWx0ZXJzXG4gICAgICAgIC8vIGhhdmUgY2hhbmdlZCwgcmV0dXJuIHRydWUsIGluZGljYXRpbmcgdGhhdCB0aGUgZmlsdGVyIHdpbGwgZ2VuZXJhdGUgZGlmZmVyZW50IHJlc3VsdHMgaWZcbiAgICAgICAgLy8gcXVlcmllZC5cbiAgICAgICAgY2hlY2tSZWRyYXdSZXF1aXJlZChmb3JjZT86IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICAgICAgICAgIHZhciByZWRyYXc6Ym9vbGVhbiA9ICEhZm9yY2U7XG4gICAgICAgICAgICB2YXIgc2hvd2luZ0Rpc2FibGVkQ0I6Ym9vbGVhbiA9ICEhKCQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgICAgICAgICB2YXIgc2hvd2luZ0VtcHR5Q0I6Ym9vbGVhbiA9ICEhKCQoJyNmaWx0ZXJpbmdTaG93RW1wdHlDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSk7XG5cbiAgICAgICAgICAgIC8vIFdlIGtub3cgdGhlIGludGVybmFsIHN0YXRlIGRpZmZlcnMsIGJ1dCB3ZSdyZSBub3QgaGVyZSB0byB1cGRhdGUgaXQuLi5cbiAgICAgICAgICAgIGlmICh0aGlzLnNob3dpbmdEaXNhYmxlZCAhPSBzaG93aW5nRGlzYWJsZWRDQikgeyByZWRyYXcgPSB0cnVlOyB9XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93aW5nRW1wdHkgIT0gc2hvd2luZ0VtcHR5Q0IpIHsgcmVkcmF3ID0gdHJ1ZTsgfVxuXG4gICAgICAgICAgICAvLyBXYWxrIGRvd24gdGhlIGZpbHRlciB3aWRnZXQgbGlzdC4gIElmIHdlIGVuY291bnRlciBvbmUgd2hvc2UgY29sbGVjdGl2ZSBjaGVja2JveFxuICAgICAgICAgICAgLy8gc3RhdGUgaGFzIGNoYW5nZWQgc2luY2Ugd2UgbGFzdCBtYWRlIHRoaXMgd2FsaywgdGhlbiBhIHJlZHJhdyBpcyByZXF1aXJlZC4gTm90ZSB0aGF0XG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgbm90IHNraXAgdGhpcyBsb29wLCBldmVuIGlmIHdlIGFscmVhZHkga25vdyBhIHJlZHJhdyBpcyByZXF1aXJlZCwgc2luY2UgdGhlXG4gICAgICAgICAgICAvLyBjYWxsIHRvIGFueUZpbHRlclNldHRpbmdzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkgc2V0cyBpbnRlcm5hbCBzdGF0ZSBpbiB0aGUgZmlsdGVyXG4gICAgICAgICAgICAvLyB3aWRnZXRzIHRoYXQgd2Ugd2lsbCB1c2UgbmV4dCB0aW1lIGFyb3VuZC5cbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFsbEZpbHRlcnMsIChpLCBmaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmlsdGVyLmFueUZpbHRlclNldHRpbmdzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKSkgeyByZWRyYXcgPSB0cnVlOyB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiByZWRyYXc7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGdlbmVyaWMgdmVyc2lvbiBvZiBhIGZpbHRlcmluZyBjb2x1bW4gaW4gdGhlIGZpbHRlcmluZyBzZWN0aW9uIGJlbmVhdGggdGhlIGdyYXBoIGFyZWEgb24gdGhlIHBhZ2UsXG4gICAgLy8gbWVhbnQgdG8gYmUgc3ViY2xhc3NlZCBmb3Igc3BlY2lmaWMgY3JpdGVyaWEuXG4gICAgLy8gV2hlbiBpbml0aWFsaXplZCB3aXRoIGEgc2V0IG9mIHJlY29yZCBJRHMsIHRoZSBjb2x1bW4gaXMgZmlsbGVkIHdpdGggbGFiZWxlZCBjaGVja2JveGVzLCBvbmUgZm9yIGVhY2hcbiAgICAvLyB1bmlxdWUgdmFsdWUgb2YgdGhlIGdpdmVuIGNyaXRlcmlhIGVuY291bnRlcmVkIGluIHRoZSByZWNvcmRzLlxuICAgIC8vIER1cmluZyB1c2UsIGFub3RoZXIgc2V0IG9mIHJlY29yZCBJRHMgaXMgcGFzc2VkIGluLCBhbmQgaWYgYW55IGNoZWNrYm94ZXMgYXJlIGNoZWNrZWQsIHRoZSBJRCBzZXQgaXNcbiAgICAvLyBuYXJyb3dlZCBkb3duIHRvIG9ubHkgdGhvc2UgcmVjb3JkcyB0aGF0IGNvbnRhaW4gdGhlIGNoZWNrZWQgdmFsdWVzLlxuICAgIC8vIENoZWNrYm94ZXMgd2hvc2UgdmFsdWVzIGFyZSBub3QgcmVwcmVzZW50ZWQgYW55d2hlcmUgaW4gdGhlIGdpdmVuIElEcyBhcmUgdGVtcG9yYXJpbHkgZGlzYWJsZWQsXG4gICAgLy8gdmlzdWFsbHkgaW5kaWNhdGluZyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdCBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLlxuICAgIC8vIFRoZSBmaWx0ZXJzIGFyZSBtZWFudCB0byBiZSBjYWxsZWQgaW4gc2VxdWVuY2UsIGZlZWRpbmcgZWFjaCByZXR1cm5lZCBJRCBzZXQgaW50byB0aGUgbmV4dCxcbiAgICAvLyBwcm9ncmVzc2l2ZWx5IG5hcnJvd2luZyBkb3duIHRoZSBlbmFibGVkIGNoZWNrYm94ZXMuXG4gICAgLy8gTWVhc3VyZW1lbnRHcm91cENvZGU6IE5lZWQgdG8gc3ViY2xhc3MgdGhpcyBmb3IgZWFjaCBncm91cCB0eXBlLlxuICAgIGV4cG9ydCBjbGFzcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgLy8gQSBkaWN0aW9uYXJ5IG9mIHRoZSB1bmlxdWUgdmFsdWVzIGZvdW5kIGZvciBmaWx0ZXJpbmcgYWdhaW5zdCwgYW5kIHRoZSBkaWN0aW9uYXJ5J3MgY29tcGxlbWVudC5cbiAgICAgICAgLy8gRWFjaCB1bmlxdWUgSUQgaXMgYW4gaW50ZWdlciwgYXNjZW5kaW5nIGZyb20gMSwgaW4gdGhlIG9yZGVyIHRoZSB2YWx1ZSB3YXMgZmlyc3QgZW5jb3VudGVyZWRcbiAgICAgICAgLy8gd2hlbiBleGFtaW5pbmcgdGhlIHJlY29yZCBkYXRhIGluIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoLlxuICAgICAgICB1bmlxdWVWYWx1ZXM6IFVuaXF1ZUlEVG9WYWx1ZTtcbiAgICAgICAgdW5pcXVlSW5kZXhlczogVmFsdWVUb1VuaXF1ZUlEO1xuICAgICAgICB1bmlxdWVJbmRleENvdW50ZXI6IG51bWJlcjtcblxuICAgICAgICAvLyBUaGUgc29ydGVkIG9yZGVyIG9mIHRoZSBsaXN0IG9mIHVuaXF1ZSB2YWx1ZXMgZm91bmQgaW4gdGhlIGZpbHRlclxuICAgICAgICB1bmlxdWVWYWx1ZXNPcmRlcjogbnVtYmVyW107XG5cbiAgICAgICAgLy8gQSBkaWN0aW9uYXJ5IHJlc29sdmluZyBhIHJlY29yZCBJRCAoYXNzYXkgSUQsIG1lYXN1cmVtZW50IElEKSB0byBhbiBhcnJheS4gRWFjaCBhcnJheVxuICAgICAgICAvLyBjb250YWlucyB0aGUgaW50ZWdlciBpZGVudGlmaWVycyBvZiB0aGUgdW5pcXVlIHZhbHVlcyB0aGF0IGFwcGx5IHRvIHRoYXQgcmVjb3JkLlxuICAgICAgICAvLyAoSXQncyByYXJlLCBidXQgdGhlcmUgY2FuIGFjdHVhbGx5IGJlIG1vcmUgdGhhbiBvbmUgY3JpdGVyaWEgdGhhdCBtYXRjaGVzIGEgZ2l2ZW4gSUQsXG4gICAgICAgIC8vICBmb3IgZXhhbXBsZSBhIExpbmUgd2l0aCB0d28gZmVlZHMgYXNzaWduZWQgdG8gaXQuKVxuICAgICAgICBmaWx0ZXJIYXNoOiBWYWx1ZVRvVW5pcXVlTGlzdDtcbiAgICAgICAgLy8gRGljdGlvbmFyeSByZXNvbHZpbmcgdGhlIGZpbHRlciB2YWx1ZXMgdG8gSFRNTCBJbnB1dCBjaGVja2JveGVzLlxuICAgICAgICBjaGVja2JveGVzOiB7W2luZGV4OiBzdHJpbmddOiBKUXVlcnl9O1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHVzZWQgdG8gY29tcGFyZSBjaGVja2JveGVzIHdpdGggYSBwcmV2aW91cyBzdGF0ZSB0byBkZXRlcm1pbmUgd2hldGhlciBhblxuICAgICAgICAvLyB1cGRhdGUgaXMgcmVxdWlyZWQuIFZhbHVlcyBhcmUgJ0MnIGZvciBjaGVja2VkLCAnVScgZm9yIHVuY2hlY2tlZCwgYW5kICdOJyBmb3Igbm90XG4gICAgICAgIC8vIGV4aXN0aW5nIGF0IHRoZSB0aW1lLiAoJ04nIGNhbiBiZSB1c2VmdWwgd2hlbiBjaGVja2JveGVzIGFyZSByZW1vdmVkIGZyb20gYSBmaWx0ZXIgZHVlIHRvXG4gICAgICAgIC8vIHRoZSBiYWNrLWVuZCBkYXRhIGNoYW5naW5nLilcbiAgICAgICAgcHJldmlvdXNDaGVja2JveFN0YXRlOiBWYWx1ZVRvU3RyaW5nO1xuICAgICAgICAvLyBEaWN0aW9uYXJ5IHJlc29sdmluZyB0aGUgZmlsdGVyIHZhbHVlcyB0byBIVE1MIHRhYmxlIHJvdyBlbGVtZW50cy5cbiAgICAgICAgdGFibGVSb3dzOiB7W2luZGV4OiBzdHJpbmddOiBIVE1MVGFibGVSb3dFbGVtZW50fTtcblxuICAgICAgICAvLyBSZWZlcmVuY2VzIHRvIEhUTUwgZWxlbWVudHMgY3JlYXRlZCBieSB0aGUgZmlsdGVyXG4gICAgICAgIGZpbHRlckNvbHVtbkRpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNsZWFySWNvbnM6IEpRdWVyeTtcbiAgICAgICAgcGxhaW50ZXh0VGl0bGVEaXY6IEhUTUxFbGVtZW50O1xuICAgICAgICBzZWFyY2hCb3g6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIHNlYXJjaEJveFRpdGxlRGl2OiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2Nyb2xsWm9uZURpdjogSFRNTEVsZW1lbnQ7XG4gICAgICAgIGZpbHRlcmluZ1RhYmxlOiBKUXVlcnk7XG4gICAgICAgIHRhYmxlQm9keUVsZW1lbnQ6IEhUTUxUYWJsZUVsZW1lbnQ7XG5cbiAgICAgICAgLy8gU2VhcmNoIGJveCByZWxhdGVkXG4gICAgICAgIHR5cGluZ1RpbWVvdXQ6IG51bWJlcjtcbiAgICAgICAgdHlwaW5nRGVsYXk6IG51bWJlcjtcbiAgICAgICAgY3VycmVudFNlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBwcmV2aW91c1NlYXJjaFNlbGVjdGlvbjogc3RyaW5nO1xuICAgICAgICBtaW5DaGFyc1RvVHJpZ2dlclNlYXJjaDogbnVtYmVyO1xuXG4gICAgICAgIGFueUNoZWNrYm94ZXNDaGVja2VkOiBib29sZWFuO1xuXG4gICAgICAgIHNlY3Rpb25UaXRsZTogc3RyaW5nO1xuICAgICAgICBzZWN0aW9uU2hvcnRMYWJlbDogc3RyaW5nO1xuXG4gICAgICAgIC8vIFRPRE86IENvbnZlcnQgdG8gYSBwcm90ZWN0ZWQgY29uc3RydWN0b3IhIFRoZW4gdXNlIGEgZmFjdG9yeSBtZXRob2QgdG8gY3JlYXRlIG9iamVjdHNcbiAgICAgICAgLy8gICAgd2l0aCBjb25maWd1cmUoKSBhbHJlYWR5IGNhbGxlZC4gVHlwZXNjcmlwdCAxLjggZG9lcyBub3Qgc3VwcG9ydCB2aXNpYmlsaXR5XG4gICAgICAgIC8vICAgIG1vZGlmaWVycyBvbiBjb25zdHJ1Y3RvcnMsIHN1cHBvcnQgaXMgYWRkZWQgaW4gVHlwZXNjcmlwdCAyLjBcbiAgICAgICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4Q291bnRlciA9IDA7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyID0gW107XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDaGVja2JveFN0YXRlID0ge307XG5cbiAgICAgICAgICAgIHRoaXMudGFibGVSb3dzID0ge307XG4gICAgICAgICAgICB0aGlzLmNoZWNrYm94ZXMgPSB7fTtcblxuICAgICAgICAgICAgdGhpcy50eXBpbmdUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMudHlwaW5nRGVsYXkgPSAzMzA7ICAgIC8vIFRPRE86IE5vdCBpbXBsZW1lbnRlZFxuICAgICAgICAgICAgdGhpcy5jdXJyZW50U2VhcmNoU2VsZWN0aW9uID0gJyc7XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzU2VhcmNoU2VsZWN0aW9uID0gJyc7XG4gICAgICAgICAgICB0aGlzLm1pbkNoYXJzVG9UcmlnZ2VyU2VhcmNoID0gMTtcbiAgICAgICAgICAgIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbmZpZ3VyZSh0aXRsZTogc3RyaW5nPSdHZW5lcmljIEZpbHRlcicsIHNob3J0TGFiZWw6IHN0cmluZz0nZ2YnKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25UaXRsZSA9IHRpdGxlO1xuICAgICAgICAgICAgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCA9IHNob3J0TGFiZWw7XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUNvbnRhaW5lck9iamVjdHMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENyZWF0ZSBhbGwgdGhlIGNvbnRhaW5lciBIVE1MIG9iamVjdHNcbiAgICAgICAgY3JlYXRlQ29udGFpbmVyT2JqZWN0cygpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBzQm94SUQ6IHN0cmluZyA9ICdmaWx0ZXInICsgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCArICdTZWFyY2hCb3gnLFxuICAgICAgICAgICAgICAgIHNCb3g6IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmZpbHRlckNvbHVtbkRpdiA9ICQoXCI8ZGl2PlwiKS5hZGRDbGFzcygnZmlsdGVyQ29sdW1uJylbMF07XG4gICAgICAgICAgICB2YXIgdGV4dFRpdGxlID0gJChcIjxzcGFuPlwiKS5hZGRDbGFzcygnZmlsdGVyVGl0bGUnKS50ZXh0KHRoaXMuc2VjdGlvblRpdGxlKTtcbiAgICAgICAgICAgIHZhciBjbGVhckljb24gPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJDbGVhckljb24nKTtcbiAgICAgICAgICAgIHRoaXMucGxhaW50ZXh0VGl0bGVEaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckhlYWQnKS5hcHBlbmQoY2xlYXJJY29uKS5hcHBlbmQodGV4dFRpdGxlKVswXTtcblxuICAgICAgICAgICAgJChzQm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpKVxuICAgICAgICAgICAgICAgIC5hdHRyKHtcbiAgICAgICAgICAgICAgICAgICAgJ2lkJzogc0JveElELFxuICAgICAgICAgICAgICAgICAgICAnbmFtZSc6IHNCb3hJRCxcbiAgICAgICAgICAgICAgICAgICAgJ3BsYWNlaG9sZGVyJzogdGhpcy5zZWN0aW9uVGl0bGUsXG4gICAgICAgICAgICAgICAgICAgICdzaXplJzogMTRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNCb3guc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RleHQnKTsgLy8gSlF1ZXJ5IC5hdHRyKCkgY2Fubm90IHNldCB0aGlzXG4gICAgICAgICAgICB0aGlzLnNlYXJjaEJveCA9IHNCb3g7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHR3byBjbGVhciBpY29ucyBmb3IgdGhlIHR3byB2ZXJzaW9ucyBvZiB0aGUgaGVhZGVyICh3aXRoIHNlYXJjaCBhbmQgd2l0aG91dClcbiAgICAgICAgICAgIHZhciBzZWFyY2hDbGVhckljb24gPSAkKFwiPHNwYW4+XCIpLmFkZENsYXNzKCdmaWx0ZXJDbGVhckljb24nKTtcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoQm94VGl0bGVEaXYgPSAkKFwiPGRpdj5cIikuYWRkQ2xhc3MoJ2ZpbHRlckhlYWRTZWFyY2gnKS5hcHBlbmQoc2VhcmNoQ2xlYXJJY29uKS5hcHBlbmQoc0JveClbMF07XG5cbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucyA9IGNsZWFySWNvbi5hZGQoc2VhcmNoQ2xlYXJJY29uKTsgICAgLy8gQ29uc29saWRhdGUgdGhlIHR3byBKUXVlcnkgZWxlbWVudHMgaW50byBvbmVcblxuICAgICAgICAgICAgdGhpcy5jbGVhckljb25zLm9uKCdjbGljaycsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIC8vIENoYW5naW5nIHRoZSBjaGVja2VkIHN0YXR1cyB3aWxsIGF1dG9tYXRpY2FsbHkgdHJpZ2dlciBhIHJlZnJlc2ggZXZlbnRcbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5jaGVja2JveGVzIHx8IHt9LCAoaWQ6IG51bWJlciwgY2hlY2tib3g6IEpRdWVyeSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjaGVja2JveC5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxab25lRGl2ID0gJChcIjxkaXY+XCIpLmFkZENsYXNzKCdmaWx0ZXJDcml0ZXJpYVNjcm9sbFpvbmUnKVswXTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyaW5nVGFibGUgPSAkKFwiPHRhYmxlPlwiKVxuICAgICAgICAgICAgICAgIC5hZGRDbGFzcygnZmlsdGVyQ3JpdGVyaWFUYWJsZSBkcmFnYm94ZXMnKVxuICAgICAgICAgICAgICAgIC5hdHRyKHsgJ2NlbGxwYWRkaW5nJzogMCwgJ2NlbGxzcGFjaW5nJzogMCB9KVxuICAgICAgICAgICAgICAgIC5hcHBlbmQodGhpcy50YWJsZUJvZHlFbGVtZW50ID0gPEhUTUxUYWJsZUVsZW1lbnQ+JChcIjx0Ym9keT5cIilbMF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQnkgY2FsbGluZyB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaCwgd2UgZ28gdGhyb3VnaCB0aGUgcmVjb3JkcyBhbmQgZmluZCBhbGwgdGhlIHVuaXF1ZVxuICAgICAgICAvLyB2YWx1ZXMgaW4gdGhlbSAoZm9yIHRoZSBjcml0ZXJpYSB0aGlzIHBhcnRpY3VsYXIgZmlsdGVyIGlzIGJhc2VkIG9uLilcbiAgICAgICAgLy8gTmV4dCB3ZSBjcmVhdGUgYW4gaW52ZXJ0ZWQgdmVyc2lvbiBvZiB0aGF0IGRhdGEgc3RydWN0dXJlLCBzbyB0aGF0IHRoZSB1bmlxdWUgaWRlbnRpZmllcnNcbiAgICAgICAgLy8gd2UndmUgY3JlYXRlZCBtYXAgdG8gdGhlIHZhbHVlcyB0aGV5IHJlcHJlc2VudCwgYXMgd2VsbCBhcyBhbiBhcnJheVxuICAgICAgICAvLyBvZiB0aGUgdW5pcXVlIGlkZW50aWZpZXJzIHNvcnRlZCBieSB0aGUgdmFsdWVzLiAgVGhlc2UgYXJlIHdoYXQgd2UnbGwgdXNlIHRvIGNvbnN0cnVjdFxuICAgICAgICAvLyB0aGUgcm93cyBvZiBjcml0ZXJpYSB2aXNpYmxlIGluIHRoZSBmaWx0ZXIncyBVSS5cbiAgICAgICAgcG9wdWxhdGVGaWx0ZXJGcm9tUmVjb3JkSURzKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBjclNldDogbnVtYmVyW10sIGNIYXNoOiBVbmlxdWVJRFRvVmFsdWU7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkcyk7XG4gICAgICAgICAgICBjclNldCA9IFtdO1xuICAgICAgICAgICAgY0hhc2ggPSB7fTtcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIHJldmVyc2VkIGhhc2ggc28ga2V5cyBtYXAgdmFsdWVzIGFuZCB2YWx1ZXMgbWFwIGtleXNcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLnVuaXF1ZUluZGV4ZXMsICh2YWx1ZTogc3RyaW5nLCB1bmlxdWVJRDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgY0hhc2hbdW5pcXVlSURdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgY3JTZXQucHVzaCh1bmlxdWVJRCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIEFscGhhYmV0aWNhbGx5IHNvcnQgYW4gYXJyYXkgb2YgdGhlIGtleXMgYWNjb3JkaW5nIHRvIHZhbHVlc1xuICAgICAgICAgICAgY3JTZXQuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBfYTpzdHJpbmcgPSBjSGFzaFthXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHZhciBfYjpzdHJpbmcgPSBjSGFzaFtiXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBfYSA8IF9iID8gLTEgOiBfYSA+IF9iID8gMSA6IDA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlVmFsdWVzID0gY0hhc2g7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyID0gY3JTZXQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJbiB0aGlzIGZ1bmN0aW9uIChvciBhdCBsZWFzdCB0aGUgc3ViY2xhc3NlZCB2ZXJzaW9ucyBvZiBpdCkgd2UgYXJlIHJ1bm5pbmcgdGhyb3VnaCB0aGUgZ2l2ZW5cbiAgICAgICAgLy8gbGlzdCBvZiBtZWFzdXJlbWVudCAob3IgYXNzYXkpIElEcyBhbmQgZXhhbWluaW5nIHRoZWlyIHJlY29yZHMgYW5kIHJlbGF0ZWQgcmVjb3JkcyxcbiAgICAgICAgLy8gbG9jYXRpbmcgdGhlIHBhcnRpY3VsYXIgZmllbGQgd2UgYXJlIGludGVyZXN0ZWQgaW4sIGFuZCBjcmVhdGluZyBhIGxpc3Qgb2YgYWxsIHRoZVxuICAgICAgICAvLyB1bmlxdWUgdmFsdWVzIGZvciB0aGF0IGZpZWxkLiAgQXMgd2UgZ28sIHdlIG1hcmsgZWFjaCB1bmlxdWUgdmFsdWUgd2l0aCBhbiBpbnRlZ2VyIFVJRCxcbiAgICAgICAgLy8gYW5kIGNvbnN0cnVjdCBhIGhhc2ggcmVzb2x2aW5nIGVhY2ggcmVjb3JkIHRvIG9uZSAob3IgcG9zc2libHkgbW9yZSkgb2YgdGhvc2UgaW50ZWdlciBVSURzLlxuICAgICAgICAvLyBUaGlzIHByZXBhcmVzIHVzIGZvciBxdWljayBmaWx0ZXJpbmcgbGF0ZXIgb24uXG4gICAgICAgIC8vIChUaGlzIGdlbmVyaWMgZmlsdGVyIGRvZXMgbm90aGluZywgbGVhdmluZyB0aGVzZSBzdHJ1Y3R1cmVzIGJsYW5rLilcbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0gdGhpcy5maWx0ZXJIYXNoIHx8IHt9O1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0gdGhpcy51bmlxdWVJbmRleGVzIHx8IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNvbWUgdXAgd2l0aCAyIG9yIG1vcmUgY3JpdGVyaWEsIHRoZXJlIGlzIG5vIHBvaW50IGluIGRpc3BsYXlpbmcgdGhlIGZpbHRlcixcbiAgICAgICAgLy8gc2luY2UgaXQgZG9lc24ndCByZXByZXNlbnQgYSBtZWFuaW5nZnVsIGNob2ljZS5cbiAgICAgICAgaXNGaWx0ZXJVc2VmdWwoKTpib29sZWFuIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFkZFRvUGFyZW50KHBhcmVudERpdik6dm9pZCB7XG4gICAgICAgICAgICBwYXJlbnREaXYuYXBwZW5kQ2hpbGQodGhpcy5maWx0ZXJDb2x1bW5EaXYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGV0YWNoKCk6dm9pZCB7XG4gICAgICAgICAgICAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KS5kZXRhY2goKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJ1bnMgdGhyb3VnaCB0aGUgdmFsdWVzIGluIHVuaXF1ZVZhbHVlc09yZGVyLCBhZGRpbmcgYSBjaGVja2JveCBhbmQgbGFiZWwgZm9yIGVhY2hcbiAgICAgICAgLy8gZmlsdGVyaW5nIHZhbHVlIHJlcHJlc2VudGVkLiAgSWYgdGhlcmUgYXJlIG1vcmUgdGhhbiAxNSB2YWx1ZXMsIHRoZSBmaWx0ZXIgZ2V0c1xuICAgICAgICAvLyBhIHNlYXJjaCBib3ggYW5kIHNjcm9sbGJhci5cbiAgICAgICAgLy8gVGhlIGNoZWNrYm94LCBhbmQgdGhlIHRhYmxlIHJvdyB0aGF0IGVuY2xvc2VzIHRoZSBjaGVja2JveCBhbmQgbGFiZWwsIGFyZSBzYXZlZCBpblxuICAgICAgICAvLyBhIGRpY3Rpb25hcnkgbWFwcGVkIGJ5IHRoZSB1bmlxdWUgdmFsdWUgdGhleSByZXByZXNlbnQsIHNvIHRoZXkgY2FuIGJlIHJlLXVzZWQgaWYgdGhlXG4gICAgICAgIC8vIGZpbHRlciBpcyByZWJ1aWx0IChpLmUuIGlmIHBvcHVsYXRlVGFibGUgaXMgY2FsbGVkIGFnYWluLilcbiAgICAgICAgcG9wdWxhdGVUYWJsZSgpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGZDb2wgPSAkKHRoaXMuZmlsdGVyQ29sdW1uRGl2KTtcblxuICAgICAgICAgICAgZkNvbC5jaGlsZHJlbigpLmRldGFjaCgpO1xuICAgICAgICAgICAgLy8gT25seSB1c2UgdGhlIHNjcm9sbGluZyBjb250YWluZXIgZGl2IGlmIHRoZSBzaXplIG9mIHRoZSBsaXN0IHdhcnJhbnRzIGl0LCBiZWNhdXNlXG4gICAgICAgICAgICAvLyB0aGUgc2Nyb2xsaW5nIGNvbnRhaW5lciBkaXYgZGVjbGFyZXMgYSBsYXJnZSBwYWRkaW5nIG1hcmdpbiBmb3IgdGhlIHNjcm9sbCBiYXIsXG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBwYWRkaW5nIG1hcmdpbiB3b3VsZCBiZSBhbiBlbXB0eSB3YXN0ZSBvZiBzcGFjZSBvdGhlcndpc2UuXG4gICAgICAgICAgICBpZiAodGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAxMCkge1xuICAgICAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMuc2VhcmNoQm94VGl0bGVEaXYpLmFwcGVuZCh0aGlzLnNjcm9sbFpvbmVEaXYpO1xuICAgICAgICAgICAgICAgIC8vIENoYW5nZSB0aGUgcmVmZXJlbmNlIHNvIHdlJ3JlIGFmZmVjdGluZyB0aGUgaW5uZXJIVE1MIG9mIHRoZSBjb3JyZWN0IGRpdiBsYXRlciBvblxuICAgICAgICAgICAgICAgIGZDb2wgPSAkKHRoaXMuc2Nyb2xsWm9uZURpdik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZDb2wuYXBwZW5kKHRoaXMucGxhaW50ZXh0VGl0bGVEaXYpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZkNvbC5hcHBlbmQodGhpcy5maWx0ZXJpbmdUYWJsZSk7XG5cbiAgICAgICAgICAgIHZhciB0Qm9keSA9IHRoaXMudGFibGVCb2R5RWxlbWVudDtcbiAgICAgICAgICAgIC8vIENsZWFyIG91dCBhbnkgb2xkIHRhYmxlIGNvbnRlbnRzXG4gICAgICAgICAgICAkKHRoaXMudGFibGVCb2R5RWxlbWVudCkuZW1wdHkoKTtcblxuICAgICAgICAgICAgLy8gbGluZSBsYWJlbCBjb2xvciBiYXNlZCBvbiBncmFwaCBjb2xvciBvZiBsaW5lXG4gICAgICAgICAgICBpZiAodGhpcy5zZWN0aW9uVGl0bGUgPT09IFwiTGluZVwiKSB7ICAgIC8vIFRPRE86IEZpbmQgYSBiZXR0ZXIgd2F5IHRvIGlkZW50aWZ5IHRoaXMgc2VjdGlvblxuICAgICAgICAgICAgICAgIHZhciBjb2xvcnM6YW55ID0ge307XG5cbiAgICAgICAgICAgICAgICAvL2NyZWF0ZSBuZXcgY29sb3JzIG9iamVjdCB3aXRoIGxpbmUgbmFtZXMgYSBrZXlzIGFuZCBjb2xvciBoZXggYXMgdmFsdWVzXG4gICAgICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIEVERERhdGEuTGluZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JzW0VERERhdGEuTGluZXNba2V5XS5uYW1lXSA9IGNvbG9yT2JqW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGb3IgZWFjaCB2YWx1ZSwgaWYgYSB0YWJsZSByb3cgaXNuJ3QgYWxyZWFkeSBkZWZpbmVkLCBidWlsZCBvbmUuXG4gICAgICAgICAgICAvLyBUaGVyZSdzIGV4dHJhIGNvZGUgaW4gaGVyZSB0byBhc3NpZ24gY29sb3JzIHRvIHJvd3MgaW4gdGhlIExpbmVzIGZpbHRlclxuICAgICAgICAgICAgLy8gd2hpY2ggc2hvdWxkIHByb2JhYmx5IGJlIGlzb2xhdGVkIGluIGEgc3ViY2xhc3MuXG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmZvckVhY2goKHVuaXF1ZUlkOiBudW1iZXIpOiB2b2lkID0+IHtcblxuICAgICAgICAgICAgICAgIHZhciBjYm94TmFtZSwgY2VsbCwgcCwgcSwgcjtcbiAgICAgICAgICAgICAgICBjYm94TmFtZSA9IFsnZmlsdGVyJywgdGhpcy5zZWN0aW9uU2hvcnRMYWJlbCwgJ24nLCB1bmlxdWVJZCwgJ2Nib3gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gdGhpcy50YWJsZVJvd3NbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXTtcbiAgICAgICAgICAgICAgICBpZiAoIXJvdykge1xuICAgICAgICAgICAgICAgICAgICAvLyBObyBuZWVkIHRvIGFwcGVuZCBhIG5ldyByb3cgaW4gYSBzZXBhcmF0ZSBjYWxsOlxuICAgICAgICAgICAgICAgICAgICAvLyBpbnNlcnRSb3coKSBjcmVhdGVzLCBhbmQgYXBwZW5kcywgYW5kIHJldHVybnMgb25lLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRhYmxlUm93c1t0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+dGhpcy50YWJsZUJvZHlFbGVtZW50Lmluc2VydFJvdygpO1xuICAgICAgICAgICAgICAgICAgICBjZWxsID0gdGhpcy50YWJsZVJvd3NbdGhpcy51bmlxdWVWYWx1ZXNbdW5pcXVlSWRdXS5pbnNlcnRDZWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tib3hlc1t0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dID0gJChcIjxpbnB1dCB0eXBlPSdjaGVja2JveCc+XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXR0cih7ICduYW1lJzogY2JveE5hbWUsICdpZCc6IGNib3hOYW1lIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oY2VsbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gJCgnPGxhYmVsPicpLmF0dHIoJ2ZvcicsIGNib3hOYW1lKS50ZXh0KHRoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhjZWxsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zZWN0aW9uVGl0bGUgPT09IFwiTGluZVwiKSB7ICAgIC8vIFRPRE86IEZpbmQgYSBiZXR0ZXIgd2F5IHRvIGlkZW50aWZ5IHRoaXMgc2VjdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWwuY3NzKCdmb250LXdlaWdodCcsICdCb2xkJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBFREREYXRhLkxpbmVzKSB7ICAgIC8vIFRPRE86IE1ha2UgdGhpcyBhc3NpZ25tZW50IHdpdGhvdXQgdXNpbmcgYSBsb29wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNba2V5XS5uYW1lID09IHRoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChFREREYXRhLkxpbmVzW2tleV1bJ2lkZW50aWZpZXInXSA9IGNib3hOYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICQocm93KS5hcHBlbmRUbyh0aGlzLnRhYmxlQm9keUVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gVE9ETzogRHJhZyBzZWxlY3QgaXMgdHdpdGNoeSAtIGNsaWNraW5nIGEgdGFibGUgY2VsbCBiYWNrZ3JvdW5kIHNob3VsZCBjaGVjayB0aGUgYm94LFxuICAgICAgICAgICAgLy8gZXZlbiBpZiB0aGUgdXNlciBpc24ndCBoaXR0aW5nIHRoZSBsYWJlbCBvciB0aGUgY2hlY2tib3ggaXRzZWxmLlxuICAgICAgICAgICAgLy8gRml4aW5nIHRoaXMgbWF5IG1lYW4gYWRkaW5nIGFkZGl0aW9uYWwgY29kZSB0byB0aGUgbW91c2Vkb3duL21vdXNlb3ZlciBoYW5kbGVyIGZvciB0aGVcbiAgICAgICAgICAgIC8vIHdob2xlIHRhYmxlIChjdXJyZW50bHkgaW4gU3R1ZHlEYXRhUGFnZS5wcmVwYXJlSXQoKSkuXG4gICAgICAgICAgICBEcmFnYm94ZXMuaW5pdFRhYmxlKHRoaXMuZmlsdGVyaW5nVGFibGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJucyB0cnVlIGlmIGFueSBvZiB0aGlzIGZpbHRlcidzIFVJIChjaGVja2JveGVzLCBzZWFyY2ggZmllbGQpXG4gICAgICAgIC8vIHNob3dzIGEgZGlmZmVyZW50IHN0YXRlIHRoYW4gd2hlbiB0aGlzIGZ1bmN0aW9uIHdhcyBsYXN0IGNhbGxlZC5cbiAgICAgICAgLy8gVGhpcyBpcyBhY2NvbXBsaXNoZWQgYnkga2VlcGluZyBhIGRpY3Rpb25hcnkgLSBwcmV2aW91c0NoZWNrYm94U3RhdGUgLSB0aGF0IGlzIG9yZ2FuaXplZCBieVxuICAgICAgICAvLyB0aGUgc2FtZSB1bmlxdWUgY3JpdGVyaWEgdmFsdWVzIGFzIHRoZSBjaGVja2JveGVzLlxuICAgICAgICAvLyBXZSBidWlsZCBhIHJlbHBhY2VtZW50IGZvciB0aGlzIGRpY3Rpb25hcnksIGFuZCBjb21wYXJlIGl0cyBjb250ZW50cyB3aXRoIHRoZSBvbGQgb25lLlxuICAgICAgICAvLyBFYWNoIGNoZWNrYm94IGNhbiBoYXZlIG9uZSBvZiB0aHJlZSBwcmlvciBzdGF0ZXMsIGVhY2ggcmVwcmVzZW50ZWQgaW4gdGhlIGRpY3Rpb25hcnkgYnkgYSBsZXR0ZXI6XG4gICAgICAgIC8vIFwiQ1wiIC0gY2hlY2tlZCwgXCJVXCIgLSB1bmNoZWNrZWQsIFwiTlwiIC0gZG9lc24ndCBleGlzdCAoaW4gdGhlIGN1cnJlbnRseSB2aXNpYmxlIHNldC4pXG4gICAgICAgIC8vIFdlIGFsc28gY29tcGFyZSB0aGUgY3VycmVudCBjb250ZW50IG9mIHRoZSBzZWFyY2ggYm94IHdpdGggdGhlIG9sZCBjb250ZW50LlxuICAgICAgICAvLyBOb3RlOiBSZWdhcmRsZXNzIG9mIHdoZXJlIG9yIHdoZXRoZXIgd2UgZmluZCBhIGRpZmZlcmVuY2UsIGl0IGlzIGltcG9ydGFudCB0aGF0IHdlIGZpbmlzaFxuICAgICAgICAvLyBidWlsZGluZyB0aGUgcmVwbGFjZW1lbnQgdmVyc2lvbiBvZiBwcmV2aW91c0NoZWNrYm94U3RhdGUuXG4gICAgICAgIC8vIFNvIHRob3VnaCBpdCdzIHRlbXB0aW5nIHRvIGV4aXQgZWFybHkgZnJvbSB0aGVzZSBsb29wcywgaXQgd291bGQgbWFrZSBhIG1lc3MuXG4gICAgICAgIGFueUZpbHRlclNldHRpbmdzQ2hhbmdlZFNpbmNlTGFzdElucXVpcnkoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkOmJvb2xlYW4gPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2hlY2tib3hTdGF0ZTogVmFsdWVUb1N0cmluZyA9IHt9LFxuICAgICAgICAgICAgICAgIHY6IHN0cmluZyA9ICQodGhpcy5zZWFyY2hCb3gpLnZhbCgpO1xuICAgICAgICAgICAgdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmZvckVhY2goKHVuaXF1ZUlkOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2hlY2tib3g6IEpRdWVyeSA9IHRoaXMuY2hlY2tib3hlc1t0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dO1xuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50LCBwcmV2aW91cztcbiAgICAgICAgICAgICAgICAvLyBcIkNcIiAtIGNoZWNrZWQsIFwiVVwiIC0gdW5jaGVja2VkLCBcIk5cIiAtIGRvZXNuJ3QgZXhpc3RcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gKGNoZWNrYm94LnByb3AoJ2NoZWNrZWQnKSAmJiAhY2hlY2tib3gucHJvcCgnZGlzYWJsZWQnKSkgPyAnQycgOiAnVSc7XG4gICAgICAgICAgICAgICAgcHJldmlvdXMgPSB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZVt0aGlzLnVuaXF1ZVZhbHVlc1t1bmlxdWVJZF1dIHx8ICdOJztcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCAhPT0gcHJldmlvdXMpIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ID09PSAnQycpIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDaGVja2JveFN0YXRlW3RoaXMudW5pcXVlVmFsdWVzW3VuaXF1ZUlkXV0gPSBjdXJyZW50O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHRoaXMuY2xlYXJJY29ucy50b2dnbGVDbGFzcygnZW5hYmxlZCcsIHRoaXMuYW55Q2hlY2tib3hlc0NoZWNrZWQpO1xuXG4gICAgICAgICAgICB2ID0gdi50cmltKCk7ICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4gICAgICAgICAgICB2ID0gdi50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgdiA9IHYucmVwbGFjZSgvXFxzXFxzKi8sICcgJyk7IC8vIFJlcGxhY2UgaW50ZXJuYWwgd2hpdGVzcGFjZSB3aXRoIHNpbmdsZSBzcGFjZXNcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbiA9IHY7XG4gICAgICAgICAgICBpZiAodiAhPT0gdGhpcy5wcmV2aW91c1NlYXJjaFNlbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMucHJldmlvdXNTZWFyY2hTZWxlY3Rpb24gPSB2O1xuICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlbid0IGRldGVjdGVkIGFueSBjaGFuZ2Ugc28gZmFyLCB0aGVyZSBpcyBvbmUgbW9yZSBhbmdsZSB0byBjb3ZlcjpcbiAgICAgICAgICAgICAgICAvLyBDaGVja2JveGVzIHRoYXQgdXNlZCB0byBleGlzdCwgYnV0IGhhdmUgc2luY2UgYmVlbiByZW1vdmVkIGZyb20gdGhlIHNldC5cbiAgICAgICAgICAgICAgICAkLmVhY2godGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGUsICh1bmlxdWVWYWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudENoZWNrYm94U3RhdGVbdW5pcXVlVmFsdWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgaXQgd2FzIHRha2VuIG91dCBvZiB0aGUgc2V0LCBjbGVhciBpdCBzbyBpdCB3aWxsIGJlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBibGFuayB3aGVuIHJlLWFkZGVkIGxhdGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGVja2JveGVzW3VuaXF1ZVZhbHVlXS5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ2hlY2tib3hTdGF0ZSA9IGN1cnJlbnRDaGVja2JveFN0YXRlO1xuICAgICAgICAgICAgcmV0dXJuIGNoYW5nZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUYWtlcyBhIHNldCBvZiByZWNvcmQgSURzLCBhbmQgaWYgYW55IGNoZWNrYm94ZXMgaW4gdGhlIGZpbHRlcidzIFVJIGFyZSBjaGVja2VkLFxuICAgICAgICAvLyB0aGUgSUQgc2V0IGlzIG5hcnJvd2VkIGRvd24gdG8gb25seSB0aG9zZSByZWNvcmRzIHRoYXQgY29udGFpbiB0aGUgY2hlY2tlZCB2YWx1ZXMuXG4gICAgICAgIC8vIEluIGFkZGl0aW9uLCBjaGVja2JveGVzIHdob3NlIHZhbHVlcyBhcmUgbm90IHJlcHJlc2VudGVkIGFueXdoZXJlIGluIHRoZSBpbmNvbWluZyBJRHNcbiAgICAgICAgLy8gYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkIGFuZCBzb3J0ZWQgdG8gdGhlIGJvdHRvbSBvZiB0aGUgbGlzdCwgdmlzdWFsbHkgaW5kaWNhdGluZ1xuICAgICAgICAvLyB0byBhIHVzZXIgdGhhdCB0aG9zZSB2YWx1ZXMgYXJlIG5vdCBhdmFpbGFibGUgZm9yIGZ1cnRoZXIgZmlsdGVyaW5nLlxuICAgICAgICAvLyBUaGUgbmFycm93ZWQgc2V0IG9mIElEcyBpcyB0aGVuIHJldHVybmVkLCBmb3IgdXNlIGJ5IHRoZSBuZXh0IGZpbHRlci5cbiAgICAgICAgYXBwbHlQcm9ncmVzc2l2ZUZpbHRlcmluZyhpZHM6YW55W10pOmFueSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgZmlsdGVyIG9ubHkgY29udGFpbnMgb25lIGl0ZW0sIGl0J3MgcG9pbnRsZXNzIHRvIGFwcGx5IGl0LlxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzRmlsdGVyVXNlZnVsKCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWRzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgaWRzUG9zdEZpbHRlcmluZzogYW55W107XG5cbiAgICAgICAgICAgIHZhciB1c2VTZWFyY2hCb3g6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgdmFyIHF1ZXJ5U3RycyA9IFtdO1xuXG4gICAgICAgICAgICB2YXIgdiA9IHRoaXMuY3VycmVudFNlYXJjaFNlbGVjdGlvbjtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAodi5sZW5ndGggPj0gdGhpcy5taW5DaGFyc1RvVHJpZ2dlclNlYXJjaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgd29yZHMsIHdlIG1hdGNoIGVhY2ggc2VwYXJhdGVseS5cbiAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBub3QgYXR0ZW1wdCB0byBtYXRjaCBhZ2FpbnN0IGVtcHR5IHN0cmluZ3MsIHNvIHdlIGZpbHRlciB0aG9zZSBvdXQgaWZcbiAgICAgICAgICAgICAgICAgICAgLy8gYW55IHNsaXBwZWQgdGhyb3VnaC5cbiAgICAgICAgICAgICAgICAgICAgcXVlcnlTdHJzID0gdi5zcGxpdCgvXFxzKy8pLmZpbHRlcigob25lKSA9PiB7IHJldHVybiBvbmUubGVuZ3RoID4gMDsgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSB1c2VyIG1pZ2h0IGhhdmUgcGFzdGVkL3R5cGVkIG9ubHkgd2hpdGVzcGFjZSwgc286XG4gICAgICAgICAgICAgICAgICAgIGlmIChxdWVyeVN0cnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXNlU2VhcmNoQm94ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmcgPSB7fTtcblxuICAgICAgICAgICAgaWRzUG9zdEZpbHRlcmluZyA9IGlkcy5maWx0ZXIoKGlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHBhc3M6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoYXZlIGZpbHRlcmluZyBkYXRhIGZvciB0aGlzIGlkLCB1c2UgaXQuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgZG9uJ3QsIHRoZSBpZCBwcm9iYWJseSBiZWxvbmdzIHRvIHNvbWUgb3RoZXIgbWVhc3VyZW1lbnQgY2F0ZWdvcnksXG4gICAgICAgICAgICAgICAgLy8gc28gd2UgaWdub3JlIGl0LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpbHRlckhhc2hbaWRdKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGFueSBvZiB0aGlzIElEJ3MgY3JpdGVyaWEgYXJlIGNoZWNrZWQsIHRoaXMgSUQgcGFzc2VzIHRoZSBmaWx0ZXIuXG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdGUgdGhhdCB3ZSBjYW5ub3Qgb3B0aW1pemUgdG8gdXNlICcuc29tZScgaGVyZSBiZWN1YXNlIHdlIG5lZWQgdG9cbiAgICAgICAgICAgICAgICAgICAgLy8gbG9vcCB0aHJvdWdoIGFsbCB0aGUgY3JpdGVyaWEgdG8gc2V0IHZhbHVlc1Zpc2libGVQcmVGaWx0ZXJpbmcuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFtpZF0uZm9yRWFjaCgoaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtYXRjaDpib29sZWFuID0gdHJ1ZSwgdGV4dDpzdHJpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodXNlU2VhcmNoQm94KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGV4dCA9IHRoaXMudW5pcXVlVmFsdWVzW2luZGV4XS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoID0gcXVlcnlTdHJzLnNvbWUoKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRleHQubGVuZ3RoID49IHYubGVuZ3RoICYmIHRleHQuaW5kZXhPZih2KSA+PSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZ1tpbmRleF0gPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgodGhpcy5wcmV2aW91c0NoZWNrYm94U3RhdGVbdGhpcy51bmlxdWVWYWx1ZXNbaW5kZXhdXSA9PT0gJ0MnKSB8fCAhdGhpcy5hbnlDaGVja2JveGVzQ2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXNzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcGFzcztcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBBcHBseSBlbmFibGVkL2Rpc2FibGVkIHN0YXR1cyBhbmQgb3JkZXJpbmc6XG4gICAgICAgICAgICB2YXIgcm93c1RvQXBwZW5kID0gW107XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZVZhbHVlc09yZGVyLmZvckVhY2goKGNySUQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgY2hlY2tib3g6IEpRdWVyeSA9IHRoaXMuY2hlY2tib3hlc1t0aGlzLnVuaXF1ZVZhbHVlc1tjcklEXV0sXG4gICAgICAgICAgICAgICAgICAgIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCA9IHRoaXMudGFibGVSb3dzW3RoaXMudW5pcXVlVmFsdWVzW2NySURdXSxcbiAgICAgICAgICAgICAgICAgICAgc2hvdzogYm9vbGVhbiA9ICEhdmFsdWVzVmlzaWJsZVByZUZpbHRlcmluZ1tjcklEXTtcbiAgICAgICAgICAgICAgICBjaGVja2JveC5wcm9wKCdkaXNhYmxlZCcsICFzaG93KVxuICAgICAgICAgICAgICAgICQocm93KS50b2dnbGVDbGFzcygnbm9kYXRhJywgIXNob3cpO1xuICAgICAgICAgICAgICAgIGlmIChzaG93KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFibGVCb2R5RWxlbWVudC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJvd3NUb0FwcGVuZC5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBBcHBlbmQgYWxsIHRoZSByb3dzIHdlIGRpc2FibGVkLCBhcyBhIGxhc3Qgc3RlcCxcbiAgICAgICAgICAgIC8vIHNvIHRoZXkgZ28gdG8gdGhlIGJvdHRvbSBvZiB0aGUgdGFibGUuXG4gICAgICAgICAgICByb3dzVG9BcHBlbmQuZm9yRWFjaCgocm93KSA9PiB0aGlzLnRhYmxlQm9keUVsZW1lbnQuYXBwZW5kQ2hpbGQocm93KSk7XG5cbiAgICAgICAgICAgIHJldHVybiBpZHNQb3N0RmlsdGVyaW5nO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQSBmZXcgdXRpbGl0eSBmdW5jdGlvbnM6XG4gICAgICAgIF9hc3NheUlkVG9Bc3NheShhc3NheUlkOnN0cmluZykge1xuICAgICAgICAgICAgcmV0dXJuIEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICB9XG4gICAgICAgIF9hc3NheUlkVG9MaW5lKGFzc2F5SWQ6c3RyaW5nKSB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSB0aGlzLl9hc3NheUlkVG9Bc3NheShhc3NheUlkKTtcbiAgICAgICAgICAgIGlmIChhc3NheSkgcmV0dXJuIEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgX2Fzc2F5SWRUb1Byb3RvY29sKGFzc2F5SWQ6c3RyaW5nKTogUHJvdG9jb2xSZWNvcmQge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCk7XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHJldHVybiBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9uZSBvZiB0aGUgaGlnaGVzdC1sZXZlbCBmaWx0ZXJzOiBTdHJhaW4uXG4gICAgLy8gTm90ZSB0aGF0IGFuIEFzc2F5J3MgTGluZSBjYW4gaGF2ZSBtb3JlIHRoYW4gb25lIFN0cmFpbiBhc3NpZ25lZCB0byBpdCxcbiAgICAvLyB3aGljaCBpcyBhbiBleGFtcGxlIG9mIHdoeSAndGhpcy5maWx0ZXJIYXNoJyBpcyBidWlsdCB3aXRoIGFycmF5cy5cbiAgICBleHBvcnQgY2xhc3MgU3RyYWluRmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ1N0cmFpbicsICdzdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGluZTphbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSA9IHRoaXMuZmlsdGVySGFzaFthc3NheUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyBhc3NpZ24gdW5pcXVlIElEIHRvIGV2ZXJ5IGVuY291bnRlcmVkIHN0cmFpbiBuYW1lXG4gICAgICAgICAgICAgICAgKGxpbmUuc3RyYWluIHx8IFtdKS5mb3JFYWNoKChzdHJhaW5JZDogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbc3RyYWluSWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RyYWluICYmIHN0cmFpbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbc3RyYWluLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3N0cmFpbi5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSnVzdCBhcyB3aXRoIHRoZSBTdHJhaW4gZmlsdGVyLCBhbiBBc3NheSdzIExpbmUgY2FuIGhhdmUgbW9yZSB0aGFuIG9uZVxuICAgIC8vIENhcmJvbiBTb3VyY2UgYXNzaWduZWQgdG8gaXQuXG4gICAgZXhwb3J0IGNsYXNzIENhcmJvblNvdXJjZUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdDYXJib24gU291cmNlJywgJ2NzJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmU6YW55ID0gdGhpcy5fYXNzYXlJZFRvTGluZShhc3NheUlkKSB8fCB7fTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgLy8gYXNzaWduIHVuaXF1ZSBJRCB0byBldmVyeSBlbmNvdW50ZXJlZCBjYXJib24gc291cmNlIG5hbWVcbiAgICAgICAgICAgICAgICAobGluZS5jYXJib24gfHwgW10pLmZvckVhY2goKGNhcmJvbklkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3JjID0gRURERGF0YS5DU291cmNlc1tjYXJib25JZF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzcmMgJiYgc3JjLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbc3JjLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlICdDYXJib24gU291cmNlIExhYmVsaW5nJyBmaWVsZCBmb3IgZWFjaCBBc3NheSdzIExpbmVcbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uTGFiZWxpbmdGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTGFiZWxpbmcnLCAnbCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB1bmlxdWUgSUQgdG8gZXZlcnkgZW5jb3VudGVyZWQgY2FyYm9uIHNvdXJjZSBsYWJlbGluZyBkZXNjcmlwdGlvblxuICAgICAgICAgICAgICAgIChsaW5lLmNhcmJvbiB8fCBbXSkuZm9yRWFjaCgoY2FyYm9uSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzcmMgPSBFREREYXRhLkNTb3VyY2VzW2NhcmJvbklkXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNyYyAmJiBzcmMubGFiZWxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddID0gdGhpcy51bmlxdWVJbmRleGVzW3NyYy5sYWJlbGluZ10gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tzcmMubGFiZWxpbmddKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIG5hbWUgb2YgZWFjaCBBc3NheSdzIExpbmVcbiAgICBleHBvcnQgY2xhc3MgTGluZU5hbWVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnTGluZScsICdsbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOmFueSA9IHRoaXMuX2Fzc2F5SWRUb0xpbmUoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW2xpbmUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbGluZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIFByb3RvY29sIG9mIGVhY2ggQXNzYXlcbiAgICBleHBvcnQgY2xhc3MgUHJvdG9jb2xGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnUHJvdG9jb2wnLCAncCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcm90b2NvbDogUHJvdG9jb2xSZWNvcmQgPSB0aGlzLl9hc3NheUlkVG9Qcm90b2NvbChhc3NheUlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3Byb3RvY29sLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1twcm90b2NvbC5uYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIG5hbWUgb2YgZWFjaCBBc3NheVxuICAgIGV4cG9ydCBjbGFzcyBBc3NheUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdBc3NheScsICdhJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgaWRzLmZvckVhY2goKGFzc2F5SWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGFzc2F5ID0gdGhpcy5fYXNzYXlJZFRvQXNzYXkoYXNzYXlJZCkgfHwge307XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdID0gdGhpcy5maWx0ZXJIYXNoW2Fzc2F5SWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1thc3NheS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbYXNzYXkubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBjbGFzcyBkZWZpbmluZyBzb21lIGFkZGl0aW9uYWwgbG9naWMgZm9yIG1ldGFkYXRhLXR5cGUgZmlsdGVycyxcbiAgICAvLyBtZWFudCB0byBiZSBzdWJjbGFzc2VkLiAgTm90ZSBob3cgd2UgcGFzcyBpbiB0aGUgcGFydGljdWxhciBtZXRhZGF0YSB3ZVxuICAgIC8vIGFyZSBjb25zdHJ1Y3RpbmcgdGhpcyBmaWx0ZXIgZm9yLCBpbiB0aGUgY29uc3RydWN0b3IuXG4gICAgLy8gVW5saWtlIHRoZSBvdGhlciBmaWx0ZXJzLCB3ZSB3aWxsIGJlIGluc3RhbnRpYXRpbmcgbW9yZSB0aGFuIG9uZSBvZiB0aGVzZS5cbiAgICBleHBvcnQgY2xhc3MgTWV0YURhdGFGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgR2VuZXJpY0ZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIG1ldGFEYXRhSUQ6c3RyaW5nO1xuICAgICAgICBwcmU6c3RyaW5nO1xuICAgICAgICBwb3N0OnN0cmluZztcblxuICAgICAgICBjb25zdHJ1Y3RvcihtZXRhRGF0YUlEOnN0cmluZykge1xuICAgICAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgICAgIHZhciBNRFQgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbbWV0YURhdGFJRF07XG4gICAgICAgICAgICB0aGlzLm1ldGFEYXRhSUQgPSBtZXRhRGF0YUlEO1xuICAgICAgICAgICAgdGhpcy5wcmUgPSBNRFQucHJlIHx8ICcnO1xuICAgICAgICAgICAgdGhpcy5wb3N0ID0gTURULnBvc3QgfHwgJyc7XG4gICAgICAgIH1cblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZShFREREYXRhLk1ldGFEYXRhVHlwZXNbdGhpcy5tZXRhRGF0YUlEXS5uYW1lLCAnbWQnK3RoaXMubWV0YURhdGFJRCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTGluZU1ldGFEYXRhRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1ldGFEYXRhRmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGlkcy5mb3JFYWNoKChhc3NheUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaW5lOiBhbnkgPSB0aGlzLl9hc3NheUlkVG9MaW5lKGFzc2F5SWQpIHx8IHt9LCB2YWx1ZSA9ICcoRW1wdHkpJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUubWV0YSAmJiBsaW5lLm1ldGFbdGhpcy5tZXRhRGF0YUlEXSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFsgdGhpcy5wcmUsIGxpbmUubWV0YVt0aGlzLm1ldGFEYXRhSURdLCB0aGlzLnBvc3QgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgQXNzYXlNZXRhRGF0YUZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZXRhRGF0YUZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGlkczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBpZHMuZm9yRWFjaCgoYXNzYXlJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzYXk6IGFueSA9IHRoaXMuX2Fzc2F5SWRUb0Fzc2F5KGFzc2F5SWQpIHx8IHt9LCB2YWx1ZSA9ICcoRW1wdHkpJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gPSB0aGlzLmZpbHRlckhhc2hbYXNzYXlJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5Lm1ldGEgJiYgYXNzYXkubWV0YVt0aGlzLm1ldGFEYXRhSURdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gWyB0aGlzLnByZSwgYXNzYXkubWV0YVt0aGlzLm1ldGFEYXRhSURdLCB0aGlzLnBvc3QgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3ZhbHVlXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFthc3NheUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1t2YWx1ZV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGVzZSByZW1haW5pbmcgZmlsdGVycyB3b3JrIG9uIE1lYXN1cmVtZW50IElEcyByYXRoZXIgdGhhbiBBc3NheSBJRHMuXG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIGNvbXBhcnRtZW50IG9mIGVhY2ggTWV0YWJvbGl0ZS5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZUNvbXBhcnRtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIEdlbmVyaWNGaWx0ZXJTZWN0aW9uIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBmaWx0ZXIgY2xhc3Mgd29ya3Mgd2l0aCBNZWFzdXJlbWVudCBJRHMgcmF0aGVyIHRoYW4gQXNzYXkgSURzXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdDb21wYXJ0bWVudCcsICdjb20nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCB2YWx1ZTogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZUNvbXBhcnRtZW50c1ttZWFzdXJlLmNvbXBhcnRtZW50XSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgdmFsdWUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbdmFsdWUubmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBnZW5lcmljIGZpbHRlciBmb3IgTWVhc3VyZW1lbnRzLCBtZWFudCB0byBiZSBzdWJjbGFzc2VkLlxuICAgIC8vIEl0IGludHJvZHVjZXMgYSAnbG9hZFBlbmRpbmcnIGF0dHJpYnV0ZSwgd2hpY2ggaXMgdXNlZCB0byBtYWtlIHRoZSBmaWx0ZXJcbiAgICAvLyBhcHBlYXIgaW4gdGhlIFVJIGV2ZW4gaWYgaXQgaGFzIG5vIGRhdGEsIGJlY2F1c2Ugd2UgYW50aWNpcGF0ZSBkYXRhIHRvIGV2ZW50dWFsbHlcbiAgICAvLyBhcHBlYXIgaW4gaXQuXG4gICAgLy8gICAgICBUaGUgaWRlYSBpcywgd2Uga25vdyB3aGV0aGVyIHRvIGluc3RhbnRpYXRlIGEgZ2l2ZW4gc3ViY2xhc3Mgb2YgdGhpcyBmaWx0ZXIgYnlcbiAgICAvLyBsb29raW5nIGF0IHRoZSBtZWFzdXJlbWVudCBjb3VudCBmb3IgZWFjaCBBc3NheSwgd2hpY2ggaXMgZ2l2ZW4gdG8gdXMgaW4gdGhlIGZpcnN0XG4gICAgLy8gY2h1bmsgb2YgZGF0YSBmcm9tIHRoZSBzZXJ2ZXIuICBTbywgd2UgaW5zdGFudGlhdGUgaXQsIHRoZW4gaXQgYXBwZWFycyBpbiBhXG4gICAgLy8gJ2xvYWQgcGVuZGluZycgc3RhdGUgdW50aWwgYWN0dWFsIG1lYXN1cmVtZW50IHZhbHVlcyBhcmUgcmVjZWl2ZWQgZnJvbSB0aGUgc2VydmVyLlxuICAgIGV4cG9ydCBjbGFzcyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24gZXh0ZW5kcyBHZW5lcmljRmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIFdoZW5ldmVyIHRoaXMgZmlsdGVyIGlzIGluc3RhbnRpYXRlZCwgd2VcbiAgICAgICAgbG9hZFBlbmRpbmc6IGJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKHRpdGxlOnN0cmluZywgc2hvcnRMYWJlbDpzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKHRpdGxlLCBzaG9ydExhYmVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE92ZXJyaWRpbmcgdG8gbWFrZSB1c2Ugb2YgbG9hZFBlbmRpbmcuXG4gICAgICAgIGlzRmlsdGVyVXNlZnVsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9hZFBlbmRpbmcgfHwgdGhpcy51bmlxdWVWYWx1ZXNPcmRlci5sZW5ndGggPiAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBuYW1lcyBvZiBHZW5lcmFsIE1lYXN1cmVtZW50cy5cbiAgICBleHBvcnQgY2xhc3MgR2VuZXJhbE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiBleHRlbmRzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiB7XG4gICAgICAgIC8vIFdoZW5ldmVyIHRoaXMgZmlsdGVyIGlzIGluc3RhbnRpYXRlZCwgd2VcbiAgICAgICAgbG9hZFBlbmRpbmc6IGJvb2xlYW47XG5cbiAgICAgICAgY29uZmlndXJlKCk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ01lYXN1cmVtZW50JywgJ21tJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpc0ZpbHRlclVzZWZ1bCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQZW5kaW5nIHx8IHRoaXMudW5pcXVlVmFsdWVzT3JkZXIubGVuZ3RoID4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKG1JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgbUlkcy5mb3JFYWNoKChtZWFzdXJlSWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge307XG4gICAgICAgICAgICAgICAgdmFyIG1UeXBlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbVR5cGUgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1UeXBlICYmIG1UeXBlLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1ttVHlwZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbVR5cGUubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBIGZpbHRlciBmb3IgdGhlIG5hbWVzIG9mIE1ldGFib2xpdGUgTWVhc3VyZW1lbnRzLlxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlRmlsdGVyU2VjdGlvbiBleHRlbmRzIE1lYXN1cmVtZW50RmlsdGVyU2VjdGlvbiB7XG5cbiAgICAgICAgY29uZmlndXJlKCk6dm9pZCB7XG4gICAgICAgICAgICBzdXBlci5jb25maWd1cmUoJ01ldGFib2xpdGUnLCAnbWUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZVVuaXF1ZUluZGV4ZXNIYXNoKGFtSURzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZpbHRlckhhc2ggPSB7fTtcbiAgICAgICAgICAgIGFtSURzLmZvckVhY2goKG1lYXN1cmVJZDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTogYW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9LCBtZXRhYm9saXRlOiBhbnk7XG4gICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gPSB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBpZiAobWVhc3VyZSAmJiBtZWFzdXJlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0YWJvbGl0ZSA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXRhYm9saXRlICYmIG1ldGFib2xpdGUubmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlxdWVJbmRleGVzW21ldGFib2xpdGUubmFtZV0gPSB0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSB8fCArK3RoaXMudW5pcXVlSW5kZXhDb3VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0ucHVzaCh0aGlzLnVuaXF1ZUluZGV4ZXNbbWV0YWJvbGl0ZS5uYW1lXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIGJlZW4gY2FsbGVkIHRvIGJ1aWxkIG91ciBoYXNoZXMsIGFzc3VtZSB0aGVyZSdzIG5vIGxvYWQgcGVuZGluZ1xuICAgICAgICAgICAgdGhpcy5sb2FkUGVuZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQSBmaWx0ZXIgZm9yIHRoZSBuYW1lcyBvZiBQcm90ZWluIE1lYXN1cmVtZW50cy5cbiAgICBleHBvcnQgY2xhc3MgUHJvdGVpbkZpbHRlclNlY3Rpb24gZXh0ZW5kcyBNZWFzdXJlbWVudEZpbHRlclNlY3Rpb24ge1xuXG4gICAgICAgIGNvbmZpZ3VyZSgpOnZvaWQge1xuICAgICAgICAgICAgc3VwZXIuY29uZmlndXJlKCdQcm90ZWluJywgJ3ByJyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGVVbmlxdWVJbmRleGVzSGFzaChhbUlEczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5maWx0ZXJIYXNoID0ge307XG4gICAgICAgICAgICBhbUlEcy5mb3JFYWNoKChtZWFzdXJlSWQ6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6IGFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSwgcHJvdGVpbjogYW55O1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdID0gdGhpcy5maWx0ZXJIYXNoW21lYXN1cmVJZF0gfHwgW107XG4gICAgICAgICAgICAgICAgaWYgKG1lYXN1cmUgJiYgbWVhc3VyZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3RlaW4gPSBFREREYXRhLlByb3RlaW5UeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvdGVpbiAmJiBwcm90ZWluLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5pcXVlSW5kZXhlc1twcm90ZWluLm5hbWVdID0gdGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0gfHwgKyt0aGlzLnVuaXF1ZUluZGV4Q291bnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdLnB1c2godGhpcy51bmlxdWVJbmRleGVzW3Byb3RlaW4ubmFtZV0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGNhbGxlZCB0byBidWlsZCBvdXIgaGFzaGVzLCBhc3N1bWUgdGhlcmUncyBubyBsb2FkIHBlbmRpbmdcbiAgICAgICAgICAgIHRoaXMubG9hZFBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEEgZmlsdGVyIGZvciB0aGUgbmFtZXMgb2YgR2VuZSBNZWFzdXJlbWVudHMuXG4gICAgZXhwb3J0IGNsYXNzIEdlbmVGaWx0ZXJTZWN0aW9uIGV4dGVuZHMgTWVhc3VyZW1lbnRGaWx0ZXJTZWN0aW9uIHtcblxuICAgICAgICBjb25maWd1cmUoKTp2b2lkIHtcbiAgICAgICAgICAgIHN1cGVyLmNvbmZpZ3VyZSgnR2VuZScsICdnbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlVW5pcXVlSW5kZXhlc0hhc2goYW1JRHM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVySGFzaCA9IHt9O1xuICAgICAgICAgICAgYW1JRHMuZm9yRWFjaCgobWVhc3VyZUlkOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOiBhbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sIGdlbmU6IGFueTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXSA9IHRoaXMuZmlsdGVySGFzaFttZWFzdXJlSWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChtZWFzdXJlICYmIG1lYXN1cmUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBnZW5lID0gRURERGF0YS5HZW5lVHlwZXNbbWVhc3VyZS50eXBlXSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdlbmUgJiYgZ2VuZS5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaXF1ZUluZGV4ZXNbZ2VuZS5uYW1lXSA9IHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdIHx8ICsrdGhpcy51bmlxdWVJbmRleENvdW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpbHRlckhhc2hbbWVhc3VyZUlkXS5wdXNoKHRoaXMudW5pcXVlSW5kZXhlc1tnZW5lLm5hbWVdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgd2UndmUgYmVlbiBjYWxsZWQgdG8gYnVpbGQgb3VyIGhhc2hlcywgYXNzdW1lIHRoZXJlJ3Mgbm8gbG9hZCBwZW5kaW5nXG4gICAgICAgICAgICB0aGlzLmxvYWRQZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZSBwYWdlIGxvYWRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlSXQoKSB7XG5cbiAgICAgICAgcHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQgPSBuZXcgUHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQoKTtcbiAgICAgICAgcG9zdEZpbHRlcmluZ0Fzc2F5cyA9IFtdO1xuICAgICAgICBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzID0gW107XG5cbiAgICAgICAgLy8gQnkgZGVmYXVsdCwgd2UgYWx3YXlzIHNob3cgdGhlIGdyYXBoXG4gICAgICAgIHZpZXdpbmdNb2RlID0gJ2xpbmVncmFwaCc7XG4gICAgICAgIGJhckdyYXBoTW9kZSA9ICdtZWFzdXJlbWVudCc7XG4gICAgICAgIGJhckdyYXBoVHlwZUJ1dHRvbnNKUSA9ICQoJyNiYXJHcmFwaFR5cGVCdXR0b25zJyk7XG4gICAgICAgIGFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciA9IGZhbHNlO1xuICAgICAgICAvLyBTdGFydCBvdXQgd2l0aCBldmVyeSBkaXNwbGF5IG1vZGUgbmVlZGluZyBhIHJlZnJlc2hcbiAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlID0ge1xuICAgICAgICAgICAgJ2xpbmVncmFwaCc6IHRydWUsXG4gICAgICAgICAgICAnYmFyZ3JhcGgnOiB0cnVlLFxuICAgICAgICAgICAgJ3RhYmxlJzogdHJ1ZVxuICAgICAgICB9O1xuICAgICAgICByZWZyZXNEYXRhRGlzcGxheUlmU3RhbGVUaW1lciA9IG51bGw7XG5cbiAgICAgICAgY29sb3JPYmogPSBudWxsO1xuXG4gICAgICAgIGFzc2F5c0RhdGFHcmlkU3BlYyA9IG51bGw7XG4gICAgICAgIGFzc2F5c0RhdGFHcmlkID0gbnVsbDtcblxuICAgICAgICBhY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IG51bGw7XG5cbiAgICAgICAgJCgnI3N0dWR5QXNzYXlzVGFibGUnKS50b29sdGlwKHtcbiAgICAgICAgICAgIGNvbnRlbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJCh0aGlzKS5wcm9wKCd0aXRsZScpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBvc2l0aW9uOiB7IG15OiBcImxlZnQtNTAgY2VudGVyXCIsIGF0OiBcInJpZ2h0IGNlbnRlclwiIH0sXG4gICAgICAgICAgICBzaG93OiBudWxsLFxuICAgICAgICAgICAgY2xvc2U6IGZ1bmN0aW9uIChldmVudCwgdWk6YW55KSB7XG4gICAgICAgICAgICAgICAgdWkudG9vbHRpcC5ob3ZlcihcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcykuc3RvcCh0cnVlKS5mYWRlVG8oNDAwLCAxKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzKS5mYWRlT3V0KFwiNDAwXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICQodGhpcykucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBUaGlzIG9ubHkgYWRkcyBjb2RlIHRoYXQgdHVybnMgdGhlIG90aGVyIGJ1dHRvbnMgb2ZmIHdoZW4gYSBidXR0b24gaXMgbWFkZSBhY3RpdmUsXG4gICAgICAgIC8vIGFuZCBkb2VzIHRoZSBzYW1lIHRvIGVsZW1lbnRzIG5hbWVkIGluIHRoZSAnZm9yJyBhdHRyaWJ1dGVzIG9mIGVhY2ggYnV0dG9uLlxuICAgICAgICAvLyBXZSBzdGlsbCBuZWVkIHRvIGFkZCBvdXIgb3duIHJlc3BvbmRlcnMgdG8gYWN0dWFsbHkgZG8gc3R1ZmYuXG4gICAgICAgIFV0bC5CdXR0b25CYXIucHJlcGFyZUJ1dHRvbkJhcnMoKTtcbiAgICAgICAgY29weUFjdGlvbkJ1dHRvbnMoKTtcbiAgICAgICAgLy8gUHJlcGVuZCBzaG93L2hpZGUgZmlsdGVyIGJ1dHRvbiBmb3IgYmV0dGVyIGFsaWdubWVudFxuICAgICAgICAvLyBOb3RlOiB0aGlzIHdpbGwgYmUgcmVtb3ZlZCB3aGVuIHdlIGltcGxlbWVudCBsZWZ0IHNpZGUgZmlsdGVyaW5nXG5cbiAgICAgICAgLy93aGVuIGFsbCBhamF4IHJlcXVlc3RzIGFyZSBmaW5pc2hlZCwgZGV0ZXJtaW5lIGlmIHRoZXJlIGFyZSBBc3NheU1lYXN1cmVtZW50cy5cbiAgICAgICAgJChkb2N1bWVudCkuYWpheFN0b3AoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvLyBzaG93IGFzc2F5IHRhYmxlIGJ5IGRlZmF1bHQgaWYgdGhlcmUgYXJlIGFzc2F5cyBidXQgbm8gYXNzYXkgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuQXNzYXlzKS5sZW5ndGggPiAwICYmIF8ua2V5cyhFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAvL1RPRE86IGNyZWF0ZSBwcmVwYXJlIGl0IGZvciBubyBkYXRhP1xuICAgICAgICAgICAgICAgICQoJyNkYXRhVGFibGVCdXR0b24nKS5jbGljaygpO1xuICAgICAgICAgICAgICAgICQoJy5leHBvcnRCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkKCcuZXhwb3J0QnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoXCIjZGF0YVRhYmxlQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmlld2luZ01vZGUgPSAndGFibGUnO1xuICAgICAgICAgICAgcXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcbiAgICAgICAgICAgIG1ha2VMYWJlbHNCbGFjayhFRERHcmFwaGluZ1Rvb2xzLmxhYmVscyk7XG4gICAgICAgICAgICAkKFwiI3RhYmxlQ29udHJvbHNBcmVhXCIpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoXCIjZmlsdGVyQ29udHJvbHNBcmVhXCIpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoXCIudGFibGVBY3Rpb25CdXR0b25zXCIpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIGJhckdyYXBoVHlwZUJ1dHRvbnNKUS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgICAgIC8vVE9ETzogZW5hYmxlIHVzZXJzIHRvIGV4cG9ydCBmaWx0ZXJlZCBkYXRhIGZyb20gZ3JhcGhcbiAgICAgICAgICAgICQoJy5leHBvcnRCdXR0b24nKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vY2xpY2sgaGFuZGxlciBmb3IgZWRpdCBhc3NheSBtZWFzdXJlbWVudHNcbiAgICAgICAgJCgnLmVkaXRNZWFzdXJlbWVudEJ1dHRvbicpLmNsaWNrKGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCgnaW5wdXRbbmFtZT1cImFzc2F5X2FjdGlvblwiXVt2YWx1ZT1cImVkaXRcIl0nKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICAkKCdidXR0b25bdmFsdWU9XCJhc3NheV9hY3Rpb25cIl0nKS5jbGljaygpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvL2NsaWNrIGhhbmRsZXIgZm9yIGRlbGV0ZSBhc3NheSBtZWFzdXJlbWVudHNcbiAgICAgICAgJCgnLmRlbGV0ZUJ1dHRvbicpLmNsaWNrKGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCgnaW5wdXRbbmFtZT1cImFzc2F5X2FjdGlvblwiXVt2YWx1ZT1cImRlbGV0ZVwiXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICQoJ2J1dHRvblt2YWx1ZT1cImFzc2F5X2FjdGlvblwiXScpLmNsaWNrKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vY2xpY2sgaGFuZGxlciBmb3IgZXhwb3J0IGFzc2F5IG1lYXN1cmVtZW50c1xuICAgICAgICAkKCcuZXhwb3J0QnV0dG9uJykuY2xpY2soZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBpbmNsdWRlQWxsTGluZXNJZkVtcHR5KCk7XG4gICAgICAgICAgICAkKCdpbnB1dFt2YWx1ZT1cImV4cG9ydFwiXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICQoJ2J1dHRvblt2YWx1ZT1cImFzc2F5X2FjdGlvblwiXScpLmNsaWNrKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vY2xpY2sgaGFuZGxlciBmb3IgZGlzYWJsZSBhc3NheSBtZWFzdXJlbWVudHNcbiAgICAgICAgJCgnLmRpc2FibGVCdXR0b24nKS5jbGljayhmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICQoJ2lucHV0W3ZhbHVlPVwibWFya1wiXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICQoJ3NlbGVjdFtuYW1lPVwiZGlzYWJsZVwiXScpLnZhbCgndHJ1ZScpO1xuICAgICAgICAgICAgJCgnYnV0dG9uW3ZhbHVlPVwiYXNzYXlfYWN0aW9uXCJdJykuY2xpY2soKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9jbGljayBoYW5kbGVyIGZvciByZS1lbmFibGUgYXNzYXkgbWVhc3VyZW1lbnRzXG4gICAgICAgICQoJy5lbmFibGVCdXR0b24nKS5jbGljayhmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICQoJ2lucHV0W3ZhbHVlPVwibWFya1wiXScpLnByb3AoJ2NoZWNrZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICQoJ3NlbGVjdFtuYW1lPVwiZGlzYWJsZVwiXScpLnZhbCgnZmFsc2UnKTtcbiAgICAgICAgICAgICQoJ2J1dHRvblt2YWx1ZT1cImFzc2F5X2FjdGlvblwiXScpLmNsaWNrKCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoaXMgb25lIGlzIGFjdGl2ZSBieSBkZWZhdWx0XG4gICAgICAgICQoXCIjbGluZUdyYXBoQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJCgnLmV4cG9ydEJ1dHRvbiwgI3RhYmxlQ29udHJvbHNBcmVhLCAudGFibGVBY3Rpb25CdXR0b25zJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2ZpbHRlckNvbnRyb2xzQXJlYScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCk7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZSA9ICdsaW5lZ3JhcGgnO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOiBcIiNsaW5lR3JhcGhCdXR0b25cIiwgJ3R5cGUnOiB2aWV3aW5nTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICAgICAgYmFyR3JhcGhUeXBlQnV0dG9uc0pRLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJyNsaW5lR3JhcGgnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeVRpbWUnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeUxpbmUnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeU1lYXN1cmVtZW50JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kVG8oJyNjb250ZW50Jyk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9vbmUgdGltZSBjbGljayBldmVudCBoYW5kbGVyIGZvciBsb2FkaW5nIHNwaW5uZXJcbiAgICAgICAgJCgnI2JhckdyYXBoQnV0dG9uJykub25lKFwiY2xpY2tcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJCgnI2dyYXBoTG9hZGluZycpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyN0aW1lQmFyR3JhcGhCdXR0b24nKS5vbmUoXCJjbGlja1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICB9KTtcbiAgICAgICAgJCgnI2xpbmVCYXJHcmFwaEJ1dHRvbicpLm9uZShcImNsaWNrXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjbWVhc3VyZW1lbnRCYXJHcmFwaEJ1dHRvbicpLm9uZShcImNsaWNrXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKFwiI2JhckdyYXBoQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJCgnLmV4cG9ydEJ1dHRvbiwgI3RhYmxlQ29udHJvbHNBcmVhLCAudGFibGVBY3Rpb25CdXR0b25zJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2ZpbHRlckNvbnRyb2xzQXJlYScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCk7XG4gICAgICAgICAgICB2aWV3aW5nTW9kZSA9ICdiYXJncmFwaCc7XG4gICAgICAgICAgICAvLyBjbGlja09uQmFyR3JhcGgoYmFyR3JhcGhNb2RlKTtcbiAgICAgICAgICAgIGJhckdyYXBoVHlwZUJ1dHRvbnNKUS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcjbGluZUdyYXBoJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJCgnI2JhckdyYXBoQnlUaW1lJykudG9nZ2xlQ2xhc3MoJ29mZicsICd0aW1lJyAhPT0gYmFyR3JhcGhNb2RlKTtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TGluZScpLnRvZ2dsZUNsYXNzKCdvZmYnLCAnbGluZScgIT09IGJhckdyYXBoTW9kZSk7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeU1lYXN1cmVtZW50JykudG9nZ2xlQ2xhc3MoJ29mZicsICdtZWFzdXJlbWVudCcgIT09IGJhckdyYXBoTW9kZSk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgICAgIGlmIChiYXJHcmFwaE1vZGUgPT09ICdtZWFzdXJlbWVudCcpIHtcbiAgICAgICAgICAgICAgICAgdXBkYXRlR3JhcGhWaWV3RmxhZyh7J2J1dHRvbkVsZW0nOiAnI21lYXN1cmVtZW50QmFyR3JhcGhCdXR0b24nLCAndHlwZSc6IGJhckdyYXBoTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJCgnI21haW5GaWx0ZXJTZWN0aW9uJykuYXBwZW5kVG8oJyNjb250ZW50Jyk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKFwiI3RpbWVCYXJHcmFwaEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGJhckdyYXBoTW9kZSA9ICd0aW1lJztcbiAgICAgICAgICAgIHVwZGF0ZUdyYXBoVmlld0ZsYWcoeydidXR0b25FbGVtJzogXCIjdGltZUJhckdyYXBoQnV0dG9uXCIsICd0eXBlJzogYmFyR3JhcGhNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3N0dWR5X2lkJzogRURERGF0YS5jdXJyZW50U3R1ZHlJRH0pO1xuICAgICAgICAgICAgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKFwiI2xpbmVCYXJHcmFwaEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGJhckdyYXBoTW9kZSA9ICdsaW5lJztcbiAgICAgICAgICAgIHVwZGF0ZUdyYXBoVmlld0ZsYWcoeydidXR0b25FbGVtJzonI2xpbmVCYXJHcmFwaEJ1dHRvbicsICd0eXBlJzogYmFyR3JhcGhNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc3R1ZHlfaWQnOiBFREREYXRhLmN1cnJlbnRTdHVkeUlEfSk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoXCIjbWVhc3VyZW1lbnRCYXJHcmFwaEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGJhckdyYXBoTW9kZSA9ICdtZWFzdXJlbWVudCc7XG4gICAgICAgICAgICB1cGRhdGVHcmFwaFZpZXdGbGFnKHsnYnV0dG9uRWxlbSc6ICcjbWVhc3VyZW1lbnRCYXJHcmFwaEJ1dHRvbicsICd0eXBlJzogYmFyR3JhcGhNb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc3R1ZHlfaWQnOiBFREREYXRhLmN1cnJlbnRTdHVkeUlEfSk7XG4gICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgICAgICQoJyNncmFwaExvYWRpbmcnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vaGlkZXMvc2hvd3MgZmlsdGVyIHNlY3Rpb24uXG4gICAgICAgIHZhciBoaWRlQnV0dG9uczogSlF1ZXJ5ID0gJCgnLmhpZGVGaWx0ZXJTZWN0aW9uJyk7XG4gICAgICAgIGhpZGVCdXR0b25zLmNsaWNrKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgc2VsZjogSlF1ZXJ5ID0gJCh0aGlzKSwgb2xkOiBzdHJpbmcsIHJlcGxhY2U6IHN0cmluZztcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBvbGQgPSBzZWxmLnRleHQoKTtcbiAgICAgICAgICAgIHJlcGxhY2UgPSBzZWxmLmF0dHIoJ2RhdGEtb2ZmLXRleHQnKTtcbiAgICAgICAgICAgIC8vIGRvaW5nIHRoaXMgZm9yIGFsbFxuICAgICAgICAgICAgaGlkZUJ1dHRvbnMuYXR0cignZGF0YS1vZmYtdGV4dCcsIG9sZCkudGV4dChyZXBsYWNlKTtcbiAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLnRvZ2dsZSgpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUaGUgbmV4dCBmZXcgbGluZXMgd2lyZSB1cCBldmVudCBoYW5kbGVycyBmb3IgYSBwdWxsZG93bk1lbnUgdGhhdCB3ZSB1c2UgdG8gY29udGFpbiBhXG4gICAgICAgIC8vIGNvdXBsZSBvZiBjb250cm9scyByZWxhdGVkIHRvIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbi4gIFRoaXMgbWVudSBpcyBzdHlsZWQgdG8gbG9va1xuICAgICAgICAvLyBleGFjdGx5IGxpa2UgdGhlIHR5cGljYWwgJ3ZpZXcgb3B0aW9ucycgbWVudSBnZW5lcmF0ZWQgYnkgRGF0YUdyaWQuXG5cbiAgICAgICAgdmFyIG1lbnVMYWJlbCA9ICQoJyNmaWx0ZXJDb250cm9sc01lbnVMYWJlbCcpO1xuICAgICAgICBtZW51TGFiZWwuY2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgaWYgKG1lbnVMYWJlbC5oYXNDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKSkge1xuICAgICAgICAgICAgICAgIG1lbnVMYWJlbC5yZW1vdmVDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKS5hZGRDbGFzcygncHVsbGRvd25NZW51TGFiZWxPbicpO1xuICAgICAgICAgICAgICAgICQoJyNmaWx0ZXJDb250cm9sc01lbnUgPiBkaXYucHVsbGRvd25NZW51TWVudUJsb2NrJykucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBldmVudCBoYW5kbGVycyB0byBoaWRlIG1lbnUgaWYgY2xpY2tpbmcgb3V0c2lkZSBtZW51IGJsb2NrIG9yIHByZXNzaW5nIEVTQ1xuICAgICAgICAkKGRvY3VtZW50KS5jbGljaygoZXYpID0+IHtcbiAgICAgICAgICAgIHZhciB0ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgaWYgKHQuY2xvc2VzdCgkKCcjZmlsdGVyQ29udHJvbHNNZW51JykuZ2V0KDApKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBtZW51TGFiZWwucmVtb3ZlQ2xhc3MoJ3B1bGxkb3duTWVudUxhYmVsT24nKS5hZGRDbGFzcygncHVsbGRvd25NZW51TGFiZWxPZmYnKTtcbiAgICAgICAgICAgICAgICAkKCcjZmlsdGVyQ29udHJvbHNNZW51ID4gZGl2LnB1bGxkb3duTWVudU1lbnVCbG9jaycpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkua2V5ZG93bigoZXYpID0+IHtcbiAgICAgICAgICAgIGlmIChldi5rZXlDb2RlID09PSAyNykge1xuICAgICAgICAgICAgICAgIG1lbnVMYWJlbC5yZW1vdmVDbGFzcygncHVsbGRvd25NZW51TGFiZWxPbicpLmFkZENsYXNzKCdwdWxsZG93bk1lbnVMYWJlbE9mZicpO1xuICAgICAgICAgICAgICAgICQoJyNmaWx0ZXJDb250cm9sc01lbnUgPiBkaXYucHVsbGRvd25NZW51TWVudUJsb2NrJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBmZXRjaEVERERhdGEob25TdWNjZXNzKTtcblxuICAgICAgICBmZXRjaFNldHRpbmdzKCdtZWFzdXJlbWVudC0nICsgRURERGF0YS5jdXJyZW50U3R1ZHlJRCwgKGRhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChkYXRhLnR5cGUgPT09ICdsaW5lZ3JhcGgnKSB7XG4gICAgICAgICAgICAgICAgJChkYXRhLmJ1dHRvbkVsZW0pLmNsaWNrKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZihkYXRhLnR5cGUpID09PSAndW5kZWZpbmVkJykgIHtcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YS50eXBlID09PSAnbWVhc3VyZW1lbnQnKSB7XG4gICAgICAgICAgICAgICAgJChcIiNiYXJHcmFwaEJ1dHRvblwiKS5jbGljaygpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBiYXJHcmFwaE1vZGUgPSBkYXRhLnR5cGU7XG4gICAgICAgICAgICAgICAgJChcIiNiYXJHcmFwaEJ1dHRvblwiKS5jbGljaygpO1xuICAgICAgICAgICAgICAgICQoZGF0YS5idXR0b25FbGVtKS5jbGljaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgIC8vIFNldCB1cCB0aGUgQWRkIE1lYXN1cmVtZW50IHRvIEFzc2F5IG1vZGFsXG4gICAgICAgICQoXCIjYWRkTWVhc3VyZW1lbnRcIikuZGlhbG9nKHtcbiAgICAgICAgICAgIG1pbldpZHRoOiA1MDAsXG4gICAgICAgICAgICBhdXRvT3BlbjogZmFsc2VcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJChcIi5hZGRNZWFzdXJlbWVudEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoXCIjYWRkTWVhc3VyZW1lbnRcIikucmVtb3ZlQ2xhc3MoJ29mZicpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2FsbGJhY2tzIHRvIHJlc3BvbmQgdG8gdGhlIGZpbHRlcmluZyBzZWN0aW9uXG4gICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLm9uKCdtb3VzZW92ZXIgbW91c2Vkb3duIG1vdXNldXAnLCBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUuYmluZCh0aGlzKSlcbiAgICAgICAgICAgIC5vbigna2V5ZG93bicsIGZpbHRlclRhYmxlS2V5RG93bi5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGlja09uQmFyR3JhcGgodHlwZSk6dm9pZCB7XG4gICAgICAgIGNvbnNvbGUubG9nKHR5cGUpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYmFzZVBheWxvYWQoKTphbnkge1xuICAgICAgICB2YXIgdG9rZW46c3RyaW5nID0gZG9jdW1lbnQuY29va2llLnJlcGxhY2UoXG4gICAgICAgICAgICAvKD86KD86XnwuKjtcXHMqKWNzcmZ0b2tlblxccypcXD1cXHMqKFteO10qKS4qJCl8Xi4qJC8sXG4gICAgICAgICAgICAnJDEnKTtcbiAgICAgICAgcmV0dXJuIHsgJ2NzcmZtaWRkbGV3YXJldG9rZW4nOiB0b2tlbiB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUdyYXBoVmlld0ZsYWcodHlwZSkge1xuICAgICAgICAkLmFqYXgoJy9wcm9maWxlL3NldHRpbmdzL21lYXN1cmVtZW50LScgKyB0eXBlLnN0dWR5X2lkLCB7XG4gICAgICAgICAgICAgICAgJ2RhdGEnOiAkLmV4dGVuZCh7fSwgYmFzZVBheWxvYWQoKSwgeyAnZGF0YSc6IEpTT04uc3RyaW5naWZ5KHR5cGUpIH0pLFxuICAgICAgICAgICAgICAgICd0eXBlJzogJ1BPU1QnXG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb3B5QWN0aW9uQnV0dG9ucygpIHtcbiAgICAgICAgLy8gY3JlYXRlIGEgY29weSBvZiB0aGUgYnV0dG9ucyBpbiB0aGUgZmxleCBsYXlvdXQgYm90dG9tIGJhclxuICAgICAgICAvLyB0aGUgb3JpZ2luYWwgbXVzdCBzdGF5IGluc2lkZSBmb3JtXG4gICAgICAgIHZhciBvcmlnaW5hbDogSlF1ZXJ5LCBjb3B5OiBKUXVlcnk7XG4gICAgICAgIG9yaWdpbmFsID0gJCgnI2Fzc2F5c0FjdGlvblBhbmVsJyk7XG4gICAgICAgIGNvcHkgPSBvcmlnaW5hbC5jbG9uZSgpLmFwcGVuZFRvKCcjYm90dG9tQmFyJykuYXR0cignaWQnLCAnY29weUFjdGlvblBhbmVsJykuaGlkZSgpO1xuICAgICAgICAvLyBmb3J3YXJkIGNsaWNrIGV2ZW50cyBvbiBjb3B5IHRvIHRoZSBvcmlnaW5hbCBidXR0b25cbiAgICAgICAgY29weS5vbignY2xpY2snLCAnLmFjdGlvbkJ1dHRvbicsIChlKSA9PiB7XG4gICAgICAgICAgICBvcmlnaW5hbC5maW5kKCcjJyArIGUudGFyZ2V0LmlkKS50cmlnZ2VyKGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZmV0Y2hFREREYXRhKHN1Y2Nlc3MpIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICd1cmwnOiAnZWRkZGF0YS8nLFxuICAgICAgICAgICAgJ3R5cGUnOiAnR0VUJyxcbiAgICAgICAgICAgICdlcnJvcic6ICh4aHIsIHN0YXR1cywgZSkgPT4ge1xuICAgICAgICAgICAgICAgICQoJyNjb250ZW50JykucHJlcGVuZChcIjxkaXYgY2xhc3M9J25vRGF0YSc+RXJyb3IuIFBsZWFzZSByZWxvYWQ8L2Rpdj5cIik7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydMb2FkaW5nIEVERERhdGEgZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZV0uam9pbignJykpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdzdWNjZXNzJzogc3VjY2Vzc1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZmV0Y2hTZXR0aW5ncyhwcm9wS2V5OnN0cmluZywgY2FsbGJhY2s6KHZhbHVlOmFueSk9PnZvaWQsIGRlZmF1bHRWYWx1ZT86YW55KTp2b2lkIHtcbiAgICAgICAgJC5hamF4KCcvcHJvZmlsZS9zZXR0aW5ncy8nICsgcHJvcEtleSwge1xuICAgICAgICAgICAgJ2RhdGFUeXBlJzogJ2pzb24nLFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoZGF0YTphbnkpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGRhdGEgPSBkYXRhIHx8IGRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyAvKiBQYXJzZUVycm9yLCBqdXN0IHVzZSBzdHJpbmcgdmFsdWUgKi8gfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25TdWNjZXNzKGRhdGEpIHtcbiAgICAgICAgRURERGF0YSA9ICQuZXh0ZW5kKEVERERhdGEgfHwge30sIGRhdGEpO1xuXG4gICAgICAgIGNvbG9yT2JqID0gRURER3JhcGhpbmdUb29scy5yZW5kZXJDb2xvcihFREREYXRhLkxpbmVzKTtcblxuICAgICAgICBwcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5wcmVwYXJlRmlsdGVyaW5nU2VjdGlvbigpO1xuXG4gICAgICAgICQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCwgI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykuY2hhbmdlKCgpID0+IHtcbiAgICAgICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgZmV0Y2hNZWFzdXJlbWVudHMoRURERGF0YSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmV0Y2hNZWFzdXJlbWVudHMoRURERGF0YSkge1xuICAgICAgICAvL3B1bGxpbmcgaW4gcHJvdG9jb2wgbWVhc3VyZW1lbnRzIEFzc2F5TWVhc3VyZW1lbnRzXG4gICAgICAgICQuZWFjaChFREREYXRhLlByb3RvY29scywgKGlkLCBwcm90b2NvbCkgPT4ge1xuICAgICAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICAgICB1cmw6ICdtZWFzdXJlbWVudHMvJyArIGlkICsgJy8nLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICAgICAgZXJyb3I6ICh4aHIsIHN0YXR1cykgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGZldGNoIG1lYXN1cmVtZW50IGRhdGEgb24gJyArIHByb3RvY29sLm5hbWUgKyAnIScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzdGF0dXMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc3VjY2VzczogcHJvY2Vzc01lYXN1cmVtZW50RGF0YS5iaW5kKHRoaXMsIHByb3RvY29sKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluY2x1ZGVBbGxMaW5lc0lmRW1wdHkoKSB7XG4gICAgICAgIGlmICgkKCcjc3R1ZHlBc3NheXNUYWJsZScpLmZpbmQoJ3Rib2R5IGlucHV0W3R5cGU9Y2hlY2tib3hdOmNoZWNrZWQnKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIC8vYXBwZW5kIHN0dWR5IGlkIHRvIGZvcm1cbiAgICAgICAgICAgIHZhciBzdHVkeSA9IF8ua2V5cyhFREREYXRhLlN0dWRpZXMpWzBdO1xuICAgICAgICAgICAgJCgnPGlucHV0PicpLmF0dHIoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdoaWRkZW4nLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBzdHVkeSxcbiAgICAgICAgICAgICAgICBuYW1lOiAnc3R1ZHlJZCcsXG4gICAgICAgICAgICB9KS5hcHBlbmRUbygnZm9ybScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWxsQWN0aXZlQXNzYXlzKCkge1xuICAgICAgICB2YXIgYXNzYXlzID0gXy5rZXlzKEVERERhdGEuQXNzYXlzKTtcblxuICAgICAgICB2YXIgZmlsdGVyZWRJRHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCBhc3NheXMubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IGFzc2F5c1tyXTtcbiAgICAgICAgICAgIC8vIEhlcmUgaXMgdGhlIGNvbmRpdGlvbiB0aGF0IGRldGVybWluZXMgd2hldGhlciB0aGUgcm93cyBhc3NvY2lhdGVkIHdpdGggdGhpcyBJRCBhcmVcbiAgICAgICAgICAgIC8vIHNob3duIG9yIGhpZGRlbi5cbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5c1tpZF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWRJRHMucHVzaChwYXJzZUludChpZCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkSURzO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gZmlsdGVyVGFibGVLZXlEb3duKGUpIHtcbiAgICAgICAgc3dpdGNoIChlLmtleUNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgMzg6IC8vIHVwXG4gICAgICAgICAgICBjYXNlIDQwOiAvLyBkb3duXG4gICAgICAgICAgICBjYXNlIDk6ICAvLyB0YWJcbiAgICAgICAgICAgIGNhc2UgMTM6IC8vIHJldHVyblxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8gaWdub3JlIGlmIHRoZSBmb2xsb3dpbmcga2V5cyBhcmUgcHJlc3NlZDogW3NoaWZ0XSBbY2Fwc2xvY2tdXG4gICAgICAgICAgICAgICAgaWYgKGUua2V5Q29kZSA+IDggJiYgZS5rZXlDb2RlIDwgMzIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiByZXF1ZXN0QXNzYXlEYXRhKGFzc2F5KSB7XG4gICAgICAgIHZhciBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICB1cmw6IFsnbWVhc3VyZW1lbnRzJywgYXNzYXkucGlkLCBhc3NheS5pZCwgJyddLmpvaW4oJy8nKSxcbiAgICAgICAgICAgIHR5cGU6ICdHRVQnLFxuICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgIGVycm9yOiAoeGhyLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIGZldGNoIG1lYXN1cmVtZW50IGRhdGEgb24gJyArIGFzc2F5Lm5hbWUgKyAnIScpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3VjY2VzczogcHJvY2Vzc01lYXN1cmVtZW50RGF0YS5iaW5kKHRoaXMsIHByb3RvY29sKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKHByb3RvY29sLCBkYXRhKSB7XG4gICAgICAgIHZhciBhc3NheVNlZW4gPSB7fSxcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheSA9IHt9LFxuICAgICAgICAgICAgY291bnRfdG90YWw6bnVtYmVyID0gMCxcbiAgICAgICAgICAgIGNvdW50X3JlYzpudW1iZXIgPSAwO1xuICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fTtcbiAgICAgICAgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzID0gJC5leHRlbmQoRURERGF0YS5NZWFzdXJlbWVudFR5cGVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICAvLyBhdHRhY2ggbWVhc3VyZW1lbnQgY291bnRzIHRvIGVhY2ggYXNzYXlcbiAgICAgICAgJC5lYWNoKGRhdGEudG90YWxfbWVhc3VyZXMsIChhc3NheUlkOnN0cmluZywgY291bnQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogSWYgd2UgZXZlciBmZXRjaCBieSBzb21ldGhpbmcgb3RoZXIgdGhhbiBwcm90b2NvbCxcbiAgICAgICAgICAgICAgICAvLyBJc24ndCB0aGVyZSBhIGNoYW5jZSB0aGlzIGlzIGN1bXVsYXRpdmUsIGFuZCB3ZSBzaG91bGQgKz0gP1xuICAgICAgICAgICAgICAgIGFzc2F5LmNvdW50ID0gY291bnQ7XG4gICAgICAgICAgICAgICAgY291bnRfdG90YWwgKz0gY291bnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBsb29wIG92ZXIgYWxsIGRvd25sb2FkZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICQuZWFjaChkYXRhLm1lYXN1cmVzIHx8IHt9LCAoaW5kZXgsIG1lYXN1cmVtZW50KSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sIGxpbmUsIG10eXBlO1xuICAgICAgICAgICAgKytjb3VudF9yZWM7XG4gICAgICAgICAgICBpZiAoIWFzc2F5IHx8IGFzc2F5LmNvdW50ID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAvLyBhdHRhY2ggdmFsdWVzXG4gICAgICAgICAgICAkLmV4dGVuZChtZWFzdXJlbWVudCwgeyAndmFsdWVzJzogZGF0YS5kYXRhW21lYXN1cmVtZW50LmlkXSB8fCBbXSB9KTtcbiAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnQuaWRdID0gbWVhc3VyZW1lbnQ7XG4gICAgICAgICAgICAvLyB0cmFjayB3aGljaCBhc3NheXMgcmVjZWl2ZWQgdXBkYXRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgIGFzc2F5U2Vlblthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gPSBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXSB8fCB7fTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdW2Fzc2F5LmlkXSA9IHRydWU7XG4gICAgICAgICAgICAvLyBoYW5kbGUgbWVhc3VyZW1lbnQgZGF0YSBiYXNlZCBvbiB0eXBlXG4gICAgICAgICAgICBtdHlwZSA9IGRhdGEudHlwZXNbbWVhc3VyZW1lbnQudHlwZV0gfHwge307XG4gICAgICAgICAgICAoYXNzYXkubWVhc3VyZXMgPSBhc3NheS5tZWFzdXJlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgICAgIChhc3NheS5tZXRhYm9saXRlcyA9IGFzc2F5Lm1ldGFib2xpdGVzIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAncCcpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgcHJvdGVpblxuICAgICAgICAgICAgICAgIChhc3NheS5wcm90ZWlucyA9IGFzc2F5LnByb3RlaW5zIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAnZycpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgZ2VuZSAvIHRyYW5zY3JpcHRcbiAgICAgICAgICAgICAgICAoYXNzYXkudHJhbnNjcmlwdGlvbnMgPSBhc3NheS50cmFuc2NyaXB0aW9ucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRocm93IGV2ZXJ5dGhpbmcgZWxzZSBpbiBhIGdlbmVyYWwgYXJlYVxuICAgICAgICAgICAgICAgIChhc3NheS5nZW5lcmFsID0gYXNzYXkuZ2VuZXJhbCB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LnByb2Nlc3NJbmNvbWluZ01lYXN1cmVtZW50UmVjb3JkcyhkYXRhLm1lYXN1cmVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICBpZiAoY291bnRfcmVjIDwgY291bnRfdG90YWwpIHtcbiAgICAgICAgICAgIC8vIFRPRE8gbm90IGFsbCBtZWFzdXJlbWVudHMgZG93bmxvYWRlZDsgZGlzcGxheSBhIG1lc3NhZ2UgaW5kaWNhdGluZyB0aGlzXG4gICAgICAgICAgICAvLyBleHBsYWluIGRvd25sb2FkaW5nIGluZGl2aWR1YWwgYXNzYXkgbWVhc3VyZW1lbnRzIHRvb1xuICAgICAgICB9XG4gICAgICAgIHF1ZXVlUmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZSgpO1xuICAgIH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZVJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoKSB7XG4gICAgICAgIGlmIChyZWZyZXNEYXRhRGlzcGxheUlmU3RhbGVUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHJlZnJlc0RhdGFEaXNwbGF5SWZTdGFsZVRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICByZWZyZXNEYXRhRGlzcGxheUlmU3RhbGVUaW1lciA9IHNldFRpbWVvdXQocmVmcmVzaERhdGFEaXNwbGF5SWZTdGFsZS5iaW5kKHRoaXMpLCAxMDApO1xuICAgIH1cblxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCkge1xuICAgICAgICBpZiAoYWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dChhY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgYWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KGFjdGlvblBhbmVsUmVmcmVzaC5iaW5kKHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgLy8gVGhpcyBmdW5jdGlvbiBkZXRlcm1pbmVzIGlmIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbnMgKG9yIHNldHRpbmdzIHJlbGF0ZWQgdG8gdGhlbSkgaGF2ZSBjaGFuZ2VkXG4gICAgLy8gc2luY2UgdGhlIGxhc3QgdGltZSB3ZSB3ZXJlIGluIHRoZSBjdXJyZW50IGRpc3BsYXkgbW9kZSAoZS5nLiBsaW5lIGdyYXBoLCB0YWJsZSwgYmFyIGdyYXBoXG4gICAgLy8gaW4gdmFyaW91cyBtb2RlcywgZXRjKSBhbmQgdXBkYXRlcyB0aGUgZGlzcGxheSBvbmx5IGlmIGEgY2hhbmdlIGlzIGRldGVjdGVkLlxuICAgIGZ1bmN0aW9uIHJlZnJlc2hEYXRhRGlzcGxheUlmU3RhbGUoZm9yY2U/OmJvb2xlYW4pIHtcblxuICAgICAgICAvLyBBbnkgc3dpdGNoIGJldHdlZW4gdmlld2luZyBtb2Rlcywgb3IgY2hhbmdlIGluIGZpbHRlcmluZywgaXMgYWxzbyBjYXVzZSB0byBjaGVjayB0aGUgVUlcbiAgICAgICAgLy8gaW4gdGhlIGFjdGlvbiBwYW5lbCBhbmQgbWFrZSBzdXJlIGl0J3MgY3VycmVudC5cbiAgICAgICAgcXVldWVBY3Rpb25QYW5lbFJlZnJlc2goKTtcblxuICAgICAgICAvLyBJZiB0aGUgZmlsdGVyaW5nIHdpZGdldCBjbGFpbXMgYSBjaGFuZ2Ugc2luY2UgdGhlIGxhc3QgaW5xdWlyeSxcbiAgICAgICAgLy8gdGhlbiBhbGwgdGhlIHZpZXdpbmcgbW9kZXMgYXJlIHN0YWxlLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAgICAgLy8gU28gd2UgbWFyayB0aGVtIGFsbC5cbiAgICAgICAgaWYgKHByb2dyZXNzaXZlRmlsdGVyaW5nV2lkZ2V0LmNoZWNrUmVkcmF3UmVxdWlyZWQoZm9yY2UpKSB7XG5cbiAgICAgICAgICAgIHZpZXdpbmdNb2RlSXNTdGFsZVsnbGluZWdyYXBoJ10gPSB0cnVlO1xuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydiYXJncmFwaC10aW1lJ10gPSB0cnVlO1xuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydiYXJncmFwaC1saW5lJ10gPSB0cnVlO1xuICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlWydiYXJncmFwaC1tZWFzdXJlbWVudCddID0gdHJ1ZTtcbiAgICAgICAgICAgIHZpZXdpbmdNb2RlSXNTdGFsZVsndGFibGUnXSA9IHRydWU7XG4gICAgICAgICAgICAvLyBQdWxsIG91dCBhIGZyZXNoIHNldCBvZiBmaWx0ZXJlZCBtZWFzdXJlbWVudHMgYW5kIGFzc2F5c1xuICAgICAgICAgICAgdmFyIGZpbHRlclJlc3VsdHMgPSBwcm9ncmVzc2l2ZUZpbHRlcmluZ1dpZGdldC5idWlsZEZpbHRlcmVkTWVhc3VyZW1lbnRzKCk7XG4gICAgICAgICAgICBwb3N0RmlsdGVyaW5nTWVhc3VyZW1lbnRzID0gZmlsdGVyUmVzdWx0c1snZmlsdGVyZWRNZWFzdXJlbWVudHMnXTtcbiAgICAgICAgICAgIHBvc3RGaWx0ZXJpbmdBc3NheXMgPSBmaWx0ZXJSZXN1bHRzWydmaWx0ZXJlZEFzc2F5cyddO1xuXG4gICAgICAgIC8vIElmIHRoZSBmaWx0ZXJpbmcgd2lkZ2V0IGhhc24ndCBjaGFuZ2VkIGFuZCB0aGUgY3VycmVudCBtb2RlIGRvZXNuJ3QgY2xhaW0gdG8gYmUgc3RhbGUsIHdlJ3JlIGRvbmUuXG4gICAgICAgIH0gZWxzZSBpZiAodmlld2luZ01vZGUgPT0gJ2JhcmdyYXBoJykge1xuICAgICAgICAgICAgLy8gU3BlY2lhbCBjYXNlIHRvIGhhbmRsZSB0aGUgZXh0cmEgc3ViLW1vZGVzIG9mIHRoZSBiYXIgZ3JhcGhcbiAgICAgICAgICAgIGlmICghdmlld2luZ01vZGVJc1N0YWxlW3ZpZXdpbmdNb2RlKyctJytiYXJHcmFwaE1vZGVdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCF2aWV3aW5nTW9kZUlzU3RhbGVbdmlld2luZ01vZGVdKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmlld2luZ01vZGUgPT0gJ3RhYmxlJykge1xuICAgICAgICAgICAgaWYgKGFzc2F5c0RhdGFHcmlkU3BlYyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGFzc2F5c0RhdGFHcmlkU3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNBc3NheXMoKTtcbiAgICAgICAgICAgICAgICBhc3NheXNEYXRhR3JpZFNwZWMuaW5pdCgpO1xuICAgICAgICAgICAgICAgIGFzc2F5c0RhdGFHcmlkID0gbmV3IERhdGFHcmlkQXNzYXlzKGFzc2F5c0RhdGFHcmlkU3BlYyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGFzc2F5c0RhdGFHcmlkLnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZpZXdpbmdNb2RlSXNTdGFsZVsndGFibGUnXSA9IGZhbHNlO1xuICAgICAgICAgICAgbWFrZUxhYmVsc0JsYWNrKEVEREdyYXBoaW5nVG9vbHMubGFiZWxzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbWFrZU1haW5HcmFwaEFyZWEoKTtcbiAgICAgICAgICAgIGlmICh2aWV3aW5nTW9kZSA9PSAnYmFyZ3JhcGgnKSB7XG4gICAgICAgICAgICAgICAgdmlld2luZ01vZGVJc1N0YWxlW3ZpZXdpbmdNb2RlKyctJytiYXJHcmFwaE1vZGVdID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZpZXdpbmdNb2RlSXNTdGFsZVsnbGluZWdyYXBoJ10gPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gYWN0aW9uUGFuZWxSZWZyZXNoKCkge1xuICAgICAgICB2YXIgY2hlY2tlZEJveGVzOiBIVE1MSW5wdXRFbGVtZW50W10sIGNoZWNrZWRBc3NheXM6IG51bWJlciwgY2hlY2tlZE1lYXN1cmU6IG51bWJlcixcbiAgICAgICAgICAgIG5vdGhpbmdTZWxlY3RlZDogYm9vbGVhbiwgY29udGVudFNjcm9sbGluZzogYm9vbGVhbiwgZmlsdGVySW5Cb3R0b206IGJvb2xlYW47XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgYXNzYXlzL2NoZWNrYm94ZXMgYXJlIHNlbGVjdGVkLlxuXG4gICAgICAgIC8vIERvbid0IHNob3cgdGhlIHNlbGVjdGVkIGl0ZW0gY291bnQgaWYgd2UncmUgbm90IGxvb2tpbmcgYXQgdGhlIHRhYmxlLlxuICAgICAgICAvLyAoT25seSB0aGUgdmlzaWJsZSBpdGVtIGNvdW50IG1ha2VzIHNlbnNlIGluIHRoYXQgY2FzZS4pXG4gICAgICAgIGlmICh2aWV3aW5nTW9kZSA9PSAndGFibGUnKSB7XG4gICAgICAgICAgICAkKCcuZGlzcGxheWVkRGl2JykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgaWYgKGFzc2F5c0RhdGFHcmlkKSB7XG4gICAgICAgICAgICAgICAgY2hlY2tlZEJveGVzID0gYXNzYXlzRGF0YUdyaWQuZ2V0U2VsZWN0ZWRDaGVja2JveEVsZW1lbnRzKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNoZWNrZWRCb3hlcyA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hlY2tlZEFzc2F5cyA9ICQoY2hlY2tlZEJveGVzKS5maWx0ZXIoJ1tuYW1lPWFzc2F5SWRdJykubGVuZ3RoO1xuICAgICAgICAgICAgY2hlY2tlZE1lYXN1cmUgPSAkKGNoZWNrZWRCb3hlcykuZmlsdGVyKCdbbmFtZT1tZWFzdXJlbWVudElkXScpLmxlbmd0aDtcbiAgICAgICAgICAgIG5vdGhpbmdTZWxlY3RlZCA9ICFjaGVja2VkQXNzYXlzICYmICFjaGVja2VkTWVhc3VyZTtcbiAgICAgICAgICAgIC8vZW5hYmxlIGFjdGlvbiBidXR0b25zIGlmIHNvbWV0aGluZyBpcyBzZWxlY3RlZFxuICAgICAgICAgICAgJCgnLnRhYmxlQWN0aW9uQnV0dG9ucycpLmZpbmQoJ2J1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgbm90aGluZ1NlbGVjdGVkKTtcbiAgICAgICAgICAgICQoJy5zZWxlY3RlZERpdicpLnRvZ2dsZUNsYXNzKCdvZmYnLCBub3RoaW5nU2VsZWN0ZWQpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGVkU3RycyA9IFtdO1xuICAgICAgICAgICAgaWYgKCFub3RoaW5nU2VsZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2hlY2tlZEFzc2F5cykge1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFN0cnMucHVzaCgoY2hlY2tlZEFzc2F5cyA+IDEpID8gKGNoZWNrZWRBc3NheXMgKyBcIiBBc3NheXNcIikgOiBcIjEgQXNzYXlcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjaGVja2VkTWVhc3VyZSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFN0cnMucHVzaCgoY2hlY2tlZE1lYXN1cmUgPiAxKSA/IChjaGVja2VkTWVhc3VyZSArIFwiIE1lYXN1cmVtZW50c1wiKSA6IFwiMSBNZWFzdXJlbWVudFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIHNlbGVjdGVkU3RyID0gc2VsZWN0ZWRTdHJzLmpvaW4oJywgJyk7XG4gICAgICAgICAgICAgICAgJCgnLnNlbGVjdGVkRGl2JykudGV4dChzZWxlY3RlZFN0ciArICcgc2VsZWN0ZWQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoJy5zZWxlY3RlZERpdicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgICQoJy5kaXNwbGF5ZWREaXYnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy9pZiB0aGVyZSBhcmUgYXNzYXlzIGJ1dCBubyBkYXRhLCBzaG93IGVtcHR5IGFzc2F5c1xuICAgICAgICAvL25vdGU6IHRoaXMgaXMgdG8gY29tYmF0IHRoZSBjdXJyZW50IGRlZmF1bHQgc2V0dGluZyBmb3Igc2hvd2luZyBncmFwaCBvbiBwYWdlIGxvYWRcbiAgICAgICAgaWYgKF8ua2V5cyhFREREYXRhLkFzc2F5cykubGVuZ3RoID4gMCAmJiBfLmtleXMoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cykubGVuZ3RoID09PSAwICkge1xuICAgICAgICAgICAgaWYgKCEkKCcjVGFibGVTaG93RUFzc2F5c0NCJykucHJvcCgnY2hlY2tlZCcpKSB7XG4gICAgICAgICAgICAgICAgJCgnI1RhYmxlU2hvd0VBc3NheXNDQicpLmNsaWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBtb3ZlIGJ1dHRvbnMgc28gdGhleSBhcmUgYWx3YXlzIHZpc2libGUgaWYgdGhlIHBhZ2UgaXMgc2Nyb2xsaW5nXG4gICAgICAgIGNvbnRlbnRTY3JvbGxpbmcgPSBpc0NvbnRlbnRTY3JvbGxpbmcoKTtcbiAgICAgICAgaWYgKGFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciAmJiAhY29udGVudFNjcm9sbGluZykge1xuICAgICAgICAgICAgJCgnI2Fzc2F5c0FjdGlvblBhbmVsJykuc2hvdygpO1xuICAgICAgICAgICAgJCgnI2NvcHlBY3Rpb25QYW5lbCcpLmhpZGUoKTtcbiAgICAgICAgICAgIGFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciA9IGZhbHNlO1xuICAgICAgICB9IGVsc2UgaWYgKCFhY3Rpb25QYW5lbElzSW5Cb3R0b21CYXIgJiYgY29udGVudFNjcm9sbGluZykge1xuICAgICAgICAgICAgJCgnI2Fzc2F5c0FjdGlvblBhbmVsJykuaGlkZSgpO1xuICAgICAgICAgICAgJCgnI2NvcHlBY3Rpb25QYW5lbCcpLnNob3coKTtcbiAgICAgICAgICAgIGFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBvbmx5IG1vdmUgdGhlIGZpbHRlciBzZWN0aW9uIHdoZW4gdGhlIHBhZ2UgaXMgc2Nyb2xsaW5nIGluIHRhYmxlIHZpZXdcbiAgICAgICAgaWYgKHZpZXdpbmdNb2RlID09ICd0YWJsZScpIHtcbiAgICAgICAgICAgIGNvbnRlbnRTY3JvbGxpbmcgPSBpc0NvbnRlbnRTY3JvbGxpbmcoKTtcbiAgICAgICAgICAgIGZpbHRlckluQm90dG9tID0gJCgnI21haW5GaWx0ZXJTZWN0aW9uJykucGFyZW50KCkuaXMoJyNib3R0b21CYXInKTtcbiAgICAgICAgICAgIGlmIChmaWx0ZXJJbkJvdHRvbSAmJiAhY29udGVudFNjcm9sbGluZykge1xuICAgICAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLmFwcGVuZFRvKCcjY29udGVudCcpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghZmlsdGVySW5Cb3R0b20gJiYgY29udGVudFNjcm9sbGluZykge1xuICAgICAgICAgICAgICAgICQoJyNtYWluRmlsdGVyU2VjdGlvbicpLmFwcGVuZFRvKCcjYm90dG9tQmFyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGlzQ29udGVudFNjcm9sbGluZygpOiBib29sZWFuIHtcbiAgICAgICAgdmFyIHZpZXdIZWlnaHQ6IG51bWJlciA9IDAsIGl0ZW1zSGVpZ2h0OiBudW1iZXIgPSAwO1xuICAgICAgICB2aWV3SGVpZ2h0ID0gJCgnI2NvbnRlbnQnKS5oZWlnaHQoKTtcbiAgICAgICAgJCgnI2NvbnRlbnQnKS5jaGlsZHJlbigpLmVhY2goKGksIGUpID0+IHsgaXRlbXNIZWlnaHQgKz0gZS5zY3JvbGxIZWlnaHQ7IH0pO1xuICAgICAgICByZXR1cm4gdmlld0hlaWdodCA8IGl0ZW1zSGVpZ2h0O1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcmVtYWtlTWFpbkdyYXBoQXJlYSgpIHtcblxuICAgICAgICB2YXIgZGF0YVBvaW50c0Rpc3BsYXllZCA9IDAsXG4gICAgICAgICAgICBkYXRhUG9pbnRzVG90YWwgPSAwLFxuICAgICAgICAgICAgZGF0YVNldHMgPSBbXTtcblxuICAgICAgICAkKCcjdG9vTWFueVBvaW50cycpLmhpZGUoKTtcbiAgICAgICAgJCgnI2xpbmVHcmFwaCcpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgJCgnI2JhckdyYXBoQnlUaW1lJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAkKCcjYmFyR3JhcGhCeUxpbmUnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICQoJyNiYXJHcmFwaEJ5TWVhc3VyZW1lbnQnKS5hZGRDbGFzcygnb2ZmJyk7XG5cbiAgICAgICAgLy8gc2hvdyBtZXNzYWdlIHRoYXQgdGhlcmUncyBubyBkYXRhIHRvIGRpc3BsYXlcbiAgICAgICAgaWYgKHBvc3RGaWx0ZXJpbmdNZWFzdXJlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykuYWRkQ2xhc3MoJ29mZicpOyAgICAvLyBSZW1vdmUgbG9hZCBzcGlubmVyIGlmIHN0aWxsIHByZXNlbnRcbiAgICAgICAgICAgICQoJyNub0RhdGEnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAkLmVhY2gocG9zdEZpbHRlcmluZ01lYXN1cmVtZW50cywgKGksIG1lYXN1cmVtZW50SWQpID0+IHtcblxuICAgICAgICAgICAgdmFyIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnRJZF0sXG4gICAgICAgICAgICAgICAgcG9pbnRzID0gKG1lYXN1cmUudmFsdWVzID8gbWVhc3VyZS52YWx1ZXMubGVuZ3RoIDogMCksXG4gICAgICAgICAgICAgICAgYXNzYXksIGxpbmUsIG5hbWUsIHNpbmdsZUFzc2F5T2JqLCBjb2xvciwgcHJvdG9jb2wsIGxpbmVOYW1lLCBkYXRhT2JqO1xuICAgICAgICAgICAgZGF0YVBvaW50c1RvdGFsICs9IHBvaW50cztcblxuICAgICAgICAgICAgaWYgKGRhdGFQb2ludHNEaXNwbGF5ZWQgPiAxNTAwMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGUgcmVzdCBpZiB3ZSd2ZSBoaXQgb3VyIGxpbWl0XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRhdGFQb2ludHNEaXNwbGF5ZWQgKz0gcG9pbnRzO1xuICAgICAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlLmFzc2F5XSB8fCB7fTtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBuYW1lID0gYXNzYXkubmFtZTtcbiAgICAgICAgICAgIGxpbmVOYW1lID0gbGluZS5uYW1lO1xuXG4gICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkubmV4dCgpO1xuXG4gICAgICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuTGluZXMpLmxlbmd0aCA+IDIyKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjaGFuZ2VMaW5lQ29sb3IobGluZSwgYXNzYXkubGlkKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPCAxKSB7XG4gICAgICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5sYWJlbHMucHVzaChsYWJlbCk7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsIGNvbG9yKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoJCgnIycgKyBsaW5lWydpZGVudGlmaWVyJ10pLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgIC8vIHVuY2hlY2tlZCBsYWJlbHMgYmxhY2tcbiAgICAgICAgICAgICAgICBtYWtlTGFiZWxzQmxhY2soRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBsYWJlbCBjb2xvciB0byBsaW5lIGNvbG9yXG4gICAgICAgICAgICAgICAgaWYgKGNvbG9yID09PSBudWxsIHx8IGNvbG9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjb3VudCA9IG5vQ2hlY2tlZEJveGVzKEVEREdyYXBoaW5nVG9vbHMubGFiZWxzKTtcbiAgICAgICAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5uZXh0Q29sb3IgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICBhZGRDb2xvcihFRERHcmFwaGluZ1Rvb2xzLmxhYmVscywgYXNzYXkubGlkKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGJsYWNrXG4gICAgICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCAnYmxhY2snKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjb2xvciA9PT0gbnVsbCB8fCBjb2xvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSBjb2xvck9ialthc3NheS5saWRdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkYXRhT2JqID0ge1xuICAgICAgICAgICAgICAgICdtZWFzdXJlJzogbWVhc3VyZSxcbiAgICAgICAgICAgICAgICAnZGF0YSc6IEVERERhdGEsXG4gICAgICAgICAgICAgICAgJ25hbWUnOiBuYW1lLFxuICAgICAgICAgICAgICAgICdjb2xvcic6IGNvbG9yLFxuICAgICAgICAgICAgICAgICdsaW5lTmFtZSc6IGxpbmVOYW1lXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc2luZ2xlQXNzYXlPYmogPSBFRERHcmFwaGluZ1Rvb2xzLnRyYW5zZm9ybVNpbmdsZUxpbmVJdGVtKGRhdGFPYmopO1xuICAgICAgICAgICAgZGF0YVNldHMucHVzaChzaW5nbGVBc3NheU9iaik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoJy5kaXNwbGF5ZWREaXYnKS50ZXh0KGRhdGFQb2ludHNEaXNwbGF5ZWQgKyBcIiBtZWFzdXJlbWVudHMgZGlzcGxheWVkXCIpO1xuXG4gICAgICAgICQoJyNub0RhdGEnKS5hZGRDbGFzcygnb2ZmJyk7XG5cbiAgICAgICAgcmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzKys7XG4gICAgICAgIHVuY2hlY2tFdmVudEhhbmRsZXIoRURER3JhcGhpbmdUb29scy5sYWJlbHMpO1xuXG4gICAgICAgIHZhciBiYXJBc3NheU9iaiAgPSBFRERHcmFwaGluZ1Rvb2xzLmNvbmNhdEFzc2F5cyhkYXRhU2V0cyk7XG5cbiAgICAgICAgLy9kYXRhIGZvciBncmFwaHNcbiAgICAgICAgdmFyIGdyYXBoU2V0ID0ge1xuICAgICAgICAgICAgYmFyQXNzYXlPYmo6IEVEREdyYXBoaW5nVG9vbHMuY29uY2F0QXNzYXlzKGRhdGFTZXRzKSxcbiAgICAgICAgICAgIGNyZWF0ZV94X2F4aXM6IEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlWEF4aXMsXG4gICAgICAgICAgICBjcmVhdGVfcmlnaHRfeV9heGlzOiBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVJpZ2h0WUF4aXMsXG4gICAgICAgICAgICBjcmVhdGVfeV9heGlzOiBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZUxlZnRZQXhpcyxcbiAgICAgICAgICAgIHhfYXhpczogRURER3JhcGhpbmdUb29scy5tYWtlX3hfYXhpcyxcbiAgICAgICAgICAgIHlfYXhpczogRURER3JhcGhpbmdUb29scy5tYWtlX3JpZ2h0X3lfYXhpcyxcbiAgICAgICAgICAgIGluZGl2aWR1YWxEYXRhOiBkYXRhU2V0cyxcbiAgICAgICAgICAgIGFzc2F5TWVhc3VyZW1lbnRzOiBiYXJBc3NheU9iaixcbiAgICAgICAgICAgIHdpZHRoOiA3NTAsXG4gICAgICAgICAgICBoZWlnaHQ6IDIyMFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICh2aWV3aW5nTW9kZSA9PSAnbGluZWdyYXBoJykge1xuICAgICAgICAgICAgJCgnI2xpbmVHcmFwaCcpLmVtcHR5KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdmFyIHMgPSBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVN2ZygkKCcjbGluZUdyYXBoJykuZ2V0KDApKTtcbiAgICAgICAgICAgIEVEREdyYXBoaW5nVG9vbHMuY3JlYXRlTXVsdGlMaW5lR3JhcGgoZ3JhcGhTZXQsIHMpO1xuICAgICAgICB9IGVsc2UgaWYgKGJhckdyYXBoTW9kZSA9PSAndGltZScpIHtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5VGltZScpLmVtcHR5KCkucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgdmFyIHMgPSBFRERHcmFwaGluZ1Rvb2xzLmNyZWF0ZVN2ZygkKCcjYmFyR3JhcGhCeVRpbWUnKS5nZXQoMCkpO1xuICAgICAgICAgICAgY3JlYXRlR3JvdXBlZEJhckdyYXBoKGdyYXBoU2V0LCBzKTtcbiAgICAgICAgfSBlbHNlIGlmIChiYXJHcmFwaE1vZGUgPT0gJ2xpbmUnKSB7XG4gICAgICAgICAgICAkKCcjYmFyR3JhcGhCeUxpbmUnKS5lbXB0eSgpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHZhciBzID0gRURER3JhcGhpbmdUb29scy5jcmVhdGVTdmcoJCgnI2JhckdyYXBoQnlMaW5lJykuZ2V0KDApKTtcbiAgICAgICAgICAgIGNyZWF0ZUdyb3VwZWRCYXJHcmFwaChncmFwaFNldCwgcyk7XG4gICAgICAgIH0gZWxzZSBpZiAoYmFyR3JhcGhNb2RlID09ICdtZWFzdXJlbWVudCcpIHtcbiAgICAgICAgICAgICQoJyNiYXJHcmFwaEJ5TWVhc3VyZW1lbnQnKS5lbXB0eSgpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHZhciBzID0gRURER3JhcGhpbmdUb29scy5jcmVhdGVTdmcoJCgnI2JhckdyYXBoQnlNZWFzdXJlbWVudCcpLmdldCgwKSk7XG4gICAgICAgICAgICBjcmVhdGVHcm91cGVkQmFyR3JhcGgoZ3JhcGhTZXQsIHMpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiB0aGlzIGZ1bmN0aW9uIG1ha2VzIHVuY2hlY2tlZCBsYWJlbHMgYmxhY2tcbiAgICAgKiBAcGFyYW0gc2VsZWN0b3JzXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZUxhYmVsc0JsYWNrKHNlbGVjdG9yczpKUXVlcnlbXSkge1xuICAgICAgICBfLmVhY2goc2VsZWN0b3JzLCBmdW5jdGlvbihzZWxlY3RvcjpKUXVlcnkpIHtcbiAgICAgICAgICAgIGlmIChzZWxlY3Rvci5wcmV2KCkucHJvcCgnY2hlY2tlZCcpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgJChzZWxlY3RvcikuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiBjcmVhdGVzIGFuIGV2ZW50IGhhbmRsZXIgZm9yIHVuY2hlY2tpbmcgYSBjaGVja2VkIGNoZWNrYm94XG4gICAgICogQHBhcmFtIGxhYmVsc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIHVuY2hlY2tFdmVudEhhbmRsZXIobGFiZWxzKSB7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsKXtcbiAgICAgICAgICAgIHZhciBpZCA9ICQobGFiZWwpLnByZXYoKS5hdHRyKCdpZCcpO1xuICAgICAgICAgICAgJCgnIycgKyBpZCkuY2hhbmdlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBpc2NoZWNrZWQ9ICQodGhpcykuaXMoJzpjaGVja2VkJyk7XG4gICAgICAgICAgICAgICAgaWYgKCFpc2NoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgJChsYWJlbCkuY3NzKCdjb2xvcicsICdibGFjaycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBob3cgbWFueSBjaGVja2JveGVzIGFyZSBjaGVja2VkLlxuICAgICAqIEBwYXJhbSBsYWJlbHNcbiAgICAgKiBAcmV0dXJucyBjb3VudCBvZiBjaGVja2VkIGJveGVzLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG5vQ2hlY2tlZEJveGVzKGxhYmVscykge1xuICAgICAgICB2YXIgY291bnQgPSAwO1xuICAgICAgICBfLmVhY2gobGFiZWxzLCBmdW5jdGlvbihsYWJlbCkge1xuICAgICAgICAgICAgdmFyIGNoZWNrYm94ID0gJChsYWJlbCkucHJldigpO1xuICAgICAgICAgICAgaWYgKCQoY2hlY2tib3gpLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFkZHMgY29sb3JzIGFmdGVyIHVzZXIgaGFzIGNsaWNrZWQgYSBsaW5lIGFuZCB0aGVuIHVuY2xpY2tlZCBhbGwgdGhlIGxpbmVzLlxuICAgICAqIEBwYXJhbSBsYWJlbHNcbiAgICAgKiBAcGFyYW0gYXNzYXlcbiAgICAgKiBAcmV0dXJucyBsYWJlbHNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRDb2xvcihsYWJlbHM6SlF1ZXJ5W10sIGFzc2F5KSB7XG4gICAgICAgIF8uZWFjaChsYWJlbHMsIGZ1bmN0aW9uKGxhYmVsOkpRdWVyeSkge1xuICAgICAgICAgICAgdmFyIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICAgICAgaWYgKEVERERhdGEuTGluZXNbYXNzYXldLm5hbWUgPT09IGxhYmVsLnRleHQoKSkge1xuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbGFiZWxzO1xuICAgIH1cblxuXG4gICAgLyoqIHRoaXMgZnVuY3Rpb24gdGFrZXMgaW4gYW4gZWxlbWVudCBzZWxlY3RvciBhbmQgYW4gYXJyYXkgb2Ygc3ZnIHJlY3RzIGFuZCByZXR1cm5zXG4gICAgICogcmV0dXJucyBtZXNzYWdlIG9yIG5vdGhpbmcuXG4gICAgICovXG4gICAgZnVuY3Rpb24gc3ZnV2lkdGgoc2VsZWN0b3IsIHJlY3RBcnJheSkge1xuICAgICAgICAkKCcudG9vTXVjaERhdGEnKS5oaWRlKCk7XG4gICAgICAgICQoJy5ub0RhdGEnKS5oaWRlKCk7XG4gICAgICAgIHZhciBzdW0gPSAwO1xuICAgICAgICBfLmVhY2gocmVjdEFycmF5LCBmdW5jdGlvbihyZWN0RWxlbTphbnkpIHtcbiAgICAgICAgICAgIGlmIChyZWN0RWxlbS5nZXRBdHRyaWJ1dGUoXCJ3aWR0aFwiKSAhPSAwKSB7XG4gICAgICAgICAgICAgICAgc3VtKytcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChzdW0gPT09IDApIHtcbiAgICAgICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgJChzZWxlY3RvcikucHJlcGVuZChcIjxwIGNsYXNzPScgdG9vTXVjaERhdGEnPlRvbyBtYW55IGRhdGEgcG9pbnRzIHRvIGRpc3BsYXlcIiArXG4gICAgICAgICAgICAgICAgXCI8L3A+PHAgIGNsYXNzPScgdG9vTXVjaERhdGEnPlJlY29tbWVuZCBmaWx0ZXJpbmcgYnkgcHJvdG9jb2w8L3A+XCIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKiogdGhpcyBmdW5jdGlvbiB0YWtlcyBpbiB0aGUgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzIG9iamVjdCBhbmQgcmV0dXJucyB0aGUgbWVhc3VyZW1lbnQgdHlwZVxuICAgICAqICB0aGF0IGhhcyB0aGUgbW9zdCBkYXRhIHBvaW50cyAtIG9wdGlvbnMgYXJlIGJhc2VkIG9uIGZhbWlseSBwLCBtLCAtLCBldGMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWVhc3VyZW1lbnRUeXBlKHR5cGVzKSB7ICAgIC8vIFRPRE86IFJFTkFNRVxuICAgICAgICB2YXIgcHJvdGVvbWljcyA9IHt9O1xuICAgICAgICBmb3IgKHZhciB0eXBlIGluIHR5cGVzKSB7XG4gICAgICAgICAgICBpZiAocHJvdGVvbWljcy5oYXNPd25Qcm9wZXJ0eSh0eXBlc1t0eXBlXS5mYW1pbHkpKSB7XG4gICAgICAgICAgICAgICAgcHJvdGVvbWljc1t0eXBlc1t0eXBlXS5mYW1pbHldKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHByb3Rlb21pY3NbdHlwZXNbdHlwZV0uZmFtaWx5XSA9IDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gcHJvdGVvbWljcykge1xuICAgICAgICAgICAgdmFyIG1heDphbnkgPSAwO1xuICAgICAgICAgICAgdmFyIG1heFR5cGU6YW55O1xuICAgICAgICAgICAgaWYgKHByb3Rlb21pY3Nba2V5XSA+IG1heCkge1xuICAgICAgICAgICAgICAgIG1heCA9IHByb3Rlb21pY3Nba2V5XTtcbiAgICAgICAgICAgICAgICBtYXhUeXBlID0ga2V5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXhUeXBlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHRoaXMgZnVuY3Rpb24gdGFrZXMgaW4gaW5wdXQgbWluIHkgdmFsdWUsIG1heCB5IHZhbHVlLCBhbmQgdGhlIHNvcnRlZCBqc29uIG9iamVjdC5cbiAgICAgKiAgb3V0cHV0cyBhIGdyb3VwZWQgYmFyIGdyYXBoIHdpdGggdmFsdWVzIGdyb3VwZWQgYnkgYXNzYXkgbmFtZVxuICAgICAqKi9cbiAgICBleHBvcnQgZnVuY3Rpb24gY3JlYXRlR3JvdXBlZEJhckdyYXBoKGdyYXBoU2V0LCBzdmcpIHtcblxuICAgICAgICB2YXIgYXNzYXlNZWFzdXJlbWVudHMgPSBncmFwaFNldC5hc3NheU1lYXN1cmVtZW50cyxcbiAgICAgICAgICAgIHR5cGVJRCA9IHtcbiAgICAgICAgICAgICAgICAnbWVhc3VyZW1lbnQnOiBcIiNiYXJHcmFwaEJ5TWVhc3VyZW1lbnRcIixcbiAgICAgICAgICAgICAgICAneCc6IFwiI2JhckdyYXBoQnlUaW1lXCIsXG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnI2JhckdyYXBoQnlMaW5lJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1vZGVUb0ZpZWxkID0ge1xuICAgICAgICAgICAgICAgICdsaW5lJzogJ25hbWUnLFxuICAgICAgICAgICAgICAgICd0aW1lJzogJ3gnLFxuICAgICAgICAgICAgICAgICdtZWFzdXJlbWVudCc6ICdtZWFzdXJlbWVudCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBudW1Vbml0cyA9IEVEREdyYXBoaW5nVG9vbHMuaG93TWFueVVuaXRzKGFzc2F5TWVhc3VyZW1lbnRzKSxcbiAgICAgICAgICAgIHlSYW5nZSA9IFtdLFxuICAgICAgICAgICAgdW5pdE1lYXN1cmVtZW50RGF0YSA9IFtdLFxuICAgICAgICAgICAgeU1pbiA9IFtdLFxuICAgICAgICAgICAgZGF0YSwgbmVzdGVkLCB0eXBlTmFtZXMsIHhWYWx1ZXMsIHl2YWx1ZUlkcywgeF9uYW1lLCB4VmFsdWVMYWJlbHMsXG4gICAgICAgICAgICBzb3J0ZWRYdmFsdWVzLCBkaXYsIHhfeFZhbHVlLCBsaW5lSUQsIG1lYXMsIHksIHdvcmRMZW5ndGg7XG5cbiAgICAgICAgdmFyIHR5cGUgPSBtb2RlVG9GaWVsZFtiYXJHcmFwaE1vZGVdO1xuXG4gICAgICAgIGlmICh0eXBlID09PSAneCcpIHtcbiAgICAgICAgICAgICB2YXIgZW50cmllcyA9ICg8YW55PmQzKS5uZXN0KHR5cGUpXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRbdHlwZV07XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50cmllcyhhc3NheU1lYXN1cmVtZW50cyk7XG5cbiAgICAgICAgICAgIHZhciB0aW1lTWVhc3VyZW1lbnRzID0gXy5jbG9uZShhc3NheU1lYXN1cmVtZW50cyk7XG4gICAgICAgICAgICB2YXIgbmVzdGVkQnlUaW1lID0gRURER3JhcGhpbmdUb29scy5maW5kQWxsVGltZShlbnRyaWVzKTtcbiAgICAgICAgICAgIHZhciBob3dNYW55VG9JbnNlcnRPYmogPSBFRERHcmFwaGluZ1Rvb2xzLmZpbmRNYXhUaW1lRGlmZmVyZW5jZShuZXN0ZWRCeVRpbWUpO1xuICAgICAgICAgICAgdmFyIG1heCA9IE1hdGgubWF4LmFwcGx5KG51bGwsIF8udmFsdWVzKGhvd01hbnlUb0luc2VydE9iaikpO1xuICAgICAgICAgICAgaWYgKG1heCA+IDQwMCkge1xuICAgICAgICAgICAgICAgICQodHlwZUlEW3R5cGVdKS5wcmVwZW5kKFwiPHAgY2xhc3M9J25vRGF0YSc+VG9vIG1hbnkgbWlzc2luZyBkYXRhIGZpZWxkcy4gUGxlYXNlIGZpbHRlcjwvcD5cIik7XG4gICAgICAgICAgICAgICAgJCgnLnRvb011Y2hEYXRhJykucmVtb3ZlKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICQoJy5ub0RhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIEVEREdyYXBoaW5nVG9vbHMuaW5zZXJ0RmFrZVZhbHVlcyhlbnRyaWVzLCBob3dNYW55VG9JbnNlcnRPYmosIHRpbWVNZWFzdXJlbWVudHMpO1xuICAgICAgICB9XG4gICAgICAgIC8veCBheGlzIHNjYWxlIGZvciB0eXBlXG4gICAgICAgIHhfbmFtZSA9IGQzLnNjYWxlLm9yZGluYWwoKVxuICAgICAgICAgICAgLnJhbmdlUm91bmRCYW5kcyhbMCwgZ3JhcGhTZXQud2lkdGhdLCAwLjEpO1xuXG4gICAgICAgIC8veCBheGlzIHNjYWxlIGZvciB4IHZhbHVlc1xuICAgICAgICB4X3hWYWx1ZSA9IGQzLnNjYWxlLm9yZGluYWwoKTtcblxuICAgICAgICAvL3ggYXhpcyBzY2FsZSBmb3IgbGluZSBpZCB0byBkaWZmZXJlbnRpYXRlIG11bHRpcGxlIGxpbmVzIGFzc29jaWF0ZWQgd2l0aCB0aGUgc2FtZSBuYW1lL3R5cGVcbiAgICAgICAgbGluZUlEID0gZDMuc2NhbGUub3JkaW5hbCgpO1xuXG4gICAgICAgIC8vIHkgYXhpcyByYW5nZSBzY2FsZVxuICAgICAgICB5ID0gZDMuc2NhbGUubGluZWFyKClcbiAgICAgICAgICAgIC5yYW5nZShbZ3JhcGhTZXQuaGVpZ2h0LCAwXSk7XG5cbiAgICAgICAgZGl2ID0gZDMuc2VsZWN0KFwiYm9keVwiKS5hcHBlbmQoXCJkaXZcIilcbiAgICAgICAgICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJ0b29sdGlwMlwiKVxuICAgICAgICAgICAgLnN0eWxlKFwib3BhY2l0eVwiLCAwKTtcblxuICAgICAgICB2YXIgZDNfZW50cmllcyA9IHR5cGUgPT09ICd4JyA/IHRpbWVNZWFzdXJlbWVudHMgOiBhc3NheU1lYXN1cmVtZW50cztcbiAgICAgICAgICAgIG1lYXMgPSBkMy5uZXN0KClcbiAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGQueV91bml0O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5lbnRyaWVzKGQzX2VudHJpZXMpO1xuXG4gICAgICAgIC8vIGlmIHRoZXJlIGlzIG5vIGRhdGEgLSBzaG93IG5vIGRhdGEgZXJyb3IgbWVzc2FnZVxuICAgICAgICBpZiAoYXNzYXlNZWFzdXJlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAkKHR5cGVJRFt0eXBlXSkucHJlcGVuZChcIjxwIGNsYXNzPSdub0RhdGEnPk5vIGRhdGEgc2VsZWN0ZWQgLSBwbGVhc2UgXCIgK1xuICAgICAgICAgICAgXCJmaWx0ZXI8L3A+XCIpO1xuXG4gICAgICAgICAgICAkKCcudG9vTXVjaERhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoJy5ub0RhdGEnKS5yZW1vdmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVW5pdHM7IGkrKykge1xuICAgICAgICAgICAgeVJhbmdlLnB1c2goZDMuc2NhbGUubGluZWFyKCkucmFuZ2VSb3VuZChbZ3JhcGhTZXQuaGVpZ2h0LCAwXSkpO1xuICAgICAgICAgICAgdW5pdE1lYXN1cmVtZW50RGF0YS5wdXNoKGQzLm5lc3QoKVxuICAgICAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkLnk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50cmllcyhtZWFzW2ldLnZhbHVlcykpO1xuICAgICAgICAgICAgeU1pbi5wdXNoKGQzLm1pbih1bml0TWVhc3VyZW1lbnREYXRhW2ldLCBmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZDMubWluKGQudmFsdWVzLCBmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQueTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICd4Jykge1xuICAgICAgICAgICAgLy8gbmVzdCBkYXRhIGJ5IHR5cGUgKGllIG1lYXN1cmVtZW50KSBhbmQgYnkgeCB2YWx1ZVxuICAgICAgICAgICAgbmVzdGVkID0gKDxhbnk+ZDMpLm5lc3QodHlwZSlcbiAgICAgICAgICAgICAgICAua2V5KGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZFt0eXBlXTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KGQueCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuZW50cmllcyh0aW1lTWVhc3VyZW1lbnRzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIG5lc3QgZGF0YSBieSB0eXBlIChpZSBtZWFzdXJlbWVudCkgYW5kIGJ5IHggdmFsdWVcbiAgICAgICAgICAgIG5lc3RlZCA9ICg8YW55PmQzKS5uZXN0KHR5cGUpXG4gICAgICAgICAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZFt0eXBlXTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KGQueCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIC5lbnRyaWVzKGFzc2F5TWVhc3VyZW1lbnRzKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy9pbnNlcnQgeSB2YWx1ZSB0byBkaXN0aW5ndWlzaCBiZXR3ZWVuIGxpbmVzXG4gICAgICAgIGRhdGEgPSBFRERHcmFwaGluZ1Rvb2xzLmdldFhZVmFsdWVzKG5lc3RlZCk7XG5cbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gc3ZnXG4gICAgICAgIH1cblxuICAgICAgICAvL2dldCB0eXBlIG5hbWVzIGZvciB4IGxhYmVsc1xuICAgICAgICB0eXBlTmFtZXMgPSBkYXRhLm1hcCgoZDphbnkpID0+IGQua2V5KTtcblxuICAgICAgICAvL3NvcnQgeCB2YWx1ZXNcbiAgICAgICAgdHlwZU5hbWVzLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICB4VmFsdWVzID0gZGF0YS5tYXAoKGQ6YW55KSA9PiBkLnZhbHVlcyk7XG5cbiAgICAgICAgeXZhbHVlSWRzID0gZGF0YVswXS52YWx1ZXNbMF0udmFsdWVzLm1hcCgoZDphbnkpID0+IGQua2V5KTtcblxuICAgICAgICAvLyByZXR1cm5zIHRpbWUgdmFsdWVzXG4gICAgICAgIHhWYWx1ZUxhYmVscyA9IHhWYWx1ZXNbMF0ubWFwKChkOmFueSkgPT4gZC5rZXkpO1xuXG4gICAgICAgIC8vc29ydCB0aW1lIHZhbHVlc1xuICAgICAgICBzb3J0ZWRYdmFsdWVzID0geFZhbHVlTGFiZWxzLnNvcnQoKGEsIGIpID0+IHBhcnNlRmxvYXQoYSkgLSBwYXJzZUZsb2F0KGIpKTtcblxuICAgICAgICB4X25hbWUuZG9tYWluKHR5cGVOYW1lcyk7XG5cbiAgICAgICAgeF94VmFsdWUuZG9tYWluKHNvcnRlZFh2YWx1ZXMpLnJhbmdlUm91bmRCYW5kcyhbMCwgeF9uYW1lLnJhbmdlQmFuZCgpXSk7XG5cbiAgICAgICAgbGluZUlELmRvbWFpbih5dmFsdWVJZHMpLnJhbmdlUm91bmRCYW5kcyhbMCwgeF94VmFsdWUucmFuZ2VCYW5kKCldKTtcblxuICAgICAgICAvLyBjcmVhdGUgeCBheGlzXG4gICAgICAgIGdyYXBoU2V0LmNyZWF0ZV94X2F4aXMoZ3JhcGhTZXQsIHhfbmFtZSwgc3ZnLCB0eXBlKTtcblxuICAgICAgICAvLyBsb29wIHRocm91Z2ggZGlmZmVyZW50IHVuaXRzXG4gICAgICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBudW1Vbml0czsgaW5kZXgrKykge1xuXG4gICAgICAgICAgICBpZiAoeU1pbltpbmRleF0gPiAwICkge1xuICAgICAgICAgICAgICAgIHlNaW5baW5kZXhdID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8veSBheGlzIG1pbiBhbmQgbWF4IGRvbWFpblxuICAgICAgICAgICAgeS5kb21haW4oW3lNaW5baW5kZXhdLCBkMy5tYXgodW5pdE1lYXN1cmVtZW50RGF0YVtpbmRleF0sIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkMy5tYXgoZC52YWx1ZXMsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZC55O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSldKTtcblxuICAgICAgICAgICAgLy9uZXN0IGRhdGEgYXNzb2NpYXRlZCB3aXRoIG9uZSB1bml0IGJ5IHR5cGUgYW5kIHRpbWUgdmFsdWVcbiAgICAgICAgICAgIGRhdGEgPSAoPGFueT5kMykubmVzdCh0eXBlKVxuICAgICAgICAgICAgICAgIC5rZXkoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkW3R5cGVdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmtleShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQoZC54KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRyaWVzKG1lYXNbaW5kZXhdLnZhbHVlcyk7XG5cblxuICAgICAgICAgICAgLy8gLy9oaWRlIHZhbHVlcyBpZiB0aGVyZSBhcmUgZGlmZmVyZW50IHRpbWUgcG9pbnRzXG4gICAgICAgICAgICBpZiAodHlwZSAhPSAneCcpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmVzdGVkQnlUaW1lID0gRURER3JhcGhpbmdUb29scy5maW5kQWxsVGltZShkYXRhKTtcbiAgICAgICAgICAgICAgICB2YXIgaG93TWFueVRvSW5zZXJ0T2JqID0gRURER3JhcGhpbmdUb29scy5maW5kTWF4VGltZURpZmZlcmVuY2UobmVzdGVkQnlUaW1lKTtcbiAgICAgICAgICAgICAgICB2YXIgbWF4ID0gTWF0aC5tYXguYXBwbHkobnVsbCwgXy52YWx1ZXMoaG93TWFueVRvSW5zZXJ0T2JqKSk7XG4gICAgICAgICAgICAgICAgdmFyIGdyYXBoU3ZnID0gJCh0eXBlSURbdHlwZV0pWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKG1heCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLnRvb011Y2hEYXRhJykucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmVjdHMgPSBkMy5zZWxlY3RBbGwodHlwZUlEW3R5cGVdICsgICcgcmVjdCcpWzBdO1xuICAgICAgICAgICAgICAgICAgICBzdmdXaWR0aChncmFwaFN2ZywgYXJlY3RzKTtcbiAgICAgICAgICAgICAgICAgICAgIC8vZ2V0IHdvcmQgbGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIHdvcmRMZW5ndGggPSBFRERHcmFwaGluZ1Rvb2xzLmdldFN1bSh0eXBlTmFtZXMpO1xuICAgICAgICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwodHlwZUlEW3R5cGVdICsgJyAueC5heGlzIHRleHQnKS5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN2ZztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkKCcubm9EYXRhJykucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3JpZ2h0IGF4aXNcbiAgICAgICAgICAgIGlmIChpbmRleCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgZ3JhcGhTZXQuY3JlYXRlX3lfYXhpcyhncmFwaFNldCwgbWVhc1tpbmRleF0ua2V5LCB5LCBzdmcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BhY2luZyA9IHtcbiAgICAgICAgICAgICAgICAgICAgMTogZ3JhcGhTZXQud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIDI6IGdyYXBoU2V0LndpZHRoICsgNTAsXG4gICAgICAgICAgICAgICAgICAgIDM6IGdyYXBoU2V0LndpZHRoICsgMTAwLFxuICAgICAgICAgICAgICAgICAgICA0OiBncmFwaFNldC53aWR0aCArIDE1MFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgLy9jcmVhdGUgcmlnaHQgYXhpc1xuICAgICAgICAgICAgICAgIGdyYXBoU2V0LmNyZWF0ZV9yaWdodF95X2F4aXMobWVhc1tpbmRleF0ua2V5LCB5LCBzdmcsIHNwYWNpbmdbaW5kZXhdKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbmFtZXNfZyA9IHN2Zy5zZWxlY3RBbGwoXCIuZ3JvdXBcIiArIGluZGV4KVxuICAgICAgICAgICAgICAgIC5kYXRhKGRhdGEpXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwidHJhbnNmb3JtXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJ0cmFuc2xhdGUoXCIgKyB4X25hbWUoZC5rZXkpICsgXCIsMClcIjtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIGNhdGVnb3JpZXNfZyA9IG5hbWVzX2cuc2VsZWN0QWxsKFwiLmNhdGVnb3J5XCIgKyBpbmRleClcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQudmFsdWVzO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwidHJhbnNmb3JtXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJ0cmFuc2xhdGUoXCIgKyB4X3hWYWx1ZShkLmtleSkgKyBcIiwwKVwiO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB2YXIgY2F0ZWdvcmllc19sYWJlbHMgPSBjYXRlZ29yaWVzX2cuc2VsZWN0QWxsKCcuY2F0ZWdvcnktbGFiZWwnICsgaW5kZXgpXG4gICAgICAgICAgICAgICAgLmRhdGEoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbZC5rZXldO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmVudGVyKClcbiAgICAgICAgICAgICAgICAuYXBwZW5kKFwidGV4dFwiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwieFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4X3hWYWx1ZS5yYW5nZUJhbmQoKSAvIDI7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuYXR0cigneScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdyYXBoU2V0LmhlaWdodCArIDI3O1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3RleHQtYW5jaG9yJywgJ21pZGRsZScpO1xuXG4gICAgICAgICAgICAgdmFyIHZhbHVlc19nID0gY2F0ZWdvcmllc19nLnNlbGVjdEFsbChcIi52YWx1ZVwiICsgaW5kZXgpXG4gICAgICAgICAgICAgICAgLmRhdGEoZnVuY3Rpb24gKGQ6YW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkLnZhbHVlcztcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZChcImdcIilcbiAgICAgICAgICAgICAgICAuYXR0cihcImNsYXNzXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICBkLmxpbmVOYW1lID0gZC5saW5lTmFtZS5zcGxpdCgnICcpLmpvaW4oJycpO1xuICAgICAgICAgICAgICAgICAgICBkLmxpbmVOYW1lID0gZC5saW5lTmFtZS5zcGxpdCgnLycpLmpvaW4oJycpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ3ZhbHVlIHZhbHVlLScgKyBkLmxpbmVOYW1lO1xuICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5hdHRyKFwidHJhbnNmb3JtXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJ0cmFuc2xhdGUoXCIgKyBsaW5lSUQoZC5rZXkpICsgXCIsMClcIjtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5vbignbW91c2VvdmVyJywgZnVuY3Rpb24oZCkge1xuICAgICAgICAgICAgICAgICAgICBkMy5zZWxlY3RBbGwoJy52YWx1ZScpLnN0eWxlKCdvcGFjaXR5JywgMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgZDMuc2VsZWN0QWxsKCcudmFsdWUtJyArIGQubGluZU5hbWUpLnN0eWxlKCdvcGFjaXR5JywgMSlcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5vbignbW91c2VvdXQnLCBmdW5jdGlvbihkKSB7XG4gICAgICAgICAgICAgICAgICAgIGQzLnNlbGVjdEFsbCgnLnZhbHVlJykuc3R5bGUoJ29wYWNpdHknLCAxKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIHJlY3RzID0gdmFsdWVzX2cuc2VsZWN0QWxsKCcucmVjdCcgKyBpbmRleClcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtkXTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5lbnRlcigpLmFwcGVuZChcInJlY3RcIilcbiAgICAgICAgICAgICAgICAuYXR0cihcImNsYXNzXCIsIFwicmVjdFwiKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwid2lkdGhcIiwgbGluZUlELnJhbmdlQmFuZCgpKVxuICAgICAgICAgICAgICAgIC5hdHRyKFwieVwiLCBmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHkoZC55KTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5hdHRyKFwiaGVpZ2h0XCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ3JhcGhTZXQuaGVpZ2h0IC0geShkLnkpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnN0eWxlKFwiZmlsbFwiLCBmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQuY29sb3JcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5zdHlsZShcIm9wYWNpdHlcIiwgMSk7XG5cbiAgICAgICAgICAgIGNhdGVnb3JpZXNfZy5zZWxlY3RBbGwoJy5yZWN0JylcbiAgICAgICAgICAgICAgICAuZGF0YShmdW5jdGlvbiAoZDphbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGQudmFsdWVzO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm9uKFwibW91c2VvdmVyXCIsIGZ1bmN0aW9uIChkOmFueSkge1xuICAgICAgICAgICAgICAgICAgICBkaXYudHJhbnNpdGlvbigpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc3R5bGUoXCJvcGFjaXR5XCIsIDAuOSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGl2Lmh0bWwoJzxzdHJvbmc+JyArIGQubmFtZSArICc8L3N0cm9uZz4nICsgXCI6IFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKyBcIjwvYnI+XCIgKyBkLm1lYXN1cmVtZW50ICsgJzwvYnI+JyArIGQueSArIFwiIFwiICsgZC55X3VuaXQgKyBcIjwvYnI+XCIgKyBcIiBAXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgXCIgXCIgKyBkLnggKyBcIiBob3Vyc1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnN0eWxlKFwibGVmdFwiLCAoKDxhbnk+ZDMuZXZlbnQpLnBhZ2VYKSArIFwicHhcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zdHlsZShcInRvcFwiLCAoKDxhbnk+ZDMuZXZlbnQpLnBhZ2VZIC0gMzApICsgXCJweFwiKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5vbihcIm1vdXNlb3V0XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgZGl2LnRyYW5zaXRpb24oKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnN0eWxlKFwib3BhY2l0eVwiLCAwKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vZ2V0IHdvcmQgbGVuZ3RoXG4gICAgICAgICAgICB3b3JkTGVuZ3RoID0gRURER3JhcGhpbmdUb29scy5nZXRTdW0odHlwZU5hbWVzKTtcblxuICAgICAgICAgICAgaWYgKHdvcmRMZW5ndGggPiA5MCAmJiB0eXBlICE9ICd4Jykge1xuICAgICAgICAgICAgICAgZDMuc2VsZWN0QWxsKHR5cGVJRFt0eXBlXSArICcgLnguYXhpcyB0ZXh0JykucmVtb3ZlKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh3b3JkTGVuZ3RoID4gMTUwICYmIHR5cGUgPT09ICd4Jykge1xuICAgICAgICAgICAgICAgZDMuc2VsZWN0QWxsKHR5cGVJRFt0eXBlXSArICcgLnguYXhpcyB0ZXh0JykucmVtb3ZlKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAkKCcjZ3JhcGhMb2FkaW5nJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogdGhpcyBmdW5jdGlvbiB0YWtlcyBpbiB0aGUgdHlwZSBvZiBtZWFzdXJlbWVudCwgc2VsZWN0b3JzIG9iaiwgc2VsZWN0b3IgdHlwZSBhbmRcbiAgICAgKiBidXR0b24gb2JqIGFuZCBzaG93cyB0aGUgbWVhc3VyZW1lbnQgZ3JhcGggaXMgdGhlIG1haW4gdHlwZSBpcyBwcm90ZW9taWNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzaG93UHJvdGVvbWljR3JhcGgodHlwZSwgc2VsZWN0b3JzLCBzZWxlY3RvciwgYnV0dG9ucykge1xuICAgICAgICBpZiAodHlwZSA9PT0ncCcpIHtcbiAgICAgICAgICAgIGQzLnNlbGVjdChzZWxlY3RvcnNbJ2xpbmUnXSkuc3R5bGUoJ2Rpc3BsYXknLCAnbm9uZScpO1xuICAgICAgICAgICAgZDMuc2VsZWN0KHNlbGVjdG9yc1snYmFyLW1lYXN1cmVtZW50J10pLnN0eWxlKCdkaXNwbGF5JywgJ2Jsb2NrJyk7XG4gICAgICAgICAgICAkKCdsYWJlbC5idG4nKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB2YXIgcmVjdHMgPSBkMy5zZWxlY3RBbGwoJy5ncm91cGVkTWVhc3VyZW1lbnQgcmVjdCcpWzBdO1xuICAgICAgICAgICAgc3ZnV2lkdGgoc2VsZWN0b3JzW3NlbGVjdG9yXSwgcmVjdHMpO1xuICAgICAgICAgICAgdmFyIGJ1dHRvbiA9ICAkKCcuZ3JvdXBCeU1lYXN1cmVtZW50QmFyJylbMF07XG4gICAgICAgICAgICAkKGJ1dHRvbnNbJ2Jhci10aW1lJ10pLnJlbW92ZUNsYXNzKCdoaWRkZW4nKTtcbiAgICAgICAgICAgICQoYnV0dG9uc1snYmFyLWxpbmUnXSkucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgJChidXR0b25zWydiYXItbWVhc3VyZW1lbnQnXSkucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgJChidXR0b24pLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoYnV0dG9uc1snYmFyLWVtcHR5J10pLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGxpbmVcbiAgICAgKiBAcGFyYW0gYXNzYXlcbiAgICAgKiBAcmV0dXJucyBjb2xvciBmb3IgbGluZS5cbiAgICAgKiB0aGlzIGZ1bmN0aW9uIHJldHVybnMgdGhlIGNvbG9yIGluIHRoZSBjb2xvciBxdWV1ZSBmb3Igc3R1ZGllcyA+MjIgbGluZXMuIEluc3RhbnRpYXRlZFxuICAgICAqIHdoZW4gdXNlciBjbGlja3Mgb24gYSBsaW5lLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoYW5nZUxpbmVDb2xvcihsaW5lLCBhc3NheSkge1xuXG4gICAgICAgIHZhciBjb2xvcjtcblxuICAgICAgICBpZigkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA9PT0gMSkge1xuICAgICAgICAgICAgY29sb3IgPSBsaW5lWydjb2xvciddO1xuICAgICAgICAgICAgbGluZVsnZG9Ob3RDaGFuZ2UnXSA9IHRydWU7XG4gICAgICAgICAgICBFRERHcmFwaGluZ1Rvb2xzLmNvbG9yUXVldWUoY29sb3IpO1xuICAgICAgICB9XG4gICAgICAgIGlmICgkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpICYmIHJlbWFrZU1haW5HcmFwaEFyZWFDYWxscyA+PSAxKSB7XG4gICAgICAgICAgICBpZiAobGluZVsnZG9Ob3RDaGFuZ2UnXSkge1xuICAgICAgICAgICAgICAgY29sb3IgPSBsaW5lWydjb2xvciddO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IEVEREdyYXBoaW5nVG9vbHMubmV4dENvbG9yO1xuICAgICAgICAgICAgICAgIGxpbmVbJ2RvTm90Q2hhbmdlJ10gPSB0cnVlO1xuICAgICAgICAgICAgICAgIGxpbmVbJ2NvbG9yJ10gPSBjb2xvcjtcbiAgICAgICAgICAgICAgICAvL3RleHQgbGFiZWwgbmV4dCB0byBjaGVja2JveFxuICAgICAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoJyMnICsgbGluZVsnaWRlbnRpZmllciddKS5uZXh0KCk7XG4gICAgICAgICAgICAgICAgLy91cGRhdGUgbGFiZWwgY29sb3IgdG8gbGluZSBjb2xvclxuICAgICAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICAgICAgRURER3JhcGhpbmdUb29scy5jb2xvclF1ZXVlKGNvbG9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICgkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkucHJvcCgnY2hlY2tlZCcpID09PSBmYWxzZSAmJiByZW1ha2VNYWluR3JhcGhBcmVhQ2FsbHMgPiAxICl7XG4gICAgICAgICAgICBjb2xvciA9IGNvbG9yT2JqW2Fzc2F5XTtcbiAgICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCcjJyArIGxpbmVbJ2lkZW50aWZpZXInXSkubmV4dCgpO1xuICAgICAgICAgICAgICAgIC8vdXBkYXRlIGxhYmVsIGNvbG9yIHRvIGxpbmUgY29sb3JcbiAgICAgICAgICAgICQobGFiZWwpLmNzcygnY29sb3InLCBjb2xvcik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVtYWtlTWFpbkdyYXBoQXJlYUNhbGxzID09IDApIHtcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JPYmpbYXNzYXldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb2xvcjtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGNsZWFyQXNzYXlGb3JtKCk6SlF1ZXJ5IHtcbiAgICAgICAgdmFyIGZvcm06SlF1ZXJ5ID0gJCgnI2Fzc2F5TWFpbicpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1hc3NheS1dJykubm90KCc6Y2hlY2tib3gsIDpyYWRpbycpLnZhbCgnJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWFzc2F5LV0nKS5maWx0ZXIoJzpjaGVja2JveCwgOnJhZGlvJykucHJvcCgnc2VsZWN0ZWQnLCBmYWxzZSk7XG4gICAgICAgIGZvcm0uZmluZCgnLmNhbmNlbC1saW5rJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmVycm9ybGlzdCcpLnJlbW92ZSgpO1xuICAgICAgICByZXR1cm4gZm9ybTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGZpbGxBc3NheUZvcm0oZm9ybSwgcmVjb3JkKSB7XG4gICAgICAgIHZhciB1c2VyID0gRURERGF0YS5Vc2Vyc1tyZWNvcmQuZXhwZXJpbWVudGVyXTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1hc3NheV9pZF0nKS52YWwocmVjb3JkLmlkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1uYW1lXScpLnZhbChyZWNvcmQubmFtZSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktZGVzY3JpcHRpb25dJykudmFsKHJlY29yZC5kZXNjcmlwdGlvbik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9YXNzYXktcHJvdG9jb2xdJykudmFsKHJlY29yZC5waWQpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWFzc2F5LWV4cGVyaW1lbnRlcl8wXScpLnZhbCh1c2VyICYmIHVzZXIudWlkID8gdXNlci51aWQgOiAnLS0nKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1hc3NheS1leHBlcmltZW50ZXJfMV0nKS52YWwocmVjb3JkLmV4cGVyaW1lbnRlcik7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZWRpdEFzc2F5KGluZGV4Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHZhciByZWNvcmQgPSBFREREYXRhLkFzc2F5c1tpbmRleF0sIGZvcm07XG4gICAgICAgIGlmICghcmVjb3JkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnSW52YWxpZCBBc3NheSByZWNvcmQgZm9yIGVkaXRpbmc6ICcgKyBpbmRleCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZm9ybSA9ICQoJyNhc3NheU1haW4nKTtcbiAgICAgICAgY2xlYXJBc3NheUZvcm0oKTtcbiAgICAgICAgZmlsbEFzc2F5Rm9ybShmb3JtLCByZWNvcmQpO1xuICAgICAgICBmb3JtLnJlbW92ZUNsYXNzKCdvZmYnKS5kaWFsb2coIFwib3BlblwiICk7XG4gICAgfVxufTtcblxuXG5cbmNsYXNzIERhdGFHcmlkQXNzYXlzIGV4dGVuZHMgRGF0YUdyaWQge1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRTcGVjKTtcbiAgICB9XG5cbiAgICBfZ2V0Q2xhc3NlcygpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnZGF0YVRhYmxlIHNvcnRhYmxlIGRyYWdib3hlcyBoYXN0YWJsZWNvbnRyb2xzIHRhYmxlLXN0cmlwZWQnO1xuICAgIH1cblxuICAgIGdldEN1c3RvbUNvbnRyb2xzQXJlYSgpOkhUTUxFbGVtZW50IHtcbiAgICAgICAgcmV0dXJuICQoJyN0YWJsZUNvbnRyb2xzQXJlYScpLmdldCgwKTtcbiAgICB9XG59XG5cblxuXG4vLyBFeHRlbmRpbmcgdGhlIHN0YW5kYXJkIEFzc2F5UmVjb3JkIHRvIGhvbGQgc29tZSBjbGllbnQtc2lkZSBjYWxjdWxhdGlvbnMuXG4vLyBUaGUgaWRlYSBpcywgdGhlc2Ugc3RhcnQgb3V0IHVuZGVmaW5lZCwgYW5kIGFyZSBjYWxjdWxhdGVkIG9uLWRlbWFuZC5cbmludGVyZmFjZSBBc3NheVJlY29yZEV4ZW5kZWQgZXh0ZW5kcyBBc3NheVJlY29yZCB7XG4gICAgbWF4WFZhbHVlOm51bWJlcjtcbn1cblxuXG4vLyBUaGUgc3BlYyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBEYXRhR3JpZCB0byBjcmVhdGUgdGhlIEFzc2F5cyB0YWJsZShzKVxuY2xhc3MgRGF0YUdyaWRTcGVjQXNzYXlzIGV4dGVuZHMgRGF0YUdyaWRTcGVjQmFzZSB7XG5cbiAgICBtZXRhRGF0YUlEc1VzZWRJbkFzc2F5czphbnk7XG4gICAgbWF4aW11bVhWYWx1ZUluRGF0YTpudW1iZXI7XG5cbiAgICBtZWFzdXJpbmdUaW1lc0hlYWRlclNwZWM6RGF0YUdyaWRIZWFkZXJTcGVjO1xuXG4gICAgZ3JhcGhPYmplY3Q6YW55O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuZ3JhcGhPYmplY3QgPSBudWxsO1xuICAgICAgICB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyA9IG51bGw7XG4gICAgfVxuXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5maW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpO1xuICAgICAgICB0aGlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkFzc2F5cygpO1xuICAgICAgICBzdXBlci5pbml0KCk7XG4gICAgfVxuXG4gICAgLy8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcbiAgICBnZXRSZWNvcmRJRHMoKTphbnlbXSB7XG4gICAgICAgIHZhciBsciA9IFN0dWR5RGF0YVBhZ2UucHJvZ3Jlc3NpdmVGaWx0ZXJpbmdXaWRnZXQubGFzdEZpbHRlcmluZ1Jlc3VsdHM7XG4gICAgICAgIGlmIChscikge1xuICAgICAgICAgICAgcmV0dXJuIGxyWydmaWx0ZXJlZEFzc2F5cyddO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGFuIG92ZXJyaWRlLiAgQ2FsbGVkIHdoZW4gYSBkYXRhIHJlc2V0IGlzIHRyaWdnZXJlZCwgYnV0IGJlZm9yZSB0aGUgdGFibGUgcm93cyBhcmVcbiAgICAvLyByZWJ1aWx0LlxuICAgIG9uRGF0YVJlc2V0KGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcblxuICAgICAgICB0aGlzLmZpbmRNYXhpbXVtWFZhbHVlSW5EYXRhKCk7XG4gICAgICAgIGlmICh0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYyAmJiB0aGlzLm1lYXN1cmluZ1RpbWVzSGVhZGVyU3BlYy5lbGVtZW50KSB7XG4gICAgICAgICAgICAkKHRoaXMubWVhc3VyaW5nVGltZXNIZWFkZXJTcGVjLmVsZW1lbnQpLmNoaWxkcmVuKCc6Zmlyc3QnKS50ZXh0KFxuICAgICAgICAgICAgICAgICAgICAnTWVhc3VyaW5nIFRpbWVzIChSYW5nZSAwIHRvICcgKyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEgKyAnKScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHVkeUFzc2F5c1RhYmxlJyk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ2Fzc2F5cycsIHtcbiAgICAgICAgICAgICdkZWZhdWx0U29ydCc6IDBcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmluZE1ldGFEYXRhSURzVXNlZEluQXNzYXlzKCkge1xuICAgICAgICB2YXIgc2Vlbkhhc2g6YW55ID0ge307XG4gICAgICAgIHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMgPSBbXTtcbiAgICAgICAgdGhpcy5nZXRSZWNvcmRJRHMoKS5mb3JFYWNoKChhc3NheUlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgYXNzYXkgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXTtcbiAgICAgICAgICAgICQuZWFjaChhc3NheS5tZXRhIHx8IHt9LCAobWV0YUlkKSA9PiB7IHNlZW5IYXNoW21ldGFJZF0gPSB0cnVlOyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIFtdLnB1c2guYXBwbHkodGhpcy5tZXRhRGF0YUlEc1VzZWRJbkFzc2F5cywgT2JqZWN0LmtleXMoc2Vlbkhhc2gpKTtcbiAgICB9XG5cbiAgICBmaW5kTWF4aW11bVhWYWx1ZUluRGF0YSgpOnZvaWQge1xuICAgICAgICB2YXIgbWF4Rm9yQWxsOm51bWJlciA9IDA7XG4gICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCByZWNvcmRzXG4gICAgICAgIG1heEZvckFsbCA9IHRoaXMuZ2V0UmVjb3JkSURzKCkucmVkdWNlKChwcmV2Om51bWJlciwgYXNzYXlJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5OkFzc2F5UmVjb3JkRXhlbmRlZCA9IDxBc3NheVJlY29yZEV4ZW5kZWQ+RURERGF0YS5Bc3NheXNbYXNzYXlJZF0sIG1lYXN1cmVzLCBtYXhGb3JSZWNvcmQ7XG4gICAgICAgICAgICAvLyBTb21lIGNhY2hpbmcgdG8gc3BlZWQgc3Vic2VxdWVudCBydW5zIHdheSB1cC4uLlxuICAgICAgICAgICAgaWYgKGFzc2F5Lm1heFhWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgbWF4Rm9yUmVjb3JkID0gYXNzYXkubWF4WFZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtZWFzdXJlcyA9IGFzc2F5Lm1lYXN1cmVzIHx8IFtdO1xuICAgICAgICAgICAgICAgIC8vIHJlZHVjZSB0byBmaW5kIGhpZ2hlc3QgdmFsdWUgYWNyb3NzIGFsbCBtZWFzdXJlc1xuICAgICAgICAgICAgICAgIG1heEZvclJlY29yZCA9IG1lYXN1cmVzLnJlZHVjZSgocHJldjpudW1iZXIsIG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbG9va3VwOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgfHwge30sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlOmFueSA9IGxvb2t1cFttZWFzdXJlSWRdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4Rm9yTWVhc3VyZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVkdWNlIHRvIGZpbmQgaGlnaGVzdCB2YWx1ZSBhY3Jvc3MgYWxsIGRhdGEgaW4gbWVhc3VyZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgbWF4Rm9yTWVhc3VyZSA9IChtZWFzdXJlLnZhbHVlcyB8fCBbXSkucmVkdWNlKChwcmV2Om51bWJlciwgcG9pbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChwcmV2LCBwb2ludFswXVswXSk7XG4gICAgICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgocHJldiwgbWF4Rm9yTWVhc3VyZSk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICAgICAgYXNzYXkubWF4WFZhbHVlID0gbWF4Rm9yUmVjb3JkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByZXYsIG1heEZvclJlY29yZCk7XG4gICAgICAgIH0sIDApO1xuICAgICAgICAvLyBBbnl0aGluZyBhYm92ZSAwIGlzIGFjY2VwdGFibGUsIGJ1dCAwIHdpbGwgZGVmYXVsdCBpbnN0ZWFkIHRvIDEuXG4gICAgICAgIHRoaXMubWF4aW11bVhWYWx1ZUluRGF0YSA9IG1heEZvckFsbCB8fCAxO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEFzc2F5TmFtZShpbmRleDphbnkpOnN0cmluZyB7XG4gICAgICAgIC8vIEluIGFuIG9sZCB0eXBpY2FsIEVERERhdGEuQXNzYXlzIHJlY29yZCB0aGlzIHN0cmluZyBpcyBjdXJyZW50bHkgcHJlLWFzc2VtYmxlZCBhbmQgc3RvcmVkXG4gICAgICAgIC8vIGluICdmbicuIEJ1dCB3ZSdyZSBwaGFzaW5nIHRoYXQgb3V0LiBFdmVudHVhbGx5IHRoZSBuYW1lIHdpbGwganVzdCBiZSAubmFtZSwgd2l0aG91dFxuICAgICAgICAvLyBkZWNvcmF0aW9uLlxuICAgICAgICB2YXIgYXNzYXksIGxpbmUsIHByb3RvY29sTmFtaW5nO1xuICAgICAgICBpZiAoKGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgcmV0dXJuIGFzc2F5Lm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkTGluZU5hbWUoaW5kZXg6IGFueSk6IHN0cmluZyB7XG4gICAgICAgIHZhciBhc3NheSwgbGluZTtcbiAgICAgICAgaWYgKChhc3NheSA9IEVERERhdGEuQXNzYXlzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbGluZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OmFueSk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGFzc2F5LCBleHBlcmltZW50ZXI7XG4gICAgICAgIGlmICgoYXNzYXkgPSBFREREYXRhLkFzc2F5c1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbYXNzYXkuZXhwXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXhwZXJpbWVudGVyLmluaXRpYWxzLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRBc3NheU1vZGlmaWNhdGlvbihpbmRleDphbnkpOm51bWJlciB7XG4gICAgICAgIHJldHVybiBFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kO1xuICAgIH1cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSBoZWFkZXJzIGFsb25nIHRoZSB0b3Agb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgLy8gbWFwIGFsbCBtZXRhZGF0YSBJRHMgdG8gSGVhZGVyU3BlYyBvYmplY3RzXG4gICAgICAgIHZhciBtZXRhRGF0YUhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluQXNzYXlzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICB2YXIgbWRUeXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIgKyBpbmRleCwgJ2hBc3NheXNNZXRhaWQnICsgaWQsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6IG1kVHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLm1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZCksXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUaGUgbGVmdCBzZWN0aW9uIG9mIHRoZSB0YWJsZSBoYXMgQXNzYXkgTmFtZSBhbmQgTGluZSAoTmFtZSlcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkSGVhZGVyU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygxLCAnaEFzc2F5c05hbWUnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQXNzYXkgTmFtZScsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEFzc2F5TmFtZVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDIsICdoQXNzYXlMaW5lTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMaW5lJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU5hbWVcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gT2Zmc2V0cyBmb3IgdGhlIHJpZ2h0IHNpZGUgb2YgdGhlIHRhYmxlIGRlcGVuZHMgb24gc2l6ZSBvZiB0aGUgcHJlY2VkaW5nIHNlY3Rpb25zXG4gICAgICAgIHZhciByaWdodE9mZnNldCA9IGxlZnRTaWRlLmxlbmd0aCArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGg7XG4gICAgICAgIHZhciByaWdodFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKCsrcmlnaHRPZmZzZXQsICdoQXNzYXlzTU5hbWUnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTWVhc3VyZW1lbnQnLFxuICAgICAgICAgICAgICAgICdoZWFkZXJSb3cnOiAyXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoKytyaWdodE9mZnNldCwgJ2hBc3NheXNVbml0cycsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdVbml0cycsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDJcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygrK3JpZ2h0T2Zmc2V0LCAnaEFzc2F5c0NvdW50Jywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NvdW50JyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMlxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAvLyBUaGUgbWVhc3VyZW1lbnQgdGltZXMgYXJlIHJlZmVyZW5jZWQgZWxzZXdoZXJlLCBzbyBhcmUgc2F2ZWQgdG8gdGhlIG9iamVjdFxuICAgICAgICAgICAgdGhpcy5tZWFzdXJpbmdUaW1lc0hlYWRlclNwZWMgPSBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKFxuICAgICAgICAgICAgICAgICsrcmlnaHRPZmZzZXQsXG4gICAgICAgICAgICAgICAgJ2hBc3NheXNDb3VudCcsXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAnbmFtZSc6ICdNZWFzdXJpbmcgVGltZXMnLFxuICAgICAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKCsrcmlnaHRPZmZzZXQsICdoQXNzYXlzRXhwZXJpbWVudGVyJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0V4cGVyaW1lbnRlcicsXG4gICAgICAgICAgICAgICAgJ2hlYWRlclJvdyc6IDIsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZEV4cGVyaW1lbnRlckluaXRpYWxzLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAxXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoKytyaWdodE9mZnNldCwgJ2hBc3NheXNNb2RpZmllZCcsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAnaGVhZGVyUm93JzogMixcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQXNzYXlNb2RpZmljYXRpb24sXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDFcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGxlZnRTaWRlLmNvbmNhdChtZXRhRGF0YUhlYWRlcnMsIHJpZ2h0U2lkZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBtYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChpKSA9PiB7XG4gICAgICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaV07XG4gICAgICAgICAgICBpZiAocmVjb3JkICYmIHJlY29yZC5tZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZC5tZXRhW2lkXSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRoZSBjb2xzcGFuIHZhbHVlIGZvciBhbGwgdGhlIGNlbGxzIHRoYXQgYXJlIGFzc2F5LWxldmVsIChub3QgbWVhc3VyZW1lbnQtbGV2ZWwpIGlzIGJhc2VkIG9uXG4gICAgLy8gdGhlIG51bWJlciBvZiBtZWFzdXJlbWVudHMgZm9yIHRoZSByZXNwZWN0aXZlIHJlY29yZC4gU3BlY2lmaWNhbGx5LCBpdCdzIHRoZSBudW1iZXIgb2ZcbiAgICAvLyBtZXRhYm9saXRlIGFuZCBnZW5lcmFsIG1lYXN1cmVtZW50cywgcGx1cyAxIGlmIHRoZXJlIGFyZSB0cmFuc2NyaXB0b21pY3MgbWVhc3VyZW1lbnRzLCBwbHVzIDEgaWYgdGhlcmVcbiAgICAvLyBhcmUgcHJvdGVvbWljcyBtZWFzdXJlbWVudHMsIGFsbCBhZGRlZCB0b2dldGhlci4gIChPciAxLCB3aGljaGV2ZXIgaXMgaGlnaGVyLilcbiAgICBwcml2YXRlIHJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpOm51bWJlciB7XG4gICAgICAgIHZhciByZWMgPSBFREREYXRhLkFzc2F5c1tpbmRleF07XG4gICAgICAgIHZhciB2Om51bWJlciA9ICgocmVjLmdlbmVyYWwgICAgICAgICB8fCBbXSkubGVuZ3RoICtcbiAgICAgICAgICAgICAgICAgICAgICAgIChyZWMubWV0YWJvbGl0ZXMgICAgIHx8IFtdKS5sZW5ndGggK1xuICAgICAgICAgICAgICAgICAgICAgICAgKChyZWMudHJhbnNjcmlwdGlvbnMgfHwgW10pLmxlbmd0aCA/IDEgOiAwKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAoKHJlYy5wcm90ZWlucyAgICAgICB8fCBbXSkubGVuZ3RoID8gMSA6IDApICAgKSB8fCAxO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUFzc2F5TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBsaW5lID0gRURERGF0YS5MaW5lc1tyZWNvcmQubGlkXTtcbiAgICAgICAgdmFyIHNpZGVNZW51SXRlbXMgPSBbXG4gICAgICAgICAgICAnPGEgY2xhc3M9XCJhc3NheS1lZGl0LWxpbmtcIiBvbmNsaWNrPVwiU3R1ZHlEYXRhUGFnZS5lZGl0QXNzYXkoWycgKyBpbmRleCArICddKVwiPkVkaXQgQXNzYXk8L2E+JyxcbiAgICAgICAgICAgICc8YSBocmVmPVwiL2V4cG9ydD9hc3NheUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBDU1Y8L2E+J1xuICAgICAgICBdO1xuXG4gICAgICAgIC8vIFNldCB1cCBqUXVlcnkgbW9kYWxzXG4gICAgICAgICQoXCIjYXNzYXlNYWluXCIpLmRpYWxvZyh7IG1pbldpZHRoOiA1MDAsIGF1dG9PcGVuOiBmYWxzZSB9KTtcblxuICAgICAgICAvLyBUT0RPIHdlIHByb2JhYmx5IGRvbid0IHdhbnQgdG8gc3BlY2lhbC1jYXNlIGxpa2UgdGhpcyBieSBuYW1lXG4gICAgICAgIGlmIChFREREYXRhLlByb3RvY29sc1tyZWNvcmQucGlkXS5uYW1lID09IFwiVHJhbnNjcmlwdG9taWNzXCIpIHtcbiAgICAgICAgICAgIHNpZGVNZW51SXRlbXMucHVzaCgnPGEgaHJlZj1cImltcG9ydC9ybmFzZXEvZWRnZXBybz9hc3NheT0nK2luZGV4KydcIj5JbXBvcnQgUk5BLXNlcSBkYXRhIGZyb20gRURHRS1wcm88L2E+Jyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnYXNzYXlJZCcsXG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKGlkKSA9PiB7IHJldHVybiAnYXNzYXknICsgaWQgKyAnaW5jbHVkZSc7IH0sXG4gICAgICAgICAgICAgICAgJ3NpZGVNZW51SXRlbXMnOiBzaWRlTWVudUl0ZW1zLFxuICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHJlY29yZC5uYW1lXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTGluZU5hbWVDZWxscyhncmlkU3BlYzogRGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDogc3RyaW5nKTogRGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHJlY29yZCA9IEVERERhdGEuQXNzYXlzW2luZGV4XSwgbGluZSA9IEVERERhdGEuTGluZXNbcmVjb3JkLmxpZF07XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogbGluZS5uYW1lXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIG1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdID0+IHtcbiAgICAgICAgICAgIHZhciBjb250ZW50U3RyID0gJycsIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCB0eXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIGlmIChhc3NheSAmJiB0eXBlICYmIGFzc2F5Lm1ldGEgJiYgKGNvbnRlbnRTdHIgPSBhc3NheS5tZXRhW2lkXSB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50U3RyID0gWyB0eXBlLnByZSB8fCAnJywgY29udGVudFN0ciwgdHlwZS5wb3N0Zml4IHx8ICcnIF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudFN0clxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZU1lYXN1cmVtZW50Q2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcsXG4gICAgICAgICAgICBvcHQ6YW55KTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgcmVjb3JkID0gRURERGF0YS5Bc3NheXNbaW5kZXhdLCBjZWxscyA9IFtdLFxuICAgICAgICAgICAgZmFjdG9yeSA9ICgpOkRhdGFHcmlkRGF0YUNlbGwgPT4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4KTtcblxuICAgICAgICBpZiAoKHJlY29yZC5tZXRhYm9saXRlcyB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyAncm93c3Bhbic6IHJlY29yZC5tZXRhYm9saXRlcy5sZW5ndGggfSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb252ZXJ0IElEcyB0byBtZWFzdXJlbWVudHMsIHNvcnQgYnkgbmFtZSwgdGhlbiBjb252ZXJ0IHRvIGNlbGwgb2JqZWN0c1xuICAgICAgICAgICAgICAgIGNlbGxzID0gcmVjb3JkLm1ldGFib2xpdGVzLm1hcChvcHQubWV0YWJvbGl0ZVRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAuc29ydChvcHQubWV0YWJvbGl0ZVZhbHVlU29ydClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAob3B0Lm1ldGFib2xpdGVWYWx1ZVRvQ2VsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKChyZWNvcmQuZ2VuZXJhbCB8fCBbXSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICB7ICdyb3dzcGFuJzogcmVjb3JkLmdlbmVyYWwubGVuZ3RoIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udmVydCBJRHMgdG8gbWVhc3VyZW1lbnRzLCBzb3J0IGJ5IG5hbWUsIHRoZW4gY29udmVydCB0byBjZWxsIG9iamVjdHNcbiAgICAgICAgICAgICAgICBjZWxscyA9IHJlY29yZC5nZW5lcmFsLm1hcChvcHQubWV0YWJvbGl0ZVRvVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KG9wdC5tZXRhYm9saXRlVmFsdWVTb3J0KVxuICAgICAgICAgICAgICAgICAgICAubWFwKG9wdC5tZXRhYm9saXRlVmFsdWVUb0NlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIG9ubHkgb25lIGNlbGwgaWYgdGhlcmUgaXMgYW55IHRyYW5zY3JpcHRvbWljcyBkYXRhXG4gICAgICAgIGlmICgocmVjb3JkLnRyYW5zY3JpcHRpb25zIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChuZXcgRGF0YUdyaWRMb2FkaW5nQ2VsbChncmlkU3BlYywgaW5kZXgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChvcHQudHJhbnNjcmlwdFRvQ2VsbChyZWNvcmQudHJhbnNjcmlwdGlvbnMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBnZW5lcmF0ZSBvbmx5IG9uZSBjZWxsIGlmIHRoZXJlIGlzIGFueSBwcm90ZW9taWNzIGRhdGFcbiAgICAgICAgaWYgKChyZWNvcmQucHJvdGVpbnMgfHwgW10pLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmIChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG5ldyBEYXRhR3JpZExvYWRpbmdDZWxsKGdyaWRTcGVjLCBpbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjZWxscy5wdXNoKG9wdC5wcm90ZWluVG9DZWxsKHJlY29yZC5wcm90ZWlucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGdlbmVyYXRlIGEgbG9hZGluZyBjZWxsIGlmIG5vbmUgY3JlYXRlZCBieSBtZWFzdXJlbWVudHNcbiAgICAgICAgaWYgKCFjZWxscy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmIChyZWNvcmQuY291bnQpIHtcbiAgICAgICAgICAgICAgICAvLyB3ZSBoYXZlIGEgY291bnQsIGJ1dCBubyBkYXRhIHlldDsgc3RpbGwgbG9hZGluZ1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gobmV3IERhdGFHcmlkTG9hZGluZ0NlbGwoZ3JpZFNwZWMsIGluZGV4KSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5lbXB0eSkge1xuICAgICAgICAgICAgICAgIGNlbGxzLnB1c2gob3B0LmVtcHR5LmNhbGwoe30pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2VsbHMucHVzaChmYWN0b3J5KCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjZWxscztcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU1lYXN1cmVtZW50TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gZ3JpZFNwZWMuZ2VuZXJhdGVNZWFzdXJlbWVudENlbGxzKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgJ21ldGFib2xpdGVUb1ZhbHVlJzogKG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgbXR5cGU6YW55ID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIHZhbHVlLmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbWVhc3VyZW1lbnRJZCcsXG4gICAgICAgICAgICAgICAgICAgICdjaGVja2JveFdpdGhJRCc6ICgpID0+IHsgcmV0dXJuICdtZWFzdXJlbWVudCcgKyB2YWx1ZS5pZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB2YWx1ZS5uYW1lXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnVHJhbnNjcmlwdG9taWNzIERhdGEnXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3Byb3RlaW5Ub0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnUHJvdGVvbWljcyBEYXRhJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZW1wdHlcIjogKCkgPT4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnPGk+Tm8gTWVhc3VyZW1lbnRzPC9pPidcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdlbmVyYXRlVW5pdHNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICB1bml0OmFueSA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmUueV91bml0c10gfHwge307XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgJ25hbWUnOiBtdHlwZS5uYW1lIHx8ICcnLCAnaWQnOiBtZWFzdXJlSWQsICd1bml0JzogdW5pdC5uYW1lIHx8ICcnIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ21ldGFib2xpdGVWYWx1ZVNvcnQnOiAoYTphbnksIGI6YW55KSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBhLm5hbWUudG9Mb3dlckNhc2UoKSwgeiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiAoPGFueT4oeSA+IHopIC0gPGFueT4oeiA+IHkpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlVG9DZWxsJzogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHZhbHVlLnVuaXRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAndHJhbnNjcmlwdFRvQ2VsbCc6IChpZHM6YW55W10pID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6ICdSUEtNJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJycgLy8gVE9ETzogd2hhdCBhcmUgcHJvdGVvbWljcyBtZWFzdXJlbWVudCB1bml0cz9cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVDb3VudENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICAvLyBmdW5jdGlvbiB0byB1c2UgaW4gQXJyYXkjcmVkdWNlIHRvIGNvdW50IGFsbCB0aGUgdmFsdWVzIGluIGEgc2V0IG9mIG1lYXN1cmVtZW50c1xuICAgICAgICB2YXIgcmVkdWNlQ291bnQgPSAocHJldjpudW1iZXIsIG1lYXN1cmVJZCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1lYXN1cmU6YW55ID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdIHx8IHt9O1xuICAgICAgICAgICAgcmV0dXJuIHByZXYgKyAobWVhc3VyZS52YWx1ZXMgfHwgW10pLmxlbmd0aDtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAnbWVhc3VyZSc6IG1lYXN1cmUgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnKCcsICh2YWx1ZS5tZWFzdXJlLnZhbHVlcyB8fCBbXSkubGVuZ3RoLCAnKSddLmpvaW4oJycpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3RyYW5zY3JpcHRUb0NlbGwnOiAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJygnLCBpZHMucmVkdWNlKHJlZHVjZUNvdW50LCAwKSwgJyknXS5qb2luKCcnKVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdwcm90ZWluVG9DZWxsJzogKGlkczphbnlbXSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBbICcoJywgaWRzLnJlZHVjZShyZWR1Y2VDb3VudCwgMCksICcpJ10uam9pbignJylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVNZWFzdXJpbmdUaW1lc0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0Fzc2F5cywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgc3ZnQ2VsbEZvclRpbWVDb3VudHMgPSAoaWRzOmFueVtdKSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnNvbGlkYXRlZCwgc3ZnID0gJycsIHRpbWVDb3VudCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vIGNvdW50IHZhbHVlcyBhdCBlYWNoIHggZm9yIGFsbCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgICAgICBpZHMuZm9yRWFjaCgobWVhc3VyZUlkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOmFueSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSB8fCB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50czpudW1iZXJbXVtdW10gPSBtZWFzdXJlLnZhbHVlcyB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRzLmZvckVhY2goKHBvaW50Om51bWJlcltdW10pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVDb3VudFtwb2ludFswXVswXV0gPSB0aW1lQ291bnRbcG9pbnRbMF1bMF1dIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUeXBlc2NyaXB0IGNvbXBpbGVyIGRvZXMgbm90IGxpa2UgdXNpbmcgaW5jcmVtZW50IG9wZXJhdG9yIG9uIGV4cHJlc3Npb25cbiAgICAgICAgICAgICAgICAgICAgICAgICsrdGltZUNvdW50W3BvaW50WzBdWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gbWFwIHRoZSBjb3VudHMgdG8gW3gsIHldIHR1cGxlc1xuICAgICAgICAgICAgICAgIGNvbnNvbGlkYXRlZCA9ICQubWFwKHRpbWVDb3VudCwgKHZhbHVlLCBrZXkpID0+IFtbIFtwYXJzZUZsb2F0KGtleSldLCBbdmFsdWVdIF1dKTtcbiAgICAgICAgICAgICAgICAvLyBnZW5lcmF0ZSBTVkcgc3RyaW5nXG4gICAgICAgICAgICAgICAgaWYgKGNvbnNvbGlkYXRlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc3ZnID0gZ3JpZFNwZWMuYXNzZW1ibGVTVkdTdHJpbmdGb3JEYXRhUG9pbnRzKGNvbnNvbGlkYXRlZCwgJycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN2Z1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGdyaWRTcGVjLmdlbmVyYXRlTWVhc3VyZW1lbnRDZWxscyhncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICdtZXRhYm9saXRlVG9WYWx1ZSc6IChtZWFzdXJlSWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTphbnkgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0gfHwge30sXG4gICAgICAgICAgICAgICAgICAgIG10eXBlOmFueSA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7ICduYW1lJzogbXR5cGUubmFtZSB8fCAnJywgJ2lkJzogbWVhc3VyZUlkLCAnbWVhc3VyZSc6IG1lYXN1cmUgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnbWV0YWJvbGl0ZVZhbHVlU29ydCc6IChhOmFueSwgYjphbnkpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpLCB6ID0gYi5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICg8YW55Pih5ID4geikgLSA8YW55Pih6ID4geSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdtZXRhYm9saXRlVmFsdWVUb0NlbGwnOiAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZSA9IHZhbHVlLm1lYXN1cmUgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdCA9IG1lYXN1cmUuZm9ybWF0ID09PSAxID8gJ2NhcmJvbicgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRzID0gdmFsdWUubWVhc3VyZS52YWx1ZXMgfHwgW10sXG4gICAgICAgICAgICAgICAgICAgIHN2ZyA9IGdyaWRTcGVjLmFzc2VtYmxlU1ZHU3RyaW5nRm9yRGF0YVBvaW50cyhwb2ludHMsIGZvcm1hdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN2Z1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICd0cmFuc2NyaXB0VG9DZWxsJzogc3ZnQ2VsbEZvclRpbWVDb3VudHMsXG4gICAgICAgICAgICAncHJvdGVpblRvQ2VsbCc6IHN2Z0NlbGxGb3JUaW1lQ291bnRzXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdlbmVyYXRlRXhwZXJpbWVudGVyQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjQXNzYXlzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBleHAgPSBFREREYXRhLkFzc2F5c1tpbmRleF0uZXhwO1xuICAgICAgICB2YXIgdVJlY29yZCA9IEVERERhdGEuVXNlcnNbZXhwXTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiB1UmVjb3JkID8gdVJlY29yZC5pbml0aWFscyA6ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNBc3NheXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyhFREREYXRhLkFzc2F5c1tpbmRleF0ubW9kKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBhc3NlbWJsZVNWR1N0cmluZ0ZvckRhdGFQb2ludHMocG9pbnRzLCBmb3JtYXQ6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgc3ZnID0gJzxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZlcnNpb249XCIxLjJcIiB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMHB4XCJcXFxuICAgICAgICAgICAgICAgICAgICB2aWV3Qm94PVwiMCAwIDQ3MCAxMFwiIHByZXNlcnZlQXNwZWN0UmF0aW89XCJub25lXCI+XFxcbiAgICAgICAgICAgICAgICA8c3R5bGUgdHlwZT1cInRleHQvY3NzXCI+PCFbQ0RBVEFbXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jUCB7IHN0cm9rZTpyZ2JhKDAsMCwwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY1YgeyBzdHJva2U6cmdiYSgwLDAsMjMwLDEpOyBzdHJva2Utd2lkdGg6NHB4OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgfVxcXG4gICAgICAgICAgICAgICAgICAgICAgICAuY0UgeyBzdHJva2U6cmdiYSgyNTUsMTI4LDAsMSk7IHN0cm9rZS13aWR0aDo0cHg7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyB9XFxcbiAgICAgICAgICAgICAgICAgICAgXV0+PC9zdHlsZT5cXFxuICAgICAgICAgICAgICAgIDxwYXRoIGZpbGw9XCJyZ2JhKDAsMCwwLDAuMC4wNSlcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2U9XCJyZ2JhKDAsMCwwLDAuMDUpXCJcXFxuICAgICAgICAgICAgICAgICAgICAgICAgZD1cIk0xMCw1aDQ1MFwiXFxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPVwic3Ryb2tlLXdpZHRoOjJweDtcIlxcXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2Utd2lkdGg9XCIyXCI+PC9wYXRoPic7XG4gICAgICAgIHZhciBwYXRocyA9IFsgc3ZnIF07XG4gICAgICAgIHBvaW50cy5zb3J0KChhLGIpID0+IHsgcmV0dXJuIGFbMF0gLSBiWzBdOyB9KS5mb3JFYWNoKChwb2ludCkgPT4ge1xuICAgICAgICAgICAgdmFyIHggPSBwb2ludFswXVswXSxcbiAgICAgICAgICAgICAgICB5ID0gcG9pbnRbMV1bMF0sXG4gICAgICAgICAgICAgICAgcnggPSAoKHggLyB0aGlzLm1heGltdW1YVmFsdWVJbkRhdGEpICogNDUwKSArIDEwLFxuICAgICAgICAgICAgICAgIHR0ID0gW3ksICcgYXQgJywgeCwgJ2gnXS5qb2luKCcnKTtcbiAgICAgICAgICAgIHBhdGhzLnB1c2goWyc8cGF0aCBjbGFzcz1cImNFXCIgZD1cIk0nLCByeCwgJyw1djRcIj48L3BhdGg+J10uam9pbignJykpO1xuICAgICAgICAgICAgaWYgKHkgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjRVwiIGQ9XCJNJywgcngsICcsMnY2XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwYXRocy5wdXNoKFsnPHBhdGggY2xhc3M9XCJjUFwiIGQ9XCJNJywgcngsICcsMXY0XCI+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIGlmIChmb3JtYXQgPT09ICdjYXJib24nKSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1ZcIiBkPVwiTScsIHJ4LCAnLDF2OFwiPjx0aXRsZT4nLCB0dCwgJzwvdGl0bGU+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGF0aHMucHVzaChbJzxwYXRoIGNsYXNzPVwiY1BcIiBkPVwiTScsIHJ4LCAnLDF2OFwiPjx0aXRsZT4nLCB0dCwgJzwvdGl0bGU+PC9wYXRoPiddLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHBhdGhzLnB1c2goJzwvc3ZnPicpO1xuICAgICAgICByZXR1cm4gcGF0aHMuam9pbignXFxuJyk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZGF0YSBjb2x1bW5zIHRoYXQgd2lsbCBtYWtlIHVwIHRoZSBib2R5IG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIG1ldGFEYXRhQ29sczpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIHJpZ2h0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIGNvdW50ZXI6bnVtYmVyID0gMDtcblxuICAgICAgICBsZWZ0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlQXNzYXlOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKVxuICAgICAgICBdO1xuXG4gICAgICAgIG1ldGFEYXRhQ29scyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLm1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVNZWFzdXJlbWVudE5hbWVDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZVVuaXRzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygrK2NvdW50ZXIsIHRoaXMuZ2VuZXJhdGVDb3VudENlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlTWVhc3VyaW5nVGltZXNDZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKCsrY291bnRlciwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoKytjb3VudGVyLCB0aGlzLmdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFDb2xzLCByaWdodFNpZGUpO1xuICAgIH1cblxuICAgIC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG4gICAgZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSB7XG4gICAgICAgIHZhciB0b3BTZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ05hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMaW5lJywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHZhciBtZXRhRGF0YUNvbEdyb3VwczpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdO1xuICAgICAgICBtZXRhRGF0YUNvbEdyb3VwcyA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5Bc3NheXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmVtZW50JywgeyAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnVW5pdHMnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDb3VudCcsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ01lYXN1cmluZyBUaW1lcycsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIGhlYWRlciB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuXG4gICAgLy8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIEEgXCJzZWxlY3QgYWxsIC8gc2VsZWN0IG5vbmVcIiBidXR0b25cbiAgICAgICAgdmFyIHNlbGVjdEFsbFdpZGdldCA9IG5ldyBER1NlbGVjdEFsbEFzc2F5c01lYXN1cmVtZW50c1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNlbGVjdEFsbFdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlbGVjdEFsbFdpZGdldCk7XG5cbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBnZW5lcmF0ZSB0aGUgYXJyYXkgb2YgY3VzdG9tIG9wdGlvbnMgbWVudSB3aWRnZXRzLlxuICAgIC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LlxuICAgIC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuICAgIGNyZWF0ZUN1c3RvbU9wdGlvbnNXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZE9wdGlvbldpZGdldFtdIHtcbiAgICAgICAgdmFyIHdpZGdldFNldDpEYXRhR3JpZE9wdGlvbldpZGdldFtdID0gW107XG4gICAgICAgIHZhciBkaXNhYmxlZEFzc2F5c1dpZGdldCA9IG5ldyBER0Rpc2FibGVkQXNzYXlzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgdmFyIGVtcHR5QXNzYXlzV2lkZ2V0ID0gbmV3IERHRW1wdHlBc3NheXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZEFzc2F5c1dpZGdldCk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGVtcHR5QXNzYXlzV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG4gICAgb25Jbml0aWFsaXplZChkYXRhR3JpZDpEYXRhR3JpZEFzc2F5cyk6dm9pZCB7XG5cbiAgICAgICAgLy8gV2lyZSB1cCB0aGUgJ2FjdGlvbiBwYW5lbHMnIGZvciB0aGUgQXNzYXlzIHNlY3Rpb25zXG4gICAgICAgIHZhciB0YWJsZSA9IHRoaXMuZ2V0VGFibGVFbGVtZW50KCk7XG4gICAgICAgICQodGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gU3R1ZHlEYXRhUGFnZS5xdWV1ZUFjdGlvblBhbmVsUmVmcmVzaCgpKTtcblxuICAgICAgICAvLyBSdW4gaXQgb25jZSBpbiBjYXNlIHRoZSBwYWdlIHdhcyBnZW5lcmF0ZWQgd2l0aCBjaGVja2VkIEFzc2F5c1xuICAgICAgICBTdHVkeURhdGFQYWdlLnF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCk7XG4gICAgfVxufVxuXG5cbi8vIEEgc2xpZ2h0bHkgbW9kaWZpZWQgXCJTZWxlY3QgQWxsXCIgaGVhZGVyIHdpZGdldFxuLy8gdGhhdCB0cmlnZ2VycyBhIHJlZnJlc2ggb2YgdGhlIGFjdGlvbnMgcGFuZWwgd2hlbiBpdCBjaGFuZ2VzIHRoZSBjaGVja2JveCBzdGF0ZS5cbmNsYXNzIERHU2VsZWN0QWxsQXNzYXlzTWVhc3VyZW1lbnRzV2lkZ2V0IGV4dGVuZHMgREdTZWxlY3RBbGxXaWRnZXQge1xuXG4gICAgY2xpY2tIYW5kbGVyKCk6dm9pZCB7XG4gICAgICAgIHN1cGVyLmNsaWNrSGFuZGxlcigpO1xuICAgICAgICBTdHVkeURhdGFQYWdlLnF1ZXVlQWN0aW9uUGFuZWxSZWZyZXNoKCk7XG4gICAgIH1cbn1cblxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIEFzc2F5cyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkQXNzYXlzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgLy8gUmV0dXJuIGEgZnJhZ21lbnQgdG8gdXNlIGluIGdlbmVyYXRpbmcgb3B0aW9uIHdpZGdldCBJRHNcbiAgICBnZXRJREZyYWdtZW50KHVuaXF1ZUlEKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1RhYmxlU2hvd0RBc3NheXNDQic7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIHRleHQgdXNlZCB0byBsYWJlbCB0aGUgd2lkZ2V0XG4gICAgZ2V0TGFiZWxUZXh0KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdTaG93IERpc2FibGVkJztcbiAgICB9XG5cbiAgICBnZXRMYWJlbFRpdGxlKCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIFwiU2hvdyBhc3NheXMgdGhhdCBoYXZlIGJlZW4gZGlzYWJsZWQuXCI7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJucyB0cnVlIGlmIHRoZSBjb250cm9sIHNob3VsZCBiZSBlbmFibGVkIGJ5IGRlZmF1bHRcbiAgICBpc0VuYWJsZWRCeURlZmF1bHQoKTpib29sZWFuIHtcbiAgICAgICAgcmV0dXJuICEhKCQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIGFjdGl2YXRpb24gb2Ygd2lkZ2V0XG4gICAgb25XaWRnZXRDaGFuZ2UoZSk6dm9pZCB7XG4gICAgICAgIHZhciBhbUlDaGVja2VkOmJvb2xlYW4gPSAhISh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKTtcbiAgICAgICAgdmFyIGlzT3RoZXJDaGVja2VkOmJvb2xlYW4gPSAkKCcjZmlsdGVyaW5nU2hvd0Rpc2FibGVkQ2hlY2tib3gnKS5wcm9wKCdjaGVja2VkJyk7XG4gICAgICAgICQoJyNmaWx0ZXJpbmdTaG93RGlzYWJsZWRDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnLCBhbUlDaGVja2VkKTtcbiAgICAgICAgaWYgKGFtSUNoZWNrZWQgIT0gaXNPdGhlckNoZWNrZWQpIHtcbiAgICAgICAgICAgIFN0dWR5RGF0YVBhZ2UucXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FsbCB0aGUgc3VwZXJjbGFzcyB2ZXJzaW9uIG9mIHRoaXMgZnVuY3Rpb24gYmVjYXVzZSB3ZSBkb24ndFxuICAgICAgICAvLyB3YW50IHRvIHRyaWdnZXIgYSBjYWxsIHRvIGFycmFuZ2VUYWJsZURhdGFSb3dzIGp1c3QgeWV0LlxuICAgICAgICAvLyBUaGUgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlIGZ1bmN0aW9uIHdpbGwgZG8gaXQgZm9yIHVzLCBhZnRlclxuICAgICAgICAvLyByZWJ1aWxkaW5nIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbi5cbiAgICB9XG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIHZhciBjaGVja2VkOmJvb2xlYW4gPSAhISh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKTtcbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAoY2hlY2tlZCAmJiByb3dJRHMgJiYgRURERGF0YS5jdXJyZW50U3R1ZHlXcml0YWJsZSkge1xuICAgICAgICAgICAgJChcIiNlbmFibGVCdXR0b25cIikucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJChcIiNlbmFibGVCdXR0b25cIikuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBkaXNhYmxlZFJvd3MgPSAkKCcuZGlzYWJsZWRSZWNvcmQnKTtcblxuICAgICAgICB2YXIgY2hlY2tlZERpc2FibGVkUm93cyA9IDA7XG4gICAgICAgIF8uZWFjaChkaXNhYmxlZFJvd3MsIGZ1bmN0aW9uKHJvdykge1xuICAgICAgICAgICAgaWYgKCQocm93KS5maW5kKCdpbnB1dCcpLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgIGNoZWNrZWREaXNhYmxlZFJvd3MrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGNoZWNrZWREaXNhYmxlZFJvd3MgPiAwKSB7XG4gICAgICAgICAgICAkKCcjZW5hYmxlQnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCBmYWxzZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKCcjZW5hYmxlQnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCB0cnVlKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAoY2hlY2tlZCkgeyByZXR1cm4gcm93SURzOyB9XG4gICAgICAgIHJldHVybiByb3dJRHMuZmlsdGVyKChpZDpzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhIShFREREYXRhLkFzc2F5c1tpZF0uYWN0aXZlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDpzdHJpbmcpOmFueSB7XG4gICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW3Jvd0lEXTtcbiAgICAgICAgaWYgKCFhc3NheS5hY3RpdmUpIHtcbiAgICAgICAgICAgICQuZWFjaChkYXRhUm93T2JqZWN0cywgKHgsIHJvdykgPT4gJChyb3cuZ2V0RWxlbWVudCgpKS5hZGRDbGFzcygnZGlzYWJsZWRSZWNvcmQnKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuLy8gV2hlbiB1bmNoZWNrZWQsIHRoaXMgaGlkZXMgdGhlIHNldCBvZiBBc3NheXMgdGhhdCBoYXZlIG5vIG1lYXN1cmVtZW50IGRhdGEuXG5jbGFzcyBER0VtcHR5QXNzYXlzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgLy8gUmV0dXJuIGEgZnJhZ21lbnQgdG8gdXNlIGluIGdlbmVyYXRpbmcgb3B0aW9uIHdpZGdldCBJRHNcbiAgICBnZXRJREZyYWdtZW50KHVuaXF1ZUlEKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1RhYmxlU2hvd0VBc3NheXNDQic7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIHRleHQgdXNlZCB0byBsYWJlbCB0aGUgd2lkZ2V0XG4gICAgZ2V0TGFiZWxUZXh0KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdTaG93IEVtcHR5JztcbiAgICB9XG5cbiAgICBnZXRMYWJlbFRpdGxlKCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIFwiU2hvdyBhc3NheXMgdGhhdCBkb24ndCBoYXZlIGFueSBtZWFzdXJlbWVudHMgaW4gdGhlbS5cIjtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyb2wgc2hvdWxkIGJlIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgIGlzRW5hYmxlZEJ5RGVmYXVsdCgpOmJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gISEoJCgnI2ZpbHRlcmluZ1Nob3dFbXB0eUNoZWNrYm94JykucHJvcCgnY2hlY2tlZCcpKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgYWN0aXZhdGlvbiBvZiB3aWRnZXRcbiAgICBvbldpZGdldENoYW5nZShlKTp2b2lkIHtcbiAgICAgICAgdmFyIGFtSUNoZWNrZWQ6Ym9vbGVhbiA9ICEhKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpO1xuICAgICAgICB2YXIgaXNPdGhlckNoZWNrZWQ6Ym9vbGVhbiA9ICEhKCQoJyNmaWx0ZXJpbmdTaG93RW1wdHlDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgICAgICQoJyNmaWx0ZXJpbmdTaG93RW1wdHlDaGVja2JveCcpLnByb3AoJ2NoZWNrZWQnLCBhbUlDaGVja2VkKTtcbiAgICAgICAgaWYgKGFtSUNoZWNrZWQgIT0gaXNPdGhlckNoZWNrZWQpIHtcbiAgICAgICAgICAgIFN0dWR5RGF0YVBhZ2UucXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FsbCB0aGUgc3VwZXJjbGFzcyB2ZXJzaW9uIG9mIHRoaXMgZnVuY3Rpb24gYmVjYXVzZSB3ZSBkb24ndFxuICAgICAgICAvLyB3YW50IHRvIHRyaWdnZXIgYSBjYWxsIHRvIGFycmFuZ2VUYWJsZURhdGFSb3dzIGp1c3QgeWV0LlxuICAgICAgICAvLyBUaGUgcXVldWVSZWZyZXNoRGF0YURpc3BsYXlJZlN0YWxlIGZ1bmN0aW9uIHdpbGwgZG8gaXQgZm9yIHVzLCBhZnRlclxuICAgICAgICAvLyByZWJ1aWxkaW5nIHRoZSBmaWx0ZXJpbmcgc2VjdGlvbi5cbiAgICB9XG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIHZhciBjaGVja2VkOmJvb2xlYW4gPSAhISh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKTtcbiAgICAgICAgLy8gSWYgdGhlIGJveCBpcyBjaGVja2VkLCByZXR1cm4gdGhlIHNldCBvZiBJRHMgdW5maWx0ZXJlZFxuICAgICAgICBpZiAoY2hlY2tlZCkgeyByZXR1cm4gcm93SURzOyB9XG4gICAgICAgIHJldHVybiByb3dJRHMuZmlsdGVyKChpZDpzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIHJldHVybiAhIShFREREYXRhLkFzc2F5c1tpZF0uY291bnQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czphbnksIHJvd0lEOnN0cmluZyk6YW55IHtcbiAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbcm93SURdO1xuICAgICAgICBpZiAoIWFzc2F5LmNvdW50KSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2VtcHR5UmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cbi8vIHVzZSBKUXVlcnkgcmVhZHkgZXZlbnQgc2hvcnRjdXQgdG8gY2FsbCBwcmVwYXJlSXQgd2hlbiBwYWdlIGlzIHJlYWR5XG4kKCgpID0+IFN0dWR5RGF0YVBhZ2UucHJlcGFyZUl0KCkpO1xuIl19