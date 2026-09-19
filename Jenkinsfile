pipeline {
  agent {
    docker {
      image 'node:20-alpine'
      args  '-u root'              // กัน permission denied ตอน npm เขียน cache
      label 'linux-build-agent'    // ล็อกให้ลงเครื่อง build จริง ไม่ไปรันบน controller
    }
  }

  environment {
    APP_NAME = 'taskflow-smoke'
    NODE_ENV = 'test'
  }

  options {
    timeout(time: 10, unit: 'MINUTES')
    // executor มีจำนวนจำกัด ถ้า npm ci ค้างรอ network หรือ test รอ input ที่ไม่มีวันมา
    // stage จะยึด executor ไว้ไม่ปล่อย ทำให้ build อื่นค้างคิวตามไปด้วยโดยไม่มีใครรู้ว่าพัง
    // timeout เปลี่ยน "ค้างเงียบ ๆ ตลอดกาล" ให้กลายเป็น FAILURE ที่มองเห็นและแจ้งเตือนได้
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
