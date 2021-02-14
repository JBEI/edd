import * as $ from "jquery";

import "dropzone";

import "../modules/Styles";
import * as Utl from "../modules/Utl";

let by_protein = [];
let by_sample = [];

function format_table() {
    const format = $("#table_type").val();
    const rows = (format === "vert" ? by_sample : by_protein) || [];
    $("#formatted").val(rows.map((row) => row.join(",")).join("\n"));
}

$(() => {
    const csrf = Utl.EDD.findCSRFToken();
    const select = $("#skylineDropzone").addClass("dropzone");
    // Sometimes direct ref will cause an "x is not a constructor" TypeError
    // Dropzone sets itself on window, so use that as a work-around
    const dropzone = new window.Dropzone(select[0], {
        "clickable": true,
        "params": { "csrfmiddlewaretoken": csrf },
        "url": select.attr("action"),
    });
    const infobox = $("#fileinfo");
    dropzone.on("dragstart drop", () => dropzone.removeAllFiles());
    dropzone.on("error", (file, message, xhr) => {
        infobox.empty().append("Failed to process upload: " + message);
    });
    dropzone.on("success", (file, response: any) => {
        infobox
            .empty()
            .append($("<div>").text("Number of records: " + response.n_records))
            .append($("<div>").text("Number of proteins: " + response.n_proteins))
            .append($("<div>").text("Number of samples: " + response.n_samples));
        by_protein = response.by_protein;
        by_sample = response.rows;
        format_table();
    });
    $("#table_type").on("change", format_table);
});
