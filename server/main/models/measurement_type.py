"""Models describing measurement types."""

import logging
import re
from uuid import uuid4

import requests
from celery.exceptions import Retry
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q
from django.utils.translation import gettext as _u
from django.utils.translation import gettext_lazy as _
from rdflib import Graph
from rdflib.term import URIRef

from edd.celery import app
from edd.fields import VarCharField
from edd.search.registry import StrainRegistry

from .common import EDDSerialize
from .update import Datasource

logger = logging.getLogger(__name__)


class MeasurementType(EDDSerialize, models.Model):
    """
    Defines the type of measurement being made. A generic measurement only
    has name and short name; if the type is a metabolite, the metabolite
    attribute will contain additional metabolite info.
    """

    class Meta:
        db_table = "measurement_type"

    class Group:
        """
        Note that when a new group type is added here, code will need to be
        updated elsewhere, including the Javascript/Typescript front end.
        Look for the string 'MeasurementGroupCode' in comments.
        """

        GENERIC = "_"
        METABOLITE = "m"
        GENEID = "g"
        PROTEINID = "p"
        PHOSPHOR = "h"
        GROUP_CHOICE = (
            (GENERIC, _("Generic")),
            (METABOLITE, _("Metabolite")),
            (GENEID, _("Gene Identifier")),
            (PROTEINID, _("Protein Identifier")),
            (PHOSPHOR, _("Phosphor")),
        )

    type_name = VarCharField(
        help_text=_("Name of this Measurement Type."),
        verbose_name=_("Measurement Type"),
    )
    short_name = VarCharField(
        blank=True,
        help_text=_("(DEPRECATED) Short name used in SBML output."),
        null=True,
        verbose_name=_("Short Name"),
    )
    type_group = VarCharField(
        choices=Group.GROUP_CHOICE,
        default=Group.GENERIC,
        help_text=_("Class of data for this Measurement Type."),
        verbose_name=_("Type Group"),
    )
    type_source = models.ForeignKey(
        Datasource,
        blank=True,
        help_text=_("Datasource used for characterizing this Measurement Type."),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_("Datasource"),
    )
    provisional = models.BooleanField(
        default=False,
        help_text=_(
            "Flag indicating if the type is pending lookup in external Datasource"
        ),
        verbose_name=_("Provisional"),
    )
    # linking together EDD instances will be easier later if we define UUIDs now
    uuid = models.UUIDField(
        editable=False,
        help_text=_("Unique ID for this Measurement Type."),
        unique=True,
        verbose_name=_("UUID"),
    )
    alt_names = ArrayField(
        VarCharField(),
        blank=True,
        default=list,
        help_text=_("Alternate names for this Measurement Type."),
        verbose_name=_("Synonyms"),
    )

    def save(self, *args, **kwargs):
        if self.uuid is None:
            self.uuid = uuid4()
        super().save(*args, **kwargs)

    def to_solr_value(self):
        return f"{self.pk}@{self.type_name}"

    def to_solr_json(self):
        """
        Convert the MeasurementType model to a dict structure formatted for Solr JSON.
        """
        source_name = None
        # Check if this is coming from a child MeasurementType, and ref the base type
        mtype = getattr(self, "measurementtype_ptr", None)
        # check for annotated source attribute on self and base type
        if hasattr(self, "_source_name"):
            source_name = self._source_name
        elif mtype and hasattr(mtype, "_source_name"):
            source_name = mtype._source_name
        elif self.type_source:
            source_name = self.type_source.name
        return {
            "id": self.id,
            "uuid": self.uuid,
            "name": self.type_name,
            "family": self.type_group,
            # use the annotated attr if present, otherwise must make a new query
            "source": source_name,
        }

    def to_json(self, depth=0):
        payload = {
            "id": self.pk,
            "uuid": self.uuid,
            "name": self.type_name,
            "family": self.type_group,
        }
        # optionally add CID or Accession if from annotated query
        if (cid := getattr(self, "cid", None)) is not None:
            payload["cid"] = cid
        elif (accession := getattr(self, "accession", None)) is not None:
            payload["accession"] = accession
        return payload

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

    @classmethod
    def active_in(cls, *, study_id, protocol_id, assay_id=None):
        """
        Queries all unique types on active/enabled measurements matching criteria.
        """
        assay_filter = Q() if assay_id is None else Q(measurement__assay_id=assay_id)
        active = cls.objects.filter(
            assay_filter,
            measurement__active=True,
            measurement__assay__active=True,
            measurement__assay__line__active=True,
            measurement__assay__line__study_id=study_id,
            measurement__assay__protocol_id=protocol_id,
        ).distinct()
        return active.annotate(
            cid=F("metabolite__pubchem_cid"),
            accession=F("proteinidentifier__accession_code"),
        )

    @classmethod
    def used_in_study(cls, study):
        """
        Queries all unique types used in a specific study.
        """
        used = cls.objects.filter(assay__study=study).distinct()
        return used.annotate(
            cid=F("metabolite__pubchem_cid"),
            accession=F("proteinidentifier__accession_code"),
        )


