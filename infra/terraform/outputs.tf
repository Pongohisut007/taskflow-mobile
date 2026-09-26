output "instance_id" {
  value = aws_instance.app.id
}

output "instance_public_ip" {
  value = aws_instance.app.public_ip
}

output "instance_private_ip" {
  value = aws_instance.app.private_ip
}

output "app_url" {
  value = "http://${coalesce(aws_instance.app.public_ip, aws_instance.app.private_ip)}:${var.app_port}"
}

output "security_group_id" {
  value = aws_security_group.app.id
}
