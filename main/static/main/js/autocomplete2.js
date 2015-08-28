// requires: jQuery, jQuery-UI
//
// XXX obtained from http://jsfiddle.net/alforno/g4stL/
// see copyright notice below
//
// TODO this is basically just a proof-of-concept - it is only used for the
// user field in a single view, but it has been confirmed to work with the
// (very crude) generic search function in edd.main.views.  A production
// version should use SOLR instead of Django to execute the search.
//

var EDD_auto = EDD_auto || {};
var EDDData = EDDData || {};
(function ($) { // immediately invoked function to bind jQuery to $

    var AutoColumn = function AutoColumn(name, width, valueField) {
        this.name = name;
        this.width = width;
        this.valueField = valueField;
        return this;
    };

    EDD_auto.cache_counter = EDD_auto.cache_counter || 0;
    // Static specification of column layout for each model in EDD that we want to
    // make searchable.  (This might be better done as a static JSON file
    // somewhere.)
    EDD_auto.column_layouts = $.extend(EDD_auto.column_layouts || {}, {
        "User" : [
            new AutoColumn('User', '150px', 'name'),
            new AutoColumn('Initials', '60px', 'initials'),
            new AutoColumn('E-mail', '150px', 'email')
            ],
        "Strain" : [
            new AutoColumn('Part ID', '100px', 'partId'),
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Description', '200px', 'shortDescription')
            ],
        "CarbonSource" : [
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Volume', '60px', 'volume'),
            new AutoColumn('Labeling', '100px', 'labeling'),
            new AutoColumn('Description', '150px', 'description'),
            new AutoColumn('Initials', '60px', 'initials')
            ]
    });
    EDD_auto.display_keys = $.extend(EDD_auto.display_keys || {}, {
        "User": 'name',
        "Strain": 'name',
        "CarbonSource": 'name'
    });
    EDD_auto.value_cache = $.extend(EDD_auto.value_cache || {}, {
        "User": 'Users',
        "Strain": 'Strains',
        "CarbonSource": 'CSources'
    })
    EDD_auto.value_keys = $.extend(EDD_auto.value_keys || {}, {
        "User": 'id',
        "Strain": 'recordId',
        "CarbonSource": 'id'
    });

/*
 * jQuery UI Multicolumn Autocomplete Widget Plugin 2.1
 * Copyright (c) 2012-2014 Mark Harmon
 *
 * Depends:
 * - jQuery UI Autocomplete widget
 *
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 */
$(window).load(function () {
    $.widget('custom.mcautocomplete', $.ui.autocomplete, {
        _create: function () {
            this._super();
            this.widget().menu("option", "items", "> :not(.ui-widget-header)");
        },
        _renderMenu: function (ul, items) {
            var self = this,
                thead;
            if (this.options.showHeader) {
                table = $('<div class="ui-widget-header" style="width:100%"></div>');
                $.each(this.options.columns, function (index, item) {
                    table.append('<span style="padding:0 4px;float:left;width:' + item.width + ';">' + item.name + '</span>');
                });
                table.append('<div style="clear: both;"></div>');
                ul.append(table);
            }
            $.each(items, function (index, item) {
                self._renderItem(ul, item);
            });
        },
        _renderItem: function (ul, item) {
            var t = '',
                result = '';
            $.each(this.options.columns, function (index, column) {
                t += '<span style="padding:0 4px;float:left;width:' + column.width + ';">' + item[column.valueField ? column.valueField : index] + '</span>'
            });
            result = $('<li></li>')
                .data('ui-autocomplete-item', item)
                .append('<a class="mcacAnchor">' + t + '<div style="clear: both;"></div></a>')
                .appendTo(ul);
            return result;
        }
    });

});


EDD_auto.create_autocomplete = function create_autocomplete(container) {
    var autoInput, hideInput;
    autoInput = $('<input type="text"/>').addClass('autocomp').appendTo(container);
    hideInput = $('<input type="hidden"/>').appendTo(container);
    return autoInput;
}


// Sets up the multicolumn autocomplete widget.  Must be called after the
// $(window).load handler above.
EDD_auto.setup_field_autocomplete = function setup_field_autocomplete(selector, model_name, cache) {
    var empty = {}, columns, display_key, value_key, cacheId;
    if (typeof model_name === "undefined") {
        throw Error("model_name must be defined!");
    }
    columns = EDD_auto.column_layouts[model_name] || [ new AutoColumn('Name', '300px', 'name') ];
    display_key = EDD_auto.display_keys[model_name] || 'name';
    value_key = EDD_auto.value_keys[model_name] || 'id';
    cacheId = EDD_auto.value_cache[model_name] || ('cache_' + (++EDD_auto.cache_counter));
    cache = cache || (EDDData[cacheId] = EDDData[cacheId] || {});
    empty[columns[0].valueField] = empty[0] = '<i>No Results Found</i>';
    columns.slice(1).forEach(function (column, index) {
        empty[column.valueField] = empty[index] = '';
    });
    // TODO add flag(s) to handle multiple inputs
    // TODO possibly also use something like https://github.com/xoxco/jQuery-Tags-Input
    $(selector).addClass('autocomp').mcautocomplete({
        // These next two options are what this plugin adds to the autocomplete widget.
        // FIXME these will need to vary depending on record type
        'showHeader': true,
        'columns': columns,
        // Event handler for when a list item is selected.
        'select': function (event, ui) {
            var cacheKey, record, display, value;
            if (ui.item) {
                cacheKey = ui.item[value_key];
                record = cache[cacheKey] = cache[cacheKey] || {};
                $.extend(record, ui.item);
                display = record[display_key] || '';
                value = record[value_key] || '';
                // assign value of selected item ID to sibling hidden input
                $(this).val(display).trigger('change').next('input[type=hidden]').val(value);
            }
            return false;
        },
    
        // The rest of the options are for configuring the ajax webservice call.
        'minLength': 0,
        'source': function (request, response) {
            $.ajax({
                'url': '/search',
                'dataType': 'json',
                'data': {
                    'model': model_name,
                    'term': request.term
                },
                // The success event handler will display "No match found" if no items are returned.
                'success': function (data) {
                    var result;
                    if (!data || !data.rows || data.rows.length === 0) {
                        result = [ empty ];
                    } else {
                        result = data.rows;
                    }
                    response(result);
                }
            });
        },
        'search': function (ev, ui) {
            $(ev.target).addClass('wait');
        },
        'response': function (ev, ui) {
            $(ev.target).removeClass('wait');
        }
    }).on('blur', function (ev) {
        var hiddenId = $(this).next('input[type=hidden]').val(),
            old = cache[hiddenId] || {};
        $(this).val(old[display_key] || '');
    });
};

/***********************************************************************/

$(window).load(function () {
    var AutoOpts, setup_info;
    AutoOpts = function AutoOpts(selector, klass, dataField) {
        this.selector = selector;
        this.klass = klass;
        this.dataField = dataField;
        return this;
    };
    setup_info = [
        new AutoOpts('.autocomp_user',    'User',            'Users'),
        new AutoOpts('.autocomp_reg',     'Strain',          'Strains'),
        new AutoOpts('.autocomp_carbon',  'CarbonSource',    'CSources'),
        new AutoOpts('.autocomp_type',    'MetadataType',    'MetaDataTypes'),
        new AutoOpts('.autocomp_metabol', 'Metabolite',      'MetaboliteTypes'),
        new AutoOpts('.autocomp_measure', 'MeasurementType', 'MeasurementTypes')
    ];
    setup_info.forEach(function (item) {
        var setup_func = function () {
            var cache = EDDData[item.dataField] = EDDData[item.dataField] || {};
            EDD_auto.setup_field_autocomplete(this, item.klass, cache);
        };
        $(item.selector).each(setup_func);
    });
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on('focus', '.autocomp', function (ev) {
        $(ev.target).addClass('autocomp_search').mcautocomplete('search');
    })
});

}(jQuery));
