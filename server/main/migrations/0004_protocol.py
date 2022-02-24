from django.db import migrations, models
from django.db.models.deletion import PROTECT

from edd.fields import VarCharField


def copy_to_protocolio(apps, schema_editor):
    Protocol = apps.get_model("main", "Protocol")
    ProtocolIO = apps.get_model("main", "ProtocolIO")
    for p in Protocol.objects.all():
        ProtocolIO.objects.create(
            name=p.name,
            uuid=p.uuid,
            active=p.active,
            created=p.created,
            updated=p.updated,
            sbml_category=p.categorization if p.categorization != "NA" else None,
        )


def switch_protocol(apps, schema_editor):
    Assay = apps.get_model("main", "Assay")
    Protocol = apps.get_model("main", "Protocol")
    ProtocolIO = apps.get_model("main", "ProtocolIO")
    WorklistTemplate = apps.get_model("main", "WorklistTemplate")
    for p in Protocol.objects.all():
        new_pid = (
            ProtocolIO.objects.filter(uuid=p.uuid).values_list("pk", flat=True).first()
        )
        Assay.objects.filter(protocol=p).update(protocolio=new_pid)
        WorklistTemplate.objects.filter(protocol=p).update(protocolio=new_pid)


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0003_remove_carbonsource"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProtocolIO",
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
                        help_text="Name of this Protocol.", verbose_name="Name"
                    ),
                ),
                (
                    "uuid",
                    models.UUIDField(
                        editable=False,
                        help_text="Unique identifier for this Protocol.",
                        unique=True,
                        verbose_name="UUID",
                    ),
                ),
                (
                    "external_url",
                    models.URLField(
                        blank=True,
                        help_text="The URL in external service (e.g. protocols.io)",
                        null=True,
                        unique=True,
                    ),
                ),
                (
                    "active",
                    models.BooleanField(
                        default=True,
                        help_text="Flag showing if this Protocol is active and displayed.",
                        verbose_name="Active",
                    ),
                ),
                (
                    "destructive",
                    models.BooleanField(
                        default=False,
                        help_text="Flag showing if this Protocol consumes a sample.",
                        verbose_name="Destructive",
                    ),
                ),
                (
                    "sbml_category",
                    VarCharField(
                        blank=True,
                        choices=[
                            ("OD", "Optical Density"),
                            ("HPLC", "HPLC"),
                            ("LCMS", "LCMS"),
                            ("RAMOS", "RAMOS"),
                            ("TPOMICS", "Transcriptomics / Proteomics"),
                        ],
                        default=None,
                        help_text="SBML category for this Protocol.",
                        null=True,
                        verbose_name="SBML Category",
                    ),
                ),
                (
                    "created",
                    models.ForeignKey(
                        editable=False,
                        help_text="Update used to create this Protocol.",
                        on_delete=PROTECT,
                        related_name="protocol_created",
                        to="main.update",
                        verbose_name="Created",
                    ),
                ),
                (
                    "updated",
                    models.ForeignKey(
                        editable=False,
                        help_text="Update used to last modify this Protocol.",
                        on_delete=PROTECT,
                        related_name="protocol_updated",
                        to="main.update",
                        verbose_name="Last Modified",
                    ),
                ),
            ],
            options={"db_table": "main_protocol"},
        ),
        migrations.AddIndex(
            model_name="protocolio",
            index=models.Index(
                fields=["active", "name"], name="main_protoc_active_f664e6_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="protocolio",
            index=models.Index(
                fields=["sbml_category"], name="main_protoc_sbml_ca_7d7196_idx"
            ),
        ),
        migrations.RunPython(
            code=copy_to_protocolio, reverse_code=migrations.RunPython.noop
        ),
        migrations.AddField(
            model_name="assay",
            name="protocolio",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=PROTECT, to="main.protocolio",
            ),
        ),
        migrations.AddField(
            model_name="worklisttemplate",
            name="protocolio",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=PROTECT, to="main.protocolio",
            ),
        ),
        migrations.RunPython(
            code=switch_protocol, reverse_code=migrations.RunPython.noop
        ),
        migrations.RemoveField(model_name="assay", name="protocol"),
        migrations.RemoveField(model_name="worklisttemplate", name="protocol"),
        migrations.DeleteModel(name="protocol"),
        migrations.RenameField(
            model_name="assay", old_name="protocolio", new_name="protocol"
        ),
        migrations.RenameField(
            model_name="worklisttemplate", old_name="protocolio", new_name="protocol",
        ),
        migrations.RenameModel(old_name="protocolio", new_name="protocol"),
    ]
