/// <reference path="../typings/jquery/jquery.mcautocomplete.d.ts" />

import * as jQuery from "jquery";
import "jquery-ui";
import { MultiColumnAuto } from "./MultiColumnAutocomplete"


export module EDDAuto {

    var autoCache = {};

    export interface AutocompleteOptions {
        // Mandatory: A JQuery object identifying the DOM element that contains, or will contain,
        // the input elements used by this autocomplete object.
        container: JQuery,

        // The JQuery object that uniquely identifies the visible autocomplete text input in the
        // DOM. This element will have the "autocomp" class added if not already present.
        // Note that when specifying this, the visibleInput must have an accompanying hiddenInput
        // specified which will be used to cache the selected value.
        // If neither of these values are supplied, both elements will be created and appended to
        // the container element.
        visibleInput?: JQuery,
        hiddenInput?: JQuery,

        // Optional form submission names to assign to the visible and hidden elements.
        // To the back end, the hiddenInput is generally the important one, so the option
        // for that is simply called 'name'.
        visibleInputName?: string,
        name?: string,

        // The string to show initially in the input element.
        // This may or may not be equivalent to a valid hiddenInput value.
        visibleValue?: string,

        // A starting value for hiddenInput.  This value is a unique identifier of some
        // back-end data structure - like a database record Id.
        // If this is provided but visibleValue is not, we attempt to generate an initial
        // visibleValue based on it.
        hiddenValue?: string,

        // Whether the field must have some value before submission (i.e. cannot be blank).
        // Default is false.
        nonEmptyRequired?: boolean,    // TODO: Implement

        // Whether the field's contents must resolve to a valid Id before submission.
        // Default is usually true - it depends on the subclass.
        // Note that when nonEmptyRequired is false, a blank value is considered valid!
        validIdRequired?: boolean,    // TODO: Implement

        // Whether a blank field defaults to show a "(Create New)" placeholder and submits
        // a hidden Id of 'new'.
        // Default is false.
        emptyCreatesNew?: boolean,    // TODO: Implement

        // an optional dictionary to use / maintain as a cache of query results for this
        // autocomplete. Maps search term -> results.
        cache?: any,

        // the URI of the REST resource to use for querying autocomplete results
        search_uri?: string
    }


    export type ExtraSearchParameters = {[param: string]: string};


    export class BaseAuto {

        container: JQuery;
        visibleInput: JQuery;
        hiddenInput: JQuery;

        modelName: string;
        uid: number;

        opt: AutocompleteOptions;
        search_opt: ExtraSearchParameters;
        columns: MultiColumnAuto.AutoColumn[];
        display_key: any;
        value_key: any;
        cacheId: any;
        cache: any;
        search_uri: string;

        delete_last: boolean = false;

        static _uniqueIndex = 1;
        static _request_cache = {};

        static initPreexisting(context?: Element | JQuery) {
            $('input.autocomp', context).each((i, element) => {
                var visibleInput: JQuery = $(element),
                    autocompleteType: string = $(element).attr('eddautocompletetype');
                if (!autocompleteType) {
                    throw Error("eddautocompletetype must be defined!");
                }
                var opt: AutocompleteOptions = {
                    container: visibleInput.parent(),
                    visibleInput: visibleInput,
                    hiddenInput: visibleInput.next('input[type=hidden]')
                };
                // This will automatically attach the created object to both input elements, in
                // the jQuery data interface, under the 'edd' object, attribute 'autocompleteobj'.
                var type_class = class_lookup[autocompleteType];
                new type_class(opt);
            });
        }

        static create_autocomplete(container: JQuery): JQuery {
            var visibleInput, hiddenInput;
            visibleInput = $('<input type="text"/>').addClass('autocomp').appendTo(container);
            hiddenInput = $('<input type="hidden"/>').appendTo(container);
            return visibleInput;
        }

