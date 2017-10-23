import * as $ from "jquery"
import "jquery.cookie"
import * as d3 from "d3"
import "bootstrap-loader"
import Handsontable from "handsontable"

declare function require(name: string): any;  // avoiding warnings for require calls below
var Dropzone = require('dropzone');
require('handsontable.css')


module Workbench {
  'use strict';

  $(document).ready(() => {
    $("#hidden-options").toggle();
    $("#auto-peaks").change(function () {
      $("#hidden-options").toggle();
    });
    $("#add-molecule").click(function () { onAddMolecule(); });
    $("#del-molecule").click(function () { onDeleteMolecule(); });
    $("#n-molecules").data("n_mols", 1);
  });

  // http://stackoverflow.com/questions/22063612
  $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
    console.log("Hello, world!");
    jqXHR.setRequestHeader('X-CSRFToken', jQuery.cookie('csrftoken'));
  });

  function oninit (dz) {
    var _this = dz;
    _this.on("dragstart", function () {
      _this.removeAllFiles();
    });
    _this.on("drop", function () {
      _this.removeAllFiles();
    });
  }

  Dropzone.options.gcmsDropzone = {
    //autoProcessQueue: false,
    uploadMultiple: false,
    previewsContainer: "#file-preview",
    init: function() {
      //oninit(this);
      var gcms_dz = this;
      this.element.querySelector("button[type=submit]").addEventListener("click",
        function(e) {
          // Make sure that the form isn't actually being sent.
          e.preventDefault();
          e.stopPropagation();
          if (gcms_dz.files.length == 0) {
            alert("No input file specified!");
            return false;
          }
          // reset the upload queue
          for (var i = 0; i < gcms_dz.files.length; i++) {
            var file = gcms_dz.files[i];
            file.status = Dropzone.QUEUED;
          }
          gcms_dz.processQueue();
        });
    },
    // add CSRF token to xmlHTTPRequest headers
    sending : function (evt, xhr, fd) {
      var csrftoken = jQuery.cookie('csrftoken');
      xhr.setRequestHeader("X-CSRFToken", csrftoken);
    },
    // reset file preview div when a new file is dropped
    drop: function (e) {
      $("#file-preview").empty();
      return this.element.classList.remove("dz-drag-hover");
    },
    success: function(file, response){
      //console.log(response);
      //var response = jQuery.parseJSON(response);
      if (response.python_error) { // only if ValueError encountered on server
        alert(response.python_error);
      } else {
        if (response.data_type == "gc_ms") {
          $("#status-gc-ms").remove();
          $("#file-status").append(
            $("<div class='status-okay' id='status-gc-ms'>").text(
              "GC-MS report uploaded"));
          processReportData(response);
        } else if (response.data_type == "xls") {
          $("#status-xls").remove();
          $("#file-status").append(
            $("<div class='status-okay' id='status-xls'>").text(
              "Excel key uploaded"));
          processExcelTable(response);
        }
      }
    }
  };


  function processReportData (response) {
    var raw_data = JSON.parse(JSON.stringify(response.sample_data));
    $(document).data("raw_data", raw_data);
    var target1 = $("#fileinfo");
    var target2 = $("#tableview");
    target1.empty();
    target2.empty();
    $("#plot-container").empty();
    var peaks = [];
    var info_table = $("<table/>");
    var table;
    if (response.auto_peak) {
      var peak_sel = $("<select/>").attr("id", "standard-peak");
      peak_sel.append($("<option/>").attr("value", 0).text("---"));
      for (var i = 0; i < response.peak_times.length; i++) {
        peaks.push(response.peak_times[i].toFixed(4));
        peak_sel.append($("<option/>").attr("value", i+1).text("Peak " + (i+1)));
      }
      info_table.append(
        $("<tr/>").append(
          $("<td/>").text("Kernel density estimation bandwidth:"),
          $("<td/>").text(response.bandwidth.toPrecision(4))),
        $("<tr/>").append(
          $("<td/>").text("Peak retention times:"),
          $("<td/>").text(peaks.join('; '))),
        $("<tr/>").append(
          $("<td/>").text("Peak for MS standard:"),
          $("<td/>").append(peak_sel)));
      peak_sel.change(function () {
        onSelectStandard(table);
      });
    } else {
      ;
    }
    target1.append(info_table);
    target2.data("relative_areas", false);
    var rel_btn = $("<button/>").text("Calculate relative peak areas").attr(
      "class", "workbench-button").attr("type", "button");
    var submit_btn = $("<button/>").text("Finalize and continue").attr("class",
      "workbench-button").attr("type", "button");
    var reset_btn = $("<button/>").text("Reset table").attr("class",
      "workbench-button").attr("type", "button");
    var abort_btn = $("<button/>").text("Start over").attr("class",
      "workbench-button").attr("type", "button");
    $("#control-buttons").empty();
    $("#control-buttons").append(rel_btn).append(submit_btn).append(
      reset_btn).append(abort_btn);
    if (response.errors) {
      for (var i = 0; i < response.errors; i++) {
        target1.append($("<font/>").attr("id", "error").text(response.errors[i]));
      }
    }
    var samples = JSON.parse(response.samples);
    var svgplot = new RTPlot(samples);
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

  function processExcelTable (response) {
    $(document).data("excel_key", response);
  }

  function firstRowRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.style.fontWeight = 'bold';
    td.style.color = 'black';
    td.style.background = '#c0c0e0';
  }

  //Handsontable.WalkontableViewport.prototype.getWorkspaceWidth = function () { return 1024; }

  function initialize_table (data, errors, plot) {
    // the width calculation and automatic column resizing feature is broken
    // beyond belief, so I'm setting table and column widths manually
    var colwidths = [];
    for (var i = 0; i < data[0].length; i++) {
      colwidths.push(1280 / data[0].length);
    }
    var settings = {
      width: 1280,
      //fixedRowsTop: 2,
      //fixedColumnsLeft: 1,
      colWidths: colwidths,
      comments: true,
      //removeRowPlugin: true,
      contextMenu: true,
      multiSelect: false,
      afterSelection: function (r, c, r2, c2) {
        if (r >= 2) {
          plot.set_selected(data[r][0]);
        } else {
          plot.set_selected(null);
        }
      },
      afterDeselect: function () {
        plot.set_selected(null);
      },
      cells: function (row, col, prop) {
        var cellProperties = {};
        if ((row === 0 && col === 0) || (row === 1) ||
            this.instance.getData()[row][col] === 'readOnly') {
          //make cell read-only if it is first row or the text reads 'readOnly'
          cellProperties['readOnly'] = true;
        }
        if (row === 0 || row === 1) {
          cellProperties['renderer'] = firstRowRenderer; //uses function directly
        } else if (col == 0) {
          cellProperties['renderer'] = Handsontable.renderers.TextRenderer;
        } else {
          //cellProperties.renderer = Handsontable.renderers.TextRenderer;
          cellProperties['renderer'] = Handsontable.renderers.NumericRenderer;
          if ($("#tableview").data("relative_areas") == true) {
            cellProperties['format'] = "0.00000";
          }
        }
        return cellProperties;
      }
    };
    var container = $("#tableview"); //document.getElementById("tableview");
    container.empty();
    var table = new Handsontable(container[0], settings);
    load_data(table, data, errors);
    return table;
  }

  function load_data (table, data, errors) {
    var error_list = [];
    for (var i = 0; i < errors.length; i++) {
      if (errors[i][1] == null) {
        error_list.push({
          row: errors[i][0]+2, // first two rows are headers
          col: 0,
          comment: errors[i][2]
        });
      } else {
        error_list.push({
          row: errors[i][0]+2,
          col: errors[i][1]+1,
          comment: errors[i][2]
        });
      }
    }
    table.loadData(data);
    table.updateSettings({
      comments: true,   // yes, this really needs to be repeated!
      cell: error_list,
      contextMenu: {    // protect first 2 rows from being deleted
        items: {
          "remove_row": {
            name: 'Delete sample',
            disabled: function () {
              // protect first two rows from deletion
              var i_row = table.getSelected()[0]
              return (i_row === 0 || i_row === 1);
            }
          }
        }
      }
    });
    table.render();
  }

  // when the user selects a peak that corresponds to the standard, update the
  // table contents automatically
  function onSelectStandard (table) {
    var i_peak = parseInt($("#standard-peak option:selected").attr("value"), 10);
    var data = table.getData();
    console.log(data);
    console.log(i_peak);
    console.log(data[0][i_peak]);
    for (var j = 1; j < data[0].length; j++) {
      if (j == i_peak) {
        data[0][i_peak] = "standard";
      }
    }
    table.render();
  }

  // Submit combined processed data and Excel key to the server, which will
  // combine the tables and return the result as JSON.  If this validation step
  // is successful a call to download_xlsx() will convert to Excel format.
  function onFinalize (table) {
    var processed = extract_final_data(table);
    var xlsx = $(document).data("excel_key");
    if (xlsx == undefined) {
      throw "You must load the Excel spreadsheet containing sample metadata "+
        "before the results can be processed.";
    } else if (xlsx.data_type != "xls") {
      throw "Excel key is not a parsed worksheet!";
    }
    console.log(xlsx);
    jQuery.ajax({
      type: "POST",
      url: "/utilities/gc_ms/merge",
      contentType: 'application/json; charset=UTF-8',
      dataType: 'json',
      data: JSON.stringify({
        'CSRFToken' : jQuery.cookie('csrftoken'),
        'molecules' : processed['molecules'],
        'data' : processed['data'],
        'key_headers' : xlsx['headers'],
        'key_table' : xlsx['table']
      })
    }).done(
      function (response) {
        console.log("SUCCESS");
        console.log(response);
        //var response = jQuery.parseJSON(response);
        if (response.python_error) {
          alert(response.python_error);
        } else {
          if (response.table.length == 0) {
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
  function download_xlsx (headers, table, prefix) {
    var form = $('<form method="POST" action="/utilities/gc_ms/export">');
    form.append($('<input type="hidden" name="csrfmiddlewaretoken"/>').val(
      jQuery.cookie('csrftoken')));
    form.append($('<input type="hidden" name="headers"/>').val(JSON.stringify(headers)));
    form.append($('<input type="hidden" name="table"/>').val(JSON.stringify(table)));
    form.append($('<input type="hidden" name="prefix"/>').val(prefix));
    form.submit();
  }

  function extract_final_data (table) {
    var data = table.getData();
    var molecules = [];
    var j_std = null;
    var ignore_columns = [false];
    for (var j = 1; j < data[0].length; j++) {
      if (data[0][j] === "standard") {
        j_std = j;
        if ($("#tableview").data("relative_areas")) {
          ignore_columns.push(true);
        } else {
          molecules.push("standard");
        }
      } else if ((data[0][j] === "ignore") || (data[0][j] === "unknown")) {
        ignore_columns.push(true);
      } else if (data[0][j] === ("Peak " + j)) {
        throw "You must specify the identities of all metabolites before "+
              "finalizing the data import.  If you want to ignore a specific "+
              "peak, change the column label to 'ignore' or 'unknown'.";
      } else {
        molecules.push(data[0][j]);
        ignore_columns.push(false);
      }
    }
    var data_out = [];
    for (var i = 2; i < data.length; i++) {
      var row = [];
      for (var j = 0; j < data[i].length; j++) {
        if (! ignore_columns[j]) {
          row.push(data[i][j]);
        }
      }
      data_out.push(row);
    }
    return {
      "molecules" : molecules,
      "data" : data_out
    };
  }

  function convertToRelativeAreas (table) {
    var have_relative_areas = $("#tableview").data("relative_areas");
    if (have_relative_areas) {
      throw "Peak areas have already been converted to be relative.";
    }
    var data = table.getData();
    var j_std = null;
    for (var j = 1; j < data[0].length; j++) {
      if (data[0][j] === "standard") {
        j_std = j;
        break;
      }
    }
    if (j_std == null) {
      throw "You must specify which peak is the standard before peak areas "+
            "can be converted to relative.";
    }
    for (var i = 2; i < data.length; i++) {
      var row = [];
      var std = data[i][j_std];
      for (var j = 1; j < data[i].length; j++) {
        if (j != j_std) {
          if ((std) && (data[i][j] != null)) {
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

  function onAddMolecule () {
    var template = $("tr#molecule-0");
    console.log(template);
    var n_mols = $("#n-molecules").data("n_mols");
    console.log(n_mols);
    var new_mol = template.clone();
    new_mol.attr("id", "molecule-" + n_mols);
    new_mol.find("#mol-name").attr("name", "mol_name_" + n_mols).val("");
    new_mol.find("#rt-min-mol").attr("name", "rt_min_mol_" + n_mols).val("");
    new_mol.find("#rt-max-mol").attr("name", "rt_max_mol_" + n_mols).val("");
    $("#molecule-entry").append(new_mol);
    $("#n-molecules").data("n_mols", n_mols + 1).val(n_mols+1);
  }

  function onDeleteMolecule () {
    var n_mols = $("#n-molecules").data("n_mols");
    console.log(n_mols);
    if (n_mols == 1) return;
    var last_copy = $("tr#molecule-" + (n_mols - 1));
    last_copy.empty();
    last_copy.remove();
    $("#n-molecules").data("n_mols", n_mols - 1).val(n_mols+1);
  }

  export function showHelp (idx) {
    $("#overlay-back").toggle();
    $("#help-" + idx).toggle();
  }

  function RTPlot (samples) {
    var xval = [];
    var yval = [];
    var k = 0;
    var data = []; // list of peaks
    var keys = [];
    for (var i_sample = 0; i_sample < samples.length; i_sample++) {
      var s = samples[i_sample];
      var sample_peak_indices = [];
      for (var i_peak = 0; i_peak < s.peaks.length; i_peak++) {
        var peak = s.peaks[i_peak];
        peak.sample_id = s.sample_id;
        data.push(s.peaks[i_peak]);
        sample_peak_indices.push(k++);
      }
      keys[s.sample_id] = sample_peak_indices;
    }
    var margin = {top: 20, right: 20, bottom: 40, left: 40},
    width = 640 - margin.left - margin.right,
    height = 480 - margin.top - margin.bottom;

    var x = d3.scaleLinear().range([0, width]);
    var y = d3.scaleLinear().range([height, 0]);

    var xAxis = d3.axisBottom(x);

    var yfmt = d3.format(".1f");
    var yAxis = d3.axisLeft(y)
      .tickFormat(function(d: number): string {
        if (d == 0) { return '' + d; } else { return yfmt(d) + "M"; }
      });

    var svg = d3.select("#plot-container").append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    this.svg = svg;
    this.keys = keys;
    this.selected = null;

    var xlim = d3.extent(data, function(d) { return d.retention_time; });
    x.domain([xlim[0] - 0.2, xlim[1] + 0.2]);
    y.domain([0, d3.max(data, function(d) { return d.peak_area*1e-6; })]);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)
      .append("text")
        .attr("x", width / 2 )
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
      .enter().append("rect")
        .attr("class",
          function (d) {
            if (d.is_picked) {
              return "ms-peak";
            } else {
              return "ms-peak-unpicked";
            }
          })
        .attr("x", function(d) { return x(d.retention_time); })
        .attr("width", 1)
        .attr("y", function(d) { return y(d.peak_area*1e-6); })
        .attr("height", function(d) { return height - y(d.peak_area*1e-6); });

    var this_ = this;
    // invisible bars on top, whose style will be toggled to make them visible
    // if the corresponding sample is selected
    var sel_bars = svg.selectAll(".bar")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "bar");
    sel_bars.append("rect")
        .attr("class", "ms-peak-hidden")
        .attr("id", "ms-select-peak")
        .attr("x", function(d) { return x(d.retention_time); })
        .attr("width", 2)
        .attr("y", function(d) { return y(d.peak_area*1e-6); })
        .attr("height", function(d) { return height - y(d.peak_area*1e-6); });

    var rt_fmt = d3.format(".4f");
    sel_bars.append("text").text(
        function(d){
          return d.peak_area + " @ " + rt_fmt(d.retention_time);
        })
       .attr("class", "bar-label-hidden")
       .attr("id", "bar-label")
       .attr("x", function(d) { return x(d.retention_time) + 2; })
       .attr("y", function(d) { return y(d.peak_area*1e-6) - 2; })
       .attr("text-anchor", "middle");

    this.set_selected = function (sample_id) {
      this.selected = sample_id;
      d3.selectAll("#ms-select-peak").attr("class",
        function (d: any) {
          if (d.sample_id == this_.selected) {
            if (d.is_picked) {
              return "ms-peak-selected";
            } else {
              return "ms-peak-unpicked-selected";
            }
          } else {
            return "ms-peak-hidden";
          }
        });
      d3.selectAll("#bar-label").attr("class",
        function (d: any) {
          if (d.sample_id == this_.selected) {
            if (d.is_picked) {
              return "bar-label";
            } else {
              return "bar-label-unpicked";
            }
          } else {
            return "bar-label-hidden";
          }
        });
      console.log("SELECTED:", sample_id);
    }
  }

}
