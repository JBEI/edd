
""" Miscellaneous data-processing utilities. """

import json

from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from io import BytesIO

from . import gc_ms_workbench
from .parsers import skyline


def utilities_index (request) :
    return render(request, 'index.html', {})

########################################################################
# GC-MS
#
@ensure_csrf_cookie
def gcms_home(request):
    """Starting point for extracting peaks from ChemStation report files."""
    return render(request, 'gc_ms.html', {})

def gcms_parse(request):
    """ Process an Agilent MSDChemStation report and return a table of data as JSON string. """
    try:
        json_result = gc_ms_workbench.process_gc_ms_form_and_parse_file(
            form=request.POST,
            file=request.FILES['file'])
        assert isinstance(json_result, dict)
        return JsonResponse(json_result)
    except (AttributeError, KeyError, ValueError) as e:
        return JsonResponse({ 'python_error' : str(e) })

def gcms_merge(request):
    data = json.loads(request.body)
    try:
        return JsonResponse(gc_ms_workbench.finalize_gc_ms_spreadsheet(data))
    except RuntimeError as e:
        return JsonResponse({ 'python_error' : str(e) })

def gcms_export(request):
    form = request.POST
    try:
        prefix = form['prefix']
        headers = json.loads(form['headers'])
        table = json.loads(form['table'])
        assert (len(table) > 0)
        # XXX but note below that the Workbook needs to be created with specific
        # options, otherwise this won't work
        f = BytesIO(gc_ms_workbench.export_to_xlsx(table, headers))
        file_name = prefix + ".xlsx"
        response = HttpResponse(f,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response['Content-Disposition'] = 'attachment; filename="%s"' % file_name
        return response
    except Exception as e:
        messages.error(request, "Could not generate the GC-MS export file: %s" % e)
        return HttpResponse(status=500)
#

########################################################################
# PROTEOMICS
#
@ensure_csrf_cookie
def skyline_home(request):
    return render(request, 'skyline_import.html', {})

def skyline_parse(request):
    try:
        data = request.FILES['file'].read()
        result = skyline.ParseCSV(data.splitlines())
        assert (result is not None)
        return JsonResponse(result.export())
    except Exception as e:
        messages.error(request, "Skyline parse failed: %s" % e)
        return HttpResponse(status=500)


########################################################################
# CYTOMETRY
#
def cytometry_home(request):
    return render(request, 'cytometry.html', {})
