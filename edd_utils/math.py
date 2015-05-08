
"""
Additional utility functions for processing GC-MS data.  Probably unnecessary.
"""

from __future__ import division
import sys

def find_consensus_values (
    x,
    n_expected=None,
    bandwidth_auto=True,
    min_bandwidth=0.02,    # XXX This is GC-MS specific
    default_bandwidth=0.1, # XXX This too
    show_plot=False,
    out=sys.stdout,
    err=sys.stderr) :
  """
  Use kernel density estimation to analyze the distribution of data points
  along the X-axis, and identify consensus values for major clusters.  This
  is used to identify common peaks in a set of related GC-MS samples.
  """
  from sklearn.grid_search import GridSearchCV
  from sklearn.neighbors import KernelDensity
  import numpy as np
  if isinstance(x, list) :
    x = np.array(x)
  x_grid = np.linspace(x.min() - 0.25, x.max() + 0.25, 1000)
  if bandwidth_auto :
    # http://jakevdp.github.io/blog/2013/12/01/kernel-density-estimation/
    grid = GridSearchCV(KernelDensity(),
                    {'bandwidth': np.linspace(min_bandwidth, 0.1, 30)},
                    cv=20) # 20-fold cross-validation
    grid.fit(x[:, None])
    bandwidth = grid.best_params_['bandwidth']
    print >> err, "Best bandwidth: %.4f" % bandwidth
    kde = grid.best_estimator_
    pdf = np.exp(kde.score_samples(x_grid[:, None]))
  else :
    from scipy.stats import gaussian_kde
    bandwidth = default_bandwidth
    kde = gaussian_kde(x)#, bw_method=bandwidth / x.std(ddof=1))
    pdf = kde.evaluate(x_grid)
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
  #i_maxima = argrelextrema(pdf, np.greater)[0]
  i_maxima = local_maxima(x_grid, pdf)
  max_values = []
  for i_max in i_maxima :
    max_values.append((x_grid[i_max], pdf[i_max]))
  # sort maxima by value in distribution
  max_values.sort(lambda a,b: cmp(b[1], a[1]))
  pdf_max = pdf.max()
  major_peaks = []
  minor_peaks = []
  for i_peak, (xval, pdf_val) in enumerate(max_values) :
    if (n_expected is not None) :
      if (i_peak < n_expected) :
        major_peaks.append((xval, pdf_val))
      else :
        if (pdf_val > pdf_max*0.25) :
          print >> err, "WARNING: ignoring major peak at %.3f" % xval
        minor_peaks.append((xval, pdf_val))
    elif (pdf_val > pdf_max*0.25) :
      major_peaks.append((xval, pdf_val))
    else :
      minor_peaks.append((xval, pdf_val))
  # now sort major peaks by retention time
  major_peaks.sort(lambda a,b: cmp(a[0], b[0]))
  print >> err, "Major retention time peaks:"
  for i_peak, (xval, pdf_val) in enumerate(major_peaks) :
    print >> err, "  %2d  %8.3f" % (i_peak+1, xval)
  if show_plot :
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots()
    ax.plot(x_grid, pdf, linewidth=3, alpha=0.5,
      label='bw=%.2f' % kde.bandwidth)
    ax.hist(x, 50, fc='gray', histtype='stepfilled', alpha=0.3, normed=True)
    for rt, pdf_val in major_peaks :
      ax.axvline(rt, color='red')
      ax.axvline(rt-bandwidth, color='magenta')
      ax.axvline(rt+bandwidth, color='magenta')
    plt.show()
  return [ xval for xval,yval in major_peaks ], float(bandwidth)
