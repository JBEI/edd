"""Tests used to validate the tutorial screencast functionality."""

import codecs
import itertools
import json
import math
import uuid
from io import BytesIO
from unittest.mock import patch

from django.conf import settings
from django.http import QueryDict
from django.test import override_settings
from django.urls import reverse
from requests import codes

from edd import TestCase, utilities
from edd.export import table as export_table
from edd.load import tasks
from edd.load.broker import ImportBroker
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory


def CREATE_PCAP_LINES(study):
    # generate line objects for PCAP tutorial
    first = ("A", "B", "2X")
    second = ("H", "L", "M")
    third = ("h", "l", "m")
    combos = itertools.product(first, second, third)
    for i, (a, b, c) in enumerate(combos, start=1000):
        factory.LineFactory(study=study, id=i, name=f"{a}-{b}{c}")
    for j, d in enumerate(third, start=i + 1):
        factory.LineFactory(study=study, id=j, name=f"BL-M{d}")


class ImportDataTestsMixin:
    """
    Common code for tests of import data. Expects following attributes on self:
        + `target_study` set to a Study model
        + `user` set to a User model
    """

    def _assay_count(self):
        return models.Assay.objects.filter(line__study=self.target_study).count()

    def _measurement_count(self):
        return models.Measurement.objects.filter(
            assay__line__study=self.target_study
        ).count()

    def _value_count(self):
        return models.MeasurementValue.objects.filter(
            measurement__assay__line__study=self.target_study
        ).count()

    def _import_url(self):
        return reverse("main:load:table", kwargs={"slug": self.target_study.slug})

    def _view_url(self):
        return reverse("main:detail", kwargs={"slug": self.target_study.slug})

    def _build_import_context(self, base, import_id):
        # load post data broken up across multiple files
        filename = f"{base}.post.context.json"
        with factory.load_test_file(filename, "rt") as context_file:
            context = json.load(context_file)
        # make sure import_id is a string if a raw UUID is passed
        context.update(importId=str(import_id))
        return context

    def _build_import_pages(self, base):
        # load series data, slicing it up into pages if requested
        filename = f"{base}.post.series.json"
        with factory.load_test_file(filename, "rt") as series_file:
            yield from self._slice_series_pages(series_file)

    def _post_import_pages(self, context, pages, import_id, page_count):
        # pages after first only have "importId", "totalPages", "page", and "series"
        # fake the request(s)
        for i, page in enumerate(pages, start=1):
            payload = {
                "importId": import_id,
                "page": i,
                "series": page,
                "totalPages": page_count,
            }
            # The first request has both context and series data.
            # Subsequent requests will only contain series data.
            if i == 1:
                payload.update(context)
            response = self.client.post(
                self._import_url(), data=payload, content_type="application/json"
            )
            self.assertEqual(response.status_code, codes.accepted)

    def _run_import_view(self, base, import_id, page_count=1):
        # make sure import_id is a string
        import_id = str(import_id)
        context = self._build_import_context(base, import_id)
        pages = self._build_import_pages(base)
        try:
            # mocking celery task, to only test the view itself
            with patch("edd.load.tasks.import_table_task.delay") as mock_task:
                # generate a fake task ID so the view has something for notifications
                mock_task.return_value.id = uuid.uuid4()
                self._post_import_pages(context, pages, import_id, page_count)

                # assert calls to celery
                mock_task.assert_called_once_with(
                    self.target_study.pk, self.user.pk, import_id
                )
            # verify assays are unchanged
            self.assertEqual(self._assay_count(), 0, msg="View changed assay count")
        finally:
            # cleanup
            self.client.delete(
                self._import_url(), data=bytes(import_id, encoding="UTF-8")
            )

    def _run_parse_view(self, filename, filetype, mode):
        with factory.load_test_file(filename) as fp:
            upload = BytesIO(fp.read())
        upload.name = filename
        response = self.client.post(
            reverse("load_flat:parse"),
            data={
                "file": upload,
                "X_EDD_FILE_TYPE": filetype,
                "X_EDD_IMPORT_MODE": mode,
            },
        )
        self.assertEqual(response.status_code, codes.ok)
        with factory.load_test_file(filename + ".json") as fp:
            reader = codecs.getreader("utf-8")
            target = json.load(reader(fp))
        # check that objects are the same when re-serialized with sorted keys
        self.assertEqual(
            json.dumps(target, sort_keys=True),
            json.dumps(response.json(), sort_keys=True),
        )
        return response

    def _run_task(self, base, import_id, context):
        # make sure import_id is a string
        import_id = str(import_id)
        broker = ImportBroker()
        pages = self._build_import_pages(base)
        for _i, page in enumerate(pages, start=1):
            # need to serialize list/dict to JSON string for broker
            encoded = utilities.JSONEncoder.dumps(page)
            broker.add_page(import_id, encoded)
        context.update(totalPages=_i)
        broker.set_context(import_id, utilities.JSONEncoder.dumps(context))
        # running task directly instead of normal call to task.delay()
        tasks.import_table_task(self.target_study.pk, self.user.pk, import_id)

    def _slice_series_pages(self, series_file):
        """
        Read the aggregated series data from file and if configured to test multiple pages,
        break it up into chunks for insertion into the simulated cache. Clients of this
        method must override EDD_IMPORT_PAGE_SIZE to get predictable results.
        """
        series = json.load(series_file)
        item_count = len(series)
        replace = getattr(self, "_replace_series_item_values", None)
        if callable(replace):
            series = map(replace, series)
        page_size = getattr(settings, "EDD_IMPORT_PAGE_SIZE", 100)
        for i in range(0, int(math.ceil(item_count / page_size))):
            start = i * page_size
            end = min(start + page_size, item_count)
            yield list(itertools.islice(series, start, end))


