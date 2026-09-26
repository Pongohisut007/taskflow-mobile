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
  default = "t2.micro"
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
