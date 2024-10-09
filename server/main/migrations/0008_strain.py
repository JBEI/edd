from django.core.validators import URLValidator
from django.db import migrations, models
from django.db.models.deletion import CASCADE, PROTECT

from edd.fields import VarCharField


def copy_to_newstrain(apps, schema_editor):
    OldStrain = apps.get_model("main", "Strain")
    NewStrain = apps.get_model("main", "newstrain")
    for s in OldStrain.objects.order_by("created__mod_time"):
        defaults = {
            "created": s.created,
            "external_id": s.registry_id or s.registry_url,
            "name": s.name,
        }
        # there should be no collisions in registry_url,
        # but use get_or_create anyway to ensure collisions are impossible
        NewStrain.objects.get_or_create(
            external_url=s.registry_url,
            defaults=defaults,
        )


def switch_strain(apps, schema_editor):
    OldStrain = apps.get_model("main", "Strain")
    NewStrain = apps.get_model("main", "newstrain")
    Line = apps.get_model("main", "Line")
    ProteinStrainLink = apps.get_model("main", "ProteinStrainLink")
    GeneStrainLink = apps.get_model("main", "GeneStrainLink")
    # loop over all old strain records, update one-to-one protein/gene links to new strain
    for s in OldStrain.objects.all():
        match = NewStrain.objects.filter(external_url=s.registry_url)
        new_pk = match.values_list("pk", flat=True).first()
        ProteinStrainLink.objects.filter(strain=s).update(newstrain_id=new_pk)
        GeneStrainLink.objects.filter(strain=s).update(newstrain_id=new_pk)
    # sanity check for strains on lines; loop over all lines having any strains
    # update the IDs to the new strain model, in a *set*, to filter out duplicates
    for line in Line.objects.filter(strains__id__gt=0).prefetch_related("strains"):
        urls = {s.registry_url for s in line.strains.all()}
        matches = NewStrain.objects.filter(external_url__in=urls)
        new_pks = matches.values_list("pk", flat=True)
        line.newstrains.set(new_pks)


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0007_drop_phosphor"),
    ]

    operations = [
        migrations.CreateModel(
            name="newstrain",
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
                        help_text="Name of this Strain",
                        verbose_name="Name",
                    ),
                ),
                (
                    "external_id",
                    VarCharField(
                        editable=False,
                        help_text="External identifier for this Strain",
                        verbose_name="External ID",
                    ),
                ),
                (
                    "external_url",
                    VarCharField(
                        help_text="The URL in external service (e.g. ICE)",
                        unique=True,
                        validators=[URLValidator(schemes=("http", "https"))],
                        verbose_name="External URL",
                    ),
                ),
                (
                    "created",
                    models.ForeignKey(
                        editable=False,
                        help_text="Update used to create this Strain.",
                        on_delete=PROTECT,
                        related_name="strain_created",
                        to="main.update",
                        verbose_name="Created",
                    ),
                ),
            ],
            options={"db_table": "main_strain"},
        ),
        migrations.RunPython(
            code=copy_to_newstrain,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddField(
            model_name="line",
            name="newstrains",
            field=models.ManyToManyField(
                blank=True,
                db_table="main_line_strain",
                help_text="Strain(s) used in this Line.",
                to="main.newstrain",
                verbose_name="Strain(s)",
            ),
        ),
        migrations.AddField(
            model_name="ProteinStrainLink",
            name="newstrain",
            field=models.OneToOneField(
                null=True,
                on_delete=CASCADE,
                related_name="proteinlink",
                to="main.newstrain",
            ),
        ),
        migrations.AddField(
            model_name="GeneStrainLink",
            name="newstrain",
            field=models.OneToOneField(
                null=True,
                on_delete=CASCADE,
                related_name="genelink",
                to="main.newstrain",
            ),
        ),
        migrations.RunPython(
            code=switch_strain,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.RemoveField(model_name="line", name="strains"),
        migrations.RemoveField(model_name="ProteinStrainLink", name="strain"),
        migrations.RemoveField(model_name="GeneStrainLink", name="strain"),
        migrations.DeleteModel(name="strain"),
        migrations.RenameField(
            model_name="line",
            old_name="newstrains",
            new_name="strains",
        ),
        migrations.RenameField(
            model_name="ProteinStrainLink",
            old_name="newstrain",
            new_name="strain",
        ),
        migrations.RenameField(
            model_name="GeneStrainLink",
            old_name="newstrain",
            new_name="strain",
        ),
        migrations.AlterField(
            model_name="ProteinStrainLink",
            name="strain",
            field=models.OneToOneField(
                on_delete=CASCADE,
                related_name="proteinlink",
                to="main.newstrain",
            ),
        ),
        migrations.AlterField(
            model_name="GeneStrainLink",
            name="strain",
            field=models.OneToOneField(
                on_delete=CASCADE,
                related_name="genelink",
                to="main.newstrain",
            ),
        ),
        migrations.RenameModel(old_name="newstrain", new_name="strain"),
    ]
