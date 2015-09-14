(function ($) {

    function parseRawText(ev) {
        var rows, delim, comma, tab, inter_row, inter_col, table;
        rows = $(ev.target).val().split(/[ \r]*\n/);
        if (rows.length) {
            comma = /\s*,\s*/;
            tab = /\t/;
            delim = (rows[0].split(comma).length > rows[0].split(tab).length) ? comma : tab;
            inter_row = $('#id_first_row');
            table = $('<table>').appendTo(inter_row)
                .wrap('<div class="disambiguationSection"></div>');
            rows[0].split(delim).slice(1).forEach(function (label, i) {
                var tr, td, sel;
                if (label.length) {
                    tr = table[0].insertRow();
                    td = tr.insertCell();
                    $('<div>').attr('i', i).text(label).appendTo(td);
                    td = tr.insertCell();
                    sel = EDD_auto.create_autocomplete(td);
                    EDD_auto.setup_field_autocomplete(sel, 'Phosphor');
                }
            });
            inter_col = $('#id_first_col');
            table = $('<table>').appendTo(inter_col)
                .wrap('<div class="disambiguationSection"></div>');
            rows.slice(1).forEach(function (row, i) {
                var index, label, tr, td, sel;
                index = row.search(delim);
                if (index > 0) {
                    label = row.substring(0, index);
                    tr = table[0].insertRow();
                    td = tr.insertCell();
                    $('<div>').attr('i', i).text(label).appendTo(td);
                    td = tr.insertCell();
                    sel = $('<select>').attr('name', 'assay' + i).appendTo(td);
                    $('<option>').text('(Create New)').appendTo(sel).val('new')
                        .prop('selected', true);
                    // TODO grab cytometry protocol, get all matching assays, add options
                    // TODO select lines if assay is new
                }
            });
        }
    }

    $(function () {
        var _dropzone, _textarea;
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
        EDD_auto.setup_field_autocomplete($('#id_study_0'), 'StudyWrite');
        _textarea.on('change', parseRawText);
    });

}(jQuery));

