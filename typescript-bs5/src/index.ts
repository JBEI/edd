"use strict";

import "jquery";
import "datatables.net";
import "datatables.net-bs5";

import "./utility/style";
import * as Time from "./utility/time";

// Called when the page loads.
function prepareIt(): void {
    const table = $("#studiesTable");
    table.DataTable({
        "ajax": "/search/study/",
        "columns": [
            {
                "data": "name",
                "render": (data, type, row, meta) =>
                    `<a href="${row.url}">${row.name}</a>`,
            },
            { "data": "description" },
            { "data": "creator_name" },
            {
                "data": "created",
                "render": (data, type, row, meta) => Time.utcToToday(row.created),
            },
            {
                "data": "modified",
                "render": (data, type, row, meta) => Time.utcToToday(row.modified),
            },
        ],
        // fetch the i18n values from HTML data-* attributes
        "language": {
            "aria": {
                "sortAscending": table.data("i18nAriaSortAscending"),
                "sortDescending": table.data("i18nAriaSortDescending"),
            },
            "emptyTable": table.data("i18nEmptyTable"),
            "info": table.data("i18nInfo"),
            "infoEmpty": table.data("i18nInfoEmpty"),
            "infoFiltered": table.data("i18nInfoFiltered"),
            "lengthMenu": table.data("i18nLengthMenu"),
            "loadingRecords": table.data("i18nLoadingRecords"),
            "paginate": {
                "first": table.data("i18nPaginateFirst"),
                "last": table.data("i18nPaginateLast"),
                "next": table.data("i18nPaginateNext"),
                "previous": table.data("i18nPaginatePrevious"),
            },
            "processing": table.data("i18nProcessing"),
            "search": table.data("i18nSearch"),
            "zeroRecords": table.data("i18nZeroRecords"),
        },
        "lengthMenu": [10, 25, 50, 100],
        // start with latest modified on top by default
        "order": [[4, "desc"]],
        "processing": true,
        "serverSide": true,
    });
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
