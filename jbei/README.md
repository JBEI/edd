# JBEI Python Code

This package contains Python code for general JBEI use, particularly for client interface to JBEI's
web applications at the API level. Code here is a work in progress, and should eventually be
versioned and distributed independently of (though coordinated with) specific application code
 such as EDD or ICE.

<em>If you aren't familiar with what an [API][1]
is, you probably shouldn't write your own code using these scripts, or <font color="red"><u>you
should do so with help and with great care to avoid destroying important scientific data hosted in
JBEI's web applications.</u></font>.</em>

The initial version of these scripts and API's are being published for comments, and will 
likely need to evolve over time.  While breaking API changes will be avoided like the plague, 
they're a possibility.

## Conventions in this document

Don't panic! :-)

These directions assume you're basically comfortable using the OSX Terminal. If not, or if you use
other Python tools such as iPython, Jupyter, Pandas, etc and aren't comfortable working with
virtual environments, it's probably best to ask for help.

File names and terminal commands below are specially-formatted to clarify that they're
associated with the `Terminal`. In a multi-line terminal block below, each line should be
executed on its own, followed by Enter.  We've made an attempt to point out how to verify that
commands work correctly on your computer, but you should generally pay attention to the command
output to notice any obvious signs that something went wrong (though unfortunately, the signs may
not always be obvious).

This stuff can be intimidating! Ask for help!

## Set up a Python 2 environment

See [the directions][11] for setting up a Python environment to run 
this code. Please note that EDD is in the process of transitioning to Python 3, and these 
published client-side libraries and example scripts will also be migrated to Python 3. The
 Python 2 versions should continue to work.
	
#### Configure the target URL's for the script

If you're running a command line tool that targets a specific EDD and/or ICE deployment, you should 
edit configuration files to adjust which URL's are used to access those deployments.

* `jbei/edd/rest/scripts/settings/` contains the default settings used by all the scripts in this
 directory. If you need to change the defaults in this file, create a `local.py` in the same 
 directory, and any values defined in your `local.py` will override the defaults, but won't show 
 up as edits when you use `git` to check out the latest code. 
 
## Provided Code

Three types of code are provided in this package:

1. Client-side Python API's for accessing JBEI's web applications
2. Example scripts, e.g. scripts that demonstrate basic and advanced use of EDD's REST API.
3. Special-purpose scripts that use the Python API's to accomplish an administrative task 
(likely to be relocated later).
4. General utility code, mostly in support of #1

### Python API's <a name="python_apis">

Client-side Python libraries for accessing ICE's and EDD's REST API's have just been released, but 
are already in limited production use by EDD and by its command line tools.
These libraries aren't mature yet, but may already be helpful for other uses (e.g. in researchers' 
iPython notebooks). This code is still in active development, and is likely to change over time. 
Feel free to use it, but use at your own risk!

See `api.py` modules for EDD and ICE under [`jbei/rest/clients/`][8], as well as other supporting 
modules. Both modules are designed to follow a similar usage pattern. The example below shows 
how to use EDDApi, but IceApi is very similar.

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

For examples of more advanced use, see usage of EddApi in the main() methods of 
[`basic_rest_queries.py`][9] or [`sample_rest_quries.py`][10]

### Command Line Tools

The following command-line tools re provided. Run each with the `--help` parameter for more 
detailed information on the available options.

* `basic_rest_queries.py` This script demonstrates the most basic approach extracting study data
  from EDD using its REST API.
* `sample_rest_queries.py` This script is a more powerful and realistic client-side example of 
  using EDD's REST API.  It allows clients to perform sample searches of EDD to extract data of
  interest, and supports optionally writing the results to a simple CSV file similar to EDD's 
  export format.
* `maintain_ice_links.py` This work-in-progress script supports scanning linked EDD/ICE deployments 
  and maintaining the association between EDD experiments and ICE parts, which can become 
  out-of-date under some circumstances (e.g. downtime or communication failure). See the 
  [draft technical documentation][2] for this script.

#### Running Command Line Tools

Running an example script from the base EDD directory: 
`python -m jbei.edd.rest.scripts.sample_rest_queries`


[1]:    https://en.wikipedia.org/wiki/Application_programming_interface
[2]:    edd/rest/scripts/Maintain_Links.md
[8]:    rest/clients/
[9]:    edd/rest/scripts/basic_rest_queries.py
[10]:   edd/rest/scripts/sample_rest_queries.py
[11]:   ../docs/Python_Environment.md




	
	   
	   
