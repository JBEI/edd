/**
 * Created by mark.forrer on 1/18/17.
 */
// $.getScript('/main/js/EDD-Rest.js', function()
// {
//     // script is now loaded and executed.
//     // put your dependent JS here.
// });
var ExperimentDescriptionHelp;
(function (ExperimentDescriptionHelp) {
    var metadata_types_url = "/rest/metadata_type/";
    var protocols_url = '/rest/protocol/';
    // TODO: REST API-wide constants that should be pulled out
    var nextPageUrl = 'next';
    var pageSizeParam = 'page_size';
    var pageNumParam = 'page';
    var results = 'results';
    var ascendingSort = 'ascending';
    var descendingSort = 'descending';
    var sortOrderParam = 'sort_order';
    var ASSAY_DIV_SELECTOR = '#assayMetadataTypes';
    var LINE_DIV_SELECTOR = '#lineMetadataTypes';
    var LINE_METADATA_CONTEXT = 'L';
    var ASSAY_METADATA_CONTEXT = 'A';
    // TODO: review/implement
    // omit line / assay metadata types that are already included in help text as built-in
    var omitLineMetadataTypes = ['Line Name', 'Line Description', 'Line Contact',
        'Line Experimenter'];
    var omitAssayMetadataTypes = ['Assay Description', 'Assay Experimenter', 'Assay Name'];
    // As soon as the window load signal is sent, call back to the server for the set of reference records
    // that will be used to disambiguate labels in imported data.
    function onWindowLoad() {
        $('.disclose').find('.discloseLink').on('click', disclose);
        loadAllLineMetadataTypes();
        loadAllAssayMetadataTypes();
        loadAllProtocols();
    }
    ExperimentDescriptionHelp.onWindowLoad = onWindowLoad;
    function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }
    ExperimentDescriptionHelp.disclose = disclose;
    function loadAllLineMetadataTypes() {
        loadMetadataTypes({
            'success': lineMetaSuccessHandler,
            'error': lineErrorHandler,
            'request_all': true,
            'wait': function () { showWaitMessage(LINE_DIV_SELECTOR); },
            'context': LINE_METADATA_CONTEXT,
            'sort_order': ascendingSort,
        });
    }
    function loadAllAssayMetadataTypes() {
        loadMetadataTypes({
            'success': assayMetaSuccessHandler,
            'error': assayErrorHandler,
            'request_all': true,
            'wait': function () { showWaitMessage(ASSAY_DIV_SELECTOR); },
            'context': ASSAY_METADATA_CONTEXT,
            'sort_order': ascendingSort,
        });
    }
    function loadAllProtocols() {
        var protocolSelector = '#protocols';
        loadProtocols({
            'success': protocolSuccessHandler,
            'error': function () { showLoadFailed(protocolSelector); },
            'request_all': true,
            'wait': function () { showWaitMessage(protocolSelector); },
            'sort_order': descendingSort,
        });
    }
    function showWaitMessage(divSelector) {
        var div;
        div = $(divSelector);
        div.empty();
        $('<span>')
            .val('Loading data from server...please wait.')
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
        //TODO: create / use a /rest/measurement_unit or similar REST API resource, use it to
        // improve display for units in this table.  For now, just having a numeric PK placeholder
        // in a buried / advanced feature is an okay-though-non-ideal stand-in / reminder. Can
        // follow up on this in EDD-603.
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
    var PAGE_OPTION = 'page';
    var PAGE_SIZE_OPTION = 'page_size';
    var WAIT_HANDLER_OPTION = 'wait';
    var REQUEST_ALL_OPTION = 'request_all';
    var SORT_ORDER_OPTION = 'sort_order';
    var RECEIVED_SO_FAR_OPTION = 'received_so_far';
    var SUCCESS_OPTION = 'success';
    var ERROR_OPTION = 'error';
    function loadProtocols(options) {
        var queryParams, requestAll, success, error, waitHandler, pageNum, receivedSoFar;
        requestAll = options[REQUEST_ALL_OPTION] === true;
        pageNum = options[PAGE_OPTION] || 1;
        waitHandler = options[WAIT_HANDLER_OPTION];
        if (waitHandler) {
            waitHandler();
        }
        // build up a dictionary of query parameters based on optional function inputs
        queryParams = {};
        insertPaginationParams(options, queryParams);
        insertSortOrderParam(options, queryParams);
        receivedSoFar = options['received_so_far'] || [];
        // query the REST API for requested metadata types
        jQuery.ajax(protocols_url, {
            'dataType': 'json',
            'data': queryParams,
            'success': function (responseJson) {
                var singlePageResults;
                singlePageResults = responseJson[results];
                receivedSoFar = receivedSoFar.concat(singlePageResults);
                // if results had to be paginated and aren't all received yet, make recursive
                // call(s) to get the rest
                if (requestAll && responseJson[nextPageUrl] !== null) {
                    options.received_so_far = receivedSoFar;
                    options.page = pageNum + 1;
                    loadProtocols(options);
                }
                else {
                    success = options[SUCCESS_OPTION];
                    success(receivedSoFar);
                }
            },
            'error': function (jqXHR, textStatus, errorThrown) {
                error = options[ERROR_OPTION];
                if (error) {
                    error(jqXHR, textStatus, errorThrown);
                }
            } });
    }
    function insertPaginationParams(options, queryParams) {
        var pageNum, pageSize, sortOrder;
        pageNum = options[PAGE_OPTION] || 1;
        if (pageNum && pageNum != 1) {
            queryParams.page = pageNum;
        }
        pageSize = options[PAGE_SIZE_OPTION] || null;
        if (pageSize) {
            queryParams.page_size = pageSize;
        }
    }
    function insertSortOrderParam(options, queryParams) {
        var sortOrder;
        sortOrder = options[SORT_ORDER_OPTION];
        if (sortOrder) {
            queryParams.sort_order = sortOrder;
        }
    }
    /**
     * Initiates one or more asynchronous requests to load MetadataTypes from the back end.
     */
    function loadMetadataTypes(options) {
        var queryParams, requestAll, success, error, waitHandler, forContext, receivedSoFar, pageNum;
        requestAll = options[REQUEST_ALL_OPTION] === true;
        waitHandler = options[WAIT_HANDLER_OPTION];
        if (waitHandler) {
            waitHandler();
        }
        // build up a dictionary of query parameters based on optional function inputs
        queryParams = {};
        forContext = options['context'];
        if (forContext) {
            queryParams.for_context = forContext;
        }
        insertPaginationParams(options, queryParams);
        insertSortOrderParam(options, queryParams);
        receivedSoFar = options['received_so_far'] || [];
        // query the REST API for requested metadata types
        jQuery.ajax(metadata_types_url, {
            'dataType': 'json',
            'data': queryParams,
            'success': function (responseJson) {
                var singlePageResults;
                singlePageResults = responseJson[results];
                receivedSoFar = receivedSoFar.concat(singlePageResults);
                // if results had to be paginated and aren't all received yet, make a recursive call
                // to get the rest
                if (requestAll && responseJson[nextPageUrl] !== null) {
                    options.received_so_far = receivedSoFar;
                    pageNum = options[PAGE_OPTION] || 1;
                    options.page = pageNum + 1;
                    console.log('Making paginated query to ' + responseJson[nextPageUrl]); // TODO: remove debug stmt
                    loadMetadataTypes(options);
                }
                else {
                    success = options['success'];
                    success(receivedSoFar);
                }
            },
            'error': function (jqXHR, textStatus, errorThrown) {
                error = options['error'];
                if (error) {
                    error(jqXHR, textStatus, errorThrown);
                }
            } });
    }
    function showLoadFailed(divSelector) {
        var div, span;
        div = $(divSelector);
        div.empty();
        span = $("<span>").val('Unable to load data.').addClass('errorMessage').appendTo(div);
        // TODO: actually support reload
        //$('<a>').val('Retry').appendTo(span);
    }
    $(window).on('load', function () {
        ExperimentDescriptionHelp.onWindowLoad();
    });
})(ExperimentDescriptionHelp || (ExperimentDescriptionHelp = {}));
