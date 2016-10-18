#!/bin/bash
###################################################################################################
# reset_docker_databases.sh
###################################################################################################
#
# This script is an unpolished convenience to help in testing maintain_ice_links.py
# It helps to automate the process of setting a up a round of tests by dropping
# and re-creating local EDD / ICE databases from dump files, as well as managing
# the associated EDD Docker containers and ICE instance. At present, it makes
# some assumptions about the local test setup, but should at least be useful as
# a starting point for automating the testing process in other environments.
#
# Before running this script, copy and edit 'reset_docker_databases.conf-example' into the same
# directory, then set values for all of the defined variables.
#
set -e  # fail on the first error.

###################################################################################################
# Read in local configuration from a file called reset_docker_databases.conf
###################################################################################################
CONFIG_FILE="reset_docker_databases.conf"
if [ ! -f $CONFIG_FILE ]; then
	WORK_DIR=$(pwd)
	echo "Required configuration file $CONFIG_FILE wasn't found in source $CONFIG_FILE"
	exit 0
fi
source $CONFIG_FILE

###################################################################################################
# Set default configuration
###################################################################################################
EDD_DIR=${EDD_DIR:-'../../../../'}
ICE_DIR=${ICE_DIR:-'/Users/mark.forrer/code/ice'}
EDD_DB_NAME=${EDD_DB_NAME:-'edd'}
ICE_DB_NAME=${ICE_DB_NAME:-'registrydb'}
EDD_DUMP_FILE=${EDD_DUMP_FILE:-"./edd_dump.sql"}
ICE_DUMP_FILE=${ICE_DUMP_FILE:-"./ice_dump.sql"}
DOCKER_MACHINE=${DOCKER_MACHINE:-"default"}
DOCKER_MACHINE_IP=$(docker-machine ip $DOCKER_MACHINE)
POSTGRES_HOST=${POSTGRES_HOST:-$DOCKER_MACHINE_IP}
SEPARATOR='***********************************************************'


###################################################################################################
# Force user to confirm configuration
###################################################################################################

echo 'This script will dump and reload the local EDD and ICE databases to prepare for testing ' \
	'maintain_ice_links.py. '
echo
echo 'It will also stop and restart EDD Docker containers that depend on the ' \
	'database, and start/wait on a local ICE deployment after the databases have been reloaded. ' \
	'To run the next test, just use ^C to exit this script, then re-run it to reload databases ' \
	'and restart EDD/ICE.'
echo
echo -e 'Configuration:'
echo -e "\tDocker Machine:\t$DOCKER_MACHINE"
echo -e '\tCheckout directories'
echo -e "\t\tEDD:\t$EDD_DIR"
echo -e "\t\tICE:\t$ICE_DIR"
echo -e "\tPostgres"
echo -e "\t\tHost: \t\t$POSTGRES_HOST"
echo -e "\t\tEDD database: \t$EDD_DB_NAME"
echo -e "\t\tICE database: \t$ICE_DB_NAME"
echo -e "\t\tEDD dumpfile: \t$EDD_DUMP_FILE"
echo -e "\t\tICE dumpfile: \t$ICE_DUMP_FILE"

###################################################################################################
# Force user to confirm configuration
###################################################################################################

# prompt user to confirm configuration parameters
while [ -z "$choice" ]; do
	read -p 'Is the above configuration correct? (y/N): ' choice
	choice=`echo $choice | xargs`  # trim whitespace
done
if [ "$choice" != "y" ] && [ "$choice" != "Y" ]; then
	echo 'Cancelled database drop / restore. Please edit $CONFIG_FILE to correct target files/' \
		'databases, then re-run.'
	exit
fi
unset choice
echo

###################################################################################################
# Test for existence of required input files (configuration tested above)
###################################################################################################
# test for existence of dump files
if [ ! -f "$EDD_DUMP_FILE" ]; then
	echo "EDD dump file wasn't found at $EDD_DUMP_FILE"
	exit 0