def derive_cache_values(post_str):
    """
    Extracts parts from the post request to be inserted into or extracted from the import cache.
    This requires parsing the request multiple times during the test, but it should be the
    succinct way to avoid duplicating the post data in test inputs, or breaking it up into even
    more files.
    """
    parsed_json = json.loads(post_str)

    # extract series data first.  everything else is context
    series = parsed_json["series"]

    del parsed_json["series"]
    context = json.dumps(parsed_json)
    series = json.dumps(series)
    return context, series


class FBAImportDataTests(ImportDataTestsMixin, TestCase):
    """
    Sets of tests to exercise Import Data views used in Tutorial #4 (Flux Balance Analysis).
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        # TODO: IDs are hard-coded in the *.post.*.json files
        # measurement ID of Optical Density is set to 1 in bootstrap
        factory.LineFactory(id=998, study=cls.target_study, name="BW1")
        factory.LineFactory(id=999, study=cls.target_study, name="arcA")
        factory.MetaboliteFactory(id=898, type_name="D-Glucose")
        factory.MetaboliteFactory(id=899, type_name="Acetate")

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_hplc_import_parse(self):
        response = self._run_parse_view("ImportData_FBA_HPLC.xlsx", "xlsx", "std")
        self.assertEqual(response.status_code, codes.ok)

    def test_hplc_import_task(self):
        task_uuid = uuid.uuid4()
        base = "ImportData_FBA_HPLC.xlsx"
        context = self._build_import_context(base, task_uuid)
        self._run_task(base, task_uuid, context)
        self.assertEqual(self._assay_count(), 2)
        self.assertEqual(self._measurement_count(), 4)
        self.assertEqual(self._value_count(), 28)

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=1000,
    )
    def test_hplc_import_view(self):
        self._run_import_view("ImportData_FBA_HPLC.xlsx", uuid.uuid4())

    def test_od_import_parse(self):
        name = "ImportData_FBA_OD.xlsx"
        response = self._run_parse_view(name, "xlsx", "std")
        self.assertEqual(response.status_code, codes.ok)

    def test_od_import_task(self):
        task_uuid = uuid.uuid4()
        base = "ImportData_FBA_OD.xlsx"
        context = self._build_import_context(base, task_uuid)
        self._run_task(base, task_uuid, context)
        self.assertEqual(self._assay_count(), 2)
        self.assertEqual(self._measurement_count(), 2)
        self.assertEqual(self._value_count(), 14)

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=1000,
    )
    def test_od_import_view(self):
        self._run_import_view("ImportData_FBA_OD.xlsx", uuid.uuid4())


class PCAPImportDataTests(ImportDataTestsMixin, TestCase):
    """
    Sets of tests to exercise Import Data views used in Tutorial #5 (Principal Component Analysis
    of Proteomics).
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        # define expected lines for PCAP files
        CREATE_PCAP_LINES(cls.target_study)

    @classmethod
    def _create_gcms_replace_function(cls, protocol):
        # *.series.json files need some hard-coded IDs
        # this makes a function to insert them
        measurement_type = factory.MeasurementTypeFactory(type_name="Limonene")

        def replace(item):
            item.update(protocol_id=protocol.id, measurement_id=measurement_type.id)
            return item

        return replace

    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)

    def test_gcms_import_parse(self):
        response = self._run_parse_view("ImportData_PCAP_GCMS.csv", "csv", "std")
        self.assertEqual(response.status_code, codes.ok)

    def test_gcms_import_task(self):
        task_uuid = uuid.uuid4()
        base = "ImportData_PCAP_GCMS.csv"
        context = self._build_import_context(base, task_uuid)
        # not using one of the default bootstrap protocols!
        protocol = factory.ProtocolFactory()
        context.update(masterProtocol=protocol.id)
        # not using default bootstrap measurements either
        self._replace_series_item_values = self._create_gcms_replace_function(protocol)
        # now run the task
        self._run_task(base, task_uuid, context)
        # cleanup
        del self._replace_series_item_values
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 30)
        self.assertEqual(self._value_count(), 30)

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=1000,
    )
    def test_gcms_import_view(self):
        self._run_import_view("ImportData_PCAP_GCMS.csv", uuid.uuid4())

    def test_od_import_parse(self):
        response = self._run_parse_view("ImportData_PCAP_OD.xlsx", "xlsx", "std")
        self.assertEqual(response.status_code, codes.ok)

    def test_od_import_task(self):
        task_uuid = uuid.uuid4()
        base = "ImportData_PCAP_OD.xlsx"
        context = self._build_import_context(base, task_uuid)
        self._run_task(base, task_uuid, context)
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 30)
        self.assertEqual(self._value_count(), 30)

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=1000,
    )
    def test_od_import_view(self):
        self._run_import_view("ImportData_PCAP_OD.xlsx", uuid.uuid4())

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=3,
    )
    def test_paged_od_import_view(self):
        self._run_import_view("ImportData_PCAP_OD.xlsx", uuid.uuid4(), page_count=10)

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=3,
    )
    def test_paged_od_import_task(self):
        task_uuid = uuid.uuid4()
        base = "ImportData_PCAP_OD.xlsx"
        context = self._build_import_context(base, task_uuid)
        self._run_task(base, task_uuid, context)
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 30)
        self.assertEqual(self._value_count(), 30)

    def test_proteomics_import_parse(self):
        response = self._run_parse_view("ImportData_PCAP_Proteomics.csv", "csv", "std")
        self.assertEqual(response.status_code, codes.ok)

    def test_proteomics_import_task(self):
        task_uuid = uuid.uuid4()
        base = "ImportData_PCAP_Proteomics.csv"
        context = self._build_import_context(base, task_uuid)
        self._run_task(base, task_uuid, context)
        self.assertEqual(self._assay_count(), 30)
        self.assertEqual(self._measurement_count(), 270)
        self.assertEqual(self._value_count(), 270)

    # future proof the test against local changes to settings that control its behavior
    @override_settings(
        # expire the cache entries after one minute
        EDD_IMPORT_CACHE_LENGTH=60,
        EDD_IMPORT_PAGE_LIMIT=1000,
        EDD_IMPORT_PAGE_SIZE=1000,
    )
    def test_proteomics_import_view(self):
        self._run_import_view("ImportData_PCAP_Proteomics.csv", uuid.uuid4())

    def test_import_delete_view_invalid(self):
        # mocking redis, to only test the view itself
        with patch("main.redis.ScratchStorage") as MockStorage:
            storage = MockStorage.return_value
            # test attempted cache deletion with a non-uuid import key.
            # this must always fail
            response = self.client.delete(
                self._import_url(),
                data=bytes("non-uuid-import-id", encoding="UTF-8"),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, codes.bad_request)
            storage.delete.assert_not_called()
        self.assertEqual(self._assay_count(), 0, msg="View changed assay count")

    def test_import_delete_view_valid(self):
        # mocking redis, to only test the view itself
        with patch("main.redis.ScratchStorage") as MockStorage:
            storage = MockStorage.return_value
            # fake a valid DELETE request
            response = self.client.delete(
                self._import_url(), data=bytes(str(uuid.uuid4()), encoding="UTF-8")
            )
            self.assertEqual(response.status_code, codes.ok)
            storage.delete.assert_called_once()
        self.assertEqual(self._assay_count(), 0, msg="View changed assay count")


