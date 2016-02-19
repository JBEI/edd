// Compiled to JS on: Fri Feb 19 2016 15:04:53  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="Utl.ts" />
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6WyJJbmRleFBhZ2UiLCJJbmRleFBhZ2UucHJlcGFyZUl0IiwiSW5kZXhQYWdlLmRpc2Nsb3NlIiwiSW5kZXhQYWdlLnByZXBhcmVUYWJsZSIsIkRhdGFHcmlkU3BlY1N0dWRpZXMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmNvbnN0cnVjdG9yIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5kZWZpbmVUYWJsZVNwZWMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmRlZmluZUhlYWRlclNwZWMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlU3R1ZHlOYW1lQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlRGVzY3JpcHRpb25DZWxscyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZ2VuZXJhdGVPd25lckluaXRpYWxzQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlT3duZXJOYW1lQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlSW5zdGl0dXRpb25DZWxscyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZ2VuZXJhdGVDcmVhdGVkQ2VsbHMiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdlbmVyYXRlTW9kaWZpZWRDZWxscyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZGVmaW5lQ29sdW1uU3BlYyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZGVmaW5lQ29sdW1uR3JvdXBTcGVjIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5nZXRUYWJsZUVsZW1lbnQiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLmdldFJlY29yZElEcyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZW5hYmxlU29ydCIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuY29sdW1uU29ydCIsIkRhdGFHcmlkU3BlY1N0dWRpZXMucGFnZVNpemUiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLnRvdGFsT2Zmc2V0IiwiRGF0YUdyaWRTcGVjU3R1ZGllcy50b3RhbFNpemUiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLnZpZXdTaXplIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5xdWVyeSIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZmlsdGVyIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5wYWdlRGVsdGEiLCJEYXRhR3JpZFNwZWNTdHVkaWVzLnJlcXVlc3RQYWdlT2ZEYXRhIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5jcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzIiwiRGF0YUdyaWRTcGVjU3R1ZGllcy5jcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyIsIkRhdGFHcmlkU3BlY1N0dWRpZXMub25Jbml0aWFsaXplZCIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuZGF0YSIsIkRhdGFHcmlkU3BlY1N0dWRpZXMuX3RyYW5zZm9ybURhdGEiLCJSZXN1bHRNYXRjaGVyIiwiUmVzdWx0TWF0Y2hlci5jb25zdHJ1Y3RvciIsIlJlc3VsdE1hdGNoZXIuZmluZEFuZFNldCIsIlJlc3VsdE1hdGNoZXIuZ2V0RmllbGRzIiwiUmVzdWx0TWF0Y2hlci5nZXRNYXRjaGVzIiwiREdTdHVkaWVzU2VhcmNoV2lkZ2V0IiwiREdTdHVkaWVzU2VhcmNoV2lkZ2V0LmNvbnN0cnVjdG9yIiwiREdTdHVkaWVzU2VhcmNoV2lkZ2V0LmFwcGVuZEVsZW1lbnRzIiwiREdTdHVkaWVzU2VhcmNoV2lkZ2V0LmFwcGx5RmlsdGVyVG9JRHMiLCJER1N0dWRpZXNTZWFyY2hXaWRnZXQuaW5wdXRLZXlEb3duSGFuZGxlciIsIkRHT25seU15U3R1ZGllc1dpZGdldCIsIkRHT25seU15U3R1ZGllc1dpZGdldC5jb25zdHJ1Y3RvciIsIkRHT25seU15U3R1ZGllc1dpZGdldC5nZXRJREZyYWdtZW50IiwiREdPbmx5TXlTdHVkaWVzV2lkZ2V0LmdldExhYmVsVGV4dCIsIkRHT25seU15U3R1ZGllc1dpZGdldC5vbldpZGdldENoYW5nZSIsIkRHRGlzYWJsZWRTdHVkaWVzV2lkZ2V0IiwiREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQuY29uc3RydWN0b3IiLCJER0Rpc2FibGVkU3R1ZGllc1dpZGdldC5nZXRJREZyYWdtZW50IiwiREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQuZ2V0TGFiZWxUZXh0IiwiREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQub25XaWRnZXRDaGFuZ2UiLCJER0Rpc2FibGVkU3R1ZGllc1dpZGdldC5pbml0aWFsRm9ybWF0Um93RWxlbWVudHNGb3JJRCJdLCJtYXBwaW5ncyI6IkFBQUEsZ0RBQWdEO0FBQ2hELHFEQUFxRDtBQUNyRCxvQ0FBb0M7QUFDcEMsK0JBQStCOzs7Ozs7QUFJL0IsSUFBTyxTQUFTLENBeUJmO0FBekJELFdBQU8sU0FBUyxFQUFDLENBQUM7SUFFakJBLElBQUlBLG1CQUFtQkEsR0FBdUJBLElBQUlBLENBQUNBO0lBQ25EQSxJQUFJQSxlQUFlQSxHQUFZQSxJQUFJQSxDQUFDQTtJQUVwQ0EsOEJBQThCQTtJQUM5QkE7UUFDT0MsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLFNBQVNBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUhlRCxtQkFBU0EsWUFHeEJBLENBQUFBO0lBRUVBO1FBQ0lFLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1FBQ3pEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFIZUYsa0JBQVFBLFdBR3ZCQSxDQUFBQTtJQUVKQTtRQUFBRyxpQkFRQ0E7UUFQQUEsMERBQTBEQTtRQUMxREEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxHQUFHQSxJQUFJQSxtQkFBbUJBLEVBQUVBLENBQUNBO1FBQ3JEQSw2Q0FBNkNBO1FBQzdDQSxJQUFJ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QSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxLQUFLQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxRUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBQ0EsQ0FBQ0EsSUFBT0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsS0FBS0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUVBLHdFQUF3RUE7WUFDeEVBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ2pDQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6Q0EsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO1lBQzlDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxLQUFLQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FB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QUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsRkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDSEEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsUUFBZUE7Z0JBQ3pDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFVQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1RUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDSEEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsSUFBV0E7Z0JBQ2pDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDSEEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0E7Z0JBQ2xCQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxJQUFJQTtnQkFDYkEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFBRUE7Z0JBQ1pBLEtBQUtBLEVBQUVBLEdBQUdBLENBQUNBLEdBQUdBO2dCQUNkQSxRQUFRQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQTtnQkFDcEJBLEtBQUtBLEVBQUVBLEdBQUdBLENBQUNBLFdBQVdBO2dCQUN0QkEsS0FBS0EsRUFBRUEsR0FBR0EsQ0FBQ0EsT0FBT0E7Z0JBQ2xCQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxPQUFPQTtnQkFDbEJBLE9BQU9BLEVBQUVBLEdBQUdBLENBQUNBLFFBQVFB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LFNBQVMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29tcGlsZWQgdG8gSlMgb246IEZyaSBGZWIgMTkgMjAxNiAxNTowNDo1MyAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRGF0YUdyaWQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG5cbmRlY2xhcmUgdmFyIEVERERhdGE6RURERGF0YTsgIC8vIHN0aWNraW5nIHRoaXMgaGVyZSBhcyBJREUgaXNuJ3QgZm9sbG93aW5nIHJlZmVyZW5jZXNcblxubW9kdWxlIEluZGV4UGFnZSB7XG5cblx0dmFyIHN0dWRpZXNEYXRhR3JpZFNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcyA9IG51bGw7XG5cdHZhciBzdHVkaWVzRGF0YUdyaWQ6RGF0YUdyaWQgPSBudWxsO1xuXG5cdC8vIENhbGxlZCB3aGVuIHRoZSBwYWdlIGxvYWRzLlxuXHRleHBvcnQgZnVuY3Rpb24gcHJlcGFyZUl0KCkge1xuICAgICAgICAkKCcuZGlzY2xvc2UnKS5maW5kKCcuZGlzY2xvc2VMaW5rJykub24oJ2NsaWNrJywgZGlzY2xvc2UpO1xuICAgICAgICBJbmRleFBhZ2UucHJlcGFyZVRhYmxlKCk7XG5cdH1cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBkaXNjbG9zZSgpIHtcbiAgICAgICAgJCh0aGlzKS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVUYWJsZSgpIHtcblx0XHQvLyBJbnN0YW50aWF0ZSBhIHRhYmxlIHNwZWNpZmljYXRpb24gZm9yIHRoZSBTdHVkaWVzIHRhYmxlXG5cdFx0dGhpcy5zdHVkaWVzRGF0YUdyaWRTcGVjID0gbmV3IERhdGFHcmlkU3BlY1N0dWRpZXMoKTtcblx0XHQvLyBJbnN0YW50aWF0ZSB0aGUgdGFibGUgaXRzZWxmIHdpdGggdGhlIHNwZWNcblx0XHR0aGlzLnN0dWRpZXNEYXRhR3JpZCA9IG5ldyBEYXRhR3JpZCh0aGlzLnN0dWRpZXNEYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLnN0dWRpZXNEYXRhR3JpZFNwZWMucmVxdWVzdFBhZ2VPZkRhdGEoKHN1Y2Nlc3MpID0+IHtcbiAgICAgICAgICAgIGlmIChzdWNjZXNzKSB0aGlzLnN0dWRpZXNEYXRhR3JpZC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgIH0pO1xuXHR9XG59O1xuXG5cbi8vIFRoZSBzcGVjIG9iamVjdCB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIERhdGFHcmlkIHRvIGNyZWF0ZSB0aGUgU3R1ZGllcyB0YWJsZVxuY2xhc3MgRGF0YUdyaWRTcGVjU3R1ZGllcyBleHRlbmRzIERhdGFHcmlkU3BlY0Jhc2UgaW1wbGVtZW50cyBER1BhZ2VEYXRhU291cmNlIHtcblxuICAgIC8vIHNwZWMgb2JqZWN0IHRyYWNrcyB3aGF0IGRhdGEgc2hvdWxkIGJlIGRpc3BsYXllZCBieSB0aGUgdGFibGVcbiAgICBwcml2YXRlIGRhdGFPYmo6e307XG4gICAgcHJpdmF0ZSByZWNvcmRJZHM6c3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlIF9zaXplOm51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBfb2Zmc2V0Om51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBfcGFnZVNpemU6bnVtYmVyID0gNTA7XG4gICAgcHJpdmF0ZSBfcXVlcnk6c3RyaW5nID0gJyc7XG4gICAgcHJpdmF0ZSBfc2VhcmNoT3B0ID0ge307XG4gICAgZGVzY3JpcHRpb25Db2w6RGF0YUdyaWRDb2x1bW5TcGVjO1xuXG5cdC8vIFNwZWNpZmljYXRpb24gZm9yIHRoZSB0YWJsZSBhcyBhIHdob2xlXG5cdGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnc3R1ZGllcycsIHsgJ25hbWUnOiAnU3R1ZGllcycgfSk7XG5cdH1cblxuXHQvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgaGVhZGVycyBhbG9uZyB0aGUgdG9wIG9mIHRoZSB0YWJsZVxuXHRkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICAvLyBjYXB0dXJlIGhlcmUsIGFzIHRoZSBgdGhpc2AgdmFyaWFibGUgYmVsb3cgd2lsbCBwb2ludCB0byBnbG9iYWwgb2JqZWN0LCBub3QgdGhpcyBvYmplY3RcbiAgICAgICAgdmFyIHNlbGY6RGF0YUdyaWRTcGVjU3R1ZGllcyA9IHRoaXM7XG5cdFx0cmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMSwgJ2hTdHVkeU5hbWUnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnU3R1ZHkgTmFtZScsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICduYW1lX3MnIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygyLCAnaFN0dWR5RGVzYycsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdEZXNjcmlwdGlvbicsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICdkZXNjX3MnIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygzLCAnaFN0dWR5T3duZXJJbml0aWFscycsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdPd25lcicsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICdpbml0aWFscycgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQsICdoU3R1ZHlPd25lckZ1bGxOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ093bmVyIEZ1bGwgTmFtZScsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICdjcmVhdG9yX3MnIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg1LCAnaFN0dWR5T3duZXJJbnN0aXR1dGUnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnSW5zdGl0dXRlJyxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNiwgJ2hTdHVkeUNyZWF0ZWQnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ3JlYXRlZCcsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICdjcmVhdGVkJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNywgJ2hTdHVkeU1vZCcsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAnc29ydElkJzogJ21vZGlmaWVkJyB9KVxuXHRcdF07XG5cdH1cblxuICAgIGdlbmVyYXRlU3R1ZHlOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgc3R1ZHlEb2MgPSBncmlkU3BlYy5kYXRhT2JqW2luZGV4XTtcbiAgICAgICAgdmFyIHNpZGVNZW51SXRlbXMgPSBbXTtcbiAgICAgICAgdmFyIG1hdGNoOlJlc3VsdE1hdGNoZXIgPSBzdHVkeURvYy5tYXRjaDtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBzaWRlTWVudUl0ZW1zID0gbWF0Y2guZ2V0RmllbGRzKCkubWFwKChmaWVsZCk6c3RyaW5nID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2hlcyA9IG1hdGNoLmdldE1hdGNoZXMoZmllbGQsICc8c3BhbiBjbGFzcz1cInNlYXJjaF9tYXRjaFwiPicsICc8L3NwYW4+JywgMTApO1xuICAgICAgICAgICAgICAgIHJldHVybiAnTWF0Y2hlZCBvbiAnICsgZmllbGQgKyAnOiAnICsgbWF0Y2hlcy5qb2luKCcsICcpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3NpZGVNZW51SXRlbXMnOiBzaWRlTWVudUl0ZW1zLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogWyAnPGEgaHJlZj1cIicsIHN0dWR5RG9jLnVybCwgJ1wiIGNsYXNzPVwiZGFya2VyXCI+Jywgc3R1ZHlEb2MubiwgJzwvYT4nIF0uam9pbignJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVEZXNjcmlwdGlvbkNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdtYXhXaWR0aCc6ICc0MDAnLFxuICAgICAgICAgICAgICAgICdjdXN0b21JRCc6IChpZCkgPT4geyByZXR1cm4gJ2VkaXRhYmxlRGVzY3JpcHRpb25GaWVsZCcgKyBpZDsgfSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGdyaWRTcGVjLmRhdGFPYmpbaW5kZXhdLmRlcyB8fCAnJ1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU93bmVySW5pdGlhbHNDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGdyaWRTcGVjLmRhdGFPYmpbaW5kZXhdLmluaXRpYWxzIHx8ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU93bmVyTmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogZ3JpZFNwZWMuZGF0YU9ialtpbmRleF0ub3duZXJOYW1lIHx8ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUluc3RpdHV0aW9uQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVDcmVhdGVkQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBVdGwuSlMudXRjVG9Ub2RheVN0cmluZyhncmlkU3BlYy5kYXRhT2JqW2luZGV4XS5jcilcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVNb2RpZmllZENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnV0Y1RvVG9kYXlTdHJpbmcoZ3JpZFNwZWMuZGF0YU9ialtpbmRleF0ubW9kKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cblx0Ly8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgY29sdW1ucyB0aGF0IHdpbGwgbWFrZSB1cCB0aGUgYm9keSBvZiB0aGUgdGFibGVcblx0ZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgLy8gY2FwdHVyZSBoZXJlLCBhcyB0aGUgYHRoaXNgIHZhcmlhYmxlIGJlbG93IHdpbGwgcG9pbnQgdG8gZ2xvYmFsIG9iamVjdCwgbm90IHRoaXMgb2JqZWN0XG4gICAgICAgIHZhciBzZWxmOkRhdGFHcmlkU3BlY1N0dWRpZXMgPSB0aGlzO1xuXHRcdHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIHRoaXMuZ2VuZXJhdGVTdHVkeU5hbWVDZWxscyksXG4gICAgICAgICAgICB0aGlzLmRlc2NyaXB0aW9uQ29sID0gbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyLCB0aGlzLmdlbmVyYXRlRGVzY3JpcHRpb25DZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDMsIHRoaXMuZ2VuZXJhdGVPd25lckluaXRpYWxzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg0LCB0aGlzLmdlbmVyYXRlT3duZXJOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg1LCB0aGlzLmdlbmVyYXRlSW5zdGl0dXRpb25DZWxscyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYsIHRoaXMuZ2VuZXJhdGVDcmVhdGVkQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3LCB0aGlzLmdlbmVyYXRlTW9kaWZpZWRDZWxscylcblx0XHRdO1xuXHR9XG5cblx0Ly8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZ3JvdXBzIHRoYXQgdGhlIGhlYWRlcnMgYW5kIGRhdGEgY29sdW1ucyBhcmUgb3JnYW5pemVkIGludG9cblx0ZGVmaW5lQ29sdW1uR3JvdXBTcGVjKCk6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXSB7XG5cdFx0cmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnU3R1ZHkgTmFtZScsIHsgJ3Nob3dJblZpc2liaWxpdHlMaXN0JzogZmFsc2UgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0Rlc2NyaXB0aW9uJyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ093bmVyIEluaXRpYWxzJyksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ093bmVyIEZ1bGwgTmFtZScsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0luc3RpdHV0ZScsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0RhdGUgQ3JlYXRlZCcsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnKVxuXHRcdF07XG5cdH1cblxuXHQvLyBUaGUgdGFibGUgZWxlbWVudCBvbiB0aGUgcGFnZSB0aGF0IHdpbGwgYmUgdHVybmVkIGludG8gdGhlIERhdGFHcmlkLiAgQW55IHByZWV4aXN0aW5nIHRhYmxlIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuXHRnZXRUYWJsZUVsZW1lbnQoKSB7XG5cdFx0cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZGllc1RhYmxlXCIpO1xuXHR9XG5cblx0Ly8gQW4gYXJyYXkgb2YgdW5pcXVlIGlkZW50aWZpZXJzLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZSBkYXRhIHNldCBiZWluZyBkaXNwbGF5ZWRcblx0Z2V0UmVjb3JkSURzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWNvcmRJZHM7XG5cdH1cblxuICAgIGVuYWJsZVNvcnQoZ3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRTcGVjU3R1ZGllcyB7XG4gICAgICAgIHN1cGVyLmVuYWJsZVNvcnQoZ3JpZCk7XG4gICAgICAgIHRoaXMudGFibGVIZWFkZXJTcGVjLmZvckVhY2goKGhlYWRlcikgPT4ge1xuICAgICAgICAgICAgaWYgKGhlYWRlci5zb3J0SWQpIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgYW55IGV2ZW50cyBmcm9tIHN1cGVyIGluIGZhdm9yIG9mIG91ciBvd25cbiAgICAgICAgICAgICAgICAkKGhlYWRlci5lbGVtZW50KS5vZmYoJ2NsaWNrLmRhdGF0YWJsZScpLm9uKCdjbGljay5kYXRhdGFibGUnLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2x1bW5Tb3J0KGdyaWQsIGhlYWRlciwgZXYpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb2x1bW5Tb3J0KGdyaWQ6RGF0YUdyaWQsIGhlYWRlcjpEYXRhR3JpZEhlYWRlclNwZWMsIGV2KTphbnkge1xuICAgICAgICB2YXIgc29ydCA9IGdyaWQuc29ydENvbHMoKSwgb2xkU29ydCwgbmV3U29ydCwgc29ydE9wdDtcbiAgICAgICAgaWYgKGV2LnNoaWZ0S2V5IHx8IGV2LmN0cmxLZXkgfHwgZXYubWV0YUtleSkge1xuICAgICAgICAgICAgbmV3U29ydCA9IHNvcnQuZmlsdGVyKCh2KSA9PiB7IHJldHVybiB2LnNwZWMuc29ydElkID09PSBoZWFkZXIuc29ydElkOyB9KTtcbiAgICAgICAgICAgIG9sZFNvcnQgPSBzb3J0LmZpbHRlcigodikgPT4geyByZXR1cm4gdi5zcGVjLnNvcnRJZCAhPT0gaGVhZGVyLnNvcnRJZDsgfSk7XG4gICAgICAgICAgICAvLyBpZiBjb2x1bW4gYWxyZWFkeSBzb3J0ZWQsIGZsaXAgYXNjOyBtb3ZlIGNvbHVtbiB0byBmcm9udCBvZiBzb3J0IGxpc3RcbiAgICAgICAgICAgIGlmIChuZXdTb3J0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIG5ld1NvcnRbMF0uYXNjID0gIW5ld1NvcnRbMF0uYXNjO1xuICAgICAgICAgICAgICAgIChzb3J0ID0gb2xkU29ydCkudW5zaGlmdChuZXdTb3J0WzBdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc29ydC51bnNoaWZ0KHsgc3BlYzogaGVhZGVyLCBhc2M6IHRydWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc29ydC5sZW5ndGggPT09IDEgJiYgc29ydFswXS5zcGVjLnNvcnRJZCA9PT0gaGVhZGVyLnNvcnRJZCkge1xuICAgICAgICAgICAgc29ydFswXS5hc2MgPSAhc29ydFswXS5hc2M7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0ID0gWyB7IHNwZWM6IGhlYWRlciwgYXNjOiB0cnVlIH0gXTtcbiAgICAgICAgfVxuICAgICAgICBncmlkLnNvcnRDb2xzKHNvcnQpO1xuICAgICAgICAvLyBjb252ZXJ0IHRvIHNvcnQgc3RyaW5ncywgZmlsdGVyIG91dCBmYWxzeSB2YWx1ZXMsIGpvaW4gd2l0aCBjb21tYXNcbiAgICAgICAgc29ydE9wdCA9IHNvcnQubWFwKChjb2w6RGF0YUdyaWRTb3J0KSA9PiB7XG4gICAgICAgICAgICBpZiAoY29sLnNwZWMuc29ydElkKSByZXR1cm4gY29sLnNwZWMuc29ydElkICsgKGNvbC5hc2MgPyAnIGFzYycgOiAnIGRlc2MnKTtcbiAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywnKTtcbiAgICAgICAgLy8gc3RvcmUgaW4gb3B0aW9ucyBvYmplY3QsIGFzIGdyaWQgd2lsbCBub3QgYmUgYXZhaWxhYmxlIGluIHJlcXVlc3RQYWdlT2ZEYXRhXG4gICAgICAgICQuZXh0ZW5kKHRoaXMuX3NlYXJjaE9wdCwgeyAnc29ydCc6IHNvcnRPcHQgfSk7XG4gICAgICAgIHRoaXMucmVxdWVzdFBhZ2VPZkRhdGEoKHN1Y2Nlc3MpID0+IHtcbiAgICAgICAgICAgIGlmIChzdWNjZXNzKSBncmlkLnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcGFnZVNpemUoKTpudW1iZXI7XG4gICAgcGFnZVNpemUoc2l6ZTpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgcGFnZVNpemUoc2l6ZT86bnVtYmVyKTphbnkge1xuICAgICAgICBpZiAoc2l6ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGFnZVNpemU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9wYWdlU2l6ZSA9IHNpemU7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvdGFsT2Zmc2V0KCk6bnVtYmVyO1xuICAgIHRvdGFsT2Zmc2V0KG9mZnNldDpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgdG90YWxPZmZzZXQob2Zmc2V0PzpudW1iZXIpOmFueSB7XG4gICAgICAgIGlmIChvZmZzZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX29mZnNldDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX29mZnNldCA9IG9mZnNldDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdG90YWxTaXplKCk6bnVtYmVyO1xuICAgIHRvdGFsU2l6ZShzaXplOm51bWJlcik6REdQYWdlRGF0YVNvdXJjZTtcbiAgICB0b3RhbFNpemUoc2l6ZT86bnVtYmVyKTphbnkge1xuICAgICAgICBpZiAoc2l6ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2l6ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3NpemUgPSBzaXplO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2aWV3U2l6ZSgpOm51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFJlY29yZElEcygpLmxlbmd0aDtcbiAgICB9XG5cbiAgICBxdWVyeSgpOnN0cmluZztcbiAgICBxdWVyeShxdWVyeTpzdHJpbmcpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgcXVlcnkocXVlcnk/OnN0cmluZyk6YW55IHtcbiAgICAgICAgaWYgKHF1ZXJ5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9xdWVyeTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3F1ZXJ5ID0gcXVlcnk7XG4gICAgICAgICAgICB0aGlzLl9vZmZzZXQgPSAwOyAvLyByZXNldCBvZmZzZXQgd2hlbiBxdWVyeSBjaGFuZ2VzXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZpbHRlcigpOmFueTtcbiAgICBmaWx0ZXIob3B0OmFueSk6REdQYWdlRGF0YVNvdXJjZTtcbiAgICBmaWx0ZXIob3B0PzphbnkpOmFueSB7XG4gICAgICAgIGlmIChvcHQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlYXJjaE9wdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3NlYXJjaE9wdCA9IG9wdDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcGFnZURlbHRhKGRlbHRhOm51bWJlcik6REdQYWdlRGF0YVNvdXJjZSB7XG4gICAgICAgIHRoaXMuX29mZnNldCArPSAoZGVsdGEgKiB0aGlzLl9wYWdlU2l6ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHJlcXVlc3RQYWdlT2ZEYXRhKGNhbGxiYWNrPzooc3VjY2Vzczpib29sZWFuKSA9PiB2b2lkKTpER1BhZ2VEYXRhU291cmNlIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICd1cmwnOiAnL3N0dWR5L3NlYXJjaC8nLFxuICAgICAgICAgICAgJ3R5cGUnOiAnR0VUJyxcbiAgICAgICAgICAgICdkYXRhJzogJC5leHRlbmQoe30sIHRoaXMuX3NlYXJjaE9wdCwge1xuICAgICAgICAgICAgICAgICdxJzogdGhpcy5fcXVlcnksXG4gICAgICAgICAgICAgICAgJ2knOiB0aGlzLl9vZmZzZXQsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiB0aGlzLl9wYWdlU2l6ZVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAnZXJyb3InOiAoeGhyLCBzdGF0dXMsIGUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ1NlYXJjaCBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbCh7fSwgZmFsc2UpO1xuICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhKGRhdGEuZG9jcywgZGF0YS5udW1Gb3VuZCwgZGF0YS5zdGFydCk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbCh7fSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblx0Ly8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBoZWFkZXIgd2lkZ2V0cy5cblx0Ly8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci5cblx0Ly8gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG5cdGNyZWF0ZUN1c3RvbUhlYWRlcldpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10ge1xuXHRcdC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgU3R1ZGllc1xuICAgICAgICB2YXIgYXJyYXk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtcbiAgICAgICAgICAgIG5ldyBER1N0dWRpZXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggU3R1ZGllcycsIDQwLCB0cnVlKSxcbiAgICAgICAgICAgIG5ldyBER1BhZ2luZ1dpZGdldChkYXRhR3JpZCwgdGhpcywgdGhpcylcbiAgICAgICAgXTtcbiAgICAgICAgcmV0dXJuIGFycmF5O1xuXHR9XG5cblx0Ly8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy5cblx0Ly8gVGhlIG9yZGVyIG9mIHRoZSBhcnJheSB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuXG5cdC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuXHRjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG5cdFx0dmFyIHdpZGdldFNldDpEYXRhR3JpZE9wdGlvbldpZGdldFtdID0gW107XG5cblx0XHQvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIG9ubHkgdGhlIFN0dWRpZXMgdGhhdCBiZWxvbmcgdG8gdGhlIGN1cnJlbnQgdXNlclxuXHRcdHZhciBvbmx5TXlTdHVkaWVzV2lkZ2V0ID0gbmV3IERHT25seU15U3R1ZGllc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG5cdFx0d2lkZ2V0U2V0LnB1c2gob25seU15U3R1ZGllc1dpZGdldCk7XG5cdFx0Ly8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBkaXNhYmxlZCBTdHVkaWVzXG5cdFx0dmFyIGRpc2FibGVkU3R1ZGllc1dpZGdldCA9IG5ldyBER0Rpc2FibGVkU3R1ZGllc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG5cdFx0d2lkZ2V0U2V0LnB1c2goZGlzYWJsZWRTdHVkaWVzV2lkZ2V0KTtcblx0XHRyZXR1cm4gd2lkZ2V0U2V0O1xuXHR9XG5cblx0Ly8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cblx0b25Jbml0aWFsaXplZChkYXRhR3JpZDpEYXRhR3JpZCk6dm9pZCB7XG5cdH1cblxuICAgIGRhdGEoKTphbnk7XG4gICAgZGF0YShyZXBsYWNlbWVudDphbnlbXSwgdG90YWxTaXplPzpudW1iZXIsIHRvdGFsT2Zmc2V0PzpudW1iZXIpOkRhdGFHcmlkU3BlY1N0dWRpZXM7XG4gICAgZGF0YShyZXBsYWNlbWVudD86YW55W10sIHRvdGFsU2l6ZT86bnVtYmVyLCB0b3RhbE9mZnNldD86bnVtYmVyKTphbnkge1xuICAgICAgICBpZiAocmVwbGFjZW1lbnQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YU9iajtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iaiA9IHRoaXMuX3RyYW5zZm9ybURhdGEocmVwbGFjZW1lbnQpOyAvLyB0cmFuc2Zvcm0gYWxzbyBoYW5kbGVzIHN0b3Jpbmcgc29ydCBrZXlzXG4gICAgICAgICAgICB0aGlzLl9zaXplID0gdG90YWxTaXplIHx8IHRoaXMudmlld1NpemUoKTtcbiAgICAgICAgICAgIHRoaXMuX29mZnNldCA9IHRvdGFsT2Zmc2V0IHx8IDA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfdHJhbnNmb3JtRGF0YShkb2NzOmFueVtdKTphbnkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWQgPSB7fTtcbiAgICAgICAgdGhpcy5yZWNvcmRJZHMgPSBkb2NzLm1hcCgoZG9jKTpzdHJpbmcgPT4ge1xuICAgICAgICAgICAgdmFyIG1hdGNoID0gbmV3IFJlc3VsdE1hdGNoZXIodGhpcy5fcXVlcnkpO1xuICAgICAgICAgICAgLy8gc3RyYWlnaHRmb3J3YXJkIG1hdGNoaW5nIG9uIG5hbWUsIGRlc2NyaXB0aW9uLCBjb250YWN0LCBjcmVhdG9yX25hbWUsIGluaXRpYWxzXG4gICAgICAgICAgICBtYXRjaC5maW5kQW5kU2V0KCduYW1lJywgZG9jLm5hbWUpXG4gICAgICAgICAgICAgICAgLmZpbmRBbmRTZXQoJ2Rlc2NyaXB0aW9uJywgZG9jLmRlc2NyaXB0aW9uKVxuICAgICAgICAgICAgICAgIC5maW5kQW5kU2V0KCdjb250YWN0JywgZG9jLmNvbnRhY3QpXG4gICAgICAgICAgICAgICAgLmZpbmRBbmRTZXQoJ2NyZWF0b3InLCBkb2MuY3JlYXRvcl9uYW1lKVxuICAgICAgICAgICAgICAgIC5maW5kQW5kU2V0KCdpbml0aWFscycsIGRvYy5pbml0aWFscyk7XG4gICAgICAgICAgICAvLyBzdHJpcCB0aGUgXCJJREBcIiBwb3J0aW9uIGJlZm9yZSBtYXRjaGluZyBvbiBtZXRhYm9saXRlLCBwcm90b2NvbCwgcGFydFxuICAgICAgICAgICAgKGRvYy5tZXRhYm9saXRlIHx8IFtdKS5mb3JFYWNoKChtZXRhYm9saXRlOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIG1hdGNoLmZpbmRBbmRTZXQoJ21ldGFib2xpdGUnLCBtZXRhYm9saXRlLnNsaWNlKG1ldGFib2xpdGUuaW5kZXhPZignQCcpICsgMSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAoZG9jLnByb3RvY29sIHx8IFtdKS5mb3JFYWNoKChwcm90b2NvbDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBtYXRjaC5maW5kQW5kU2V0KCdwcm90b2NvbCcsIHByb3RvY29sLnNsaWNlKHByb3RvY29sLmluZGV4T2YoJ0AnKSArIDEpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgKGRvYy5wYXJ0IHx8IFtdKS5mb3JFYWNoKChwYXJ0OnN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIG1hdGNoLmZpbmRBbmRTZXQoJ3BhcnQnLCBwYXJ0LnNsaWNlKHBhcnQuaW5kZXhPZignQCcpICsgMSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0cmFuc2Zvcm1lZFtkb2MuaWRdID0ge1xuICAgICAgICAgICAgICAgICduJzogZG9jLm5hbWUsXG4gICAgICAgICAgICAgICAgJ2lkJzogZG9jLmlkLFxuICAgICAgICAgICAgICAgICd1cmwnOiBkb2MudXJsLFxuICAgICAgICAgICAgICAgICdhY3RpdmUnOiBkb2MuYWN0aXZlLFxuICAgICAgICAgICAgICAgICdkZXMnOiBkb2MuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICAgICAgJ2Nvbic6IGRvYy5jb250YWN0LFxuICAgICAgICAgICAgICAgICdvd24nOiBkb2MuY3JlYXRvcixcbiAgICAgICAgICAgICAgICAnd3JpdGUnOiBkb2Mud3JpdGFibGUsXG4gICAgICAgICAgICAgICAgJ2NyJzogZG9jLmNyZWF0ZWQsXG4gICAgICAgICAgICAgICAgJ21vZCc6IGRvYy5tb2RpZmllZCxcbiAgICAgICAgICAgICAgICAnb3duZXJOYW1lJzogZG9jLmNyZWF0b3JfbmFtZSxcbiAgICAgICAgICAgICAgICAnb3duZXJFbWFpbCc6IGRvYy5jcmVhdG9yX2VtYWlsLFxuICAgICAgICAgICAgICAgICdpbml0aWFscyc6IGRvYy5pbml0aWFscyxcbiAgICAgICAgICAgICAgICAnbWF0Y2gnOiBtYXRjaFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBkb2MuaWQ7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJhbnNmb3JtZWQ7XG4gICAgfVxufVxuXG4vLyBkYXRhIHN0cnVjdHVyZSBtYXJrcyBhIHJlZ2lvbiBvZiBpbnRlcmVzdCBpbiBhIHN0cmluZyBwYXNzZWQgdGhyb3VnaCBSZXN1bHRNYXRjaGVyXG5pbnRlcmZhY2UgVGV4dFJlZ2lvbiB7XG4gICAgYmVnaW46bnVtYmVyO1xuICAgIGVuZDpudW1iZXI7XG4gICAgc291cmNlOnN0cmluZztcbn1cbi8vIGluaXRpYWxpemVkIHdpdGggYSBxdWVyeSBzdHJpbmcsIGNhbiBzZWFyY2ggc3R1ZHkgZmllbGRzIGZvciBtYXRjaGVzIHRvIHF1ZXJ5IHRlcm1zXG5jbGFzcyBSZXN1bHRNYXRjaGVyIHtcblxuICAgIHByaXZhdGUgX3F1ZXJ5OnN0cmluZ1tdO1xuICAgIHByaXZhdGUgX21hdGNoOntbaW5kZXg6c3RyaW5nXTpUZXh0UmVnaW9uW119O1xuXG4gICAgY29uc3RydWN0b3IocXVlcnk6c3RyaW5nKSB7XG4gICAgICAgIHRoaXMuX3F1ZXJ5ID0gcXVlcnkuc3BsaXQoL1xccysvKS5maWx0ZXIoKHgpID0+IHgubGVuZ3RoID4gMCk7XG4gICAgICAgIHRoaXMuX21hdGNoID0ge307XG4gICAgfVxuXG4gICAgLy8gc2VhcmNoZXMgZm9yIGNvbnN0cnVjdG9yIHRleHQgcXVlcnkgaW4gdGhlIHNvdXJjZSBzdHJpbmcsIHNhdmluZyB0byBmaWVsZCBuYW1lIGlmIGZvdW5kXG4gICAgZmluZEFuZFNldChmaWVsZDpzdHJpbmcsIHNvdXJjZTpzdHJpbmcpOlJlc3VsdE1hdGNoZXIge1xuICAgICAgICB2YXIgaW5kZXg6bnVtYmVyO1xuICAgICAgICB2YXIgbG93ZXI6c3RyaW5nID0gKHNvdXJjZSB8fCAnJykudG9Mb2NhbGVMb3dlckNhc2UoKTtcbiAgICAgICAgdGhpcy5fcXVlcnkuZm9yRWFjaCgocSkgPT4ge1xuICAgICAgICAgICAgaWYgKChpbmRleCA9IGxvd2VyLmluZGV4T2YocS50b0xvY2FsZUxvd2VyQ2FzZSgpKSkgPj0gMCkge1xuICAgICAgICAgICAgICAgICh0aGlzLl9tYXRjaFtmaWVsZF0gPSB0aGlzLl9tYXRjaFtmaWVsZF0gfHwgW10pLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBiZWdpbjogaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIGVuZDogaW5kZXggKyBxLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiBzb3VyY2VcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGdldEZpZWxkcygpOnN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHRoaXMuX21hdGNoKTtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIGFycmF5IG9mIHN0cmluZ3MgbWFya2VkIGFzIG1hdGNoaW5nIHRoZSBjb25zdHJ1Y3RvciB0ZXh0IHF1ZXJ5XG4gICAgZ2V0TWF0Y2hlcyhmaWVsZDpzdHJpbmcsIHByZWZpeD86c3RyaW5nLCBwb3N0Zml4PzpzdHJpbmcsIHNsb3A/Om51bWJlcik6c3RyaW5nW10ge1xuICAgICAgICBzbG9wID0gc2xvcCA9PT0gdW5kZWZpbmVkID8gTnVtYmVyLk1BWF9WQUxVRSA6IHNsb3A7XG4gICAgICAgIHJldHVybiAodGhpcy5fbWF0Y2hbZmllbGRdIHx8IFtdKS5tYXAoKHRleHQ6VGV4dFJlZ2lvbik6c3RyaW5nID0+IHtcbiAgICAgICAgICAgIHZhciBsZW5ndGggPSB0ZXh0LnNvdXJjZS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3RhcnQgPSBNYXRoLm1heCgwLCB0ZXh0LmJlZ2luIC0gc2xvcCksXG4gICAgICAgICAgICAgICAgZmluaXNoID0gTWF0aC5taW4odGV4dC5lbmQgKyBzbG9wLCBsZW5ndGgpLFxuICAgICAgICAgICAgICAgIHBhcnRzID0gW1xuICAgICAgICAgICAgICAgICAgICB0ZXh0LnNvdXJjZS5zbGljZShzdGFydCwgdGV4dC5iZWdpbiksXG4gICAgICAgICAgICAgICAgICAgIHByZWZpeCB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zb3VyY2Uuc2xpY2UodGV4dC5iZWdpbiwgdGV4dC5lbmQpLFxuICAgICAgICAgICAgICAgICAgICBwb3N0Zml4IHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICB0ZXh0LnNvdXJjZS5zbGljZSh0ZXh0LmVuZCwgZmluaXNoKVxuICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICBpZiAoc3RhcnQgPiAwKSBwYXJ0cy51bnNoaWZ0KCfigKYnKTtcbiAgICAgICAgICAgIGlmIChmaW5pc2ggPCBsZW5ndGgpIHBhcnRzLnB1c2goJ+KApicpO1xuICAgICAgICAgICAgcmV0dXJuIHBhcnRzLmpvaW4oJycpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8vIFRoaXMgaXMgYSBEYXRhR3JpZEhlYWRlcldpZGdldCBkZXJpdmVkIGZyb20gREdTZWFyY2hXaWRnZXQuXG4vLyBJdCdzIGEgc2VhcmNoIGZpZWxkIHRoYXQgb2ZmZXJzIG9wdGlvbnMgZm9yIGFkZGl0aW9uYWwgZGF0YSB0eXBlcywgcXVlcnlpbmcgdGhlIHNlcnZlciBmb3IgcmVzdWx0cy5cbmNsYXNzIERHU3R1ZGllc1NlYXJjaFdpZGdldCBleHRlbmRzIERHU2VhcmNoV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgX3NwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcztcblxuXHRzZWFyY2hEaXNjbG9zdXJlRWxlbWVudDpIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3RvcihncmlkOkRhdGFHcmlkLCBzcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIHBsYWNlSG9sZGVyOnN0cmluZywgc2l6ZTpudW1iZXIsIGdldHNGb2N1czpib29sZWFuKSB7XG5cdFx0c3VwZXIoZ3JpZCwgc3BlYywgcGxhY2VIb2xkZXIsIHNpemUsIGdldHNGb2N1cyk7XG4gICAgICAgIHRoaXMuX3NwZWMgPSBzcGVjO1xuXHR9XG5cblx0Ly8gVGhpcyBpcyBjYWxsZWQgdG8gYXBwZW5kIHRoZSB3aWRnZXQgZWxlbWVudHMgYmVuZWF0aCB0aGUgZ2l2ZW4gZWxlbWVudC5cblx0Ly8gSWYgdGhlIGVsZW1lbnRzIGhhdmUgbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuXHRhcHBlbmRFbGVtZW50cyhjb250YWluZXI6SFRNTEVsZW1lbnQsIHVuaXF1ZUlEOnN0cmluZyk6dm9pZCB7XG5cdFx0c3VwZXIuYXBwZW5kRWxlbWVudHMoY29udGFpbmVyLCB1bmlxdWVJRCk7XG4gICAgICAgIHZhciBzcGFuOkhUTUxTcGFuRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgICB2YXIgc3BhbklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnU2VhcmNoRGlzYycrdW5pcXVlSUQ7XG4gICAgICAgIHNwYW4uc2V0QXR0cmlidXRlKCdpZCcsIHNwYW5JRCk7XG4gICAgICAgIHNwYW4uY2xhc3NOYW1lID0gJ3NlYXJjaERpc2Nsb3N1cmUnO1xuICAgICAgICB0aGlzLnNlYXJjaERpc2Nsb3N1cmVFbGVtZW50ID0gc3Bhbjtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWFyY2hEaXNjbG9zdXJlRWxlbWVudCk7XG5cdH1cblxuICAgIC8vIE9WRVJSSURFXG4gICAgLy8gSEVZIEdVWVMgV0UgRE9OJ1QgTkVFRCBUTyBGSUxURVIgSEVSRSBBTllNT1JFXG4gICAgYXBwbHlGaWx0ZXJUb0lEcyhyb3dJRHM6c3RyaW5nW10pOnN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIHJvd0lEcztcbiAgICB9XG5cbiAgICAvLyBPVkVSUklERVxuICAgIC8vIFdlIHdhbnQgdG8gd29yayBzbGlnaHRseSBkaWZmZXJlbnRseSBmcm9tIGJhc2Ugd2lkZ2V0LCB3aGVyZSByZXR1cm4gZG9lcyBub3RoaW5nXG4gICAgaW5wdXRLZXlEb3duSGFuZGxlcihlKSB7XG4gICAgICAgIC8vIHN0aWxsIGRvIGV2ZXJ5dGhpbmcgcHJldmlvdXMgaGFuZGxlciBkb2VzXG4gICAgICAgIHN1cGVyLmlucHV0S2V5RG93bkhhbmRsZXIoZSk7XG4gICAgICAgIC8vIHdlIHdpbGwgaGFuZGxlIHJldHVybiBkaWZmZXJlbnRseVxuICAgICAgICBpZiAoZS5rZXlDb2RlID09PSAxMykge1xuICAgICAgICAgICAgdGhpcy50eXBpbmdEZWxheUV4cGlyYXRpb25IYW5kbGVyLmNhbGwoe30pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gT1ZFUlJJREVcbiAgICAvLyBXZSBkb24ndCBhdCBhbGwgd2FudCB0byBkbyB3aGF0IHRoZSBiYXNlIHdpZGdldCBkb2VzIGhlcmUsIG5vdCBhbGwgZGF0YSBpcyBsb2NhbFxuICAgIHR5cGluZ0RlbGF5RXhwaXJhdGlvbkhhbmRsZXIgPSAoKTp2b2lkID0+IHtcbiAgICAgICAgdmFyIGlucHV0OkpRdWVyeSA9ICQodGhpcy5lbGVtZW50KTtcbiAgICAgICAgdmFyIHYgPSBpbnB1dC52YWwoKTtcbiAgICAgICAgLy8gaWdub3JlIGlmIHRoZSBmb2xsb3dpbmcga2V5cyBhcmUgcHJlc3NlZDogW2RlbF0gW3NoaWZ0XSBbY2Fwc2xvY2tdXG4gICAgICAgIGlmICh0aGlzLmxhc3RLZXlQcmVzc0NvZGUgPiA4ICYmIHRoaXMubGFzdEtleVByZXNzQ29kZSA8IDMyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAodiA9PT0gdGhpcy5wcmV2aW91c1NlbGVjdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucHJldmlvdXNTZWxlY3Rpb24gPSB2O1xuICAgICAgICBpbnB1dC5hZGRDbGFzcygnd2FpdCcpO1xuICAgICAgICB0aGlzLl9zcGVjLnF1ZXJ5KHYpLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzOmJvb2xlYW4pOnZvaWQgPT4ge1xuICAgICAgICAgICAgaW5wdXQucmVtb3ZlQ2xhc3MoJ3dhaXQnKS50b2dnbGVDbGFzcygnZXJyb3InLCBzdWNjZXNzKTtcbiAgICAgICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG4vLyBIZXJlJ3MgYW4gZXhhbXBsZSBvZiBhIHdvcmtpbmcgRGF0YUdyaWRPcHRpb25XaWRnZXQuXG4vLyBXaGVuIGNoZWNrZWQsIHRoaXMgaGlkZXMgYWxsIFN0dWRpZXMgdGhhdCBhcmUgbm90IG93bmVkIGJ5IHRoZSBjdXJyZW50IHVzZXIuXG5jbGFzcyBER09ubHlNeVN0dWRpZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBwcml2YXRlIF9zcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXM7XG5cbiAgICBjb25zdHJ1Y3RvcihncmlkOkRhdGFHcmlkLCBzcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMpIHtcbiAgICAgICAgc3VwZXIoZ3JpZCwgc3BlYyk7XG4gICAgICAgIHRoaXMuX3NwZWMgPSBzcGVjO1xuICAgIH1cblxuICAgIGdldElERnJhZ21lbnQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3dNeVN0dWRpZXNDQic7XG4gICAgfVxuXG4gICAgZ2V0TGFiZWxUZXh0KCk6c3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdNeSBTdHVkaWVzIE9ubHknO1xuICAgIH1cblxuICAgIG9uV2lkZ2V0Q2hhbmdlKGUpOnZvaWQge1xuICAgICAgICAvLyB1cGRhdGUgc3BlYyB3aXRoIGZpbHRlciBvcHRpb25zXG4gICAgICAgIHZhciBmaWx0ZXIgPSB0aGlzLl9zcGVjLmZpbHRlcigpO1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgJC5leHRlbmQoZmlsdGVyLCB7ICdzaG93TWluZSc6IDEgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZWxldGUgZmlsdGVyLnNob3dNaW5lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3NwZWMuZmlsdGVyKGZpbHRlcikucmVxdWVzdFBhZ2VPZkRhdGEoKHN1Y2Nlc3M6Ym9vbGVhbik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuLy8gSGVyZSdzIGFub3RoZXIgZXhhbXBsZSBvZiBhIHdvcmtpbmcgRGF0YUdyaWRPcHRpb25XaWRnZXQuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIFN0dWRpZXMgdGhhdCBhcmUgbWFya2VkIGFzIGRpc2FibGVkLlxuY2xhc3MgREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBwcml2YXRlIF9zcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXM7XG5cbiAgICBjb25zdHJ1Y3RvcihncmlkOkRhdGFHcmlkLCBzcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMpIHtcbiAgICAgICAgc3VwZXIoZ3JpZCwgc3BlYyk7XG4gICAgICAgIHRoaXMuX3NwZWMgPSBzcGVjO1xuICAgIH1cblxuICAgIGdldElERnJhZ21lbnQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3dEU3R1ZGllc0NCJztcbiAgICB9XG5cbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ1Nob3cgRGlzYWJsZWQnO1xuICAgIH1cblxuICAgIG9uV2lkZ2V0Q2hhbmdlKGUpOnZvaWQge1xuICAgICAgICAvLyB1cGRhdGUgc3BlYyB3aXRoIGZpbHRlciBvcHRpb25zXG4gICAgICAgIHZhciBmaWx0ZXIgPSB0aGlzLl9zcGVjLmZpbHRlcigpO1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgJC5leHRlbmQoZmlsdGVyLCB7ICdzaG93RGlzYWJsZWQnOiAxIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVsZXRlIGZpbHRlci5zaG93RGlzYWJsZWQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fc3BlYy5maWx0ZXIoZmlsdGVyKS5yZXF1ZXN0UGFnZU9mRGF0YSgoc3VjY2Vzczpib29sZWFuKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cdGluaXRpYWxGb3JtYXRSb3dFbGVtZW50c0ZvcklEKGRhdGFSb3dPYmplY3RzOkRhdGFHcmlkRGF0YVJvd1tdLCByb3dJRDpzdHJpbmcpOmFueSB7XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5fc3BlYy5kYXRhKCk7XG5cdFx0aWYgKGRhdGFbcm93SURdLmRpcykge1xuXHRcdFx0Zm9yICh2YXIgciA9IDA7IHIgPCBkYXRhUm93T2JqZWN0cy5sZW5ndGg7IHIrKykge1xuXHRcdFx0XHR2YXIgcm93RWxlbWVudCA9IGRhdGFSb3dPYmplY3RzW3JdLmdldEVsZW1lbnQoKTtcblx0XHRcdFx0cm93RWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcIiNGRkMwQzBcIjtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoSW5kZXhQYWdlLnByZXBhcmVJdCk7XG4iXX0=