fi
if [ ! -f "$ICE_DUMP_FILE" ]; then
	echo "EDD dump file wasn't found at $ICE_DUMP_FILE"
	exit 0
fi

# check for ICE config file
ICE_POM_FILE="$ICE_DIR/pom.xml"
if [ ! -f $ICE_POM_FILE ]; then
	echo "ICE POM file wasn't found at $ICE_POM_FILE"
	exit 0
fi



###################################################################################################
# Force user to confirm one last time before dropping data
###################################################################################################
# prompt user to confirm database deletion
while [ -z "$choice" ]; do
	echo 'Do you want to PERMANANTLY REMOVE the EDD/ICE databases?'
	read -p 'This is your LAST CHANCE TO AVOID DATA LOSS (enter "DROP"): ' choice
	choice=`echo $choice | xargs`  # trim whitespace, convert to lower case
done

# exit ear/y if user didn't confirm
if [ "$choice" != "drop" ] && [ "$choice" != "DROP" ]; then
	echo 'Cancelled database dump / restore. Exiting.'
	exit
fi

###################################################################################################
# Stop EDD Docker containers that maintain open DB connections, then drop the EDD database
###################################################################################################
echo
echo "$SEPARATOR"
echo "Stopping database-connected Docker containers..."
echo "$SEPARATOR"
eval "$(docker-machine env $DOCKER_MACHINE)"
# cd seems necessary on quick inspection, but ideally could be avoided with docker-compose options
cd $EDD_DIR  
docker-compose stop appserver
docker-compose stop worker
cd $PWD  # go back to the working directory so subsequent failures will leave us where we started

echo
echo "$SEPARATOR"
echo -e "Dropping / re-creating EDD database \"$EDD_DB_NAME\"..."
echo "$SEPARATOR"
DROP_EDD_CMD="DROP DATABASE IF EXISTS $EDD_DB_NAME;"
psql -h $POSTGRES_HOST postgres postgres -c "$DROP_EDD_CMD"
psql -h $POSTGRES_HOST postgres postgres < "$EDD_DUMP_FILE"

###################################################################################################
# Drop the ICE database. Assumption is that this script was used to run ICE.
###################################################################################################

echo
echo "$SEPARATOR"
echo -e "Dropping / re-creating ICE database \"$ICE_DB_NAME\"..."
echo "$SEPARATOR"
DROP_ICE_CMD="DROP DATABASE IF EXISTS $ICE_DB_NAME;"
psql -h $POSTGRES_HOST postgres postgres -c "$DROP_ICE_CMD"
psql -h $POSTGRES_HOST postgres postgres < "$ICE_DUMP_FILE"

###################################################################################################
# Stop / restart all EDD Docker containers (otherwise nginx gets confused)
###################################################################################################
echo
echo "$SEPARATOR"
echo "Stopping / restarting EDD Docker containers...."
echo "(nginx gets confused otherwise)"
echo "$SEPARATOR"
echo
docker-compose down
docker-compose up -d

###################################################################################################
# Start ICE / wait for it to finish
###################################################################################################
echo
echo "$SEPARATOR"
echo "Starting ICE..."
echo "$SEPARATOR"
echo "Script execution will wait on ICE. Use ^C to kill this script and its ICE run"

# TODO: initial attempt to implement not changing directories to run ICE failed. Possible
# this can be fixed with more time / effort, but punting for now. Attempt to run from outside
# of the ICE install directory resulted in: java.io.FileNotFoundException: /Users/mark.forrer/Documents/code/edd/.keystore (No such file or directory)
#mvn -f $ICE_POM_FILE jetty:run 

# go to the ICE dir and start ICE in the background
cd $ICE_DIR
mvn jetty:run &
ICE_PID=$! # capture the ICE process's PID
cd $PWD # go back to the directory this script was run from so it can run mulitple times

# kill ICE when this script terminates
trap "kill $ICE_PID" SIGHUP SIGINT SIGTERM

# wait forever until ICE terminates
wait
