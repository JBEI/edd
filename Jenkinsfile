#!/usr/bin/env groovy

def result = buildRepo([
    "email": ["to": "edd-dev@lbl.gov", "cc": "edd-dev@lbl.gov"],
    "build": [
        // core image
        ["docker": ["repo": "jbei/edd-core"]],
        // typescript build
        ["docker": ["repo": "jbei/edd-node", "target": "typescript"]],
        // documentation
        ["docker": ["repo": "jbei/edd-docs", "target": "docs"]],
    ],
])
// NOTE: single ${VARIABLE} replaced in Groovy; double $${VARIABLE} in Bash.
def testScript = $/#!/bin/bash -e
# loop until finding up container
CONTAINER_ID=""
until [ ! -z "$${CONTAINER_ID}" ]; do
    sleep 1
    CONTAINER_ID="$(docker ps -qf "name=$${ESE_STACK}_http" -f "health=healthy")"
done
docker exec "$${CONTAINER_ID}" run_tests.sh
docker cp "$${CONTAINER_ID}:/code/coverage.json" . || true
/$
def tests = swarmDeploy([
    "deployEnv": ["ESE_BUILD_TAG=${result.buildTag}"],
    "name": "Integration",
    "target": "inttest",
    "teardown": true,
    "test": testScript,
    "test_archive": "coverage.json",
])

// when everything until now worked, and built trunk, deploy to staging
if (currentBuild.currentResult == "SUCCESS") {
    if (result.pushedTags.grep("cr.ese.lbl.gov/jbei/edd-core:trunk")) {
        swarmDeploy([name: "EDD-Test"])
    } else if (result.pushedTags.grep("cr.ese.lbl.gov/jbei/edd-core:dev1")) {
        swarmDeploy([name: "EDD-dev1", target: "dev1"])
    } else if (result.pushedTags.grep("cr.ese.lbl.gov/jbei/edd-core:dev2")) {
        swarmDeploy([name: "EDD-dev2", target: "dev2"])
    }
    // also deploy docs
    if (result.pushedTags.grep("cr.ese.lbl.gov/jbei/edd-docs:trunk")) {
        swarmDeploy([name: "Docs", target: "docs"])
    }
}
