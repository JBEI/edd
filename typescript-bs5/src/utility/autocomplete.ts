"use strict";

import "jquery";
import "select2";

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
