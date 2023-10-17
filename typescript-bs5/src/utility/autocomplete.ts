"use strict";

import "jquery";
import "select2";

/**
 * Interface for extra parameters to send with autocomplete search requests.
 */
interface Params {
    [key: string]: string | string[];
}

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
        const url = select.data("eddautocompleteurl");
        const options: Select2.Options = {
            "theme": "bootstrap-5",
        };
        if (url) {
            options.ajax = {
                "data": (params) => {
                    return { ...params, ...extraParams(select) };
                },
                "dataType": "json",
                "url": select.data("eddautocompleteurl"),
            };
            options.templateResult = entryTemplate;
        }
        select.select2(options);
    });
}

/**
 * Define any additional parameters to send with autocomplete requests here.
 */
function extraParams(select: JQuery): Params {
    const params: Params = {};
    const type = select.data("eddautocompletetype");
    switch (type) {
        case "Assay":
        case "AssayLine":
        case "Line":
            params.study = select.data("eddautoStudy");
            break;
        case "MetadataType":
            const types = select.data("eddautoTypeFilter");
            const fields = select.data("eddautoFieldTypes");
            if (types !== undefined) {
                // types can be a JSON string or JSON list of strings
                params.types = JSON.parse(types);
            }
            if (fields !== undefined) {
                params.fields = fields;
            }
            break;
        case "SbmlExchange":
        case "SbmlSpecies":
            params.template = select.data("eddautoTemplate");
            break;
    }
    // send back param "c" when autocomplete annotated with create
    const create = select.data("eddautoCreate");
    if (create !== undefined) {
        params.c = "1";
    }
    return params;
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
