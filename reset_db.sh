#!/bin/bash
# Removes and re-creates the local edddjango database from the the production (non-django) database

# Terminate early if any subsequent command fails
set -e

# define a function to print usage directions
show_usage() {
    echo "Usage: reset_db [options] [help]"
    echo "Example 1: reset_db [prompts will indicate options]"
    echo "Example 2: reset_db -d edddjango -f dump_file.sql -u knight_who_says_ni"
    echo "Example 3: reset_db help"
    echo
    echo "Option details:"
    echo "    -c options, --connect-options=options"
    echo "        Any additional command options to pass to psql for connecting to the target database; defaults to ''"
    echo "        See pg_dump and psql documentation for details, -h -p -U options would go here"
    echo "    -d database, --database=database"
    echo "        The target database name for migration; defaults to 'edddjango'"
    echo "    -f dumpfile, --file=dumpfile"
    echo "        Where output from the source database is to be saved; defaults to 'edddb.sql'"
    echo "    -u username, --user=username"
    echo "        Script can optionally update the target database to elevate the developer user account to admin status"
    echo "    -Q, --quiet"
    echo "        Quiet script, runs without prompts"
}

# read in command line options
while [ "$#" -gt 0 ]; do
    case "$1" in
        -c) connect_opt="$2"; shift 2;;
        --connect-options=*) connect_opt="${1#*=}"; shift 1;;
        -d) database="$2"; shift 2;;
        --database=*) database="${1#*=}"; shift 1;;
        -f) dumpfile="$2"; shift 2;;
        --file=*) dumpfile="${1#*=}"; shift 1;;
        -u) EDD_USERNAME="$2"; shift 2;;
        --user=*) EDD_USERNAME="${1#*=}"; shift 1;;
        -Q|--quiet) QUIET=1; shift 1;;
        # handle errors
        --database|--file|--user|--connect-options) echo "$1 requires an argument" >&2; exit 1;;
        -*) echo "unknown option $1" >&2; show_usage; exit 2;;
    esac
    if [[ $1  =~ ^help|-+h$ ]]
	then
        show_usage
		exit 0
	fi
done

# set default database if not provided on command line
if [ -z "$database" ]; then
    database=edddjango
fi

if [ ! $QUIET ]; then
    # Confirm before dropping the database
    echo
    echo "This script removes and re-creates the EDD database ($database)"
    read -p 'Are you sure you want to lose all the data? ("drop" or "cancel"): ' CONFIRMATION

    while [[ ! $CONFIRMATION =~ ^drop|DROP|Drop|cancel|Cancel|CANCEL$ ]]
    do
    	echo 'Do you want to drop the EDD database? ("drop" or "cancel"): '
    	read CONFIRMATION
    done

    # Exit if user refused to drop database
    if [[ $CONFIRMATION =~ ^cancel|Cancel|CANCEL$ ]]
    then
    	exit 0
    fi

    # prompt user to back up the database
    echo
    echo "Do you want to create a dump of the $database database before it's dropped?"
    echo "This script runs database migrations, which are a frequent source of integration"
    echo "errors during development. Saving your current database may save time by allowing"
    echo "you to restore while integration errors are addressed."
    echo
    while [[ ! $BACKUP_LOCAL_DB =~ ^yes|YES|Yes|no|No|NO$ ]]
    do
    	read -p "Backup the '$database' database (yes/no)? " BACKUP_LOCAL_DB
    done

    if [[ $BACKUP_LOCAL_DB =~ ^yes|YES|Yes ]]
    then
    	LOCAL_BACKUP_DUMP_FILE=".local_"$database"_backup.sql"
    	
    	while [ -f "$LOCAL_BACKUP_DUMP_FILE" ]
    	do
    		while [[ ! $OVERWRITE =~ ^overwrite|OVERWRITE|Overwrite|cancel|Cancel|CANCEL$ ]]
    		do
    			read -p "Local backup file $LOCAL_BACKUP_FILE exists. Overwrite? (overwrite/cancel): " OVERWRITE
    		done
    		
    		if [[ $OVERWRITE =~ ^overwrite|OVERWRITE|Overwrite$ ]]
    		then
    			rm $LOCAL_BACKUP_DUMP_FILE
    		else
    			exit 0
    		fi
    	done
    	pg_dump $connect_opt -F p -b -v -f "$LOCAL_BACKUP_DUMP_FILE" $database
    	echo
    	echo
    	script_name=`basename "$0"`
    	echo "Created backup file $LOCAL_BACKUP_DUMP_FILE"
    	echo "Please copy or rename this file now if it will be reused. Future backups via $script_name will overwrite it without prompting."
    fi

    if [ -z "$EDD_USERNAME" ]; then
        read -p "Developer's EDD Username (LDAP): " EDD_USERNAME
    fi
