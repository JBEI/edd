import * as $ from "jquery"
import "jquery.cookie"

declare function require(name: string): any;  // avoiding warnings for require calls below
var Dropzone = require('dropzone');


module Skyline {

  function oninit (dz) {
    var _this = dz;
    _this.on("dragstart", function () {
      _this.removeAllFiles();
    });
    _this.on("drop", function () {
      _this.removeAllFiles();
    });
  }

  Dropzone.options.skylineDropzone = {
    init: function() {
      oninit(this);
    },
    // add CSRF token to xmlHTTPRequest headers
    sending : function (evt, xhr, fd) {
      var csrftoken = jQuery.cookie('csrftoken');
      xhr.setRequestHeader("X-CSRFToken", csrftoken);
    },
    success: function(file, response){
      console.log(response);
      var report = response; //jQuery.parseJSON(response);
      var target1 = $("#fileinfo");
      target1.empty();
      var info_table = $("<table/>").append(
        $("<tr/>").append(
          $("<td/>").text("Number of records:"),
          $("<td/>").text(report.n_records)));
      info_table.append(
        $("<tr/>").append(
          $("<td/>").text("Number of proteins:"),
          $("<td/>").text(report.n_proteins)));
      info_table.append(
        $("<tr/>").append(
          $("<td/>").text("Number of samples:"),
          $("<td/>").text(report.n_samples)));
      target1.append(info_table);
      if (report.errors) {
        for (var i = 0; i < report.errors; i++) {
          target1.append($("<font/>").attr("id", "error").text(report.errors[i]));
        }
      }
      var target2 = $("#formatted");
      var table = target2.data();
      console.log(table);
      table.set_data({
        "by_protein" : report.by_protein,
        "rows" : report.rows
      });
      table.format_table();
    }
  };

  function TableOutput (ta_elem_id, st_elem_id, ft_elem_id) {
    this._ta_elem_id = ta_elem_id;
    this._st_elem_id = st_elem_id;
    this._ft_elem_id = ft_elem_id;
    this._textarea = $(ta_elem_id);
    this._data = null;
    this.set_data = function (data) {
      this._data = data;
    };
    this.format_table = function () {
      if (this._data == null) {
        alert("No data input!");
        return;
      }
      var text = [];
      var sep_type = $(this._st_elem_id).val();
      var format_type = $(this._ft_elem_id).val();
      var sep = ",";
      if (sep_type == "space") {
        sep = " ";
      }
      var table = this._data["by_protein"];
      if (format_type == "vert") {
        table = this._data["rows"];
      }
      if (sep_type == "space") {
        table = format_rows_for_minimum_field_size(table);
      }
      for (var i = 0; i < table.length; i++) {
        text.push(table[i].join(sep));
      }
      this._textarea.val(text.join("\n"));
    };
    this._textarea.data(this);
  }

  function format_rows_for_minimum_field_size (table) {
    var n_rows = table.length;
    var n_cols = table[0].length;
    var lengths = [];
    for (var i = 0; i < n_cols; i++) {
      lengths.push(0);
      for (var j = 0; j < n_rows; j++) {
        lengths[i] = Math.max(lengths[i], String(table[j][i]).length);
      }
    }
    var formatted = [];
    for (var j = 0; j < n_rows; j++) {
      var row = [];
      for (var i = 0; i < n_cols; i++) {
        var val_str = String(table[j][i]);
        var n_pad = lengths[i] - val_str.length;
        if (i == 0) {
          val_str = val_str + Array(n_pad+1).join(' ');
        } else {
          val_str = Array(n_pad+1).join(' ') + val_str;
        }
        row.push(val_str);
      }
      formatted.push(row);
    }
    return formatted;
  }

  $(document).ready(function () {
    var table_out = new TableOutput("#formatted", "#sep_type", "#table_type");
    $("#sep_type").change(function () {
      $("#formatted").data().format_table();
    });
    $("#table_type").change(function() {
      $("#formatted").data().format_table();
    });
  });

}
