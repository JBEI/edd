"""Forms on study overview page."""

import logging

from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from edd.search import widgets as autocomplete

from .. import models

logger = logging.getLogger(__name__)
User = get_user_model()


class ModifyStudyForm(forms.ModelForm):
    name = forms.CharField(
        help_text="",
        label=_("Study Name"),
        required=True,
        widget=forms.widgets.TextInput(
            attrs={
                "aria-invalid": "false",
                "class": "form-control form-control-lg",
                "data-validation-text": _("Study Name is required."),
                "pattern": r".*[\S]+.*",
            },
        ),
    )
    description = forms.CharField(
        help_text="",
        label=_("Description"),
        required=False,
        widget=forms.widgets.Textarea(attrs={"class": "form-control"}),
    )
    contact = forms.ModelChoiceField(
        empty_label=None,
        help_text="",
        label=_("Contact"),
        queryset=User.objects.all(),
        required=False,
        widget=autocomplete.UserAutocomplete(),
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/simple_bootstrap.html"

    class Meta:
        fields = ("name", "description", "contact")
        model = models.Study

    def __init__(self, user=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._user = user

    def clean(self):
        super().clean()
        # if no explicit contact is set, make the current user the contact
        if not self.cleaned_data.get("contact", None):
            self.cleaned_data["contact"] = self._user

    def save(self, commit=True, *args, **kwargs):
        # perform updates atomically to the study and related user permissions
        with transaction.atomic():
            # save the study
            s = super().save(commit=commit, *args, **kwargs)
            # make sure the creator has write permission, and ESE has read
            s.userpermission_set.update_or_create(
                permission_type=models.StudyPermission.WRITE,
                user=s.created.mod_by,
            )
            # if configured, apply default group read permissions to the new study
            self._apply_default_read_permissions(s)
        return s

    def _apply_default_read_permissions(self, study):
        _SETTING_NAME = "EDD_DEFAULT_STUDY_READ_GROUPS"
        default_group_names = getattr(settings, _SETTING_NAME, None)
        if default_group_names:
            default_groups = Group.objects.filter(name__in=default_group_names)
            default_groups = default_groups.values_list("pk", flat=True)
            requested_groups = len(default_group_names)
            found_groups = len(default_groups)
            if requested_groups != found_groups:
                logger.error(
                    f"Setting only {found_groups} of {requested_groups} read permissions "
                    f"for study `{study.slug}`. Check that all group names set in the "
                    f"`{_SETTING_NAME}` value in Django settings is valid."
                )
            for group in default_groups:
                study.grouppermission_set.update_or_create(
                    group_id=group,
                    defaults={"permission_type": models.StudyPermission.READ},
                )


class CreateStudyForm(ModifyStudyForm):
    """Form to create a new study."""

    # include hidden field for copying multiple Line instances by ID
    lineId = forms.ModelMultipleChoiceField(
        queryset=models.Line.objects.none(),
        required=False,
        widget=forms.MultipleHiddenInput,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # self.fields exists after super.__init__()
        if self._user:
            # make sure lines are in a readable study
            access = models.Study.access_filter(self._user, via="study")
            queryset = models.Line.objects.filter(access).distinct()
            self.fields["lineId"].queryset = queryset

    def save(self, commit=True, *args, **kwargs):
        # perform updates atomically to the study and related user permissions
        with transaction.atomic():
            # save the study
            s = super().save(commit=commit, *args, **kwargs)
            # create copies of passed in Line IDs
            self._save_lines(s)
        return s

    def _save_lines(self, study):
        """Saves copies of Line IDs passed to the form on the study."""
        lines = self.cleaned_data.get("lineId", [])
        to_add = [line.clone_to_study(study) for line in lines]
        study.line_set.add(*to_add, bulk=False)


class PermissionForm(forms.Form):
    who = forms.JSONField(
        help_text="",
        label=_("User or Group"),
        widget=autocomplete.PermissionAutocomplete(),
    )
    perm = forms.ChoiceField(
        choices=models.StudyPermission.TYPE_CHOICE,
        help_text="",
        label=_("Access Level"),
        widget=forms.widgets.Select(attrs={"class": "form-select"}),
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/permission.html"

    def __init__(self, *, study, **kwargs):
        super().__init__(**kwargs)
        self._study = study

    def clean(self):
        cleaned_data = super().clean()
        target = {}
        match cleaned_data.get("who"):
            case {"type": "user", "id": user_id}:
                qs = self._study.userpermission_set
                target.update(user_id=user_id)
            case {"type": "group", "id": group_id}:
                qs = self._study.grouppermission_set
                target.update(group_id=group_id)
            case {"type": "everyone"}:
                qs = self._study.everyonepermission_set
            case _:
                raise ValidationError(_("Could not find permission target"))
        match perm := cleaned_data.get("perm"):
            case models.StudyPermission.WRITE | models.StudyPermission.READ:
                # find any existing permission for selected entity,
                # then update to the given access level
                qs.update_or_create(
                    defaults={"permission_type": perm},
                    **target,
                )
            case models.StudyPermission.NONE:
                # treat NONE access level as "delete permission"
                qs.filter(**target).delete()


class CreateAttachmentForm(forms.ModelForm):
    """Form to create a new attachment."""

    file = forms.FileField(
        help_text="",
        label=_("File"),
        required=True,
        widget=forms.widgets.FileInput(attrs={"class": "form-control"}),
    )
    description = forms.CharField(
        help_text="",
        label=_("Description"),
        required=False,
        widget=forms.widgets.TextInput(attrs={"class": "form-control"}),
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/attachment.html"

    class Meta:
        model = models.Attachment
        fields = ("file", "description")

    def __init__(self, edd_object=None, *args, **kwargs):
        super().__init__(label_suffix="", *args, **kwargs)
        self._parent = edd_object

    def save(self, commit=True, *args, **kwargs):
        a = super().save(commit=False, *args, **kwargs)
        a.object_ref = self._parent
        if commit:
            a.save()
        return a


class CreateCommentForm(forms.ModelForm):
    """Form to create a new comment."""

    body = forms.CharField(
        help_text="",
        label=_("Comment"),
        required=True,
        widget=forms.widgets.Textarea(attrs={"class": "form-control"}),
    )

    error_css_class = "is-invalid"
    template_name = "main/forms/comment.html"

    class Meta:
        model = models.Comment
        fields = ("body",)

    def __init__(self, edd_object=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._parent = edd_object

    def save(self, commit=True, *args, **kwargs):
        c = super().save(commit=False, *args, **kwargs)
        c.object_ref = self._parent
        if commit:
            c.save()
        return c


__all__ = (
    CreateAttachmentForm,
    CreateCommentForm,
    CreateStudyForm,
    ModifyStudyForm,
    PermissionForm,
)
