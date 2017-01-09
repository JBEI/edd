// requires: jQuery, jQuery-UI
//
// XXX obtained from http://jsfiddle.net/alforno/g4stL/
// see copyright notice below
//


module EDDAuto {


    export interface AutocompleteOptions {
        // Mandatory: A JQuery object identifying the DOM element that contains, or will contain,
        // the input elements used by this autocomplete object.
        container:JQuery,

        // The JQuery object that uniquely identifies the visible autocomplete text input in the DOM.
        // This element will have the "autocomp" class added if not already present.
        // Note that when specifying this, the visibleInput must have an accompanying hiddenInput
        // specified which will be used to cache the selected value.
        // If neither of these values are supplied, both elements will be created and appended to the
        // container element.
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
        // If this is provided but visibleValue is not, we attempt to generate an initial visibleValue
        // based on it.
        hiddenValue?:string,

        // Whether the field must have some value before submission (i.e. cannot be blank). Default is false.
        nonEmptyRequired?:boolean,    // TODO: Implement

        // Whether the field's contents must resolve to a valid Id before submission.
        // Default is usually true - it depends on the subclass.
        // Note that when nonEmptyRequired is false, a blank value is considered valid!
        validIdRequired?:boolean,    // TODO: Implement

        // Whether a blank field defaults to show a "(Create New)" placeholder and submits a hidden Id of 'new'.
        // Default is false.        
        emptyCreatesNew?:boolean,    // TODO: Implement

        // an optional dictionary to use / maintain as a cache of query results for this
        // autocomplete. Maps search term -> results.
        cache?:any,

        // an optional dictionary of static results to prepend to those returned
        // by search queries
        prependResults?:any,

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


    export class BaseAuto {

        container:JQuery;
        visibleInput:JQuery;
        hiddenInput:JQuery;

        modelName:string;
        uid:number;

        opt:AutocompleteOptions;
        search_opt:AutocompleteOptions;
        prependResults:any;
        emptyResult:any;
        columns:AutoColumn[];
        display_key:any;
        value_key:any;
        cacheId:any;
        cache:any;
        search_uri:string;

        static _uniqueIndex = 1;


        static initPreexisting() {
            // Using 'for' instead of '$.each()' because TypeScript likes to monkey with 'this'. 
            var autcompletes = $('input.autocomp').get();
            for ( var i = 0; i < autcompletes.length; i++ ) {
                var a = autcompletes[i];
                var autocompleteType = $(a).attr('eddautocompletetype');
                if (!autocompleteType) {
                    throw Error("eddautocompletetype must be defined!");
                }
                var opt:AutocompleteOptions = {
                    container: $(a).parent(),
                    visibleInput: $(a),
                    hiddenInput: $(a).next('input[type=hidden]')
                };
                // This will automatically attach the created object to both input elements,
                // in the jQuery data interface, under the 'edd' object, attribute 'autocompleteobj'.
                new EDDAuto[autocompleteType](opt);
            }
        }


        // Sets up the multicolumn autocomplete behavior for an existing text input.  Must be called
        // after the $(window).load handler above.
        // @param opt a dictionary of settings following the AutocompleteOptions interface format.
        // @param search_options an optional dictionary of data to be sent to the search backend as part
        // of the autocomplete search request.  To be received on the back-end, additional search
        // parameters should be captured under an included "search_extra" element.
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

            this.prependResults = this.opt.prependResults || [];

            this.display_key = 'name';
            this.value_key = 'id';
            this.search_uri = this.opt.search_uri || "/search";

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

            this.emptyResult = {};
            this.emptyResult[this.columns[0].valueField] = this.emptyResult[0] = 'No Results Found';
            this.columns.slice(1).forEach((column:AutoColumn, index:number):void => {
                this.emptyResult[column.valueField] = this.emptyResult[index] = '';
            });

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

            var __this = this;
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
                        cacheKey = ui.item[__this.value_key];
                        record = __this.cache[cacheKey] = __this.cache[cacheKey] || {};
                        $.extend(record, ui.item);
                        visibleValue = record[__this.display_key] || '';
                        hiddenValue = record[__this.value_key] || '';
                        // assign value of selected item ID to sibling hidden input

