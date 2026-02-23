import os
import json
import sqlite3
import hashlib
import uuid
import datetime
import requests
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key")  # Change in production
CORS(app, supports_credentials=True)

@app.route('/')
def index():
    return app.send_static_file('index.html')

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
API_URL = "https://api.deepseek.com/chat/completions"
PORT = int(os.getenv("PORT", 3000))
DB_FILE = "publishing_lab.db"

# --- Database Setup ---
def init_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    c = conn.cursor()
    
    # Users Table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    is_admin INTEGER DEFAULT 0,
                    created_at TEXT
                )''')
    
    # Progress Table (Saves the JSON state for each step)
    c.execute('''CREATE TABLE IF NOT EXISTS progress (
                    user_id TEXT,
                    step_id TEXT,
                    data TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (user_id, step_id),
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )''')

    # AI Reviews Table (Saves specific task reviews)
    c.execute('''CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    step_id TEXT,
                    task_id TEXT,
                    feedback TEXT,
                    suggestions TEXT,
                    created_at TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )''')

    # Assessments Table (stores per-user per-step per-knowledge-point scores)
    c.execute('''CREATE TABLE IF NOT EXISTS assessments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    step_id TEXT NOT NULL,
                    kp TEXT NOT NULL,
                    score REAL,
                    comment TEXT,
                    ai_score REAL,
                    created_at TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )''')
                
    conn.commit()
    conn.close()

init_db()

# --- Helpers ---
def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# --- Auth Routes ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
        
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(password)
    now = datetime.datetime.now().isoformat()
    
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("INSERT INTO users (id, email, password, created_at) VALUES (?, ?, ?, ?)",
                  (user_id, email, hashed_pw, now))
        conn.commit()
        conn.close()
        return jsonify({"message": "Registration successful", "userId": user_id})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already exists"}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    hashed_pw = hash_password(password)
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE email = ? AND password = ?", (email, hashed_pw))
    user = c.fetchone()
    conn.close()
    
    if user:
        return jsonify({
            "message": "Login successful",
            "user": {
                "id": user['id'],
                "email": user['email'],
                "isAdmin": bool(user['is_admin'])
            }
        })
    else:
        return jsonify({"error": "Invalid credentials"}), 401

# --- Data Routes ---
@app.route('/api/save_progress', methods=['POST'])
def save_progress():
    data = request.get_json()
    user_id = data.get('userId')
    step_id = data.get('stepId')
    step_data = data.get('data') # JSON object
    
    if not user_id or not step_id:
        return jsonify({"error": "Missing parameters"}), 400
        
    now = datetime.datetime.now().isoformat()
    json_str = json.dumps(step_data)
    
    conn = None
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute('''INSERT INTO progress (user_id, step_id, data, updated_at) 
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(user_id, step_id) 
                     DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at''',
                  (user_id, step_id, json_str, now))
        conn.commit()
        return jsonify({"message": "Saved"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/load_progress', methods=['GET'])
def load_progress():
    user_id = request.args.get('userId')
    step_id = request.args.get('stepId')
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT data FROM progress WHERE user_id = ? AND step_id = ?", (user_id, step_id))
    row = c.fetchone()
    conn.close()
    
    if row:
        return jsonify(json.loads(row['data']))
    else:
        return jsonify({})

# --- Admin Routes ---
@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    # In a real app, verify admin token here
    conn = get_db()
    c = conn.cursor()
    
    # Get all users
    c.execute("SELECT id, email, created_at FROM users ORDER BY created_at DESC")
    users = [dict(row) for row in c.fetchall()]
    
    # Get progress counts
    stats = []
    for user in users:
        c.execute("SELECT step_id FROM progress WHERE user_id = ?", (user['id'],))
        progress_rows = c.fetchall()
        step_ids = [row['step_id'] for row in progress_rows]
        
        latest_step = ""
        if step_ids:
            # Sort steps to find the latest one (s1, s2, s3...)
            try:
                # Extract number from s1, s2...
                sorted_steps = sorted(step_ids, key=lambda x: int(x.replace('s', '')))
                latest_step = sorted_steps[-1]
            except:
                latest_step = step_ids[-1]

        c.execute("SELECT COUNT(*) as count FROM reviews WHERE user_id = ?", (user['id'],))
        review_count = c.fetchone()['count']
        
        user_stat = user.copy()
        user_stat['progress_steps'] = len(step_ids)
        user_stat['latest_step'] = latest_step
        user_stat['reviews_count'] = review_count
        stats.append(user_stat)
        
    conn.close()
    return jsonify(stats)

@app.route('/api/admin/user_detail', methods=['GET'])
def user_detail():
    user_id = request.args.get('userId')
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT * FROM progress WHERE user_id = ?", (user_id,))
    progress_rows = [dict(row) for row in c.fetchall()]
    
    c.execute("SELECT * FROM reviews WHERE user_id = ?", (user_id,))
    reviews = [dict(row) for row in c.fetchall()]
    
    # Fetch assessments
    c.execute("SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at", (user_id,))
    assessments = [dict(row) for row in c.fetchall()]
    
    conn.close()
    
    # Parse JSON data in progress
    for p in progress_rows:
        try:
            p['data'] = json.loads(p['data'])
        except:
            pass
            
    return jsonify({"progress": progress_rows, "reviews": reviews, "assessments": assessments})

# --- AI Routes ---
@app.route('/api/health', methods=['GET'])
def health():
    status = {
        "app": True,
        "port": PORT,
        "api_key_present": bool(DEEPSEEK_API_KEY),
        "db_ok": False
    }
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT 1")
        conn.close()
        status["db_ok"] = True
    except Exception as e:
        status["db_error"] = str(e)
    return jsonify(status)

SYSTEM_PROMPTS = {
    "AI01": "你是一位国际出版项目顾问。请基于用户输入输出结构化建议：1) 任务目标与关键风险；2) 可执行检查清单；3) 可量化指标与数据字段。若涉及事实或数据，用“待人工确认”标注，不得编造。",
    "AI02": "你是一位版权沟通经理。请将用户输入转化为可外发或可归档的版权沟通文本（如Rights Inquiry、许可申请、条款确认清单）。要求：语气专业、要素完整（语种/地域/期限/费用/联系人），不得虚构授权状态。",
    "AI03": "你是一位中英翻译与质检专家。请对用户输入执行样章翻译或质量检查（漏译、一致性、术语、逻辑连贯），并给出问题清单与修订建议。输出需可直接用于评审与返修。",
    "AI04": "你是一位术语与风格规范专家。请抽取并规范关键术语，给出推荐译法与使用规则，并将其映射到风格表检查项（拼写、标点、大小写、数字/单位、首次出现格式等）。",
    "AI05": "你是一位英文出版编辑与合规审阅员。请对用户文本进行英文润色，并额外检查合规风险（敏感信息、版权表述、AI披露、可外发边界）。输出“润色版本 + 风险与整改建议”。",
    "REVIEW": "你是一位严格的国际出版实训导师。请根据该步骤的【知识点要求】对用户的【作业内容】进行点评。\n请输出两部分内容：\n1. **点评**：指出优点和具体的不足（基于知识点）。\n2. **修改建议**：给出具体可执行的改进措施。\n\n"
}

@app.route('/api/ai-completion', methods=['POST'])
def ai_completion():
    data = request.get_json()
    tool_id = data.get('toolId')
    context = data.get('context')

    if not context or not DEEPSEEK_API_KEY:
        return jsonify({"error": "Invalid request or missing API Key"}), 400

    system_prompt = SYSTEM_PROMPTS.get(tool_id, SYSTEM_PROMPTS.get("DEFAULT", "You are a helpful assistant."))

    try:
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context}
            ],
            "temperature": 0.7
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
        }
        response = requests.post(API_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        return jsonify({"result": response.json()['choices'][0]['message']['content']})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai-review', methods=['POST'])
def ai_review():
    data = request.get_json()
    user_id = data.get('userId')
    step_id = data.get('stepId')
    task_id = data.get('taskId')
    content = data.get('content')
    requirements = data.get('requirements') # Knowledge points text
    
    if not content:
        return jsonify({"error": "Content is empty"}), 400
        
    prompt = f"{SYSTEM_PROMPTS['REVIEW']}\n【知识点要求】：{requirements}\n【作业内容】：{content}"
    
    try:
        payload = {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
        }
        response = requests.post(API_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()['choices'][0]['message']['content']
        
        # Save review to DB; if this fails, still return the review result.
        if user_id:
            conn = None
            try:
                now = datetime.datetime.now().isoformat()
                conn = get_db()
                c = conn.cursor()
                c.execute("INSERT INTO reviews (user_id, step_id, task_id, feedback, created_at) VALUES (?, ?, ?, ?, ?)",
                          (user_id, step_id, task_id, result, now))
                conn.commit()
            except Exception as db_error:
                app.logger.error("Failed to save ai-review to DB: %s", db_error)
            finally:
                if conn:
                    conn.close()
            
        return jsonify({"result": result})
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500


@app.route('/api/submit_assessment', methods=['POST'])
def submit_assessment():
    data = request.get_json()
    user_id = data.get('userId')
    step_id = data.get('stepId')
    assessments = data.get('assessments')  # expected list of {kp, score, comment, ai_score}

    if not user_id or not step_id or not isinstance(assessments, list):
        return jsonify({"error": "Missing parameters"}), 400

    now = datetime.datetime.now().isoformat()
    try:
        conn = get_db()
        c = conn.cursor()
        inserted_ids = []
        for a in assessments:
            kp = a.get('kp')
            score = a.get('score')
            comment = a.get('comment')
            ai_score = a.get('ai_score')
            c.execute('''INSERT INTO assessments (user_id, step_id, kp, score, comment, ai_score, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)''',
                      (user_id, step_id, kp, score, comment, ai_score, now))
            inserted_ids.append(c.lastrowid)

        # If DEEPSEEK_API_KEY is available, try to call AI to estimate ai_score per KP
        if DEEPSEEK_API_KEY:
            for idx, a in enumerate(assessments):
                kp = a.get('kp')
                comment = a.get('comment') or ''
                # Compose a concise prompt asking for a 0-5 score and brief reason
                prompt = f"请基于下列用户反馈和知识点，给出该学生对知识点 {kp} 的掌握度评分（0-5，整数），并用格式\nscore: X\nreason: 简短说明\n\n知识点: {kp}\n学生备注: {comment}"
                try:
                    payload = {
                        "model": "deepseek-chat",
                        "messages": [
                            {"role": "system", "content": "你是一位严格的评分助手。请只以指定格式返回评分。"},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0
                    }
                    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
                    resp = requests.post(API_URL, json=payload, headers=headers, timeout=15)
                    resp.raise_for_status()
                    body = resp.json()
                    ai_text = body.get('choices', [])[0].get('message', {}).get('content', '')
                    # parse score
                    import re
                    m = re.search(r"score\s*[:\-]?\s*([0-5])", ai_text, re.IGNORECASE)
                    if m:
                        ai_val = int(m.group(1))
                        # update the inserted row by id
                        rowid = inserted_ids[idx]
                        c.execute('UPDATE assessments SET ai_score = ? WHERE id = ?', (ai_val, rowid))
                        # also save AI textual feedback into reviews table
                        now2 = datetime.datetime.now().isoformat()
                        c.execute("INSERT INTO reviews (user_id, step_id, task_id, feedback, created_at) VALUES (?, ?, ?, ?, ?)",
                                  (user_id, step_id, kp, ai_text, now2))
                except Exception:
                    # ignore AI failures, leave ai_score as-is
                    pass

        conn.commit()
        conn.close()
        return jsonify({"message": "Assessments saved"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/load_assessments', methods=['GET'])
def load_assessments():
    user_id = request.args.get('userId')
    step_id = request.args.get('stepId')
    if not user_id:
        return jsonify({"error": "Missing userId"}), 400

    conn = get_db()
    c = conn.cursor()
    if step_id:
        c.execute("SELECT * FROM assessments WHERE user_id = ? AND step_id = ? ORDER BY created_at", (user_id, step_id))
    else:
        c.execute("SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at", (user_id,))
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(rows)


@app.route('/api/admin/kp_stats', methods=['GET'])
def kp_stats():
    conn = get_db()
    c = conn.cursor()
    # average user score per KP, count and avg ai_score
    c.execute('''SELECT kp, COUNT(*) as count, AVG(score) as avg_score, AVG(ai_score) as avg_ai_score
                 FROM assessments
                 GROUP BY kp
                 ORDER BY avg_score ASC''')
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(rows)

if __name__ == '__main__':
    debug_flag = os.getenv("FLASK_DEBUG", "0") == "1"
    print(f"Server is running on http://localhost:{PORT} (debug={debug_flag})")
    app.run(host='0.0.0.0', port=PORT, debug=debug_flag)
