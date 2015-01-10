/// <reference path="EDDDataInterface.ts" />
/// <reference path="EditableElement.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="Utl.ts" />
/// <reference path="lib/jquery.d.ts" />


declare var EDDData:EDDData;

module IndexPage {

	var studiesDataGridSpec:DataGridSpecStudies = null;
	var studiesDataGrid:DataGrid = null;


	// Called when the page loads.
	export function prepareIt() {
		setTimeout( () => IndexPage.prepareTable(), 1 );
	}


	export function prepareTable() {
		// Instantiate a table specification for the Studies table
		this.studiesDataGridSpec = new DataGridSpecStudies();
		// Instantiate the table itself with the spec
		this.studiesDataGrid = new DataGrid(this.studiesDataGridSpec);
        this.studiesDataGridSpec.requestPageOfData((success) => {
            if (success) this.studiesDataGrid.triggerDataReset();
        });
	}


	// This creates an EditableElement object for each Study description that the user is allowed to edit.
	export function initDescriptionEditFields() {
		// Since we've already created the table, we can look into the spec and find the other objects created in the process.
		// Under the specification for the "description" column, we find all the DataGridDataCell objects that belong to that column.
		var descriptionCells = this.studiesDataGrid.getDataCellObjectsForColumnIndex(1);
        var data = this.studiesDataGridSpec.data();
        descriptionCells.forEach((cell) => {
            if (data[cell.recordID].write) {
                EditableElements.initializeElement({
                    'studyID': cell.recordID,
                    'element': cell.cellElement,
                    'type': 'text',
                    'editAllowed': () => { return true; },
                    'getValue': (self) => { return data[cell.recordID].des; },
                    'setValue': (self, value) => data[cell.recordID].des = value,
                    'makeFormData': (self, value) => {
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
};



// The spec object that will be passed to DataGrid to create the Studies table
class DataGridSpecStudies extends DataGridSpecBase implements DGPageDataSource {

    // spec object tracks what data should be displayed by the table
    private dataObj:{};
    private _size:number = 0;
    private _offset:number = 0;
    private _pageSize:number = 50;
    private _query:string = '';


	// Specification for the table as a whole
	defineTableSpec():DataGridTableSpec {
        return new DataGridTableSpec('studies', { 'name': 'Studies' });
	}

        
	// Specification for the headers along the top of the table
	defineHeaderSpec():DataGridHeaderSpec[] {
        // capture here, as the `this` variable below will point to global object, not this object
        var self:DataGridSpecStudies = this;
		return [
            new DataGridHeaderSpec(1, 'hStudyName', {
                'name': 'Study Name',
                'nowrap': true,
                'sortBy': (index:number):any => { return this.dataObj[index].n.toUpperCase(); },
                'sortAfter': 1 }),
            new DataGridHeaderSpec(2, 'hStudyDesc', {
                'name': 'Description',
                'sortBy': (index:number):any => { return this.dataObj[index].des.toUpperCase(); } }),
            new DataGridHeaderSpec(3, 'hStudyOwnerInitials', {
                'name': 'Owner',
                'sortBy': (index:number):any => { return this.dataObj[index].initials || '?'; },
                'sortAfter': 0 }),
            new DataGridHeaderSpec(4, 'hStudyOwnerFullName', {
                'name': 'Owner Full Name',
                'nowrap': true,
                'sortBy': (index:number):any => { return this.dataObj[index].ownerName.toUpperCase() || '?'; },
                'sortAfter': 0 }),
            new DataGridHeaderSpec(5, 'hStudyOwnerInstitute', {
                'name': 'Institute',
                'nowrap': true,
                'sortBy': (i) => '?',
                'sortAfter': 0 }),
            new DataGridHeaderSpec(6, 'hStudyCreated', {
                'name': 'Created',
                'sortBy': (index:number):any => { return this.dataObj[index].cr; },
                'sortAfter': 0 }),
            new DataGridHeaderSpec(7, 'hStudyMod', {
                'name': 'Last Modified',
                'sortBy': (index:number):any => { return this.dataObj[index].mod; },
                'sortAfter': 0 })
		];
	}
    
    
    generateStudyNameCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        var sideMenuItems = [];
        var match:ResultMatcher = gridSpec.dataObj[index].match;
        if (match) {
            sideMenuItems = match.getFields().map((field):string => {
                var matches = match.getMatches(field, '<span class="search_match">', '</span>', 10);
                return 'Matched on ' + field + ': ' + matches.join(', ');
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'hoverEffect': true,
                'nowrap': true,
                'sideMenuItems': sideMenuItems,
                'contentString': [ '<a href="Study.cgi?studyID=', index, '" class="darker">', gridSpec.dataObj[index].n, '</a>' ].join('')
            })
        ];
    }


    generateDescriptionCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'maxWidth': '400',
                'customID': (id) => { return 'editableDescriptionField' + id; },
                'contentString': gridSpec.dataObj[index].des || ''
            })
        ];
    }


    generateOwnerInitialsCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': gridSpec.dataObj[index].initials || '?'
            })
        ];
    }


    generateOwnerNameCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': gridSpec.dataObj[index].ownerName || '?'
            })
        ];
    }


    generateInstitutionCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': '?'
            })
        ];
    }


    generateCreatedCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': Utl.JS.utcToTodayString(gridSpec.dataObj[index].cr)
            })
        ];
    }


    generateModifiedCells(gridSpec:DataGridSpecStudies, index:number):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'contentString': Utl.JS.utcToTodayString(gridSpec.dataObj[index].mod)
            })
        ];
    }
	

	// Specification for each of the columns that will make up the body of the table
	defineColumnSpec():DataGridColumnSpec[] {
        // capture here, as the `this` variable below will point to global object, not this object
        var self:DataGridSpecStudies = this;
		return [
            new DataGridColumnSpec(1, this.generateStudyNameCells),
            new DataGridColumnSpec(2, this.generateDescriptionCells),
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
            new DataGridColumnGroupSpec('Date Created', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified')
		];
	}


	// The table element on the page that will be turned into the DataGrid.  Any preexisting table content will be removed.
	getTableElement() {
		return document.getElementById("studiesTable");
	}


	// An array of unique identifiers, used to identify the records in the data set being displayed
	getRecordIDs() {
        if (this.dataObj) {
            var ids = Object.getOwnPropertyNames(this.dataObj);
            return ids.map((id):number => {
                return parseInt(id, 10);
            });
        }
        return [];
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
    
    
    pageDelta(delta:number):DGPageDataSource {
        this._offset += (delta * this._pageSize);
        return this;
    }
    
    
    requestPageOfData(callback?:(success:boolean) => void):DGPageDataSource {
        $.ajax({
            'url': '/study/search/',
            'type': 'GET',
            'data': { 'q': this._query, 'i': this._offset, 'size': this._pageSize },
            'error': (xhr, status, e) => {
                console.log(['Search failed: ', status, ';', e].join(''));
                callback && callback.call({}, false);
             },
            'success': (data) => {
                this.data(this._transformData(data), data.numFound, data.start);
                callback && callback.call({}, true);
            }
        });
        return this;
    }


	// This is called to generate the array of custom header widgets.
	// The order of the array will be the order they are added to the header bar.
	// It's perfectly fine to return an empty array.
	createCustomHeaderWidgets(dataGrid:DataGrid):DataGridHeaderWidget[] {
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
		// Wire-in our custom edit fields for the Studies page
		IndexPage.initDescriptionEditFields();
	}
    
    data():any;
    data(replacement:any, totalSize?:number, totalOffset?:number):DataGridSpecStudies;
    data(replacement?:any, totalSize?:number, totalOffset?:number):any {
        if (replacement === undefined) {
            return this.dataObj;
        } else {
            this.dataObj = replacement;
            this._size = totalSize || this.viewSize();
            this._offset = totalOffset || 0;
        }
        return this;
    }
    
    
    private _transformData(data:any):{} {
        var docs:any[] = data.docs;
        var transformed = {};
        docs.forEach((doc) => {
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
        var lower:string = source.toLocaleLowerCase();
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
    
    private _grid:DataGrid;
    private _spec:DataGridSpecStudies;

	searchDisclosureElement:HTMLElement;


	constructor(dataGridOwnerObject:DataGrid, dataGridSpec:DataGridSpecStudies, placeHolder:string, size:number, getsFocus:boolean) {
		super(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
        this._grid = dataGridOwnerObject;
        this._spec = dataGridSpec;
	}


	// This is called to append the widget elements beneath the given element.
	// If the elements have not been created yet, they are created, and the uniqueID is passed along.
	appendElements(container:HTMLElement, uniqueID:string):void {
		super.appendElements(container, uniqueID);
        var span:HTMLSpanElement = document.createElement("span");
        var spanID:string = this.dataGridSpec.tableSpec.id+'SearchDisc'+uniqueID;
        span.setAttribute('id', spanID);
        span.className = 'searchDisclosure';
        this.searchDisclosureElement = span;
		container.appendChild(this.searchDisclosureElement);
	}
    
    
    // OVERRIDE
    // HEY GUYS WE DON'T NEED TO FILTER HERE ANYMORE
    applyFilterToIDs(rowIDs:number[]):number[] {
        return rowIDs;
    }
    
    
    // OVERRIDE
    // We want to work slightly differently from base widget, where return does nothing
    inputKeyDownHandler(e) {
        // still do everything previous handler does
        super.inputKeyDownHandler(e);
        // we will handle return differently
        if (e.keyCode === 13) {
            // TODO build URL for search and reload page
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
                this._grid.triggerDataReset();
            }
        });
    }
}



// Here's an example of a working DataGridOptionWidget.
// When checked, this hides all Studies that are not owned by the current user.
class DGOnlyMyStudiesWidget extends DataGridOptionWidget {
    
    private _spec:DataGridSpecStudies;
    
    constructor(grid:DataGrid, spec:DataGridSpecStudies) {
        super(grid, spec);
        this._spec = spec;
    }

	createElements(uniqueID:any):void {

		var cbID:string = this.dataGridSpec.tableSpec.id+'ShowMyStudiesCB'+uniqueID;
		var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
		$(cb).click( (e) => this.dataGridOwnerObject.clickedOptionWidget(e) );
		if (this.isEnabledByDefault()) {
			cb.setAttribute('checked', 'checked');
		}
		this.checkBoxElement = cb;
		this.labelElement = this._createLabel('My Studies Only', cbID);
		this._createdElements = true;
	}


	applyFilterToIDs(rowIDs:any):any {

		var checked:boolean = false;
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
	}


	initialFormatRowElementsForID(dataRowObjects:DataGridDataRow[], rowID:number):void {
        var data = this._spec.data();
		if (data[rowID].dis) {
			for (var r = 0; r < dataRowObjects.length; r++) {
				var rowElement = dataRowObjects[r].getElement();
				rowElement.style.backgroundColor = "#FFC0C0";
			}
		}
	}
}



// Here's another example of a working DataGridOptionWidget.
// When unchecked, this hides the set of Studies that are marked as disabled.
class DGDisabledStudiesWidget extends DataGridOptionWidget {
    
    private _spec:DataGridSpecStudies;
    
    constructor(grid:DataGrid, spec:DataGridSpecStudies) {
        super(grid, spec);
        this._spec = spec;
    }

	createElements(uniqueID:any):void {
		var cbID:string = this.dataGridSpec.tableSpec.id+'ShowDStudiesCB'+uniqueID;
		var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
		$(cb).click( (e) => this.dataGridOwnerObject.clickedOptionWidget(e) );
		if (this.isEnabledByDefault()) {
			cb.setAttribute('checked', 'checked');
		}
		this.checkBoxElement = cb;
		this.labelElement = this._createLabel('Show Disabled', cbID);
		this._createdElements = true;
	}


	applyFilterToIDs(rowIDs:number[]):number[] {

		var checked:boolean = false;
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
	}


	initialFormatRowElementsForID(dataRowObjects:DataGridDataRow[], rowID:number):any {
        var data = this._spec.data();
		if (data[rowID].dis) {
			for (var r = 0; r < dataRowObjects.length; r++) {
				var rowElement = dataRowObjects[r].getElement();
				rowElement.style.backgroundColor = "#FFC0C0";
			}
		}
	}
}



window.addEventListener('load', function() { IndexPage.prepareIt(); }, false);
