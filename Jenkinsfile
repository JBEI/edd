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
                source bin/init-config \
                    --user 'Jenkins' \
                    --mail '${committer_email}' \
                    --noinput \
                    --nonginx
            /$
            timeout(5) {
                sh(init_script)
            }
        }

        stage('Build') {
            // build edd-node and edd-core images outside docker-compose to use --build-args!
            // tag both with build-specific versions, ensure edd-core builds off correct edd-node
            // NOTE: sudo is required to execute docker commands
            def build_node = $/#!/bin/bash -xe
                export DOCKER_BUILDKIT=1
                sudo -E docker build \
                    --pull \
                    --progress plain \
                    -t jbei/edd-node:${image_version} \
                    .
            /$
            def build_script = $/#!/bin/bash -xe
                export DOCKER_BUILDKIT=1
                sed -e 's/edd-node:latest/edd-node:${image_version}/' < Dockerfile \
                    | sudo -E docker build \
                        -f- \
                        --progress plain \
                        --build-arg 'GIT_URL=${git_url}' \
                        --build-arg 'GIT_BRANCH=${git_branch}' \
                        --build-arg 'EDD_VERSION=${image_version}' \
                        -t jbei/edd-core:${image_version} \
                        .
            /$
            timeout(60) {
                dir("docker/node") {
                    sh(build_node)
                }
                dir("docker/edd/core") {
                    sh(build_script)
                }
            }
        }

        stage('Prepare') {
            // modify configuration files to prepare for launch
            timeout(5) {
                sh("sudo bin/jenkins/prepare.sh '${image_version}'")
            }
        }

        try {

            stage('Launch') {
                timeout(60) {
                    sh("sudo bin/jenkins/launch.sh '${project_name}'")
                }
            }

            stage('Test') {
                // previous stage does not finish until EDD up and reporting healthy
                // only try to test for 30 minutes before bugout
                timeout(30) {
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
                    sh("sudo bin/jenkins/push_internal.sh '${image_version}'")
                }
            }

            // TODO: more stages
            // stage('Publish') {
            // }
            // stage('Deploy') {
            // }

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

            // try to clean up things to not have a zillion leftover docker resources
            stage('Teardown') {
                print test_output
                sh("sudo bin/jenkins/teardown.sh '${project_name}'")
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
