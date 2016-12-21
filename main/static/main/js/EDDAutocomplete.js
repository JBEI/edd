// File last modified on: Wed Dec 21 2016 14:53:35  
// requires: jQuery, jQuery-UI
//
// XXX obtained from http://jsfiddle.net/alforno/g4stL/
// see copyright notice below
//
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var EDDAuto;
(function (EDDAuto) {
    var AutoColumn = (function () {
        function AutoColumn(name, minWidth, valueField, maxWidth) {
            this.name = name;
            this.width = minWidth;
            this.maxWidth = maxWidth || null;
            this.valueField = valueField;
            return this;
        }
        return AutoColumn;
    }());
    var BaseAuto = (function () {
        // Sets up the multicolumn autocomplete behavior for an existing text input.  Must be called
        // after the $(window).load handler above.
        // @param opt a dictionary of settings following the AutocompleteOptions interface format.
        // @param search_options an optional dictionary of data to be sent to the search backend as part
        // of the autocomplete search request.  To be received on the back-end, additional search
        // parameters should be captured under an included "search_extra" element.
        function BaseAuto(opt, search_options) {
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
            this.visibleInput.data('edd', { 'autocompleteobj': this });
            this.hiddenInput.data('edd', { 'autocompleteobj': this });
            this.prependResults = this.opt.prependResults || [];
            this.display_key = 'name';
            this.value_key = 'id';
            this.search_uri = this.opt.search_uri || "/search";
            // Static specification of column layout for each model in EDD that we want to
            // make searchable.  (This might be better done as a static JSON file
            // somewhere.)
            this.columns = [new AutoColumn('Name', '300px', 'name')];
        }
        BaseAuto.initPreexisting = function () {
            // Using 'for' instead of '$.each()' because TypeScript likes to monkey with 'this'. 
            var autcompletes = $('input.autocomp').get();
            for (var i = 0; i < autcompletes.length; i++) {
                var a = autcompletes[i];
                var autocompleteType = $(a).attr('eddautocompletetype');
                if (!autocompleteType) {
                    throw Error("eddautocompletetype must be defined!");
                }
                var opt = {
                    container: $(a).parent(),
                    visibleInput: $(a),
                    hiddenInput: $(a).next('input[type=hidden]')
                };
                // This will automatically attach the created object to both input elements,
                // in the jQuery data interface, under the 'edd' object, attribute 'autocompleteobj'.
                new EDDAuto[autocompleteType](opt);
            }
        };
        BaseAuto.prototype.init = function () {
            var _this = this;
            // this.cacheId might have been set by a constructor in a subclass
            this.cacheId = this.opt['cacheId']
                || this.cacheId
                || 'cache_' + (++EDD_auto.cache_counter);
            this.cache = this.opt['cache']
                || (EDDData[this.cacheId] = EDDData[this.cacheId] || {});
            this.emptyResult = {};
            this.emptyResult[this.columns[0].valueField] = this.emptyResult[0] = 'No Results Found';
            this.columns.slice(1).forEach(function (column, index) {
                _this.emptyResult[column.valueField] = _this.emptyResult[index] = '';
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
            this.visibleInput.mcautocomplete({
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
                                result = [__this.emptyResult];
                            }
                            else {
                                result = data.rows;
                                // store returned results in cache
                                result.forEach(function (item) {
                                    var cacheKey = item[__this.value_key], cache_record = __this.cache[cacheKey] = __this.cache[cacheKey] || {};
                                    $.extend(cache_record, item);
                                });
                            }
                            modelCache[request.term] = result;
                            // prepend any optional default results
                            var displayResults = __this.prependResults.concat(result);
                            response(displayResults);
                        },
                        'error': function (jqXHR, status, err) {
                            response(['Server Error']);
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
                }
                else {
                    // User modified value in autocomplete without selecting new one, restore previous
                    auto.val(old[__this.display_key] || blank);
                }
            });
        };
        ;
        BaseAuto.prototype.val = function () {
            return this.hiddenInput.val();
        };
        BaseAuto._uniqueIndex = 1;
        return BaseAuto;
    }());
    EDDAuto.BaseAuto = BaseAuto;
    // .autocomp_user
    var User = (function (_super) {
        __extends(User, _super);
        function User(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'User';
            this.columns = EDDAuto.User.columns;
            this.display_key = 'fullname';
            this.cacheId = 'Users';
            this.init();
        }
        User.columns = [
            new AutoColumn('User', '150px', 'fullname'),
            new AutoColumn('Initials', '60px', 'initials'),
            new AutoColumn('E-mail', '150px', 'email')
        ];
        return User;
    }(BaseAuto));
    EDDAuto.User = User;
    var Group = (function (_super) {
        __extends(Group, _super);
        function Group(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Group';
            this.columns = EDDAuto.Group.columns;
            this.display_key = 'name';
            this.cacheId = 'Groups';
            this.init();
        }
        Group.columns = [
            new AutoColumn('Group', '200px', 'name')
        ];
        return Group;
    }(BaseAuto));
    EDDAuto.Group = Group;
    // .autocomp_reg
    var Strain = (function (_super) {
        __extends(Strain, _super);
        function Strain(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Strain';
            this.columns = EDDAuto.Strain.columns;
            this.value_key = 'recordId';
            this.cacheId = 'Strains';
            this.init();
        }
        Strain.columns = [
            new AutoColumn('Part ID', '100px', 'partId'),
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Description', '250px', 'shortDescription')
        ];
        return Strain;
    }(BaseAuto));
    EDDAuto.Strain = Strain;
    // .autocomp_carbon
    var CarbonSource = (function (_super) {
        __extends(CarbonSource, _super);
        function CarbonSource(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'CarbonSource';
            this.columns = EDDAuto.CarbonSource.columns;
            this.cacheId = 'CSources';
            this.init();
        }
        CarbonSource.columns = [
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Volume', '60px', 'volume'),
            new AutoColumn('Labeling', '100px', 'labeling'),
            new AutoColumn('Description', '250px', 'description', '600px'),
            new AutoColumn('Initials', '60px', 'initials')
        ];
        return CarbonSource;
    }(BaseAuto));
    EDDAuto.CarbonSource = CarbonSource;
    // .autocomp_type
    var MetadataType = (function (_super) {
        __extends(MetadataType, _super);
        function MetadataType(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'MetadataType';
            this.columns = EDDAuto.MetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
        MetadataType.columns = [
            new AutoColumn('Name', '200px', 'name'),
            new AutoColumn('For', '50px', function (item, column, index) {
                var con = item.context;
                return $('<span>').addClass('tag').text(con === 'L' ? 'Line' : con === 'A' ? 'Assay' : con === 'S' ? 'Study' : '?');
            })
        ];
        return MetadataType;
    }(BaseAuto));
    EDDAuto.MetadataType = MetadataType;
    // .autocomp_atype
    var AssayMetadataType = (function (_super) {
        __extends(AssayMetadataType, _super);
        function AssayMetadataType(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'AssayMetadataType';
            this.columns = EDDAuto.AssayMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
        AssayMetadataType.columns = [new AutoColumn('Name', '300px', 'name')];
        return AssayMetadataType;
    }(BaseAuto));
    EDDAuto.AssayMetadataType = AssayMetadataType;
    // .autocomp_altype
    var AssayLineMetadataType = (function (_super) {
        __extends(AssayLineMetadataType, _super);
        function AssayLineMetadataType(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'AssayLineMetadataType';
            this.columns = EDDAuto.MetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
        return AssayLineMetadataType;
    }(BaseAuto));
    EDDAuto.AssayLineMetadataType = AssayLineMetadataType;
    // .autocomp_ltype
    var LineMetadataType = (function (_super) {
        __extends(LineMetadataType, _super);
        function LineMetadataType(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'LineMetadataType';
            this.columns = EDDAuto.LineMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
        LineMetadataType.columns = [new AutoColumn('Name', '300px', 'name')];
        return LineMetadataType;
    }(BaseAuto));
    EDDAuto.LineMetadataType = LineMetadataType;
    // .autocomp_stype
    var StudyMetadataType = (function (_super) {
        __extends(StudyMetadataType, _super);
        function StudyMetadataType(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'StudyMetadataType';
            this.columns = EDDAuto.StudyMetadataType.columns;
            this.cacheId = 'MetaDataTypes';
            this.init();
        }
        StudyMetadataType.columns = [new AutoColumn('Name', '300px', 'name')];
        return StudyMetadataType;
    }(BaseAuto));
    EDDAuto.StudyMetadataType = StudyMetadataType;
    // .autocomp_metabol
    var Metabolite = (function (_super) {
        __extends(Metabolite, _super);
        function Metabolite(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Metabolite';
            this.columns = EDDAuto.Metabolite.columns;
            this.cacheId = 'MetaboliteTypes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
        Metabolite.columns = [new AutoColumn('Name', '300px', 'name')];
        return Metabolite;
    }(BaseAuto));
    EDDAuto.Metabolite = Metabolite;
    var Protein = (function (_super) {
        __extends(Protein, _super);
        function Protein(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Protein';
            this.columns = EDDAuto.Protein.columns;
            this.cacheId = 'Proteins';
            this.visibleInput.attr('size', 45);
            this.init();
        }
        Protein.columns = [new AutoColumn('Name', '300px', 'name')];
        return Protein;
    }(BaseAuto));
    EDDAuto.Protein = Protein;
    var Gene = (function (_super) {
        __extends(Gene, _super);
        function Gene(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Gene';
            this.columns = EDDAuto.Gene.columns;
            this.cacheId = 'Genes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
        Gene.columns = [new AutoColumn('Name', '300px', 'name')];
        return Gene;
    }(BaseAuto));
    EDDAuto.Gene = Gene;
    var Phosphor = (function (_super) {
        __extends(Phosphor, _super);
        function Phosphor(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Phosphor';
            this.columns = EDDAuto.Phosphor.columns;
            this.cacheId = 'Phosphors';
            this.visibleInput.attr('size', 45);
            this.init();
        }
        Phosphor.columns = [new AutoColumn('Name', '300px', 'name')];
        return Phosphor;
    }(BaseAuto));
    EDDAuto.Phosphor = Phosphor;
    var GenericOrMetabolite = (function (_super) {
        __extends(GenericOrMetabolite, _super);
        function GenericOrMetabolite(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'GenericOrMetabolite';
            this.columns = EDDAuto.GenericOrMetabolite.columns;
            this.cacheId = 'GenericOrMetaboliteTypes'; // TODO: Is this correct?
            this.visibleInput.attr('size', 45);
            this.init();
        }
        GenericOrMetabolite.columns = [new AutoColumn('Name', '300px', 'name')];
        return GenericOrMetabolite;
    }(BaseAuto));
    EDDAuto.GenericOrMetabolite = GenericOrMetabolite;
    // .autocomp_measure
    var MeasurementType = (function (_super) {
        __extends(MeasurementType, _super);
        function MeasurementType(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'MeasurementType';
            this.columns = EDDAuto.MeasurementType.columns;
            this.cacheId = 'MeasurementTypes';
            this.visibleInput.attr('size', 45);
            this.init();
        }
        MeasurementType.columns = [new AutoColumn('Name', '300px', 'name')];
        return MeasurementType;
    }(BaseAuto));
    EDDAuto.MeasurementType = MeasurementType;
    var MeasurementCompartment = (function (_super) {
        __extends(MeasurementCompartment, _super);
        function MeasurementCompartment(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'MeasurementCompartment';
            this.columns = EDDAuto.MeasurementCompartment.columns;
            this.cacheId = 'MeasurementTypeCompartments';
            this.visibleInput.attr('size', 20);
            this.init();
        }
        MeasurementCompartment.columns = [new AutoColumn('Name', '200px', 'name')];
        return MeasurementCompartment;
    }(BaseAuto));
    EDDAuto.MeasurementCompartment = MeasurementCompartment;
    var MeasurementUnit = (function (_super) {
        __extends(MeasurementUnit, _super);
        function MeasurementUnit(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'MeasurementUnit';
            this.columns = EDDAuto.MeasurementUnit.columns;
            this.cacheId = 'UnitTypes';
            this.visibleInput.attr('size', 10);
            this.init();
        }
        MeasurementUnit.columns = [new AutoColumn('Name', '150px', 'name')];
        return MeasurementUnit;
    }(BaseAuto));
    EDDAuto.MeasurementUnit = MeasurementUnit;
    // .autocomp_sbml_r
    var MetaboliteExchange = (function (_super) {
        __extends(MetaboliteExchange, _super);
        function MetaboliteExchange(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'MetaboliteExchange';
            this.columns = EDDAuto.MetaboliteExchange.columns;
            this.cacheId = 'Exchange';
            this.opt['search_extra'] = { 'template': $(this.visibleInput).data('template') };
            this.init();
        }
        MetaboliteExchange.columns = [
            new AutoColumn('Exchange', '200px', 'exchange'),
            new AutoColumn('Reactant', '200px', 'reactant')
        ];
        return MetaboliteExchange;
    }(BaseAuto));
    EDDAuto.MetaboliteExchange = MetaboliteExchange;
    // .autocomp_sbml_s
    var MetaboliteSpecies = (function (_super) {
        __extends(MetaboliteSpecies, _super);
        function MetaboliteSpecies(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'MetaboliteSpecies';
            this.columns = EDDAuto.MetaboliteSpecies.columns;
            this.cacheId = 'Species';
            this.opt['search_extra'] = { 'template': $(this.visibleInput).data('template') };
            this.init();
        }
        MetaboliteSpecies.columns = [new AutoColumn('Name', '300px', 'name')];
        return MetaboliteSpecies;
    }(BaseAuto));
    EDDAuto.MetaboliteSpecies = MetaboliteSpecies;
    var StudyWritable = (function (_super) {
        __extends(StudyWritable, _super);
        function StudyWritable(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'StudyWritable';
            this.columns = EDDAuto.StudyWritable.columns;
            this.cacheId = 'StudiesWritable';
            this.init();
        }
        StudyWritable.columns = [new AutoColumn('Name', '300px', 'name')];
        return StudyWritable;
    }(BaseAuto));
    EDDAuto.StudyWritable = StudyWritable;
    var StudyLine = (function (_super) {
        __extends(StudyLine, _super);
        function StudyLine(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'StudyLine';
            this.columns = EDDAuto.StudyLine.columns;
            this.cacheId = 'Lines';
            this.opt['search_extra'] = { 'study': EDDData.currentStudyID };
            this.init();
        }
        StudyLine.columns = [new AutoColumn('Name', '300px', 'name')];
        return StudyLine;
    }(BaseAuto));
    EDDAuto.StudyLine = StudyLine;
    var Registry = (function (_super) {
        __extends(Registry, _super);
        function Registry(opt, search_options) {
            _super.call(this, opt, search_options);
            this.modelName = 'Registry';
            this.columns = EDDAuto.Registry.columns;
            this.cacheId = 'Registries';
            this.init();
        }
        Registry.columns = [new AutoColumn('Name', '300px', 'name')];
        return Registry;
    }(BaseAuto));
    EDDAuto.Registry = Registry;
})(EDDAuto || (EDDAuto = {}));
var EDD_auto = EDD_auto || {}, EDDData = EDDData || {};
(function ($) {
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
        _create: function () {
            this._super();
            this.widget().menu("option", "items", "> :not(.ui-widget-header)");
        },
        _valOrNbsp: function (jQ, value) {
            if (typeof value === 'object') {
                jQ.append(value);
            }
            else if (value && value.trim()) {
                jQ.text(value);
            }
            else {
                jQ.html('&nbsp;');
            }
        },
        _appendCell: function (row, column, label) {
            var cell = $('<div></div>');
            if (column.width) {
                cell.css('minWidth', column.width);
            }
            if (column.maxWidth) {
                cell.css('maxWidth', column.maxWidth);
            }
            this._valOrNbsp(cell, label);
            row.append(cell);
            return cell;
        },
        _renderMenu: function (ul, items) {
            var self = this, thead;
            if (this.options.showHeader) {
                var table = $('<li class="ui-widget-header"></div>');
                // Column headers
                $.each(this.options.columns, function (index, column) {
                    self._appendCell(table, column, column.name);
                });
                ul.append(table);
            }
            // List items
            $.each(items, function (index, item) {
                self._renderItem(ul, item);
            });
            $(ul).addClass("edd-autocomplete-list").find("li:odd").addClass("odd");
        },
        _renderItem: function (ul, item) {
            var t = '', self = this;
            var result = $('<li>').data('ui-autocomplete-item', item);
            $.each(this.options.columns, function (index, column) {
                var value;
                if (column.valueField) {
                    if (typeof column.valueField === 'function') {
                        value = column.valueField.call({}, item, column, index);
                    }
                    else {
                        value = item[column.valueField];
                    }
                }
                else {
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
                    return false; // do not need to continue
                }
                else if (highest < 8 && valLower === termLower) {
                    highest = 8;
                    best = item;
                }
                else if (highest < 7 && valLower.indexOf(termLower) >= 0) {
                    highest = 7;
                    best = item;
                }
                else if (highest < 6 && termLower.indexOf(valLower) >= 0) {
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
    $(window).on("load", function () {
        var setup_info;
        EDDAuto.BaseAuto.initPreexisting();
        // this makes the autocomplete work like a dropdown box
        // fires off a search as soon as the element gains focus
        $(document).on('focus', '.autocomp', function (ev) {
            $(ev.target).addClass('autocomp_search').mcautocomplete('search');
        });
    });
}(jQuery));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRUREQXV0b2NvbXBsZXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRUREQXV0b2NvbXBsZXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCw4QkFBOEI7QUFDOUIsRUFBRTtBQUNGLHVEQUF1RDtBQUN2RCw2QkFBNkI7QUFDN0IsRUFBRTs7Ozs7O0FBR0YsSUFBTyxPQUFPLENBMnBCYjtBQTNwQkQsV0FBTyxPQUFPLEVBQUMsQ0FBQztJQTZEWjtRQU1JLG9CQUFZLElBQUksRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFFBQVM7WUFDN0MsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7WUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7WUFDdEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLElBQUksSUFBSSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUNMLGlCQUFDO0lBQUQsQ0FBQyxBQWJELElBYUM7SUFHRDtRQTRDSSw0RkFBNEY7UUFDNUYsMENBQTBDO1FBQzFDLDBGQUEwRjtRQUMxRixnR0FBZ0c7UUFDaEcseUZBQXlGO1FBQ3pGLDBFQUEwRTtRQUMxRSxrQkFBWSxHQUF1QixFQUFFLGNBQWU7WUFFaEQsSUFBSSxFQUFFLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUM7WUFDdkMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxZQUFZLElBQUksQ0FBQyxDQUFDO1lBQ25DLElBQUksQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7WUFFM0IsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxN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QyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDekQsT0FBTyxHQUFHLENBQUMsQ0FBQztvQkFDWixJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUNoQixDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDSCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNQLFNBQVMsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxvQkFBb0IsRUFBRTtvQkFDMUUsTUFBTSxFQUFFLElBQUk7aUJBQ2YsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsU0FBUyxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUM7SUFJRix5RUFBeUU7SUFFekUsQ0FBQyxDQUFFLE1BQU0sQ0FBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUU7UUFDbkIsSUFBSSxVQUFVLENBQUM7UUFDZixPQUFPLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ25DLHVEQUF1RDtRQUN2RCx3REFBd0Q7UUFDeEQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRTtZQUM3QyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUMsQ0FBQTtJQUNOLENBQUMsQ0FBQyxDQUFDO0FBRUgsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLyByZXF1aXJlczogalF1ZXJ5LCBqUXVlcnktVUlcbi8vXG4vLyBYWFggb2J0YWluZWQgZnJvbSBodHRwOi8vanNmaWRkbGUubmV0L2FsZm9ybm8vZzRzdEwvXG4vLyBzZWUgY29weXJpZ2h0IG5vdGljZSBiZWxvd1xuLy9cblxuXG5tb2R1bGUgRUREQXV0byB7XG5cblxuICAgIGV4cG9ydCBpbnRlcmZhY2UgQXV0b2NvbXBsZXRlT3B0aW9ucyB7XG4gICAgICAgIC8vIE1hbmRhdG9yeTogQSBKUXVlcnkgb2JqZWN0IGlkZW50aWZ5aW5nIHRoZSBET00gZWxlbWVudCB0aGF0IGNvbnRhaW5zLCBvciB3aWxsIGNvbnRhaW4sXG4gICAgICAgIC8vIHRoZSBpbnB1dCBlbGVtZW50cyB1c2VkIGJ5IHRoaXMgYXV0b2NvbXBsZXRlIG9iamVjdC5cbiAgICAgICAgY29udGFpbmVyOkpRdWVyeSxcblxuICAgICAgICAvLyBUaGUgSlF1ZXJ5IG9iamVjdCB0aGF0IHVuaXF1ZWx5IGlkZW50aWZpZXMgdGhlIHZpc2libGUgYXV0b2NvbXBsZXRlIHRleHQgaW5wdXQgaW4gdGhlIERPTS5cbiAgICAgICAgLy8gVGhpcyBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgXCJhdXRvY29tcFwiIGNsYXNzIGFkZGVkIGlmIG5vdCBhbHJlYWR5IHByZXNlbnQuXG4gICAgICAgIC8vIE5vdGUgdGhhdCB3aGVuIHNwZWNpZnlpbmcgdGhpcywgdGhlIHZpc2libGVJbnB1dCBtdXN0IGhhdmUgYW4gYWNjb21wYW55aW5nIGhpZGRlbklucHV0XG4gICAgICAgIC8vIHNwZWNpZmllZCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gY2FjaGUgdGhlIHNlbGVjdGVkIHZhbHVlLlxuICAgICAgICAvLyBJZiBuZWl0aGVyIG9mIHRoZXNlIHZhbHVlcyBhcmUgc3VwcGxpZWQsIGJvdGggZWxlbWVudHMgd2lsbCBiZSBjcmVhdGVkIGFuZCBhcHBlbmRlZCB0byB0aGVcbiAgICAgICAgLy8gY29udGFpbmVyIGVsZW1lbnQuXG4gICAgICAgIHZpc2libGVJbnB1dD86SlF1ZXJ5LFxuICAgICAgICBoaWRkZW5JbnB1dD86SlF1ZXJ5LFxuXG4gICAgICAgIC8vIE9wdGlvbmFsIGZvcm0gc3VibWlzc2lvbiBuYW1lcyB0byBhc3NpZ24gdG8gdGhlIHZpc2libGUgYW5kIGhpZGRlbiBlbGVtZW50cy5cbiAgICAgICAgLy8gVG8gdGhlIGJhY2sgZW5kLCB0aGUgaGlkZGVuSW5wdXQgaXMgZ2VuZXJhbGx5IHRoZSBpbXBvcnRhbnQgb25lLCBzbyB0aGUgb3B0aW9uXG4gICAgICAgIC8vIGZvciB0aGF0IGlzIHNpbXBseSBjYWxsZWQgJ25hbWUnLlxuICAgICAgICB2aXNpYmxlSW5wdXROYW1lPzpzdHJpbmcsXG4gICAgICAgIG5hbWU/OnN0cmluZyxcblxuICAgICAgICAvLyBUaGUgc3RyaW5nIHRvIHNob3cgaW5pdGlhbGx5IGluIHRoZSBpbnB1dCBlbGVtZW50LlxuICAgICAgICAvLyBUaGlzIG1heSBvciBtYXkgbm90IGJlIGVxdWl2YWxlbnQgdG8gYSB2YWxpZCBoaWRkZW5JbnB1dCB2YWx1ZS5cbiAgICAgICAgdmlzaWJsZVZhbHVlPzpzdHJpbmcsXG5cbiAgICAgICAgLy8gQSBzdGFydGluZyB2YWx1ZSBmb3IgaGlkZGVuSW5wdXQuICBUaGlzIHZhbHVlIGlzIGEgdW5pcXVlIGlkZW50aWZpZXIgb2Ygc29tZVxuICAgICAgICAvLyBiYWNrLWVuZCBkYXRhIHN0cnVjdHVyZSAtIGxpa2UgYSBkYXRhYmFzZSByZWNvcmQgSWQuXG4gICAgICAgIC8vIElmIHRoaXMgaXMgcHJvdmlkZWQgYnV0IHZpc2libGVWYWx1ZSBpcyBub3QsIHdlIGF0dGVtcHQgdG8gZ2VuZXJhdGUgYW4gaW5pdGlhbCB2aXNpYmxlVmFsdWVcbiAgICAgICAgLy8gYmFzZWQgb24gaXQuXG4gICAgICAgIGhpZGRlblZhbHVlPzpzdHJpbmcsXG5cbiAgICAgICAgLy8gV2hldGhlciB0aGUgZmllbGQgbXVzdCBoYXZlIHNvbWUgdmFsdWUgYmVmb3JlIHN1Ym1pc3Npb24gKGkuZS4gY2Fubm90IGJlIGJsYW5rKS4gRGVmYXVsdCBpcyBmYWxzZS5cbiAgICAgICAgbm9uRW1wdHlSZXF1aXJlZD86Ym9vbGVhbiwgICAgLy8gVE9ETzogSW1wbGVtZW50XG5cbiAgICAgICAgLy8gV2hldGhlciB0aGUgZmllbGQncyBjb250ZW50cyBtdXN0IHJlc29sdmUgdG8gYSB2YWxpZCBJZCBiZWZvcmUgc3VibWlzc2lvbi5cbiAgICAgICAgLy8gRGVmYXVsdCBpcyB1c3VhbGx5IHRydWUgLSBpdCBkZXBlbmRzIG9uIHRoZSBzdWJjbGFzcy5cbiAgICAgICAgLy8gTm90ZSB0aGF0IHdoZW4gbm9uRW1wdHlSZXF1aXJlZCBpcyBmYWxzZSwgYSBibGFuayB2YWx1ZSBpcyBjb25zaWRlcmVkIHZhbGlkIVxuICAgICAgICB2YWxpZElkUmVxdWlyZWQ/OmJvb2xlYW4sICAgIC8vIFRPRE86IEltcGxlbWVudFxuXG4gICAgICAgIC8vIFdoZXRoZXIgYSBibGFuayBmaWVsZCBkZWZhdWx0cyB0byBzaG93IGEgXCIoQ3JlYXRlIE5ldylcIiBwbGFjZWhvbGRlciBhbmQgc3VibWl0cyBhIGhpZGRlbiBJZCBvZiAnbmV3Jy5cbiAgICAgICAgLy8gRGVmYXVsdCBpcyBmYWxzZS4gICAgICAgIFxuICAgICAgICBlbXB0eUNyZWF0ZXNOZXc/OmJvb2xlYW4sICAgIC8vIFRPRE86IEltcGxlbWVudFxuXG4gICAgICAgIC8vIGFuIG9wdGlvbmFsIGRpY3Rpb25hcnkgdG8gdXNlIC8gbWFpbnRhaW4gYXMgYSBjYWNoZSBvZiBxdWVyeSByZXN1bHRzIGZvciB0aGlzXG4gICAgICAgIC8vIGF1dG9jb21wbGV0ZS4gTWFwcyBzZWFyY2ggdGVybSAtPiByZXN1bHRzLlxuICAgICAgICBjYWNoZT86YW55LFxuXG4gICAgICAgIC8vIGFuIG9wdGlvbmFsIGRpY3Rpb25hcnkgb2Ygc3RhdGljIHJlc3VsdHMgdG8gcHJlcGVuZCB0byB0aG9zZSByZXR1cm5lZFxuICAgICAgICAvLyBieSBzZWFyY2ggcXVlcmllc1xuICAgICAgICBwcmVwZW5kUmVzdWx0cz86YW55LFxuXG4gICAgICAgIC8vIHRoZSBVUkkgb2YgdGhlIFJFU1QgcmVzb3VyY2UgdG8gdXNlIGZvciBxdWVyeWluZyBhdXRvY29tcGxldGUgcmVzdWx0c1xuICAgICAgICBzZWFyY2hfdXJpPzpzdHJpbmcsXG5cbiAgICAgICAgLy8gRXh0cmEgcGFyYW1ldGVycyB0byBhcHBlbmQgdG8gZWFjaCBxdWVyeSB0byB0aGUgc2VhcmNoIGVuZ2luZVxuICAgICAgICBzZWFyY2hfZXh0cmE/OmFueVxuICAgIH1cblxuXG4gICAgY2xhc3MgQXV0b0NvbHVtbiB7XG4gICAgICAgIG5hbWU6c3RyaW5nO1xuICAgICAgICB3aWR0aDpzdHJpbmc7XG4gICAgICAgIG1heFdpZHRoOnN0cmluZztcbiAgICAgICAgdmFsdWVGaWVsZDpzdHJpbmc7XG5cbiAgICAgICAgY29uc3RydWN0b3IobmFtZSwgbWluV2lkdGgsIHZhbHVlRmllbGQsIG1heFdpZHRoPykge1xuICAgICAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSBtaW5XaWR0aDtcbiAgICAgICAgICAgIHRoaXMubWF4V2lkdGggPSBtYXhXaWR0aCB8fCBudWxsO1xuICAgICAgICAgICAgdGhpcy52YWx1ZUZpZWxkID0gdmFsdWVGaWVsZDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgQmFzZUF1dG8ge1xuXG4gICAgICAgIGNvbnRhaW5lcjpKUXVlcnk7XG4gICAgICAgIHZpc2libGVJbnB1dDpKUXVlcnk7XG4gICAgICAgIGhpZGRlbklucHV0OkpRdWVyeTtcblxuICAgICAgICBtb2RlbE5hbWU6c3RyaW5nO1xuICAgICAgICB1aWQ6bnVtYmVyO1xuXG4gICAgICAgIG9wdDpBdXRvY29tcGxldGVPcHRpb25zO1xuICAgICAgICBzZWFyY2hfb3B0OkF1dG9jb21wbGV0ZU9wdGlvbnM7XG4gICAgICAgIHByZXBlbmRSZXN1bHRzOmFueTtcbiAgICAgICAgZW1wdHlSZXN1bHQ6YW55O1xuICAgICAgICBjb2x1bW5zOkF1dG9Db2x1bW5bXTtcbiAgICAgICAgZGlzcGxheV9rZXk6YW55O1xuICAgICAgICB2YWx1ZV9rZXk6YW55O1xuICAgICAgICBjYWNoZUlkOmFueTtcbiAgICAgICAgY2FjaGU6YW55O1xuICAgICAgICBzZWFyY2hfdXJpOnN0cmluZztcblxuICAgICAgICBzdGF0aWMgX3VuaXF1ZUluZGV4ID0gMTtcblxuXG4gICAgICAgIHN0YXRpYyBpbml0UHJlZXhpc3RpbmcoKSB7XG4gICAgICAgICAgICAvLyBVc2luZyAnZm9yJyBpbnN0ZWFkIG9mICckLmVhY2goKScgYmVjYXVzZSBUeXBlU2NyaXB0IGxpa2VzIHRvIG1vbmtleSB3aXRoICd0aGlzJy4gXG4gICAgICAgICAgICB2YXIgYXV0Y29tcGxldGVzID0gJCgnaW5wdXQuYXV0b2NvbXAnKS5nZXQoKTtcbiAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IGF1dGNvbXBsZXRlcy5sZW5ndGg7IGkrKyApIHtcbiAgICAgICAgICAgICAgICB2YXIgYSA9IGF1dGNvbXBsZXRlc1tpXTtcbiAgICAgICAgICAgICAgICB2YXIgYXV0b2NvbXBsZXRlVHlwZSA9ICQoYSkuYXR0cignZWRkYXV0b2NvbXBsZXRldHlwZScpO1xuICAgICAgICAgICAgICAgIGlmICghYXV0b2NvbXBsZXRlVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcImVkZGF1dG9jb21wbGV0ZXR5cGUgbXVzdCBiZSBkZWZpbmVkIVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIG9wdDpBdXRvY29tcGxldGVPcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICBjb250YWluZXI6ICQoYSkucGFyZW50KCksXG4gICAgICAgICAgICAgICAgICAgIHZpc2libGVJbnB1dDogJChhKSxcbiAgICAgICAgICAgICAgICAgICAgaGlkZGVuSW5wdXQ6ICQoYSkubmV4dCgnaW5wdXRbdHlwZT1oaWRkZW5dJylcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgd2lsbCBhdXRvbWF0aWNhbGx5IGF0dGFjaCB0aGUgY3JlYXRlZCBvYmplY3QgdG8gYm90aCBpbnB1dCBlbGVtZW50cyxcbiAgICAgICAgICAgICAgICAvLyBpbiB0aGUgalF1ZXJ5IGRhdGEgaW50ZXJmYWNlLCB1bmRlciB0aGUgJ2VkZCcgb2JqZWN0LCBhdHRyaWJ1dGUgJ2F1dG9jb21wbGV0ZW9iaicuXG4gICAgICAgICAgICAgICAgbmV3IEVEREF1dG9bYXV0b2NvbXBsZXRlVHlwZV0ob3B0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gU2V0cyB1cCB0aGUgbXVsdGljb2x1bW4gYXV0b2NvbXBsZXRlIGJlaGF2aW9yIGZvciBhbiBleGlzdGluZyB0ZXh0IGlucHV0LiAgTXVzdCBiZSBjYWxsZWRcbiAgICAgICAgLy8gYWZ0ZXIgdGhlICQod2luZG93KS5sb2FkIGhhbmRsZXIgYWJvdmUuXG4gICAgICAgIC8vIEBwYXJhbSBvcHQgYSBkaWN0aW9uYXJ5IG9mIHNldHRpbmdzIGZvbGxvd2luZyB0aGUgQXV0b2NvbXBsZXRlT3B0aW9ucyBpbnRlcmZhY2UgZm9ybWF0LlxuICAgICAgICAvLyBAcGFyYW0gc2VhcmNoX29wdGlvbnMgYW4gb3B0aW9uYWwgZGljdGlvbmFyeSBvZiBkYXRhIHRvIGJlIHNlbnQgdG8gdGhlIHNlYXJjaCBiYWNrZW5kIGFzIHBhcnRcbiAgICAgICAgLy8gb2YgdGhlIGF1dG9jb21wbGV0ZSBzZWFyY2ggcmVxdWVzdC4gIFRvIGJlIHJlY2VpdmVkIG9uIHRoZSBiYWNrLWVuZCwgYWRkaXRpb25hbCBzZWFyY2hcbiAgICAgICAgLy8gcGFyYW1ldGVycyBzaG91bGQgYmUgY2FwdHVyZWQgdW5kZXIgYW4gaW5jbHVkZWQgXCJzZWFyY2hfZXh0cmFcIiBlbGVtZW50LlxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG5cbiAgICAgICAgICAgIHZhciBpZCA9IEVEREF1dG8uQmFzZUF1dG8uX3VuaXF1ZUluZGV4O1xuICAgICAgICAgICAgRUREQXV0by5CYXNlQXV0by5fdW5pcXVlSW5kZXggKz0gMTtcbiAgICAgICAgICAgIHRoaXMudWlkID0gaWQ7XG4gICAgICAgICAgICB0aGlzLm1vZGVsTmFtZSA9ICdHZW5lcmljJztcblxuICAgICAgICAgICAgdGhpcy5vcHQgPSAkLmV4dGVuZCh7fSwgb3B0KTtcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoX29wdCA9ICQuZXh0ZW5kKHt9LCBzZWFyY2hfb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5vcHQuY29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJhdXRvY29tcGxldGUgb3B0aW9ucyBtdXN0IHNwZWNpZnkgYSBjb250YWluZXJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lciA9IHRoaXMub3B0LmNvbnRhaW5lcjtcblxuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQgPSB0aGlzLm9wdC52aXNpYmxlSW5wdXQgfHxcbiAgICAgICAgICAgICAgICAkKCc8aW5wdXQgdHlwZT1cInRleHRcIi8+JykuYWRkQ2xhc3MoJ2F1dG9jb21wJykuYXBwZW5kVG8odGhpcy5jb250YWluZXIpO1xuICAgICAgICAgICAgdGhpcy5oaWRkZW5JbnB1dCA9IHRoaXMub3B0LmhpZGRlbklucHV0IHx8XG4gICAgICAgICAgICAgICAgJCgnPGlucHV0IHR5cGU9XCJoaWRkZW5cIi8+JykuYXBwZW5kVG8odGhpcy5jb250YWluZXIpO1xuICAgICAgICAgICAgaWYgKFwidmlzaWJsZVZhbHVlXCIgaW4gdGhpcy5vcHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2libGVJbnB1dC52YWwodGhpcy5vcHQudmlzaWJsZVZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcImhpZGRlblZhbHVlXCIgaW4gdGhpcy5vcHQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmhpZGRlbklucHV0LnZhbCh0aGlzLm9wdC5oaWRkZW5WYWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnZpc2libGVJbnB1dC5kYXRhKCdlZGQnLCB7J2F1dG9jb21wbGV0ZW9iaic6IHRoaXN9KTtcbiAgICAgICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuZGF0YSgnZWRkJywgeydhdXRvY29tcGxldGVvYmonOiB0aGlzfSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJlcGVuZFJlc3VsdHMgPSB0aGlzLm9wdC5wcmVwZW5kUmVzdWx0cyB8fCBbXTtcblxuICAgICAgICAgICAgdGhpcy5kaXNwbGF5X2tleSA9ICduYW1lJztcbiAgICAgICAgICAgIHRoaXMudmFsdWVfa2V5ID0gJ2lkJztcbiAgICAgICAgICAgIHRoaXMuc2VhcmNoX3VyaSA9IHRoaXMub3B0LnNlYXJjaF91cmkgfHwgXCIvc2VhcmNoXCI7XG5cbiAgICAgICAgICAgIC8vIFN0YXRpYyBzcGVjaWZpY2F0aW9uIG9mIGNvbHVtbiBsYXlvdXQgZm9yIGVhY2ggbW9kZWwgaW4gRUREIHRoYXQgd2Ugd2FudCB0b1xuICAgICAgICAgICAgLy8gbWFrZSBzZWFyY2hhYmxlLiAgKFRoaXMgbWlnaHQgYmUgYmV0dGVyIGRvbmUgYXMgYSBzdGF0aWMgSlNPTiBmaWxlXG4gICAgICAgICAgICAvLyBzb21ld2hlcmUuKVxuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICczMDBweCcsICduYW1lJykgXTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgaW5pdCgpIHtcbiAgICAgICAgICAgIC8vIHRoaXMuY2FjaGVJZCBtaWdodCBoYXZlIGJlZW4gc2V0IGJ5IGEgY29uc3RydWN0b3IgaW4gYSBzdWJjbGFzc1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gdGhpcy5vcHRbJ2NhY2hlSWQnXVxuICAgICAgICAgICAgICAgIHx8IHRoaXMuY2FjaGVJZCBcbiAgICAgICAgICAgICAgICB8fCAnY2FjaGVfJyArICgrK0VERF9hdXRvLmNhY2hlX2NvdW50ZXIpO1xuICAgICAgICAgICAgdGhpcy5jYWNoZSA9IHRoaXMub3B0WydjYWNoZSddXG4gICAgICAgICAgICAgICAgfHwgKEVERERhdGFbdGhpcy5jYWNoZUlkXSA9IEVERERhdGFbdGhpcy5jYWNoZUlkXSB8fCB7fSk7XG5cbiAgICAgICAgICAgIHRoaXMuZW1wdHlSZXN1bHQgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZW1wdHlSZXN1bHRbdGhpcy5jb2x1bW5zWzBdLnZhbHVlRmllbGRdID0gdGhpcy5lbXB0eVJlc3VsdFswXSA9ICdObyBSZXN1bHRzIEZvdW5kJztcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucy5zbGljZSgxKS5mb3JFYWNoKChjb2x1bW46QXV0b0NvbHVtbiwgaW5kZXg6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmVtcHR5UmVzdWx0W2NvbHVtbi52YWx1ZUZpZWxkXSA9IHRoaXMuZW1wdHlSZXN1bHRbaW5kZXhdID0gJyc7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVE9ETyBhZGQgZmxhZyhzKSB0byBoYW5kbGUgbXVsdGlwbGUgaW5wdXRzXG4gICAgICAgICAgICAvLyBUT0RPIHBvc3NpYmx5IGFsc28gdXNlIHNvbWV0aGluZyBsaWtlIGh0dHBzOi8vZ2l0aHViLmNvbS94b3hjby9qUXVlcnktVGFncy1JbnB1dFxuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQuYWRkQ2xhc3MoJ2F1dG9jb21wJyk7XG4gICAgICAgICAgICBpZiAodGhpcy5vcHRbJ2VtcHR5Q3JlYXRlc05ldyddKSB7XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQuYXR0cigncGxhY2Vob2xkZXInLCAnKENyZWF0ZSBOZXcpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5vcHRbJ3Zpc2libGVJbnB1dE5hbWUnXSkge1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaWJsZUlucHV0LmF0dHIoJ25hbWUnLCB0aGlzLm9wdFsndmlzaWJsZUlucHV0TmFtZSddKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdFsnbmFtZSddKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5hdHRyKCduYW1lJywgdGhpcy5vcHRbJ25hbWUnXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBfX3RoaXMgPSB0aGlzO1xuICAgICAgICAgICAgLy8gbWNhdXRvY29tcGxldGUgaXMgbm90IGluIHR5cGUgZGVmaW5pdGlvbnMgZm9yIGpRdWVyeSwgaGVuY2UgPGFueT5cbiAgICAgICAgICAgICg8YW55PnRoaXMudmlzaWJsZUlucHV0KS5tY2F1dG9jb21wbGV0ZSh7XG4gICAgICAgICAgICAgICAgLy8gVGhlc2UgbmV4dCB0d28gb3B0aW9ucyBhcmUgd2hhdCB0aGlzIHBsdWdpbiBhZGRzIHRvIHRoZSBhdXRvY29tcGxldGUgd2lkZ2V0LlxuICAgICAgICAgICAgICAgIC8vIEZJWE1FIHRoZXNlIHdpbGwgbmVlZCB0byB2YXJ5IGRlcGVuZGluZyBvbiByZWNvcmQgdHlwZVxuICAgICAgICAgICAgICAgICdzaG93SGVhZGVyJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnY29sdW1ucyc6IHRoaXMuY29sdW1ucyxcbiAgICAgICAgICAgICAgICAvLyBFdmVudCBoYW5kbGVyIGZvciB3aGVuIGEgbGlzdCBpdGVtIGlzIHNlbGVjdGVkLlxuICAgICAgICAgICAgICAgICdzZWxlY3QnOiBmdW5jdGlvbiAoZXZlbnQsIHVpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjYWNoZUtleSwgcmVjb3JkLCB2aXNpYmxlVmFsdWUsIGhpZGRlblZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAodWkuaXRlbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVLZXkgPSB1aS5pdGVtW19fdGhpcy52YWx1ZV9rZXldO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVjb3JkID0gX190aGlzLmNhY2hlW2NhY2hlS2V5XSA9IF9fdGhpcy5jYWNoZVtjYWNoZUtleV0gfHwge307XG4gICAgICAgICAgICAgICAgICAgICAgICAkLmV4dGVuZChyZWNvcmQsIHVpLml0ZW0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmlzaWJsZVZhbHVlID0gcmVjb3JkW19fdGhpcy5kaXNwbGF5X2tleV0gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBoaWRkZW5WYWx1ZSA9IHJlY29yZFtfX3RoaXMudmFsdWVfa2V5XSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFzc2lnbiB2YWx1ZSBvZiBzZWxlY3RlZCBpdGVtIElEIHRvIHNpYmxpbmcgaGlkZGVuIGlucHV0XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdGhpcy52aXNpYmxlSW5wdXQudmFsKHZpc2libGVWYWx1ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdGhpcy5oaWRkZW5JbnB1dC52YWwoaGlkZGVuVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRyaWdnZXIoJ2NoYW5nZScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRyaWdnZXIoJ2lucHV0Jyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgLy8gVGhlIHJlc3Qgb2YgdGhlIG9wdGlvbnMgYXJlIGZvciBjb25maWd1cmluZyB0aGUgYWpheCB3ZWJzZXJ2aWNlIGNhbGwuXG4gICAgICAgICAgICAgICAgJ21pbkxlbmd0aCc6IDAsXG4gICAgICAgICAgICAgICAgJ3NvdXJjZSc6IGZ1bmN0aW9uIChyZXF1ZXN0LCByZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0LCBtb2RlbENhY2hlLCB0ZXJtQ2FjaGVkUmVzdWx0cztcbiAgICAgICAgICAgICAgICAgICAgbW9kZWxDYWNoZSA9IEVERF9hdXRvLnJlcXVlc3RfY2FjaGVbX190aGlzLm1vZGVsTmFtZV0gPSBFRERfYXV0by5yZXF1ZXN0X2NhY2hlW19fdGhpcy5tb2RlbE5hbWVdIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICB0ZXJtQ2FjaGVkUmVzdWx0cyA9IG1vZGVsQ2FjaGVbcmVxdWVzdC50ZXJtXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRlcm1DYWNoZWRSZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBwcmVwZW5kIGFueSBvcHRpb25hbCBkZWZhdWx0IHJlc3VsdHNcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkaXNwbGF5UmVzdWx0cyA9IF9fdGhpcy5wcmVwZW5kUmVzdWx0cy5jb25jYXQodGVybUNhY2hlZFJlc3VsdHMpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZShkaXNwbGF5UmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgICAgICAgICAgICAgICd1cmwnOiBfX3RoaXMuc2VhcmNoX3VyaSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdkYXRhVHlwZSc6ICdqc29uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdkYXRhJzogJC5leHRlbmQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdtb2RlbCc6IF9fdGhpcy5tb2RlbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3Rlcm0nOiByZXF1ZXN0LnRlcm1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIF9fdGhpcy5vcHRbJ3NlYXJjaF9leHRyYSddKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBzdWNjZXNzIGV2ZW50IGhhbmRsZXIgd2lsbCBkaXNwbGF5IFwiTm8gbWF0Y2ggZm91bmRcIiBpZiBubyBpdGVtcyBhcmUgcmV0dXJuZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAnc3VjY2Vzcyc6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRhdGEgfHwgIWRhdGEucm93cyB8fCBkYXRhLnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IFsgX190aGlzLmVtcHR5UmVzdWx0IF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gZGF0YS5yb3dzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSByZXR1cm5lZCByZXN1bHRzIGluIGNhY2hlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5mb3JFYWNoKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgY2FjaGVLZXkgPSBpdGVtW19fdGhpcy52YWx1ZV9rZXldLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlX3JlY29yZCA9IF9fdGhpcy5jYWNoZVtjYWNoZUtleV0gPSBfX3RoaXMuY2FjaGVbY2FjaGVLZXldIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJC5leHRlbmQoY2FjaGVfcmVjb3JkLCBpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsQ2FjaGVbcmVxdWVzdC50ZXJtXSA9IHJlc3VsdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHByZXBlbmQgYW55IG9wdGlvbmFsIGRlZmF1bHQgcmVzdWx0c1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkaXNwbGF5UmVzdWx0cyA9IF9fdGhpcy5wcmVwZW5kUmVzdWx0cy5jb25jYXQocmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZShkaXNwbGF5UmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJzogZnVuY3Rpb24gKGpxWEhSLCBzdGF0dXMsIGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlKFsgJ1NlcnZlciBFcnJvcicgXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ3NlYXJjaCc6IGZ1bmN0aW9uIChldiwgdWkpIHtcbiAgICAgICAgICAgICAgICAgICAgJChldi50YXJnZXQpLmFkZENsYXNzKCd3YWl0Jyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAncmVzcG9uc2UnOiBmdW5jdGlvbiAoZXYsIHVpKSB7XG4gICAgICAgICAgICAgICAgICAgICQoZXYudGFyZ2V0KS5yZW1vdmVDbGFzcygnd2FpdCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLm9uKCdibHVyJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICAgICAgdmFyIGF1dG8gPSBfX3RoaXMudmlzaWJsZUlucHV0O1xuICAgICAgICAgICAgICAgIHZhciBoaWRkZW5JbnB1dCA9IF9fdGhpcy5oaWRkZW5JbnB1dDtcbiAgICAgICAgICAgICAgICB2YXIgaGlkZGVuSWQgPSBoaWRkZW5JbnB1dC52YWwoKTtcbiAgICAgICAgICAgICAgICB2YXIgb2xkID0gX190aGlzLmNhY2hlW2hpZGRlbklkXSB8fCB7fTtcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudCA9IGF1dG8udmFsKCk7XG4gICAgICAgICAgICAgICAgdmFyIGJsYW5rID0gX190aGlzLm9wdFsnZW1wdHlDcmVhdGVzTmV3J10gPyAnbmV3JyA6ICcnO1xuXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQudHJpbSgpID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBVc2VyIGNsZWFyZWQgdmFsdWUgaW4gYXV0b2NvbXBsZXRlLCByZW1vdmUgdmFsdWUgZnJvbSBoaWRkZW4gSURcbiAgICAgICAgICAgICAgICAgICAgaGlkZGVuSW5wdXQudmFsKGJsYW5rKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRyaWdnZXIoJ2NoYW5nZScpXG4gICAgICAgICAgICAgICAgICAgICAgICAudHJpZ2dlcignaW5wdXQnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBVc2VyIG1vZGlmaWVkIHZhbHVlIGluIGF1dG9jb21wbGV0ZSB3aXRob3V0IHNlbGVjdGluZyBuZXcgb25lLCByZXN0b3JlIHByZXZpb3VzXG4gICAgICAgICAgICAgICAgICAgIGF1dG8udmFsKG9sZFtfX3RoaXMuZGlzcGxheV9rZXldIHx8IGJsYW5rKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIHZhbCgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhpZGRlbklucHV0LnZhbCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIC5hdXRvY29tcF91c2VyXG4gICAgZXhwb3J0IGNsYXNzIFVzZXIgZXh0ZW5kcyBCYXNlQXV0byB7XG5cbiAgICAgICAgc3RhdGljIGNvbHVtbnMgPSBbXG4gICAgICAgICAgICBuZXcgQXV0b0NvbHVtbignVXNlcicsICcxNTBweCcsICdmdWxsbmFtZScpLFxuICAgICAgICAgICAgbmV3IEF1dG9Db2x1bW4oJ0luaXRpYWxzJywgJzYwcHgnLCAnaW5pdGlhbHMnKSxcbiAgICAgICAgICAgIG5ldyBBdXRvQ29sdW1uKCdFLW1haWwnLCAnMTUwcHgnLCAnZW1haWwnKVxuICAgICAgICBdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdDpBdXRvY29tcGxldGVPcHRpb25zLCBzZWFyY2hfb3B0aW9ucz8pIHtcbiAgICAgICAgICAgIHN1cGVyKG9wdCwgc2VhcmNoX29wdGlvbnMpO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE5hbWUgPSAnVXNlcic7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLlVzZXIuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheV9rZXkgPSAnZnVsbG5hbWUnO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ1VzZXJzJztcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBHcm91cCBleHRlbmRzIEJhc2VBdXRvIHtcblxuICAgICAgICBzdGF0aWMgY29sdW1ucyA9IFtcbiAgICAgICAgICAgIG5ldyBBdXRvQ29sdW1uKCdHcm91cCcsICcyMDBweCcsICduYW1lJylcbiAgICAgICAgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ0dyb3VwJztcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IEVEREF1dG8uR3JvdXAuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheV9rZXkgPSAnbmFtZSc7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnR3JvdXBzJztcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIC5hdXRvY29tcF9yZWdcbiAgICBleHBvcnQgY2xhc3MgU3RyYWluIGV4dGVuZHMgQmFzZUF1dG8ge1xuXG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gW1xuICAgICAgICAgICAgbmV3IEF1dG9Db2x1bW4oJ1BhcnQgSUQnLCAnMTAwcHgnLCAncGFydElkJyksXG4gICAgICAgICAgICBuZXcgQXV0b0NvbHVtbignTmFtZScsICcxNTBweCcsICduYW1lJyksXG4gICAgICAgICAgICBuZXcgQXV0b0NvbHVtbignRGVzY3JpcHRpb24nLCAnMjUwcHgnLCAnc2hvcnREZXNjcmlwdGlvbicpXG4gICAgICAgIF07XG5cbiAgICAgICAgY29uc3RydWN0b3Iob3B0OkF1dG9jb21wbGV0ZU9wdGlvbnMsIHNlYXJjaF9vcHRpb25zPykge1xuICAgICAgICAgICAgc3VwZXIob3B0LCBzZWFyY2hfb3B0aW9ucyk7XG4gICAgICAgICAgICB0aGlzLm1vZGVsTmFtZSA9ICdTdHJhaW4nO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5TdHJhaW4uY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMudmFsdWVfa2V5ID0gJ3JlY29yZElkJztcbiAgICAgICAgICAgIHRoaXMuY2FjaGVJZCA9ICdTdHJhaW5zJztcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIC5hdXRvY29tcF9jYXJib25cbiAgICBleHBvcnQgY2xhc3MgQ2FyYm9uU291cmNlIGV4dGVuZHMgQmFzZUF1dG8ge1xuXG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gW1xuICAgICAgICAgICAgbmV3IEF1dG9Db2x1bW4oJ05hbWUnLCAnMTUwcHgnLCAnbmFtZScpLFxuICAgICAgICAgICAgbmV3IEF1dG9Db2x1bW4oJ1ZvbHVtZScsICc2MHB4JywgJ3ZvbHVtZScpLFxuICAgICAgICAgICAgbmV3IEF1dG9Db2x1bW4oJ0xhYmVsaW5nJywgJzEwMHB4JywgJ2xhYmVsaW5nJyksXG4gICAgICAgICAgICBuZXcgQXV0b0NvbHVtbignRGVzY3JpcHRpb24nLCAnMjUwcHgnLCAnZGVzY3JpcHRpb24nLCAnNjAwcHgnKSxcbiAgICAgICAgICAgIG5ldyBBdXRvQ29sdW1uKCdJbml0aWFscycsICc2MHB4JywgJ2luaXRpYWxzJylcbiAgICAgICAgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ0NhcmJvblNvdXJjZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLkNhcmJvblNvdXJjZS5jb2x1bW5zO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ0NTb3VyY2VzJztcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIC5hdXRvY29tcF90eXBlXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFkYXRhVHlwZSBleHRlbmRzIEJhc2VBdXRvIHtcblxuICAgICAgICBzdGF0aWMgY29sdW1ucyA9IFtcbiAgICAgICAgICAgIG5ldyBBdXRvQ29sdW1uKCdOYW1lJywgJzIwMHB4JywgJ25hbWUnKSxcbiAgICAgICAgICAgIG5ldyBBdXRvQ29sdW1uKCdGb3InLCAnNTBweCcsIGZ1bmN0aW9uIChpdGVtLCBjb2x1bW4sIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbiA9IGl0ZW0uY29udGV4dDtcbiAgICAgICAgICAgICAgICByZXR1cm4gJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ3RhZycpLnRleHQoXG4gICAgICAgICAgICAgICAgICAgIGNvbiA9PT0gJ0wnID8gJ0xpbmUnIDogY29uID09PSAnQScgPyAnQXNzYXknIDogY29uID09PSAnUycgPyAnU3R1ZHknIDogJz8nKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgY29uc3RydWN0b3Iob3B0OkF1dG9jb21wbGV0ZU9wdGlvbnMsIHNlYXJjaF9vcHRpb25zPykge1xuICAgICAgICAgICAgc3VwZXIob3B0LCBzZWFyY2hfb3B0aW9ucyk7XG4gICAgICAgICAgICB0aGlzLm1vZGVsTmFtZSA9ICdNZXRhZGF0YVR5cGUnO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5NZXRhZGF0YVR5cGUuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuY2FjaGVJZCA9ICdNZXRhRGF0YVR5cGVzJztcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIC5hdXRvY29tcF9hdHlwZVxuICAgIGV4cG9ydCBjbGFzcyBBc3NheU1ldGFkYXRhVHlwZSBleHRlbmRzIEJhc2VBdXRvIHtcblxuICAgICAgICBzdGF0aWMgY29sdW1ucyA9IFsgbmV3IEF1dG9Db2x1bW4oJ05hbWUnLCAnMzAwcHgnLCAnbmFtZScpIF07XG5cbiAgICAgICAgY29uc3RydWN0b3Iob3B0OkF1dG9jb21wbGV0ZU9wdGlvbnMsIHNlYXJjaF9vcHRpb25zPykge1xuICAgICAgICAgICAgc3VwZXIob3B0LCBzZWFyY2hfb3B0aW9ucyk7XG4gICAgICAgICAgICB0aGlzLm1vZGVsTmFtZSA9ICdBc3NheU1ldGFkYXRhVHlwZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLkFzc2F5TWV0YWRhdGFUeXBlLmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnTWV0YURhdGFUeXBlcyc7XG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyAuYXV0b2NvbXBfYWx0eXBlXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5TGluZU1ldGFkYXRhVHlwZSBleHRlbmRzIEJhc2VBdXRvIHtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ0Fzc2F5TGluZU1ldGFkYXRhVHlwZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLk1ldGFkYXRhVHlwZS5jb2x1bW5zO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ01ldGFEYXRhVHlwZXMnO1xuICAgICAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgLy8gLmF1dG9jb21wX2x0eXBlXG4gICAgZXhwb3J0IGNsYXNzIExpbmVNZXRhZGF0YVR5cGUgZXh0ZW5kcyBCYXNlQXV0byB7XG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICczMDBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ0xpbmVNZXRhZGF0YVR5cGUnO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5MaW5lTWV0YWRhdGFUeXBlLmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnTWV0YURhdGFUeXBlcyc7XG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyAuYXV0b2NvbXBfc3R5cGVcbiAgICBleHBvcnQgY2xhc3MgU3R1ZHlNZXRhZGF0YVR5cGUgZXh0ZW5kcyBCYXNlQXV0byB7XG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICczMDBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ1N0dWR5TWV0YWRhdGFUeXBlJztcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IEVEREF1dG8uU3R1ZHlNZXRhZGF0YVR5cGUuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuY2FjaGVJZCA9ICdNZXRhRGF0YVR5cGVzJztcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIC8vIC5hdXRvY29tcF9tZXRhYm9sXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGUgZXh0ZW5kcyBCYXNlQXV0byB7XG5cbiAgICAgICAgc3RhdGljIGNvbHVtbnMgPSBbIG5ldyBBdXRvQ29sdW1uKCdOYW1lJywgJzMwMHB4JywgJ25hbWUnKSBdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdDpBdXRvY29tcGxldGVPcHRpb25zLCBzZWFyY2hfb3B0aW9ucz8pIHtcbiAgICAgICAgICAgIHN1cGVyKG9wdCwgc2VhcmNoX29wdGlvbnMpO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE5hbWUgPSAnTWV0YWJvbGl0ZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLk1ldGFib2xpdGUuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuY2FjaGVJZCA9ICdNZXRhYm9saXRlVHlwZXMnO1xuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQuYXR0cignc2l6ZScsIDQ1KTtcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBQcm90ZWluIGV4dGVuZHMgQmFzZUF1dG8ge1xuXG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICczMDBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ1Byb3RlaW4nO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5Qcm90ZWluLmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnUHJvdGVpbnMnO1xuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQuYXR0cignc2l6ZScsIDQ1KTtcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBHZW5lIGV4dGVuZHMgQmFzZUF1dG8ge1xuXG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICczMDBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ0dlbmUnO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5HZW5lLmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnR2VuZXMnO1xuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQuYXR0cignc2l6ZScsIDQ1KTtcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBQaG9zcGhvciBleHRlbmRzIEJhc2VBdXRvIHtcblxuICAgICAgICBzdGF0aWMgY29sdW1ucyA9IFsgbmV3IEF1dG9Db2x1bW4oJ05hbWUnLCAnMzAwcHgnLCAnbmFtZScpIF07XG5cbiAgICAgICAgY29uc3RydWN0b3Iob3B0OkF1dG9jb21wbGV0ZU9wdGlvbnMsIHNlYXJjaF9vcHRpb25zPykge1xuICAgICAgICAgICAgc3VwZXIob3B0LCBzZWFyY2hfb3B0aW9ucyk7XG4gICAgICAgICAgICB0aGlzLm1vZGVsTmFtZSA9ICdQaG9zcGhvcic7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLlBob3NwaG9yLmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnUGhvc3Bob3JzJztcbiAgICAgICAgICAgIHRoaXMudmlzaWJsZUlucHV0LmF0dHIoJ3NpemUnLCA0NSk7XG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgR2VuZXJpY09yTWV0YWJvbGl0ZSBleHRlbmRzIEJhc2VBdXRvIHtcbiAgICAgICAgc3RhdGljIGNvbHVtbnMgPSBbIG5ldyBBdXRvQ29sdW1uKCdOYW1lJywgJzMwMHB4JywgJ25hbWUnKSBdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdDpBdXRvY29tcGxldGVPcHRpb25zLCBzZWFyY2hfb3B0aW9ucz8pIHtcbiAgICAgICAgICAgIHN1cGVyKG9wdCwgc2VhcmNoX29wdGlvbnMpO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE5hbWUgPSAnR2VuZXJpY09yTWV0YWJvbGl0ZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLkdlbmVyaWNPck1ldGFib2xpdGUuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuY2FjaGVJZCA9ICdHZW5lcmljT3JNZXRhYm9saXRlVHlwZXMnOyAgICAvLyBUT0RPOiBJcyB0aGlzIGNvcnJlY3Q/XG4gICAgICAgICAgICB0aGlzLnZpc2libGVJbnB1dC5hdHRyKCdzaXplJywgNDUpXG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyAuYXV0b2NvbXBfbWVhc3VyZVxuICAgIGV4cG9ydCBjbGFzcyBNZWFzdXJlbWVudFR5cGUgZXh0ZW5kcyBCYXNlQXV0byB7XG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICczMDBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ01lYXN1cmVtZW50VHlwZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLk1lYXN1cmVtZW50VHlwZS5jb2x1bW5zO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ01lYXN1cmVtZW50VHlwZXMnO1xuICAgICAgICAgICAgdGhpcy52aXNpYmxlSW5wdXQuYXR0cignc2l6ZScsIDQ1KVxuICAgICAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIE1lYXN1cmVtZW50Q29tcGFydG1lbnQgZXh0ZW5kcyBCYXNlQXV0byB7XG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICcyMDBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ01lYXN1cmVtZW50Q29tcGFydG1lbnQnO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5NZWFzdXJlbWVudENvbXBhcnRtZW50LmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnTWVhc3VyZW1lbnRUeXBlQ29tcGFydG1lbnRzJztcbiAgICAgICAgICAgIHRoaXMudmlzaWJsZUlucHV0LmF0dHIoJ3NpemUnLCAyMClcbiAgICAgICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxuICAgIGV4cG9ydCBjbGFzcyBNZWFzdXJlbWVudFVuaXQgZXh0ZW5kcyBCYXNlQXV0byB7XG4gICAgICAgIHN0YXRpYyBjb2x1bW5zID0gWyBuZXcgQXV0b0NvbHVtbignTmFtZScsICcxNTBweCcsICduYW1lJykgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ01lYXN1cmVtZW50VW5pdCc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLk1lYXN1cmVtZW50VW5pdC5jb2x1bW5zO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ1VuaXRUeXBlcyc7XG4gICAgICAgICAgICB0aGlzLnZpc2libGVJbnB1dC5hdHRyKCdzaXplJywgMTApXG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICAvLyAuYXV0b2NvbXBfc2JtbF9yXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVFeGNoYW5nZSBleHRlbmRzIEJhc2VBdXRvIHtcblxuICAgICAgICBzdGF0aWMgY29sdW1ucyA9IFtcbiAgICAgICAgICAgIG5ldyBBdXRvQ29sdW1uKCdFeGNoYW5nZScsICcyMDBweCcsICdleGNoYW5nZScpLFxuICAgICAgICAgICAgbmV3IEF1dG9Db2x1bW4oJ1JlYWN0YW50JywgJzIwMHB4JywgJ3JlYWN0YW50JylcbiAgICAgICAgXTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihvcHQ6QXV0b2NvbXBsZXRlT3B0aW9ucywgc2VhcmNoX29wdGlvbnM/KSB7XG4gICAgICAgICAgICBzdXBlcihvcHQsIHNlYXJjaF9vcHRpb25zKTtcbiAgICAgICAgICAgIHRoaXMubW9kZWxOYW1lID0gJ01ldGFib2xpdGVFeGNoYW5nZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLk1ldGFib2xpdGVFeGNoYW5nZS5jb2x1bW5zO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ0V4Y2hhbmdlJztcbiAgICAgICAgICAgIHRoaXMub3B0WydzZWFyY2hfZXh0cmEnXSA9IHsgJ3RlbXBsYXRlJzogJCh0aGlzLnZpc2libGVJbnB1dCkuZGF0YSgndGVtcGxhdGUnKSB9O1xuICAgICAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgLy8gLmF1dG9jb21wX3NibWxfc1xuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlU3BlY2llcyBleHRlbmRzIEJhc2VBdXRvIHtcbiAgICAgICAgc3RhdGljIGNvbHVtbnMgPSBbIG5ldyBBdXRvQ29sdW1uKCdOYW1lJywgJzMwMHB4JywgJ25hbWUnKSBdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdDpBdXRvY29tcGxldGVPcHRpb25zLCBzZWFyY2hfb3B0aW9ucz8pIHtcbiAgICAgICAgICAgIHN1cGVyKG9wdCwgc2VhcmNoX29wdGlvbnMpO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE5hbWUgPSAnTWV0YWJvbGl0ZVNwZWNpZXMnO1xuICAgICAgICAgICAgdGhpcy5jb2x1bW5zID0gRUREQXV0by5NZXRhYm9saXRlU3BlY2llcy5jb2x1bW5zO1xuICAgICAgICAgICAgdGhpcy5jYWNoZUlkID0gJ1NwZWNpZXMnO1xuICAgICAgICAgICAgdGhpcy5vcHRbJ3NlYXJjaF9leHRyYSddID0geyAndGVtcGxhdGUnOiAkKHRoaXMudmlzaWJsZUlucHV0KS5kYXRhKCd0ZW1wbGF0ZScpIH07XG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBleHBvcnQgY2xhc3MgU3R1ZHlXcml0YWJsZSBleHRlbmRzIEJhc2VBdXRvIHtcbiAgICAgICAgc3RhdGljIGNvbHVtbnMgPSBbIG5ldyBBdXRvQ29sdW1uKCdOYW1lJywgJzMwMHB4JywgJ25hbWUnKSBdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdDpBdXRvY29tcGxldGVPcHRpb25zLCBzZWFyY2hfb3B0aW9ucz8pIHtcbiAgICAgICAgICAgIHN1cGVyKG9wdCwgc2VhcmNoX29wdGlvbnMpO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE5hbWUgPSAnU3R1ZHlXcml0YWJsZSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLlN0dWR5V3JpdGFibGUuY29sdW1ucztcbiAgICAgICAgICAgIHRoaXMuY2FjaGVJZCA9ICdTdHVkaWVzV3JpdGFibGUnO1xuICAgICAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIFN0dWR5TGluZSBleHRlbmRzIEJhc2VBdXRvIHtcbiAgICAgICAgc3RhdGljIGNvbHVtbnMgPSBbIG5ldyBBdXRvQ29sdW1uKCdOYW1lJywgJzMwMHB4JywgJ25hbWUnKSBdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdDpBdXRvY29tcGxldGVPcHRpb25zLCBzZWFyY2hfb3B0aW9ucz8pIHtcbiAgICAgICAgICAgIHN1cGVyKG9wdCwgc2VhcmNoX29wdGlvbnMpO1xuICAgICAgICAgICAgdGhpcy5tb2RlbE5hbWUgPSAnU3R1ZHlMaW5lJztcbiAgICAgICAgICAgIHRoaXMuY29sdW1ucyA9IEVEREF1dG8uU3R1ZHlMaW5lLmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnTGluZXMnO1xuICAgICAgICAgICAgdGhpcy5vcHRbJ3NlYXJjaF9leHRyYSddID0geyAnc3R1ZHknOiAgRURERGF0YS5jdXJyZW50U3R1ZHlJRCB9O1xuICAgICAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG4gICAgZXhwb3J0IGNsYXNzIFJlZ2lzdHJ5IGV4dGVuZHMgQmFzZUF1dG8ge1xuICAgICAgICBzdGF0aWMgY29sdW1ucyA9IFsgbmV3IEF1dG9Db2x1bW4oJ05hbWUnLCAnMzAwcHgnLCAnbmFtZScpIF07XG5cbiAgICAgICAgY29uc3RydWN0b3Iob3B0OkF1dG9jb21wbGV0ZU9wdGlvbnMsIHNlYXJjaF9vcHRpb25zPykge1xuICAgICAgICAgICAgc3VwZXIob3B0LCBzZWFyY2hfb3B0aW9ucyk7XG4gICAgICAgICAgICB0aGlzLm1vZGVsTmFtZSA9ICdSZWdpc3RyeSc7XG4gICAgICAgICAgICB0aGlzLmNvbHVtbnMgPSBFRERBdXRvLlJlZ2lzdHJ5LmNvbHVtbnM7XG4gICAgICAgICAgICB0aGlzLmNhY2hlSWQgPSAnUmVnaXN0cmllcyc7XG4gICAgICAgICAgICB0aGlzLmluaXQoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG52YXIgRUREX2F1dG8gPSBFRERfYXV0byB8fCB7fSwgRURERGF0YTpFREREYXRhID0gRURERGF0YSB8fCA8RURERGF0YT57fTtcbihmdW5jdGlvbiAoJCkgeyAvLyBpbW1lZGlhdGVseSBpbnZva2VkIGZ1bmN0aW9uIHRvIGJpbmQgalF1ZXJ5IHRvICRcblxuICAgIHZhciBtZXRhX2NvbHVtbnM7XG5cbiAgICBFRERfYXV0by5jYWNoZV9jb3VudGVyID0gRUREX2F1dG8uY2FjaGVfY291bnRlciB8fCAwO1xuXG4gICAgRUREX2F1dG8ucmVxdWVzdF9jYWNoZSA9IHt9O1xuXG5cbi8qXG4gKiBqUXVlcnkgVUkgTXVsdGljb2x1bW4gQXV0b2NvbXBsZXRlIFdpZGdldCBQbHVnaW4gMi4yXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTItMjAxNCBNYXJrIEhhcm1vblxuICpcbiAqIERlcGVuZHM6XG4gKiAgIC0galF1ZXJ5IFVJIEF1dG9jb21wbGV0ZSB3aWRnZXRcbiAqXG4gKiBEdWFsIGxpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgYW5kIEdQTCBsaWNlbnNlczpcbiAqICAgaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHBcbiAqICAgaHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzL2dwbC5odG1sXG4gKlxuICogSGVhdmlseSBtb2RpZmllZCBieSBKQkVJIHRvIG5vdCB1c2UgXCJmbG9hdDpsZWZ0XCIsIGFzIGl0IGhhcyBiZWVuIERlZW1lZCBIYXJtZnVsLlxuKi9cbiQud2lkZ2V0KCdjdXN0b20ubWNhdXRvY29tcGxldGUnLCAkLnVpLmF1dG9jb21wbGV0ZSwge1xuICAgIF9jcmVhdGU6IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fc3VwZXIoKTtcbiAgICAgIHRoaXMud2lkZ2V0KCkubWVudSggXCJvcHRpb25cIiwgXCJpdGVtc1wiLCBcIj4gOm5vdCgudWktd2lkZ2V0LWhlYWRlcilcIiApO1xuICAgIH0sXG4gICAgX3ZhbE9yTmJzcDogZnVuY3Rpb24oalEsIHZhbHVlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBqUS5hcHBlbmQodmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlICYmIHZhbHVlLnRyaW0oKSkge1xuICAgICAgICAgICAgalEudGV4dCh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBqUS5odG1sKCcmbmJzcDsnKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgX2FwcGVuZENlbGw6IGZ1bmN0aW9uKHJvdywgY29sdW1uLCBsYWJlbCkge1xuICAgICAgICB2YXIgY2VsbCA9ICQoJzxkaXY+PC9kaXY+Jyk7XG4gICAgICAgIGlmIChjb2x1bW4ud2lkdGgpIHsgY2VsbC5jc3MoJ21pbldpZHRoJywgY29sdW1uLndpZHRoKTsgfVxuICAgICAgICBpZiAoY29sdW1uLm1heFdpZHRoKSB7IGNlbGwuY3NzKCdtYXhXaWR0aCcsIGNvbHVtbi5tYXhXaWR0aCk7IH1cbiAgICAgICAgdGhpcy5fdmFsT3JOYnNwKGNlbGwsIGxhYmVsKTtcbiAgICAgICAgcm93LmFwcGVuZChjZWxsKTtcbiAgICAgICAgcmV0dXJuIGNlbGw7XG4gICAgfSxcbiAgICBfcmVuZGVyTWVudTogZnVuY3Rpb24odWwsIGl0ZW1zKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcywgdGhlYWQ7XG4gICAgXG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuc2hvd0hlYWRlcikge1xuICAgICAgICAgICAgdmFyIHRhYmxlPSQoJzxsaSBjbGFzcz1cInVpLXdpZGdldC1oZWFkZXJcIj48L2Rpdj4nKTtcbiAgICAgICAgICAgIC8vIENvbHVtbiBoZWFkZXJzXG4gICAgICAgICAgICAkLmVhY2godGhpcy5vcHRpb25zLmNvbHVtbnMsIGZ1bmN0aW9uKGluZGV4LCBjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9hcHBlbmRDZWxsKHRhYmxlLCBjb2x1bW4sIGNvbHVtbi5uYW1lKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdWwuYXBwZW5kKHRhYmxlKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBMaXN0IGl0ZW1zXG4gICAgICAgICQuZWFjaChpdGVtcywgZnVuY3Rpb24oaW5kZXgsIGl0ZW0pIHtcbiAgICAgICAgICAgIHNlbGYuX3JlbmRlckl0ZW0odWwsIGl0ZW0pO1xuICAgICAgICB9KTtcbiAgICAgICAgJCggdWwgKS5hZGRDbGFzcyggXCJlZGQtYXV0b2NvbXBsZXRlLWxpc3RcIiApLmZpbmQoIFwibGk6b2RkXCIgKS5hZGRDbGFzcyggXCJvZGRcIiApO1xuICAgIH0sXG4gICAgX3JlbmRlckl0ZW06IGZ1bmN0aW9uKHVsLCBpdGVtKSB7XG4gICAgICAgIHZhciB0ID0gJycsIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzdWx0ID0gJCgnPGxpPicpLmRhdGEoJ3VpLWF1dG9jb21wbGV0ZS1pdGVtJywgaXRlbSlcblxuICAgICAgICAkLmVhY2godGhpcy5vcHRpb25zLmNvbHVtbnMsIGZ1bmN0aW9uKGluZGV4LCBjb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZTtcbiAgICAgICAgICAgIGlmIChjb2x1bW4udmFsdWVGaWVsZCkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29sdW1uLnZhbHVlRmllbGQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBjb2x1bW4udmFsdWVGaWVsZC5jYWxsKHt9LCBpdGVtLCBjb2x1bW4sIGluZGV4KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IGl0ZW1bY29sdW1uLnZhbHVlRmllbGRdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBpdGVtW2luZGV4XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZVswXSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGYuX2FwcGVuZENlbGwocmVzdWx0LCBjb2x1bW4sIHZhbHVlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmVzdWx0LmFwcGVuZFRvKHVsKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG59KTtcblxuXG5FRERfYXV0by5jcmVhdGVfYXV0b2NvbXBsZXRlID0gZnVuY3Rpb24gY3JlYXRlX2F1dG9jb21wbGV0ZShjb250YWluZXIpIHtcbiAgICB2YXIgdmlzaWJsZUlucHV0LCBoaWRkZW5JbnB1dDtcbiAgICB2aXNpYmxlSW5wdXQgPSAkKCc8aW5wdXQgdHlwZT1cInRleHRcIi8+JykuYWRkQ2xhc3MoJ2F1dG9jb21wJykuYXBwZW5kVG8oY29udGFpbmVyKTtcbiAgICBoaWRkZW5JbnB1dCA9ICQoJzxpbnB1dCB0eXBlPVwiaGlkZGVuXCIvPicpLmFwcGVuZFRvKGNvbnRhaW5lcik7XG4gICAgcmV0dXJuIHZpc2libGVJbnB1dDtcbn07XG5cblxuRUREX2F1dG8uaW5pdGlhbF9zZWFyY2ggPSBmdW5jdGlvbiBpbml0aWFsX3NlYXJjaChzZWxlY3RvciwgdGVybSkge1xuICAgIHZhciBhdXRvSW5wdXQgPSAkKHNlbGVjdG9yKTtcbiAgICB2YXIgYXV0b09iaiA9IGF1dG9JbnB1dC5kYXRhKCdlZGQnKS5hdXRvY29tcGxldGVvYmo7XG4gICAgdmFyIG9sZFJlc3BvbnNlO1xuICAgIG9sZFJlc3BvbnNlID0gYXV0b0lucHV0Lm1jYXV0b2NvbXBsZXRlKCdvcHRpb24nLCAncmVzcG9uc2UnKTtcbiAgICBhdXRvSW5wdXQubWNhdXRvY29tcGxldGUoJ29wdGlvbicsICdyZXNwb25zZScsIGZ1bmN0aW9uIChldiwgdWkpIHtcbiAgICAgICAgdmFyIGhpZ2hlc3QgPSAwLCBiZXN0LCB0ZXJtTG93ZXIgPSB0ZXJtLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGF1dG9JbnB1dC5tY2F1dG9jb21wbGV0ZSgnb3B0aW9uJywgJ3Jlc3BvbnNlJywgb2xkUmVzcG9uc2UpO1xuICAgICAgICBvbGRSZXNwb25zZS5jYWxsKHt9LCBldiwgdWkpO1xuICAgICAgICB1aS5jb250ZW50LmV2ZXJ5KGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gaXRlbVthdXRvT2JqLmRpc3BsYXlfa2V5XSwgdmFsTG93ZXIgPSB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGlmICh2YWwgPT09IHRlcm0pIHtcbiAgICAgICAgICAgICAgICBiZXN0ID0gaXRlbTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7ICAvLyBkbyBub3QgbmVlZCB0byBjb250aW51ZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChoaWdoZXN0IDwgOCAmJiB2YWxMb3dlciA9PT0gdGVybUxvd2VyKSB7XG4gICAgICAgICAgICAgICAgaGlnaGVzdCA9IDg7XG4gICAgICAgICAgICAgICAgYmVzdCA9IGl0ZW07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCA3ICYmIHZhbExvd2VyLmluZGV4T2YodGVybUxvd2VyKSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgaGlnaGVzdCA9IDc7XG4gICAgICAgICAgICAgICAgYmVzdCA9IGl0ZW07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGhpZ2hlc3QgPCA2ICYmIHRlcm1Mb3dlci5pbmRleE9mKHZhbExvd2VyKSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgaGlnaGVzdCA9IDY7XG4gICAgICAgICAgICAgICAgYmVzdCA9IGl0ZW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoYmVzdCkge1xuICAgICAgICAgICAgYXV0b0lucHV0Lm1jYXV0b2NvbXBsZXRlKCdpbnN0YW5jZScpLl90cmlnZ2VyKCdzZWxlY3QnLCAnYXV0b2NvbXBsZXRlc2VsZWN0Jywge1xuICAgICAgICAgICAgICAgICdpdGVtJzogYmVzdFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBhdXRvSW5wdXQubWNhdXRvY29tcGxldGUoJ3NlYXJjaCcsIHRlcm0pO1xuICAgIGF1dG9JbnB1dC5tY2F1dG9jb21wbGV0ZSgnY2xvc2UnKTtcbn07XG5cblxuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiQoIHdpbmRvdyApLm9uKFwibG9hZFwiLCBmdW5jdGlvbigpIHsgLy8gU2hvcnRjdXR0aW5nIHRoaXMgdG8gLmxvYWQgY29uZnVzZXMgalF1ZXJ5XG4gICAgdmFyIHNldHVwX2luZm87XG4gICAgRUREQXV0by5CYXNlQXV0by5pbml0UHJlZXhpc3RpbmcoKTtcbiAgICAvLyB0aGlzIG1ha2VzIHRoZSBhdXRvY29tcGxldGUgd29yayBsaWtlIGEgZHJvcGRvd24gYm94XG4gICAgLy8gZmlyZXMgb2ZmIGEgc2VhcmNoIGFzIHNvb24gYXMgdGhlIGVsZW1lbnQgZ2FpbnMgZm9jdXNcbiAgICAkKGRvY3VtZW50KS5vbignZm9jdXMnLCAnLmF1dG9jb21wJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICQoZXYudGFyZ2V0KS5hZGRDbGFzcygnYXV0b2NvbXBfc2VhcmNoJykubWNhdXRvY29tcGxldGUoJ3NlYXJjaCcpO1xuICAgIH0pXG59KTtcblxufShqUXVlcnkpKTtcbiJdfQ==