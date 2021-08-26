// This file contains utility functions for use in querying EDD's REST API.

/* MetadataType API query parameter values */
export const LINE_METADATA_CONTEXT = "L";
export const ASSAY_METADATA_CONTEXT = "A";

/* System metadata types that may have to be explicitly-referenced in the UI */
export const CARBON_SRC_META_UUID = "4ddaf92a-1623-4c30-aa61-4f7407acfacc";
export const CONTROL_META_UUID = "8aa26735-e184-4dcd-8dd1-830ec240f9e1";
export const LINE_CONTACT_META_UUID = "13672c8a-2a36-43ed-928f-7d63a1a4bd51";
export const LINE_DESCRIPTION_META_UUID = "5fe84549-9a97-47d2-a897-8c18dd8fd34a";
export const LINE_EXPERIMENTER_META_UUID = "974c3367-f0c5-461d-bd85-37c1a269d49e";
export const LINE_NAME_META_UUID = "b388bcaa-d14b-4d7f-945e-a6fcb60142f2";
export const LINE_REPLICATE_META_UUID = "71f5cd94-4dd4-45ca-a926-9f0717631799";
export const LINE_STRAINS_META_UUID = "292f1ca7-30de-4ba1-89cd-87d2f6291416";

const ASSAY_DESCRIPTION_META_UUID = "4929a6ad-370c-48c6-941f-6cd154162315";
const ASSAY_EXPERIMENTER_META_UUID = "15105bee-e9f1-4290-92b2-d7fdcb3ad68d";
const ASSAY_NAME_META_UUID = "33125862-66b2-4d22-8966-282eb7142a45";

// Metadata types present in the database that should be omitted from user-displayed lists in
// contexts where separate display is available for line attributes.
export const LINE_PROPERTY_META_UUIDS = [
    LINE_NAME_META_UUID,
    LINE_DESCRIPTION_META_UUID,
    LINE_CONTACT_META_UUID,
    LINE_EXPERIMENTER_META_UUID,
    LINE_STRAINS_META_UUID,
];

export const ASSAY_PROPERTY_META_TYPES = [
    ASSAY_DESCRIPTION_META_UUID,
    ASSAY_EXPERIMENTER_META_UUID,
    ASSAY_NAME_META_UUID,
];

type GenericRecord = Record<string, any>;

interface EDDRestOptions {
    ordering?: string;
    request_all?: boolean;
    wait?: () => void;
    page_size?: number;
    received_so_far?: GenericRecord[];
    page?: number;
    success?: (records: GenericRecord[]) => void;
    error?: JQuery.Ajax.ErrorCallback<any>;
}

export interface MeasurementType {
    pk: number;
    uuid: any;
    type_name: string;
    type_group: string;
}

export interface MeasurementUnits {
    pk: number;
    type_group: string;
    display: boolean;
    alternate_names: string;
    unit_name: string;
}

export interface Protocol {
    pk: number;
    uuid: any;
    name: string;
    description: string;
}

/**
 * Initiates one or more asynchronous requests to load Protocols from the REST API back
 * end.
 */
export function loadProtocols(options: EDDRestOptions): void {
    const requestAll = options.request_all === true;
    const pageNum = options.page || 1;
    if (options.wait) {
        options.wait();
    }
    // build up a dictionary of query parameters based on optional function inputs
    const queryParams = {};
    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);
    let receivedSoFar = options.received_so_far || [];
    // query the REST API for requested metadata types
    jQuery.ajax("/rest/protocols/", {
        "dataType": "json",
        "data": queryParams,
        "success": (responseJson) => {
            receivedSoFar = receivedSoFar.concat(responseJson.results);
            // if results had to be paginated and aren't all received yet, make recursive
            // call(s) to get the rest
            if (requestAll && responseJson.next !== null) {
                options.received_so_far = receivedSoFar;
                options.page = pageNum + 1;
                loadProtocols(options);
            } else if (options.success) {
                options.success(receivedSoFar);
            }
        },
        "error": options.error,
    });
}

interface MetaTypeOptions extends EDDRestOptions {
    context?: string;
}

/**
 * Initiates one or more asynchronous requests to load MetadataTypes from the REST API back
 * end.
 */
