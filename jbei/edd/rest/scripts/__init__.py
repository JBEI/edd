"""
Contains shared scripts for interacting with EDD's REST interface
"""
import os

# set a default value for ICE_SETTINGS_MODULE (provides settings and prevents a django import in
# jbei.rest.clients.ice.api)
os.environ.setdefault('ICE_SETTINGS_MODULE', 'jbei.edd.rest.scripts.settings')