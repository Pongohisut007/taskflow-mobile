pipeline {
  agent {
    docker {
      image 'node:20-alpine'
      args  '-u root'
      label 'linux-build-agent'
    }
  }

  environment {
    APP_NAME     = 'taskflow-api'
    NODE_ENV     = 'test'
    FAILED_STAGE = ''
  }

  options {
    // ทุก build ยึด executor ของ agent ไว้หนึ่งช่องตลอดเวลาที่รัน
    // ถ้า npm ci ค้างรอ network หรือ jest hang เพราะ handle ที่ไม่ถูกปิด
    // stage นั้นจะไม่มีวันจบเอง executor ไม่ถูกคืน และ build ที่ต่อคิวอยู่จะตันตาม
    // timeout บังคับให้ build ที่ค้างถูก abort แล้วคืนทรัพยากรให้ระบบโดยไม่ต้องรอคนมา kill
    timeout(time: 10, unit: 'MINUTES')
  }

  stages {
    stage('Install') {
      steps {
        script { env.FAILED_STAGE = env.STAGE_NAME }
        echo "Building ${env.APP_NAME} in ${env.NODE_ENV} mode"
        sh 'node -v && npm -v'
        dir('backend') { sh 'npm ci' }
      }
    }

    stage('Lint') {
      steps {
        script { env.FAILED_STAGE = env.STAGE_NAME }
        dir('backend') { sh 'npm run lint' }
      }
    }

    stage('Unit Test') {
      steps {
        script { env.FAILED_STAGE = env.STAGE_NAME }
        dir('backend') { sh 'npm test' }
      }
    }

    stage('Deploy — Staging') {
      when { branch 'develop' }
      steps {
        script { env.FAILED_STAGE = env.STAGE_NAME }
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
        script { env.FAILED_STAGE = env.STAGE_NAME }
        sh 'echo deploying to production...'
      }
    }
  }

  post {
    success {
      echo "${env.APP_NAME} passed on ${env.NODE_ENV}"
    }
    failure {
      echo "Failed at stage: ${env.FAILED_STAGE ?: env.STAGE_NAME}"
    }
    always {
      archiveArtifacts artifacts: 'backend/npm-debug.log*', allowEmptyArchive: true
    }
  }
}