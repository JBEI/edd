import csv
import decimal
import io
import math

from django.http import QueryDict
from django.urls import reverse

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory

from . import broker, sbml, table, tasks


def bad_function(*args, **kwargs):
    """Always raises an exception"""
    raise Exception


def test_columnchoice_from_model_default_value():
    default = factory.fake.word()
    column = models.WorklistColumn(default_value=default)
    choice = table.ColumnChoice.from_model(column)
    assert choice.get_value(None) == default


def test_columnchoice_convert_none_instance_assay():
    choice = table.EmptyChoice()
    sentinel = object()
    result = choice.convert_instance_from_assay(None, default=sentinel)
    assert result is sentinel


def test_columnchoice_convert_none_instance_measurement():
    choice = table.ColumnChoice(models.Assay, "", "", lambda: "")
    sentinel = object()
    result = choice.convert_instance_from_measure(None, default=sentinel)
    assert result is sentinel


def test_columnchoice_lookup_exception_gives_empty_string():
    choice = table.ColumnChoice(None, None, None, bad_function)
    result = choice.get_value(None)
    assert result == ""


class ExportTaskTests(TestCase):
    """Tests that run the Celery tasks for exports/worklists."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        # initialize study
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=cls.user
        )
        factory.create_fake_exportable_study(cls.study)

    def test_simple_export(self):
        storage = broker.ExportBroker(self.user.id)
        params = QueryDict(mutable=True)
        params.update(studyId=self.study.id)
        path = storage.save_params(params)
        export_id = tasks.export_table_task.s(self.user.id, path).apply()
        result = storage.load_export(export_id.result)

        with io.TextIOWrapper(io.BytesIO(result), encoding="utf-8") as file:
            rows = list(csv.reader(file))
        # header row + (10 lines * 3 assays * 3 types) + blank row
        assert len(rows) == 92
        assert rows[91] == []
        assert rows[0] == [
            "Study ID",
            "Study Name",
            "Study Description",
            "Study Contact",
            "Line ID",
            "Line Name",
            "Line Description",
            "Control",
            "Strain(s)",
            "Carbon Source(s)",
            "Line Experimenter",
            "Line Contact",
            "Protocol ID",
            "Protocol Name",
            "Assay ID",
            "Assay Name",
            "Type",
            "Formal Type ID",
            "Measurement Updated",
            "X Units",
            "Y Units",
            "12.0",
        ]

    def test_simple_worklist(self):
        template = models.WorklistTemplate.objects.get(
            uuid="49024cc1-8c48-4511-a529-fc5a8f3d7bd9",
        )
        storage = broker.ExportBroker(self.user.id)
        params = QueryDict(mutable=True)
        params.update(studyId=self.study.id, template=template.id)
        path = storage.save_params(params)
        export_id = tasks.export_worklist_task.s(self.user.id, path).apply()
        result = storage.load_export(export_id.result)

        print(result)
        with io.TextIOWrapper(io.BytesIO(result), encoding="utf-8") as file:
            rows = list(csv.reader(file))
        # header row + 10 lines + blank row
        assert len(rows) == 12
        assert rows[11] == []
        assert rows[0] == [
            "Sample Name",
            "Sample Position",
            "Method-QQQ",
            "Data File",
            "Inj Vol (ul)",
        ]


class ExportViewPostTests(TestCase):
    """Tests for initial POST requests to export endpoints."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        # initialize study for worklist
        study = factory.StudyFactory()
        study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=cls.user
        )
        line = factory.LineFactory(study=study)
        cls.payload = {"lineId": [line.id]}

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_lines_export_csv(self):
        url = reverse("export:export")
        response = self.client.post(url, data=self.payload, follow=True)
        self.assertTemplateUsed(response, "edd/export/export.html")

    def test_lines_export_sbml(self):
        url = reverse("export:sbml")
        response = self.client.post(url, data=self.payload, follow=True)
        self.assertTemplateUsed(response, "edd/export/sbml_export.html")

    def test_lines_export_worklist(self):
        url = reverse("export:worklist")
        response = self.client.post(url, data=self.payload, follow=True)
        self.assertTemplateUsed(response, "edd/export/worklist.html")


class WorklistExportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        # initialize study for worklist
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=cls.user
        )
        # initialize protocol for worklist
        cls.protocol = factory.ProtocolFactory(name="potato")
        # initialize twenty lines in the study, 1-base index
        cls.lines = [
            factory.LineFactory(name=f"L{i}", study=cls.study) for i in range(1, 21)
        ]
        # initialize 3x assays on lines 6, 8, 10, 12, 14 (1-base)
        # assays at times 12, 24, 36
        time = models.MetadataType.system("Time")
        cls.assays = [
            factory.AssayFactory(
                line=cls.lines[line],
                metadata={time.pk: 12 * i},
                name=f"{cls.lines[line].name}-A{i}",
                protocol=cls.protocol,
            )
            for line in range(5, 14, 2)
            for i in range(1, 4)
        ]

    def _make_options(self, columns):
        return table.ExportOption(
            layout=table.ExportOption.DATA_COLUMN_BY_LINE,
            separator=table.ExportOption.COMMA_SEPARATED_TOKEN,
            line_section=False,
            protocol_section=False,
            columns=[table.ColumnChoice.from_model(c) for c in columns],
        )

    def _make_selection(self, user=None):
        user = self.user if user is None else user
        return table.ExportSelection(user=user, studyId=[self.study.pk])

    def test_build_list(self):
        # create template
        template = models.WorklistTemplate.objects.create(
            name="test_only_line_metadata", protocol=self.protocol
        )
        # build a worklist
        worklist = table.WorklistExport(None, None, template)
        # validate it creates correct assay sequence
        results = list(worklist._build_list(self.lines, self.assays))
        # 20 lines - 5 lines-with-assays + (5*3) assays-from-lines = 30
        self.assertEqual(len(results), 30, "incorrect number of items")
        self.assertEqual(results[0].line.pk, self.lines[0].pk)
        self.assertEqual(results[-1].line.pk, self.lines[-1].pk)

    def test_only_line(self):
        # create template
        template = models.WorklistTemplate.objects.create(
            name="test_only_line", protocol=self.protocol
        )
        columns = [
            models.WorklistColumn.objects.create(
                heading="Name",
                meta_type=models.MetadataType.system("Line Name"),
                ordering=1,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="", heading="Position", ordering=2, template=template
            ),
        ]
        # create selection
        selection = self._make_selection()
        # create options
        options = self._make_options(columns)

        # run export
        result = table.WorklistExport(selection, options, template)
        output = result.output()

        # validate results
        lines = output.splitlines()
        # header is correct
        self.assertEqual(lines[0], "Name,Position")
        # multiple rows for lines with pre-made assays
        self.assertEqual(lines[6], "L6,")
        self.assertEqual(lines[7], "L6,")
        self.assertEqual(lines[8], "L6,")
        # single row for lines without assays
        self.assertEqual(lines[29], "L19,")
        self.assertEqual(lines[30], "L20,")

    def test_line_with_metadata(self):
        # set some metadata
        foo = models.MetadataType.objects.create(
            type_name="foo", for_context=models.MetadataType.LINE
        )
        bar = models.MetadataType.objects.create(
            type_name="bar", for_context=models.MetadataType.LINE
        )
        for i, line in enumerate(self.lines):
            if i % 3 == 0:
                line.metadata_add(foo, "fizz")
            if i % 5 == 0:
                line.metadata_add(bar, "buzz")
            line.save()
        # create template
        template = models.WorklistTemplate.objects.create(
            name="test_line_with_metadata", protocol=self.protocol
        )
        columns = [
            models.WorklistColumn.objects.create(
                heading="Name",
                meta_type=models.MetadataType.system("Line Name"),
                ordering=1,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="", heading="Position", ordering=2, template=template
            ),
            models.WorklistColumn.objects.create(
                default_value="",
                heading="Foo",
                meta_type=foo,
                ordering=3,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="",
                heading="Bar",
                meta_type=bar,
                ordering=4,
                template=template,
            ),
        ]
        # create selection
        selection = self._make_selection()
        # create options
        options = self._make_options(columns)

        # run export
        result = table.WorklistExport(selection, options, template)
        output = result.output()

        # validate results
        lines = output.splitlines()
        # header is correct
        self.assertEqual(lines[0], "Name,Position,Foo,Bar")
        # check rows for fizz, buzz, and fizzbuzz
        self.assertEqual(lines[2], "L2,,,")
        self.assertEqual(lines[4], "L4,,fizz,")
        self.assertEqual(lines[8], "L6,,,buzz")
        self.assertEqual(lines[26], "L16,,fizz,buzz")

    def test_line_and_assay_metadata(self):
        # create template
        template = models.WorklistTemplate.objects.create(
            name="test_line_and_assay_metadata", protocol=self.protocol
        )
        columns = [
            models.WorklistColumn.objects.create(
                heading="Name",
                meta_type=models.MetadataType.system("Assay Name"),
                ordering=1,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="", heading="Position", ordering=2, template=template
            ),
            models.WorklistColumn.objects.create(
                default_value="",
                heading="Time",
                meta_type=models.MetadataType.system("Time"),
                ordering=3,
                template=template,
            ),
        ]
        # create selection
        selection = self._make_selection()
        # create options
        options = self._make_options(columns)

        # run export
        result = table.WorklistExport(selection, options, template)
        output = result.output()

        # validate results
        lines = output.splitlines()
        # header is correct
        self.assertEqual(lines[0], "Name,Position,Time")
        # multiple rows for lines with pre-made assays, with correct metadata
        self.assertEqual(lines[6], "L6-A1,,12")
        self.assertEqual(lines[7], "L6-A2,,24")
        self.assertEqual(lines[8], "L6-A3,,36")
        # single row for lines without assays, no metadata
        self.assertEqual(lines[29], "L19-potato-1,,")
        self.assertEqual(lines[30], "L20-potato-1,,")

    def test_with_blanks(self):
        # create template
        template = models.WorklistTemplate.objects.create(
            name="test_with_blanks", protocol=self.protocol
        )
        columns = [
            models.WorklistColumn.objects.create(
                heading="Name",
                meta_type=models.MetadataType.system("Assay Name"),
                ordering=1,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="", heading="Position", ordering=2, template=template
            ),
            models.WorklistColumn.objects.create(
                default_value="",
                heading="Time",
                meta_type=models.MetadataType.system("Time"),
                ordering=3,
                template=template,
            ),
        ]
        # create selection
        selection = self._make_selection()
        # create options with blanks inserted after every ten
        options = self._make_options(columns)
        options.blank_mod = 10
        options.blank_columns = options.columns

        # run export
        result = table.WorklistExport(selection, options, template)
        output = result.output()

        # validate results
        lines = output.splitlines()
        # header is correct
        self.assertEqual(lines[0], "Name,Position,Time")
        # blanks are in correct places
        self.assertEqual(lines[11], ",,")
        self.assertEqual(lines[22], ",,")
        self.assertEqual(lines[33], ",,")


