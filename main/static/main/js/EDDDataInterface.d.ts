interface UpdateRecord {
    time: number;
    user: number;
}
interface LineRecord {
    id: number;
    name: string;
    description: string;
    active: boolean;
    control: boolean;
    replicate: any;
    contact: any;
    experimenter: number;
    meta: any;
    strain: number[];
    carbon: number[];
    exp: number;
    modified: UpdateRecord;
    created: UpdateRecord;
    n: any;
    m: any;
    s: any;
    cs: any;
    md: any;
    dis: any;
    ctrl: any;
    con: any;
}
interface AssayRecord {
    id: any;
    an: string;
    des: string;
    dis: boolean;
    md: any;
    lid: number;
    pid: number;
    met_c: number;
    tra_c: number;
    pro_c: number;
    mea_c: number;
    mod: number;
    exp: number;
    measurements: number[];
    metabolites: number[];
    transcriptions: number[];
    proteins: number[];
}
interface AssayMeasurementRecord {
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
interface MetaboliteTypeRecord {
    name: string;
    sn: string;
    ans: string[];
    f: string;
    mm: number;
    cc: number;
    chgn: number;
    kstr: string;
    _l: any;
    selectString: string;
}
interface ProteinTypeRecord {
    name: string;
}
interface GeneTypeRecord {
    name: string;
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
    ProtocolIDs: number[];
    EnabledProtocolIDs: number[];
    Protocols: {
        [x: number]: any;
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
    EnabledStrainIDs: number[];
    StrainIDs: number[];
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
    LineIDs: number[];
    EnabledLineIDs: number[];
    Lines: {
        [x: number]: LineRecord;
    };
    AssayIDs: number[];
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
