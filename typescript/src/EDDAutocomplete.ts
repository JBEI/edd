// requires: jQuery, jQuery-UI
//
// XXX obtained from http://jsfiddle.net/alforno/g4stL/
// see copyright notice below
//

/// <reference path="typescript-declarations.d.ts" />


module EDDAuto {

    export interface AutocompleteOptions {
        // Mandatory: A JQuery object identifying the DOM element that contains, or will contain,
        // the input elements used by this autocomplete object.
        container:JQuery,

        // The JQuery object that uniquely identifies the visible autocomplete text input in the
        // DOM. This element will have the "autocomp" class added if not already present.
        // Note that when specifying this, the visibleInput must have an accompanying hiddenInput
        // specified which will be used to cache the selected value.
        // If neither of these values are supplied, both elements will be created and appended to
        // the container element.
        visibleInput?:JQuery,
        hiddenInput?:JQuery,

        // Optional form submission names to assign to the visible and hidden elements.
        // To the back end, the hiddenInput is generally the important one, so the option
        // for that is simply called 'name'.
        visibleInputName?:string,
        name?:string,

        // The string to show initially in the input element.
        // This may or may not be equivalent to a valid hiddenInput value.
        visibleValue?:string,

        // A starting value for hiddenInput.  This value is a unique identifier of some
        // back-end data structure - like a database record Id.
        // If this is provided but visibleValue is not, we attempt to generate an initial
        // visibleValue based on it.
        hiddenValue?:string,

        // Whether the field must have some value before submission (i.e. cannot be blank).
        // Default is false.
        nonEmptyRequired?:boolean,    // TODO: Implement

        // Whether the field's contents must resolve to a valid Id before submission.
        // Default is usually true - it depends on the subclass.
        // Note that when nonEmptyRequired is false, a blank value is considered valid!
        validIdRequired?:boolean,    // TODO: Implement

        // Whether a blank field defaults to show a "(Create New)" placeholder and submits
        // a hidden Id of 'new'.
        // Default is false.
        emptyCreatesNew?:boolean,    // TODO: Implement

        // an optional dictionary to use / maintain as a cache of query results for this
        // autocomplete. Maps search term -> results.
        cache?:any,

        // the URI of the REST resource to use for querying autocomplete results
        search_uri?:string,

        // Extra parameters to append to each query to the search engine
        search_extra?:any
    }


    class AutoColumn {
        name:string;
        width:string;
        maxWidth:string;
        valueField:string;

        constructor(name, minWidth, valueField, maxWidth?) {
            this.name = name;
            this.width = minWidth;
            this.maxWidth = maxWidth || null;
            this.valueField = valueField;
            return this;
        }
    }


    /**
     * Insert these items to display autocomplete messages which are not selectable values.
     */
    export class NonValueItem {
        static NO_RESULT: NonValueItem = new NonValueItem('No Results Found');
        static ERROR: NonValueItem = new NonValueItem('Server Error');

        // the autocomplete JQuery UI plugin expects items with label and value properties
        // anything without those properties gets converted to a plain object that does
        label: string;
        value: Object;

        constructor(label: string) {
            this.label = label;
            this.value = {};
        }
    }


    export class BaseAuto {

        container:JQuery;
        visibleInput:JQuery;
        hiddenInput:JQuery;

        modelName:string;
        uid:number;

        opt:AutocompleteOptions;
        search_opt:AutocompleteOptions;
        columns:AutoColumn[];
        display_key:any;
        value_key:any;
        cacheId:any;
        cache:any;
        search_uri:string;

        static _uniqueIndex = 1;

        static initPreexisting(context?: Element|JQuery) {
            $('input.autocomp', context).each((i, element) => {
                var visibleInput: JQuery = $(element),
                    autocompleteType: string = $(element).attr('eddautocompletetype');
                if (!autocompleteType) {
                    throw Error("eddautocompletetype must be defined!");
                }
                var opt:AutocompleteOptions = {
                    container: visibleInput.parent(),
                    visibleInput: visibleInput,
                    hiddenInput: visibleInput.next('input[type=hidden]')
                };
                // This will automatically attach the created object to both input elements, in
                // the jQuery data interface, under the 'edd' object, attribute 'autocompleteobj'.
                new EDDAuto[autocompleteType](opt);
            });
        }

