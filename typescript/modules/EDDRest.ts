
// This file contains utility functions for use in querying EDD's REST API.
export module EddRest {

    /* DRF paged result query parameters */
    const PAGE_SIZE_PARAM: string = 'page_size';
    const PAGE_NUM_PARAM: string = 'page';
    const SORT_ORDER_PARAM: string = 'sort_order';

    /* Standard query parameter values used across the EDD API  */
    export const ASCENDING_SORT = 'ascending';
    export const DESCENDING_SORT = 'descending';

    /* DRF JSON result properties (when paged) */
    export const NEXT_PAGE_URL: string = 'next';
    export const RESULTS: string = 'results';

    /* Common option keywords used as parameters to EddRest.Api TypeScript functions */
    export const PAGE_OPTION = 'page';
    export const PAGE_SIZE_OPTION = 'page_size';
    export const WAIT_HANDLER_OPTION = 'wait';
    export const REQUEST_ALL_OPTION = 'request_all';
    export const SORT_ORDER_OPTION = 'ordering';
    export const RECEIVED_SO_FAR_OPTION = 'received_so_far';
    export const SUCCESS_OPTION = 'success';
    export const ERROR_OPTION = 'error';

    /* Default metadata names that may have to be explicitly-referenced in the UI */
    export const LINE_NAME_META_NAME = 'Line Name';
    export const LINE_EXPERIMENTER_META_NAME = 'Line Experimenter';
    export const LINE_DESCRIPTION_META_NAME = 'Line Description';
    export const LINE_CONTACT_META_NAME = 'Line Contact';
    export const CARBON_SOURCE_META_NAME = 'Carbon Source(s)';
    export const STRAINS_META_NAME = 'Strain(s)';
    export const CONTROL_META_NAME = 'Control';

    // Metadata types present in the database that should be omitted from user-displayed lists in
    // contexts where separate display is available for line attributes.
    export const LINE_ATTRIBUTE_META_TYPES = [LINE_NAME_META_NAME, LINE_DESCRIPTION_META_NAME,
        LINE_CONTACT_META_NAME, LINE_EXPERIMENTER_META_NAME, STRAINS_META_NAME];

    /* MetadataType API query parameter values */
    export const LINE_METADATA_CONTEXT = 'L';
    export const ASSAY_METADATA_CONTEXT = 'A';

    /* REST API resource URLs */
    const metadata_types_url: string = "/rest/metadata_types/";
    const protocols_url: string = '/rest/protocols/';
    const measurement_units_url: string = '/rest/measurement_units/';

    /**
     * Initiates one or more asynchronous requests to load Protocols from the REST API back
     * end.
     */
    export function loadProtocols(options: any): void {
        var queryParams: any, requestAll: boolean, success: any, error: any, waitHandler: any,
            pageNum: number, receivedSoFar: any[];

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
        jQuery.ajax(
            protocols_url,
            {
                'dataType': 'json',
                'data': queryParams,
                'success': (responseJson) => {
                    var singlePageResults: any[];

                    singlePageResults = responseJson[RESULTS];
                    receivedSoFar = receivedSoFar.concat(singlePageResults);

                    // if results had to be paginated and aren't all received yet, make recursive
                    // call(s) to get the rest
                    if (requestAll && responseJson[NEXT_PAGE_URL] !== null) {
                        options.received_so_far = receivedSoFar;
                        options.page = pageNum + 1;
                        loadProtocols(options);
                    }
                    else {
                        success = options[SUCCESS_OPTION];
                        success(receivedSoFar);
                    }
                },
                'error': (jqXHR, textStatus: string, errorThrown: string) => {
                    error = options[ERROR_OPTION];
                    if (error) {
                        error(jqXHR, textStatus, errorThrown);
                    }
                }
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
        jQuery.ajax(
            metadata_types_url,
            {
                'dataType': 'json',
                'data': queryParams,
                'success': function (responseJson) {
                    var singlePageResults: any[];

                    singlePageResults = responseJson[RESULTS];
                    receivedSoFar = receivedSoFar.concat(singlePageResults);

                    // if results had to be paginated and aren't all received yet, make a
                    // recursive call to get the rest
                    if (requestAll && responseJson[NEXT_PAGE_URL] !== null) {
                        options.received_so_far = receivedSoFar;
                        pageNum = options[PAGE_OPTION] || 1;
                        options.page = pageNum + 1;
                        loadMetadataTypes(options);
                    }
                    else {
                        success = options['success'];
                        success(receivedSoFar);
                    }
                },
                'error': (jqXHR, textStatus: string, errorThrown: string) => {
                    error = options['error'];
                    if (error) {
                        error(jqXHR, textStatus, errorThrown);
                    }
                }
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

        requestAll = options[REQUEST_ALL_OPTION] === true;

        waitHandler = options[WAIT_HANDLER_OPTION];
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
        jQuery.ajax(
            measurement_units_url,
            {
                'dataType': 'json',
                'data': queryParams,
                'success': function (responseJson) {
                    var singlePageResults: any[];

                    singlePageResults = responseJson[RESULTS];
                    receivedSoFar = receivedSoFar.concat(singlePageResults);

                    // if results had to be paginated and aren't all received yet, make a
                    // recursive call to get the rest
                    if (requestAll && responseJson[NEXT_PAGE_URL] !== null) {
                        options.received_so_far = receivedSoFar;
                        pageNum = options[PAGE_OPTION] || 1;
                        options.page = pageNum + 1;
                        loadMeasurementUnits(options);
                    }
                    else {
                        success = options['success'];
                        success(receivedSoFar);
                    }
                },
                'error': (jqXHR, textStatus: string, errorThrown: string) => {
                    error = options['error'];
                    if (error) {
                        error(jqXHR, textStatus, errorThrown);
                    }
                }
            }
        );
    }

    export function insertPaginationParams(options: any, queryParams: any) {
        var pageNum: number, pageSize: number, sortOrder: number;
        pageNum = options[PAGE_OPTION] || 1;
        if (pageNum && pageNum != 1) {
            queryParams.page = pageNum;
        }

        pageSize = options[PAGE_SIZE_OPTION] || null;
        if (pageSize) {
            queryParams.page_size = pageSize;
        }
    }

    export function insertSortOrderParam(options: any, queryParams: any) {
        var sortOrder: string;
        sortOrder = options[SORT_ORDER_OPTION];
        if (sortOrder) {
            queryParams.ordering = sortOrder;
        }
    }
}
