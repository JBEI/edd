"use strict";

// Code that all Study sub-pages have in common

import * as $ from "jquery";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/tooltip";

import * as EDDAuto from "./EDDAutocomplete";
import * as EDDEditable from "./EDDEditableElement";

export interface EDDWindow extends Window {
    EDDData: EDDData;
}

declare let window: EDDWindow;
window.EDDData = window.EDDData || ({} as EDDData);

$(window).on("load", () => {
    // Shortcutting this to .load confuses jQuery
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on("focus", ".autocomp", (ev) => {
        $(ev.target).addClass("autocomp_search").mcautocomplete("search");
    });
    // fetch EDDData if available
    const datalink = $("#datalink");
    if (datalink.length) {
        $.ajax({
            "url": datalink.attr("href"),
            "type": "GET",
            "error": (xhr, status, e) => {
                $("#content").prepend(`<div class="noData">Error. Please reload</div>`);
            },
            "success": (data) => {
                window.EDDData = $.extend(window.EDDData || {}, data);
                $.event.trigger("edddata");
            },
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
    canCommit(value): boolean {
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

    canCommit(value): boolean {
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
export function prepareIt() {
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

export function buildModalPosition() {
    // want to position modal below the navigation bar
    // has to be in a function instead of global because navbar is built later
    const navbar = $("nav.navbar");
    return {
        "my": "center top",
        "at": "center bottom",
        "of": navbar,
    };
}

export function dialogDefaults(options: any): any {
    const navbar = $("nav.navbar");
    const $window = $(window);
    const defaults = {
        "autoOpen": false,
        "maxHeight": $window.height() - navbar.height(),
        "maxWidth": $window.width(),
        "position": buildModalPosition(),
    };
    $.extend(defaults, options);
    return defaults;
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
