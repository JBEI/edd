// requires: jQuery, jQuery-UI
//
// XXX obtained from http://jsfiddle.net/alforno/g4stL/
// see copyright notice below
//

var EDD_auto = EDD_auto || {}, EDDData = EDDData || {};
(function ($) { // immediately invoked function to bind jQuery to $

    var AutoColumn, meta_columns;
    AutoColumn = function AutoColumn(name, width, valueField) {
        this.name = name;
        this.width = width;
        this.valueField = valueField;
        return this;
    };

    EDD_auto.cache_counter = EDD_auto.cache_counter || 0;
    // Static specification of column layout for each model in EDD that we want to
    // make searchable.  (This might be better done as a static JSON file
    // somewhere.)
    meta_columns = [
        new AutoColumn('Name', '200px', 'name'),
        new AutoColumn('For', '50px', function (item, column, index) {
            var con = item.context;
            return $('<span>').addClass('tag').text(
                con === 'L' ? 'Line' : con === 'A' ? 'Assay' : con === 'S' ? 'Study' : '?');
        })
    ];
    EDD_auto.column_layouts = $.extend(EDD_auto.column_layouts || {}, {
        "User": [
            new AutoColumn('User', '150px', 'fullname'),
            new AutoColumn('Initials', '60px', 'initials'),
            new AutoColumn('E-mail', '150px', 'email')
            ],
        "Strain": [
            new AutoColumn('Part ID', '100px', 'partId'),
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Description', '250px', 'shortDescription')
            ],
        "CarbonSource": [
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Volume', '60px', 'volume'),
            new AutoColumn('Labeling', '100px', 'labeling'),
            new AutoColumn('Description', '250px', 'description'),
            new AutoColumn('Initials', '60px', 'initials')
            ],
        // when it's ambiguous what metadata is targetting, include the 'for' column
        "MetadataType": meta_columns,
        "AssayLineMetadataType": meta_columns,
        "MetaboliteExchange": [
            new AutoColumn('Exchange', '200px', 'exchange'),
            new AutoColumn('Reactant', '200px', 'reactant')
        ]
    });
    EDD_auto.display_keys = $.extend(EDD_auto.display_keys || {}, {
        "User": 'fullname',
        "Strain": 'name',
        "CarbonSource": 'name',
        "MetaboliteExchange": 'exchange'
    });
    EDD_auto.value_cache = $.extend(EDD_auto.value_cache || {}, {
        "User": 'Users',
        "Strain": 'Strains',
        "CarbonSource": 'CSources',
        "MetaboliteExchange": 'Exchange'
    })
    EDD_auto.value_keys = $.extend(EDD_auto.value_keys || {}, {
        "User": 'id',
        "Strain": 'recordId',
        "CarbonSource": 'id',
        "MetaboliteExchange": 'id'
    });
    EDD_auto.request_cache = {};

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
$(function () {
    var valOrNbsp, createCell;
    valOrNbsp = function valOrNbsp(jQ, value) {
        if (typeof value === 'object') {
            jQ.append(value);
        } else if (value && value.trim()) {
            jQ.text(value);
        } else {
            jQ.html('&nbsp;');
        }
    };
    createCell = function createCell(parent, width, label) {
        var cell = $('<span>').addClass('ac_column').css('width', width).appendTo(parent);
        valOrNbsp(cell, label);
        return cell;
    }
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
                    createCell(table, item.width, item.name);
                });
                $('<div>').addClass('clear').appendTo(table);
                ul.append(table);
            }
            $.each(items, function (index, item) {
                self._renderItem(ul, item);
            });
        },
        _renderItem: function (ul, item) {
            var result, anchor;
            result = $('<li>').data('ui-autocomplete-item', item).appendTo(ul);
            anchor = $('<a>').addClass('mcacAnchor').appendTo(result);
            $.each(this.options.columns, function (index, column) {
                var value;
                if (column.valueField) {
                    if (typeof column.valueField === 'function') {
                        value = column.valueField.call({}, item, column, index);
                    } else {
                        value = item[column.valueField];
                    }
                } else {
                    value = item[index];
                }
                if (value instanceof Array) {
                    value = value[0] || '';
                }
                createCell(anchor, column.width, value);
            });
            $('<div>').addClass('clear').appendTo(result);
            return result;
        }
    });
});


EDD_auto.create_autocomplete = function create_autocomplete(container) {
    var autoInput, hideInput;
    autoInput = $('<input type="text"/>').addClass('autocomp').appendTo(container);
    hideInput = $('<input type="hidden"/>').appendTo(container);
    return autoInput;
};


