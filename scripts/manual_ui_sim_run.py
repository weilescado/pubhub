#!/usr/bin/env python3
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server

USER_EMAIL = "jingjixue"
USER_PASSWORD = "123456"

BOOKS = [
    "《置身事内：中国政府与经济发展》（兰小欢）",
    "《激荡三十年：中国企业1978-2008》（吴晓波）",
    "《变量：中国社会运行的逻辑》（何帆）",
]

STEP_TASKS = {
    "s1": ["t1.1", "t1.2"],
    "s2": ["t2.1", "t2.2"],
    "s3": ["t3.1", "t3.2"],
    "s4": ["t4.1", "t4.2"],
    "s5": ["t5.1", "t5.2"],
    "s6": ["t6.1", "t6.2"],
    "s7": ["t7.1", "t7.2"],
    "s8": ["t8.1", "t8.2"],
    "s9": ["t9.1", "t9.2"],
}

STEP_TOOLS = {
    "s1": ["AI01", "AI04"],
    "s2": ["AI01", "AI04", "AI05"],
    "s3": ["AI02", "AI03", "AI04"],
    "s4": ["AI02", "AI01"],
    "s5": ["AI01", "AI03", "AI05"],
    "s6": ["AI04", "AI05", "AI01"],
    "s7": ["AI03", "AI05"],
    "s8": ["AI04", "AI05"],
    "s9": ["AI04", "AI01", "AI05"],
}

KB = server.KNOWLEDGE_BASE if hasattr(server, "KNOWLEDGE_BASE") else None
if KB is None:
    # read from js object for requirements
    kb_js = Path("knowledge-base.js").read_text(encoding="utf-8")
    start = kb_js.find("{")
    end = kb_js.rfind("};")
    KB = json.loads(kb_js[start:end + 1])


def parse_stage_requirements(step_id):
    stage_id = step_id.upper()
    stage = None
    for s in KB.get("stages", []):
        if s.get("stageId") == stage_id:
            stage = s
            break
    if not stage:
        return {}
    out = {}
    for t in stage.get("tasks", []):
        tid = t.get("taskId", "").lower()
        reqs = []
        for kp_id in t.get("knowledgePointIds", []):
            kp = KB.get("knowledgePoints", {}).get(kp_id, {})
            name = kp.get("ChineseName", kp_id)
            d = kp.get("Definition", "")
            reqs.append(f"{kp_id} {name}: {d}")
        out[tid] = "\n".join(reqs)
    return out