        static initial_search(auto: BaseAuto, term: string): void {
            var autoInput: JQuery, oldResponse: any;
            autoInput = auto.visibleInput;
            oldResponse = autoInput.mcautocomplete('option', 'response');
            autoInput.mcautocomplete('option', 'response', function(ev, ui) {
                var highest = 0, best, termLower = term.toLowerCase();
                autoInput.mcautocomplete('option', 'response', oldResponse);
                oldResponse.call({}, ev, ui);
                ui.content.every(function(item) {
                    var val: string, valLower: string;
                    if (item instanceof MultiColumnAuto.NonValueItem) {
                        return true;
                    }
                    val = item[auto.display_key];
                    valLower = val.toLowerCase();
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
        }

        /**
         * Sets up the multicolumn autocomplete behavior for an existing text input. Must be
         * called after the $(window).load handler above.
         * @param opt a dictionary of settings following the AutocompleteOptions interface format.
         * @param search_options an optional dictionary of data to be sent to the search backend
         *     as part of the autocomplete search request.
         */
        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {

            var id = BaseAuto._uniqueIndex;
            BaseAuto._uniqueIndex += 1;
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
            this.visibleInput.data('edd', { 'autocompleteobj': this });
            this.hiddenInput.data('edd', { 'autocompleteobj': this });

            this.display_key = 'name';
            this.value_key = 'id';
            this.search_uri = this.opt.search_uri || "/search/";

            // Static specification of column layout for each model in EDD that we want to
            // make searchable.  (This might be better done as a static JSON file
            // somewhere.)
            this.columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];
        }

        clear() {
            var blank = this.opt['emptyCreatesNew'] ? 'new' : '';
            this.hiddenInput.val(blank).trigger('change').trigger('input');
        }

        init() {
            var self: BaseAuto = this;

            // this.cacheId might have been set by a constructor in a subclass
            this.cacheId = this.opt['cacheId']
                || this.cacheId
                || 'cache_' + (this.uid);
            this.cache = this.opt['cache']
                || (autoCache[this.cacheId] = autoCache[this.cacheId] || {});

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

            this.visibleInput.mcautocomplete({
                // These next two options are what this plugin adds to the autocomplete widget.
                // FIXME these will need to vary depending on record type
                'showHeader': true,
                'columns': this.columns,
                // Event handler for when a list item is selected.
                'select': function(event, ui) {
                    var cacheKey, record, visibleValue, hiddenValue;
                    if (ui.item) {
                        record = self.loadRecord(ui.item);
                        self.visibleInput.val(visibleValue = self.loadDisplayValue(record));
                        self.hiddenInput.val(hiddenValue = self.loadHiddenValue(record))
                            .trigger('change')
                            .trigger('input');
                        self.visibleInput.trigger('autochange', [visibleValue, hiddenValue]);
                    }
                    return false;
                },
                'focus': function(event, ui) { event.preventDefault(); },
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
                'source': function(request, response) {
                    var result, termCachedResults;
                    termCachedResults = self.loadModelCache()[request.term];
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
                        }, self.search_opt),
                        'success': self.processResults.bind(self, request, response),
                        'error': function(jqXHR, status, err) {
                            response([MultiColumnAuto.NonValueItem.ERROR]);
                        }
                    });
                },
                'search': function(ev, ui) {
                    $(ev.target).addClass('wait');
                },
                'response': function(ev, ui) {
                    $(ev.target).removeClass('wait');
                }
            }).on('blur', function(ev) {
                if (self.delete_last) {
                    // User cleared value in autocomplete, remove value from hidden ID
                    self.clear();
                } else {
                    // User modified value in autocomplete without selecting new one
                    // restore previous value
                    self.undo();
                }
                self.delete_last = false;
            }).on('keydown', function(ev: JQueryKeyEventObject) {
                // if the keydown ends up clearing the visible input, set flag
                self.delete_last = self.visibleInput.val().trim() === '';
            });
        };

        loadDisplayValue(record: any): any {
            return record[this.display_key] || '';
        }

        loadHiddenValue(record: any): any {
            return record[this.value_key] || '';
        }

        loadModelCache(): any {
            var cache = BaseAuto._request_cache[this.modelName] || {};
            BaseAuto._request_cache[this.modelName] = cache;
            return cache;
        }

        loadRecord(item: any): any {
            var cacheKey = item[this.value_key],
                record = (this.cache[cacheKey] = this.cache[cacheKey] || {});
            $.extend(record, item);
            return record;
        }

        processResults(request, response, data: any): void {
            var result, modelCache = this.loadModelCache();
            // The default handler will display "No Results Found" if no items are returned.
            if (!data || !data.rows || data.rows.length === 0) {
                result = [MultiColumnAuto.NonValueItem.NO_RESULT];
            } else {
                // store returned results in cache
                result = data.rows;
                result.forEach((item) => {
                    var cacheKey = item[this.value_key],
                        cacheRecord = this.cache[cacheKey] || {};
                    this.cache[cacheKey] = cacheRecord;
                    $.extend(cacheRecord, item);
                });
            }
            modelCache[request.term] = result;
            response(result);
        }

