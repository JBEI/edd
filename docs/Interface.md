# Automated Interface with EDD

This document describes options for automated interface with EDD. At the time of writing, both
EDD's REST API and this document are work-in-progress that will be fleshed out and polished in the
near future.

# REST API

Data scientists, software developers, and collaborating software applications will be able to
access EDD via the REST API that's currently under development.  The REST API is often the best
interface option because it is:
   * industry standard
   * language agnostic
   * separate from the database, and shields client applications from some internal changes in EDD
   * not tied to a specific database vendor or SQL dialect

## API Documentation

Once complete, EDD's REST API will include detailed documentation of each API endpoint available
to logged-in users via a web browser.  For example, the following URL will display the 
documentation soon [https://public-edd.jbei.org/rest/docs/][1].

## Reference Client Implementation

A reference implementation for client-side access to EDD's API is under development in Python.  The
work-in-progress client-side library can be found in the
[EDD API module][2], and an anticipated example use is displayed
below.

__Sample client-side use of EddApi__

    from jbei.rest.auth import EddSessionAuth
    from jbei.rest.clients import EddApi
    from jbei.utils import session_login

    # prompt terminal user for credentials and log in
    edd_login_details = session_login(EddSessionAuth, EDD_URL, 'EDD',
                                      username_arg=args.username, 
                                      password_arg=args.password,
                                      print_result=True,
                                      timeout=EDD_REQUEST_TIMEOUT)
    edd_session_auth = edd_login_details.session_auth

    # instantiate and configure an EddApi instance
    edd = EddApi(base_url=EDD_URL, auth=edd_session_auth)
    edd.timeout = EDD_REQUEST_TIMEOUT

    # get descriptive data for a study
    study = edd.get_study(1)

### Preparing a Python Environment to Run the Client

Older directions for setting up a Python Environment are [here][3], and will be updated
during API development and testing.


# Direct Database Access

Another less-preferred option for automated interface with EDD is to directly access EDD's 
database. Direct database access is only an appropriate option in a limited number of cases, 
since it
effectively circumvents data access controls and consistency checks implemented by EDD.  If your
organization provides open access to the data stored in EDD in lieu of using EDD's user/group
permissions, read-only database access may be an effective option for you. Our suggestion is to
default to using the industry-standard REST API unless there's a compelling reason not to.

Direct database access can be achieved with a wide variety of client-side progamming environments,
and configuring each possible scenario is beyond the scope of this document.  Look for
documentation for your specific technology stack.  After your EDD instance is configured are
working, here are several helpful entry points to configuring client-side database access:
   * EDD's database URL and acccess credentials are in the `secrets.env` file under the
     `docker_services/` directory.
   * See PostgresSQL documentation for directions on creating an account with read-only access to
     EDD's database.
   * You may also need to consult or configure your `docker-compose-override.yml` file to open a
     PostgresSQL port for client connections.

[1]:    https://public-edd.jbei.org/rest/docs/
[2]:    ../jbei/rest/clients/edd/api.py
[3]:    Python_Environment.md