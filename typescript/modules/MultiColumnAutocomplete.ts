/// <reference types="jqueryui" />

declare function require(name: string): any;  // avoiding warnings for require calls below

import * as jQuery from "jquery";
// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/autocomplete.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/autocomplete')

declare module EDDAuto {
    class NonValueItem {
        label: string;
        value: Object;
    }
}

(function($) { // immediately invoked function to bind jQuery to $

    var meta_columns;

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
            this.widget().menu("option", "items", "> :not(.ui-widget-header)");
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
                var table = $('<li class="ui-widget-header"></div>');
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
            $(ul).addClass("edd-autocomplete-list").find("li:odd").addClass("odd");
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

}(jQuery));
