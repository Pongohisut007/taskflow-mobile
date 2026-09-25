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
    }
  stages {
    stage('Install') {
      agent {
        docker { image 'node:22-alpine'; reuseNode true }
      }
      steps {
        dir('backend') { sh 'npm ci' }
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
