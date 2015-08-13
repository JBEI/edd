#!/bin/bash
# This script, copied verbatim from http://serverfault.com/questions/182347/add-daemon-account-on-os-x,
# creates a new system user account and identically-named group for OSX. Login isn't permitted for the created
# user, who likewise isn't listed in OSX's System Preferences -> Users & Groups GUI.
# Note that this version does NOT check for existence of the account or group before creating them.
# A newer version is available at the above link, but hasn't been tested at JBEI.
#
# To get information
# about the created account, consider using:
# >> finger username
# OR
# >> id username
#
#
# This script, and all derived scripts, are subject to the Creative Commons License, 
# v 3.0 (http://creativecommons.org/licenses/by-sa/3.0/legalcode).
#
# Authors/commontators on the script and related discussion are:
#  Par (http://serverfault.com/users/65947/par), 
#  Tim Yates (http://serverfault.com/users/34758/tim-yates), 
#  Sven (http://serverfault.com/users/8897/sven), 
#  Johnie Odom (http://serverfault.com/users/21453/johnnie-odom).
# 
# This version has been minimally tested, (though not modified) at JBEI on Yosemite (10.10.4).

if (( $(id -u) )) ; then
    echo "This script needs to run as root"
    exit 1
fi

if [[ -z "$1" ]] ; then
    echo "Usage: $(basename $0) [username] [realname (optional)]"
    exit 1
fi

username=$1
realname="${2:-$username}"

echo "Adding daemon user $username with real name \"$realname\""

for (( uid = 500;; --uid )) ; do
    if ! id -u $uid &>/dev/null; then
        if ! dscl /Local/Default -ls Groups gid | grep -q [^0-9]$uid\$ ; then
          dscl /Local/Default -create Groups/_$username
          dscl /Local/Default -create Groups/_$username Password \*
          dscl /Local/Default -create Groups/_$username PrimaryGroupID $uid
          dscl /Local/Default -create Groups/_$username RealName "$realname"
          dscl /Local/Default -create Groups/_$username RecordName _$username $username

          dscl /Local/Default -create Users/_$username
          dscl /Local/Default -create Users/_$username NFSHomeDirectory /var/empty
          dscl /Local/Default -create Users/_$username Password \*
          dscl /Local/Default -create Users/_$username PrimaryGroupID $uid
          dscl /Local/Default -create Users/_$username RealName "$realname"
          dscl /Local/Default -create Users/_$username RecordName _$username $username
          dscl /Local/Default -create Users/_$username UniqueID $uid
          dscl /Local/Default -create Users/_$username UserShell /usr/bin/false

          dscl /Local/Default -delete /Users/_$username AuthenticationAuthority
          dscl /Local/Default -delete /Users/_$username PasswordPolicyOptions
          break
        fi
    fi
done

echo -e "Created system user $username (uid/gid $uid):\n"

dscl /Local/Default -read Users/_$username

echo -e "\nYou can undo the creation of this user by issuing the following commands:\n"
echo "sudo dscl /Local/Default -delete Users/_$username"
echo "sudo dscl /Local/Default -delete Groups/_$username"
