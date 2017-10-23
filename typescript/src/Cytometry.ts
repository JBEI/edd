import "../src/EDDDataInterface"
import * as jQuery from "jquery"
import "jquery.cookie"
import { EDDAuto } from "../modules/EDDAutocomplete"
import "bootstrap-loader"

declare function require(name: string): any;
//load dropzone module
var Dropzone = require('dropzone');


module Cytometry {
    'use strict';

    (function ($) {

        var EDDData = EDDData || {}, import_data = {}, stdSel = $('<div>');

        function fetchStudyInfo(id) {
            $.ajax({
                'url': [ '/study', id, 'edddata/' ].join('/'),
                'type': 'GET',
                'error': function (xhr, status, e) {
                    console.log(['Loading EDDData failed: ', status, ';', e].join(''));
                    // Hide all following steps
                    $('#import_step_1').nextAll('.import_step').addClass('off');
                },
                'success': function (data) {
                    EDDData = data;
                    // Show step 2
                    $('#import_step_2').removeClass('off');
                }
            });
        }

        function parseRawText(ev) {
            var rows, delim, comma, tab, inter_row, inter_col, table;
            rows = $(ev.target).val().split(/[ \r]*\n/);
            if (rows.length) {
                comma = /\s*,\s*/;
                tab = /\t/;
                delim = (rows[0].split(comma).length > rows[0].split(tab).length) ? comma : tab;
                // pick out the data to a 2D array without label row/column
                import_data = rows.slice(1).map(function (row) {
                    return row.split(delim).slice(1);
                });
                $('#id_data').val(JSON.stringify(import_data));
                interpretFirstRow(rows[0].split(delim).slice(1));
                interpretFirstColumn(rows.slice(1), delim);
                // Show step 3
                $('#import_step_3').removeClass('off');
            } else {
                // Hide all following steps if no data found
                $('#import_step_2').nextAll('.import_step').addClass('off');
            }
        }

        function interpretFirstRow(labels) {
            var inter_row, table, sel;
            inter_row = $('#id_first_row').empty();
            table = $('<table>').appendTo(inter_row)
                .wrap('<div class="disambiguationSection"></div>');
            sel = $('<select>').addClass('column_disam');
            [ [ '-- Ignore Column --', '' ],
                [ 'Signal Average for …', 'avg' ],
                [ 'Signal Std Deviation for …', 'std' ],
                [ 'Coefficient of Variance % for …', 'cv' ],
                [ 'Count', 'count' ],
                [ 'Viable %', 'viab' ],
                [ 'Metadata', 'meta' ]
                // TODO (histogram bin?, other statistics?)
            ].forEach(function (item) {
                $('<option>').text(item[0]).appendTo(sel).val(item[1]);
            });
            labels.forEach(function (label, i) {
                var tr, td;
                if (label.length) {
                    $(tr = table[0].insertRow()).data('i', i);
                    td = tr.insertCell();
                    $('<div>').text(label).appendTo(td);
                    td = tr.insertCell();
                    sel.clone().attr('name', 'column' + i).data('i', i).appendTo(td);
                    td = tr.insertCell(); // this cell gets filled depending on previous select
                }
            });
            table.on('change', 'select.column_disam', function (ev) {
                var target, colId, val, auto;
                target = $(ev.target);
                colId = target.data('i');
                val = target.val();
                auto = target.closest('td').next('td').empty();
                if (val === 'meta') {
                    auto = EDDAuto.BaseAuto.create_autocomplete(auto);
                    auto.next().attr('name', 'meta' + colId);
                    new EDDAuto.MetadataType({
                        container: auto.parent(),
                        visibleInput: auto,
                        hiddenInput: auto.next()
                    });
                    auto.focus();
                } else if (val === 'avg') {
                    auto = EDDAuto.BaseAuto.create_autocomplete(auto);
                    auto.next().attr('name', 'type' + colId);
                    new EDDAuto.Phosphor({
                        container: auto.parent(),
                        visibleInput: auto,
                        hiddenInput: auto.next()
                    })
                    auto.focus().toggleClass('autocomp_signal', val === 'avg');
                } else if (val === 'std' || val === 'cv') {
                    auto = $('<select>').addClass('column_std_disam')
                        .attr('name', val + colId).appendTo(auto);
                    labels.forEach(function (label, i) {
                        i !== colId && $('<option>').text(label).appendTo(auto).val(i);
                    });
                }
            });
        }

        function interpretFirstColumn(rows, delim) {
            var inter_col, table, assaySel, lineSel, optgroup;
            inter_col = $('#id_first_col').empty();
            table = $('<table>').appendTo(inter_col).wrap('<div class="disambiguationSection"></div>');
            assaySel = $('<select>').addClass('disamAssay');
            $('<option>').text('(Create New Assay)').appendTo(assaySel).val('new').prop('selected', true);
            $('<option>').text('Ignore').appendTo(assaySel).val('ignore');
            optgroup = $('<optgroup>').attr('label', 'Existing Assays').appendTo(assaySel);
            $.each(EDDData.Assays || {}, function (id, assay) {
                var line, protocol;
                line = EDDData.Lines[assay.lid];
                protocol = EDDData.Protocols[assay.pid];
                if (protocol.name === 'Flow Cytometry Characterization') {
                    $('<option>').text(assay.name).appendTo(optgroup).val(id.toString());
                }
            });
            lineSel = $('<select>').addClass('disamLine');
            $('<option>').text('(Create New Line)').appendTo(lineSel).val('new').prop('selected', true);
            optgroup = $('<optgroup>').attr('label', 'Existing Lines').appendTo(lineSel);
            $.each(EDDData.Lines || {}, function (id, line) {
                $('<option>').text(line.name).appendTo(optgroup).val(id.toString());
            });
            stdSel = $('<select>').prop('multiple', true).attr('size', 8).addClass('disamStd');
            rows.forEach(function (row, i) {
                var index, label, tr, td;
                index = row.search(delim);
                if (index > 0) {
                    label = row.substring(0, index);
                    $('<option>').text(label).val(i.toString()).appendTo(stdSel);
                    $(tr = table[0].insertRow()).data('i', i);
                    td = tr.insertCell();
                    $('<div>').text(label).appendTo(td);
                    td = tr.insertCell();
                    $('<input type="hidden">').attr('name', 'sample' + i).val(label).appendTo(td);
                    assaySel.clone().attr('name', 'assay' + i).appendTo(td);
                    td = $('<span>').text('for Line: ').appendTo(td);
                    lineSel.clone().attr('name', 'line' + i).appendTo(td);
                }
            });
            // Only show the line selection if assay selection is "new"
            table.on('change', '.disamAssay', function (ev) {
                var target, val;
                target = $(ev.target);
                val = target.val();
                target.next().toggleClass('off', val !== 'new');
            });
        }

        function checkSubmit() {
            var ok = true;
            if ($('#id_create_study').prop('checked')) {
                ok = ok && checkHasValue($('#id_study-name'));
            } else {
                ok = ok && checkHasValue($('#id_study_1'));
            }
            ok = ok && checkHasValue($('#id_data'), 'Could not parse this input! Email jbei-help@lbl.gov');
            ok = ok && checkHasValue($('#id_time'));
            return !!ok;
        }

        function checkHasValue(jq: JQuery, message?: string): boolean {
            if (!jq.val() || !jq.val().trim()) {
                $('<div>').addClass('errorMessage').text(message || 'This field is required.')
                    .appendTo(jq).wrap('<span>');
                return false;
            }
            return true;
        }

        $(function () {
            var _dropzone, _textarea, _auto, stdRows;
            // http://stackoverflow.com/questions/22063612
            $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
                jqXHR.setRequestHeader('X-CSRFToken', jQuery.cookie('csrftoken'));
            });
            _textarea = $('#id_rawtext');
            _dropzone = new Dropzone(_textarea[0], {
                'clickable': false,
                'url': '/utilities/cytometry/parse/'
            });
            _dropzone.on('sending', function (event, xhr, formdata) {
                xhr.setRequestHeader("X-CSRFToken", $.cookie('csrftoken'));
            }).on('success', function (file, response) {
                if (response.python_error) {
                    window.alert(response.python_error);
                } else {
                    _textarea.val(response.data).trigger('change');
                }
            });
            // set up study selection input
            _auto = $('#id_study_0');
            EDDAuto.BaseAuto.initPreexisting(_auto);
            _auto.on('mcautocompleteselect', function (ev, ui) {
                ui.item && fetchStudyInfo(ui.item.id);
                _auto.blur();
            });
            // unhide the study creation form and toggle box
            $('#import_step_1').find('.off').removeClass('off');
            $('#id_create_study').change(function (ev) {
                var checked = $(ev.target).prop('checked');
                $('#import_step_1').find('.edd-form :input').prop('disabled', !checked);
                $('#id_study_0').prop('disabled', checked);
                $('#import_step_2').toggleClass('off', !(checked || (!checked && EDDData.Lines)));
            }).trigger('change');
            // watch the input textarea for changes; delay call on paste events by 10ms
            _textarea.on('change', parseRawText)
                .on('paste', window.setTimeout.bind(window, parseRawText, 10));
            // Add a standard selection row for every column with type 'avg' + valid measurement type
            stdRows = {};
            $('#id_first_row').on('mcautocompleteselect', '.autocomp_signal', function (ev, ui) {
                var target, targRow, rowId, table, tr, td, label;
                // there is enough to import at this point, make sure all steps are shown
                $('.import_step').removeClass('off');
                target = $(ev.target);
                targRow = target.closest('tr');
                rowId = targRow.data('i');
                table = $('#id_std_table');
                // if this row was previously added, remove the old one
                $(stdRows[rowId]).remove();
                tr = stdRows[rowId] = table[0].insertRow();
                $(td = tr.insertCell()).addClass('top');
                label = [ ui.item.name, targRow.find('td > div').text() ].join(' - ');
                $('<div>').text(label).appendTo(td);
                td = tr.insertCell();
                stdSel.clone().attr('name', 'standard' + rowId).appendTo(td);
            });
            // Do basic validation before submit
            $('#import_form').on('submit', checkSubmit);
        });

    }(jQuery));

}
