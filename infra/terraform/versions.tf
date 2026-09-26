terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in an S3-compatible bucket (LocalStack). The bucket is
  # created by localstack-init/01-create-state-bucket.sh. State never
  # lives in the repo; terraform.tfstate is also git-ignored.
  backend "s3" {
    bucket       = "taskflow-tfstate"
    key          = "lab/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true

    endpoints = {
      s3 = "http://localhost:4566"
    }
    use_path_style              = true
    access_key                  = "test"
    secret_key                  = "test"
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_s3_checksum            = true
  }
}
