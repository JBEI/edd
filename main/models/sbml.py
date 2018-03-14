# coding: utf-8
"""
Models for SBML mapping.
"""

import logging

from django.db import models
from django.utils.encoding import python_2_unicode_compatible
from django.utils.translation import ugettext_lazy as _

from .core import Attachment, EDDObject
from .fields import VarCharField
from .measurement_type import MeasurementType


logger = logging.getLogger(__name__)


@python_2_unicode_compatible
class SBMLTemplate(EDDObject):
    """ Container for information used in SBML export. """
    class Meta:
        db_table = "sbml_template"
    object_ref = models.OneToOneField(EDDObject, parent_link=True)
    biomass_calculation = models.DecimalField(
        decimal_places=5,
        default=-1,
        help_text=_('The calculated multiplier converting OD to weight of biomass.'),
        max_digits=16,
        verbose_name=_('Biomass Factor'),
    )
    biomass_calculation_info = models.TextField(
        default='',
        help_text=_('Additional information on biomass calculation.'),
        verbose_name=_('Biomass Calculation'),
    )
    biomass_exchange_name = models.TextField(
        help_text=_('The reaction name in the model for Biomass.'),
        verbose_name=_('Biomass Reaction'),
    )
    # FIXME would like to limit this to attachments only on parent EDDObject, and remove null=True
    sbml_file = models.ForeignKey(
        Attachment,
        blank=True,
        help_text=_('The Attachment containing the SBML model file.'),
        null=True,
        on_delete=models.PROTECT,
        verbose_name=_('SBML Model'),
    )

    def __str__(self):
        return self.name

    @property
    def xml_file(self):
        return self.sbml_file

    def load_reactions(self):
        read_sbml = self.parseSBML()
        if read_sbml.getNumErrors() > 0:
            log = read_sbml.getErrorLog()
            for i in range(read_sbml.getNumErrors()):
                logger.error("--- SBML ERROR --- %s" % log.getError(i).getMessage())
            raise Exception("Could not load SBML")
        model = read_sbml.getModel()
        rlist = model.getListOfReactions()
        return rlist

    def parseSBML(self):
        if not hasattr(self, '_sbml_document'):
            # self.sbml_file = ForeignKey
            # self.sbml_file.file = FileField on Attachment
            # self.sbml_file.file.file = File object on FileField
            # self.sbml_file.file.file.name = path to file
            import libsbml
            self._sbml_document = libsbml.readSBML(self.sbml_file.file.file.name)
        return self._sbml_document

    def save(self, *args, **kwargs):
        # may need to do a post-save signal; get sbml attachment and save in sbml_file
        super(SBMLTemplate, self).save(*args, **kwargs)

    def to_json(self, depth=0):
        return {
            "id": self.pk,
            "name": self.name,
            "biomassCalculation": self.biomass_calculation,
        }


@python_2_unicode_compatible
class MetaboliteExchange(models.Model):
    """ Mapping for a metabolite to an exchange defined by a SBML template. """
    class Meta:
        db_table = "measurement_type_to_exchange"
        index_together = (
            ("sbml_template", "reactant_name"),  # reactants not unique, but should be searchable
            ("sbml_template", "exchange_name"),  # index implied by unique, making explicit
        )
        unique_together = (
            ("sbml_template", "exchange_name"),
            ("sbml_template", "measurement_type"),
        )
    sbml_template = models.ForeignKey(
        SBMLTemplate,
        help_text=_('The SBML Model containing this exchange reaction.'),
        on_delete=models.CASCADE,
        verbose_name=_('SBML Model'),
    )
    measurement_type = models.ForeignKey(
        MeasurementType,
        blank=True,
        help_text=_('Measurement type linked to this exchange reaction in the model.'),
        null=True,
        on_delete=models.CASCADE,
        verbose_name=_('Measurement Type'),
    )
    reactant_name = VarCharField(
        help_text=_('The reactant name used in for this exchange reaction.'),
        verbose_name=_('Reactant Name'),
    )
    exchange_name = VarCharField(
        help_text=_('The exchange name used in the model.'),
        verbose_name=_('Exchange Name'),
    )

    def __str__(self):
        return self.exchange_name


@python_2_unicode_compatible
class MetaboliteSpecies(models.Model):
    """ Mapping for a metabolite to an species defined by a SBML template. """
    class Meta:
        db_table = "measurement_type_to_species"
        index_together = (
            ("sbml_template", "species"),  # index implied by unique, making explicit
        )
        unique_together = (
            ("sbml_template", "species"),
            ("sbml_template", "measurement_type"),
        )
    sbml_template = models.ForeignKey(
        SBMLTemplate,
        help_text=_('The SBML Model defining this species link to a Measurement Type.'),
        on_delete=models.PROTECT,
        verbose_name=_('SBML Model'),
    )
    measurement_type = models.ForeignKey(
        MeasurementType,
        blank=True,
        help_text=_('Mesurement type linked to this species in the model.'),
        null=True,
        on_delete=models.CASCADE,
        verbose_name=_('Measurement Type'),
    )
    species = VarCharField(
        help_text=_('Species name used in the model for this metabolite.'),
        verbose_name=_('Species'),
    )

    def __str__(self):
        return self.species
