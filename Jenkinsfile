pipeline {
  agent { label 'linux-build-agent' }

  environment {
    // One compose project per build so the E2E container can join its network.
    COMPOSE_PROJECT_NAME = "taskflow-ci-${env.BUILD_NUMBER}"
    // Host ports published by backend/docker-compose.yaml; kept off the dev defaults.
    API_PORT      = '13000'
    POSTGRES_PORT = '15432'
    PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble' // must match @playwright/test in e2e/package.json
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