class SBMLUtilTests(TestCase):
    """Unit tests for various utilities used in SBML export."""

    def test_sbml_notes(self):
        builder = sbml.SbmlBuilder()
        notes = builder.create_note_body()
        notes = builder.update_note_body(
            notes,
            **{
                "CONCENTRATION_CURRENT": [0.5],
                "CONCENTRATION_HIGHEST": [1.0],
                "CONCENTRATION_LOWEST": [0.01],
            },
        )
        notes_dict = builder.parse_note_body(notes)
        self.assertEqual(
            dict(notes_dict),
            {
                "CONCENTRATION_CURRENT": "0.5",
                "CONCENTRATION_LOWEST": "0.01",
                "CONCENTRATION_HIGHEST": "1.0",
            },
        )


def test_templatetag_filter_ranged_x_floats():
    point = sbml.Point(x=[33.3], y=[0.0])
    x_range = sbml.Range(min=0.0, max=42.0)
    assert math.isclose(sbml.scaled_x(point, x_range), 366.7857142857143)


def test_templatetag_filter_ranged_x_Decimals():
    point = sbml.Point(x=[decimal.Decimal("33.3")], y=[0.0])
    x_range = sbml.Range(min=0.0, max=decimal.Decimal("42.0"))
    assert math.isclose(sbml.scaled_x(point, x_range), 366.7857142857143)


def test_templatetag_filter_ranged_x_float_value_Decimal_range():
    point = sbml.Point(x=[33.3], y=[0.0])
    x_range = sbml.Range(min=0.0, max=decimal.Decimal("42.0"))
    assert math.isclose(sbml.scaled_x(point, x_range), 366.7857142857143)


def test_templatetag_filter_ranged_x_Decimal_value_float_range():
    point = sbml.Point(x=[decimal.Decimal("33.3")], y=[0.0])
    x_range = sbml.Range(min=0.0, max=42.0)
    assert math.isclose(sbml.scaled_x(point, x_range), 366.7857142857143)
