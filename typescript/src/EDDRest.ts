/// <reference path="typescript-declarations.d.ts" />

// This file contains utility functions for use in querying EDD's REST API.
module EddRest {

    export class Api {

        /* DRF paged result query parameters */
        static pageSizeParam: string = 'page_size';
        static pageNumParam: string = 'page';
        static sortOrderParam: string = 'sort_order';

        /* Standard query parameter values used across the EDD API  */
        static ascendingSort = 'ascending';
        static descendingSort = 'descending';

        /* DRF JSON result properties (when paged) */
        static nextPageUrl: string = 'next';
        static results: string = 'results';

        /* Common option keywords used as parameters to EddRest.Api TypeScript functions */
        static PAGE_OPTION = 'page';
        static PAGE_SIZE_OPTION = 'page_size';
        static WAIT_HANDLER_OPTION = 'wait';
        static REQUEST_ALL_OPTION = 'request_all';
        static SORT_ORDER_OPTION = 'sort_order';
        static RECEIVED_SO_FAR_OPTION = 'received_so_far';
        static SUCCESS_OPTION = 'success';
        static ERROR_OPTION = 'error';

        /* MetadataType API query parameter values */
        static LINE_METADATA_CONTEXT = 'L';
        static ASSAY_METADATA_CONTEXT = 'A';

        /* REST API resource URLs */
        static metadata_types_url: string = "/rest/metadata_type/";
        static protocols_url: string = '/rest/protocol/';

        /**
         * Initiates one or more asynchronous requests to load Protocols from the REST API back
         * end.
         */
        static loadProtocols(options: any): void {
            var queryParams: any, requestAll: boolean, success: any, error: any, waitHandler: any,
                pageNum: number, receivedSoFar: any[];

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
            jQuery.ajax(
                Api.protocols_url,
                {
                    'dataType': 'json',
                    'data': queryParams,
                    'success': function (responseJson) {
                        var singlePageResults: any[];

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
                    'error': function (jqXHR, textStatus: string, errorThrown: string) {
                        error = options[Api.ERROR_OPTION];
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
        static loadMetadataTypes(options: any): void {
            var queryParams: any, requestAll: boolean, success: any, error: any, waitHandler: any,
                forContext: string, receivedSoFar: any[], pageNum;

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
            jQuery.ajax(
                Api.metadata_types_url,
                {
                    'dataType': 'json',
                    'data': queryParams,
                    'success': function (responseJson) {
                        var singlePageResults: any[];

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
                    'error': function (jqXHR, textStatus: string, errorThrown: string) {
                        error = options['error'];
                        if (error) {
                            error(jqXHR, textStatus, errorThrown);
                        }
                    }
                }
            );
        }

        static insertPaginationParams(options: any, queryParams: any) {
            var pageNum: number, pageSize: number, sortOrder: number;
            pageNum = options[Api.PAGE_OPTION] || 1;
            if (pageNum && pageNum != 1) {
                queryParams.page = pageNum;
            }

            pageSize = options[Api.PAGE_SIZE_OPTION] || null;
            if (pageSize) {
                queryParams.page_size = pageSize;
            }
        }

        static insertSortOrderParam(options: any, queryParams: any) {
            var sortOrder: string;
            sortOrder = options[Api.SORT_ORDER_OPTION];
            if (sortOrder) {
                queryParams.sort_order = sortOrder;
            }
        }
    }
}
