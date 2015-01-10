/// <reference path="EDDDataInterface.ts" />


module EDDAutoComplete {
    
    interface QueryCacheData<T> { [index:string]:T[]; }
    export class QueryCacheManager<T> {

		static cacheMaxLength = 2048;

		private emptyQuery:T[];
		private data:QueryCacheData<T>;
		private length:number;

		
		constructor() {
			this.flushCache();
		}


		// Flush a segment of the query cache
		flushCache() {
			this.emptyQuery = null;
			this.data = {};
			this.length = 0;
		}
        
        
        // Just the query returns cached data; query with data caches data keyed by query
        cache(query:string):T[];
        cache(query:string, data:T[]):QueryCacheManager<T>;
        cache(query:string, data?:T[]):any {
            if (!query) {
                if (data === undefined) {
                    return this.emptyQuery;
                } else {
                    this.emptyQuery = data;
                    return this;
                }
            } else if (data === undefined) {
                return this.data[query];
            } else {
                if (this.length > QueryCacheManager.cacheMaxLength) {
                    this.flushCache();
                }
                if (this.data[query] === undefined) {
                    ++this.length;
                }
                this.data[query] = data;
                return this;
            }
        }
	}
    
    
    
    // This class will insert a hide-able error message before a specified HTMLElement
    class ErrorDisplay {
        private _element:any;       // either an HTMLElement or JQuery
        private _message:string;
        
        private _errorDiv:JQuery;
        
        constructor(element:any, message:string) {
            this._element = element;
            this._message = message;
            this._display();
        }
        
        private _display() {
            this._errorDiv = $(document.createElement("div")).insertBefore(this._element)
                .html(this._message).addClass('errorMessage');
            $(document.createElement("a")).prependTo(this._errorDiv).text('x').addClass('close')
                .click((e) => { this._remove(); return false; });
        }
        
        private _remove() {
            this._errorDiv.fadeOut(() => this._errorDiv.remove());
        }
    }
    
    
    
    class Search {
        private tokens:string[];
        
        constructor(tokens:string[]) {
            this.tokens = tokens;
        }
        
        
        search(segments:SearchSegment[]):SearchResult {
            var results:SearchResult = new SearchResult();
            var termMatch:boolean[] = [];
            
            // If either item is null/empty, return empty unmatched results.
            if (!segments || !this.tokens || segments.length == 0 || this.tokens.length == 0) {
                return results;
            }

            segments.forEach((segment, i) => {
                var subsearch:{ matched:number[]; formatted:string; };
                if (!segment.source || segment.source.length === 0) {
                    results.segmentStrings[i] = '';
                    return;
                }
                subsearch = segment.search(this.tokens);
                subsearch.matched.forEach((v) => termMatch[v] = true);
                results.segmentStrings[i] = subsearch.formatted;
            });
            // If even one of the queries did not find a hit, we declare the whole thing unmatched.
            results.matched = termMatch.length > 0 && termMatch.every((v) => { return v; });
            return results;
        }
    }
    
    
    
    class SearchSegment {
        source:string;
        caseSensitive:boolean;
        noSubstring:boolean;
        
        
        constructor(segment:string) {
            this.source = segment;
            this.caseSensitive = false;
            this.noSubstring = false;
        }
        
        
        // convenience method to create lists of SearchSegments
        static create(...segments:string[]) {
            return (segments || []).map((segment) => { return new SearchSegment(segment); });
        }
        
        
        search(tokens:string[]):{ matched:number[]; formatted:string; } {
            // If we're going case-independent, convert the string
            var ss = this.caseSensitive ? this.source : this.source.toLowerCase();
            var regions:number[][] = [];
            var queriesMatched = [];
            var results = {
                formatted: this.source,     // Default values: no match
                matched: [] 
            };

            tokens.every((token, i) => {
                var match;
                if (this.noSubstring && i > 0) return false;  // break out
                if ((token = token.trim()).length === 0) return false;
                match = ss.indexOf(this.caseSensitive ? token : token.toLowerCase());
                if (match >= 0) {
                    regions.push([match, match + token.length]);
                    results.matched.push(i);
                }
                return true;
            });
            if (regions.length == 0) return results;

            // Most of the rest of this code is concerned with formatting the string being returned
            // (specifically, highlighting the matched segments)
            
            // This double-loop merges together overlapping regions, filtering de-duped regions
            // sort by first index; walk the regions merging overlaps to earliest region; filter out merged regions
            regions = regions.sort((a,b) => { return a[0] - b[0]; }).map((a, i) => {
                return regions.slice(i + 1).reduce((max, b) => {
                    if (b[2]) return max; // this region has already been merged
                    if (b[0] <= max[0] && max[0] <= b[1]) { // merge from front
                        b[2] = 1; return [ b[0], Math.max(max[1], b[1]) ];
                    }
                    if (b[0] <= max[1] && max[1] <= b[1]) { // merge from end
                        b[2] = 1; return [ Math.min(b[0], max[0]), b[1] ];
                    }
                    if (max[0] <= b[0] && b[1] <= max[1]) { // region contained entirely
                        b[2] = 1;
                    }
                    return max;
                }, regions[i]);
            }).filter((v) => { return v.length === 2; });

            // Splice together the un-highlighted sections with the highlighted ones,
            // by tracking from left to right in the array
            var last:number = 0;
            var fragments:string[];
            fragments = regions.map((v:number[]):string => {
                var f = [ this.source.substring(last, v[0]), "<b>", this.source.substring(v[0], v[1]), "</b>" ];
                last = v[1];
                return f.join('');
            });
            fragments.push(this.source.substring(last));
            results.formatted = fragments.join('');
            return results;
        }
    }
    
    
    
    class SearchResult {
        matched:boolean = false;
        matchedAllTerms:boolean = false;
        segmentStrings:string[] = [];
    }



    export interface InputFieldValue {
        id:string;      // for most things this will be a number, but use string
        selectValue:string;
        cols:string[];
        meta:string;    // metadata to send to the server in lieu of an ID
    }
	export class InputFieldTemplate<T extends InputFieldValue> {

		static inputFieldUniqueIDCounter:number = 1;

		private onItemSelect: (self?:InputFieldTemplate<T>)=>void;

		selectFirst: boolean;
		selectOnly: boolean;
		mustMatch: boolean;
		delay: number;
		width: number;
		maxItemsToShow: number;
		minCharsToTriggerSearch: number;
		
		inputFieldUniqueID: number;

		private matchCase: boolean;
		private autoFillFirstWhileTyping: boolean;

		private loadingClass: string;
		private resultsClass: string;
		private resultsContentClass: string;
		private resultsTableClass: string;
		
		inputElementForID: HTMLInputElement;
		inputElement: HTMLInputElement;
		inputElementJQ;
		resultsElement: HTMLElement;
		resultsElementJQ;
		hasFocus: boolean;
		private resultsContentElement: HTMLElement;
		private resultsContentElementJQ;

		private latestSelection: string;
		private previousSelection: string;
		private activeRowIndex: number;
		private clickedInSinceLastDefocus: boolean;
		private mouseOverResults: boolean;

		private lastKeyPressCode;
		private typingTimeout;
		private defocusTimeout;

	
		constructor(inputElement: HTMLInputElement) {	// Can't use HTMLInputElement because we set custom properties - need to declare subclass?

			this.inputElement = inputElement;
			this.onItemSelect = inputElement['callAfterAutoChange'];  // custom properties accessed via index notation

			InputFieldTemplate.inputFieldUniqueIDCounter++;			
			this.inputFieldUniqueID = InputFieldTemplate.inputFieldUniqueIDCounter;

			this.configure();

			// If there is an alternate hidden element for storing the record ID, take note of it.
			var idStore = inputElement.getAttribute("autocompletevalue");
			if (idStore) {
				// This type has a '.value' property unlike HTMLElement
				var idStoreItem = <HTMLInputElement>document.getElementById(idStore);
				if (idStoreItem) {
					this.inputElementForID = idStoreItem;
				}
			}

			// Create jQuery object for input element
			this.inputElementJQ = $(inputElement);

			// Create results element
			this.resultsElement = document.createElement("div");
			// Create jQuery object for results
			this.resultsElementJQ = $(this.resultsElement);
			this.resultsElementJQ.addClass(this.resultsClass);
			if ( this.width > 0 ) {
				this.resultsElementJQ.css("width", this.width);
			}
			this.resultsElementJQ.hide();

			// Add to body element
			$("body").append(this.resultsElement);

			// Create results content section
			this.resultsContentElement = document.createElement("div");
			this.resultsContentElementJQ = $(this.resultsContentElement).addClass(this.resultsContentClass);
			this.resultsElement.appendChild(this.resultsContentElement);

            // custom properties accessed via index notation
			inputElement['autocompleter'] = this;
			inputElement['inputFieldUniqueID'] = this.inputFieldUniqueID;

			this.typingTimeout = null;
			this.defocusTimeout = null;
			this.previousSelection = "";
			this.latestSelection = "";
			this.activeRowIndex = -1;
			this.hasFocus = false;
			this.clickedInSinceLastDefocus = false;
			this.mouseOverResults = false;
			this.lastKeyPressCode = null;

			this.inputElementJQ.keydown(this.inputKeyDownHandler)
                .click(this.inputClickHandler)
                .focus(this.inputFocusHandler)
                .focusout(this.inputFocusOutHandler);

			this.resultsElementJQ.hover(this.resultsHoverOverHandler, this.resultsHoverOutHandler)			
                .click(this.resultsClickHandler);			

			$("body").mousedown(this.bodyMouseDownHandler);

			this.defocusNow();
		}


		configure() {
			// Set default values for required options
			this.resultsClass = "dropDownFrame";
			this.resultsContentClass = "dropDownContent";
			this.resultsTableClass = "autocompleteResults";
			this.minCharsToTriggerSearch = 0;
			this.matchCase = false;	// Probably not working properly anyway
			this.loadingClass = "wait";
			this.autoFillFirstWhileTyping = false;
		}


