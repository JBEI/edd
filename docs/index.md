# Experiment Data Depot

The Experiment Data Depot (EDD) is an online tool designed as a repository of
standardized biological experimental data and metadata. The EDD can easily
uptake experimental data, provide visualization of these data, and produce
downloadable data in several standard output formats. See the deployed version
at [public-edd.jbei.org][1]. An academic article describing the EDD is
available at ACS Synthetic Biology: Morrell, et al "The Experiment Data Depot:
A Web-Based Software Tool for Biological Experimental Data Storage, Sharing,
and Visualization". Get [the article][11] from the ACS website.

The EDD is available under a [BSD 3-Clause License][4] and is actively
developed at the [Lawrence Berkeley National Lab][5] (LBL) by the
[Joint BioEnergy Institute][6] (JBEI), supported by the U. S. Department of
Energy (DOE), Office of Science, Office of Biological and Environmental
Research, through contract DE-AC02-05CH11231 between LBL and DOE.

The source code of EDD is published on [GitHub][7]. Pull requests should adhere
to the [Contributing Guidelines][8], and bug reports or feature requests
should be directed to the GitHub project.

---

## Getting Started

With [Docker][2] and [Docker Compose][3] installed, launching the entire EDD
software stack is as simple as cloning the repository and running the following
commands from a terminal in that directory:

```bash
./bin/init-config offline --deploy=dev
docker-compose up -d
```

This will start a deployment of EDD accessible only on your computer, via
[http://edd.lvh.me][9]. The [tutorial site][10] gives a basic overview of EDD
functionality for end-users.

---

[1]: https://public-edd.jbei.org
[2]: https://docker.io
[3]: https://docs.docker.com/compose/overview/
[4]: License.md
[5]: https://www.lbl.gov
[6]: https://www.jbei.org
[7]: https://github.com/JBEI/edd
[8]: Contributing.md
[9]: http://edd.lvh.me
[10]: https://sites.google.com/lbl.gov/esedataautomation/data-acquisition-storage/experiment-data-depot-edd
[11]: http://pubs.acs.org/doi/abs/10.1021/acssynbio.7b00204
