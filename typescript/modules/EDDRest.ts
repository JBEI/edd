
// This file contains utility functions for use in querying EDD's REST API.

/* MetadataType API query parameter values */
export let LINE_METADATA_CONTEXT = 'L';
export let ASSAY_METADATA_CONTEXT = 'A';

/* Default metadata names that may have to be explicitly-referenced in the UI */
export let CARBON_SOURCE_META_NAME = 'Carbon Source(s)';
export let CONTROL_META_NAME = 'Control';
export let LINE_CONTACT_META_NAME = 'Line Contact';
export let LINE_DESCRIPTION_META_NAME = 'Line Description';
export let LINE_EXPERIMENTER_META_NAME = 'Line Experimenter';
export let LINE_NAME_META_NAME = 'Line Name';
export let STRAINS_META_NAME = 'Strain(s)';

/**
 * Initiates one or more asynchronous requests to load Protocols from the REST API back
 * end.
 */
export function loadProtocols(options: any): void {
    var queryParams: any, requestAll: boolean, success: any, error: any, waitHandler: any,
        pageNum: number, receivedSoFar: any[];

    requestAll = options.request_all === true;
    pageNum = options.page || 1;

    waitHandler = options.wait;
    if (waitHandler) {
        waitHandler();
    }

    // build up a dictionary of query parameters based on optional function inputs
    queryParams = {};
    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);

    receivedSoFar = options.received_so_far || [];

    // query the REST API for requested metadata types
    jQuery.ajax(
        '/rest/protocols/',
        {
            'dataType': 'json',
            'data': queryParams,
            'success': (responseJson) => {
                var singlePageResults: any[];

                singlePageResults = responseJson.results;
                receivedSoFar = receivedSoFar.concat(singlePageResults);

                // if results had to be paginated and aren't all received yet, make recursive
                // call(s) to get the rest
                if (requestAll && responseJson.next !== null) {
                    options.received_so_far = receivedSoFar;
                    options.page = pageNum + 1;
                    loadProtocols(options);
                } else {
                    success = options.success;
                    success(receivedSoFar);
                }
            },
            'error': (jqXHR, textStatus: string, errorThrown: string) => {
                error = options.error;
                if (error) {
                    error(jqXHR, textStatus, errorThrown);
                }
            },
        }
    );
}

/**
 * Initiates one or more asynchronous requests to load MetadataTypes from the REST API back
 * end.
 */
export function loadMetadataTypes(options: any): void {
    var queryParams: any, requestAll: boolean, success: any, error: any, waitHandler: any,
        forContext: string, receivedSoFar: any[], pageNum;

    requestAll = options.request_all === true;

    waitHandler = options.wait;
    if (waitHandler) {
        waitHandler();
    }

    // build up a dictionary of query parameters based on optional function inputs
    queryParams = {};
    forContext = options.context;
    if (forContext) {
        queryParams.for_context = forContext;
    }
    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);

    receivedSoFar = options.received_so_far || [];

    // query the REST API for requested metadata types
    jQuery.ajax(
        "/rest/metadata_types/",
        {
            'dataType': 'json',
            'data': queryParams,
            'success': function (responseJson) {
                var singlePageResults: any[];

                singlePageResults = responseJson.results;
                receivedSoFar = receivedSoFar.concat(singlePageResults);

                // if results had to be paginated and aren't all received yet, make a
                // recursive call to get the rest
                if (requestAll && responseJson.next !== null) {
                    options.received_so_far = receivedSoFar;
                    pageNum = options.page || 1;
                    options.page = pageNum + 1;
                    loadMetadataTypes(options);
                } else {
                    success = options.success;
                    success(receivedSoFar);
                }
            },
            'error': (jqXHR, textStatus: string, errorThrown: string) => {
                error = options.error;
                if (error) {
                    error(jqXHR, textStatus, errorThrown);
                }
            },
        }
    );
}

/**
 * Initiates one or more asynchronous requests to load MeasurementUnits from the REST API back
 * end.
 */
export function loadMeasurementUnits(options: any): void {
    var queryParams: any, requestAll: boolean, success: any, error: any, waitHandler: any,
        unitName: string, alternateNames: string, typeGroup: string, receivedSoFar: any[], pageNum;

    requestAll = options.request_all === true;

    waitHandler = options.wait;
    if (waitHandler) {
        waitHandler();
    }

    // build up a dictionary of query parameters based on optional function inputs
    queryParams = {};
    unitName = options.unit_name;
    if (unitName) {
        queryParams.unit_name = unitName;
    }
    alternateNames = options.alternate_names;
    if (alternateNames) {
        queryParams.alternate_names = alternateNames;
    }
    typeGroup = options.type_group;
    if (typeGroup) {
        queryParams.type_group = typeGroup;
    }

    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);

    receivedSoFar = options.received_so_far || [];

    // query the REST API for requested metadata types
    jQuery.ajax(
        '/rest/measurement_units/',
        {
            'dataType': 'json',
            'data': queryParams,
            'success': function (responseJson) {
                var singlePageResults: any[];

                singlePageResults = responseJson.results;
                receivedSoFar = receivedSoFar.concat(singlePageResults);

                // if results had to be paginated and aren't all received yet, make a
                // recursive call to get the rest
                if (requestAll && responseJson.next !== null) {
                    options.received_so_far = receivedSoFar;
                    pageNum = options.page || 1;
                    options.page = pageNum + 1;
                    loadMeasurementUnits(options);
                } else {
                    success = options.success;
                    success(receivedSoFar);
                }
            },
            'error': (jqXHR, textStatus: string, errorThrown: string) => {
                error = options.error;
                if (error) {
                    error(jqXHR, textStatus, errorThrown);
                }
            },
        }
    );
}

export function insertPaginationParams(options: any, queryParams: any) {
    var pageNum: number, pageSize: number;
    pageNum = options.page || 1;
    if (pageNum && pageNum !== 1) {
        queryParams.page = pageNum;
    }

    pageSize = options.page_size || null;
    if (pageSize) {
        queryParams.page_size = pageSize;
    }
}

export function insertSortOrderParam(options: any, queryParams: any) {
    var sortOrder: string;
    sortOrder = options.ordering;
    if (sortOrder) {
        queryParams.ordering = sortOrder;
    }
}

