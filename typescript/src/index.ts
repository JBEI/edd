import { EDDAuto } from "../modules/EDDAutocomplete"
import {DataGrid, DataGridSpecBase, DataGridDataCell, DGPageDataSource, DataGridColumnSpec,
        DataGridTableSpec, DataGridHeaderWidget, DataGridColumnGroupSpec, DataGridSort,
        DataGridHeaderSpec, DGPagingWidget, DataGridOptionWidget, DGSearchWidget,
        DataGridDataRow } from "../modules/DataGrid"
import { Utl } from "../modules/Utl"
import "bootstrap-loader"


declare function require(name: string): any;  // avoiding warnings for require calls below

// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/button.css');
require('jquery-ui/themes/base/draggable.css');
require('jquery-ui/themes/base/resizable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/button');
require('jquery-ui/ui/widgets/draggable');
require('jquery-ui/ui/widgets/resizable');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/tooltip');


module IndexPage {

	// Called when the page loads.
	export function prepareIt() {


        EDDAuto.BaseAuto.initPreexisting();
        // this makes the autocomplete work like a dropdown box
        // fires off a search as soon as the element gains focus
        $(document).on('focus', '.autocomp', function (ev) {
            $(ev.target).addClass('autocomp_search').mcautocomplete('search');
        });

        $('.disclose').find('.discloseLink').on('click', disclose);

        $("#addStudyModal").dialog({ minWidth: 600, autoOpen: false});

        $("#addStudyButton").click(function() {
            $("#addStudyModal").removeClass('off').dialog( "open" );
            return false;
        });

        IndexPage.prepareTable();
	}

    export function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }

	export function prepareTable() {
		// Instantiate a table specification for the Studies table
		this.studiesDataGridSpec = new DataGridSpecStudies();
        this.studiesDataGridSpec.init();

        //prepare tooltip for matched searches
        $(this.studiesDataGridSpec.tableElement).tooltip({
            content: function () {
                return $(this).find('.popupmenu').clone(true).removeClass('off');
            },
            items: '.has-popupmenu',
            hide: false,  // no animations
            show: false,  // no animations
            track: true
        });

		// Instantiate the table itself with the spec
		this.studiesDataGrid = new DataGrid(this.studiesDataGridSpec);
        this.studiesDataGridSpec.requestPageOfData((success) => {
            if (success) this.studiesDataGrid.triggerDataReset();
        });
	}
}

// The spec object that will be passed to DataGrid to create the Studies table
class DataGridSpecStudies extends DataGridSpecBase implements DGPageDataSource {

    // spec object tracks what data should be displayed by the table
    private dataObj:{};
    private recordIds:string[] = [];
    private _size:number = 0;
    private _offset:number = 0;
    private _pageSize:number = 50;
    private _query:string = '';
    private _searchOpt = {};
    descriptionCol:DataGridColumnSpec;

	// Specification for the table as a whole
	defineTableSpec():DataGridTableSpec {
        return new DataGridTableSpec('studies', { 'name': 'Studies' });
	}

	// Specification for the headers along the top of the table
	defineHeaderSpec():DataGridHeaderSpec[] {
        // capture here, as the `this` variable below will point to global object, not this object
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
	}

    generateStudyNameCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        var studyDoc = gridSpec.dataObj[index];
        var sideMenuItems = [];
        var match:ResultMatcher = studyDoc.match;
        if (match) {
            sideMenuItems = match.getFields().map((field):string => {
                var matches = match.getMatches(field, '<span class="search_match">', '</span>', 10);
                return 'Matched on ' + field + ': ' + matches.join(', ') + " ";
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'hoverEffect': true,
                'nowrap': true,
                'sideMenuItems': sideMenuItems,
                'contentString': [ '<a href="', studyDoc.url, '" class="darker">', studyDoc.n, '</a>' ].join(''),
                'title': studyDoc.n
            })
        ];
    }

    generateDescriptionCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'maxWidth': '400',
                'customID': (id) => { return 'editableDescriptionField' + id; },
                'contentString': gridSpec.dataObj[index].des || '',
                'title': gridSpec.dataObj[index].des || '',
            })
        ];
    }

    generateOwnerInitialsCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': gridSpec.dataObj[index].initials || '?'
            })
        ];
    }

    generateOwnerNameCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': gridSpec.dataObj[index].ownerName || '?'
            })
        ];
    }

    generateInstitutionCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': '?'
            })
        ];
    }

    generateCreatedCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': Utl.JS.utcToTodayString(gridSpec.dataObj[index].cr)
            })
        ];
    }

    generateModifiedCells(gridSpec:DataGridSpecStudies, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': Utl.JS.utcToTodayString(gridSpec.dataObj[index].mod)
            })
        ];
    }

	// Specification for each of the columns that will make up the body of the table
	defineColumnSpec():DataGridColumnSpec[] {
        // capture here, as the `this` variable below will point to global object, not this object
		return [
            new DataGridColumnSpec(1, this.generateStudyNameCells),
            this.descriptionCol = new DataGridColumnSpec(2, this.generateDescriptionCells),
            new DataGridColumnSpec(3, this.generateOwnerInitialsCells),
            new DataGridColumnSpec(4, this.generateOwnerNameCells),
            new DataGridColumnSpec(5, this.generateInstitutionCells),
            new DataGridColumnSpec(6, this.generateCreatedCells),
            new DataGridColumnSpec(7, this.generateModifiedCells)
		];
	}

	// Specification for each of the groups that the headers and data columns are organized into
	defineColumnGroupSpec():DataGridColumnGroupSpec[] {
		return [
            new DataGridColumnGroupSpec('Study Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Description'),
            new DataGridColumnGroupSpec('Owner Initials'),
            new DataGridColumnGroupSpec('Owner Full Name', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Institute', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Date Created'),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
		];
	}

	// The table element on the page that will be turned into the DataGrid.  Any preexisting table content will be removed.
	getTableElement() {
		return document.getElementById("studiesTable");
	}

	// An array of unique identifiers, used to identify the records in the data set being displayed
	getRecordIDs() {
        return this.recordIds;
	}

    enableSort(grid:DataGrid):DataGridSpecStudies {
        super.enableSort(grid);
        this.tableHeaderSpec.forEach((header) => {
            if (header.sortId) {
                // remove any events from super in favor of our own
                $(header.element).off('click.datatable').on('click.datatable', (ev) => {
                    this.columnSort(grid, header, ev);
                });
            }
        });
        return this;
    }

    private columnSort(grid:DataGrid, header:DataGridHeaderSpec, ev):any {
        var sort = grid.sortCols(), oldSort, newSort, sortOpt;
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
            newSort = sort.filter((v) => { return v.spec.sortId === header.sortId; });
            oldSort = sort.filter((v) => { return v.spec.sortId !== header.sortId; });
            // if column already sorted, flip asc; move column to front of sort list
            if (newSort.length) {
                newSort[0].asc = !newSort[0].asc;
                (sort = oldSort).unshift(newSort[0]);
            } else {
                sort.unshift({ spec: header, asc: true });
            }
        } else if (sort.length === 1 && sort[0].spec.sortId === header.sortId) {
            sort[0].asc = !sort[0].asc;
        } else {
            sort = [ { spec: header, asc: true } ];
        }
        grid.sortCols(sort);
        // convert to sort strings, filter out falsy values, join with commas
        sortOpt = sort.map((col:DataGridSort) => {
            if (col.spec.sortId) return col.spec.sortId + (col.asc ? ' asc' : ' desc');
        }).filter(Boolean).join(',');
        // store in options object, as grid will not be available in requestPageOfData
        $.extend(this._searchOpt, { 'sort': sortOpt });
        this.requestPageOfData((success) => {
            if (success) grid.triggerDataReset();
        });
    }

    pageSize():number;
    pageSize(size:number):DGPageDataSource;
    pageSize(size?:number):any {
        if (size === undefined) {
            return this._pageSize;
        } else {
            this._pageSize = size;
            return this;
        }
    }

    totalOffset():number;
    totalOffset(offset:number):DGPageDataSource;
    totalOffset(offset?:number):any {
        if (offset === undefined) {
            return this._offset;
        } else {
            this._offset = offset;
            return this;
        }
    }

    totalSize():number;
    totalSize(size:number):DGPageDataSource;
    totalSize(size?:number):any {
        if (size === undefined) {
            return this._size;
        } else {
            this._size = size;
            return this;
        }
    }

    viewSize():number {
        return this.getRecordIDs().length;
    }

    query():string;
    query(query:string):DGPageDataSource;
    query(query?:string):any {
        if (query === undefined) {
            return this._query;
        } else {
            this._query = query;
            this._offset = 0; // reset offset when query changes
            return this;
        }
    }

    filter():any;
    filter(opt:any):DGPageDataSource;
    filter(opt?:any):any {
        if (opt === undefined) {
            return this._searchOpt;
        } else {
            this._searchOpt = opt;
            return this;
        }
    }

    pageDelta(delta:number):DGPageDataSource {
        this._offset += (delta * this._pageSize);
        return this;
    }

    requestPageOfData(callback?:(success:boolean) => void):DGPageDataSource {
        $.ajax({
            'url': '/study/study-search/',
            'type': 'GET',
            'data': $.extend({}, this._searchOpt, {
                'q': this._query,
                'i': this._offset,
                'size': this._pageSize
            }),
            'error': (xhr, status, e) => {
                console.log(['Search failed: ', status, ';', e].join(''));
                callback && callback.call({}, false);
             },
            'success': (data) => {
                this.data(data.docs, data.numFound, data.start);
                callback && callback.call({}, true);
            }
        });
        return this;
    }

	// This is called to generate the array of custom header widgets.
	// The order of the array will be the order they are added to the header bar.
	// It's perfectly fine to return an empty array.
	createCustomHeaderWidgets(dataGrid:DataGrid):DataGridHeaderWidget[] {
        // override bootsrap
        $('#hStudyMod').css('border-right', '1px solid lightgrey')
        // Create a single widget for showing disabled Studies
        var array:DataGridHeaderWidget[] = [
            new DGStudiesSearchWidget(dataGrid, this, 'Search Studies', 40, true),
            new DGPagingWidget(dataGrid, this, this)
        ];
        return array;
	}

	// This is called to generate the array of custom options menu widgets.
	// The order of the array will be the order they are displayed in the menu.
	// It's perfectly fine to return an empty array.
	createCustomOptionsWidgets(dataGrid:DataGrid):DataGridOptionWidget[] {
		var widgetSet:DataGridOptionWidget[] = [];

		// Create a single widget for showing only the Studies that belong to the current user
		var onlyMyStudiesWidget = new DGOnlyMyStudiesWidget(dataGrid, this);
		widgetSet.push(onlyMyStudiesWidget);
		// Create a single widget for showing disabled Studies
		var disabledStudiesWidget = new DGDisabledStudiesWidget(dataGrid, this);
		widgetSet.push(disabledStudiesWidget);
		return widgetSet;
	}

	// This is called after everything is initialized, including the creation of the table content.
	onInitialized(dataGrid:DataGrid):void {
	}

    data():any;
    data(replacement:any[], totalSize?:number, totalOffset?:number):DataGridSpecStudies;
    data(replacement?:any[], totalSize?:number, totalOffset?:number):any {
        if (replacement === undefined) {
            return this.dataObj;
        } else {
            this.dataObj = this._transformData(replacement); // transform also handles storing sort keys
            this._size = totalSize || this.viewSize();
        }
        return this;
    }

    private _transformData(docs:any[]):any {
        var transformed = {};
        this.recordIds = docs.map((doc):string => {
            var match = new ResultMatcher(this._query);
            // straightforward matching on name, description, contact, creator_name, initials
            match.findAndSet('name', doc.name)
                .findAndSet('description', doc.description)
                .findAndSet('contact', doc.contact)
                .findAndSet('creator', doc.creator_name)
                .findAndSet('initials', doc.initials);
            // strip the "ID@" portion before matching on metabolite, protocol, part
            (doc.metabolite || []).forEach((metabolite:string) => {
                match.findAndSet('metabolite', metabolite.slice(metabolite.indexOf('@') + 1));
            });
            (doc.protocol || []).forEach((protocol:string) => {
                match.findAndSet('protocol', protocol.slice(protocol.indexOf('@') + 1));
            });
            (doc.part || []).forEach((part:string) => {
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
    }
}

// data structure marks a region of interest in a string passed through ResultMatcher
interface TextRegion {
    begin:number;
    end:number;
    source:string;
}
// initialized with a query string, can search study fields for matches to query terms
class ResultMatcher {

    private _query:string[];
    private _match:{[index:string]:TextRegion[]};

    constructor(query:string) {
        this._query = query.split(/\s+/).filter((x) => x.length > 0);
        this._match = {};
    }

    // searches for constructor text query in the source string, saving to field name if found
    findAndSet(field:string, source:string):ResultMatcher {
        var index:number;
        var lower:string = (source || '').toLocaleLowerCase();
        this._query.forEach((q) => {
            if ((index = lower.indexOf(q.toLocaleLowerCase())) >= 0) {
                (this._match[field] = this._match[field] || []).push({
                    begin: index,
                    end: index + q.length,
                    source: source
                });
            }
        });
        return this;
    }

    getFields():string[] {
        return Object.getOwnPropertyNames(this._match);
    }

    // returns array of strings marked as matching the constructor text query
    getMatches(field:string, prefix?:string, postfix?:string, slop?:number):string[] {
        slop = slop === undefined ? Number.MAX_VALUE : slop;
        return (this._match[field] || []).map((text:TextRegion):string => {
            var length = text.source.length,
                start = Math.max(0, text.begin - slop),
                finish = Math.min(text.end + slop, length),
                parts = [
                    text.source.slice(start, text.begin),
                    prefix || '',
                    text.source.slice(text.begin, text.end),
                    postfix || '',
                    text.source.slice(text.end, finish)
                ];
            if (start > 0) parts.unshift('…');
            if (finish < length) parts.push('…');
            return parts.join('');
        });
    }
}

// This is a DataGridHeaderWidget derived from DGSearchWidget.
// It's a search field that offers options for additional data types, querying the server for results.
class DGStudiesSearchWidget extends DGSearchWidget {

    private _spec:any;

	searchDisclosureElement:HTMLElement;

	constructor(grid:DataGrid, spec:DataGridSpecStudies, placeHolder:string, size:number, getsFocus:boolean) {
		super(grid, spec, placeHolder, size, getsFocus);
        this._spec = spec;
	}

    // OVERRIDE
    // HEY GUYS WE DON'T NEED TO FILTER HERE ANYMORE
    applyFilterToIDs(rowIDs:string[]):string[] {
        return rowIDs;
    }

    // OVERRIDE
    // We want to work slightly differently from base widget, where return does nothing
    inputKeyDownHandler(e) {
        // still do everything previous handler does
        super.inputKeyDownHandler(e);
        // we will handle return differently
        if (e.keyCode === 13) {
            this.typingDelayExpirationHandler.call({});
        }
    }

    // OVERRIDE
    // We don't at all want to do what the base widget does here, not all data is local
    typingDelayExpirationHandler = ():void => {
        var input:JQuery = $(this.element);
        var v = input.val();
        // ignore if the following keys are pressed: [del] [shift] [capslock]
        if (this.lastKeyPressCode > 8 && this.lastKeyPressCode < 32) {
            return;
        } else if (v === this.previousSelection) {
            return;
        }
        this.previousSelection = v;
        input.addClass('wait');
        this._spec.query(v).requestPageOfData((success:boolean):void => {
            input.removeClass('wait').toggleClass('error', success);
            if (success) {
                this.dataGridOwnerObject.triggerDataReset();
            }
        });
    }
}

// When checked, this hides all Studies that are not owned by the current user.
class DGOnlyMyStudiesWidget extends DataGridOptionWidget {

    private _spec:DataGridSpecStudies;

    constructor(grid:DataGrid, spec:DataGridSpecStudies) {
        super(grid, spec);
        this._spec = spec;
    }

    getIDFragment(uniqueID):string {
        return 'ShowMyStudiesCB';
    }

    getLabelText():string {
        return 'My Studies Only';
    }

    onWidgetChange(e):void {
        // update spec with filter options
        var filter = this._spec.filter();
        if (this.checkBoxElement.checked) {
            $.extend(filter, { 'showMine': 1 });
        } else {
            delete filter.showMine;
        }
        this._spec.filter(filter).requestPageOfData((success:boolean):void => {
            if (success) {
                this.dataGridOwnerObject.triggerDataReset();
            }
        });
    }
}

// When unchecked, this hides the set of Studies that are marked as disabled.
class DGDisabledStudiesWidget extends DataGridOptionWidget {

    private _spec:DataGridSpecStudies;

    constructor(grid:DataGrid, spec:DataGridSpecStudies) {
        super(grid, spec);
        this._spec = spec;
    }

    getIDFragment(uniqueID):string {
        return 'ShowDStudiesCB';
    }

    getLabelText():string {
        return 'Show Disabled';
    }

    onWidgetChange(e):void {
        // update spec with filter options
        var filter = this._spec.filter();
        if (this.checkBoxElement.checked) {
            $.extend(filter, { 'showDisabled': 1 });
        } else {
            delete filter.showDisabled;
        }
        this._spec.filter(filter).requestPageOfData((success:boolean):void => {
            if (success) {
                this.dataGridOwnerObject.triggerDataReset();
            }
        });
    }

	initialFormatRowElementsForID(dataRowObjects:DataGridDataRow[], rowID:string):any {
        var data = this._spec.data();
		if (data[rowID].dis) {
			for (var r = 0; r < dataRowObjects.length; r++) {
				var rowElement = dataRowObjects[r].getElement();
				$(rowElement).addClass('disabledRecord');
			}
		}
	}
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(IndexPage.prepareIt);
