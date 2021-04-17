from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profile", "0008_add_approval_flag"),
    ]

    operations = [
        # add the field
        migrations.AddField(
            model_name="institutionid",
            name="sort_key",
            field=models.PositiveIntegerField(
                default=None,
                help_text="Relative order this Institution is displayed in a UserProfile.",
                null=True,
                verbose_name="Display order",
            ),
        ),
        # assign default values
        migrations.RunSQL(
            sql="WITH temp AS ("
            "  SELECT row_number() OVER (PARTITION BY profile_id) as rn, *"
            "  FROM profile_institution_user"
            ") UPDATE profile_institution_user "
            "SET sort_key = temp.rn "
            "FROM temp "
            "WHERE profile_institution_user.profile_id = temp.profile_id "
            "AND profile_institution_user.institution_id = temp.institution_id;",
        ),
        # set unique constraint
        migrations.AddConstraint(
            model_name="institutionid",
            constraint=models.UniqueConstraint(
                fields=("profile", "sort_key"), name="profile_institution_ordering_idx"
            ),
        ),
        # alter field to no longer allow null
        migrations.AlterField(
            model_name="institutionid",
            name="sort_key",
            field=models.PositiveIntegerField(
                help_text="Relative order this Institution is displayed in a UserProfile.",
                verbose_name="Display order",
            ),
        ),
    ]
