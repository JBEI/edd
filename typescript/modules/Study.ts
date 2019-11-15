"use strict";

// Code that all Study sub-pages have in common

import * as $ from "jquery";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/tooltip";

import * as EDDAuto from "./EDDAutocomplete";
import * as EDDEditable from "./EDDEditableElement";

$(window).on("load", function() {
    // Shortcutting this to .load confuses jQuery
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on("focus", ".autocomp", function(ev) {
        $(ev.target)
            .addClass("autocomp_search")
            .mcautocomplete("search");
    });
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
        this.formURL(
            $(inputElement)
                .parents("form")
                .attr("data-rest"),
        );
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
    const editable = new EditableStudyName(
        $("#editable-study-name").get()[0] as HTMLElement,
    );
    // put the click handler at the document level, then filter to any link inside a .disclose
    $(document).on("click", ".disclose .discloseLink", (e) => {
        $(e.target)
            .closest(".disclose")
            .toggleClass("discloseHide");
        return false;
    });
    // UI Dialog will by default auto-focus the first :tabbable in a Dialog on open
    // this breaks form handling that re-enables elements on focus, so stop autofocus here
    $.ui.dialog.prototype._focusTabbable = patchedFocusTabbable;
}

export function overlayContent(original: JQuery) {
    const bottomBar = $("#bottomBar");
    const content = $("#content");
    original =
        original && original.length && content.has(original[0])
            ? original.first()
            : null;
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
                original
                    .find("button:contains(" + e.target.textContent.trim() + ")")
                    .trigger(e);
            });
        $(window)
            .on("scroll resize", (ev) => {
                const $window = $(window);
                const viewOffset = $window.height() + $window.scrollTop();
                const offset = original.offset().top + original.height();
                copy.toggle(offset > viewOffset);
            })
            .trigger("scroll");
    }
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

/**
 * Tests if a property on two objects are equal.
 */
function propertyEqual(a: object, b: object, name: string): boolean {
    // guard against undefined/null inputs
    a = a || {};
    b = b || {};
    return a.hasOwnProperty(name) && b.hasOwnProperty(name) && a[name] === b[name];
}

/**
 * Tests if arrays both contain the same elements (order-agnostic).
 */
function arrayEquivalent(a: any[], b: any[]): boolean {
    const combined: any[] = [].concat(a || [], b || []);
    return combined.every((v) => a.indexOf(v) !== -1 && b.indexOf(v) !== -1);
}

/**
 * Wraps a "contact" value that can be number, UserRecord, or BasicContact.
 */
export class EDDContact {
    constructor(private readonly self: number | UserRecord | BasicContact) {}
    as_contact(): BasicContact {
        return { "extra": this.display(), "user_id": this.id() };
    }
    display(fallback?: string): string {
        fallback = fallback || "--";
        if (this.is_userrecord()) {
            return ((this.self || {}) as UserRecord).uid;
        } else if (this.is_basiccontact()) {
            const basic = (this.self || {}) as BasicContact;
            const user = EDDData.Users[basic.user_id] || ({} as UserRecord);
            return basic.extra || user.uid || fallback;
        } else if (typeof this.self === "number") {
            const user = EDDData.Users[this.self as number] || ({} as UserRecord);
            return user.uid || fallback;
        }
        return fallback;
    }
    equals(other: number | UserRecord | BasicContact): boolean {
        const a: object = this.self as object;
        const b: object = other as object;
        // when both are IDs, using normal equality works
        return (
            (this.self !== undefined && this.self === other) ||
            // when both are UserRecord, use propertyEqual on "id"
            propertyEqual(a, b, "id") ||
            // when both are BasicContact, use propertyEqual on both "user_id" and "extra"
            (propertyEqual(a, b, "user_id") && propertyEqual(a, b, "extra"))
        );
    }
    id(): number {
        if (this.is_userrecord()) {
            return ((this.self || {}) as UserRecord).id;
        } else if (this.is_basiccontact()) {
            return ((this.self || {}) as BasicContact).user_id;
        } else if (typeof this.self === "number") {
            return this.self as number;
        }
        return null;
    }
    private is_basiccontact(): boolean {
        const self = this.self || {};
        return self.hasOwnProperty("user_id") || self.hasOwnProperty("extra");
    }
    private is_userrecord(): boolean {
        return (this.self || {}).hasOwnProperty("id");
    }
}

function mergeMeta(a: object, b: object): object {
    // metadata values, set key when equal, and set symmetric difference to null
    const meta = {};
    $.each(a || {}, (key, value) => {
        if (propertyEqual(a, b, key)) {
            meta[key] = value;
        } else {
            (meta[key] as any) = null;
        }
    });
    $.each(b || {}, (key, value) => {
        if (!meta.hasOwnProperty(key)) {
            (meta[key] as any) = null;
        }
    });
    return meta;
}

export function mergeLines(a: LineRecord, b: LineRecord): LineRecord {
    if (a === undefined) {
        return b;
    } else if (b === undefined) {
        return a;
    } else {
        const c: LineRecord = {} as LineRecord;
        const contact = new EDDContact(a.contact);
        const experimenter = new EDDContact(a.experimenter);
        // set values only when equal
        if (propertyEqual(a, b, "name")) {
            c.name = a.name;
        }
        if (propertyEqual(a, b, "description")) {
            c.description = a.description;
        }
        if (propertyEqual(a, b, "control")) {
            c.control = a.control;
        }
        if (contact.equals(b.contact)) {
            c.contact = contact.as_contact();
        }
        if (experimenter.equals(b.experimenter)) {
            c.experimenter = experimenter.as_contact();
        }
        // array values, either all values are the same or do not set
        if (arrayEquivalent(a.strain, b.strain)) {
            c.strain = [].concat(a.strain);
        }
        if (arrayEquivalent(a.carbon, b.carbon)) {
            c.carbon = [].concat(a.carbon);
        }
        // set metadata to merged result, set all keys that appear and only set equal values
        c.meta = mergeMeta(a.meta, b.meta);
        return c;
    }
}

export function mergeAssays(a: AssayRecord, b: AssayRecord): AssayRecord {
    if (a === undefined) {
        return b;
    } else if (b === undefined) {
        return a;
    } else {
        const c: AssayRecord = {} as AssayRecord;
        // set values only when equal
        if (propertyEqual(a, b, "name")) {
            c.name = a.name;
        }
        if (propertyEqual(a, b, "description")) {
            c.description = a.description;
        }
        if (propertyEqual(a, b, "pid")) {
            c.pid = a.pid;
        }
        if (new EDDContact(a.experimenter).equals(b.experimenter)) {
            c.experimenter = a.experimenter;
        }
        c.meta = mergeMeta(a.meta, b.meta);
        return c;
    }
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
