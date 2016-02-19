// Compiled to JS on: Thu Feb 18 2016 16:47:14  
/// <reference path="EDDDataInterface.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="Utl.ts" />
/// <reference path="lib/jquery.d.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var IndexPage;
(function (IndexPage) {
    var studiesDataGridSpec = null;
    var studiesDataGrid = null;
    // Called when the page loads.
    function prepareIt() {
        $('.disclose').find('.discloseLink').on('click', disclose);
        IndexPage.prepareTable();
    }
    IndexPage.prepareIt = prepareIt;
    function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }
    IndexPage.disclose = disclose;
    function prepareTable() {
        var _this = this;
        // Instantiate a table specification for the Studies table
        this.studiesDataGridSpec = new DataGridSpecStudies();
        // Instantiate the table itself with the spec
        this.studiesDataGrid = new DataGrid(this.studiesDataGridSpec);
        this.studiesDataGridSpec.requestPageOfData(function (success) {
            if (success)
                _this.studiesDataGrid.triggerDataReset();
        });
    }
    IndexPage.prepareTable = prepareTable;
})(IndexPage || (IndexPage = {}));
;
// The spec object that will be passed to DataGrid to create the Studies table
var DataGridSpecStudies = (function (_super) {
    __extends(DataGridSpecStudies, _super);
    function DataGridSpecStudies() {
        _super.apply(this, arguments);
        this.recordIds = [];
        this._size = 0;
        this._offset = 0;
        this._pageSize = 50;
        this._query = '';
        this._searchOpt = {};
    }
    // Specification for the table as a whole
    DataGridSpecStudies.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('studies', { 'name': 'Studies' });
    };
    // Specification for the headers along the top of the table
    DataGridSpecStudies.prototype.defineHeaderSpec = function () {
        // capture here, as the `this` variable below will point to global object, not this object
        var self = this;
        return [
            new DataGridHeaderSpec(1, 'hStudyName', {
                'name': 'Study Name',
                'nowrap': true,
                'sortId': 'name_s' }),
            new DataGridHeaderSpec(2, 'hStudyDesc', {
                'name': 'Description',
                'sortId': 'desc_s' }),
            new DataGridHeaderSpec(3, 'hStudyOwnerInitials', {
                'name': 'Owner',
                'sortId': 'initials' }),
            new DataGridHeaderSpec(4, 'hStudyOwnerFullName', {
                'name': 'Owner Full Name',
                'nowrap': true,
                'sortId': 'creator_s' }),
            new DataGridHeaderSpec(5, 'hStudyOwnerInstitute', {
                'name': 'Institute',
                'nowrap': true }),
            new DataGridHeaderSpec(6, 'hStudyCreated', {
                'name': 'Created',
                'sortId': 'created' }),
            new DataGridHeaderSpec(7, 'hStudyMod', {
                'name': 'Last Modified',
                'sortId': 'modified' })
        ];
    };
    DataGridSpecStudies.prototype.generateStudyNameCells = function (gridSpec, index) {
        var studyDoc = gridSpec.dataObj[index];
        var sideMenuItems = [];
        var match = studyDoc.match;
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
                'contentString': ['<a href="', studyDoc.url, '" class="darker">', studyDoc.n, '</a>'].join('')
            })
        ];
    };
    DataGridSpecStudies.prototype.generateDescriptionCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'maxWidth': '400',
                'customID': function (id) { return 'editableDescriptionField' + id; },
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
            this.descriptionCol = new DataGridColumnSpec(2, this.generateDescriptionCells),
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
        return this.recordIds;
    };
    DataGridSpecStudies.prototype.enableSort = function (grid) {
        var _this = this;
        _super.prototype.enableSort.call(this, grid);
        this.tableHeaderSpec.forEach(function (header) {
            if (header.sortId) {
                // remove any events from super in favor of our own
                $(header.element).off('click.datatable').on('click.datatable', function (ev) {
                    _this.columnSort(grid, header, ev);
                });
            }
        });
        return this;
    };
    DataGridSpecStudies.prototype.columnSort = function (grid, header, ev) {
        var sort = grid.sortCols(), oldSort, newSort, sortOpt;
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
            newSort = sort.filter(function (v) { return v.spec.sortId === header.sortId; });
            oldSort = sort.filter(function (v) { return v.spec.sortId !== header.sortId; });
            // if column already sorted, flip asc; move column to front of sort list
            if (newSort.length) {
                newSort[0].asc = !newSort[0].asc;
                (sort = oldSort).unshift(newSort[0]);
            }
            else {
                sort.unshift({ spec: header, asc: true });
            }
        }
        else if (sort.length === 1 && sort[0].spec.sortId === header.sortId) {
            sort[0].asc = !sort[0].asc;
        }
        else {
            sort = [{ spec: header, asc: true }];
        }
        grid.sortCols(sort);
        // convert to sort strings, filter out falsy values, join with commas
        sortOpt = sort.map(function (col) {
            if (col.spec.sortId)
                return col.spec.sortId + (col.asc ? ' asc' : ' desc');
        }).filter(Boolean).join(',');
        // store in options object, as grid will not be available in requestPageOfData
        $.extend(this._searchOpt, { 'sort': sortOpt });
        this.requestPageOfData(function (success) {
            if (success)
                grid.triggerDataReset();
        });
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
    DataGridSpecStudies.prototype.filter = function (opt) {
        if (opt === undefined) {
            return this._searchOpt;
        }
        else {
            this._searchOpt = opt;
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
            'data': $.extend({}, this._searchOpt, {
                'q': this._query,
                'i': this._offset,
                'size': this._pageSize
            }),
            'error': function (xhr, status, e) {
                console.log(['Search failed: ', status, ';', e].join(''));
                callback && callback.call({}, false);
            },
            'success': function (data) {
                _this.data(data.docs, data.numFound, data.start);
                callback && callback.call({}, true);
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
    };
    DataGridSpecStudies.prototype.data = function (replacement, totalSize, totalOffset) {
        if (replacement === undefined) {
            return this.dataObj;
        }
        else {
            this.dataObj = this._transformData(replacement); // transform also handles storing sort keys
            this._size = totalSize || this.viewSize();
            this._offset = totalOffset || 0;
        }
        return this;
    };
    DataGridSpecStudies.prototype._transformData = function (docs) {
        var _this = this;
        var transformed = {};
        this.recordIds = docs.map(function (doc) {
            var match = new ResultMatcher(_this._query);
            // straightforward matching on name, description, contact, creator_name, initials
            match.findAndSet('name', doc.name)
                .findAndSet('description', doc.description)
                .findAndSet('contact', doc.contact)
                .findAndSet('creator', doc.creator_name)
                .findAndSet('initials', doc.initials);
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
                'url': doc.url,
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
            return doc.id;
        });
        return transformed;
    };
    return DataGridSpecStudies;
})(DataGridSpecBase);
// initialized with a query string, can search study fields for matches to query terms
var ResultMatcher = (function () {
    function ResultMatcher(query) {
        this._query = query.split(/\s+/).filter(function (x) { return x.length > 0; });
        this._match = {};
    }
    // searches for constructor text query in the source string, saving to field name if found
    ResultMatcher.prototype.findAndSet = function (field, source) {
        var _this = this;
        var index;
        var lower = (source || '').toLocaleLowerCase();
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
    function DGStudiesSearchWidget(grid, spec, placeHolder, size, getsFocus) {
        var _this = this;
        _super.call(this, grid, spec, placeHolder, size, getsFocus);
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
                    _this.dataGridOwnerObject.triggerDataReset();
                }
            });
        };
        this._spec = spec;
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
            this.typingDelayExpirationHandler.call({});
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
    DGOnlyMyStudiesWidget.prototype.getIDFragment = function () {
        return 'ShowMyStudiesCB';
    };
    DGOnlyMyStudiesWidget.prototype.getLabelText = function () {
        return 'My Studies Only';
    };
    DGOnlyMyStudiesWidget.prototype.onWidgetChange = function (e) {
        var _this = this;
        // update spec with filter options
        var filter = this._spec.filter();
        if (this.checkBoxElement.checked) {
            $.extend(filter, { 'showMine': 1 });
        }
        else {
            delete filter.showMine;
        }
        this._spec.filter(filter).requestPageOfData(function (success) {
            if (success) {
                _this.dataGridOwnerObject.triggerDataReset();
            }
        });
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
    DGDisabledStudiesWidget.prototype.getIDFragment = function () {
        return 'ShowDStudiesCB';
    };
    DGDisabledStudiesWidget.prototype.getLabelText = function () {
        return 'Show Disabled';
    };
    DGDisabledStudiesWidget.prototype.onWidgetChange = function (e) {
        var _this = this;
        // update spec with filter options
        var filter = this._spec.filter();
        if (this.checkBoxElement.checked) {
            $.extend(filter, { 'showDisabled': 1 });
        }
        else {
            delete filter.showDisabled;
        }
        this._spec.filter(filter).requestPageOfData(function (success) {
            if (success) {
                _this.dataGridOwnerObject.triggerDataReset();
            }
        });
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
// use JQuery ready event shortcut to call prepareIt when page is ready
$(IndexPage.prepareIt);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOlsiSW5kZXhQYWdlIiwiSW5kZXhQYWdlLnByZXBhcmVJdCIsIkluZGV4UGFnZS5kaXNjbG9zZSIsIkluZGV4UGFnZS5wcmVwYXJlVGFibGUiLCJEYXRhR3JpZFNwZWNTdHVkaWVzIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5jb25zdHJ1Y3RvciIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZGVmaW5lVGFibGVTcGVjIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5kZWZpbmVIZWFkZXJTcGVjIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZW5lcmF0ZVN0dWR5TmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZW5lcmF0ZURlc2NyaXB0aW9uQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlT3duZXJJbml0aWFsc0NlbGxzIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZW5lcmF0ZU93bmVyTmFtZUNlbGxzIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZW5lcmF0ZUluc3RpdHV0aW9uQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlQ3JlYXRlZENlbGxzIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZW5lcmF0ZU1vZGlmaWVkQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmRlZmluZUNvbHVtblNwZWMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmRlZmluZUNvbHVtbkdyb3VwU3BlYyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZ2V0VGFibGVFbGVtZW50IiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZXRSZWNvcmRJRHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmVuYWJsZVNvcnQiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmNvbHVtblNvcnQiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLnBhZ2VTaXplIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy50b3RhbE9mZnNldCIsIkRhdGFHcmlkU3BlY1N0dWRpZXMudG90YWxTaXplIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy52aWV3U2l6ZSIsIkRhdGFHcmlkU3BlY1N0dWRpZXMucXVlcnkiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmZpbHRlciIsIkRhdGFHcmlkU3BlY1N0dWRpZXMucGFnZURlbHRhIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5yZXF1ZXN0UGFnZU9mRGF0YSIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLm9uSW5pdGlhbGl6ZWQiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmRhdGEiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLl90cmFuc2Zvcm1EYXRhIiwiUmVzdWx0TWF0Y2hlciIsIlJlc3VsdE1hdGNoZXIuY29uc3RydWN0b3IiLCJSZXN1bHRNYXRjaGVyLmZpbmRBbmRTZXQiLCJSZXN1bHRNYXRjaGVyLmdldEZpZWxkcyIsIlJlc3VsdE1hdGNoZXIuZ2V0TWF0Y2hlcyIsIkRHU3R1ZGllc1NlYXJjaFdpZGdldCIsIkRHU3R1ZGllc1NlYXJjaFdpZGdldC5jb25zdHJ1Y3RvciIsIkRHU3R1ZGllc1NlYXJjaFdpZGdldC5hcHBlbmRFbGVtZW50cyIsIkRHU3R1ZGllc1NlYXJjaFdpZGdldC5hcHBseUZpbHRlclRvSURzIiwiREdTdHVkaWVzU2VhcmNoV2lkZ2V0LmlucHV0S2V5RG93bkhhbmRsZXIiLCJER09ubHlNeVN0dWRpZXNXaWRnZXQiLCJER09ubHlNeVN0dWRpZXNXaWRnZXQuY29uc3RydWN0b3IiLCJER09ubHlNeVN0dWRpZXNXaWRnZXQuZ2V0SURGcmFnbWVudCIsIkRHT25seU15U3R1ZGllc1dpZGdldC5nZXRMYWJlbFRleHQiLCJER09ubHlNeVN0dWRpZXNXaWRnZXQub25XaWRnZXRDaGFuZ2UiLCJER0Rpc2FibGVkU3R1ZGllc1dpZGdldCIsIkRHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQuZ2V0SURGcmFnbWVudCIsIkRHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0LmdldExhYmVsVGV4dCIsIkRHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0Lm9uV2lkZ2V0Q2hhbmdlIiwiREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQuaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQiXSwibWFwcGluZ3MiOiJBQUFBLDRDQUE0QztBQUM1QyxvQ0FBb0M7QUFDcEMsK0JBQStCO0FBQy9CLHdDQUF3Qzs7Ozs7O0FBSXhDLElBQU8sU0FBUyxDQXlCZjtBQXpCRCxXQUFPLFNBQVMsRUFBQyxDQUFDO0lBRWpCQSxJQUFJQSxtQkFBbUJBLEdBQXVCQSxJQUFJQSxDQUFDQTtJQUNuREEsSUFBSUEsZUFBZUEsR0FBWUEsSUFBSUEsQ0FBQ0E7SUFFcENBLDhCQUE4QkE7SUFDOUJBO1FBQ09DLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQzNEQSxTQUFTQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7SUFIZUQsbUJBQVNBLFlBR3hCQSxDQUFBQTtJQUVFQTtRQUNJRSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUN6REEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBSGVGLGtCQUFRQSxXQUd2QkEsQ0FBQUE7SUFFSkE7UUFBQUcsaUJBUUNBO1FBUEFBLDBEQUEwREE7UUFDMURBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsSUFBSUEsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUNyREEsNkNBQTZDQTtRQUM3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Q0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEZBLENBQUNBLENBQUNBLENBQUNBO1lBQ0hBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLFFBQWVBO2dCQUN6Q0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ0hBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLElBQVdBO2dCQUNqQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEVBLENBQUNBLENBQUNBLENBQUNBO1lBQ0hBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBO2dCQUNsQkEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsSUFBSUE7Z0JBQ2JBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBO2dCQUNaQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxHQUFHQTtnQkFDZEEsUUFBUUEsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUE7Z0JBQ3BCQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxXQUFXQTtnQkFDdEJBLEtBQUtBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BO2dCQUNsQkEsS0FBS0EsRUFBRUEsR0FBR0EsQ0FBQ0EsT0FBT0E7Z0JBQ2xCQSxPQUFPQSxFQUFFQSxHQUFHQSxDQUFD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QVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJFREREYXRhSW50ZXJmYWNlLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJsaWIvanF1ZXJ5LmQudHNcIiAvPlxuXG5kZWNsYXJlIHZhciBFREREYXRhOkVERERhdGE7ICAvLyBzdGlja2luZyB0aGlzIGhlcmUgYXMgSURFIGlzbid0IGZvbGxvd2luZyByZWZlcmVuY2VzXG5cbm1vZHVsZSBJbmRleFBhZ2Uge1xuXG5cdHZhciBzdHVkaWVzRGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMgPSBudWxsO1xuXHR2YXIgc3R1ZGllc0RhdGFHcmlkOkRhdGFHcmlkID0gbnVsbDtcblxuXHQvLyBDYWxsZWQgd2hlbiB0aGUgcGFnZSBsb2Fkcy5cblx0ZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVJdCgpIHtcbiAgICAgICAgJCgnLmRpc2Nsb3NlJykuZmluZCgnLmRpc2Nsb3NlTGluaycpLm9uKCdjbGljaycsIGRpc2Nsb3NlKTtcbiAgICAgICAgSW5kZXhQYWdlLnByZXBhcmVUYWJsZSgpO1xuXHR9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZGlzY2xvc2UoKSB7XG4gICAgICAgICQodGhpcykuY2xvc2VzdCgnLmRpc2Nsb3NlJykudG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlVGFibGUoKSB7XG5cdFx0Ly8gSW5zdGFudGlhdGUgYSB0YWJsZSBzcGVjaWZpY2F0aW9uIGZvciB0aGUgU3R1ZGllcyB0YWJsZVxuXHRcdHRoaXMuc3R1ZGllc0RhdGFHcmlkU3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNTdHVkaWVzKCk7XG5cdFx0Ly8gSW5zdGFudGlhdGUgdGhlIHRhYmxlIGl0c2VsZiB3aXRoIHRoZSBzcGVjXG5cdFx0dGhpcy5zdHVkaWVzRGF0YUdyaWQgPSBuZXcgRGF0YUdyaWQodGhpcy5zdHVkaWVzRGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5zdHVkaWVzRGF0YUdyaWRTcGVjLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzKSA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2VzcykgdGhpcy5zdHVkaWVzRGF0YUdyaWQudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICB9KTtcblx0fVxufTtcblxuXG4vLyBUaGUgc3BlYyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBEYXRhR3JpZCB0byBjcmVhdGUgdGhlIFN0dWRpZXMgdGFibGVcbmNsYXNzIERhdGFHcmlkU3BlY1N0dWRpZXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIGltcGxlbWVudHMgREdQYWdlRGF0YVNvdXJjZSB7XG5cbiAgICAvLyBzcGVjIG9iamVjdCB0cmFja3Mgd2hhdCBkYXRhIHNob3VsZCBiZSBkaXNwbGF5ZWQgYnkgdGhlIHRhYmxlXG4gICAgcHJpdmF0ZSBkYXRhT2JqOnt9O1xuICAgIHByaXZhdGUgcmVjb3JkSWRzOnN0cmluZ1tdID0gW107XG4gICAgcHJpdmF0ZSBfc2l6ZTpudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgX29mZnNldDpudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgX3BhZ2VTaXplOm51bWJlciA9IDUwO1xuICAgIHByaXZhdGUgX3F1ZXJ5OnN0cmluZyA9ICcnO1xuICAgIHByaXZhdGUgX3NlYXJjaE9wdCA9IHt9O1xuICAgIGRlc2NyaXB0aW9uQ29sOkRhdGFHcmlkQ29sdW1uU3BlYztcblxuXHQvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuXHRkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ3N0dWRpZXMnLCB7ICduYW1lJzogJ1N0dWRpZXMnIH0pO1xuXHR9XG5cblx0Ly8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcblx0ZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgLy8gY2FwdHVyZSBoZXJlLCBhcyB0aGUgYHRoaXNgIHZhcmlhYmxlIGJlbG93IHdpbGwgcG9pbnQgdG8gZ2xvYmFsIG9iamVjdCwgbm90IHRoaXMgb2JqZWN0XG4gICAgICAgIHZhciBzZWxmOkRhdGFHcmlkU3BlY1N0dWRpZXMgPSB0aGlzO1xuXHRcdHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoU3R1ZHlOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1N0dWR5IE5hbWUnLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnbmFtZV9zJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hTdHVkeURlc2MnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnRGVzY3JpcHRpb24nLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnZGVzY19zJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMywgJ2hTdHVkeU93bmVySW5pdGlhbHMnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnT3duZXInLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnaW5pdGlhbHMnIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg0LCAnaFN0dWR5T3duZXJGdWxsTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdPd25lciBGdWxsIE5hbWUnLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnY3JlYXRvcl9zJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSwgJ2hTdHVkeU93bmVySW5zdGl0dXRlJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0luc3RpdHV0ZScsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYsICdoU3R1ZHlDcmVhdGVkJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NyZWF0ZWQnLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnY3JlYXRlZCcgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDcsICdoU3R1ZHlNb2QnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFzdCBNb2RpZmllZCcsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICdtb2RpZmllZCcgfSlcblx0XHRdO1xuXHR9XG5cbiAgICBnZW5lcmF0ZVN0dWR5TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHN0dWR5RG9jID0gZ3JpZFNwZWMuZGF0YU9ialtpbmRleF07XG4gICAgICAgIHZhciBzaWRlTWVudUl0ZW1zID0gW107XG4gICAgICAgIHZhciBtYXRjaDpSZXN1bHRNYXRjaGVyID0gc3R1ZHlEb2MubWF0Y2g7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcyA9IG1hdGNoLmdldEZpZWxkcygpLm1hcCgoZmllbGQpOnN0cmluZyA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoZXMgPSBtYXRjaC5nZXRNYXRjaGVzKGZpZWxkLCAnPHNwYW4gY2xhc3M9XCJzZWFyY2hfbWF0Y2hcIj4nLCAnPC9zcGFuPicsIDEwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ01hdGNoZWQgb24gJyArIGZpZWxkICsgJzogJyArIG1hdGNoZXMuam9pbignLCAnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogc2lkZU1lbnVJdGVtcyxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJzxhIGhyZWY9XCInLCBzdHVkeURvYy51cmwsICdcIiBjbGFzcz1cImRhcmtlclwiPicsIHN0dWR5RG9jLm4sICc8L2E+JyBdLmpvaW4oJycpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlRGVzY3JpcHRpb25DZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnbWF4V2lkdGgnOiAnNDAwJyxcbiAgICAgICAgICAgICAgICAnY3VzdG9tSUQnOiAoaWQpID0+IHsgcmV0dXJuICdlZGl0YWJsZURlc2NyaXB0aW9uRmllbGQnICsgaWQ7IH0sXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBncmlkU3BlYy5kYXRhT2JqW2luZGV4XS5kZXMgfHwgJydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVPd25lckluaXRpYWxzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBncmlkU3BlYy5kYXRhT2JqW2luZGV4XS5pbml0aWFscyB8fCAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVPd25lck5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGdyaWRTcGVjLmRhdGFPYmpbaW5kZXhdLm93bmVyTmFtZSB8fCAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVJbnN0aXR1dGlvbkNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlQ3JlYXRlZENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnV0Y1RvVG9kYXlTdHJpbmcoZ3JpZFNwZWMuZGF0YU9ialtpbmRleF0uY3IpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTW9kaWZpZWRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy51dGNUb1RvZGF5U3RyaW5nKGdyaWRTcGVjLmRhdGFPYmpbaW5kZXhdLm1vZClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cdC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG5cdGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIC8vIGNhcHR1cmUgaGVyZSwgYXMgdGhlIGB0aGlzYCB2YXJpYWJsZSBiZWxvdyB3aWxsIHBvaW50IHRvIGdsb2JhbCBvYmplY3QsIG5vdCB0aGlzIG9iamVjdFxuICAgICAgICB2YXIgc2VsZjpEYXRhR3JpZFNwZWNTdHVkaWVzID0gdGhpcztcblx0XHRyZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCB0aGlzLmdlbmVyYXRlU3R1ZHlOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgdGhpcy5kZXNjcmlwdGlvbkNvbCA9IG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiwgdGhpcy5nZW5lcmF0ZURlc2NyaXB0aW9uQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzLCB0aGlzLmdlbmVyYXRlT3duZXJJbml0aWFsc0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCwgdGhpcy5nZW5lcmF0ZU93bmVyTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNSwgdGhpcy5nZW5lcmF0ZUluc3RpdHV0aW9uQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2LCB0aGlzLmdlbmVyYXRlQ3JlYXRlZENlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNywgdGhpcy5nZW5lcmF0ZU1vZGlmaWVkQ2VsbHMpXG5cdFx0XTtcblx0fVxuXG5cdC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG5cdGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuXHRcdHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ1N0dWR5IE5hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdEZXNjcmlwdGlvbicpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdPd25lciBJbml0aWFscycpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdPd25lciBGdWxsIE5hbWUnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdJbnN0aXR1dGUnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdEYXRlIENyZWF0ZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYXN0IE1vZGlmaWVkJylcblx0XHRdO1xuXHR9XG5cblx0Ly8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZSBjb250ZW50IHdpbGwgYmUgcmVtb3ZlZC5cblx0Z2V0VGFibGVFbGVtZW50KCkge1xuXHRcdHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0dWRpZXNUYWJsZVwiKTtcblx0fVxuXG5cdC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycywgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGUgZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG5cdGdldFJlY29yZElEcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVjb3JkSWRzO1xuXHR9XG5cbiAgICBlbmFibGVTb3J0KGdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkU3BlY1N0dWRpZXMge1xuICAgICAgICBzdXBlci5lbmFibGVTb3J0KGdyaWQpO1xuICAgICAgICB0aGlzLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChoZWFkZXIuc29ydElkKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGFueSBldmVudHMgZnJvbSBzdXBlciBpbiBmYXZvciBvZiBvdXIgb3duXG4gICAgICAgICAgICAgICAgJChoZWFkZXIuZWxlbWVudCkub2ZmKCdjbGljay5kYXRhdGFibGUnKS5vbignY2xpY2suZGF0YXRhYmxlJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sdW1uU29ydChncmlkLCBoZWFkZXIsIGV2KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29sdW1uU29ydChncmlkOkRhdGFHcmlkLCBoZWFkZXI6RGF0YUdyaWRIZWFkZXJTcGVjLCBldik6YW55IHtcbiAgICAgICAgdmFyIHNvcnQgPSBncmlkLnNvcnRDb2xzKCksIG9sZFNvcnQsIG5ld1NvcnQsIHNvcnRPcHQ7XG4gICAgICAgIGlmIChldi5zaGlmdEtleSB8fCBldi5jdHJsS2V5IHx8IGV2Lm1ldGFLZXkpIHtcbiAgICAgICAgICAgIG5ld1NvcnQgPSBzb3J0LmZpbHRlcigodikgPT4geyByZXR1cm4gdi5zcGVjLnNvcnRJZCA9PT0gaGVhZGVyLnNvcnRJZDsgfSk7XG4gICAgICAgICAgICBvbGRTb3J0ID0gc29ydC5maWx0ZXIoKHYpID0+IHsgcmV0dXJuIHYuc3BlYy5zb3J0SWQgIT09IGhlYWRlci5zb3J0SWQ7IH0pO1xuICAgICAgICAgICAgLy8gaWYgY29sdW1uIGFscmVhZHkgc29ydGVkLCBmbGlwIGFzYzsgbW92ZSBjb2x1bW4gdG8gZnJvbnQgb2Ygc29ydCBsaXN0XG4gICAgICAgICAgICBpZiAobmV3U29ydC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBuZXdTb3J0WzBdLmFzYyA9ICFuZXdTb3J0WzBdLmFzYztcbiAgICAgICAgICAgICAgICAoc29ydCA9IG9sZFNvcnQpLnVuc2hpZnQobmV3U29ydFswXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNvcnQudW5zaGlmdCh7IHNwZWM6IGhlYWRlciwgYXNjOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNvcnQubGVuZ3RoID09PSAxICYmIHNvcnRbMF0uc3BlYy5zb3J0SWQgPT09IGhlYWRlci5zb3J0SWQpIHtcbiAgICAgICAgICAgIHNvcnRbMF0uYXNjID0gIXNvcnRbMF0uYXNjO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydCA9IFsgeyBzcGVjOiBoZWFkZXIsIGFzYzogdHJ1ZSB9IF07XG4gICAgICAgIH1cbiAgICAgICAgZ3JpZC5zb3J0Q29scyhzb3J0KTtcbiAgICAgICAgLy8gY29udmVydCB0byBzb3J0IHN0cmluZ3MsIGZpbHRlciBvdXQgZmFsc3kgdmFsdWVzLCBqb2luIHdpdGggY29tbWFzXG4gICAgICAgIHNvcnRPcHQgPSBzb3J0Lm1hcCgoY29sOkRhdGFHcmlkU29ydCkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbC5zcGVjLnNvcnRJZCkgcmV0dXJuIGNvbC5zcGVjLnNvcnRJZCArIChjb2wuYXNjID8gJyBhc2MnIDogJyBkZXNjJyk7XG4gICAgICAgIH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCcsJyk7XG4gICAgICAgIC8vIHN0b3JlIGluIG9wdGlvbnMgb2JqZWN0LCBhcyBncmlkIHdpbGwgbm90IGJlIGF2YWlsYWJsZSBpbiByZXF1ZXN0UGFnZU9mRGF0YVxuICAgICAgICAkLmV4dGVuZCh0aGlzLl9zZWFyY2hPcHQsIHsgJ3NvcnQnOiBzb3J0T3B0IH0pO1xuICAgICAgICB0aGlzLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzKSA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2VzcykgZ3JpZC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHBhZ2VTaXplKCk6bnVtYmVyO1xuICAgIHBhZ2VTaXplKHNpemU6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHBhZ2VTaXplKHNpemU/Om51bWJlcik6YW55IHtcbiAgICAgICAgaWYgKHNpemUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BhZ2VTaXplO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcGFnZVNpemUgPSBzaXplO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b3RhbE9mZnNldCgpOm51bWJlcjtcbiAgICB0b3RhbE9mZnNldChvZmZzZXQ6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHRvdGFsT2Zmc2V0KG9mZnNldD86bnVtYmVyKTphbnkge1xuICAgICAgICBpZiAob2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9vZmZzZXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9vZmZzZXQgPSBvZmZzZXQ7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvdGFsU2l6ZSgpOm51bWJlcjtcbiAgICB0b3RhbFNpemUoc2l6ZTpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgdG90YWxTaXplKHNpemU/Om51bWJlcik6YW55IHtcbiAgICAgICAgaWYgKHNpemUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NpemU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zaXplID0gc2l6ZTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmlld1NpemUoKTpudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRSZWNvcmRJRHMoKS5sZW5ndGg7XG4gICAgfVxuXG4gICAgcXVlcnkoKTpzdHJpbmc7XG4gICAgcXVlcnkocXVlcnk6c3RyaW5nKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHF1ZXJ5KHF1ZXJ5PzpzdHJpbmcpOmFueSB7XG4gICAgICAgIGlmIChxdWVyeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcXVlcnk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHF1ZXJ5O1xuICAgICAgICAgICAgdGhpcy5fb2Zmc2V0ID0gMDsgLy8gcmVzZXQgb2Zmc2V0IHdoZW4gcXVlcnkgY2hhbmdlc1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmaWx0ZXIoKTphbnk7XG4gICAgZmlsdGVyKG9wdDphbnkpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgZmlsdGVyKG9wdD86YW55KTphbnkge1xuICAgICAgICBpZiAob3B0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zZWFyY2hPcHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zZWFyY2hPcHQgPSBvcHQ7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhZ2VEZWx0YShkZWx0YTpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2Uge1xuICAgICAgICB0aGlzLl9vZmZzZXQgKz0gKGRlbHRhICogdGhpcy5fcGFnZVNpemUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICByZXF1ZXN0UGFnZU9mRGF0YShjYWxsYmFjaz86KHN1Y2Nlc3M6Ym9vbGVhbikgPT4gdm9pZCk6REdQYWdlRGF0YVNvdXJjZSB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAndXJsJzogJy9zdHVkeS9zZWFyY2gvJyxcbiAgICAgICAgICAgICd0eXBlJzogJ0dFVCcsXG4gICAgICAgICAgICAnZGF0YSc6ICQuZXh0ZW5kKHt9LCB0aGlzLl9zZWFyY2hPcHQsIHtcbiAgICAgICAgICAgICAgICAncSc6IHRoaXMuX3F1ZXJ5LFxuICAgICAgICAgICAgICAgICdpJzogdGhpcy5fb2Zmc2V0LFxuICAgICAgICAgICAgICAgICdzaXplJzogdGhpcy5fcGFnZVNpemVcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydTZWFyY2ggZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZV0uam9pbignJykpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoe30sIGZhbHNlKTtcbiAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YShkYXRhLmRvY3MsIGRhdGEubnVtRm91bmQsIGRhdGEuc3RhcnQpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoe30sIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG5cdC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuXG5cdC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuXHRjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcblx0XHQvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIFN0dWRpZXNcbiAgICAgICAgdmFyIGFycmF5OkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10gPSBbXG4gICAgICAgICAgICBuZXcgREdTdHVkaWVzU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIFN0dWRpZXMnLCA0MCwgdHJ1ZSksXG4gICAgICAgICAgICBuZXcgREdQYWdpbmdXaWRnZXQoZGF0YUdyaWQsIHRoaXMsIHRoaXMpXG4gICAgICAgIF07XG4gICAgICAgIHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG5cdC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LlxuXHQvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cblx0Y3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuXHRcdHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBvbmx5IHRoZSBTdHVkaWVzIHRoYXQgYmVsb25nIHRvIHRoZSBjdXJyZW50IHVzZXJcblx0XHR2YXIgb25seU15U3R1ZGllc1dpZGdldCA9IG5ldyBER09ubHlNeVN0dWRpZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuXHRcdHdpZGdldFNldC5wdXNoKG9ubHlNeVN0dWRpZXNXaWRnZXQpO1xuXHRcdC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgU3R1ZGllc1xuXHRcdHZhciBkaXNhYmxlZFN0dWRpZXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuXHRcdHdpZGdldFNldC5wdXNoKGRpc2FibGVkU3R1ZGllc1dpZGdldCk7XG5cdFx0cmV0dXJuIHdpZGdldFNldDtcblx0fVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG5cdG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXHR9XG5cbiAgICBkYXRhKCk6YW55O1xuICAgIGRhdGEocmVwbGFjZW1lbnQ6YW55W10sIHRvdGFsU2l6ZT86bnVtYmVyLCB0b3RhbE9mZnNldD86bnVtYmVyKTpEYXRhR3JpZFNwZWNTdHVkaWVzO1xuICAgIGRhdGEocmVwbGFjZW1lbnQ/OmFueVtdLCB0b3RhbFNpemU/Om51bWJlciwgdG90YWxPZmZzZXQ/Om51bWJlcik6YW55IHtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRhdGFPYmo7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFPYmogPSB0aGlzLl90cmFuc2Zvcm1EYXRhKHJlcGxhY2VtZW50KTsgLy8gdHJhbnNmb3JtIGFsc28gaGFuZGxlcyBzdG9yaW5nIHNvcnQga2V5c1xuICAgICAgICAgICAgdGhpcy5fc2l6ZSA9IHRvdGFsU2l6ZSB8fCB0aGlzLnZpZXdTaXplKCk7XG4gICAgICAgICAgICB0aGlzLl9vZmZzZXQgPSB0b3RhbE9mZnNldCB8fCAwO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgX3RyYW5zZm9ybURhdGEoZG9jczphbnlbXSk6YW55IHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkID0ge307XG4gICAgICAgIHRoaXMucmVjb3JkSWRzID0gZG9jcy5tYXAoKGRvYyk6c3RyaW5nID0+IHtcbiAgICAgICAgICAgIHZhciBtYXRjaCA9IG5ldyBSZXN1bHRNYXRjaGVyKHRoaXMuX3F1ZXJ5KTtcbiAgICAgICAgICAgIC8vIHN0cmFpZ2h0Zm9yd2FyZCBtYXRjaGluZyBvbiBuYW1lLCBkZXNjcmlwdGlvbiwgY29udGFjdCwgY3JlYXRvcl9uYW1lLCBpbml0aWFsc1xuICAgICAgICAgICAgbWF0Y2guZmluZEFuZFNldCgnbmFtZScsIGRvYy5uYW1lKVxuICAgICAgICAgICAgICAgIC5maW5kQW5kU2V0KCdkZXNjcmlwdGlvbicsIGRvYy5kZXNjcmlwdGlvbilcbiAgICAgICAgICAgICAgICAuZmluZEFuZFNldCgnY29udGFjdCcsIGRvYy5jb250YWN0KVxuICAgICAgICAgICAgICAgIC5maW5kQW5kU2V0KCdjcmVhdG9yJywgZG9jLmNyZWF0b3JfbmFtZSlcbiAgICAgICAgICAgICAgICAuZmluZEFuZFNldCgnaW5pdGlhbHMnLCBkb2MuaW5pdGlhbHMpO1xuICAgICAgICAgICAgLy8gc3RyaXAgdGhlIFwiSURAXCIgcG9ydGlvbiBiZWZvcmUgbWF0Y2hpbmcgb24gbWV0YWJvbGl0ZSwgcHJvdG9jb2wsIHBhcnRcbiAgICAgICAgICAgIChkb2MubWV0YWJvbGl0ZSB8fCBbXSkuZm9yRWFjaCgobWV0YWJvbGl0ZTpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBtYXRjaC5maW5kQW5kU2V0KCdtZXRhYm9saXRlJywgbWV0YWJvbGl0ZS5zbGljZShtZXRhYm9saXRlLmluZGV4T2YoJ0AnKSArIDEpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgKGRvYy5wcm90b2NvbCB8fCBbXSkuZm9yRWFjaCgocHJvdG9jb2w6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgbWF0Y2guZmluZEFuZFNldCgncHJvdG9jb2wnLCBwcm90b2NvbC5zbGljZShwcm90b2NvbC5pbmRleE9mKCdAJykgKyAxKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIChkb2MucGFydCB8fCBbXSkuZm9yRWFjaCgocGFydDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBtYXRjaC5maW5kQW5kU2V0KCdwYXJ0JywgcGFydC5zbGljZShwYXJ0LmluZGV4T2YoJ0AnKSArIDEpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdHJhbnNmb3JtZWRbZG9jLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAnbic6IGRvYy5uYW1lLFxuICAgICAgICAgICAgICAgICdpZCc6IGRvYy5pZCxcbiAgICAgICAgICAgICAgICAndXJsJzogZG9jLnVybCxcbiAgICAgICAgICAgICAgICAnYWN0aXZlJzogZG9jLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAnZGVzJzogZG9jLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgICdjb24nOiBkb2MuY29udGFjdCxcbiAgICAgICAgICAgICAgICAnb3duJzogZG9jLmNyZWF0b3IsXG4gICAgICAgICAgICAgICAgJ3dyaXRlJzogZG9jLndyaXRhYmxlLFxuICAgICAgICAgICAgICAgICdjcic6IGRvYy5jcmVhdGVkLFxuICAgICAgICAgICAgICAgICdtb2QnOiBkb2MubW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgJ293bmVyTmFtZSc6IGRvYy5jcmVhdG9yX25hbWUsXG4gICAgICAgICAgICAgICAgJ293bmVyRW1haWwnOiBkb2MuY3JlYXRvcl9lbWFpbCxcbiAgICAgICAgICAgICAgICAnaW5pdGlhbHMnOiBkb2MuaW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgJ21hdGNoJzogbWF0Y2hcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZG9jLmlkO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVkO1xuICAgIH1cbn1cblxuLy8gZGF0YSBzdHJ1Y3R1cmUgbWFya3MgYSByZWdpb24gb2YgaW50ZXJlc3QgaW4gYSBzdHJpbmcgcGFzc2VkIHRocm91Z2ggUmVzdWx0TWF0Y2hlclxuaW50ZXJmYWNlIFRleHRSZWdpb24ge1xuICAgIGJlZ2luOm51bWJlcjtcbiAgICBlbmQ6bnVtYmVyO1xuICAgIHNvdXJjZTpzdHJpbmc7XG59XG4vLyBpbml0aWFsaXplZCB3aXRoIGEgcXVlcnkgc3RyaW5nLCBjYW4gc2VhcmNoIHN0dWR5IGZpZWxkcyBmb3IgbWF0Y2hlcyB0byBxdWVyeSB0ZXJtc1xuY2xhc3MgUmVzdWx0TWF0Y2hlciB7XG5cbiAgICBwcml2YXRlIF9xdWVyeTpzdHJpbmdbXTtcbiAgICBwcml2YXRlIF9tYXRjaDp7W2luZGV4OnN0cmluZ106VGV4dFJlZ2lvbltdfTtcblxuICAgIGNvbnN0cnVjdG9yKHF1ZXJ5OnN0cmluZykge1xuICAgICAgICB0aGlzLl9xdWVyeSA9IHF1ZXJ5LnNwbGl0KC9cXHMrLykuZmlsdGVyKCh4KSA9PiB4Lmxlbmd0aCA+IDApO1xuICAgICAgICB0aGlzLl9tYXRjaCA9IHt9O1xuICAgIH1cblxuICAgIC8vIHNlYXJjaGVzIGZvciBjb25zdHJ1Y3RvciB0ZXh0IHF1ZXJ5IGluIHRoZSBzb3VyY2Ugc3RyaW5nLCBzYXZpbmcgdG8gZmllbGQgbmFtZSBpZiBmb3VuZFxuICAgIGZpbmRBbmRTZXQoZmllbGQ6c3RyaW5nLCBzb3VyY2U6c3RyaW5nKTpSZXN1bHRNYXRjaGVyIHtcbiAgICAgICAgdmFyIGluZGV4Om51bWJlcjtcbiAgICAgICAgdmFyIGxvd2VyOnN0cmluZyA9IChzb3VyY2UgfHwgJycpLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG4gICAgICAgIHRoaXMuX3F1ZXJ5LmZvckVhY2goKHEpID0+IHtcbiAgICAgICAgICAgIGlmICgoaW5kZXggPSBsb3dlci5pbmRleE9mKHEudG9Mb2NhbGVMb3dlckNhc2UoKSkpID49IDApIHtcbiAgICAgICAgICAgICAgICAodGhpcy5fbWF0Y2hbZmllbGRdID0gdGhpcy5fbWF0Y2hbZmllbGRdIHx8IFtdKS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgYmVnaW46IGluZGV4LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IGluZGV4ICsgcS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogc291cmNlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBnZXRGaWVsZHMoKTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0aGlzLl9tYXRjaCk7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyBhcnJheSBvZiBzdHJpbmdzIG1hcmtlZCBhcyBtYXRjaGluZyB0aGUgY29uc3RydWN0b3IgdGV4dCBxdWVyeVxuICAgIGdldE1hdGNoZXMoZmllbGQ6c3RyaW5nLCBwcmVmaXg/OnN0cmluZywgcG9zdGZpeD86c3RyaW5nLCBzbG9wPzpudW1iZXIpOnN0cmluZ1tdIHtcbiAgICAgICAgc2xvcCA9IHNsb3AgPT09IHVuZGVmaW5lZCA/IE51bWJlci5NQVhfVkFMVUUgOiBzbG9wO1xuICAgICAgICByZXR1cm4gKHRoaXMuX21hdGNoW2ZpZWxkXSB8fCBbXSkubWFwKCh0ZXh0OlRleHRSZWdpb24pOnN0cmluZyA9PiB7XG4gICAgICAgICAgICB2YXIgbGVuZ3RoID0gdGV4dC5zb3VyY2UubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHN0YXJ0ID0gTWF0aC5tYXgoMCwgdGV4dC5iZWdpbiAtIHNsb3ApLFxuICAgICAgICAgICAgICAgIGZpbmlzaCA9IE1hdGgubWluKHRleHQuZW5kICsgc2xvcCwgbGVuZ3RoKSxcbiAgICAgICAgICAgICAgICBwYXJ0cyA9IFtcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zb3VyY2Uuc2xpY2Uoc3RhcnQsIHRleHQuYmVnaW4pLFxuICAgICAgICAgICAgICAgICAgICBwcmVmaXggfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIHRleHQuc291cmNlLnNsaWNlKHRleHQuYmVnaW4sIHRleHQuZW5kKSxcbiAgICAgICAgICAgICAgICAgICAgcG9zdGZpeCB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zb3VyY2Uuc2xpY2UodGV4dC5lbmQsIGZpbmlzaClcbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKHN0YXJ0ID4gMCkgcGFydHMudW5zaGlmdCgn4oCmJyk7XG4gICAgICAgICAgICBpZiAoZmluaXNoIDwgbGVuZ3RoKSBwYXJ0cy5wdXNoKCfigKYnKTtcbiAgICAgICAgICAgIHJldHVybiBwYXJ0cy5qb2luKCcnKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG4vLyBUaGlzIGlzIGEgRGF0YUdyaWRIZWFkZXJXaWRnZXQgZGVyaXZlZCBmcm9tIERHU2VhcmNoV2lkZ2V0LlxuLy8gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVycyBvcHRpb25zIGZvciBhZGRpdGlvbmFsIGRhdGEgdHlwZXMsIHF1ZXJ5aW5nIHRoZSBzZXJ2ZXIgZm9yIHJlc3VsdHMuXG5jbGFzcyBER1N0dWRpZXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBwcml2YXRlIF9zcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXM7XG5cblx0c2VhcmNoRGlzY2xvc3VyZUVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoZ3JpZDpEYXRhR3JpZCwgc3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLCBnZXRzRm9jdXM6Ym9vbGVhbikge1xuXHRcdHN1cGVyKGdyaWQsIHNwZWMsIHBsYWNlSG9sZGVyLCBzaXplLCBnZXRzRm9jdXMpO1xuICAgICAgICB0aGlzLl9zcGVjID0gc3BlYztcblx0fVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuXG5cdC8vIElmIHRoZSBlbGVtZW50cyBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgdGhlIHVuaXF1ZUlEIGlzIHBhc3NlZCBhbG9uZy5cblx0YXBwZW5kRWxlbWVudHMoY29udGFpbmVyOkhUTUxFbGVtZW50LCB1bmlxdWVJRDpzdHJpbmcpOnZvaWQge1xuXHRcdHN1cGVyLmFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lciwgdW5pcXVlSUQpO1xuICAgICAgICB2YXIgc3BhbjpIVE1MU3BhbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgICAgdmFyIHNwYW5JRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ1NlYXJjaERpc2MnK3VuaXF1ZUlEO1xuICAgICAgICBzcGFuLnNldEF0dHJpYnV0ZSgnaWQnLCBzcGFuSUQpO1xuICAgICAgICBzcGFuLmNsYXNzTmFtZSA9ICdzZWFyY2hEaXNjbG9zdXJlJztcbiAgICAgICAgdGhpcy5zZWFyY2hEaXNjbG9zdXJlRWxlbWVudCA9IHNwYW47XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VhcmNoRGlzY2xvc3VyZUVsZW1lbnQpO1xuXHR9XG5cbiAgICAvLyBPVkVSUklERVxuICAgIC8vIEhFWSBHVVlTIFdFIERPTidUIE5FRUQgVE8gRklMVEVSIEhFUkUgQU5ZTU9SRVxuICAgIGFwcGx5RmlsdGVyVG9JRHMocm93SURzOnN0cmluZ1tdKTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgfVxuXG4gICAgLy8gT1ZFUlJJREVcbiAgICAvLyBXZSB3YW50IHRvIHdvcmsgc2xpZ2h0bHkgZGlmZmVyZW50bHkgZnJvbSBiYXNlIHdpZGdldCwgd2hlcmUgcmV0dXJuIGRvZXMgbm90aGluZ1xuICAgIGlucHV0S2V5RG93bkhhbmRsZXIoZSkge1xuICAgICAgICAvLyBzdGlsbCBkbyBldmVyeXRoaW5nIHByZXZpb3VzIGhhbmRsZXIgZG9lc1xuICAgICAgICBzdXBlci5pbnB1dEtleURvd25IYW5kbGVyKGUpO1xuICAgICAgICAvLyB3ZSB3aWxsIGhhbmRsZSByZXR1cm4gZGlmZmVyZW50bHlcbiAgICAgICAgaWYgKGUua2V5Q29kZSA9PT0gMTMpIHtcbiAgICAgICAgICAgIHRoaXMudHlwaW5nRGVsYXlFeHBpcmF0aW9uSGFuZGxlci5jYWxsKHt9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9WRVJSSURFXG4gICAgLy8gV2UgZG9uJ3QgYXQgYWxsIHdhbnQgdG8gZG8gd2hhdCB0aGUgYmFzZSB3aWRnZXQgZG9lcyBoZXJlLCBub3QgYWxsIGRhdGEgaXMgbG9jYWxcbiAgICB0eXBpbmdEZWxheUV4cGlyYXRpb25IYW5kbGVyID0gKCk6dm9pZCA9PiB7XG4gICAgICAgIHZhciBpbnB1dDpKUXVlcnkgPSAkKHRoaXMuZWxlbWVudCk7XG4gICAgICAgIHZhciB2ID0gaW5wdXQudmFsKCk7XG4gICAgICAgIC8vIGlnbm9yZSBpZiB0aGUgZm9sbG93aW5nIGtleXMgYXJlIHByZXNzZWQ6IFtkZWxdIFtzaGlmdF0gW2NhcHNsb2NrXVxuICAgICAgICBpZiAodGhpcy5sYXN0S2V5UHJlc3NDb2RlID4gOCAmJiB0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPCAzMikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKHYgPT09IHRoaXMucHJldmlvdXNTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnByZXZpb3VzU2VsZWN0aW9uID0gdjtcbiAgICAgICAgaW5wdXQuYWRkQ2xhc3MoJ3dhaXQnKTtcbiAgICAgICAgdGhpcy5fc3BlYy5xdWVyeSh2KS5yZXF1ZXN0UGFnZU9mRGF0YSgoc3VjY2Vzczpib29sZWFuKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlucHV0LnJlbW92ZUNsYXNzKCd3YWl0JykudG9nZ2xlQ2xhc3MoJ2Vycm9yJywgc3VjY2Vzcyk7XG4gICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuLy8gSGVyZSdzIGFuIGV4YW1wbGUgb2YgYSB3b3JraW5nIERhdGFHcmlkT3B0aW9uV2lkZ2V0LlxuLy8gV2hlbiBjaGVja2VkLCB0aGlzIGhpZGVzIGFsbCBTdHVkaWVzIHRoYXQgYXJlIG5vdCBvd25lZCBieSB0aGUgY3VycmVudCB1c2VyLlxuY2xhc3MgREdPbmx5TXlTdHVkaWVzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgcHJpdmF0ZSBfc3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzO1xuXG4gICAgY29uc3RydWN0b3IoZ3JpZDpEYXRhR3JpZCwgc3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzKSB7XG4gICAgICAgIHN1cGVyKGdyaWQsIHNwZWMpO1xuICAgICAgICB0aGlzLl9zcGVjID0gc3BlYztcbiAgICB9XG5cbiAgICBnZXRJREZyYWdtZW50KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdTaG93TXlTdHVkaWVzQ0InO1xuICAgIH1cblxuICAgIGdldExhYmVsVGV4dCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnTXkgU3R1ZGllcyBPbmx5JztcbiAgICB9XG5cbiAgICBvbldpZGdldENoYW5nZShlKTp2b2lkIHtcbiAgICAgICAgLy8gdXBkYXRlIHNwZWMgd2l0aCBmaWx0ZXIgb3B0aW9uc1xuICAgICAgICB2YXIgZmlsdGVyID0gdGhpcy5fc3BlYy5maWx0ZXIoKTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgICQuZXh0ZW5kKGZpbHRlciwgeyAnc2hvd01pbmUnOiAxIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVsZXRlIGZpbHRlci5zaG93TWluZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zcGVjLmZpbHRlcihmaWx0ZXIpLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzOmJvb2xlYW4pOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8vIEhlcmUncyBhbm90aGVyIGV4YW1wbGUgb2YgYSB3b3JraW5nIERhdGFHcmlkT3B0aW9uV2lkZ2V0LlxuLy8gV2hlbiB1bmNoZWNrZWQsIHRoaXMgaGlkZXMgdGhlIHNldCBvZiBTdHVkaWVzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRPcHRpb25XaWRnZXQge1xuXG4gICAgcHJpdmF0ZSBfc3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzO1xuXG4gICAgY29uc3RydWN0b3IoZ3JpZDpEYXRhR3JpZCwgc3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzKSB7XG4gICAgICAgIHN1cGVyKGdyaWQsIHNwZWMpO1xuICAgICAgICB0aGlzLl9zcGVjID0gc3BlYztcbiAgICB9XG5cbiAgICBnZXRJREZyYWdtZW50KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdTaG93RFN0dWRpZXNDQic7XG4gICAgfVxuXG4gICAgZ2V0TGFiZWxUZXh0KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdTaG93IERpc2FibGVkJztcbiAgICB9XG5cbiAgICBvbldpZGdldENoYW5nZShlKTp2b2lkIHtcbiAgICAgICAgLy8gdXBkYXRlIHNwZWMgd2l0aCBmaWx0ZXIgb3B0aW9uc1xuICAgICAgICB2YXIgZmlsdGVyID0gdGhpcy5fc3BlYy5maWx0ZXIoKTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgICQuZXh0ZW5kKGZpbHRlciwgeyAnc2hvd0Rpc2FibGVkJzogMSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWx0ZXIuc2hvd0Rpc2FibGVkO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3NwZWMuZmlsdGVyKGZpbHRlcikucmVxdWVzdFBhZ2VPZkRhdGEoKHN1Y2Nlc3M6Ym9vbGVhbik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXHRpbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRChkYXRhUm93T2JqZWN0czpEYXRhR3JpZERhdGFSb3dbXSwgcm93SUQ6c3RyaW5nKTphbnkge1xuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuX3NwZWMuZGF0YSgpO1xuXHRcdGlmIChkYXRhW3Jvd0lEXS5kaXMpIHtcblx0XHRcdGZvciAodmFyIHIgPSAwOyByIDwgZGF0YVJvd09iamVjdHMubGVuZ3RoOyByKyspIHtcblx0XHRcdFx0dmFyIHJvd0VsZW1lbnQgPSBkYXRhUm93T2JqZWN0c1tyXS5nZXRFbGVtZW50KCk7XG5cdFx0XHRcdHJvd0VsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCIjRkZDMEMwXCI7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8vIHVzZSBKUXVlcnkgcmVhZHkgZXZlbnQgc2hvcnRjdXQgdG8gY2FsbCBwcmVwYXJlSXQgd2hlbiBwYWdlIGlzIHJlYWR5XG4kKEluZGV4UGFnZS5wcmVwYXJlSXQpO1xuIl19