#!/usr/bin/env groovy

// Multiline strings are using Dollar slashy strings: this is the actual technical term! These
// strings start with $/ (dollar slashy) and end with /$. We do not need to escape anything,
// except literal $ dollar signs, or dollar slashy opening or closing sequences: $$, $$$/, and
// $/$$ respectively. See: http://groovy-lang.org/syntax.html#_dollar_slashy_string

// set some cleanup in properties, so old builds do not stick around forever
def projectProperties = [
    [
        $class: 'BuildDiscarderProperty',
        strategy: [
            $class: 'LogRotator',
            numToKeepStr: '5'
        ]
    ]
]

// set the properties
properties(projectProperties)

try {

    // Store results from `checkout scm` because ${env.GIT_URL}, etc are not available
    def git_url = ""
    def git_branch = ""
    def image_version = ""
    def project_name = ""

    node('docker') {

        stage('Clean') {
            // Probably not necessary, as each build should launch a new container
            // Yet, it does not hurt to be careful
            deleteDir()
            // confirm that the directory is empty
            sh 'ls -halt'
        }

        stage('Checkout') {
            // does a clone/checkout based on Jenkins project config
            def checkout_result = checkout scm
            print checkout_result
            git_url = checkout_result["GIT_URL"]
            git_branch = checkout_result["GIT_BRANCH"]
            image_version = "${git_branch}-${BUILD_NUMBER}".replaceAll("\\W", "")
            project_name = "jpipe_${git_branch}_${BUILD_NUMBER}".replaceAll("\\W", "")
        }

        stage('Init') {
            // run initialization script, as described in EDD project README
            def init_script = $/#!/bin/bash -xe
                cd docker_services
                source init-config \
                    --user 'Jenkins' \
                    --mail 'wcmorrell@lbl.gov' \
                    --noinput \
                    --nonginx \
                    --novenv
            /$
            sh init_script
        }

        stage('Build') {
            // build edd-node and edd-core images outside docker-compose to use --build-args!
            // tag both with build-specific versions, ensure edd-core builds off correct edd-node
            // NOTE: sudo is required to execute docker commands
            def build_script = $/#!/bin/bash -xe
                cd docker_services/node
                sudo docker build \
                    -t jbei/edd-node:${image_version} .
                cd ../edd
                sed -i.bak \
                    -e "s/edd-node:latest/edd-node:${image_version}/" \
                    Dockerfile
                rm Dockerfile.bak
                sudo docker build \
                    --build-arg 'GIT_URL=${git_url}' \
                    --build-arg 'GIT_BRANCH=${git_branch}' \
                    --build-arg 'EDD_VERSION=2.1.0b${BUILD_NUMBER}' \
                    -t jbei/edd-core:${image_version} .
            /$
            sh build_script
        }

        try {

            stage('Launch') {
                def launch_script = $/#!/bin/bash -xe
                    cd docker_services
                    # rewrite docker-compose.override.yml
                    sed -i.bak \
                        -e "s/#image: tagname/image: jbei\/edd-core:${image_version}/" \
                        docker-compose.override.yml
                    rm docker-compose.override.yml.bak
                    sudo docker-compose -p '${project_name}' up -d
                /$
                def health_script = $/#!/bin/bash -xe
                    cd docker_services
                    CONTAINER="$$(sudo docker-compose -p '${project_name}' ps -q edd | head -1)"
                    until [ "$$(sudo docker inspect --format "{{json .State.Health.Status }}" $$CONTAINER)" = '"healthy"' ]; do
                        echo "Waiting for EDD to report healthy"
                        sleep 10
                    done
                /$
                // Launch containers
                sh launch_script
                // only try to check for 10 minutes before bugout
                timeout(10) {
                    sh health_script
                }
            }

            stage('Test') {
                // previous stage does not finish until EDD up and reporting healthy
                // NOTE: using -T flag to docker-compose per https://github.com/docker/compose/issues/3352
                def test_script = $/#!/bin/bash -xe
                    cd docker_services
                    sudo docker-compose -p '${project_name}' \
                        exec -T edd \
                        python manage.py test --exclude-tag=known-broken
                /$
                sh test_script
            }

            // TODO: more stages
            // stage('Publish') {
            // }
            // stage('Deploy') {
            // }

        } catch (exc) {
            throw exc
        } finally {

            // try to clean up things to not have a zillion leftover docker resources
            stage('Teardown') {
                def teardown_script = $/#!/bin/bash -xe
                    cd docker_services
                    sudo docker-compose -p '${project_name}' down
                    sudo docker ps -qf 'name=${project_name}_*' | xargs \
                        sudo docker rm || true
                    sudo docker network ls -qf 'name=${project_name}_*' | xargs \
                        sudo docker network rm || true
                    sudo docker volume ls -qf 'name=${project_name}_*' | xargs \
                        sudo docker volume rm || true
                /$
                sh teardown_script
            }

        }

    }
} catch (exc) {
    echo "Caught ${exc}"
    String addressee = 'wcmorrell@lbl.gov'
    // String addressee = 'jbei-edd-admin@lists.lbl.gov'

    mail subject: "${env.JOB_NAME} Build #${env.BUILD_NUMBER} Failed",
            body: "Jenkins build at ${env.BUILD_URL} has failed! The problem is: ${exc}",
              to: addressee,
         replyTo: addressee,
            from: 'jbei-edd-admin@lists.lbl.gov'
}