class Metabolite(MeasurementType):
    """
    Defines additional metadata on a metabolite measurement type;
    charge, carbon count, molar mass, molecular formula, SMILES, PubChem CID.
    """

    class Meta:
        db_table = "metabolite"

    charge = models.IntegerField(
        help_text=_("The charge of this molecule."), verbose_name=_("Charge")
    )
    carbon_count = models.IntegerField(
        help_text=_("Count of carbons present in this molecule."),
        verbose_name=_("Carbon Count"),
    )
    molar_mass = models.DecimalField(
        decimal_places=5,
        help_text=_("Molar mass of this molecule."),
        max_digits=16,
        verbose_name=_("Molar Mass"),
    )
    molecular_formula = models.TextField(
        help_text=_("Formula string defining this molecule."), verbose_name=_("Formula")
    )
    smiles = VarCharField(
        blank=True,
        help_text=_("SMILES string defining molecular structure."),
        null=True,
        verbose_name=_("SMILES"),
    )
    pubchem_cid = models.IntegerField(
        blank=True,
        help_text=_("Unique PubChem identifier"),
        null=True,
        unique=True,
        verbose_name=_("PubChem CID"),
    )
    id_map = ArrayField(
        VarCharField(),
        default=list,
        help_text=_("List of identifiers mapping to external chemical datasets."),
        verbose_name=_("External IDs"),
    )
    tags = ArrayField(
        VarCharField(),
        default=list,
        help_text=_("List of tags for classifying this molecule."),
        verbose_name=_("Tags"),
    )

    carbon_pattern = re.compile(r"C(?![a-z])(\d*)")
    pubchem_pattern = re.compile(r"(?i)cid:\s*(\d+)(?::(.*))?")

    def __str__(self):
        return self.type_name

    def is_metabolite(self):
        return True

    def to_json(self, depth=0):
        """Export a serializable dictionary."""
        return dict(
            super().to_json(),
            **{
                "formula": self.molecular_formula,
                "molar": float(self.molar_mass),
                "carbons": self.carbon_count,
                "pubchem": self.pubchem_cid,
                "smiles": self.smiles,
            },
        )

    def to_solr_json(self):
        """Convert the MeasurementType model to a dict structure formatted for Solr JSON."""
        return dict(
            super().to_solr_json(),
            **{
                "m_charge": self.charge,
                "m_carbons": self.carbon_count,
                "m_mass": self.molar_mass,
                "m_formula": self.molecular_formula,
                "m_tags": list(self.tags),
            },
        )

    def save(self, *args, **kwargs):
        if self.carbon_count is None:
            self.carbon_count = self.extract_carbon_count()
        # force METABOLITE group
        self.type_group = MeasurementType.Group.METABOLITE
        super().save(*args, **kwargs)

    def extract_carbon_count(self):
        count = 0
        for match in self.carbon_pattern.finditer(self.molecular_formula):
            c = match.group(1)
            count = count + (int(c) if c else 1)
        return count

    def _load_pubchem(self, pubchem_cid):
        base_url = (
            f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{pubchem_cid}"
        )
        try:
            self.pubchem_cid = pubchem_cid
            if self._load_pubchem_name(base_url) and self._load_pubchem_props(base_url):
                self.type_source = Datasource.objects.create(
                    name="PubChem", url=base_url
                )
                self.carbon_count = self.extract_carbon_count()
                self.provisional = False
                self.save()
                return True
            logger.warn(f"Skipped saving PubChem info for {pubchem_cid}")
        except Exception:
            logger.exception(f"Failed processing PubChem info for {pubchem_cid}")
        return False

    def _load_pubchem_name(self, base_url):
        # the default properties listing does not give common names, synonyms list does
        try:
            response = requests.get(f"{base_url}/synonyms/JSON")
            # payload is nested in this weird envelope
            names = response.json()["InformationList"]["Information"][0]["Synonym"]
            # set the first synonym
            self.type_name = next(iter(names))
            return True
        except Exception:
            logger.exception(
                f"Failed loading names from PubChem for {self.pubchem_cid}"
            )
        return False

    def _load_pubchem_props(self, base_url):
        # can list out only specific properties needed in URL
        props = "MolecularFormula,MolecularWeight,Charge,CanonicalSMILES"
        try:
            response = requests.get(f"{base_url}/property/{props}/JSON")
            # payload is nested in this weird envelope
            table = response.json()["PropertyTable"]["Properties"][0]
            # set the properties found
            self.charge = table.get("Charge", 0)
            self.molecular_formula = table.get("MolecularFormula", "")
            self.molar_mass = table.get("MolecularWeight", 1)
            self.smiles = table.get("CanonicalSMILES", "")
            return True
        except Exception:
            logger.exception(
                f"Failed loading properties from Pubchem for {self.pubchem_cid}"
            )
        return False

    @classmethod
    def load_or_create(cls, pubchem_cid):
        match = cls.pubchem_pattern.match(pubchem_cid)
        if match:
            cid = match.group(1)
            label = match.group(2)
            # try to find existing Metabolite record
            metabolite, created = cls.objects.get_or_create(
                pubchem_cid=cid,
                defaults={
                    "carbon_count": 0,
                    "charge": 0,
                    "molar_mass": 1,
                    "molecular_formula": "",
                    "provisional": True,
                    "type_group": MeasurementType.Group.METABOLITE,
                    "type_name": label or "Unknown Metabolite",
                },
            )
            if created:
                transaction.on_commit(
                    lambda: metabolite_load_pubchem.delay(metabolite.pk)
                )
            return metabolite
        raise ValidationError(
            _u(
                'Metabolite lookup failed: {pubchem} must match pattern "cid:0000"'
            ).format(pubchem=pubchem_cid)
        )


