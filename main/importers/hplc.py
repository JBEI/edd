#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    This is for imporitng the output of HPLC machines.
##
import sys, os
import logging
from main.models import (Study)

logger = logging.getLogger(__name__)

# TODO: collect the needed Django interfacing objects
# TODO: write proper protective logic
# TODO: make sure process executes in a trasaction!

class HPLC_Importer:
    def map_hplc_samples(self, samples, user, study):
        """Maps HPLC data from a data structure {name:{fields:[values]}} to the
        database, injecting the new information."""

        # Get the user identity
        logging.debug('getting user')
        
        # TODO: generate field specific logic.

        # 'Sample Name'            Used to seed Line Names
        # 'Sample Amt'             Line - meta
        # 'Multip.*Dilution'       Line - meta
        # 'RetTime [min]'          Meas - X dimension
        # 'Amount'                 Meas - Y
        # 'Compound'               Meas - type
        # 'FileName .D'            Line - meta

        # TODO: respond to units embedded in names

        if not user:
            raise Exception("An EDD username is required to run map_hplc_samples()")

        if not study:
            raise Exception("An EDD study is required to run map_hplc_samples()")

