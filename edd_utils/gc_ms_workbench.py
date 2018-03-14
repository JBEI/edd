# coding: utf-8
"""
Tools for data manipulation via web interfaces, in particular the processing
of GC-MS results (using separate parser module).
"""

import re
import warnings

from edd_utils import form_utils
from edd_utils.parsers import gc_ms


def finalize_gc_ms_spreadsheet(data):
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        combined_col_names, combined_table = combine_processed_peaks_and_metadata(
            molecules=data['molecules'],
            peak_table=data['data'],
            annotation_headers=data['key_headers'],
            annotation_table=data['key_table']
        )
        return {
            'headers': combined_col_names,
            'table': combined_table,
            'warnings': [str(w_) for w_ in w],
        }


def process_gc_ms_form_and_parse_file(form, file):
    try:
        data = re.sub("\r", "", file.read())
        result = gc_ms.Report(data.splitlines())
    except ValueError as e:
        try:
            headers, table = gc_ms.import_xlsx_metadata(file)
        except Exception:
            raise ValueError(
                "The uploaded file could not be processed as either an MSDChemStation report "
                "or an Excel workbook."
            )
        else:
            return {
                "data_type": "xls",
                "headers": headers,
                "table": table,
            }
    if form.get("auto_peaks") == "auto":
        return result.find_peaks_automatically_and_export(include_headers=True)
    else:
        n_mols = form_utils.extract_integers_from_form(form, "n_mols")
        rt_std_min = form_utils.extract_floats_from_form(form, "rt_standard_min")
        rt_std_max = form_utils.extract_floats_from_form(form, "rt_standard_max")
        rt_ranges_and_molecules = [(rt_std_min, rt_std_max, "standard")]
        for i_mol in range(n_mols):
            mol_name = form_utils.extract_non_blank_string_from_form(
                form,
                param_name="mol_name_%d" % i_mol
            )
            rt_min = form_utils.extract_floats_from_form(
                form,
                param_name='rt_min_mol_%d' % i_mol
            )
            rt_max = form_utils.extract_floats_from_form(
                form,
                param_name='rt_max_mol_%d' % i_mol
            )
            rt_ranges_and_molecules.append((rt_min, rt_max, mol_name))
        rt_ranges_and_molecules.sort(key=lambda x: x[0])
        for i_rt, (x1, y1, s1) in enumerate(rt_ranges_and_molecules[:-1]):
            x2, y2, s2 = rt_ranges_and_molecules[i_rt + 1]
            assert(y1 < x2)  # this should really be checked server-side too
        return result.find_peaks_by_range_and_export(
            rt_ranges=[(x, y) for (x, y, s) in rt_ranges_and_molecules],
            molecule_names=[s for (x, y, s) in rt_ranges_and_molecules]
        )


def _check_warnings(peak_table, annotation_table):
    n_samples = len(peak_table)
    n_samples_annotated = len(annotation_table)
    if n_samples < n_samples_annotated:
        warnings.warn(
            "There are more entries in the metadata file (%d) than samples in the extracted "
            "GC-MS report (%d). Samples without accompanying metadata will be ignored." % (
                n_samples_annotated,
                n_samples
            )
        )
    elif n_samples > n_samples_annotated:
        warnings.warn(
            "There are more entries in the extracted GC-MS report (%d) than in the accompanying "
            "metadata file (%d). Samples not found in the report will be ignored." % (
                n_samples,
                n_samples_annotated
            )
        )


def _get_sample_index(annotation_headers):
    i_sample = None
    for i_field, field in enumerate(annotation_headers):
        if (field is None):
            continue
        field = field.lower()
        if "sample" in field and "id" in field:
            if i_sample is None:
                i_sample = i_field
            else:
                raise RuntimeError(
                    "Could not unambiguously determined the sample ID field in the metadata file."
                )
    if i_sample is None:
        raise RuntimeError(
            "Could not unambiguously determined the sample ID field in the metadata file."
        )
    return i_sample


def combine_processed_peaks_and_metadata(molecules, peak_table, annotation_headers,
                                         annotation_table):
    """
    Given two tables, one a list of values corresponding to various peaks for
    each sample in the GC-MS report, the other a table of metadata associated
    with each sample, combine the two into a single table with both metadata
    and metabolite peaks.  This is designed to be somewhat tolerant of
    discrepancies.
    """
    _check_warnings(peak_table, annotation_table)
    i_sample = _get_sample_index(annotation_headers)
    combined_col_names = ["Sample ID"] + [
        field
        for i, field in enumerate(annotation_headers)
        if i != i_sample
    ]
    combined_col_names.extend(molecules)
    peaks = {}
    for sample_row in peak_table:
        assert(len(sample_row) == len(molecules) + 1)
        sample_id = sample_row[0]
        peaks[sample_id] = sample_row[1:]
    missing_samples = []
    combined_table = []
    for sample_info in annotation_table:
        sample_id = sample_info[i_sample]
        if sample_id not in peaks:
            warnings.warn(f"Missing sample {sample_id}")
            missing_samples.append(sample_id)
            continue
        row = [sample_id] + [
            field
            for i, field in enumerate(sample_info)
            if i != i_sample
        ]
        row.extend(peaks[sample_id])
        assert(len(row) == len(combined_col_names))
        combined_table.append(row)
    if len(combined_table) == 0:
        raise RuntimeError(
            "No sample IDs in common between processed report and metadata in spreadsheet."
        )
    return combined_col_names, combined_table


def export_to_xlsx(table, headers=None, title="GC-MS processing"):
    from openpyxl import Workbook
    from openpyxl.writer.excel import save_virtual_workbook
    # XXX https://bitbucket.org/openpyxl/openpyxl/issue/375/use-save_virtual_workbook-and-optimized
    wb = Workbook(optimized_write=False, write_only=False)
    ws = wb.active
    ws.title = "GC-MS processing"
    if headers is not None:
        assert(len(headers) == len(table[0]))
        ws.append(headers)
    for row in table:
        ws.append(row)
    return save_virtual_workbook(wb)
