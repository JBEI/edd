# coding: utf-8
from __future__ import absolute_import, unicode_literals

"""
Models describing measurement types.
"""

import logging
import re

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Func
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _, ugettext as _u
from uuid import uuid4

from .common import EDDSerialize
from .fields import VarCharField
from .update import Datasource


logger = logging.getLogger(__name__)


@python_2_unicode_compatible
class MeasurementType(models.Model, EDDSerialize):
    """ Defines the type of measurement being made. A generic measurement only has name and short
        name; if the type is a metabolite, the metabolite attribute will contain additional
        metabolite info. """
    class Meta:
        db_table = 'measurement_type'

    class Group(object):
        """ Note that when a new group type is added here, code will need to be updated elsewhere,
            including the Javascript/Typescript front end.
            Look for the string 'MeasurementGroupCode' in comments."""
        GENERIC = '_'
        METABOLITE = 'm'
        GENEID = 'g'
        PROTEINID = 'p'
        PHOSPHOR = 'h'
        GROUP_CHOICE = (
            (GENERIC, _('Generic')),
            (METABOLITE, _('Metabolite')),
            (GENEID, _('Gene Identifier')),
            (PROTEINID, _('Protein Identifer')),
            (PHOSPHOR, _('Phosphor')),
        )

    type_name = models.CharField(
        help_text=_('Name of this Measurement Type.'),
        max_length=255,
        verbose_name=_('Measurement Type'),
    )
    short_name = models.CharField(
        blank=True,
        help_text=_('Short name used as an ID for the Measurement Type in SBML output.'),
        max_length=255,
        null=True,
        verbose_name=_('Short Name'),
    )
    type_group = models.CharField(
        choices=Group.GROUP_CHOICE,
        default=Group.GENERIC,
        help_text=_('Class of data for this Measurement Type.'),
        max_length=8,
        verbose_name=_('Type Group'),
    )
    type_source = models.ForeignKey(
        Datasource,
        blank=True,
        help_text=_('Datasource used for characterizing this Measurement Type.'),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_('Datasource'),
    )
    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_('Unique ID for this Measurement Type.'),
        unique=True,
        verbose_name=_('UUID'),
    )
    alt_names = ArrayField(
        VarCharField(),
        default=list,
        help_text=_('Alternate names for this Measurement Type.'),
        verbose_name=_('Synonyms'),
    )

    def save(self, *args, **kwargs):
        if self.uuid is None:
            self.uuid = uuid4()
        super(MeasurementType, self).save(*args, **kwargs)

    def to_solr_value(self):
        return '%(id)s@%(name)s' % {'id': self.pk, 'name': self.type_name}

    def to_solr_json(self):
        """ Convert the MeasurementType model to a dict structure formatted for Solr JSON. """
        source_name = None
        # Check if this is coming from a child MeasurementType, and ref the base type
        if hasattr(self, 'measurementtype_ptr'):
            mtype = self.measurementtype_ptr
        # check for annotated source attribute on self and base type
        if hasattr(self, '_source_name'):
            source_name = self._source_name
        elif hasattr(mtype, '_source_name'):
            source_name = mtype._source_name
        elif self.type_source:
            source_name = self.type_source.name
        return {
            'id': self.id,
            'uuid': self.uuid,
            'name': self.type_name,
            'code': self.short_name,
            'family': self.type_group,
            # use the annotated attr if present, otherwise must make a new query
            'source': source_name,
        }

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "uuid": self.uuid,
            "name": self.type_name,
            "sn": self.short_name,
            "family": self.type_group,
        }

    def __str__(self):
        return self.type_name

    def is_metabolite(self):
        return self.type_group == MeasurementType.Group.METABOLITE

    def is_protein(self):
        return self.type_group == MeasurementType.Group.PROTEINID

    def is_gene(self):
        return self.type_group == MeasurementType.Group.GENEID

    def is_phosphor(self):
        return self.type_group == MeasurementType.Group.PHOSPHOR

    def export_name(self):
        return self.type_name

    # TODO: replace use of this in tests, then remove
    @classmethod
    def create_protein(cls, type_name, short_name=None):
        return cls.objects.create(
            short_name=short_name,
            type_group=MeasurementType.Group.PROTEINID,
            type_name=type_name,
        )


