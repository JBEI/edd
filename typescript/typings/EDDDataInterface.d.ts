// This file is nothing but Typescript declarations, and doesn't technically need to be passed
// to client browsers.

interface UpdateRecord {
    time: number; // update timestamp
    by: number; // User ID
}

interface EDDRecord {
    pk: number; // object ID
    uuid: string;
    name: string; // object name
    description: string; // object description
    active: boolean;
    metadata: any; // Metadata structure
    created: UpdateRecord;
    updated: UpdateRecord;
}

interface RecordList<U> {
    [id: number]: U;
}

interface LineRecord extends EDDRecord {
    contact: number;
    control: boolean;
    experimenter: number;
    strains: StrainRecord[];
    // optional property, only returned when querying replicates=True
    replicate?: string;
    study: number;

    // optional properties, set only in graphing code, not received from backend
    color?: string;
    // optional properties, set only in table code
    selected?: boolean;
    replicate_ids?: number[];
    replicate_names?: string[];
}

interface AssayRecord extends EDDRecord {
    count: number;
    experimenter: number; // Experimenter ID
    line: number; // Line ID
    protocol: number; // Protocol ID
    study: number;

    // optional properties, set only in table code
    // measurements?: MeasurementRecord[];
    selected?: boolean;

    // TODO: remove; kept for compatibility with legacy import
    id?: number; // using pk with REST, id used in old /edddata URL
}

interface EDDValue {
    x: number[];
    y: number[];
}

interface MeasurementRecord {
    pk: number; // Measurement ID
    assay: number; // Assay ID
    type: number; // MeasurementTypeRecord ID
    compartment: string; // see main/models.py:Measurement.Compartment for enum choices
    format: string; // see main/models.py:Measurement.Format for enum choices
    values: EDDValue[]; // array of data values
    x_units: number;
    y_units: number;

    // optional properties, set only in table code
    selected?: boolean;
}

interface CompartmentRecord {
    pk: string;
    name: string;
    code: string;
}

/**
 * Information about a type of measurement stored in EDD.
 */
interface MeasurementTypeRecord {
    /** Internal ID / primary key. */
    pk: number;
    /** External UUID / alternate primary key. */
    uuid: string;
    /** Display name for the measurement type. */
    name: string;
    /**
     * Enum string for class of measurement:
     *  - "m": metabolite
     *  - "g": gene / transcript
     *  - "p": protein
     *  - "_": general / other
     */
    family: string;
    /** (optional) PubChem Compund ID, if available. */
    cid?: number;
    /** (optional) UniProt Accession ID, if available. */
    accession?: string;
}

/**
 * Parts of a MeasurementRecord that go beyond just the type. This includes
 * compartment, so that filtering code can distinguish between types measured
 * in differing compartments. Currently, only metabolites have a compartment,
 * all other families of types should match only on type.
 */
interface MeasurementClass {
    compartment: CompartmentRecord;
    measurementType: MeasurementTypeRecord;
}

interface UnitType {
    pk: number;
    display: boolean;
    name: string;
}

interface MetadataTypeRecord {
    description: string;
    default_value: string;
    for_context: "A" | "L" | "S";
    group: string;
    input_type: string;
    pk: number;
    postfix: string;
    prefix: string;
    type_i18n: string;
    type_name: string;
    uuid: string;
}

interface ProtocolRecord {
    pk: number;
    uuid: string;
    name: string;
    external_url: string;
    active: boolean;
    destructive: boolean;
    sbml_category: string;
    created: UpdateRecord;
    updated: UpdateRecord;
}

interface StrainRecord {
    name: string;
    registry_id: string; // a UUID
    registry_url: string;
}

interface UserRecord {
    pk: number;
    username: string;
    initials?: string;
    email: string;
    first_name: string;
    last_name: string;
    is_active: boolean;
}

interface EDDData {
    // Can be null/undefined when no Study is chosen
    currentStudyID?: number;
    Assays?: RecordList<AssayRecord>;
    Lines?: RecordList<LineRecord>;
}

interface StudyID {
    pk: number;
    slug: string;
    uuid: string;
}

interface AccessSpec {
    study: StudyID;
    urlAssay: string;
    urlCompartment: string;
    urlLine: string;
    urlMeasurement: string;
    urlMetadata: string;
    urlProtocol: string;
    urlType: string;
    urlUnit: string;
    urlUser: string;
}

interface RestPageInfo<T> {
    count: number;
    next?: string;
    previous?: string;
    results: T[];
}

declare let EDDData: EDDData;
