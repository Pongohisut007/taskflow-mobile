# Ansible: configure the Terraform-provisioned host

`playbook.yml` installs Node.js 22 (NodeSource) and Docker, then pulls the
`taskflow-api` image built by the Lab 07 **Build Image** stage.

`inventory/terraform.py` is a dynamic inventory: it reads `terraform output -json`
(`infra/terraform/tf-outputs.json`) and puts the instance in `taskflow_app`.

## Stand-in host (LocalStack)

LocalStack Community only mocks EC2, so its instance IPs are not reachable.
CI sets `ANSIBLE_HOST_OVERRIDE=taskflow-target` to connect to a container instead:

```bash
cd infra/ansible
docker compose up -d --build    # taskflow-target, on jenkins-net, no published ports
```

It mounts the host Docker socket, so anyone who can SSH in has root on the
Docker host. Lab use only; stop it when you are done (`docker compose down`).

## Jenkins credential

Kind **SSH Username with private key**, ID `taskflow-ssh`, username `ubuntu`,
private key: the contents of `~/.ssh/taskflow_lab_ed25519`. The matching public
key is `target/authorized_keys`.
