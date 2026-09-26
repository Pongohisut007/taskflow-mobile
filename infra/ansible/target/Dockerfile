# Stand-in for the EC2 instance Terraform creates. LocalStack Community only
# mocks EC2 (no real VM to SSH into), so Ansible configures this container instead.
FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-server python3 sudo ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/sshd \
 && echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
 && sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config

# Public key only; the private key lives in the Jenkins credential 'taskflow-ssh'.
COPY --chown=ubuntu:ubuntu --chmod=600 authorized_keys /home/ubuntu/.ssh/authorized_keys
RUN chmod 700 /home/ubuntu/.ssh

EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
