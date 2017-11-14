###################################################################################################
# String constants.py used to communicate with ICE.
# TODO: most/all of these should be enums after upgrading to Python 3
###################################################################################################
# ICE's current automatic limit on results returned in the absence of a specific requested page
# size
DEFAULT_RESULT_LIMIT = 15
DEFAULT_PAGE_NUMBER = 1

STRAIN = 'STRAIN'
PLASMID = 'PLASMID'
PART = 'PART'
ARABIDOPSIS = 'ARABIDOPSIS'
ICE_ENTRY_TYPES = (STRAIN,
                   PLASMID,
                   ARABIDOPSIS,)

ARABIDOPSIS_DATA_JSON_KEYWORD = 'Arabidopsis'

BLAST_N = 'BLAST_N'
TBLAST_X = 'TBLAST_X'
BLAST_PROGRAMS = (BLAST_N, TBLAST_X)
RESULT_LIMIT_PARAMETER = 'limit'
RESULT_OFFSET_PARAMETER = 'offset'

HOST_PYTHON_PARAM = 'host'
HOST_JSON_PARAM = 'host'
GENOTYPE_PHENOTYPE_PYTHON_PARAM = 'genotype_phenotype'
STRAIN_DATA_JSON_KEYWORD = 'strainData'
PLASMID_DATA_JSON_KEYWORD = 'plasmidData'