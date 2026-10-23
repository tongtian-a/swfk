"""sfwk-e27ae 服务端验证：开启邮箱密码登录 → 建测试用户 → Firestore 读写 → 模拟网页登录。

用法：python verify_server.py
密钥：../secrets/sfwk-service-account.json（不放在网页目录，绝不提交仓库）
"""

import io
import json
import sys
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials, firestore
from google.oauth2 import service_account

HERE = Path(__file__).resolve().parent
KEY_PATH = HERE.parent / "secrets" / "sfwk-service-account.json"
PROJECT_ID = "sfwk-e27ae"
WEB_API_KEY = "AIzaSyDXJNMjblCYyzbIlOlMoS6EzMMMG8rlZ3Y"
TEST_EMAIL = "butler@test.local"
TEST_PASSWORD = "Test12345!"

results = []


def step(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  —— {detail}" if detail else ""))


# ---------- 0. 加载密钥 ----------
try:
    sa = service_account.Credentials.from_service_account_file(
        str(KEY_PATH),
        scopes=[
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/identitytoolkit",
            "https://www.googleapis.com/auth/firebase",
            "https://www.googleapis.com/auth/datastore",
        ],
    )
    from google.auth.transport.requests import Request as GoogleRequest
    sa.refresh(GoogleRequest())
    step("加载服务账号密钥并获取访问令牌", True, sa.service_account_email)
except Exception as e:
    step("加载服务账号密钥", False, str(e))
    sys.exit(1)


def admin_api(method, path, body=None):
    url = f"https://identitytoolkit.googleapis.com/admin/v2/{path}"
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Goog-User-Project": PROJECT_ID,
        "Authorization": f"Bearer {sa.token}",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# ---------- 1. 开启邮箱/密码登录方式 ----------
status, cfg = admin_api("GET", f"projects/{PROJECT_ID}/config")
enabled = False
if status == 200:
    sign_in = cfg.get("signIn", {})
    email_cfg = sign_in.get("email", {})
    enabled = bool(email_cfg.get("enabled"))
    step("读取当前 Auth 配置", True, f"email 已启用: {enabled}")
    if not enabled:
        status, _ = admin_api(
            "PATCH",
            f"projects/{PROJECT_ID}/config?updateMask=signIn.email",
            {"signIn": {"email": {"enabled": True, "passwordRequired": True}}},
        )
        enabled = status == 200
        step("启用邮箱/密码登录方式", enabled,
             "已通过 Admin API 启用" if enabled else f"HTTP {status}，需要手动在控制台开启")
else:
    step("读取 Auth 配置", False, f"HTTP {status}: {str(cfg)[:200]}")

# ---------- 2. 初始化 Admin SDK ----------
cred = credentials.Certificate(str(KEY_PATH))
firebase_admin.initialize_app(cred, {"projectId": PROJECT_ID})
auth_client = fb_auth.Client(firebase_admin.get_app(), PROJECT_ID)

# ---------- 3. 建测试用户 ----------
try:
    user = auth_client.create_user(
        email=TEST_EMAIL, password=TEST_PASSWORD, display_name="管家测试号")
    step("创建测试用户", True, user.uid)
except fb_auth.EmailAlreadyExistsError:
    user = auth_client.get_user_by_email(TEST_EMAIL)
    step("测试用户已存在", True, user.uid)
except Exception as e:
    user = None
    step("创建测试用户", False, str(e))

# ---------- 4. Firestore 读写 ----------
if user:
    try:
        db = firestore.client()
        ref = db.collection("users").document(user.uid).collection("todos")
        doc_ref = ref.add({"text": "[服务端验证] 示例任务", "done": False,
                           "createdAt": firestore.SERVER_TIMESTAMP})[1]
        got = doc_ref.get().to_dict()
        assert got["text"] == "[服务端验证] 示例任务"
        doc_ref.delete()
        step("Firestore 写入→读取→清理", True, f"users/{user.uid}/todos")
    except Exception as e:
        msg = str(e)
        step("Firestore 读写", False,
             (msg[:200] + "……可能是 Firestore 数据库尚未创建，"
              "请在控制台 → Firestore Database → 创建数据库") if "NOT_FOUND" in msg else msg[:200])

# ---------- 5. 模拟网页端登录（走用户的 Web API key） ----------
def client_api(path, body):
    req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/{path}?key={WEB_API_KEY}",
        data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8", "replace"))

if user:
    status, resp = client_api("accounts:signInWithPassword", {
        "email": TEST_EMAIL, "password": TEST_PASSWORD, "returnSecureToken": True})
    if status == 200:
        step("网页端邮箱密码登录（Identity Toolkit REST）", True,
             f"获得 idToken（前 20 字符 {resp['idToken'][:20]}…）")
    else:
        err = resp.get("error", {}).get("message", str(resp))
        step("网页端邮箱密码登录", False, err)

# ---------- 汇总 ----------
print()
fails = [r for r in results if not r[1]]
print(f"共 {len(results)} 项，通过 {len(results) - len(fails)} 项" + ("" if not fails else f"，失败 {len(fails)} 项"))
sys.exit(1 if fails else 0)
