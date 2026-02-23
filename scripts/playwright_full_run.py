#!/usr/bin/env python3
import json
import time
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE_URL = "http://127.0.0.1:3000"
EMAIL = "jingjixue"
PASSWORD = "123456"

STEP_NOTES = {
    "s1": "选题对标与定位陈述已完成初稿。",
    "s2": "权利链与译权询函已建立并跟进。",
    "s3": "样章翻译v1完成并进入评审闭环。",
    "s4": "术语表与风格表已形成可执行规则。",
    "s5": "WBS与质量门指标已建立。",
    "s6": "copyediting与AI披露文本已完成。",
    "s7": "多角色审校与终校验收通过。",
    "s8": "Book Proposal与Pitch包已组装。",
    "s9": "模拟提交与反馈复盘已归档。",
}


def safe_text(locator):
    try:
        t = locator.inner_text(timeout=1000)
        return t.strip()
    except Exception:
        return ""


def fill_section(section, step, run_ts):
    sid = section.get_attribute("data-section") or "default"
    textareas = section.locator("textarea")
    for i in range(textareas.count()):
        ta = textareas.nth(i)
        current = ta.input_value()
        if not current.strip():
            ta.fill(f"[{step}/{sid}] {STEP_NOTES.get(step, '已完成草稿')} ({run_ts})")

    text_inputs = section.locator("input[type='text'], input[type='number']")
    for i in range(min(text_inputs.count(), 4)):
        inp = text_inputs.nth(i)
        if inp.input_value().strip():
            continue
        ph = (inp.get_attribute("placeholder") or "").strip()
        val = ph if ph else f"{step}-{sid}-field-{i+1}"
        inp.fill(val[:80])

    selects = section.locator("select")
    for i in range(selects.count()):
        sel = selects.nth(i)
        options = sel.locator("option")
        chosen = None
        for j in range(options.count()):
            v = (options.nth(j).get_attribute("value") or "").strip()
            if v:
                chosen = v
                break
        if chosen:
            sel.select_option(chosen)


def wait_ai_button_done(btn):
    try:
        btn.wait_for(state="visible", timeout=30000)
        # waits until AI call returns and button enabled again
        deadline = time.time() + 20
        while time.time() < deadline:
            disabled = btn.is_disabled()
            if not disabled:
                break
            time.sleep(0.5)
    except Exception:
        pass

def close_tutorial_overlay(page):
    close_btn = page.locator(".tutorial-overlay.active .tutorial-close")
    start_btn = page.locator(".tutorial-overlay.active .tutorial-footer .button")
    if close_btn.count() > 0:
        try:
            close_btn.first.click(timeout=1200)
            page.wait_for_timeout(200)
            return
        except Exception:
            pass
    if start_btn.count() > 0:
        try:
            start_btn.first.click(timeout=1200)
            page.wait_for_timeout(200)
        except Exception:
            pass


