pipeline {
  agent {
    docker {
      image 'node:20-alpine'
      args '-u root'
      label 'linux-build-agent'
    }
  }

  environment {
    APP_NAME     = 'taskflow-api'
    NODE_ENV     = 'test'
    FAILED_STAGE = ''
  }

  options {
    timeout(time: 10, unit: 'MINUTES')
  }

  stages {

    stage('Install') {
      steps {
        script {
          env.FAILED_STAGE = env.STAGE_NAME
        }

        echo "Building ${env.APP_NAME} in ${env.NODE_ENV} mode"

        sh 'node -v && npm -v'

        dir('backend') {
          sh 'npm ci'
        }
      }
    }

    stage('Secrets — Gitleaks') {
      steps {
        script {
          env.FAILED_STAGE = env.STAGE_NAME
        }

        sh 'git fetch --unshallow || true'

        sh '''
          mkdir -p reports

          gitleaks git . \
            --log-opts="--all" \
            --report-format json \
            --report-path reports/gitleaks.json \
            --redact \
            --verbose \
            --exit-code 1
        '''
      }
    }

    stage('Lint') {
      steps {
        script {
          env.FAILED_STAGE = env.STAGE_NAME
        }

        dir('backend') {
          sh 'npm run lint'
        }
      }
    }

    stage('Unit Test') {
      steps {
        script {
          env.FAILED_STAGE = env.STAGE_NAME
        }

        dir('backend') {
          sh 'npm test'
        }
      }
    }

    stage('Deploy — Staging') {
      when {
        branch 'develop'
      }

      steps {
        script {
          env.FAILED_STAGE = env.STAGE_NAME
        }

        sh 'echo deploying to staging...'
      }
    }

    stage('Deploy — Production') {
      when {
        beforeInput true
        branch 'main'
      }

      input {
        message 'Deploy to production?'
      }

      steps {
        script {
          env.FAILED_STAGE = env.STAGE_NAME
        }

        sh 'echo deploying to production...'
      }
    }
  }

  post {

    always {
      archiveArtifacts(
        artifacts: 'reports/gitleaks.json',
        allowEmptyArchive: true
      )

      archiveArtifacts(
        artifacts: 'backend/npm-debug.log*',
        allowEmptyArchive: true
      )
    }

    success {
      echo "${env.APP_NAME} passed on ${env.NODE_ENV}"
    }

    failure {
      echo "Failed at stage: ${env.FAILED_STAGE}"
      echo "hi"
    }
  }
}
