// File last modified on: Wed Dec 21 2016 14:53:35  
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
        this.studiesDataGridSpec.init();
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
        // override bootsrap
        $('#hStudyMod').css('border-right', '1px solid lightgrey');
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
}(DataGridSpecBase));
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
}());
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
}(DGSearchWidget));
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
}(DataGridOptionWidget));
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
}(DataGridOptionWidget));
// use JQuery ready event shortcut to call prepareIt when page is ready
$(IndexPage.prepareIt);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELG9DQUFvQztBQUNwQywrQkFBK0I7Ozs7OztBQUkvQixJQUFPLFNBQVMsQ0EyQmY7QUEzQkQsV0FBTyxTQUFTLEVBQUMsQ0FBQztJQUVqQixJQUFJLG1CQUFtQixHQUF1QixJQUFJLENBQUM7SUFDbkQsSUFBSSxlQUFlLEdBQVksSUFBSSxDQUFDO0lBRXBDLDhCQUE4QjtJQUM5QjtRQUNPLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzRCxTQUFTLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUhlLG1CQUFTLFlBR3hCLENBQUE7SUFFRTtRQUNJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUhlLGtCQUFRLFdBR3ZCLENBQUE7SUFFSjtRQUFBLGlCQVVDO1FBVEEsMERBQTBEO1FBQzFELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLG1CQUFtQixFQUFFLENBQUM7UUFDL0MsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxDQUFDO1FBRXRDLDZDQUE2QztRQUM3QyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFDLE9BQU87WUFDL0MsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUFDLEtBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLEVBQUUs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SSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsaUJBQWlCLENBQUMsVUFBQyxPQUFlO1lBQ3hELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsS0FBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDaEQsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVKLCtEQUE2QixHQUE3QixVQUE4QixjQUFnQyxFQUFFLEtBQVk7UUFDckUsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNuQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNyQixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDaEQsSUFBSSxVQUFVLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNoRCxVQUFVLENBQUMsS0FBSyxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7WUFDOUMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBQ0YsOEJBQUM7QUFBRCxDQUFDLEFBekNELENBQXNDLG9CQUFvQixHQXlDekQ7QUFFRCx1RUFBdUU7QUFDdkUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGUgbGFzdCBtb2RpZmllZCBvbjogV2VkIERlYyAyMSAyMDE2IDE0OjUzOjM1ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cblxuZGVjbGFyZSB2YXIgRURERGF0YTpFREREYXRhOyAgLy8gc3RpY2tpbmcgdGhpcyBoZXJlIGFzIElERSBpc24ndCBmb2xsb3dpbmcgcmVmZXJlbmNlc1xuXG5tb2R1bGUgSW5kZXhQYWdlIHtcblxuXHR2YXIgc3R1ZGllc0RhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzID0gbnVsbDtcblx0dmFyIHN0dWRpZXNEYXRhR3JpZDpEYXRhR3JpZCA9IG51bGw7XG5cblx0Ly8gQ2FsbGVkIHdoZW4gdGhlIHBhZ2UgbG9hZHMuXG5cdGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlSXQoKSB7XG4gICAgICAgICQoJy5kaXNjbG9zZScpLmZpbmQoJy5kaXNjbG9zZUxpbmsnKS5vbignY2xpY2snLCBkaXNjbG9zZSk7XG4gICAgICAgIEluZGV4UGFnZS5wcmVwYXJlVGFibGUoKTtcblx0fVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGRpc2Nsb3NlKCkge1xuICAgICAgICAkKHRoaXMpLmNsb3Nlc3QoJy5kaXNjbG9zZScpLnRvZ2dsZUNsYXNzKCdkaXNjbG9zZUhpZGUnKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcHJlcGFyZVRhYmxlKCkge1xuXHRcdC8vIEluc3RhbnRpYXRlIGEgdGFibGUgc3BlY2lmaWNhdGlvbiBmb3IgdGhlIFN0dWRpZXMgdGFibGVcblx0XHR0aGlzLnN0dWRpZXNEYXRhR3JpZFNwZWMgPSBuZXcgRGF0YUdyaWRTcGVjU3R1ZGllcygpO1xuICAgICAgICB0aGlzLnN0dWRpZXNEYXRhR3JpZFNwZWMuaW5pdCgpO1xuXG5cdFx0Ly8gSW5zdGFudGlhdGUgdGhlIHRhYmxlIGl0c2VsZiB3aXRoIHRoZSBzcGVjXG5cdFx0dGhpcy5zdHVkaWVzRGF0YUdyaWQgPSBuZXcgRGF0YUdyaWQodGhpcy5zdHVkaWVzRGF0YUdyaWRTcGVjKTtcbiAgICAgICAgdGhpcy5zdHVkaWVzRGF0YUdyaWRTcGVjLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzKSA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2VzcykgdGhpcy5zdHVkaWVzRGF0YUdyaWQudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICB9KTtcblx0fVxufTtcblxuXG4vLyBUaGUgc3BlYyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBEYXRhR3JpZCB0byBjcmVhdGUgdGhlIFN0dWRpZXMgdGFibGVcbmNsYXNzIERhdGFHcmlkU3BlY1N0dWRpZXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIGltcGxlbWVudHMgREdQYWdlRGF0YVNvdXJjZSB7XG5cbiAgICAvLyBzcGVjIG9iamVjdCB0cmFja3Mgd2hhdCBkYXRhIHNob3VsZCBiZSBkaXNwbGF5ZWQgYnkgdGhlIHRhYmxlXG4gICAgcHJpdmF0ZSBkYXRhT2JqOnt9O1xuICAgIHByaXZhdGUgcmVjb3JkSWRzOnN0cmluZ1tdID0gW107XG4gICAgcHJpdmF0ZSBfc2l6ZTpudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgX29mZnNldDpudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgX3BhZ2VTaXplOm51bWJlciA9IDUwO1xuICAgIHByaXZhdGUgX3F1ZXJ5OnN0cmluZyA9ICcnO1xuICAgIHByaXZhdGUgX3NlYXJjaE9wdCA9IHt9O1xuICAgIGRlc2NyaXB0aW9uQ29sOkRhdGFHcmlkQ29sdW1uU3BlYztcblxuXHQvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuXHRkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ3N0dWRpZXMnLCB7ICduYW1lJzogJ1N0dWRpZXMnIH0pO1xuXHR9XG5cblx0Ly8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcblx0ZGVmaW5lSGVhZGVyU3BlYygpOkRhdGFHcmlkSGVhZGVyU3BlY1tdIHtcbiAgICAgICAgLy8gY2FwdHVyZSBoZXJlLCBhcyB0aGUgYHRoaXNgIHZhcmlhYmxlIGJlbG93IHdpbGwgcG9pbnQgdG8gZ2xvYmFsIG9iamVjdCwgbm90IHRoaXMgb2JqZWN0XG4gICAgICAgIHZhciBzZWxmOkRhdGFHcmlkU3BlY1N0dWRpZXMgPSB0aGlzO1xuXHRcdHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoU3R1ZHlOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1N0dWR5IE5hbWUnLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnbmFtZV9zJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hTdHVkeURlc2MnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnRGVzY3JpcHRpb24nLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnZGVzY19zJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMywgJ2hTdHVkeU93bmVySW5pdGlhbHMnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnT3duZXInLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnaW5pdGlhbHMnIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg0LCAnaFN0dWR5T3duZXJGdWxsTmFtZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdPd25lciBGdWxsIE5hbWUnLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnY3JlYXRvcl9zJyB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSwgJ2hTdHVkeU93bmVySW5zdGl0dXRlJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0luc3RpdHV0ZScsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYsICdoU3R1ZHlDcmVhdGVkJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NyZWF0ZWQnLFxuICAgICAgICAgICAgICAgICdzb3J0SWQnOiAnY3JlYXRlZCcgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDcsICdoU3R1ZHlNb2QnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFzdCBNb2RpZmllZCcsXG4gICAgICAgICAgICAgICAgJ3NvcnRJZCc6ICdtb2RpZmllZCcgfSlcblx0XHRdO1xuXHR9XG5cbiAgICBnZW5lcmF0ZVN0dWR5TmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIHN0dWR5RG9jID0gZ3JpZFNwZWMuZGF0YU9ialtpbmRleF07XG4gICAgICAgIHZhciBzaWRlTWVudUl0ZW1zID0gW107XG4gICAgICAgIHZhciBtYXRjaDpSZXN1bHRNYXRjaGVyID0gc3R1ZHlEb2MubWF0Y2g7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgc2lkZU1lbnVJdGVtcyA9IG1hdGNoLmdldEZpZWxkcygpLm1hcCgoZmllbGQpOnN0cmluZyA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoZXMgPSBtYXRjaC5nZXRNYXRjaGVzKGZpZWxkLCAnPHNwYW4gY2xhc3M9XCJzZWFyY2hfbWF0Y2hcIj4nLCAnPC9zcGFuPicsIDEwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ01hdGNoZWQgb24gJyArIGZpZWxkICsgJzogJyArIG1hdGNoZXMuam9pbignLCAnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnaG92ZXJFZmZlY3QnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdub3dyYXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogc2lkZU1lbnVJdGVtcyxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFsgJzxhIGhyZWY9XCInLCBzdHVkeURvYy51cmwsICdcIiBjbGFzcz1cImRhcmtlclwiPicsIHN0dWR5RG9jLm4sICc8L2E+JyBdLmpvaW4oJycpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlRGVzY3JpcHRpb25DZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnbWF4V2lkdGgnOiAnNDAwJyxcbiAgICAgICAgICAgICAgICAnY3VzdG9tSUQnOiAoaWQpID0+IHsgcmV0dXJuICdlZGl0YWJsZURlc2NyaXB0aW9uRmllbGQnICsgaWQ7IH0sXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBncmlkU3BlYy5kYXRhT2JqW2luZGV4XS5kZXMgfHwgJydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVPd25lckluaXRpYWxzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBncmlkU3BlYy5kYXRhT2JqW2luZGV4XS5pbml0aWFscyB8fCAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVPd25lck5hbWVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGdyaWRTcGVjLmRhdGFPYmpbaW5kZXhdLm93bmVyTmFtZSB8fCAnPydcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVJbnN0aXR1dGlvbkNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlQ3JlYXRlZENlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnV0Y1RvVG9kYXlTdHJpbmcoZ3JpZFNwZWMuZGF0YU9ialtpbmRleF0uY3IpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTW9kaWZpZWRDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy51dGNUb1RvZGF5U3RyaW5nKGdyaWRTcGVjLmRhdGFPYmpbaW5kZXhdLm1vZClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG5cdC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG5cdGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIC8vIGNhcHR1cmUgaGVyZSwgYXMgdGhlIGB0aGlzYCB2YXJpYWJsZSBiZWxvdyB3aWxsIHBvaW50IHRvIGdsb2JhbCBvYmplY3QsIG5vdCB0aGlzIG9iamVjdFxuICAgICAgICB2YXIgc2VsZjpEYXRhR3JpZFNwZWNTdHVkaWVzID0gdGhpcztcblx0XHRyZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygxLCB0aGlzLmdlbmVyYXRlU3R1ZHlOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgdGhpcy5kZXNjcmlwdGlvbkNvbCA9IG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiwgdGhpcy5nZW5lcmF0ZURlc2NyaXB0aW9uQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzLCB0aGlzLmdlbmVyYXRlT3duZXJJbml0aWFsc0NlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCwgdGhpcy5nZW5lcmF0ZU93bmVyTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNSwgdGhpcy5nZW5lcmF0ZUluc3RpdHV0aW9uQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2LCB0aGlzLmdlbmVyYXRlQ3JlYXRlZENlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNywgdGhpcy5nZW5lcmF0ZU1vZGlmaWVkQ2VsbHMpXG5cdFx0XTtcblx0fVxuXG5cdC8vIFNwZWNpZmljYXRpb24gZm9yIGVhY2ggb2YgdGhlIGdyb3VwcyB0aGF0IHRoZSBoZWFkZXJzIGFuZCBkYXRhIGNvbHVtbnMgYXJlIG9yZ2FuaXplZCBpbnRvXG5cdGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuXHRcdHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ1N0dWR5IE5hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdEZXNjcmlwdGlvbicpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdPd25lciBJbml0aWFscycpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdPd25lciBGdWxsIE5hbWUnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdJbnN0aXR1dGUnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdEYXRlIENyZWF0ZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYXN0IE1vZGlmaWVkJylcblx0XHRdO1xuXHR9XG5cblx0Ly8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZSBjb250ZW50IHdpbGwgYmUgcmVtb3ZlZC5cblx0Z2V0VGFibGVFbGVtZW50KCkge1xuXHRcdHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0dWRpZXNUYWJsZVwiKTtcblx0fVxuXG5cdC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycywgdXNlZCB0byBpZGVudGlmeSB0aGUgcmVjb3JkcyBpbiB0aGUgZGF0YSBzZXQgYmVpbmcgZGlzcGxheWVkXG5cdGdldFJlY29yZElEcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVjb3JkSWRzO1xuXHR9XG5cbiAgICBlbmFibGVTb3J0KGdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkU3BlY1N0dWRpZXMge1xuICAgICAgICBzdXBlci5lbmFibGVTb3J0KGdyaWQpO1xuICAgICAgICB0aGlzLnRhYmxlSGVhZGVyU3BlYy5mb3JFYWNoKChoZWFkZXIpID0+IHtcbiAgICAgICAgICAgIGlmIChoZWFkZXIuc29ydElkKSB7XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGFueSBldmVudHMgZnJvbSBzdXBlciBpbiBmYXZvciBvZiBvdXIgb3duXG4gICAgICAgICAgICAgICAgJChoZWFkZXIuZWxlbWVudCkub2ZmKCdjbGljay5kYXRhdGFibGUnKS5vbignY2xpY2suZGF0YXRhYmxlJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sdW1uU29ydChncmlkLCBoZWFkZXIsIGV2KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29sdW1uU29ydChncmlkOkRhdGFHcmlkLCBoZWFkZXI6RGF0YUdyaWRIZWFkZXJTcGVjLCBldik6YW55IHtcbiAgICAgICAgdmFyIHNvcnQgPSBncmlkLnNvcnRDb2xzKCksIG9sZFNvcnQsIG5ld1NvcnQsIHNvcnRPcHQ7XG4gICAgICAgIGlmIChldi5zaGlmdEtleSB8fCBldi5jdHJsS2V5IHx8IGV2Lm1ldGFLZXkpIHtcbiAgICAgICAgICAgIG5ld1NvcnQgPSBzb3J0LmZpbHRlcigodikgPT4geyByZXR1cm4gdi5zcGVjLnNvcnRJZCA9PT0gaGVhZGVyLnNvcnRJZDsgfSk7XG4gICAgICAgICAgICBvbGRTb3J0ID0gc29ydC5maWx0ZXIoKHYpID0+IHsgcmV0dXJuIHYuc3BlYy5zb3J0SWQgIT09IGhlYWRlci5zb3J0SWQ7IH0pO1xuICAgICAgICAgICAgLy8gaWYgY29sdW1uIGFscmVhZHkgc29ydGVkLCBmbGlwIGFzYzsgbW92ZSBjb2x1bW4gdG8gZnJvbnQgb2Ygc29ydCBsaXN0XG4gICAgICAgICAgICBpZiAobmV3U29ydC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBuZXdTb3J0WzBdLmFzYyA9ICFuZXdTb3J0WzBdLmFzYztcbiAgICAgICAgICAgICAgICAoc29ydCA9IG9sZFNvcnQpLnVuc2hpZnQobmV3U29ydFswXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNvcnQudW5zaGlmdCh7IHNwZWM6IGhlYWRlciwgYXNjOiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNvcnQubGVuZ3RoID09PSAxICYmIHNvcnRbMF0uc3BlYy5zb3J0SWQgPT09IGhlYWRlci5zb3J0SWQpIHtcbiAgICAgICAgICAgIHNvcnRbMF0uYXNjID0gIXNvcnRbMF0uYXNjO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydCA9IFsgeyBzcGVjOiBoZWFkZXIsIGFzYzogdHJ1ZSB9IF07XG4gICAgICAgIH1cbiAgICAgICAgZ3JpZC5zb3J0Q29scyhzb3J0KTtcbiAgICAgICAgLy8gY29udmVydCB0byBzb3J0IHN0cmluZ3MsIGZpbHRlciBvdXQgZmFsc3kgdmFsdWVzLCBqb2luIHdpdGggY29tbWFzXG4gICAgICAgIHNvcnRPcHQgPSBzb3J0Lm1hcCgoY29sOkRhdGFHcmlkU29ydCkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbC5zcGVjLnNvcnRJZCkgcmV0dXJuIGNvbC5zcGVjLnNvcnRJZCArIChjb2wuYXNjID8gJyBhc2MnIDogJyBkZXNjJyk7XG4gICAgICAgIH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCcsJyk7XG4gICAgICAgIC8vIHN0b3JlIGluIG9wdGlvbnMgb2JqZWN0LCBhcyBncmlkIHdpbGwgbm90IGJlIGF2YWlsYWJsZSBpbiByZXF1ZXN0UGFnZU9mRGF0YVxuICAgICAgICAkLmV4dGVuZCh0aGlzLl9zZWFyY2hPcHQsIHsgJ3NvcnQnOiBzb3J0T3B0IH0pO1xuICAgICAgICB0aGlzLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzKSA9PiB7XG4gICAgICAgICAgICBpZiAoc3VjY2VzcykgZ3JpZC50cmlnZ2VyRGF0YVJlc2V0KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHBhZ2VTaXplKCk6bnVtYmVyO1xuICAgIHBhZ2VTaXplKHNpemU6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHBhZ2VTaXplKHNpemU/Om51bWJlcik6YW55IHtcbiAgICAgICAgaWYgKHNpemUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BhZ2VTaXplO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcGFnZVNpemUgPSBzaXplO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0b3RhbE9mZnNldCgpOm51bWJlcjtcbiAgICB0b3RhbE9mZnNldChvZmZzZXQ6bnVtYmVyKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHRvdGFsT2Zmc2V0KG9mZnNldD86bnVtYmVyKTphbnkge1xuICAgICAgICBpZiAob2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9vZmZzZXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9vZmZzZXQgPSBvZmZzZXQ7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvdGFsU2l6ZSgpOm51bWJlcjtcbiAgICB0b3RhbFNpemUoc2l6ZTpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgdG90YWxTaXplKHNpemU/Om51bWJlcik6YW55IHtcbiAgICAgICAgaWYgKHNpemUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NpemU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zaXplID0gc2l6ZTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmlld1NpemUoKTpudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRSZWNvcmRJRHMoKS5sZW5ndGg7XG4gICAgfVxuXG4gICAgcXVlcnkoKTpzdHJpbmc7XG4gICAgcXVlcnkocXVlcnk6c3RyaW5nKTpER1BhZ2VEYXRhU291cmNlO1xuICAgIHF1ZXJ5KHF1ZXJ5PzpzdHJpbmcpOmFueSB7XG4gICAgICAgIGlmIChxdWVyeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcXVlcnk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHF1ZXJ5O1xuICAgICAgICAgICAgdGhpcy5fb2Zmc2V0ID0gMDsgLy8gcmVzZXQgb2Zmc2V0IHdoZW4gcXVlcnkgY2hhbmdlc1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmaWx0ZXIoKTphbnk7XG4gICAgZmlsdGVyKG9wdDphbnkpOkRHUGFnZURhdGFTb3VyY2U7XG4gICAgZmlsdGVyKG9wdD86YW55KTphbnkge1xuICAgICAgICBpZiAob3B0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zZWFyY2hPcHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zZWFyY2hPcHQgPSBvcHQ7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhZ2VEZWx0YShkZWx0YTpudW1iZXIpOkRHUGFnZURhdGFTb3VyY2Uge1xuICAgICAgICB0aGlzLl9vZmZzZXQgKz0gKGRlbHRhICogdGhpcy5fcGFnZVNpemUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICByZXF1ZXN0UGFnZU9mRGF0YShjYWxsYmFjaz86KHN1Y2Nlc3M6Ym9vbGVhbikgPT4gdm9pZCk6REdQYWdlRGF0YVNvdXJjZSB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAndXJsJzogJy9zdHVkeS9zZWFyY2gvJyxcbiAgICAgICAgICAgICd0eXBlJzogJ0dFVCcsXG4gICAgICAgICAgICAnZGF0YSc6ICQuZXh0ZW5kKHt9LCB0aGlzLl9zZWFyY2hPcHQsIHtcbiAgICAgICAgICAgICAgICAncSc6IHRoaXMuX3F1ZXJ5LFxuICAgICAgICAgICAgICAgICdpJzogdGhpcy5fb2Zmc2V0LFxuICAgICAgICAgICAgICAgICdzaXplJzogdGhpcy5fcGFnZVNpemVcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coWydTZWFyY2ggZmFpbGVkOiAnLCBzdGF0dXMsICc7JywgZV0uam9pbignJykpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoe30sIGZhbHNlKTtcbiAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ3N1Y2Nlc3MnOiAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YShkYXRhLmRvY3MsIGRhdGEubnVtRm91bmQsIGRhdGEuc3RhcnQpO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoe30sIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuXG5cdC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgYWRkZWQgdG8gdGhlIGhlYWRlciBiYXIuXG5cdC8vIEl0J3MgcGVyZmVjdGx5IGZpbmUgdG8gcmV0dXJuIGFuIGVtcHR5IGFycmF5LlxuXHRjcmVhdGVDdXN0b21IZWFkZXJXaWRnZXRzKGRhdGFHcmlkOkRhdGFHcmlkKTpEYXRhR3JpZEhlYWRlcldpZGdldFtdIHtcbiAgICAgICAgLy8gb3ZlcnJpZGUgYm9vdHNyYXBcbiAgICAgICAgJCgnI2hTdHVkeU1vZCcpLmNzcygnYm9yZGVyLXJpZ2h0JywgJzFweCBzb2xpZCBsaWdodGdyZXknKVxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIFN0dWRpZXNcbiAgICAgICAgdmFyIGFycmF5OkRhdGFHcmlkSGVhZGVyV2lkZ2V0W10gPSBbXG4gICAgICAgICAgICBuZXcgREdTdHVkaWVzU2VhcmNoV2lkZ2V0KGRhdGFHcmlkLCB0aGlzLCAnU2VhcmNoIFN0dWRpZXMnLCA0MCwgdHJ1ZSksXG4gICAgICAgICAgICBuZXcgREdQYWdpbmdXaWRnZXQoZGF0YUdyaWQsIHRoaXMsIHRoaXMpXG4gICAgICAgIF07XG4gICAgICAgIHJldHVybiBhcnJheTtcblx0fVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuXG5cdC8vIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgb3JkZXIgdGhleSBhcmUgZGlzcGxheWVkIGluIHRoZSBtZW51LlxuXHQvLyBJdCdzIHBlcmZlY3RseSBmaW5lIHRvIHJldHVybiBhbiBlbXB0eSBhcnJheS5cblx0Y3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuXHRcdHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2luZ2xlIHdpZGdldCBmb3Igc2hvd2luZyBvbmx5IHRoZSBTdHVkaWVzIHRoYXQgYmVsb25nIHRvIHRoZSBjdXJyZW50IHVzZXJcblx0XHR2YXIgb25seU15U3R1ZGllc1dpZGdldCA9IG5ldyBER09ubHlNeVN0dWRpZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuXHRcdHdpZGdldFNldC5wdXNoKG9ubHlNeVN0dWRpZXNXaWRnZXQpO1xuXHRcdC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgU3R1ZGllc1xuXHRcdHZhciBkaXNhYmxlZFN0dWRpZXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZFN0dWRpZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuXHRcdHdpZGdldFNldC5wdXNoKGRpc2FibGVkU3R1ZGllc1dpZGdldCk7XG5cdFx0cmV0dXJuIHdpZGdldFNldDtcblx0fVxuXG5cdC8vIFRoaXMgaXMgY2FsbGVkIGFmdGVyIGV2ZXJ5dGhpbmcgaXMgaW5pdGlhbGl6ZWQsIGluY2x1ZGluZyB0aGUgY3JlYXRpb24gb2YgdGhlIHRhYmxlIGNvbnRlbnQuXG5cdG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXHR9XG5cbiAgICBkYXRhKCk6YW55O1xuICAgIGRhdGEocmVwbGFjZW1lbnQ6YW55W10sIHRvdGFsU2l6ZT86bnVtYmVyLCB0b3RhbE9mZnNldD86bnVtYmVyKTpEYXRhR3JpZFNwZWNTdHVkaWVzO1xuICAgIGRhdGEocmVwbGFjZW1lbnQ/OmFueVtdLCB0b3RhbFNpemU/Om51bWJlciwgdG90YWxPZmZzZXQ/Om51bWJlcik6YW55IHtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRhdGFPYmo7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFPYmogPSB0aGlzLl90cmFuc2Zvcm1EYXRhKHJlcGxhY2VtZW50KTsgLy8gdHJhbnNmb3JtIGFsc28gaGFuZGxlcyBzdG9yaW5nIHNvcnQga2V5c1xuICAgICAgICAgICAgdGhpcy5fc2l6ZSA9IHRvdGFsU2l6ZSB8fCB0aGlzLnZpZXdTaXplKCk7XG4gICAgICAgICAgICB0aGlzLl9vZmZzZXQgPSB0b3RhbE9mZnNldCB8fCAwO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgX3RyYW5zZm9ybURhdGEoZG9jczphbnlbXSk6YW55IHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkID0ge307XG4gICAgICAgIHRoaXMucmVjb3JkSWRzID0gZG9jcy5tYXAoKGRvYyk6c3RyaW5nID0+IHtcbiAgICAgICAgICAgIHZhciBtYXRjaCA9IG5ldyBSZXN1bHRNYXRjaGVyKHRoaXMuX3F1ZXJ5KTtcbiAgICAgICAgICAgIC8vIHN0cmFpZ2h0Zm9yd2FyZCBtYXRjaGluZyBvbiBuYW1lLCBkZXNjcmlwdGlvbiwgY29udGFjdCwgY3JlYXRvcl9uYW1lLCBpbml0aWFsc1xuICAgICAgICAgICAgbWF0Y2guZmluZEFuZFNldCgnbmFtZScsIGRvYy5uYW1lKVxuICAgICAgICAgICAgICAgIC5maW5kQW5kU2V0KCdkZXNjcmlwdGlvbicsIGRvYy5kZXNjcmlwdGlvbilcbiAgICAgICAgICAgICAgICAuZmluZEFuZFNldCgnY29udGFjdCcsIGRvYy5jb250YWN0KVxuICAgICAgICAgICAgICAgIC5maW5kQW5kU2V0KCdjcmVhdG9yJywgZG9jLmNyZWF0b3JfbmFtZSlcbiAgICAgICAgICAgICAgICAuZmluZEFuZFNldCgnaW5pdGlhbHMnLCBkb2MuaW5pdGlhbHMpO1xuICAgICAgICAgICAgLy8gc3RyaXAgdGhlIFwiSURAXCIgcG9ydGlvbiBiZWZvcmUgbWF0Y2hpbmcgb24gbWV0YWJvbGl0ZSwgcHJvdG9jb2wsIHBhcnRcbiAgICAgICAgICAgIChkb2MubWV0YWJvbGl0ZSB8fCBbXSkuZm9yRWFjaCgobWV0YWJvbGl0ZTpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBtYXRjaC5maW5kQW5kU2V0KCdtZXRhYm9saXRlJywgbWV0YWJvbGl0ZS5zbGljZShtZXRhYm9saXRlLmluZGV4T2YoJ0AnKSArIDEpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgKGRvYy5wcm90b2NvbCB8fCBbXSkuZm9yRWFjaCgocHJvdG9jb2w6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgbWF0Y2guZmluZEFuZFNldCgncHJvdG9jb2wnLCBwcm90b2NvbC5zbGljZShwcm90b2NvbC5pbmRleE9mKCdAJykgKyAxKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIChkb2MucGFydCB8fCBbXSkuZm9yRWFjaCgocGFydDpzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBtYXRjaC5maW5kQW5kU2V0KCdwYXJ0JywgcGFydC5zbGljZShwYXJ0LmluZGV4T2YoJ0AnKSArIDEpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdHJhbnNmb3JtZWRbZG9jLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAnbic6IGRvYy5uYW1lLFxuICAgICAgICAgICAgICAgICdpZCc6IGRvYy5pZCxcbiAgICAgICAgICAgICAgICAndXJsJzogZG9jLnVybCxcbiAgICAgICAgICAgICAgICAnYWN0aXZlJzogZG9jLmFjdGl2ZSxcbiAgICAgICAgICAgICAgICAnZGVzJzogZG9jLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgICdjb24nOiBkb2MuY29udGFjdCxcbiAgICAgICAgICAgICAgICAnb3duJzogZG9jLmNyZWF0b3IsXG4gICAgICAgICAgICAgICAgJ3dyaXRlJzogZG9jLndyaXRhYmxlLFxuICAgICAgICAgICAgICAgICdjcic6IGRvYy5jcmVhdGVkLFxuICAgICAgICAgICAgICAgICdtb2QnOiBkb2MubW9kaWZpZWQsXG4gICAgICAgICAgICAgICAgJ293bmVyTmFtZSc6IGRvYy5jcmVhdG9yX25hbWUsXG4gICAgICAgICAgICAgICAgJ293bmVyRW1haWwnOiBkb2MuY3JlYXRvcl9lbWFpbCxcbiAgICAgICAgICAgICAgICAnaW5pdGlhbHMnOiBkb2MuaW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgJ21hdGNoJzogbWF0Y2hcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZG9jLmlkO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVkO1xuICAgIH1cbn1cblxuLy8gZGF0YSBzdHJ1Y3R1cmUgbWFya3MgYSByZWdpb24gb2YgaW50ZXJlc3QgaW4gYSBzdHJpbmcgcGFzc2VkIHRocm91Z2ggUmVzdWx0TWF0Y2hlclxuaW50ZXJmYWNlIFRleHRSZWdpb24ge1xuICAgIGJlZ2luOm51bWJlcjtcbiAgICBlbmQ6bnVtYmVyO1xuICAgIHNvdXJjZTpzdHJpbmc7XG59XG4vLyBpbml0aWFsaXplZCB3aXRoIGEgcXVlcnkgc3RyaW5nLCBjYW4gc2VhcmNoIHN0dWR5IGZpZWxkcyBmb3IgbWF0Y2hlcyB0byBxdWVyeSB0ZXJtc1xuY2xhc3MgUmVzdWx0TWF0Y2hlciB7XG5cbiAgICBwcml2YXRlIF9xdWVyeTpzdHJpbmdbXTtcbiAgICBwcml2YXRlIF9tYXRjaDp7W2luZGV4OnN0cmluZ106VGV4dFJlZ2lvbltdfTtcblxuICAgIGNvbnN0cnVjdG9yKHF1ZXJ5OnN0cmluZykge1xuICAgICAgICB0aGlzLl9xdWVyeSA9IHF1ZXJ5LnNwbGl0KC9cXHMrLykuZmlsdGVyKCh4KSA9PiB4Lmxlbmd0aCA+IDApO1xuICAgICAgICB0aGlzLl9tYXRjaCA9IHt9O1xuICAgIH1cblxuICAgIC8vIHNlYXJjaGVzIGZvciBjb25zdHJ1Y3RvciB0ZXh0IHF1ZXJ5IGluIHRoZSBzb3VyY2Ugc3RyaW5nLCBzYXZpbmcgdG8gZmllbGQgbmFtZSBpZiBmb3VuZFxuICAgIGZpbmRBbmRTZXQoZmllbGQ6c3RyaW5nLCBzb3VyY2U6c3RyaW5nKTpSZXN1bHRNYXRjaGVyIHtcbiAgICAgICAgdmFyIGluZGV4Om51bWJlcjtcbiAgICAgICAgdmFyIGxvd2VyOnN0cmluZyA9IChzb3VyY2UgfHwgJycpLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG4gICAgICAgIHRoaXMuX3F1ZXJ5LmZvckVhY2goKHEpID0+IHtcbiAgICAgICAgICAgIGlmICgoaW5kZXggPSBsb3dlci5pbmRleE9mKHEudG9Mb2NhbGVMb3dlckNhc2UoKSkpID49IDApIHtcbiAgICAgICAgICAgICAgICAodGhpcy5fbWF0Y2hbZmllbGRdID0gdGhpcy5fbWF0Y2hbZmllbGRdIHx8IFtdKS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgYmVnaW46IGluZGV4LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IGluZGV4ICsgcS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogc291cmNlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBnZXRGaWVsZHMoKTpzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0aGlzLl9tYXRjaCk7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyBhcnJheSBvZiBzdHJpbmdzIG1hcmtlZCBhcyBtYXRjaGluZyB0aGUgY29uc3RydWN0b3IgdGV4dCBxdWVyeVxuICAgIGdldE1hdGNoZXMoZmllbGQ6c3RyaW5nLCBwcmVmaXg/OnN0cmluZywgcG9zdGZpeD86c3RyaW5nLCBzbG9wPzpudW1iZXIpOnN0cmluZ1tdIHtcbiAgICAgICAgc2xvcCA9IHNsb3AgPT09IHVuZGVmaW5lZCA/IE51bWJlci5NQVhfVkFMVUUgOiBzbG9wO1xuICAgICAgICByZXR1cm4gKHRoaXMuX21hdGNoW2ZpZWxkXSB8fCBbXSkubWFwKCh0ZXh0OlRleHRSZWdpb24pOnN0cmluZyA9PiB7XG4gICAgICAgICAgICB2YXIgbGVuZ3RoID0gdGV4dC5zb3VyY2UubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHN0YXJ0ID0gTWF0aC5tYXgoMCwgdGV4dC5iZWdpbiAtIHNsb3ApLFxuICAgICAgICAgICAgICAgIGZpbmlzaCA9IE1hdGgubWluKHRleHQuZW5kICsgc2xvcCwgbGVuZ3RoKSxcbiAgICAgICAgICAgICAgICBwYXJ0cyA9IFtcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zb3VyY2Uuc2xpY2Uoc3RhcnQsIHRleHQuYmVnaW4pLFxuICAgICAgICAgICAgICAgICAgICBwcmVmaXggfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIHRleHQuc291cmNlLnNsaWNlKHRleHQuYmVnaW4sIHRleHQuZW5kKSxcbiAgICAgICAgICAgICAgICAgICAgcG9zdGZpeCB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgdGV4dC5zb3VyY2Uuc2xpY2UodGV4dC5lbmQsIGZpbmlzaClcbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKHN0YXJ0ID4gMCkgcGFydHMudW5zaGlmdCgn4oCmJyk7XG4gICAgICAgICAgICBpZiAoZmluaXNoIDwgbGVuZ3RoKSBwYXJ0cy5wdXNoKCfigKYnKTtcbiAgICAgICAgICAgIHJldHVybiBwYXJ0cy5qb2luKCcnKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG4vLyBUaGlzIGlzIGEgRGF0YUdyaWRIZWFkZXJXaWRnZXQgZGVyaXZlZCBmcm9tIERHU2VhcmNoV2lkZ2V0LlxuLy8gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVycyBvcHRpb25zIGZvciBhZGRpdGlvbmFsIGRhdGEgdHlwZXMsIHF1ZXJ5aW5nIHRoZSBzZXJ2ZXIgZm9yIHJlc3VsdHMuXG5jbGFzcyBER1N0dWRpZXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBwcml2YXRlIF9zcGVjOkRhdGFHcmlkU3BlY1N0dWRpZXM7XG5cblx0c2VhcmNoRGlzY2xvc3VyZUVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoZ3JpZDpEYXRhR3JpZCwgc3BlYzpEYXRhR3JpZFNwZWNTdHVkaWVzLCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLCBnZXRzRm9jdXM6Ym9vbGVhbikge1xuXHRcdHN1cGVyKGdyaWQsIHNwZWMsIHBsYWNlSG9sZGVyLCBzaXplLCBnZXRzRm9jdXMpO1xuICAgICAgICB0aGlzLl9zcGVjID0gc3BlYztcblx0fVxuXG4gICAgLy8gT1ZFUlJJREVcbiAgICAvLyBIRVkgR1VZUyBXRSBET04nVCBORUVEIFRPIEZJTFRFUiBIRVJFIEFOWU1PUkVcbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gcm93SURzO1xuICAgIH1cblxuICAgIC8vIE9WRVJSSURFXG4gICAgLy8gV2Ugd2FudCB0byB3b3JrIHNsaWdodGx5IGRpZmZlcmVudGx5IGZyb20gYmFzZSB3aWRnZXQsIHdoZXJlIHJldHVybiBkb2VzIG5vdGhpbmdcbiAgICBpbnB1dEtleURvd25IYW5kbGVyKGUpIHtcbiAgICAgICAgLy8gc3RpbGwgZG8gZXZlcnl0aGluZyBwcmV2aW91cyBoYW5kbGVyIGRvZXNcbiAgICAgICAgc3VwZXIuaW5wdXRLZXlEb3duSGFuZGxlcihlKTtcbiAgICAgICAgLy8gd2Ugd2lsbCBoYW5kbGUgcmV0dXJuIGRpZmZlcmVudGx5XG4gICAgICAgIGlmIChlLmtleUNvZGUgPT09IDEzKSB7XG4gICAgICAgICAgICB0aGlzLnR5cGluZ0RlbGF5RXhwaXJhdGlvbkhhbmRsZXIuY2FsbCh7fSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPVkVSUklERVxuICAgIC8vIFdlIGRvbid0IGF0IGFsbCB3YW50IHRvIGRvIHdoYXQgdGhlIGJhc2Ugd2lkZ2V0IGRvZXMgaGVyZSwgbm90IGFsbCBkYXRhIGlzIGxvY2FsXG4gICAgdHlwaW5nRGVsYXlFeHBpcmF0aW9uSGFuZGxlciA9ICgpOnZvaWQgPT4ge1xuICAgICAgICB2YXIgaW5wdXQ6SlF1ZXJ5ID0gJCh0aGlzLmVsZW1lbnQpO1xuICAgICAgICB2YXIgdiA9IGlucHV0LnZhbCgpO1xuICAgICAgICAvLyBpZ25vcmUgaWYgdGhlIGZvbGxvd2luZyBrZXlzIGFyZSBwcmVzc2VkOiBbZGVsXSBbc2hpZnRdIFtjYXBzbG9ja11cbiAgICAgICAgaWYgKHRoaXMubGFzdEtleVByZXNzQ29kZSA+IDggJiYgdGhpcy5sYXN0S2V5UHJlc3NDb2RlIDwgMzIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmICh2ID09PSB0aGlzLnByZXZpb3VzU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wcmV2aW91c1NlbGVjdGlvbiA9IHY7XG4gICAgICAgIGlucHV0LmFkZENsYXNzKCd3YWl0Jyk7XG4gICAgICAgIHRoaXMuX3NwZWMucXVlcnkodikucmVxdWVzdFBhZ2VPZkRhdGEoKHN1Y2Nlc3M6Ym9vbGVhbik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpbnB1dC5yZW1vdmVDbGFzcygnd2FpdCcpLnRvZ2dsZUNsYXNzKCdlcnJvcicsIHN1Y2Nlc3MpO1xuICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8vIEhlcmUncyBhbiBleGFtcGxlIG9mIGEgd29ya2luZyBEYXRhR3JpZE9wdGlvbldpZGdldC5cbi8vIFdoZW4gY2hlY2tlZCwgdGhpcyBoaWRlcyBhbGwgU3R1ZGllcyB0aGF0IGFyZSBub3Qgb3duZWQgYnkgdGhlIGN1cnJlbnQgdXNlci5cbmNsYXNzIERHT25seU15U3R1ZGllc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgX3NwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcztcblxuICAgIGNvbnN0cnVjdG9yKGdyaWQ6RGF0YUdyaWQsIHNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcykge1xuICAgICAgICBzdXBlcihncmlkLCBzcGVjKTtcbiAgICAgICAgdGhpcy5fc3BlYyA9IHNwZWM7XG4gICAgfVxuXG4gICAgZ2V0SURGcmFnbWVudCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnU2hvd015U3R1ZGllc0NCJztcbiAgICB9XG5cbiAgICBnZXRMYWJlbFRleHQoKTpzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ015IFN0dWRpZXMgT25seSc7XG4gICAgfVxuXG4gICAgb25XaWRnZXRDaGFuZ2UoZSk6dm9pZCB7XG4gICAgICAgIC8vIHVwZGF0ZSBzcGVjIHdpdGggZmlsdGVyIG9wdGlvbnNcbiAgICAgICAgdmFyIGZpbHRlciA9IHRoaXMuX3NwZWMuZmlsdGVyKCk7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAkLmV4dGVuZChmaWx0ZXIsIHsgJ3Nob3dNaW5lJzogMSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWx0ZXIuc2hvd01pbmU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fc3BlYy5maWx0ZXIoZmlsdGVyKS5yZXF1ZXN0UGFnZU9mRGF0YSgoc3VjY2Vzczpib29sZWFuKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnRyaWdnZXJEYXRhUmVzZXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG4vLyBIZXJlJ3MgYW5vdGhlciBleGFtcGxlIG9mIGEgd29ya2luZyBEYXRhR3JpZE9wdGlvbldpZGdldC5cbi8vIFdoZW4gdW5jaGVja2VkLCB0aGlzIGhpZGVzIHRoZSBzZXQgb2YgU3R1ZGllcyB0aGF0IGFyZSBtYXJrZWQgYXMgZGlzYWJsZWQuXG5jbGFzcyBER0Rpc2FibGVkU3R1ZGllc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIHByaXZhdGUgX3NwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcztcblxuICAgIGNvbnN0cnVjdG9yKGdyaWQ6RGF0YUdyaWQsIHNwZWM6RGF0YUdyaWRTcGVjU3R1ZGllcykge1xuICAgICAgICBzdXBlcihncmlkLCBzcGVjKTtcbiAgICAgICAgdGhpcy5fc3BlYyA9IHNwZWM7XG4gICAgfVxuXG4gICAgZ2V0SURGcmFnbWVudCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnU2hvd0RTdHVkaWVzQ0InO1xuICAgIH1cblxuICAgIGdldExhYmVsVGV4dCgpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnU2hvdyBEaXNhYmxlZCc7XG4gICAgfVxuXG4gICAgb25XaWRnZXRDaGFuZ2UoZSk6dm9pZCB7XG4gICAgICAgIC8vIHVwZGF0ZSBzcGVjIHdpdGggZmlsdGVyIG9wdGlvbnNcbiAgICAgICAgdmFyIGZpbHRlciA9IHRoaXMuX3NwZWMuZmlsdGVyKCk7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAkLmV4dGVuZChmaWx0ZXIsIHsgJ3Nob3dEaXNhYmxlZCc6IDEgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZWxldGUgZmlsdGVyLnNob3dEaXNhYmxlZDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zcGVjLmZpbHRlcihmaWx0ZXIpLnJlcXVlc3RQYWdlT2ZEYXRhKChzdWNjZXNzOmJvb2xlYW4pOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHJpZ2dlckRhdGFSZXNldCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblx0aW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6RGF0YUdyaWREYXRhUm93W10sIHJvd0lEOnN0cmluZyk6YW55IHtcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLl9zcGVjLmRhdGEoKTtcblx0XHRpZiAoZGF0YVtyb3dJRF0uZGlzKSB7XG5cdFx0XHRmb3IgKHZhciByID0gMDsgciA8IGRhdGFSb3dPYmplY3RzLmxlbmd0aDsgcisrKSB7XG5cdFx0XHRcdHZhciByb3dFbGVtZW50ID0gZGF0YVJvd09iamVjdHNbcl0uZ2V0RWxlbWVudCgpO1xuXHRcdFx0XHRyb3dFbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwiI0ZGQzBDMFwiO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyB1c2UgSlF1ZXJ5IHJlYWR5IGV2ZW50IHNob3J0Y3V0IHRvIGNhbGwgcHJlcGFyZUl0IHdoZW4gcGFnZSBpcyByZWFkeVxuJChJbmRleFBhZ2UucHJlcGFyZUl0KTtcbiJdfQ==