/// <reference path="typescript-declarations.d.ts" />
/// <reference path="lib/jquery.d.ts" />
/// <reference path="Utl.ts" />

declare var EDD_auto:any;

module EditableElements {

	// Declare the LiveTextEdit class
	export class EditableElement {

		options:any;	// Keep around a copy of the 'options' in case there is extra info there
		element:HTMLElement;
        $element:JQuery;
		type:string;

		inputElement:any;
		editButtonElement:HTMLElement;
		acceptButtonElement:HTMLElement;
		cancelButtonElement:HTMLElement;
		waitButtonElement:HTMLElement;
		editControlsPositioner:any;
		editControlsContainer:any;

		editAllowedFn:{(e:EditableElement):boolean};
		getValueFn:{(e:EditableElement):any};
		setValueFn:{(e:EditableElement, v:any):void};
		makeFormDataFn:{(e:EditableElement, v:any):any};
		showValueFn:any;	// Optional

		tableCellMode:boolean;

		static _prevEditableElement:any = null;
		static _uniqueIndex:any = 1;


		constructor(opt:any) {

			Utl.JS.assert(opt, "EditableElement needs to be supplied with options.");
			this.options = opt;

			// First thing we need to do is locate the element we're making editable
			if (opt.element) {
				this.element = opt.element;
			} else {
				Utl.JS.assert(opt.id, "EditableElement needs an element or an elementID in options.");
				Utl.JS.assert(document.getElementById(opt.id) ? true : false,
					"EditableElement cannot find element ID " + opt.id);
				this.element = document.getElementById(opt.id);
			}
			this.$element = $(this.element);

			// Next we extract all the defined getter and setter functions from the options.
			// Two are mandatory - the one that gets the raw value to edit, and the one that builds an AJAX URL
			// for submitting the edit to the server.  Without both of these, there's no point in making an EditableElement.
			Utl.JS.assert(opt.getValue, "EditableElement needs a getValue function.");
			this.getValueFn = opt.getValue;
			Utl.JS.assert(opt.makeFormData, "EditableElement needs a makeFormData function.");
			this.makeFormDataFn = opt.makeFormData;
			this.editAllowedFn = opt.editAllowed || function(e) {return true;};
			this.setValueFn = opt.setValue || function(e, v) {return;};
			this.showValueFn = opt.showValue || null;

			// Check whether the element is a table cell - this will alter the way we build the UI
			var tn:string = (this.element.nodeType == 1) ? this.element.tagName.toLowerCase() : 'x';
			this.tableCellMode = (tn == "td") ? true : false;
			// For example, in editing mode we will hang the buttons off the edge of the cell instead
			// of allocating space inside it.
			// There is a whole complex of CSS specifications that support these differing layouts.

			this.inputElement = null;

			this.setUpMainElement();
			this.generateControlsContainer();
			this.generateControlButtons();
			
			this.setUpEditableMode();
			this.$element.click(this.clickToEditHandler);
		}


		// This is called one time to do any necessary manipulation of the main element
		// during setup.
		setUpMainElement() {
			// The "verticalButtons" class changes the styling of the buttons,
			// as well as the styling of the main element itself.
			// For example it gives each button a style of "block" instead of "inline-block",
			// preventing the buttons from appearing side-by-side.
			this.$element.addClass('verticalButtons');
		}


		// Generate a container for the editing buttons(s), and a positioning element to
		// put the controls in the right place relative to the main element.
		generateControlsContainer() {
			// In div mode, the container is a float-right span that appears at the right edge
			// of the cell in the layout, and the icons consume space within.

			// In table-cell mode, the container is a float-right span that appears at the right edge
			// of the cell in the layout, with the icon(s) absolute-positioned relative to it.
			// Icons can be positioned outside or under the cell in this mode.
			var c:HTMLElement = document.createElement("span");
			c.className = "icon-positioner";
			this.editControlsPositioner = c;

			var d:HTMLElement = document.createElement("span");
			d.className = "icon-container";
			this.editControlsContainer = d;

			c.appendChild(d);
		}


