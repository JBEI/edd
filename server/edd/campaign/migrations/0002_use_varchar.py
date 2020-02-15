from django.db import migrations

import edd.fields


class Migration(migrations.Migration):

    dependencies = [("campaign", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="campaign",
            name="name",
            field=edd.fields.VarCharField(
                help_text="Name of this Campaign.", verbose_name="Name"
            ),
        ),
        migrations.AlterField(
            model_name="campaignmembership",
            name="status",
            field=edd.fields.VarCharField(
                choices=[("a", "Active"), ("c", "Complete"), ("z", "Abandoned")],
                default="a",
                help_text="Status of a Study in the linked Campaign.",
            ),
        ),
        migrations.AlterField(
            model_name="everyonepermission",
            name="campaign_permission",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Permission for read/write on the Campaign itself.",
                verbose_name="Campaign Permission",
            ),
        ),
        migrations.AlterField(
            model_name="everyonepermission",
            name="study_permission",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Type of permission applied to Studies linked to Campaign.",
                verbose_name="Study Permission",
            ),
        ),
        migrations.AlterField(
            model_name="grouppermission",
            name="campaign_permission",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Permission for read/write on the Campaign itself.",
                verbose_name="Campaign Permission",
            ),
        ),
        migrations.AlterField(
            model_name="grouppermission",
            name="study_permission",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Type of permission applied to Studies linked to Campaign.",
                verbose_name="Study Permission",
            ),
        ),
        migrations.AlterField(
            model_name="userpermission",
            name="campaign_permission",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Permission for read/write on the Campaign itself.",
                verbose_name="Campaign Permission",
            ),
        ),
        migrations.AlterField(
            model_name="userpermission",
            name="study_permission",
            field=edd.fields.VarCharField(
                choices=[("N", "None"), ("R", "Read"), ("W", "Write")],
                default="N",
                help_text="Type of permission applied to Studies linked to Campaign.",
                verbose_name="Study Permission",
            ),
        ),
    ]