		// (Note: This syntax causes "this" to behave in a non-Javascript way
		// see http://stackoverflow.com/questions/16157839/typescript-this-inside-a-class-method )
		inputKeyDownHandler=(e)=>{
			// track last key pressed
			this.lastKeyPressCode = e.keyCode;
			switch (e.keyCode) {
				case 38: // up
					e.preventDefault();
					this.moveSelect(-1);
					break;
				case 40: // down
					e.preventDefault();
					this.moveSelect(1);
					break;
				case 9:  // tab
					this.selectCurrent();
					break;
				case 13: // return
					if ( this.selectCurrent() ) {
						// make sure to blur off the current field
						this.inputElement.blur();
					}
					e.preventDefault();
					break;
				default:
					this.activeRowIndex = -1;
					if (this.typingTimeout) {
						clearTimeout(this.typingTimeout);
					}
					this.typingTimeout = setTimeout(this.typingDelayExpirationHandler, this.delay);
					break;
			}
		}


		// Track whether the field has focus.  We shouldn't process any results if the field no longer has focus.
		// Note that functions declared using the "preserve .this" syntax, i.e. "f=()=>{}",
		// do not properly subclass.  In other words, inputFocusHandler is immutable even though it is
		// neither static nor private.
		inputFocusHandler=()=>{
			this.hasFocus = true;
			if (!this.minCharsToTriggerSearch) {	// Drop the menu on focus if we have no minimum match
				this.requestData('');
			}
		}


		inputClickHandler=()=>{
			// If we're clicking into an input element that doesn't have focus, select the current text
			if (this.clickedInSinceLastDefocus == false) {
				this.inputElement.setSelectionRange(0, this.inputElement.value.length);
			}
			this.clickedInSinceLastDefocus = true;
		}


		// Track whether the field has focus
		inputFocusOutHandler=(e)=>{
			this.hasFocus = false;
			this.clickedInSinceLastDefocus = false;
			if (this.mouseOverResults == false) {
				this.defocusNow();
			}
		}


		resultsHoverOverHandler=()=>{
			this.mouseOverResults = true;
		}


		resultsHoverOutHandler=()=>{
			this.mouseOverResults = false;
		}


		// If the user clicks on the results area, but not on an actual row,
		// fire a focus event to change focus to the associated input field.
		resultsClickHandler=()=>{
			this.inputElement.focus();
		}


		// You'd think we could just use an on-defocus listener on the input element to hide the result set,
		// but there are a few valid situations where the input element can become defocused where we want
		// to either keep the results set open despite future clicks, or close it depending on where the
		// click event occurs.
		//    We want a selection in the results area to only take effect on a complete click,
		// mirroring the way pulldown menus work, but we also want to defocus on mousedown, just like every other
		// regular input element in the browser works.  To deal with this, we hide the results during defocus,
		// but only if the mouse is not in the results area, and if a tab-out occurs (which causes a defocus),
		// we force a selection that hides the results no matter where the mouse is.
		//    If the user is using an "add new" form, the input field will have already lost focus from the
		// click on the add button, but we of course need to keep the results area open to show the form.
		//    That covers every situation except when the user deliberately does something screwy, like
		// click-and-drag inside the results area, resulting in a defocus but no subsequent click event.
		// That will jam the results window open on the defocused input element while the user goes
		// elsewhere on the page.
		//    To clean that up, we need to track body-wide click events, and hide the result set
		// if the user clicks anywhere that doesn't involve this element.
		//    The only situation this doesn't catch is when the user click-drags out, and then hits
		// tab immediately afterwards to put focus on the first form element of the page, thus avoiding
		// a second click.  We could potentially catch that with a window-wide key listener, but it's
		// enough of a corner case that we don't bother.
		bodyMouseDownHandler = (e:BaseJQueryEventObject) => {
			var obj = e.srcElement || e.target;
			// If the event's target has a unique ID the same as the one for
			// this input, then the user is clicking into this input element.
			// Whether or not it already has focus, we know we don't want to defocus the search results area.
			// You'd think we could do this by comparing, say, obj to this.inputElement directly, but that
			// fails most of the time for most of the fired events from a single mousedown.
			if (e.target['inputFieldUniqueID'] === this.inputFieldUniqueID) {
                return;
			}
			if (this.mouseOverResults == false) {
				this.defocusNow();
			}
		}


		// Attempt to match a string in the input field with a record in the appropriate data array.
		// If a match is made, replace the string in the input field with the officially formatted string
		// from the record, and store the ID of the record in the hidden input field if one exists.
		setFromPrimaryElement():void {
			var bestGuess:number = 0;
			var e = this.inputElement;
			var origv = e.value;
			if (origv != "") {
				bestGuess = this.searchForClosestRecordMatch(origv);
				if (bestGuess) {
					e.value = this.resolveRecordIDToSelectString(bestGuess);
				} else {
					// If we didn't find a match, we should blank out the field to show the failure.
					bestGuess = 0;
					e.value = '';
				}
			}

			// If there is an alternate hidden element for storing the record ID,
			// we need to find it, so we can place our best guess at a record ID there.
			if (this.inputElementForID) {
				if (bestGuess) {
					this.inputElementForID.value = bestGuess.toString();
				} else {
					this.inputElementForID.value = '';
				}
			}
		}


		// Attempt to match a given string with a record in the appropriate data array.
		// This code attempts to match according to a set of ranked rules, so that only the "closest" match is chosen.
		// (This may seem overdone, but it's important because when the system guesses a match well, it potentially saves a human
		// a lot of time over hundreds of edits.  It's well-worth throwing a few extra CPU cycles at.)
		searchForClosestRecordMatch(v: string):number {
			return 0;
		}


		resolveRecordIDToSelectString(id: number):string {
			return '';
		}


		setFromHiddenElement():void {
			// If there is an alternate hidden element for storing the record ID,
			// draw out the value and use it to set the input element.
			if (this.inputElementForID) {
				var id = parseInt(this.inputElementForID.value);
				this.inputElement.value = this.resolveRecordIDToSelectString(id);
			}
		}


		// Helper function for prepareSourceData.
		//
		// This creates an additional property of the given object, called _l, then iterates through all the
		// other properties in the object, and if the value is a string, it stores a lowercase version of the string
		// under the same property name in _l.
		// The point of this is, using the toLowerCase function is expensive, and this allows us to run it once per
		// property instead of, in some cases, 20,000 times.
		static createLowercaseForStrings(rec) {
			var l = {};
			delete rec._l;
			for (var key in rec) {
				var v = rec[key];
				if (typeof v == 'string' || v instanceof String) {
					l[key] = v.toLowerCase();
				}
			}
			rec._l = l;
		}


		typingDelayExpirationHandler = ():void => {
			// ignore if the following keys are pressed: [del] [shift] [capslock]
			if ( this.lastKeyPressCode == 46 || (this.lastKeyPressCode > 8 && this.lastKeyPressCode < 32) ) {
				return this.resultsElementJQ.hide();
			}
			var v = this.inputElementJQ.val();
			if (v == this.previousSelection) {
				return;
			}
			this.previousSelection = v;
			if (v.length >= this.minCharsToTriggerSearch) {
				this.inputElementJQ.addClass(this.loadingClass);
				this.requestData(v);
			} else {
				this.inputElementJQ.removeClass(this.loadingClass);
				this.resultsElementJQ.hide();
			}
		}


		// fills in the input box w/the first match (assumed to be the best match)
		autoFill(sValue:string):void {
			// if the last user key pressed was backspace, don't autofill
			if (this.lastKeyPressCode != 8) {
				// fill in the value (keep the case the user has typed)
				this.inputElementJQ.val(this.inputElementJQ.val() + sValue.substring(this.previousSelection.length));
				// select the portion of the value not typed by the user (so the next character will erase)
				this.createSelection(this.previousSelection.length, sValue.length);
			}
		}


		showResults():void {
			// get the position of the input field right now (in case the DOM is shifted)
			var pos = this.findPos(this.inputElement);
			// either use the specified width, or autocalculate based on form element
			var iWidth = (this.width > 0) ? this.width : this.inputElementJQ.width();
			// reposition
			this.resultsElementJQ.css({
				width: parseInt(iWidth) + "px",
				top: (pos.y + this.inputElement.offsetHeight) + "px",
				left: pos.x + "px"
			}).show();
		}


		defocusAfterDelay():void {
			if (this.defocusTimeout) {
				clearTimeout(this.defocusTimeout);
			}
			this.defocusTimeout = setTimeout(this.defocusNowCallback, 50);
		}


		defocusNowCallback = ():void => {
			this.defocusNow();
		}


		defocusNow():void {
			if (this.defocusTimeout) {
				clearTimeout(this.defocusTimeout);
			}
			this.inputElementJQ.removeClass(this.loadingClass);
			if (this.resultsElementJQ.is(":visible")) {
				this.resultsElementJQ.hide();
				// If we must have a match, and the value has been futzed with,
				// we clear the selection.
				//   Note that if a hidden element is present and nonzero it will
				// restore that value instead of blanking it.
				if (this.mustMatch) {
					if (this.inputElement.value != this.latestSelection) {
						this.revertSelection();
					}
				}
			}
		}


		receiveData(q:string, data:T[]):void {
			// If we have a non-empty query, but got no data from it, and there is no minimum input size requirement,
			// run the query again as an empty query, to show the full result set.
			if (q && (data.length == 0) && !this.minCharsToTriggerSearch) {
				// Note that this loops back in the logic tree!  Do not alter the empty string in the following call!
				this.requestData('');
				return;
			}

			if (!data) {
				this.defocusNow();
				return;
			}
			this.inputElementJQ.removeClass(this.loadingClass);

            this.resultsContentElementJQ.empty();

			// if the field no longer has focus or if there are no matches, do not display the drop down
			if (!this.hasFocus || data.length == 0) {
				return this.defocusNow();
			}
			
			var rtable = $(document.createElement("table")).addClass(this.resultsTableClass);
			
			var num = data.length;

			// limited results to a max number
			if ((this.maxItemsToShow > 0) && (this.maxItemsToShow < num)) {
				num = this.maxItemsToShow;
			}

			// Construct a table of results by walking through the data and
			// calling a function to create a formatter table row for each record
            data.forEach((row, i) => {
                if (!row) return;
                $(this.formatItemFunction(document.createElement("tr"), row, i, num))
                    .data(<any>row).appendTo(rtable);
            });
            rtable.on('click', 'tr', this.resultsRowClickHandler)
                .on('mouseenter', 'tr', this.resultsRowHoverHandler)
                .on('mouseleave', 'tr', this.resultsRowHoverOutHandler)
                .appendTo(this.resultsContentElement);
						
			// autofill in the complete box w/the first match as long as the user hasn't entered in more data
			if ( this.autoFillFirstWhileTyping && (this.inputElementJQ.val().toLowerCase() == q.toLowerCase())) {
				this.autoFill(data[0].selectValue);
			}
			this.showResults();
		}


