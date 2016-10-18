# Running the Script

__Options__: there are many, mostly for helping to test the script in various environments or in 
different stages of development.  It's best to just run 
`python -m jbei.edd.rest.scripts.maintain_ice_links` and read the help.  

__Runtime__:
The script's runtime is heavily dependent on the amount of data in the EDD/ICE databases, as well as 
the speed of connections to them. As of 10/12/16, test runs on a development laptop take about an 
hour each, though little effort has gone into optimizing the runtime on this script. It shouldn't 
have to run often, and should run mostly unsupervised, so it's probably not worth the effort to 
optimize.

# Limitations

1. The `-update_strain_text` option hasn't been fully tested at present. See EDD-XXX and ICE-XXX. 
Probably need some additional input on whether / how to go about this (alias?)
2. Not optimized. First pass at this script is just to get it working, and unclear whether 
optimization work will be worth the additional development time / complexity.

# Maintenance Concerns
The scripts `-dry_run` option is an important feature for speeding up the testing process for large 
changes to the script or related REST API's.  However, it depends on wrapper classes that descend 
from IceApi and EddApi. If you alter the script to use different methods of those Api's, it's 
important to change the method overrides as well so you don't accidentally make database changes.  
There's a reminder prompt when you run the script, but it's easy to get in the habit of cutting-and-
pasting commands that have the `-no_warn` option already set to hide the prompt.  Use it carefully!! 
his option was used heavily during initial testing of the script, but is purposefully removed from 
examples below.

#Testing process for maintain_ice_links.py

This document contains sample instructions for testing maintain_ice_links.py against local 
deployments of EDD and ICE.  It also provides a general outline for the initial testing performed 
before running this script on the production versions of EDD and ICE for the first time. It's 
probably not optimized in every case, though it should give helpful hints on important steps / 
problems encountered during some variants of the testing process. Note that testing commands below 
work, but behave a bit strangely with regard to user input when piped to `tee`. You might want to 
run a few times without `tee` to figure out what's being asked for during the login process.

## Be on the wired JBEI network
With current LBNL IT policy and EDD software, you won't be able to directly connect to 
postgres.jbei.org or to login on your local EDD instance unless you're connected to the wired 
network.

## Create reference database dumps so tests are repeatable
This may seem like overkill, but it's very helpful to make results comparable across multiple runs 
while squashing bugs.

### Dump the ICE test database:

pg_dump -Fp -C -E UTF8 -h postgres.jbei.org -U mark.forrer -d test_regdb -f ice_test_dump.sql

replace user/database names to ice_local_test / reguser to avoid having to change local ICE config

### Dump the ICE prod database:

    pg_dump -Fp -C -E UTF8 -h postgres.jbei.org -U mark.forrer -d regdb -f ice_prod_dump.sql
replace database name to `ice_local_test`

### Dump the EDD prod database:

    pg_dump -Fp -C -E UTF8 -h postgres.jbei.org -U mark.forrer -d eddprod -f edd_prod_dump.sql

Replace database name 'eddprod' with 'edd'

## Start local EDD / ICE

* EDD

    cd edd
    docker-compose up -d	
* Start ICE

    cd ../ice
    mvn:jetty run
	
	TODO: confirm URLs!!!!
	
## Confirm admin access to ICE / EDD
* Log in via the web interfaces to confirm your account has admin access
   * EDD will have an 'Administration' link at top right if your account has administrator or some 
   accellerated privileges. The script doesn't currently have fine-grained checks for this, so it 
   may still fail later (though it will be early in the process)
   * ICE will have a 
* ICE: `update accounts set type = 'ADMIN' where email = 'mark.forrer@lbl.gov';`
* EDD:
    user = User.objects.get(username='mark.forrer')
	user.is_superuser = True
	user.save()

## Set Predictable Database State
Use the included reset_docker_databases.sh script to simplify repeated database restores to a known
state.  You'll have to copy and edit reset_docker_database.conf-example to match your local 
configuration, then run the script to drop and restore both EDD and ICE databases.
	
	
## Configure which target deployments are searched/modified by the script

Edit jbei.edd.rest.scripts.local_settings.py to set target deployments, for example, for local 
EDD/ICE instances:

    LOCAL_DOCKER_EDD_URL = 'https://192.168.99.100:443'
    DOCKER_CONTAINER_INTERNAL_URL = 'https://localhost:8000'
    EDD_URL = LOCAL_DOCKER_EDD_URL
    VERIFY_EDD_CERT = False
    
    LOCAL_ICE_URL = 'https://localhost:8443'
    ICE_TEST_URL = 'http://registry-test.jbei.org:8443'
    ICE_URL = LOCAL_ICE_URL
    VERIFY_ICE_CERT = False
    
    DEFAULT_LOCALE = b'en_US.UTF-8'  # override Docker container default to work in OSX




	
## Run the script (dry run)
Doing a dry run first helps to quickly identify configuration / software syntax errors without 
polluting the test databases with partial changes. If making significant changes to the script, or 
following significant changes to EDD / ICE, consider using the `-test_edd_strain_limit` option to 
test progressively larger numbers of EDD strains. Also consider using command line options to test a 
single EDD strain / ICE entry, or initially omitting the `-scan_ice_entries` option to focus just on 
the faster/most useful portion of the script that only examines strains found in EDD's database. 
Always save the script's output to file, since it takes around an hour for each full run on a 
development laptop.

* You can help to test the `-dry-run` option by commenting out the lines that set the `write_enabled` 
  flag for the EDD/ICE client side API instances created just following the initial user login. The 
  base level API code should raise Exceptions if any real mutator methods accidentally get called 
  (e.g. because of easy-to-miss maintenance oversights)

    python -m jbei.edd.rest.scripts.maintain_ice_links -username mark.forrer \
	   -dry_run -scan_ice_entries -test_edd_url https://edd.jbei.org/ 2>&1 | tee 1-dry-run.txt
	
## Run the script (actual run)
Do a full run of the script, and consider using a combination of grep / summary stastics computed by 
the script to identify logic errors.  Also consider checking for unexpected differences in summary 
results from the dry run mode (which is a bit brittle) Comparisons of this type nearly always turn 
up bugs that would otherwise go undetected.

    python -m jbei.edd.rest.scripts.maintain_ice_links -username mark.forrer -scan_ice_entries \
	   -test_edd_url https://edd.jbei.org/ 2>&1 | tee 2-first-run.txt
	
## Re-Run the script
Do a second full run of the script to make sure all of the changes attempted by the first run 
actually stuck.

    python -m jbei.edd.rest.scripts.maintain_ice_links -username mark.forrer -scan_ice_entries \
	   -test_edd_url https://edd.jbei.org/ 2>&1 | tee 3-second-run.txt
	
### Consider repeating tests on test databases
As used presently at JBEI, the EDD/ICE test database contents have diverged significantly from 
production as a result of testing use.  The differences are a significant advantage in this case, 
since they exercise the script more fully by exhibiting more inconsistencies han the EDD/ICE 
production databases. As a result, they're better stress tests of the script. Dump files are saved 
to Google Drive that capture the state of these databases before the script was run to correct them.
