pipeline {
  agent any

  environment {
    IMAGE_NAME = "brijeshkori/eminsights_backend"
    TAG = "${BUILD_NUMBER}"
  }

  stages {

    stage('Build Docker Image') {
      steps {
        sh "docker build -t $IMAGE_NAME:$TAG ."
      }
    }

    stage('Push Image to Docker Hub') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-creds',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh """
            echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
            docker push $IMAGE_NAME:$TAG
          """
        }
      }
    }

    stage('Update K8s Manifest (GitOps)') {
      steps {
        withCredentials([string(
          credentialsId: 'github-token',
          variable: 'GITHUB_TOKEN'
        )]) {
          sh """
            git config user.email "jenkins@local"
            git config user.name "jenkins"

            sed -i 's|image: .*|image: $IMAGE_NAME:$TAG|' k8s/deployment.yaml

            git add k8s/deployment.yaml
            git commit -m "chore(ci): update backend image to $TAG"
            git push https://$GITHUB_TOKEN@github.com/EM-brijesh/eminsights-backend.git
          """
        }
      }
    }
  }
}