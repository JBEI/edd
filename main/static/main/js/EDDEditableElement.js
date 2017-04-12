/// <reference path="typescript-declarations.d.ts" />
/// <reference path="EDDAutocomplete.ts" />
/// <reference path="Utl.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// Creates a div element with the given styling, optionally hidden by default,
// and provides a means to hide or show it.
var EDDEditable;
(function (EDDEditable) {
    // TODO: For editable fields built entirely on the front-end, with no
    // pre-existing input elements, we need a way to specify the default value.
    var EditableElement = (function () {
        // This constructor accepts a pre-existing editable element, in the form of
        // a div with the class 'editable-field', or a reference to a container
        // where the editable element will be created.
        //   It distinguishes the two cases by looking for the class 'editable-field'
        // on the provided element.
        //   If no element is provided, the class creates an element and assumes
        // it will be added to the DOM later by a call to its appendTo method, which
        // provides a parent element.
        function EditableElement(parentOrElement, style) {
            var _this = this;
            // If we've been given no element, make one.
            if (!parentOrElement) {
                this.elementJQ = $('<div/>').addClass(style || '');
                this.parentElement = null;
            }
            else if ($(parentOrElement).hasClass('editable-field')) {
                this.elementJQ = $(parentOrElement);
                this.parentElement = parentOrElement.parentElement;
            }
            else {
                this.parentElement = parentOrElement;
                var potentialField = $(parentOrElement).children('.editable-field').first();
                if (potentialField.length == 1) {
                    this.elementJQ = potentialField;
                }
                else {
                    // Styling will be set later with setDefaultStyling()
                    this.elementJQ = $('<div/>').addClass(style || '');
                    this.elementJQ.appendTo(parentOrElement);
                }
            }
            this.element = this.elementJQ.get(0);
            var id = EditableElement._uniqueIndex.toString();
            EditableElement._uniqueIndex += 1;
            this.id = id;
            this.elementJQ.data('edd', { 'editableelementobj': this });
            this.inputElement = null;
            this.minimumRows = null;
            this.maximumRows = null;
            // For attaching to the document
            this.keyESCHandler = function (e) {
                // ESCAPE key. Cancel out.
                if (e.which == 27) {
                    _this.cancelEditing();
                }
            };
            // For attaching to the input element
            this.keyEnterHandler = function (e) {
                // ENTER key. Commit the changes.
                if (e.which == 13) {
                    _this.beginEditCommit();
                }
            };
            this.setUpMainElement();
            this.generateControlsContainer();
            this.generateControlButtons();
            this.elementJQ.click(this.clickToEditHandler.bind(this));
            // If the element is styled to be active while we're setting it up,
            // assume that we should immediately enter 'edit' mode.
            // Note that due to the cascading nature of the handler for triggering
            // editing mode, only one editable element on the page will actually
            // end up active - the last one styled as 'active' in the DOM.
            this.setDefaultStyling();
            if (this.elementJQ.hasClass('active')) {
                // If this returns true, then we have failed to activate the
                // element for editing for some reason.  Fall through to
                // setting the element as inactive.
                if (this.clickToEditHandler()) {
                    this.setInactiveStyling();
                }
            }
            else {
                this.setInactiveStyling();
            }
        }
        EditableElement.prototype.editAllowed = function () {
            return true;
        };
        EditableElement.prototype.canCommit = function (value) {
            return true;
        };
        EditableElement.prototype.getValue = function () {
            return '';
        };
        EditableElement.prototype.setValue = function (value) {
        };
        EditableElement.prototype.onSuccess = function (value) {
        };
        EditableElement.prototype.blankLabel = function () {
            return '(click to set)';
        };
        EditableElement.prototype.fillFormData = function (fd) {
            // look for a CSRF token anywhere in the page
            fd.append('csrfmiddlewaretoken', $('input[name=csrfmiddlewaretoken]').val());
            fd.append('value', this.getEditedValue());
            return fd;
        };
        EditableElement.prototype.formURL = function (url) {
            if (url === undefined) {
                return this._formURL || '';
            }
            this._formURL = url;
            return this;
        };
        EditableElement.prototype.showValue = function () {
            var e = this.element;
            this.elementJQ.children().detach();
            var v = this.getDisplayValue();
            var bl = this.blankLabel();
            if (bl && ((v === undefined) || (v == null) || (v == ''))) {
                e.innerHTML = '<span style="color:#888">' + bl + '</span>';
            }
            else {
                e.appendChild(document.createTextNode(v));
            }
        };
        // This is called one time to do any necessary manipulation of the main element
        // during setup.
        EditableElement.prototype.setUpMainElement = function () {
            // We need to locate, or create, an input element before
            // we decide which styling to apply to it.
            this.setupInputElement();
            if ($(this.inputElement).is('input')) {
                this.elementJQ.addClass('horizontalButtons');
            }
            else {
                // The "verticalButtons" class changes the styling of the buttons,
                // as well as the styling of the main element itself.
                // For example it gives each button a style of "block" instead of "inline-block",
                // preventing the buttons from appearing side-by-side.
                this.elementJQ.addClass('verticalButtons');
            }
        };
        // Generate a container for the editing buttons(s), and a positioning element to
        // put the controls in the right place relative to the main element.
        EditableElement.prototype.generateControlsContainer = function () {
            // The container is a float-right span that appears at the right edge
            // of the cell in the layout, and the icons consume space within.
            this.editControlsPositioner = $('<span class="icon-positioner"/>')[0];
            this.editControlsContainer = $('<span class="icon-container"/>')[0];
            this.editControlsPositioner.appendChild(this.editControlsContainer);
        };
        // Instantiates and stores all the buttons used in the controls container for later use
        EditableElement.prototype.generateControlButtons = function () {
            this.editButtonElement = $('<span class="icon icon-edit"/>')[0];
            this.acceptButtonElement = $('<span class="icon icon-accept"/>')[0];
            this.cancelButtonElement = $('<span class="icon icon-cancel"/>')[0];
            this.waitButtonElement = $('<span class="icon wait-faster"/>')[0];
            // When rendering contents that have been floated, some browsers will "magically" collapse anything
            // that doesn't contain non-whitespace text to 0 width, regardless of style settings.
            this.editButtonElement.appendChild(document.createTextNode(String.fromCharCode(160))); // &nbsp;
            this.acceptButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
            this.cancelButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
            this.waitButtonElement.appendChild(document.createTextNode(String.fromCharCode(160)));
            this.cancelButtonElement.setAttribute('title', 'Click to cancel editing.\nYou can also cancel editing by pressing the ESC key.');
            $(this.acceptButtonElement).click(this.clickToAcceptHandler.bind(this));
            $(this.cancelButtonElement).click(this.clickToCancelHandler.bind(this));
        };
        // Changes the styling of the container element to indicate that editing is allowed,
        // and adds a mouse-over control to engage editing.
        EditableElement.prototype.setInactiveStyling = function () {
            this.elementJQ.removeClass('active');
            this.elementJQ.addClass('inactive');
            $(this.editControlsContainer).children().detach();
            this.editControlsContainer.appendChild(this.editButtonElement);
        };
        // Changes the styling of the container element to indicate that editing is allowed,
        // and adds a mouse-over control to engage editing.
        EditableElement.prototype.setDefaultStyling = function () {
            this.elementJQ.addClass('editable-field');
            if (this.editAllowed()) {
                this.elementJQ.addClass('enabled');
            }
            else {
                this.elementJQ.removeClass('enabled');
            }
            this.elementJQ.removeClass('saving');
            this.element.setAttribute('title', 'click to edit');
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
        };
        // Instantiates the form element(s) used when editing is taking place,
        // with appropriate event handlers and styling, and adds them to the
        // container element.
        EditableElement.prototype.setUpEditingMode = function () {
            var pThis = this;
            this.elementJQ.removeClass('inactive');
            this.elementJQ.removeClass('saving');
            this.elementJQ.addClass('active');
            this.setupInputElement();
            this.clearElementForEditing();
            this.element.appendChild(this.inputElement);
            // Remember what we're editing in case they cancel or move to another element
            EditableElement._prevEditableElement = this;
            // Set focus to the new input element ASAP after the click handler.
            // We can't just do this in here because the browser will set the focus itself
            // after it's done handling the event that triggered this method.
            window.setTimeout(function () {
                pThis.inputElement.focus();
            }, 0);
            this.setUpKeyHandler();
            // TODO: Handle losing focus (in which case we commit changes?)
        };
        // Attempt to locate a pre-existing input element inside the
        // editable area, and if one is located, take its value as the
        // default value for the field.  If no element exists, make a new one,
        // and assume it should be a textarea.
        EditableElement.prototype.setupInputElement = function () {
            var desiredFontSize = this.elementJQ.css("font-size");
            if (!this.inputElement) {
                var potentialInput = this.elementJQ.children('input').first();
                if (potentialInput.length == 1) {
                    this.inputElement = potentialInput.get(0);
                }
                else {
                    // Figure out how high to make the text edit box.
                    var lineHeight = parseInt(desiredFontSize, 10);
                    var desiredNumLines = this.elementJQ.height() / lineHeight;
                    desiredNumLines = Math.floor(desiredNumLines) + 1;
                    if (this.minimumRows) {
                        desiredNumLines = Math.max(desiredNumLines, this.minimumRows);
                    }
                    if (this.maximumRows) {
                        desiredNumLines = Math.min(desiredNumLines, this.maximumRows);
                    }
                    if (desiredNumLines > 1) {
                        this.inputElement = document.createElement("textarea");
                        $(this.inputElement).attr('rows', desiredNumLines);
                    }
                    else {
                        this.inputElement = document.createElement("input");
                        this.inputElement.type = "text";
                    }
                    // Set width and height.
                    this.inputElement.style.width = "99%";
                    this.inputElement.value = this.getValue();
                }
                // Copy font attributes to match.
                $(this.inputElement).css("font-family", this.elementJQ.css("font-family"));
                $(this.inputElement).css("font-size", desiredFontSize);
            }
        };
        // Support function for setUpEditingMode.
        // Takes the container element that we are using as an editable element,
        // and clears it of all content, then re-adds the basic edit control widgets.
        EditableElement.prototype.clearElementForEditing = function () {
            // Clear the element out
            this.elementJQ.contents().detach(); // children() does not capture text nodes
            // Re-add the controls area
            this.element.appendChild(this.editControlsPositioner);
            $(this.editControlsContainer).children().detach();
            this.editControlsContainer.appendChild(this.acceptButtonElement);
            this.editControlsContainer.appendChild(this.cancelButtonElement);
            //this.editButtonElement.className = "icon icon-edit";
            this.element.removeAttribute('title');
        };
        EditableElement.prototype.clickToEditHandler = function () {
            if (!this.editAllowed()) {
                // Editing not allowed?  Then this has no effect.
                // Let the system handle this event.
                return true;
            }
            if (EditableElement._prevEditableElement != null) {
                if (this === EditableElement._prevEditableElement) {
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
            this.setUpEditingMode();
            // Returning false means to stop handling the mouse click, which respects our inputElement.select() call.
            return false;
        };
        EditableElement.prototype.cancelEditing = function () {
            var pThis = this;
            var element = this.element;
            this.removeKeyHandler();
            // Remove the input box.
            if (this.inputElement && this.inputElement.parentNode) {
                this.inputElement.parentNode.removeChild(this.inputElement);
            }
            // We manipulated the size of the
            // container element to give the maximum available space for editing.
            // We should attempt to reset that.
            // We can't just read the old width out and save it, then re-insert it now, because
            // that may permanently fix the element at a width that it may have only had
            // before because of external layout factors.
            //this.element.style.width = '';    // (Not doing this for now)
            // Restore the content.
            this.showValue();
            // Re-add the default editing widgetry
            this.setDefaultStyling();
            this.setInactiveStyling();
            EditableElement._prevEditableElement = null;
        };
        EditableElement.prototype.beginEditCommit = function () {
            var value = this.getEditedValue();
            if (!this.canCommit(value)) {
                return;
            }
            this.setUpCommittingIndicator();
            this.commit();
        };
        // Subclass this if your need a different submit behavior after the UI is set up.
        EditableElement.prototype.commit = function () {
            var debug = false;
            var value = this.getEditedValue();
            var pThis = this;
            var formData = this.fillFormData(new FormData());
            Utl.EDD.callAjax({
                'url': this.formURL(),
                'type': 'POST',
                'cache': false,
                'debug': debug,
                'data': formData,
                'success': function (response) {
                    if (response.type == "Success") {
                        pThis.setValue(value);
                        pThis.onSuccess(value);
                    }
                    else {
                        alert("Error: " + response.message);
                    }
                    pThis.cancelEditing();
                },
                'error': function (jqXHR, textStatus, errorThrown) {
                    if (debug) {
                        console.log(textStatus + ' ' + errorThrown);
                        console.log(jqXHR.responseText);
                    }
                    pThis.cancelEditing(); // TODO: Better reponse in UI for user
                }
            });
        };
        // This changes the UI to a third state called 'saving' that is different from 'active' or 'inactive'.
        EditableElement.prototype.setUpCommittingIndicator = function () {
            while (this.editControlsContainer.firstChild) {
                this.editControlsContainer.removeChild(this.editControlsContainer.firstChild);
            }
            this.editControlsContainer.appendChild(this.waitButtonElement);
            this.elementJQ.removeClass('active');
            this.elementJQ.removeClass('inactive');
            this.elementJQ.addClass('saving');
        };
        EditableElement.prototype.clickToAcceptHandler = function () {
            this.beginEditCommit();
            // Stop handling the mouse click
            return false;
        };
        EditableElement.prototype.clickToCancelHandler = function () {
            this.cancelEditing();
            // Stop handling the mouse click
            return false;
        };
        // Handle special keys like enter and escape.
        // We're doing it this way because we only ever want one
        // EditableElement responding to an ESC or an Enter at a time,
        // and this is actually less messy than attaching a generic
        // event handler to the document and then ferreting out the
        // intended object from the DOM.
        // There is no pollution from multiple handlers because every time we
        // add one, we remove the previous.  (See clickToEditHandler)
        EditableElement.prototype.setUpKeyHandler = function () {
            $(document).on('keydown', this.keyESCHandler);
            $(this.inputElement).on('keydown', this.keyEnterHandler);
        };
        EditableElement.prototype.removeKeyHandler = function () {
            $(document).off('keydown', this.keyESCHandler);
            $(this.inputElement).off('keydown', this.keyEnterHandler);
        };
        EditableElement.prototype.appendTo = function (el) {
            this.parentElement = el;
            el.appendChild(this.element);
        };
        EditableElement.prototype.appendChild = function (el) {
            this.element.appendChild(el);
        };
        EditableElement.prototype.clear = function () {
            while (this.element.lastChild) {
                $(this.element.lastChild).detach();
            }
        };
        EditableElement.prototype.visible = function (enable) {
            if (enable) {
                this.elementJQ.removeClass('off');
            }
            else {
                this.elementJQ.addClass('off');
            }
        };
        // Override if the value of the field needs to be post-processed before being displayed.
        EditableElement.prototype.getDisplayValue = function () {
            return this.getValue();
        };
        EditableElement.prototype.getEditedValue = function () {
            return this.inputElement.value;
        };
        EditableElement._uniqueIndex = 1;
        EditableElement._prevEditableElement = null;
        return EditableElement;
    }());
    EDDEditable.EditableElement = EditableElement;
    var EditableAutocomplete = (function (_super) {
        __extends(EditableAutocomplete, _super);
        function EditableAutocomplete(inputElement, style) {
            _super.call(this, inputElement, style);
            this.autoCompleteObject = null;
        }
        EditableAutocomplete.prototype.setUpMainElement = function () {
            this.elementJQ.addClass('horizontalButtons');
        };
        // Override this with your specific autocomplete type
        EditableAutocomplete.prototype.createAutoCompleteObject = function (opt) {
            // Create an input field that the user can edit with.
            return new EDDAuto.User($.extend({}, opt));
        };
        // This either returns a reference to the autocomplete object,
        // or if necessary, creates a new one and prepares it, then returns it.
        // TODO: For editable autocomplete fields built entirely on the front-end,
        // we need to pass down a default value.
        // Note that this does not do any type checking of pre-existing autocomplete
        // elements - that is, it does not check the eddautocompletetype attribute to
        // make sure that it matches the type that it will attempt to create.
        // For example, an EditableAutocomplete subclass for User will always assume
        // the input elements it finds are for a User autocomplete type.
        EditableAutocomplete.prototype.getAutoCompleteObject = function () {
            var visibleInput = this.elementJQ.children('input[type="text"].autocomp').first(); // ':first-of-type' would be wrong here
            var hiddenInput = this.elementJQ.children('input[type="hidden"]').first();
            var autoObject = null;
            if (this.autoCompleteObject) {
                return this.autoCompleteObject;
            }
            // If we found an input, we can check for an autocomplete object already attached to it.
            // This is required because EDDAuto.BaseAuto.initPreexisting() may have spidered through and
            // made one aleady.
            if (visibleInput.length !== 0) {
                var eddData = visibleInput.data('edd');
                if (eddData) {
                    autoObject = eddData.autocompleteobj;
                }
                if (!autoObject && (hiddenInput.length !== 0)) {
                    autoObject = this.createAutoCompleteObject({
                        container: this.elementJQ,
                        visibleInput: visibleInput,
                        hiddenInput: hiddenInput
                    });
                }
            }
            // If all else fails (one input missing, no eddData, or no autocompleteobj),
            // make a new object with new elements.
            if (!autoObject) {
                autoObject = this.createAutoCompleteObject({
                    container: this.elementJQ
                });
            }
            this.autoCompleteObject = autoObject;
            var el = autoObject.visibleInput;
            // Copy font attributes from our underlying control.
            $(el).css("font-family", this.elementJQ.css("font-family"));
            $(el).css("font-size", this.elementJQ.css("font-size"));
            //$(el).css("width", "100%");
            return autoObject;
        };
        EditableAutocomplete.prototype.setUpEditingMode = function () {
            var pThis = this;
            this.elementJQ.removeClass('inactive');
            this.elementJQ.removeClass('saving');
            this.elementJQ.addClass('active');
            var auto = this.getAutoCompleteObject(); // Calling this may set it up for the first time
            this.inputElement = auto.visibleInput;
            this.clearElementForEditing();
            this.element.appendChild(auto.visibleInput[0]);
            // Remember what we're editing in case they cancel or move to another element
            EditableElement._prevEditableElement = this;
            // Set focus to the new input element ASAP after the click handler.
            // We can't just do this in here because the browser won't actually set the focus,
            // presumably because it thinks the focus should be in what was just clicked on.
            window.setTimeout(function () {
                pThis.inputElement.focus();
            }, 0);
            this.setUpKeyHandler();
            // TODO: Handle losing focus (in which case we commit changes?)
        };
        // It is possible this will need to be altered further when subclassing EditableAutocomplete,
        // as some record string-equivalents can be ambiguous.
        EditableAutocomplete.prototype.getDisplayValue = function () {
            var auto = this.getAutoCompleteObject();
            return auto.visibleInput.val();
        };
        EditableAutocomplete.prototype.getEditedValue = function () {
            var auto = this.getAutoCompleteObject();
            return auto.val();
        };
        return EditableAutocomplete;
    }(EditableElement));
    EDDEditable.EditableAutocomplete = EditableAutocomplete;
    var EditableEmail = (function (_super) {
        __extends(EditableEmail, _super);
        function EditableEmail() {
            _super.apply(this, arguments);
        }
        // Override this with your specific autocomplete type
        EditableEmail.prototype.createAutoCompleteObject = function () {
            // Create an input field that the user can edit with.
            return new EDDAuto.User({
                container: this.elementJQ
            });
        };
        return EditableEmail;
    }(EditableAutocomplete));
    EDDEditable.EditableEmail = EditableEmail;
})(EDDEditable || (EDDEditable = {}));
