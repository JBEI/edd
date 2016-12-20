#!/usr/bin/env bash

# This script will take the contents of ./.gitconfig and include it in the local repo config.

git config --local include.path '../.gitconfig'
