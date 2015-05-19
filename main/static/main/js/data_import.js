
// requires util2.js

var EDDRnaSeq = (function () {
    var pub = {};
    var study_id_ = null;

    // update the DOM using the results from AJAX query
    pub.process_result = function (result) {
        if (result.format == "generic") {
            $("#data-field").text(result.raw_data);
            $("#data-table").val(JSON.stringify(result.table));
            if (result.guessed_data_type) {
              $("#data-type").val(result.guessed_data_type);
            }
            var tbody = $("#sample-fields");
            tbody.empty();
            $("#assay-id").empty();
            $("#assay-id").append($("<option/>").val("0").text("(new assay)"));
            for (var i = 0; i < result.assays.length; i++) {
              var assay = result.assays[i];
              $("#assay-id").append($("<option/>").val(assay.id).text(
                assay.name));
            }
            $("#n-cols").val(result.samples.length);
            for (var i = 0; i < result.samples.length; i++) {
              var s = result.samples[i];
              var fields = $("#sample-fields-0").clone();
              fields.find("#col-label").text(s.label);
              fields.find("#assay-id").val(0).attr("name", "assay-"+i);
              fields.find("#line-id").val(s.line_id).attr("name", "line-"+i);
              fields.find("#time-point").attr("name", "time-"+i);
              fields.find("#desc-field").attr("name", "desc-"+i);
              tbody.append(fields);
              fields.toggle();
            }
        } else if (result.format == "edgepro") {
            $("#data-field").text(result.raw_data);
            $("#data-table").val(result.raw_data);
            $("#data-info").text("Table contains counts and RPKMs for " +
            result.n_genes + " genes.");
        }
    };

    // submit form containing raw data via AJAX call
    pub.submit_data = function () {
      var fd = new FormData(document.getElementById("data-form"));
      jQuery.ajax({
        url : "/study/" + study_id_ + "/import/rnaseq/process",
        type: "POST",
        data: fd,
        processData: false,
        contentType: false,
        enctype: 'multipart/form-data',
        success : function (result) {
          if (result.python_error) {
            alert(result.python_error);
          } else {
            pub.process_result(result);
          }
        }
      });
    };

    pub.initialize_window = function (study_id) {
        if (typeof study_id === "undefined") {
            alert("Warning: study ID not defined in EDDRnaSeq.initialize_window")
        }
        study_id_ = study_id;
        $(window).load(function () {
            var filedrop_url = "/study/" + study_id + "/import/rnaseq/parse";
            $("#file-name").live("change", function () {
                $("#data-field").text("");
                $("#data-info").text("");
                $("#data-table").val("");
                submit_data(study_id);
            });
            setupFileDrop("data-field", filedrop_url, pub.process_result,
                false);
            $("#process-button").click(function () {
                submit_data();
            });
        });
    };

    return pub;
}());
