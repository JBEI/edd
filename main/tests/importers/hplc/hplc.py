#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    The tests for imporitng the output of HPLC machines.
##

from django.test import TestCase
import main.importers.hplc
from main.parsers.hplc import HPLC_Parser
from main.importers.hplc import HPLC_Importer
from django.contrib.auth import get_user_model
from exceptions import NotImplementedError


class HPLC_Importer_Case(TestCase):
	def setUp(self):		
		HPLC_Parser.objects.create(name="example1")
		HPLC_Importer.objects.create(name="example1")

		HPLC_Parser.objects.create(name="example2")
		HPLC_Importer.objects.create(name="example2")

	def test_example1_import(self):
		example1_file_path = "main/fixtures/hplc/GLPrprt111714.txt"
		samples = parse_hplc_file(example1_file_path)

		user = get_user_model()
		study = Study.objects.get(name="FakeStudy-SYNBIO-1244-HPLC-data-import")

		raise NotImplementedError()

	def test_example2_import(self):
		example2_file_path = "main/fixtures/hplc/2015.11.1_Sugars_HPLC_data.txt"
		samples = parse_hplc_file(example2_file_path)

		user = get_user_model()
		study = Study.objects.get(name="FakeStudy-SYNBIO-1244-HPLC-data-import")

		raise NotImplementedError()
