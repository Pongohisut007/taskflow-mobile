pipeline {
  agent any
  options { timestamps() }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        // Gitleaks needs full history, so undo any shallow clone
        sh 'if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then git fetch --unshallow; fi'
      }
    }

    stage('Install') {
      steps { sh 'npm ci' }
    }

    stage('Secrets Detection — Gitleaks') {
      steps {
        // Scans every commit reachable from the current branch
        sh 'gitleaks git . --redact --verbose --exit-code 1 --report-format sarif --report-path gitleaks.sarif'
      }
      post {
        always { archiveArtifacts artifacts: 'gitleaks.sarif', allowEmptyArchive: true }
      }
    }

    stage('SAST — ESLint security') {
      steps {
        catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
          sh 'npx eslint --plugin security src/ -f @microsoft/eslint-formatter-sarif -o eslint.sarif'
        }
      }
      post {
        always { archiveArtifacts artifacts: 'eslint.sarif', allowEmptyArchive: true }
      }
    }

    stage('SAST — Semgrep') {
      steps {
        catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
          sh 'semgrep scan --config=p/owasp-top-ten --config=p/nodejs --sarif --output semgrep.sarif --error src/'
        }
      }
      post {
        always { archiveArtifacts artifacts: 'semgrep.sarif', allowEmptyArchive: true }
      }
    }

    stage('SCA — npm audit') {
      steps {
        script {
          // npm audit exits non-zero when it finds anything, so swallow the exit code
          sh 'npm audit --audit-level=high --json > audit.json || true'
          archiveArtifacts artifacts: 'audit.json'

          def critical = sh(script: "jq '.metadata.vulnerabilities.critical // 0' audit.json",
                            returnStdout: true).trim().toInteger()
          def high = sh(script: "jq '.metadata.vulnerabilities.high // 0' audit.json",
                        returnStdout: true).trim().toInteger()

          if (critical > 0) {
            // Mark the build FAILED but keep going so the Policy Gate also runs and logs its verdict
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              error("Blocking: ${critical} critical vulnerabilities found")
            }
          } else if (high > 0) {
            unstable("SCA warning: ${high} high vulnerabilities (non-blocking)")
          } else {
            echo "SCA passed with 0 critical vulnerabilities (warnings allowed)"
          }
        }
      }
    }

    stage('Generate SBOM') {
      environment {
        COSIGN_PASSWORD = credentials('cosign-password')   // Secret text credential
      }
      steps {
        withCredentials([file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY')]) {
          sh '''
            syft dir:. --source-name taskflow-api -o cyclonedx-json=taskflow-api.cdx.json

            cosign sign-blob --yes --key "$COSIGN_KEY" --tlog-upload=false \
              --output-signature taskflow-api.cdx.json.sig taskflow-api.cdx.json

            # Prove the signature is valid before archiving
            cosign verify-blob --key cosign.pub --insecure-ignore-tlog=true \
              --signature taskflow-api.cdx.json.sig taskflow-api.cdx.json
          '''
        }
      }
      post {
        success {
          archiveArtifacts artifacts: 'taskflow-api.cdx.json, taskflow-api.cdx.json.sig, cosign.pub'
        }
      }
    }

    stage('Policy Gate') {
      steps {
        // --fail-defined: exit 1 if any deny message exists
        sh 'opa eval --fail-defined --format pretty -d policy/security.rego -i audit.json "data.security.deny[_]"'
        echo 'Policy Gate passed: no CRITICAL CVEs'
      }
    }
  }
}