
"""
Miscellaneous data-processing utilities.
"""

from edd_utils import gc_ms_workbench
from edd_utils.parsers import skyline
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from io import BytesIO
import json

def utilities_index (request) :
    return render(request, 'index.html', {})

########################################################################
# GC-MS
#
def gcms_home (request):
    """Starting point for extracting peaks from ChemStation report files."""
    return render(request, 'gc_ms.html', {})

@csrf_exempt
def gcms_parse (request) :
    """
    Process an Agilent MSDChemStation report and return a table of data as
    JSON string.
    """
    try :
        json_result = gc_ms_workbench.process_gc_ms_form_and_parse_file(
            form=request.POST,
            file=request.FILES['file'])
        assert isinstance(json_result, dict)
        return JsonResponse(json_result)
    except ValueError as e :
        return JsonResponse({ 'python_error' : str(e) })

@csrf_exempt
def gcms_merge (request) :
    data = json.loads(request.body)
    try :
        return JsonResponse(gc_ms_workbench.finalize_gc_ms_spreadsheet(data))
    except RuntimeError as e :
        return JsonResponse({ 'python_error' : str(e) })

@csrf_exempt
def gcms_export (request) :
    form = request.POST
    prefix = form['prefix']
    headers = json.loads(form['headers'])
    table = json.loads(form['table'])
    assert (len(table) > 0)
    # XXX but note below that the Workbook needs to be created with specific
    # options, otherwise this won't work
    f = BytesIO(gc_ms_workbench.export_to_xlsx(table, headers))
    file_name = prefix + ".xlsx"
    response = HttpResponse(f,
        content_type=\
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response['Content-Disposition'] = 'attachment; filename="%s"' % file_name
    return response
#

########################################################################
# PROTEOMICS
#
def skyline_home (request):
    return render(request, 'skyline_import.html', {})

@csrf_exempt
def skyline_parse (request) :
    data = request.FILES['file'].read()
    result = skyline.ParseCSV(data.splitlines())
    assert (result is not None)
    return JsonResponse(result.export())