		resultsRowHoverHandler = (e:BaseJQueryEventObject) => {
			$("tr", this.resultsContentElement).removeClass("autocompleteOver");
            // add class to the correct TR element, then cast to HTMLTableRowElement to save index
            this.activeRowIndex = (<HTMLTableRowElement> $(e.target).closest('tr')
                .addClass("autocompleteOver")[0]).rowIndex;
		}


		resultsRowHoverOutHandler = (e:BaseJQueryEventObject) => {
			$("tr", this.resultsContentElement).removeClass("autocompleteOver");
		}


		resultsRowClickHandler = (e:BaseJQueryEventObject) => {
            var target = $(e.target).closest('tr');
            e.preventDefault();
			e.stopPropagation();
            if (target.size() === 1) {
                this.selectItem(<HTMLElement> target[0]);
            }
		}


		selectCurrent() {
            var x = this.resultsContentElementJQ;
            var select;
            if ((select = x.filter('tr.autocompleteOver')).size() === 1) {
                // select = hovered item
            } else if (this.selectOnly && (select = x.filter('tr:only-of-type')).size() === 1) {
                // select = only item
            } else if (this.selectFirst && (select = x.filter('tr:first-of-type')).size() === 1) {
                // select = first item
            } else {
                return false;
            }
            this.selectItem(select[0]);
            return true;
		}


		moveSelect(step:number):void {
			var rtrs = $("tr", this.resultsContentElement).removeClass("autocompleteOver");
			if (rtrs.size() === 0) return;
			this.activeRowIndex += step;
			if (this.activeRowIndex < 0) {
				this.activeRowIndex = 0;
			} else if (this.activeRowIndex >= rtrs.size()) {
				this.activeRowIndex = rtrs.size() - 1;
			}
            rtrs.eq(this.activeRowIndex).addClass("autocompleteOver");
		}


		// Returning the selection to a default state.
		// Note that if a hidden element is present and nonzero it will
		// restore that value instead of presenting a blanking field.
		revertSelection():void {
			this.latestSelection = "";
			this.previousSelection = "";
			this.inputElementJQ.val("");
			this.setFromHiddenElement();
		}


		selectItem(rtr:HTMLElement):void {
			if (!rtr) {
				return;
			}
            var row:T = <T> $(rtr).data();
			var v = $.trim(row.selectValue || rtr.innerHTML);
			this.latestSelection = v;
			this.previousSelection = v;
			this.inputElementJQ.val(v);
			if (this.inputElementForID) {
                // use the row.meta field if it exists
                this.inputElementForID.value = row.meta ? row.meta : row.id;
			}
			this.defocusNow();
			if (this.onItemSelect) {
				setTimeout(this.onItemSelectCallback, 1);
			}
		}


		onItemSelectCallback = ():void => {
			this.onItemSelect(this);
		}


		// selects a portion of the input string
		createSelection(start:number, end:number):void {
			// get a reference to the input element
			var field = this.inputElement;
			if (field.createTextRange) {
				var selRange = field.createTextRange();
				selRange.collapse(true);
				selRange.moveStart("character", start);
				selRange.moveEnd("character", end);
				selRange.select();
			} else if (field.setSelectionRange) {
				field.setSelectionRange(start, end);
			} else {
				if (field.selectionStart) {
					field.selectionStart = start;
					field.selectionEnd = end;
				}
			}
			field.focus();
		}


        // requestData takes the value of the input field, fetches matching results, and calls
        //  receiveData 
		requestData(query:string):void {
            var queries:string[], data:T[];
			if (!this.matchCase) {
				query = query.toLowerCase();
			}
            // tokenize; trim, then split on whitespace
            queries = query.trim().split(/\s+/);
            // canonicalize; join terms by single space for cache
            query = queries.join(' ');
			// attempt to load from cache
            data = this.loadFromCache(query);
			// if not found, run the search
            if (!data) {
                // search for results
                this.searchFunction(queries, (data:T[]) => {
                    this.addToCache(query, data);
                    this.receiveData(query, data);
                });
            } else {
                // use cached results
                this.receiveData(query, data);
            }
		}


		// Subclasses need to implement these 
		loadFromCache(query:string):T[] {		
			console.log('loadFromCache must be implemented by subclass');
            return undefined;
		}
		

		addToCache(query:string, data:T[]):void {
			console.log('addToCache must be implemented by subclass');
		}


		searchFunction(queries:string[], callback:(data:T[])=>void, params?:any):void {
            console.log('searchFunction must be implemented by subclass');
		}


		formatItemFunction(rtr:HTMLTableRowElement, row:T, i:number, num:number) {
			if (!row) {
				return rtr;
			}

			for (var j=0; j < row.cols.length; j++) {
				var rtd = document.createElement("td");
				rtd.innerHTML = row.cols[j];
				rtr.appendChild(rtd);
			}
			return rtr;
		}


		findPos(obj:HTMLElement): { x:number; y:number; } {
			var curleft = obj.offsetLeft || 0;
			var curtop = obj.offsetTop || 0;
			while (obj = <HTMLElement> obj.offsetParent) { // HTMLElement parents are HTMLElement
				curleft += obj.offsetLeft
				curtop += obj.offsetTop
			}
			return {x:curleft,y:curtop};
		}
	}



	export class InputFieldWithControlsTemplate<T extends InputFieldValue> extends InputFieldTemplate<T> {

		showActionsBar: boolean;
		formDiv: HTMLElement;
		formDivJQ: any;
		formInputElements: any;
		formInputElementsSet: any;
		addFormBaseURL: string;
		private hideAddFormTimeout: any;
		private lastAutoFillID: number;
		private cancelButton: HTMLInputElement;
		private submitButton: HTMLInputElement;
		private doneButton: HTMLInputElement;
		private addNewFormMessageArea: HTMLElement;
		private resultsActionsClass: string;
		private mouseOverForm: boolean;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			var resultsActionsBar = document.createElement("div");
			resultsActionsBar.className = this.resultsActionsClass;
			this.resultsElement.appendChild(resultsActionsBar);
			this.prepareActionsBar(resultsActionsBar);
			this.mouseOverForm = false;
		}


		configure() {
			super.configure();
			this.resultsActionsClass = "dropDownActionsBar";
			this.hideAddFormTimeout = null;
			this.formInputElements = {};
			this.formInputElementsSet = [];
			this.lastAutoFillID = 0;
			this.addFormBaseURL = 'FormAjaxResp.cgi?action=unknownAction';
		}


		prepareActionsBar(resultsActionsBar: HTMLElement) {
			var addNewButton = document.createElement("input");
			addNewButton.setAttribute('type', "button");
			addNewButton.setAttribute('value', "Add New");
			addNewButton.setAttribute('name', "action");
			addNewButton.addEventListener('click', this.addNewButtonHandler, false);
			addNewButton['autocompleter'] = this; // custom property
			resultsActionsBar.appendChild(addNewButton);

			// Create main form div
			this.formDiv = <HTMLElement>document.createElement("div");
			// Create jQuery object for formDiv
			this.formDivJQ = $(this.formDiv);
			this.formDivJQ.addClass("dropDownFrame");

			this.createAddNewForm();

			var formControlsDiv = <HTMLElement>document.createElement("div");
			formControlsDiv.style.textAlign = "right";
			this.formDiv.appendChild(formControlsDiv);

				var b = <HTMLInputElement>document.createElement("input");
				b.setAttribute('type', "button");
				b.setAttribute('value', "Cancel");
				b.style.margin = "0px 9px 3px 0px";
				formControlsDiv.appendChild(b);
				$(b).click(this.formClickCancelOrDoneButton);
				this.cancelButton = b;

				b = <HTMLInputElement>document.createElement("input");
				b.setAttribute('type', "button");
				b.setAttribute('value', "Add");
				b.style.margin = "0px 9px 3px 0px";
				formControlsDiv.appendChild(b);
				$(b).click(this.formClickAddButton);
				this.submitButton = b;

				b = <HTMLInputElement>document.createElement("input");
				b.setAttribute('type', "button");
				b.setAttribute('value', "Done");
				b.style.margin = "0px 9px 3px 0px";
				formControlsDiv.appendChild(b);
				$(b).click(this.formClickCancelOrDoneButton);
				this.doneButton = b;

			this.addNewFormMessageArea = document.createElement("div");
			this.addNewFormMessageArea.className = "dropDownMessageArea";
			this.formDiv.appendChild(this.addNewFormMessageArea);		

			// Add to body element
			$("body").append(this.formDiv).mousedown(this.bodyMouseDownHandlerForInputForm);
			this.hideTheFormNow();
		}


		createAddNewForm() {
			console.log("createAddNewForm must be implemented by subclass");
		}


		// If the user deliberately clicks outside the add form, hide the form.
		// We assume that if the user clicks to the input element itself, they intend to use it in the default way,
		// so we hide the form even then.
		bodyMouseDownHandlerForInputForm=(e)=>{
            if ($(e.target).closest(this.formDiv).length === 0) {
                this.hideTheFormNow();
            }
		}


		addNewButtonHandler=(e)=>{
			e.preventDefault();
			e.stopPropagation();
			this.defocusNow();
			this.addNewFunction();
		}


