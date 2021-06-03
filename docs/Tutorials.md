# Tutorials

The following tutorials are specifically using the EDD site at
[public-edd.agilebiofoundry.org](https://public-edd.agilebiofoundry.org/). Each
EDD site has some configuration specific to that site, so the provided example
files may not work exactly as shown in the videos, when using other EDD sites.
The general concepts remain the same between all sites.

## Data Import

The following files are used in this tutorial on importing data to EDD:

1. [Experiment Description][import-1]
2. [Cell density (OD) data][import-2]
3. [External metabolites data][import-3]
4. [Transcriptomics data][import-4]
5. [Proteomics data][import-5]
6. [Metabolomics data][import-6]

<video width="760" height="454" controls>
  <source
    src="https://edd-docs.jbei.org/tutorial/import/EDD_import.mp4"
    type="video/mp4"
  >
</video>

---

## Data Visualization

This tutorial does not require any additional input files. The video shows data
added from a previous tutorial, [Data Import](#data-import).

<video width="760" height="454" controls>
  <source
    src="https://edd-docs.jbei.org/tutorial/visualization/EDD_visualization.mp4"
    type="video/mp4"
  >
</video>

---

## Data Export

Use [this Jupyter Notebook][export-1] to follow along with the Data Export
tutorial. The notebook is tested running in a Python 3.6 kernel, using the
[requirements.txt packages here][export-2]. If you are affiliated with the ABF
or JBEI, and have an account on the Jupyter server, the kernel is named
"ART_3.6" on both [ABF](https://jupyter.agilebiofoundry.org/) and
[JBEI](https://jupyter.jbei.org/) Jupyter servers. Otherwise, follow the
[install instructions for JupyterLab](https://jupyter.org/install/) to run
the notebook.

<video width="760" height="454" controls>
  <source
    src="https://edd-docs.jbei.org/tutorial/export/EDD_export.mp4"
    type="video/mp4"
  >
</video>

---

[import-1]: https://drive.google.com/file/d/1G2hk7c26vBlmsJ2muPoP4p9Kf4pKRiyK/view
[import-2]: https://drive.google.com/file/d/1v5HKmgnZvLZqkqRXgZ0fK8kcpXgwp6nz/view
[import-3]: https://drive.google.com/file/d/1OAOKlm6Rm9-BQZhZzB9WFSotp5CaQid4/view
[import-4]: https://drive.google.com/file/d/1tscjt_MXYPfuPikDnsa6kJyEHWlgLTwF/view
[import-5]: https://drive.google.com/file/d/1oC8a-KbTimP7ma4ClS64UIyuDm17G0oW/view
[import-6]: https://drive.google.com/file/d/1N-YNeH9oowBAbOYiXl6eawyd6DtlP-Du/view
[export-1]: https://github.com/AgileBioFoundry/multiomicspaper/blob/master/notebooks/D_ART_recommendations.ipynb
[export-2]: https://github.com/AgileBioFoundry/multiomicspaper/blob/master/kernel_requirements/requirements_art_3.6.txt
