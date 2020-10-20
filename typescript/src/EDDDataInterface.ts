// This file is nothing but Typescript declarations, and doesn't technically need to be passed
// to client browsers.

interface UpdateRecord {
    time: number; // update timestamp
    user: number; // User ID
}

interface EDDRecord {
    id: number; // object ID
    name: string; // object name
    description: string; // object description
    meta: any; // Metadata structure
    created: UpdateRecord;
    modified: UpdateRecord;
}

interface RecordList<U> {
    [id: number]: U;
}

interface BasicContact {
    user_id: number;
    extra: string;
}

// This is what we expect in EDDData.Lines
interface LineRecord extends EDDRecord {
    active: boolean; // Active line
    control: boolean; // Is Control
    // contact can vary depending on source call
    contact: number | UserRecord | BasicContact;
    // experimenter can vary depending on source call
    experimenter: number | UserRecord | BasicContact;
    strain: number[]; // Strain ID array

    // optional properties, set only in graphing code, not received from backend
    identifier?: string; // HTML ID for the line filter checkbox
    color?: string;
    // optional properties, set only in line table code
    selected?: boolean;
    replicate_ids?: number[];
    replicate_names?: string[];
}

// This is what we expect in EDDData.Assays
interface AssayRecord extends EDDRecord {
    // this section comes from server endpoint
    active: boolean; // Active assay
    count: number;
    experimenter: number; // Experimenter ID
    lid: number; // Line ID
    pid: number; // Protocol ID
    study: number;

    // this section gets added on frontend
    measures?: number[]; // All collected measurements associated with Assay
    metabolites?: number[]; // Metabolite measurements associated with Assay
    transcriptions?: number[]; // Transcription measurements associated with Assay
    proteins?: number[]; // Proteins measurements associated with Assay
    general?: number[]; // Measurements for everything else
}

// This is what we expect in EDDData.AssayMeasurements
interface MeasurementRecord {
    id: number; // Measurement ID
    assay: number; // Assay ID
    type: number; // MeasurementTypeRecord ID
    comp: string; // see main/models.py:Measurement.Compartment for enum choices
    format: string; // see main/models.py:Measurement.Format for enum choices
    values: number[][][]; // array of data values
    x_units: number;
    y_units: number;
}

interface MeasurementCompartmentRecord {
    id: string;
    name: string;
    code: string;
}

interface MeasurementTypeRecord {
    id: number; // Type ID
    uuid: string; // Type UUID
    name: string; // Type name
    family: string; // 'm', 'g', 'p' for metabolite, gene, protien
}

interface UnitType {
    id: number;
    name: string;
}

interface MetadataTypeRecord {
    id: number;
    name: string;
    i18n: string;
    input_type: string;
    input_size: number;
    prefix: string;
    postfix: string;
    default: string;
    context: string; // maybe switch to an enum
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ProtocolRecord extends EDDRecord {}

interface StrainRecord extends EDDRecord {
    registry_id: string; // a UUID
    registry_url: string;
}

interface CarbonSourceRecord extends EDDRecord {
    labeling: string;
    volume: number;
}

interface UserRecord {
    id: number;
    uid: string;
    email: string;
    initials: string;
    name: string;
    lastname: string;
    firstname: string;
    disabled: boolean;
}

interface AssayValues {
    // {ID: [[[x1], [y1]], [[x2], [y2]], ... ]}
    data: { [measurement_id: number]: number[][][] };
    measures: MeasurementRecord[];
    types: RecordList<MeasurementTypeRecord>;
    total_measures: { [assay_id: number]: number };
}

// Declare interface and EDDData variable for highlight support
interface EDDData {
    // Can be null/undefined when no Study is chosen
    currentStudyID?: number;
    // Can be null/undefined when no Study is chosen
    valueLinks?: string[];
    AssayMeasurements: RecordList<MeasurementRecord>;
    Assays: RecordList<AssayRecord>;
    CSources: RecordList<CarbonSourceRecord>;
    Lines: RecordList<LineRecord>;
    MeasurementTypeCompartments: RecordList<MeasurementCompartmentRecord>;
    MeasurementTypes: RecordList<MeasurementTypeRecord>;
    MetaDataTypes: RecordList<MetadataTypeRecord>;
    Protocols: RecordList<ProtocolRecord>;
    Strains: RecordList<StrainRecord>;
    UnitTypes: RecordList<UnitType>;
    Users: RecordList<UserRecord>;
}

declare let EDDData: EDDData;
