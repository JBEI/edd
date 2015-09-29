interface UpdateRecord {
    time: number;
    user: number;
}
interface EDDRecord {
    id: number;
    name: string;
    description: string;
    meta: any;
    created: UpdateRecord;
    modified: UpdateRecord;
}
interface LineRecord extends EDDRecord {
    active: boolean;
    control: boolean;
    replicate: any;
    contact: any;
    experimenter: number;
    strain: number[];
    carbon: number[];
    exp: number;
}
interface AssayRecord extends EDDRecord {
    active: boolean;
    lid: number;
    pid: number;
    mod: number;
    exp: number;
    measures: number[];
    metabolites: number[];
    transcriptions: number[];
    proteins: number[];
    general: number[];
}
interface AssayMeasurementRecord {
    id: number;
    assay: number;
    type: number;
    comp: string;
    format: string;
    values: number[][][];
    x_units: number;
    y_units: number;
    aid: number;
    dis: boolean;
    lid: number;
    mf: number;
    mt: number;
    mst: number;
    mq: number;
    mtdf: number;
    uid: number;
    d: any[];
}
interface MeasurementTypeRecord {
    id: number;
    name: string;
    sn: string;
    family: string;
}
interface MetaboliteTypeRecord extends MeasurementTypeRecord {
    ans: string[];
    f: string;
    mm: number;
    cc: number;
    chgn: number;
    kstr: string;
    _l: any;
    selectString: string;
}
interface ProteinTypeRecord extends MeasurementTypeRecord {
}
interface GeneTypeRecord extends MeasurementTypeRecord {
}
interface UnitType {
    name: string;
    altnames: string;
    selectString: string;
}
interface EDDData {
    currentUserID: number;
    AssayMeasurements: {
        [id: number]: AssayMeasurementRecord;
    };
    Assays: {
        [id: number]: AssayRecord;
    };
    CSources: {
        [id: number]: any;
    };
    GeneTypes: {
        [id: number]: ProteinTypeRecord;
    };
    Lines: {
        [id: number]: LineRecord;
    };
    MeasurementTypeCompartments: {
        [id: number]: any;
    };
    MeasurementTypes: {
        [id: number]: MeasurementTypeRecord;
    };
    MediaTypes: {
        [shortform: string]: string;
    };
    MetaboliteTypes: {
        [id: number]: MetaboliteTypeRecord;
    };
    MetaDataTypes: {
        [id: number]: any;
    };
    ProteinTypes: {
        [id: number]: ProteinTypeRecord;
    };
    Protocols: {
        [id: number]: any;
    };
    Strains: {
        [id: number]: any;
    };
    UnitTypes: {
        [id: number]: UnitType;
    };
    Users: {
        [id: number]: any;
    };
    currentStudyID: number;
    parsedPermissions: any[];
    currentUserHasPageWriteAccess: boolean;
    EnabledUserIDs: number[];
    UserIDs: number[];
    MetaboliteTypeIDs: number[];
    ProteinTypeIDs: number[];
    GeneTypeIDs: number[];
    MetaDataTypeIDs: number[];
    MeasurementTypeCompartmentIDs: number[];
    UnitTypeIDs: number[];
    Labelings: any[];
    EnabledCSourceIDs: number[];
    CSourceIDs: number[];
    ExchangeIDs: number[];
    Exchanges: {
        [id: number]: any;
    };
    SpeciesIDs: number[];
    Species: any[];
    Studies: {
        [id: number]: any;
    };
    StudiesSize: number;
    StudiesStart: number;
    EnabledLineIDs: number[];
    EnabledAssayIDs: number[];
    AssayMeasurementIDs: number[];
    MetaDataTypesRelevant: any[];
    startMetaData: any[];
}
declare var EDDData: EDDData;
