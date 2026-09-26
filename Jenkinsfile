// Lab 09: every build runs in a fresh Kubernetes pod on the kind cluster instead
// of the long-lived static Docker agent. The pod is created for this run and
// deleted when it finishes (watch with: kubectl get pods -n jenkins-agents -w).
// The Docker-dependent stages from Labs 06-08 (image build, Trivy, Terraform,
// Ansible, blue/green) stay on the nongao/lab8 branch.
pipeline {
  agent {
    kubernetes {
      // Every step runs in the node container unless a stage says otherwise.
      defaultContainer 'node'
      yaml '''
        apiVersion: v1
        kind: Pod
        spec:
          containers:
          - name: node
            image: node:20-alpine
            command: ['cat']
            tty: true
            # All agent pods share one laptop-sized Docker VM; cap each so a burst
            # can't take the whole kind cluster down.
            resources:
              requests: { cpu: 500m, memory: 512Mi }
              limits: { memory: 1Gi }
            volumeMounts:
            - name: npm-cache
              mountPath: /root/.npm
          volumes:
          # Pods are thrown away after each build; keep the npm download cache on the kind
          # node so the next pod (and a burst of 10 in the load test) doesn't refetch everything.
          - name: npm-cache
            hostPath:
              path: /var/cache/jenkins-npm
              type: DirectoryOrCreate
      '''
    }
  }

  parameters {
    // Load test only: keeps the pod busy so builds pile up in the queue.
    string(name: 'HOLD_SECONDS', defaultValue: '0', description: 'Extra seconds to hold the pod (saturation test)')
    // Distinct values keep Jenkins from merging identical queued builds into one.
    string(name: 'RUN_ID', defaultValue: '', description: 'Free-form tag for load-test runs')
  }

  options {
    timeout(time: 30, unit: 'MINUTES')
  }

  stages {
    stage('Agent Info') {
      steps {
        sh 'echo "Pod: $(hostname)"; node --version; npm --version'
      }
    }

    stage('Install') {
      steps {
        dir('backend') {
          // Retry flaky registry connections instead of failing on the first idle timeout.
          sh 'npm ci --prefer-offline --fetch-retries=5 --fetch-timeout=120000'
        }
      }
    }

    stage('Build') {
      steps {
        dir('backend') { sh 'npm run build' }
      }
    }

    stage('Unit Test') {
      steps {
        dir('backend') {
          // Jest defaults to one worker per host CPU (15 here) in every pod; 2 is plenty per build.
          sh 'npm test -- --ci --coverage --maxWorkers=2 --reporters=default --reporters=jest-junit'
        }
      }
      post {
        always {
          junit 'backend/reports/junit.xml'
          recordCoverage(tools: [[parser: 'COBERTURA', pattern: 'backend/coverage/cobertura-coverage.xml']])
        }
      }
    }

    stage('SCA') {
      steps {
        dir('backend') {
          // Report only; the gate itself lives in the full pipeline on nongao/lab8.
          sh 'npm audit --audit-level=high --json > npm-audit.json || true'
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'backend/npm-audit.json', allowEmptyArchive: true
        }
      }
    }

    stage('Hold') {
      when {
        beforeAgent true
        expression { (params.HOLD_SECONDS ?: '0').toInteger() > 0 }
      }
      steps {
        sh "echo 'Holding pod for ${params.HOLD_SECONDS}s (RUN_ID=${params.RUN_ID})'; sleep ${params.HOLD_SECONDS.toInteger()}"
      }
    }
  }
}
