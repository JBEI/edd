from edd import TestCase
from main import export, models

from . import factory


def bad_function(*args, **kwargs):
    """Always raises an exception"""
    raise Exception


def load_metadata(name):
    uuid = models.SYSTEM_META_TYPES[name]
    return models.MetadataType.objects.get(uuid=uuid)


def test_columnchoice_from_model_default_value():
    default = factory.fake.word()
    column = models.WorklistColumn(default_value=default)
    choice = export.table.ColumnChoice.from_model(column)
    assert choice.get_value(None) == default


def test_columnchoice_convert_none_instance_assay():
    choice = export.table.EmptyChoice()
    sentinel = object()
    result = choice.convert_instance_from_assay(None, default=sentinel)
    assert result is sentinel


def test_columnchoice_convert_none_instance_measurement():
    choice = export.table.ColumnChoice(models.Assay, "", "", lambda: "")
    sentinel = object()
    result = choice.convert_instance_from_measure(None, default=sentinel)
    assert result is sentinel


def test_columnchoice_lookup_exception_gives_empty_string():
    choice = export.table.ColumnChoice(None, None, None, bad_function)
    result = choice.get_value(None)
    assert result == ""


class WorklistExportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = factory.UserFactory()
        # initialize study for worklist
        cls.study = factory.StudyFactory()
        cls.study.userpermission_set.update_or_create(
            permission_type=models.StudyPermission.READ, user=cls.user
        )
        # initialize protocol for worklist
        cls.protocol = factory.ProtocolFactory(name="potato")
        # initialize twenty lines in the study, 1-base index
        cls.lines = [
            factory.LineFactory(name=f"L{l}", study=cls.study) for l in range(1, 21)
        ]
        # initialize 3x assays on lines 6, 8, 10, 12, 14 (1-base)
        # assays at times 12, 24, 36
        time = load_metadata("Time")
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
        return export.table.ExportOption(
            layout=export.table.ExportOption.DATA_COLUMN_BY_LINE,
            separator=export.table.ExportOption.COMMA_SEPARATED_TOKEN,
            data_format=export.table.ExportOption.ALL_DATA,
            line_section=False,
            protocol_section=False,
            columns=[export.table.ColumnChoice.from_model(c) for c in columns],
        )

    def _make_selection(self, user=None):
        user = self.user if user is None else user
        return export.table.ExportSelection(user=user, studyId=[self.study.pk])

    def test_build_list(self):
        # create template
        template = models.WorklistTemplate.objects.create(
            name="test_only_line_metadata", protocol=self.protocol
        )
        # build a worklist
        worklist = export.table.WorklistExport(None, None, template)
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
                meta_type=load_metadata("Line Name"),
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
        result = export.table.WorklistExport(selection, options, template)
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
                meta_type=load_metadata("Line Name"),
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
        result = export.table.WorklistExport(selection, options, template)
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
                meta_type=load_metadata("Assay Name"),
                ordering=1,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="", heading="Position", ordering=2, template=template
            ),
            models.WorklistColumn.objects.create(
                default_value="",
                heading="Time",
                meta_type=load_metadata("Time"),
                ordering=3,
                template=template,
            ),
        ]
        # create selection
        selection = self._make_selection()
        # create options
        options = self._make_options(columns)

        # run export
        result = export.table.WorklistExport(selection, options, template)
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
                meta_type=load_metadata("Assay Name"),
                ordering=1,
                template=template,
            ),
            models.WorklistColumn.objects.create(
                default_value="", heading="Position", ordering=2, template=template
            ),
            models.WorklistColumn.objects.create(
                default_value="",
                heading="Time",
                meta_type=load_metadata("Time"),
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
        result = export.table.WorklistExport(selection, options, template)
        output = result.output()

        # validate results
        lines = output.splitlines()
        # header is correct
        self.assertEqual(lines[0], "Name,Position,Time")
        # blanks are in correct places
        self.assertEqual(lines[11], ",,")
        self.assertEqual(lines[22], ",,")
        self.assertEqual(lines[33], ",,")
