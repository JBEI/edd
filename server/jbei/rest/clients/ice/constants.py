###################################################################################################
# String constants.py used to communicate with ICE.
# TODO: most/all of these should be enums after upgrading to Python 3
###################################################################################################
# ICE's current automatic limit on results returned in the absence of a specific requested page
# size
DEFAULT_RESULT_LIMIT = 15
DEFAULT_PAGE_NUMBER = 1

ENTRY_TYPE_ARABIDOPSIS = "ARABIDOPSIS"
ENTRY_TYPE_ENTRY = "ENTRY"
ENTRY_TYPE_PART = "PART"
ENTRY_TYPE_PLASMID = "PLASMID"
ENTRY_TYPE_PROTEIN = "PROTEIN"
ENTRY_TYPE_STRAIN = "STRAIN"

ICE_ENTRY_TYPES = (
    ENTRY_TYPE_STRAIN,
    ENTRY_TYPE_PLASMID,
    ENTRY_TYPE_PROTEIN,
    ENTRY_TYPE_ARABIDOPSIS,
)


BLAST_N = "BLAST_N"
TBLAST_X = "TBLAST_X"
BLAST_PROGRAMS = (BLAST_N, TBLAST_X)
RESULT_LIMIT_PARAMETER = "limit"
RESULT_OFFSET_PARAMETER = "offset"

HOST_PYTHON_PARAM = "host"
HOST_JSON_PARAM = "host"
GENOTYPE_PHENOTYPE_PYTHON_PARAM = "genotype_phenotype"

# type-specific keywords
ARABIDOPSIS_DATA_JSON_KEYWORD = "Arabidopsis"
PLASMID_DATA_JSON_KEYWORD = "plasmidData"
PROTEIN_DATA_JSON_KEYWORD = "proteinData"
STRAIN_DATA_JSON_KEYWORD = "strainData"