class FBAExportDataTests(TestCase):
    """
    Sets of tests to exercise the SBML and Table export views used in Tutorial #4 (Flux
    Balance Analysis).
    """

    TIMES = [0, 7.5, 9.5, 11, 13, 15, 17]
    OD_VALUES = [0.1, 1.49, 2.72, 3.95, 5.69, 6.41, 6.51]
    ACETATE_VALUES = [0, 0.33, 0.59, 0.68, 0.92, 0.89, 0.56]
    GLUCOSE_VALUES = [22.22, 15.48, 10.44, 7.98, 2.84, 0.3, 0]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = factory.StudyFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        # IDs are hard-coded in FBA files in main/tests/files
        line1 = factory.LineFactory(id=998, study=cls.target_study, name="BW1")
        met1 = factory.MetaboliteFactory(id=898, type_name="D-Glucose")
        met2 = factory.MetaboliteFactory(id=899, type_name="Acetate")
        # optical density already defined in bootstrap
        od = models.MeasurementType.objects.get(
            uuid="d7510207-5beb-4d56-a54d-76afedcf14d0"
        )
        values = zip(cls.TIMES, cls.GLUCOSE_VALUES)
        cls._build_measurements(
            1000, models.Protocol.CATEGORY_HPLC, line1, met1, values
        )
        values = zip(cls.TIMES, cls.ACETATE_VALUES)
        cls._build_measurements(
            1001, models.Protocol.CATEGORY_HPLC, line1, met2, values
        )
        values = zip(cls.TIMES, cls.OD_VALUES)
        cls._build_measurements(1002, models.Protocol.CATEGORY_OD, line1, od, values)
        factory.SBMLTemplateFactory(id=666, uuid=uuid.uuid4())

    @classmethod
    def _build_measurements(cls, measurement_id, category, line, metabolite, values):
        protocol = factory.ProtocolFactory(sbml_category=category)
        assay = factory.AssayFactory(line=line, protocol=protocol)
        measurement = factory.MeasurementFactory(
            id=measurement_id, assay=assay, measurement_type=metabolite
        )
        for x, y in values:
            factory.ValueFactory(measurement=measurement, x=[x], y=[y])

    def setUp(self):
        super().setUp()
        self.target_kwargs = {"slug": self.target_study.slug}
        self.client.force_login(self.user)

    def test_step1_sbml_export(self):
        "First step loads the SBML export page, and has some warnings."
        response = self.client.get(reverse("export:sbml"), data={"lineId": 998})
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context["sbml_warnings"]), 6)

    def test_step2_sbml_export(self):
        "Second step selects an SBML Template."
        with factory.load_test_file("ExportData_FBA_step2.post") as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(reverse("export:sbml"), data=POST)
        self.assertEqual(response.status_code, codes.ok)
        self.assertEqual(len(response.context["sbml_warnings"]), 5)

    def test_step3_sbml_export(self):
        "Third step maps metabolites to species/reactions, and selects an export timepoint."
        with factory.load_test_file("ExportData_FBA_step3.post") as fp:
            POST = QueryDict(fp.read())
        response = self.client.post(reverse("export:sbml"), data=POST)
        self.assertEqual(response.status_code, codes.ok)
        # TODO figure out how to test content of chunked responses


class PCAPExportDataTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # run imports to have some data to validate exports
        import_shim = ImportDataTestsMixin()
        cls.target_study = factory.StudyFactory()
        cls.user = UserFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        import_shim.target_study = cls.target_study
        import_shim.user = cls.user
        # define expected lines for PCAP files
        CREATE_PCAP_LINES(cls.target_study)
        # run the imports, so we have data to export
        # import the first
        task1 = uuid.uuid4()
        base1 = "ImportData_PCAP_GCMS.csv"
        context = import_shim._build_import_context(base1, task1)
        # not using one of the default bootstrap protocols!
        protocol = factory.ProtocolFactory()
        context.update(masterProtocol=protocol.id)
        # not using default bootstrap measurements either
        replace = PCAPImportDataTests._create_gcms_replace_function(protocol)
        import_shim._replace_series_item_values = replace
        # then run task
        import_shim._run_task(base1, task1, context)
        del import_shim._replace_series_item_values
        # import the second
        task2 = uuid.uuid4()
        base2 = "ImportData_PCAP_OD.xlsx"
        context = import_shim._build_import_context(base2, task2)
        import_shim._run_task(base2, task2, context)
        # import the third
        task3 = uuid.uuid4()
        base3 = "ImportData_PCAP_Proteomics.csv"
        context = import_shim._build_import_context(base3, task3)
        import_shim._run_task(base3, task3, context)

    def setUp(self):
        super().setUp()
        self.target_kwargs = {"slug": self.target_study.slug}
        self.client.force_login(self.user)

    def _buildColumn(self, model, fieldname, lookup=None):
        # faking the TableOptions functionality selecting columns from forms
        field = model._meta.get_field(fieldname)
        return export_table.ColumnChoice(
            model,
            field.name,
            field.verbose_name,
            field.value_from_object if lookup is None else lookup,
        )

    def test_table_by_line_export(self):
        # make selection for the study
        selection = export_table.ExportSelection(
            self.user, studyId=[self.target_study.pk]
        )
        # make options for a minimal output
        options = export_table.ExportOption(
            columns=[
                self._buildColumn(models.Assay, "name"),
                self._buildColumn(
                    models.Measurement,
                    "measurement_type",
                    lookup=lambda m: m.measurement_type.export_name(),
                ),
            ]
        )
        # run the export
        result = export_table.TableExport(selection, options)
        # check the results
        output = result.output()
        output_lines = output.splitlines()
        self.assertEqual(output_lines[0], "Name,Type,0.0,24.0")
        # header + 330 data rows + blank row
        self.assertEqual(len(output_lines), 332)
        self.assertEqual(output_lines[330], "BL-Mm,Limonene,,119.81367")

    def test_table_by_point_export(self):
        # make selection for the study
        selection = export_table.ExportSelection(
            self.user, studyId=[self.target_study.pk]
        )
        # make options for a minimal output, with by-point layout
        options = export_table.ExportOption(
            layout=export_table.ExportOption.DATA_COLUMN_BY_POINT,
            columns=[
                self._buildColumn(models.Assay, "name"),
                self._buildColumn(
                    models.Measurement,
                    "measurement_type",
                    lookup=lambda m: m.measurement_type.export_name(),
                ),
            ],
        )
        # run the export
        result = export_table.TableExport(selection, options)
        # check the results
        output = result.output()
        output_lines = output.splitlines()
        self.assertEqual(output_lines[0], "Name,Type,X,Y")
        # header + 330 data rows + blank row
        self.assertEqual(len(output_lines), 332)
        self.assertEqual(output_lines[330], "BL-Mm,Limonene,24.0,119.81367")
