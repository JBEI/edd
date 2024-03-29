import * as EDDAuto from "./EDDAutocomplete";
import * as Utl from "./Utl";

import "./Styles";

export class EditableElement {
    static _uniqueIndex = 1;
    static _prevEditableElement: any = null;

    parentElement: Element;
    element: Element;
    elementJQ: JQuery;

    id: string;
    private _formURL: string;
    private _fieldName: string;

    inputElement: HTMLInputElement | HTMLTextAreaElement;
    editButtonElement: HTMLElement;
    acceptButtonElement: HTMLElement;
    cancelButtonElement: HTMLElement;
    waitButtonElement: HTMLElement;
    editControlsPositioner: HTMLElement;
    editControlsContainer: HTMLElement;
    minimumRows: number;
    maximumRows: number;

    // This constructor accepts a pre-existing editable element, in the form of
    // a div with the class 'editable-field', or a reference to a container
    // where the editable element will be created.
    //   It distinguishes the two cases by looking for the class 'editable-field'
    // on the provided element.
    //   If no element is provided, the class creates an element and assumes
    // it will be added to the DOM later by a call to its appendTo method, which
    // provides a parent element.
    constructor(parentOrElement: HTMLElement, style?: string) {
        // If we've been given no element, make one.
        if (!parentOrElement) {
            this.elementJQ = $("<div/>").addClass(style || "");
            this.parentElement = null;
            // If we have an element, and it looks like an editable field,
            // use it, and find its parent.
        } else if ($(parentOrElement).hasClass("editable-field")) {
            this.elementJQ = $(parentOrElement);
            this.parentElement = parentOrElement.parentElement;
            // If it's not an editable field, declare it a parent,
            // and go looking for a child that might be a pre-existing
            // editable field.
        } else {
            this.parentElement = parentOrElement;
            const potentialField = $(parentOrElement)
                .children(".editable-field")
                .first();
            if (potentialField.length === 1) {
                this.elementJQ = potentialField;
                // No field?  Make one and add it under the parent.
            } else {
                // Styling will be set later with setDefaultStyling()
                this.elementJQ = $("<div/>").addClass(style || "");
                this.elementJQ.appendTo(parentOrElement);
            }
        }
        this.element = this.elementJQ.get(0);

        const id = EditableElement._uniqueIndex.toString();
        EditableElement._uniqueIndex += 1;
        this.id = id;
        this.elementJQ.data("edd", { "editableelementobj": this });

        this.inputElement = null;
        this.minimumRows = null;
        this.maximumRows = null;

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
        if (this.elementJQ.hasClass("active")) {
            // If this returns true, then we have failed to activate the
            // element for editing for some reason.  Fall through to
            // setting the element as inactive.
            if (this.clickToEditHandler()) {
                this.setInactiveStyling();
            }
        } else {
            this.setInactiveStyling();
        }
    }

    editAllowed(): boolean {
        return true;
    }

    canCommit(value: string): boolean {
        return true;
    }

    getValue(): string {
        return "";
    }

    setValue(value: string): EditableElement {
        return this;
    }

    blankLabel(): string {
        return "(click to set)";
    }

    fieldName(): string;
    fieldName(field: string): EditableElement;
    fieldName(field?: string): string | EditableElement {
        if (field === undefined) {
            return this._fieldName || "";
        }
        this._fieldName = field;
        return this;
    }

    formURL(): string;
    formURL(url: string): EditableElement;
    formURL(url?: string): string | EditableElement {
        if (url === undefined) {
            return this._formURL || "";
        }
        this._formURL = url;
        return this;
    }

    showValue(): EditableElement {
        const v = this.getDisplayValue(),
            bl = this.blankLabel();
        this.elementJQ.children().detach();
        if (bl && !v) {
            this.elementJQ.html('<span style="color:#888">' + bl + "</span>");
        } else if (v) {
            this.elementJQ.html(v);
        }
        return this;
    }

    // This is called one time to do any necessary manipulation of the main element
    // during setup.
    protected setUpMainElement(): void {
        // We need to locate, or create, an input element before
        // we decide which styling to apply to it.
        this.setupInputElement();

        if ($(this.inputElement).is("input")) {
            this.elementJQ.addClass("horizontalButtons");
        } else {
            // The "verticalButtons" class changes the styling of the buttons,
            // as well as the styling of the main element itself.
            // For example it gives each button a style of "block" instead of "inline-block",
            // preventing the buttons from appearing side-by-side.
            this.elementJQ.addClass("verticalButtons");
        }
    }

