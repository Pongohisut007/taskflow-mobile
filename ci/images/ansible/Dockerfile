# Lab 10 CI image for the Ansible Lint and Configure with Ansible stages.
# Baked once and pushed to the local registry, so builds never depend on PyPI/apt
# being reachable at build time (flaky pip installs failed builds in Labs 08 and 10).
#   docker build -t localhost:5001/ci-ansible:26.9.0 ci/images/ansible
#   docker push localhost:5001/ci-ansible:26.9.0
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --retries 10 "ansible-lint==26.9.0" "ansible-core==2.21.4"

# ansible writes ~/.ansible; give any uid a writable HOME.
ENV HOME=/tmp
