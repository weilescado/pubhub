#!/usr/bin/env python3
import requests
import time
import sqlite3
import json
import datetime

BASE = "http://localhost:3000/api"
OUTPUT = "scripts/reviews_output.txt"

def find_test_user():
    r = requests.get(BASE + "/admin/stats")
    r.raise_for_status()
    users = r.json()
    for u in users:
        if u.get('email','').startswith('test+'):
            return u['id'], u['email']
    # fallback: return most recent
    if users:
        return users[0]['id'], users[0]['email']
    return None, None

def get_progress(user_id):
    r = requests.get(BASE + "/admin/user_detail", params={"userId": user_id})
    r.raise_for_status()
    return r.json().get('progress', [])

# Try to parse KP list from step-config.js to supply as requirements
def parse_kps():
    try:
        with open('step-config.js','r',encoding='utf-8') as f:
            txt = f.read()
    except Exception:
        return {}
    out = {}
    # crude parse: find sX blocks and their kps arrays
    import re
    blocks = re.findall(r"(s\d+)\s*:\s*\{([\s\S]*?)\}\s*,?\n", txt)
    for key, body in blocks:
        kps = re.findall(r"kps\s*:\s*\[([^\]]*)\]", body)
        if kps:
            items = re.findall(r'"(KP[0-9]+)"|KP[0-9]+', kps[0])
            # fallback split
            raw = kps[0]
            cleaned = [p.strip().strip('\"\'') for p in raw.split(',') if p.strip()]
            out[key] = cleaned
    return out


def insert_fallback_review(user_id, step_id, task_id, feedback):
    now = datetime.datetime.now().isoformat()
    # direct sqlite insert
    conn = sqlite3.connect('publishing_lab.db')
    c = conn.cursor()
    c.execute("INSERT INTO reviews (user_id, step_id, task_id, feedback, created_at) VALUES (?, ?, ?, ?, ?)",
              (user_id, step_id, task_id, feedback, now))
    conn.commit()
    conn.close()


def main():
    with open(OUTPUT,'w',encoding='utf-8') as out:
        out.write('开始为每个步骤请求 AI 评审\n')
        user_id, email = find_test_user()
        out.write(f'选定用户: {email} ({user_id})\n')
        if not user_id:
            out.write('未找到用户，退出\n')
            return
        progress = get_progress(user_id)
        kps_map = parse_kps()
        for p in progress:
            step_id = p.get('step_id')
            data = p.get('data')
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except:
                    pass
            content = json.dumps(data, ensure_ascii=False)
            task_id = (data.get('tasks') or [{}])[0].get('id','')
            requirements = '知识点: ' + ','.join(kps_map.get(step_id, []))
            payload = {
                'userId': user_id,
                'stepId': step_id,
                'taskId': task_id,
                'content': content,
                'requirements': requirements
            }
            try:
                out.write(f'调用 /api/ai-review for {step_id}...\n')
                r = requests.post(BASE + '/ai-review', json=payload, timeout=20)
                out.write(f'result code: {r.status_code}\n')
                try:
                    j = r.json()
                    out.write(json.dumps(j, ensure_ascii=False) + '\n')
                    if r.ok and j.get('result'):
                        out.write(f'已保存 AI 评审（来自服务） for {step_id}\n')
                        time.sleep(0.5)
                        continue
                    else:
                        out.write(f'服务返回错误或无结果，将回退写入 DB。\n')
                except Exception as e:
                    out.write('解析 JSON 失败: ' + str(e) + '\n')
                # fallback: insert a simple generated feedback
                fb = f'自动回退评审：步骤 {step_id} 的作业已检查。要点：完成标记。建议：补充细节并提交样章。'
                insert_fallback_review(user_id, step_id, task_id, fb)
                out.write(f'已回退写入 reviews 表 for {step_id}\n')
            except Exception as e:
                out.write('请求 /api/ai-review 失败: ' + str(e) + '\n')
                fb = f'自动回退评审（异常）：步骤 {step_id}。错误：{e}'
                try:
                    insert_fallback_review(user_id, step_id, task_id, fb)
                    out.write(f'已回退写入 reviews 表 for {step_id}\n')
                except Exception as ie:
                    out.write('回退写入 DB 失败: ' + str(ie) + '\n')
        out.write('全部步骤处理完成\n')

if __name__ == '__main__':
    main()
