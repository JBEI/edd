"use strict";

import * as d3 from "d3";
import "jquery";

import { default as Dropzone } from "dropzone";
import Handsontable from "handsontable";

import * as Utl from "../modules/Utl";

import "../modules/Styles";

$(document).ready(() => {
    $("#hidden-options").toggle();
    $("#auto-peaks").change(function () {
        $("#hidden-options").toggle();
    });
    $("#add-molecule").click(function () {
        onAddMolecule();
    });
    $("#del-molecule").click(function () {
        onDeleteMolecule();
    });
    $("#n-molecules").data("n_mols", 1);

    const gcmsDropzone = new Dropzone("#gcmsDropzone", {
        "uploadMultiple": false,
        "previewsContainer": "#file-preview",
        "init": function () {
            this.element
                .querySelector("button[type=submit]")
                .addEventListener("click", (e) => {
                    // Make sure that the form isn't actually being sent.
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.files.length === 0) {
                        alert("No input file specified!");
                        return false;
                    }
                    // reset the upload queue
                    for (const file of this.files) {
                        file.status = Dropzone.QUEUED;
                    }
                    this.processQueue();
                });
        },
        // reset file preview div when a new file is dropped
        "drop": function (e) {
            $("#file-preview").empty();
            return this.element.classList.remove("dz-drag-hover");
        },
    });
    gcmsDropzone.on("success", (file: Dropzone.DropzoneFile, response: any) => {
        if (response.python_error) {
            // only if ValueError encountered on server
            alert(response.python_error);
        } else {
            if (response.data_type === "gc_ms") {
                $("#status-gc-ms").remove();
                $("#file-status").append(
                    $("<div class='status-okay' id='status-gc-ms'>").text(
                        "GC-MS report uploaded",
                    ),
                );
                processReportData(response);
            } else if (response.data_type === "xls") {
                $("#status-xls").remove();
                $("#file-status").append(
                    $("<div class='status-okay' id='status-xls'>").text(
                        "Excel key uploaded",
                    ),
                );
                processExcelTable(response);
            }
        }
    });
});

// http://stackoverflow.com/questions/22063612
$.ajaxPrefilter(function (options, originalOptions, jqXHR) {
    const token = Utl.EDD.findCSRFToken();
    jqXHR.setRequestHeader("X-CSRFToken", token);
});

function processReportData(response) {
    const raw_data = JSON.parse(JSON.stringify(response.sample_data));
    $(document).data("raw_data", raw_data);
    const target1 = $("#fileinfo");
    const target2 = $("#tableview");
    target1.empty();
    target2.empty();
    $("#plot-container").empty();
    const peaks = [];
    const info_table = $("<table/>");
    let table = null;
    if (response.auto_peak) {
        const peak_sel = $("<select/>").attr("id", "standard-peak");
        peak_sel.append($("<option/>").attr("value", 0).text("---"));
        for (let i = 0; i < response.peak_times.length; i++) {
            peaks.push(response.peak_times[i].toFixed(4));
            peak_sel.append(
                $("<option/>")
                    .attr("value", i + 1)
                    .text("Peak " + (i + 1)),
            );
        }
        info_table.append(
            $("<tr/>").append(
                $("<td/>").text("Kernel density estimation bandwidth:"),
                $("<td/>").text(response.bandwidth.toPrecision(4)),
            ),
            $("<tr/>").append(
                $("<td/>").text("Peak retention times:"),
                $("<td/>").text(peaks.join("; ")),
            ),
            $("<tr/>").append(
                $("<td/>").text("Peak for MS standard:"),
                $("<td/>").append(peak_sel),
            ),
        );
        peak_sel.change(function () {
            onSelectStandard(table);
        });
    }
    target1.append(info_table);
    target2.data("relative_areas", false);
    const rel_btn = $("<button/>")
        .text("Calculate relative peak areas")
        .attr("class", "workbench-button")
        .attr("type", "button");
    const submit_btn = $("<button/>")
        .text("Finalize and continue")
        .attr("class", "workbench-button")
        .attr("type", "button");
    const reset_btn = $("<button/>")
        .text("Reset table")
        .attr("class", "workbench-button")
        .attr("type", "button");
    const abort_btn = $("<button/>")
        .text("Start over")
        .attr("class", "workbench-button")
        .attr("type", "button");
    $("#control-buttons").empty();
    $("#control-buttons")
        .append(rel_btn)
        .append(submit_btn)
        .append(reset_btn)
        .append(abort_btn);
    if (response.errors) {
        for (const error of response.errors) {
            target1.append($("<font/>").attr("id", "error").text(error));
        }
    }
    const samples = JSON.parse(response.samples);
    const svgplot = new RTPlot(samples);
    table = initialize_table(response.sample_data, response.errors, svgplot);
    rel_btn.click(function () {
        try {
            convertToRelativeAreas(table);
        } catch (err) {
            alert(err);
        }
    });
    submit_btn.click(function () {
        try {
            onFinalize(table);
        } catch (err) {
            alert(err);
        }
    });
    reset_btn.click(function () {
        $("#tableview").data("relative_areas", false);
        load_data(table, raw_data, response.errors);
    });
    abort_btn.click(function () {
        location.reload();
    });
}

