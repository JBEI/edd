// File last modified on: Wed May 31 2017 13:51:35  
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
            $(this.inputElement).show();
            if (this.element.id === 'editable-study-description') {
                if (typeof tinymce !== 'undefined') {
                    tinymce.init({
                        selector: '#editable-study-description textarea',
                        plugins: "link"
                    });
                }
            }
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
            if (typeof tinymce !== 'undefined') {
                tinymce.triggerSave();
            }
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
                        if (response.message.split(' ')[1] === "[u'description']" && value.length > 0) {
                            value = $.parseHTML(value);
                            pThis.cancelEditing();
                            $(pThis.element).text("");
                            $(pThis.element).append(value);
                        }
                        else {
                            pThis.setValue(value);
                            pThis.cancelEditing();
                        }
                    }
                    else {
                        alert("Error: " + response.message);
                    }
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
            if ($(this.element).attr('id') === 'editable-study-description') {
                if (typeof tinymce !== 'undefined') {
                    tinymce.remove();
                }
                var value = this.inputElement.value;
                this.cancelEditing();
                if (value) {
                    value = $(value);
                    //remove basic text because it might have html elements in it
                    $(this.element).text('');
                    $(this.element).append(value);
                }
            }
            else {
                this.cancelEditing();
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRURERWRpdGFibGVFbGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRURERWRpdGFibGVFbGVtZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFDckQsMkNBQTJDO0FBQzNDLCtCQUErQjs7Ozs7O0FBRy9CLDhFQUE4RTtBQUM5RSwyQ0FBMkM7QUFHM0MsSUFBTyxXQUFXLENBNHJCakI7QUE1ckJELFdBQU8sV0FBVyxFQUFDLENBQUM7SUFHaEIscUVBQXFFO0lBQ3JFLDJFQUEyRTtJQUMzRTtRQTJCSSwyRUFBMkU7UUFDM0UsdUVBQXVFO1FBQ3ZFLDhDQUE4QztRQUM5Qyw2RUFBNkU7UUFDN0UsMkJBQTJCO1FBQzNCLHdFQUF3RTtRQUN4RSw0RUFBNEU7UUFDNUUsNkJBQTZCO1FBQzdCLHlCQUFZLGVBQTRCLEVBQUUsS0FBYztZQW5DNUQsaUJBOGlCQztZQTFnQk8sNENBQTRDO1lBQzVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDbkQsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFHOUIsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLGFBQWEsR0FBRyxlQUFlLENBQUMsYUFBYSxDQUFDO1lBSXZELENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixJQUFJLENBQUMsYUFBYSxHQUFHLGVBQWUsQ0FBQztnQkFDckMsSUFBSSxjQUFj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RDtJQVRZLHlCQUFhLGdCQVN6QixDQUFBO0FBQ0wsQ0FBQyxFQTVyQk0sV0FBVyxLQUFYLFdBQVcsUUE0ckJqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGUgbGFzdCBtb2RpZmllZCBvbjogV2VkIE1heSAzMSAyMDE3IDEzOjUxOjM1ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJFRERBdXRvY29tcGxldGUudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG5cblxuLy8gQ3JlYXRlcyBhIGRpdiBlbGVtZW50IHdpdGggdGhlIGdpdmVuIHN0eWxpbmcsIG9wdGlvbmFsbHkgaGlkZGVuIGJ5IGRlZmF1bHQsXG4vLyBhbmQgcHJvdmlkZXMgYSBtZWFucyB0byBoaWRlIG9yIHNob3cgaXQuXG5cblxubW9kdWxlIEVEREVkaXRhYmxlIHtcblxuXG4gICAgLy8gVE9ETzogRm9yIGVkaXRhYmxlIGZpZWxkcyBidWlsdCBlbnRpcmVseSBvbiB0aGUgZnJvbnQtZW5kLCB3aXRoIG5vXG4gICAgLy8gcHJlLWV4aXN0aW5nIGlucHV0IGVsZW1lbnRzLCB3ZSBuZWVkIGEgd2F5IHRvIHNwZWNpZnkgdGhlIGRlZmF1bHQgdmFsdWUuXG4gICAgZXhwb3J0IGNsYXNzIEVkaXRhYmxlRWxlbWVudCB7XG5cbiAgICAgICAgc3RhdGljIF91bmlxdWVJbmRleCA9IDE7XG4gICAgICAgIHN0YXRpYyBfcHJldkVkaXRhYmxlRWxlbWVudDphbnkgPSBudWxsO1xuXG4gICAgICAgIHBhcmVudEVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgICAgIGVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgICAgIGVsZW1lbnRKUTpKUXVlcnk7XG5cbiAgICAgICAgaWQ6c3RyaW5nO1xuICAgICAgICBwcml2YXRlIF9mb3JtVVJMOiBzdHJpbmc7XG5cbiAgICAgICAgaW5wdXRFbGVtZW50OmFueTtcbiAgICAgICAgZWRpdEJ1dHRvbkVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgICAgIGFjY2VwdEJ1dHRvbkVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgICAgIGNhbmNlbEJ1dHRvbkVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG4gICAgICAgIHdhaXRCdXR0b25FbGVtZW50OkhUTUxFbGVtZW50O1xuICAgICAgICBlZGl0Q29udHJvbHNQb3NpdGlvbmVyOmFueTtcbiAgICAgICAgZWRpdENvbnRyb2xzQ29udGFpbmVyOmFueTtcbiAgICAgICAgbWluaW11bVJvd3M6IG51bWJlcjtcbiAgICAgICAgbWF4aW11bVJvd3M6IG51bWJlcjtcbiAgICAgICAgLy8gRGVjbGFyaW5nIHRoaXMgaW50byBhIHZhcmlhYmxlIGR1cmluZyBpbnN0YW50aWF0aW9uLFxuICAgICAgICAvLyBzbyB3aGUgY2FuIFwiLm9mZlwiIHRoZSBldmVudCB1c2luZyB0aGUgcmVmZXJlbmNlLlxuICAgICAgICBrZXlFU0NIYW5kbGVyOiBhbnk7XG4gICAgICAgIGtleUVudGVySGFuZGxlcjogYW55O1xuXG5cbiAgICAgICAgLy8gVGhpcyBjb25zdHJ1Y3RvciBhY2NlcHRzIGEgcHJlLWV4aXN0aW5nIGVkaXRhYmxlIGVsZW1lbnQsIGluIHRoZSBmb3JtIG9mXG4gICAgICAgIC8vIGEgZGl2IHdpdGggdGhlIGNsYXNzICdlZGl0YWJsZS1maWVsZCcsIG9yIGEgcmVmZXJlbmNlIHRvIGEgY29udGFpbmVyXG4gICAgICAgIC8vIHdoZXJlIHRoZSBlZGl0YWJsZSBlbGVtZW50IHdpbGwgYmUgY3JlYXRlZC5cbiAgICAgICAgLy8gICBJdCBkaXN0aW5ndWlzaGVzIHRoZSB0d28gY2FzZXMgYnkgbG9va2luZyBmb3IgdGhlIGNsYXNzICdlZGl0YWJsZS1maWVsZCdcbiAgICAgICAgLy8gb24gdGhlIHByb3ZpZGVkIGVsZW1lbnQuXG4gICAgICAgIC8vICAgSWYgbm8gZWxlbWVudCBpcyBwcm92aWRlZCwgdGhlIGNsYXNzIGNyZWF0ZXMgYW4gZWxlbWVudCBhbmQgYXNzdW1lc1xuICAgICAgICAvLyBpdCB3aWxsIGJlIGFkZGVkIHRvIHRoZSBET00gbGF0ZXIgYnkgYSBjYWxsIHRvIGl0cyBhcHBlbmRUbyBtZXRob2QsIHdoaWNoXG4gICAgICAgIC8vIHByb3ZpZGVzIGEgcGFyZW50IGVsZW1lbnQuXG4gICAgICAgIGNvbnN0cnVjdG9yKHBhcmVudE9yRWxlbWVudDogSFRNTEVsZW1lbnQsIHN0eWxlPzogc3RyaW5nKSB7XG4gICAgICAgICAgICAvLyBJZiB3ZSd2ZSBiZWVuIGdpdmVuIG5vIGVsZW1lbnQsIG1ha2Ugb25lLlxuICAgICAgICAgICAgaWYgKCFwYXJlbnRPckVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUSA9ICQoJzxkaXYvPicpLmFkZENsYXNzKHN0eWxlIHx8ICcnKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcmVudEVsZW1lbnQgPSBudWxsO1xuICAgICAgICAgICAgLy8gSWYgd2UgaGF2ZSBhbiBlbGVtZW50LCBhbmQgaXQgbG9va3MgbGlrZSBhbiBlZGl0YWJsZSBmaWVsZCxcbiAgICAgICAgICAgIC8vIHVzZSBpdCwgYW5kIGZpbmQgaXRzIHBhcmVudC5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoJChwYXJlbnRPckVsZW1lbnQpLmhhc0NsYXNzKCdlZGl0YWJsZS1maWVsZCcpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEgPSAkKHBhcmVudE9yRWxlbWVudCk7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJlbnRFbGVtZW50ID0gcGFyZW50T3JFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgICAvLyBJZiBpdCdzIG5vdCBhbiBlZGl0YWJsZSBmaWVsZCwgZGVjbGFyZSBpdCBhIHBhcmVudCxcbiAgICAgICAgICAgIC8vIGFuZCBnbyBsb29raW5nIGZvciBhIGNoaWxkIHRoYXQgbWlnaHQgYmUgYSBwcmUtZXhpc3RpbmdcbiAgICAgICAgICAgIC8vIGVkaXRhYmxlIGZpZWxkLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcmVudEVsZW1lbnQgPSBwYXJlbnRPckVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgdmFyIHBvdGVudGlhbEZpZWxkID0gJChwYXJlbnRPckVsZW1lbnQpLmNoaWxkcmVuKCcuZWRpdGFibGUtZmllbGQnKS5maXJzdCgpO1xuICAgICAgICAgICAgICAgIGlmIChwb3RlbnRpYWxGaWVsZC5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUSA9IHBvdGVudGlhbEZpZWxkO1xuICAgICAgICAgICAgICAgIC8vIE5vIGZpZWxkPyAgTWFrZSBvbmUgYW5kIGFkZCBpdCB1bmRlciB0aGUgcGFyZW50LlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFN0eWxpbmcgd2lsbCBiZSBzZXQgbGF0ZXIgd2l0aCBzZXREZWZhdWx0U3R5bGluZygpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRID0gJCgnPGRpdi8+JykuYWRkQ2xhc3Moc3R5bGUgfHwgJycpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hcHBlbmRUbyhwYXJlbnRPckVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IHRoaXMuZWxlbWVudEpRLmdldCgwKTtcblxuICAgICAgICAgICAgdmFyIGlkID0gRWRpdGFibGVFbGVtZW50Ll91bmlxdWVJbmRleC50b1N0cmluZygpO1xuICAgICAgICAgICAgRWRpdGFibGVFbGVtZW50Ll91bmlxdWVJbmRleCArPSAxO1xuICAgICAgICAgICAgdGhpcy5pZCA9IGlkO1xuICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEuZGF0YSgnZWRkJywgeydlZGl0YWJsZWVsZW1lbnRvYmonOiB0aGlzfSk7XG5cbiAgICAgICAgICAgIHRoaXMuaW5wdXRFbGVtZW50ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMubWluaW11bVJvd3MgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5tYXhpbXVtUm93cyA9IG51bGw7XG5cbiAgICAgICAgICAgIC8vIEZvciBhdHRhY2hpbmcgdG8gdGhlIGRvY3VtZW50XG4gICAgICAgICAgICB0aGlzLmtleUVTQ0hhbmRsZXIgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEVTQ0FQRSBrZXkuIENhbmNlbCBvdXQuXG4gICAgICAgICAgICAgICAgaWYgKGUud2hpY2ggPT0gMjcpIHsgdGhpcy5jYW5jZWxFZGl0aW5nKCk7IH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIEZvciBhdHRhY2hpbmcgdG8gdGhlIGlucHV0IGVsZW1lbnRcbiAgICAgICAgICAgIHRoaXMua2V5RW50ZXJIYW5kbGVyID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBFTlRFUiBrZXkuIENvbW1pdCB0aGUgY2hhbmdlcy5cbiAgICAgICAgICAgICAgICBpZiAoZS53aGljaCA9PSAxMykgeyB0aGlzLmJlZ2luRWRpdENvbW1pdCgpOyB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0aGlzLnNldFVwTWFpbkVsZW1lbnQoKTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJhdGVDb250cm9sc0NvbnRhaW5lcigpO1xuICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUNvbnRyb2xCdXR0b25zKCk7XG5cbiAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLmNsaWNrKHRoaXMuY2xpY2tUb0VkaXRIYW5kbGVyLmJpbmQodGhpcykpO1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgZWxlbWVudCBpcyBzdHlsZWQgdG8gYmUgYWN0aXZlIHdoaWxlIHdlJ3JlIHNldHRpbmcgaXQgdXAsXG4gICAgICAgICAgICAvLyBhc3N1bWUgdGhhdCB3ZSBzaG91bGQgaW1tZWRpYXRlbHkgZW50ZXIgJ2VkaXQnIG1vZGUuXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgZHVlIHRvIHRoZSBjYXNjYWRpbmcgbmF0dXJlIG9mIHRoZSBoYW5kbGVyIGZvciB0cmlnZ2VyaW5nXG4gICAgICAgICAgICAvLyBlZGl0aW5nIG1vZGUsIG9ubHkgb25lIGVkaXRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2Ugd2lsbCBhY3R1YWxseVxuICAgICAgICAgICAgLy8gZW5kIHVwIGFjdGl2ZSAtIHRoZSBsYXN0IG9uZSBzdHlsZWQgYXMgJ2FjdGl2ZScgaW4gdGhlIERPTS5cbiAgICAgICAgICAgIHRoaXMuc2V0RGVmYXVsdFN0eWxpbmcoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmVsZW1lbnRKUS5oYXNDbGFzcygnYWN0aXZlJykpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIHJldHVybnMgdHJ1ZSwgdGhlbiB3ZSBoYXZlIGZhaWxlZCB0byBhY3RpdmF0ZSB0aGVcbiAgICAgICAgICAgICAgICAvLyBlbGVtZW50IGZvciBlZGl0aW5nIGZvciBzb21lIHJlYXNvbi4gIEZhbGwgdGhyb3VnaCB0b1xuICAgICAgICAgICAgICAgIC8vIHNldHRpbmcgdGhlIGVsZW1lbnQgYXMgaW5hY3RpdmUuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY2xpY2tUb0VkaXRIYW5kbGVyKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRJbmFjdGl2ZVN0eWxpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0SW5hY3RpdmVTdHlsaW5nKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIGVkaXRBbGxvd2VkKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNhbkNvbW1pdCh2YWx1ZSk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGdldFZhbHVlKCk6c3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgc2V0VmFsdWUodmFsdWUpIHtcblxuICAgICAgICB9XG5cblxuICAgICAgICBvblN1Y2Nlc3ModmFsdWUpIHtcblxuICAgICAgICB9XG5cblxuICAgICAgICBibGFua0xhYmVsKCk6IHN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gJyhjbGljayB0byBzZXQpJztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgZmlsbEZvcm1EYXRhKGZkKTphbnkge1xuICAgICAgICAgICAgLy8gbG9vayBmb3IgYSBDU1JGIHRva2VuIGFueXdoZXJlIGluIHRoZSBwYWdlXG4gICAgICAgICAgICBmZC5hcHBlbmQoJ2NzcmZtaWRkbGV3YXJldG9rZW4nLCAkKCdpbnB1dFtuYW1lPWNzcmZtaWRkbGV3YXJldG9rZW5dJykudmFsKCkpO1xuICAgICAgICAgICAgZmQuYXBwZW5kKCd2YWx1ZScsIHRoaXMuZ2V0RWRpdGVkVmFsdWUoKSk7XG4gICAgICAgICAgICByZXR1cm4gZmQ7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGZvcm1VUkwoKTogc3RyaW5nO1xuICAgICAgICBmb3JtVVJMKHVybDogc3RyaW5nKTogRWRpdGFibGVFbGVtZW50O1xuICAgICAgICBmb3JtVVJMKHVybD86IHN0cmluZyk6IHN0cmluZyB8IEVkaXRhYmxlRWxlbWVudCB7XG4gICAgICAgICAgICBpZiAodXJsID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZm9ybVVSTCB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2Zvcm1VUkwgPSB1cmw7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgc2hvd1ZhbHVlKCkge1xuICAgICAgICAgICAgdmFyIGUgPSB0aGlzLmVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5jaGlsZHJlbigpLmRldGFjaCgpO1xuICAgICAgICAgICAgdmFyIHYgPSB0aGlzLmdldERpc3BsYXlWYWx1ZSgpO1xuICAgICAgICAgICAgdmFyIGJsID0gdGhpcy5ibGFua0xhYmVsKCk7XG5cbiAgICAgICAgICAgIGlmIChibCAmJiAoKHYgPT09IHVuZGVmaW5lZCkgfHwgKHYgPT0gbnVsbCkgfHwgKHYgPT0gJycpKSkge1xuICAgICAgICAgICAgICAgIGUuaW5uZXJIVE1MID0gJzxzcGFuIHN0eWxlPVwiY29sb3I6Izg4OFwiPicgKyBibCArICc8L3NwYW4+JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgaXMgY2FsbGVkIG9uZSB0aW1lIHRvIGRvIGFueSBuZWNlc3NhcnkgbWFuaXB1bGF0aW9uIG9mIHRoZSBtYWluIGVsZW1lbnRcbiAgICAgICAgLy8gZHVyaW5nIHNldHVwLlxuICAgICAgICBzZXRVcE1haW5FbGVtZW50KCkge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBsb2NhdGUsIG9yIGNyZWF0ZSwgYW4gaW5wdXQgZWxlbWVudCBiZWZvcmVcbiAgICAgICAgICAgIC8vIHdlIGRlY2lkZSB3aGljaCBzdHlsaW5nIHRvIGFwcGx5IHRvIGl0LlxuICAgICAgICAgICAgdGhpcy5zZXR1cElucHV0RWxlbWVudCgpO1xuXG4gICAgICAgICAgICBpZiAoJCh0aGlzLmlucHV0RWxlbWVudCkuaXMoJ2lucHV0JykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygnaG9yaXpvbnRhbEJ1dHRvbnMnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIFwidmVydGljYWxCdXR0b25zXCIgY2xhc3MgY2hhbmdlcyB0aGUgc3R5bGluZyBvZiB0aGUgYnV0dG9ucyxcbiAgICAgICAgICAgICAgICAvLyBhcyB3ZWxsIGFzIHRoZSBzdHlsaW5nIG9mIHRoZSBtYWluIGVsZW1lbnQgaXRzZWxmLlxuICAgICAgICAgICAgICAgIC8vIEZvciBleGFtcGxlIGl0IGdpdmVzIGVhY2ggYnV0dG9uIGEgc3R5bGUgb2YgXCJibG9ja1wiIGluc3RlYWQgb2YgXCJpbmxpbmUtYmxvY2tcIixcbiAgICAgICAgICAgICAgICAvLyBwcmV2ZW50aW5nIHRoZSBidXR0b25zIGZyb20gYXBwZWFyaW5nIHNpZGUtYnktc2lkZS5cbiAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygndmVydGljYWxCdXR0b25zJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdlbmVyYXRlIGEgY29udGFpbmVyIGZvciB0aGUgZWRpdGluZyBidXR0b25zKHMpLCBhbmQgYSBwb3NpdGlvbmluZyBlbGVtZW50IHRvXG4gICAgICAgIC8vIHB1dCB0aGUgY29udHJvbHMgaW4gdGhlIHJpZ2h0IHBsYWNlIHJlbGF0aXZlIHRvIHRoZSBtYWluIGVsZW1lbnQuXG4gICAgICAgIGdlbmVyYXRlQ29udHJvbHNDb250YWluZXIoKSB7XG4gICAgICAgICAgICAvLyBUaGUgY29udGFpbmVyIGlzIGEgZmxvYXQtcmlnaHQgc3BhbiB0aGF0IGFwcGVhcnMgYXQgdGhlIHJpZ2h0IGVkZ2VcbiAgICAgICAgICAgIC8vIG9mIHRoZSBjZWxsIGluIHRoZSBsYXlvdXQsIGFuZCB0aGUgaWNvbnMgY29uc3VtZSBzcGFjZSB3aXRoaW4uXG5cbiAgICAgICAgICAgIHRoaXMuZWRpdENvbnRyb2xzUG9zaXRpb25lciA9ICQoJzxzcGFuIGNsYXNzPVwiaWNvbi1wb3NpdGlvbmVyXCIvPicpWzBdO1xuICAgICAgICAgICAgdGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIgPSAkKCc8c3BhbiBjbGFzcz1cImljb24tY29udGFpbmVyXCIvPicpWzBdO1xuXG4gICAgICAgICAgICB0aGlzLmVkaXRDb250cm9sc1Bvc2l0aW9uZXIuYXBwZW5kQ2hpbGQodGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJbnN0YW50aWF0ZXMgYW5kIHN0b3JlcyBhbGwgdGhlIGJ1dHRvbnMgdXNlZCBpbiB0aGUgY29udHJvbHMgY29udGFpbmVyIGZvciBsYXRlciB1c2VcbiAgICAgICAgZ2VuZXJhdGVDb250cm9sQnV0dG9ucygpIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdEJ1dHRvbkVsZW1lbnQgPSAkKCc8c3BhbiBjbGFzcz1cImljb24gaWNvbi1lZGl0XCIvPicpWzBdO1xuICAgICAgICAgICAgdGhpcy5hY2NlcHRCdXR0b25FbGVtZW50ID0gJCgnPHNwYW4gY2xhc3M9XCJpY29uIGljb24tYWNjZXB0XCIvPicpWzBdO1xuICAgICAgICAgICAgdGhpcy5jYW5jZWxCdXR0b25FbGVtZW50ID0gJCgnPHNwYW4gY2xhc3M9XCJpY29uIGljb24tY2FuY2VsXCIvPicpWzBdO1xuICAgICAgICAgICAgdGhpcy53YWl0QnV0dG9uRWxlbWVudCA9ICQoJzxzcGFuIGNsYXNzPVwiaWNvbiB3YWl0LWZhc3RlclwiLz4nKVswXTtcblxuICAgICAgICAgICAgLy8gV2hlbiByZW5kZXJpbmcgY29udGVudHMgdGhhdCBoYXZlIGJlZW4gZmxvYXRlZCwgc29tZSBicm93c2VycyB3aWxsIFwibWFnaWNhbGx5XCIgY29sbGFwc2UgYW55dGhpbmdcbiAgICAgICAgICAgIC8vIHRoYXQgZG9lc24ndCBjb250YWluIG5vbi13aGl0ZXNwYWNlIHRleHQgdG8gMCB3aWR0aCwgcmVnYXJkbGVzcyBvZiBzdHlsZSBzZXR0aW5ncy5cbiAgICAgICAgICAgIHRoaXMuZWRpdEJ1dHRvbkVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoU3RyaW5nLmZyb21DaGFyQ29kZSgxNjApKSk7ICAvLyAmbmJzcDtcbiAgICAgICAgICAgIHRoaXMuYWNjZXB0QnV0dG9uRWxlbWVudC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShTdHJpbmcuZnJvbUNoYXJDb2RlKDE2MCkpKTtcbiAgICAgICAgICAgIHRoaXMuY2FuY2VsQnV0dG9uRWxlbWVudC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShTdHJpbmcuZnJvbUNoYXJDb2RlKDE2MCkpKTtcbiAgICAgICAgICAgIHRoaXMud2FpdEJ1dHRvbkVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoU3RyaW5nLmZyb21DaGFyQ29kZSgxNjApKSk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FuY2VsQnV0dG9uRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgJ0NsaWNrIHRvIGNhbmNlbCBlZGl0aW5nLlxcbllvdSBjYW4gYWxzbyBjYW5jZWwgZWRpdGluZyBieSBwcmVzc2luZyB0aGUgRVNDIGtleS4nKTtcblxuICAgICAgICAgICAgJCh0aGlzLmFjY2VwdEJ1dHRvbkVsZW1lbnQpLmNsaWNrKHRoaXMuY2xpY2tUb0FjY2VwdEhhbmRsZXIuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAkKHRoaXMuY2FuY2VsQnV0dG9uRWxlbWVudCkuY2xpY2sodGhpcy5jbGlja1RvQ2FuY2VsSGFuZGxlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ2hhbmdlcyB0aGUgc3R5bGluZyBvZiB0aGUgY29udGFpbmVyIGVsZW1lbnQgdG8gaW5kaWNhdGUgdGhhdCBlZGl0aW5nIGlzIGFsbG93ZWQsXG4gICAgICAgIC8vIGFuZCBhZGRzIGEgbW91c2Utb3ZlciBjb250cm9sIHRvIGVuZ2FnZSBlZGl0aW5nLlxuICAgICAgICBzZXRJbmFjdGl2ZVN0eWxpbmcoKSB7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygnaW5hY3RpdmUnKTtcbiAgICAgICAgICAgICQodGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIpLmNoaWxkcmVuKCkuZGV0YWNoKCk7XG4gICAgICAgICAgICB0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVkaXRCdXR0b25FbGVtZW50KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ2hhbmdlcyB0aGUgc3R5bGluZyBvZiB0aGUgY29udGFpbmVyIGVsZW1lbnQgdG8gaW5kaWNhdGUgdGhhdCBlZGl0aW5nIGlzIGFsbG93ZWQsXG4gICAgICAgIC8vIGFuZCBhZGRzIGEgbW91c2Utb3ZlciBjb250cm9sIHRvIGVuZ2FnZSBlZGl0aW5nLlxuICAgICAgICBzZXREZWZhdWx0U3R5bGluZygpIHtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdlZGl0YWJsZS1maWVsZCcpO1xuICAgICAgICAgICAgaWYgKHRoaXMuZWRpdEFsbG93ZWQoKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdlbmFibGVkJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLnJlbW92ZUNsYXNzKCdlbmFibGVkJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLnJlbW92ZUNsYXNzKCdzYXZpbmcnKTtcblxuICAgICAgICAgICAgdGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCAnY2xpY2sgdG8gZWRpdCcpO1xuXG4gICAgICAgICAgICB2YXIgYyA9IHRoaXMuZWRpdENvbnRyb2xzUG9zaXRpb25lcjtcbiAgICAgICAgICAgIHZhciBwID0gdGhpcy5lbGVtZW50O1xuICAgICAgICAgICAgLy8gV2Ugd2FudCB0aGlzIHRvIGJlIHRoZSBmaXJzdCBlbGVtZW50IHNvIHRoZSB2ZXJ0aWNhbCBoZWlnaHQgb2YgdGhlIHJlc3Qgb2YgdGhlIGNvbnRlbnRcbiAgICAgICAgICAgIC8vIGRvZXNuJ3QgY2F1c2UgaXQgdG8gZmxvYXQgZmFydGhlciBkb3duIHNpZGUgb2YgdGhlIGNlbGwuXG4gICAgICAgICAgICBpZiAocC5maXJzdENoaWxkKSB7XG4gICAgICAgICAgICAgICAgaWYgKHAuZmlyc3RDaGlsZCAhPSBjKSB7XG4gICAgICAgICAgICAgICAgICAgIHAuaW5zZXJ0QmVmb3JlKGMsIHAuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwLmFwcGVuZENoaWxkKGMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJbnN0YW50aWF0ZXMgdGhlIGZvcm0gZWxlbWVudChzKSB1c2VkIHdoZW4gZWRpdGluZyBpcyB0YWtpbmcgcGxhY2UsXG4gICAgICAgIC8vIHdpdGggYXBwcm9wcmlhdGUgZXZlbnQgaGFuZGxlcnMgYW5kIHN0eWxpbmcsIGFuZCBhZGRzIHRoZW0gdG8gdGhlXG4gICAgICAgIC8vIGNvbnRhaW5lciBlbGVtZW50LlxuICAgICAgICBzZXRVcEVkaXRpbmdNb2RlKCkge1xuICAgICAgICAgICAgdmFyIHBUaGlzID0gdGhpcztcblxuICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEucmVtb3ZlQ2xhc3MoJ2luYWN0aXZlJyk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnc2F2aW5nJyk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygnYWN0aXZlJyk7XG5cbiAgICAgICAgICAgIHRoaXMuc2V0dXBJbnB1dEVsZW1lbnQoKTtcblxuICAgICAgICAgICAgdGhpcy5jbGVhckVsZW1lbnRGb3JFZGl0aW5nKCk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5pbnB1dEVsZW1lbnQpO1xuICAgICAgICAgICAgJCh0aGlzLmlucHV0RWxlbWVudCkuc2hvdygpO1xuICAgICAgICAgICAgaWYgKHRoaXMuZWxlbWVudC5pZCA9PT0gJ2VkaXRhYmxlLXN0dWR5LWRlc2NyaXB0aW9uJykge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGlueW1jZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGlueW1jZS5pbml0KHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yOiAnI2VkaXRhYmxlLXN0dWR5LWRlc2NyaXB0aW9uIHRleHRhcmVhJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsdWdpbnM6IFwibGlua1wiXG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgLy8gUmVtZW1iZXIgd2hhdCB3ZSdyZSBlZGl0aW5nIGluIGNhc2UgdGhleSBjYW5jZWwgb3IgbW92ZSB0byBhbm90aGVyIGVsZW1lbnRcbiAgICAgICAgICAgIEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCA9IHRoaXM7XG5cbiAgICAgICAgICAgIC8vIFNldCBmb2N1cyB0byB0aGUgbmV3IGlucHV0IGVsZW1lbnQgQVNBUCBhZnRlciB0aGUgY2xpY2sgaGFuZGxlci5cbiAgICAgICAgICAgIC8vIFdlIGNhbid0IGp1c3QgZG8gdGhpcyBpbiBoZXJlIGJlY2F1c2UgdGhlIGJyb3dzZXIgd2lsbCBzZXQgdGhlIGZvY3VzIGl0c2VsZlxuICAgICAgICAgICAgLy8gYWZ0ZXIgaXQncyBkb25lIGhhbmRsaW5nIHRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGlzIG1ldGhvZC5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHBUaGlzLmlucHV0RWxlbWVudC5mb2N1cygpO1xuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB0aGlzLnNldFVwS2V5SGFuZGxlcigpO1xuICAgICAgICAgICAgLy8gVE9ETzogSGFuZGxlIGxvc2luZyBmb2N1cyAoaW4gd2hpY2ggY2FzZSB3ZSBjb21taXQgY2hhbmdlcz8pXG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gbG9jYXRlIGEgcHJlLWV4aXN0aW5nIGlucHV0IGVsZW1lbnQgaW5zaWRlIHRoZVxuICAgICAgICAvLyBlZGl0YWJsZSBhcmVhLCBhbmQgaWYgb25lIGlzIGxvY2F0ZWQsIHRha2UgaXRzIHZhbHVlIGFzIHRoZVxuICAgICAgICAvLyBkZWZhdWx0IHZhbHVlIGZvciB0aGUgZmllbGQuICBJZiBubyBlbGVtZW50IGV4aXN0cywgbWFrZSBhIG5ldyBvbmUsXG4gICAgICAgIC8vIGFuZCBhc3N1bWUgaXQgc2hvdWxkIGJlIGEgdGV4dGFyZWEuXG4gICAgICAgIHNldHVwSW5wdXRFbGVtZW50KCkge1xuICAgICAgICAgICAgdmFyIGRlc2lyZWRGb250U2l6ZSA9IHRoaXMuZWxlbWVudEpRLmNzcyhcImZvbnQtc2l6ZVwiKTtcbiAgICAgICAgICAgIGlmICghdGhpcy5pbnB1dEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgcG90ZW50aWFsSW5wdXQgPSB0aGlzLmVsZW1lbnRKUS5jaGlsZHJlbignaW5wdXQnKS5maXJzdCgpO1xuICAgICAgICAgICAgICAgIGlmIChwb3RlbnRpYWxJbnB1dC5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmlucHV0RWxlbWVudCA9IHBvdGVudGlhbElucHV0LmdldCgwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaWd1cmUgb3V0IGhvdyBoaWdoIHRvIG1ha2UgdGhlIHRleHQgZWRpdCBib3guXG4gICAgICAgICAgICAgICAgICAgIHZhciBsaW5lSGVpZ2h0ID0gcGFyc2VJbnQoIGRlc2lyZWRGb250U2l6ZSwgMTAgKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlc2lyZWROdW1MaW5lcyA9IHRoaXMuZWxlbWVudEpRLmhlaWdodCgpIC8gbGluZUhlaWdodDtcbiAgICAgICAgICAgICAgICAgICAgZGVzaXJlZE51bUxpbmVzID0gTWF0aC5mbG9vcihkZXNpcmVkTnVtTGluZXMpICsgMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaW11bVJvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlc2lyZWROdW1MaW5lcyA9IE1hdGgubWF4KGRlc2lyZWROdW1MaW5lcywgdGhpcy5taW5pbXVtUm93cylcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5tYXhpbXVtUm93cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVzaXJlZE51bUxpbmVzID0gTWF0aC5taW4oZGVzaXJlZE51bUxpbmVzLCB0aGlzLm1heGltdW1Sb3dzKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGRlc2lyZWROdW1MaW5lcyA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRleHRhcmVhXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgJCh0aGlzLmlucHV0RWxlbWVudCkuYXR0cigncm93cycsIGRlc2lyZWROdW1MaW5lcylcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnB1dEVsZW1lbnQudHlwZSA9IFwidGV4dFwiO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU2V0IHdpZHRoIGFuZCBoZWlnaHQuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRFbGVtZW50LnN0eWxlLndpZHRoID0gXCI5OSVcIjtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmlucHV0RWxlbWVudC52YWx1ZSA9IHRoaXMuZ2V0VmFsdWUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gQ29weSBmb250IGF0dHJpYnV0ZXMgdG8gbWF0Y2guXG4gICAgICAgICAgICAgICAgJCh0aGlzLmlucHV0RWxlbWVudCkuY3NzKCBcImZvbnQtZmFtaWx5XCIsIHRoaXMuZWxlbWVudEpRLmNzcyhcImZvbnQtZmFtaWx5XCIpICk7XG4gICAgICAgICAgICAgICAgJCh0aGlzLmlucHV0RWxlbWVudCkuY3NzKCBcImZvbnQtc2l6ZVwiLCBkZXNpcmVkRm9udFNpemUgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gU3VwcG9ydCBmdW5jdGlvbiBmb3Igc2V0VXBFZGl0aW5nTW9kZS5cbiAgICAgICAgLy8gVGFrZXMgdGhlIGNvbnRhaW5lciBlbGVtZW50IHRoYXQgd2UgYXJlIHVzaW5nIGFzIGFuIGVkaXRhYmxlIGVsZW1lbnQsXG4gICAgICAgIC8vIGFuZCBjbGVhcnMgaXQgb2YgYWxsIGNvbnRlbnQsIHRoZW4gcmUtYWRkcyB0aGUgYmFzaWMgZWRpdCBjb250cm9sIHdpZGdldHMuXG4gICAgICAgIGNsZWFyRWxlbWVudEZvckVkaXRpbmcoKSB7XG4gICAgICAgICAgICAvLyBDbGVhciB0aGUgZWxlbWVudCBvdXRcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLmNvbnRlbnRzKCkuZGV0YWNoKCk7IC8vIGNoaWxkcmVuKCkgZG9lcyBub3QgY2FwdHVyZSB0ZXh0IG5vZGVzXG4gICAgICAgICAgICAvLyBSZS1hZGQgdGhlIGNvbnRyb2xzIGFyZWFcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmVkaXRDb250cm9sc1Bvc2l0aW9uZXIpO1xuICAgICAgICAgICAgJCh0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lcikuY2hpbGRyZW4oKS5kZXRhY2goKTtcbiAgICAgICAgICAgIHRoaXMuZWRpdENvbnRyb2xzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuYWNjZXB0QnV0dG9uRWxlbWVudCk7XG4gICAgICAgICAgICB0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmNhbmNlbEJ1dHRvbkVsZW1lbnQpO1xuICAgICAgICAgICAgLy90aGlzLmVkaXRCdXR0b25FbGVtZW50LmNsYXNzTmFtZSA9IFwiaWNvbiBpY29uLWVkaXRcIjtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3RpdGxlJyk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGNsaWNrVG9FZGl0SGFuZGxlcigpOmJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmVkaXRBbGxvd2VkKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBFZGl0aW5nIG5vdCBhbGxvd2VkPyAgVGhlbiB0aGlzIGhhcyBubyBlZmZlY3QuXG4gICAgICAgICAgICAgICAgLy8gTGV0IHRoZSBzeXN0ZW0gaGFuZGxlIHRoaXMgZXZlbnQuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoRWRpdGFibGVFbGVtZW50Ll9wcmV2RWRpdGFibGVFbGVtZW50ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcyA9PT0gRWRpdGFibGVFbGVtZW50Ll9wcmV2RWRpdGFibGVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZXkncmUgYWxyZWFkeSBlZGl0aW5nIHRoaXMgZWxlbWVudC4gRG9uJ3QgcmUtc2V0dXAgZXZlcnl0aGluZy5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmV0dXJuaW5nIHRydWUgbGV0cyB0aGUgc3lzdGVtIGhhbmRsZSB0aGlzIG1vdXNlIGNsaWNrLlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGV5IHdlcmUgYWxyZWFkeSBlZGl0aW5nIHNvbWV0aGluZywgc28gcmV2ZXJ0IHRob3NlIGNoYW5nZXMuXG4gICAgICAgICAgICAgICAgICAgIEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudC5jYW5jZWxFZGl0aW5nKCk7XG4gICAgICAgICAgICAgICAgICAgIEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZXRVcEVkaXRpbmdNb2RlKCk7XG4gICAgICAgICAgICAvLyBSZXR1cm5pbmcgZmFsc2UgbWVhbnMgdG8gc3RvcCBoYW5kbGluZyB0aGUgbW91c2UgY2xpY2ssIHdoaWNoIHJlc3BlY3RzIG91ciBpbnB1dEVsZW1lbnQuc2VsZWN0KCkgY2FsbC5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY2FuY2VsRWRpdGluZygpIHtcbiAgICAgICAgICAgIHZhciBwVGhpcyA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgZWxlbWVudCA9IHRoaXMuZWxlbWVudDtcblxuICAgICAgICAgICAgdGhpcy5yZW1vdmVLZXlIYW5kbGVyKCk7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgaW5wdXQgYm94LlxuICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXRFbGVtZW50ICYmIHRoaXMuaW5wdXRFbGVtZW50LnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0RWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuaW5wdXRFbGVtZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gV2UgbWFuaXB1bGF0ZWQgdGhlIHNpemUgb2YgdGhlXG4gICAgICAgICAgICAvLyBjb250YWluZXIgZWxlbWVudCB0byBnaXZlIHRoZSBtYXhpbXVtIGF2YWlsYWJsZSBzcGFjZSBmb3IgZWRpdGluZy5cbiAgICAgICAgICAgIC8vIFdlIHNob3VsZCBhdHRlbXB0IHRvIHJlc2V0IHRoYXQuXG4gICAgICAgICAgICAvLyBXZSBjYW4ndCBqdXN0IHJlYWQgdGhlIG9sZCB3aWR0aCBvdXQgYW5kIHNhdmUgaXQsIHRoZW4gcmUtaW5zZXJ0IGl0IG5vdywgYmVjYXVzZVxuICAgICAgICAgICAgLy8gdGhhdCBtYXkgcGVybWFuZW50bHkgZml4IHRoZSBlbGVtZW50IGF0IGEgd2lkdGggdGhhdCBpdCBtYXkgaGF2ZSBvbmx5IGhhZFxuICAgICAgICAgICAgLy8gYmVmb3JlIGJlY2F1c2Ugb2YgZXh0ZXJuYWwgbGF5b3V0IGZhY3RvcnMuXG4gICAgICAgICAgICAvL3RoaXMuZWxlbWVudC5zdHlsZS53aWR0aCA9ICcnOyAgICAvLyAoTm90IGRvaW5nIHRoaXMgZm9yIG5vdylcblxuICAgICAgICAgICAgLy8gUmVzdG9yZSB0aGUgY29udGVudC5cbiAgICAgICAgICAgIHRoaXMuc2hvd1ZhbHVlKCk7XG4gICAgICAgICAgICAvLyBSZS1hZGQgdGhlIGRlZmF1bHQgZWRpdGluZyB3aWRnZXRyeVxuICAgICAgICAgICAgdGhpcy5zZXREZWZhdWx0U3R5bGluZygpO1xuICAgICAgICAgICAgdGhpcy5zZXRJbmFjdGl2ZVN0eWxpbmcoKTtcbiAgICAgICAgICAgIEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCA9IG51bGw7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGJlZ2luRWRpdENvbW1pdCgpIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRoaXMuZ2V0RWRpdGVkVmFsdWUoKTtcbiAgICAgICAgICAgIGlmICghdGhpcy5jYW5Db21taXQodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZXRVcENvbW1pdHRpbmdJbmRpY2F0b3IoKTtcbiAgICAgICAgICAgIHRoaXMuY29tbWl0KCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFN1YmNsYXNzIHRoaXMgaWYgeW91ciBuZWVkIGEgZGlmZmVyZW50IHN1Ym1pdCBiZWhhdmlvciBhZnRlciB0aGUgVUkgaXMgc2V0IHVwLlxuICAgICAgICBjb21taXQoKSB7XG4gICAgICAgICAgICB2YXIgZGVidWcgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGlueW1jZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICB0aW55bWNlLnRyaWdnZXJTYXZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmdldEVkaXRlZFZhbHVlKCk7XG4gICAgICAgICAgICB2YXIgcFRoaXMgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIGZvcm1EYXRhID0gdGhpcy5maWxsRm9ybURhdGEobmV3IEZvcm1EYXRhKCkpO1xuXG4gICAgICAgICAgICBVdGwuRURELmNhbGxBamF4KHtcbiAgICAgICAgICAgICAgICAndXJsJzogdGhpcy5mb3JtVVJMKCksXG4gICAgICAgICAgICAgICAgJ3R5cGUnOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgJ2NhY2hlJzogZmFsc2UsXG4gICAgICAgICAgICAgICAgJ2RlYnVnJzogZGVidWcsXG4gICAgICAgICAgICAgICAgJ2RhdGEnOiBmb3JtRGF0YSxcbiAgICAgICAgICAgICAgICAnc3VjY2Vzcyc6IGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS50eXBlID09IFwiU3VjY2Vzc1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2UubWVzc2FnZS5zcGxpdCgnICcpWzFdID09PSBcIlt1J2Rlc2NyaXB0aW9uJ11cIiAmJiB2YWx1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSAkLnBhcnNlSFRNTCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcFRoaXMuY2FuY2VsRWRpdGluZygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICQocFRoaXMuZWxlbWVudCkudGV4dChcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkKHBUaGlzLmVsZW1lbnQpLmFwcGVuZCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBUaGlzLnNldFZhbHVlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwVGhpcy5jYW5jZWxFZGl0aW5nKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhbGVydChcIkVycm9yOiBcIiArIHJlc3BvbnNlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnZXJyb3InOiBmdW5jdGlvbigganFYSFIsIHRleHRTdGF0dXMsIGVycm9yVGhyb3duICkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVidWcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHRleHRTdGF0dXMgKyAnICcgKyBlcnJvclRocm93bik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhqcVhIUi5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHBUaGlzLmNhbmNlbEVkaXRpbmcoKTsgIC8vIFRPRE86IEJldHRlciByZXBvbnNlIGluIFVJIGZvciB1c2VyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgY2hhbmdlcyB0aGUgVUkgdG8gYSB0aGlyZCBzdGF0ZSBjYWxsZWQgJ3NhdmluZycgdGhhdCBpcyBkaWZmZXJlbnQgZnJvbSAnYWN0aXZlJyBvciAnaW5hY3RpdmUnLlxuICAgICAgICBzZXRVcENvbW1pdHRpbmdJbmRpY2F0b3IoKSB7XG4gICAgICAgICAgICB3aGlsZSAodGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIuZmlyc3RDaGlsZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZWRpdENvbnRyb2xzQ29udGFpbmVyLnJlbW92ZUNoaWxkKHRoaXMuZWRpdENvbnRyb2xzQ29udGFpbmVyLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy53YWl0QnV0dG9uRWxlbWVudCk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnaW5hY3RpdmUnKTtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdzYXZpbmcnKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY2xpY2tUb0FjY2VwdEhhbmRsZXIoKTpib29sZWFuIHtcbiAgICAgICAgICAgIHRoaXMuYmVnaW5FZGl0Q29tbWl0KCk7XG4gICAgICAgICAgICAvLyBTdG9wIGhhbmRsaW5nIHRoZSBtb3VzZSBjbGlja1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cblxuICAgICAgICBjbGlja1RvQ2FuY2VsSGFuZGxlcigpOmJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKCQodGhpcy5lbGVtZW50KS5hdHRyKCdpZCcpID09PSAnZWRpdGFibGUtc3R1ZHktZGVzY3JpcHRpb24nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0aW55bWNlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICB0aW55bWNlLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgdmFsdWU6YW55ID0gdGhpcy5pbnB1dEVsZW1lbnQudmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW5jZWxFZGl0aW5nKCk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gJCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vcmVtb3ZlIGJhc2ljIHRleHQgYmVjYXVzZSBpdCBtaWdodCBoYXZlIGh0bWwgZWxlbWVudHMgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzLmVsZW1lbnQpLnRleHQoJycpO1xuICAgICAgICAgICAgICAgICAgICAkKHRoaXMuZWxlbWVudCkuYXBwZW5kKHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FuY2VsRWRpdGluZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU3RvcCBoYW5kbGluZyB0aGUgbW91c2UgY2xpY2tcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSGFuZGxlIHNwZWNpYWwga2V5cyBsaWtlIGVudGVyIGFuZCBlc2NhcGUuXG4gICAgICAgIC8vIFdlJ3JlIGRvaW5nIGl0IHRoaXMgd2F5IGJlY2F1c2Ugd2Ugb25seSBldmVyIHdhbnQgb25lXG4gICAgICAgIC8vIEVkaXRhYmxlRWxlbWVudCByZXNwb25kaW5nIHRvIGFuIEVTQyBvciBhbiBFbnRlciBhdCBhIHRpbWUsXG4gICAgICAgIC8vIGFuZCB0aGlzIGlzIGFjdHVhbGx5IGxlc3MgbWVzc3kgdGhhbiBhdHRhY2hpbmcgYSBnZW5lcmljXG4gICAgICAgIC8vIGV2ZW50IGhhbmRsZXIgdG8gdGhlIGRvY3VtZW50IGFuZCB0aGVuIGZlcnJldGluZyBvdXQgdGhlXG4gICAgICAgIC8vIGludGVuZGVkIG9iamVjdCBmcm9tIHRoZSBET00uXG4gICAgICAgIC8vIFRoZXJlIGlzIG5vIHBvbGx1dGlvbiBmcm9tIG11bHRpcGxlIGhhbmRsZXJzIGJlY2F1c2UgZXZlcnkgdGltZSB3ZVxuICAgICAgICAvLyBhZGQgb25lLCB3ZSByZW1vdmUgdGhlIHByZXZpb3VzLiAgKFNlZSBjbGlja1RvRWRpdEhhbmRsZXIpXG4gICAgICAgIHNldFVwS2V5SGFuZGxlcigpIHtcbiAgICAgICAgICAgICQoPGFueT5kb2N1bWVudCkub24oJ2tleWRvd24nLCB0aGlzLmtleUVTQ0hhbmRsZXIpO1xuICAgICAgICAgICAgJCh0aGlzLmlucHV0RWxlbWVudCkub24oJ2tleWRvd24nLCB0aGlzLmtleUVudGVySGFuZGxlcik7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHJlbW92ZUtleUhhbmRsZXIoKSB7XG4gICAgICAgICAgICAkKDxhbnk+ZG9jdW1lbnQpLm9mZigna2V5ZG93bicsIHRoaXMua2V5RVNDSGFuZGxlcik7XG4gICAgICAgICAgICAkKHRoaXMuaW5wdXRFbGVtZW50KS5vZmYoJ2tleWRvd24nLCB0aGlzLmtleUVudGVySGFuZGxlcik7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGFwcGVuZFRvKGVsKSB7XG4gICAgICAgICAgICB0aGlzLnBhcmVudEVsZW1lbnQgPSBlbDtcbiAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGFwcGVuZENoaWxkKGVsKSB7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoZWwpO1xuICAgICAgICB9XG5cblxuICAgICAgICBjbGVhcigpIHtcbiAgICAgICAgICAgIHdoaWxlICh0aGlzLmVsZW1lbnQubGFzdENoaWxkKSB7XG4gICAgICAgICAgICAgICAgJCh0aGlzLmVsZW1lbnQubGFzdENoaWxkKS5kZXRhY2goKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgdmlzaWJsZShlbmFibGU6Ym9vbGVhbikge1xuICAgICAgICAgICAgaWYgKGVuYWJsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZSBpZiB0aGUgdmFsdWUgb2YgdGhlIGZpZWxkIG5lZWRzIHRvIGJlIHBvc3QtcHJvY2Vzc2VkIGJlZm9yZSBiZWluZyBkaXNwbGF5ZWQuXG4gICAgICAgIGdldERpc3BsYXlWYWx1ZSgpOnN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgICAgICB9XG5cblxuICAgICAgICBnZXRFZGl0ZWRWYWx1ZSgpOmFueSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pbnB1dEVsZW1lbnQudmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIEVkaXRhYmxlQXV0b2NvbXBsZXRlIGV4dGVuZHMgRWRpdGFibGVFbGVtZW50IHtcblxuICAgICAgICBhdXRvQ29tcGxldGVPYmplY3Q6RUREQXV0by5CYXNlQXV0bztcblxuXG4gICAgICAgIGNvbnN0cnVjdG9yKGlucHV0RWxlbWVudDogSFRNTEVsZW1lbnQsIHN0eWxlPzogc3RyaW5nKSB7XG4gICAgICAgICAgICBzdXBlcihpbnB1dEVsZW1lbnQsIHN0eWxlKTtcbiAgICAgICAgICAgIHRoaXMuYXV0b0NvbXBsZXRlT2JqZWN0ID0gbnVsbDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgc2V0VXBNYWluRWxlbWVudCgpIHtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdob3Jpem9udGFsQnV0dG9ucycpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBPdmVycmlkZSB0aGlzIHdpdGggeW91ciBzcGVjaWZpYyBhdXRvY29tcGxldGUgdHlwZVxuICAgICAgICBjcmVhdGVBdXRvQ29tcGxldGVPYmplY3Qob3B0PzpFRERBdXRvLkF1dG9jb21wbGV0ZU9wdGlvbnMpOkVEREF1dG8uQmFzZUF1dG8ge1xuICAgICAgICAgICAgLy8gQ3JlYXRlIGFuIGlucHV0IGZpZWxkIHRoYXQgdGhlIHVzZXIgY2FuIGVkaXQgd2l0aC5cbiAgICAgICAgICAgIHJldHVybiBuZXcgRUREQXV0by5Vc2VyKCQuZXh0ZW5kKHt9LCBvcHQpKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBlaXRoZXIgcmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgYXV0b2NvbXBsZXRlIG9iamVjdCxcbiAgICAgICAgLy8gb3IgaWYgbmVjZXNzYXJ5LCBjcmVhdGVzIGEgbmV3IG9uZSBhbmQgcHJlcGFyZXMgaXQsIHRoZW4gcmV0dXJucyBpdC5cbiAgICAgICAgLy8gVE9ETzogRm9yIGVkaXRhYmxlIGF1dG9jb21wbGV0ZSBmaWVsZHMgYnVpbHQgZW50aXJlbHkgb24gdGhlIGZyb250LWVuZCxcbiAgICAgICAgLy8gd2UgbmVlZCB0byBwYXNzIGRvd24gYSBkZWZhdWx0IHZhbHVlLlxuICAgICAgICAvLyBOb3RlIHRoYXQgdGhpcyBkb2VzIG5vdCBkbyBhbnkgdHlwZSBjaGVja2luZyBvZiBwcmUtZXhpc3RpbmcgYXV0b2NvbXBsZXRlXG4gICAgICAgIC8vIGVsZW1lbnRzIC0gdGhhdCBpcywgaXQgZG9lcyBub3QgY2hlY2sgdGhlIGVkZGF1dG9jb21wbGV0ZXR5cGUgYXR0cmlidXRlIHRvXG4gICAgICAgIC8vIG1ha2Ugc3VyZSB0aGF0IGl0IG1hdGNoZXMgdGhlIHR5cGUgdGhhdCBpdCB3aWxsIGF0dGVtcHQgdG8gY3JlYXRlLlxuICAgICAgICAvLyBGb3IgZXhhbXBsZSwgYW4gRWRpdGFibGVBdXRvY29tcGxldGUgc3ViY2xhc3MgZm9yIFVzZXIgd2lsbCBhbHdheXMgYXNzdW1lXG4gICAgICAgIC8vIHRoZSBpbnB1dCBlbGVtZW50cyBpdCBmaW5kcyBhcmUgZm9yIGEgVXNlciBhdXRvY29tcGxldGUgdHlwZS5cbiAgICAgICAgZ2V0QXV0b0NvbXBsZXRlT2JqZWN0KCk6RUREQXV0by5CYXNlQXV0byB7XG5cbiAgICAgICAgICAgIHZhciB2aXNpYmxlSW5wdXQgPSB0aGlzLmVsZW1lbnRKUS5jaGlsZHJlbignaW5wdXRbdHlwZT1cInRleHRcIl0uYXV0b2NvbXAnKS5maXJzdCgpOyAgLy8gJzpmaXJzdC1vZi10eXBlJyB3b3VsZCBiZSB3cm9uZyBoZXJlXG4gICAgICAgICAgICB2YXIgaGlkZGVuSW5wdXQgPSB0aGlzLmVsZW1lbnRKUS5jaGlsZHJlbignaW5wdXRbdHlwZT1cImhpZGRlblwiXScpLmZpcnN0KCk7XG4gICAgICAgICAgICB2YXIgYXV0b09iamVjdDpFRERBdXRvLkJhc2VBdXRvID0gbnVsbDtcblxuICAgICAgICAgICAgaWYgKHRoaXMuYXV0b0NvbXBsZXRlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXV0b0NvbXBsZXRlT2JqZWN0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJZiB3ZSBmb3VuZCBhbiBpbnB1dCwgd2UgY2FuIGNoZWNrIGZvciBhbiBhdXRvY29tcGxldGUgb2JqZWN0IGFscmVhZHkgYXR0YWNoZWQgdG8gaXQuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHJlcXVpcmVkIGJlY2F1c2UgRUREQXV0by5CYXNlQXV0by5pbml0UHJlZXhpc3RpbmcoKSBtYXkgaGF2ZSBzcGlkZXJlZCB0aHJvdWdoIGFuZFxuICAgICAgICAgICAgLy8gbWFkZSBvbmUgYWxlYWR5LlxuXG4gICAgICAgICAgICBpZiAodmlzaWJsZUlucHV0Lmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHZhciBlZGREYXRhID0gdmlzaWJsZUlucHV0LmRhdGEoJ2VkZCcpO1xuICAgICAgICAgICAgICAgIGlmIChlZGREYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9PYmplY3QgPSBlZGREYXRhLmF1dG9jb21wbGV0ZW9iajtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFhdXRvT2JqZWN0ICYmIChoaWRkZW5JbnB1dC5sZW5ndGggIT09IDApKSB7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9PYmplY3QgPSB0aGlzLmNyZWF0ZUF1dG9Db21wbGV0ZU9iamVjdCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXI6dGhpcy5lbGVtZW50SlEsXG4gICAgICAgICAgICAgICAgICAgICAgICB2aXNpYmxlSW5wdXQ6dmlzaWJsZUlucHV0LFxuICAgICAgICAgICAgICAgICAgICAgICAgaGlkZGVuSW5wdXQ6aGlkZGVuSW5wdXRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgYWxsIGVsc2UgZmFpbHMgKG9uZSBpbnB1dCBtaXNzaW5nLCBubyBlZGREYXRhLCBvciBubyBhdXRvY29tcGxldGVvYmopLFxuICAgICAgICAgICAgLy8gbWFrZSBhIG5ldyBvYmplY3Qgd2l0aCBuZXcgZWxlbWVudHMuXG4gICAgICAgICAgICBpZiAoIWF1dG9PYmplY3QpIHtcbiAgICAgICAgICAgICAgICBhdXRvT2JqZWN0ID0gdGhpcy5jcmVhdGVBdXRvQ29tcGxldGVPYmplY3Qoe1xuICAgICAgICAgICAgICAgICAgICBjb250YWluZXI6dGhpcy5lbGVtZW50SlFcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5hdXRvQ29tcGxldGVPYmplY3QgPSBhdXRvT2JqZWN0O1xuXG4gICAgICAgICAgICB2YXIgZWwgPSBhdXRvT2JqZWN0LnZpc2libGVJbnB1dDtcbiAgICAgICAgICAgIC8vIENvcHkgZm9udCBhdHRyaWJ1dGVzIGZyb20gb3VyIHVuZGVybHlpbmcgY29udHJvbC5cbiAgICAgICAgICAgICQoZWwpLmNzcyhcImZvbnQtZmFtaWx5XCIsIHRoaXMuZWxlbWVudEpRLmNzcyhcImZvbnQtZmFtaWx5XCIpKTtcbiAgICAgICAgICAgICQoZWwpLmNzcyhcImZvbnQtc2l6ZVwiLCB0aGlzLmVsZW1lbnRKUS5jc3MoXCJmb250LXNpemVcIikpO1xuICAgICAgICAgICAgLy8kKGVsKS5jc3MoXCJ3aWR0aFwiLCBcIjEwMCVcIik7XG5cbiAgICAgICAgICAgIHJldHVybiBhdXRvT2JqZWN0O1xuICAgICAgICB9XG5cblxuICAgICAgICBzZXRVcEVkaXRpbmdNb2RlKCkge1xuICAgICAgICAgICAgdmFyIHBUaGlzID0gdGhpcztcblxuICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEucmVtb3ZlQ2xhc3MoJ2luYWN0aXZlJyk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnc2F2aW5nJyk7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygnYWN0aXZlJyk7XG5cbiAgICAgICAgICAgIHZhciBhdXRvID0gdGhpcy5nZXRBdXRvQ29tcGxldGVPYmplY3QoKTsgICAgLy8gQ2FsbGluZyB0aGlzIG1heSBzZXQgaXQgdXAgZm9yIHRoZSBmaXJzdCB0aW1lXG4gICAgICAgICAgICB0aGlzLmlucHV0RWxlbWVudCA9IGF1dG8udmlzaWJsZUlucHV0O1xuXG4gICAgICAgICAgICB0aGlzLmNsZWFyRWxlbWVudEZvckVkaXRpbmcoKTtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChhdXRvLnZpc2libGVJbnB1dFswXSk7XG5cblxuICAgICAgICAgICAgLy8gUmVtZW1iZXIgd2hhdCB3ZSdyZSBlZGl0aW5nIGluIGNhc2UgdGhleSBjYW5jZWwgb3IgbW92ZSB0byBhbm90aGVyIGVsZW1lbnRcbiAgICAgICAgICAgIEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCA9IHRoaXM7XG5cbiAgICAgICAgICAgIC8vIFNldCBmb2N1cyB0byB0aGUgbmV3IGlucHV0IGVsZW1lbnQgQVNBUCBhZnRlciB0aGUgY2xpY2sgaGFuZGxlci5cbiAgICAgICAgICAgIC8vIFdlIGNhbid0IGp1c3QgZG8gdGhpcyBpbiBoZXJlIGJlY2F1c2UgdGhlIGJyb3dzZXIgd29uJ3QgYWN0dWFsbHkgc2V0IHRoZSBmb2N1cyxcbiAgICAgICAgICAgIC8vIHByZXN1bWFibHkgYmVjYXVzZSBpdCB0aGlua3MgdGhlIGZvY3VzIHNob3VsZCBiZSBpbiB3aGF0IHdhcyBqdXN0IGNsaWNrZWQgb24uXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBwVGhpcy5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgdGhpcy5zZXRVcEtleUhhbmRsZXIoKTtcbiAgICAgICAgICAgIC8vIFRPRE86IEhhbmRsZSBsb3NpbmcgZm9jdXMgKGluIHdoaWNoIGNhc2Ugd2UgY29tbWl0IGNoYW5nZXM/KVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJdCBpcyBwb3NzaWJsZSB0aGlzIHdpbGwgbmVlZCB0byBiZSBhbHRlcmVkIGZ1cnRoZXIgd2hlbiBzdWJjbGFzc2luZyBFZGl0YWJsZUF1dG9jb21wbGV0ZSxcbiAgICAgICAgLy8gYXMgc29tZSByZWNvcmQgc3RyaW5nLWVxdWl2YWxlbnRzIGNhbiBiZSBhbWJpZ3VvdXMuXG4gICAgICAgIGdldERpc3BsYXlWYWx1ZSgpOnN0cmluZyB7XG4gICAgICAgICAgICB2YXIgYXV0byA9IHRoaXMuZ2V0QXV0b0NvbXBsZXRlT2JqZWN0KCk7XG4gICAgICAgICAgICByZXR1cm4gYXV0by52aXNpYmxlSW5wdXQudmFsKCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGdldEVkaXRlZFZhbHVlKCk6YW55IHtcbiAgICAgICAgICAgIHZhciBhdXRvID0gdGhpcy5nZXRBdXRvQ29tcGxldGVPYmplY3QoKTtcbiAgICAgICAgICAgIHJldHVybiBhdXRvLnZhbCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBFZGl0YWJsZUVtYWlsIGV4dGVuZHMgRWRpdGFibGVBdXRvY29tcGxldGUge1xuXG4gICAgICAgIC8vIE92ZXJyaWRlIHRoaXMgd2l0aCB5b3VyIHNwZWNpZmljIGF1dG9jb21wbGV0ZSB0eXBlXG4gICAgICAgIGNyZWF0ZUF1dG9Db21wbGV0ZU9iamVjdCgpIHtcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhbiBpbnB1dCBmaWVsZCB0aGF0IHRoZSB1c2VyIGNhbiBlZGl0IHdpdGguXG4gICAgICAgICAgICByZXR1cm4gbmV3IEVEREF1dG8uVXNlcih7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyOnRoaXMuZWxlbWVudEpRXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==