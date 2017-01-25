// TODO: pull out reusable REST API code into a separate file

module ExperimentDescriptionHelp {
    var metadata_types_url:string = "/rest/metadata_type/";
    var protocols_url: string = '/rest/protocol/';

    // TODO: REST API-wide constants that should be pulled out
    var nextPageUrl:string = 'next';
    var pageSizeParam: string = 'page_size';
    var pageNumParam: string = 'page';
    var results:string = 'results';
    var ascendingSort = 'ascending';
    var descendingSort = 'descending';
    var sortOrderParam:string = 'sort_order';

    var ASSAY_DIV_SELECTOR = '#assayMetadataTypes';
    var LINE_DIV_SELECTOR = '#lineMetadataTypes';
    var PROTOCOL_DIV_SELECTOR = '#protocols';

    var LINE_METADATA_CONTEXT = 'L';
    var ASSAY_METADATA_CONTEXT = 'A';
    var omitLineMetadataTypes = ['Line Name', 'Line Description', 'Line Contact',
        'Line Experimenter'];

    var omitAssayMetadataTypes = ['Assay Description', 'Assay Experimenter', 'Assay Name'];

    // As soon as the window load signal is sent, call back to the server for the set of reference
    // records that will be used to disambiguate labels in imported data.
    export function onWindowLoad(): void {
        $('.disclose').find('.discloseLink').on('click', disclose);

        loadAllLineMetadataTypes();
        loadAllAssayMetadataTypes();
        loadAllProtocols();
    }

    export function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }

    function loadAllLineMetadataTypes():void {
        loadMetadataTypes(
            {
                'success': lineMetaSuccessHandler,
                'error': lineErrorHandler,
                'request_all': true, // get all result pages
                'wait': function() {showWaitMessage(LINE_DIV_SELECTOR)},
                'context': LINE_METADATA_CONTEXT,
                'sort_order': ascendingSort,
            });
    }

    function loadAllAssayMetadataTypes(): void {
        loadMetadataTypes(
            {
                'success': assayMetaSuccessHandler,
                'error': assayErrorHandler,
                'request_all': true, // get all result pages
                'wait': function() {showWaitMessage(ASSAY_DIV_SELECTOR)},
                'context': ASSAY_METADATA_CONTEXT,
                'sort_order': ascendingSort,
            });
    }

    function loadAllProtocols():void {
        loadProtocols(
            {
                'success': protocolSuccessHandler,
                'error': function () { showLoadFailed(PROTOCOL_DIV_SELECTOR); },
                'request_all': true, // get all result pages
                'wait': function() {showWaitMessage(PROTOCOL_DIV_SELECTOR)},
                'sort_order': ascendingSort,
            });
    }

    function showWaitMessage(divSelector:string) {
        var div;
        div = $(divSelector);
            div.empty();
            $('<span>')
                .text('Loading data from server...please wait.')
                .addClass('wait')
                .appendTo(div);
    }

    function lineMetaSuccessHandler(metadataTypes:any[]) {
        showMetadataTypes(LINE_DIV_SELECTOR, metadataTypes, omitLineMetadataTypes);
    }

    function assayMetaSuccessHandler(metadataTypes:any[]) {
        showMetadataTypes(ASSAY_DIV_SELECTOR, metadataTypes, omitAssayMetadataTypes);
    }

    function protocolSuccessHandler(protocols: any[]) {
        var div:JQuery, table:JQuery, head, body, row;
        div = $('#protocols')
                .empty();

        if(protocols.length > 0) {
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

            protocols.forEach((protocol: any): void => {
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
        } else {
            div.text('No protocols were found.');
        }
    }

    function showMetadataTypes(divSelector:string, metadataTypes:any[],
                               omitFromDisplay:string[]): void {
        var div:JQuery, list:JQuery;
        div = $(divSelector)
                .empty();

        if(metadataTypes) {
            list = $('<ol>')
            .addClass('metadataList')
            .appendTo(div);

            metadataTypes.forEach((metadataType: any): boolean => {
                var typeName:string, omit:boolean;
                typeName = metadataType['type_name'];

                // omit items included in the 'primary characteristics' table
                omit = omitFromDisplay.indexOf(typeName) >= 0;
                if(omit) {
                    return true;
                }

                $('<li>')
                    .text(metadataType['type_name'])
                    .appendTo(list);

                return true;  // keep looping
            });
        } else {
            div.val('No metadata types were found.')
        }
    }

    function lineErrorHandler(jqXHR, textStatus:string, errorThrown:string): void {
        showLoadFailed(LINE_DIV_SELECTOR);
    }

    function assayErrorHandler(jqXHR, textStatus:string, errorThrown:string): void {
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

    function loadProtocols(options:any):void {
        var queryParams:any, requestAll:boolean, success:any, error:any, waitHandler:any,
            pageNum:number, receivedSoFar:any[];

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
                'success': function(responseJson) {
                    var singlePageResults:any[];

                    singlePageResults = responseJson[results];
                    receivedSoFar= receivedSoFar.concat(singlePageResults);

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
                'error': function(jqXHR, textStatus:string, errorThrown:string) {
                    error = options[ERROR_OPTION];
                    if(error) {
                        error(jqXHR, textStatus, errorThrown);
                    }
                }}
        );
    }

    function insertPaginationParams(options:any, queryParams:any) {
        var pageNum:number, pageSize:number, sortOrder:number;
        pageNum = options[PAGE_OPTION] || 1;
        if(pageNum && pageNum != 1) {
            queryParams.page = pageNum;
        }

        pageSize = options[PAGE_SIZE_OPTION] || null;
        if(pageSize) {
            queryParams.page_size = pageSize;
        }
    }

    function insertSortOrderParam(options:any, queryParams:any) {
        var sortOrder: string;
        sortOrder = options[SORT_ORDER_OPTION];
        if(sortOrder) {
            queryParams.sort_order = sortOrder;
        }
    }

    /**
     * Initiates one or more asynchronous requests to load MetadataTypes from the back end.
     */
    function loadMetadataTypes(options:any):void {
        var queryParams:any, requestAll:boolean, success:any, error:any, waitHandler:any,
            forContext:string, receivedSoFar:any[], pageNum;

        requestAll = options[REQUEST_ALL_OPTION] === true;

        waitHandler = options[WAIT_HANDLER_OPTION];
        if (waitHandler) {
            waitHandler();
        }

        // build up a dictionary of query parameters based on optional function inputs
        queryParams = {};
        forContext = options['context'];
        if(forContext){
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
                'success': function(responseJson) {
                    var singlePageResults:any[];

                    singlePageResults = responseJson[results];
                    receivedSoFar= receivedSoFar.concat(singlePageResults);

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
                'error': function(jqXHR, textStatus:string, errorThrown:string) {
                    error = options['error'];
                    if(error) {
                        error(jqXHR, textStatus, errorThrown);
                    }
                }}
        );
    }

    function showLoadFailed(divSelector:string): void {
        var div: JQuery, span;
        div = $(divSelector);
        div.empty();

        span = $("<span>").text('Unable to load data.').addClass('errorMessage').appendTo(div);

        // TODO: actually support reload
        //$('<a>').val('Retry').appendTo(span);
    }

    $(window).on('load', function() {
        ExperimentDescriptionHelp.onWindowLoad();
    });

}


