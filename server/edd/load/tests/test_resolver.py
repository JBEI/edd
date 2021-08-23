import itertools
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.test import override_settings

from edd import TestCase
from edd.profile.factory import UserFactory
from main import models
from main.tests import factory as main_factory

from .. import exceptions, reporting
from ..broker import LoadRequest
from ..parsers import MeasurementParseRecord, ParseResult
from ..resolver import ImportResolver, TypeResolver
from . import factory


class TypeResolverTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()

    def test_resolve_broad_type(self):
        broad = factory.CategoryFactory()
        tr = TypeResolver(self.user, broad)
        # OD is provided in the default EDD bootstrap
        found = tr.lookup_type("Optical Density")
        assert found.pk
        assert found.type_name == "Optical Density"

    def test_resolve_broad_type_missing(self):
        broad = factory.CategoryFactory()
        tr = TypeResolver(self.user, broad)
        with pytest.raises(ValidationError):
            tr.lookup_type("foobar")

    def test_resolve_broad_type_multiple(self):
        broad = factory.CategoryFactory()
        tr = TypeResolver(self.user, broad)
        main_factory.MeasurementTypeFactory(type_name="foobar")
        main_factory.MeasurementTypeFactory(type_name="foobar")
        with pytest.raises(ValidationError):
            tr.lookup_type("foobar")

    def test_resolve_broad_type_with_pubchem_existing(self):
        broad = factory.CategoryFactory()
        type_A = main_factory.MetaboliteFactory(pubchem_cid="9999")
        tr = TypeResolver(self.user, broad)
        # on_commit hook will never trigger in test
        # but check that something should / should-not happen
        with patch("main.models.measurement_type.transaction") as hook:
            found = tr.lookup_type("CID:9999")
            assert found.pk == type_A.pk
            hook.on_commit.assert_not_called()

    def test_resolve_broad_type_with_pubchem_lookup(self):
        broad = factory.CategoryFactory()
        tr = TypeResolver(self.user, broad)
        # on_commit hook will never trigger in test
        # but check that something should / should-not happen
        with patch("main.models.measurement_type.transaction") as hook:
            found = tr.lookup_type("CID:9999")
            assert found.pubchem_cid == "9999"
            hook.on_commit.assert_called_once()

    def test_resolve_broad_type_with_uniprot_existing(self):
        broad = factory.CategoryFactory()
        type_A = main_factory.ProteinFactory(accession_code="P12345")
        tr = TypeResolver(self.user, broad)
        found = tr.lookup_type("sp|P12345")
        assert found.pk == type_A.pk

    def test_resolve_generic_type(self):
        generic = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.GENERIC
        )
        tr = TypeResolver(self.user, generic)
        found = tr.lookup_type("Optical Density")
        assert found.pk
        assert found.type_name == "Optical Density"

    def test_resolve_generic_type_missing(self):
        generic = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.GENERIC
        )
        tr = TypeResolver(self.user, generic)
        with pytest.raises(ValidationError):
            tr.lookup_type("foobar")

    def test_resolve_generic_type_multiple(self):
        generic = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.GENERIC
        )
        tr = TypeResolver(self.user, generic)
        main_factory.MeasurementTypeFactory(type_name="foobar")
        main_factory.MeasurementTypeFactory(type_name="foobar")
        with pytest.raises(ValidationError):
            tr.lookup_type("foobar")

    def test_resolve_metabolite_type(self):
        metabolomics = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.METABOLITE
        )
        type_A = main_factory.MetaboliteFactory(pubchem_cid="9999")
        tr = TypeResolver(self.user, metabolomics)
        # on_commit hook will never trigger in test
        # but check that something should / should-not happen
        with patch("main.models.measurement_type.transaction") as hook:
            found = tr.lookup_type("CID:9999")
            assert found.pk == type_A.pk
            hook.on_commit.assert_not_called()

    def test_resolve_metabolite_type_invalid(self):
        metabolomics = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.METABOLITE
        )
        tr = TypeResolver(self.user, metabolomics)
        # on_commit hook will never trigger in test
        # but check that something should / should-not happen
        with patch("main.models.measurement_type.transaction") as hook:
            found = tr.lookup_type("CID:9999")
            assert found.pubchem_cid == "9999"
            hook.on_commit.assert_called_once()

    def test_resolve_protein_type(self):
        proteomics = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.PROTEINID
        )
        type_A = main_factory.ProteinFactory(accession_code="P12345")
        tr = TypeResolver(self.user, proteomics)
        found = tr.lookup_type("sp|P12345")
        assert found.pk == type_A.pk

    def test_resolve_transcript_type(self):
        transcriptomics = factory.CategoryFactory(
            type_group=models.MeasurementType.Group.GENEID
        )
        # GeneIdentifiers depend on the user who created it
        update = main_factory.UpdateFactory(mod_by=self.user)
        src = models.Datasource.objects.create(
            name=self.user.username, url="", created=update
        )
        type_A = main_factory.GeneFactory(type_source=src)
        tr = TypeResolver(self.user, transcriptomics)
        found = tr.lookup_type(type_A.type_name)
        assert found.pk == type_A.pk

    def test_resolve_unknown_type(self):
        unknown = factory.CategoryFactory(type_group="foobar")
        tr = TypeResolver(self.user, unknown)
        with pytest.raises(ValidationError):
            tr.lookup_type("foobar")


class ImportResolverTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.target_study = main_factory.StudyFactory()
        cls.target_study.userpermission_set.create(
            user=cls.user, permission_type=models.StudyPermission.WRITE
        )
        cls.BW1 = main_factory.LineFactory(study=cls.target_study, name="BW1")
        cls.arcA = main_factory.LineFactory(study=cls.target_study, name="arcA")
        cls.target_kwargs = {"slug": cls.target_study.slug}
        cls.protocol = main_factory.ProtocolFactory()

    def setUp(self):
        self.load = LoadRequest(
            study_uuid=self.target_study.uuid, protocol_uuid=self.protocol.uuid,
        )
        self._tracker = reporting.tracker(self.load.request)
        self._tracker.__enter__()

    def tearDown(self):
        # no exception info available here, but have to fill the arguments
        self._tracker.__exit__(None, None, None)

    def _generate_measurement_product(self, names=None, types=None, points=None):
        if names is None:
            names = ["BW1", "arcA"]
        if types is None:
            types = ["Optical Density"]
        if points is None:
            points = [*self._make_scalars([0], [1])]
        # create sequential MeasurementParseRecord as product of input iterables
        count = 1
        for name, mtype, point in itertools.product(names, types, points):
            count += 1
            yield MeasurementParseRecord(
                loa_name=name,
                mtype_name=mtype,
                value_format=models.Measurement.Format.SCALAR,
                x_unit_name="hours",
                y_unit_name="n/a",
                data=point,
                src_ids=[count],
            )

    def _make_resolvers(self, parsed: ParseResult):
        resolver = ImportResolver(self.load, parsed)
        type_resolver = TypeResolver(self.user, factory.CategoryFactory())
        return resolver, type_resolver

    def _make_scalars(self, x_list, y_list):
        for x, y in zip(x_list, y_list):
            # outer 2-item list for the point itself
            yield [
                # list for the x-values
                [x],
                # list for the y-values
                [y],
            ]

    def test_resolve_success(self):
        # setup
        mpr = list(self._generate_measurement_product())
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {self.BW1.pk, self.arcA.pk},
            "matched_assays": False,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_matching_assays(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        mpr = list(
            self._generate_measurement_product(names=[assay_A.name, assay_B.name])
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_without_times(self):
        # setup
        mpr = list(self._generate_measurement_product(points=[[[None], [10]]]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.TimeUnresolvableError):
            resolver.resolve(type_resolver)

    def test_resolve_with_times_on_assays(self):
        # setup
        time = models.MetadataType.system("Time")
        assay_A = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: 24}, protocol=self.protocol,
        )
        assay_B = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: 24}, protocol=self.protocol,
        )
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name], points=[[[None], [10]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": False,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": True,
        }

    def test_resolve_without_times_on_assays(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name], points=[[[None], [10]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": False,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_partial_times_on_assays(self):
        # setup
        time = models.MetadataType.system("Time")
        assay_A = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: 24}, protocol=self.protocol,
        )
        # missing time on this one!
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol,)
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name], points=[[[None], [10]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": False,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_overdetermined_time(self):
        # setup
        time = models.MetadataType.system("Time")
        assay_A = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: 24}, protocol=self.protocol,
        )
        assay_B = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: 24}, protocol=self.protocol,
        )
        # including time in points
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name], points=[[[12], [10]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_partial_overdetermined_time(self):
        # setup
        time = models.MetadataType.system("Time")
        assay_A = main_factory.AssayFactory(
            line=self.BW1, metadata={time.pk: 24}, protocol=self.protocol,
        )
        # missing time on this one!
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol,)
        # including time in points
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name], points=[[[12], [10]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_duplicate_lines(self):
        # setup
        main_factory.LineFactory(study=self.target_study, name="BW1")
        main_factory.LineFactory(study=self.target_study, name="arcA")
        mpr = list(self._generate_measurement_product())
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.DuplicateLineError):
            resolver.resolve(type_resolver)

    def test_resolve_with_unmatched_names(self):
        # setup
        mpr = list(self._generate_measurement_product(names=["foo", "bar"]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.UnmatchedStudyInternalsError):
            resolver.resolve(type_resolver)

    def test_resolve_with_extra_unmatched_lines(self):
        # setup
        mpr = list(self._generate_measurement_product(names=["BW1", "arcA", "foobar"]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.UnmatchedLineError):
            resolver.resolve(type_resolver)

    def test_resolve_with_duplicate_assays(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        main_factory.AssayFactory(
            line=self.BW1, name=assay_A.name, protocol=self.protocol
        )
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name], points=[[[None], [10]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.DuplicateAssayError):
            resolver.resolve(type_resolver)

    def test_resolve_with_missing_assays(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        points = [*self._make_scalars([None], [10])]
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name, "foobar"], points=points,
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.UnmatchedAssayError):
            resolver.resolve(type_resolver)

    def test_resolve_with_bad_measurement(self):
        # setup
        mpr = list(self._generate_measurement_product(types=["foobar"]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.UnmatchedMtypeError):
            resolver.resolve(type_resolver)

    @override_settings(EDD_IMPORT_MTYPE_LOOKUP_ERR_LIMIT=1)
    def test_resolve_with_bad_measurement_limit(self):
        # setup
        mpr = list(self._generate_measurement_product(types=["foobar"]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.UnmatchedMtypeError):
            resolver.resolve(type_resolver)

    def test_resolve_without_data(self):
        # setup
        mpr = list(self._generate_measurement_product(points=[None]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=False, has_all_times=False,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.TimeUnresolvableError):
            resolver.resolve(type_resolver)

    def test_resolve_with_existing_values(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        hours = models.MeasurementUnit.objects.get(unit_name="hours")
        na = models.MeasurementUnit.objects.get(unit_name="n/a")
        mtype = main_factory.MeasurementTypeFactory()
        measurement_A = main_factory.MeasurementFactory(
            assay=assay_A, measurement_type=mtype, x_units=hours, y_units=na
        )
        measurement_B = main_factory.MeasurementFactory(
            assay=assay_B, measurement_type=mtype, x_units=hours, y_units=na
        )
        main_factory.ValueFactory(measurement=measurement_A, x=[24])
        main_factory.ValueFactory(measurement=measurement_B, x=[24])
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name],
                types=[mtype.type_name],
                points=[[[24], [1]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 2,
            "conflicted_from_study": 2,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_multiple_existing_values(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        hours = models.MeasurementUnit.objects.get(unit_name="hours")
        na = models.MeasurementUnit.objects.get(unit_name="n/a")
        mtype = main_factory.MeasurementTypeFactory()
        measurement_A = main_factory.MeasurementFactory(
            assay=assay_A, measurement_type=mtype, x_units=hours, y_units=na
        )
        measurement_B = main_factory.MeasurementFactory(
            assay=assay_B, measurement_type=mtype, x_units=hours, y_units=na
        )
        # making multiple existing points for same type at same time
        main_factory.ValueFactory(measurement=measurement_A, x=[24])
        main_factory.ValueFactory(measurement=measurement_A, x=[24])
        main_factory.ValueFactory(measurement=measurement_A, x=[24])
        main_factory.ValueFactory(measurement=measurement_B, x=[24])
        main_factory.ValueFactory(measurement=measurement_B, x=[24])
        main_factory.ValueFactory(measurement=measurement_B, x=[24])
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name],
                types=[mtype.type_name],
                points=[[[24], [1]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 2,
            "conflicted_from_study": 6,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_with_existing_values_allowing_overwrite(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        hours = models.MeasurementUnit.objects.get(unit_name="hours")
        na = models.MeasurementUnit.objects.get(unit_name="n/a")
        mtype = main_factory.MeasurementTypeFactory()
        measurement_A = main_factory.MeasurementFactory(
            assay=assay_A, measurement_type=mtype, x_units=hours, y_units=na
        )
        measurement_B = main_factory.MeasurementFactory(
            assay=assay_B, measurement_type=mtype, x_units=hours, y_units=na
        )
        main_factory.ValueFactory(measurement=measurement_A, x=[24])
        main_factory.ValueFactory(measurement=measurement_B, x=[24])
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name],
                types=[mtype.type_name],
                points=[[[24], [1]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        self.load.options |= LoadRequest.Options.allow_overwrite
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    def test_resolve_handles_missing_units(self):
        # setup
        mpr = [*self._generate_measurement_product()]
        mpr.append(
            MeasurementParseRecord(
                loa_name="BW1",
                mtype_name="Optical Density",
                value_format=models.Measurement.Format.SCALAR,
                # forcing units to be None
                x_unit_name=None,
                y_unit_name=None,
                data=next(self._make_scalars([6], [7])),
                src_ids=[99],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.UnsupportedUnitsError):
            resolver.resolve(type_resolver)

    def test_resolve_handles_missing_data(self):
        # setup
        mpr = [*self._generate_measurement_product()]
        mpr.append(
            MeasurementParseRecord(
                loa_name="BW1",
                mtype_name="Optical Density",
                value_format=models.Measurement.Format.SCALAR,
                x_unit_name="hours",
                y_unit_name="n/a",
                # forcing this to be None
                data=None,
                src_ids=[99],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {self.BW1.pk, self.arcA.pk},
            "matched_assays": False,
            "totalPages": 1,
            "total_vals": 3,
            "use_assay_times": False,
        }

    def test_resolve_handles_non_sequence_src_ids(self):
        # setup
        mpr = [
            MeasurementParseRecord(
                loa_name="BW1",
                mtype_name="Optical Density",
                value_format=models.Measurement.Format.SCALAR,
                x_unit_name="hours",
                y_unit_name="n/a",
                data=next(self._make_scalars([6], [7])),
                # forcing this to not be list/tuple type
                src_ids="not-a-list",
            )
        ]
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 0,
            "conflicted_from_study": 0,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {self.BW1.pk},
            "matched_assays": False,
            "totalPages": 1,
            "total_vals": 1,
            "use_assay_times": False,
        }

    def test_resolve_with_existing_values_partial(self):
        # setup
        assay_A = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        assay_B = main_factory.AssayFactory(line=self.BW1, protocol=self.protocol)
        hours = models.MeasurementUnit.objects.get(unit_name="hours")
        na = models.MeasurementUnit.objects.get(unit_name="n/a")
        mtype = main_factory.MeasurementTypeFactory()
        measurement_A = main_factory.MeasurementFactory(
            assay=assay_A, measurement_type=mtype, x_units=hours, y_units=na
        )
        main_factory.ValueFactory(measurement=measurement_A, x=[24])
        mpr = list(
            self._generate_measurement_product(
                names=[assay_A.name, assay_B.name],
                types=[mtype.type_name],
                points=[[[24], [1]]],
            )
        )
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec
        context = resolver.resolve(type_resolver)
        # asserts
        assert context == {
            "conflicted_from_import": 1,
            "conflicted_from_study": 1,
            "file_has_times": True,
            "file_has_units": True,
            "importId": self.load.request,
            "loa_pks": {assay_A.pk, assay_B.pk},
            "matched_assays": True,
            "totalPages": 1,
            "total_vals": 2,
            "use_assay_times": False,
        }

    @override_settings(
        # forcing paging and going over limit
        EDD_IMPORT_PAGE_LIMIT=1,
        EDD_IMPORT_PAGE_SIZE=1,
    )
    def test_resolve_with_page_overflow(self):
        # setup
        mpr = list(self._generate_measurement_product())
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.ImportTooLargeError):
            resolver.resolve(type_resolver)

    def test_resolve_with_time_clash(self):
        # setup
        mpr = list(self._generate_measurement_product(names=["BW1", "BW1"]))
        parsed = ParseResult(
            series_data=mpr, record_src="row", any_time=True, has_all_times=True,
        )
        resolver, type_resolver = self._make_resolvers(parsed)
        # exec + assert
        with pytest.raises(exceptions.MeasurementCollisionError):
            resolver.resolve(type_resolver)
