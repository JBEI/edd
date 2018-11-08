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

// set a default value for emailing success/fail
def committer_email = "wcmorrell@lbl.gov"
def test_output = "Tests did not execute."
def commit_hash = "_"

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
            commit_hash = checkout_result["GIT_COMMIT"]
            image_version = "${git_branch}-${BUILD_NUMBER}".replaceAll("\\W", "")
            project_name = "jpipe_${git_branch}_${BUILD_NUMBER}".replaceAll("\\W", "")
            committer_email = sh(
                script: 'git --no-pager show -s --format=\'%ae\'',
                returnStdout: true
            ).trim()
        }

        stage('Init') {
            // run initialization script, as described in EDD project README
            def init_script = $/#!/bin/bash -xe
                source init-config \
                    --user 'Jenkins' \
                    --mail 'wcmorrell@lbl.gov' \
                    --noinput \
                    --nonginx \
                    --novenv
            /$
            dir("docker_services") {
                sh init_script
            }
        }

        stage('Build') {
            // build edd-node and edd-core images outside docker-compose to use --build-args!
            // tag both with build-specific versions, ensure edd-core builds off correct edd-node
            // NOTE: sudo is required to execute docker commands
            def build_script = $/#!/bin/bash -xe
                sudo docker build \
                    --build-arg 'GIT_URL=${git_url}' \
                    --build-arg 'GIT_BRANCH=${git_branch}' \
                    --build-arg 'EDD_VERSION=${image_version}' \
                    -t jbei/edd-core:${image_version} .
            /$
            dir("docker_services/node") {
                sh("sudo docker build --pull -t jbei/edd-node:${image_version} .")
            }
            dir("docker_services/edd/core") {
                sh("sed -i.bak -e 's/edd-node:latest/edd-node:${image_version}/' Dockerfile")
                sh("rm Dockerfile.bak")
                sh(build_script)
            }
        }

        stage('Prepare') {
            // modify configuration files to prepare for launch
            def prepare_script = $/#!/bin/bash -xe
                # generate HMAC secret
                RANDOM_HMAC="$$(openssl rand -base64 64 | tr -d '\n')"
                echo "$$RANDOM_HMAC" > hmac.key
                # rewrite docker-compose.override.yml with built image version
                sed -i.bak \
                    -e "s/#image: tagname/image: jbei\/edd-core:${image_version}/" \
                    docker-compose.override.yml
                rm docker-compose.override.yml.bak

                # rewrite secrets.env with HMAC secret
                sed -i.bak -e "s:ICE_HMAC_KEY=:ICE_HMAC_KEY=$$RANDOM_HMAC:" secrets.env
                rm secrets.env.bak
                cat secrets.env

                # check configs and write out a combined config file
                sudo docker-compose -p '${project_name}' \
                    -f docker-compose.yml \
                    -f docker-compose.override.yml \
                    -f ice.yml \
                    config > combined.yml
                cat combined.yml
            /$
            dir("docker_services") {
                sh prepare_script
            }

            // pre-build other images that are not pulled from Docker Hub, to avoid launch timeout
            def prepare_images_script = $/#!/bin/bash -xe
                sudo docker-compose -p '${project_name}' -f combined.yml build --pull postgres
                sudo docker-compose -p '${project_name}' -f combined.yml build --pull rabbitmq
                sudo docker-compose -p '${project_name}' -f combined.yml build --pull redis
                sudo docker-compose -p '${project_name}' -f combined.yml build --pull solr
                sudo docker-compose -p '${project_name}' -f combined.yml build --pull flower
            /$
            dir("docker_services") {
                sh prepare_images_script
            }
        }

        try {

            stage('Launch') {
                // Services here are very sensitive to available memory and disk I/O latency
                // Launch separately to avoid resource contention during startup
                def prelaunch_script = $/#!/bin/bash -xe
                    function launch_service() {
                        # $1 = service name
                        sudo docker-compose -p '${project_name}' -f combined.yml up -d $${1}
                        CONTAINER="$$(sudo docker-compose  -p '${project_name}' ps -q $${1} | head -1)"
                        until [ "$$(sudo docker inspect --format '{{json .State.Health.Status}}' $${CONTAINER})" = '"healthy"' ]; do
                            echo "Waiting for $${1} to report healthy"
                            sleep 15
                        done
                    }

                    launch_service postgres
                    launch_service rabbitmq
                    launch_service redis
                    launch_service solr
                /$
                def sql_script = $/UPDATE configuration
                    SET value = '/usr/local/tomcat/'
                    WHERE key = 'DATA_DIRECTORY';/$
                // NOTE: using -T flag to docker-compose-exec per:
                //  https://github.com/docker/compose/issues/3352
                def launch_script = $/#!/bin/bash -xe
                    # launch
                    sudo docker-compose -p '${project_name}' -f combined.yml up -d

                    # inject the HMAC key to ICE
                    RANDOM_HMAC="$$(cat hmac.key)"
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        exec -T ice \
                        bash -c "mkdir -p rest-auth; echo $$RANDOM_HMAC > rest-auth/edd"

                    # wait until everything reports healthy
                    CONTAINER="$$(sudo docker-compose -p '${project_name}' ps -q edd | head -1)"
                    until [ "$$(sudo docker inspect --format "{{json .State.Health.Status }}" $$CONTAINER)" = '"healthy"' ]; do
                        echo "Waiting for EDD to report healthy"
                        sleep 10
                    done

                    # correct the default DATA_DIRECTORY in ICE database
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        exec -T ice_db \
                        psql -U iceuser \
                        -c "${sql_script}" ice

                    # restart ICE so config change sticks
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        restart ice
                /$
                timeout(15) {
                    dir("docker_services") {
                        sh prelaunch_script
                    }
                }
                // only try to launch for X minutes before bugout
                timeout(60) {
                    dir("docker_services") {
                        sh launch_script
                    }
                }
            }

            stage('Test') {
                // previous stage does not finish until EDD up and reporting healthy
                // NOTE: using -T flag to docker-compose exec per
                //   https://github.com/docker/compose/issues/3352
                // NOTE: Jenkins sh command will throw exception on non-zero exit!
                //   Capture output to file and use returnStatus to test for pass/fail
                def test_script = $/#!/bin/bash -xe
                    # instruct script to save all output to test.log
                    exec &> >(tee -a "test.log")
                    # run tests
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        exec -T edd \
                        python manage.py test --exclude-tag=known-broken
                /$
                def save_logs_script = $/#!/bin/bash -xe
                    # instruct script to save all output to container.log
                    exec &> >(tee -a "container.log")
                    echo "EDD logs"
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        exec -T edd \
                        cat log/edd.log
                    echo "ICE logs"
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        exec -T ice \
                        find ./logs -type f -print -exec cat \{\} \;
                /$
                // only try to test for 30 minutes before bugout
                timeout(30) {
                    dir("docker_services") {
                        def test_result = sh(script: test_script, returnStatus: true)
                        test_output = readFile("test.log").trim()
                        if (test_result) {
                            // mark build failed
                            currentBuild.result = 'FAILURE'
                            // save away some log files to help diagnose why failed
                            sh(script: save_logs_script, returnStatus: true)
                            archiveArtifacts artifacts: 'container.log'
                            // send mail in Notify step
                        }
                    }
                }
            }

            // TODO: more stages
            // stage('Publish') {
            // }
            // stage('Deploy') {
            // }

            stage('Notify') {
                def status = "Success"
                if (currentBuild.currentResult == 'FAILURE') {
                    status = "Failed"
                }
                def mail_body = $/Completed build of ${commit_hash} in ${currentBuild.durationString}.

                See build information at <${env.BUILD_URL}>.

                Output from running tests is:
                ${test_output}
                /$
                mail subject: "${env.JOB_NAME} Build #${env.BUILD_NUMBER} ${status}",
                        body: mail_body,
                          to: committer_email,
                     replyTo: committer_email,
                        from: "jbei-edd-admin@lists.lbl.gov"
            }

        } catch (exc) {
            throw exc
        } finally {

            // try to clean up things to not have a zillion leftover docker resources
            stage('Teardown') {
                def teardown_script = $/#!/bin/bash -xe
                    sudo docker-compose -p '${project_name}' -f combined.yml \
                        down
                    sudo docker ps -qf 'name=${project_name}_*' | xargs \
                        sudo docker rm || true
                    sudo docker network ls -qf 'name=${project_name}_*' | xargs \
                        sudo docker network rm || true
                    sudo docker volume ls -qf 'name=${project_name}_*' | xargs \
                        sudo docker volume rm || true
                /$
                print test_output
                dir("docker_services") {
                    sh teardown_script
                }
            }

        }

    }
} catch (exc) {
    echo "Caught ${exc}"
    print test_output

    def mail_body = $/Jenkins build at ${env.BUILD_URL} has failed with commit ${commit_hash}!

    The problem is: ${exc}
    /$

    mail subject: "${env.JOB_NAME} Build #${env.BUILD_NUMBER} Aborted",
            body: mail_body,
              to: committer_email,
         replyTo: committer_email,
            from: 'jbei-edd-admin@lists.lbl.gov'
}