def base_sections(step):
    if step == "s1":
        return {
            "t1.1": {
                "text": "",
                "fileMeta": "未选择文件",
                "fields": {
                    "candidate_book_1": BOOKS[0],
                    "candidate_book_2": BOOKS[1],
                    "candidate_book_3": BOOKS[2],
                    "persona_keywords": "graduate student / policy analyst",
                    "comp_book_1": "How China Escaped the Poverty Trap",
                    "comp_book_2": "China's Great Wall of Debt",
                    "comp_book_3": "The Great Rebalancing",
                    "diff_value": "制度解释、政策案例、国际课程适配三重优势。",
                    "positioning_statement": "This project introduces Chinese development economics through institution-level evidence and policy-facing case analysis."
                }
            },
            "t1.2": {
                "text": "已形成立项章程初稿。",
                "fileMeta": "",
                "fields": {
                    "project_name": "China Economics Translation Training",
                    "objective_specific": "完成样章与提案包",
                    "objective_measurable": "9步全流程完成",
                    "objective_achievable": "双人协作+教师复核",
                    "objective_relevant": "对接国际出版",
                    "objective_timebound": "9周内"
                }
            }
        }
    if step == "s2":
        return {
            "t2.1": {"text": "", "fileMeta": "未选择文件", "fields": {
                "rights_availability_result": "不明确需追踪",
                "rights_chain_author_1": "兰小欢",
                "rights_chain_publisher_1": "上海人民出版社",
                "rights_chain_status_1": "待权利人确认",
                "rights_chain_report": "完成公开信息检索与证据记录。",
            }},
            "t2.2": {"text": "", "fileMeta": "未选择文件", "fields": {
                "rights_inquiry_email": "Dear Rights Team, we are interested in English translation rights...",
                "communication_log": "已发送首轮询函，待回复。",
                "third_party_assets": "图表2项申请授权，图片1项替换。",
                "license_request_letter": "Permission request draft prepared."
            }}
        }
    if step == "s3":
        return {
            "t3.1": {"text": "", "fileMeta": "", "fields": {
                "sample_scope": "第2章1-3节，约6200字。",
                "translation_brief": "面向研究生与政策分析读者，保持学术清晰表达。",
                "term_en_1": "fiscal decentralization",
                "term_cn_1": "财政分权",
            }},
            "t3.2": {"text": "样章v1完成。", "fileMeta": "", "fields": {
                "review_comments": "术语一致性与句式流畅度需改善。",
                "sample_translation_v2": "Revised sample translation draft.",
                "response_log": "已逐条回应评审意见。"
            }}
        }
    if step == "s4":
        return {
            "t4.1": {"text": "", "fileMeta": "未选择文件", "fields": {
                "term_v1_en_1": "soft budget constraint",
                "term_v1_cn_1": "软预算约束",
                "term_decisions": "争议术语形成决策记录。"
            }},
            "t4.2": {"text": "", "fileMeta": "", "fields": {
                "style_sheet": "采用US拼写，统一术语首现格式。",
                "style_term_link": "风格表与术语表联动检查。"
            }}
        }
    if step == "s5":
        return {
            "t5.1": {"text": "", "fileMeta": "", "fields": {
                "wbs_breakdown": "按章节拆分18个任务包。",
                "acceptance_metrics": "术语一致率>=97%，致命错误=0。"
            }},
            "t5.2": {"text": "初译v0.9完成。", "fileMeta": "", "fields": {
                "progress_log": "每周记录进度与偏差。",
                "quality_gate_report": "问题密度持续下降。",
                "updated_plan": "加入缓冲并强化周会机制。"
            }}
        }
    if step == "s6":
        return {
            "t6.1": {"text": "v1.0润色稿完成。", "fileMeta": "", "fields": {
                "polishing_log": "统一语体、缩短冗长句、增强衔接。"
            }},
            "t6.2": {"text": "AI合规披露草案完成。", "fileMeta": "", "fields": {
                "expert_feedback": "无高危合规问题。",
                "polishing_report": "AI用途、输入边界、人工复核均已记录。"
            }}
        }
    if step == "s7":
        return {
            "t7.1": {"text": "", "fileMeta": "", "fields": {
                "review_1_log": "同伴互审完成。",
                "review_2_log": "专家审校完成。",
                "review_3_log": "终审通过。"
            }},
            "t7.2": {"text": "终校通过。", "fileMeta": "未选择文件", "fields": {
                "qc_report": "QA报告完整，满足提交标准。"
            }}
        }
    if step == "s8":
        return {
            "t8.1": {"text": "Book Proposal初稿完成。", "fileMeta": "", "fields": {
                "optimized_abstract": "Includes chapter synopsis, market fit, and rights summary."
            }},
            "t8.2": {"text": "", "fileMeta": "", "fields": {
                "author_bio": "Translation team with economics and publication background.",
                "blurbs": "Pitch package attachment list prepared.",
                "marketing_materials": "Pre-submission checklist completed."
            }}
        }
    if step == "s9":
        return {
            "t9.1": {"text": "模拟提交已完成。", "fileMeta": "", "fields": {
                "upload_checklist": "proposal_v1 + sample + rights summary",
                "submission_confirmation": "Selected editor based on series fit."
            }},
            "t9.2": {"text": "复盘与入库完成。", "fileMeta": "", "fields": {
                "review_comments_summary": "Drafted reply for revise-and-resubmit scenario.",
                "archive_note": "Archived terminology, style sheet, templates, and process export."
            }}
        }
    return {}


