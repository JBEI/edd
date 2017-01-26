/// <reference path="typescript-declarations.d.ts" />
// This file contains utility functions for use in querying EDD's REST API.
var EddRest;
(function (EddRest) {
    var Api = (function () {
        function Api() {
        }
        /**
         * Initiates one or more asynchronous requests to load Protocols from the REST API back
         * end.
         */
        Api.loadProtocols = function (options) {
            var queryParams, requestAll, success, error, waitHandler, pageNum, receivedSoFar;
            requestAll = options[Api.REQUEST_ALL_OPTION] === true;
            pageNum = options[Api.PAGE_OPTION] || 1;
            waitHandler = options[Api.WAIT_HANDLER_OPTION];
            if (waitHandler) {
                waitHandler();
            }
            // build up a dictionary of query parameters based on optional function inputs
            queryParams = {};
            Api.insertPaginationParams(options, queryParams);
            Api.insertSortOrderParam(options, queryParams);
            receivedSoFar = options['received_so_far'] || [];
            // query the REST API for requested metadata types
            jQuery.ajax(Api.protocols_url, {
                'dataType': 'json',
                'data': queryParams,
                'success': function (responseJson) {
                    var singlePageResults;
                    singlePageResults = responseJson[Api.results];
                    receivedSoFar = receivedSoFar.concat(singlePageResults);
                    // if results had to be paginated and aren't all received yet, make recursive
                    // call(s) to get the rest
                    if (requestAll && responseJson[Api.nextPageUrl] !== null) {
                        options.received_so_far = receivedSoFar;
                        options.page = pageNum + 1;
                        Api.loadProtocols(options);
                    }
                    else {
                        success = options[Api.SUCCESS_OPTION];
                        success(receivedSoFar);
                    }
                },
                'error': function (jqXHR, textStatus, errorThrown) {
                    error = options[Api.ERROR_OPTION];
                    if (error) {
                        error(jqXHR, textStatus, errorThrown);
                    }
                }
            });
        };
        /**
         * Initiates one or more asynchronous requests to load MetadataTypes from the REST API back
         * end.
         */
        Api.loadMetadataTypes = function (options) {
            var queryParams, requestAll, success, error, waitHandler, forContext, receivedSoFar, pageNum;
            requestAll = options[Api.REQUEST_ALL_OPTION] === true;
            waitHandler = options[Api.WAIT_HANDLER_OPTION];
            if (waitHandler) {
                waitHandler();
            }
            // build up a dictionary of query parameters based on optional function inputs
            queryParams = {};
            forContext = options['context'];
            if (forContext) {
                queryParams.for_context = forContext;
            }
            Api.insertPaginationParams(options, queryParams);
            Api.insertSortOrderParam(options, queryParams);
            receivedSoFar = options['received_so_far'] || [];
            // query the REST API for requested metadata types
            jQuery.ajax(Api.metadata_types_url, {
                'dataType': 'json',
                'data': queryParams,
                'success': function (responseJson) {
                    var singlePageResults;
                    singlePageResults = responseJson[Api.results];
                    receivedSoFar = receivedSoFar.concat(singlePageResults);
                    // if results had to be paginated and aren't all received yet, make a
                    // recursive call to get the rest
                    if (requestAll && responseJson[Api.nextPageUrl] !== null) {
                        options.received_so_far = receivedSoFar;
                        pageNum = options[Api.PAGE_OPTION] || 1;
                        options.page = pageNum + 1;
                        Api.loadMetadataTypes(options);
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
                }
            });
        };
        Api.insertPaginationParams = function (options, queryParams) {
            var pageNum, pageSize, sortOrder;
            pageNum = options[Api.PAGE_OPTION] || 1;
            if (pageNum && pageNum != 1) {
                queryParams.page = pageNum;
            }
            pageSize = options[Api.PAGE_SIZE_OPTION] || null;
            if (pageSize) {
                queryParams.page_size = pageSize;
            }
        };
        Api.insertSortOrderParam = function (options, queryParams) {
            var sortOrder;
            sortOrder = options[Api.SORT_ORDER_OPTION];
            if (sortOrder) {
                queryParams.sort_order = sortOrder;
            }
        };
        /* DRF paged result query parameters */
        Api.pageSizeParam = 'page_size';
        Api.pageNumParam = 'page';
        Api.sortOrderParam = 'sort_order';
        /* Standard query parameter values used across the EDD API  */
        Api.ascendingSort = 'ascending';
        Api.descendingSort = 'descending';
        /* DRF JSON result properties (when paged) */
        Api.nextPageUrl = 'next';
        Api.results = 'results';
        /* Common option keywords used as parameters to EddRest.Api TypeScript functions */
        Api.PAGE_OPTION = 'page';
        Api.PAGE_SIZE_OPTION = 'page_size';
        Api.WAIT_HANDLER_OPTION = 'wait';
        Api.REQUEST_ALL_OPTION = 'request_all';
        Api.SORT_ORDER_OPTION = 'sort_order';
        Api.RECEIVED_SO_FAR_OPTION = 'received_so_far';
        Api.SUCCESS_OPTION = 'success';
        Api.ERROR_OPTION = 'error';
        /* MetadataType API query parameter values */
        Api.LINE_METADATA_CONTEXT = 'L';
        Api.ASSAY_METADATA_CONTEXT = 'A';
        /* REST API resource URLs */
        Api.metadata_types_url = "/rest/metadata_type/";
        Api.protocols_url = '/rest/protocol/';
        return Api;
    }());
    EddRest.Api = Api;
})(EddRest || (EddRest = {}));
