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
        [x: number]: AssayMeasurementRecord;
    };
    Assays: {
        [x: number]: AssayRecord;
    };
    CSources: {
        [x: number]: any;
    };
    GeneTypes: {
        [x: number]: ProteinTypeRecord;
    };
    Lines: {
        [x: number]: LineRecord;
    };
    MeasurementTypeCompartments: {
        [x: number]: any;
    };
    MeasurementTypes: {
        [x: number]: MeasurementTypeRecord;
    };
    MediaTypes: {
        [x: string]: string;
    };
    MetaboliteTypes: {
        [x: number]: MetaboliteTypeRecord;
    };
    MetaDataTypes: {
        [x: number]: any;
    };
    ProteinTypes: {
        [x: number]: ProteinTypeRecord;
    };
    Protocols: {
        [x: number]: any;
    };
    Strains: {
        [x: number]: any;
    };
    UnitTypes: {
        [x: number]: UnitType;
    };
    Users: {
        [x: number]: any;
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
        [x: number]: any;
    };
    SpeciesIDs: number[];
    Species: any[];
    Studies: {
        [x: number]: any;
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