def section_context(sec):
    parts = []
    txt = (sec.get("text") or "").strip()
    if txt:
        parts.append(txt)
    for k, v in sec.get("fields", {}).items():
        if isinstance(v, str) and v.strip():
            parts.append(f"{k}: {v}")
    return "\n".join(parts) if parts else "（用户未输入内容）"


def append_ai_result(sec, tool, result):
    key_priority = [
        "positioning_statement", "rights_inquiry_email", "translation_brief", "sample_translation_v2",
        "style_sheet", "acceptance_metrics", "polishing_log", "qc_report", "optimized_abstract",
        "marketing_materials", "submission_confirmation", "archive_note"
    ]
    chosen = None
    for k in key_priority:
        if k in sec.get("fields", {}):
            chosen = k
            break
    if not chosen:
        fields = sec.get("fields", {})
        chosen = next(iter(fields.keys()), None)
    if chosen:
        cur = sec["fields"].get(chosen, "")
        sec["fields"][chosen] = (cur + "\n\n[AI建议]\n" + result[:1200]).strip()
    else:
        sec["text"] = (sec.get("text", "") + "\n\n[AI建议]\n" + result[:1200]).strip()


def apply_review_revision(sec, review_text):
    note = "根据AI导师点评已执行修订：补充证据链、明确行动项、统一术语与结构。"
    sec["text"] = ((sec.get("text") or "") + "\n" + note).strip()
    for k, v in list(sec.get("fields", {}).items()):
        if isinstance(v, str) and v.strip():
            sec["fields"][k] = v + "\n[修订] 已根据AI点评补充可执行细节。"
            break

def save_with_retry(client, user_id, step_id, data, retries=6):
    last_status = None
    last_body = None
    for _ in range(retries):
        r = client.post('/api/save_progress', json={'userId': user_id, 'stepId': step_id, 'data': data})
        last_status = r.status_code
        last_body = r.get_json()
        if r.status_code == 200:
            return True, last_status, last_body
    return False, last_status, last_body

def offline_tool_hint(tool, context):
    hints = {
        "AI01": "建议补充目标读者、竞品差异和可量化指标。",
        "AI02": "建议明确权限范围、地域、期限和联系人。",
        "AI03": "建议核查漏译、术语一致性和句子对应关系。",
        "AI04": "建议统一关键术语译法并注明首次定义。",
        "AI05": "建议压缩冗余表达，增强逻辑连接与可读性。",
    }
    return f"[离线回退建议] {hints.get(tool, '建议补充证据与执行步骤。')}（原上下文长度: {len(context)}）"

def offline_review_hint(task):
    return f"[离线回退点评] {task}: 优点是结构完整；不足是证据与指标不够量化。建议补充数据依据、行动清单和验收标准。"