function processExcelTable(response) {
    $(document).data("excel_key", response);
}

function firstRowRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.apply(this, [
        instance,
        td,
        row,
        col,
        prop,
        value,
        cellProperties,
    ]);
    td.style.fontWeight = "bold";
    td.style.color = "black";
    td.style.background = "#c0c0e0";
}

function initialize_table(data, errors, plot) {
    // the width calculation and automatic column resizing feature is broken
    // beyond belief, so I'm setting table and column widths manually
    const colwidth = 1280 / data[0].length;
    const colwidths = Array(data[0].length).fill(colwidth);
    const settings = {
        "width": 1280,
        "colWidths": colwidths,
        "comments": true,
        "contextMenu": true,
        "multiSelect": false,
        "afterSelection": function (r, c, r2, c2) {
            if (r >= 2) {
                plot.set_selected(data[r][0]);
            } else {
                plot.set_selected(null);
            }
        },
        "afterDeselect": function () {
            plot.set_selected(null);
        },
        "cells": function (row, col, prop) {
            const cellProperties: any = {};
            if (
                (row === 0 && col === 0) ||
                row === 1 ||
                this.instance.getData()[row][col] === "readOnly"
            ) {
                // make cell read-only if it is first row or the text reads 'readOnly'
                cellProperties.readOnly = true;
            }
            if (row === 0 || row === 1) {
                cellProperties.renderer = firstRowRenderer; // uses function directly
            } else if (col === 0) {
                cellProperties.renderer = Handsontable.renderers.TextRenderer;
            } else {
                cellProperties.renderer = Handsontable.renderers.NumericRenderer;
                if ($("#tableview").data("relative_areas") === true) {
                    cellProperties.format = "0.00000";
                }
            }
            return cellProperties;
        },
    };
    const container = $("#tableview");
    container.empty();
    const table = new Handsontable(container[0], settings);
    load_data(table, data, errors);
    return table;
}

function load_data(table, data, errors) {
    const error_list = [];
    for (const error of errors) {
        if (error[1] == null) {
            error_list.push({
                "row": error[0] + 2, // first two rows are headers
                "col": 0,
                "comment": error[2],
            });
        } else {
            error_list.push({
                "row": error[0] + 2,
                "col": error[1] + 1,
                "comment": error[2],
            });
        }
    }
    table.loadData(data);
    table.updateSettings({
        "comments": true, // yes, this really needs to be repeated!
        "cell": error_list,
        "contextMenu": {
            // protect first 2 rows from being deleted
            "items": {
                "remove_row": {
                    "name": "Delete sample",
                    "disabled": function () {
                        // protect first two rows from deletion
                        const i_row = table.getSelected()[0];
                        return i_row === 0 || i_row === 1;
                    },
                },
            },
        },
    });
    table.render();
}

// when the user selects a peak that corresponds to the standard, update the
// table contents automatically
function onSelectStandard(table) {
    const i_peak = parseInt($("#standard-peak option:selected").attr("value"), 10);
    const data = table.getData();
    for (let j = 1; j < data[0].length; j++) {
        if (j === i_peak) {
            data[0][i_peak] = "standard";
        }
    }
    table.render();
}

