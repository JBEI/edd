'use strict';

// Code that all Study sub-pages have in common

import * as $ from "jquery";
import * as EDDEditable from "./EDDEditableElement";
import * as EDDAuto from "./EDDAutocomplete";
import * as Utl from "../modules/Utl";


$( window ).on("load", function() { // Shortcutting this to .load confuses jQuery
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on('focus', '.autocomp', function (ev) {
        $(ev.target).addClass('autocomp_search').mcautocomplete('search');
    });
});


// Base class for the non-autocomplete inline editing fields for the Study
export class EditableStudyElement extends EDDEditable.EditableElement {
    constructor(inputElement: Element, style?: string) {
        super(inputElement, style);
    }

    editAllowed(): boolean { return true; }
    canCommit(value): boolean { return true; }
}


export class EditableStudyName extends EditableStudyElement {
    constructor(inputElement: Element) {
        super(inputElement);
        this.fieldName('name');
        this.formURL($(inputElement).parents('form').attr('data-rest'));
    }

    canCommit(value): boolean {
        return '' !== value.trim();
    }

    getValue(): string {
        return $(this.inputElement).val();
    }

    blankLabel(): string {
        return '(Enter a name for your Study)';
    }
}


// Called when the page loads.
export function prepareIt() {
    let editable = new EditableStudyName($('#editable-study-name').get()[0]);
    // put the click handler at the document level, then filter to any link inside a .disclose
    $(document).on('click', '.disclose .discloseLink', (e) => {
        $(e.target).closest('.disclose').toggleClass('discloseHide');
        return false;
    });
    return editable;
}


export function overlayContent(original: JQuery) {
    const bottomBar = $("#bottomBar");
    const content = $("#content");
    original = original && original.length && content.has(original[0]) ? original.first() : null;
    // original must be in content, and not copied yet
    if (original && !original.data("overlay_copied")) {
        const copy = original.clone();
        // set copied flag
        original.data("overlay_copied", true);
        // add to bottom of page
        copy.appendTo("#bottomBar")
            // hide initially
            .hide()
            // forward click events to originals
            .on("click", (e) => {
                // easiest way to find matching button is to check button label
                original.find("button:contains(" + e.target.textContent.trim() + ")").trigger(e);
            });
        $(window).on("scroll resize", (ev) => {
            const $window = $(window);
            const viewOffset = $window.height() + $window.scrollTop();
            const offset = original.offset().top + original.height();
            copy.toggle(offset > viewOffset);
        }).trigger("scroll");
    }
}


// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