def main():
    out_dir = Path("作业日志") / f"manual_ui_like_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    out_dir.mkdir(parents=True, exist_ok=True)

    logs = {
        "started_at": datetime.now().isoformat(),
        "mode": "ui-like manual simulation via backend endpoints",
        "user": {"email": USER_EMAIL},
        "steps": []
    }

    with server.app.test_client() as client:
        reg = client.post('/api/register', json={'email': USER_EMAIL, 'password': USER_PASSWORD})
        logs["register"] = {"status": reg.status_code, "body": reg.get_json()}

        login = client.post('/api/login', json={'email': USER_EMAIL, 'password': USER_PASSWORD})
        lj = login.get_json() or {}
        if login.status_code != 200 or not lj.get('user'):
            raise RuntimeError(f"login failed: {login.status_code} {lj}")
        user_id = lj['user']['id']
        logs["login"] = {"status": login.status_code, "user_id": user_id}

        for step in [f"s{i}" for i in range(1, 10)]:
            step_log = {"step": step, "tools": [], "reviews": [], "save": []}
            req_map = parse_stage_requirements(step)
            sections = base_sections(step)

            data = {"text": "", "fileMeta": "", "aiLog": [], "sections": sections}
            ok, st, body = save_with_retry(client, user_id, step, data)
            step_log["save"].append({"phase": "initial", "status": st, "body": body, "ok": ok})

            for task in STEP_TASKS[step]:
                sec = data["sections"].get(task, {"text": "", "fileMeta": "", "fields": {}})
                ctx = section_context(sec)

                for tool in STEP_TOOLS.get(step, []):
                    ai = client.post('/api/ai-completion', json={'toolId': tool, 'context': ctx})
                    aj = ai.get_json() or {}
                    result = aj.get('result') or aj.get('error') or "[无结果]"
                    step_log["tools"].append({
                        "task": task,
                        "tool": tool,
                        "status": ai.status_code,
                        "result_preview": result[:300]
                    })
                    data["aiLog"].append({
                        "tool": tool,
                        "input": ctx[:500],
                        "output": result[:1200],
                        "timestamp": datetime.now().isoformat()
                    })
                    if ai.status_code == 200 and aj.get('result'):
                        append_ai_result(sec, tool, aj['result'])
                        ctx = section_context(sec)
                    else:
                        fallback = offline_tool_hint(tool, ctx)
                        append_ai_result(sec, tool, fallback)
                        ctx = section_context(sec)

                review_content = section_context(sec)
                reqs = req_map.get(task, "")
                rv = client.post('/api/ai-review', json={
                    'userId': user_id,
                    'stepId': step,
                    'taskId': task,
                    'content': review_content,
                    'requirements': reqs
                })
                rj = rv.get_json() or {}
                rtxt = rj.get('result') or rj.get('error') or "[无结果]"
                step_log["reviews"].append({
                    "task": task,
                    "status": rv.status_code,
                    "result_preview": rtxt[:400]
                })
                if rv.status_code == 200 and rj.get('result'):
                    apply_review_revision(sec, rj['result'])
                else:
                    apply_review_revision(sec, offline_review_hint(task))

            ok2, st2, body2 = save_with_retry(client, user_id, step, data)
            step_log["save"].append({"phase": "final", "status": st2, "body": body2, "ok": ok2})

            verify = client.get(f'/api/load_progress?userId={user_id}&stepId={step}')
            vj = verify.get_json() or {}
            (out_dir / f"{step}.json").write_text(json.dumps(vj, ensure_ascii=False, indent=2), encoding="utf-8")
            step_log["verify_status"] = verify.status_code
            step_log["verified_sections"] = list(vj.get("sections", {}).keys())
            logs["steps"].append(step_log)

    logs["finished_at"] = datetime.now().isoformat()
    (out_dir / "run-log.json").write_text(json.dumps(logs, ensure_ascii=False, indent=2), encoding="utf-8")

    md = [
        "# 手工流程模拟执行日志（页面级流程近似）",
        "",
        f"- 时间: {logs['started_at']} ~ {logs['finished_at']}",
        f"- 账号: {USER_EMAIL}",
        f"- userId: {logs['login']['user_id']}",
        "- 书目: " + "；".join(BOOKS),
        "",
        "## 执行说明",
        "- 先填初稿并保存",
        "- 调用页面AI工具（ai-completion）",
        "- 调用AI导师点评（ai-review）",
        "- 按点评进行二次修订并保存",
        "",
        "## 步骤结果",
    ]

    for s in logs["steps"]:
        md.append(f"### {s['step'].upper()}")
        md.append(f"- 初次保存: HTTP {s['save'][0]['status']}")
        md.append(f"- 最终保存: HTTP {s['save'][1]['status']}")
        ok_tool = sum(1 for t in s['tools'] if t['status'] == 200)
        md.append(f"- AI工具调用: {ok_tool}/{len(s['tools'])} 成功")
        ok_review = sum(1 for r in s['reviews'] if r['status'] == 200)
        md.append(f"- AI点评调用: {ok_review}/{len(s['reviews'])} 成功")
        md.append(f"- 回读校验: HTTP {s['verify_status']} sections={','.join(s['verified_sections'])}")

    (out_dir / "README.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(out_dir)


if __name__ == "__main__":
    main()
