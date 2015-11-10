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
interface MetadataTypeRecord {
    id: number;
    name: string;
    postfix: string;
    default: string;
    context: string;
    gn: string;
    gid: number;
    is: number;
    pre: string;
    ll: boolean;
    pl: boolean;
}
interface ProtocolRecord extends EDDRecord {
}
interface StrainRecord extends EDDRecord {
    registry_id: string;
    registry_url: string;
}
interface CarbonSourceRecord extends EDDRecord {
    labeling: string;
    volume: number;
    initials: string;
}
interface UserRecord {
    id: number;
    uid: string;
    email: string;
    initials: string;
    name: string;
    institution: string;
    description: string;
    lastname: string;
    firstname: string;
    disabled: boolean;
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
        [id: number]: CarbonSourceRecord;
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
    MetaboliteTypes: {
        [id: number]: MetaboliteTypeRecord;
    };
    MetaDataTypes: {
        [id: number]: MetadataTypeRecord;
    };
    ProteinTypes: {
        [id: number]: ProteinTypeRecord;
    };
    Protocols: {
        [id: number]: ProtocolRecord;
    };
    Strains: {
        [id: number]: StrainRecord;
    };
    UnitTypes: {
        [id: number]: UnitType;
    };
    Users: {
        [id: number]: UserRecord;
    };
    MediaTypes: {
        [shortform: string]: string;
    };
}
declare var EDDData: EDDData;
