"use strict";

import "jquery";

import * as EDDRest from "../modules/EDDRest";

function populateMeasurementTypes(mtypes: EDDRest.MeasurementType[]) {
    const list = $("#typesList");
    for (const item of mtypes) {
        $(`<li>${item.type_name}</li>`).appendTo(list);
    }
}

function populateProtocols(protocols: EDDRest.Protocol[]) {
    const list = $("#protocolList");
    for (const item of protocols) {
        $(`<li>${item.name}</li>`).appendTo(list);
    }
}

function populateUnits(units: EDDRest.MeasurementUnits[]) {
    const list = $("#unitList");
    for (const item of units) {
        $(`<li>${item.unit_name}</li>`).appendTo(list);
    }
}

$(() => {
    EDDRest.loadMeasurementTypes({
        "ordering": "type_name",
        "request_all": true,
        "success": populateMeasurementTypes,
        "type_group": "_",
    });
    EDDRest.loadMeasurementUnits({
        "ordering": "unit_name",
        "request_all": true,
        "success": populateUnits,
    });
    EDDRest.loadProtocols({
        "ordering": "name",
        "request_all": true,
        "success": populateProtocols,
    });
});