        /**
         * Sets up the multicolumn autocomplete behavior for an existing text input. Must be
         * called after the $(window).load handler above.
         * @param opt a dictionary of settings following the AutocompleteOptions interface format.
         * @param search_options an optional dictionary of data to be sent to the search backend
         *     as part of the autocomplete search request.  To be received on the back-end,
         *     additional search parameters should be captured under an included "search_extra"
         *     element.
         */
        constructor(opt:AutocompleteOptions, search_options?) {

            var id = EDDAuto.BaseAuto._uniqueIndex;
            EDDAuto.BaseAuto._uniqueIndex += 1;
            this.uid = id;
            this.modelName = 'Generic';

            this.opt = $.extend({}, opt);
            this.search_opt = $.extend({}, search_options);

            if (!this.opt.container) {
                throw Error("autocomplete options must specify a container");
            }
            this.container = this.opt.container;

            this.visibleInput = this.opt.visibleInput ||
                $('<input type="text"/>').addClass('autocomp').appendTo(this.container);
            this.hiddenInput = this.opt.hiddenInput ||
                $('<input type="hidden"/>').appendTo(this.container);
            if ("visibleValue" in this.opt) {
                this.visibleInput.val(this.opt.visibleValue);
            }
            if ("hiddenValue" in this.opt) {
                this.hiddenInput.val(this.opt.hiddenValue);
            }
            this.visibleInput.data('edd', {'autocompleteobj': this});
            this.hiddenInput.data('edd', {'autocompleteobj': this});

            this.display_key = 'name';
            this.value_key = 'id';
            this.search_uri = this.opt.search_uri || "/search/";

            // Static specification of column layout for each model in EDD that we want to
            // make searchable.  (This might be better done as a static JSON file
            // somewhere.)
            this.columns = [ new AutoColumn('Name', '300px', 'name') ];
        }

