# Experiment Data Depot

The Experiment Data Depot (EDD) is an online tool designed as a repository of standardized
biological experimental data and metadata. The EDD can easily uptake experimental data, provide
visualization of these data, and produce downloadable data in several standard output formats. See
the deployed version at [public-edd.jbei.org][1]. An academic article describing the EDD is
available at ACS Synthetic Biology: Morrell, et al "The Experiment Data Depot: A Web-Based
Software Tool for Biological Experimental Data Storage, Sharing, and Visualization". Get
[the article][18] from the ACS website.

The EDD is available under a [BSD 3-Clause License][6] and is actively developed at the
[Lawrence Berkeley National Lab][7] (LBL) by the [Joint BioEnergy Institute][8] (JBEI), supported
by the U. S. Department of Energy (DOE), Office of Science, Office of Biological and Environmental
Research, through contract DE-AC02-05CH11231 between LBL and DOE.

The source code of EDD is published on [GitHub][9]. Pull requests should adhere to the
[Contributing Guidelines][10], and bug reports or feature requests should be directed to the
GitHub project.

---------------------------------------------------------------------------------------------------

## Getting Started <a name="#Getting_Started"/>

The EDD is packaged as a collection of [Docker][2] container images. With the [Docker Compose][3]
tool, all the components of EDD are configured to work together, and requires no other installation
of dependencies. Docker has installers available for several operating systems [here][15]. The
Docker for Mac installer includes both Docker and Docker Compose; the installers for Linux
environments currently only include Docker, and Docker Compose must be [installed separately][16].
EDD does not test with, or support, Docker for Windows at this time. Docker versions should be
v.1.13.0 or greater, or v.17.03 or greater for Docker Community Edition. Docker Compose should be
v.1.11.2 or greater.

With [Docker][2] and [Docker Compose][3] installed, launching the entire EDD software stack is as
simple as copying the `docker_services` directory of the code repository and running the following
commands from a terminal in that directory:

    . init-config
    ./start-edd.sh

The first time EDD runs, it must complete some setup tasks before the UI is available. You may
monitor progress with `docker-compose logs -f` and wait for `Starting production appserver` to
appear (you can quit viewing logs with Ctrl+c), or simply wait a few minutes. You can then access
the EDD through a browser with [http://edd.lvh.me][13], a domain that maps all requests to the
localhost IPv4 address of `127.0.0.1`. Using this domain allows for your browser to be directed to
the correct service, and looks nicer than an IP address.

Without additional configuration, the launched copy of EDD will be using default options. It will
only be available on your local computer, and some functions (e.g. TLS support, external
authentication, referencing an ICE deployment) will not work. See [Deployment][5] for more detailed
instructions for installing Docker and configuring EDD for your deployment environment.

You may test the edd installation by following the [Public EDD tutorials][14]. If you have not
deployed ICE with your EDD installation, eliminate the part ID numbers in the example files in
order to complete the tutorial. Creating an account without configuring EDD will send an email from
`webmaster@localhost`, which may get caught by spam filters; be sure to check there if the
confirmation message does not appear within a few minutes. Once the email is confirmed, the user
name for logging in is the part of your email before the `@` sign.

---------------------------------------------------------------------------------------------------

## More Resources <a name="#More_Resources"/>

For a more detailed reference for EDD's low-level configuration options, see [Configuration][4].
Instructions on administering an EDD instance can be found in the [Administration][11] document,
and steps to deploy a new instance are in the [Deployment][5] document. Getting a development
environment set up to modify or contribute to EDD is outlined in the [Developer Setup][12]
document. The [Troubleshooting][17] guide details some commands to diagnose problems.

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
[14]:   https://public-edd.jbei.org/pages/tutorials/
[15]:   https://www.docker.com/community-edition#/download
[16]:   https://docs.docker.com/compose/install/
[17]:   docs/Troubleshooting.md
[18]:   http://pubs.acs.org/doi/abs/10.1021/acssynbio.7b00204
