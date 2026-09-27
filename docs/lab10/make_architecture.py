"""Draws docs/lab10/architecture.svg (+ .png): both Lab 10 pipelines, every gate, in order.

Run: python docs/lab10/make_architecture.py   (PNG needs PyMuPDF: pip install pymupdf)
"""
from pathlib import Path
from xml.sax.saxutils import escape

W, H = 1680, 1060
INK, MUTED, LINE = "#1f2328", "#57606a", "#8c959f"
SURFACE, PANEL = "#ffffff", "#f6f8fa"
STAGE_FILL, STAGE_EDGE = "#ddeafb", "#2f6fbd"      # ordinary stage
GATE_FILL, GATE_EDGE = "#fde2e1", "#c62828"        # stops the pipeline when it fails
MAIN_FILL, MAIN_EDGE = "#fff4d6", "#b7791f"        # runs on main only
FONT = "Segoe UI, Leelawadee UI, Arial, sans-serif"

out = []


def text(x, y, s, size=13, weight="normal", fill=INK, anchor="middle"):
    out.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
               f'text-anchor="{anchor}" font-family="{FONT}">{escape(s)}</text>')


def box(x, y, w, h, title, sub=None, kind="stage"):
    fill, edge = {"stage": (STAGE_FILL, STAGE_EDGE), "gate": (GATE_FILL, GATE_EDGE),
                  "main": (MAIN_FILL, MAIN_EDGE), "maingate": (MAIN_FILL, GATE_EDGE)}[kind]
    dash = ' stroke-dasharray="6 3"' if kind in ("main", "maingate") else ""
    width = 2.5 if kind in ("gate", "maingate") else 1.5
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{edge}" stroke-width="{width}"{dash}/>')
    cy = y + h / 2 + (-4 if sub else 5)
    text(x + w / 2, cy, title, 13, "600")
    if sub:
        text(x + w / 2, cy + 17, sub, 11, fill=MUTED)
    return (x, y, w, h)


