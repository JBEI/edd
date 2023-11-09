from django.template.response import TemplateResponse

from main.models import Line, Study


def no_strain_url(request, strain_id):
    """Simplest possible view for the legacy_issue_no_strain_url page."""
    lines = Line.objects.filter(strain_ids=[strain_id])
    study_ids = lines.values_list("study_id", flat=True).distinct()
    studies = Study.objects.in_bulk(study_ids)
    return TemplateResponse(
        request,
        "main/legacy_issue_no_strain_url.html",
        {"studies": studies.values()},
    )