@python_2_unicode_compatible
class Metabolite(MeasurementType):
    """ Defines additional metadata on a metabolite measurement type; charge, carbon count, molar
        mass, and molecular formula.
        TODO: aliases for metabolite type_name/short_name
        TODO: datasource; BiGG vs JBEI-created records
        TODO: links to kegg files? """
    class Meta:
        db_table = 'metabolite'
    charge = models.IntegerField(
        help_text=_('The charge of this molecule.'),
        verbose_name=_('Charge'),
    )
    carbon_count = models.IntegerField(
        help_text=_('Count of carbons present in this molecule.'),
        verbose_name=_('Carbon Count'),
    )
    molar_mass = models.DecimalField(
        decimal_places=5,
        help_text=_('Molar mass of this molecule.'),
        max_digits=16,
        verbose_name=_('Molar Mass'),
    )
    molecular_formula = models.TextField(
        help_text=_('Formula string defining this molecule.'),
        verbose_name=_('Formula'),
    )
    smiles = VarCharField(
        blank=True,
        help_text=_('SMILES string defining molecular structure.'),
        null=True,
        verbose_name=_('SMILES'),
    )
    pubchem_cid = models.IntegerField(
        blank=True,
        help_text=_('Unique PubChem identifier'),
        null=True,
        unique=True,
        verbose_name=_('PubChem CID'),
    )
    id_map = ArrayField(
        VarCharField(),
        default=list,
        help_text=_('List of identifiers mapping to external chemical datasets.'),
        verbose_name=_('External IDs'),
    )
    tags = ArrayField(
        VarCharField(),
        default=list,
        help_text=_('List of tags for classifying this molecule.'),
        verbose_name=_('Tags'),
    )

    carbon_pattern = re.compile(r'C(\d*)')
    pubchem_pattern = re.compile(r'cid:(\d+)')

    def __str__(self):
        return self.type_name

    def is_metabolite(self):
        return True

    def to_json(self, depth=0):
        """ Export a serializable dictionary. """
        return dict(super(Metabolite, self).to_json(), **{
            # FIXME the alternate names pointed to by the 'ans' key are
            # supposed to come from the 'alternate_metabolite_type_names'
            # table in the old EDD, but this is actually empty.  Do we need it?
            "ans": "",
            "f": self.molecular_formula,
            "mm": float(self.molar_mass),
            "cc": self.carbon_count,
            "chg": self.charge,
            "chgn": self.charge,  # TODO find anywhere in typescript using this and fix it
            "kstr": ",".join(self.tags),  # TODO find anywhere in typescript using this and fix
            "tags": self.tags,
        })

    def to_solr_json(self):
        """ Convert the MeasurementType model to a dict structure formatted for Solr JSON. """
        return dict(super(Metabolite, self).to_solr_json(), **{
            'm_charge': self.charge,
            'm_carbons': self.carbon_count,
            'm_mass': self.molar_mass,
            'm_formula': self.molecular_formula,
            'm_tags': list(self.tags),
        })

    def save(self, *args, **kwargs):
        if self.carbon_count is None:
            self.carbon_count = self.extract_carbon_count()
        # force METABOLITE group
        self.type_group = MeasurementType.Group.METABOLITE
        super(Metabolite, self).save(*args, **kwargs)

    def extract_carbon_count(self):
        count = 0
        for match in self.carbon_pattern.finditer(self.molecular_formula):
            c = match.group(1)
            count = count + (int(c) if c else 1)
        return count


@python_2_unicode_compatible
class GeneIdentifier(MeasurementType):
    """ Defines additional metadata on gene identifier transcription measurement type. """
    class Meta:
        db_table = 'gene_identifier'
    location_in_genome = models.TextField(
        blank=True,
        help_text=_('Location of this Gene in the organism genome.'),
        null=True,
        verbose_name=_('Location'),
    )
    positive_strand = models.BooleanField(
        default=True,
        help_text=_('Flag indicating if transcript is positive (sense).'),
        verbose_name=_('Positive'),
    )
    location_start = models.IntegerField(
        blank=True,
        help_text=_('Offset location for gene start.'),
        null=True,
        verbose_name=_('Start'),
    )
    location_end = models.IntegerField(
        blank=True,
        help_text=_('Offset location for gene end.'),
        null=True,
        verbose_name=_('End'),
    )
    gene_length = models.IntegerField(
        blank=True,
        help_text=_('Length of the gene nucleotides.'),
        null=True,
        verbose_name=_('Length'),
    )

    @classmethod
    def by_name(cls):
        """ Generate a dictionary of genes keyed by name. """
        return {g.type_name: g for g in cls.objects.order_by("type_name")}

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force GENEID group
        self.type_group = MeasurementType.Group.GENEID
        super(GeneIdentifier, self).save(*args, **kwargs)


