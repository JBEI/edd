import { Utl } from "../modules/Utl"
import { FileDropZone } from "../modules/FileDropZone"

module RNASeq {
  'use strict';

  export class EDDRnaSeq {
    private _study_id: number = null;

    /*
     * AJAX response handler
     */
    process_result(result: any): void {
      if (result.python_error) {
        alert(result.python_error);
      } else if (result.format === 'generic') {
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
      } else if (result.format === 'edgepro') {
        $("#data-field").text(result.raw_data);
        $("#data-table").val(result.raw_data);
        $("#data-info").text("Table contains counts and RPKMs for " + result.n_genes + " genes.");
      } else {
        alert("Unknown response format received from server.");
      }
    }

    /*
     * Change event handler.
     */
    submit_data(): void {
      var form_element: HTMLFormElement = <HTMLFormElement> document.getElementById('data-form');
      var fd = new FormData(form_element);
      $.ajax("/study/" + this._study_id + "/import/rnaseq/process/", {
        'type': "POST",
        'data': fd,
        'processData': false,
        'contentType': false,
        'mimeType': 'multipart/form-data',
        'success': this.process_result
      });
    }

    /*
     * Initialization function.
     */
    initialize_window(study_id: number): void {
      this._study_id = study_id;
      $(() => {
        var filedrop_url = '/study/' + this._study_id + '/import/rnaseq/parse/';
        $('#file-name').on('change', () => {
          $('#data-field').text('');
          $('#data-info').text('');
          $('#data-table').val('');
          this.submit_data();
        });
        Utl.FileDropZone.create({
          'elementId': 'data-field',
          'url': filedrop_url,
          'processResponseFn': this.process_result
        });
        $('#process-button').click(this.submit_data);
      });
    }
  }

}
