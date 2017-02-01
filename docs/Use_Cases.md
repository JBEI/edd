# EDD Use Cases

This document captures some of the high-level use cases for EDD. It is not intended as an
exhaustive guide to EDD's features, but more of an overview of the expected user base and some of
users' differing needs from EDD's major features.

## Experiment definition

Regardless of the exact process used to define experimental parameters, there's a need to capture
sufficient metadata in EDD to allow the experiment to be fully understood by readers, as well as
reproduced later (at least in combination with the associated paper). The standard English
description of experimental conditions captured in scientific publications can't be automatically
processed, and is often insufficient to reproduce the experiment later on. Experiment
reproducability is a much larger issue that cannot be entirely solved by EDD, but EDD can provide
a standard format for capturing experimental conditions, as well as some help in reviewing whether
a minimal set of metadata have been captured for posterity.

At the time of writing, its the user's responsibility to ensure the data entered into EDD are
sufficiently detailed/accurate to help preserve the institutional legacy associated with its
experiments. Future versions may add curation / review features to help ensure that at least some
standard / repeated experiments are sufficiently described in EDD.

Experiment definition in EDD often follows one of two broad workflows:

1. __Automated workflows__: JBEI uses cases for Proteomics (and eventually Metabolomics) require
   users to define their experimental conditions before the related measurements are performed.
   Lines, Assays, and their metadata are used as input for creating a worklist, which in turn gets
   used as input to generate instructions or configuration for experimental platforms. Users who
   populate the experiment definition may not be the same as the ones who later review it and
   generate the worklist. Another important purpose of experiment definition is to capture and
   convey experimental design parameters to the researchers who are running the measurement
   platforms, since some conditions will affect how they do their work.

   EDD users who don't take advantage of worklists may still want to predifine experimental
   parameters to save work later during data entry into EDD (e.g. when importing large or
   preexisting tabular data), or to prevent needing to sift through Lines/Assays to update
   metadata values following the import process.

2. __Manual workflows__: Some users will not want to predefine their experimental parameters. In
   the case of BioLector and HPLC data imports, for example, Lines and Assays can be created
   automatically. In cases where Lines are relatively homogenious, and can easily be bulk edited
   after an import is completed, there is no motivation to predefine the experiment in EDD, and no
   need for users to learn to operate that portion of its interface.


## Importing Data

Scientists need to import their data into EDD in the simplest fashion possible, and with a minimum
knowledge of EDD and its internals. Students and postdoc turnover is high at JBEI, and even for
long-term employees, many spend most of their time in the lab and will have long gaps between uses
of EDD, during which they're likely to forget part or all of their training.

## Measurement Visualization

1. __Guiding experiments / analysis:__ for cases where simple visualizations provided by EDD are
   enough, experimenters can view their data directly in the EDD UI and use it to guide
   decisionmaking for further experiment design, or for where to focus further analysis. Ideally,
   some experimentors will be able to export publication-quality results directly from EDD's user
   interface without the need for other tools. EDD's goal is to support the most common ~80% of
   visualization needs, and experimentors who need less commonly-used visualizations should use
   or create other tools developed for that purpose.

2. __Filtering exports:__ another common use case for EDD's visualization tools is to filter down
   just the data of interest for export, or for automated definition of follow-up experiments
   based on data already captured in EDD. For example, researchers may do an initial experiment
   to search the paramater space for likely areas of investigation, use EDD's visuals to identify
   further required experiments, and then use the visualization filtering options to clone a
   subset of lines into a new study to avoid duplicate data entry.

3. __Reviewing results:__ paper reviewers internal and external to JBEI may want to review
   experimental measurement data during the process of reviewing or attempting to reproduce
   experimental results.

## Metadata Visualization

1. __'Omics-as-a-service pipelines__: Measurement / analysis pipelines in place at JBEI use EDD's
   experiment metadata to capture and communicate important experimental conditions in a standard
   format. For example, before conducting Proteomics experiments on behalf of JBEI researchers,
   Chris will often review the experiment setup and and provide guidance to the researcher before
   creating a worklist or performing any measurements.

2. __Curating institutional legacy:__ There is a need for researchers, and sometimes PI's, to
   review experiment definitions entered into EDD to make certain that the important experimental
   conditions and measurements have been captured for posterity. This process is currently
   supported only by manual inspection of Line, Assay, and Metadata definitions. Future versions
   of EDD may include support for helping to curate this data, especially for commonly-repeated
   experiments, but due to the unique nature of many experiments, it is unlikely that software can
   always enforce entry of all the required contextual information. Until automated support is in
   place for metadata curation, there is also a need for POC's (e.g. Chris for Proteomics and
   Edward for Metabolomics) to help ensure that duplicate data entry / inconsistent naming
   conventions in Biology don't cause redundency or hamper data comparisons in EDD.

3. __Reviewing results:__ readers of JBEI publications may want to review the actual measurements
   and experimental conditions captured in EDD to understand publications or to help in
   reproducing experiments. They may also want to compare experimental conditions between
   similar studies.


## Exporting Measurements / Metadata

1. __Creating a worklist:__ user is in posession of a defined experiment (Lines/Assays/Metadata
   are defined) and needs to generate a worklist. Since the person generating the worklist may not
   be the same person who defined the experiment in EDD, there's a need to:

      1. Review the experiment from a scientific viewpoint to see whether it makes sense. This is
         currently a manual process based on other existing parts of the GUI. A future update may
         introduce an automated process and/or present data in a consolidated view for
         this purpose.
      2. Review the experiment for consistency / completeness / compatibility with
         automated workflows. Like the previous item, there are no dedicated GUI components for
         this purpose at this time.

2. __Exporting data for analysis:__ user wants to analyze data using other programs, but is often
   only interested in exporting a subset of the experiment. The subset of data experted is often
   based either on inspection of the line/assay definitions and meta-data, or on selective
   filtering of the plot. Common/anticipated use cases at JBEI are:

      1. __SBML export:__ SBML is a standard format used to describe metabolic networks. SBML's
         purpose is to model organism metabolisms, so it has applications outside of Synthetic
         Biology. EDD's support for the format is evolving along with the standard.
      2. __CSV export:__ for a variety of other uses, including custom analysis. Common analysis
         tools are: Excel, R, MatLab, or iPython notebooks.
      3. __REST API export:__ for consumption by advanced users with more specific needs, by the
         EDD GUI, or by other software. This is partly available in the current version of EDD,
         but needs additional work and documentation.
