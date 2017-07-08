# -*- coding: utf-8 -*-
from __future__ import absolute_import, unicode_literals

import logging

from django.db import transaction
from django.db.models.signals import post_save

from .dispatcher import receiver
from .. import models as edd_models


logger = logging.getLogger(__name__)


@receiver(post_save, sender=edd_models.SBMLTemplate)
def template_saved(sender, instance, created, raw, using, update_fields, **kwargs):
    if not raw and (created or update_fields is None or 'sbml_file' in update_fields):
        # TODO: add celery task for template_sync_species
        try:
            with transaction.atomic():
                template_sync_species(instance)
        except Exception as e:
            logger.warning("Failed to parse and index template reactions in %s", instance)


def template_sync_species(instance):
    doc = instance.parseSBML()
    model = doc.getModel()
    # filter to only those for the updated template
    species_qs = edd_models.MetaboliteSpecies.objects.filter(sbml_template=instance)
    exchange_qs = edd_models.MetaboliteExchange.objects.filter(sbml_template=instance)
    exist_species = set(species_qs.values_list('species', flat=True))
    exist_exchange = set(exchange_qs.values_list('exchange_name', flat=True))
    # creating any records not in the database
    for species in map(lambda s: s.getId(), model.getListOfSpecies()):
        if species not in exist_species:
            edd_models.MetaboliteSpecies.objects.get_or_create(
                sbml_template=instance,
                species=species
            )
        else:
            exist_species.discard(species)
    reactions = map(lambda r: (r.getId(), r.getListOfReactants()), model.getListOfReactions())
    for reaction, reactants in reactions:
        if len(reactants) == 1 and reaction not in exist_exchange:
            edd_models.MetaboliteExchange.objects.get_or_create(
                sbml_template=instance,
                exchange_name=reaction,
                reactant_name=reactants[0].getSpecies()
            )
        else:
            exist_exchange.discard(reaction)
    # removing any records in the database not in the template document
    species_qs.filter(species__in=exist_species).delete()
    exchange_qs.filter(exchange_name__in=exist_exchange).delete()