		// Instantiates and stores all the buttons used in the controls container for later use
		generateControlButtons() {
			this.editButtonElement = document.createElement("span");
			this.editButtonElement.className = "icon icon-edit";
			this.acceptButtonElement = document.createElement("span");
			this.acceptButtonElement.className = "icon icon-accept";
			this.cancelButtonElement = document.createElement("span");
			this.cancelButtonElement.className = "icon icon-cancel";
			this.waitButtonElement = document.createElement("span");
			this.waitButtonElement.className = "icon wait-faster";

			// When rendering contents that have been floated, some browsers will "magically" collapse anything
			// that doesn't contain non-whitespace text to 0 width, regardless of style settings.
			this.editButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));	// &nbsp;
			this.acceptButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
			this.cancelButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
			this.waitButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));

			this.cancelButtonElement.setAttribute('title', 'Click to cancel editing.\nYou can also cancel editing by pressing the ESC key.');

			$(this.acceptButtonElement).click(this.clickToAcceptHandler);
			$(this.cancelButtonElement).click(this.clickToCancelHandler);
		}


		// Changes the styling of the container element to indicate that editing is allowed,
		// and adds a mouse-over control to engage editing.
		setUpEditableMode() {
			this.$element.addClass('editable-field inactive').removeClass('active saving')
                .attr('title', 'click to edit');

			var c = this.editControlsPositioner;
			var p = this.element;
			// We want this to be the first element so the vertical height of the rest of the content
			// doesn't cause it to float farther down side of the cell.
			if (p.firstChild) {
				if (p.firstChild != c) {
					p.insertBefore(c, p.firstChild);
				}
			} else {
				p.appendChild(c);
			}

			while (this.editControlsContainer.firstChild) {
				this.editControlsContainer.removeChild(this.editControlsContainer.firstChild);
			}
			this.editControlsContainer.appendChild(this.editButtonElement);
		}


		// Instantiates the form element(s) used when editing is taking place,
		// with appropriate event handlers and styling, and adds them to the
		// container element.
		setUpEditingMode() {
			var pThis = this;

			this.$element.removeClass('inactive saving').addClass('active');

			// Figure out how high to make the text edit box.
			var desiredFontSize = this.$element.css("font-size");
			var lineHeight = parseInt( desiredFontSize, 10 );
			var desiredNumLines = this.$element.height() / lineHeight;
			desiredNumLines = Math.floor(desiredNumLines) + 1;
			if (this.options.minimumRows) {
				if (desiredNumLines < this.options.minimumRows) {
					desiredNumLines = this.options.minimumRows;
				}
			}
			if (this.options.maximumRows) {
				if (desiredNumLines > this.options.maximumRows) {
					desiredNumLines = this.options.maximumRows;
				}
			}

			// Create an input field that the user can edit with.
			var i = document.createElement("textarea");
			this.inputElement = i;

			i.type = "text";
			i.value = this.getValueFn(this);

			// Copy font attributes from our underlying control.
			$(i).css( "font-family", this.$element.css("font-family") );
			$(i).css( "font-size", desiredFontSize );

			// Set width and height.
			i.style.width = "100%";
			$(i).attr('rows', desiredNumLines)
			// Compel the enclosing div to be 100% width as well, so our textarea gets
			// the maximum available space
			if (!this.tableCellMode) {
				this.element.style.width = "100%";
			}

			this.clearElementForEditing();
			this.element.appendChild(i);

			// Remember what we're editing in case they cancel or move to another element
			EditableElement._prevEditableElement = this;

			// Set focus to the new input element ASAP after the click handler.
			// We can't just do this in here because the browser won't actually set the focus,
			// presumably because it thinks the focus should be in what was just clicked on.
			window.setTimeout(function() {
				pThis.inputElement.focus();
			}, 0);
			this.setUpESCHandler();

			// Handle special keys like enter and escape.
			i.onkeydown = function(e) {
				if (e.which == 13) {
					// ENTER key. Commit the changes.
					pThis.commitEdit();
				}
			};

			// TODO: Handle losing focus (in which case we commit changes).
		}


		// Support function for setUpEditingMode.
		// Takes the container element that we are using as an editable element,
		// and clears it of all content, then re-adds the basic edit control widgets.
		clearElementForEditing() {
			// Clear the element out
			while (this.element.firstChild) {
				this.element.removeChild(this.element.firstChild);
			}
			// Re-add the controls area
			this.element.appendChild(this.editControlsPositioner);
			while (this.editControlsContainer.firstChild) {
				this.editControlsContainer.removeChild(this.editControlsContainer.firstChild);
			}
			this.editControlsContainer.appendChild(this.acceptButtonElement);
			this.editControlsContainer.appendChild(this.cancelButtonElement);
			//this.editButtonElement.className = "icon icon-edit";
			this.element.removeAttribute('title');
		}


		clickToEditHandler=()=>{
			if (EditableElement._prevEditableElement != null) {
				if (this == EditableElement._prevEditableElement) {
					// They're already editing this element. Don't re-setup everything.
					// Returning true lets the system handle this mouse click.
					return true;
				} else {
					// They were already editing something, so revert those changes.
					EditableElement._prevEditableElement.cancelEditing();
					EditableElement._prevEditableElement = null;
				}
			}
			this.setUpEditingMode();
			// Returning false means to stop handling the mouse click, which respects our inputElement.select() call.
			return false;
		}


		clickToAcceptHandler=()=>{
			this.commitEdit();
			// Stop handling the mouse click
			return false;
		}


		clickToCancelHandler=()=>{
			this.cancelEditing();
			// Stop handling the mouse click
			return false;
		}


		setUpESCHandler() {
			document.addEventListener('keydown', this.keyESCHandler);
		}


		removeESCHandler() {
			document.removeEventListener('keydown', this.keyESCHandler);
		}


		keyESCHandler=(e)=>{
			if (e.which == 27) {
				// ESCAPE key. Cancel out.
				this.cancelEditing();
			}
		}


		cancelEditing() {
			var pThis = this;
			var element = this.element;

			this.removeESCHandler();

			// Remove the input box.
			if (this.inputElement) {
				element.removeChild(this.inputElement);
			}
			// If we're not in table cell mode, we probably manipulated the size of the
			// container element to give the maximum available space for editing.
			// We should attempt to reset that.
			// We can't just read the old width out and save it, then re-insert it now, because
			// that may permanently fix the element at a width that it may have only had
			// before because of external layout factors.
			if (!this.tableCellMode) {
				this.element.style.width = '';
			}

			// Restore the content.
			if (this.showValueFn) {
				element.innerHTML = this.showValueFn(this, element);
			} else {
				this.setEditedFieldContent();
			}
			// Re-add the default editing widgetry
			this.setUpEditableMode();
			EditableElement._prevEditableElement = null;
		}


		commitEdit() {
			var pThis = this;
			var element = this.element;

			// Extract the new value
			var value = this.getEditedValue();
			var formData = this.makeFormDataFn(this, value);

			this.setUpCommittingIndicator();

			// $.ajax({
			// 	type: "POST",
			// 	dataType: "json",
			// 	url: "FormAjaxResp.cgi", 
			// 	data: formData,
			// 	success: function( response ) {
			// 		if (response.type == "Success") {
			// 			pThis.setValueFn(pThis, value);
			// 		} else {
			// 			alert("Error: " + response.message);
			// 		}
			// 		pThis.cancelEditing();
			// 	}
			// });
		}


		// This changes the UI to a third state called 'saving' that is different from 'active' or 'inactive'.
		setUpCommittingIndicator() {
			while (this.editControlsContainer.firstChild) {
				this.editControlsContainer.removeChild(this.editControlsContainer.firstChild);
			}
			this.editControlsContainer.appendChild(this.waitButtonElement);
			this.$element.removeClass('active inactive').addClass('saving');
		}


		getEditedValue():any {
			return this.inputElement.value;
		}


		setEditedFieldContent():any {
			var e = this.element;
			while (e.firstChild) {
				e.removeChild(e.firstChild);
			}
			e.appendChild(document.createTextNode(this.getValueFn(this)));
		}
	}



	export class EditableAutocomplete extends EditableElement {

		autoCompleteObject:any;


		constructor(inputElement: HTMLElement) {		
			super(inputElement);
			this.autoCompleteObject = null;
		}


		setUpMainElement() {
			this.$element.addClass('horizontalButtons');
		}


		// Override this with your specific autocomplete type
		createAutoCompleteObject() {
			// Create an input field that the user can edit with.
			var auto = EDD_auto.create_autocomplete(this.element);
			auto.attr('name', 'editElem' + EditableElement._uniqueIndex).val(this.getValueFn(this));
			EDD_auto.setup_field_autocomplete(auto, 'User', EDDData.Users || {});
			return auto;
		}


		// This either returns a reference to the autocomplete object,
		// or if necessary, creates a new one and prepares it, then returns it.
		getAutoCompleteObject() {
			if (this.autoCompleteObject) {
				return this.autoCompleteObject;
			}
			var auto = this.createAutoCompleteObject();
			EditableElement._uniqueIndex += 1;
			// Copy font attributes from our underlying control.
			$(auto).css({
                "font-family": this.$element.css("font-family"),
                "font-size": this.$element.css("font-size")
            });
			this.autoCompleteObject = auto;
			return auto;
		}


		setUpEditingMode() {
			var pThis = this;
			var auto = this.getAutoCompleteObject();	// Calling this may set it up for the first time
			this.$element.removeClass('inactive saving').addClass('active');
			this.inputElement = auto[0];
			this.clearElementForEditing();
			auto.val(this.getValueFn(this));
			// Remember what we're editing in case they cancel or move to another element
			EditableElement._prevEditableElement = this;
			// Set focus to the new input element ASAP after the click handler.
			// We can't just do this in here because the browser won't actually set the focus,
			// presumably because it thinks the focus should be in what was just clicked on.
			window.setTimeout(auto.focus.bind(auto), 0);
			this.setUpESCHandler();
			// Handle special keys like enter
			auto.on('keydown', (e:JQueryKeyEventObject) => {
				if (e.which == 13) { // 13 === ENTER
					this.commitEdit();
				}
			}).on('blur', () => this.commitEdit());
		}


		getEditedValue():any {			
			return this.getAutoCompleteObject().val();
		}


		setEditedFieldContent():any {
			var value = this.getEditedValue();
			$(this.element).empty().text(value);
		}
	}



	export class EditableEmail extends EditableAutocomplete {
		// Override this with your specific autocomplete type
		createAutoCompleteObject() {
			// Create an input field that the user can edit with.
			var auto = EDD_auto.create_autocomplete(this.element);
			auto.attr('name', 'editElem' + EditableElement._uniqueIndex).val(this.getValueFn(this));
			EDD_auto.setup_field_autocomplete(auto, 'User', EDDData.Users || {});
			return auto;
		}
	}



	export class EditableStrain extends EditableAutocomplete {
		// Override this with your specific autocomplete type
		createAutoCompleteObject() {
			// Create an input field that the user can edit with.
			var auto = EDD_auto.create_autocomplete(this.element);
			auto.attr('name', 'editElem' + EditableElement._uniqueIndex).val(this.getValueFn(this));
			EDD_auto.setup_field_autocomplete(auto, 'Strain', EDDData.Strains || {});
			return auto;
		}
	}



	export function initializeElement(options:any) {

		var type = options.type;
		if (!type) { return; }

		if (type == 'text') {	// Ordinary text - display a text field, no special behaviors
			new EditableElement(options);

		} else if (type == 'email') {
			new EditableEmail(options);

		} else if (type == 'user') {
//			new EmailField(options);

		} else if (type == 'metabolite') {
//			new MetaboliteField(options);

		} else if (type == 'metadatatype') {
//			new MetaDataField(options);

		} else if (type == 'measurementcompartment') {
//			new CompartmentField(options);

		} else if (type == 'units') {
//			new UnitsField(options);

		} else if (type == 'labeling') { // Defunct for now
//			new LabelingField(options);

		} else if (type == 'strain') {
//			new StrainField(options);

		} else if (type == 'carbonsource') {
//			new CarbonSourceField(options);

		} else if (type == 'exchange') {
//			new ExchangeField(options);

		} else if (type == 'species') {
//			new SpeciesField(options);

		} else {
			return; // Skip creation if we didn't get a match
		}
	}


	export function initializeElements(optionSet:any) {
	 	for (var i=0; i < optionSet.length; i++) {	
			var options = optionSet[i];
			EditableElements.initializeElement(options);
		}
	}
}

