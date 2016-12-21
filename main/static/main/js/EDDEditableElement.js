// File last modified on: Wed Dec 21 2016 14:53:35  
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
        EditableElement.prototype.makeFormData = function (value) {
            var formData = new FormData();
            formData.append('value', value);
            return formData;
        };
        EditableElement.prototype.getFormURL = function () {
            return '';
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
                    this.inputElement.style.width = "100%";
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
            //this.element.style.width = '';	// (Not doing this for now)
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
            $.ajax({
                'url': this.getFormURL(),
                'type': 'POST',
                'cache': false,
                'data': this.makeFormData(value),
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
        function EditableAutocomplete(inputElement) {
            _super.call(this, inputElement);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRURERWRpdGFibGVFbGVtZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRURERWRpdGFibGVFbGVtZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFDckQsMkNBQTJDO0FBQzNDLCtCQUErQjs7Ozs7O0FBRy9CLDhFQUE4RTtBQUM5RSwyQ0FBMkM7QUFHM0MsSUFBTyxXQUFXLENBZ3BCakI7QUFocEJELFdBQU8sV0FBVyxFQUFDLENBQUM7SUFHbkIscUVBQXFFO0lBQ3JFLDJFQUEyRTtJQUMzRTtRQTBCQywyRUFBMkU7UUFDM0UsdUVBQXVFO1FBQ3ZFLDhDQUE4QztRQUM5Qyw2RUFBNkU7UUFDN0UsMkJBQTJCO1FBQzNCLHdFQUF3RTtRQUN4RSw0RUFBNEU7UUFDNUUsNkJBQTZCO1FBQzdCLHlCQUFZLGVBQTRCLEVBQUUsS0FBYztZQWxDekQsaUJBbWdCQztZQWhlQyw0Q0FBNEM7WUFDNUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztZQUczQixDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLENBQUMsYUFBYSxHQUFHLGVBQWUsQ0FBQyxhQUFhLENBQUM7WUFJcEQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNQLElBQUksQ0FBQyxhQUFhLEdBQUcsZUFBZSxDQUFDO2dCQUNyQyxJQUFJLGNBQWMs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eEI7WUFDQyxxREFBcUQ7WUFDckQsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQztnQkFDdkIsU0FBUyxFQUFDLElBQUksQ0FBQyxTQUFTO2FBQ3hCLENBQUMsQ0FBQztRQUNKLENBQUM7UUFDRixvQkFBQztJQUFELENBQUMsQUFURCxDQUFtQyxvQkFBb0IsR0FTdEQ7SUFUWSx5QkFBYSxnQkFTekIsQ0FBQTtBQUNGLENBQUMsRUFocEJNLFdBQVcsS0FBWCxXQUFXLFFBZ3BCakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRUREQXV0b2NvbXBsZXRlLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJVdGwudHNcIiAvPlxuXG5cbi8vIENyZWF0ZXMgYSBkaXYgZWxlbWVudCB3aXRoIHRoZSBnaXZlbiBzdHlsaW5nLCBvcHRpb25hbGx5IGhpZGRlbiBieSBkZWZhdWx0LFxuLy8gYW5kIHByb3ZpZGVzIGEgbWVhbnMgdG8gaGlkZSBvciBzaG93IGl0LlxuXG5cbm1vZHVsZSBFRERFZGl0YWJsZSB7XG5cblxuXHQvLyBUT0RPOiBGb3IgZWRpdGFibGUgZmllbGRzIGJ1aWx0IGVudGlyZWx5IG9uIHRoZSBmcm9udC1lbmQsIHdpdGggbm9cblx0Ly8gcHJlLWV4aXN0aW5nIGlucHV0IGVsZW1lbnRzLCB3ZSBuZWVkIGEgd2F5IHRvIHNwZWNpZnkgdGhlIGRlZmF1bHQgdmFsdWUuXG5cdGV4cG9ydCBjbGFzcyBFZGl0YWJsZUVsZW1lbnQge1xuXG5cdFx0cGFyZW50RWxlbWVudDpIVE1MRWxlbWVudDtcblx0XHRlbGVtZW50OkhUTUxFbGVtZW50O1xuXHRcdGVsZW1lbnRKUTpKUXVlcnk7XG5cblx0XHRzdGF0aWMgX3VuaXF1ZUluZGV4ID0gMTtcblx0XHRpZDpzdHJpbmc7XG5cblx0XHRpbnB1dEVsZW1lbnQ6YW55O1xuXHRcdGVkaXRCdXR0b25FbGVtZW50OkhUTUxFbGVtZW50O1xuXHRcdGFjY2VwdEJ1dHRvbkVsZW1lbnQ6SFRNTEVsZW1lbnQ7XG5cdFx0Y2FuY2VsQnV0dG9uRWxlbWVudDpIVE1MRWxlbWVudDtcblx0XHR3YWl0QnV0dG9uRWxlbWVudDpIVE1MRWxlbWVudDtcblx0XHRlZGl0Q29udHJvbHNQb3NpdGlvbmVyOmFueTtcblx0XHRlZGl0Q29udHJvbHNDb250YWluZXI6YW55O1xuXHRcdG1pbmltdW1Sb3dzOiBudW1iZXI7XG5cdFx0bWF4aW11bVJvd3M6IG51bWJlcjtcblx0XHQvLyBEZWNsYXJpbmcgdGhpcyBpbnRvIGEgdmFyaWFibGUgZHVyaW5nIGluc3RhbnRpYXRpb24sXG5cdFx0Ly8gc28gd2hlIGNhbiBcIi5vZmZcIiB0aGUgZXZlbnQgdXNpbmcgdGhlIHJlZmVyZW5jZS5cblx0XHRrZXlFU0NIYW5kbGVyOiBhbnk7XG5cdFx0a2V5RW50ZXJIYW5kbGVyOiBhbnk7XG5cblx0XHRzdGF0aWMgX3ByZXZFZGl0YWJsZUVsZW1lbnQ6YW55ID0gbnVsbDtcblxuXG5cdFx0Ly8gVGhpcyBjb25zdHJ1Y3RvciBhY2NlcHRzIGEgcHJlLWV4aXN0aW5nIGVkaXRhYmxlIGVsZW1lbnQsIGluIHRoZSBmb3JtIG9mXG5cdFx0Ly8gYSBkaXYgd2l0aCB0aGUgY2xhc3MgJ2VkaXRhYmxlLWZpZWxkJywgb3IgYSByZWZlcmVuY2UgdG8gYSBjb250YWluZXJcblx0XHQvLyB3aGVyZSB0aGUgZWRpdGFibGUgZWxlbWVudCB3aWxsIGJlIGNyZWF0ZWQuXG5cdFx0Ly8gICBJdCBkaXN0aW5ndWlzaGVzIHRoZSB0d28gY2FzZXMgYnkgbG9va2luZyBmb3IgdGhlIGNsYXNzICdlZGl0YWJsZS1maWVsZCdcblx0XHQvLyBvbiB0aGUgcHJvdmlkZWQgZWxlbWVudC5cblx0XHQvLyAgIElmIG5vIGVsZW1lbnQgaXMgcHJvdmlkZWQsIHRoZSBjbGFzcyBjcmVhdGVzIGFuIGVsZW1lbnQgYW5kIGFzc3VtZXNcblx0XHQvLyBpdCB3aWxsIGJlIGFkZGVkIHRvIHRoZSBET00gbGF0ZXIgYnkgYSBjYWxsIHRvIGl0cyBhcHBlbmRUbyBtZXRob2QsIHdoaWNoXG5cdFx0Ly8gcHJvdmlkZXMgYSBwYXJlbnQgZWxlbWVudC5cblx0XHRjb25zdHJ1Y3RvcihwYXJlbnRPckVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzdHlsZT86IHN0cmluZykge1xuXHRcdFx0Ly8gSWYgd2UndmUgYmVlbiBnaXZlbiBubyBlbGVtZW50LCBtYWtlIG9uZS5cblx0XHRcdGlmICghcGFyZW50T3JFbGVtZW50KSB7XG5cdFx0ICAgICAgICB0aGlzLmVsZW1lbnRKUSA9ICQoJzxkaXYvPicpLmFkZENsYXNzKHN0eWxlIHx8ICcnKTtcblx0XHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0XHRcdC8vIElmIHdlIGhhdmUgYW4gZWxlbWVudCwgYW5kIGl0IGxvb2tzIGxpa2UgYW4gZWRpdGFibGUgZmllbGQsXG5cdFx0XHQvLyB1c2UgaXQsIGFuZCBmaW5kIGl0cyBwYXJlbnQuXG5cdFx0XHR9IGVsc2UgaWYgKCQocGFyZW50T3JFbGVtZW50KS5oYXNDbGFzcygnZWRpdGFibGUtZmllbGQnKSkge1xuXHQgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUSA9ICQocGFyZW50T3JFbGVtZW50KTtcblx0XHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50ID0gcGFyZW50T3JFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHQvLyBJZiBpdCdzIG5vdCBhbiBlZGl0YWJsZSBmaWVsZCwgZGVjbGFyZSBpdCBhIHBhcmVudCxcblx0XHRcdC8vIGFuZCBnbyBsb29raW5nIGZvciBhIGNoaWxkIHRoYXQgbWlnaHQgYmUgYSBwcmUtZXhpc3Rpbmdcblx0XHRcdC8vIGVkaXRhYmxlIGZpZWxkLlxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50ID0gcGFyZW50T3JFbGVtZW50O1xuXHRcdFx0XHR2YXIgcG90ZW50aWFsRmllbGQgPSAkKHBhcmVudE9yRWxlbWVudCkuY2hpbGRyZW4oJy5lZGl0YWJsZS1maWVsZCcpLmZpcnN0KCk7XG5cdFx0XHRcdGlmIChwb3RlbnRpYWxGaWVsZC5sZW5ndGggPT0gMSkge1xuXHRcdCAgICAgICAgICAgIHRoaXMuZWxlbWVudEpRID0gcG90ZW50aWFsRmllbGQ7XG5cdFx0ICAgICAgIFx0Ly8gTm8gZmllbGQ/ICBNYWtlIG9uZSBhbmQgYWRkIGl0IHVuZGVyIHRoZSBwYXJlbnQuXG5cdFx0ICAgICAgICB9IGVsc2Uge1xuXHRcdCAgICAgICAgXHQvLyBTdHlsaW5nIHdpbGwgYmUgc2V0IGxhdGVyIHdpdGggc2V0RGVmYXVsdFN0eWxpbmcoKVxuXHRcdFx0ICAgICAgICB0aGlzLmVsZW1lbnRKUSA9ICQoJzxkaXYvPicpLmFkZENsYXNzKHN0eWxlIHx8ICcnKTtcblx0XHQgICAgICAgICAgICB0aGlzLmVsZW1lbnRKUS5hcHBlbmRUbyhwYXJlbnRPckVsZW1lbnQpO1xuXHRcdCAgICAgICBcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuZWxlbWVudCA9IHRoaXMuZWxlbWVudEpRLmdldCgwKTtcblxuXHRcdFx0dmFyIGlkID0gRWRpdGFibGVFbGVtZW50Ll91bmlxdWVJbmRleC50b1N0cmluZygpO1xuXHRcdFx0RWRpdGFibGVFbGVtZW50Ll91bmlxdWVJbmRleCArPSAxO1xuXHRcdFx0dGhpcy5pZCA9IGlkO1xuICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEuZGF0YSgnZWRkJywgeydlZGl0YWJsZWVsZW1lbnRvYmonOiB0aGlzfSk7XG5cblx0XHRcdHRoaXMuaW5wdXRFbGVtZW50ID0gbnVsbDtcblx0XHRcdHRoaXMubWluaW11bVJvd3MgPSBudWxsO1xuXHRcdFx0dGhpcy5tYXhpbXVtUm93cyA9IG51bGw7XG5cblx0XHRcdC8vIEZvciBhdHRhY2hpbmcgdG8gdGhlIGRvY3VtZW50XG5cdFx0XHR0aGlzLmtleUVTQ0hhbmRsZXIgPSAoZSkgPT4ge1xuXHRcdFx0XHQvLyBFU0NBUEUga2V5LiBDYW5jZWwgb3V0LlxuXHRcdFx0XHRpZiAoZS53aGljaCA9PSAyNykgeyB0aGlzLmNhbmNlbEVkaXRpbmcoKTsgfVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRm9yIGF0dGFjaGluZyB0byB0aGUgaW5wdXQgZWxlbWVudFxuXHRcdFx0dGhpcy5rZXlFbnRlckhhbmRsZXIgPSAoZSkgPT4ge1xuXHRcdFx0XHQvLyBFTlRFUiBrZXkuIENvbW1pdCB0aGUgY2hhbmdlcy5cblx0XHRcdFx0aWYgKGUud2hpY2ggPT0gMTMpIHsgdGhpcy5iZWdpbkVkaXRDb21taXQoKTsgfVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5zZXRVcE1haW5FbGVtZW50KCk7XG5cdFx0XHR0aGlzLmdlbmVyYXRlQ29udHJvbHNDb250YWluZXIoKTtcblx0XHRcdHRoaXMuZ2VuZXJhdGVDb250cm9sQnV0dG9ucygpO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5jbGljayh0aGlzLmNsaWNrVG9FZGl0SGFuZGxlci5iaW5kKHRoaXMpKTtcblxuXHRcdFx0Ly8gSWYgdGhlIGVsZW1lbnQgaXMgc3R5bGVkIHRvIGJlIGFjdGl2ZSB3aGlsZSB3ZSdyZSBzZXR0aW5nIGl0IHVwLFxuXHRcdFx0Ly8gYXNzdW1lIHRoYXQgd2Ugc2hvdWxkIGltbWVkaWF0ZWx5IGVudGVyICdlZGl0JyBtb2RlLlxuXHRcdFx0Ly8gTm90ZSB0aGF0IGR1ZSB0byB0aGUgY2FzY2FkaW5nIG5hdHVyZSBvZiB0aGUgaGFuZGxlciBmb3IgdHJpZ2dlcmluZ1xuXHRcdFx0Ly8gZWRpdGluZyBtb2RlLCBvbmx5IG9uZSBlZGl0YWJsZSBlbGVtZW50IG9uIHRoZSBwYWdlIHdpbGwgYWN0dWFsbHlcblx0XHRcdC8vIGVuZCB1cCBhY3RpdmUgLSB0aGUgbGFzdCBvbmUgc3R5bGVkIGFzICdhY3RpdmUnIGluIHRoZSBET00uXG5cdFx0XHR0aGlzLnNldERlZmF1bHRTdHlsaW5nKCk7XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50SlEuaGFzQ2xhc3MoJ2FjdGl2ZScpKSB7XG5cdFx0XHRcdC8vIElmIHRoaXMgcmV0dXJucyB0cnVlLCB0aGVuIHdlIGhhdmUgZmFpbGVkIHRvIGFjdGl2YXRlIHRoZVxuXHRcdFx0XHQvLyBlbGVtZW50IGZvciBlZGl0aW5nIGZvciBzb21lIHJlYXNvbi4gIEZhbGwgdGhyb3VnaCB0b1xuXHRcdFx0XHQvLyBzZXR0aW5nIHRoZSBlbGVtZW50IGFzIGluYWN0aXZlLlxuXHRcdFx0XHRpZiAodGhpcy5jbGlja1RvRWRpdEhhbmRsZXIoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0SW5hY3RpdmVTdHlsaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2V0SW5hY3RpdmVTdHlsaW5nKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRlZGl0QWxsb3dlZCgpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXG5cdFx0Y2FuQ29tbWl0KHZhbHVlKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblxuXHRcdGdldFZhbHVlKCk6c3RyaW5nIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblxuXHRcdHNldFZhbHVlKHZhbHVlKSB7XG5cblx0XHR9XG5cblxuXHRcdG9uU3VjY2Vzcyh2YWx1ZSkge1xuXG5cdFx0fVxuXG5cblx0XHRibGFua0xhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gJyhjbGljayB0byBzZXQpJztcblx0XHR9XG5cblxuXHRcdG1ha2VGb3JtRGF0YSh2YWx1ZSk6YW55IHtcblx0ICAgICAgICB2YXIgZm9ybURhdGEgPSBuZXcgRm9ybURhdGEoKTtcblx0ICAgICAgICBmb3JtRGF0YS5hcHBlbmQoJ3ZhbHVlJywgdmFsdWUpO1xuXHQgICAgICAgIHJldHVybiBmb3JtRGF0YTtcblx0XHR9XG5cblxuXHRcdGdldEZvcm1VUkwoKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblxuXHRcdHNob3dWYWx1ZSgpIHtcblx0XHRcdHZhciBlID0gdGhpcy5lbGVtZW50O1xuICAgICAgICAgICAgdGhpcy5lbGVtZW50SlEuY2hpbGRyZW4oKS5kZXRhY2goKTtcblx0XHRcdHZhciB2ID0gdGhpcy5nZXREaXNwbGF5VmFsdWUoKTtcblx0XHRcdHZhciBibCA9IHRoaXMuYmxhbmtMYWJlbCgpO1xuXG5cdFx0XHRpZiAoYmwgJiYgKCh2ID09PSB1bmRlZmluZWQpIHx8ICh2ID09IG51bGwpIHx8ICh2ID09ICcnKSkpIHtcblx0XHRcdFx0ZS5pbm5lckhUTUwgPSAnPHNwYW4gc3R5bGU9XCJjb2xvcjojODg4XCI+JyArIGJsICsgJzwvc3Bhbj4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHQvLyBUaGlzIGlzIGNhbGxlZCBvbmUgdGltZSB0byBkbyBhbnkgbmVjZXNzYXJ5IG1hbmlwdWxhdGlvbiBvZiB0aGUgbWFpbiBlbGVtZW50XG5cdFx0Ly8gZHVyaW5nIHNldHVwLlxuXHRcdHNldFVwTWFpbkVsZW1lbnQoKSB7XG5cdFx0XHQvLyBXZSBuZWVkIHRvIGxvY2F0ZSwgb3IgY3JlYXRlLCBhbiBpbnB1dCBlbGVtZW50IGJlZm9yZVxuXHRcdFx0Ly8gd2UgZGVjaWRlIHdoaWNoIHN0eWxpbmcgdG8gYXBwbHkgdG8gaXQuXG5cdFx0XHR0aGlzLnNldHVwSW5wdXRFbGVtZW50KCk7XG5cblx0XHRcdGlmICgkKHRoaXMuaW5wdXRFbGVtZW50KS5pcygnaW5wdXQnKSkge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygnaG9yaXpvbnRhbEJ1dHRvbnMnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoZSBcInZlcnRpY2FsQnV0dG9uc1wiIGNsYXNzIGNoYW5nZXMgdGhlIHN0eWxpbmcgb2YgdGhlIGJ1dHRvbnMsXG5cdFx0XHRcdC8vIGFzIHdlbGwgYXMgdGhlIHN0eWxpbmcgb2YgdGhlIG1haW4gZWxlbWVudCBpdHNlbGYuXG5cdFx0XHRcdC8vIEZvciBleGFtcGxlIGl0IGdpdmVzIGVhY2ggYnV0dG9uIGEgc3R5bGUgb2YgXCJibG9ja1wiIGluc3RlYWQgb2YgXCJpbmxpbmUtYmxvY2tcIixcblx0XHRcdFx0Ly8gcHJldmVudGluZyB0aGUgYnV0dG9ucyBmcm9tIGFwcGVhcmluZyBzaWRlLWJ5LXNpZGUuXG5cdFx0XHRcdHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCd2ZXJ0aWNhbEJ1dHRvbnMnKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdC8vIEdlbmVyYXRlIGEgY29udGFpbmVyIGZvciB0aGUgZWRpdGluZyBidXR0b25zKHMpLCBhbmQgYSBwb3NpdGlvbmluZyBlbGVtZW50IHRvXG5cdFx0Ly8gcHV0IHRoZSBjb250cm9scyBpbiB0aGUgcmlnaHQgcGxhY2UgcmVsYXRpdmUgdG8gdGhlIG1haW4gZWxlbWVudC5cblx0XHRnZW5lcmF0ZUNvbnRyb2xzQ29udGFpbmVyKCkge1xuXHRcdFx0Ly8gVGhlIGNvbnRhaW5lciBpcyBhIGZsb2F0LXJpZ2h0IHNwYW4gdGhhdCBhcHBlYXJzIGF0IHRoZSByaWdodCBlZGdlXG5cdFx0XHQvLyBvZiB0aGUgY2VsbCBpbiB0aGUgbGF5b3V0LCBhbmQgdGhlIGljb25zIGNvbnN1bWUgc3BhY2Ugd2l0aGluLlxuXG5cdCAgICAgICAgdGhpcy5lZGl0Q29udHJvbHNQb3NpdGlvbmVyID0gJCgnPHNwYW4gY2xhc3M9XCJpY29uLXBvc2l0aW9uZXJcIi8+JylbMF07XG5cdCAgICAgICAgdGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIgPSAkKCc8c3BhbiBjbGFzcz1cImljb24tY29udGFpbmVyXCIvPicpWzBdO1xuXG5cdFx0XHR0aGlzLmVkaXRDb250cm9sc1Bvc2l0aW9uZXIuYXBwZW5kQ2hpbGQodGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIpO1xuXHRcdH1cblxuXG5cdFx0Ly8gSW5zdGFudGlhdGVzIGFuZCBzdG9yZXMgYWxsIHRoZSBidXR0b25zIHVzZWQgaW4gdGhlIGNvbnRyb2xzIGNvbnRhaW5lciBmb3IgbGF0ZXIgdXNlXG5cdFx0Z2VuZXJhdGVDb250cm9sQnV0dG9ucygpIHtcblx0ICAgICAgICB0aGlzLmVkaXRCdXR0b25FbGVtZW50ID0gJCgnPHNwYW4gY2xhc3M9XCJpY29uIGljb24tZWRpdFwiLz4nKVswXTtcblx0ICAgICAgICB0aGlzLmFjY2VwdEJ1dHRvbkVsZW1lbnQgPSAkKCc8c3BhbiBjbGFzcz1cImljb24gaWNvbi1hY2NlcHRcIi8+JylbMF07XG5cdCAgICAgICAgdGhpcy5jYW5jZWxCdXR0b25FbGVtZW50ID0gJCgnPHNwYW4gY2xhc3M9XCJpY29uIGljb24tY2FuY2VsXCIvPicpWzBdO1xuXHQgICAgICAgIHRoaXMud2FpdEJ1dHRvbkVsZW1lbnQgPSAkKCc8c3BhbiBjbGFzcz1cImljb24gd2FpdC1mYXN0ZXJcIi8+JylbMF07XG5cblx0XHRcdC8vIFdoZW4gcmVuZGVyaW5nIGNvbnRlbnRzIHRoYXQgaGF2ZSBiZWVuIGZsb2F0ZWQsIHNvbWUgYnJvd3NlcnMgd2lsbCBcIm1hZ2ljYWxseVwiIGNvbGxhcHNlIGFueXRoaW5nXG5cdFx0XHQvLyB0aGF0IGRvZXNuJ3QgY29udGFpbiBub24td2hpdGVzcGFjZSB0ZXh0IHRvIDAgd2lkdGgsIHJlZ2FyZGxlc3Mgb2Ygc3R5bGUgc2V0dGluZ3MuXG5cdFx0XHR0aGlzLmVkaXRCdXR0b25FbGVtZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFN0cmluZy5mcm9tQ2hhckNvZGUoMTYwKSkpO1x0Ly8gJm5ic3A7XG5cdFx0XHR0aGlzLmFjY2VwdEJ1dHRvbkVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoU3RyaW5nLmZyb21DaGFyQ29kZSgxNjApKSk7XG5cdFx0XHR0aGlzLmNhbmNlbEJ1dHRvbkVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoU3RyaW5nLmZyb21DaGFyQ29kZSgxNjApKSk7XG5cdFx0XHR0aGlzLndhaXRCdXR0b25FbGVtZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFN0cmluZy5mcm9tQ2hhckNvZGUoMTYwKSkpO1xuXG5cdFx0XHR0aGlzLmNhbmNlbEJ1dHRvbkVsZW1lbnQuc2V0QXR0cmlidXRlKCd0aXRsZScsICdDbGljayB0byBjYW5jZWwgZWRpdGluZy5cXG5Zb3UgY2FuIGFsc28gY2FuY2VsIGVkaXRpbmcgYnkgcHJlc3NpbmcgdGhlIEVTQyBrZXkuJyk7XG5cblx0XHRcdCQodGhpcy5hY2NlcHRCdXR0b25FbGVtZW50KS5jbGljayh0aGlzLmNsaWNrVG9BY2NlcHRIYW5kbGVyLmJpbmQodGhpcykpO1xuXHRcdFx0JCh0aGlzLmNhbmNlbEJ1dHRvbkVsZW1lbnQpLmNsaWNrKHRoaXMuY2xpY2tUb0NhbmNlbEhhbmRsZXIuYmluZCh0aGlzKSk7XG5cdFx0fVxuXG5cblx0XHQvLyBDaGFuZ2VzIHRoZSBzdHlsaW5nIG9mIHRoZSBjb250YWluZXIgZWxlbWVudCB0byBpbmRpY2F0ZSB0aGF0IGVkaXRpbmcgaXMgYWxsb3dlZCxcblx0XHQvLyBhbmQgYWRkcyBhIG1vdXNlLW92ZXIgY29udHJvbCB0byBlbmdhZ2UgZWRpdGluZy5cblx0XHRzZXRJbmFjdGl2ZVN0eWxpbmcoKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5hZGRDbGFzcygnaW5hY3RpdmUnKTtcbiAgICAgICAgICAgICQodGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIpLmNoaWxkcmVuKCkuZGV0YWNoKCk7XG5cdFx0XHR0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVkaXRCdXR0b25FbGVtZW50KTtcblx0XHR9XG5cblxuXHRcdC8vIENoYW5nZXMgdGhlIHN0eWxpbmcgb2YgdGhlIGNvbnRhaW5lciBlbGVtZW50IHRvIGluZGljYXRlIHRoYXQgZWRpdGluZyBpcyBhbGxvd2VkLFxuXHRcdC8vIGFuZCBhZGRzIGEgbW91c2Utb3ZlciBjb250cm9sIHRvIGVuZ2FnZSBlZGl0aW5nLlxuXHRcdHNldERlZmF1bHRTdHlsaW5nKCkge1xuXHRcdFx0dGhpcy5lbGVtZW50SlEuYWRkQ2xhc3MoJ2VkaXRhYmxlLWZpZWxkJyk7XG5cdFx0XHRpZiAodGhpcy5lZGl0QWxsb3dlZCgpKSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdlbmFibGVkJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnZW5hYmxlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnc2F2aW5nJyk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgJ2NsaWNrIHRvIGVkaXQnKTtcblxuXHRcdFx0dmFyIGMgPSB0aGlzLmVkaXRDb250cm9sc1Bvc2l0aW9uZXI7XG5cdFx0XHR2YXIgcCA9IHRoaXMuZWxlbWVudDtcblx0XHRcdC8vIFdlIHdhbnQgdGhpcyB0byBiZSB0aGUgZmlyc3QgZWxlbWVudCBzbyB0aGUgdmVydGljYWwgaGVpZ2h0IG9mIHRoZSByZXN0IG9mIHRoZSBjb250ZW50XG5cdFx0XHQvLyBkb2Vzbid0IGNhdXNlIGl0IHRvIGZsb2F0IGZhcnRoZXIgZG93biBzaWRlIG9mIHRoZSBjZWxsLlxuXHRcdFx0aWYgKHAuZmlyc3RDaGlsZCkge1xuXHRcdFx0XHRpZiAocC5maXJzdENoaWxkICE9IGMpIHtcblx0XHRcdFx0XHRwLmluc2VydEJlZm9yZShjLCBwLmZpcnN0Q2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwLmFwcGVuZENoaWxkKGMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0Ly8gSW5zdGFudGlhdGVzIHRoZSBmb3JtIGVsZW1lbnQocykgdXNlZCB3aGVuIGVkaXRpbmcgaXMgdGFraW5nIHBsYWNlLFxuXHRcdC8vIHdpdGggYXBwcm9wcmlhdGUgZXZlbnQgaGFuZGxlcnMgYW5kIHN0eWxpbmcsIGFuZCBhZGRzIHRoZW0gdG8gdGhlXG5cdFx0Ly8gY29udGFpbmVyIGVsZW1lbnQuXG5cdFx0c2V0VXBFZGl0aW5nTW9kZSgpIHtcblx0XHRcdHZhciBwVGhpcyA9IHRoaXM7XG5cblx0XHRcdHRoaXMuZWxlbWVudEpRLnJlbW92ZUNsYXNzKCdpbmFjdGl2ZScpO1xuXHRcdFx0dGhpcy5lbGVtZW50SlEucmVtb3ZlQ2xhc3MoJ3NhdmluZycpO1xuXHRcdFx0dGhpcy5lbGVtZW50SlEuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuXG5cdFx0XHR0aGlzLnNldHVwSW5wdXRFbGVtZW50KCk7XG5cblx0XHRcdHRoaXMuY2xlYXJFbGVtZW50Rm9yRWRpdGluZygpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuaW5wdXRFbGVtZW50KTtcblxuXHRcdFx0Ly8gUmVtZW1iZXIgd2hhdCB3ZSdyZSBlZGl0aW5nIGluIGNhc2UgdGhleSBjYW5jZWwgb3IgbW92ZSB0byBhbm90aGVyIGVsZW1lbnRcblx0XHRcdEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCA9IHRoaXM7XG5cblx0XHRcdC8vIFNldCBmb2N1cyB0byB0aGUgbmV3IGlucHV0IGVsZW1lbnQgQVNBUCBhZnRlciB0aGUgY2xpY2sgaGFuZGxlci5cblx0XHRcdC8vIFdlIGNhbid0IGp1c3QgZG8gdGhpcyBpbiBoZXJlIGJlY2F1c2UgdGhlIGJyb3dzZXIgd2lsbCBzZXQgdGhlIGZvY3VzIGl0c2VsZlxuXHRcdFx0Ly8gYWZ0ZXIgaXQncyBkb25lIGhhbmRsaW5nIHRoZSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGlzIG1ldGhvZC5cblx0XHRcdHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRwVGhpcy5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH0sIDApO1xuXHRcdFx0dGhpcy5zZXRVcEtleUhhbmRsZXIoKTtcblx0XHRcdC8vIFRPRE86IEhhbmRsZSBsb3NpbmcgZm9jdXMgKGluIHdoaWNoIGNhc2Ugd2UgY29tbWl0IGNoYW5nZXM/KVxuXHRcdH1cblxuXG5cdFx0Ly8gQXR0ZW1wdCB0byBsb2NhdGUgYSBwcmUtZXhpc3RpbmcgaW5wdXQgZWxlbWVudCBpbnNpZGUgdGhlXG5cdFx0Ly8gZWRpdGFibGUgYXJlYSwgYW5kIGlmIG9uZSBpcyBsb2NhdGVkLCB0YWtlIGl0cyB2YWx1ZSBhcyB0aGVcblx0XHQvLyBkZWZhdWx0IHZhbHVlIGZvciB0aGUgZmllbGQuICBJZiBubyBlbGVtZW50IGV4aXN0cywgbWFrZSBhIG5ldyBvbmUsXG5cdFx0Ly8gYW5kIGFzc3VtZSBpdCBzaG91bGQgYmUgYSB0ZXh0YXJlYS5cblx0XHRzZXR1cElucHV0RWxlbWVudCgpIHtcblx0XHRcdHZhciBkZXNpcmVkRm9udFNpemUgPSB0aGlzLmVsZW1lbnRKUS5jc3MoXCJmb250LXNpemVcIik7XG5cdFx0XHRpZiAoIXRoaXMuaW5wdXRFbGVtZW50KSB7XG5cdFx0XHRcdHZhciBwb3RlbnRpYWxJbnB1dCA9IHRoaXMuZWxlbWVudEpRLmNoaWxkcmVuKCdpbnB1dCcpLmZpcnN0KCk7XG5cdFx0XHRcdGlmIChwb3RlbnRpYWxJbnB1dC5sZW5ndGggPT0gMSkge1xuXHRcdCAgICAgICAgICAgIHRoaXMuaW5wdXRFbGVtZW50ID0gcG90ZW50aWFsSW5wdXQuZ2V0KDApO1xuXHRcdCAgICAgICAgfSBlbHNlIHtcblx0XHRcdFx0XHQvLyBGaWd1cmUgb3V0IGhvdyBoaWdoIHRvIG1ha2UgdGhlIHRleHQgZWRpdCBib3guXG5cdFx0XHRcdFx0dmFyIGxpbmVIZWlnaHQgPSBwYXJzZUludCggZGVzaXJlZEZvbnRTaXplLCAxMCApO1xuXHRcdFx0XHRcdHZhciBkZXNpcmVkTnVtTGluZXMgPSB0aGlzLmVsZW1lbnRKUS5oZWlnaHQoKSAvIGxpbmVIZWlnaHQ7XG5cdFx0XHRcdFx0ZGVzaXJlZE51bUxpbmVzID0gTWF0aC5mbG9vcihkZXNpcmVkTnVtTGluZXMpICsgMTtcblx0XHRcdFx0XHRpZiAodGhpcy5taW5pbXVtUm93cykge1xuXHRcdFx0XHRcdFx0ZGVzaXJlZE51bUxpbmVzID0gTWF0aC5tYXgoZGVzaXJlZE51bUxpbmVzLCB0aGlzLm1pbmltdW1Sb3dzKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5tYXhpbXVtUm93cykge1xuXHRcdFx0XHRcdFx0ZGVzaXJlZE51bUxpbmVzID0gTWF0aC5taW4oZGVzaXJlZE51bUxpbmVzLCB0aGlzLm1heGltdW1Sb3dzKVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChkZXNpcmVkTnVtTGluZXMgPiAxKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmlucHV0RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZXh0YXJlYVwiKTtcblx0XHRcdFx0XHRcdCQodGhpcy5pbnB1dEVsZW1lbnQpLmF0dHIoJ3Jvd3MnLCBkZXNpcmVkTnVtTGluZXMpXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5wdXRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuXHRcdFx0XHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQudHlwZSA9IFwidGV4dFwiO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFNldCB3aWR0aCBhbmQgaGVpZ2h0LlxuXHRcdFx0XHRcdHRoaXMuaW5wdXRFbGVtZW50LnN0eWxlLndpZHRoID0gXCIxMDAlXCI7XG5cblx0XHRcdFx0XHR0aGlzLmlucHV0RWxlbWVudC52YWx1ZSA9IHRoaXMuZ2V0VmFsdWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDb3B5IGZvbnQgYXR0cmlidXRlcyB0byBtYXRjaC5cblx0XHRcdFx0JCh0aGlzLmlucHV0RWxlbWVudCkuY3NzKCBcImZvbnQtZmFtaWx5XCIsIHRoaXMuZWxlbWVudEpRLmNzcyhcImZvbnQtZmFtaWx5XCIpICk7XG5cdFx0XHRcdCQodGhpcy5pbnB1dEVsZW1lbnQpLmNzcyggXCJmb250LXNpemVcIiwgZGVzaXJlZEZvbnRTaXplICk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHQvLyBTdXBwb3J0IGZ1bmN0aW9uIGZvciBzZXRVcEVkaXRpbmdNb2RlLlxuXHRcdC8vIFRha2VzIHRoZSBjb250YWluZXIgZWxlbWVudCB0aGF0IHdlIGFyZSB1c2luZyBhcyBhbiBlZGl0YWJsZSBlbGVtZW50LFxuXHRcdC8vIGFuZCBjbGVhcnMgaXQgb2YgYWxsIGNvbnRlbnQsIHRoZW4gcmUtYWRkcyB0aGUgYmFzaWMgZWRpdCBjb250cm9sIHdpZGdldHMuXG5cdFx0Y2xlYXJFbGVtZW50Rm9yRWRpdGluZygpIHtcblx0XHRcdC8vIENsZWFyIHRoZSBlbGVtZW50IG91dFxuXHRcdFx0dGhpcy5lbGVtZW50SlEuY29udGVudHMoKS5kZXRhY2goKTtcdC8vIGNoaWxkcmVuKCkgZG9lcyBub3QgY2FwdHVyZSB0ZXh0IG5vZGVzXG5cdFx0XHQvLyBSZS1hZGQgdGhlIGNvbnRyb2xzIGFyZWFcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmVkaXRDb250cm9sc1Bvc2l0aW9uZXIpO1xuXHRcdFx0JCh0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lcikuY2hpbGRyZW4oKS5kZXRhY2goKTtcblx0XHRcdHRoaXMuZWRpdENvbnRyb2xzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuYWNjZXB0QnV0dG9uRWxlbWVudCk7XG5cdFx0XHR0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmNhbmNlbEJ1dHRvbkVsZW1lbnQpO1xuXHRcdFx0Ly90aGlzLmVkaXRCdXR0b25FbGVtZW50LmNsYXNzTmFtZSA9IFwiaWNvbiBpY29uLWVkaXRcIjtcblx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3RpdGxlJyk7XG5cdFx0fVxuXG5cblx0XHRjbGlja1RvRWRpdEhhbmRsZXIoKTpib29sZWFuIHtcblx0XHRcdGlmICghdGhpcy5lZGl0QWxsb3dlZCgpKSB7XG5cdFx0XHRcdC8vIEVkaXRpbmcgbm90IGFsbG93ZWQ/ICBUaGVuIHRoaXMgaGFzIG5vIGVmZmVjdC5cblx0XHRcdFx0Ly8gTGV0IHRoZSBzeXN0ZW0gaGFuZGxlIHRoaXMgZXZlbnQuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCAhPSBudWxsKSB7XG5cdFx0XHRcdGlmICh0aGlzID09PSBFZGl0YWJsZUVsZW1lbnQuX3ByZXZFZGl0YWJsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHQvLyBUaGV5J3JlIGFscmVhZHkgZWRpdGluZyB0aGlzIGVsZW1lbnQuIERvbid0IHJlLXNldHVwIGV2ZXJ5dGhpbmcuXG5cdFx0XHRcdFx0Ly8gUmV0dXJuaW5nIHRydWUgbGV0cyB0aGUgc3lzdGVtIGhhbmRsZSB0aGlzIG1vdXNlIGNsaWNrLlxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFRoZXkgd2VyZSBhbHJlYWR5IGVkaXRpbmcgc29tZXRoaW5nLCBzbyByZXZlcnQgdGhvc2UgY2hhbmdlcy5cblx0XHRcdFx0XHRFZGl0YWJsZUVsZW1lbnQuX3ByZXZFZGl0YWJsZUVsZW1lbnQuY2FuY2VsRWRpdGluZygpO1xuXHRcdFx0XHRcdEVkaXRhYmxlRWxlbWVudC5fcHJldkVkaXRhYmxlRWxlbWVudCA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0VXBFZGl0aW5nTW9kZSgpO1xuXHRcdFx0Ly8gUmV0dXJuaW5nIGZhbHNlIG1lYW5zIHRvIHN0b3AgaGFuZGxpbmcgdGhlIG1vdXNlIGNsaWNrLCB3aGljaCByZXNwZWN0cyBvdXIgaW5wdXRFbGVtZW50LnNlbGVjdCgpIGNhbGwuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cblx0XHRjYW5jZWxFZGl0aW5nKCkge1xuXHRcdFx0dmFyIHBUaGlzID0gdGhpcztcblx0XHRcdHZhciBlbGVtZW50ID0gdGhpcy5lbGVtZW50O1xuXG5cdFx0XHR0aGlzLnJlbW92ZUtleUhhbmRsZXIoKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBpbnB1dCBib3guXG5cdFx0XHRpZiAodGhpcy5pbnB1dEVsZW1lbnQgJiYgdGhpcy5pbnB1dEVsZW1lbnQucGFyZW50Tm9kZSkge1xuXHRcdFx0XHR0aGlzLmlucHV0RWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuaW5wdXRFbGVtZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgbWFuaXB1bGF0ZWQgdGhlIHNpemUgb2YgdGhlXG5cdFx0XHQvLyBjb250YWluZXIgZWxlbWVudCB0byBnaXZlIHRoZSBtYXhpbXVtIGF2YWlsYWJsZSBzcGFjZSBmb3IgZWRpdGluZy5cblx0XHRcdC8vIFdlIHNob3VsZCBhdHRlbXB0IHRvIHJlc2V0IHRoYXQuXG5cdFx0XHQvLyBXZSBjYW4ndCBqdXN0IHJlYWQgdGhlIG9sZCB3aWR0aCBvdXQgYW5kIHNhdmUgaXQsIHRoZW4gcmUtaW5zZXJ0IGl0IG5vdywgYmVjYXVzZVxuXHRcdFx0Ly8gdGhhdCBtYXkgcGVybWFuZW50bHkgZml4IHRoZSBlbGVtZW50IGF0IGEgd2lkdGggdGhhdCBpdCBtYXkgaGF2ZSBvbmx5IGhhZFxuXHRcdFx0Ly8gYmVmb3JlIGJlY2F1c2Ugb2YgZXh0ZXJuYWwgbGF5b3V0IGZhY3RvcnMuXG5cdFx0XHQvL3RoaXMuZWxlbWVudC5zdHlsZS53aWR0aCA9ICcnO1x0Ly8gKE5vdCBkb2luZyB0aGlzIGZvciBub3cpXG5cblx0XHRcdC8vIFJlc3RvcmUgdGhlIGNvbnRlbnQuXG5cdFx0XHR0aGlzLnNob3dWYWx1ZSgpO1xuXHRcdFx0Ly8gUmUtYWRkIHRoZSBkZWZhdWx0IGVkaXRpbmcgd2lkZ2V0cnlcblx0XHRcdHRoaXMuc2V0RGVmYXVsdFN0eWxpbmcoKTtcblx0XHRcdHRoaXMuc2V0SW5hY3RpdmVTdHlsaW5nKCk7XG5cdFx0XHRFZGl0YWJsZUVsZW1lbnQuX3ByZXZFZGl0YWJsZUVsZW1lbnQgPSBudWxsO1xuXHRcdH1cblxuXG5cdFx0YmVnaW5FZGl0Q29tbWl0KCkge1xuXHRcdFx0dmFyIHZhbHVlID0gdGhpcy5nZXRFZGl0ZWRWYWx1ZSgpO1xuXHRcdFx0aWYgKCF0aGlzLmNhbkNvbW1pdCh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXRVcENvbW1pdHRpbmdJbmRpY2F0b3IoKTtcblx0XHRcdHRoaXMuY29tbWl0KCk7XG5cdFx0fVxuXG5cblx0XHQvLyBTdWJjbGFzcyB0aGlzIGlmIHlvdXIgbmVlZCBhIGRpZmZlcmVudCBzdWJtaXQgYmVoYXZpb3IgYWZ0ZXIgdGhlIFVJIGlzIHNldCB1cC5cblx0XHRjb21taXQoKSB7XG5cdFx0XHR2YXIgZGVidWcgPSBmYWxzZTtcblx0XHRcdHZhciB2YWx1ZSA9IHRoaXMuZ2V0RWRpdGVkVmFsdWUoKTtcblx0XHRcdHZhciBwVGhpcyA9IHRoaXM7XG5cbiAgICAgICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICAgICAgJ3VybCc6IHRoaXMuZ2V0Rm9ybVVSTCgpLFxuICAgICAgICAgICAgICAgICd0eXBlJzogJ1BPU1QnLFxuXHRcdFx0XHQnY2FjaGUnOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAnZGF0YSc6IHRoaXMubWFrZUZvcm1EYXRhKHZhbHVlKSxcblx0XHRcdFx0J3N1Y2Nlc3MnOiBmdW5jdGlvbihyZXNwb25zZSkge1xuXHRcdFx0XHRcdGlmIChyZXNwb25zZS50eXBlID09IFwiU3VjY2Vzc1wiKSB7XG5cdFx0XHRcdFx0XHRwVGhpcy5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRwVGhpcy5vblN1Y2Nlc3ModmFsdWUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhbGVydChcIkVycm9yOiBcIiArIHJlc3BvbnNlLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwVGhpcy5jYW5jZWxFZGl0aW5nKCk7XG4gICAgICAgICAgICAgICAgfSxcblx0XHRcdFx0J2Vycm9yJzogZnVuY3Rpb24oIGpxWEhSLCB0ZXh0U3RhdHVzLCBlcnJvclRocm93biApIHtcblx0XHRcdFx0XHRpZiAoZGVidWcpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKHRleHRTdGF0dXMgKyAnICcgKyBlcnJvclRocm93bik7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhqcVhIUi5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwVGhpcy5jYW5jZWxFZGl0aW5nKCk7XHQvLyBUT0RPOiBCZXR0ZXIgcmVwb25zZSBpbiBVSSBmb3IgdXNlclxuXHRcdFx0XHR9XG4gICAgICAgICAgICB9KTtcblx0XHR9XG5cblxuXHRcdC8vIFRoaXMgY2hhbmdlcyB0aGUgVUkgdG8gYSB0aGlyZCBzdGF0ZSBjYWxsZWQgJ3NhdmluZycgdGhhdCBpcyBkaWZmZXJlbnQgZnJvbSAnYWN0aXZlJyBvciAnaW5hY3RpdmUnLlxuXHRcdHNldFVwQ29tbWl0dGluZ0luZGljYXRvcigpIHtcblx0XHRcdHdoaWxlICh0aGlzLmVkaXRDb250cm9sc0NvbnRhaW5lci5maXJzdENoaWxkKSB7XG5cdFx0XHRcdHRoaXMuZWRpdENvbnRyb2xzQ29udGFpbmVyLnJlbW92ZUNoaWxkKHRoaXMuZWRpdENvbnRyb2xzQ29udGFpbmVyLmZpcnN0Q2hpbGQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lZGl0Q29udHJvbHNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy53YWl0QnV0dG9uRWxlbWVudCk7XG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnaW5hY3RpdmUnKTtcblx0XHRcdHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdzYXZpbmcnKTtcblx0XHR9XG5cblxuXHRcdGNsaWNrVG9BY2NlcHRIYW5kbGVyKCk6Ym9vbGVhbiB7XG5cdFx0XHR0aGlzLmJlZ2luRWRpdENvbW1pdCgpO1xuXHRcdFx0Ly8gU3RvcCBoYW5kbGluZyB0aGUgbW91c2UgY2xpY2tcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblxuXHRcdGNsaWNrVG9DYW5jZWxIYW5kbGVyKCk6Ym9vbGVhbiB7XG5cdFx0XHR0aGlzLmNhbmNlbEVkaXRpbmcoKTtcblx0XHRcdC8vIFN0b3AgaGFuZGxpbmcgdGhlIG1vdXNlIGNsaWNrXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cblx0XHQvLyBIYW5kbGUgc3BlY2lhbCBrZXlzIGxpa2UgZW50ZXIgYW5kIGVzY2FwZS5cblx0XHQvLyBXZSdyZSBkb2luZyBpdCB0aGlzIHdheSBiZWNhdXNlIHdlIG9ubHkgZXZlciB3YW50IG9uZVxuXHRcdC8vIEVkaXRhYmxlRWxlbWVudCByZXNwb25kaW5nIHRvIGFuIEVTQyBvciBhbiBFbnRlciBhdCBhIHRpbWUsXG5cdFx0Ly8gYW5kIHRoaXMgaXMgYWN0dWFsbHkgbGVzcyBtZXNzeSB0aGFuIGF0dGFjaGluZyBhIGdlbmVyaWNcblx0XHQvLyBldmVudCBoYW5kbGVyIHRvIHRoZSBkb2N1bWVudCBhbmQgdGhlbiBmZXJyZXRpbmcgb3V0IHRoZVxuXHRcdC8vIGludGVuZGVkIG9iamVjdCBmcm9tIHRoZSBET00uXG5cdFx0Ly8gVGhlcmUgaXMgbm8gcG9sbHV0aW9uIGZyb20gbXVsdGlwbGUgaGFuZGxlcnMgYmVjYXVzZSBldmVyeSB0aW1lIHdlXG5cdFx0Ly8gYWRkIG9uZSwgd2UgcmVtb3ZlIHRoZSBwcmV2aW91cy4gIChTZWUgY2xpY2tUb0VkaXRIYW5kbGVyKVxuXHRcdHNldFVwS2V5SGFuZGxlcigpIHtcblx0XHRcdCQoPGFueT5kb2N1bWVudCkub24oJ2tleWRvd24nLCB0aGlzLmtleUVTQ0hhbmRsZXIpO1xuXHRcdFx0JCh0aGlzLmlucHV0RWxlbWVudCkub24oJ2tleWRvd24nLCB0aGlzLmtleUVudGVySGFuZGxlcik7XG5cdFx0fVxuXG5cblx0XHRyZW1vdmVLZXlIYW5kbGVyKCkge1xuXHQgICAgICAgICQoPGFueT5kb2N1bWVudCkub2ZmKCdrZXlkb3duJywgdGhpcy5rZXlFU0NIYW5kbGVyKTtcblx0XHRcdCQodGhpcy5pbnB1dEVsZW1lbnQpLm9mZigna2V5ZG93bicsIHRoaXMua2V5RW50ZXJIYW5kbGVyKTtcblx0XHR9XG5cblxuXHRcdGFwcGVuZFRvKGVsKSB7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBlbDtcblx0XHRcdGVsLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG5cdFx0fVxuXG5cblx0XHRhcHBlbmRDaGlsZChlbCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGVsKTtcblx0XHR9XG5cblxuXHRcdGNsZWFyKCkge1xuXHRcdFx0d2hpbGUgKHRoaXMuZWxlbWVudC5sYXN0Q2hpbGQpIHtcblx0XHRcdFx0JCh0aGlzLmVsZW1lbnQubGFzdENoaWxkKS5kZXRhY2goKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdHZpc2libGUoZW5hYmxlOmJvb2xlYW4pIHtcblx0XHRcdGlmIChlbmFibGUpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50SlEucmVtb3ZlQ2xhc3MoJ29mZicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50SlEuYWRkQ2xhc3MoJ29mZicpO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0Ly8gT3ZlcnJpZGUgaWYgdGhlIHZhbHVlIG9mIHRoZSBmaWVsZCBuZWVkcyB0byBiZSBwb3N0LXByb2Nlc3NlZCBiZWZvcmUgYmVpbmcgZGlzcGxheWVkLlxuXHRcdGdldERpc3BsYXlWYWx1ZSgpOnN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuXHRcdH1cblxuXG5cdFx0Z2V0RWRpdGVkVmFsdWUoKTphbnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5wdXRFbGVtZW50LnZhbHVlO1xuXHRcdH1cblx0fVxuXG5cblxuXHRleHBvcnQgY2xhc3MgRWRpdGFibGVBdXRvY29tcGxldGUgZXh0ZW5kcyBFZGl0YWJsZUVsZW1lbnQge1xuXG5cdFx0YXV0b0NvbXBsZXRlT2JqZWN0OkVEREF1dG8uQmFzZUF1dG87XG5cblxuXHRcdGNvbnN0cnVjdG9yKGlucHV0RWxlbWVudDogSFRNTEVsZW1lbnQpIHtcblx0XHRcdHN1cGVyKGlucHV0RWxlbWVudCk7XG5cdFx0XHR0aGlzLmF1dG9Db21wbGV0ZU9iamVjdCA9IG51bGw7XG5cdFx0fVxuXG5cblx0XHRzZXRVcE1haW5FbGVtZW50KCkge1xuXHRcdFx0dGhpcy5lbGVtZW50SlEuYWRkQ2xhc3MoJ2hvcml6b250YWxCdXR0b25zJyk7XG5cdFx0fVxuXG5cblx0XHQvLyBPdmVycmlkZSB0aGlzIHdpdGggeW91ciBzcGVjaWZpYyBhdXRvY29tcGxldGUgdHlwZVxuXHRcdGNyZWF0ZUF1dG9Db21wbGV0ZU9iamVjdChvcHQ/OkVEREF1dG8uQXV0b2NvbXBsZXRlT3B0aW9ucyk6RUREQXV0by5CYXNlQXV0byB7XG5cdFx0XHQvLyBDcmVhdGUgYW4gaW5wdXQgZmllbGQgdGhhdCB0aGUgdXNlciBjYW4gZWRpdCB3aXRoLlxuXHRcdFx0cmV0dXJuIG5ldyBFRERBdXRvLlVzZXIoJC5leHRlbmQoe30sIG9wdCkpO1xuXHRcdH1cblxuXG5cdFx0Ly8gVGhpcyBlaXRoZXIgcmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgYXV0b2NvbXBsZXRlIG9iamVjdCxcblx0XHQvLyBvciBpZiBuZWNlc3NhcnksIGNyZWF0ZXMgYSBuZXcgb25lIGFuZCBwcmVwYXJlcyBpdCwgdGhlbiByZXR1cm5zIGl0LlxuXHRcdC8vIFRPRE86IEZvciBlZGl0YWJsZSBhdXRvY29tcGxldGUgZmllbGRzIGJ1aWx0IGVudGlyZWx5IG9uIHRoZSBmcm9udC1lbmQsXG5cdFx0Ly8gd2UgbmVlZCB0byBwYXNzIGRvd24gYSBkZWZhdWx0IHZhbHVlLlxuXHRcdC8vIE5vdGUgdGhhdCB0aGlzIGRvZXMgbm90IGRvIGFueSB0eXBlIGNoZWNraW5nIG9mIHByZS1leGlzdGluZyBhdXRvY29tcGxldGVcblx0XHQvLyBlbGVtZW50cyAtIHRoYXQgaXMsIGl0IGRvZXMgbm90IGNoZWNrIHRoZSBlZGRhdXRvY29tcGxldGV0eXBlIGF0dHJpYnV0ZSB0b1xuXHRcdC8vIG1ha2Ugc3VyZSB0aGF0IGl0IG1hdGNoZXMgdGhlIHR5cGUgdGhhdCBpdCB3aWxsIGF0dGVtcHQgdG8gY3JlYXRlLlxuXHRcdC8vIEZvciBleGFtcGxlLCBhbiBFZGl0YWJsZUF1dG9jb21wbGV0ZSBzdWJjbGFzcyBmb3IgVXNlciB3aWxsIGFsd2F5cyBhc3N1bWVcblx0XHQvLyB0aGUgaW5wdXQgZWxlbWVudHMgaXQgZmluZHMgYXJlIGZvciBhIFVzZXIgYXV0b2NvbXBsZXRlIHR5cGUuXG5cdFx0Z2V0QXV0b0NvbXBsZXRlT2JqZWN0KCk6RUREQXV0by5CYXNlQXV0byB7XG5cblx0XHRcdHZhciB2aXNpYmxlSW5wdXQgPSB0aGlzLmVsZW1lbnRKUS5jaGlsZHJlbignaW5wdXRbdHlwZT1cInRleHRcIl0uYXV0b2NvbXAnKS5maXJzdCgpO1x0Ly8gJzpmaXJzdC1vZi10eXBlJyB3b3VsZCBiZSB3cm9uZyBoZXJlXG5cdFx0XHR2YXIgaGlkZGVuSW5wdXQgPSB0aGlzLmVsZW1lbnRKUS5jaGlsZHJlbignaW5wdXRbdHlwZT1cImhpZGRlblwiXScpLmZpcnN0KCk7XG5cdFx0XHR2YXIgYXV0b09iamVjdDpFRERBdXRvLkJhc2VBdXRvID0gbnVsbDtcblxuXHRcdFx0aWYgKHRoaXMuYXV0b0NvbXBsZXRlT2JqZWN0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmF1dG9Db21wbGV0ZU9iamVjdDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgd2UgZm91bmQgYW4gaW5wdXQsIHdlIGNhbiBjaGVjayBmb3IgYW4gYXV0b2NvbXBsZXRlIG9iamVjdCBhbHJlYWR5IGF0dGFjaGVkIHRvIGl0LlxuXHRcdFx0Ly8gVGhpcyBpcyByZXF1aXJlZCBiZWNhdXNlIEVEREF1dG8uQmFzZUF1dG8uaW5pdFByZWV4aXN0aW5nKCkgbWF5IGhhdmUgc3BpZGVyZWQgdGhyb3VnaCBhbmRcblx0XHRcdC8vIG1hZGUgb25lIGFsZWFkeS5cblxuXHRcdFx0aWYgKHZpc2libGVJbnB1dC5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgZWRkRGF0YSA9IHZpc2libGVJbnB1dC5kYXRhKCdlZGQnKTtcbiAgICAgICAgICAgICAgICBpZiAoZWRkRGF0YSkge1xuICAgICAgICAgICAgICAgIFx0YXV0b09iamVjdCA9IGVkZERhdGEuYXV0b2NvbXBsZXRlb2JqO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWF1dG9PYmplY3QgJiYgKGhpZGRlbklucHV0Lmxlbmd0aCAhPT0gMCkpIHtcblx0XHRcdFx0XHRhdXRvT2JqZWN0ID0gdGhpcy5jcmVhdGVBdXRvQ29tcGxldGVPYmplY3Qoe1xuXHRcdFx0XHRcdFx0Y29udGFpbmVyOnRoaXMuZWxlbWVudEpRLFxuXHRcdFx0XHRcdFx0dmlzaWJsZUlucHV0OnZpc2libGVJbnB1dCxcblx0XHRcdFx0XHRcdGhpZGRlbklucHV0OmhpZGRlbklucHV0XG5cdFx0XHRcdFx0fSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgYWxsIGVsc2UgZmFpbHMgKG9uZSBpbnB1dCBtaXNzaW5nLCBubyBlZGREYXRhLCBvciBubyBhdXRvY29tcGxldGVvYmopLFxuICAgICAgICAgICAgLy8gbWFrZSBhIG5ldyBvYmplY3Qgd2l0aCBuZXcgZWxlbWVudHMuXG4gICAgICAgICAgICBpZiAoIWF1dG9PYmplY3QpIHtcblx0XHRcdFx0YXV0b09iamVjdCA9IHRoaXMuY3JlYXRlQXV0b0NvbXBsZXRlT2JqZWN0KHtcblx0XHRcdFx0XHRjb250YWluZXI6dGhpcy5lbGVtZW50SlFcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlT2JqZWN0ID0gYXV0b09iamVjdDtcblxuXHRcdFx0dmFyIGVsID0gYXV0b09iamVjdC52aXNpYmxlSW5wdXQ7XG5cdFx0XHQvLyBDb3B5IGZvbnQgYXR0cmlidXRlcyBmcm9tIG91ciB1bmRlcmx5aW5nIGNvbnRyb2wuXG5cdFx0XHQkKGVsKS5jc3MoXCJmb250LWZhbWlseVwiLCB0aGlzLmVsZW1lbnRKUS5jc3MoXCJmb250LWZhbWlseVwiKSk7XG5cdFx0XHQkKGVsKS5jc3MoXCJmb250LXNpemVcIiwgdGhpcy5lbGVtZW50SlEuY3NzKFwiZm9udC1zaXplXCIpKTtcblx0XHRcdC8vJChlbCkuY3NzKFwid2lkdGhcIiwgXCIxMDAlXCIpO1xuXG5cdFx0XHRyZXR1cm4gYXV0b09iamVjdDtcblx0XHR9XG5cblxuXHRcdHNldFVwRWRpdGluZ01vZGUoKSB7XG5cdFx0XHR2YXIgcFRoaXMgPSB0aGlzO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnRKUS5yZW1vdmVDbGFzcygnaW5hY3RpdmUnKTtcblx0XHRcdHRoaXMuZWxlbWVudEpRLnJlbW92ZUNsYXNzKCdzYXZpbmcnKTtcblx0XHRcdHRoaXMuZWxlbWVudEpRLmFkZENsYXNzKCdhY3RpdmUnKTtcblxuXHRcdFx0dmFyIGF1dG8gPSB0aGlzLmdldEF1dG9Db21wbGV0ZU9iamVjdCgpO1x0Ly8gQ2FsbGluZyB0aGlzIG1heSBzZXQgaXQgdXAgZm9yIHRoZSBmaXJzdCB0aW1lXG5cdFx0XHR0aGlzLmlucHV0RWxlbWVudCA9IGF1dG8udmlzaWJsZUlucHV0O1xuXG5cdFx0XHR0aGlzLmNsZWFyRWxlbWVudEZvckVkaXRpbmcoKTtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChhdXRvLnZpc2libGVJbnB1dFswXSk7XG5cblx0XHRcdC8vIFJlbWVtYmVyIHdoYXQgd2UncmUgZWRpdGluZyBpbiBjYXNlIHRoZXkgY2FuY2VsIG9yIG1vdmUgdG8gYW5vdGhlciBlbGVtZW50XG5cdFx0XHRFZGl0YWJsZUVsZW1lbnQuX3ByZXZFZGl0YWJsZUVsZW1lbnQgPSB0aGlzO1xuXG5cdFx0XHQvLyBTZXQgZm9jdXMgdG8gdGhlIG5ldyBpbnB1dCBlbGVtZW50IEFTQVAgYWZ0ZXIgdGhlIGNsaWNrIGhhbmRsZXIuXG5cdFx0XHQvLyBXZSBjYW4ndCBqdXN0IGRvIHRoaXMgaW4gaGVyZSBiZWNhdXNlIHRoZSBicm93c2VyIHdvbid0IGFjdHVhbGx5IHNldCB0aGUgZm9jdXMsXG5cdFx0XHQvLyBwcmVzdW1hYmx5IGJlY2F1c2UgaXQgdGhpbmtzIHRoZSBmb2N1cyBzaG91bGQgYmUgaW4gd2hhdCB3YXMganVzdCBjbGlja2VkIG9uLlxuXHRcdFx0d2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHBUaGlzLmlucHV0RWxlbWVudC5mb2N1cygpO1xuXHRcdFx0fSwgMCk7XG5cdFx0XHR0aGlzLnNldFVwS2V5SGFuZGxlcigpO1xuXHRcdFx0Ly8gVE9ETzogSGFuZGxlIGxvc2luZyBmb2N1cyAoaW4gd2hpY2ggY2FzZSB3ZSBjb21taXQgY2hhbmdlcz8pXG5cdFx0fVxuXG5cblx0XHQvLyBJdCBpcyBwb3NzaWJsZSB0aGlzIHdpbGwgbmVlZCB0byBiZSBhbHRlcmVkIGZ1cnRoZXIgd2hlbiBzdWJjbGFzc2luZyBFZGl0YWJsZUF1dG9jb21wbGV0ZSxcblx0XHQvLyBhcyBzb21lIHJlY29yZCBzdHJpbmctZXF1aXZhbGVudHMgY2FuIGJlIGFtYmlndW91cy5cblx0XHRnZXREaXNwbGF5VmFsdWUoKTpzdHJpbmcge1xuXHRcdFx0dmFyIGF1dG8gPSB0aGlzLmdldEF1dG9Db21wbGV0ZU9iamVjdCgpO1xuXHRcdFx0cmV0dXJuIGF1dG8udmlzaWJsZUlucHV0LnZhbCgpO1xuXHRcdH1cblxuXG5cdFx0Z2V0RWRpdGVkVmFsdWUoKTphbnkge1xuXHRcdFx0dmFyIGF1dG8gPSB0aGlzLmdldEF1dG9Db21wbGV0ZU9iamVjdCgpO1xuXHRcdFx0cmV0dXJuIGF1dG8udmFsKCk7XG5cdFx0fVxuXHR9XG5cblxuXG5cdGV4cG9ydCBjbGFzcyBFZGl0YWJsZUVtYWlsIGV4dGVuZHMgRWRpdGFibGVBdXRvY29tcGxldGUge1xuXG5cdFx0Ly8gT3ZlcnJpZGUgdGhpcyB3aXRoIHlvdXIgc3BlY2lmaWMgYXV0b2NvbXBsZXRlIHR5cGVcblx0XHRjcmVhdGVBdXRvQ29tcGxldGVPYmplY3QoKSB7XG5cdFx0XHQvLyBDcmVhdGUgYW4gaW5wdXQgZmllbGQgdGhhdCB0aGUgdXNlciBjYW4gZWRpdCB3aXRoLlxuXHRcdFx0cmV0dXJuIG5ldyBFRERBdXRvLlVzZXIoe1xuXHRcdFx0XHRjb250YWluZXI6dGhpcy5lbGVtZW50SlFcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuIl19