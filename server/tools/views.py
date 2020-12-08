""" Miscellaneous data-processing utilities. """

import csv
import json
import logging
import re
from functools import partial
from io import BytesIO

from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status

from main.forms import CreateStudyForm

from . import cytometry, gc_ms_workbench
from .parsers import excel, skyline

logger = logging.getLogger(__name__)


def utilities_index(request):
    return render(request, "index.html", {})


########################################################################
# GC-MS
#
@ensure_csrf_cookie
def gcms_home(request):
    """Starting point for extracting peaks from ChemStation report files."""
    return render(request, "gc_ms.html", {})


def gcms_parse(request):
    """
    Process an Agilent MSDChemStation report and return a table of data as JSON string.
    """
    try:
        json_result = gc_ms_workbench.process_gc_ms_form_and_parse_file(
            form=request.POST, file=request.FILES["file"]
        )
        return JsonResponse(json_result)
    except Exception as e:
        return JsonResponse(
            {"python_error": f"{e}"}, status=status.HTTP_400_BAD_REQUEST
        )


def gcms_merge(request):
    data = json.loads(request.body)
    try:
        return JsonResponse(gc_ms_workbench.finalize_gc_ms_spreadsheet(data))
    except RuntimeError as e:
        return JsonResponse(
            {"python_error": f"{e}"}, status=status.HTTP_400_BAD_REQUEST
        )


def gcms_export(request):
    form = request.POST
    try:
        prefix = form["prefix"]
        headers = json.loads(form["headers"])
        table = json.loads(form["table"])
        if len(table) == 0:
            raise ValueError("Empty table value")
        # XXX but note below that the Workbook needs to be created with specific
        # options, otherwise this won't work
        f = BytesIO(gc_ms_workbench.export_to_xlsx(table, headers))
        file_name = prefix + ".xlsx"
        response = HttpResponse(
            f,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{file_name}"'
        return response
    except Exception as e:
        messages.error(request, f"Could not generate the GC-MS export file: {e}")
        return HttpResponse(status=status.HTTP_400_BAD_REQUEST)


########################################################################
# PROTEOMICS
#
@ensure_csrf_cookie
def skyline_home(request):
    return render(request, "skyline_import.html", {})


def skyline_parse(request):
    parser = skyline.SkylineParser()
    try:
        file = request.FILES["file"]
        reader = csv.reader(row.decode(file.charset or "utf8") for row in file)
        result = parser.export(row for row in reader)
        return JsonResponse(result)
    except Exception as e:
        logger.exception(f"Problem parsing skyline file: {e}")
        return JsonResponse(
            {"python_error": f"{e}"}, status=status.HTTP_400_BAD_REQUEST
        )


########################################################################
# CYTOMETRY
#
def cytometry_home(request):
    study_form = CreateStudyForm(prefix="study")
    return render(request, "cytometry.html", {"study_form": study_form})


def cytometry_parse(request):
    upload = request.FILES.get("file", None)
    try:
        if (
            upload.content_type
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ):
            # read in all cells, replace all whitespace with a single space, output tab-delimited
            parsed = excel.import_xlsx_tables(upload)
            pattern = re.compile(r"\s+")
            replace = partial(pattern.sub, " ")
            tables = []
            for sheet in parsed.get("worksheets", []):
                for ws in sheet:
                    header = ws.get("headers", [])
                    table = (
                        ["\t".join(map(replace, map(str, header)))] if header else []
                    )
                    for row in ws.get("values", []):
                        table.append("\t".join(map(replace, map(str, row))))
                    tables.append("\n".join(table))
            return JsonResponse({"data": "\n\n".join(tables)})
        else:
            # try to parse as plain text
            return JsonResponse({"data": upload.read()})
    except Exception as e:
        return JsonResponse(
            {"python_error": f"{e}"}, status=status.HTTP_400_BAD_REQUEST
        )


def cytometry_import(request):
    if request.method != "POST":
        return redirect(reverse("tools:cytometry_home"))
    if request.POST.get("create_study", None):
        study_form = CreateStudyForm(request.POST, prefix="study")
        if study_form.is_valid():
            study = study_form.save()
    else:
        study_form = CreateStudyForm(prefix="study")
        from main.models import Study

        study = Study.objects.get(pk=request.POST.get("study_1", None))
    obj = cytometry.CytometerImport(request)
    obj.process(study)
    return render(request, "cytometry.html", {"study_form": study_form})
