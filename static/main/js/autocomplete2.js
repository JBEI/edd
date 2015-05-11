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

// Static specification of column layout for each model in EDD that we want to
// make searchable.  (This might be better done as a static JSON file
// somewhere.)
var column_layouts = {
    "User" : [
        {
            name: 'User',
            width: '150px',
            valueField: 'name'
        }, {
            name: 'Initials',
            width: '120px',
            valueField: 'initials'
        }, {
            name: 'E-mail',
            width: '120px',
            valueField: 'email'
        }]
};

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


// Sets up the multicolumn autocomplete widget.  Must be called after the
// $(window).load handler above.
// XXX there are two different selectors here because we may want to display
// the human-readable model name, but store the primary key in our form.
function setup_field_autocomplete (selector, id_selector, model_name,
        value_key, valid_keys) {
    if (typeof model_name === "undefined") {
        throw Error("model_name must be defined!");
    }
    if (typeof value_key === "undefined") {
        value_key = "name";
    }
    if (typeof valid_keys === "undefined") {
        valid_keys = "all";
    }
    var columns = column_layouts[model_name];
    if (typeof columns === "undefined") {
        columns = [{
            name: 'Name',
            width: '300px',
            valueField: 'name'
        }];
    }
    $(selector).mcautocomplete({
        // These next two options are what this plugin adds to the autocomplete widget.
        // FIXME these will need to vary depending on record type
        showHeader: true,
        columns: columns,
        // Event handler for when a list item is selected.
        select: function (event, ui) {
            this.value = (ui.item ? ui.item[value_key] : '');
            if (id_selector) {
                $(id_selector).val(ui.item.id);
            }
        //    $(result_selector).text(ui.item ? 'Selected: ' + ui.item.name + ', ' + ui.item.initials + ', ' + ui.item.email : 'Nothing selected, input was ' + this.value);
            return false;
        },
    
        // The rest of the options are for configuring the ajax webservice call.
        minLength: 1,
        source: function (request, response) {
            $.ajax({
                // FIXME replace this with SOLR query
                url: '/search',
                dataType: 'json',
                data: {
                    model : model_name,
                    keys : valid_keys,
                    term : request.term
                },
                // The success event handler will display "No match found" if no items are returned.
                success: function (data) {
                    var result;
                    if (!data || !data.rows || data.rows.length === 0) {
                        result = [{
                            label: 'No match found.'
                        }];
                    } else {
                        result = data.rows;
                    }
                    response(result);
                }
            });
        }
    });
};
/***********************************************************************/

// CONVENIENCE METHODS
// there should be one of these for each model that we want to search
function setup_field_autocomplete_users (selector, id_selector) {
    return setup_field_autocomplete(selector,
        id_selector,
        "User", // model_name
        "name", // value_key
        "name,initials,email"); // valid_keys
};
