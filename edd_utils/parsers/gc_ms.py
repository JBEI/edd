#!/usr/bin/python
# coding: utf-8

"""
Processing of GC-MS report from Agilent's MSDChemStation software, including
identification of consensus retention times for major species and extraction of
individual peak areas.
"""

import jsonpickle
import re
import sys

from io import StringIO
from optparse import OptionParser
from six import string_types


re_signal_new = re.compile("\s*Signal[\s]{1,}:\s{1,}(EIC|TIC).*:")
re_area_sum = re.compile("Sum\ of\ corrected\ areas:")
re_table_rule = re.compile("([\-]{1,}[\s]{1,}){8,}")
re_acq_time = re.compile("(Acq\ On\s*:)(.*)")


class Peak(object):
    """
    An individual peak from a sample run.  Corresponds to a single line in
    the raw logfile.
    """
    def __init__(self, line):
        fields = line.strip().split()
        assert (len(fields) == 10), fields
        self.number = int(fields[0])
        self.retention_time = float(fields[1])
        self.peak_height = int(fields[6])
        self.peak_area = int(fields[7])
        self.is_picked = None

    def __str__(self):
        return "%6d  %8.3f  %8d  %8d" % (
            self.number,
            self.retention_time,
            self.peak_height,
            self.peak_area
        )

    def format_short(self):
        return "%d @ %.3fm" % (self.peak_area, self.retention_time)


class Sample(object):
    """
    Information about a sample run, with any number of peaks.
    """
    def __init__(self, lines, sample_id):
        self.sample_id = sample_id
        self.peaks = []
        for line in lines:
            self.peaks.append(Peak(line))

    def __str__(self):
        return "Sample ID: %s\n%s" % (
            self.sample_id,
            "\n".join(["  " + str(p) for p in self.peaks])
        )

    def retention_times(self):
        return [p.retention_time for p in self.peaks]

    def get_peak_area(self, rt, rt_tolerance):
        n_peaks = area_sum = 0
        for peak in self.peaks:
            if (rt - rt_tolerance) <= peak.retention_time <= (rt+rt_tolerance):
                area_sum += peak.peak_area
                peak.is_picked = True
                n_peaks += 1
        return area_sum, n_peaks

    def get_peak_area_in_range(self, rt_min, rt_max):
        n_peaks = area_sum = 0
        for peak in self.peaks:
            if rt_min <= peak.retention_time <= rt_max:
                area_sum += peak.peak_area
                peak.is_picked = True
                n_peaks += 1
        return area_sum, n_peaks

    def get_peaks_around(self, rt, rt_tolerance):
        peaks = []
        for peak in self.peaks:
            if (rt - rt_tolerance) <= peak.retention_time <= (rt+rt_tolerance):
                peaks.append(peak.retention_time)
                peak.is_picked = True
        return peaks

    def get_peaks_in_range(self, rt_min, rt_max):
        peaks = []
        for peak in self.peaks:
            if (rt_min <= peak.retention_time <= rt_max):
                peaks.append(peak.retention_time)
                peak.is_picked = True
        return peaks

    def get_unrecognized_peaks(self, peak_times=None, rt_tolerance=None, rt_ranges=None):
        assert ([peak_times, rt_ranges].count(None) == 1)
        assert (peak_times is None) or (rt_tolerance is not None)
        if peak_times is not None:
            assert (rt_tolerance is not None)
            rt_ranges = []
            for rt in peak_times:
                rt_ranges.append((rt - rt_tolerance, rt + rt_tolerance))
        peaks = []
        for peak in self.peaks:
            for (rt_min, rt_max) in rt_ranges:
                if rt_min <= peak.retention_time <= rt_max:
                    break
            else:
                peak.is_picked = False
                peaks.append(peak)
        return peaks