    // Generate a container for the editing buttons(s), and a positioning element to
    // put the controls in the right place relative to the main element.
    protected generateControlsContainer(): void {
        // The container is a float-right span that appears at the right edge
        // of the cell in the layout, and the icons consume space within.
        this.editControlsPositioner = $('<span class="icon-positioner"/>')[0];
        this.editControlsContainer = $('<span class="icon-container"/>')[0];
        this.editControlsPositioner.appendChild(this.editControlsContainer);
    }

    // Instantiates and stores all the buttons used in the controls container for later use
    protected generateControlButtons(): void {
        this.editButtonElement = $('<span class="icon icon-edit"/>')[0];
        this.acceptButtonElement = $('<span class="icon icon-accept"/>')[0];
        this.cancelButtonElement = $('<span class="icon icon-cancel"/>')[0];
        this.waitButtonElement = $('<span class="icon wait-faster"/>')[0];

        // When rendering contents that have been floated,
        // some browsers will "magically" collapse anything
        // that doesn't contain non-whitespace text to 0 width,
        // regardless of style settings.
        // code 160 === &nbsp;
        this.editButtonElement.appendChild(
            document.createTextNode(String.fromCharCode(160)),
        );
        this.acceptButtonElement.appendChild(
            document.createTextNode(String.fromCharCode(160)),
        );
        this.cancelButtonElement.appendChild(
            document.createTextNode(String.fromCharCode(160)),
        );
        this.waitButtonElement.appendChild(
            document.createTextNode(String.fromCharCode(160)),
        );

        $(this.acceptButtonElement).click(this.clickToAcceptHandler.bind(this));
        $(this.cancelButtonElement).click(this.clickToCancelHandler.bind(this));
    }

    // Changes the styling of the container element to indicate that editing is allowed,
    // and adds a mouse-over control to engage editing.
    protected setInactiveStyling(): void {
        this.elementJQ.removeClass("active");
        this.elementJQ.addClass("inactive");
        $(this.editControlsContainer).children().detach();
        this.editControlsContainer.appendChild(this.editButtonElement);
    }

    // Changes the styling of the container element to indicate that editing is allowed,
    // and adds a mouse-over control to engage editing.
    protected setDefaultStyling(): void {
        this.elementJQ.addClass("editable-field");
        if (this.editAllowed()) {
            this.elementJQ.addClass("enabled");
        } else {
            this.elementJQ.removeClass("enabled");
        }

        this.elementJQ.removeClass("saving");

        const c = this.editControlsPositioner;
        const p = this.element;
        // We want this to be the first element so the vertical height of the rest of the content
        // doesn't cause it to float farther down side of the cell.
        if (p.firstChild) {
            if (p.firstChild !== c) {
                p.insertBefore(c, p.firstChild);
            }
        } else {
            p.appendChild(c);
        }
    }

    // Instantiates the form element(s) used when editing is taking place,
    // with appropriate event handlers and styling, and adds them to the
    // container element.
    protected setUpEditingMode(): void {
        this.elementJQ.removeClass("inactive saving");
        this.elementJQ.addClass("active");

        this.setupInputElement();

        this.clearElementForEditing();
        this.element.appendChild(this.inputElement);
        $(this.inputElement).show();

        // Remember what we're editing in case they cancel or move to another element
        EditableElement._prevEditableElement = this;

        // Set focus to the new input element ASAP after the click handler.
        // We can't just do this in here because the browser will set the focus itself
        // after it's done handling the event that triggered this method.
        window.setTimeout(() => this.inputElement.focus(), 0);
        this.setUpKeyHandler();
    }

    // Attempt to locate a pre-existing input element inside the
    // editable area, and if one is located, take its value as the
    // default value for the field.  If no element exists, make a new one,
    // and assume it should be a textarea.
    protected setupInputElement(): void {
        const desiredFontSize = this.elementJQ.css("font-size");
        const desiredFontFace = this.elementJQ.css("font-family");
        if (!this.inputElement) {
            const potentialInput = this.elementJQ.children(":input").first();
            if (potentialInput.length === 1) {
                // force-casting as compiler cannot inspect selector
                this.inputElement = potentialInput.get(0) as HTMLInputElement;
            } else {
                // Figure out how high to make the text edit box.
                const lineHeight = parseInt(desiredFontSize, 10);
                let desiredNumLines = this.elementJQ.height() / lineHeight;
                desiredNumLines = Math.floor(desiredNumLines) + 1;
                if (this.minimumRows) {
                    desiredNumLines = Math.max(desiredNumLines, this.minimumRows);
                }
                if (this.maximumRows) {
                    desiredNumLines = Math.min(desiredNumLines, this.maximumRows);
                }

                if (desiredNumLines > 1) {
                    this.inputElement = document.createElement("textarea");
                    $(this.inputElement).attr("rows", desiredNumLines);
                } else {
                    this.inputElement = document.createElement("input");
                    this.inputElement.type = "text";
                }
                // Set width and height.
                this.inputElement.style.width = "99%";
                this.inputElement.value = this.getValue();
            }
            // Copy font attributes to match.
            $(this.inputElement).css("font-family", desiredFontFace);
            $(this.inputElement).css("font-size", desiredFontSize);
        }
    }

