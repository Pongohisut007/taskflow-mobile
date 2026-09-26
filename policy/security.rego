package taskflow.security

import rego.v1

# Input: the JSON report from `npm audit --json` (backend/npm-audit.json).
# Rules with the same name are OR'ed: any matching clause denies the build.

# Clause 1: the audit summary counts at least one critical vulnerability.
deny contains msg if {
	critical := input.metadata.vulnerabilities.critical
	critical > 0
	msg := sprintf("dependency scan reports %d CRITICAL vulnerabilities", [critical])
}

# Clause 2: a specific package in the report is rated critical.
deny contains msg if {
	some name, vuln in input.vulnerabilities
	vuln.severity == "critical"
	msg := sprintf("package %q has a CRITICAL vulnerability", [name])
}