# Experiment Data Depot

The Experiment Data Depot (EDD) is an online tool designed as a repository of standardized
biological experimental data and metadata. The EDD can easily uptake experimental data, provide
visualization of these data, and produce downloadable data in several standard output formats. See
the deployed version at [public-edd.jbei.org][1].

The EDD is available under a [BSD 3-Clause License][6] and is actively developed at the
[Lawrence Berkeley National Lab][7] (LBL) by the [Joint BioEnergy Institute][8] (JBEI), supported
by the U. S. Department of Energy (DOE), Office of Science, Office of Biological and Environmental
Research, through contract DE-AC02-05CH11231 between LBL and DOE.

The source code of EDD is published on [GitHub][9]. Pull requests should adhere to the
[Contributing Guidelines][10], and bug reports or feature requests should be directed to the
GitHub project.

---------------------------------------------------------------------------------------------------

## Getting Started <a name="#Getting_Started"/>

With [Docker][2] and [Docker Compose][3] installed, launching the entire EDD software stack is as
simple as copying the `docker_services` directory of the code repository and running:

    . init-config
    docker-compose up -d

You can then access the EDD through a browser with [http://edd.lvh.me][13], a domain that maps all
requests to the localhost IPv4 address of `127.0.0.1`. Using this domain allows for your browser
to be directed to the correct service, and looks nicer than an IP address.

Without additional configuration, the launched copy of EDD will be using default options. It will
only be available on your local computer, and some functions (e.g. TLS support, external
authentication, referencing an ICE deployment) will not work. See [Deployment][5] for more detailed
instructions for installing Docker and configuring EDD for your deployment environment.

---------------------------------------------------------------------------------------------------

## More Resources <a name="#More_Resources"/>

For a more detailed reference for EDD's low-level configuration options, see [Configuration][4].
Instructions on administering an EDD instance can be found in the [Administration][11] document,
and steps to deploy a new instance are in the [Deployment][5] document. Getting a development
environment set up to modify or contribute to EDD is outlined in the
[Developer Setup][12] document.

---------------------------------------------------------------------------------------------------

[1]:    https://public-edd.jbei.org
[2]:    https://docker.io
[3]:    https://docs.docker.com/compose/overview/
[4]:    docs/Configuration.md
[5]:    docs/Deployment.md
[6]:    LICENSE.txt
[7]:    https://www.lbl.gov
[8]:    https://www.jbei.org
[9]:    https://github.com/JBEI/edd
[10]:   Contributing.md
[11]:   docs/Administration.md
[12]:   docs/Developer_Setup.md
[13]:   http://edd.lvh.me
