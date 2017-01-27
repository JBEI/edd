/// <reference path="typescript-declarations.d.ts" />
// This file contains utility functions for use in querying EDD's REST API.
var EddRest;
(function (EddRest) {
    /* DRF paged result query parameters */
    var PAGE_SIZE_PARAM = 'page_size';
    var PAGE_NUM_PARAM = 'page';
    var SORT_ORDER_PARAM = 'sort_order';
    /* Standard query parameter values used across the EDD API  */
    EddRest.ASCENDING_SORT = 'ascending';
    EddRest.DESCENDING_SORT = 'descending';
    /* DRF JSON result properties (when paged) */
    EddRest.NEXT_PAGE_URL = 'next';
    EddRest.RESULTS = 'results';
    /* Common option keywords used as parameters to EddRest.Api TypeScript functions */
    EddRest.PAGE_OPTION = 'page';
    EddRest.PAGE_SIZE_OPTION = 'page_size';
    EddRest.WAIT_HANDLER_OPTION = 'wait';
    EddRest.REQUEST_ALL_OPTION = 'request_all';
    EddRest.SORT_ORDER_OPTION = 'sort_order';
    EddRest.RECEIVED_SO_FAR_OPTION = 'received_so_far';
    EddRest.SUCCESS_OPTION = 'success';
    EddRest.ERROR_OPTION = 'error';
    /* MetadataType API query parameter values */
    EddRest.LINE_METADATA_CONTEXT = 'L';
    EddRest.ASSAY_METADATA_CONTEXT = 'A';
    /* REST API resource URLs */
    var metadata_types_url = "/rest/metadata_type/";
    var protocols_url = '/rest/protocol/';
    var measurement_units_url = '/rest/measurement_unit';
    /**
     * Initiates one or more asynchronous requests to load Protocols from the REST API back
     * end.
     */
    function loadProtocols(options) {
        var queryParams, requestAll, success, error, waitHandler, pageNum, receivedSoFar;
        requestAll = options[EddRest.REQUEST_ALL_OPTION] === true;
        pageNum = options[EddRest.PAGE_OPTION] || 1;
        waitHandler = options[EddRest.WAIT_HANDLER_OPTION];
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
                singlePageResults = responseJson[EddRest.RESULTS];
                receivedSoFar = receivedSoFar.concat(singlePageResults);
                // if results had to be paginated and aren't all received yet, make recursive
                // call(s) to get the rest
                if (requestAll && responseJson[EddRest.NEXT_PAGE_URL] !== null) {
                    options.received_so_far = receivedSoFar;
                    options.page = pageNum + 1;
                    loadProtocols(options);
                }
                else {
                    success = options[EddRest.SUCCESS_OPTION];
                    success(receivedSoFar);
                }
            },
            'error': function (jqXHR, textStatus, errorThrown) {
                error = options[EddRest.ERROR_OPTION];
                if (error) {
                    error(jqXHR, textStatus, errorThrown);
                }
            }
        });
    }
    EddRest.loadProtocols = loadProtocols;
    /**
     * Initiates one or more asynchronous requests to load MetadataTypes from the REST API back
     * end.
     */
    function loadMetadataTypes(options) {
        var queryParams, requestAll, success, error, waitHandler, forContext, receivedSoFar, pageNum;
        requestAll = options[EddRest.REQUEST_ALL_OPTION] === true;
        waitHandler = options[EddRest.WAIT_HANDLER_OPTION];
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
                singlePageResults = responseJson[EddRest.RESULTS];
                receivedSoFar = receivedSoFar.concat(singlePageResults);
                // if results had to be paginated and aren't all received yet, make a
                // recursive call to get the rest
                if (requestAll && responseJson[EddRest.NEXT_PAGE_URL] !== null) {
                    options.received_so_far = receivedSoFar;
                    pageNum = options[EddRest.PAGE_OPTION] || 1;
                    options.page = pageNum + 1;
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
            }
        });
    }
    EddRest.loadMetadataTypes = loadMetadataTypes;
    /**
     * Initiates one or more asynchronous requests to load MeasurementUnits from the REST API back
     * end.
     */
    function loadMeasurementUnits(options) {
        var queryParams, requestAll, success, error, waitHandler, unitName, alternateNames, typeGroup, receivedSoFar, pageNum;
        requestAll = options[EddRest.REQUEST_ALL_OPTION] === true;
        waitHandler = options[EddRest.WAIT_HANDLER_OPTION];
        if (waitHandler) {
            waitHandler();
        }
        // build up a dictionary of query parameters based on optional function inputs
        queryParams = {};
        unitName = options['unit_name'];
        if (unitName) {
            queryParams.unit_name = unitName;
        }
        alternateNames = options['alternate_names'];
        if (alternateNames) {
            queryParams.alternate_names = alternateNames;
        }
        typeGroup = options['type_group'];
        if (typeGroup) {
            queryParams.type_group = typeGroup;
        }
        insertPaginationParams(options, queryParams);
        insertSortOrderParam(options, queryParams);
        receivedSoFar = options['received_so_far'] || [];
        // query the REST API for requested metadata types
        jQuery.ajax(measurement_units_url, {
            'dataType': 'json',
            'data': queryParams,
            'success': function (responseJson) {
                var singlePageResults;
                singlePageResults = responseJson[EddRest.RESULTS];
                receivedSoFar = receivedSoFar.concat(singlePageResults);
                // if results had to be paginated and aren't all received yet, make a
                // recursive call to get the rest
                if (requestAll && responseJson[EddRest.NEXT_PAGE_URL] !== null) {
                    options.received_so_far = receivedSoFar;
                    pageNum = options[EddRest.PAGE_OPTION] || 1;
                    options.page = pageNum + 1;
                    loadMeasurementUnits(options);
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
    }
    EddRest.loadMeasurementUnits = loadMeasurementUnits;
    function insertPaginationParams(options, queryParams) {
        var pageNum, pageSize, sortOrder;
        pageNum = options[EddRest.PAGE_OPTION] || 1;
        if (pageNum && pageNum != 1) {
            queryParams.page = pageNum;
        }
        pageSize = options[EddRest.PAGE_SIZE_OPTION] || null;
        if (pageSize) {
            queryParams.page_size = pageSize;
        }
    }
    EddRest.insertPaginationParams = insertPaginationParams;
    function insertSortOrderParam(options, queryParams) {
        var sortOrder;
        sortOrder = options[EddRest.SORT_ORDER_OPTION];
        if (sortOrder) {
            queryParams.sort_order = sortOrder;
        }
    }
    EddRest.insertSortOrderParam = insertSortOrderParam;
})(EddRest || (EddRest = {}));