EDD_auto.initial_search = function initial_search(selector, term) {
    var autoInput = $(selector), data = autoInput.data('EDD_auto'), oldResponse;
    oldResponse = autoInput.mcautocomplete('option', 'response');
    autoInput.mcautocomplete('option', 'response', function (ev, ui) {
        var highest = 0, best, termLower = term.toLowerCase();
        autoInput.mcautocomplete('option', 'response', oldResponse);
        oldResponse.call({}, ev, ui);
        ui.content.every(function (item) {
            var val = item[data.display_key], valLower = val.toLowerCase();
            if (val === term) {
                best = item;
                return false;  // do not need to continue
            } else if (highest < 8 && valLower === termLower) {
                highest = 8;
                best = item;
            } else if (highest < 7 && valLower.indexOf(termLower) >= 0) {
                highest = 7;
                best = item;
            } else if (highest < 6 && termLower.indexOf(valLower) >= 0) {
                highest = 6;
                best = item;
            }
        });
        if (best) {
            autoInput.mcautocomplete('instance')._trigger('select', 'autocompleteselect', {
                'item': best
            });
        }
    });
    autoInput.mcautocomplete('search', term);
    autoInput.mcautocomplete('close');
};


// Sets up the multicolumn autocomplete widget.  Must be called after the
// $(window).load handler above.
EDD_auto.setup_field_autocomplete = function setup_field_autocomplete(selector, model_name, cache, options) {
    var empty = {}, columns, display_key, value_key, cacheId, opt;
    if (typeof model_name === "undefined") {
        throw Error("model_name must be defined!");
    }
    opt = $.extend({}, options);
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
    $(selector).addClass('autocomp').data('EDD_auto', {
        'display_key': display_key,
        'value_key': value_key
    }).mcautocomplete({
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
            var result, terms;
            terms = EDD_auto.request_cache[model_name] = EDD_auto.request_cache[model_name] || {};
            if (terms[request.term]) {
                response(terms[request.term]);
                return;
            }
            $.ajax({
                'url': '/search',
                'dataType': 'json',
                'data': $.extend({
                    'model': model_name,
                    'term': request.term
                }, opt.search_extra),
                // The success event handler will display "No match found" if no items are returned.
                'success': function (data) {
                    if (!data || !data.rows || data.rows.length === 0) {
                        result = [ empty ];
                    } else {
                        result = data.rows;
                        // store returned results in cache
                        result.forEach(function (item) {
                            var cacheKey = item[value_key],
                                record = cache[cacheKey] = cache[cacheKey] || {};
                            $.extend(record, item);
                        });
                    }
                    terms[request.term] = result;
                    response(result);
                },
                'error': function (jqXHR, status, err) {
                    response([ '<i>Server Error</i>' ]);
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
        var auto = $(this), hidden = auto.next('input[type=hidden]'), hiddenId = hidden.val(),
            old = cache[hiddenId] || {}, current = auto.val();
        if (current.trim() === '') {
            // User cleared value in autocomplete, remove value from hidden ID
            hidden.val('');
        } else {
            // User modified value in autocomplete without selecting new one, restore previous
            auto.val(old[display_key] || '');
        }
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
        new AutoOpts('.autocomp_user',    'User',                  'Users'),
        new AutoOpts('.autocomp_reg',     'Strain',                'Strains'),
        new AutoOpts('.autocomp_carbon',  'CarbonSource',          'CSources'),
        new AutoOpts('.autocomp_type',    'MetadataType',          'MetaDataTypes'),
        new AutoOpts('.autocomp_atype',   'AssayMetadataType',     'MetaDataTypes'),
        new AutoOpts('.autocomp_altype',  'AssayLineMetadataType', 'MetaDataTypes'),
        new AutoOpts('.autocomp_ltype',   'LineMetadataType',      'MetaDataTypes'),
        new AutoOpts('.autocomp_stype',   'StudyMetadataType',     'MetaDataTypes'),
        new AutoOpts('.autocomp_metabol', 'Metabolite',            'MetaboliteTypes'),
        new AutoOpts('.autocomp_measure', 'MeasurementType',       'MeasurementTypes')
    ];
    setup_info.forEach(function (item) {
        var setup_func = function () {
            var cache = EDDData[item.dataField] = EDDData[item.dataField] || {};
            EDD_auto.setup_field_autocomplete(this, item.klass, cache);
        };
        $(item.selector).each(setup_func);
    });
    // the SBML autocomplete's need to send along extra data
    $('.autocomp_sbml_r').each(function () {
        var opt = {
            'search_extra': { 'template': $(this).data('template') }
        };
        EDD_auto.setup_field_autocomplete(this, 'MetaboliteExchange', EDDData.Exchange = EDDData.Exchange || {}, opt);
    });
    $('.autocomp_sbml_s').each(function () {
        var opt = {
            'search_extra': { 'template': $(this).data('template') }
        };
        EDD_auto.setup_field_autocomplete(this, 'MetaboliteSpecies', EDDData.Species = EDDData.Species || {}, opt);
    })
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on('focus', '.autocomp', function (ev) {
        $(ev.target).addClass('autocomp_search').mcautocomplete('search');
    })
});

}(jQuery));
