/// <reference path="typescript-declarations.d.ts" />
/// <reference path="EDDDataInterface.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="EditableElement.ts" />
/// <reference path="BiomassCalculationUI.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var StudyD;
(function (StudyD) {
    'use strict';
    var mainGraphObject;
    // For the filtering section on the main graph
    var allFilteringWidgets;
    var assayFilteringWidgets;
    var metaboliteFilteringWidgets;
    var metaboliteDataProcessed;
    var proteinFilteringWidgets;
    var proteinDataProcessed;
    var geneFilteringWidgets;
    var geneDataProcessed;
    var mainGraphRefreshTimerID;
    var linesActionPanelRefreshTimer;
    var assaysActionPanelRefreshTimer;
    var attachmentIDs;
    var attachmentsByID;
    var prevDescriptionEditElement;
    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to 
    // calculate biomass for the specified metabolic map.
    StudyD.metabolicMapID;
    StudyD.metabolicMapName;
    StudyD.biomassCalculation;
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
    var GenericFilterSection = (function () {
        function GenericFilterSection() {
            this.uniqueValues = {};
            this.uniqueValuesOrder = [];
            this.filterHash = {};
            this.previousCheckboxState = {};
            this.typingTimeout = null;
            this.typingDelay = 330;
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
            $(sBox = document.createElement("input")).attr({ 'id': sBoxID, 'name': sBoxID, 'placeholder': this.sectionTitle, 'size': 14 }).addClass('searchBox filterHead');
            sBox.setAttribute('type', 'text'); // JQuery .attr() cannot set this
            this.searchBoxElement = sBox;
            this.scrollZoneDiv = $("<div>").addClass('filterCriteriaScrollZone')[0];
            this.filteringTable = $("<table>").addClass('filterCriteriaTable dragboxes').attr({ 'cellpadding': 0, 'cellspacing': 0 }).append(this.tableBodyElement = $("<tbody>")[0]);
        };
        GenericFilterSection.prototype.processFilteringData = function (ids) {
            var usedValues = this.buildUniqueValuesHash(ids);
            var crSet = [];
            var cHash = {};
            // Create a reversed hash so keys map values and values map keys
            $.each(usedValues, function (key, value) {
                cHash[value] = key;
                crSet.push(value);
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
        // In this function are running through the given list of measurement IDs and examining
        // their records and related records, locating the particular field we are interested in,
        // and creating a list of all the unique values for that field.  As we go, we mark each
        // unique value with an integer UID, and construct a hash resolving each record to one (or
        // possibly more) of those integer UIDs.  This prepares us for quick filtering later on.
        // (This generic filter does nothing, so we leave these structures blank.)
        GenericFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            return this.filterHash = {};
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
            darker = darker % 2;
            var striping = ['stripeRowA', 'stripeRowB'];
            $(this.filterColumnDiv).removeClass(striping[1 - darker]);
            $(this.filterColumnDiv).addClass(striping[darker]);
        };
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
            this.uniqueValuesOrder.forEach(function (rowId) {
                var cboxName = ['filter', _this.sectionShortLabel, 'n', rowId, 'cbox'].join(''), cell, p, q, r;
                _this.tableRows[rowId] = _this.tableBodyElement.insertRow();
                cell = _this.tableRows[rowId].insertCell();
                _this.checkboxes[rowId] = $("<input type='checkbox'>").attr({ 'name': cboxName, 'id': cboxName }).appendTo(cell)[0];
                $('<label>').attr('for', cboxName).text(_this.uniqueValues[rowId]).appendTo(cell);
            });
            Dragboxes.initTable(this.filteringTable);
        };
        // Returns true if any of the checkboxes show a different state than when this function was
        // last called
        GenericFilterSection.prototype.anyCheckboxesChangedSinceLastInquiry = function () {
            var _this = this;
            var changed = false, currentCheckboxState = {}, v = $(this.searchBoxElement).val();
            this.anyCheckboxesChecked = false;
            var changed = false;
            var currentCheckboxState = {};
            $.each(this.checkboxes || {}, function (rowId, checkbox) {
                var current, previous;
                current = (checkbox.checked && !checkbox.disabled) ? 'C' : 'U';
                previous = _this.previousCheckboxState[rowId] || 'N';
                if (current !== previous)
                    changed = true;
                if (current === 'C')
                    _this.anyCheckboxesChecked = true;
                currentCheckboxState[rowId] = current;
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
        GenericFilterSection.prototype.applyProgressiveFiltering = function (ids) {
            var _this = this;
            // If the filter only contains one item, it's pointless to apply it.
            if (!this.isFilterUseful()) {
                return ids;
            }
            var useSearchBox = false;
            var v = this.currentSearchSelection;
            var queryStrs = [];
            if (v != null) {
                if (v.length >= this.minCharsToTriggerSearch) {
                    useSearchBox = true;
                    // If there are multiple words, we match each separately.
                    // We will not attempt to match against empty strings, so we filter those out if
                    // any slipped through
                    queryStrs = v.split(/\s+/).filter(function (one) {
                        return one.length > 0;
                    });
                }
            }
            var valuesVisiblePreFiltering = {};
            var idsPostFiltering = [];
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
                var valueIndexes = _this.filterHash[id];
                if (valueIndexes instanceof Array) {
                    return valueIndexes.some(indexIsVisible);
                }
                return indexIsVisible(valueIndexes);
            });
            var rowsToAppend = [];
            this.uniqueValuesOrder.forEach(function (crID) {
                var checkbox = _this.checkboxes[crID], row = _this.tableRows[crID], show = !!valuesVisiblePreFiltering[crID];
                $(row).toggleClass('nodata', (checkbox.disabled = !show));
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
        StrainFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                // assign unique ID to every encountered strain name
                (line.strain || []).forEach(function (strainId) {
                    var strain = EDDData.Strains[strainId];
                    if (strain && strain.name) {
                        uniqueNamesId[strain.name] = uniqueNamesId[strain.name] || ++unique;
                        _this.filterHash[assayId].push(uniqueNamesId[strain.name]);
                    }
                });
            });
            return uniqueNamesId;
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
        CarbonSourceFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source name
                (line.carbon || []).forEach(function (carbonId) {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.name) {
                        uniqueNamesId[src.name] = uniqueNamesId[src.name] || ++unique;
                        _this.filterHash[assayId].push(uniqueNamesId[src.name]);
                    }
                });
            });
            return uniqueNamesId;
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
        CarbonLabelingFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                _this.filterHash[assayId] = _this.filterHash[assayId] || [];
                // assign unique ID to every encountered carbon source labeling description
                (line.carbon || []).forEach(function (carbonId) {
                    var src = EDDData.CSources[carbonId];
                    if (src && src.labeling) {
                        uniqueNamesId[src.labeling] = uniqueNamesId[src.labeling] || ++unique;
                        _this.filterHash[assayId].push(uniqueNamesId[src.labeling]);
                    }
                });
            });
            return uniqueNamesId;
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
        LineNameFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {};
                if (line.name) {
                    uniqueNamesId[line.name] = uniqueNamesId[line.name] || ++unique;
                    _this.filterHash[assayId] = uniqueNamesId[line.name];
                }
            });
            return uniqueNamesId;
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
        ProtocolFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var protocol = _this._assayIdToProtocol(assayId) || {};
                if (protocol.name) {
                    uniqueNamesId[protocol.name] = uniqueNamesId[protocol.name] || ++unique;
                    _this.filterHash[assayId] = uniqueNamesId[protocol.name];
                }
            });
            return uniqueNamesId;
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
        AssaySuffixFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var assay = _this._assayIdToAssay(assayId) || {};
                if (assay.name) {
                    uniqueNamesId[assay.name] = uniqueNamesId[assay.name] || ++unique;
                    _this.filterHash[assayId] = uniqueNamesId[assay.name];
                }
            });
            return uniqueNamesId;
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
        LineMetaDataFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var line = _this._assayIdToLine(assayId) || {}, value = '(Empty)';
                if (line.meta && line.meta[_this.metaDataID]) {
                    value = [_this.pre, line.meta[_this.metaDataID], _this.post].join(' ').trim();
                }
                uniqueNamesId[value] = uniqueNamesId[value] || ++unique;
                _this.filterHash[assayId] = uniqueNamesId[value];
            });
            return uniqueNamesId;
        };
        return LineMetaDataFilterSection;
    })(MetaDataFilterSection);
    StudyD.LineMetaDataFilterSection = LineMetaDataFilterSection;
    var AssayMetaDataFilterSection = (function (_super) {
        __extends(AssayMetaDataFilterSection, _super);
        function AssayMetaDataFilterSection() {
            _super.apply(this, arguments);
        }
        AssayMetaDataFilterSection.prototype.buildUniqueValuesHash = function (ids) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            ids.forEach(function (assayId) {
                var assay = _this._assayIdToAssay(assayId) || {}, value = '(Empty)';
                if (assay.meta && assay.meta[_this.metaDataID]) {
                    value = [_this.pre, assay.meta[_this.metaDataID], _this.post].join(' ').trim();
                }
                uniqueNamesId[value] = uniqueNamesId[value] || ++unique;
                _this.filterHash[assayId] = uniqueNamesId[value];
            });
            return uniqueNamesId;
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
        MetaboliteCompartmentFilterSection.prototype.buildUniqueValuesHash = function (amIDs) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, value;
                value = EDDData.MeasurementTypeCompartments[measure.compartment] || {};
                if (value && value.name) {
                    uniqueNamesId[value.name] = uniqueNamesId[value.name] || ++unique;
                    _this.filterHash[measureId] = uniqueNamesId[value.name];
                }
            });
            return uniqueNamesId;
        };
        return MetaboliteCompartmentFilterSection;
    })(GenericFilterSection);
    StudyD.MetaboliteCompartmentFilterSection = MetaboliteCompartmentFilterSection;
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
            return this.loadPending || this.uniqueValuesOrder.length > 1;
        };
        MetaboliteFilterSection.prototype.buildUniqueValuesHash = function (amIDs) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, metabolite;
                if (measure && measure.type) {
                    metabolite = EDDData.MetaboliteTypes[measure.type] || {};
                    if (metabolite && metabolite.name) {
                        uniqueNamesId[metabolite.name] = uniqueNamesId[metabolite.name] || ++unique;
                        _this.filterHash[measureId] = uniqueNamesId[metabolite.name];
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
            return uniqueNamesId;
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
            return this.loadPending || this.uniqueValuesOrder.length > 1;
        };
        ProteinFilterSection.prototype.buildUniqueValuesHash = function (amIDs) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, protein;
                if (measure && measure.type) {
                    protein = EDDData.ProteinTypes[measure.type] || {};
                    if (protein && protein.name) {
                        uniqueNamesId[protein.name] = uniqueNamesId[protein.name] || ++unique;
                        _this.filterHash[measureId] = uniqueNamesId[protein.name];
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
            return uniqueNamesId;
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
            return this.loadPending || this.uniqueValuesOrder.length > 1;
        };
        GeneFilterSection.prototype.buildUniqueValuesHash = function (amIDs) {
            var _this = this;
            var uniqueNamesId = {}, unique = 0;
            this.filterHash = {};
            amIDs.forEach(function (measureId) {
                var measure = EDDData.AssayMeasurements[measureId] || {}, gene;
                if (measure && measure.type) {
                    gene = EDDData.GeneTypes[measure.type] || {};
                    if (gene && gene.name) {
                        uniqueNamesId[gene.name] = uniqueNamesId[gene.name] || ++unique;
                        _this.filterHash[measureId] = uniqueNamesId[gene.name];
                    }
                }
            });
            // If we've been called to build our hashes, assume there's no load pending
            this.loadPending = false;
            return uniqueNamesId;
        };
        return GeneFilterSection;
    })(GenericFilterSection);
    StudyD.GeneFilterSection = GeneFilterSection;
    // Called when the page loads.
    function prepareIt() {
        var _this = this;
        this.mainGraphObject = null;
        this.allFilteringWidgets = [];
        this.assayFilteringWidgets = [];
        this.metaboliteFilteringWidgets = [];
        this.metaboliteDataProcessed = false;
        this.proteinFilteringWidgets = [];
        this.proteinDataProcessed = false;
        this.geneFilteringWidgets = [];
        this.geneDataProcessed = false;
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
                _this.prepareFilteringSection();
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
                        _this.assaysDataGridSpecs[id] = spec = new DataGridSpecAssays(id);
                        _this.assaysDataGrids[id] = new DataGridAssays(spec);
                    }
                });
            }
        });
        $('form.line-edit').on('change', '.line-meta > :input', function (ev) {
            // watch for changes to metadata values, and serialize to the meta_store field
            var form = $(ev.target).closest('form'), meta = {}, value;
            form.find('.line-meta > :input').each(function (i, input) {
                var key = $(input).attr('id').match(/-(\d+)$/)[1];
                meta[key] = $(input).val();
            });
            value = JSON.stringify(meta);
            form.find('[name=line-meta_store]').val(value);
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
        });
    }
    StudyD.prepareIt = prepareIt;
    // Read through the Lines, Assays, and AssayMeasurements data and prepare a secondary data
    // structure for filtering according to unique criteria, then remake the filtering section under
    // the main graph area with columns of labeled checkboxes.
    function prepareFilteringSection() {
        var seenInLinesHash = {};
        var seenInAssaysHash = {};
        // First do some basic sanity filtering on the list
        var aIDsToUse = $.map(EDDData.Assays, function (assay, assayId) {
            var line = EDDData.Lines[assay.lid];
            if (!assay.active || !line || !line.active)
                return;
            $.each(assay.meta || [], function (metadataId) {
                seenInAssaysHash[metadataId] = 1;
            });
            $.each(line.meta || [], function (metadataId) {
                seenInLinesHash[metadataId] = 1;
            });
            return assayId;
        });
        // Create filters on assay tables
        // TODO media is now a metadata type, strain and carbon source should be too
        var assayFilters = [];
        assayFilters.push(new StrainFilterSection());
        assayFilters.push(new CarbonSourceFilterSection());
        assayFilters.push(new CarbonLabelingFilterSection());
        [].push.apply(assayFilters, $.map(seenInLinesHash, function (id) { return new LineMetaDataFilterSection(id); }));
        assayFilters.push(new LineNameFilterSection());
        assayFilters.push(new ProtocolFilterSection());
        assayFilters.push(new AssaySuffixFilterSection());
        [].push.apply(assayFilters, $.map(seenInAssaysHash, function (id) { return new AssayMetaDataFilterSection(id); }));
        // We can initialize all the Assay- and Line-level filters immediately
        this.assayFilteringWidgets = assayFilters;
        assayFilters.forEach(function (filter) {
            filter.processFilteringData(aIDsToUse);
            filter.populateTable();
        });
        this.metaboliteFilteringWidgets = [];
        this.metaboliteFilteringWidgets.push(new MetaboliteCompartmentFilterSection());
        this.metaboliteFilteringWidgets.push(new MetaboliteFilterSection());
        this.proteinFilteringWidgets = [];
        this.proteinFilteringWidgets.push(new ProteinFilterSection());
        this.geneFilteringWidgets = [];
        this.geneFilteringWidgets.push(new GeneFilterSection());
        this.allFilteringWidgets = [].concat(assayFilters, this.metaboliteFilteringWidgets, this.proteinFilteringWidgets, this.geneFilteringWidgets);
        this.repopulateFilteringSection();
    }
    StudyD.prepareFilteringSection = prepareFilteringSection;
    // Clear out any old fitlers in the filtering section, and add in the ones that
    // claim to be "useful".
    function repopulateFilteringSection() {
        // Clear out the old filtering UI, add back filter widgets
        var table = $('<div>').addClass('filterTable').appendTo($('#mainFilterSection').empty());
        $.each(this.allFilteringWidgets, function (i, widget) {
            if (widget.isFilterUseful()) {
                widget.addToParent(table[0]);
                widget.applyBackgroundStyle(i % 2 === 1);
            }
        });
    }
    StudyD.repopulateFilteringSection = repopulateFilteringSection;
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
            case 38:
            case 40:
            case 9:
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
        }
        $('#mainFilterSection').on('mouseover mousedown mouseup', function () { return _this.queueMainGraphRemake(); }).on('keydown', function (e) { return filterTableKeyDown(_this, e); });
        $('#separateAxesCheckbox').on('change', function () { return _this.queueMainGraphRemake(true); });
        // Enable edit lines button
        $('#editLineButton').on('click', function (ev) {
            var button = $(ev.target), data = button.data(), form = clearLineForm();
            if (data.ids.length === 1) {
                fillLineForm(form, EDDData.Lines[data.ids[0]]);
            }
            updateUILineForm(form, data.count > 1);
            scrollToLineForm(form);
            form.find('[name=line-ids]').val(data.ids.join(','));
            return false;
        });
        // Initialize the description edit fields.
        this.initDescriptionEditFields();
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
                success: function (data) {
                    processMeasurementData(context, data);
                }
            });
        });
    }
    function processMeasurementData(context, data) {
        var assaySeen = {}, filterIds = { 'm': [], 'p': [], 'g': [] }, protocolToAssay = {};
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);
        // loop over all downloaded measurements
        $.each(data.measures || {}, function (index, measurement) {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
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
            if (mtype.family === 'm' || mtype.family === '_') {
                (assay.metabolites = assay.metabolites || []).push(measurement.id);
                filterIds.m.push(measurement.id);
            }
            else if (mtype.family === 'p') {
                (assay.proteins = assay.proteins || []).push(measurement.id);
                filterIds.p.push(measurement.id);
            }
            else if (mtype.family === 'g') {
                (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
                filterIds.g.push(measurement.id);
            }
        });
        if (filterIds.m.length) {
            $.each(context.metaboliteFilteringWidgets, function (i, widget) {
                widget.processFilteringData(filterIds.m);
                widget.populateTable();
            });
            context.metaboliteDataProcessed = true;
        }
        if (filterIds.p.length) {
            $.each(context.proteinFilteringWidgets, function (i, widget) {
                widget.processFilteringData(filterIds.p);
                widget.populateTable();
            });
            context.proteinDataProcessed = true;
        }
        if (filterIds.g.length) {
            $.each(context.geneFilteringWidgets, function (i, widget) {
                widget.processFilteringData(filterIds.g);
                widget.populateTable();
            });
            context.geneDataProcessed = true;
        }
        context.repopulateFilteringSection();
        // invalidate assays on all DataGrids; I think this means they are initially hidden?
        $.each(context.assaysDataGrids, function (protocolId, dataGrid) {
            dataGrid.invalidateAssayRecords(Object.keys(protocolToAssay[protocolId] || {}));
        });
        context.linesDataGridSpec.enableCarbonBalanceWidget(true);
        context.processCarbonBalanceData();
        context.queueMainGraphRemake();
    }
    function carbonBalanceColumnRevealedCallback(index, spec, dataGridObj) {
        StudyD.rebuildCarbonBalanceGraphs(index);
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
            infobox = $('#assaysMeasSelectedTD').empty();
            if (checkedAssays) {
                $("<p>").appendTo(infobox).text((checkedAssays > 1) ? (checkedAssays + " Assays selected") : "1 Assay selected");
            }
            if (checkedMeasure) {
                $("<p>").appendTo(infobox).text((checkedMeasure > 1) ? (checkedMeasure + " Measurements selected") : "1 Measurement selected");
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
    function checkRedrawRequired(context, force) {
        var redraw = false;
        // do not redraw if graph is not initialized yet
        if (StudyDGraphing && context.mainGraphObject) {
            redraw = !!force;
            // Walk down the filter widget list.  If we encounter one whose collective checkbox
            // state has changed since we last made this walk, then a redraw is required. Note that
            // we should not skip this loop, even if we already know a redraw is required, since the
            // call to anyCheckboxesChangedSinceLastInquiry sets internal state in the filter
            // widgets that we will use next time around.
            $.each(context.allFilteringWidgets, function (i, filter) {
                if (filter.anyCheckboxesChangedSinceLastInquiry()) {
                    redraw = true;
                }
            });
        }
        return redraw;
    }
    function buildGraphAssayIDSet(context) {
        var previousIDSet = [];
        // The next loop is designed to progressively hide rows in the criteria lists in the
        // filtering section of the page, based on the selections in the previous criteria list. We
        // start with all the non-disabled Assay IDs in the Study. With each pass through the loop
        // below we will narrow this set down, until we get to the per-measurement filters, which
        // will just use the set and return it unaltered.
        $.each(EDDData.Assays, function (assayId, assay) {
            var line = EDDData.Lines[assay.lid];
            if (!assay.active || !line || !line.active)
                return;
            previousIDSet.push(assayId);
        });
        $.each(context.assayFilteringWidgets, function (i, filter) {
            previousIDSet = filter.applyProgressiveFiltering(previousIDSet);
        });
        return previousIDSet;
    }
    function buildFilteredMeasurements(context, previousIDSet) {
        var measurements = [], widgetFilter = function (i, filter) {
            measurements = filter.applyProgressiveFiltering(measurements);
        };
        $.each(previousIDSet, function (i, assayId) {
            var assay = EDDData.Assays[assayId];
            $.merge(measurements, assay.measures || []);
        });
        // only try to filter if we got measurements that apply to the widget types
        if (context.metaboliteDataProcessed) {
            $.each(context.metaboliteFilteringWidgets, widgetFilter);
        }
        if (context.proteinDataProcessed) {
            $.each(context.proteinFilteringWidgets, widgetFilter);
        }
        if (context.geneDataProcessed) {
            $.each(context.geneFilteringWidgets, widgetFilter);
        }
        return measurements;
    }
    function remakeMainGraphArea(context, force) {
        var previousIDSet, postFilteringMeasurements, dataPointsDisplayed = 0, dataPointsTotal = 0, separateAxes = $('#separateAxesCheckbox').prop('checked'), 
        // FIXME assumes (x0, y0) points
        convert = function (d) {
            return [[d[0][0], d[1][0]]];
        }, compare = function (a, b) {
            return a[0] - b[0];
        };
        context.mainGraphRefreshTimerID = 0;
        if (!checkRedrawRequired(context, force)) {
            return;
        }
        // Start out with a blank graph.  We will re-add all the relevant sets.
        context.mainGraphObject.clearAllSets();
        previousIDSet = buildGraphAssayIDSet(context);
        postFilteringMeasurements = buildFilteredMeasurements(context, previousIDSet);
        $.each(postFilteringMeasurements, function (i, measurementId) {
            var measurement = EDDData.AssayMeasurements[measurementId], points = (measurement.values ? measurement.values.length : 0), assay, line, protocol, newSet;
            dataPointsTotal += points;
            if (dataPointsDisplayed > 15000) {
                return; // Skip the rest if we've hit our limit
            }
            dataPointsDisplayed += points;
            assay = EDDData.Assays[measurement.assay] || {};
            line = EDDData.Lines[assay.lid] || {};
            protocol = EDDData.Protocols[assay.pid] || {};
            newSet = {
                'label': 'dt' + measurementId,
                'measurementname': Utl.EDD.resolveMeasurementRecordToName(measurement),
                'name': [line.name, protocol.name, assay.name].join('-'),
                'units': Utl.EDD.resolveMeasurementRecordToUnits(measurement),
                'data': $.map(measurement.values, convert).sort(compare)
            };
            if (line.control)
                newSet.iscontrol = 1;
            if (separateAxes) {
                // If the measurement is a metabolite, choose the axis by type. If it's any
                // other subtype, choose the axis based on that subtype, with an offset to avoid
                // colliding with the metabolite axes.
                if (measurement.mst === 1) {
                    newSet.yaxisByMeasurementTypeID = measurement.mt;
                }
                else {
                    newSet.yaxisByMeasurementTypeID = measurement.mst - 10;
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
    // TODO: this is gross, do it better
    function addCarbonSourceRow(carbonId) {
        // Search for an old row that's been disabled, and if we find one,
        // re-enable it and stick it on the end of the array.
        var turnedOffIndex = -1;
        for (var j = 0; j < this.cSourceEntries.length; j++) {
            if (this.cSourceEntries[j].disabled == true) {
                turnedOffIndex = j;
                break;
            }
        }
        if (turnedOffIndex > -1) {
            var toAdd = this.cSourceEntries.splice(turnedOffIndex, 1);
            toAdd[0].disabled = false;
            if (carbonId) {
                toAdd[0].hiddeninput.value = carbonId;
            }
            toAdd[0].input.autocompleter.setFromHiddenElement();
            this.cSourceEntries.push(toAdd[0]);
        }
        else {
            var firstRow = false;
            // If this is the first row we're creating, we create it a little differently
            if (this.cSourceEntries.length == 0) {
                firstRow = true;
            }
            var order = this.cSourceEntries.length;
            var rtr = document.createElement("tr");
            rtr.className = "multientrybuttonrow";
            var rtd = document.createElement("td");
            if (firstRow) {
                rtd.innerHTML = '<input type="checkbox" id="lineCSCheckbox" class="off" ' + 'name="lineCSCheckbox" value="1" />';
            }
            rtr.appendChild(rtd);
            rtd = document.createElement("td");
            rtr.appendChild(rtd);
            if (firstRow) {
                var aL = document.createElement("label");
                aL.setAttribute('for', "lineCSCheckbox");
                rtd.appendChild(aL);
                var p = document.createElement("p");
                aL.appendChild(p);
                p.appendChild(document.createTextNode("Carbon Source(s):"));
            }
            rtd = document.createElement("td");
            rtr.appendChild(rtd);
            var aCI = document.createElement("input");
            aCI.setAttribute('type', "text");
            aCI.setAttribute('id', "linecs" + order);
            aCI.setAttribute('name', "linecs" + order);
            aCI.setAttribute('autocomplete', "off");
            aCI.setAttribute('autocompletetype', "carbonsource");
            aCI.setAttribute('autocompletevalue', "linecsvalue" + order);
            aCI.setAttribute('size', "61");
            aCI.className = "autocomplete";
            aCI.style.marginRight = "2px";
            rtd.appendChild(aCI);
            var aCHI = document.createElement("input");
            aCHI.setAttribute('type', "hidden");
            aCHI.setAttribute('id', "linecsvalue" + order);
            aCHI.setAttribute('name', "linecsvalue" + order);
            aCHI.setAttribute('value', carbonId);
            rtd.appendChild(aCHI);
            rtd = document.createElement("td");
            rtr.appendChild(rtd);
            var buttonSpan = document.createElement("div");
            buttonSpan.className = "multientrybutton";
            rtd.appendChild(buttonSpan);
            if (firstRow) {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "/static/main/images/plus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.addCarbonSourceRow();";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);
            }
            else {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "/static/main/images/minus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.removeCarbonSourceRow(" + order + ");";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);
            }
            var newRowRecord = {
                row: rtr,
                input: aCI,
                hiddeninput: aCHI,
                label: order,
                initialized: false,
                disabled: false
            };
            this.cSourceEntries.push(newRowRecord);
        }
        this.redrawCarbonSourceRows();
    }
    StudyD.addCarbonSourceRow = addCarbonSourceRow;
    function removeCarbonSourceRow(order) {
        for (var j = 0; j < this.cSourceEntries.length; j++) {
            if (this.cSourceEntries[j].label == order) {
                this.cSourceEntries[j].disabled = true;
                break;
            }
        }
        this.redrawCarbonSourceRows();
    }
    StudyD.removeCarbonSourceRow = removeCarbonSourceRow;
    function disableAllButFirstCarbonSourceRow() {
        for (var j = 1; j < this.cSourceEntries.length; j++) {
            this.cSourceEntries[j].disabled = true;
        }
        this.redrawCarbonSourceRows();
    }
    StudyD.disableAllButFirstCarbonSourceRow = disableAllButFirstCarbonSourceRow;
    function redrawCarbonSourceRows() {
        var carbonSourceTableBody = document.getElementById("carbonSourceTableBody");
        if (!carbonSourceTableBody)
            return;
        while (carbonSourceTableBody.firstChild) {
            carbonSourceTableBody.removeChild(carbonSourceTableBody.firstChild);
        }
        for (var j = 0; j < this.cSourceEntries.length; j++) {
            if (this.cSourceEntries[j].disabled == false) {
                carbonSourceTableBody.appendChild(this.cSourceEntries[j].row);
                if (this.cSourceEntries[j].initialized == false) {
                    this.cSourceEntries[j].initialized = true;
                    EDDAutoComplete.initializeElement(this.cSourceEntries[j].input);
                }
            }
        }
    }
    StudyD.redrawCarbonSourceRows = redrawCarbonSourceRows;
    function clearLineForm() {
        var form = $('#id_line-ids').closest('form');
        form.find('.line-meta').remove().end().find(':input').filter('[name^=line-]').val('');
        form.find('.cancel-link').remove();
        form.find('.bulk').addClass('off');
        return form;
    }
    function fillLineForm(form, record) {
        var metaRow;
        form.find('[name=line-ids]').val(record.id);
        form.find('[name=line-name]').val(record.name);
        form.find('[name=line-description]').val(record.description);
        form.find('[name=line-control]').prop('checked', record.control);
        form.find('[name=line-contact_0]').val(record.contact.text || (EDDData.Users[record.contact.user_id] || {}).uid || '--');
        form.find('[name=line-contact_1]').val(record.contact.user_id);
        form.find('[name=line-experimenter_0]').val((EDDData.Users[record.experimenter] || {}).uid || '--');
        form.find('[name=line-experimenter_1]').val(record.experimenter);
        form.find('[name=line-carbon_source_0]').val(record.carbon.map(function (v) { return (EDDData.CSources[v] || {}).name || '--'; }).join(','));
        form.find('[name=line-carbon_source_1]').val(record.carbon.join(','));
        form.find('[name=line-strains_0]').val(record.strain.map(function (v) { return (EDDData.Strains[v] || {}).name || '--'; }).join(','));
        form.find('[name=line-strains_1]').val(record.strain.join(','));
        metaRow = form.find('.line-edit-meta');
        // Run through the collection of metadata, and add a form element entry for each
        $.each(record.meta, function (key, value) {
            insertLineMetadataRow(metaRow, key, value);
        });
        // store original metadata in initial- field
        form.find('[name=line-meta_store]').val(JSON.stringify(record.meta));
        form.find('[name=initial-line-meta_store]').val(JSON.stringify(record.meta));
    }
    function scrollToLineForm(form) {
        // make sure form is disclosed
        var top = form.closest('.disclose').toggleClass('discloseHide', false).offset().top;
        $('html').animate({ 'scrollTop': top }, 'slow');
    }
    function updateUILineForm(form, plural) {
        var title, button, text = 'Edit Line' + (plural ? 's' : '');
        // Update the disclose title to read 'Edit Line'
        title = form.closest('.disclose').find('.discloseLink > a').text(text);
        // Update the button to read 'Edit Line'
        button = form.find('[name=action][value=line]').text(text);
        form.find('.bulk').toggleClass('off', !plural);
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
        input = $('<input type="text">').attr('id', 'id_' + id).val(value).appendTo(row);
        if (type.pre) {
            $('<span>').addClass('meta-prefix').text(type.pre).insertBefore(input);
        }
        if (type.postfix) {
            $('<span>').addClass('meta-postfix').text(type.postfix).insertAfter(input);
        }
        // TODO add a remove button
        return row;
    }
    function editLine(index) {
        var record = EDDData.Lines[index], form;
        if (!record) {
            console.log('Invalid record for editing: ' + index);
            return;
        }
        form = clearLineForm();
        // Update the form elements with current Line information
        fillLineForm(form, record);
        updateUILineForm(form);
        scrollToLineForm(form);
    }
    StudyD.editLine = editLine;
    function editAssay(linkelement, index) {
        var record = EDDData.Assays[index];
        if (!record) {
            console.log('Invalid record for editing: ' + index);
            return;
        }
        // Create a mapping from the JSON record to the form elements
        var formInfo = {
            assayidtoedit: index,
            assayname: record.name,
            assayprotocol: record.pid,
            assaydescription: record.description,
            assayexperimentervalue: record.exp
        };
        // Set the checkbox of the Line this Assay belongs to
        formInfo['line' + record.lid + 'include'] = 1;
        EDDEdit.prepareForm(formInfo, 'studyLinesTable,assayMain,editAssayBanner,editAssayButtons', 'addNewAssayCover,newAssayBanner,newAssayButtons');
    }
    StudyD.editAssay = editAssay;
    function addMetaboliteRow() {
        // Search for an old row that's been disabled, and if we find one,
        // re-enable it and stick it on the end of the array.
        var turnedOffIndex = -1;
        for (var j = 0; j < this.mTypeEntries.length; j++) {
            if (this.mTypeEntries[j].disabled == true) {
                turnedOffIndex = j;
                break;
            }
        }
        if (turnedOffIndex > -1) {
            var toAddArray = this.mTypeEntries.splice(turnedOffIndex, 1);
            var toAdd = toAddArray[0];
            toAdd.disabled = false;
            this.mTypeEntries.push(toAdd);
        }
        else {
            var firstRow = false;
            // If this is the first row we're creating, we create it a little differently
            if (this.mTypeEntries.length == 0) {
                firstRow = true;
            }
            var order = this.mTypeEntries.length;
            var rtr = document.createElement("tr");
            rtr.className = "multientrybuttonrow";
            var aTD = document.createElement("td");
            rtr.appendChild(aTD);
            if (firstRow) {
                var p = document.createElement("p");
                aTD.appendChild(p);
                p.appendChild(document.createTextNode("Metabolite Type(s):"));
            }
            var mQAutocomplete = EDDAutoComplete.createAutoCompleteContainer("measurementcompartment", 4, "assaycomp" + order, '', 0);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            mQAutocomplete.inputElement.style.marginRight = "2px";
            aTD.appendChild(mQAutocomplete.inputElement);
            aTD.appendChild(mQAutocomplete.hiddenInputElement);
            var mTypeAutocomplete = EDDAutoComplete.createAutoCompleteContainer("metabolite", 45, "assaymt" + order, '', 0);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            mTypeAutocomplete.inputElement.style.marginRight = "2px";
            aTD.appendChild(mTypeAutocomplete.inputElement);
            aTD.appendChild(mTypeAutocomplete.hiddenInputElement);
            var unitsAutocomplete = EDDAutoComplete.createAutoCompleteContainer("units", 15, "assayunits" + order, '', 0);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            aTD.appendChild(unitsAutocomplete.inputElement);
            aTD.appendChild(unitsAutocomplete.hiddenInputElement);
            aTD = document.createElement("td");
            rtr.appendChild(aTD);
            var buttonSpan = document.createElement("div");
            buttonSpan.className = "multientrybutton";
            aTD.appendChild(buttonSpan);
            if (firstRow) {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "/static/main/images/plus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.addMetaboliteRow();";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);
            }
            else {
                var buttonImg = document.createElement("img");
                buttonImg.setAttribute('src', "/static/main/images/minus.png");
                buttonImg.style.marginTop = "1px";
                var oc = "StudyD.removeMeasurementTypeRow(" + order + ");";
                buttonImg.setAttribute('onclick', oc);
                buttonSpan.appendChild(buttonImg);
            }
            var newRowRecord = {
                row: rtr,
                mQAutocomplete: mQAutocomplete,
                mTypeAutocomplete: mTypeAutocomplete,
                unitsAutocomplete: unitsAutocomplete,
                label: order,
                initialized: false,
                disabled: false
            };
            this.mTypeEntries.push(newRowRecord);
        }
        this.redrawMeasurementTypeRows();
    }
    StudyD.addMetaboliteRow = addMetaboliteRow;
    function removeMeasurementTypeRow(order) {
        for (var j = 0; j < this.mTypeEntries.length; j++) {
            if (this.mTypeEntries[j].label == order) {
                this.mTypeEntries[j].disabled = true;
                break;
            }
        }
        this.redrawMeasurementTypeRows();
    }
    StudyD.removeMeasurementTypeRow = removeMeasurementTypeRow;
    function redrawMeasurementTypeRows() {
        var measurementTypeTableBody = document.getElementById("measurementTypeTableBody");
        if (!measurementTypeTableBody)
            return;
        while (measurementTypeTableBody.firstChild) {
            measurementTypeTableBody.removeChild(measurementTypeTableBody.firstChild);
        }
        for (var j = 0; j < this.mTypeEntries.length; j++) {
            var mte = this.mTypeEntries[j];
            if (mte.disabled == false) {
                measurementTypeTableBody.appendChild(mte.row);
                if (mte.initialized == false) {
                    mte.initialized = true;
                    EDDAutoComplete.initializeElement(mte.mQAutocomplete.inputElement);
                    mte.mQAutocomplete.initialized = 1;
                    EDDAutoComplete.initializeElement(mte.mTypeAutocomplete.inputElement);
                    mte.mTypeAutocomplete.initialized = 1;
                    EDDAutoComplete.initializeElement(mte.unitsAutocomplete.inputElement);
                    mte.unitsAutocomplete.initialized = 1;
                }
            }
        }
    }
    StudyD.redrawMeasurementTypeRows = redrawMeasurementTypeRows;
    // This is called by the LiveTextEdit control to set a new description for an attachemnt.
    function setAttachmentDescription(element, attachmentID, newDescription) {
        // TODO: call correct new URL for update
    }
    StudyD.setAttachmentDescription = setAttachmentDescription;
    // This creates a LiveTextEdit object for each attachment description.
    function initDescriptionEditFields() {
        this.descriptionEditFields = [];
    }
    StudyD.initDescriptionEditFields = initDescriptionEditFields;
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
            this.rebuildCarbonBalanceGraphs(5);
        }
    }
    StudyD.onChangedMetabolicMap = onChangedMetabolicMap;
    // TODO: Use a special variable in the spec to get the right column object, not a lousy magic
    // index number.
    function rebuildCarbonBalanceGraphs(columnIndex) {
        if (this.carbonBalanceDisplayIsFresh) {
            return;
        }
        // Drop any previously created Carbon Balance SVG elements from the DOM.
        this.carbonBalanceData.removeAllCBGraphs();
        var cellObjs = this.linesDataGrid.getDataCellObjectsForColumnIndex(columnIndex);
        for (var i = 0; i < cellObjs.length; i++) {
            var lineID = cellObjs[i].recordID;
            var element = cellObjs[i].cellElement;
            this.carbonBalanceData.createCBGraphForLine(lineID, element);
        }
        this.carbonBalanceDisplayIsFresh = true;
    }
    StudyD.rebuildCarbonBalanceGraphs = rebuildCarbonBalanceGraphs;
    // They want to select a different metabolic map.
    function onClickedMetabolicMapName() {
        var _this = this;
        var callback = function (err, metabolicMapID, metabolicMapName, finalBiomass) {
            if (err == null) {
                _this.metabolicMapID = metabolicMapID;
                _this.metabolicMapName = metabolicMapName;
                _this.biomassCalculation = finalBiomass;
                _this.onChangedMetabolicMap();
            }
        };
        new StudyMetabolicMapChooser(EDDData.currentUserID, EDDData.currentStudyID, false, callback);
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
                'sortBy': this.loadLineName
            }),
            new DataGridHeaderSpec(2, 'hLinesStrain', {
                'name': 'Strain',
                'sortBy': this.loadStrainName,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(3, 'hLinesCarbon', {
                'name': 'Carbon Source(s)',
                'size': 's',
                'sortBy': this.loadCarbonSource,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(4, 'hLinesLabeling', {
                'name': 'Labeling',
                'size': 's',
                'sortBy': this.loadCarbonSourceLabeling,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(5, 'hLinesCarbonBalance', {
                'name': 'Carbon Balance',
                'size': 's',
                'sortBy': this.loadLineName
            })
        ];
        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders = this.metaDataIDsUsedInLines.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(6 + index, 'hLinesMeta' + id, {
                'name': mdType.name,
                'size': 's',
                'sortBy': _this.makeMetaDataSortFunction(id),
                'sortAfter': 0
            });
        });
        var rightSide = [
            new DataGridHeaderSpec(6 + metaDataHeaders.length, 'hLinesExperimenter', {
                'name': 'Experimenter',
                'size': 's',
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hLinesModified', {
                'name': 'Last Modified',
                'size': 's',
                'sortBy': this.loadLineModification,
                'sortAfter': 0
            })
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
                'checkboxWithID': function (id) {
                    return 'line' + id + 'include';
                },
                'sideMenuItems': [
                    '<a href="#editline" class="line-edit-link">Edit Line</a>',
                    '<a href="export?line=' + index + '">Export Data as CSV/etc</a>'
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
                strings = line.carbon.map(function (id) {
                    return EDDData.CSources[id].name;
                });
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
                strings = line.carbon.map(function (id) {
                    return EDDData.CSources[id].labeling;
                });
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
            new DataGridColumnGroupSpec('Carbon Balance', {
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
        var _this = this;
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        this.clickHandler = function (e) {
            // TODO: Untangle this a bit
            var callback = function (err, finalMetabolicMapID, finalMetabolicMapFilename, finalBiomass) {
                StudyD.metabolicMapID = finalMetabolicMapID;
                StudyD.metabolicMapName = finalMetabolicMapFilename;
                StudyD.biomassCalculation = finalBiomass;
                StudyD.onChangedMetabolicMap();
            };
            if (_this.checkBoxElement.checked) {
                // We need to get a biomass calculation to multiply against OD.
                // Have they set this up yet?
                if (!StudyD.biomassCalculation || StudyD.biomassCalculation == -1) {
                    _this.checkBoxElement.checked = false;
                    // Must setup the biomass 
                    new FullStudyBiomassUI(EDDData.currentUserID, EDDData.currentStudyID, callback);
                }
                else {
                    _this.dataGridOwnerObject.showColumn(5);
                }
            }
            else {
                _this.dataGridOwnerObject.hideColumn(5);
            }
        };
        this.checkboxEnabled = true;
        this.highlighted = false;
    }
    DGShowCarbonBalanceWidget.prototype.createElements = function (uniqueID) {
        var cbID = this.dataGridSpec.tableSpec.id + 'CarBal' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        cb.className = 'tableControl';
        $(cb).click(this.clickHandler);
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
        convert = function (d) {
            return [[d[0][0], d[1][0]]];
        };
        // function comparing two points, to sort data sent to flot
        compare = function (a, b) {
            return a[0] - b[0];
        };
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
            if (_this.protocolID != assay.pid) {
            }
            else if (!(line = EDDData.Lines[assay.lid]) || !line.active) {
            }
            else {
                _this.assayIDsInProtocol.push(assayId);
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
            titleLink = $('<span>').addClass('discloseLink').text(this.protocolName + ' Assays').appendTo(titleDiv);
            table = $(document.createElement("table")).attr('id', tableID).addClass('discloseBody').appendTo(protocolDiv);
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
            $.each(assay.meta || {}, function (metaId) {
                seenHash[metaId] = true;
            });
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
        var v = ((rec.metabolites || []).length + ((rec.transcriptions || []).length ? 1 : 0) + ((rec.proteins || []).length ? 1 : 0)) || 1;
        return v;
    };
    DataGridSpecAssays.prototype.generateAssayNameCells = function (gridSpec, index) {
        var record = EDDData.Assays[index];
        var line = EDDData.Lines[record.lid];
        var sideMenuItems = [
            '<a href="#" onclick="StudyD.editAssay(this, ' + index + ');">Edit Assay</a>',
            '<a href="export?assaylevel=1&assay=' + index + '">Export Data as CSV/etc</a>'
        ];
        if (gridSpec.protocolName == "Transcriptomics") {
            sideMenuItems.push('<a href="import/rnaseq/edgepro?assay=' + index + '">Import RNA-seq data from EDGE-pro</a>');
        }
        // TODO get rid of onclick, check export URL
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxWithID': function (id) {
                    return 'assay' + id + 'include';
                },
                'sideMenuItems': sideMenuItems,
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                // In a typical EDDData.Assays record this string is currently pre-assembled and
                // stored in 'fn'. But we're not relying on that for now.
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
        var record = EDDData.Assays[index], cells = [], factory = function () {
            return new DataGridLoadingCell(gridSpec, index);
        };
        if ((record.metabolites || []).length > 0) {
            if (EDDData.AssayMeasurements === undefined) {
                cells.push(new DataGridLoadingCell(gridSpec, index, { 'rowspan': record.metabolites.length }));
            }
            else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.metabolites.map(opt.metaboliteToValue).sort(opt.metaboliteValueSort).map(opt.metaboliteValueToCell);
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
            cells.push(factory());
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
                return new DataGridDataCell(gridSpec, index, {
                    'hoverEffect': true,
                    'checkboxWithID': function () {
                        return 'measurement' + value.id + 'include';
                    },
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
            }
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
        var tupleTimeCount = function (value, key) {
            return [[key, value]];
        }, sortByTime = function (a, b) {
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
        points.sort(function (a, b) {
            return a[0] - b[0];
        }).forEach(function (point) {
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
        var leftSide = [
            new DataGridColumnSpec(1, this.generateAssayNameCells)
        ];
        var metaDataCols = this.metaDataIDsUsedInAssays.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnSpec(2 + index, _this.makeMetaDataCellsGeneratorFunction(id));
        });
        var rightSide = [
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
                $(this.graphAreaHeaderSpec.element).html('<div id="' + graphid + '" class="graphContainer"></div>');
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
//# sourceMappingURL=Study.js.map