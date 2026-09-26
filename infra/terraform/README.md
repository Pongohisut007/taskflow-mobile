# Terraform on LocalStack

Provisions, against LocalStack (a local AWS emulator):

- 1 EC2 instance (`aws_instance.app`)
- 1 security group that allows inbound TCP **8080** (`aws_security_group.app`)
- Outputs for the instance address (`instance_public_ip`, `instance_private_ip`, `app_url`)

Remote state is stored in the S3 bucket `taskflow-tfstate` inside LocalStack
(key `lab/terraform.tfstate`, with S3-native locking via `use_lockfile`).
`terraform.tfstate` is never written locally and is git-ignored.

## Run it

```bash
cd infra/terraform

# 1. Start LocalStack. The init script creates the state bucket.
docker compose up -d
curl -s localhost:4566/_localstack/init/ready   # wait for "completed": true

# 2. Terraform
terraform init
terraform plan -out tfplan
terraform apply tfplan
terraform output
```

## Verify

```bash
# State lives in the bucket, not on disk
docker exec taskflow-localstack awslocal s3 ls s3://taskflow-tfstate/lab/
ls terraform.tfstate 2>/dev/null || echo "no local state"

# Resources exist in LocalStack
docker exec taskflow-localstack awslocal ec2 describe-instances \
  --query "Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]"
docker exec taskflow-localstack awslocal ec2 describe-security-groups \
  --group-names taskflow-app-sg --query "SecurityGroups[].IpPermissions"
```

## Clean up

```bash
terraform destroy
docker compose down
```

> LocalStack Community mocks EC2, so the instance is not a real VM. It
> gets an ID and IP addresses, but nothing actually listens on 8080.

## In Jenkins

`docker-compose.yml` attaches LocalStack to `jenkins-net`, so stage containers
reach it as `http://taskflow-localstack:4566` (backend override:
`ci.s3.tfbackend`, provider override: `TF_VAR_localstack_endpoint`).

1. **Terraform Plan**: `plan -out=tfplan`, archives `tfplan`, `tfplan.txt`, `tfplan-summary.txt`.
2. **Approval**: `input` step shows the plan summary; aborts after 15 minutes with no answer.
3. **Terraform Apply**: applies exactly the approved `tfplan`.

When the plan has no changes, Approval and Apply are skipped.
