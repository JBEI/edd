## What is EDD?

The Experiment Data Depot (EDD) is an interactive online tool that serves as a
standardized **repository of experimental data**. EDD provides a standardized
description of experiments: from the strains and plasmids involved, to the
protocols used, the experimental design for sampling, and the data extracted.

This tool significantly facilitates the Test and Learn phases in the
[DBTL cycle][1]. Below, you can find a publication describing EDD, the
available EDD services, and tutorials that explain how to get an account and
use EDD. You can find some examples of how EDD has been used in the past to
facilitate Learn in the DBTL cycle in [Radivojević, et al (2020)][2],
[Zhang, et al (2020)][3], and [Roy, et al(2021)][4].

[![Image of EDD Publication title and authors; click to open][5]][6]

## Available EDD Sites

There are several EDD sites (a.k.a. services, or instances) available. The
"public-" prefix sites are open for signup to the general public. These contain
published datasets affiliated with the projects running the sites, the
[Agile BioFoundry (ABF)](https://agilebiofoundry.org/) and
[Joint BioEnergy Institute (JBEI)](https://www.jbei.org/). The other sites are
only available to collaborators having affiliate or employee status with
Berkeley Lab (LBL), and active membership in the affiliated projects (ABF or
JBEI). Ask your PI which site you should be using.

-   [public-edd.agilebiofoundry.org](https://public-edd.agilebiofoundry.org/)
-   [public-edd.jbei.org](https://public-edd.jbei.org/)
-   [edd.agilebiofoundry.org](https://edd.agilebiofoundry.org/)
-   [edd.jbei.org](https://edd.jbei.org/)

### Accessing EDD Sites

If you are a Berkeley Lab employee or affiliate, you can log into any of the
sites using your LBL LDAP credentials. Non-LBL collaborators within the ABF or
JBEI programs should contact [Nathan Hillson](mailto:NJHillson@lbl.gov) to get
LBL affiliate status to use EDD.

External collaborators should self-register to the "public-" site for the
program sponsoring the research, e.g. using a non-LBL account.
Self-registration is only allowed in the "public-" instances.

## Using EDD

Find information on using EDD under the User Guide menu, including
[Tutorials](Tutorials.md) and [Frequently Asked Questions](FAQ.md).

## Create your own EDD Site

The EDD is available under a [BSD 3-Clause License](License.md) and is actively
developed. Find information on deploying your own EDD Site under the Admin
Guide menu. Get the full source to EDD from the
[GitHub repo](https://github.com/JBEI/edd) and Docker images from
[Docker Hub](https://hub.docker.com/r/jbei/edd-core).

## Developing EDD

For running EDD in development, check the Development menu. See details on
[development environment setup](Developer_Setup.md), and our
[Contributing Guidelines](Contributing.md). For a quick start, after cloning
the repository, run:

```shell-session
[user@host]$ ./bin/init-config offline --deploy=dev
[user@host]$ docker compose up -d
```

This should start a deployment of EDD accessible only on your computer, via the
URL [edd.lvh.me](http://edd.lvh.me/).

---

[1]: https://www.sciencedirect.com/science/article/pii/S0092867416300708
[2]: https://www.nature.com/articles/s41467-020-18008-4
[3]: https://www.nature.com/articles/s41467-020-17910-1
[4]: https://www.frontiersin.org/articles/10.3389/fbioe.2021.612893/full
[5]: img/morrell_2017.png
[6]: https://pubs.acs.org/doi/abs/10.1021/acssynbio.7b00204
