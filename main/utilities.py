
from main.models import Study, Update, MetadataType, MeasurementUnit, \
  Metabolite, Protocol, CarbonSource
from decimal import Decimal
import json


class JSONDecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(JSONDecimalEncoder, self).default(o)


def get_edddata_study (study) :
    """
    Dump of selected database contents used to populate EDDData object on the
    client.  This contains mostly global metadata, but the assays are specific
    to a study..
    """
    mdtypes = MetadataType.objects.all()
    unit_types = MeasurementUnit.objects.all()
    metab_types = Metabolite.objects.all()
    protocols = Protocol.objects.all()
    enabled_protocols = Protocol.objects.filter(active=True)
    carbon_sources = CarbonSource.objects.all()
    assays = study.get_assays()
    strains = study.get_strains_used()
    lines = study.line_set.all()
    # Static metadata
    # XXX should these be stored elsewhere (postgres, other module)?
    measurement_compartments = { i : comp for i, comp in enumerate([
      { "name" : "", "sn" : "" },
      { "name" : "Intracellular/Cytosol (Cy)", "sn" : "IC" },
      { "name" : "Extracellular", "sn" : "EC" },
    ]) }
    media_types = {
        '--' : '-- (No base media used)',
        'LB' : 'LB (Luria-Bertani Broth)',
        'TB' : 'TB (Terrific Broth)',
        'M9' : 'M9 (M9 salts minimal media)',
        'EZ' : 'EZ (EZ Rich)',
    }
    return {
      # compartments
      "MeasurementTypeCompartmentIDs" : measurement_compartments.keys(),
      "MeasurementTypeCompartments" : measurement_compartments,
      # metabolites
      "MetaboliteTypeIDs" : [ mt.id for mt in metab_types ],
      "MetaboliteTypes" : { mt.id : mt.to_json() for mt in metab_types },
      # Assay metadata
      "MetaDataTypeIDs" : [ m.id for m in mdtypes ],
      "MetaDataTypes" : { m.id : m.to_json() for m in mdtypes },
      # Protocols
      "ProtocolIDs" : [ p.id for p in protocols ],
      "EnabledProtocolIDs" : [ p.id for p in enabled_protocols ],
      "Protocols" : { p.id : p.to_json() for p in protocols },
      # Measurement units
      "UnitTypeIDs" : [ ut.id for ut in unit_types ],
      "UnitTypes" : { ut.id : ut.to_json() for ut in unit_types },
      ### Everything below here is study-specific
      # Assays
      "AssayIDs" : [ a.id for a in assays ],
      "EnabledAssayIDs" : [ a.id for a in assays if a.active ],
      "Assays" : { a.id : a.to_json() for a in assays },
      # Strains
      "StrainIDs" : [ s.id for s in strains ],
      "EnabledStrainIDs" : [ s.id for s in strains if s.active ],
      "Strains" : { s.id : s.to_json() for s in strains },
      # Lines
      "LineIDs" : [ l.id for l in lines ],
      "Lines" : { l.id : l.to_json() for l in lines },
    }

def get_edddata_misc () :
    carbon_sources = CarbonSource.objects.all()
    media_types = {
        '--' : '-- (No base media used)',
        'LB' : 'LB (Luria-Bertani Broth)',
        'TB' : 'TB (Terrific Broth)',
        'M9' : 'M9 (M9 salts minimal media)',
        'EZ' : 'EZ (EZ Rich)',
    }
    users = [] # TODO
    return {
      # Carbon sources
      "CSourceIDs" : [ cs.id for cs in carbon_sources ],
      "EnabledCSourceIDs" : [ cs.id for cs in carbon_sources if cs.active ],
      "CSources" : { cs.id : cs.to_json() for cs in carbon_sources },
      # media types
      "MediaTypes" : media_types,
      # Users
      "UserIDs" : [ u.id for u in users ],
      "EnabledUserIDs" : [ u.id for u in users if u.is_active ],
      "Users" : {},
    }
