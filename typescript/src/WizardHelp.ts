"use strict";

import "jquery";

type NamedRecord = { name: string };

function loadItems<T extends NamedRecord>(url, list, query = null) {
    return $.ajax({ "data": query, "type": "GET", "url": url }).then(
        (rpi: RestPageInfo<T>) => {
            const more = list.find(".loadmore").parent().detach();
            for (const item of rpi.results) {
                $(`<li>${item.name}</li>`).appendTo(list);
            }
            if (rpi.next) {
                more.removeClass("hidden").appendTo(list);
            }
            return rpi.next;
        },
    );
}

function setupList(list: JQuery, initialQuery = null) {
    let url = list.data("url");
    let query = initialQuery;
    const loadMore = () => {
        // remove the element to load more, until items are fetched
        const more = list.find(".loadmore").parent().detach();
        loadItems(url, list, query).then((next) => {
            url = next;
            // no need of a query after initial one
            query = null;
            // restore the element to load more items only if there's a next page
            if (next) {
                more.appendTo(list);
            }
        });
        // prevent following link, so page does not jump
        return false;
    };
    list.on("click", ".loadmore", loadMore);
    // fake a click to load the first set of items
    list.find(".loadmore").removeClass("hidden").trigger("click");
}

$(() => {
    setupList($("#protocolList"));
    setupList($("#typesList"), { "type_group": "_" });
    setupList($("#unitList"));
});
