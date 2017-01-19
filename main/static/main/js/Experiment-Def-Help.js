/**
 * Created by mark.forrer on 1/18/17.
 */
var ExperimentDescriptionHelp;
(function (ExperimentDescriptionHelp) {
    var metadata_types_url = "/rest/metadata_type/";
    // TODO: REST API-wide constants that should be pulled out
    var nextResultParam = 'offset';
    var nextPageUrl = 'next';
    var pageSizeParam = 'page_size';
    var results = 'results';
    var ascendingSort = 'ascending';
    var descendingSort = 'descending';
    var sortOrderParam = 'sort_order';
    // TODO: review/implement
    // omit line / assay metadata types that are already included in help text as built-in
    var omitLineMetadataTypes = ['Line name', 'Line Description', 'Line Contact',
        'Line Experimenter'];
    var omitAssayMetadataTypes = [];
    // As soon as the window load signal is sent, call back to the server for the set of reference records
    // that will be used to disambiguate labels in imported data.
    function onWindowLoad() {
        $('.disclose').find('.discloseLink').on('click', disclose);
        loadMetadataTypes('L', '#lineMetadataTypes', undefined, undefined);
        loadMetadataTypes('A', '#assayMetadataTypes', undefined, undefined);
    }
    ExperimentDescriptionHelp.onWindowLoad = onWindowLoad;
    function disclose() {
        $(this).closest('.disclose').toggleClass('discloseHide');
        return false;
    }
    ExperimentDescriptionHelp.disclose = disclose;
    function loadMetadataTypes(forContext, divSelector, receivedSoFar, pageNum) {
        var div, pageNum;
        receivedSoFar = receivedSoFar || [];
        pageNum = pageNum || 1;
        // clear the div and provide a progress message, but not on recursive calls
        if (!receivedSoFar) {
            div = $(divSelector);
            div.empty();
            $('<span>')
                .val('Loading data from server...please wait.')
                .addClass('wait')
                .appendTo(div);
        }
        // query the REST API for requested metadata types
        jQuery.ajax(metadata_types_url, {
            'dataType': 'json',
            'data': { 'for_context': forContext,
                // TODO: verify page offset indexing is correct here
                // start offset if pagination required
                nextResultParam: receivedSoFar.length,
                pageNumParam: pageNum,
                sortOrderParam: ascendingSort,
                pageSizeParam: 1 // TODO: remove following testing
            },
            'success': function (singlePageResponseJson) {
                console.log('Got results!'); //TODO: remove results JSON
                console.log(singlePageResponseJson);
                handleQueryResults(forContext, divSelector, receivedSoFar, singlePageResponseJson, pageNum);
            },
            'error': function (jqXHR, textStatus, errorThrown) {
                showTypeLoadFailed(divSelector);
            } });
    }
    function handleQueryResults(forContext, divSelector, retrievedSoFar, singlePageResponseJson, pageNum) {
        var pageResults;
        pageResults = singlePageResponseJson[results];
        // if results had to be paginated and aren't all received yet, make a recursive call
        // to get the rest
        if (singlePageResponseJson[nextPageUrl]) {
            retrievedSoFar.push(pageResults);
            console.log('Making pagination query to ' + singlePageResponseJson[nextPageUrl]); // TODO: remove debug stmt
            loadMetadataTypes(forContext, divSelector, retrievedSoFar, pageNum + 1);
        }
        else {
            showMetadataTypes(divSelector, pageResults);
        }
    }
    function showMetadataTypes(divSelector, metadataTypes) {
        var div, list;
        div = $(divSelector)
            .empty();
        //TODO: remove debug stmt
        console.log('Showing ' + metadataTypes.length + ' metadataTypes for ' + divSelector);
        list = $('<ol>')
            .prop('list-style-type', 'none')
            .appendTo(div);
        // TODO: remove items that correspond to baked in table properties (maybe on the back end?)
        metadataTypes.forEach(function (metadataType) {
            console.log('\t' + metadataType['type_name']);
            $('<li>')
                .text(metadataType['type_name'])
                .appendTo(list);
        });
    }
    function showTypeLoadFailed(divSelector) {
        var div, span;
        div = $(divSelector);
        div.empty();
        span = $("<span>").val('Unable to load data.').addClass('errorMessage').appendTo(div);
        $('<a>').val('Retry').appendTo(span); // TODO: actually support reload
    }
    $(window).on('load', function () {
        ExperimentDescriptionHelp.onWindowLoad();
    });
})(ExperimentDescriptionHelp || (ExperimentDescriptionHelp = {}));
