import io
import pathlib

import environ
import libsbml
from django.apps import apps as django_apps
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.files.base import ContentFile
from django.db import migrations, models

from edd.fields import FileField, VarCharField
from main.models import common, core, measurement_type, permission

env = environ.Env()


def bootstrap(apps, schema_editor):
    # load the User model, create system user
    User = apps.get_model("profile", "User")
    system = User.objects.create(
        email=env("EDD_EMAIL", default="root@localhost"),
        is_active=True,
        is_staff=True,
        is_superuser=True,
        username="system",
    )
    # load the Update model, create update for all the following items
    Update = apps.get_model("main", "Update")
    now = Update.objects.create(mod_by=system, path=f"!{__name__}", origin="localhost")
    # create bootstrap objects -- MetadataType
    bootstrap_metadata_type(apps.get_model("main", "MetadataType"))
    # create bootstrap objects -- MeasurementUnit
    boostrap_measurement_unit(apps.get_model("main", "MeasurementUnit"))
    # create bootstrap objects -- Protocol
    bootstrap_protocol(apps.get_model("main", "Protocol"), system, now)
    # create bootstrap objects -- MeasurementType
    bootstrap_measurement_type(apps)
    # create bootstrap objects -- WorklistTemplate, WorklistColumn
    bootstrap_worklist(apps, now)
    # set default site
    set_default_site(apps)
    # create bootstrap objects -- SBMLTemplate
    bootstrap_template(apps, now)


def bootstrap_metadata_type(MetadataType):
    # constants on main.models.MetadataType
    STUDY = "S"
    LINE = "L"
    ASSAY = "A"
    MetadataType.objects.create(
        default_value="200",
        for_context=LINE,
        postfix="rpm",
        type_i18n="main.models.Line.Shaking_speed",
        type_name="Shaking speed",
        uuid="09d8056b-b0f3-4975-aa41-0e64575d179b",
    )
    MetadataType.objects.create(
        default_value="0.1",
        for_context=LINE,
        type_i18n="main.models.Line.Starting_OD",
        type_name="Starting OD",
        uuid="687c1076-c7f0-4a05-8208-54fac833e753",
    )
    MetadataType.objects.create(
        default_value="None",
        for_context=LINE,
        type_i18n="main.models.Line.Induction",
        type_name="Induction",
        uuid="65ed1a39-a74e-4087-9f9d-1e52ad357321",
    )
    MetadataType.objects.create(
        for_context=LINE,
        type_i18n="main.models.Line.Volume",
        type_name="Volume",
        uuid="c7386ba5-9973-4a2e-896d-66d9e1d6d33d",
    )
    MetadataType.objects.create(
        for_context=LINE,
        postfix="mL",
        type_i18n="main.models.Line.Culture_Volume",
        type_name="Culture Volume",
        uuid="56f093ea-9aaf-4dc6-b939-1e99b6d90e5d",
    )
    MetadataType.objects.create(
        for_context=LINE,
        postfix="mL",
        type_i18n="main.models.Line.Flask_Volume",
        type_name="Flask Volume",
        uuid="1b6c71b1-bb71-44d0-9664-fbade255c03a",
    )
    MetadataType.objects.create(
        for_context=ASSAY,
        type_i18n="main.models.Assay.Time",
        type_name="Time",
        uuid="6629231d-4ef0-48e3-a21e-df8db6dfbb72",
    )
    MetadataType.objects.create(
        default_value="37",
        for_context=LINE,
        postfix="\u00baC",
        type_i18n="main.models.Line.Growth_temperature",
        type_name="Growth temperature",
        uuid="fe685261-ca5d-45a3-8121-3a3279025ab2",
    )
    MetadataType.objects.create(
        default_value="--",
        for_context=LINE,
        type_i18n="main.models.Line.Media",
        type_name="Media",
        uuid="463546e4-a67e-4471-a278-9464e78dbc9d",
    )
    MetadataType.objects.create(
        default_value="",
        for_context=LINE,
        type_i18n="main.models.Line.gCDW_L_OD600",
        type_name="gCDW/L/OD600",
        uuid="e7e33bf0-7823-4162-8f43-1fe099233b43",
    )
    MetadataType.objects.create(
        default_value="flush",
        for_context=ASSAY,
        type_i18n="main.models.Line.Sample_Name",
        type_name="Sample Name",
        uuid="f3159ae8-2747-4a43-bf0f-ab89f349869b",
    )
    MetadataType.objects.create(
        for_context=STUDY,
        type_field="name",
        type_i18n="main.models.Study.name",
        type_name="Study Name",
        uuid="57bd48f7-d805-4ac9-9773-32051b05bcaf",
    )
    MetadataType.objects.create(
        for_context=STUDY,
        input_type="textarea",
        type_field="description",
        type_i18n="main.models.Study.description",
        type_name="Study Description",
        uuid="82f83ffc-074f-402c-b84b-b99c837190c5",
    )
    MetadataType.objects.create(
        for_context=STUDY,
        input_type="user",
        type_field="contact",
        type_i18n="main.models.Study.contact",
        type_name="Study Contact",
        uuid="6254c4be-6ed3-4f3e-8b13-c0fe2d44fe7c",
    )
    MetadataType.objects.create(
        for_context=STUDY,
        type_field="contact_extra",
        type_i18n="main.models.Study.contact_extra",
        type_name="Study Contact (external)",
        uuid="700a091d-6c81-4302-bde8-fdc5de3d03cd",
    )
    MetadataType.objects.create(
        for_context=LINE,
        type_field="name",
        type_i18n="main.models.Line.name",
        type_name="Line Name",
        uuid="b388bcaa-d14b-4d7f-945e-a6fcb60142f2",
    )
    MetadataType.objects.create(
        for_context=LINE,
        input_type="textarea",
        type_field="description",
        type_i18n="main.models.Line.description",
        type_name="Line Description",
        uuid="5fe84549-9a97-47d2-a897-8c18dd8fd34a",
    )
    MetadataType.objects.create(
        for_context=LINE,
        input_type="checkbox",
        type_field="control",
        type_i18n="main.models.Line.control",
        type_name="Control",
        uuid="8aa26735-e184-4dcd-8dd1-830ec240f9e1",
    )
    MetadataType.objects.create(
        for_context=LINE,
        input_type="user",
        type_field="contact",
        type_i18n="main.models.Line.contact",
        type_name="Line Contact",
        uuid="13672c8a-2a36-43ed-928f-7d63a1a4bd51",
    )
    MetadataType.objects.create(
        for_context=LINE,
        input_type="user",
        type_field="experimenter",
        type_i18n="main.models.Line.experimenter",
        type_name="Line Experimenter",
        uuid="974c3367-f0c5-461d-bd85-37c1a269d49e",
    )
    MetadataType.objects.create(
        for_context=LINE,
        input_type="carbon_source",
        type_field="carbon_source",
        type_i18n="main.models.Line.carbon_source",
        type_name="Carbon Source(s)",
        uuid="4ddaf92a-1623-4c30-aa61-4f7407acfacc",
    )
    MetadataType.objects.create(
        for_context=LINE,
        input_type="strain",
        type_field="strains",
        type_i18n="main.models.Line.strains",
        type_name="Strain(s)",
        uuid="292f1ca7-30de-4ba1-89cd-87d2f6291416",
    )
    MetadataType.objects.create(
        for_context=ASSAY,
        type_field="name",
        type_i18n="main.models.Assay.name",
        type_name="Assay Name",
        uuid="33125862-66b2-4d22-8966-282eb7142a45",
    )
    MetadataType.objects.create(
        for_context=ASSAY,
        input_type="textarea",
        type_field="description",
        type_i18n="main.models.Assay.description",
        type_name="Assay Description",
        uuid="4929a6ad-370c-48c6-941f-6cd154162315",
    )
    MetadataType.objects.create(
        for_context=ASSAY,
        input_type="user",
        type_field="experimenter",
        type_i18n="main.models.Assay.experimenter",
        type_name="Assay Experimenter",
        uuid="15105bee-e9f1-4290-92b2-d7fdcb3ad68d",
    )
    MetadataType.objects.create(
        for_context=LINE,
        type_name="Induction OD",
        uuid="486f6f77-aafa-420e-a582-575753b24feb",
    )
    MetadataType.objects.create(
        for_context=ASSAY,
        type_i18n="main.models.Assay.original",
        type_name="Original Name",
        uuid="5ef6500e-0f8b-4eef-a6bd-075bcb655caa",
    )
    MetadataType.objects.create(
        for_context=LINE,
        type_i18n="main.models.Line.carbon_src_workaround",
        type_name="Carbon Sources (Workaround)",
        uuid="814ab824-3cda-49cb-b838-904236720041",
    )


