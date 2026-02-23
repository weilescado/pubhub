#!/usr/bin/env python3
import requests
import time
import uuid
import sys

BASE = "http://localhost:3000/api"

def wait_health(timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = requests.get(BASE + "/health", timeout=2)
            if r.ok:
                j = r.json()
                if j.get('app'):
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False

if not wait_health(15):
    print("服务未就绪：无法连接到 /api/health")
    sys.exit(1)

email = f"test+{int(time.time())}@example.com"
password = "Passw0rd!"
print(f"注册测试账号: {email}")

# Register
r = requests.post(BASE + "/register", json={"email": email, "password": password})
print("/register =>", r.status_code, r.text)
if r.status_code not in (200, 201):
    if r.status_code == 409:
        print("邮件已存在，继续尝试登录")
    else:
        print("注册失败，退出")
        sys.exit(1)

# Login
r = requests.post(BASE + "/login", json={"email": email, "password": password})
print("/login =>", r.status_code, r.text)
if not r.ok:
    print("登录失败，退出")
    sys.exit(1)

user = r.json().get('user')
if not user:
    print("未从登录响应获取用户信息，退出")
    sys.exit(1)

user_id = user['id']
print("已登录，userId:", user_id)

# Simulate progress for s1..s9
for i in range(1,10):
    step_id = f"s{i}"
    now = time.strftime('%Y-%m-%dT%H:%M:%S')
    # Create sample task completions
    data = {
        "completed": True,
        "completed_at": now,
        "notes": f"自动化测试：已完成 {step_id}",
        "tasks": [
            {"id": f"{step_id}-t1", "status": "done"},
            {"id": f"{step_id}-t2", "status": "done"}
        ]
    }
    r = requests.post(BASE + "/save_progress", json={"userId": user_id, "stepId": step_id, "data": data})
    print(f"保存 {step_id} =>", r.status_code, r.text)
    time.sleep(0.2)

# Query user detail
r = requests.get(BASE + "/admin/user_detail", params={"userId": user_id})
print("/admin/user_detail =>", r.status_code)
try:
    print(r.json())
except Exception:
    print(r.text)

# Query admin stats (to show user in list)
r = requests.get(BASE + "/admin/stats")
print("/admin/stats =>", r.status_code)
try:
    print(r.json())
except Exception:
    print(r.text)

print("脚本执行完毕")