fi

# detect presence of the dump file & prompt before overwriting
CREATE_DUMP_FILE=false
if [ -z "${dumpfile}" ]; then
    PRODUCTION_DUMP_FILE=edddb.sql
else
    PRODUCTION_DUMP_FILE="${dumpfile}"
fi
if [ ! -f "$PRODUCTION_DUMP_FILE" ] 
then
	echo "File $PRODUCTION_DUMP_FILE wasn't found."
	CREATE_DUMP_FILE=true
else
    if [ ! $QUIET ]; then
    	MODDATE=$(ls -lT $PRODUCTION_DUMP_FILE | perl -pe 's/^.*\s+([a-zA-z]+\s+\d\d\s+\S+.*)$PRODUCTION_DUMP_FILE$/$1/g')
    	echo "Found existing production dump file $PRODUCTION_DUMP_FILE."
    	read -p "Do you want to use the existing dump file, last modified at $MODDATE (yes/no)? " REPLY
    	
    	
    	if [[ $REPLY =~ ^no|No|NO$ ]]
    	then
    		CREATE_DUMP_FILE=true
    	else
    		echo "Using existing dump file."
    	fi
    fi
fi

# (Re)create the dump file if chosen in logic above
if [ $CREATE_DUMP_FILE == true ]
then
	echo "Creating SQL dump file eddddb.sql... Enter production edduser password below."
	pg_dump -h postgres.jbei.org -U edduser -F p -b -v -f "$PRODUCTION_DUMP_FILE" edddb
	echo
	echo
fi

echo
echo "**************************************************************************************************************************"
echo "Dropping database $database ..."
echo "**************************************************************************************************************************"
psql $connect_opt postgres -c "DROP DATABASE IF EXISTS $database"
echo "Database $database has been nuked from orbit."

echo
echo "**************************************************************************************************************************"
echo "Re-creating database $database ..."
echo "**************************************************************************************************************************"
psql $connect_opt postgres -c "CREATE DATABASE $database"
psql $connect_opt -d "$database" -c 'CREATE SCHEMA old_edd;'
psql $connect_opt -d "$database" -c 'GRANT ALL ON SCHEMA old_edd TO edduser;'

echo
echo "**************************************************************************************************************************"
echo "Loading production dump file into the database..."
echo "**************************************************************************************************************************"

# NOTE: the sed commands to replace unicode errors REQUIRE bash to interpret the commands first.
cat "$PRODUCTION_DUMP_FILE" | \
sed 's#SET search_path = #SET search_path = old_edd, #g' | \
sed 's#public\.#old_edd\.#g' | \
sed 's#Schema: public;#Schema: old_edd;#g' | \
sed 's#\\r\\n#\\n#g' | \
sed $'s#\xc3\xa2\xc2\x88\xc2\x86#\xe2\x88\x86#g' | \
sed $'s#\xc3\x82\xc2\xba#\xc2\xba#g' | \
sed $'s#\xc3\x8e\xc2\x94#\xc3\x94#g' | \
sed $'s#\xef\xbf\xbd#\xc2\xb5#g' | \
sed $'s#\xc3\x82\xc2\xb5#\xc2\xb5#g' | \
sed $'s#\xc3\x94#\xce\x94#g' | \
psql $connect_opt "$database"

echo
echo "**************************************************************************************************************************"
echo "Running Django migrations..."
echo "**************************************************************************************************************************"
./manage.py migrate

echo
echo "**************************************************************************************************************************"
echo "Performing conversion..."
echo "**************************************************************************************************************************"
psql $connect_opt "$database" < convert.sql

echo
echo "**************************************************************************************************************************"
echo "Running custom migrations..."
echo "**************************************************************************************************************************"
./manage.py migratefiles
./manage.py edd_index

if [ -z "$EDD_USERNAME" ]; then
    echo
    echo "**************************************************************************************************************************"
    echo "Escalating privileges for EDD user $EDD_USERNAME"
    echo "**************************************************************************************************************************"
    psql $connect_opt "$database" -c "update auth_user set is_superuser=true, is_staff=true where username ='$EDD_USERNAME'" 
fi

echo
echo "Done."
