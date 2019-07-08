
// This file contains utility functions for use in querying EDD's REST API.

/* MetadataType API query parameter values */
export let LINE_METADATA_CONTEXT = 'L';
export let ASSAY_METADATA_CONTEXT = 'A';

/* System metadata types that may have to be explicitly-referenced in the UI */
export let CARBON_SRC_META_UUID = '4ddaf92a-1623-4c30-aa61-4f7407acfacc';
export let CONTROL_META_UUID = '8aa26735-e184-4dcd-8dd1-830ec240f9e1';
export let LINE_CONTACT_META_UUID = '13672c8a-2a36-43ed-928f-7d63a1a4bd51';
export let LINE_DESCRIPTION_META_UUID = '5fe84549-9a97-47d2-a897-8c18dd8fd34a';
export let LINE_EXPERIMENTER_META_UUID = '974c3367-f0c5-461d-bd85-37c1a269d49e';
export let LINE_NAME_META_UUID = 'b388bcaa-d14b-4d7f-945e-a6fcb60142f2';
export let LINE_STRAINS_META_UUID = '292f1ca7-30de-4ba1-89cd-87d2f6291416';

export let ASSAY_DESCRIPTION_META_UUID = '4929a6ad-370c-48c6-941f-6cd154162315';
export let ASSAY_EXPERIMENTER_META_UUID = '15105bee-e9f1-4290-92b2-d7fdcb3ad68d';
export let ASSAY_NAME_META_UUID = '33125862-66b2-4d22-8966-282eb7142a45';

// Metadata types present in the database that should be omitted from user-displayed lists in
// contexts where separate display is available for line attributes.
export const LINE_PROPERTY_META_UUIDS = [LINE_NAME_META_UUID,
    LINE_DESCRIPTION_META_UUID, LINE_CONTACT_META_UUID,
    LINE_EXPERIMENTER_META_UUID, LINE_STRAINS_META_UUID];

export const ASSAY_PROPERTY_META_TYPES = [ASSAY_DESCRIPTION_META_UUID,
    ASSAY_EXPERIMENTER_META_UUID, ASSAY_NAME_META_UUID];

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
