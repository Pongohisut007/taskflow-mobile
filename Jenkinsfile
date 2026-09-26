// Lab 10 capstone: the taskflow-api pipeline, composed from Labs 03-09.
//
//   Secrets -> Install -> [Lint | Unit Test | SAST | Semgrep | SCA | IaC checks]  (parallel, fail fast)
//   -> SBOM & Sign -> Policy Gate -> SonarQube -> Quality Gate -> E2E
//   -> Build Image -> Container Scan -> Terraform Plan
//   -> (main only) Approval -> Terraform Apply -> Configure with Ansible
//   -> Pipeline Health Gate -> Deploy — Production (blue/green + automatic rollback)
//
// Every stage runs in one ephemeral Kubernetes pod (k8s/ci/api-build-pod.yaml) on
// the Lab 09 "kind" cloud; there are no static agents. Every secret is bound with
// withCredentials / credentials() or comes from a Kubernetes Secret.
pipeline {
  agent {
    kubernetes {
      yamlFile 'k8s/ci/api-build-pod.yaml'
      defaultContainer 'node'
    }
  }

  environment {
    // Deploy/Ansible pull from the name the kind nodes know (containerd mirror);
    // the pod pushes and scans through the registry container's own name.
    IMAGE_REPO = 'localhost:5001/taskflow-api'
    PUSH_REPO  = 'kind-registry:5000/taskflow-api'
    TOOLS_DIR  = "${env.WORKSPACE}/.tools"
    PROMETHEUS_URL = 'http://prometheus:9090'
    // Lab 10 Pipeline Health Gate: minimum success rate over the last 20 builds.
    HEALTH_MIN_SUCCESS_RATE = '0.90'
    CI = 'true'
  }

  options {
    // Keep exactly 20 builds: the Prometheus plugin counts retained builds, so its
    // success/total counters become "the last 20 builds" for the health gate.
    buildDiscarder(logRotator(numToKeepStr: '20'))
    // Includes up to 15 minutes waiting for Terraform approval on main.
    timeout(time: 60, unit: 'MINUTES')
  }

  stages {
    stage('Secrets') {
      steps {
        container('gitleaks') {
          // Exits 1 when leaks are found; the SARIF report is written first.
          sh '''
            git config --global --add safe.directory "$WORKSPACE"
            gitleaks git . --redact --verbose --report-format sarif --report-path gitleaks.sarif
          '''
        }
      }
      post {
        always { archiveArtifacts artifacts: 'gitleaks.sarif', allowEmptyArchive: true }
      }
    }

    stage('Install') {
      steps {
        dir('backend') {
          sh 'npm ci --prefer-offline --fetch-retries=5 --fetch-timeout=120000'
        }
      }
    }

    // Independent checks run side by side; the first failure stops the rest.
    stage('Lint, Test & Scan') {
      failFast true
      parallel {
        stage('Lint') {
          steps {
            dir('backend') { sh 'npx eslint "{src,test}/**/*.ts"' }
          }
        }

        stage('Unit Test') {
          steps {
            dir('backend') {
              // Jest defaults to one worker per host CPU; 2 is plenty inside a shared pod.
              sh 'npx jest --ci --coverage --maxWorkers=2 --reporters=default --reporters=jest-junit'
            }
          }
          post {
            always {
              junit 'backend/reports/junit.xml'
              recordCoverage(tools: [[parser: 'COBERTURA', pattern: 'backend/coverage/cobertura-coverage.xml']])
            }
          }
        }

        stage('SAST') {
          steps {
            dir('backend') {
              // eslint-plugin-security findings are warnings: reported, not a gate.
              sh 'npx eslint -c eslint.security.config.mjs src/ -f @microsoft/eslint-formatter-sarif -o eslint.sarif'
            }
          }
          post {
            always { archiveArtifacts artifacts: 'backend/eslint.sarif', allowEmptyArchive: true }
          }
        }

        stage('Semgrep') {
          environment { SEMGREP_SEND_METRICS = 'off' }
          steps {
            container('semgrep') {
              sh 'semgrep scan --config=p/owasp-top-ten --config=p/nodejs --sarif --output semgrep.sarif backend/src'
            }
          }
          post {
            always { archiveArtifacts artifacts: 'semgrep.sarif', allowEmptyArchive: true }
          }
        }

        stage('SCA') {
          steps {
            dir('backend') {
              // npm audit exits non-zero on findings; the gate below decides.
              sh 'npm audit --audit-level=high --json > npm-audit.json || true'
              script {
                def report = readJSON file: 'npm-audit.json'
                if (report.error) {
                  error "npm audit could not run: ${report.error.summary ?: report.error}"
                }
                def v = report.metadata.vulnerabilities
                echo "npm audit: critical=${v.critical}, high=${v.high}, moderate=${v.moderate}, low=${v.low}"
                if (v.critical > 0) {
                  error "SCA gate FAILED: ${v.critical} critical vulnerabilities"
                } else if (v.high > 0) {
                  unstable "SCA WARNING: ${v.high} high vulnerabilities (no critical)"
                }
              }
            }
          }
          post {
            always { archiveArtifacts artifacts: 'backend/npm-audit.json', allowEmptyArchive: true }
          }
        }

        stage('Terraform Validate') {
          environment {
            TF_IN_AUTOMATION   = '1'
            CHECKPOINT_DISABLE = '1'
            // Own data dir so it never picks up the S3 backend from Terraform Plan.
            TF_DATA_DIR        = '.terraform-validate'
          }
          steps {
            container('terraform') {
              dir('infra/terraform') {
                sh 'terraform init -backend=false'
                sh 'terraform validate'
                sh 'terraform fmt -check -recursive'
              }
            }
          }
        }

        stage('Ansible Lint') {
          steps {
            container('python') {
              sh '''
                python -m venv /tmp/ansible-lint
                /tmp/ansible-lint/bin/pip install -q --retries 10 --timeout 60 "ansible-lint==26.9.0"
                HOME=/tmp /tmp/ansible-lint/bin/ansible-lint infra/ansible/playbook.yml
              '''
            }
          }
        }

        stage('tfsec') {
          steps {
            container('tfsec') {
              sh 'tfsec infra/terraform --no-color --format sarif --out tfsec.sarif --soft-fail'
              sh 'tfsec infra/terraform --no-color'
            }
          }
          post {
            always { archiveArtifacts artifacts: 'tfsec.sarif', allowEmptyArchive: true }
          }
        }

        stage('checkov') {
          steps {
            container('checkov') {
              sh '''
                HOME=/tmp checkov -d infra/terraform --framework terraform --skip-download --compact \
                  -o cli -o sarif --output-file-path console,checkov.sarif
              '''
            }
          }
          post {
            always { archiveArtifacts artifacts: 'checkov.sarif', allowEmptyArchive: true }
          }
        }
      }
    }

    stage('SBOM & Sign') {
      environment {
        SYFT_VERSION   = '1.18.1'
        COSIGN_VERSION = '2.4.1'
      }
      steps {
        sh '''
          mkdir -p "$TOOLS_DIR"
          wget -q -O- "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_amd64.tar.gz" \
            | tar -xz -C "$TOOLS_DIR" syft
          wget -q -O "$TOOLS_DIR/cosign" "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
          chmod +x "$TOOLS_DIR/cosign"
          "$TOOLS_DIR/syft" scan dir:backend --source-name taskflow-api --source-version "$GIT_COMMIT" \
            -o cyclonedx-json=sbom.cdx.json
        '''
        withCredentials([
          file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY'),
          string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
        ]) {
          // Local keypair for the lab: keep the signature out of the public Rekor log.
          sh '"$TOOLS_DIR/cosign" sign-blob --yes --key "$COSIGN_KEY" --tlog-upload=false --output-signature sbom.cdx.json.sig sbom.cdx.json'
        }
        sh '"$TOOLS_DIR/cosign" verify-blob --key keys/cosign.pub --signature sbom.cdx.json.sig --insecure-ignore-tlog=true sbom.cdx.json'
      }
      post {
        always { archiveArtifacts artifacts: 'sbom.cdx.json, sbom.cdx.json.sig', allowEmptyArchive: true }
      }
    }

    stage('Policy Gate') {
      environment { OPA_VERSION = '1.0.0' }
      steps {
        sh '''
          wget -q -O "$TOOLS_DIR/opa" "https://github.com/open-policy-agent/opa/releases/download/v${OPA_VERSION}/opa_linux_amd64_static"
          chmod +x "$TOOLS_DIR/opa"
          "$TOOLS_DIR/opa" check policy/security.rego
          set +e
          # --fail-defined exits 1 when any deny rule matches the npm audit report.
          "$TOOLS_DIR/opa" eval --data policy/security.rego --input backend/npm-audit.json \
            --format pretty --fail-defined 'data.taskflow.security.deny[msg]' > policy-result.txt
          rc=$?
          cat policy-result.txt
          [ "$rc" -eq 0 ] && echo "Policy Gate: ALLOW" || echo "Policy Gate: DENY"
          exit $rc
        '''
      }
      post {
        always { archiveArtifacts artifacts: 'policy-result.txt', allowEmptyArchive: true }
      }
    }

    stage('SonarQube Analysis') {
      steps {
        container('sonar') {
          dir('backend') {
            withSonarQubeEnv('SonarQube') {
              // Project settings live in backend/sonar-project.properties.
              sh 'sonar-scanner -Dsonar.projectKey=taskflow-api -Dsonar.token="$SONAR_AUTH_TOKEN"'
            }
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('E2E') {
      steps {
        // The API and its postgres container share the pod's network, so the
        // Playwright API tests hit http://localhost:3000. Same shell = no orphans.
        sh '''
          cd backend && npm run build
          PORT=3000 node dist/src/main.js > "$WORKSPACE/api.log" 2>&1 &
          API_PID=$!
          trap 'kill $API_PID 2>/dev/null' EXIT
          for i in $(seq 1 60); do wget -q -O /dev/null http://localhost:3000/ && break; sleep 2; done
          cd "$WORKSPACE/e2e"
          npm ci --prefer-offline --fetch-retries=5
          BASE_URL=http://localhost:3000 npx playwright test
        '''
      }
      post {
        always {
          junit 'e2e/reports/e2e-junit.xml'
          archiveArtifacts artifacts: 'api.log, e2e/playwright-report/**', allowEmptyArchive: true
        }
      }
    }

    // Dependent stages from here on stay sequential: build -> scan -> infra -> deploy.
    stage('Build Image') {
      steps {
        script {
          env.IMAGE_TAG = env.GIT_COMMIT.take(7)
          // Immutable tag only: a 7-char commit SHA, never 'latest'.
          if (!(env.IMAGE_TAG ==~ /[0-9a-f]{7}/)) {
            error "Refusing to build: invalid image tag '${env.IMAGE_TAG}'"
          }
        }
        container(name: 'kaniko', shell: '/busybox/sh') {
          // Local registry:2 is plain HTTP; no registry credentials exist to bind.
          sh '''
            /kaniko/executor --context "dir://$WORKSPACE/backend" --dockerfile "$WORKSPACE/backend/Dockerfile" \
              --destination "$PUSH_REPO:$IMAGE_TAG" --insecure --skip-tls-verify
          '''
        }
      }
    }

    stage('Container Scan') {
      environment { TRIVY_INSECURE = 'true' }
      steps {
        container('trivy') {
          sh 'trivy image --format sarif --output trivy.sarif "$PUSH_REPO:$IMAGE_TAG"'
          // The gate: exit 1 on any HIGH or CRITICAL finding.
          sh 'trivy image --skip-db-update --exit-code 1 --severity HIGH,CRITICAL "$PUSH_REPO:$IMAGE_TAG"'
        }
      }
      post {
        always { archiveArtifacts artifacts: 'trivy.sarif', allowEmptyArchive: true }
      }
    }

    stage('Terraform Plan') {
      environment {
        TF_IN_AUTOMATION           = '1'
        CHECKPOINT_DISABLE         = '1'
        TF_VAR_localstack_endpoint = 'http://taskflow-localstack:4566'
      }
      steps {
        container('terraform') {
          dir('infra/terraform') {
            sh 'terraform init -input=false -reconfigure -backend-config=ci.s3.tfbackend'
            script {
              // -detailed-exitcode: 0 = no changes, 1 = error, 2 = changes present.
              def rc = sh(script: 'terraform plan -input=false -detailed-exitcode -out=tfplan', returnStatus: true)
              if (rc == 1) { error 'terraform plan failed' }
              env.TF_PLAN_HAS_CHANGES = (rc == 2) ? 'true' : 'false'
            }
            sh '''
              terraform show -no-color tfplan > tfplan.txt
              grep -E '^ +# .* (will|must) be |^Plan:|^No changes' tfplan.txt > tfplan-summary.txt || true
              cat tfplan-summary.txt
            '''
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'infra/terraform/tfplan, infra/terraform/tfplan.txt, infra/terraform/tfplan-summary.txt',
                           fingerprint: true, allowEmptyArchive: true
        }
      }
    }

    stage('Approval') {
      when {
        beforeAgent true
        allOf { branch 'main'; expression { env.TF_PLAN_HAS_CHANGES == 'true' } }
      }
      steps {
        script {
          def summary = readFile('infra/terraform/tfplan-summary.txt').trim()
          // Apply never runs unattended: no answer within 15 minutes aborts the build.
          timeout(time: 15, unit: 'MINUTES') {
            env.TF_APPROVER = input(
              message: "Apply this Terraform plan?\n\n${summary}\n\nFull plan: ${env.BUILD_URL}artifact/infra/terraform/tfplan.txt",
              ok: 'Apply', submitterParameter: 'APPROVER'
            )
          }
          echo "Terraform plan approved by ${env.TF_APPROVER}"
        }
      }
    }

    stage('Terraform Apply') {
      when {
        beforeAgent true
        allOf { branch 'main'; expression { env.TF_PLAN_HAS_CHANGES == 'true' } }
      }
      environment {
        TF_IN_AUTOMATION           = '1'
        CHECKPOINT_DISABLE         = '1'
        TF_VAR_localstack_endpoint = 'http://taskflow-localstack:4566'
      }
      steps {
        container('terraform') {
          dir('infra/terraform') {
            // Exactly the approved plan file; Terraform refuses it if state moved since.
            sh 'terraform apply -input=false tfplan'
          }
        }
      }
    }

    stage('Configure with Ansible') {
      when { branch 'main' }
      environment {
        TF_IN_AUTOMATION = '1'
        CHECKPOINT_DISABLE = '1'
        // LocalStack EC2 is a mock with unreachable IPs; the stand-in host is used instead.
        ANSIBLE_HOST_OVERRIDE = 'taskflow-target'
        ANSIBLE_HOST_KEY_CHECKING = 'False'
        ANSIBLE_INVENTORY_UNPARSED_FAILED = 'True'
      }
      steps {
        container('terraform') {
          dir('infra/terraform') { sh 'terraform output -json > tf-outputs.json' }
        }
        container('python') {
          sh '''
            apt-get update -qq && apt-get install -y -qq --no-install-recommends openssh-client >/dev/null
            python -m venv /tmp/ansible
            /tmp/ansible/bin/pip install -q --retries 10 --timeout 60 "ansible-core==2.21.4"
          '''
          withCredentials([sshUserPrivateKey(credentialsId: 'taskflow-ssh', keyFileVariable: 'SSH_KEY')]) {
            sh '''
              export PATH="/tmp/ansible/bin:$PATH"
              ansible-inventory -i infra/ansible/inventory/terraform.py --graph --vars
              ansible-playbook -i infra/ansible/inventory/terraform.py --private-key "$SSH_KEY" \
                -e app_image="$IMAGE_REPO:$IMAGE_TAG" -e docker_manage_service=false infra/ansible/playbook.yml
            '''
          }
        }
      }
    }

    stage('Pipeline Health Gate') {
      when { branch 'main' }
      steps {
        // Lab 09 Prometheus: success / total over this job's last 20 builds; < 90% aborts.
        sh 'node ci/pipeline-health.mjs "$JOB_NAME"'
      }
    }

    stage('Deploy — Production') {
      when { branch 'main' }
      environment { KUBECTL_VERSION = 'v1.37.0' }
      steps {
        sh '''
          wget -q -O "$TOOLS_DIR/kubectl" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
          chmod +x "$TOOLS_DIR/kubectl"
        '''
        withCredentials([file(credentialsId: 'kind-kubeconfig', variable: 'KUBECONFIG')]) {
          script {
            def k = "${env.TOOLS_DIR}/kubectl"
            env.LIVE_COLOR = sh(script: "${k} get svc taskflow -o jsonpath='{.spec.selector.color}'", returnStdout: true).trim()
            env.NEXT_COLOR = (env.LIVE_COLOR == 'blue') ? 'green' : 'blue'
            echo "Live: ${env.LIVE_COLOR} -> deploying ${env.IMAGE_TAG} to ${env.NEXT_COLOR}"

            sh "${k} set image deployment/taskflow-${env.NEXT_COLOR} app=${env.IMAGE_REPO}:${env.IMAGE_TAG}"
            sh "${k} rollout status deployment/taskflow-${env.NEXT_COLOR} --timeout=120s"

            // Smoke test the new colour directly, before any user traffic reaches it.
            sh """
              ${k} delete pod smoke-${BUILD_NUMBER} --ignore-not-found
              ${k} run smoke-${BUILD_NUMBER} --rm -i --restart=Never --image=curlimages/curl -- \
                curl -sf --retry 3 --retry-delay 2 http://taskflow-${env.NEXT_COLOR}:8080/health
            """
            sh """${k} patch svc taskflow -p '{"spec":{"selector":{"color":"${env.NEXT_COLOR}"}}}'"""
            sh """
              ${k} delete pod verify-${BUILD_NUMBER} --ignore-not-found
              ${k} run verify-${BUILD_NUMBER} --rm -i --restart=Never --image=curlimages/curl -- \
                curl -sf --retry 3 --retry-delay 2 http://taskflow:8080/health
            """
            echo "Switched traffic from ${env.LIVE_COLOR} to ${env.NEXT_COLOR}"
          }
        }
      }
      post {
        failure {
          withCredentials([file(credentialsId: 'kind-kubeconfig', variable: 'KUBECONFIG')]) {
            script {
              if (env.LIVE_COLOR) {
                def k = "${env.TOOLS_DIR}/kubectl"
                echo "ROLLBACK: deploy failed, restoring Service selector to ${env.LIVE_COLOR}"
                sh """${k} patch svc taskflow -p '{"spec":{"selector":{"color":"${env.LIVE_COLOR}"}}}'"""
                sh "${k} get svc taskflow -o jsonpath='{.spec.selector.color}'"
              }
            }
          }
        }
      }
    }
  }

  post {
    // Recipients come from the Jenkins email-ext default list, not from this file.
    success {
      emailext to: '$DEFAULT_RECIPIENTS', mimeType: 'text/plain',
        subject: "SUCCESS: taskflow-api ${env.BRANCH_NAME} #${env.BUILD_NUMBER}",
        body: "Branch: ${env.BRANCH_NAME}\nCommit: ${env.GIT_COMMIT}\nBuild: ${env.BUILD_URL}"
    }
    failure {
      emailext to: '$DEFAULT_RECIPIENTS', mimeType: 'text/plain',
        subject: "FAILURE: taskflow-api ${env.BRANCH_NAME} #${env.BUILD_NUMBER}",
        body: "Branch: ${env.BRANCH_NAME}\nCommit: ${env.GIT_COMMIT}\nBuild: ${env.BUILD_URL}\nConsole: ${env.BUILD_URL}console"
    }
    unstable {
      emailext to: '$DEFAULT_RECIPIENTS', mimeType: 'text/plain',
        subject: "UNSTABLE: taskflow-api ${env.BRANCH_NAME} #${env.BUILD_NUMBER}",
        body: "Branch: ${env.BRANCH_NAME}\nBuild: ${env.BUILD_URL}"
    }
  }
}