def boostrap_measurement_unit(MeasurementUnit):
    # constants on main.models.MeasurementType.Group
    GENERIC = "_"
    METABOLITE = "m"
    GENEID = "g"
    MeasurementUnit.objects.create(
        display=False, type_group=METABOLITE, unit_name="n/a"
    )
    MeasurementUnit.objects.create(type_group=METABOLITE, unit_name="hours")
    MeasurementUnit.objects.create(type_group=METABOLITE, unit_name="g/L")
    MeasurementUnit.objects.create(
        alternate_names="mol", type_group=METABOLITE, unit_name="M"
    )
    MeasurementUnit.objects.create(type_group=METABOLITE, unit_name="µM")
    MeasurementUnit.objects.create(
        alternate_names="mmol/L", type_group=METABOLITE, unit_name="mM"
    )
    MeasurementUnit.objects.create(type_group=METABOLITE, unit_name="mg/L")
    MeasurementUnit.objects.create(type_group=METABOLITE, unit_name="µg/L")
    MeasurementUnit.objects.create(type_group=METABOLITE, unit_name="Cmol")
    MeasurementUnit.objects.create(type_group=GENEID, unit_name="RPKM")
    MeasurementUnit.objects.create(type_group=GENEID, unit_name="FPKM")
    MeasurementUnit.objects.create(type_group=GENEID, unit_name="counts")
    MeasurementUnit.objects.create(display=False, type_group=GENERIC, unit_name="MEFL")


def bootstrap_protocol(Protocol, system, now):
    protocols = [
        Protocol.objects.create(
            categorization="TPOMICS",
            created=now,
            name="Targeted Proteomics",
            owned_by=system,
            updated=now,
            uuid="ec5b98a7-ea17-4305-8dbb-f2f068df5a99",
        ),
        Protocol.objects.create(
            categorization="HPLC",
            created=now,
            name="HPLC",
            owned_by=system,
            updated=now,
            uuid="3070a92d-9c9b-43ae-aafb-727f7fb46eca",
        ),
        Protocol.objects.create(
            categorization="OD",
            created=now,
            name="OD600",
            owned_by=system,
            updated=now,
            uuid="29811326-4c2a-400c-acaa-c947ae353390",
        ),
        Protocol.objects.create(
            categorization="LCMS",
            created=now,
            name="GC-MS",
            owned_by=system,
            updated=now,
            uuid="b4a8d315-92d3-4225-a30d-b4df13d4220e",
        ),
    ]
    for p in protocols:
        p.updates.add(now)


def bootstrap_worklist(apps, now):
    MetadataType = apps.get_model("main", "MetadataType")
    Protocol = apps.get_model("main", "Protocol")
    WorklistTemplate = apps.get_model("main", "WorklistTemplate")
    WorklistColumn = apps.get_model("main", "WorklistColumn")
    # get the "Targeted Proteomics" Protocol
    protocol = Protocol.objects.get(uuid="ec5b98a7-ea17-4305-8dbb-f2f068df5a99")
    # get the "Line Name" MetadataType
    line_name = MetadataType.objects.get(uuid="b388bcaa-d14b-4d7f-945e-a6fcb60142f2")
    # create the worklist
    template = WorklistTemplate.objects.create(
        created=now,
        name="Agilent GC-MS",
        protocol=protocol,
        updated=now,
        uuid="49024cc1-8c48-4511-a529-fc5a8f3d7bd9",
    )
    template.updates.add(now)
    # create the columns
    WorklistColumn.objects.create(
        heading="Sample Name", meta_type=line_name, ordering=1, template=template
    )
    WorklistColumn.objects.create(
        heading="Sample Position", ordering=2, template=template
    )
    WorklistColumn.objects.create(heading="Method-QQQ", ordering=3, template=template)
    WorklistColumn.objects.create(
        default_value="D:\\%(study)s_%(contact.initials)s_"
        "%(experimenter.initials)s_%(id)s_%(today)s_%(name)s",
        heading="Data File",
        help_text="Cell values will replace '%(___)s' with the value "
        "of the name inside the parenthesis. Possible values include: "
        "id, study, today (YYYYMMDD), blank (counter value for 'blank' flush rows), "
        "contact.initials, name.",
        ordering=4,
        template=template,
    )
    WorklistColumn.objects.create(heading="Inj Vol (ul)", ordering=5, template=template)


