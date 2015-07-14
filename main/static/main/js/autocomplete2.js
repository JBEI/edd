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

var EDD_auto = EDD_auto || {};
(function ($) { // immediately invoked function to bind jQuery to $

// Static specification of column layout for each model in EDD that we want to
// make searchable.  (This might be better done as a static JSON file
// somewhere.)
EDD_auto.column_layouts = $.extend(EDD_auto.column_layouts || {}, {
    "User" : [
        {
            name: 'User',
            width: '150px',
            valueField: 'name'
        }, {
            name: 'Initials',
            width: '60px',
            valueField: 'initials'
        }, {
            name: 'E-mail',
            width: '120px',
            valueField: 'email'
        }],
    "Strain" : [
        {
            name: 'Part ID',
            width: '100px',
            valueField: 'partId'
        },
        {
            name: 'Name',
            width: '200px',
            valueField: 'name'
        }],
    "CarbonSource" : [
        {
        }
        ]
});
// 

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
EDD_auto.setup_field_autocomplete = function setup_field_autocomplete(
        selector, model_name, display_key, value_key, valid_keys) {
    if (typeof model_name === "undefined") {
        throw Error("model_name must be defined!");
    }
    if (typeof value_key === "undefined") {
        value_key = "name";
    }
    if (typeof valid_keys === "undefined") {
        valid_keys = "all";
    }
    var columns = EDD_auto.column_layouts[model_name];
    if (typeof columns === "undefined") {
        columns = [{
            name: 'Name',
            width: '300px',
            valueField: 'name'
        }];
    }
    // Define a null-result for display
    var empty = {};
    empty[columns[0].valueField] = empty[0] = '<i>No Results Found</i>';
    for (var i = 1; i < columns.length; ++i) {
        empty[columns[i].valueField] = empty[i] = '';
    }
    $(selector).mcautocomplete({
        // These next two options are what this plugin adds to the autocomplete widget.
        // FIXME these will need to vary depending on record type
        showHeader: true,
        columns: columns,
        // Event handler for when a list item is selected.
        select: function (event, ui) {
            this.value = (ui.item ? ui.item[display_key] : '');
            // assign value of selected item ID to sibling hidden input
            $(this).siblings('input[type=hidden]').val(ui.item[value_key]);
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
                        result = [ empty ];
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

$(window).load(function () {
    // add user autocomplete to all '.autocomp.autocomp_user' fields
    $('.autocomp.autocomp_user').each(function () {
        EDD_auto.setup_field_autocomplete(this, 'User', 'username', 'id');
    });
    $('.autocomp.autocomp_reg').each(function () {
        EDD_auto.setup_field_autocomplete(this, 'Strain', 'name', 'recordId')
    });
});

}(jQuery));
