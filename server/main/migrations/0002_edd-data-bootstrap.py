import environ
from django.db import migrations

env = environ.Env()


def bootstrap(apps, schema_editor):
    # load the User model, create system user
    User = apps.get_model("auth", "User")
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


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0001_edd-schema-init"),
        ("sites", "0002_alter_domain_unique"),
    ]

    operations = [
        migrations.RunPython(code=bootstrap, reverse_code=migrations.RunPython.noop)
    ]