@app.task(ignore_result=True, rate_limit="6/m")
def metabolite_load_pubchem(pk):
    try:
        metabolite = Metabolite.objects.get(pk=pk)
        success = metabolite._load_pubchem(metabolite.pubchem_cid)
        if success:
            return
    except Exception:
        logger.exception(f"Failed task updating metabolite ID {pk} from PubChem")
    raise Retry()


class GeneIdentifier(MeasurementType):
    """
    Defines additional metadata on gene identifier transcription measurement type.
    """

    class Meta:
        db_table = "gene_identifier"

    gene_length = models.IntegerField(
        blank=True,
        help_text=_("Length of the gene nucleotides."),
        null=True,
        verbose_name=_("Length"),
    )

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force GENEID group
        self.type_group = MeasurementType.Group.GENEID
        super().save(*args, **kwargs)

    @classmethod
    def _load_ice(cls, identifier, user):
        try:
            return cls.objects.get(type_name=identifier, strainlink__isnull=False)
        except cls.DoesNotExist:
            # actually check ICE
            link = GeneStrainLink()
            if link.check_ice(user, identifier):
                # save link if found in ICE
                datasource = Datasource.objects.create(
                    name="ICE Registry", url=link.strain.registry_url
                )
                gene = cls.objects.create(
                    type_name=identifier,
                    type_source=datasource,
                    gene_length=link.strain.part.payload.get("basePairCount", None),
                )
                link.gene = gene
                link.save()
                return gene
        except Exception:
            # fall through to raise ValidationError
            pass
        raise ValidationError(
            _u('Could not load gene "{identifier}"').format(identifier=identifier)
        )

    @classmethod
    def _load_fallback(cls, identifier, user):
        try:
            return cls.objects.get(
                type_name=identifier, type_source__created__mod_by=user
            )
        except cls.DoesNotExist:
            datasource = Datasource.objects.create(name=user.username)
            return cls.objects.create(type_name=identifier, type_source=datasource)
        except Exception:
            logger.exception('Failed to load GeneIdentifier "%s"', identifier)
            raise ValidationError(
                _u('Could not load gene "{identifier}"').format(identifier=identifier)
            )

    @classmethod
    def load_or_create(cls, identifier, user):
        # TODO check for NCBI pattern in identifier

        # if ICE is not connected, skip checking ICE
        if not hasattr(settings, "ICE_URL"):
            logger.warning("Skipping ICE checks since ICE is not configured")
            # fall back to checking for same identifier used by same user
            return cls._load_fallback(identifier, user)

        try:
            # check ICE for identifier
            return cls._load_ice(identifier, user)
        except ValidationError:
            # fall back to checking for same identifier used by same user
            return cls._load_fallback(identifier, user)


