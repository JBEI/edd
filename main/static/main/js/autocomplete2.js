// requires: jQuery, jQuery-UI
//
// XXX obtained from http://jsfiddle.net/alforno/g4stL/
// see copyright notice below
//

var EDD_auto = EDD_auto || {}, EDDData = EDDData || {};
(function ($) { // immediately invoked function to bind jQuery to $

    var AutoColumn, meta_columns;
    AutoColumn = function AutoColumn(name, minWidth, valueField, maxWidth) {
        this.name = name;
        this.width = minWidth;
        this.maxWidth = maxWidth || null;
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
            new AutoColumn('Description', '250px', 'description', '600px'),
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
    });
    EDD_auto.value_keys = $.extend(EDD_auto.value_keys || {}, {
        "User": 'id',
        "Strain": 'recordId',
        "CarbonSource": 'id',
        "MetaboliteExchange": 'id'
    });
    EDD_auto.request_cache = {};


/*
 * jQuery UI Multicolumn Autocomplete Widget Plugin 2.2
 * Copyright (c) 2012-2014 Mark Harmon
 *
 * Depends:
 *   - jQuery UI Autocomplete widget
 *
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 *
 * Heavily modified by JBEI to not use "float:left", as it has been Deemed Harmful.
*/
$.widget('custom.mcautocomplete', $.ui.autocomplete, {
    _create: function() {
      this._super();
      this.widget().menu( "option", "items", "> :not(.ui-widget-header)" );
    },
    _valOrNbsp: function(jQ, value) {
        if (typeof value === 'object') {
            jQ.append(value);
        } else if (value && value.trim()) {
            jQ.text(value);
        } else {
            jQ.html('&nbsp;');
        }
    },
    _appendCell: function(row, column, label) {
        var cell = $('<div></div>');
        if (column.width) { cell.css('minWidth', column.width); }
        if (column.maxWidth) { cell.css('maxWidth', column.maxWidth); }
        this._valOrNbsp(cell, label);
        row.append(cell);
        return cell;
    },
    _renderMenu: function(ul, items) {
        var self = this, thead;
    
        if (this.options.showHeader) {
            table=$('<li class="ui-widget-header"></div>');
            // Column headers
            $.each(this.options.columns, function(index, column) {
                self._appendCell(table, column, column.name);
            });
            ul.append(table);
        }
        // List items
        $.each(items, function(index, item) {
            self._renderItem(ul, item);
        });
        $( ul ).addClass( "edd-autocomplete-list" ).find( "li:odd" ).addClass( "odd" );
    },
    _renderItem: function(ul, item) {
        var t = '', self = this;
        result = $('<li>').data('ui-autocomplete-item', item)

        $.each(this.options.columns, function(index, column) {
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
            self._appendCell(result, column, value);
        });

        result.appendTo(ul);
        return result;
    }
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

/**
 * Sets up the multicolumn autocomplete behavior for an existing text input.  Must be called
 * after the $(window).load handler above.
 * @param selector the CSS selector that uniquely identifies the autocomplete text input
 * within the DOM. Note that in order to work, the autocomplete input must have an
 * immediately-following hidden sibling input which will be used to cache the selected value.
 * The element identified by this selector will have the "autocomp" class added if not already
 * present for consistency with the rest of the UI.
 * @param model_name the EDD class of results to be searched (roughly corresponds to
 * the Django ORM model classes)
 * @param cache an optional dictionary to use / maintain as a cache of query results for this
 * autocomplete. Maps search term -> results.
 * @param search_options an optional dictionary of data to be sent to the search backend as part
 * of the autocomplete search request.  To be received on the back-end, additional search
 * parameters should be captured under an included "search_extra" element.
 * @param prependResults an optional dictionary of static results to prepend to those returned
 * by search queries
 * @param search_uri the URI of the REST resource to use for querying autocomplete results
 */
EDD_auto.setup_field_autocomplete = function setup_field_autocomplete(
    selector, model_name, cache, search_options, prependResults, search_uri) {
    var empty = {}, columns, display_key, value_key, cacheId, opt;
    if (typeof model_name === "undefined") {
        throw Error("model_class_name must be defined!");
    }
    opt = $.extend({}, search_options);
    prependResults = prependResults || [];
    columns = EDD_auto.column_layouts[model_name] || [ new AutoColumn('Name', '300px', 'name') ];
    display_key = EDD_auto.display_keys[model_name] || 'name';
    value_key = EDD_auto.value_keys[model_name] || 'id';
    cacheId = EDD_auto.value_cache[model_name] || ('cache_' + (++EDD_auto.cache_counter));
    cache = cache || (EDDData[cacheId] = EDDData[cacheId] || {});
    search_uri = search_uri || "/search";
    empty[columns[0].valueField] = empty[0] = 'No Results Found';
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
            var cacheKey, record, displayValue, hiddenValue, userInput, hiddenInput;
            if (ui.item) {
                cacheKey = ui.item[value_key];
                record = cache[cacheKey] = cache[cacheKey] || {};
                $.extend(record, ui.item);
                displayValue = record[display_key] || '';
                hiddenValue = record[value_key] || '';
                // assign value of selected item ID to sibling hidden input

                userInput = $(this)
                    .val(displayValue);

                hiddenInput = userInput
                    .next('input[type=hidden]')
                    .val(hiddenValue)
                    .trigger('change')
                    .trigger('input');
            }
            return false;
        },
        // The rest of the options are for configuring the ajax webservice call.
        'minLength': 0,
        'source': function (request, response) {
            var result, modelCache, termCachedResults;
            modelCache = EDD_auto.request_cache[model_name] = EDD_auto.request_cache[model_name] || {};
            termCachedResults = modelCache[request.term];
            if (termCachedResults) {
                // prepend any optional default results
                var displayResults = prependResults.concat(termCachedResults);

                response(displayResults);
                return;
            }
            $.ajax({
                'url': search_uri,
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
                                cache_record = cache[cacheKey] = cache[cacheKey] || {};
                            $.extend(cache_record, item);
                        });
                    }
                    modelCache[request.term] = result;

                    // prepend any optional default results
                    var displayResults = prependResults.concat(result);
                    response(displayResults);
                },
                'error': function (jqXHR, status, err) {
                    response([ 'Server Error' ]);
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
        var auto = $(this), hiddenInput = auto.next('input[type=hidden]'), hiddenId = hiddenInput.val(),
            old = cache[hiddenId] || {}, current = auto.val();
        if (current.trim() === '') {
            // User cleared value in autocomplete, remove value from hidden ID
            hiddenInput.val('')
                .trigger('change')
                .trigger('input');
        } else {
            // User modified value in autocomplete without selecting new one, restore previous
            auto.val(old[display_key] || '');
        }
    });
};

/***********************************************************************/

$( window ).on("load", function() { // Shortcutting this to .load confuses jQuery
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
