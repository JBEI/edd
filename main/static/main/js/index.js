/// <reference path="EDDDataInterface.ts" />
/// <reference path="EditableElement.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="Utl.ts" />
/// <reference path="lib/jquery.d.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var IndexPage;
(function (IndexPage) {
    var studiesDataGridSpec = null;
    var studiesDataGrid = null;
    // Called when the page loads.
    function prepareIt() {
        setTimeout(function () { return IndexPage.prepareTable(); }, 1);
    }
    IndexPage.prepareIt = prepareIt;
    function prepareTable() {
        // Instantiate a table specification for the Studies table
        this.studiesDataGridSpec = new DataGridSpecStudies();
        // Instantiate the table itself with the spec
        this.studiesDataGrid = new DataGrid(this.studiesDataGridSpec);
        this.studiesDataGridSpec.requestPageOfData();
    }
    IndexPage.prepareTable = prepareTable;
    // This creates an EditableElement object for each Study description that the user is allowed to edit.
    function initDescriptionEditFields() {
        // Since we've already created the table, we can look into the spec and find the other objects created in the process.
        // Under the specification for the "description" column, we find all the DataGridDataCell objects that belong to that column.
        var descriptionCells = this.studiesDataGrid.getDataCellObjectsForColumnIndex(1);
        var data = this.studiesDataGridSpec.data();
        descriptionCells.forEach(function (cell) {
            if (data[cell.recordID].write) {
                EditableElements.initializeElement({
                    'studyID': cell.recordID,
                    'element': cell.cellElement,
                    'type': 'text',
                    'editAllowed': function () {
                        return true;
                    },
                    'getValue': function (self) {
                        return data[cell.recordID].des;
                    },
                    'setValue': function (self, value) { return data[cell.recordID].des = value; },
                    'makeFormData': function (self, value) {
                        return {
                            'action': 'Update Study Description',
                            'studyID': cell.recordID,
                            'desc': value
                        };
                    }
                });
            }
        });
    }
    IndexPage.initDescriptionEditFields = initDescriptionEditFields;
})(IndexPage || (IndexPage = {}));
;
// The spec object that will be passed to DataGrid to create the Studies table
var DataGridSpecStudies = (function (_super) {
    __extends(DataGridSpecStudies, _super);
    function DataGridSpecStudies() {
        _super.apply(this, arguments);
        this._size = 0;
        this._offset = 0;
        this._pageSize = 50;
        this._query = '';
    }
    // Specification for the table as a whole
    DataGridSpecStudies.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('studies', { 'name': 'Studies' });
    };
    // Specification for the headers along the top of the table
    DataGridSpecStudies.prototype.defineHeaderSpec = function () {
        var _this = this;
        // capture here, as the `this` variable below will point to global object, not this object
        var self = this;
        return [
            new DataGridHeaderSpec(1, 'hStudyName', {
                'name': 'Study Name',
                'nowrap': true,
                'sortBy': function (index) {
                    return _this.dataObj[index].n.toUpperCase();
                },
                'sortAfter': 1
            }),
            new DataGridHeaderSpec(2, 'hStudyDesc', {
                'name': 'Description',
                'sortBy': function (index) {
                    return _this.dataObj[index].des.toUpperCase();
                }
            }),
            new DataGridHeaderSpec(3, 'hStudyOwnerInitials', {
                'name': 'Owner',
                'sortBy': function (index) {
                    return _this.dataObj[index].initials || '?';
                },
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(4, 'hStudyOwnerFullName', {
                'name': 'Owner Full Name',
                'nowrap': true,
                'sortBy': function (index) {
                    return _this.dataObj[index].ownerName.toUpperCase() || '?';
                },
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(5, 'hStudyOwnerInstitute', {
                'name': 'Institute',
                'nowrap': true,
                'sortBy': function (i) { return '?'; },
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(6, 'hStudyCreated', {
                'name': 'Created',
                'sortBy': function (index) {
                    return _this.dataObj[index].cr;
                },
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(7, 'hStudyMod', {
                'name': 'Last Modified',
                'sortBy': function (index) {
                    return _this.dataObj[index].mod;
                },
                'sortAfter': 0
            })
        ];
    };
    DataGridSpecStudies.prototype.generateStudyNameCells = function (gridSpec, index) {
        var sideMenuItems = [];
        var match = gridSpec.dataObj[index].match;
        if (match) {
            sideMenuItems = match.getFields().map(function (field) {
                var matches = match.getMatches(field, '<span class="search_match">', '</span>', 10);
                return 'Matched on ' + field + ': ' + matches.join(', ');
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'hoverEffect': true,
                'nowrap': true,
                'sideMenuItems': sideMenuItems,
                'contentString': ['<a href="Study.cgi?studyID=', index, '" class="darker">', gridSpec.dataObj[index].n, '</a>'].join('')
            })
        ];
    };
    DataGridSpecStudies.prototype.generateDescriptionCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'maxWidth': '400',
                'customID': function (id) {
                    return 'editableDescriptionField' + id;
                },
                'contentString': gridSpec.dataObj[index].des || ''
            })
        ];
    };
    DataGridSpecStudies.prototype.generateOwnerInitialsCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': gridSpec.dataObj[index].initials || '?'
            })
        ];
    };
    DataGridSpecStudies.prototype.generateOwnerNameCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': gridSpec.dataObj[index].ownerName || '?'
            })
        ];
    };
    DataGridSpecStudies.prototype.generateInstitutionCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': '?'
            })
        ];
    };
    DataGridSpecStudies.prototype.generateCreatedCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': Utl.JS.utcToTodayString(gridSpec.dataObj[index].cr)
            })
        ];
    };
    DataGridSpecStudies.prototype.generateModifiedCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': Utl.JS.utcToTodayString(gridSpec.dataObj[index].mod)
            })
        ];
    };
    // Specification for each of the columns that will make up the body of the table
    DataGridSpecStudies.prototype.defineColumnSpec = function () {
        // capture here, as the `this` variable below will point to global object, not this object
        var self = this;
        return [
            new DataGridColumnSpec(1, this.generateStudyNameCells),
            new DataGridColumnSpec(2, this.generateDescriptionCells),
            new DataGridColumnSpec(3, this.generateOwnerInitialsCells),
            new DataGridColumnSpec(4, this.generateOwnerNameCells),
            new DataGridColumnSpec(5, this.generateInstitutionCells),
            new DataGridColumnSpec(6, this.generateCreatedCells),
            new DataGridColumnSpec(7, this.generateModifiedCells)
        ];
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecStudies.prototype.defineColumnGroupSpec = function () {
        return [
            new DataGridColumnGroupSpec('Study Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Description'),
            new DataGridColumnGroupSpec('Owner Initials'),
            new DataGridColumnGroupSpec('Owner Full Name', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Institute', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Date Created', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified')
        ];
    };
    // The table element on the page that will be turned into the DataGrid.  Any preexisting table content will be removed.
    DataGridSpecStudies.prototype.getTableElement = function () {
        return document.getElementById("studiesTable");
    };
    // An array of unique identifiers, used to identify the records in the data set being displayed
    DataGridSpecStudies.prototype.getRecordIDs = function () {
        if (this.dataObj) {
            var ids = Object.getOwnPropertyNames(this.dataObj);
            return ids.map(function (id) {
                return parseInt(id, 10);
            });
        }
        return [];
    };
    DataGridSpecStudies.prototype.pageSize = function (size) {
        if (size === undefined) {
            return this._pageSize;
        }
        else {
            this._pageSize = size;
            return this;
        }
    };
    DataGridSpecStudies.prototype.totalOffset = function (offset) {
        if (offset === undefined) {
            return this._offset;
        }
        else {
            this._offset = offset;
            return this;
        }
    };
    DataGridSpecStudies.prototype.totalSize = function (size) {
        if (size === undefined) {
            return this._size;
        }
        else {
            this._size = size;
            return this;
        }
    };
    DataGridSpecStudies.prototype.viewSize = function () {
        return this.getRecordIDs().length;
    };
    DataGridSpecStudies.prototype.query = function (query) {
        if (query === undefined) {
            return this._query;
        }
        else {
            this._query = query;
            this._offset = 0; // reset offset when query changes
            return this;
        }
    };
    DataGridSpecStudies.prototype.pageDelta = function (delta) {
        this._offset += (delta * this._pageSize);
        return this;
    };
    DataGridSpecStudies.prototype.requestPageOfData = function (callback) {
        var _this = this;
        $.ajax({
            'url': '/study/search/',
            'type': 'GET',
            'data': { 'q': this._query, 'i': this._offset, 'size': this._pageSize },
            'error': function (xhr, status, e) {
                console.log(['Search failed: ', status, ';', e].join(''));
                callback.call({}, false);
            },
            'success': function (data) {
                var docs = data.data;
                if (data.type !== 'Success') {
                    console.log(['Failed to retrieve data: ', data.message].join(''));
                }
                else {
                    _this.data(_this._transformData(docs), docs.numFound, docs.start);
                }
                callback.call({}, data.type === 'Success');
            }
        });
        return this;
    };
    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    DataGridSpecStudies.prototype.createCustomHeaderWidgets = function (dataGrid) {
        // Create a single widget for showing disabled Studies
        var array = [
            new DGStudiesSearchWidget(dataGrid, this, 'Search Studies', 40, true),
            new DGPagingWidget(dataGrid, this, this)
        ];
        return array;
    };
    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    DataGridSpecStudies.prototype.createCustomOptionsWidgets = function (dataGrid) {
        var widgetSet = [];
        // Create a single widget for showing only the Studies that belong to the current user
        var onlyMyStudiesWidget = new DGOnlyMyStudiesWidget(dataGrid, this);
        widgetSet.push(onlyMyStudiesWidget);
        // Create a single widget for showing disabled Studies
        var disabledStudiesWidget = new DGDisabledStudiesWidget(dataGrid, this);
        widgetSet.push(disabledStudiesWidget);
        return widgetSet;
    };
    // This is called after everything is initialized, including the creation of the table content.
    DataGridSpecStudies.prototype.onInitialized = function (dataGrid) {
        // Wire-in our custom edit fields for the Studies page
        IndexPage.initDescriptionEditFields();
    };
    DataGridSpecStudies.prototype.data = function (replacement, totalSize, totalOffset) {
        if (replacement === undefined) {
            return this.dataObj;
        }
        else {
            this.dataObj = replacement;
            this._size = totalSize || this.viewSize();
            this._offset = totalOffset || 0;
        }
        return this;
    };
    DataGridSpecStudies.prototype._transformData = function (data) {
        var _this = this;
        var docs = data.docs;
        var transformed = {};
        docs.forEach(function (doc) {
            var match = new ResultMatcher(_this._query);
            // straightforward matching on name, description, contact, creator_name, initials
            match.findAndSet('name', doc.name).findAndSet('description', doc.description).findAndSet('contact', doc.contact).findAndSet('creator', doc.creator_name).findAndSet('initials', doc.initials);
            // strip the "ID@" portion before matching on metabolite, protocol, part
            (doc.metabolite || []).forEach(function (metabolite) {
                match.findAndSet('metabolite', metabolite.slice(metabolite.indexOf('@') + 1));
            });
            (doc.protocol || []).forEach(function (protocol) {
                match.findAndSet('protocol', protocol.slice(protocol.indexOf('@') + 1));
            });
            (doc.part || []).forEach(function (part) {
                match.findAndSet('part', part.slice(part.indexOf('@') + 1));
            });
            transformed[doc.id] = {
                'n': doc.name,
                'id': doc.id,
                'active': doc.active,
                'des': doc.description,
                'con': doc.contact,
                'own': doc.creator,
                'write': doc.writable,
                'cr': doc.created,
                'mod': doc.modified,
                'ownerName': doc.creator_name,
                'ownerEmail': doc.creator_email,
                'initials': doc.initials,
                'match': match
            };
        });
        return transformed;
    };
    return DataGridSpecStudies;
})(DataGridSpecBase);
// initialized with a query string, can search study fields for matches to query terms
var ResultMatcher = (function () {
    function ResultMatcher(query) {
        this._query = query.split(/\s+/);
        this._match = {};
    }
    // searches for constructor text query in the source string, saving to field name if found
    ResultMatcher.prototype.findAndSet = function (field, source) {
        var _this = this;
        var index;
        var lower = source.toLocaleLowerCase();
        this._query.forEach(function (q) {
            if ((index = lower.indexOf(q.toLocaleLowerCase())) >= 0) {
                (_this._match[field] = _this._match[field] || []).push({
                    begin: index,
                    end: index + q.length,
                    source: source
                });
            }
        });
        return this;
    };
    ResultMatcher.prototype.getFields = function () {
        return Object.getOwnPropertyNames(this._match);
    };
    // returns array of strings marked as matching the constructor text query
    ResultMatcher.prototype.getMatches = function (field, prefix, postfix, slop) {
        slop = slop === undefined ? Number.MAX_VALUE : slop;
        return (this._match[field] || []).map(function (text) {
            var length = text.source.length, start = Math.max(0, text.begin - slop), finish = Math.min(text.end + slop, length), parts = [
                text.source.slice(start, text.begin),
                prefix || '',
                text.source.slice(text.begin, text.end),
                postfix || '',
                text.source.slice(text.end, finish)
            ];
            if (start > 0)
                parts.unshift('…');
            if (finish < length)
                parts.push('…');
            return parts.join('');
        });
    };
    return ResultMatcher;
})();
// This is a DataGridHeaderWidget derived from DGSearchWidget.
// It's a search field that offers options for additional data types, querying the server for results.
var DGStudiesSearchWidget = (function (_super) {
    __extends(DGStudiesSearchWidget, _super);
    function DGStudiesSearchWidget(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus) {
        var _this = this;
        _super.call(this, dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
        // OVERRIDE
        // We don't at all want to do what the base widget does here, not all data is local
        this.typingDelayExpirationHandler = function () {
            var input = $(_this.element);
            var v = input.val();
            // ignore if the following keys are pressed: [del] [shift] [capslock]
            if (_this.lastKeyPressCode > 8 && _this.lastKeyPressCode < 32) {
                return;
            }
            else if (v === _this.previousSelection) {
                return;
            }
            _this.previousSelection = v;
            input.addClass('wait');
            _this._spec.query(v).requestPageOfData(function (success) {
                input.removeClass('wait').toggleClass('error', success);
                if (success) {
                    _this._grid.triggerDataReset();
                }
            });
        };
        this._grid = dataGridOwnerObject;
        this._spec = dataGridSpec;
    }
    // This is called to append the widget elements beneath the given element.
    // If the elements have not been created yet, they are created, and the uniqueID is passed along.
    DGStudiesSearchWidget.prototype.appendElements = function (container, uniqueID) {
        _super.prototype.appendElements.call(this, container, uniqueID);
        var span = document.createElement("span");
        var spanID = this.dataGridSpec.tableSpec.id + 'SearchDisc' + uniqueID;
        span.setAttribute('id', spanID);
        span.className = 'searchDisclosure';
        this.searchDisclosureElement = span;
        container.appendChild(this.searchDisclosureElement);
    };
    // OVERRIDE
    // HEY GUYS WE DON'T NEED TO FILTER HERE ANYMORE
    DGStudiesSearchWidget.prototype.applyFilterToIDs = function (rowIDs) {
        return rowIDs;
    };
    // OVERRIDE
    // We want to work slightly differently from base widget, where return does nothing
    DGStudiesSearchWidget.prototype.inputKeyDownHandler = function (e) {
        // still do everything previous handler does
        _super.prototype.inputKeyDownHandler.call(this, e);
        // we will handle return differently
        if (e.keyCode === 13) {
        }
    };
    return DGStudiesSearchWidget;
})(DGSearchWidget);
// Here's an example of a working DataGridOptionWidget.
// When checked, this hides all Studies that are not owned by the current user.
var DGOnlyMyStudiesWidget = (function (_super) {
    __extends(DGOnlyMyStudiesWidget, _super);
    function DGOnlyMyStudiesWidget(grid, spec) {
        _super.call(this, grid, spec);
        this._spec = spec;
    }
    DGOnlyMyStudiesWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'ShowMyStudiesCB' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) { return _this.dataGridOwnerObject.clickedOptionWidget(e); });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('My Studies Only', cbID);
        this._createdElements = true;
    };
    DGOnlyMyStudiesWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var checked = false;
        if (this.checkBoxElement.checked) {
            checked = true;
        }
        // If the box is not checked, return the set of IDs unfiltered
        if (!checked) {
            return rowIDs;
        }
        // If for some crazy reason there's no current user ID set, do not filter
        if (!EDDData.currentUserID) {
            return rowIDs;
        }
        var filteredIDs = [];
        var data = this._spec.data();
        for (var r = 0; r < rowIDs.length; r++) {
            var id = rowIDs[r];
            // Here is the condition that determines whether the rows associated with this ID are shown or hidden.
            if (data[id].own == EDDData.currentUserID) {
                filteredIDs.push(id);
            }
        }
        return filteredIDs;
    };
    DGOnlyMyStudiesWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        var data = this._spec.data();
        if (data[rowID].dis) {
            for (var r = 0; r < dataRowObjects.length; r++) {
                var rowElement = dataRowObjects[r].getElement();
                rowElement.style.backgroundColor = "#FFC0C0";
            }
        }
    };
    return DGOnlyMyStudiesWidget;
})(DataGridOptionWidget);
// Here's another example of a working DataGridOptionWidget.
// When unchecked, this hides the set of Studies that are marked as disabled.
var DGDisabledStudiesWidget = (function (_super) {
    __extends(DGDisabledStudiesWidget, _super);
    function DGDisabledStudiesWidget(grid, spec) {
        _super.call(this, grid, spec);
        this._spec = spec;
    }
    DGDisabledStudiesWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'ShowDStudiesCB' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) { return _this.dataGridOwnerObject.clickedOptionWidget(e); });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);
        this._createdElements = true;
    };
    DGDisabledStudiesWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var checked = false;
        if (this.checkBoxElement.checked) {
            checked = true;
        }
        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        var filteredIDs = [];
        var data = this._spec.data();
        for (var r = 0; r < rowIDs.length; r++) {
            var id = rowIDs[r];
            // Here is the condition that determines whether the rows associated with this ID are shown or hidden.
            if (data[id].active) {
                filteredIDs.push(id);
            }
        }
        return filteredIDs;
    };
    DGDisabledStudiesWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        var data = this._spec.data();
        if (data[rowID].dis) {
            for (var r = 0; r < dataRowObjects.length; r++) {
                var rowElement = dataRowObjects[r].getElement();
                rowElement.style.backgroundColor = "#FFC0C0";
            }
        }
    };
    return DGDisabledStudiesWidget;
})(DataGridOptionWidget);
window.addEventListener('load', function () {
    IndexPage.prepareIt();
}, false);
//# sourceMappingURL=index.js.map