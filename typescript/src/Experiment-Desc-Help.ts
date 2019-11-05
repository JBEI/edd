import * as $ from "jquery";
import * as EddRest from "../modules/EDDRest";

// This module contains code for dynamically loading lists of metadata types into the help page
// for Experiment Description files.
const ASSAY_DIV_SELECTOR = '#assayMetadataTypes';
const LINE_DIV_SELECTOR = '#lineMetadataTypes';
const PROTOCOL_DIV_SELECTOR = '#protocols';

var protocols = [];

var measurementUnits = {};

var loadedProtocols = false;

// As soon as the window load signal is sent, call back to the server for the set of reference
// records that will be used to disambiguate labels in imported data.
function onDocumentReady(): void {
    $('.disclose').find('.discloseLink').on('click', disclose);

    loadAllLineMetadataTypes();
    loadAllAssayMetadataTypes();
    loadAllProtocols();
    loadAllMeasurementUnits();
}

function disclose() {
    $(this).closest('.disclose').toggleClass('discloseHide');
    return false;
}

function loadAllLineMetadataTypes(): void {
    EddRest.loadMetadataTypes(
        {
            'success': lineMetaSuccessHandler,
            'error': lineErrorHandler,
            'request_all': true, // get all result pages
            'wait': function() { showWaitMessage(LINE_DIV_SELECTOR); },
            'context': EddRest.LINE_METADATA_CONTEXT,
            'ordering': 'type_name',
        });
}

function loadAllAssayMetadataTypes(): void {
    EddRest.loadMetadataTypes(
        {
            'success': assayMetaSuccessHandler,
            'error': assayErrorHandler,
            'request_all': true, // get all result pages
            'wait': function() { showWaitMessage(ASSAY_DIV_SELECTOR); },
            'context': EddRest.ASSAY_METADATA_CONTEXT,
            'ordering': 'type_name',
        });
}

function loadAllProtocols(): void {
    EddRest.loadProtocols(
        {
            'success': protocolsSuccessHandler,
            'error': () => { showLoadFailed(PROTOCOL_DIV_SELECTOR); },
            'request_all': true, // get all result pages
            'wait': () => { showWaitMessage(PROTOCOL_DIV_SELECTOR); },
            'ordering': 'name',
        });
}

function loadAllMeasurementUnits(): void {
    // purposefully omit wait handler... wait message unlikely to ever be seen / possible race
    // condition with protocol error handler since results are displayed in the same
    // place.  measurement units  and associated wait/error messages aren't helpful by
    // themselves in this context anyway since they're only displayed as context for protocols.
    EddRest.loadMeasurementUnits(
        {
            'success': measurementUnitsSuccessHandler,
            'error': measurementUnitsErrorHandler,
            'request_all': true,
        },
    );
}

function measurementUnitsSuccessHandler(measurementUnitsLoaded: any[]): void {

    // cache measurement units as a dictionary of pk -> value so we can easily look them up
    measurementUnits = {};
    measurementUnitsLoaded.forEach((measurementUnit: any) => {
        const pk: number = measurementUnit.pk;
        measurementUnits[pk] = measurementUnit;
    });

    // attempt to re/build protocols table now that we have names for each associated
    // measurement unit (though possibly not protocols yet)
    showProtocols();
}

function protocolsSuccessHandler(protocolsLoaded: any[]): void {
    // store in case related measurement units query hasn't returned
    protocols = protocolsLoaded;
    loadedProtocols = true;

    // show anyway (though maybe temporarily with only the units pk if units query hasn't
    // returned yet).
    showProtocols();
}

function showWaitMessage(divSelector: string) {
    var div;
    div = $(divSelector);
    div.empty();
    $('<span>')
        .text('Loading data from server...please wait.')
        .addClass('wait')
        .appendTo(div);
}

function lineMetaSuccessHandler(metadataTypes: any[]) {
    // omit Metadata types present in the database that should be omitted from the lists displayed
    // in the help page... they duplicate baked-in line/assay characteristics displayed in a
    // separate table or required in slightly different form by the Experiment Description file
    // format.
    showMetadataTypes(LINE_DIV_SELECTOR, metadataTypes, EddRest.LINE_PROPERTY_META_UUIDS);
}

