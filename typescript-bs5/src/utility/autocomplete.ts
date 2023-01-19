"use strict";

import "jquery";
import "select2";

/**
 * Prepare any autocomplete inputs to use Select2 for querying the EDD backend
 * APIs for matching results. If no items to initialize are provided as an
 * argument, the function will setup any elements with the "autocomp2" class.
 */
export function initSelect2(elements?: JQuery): void {
    // when nothing passed, initialize all elements with autocomp2 class
    if (elements === undefined) {
        elements = $(".autocomp2");
    }
    elements.each(function () {
        const select = $(this);
        select.select2({
            "ajax": {
                "data": (params) => {
                    return { ...params, ...extraParams(select) };
                },
                "dataType": "json",
                "url": select.data("eddautocompleteurl"),
            },
            "templateResult": entryTemplate,
            "theme": "bootstrap-5",
            "width": "100%",
        });
    });
}

/**
 * Define any additional parameters to send with autocomplete requests here.
 */
function extraParams(select: JQuery) {
    const type = select.data("eddautocompletetype");
    switch (type) {
        case "SbmlExchange":
        case "SbmlSpecies":
            return { "template": select.data("eddautoTemplate") };
    }
    return {};
}

function entryTemplate(payload: any): string | JQuery {
    if (payload?.html) {
        return $(payload.html);
    }
    return payload?.text || "";
}

/**
 * Hacky fix for a bug in select2 with jQuery 3.6.0's new nested-focus "protection"
 * see: https://github.com/select2/select2/issues/5993
 *
 * TODO: Recheck with the select2 GH issue and remove once this is fixed on their side
 */
function forceFocus() {
    // find the open dropdown, then find the search field within it
    const selector = ".select2-container--open .select2-search__field";
    // use native APIs instead of JQuery
    document.querySelector<HTMLElement>(selector)?.focus();
}
// set the event handler only once globally, NOT within initSelect2(...)
$(document).on("select2:open", forceFocus);