		addNewFunction() {
			if (this.inputElementForID) {
				// If the last seen value for the hidden element differs from the current,
				if (parseInt(this.inputElementForID.value) != this.lastAutoFillID) {
					// Use it to auto-populate our form.
					this.lastAutoFillID = parseInt(this.inputElementForID.value);
					this.populateAddNewFormFields(this.lastAutoFillID);
				}
			}

			this.submitButton.style.display = "inline-block";
			this.cancelButton.style.display = "inline-block";
			this.doneButton.style.display = "none";	// The "Done" button starts out hidden

			// Get the position of the input field right now (in case the DOM is shifted),
			// and position the add form just below.
			var pos = this.findPos(this.inputElement);
			this.formDivJQ.css({
				top: (pos.y + this.inputElement.offsetHeight) + "px",
				left: pos.x + "px"
			}).show();
		}


		populateAddNewFormFields(v: number) {
			console.log("populateAddNewFormFields must be implemented by subclass");
		}


		hideTheForm() {
			if (this.hideAddFormTimeout) {
				clearTimeout(this.hideAddFormTimeout);
			}
			this.hideAddFormTimeout = setTimeout(this.hideTheFormCallback, 100);
		}


		hideTheFormCallback=(e)=>{
			this.hideTheFormNow();
		}


		hideTheFormNow() {
			if (this.hideAddFormTimeout) {
				clearTimeout(this.hideAddFormTimeout);
			}
			this.addNewFormMessageArea.innerHTML = ''; // Clear any status message
			if (this.formDivJQ.is(":visible")) {
				this.formDivJQ.hide();
			}
		}


		formClickCancelOrDoneButton=(e)=>{
			e.preventDefault();
			e.stopPropagation();
			this.hideTheFormNow();
		}


		formClickAddButton=(e)=>{
			e.preventDefault();
			e.stopPropagation();
			this.submitTheForm();
		}


		submitTheForm() {
			var url = this.addFormBaseURL;

			// Run through the accumulated list of inputs to submit, reading each value out,
			// and turning it into a chunk of url data for ajax submission.

			for (var i=0; i < this.formInputElementsSet.length; i++) {
				var j = this.formInputElementsSet[i];
				url += "&" + j.getAttribute('name') + "=" + encodeURIComponent(j.value);
			}
			$.ajax({
				url: url,
				dataTypeString: "json",
				success: this.receiveAddNewFormResponse
			});
		}


		receiveAddNewFormResponse=(data, textStatus, jqXHR)=>{
			if (data.type == "Success") {
				// Display the message in green, since it's successful
				this.addNewFormMessageArea.style.color = "green";
				// Hide the add and cancel buttons, replacing them with the done button.
				this.submitButton.style.display = "none";
				this.cancelButton.style.display = "none";
				this.doneButton.style.display = "inline-block";

				// Integrate the returned record directly into the relevant JSON data structure
				this.addNewResultsSetRecord(data.data);

				// If we have an autofill element, set the value to the new record,
				// and call the routine to select it.
				if (this.inputElementForID) {
					this.inputElementForID.value = data.data.newid;
					this.setFromHiddenElement();
				}
			} else if (data.type == "Failure") {
				this.addNewFormMessageArea.style.color = "red";
			}
			this.addNewFormMessageArea.innerHTML = data.message;
		}