function assayMetaSuccessHandler(metadataTypes: any[]) {
    // omit Metadata types present in the database that should be omitted from the lists displayed
    // in the help page... they duplicate baked-in line/assay characteristics displayed in a
    // separate table or required in slightly different form by the Experiment Description file
    // format.
    showMetadataTypes(ASSAY_DIV_SELECTOR, metadataTypes, EddRest.ASSAY_PROPERTY_META_TYPES);
}

function showProtocols() {
    var div: JQuery, table: JQuery, head, body, row;

    // if protocols haven't been loaded yet (e.g. this function is called when measurement units
    // query returns first), just wait until they are...otherwise, we can't distinguish between
    // the "no protocols" case and the "protocols haven't loaded yet" case.
    if (!loadedProtocols) {
        return;
    }

    div = $('#protocols').empty();

    if (protocols.length > 0) {
        table = $('<table>')
            .addClass('figureTable')
            .appendTo(div);

        head = $('<thead>').appendTo(table);

        $('<th>').text('Name').appendTo(head);
        $('<th>').text('Description').appendTo(head);
        $('<th>').text('Default Units').appendTo(head);

        body = $('<tbody>').appendTo(table);

        protocols.forEach((protocol: any): void => {
            var unitsPk: number, unitsStr: string;

            row = $('<tr>').appendTo(body);
            $('<td>').text(protocol.name).appendTo(row);
            $('<td>').text(protocol.description).appendTo(row);
            unitsPk = protocol.default_units;
            unitsStr = 'None';
            if (unitsPk) {
                // if the related query has returned, look up the name of the related default units
                unitsStr = (!$.isEmptyObject(measurementUnits))
                    ? measurementUnits[unitsPk].unit_name
                    : String(unitsPk);
            }
            $('<td>').text(unitsStr).appendTo(row);
        });
    } else {
        div.text('No protocols were found.');
    }
}

function showMetadataTypes(
        divSelector: string,
        metadataTypes: any[],
        omitFromDisplay: string[]): void {
    /* TODO: consider merging with showProtocols() above IF the back-end MetadataType class gets
       refactored to use the Unit class and to have a description. */

    var table: JQuery, head: JQuery, body: JQuery, div: JQuery;
    div = $(divSelector).empty();

    if (metadataTypes) {
        table = $('<table>').addClass('figureTable metadataList').appendTo(div);

        head = $('<thead>').appendTo(table);

        $('<th>').text('Name').appendTo(head);
        $('<th>').text('Units').appendTo(head);

        body = $('<tbody>').appendTo(table);

        metadataTypes.forEach((metadataType: any): boolean => {

            // omit items included in the 'primary characteristics' table
            const omit: boolean = omitFromDisplay.indexOf(metadataType.uuid) >= 0;
            if (omit) {
                return true;
            }

            const row: JQuery = $('<tr>')
                .appendTo(body);
            $('<td>')
                .text(metadataType.type_name)
                .appendTo(row);

            $('<td>')
                .text(metadataType.postfix)
                .appendTo(row);
        });
    } else {
        div.val('No metadata types were found.');
    }
}

function lineErrorHandler(jqXHR, textStatus: string, errorThrown: string): void {
    showLoadFailed(this.LINE_DIV_SELECTOR);
}

function assayErrorHandler(jqXHR, textStatus: string, errorThrown: string): void {
    showLoadFailed(this.ASSAY_DIV_SELECTOR);
}

function measurementUnitsErrorHandler(jqXHR, textStatus: string, errorThrown: string): void {
    return;
}

function showLoadFailed(divSelector: string): void {
    var div: JQuery, span;
    div = $(divSelector);
    div.empty();

    span = $("<span>").text('Unable to load data.').addClass('errorMessage').appendTo(div);

    $('<a>').text(' Retry').on('click', () => {
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
        }
    }).appendTo(span);
}


$(onDocumentReady);
