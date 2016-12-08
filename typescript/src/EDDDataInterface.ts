// This file is nothing but Typescript declarations, and doesn't technically need to be passed
// to client browsers.


interface UpdateRecord {
    time:number;    // update timestamp
    user:number;    // User ID
}


interface EDDRecord {
    id:number;          // object ID
    name:string;        // object name
    description:string; // object description
    meta:any;           // Metadata structure
    created:UpdateRecord;
    modified:UpdateRecord;
}


// This is what we expect in EDDData.Lines
interface LineRecord extends EDDRecord {
    active:boolean;      // Active line
    control:boolean;     // Is Control
    replicate:any;       // Line ID of replicate parent Line, or undefined/null
    contact:any;         // Contact Info structure (user_id, text)
    experimenter:number; // Experimenter user ID
    strain:number[];     // Strain ID array
    carbon:number[];     // Carbon Sources ID array
    exp:number;          // Experimenter ID
}



// This is what we expect in EDDData.Assays
interface AssayRecord extends EDDRecord {
    active:boolean;     // Active assay
    lid:number;         // Line ID
    pid:number;         // Protocol ID
    mod:number;         // Modification epoch
    exp:number;         // Experimenter ID
    measures:number[];  // All collected measurements associated with Assay
    metabolites:number[];       // Metabolite measurements associated with Assay
    transcriptions:number[];    // Transcription measurements associated with Assay
    proteins:number[];          // Proteins measurements associated with Assay
    general: number[];          // Measurements for everything else
    count: number;
}



// This is what we expect in EDDData.AssayMeasurements
interface AssayMeasurementRecord {
    id:number;             // Measurement ID
    assay:number;          // Assay ID
    type:number;           // MeasurementTypeRecord ID
    comp:string;           // see main/models.py:MeasurementCompartment for enum choices
    format:string;         // see main/models.py:MeasurementFormat for enum choices
    values:number[][][];   // array of data values
    x_units:number;
    y_units:number;
    /////// BELOW ARE DEPRECATED ////////
    aid:number;     // Assay ID
    dis:boolean;    // Disabled
    lid:number;     // Line ID
    mf:number;      // Measurement Type Format
    mt:number;      // Measurement Type ID
    mst:number;     // Measurement Subtype
    mq:number;      // Measurement Type Compartment
    mtdf:number;    // Display Format
    uid:number;     // Y Axis Units ID
    d:any[];        // Data (array of x,y pairs)
}



interface MeasurementTypeRecord {
    id:number;      // Type ID
    name:string;    // Type name
    sn:string;      // Short-form name
    family:string;  // 'm', 'g', 'p' for metabolite, gene, protien
}

// This is what we expect in EDDData.MetaboliteTypes
interface MetaboliteTypeRecord extends MeasurementTypeRecord {
    ans:string[];   // Altername Names
    f:string;       // Molecular Formula
    mm:number;      // Molar Mass As Number
    cc:number;      // Carbon Count As Number
    chgn:number;    // Charge As Number
    kstr:string;    // Keywords string (used in autocomplete.ts, prepared in UtilitiesMeta.pm)
    // Structure made by autocomplete.ts that prepares lowercase versions of every other value
    // for every other key in the object.
    _l:any;
    // Made and used by autocomplete.ts.  Both this and _l should be described in an interface
    // derived from this instead.
    selectString:string;
}



// This is what we expect in EDDData.ProteinTypes
interface ProteinTypeRecord extends MeasurementTypeRecord {
}



// This is what we expect in EDDData.GeneTypes
interface GeneTypeRecord extends MeasurementTypeRecord {
}


interface UnitType {
    name:string;

    /////// BELOW ARE DEPRECATED ////////
    altnames:string;
    selectString:string;
}


interface MetadataTypeRecord {
    id: number;
    name: string;
    postfix: string;
    default: string;
    context: string;  // maybe switch to an enum

    /////// TODO: these values should be sent too ////////
    // i18n: string;
    // input_type: string;

    /////// TODO: DEPRECATE BELOW, USE BETTER VARIABLE NAMES ///////
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
    registry_id: string;  // a UUID
    registry_url: string;
}


interface CarbonSourceRecord extends EDDRecord {
    labeling: string;
    volume: number;
    // TODO: this is redundant, remove it
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



// Declare interface and EDDData variable for highlight support
interface EDDData {
    currentUserID: number;
    currentStudyID: number;    // Can be null/undefined when no Study is chosen
    currentStudyWritable: boolean;
    Studies:{[id:number]: any};
    AssayMeasurements:{[id:number]: AssayMeasurementRecord};
    Assays:{[id:number]: AssayRecord};
    CSources:{[id:number]: CarbonSourceRecord};
    GeneTypes:{[id:number]: ProteinTypeRecord};
    Lines:{[id:number]: LineRecord};
    MeasurementTypeCompartments:{[id:number]: any};
    MeasurementTypes:{[id:number]: MeasurementTypeRecord};
    MetaboliteTypes:{[id:number]: MetaboliteTypeRecord};
    MetaDataTypes:{[id:number]: MetadataTypeRecord};
    ProteinTypes:{[id:number]: ProteinTypeRecord};
    Protocols:{[id:number]: ProtocolRecord};
    Strains:{[id:number]: StrainRecord};
    UnitTypes:{[id:number]: UnitType};
    Users:{[id:number]: UserRecord};

    Exchange:any;
    Species:any;

    // TODO: is this used anymore?
    MediaTypes:{[shortform:string]: string};
};


/* tslint:disable:no-unused-variable */
declare var EDDData:EDDData;
/* tslint:enable:no-unused-variable */
