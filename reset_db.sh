#!/bin/bash
# Removes and re-creates the local edddjango database from the the production (non-django) database

# Terminate early if any subsequent command fails
set -e

# read in command line options
while [ "$#" -gt 0 ]; do
    case "$1" in
        -d) database="$2"; shift 2;;
        --database=*) database="${1#*=}"; shift 1;;
        -f) dumpfile="$2"; shift 2;;
        --file=*) dumpfile="${1#*=}"; shift 1;;
        -u) EDD_USERNAME="$2"; shift 2;;
        --user=*) EDD_USERNAME="${1#*=}"; shift 1;;
        # handle errors
        --database|--file|--user) echo "$1 requires an argument" >&2; exit 1;;
        -*) echo "unknown option $1" >&2; exit 2;;
    esac
done

# Confirm before dropping the local database
echo "This script removes and re-creates the local EDD database (edddjango)"
read -p "Are you sure you want to lose all the data? " CONFIRMATION

while [[ ! $CONFIRMATION =~ ^yes|Yes|YES|no|No|NO$ ]]
do
	echo 'Do you want to drop the local EDD database? ("yes" or "no"): '
	read CONFIRMATION
done

# Exit if user refused to drop database
if [[ $CONFIRMATION =~ ^no|No|NO$ ]]
then
	exit 0
fi

if [ -z "$EDD_USERNAME" ]; then
    read -p "Developer's EDD Username (LDAP): " EDD_USERNAME
fi

# detect presence of the dump file & prompt before overwriting
CREATE_DUMP_FILE=false
if [ -z "${dumpfile}" ]; then
    DUMP_FILE_NAME=edddb.sql
else
    DUMP_FILE_NAME="${dumpfile}"
fi
if [ ! -f "$DUMP_FILE_NAME" ] 
then
	echo "File $DUMP_FILE_NAME wasn't found."
	CREATE_DUMP_FILE=true
else
	MODDATE=$(ls -lT $DUMP_FILE_NAME | perl -pe 's/^.*\s+([a-zA-z]+\s+\d\d\s+\S+.*)$DUMP_FILE_NAME$/$1/g')
	echo "Found existing dump file $DUMP_FILE_NAME."
	read -p "Do you want to use the existing dump file, last modified at $MODDATE (yes/no)? " REPLY
	
	
	if [[ $REPLY =~ ^no|No|NO$ ]]
	then
		CREATE_DUMP_FILE=true
	else
		echo "Using existing dump file."
	fi
fi

# (Re)create the dump file if chosen in logic above
if [ $CREATE_DUMP_FILE == true ]
then
	echo "Creating SQL dump file eddddb.sql... Enter production edduser password below."
	pg_dump -i -h postgres.jbei.org -U edduser -F p -b -v -f "$DUMP_FILE_NAME" edddb
fi

if [ -z "$database" ]; then
    database=edddjango
fi
echo "*************************************************************"
echo "Dropping database $database ..."
echo "*************************************************************"
psql postgres -c "DROP DATABASE IF EXISTS $database"

echo "*************************************************************"
echo "Re-creating database $database ..."
echo "*************************************************************"
psql postgres -c "CREATE DATABASE $database"
psql -d "$database" -c 'CREATE SCHEMA old_edd;'
psql -d "$database" -c 'GRANT ALL ON SCHEMA old_edd TO edduser;'

echo "*************************************************************"
echo "Loading dump file into the database..."
echo "*************************************************************"

cat "$DUMP_FILE_NAME" | \
sed 's#SET search_path = #SET search_path = old_edd, #g' | \
sed 's#public\.#old_edd\.#g' | \
sed 's#Schema: public;#Schema: old_edd;#g' | \
psql "$database"

echo "*************************************************************"
echo "Running Django migrations..."
echo "*************************************************************"
./manage.py migrate

echo "*************************************************************"
echo "Performing conversion..."
echo "*************************************************************"
psql "$database" < convert.sql

echo "*************************************************************"
echo "Running custom migrations..."
echo "*************************************************************"
./manage.py migratefiles
./manage.py edd_index

echo "*************************************************************"
echo "Escalating privileges for EDD user $EDD_USERNAME"
echo "*************************************************************"
psql "$database" -c "update auth_user set is_superuser=true, is_staff=true where username ='$EDD_USERNAME'" 

echo "Done."