def bootstrap_measurement_type(apps):
    MeasurementType = apps.get_model("main", "MeasurementType")
    GENERIC = "_"
    MeasurementType.objects.create(
        type_group=GENERIC,
        type_name="Optical Density",
        uuid="d7510207-5beb-4d56-a54d-76afedcf14d0",
    )


def bootstrap_template(apps, now):
    """Adds the default SBML template for EDD tutorial."""
    # define models
    SBMLTemplate = apps.get_model("main", "SBMLTemplate")
    Attachment = apps.get_model("main", "Attachment")
    # load template file and copy to temporary buffer
    conf = django_apps.get_app_config("main")
    template_file = pathlib.Path(conf.path) / "fixtures" / "StdEciJO1366.xml"
    # Create objects
    template = SBMLTemplate(
        name="StdEciJO1366",
        description="JO1366 with standardized names",
        uuid="d9cca866-962f-49cd-9809-292263465bfa",
        created=now,
        updated=now,
    )
    template.save()
    with open(template_file, "rb") as fp, io.BytesIO() as buff:
        buff.write(fp.read())
        cf = ContentFile(buff.getbuffer())
        sbml_file = Attachment(
            object_ref=template,
            file=cf,
            filename="StdEciJO1366.xml",
            mime_type="text/xml",
            file_size=template_file.stat().st_size,
            created=now,
        )
        sbml_file.save()
        # work-around: above save isn't actually saving the file
        sbml_file.file.save(sbml_file.filename, cf)
    # re-save SBMLTemplate object, getting around the chicken-and-egg problem
    template.sbml_file = sbml_file
    # can these be calculated from the model?
    template.biomass_calculation = 8.78066
    template.biomass_exchange_name = "R_Ec_biomass_iJO1366_core_53p95M"
    template.save()
    template_sync_species(apps, template)


def set_default_site(apps):
    """
    Changes the default site from example.com to whatever is in VIRTUAL_HOST environment.
    """
    Site = apps.get_model("sites", "Site")
    env = environ.Env()
    domain = env("VIRTUAL_HOST", default="localhost")
    # use the last if a comma-delimited list
    domain = domain.split(",")[-1]
    Site.objects.create(domain=domain, name="EDD")


# see: main.tasks.template_sync_species(template_id)
# the migration cannot use the "real" function, as it references the latest form
# of the models used, rather than the models as they exist at this point in the
# chain of migrations.
def template_sync_species(apps, instance):
    """
    Task parses an SBML document, then creates MetaboliteSpecies and
    MetaboliteExchange records for every species and single-reactant reaction
    in the model.
    """
    with instance.sbml_file.file.open() as upload:
        doc = libsbml.readSBMLFromString(upload.read().decode("utf-8"))
    model = doc.getModel()
    # filter to only those for the updated template
    MetaboliteSpecies = apps.get_model("main", "MetaboliteSpecies")
    MetaboliteExchange = apps.get_model("main", "MetaboliteExchange")
    species_qs = MetaboliteSpecies.objects.filter(sbml_template=instance)
    exchange_qs = MetaboliteExchange.objects.filter(sbml_template=instance)
    exist_species = set(species_qs.values_list("species", flat=True))
    exist_exchange = set(exchange_qs.values_list("exchange_name", flat=True))
    # creating any records not in the database
    for species in map(lambda s: s.getId(), model.getListOfSpecies()):
        if species not in exist_species:
            MetaboliteSpecies.objects.get_or_create(
                sbml_template=instance, species=species
            )
        else:
            exist_species.discard(species)
    reactions = map(
        lambda r: (r.getId(), r.getListOfReactants()), model.getListOfReactions()
    )
    for reaction, reactants in reactions:
        if len(reactants) == 1 and reaction not in exist_exchange:
            MetaboliteExchange.objects.get_or_create(
                sbml_template=instance,
                exchange_name=reaction,
                reactant_name=reactants[0].getSpecies(),
            )
        else:
            exist_exchange.discard(reaction)
    # removing any records in the database not in the template document
    species_qs.filter(species__in=exist_species).delete()
    exchange_qs.filter(exchange_name__in=exist_exchange).delete()


