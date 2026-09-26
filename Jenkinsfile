pipeline {
  agent { label 'linux-build-agent' }

  environment {
    // One compose project per build so the E2E container can join its network.
    COMPOSE_PROJECT_NAME = "taskflow-ci-${env.BUILD_NUMBER}"
    // Host ports published by backend/docker-compose.yaml; kept off the dev defaults.
    API_PORT      = '13000'
    POSTGRES_PORT = '15432'
    PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble' // must match @playwright/test in e2e/package.json
    // Lab 07: local registry (registry:2) reachable through the host Docker daemon via docker.sock.
    REGISTRY   = 'localhost:5001'
    IMAGE_REPO = 'localhost:5001/taskflow-api'
  }

  options {
    timeout(time: 30, unit: 'MINUTES')
  }

  stages {
    stage('Secrets') {
      agent {
        docker {
          // Pin the version; the image ships git, which gitleaks needs to scan history.
          image 'ghcr.io/gitleaks/gitleaks:v8.21.2'
          args '--entrypoint='
          reuseNode true
        }
      }
      environment {
        // Avoid git's "dubious ownership" error inside the container without needing a writable HOME.
        GIT_CONFIG_COUNT   = '1'
        GIT_CONFIG_KEY_0   = 'safe.directory'
        GIT_CONFIG_VALUE_0 = '*'
      }
      steps {
        // Exits 1 when leaks are found, which fails the stage; the report is written first.
        sh '''
          gitleaks git . \
            --redact \
            --verbose \
            --report-format sarif \
            --report-path gitleaks.sarif
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'gitleaks.sarif', allowEmptyArchive: true
        }
      }
    }

    stage('Install') {
      agent {
        docker { image 'node:22-alpine'; reuseNode true }
      }
      steps {
        dir('backend') { sh 'npm ci' }
      }
    }

    stage('SAST') {
      // Needs node_modules from Install; rules come from backend/eslint.security.config.mjs.
      agent {
        docker { image 'node:22-alpine'; reuseNode true }
      }
      steps {
        dir('backend') {
          // eslint-plugin-security rules are warnings, so findings do not fail the stage.
          // Add --max-warnings 0 to turn this into a gate.
          sh '''
            npx eslint -c eslint.security.config.mjs src/ \
              -f @microsoft/eslint-formatter-sarif \
              -o eslint.sarif
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'backend/eslint.sarif', allowEmptyArchive: true
        }
      }
    }

    stage('Semgrep') {
      agent {
        docker {
          image 'semgrep/semgrep:1.95.0'
          args '--entrypoint='
          reuseNode true
        }
      }
      environment {
        SEMGREP_SEND_METRICS = 'off'
      }
      steps {
        // Jenkins runs the container as the agent's uid, so give semgrep a writable HOME for its cache.
        // Findings are reported without failing the stage; add --error to make it a gate.
        sh '''
          export HOME="$WORKSPACE/.semgrep-home"
          semgrep scan \
            --config=p/owasp-top-ten \
            --config=p/nodejs \
            --sarif --output semgrep.sarif \
            backend/src
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'semgrep.sarif', allowEmptyArchive: true
        }
      }
    }

    stage('SCA') {
      agent {
        docker { image 'node:22-alpine'; reuseNode true }
      }
      steps {
        dir('backend') {
          // npm audit exits non-zero on findings; ignore that and let the gate below decide.
          sh 'npm audit --audit-level=high --json > npm-audit.json || true'
          script {
            def report = readJSON file: 'npm-audit.json'
            if (report.error) {
              error "npm audit could not run: ${report.error.summary ?: report.error}"
            }
            def v = report.metadata.vulnerabilities
            echo "npm audit: critical=${v.critical}, high=${v.high}, moderate=${v.moderate}, low=${v.low}, total=${v.total}"

            if (v.critical > 0) {
              // Mark SCA and the build as failed, but keep going so the Policy Gate records its own decision.
              catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                error "SCA gate FAILED: ${v.critical} critical vulnerabilities"
              }
            } else if (v.high > 0) {
              unstable "SCA WARNING: ${v.high} high vulnerabilities (no critical)"
            } else {
              echo 'SCA gate passed: no high or critical vulnerabilities'
            }
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'backend/npm-audit.json', allowEmptyArchive: true
        }
      }
    }

    stage('Generate SBOM') {
      environment {
        SYFT_VERSION   = '1.18.1'
        COSIGN_VERSION = '2.4.1'
        TOOLS_DIR      = "${env.WORKSPACE}/.tools"
      }
      steps {
        // Static binaries downloaded once per workspace, same pattern as the compose plugin in Start API.
        sh '''
          mkdir -p "$TOOLS_DIR"
          if [ ! -x "$TOOLS_DIR/syft" ]; then
            curl -fsSL "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_amd64.tar.gz" \
              | tar -xz -C "$TOOLS_DIR" syft
          fi
          if [ ! -x "$TOOLS_DIR/cosign" ]; then
            curl -fsSL -o "$TOOLS_DIR/cosign" \
              "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
            chmod +x "$TOOLS_DIR/cosign"
          fi
        '''
        sh '''
          "$TOOLS_DIR/syft" scan dir:backend \
            --source-name taskflow-api \
            --source-version "$GIT_COMMIT" \
            -o cyclonedx-json=sbom.cdx.json
        '''
        withCredentials([
          file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY'),
          string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
        ]) {
          // Local keypair for the lab: keep the signature out of the public Rekor log.
          sh '''
            "$TOOLS_DIR/cosign" sign-blob --yes \
              --key "$COSIGN_KEY" \
              --tlog-upload=false \
              --output-signature sbom.cdx.json.sig \
              sbom.cdx.json
          '''
        }
        // Prove the signature checks out against the public key committed in the repo.
        sh '''
          "$TOOLS_DIR/cosign" verify-blob \
            --key keys/cosign.pub \
            --signature sbom.cdx.json.sig \
            --insecure-ignore-tlog=true \
            sbom.cdx.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'sbom.cdx.json, sbom.cdx.json.sig', allowEmptyArchive: true
        }
      }
    }

    stage('Policy Gate') {
      environment {
        OPA_VERSION = '1.0.0'
        TOOLS_DIR   = "${env.WORKSPACE}/.tools"
      }
      steps {
        sh '''
          mkdir -p "$TOOLS_DIR"
          if [ ! -x "$TOOLS_DIR/opa" ]; then
            curl -fsSL -o "$TOOLS_DIR/opa" \
              "https://github.com/open-policy-agent/opa/releases/download/v${OPA_VERSION}/opa_linux_amd64_static"
            chmod +x "$TOOLS_DIR/opa"
          fi
          "$TOOLS_DIR/opa" check policy/security.rego
        '''
        // Input is the npm audit report written by the SCA stage.
        // --fail-defined exits 1 when the query has any result, i.e. at least one deny message.
        sh '''
          set +e
          "$TOOLS_DIR/opa" eval \
            --data policy/security.rego \
            --input backend/npm-audit.json \
            --format pretty \
            --fail-defined \
            'data.taskflow.security.deny[msg]' > policy-result.txt
          rc=$?
          cat policy-result.txt
          if [ "$rc" -eq 0 ]; then
            echo "Policy Gate: ALLOW (no deny rule matched)"
          else
            echo "Policy Gate: DENY (see messages above)"
          fi
          exit $rc
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'policy-result.txt', allowEmptyArchive: true
        }
      }
    }

    stage('Unit Test') {
      agent {
        docker { image 'node:22-alpine'; reuseNode true }
      }
      steps {
        dir('backend') {
          sh 'npm test -- --ci --coverage --reporters=default --reporters=jest-junit'
        }
      }
      post {
        always {
          junit 'backend/reports/junit.xml'
          recordCoverage(tools: [[parser: 'COBERTURA', pattern: 'backend/coverage/cobertura-coverage.xml']])
        }
      }
    }

    stage('SonarQube Analysis') {
      // The JS/TS analyzer needs Node.js next to the scanner, which this image provides.
      agent {
        docker {
          image 'sonarsource/sonar-scanner-cli:11'
          args '--network jenkins-net --entrypoint='
          reuseNode true
        }
      }
      steps {
        dir('backend') {
          withSonarQubeEnv('SonarQube') {
            // Project settings live in backend/sonar-project.properties.
            sh 'sonar-scanner -Dsonar.projectKey=taskflow-api -Dsonar.login=$SONAR_AUTH_TOKEN'
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

    stage('Start API') {
      steps {
        // The agent image ships the docker CLI without the compose plugin.
        sh '''
          if ! docker compose version >/dev/null 2>&1; then
            mkdir -p ~/.docker/cli-plugins
            curl -fsSL https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64 \
              -o ~/.docker/cli-plugins/docker-compose
            chmod +x ~/.docker/cli-plugins/docker-compose
          fi
        '''
        dir('backend') {
          sh 'docker compose up -d --build --wait'
        }
      }
    }

    stage('E2E') {
      agent {
        docker {
          image "${PLAYWRIGHT_IMAGE}"
          args "--network ${COMPOSE_PROJECT_NAME}_default --ipc=host"
          reuseNode true
        }
      }
      environment {
        BASE_URL = 'http://api:3000'
        CI = 'true'
      }
      steps {
        dir('e2e') {
          sh 'npm ci'
          sh 'npx playwright test'
        }
      }
      post {
        always {
          junit 'e2e/reports/e2e-junit.xml'
          archiveArtifacts artifacts: 'e2e/playwright-report/**', allowEmptyArchive: true
          publishHTML(target: [
            reportDir: 'e2e/playwright-report', reportFiles: 'index.html',
            reportName: 'Playwright Report', keepAll: true,
            alwaysLinkToLastBuild: true, allowMissing: false
          ])
        }
      }
    }

    // ===================== Lab 07 =====================

    stage('Build Image') {
      steps {
        script {
          env.IMAGE_TAG = env.GIT_COMMIT.take(7)
          // Immutable tag only: must be a 7-char commit SHA, never 'latest'.
          if (!(env.IMAGE_TAG ==~ /[0-9a-f]{7}/)) {
            error "Refusing to build: invalid image tag '${env.IMAGE_TAG}'"
          }
          echo "Building ${env.IMAGE_REPO}:${env.IMAGE_TAG}"
        }
        sh 'docker build -t "$IMAGE_REPO:$IMAGE_TAG" backend'
        sh 'docker push "$IMAGE_REPO:$IMAGE_TAG"'
      }
    }

    stage('Container Scan') {
      environment {
        // Pinned; never use 0.69.5/0.69.6 (compromised March 2026).
        TRIVY_IMAGE = 'aquasec/trivy:0.72.0'
      }
      steps {
        // Full report for the deliverable; never fails the build.
        // SARIF goes to stdout (logs go to stderr), so no workspace mount is needed.
        sh '''
          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v trivy-cache:/root/.cache/trivy \
            "$TRIVY_IMAGE" image --format sarif "$IMAGE_REPO:$IMAGE_TAG" > trivy.sarif
        '''
        // The actual gate: exit 1 on any HIGH or CRITICAL finding.
        sh '''
          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v trivy-cache:/root/.cache/trivy \
            "$TRIVY_IMAGE" image --skip-db-update --exit-code 1 --severity HIGH,CRITICAL "$IMAGE_REPO:$IMAGE_TAG"
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy.sarif', allowEmptyArchive: true
        }
      }
    }

    stage('Blue/Green Deploy') {
      environment {
        KUBECTL_VERSION = 'v1.37.0'
        TOOLS_DIR       = "${env.WORKSPACE}/.tools"
      }
      steps {
        sh '''
          mkdir -p "$TOOLS_DIR"
          if [ ! -x "$TOOLS_DIR/kubectl" ]; then
            curl -fsSL -o "$TOOLS_DIR/kubectl" \
              "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
            chmod +x "$TOOLS_DIR/kubectl"
          fi
        '''
        withCredentials([file(credentialsId: 'kind-kubeconfig', variable: 'KUBECONFIG')]) {
          script {
            def k = "${env.TOOLS_DIR}/kubectl"

            env.LIVE_COLOR = sh(
              script: "${k} get svc taskflow -o jsonpath='{.spec.selector.color}'",
              returnStdout: true
            ).trim()
            env.NEXT_COLOR = (env.LIVE_COLOR == 'blue') ? 'green' : 'blue'
            echo "Live: ${env.LIVE_COLOR} -> deploying ${env.IMAGE_TAG} to: ${env.NEXT_COLOR}"

            sh "${k} set image deployment/taskflow-${env.NEXT_COLOR} app=${env.IMAGE_REPO}:${env.IMAGE_TAG}"
            sh "${k} rollout status deployment/taskflow-${env.NEXT_COLOR} --timeout=120s"

            // Smoke test the new colour directly, before any user traffic reaches it.
            sh """
              ${k} delete pod smoke-${BUILD_NUMBER} --ignore-not-found
              ${k} run smoke-${BUILD_NUMBER} --rm -i --restart=Never \
                --image=curlimages/curl -- \
                curl -sf --retry 3 --retry-delay 2 http://taskflow-${env.NEXT_COLOR}:8080/health
            """

            sh """${k} patch svc taskflow -p '{"spec":{"selector":{"color":"${env.NEXT_COLOR}"}}}'"""

            // Verify again through the main Service after the switch.
            sh """
              ${k} delete pod verify-${BUILD_NUMBER} --ignore-not-found
              ${k} run verify-${BUILD_NUMBER} --rm -i --restart=Never \
                --image=curlimages/curl -- \
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
                def k = "${env.WORKSPACE}/.tools/kubectl"
                echo "ROLLBACK: deploy failed, restoring Service selector to ${env.LIVE_COLOR}"
                sh """${k} patch svc taskflow -p '{"spec":{"selector":{"color":"${env.LIVE_COLOR}"}}}'"""
                sh "echo 'Service now points to:' && ${k} get svc taskflow -o jsonpath='{.spec.selector.color}'"
              }
            }
          }
        }
      }
    }
  }

  post {
    always {
      dir('backend') {
        sh 'docker compose logs api --tail 100 || true'
        sh 'docker compose down -v || true'
      }
    }
  }
}