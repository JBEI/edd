(function ($) {

    var EDDData = EDDData || {};

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
        inter_row = $('#id_first_row');
        table = $('<table>').appendTo(inter_row)
            .wrap('<div class="disambiguationSection"></div>');
        sel = $('<select>').addClass('column_disam');
        [ [ '-- Ignore Column --', '' ],
            [ 'Signal Average for …', 'avg' ],
            [ 'Signal Std Deviation for …', 'std' ],
            [ 'Count', 'count' ],
            [ 'Metadata', 'meta' ]
            // TODO (histogram bin?, other statistics?)
        ].forEach(function (item) {
            $('<option>').text(item[0]).appendTo(sel).val(item[1]);
        });
        labels.forEach(function (label, i) {
            var tr, td;
            if (label.length) {
                tr = table[0].insertRow();
                td = tr.insertCell();
                $('<div>').attr('i', i).text(label).appendTo(td);
                td = tr.insertCell();
                sel.clone().attr('name', 'column' + i).appendTo(td);
                td = tr.insertCell(); // this cell gets filled depending on previous select
            }
        });
        table.on('change', 'select.column_disam', function (ev) {
            var target = $(ev.target), val = target.val(), auto;
            if (val === 'meta') {
                auto = EDD_auto.create_autocomplete(target.closest('td').next('td').empty());
                EDD_auto.setup_field_autocomplete(auto, 'MetadataType');
                auto.focus();
            } else if (val === 'avg' || val === 'std') {
                auto = EDD_auto.create_autocomplete(target.closest('td').next('td').empty());
                EDD_auto.setup_field_autocomplete(auto, 'Phosphor');
                auto.focus();
            }
        });
    }

    function interpretFirstColumn(rows, delim) {
        var inter_col, table, assaySel, lineSel;
        inter_col = $('#id_first_col');
        table = $('<table>').appendTo(inter_col).wrap('<div class="disambiguationSection"></div>');
        assaySel = $('<select>').addClass('disamAssay');
        $('<option>').text('(Create New)').appendTo(assaySel).val('new').prop('selected', true);
        $.each(EDDData.Assays, function (id, assay) {
            var line, protocol;
            line = EDDData.Lines[assay.lid];
            protocol = EDDData.Protocols[assay.pid];
            if (assay.pid === 42) { // TODO change to Cytometry protocol ID
                $('<option>').text([line.name, protocol.name, assay.name].join('-'))
                    .appendTo(assaySel).val(id.toString());
            }
        });
        lineSel = $('<select>').addClass('disamLine');
        $('<option>').text('(Create New)').appendTo(lineSel).val('new').prop('selected', true);
        $.each(EDDData.Lines, function (id, line) {
            $('<option>').text(line.name).appendTo(lineSel).val(id.toString());
        });
        rows.forEach(function (row, i) {
            var index, label, tr, td;
            index = row.search(delim);
            if (index > 0) {
                label = row.substring(0, index);
                tr = table[0].insertRow();
                td = tr.insertCell();
                $('<div>').attr('i', i).text(label).appendTo(td);
                td = tr.insertCell();
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

    $(function () {
        var _dropzone, _textarea, _auto;
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
        _auto = $('#id_study_0');
        EDD_auto.setup_field_autocomplete(_auto, 'StudyWrite');
        _auto.on('mcautocompleteselect', function (ev, ui) {
            ui.item && fetchStudyInfo(ui.item.id);
            _auto.blur();
        });
        _textarea.on('change', parseRawText);
    });

}(jQuery));