class SampleCollection(object):
    """
    Container for multiple samples to be analyzed collectively.
    """
    def __init__(self, samples):
        self.samples = samples

    def show(self, out=sys.stdout):
        for sample in self.samples:
            print(sample, file=out)
            print("", file=out)

    def extract_all_retention_times(self):
        """
        Return retention times for all peaks across all samples as 1D list.
        """
        retention_times = []
        for sample in self.samples:
            retention_times.extend(sample.retention_times())
        return retention_times

    def extract_peak_areas(self, peak_times, bandwidth, err=sys.stderr):
        table = []
        errors = []
        for i_sample, sample in enumerate(self.samples):
            row = [sample.sample_id]
            for i_peak, rt in enumerate(peak_times):
                area, n_peaks = sample.get_peak_area(rt, bandwidth)
                if n_peaks == 0:
                    row.append(None)
                else:
                    if n_peaks > 1:
                        print("WARNING: %d peaks near %.3f for sample %s" % (
                            n_peaks,
                            rt,
                            sample.sample_id),
                            file=err
                        )
                        all_peaks = sample.get_peaks_around(rt, bandwidth)
                        errors.append(
                            (i_sample, i_peak, "%d peaks found: %s" %
                                (n_peaks, ", ".join(["%g" % x for x in all_peaks])))
                        )
                    row.append(area)
            table.append(row)
            unrecognized = sample.get_unrecognized_peaks(peak_times, bandwidth)
            if unrecognized:
                errors.append(
                    (i_sample, None, "Additional peaks: %s" %
                        "; ".join([peak.format_short() for peak in unrecognized]))
                )
        return table, errors

    def extract_peak_areas_by_range(self, rt_ranges, err=sys.stderr):
        table = []
        errors = []
        for i_sample, sample in enumerate(self.samples):
            row = [sample.sample_id]
            for i_peak, (rt_min, rt_max) in enumerate(rt_ranges):
                area, n_peaks = sample.get_peak_area_in_range(rt_min, rt_max)
                if n_peaks == 0:
                    row.append(None)
                else:
                    if n_peaks > 1:
                        print(
                            "WARNING: %d peaks between %.3f and %.3f for sample %s" %
                            (n_peaks, rt_min, rt_max, sample.sample_id),
                            file=err
                        )
                        all_peaks = sample.get_peaks_in_range(rt_min, rt_max)
                        errors.append(
                            (i_sample, i_peak, "%d peaks found: %s" %
                                (n_peaks, ", ".join(["%g" % x for x in all_peaks])))
                        )
                    row.append(area)
            table.append(row)
            unrecognized = sample.get_unrecognized_peaks(rt_ranges=rt_ranges)
            if unrecognized:
                errors.append(
                    (i_sample, None, "Additional peaks: %s" %
                        "; ".join([peak.format_short() for peak in unrecognized]))
                )
        return table, errors

    def show_peak_areas(self, n_expected=None, out=sys.stdout, err=sys.stderr):
        peak_times, bandwidth = self.find_consensus_peaks(
            n_expected=n_expected,
            out=out,
            err=err
        )
        table, errors = self.extract_peak_areas(peak_times, bandwidth, err=err)
        print(
            "          ID %s" % " ".join([
                "%12s" % ("Peak %d" % (k+1))
                for k in range(len(table[0])-1)
            ]),
            file=out
        )
        print(
            "\n".join([" ".join(["%12s" % s for s in row]) for row in table]),
            file=out
        )

    def show_peak_areas_csv(self, n_expected=None, out=sys.stdout, err=sys.stderr):
        peak_times, bandwidth = self.find_consensus_peaks(
            n_expected=n_expected,
            out=out,
            err=err
        )
        table, errors = self.extract_peak_areas(peak_times, bandwidth, err=err)
        print("\n".join([",".join([str(s).strip() for s in row]) for row in table]), file=out)

    def find_consensus_peaks(self, **kwds):
        """
        Use kernel density estimation to analyze the distribution of retention
        times and identify consensus values for major species.
        """
        import edd_utils.math
        x = self.extract_all_retention_times()
        return edd_utils.math.find_consensus_values(x, **kwds)

    def find_peaks_automatically_and_export(self, n_expected=None, include_headers=False):
        err = StringIO()
        peak_times, bandwidth = self.find_consensus_peaks(n_expected=n_expected, err=err)
        table, errors = self.extract_peak_areas(peak_times, bandwidth, err=err)
        if include_headers:
            table.insert(0, ["Sample ID"] + ["Peak %d" % (i+1) for i in range(len(peak_times))])
            table.insert(1, [None] + ["%.4fm" % x for x in peak_times])
        return {
            "data_type": "gc_ms",
            "auto_peak": True,
            "bandwidth": bandwidth,
            "bandwidth_auto": True,
            "peak_times": peak_times,
            "sample_data": table,
            "errors": errors,
            "samples": jsonpickle.encode(self.samples),
        }

    def find_peaks_by_range_and_export(self, rt_ranges, molecule_names=None):
        assert (molecule_names is None) or (len(molecule_names) == len(rt_ranges))
        table, errors = self.extract_peak_areas_by_range(rt_ranges)
        peak_ranges = ["%.4f - %.4fm" % (x, y) for (x, y) in rt_ranges]
        if molecule_names is not None:
            table.insert(0, ["Sample ID"] + list(molecule_names))
            table.insert(1, [None] + peak_ranges)
        return {
            "data_type": "gc_ms",
            "auto_peak": False,
            "peak_times": peak_ranges,
            "sample_data": table,
            "errors": errors,
            "samples": jsonpickle.encode(self.samples),
        }


class Report(SampleCollection):
    """
    Representation of the relevant information of the entire logfile, containing
    an arbitrary number of samples.
    """
    def __init__(self, lines):
        self.acquisition_time = None
        self.samples = []
        have_entries = False
        k = 0
        while k < len(lines):
            line = lines[k].strip()
            if re_signal_new.match(line):
                have_entries = True
                fields = line.split(":")
                sample_id = re.sub("\\\\.*", "", fields[-1].strip())
                k += 1
                while k < len(lines):
                    line = lines[k].strip()
                    k += 1
                    if line == "":
                        continue
                    assert ((not re_signal_new.match(line)) and (not re_area_sum.match(line)))
                    if re_table_rule.match(line):
                        sample_lines = []
                        while k < len(lines):
                            line = lines[k].strip()
                            if re_area_sum.search(line):
                                break
                            elif re_signal_new.match(line):
                                k -= 1
                                break
                            elif line != "":
                                sample_lines.append(line)
                            k += 1
                        self.samples.append(Sample(sample_lines, sample_id))
                        break
            elif self.acquisition_time is None:
                m = re_acq_time.match(line)
                if m:
                    self.acquisition_time = m.groups()[-1]
            k += 1
        if not have_entries:
            raise ValueError("This content does not appear to be a valid ChemStation report.")


def import_xlsx_metadata(file, header_key="ID"):
    from openpyxl import load_workbook
    headers = []
    table = []
    wb = load_workbook(file, read_only=True)
    if len(wb.worksheets) == 0:
        raise RuntimeError("No worksheets found in Excel file!")
    i_row = 0
    rows = list(wb.worksheets[0].rows)
    n_rows = len(rows)
    while (i_row < n_rows):
        row = rows[i_row]
        i_row += 1
        for cell in row:
            if isinstance(cell.value, string_types) and header_key in cell.value:
                headers = [c.value for c in row]
                while i_row < n_rows:
                    row = rows[i_row]
                    i_row += 1
                    if row[0].value is not None:
                        table.append([c.value for c in row])
                    else:
                        break
                break
        if len(headers) > 0:
            break
    return headers, table


def run(args, out=sys.stdout, err=sys.stderr):
    parser = OptionParser()
    parser.add_option(
        "--csv",
        dest="csv",
        action="store_true",
        help="Output result in CSV format for Excel import"
    )
    parser.add_option(
        "--n-peaks",
        dest="n_peaks",
        action="store",
        type="int",
        help="Number of peaks expected"
    )
    parser.add_option(
        "--quiet",
        dest="quiet",
        action="store_true",
        help="Suppress non-essential output"
    )
    options, args = parser.parse_args(args)
    assert len(args) == 1
    result = Report(open(args[0], 'U').readlines())
    assert (len(result.samples) > 0)
    if options.quiet:
        err = StringIO()
    if options.csv:
        result.show_peak_areas_csv(n_expected=options.n_peaks, out=out, err=err)
    else:
        result.show_peak_areas(n_expected=options.n_peaks, out=out, err=err)
    return result


if __name__ == "__main__":
    run(sys.argv[1:])
