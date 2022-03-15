"use strict";

// Code that all Study sub-pages have in common

import "jquery";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/tooltip";

import * as EDDAuto from "./EDDAutocomplete";
import * as EDDEditable from "./EDDEditableElement";

$(window).on("load", () => {
    // Shortcutting this to .load confuses jQuery
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on("focus", ".autocomp", (ev) => {
        $(ev.target).addClass("autocomp_search").mcautocomplete("search");
    });
    const accesslink = $("#accesslink");
    if (accesslink.length) {
        $.ajax({
            "type": "GET",
            "url": accesslink.attr("href"),
        }).done((spec: AccessSpec) => {
            $.event.trigger("eddaccess", [spec]);
        });
    }
});

// Base class for the non-autocomplete inline editing fields for the Study
export class EditableStudyElement extends EDDEditable.EditableElement {
    constructor(inputElement: HTMLElement, style?: string) {
        super(inputElement, style);
    }

    editAllowed(): boolean {
        return true;
    }
    canCommit(value: string): boolean {
        return true;
    }
}

export class EditableStudyName extends EditableStudyElement {
    constructor(inputElement: HTMLElement) {
        super(inputElement);
        this.fieldName("name");
        this.formURL($(inputElement).parents("form").attr("data-rest"));
    }

    static createFromElement(element: HTMLElement): EditableStudyName {
        return new EditableStudyName(element);
    }

    canCommit(value: string): boolean {
        return "" !== value.trim();
    }

    getValue(): string {
        return $(this.inputElement).val() as string;
    }

    blankLabel(): string {
        return "(Enter a name for your Study)";
    }
}

function patchedFocusTabbable() {
    let hasFocus = this.uiDialogTitlebarClose.filter(":tabbable");
    if (!hasFocus.length) {
        hasFocus = this.uiDialog;
    }
    hasFocus.eq(0).focus();
}

// Called when the page loads.
function prepareIt(): void {
    EditableStudyName.createFromElement(
        $("#editable-study-name").get()[0] as HTMLElement,
    );
    // put the click handler at the document level, then filter to any link inside a .disclose
    $(document).on("click", ".disclose .discloseLink", (e) => {
        $(e.target).closest(".disclose").toggleClass("discloseHide");
        return false;
    });
    // UI Dialog will by default auto-focus the first :tabbable in a Dialog on open
    // this breaks form handling that re-enables elements on focus, so stop autofocus here
    $.ui.dialog.prototype._focusTabbable = patchedFocusTabbable;
}

export function buildModalPosition(): JQueryUI.JQueryPositionOptions {
    // want to position modal below the navigation bar
    // has to be in a function instead of global because navbar is built later
    const navbar = $("header.navbar");
    return {
        "my": "center top",
        "at": "center bottom",
        "of": navbar,
    };
}

export function dialogDefaults(
    options: JQueryUI.DialogOptions,
): JQueryUI.DialogOptions {
    const navbar = $("header.navbar");
    const $window = $(window);
    const defaults: JQueryUI.DialogOptions = {
        "autoOpen": false,
        "maxHeight": $window.height() - navbar.height(),
        "maxWidth": $window.width(),
        "position": buildModalPosition(),
    };
    Object.assign(defaults, options);
    return defaults;
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