    // Support function for setUpEditingMode.
    // Takes the container element that we are using as an editable element,
    // and clears it of all content, then re-adds the basic edit control widgets.
    protected clearElementForEditing(): void {
        // Clear the element out
        this.elementJQ.contents().detach(); // children() does not capture text nodes
        // Re-add the controls area
        this.element.appendChild(this.editControlsPositioner);
        $(this.editControlsContainer).children().detach();
        this.editControlsContainer.appendChild(this.acceptButtonElement);
        this.editControlsContainer.appendChild(this.cancelButtonElement);
        this.element.removeAttribute("title");
    }

    private clickToEditHandler(): boolean {
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
            } else {
                // They were already editing something, so revert those changes.
                EditableElement._prevEditableElement.cancelEditing();
                EditableElement._prevEditableElement = null;
            }
        }
        this.setUpEditingMode();
        // Returning false means to stop handling the mouse click,
        // which respects our inputElement.select() call.
        return false;
    }

    private cancelEditing(): void {
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

        // Restore the content.
        this.showValue();
        // Re-add the default editing widgetry
        this.setDefaultStyling();
        this.setInactiveStyling();
        EditableElement._prevEditableElement = null;
    }

    private beginEditCommit(): void {
        const value = this.getEditedValue();
        if (!this.canCommit(value)) {
            return;
        }
        this.setUpCommittingIndicator();
        this.commit();
    }

    // Subclass this if your need a different submit behavior after the UI is set up.
    protected commit(): void {
        const payload = {};
        payload[this.fieldName()] = this.getEditedValue();
        $.ajax({
            "url": this.formURL(),
            "type": "PATCH",
            "headers": { "X-CSRFToken": Utl.EDD.findCSRFToken() },
            "data": payload,
            "success": (response) => {
                this.setValue(response[this.fieldName()]);
            },
            "error": (jqXHR) => {
                throw Error(
                    "Failed to update EditableElement " +
                        this.fieldName() +
                        "\n" +
                        jqXHR.responseText,
                );
            },
            "complete": () => {
                this.cancelEditing();
            },
        });
    }

    // This changes the UI to a third state called 'saving'
    // that is different from 'active' or 'inactive'.
    private setUpCommittingIndicator(): void {
        while (this.editControlsContainer.firstChild) {
            this.editControlsContainer.removeChild(
                this.editControlsContainer.firstChild,
            );
        }
        this.editControlsContainer.appendChild(this.waitButtonElement);
        this.elementJQ.removeClass("active");
        this.elementJQ.removeClass("inactive");
        this.elementJQ.addClass("saving");
    }

    private clickToAcceptHandler(): boolean {
        this.beginEditCommit();
        // Stop handling the mouse click
        return false;
    }

    private clickToCancelHandler(): boolean {
        if (this.inputElement.type === "textarea") {
            const value: any = this.inputElement.value;
            this.cancelEditing();
            if (value) {
                // remove basic text because it might have html elements in it
                $(this.element).text("");
                $(this.element).append(value);
            }
        } else {
            this.cancelEditing();
        }
        // Stop handling the mouse click
        return false;
    }

    // Handle special keys like escape.
    // We're doing it this way because we only ever want one
    // EditableElement responding to an ESC at a time,
    // and this is actually less messy than attaching a generic
    // event handler to the document and then ferreting out the
    // intended object from the DOM.
    // There is no pollution from multiple handlers because every time we
    // add one, we remove the previous.  (See clickToEditHandler)
    protected setUpKeyHandler(): void {
        $(document).on("keydown", (event: JQuery.KeyDownEvent) => {
            if (event.which === 27) {
                this.cancelEditing();
            }
        });
    }

    protected removeKeyHandler(): void {
        $(document).off("keydown");
    }

    private appendTo(el: Element): EditableElement {
        this.parentElement = el;
        el.appendChild(this.element);
        return this;
    }

    private appendChild(el: Element): EditableElement {
        this.element.appendChild(el);
        return this;
    }

    private clear(): EditableElement {
        while (this.element.lastChild) {
            $(this.element.lastChild).detach();
        }
        return this;
    }

    private visible(enable: boolean): EditableElement {
        this.elementJQ.toggleClass("off", !enable);
        return this;
    }

    // Override if the value of the field needs to be post-processed before being displayed.
    getDisplayValue(): string {
        return this.getValue();
    }

    getEditedValue(): string {
        return this.inputElement.value;
    }
}

