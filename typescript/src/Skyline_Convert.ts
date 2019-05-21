import * as $ from "jquery";

// TODO find out a way to do this in Typescript without relying on specific output targets
/* tslint:disable */
declare function require(name: string): any;  // avoiding warnings for require calls below
var Dropzone = require('dropzone');
/* tslint:enable */
/* tslint:disable:object-literal-shorthand */

var by_protein = [];
var by_sample = [];

Dropzone.options.skylineDropzone = {
  "init": function () {
    this.on("dragstart drop", () => this.removeAllFiles());
    this.on("success", (file, response) => {
      $("#fileinfo").empty()
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
