// This file is nothing but Typescript declarations, and doesn't technically need to be passed to client browsers.


interface UpdateRecord {
    time:number;    // update timestamp
    user:number;    // User ID
}


// This is what we expect in EDDData.Lines
interface LineRecord {
    id:number;          // Line ID
	name:string;        // Name
    description:string; // Description
    control:boolean;    // Is Control
    replicate:any;      // Line ID of replicate parent Line, or undefined/null
    contact:any;        // Contact Info structure (user_id, text)
    experimenter:number;// Experimenter user ID
	meta:any;      	    // Metadata structure
    strain:number[];    // Strain ID array
	carbon:number[];    // Carbon Sources ID array
	exp:number;		    // Experimenter ID
    modified:UpdateRecord;
    created:UpdateRecord;
    /////// BELOW ARE DEPRECATED ////////
    n:any;
    m:any;
    s:any;
    cs:any;
    md:any;
    dis:any;
    ctrl:any;
    con:any;
}



// This is what we expect in EDDData.Assays
interface AssayRecord {
    id:any;         // Assay ID
	an:string;		// Assay Name
	des:string;		// Description
	dis:boolean;	// Disabled
	md:any;			// Metadata structure
	lid:number;		// Line ID
	pid:number;		// Protocol ID
	met_c:number;	// Metabolites Count
	tra_c:number;	// Transcriptions Count
	pro_c:number;	// Proteins Count
	mea_c:number;	// Measurements Count (sum of all measurement type counts above)
	mod:number;		// Modification epoch
	exp:number;		// Experimenter ID
	measurements:number[];		// All collected measurements associated with Assay
	metabolites:number[];		// Metabolite measurements associated with Assay
	transcriptions:number[];	// Transcription measurements associated with Assay
	proteins:number[];			// Proteins measurements associated with Assay
}



// This is what we expect in EDDData.AssayMeasurements
interface AssayMeasurementRecord {
	aid:number;		// Assay ID
	dis:boolean;	// Disabled
	lid:number;		// Line ID
	mf:number;		// Measurement Type Format
	mt:number;		// Measurement Type ID
	mst:number;		// Measurement Subtype
	mq:number;		// Measurement Type Compartment
	mtdf:number;	// Display Format
	uid:number;		// Y Axis Units ID
	d:any[];		// Data (array of x,y pairs)
}



// This is what we expect in EDDData.MetaboliteTypes
interface MetaboliteTypeRecord {
	name:string;	// Long Name
	sn:string;		// Short Name
	ans:string[];	// Altername Names
	f:string;		// Molecular Formula
	mm:number;		// Molar Mass As Number
	cc:number;		// Carbon Count As Number
	chgn:number;	// Charge As Number
	kstr:string;	// Keywords string (used in autocomplete.ts, prepared in UtilitiesMeta.pm)
	// Structure made by autocomplete.ts that prepares lowercase versions of every other value for every other key in the object.
	_l:any;
	// Made and used by autocomplete.ts.  Both this and _l should be described in an interface derived from this instead.
	selectString:string;
}



// This is what we expect in EDDData.ProteinTypes
interface ProteinTypeRecord {
	name:string;	// Name
}



// This is what we expect in EDDData.GeneTypes
interface GeneTypeRecord {
	name:string;	// Name
}



// Declare interface and EDDData variable for highlight support
interface EDDData {

	currentStudyID:number;
	currentUserID:number;
	parsedPermissions:any[];
	currentUserHasPageWriteAccess:boolean;

    EnabledUserIDs:number[];
    UserIDs:number[];
    Users:{[id:number]:any};

	ProtocolIDs:number[];
	EnabledProtocolIDs:number[];
	Protocols:{[id:number]:any};

    MetaboliteTypeIDs:number[];
    MetaboliteTypes:{[id:number]:MetaboliteTypeRecord};
    ProteinTypeIDs:number[];
    ProteinTypes:{[id:number]:ProteinTypeRecord};
    GeneTypeIDs:number[];
    GeneTypes:{[id:number]:ProteinTypeRecord};

    MetaDataTypeIDs:number[];
    MetaDataTypes:{[id:number]:any};

    MeasurementTypeCompartmentIDs:number[];
    MeasurementTypeCompartments:{[id:number]:any};

    UnitTypeIDs:number[];
    UnitTypes:{[id:number]:any};

    Labelings:any[];

    EnabledStrainIDs:number[];
    StrainIDs:number[];
    Strains:{[id:number]:any};

    EnabledCSourceIDs:number[];
    CSourceIDs:number[];
    CSources:{[id:number]:any};

    ExchangeIDs:number[];
    Exchanges:{[id:number]:any};

    SpeciesIDs:number[];
    Species:any[];

    Studies:{[id:number]:any};
	StudiesSize:number;			// Used in index.ts
 	StudiesStart:number;

	LineIDs:number[];
	EnabledLineIDs:number[];
	Lines:{[id:number]:LineRecord};

	AssayIDs:number[];
	EnabledAssayIDs:number[];
	Assays:{[id:number]:AssayRecord};

	AssayMeasurementIDs:number[];
	AssayMeasurements:{[id:number]:AssayMeasurementRecord};

	// Used in LineTableData.ts.  Should eliminate.
	MetaDataTypesRelevant:any[];
	startMetaData:any[];
};


declare var EDDData:EDDData;