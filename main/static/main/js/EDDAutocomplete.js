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
/// <reference path="typescript-declarations.d.ts" />
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
    /**
     * Insert these items to display autocomplete messages which are not selectable values.
     */
    var NonValueItem = (function () {
        function NonValueItem(label) {
            this.label = label;
            this.value = {};
        }
        NonValueItem.NO_RESULT = new NonValueItem('No Results Found');
        NonValueItem.ERROR = new NonValueItem('Server Error');
        return NonValueItem;
    }());
    EDDAuto.NonValueItem = NonValueItem;
    var BaseAuto = (function () {
        /**
         * Sets up the multicolumn autocomplete behavior for an existing text input. Must be
         * called after the $(window).load handler above.
         * @param opt a dictionary of settings following the AutocompleteOptions interface format.
         * @param search_options an optional dictionary of data to be sent to the search backend
         *     as part of the autocomplete search request.  To be received on the back-end,
         *     additional search parameters should be captured under an included "search_extra"
         *     element.
         */
        function BaseAuto(opt, search_options) {
            this.delete_last = false;
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
            this.display_key = 'name';
            this.value_key = 'id';
            this.search_uri = this.opt.search_uri || "/search/";
            // Static specification of column layout for each model in EDD that we want to
            // make searchable.  (This might be better done as a static JSON file
            // somewhere.)
            this.columns = [new AutoColumn('Name', '300px', 'name')];
        }
        BaseAuto.initPreexisting = function (context) {
            $('input.autocomp', context).each(function (i, element) {
                var visibleInput = $(element), autocompleteType = $(element).attr('eddautocompletetype');
                if (!autocompleteType) {
                    throw Error("eddautocompletetype must be defined!");
                }
                var opt = {
                    container: visibleInput.parent(),
                    visibleInput: visibleInput,
                    hiddenInput: visibleInput.next('input[type=hidden]')
                };
                // This will automatically attach the created object to both input elements, in
                // the jQuery data interface, under the 'edd' object, attribute 'autocompleteobj'.
                new EDDAuto[autocompleteType](opt);
            });
        };
        BaseAuto.prototype.clear = function () {
            var blank = this.opt['emptyCreatesNew'] ? 'new' : '';
            this.hiddenInput.val(blank).trigger('change').trigger('input');
        };
        BaseAuto.prototype.init = function () {
            var self = this;
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
                        record = self.loadRecord(ui.item);
                        self.visibleInput.val(self.loadDisplayValue(record));
                        self.hiddenInput.val(self.loadHiddenValue(record))
                            .trigger('change')
                            .trigger('input');
                    }
                    return false;
                },
                'focus': function (event, ui) { event.preventDefault(); },
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
                                result = [NonValueItem.NO_RESULT];
                            }
                            else {
                                result = data.rows;
                                // store returned results in cache
                                result.forEach(function (item) {
                                    var cacheKey = item[self.value_key], cache_record = self.cache[cacheKey] || {};
                                    self.cache[cacheKey] = cache_record;
                                    $.extend(cache_record, item);
                                });
                            }
                            modelCache[request.term] = result;
                            response(result);
                        },
                        'error': function (jqXHR, status, err) {
                            response([NonValueItem.ERROR]);
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
                if (self.delete_last) {
                    // User cleared value in autocomplete, remove value from hidden ID
                    self.clear();
                }
                else {
                    // User modified value in autocomplete without selecting new one
                    // restore previous value
                    self.undo();
                }
                self.delete_last = false;
            }).on('keydown', function (ev) {
                // if the keydown ends up clearing the visible input, set flag
                self.delete_last = self.visibleInput.val().trim() === '';
            });
        };
        ;
        BaseAuto.prototype.loadDisplayValue = function (record) {
            return record[this.display_key] || '';
        };
        BaseAuto.prototype.loadHiddenValue = function (record) {
            return record[this.value_key] || '';
        };
        BaseAuto.prototype.loadRecord = function (item) {
            var cacheKey = item[this.value_key], record = (this.cache[cacheKey] = this.cache[cacheKey] || {});
            $.extend(record, item);
            return record;
        };
        BaseAuto.prototype.undo = function () {
            var old = this.cache[this.hiddenInput.val()] || {};
            this.visibleInput.val(this.loadDisplayValue(old));
        };
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
        User.prototype.loadDisplayValue = function (record) {
            var value = _super.prototype.loadDisplayValue.call(this, record);
            if (value.trim() === '') {
                return record['email'];
            }
            else {
                return value;
            }
        };
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
            this.display_key = 'exchange';
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
            this.value_key = 'recordId';
            this.init();
        }
        Registry.columns = [
            new AutoColumn('Part ID', '100px', 'partId'),
            new AutoColumn('Type', '100px', 'type'),
            new AutoColumn('Name', '150px', 'name'),
            new AutoColumn('Description', '250px', 'shortDescription')
        ];
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
            if (column && column.width) {
                cell.css('minWidth', column.width);
            }
            if (column && column.maxWidth) {
                cell.css('maxWidth', column.maxWidth);
            }
            this._valOrNbsp(cell, label);
            row.append(cell);
            return cell;
        },
        _appendMessage: function (row, label) {
            var cell = $('<div></div>').appendTo(row);
            $('<i>').text(label).appendTo(cell);
            return cell;
        },
        _renderMenu: function (ul, items) {
            var self = this, thead;
            if (self.options.showHeader) {
                var table = $('<li class="ui-widget-header"></div>');
                // Column headers
                $.each(self.options.columns, function (index, column) {
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
            var t = '', self = this, result = $('<li>').data('ui-autocomplete-item', item);
            if (item instanceof EDDAuto.NonValueItem) {
                self._appendMessage(result, item.label);
            }
            else {
                $.each(self.options.columns, function (index, column) {
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
    EDD_auto.initial_search = function initial_search(auto, term) {
        var autoInput, oldResponse;
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
        EDDAuto.BaseAuto.initPreexisting();
        // this makes the autocomplete work like a dropdown box
        // fires off a search as soon as the element gains focus
        $(document).on('focus', '.autocomp', function (ev) {
            $(ev.target).addClass('autocomp_search').mcautocomplete('search');
        });
    });
}(jQuery));
