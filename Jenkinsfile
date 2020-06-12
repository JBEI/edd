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
def stage_name = "_"
// Store results from `checkout scm` because ${env.GIT_URL}, etc are not available
def git_branch = ""
def image_version = ""
def project_name = ""

// set the properties
properties(projectProperties)

try {

    node('docker') {

        stage('Init') {
            stage_name = "Init"
            // Probably not necessary, as each build should launch a new container
            // Yet, it does not hurt to be careful
            deleteDir()
            // confirm that the directory is empty
            sh 'ls -halt'

            // does a clone/checkout based on Jenkins project config
            def checkout_result = checkout scm
            print checkout_result
            git_branch = checkout_result["GIT_BRANCH"]
            commit_hash = checkout_result["GIT_COMMIT"]
            // normalize image_version and project_name
            // remove all non-word characters
            // convert to all lowercase
            image_version = "${git_branch}_${BUILD_NUMBER}"
            image_version = image_version.replaceAll("\\W", "")
            image_version = image_version.toLowerCase()
            project_name = "jpipe_${git_branch}_${BUILD_NUMBER}"
            project_name = project_name.replaceAll("\\W", "")
            project_name = project_name.toLowerCase()
            committer_email = sh(
                script: 'git --no-pager show -s --format=\'%ae\'',
                returnStdout: true
            ).trim()

            // run initialization script, as described in EDD project README
            def create_config = $/#!/bin/bash -xe
                export DOCKER_BUILDKIT=1
                sudo -E docker build -t jbei/edd-config:${image_version} .
            /$
            // cannot use volume mount tricks in this build
            // the local paths are within the agent container
            // NOT in the Docker host
            def init_script = $/#!/bin/bash -xe
                export EDD_USER="Jenkins"
                export EDD_EMAIL="${committer_email}"
                export EDD_VERSION="${image_version}"
                mkdir -p log
                sudo -E bash -x bin/init-config offline --deploy=dev
                sudo -E chown -R jenkins:jenkins .
                ls -halt
                cat log/config.log
                cat docker-compose.override.yml
            /$
            timeout(5) {
                dir("docker/edd/config") {
                    sh(create_config)
                }
                sh(init_script)
            }
        }

        stage('Build') {
            stage_name = "Build"
            // build edd-node and edd-core images outside docker-compose to use --build-args!
            // tag both with build-specific versions
            // ensure edd-core builds off correct edd-node
            // NOTE: sudo is required to execute docker commands
            timeout(15) {
                sh("sudo bin/jenkins/build_node.sh '${image_version}'")
                sh("sudo bin/jenkins/build_core.sh '${image_version}'")
            }
        }

        try {

            stage('Launch') {
                stage_name = "Launch"
                // modify configuration files to prepare for launch
                timeout(15) {
                    sh("sudo bin/jenkins/launch.sh '${image_version}' '${project_name}'")
                }
            }

            stage('Test') {
                stage_name = "Test"
                // previous stage does not finish until EDD up and reporting healthy
                // only try to test for 15 minutes before bugout
                timeout(15) {
                    def test_result = sh(
                        script: "sudo bin/jenkins/run_tests.sh '${project_name}'",
                        returnStatus: true
                    )
                    test_output = readFile("test.log").trim()
                    archiveArtifacts artifacts: 'test.log'
                    if (test_result) {
                        // mark build failed
                        currentBuild.result = 'FAILURE'
                        // save away some log files to help diagnose why failed
                        sh(
                            script: "sudo bin/jenkins/save_logs.sh '${project_name}'",
                            returnStatus: true
                        )
                        archiveArtifacts artifacts: 'container.log'
                        // send mail in Notify step
                    }
                }
            }

            stage('Publish Internal') {
                stage_name = "Publish Internal"
                timeout(5) {
                    withCredentials([
                        usernamePassword(
                            credentialsId: '2e7b1979-8dc7-4201-b230-a12658305f67',
                            passwordVariable: 'PASSWORD',
                            usernameVariable: 'USERNAME'
                        )
                    ]) {
                        sh("sudo docker login -u $USERNAME -p $PASSWORD jenkins.jbei.org:5000")
                    }
                    sh("sudo bin/jenkins/push_internal.sh '${image_version}' '${git_branch}'")
                }
            }

        } catch (exc) {
            currentBuild.result = "FAILURE"
            // save away some log files to help diagnose why failed
            sh(
                script: "sudo bin/jenkins/save_logs.sh '${project_name}'",
                returnStatus: true
            )
            archiveArtifacts artifacts: 'container.log'
            throw exc
        } finally {

            stage('Teardown') {
                stage_name = "Teardown"
                // try to clean up things to not have a zillion leftover docker resources
                sh("sudo bin/jenkins/teardown.sh '${project_name}'")
            }

        }

    }
} catch (exc) {
    echo "Caught ${exc}"
    currentBuild.result = "FAILURE"
    test_output += "\n${exc}"
}

def status = currentBuild.currentResult
def duration = currentBuild.durationString
def mail_body = $/Build of ${commit_hash}: ${status} in ${stage_name} after ${duration}.

See build information at <${env.BUILD_URL}>.

Output from running tests is:
${test_output}
/$
mail subject: "${env.JOB_NAME} Build #${env.BUILD_NUMBER} ${status}",
        body: mail_body,
          to: committer_email,
     replyTo: committer_email,
        from: "jbei-edd-admin@lists.lbl.gov"

if (status == "SUCCESS" && git_branch == "master") {
    def update_test_server = $/#!/bin/bash -xe
        export EDD_IMAGE="jenkins.jbei.org:5000/jbei/edd-core:master"
        sudo docker pull '${EDD_IMAGE}'
        sudo docker service update --with-registry-auth --image '${EDD_IMAGE}' edd-test_http
        sudo docker service update --with-registry-auth --image '${EDD_IMAGE}' edd-test_worker
        sudo docker service update --with-registry-auth --image '${EDD_IMAGE}' edd-test_websocket
    /$
    node("edd-test-swarm") {
        stage('Deploy Test') {
            try {
                withCredentials([
                    usernamePassword(
                        credentialsId: '2e7b1979-8dc7-4201-b230-a12658305f67',
                        passwordVariable: 'PASSWORD',
                        usernameVariable: 'USERNAME'
                    )
                ]) {
                    sh("sudo docker login -u $USERNAME -p $PASSWORD jenkins.jbei.org:5000")
                }
                sh(update_test_server)
            } catch (exc) {
                echo "Caught ${exc}"
            }
        }
    }
}
