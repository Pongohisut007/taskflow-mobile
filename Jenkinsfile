pipeline {
  agent { label 'linux-build-agent' }

  tools {
    nodejs 'node20'
  }

  environment {
    APP_NAME = 'taskflow-smoke'
    NODE_ENV = 'test'
  }

  options {
    timeout(time: 10, unit: 'MINUTES')
  }

  stages {
    stage('Install') {
      steps {
        echo "Building ${env.APP_NAME} in ${env.NODE_ENV} mode"
        sh 'node -v && npm -v'
        dir('backend') { sh 'npm ci' }
      }
    }
    stage('Lint') {
      steps { dir('backend') { sh 'npm run lint' } }
    }
    stage('Unit Test') {
      steps { dir('backend') { sh 'npm test' } }
    }
  }

  post {
    success { echo "✅ ${env.APP_NAME} passed on ${env.NODE_ENV}" }
    failure { echo "❌ Failed at stage: ${env.STAGE_NAME}" }
    always  {
      archiveArtifacts artifacts: 'backend/npm-debug.log*', allowEmptyArchive: true
    }
  }
}
