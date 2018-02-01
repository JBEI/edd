import { EddRest } from "../modules/EDDRest"
import * as $ from "jquery"
import "bootstrap-loader"

// This module contains code for dynamically loading lists of metadata types into the help page
// for Experiment Description files.
module ExperimentDescriptionHelp {
    var ASSAY_DIV_SELECTOR = '#assayMetadataTypes';
    var LINE_DIV_SELECTOR = '#lineMetadataTypes';
    var PROTOCOL_DIV_SELECTOR = '#protocols';

    var protocols = [];

    var measurementUnits = {};

    var loadedProtocols = false;

    // Metadata types present in the database that should be omitted from the lists displayed
    // in the help page... they duplicate baked-in line/assay characteristics displayed in a
    // separate table or required in slightly different form by the Experiment Description file
    // format.
    var omitLineMetadataTypes = ['Line Name', 'Line Description', 'Line Contact',
        'Line Experimenter', 'Strain(s)'];

    var omitAssayMetadataTypes = ['Assay Description', 'Assay Experimenter', 'Assay Name'];

    // As soon as the window load signal is sent, call back to the server for the set of reference
    // records that will be used to disambiguate labels in imported data.
    export function onDocumentReady(): void {
        $('.disclose').find('.discloseLink').on('click', disclose);

        loadAllLineMetadataTypes();
        loadAllAssayMetadataTypes();
        loadAllProtocols();
        loadAllMeasurementUnits();
    }

    export function disclose() {
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
                'ordering': 'name'
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
            }
        )
    }

    function measurementUnitsSuccessHandler(measurementUnitsLoaded: any[]): void {

        // cache measurement units as a dictionary of pk -> value so we can easily look them up
        measurementUnits = {};
        measurementUnitsLoaded.forEach((measurementUnit: any) => {
            var pk: number = measurementUnit['pk'];
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
        showMetadataTypes(LINE_DIV_SELECTOR, metadataTypes, omitLineMetadataTypes);
    }

    function assayMetaSuccessHandler(metadataTypes: any[]) {
        showMetadataTypes(ASSAY_DIV_SELECTOR, metadataTypes, omitAssayMetadataTypes);
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
                var unitsObj: any, unitsPk: number, unitsStr: string;

                row = $('<tr>').appendTo(body);
                $('<td>').text(protocol['name']).appendTo(row);
                $('<td>').text(protocol['description']).appendTo(row);
                unitsPk = protocol['default_units'];
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

    function showMetadataTypes(divSelector: string, metadataTypes: any[],
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
                var typeName: string, unitsStr: string, omit: boolean, row: JQuery;
                typeName = metadataType['type_name'];

                // omit items included in the 'primary characteristics' table
                omit = omitFromDisplay.indexOf(typeName) >= 0;
                if (omit) {
                    return true;
                }

                row = $('<tr>').appendTo(body);
                $('<td>').text(typeName).appendTo(row);

                unitsStr = metadataType['postfix'];
                $('<td>').text(unitsStr).appendTo(row);
            });
        } else {
            div.val('No metadata types were found.')
        }
    }

    function lineErrorHandler(jqXHR, textStatus: string, errorThrown: string): void {
        showLoadFailed(this.LINE_DIV_SELECTOR);
    }

    function assayErrorHandler(jqXHR, textStatus: string, errorThrown: string): void {
        showLoadFailed(this.ASSAY_DIV_SELECTOR);
    }

    function measurementUnitsErrorHandler(jqXHR, textStatus: string, errorThrown: string): void {
        console.error('Error loading measurement units: ', textStatus, ' ', errorThrown);
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
                    console.error('Unsupported value ', divSelector);
            }
        }).appendTo(span);
    }
}

$(ExperimentDescriptionHelp.onDocumentReady);


