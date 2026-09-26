data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "app" {
  name        = "taskflow-app-sg"
  description = "Allow inbound HTTP on ${var.app_port}"
  vpc_id      = data.aws_vpc.default.id

  # Only trusted networks (e.g. the VPC / load balancer), never 0.0.0.0/0.
  ingress {
    description = "App port from trusted networks"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = var.app_ingress_cidrs
  }

  # SSH for Ansible, only from the network the CI runner connects from.
  ingress {
    description = "SSH for Ansible from trusted networks"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_ingress_cidrs
  }

  # HTTP/HTTPS only, for pulling images and OS packages (Ubuntu apt mirrors use
  # port 80). Registries and mirrors have no fixed IP range, so public egress is accepted.
  #tfsec:ignore:aws-ec2-no-public-egress-sgr
  egress {
    description = "HTTPS to the internet for image and package downloads"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  #tfsec:ignore:aws-ec2-no-public-egress-sgr
  egress {
    description = "HTTP to the internet for Ubuntu apt mirrors"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "taskflow-app-sg"
  }
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# Least-privilege role with no policies attached, so the instance never
# needs long-lived access keys.
resource "aws_iam_role" "app" {
  name               = "taskflow-app-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_instance_profile" "app" {
  name = "taskflow-app-profile"
  role = aws_iam_role.app.name
}

resource "aws_instance" "app" {
  # checkov:skip=CKV_AWS_126:Detailed monitoring is paid (not free tier) and LocalStack does not implement MonitorInstances
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name
  key_name               = var.key_name
  ebs_optimized          = true

  # IMDSv2 only: blocks SSRF-style credential theft through the metadata service.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted   = true
    volume_size = 8
    volume_type = "gp3"
  }

  tags = {
    Name = "taskflow-app"
  }

  # LocalStack does not store metadata_options and has no ModifyInstanceMetadataOptions,
  # so every plan would show drift and every apply would fail. IMDSv2 is still set at creation.
  lifecycle {
    ignore_changes = [metadata_options]
  }
}
