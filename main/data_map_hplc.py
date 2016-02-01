#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#    This is for parsing the output of HPLC machines.
##
import sys, os
import logging


logger = logging.getLogger(__name__)

# parse_hplc_file(input_file_path)


# TODO: collect the needed Django interfacing objects
# TODO: write proper protective logic
# TODO: make sure process executes in a trasaction!

# TODO: get user, get study, ?

def map_hplc_samples(samples, User, Study):
    """Maps HPLC data from a data structure {name:{fields:[values]}} to the
    database, injecting the new information."""

    # def _process_hplc_samples(samples):

    # print 'yo'

    # Get the user identity
    logging.debug('getting user')



    if not User:
        raise Exception("An EDD username is required to run map_hplc_samples()")

    if not Study:
        raise Exception("An EDD study is required to run map_hplc_samples()")

if __name__ == "__main__":

    from data_parser_hplc import parse_hplc_file

    if len(sys.argv) is not 2:
        print("usage: python data_map_hplc input_file_path")
        exit(1)

    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

    logging.basicConfig(
        filename='data_map_hplc.log',
        level=logging.DEBUG,
        format=log_format)

    # echo all debug statements to stdout
    formatter = logging.Formatter( log_format )
    sh = logging.StreamHandler(sys.stdout)
    sh.setLevel(logging.DEBUG)
    sh.setFormatter(formatter)
    logger.addHandler(sh)

    # parse the provided filepath
    # input_file_path = sys.argv[1]
    # samples = parse_hplc_file(input_file_path)

    from django.contrib.auth import get_user_model
    User = get_user_model()
    Study = Study.objects.get(name=study_name)


    logger.debug("parse function returned, values stored in dict 'samples'")

    # activate interactive debugger with our information inside
    # import IPython
    # IPython.embed(banner1="\n\nparse function returned, values stored in dict 'samples'")