// Submit combined processed data and Excel key to the server, which will
// combine the tables and return the result as JSON.  If this validation step
// is successful a call to download_xlsx() will convert to Excel format.
function onFinalize(table) {
    const processed = extract_final_data(table);
    const xlsx = $(document).data("excel_key");
    if (xlsx === undefined) {
        throw Error(
            "You must load the Excel spreadsheet containing sample metadata " +
                "before the results can be processed.",
        );
    } else if (xlsx.data_type !== "xls") {
        throw Error("Excel key is not a parsed worksheet!");
    }
    jQuery
        .ajax({
            "type": "POST",
            "url": "/utilities/gc_ms/merge",
            "contentType": "application/json; charset=UTF-8",
            "dataType": "json",
            "data": JSON.stringify({
                "CSRFToken": Utl.EDD.findCSRFToken(),
                "molecules": processed.molecules,
                "data": processed.data,
                "key_headers": xlsx.headers,
                "key_table": xlsx.table,
            }),
        })
        .done(function (response) {
            if (response.python_error) {
                alert(response.python_error);
            } else {
                if (response.table.length === 0) {
                    alert("No data in processed table from server!");
                } else {
                    download_xlsx(response.headers, response.table, "gc_ms");
                }
            }
        });
}

// POST a request to convert a table and column headers to an Excel workbook.
// FIXME this works fine, but Chrome prints a warning about the resource being
// interpreted as a document (conflicting with the MIME type set on the
// server).  The recommended solutions all seem to involve making AJAX calls,
// which do not support file downloads.
function download_xlsx(headers, table, prefix) {
    const form = $('<form method="POST" action="/utilities/gc_ms/export">');
    form.append(
        $('<input type="hidden" name="csrfmiddlewaretoken"/>').val(
            Utl.EDD.findCSRFToken(),
        ),
    );
    form.append(
        $('<input type="hidden" name="headers"/>').val(JSON.stringify(headers)),
    );
    form.append($('<input type="hidden" name="table"/>').val(JSON.stringify(table)));
    form.append($('<input type="hidden" name="prefix"/>').val(prefix));
    form.submit();
}

function extract_final_data(table) {
    const data = table.getData();
    const molecules = [];
    const ignore_columns = [false];
    for (let j = 1; j < data[0].length; j++) {
        if (data[0][j] === "standard") {
            if ($("#tableview").data("relative_areas")) {
                ignore_columns.push(true);
            } else {
                molecules.push("standard");
            }
        } else if (data[0][j] === "ignore" || data[0][j] === "unknown") {
            ignore_columns.push(true);
        } else if (data[0][j] === "Peak " + j) {
            throw Error(
                "You must specify the identities of all metabolites before " +
                    "finalizing the data import.  If you want to ignore a specific " +
                    "peak, change the column label to 'ignore' or 'unknown'.",
            );
        } else {
            molecules.push(data[0][j]);
            ignore_columns.push(false);
        }
    }
    const data_out = [];
    for (let i = 2; i < data.length; i++) {
        const row = [];
        for (let j = 0; j < data[i].length; j++) {
            if (!ignore_columns[j]) {
                row.push(data[i][j]);
            }
        }
        data_out.push(row);
    }
    return {
        "molecules": molecules,
        "data": data_out,
    };
}

function convertToRelativeAreas(table) {
    const have_relative_areas = $("#tableview").data("relative_areas");
    if (have_relative_areas) {
        throw Error("Peak areas have already been converted to be relative.");
    }
    const data = table.getData();
    let j_std = null;
    for (let j = 1; j < data[0].length; j++) {
        if (data[0][j] === "standard") {
            j_std = j;
            break;
        }
    }
    if (j_std == null) {
        throw Error(
            "You must specify which peak is the standard before peak areas " +
                "can be converted to relative.",
        );
    }
    for (let i = 2; i < data.length; i++) {
        const std = data[i][j_std];
        for (let j = 1; j < data[i].length; j++) {
            if (j !== j_std) {
                if (std && data[i][j] != null) {
                    data[i][j] = data[i][j] / std;
                } else {
                    data[i][j] = null;
                }
            }
        }
        if (std) {
            data[i][j_std] = 1.0;
        } else {
            data[i][j_std] = null;
        }
    }
    $("#tableview").data("relative_areas", true);
    table.render();
}

function onAddMolecule() {
    const template = $("tr#molecule-0");
    const n_mols = $("#n-molecules").data("n_mols");
    const new_mol = template.clone();
    new_mol.attr("id", "molecule-" + n_mols);
    new_mol
        .find("#mol-name")
        .attr("name", "mol_name_" + n_mols)
        .val("");
    new_mol
        .find("#rt-min-mol")
        .attr("name", "rt_min_mol_" + n_mols)
        .val("");
    new_mol
        .find("#rt-max-mol")
        .attr("name", "rt_max_mol_" + n_mols)
        .val("");
    $("#molecule-entry").append(new_mol);
    $("#n-molecules")
        .data("n_mols", n_mols + 1)
        .val(n_mols + 1);
}

