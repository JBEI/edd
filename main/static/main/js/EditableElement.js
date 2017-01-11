/// <reference path="typescript-declarations.d.ts" />
/// <reference path="lib/jquery.d.ts" />
/// <reference path="Utl.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var EditableElements;
(function (EditableElements) {
    // Declare the LiveTextEdit class
    var EditableElement = (function () {
        function EditableElement(opt) {
            var _this = this;
            this.clickToEditHandler = function () {
                if (EditableElement._prevEditableElement != null) {
                    if (_this == EditableElement._prevEditableElement) {
                        // They're already editing this element. Don't re-setup everything.
                        // Returning true lets the system handle this mouse click.
                        return true;
                    }
                    else {
                        // They were already editing something, so revert those changes.
                        EditableElement._prevEditableElement.cancelEditing();
                        EditableElement._prevEditableElement = null;
                    }
                }
                _this.setUpEditingMode();
                // Returning false means to stop handling the mouse click, which respects our inputElement.select() call.
                return false;
            };
            this.clickToAcceptHandler = function () {
                _this.commitEdit();
                // Stop handling the mouse click
                return false;
            };
            this.clickToCancelHandler = function () {
                _this.cancelEditing();
                // Stop handling the mouse click
                return false;
            };
            this.keyESCHandler = function (e) {
                if (e.which == 27) {
                    // ESCAPE key. Cancel out.
                    _this.cancelEditing();
                }
            };
            Utl.JS.assert(opt, "EditableElement needs to be supplied with options.");
            this.options = opt;
            // First thing we need to do is locate the element we're making editable
            if (opt.element) {
                this.element = opt.element;
            }
            else {
                Utl.JS.assert(opt.id, "EditableElement needs an element or an elementID in options.");
                Utl.JS.assert(document.getElementById(opt.id) ? true : false, "EditableElement cannot find element ID " + opt.id);
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
            this.editAllowedFn = opt.editAllowed || function (e) {
                return true;
            };
            this.setValueFn = opt.setValue || function (e, v) {
                return;
            };
            this.showValueFn = opt.showValue || null;
            // Check whether the element is a table cell - this will alter the way we build the UI
            var tn = (this.element.nodeType == 1) ? this.element.tagName.toLowerCase() : 'x';
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
        EditableElement.prototype.setUpMainElement = function () {
            // The "verticalButtons" class changes the styling of the buttons,
            // as well as the styling of the main element itself.
            // For example it gives each button a style of "block" instead of "inline-block",
            // preventing the buttons from appearing side-by-side.
            this.$element.addClass('verticalButtons');
        };
        // Generate a container for the editing buttons(s), and a positioning element to
        // put the controls in the right place relative to the main element.
        EditableElement.prototype.generateControlsContainer = function () {
            // In div mode, the container is a float-right span that appears at the right edge
            // of the cell in the layout, and the icons consume space within.
            // In table-cell mode, the container is a float-right span that appears at the right edge
            // of the cell in the layout, with the icon(s) absolute-positioned relative to it.
            // Icons can be positioned outside or under the cell in this mode.
            var c = document.createElement("span");
            c.className = "icon-positioner";
            this.editControlsPositioner = c;
            var d = document.createElement("span");
            d.className = "icon-container";
            this.editControlsContainer = d;
            c.appendChild(d);
        };
        // Instantiates and stores all the buttons used in the controls container for later use
        EditableElement.prototype.generateControlButtons = function () {
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
            this.editButtonElement.appendChild(document.createTextNode(String.fromCharCode(160))); // &nbsp;
            this.acceptButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
            this.cancelButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
            this.waitButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
            this.cancelButtonElement.setAttribute('title', 'Click to cancel editing.\nYou can also cancel editing by pressing the ESC key.');
            $(this.acceptButtonElement).click(this.clickToAcceptHandler);
            $(this.cancelButtonElement).click(this.clickToCancelHandler);
        };
        // Changes the styling of the container element to indicate that editing is allowed,
        // and adds a mouse-over control to engage editing.
        EditableElement.prototype.setUpEditableMode = function () {
            this.$element.addClass('editable-field inactive').removeClass('active saving').attr('title', 'click to edit');
            var c = this.editControlsPositioner;
            var p = this.element;
            // We want this to be the first element so the vertical height of the rest of the content
            // doesn't cause it to float farther down side of the cell.
            if (p.firstChild) {
                if (p.firstChild != c) {
                    p.insertBefore(c, p.firstChild);
                }
            }
            else {
                p.appendChild(c);
            }
            while (this.editControlsContainer.firstChild) {
                this.editControlsContainer.removeChild(this.editControlsContainer.firstChild);
            }
            this.editControlsContainer.appendChild(this.editButtonElement);
        };
        // Instantiates the form element(s) used when editing is taking place,
        // with appropriate event handlers and styling, and adds them to the
        // container element.
        EditableElement.prototype.setUpEditingMode = function () {
            var pThis = this;
            this.$element.removeClass('inactive saving').addClass('active');
            // Figure out how high to make the text edit box.
            var desiredFontSize = this.$element.css("font-size");
            var lineHeight = parseInt(desiredFontSize, 10);
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
            $(i).css("font-family", this.$element.css("font-family"));
            $(i).css("font-size", desiredFontSize);
            // Set width and height.
            i.style.width = "100%";
            $(i).attr('rows', desiredNumLines);
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
            window.setTimeout(function () {
                pThis.inputElement.focus();
            }, 0);
            this.setUpESCHandler();
            // Handle special keys like enter and escape.
            i.onkeydown = function (e) {
                if (e.which == 13) {
                    // ENTER key. Commit the changes.
                    pThis.commitEdit();
                }
            };
            // TODO: Handle losing focus (in which case we commit changes).
        };
        // Support function for setUpEditingMode.
        // Takes the container element that we are using as an editable element,
        // and clears it of all content, then re-adds the basic edit control widgets.
        EditableElement.prototype.clearElementForEditing = function () {
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
        };
        EditableElement.prototype.setUpESCHandler = function () {
            document.addEventListener('keydown', this.keyESCHandler);
        };
        EditableElement.prototype.removeESCHandler = function () {
            document.removeEventListener('keydown', this.keyESCHandler);
        };
        EditableElement.prototype.cancelEditing = function () {
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
            }
            else {
                this.setEditedFieldContent();
            }
            // Re-add the default editing widgetry
            this.setUpEditableMode();
            EditableElement._prevEditableElement = null;
        };
        EditableElement.prototype.commitEdit = function () {
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
        };
        // This changes the UI to a third state called 'saving' that is different from 'active' or 'inactive'.
        EditableElement.prototype.setUpCommittingIndicator = function () {
            while (this.editControlsContainer.firstChild) {
                this.editControlsContainer.removeChild(this.editControlsContainer.firstChild);
            }
            this.editControlsContainer.appendChild(this.waitButtonElement);
            this.$element.removeClass('active inactive').addClass('saving');
        };
        EditableElement.prototype.getEditedValue = function () {
            return this.inputElement.value;
        };
        EditableElement.prototype.setEditedFieldContent = function () {
            var e = this.element;
            while (e.firstChild) {
                e.removeChild(e.firstChild);
            }
            e.appendChild(document.createTextNode(this.getValueFn(this)));
        };
        EditableElement._prevEditableElement = null;
        EditableElement._uniqueIndex = 1;
        return EditableElement;
    })();
    EditableElements.EditableElement = EditableElement;
    var EditableAutocomplete = (function (_super) {
        __extends(EditableAutocomplete, _super);
        function EditableAutocomplete(inputElement) {
            _super.call(this, inputElement);
            this.autoCompleteObject = null;
        }
        EditableAutocomplete.prototype.setUpMainElement = function () {
            this.$element.addClass('horizontalButtons');
        };
        // Override this with your specific autocomplete type
        EditableAutocomplete.prototype.createAutoCompleteObject = function () {
            // Create an input field that the user can edit with.
            var auto = EDD_auto.create_autocomplete(this.element);
            auto.attr('name', 'editElem' + EditableElement._uniqueIndex).val(this.getValueFn(this));
            EDD_auto.setup_field_autocomplete(auto, 'User', EDDData.Users || {});
            return auto;
        };
        // This either returns a reference to the autocomplete object,
        // or if necessary, creates a new one and prepares it, then returns it.
        EditableAutocomplete.prototype.getAutoCompleteObject = function () {
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
        };
        EditableAutocomplete.prototype.setUpEditingMode = function () {
            var _this = this;
            var pThis = this;
            var auto = this.getAutoCompleteObject(); // Calling this may set it up for the first time
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
            auto.on('keydown', function (e) {
                if (e.which == 13) {
                    _this.commitEdit();
                }
            }).on('blur', function () { return _this.commitEdit(); });
        };
        EditableAutocomplete.prototype.getEditedValue = function () {
            return this.getAutoCompleteObject().val();
        };
        EditableAutocomplete.prototype.setEditedFieldContent = function () {
            var value = this.getEditedValue();
            $(this.element).empty().text(value);
        };
        return EditableAutocomplete;
    })(EditableElement);
    EditableElements.EditableAutocomplete = EditableAutocomplete;
    var EditableEmail = (function (_super) {
        __extends(EditableEmail, _super);
        function EditableEmail() {
            _super.apply(this, arguments);
        }
        // Override this with your specific autocomplete type
        EditableEmail.prototype.createAutoCompleteObject = function () {
            // Create an input field that the user can edit with.
            var auto = EDD_auto.create_autocomplete(this.element);
            auto.attr('name', 'editElem' + EditableElement._uniqueIndex).val(this.getValueFn(this));
            EDD_auto.setup_field_autocomplete(auto, 'User', EDDData.Users || {});
            return auto;
        };
        return EditableEmail;
    })(EditableAutocomplete);
    EditableElements.EditableEmail = EditableEmail;
    var EditableStrain = (function (_super) {
        __extends(EditableStrain, _super);
        function EditableStrain() {
            _super.apply(this, arguments);
        }
        // Override this with your specific autocomplete type
        EditableStrain.prototype.createAutoCompleteObject = function () {
            // Create an input field that the user can edit with.
            var auto = EDD_auto.create_autocomplete(this.element);
            auto.attr('name', 'editElem' + EditableElement._uniqueIndex).val(this.getValueFn(this));
            EDD_auto.setup_field_autocomplete(auto, 'Strain', EDDData.Strains || {});
            return auto;
        };
        return EditableStrain;
    })(EditableAutocomplete);
    EditableElements.EditableStrain = EditableStrain;
    function initializeElement(options) {
        var type = options.type;
        if (!type) {
            return;
        }
        if (type == 'text') {
            new EditableElement(options);
        }
        else if (type == 'email') {
            new EditableEmail(options);
        }
        else if (type == 'user') {
        }
        else if (type == 'metabolite') {
        }
        else if (type == 'metadatatype') {
        }
        else if (type == 'measurementcompartment') {
        }
        else if (type == 'units') {
        }
        else if (type == 'labeling') {
        }
        else if (type == 'strain') {
        }
        else if (type == 'carbonsource') {
        }
        else if (type == 'exchange') {
        }
        else if (type == 'species') {
        }
        else {
            return; // Skip creation if we didn't get a match
        }
    }
    EditableElements.initializeElement = initializeElement;
    function initializeElements(optionSet) {
        for (var i = 0; i < optionSet.length; i++) {
            var options = optionSet[i];
            EditableElements.initializeElement(options);
        }
    }
    EditableElements.initializeElements = initializeElements;
})(EditableElements || (EditableElements = {}));
