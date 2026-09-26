#!/bin/bash
# Create the remote-state bucket before Terraform runs `init`
awslocal s3 mb s3://taskflow-tfstate || true
awslocal s3api put-bucket-versioning --bucket taskflow-tfstate \
  --versioning-configuration Status=Enabled