        init() {
            // this.cacheId might have been set by a constructor in a subclass
            this.cacheId = this.opt['cacheId']
                || this.cacheId
                || 'cache_' + (++EDD_auto.cache_counter);
            this.cache = this.opt['cache']
                || (EDDData[this.cacheId] = EDDData[this.cacheId] || {});

            // TODO add flag(s) to handle multiple inputs
            // TODO possibly also use something like https://github.com/xoxco/jQuery-Tags-Input
            this.visibleInput.addClass('autocomp');
            if (this.opt['emptyCreatesNew']) {
                this.visibleInput.attr('placeholder', '(Create New)');
            }
            if (this.opt['visibleInputName']) {
                this.visibleInput.attr('name', this.opt['visibleInputName']);
            }
            if (this.opt['name']) {
                this.hiddenInput.attr('name', this.opt['name']);
            }

            var self:BaseAuto = this;
            // mcautocomplete is not in type definitions for jQuery, hence <any>
            (<any>this.visibleInput).mcautocomplete({
                // These next two options are what this plugin adds to the autocomplete widget.
                // FIXME these will need to vary depending on record type
                'showHeader': true,
                'columns': this.columns,
                // Event handler for when a list item is selected.
                'select': function (event, ui) {
                    var cacheKey, record, visibleValue, hiddenValue;
                    if (ui.item) {
                        cacheKey = ui.item[self.value_key];
                        record = self.cache[cacheKey] = self.cache[cacheKey] || {};
                        $.extend(record, ui.item);
                        visibleValue = record[self.display_key] || '';
                        hiddenValue = record[self.value_key] || '';
                        // assign value of selected item ID to sibling hidden input

                        self.visibleInput.val(visibleValue);

                        self.hiddenInput.val(hiddenValue)
                            .trigger('change')
                            .trigger('input');
                    }
                    return false;
                },
                'focus': function( event, ui ) { event.preventDefault(); },
                /* Always append to the body instead of searching for a ui-front class.
                   This way a click on the results list does not bubble up into a jQuery modal
                 and compel it to steal focus.
                   Losing focus on the click is bad, because directly afterwards the
                 autocomplete's own click handler is called, which sets the value of the input,
                 forcing the focus back to the input, triggering a focus event since it was not
                 already in focus. That event in turn triggers our handler attached to
                 'input.autocomp' (see the bottom of this file), which attempts to do an initial
                 search and show a set of results on focus. That event recreates the results
                 menu, causing an endless loop where it appears that the results menu never
                 goes away.
                   We cannot just change the 'input.autocomp' on-focus event to an on-click
                 event, because that would make it unresponsive to users tabbing over.
                   We also cannot add some check into the handler that tries to determine if the
                 results panel is already open (and do nothing if so), because by the time the
                 input gets focus again (triggering that event), the results panel has already
                 been destroyed. */
                'appendTo': "body",
                // The rest of the options are for configuring the ajax webservice call.
                'minLength': 0,
                'source': function (request, response) {
                    var result, modelCache, termCachedResults;
                    modelCache = EDD_auto.request_cache[self.modelName] || {};
                    EDD_auto.request_cache[self.modelName] = modelCache;
                    termCachedResults = modelCache[request.term];
                    if (termCachedResults) {
                        response(termCachedResults);
                        return;
                    }
                    $.ajax({
                        'url': self.search_uri,
                        'dataType': 'json',
                        'data': $.extend({
                            'model': self.modelName,
                            'term': request.term
                        }, self.opt['search_extra']),
                        // The success event handler will display "No Results Found" if no
                        // items are returned.
                        'success': function (data) {
                            var result;
                            if (!data || !data.rows || data.rows.length === 0) {
                                result = [ NonValueItem.NO_RESULT ];
                            } else {
                                result = data.rows;
                                // store returned results in cache
                                result.forEach(function (item) {
                                    var cacheKey = item[self.value_key],
                                        cache_record = self.cache[cacheKey] || {};
                                        self.cache[cacheKey] = cache_record;
                                    $.extend(cache_record, item);
                                });
                            }
                            modelCache[request.term] = result;
                            response(result);
                        },
                        'error': function (jqXHR, status, err) {
                            response([ NonValueItem.ERROR ]);
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
                var auto = self.visibleInput;
                var hiddenInput = self.hiddenInput;
                var hiddenId = hiddenInput.val();
                var old = self.cache[hiddenId] || {};
                var current = auto.val();
                var blank = self.opt['emptyCreatesNew'] ? 'new' : '';

                if (current.trim() === '') {
                    // User cleared value in autocomplete, remove value from hidden ID
                    hiddenInput.val(blank)
                        .trigger('change')
                        .trigger('input');
                } else {
                    // User modified value in autocomplete without selecting new one
                    // restore previous value
                    auto.val(old[self.display_key] || blank);
                }
            });
        };

        val() {
            return this.hiddenInput.val();
        }
    }


    // .autocomp_user
    export class User extends BaseAuto {

        static columns = [
            new AutoColumn('User', '150px', 'fullname'),
            new AutoColumn('Initials', '60px', 'initials'),
            new AutoColumn('E-mail', '150px', 'email')
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'User';
            this.columns = EDDAuto.User.columns;
            this.display_key = 'fullname';
            this.cacheId = 'Users';
            this.init();
        }
    }


    export class Group extends BaseAuto {

        static columns = [
            new AutoColumn('Group', '200px', 'name')
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Group';
            this.columns = EDDAuto.Group.columns;
            this.display_key = 'name';
            this.cacheId = 'Groups';
            this.init();
        }
    }


    // .autocomp_carbon
    export class CarbonSource extends BaseAuto {

        static columns = [
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Volume', '60px', 'volume'),
            new AutoColumn('Labeling', '100px', 'labeling'),
            new AutoColumn('Description', '250px', 'description', '600px'),
            new AutoColumn('Initials', '60px', 'initials')
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'CarbonSource';
            this.columns = EDDAuto.CarbonSource.columns;
            this.cacheId = 'CSources';
            this.init();
        }
    }


    // .autocomp_type
    export class MetadataType extends BaseAuto {

        static columns = [
            new AutoColumn('Name', '200px', 'name'),
            new AutoColumn('For', '50px', function (item, column, index) {
                var con = item.context;
                return $('<span>').addClass('tag').text(
                    con === 'L' ? 'Line' : con === 'A' ? 'Assay' : con === 'S' ? 'Study' : '?');
            })
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'MetadataType';
            this.columns = EDDAuto.MetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_atype
    export class AssayMetadataType extends BaseAuto {

        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'AssayMetadataType';
            this.columns = EDDAuto.AssayMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_altype
    export class AssayLineMetadataType extends BaseAuto {

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'AssayLineMetadataType';
            this.columns = EDDAuto.MetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_ltype
    export class LineMetadataType extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'LineMetadataType';
            this.columns = EDDAuto.LineMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_stype
    export class StudyMetadataType extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'StudyMetadataType';
            this.columns = EDDAuto.StudyMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_metabol
    export class Metabolite extends BaseAuto {

        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Metabolite';
            this.columns = EDDAuto.Metabolite.columns;
            this.cacheId = 'MetaboliteTypes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class Protein extends BaseAuto {

        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Protein';
            this.columns = EDDAuto.Protein.columns;
            this.cacheId = 'Proteins';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class Gene extends BaseAuto {

        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Gene';
            this.columns = EDDAuto.Gene.columns;
            this.cacheId = 'Genes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class Phosphor extends BaseAuto {

        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Phosphor';
            this.columns = EDDAuto.Phosphor.columns;
            this.cacheId = 'Phosphors';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class GenericOrMetabolite extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'GenericOrMetabolite';
            this.columns = EDDAuto.GenericOrMetabolite.columns;
            this.cacheId = 'GenericOrMetaboliteTypes';    // TODO: Is this correct?
            this.visibleInput.attr('size', 45)
            this.init();
        }
    }


    // .autocomp_measure
    export class MeasurementType extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'MeasurementType';
            this.columns = EDDAuto.MeasurementType.columns;
            this.cacheId = 'MeasurementTypes';
            this.visibleInput.attr('size', 45)
            this.init();
        }
    }


    export class MeasurementCompartment extends BaseAuto {
        static columns = [ new AutoColumn('Name', '200px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'MeasurementCompartment';
            this.columns = EDDAuto.MeasurementCompartment.columns;
            this.cacheId = 'MeasurementTypeCompartments';
            this.visibleInput.attr('size', 20)
            this.init();
        }
    }


    export class MeasurementUnit extends BaseAuto {
        static columns = [ new AutoColumn('Name', '150px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'MeasurementUnit';
            this.columns = EDDAuto.MeasurementUnit.columns;
            this.cacheId = 'UnitTypes';
            this.visibleInput.attr('size', 10)
            this.init();
        }
    }


    // .autocomp_sbml_r
    export class MetaboliteExchange extends BaseAuto {

        static columns = [
            new AutoColumn('Exchange', '200px', 'exchange'),
            new AutoColumn('Reactant', '200px', 'reactant')
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'MetaboliteExchange';
            this.columns = EDDAuto.MetaboliteExchange.columns;
            this.cacheId = 'Exchange';
            this.opt['search_extra'] = { 'template': $(this.visibleInput).data('template') };
            this.init();
        }
    }


    // .autocomp_sbml_s
    export class MetaboliteSpecies extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'MetaboliteSpecies';
            this.columns = EDDAuto.MetaboliteSpecies.columns;
            this.cacheId = 'Species';
            this.opt['search_extra'] = { 'template': $(this.visibleInput).data('template') };
            this.init();
        }
    }


    export class StudyWritable extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'StudyWritable';
            this.columns = EDDAuto.StudyWritable.columns;
            this.cacheId = 'StudiesWritable';
            this.init();
        }
    }


    export class StudyLine extends BaseAuto {
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'StudyLine';
            this.columns = EDDAuto.StudyLine.columns;
            this.cacheId = 'Lines';
            this.opt['search_extra'] = { 'study':  EDDData.currentStudyID };
            this.init();
        }
    }


    export class Registry extends BaseAuto {
        static columns = [
            new AutoColumn('Part ID', '100px', 'partId'),
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Description', '250px', 'shortDescription')
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Registry';
            this.columns = EDDAuto.Registry.columns;
            this.cacheId = 'Registries';
            this.value_key = 'recordId';
            this.init();
        }
    }
}


var EDD_auto = EDD_auto || {}, EDDData:EDDData = EDDData || <EDDData>{};
(function ($) { // immediately invoked function to bind jQuery to $

    var meta_columns;

    EDD_auto.cache_counter = EDD_auto.cache_counter || 0;

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
        if (column && column.width) { cell.css('minWidth', column.width); }
        if (column && column.maxWidth) { cell.css('maxWidth', column.maxWidth); }
        this._valOrNbsp(cell, label);
        row.append(cell);
        return cell;
    },
    _appendMessage: function(row, label) {
        var cell = $('<div></div>').appendTo(row);
        $('<i>').text(label).appendTo(cell);
        return cell;
    },
    _renderMenu: function(ul, items) {
        var self = this, thead;

        if (self.options.showHeader) {
            var table=$('<li class="ui-widget-header"></div>');
            // Column headers
            $.each(self.options.columns, function(index, column) {
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
        var t = '', self = this, result = $('<li>').data('ui-autocomplete-item', item);

        if (item instanceof EDDAuto.NonValueItem) {
            self._appendMessage(result, item.label);
        } else {
            $.each(self.options.columns, function(index, column) {
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
        }

        result.appendTo(ul);
        return result;
    }
});


EDD_auto.create_autocomplete = function create_autocomplete(container) {
    var visibleInput, hiddenInput;
    visibleInput = $('<input type="text"/>').addClass('autocomp').appendTo(container);
    hiddenInput = $('<input type="hidden"/>').appendTo(container);
    return visibleInput;
};


EDD_auto.initial_search = function initial_search(auto: EDDAuto.BaseAuto, term: string) {
    var autoInput: JQuery, oldResponse: any;
    autoInput = auto.visibleInput;
    oldResponse = autoInput.mcautocomplete('option', 'response');
    autoInput.mcautocomplete('option', 'response', function (ev, ui) {
        var highest = 0, best, termLower = term.toLowerCase();
        autoInput.mcautocomplete('option', 'response', oldResponse);
        oldResponse.call({}, ev, ui);
        ui.content.every(function (item) {
            var val = item[auto.display_key], valLower = val.toLowerCase();
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



/***********************************************************************/

$( window ).on("load", function() { // Shortcutting this to .load confuses jQuery
    var setup_info;
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on('focus', '.autocomp', function (ev) {
        $(ev.target).addClass('autocomp_search').mcautocomplete('search');
    });
});

}(jQuery));
