variable "region" {
  type    = string
  default = "us-east-1"
}

variable "localstack_endpoint" {
  type    = string
  default = "http://localhost:4566"
}

variable "instance_type" {
  type    = string
  default = "t3.micro" # supports EBS optimization
}

variable "ami_id" {
  description = "AMI for the instance (LocalStack built-in Ubuntu image)"
  type        = string
  default     = "ami-1e749f67"
}

variable "app_port" {
  type    = number
  default = 8080
}

variable "app_ingress_cidrs" {
  description = "CIDRs allowed to reach the app port (default: the default VPC range)"
  type        = list(string)
  default     = ["172.31.0.0/16"]
}

variable "ssh_ingress_cidrs" {
  description = "CIDRs allowed to SSH in (the CI runner / bastion that runs Ansible)"
  type        = list(string)
  default     = ["172.31.0.0/16"]
}

variable "key_name" {
  description = "Existing EC2 key pair for Ansible SSH access (null = none)"
  type        = string
  default     = null
}
