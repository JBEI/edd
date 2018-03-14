# coding: utf-8
"""
Additional utility functions for processing GC-MS data.  Probably unnecessary.
"""

import numpy as np
import sys

from scipy.stats import gaussian_kde
from sklearn.model_selection import GridSearchCV
from sklearn.neighbors import KernelDensity


# http://stackoverflow.com/a/17909007
def local_maxima(xval, yval):
    xval = np.asarray(xval)
    yval = np.asarray(yval)
    sort_idx = np.argsort(xval)
    yval = yval[sort_idx]
    gradient = np.diff(yval)
    maxima = np.diff((gradient > 0).view(np.int8))
    return np.concatenate((([0],) if gradient[0] < 0 else ()) +
                          (np.where(maxima == -1)[0] + 1,) +
                          (([len(yval)-1],) if gradient[-1] > 0 else ()))


def extract_peaks(max_values, pdf_max, n_expected=None, out=sys.stdout, err=sys.stderr):
    major_peaks = []
    minor_peaks = []
    for i_peak, (xval, pdf_val) in enumerate(max_values):
        if (n_expected is not None):
            if (i_peak < n_expected):
                major_peaks.append((xval, pdf_val))
            else:
                if (pdf_val > pdf_max*0.25):
                    print("WARNING: ignoring major peak at %.3f" % xval, file=err)
                minor_peaks.append((xval, pdf_val))
        elif (pdf_val > pdf_max*0.25):
            major_peaks.append((xval, pdf_val))
        else:
            minor_peaks.append((xval, pdf_val))
    return major_peaks, minor_peaks


def find_consensus_values(
        x,
        n_expected=None,
        bandwidth_auto=True,
        min_bandwidth=0.02,     # XXX This is GC-MS specific
        default_bandwidth=0.1,  # XXX This too
        show_plot=False,
        out=sys.stdout,
        err=sys.stderr):
    """
    Use kernel density estimation to analyze the distribution of data points
    along the X-axis, and identify consensus values for major clusters.  This
    is used to identify common peaks in a set of related GC-MS samples.
    """
    if isinstance(x, list):
        x = np.array(x)
    x_grid = np.linspace(x.min() - 0.25, x.max() + 0.25, 1000)
    if bandwidth_auto:
        # http://jakevdp.github.io/blog/2013/12/01/kernel-density-estimation/
        grid = GridSearchCV(KernelDensity(),
                            {'bandwidth': np.linspace(min_bandwidth, 0.1, 30)},
                            cv=20)  # 20-fold cross-validation
        grid.fit(x[:, None])
        bandwidth = grid.best_params_['bandwidth']
        print("Best bandwidth: %.4f" % bandwidth, file=err)
        kde = grid.best_estimator_
        pdf = np.exp(kde.score_samples(x_grid[:, None]))
    else:
        bandwidth = default_bandwidth
        kde = gaussian_kde(x)
        pdf = kde.evaluate(x_grid)
    i_maxima = local_maxima(x_grid, pdf)
    max_values = []
    for i_max in i_maxima:
        max_values.append((x_grid[i_max], pdf[i_max]))
    # sort maxima by value in distribution
    max_values.sort(key=lambda x: x[1], reverse=True)
    pdf_max = pdf.max()
    major_peaks, minor_peaks = extract_peaks(max_values, pdf_max, n_expected=n_expected,
                                             out=out, err=err)
    # now sort major peaks by retention time
    major_peaks.sort(key=lambda x: x[0])
    print("Major retention time peaks:", file=err)
    for i_peak, (xval, pdf_val) in enumerate(major_peaks):
        print("  %2d  %8.3f" % (i_peak+1, xval), file=err)
    if show_plot:
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots()
        ax.plot(x_grid, pdf, linewidth=3, alpha=0.5, label='bw=%.2f' % kde.bandwidth)
        ax.hist(x, 50, fc='gray', histtype='stepfilled', alpha=0.3, normed=True)
        for rt, pdf_val in major_peaks:
            ax.axvline(rt, color='red')
            ax.axvline(rt-bandwidth, color='magenta')
            ax.axvline(rt+bandwidth, color='magenta')
        plt.show()
    return [xval for xval, yval in major_peaks], float(bandwidth)