def arrow(x1, y1, x2, y2):
    out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{LINE}" stroke-width="2" marker-end="url(#a)"/>')


def right(b):
    return b[0] + b[2], b[1] + b[3] / 2


def left(b):
    return b[0], b[1] + b[3] / 2


def chain(boxes):
    for a, b in zip(boxes, boxes[1:]):
        arrow(*right(a), *left(b))


out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
out.append('<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
           f'<path d="M0,0 L10,5 L0,10 z" fill="{LINE}"/></marker></defs>')
out.append(f'<rect width="{W}" height="{H}" fill="{SURFACE}"/>')
text(40, 44, "TaskFlow — Lab 10 end-to-end pipeline (two Jenkinsfiles, every gate in order)", 24, "700", anchor="start")
text(40, 70, "Code → Commit → Build → Test → Stage → Deploy → Monitor · every stage runs in an ephemeral pod on the kind Kubernetes cloud (Lab 09)", 14, fill=MUTED, anchor="start")

# ---------------- API pipeline ----------------
out.append(f'<rect x="24" y="92" width="{W-48}" height="560" rx="12" fill="{PANEL}" stroke="#d0d7de"/>')
text(44, 122, "taskflow-api · Jenkinsfile · job taskflow/lab4 · pod k8s/ci/api-build-pod.yaml", 16, "700", anchor="start")

y1 = 150
r1 = [box(44, y1, 120, 56, "Checkout", "git push / PR"),
      box(196, y1, 130, 56, "Secrets", "gitleaks", "gate"),
      box(358, y1, 120, 56, "Install", "npm ci")]
chain(r1)
# parallel block
px, py, pw, ph = 520, 138, 1116, 196
out.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="10" fill="none" stroke="{STAGE_EDGE}" stroke-dasharray="4 4"/>')
text(px + 12, py + 20, "Lint, Test & Scan — parallel, failFast", 13, "700", STAGE_EDGE, anchor="start")
arrow(*right(r1[-1]), px, y1 + 28)
par = [("Lint", "eslint"), ("Unit Test", "jest + coverage"), ("SAST", "eslint-security"), ("Semgrep", "OWASP rules"),
       ("SCA", "npm audit"), ("Terraform", "validate + fmt"), ("Ansible Lint", "production"),
       ("tfsec", "IaC scan"), ("checkov", "IaC scan")]
for i, (t, s) in enumerate(par):
    col, row = i % 5, i // 5
    # SAST and Semgrep only report findings; everything else here fails the build.
    box(px + 14 + col * 220, py + 34 + row * 78, 204, 60, t, s, "stage" if t in ("SAST", "Semgrep") else "gate")

y2 = 372
r2 = [box(44, y2, 150, 60, "SBOM & Sign", "syft + cosign"),
      box(226, y2, 140, 60, "Policy Gate", "OPA", "gate"),
      box(398, y2, 150, 60, "SonarQube", "analysis"),
      box(580, y2, 150, 60, "Quality Gate", "coverage ≥ 70%", "gate"),
      box(762, y2, 150, 60, "E2E", "API + postgres pod", "gate"),
      box(944, y2, 150, 60, "Build Image", "kaniko, tag = SHA"),
      box(1126, y2, 160, 60, "Container Scan", "Trivy HIGH/CRIT", "gate"),
      box(1318, y2, 160, 60, "Terraform Plan", "archive tfplan")]
chain(r2)
out.append(f'<path d="M {px + pw / 2} {py + ph} L {px + pw / 2} {py + ph + 14} L 119 {py + ph + 14} L 119 {y2}" '
           f'fill="none" stroke="{LINE}" stroke-width="2" marker-end="url(#a)"/>')

y3 = 510
text(150, y3 - 14, "main branch only", 13, "700", MAIN_EDGE, anchor="start")
r3 = [box(44, y3, 170, 64, "Approval", "input · human, 15 min", "maingate"),
      box(246, y3, 170, 64, "Terraform Apply", "approved tfplan", "main"),
      box(448, y3, 190, 64, "Configure w/ Ansible", "dynamic inventory", "main"),
      box(670, y3, 210, 64, "Pipeline Health Gate", "Prometheus: last 20 ≥ 90%", "maingate"),
      box(912, y3, 250, 64, "Deploy — Production", "blue/green + smoke test", "maingate"),
      box(1194, y3, 190, 64, "Auto rollback", "post.failure → old colour", "main"),
      box(1416, y3, 200, 64, "Email", "success / failure", "stage")]
chain(r3[:5])
out.append(f'<line x1="{right(r3[4])[0]}" y1="{right(r3[4])[1]}" x2="{r3[5][0]}" y2="{right(r3[4])[1]}" stroke="{GATE_EDGE}" '
           f'stroke-width="2" stroke-dasharray="5 3" marker-end="url(#a)"/>')
text(1178, y3 - 4, "on failure", 11, fill=GATE_EDGE)
out.append(f'<path d="M {1318 + 80} {y2 + 60} L {1318 + 80} {y2 + 88} L 129 {y2 + 88} L 129 {y3}" fill="none" '
           f'stroke="{LINE}" stroke-width="2" marker-end="url(#a)"/>')
text(1516, y3 + 88, "post: every result emails branch + build URL", 11, fill=MUTED)

# ---------------- Mobile pipeline ----------------
my = 676
out.append(f'<rect x="24" y="{my}" width="{W-48}" height="220" rx="12" fill="{PANEL}" stroke="#d0d7de"/>')
text(44, my + 30, "taskflow-mobile · frontend/Jenkinsfile · job taskflow/mobile · pod ghcr.io/cirruslabs/flutter:3.44.0", 16, "700", anchor="start")
m1 = [box(44, my + 90, 120, 60, "Checkout"), box(196, my + 90, 130, 60, "Pub Get", "flutter pub get")]
chain(m1)
qx, qy, qw, qh = 368, my + 52, 560, 136
out.append(f'<rect x="{qx}" y="{qy}" width="{qw}" height="{qh}" rx="10" fill="none" stroke="{STAGE_EDGE}" stroke-dasharray="4 4"/>')
text(qx + 12, qy + 20, "Analyze, Test & SCA — parallel, failFast", 13, "700", STAGE_EDGE, anchor="start")
arrow(*right(m1[-1]), qx, my + 120)
for i, (t, s) in enumerate([("Analyze", "flutter analyze"), ("Unit Test", "flutter test --coverage"), ("SCA", "osv-scanner")]):
    box(qx + 14 + i * 182, qy + 44, 168, 64, t, s, "gate")
m2 = [box(970, my + 90, 190, 60, "Debug APK", "every branch"),
      box(1192, my + 84, 250, 72, "Release AAB", "signed · jarsigner verified", "maingate"),
      box(1474, my + 90, 140, 60, "Email", "success / failure")]
arrow(qx + qw, my + 120, 970, my + 120)
chain(m2)

# ---------------- Legend + shared services ----------------
ly = 918
box(40, ly, 150, 40, "Stage")
box(206, ly, 190, 40, "Gate (fails the build)", kind="gate")
box(412, ly, 170, 40, "main branch only", kind="main")
box(598, ly, 220, 40, "Gate on main only", kind="maingate")
text(40, ly + 76, "Shared services (on Docker network kind): Jenkins controller · kind cluster (agent pods, blue/green taskflow) · registry kind-registry:5000 (= localhost:5001) · "
     "SonarQube · Prometheus + Grafana · LocalStack (Terraform state in S3) · taskflow-target (Ansible host)", 13, fill=MUTED, anchor="start")
text(40, ly + 100, "Secrets: Jenkins credentials only (cosign-key/password, SONAR_AUTH_TOKEN, kind-kubeconfig, taskflow-ssh, android-upload-keystore, "
     "android-keystore/key-password) + Kubernetes Secret taskflow-ci-db", 13, fill=MUTED, anchor="start")
out.append("</svg>")

here = Path(__file__).parent
svg = here / "architecture.svg"
svg.write_text("\n".join(out), encoding="utf-8")
print("wrote", svg)
try:
    import pymupdf
    doc = pymupdf.open(svg)
    page = doc[0]
    page.get_pixmap(dpi=110).save(here / "architecture.png")
    print("wrote", here / "architecture.png")
except ImportError:
    print("pymupdf not installed; PNG skipped")