def run():
    run_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    out_dir = Path("作业日志") / f"playwright_ui_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shot_dir = out_dir / "screenshots"
    out_dir.mkdir(parents=True, exist_ok=True)
    shot_dir.mkdir(parents=True, exist_ok=True)

    logs = {
        "started_at": run_ts,
        "base_url": BASE_URL,
        "user": {"email": EMAIL},
        "steps": [],
        "login": {}
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=120)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, record_video_dir=str(out_dir / "videos"))
        page = context.new_page()

        print("[INFO] open login page")
        # login/register
        page.goto(f"{BASE_URL}/login.html", wait_until="domcontentloaded", timeout=60000)
        page.fill("#email", EMAIL)
        page.fill("#password", PASSWORD)

        # try register first
        page.click("#tab-register")
        page.click("button[type='submit']")
        page.wait_for_timeout(1800)
        err = safe_text(page.locator("#error-msg"))
        logs["login"]["register_error"] = err

        if "exists" in err.lower() or "已存在" in err:
            page.click("#tab-login")
            page.fill("#email", EMAIL)
            page.fill("#password", PASSWORD)
            page.click("button[type='submit']")

        try:
            page.wait_for_url("**/index.html", timeout=25000)
            logs["login"]["status"] = "ok"
            print("[INFO] login success")
        except PWTimeout:
            logs["login"]["status"] = "failed"
            logs["login"]["final_error"] = safe_text(page.locator("#error-msg"))
            page.screenshot(path=str(shot_dir / "login_failed.png"), full_page=True)
            context.close()
            browser.close()
            (out_dir / "run-log.json").write_text(json.dumps(logs, ensure_ascii=False, indent=2), encoding="utf-8")
            raise RuntimeError("Login failed in browser flow")

        for i in range(1, 10):
            step = f"s{i}"
            print(f"[INFO] running {step}")
            step_log = {"step": step, "filled_sections": [], "ai_tools": [], "reviews": [], "saves": []}
            page.goto(f"{BASE_URL}/{step}.html", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(500)
            close_tutorial_overlay(page)

            sections = page.locator("[data-section]")
            sec_count = sections.count()
            for s in range(sec_count):
                sec = sections.nth(s)
                sid = sec.get_attribute("data-section") or f"section_{s+1}"
                fill_section(sec, step, run_ts)
                step_log["filled_sections"].append(sid)

                # save inside section
                save_btn = sec.locator("[data-save]")
                if save_btn.count() > 0:
                    save_btn.nth(0).click()
                    page.wait_for_timeout(350)
                    step_log["saves"].append({"section": sid, "phase": "initial", "clicked": True})

            # click at least one AI tool on each page
            ai_buttons = page.locator("[data-ai-tool]")
            for a in range(min(ai_buttons.count(), 1)):
                btn = ai_buttons.nth(a)
                label = safe_text(btn)
                if not btn.is_enabled():
                    continue
                btn.click()
                wait_ai_button_done(btn)
                step_log["ai_tools"].append({"button": label, "clicked": True})

            # trigger review for first section and then revise
            for s in range(min(sec_count, 1)):
                sec = sections.nth(s)
                sid = sec.get_attribute("data-section") or f"section_{s+1}"
                review_btn = sec.locator("[data-review-btn]")
                if review_btn.count() == 0:
                    step_log["reviews"].append({"section": sid, "triggered": False, "reason": "no_review_btn"})
                    continue
                if review_btn.nth(0).is_disabled():
                    step_log["reviews"].append({"section": sid, "triggered": False, "reason": "disabled"})
                    continue
                review_btn.nth(0).click()
                page.wait_for_timeout(2000)
                result_text = safe_text(sec.locator(".review-result"))
                loading_text = safe_text(sec.locator(".review-loading"))
                step_log["reviews"].append({
                    "section": sid,
                    "triggered": True,
                    "has_result": bool(result_text),
                    "result_preview": (result_text or loading_text)[:300]
                })

                # revise after review
                ta = sec.locator("textarea").first
                if ta.count() > 0:
                    val = ta.input_value()
                    ta.fill((val + "\n\n[按AI点评修订] 补充证据、行动项与量化指标。")[:12000])
                save_btn = sec.locator("[data-save]")
                if save_btn.count() > 0 and save_btn.nth(0).is_enabled():
                    save_btn.nth(0).click()
                    page.wait_for_timeout(300)
                    step_log["saves"].append({"section": sid, "phase": "after_review", "clicked": True})

            page.screenshot(path=str(shot_dir / f"{step}.png"), full_page=True)
            logs["steps"].append(step_log)
            print(f"[INFO] {step} done")

        context.storage_state(path=str(out_dir / "storage-state.json"))
        context.close()
        browser.close()

    logs["finished_at"] = datetime.now().isoformat()
    (out_dir / "run-log.json").write_text(json.dumps(logs, ensure_ascii=False, indent=2), encoding="utf-8")

    md = [
        "# Playwright 可视化全流程日志",
        f"- 启动时间: {logs['started_at']}",
        f"- 完成时间: {logs['finished_at']}",
        f"- 账号: {EMAIL}",
        f"- 登录状态: {logs['login'].get('status')}",
        f"- 注册提示: {logs['login'].get('register_error','')}",
        "",
        "## 步骤统计",
    ]
    for s in logs["steps"]:
        md.append(f"- {s['step'].upper()}: sections={len(s['filled_sections'])}, ai_calls={len(s['ai_tools'])}, reviews={len([r for r in s['reviews'] if r.get('triggered')])}")
    (out_dir / "README.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(out_dir)


if __name__ == "__main__":
    run()
