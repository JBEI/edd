import * as jQuery from "jquery";
import "jquery-ui/ui/widgets/autocomplete";
import "jquery-ui/ui/widgets/menu";

export class AutoColumn implements MultiColumnAuto.ColumnDef {
    width: string;

    constructor(
        public name: string,
        minWidth: string,
        public valueField: string | MultiColumnAuto.ValueFieldCallback,
        public maxWidth = null,
    ) {
        this.width = minWidth;
    }
}

/**
 * Insert these items to display autocomplete messages which are not selectable values.
 */
export class NonValueItem {
    static NO_RESULT: NonValueItem = new NonValueItem("No Results Found");
    static ERROR: NonValueItem = new NonValueItem("Server Error");

    // the autocomplete JQuery UI plugin expects items with label and value properties
    // anything without those properties gets converted to a plain object that does
    label: string;
    value: any;

    constructor(label: string) {
        this.label = label;
        this.value = {};
    }
}

(function ($) {
    // immediately invoked function to bind jQuery to $

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
    $.widget("custom.mcautocomplete", $.ui.autocomplete, {
        "_create": function () {
            this._super();
            this.widget().menu("option", "items", "> :not(.ui-widget-header)");
        },
        "_valOrNbsp": function (jQ, value) {
            if (typeof value === "object") {
                jQ.append(value);
            } else if (value && value.trim()) {
                jQ.text(value);
            } else {
                jQ.html("&nbsp;");
            }
        },
        "_appendCell": function (row, column, label) {
            const cell = $("<div></div>");
            if (column && column.width) {
                cell.css("minWidth", column.width);
            }
            if (column && column.maxWidth) {
                cell.css("maxWidth", column.maxWidth);
            }
            this._valOrNbsp(cell, label);
            row.append(cell);
            return cell;
        },
        "_appendMessage": function (row, label) {
            const cell = $("<div></div>").appendTo(row);
            $("<i>").text(label).appendTo(cell);
            return cell;
        },
        "_renderMenu": function (ul, items) {
            if (this.options.showHeader) {
                const table = $('<li class="ui-widget-header"></div>');
                // Column headers
                $.each(this.options.columns, (index, column) => {
                    this._appendCell(table, column, column.name);
                });
                ul.append(table);
            }
            // List items
            $.each(items, (index, item) => {
                this._renderItem(ul, item);
            });
            $(ul).addClass("edd-autocomplete-list").find("li:odd").addClass("odd");
        },
        "_renderItem": function (ul, item) {
            const result = $("<li>").data("ui-autocomplete-item", item);
            if (item instanceof NonValueItem) {
                this._appendMessage(result, item.label);
            } else {
                $.each(this.options.columns, (index, column) => {
                    let value;
                    if (column.valueField) {
                        if (typeof column.valueField === "function") {
                            value = column.valueField.call({}, item, column, index);
                        } else {
                            value = item[column.valueField];
                        }
                    } else {
                        value = item[index];
                    }
                    if (value instanceof Array) {
                        value = value[0] || "";
                    }
                    this._appendCell(result, column, value);
                });
            }
            result.appendTo(ul);
            return result;
        },
    });
})(jQuery);