                        __this.visibleInput.val(visibleValue);

                        __this.hiddenInput.val(hiddenValue)
                            .trigger('change')
                            .trigger('input');
                    }
                    return false;
                },
                // The rest of the options are for configuring the ajax webservice call.
                'minLength': 0,
                'source': function (request, response) {
                    var result, modelCache, termCachedResults;
                    modelCache = EDD_auto.request_cache[__this.modelName] = EDD_auto.request_cache[__this.modelName] || {};
                    termCachedResults = modelCache[request.term];
                    if (termCachedResults) {
                        // prepend any optional default results
                        var displayResults = __this.prependResults.concat(termCachedResults);

                        response(displayResults);
                        return;
                    }
                    $.ajax({
                        'url': __this.search_uri,
                        'dataType': 'json',
                        'data': $.extend({
                            'model': __this.modelName,
                            'term': request.term
                        }, __this.opt['search_extra']),
                        // The success event handler will display "No match found" if no items are returned.
                        'success': function (data) {
                            var result;
                            if (!data || !data.rows || data.rows.length === 0) {
                                result = [ __this.emptyResult ];
                            } else {
                                result = data.rows;
                                // store returned results in cache
                                result.forEach(function (item) {
                                    var cacheKey = item[__this.value_key],
                                        cache_record = __this.cache[cacheKey] = __this.cache[cacheKey] || {};
                                    $.extend(cache_record, item);
                                });
                            }
                            modelCache[request.term] = result;

                            // prepend any optional default results
                            var displayResults = __this.prependResults.concat(result);
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
                var auto = __this.visibleInput;
                var hiddenInput = __this.hiddenInput;
                var hiddenId = hiddenInput.val();
                var old = __this.cache[hiddenId] || {};
                var current = auto.val();
                var blank = __this.opt['emptyCreatesNew'] ? 'new' : '';

                if (current.trim() === '') {
                    // User cleared value in autocomplete, remove value from hidden ID
                    hiddenInput.val(blank)
                        .trigger('change')
                        .trigger('input');
                } else {
                    // User modified value in autocomplete without selecting new one, restore previous
                    auto.val(old[__this.display_key] || blank);
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



    // .autocomp_reg
    export class Strain extends BaseAuto {

        static columns = [
            new AutoColumn('Part ID', '100px', 'partId'),
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Description', '250px', 'shortDescription')
        ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Strain';
            this.columns = EDDAuto.Strain.columns;
            this.value_key = 'recordId';
            this.cacheId = 'Strains';
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
        static columns = [ new AutoColumn('Name', '300px', 'name') ];

        constructor(opt:AutocompleteOptions, search_options?) {
            super(opt, search_options);
            this.modelName = 'Registry';
            this.columns = EDDAuto.Registry.columns;
            this.cacheId = 'Registries';
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
        if (column.width) { cell.css('minWidth', column.width); }
        if (column.maxWidth) { cell.css('maxWidth', column.maxWidth); }
        this._valOrNbsp(cell, label);
        row.append(cell);
        return cell;
    },
    _renderMenu: function(ul, items) {
        var self = this, thead;
    
        if (this.options.showHeader) {
            var table=$('<li class="ui-widget-header"></div>');
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
        var result = $('<li>').data('ui-autocomplete-item', item)

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
    var visibleInput, hiddenInput;
    visibleInput = $('<input type="text"/>').addClass('autocomp').appendTo(container);
    hiddenInput = $('<input type="hidden"/>').appendTo(container);
    return visibleInput;
};


EDD_auto.initial_search = function initial_search(selector, term) {
    var autoInput = $(selector);
    var autoObj = autoInput.data('edd').autocompleteobj;
    var oldResponse;
    oldResponse = autoInput.mcautocomplete('option', 'response');
    autoInput.mcautocomplete('option', 'response', function (ev, ui) {
        var highest = 0, best, termLower = term.toLowerCase();
        autoInput.mcautocomplete('option', 'response', oldResponse);
        oldResponse.call({}, ev, ui);
        ui.content.every(function (item) {
            var val = item[autoObj.display_key], valLower = val.toLowerCase();
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
    })
});

}(jQuery));
