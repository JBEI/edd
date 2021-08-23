import pytest

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory as main_factory

from .. import exceptions, reporting
from ..broker import LoadRequest
from ..executor import ImportExecutor


class ImportExecutorSetupTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()

    def test_executor_setup_from_created(self):
        load = LoadRequest(status=LoadRequest.Status.CREATED)
        with pytest.raises(exceptions.IllegalTransitionError):
            executor = ImportExecutor(load, self.user)
            executor.start()

    def test_executor_setup_from_unsaved(self):
        load = LoadRequest(status=LoadRequest.Status.RESOLVED)
        # when the LoadRequest not in backend, transition will fail
        with pytest.raises(exceptions.IllegalTransitionError):
            executor = ImportExecutor(load, self.user)
            executor.start()

    def test_executor_setup_from_resolved(self):
        load = LoadRequest(status=LoadRequest.Status.RESOLVED)
        try:
            # storing the LoadRequest in backend will allow transition
            load.store()
            executor = ImportExecutor(load, self.user)
            executor.start()
            assert load.status == LoadRequest.Status.PROCESSING
        finally:
            load.retire()

    def test_executor_setup_from_ready(self):
        load = LoadRequest(status=LoadRequest.Status.READY)
        try:
            # storing the LoadRequest in backend will allow transition
            load.store()
            executor = ImportExecutor(load, self.user)
            executor.start()
            assert load.status == LoadRequest.Status.PROCESSING
        finally:
            load.retire()

    def test_executor_setup_from_aborted(self):
        load = LoadRequest(status=LoadRequest.Status.ABORTED)
        try:
            # storing the LoadRequest in backend will allow transition
            load.store()
            executor = ImportExecutor(load, self.user)
            executor.start()
            assert load.status == LoadRequest.Status.PROCESSING
        finally:
            load.retire()

    def test_executor_setup_from_failed(self):
        load = LoadRequest(status=LoadRequest.Status.FAILED)
        try:
            # storing the LoadRequest in backend will allow transition
            load.store()
            executor = ImportExecutor(load, self.user)
            executor.start()
            assert load.status == LoadRequest.Status.PROCESSING
        finally:
            load.retire()

    def test_executor_setup_from_processing(self):
        load = LoadRequest(status=LoadRequest.Status.PROCESSING)
        with pytest.raises(exceptions.IllegalTransitionError):
            executor = ImportExecutor(load, self.user)
            executor.start()

    def test_executor_setup_from_completed(self):
        load = LoadRequest(status=LoadRequest.Status.COMPLETED)
        with pytest.raises(exceptions.IllegalTransitionError):
            executor = ImportExecutor(load, self.user)
            executor.start()

    def test_executor_without_context_manager(self):
        load = LoadRequest(status=LoadRequest.Status.CREATED)
        executor = ImportExecutor(load, self.user)
        with pytest.raises(exceptions.IllegalTransitionError):
            executor.import_series_data([])
        assert load.status == LoadRequest.Status.CREATED


class ImportExecutorRunningTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.protocol = main_factory.ProtocolFactory()
        cls.target_study = main_factory.StudyFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        cls.BW1 = main_factory.LineFactory(study=cls.target_study, name="BW1")
        cls.arcA = main_factory.LineFactory(study=cls.target_study, name="arcA")
        cls.mtype = main_factory.MeasurementTypeFactory()
        cls.x_unit = main_factory.UnitFactory()
        cls.y_unit = main_factory.UnitFactory()

    def setUp(self):
        self.load = LoadRequest(
            protocol_uuid=self.protocol.uuid,
            status=LoadRequest.Status.READY,
            study_uuid=self.target_study.uuid,
            x_units_name=self.x_unit.unit_name,
            y_units_name=self.y_unit.unit_name,
        )
        # storing the LoadRequest in backend will allow transitions
        self.load.store()

    def tearDown(self):
        self.load.retire()

    def _generate_series(self, *, assays=None, lines=None, series=None):
        idkey = "line_id"
        if assays is not None:
            idkey = "assay_id"
            objects = assays
        elif lines is None:
            objects = [self.BW1, self.arcA]
        else:
            objects = lines
        if series is None:
            series = [
                [*self._make_scalars(range(5), range(5))],
                [*self._make_scalars(range(5), range(5))],
            ]
        for obj, data in zip(objects, series):
            yield {
                "compartment": models.Measurement.Compartment.UNKNOWN,
                "data": data,
                "format": models.Measurement.Format.SCALAR,
                idkey: obj.pk,
                "measurement_id": self.mtype.pk,
                "x_unit_id": self.x_unit.pk,
                "y_unit_id": self.y_unit.pk,
            }

    def _make_scalars(self, x_list, y_list):
        for x, y in zip(x_list, y_list):
            # outer 2-item list for the point itself
            yield [
                # list for the x-values
                [x],
                # list for the y-values
                [y],
            ]

    def test_executor_normal_import(self):
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                "loa_pks": {self.BW1.pk, self.arcA.pk},
                "matched_assays": False,
                "use_assay_times": False,
            }
        )
        # default series makes 5x points per line
        # with 2x lines
        executor.import_series_data(self._generate_series())
        added, updated = executor.finish_import()
        # asserts
        assert added == 10
        assert updated == 0
        assert self.load.status == LoadRequest.Status.COMPLETED

    def test_executor_with_existing_assays(self):
        main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                "loa_pks": {self.BW1.pk, self.arcA.pk},
                "matched_assays": False,
                "use_assay_times": False,
            }
        )
        # default series makes 5x points per line
        # with 2x lines
        executor.import_series_data(self._generate_series())
        added, updated = executor.finish_import()
        # asserts
        assert added == 10
        assert updated == 0
        assert self.load.status == LoadRequest.Status.COMPLETED

    def test_executor_with_existing_assays_and_times(self):
        time = models.MetadataType.system("Time")
        x = 12
        y = 42
        assay_A = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: x}, protocol=self.protocol,
        )
        assay_B = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: x}, protocol=self.protocol,
        )
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                "loa_pks": {assay_A.pk, assay_B.pk},
                "matched_assays": True,
                "use_assay_times": True,
            }
        )
        executor.import_series_data(
            self._generate_series(
                assays=[assay_A, assay_B],
                series=[
                    [*self._make_scalars([None], [y])],
                    [*self._make_scalars([None], [y])],
                ],
            )
        )
        added, updated = executor.finish_import()
        # asserts
        assert added == 2
        assert updated == 0
        assert self.load.status == LoadRequest.Status.COMPLETED
        qs = models.MeasurementValue.objects.filter(measurement__assay=assay_A)
        assert [*qs.values_list("x", "y")] == [([x], [y])]
        qs = models.MeasurementValue.objects.filter(measurement__assay=assay_B)
        assert [*qs.values_list("x", "y")] == [([x], [y])]

    def test_executor_with_assay_lookup_errors(self):
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                # 0 will never be an assay ID
                "loa_pks": {0},
                "matched_assays": True,
                "use_assay_times": False,
            }
        )
        with pytest.raises(exceptions.UnmatchedAssayError):
            executor.import_series_data([])
        assert self.load.status == LoadRequest.Status.FAILED

    def test_executor_with_line_lookup_errors(self):
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                # 0 will never be a line ID
                "loa_pks": {0},
                "matched_assays": False,
                "use_assay_times": False,
            }
        )
        with pytest.raises(exceptions.UnmatchedLineError):
            executor.import_series_data([])
        assert self.load.status == LoadRequest.Status.FAILED

    def test_executor_with_partial_time_lookup_errors(self):
        time = models.MetadataType.system("Time")
        # has time
        assay_A = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: "12"}, protocol=self.protocol,
        )
        # missing time
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        with reporting.tracker(self.load.request):
            executor = ImportExecutor(self.load, self.user)
            executor.start()
            executor.parse_context(
                {
                    "loa_pks": {assay_A.pk, assay_B.pk},
                    "matched_assays": True,
                    "use_assay_times": True,
                }
            )
            with pytest.raises(exceptions.MissingAssayTimeError):
                executor.import_series_data([])
        assert self.load.status == LoadRequest.Status.FAILED

    def test_executor_block_overwrite_import(self):
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                "loa_pks": {assay_A.pk, assay_B.pk},
                "matched_assays": True,
                "use_assay_times": False,
            }
        )
        series = [*self._generate_series(assays=[assay_A, assay_B])]
        executor.import_series_data(series)
        added, updated = executor.finish_import()
        # reset load after finish
        self.load.status = LoadRequest.Status.PROCESSING
        self.load.store()
        # now going again to get overwrites
        executor.import_series_data(series)
        with pytest.raises(exceptions.UnplannedOverwriteError):
            executor.finish_import()
        assert self.load.status == LoadRequest.Status.FAILED
        assert added == 10
        assert updated == 0

    def test_executor_allow_overwrite_import(self):
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        self.load.options |= LoadRequest.Options.allow_overwrite
        executor = ImportExecutor(self.load, self.user)
        executor.start()
        executor.parse_context(
            {
                "loa_pks": {assay_A.pk, assay_B.pk},
                "matched_assays": True,
                "use_assay_times": False,
            }
        )
        series = [*self._generate_series(assays=[assay_A, assay_B])]
        executor.import_series_data(series)
        executor.finish_import()
        # reset load after finish
        self.load.status = LoadRequest.Status.PROCESSING
        self.load.store()
        # now going again to get overwrites
        executor.import_series_data(series)
        added, updated = executor.finish_import()
        # asserts
        assert added == 10
        assert updated == 10
        assert self.load.status == LoadRequest.Status.COMPLETED