class ProteinIdentifier(MeasurementType):
    """Defines additional metadata on proteomic measurement type."""

    class Meta:
        db_table = "protein_identifier"

    # protein names use:
    #   type_name = "human-readable" name; e.g. AATM_RABIT
    #   accession_code = accession code ID portion; e.g. P12345
    #   accession_id = "full" accession ID if available; e.g. sp|P12345|AATM_RABIT
    #       if "full" version unavailable, repeat the accession_code
    accession_id = VarCharField(
        blank=True,
        help_text=_("Accession ID for protein characterized in e.g. UniProt."),
        null=True,
        verbose_name=_("Accession ID"),
    )
    accession_code = VarCharField(
        blank=True,
        help_text=_("Required portion of Accession ID for easier lookup."),
        null=True,
        verbose_name=_("Accession Code"),
    )
    length = models.IntegerField(
        blank=True, help_text=_("sequence length"), null=True, verbose_name=_("Length")
    )
    mass = models.DecimalField(
        blank=True,
        decimal_places=5,
        help_text=_("of unprocessed protein, in Daltons"),
        max_digits=16,
        null=True,
        verbose_name=_("Mass"),
    )

    # TODO find how this can also match JGI accession IDs
    accession_pattern = re.compile(
        # optional identifier for SwissProt or TrEMBL
        r"(?:[a-z]{2}\|)?"
        # the ID
        r"([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})"
        # optional name
        r"(?:\|(\w+))?"
    )

    def export_name(self):
        if self.accession_id:
            return self.accession_id
        return self.type_name

    def to_solr_json(self):
        """
        Convert the MeasurementType model to a dict structure formatted for Solr JSON.
        """
        return dict(
            super().to_solr_json(), **{"p_length": self.length, "p_mass": self.mass}
        )

    def update_from_uniprot(self):
        match = self.accession_pattern.match(self.accession_id)
        if match:
            uniprot_id = match.group(1)
            for name, value in self._load_uniprot_values(uniprot_id):
                setattr(self, name, value)
            if not self.provisional:
                self.save()

    @classmethod
    def _get_or_create_from_uniprot(cls, uniprot_id, accession_id):
        try:
            protein = cls.objects.get(accession_code=uniprot_id)
        except cls.DoesNotExist:
            url = cls._uniprot_url(uniprot_id)
            protein = cls.objects.create(
                accession_code=uniprot_id,
                accession_id=accession_id,
                type_source=Datasource.objects.create(name="UniProt", url=url),
            )
        return protein

    @classmethod
    def _load_uniprot(cls, uniprot_id, accession_id):
        try:
            protein = cls._get_or_create_from_uniprot(uniprot_id, accession_id)
            lookup_protein_in_uniprot.delay(protein.id)
            return protein
        except Exception:
            logger.exception(f"Failed to create from UniProt {uniprot_id}")
            raise ValidationError(
                _u("Could not create Protein from {uniprot_id}").format(
                    uniprot_id=uniprot_id
                )
            )

    @classmethod
    def _load_uniprot_values(cls, uniprot_id):
        url = cls._uniprot_url(uniprot_id)
        values = {}
        # define some RDF predicate terms
        mass_predicate = URIRef("http://purl.uniprot.org/core/mass")
        sequence_predicate = URIRef("http://purl.uniprot.org/core/sequence")
        value_predicate = URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#value")
        # build the RDF graph
        try:
            graph = Graph()
            graph.parse(url)
            # find top-level references
            subject = URIRef(f"http://purl.uniprot.org/uniprot/{uniprot_id}")
            isoform = graph.value(subject, sequence_predicate)
            # find values of interest
            values.update(type_name=cls._uniprot_name(graph, subject, uniprot_id))
            sequence = graph.value(isoform, value_predicate)
            if sequence:
                values.update(length=len(sequence.value))
            mass = graph.value(isoform, mass_predicate)
            if mass:
                values.update(mass=mass.value)
            values.update(provisional=False)
        except Exception:
            logger.exception(f"Failed to read UniProt: {uniprot_id}")
            values.update(provisional=True)
        return values

    @classmethod
    def _uniprot_name(cls, graph, subject, uniprot_id):
        """
        Parses the RDF for name using ordered preferences: recommendedName, then submittedName,
        then mnemonic, then uniprot_id.
        """
        fullname_predicate = URIRef("http://purl.uniprot.org/core/fullName")
        mnemonic_predicate = URIRef("http://purl.uniprot.org/core/mnemonic")
        recname_predicate = URIRef("http://purl.uniprot.org/core/recommendedName")
        subname_predicate = URIRef("http://purl.uniprot.org/core/submittedName")
        names = [
            # get the fullName value of the recommendedName
            graph.value(graph.value(subject, recname_predicate), fullname_predicate),
            # get the fullName value of the submittedName
            graph.value(graph.value(subject, subname_predicate), fullname_predicate),
            # get the literal value of the mnemonic
            getattr(graph.value(subject, mnemonic_predicate), "value", None),
        ]
        # fallback to uniprot_id if all above are None
        return next((name for name in names if name is not None), uniprot_id)

    @classmethod
    def _uniprot_url(cls, uniprot_id):
        return f"http://www.uniprot.org/uniprot/{uniprot_id}.rdf"

    @classmethod
    def _load_ice(cls, link):
        # strain found in ICE, but may not yet be linked to EDD protein
        existing = ProteinStrainLink.objects.filter(strain=link.strain)[:2]
        if len(existing) == 1:
            # existing link found, return the protein
            return existing[0].protein
        elif len(existing) == 0:
            # no existing link found, create the protein and link
            datasource = Datasource.objects.create(
                name="Part Registry", url=link.strain.registry_url
            )
            protein = cls.objects.create(
                type_name=link.strain.name,
                type_source=datasource,
                accession_id=link.strain.part.part_id,
            )
            link.protein = protein
            link.save()
            return protein
        raise ValidationError(
            _u("Multiple entries found for '{part_id}'.").format(
                part_id=link.strain.part.part_id
            )
        )

    @classmethod
    def load_or_create(cls, protein_name, user):
        # extract Uniprot accession data from the measurement name, if present
        accession_match = cls.accession_pattern.match(protein_name)
        proteins = cls.objects.none()
        if accession_match:
            accession_code = accession_match.group(1)
            proteins = cls.objects.filter(accession_code=accession_code)
        else:
            proteins = cls.objects.filter(accession_code=protein_name)

        # force query to LIMIT 2, anything more than one is treated same
        proteins = proteins[:2]

        if len(proteins) > 1:
            # fail if protein couldn't be uniquely matched
            raise ValidationError(
                _u(
                    'More than one match was found for protein name "{type_name}".'
                ).format(type_name=protein_name)
            )
        elif len(proteins) == 0:
            # try to create a new protein
            link = ProteinStrainLink()
            if accession_match:
                # if it looks like a UniProt ID, look up in UniProt
                accession_code = accession_match.group(1)
                return cls._load_uniprot(accession_code, protein_name)
            elif link.check_ice(user, protein_name):
                # if it is found in ICE, create based on ICE info
                return cls._load_ice(link)
            elif getattr(settings, "REQUIRE_UNIPROT_ACCESSION_IDS", True):
                raise ValidationError(
                    _u(
                        'Protein name "{type_name}" is not a valid UniProt accession id.'
                    ).format(type_name=protein_name)
                )
            logger.info(f"Creating a new ProteinIdentifier for {protein_name}")
            # not requiring accession ID or ICE entry; just create protein with arbitrary name
            datasource = Datasource.objects.create(name=user.username, url=user.email)
            return cls.objects.create(
                type_name=protein_name,
                provisional=True,
                accession_code=protein_name,
                accession_id=protein_name,
                type_source=datasource,
            )
        return proteins[0]

    @classmethod
    def match_accession_id(cls, text):
        """
        Tests whether the input text matches the pattern of a Uniprot accession id,
        and if so, extracts & returns the required identifier portion of the text,
        less optional prefix/suffix allowed by the pattern.

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
        super().save(*args, **kwargs)


@app.task(ignore_result=True, rate_limit="6/m")
def lookup_protein_in_uniprot(pk):
    """Background task to fetch UniProt metadata for a ProteinIdentifier."""
    try:
        protein = ProteinIdentifier.objects.get(pk=pk)
        protein.update_from_uniprot()
    except Exception as e:
        logger.exception(f"Failed task updating protein ID {pk} from Uniprot: {e}")
        raise Retry()


class StrainLinkMixin:
    """Common code for objects linked to Strains."""

    def check_ice(self, user, name):
        from .core import Strain

        try:
            registry = StrainRegistry()
            with registry.login(user):
                entry = registry.get_entry(name)
                url = f"{registry.base_url}/entry/{entry.db_id}"
                default = dict(name=entry.name, registry_url=url)
                self.strain, created = Strain.objects.get_or_create(
                    registry_id=entry.registry_id, defaults=default
                )
                self.strain.part = entry
                return True
        except Exception:
            logger.warning(
                f"Failed to load ICE information on `{name}` for `{user.username}`",
                exc_info=True,
            )
        return False


class ProteinStrainLink(StrainLinkMixin, models.Model):
    """Defines a link between a ProteinIdentifier and a Strain."""

    class Meta:
        db_table = "protein_strain"

    protein = models.OneToOneField(
        ProteinIdentifier, related_name="strainlink", on_delete=models.CASCADE
    )
    strain = models.OneToOneField(
        "main.Strain", related_name="proteinlink", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.strain.name


class GeneStrainLink(StrainLinkMixin, models.Model):
    """Defines a link between a GeneIdentifier and a Strain."""

    class Meta:
        db_table = "gene_strain"

    gene = models.OneToOneField(
        GeneIdentifier, related_name="strainlink", on_delete=models.CASCADE
    )
    strain = models.OneToOneField(
        "main.Strain", related_name="genelink", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.strain.name


class Phosphor(MeasurementType):
    """Defines metadata for phosphorescent measurements."""

    class Meta:
        db_table = "phosphor_type"

    excitation_wavelength = models.DecimalField(
        blank=True,
        decimal_places=5,
        help_text=_("Excitation wavelength for the material."),
        max_digits=16,
        null=True,
        verbose_name=_("Excitation"),
    )
    emission_wavelength = models.DecimalField(
        blank=True,
        decimal_places=5,
        help_text=_("Emission wavelength for the material."),
        max_digits=16,
        null=True,
        verbose_name=_("Emission"),
    )
    reference_type = models.ForeignKey(
        MeasurementType,
        blank=True,
        help_text=_(
            "Link to another Measurement Type used as a reference for this type."
        ),
        null=True,
        on_delete=models.PROTECT,
        related_name="phosphor_set",
        verbose_name=_("Reference"),
    )

    def __str__(self):
        return self.type_name

    def save(self, *args, **kwargs):
        # force PHOSPHOR group
        self.type_group = MeasurementType.Group.PHOSPHOR
        super().save(*args, **kwargs)


class MeasurementUnit(models.Model):
    """Defines a unit type and metadata on measurement values."""

    class Meta:
        db_table = "measurement_unit"

    unit_name = VarCharField(
        help_text=_("Name for unit of measurement."),
        unique=True,
        verbose_name=_("Name"),
    )
    display = models.BooleanField(
        default=True,
        help_text=_("Flag indicating the units should be displayed along with values."),
        verbose_name=_("Display"),
    )
    alternate_names = VarCharField(
        blank=True,
        help_text=_("Alternative names for the unit."),
        null=True,
        verbose_name=_("Alternate Names"),
    )
    type_group = VarCharField(
        choices=MeasurementType.Group.GROUP_CHOICE,
        default=MeasurementType.Group.GENERIC,
        help_text=_("Type of measurement for which this unit is used."),
        verbose_name=_("Group"),
    )

    # TODO: this should be somehow rolled up into the unit definition
    conversion_dict = {
        "g/L": lambda y, metabolite: 1000 * y / metabolite.molar_mass,
        "mg/L": lambda y, metabolite: y / metabolite.molar_mass,
        "µg/L": lambda y, metabolite: y / 1000 / metabolite.molar_mass,
        "Cmol/L": lambda y, metabolite: 1000 * y / metabolite.carbon_count,
        "mol/L": lambda y, metabolite: 1000 * y,
        "uM": lambda y, metabolite: y / 1000,
        "mol/L/hr": lambda y, metabolite: 1000 * y,
        "mM": lambda y, metabolite: y,
    }

    def to_json(self):
        return {"id": self.pk, "name": self.unit_name}

    def __str__(self):
        return self.unit_name
