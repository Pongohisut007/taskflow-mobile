data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "app" {
  name        = "taskflow-app-sg"
  description = "Allow inbound HTTP on ${var.app_port}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "App port"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "taskflow-app-sg"
  }
}

resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]

  tags = {
    Name = "taskflow-app"
  }
}