export function loadMetadataTypes(options: MetaTypeOptions): void {
    const requestAll = options.request_all === true;
    if (options.wait) {
        options.wait();
    }
    // build up a dictionary of query parameters based on optional function inputs
    const queryParams: any = {};
    if (options.context) {
        queryParams.for_context = options.context;
    }
    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);
    let receivedSoFar = options.received_so_far || [];
    // query the REST API for requested metadata types
    jQuery.ajax("/rest/metadata_types/", {
        "dataType": "json",
        "data": queryParams,
        "success": function (responseJson) {
            receivedSoFar = receivedSoFar.concat(responseJson.results);
            // if results had to be paginated and aren't all received yet,
            // make a recursive call to get the rest
            if (requestAll && responseJson.next !== null) {
                options.received_so_far = receivedSoFar;
                options.page = (options.page || 1) + 1;
                loadMetadataTypes(options);
            } else if (options.success) {
                options.success(receivedSoFar);
            }
        },
        "error": options.error,
    });
}

interface MTypeOptions extends EDDRestOptions {
    type_name?: string;
    type_group?: string;
}

/**
 * Initiates one or more asynchronous requests to load MeasurementTypes from the REST API back
 * end.
 */
export function loadMeasurementTypes(options: MTypeOptions): void {
    let success: any, error: any, pageNum;

    const requestAll: boolean = options.request_all === true;

    if (options.wait) {
        options.wait();
    }

    // build up a dictionary of query parameters based on optional function inputs
    const queryParams: any = {};
    const typeName = options.type_name;
    if (typeName) {
        queryParams.type_name = typeName;
    }
    const typeGroup = options.type_group;
    if (typeGroup) {
        queryParams.type_group = typeGroup;
    }

    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);

    let receivedSoFar = options.received_so_far || [];

    // query the REST API for requested metadata types
    jQuery.ajax("/rest/types/", {
        "dataType": "json",
        "data": queryParams,
        "success": function (responseJson) {
            const singlePageResults: any[] = responseJson.results;
            receivedSoFar = receivedSoFar.concat(singlePageResults);

            // if results had to be paginated and aren't all received yet, make a
            // recursive call to get the rest
            if (requestAll && responseJson.next !== null) {
                options.received_so_far = receivedSoFar;
                pageNum = options.page || 1;
                options.page = pageNum + 1;
                loadMeasurementTypes(options);
            } else {
                success = options.success;
                success(receivedSoFar);
            }
        },
        "error": (jqXHR, textStatus: string, errorThrown: string) => {
            error = options.error;
            if (error) {
                error(jqXHR, textStatus, errorThrown);
            }
        },
    });
}

interface UnitOptions extends EDDRestOptions {
    unit_name?: string;
    type_group?: string;
    alternate_names?: string;
}

/**
 * Initiates one or more asynchronous requests to load MeasurementUnits
 * from the REST API back end.
 */
export function loadMeasurementUnits(options: UnitOptions): void {
    const requestAll = options.request_all === true;
    if (options.wait) {
        options.wait();
    }
    // build up a dictionary of query parameters based on optional function inputs
    const queryParams: any = {};
    if (options.unit_name) {
        queryParams.unit_name = options.unit_name;
    }
    if (options.alternate_names) {
        queryParams.alternate_names = options.alternate_names;
    }
    if (options.type_group) {
        queryParams.type_group = options.type_group;
    }
    insertPaginationParams(options, queryParams);
    insertSortOrderParam(options, queryParams);
    let receivedSoFar = options.received_so_far || [];
    // query the REST API for requested metadata types
    jQuery.ajax("/rest/units/", {
        "dataType": "json",
        "data": queryParams,
        "success": function (responseJson) {
            receivedSoFar = receivedSoFar.concat(responseJson.results);
            // if results had to be paginated and aren't all received yet,
            // make a recursive call to get the rest
            if (requestAll && responseJson.next !== null) {
                options.received_so_far = receivedSoFar;
                options.page = (options.page || 1) + 1;
                loadMeasurementUnits(options);
            } else if (options.success) {
                options.success(receivedSoFar);
            }
        },
        "error": options.error,
    });
}

function insertPaginationParams(options: EDDRestOptions, queryParams: any) {
    const pageNum = options.page || 1;
    if (pageNum && pageNum !== 1) {
        queryParams.page = pageNum;
    }
    if (options.page_size) {
        queryParams.page_size = options.page_size;
    }
}

function insertSortOrderParam(options: EDDRestOptions, queryParams: any) {
    if (options.ordering) {
        queryParams.ordering = options.ordering;
    }
}