        undo(): void {
            var old: any = this.cache[this.valKey()] || {};
            this.visibleInput.val(this.loadDisplayValue(old));
        }

        val(): string {
            return <string> this.hiddenInput.val();
        }

        valKey(): any {
            // most autocompletes key values by integers
            return parseInt(this.val(), 10);
        }
    }


    // .autocomp_user
    export class User extends BaseAuto {

        static columns = [
            new MultiColumnAuto.AutoColumn('User', '150px', 'fullname'),
            new MultiColumnAuto.AutoColumn('Initials', '60px', 'initials'),
            new MultiColumnAuto.AutoColumn('E-mail', '150px', 'email')
        ];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'User';
            this.columns = User.columns;
            this.display_key = 'fullname';
            this.cacheId = 'Users';
            this.init();
        }

        loadDisplayValue(record: any): any {
            var value = super.loadDisplayValue(record);
            if (value.trim() === '') {
                return record['email'];
            } else {
                return value
            }
        }
    }


    export class Group extends BaseAuto {

        static columns = [
            new MultiColumnAuto.AutoColumn('Group', '200px', 'name')
        ];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'Group';
            this.columns = Group.columns;
            this.display_key = 'name';
            this.cacheId = 'Groups';
            this.init();
        }
    }


    // .autocomp_carbon
    export class CarbonSource extends BaseAuto {

        static columns = [
            new MultiColumnAuto.AutoColumn('Name', '150px', 'name'),
            new MultiColumnAuto.AutoColumn('Volume', '60px', 'volume'),
            new MultiColumnAuto.AutoColumn('Labeling', '100px', 'labeling'),
            new MultiColumnAuto.AutoColumn('Description', '250px', 'description', '600px'),
            new MultiColumnAuto.AutoColumn('Initials', '60px', 'initials')
        ];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'CarbonSource';
            this.columns = CarbonSource.columns;
            this.cacheId = 'CSources';
            this.init();
        }
    }


    // .autocomp_type
    export class MetadataType extends BaseAuto {

        static columns = [
            new MultiColumnAuto.AutoColumn('Name', '200px', 'name'),
            new MultiColumnAuto.AutoColumn('For', '50px', function(item, column, index) {
                var con = item.context;
                return $('<span>').addClass('tag').text(
                    con === 'L' ? 'Line' : con === 'A' ? 'Assay' : con === 'S' ? 'Study' : '?');
            })
        ];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'MetadataType';
            this.columns = MetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_atype
    export class AssayMetadataType extends BaseAuto {

        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'AssayMetadataType';
            this.columns = AssayMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_altype
    export class AssayLineMetadataType extends BaseAuto {

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'AssayLineMetadataType';
            this.columns = MetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_ltype
    export class LineMetadataType extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'LineMetadataType';
            this.columns = LineMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_stype
    export class StudyMetadataType extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'StudyMetadataType';
            this.columns = StudyMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
    }


    // .autocomp_metabol
    export class Metabolite extends BaseAuto {

        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'Metabolite';
            this.columns = Metabolite.columns;
            this.cacheId = 'MetaboliteTypes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class Protein extends BaseAuto {

        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'ProteinIdentifier';
            this.columns = Protein.columns;
            this.cacheId = 'Proteins';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class Gene extends BaseAuto {

        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'GeneIdentifier';
            this.columns = Gene.columns;
            this.cacheId = 'Genes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class Phosphor extends BaseAuto {

        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'Phosphor';
            this.columns = Phosphor.columns;
            this.cacheId = 'Phosphors';
            this.visibleInput.attr('size', 45);
            this.init();
        }
    }


    export class GenericOrMetabolite extends BaseAuto {
        static columns = [
            new MultiColumnAuto.AutoColumn('Name', '300px', 'name'),
            new MultiColumnAuto.AutoColumn('Type', '100px', GenericOrMetabolite.type_label)
        ];
        static family_lookup = {
            'm': 'Metabolite',
            'p': 'Protein',
            'g': 'Gene'
        }

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'GenericOrMetabolite';
            this.columns = GenericOrMetabolite.columns;
            this.cacheId = 'GenericOrMetaboliteTypes';
            this.visibleInput.attr('size', 45)
            this.init();
        }

        static type_label(item: any, col: MultiColumnAuto.AutoColumn, i: number): string {
            var type_family = GenericOrMetabolite.family_lookup[item.family];
            if (type_family !== undefined) {
                return type_family;
            }
            return 'Generic';
        }
    }


    // .autocomp_measure
    export class MeasurementType extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'MeasurementType';
            this.columns = MeasurementType.columns;
            this.cacheId = 'MeasurementTypes';
            this.visibleInput.attr('size', 45)
            this.init();
        }
    }


    export class MeasurementCompartment extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '200px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'MeasurementCompartment';
            this.columns = MeasurementCompartment.columns;
            this.cacheId = 'MeasurementTypeCompartments';
            this.visibleInput.attr('size', 20)
            this.init();
        }
    }


    export class MeasurementUnit extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '150px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'MeasurementUnit';
            this.columns = MeasurementUnit.columns;
            this.cacheId = 'UnitTypes';
            this.visibleInput.attr('size', 10)
            this.init();
        }
    }


    // .autocomp_sbml_r
    export class MetaboliteExchange extends BaseAuto {

        static columns = [
            new MultiColumnAuto.AutoColumn('Exchange', '200px', 'exchange'),
            new MultiColumnAuto.AutoColumn('Reactant', '200px', 'reactant')
        ];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'MetaboliteExchange';
            this.columns = MetaboliteExchange.columns;
            this.cacheId = 'Exchange';
            this.display_key = 'exchange';
            $.extend(this.search_opt, { 'template': $(this.visibleInput).data('template') });
            this.init();
        }
    }


    // .autocomp_sbml_s
    export class MetaboliteSpecies extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'MetaboliteSpecies';
            this.columns = MetaboliteSpecies.columns;
            this.cacheId = 'Species';
            $.extend(this.search_opt, { 'template': $(this.visibleInput).data('template') });
            this.init();
        }
    }


    export class StudyWritable extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'StudyWritable';
            this.columns = StudyWritable.columns;
            this.cacheId = 'StudiesWritable';
            this.init();
        }
    }


    export class StudyLine extends BaseAuto {
        static columns = [new MultiColumnAuto.AutoColumn('Name', '300px', 'name')];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'StudyLine';
            this.columns = StudyLine.columns;
            this.cacheId = 'Lines';
            this.init();
        }
    }


    export class Registry extends BaseAuto {
        static columns = [
            new MultiColumnAuto.AutoColumn('Part ID', '100px', 'partId'),
            new MultiColumnAuto.AutoColumn('Type', '100px', 'type'),
            new MultiColumnAuto.AutoColumn('Name', '150px', 'name'),
            new MultiColumnAuto.AutoColumn('Description', '250px', 'shortDescription')
        ];

        constructor(opt: AutocompleteOptions, search_options?: ExtraSearchParameters) {
            super(opt, search_options);
            this.modelName = 'Registry';
            this.columns = Registry.columns;
            this.cacheId = 'Registries';
            this.value_key = 'recordId';
            this.init();
        }

        valKey(): any {
            // Registry autocompletes key values by UUID
            return this.val();
        }
    }


    /**
     * Adding this because looking up classes by name in the module no longer works correctly.
     * Where code was using:
     *    new EDDAuto[classname]()
     * Now it will use:
     *    new class_lookup[classname]()
     */
    const class_lookup: {[name: string]: typeof BaseAuto} = {
        "User": User,
        "Group": Group,
        "CarbonSource": CarbonSource,
        "MetadataType": MetadataType,
        "AssayMetadataType": AssayMetadataType,
        "AssayLineMetadataType": AssayLineMetadataType,
        "LineMetadataType": LineMetadataType,
        "StudyMetadataType": StudyMetadataType,
        "Metabolite": Metabolite,
        "Protein": Protein,
        "Gene": Gene,
        "Phosphor": Phosphor,
        "GenericOrMetabolite": GenericOrMetabolite,
        "MeasurementType": MeasurementType,
        "MeasurementCompartment": MeasurementCompartment,
        "MeasurementUnit": MeasurementUnit,
        "MetaboliteExchange": MetaboliteExchange,
        "MetaboliteSpecies": MetaboliteSpecies,
        "StudyWritable": StudyWritable,
        "StudyLine": StudyLine,
        "Registry": Registry
    }

}
