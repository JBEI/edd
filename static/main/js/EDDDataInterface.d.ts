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
    compartment: string;
    values: any[];
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
interface EDDData {
    currentStudyID: number;
    currentUserID: number;
    parsedPermissions: any[];
    currentUserHasPageWriteAccess: boolean;
    EnabledUserIDs: number[];
    UserIDs: number[];
    Users: {
        [x: number]: any;
    };
    Protocols: {
        [x: number]: any;
    };
    MeasurementTypes: {
        [x: number]: MeasurementTypeRecord;
    };
    MetaboliteTypeIDs: number[];
    MetaboliteTypes: {
        [x: number]: MetaboliteTypeRecord;
    };
    ProteinTypeIDs: number[];
    ProteinTypes: {
        [x: number]: ProteinTypeRecord;
    };
    GeneTypeIDs: number[];
    GeneTypes: {
        [x: number]: ProteinTypeRecord;
    };
    MetaDataTypeIDs: number[];
    MetaDataTypes: {
        [x: number]: any;
    };
    MeasurementTypeCompartmentIDs: number[];
    MeasurementTypeCompartments: {
        [x: number]: any;
    };
    UnitTypeIDs: number[];
    UnitTypes: {
        [x: number]: any;
    };
    Labelings: any[];
    Strains: {
        [x: number]: any;
    };
    EnabledCSourceIDs: number[];
    CSourceIDs: number[];
    CSources: {
        [x: number]: any;
    };
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
    Lines: {
        [x: number]: LineRecord;
    };
    EnabledAssayIDs: number[];
    Assays: {
        [x: number]: AssayRecord;
    };
    AssayMeasurementIDs: number[];
    AssayMeasurements: {
        [x: number]: AssayMeasurementRecord;
    };
    MetaDataTypesRelevant: any[];
    startMetaData: any[];
}
declare var EDDData: EDDData;
