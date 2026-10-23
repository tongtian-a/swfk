"""诊断 sfwk-e27ae 的 Auth/Firestore API 状态。"""
import io
import json
import sys
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from google.oauth2 import service_account
from google.auth.transport.requests import Request as GRequest

HERE = Path(__file__).resolve().parent
KEY = HERE.parent / "secrets" / "sfwk-service-account.json"
PID = "sfwk-e27ae"

sa = service_account.Credentials.from_service_account_file(
    str(KEY), scopes=["https://www.googleapis.com/auth/cloud-platform"])
sa.refresh(GRequest())
print("SA:", sa.service_account_email, "| token len:", len(sa.token))

def call(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json", "Accept": "application/json",
        "X-Goog-User-Project": PID, "Authorization": f"Bearer {sa.token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]

print("\n== 服务启用状态 ==")
for svc in ["identitytoolkit.googleapis.com", "firebaseauth.googleapis.com",
            "firestore.googleapis.com", "firebase.googleapis.com"]:
    s, b = call("GET", f"https://serviceusage.googleapis.com/v1/projects/{PID}/services/{svc}")
    print(svc, "->", s, b[:160])

print("\n== firebaseauth v2 REST 直接建用户 ==")
s, b = call("POST", f"https://firebaseauth.googleapis.com/v2/projects/{PID}/users", {
    "email": "diag@test.local", "password": "Test12345!", "displayName": "diag"})
print(s, b)

print("\n== identitytoolkit admin v2 config ==")
s, b = call("GET", f"https://identitytoolkit.googleapis.com/admin/v2/projects/{PID}/config")
print(s, b)

print("\n== Firestore 独立写测试（绕过规则，用诊断 uid） ==")
try:
    import firebase_admin
    from firebase_admin import credentials as fcred, firestore
    cred = fcred.Certificate(str(KEY))
    firebase_admin.initialize_app(cred, {"projectId": PID})
    db = firestore.client()
    ref = db.collection("diag").document("probe")
    ref.set({"ok": True, "note": "server probe"})
    print("Firestore 写入 OK ->", ref.get().to_dict())
    ref.delete()
    print("Firestore 删除 OK")
except Exception as e:
    print("Firestore 失败:", str(e)[:300])
