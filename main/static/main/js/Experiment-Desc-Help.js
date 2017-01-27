/// <reference path="EDDRest.ts" />
// This module contains code for dynamically loading lists of metadata types into the help page
// for Experiment Description files.
var ExperimentDescriptionHelp;
(function (ExperimentDescriptionHelp) {
    var ASSAY_DIV_SELECTOR = '#assayMetadataTypes';
    var LINE_DIV_SELECTOR = '#lineMetadataTypes';
    var PROTOCOL_DIV_SELECTOR = '#protocols';
    // Metadata types present in the database that should be omitted from the lists displayed
    // in the help page... they duplicate baked-in line/assay characteristics displayed in a
    // separate table.
    var omitLineMetadataTypes = ['Line Name', 'Line Description', 'Line Contact',
        'Line Experimenter'];
    var omitAssayMetadataTypes = ['Assay Description', 'Assay Experimenter', 'Assay Name'];
    // As soon as the window load signal is sent, call back to the server for the set of reference
    // records that will be used to disambiguate labels in imported data.
    function onDocumentReady() {
        $('.disclose').find('.discloseLink').on('click', disclose);
        loadAllLineMetadataTypes();
        loadAllAssayMetadataTypes();
        loadAllProtocols();
    }
    ExperimentDescriptionHelp.onDocumentReady = onDocumentReady;
    function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }
    ExperimentDescriptionHelp.disclose = disclose;
    function loadAllLineMetadataTypes() {
        EddRest.loadMetadataTypes({
            'success': lineMetaSuccessHandler,
            'error': lineErrorHandler,
            'request_all': true,
            'wait': function () { showWaitMessage(LINE_DIV_SELECTOR); },
            'context': EddRest.LINE_METADATA_CONTEXT,
            'sort_order': EddRest.ASCENDING_SORT,
        });
    }
    function loadAllAssayMetadataTypes() {
        EddRest.loadMetadataTypes({
            'success': assayMetaSuccessHandler,
            'error': assayErrorHandler,
            'request_all': true,
            'wait': function () { showWaitMessage(ASSAY_DIV_SELECTOR); },
            'context': EddRest.ASSAY_METADATA_CONTEXT,
            'sort_order': EddRest.ASCENDING_SORT,
        });
    }
    function loadAllProtocols() {
        EddRest.loadProtocols({
            'success': protocolSuccessHandler,
            'error': function () { showLoadFailed(PROTOCOL_DIV_SELECTOR); },
            'request_all': true,
            'wait': function () { showWaitMessage(PROTOCOL_DIV_SELECTOR); },
            'sort_order': EddRest.ASCENDING_SORT,
        });
    }
    function showWaitMessage(divSelector) {
        var div;
        div = $(divSelector);
        div.empty();
        $('<span>')
            .text('Loading data from server...please wait.')
            .addClass('wait')
            .appendTo(div);
    }
    function lineMetaSuccessHandler(metadataTypes) {
        showMetadataTypes(LINE_DIV_SELECTOR, metadataTypes, omitLineMetadataTypes);
    }
    function assayMetaSuccessHandler(metadataTypes) {
        showMetadataTypes(ASSAY_DIV_SELECTOR, metadataTypes, omitAssayMetadataTypes);
    }
    function protocolSuccessHandler(protocols) {
        var div, table, head, body, row;
        div = $('#protocols')
            .empty();
        if (protocols.length > 0) {
            table = $('<table>')
                .addClass('figureTable')
                .appendTo(div);
            head = $('<thead>').appendTo(table);
            $('<th>')
                .text('Name')
                .appendTo(head);
            $('<th>')
                .text('Description')
                .appendTo(head);
            $('<th>')
                .text('Default Units')
                .appendTo(head);
            body = $('<tbody>')
                .appendTo(table);
            protocols.forEach(function (protocol) {
                row = $('<tr>').appendTo(body);
                $('<td>')
                    .text(protocol['name'])
                    .appendTo(row);
                $('<td>')
                    .text(protocol['description'])
                    .appendTo(row);
                //TODO: create / use a /rest/measurement_unit or similar REST API resource, use it
                // to improve display for units in this table.  For now, just having a numeric
                // PK placeholder in a buried / advanced feature is an okay-though-non-ideal
                // stand-in / reminder. Can follow up on this in EDD-603.
                $('<td>')
                    .text(protocol['default_units'])
                    .appendTo(row);
            });
        }
        else {
            div.text('No protocols were found.');
        }
    }
    function showMetadataTypes(divSelector, metadataTypes, omitFromDisplay) {
        var div, list;
        div = $(divSelector)
            .empty();
        if (metadataTypes) {
            list = $('<ol>')
                .addClass('metadataList')
                .appendTo(div);
            metadataTypes.forEach(function (metadataType) {
                var typeName, omit;
                typeName = metadataType['type_name'];
                // omit items included in the 'primary characteristics' table
                omit = omitFromDisplay.indexOf(typeName) >= 0;
                if (omit) {
                    return true;
                }
                $('<li>')
                    .text(metadataType['type_name'])
                    .appendTo(list);
                return true; // keep looping
            });
        }
        else {
            div.val('No metadata types were found.');
        }
    }
    function lineErrorHandler(jqXHR, textStatus, errorThrown) {
        showLoadFailed(LINE_DIV_SELECTOR);
    }
    function assayErrorHandler(jqXHR, textStatus, errorThrown) {
        showLoadFailed(ASSAY_DIV_SELECTOR);
    }
    function showLoadFailed(divSelector) {
        var div, span;
        div = $(divSelector);
        div.empty();
        span = $("<span>").text('Unable to load data.').addClass('errorMessage').appendTo(div);
        $('<a>').text(' Retry').on('click', function (e) {
            switch (divSelector) {
                case LINE_DIV_SELECTOR:
                    loadAllLineMetadataTypes();
                    break;
                case ASSAY_DIV_SELECTOR:
                    loadAllAssayMetadataTypes();
                case PROTOCOL_DIV_SELECTOR:
                    loadAllProtocols();
                    break;
                default:
                    console.error('Unsupported value ', divSelector);
            }
        }).appendTo(span);
    }
})(ExperimentDescriptionHelp || (ExperimentDescriptionHelp = {}));
$(ExperimentDescriptionHelp.onDocumentReady);