class Migration(migrations.Migration):

    replaces = [
        ("main", "0001_edd-schema-init"),
        ("main", "0002_edd-data-bootstrap"),
        ("main", "0003_metabolite_pubchem"),
        ("main", "0004_set-assay-names"),
        ("main", "0005_default-sbml-template"),
        ("main", "0006_add-protein-strain-link"),
        ("main", "0007_add-pubchem-cid"),
        ("main", "0008_unique_shortname"),
        ("main", "0009_add-gene-strain-link"),
        ("main", "0010_remove_line_replicate"),
        ("main", "0011_categorization_labeling"),
        ("main", "0012_jsonb-metadata"),
        ("main", "0013_remove-hstore"),
        ("main", "0014_study-pk-for-export"),
        ("main", "0015_typo-fix"),
        ("main", "0016_permission-refactor"),
        ("main", "0017_carbon-src"),
        ("main", "0018_provisional-types"),
        ("main", "0019_remove_metadata_size_and_class"),
        ("main", "0020_worklist_unique_ordering"),
        ("main", "0021_measurement_format_values"),
        ("main", "0022_use_varchar"),
    ]

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("auth", "0011_update_proxy_permissions"),
        ("sites", "0002_alter_domain_unique"),
    ]

    operations = [
        migrations.CreateModel(
            name="Datasource",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "name",
                    VarCharField(
                        help_text="The source used for information on a measurement type.",
                        verbose_name="Datasource",
                    ),
                ),
                (
                    "url",
                    VarCharField(
                        blank=True,
                        default="",
                        help_text="URL of the source.",
                        verbose_name="URL",
                    ),
                ),
                (
                    "download_date",
                    models.DateField(
                        auto_now=True,
                        help_text="Date when information was accessed and copied.",
                        verbose_name="Download Date",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="EDDObject",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "metadata",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="JSON-based metadata dictionary.",
                        verbose_name="Metadata",
                    ),
                ),
                (
                    "name",
                    VarCharField(help_text="Name of this object.", verbose_name="Name"),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Description of this object.",
                        null=True,
                        verbose_name="Description",
                    ),
                ),
                (
                    "active",
                    models.BooleanField(
                        default=True,
                        help_text="Flag showing if this object is active and displayed.",
                        verbose_name="Active",
                    ),
                ),
                (
                    "uuid",
                    models.UUIDField(
                        editable=False,
                        help_text="Unique identifier for this object.",
                        unique=True,
                        verbose_name="UUID",
                    ),
                ),
            ],
            options={"db_table": "edd_object"},
            bases=(models.Model, common.EDDSerialize),
        ),
        migrations.CreateModel(
            name="MeasurementType",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "type_name",
                    VarCharField(
                        help_text="Name of this Measurement Type.",
                        verbose_name="Measurement Type",
                    ),
                ),
                (
                    "short_name",
                    VarCharField(
                        blank=True,
                        help_text="(DEPRECATED) Short name used in SBML output.",
                        null=True,
                        verbose_name="Short Name",
                    ),
                ),
                (
                    "type_group",
                    VarCharField(
                        choices=[
                            ("_", "Generic"),
                            ("m", "Metabolite"),
                            ("g", "Gene Identifier"),
                            ("p", "Protein Identifier"),
                            ("h", "Phosphor"),
                        ],
                        default="_",
                        help_text="Class of data for this Measurement Type.",
                        verbose_name="Type Group",
                    ),
                ),
                (
                    "provisional",
                    models.BooleanField(
                        default=False,
                        help_text="Flag indicating if the type "
                        "is pending lookup in external Datasource",
                        verbose_name="Provisional",
                    ),
                ),
                (
                    "uuid",
                    models.UUIDField(
                        editable=False,
                        help_text="Unique ID for this Measurement Type.",
                        unique=True,
                        verbose_name="UUID",
                    ),
                ),
                (
                    "alt_names",
                    ArrayField(
                        base_field=VarCharField(),
                        blank=True,
                        default=list,
                        help_text="Alternate names for this Measurement Type.",
                        size=None,
                        verbose_name="Synonyms",
                    ),
                ),
                (
                    "type_source",
                    models.ForeignKey(
                        blank=True,
                        help_text="Datasource used for characterizing this Measurement Type.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        to="main.Datasource",
                        verbose_name="Datasource",
                    ),
                ),
            ],
            options={"db_table": "measurement_type"},
            bases=(common.EDDSerialize, models.Model),
        ),
        migrations.CreateModel(
            name="MeasurementUnit",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "unit_name",
                    VarCharField(
                        help_text="Name for unit of measurement.",
                        unique=True,
                        verbose_name="Name",
                    ),
                ),
                (
                    "display",
                    models.BooleanField(
                        default=True,
                        help_text="Flag indicating the units should be displayed "
                        "along with values.",
                        verbose_name="Display",
                    ),
                ),
                (
                    "alternate_names",
                    VarCharField(
                        blank=True,
                        help_text="Alternative names for the unit.",
                        null=True,
                        verbose_name="Alternate Names",
                    ),
                ),
                (
                    "type_group",
                    VarCharField(
                        choices=[
                            ("_", "Generic"),
                            ("m", "Metabolite"),
                            ("g", "Gene Identifier"),
                            ("p", "Protein Identifier"),
                            ("h", "Phosphor"),
                        ],
                        default="_",
                        help_text="Type of measurement for which this unit is used.",
                        verbose_name="Group",
                    ),
                ),
            ],
            options={"db_table": "measurement_unit"},
        ),
        migrations.CreateModel(
            name="MetadataGroup",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "group_name",
                    VarCharField(
                        help_text="Name of the group/class of metadata.",
                        unique=True,
                        verbose_name="Group Name",
                    ),
                ),
            ],
            options={"db_table": "metadata_group"},
        ),
        migrations.CreateModel(
            name="MetadataType",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "type_name",
                    VarCharField(
                        help_text="Name for Metadata Type", verbose_name="Name"
                    ),
                ),
                (
                    "type_i18n",
                    VarCharField(
                        blank=True,
                        help_text="i18n key used for naming this Metadata Type.",
                        null=True,
                        verbose_name="i18n Key",
                    ),
                ),
                (
                    "type_field",
                    VarCharField(
                        blank=True,
                        default=None,
                        help_text="Model field where metadata is stored; "
                        "blank stores in metadata dictionary.",
                        null=True,
                        verbose_name="Field Name",
                    ),
                ),
                (
                    "input_type",
                    VarCharField(
                        blank=True,
                        help_text="Type of input fields for values of this Metadata Type.",
                        null=True,
                        verbose_name="Input Type",
                    ),
                ),
                (
                    "default_value",
                    VarCharField(
                        blank=True,
                        help_text="Default value for this Metadata Type.",
                        verbose_name="Default Value",
                    ),
                ),
                (
                    "prefix",
                    VarCharField(
                        blank=True,
                        help_text="Prefix text appearing before values of this Metadata Type.",
                        verbose_name="Prefix",
                    ),
                ),
                (
                    "postfix",
                    VarCharField(
                        blank=True,
                        help_text="Postfix text appearing after values of this Metadata Type.",
                        verbose_name="Postfix",
                    ),
                ),
                (
                    "for_context",
                    VarCharField(
                        choices=[("S", "Study"), ("L", "Line"), ("A", "Assay")],
                        help_text="Type of EDD Object this Metadata Type may be added to.",
                        verbose_name="Context",
                    ),
                ),
                (
                    "uuid",
                    models.UUIDField(
                        editable=False,
                        help_text="Unique identifier for this Metadata Type.",
                        unique=True,
                        verbose_name="UUID",
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        blank=True,
                        help_text="Group for this Metadata Type",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        to="main.MetadataGroup",
                        verbose_name="Group",
                    ),
                ),
            ],
            options={
                "db_table": "metadata_type",
                "unique_together": {("type_name", "for_context")},
            },
            bases=(models.Model, common.EDDSerialize),
        ),
        migrations.CreateModel(
            name="Assay",
            fields=[
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "experimenter",
                    models.ForeignKey(
                        blank=True,
                        help_text="EDD User that set up the experimental conditions "
                        "of this Assay.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="assay_experimenter_set",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Experimenter",
                    ),
                ),
            ],
            options={"db_table": "assay"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="CarbonSource",
            fields=[
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "labeling",
                    models.TextField(
                        help_text="Description of labeling isotopes in this Carbon Source.",
                        verbose_name="Labeling",
                    ),
                ),
                (
                    "volume",
                    models.DecimalField(
                        decimal_places=5,
                        help_text="Volume of solution added as a Carbon Source.",
                        max_digits=16,
                        verbose_name="Volume",
                    ),
                ),
            ],
            options={"db_table": "carbon_source"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="GeneIdentifier",
            fields=[
                (
                    "measurementtype_ptr",
                    models.OneToOneField(
                        auto_created=True,
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        serialize=False,
                        to="main.MeasurementType",
                    ),
                ),
                (
                    "gene_length",
                    models.IntegerField(
                        blank=True,
                        help_text="Length of the gene nucleotides.",
                        null=True,
                        verbose_name="Length",
                    ),
                ),
            ],
            options={"db_table": "gene_identifier"},
            bases=("main.measurementtype",),
        ),
        migrations.CreateModel(
            name="Metabolite",
            fields=[
                (
                    "measurementtype_ptr",
                    models.OneToOneField(
                        auto_created=True,
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        serialize=False,
                        to="main.MeasurementType",
                    ),
                ),
                (
                    "charge",
                    models.IntegerField(
                        help_text="The charge of this molecule.", verbose_name="Charge"
                    ),
                ),
                (
                    "carbon_count",
                    models.IntegerField(
                        help_text="Count of carbons present in this molecule.",
                        verbose_name="Carbon Count",
                    ),
                ),
                (
                    "molar_mass",
                    models.DecimalField(
                        decimal_places=5,
                        help_text="Molar mass of this molecule.",
                        max_digits=16,
                        verbose_name="Molar Mass",
                    ),
                ),
                (
                    "molecular_formula",
                    models.TextField(
                        help_text="Formula string defining this molecule.",
                        verbose_name="Formula",
                    ),
                ),
                (
                    "smiles",
                    VarCharField(
                        blank=True,
                        help_text="SMILES string defining molecular structure.",
                        null=True,
                        verbose_name="SMILES",
                    ),
                ),
                (
                    "pubchem_cid",
                    models.IntegerField(
                        blank=True,
                        help_text="Unique PubChem identifier",
                        null=True,
                        unique=True,
                        verbose_name="PubChem CID",
                    ),
                ),
                (
                    "id_map",
                    ArrayField(
                        base_field=VarCharField(),
                        default=list,
                        help_text="List of identifiers mapping to external chemical datasets.",
                        size=None,
                        verbose_name="External IDs",
                    ),
                ),
                (
                    "tags",
                    ArrayField(
                        base_field=VarCharField(),
                        default=list,
                        help_text="List of tags for classifying this molecule.",
                        size=None,
                        verbose_name="Tags",
                    ),
                ),
            ],
            options={"db_table": "metabolite"},
            bases=("main.measurementtype",),
        ),
        migrations.CreateModel(
            name="ProteinIdentifier",
            fields=[
                (
                    "measurementtype_ptr",
                    models.OneToOneField(
                        auto_created=True,
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        serialize=False,
                        to="main.MeasurementType",
                    ),
                ),
                (
                    "accession_id",
                    VarCharField(
                        blank=True,
                        help_text="Accession ID for protein characterized in e.g. UniProt.",
                        null=True,
                        verbose_name="Accession ID",
                    ),
                ),
                (
                    "accession_code",
                    VarCharField(
                        blank=True,
                        help_text="Required portion of Accession ID for easier lookup.",
                        null=True,
                        verbose_name="Accession Code",
                    ),
                ),
                (
                    "length",
                    models.IntegerField(
                        blank=True,
                        help_text="sequence length",
                        null=True,
                        verbose_name="Length",
                    ),
                ),
                (
                    "mass",
                    models.DecimalField(
                        blank=True,
                        decimal_places=5,
                        help_text="of unprocessed protein, in Daltons",
                        max_digits=16,
                        null=True,
                        verbose_name="Mass",
                    ),
                ),
            ],
            options={"db_table": "protein_identifier"},
            bases=("main.measurementtype",),
        ),
        migrations.CreateModel(
            name="Protocol",
            fields=[
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "categorization",
                    VarCharField(
                        choices=[
                            ("NA", "None"),
                            ("OD", "Optical Density"),
                            ("HPLC", "HPLC"),
                            ("LCMS", "LCMS"),
                            ("RAMOS", "RAMOS"),
                            ("TPOMICS", "Transcriptomics / Proteomics"),
                        ],
                        default="NA",
                        help_text="SBML category for this Protocol.",
                        verbose_name="SBML Category",
                    ),
                ),
                (
                    "default_units",
                    models.ForeignKey(
                        blank=True,
                        help_text="Default units for values measured with this Protocol.",
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="protocol_set",
                        to="main.MeasurementUnit",
                        verbose_name="Default Units",
                    ),
                ),
                (
                    "owned_by",
                    models.ForeignKey(
                        help_text="Owner / maintainer of this Protocol",
                        on_delete=models.deletion.PROTECT,
                        related_name="protocol_set",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Owner",
                    ),
                ),
                (
                    "variant_of",
                    models.ForeignKey(
                        blank=True,
                        help_text="Link to another original Protocol used "
                        "as basis for this Protocol.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="derived_set",
                        to="main.Protocol",
                        verbose_name="Variant of Protocol",
                    ),
                ),
            ],
            options={"db_table": "protocol"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="SBMLTemplate",
            fields=[
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "biomass_calculation",
                    models.DecimalField(
                        decimal_places=5,
                        default=-1,
                        help_text="The calculated multiplier converting OD to weight of biomass.",
                        max_digits=16,
                        verbose_name="Biomass Factor",
                    ),
                ),
                (
                    "biomass_calculation_info",
                    models.TextField(
                        default="",
                        help_text="Additional information on biomass calculation.",
                        verbose_name="Biomass Calculation",
                    ),
                ),
                (
                    "biomass_exchange_name",
                    models.TextField(
                        help_text="The reaction name in the model for Biomass.",
                        verbose_name="Biomass Reaction",
                    ),
                ),
            ],
            options={"db_table": "sbml_template"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="Strain",
            fields=[
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "registry_id",
                    models.UUIDField(
                        blank=True,
                        help_text="The unique ID of this strain in the ICE Registry.",
                        null=True,
                        verbose_name="Registry UUID",
                    ),
                ),
                (
                    "registry_url",
                    models.URLField(
                        blank=True,
                        help_text="The URL of this strain in the ICE Registry.",
                        max_length=255,
                        null=True,
                        verbose_name="Registry URL",
                    ),
                ),
            ],
            options={"db_table": "strain"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="Study",
            fields=[
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "contact_extra",
                    models.TextField(
                        help_text="Additional field for contact information about this study "
                        "(e.g. contact is not a User of EDD).",
                        verbose_name="Contact (extra)",
                    ),
                ),
                (
                    "slug",
                    models.SlugField(
                        help_text="Slug text used in links to this Study.",
                        null=True,
                        unique=True,
                        verbose_name="Slug",
                    ),
                ),
                (
                    "contact",
                    models.ForeignKey(
                        blank=True,
                        help_text="EDD User to contact about this study.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="contact_study_set",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Contact",
                    ),
                ),
                (
                    "metabolic_map",
                    models.ForeignKey(
                        blank=True,
                        help_text="Metabolic map used by default in this Study.",
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        to="main.SBMLTemplate",
                        verbose_name="Metabolic Map",
                    ),
                ),
                (
                    "protocols",
                    models.ManyToManyField(
                        blank=True,
                        db_table="study_protocol",
                        help_text="Protocols planned for use in this Study.",
                        to="main.Protocol",
                        verbose_name="Protocols",
                    ),
                ),
            ],
            options={"verbose_name_plural": "Studies", "db_table": "study"},
            bases=(core.SlugMixin, "main.eddobject"),
        ),
        migrations.CreateModel(
            name="Update",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "mod_time",
                    models.DateTimeField(
                        auto_now_add=True,
                        help_text="Timestamp of the update.",
                        verbose_name="Modified",
                    ),
                ),
                (
                    "path",
                    models.TextField(
                        blank=True,
                        help_text="URL path used to trigger this update.",
                        null=True,
                        verbose_name="URL Path",
                    ),
                ),
                (
                    "origin",
                    models.TextField(
                        blank=True,
                        help_text="Host origin of the request triggering this update.",
                        null=True,
                        verbose_name="Origin Host",
                    ),
                ),
                (
                    "mod_by",
                    models.ForeignKey(
                        editable=False,
                        help_text="The user performing the update.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={"db_table": "update_info"},
            bases=(models.Model, common.EDDSerialize),
        ),
        migrations.CreateModel(
            name="Measurement",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "metadata",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="JSON-based metadata dictionary.",
                        verbose_name="Metadata",
                    ),
                ),
                (
                    "active",
                    models.BooleanField(
                        default=True,
                        help_text="Flag indicating this Measurement is active "
                        "and should be displayed.",
                        verbose_name="Active",
                    ),
                ),
                (
                    "compartment",
                    VarCharField(
                        choices=[
                            ("0", "N/A"),
                            ("1", "Intracellular/Cytosol (Cy)"),
                            ("2", "Extracellular"),
                        ],
                        default="0",
                        help_text="Compartment of the cell for this Measurement.",
                        verbose_name="Compartment",
                    ),
                ),
                (
                    "measurement_format",
                    VarCharField(
                        choices=[
                            ("0", "scalar"),
                            ("1", "vector"),
                            ("2", "histogram (deprecated)"),
                            ("3", "sigma"),
                            ("4", "range"),
                            ("5", "vector range"),
                            ("6", "packed"),
                            ("7", "histogram"),
                            ("8", "stepped histogram"),
                        ],
                        default="0",
                        help_text="Enumeration of value formats for this Measurement.",
                        verbose_name="Format",
                    ),
                ),
                (
                    "experimenter",
                    models.ForeignKey(
                        blank=True,
                        help_text="EDD User that set up the experimental conditions "
                        "of this Measurement.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="measurement_experimenter_set",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Experimenter",
                    ),
                ),
                (
                    "measurement_type",
                    models.ForeignKey(
                        help_text="The type of item measured for this Measurement.",
                        on_delete=models.deletion.PROTECT,
                        to="main.MeasurementType",
                        verbose_name="Type",
                    ),
                ),
                (
                    "update_ref",
                    models.ForeignKey(
                        help_text="The Update triggering the setting of this Measurement.",
                        on_delete=models.deletion.PROTECT,
                        to="main.Update",
                        verbose_name="Updated",
                    ),
                ),
                (
                    "x_units",
                    models.ForeignKey(
                        help_text="The units of the X-axis for this Measurement.",
                        on_delete=models.deletion.PROTECT,
                        related_name="+",
                        to="main.MeasurementUnit",
                        verbose_name="X Units",
                    ),
                ),
                (
                    "y_units",
                    models.ForeignKey(
                        help_text="The units of the Y-axis for this Measurement.",
                        on_delete=models.deletion.PROTECT,
                        related_name="+",
                        to="main.MeasurementUnit",
                        verbose_name="Y Units",
                    ),
                ),
                (
                    "assay",
                    models.ForeignKey(
                        help_text="The Assay creating this Measurement.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Assay",
                        verbose_name="Assay",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        help_text="The Study containing this Measurement.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Study",
                        verbose_name="Study",
                    ),
                ),
            ],
            options={"db_table": "measurement"},
            bases=(models.Model, common.EDDSerialize),
        ),
        migrations.AddField(
            model_name="eddobject",
            name="created",
            field=models.ForeignKey(
                editable=False,
                help_text="Update used to create this object.",
                on_delete=models.deletion.PROTECT,
                related_name="object_created",
                to="main.Update",
                verbose_name="Created",
            ),
        ),
        migrations.AddField(
            model_name="eddobject",
            name="updated",
            field=models.ForeignKey(
                editable=False,
                help_text="Update used to last modify this object.",
                on_delete=models.deletion.PROTECT,
                related_name="object_updated",
                to="main.Update",
                verbose_name="Last Modified",
            ),
        ),
        migrations.AddField(
            model_name="eddobject",
            name="updates",
            field=models.ManyToManyField(
                db_table="edd_object_update",
                help_text="List of Update objects logging changes to this object.",
                related_name="_eddobject_updates_+",
                to="main.Update",
                verbose_name="Updates",
            ),
        ),
        migrations.AddField(
            model_name="datasource",
            name="created",
            field=models.ForeignKey(
                editable=False,
                help_text="Update object logging the creation of this Datasource.",
                on_delete=models.deletion.PROTECT,
                related_name="datasource",
                to="main.Update",
                verbose_name="Created",
            ),
        ),
        migrations.CreateModel(
            name="Comment",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "body",
                    models.TextField(
                        help_text="Content of the comment.", verbose_name="Comment"
                    ),
                ),
                (
                    "created",
                    models.ForeignKey(
                        help_text="Update object logging the creation of this Comment.",
                        on_delete=models.deletion.PROTECT,
                        to="main.Update",
                        verbose_name="Created",
                    ),
                ),
                (
                    "object_ref",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="comments",
                        to="main.EDDObject",
                    ),
                ),
            ],
            options={"db_table": "comment"},
        ),
        migrations.CreateModel(
            name="Attachment",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "file",
                    FileField(
                        help_text="Path to file data.",
                        upload_to="%Y/%m/%d",
                        verbose_name="File Path",
                    ),
                ),
                (
                    "filename",
                    VarCharField(
                        help_text="Name of attachment file.", verbose_name="File Name"
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        help_text="Description of attachment file contents.",
                        verbose_name="Description",
                    ),
                ),
                (
                    "mime_type",
                    VarCharField(
                        blank=True,
                        help_text="MIME ContentType of the attachment.",
                        null=True,
                        verbose_name="MIME",
                    ),
                ),
                (
                    "file_size",
                    models.IntegerField(
                        default=0,
                        help_text="Total byte size of the attachment.",
                        verbose_name="Size",
                    ),
                ),
                (
                    "created",
                    models.ForeignKey(
                        help_text="Update used to create the attachment.",
                        on_delete=models.deletion.PROTECT,
                        to="main.Update",
                        verbose_name="Created",
                    ),
                ),
                (
                    "object_ref",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="files",
                        to="main.EDDObject",
                    ),
                ),
            ],
            options={"db_table": "attachment"},
        ),
        migrations.CreateModel(
            name="WorklistTemplate",
            fields=[
                (
                    "eddobject_ptr",
                    models.OneToOneField(
                        auto_created=True,
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "protocol",
                    models.ForeignKey(
                        help_text="Default protocol for this Template.",
                        on_delete=models.deletion.PROTECT,
                        to="main.Protocol",
                        verbose_name="Protocol",
                    ),
                ),
            ],
            options={"db_table": "worklist_template"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="WorklistColumn",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "heading",
                    VarCharField(
                        blank=True,
                        help_text="Column header text.",
                        null=True,
                        verbose_name="Heading",
                    ),
                ),
                (
                    "default_value",
                    VarCharField(
                        blank=True,
                        help_text="Default value for this column.",
                        null=True,
                        verbose_name="Default Value",
                    ),
                ),
                (
                    "help_text",
                    models.TextField(
                        blank=True,
                        help_text="UI text to display explaining how to modify this column.",
                        null=True,
                        verbose_name="Help Text",
                    ),
                ),
                (
                    "ordering",
                    models.IntegerField(
                        blank=True,
                        help_text="Order this column will appear in worklist export.",
                        null=True,
                        verbose_name="Ordering",
                    ),
                ),
                (
                    "meta_type",
                    models.ForeignKey(
                        blank=True,
                        help_text="Type of Metadata in this column.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        to="main.MetadataType",
                        verbose_name="Metadata Type",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        help_text="Parent Worklist Template for this column.",
                        on_delete=models.deletion.CASCADE,
                        to="main.WorklistTemplate",
                        verbose_name="Template",
                    ),
                ),
            ],
            options={"db_table": "worklist_column"},
        ),
        migrations.CreateModel(
            name="UserPermission",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "permission_type",
                    VarCharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Type of permission.",
                        verbose_name="Permission",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        help_text="User this permission applies to.",
                        on_delete=models.deletion.CASCADE,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        help_text="Study this permission applies to.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Study",
                        verbose_name="Study",
                    ),
                ),
            ],
            options={"db_table": "study_user_permission"},
            bases=(permission.Permission, models.Model),
        ),
        migrations.AddField(
            model_name="sbmltemplate",
            name="sbml_file",
            field=models.ForeignKey(
                blank=True,
                help_text="The Attachment containing the SBML model file.",
                null=True,
                on_delete=models.deletion.PROTECT,
                to="main.Attachment",
                verbose_name="SBML Model",
            ),
        ),
        migrations.CreateModel(
            name="ProteinStrainLink",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "protein",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="strainlink",
                        to="main.ProteinIdentifier",
                    ),
                ),
                (
                    "strain",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="proteinlink",
                        to="main.Strain",
                    ),
                ),
            ],
            options={"db_table": "protein_strain"},
            bases=(measurement_type.StrainLinkMixin, models.Model),
        ),
        migrations.CreateModel(
            name="Phosphor",
            fields=[
                (
                    "measurementtype_ptr",
                    models.OneToOneField(
                        auto_created=True,
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        serialize=False,
                        to="main.MeasurementType",
                    ),
                ),
                (
                    "excitation_wavelength",
                    models.DecimalField(
                        blank=True,
                        decimal_places=5,
                        help_text="Excitation wavelength for the material.",
                        max_digits=16,
                        null=True,
                        verbose_name="Excitation",
                    ),
                ),
                (
                    "emission_wavelength",
                    models.DecimalField(
                        blank=True,
                        decimal_places=5,
                        help_text="Emission wavelength for the material.",
                        max_digits=16,
                        null=True,
                        verbose_name="Emission",
                    ),
                ),
                (
                    "reference_type",
                    models.ForeignKey(
                        blank=True,
                        help_text="Link to another Measurement Type used as a reference "
                        "for this type.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="phosphor_set",
                        to="main.MeasurementType",
                        verbose_name="Reference",
                    ),
                ),
            ],
            options={"db_table": "phosphor_type"},
            bases=("main.measurementtype",),
        ),
        migrations.CreateModel(
            name="MetaboliteSpecies",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "species",
                    VarCharField(
                        help_text="Species name used in the model for this metabolite.",
                        verbose_name="Species",
                    ),
                ),
                (
                    "short_code",
                    VarCharField(
                        blank=True,
                        default="",
                        help_text="Short code used for a species in the model.",
                        null=True,
                        verbose_name="Short Code",
                    ),
                ),
                (
                    "measurement_type",
                    models.ForeignKey(
                        blank=True,
                        help_text="Mesurement type linked to this species in the model.",
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        to="main.MeasurementType",
                        verbose_name="Measurement Type",
                    ),
                ),
                (
                    "sbml_template",
                    models.ForeignKey(
                        help_text="The SBML Model defining this species link "
                        "to a Measurement Type.",
                        on_delete=models.deletion.CASCADE,
                        to="main.SBMLTemplate",
                        verbose_name="SBML Model",
                    ),
                ),
            ],
            options={"db_table": "measurement_type_to_species"},
        ),
        migrations.CreateModel(
            name="MetaboliteExchange",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "reactant_name",
                    VarCharField(
                        help_text="The reactant name used in for this exchange reaction.",
                        verbose_name="Reactant Name",
                    ),
                ),
                (
                    "exchange_name",
                    VarCharField(
                        help_text="The exchange name used in the model.",
                        verbose_name="Exchange Name",
                    ),
                ),
                (
                    "measurement_type",
                    models.ForeignKey(
                        blank=True,
                        help_text="Measurement type linked to this exchange reaction "
                        "in the model.",
                        null=True,
                        on_delete=models.deletion.CASCADE,
                        to="main.MeasurementType",
                        verbose_name="Measurement Type",
                    ),
                ),
                (
                    "sbml_template",
                    models.ForeignKey(
                        help_text="The SBML Model containing this exchange reaction.",
                        on_delete=models.deletion.CASCADE,
                        to="main.SBMLTemplate",
                        verbose_name="SBML Model",
                    ),
                ),
            ],
            options={"db_table": "measurement_type_to_exchange"},
        ),
        migrations.CreateModel(
            name="MeasurementValue",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "x",
                    ArrayField(
                        base_field=models.DecimalField(decimal_places=5, max_digits=16),
                        help_text="X-axis value(s) for this point.",
                        size=None,
                        verbose_name="X",
                    ),
                ),
                (
                    "y",
                    ArrayField(
                        base_field=models.DecimalField(decimal_places=5, max_digits=16),
                        help_text="Y-axis value(s) for this point.",
                        size=None,
                        verbose_name="Y",
                    ),
                ),
                (
                    "measurement",
                    models.ForeignKey(
                        help_text="The Measurement containing this point of data.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Measurement",
                        verbose_name="Measurement",
                    ),
                ),
                (
                    "updated",
                    models.ForeignKey(
                        help_text="The Update triggering the setting of this point.",
                        on_delete=models.deletion.PROTECT,
                        to="main.Update",
                        verbose_name="Updated",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        help_text="The Study containing this Value.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Study",
                        verbose_name="Study",
                    ),
                ),
            ],
            options={"db_table": "measurement_value"},
        ),
        migrations.CreateModel(
            name="Line",
            fields=[
                (
                    "control",
                    models.BooleanField(
                        default=False,
                        help_text="Flag indicating whether the sample for this Line is a control.",
                        verbose_name="Control",
                    ),
                ),
                (
                    "object_ref",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        related_name="+",
                        serialize=False,
                        to="main.EDDObject",
                    ),
                ),
                (
                    "contact_extra",
                    models.TextField(
                        help_text="Additional field for contact information about this Line "
                        "(e.g. contact is not a User of EDD).",
                        verbose_name="Contact (extra)",
                    ),
                ),
                (
                    "carbon_source",
                    models.ManyToManyField(
                        blank=True,
                        db_table="line_carbon_source",
                        help_text="Carbon source(s) used in this Line.",
                        to="main.CarbonSource",
                        verbose_name="Carbon Source(s)",
                    ),
                ),
                (
                    "contact",
                    models.ForeignKey(
                        blank=True,
                        help_text="EDD User to contact about this Line.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="line_contact_set",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Contact",
                    ),
                ),
                (
                    "experimenter",
                    models.ForeignKey(
                        blank=True,
                        help_text="EDD User that set up the experimental conditions of this Line.",
                        null=True,
                        on_delete=models.deletion.PROTECT,
                        related_name="line_experimenter_set",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Experimenter",
                    ),
                ),
                (
                    "protocols",
                    models.ManyToManyField(
                        help_text="Protocol(s) used to Assay this Line.",
                        through="main.Assay",
                        to="main.Protocol",
                        verbose_name="Protocol(s)",
                    ),
                ),
                (
                    "strains",
                    models.ManyToManyField(
                        blank=True,
                        db_table="line_strain",
                        help_text="Strain(s) used in this Line.",
                        to="main.Strain",
                        verbose_name="Strain(s)",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        help_text="The Study containing this Line.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Study",
                        verbose_name="Study",
                    ),
                ),
            ],
            options={"db_table": "line"},
            bases=("main.eddobject",),
        ),
        migrations.CreateModel(
            name="GroupPermission",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "permission_type",
                    VarCharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Type of permission.",
                        verbose_name="Permission",
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        help_text="Group this permission applies to.",
                        on_delete=models.deletion.CASCADE,
                        related_name="+",
                        to="auth.Group",
                        verbose_name="Group",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        help_text="Study this permission applies to.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Study",
                        verbose_name="Study",
                    ),
                ),
            ],
            options={"db_table": "study_group_permission"},
            bases=(permission.Permission, models.Model),
        ),
        migrations.CreateModel(
            name="GeneStrainLink",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "gene",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="strainlink",
                        to="main.GeneIdentifier",
                    ),
                ),
                (
                    "strain",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="genelink",
                        to="main.Strain",
                    ),
                ),
            ],
            options={"db_table": "gene_strain"},
            bases=(measurement_type.StrainLinkMixin, models.Model),
        ),
        migrations.CreateModel(
            name="EveryonePermission",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "permission_type",
                    VarCharField(
                        choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                        default="N",
                        help_text="Type of permission.",
                        verbose_name="Permission",
                    ),
                ),
                (
                    "study",
                    models.ForeignKey(
                        help_text="Study this permission applies to.",
                        on_delete=models.deletion.CASCADE,
                        to="main.Study",
                        verbose_name="Study",
                    ),
                ),
            ],
            options={"db_table": "study_public_permission"},
            bases=(permission.EveryoneMixin, permission.Permission, models.Model,),
        ),
        migrations.AddField(
            model_name="assay",
            name="line",
            field=models.ForeignKey(
                help_text="The Line used for this Assay.",
                on_delete=models.deletion.CASCADE,
                to="main.Line",
                verbose_name="Line",
            ),
        ),
        migrations.AddField(
            model_name="assay",
            name="measurement_types",
            field=models.ManyToManyField(
                help_text="The Measurement Types contained in this Assay.",
                through="main.Measurement",
                to="main.MeasurementType",
                verbose_name="Measurement Types",
            ),
        ),
        migrations.AddField(
            model_name="assay",
            name="protocol",
            field=models.ForeignKey(
                help_text="The Protocol used to create this Assay.",
                on_delete=models.deletion.PROTECT,
                to="main.Protocol",
                verbose_name="Protocol",
            ),
        ),
        migrations.AddField(
            model_name="assay",
            name="study",
            field=models.ForeignKey(
                help_text="The Study containing this Assay.",
                on_delete=models.deletion.CASCADE,
                to="main.Study",
                verbose_name="Study",
            ),
        ),
        migrations.AddConstraint(
            model_name="worklistcolumn",
            constraint=models.UniqueConstraint(
                condition=models.Q(ordering__isnull=False),
                fields=("ordering", "template"),
                name="unique_column_ordering",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="metabolitespecies",
            unique_together={
                ("sbml_template", "species"),
                ("sbml_template", "measurement_type"),
            },
        ),
        migrations.AlterIndexTogether(
            name="metabolitespecies", index_together={("sbml_template", "species")},
        ),
        migrations.AlterUniqueTogether(
            name="metaboliteexchange",
            unique_together={
                ("sbml_template", "exchange_name"),
                ("sbml_template", "measurement_type"),
            },
        ),
        migrations.AlterIndexTogether(
            name="metaboliteexchange",
            index_together={
                ("sbml_template", "reactant_name"),
                ("sbml_template", "exchange_name"),
            },
        ),
        migrations.RunPython(code=bootstrap, reverse_code=migrations.RunPython.noop),
    ]