@python_2_unicode_compatible
class ProteinIdentifier(MeasurementType):
    """ Defines additional metadata on gene identifier transcription measurement type. """
    class Meta:
        db_table = 'protein_identifier'
    # protein names use:
    #   type_name = human-readable name; e.g. AATM_RABIT
    #   short_name = accession code ID portion; e.g. P12345
    #   accession_id = "full" accession ID if available; e.g. sp|P12345|AATM_RABIT
    #       if "full" version unavailable, repeat the short_name
    accession_id = VarCharField(
        blank=True,
        help_text=_('Accession ID for protein characterized in e.g. UniProt.'),
        null=True,
        verbose_name=_('Accession ID')
    )
    length = models.IntegerField(
        blank=True,
        help_text=_('sequence length'),
        null=True,
        verbose_name=_('Length'),
    )
    mass = models.DecimalField(
        blank=True,
        decimal_places=5,
        help_text=_('of unprocessed protein, in Daltons'),
        max_digits=16,
        null=True,
        verbose_name=_('Mass'),
    )

    accession_pattern = re.compile(
        r'(?:[a-z]{2}\|)?'  # optional identifier for SwissProt or TrEMBL
        r'([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})'  # the ID
        r'(?:\|(\w+))?'  # optional name
    )

    def export_name(self):
        if self.accession_id:
            return self.accession_id
        return self.type_name

    def to_solr_json(self):
        """ Convert the MeasurementType model to a dict structure formatted for Solr JSON. """
        return dict(super(ProteinIdentifier, self).to_solr_json(), **{
            'p_length': self.length,
            'p_mass': self.mass,
        })

    @classmethod
    def load_or_create(cls, measurement_name, datasource, user_token):
        # extract Uniprot accession data from the measurement name, if present
        accession_match = cls.accession_pattern.match(measurement_name)
        proteins = ProteinIdentifier.objects.none()
        if accession_match:
            uniprot_id = accession_match.group(1)
            proteins = ProteinIdentifier.objects.filter(short_name=uniprot_id)
        else:
            proteins = ProteinIdentifier.objects.filter(short_name=measurement_name)

        # force query to LIMIT 2
        proteins = proteins[:2]

        if len(proteins) > 1:
            # fail if protein couldn't be uniquely matched
            raise ValidationError(
                _u('More than one match was found for protein name "%(type_name)s".') % {
                    'type_name': measurement_name,
                }
            )
        elif len(proteins) == 0:
            # try to create a new protein
            # enforce ProteinIdentifier naming conventions for new ProteinIdentifiers,
            # if configured. this isn't as good as looking them up in Uniprot, but should
            # help as a stopgap to curate our protein entries
            link = ProteinStrainLink()
            if accession_match:
                # TODO: try external lookup to validate accession ID?
                type_name = accession_match.group(2)
                type_name = measurement_name if type_name is None else type_name
                accession_id = measurement_name
            elif link.check_ice(user_token, measurement_name):
                type_name = link.strain.name
                uniprot_id = measurement_name
                accession_id = measurement_name
            elif getattr(settings, 'REQUIRE_UNIPROT_ACCESSION_IDS', True):
                raise ValidationError(
                    _u('Protein name "%(type_name)s" is not a valid UniProt accession id.') % {
                        'type_name': measurement_name,
                    }
                )
            logger.info('Creating a new ProteinIdentifier for %(name)s' % {
                'name': measurement_name,
            })
            if datasource.pk is None:
                datasource.save()
            p = ProteinIdentifier.objects.create(
                type_name=type_name,
                short_name=uniprot_id,
                accession_id=accession_id,
                type_source=datasource,
            )
            if link.strain:
                link.protein = p
                link.save()
            return p
        return proteins[0]

    @classmethod
    def match_accession_id(cls, text):
        """
        Tests whether the input text matches the pattern of a Uniprot accession id, and if so,
        extracts & returns the required identifier portion of the text, less optional prefix/suffix
        allowed by the pattern.
        :param text: the text to match
        :return: the Uniprot identifier if the input text matched the accession id pattern,
        or the entire input string if not
        """
        match = cls.accession_pattern.match(text)
        if match:
            return match.group(1)
        return text

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force PROTEINID group
        self.type_group = MeasurementType.Group.PROTEINID
        super(ProteinIdentifier, self).save(*args, **kwargs)


