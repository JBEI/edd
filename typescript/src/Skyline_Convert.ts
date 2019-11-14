import * as $ from "jquery";

import * as Dropzone from "dropzone";

import "../modules/Styles";

let by_protein = [];
let by_sample = [];

Dropzone.options.skylineDropzone = {
    "init": function() {
        this.on("dragstart drop", () => this.removeAllFiles());
        this.on("success", (file, response) => {
            $("#fileinfo")
                .empty()
                .append($("<div>").text("Number of records: " + response.n_records))
                .append($("<div>").text("Number of proteins: " + response.n_proteins))
                .append($("<div>").text("Number of samples: " + response.n_samples));
            by_protein = response.by_protein;
            by_sample = response.rows;
            format_table();
        });
    },
};

function format_table() {
    const format = $("#table_type").val();
    const rows = (format === "vert" ? by_sample : by_protein) || [];
    $("#formatted").val(rows.map((row) => row.join(",")).join("\n"));
}

$(() => {
    $("#table_type").on("change", format_table);
});
