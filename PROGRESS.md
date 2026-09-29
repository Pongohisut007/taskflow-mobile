# PROGRESS — Lab 10 Capstone (Jenkins CI/CD Workshop)

อัปเดตล่าสุด: **2026-09-27 17:10** (หยุดพักงานไว้ตรงนี้) · branch ที่ใช้พัฒนา: `nongao/lab10` · merge เข้า `main` แล้ว 3 ครั้ง (PR #8, #9, #10)

---

## 1. เป้าหมายของงาน

ทำ Lab 10 "Capstone: End-to-End Pipeline" ตามคู่มือ `D:\claude\jenkin\jenkin-lab.pdf` (หน้า 20–21)

- รวม stage ของ Lab 03–09 ไว้ใน **Jenkinsfile เดียวของ taskflow-api** ให้ stage ที่ไม่ขึ้นต่อกันรันขนาน (lint / unit test / SAST / SCA) และ build → scan → deploy รันตามลำดับ
- ทุก secret ต้องผ่าน `withCredentials` / `credentials()` เมื่อรัน `grep -R "password\|secret\|token" Jenkinsfile` ต้องไม่เจอค่าจริง
- **Jenkinsfile ของ taskflow-mobile (Flutter)**: `flutter analyze`, `flutter test --coverage`, osv-scanner, debug APK ทุก branch และ **release AAB ที่ sign แล้ว** เฉพาะ `main`
- ทั้งสอง pipeline รันบน **Kubernetes dynamic agent ของ Lab 09** เท่านั้น ห้ามมี static container
- **Pipeline Health Gate** ก่อน Deploy — Production: อ่าน Prometheus แล้ว abort ถ้า success rate ของ 20 build ล่าสุดต่ำกว่า 90%
- Notification (เลือกใช้ **email ผ่าน Gmail**) ตอน success/failure พร้อมชื่อ branch และ build URL
- แผนภาพสถาปัตยกรรมหนึ่งหน้า และ **rollback runbook**
- Demo สด 10 นาที: push change จริง และให้เห็น gate อย่างน้อย 1 ตัว block change ที่ไม่ดี
- รายงานลง `D:\claude\jenkin\Lab 01.docx` ใต้หัวข้อ "Lab10" (ผู้ใช้แคปรูป ผมใส่ให้) และเพิ่ม Lab 10 ใน `D:\claude\jenkin\สรุปแต่ละ lab.docx`

เกณฑ์คะแนน: gate ครบ/เรียงถูก/ขนาน 30 · ไม่มี secret ใน Jenkinsfile 15 · mobile build + sign ถูกต้อง 20 · health gate block deploy ได้จริง 15 · runbook ใช้ได้จริง 10 · walkthrough ตรงกับของจริง 10

## 2. สิ่งที่ทำเสร็จแล้ว

### ไฟล์ใน repo (merge เข้า main แล้ว)
| ไฟล์ | สถานะ | รายละเอียด |
|---|---|---|
| `Jenkinsfile` | เขียนใหม่ | pipeline ของ API อยู่ใน pod เดียว; parallel `Lint, Test & Scan` (failFast); kaniko; Trivy; Terraform Plan; บน main: Approval → Apply → Ansible → Health Gate → Deploy blue/green + auto rollback; emailext; kubectl ใส่ `-n default` |
| `k8s/ci/api-build-pod.yaml` | ใหม่ | pod template 12 container มี cache npm/trivy แบบ hostPath |
| `ci/pipeline-health.mjs` | ใหม่ | Health Gate อ่าน `default_jenkins_builds_build_result_ordinal{jenkins_job,number}` (per-build) แล้วนับ SUCCESS ใน 20 build ล่าสุด; fail closed |
| `ci/images/ansible/Dockerfile` | ใหม่ | image `localhost:5001/ci-ansible:26.9.0` push ไว้ใน local registry แล้ว |
| `frontend/Jenkinsfile` | ใหม่ | pipeline ของ mobile |
| `frontend/ci/mobile-build-pod.yaml` | ใหม่ | `ghcr.io/cirruslabs/flutter:3.44.0`, limit 4Gi, cache ของ gradle/pub/NDK/CMake |
| `frontend/android/app/build.gradle.kts` | แก้ | release signingConfig อ่านค่าจาก env ถ้าไม่มีจะใช้ debug |
| `frontend/pubspec.yaml`, `pubspec.lock` | แก้ | Dart SDK `^3.12.2` เปลี่ยนเป็น `^3.12.0` (เวอร์ชัน package ไม่เปลี่ยน) |
| `backend/src/**` (12 ไฟล์) | แก้ | แก้ prettier lint error 17 จุด (format อย่างเดียว) |
| compose 3 ไฟล์ (`infra/terraform`, `infra/ansible`, `monitoring`) | แก้ | เพิ่ม network `kind` |
| `docs/lab10/architecture.svg/.png`, `make_architecture.py` | ใหม่ | แผนภาพหนึ่งหน้า |
| `docs/lab10/rollback-runbook.md` | ใหม่ | runbook ตอน deploy ล้ม (§5 อัปเดตให้ตรงกับ gate แบบ per-build แล้ว) |

### ไฟล์ที่ยังไม่ได้ commit
- `frontend/ci/mobile-build-pod.yaml`: เพิ่ม `nodeSelector: kubernetes.io/hostname: taskflow-worker` (ให้ใช้ cache บน node เดียว)
- `lab10-evidence/`: `main-7-approval-apply-console.txt`, `main-8-deploy-success-console.txt`, `main-9-health-gate-blocked-console.txt`, `slo-window-reset.md`
- `PROGRESS.md` (ไฟล์นี้)

### ตั้งค่าใน Jenkins / cluster (ไม่ได้อยู่ใน repo)
- job `taskflow/mobile` (multibranch, script path `frontend/Jenkinsfile`) คัดลอก credential `github-token` เข้า folder `mobile` แล้ว (เดิมอยู่แค่ใน `lab4` ทำให้ mobile เรียก GitHub แบบ anonymous แล้วโควต้าหมด)
- credential: `android-upload-keystore`, `android-keystore-password`, `android-key-password`, `gmail-smtp` (**App Password ใช้ได้แล้ว ส่งเมลทดสอบสำเร็จ**)
  - keystore จริงอยู่ที่ `C:\Users\fstat\.taskflow-android\`
- Prometheus plugin: `perBuildMetrics=true`, max 20 build, เก็บข้อมูลทุก 30 วินาที
- Kubernetes cloud `kind`: TCP `jenkins:50000` (ไม่ใช้ WebSocket แล้ว), cap 4
- Kubernetes Secret `jenkins-agents/taskflow-ci-db`
- ล้างประวัติ `taskflow/lab4/main` #1–#9 แล้ว (reset SLO window ตามที่ผู้ใช้เลือก เหตุผลอยู่ใน `lab10-evidence/slo-window-reset.md`)

### ผลที่พิสูจน์แล้ว
| สิ่งที่ทดสอบ | ผล |
|---|---|
| API บน branch (#5) | SUCCESS ทุก gate: unit 17/17, E2E 4/4, npm audit 0, OPA ALLOW, Trivy, Sonar QG |
| Mobile บน branch (#3) | SUCCESS: analyze, test, osv-scanner, debug APK |
| main #7 | **Approval โดยคนจริง** → Terraform Apply → Ansible ผ่าน (Deploy ล้มเพราะ bug namespace ซึ่งแก้แล้ว) |
| main #8 | Health Gate ผ่าน → **Deploy blue/green สำเร็จ** (green → blue, `taskflow-api:02c0232`) |
| main #9 | **Health Gate block deploy จริง** (4/8 = 50% < 90%), production ไม่ถูกแตะ |
| อีเมล | Gmail SMTP ส่งได้แล้ว |
| checklist secret | grep เจอแค่ comment, ID ของ credential และชื่อตัวแปร |

ผู้ใช้แคปรูปแล้ว: หน้า Approval (#7), main #8 deploy สำเร็จ, main #9 Stage View และ console ของ health gate

## 3. งานที่ค้าง / ปัญหาที่ยังเหลือ

1. **API main #10 ยังรันอยู่** (ตอน 17:10 อยู่ที่ Terraform Plan) เป็นรอบแรกหลัง reset ควรผ่าน gate แล้ว deploy สลับ blue → green ต้องเช็คผล
2. **Mobile บน main ยังไม่ผ่าน**: #2 ล้มที่ Debug APK เพราะดาวน์โหลด NDK ใน pod แล้วไฟล์เสีย (`Archive is not a ZIP archive`) เน็ตกระตุก
   - แก้แล้วบางส่วน: โหลด NDK r28c และ CMake 3.22.1 บนเครื่องไว้แล้ว (**zip ผ่านการตรวจแล้ว**) ที่
     `C:\Users\fstat\.taskflow-android\sdk-cache\` (`android-ndk-r28c-linux.zip`, `cmake-3.22.1-linux.zip`)
   - **ยังไม่ได้คัดลอกเข้า node** และยังไม่ได้ลบโฟลเดอร์ NDK ที่เสียค้างอยู่ใน `taskflow-worker:/var/cache/jenkins-flutter/ndk/28.2.13676358`
3. ยังไม่ได้ทดสอบ **Release AAB ที่ sign แล้ว** บน main (ขึ้นกับข้อ 2)
4. ไฟล์ที่ยังไม่ได้ commit (ดูหัวข้อ 2)
5. ยังไม่ได้ทำ demo script, PDF หนึ่งหน้า, รายงานใน `Lab 01.docx` และสรุปใน `สรุปแต่ละ lab.docx`

## 4. งานที่เหลือ (เรียงตามลำดับ)

1. เช็คผล **API main #10**: ต้อง SUCCESS, gate ผ่าน และ `kubectl get svc taskflow` เป็นสีใหม่
2. **ติดตั้ง NDK/CMake เข้า cache ของ `taskflow-worker`**:
   - ลบ `/var/cache/jenkins-flutter/ndk/28.2.13676358` (ไฟล์เสีย)
   - `docker cp` zip ทั้ง 2 ไฟล์เข้า node แล้ว unzip ไปที่ `/var/cache/jenkins-flutter/ndk/28.2.13676358/` (เนื้อหาของ `android-ndk-r28c/`) และ `/var/cache/jenkins-flutter/cmake/3.22.1/`
   - ต้องมี `source.properties` อยู่ในแต่ละโฟลเดอร์ (AGP ใช้เช็คว่าติดตั้งแล้ว)
3. commit `nodeSelector` + `lab10-evidence/` → PR → merge
4. รัน **mobile บน main** → เช็คว่า Release AAB ผ่าน `jarsigner` และ `aab-signer.txt` แสดง `CN=TaskFlow Upload` ไม่ใช่ `CN=Android Debug`
   - **อย่ารันพร้อมกับ API**
5. Demo "gate block": มีหลักฐานจาก main #9 แล้ว ถ้าจะ demo สดอีกครั้ง ให้ push commit ที่ทำให้ test ล้มเข้า main แล้วดู Lint/Unit Test block (หรือทำให้ health rate ต่ำจน gate block) แล้ว revert
6. เขียน `docs/lab10/demo-script.md` (narration 10 นาที ตามลำดับ stage)
7. รวม PDF หนึ่งหน้า: แผนภาพ + runbook
8. ผู้ใช้แคปรูปที่เหลือ (mobile main: Stage View, Release AAB, `aab-signer.txt`, อีเมลแจ้งเตือน, Grafana) → ผมใส่ลง `Lab 01.docx` ใต้ "Lab10" (ต้องปิดไฟล์ใน Word ก่อน และสำรองไฟล์ก่อน)
9. เพิ่ม Lab 10 ใน `สรุปแต่ละ lab.docx` (ใช้ builder แบบ `sum9/build_lab09.py` สำรองไฟล์ก่อน, 9 labs/31 ชม. → 10 labs/35 ชม.)
10. ลบ API token `~/.jenkins-lab9` หลังจบงาน

## 5. การตัดสินใจสำคัญ / ข้อควรระวัง

- **RAM จำกัด**: Docker ได้ 8 GB (`~/.wslconfig`) เคยล่มมาแล้ว 2 ครั้ง ให้รันทีละ pipeline ปิด Grafana / jenkins-agent ไว้ jest ใช้ `--maxWorkers=2` pod มี memory limit ทุกตัว
- **เน็ตไม่เสถียร** (PyPI, npm, ดาวน์โหลดไฟล์ใหญ่): อย่าโหลดของใหญ่ใน pod ตอน build ให้เตรียมไว้ก่อนเป็น image หรือ cache (ตัวอย่างคือ ci-ansible และ NDK)
- **Health Gate**: ใช้ per-build metrics เพราะตัวนับ `*_build_count` ของ plugin ถูกรีเซ็ตตอน Jenkins restart และบางครั้งมองไม่เห็นการรีเซ็ต (เคยนับผิดเป็น 1/1) build ที่ถูก gate block จะนับเป็น FAILURE ด้วย ถ้า rate ต่ำแล้วจะติด block ต่อเนื่องจนมี SUCCESS ≥ 18 จาก 20
- **กด Abort หรือยกเลิก build บน main ทำให้ health rate ลดลง** ห้ามยกเลิก build บน main เล่นๆ (build ของ `nongao/lab10` ยกเลิกได้ ไม่มีผล)
- **stage ที่ทำเฉพาะ main**: Approval / Apply / Ansible / Health Gate / Deploy / Release AAB ไม่มีทางลัด; Approval ต้องให้คนกดภายใน 15 นาที จะขึ้นก็ต่อเมื่อ Terraform มีการเปลี่ยนแปลงเท่านั้น
- **kubectl ใน pod** ต้องใส่ `-n default` ไม่อย่างนั้นจะไปใช้ namespace ของ pod (`jenkins-agents`)
- **ไฟล์ที่ root เขียน** (cosign, terraform) ต้อง `chmod a+r` ก่อน archive
- **Flutter image pin เป็น 3.44.0**; pod ของ mobile ต้องรันบน `taskflow-worker` (cache อยู่ที่ node นี้)
- **Registry**: push ไปที่ `kind-registry:5000`, deploy ด้วยชื่อ `localhost:5001` คือ registry เดียวกัน ไม่มี auth
- **LocalStack** เก็บข้อมูลใน memory restart แล้ว state หาย และ plan จะเป็น `4 to add` → ต้องมีคนกด Approval
- **merge เข้า main**: ทำผ่าน PR ด้วย GitHub API (ใช้ credential ของ git ในเครื่อง) ผู้ใช้อนุญาตแล้ว ทุกครั้งที่ push ขึ้น lab10 scan จะสั่ง build ของ lab10 ขึ้นมาด้วย ให้ยกเลิกตัวนั้นเพื่อประหยัด RAM
- **เปิดงานใหม่หลังพัก**: เปิด Docker Desktop → `docker start sonarqube taskflow-localstack prometheus taskflow-target` (kind และ jenkins ขึ้นเองอยู่แล้ว) → เช็ค `kubectl get nodes`
- Jenkins API token: `~/.jenkins-lab9` · สคริปต์ช่วยอยู่ใน scratchpad `jgroovy.sh` (รัน groovy ผ่าน script console)
- ทางเข้า: Jenkins http://localhost:8080 · Prometheus http://localhost:9090 · Grafana http://localhost:3001 (ปิดอยู่)