export class EditableAutocomplete extends EditableElement {
    autoCompleteObject: EDDAuto.BaseAuto;

    constructor(inputElement: HTMLElement, style?: string) {
        super(inputElement, style);
        this.autoCompleteObject = null;
    }

    protected setUpMainElement(): EditableElement {
        this.elementJQ.addClass("horizontalButtons");
        return this;
    }

    // Override this with your specific autocomplete type
    protected createAutoCompleteObject(
        opt?: EDDAuto.AutocompleteOptions,
    ): EDDAuto.BaseAuto {
        // Create an input field that the user can edit with.
        return new EDDAuto.User($.extend({}, opt));
    }

    // This either returns a reference to the autocomplete object,
    // or if necessary, creates a new one and prepares it, then returns it.
    // TODO: For editable autocomplete fields built entirely on the front-end,
    // we need to pass down a default value.
    // Note that this does not do any type checking of pre-existing autocomplete
    // elements - that is, it does not check the eddautocompletetype attribute to
    // make sure that it matches the type that it will attempt to create.
    // For example, an EditableAutocomplete subclass for User will always assume
    // the input elements it finds are for a User autocomplete type.
    getAutoCompleteObject(): EDDAuto.BaseAuto {
        // ':first-of-type' would be wrong here
        const visibleInput = this.elementJQ
            .children('input[type="text"].autocomp')
            .first();
        const hiddenInput = this.elementJQ.children('input[type="hidden"]').first();
        let autoObject: EDDAuto.BaseAuto = null;

        if (this.autoCompleteObject) {
            return this.autoCompleteObject;
        }

        // If we found an input,
        // we can check for an autocomplete object already attached to it.
        // This is required because EDDAuto.BaseAuto.initPreexisting()
        // may have spidered through and made one aleady.
        if (visibleInput.length !== 0) {
            const eddData = visibleInput.data("edd");
            if (eddData) {
                autoObject = eddData.autocompleteobj;
            }
            if (!autoObject && hiddenInput.length !== 0) {
                autoObject = this.createAutoCompleteObject({
                    "container": this.elementJQ,
                    "visibleInput": visibleInput,
                    "hiddenInput": hiddenInput,
                });
                autoObject.init();
            }
        }
        // If all else fails (one input missing, no eddData, or no autocompleteobj),
        // make a new object with new elements.
        if (!autoObject) {
            autoObject = this.createAutoCompleteObject({
                "container": this.elementJQ,
            });
            autoObject.init();
        }

        this.autoCompleteObject = autoObject;

        const el = autoObject.visibleInput;
        // Copy font attributes from our underlying control.
        $(el).css("font-family", this.elementJQ.css("font-family"));
        $(el).css("font-size", this.elementJQ.css("font-size"));

        return autoObject;
    }

    protected setUpEditingMode(): void {
        this.elementJQ.removeClass("inactive saving");
        this.elementJQ.addClass("active");

        // Calling this may set it up for the first time
        const auto = this.getAutoCompleteObject();
        this.inputElement = auto.visibleInput.get(0) as HTMLInputElement;

        this.clearElementForEditing();
        this.elementJQ.append(auto.visibleInput).append(auto.hiddenInput);

        // Remember what we're editing in case they cancel or move to another element
        EditableElement._prevEditableElement = this;

        // Set focus to the new input element ASAP after the click handler.
        // We can't just do this in here because the browser won't actually set the focus,
        // presumably because it thinks the focus should be in what was just clicked on.
        window.setTimeout(() => this.inputElement.focus(), 0);
        this.setUpKeyHandler();
    }

    // It is possible this will need to be altered further when subclassing EditableAutocomplete,
    // as some record string-equivalents can be ambiguous.
    getDisplayValue(): any {
        const auto = this.getAutoCompleteObject();
        return auto.visibleInput.val();
    }

    getEditedValue(): any {
        const auto = this.getAutoCompleteObject();
        return auto.val();
    }
}

export class EditableEmail extends EditableAutocomplete {
    // Override this with your specific autocomplete type
    protected createAutoCompleteObject(): EDDAuto.BaseAuto {
        // Create an input field that the user can edit with.
        return new EDDAuto.User({
            "container": this.elementJQ,
        });
    }
}
