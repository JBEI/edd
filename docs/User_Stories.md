# EDD User Stories

Here we present real EDD user stories and how users interact with EDD.

## Proteomic user story

__User  Goals__:

1. Build a study to hold experiment(s)
2. Submit samples for proteomic analysis
3. Generate and export worklist for proteomic data acquisition
4. Import proteomic data
5. Visualize proteomic data

__Steps in EDD__:

1. Create Study
2. Drag and drop experiment detail excel file (includes strains/plasmids and meta data - ie shaking speed).
3. Generate and export worklist from experiment detail lines.
4. Import data from skyline machine.
5. Visualize data in line and bar charts with ability to filter data.

__Jen's User Story__:

Jennifer is a scientist at JBEI interested in engineering E. coli to produce a biofuel. She chooses a pathway to produce
 a good biofuel and finds genes for each step in the pathway. She designs her constructs, gets her DNA synthesized by an
outside company, assembles the plasmids and transforms them into E. coli. Because she is a good scientist she puts the
information regarding the strains and plasmids into the JBEI ICE-registry. Other scientists can then obtain those same
strains and plasmids if they are interesting in replicating her experiment. Once she has her biofuel producing
organism she measures how much biofuel it makes but it only produces a small amount. She then decides to check for
pathway protein production to see if there are any bottlenecks in her pathway. She meets with the Proteomics team to
design an experiment to quantify proteins in her strains. Chris tells her that she has to make an EDD study to enable
data sharing across JBEI or they won’t run her samples. Jennifer creates a study for her experiments by using the
proteomics instructions for the EDD. She adds her experiment details lines to her study along with the experimental
metadata (culture conditions, induction conditions, etc…). She lets the Proteomics team know that the samples are
 ready and that she created a study in the EDD. The Proteomics team looks at the EDD study to understand the
samples that are being analyzed and check that any new protein sequences need for the experiments are available.
The Proteomics team prepares the samples for analysis and then exports a Worklist from the EDD study that Jen
created for the LC-MS system. After the data is collected the Proteomics team processes the data with Skyline and
imports the data into the EDD. The Proteomics team informs Jennifer that her data is available in the EDD, so
she goes to her study and visualizes the proteomic data with the awesome graph tool (with error bars coming soon)
in the EDD and goes on to win a Nobel prize.

## Import Data for a completed experiment

__User  Goals__:

1. Build a study
2. Import data from experiment user has run
3. Verify data is correctly imported
4. View study data has been imported

__Steps__:

1. Create study by giving study a name. Optional add description and enter contact for who to contact re experiment.
2. Define experimental parameters/settings
    - Download template file
    - Enter samples and meta data corresponding to experiment.
    - Save file
    - Drag/drop file into study
    - Experiment detail lines are created.
3. Import Data
    - Select type of file to import
        a. Generic CSV
        b. Skyline output
        c. Gene transcription data (as table fo RPKM values)
        d. HPLC instrument data file
        e. Proteomics data
        f. Mass Distrubution Vector
        g. Biolector XML
    - Drag/drop file
    - Verify data (table and graph form)
    - Confirm assays correspond to lines created from Experiment Description
    - Import data
4. View imported data on data tab of Study
5. Verify data has been imported
    - view graph
    - view table

__Daniel's User Story__:

Daniel is a scientist.  He works at JBEI and he did an experiment on something. Given that he works at JBEI his data is
most likely a chromatogram in the form of an Agilent .D file. He’s interested in uploading his data so that he can share
his research/data with other scientists.  Someone at work told him about the EDD app.  He decides to check it out.
After he logs in, he gets to the homepage and the first thing he sees is a button that says “input data”. He clicks on
the button “input data” and is taken to a page where there are instructions and options on how to input his data.
First he has to create a new study for his experiment.  He then sees that he has to enter the experiment details by
downloading a sample template. e enters the shaking speed, etc of the experiments he has already completed for the
experiment description file.  He also decides to link his electronic notebooks so that others
can see more of his protocols. He then looks at the list of available data types and chooses the type of data he would
like to input. He chooses the data type and sees  “have you put your data in the correct format?” This sentence is a
link that expands. When he clicks to expand, he sees examples of the correct way to format his data.  He sees that his
data is not in the right format and  then spends several days analyzing his chromatograms and then typing the results
into Excel for normalization and calibration so that it can be uploaded into EDD. Daniel wishes the EDD would
actually process raw data sources like chromatograms.
Armed with an excel file now he clicks on his data type,  He sees that his data is in the correct format. Wonderful.
He sees that he can click and drag his file onto the page. He drags and drops his excel file. He then makes sure all
of his lines are input and clicks “looks good. input my data” and he is immediately taken to a screen where he is
notified that his information has been successfully uploaded.  He sees a graph with his measurements and a table that
includes his assays.

__Problem Daniel is Facing__:
Major problem here is that Daniel’s experiment involves a metabolite for which the EDD does not know about, and he
needs to be able to add it. Daniel’s experiment also involves a measurement data type that is not already in EDD and he
needs to add it (for example 3 gene cluster copy number measurements, every experiment has weird twists and the
EDD should handle them flawlessly and intuitively).


## Data Download

__User  Goals__:

1. Download data from an experiment

__Steps__:

1. Navigate to the EDD study of interest
    - Search by name, contact, date.
    - Search Recent Studies
    - Search My Studies
2. Select lines to download
3. Click export data
4. On export page, remove certain columns or leave as is.
5. Click download.
6. Lines are downloaded with assays and measurements.

__Eli's User Story__:

Eli is a scientist interested in running a flux analysis on David's data. He searches studies based on David's name.
He finds the study he is interested in and clicks on it. He clicks on the table tab. He clicks selects all and
clicks export. He is taken to the export page where he can remove unnecessary columns. He then clicks download and
views the downloaded data as an excel file.