@python_2_unicode_compatible
class ProteinStrainLink(models.Model):
    """ Defines a link between a ProteinIdentifier and a Strain. """
    class Meta:
        db_table = 'protein_strain'
    protein = models.OneToOneField(
        ProteinIdentifier,
        related_name='strainlink',
    )
    strain = models.OneToOneField(
        'main.Strain',
        related_name='proteinlink',
    )

    def check_ice(self, user_token, name):
        from .tasks import create_ice_connection
        from .core import Strain
        ice = create_ice_connection(user_token)
        part = ice.get_entry(name, suppress_errors=True)
        if part:
            default = dict(
                name=part.name,
                description=part.short_description,
                registry_url=''.join((ice.base_url, '/entry/', str(part.id))),
            )
            self.strain, x = Strain.objects.get_or_create(registry_id=part.uuid, defaults=default)
            return True
        return False

    def __str__(self):
        return self.strain.name


@python_2_unicode_compatible
class Phosphor(MeasurementType):
    """ Defines metadata for phosphorescent measurements """
    class Meta:
        db_table = 'phosphor_type'
    excitation_wavelength = models.DecimalField(
        blank=True,
        decimal_places=5,
        help_text=_('Excitation wavelength for the material.'),
        max_digits=16,
        null=True,
        verbose_name=_('Excitation'),
    )
    emission_wavelength = models.DecimalField(
        blank=True,
        decimal_places=5,
        help_text=_('Emission wavelength for the material.'),
        max_digits=16,
        null=True,
        verbose_name=_('Emission'),
    )
    reference_type = models.ForeignKey(
        MeasurementType,
        blank=True,
        help_text=_('Link to another Measurement Type used as a reference for this type.'),
        null=True,
        on_delete=models.PROTECT,
        related_name='phosphor_set',
        verbose_name=_('Reference'),
    )

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force PHOSPHOR group
        self.type_group = MeasurementType.Group.PHOSPHOR
        super(Phosphor, self).save(*args, **kwargs)


@python_2_unicode_compatible
class MeasurementUnit(models.Model):
    """ Defines a unit type and metadata on measurement values. """
    class Meta:
        db_table = 'measurement_unit'
    unit_name = models.CharField(
        help_text=_('Name for unit of measurement.'),
        max_length=255,
        unique=True,
        verbose_name=_('Name'),
    )
    display = models.BooleanField(
        default=True,
        help_text=_('Flag indicating the units should be displayed along with values.'),
        verbose_name=_('Display'),
    )
    alternate_names = models.CharField(
        blank=True,
        help_text=_('Alternative names for the unit.'),
        max_length=255,
        null=True,
        verbose_name=_('Alternate Names'),
    )
    type_group = models.CharField(
        choices=MeasurementType.Group.GROUP_CHOICE,
        default=MeasurementType.Group.GENERIC,
        help_text=_('Type of measurement for which this unit is used.'),
        max_length=8,
        verbose_name=_('Group'),
    )

    # TODO: this should be somehow rolled up into the unit definition
    conversion_dict = {
        'g/L': lambda y, metabolite: 1000 * y / metabolite.molar_mass,
        'mg/L': lambda y, metabolite: y / metabolite.molar_mass,
        'µg/L': lambda y, metabolite: y / 1000 / metabolite.molar_mass,
        'Cmol/L': lambda y, metabolite: 1000 * y / metabolite.carbon_count,
        'mol/L': lambda y, metabolite: 1000 * y,
        'uM': lambda y, metabolite: y / 1000,
        'mol/L/hr': lambda y, metabolite: 1000 * y,
        'mM': lambda y, metabolite: y,
        'mol/L/hr': lambda y, metabolite: 1000 * y,
    }

    def to_json(self):
        return {"id": self.pk, "name": self.unit_name, }

    @property
    def group_name(self):
        return dict(MeasurementType.Group.GROUP_CHOICE)[self.type_group]

    @classmethod
    def all_sorted(cls):
        return cls.objects.filter(display=True).order_by(Func(F('unit_name'), function='LOWER'))

    def __str__(self):
        return self.unit_name