function onDeleteMolecule() {
    const n_mols = $("#n-molecules").data("n_mols");
    if (n_mols === 1) {
        return;
    }
    const last_copy = $("tr#molecule-" + (n_mols - 1));
    last_copy.empty();
    last_copy.remove();
    $("#n-molecules")
        .data("n_mols", n_mols - 1)
        .val(n_mols + 1);
}

function RTPlot(samples) {
    let k = 0;
    const data = []; // list of peaks
    const keys = [];
    for (const s of samples) {
        const sample_peak_indices = [];
        for (const peak of s.peaks) {
            peak.sample_id = s.sample_id;
            data.push(peak);
            sample_peak_indices.push(k++);
        }
        keys[s.sample_id] = sample_peak_indices;
    }
    const margin = { "top": 20, "right": 20, "bottom": 40, "left": 40 },
        width = 640 - margin.left - margin.right,
        height = 480 - margin.top - margin.bottom;

    const x = d3.scaleLinear().range([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    const xAxis = d3.axisBottom(x);

    const yfmt = d3.format(".1f");
    const yAxis = d3.axisLeft(y).tickFormat(function (d: number): string {
        if (d === 0) {
            return "" + d;
        } else {
            return yfmt(d) + "M";
        }
    });

    const svg = d3
        .select("#plot-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    this.svg = svg;
    this.keys = keys;
    this.selected = null;

    const xlim = d3.extent(data, function (d) {
        return d.retention_time;
    });
    x.domain([xlim[0] - 0.2, xlim[1] + 0.2]);
    y.domain([
        0,
        d3.max(data, function (d) {
            return d.peak_area * 1e-6;
        }),
    ]);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)
        .append("text")
        .attr("x", width / 2)
        .attr("y", 30)
        .text("Retention time");

    svg.append("g")
        .attr("class", "axis")
        .call(yAxis)
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Peak area (M)");

    svg.selectAll(".bar")
        .data(data)
        .enter()
        .append("rect")
        .attr("class", function (d) {
            if (d.is_picked) {
                return "ms-peak";
            } else {
                return "ms-peak-unpicked";
            }
        })
        .attr("x", function (d) {
            return x(d.retention_time);
        })
        .attr("width", 1)
        .attr("y", function (d) {
            return y(d.peak_area * 1e-6);
        })
        .attr("height", function (d) {
            return height - y(d.peak_area * 1e-6);
        });

    // invisible bars on top, whose style will be toggled to make them visible
    // if the corresponding sample is selected
    const sel_bars = svg
        .selectAll(".bar")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "bar");
    sel_bars
        .append("rect")
        .attr("class", "ms-peak-hidden")
        .attr("id", "ms-select-peak")
        .attr("x", function (d) {
            return x(d.retention_time);
        })
        .attr("width", 2)
        .attr("y", function (d) {
            return y(d.peak_area * 1e-6);
        })
        .attr("height", function (d) {
            return height - y(d.peak_area * 1e-6);
        });

    const rt_fmt = d3.format(".4f");
    sel_bars
        .append("text")
        .text((d) => d.peak_area + " @ " + rt_fmt(d.retention_time))
        .attr("class", "bar-label-hidden")
        .attr("id", "bar-label")
        .attr("x", function (d) {
            return x(d.retention_time) + 2;
        })
        .attr("y", function (d) {
            return y(d.peak_area * 1e-6) - 2;
        })
        .attr("text-anchor", "middle");

    this.set_selected = function (sample_id) {
        this.selected = sample_id;
        d3.selectAll("#ms-select-peak").attr("class", (d: any) => {
            if (d.sample_id === this.selected) {
                if (d.is_picked) {
                    return "ms-peak-selected";
                } else {
                    return "ms-peak-unpicked-selected";
                }
            } else {
                return "ms-peak-hidden";
            }
        });
        d3.selectAll("#bar-label").attr("class", (d: any) => {
            if (d.sample_id === this.selected) {
                if (d.is_picked) {
                    return "bar-label";
                } else {
                    return "bar-label-unpicked";
                }
            } else {
                return "bar-label-hidden";
            }
        });
    };
}
