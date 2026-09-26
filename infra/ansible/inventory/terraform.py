#!/usr/bin/env python3
"""Ansible dynamic inventory built from Terraform outputs.

Reads the JSON written by `terraform output -json` (path in TF_OUTPUTS_FILE,
default ../../terraform/tf-outputs.json) and puts the instance in the
`taskflow_app` group.

ANSIBLE_HOST_OVERRIDE replaces the address to connect to. LocalStack only
mocks EC2, so its IPs are not reachable and CI points at a stand-in host.
"""
import json
import os
import sys

DEFAULT_OUTPUTS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "terraform", "tf-outputs.json"
)


def build_inventory():
    path = os.environ.get("TF_OUTPUTS_FILE", DEFAULT_OUTPUTS)
    with open(path, encoding="utf-8") as f:
        outputs = {name: out["value"] for name, out in json.load(f).items()}

    instance_id = outputs.get("instance_id")
    if not instance_id:
        sys.exit(f"No instance_id in {path}: has terraform apply run?")

    address = (
        os.environ.get("ANSIBLE_HOST_OVERRIDE")
        or outputs.get("instance_public_ip")
        or outputs.get("instance_private_ip")
    )
    return {
        "taskflow_app": {"hosts": [instance_id]},
        "_meta": {
            "hostvars": {
                instance_id: {
                    "ansible_host": address,
                    "ansible_user": outputs.get("ssh_user", "ubuntu"),
                    "instance_public_ip": outputs.get("instance_public_ip"),
                    "instance_private_ip": outputs.get("instance_private_ip"),
                }
            }
        },
    }


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--host":
        print("{}")  # all host vars are returned in _meta
    else:
        print(json.dumps(build_inventory(), indent=2))