		addNewResultsSetRecord(data: any) {
			console.log("addNewResultsSetRecord must be implemented by subclass");
		}
	}



    export interface UserFieldValue extends InputFieldValue {}
	export class UserField extends InputFieldTemplate<UserFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<UserFieldValue> = new QueryCacheManager<UserFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			UserField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = true;
			this.selectOnly = true;
			this.mustMatch = true;
			this.delay = 200;
			this.width = 350;
			this.maxItemsToShow = 150;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):UserFieldValue[] {
            return UserField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:UserFieldValue[]) {
            UserField.cacheManager.cache(query, data);
		}


		searchFunction(queries:string[], callback:(data:UserFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.EnabledUserIDs.length; x++) {
				var uID = EDDData.EnabledUserIDs[x];
				var fullName:string = EDDData.Users[uID].firstname + " " + EDDData.Users[uID].lastname;
				var initials:string = EDDData.Users[uID].initials;
				var email:string = EDDData.Users[uID].email;

				var uCols = [fullName, initials, email];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {

                    var results = (new Search(queries)).search(SearchSegment.create(fullName, initials, email));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}

				var uRecord = {
					id: uID,
					selectValue: fullName,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
            callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) {
				return rtr;
			}

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = "(" + row.cols[1] + ")";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtr.appendChild(rtd);
			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			UserField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.UserIDs.length; x++) {
				var id = EDDData.UserIDs[x];	
				var rec = EDDData.Users[id];
				// Matching the selectString is a slam-dunk
				if (vl == rec._l.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				// An exact email address is a better match than a name in any format
				if (vl == rec._l.email) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality >= 0.8) {continue;}
				// A common way of pasting a full name
				if (vl == rec._l.lastname + ", " + rec._l.firstname) {
					highestMatchQuality = 0.8;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.7) {continue;}
				// An exact match on initials is not bad
				if (vl == rec._l.initials) {
					highestMatchQuality = 0.7;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.6) {continue;}				
				// The last name by itself is better than nothing
				if (vl.indexOf(rec._l.lastname) >= 0) {
					highestMatchQuality = 0.6;
					bestMatchSoFar = id;
					continue;
				} 
				if (highestMatchQuality >= 0.5) {continue;}
				// The first name alone is a pretty poor match
				if (vl.indexOf(rec._l.firstname) >= 0) {
					highestMatchQuality = 0.5;
					bestMatchSoFar = id;
					continue;
				}
			}

			return bestMatchSoFar;
		}


		resolveRecordIDToSelectString(id: number) {
			if (!id) {	return '';	}
			return EDDData.Users[id].selectString;
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (UserField.sourceDataPrepared && force == false) {
				return;
			}
			UserField.sourceDataPrepared = true;

			if (EDDData.UserIDs) {
				for (var x=0; x < EDDData.UserIDs.length; x++) {
					var id = EDDData.UserIDs[x];	
					var rec = EDDData.Users[id];
					rec.selectString = rec.firstname + " " + rec.lastname;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			UserField.cacheManager.flushCache();
		}
	}



    export interface EmailFieldValue extends InputFieldValue {}
	export class EmailField extends InputFieldTemplate<EmailFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<EmailFieldValue> = new QueryCacheManager<EmailFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			EmailField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = false;
			this.selectOnly = false;
			this.mustMatch = false;
			this.delay = 200;
			this.width = 350;
			this.maxItemsToShow = 150;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):EmailFieldValue[] {
            return EmailField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:EmailFieldValue[]):void {
            EmailField.cacheManager.cache(query, data);
		}


		searchFunction(query:string[], callback:(data:EmailFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.EnabledUserIDs.length; x++) {
				var uID = EDDData.EnabledUserIDs[x];
				var fullName = EDDData.Users[uID].firstname + " " + EDDData.Users[uID].lastname;
				var initials = EDDData.Users[uID].initials;
				var email = EDDData.Users[uID].email;

				var uCols = [fullName, initials, email];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (query && query.length > 0) {

                    var results = (new Search(query)).search(SearchSegment.create(fullName, initials, email)); 
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}

				var uRecord = {
					id: uID,
					selectValue: email,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) {
				return rtr;
			}

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = "(" + row.cols[1] + ")";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtr.appendChild(rtd);
			return rtr;
		}
		
		
		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			EmailField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.UserIDs.length; x++) {
				var id = EDDData.UserIDs[x];	
				var rec = EDDData.Users[id];
				// Matching the selectString is a slam-dunk
				if (vl == rec._l.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				// An exact email address is a better match than a name in any format
				if (vl == rec._l.email) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality >= 0.8) {continue;}
				// A common way of pasting a full name
				if (vl == rec._l.lastname + ", " + rec._l.firstname) {
					highestMatchQuality = 0.8;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.7) {continue;}
				// An exact match on initials is not bad
				if (vl == rec._l.initials) {
					highestMatchQuality = 0.7;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.6) {continue;}				
				// The last name by itself is better than nothing
				if (vl.indexOf(rec._l.lastname) >= 0) {
					highestMatchQuality = 0.6;
					bestMatchSoFar = id;
					continue;
				} 
				if (highestMatchQuality >= 0.5) {continue;}
				// The first name alone is a pretty poor match
				if (vl.indexOf(rec._l.firstname) >= 0) {
					highestMatchQuality = 0.5;
					bestMatchSoFar = id;
					continue;
				}
			}

			return bestMatchSoFar;
		}


		resolveRecordIDToSelectString(id: number) {
			if (!id) {	return '';	}
			return EDDData.Users[id].email;
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (EmailField.sourceDataPrepared && force == false) {
				return;
			}
			EmailField.sourceDataPrepared = true;

			// Preparing the same data as UserField right now.  Kind of redundant.
			if (EDDData.UserIDs) {
				for (var x=0; x < EDDData.UserIDs.length; x++) {
					var id = EDDData.UserIDs[x];	
					var rec = EDDData.Users[id];
					rec.selectString = rec.firstname + " " + rec.lastname;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
            EmailField.cacheManager.flushCache();
		}

	}



    export interface MetaboliteFieldValue extends InputFieldValue {}
	export class MetaboliteField extends InputFieldWithControlsTemplate<MetaboliteFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<MetaboliteFieldValue> = new QueryCacheManager<MetaboliteFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			MetaboliteField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = true;
			this.selectOnly = true;
			this.mustMatch = true;
			this.delay = 200;
			this.width = 660;
			this.maxItemsToShow = 150;

			this.addFormBaseURL = 'FormAjaxResp.cgi?action=inlineAddMetaboliteType';
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):MetaboliteFieldValue[] {
            return MetaboliteField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:MetaboliteFieldValue[]):void {
            MetaboliteField.cacheManager.cache(query, data);
		}


		searchFunction(query:string[], callback:(data:MetaboliteFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.MetaboliteTypeIDs.length; x++) {
				var fID = EDDData.MetaboliteTypeIDs[x];
				var sn = EDDData.MetaboliteTypes[fID].sn;
				var name = EDDData.MetaboliteTypes[fID].name;
				var f = EDDData.MetaboliteTypes[fID].f;
				var kstr = EDDData.MetaboliteTypes[fID].kstr;

				var uCols = [sn, name, f, kstr];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (query && query.length > 0) {

                    var results = (new Search(query)).search(SearchSegment.create(sn, name, f, kstr));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}

				var uRecord = {
					id: fID,
					selectValue: EDDData.MetaboliteTypes[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.style.wordWrap = "break-word";
			rtd.innerHTML = row.cols[1];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			if (row.cols[3] != '') {
				rtd.innerHTML = "(" + row.cols[3] + ")";
			}
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {
			return MetaboliteField.searchForClosestRecordMatchStatic(v);
		}


		static searchForClosestRecordMatchStatic(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			MetaboliteField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			var smallestStringWithSubstrSoFar = null;
			for (var x=0; x < EDDData.MetaboliteTypeIDs.length; x++) {
				var id = EDDData.MetaboliteTypeIDs[x];
				var rec = EDDData.MetaboliteTypes[id];
				var name = rec._l.name;
				var sn = rec._l.sn;

				if (vl == rec._l.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality > 0.9) {continue;}
				// A substring match against the selectString is good, but we should keep looking for a longer string to match in
				if (vl.indexOf(rec._l.selectString) >= 0) {
					if ((mostMatchedCharsSoFar < rec.selectString.length) || (highestMatchQuality < 0.9)) {
						mostMatchedCharsSoFar = rec.selectString.length;
						bestMatchSoFar = id;
					}
					highestMatchQuality = 0.9;
					continue;
				}
				// If the measurement has no abbreviation, rec.selectString will match rec.name,
				// which makes this check kind of redundant.  But oh well.
				if (highestMatchQuality >= 0.7) {continue;}
				if (vl == name) {
					highestMatchQuality = 0.7;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.6) {continue;}
				if (vl == sn) {
					highestMatchQuality = 0.6;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality > 0.5) {continue;}
				// Name alone is decent, but we should keep searching for a longer match
				if (vl.indexOf(name) >= 0) {
					if ((mostMatchedCharsSoFar < name.length) || (highestMatchQuality < 0.5)) {
						mostMatchedCharsSoFar = name.length;
						bestMatchSoFar = id;
					}
					highestMatchQuality = 0.5;
					continue;
				}
				if (highestMatchQuality > 0.4) {continue;}
				// Same idea with the short name.
				if (vl.indexOf(sn) >= 0) {
					if ((mostMatchedCharsSoFar < sn.length) || (highestMatchQuality < 0.4)) {
						mostMatchedCharsSoFar = sn.length;
						bestMatchSoFar = id;
					}
					highestMatchQuality = 0.4;
					continue;
				}
				if (highestMatchQuality > 0.3) {continue;}
				// Finding the value within the selectstring, on a word-border, is our last attempt
				if (smallestStringWithSubstrSoFar) {
					if (rec.selectString.length > smallestStringWithSubstrSoFar) {
						continue;
					}
				}
				if (vlWordRegex.test(rec._l.selectString)) {
					smallestStringWithSubstrSoFar = rec.selectString.length;
					bestMatchSoFar = id;
				}
			}

			return bestMatchSoFar;
		}


		resolveRecordIDToSelectString(id: number) {
			if (!id) {	return '';	}
			return EDDData.MetaboliteTypes[id].selectString;
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (MetaboliteField.sourceDataPrepared && force == false) {
				return;
			}
			MetaboliteField.sourceDataPrepared = true;

			if (EDDData.MetaboliteTypeIDs) {
				for (var x=0; x < EDDData.MetaboliteTypeIDs.length; x++) {
					var id = EDDData.MetaboliteTypeIDs[x];
					var rec = EDDData.MetaboliteTypes[id];
					var selectString = rec.sn;
					if ((rec.name != '') && (rec.sn != rec.name)) { selectString = selectString + " / " + rec.name; }
		//			if ((rec.un != '') && (rec.un != 'n/a')) { selectString = selectString + " (" + rec.un + ")"; }
					rec.selectString = selectString;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			MetaboliteField.cacheManager.flushCache();
		}


		createAddNewForm() {
			var tableObject = <HTMLElement>document.createElement("table");
			tableObject.className = "formTable";
			tableObject.setAttribute('cellspacing', "0");
			tableObject.style.margin = "9px 2px 7px 9px";
			this.formDiv.appendChild(tableObject);

			var tBodyObject = <HTMLElement>document.createElement("tbody");
			tableObject.appendChild(tBodyObject);

				var rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);

					var rtd = document.createElement("td");
					rtd.innerHTML = "<span>Abbreviation:</span>";
					rtr.appendChild(rtd);
	
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var abbrevField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['abbrevField'] = abbrevField;
						this.formInputElementsSet.push(abbrevField);
						abbrevField.setAttribute('type', "text");
						abbrevField.setAttribute('id', this.inputElement.id + "inlineMTypeAbbrev");
						abbrevField.setAttribute('name', "mtypeabbr");
						abbrevField.setAttribute('size', "8");
						rtd.appendChild(abbrevField);
	
				rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);

					var rtd = document.createElement("td");
					rtd.innerHTML = "<span>Entity Name:</span>";
					rtr.appendChild(rtd);
		
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var nameField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['nameField'] = nameField;
						this.formInputElementsSet.push(nameField);
						nameField.setAttribute('type', "text");
						nameField.setAttribute('id', this.inputElement.id + "inlineMTypeName");
						nameField.setAttribute('name', "mtypeentity");
						nameField.setAttribute('size', "40");
						rtd.appendChild(nameField);

				rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);

					var rtd = document.createElement("td");
					rtd.innerHTML = "<span>Formula:</span>";
					rtr.appendChild(rtd);
		
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var formulaField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['formulaField'] = formulaField;
						this.formInputElementsSet.push(formulaField);
						formulaField.setAttribute('type', "text");
						formulaField.setAttribute('id', this.inputElement.id + "inlineMTypeFormula");
						formulaField.setAttribute('name', "mtypeformula");
						formulaField.setAttribute('size', "40");
						rtd.appendChild(formulaField);
		}


		populateAddNewFormFields(v: number) {
			this.formInputElements['nameField'].value = EDDData.MetaboliteTypes[v].name;
			this.formInputElements['abbrevField'].value = EDDData.MetaboliteTypes[v].sn;
			this.formInputElements['formulaField'].value = EDDData.MetaboliteTypes[v].f;
		}


		addNewResultsSetRecord(data: any) {
			EDDData.MetaboliteTypes[data.newid] = data.newrecord;
			EDDData.MetaboliteTypeIDs = data.newidlist;
			MetaboliteField.prepareSourceData(true);	// Force rebuild and cache flush
		}
	}



    export interface MetaDataFieldValue extends InputFieldValue {}
	export class MetaDataField extends InputFieldTemplate<MetaDataFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<MetaDataFieldValue> = new QueryCacheManager<MetaDataFieldValue>();
		static sourceDataPrepared : boolean = false;

		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			MetaDataField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = false;
			this.selectOnly = false;
			this.mustMatch = false;
			this.delay = 200;
			this.width = 660;
			this.maxItemsToShow = 150;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):MetaDataFieldValue[] {
            return MetaDataField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:MetaDataFieldValue[]):void {
			MetaDataField.cacheManager.cache(query, data);
		}


		searchFunction(queries:string[], callback:(data:MetaDataFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.MetaDataTypeIDs.length; x++) {
				var fID = EDDData.MetaDataTypeIDs[x];

				// Using these and an embedded flag we check to see if
				// we should be filtering by line or assay level
				var ll = EDDData.MetaDataTypes[fID].ll;
				var pl = EDDData.MetaDataTypes[fID].pl;

				var prefix = EDDData.MetaDataTypes[fID].pre;
				var name = EDDData.MetaDataTypes[fID].name;
				var postfix = EDDData.MetaDataTypes[fID].postfix;
				var gn = EDDData.MetaDataTypes[fID].gn;

				var uCols = [prefix, name, postfix, gn];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(prefix, name, postfix, gn));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}

				var uRecord = {
					id: fID,
					selectValue: EDDData.MetaDataTypes[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.style.whiteSpace = "nowrap";
			rtd.style.textAlign = "right";
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.style.whiteSpace = "nowrap";
			rtd.innerHTML = row.cols[1];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.style.whiteSpace = "nowrap";
			rtd.innerHTML = row.cols[2];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.style.whiteSpace = "nowrap";
			rtd.innerHTML = row.cols[3];
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {
			return MetaDataField.searchForClosestRecordMatchStatic(v);
		}


		static searchForClosestRecordMatchStatic(v: string) {
			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			MetaDataField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.MetaDataTypeIDs.length; x++) {
				var id = EDDData.MetaDataTypeIDs[x];
				var rec = EDDData.MetaDataTypes[id];
				var name = rec._l.name;
				var prefix = rec.pre ? '(' + rec._l.pre + ') ' : '';
				var postfix = rec.postfix ? ' (' + rec._l.postfix + ')' : '';

				if (vl == rec._l.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality > 0.9) {continue;}
				// A substring match against the selectString is good, but we should keep looking for a longer string to match in
				if (vl.indexOf(rec._l.selectString) >= 0) {
					if ((mostMatchedCharsSoFar < rec.selectString.length) || (highestMatchQuality < 0.9)) {
						mostMatchedCharsSoFar = rec.selectString.length;
						bestMatchSoFar = id;
					}
					highestMatchQuality = 0.9;
					continue;
				}
				// Next best match is the complete name, with pre and/or postfixes added parenthetically
				if (highestMatchQuality >= 0.8) {continue;}
				if (vl == prefix + name + postfix) {
					highestMatchQuality = 0.8;
					bestMatchSoFar = id;
					continue;
				}
				// Next is the complete name alone
				if (highestMatchQuality >= 0.7) {continue;}
				if (vl == name) {
					highestMatchQuality = 0.7;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality > 0.5) {continue;}
				// Name alone is decent, but we should keep searching for a longer match
				if (vl.indexOf(name) >= 0) {
					if ((mostMatchedCharsSoFar < name.length) || (highestMatchQuality < 0.5)) {
						mostMatchedCharsSoFar = name.length;
						bestMatchSoFar = id;
					}
					highestMatchQuality = 0.5;
					continue;
				}
			}

			return bestMatchSoFar;
		}


		// Not presently used anywhere.  Needs implementing if used.
		resolveRecordIDToSelectString(id: number) {
			return '';
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (MetaDataField.sourceDataPrepared && force == false) {
				return;
			}
			MetaDataField.sourceDataPrepared = true;

			if (EDDData.MetaDataTypeIDs) {
				for (var x=0; x < EDDData.MetaDataTypeIDs.length; x++) {
					var id = EDDData.MetaDataTypeIDs[x];
					var rec = EDDData.MetaDataTypes[id];
					var selectString = rec.name;
					if (rec.pre && rec.pre != '') { selectString = '[' + rec.pre + '] ' + selectString; }
					if (rec.postfix && rec.postfix != '') { selectString = selectString + ' [' + rec.postfix + ']'; }
					// Not including the group name because it's not really part of a unique identity
					rec.selectString = selectString;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			MetaDataField.cacheManager.flushCache();
		}

	}



    export interface CompartmentFieldValue extends InputFieldValue {}
	export class CompartmentField extends InputFieldTemplate<CompartmentFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<CompartmentFieldValue> = new QueryCacheManager<CompartmentFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			CompartmentField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = true;
			this.selectOnly = true;
			this.mustMatch = true;
			this.delay = 150;
			this.width = 300;
			this.maxItemsToShow = 10;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):CompartmentFieldValue[] {
            return CompartmentField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:CompartmentFieldValue[]):void {
            CompartmentField.cacheManager.cache(query, data);
		}



		searchFunction(queries:string[], callback:(data:CompartmentFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.MeasurementTypeCompartmentIDs.length; x++) {
				var fID = EDDData.MeasurementTypeCompartmentIDs[x];
				var name = EDDData.MeasurementTypeCompartments[fID].name;
				if (fID == 0) { name = 'n/a'; }
				var sn = EDDData.MeasurementTypeCompartments[fID].sn;

				var uCols = [name, sn];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(name, sn));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}

				var uRecord = {
					id: fID,
					selectValue: EDDData.MeasurementTypeCompartments[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			if (row.cols[1] != '') {
				rtd.innerHTML = "(" + row.cols[1] + ")";	
			}
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			CompartmentField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			vl = vl.replace(/(^|\W)in cell(\W|$)/, '(ic)'); // A special case to make the phrase "in cell" more palatable
			for (var x=0; x < EDDData.MeasurementTypeCompartmentIDs.length; x++) {
				var id = EDDData.MeasurementTypeCompartmentIDs[x];
				var rec = EDDData.MeasurementTypeCompartments[id];
				var name = rec._l.name;
				var sn = rec._l.sn;

				if (vl == name) {
					bestMatchSoFar = id;
					highestMatchQuality = 1;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality > 0.9) {continue;}
				if (vl == sn) {
					bestMatchSoFar = id;
					highestMatchQuality = 0.9;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality >= 0.8) {continue;}
				if ((name.length > 1) && (vl.indexOf(name) >= 0)) {
					bestMatchSoFar = id;
					highestMatchQuality = 0.8;
					continue;
				}
				if (highestMatchQuality >= 0.7) {continue;}
				// Only accept the shortname of the compartment if it has been parenthesized
				if ((name.length > 1) && (vl.indexOf('(' + sn + ')') >= 0)) {
					bestMatchSoFar = id;
					highestMatchQuality = 0.7;
					continue;
				}
				if (highestMatchQuality >= 0.6) {continue;}
				// Only accept the shortname of the compartment if it is a prefix to something longer
				if ((name.length > 1) && (vl.indexOf(sn + ' ') >= 0)) {
					bestMatchSoFar = id;
					highestMatchQuality = 0.6;
					continue;
				}
				if (highestMatchQuality >= 0.5) {continue;}
				// Same idea, but with a hypen separating instead of a space.
				// It should be apparent by now that in some cases, no match at all is actually better than some random partial match.
				if ((name.length > 1) && (vl.indexOf(sn + '-') >= 0)) {
					bestMatchSoFar = id;
					highestMatchQuality = 0.5;
					continue;
				}
			}

			return bestMatchSoFar;
		}


		resolveRecordIDToSelectString(id: number) {
			if (!id) {	return '';	}
			return EDDData.MeasurementTypeCompartments[id].selectString;
		}
		

		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (CompartmentField.sourceDataPrepared && force == false) {
				return;
			}
			CompartmentField.sourceDataPrepared = true;

			if (EDDData.MeasurementTypeCompartmentIDs) {
				for (var x=0; x < EDDData.MeasurementTypeCompartmentIDs.length; x++) {
					var id = EDDData.MeasurementTypeCompartmentIDs[x];
					var rec = EDDData.MeasurementTypeCompartments[id];
					// Special case - selecting ID 0 is allowed, and prints as blank.
					rec.selectString = (id > 0) ? rec.sn : ' ';
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			CompartmentField.cacheManager.flushCache();
		}

	}



    export interface UnitsFieldValue extends InputFieldValue {}
	export class UnitsField extends InputFieldTemplate<UnitsFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<UnitsFieldValue> = new QueryCacheManager<UnitsFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			UnitsField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = true;
			this.selectOnly = true;
			this.mustMatch = true;
			this.delay = 150;
			this.width = 300;
			this.maxItemsToShow = 100;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):UnitsFieldValue[] {
            return UnitsField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:UnitsFieldValue[]):void {
			UnitsField.cacheManager.cache(query, data);
		}


		searchFunction(queries:string[], callback:(data:UnitsFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.UnitTypeIDs.length; x++) {
				var fID = EDDData.UnitTypeIDs[x];
				var name = EDDData.UnitTypes[fID].name;
				var altnames = EDDData.UnitTypes[fID].altnames;

				var uCols = [name, altnames];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(name, altnames));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}

				var uRecord = {
					id: fID,
					selectValue: EDDData.UnitTypes[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtd.className = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			if (row.cols[1] != '') {
				rtd.innerHTML = "(" + row.cols[1] + ")";
			}
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			UnitsField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.UnitTypeIDs.length; x++) {
				var id = EDDData.UnitTypeIDs[x];
				var rec = EDDData.UnitTypes[id];

				if (v == rec.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality > 0.9) {continue;}
				if (v.indexOf(rec.selectString) >= 0) {
					if ((mostMatchedCharsSoFar < rec.selectString.length) || (highestMatchQuality < 0.9)) {
						mostMatchedCharsSoFar = rec.selectString.length;
						bestMatchSoFar = id;
					}
					highestMatchQuality = 0.9;
					continue;
				}
			}

			return bestMatchSoFar;
		}


		resolveRecordIDToSelectString(id: number) {
			if (!id) {	return '';	}
			return EDDData.UnitTypes[id].selectString;
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (UnitsField.sourceDataPrepared && force == false) {
				return;
			}
			UnitsField.sourceDataPrepared = true;

			if (EDDData.UnitTypeIDs) {
				for (var x=0; x < EDDData.UnitTypeIDs.length; x++) {
					var id = EDDData.UnitTypeIDs[x];	
					var rec = EDDData.UnitTypes[id];
					rec.selectString = rec.name;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			UnitsField.cacheManager.flushCache();
		}
	}



    export interface LabelingFieldValue extends InputFieldValue {}
	// We're not using this one for now
	export class LabelingField extends InputFieldTemplate<LabelingFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<LabelingFieldValue> = new QueryCacheManager<LabelingFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			LabelingField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = false;
			this.selectOnly = false;
			this.mustMatch = false;
			this.delay = 200;
			this.width = 500;
			this.maxItemsToShow = 150;
		}
		

		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):LabelingFieldValue[] {
			return LabelingField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:LabelingFieldValue[]):void {
			LabelingField.cacheManager.cache(query, data);
		}

		
		searchFunction(queries:string[], callback:(data:LabelingFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.Labelings.length; x++) {
				var lname = EDDData.Labelings[x].labeling;
				var initials = EDDData.Labelings[x].initials;
				var modstr = EDDData.Labelings[x].modstr;

				var uCols = [lname, initials];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(lname, initials));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}
				uCols.push(modstr);

				var uRecord = {
					id: x,
					selectValue: lname,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {		
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = "(" + row.cols[1] + ")";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtd.className = "nowrap";
			rtr.appendChild(rtd);
			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}
			return 0;
		}


		// Not presently used anywhere.  Needs implementing if used.
		resolveRecordIDToSelectString(id: number) {
			return '';
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (LabelingField.sourceDataPrepared && force == false) {
				return;
			}
			LabelingField.sourceDataPrepared = true;
			LabelingField.cacheManager.flushCache();

			// Nothing to do here
		}

	}



    export interface StrainFieldValue extends InputFieldValue {
        meta:string;    // extra metadata sent along to tie in ICE information
    }
	export class StrainField extends InputFieldWithControlsTemplate<StrainFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<StrainFieldValue> = new QueryCacheManager<StrainFieldValue>();

        private regLink: JQuery;
        

		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
		}


		configure() {
			super.configure();
			this.selectFirst = true;
			this.selectOnly = true;
			this.mustMatch = false;
			this.delay = 250;
			this.width = 600;
			this.maxItemsToShow = 100;

			this.addFormBaseURL = 'FormAjaxResp.cgi?action=inlineAddStrain';
		}
        
        
        addNewFunction():void {
            super.addNewFunction();
            this.regLink.hide();    // only want this showing when clicking result from registry
        }
        
        
        hideTheFormNow():void {
            super.hideTheFormNow();
            this._resetStrainInfo();
        }
        
        
        private _resetStrainInfo() {
            this.formInputElementsSet.forEach((input) => input.value = '');
            this.regLink.hide();
        }


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):StrainFieldValue[] {
			return StrainField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:StrainFieldValue[]):void {
			StrainField.cacheManager.cache(query, data);
		}


		searchFunction(queries:string[], callback:(data:StrainFieldValue[])=>void):void {
            var input = $(this.inputElement).addClass('wait');
            var query = queries.join('');
            var records = [];
            var requests = 2;
            var requestDone = () => {
                if (--requests === 0) {
                    input.removeClass('wait');
                    callback(records);
                }
            };
            var success = (data) => {
                if (data.type !== 'Success') {
                    new ErrorDisplay(input, ['<p>Failed to load some strains! Error details:</p>',
                        (data.message || 'None')].join(''));
                }
                $.each(data.data, (key:string, value:any) => {
                    var row:StrainFieldValue = {
                        'id': key,
                        'selectValue': value.name + ': ' + value.desc,
                        'cols': [ value.name, value.desc, value.modstr ],
                        'meta': undefined
                    };
                    if (value.meta) {
                        // make sure server has all info needed to add strain
                        value.meta.name = value.name;
                        value.meta.desc = value.desc;
                        row.meta = JSON.stringify(value.meta);
                    }
                    records.push(row);
                });
            };
            $.ajax({
                'url': 'FormAjaxResp.cgi?action=inlineRegistrySearch',
                'type': 'POST',
                'data': { 'q': query },
                'error': (xhr, status, e) => {
                    new ErrorDisplay(input, ['Registry search failed: ', status, ';', e].join(''));
                },
                'success': success,
                'complete': requestDone
            });
            $.ajax({
                'url': 'FormAjaxResp.cgi?action=strainSearch',
                'type': 'POST',
                'data': { 'q': query },
                'error': (xhr, status, e) => {
                    new ErrorDisplay(input, ['Local search failed: ', status, ';', e].join(''));
                },
                'success': success,
                'complete': requestDone
            });
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[1];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtd.className = "nowrap";
			rtr.appendChild(rtd);

			return rtr;
		}


		createAddNewForm() {
			var tableObject = <HTMLElement>document.createElement("table");
			tableObject.className = "formTable";
			tableObject.setAttribute('cellspacing', "0");
			tableObject.style.margin = "9px 2px 7px 9px";
			this.formDiv.appendChild(tableObject);

			var tBodyObject = <HTMLElement>document.createElement("tbody");
			tableObject.appendChild(tBodyObject);

				var rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);
	
					var rtd = document.createElement("td");
					rtd.innerHTML = "<span>Name:</span>";
					rtr.appendChild(rtd);
		
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var nameField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['nameField'] = nameField;
						this.formInputElementsSet.push(nameField);
						nameField.setAttribute('type', "text");
						nameField.setAttribute('id', this.inputElement.id + "inlineStrainName");
						nameField.setAttribute('name', "newstrainname");
						nameField.setAttribute('size', "15");
						rtd.appendChild(nameField);
	
				rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);
	
					rtd = document.createElement("td");
					rtd.innerHTML = "<span>Description:</span>";
					rtr.appendChild(rtd);
	
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var descField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['descField'] = descField;
						this.formInputElementsSet.push(descField);
						descField.setAttribute('type', "text");
						descField.setAttribute('id', this.inputElement.id + "inlineStrainLongName");
						descField.setAttribute('name', "newstrainlongname");
						descField.setAttribute('size', "60");
						descField.style.width = "321px";
						rtd.appendChild(descField);
            
            this.regLink = $(document.createElement("a")).text('View in ICE')
                .insertAfter(descField).wrap(document.createElement("div")).hide();
            
            var urls = this.formInputElements['URLsField'] = document.createElement("input");
            this.formInputElementsSet.push(urls);
            $(urls).insertAfter(tableObject)
                .attr({ 'id': this.inputElement.id + "inlineStrainURLs", 'name': 'registryuuid' });
            urls.type = 'hidden';
		}
	}



    export interface CarbonSourceFieldValue extends InputFieldValue {}
	export class CarbonSourceField extends InputFieldWithControlsTemplate<CarbonSourceFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<CarbonSourceFieldValue> = new QueryCacheManager<CarbonSourceFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			CarbonSourceField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = true;
			this.selectOnly = true;
			this.mustMatch = true;
			this.delay = 250;
			this.width = 670;
			this.maxItemsToShow = 100;

			this.addFormBaseURL = 'FormAjaxResp.cgi?action=inlineAddCarbonSource';
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):CarbonSourceFieldValue[] {
			return CarbonSourceField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:CarbonSourceFieldValue[]) {
			CarbonSourceField.cacheManager.cache(query, data);	
		}

		
		searchFunction(queries:string[], callback:(data:CarbonSourceFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.EnabledCSourceIDs.length; x++) {
				var fID = EDDData.EnabledCSourceIDs[x];
				var carbon = EDDData.CSources[fID].carbon;
				var cvol = EDDData.CSources[fID].vol;
				var cvolint = parseInt(cvol, 10);
				var labeling = EDDData.CSources[fID].labeling;
				var ainfo = EDDData.CSources[fID].ainfo;
				var initials = EDDData.CSources[fID].initials;

				if (cvolint == 0) { cvol = ''; }

				var uCols = [carbon, cvol, labeling, ainfo, initials];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(carbon, cvol, labeling, ainfo, initials));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}
				uCols.push(cvolint);

				var uRecord = {
					id: fID,
					selectValue: EDDData.CSources[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			if (row.cols[5] != 0) {
				rtd.innerHTML = "(" + row.cols[1] + "g/L)";
			}
			rtd.className = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[3];
			rtd.style.whiteSpace = "pre-wrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = "(" + row.cols[4] + ")";
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			CarbonSourceField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.CSourceIDs.length; x++) {
				var id = EDDData.CSourceIDs[x];
				var rec = EDDData.CSources[id];
				var carbon = rec._l.carbon;
				var labeling = rec._l.labeling;

				if (vl == rec._l.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					continue;
				}
				if (highestMatchQuality >= 0.9) {continue;}
				if (vl.indexOf(rec._l.selectString) >= 0) {
					highestMatchQuality = 0.9;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.8) {continue;}
				if (vl == carbon + " : " + labeling) {
					highestMatchQuality = 0.8;
					bestMatchSoFar = id;
					continue;
				}
				if (highestMatchQuality >= 0.7) {continue;}
				if (vl == carbon) {
					highestMatchQuality = 0.7;
					bestMatchSoFar = id;
					continue;
				}
			}

			return bestMatchSoFar;
		}


		resolveRecordIDToSelectString(id: number) {
			if (!id) {	return '';	}
			return EDDData.CSources[id].selectString;
		}
		

		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (CarbonSourceField.sourceDataPrepared && force == false) {
				return;
			}
			CarbonSourceField.sourceDataPrepared = true;

			if (EDDData.CSourceIDs) {
				for (var x=0; x < EDDData.CSourceIDs.length; x++) {
					var id = EDDData.CSourceIDs[x];
					var rec = EDDData.CSources[id];
					var cvol = rec.vol;
					var cvolint = parseInt(cvol, 10);
					var labeling = rec.labeling;
					var selectString = rec.carbon;
					if (cvolint != 0) { selectString = selectString + " (" + cvol + "g/L)"; }
					if (labeling != '') { selectString = selectString + " : " + labeling; }
					selectString = selectString + " (" + rec.initials + ")";
					rec.selectString = selectString;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			CarbonSourceField.cacheManager.flushCache();
		}


		createAddNewForm() {
			var tableObject = <HTMLElement>document.createElement("table");
			tableObject.className = "formTable";
			tableObject.setAttribute('cellspacing', "0");
			tableObject.style.margin = "9px 2px 7px 9px";
			this.formDiv.appendChild(tableObject);

			var tBodyObject = <HTMLElement>document.createElement("tbody");
			tableObject.appendChild(tBodyObject);

				var rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);
	
					var rtd = document.createElement("td");
					rtd.innerHTML = "<span>Carbon Source:</span>";
					rtr.appendChild(rtd);
		
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var sourceField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['sourceField'] = sourceField;
						this.formInputElementsSet.push(sourceField);
						sourceField.setAttribute('type', "text");
						sourceField.setAttribute('id', this.inputElement.id + "inlineCSourceSource");
						sourceField.setAttribute('name', "newcsourcesource");
						sourceField.setAttribute('size', "40");
						rtd.appendChild(sourceField);
	
				rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);
	
					rtd = document.createElement("td");
					rtd.innerHTML = "<span>Volume:</span>";
					rtr.appendChild(rtd);
	
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var volField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['volField'] = volField;
						this.formInputElementsSet.push(volField);
						volField.setAttribute('type', "text");
						volField.setAttribute('id', this.inputElement.id + "inlineCSourceVolume");
						volField.setAttribute('name', "newcsourcevolume");
						volField.setAttribute('size', "5");
						rtd.appendChild(volField);
	
						rtd.appendChild(document.createTextNode("g/L"));
	
				rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);
	
					rtd = document.createElement("td");
					rtd.innerHTML = "<span>Labeling:</span>";
					rtr.appendChild(rtd);
	
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var labelingField = <HTMLInputElement>document.createElement("input");
						this.formInputElements['labelingField'] = labelingField;
						this.formInputElementsSet.push(labelingField);
						labelingField.setAttribute('type', "text");
						labelingField.setAttribute('id', this.inputElement.id + "inlineCSourceLabeling");
						labelingField.setAttribute('name', "newcsourcelabeling");
						labelingField.setAttribute('size', "60");
						labelingField.style.width = "321px";
						rtd.appendChild(labelingField);
	
				rtr = document.createElement("tr");
				tBodyObject.appendChild(rtr);
	
					rtd = document.createElement("td");
					rtd.innerHTML = "<span>Notes:</span>";
					rtr.appendChild(rtd);
	
					rtd = document.createElement("td");
					rtr.appendChild(rtd);
	
						var notesField = <HTMLTextAreaElement>document.createElement("textarea");
						this.formInputElements['notesField'] = notesField;
						this.formInputElementsSet.push(notesField);
						notesField.setAttribute('rows', "3");
						notesField.setAttribute('cols', "44");
						notesField.setAttribute('id', this.inputElement.id + "inlineCSourceNotes");
						notesField.setAttribute('name', "newcsourcenotes");
						notesField.style.height = "4em";
						notesField.style.width = "323px";
						rtd.appendChild(notesField);
		}


		populateAddNewFormFields(v: number) {
			this.formInputElements['sourceField'].value = EDDData.CSources[v].carbon;
			this.formInputElements['volField'].value = EDDData.CSources[v].vol;
			this.formInputElements['labelingField'].value = EDDData.CSources[v].labeling;
			this.formInputElements['notesField'].value = EDDData.CSources[v].ainfo;
		}


		addNewResultsSetRecord(data: any) {
			EDDData.CSources[data.newid] = data.newrecord;
			EDDData.EnabledCSourceIDs = data.newidlist;
			EDDData.CSourceIDs.push(data.newid);
			CarbonSourceField.prepareSourceData(true);	// Force rebuild and cache flush
		}
	}



    export interface ExchangeFieldValue extends InputFieldValue {}
	export class ExchangeField extends InputFieldTemplate<ExchangeFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<ExchangeFieldValue> = new QueryCacheManager<ExchangeFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			ExchangeField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = false;
			this.selectOnly = false;
			this.mustMatch = true;
			this.delay = 320;
			this.width = 825;
			this.maxItemsToShow = 200;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):ExchangeFieldValue[] {
			return ExchangeField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:ExchangeFieldValue[]):void {
			ExchangeField.cacheManager.cache(query, data);
		}


		searchFunction(queries:string[], callback:(data:ExchangeFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.ExchangeIDs.length; x++) {
				var fID = EDDData.ExchangeIDs[x];
				var exid = EDDData.Exchanges[fID].exid;
				var exn = EDDData.Exchanges[fID].exn;
				var rid = EDDData.Exchanges[fID].rid;
				var cp = EDDData.Exchanges[fID].cp;

				var uCols = [rid, exid, exn];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(rid, exid, exn));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}
				// We want to display the currently paired measurement - if any - but not search it.
				// So we push it onto the record after stringSearch is called.
				uCols.push(cp);

				var uRecord = {
					id: fID,
					selectValue: EDDData.Exchanges[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[1];
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[2];
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			if (row.cols[3] != 0) {
				rtd.innerHTML = "(Currently matched with: " + row.cols[3] + ")";
			}
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			ExchangeField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.ExchangeIDs.length; x++) {
				var id = EDDData.ExchangeIDs[x];
				var rec = EDDData.Exchanges[id];
				// We want an exact match here, or none at all.
				// (Partial matching against some unplanned Exchange is actually more damaging to flux results than just
				// leaving out the value we're trying to embed.)
				if (v == rec.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					break;
				}
			}

			return bestMatchSoFar;
		}


		// Not presently used anywhere.  Needs implementing if used.
		resolveRecordIDToSelectString(id: number) {
			return '';
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (ExchangeField.sourceDataPrepared && force == false) {
				return;
			}
			ExchangeField.sourceDataPrepared = true;

			if (EDDData.ExchangeIDs) {
				for (var x=0; x < EDDData.ExchangeIDs.length; x++) {
					var id = EDDData.ExchangeIDs[x];
					var rec = EDDData.Exchanges[id];
					rec.selectString = rec.exid;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			ExchangeField.cacheManager.flushCache();
		}
	}



    export interface SpeciesFieldValue extends InputFieldValue {}
	export class SpeciesField extends InputFieldTemplate<SpeciesFieldValue> {
		// Each type of autocomplete field gets a separate cache area.
		// All autocomplete fields of the same type share one cache area between them.
		static cacheManager : QueryCacheManager<SpeciesFieldValue> = new QueryCacheManager<SpeciesFieldValue>();
		static sourceDataPrepared : boolean = false;


		constructor(inputElement: HTMLInputElement) {		
			super(inputElement);
			SpeciesField.prepareSourceData(false);
		}


		configure() {
			super.configure();
			this.selectFirst = false;
			this.selectOnly = false;
			this.mustMatch = true;
			this.delay = 320;
			this.width = 825;
			this.maxItemsToShow = 150;
		}


		// Passing call onward to the cache object for the whole subclass 
		loadFromCache(query:string):SpeciesFieldValue[] {		
			return SpeciesField.cacheManager.cache(query);
		}
		

		addToCache(query:string, data:SpeciesFieldValue[]):void {
			SpeciesField.cacheManager.cache(query, data);
		}


		searchFunction(queries:string[], callback:(data:SpeciesFieldValue[])=>void):void {
			var resultsRecords = [];
			for (var x=0; x < EDDData.SpeciesIDs.length; x++) {
				var fID = EDDData.SpeciesIDs[x];
				var sid = EDDData.Species[fID].sid;
				var spn = EDDData.Species[fID].spn;
				var cp = EDDData.Species[fID].cp;

				var uCols = [sid, spn];

				// If the query is blank, send everything, unformatted.  Otherwise, attempt a match
				if (queries && queries.length > 0) {
                    var results = (new Search(queries)).search(SearchSegment.create(sid, spn));
					if (!results.matched) continue;
					uCols = results.segmentStrings;
				}
				// We want to display the currently paired measurement - if any - but not search it.
				// So we push it onto the record after stringSearch is called.
				uCols.push(cp);

				var uRecord = {
					id: fID,
					selectValue: EDDData.Species[fID].selectString,
					cols: uCols
				};
				resultsRecords.push(uRecord);
			}
			callback(resultsRecords);
		}


		formatItemFunction(rtr, row, i:number, num:number) {
			if (!row) return rtr;

			var rtd = document.createElement("td");
			rtd.innerHTML = row.cols[0];
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			rtd.innerHTML = row.cols[1];
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			rtd = document.createElement("td");
			if (row.cols[2] != 0) {
				rtd.innerHTML = "(Currently matched with: " + row.cols[2] + ")";
			}
			rtd.style.whiteSpace = "nowrap";
			rtr.appendChild(rtd);

			return rtr;
		}


		searchForClosestRecordMatch(v: string) {

			if (v == "") {	return 0;	}

			// If we make this static, we'll need to do this
			SpeciesField.prepareSourceData(false);

			var vl = v.toLowerCase();
			var vlWordRegex = new RegExp('(^|\\W)' + vl + '(\\W|$)', 'gi');

			var exactMatches = [];	// We're not using this so far...
			var bestMatchSoFar:number = 0;
			var mostMatchedCharsSoFar = 0;

			var highestMatchQuality = 0;

			for (var x=0; x < EDDData.SpeciesIDs.length; x++) {
				var id = EDDData.SpeciesIDs[x];
				var rec = EDDData.Species[id];
				// We want an exact match here, or none at all.
				if (v == rec.selectString) {
					highestMatchQuality = 1;
					bestMatchSoFar = id;
					exactMatches.push(id);
					break;
				}
			}

			return bestMatchSoFar;
		}


		// Not presently used anywhere.  Needs implementing if used.
		resolveRecordIDToSelectString(id: number) {
			return '';
		}


		// Make sure we've created all our stringified records.
		// (This affects global data so it will only be run once per data type.)
		static prepareSourceData(force:boolean) {
			if (SpeciesField.sourceDataPrepared && force == false) {
				return;
			}
			SpeciesField.sourceDataPrepared = true;

			if (EDDData.SpeciesIDs) {
				for (var x=0; x < EDDData.SpeciesIDs.length; x++) {
					var id = EDDData.SpeciesIDs[x];
					var rec = EDDData.Species[id];
					rec.selectString = rec.sid;
					InputFieldTemplate.createLowercaseForStrings(rec);
				}
			}
			SpeciesField.cacheManager.flushCache();
		}
	}


	export function initializeAllPageElements() {

		if (!document.getElementById || !document.createTextNode) {return;}
		// Locate any input fields in the page, and initialize them if applicable.
		var ins = document.getElementsByTagName('input');
		for (var i=0; i<ins.length; i++) {
			var input = ins[i];
			EDDAutoComplete.initializeElement(input);
		}
	}


	export function initializeElement(input: HTMLInputElement) {

		if (!$(input).hasClass("autocomplete")) { return; }
		var acType = input.getAttribute("autocompletetype");
		if (!acType) { return; }

		if (acType == 'user') {
			new UserField(input);

		} else if (acType == 'email') {
			new EmailField(input);

		} else if (acType == 'metabolite') {
			new MetaboliteField(input);

		} else if (acType == 'metadatatype') {
			new MetaDataField(input);

		} else if (acType == 'measurementcompartment') {
			new CompartmentField(input);

		} else if (acType == 'units') {
			new UnitsField(input);

		} else if (acType == 'labeling') { // Defunct for now
			new LabelingField(input);

		} else if (acType == 'strain') {
			new StrainField(input);

		} else if (acType == 'carbonsource') {
			new CarbonSourceField(input);

		} else if (acType == 'exchange') {
			new ExchangeField(input);

		} else if (acType == 'species') {
			new SpeciesField(input);

		} else {
			return; // Skip creation if we didn't get a match
		}
	}
	
	
	export function createAutoCompleteContainer(autoType, elementSize, elementName, stringValue, hiddenValue) {

		var inHiddenInObject = <HTMLInputElement>document.createElement("input");
		inHiddenInObject.setAttribute('type', "hidden");
		inHiddenInObject.setAttribute('id', elementName + "Value");
		inHiddenInObject.setAttribute('name', elementName + "Value");
		inHiddenInObject.setAttribute('value', hiddenValue);

		var inObject = document.createElement("input");
		inObject.className = 'autocomplete';
		inObject.setAttribute('type', "text");
		inObject.setAttribute('autocomplete', "off");
		inObject.setAttribute('autocompletetype', autoType);
		inObject.setAttribute('size', elementSize);
		inObject.setAttribute('autocompletevalue', elementName + "Value");
		inObject.setAttribute('name', elementName);
		inObject.setAttribute('id', elementName);
		inObject.setAttribute('value', stringValue);

		var mTypeAutocomplete = {
			type: autoType,
			initialized: 0,
			setByUser: 0,
			startString: stringValue,
			startIndex: hiddenValue,
			name: elementName,
			inputElement: inObject,
			hiddenInputElement: inHiddenInObject
		};
		return mTypeAutocomplete;
	}
}	


// A little expansion of the jQuery repertoire:
jQuery.fn.indexOf = function(e){
	for( var i=0; i<this.length; i++ ){
		if( this[i] == e ) return i;
	}
	return -1;
};


window.addEventListener('load', EDDAutoComplete.initializeAllPageElements, false);
