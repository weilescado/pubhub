let API_BASE = "/api";
const resolveApiBase = () => {
  const override = localStorage.getItem("API_BASE_OVERRIDE");
  if (override && typeof override === "string") {
    return override.replace(/\/+$/, "");
  }
  return API_BASE;
};
const STEP_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];

const AI_TOOLS = {
  AI01: "项目策划与指标映射",
  AI02: "版权沟通与条款草拟",
  AI03: "翻译与质量检查",
  AI04: "术语与风格规范",
  AI05: "润色与合规审阅"
};

// --- Auth & State ---
let currentUser = null;
let currentStepData = { text: "", fileMeta: "", sections: {}, aiLog: [] };

const checkAuth = () => {
  const userStr = localStorage.getItem("currentUser");
  if (!userStr) {
    if (!window.location.pathname.endsWith("login.html")) {
      window.location.href = "login.html";
    }
    return null;
  }
  return JSON.parse(userStr);
};

// --- API Wrappers ---
const apiCall = async (endpoint, method = "GET", body = null) => {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body) options.body = JSON.stringify(body);
  let res;
  // Build absolute URL: if resolveApiBase returns an absolute URL use it, otherwise use current origin
  const base = resolveApiBase();
  const baseUrl = /^https?:\/\//i.test(base) ? base.replace(/\/$/, '') : `${window.location.origin.replace(/\/$/, '')}${base}`;
  const url = `${baseUrl}${endpoint}`;
  try {
    res = await fetch(url, options);
  } catch (err) {
    const hint = localStorage.getItem("API_BASE_OVERRIDE") || baseUrl || "";
    throw new Error(hint ? `Failed to fetch (${hint})` : "Failed to fetch");
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid JSON response");
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const loadStepData = async (step) => {
  if (!currentUser) return;
  try {
    const data = await apiCall(`/load_progress?userId=${currentUser.id}&stepId=${step}`);
    currentStepData = {
      text: "",
      fileMeta: "",
      sections: {},
      aiLog: [],
      ...data
    };
    if (!currentStepData.sections) currentStepData.sections = {};
    if (!Array.isArray(currentStepData.aiLog)) currentStepData.aiLog = [];
  } catch (e) {
    console.error("Load Error:", e);
  }
};

const saveStepData = async (step) => {
  if (!currentUser) return;
  try {
    await apiCall("/save_progress", "POST", {
      userId: currentUser.id,
      stepId: step,
      data: currentStepData
    });
    console.log("Saved");
  } catch (e) {
    console.error("Save Error:", e);
  }
};

let saveTimer;
const triggerSave = (step) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStepData(step), 1000);
};

// --- DOM Sync ---
const syncSectionByRoot = (step, root) => {
  const key = root.dataset.section || "default";
  const textarea = root.querySelector("[data-deliverable]");
  const fileMeta = root.querySelector("[data-file-meta]");
  const fieldEls = Array.from(root.querySelectorAll("[data-field]"));
  const ganttBody = root.querySelector("[data-gantt-body]");
  
  const fields = {};
  if (fieldEls.length > 0) {
    fieldEls.forEach((el) => {
      const name = el.dataset.field || el.name;
      if (!name) return;
      fields[name] = (el.value || "").trim();
    });
  }

  if (ganttBody) {
    const ganttRows = Array.from(ganttBody.querySelectorAll("tr"))
      .map((tr) => {
        const inputs = tr.querySelectorAll("input");
        return {
          name: (inputs[0]?.value || "").trim(),
          start: (inputs[1]?.value || "").trim(),
          end: (inputs[2]?.value || "").trim(),
          owner: (inputs[3]?.value || "").trim(),
          accept: (inputs[4]?.value || "").trim()
        };
      })
      .filter((row) => row.name || row.start || row.end || row.owner || row.accept);
    fields.__gantt_rows = JSON.stringify(ganttRows);
  }
  
  currentStepData.sections[key] = {
    text: textarea ? textarea.value.trim() : "",
    fileMeta: fileMeta ? fileMeta.textContent : "",
    fields
  };
  
  if (key === "default") {
    currentStepData.text = currentStepData.sections[key].text;
    currentStepData.fileMeta = currentStepData.sections[key].fileMeta;
  }
  
  triggerSave(step);
};

const bindWorkspace = (step) => {
  const sections = document.querySelectorAll("[data-section]");
  
  const bindSection = (root) => {
    const key = root.dataset.section || "default";
    const seed = currentStepData.sections[key];
    
    const textarea = root.querySelector("[data-deliverable]");
    const fieldEls = Array.from(root.querySelectorAll("[data-field]"));
    const fileInput = root.querySelector("[data-file]");
    const fileMeta = root.querySelector("[data-file-meta]");
    const saveBtn = root.querySelector("[data-save]");
    
    if (textarea && seed?.text) textarea.value = seed.text;
    if (fileMeta && seed?.fileMeta) fileMeta.textContent = seed.fileMeta;
    if (fieldEls.length > 0 && seed?.fields) {
      fieldEls.forEach(el => {
        const name = el.dataset.field || el.name;
        if (seed.fields[name]) el.value = seed.fields[name];
      });
    }

    const ganttBody = root.querySelector("[data-gantt-body]");
    const ganttSeed = seed?.fields?.__gantt_rows;
    if (ganttBody && ganttSeed) {
      let rows = [];
      try {
        rows = JSON.parse(ganttSeed);
      } catch {
        rows = [];
      }
      if (Array.isArray(rows) && rows.length > 0) {
        ganttBody.innerHTML = "";
        rows.forEach((row) => {
          const tr = buildGanttRow();
          const inputs = tr.querySelectorAll("input");
          if (inputs[0]) inputs[0].value = row.name || "";
          if (inputs[1]) inputs[1].value = row.start || "";
          if (inputs[2]) inputs[2].value = row.end || "";
          if (inputs[3]) inputs[3].value = row.owner || "";
          if (inputs[4]) inputs[4].value = row.accept || "";
          ganttBody.appendChild(tr);
        });
        renderGanttChart(root);
      }
    }
    
    if (textarea) textarea.addEventListener("input", () => syncSectionByRoot(step, root));
    
    root.addEventListener("input", (e) => {
      if (e.target.matches("[data-field]") || e.target.closest("[data-gantt-body]")) {
        syncSectionByRoot(step, root);
        if (root.querySelector("[data-gantt-chart]")) renderGanttChart(root);
      }
    });
    
    if (fileInput && fileMeta) {
      fileInput.addEventListener("change", () => {
        fileMeta.textContent = formatFileMeta(fileInput.files);
        syncSectionByRoot(step, root);
      });
    }
    
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        syncSectionByRoot(step, root);
        saveBtn.textContent = "已保存";
        setTimeout(() => saveBtn.textContent = "保存草稿", 1200);
      });
    }
  };

  if (sections.length > 0) sections.forEach(bindSection);
  else bindSection(document.body);
};

// --- AI Logic ---
const callAiApi = async (tool, context) => {
  try {
    const result = await apiCall("/ai-completion", "POST", { toolId: tool, context });
    return result.result;
  } catch (e) {
    return `[Error] ${e.message}`;
  }
};

const bindAiTools = (step) => {
  document.querySelectorAll("[data-ai-tool]").forEach((btn) => {
    const tool = btn.dataset.aiTool;
    const label = AI_TOOLS[tool];
    if (label) btn.textContent = `${tool} ${label}`;

    btn.addEventListener("click", async () => {
      const originalText = btn.textContent;
      btn.textContent = "Wait...";
      btn.disabled = true;

      const tool = btn.dataset.aiTool;
      const targetId = btn.dataset.target;
      const textarea = targetId 
        ? document.getElementById(targetId) 
        : document.querySelector("[data-deliverable]");
      
      if (textarea) {
        const context = textarea.value || "（用户未输入内容）";
        const result = await callAiApi(tool, context);
        
        if (textarea.tagName === "TEXTAREA") {
          textarea.value = textarea.value 
            ? `${textarea.value}\n\n--- AI 反馈 ---\n${result}`
            : result;
        } else {
          textarea.value = result;
        }
        
        const root = textarea.closest("[data-section]") || document.body;
        syncSectionByRoot(step, root);
        addAiLog(step, {
          tool,
          input: context,
          output: result
        });
      }
      
      btn.textContent = "Done";
      btn.disabled = false;
      setTimeout(() => btn.textContent = originalText, 1500);
    });
  });
};

// --- Review Feature ---
const injectReviewUI = (step) => {
  const sections = document.querySelectorAll(".panel[data-section]");
  if (sections.length === 0) return;

  sections.forEach(section => {
    if (section.querySelector(".review-box")) return;
    
    const stepId = step.toUpperCase();
    const taskIdUpper = section.dataset.section.toUpperCase();
    const stage = window.KNOWLEDGE_BASE?.stages?.find(s => s.stageId === stepId);
    if (!stage) return;
    
    const task = stage.tasks.find(t => t.taskId.toUpperCase() === taskIdUpper);
    if (!task) return;

    const requirements = task.knowledgePointIds.map(kpId => {
      const kp = window.KNOWLEDGE_BASE.knowledgePoints[kpId];
      return kp ? `${kpId} ${kp.ChineseName}: ${kp.Definition}` : kpId;
    }).join("\n");

    const box = document.createElement("div");
    box.className = "review-box";
    box.innerHTML = `
      <div class="review-header">
        <h3>🎓 AI 导师点评</h3>
        <button class="button secondary small" data-review-btn>提交作业并获取点评</button>
      </div>
      <div class="review-content" style="display:none;">
        <div class="review-loading">AI 正在批改您的作业，请稍候...</div>
        <div class="review-result markdown-body"></div>
      </div>
    `;
    
    section.appendChild(box);
    
    const btn = box.querySelector("[data-review-btn]");
    const contentDiv = box.querySelector(".review-content");
    const resultDiv = box.querySelector(".review-result");
    const loadingDiv = box.querySelector(".review-loading");
    
    btn.onclick = async () => {
      const textarea = section.querySelector("[data-deliverable]");
      const fields = Array.from(section.querySelectorAll("[data-field]"));
      let content = "";
      
      if (textarea) content += `【主要内容】：\n${textarea.value}\n`;
      fields.forEach(f => {
        content += `【${f.placeholder || f.dataset.field}】：${f.value}\n`;
      });
      
      if (!content.trim()) {
        alert("请先填写作业内容再提交点评。");
        return;
      }
      
      contentDiv.style.display = "block";
      loadingDiv.style.display = "block";
      resultDiv.innerHTML = "";
      btn.disabled = true;
      
      try {
        const res = await apiCall("/ai-review", "POST", {
          userId: currentUser.id,
          stepId: step,
          taskId: task.taskId,
          content: content,
          requirements: requirements
        });
        
        loadingDiv.style.display = "none";
        resultDiv.innerHTML = formatReviewResult(res.result);
        
      } catch (e) {
        loadingDiv.textContent = "点评失败: " + e.message;
      } finally {
        btn.disabled = false;
      }
    };
  });
};

const injectAssessmentUI = (step) => {
  const sections = document.querySelectorAll('.panel[data-section]');
  if (sections.length === 0) return;

  sections.forEach(section => {
    if (section.querySelector('.assessment-box')) return;

    const stepId = step.toUpperCase();
    const taskIdUpper = section.dataset.section.toUpperCase();
    const stage = window.KNOWLEDGE_BASE?.stages?.find(s => s.stageId === stepId);
    if (!stage) return;
    const task = stage.tasks.find(t => t.taskId.toUpperCase() === taskIdUpper);
    if (!task) return;

    const box = document.createElement('div');
    box.className = 'assessment-box';
    box.innerHTML = `
      <div class="assessment-header">
        <h3>📊 知识点掌握度评估</h3>
        <button class="button secondary small" data-assess-submit>提交评估</button>
      </div>
      <div class="assessment-body">
        <table style="width:100%; border-collapse:collapse; margin-top:8px;">
          <thead><tr><th style="text-align:left">知识点</th><th style="width:120px">掌握度 (0-5)</th><th>备注</th></tr></thead>
          <tbody class="assessment-list"></tbody>
        </table>
      </div>
    `;
    section.appendChild(box);

    const listEl = box.querySelector('.assessment-list');
    const submitBtn = box.querySelector('[data-assess-submit]');

    // build rows
    task.knowledgePointIds.forEach(kpId => {
      const kp = window.KNOWLEDGE_BASE.knowledgePoints[kpId] || { ChineseName: kpId };
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px; border-top:1px solid var(--line);">${kpId} ${kp.ChineseName || ''}</td>
        <td style="padding:8px; border-top:1px solid var(--line);"><select class="kp-score"><option value="">-</option>${[0,1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></td>
        <td style="padding:8px; border-top:1px solid var(--line);"><input class="kp-comment" placeholder="可选备注" style="width:100%" /></td>
      `;
      listEl.appendChild(tr);
    });

    // load existing assessments for this user/step
    (async () => {
      try {
        const rows = await apiCall(`/load_assessments?userId=${currentUser.id}&stepId=${step}`);
        // filter to this task's KPs
        const rowsForStep = rows || [];
        // mapping latest per kp
        const latest = {};
        rowsForStep.forEach(r => { latest[r.kp] = r; });
        // populate
        Array.from(listEl.querySelectorAll('tr')).forEach(tr => {
          const kpText = tr.children[0].textContent || '';
          const kpId = (kpText.split(' ')||[kpText])[0];
          if (latest[kpId]) {
            const sel = tr.querySelector('.kp-score');
            const inp = tr.querySelector('.kp-comment');
            if (sel && latest[kpId].score != null) sel.value = latest[kpId].score;
            if (inp && latest[kpId].comment) inp.value = latest[kpId].comment;
          }
        });
      } catch (e) {
        console.warn('无法加载评估数据：', e.message);
      }
    })();

    submitBtn.onclick = async () => {
      const rows = Array.from(listEl.querySelectorAll('tr'));
      const assessments = rows.map(tr => {
        const kpText = tr.children[0].textContent || '';
        const kpId = (kpText.split(' ')||[kpText])[0];
        const score = tr.querySelector('.kp-score').value;
        const comment = tr.querySelector('.kp-comment').value.trim();
        return { kp: kpId, score: score === '' ? null : Number(score), comment };
      });
      try {
        submitBtn.disabled = true;
        await apiCall('/submit_assessment', 'POST', { userId: currentUser.id, stepId: step, assessments });
        submitBtn.textContent = '已保存';
        setTimeout(() => submitBtn.textContent = '提交评估', 1500);
      } catch (e) {
        alert('提交评估失败: ' + e.message);
      } finally {
        submitBtn.disabled = false;
      }
    };
  });
};

 // --- Excel Tools ---
 const ensureXLSXLoaded = () => new Promise((resolve, reject) => {
   if (typeof XLSX !== "undefined") {
     resolve();
     return;
   }
   const script = document.createElement("script");
   script.src = "vendor-xlsx.min.js";
   script.onload = () => resolve();
   script.onerror = () => reject(new Error("XLSX 加载失败"));
   document.head.appendChild(script);
 });
 
 const bindExcelTools = (step) => {
  const downloadBtns = document.querySelectorAll("[data-download-template]");
   downloadBtns.forEach(btn => {
     btn.addEventListener("click", async () => {
       try {
         await ensureXLSXLoaded();
       } catch (e) {
         alert(e.message);
         return;
       }
       const wb = XLSX.utils.book_new();
       const headers = [["序号", "英文术语 (English)", "中文术语 (Chinese)"]];
       const ws = XLSX.utils.aoa_to_sheet(headers);
       ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 40 }];
       XLSX.utils.book_append_sheet(wb, ws, "术语表");
       XLSX.writeFile(wb, "术语表模板.xlsx");
     });
   });
 
  const uploadInputs = document.querySelectorAll("[data-upload-excel]");
   uploadInputs.forEach(input => {
     input.addEventListener("change", async (e) => {
       try {
         await ensureXLSXLoaded();
       } catch (err) {
         alert(err.message);
         return;
       }
       const file = e.target.files[0];
       if (!file) return;
       const reader = new FileReader();
       reader.onload = (ev) => {
         try {
           const data = new Uint8Array(ev.target.result);
           const workbook = XLSX.read(data, { type: "array" });
           const sheetName = workbook.SheetNames[0];
           const worksheet = workbook.Sheets[sheetName];
           const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
           if (rows.length < 2) {
             alert("表格内容为空或格式不正确。");
             return;
           }
           const root = input.closest("[data-section]") || document.body;
           const allFields = Array.from(root.querySelectorAll("[data-field]"));
           const enFields = allFields.filter(el => /_en_\d+$/.test(el.dataset.field));
           const cnFields = allFields.filter(el => /_cn_\d+$/.test(el.dataset.field));
           if (enFields.length === 0 || cnFields.length === 0) {
             alert("未检测到术语输入字段。");
             return;
           }
           const enPrefix = enFields[0].dataset.field.replace(/\d+$/, "");
           const cnPrefix = cnFields[0].dataset.field.replace(/\d+$/, "");
           const limit = Math.min(enFields.length, cnFields.length);
           let filledCount = 0;
           for (let i = 1; i < rows.length && i <= limit; i++) {
             const row = rows[i] || [];
             const enTerm = (row[1] || "").toString().trim();
             const cnTerm = (row[2] || "").toString().trim();
             const enEl = root.querySelector(`[data-field="${enPrefix}${i}"]`);
             const cnEl = root.querySelector(`[data-field="${cnPrefix}${i}"]`);
             if (enEl) enEl.value = enTerm;
             if (cnEl) cnEl.value = cnTerm;
             if (enTerm || cnTerm) filledCount++;
           }
           syncSectionByRoot(step, root);
           alert(`成功导入 ${filledCount} 条术语。`);
         } catch (err) {
           console.error(err);
           alert("解析 Excel 文件时出错，请检查文件格式。");
         } finally {
           input.value = "";
         }
       };
       reader.readAsArrayBuffer(file);
     });
   });
 };

// --- Helpers ---
const formatFileMeta = (files) => {
  if (!files || files.length === 0) return "未选择文件";
  const list = Array.from(files);
  const totalKb = Math.round(list.reduce((sum, file) => sum + file.size, 0) / 1024);
  return `已选择: ${list.length} 个文件，共 ${totalKb} KB`;
};

const buildZipFromFiles = async (files) => {
  if (!files || files.length === 0) {
    alert("请先选择文件。");
    return;
  }
  alert("文件打包功能演示：已收到 " + files.length + " 个文件。");
};

const formatReviewResult = (text) => {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withStrong = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const blocks = withStrong.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter(Boolean);
    const isList = lines.every(line => /^[-*]|\d+\./.test(line.trim()));
    if (isList) {
      const items = lines.map(line => {
        const itemText = line.replace(/^[-*]\s*|\d+\.\s*/, "");
        return `<li>${itemText}</li>`;
      }).join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${lines.join("<br>")}</p>`;
  });

  return blocks.join("");
};

const buildMarkdownFromPage = (step) => {
  const lines = [];
  const title = document.title || "材料包";
  const now = new Date().toISOString();
  lines.push(`# ${title}`);
  if (step) lines.push(`- Step: ${step.toUpperCase()}`);
  if (currentUser?.email) lines.push(`- User: ${currentUser.email}`);
  lines.push(`- Exported: ${now}`);
  lines.push("");

  const sections = document.querySelectorAll("[data-section]");
  const roots = sections.length > 0 ? Array.from(sections) : [document.body];

  roots.forEach((root) => {
    const sectionTitle = root.querySelector("h2")?.textContent?.trim() || root.dataset.section || "未命名模块";
    lines.push(`## ${sectionTitle}`);

    const deliverable = root.querySelector("[data-deliverable]");
    if (deliverable) {
      const text = (deliverable.value || "").trim();
      if (text) {
        lines.push("### 主要内容");
        lines.push(text);
        lines.push("");
      }
    }

    const fileMeta = root.querySelector("[data-file-meta]");
    if (fileMeta) {
      const metaText = (fileMeta.textContent || "").trim();
      if (metaText) {
        lines.push("### 附件信息");
        lines.push(metaText);
        lines.push("");
      }
    }

    const fieldEls = Array.from(root.querySelectorAll("[data-field]"));
    if (fieldEls.length > 0) {
      lines.push("### 补充字段");
      fieldEls.forEach((el) => {
        const label = el.closest(".field")?.querySelector("label")?.textContent?.trim()
          || el.dataset.field
          || el.name
          || "字段";
        const value = (el.value || "").trim();
        lines.push(`- ${label}: ${value || "（未填写）"}`);
      });
      lines.push("");
    }
  });

  lines.push("## AI 日志");
  const logs = currentStepData.aiLog || [];
  if (logs.length === 0) {
    lines.push("暂无 AI 记录。");
  } else {
    logs.forEach((entry) => {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "未知时间";
      lines.push(`- 工具: ${entry.tool || "未知"}`);
      lines.push(`- 时间: ${time}`);
      lines.push(`- 输入: ${entry.input || "（空）"}`);
      lines.push(`- 输出: ${entry.output || "（无输出）"}`);
      lines.push("");
    });
  }
  lines.push("");

  return lines.join("\n").trim() + "\n";
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const buildZip = (files) => {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralChunks = [];
  let offset = 0;

  const writeUint16LE = (arr, offset, value) => {
    arr[offset] = value & 0xff;
    arr[offset + 1] = (value >> 8) & 0xff;
  };
  const writeUint32LE = (arr, offset, value) => {
    arr[offset] = value & 0xff;
    arr[offset + 1] = (value >> 8) & 0xff;
    arr[offset + 2] = (value >> 16) & 0xff;
    arr[offset + 3] = (value >> 24) & 0xff;
  };

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (data) => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20);
    writeUint16LE(localHeader, 6, 0);
    writeUint16LE(localHeader, 8, 0);
    writeUint16LE(localHeader, 10, 0);
    writeUint16LE(localHeader, 12, 0);
    writeUint32LE(localHeader, 14, crc);
    writeUint32LE(localHeader, 18, data.length);
    writeUint32LE(localHeader, 22, data.length);
    writeUint16LE(localHeader, 26, nameBytes.length);
    writeUint16LE(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(centralHeader, 0, 0x02014b50);
    writeUint16LE(centralHeader, 4, 20);
    writeUint16LE(centralHeader, 6, 20);
    writeUint16LE(centralHeader, 8, 0);
    writeUint16LE(centralHeader, 10, 0);
    writeUint16LE(centralHeader, 12, 0);
    writeUint16LE(centralHeader, 14, 0);
    writeUint32LE(centralHeader, 16, crc);
    writeUint32LE(centralHeader, 20, data.length);
    writeUint32LE(centralHeader, 24, data.length);
    writeUint16LE(centralHeader, 28, nameBytes.length);
    writeUint16LE(centralHeader, 30, 0);
    writeUint16LE(centralHeader, 32, 0);
    writeUint16LE(centralHeader, 34, 0);
    writeUint16LE(centralHeader, 36, 0);
    writeUint32LE(centralHeader, 38, 0);
    writeUint32LE(centralHeader, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);

  const endRecord = new Uint8Array(22);
  writeUint32LE(endRecord, 0, 0x06054b50);
  writeUint16LE(endRecord, 4, 0);
  writeUint16LE(endRecord, 6, 0);
  writeUint16LE(endRecord, 8, files.length);
  writeUint16LE(endRecord, 10, files.length);
  writeUint32LE(endRecord, 12, centralSize);
  writeUint32LE(endRecord, 16, centralOffset);
  writeUint16LE(endRecord, 20, 0);

  const allChunks = [...chunks, ...centralChunks, endRecord];
  const totalSize = allChunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(totalSize);
  let pos = 0;
  allChunks.forEach((c) => {
    out.set(c, pos);
    pos += c.length;
  });
  return out;
};

const bindExportButtons = (step) => {
  document.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-section]").forEach((root) => syncSectionByRoot(step, root));
      const markdown = buildMarkdownFromPage(step);
      const encoder = new TextEncoder();
      const filename = `${step || "materials"}-materials.md`;
      const zipName = `${step || "materials"}-materials.zip`;
      const zipData = buildZip([{ name: filename, data: encoder.encode(markdown) }]);
      downloadBlob(new Blob([zipData], { type: "application/zip" }), zipName);
    });
  });
};

const renderAiLog = () => {
  const logBox = document.querySelector("[data-ai-log]");
  if (!logBox) return;
  const logs = currentStepData.aiLog || [];
  logBox.innerHTML = "";
  if (logs.length === 0) {
    logBox.textContent = "暂无 AI 记录。";
    return;
  }
  logs.slice().reverse().forEach((entry) => {
    const item = document.createElement("div");
    item.className = "ai-log-item";
    const time = new Date(entry.timestamp).toLocaleString();
    const output = entry.output || "";
    const outputPreview = output.length > 200 ? `${output.slice(0, 200)}...` : output;
    item.innerHTML = `
      <div><strong>${entry.tool}</strong> <span class="text-muted">${time}</span></div>
      <div class="text-muted">输入：${entry.input || "（空）"}</div>
      <div>输出：${outputPreview || "（无输出）"}</div>
    `;
    logBox.appendChild(item);
  });
};

const addAiLog = (step, entry) => {
  currentStepData.aiLog = currentStepData.aiLog || [];
  currentStepData.aiLog.push({
    tool: entry.tool,
    input: entry.input,
    output: entry.output,
    timestamp: new Date().toISOString()
  });
  renderAiLog();
  triggerSave(step);
};

// --- Gantt Chart ---
const parseDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const renderGanttChart = (root) => {
  const chart = root.querySelector("[data-gantt-chart]");
  const body = root.querySelector("[data-gantt-body]");
  if (!chart || !body) return;
  
  const rows = Array.from(body.querySelectorAll("tr"));
  const items = rows.map(row => {
    const inputs = row.querySelectorAll("input");
    return {
      name: inputs[0]?.value,
      start: parseDate(inputs[1]?.value),
      end: parseDate(inputs[2]?.value),
      owner: inputs[3]?.value
    };
  }).filter(i => i.name && i.start && i.end);
  
  if (items.length === 0) {
    chart.innerHTML = '<div class="gantt-empty">请填写完整信息生成图表。</div>';
    return;
  }
  
  const minTime = Math.min(...items.map(i => i.start.getTime()));
  const maxTime = Math.max(...items.map(i => i.end.getTime()));
  const total = Math.max(1, maxTime - minTime);
  
  chart.innerHTML = "";
  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "gantt-row";
    
    const label = document.createElement("div");
    label.className = "gantt-label";
    label.textContent = item.name;
    
    const track = document.createElement("div");
    track.className = "gantt-track";
    
    const bar = document.createElement("div");
    bar.className = "gantt-bar";
    const left = (item.start.getTime() - minTime) / total * 100;
    const width = (item.end.getTime() - item.start.getTime()) / total * 100;
    
    bar.style.left = `${left}%`;
    bar.style.width = `${Math.max(1, width)}%`;
    bar.textContent = item.owner || "";
    
    track.appendChild(bar);
    row.appendChild(label);
    row.appendChild(track);
    chart.appendChild(row);
  });
};

const buildGanttRow = () => {
  const tr = document.createElement("tr");
  const cols = ["里程碑", "2025-01-01", "2025-01-10", "责任人", "标准"];
  cols.forEach(ph => {
    const td = document.createElement("td");
    td.style.padding = "8px";
    td.style.border = "1px solid var(--line)";
    const input = document.createElement("input");
    input.placeholder = ph;
    td.appendChild(input);
    tr.appendChild(td);
  });
  return tr;
};

const initGanttTables = () => {
  document.querySelectorAll("[data-gantt-body]").forEach(body => {
    if (body.querySelectorAll("tr").length === 0) {
      for(let i=0; i<3; i++) body.appendChild(buildGanttRow());
    }
  });
  
  document.querySelectorAll("[data-gantt-add]").forEach(btn => {
    btn.onclick = () => {
      const body = btn.closest(".panel").querySelector("[data-gantt-body]");
      body.appendChild(buildGanttRow());
    };
  });
  
  document.querySelectorAll("[data-gantt-render]").forEach(btn => {
    btn.onclick = () => {
      renderGanttChart(btn.closest(".panel"));
    };
  });
};

// --- Initialization ---
window.addEventListener("DOMContentLoaded", async () => {
  currentUser = checkAuth();
  if (!currentUser && !window.location.pathname.endsWith("login.html")) return;
  if (!currentUser) return;

  const step = document.body.dataset.step;
  if (step && step !== "index") {
    await loadStepData(step);
    bindWorkspace(step);
    bindExcelTools(step);
    bindAiTools(step);
    bindExportButtons(step);
    initGanttTables();
    injectReviewUI(step);
    injectAssessmentUI(step);
    initProjectCharterUI(step);
    renderAiLog();
  }
  
  renderKnowledgePanel();
  renderTaskObjectives(step);
  renderKnowledgeBoard();
  initTutorial();
  highlightNav();
  checkTeacherFeedback();
});

// --- Teacher Feedback ---
const checkTeacherFeedback = async () => {
  if (!currentUser) return;
  try {
    // We reuse the load_progress API to check for 'feedback' step
    const data = await apiCall(`/load_progress?userId=${currentUser.id}&stepId=feedback`);
    if (data && data.text) {
      showTeacherFeedbackNotification(data.text);
    }
  } catch (e) {
    // ignore error if no feedback found
  }
};

const showTeacherFeedbackNotification = (text) => {
  if (document.querySelector('.feedback-toast')) return;
  
  const toast = document.createElement('div');
  toast.className = 'feedback-toast';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-left: 4px solid #0052cc;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 16px;
    border-radius: 4px;
    z-index: 9999;
    max-width: 320px;
    animation: slideIn 0.3s ease-out;
  `;
  
  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <strong style="color:#0052cc">👨‍🏫 老师的新反馈</strong>
      <button style="border:none; background:none; cursor:pointer; font-size:16px;" onclick="this.parentElement.parentElement.remove()">&times;</button>
    </div>
    <div style="font-size:14px; line-height:1.5; color:#333; max-height:200px; overflow-y:auto;">
      ${text.replace(/\n/g, '<br>')}
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Add animation style if not exists
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
};

// --- UI Components (Knowledge Panel & Tutorial) ---

const showKpDetail = (kpId) => {
  if (!window.KNOWLEDGE_BASE) return;
  const kp = window.KNOWLEDGE_BASE.knowledgePoints[kpId];
  if (!kp) return;
  
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay active"; 
  
  const modal = document.createElement("div");
  modal.className = "tutorial-modal";
  modal.style.height = "auto";
  modal.style.maxHeight = "80vh";
  modal.style.width = "600px";
  
  modal.innerHTML = `
    <div class="tutorial-header">
      <h2>${kpId} ${kp.ChineseName}</h2>
      <button class="tutorial-close">&times;</button>
    </div>
    <div class="tutorial-body">
      <p><strong>English Name:</strong> ${kp.EnglishName}</p>
      <p><strong>Definition:</strong> ${kp.Definition}</p>
      ${kp.Includes ? `<p><strong>Includes:</strong></p><ul>${kp.Includes.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
      ${kp.Deliverables ? `<p><strong>Deliverables:</strong></p><ul>${kp.Deliverables.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
      ${kp.Pitfalls ? `<p><strong>Pitfalls:</strong></p><ul>${kp.Pitfalls.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="tutorial-footer">
      <button class="button" onclick="this.closest('.tutorial-overlay').remove()">Close</button>
    </div>
  `;
  
  modal.querySelector(".tutorial-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
};

const showResourceDetail = (resId) => {
  if (!window.KNOWLEDGE_BASE || !window.KNOWLEDGE_BASE.resources) return;
  const res = window.KNOWLEDGE_BASE.resources[resId];
  if (!res) return;
  
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay active"; 
  
  const modal = document.createElement("div");
  modal.className = "tutorial-modal";
  modal.style.height = "auto";
  modal.style.maxHeight = "60vh";
  modal.style.width = "500px";
  
  let contentHtml = '';
  if (res.type === 'link') {
    contentHtml = `<p><strong>链接资源：</strong><a href="${res.content}" target="_blank">${res.content}</a></p>`;
  } else {
    contentHtml = `<p><strong>文件资源：</strong>${res.content}</p><p class="text-muted"><small>（此处为模拟文件，实际环境中可提供下载）</small></p>`;
  }

  modal.innerHTML = `
    <div class="tutorial-header">
      <h2>资源详情 ${resId}</h2>
      <button class="tutorial-close">&times;</button>
    </div>
    <div class="tutorial-body">
      ${contentHtml}
    </div>
    <div class="tutorial-footer">
      <button class="button" onclick="this.closest('.tutorial-overlay').remove()">Close</button>
    </div>
  `;
  
  modal.querySelector(".tutorial-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
};

const renderTaskObjectives = (stepId) => {
  const panel = document.querySelector("main aside.panel");
  if (!panel || !window.KNOWLEDGE_BASE) return;
  
  const stage = window.KNOWLEDGE_BASE.stages.find(s => s.stageId === (stepId || "").toUpperCase());
  if (!stage) return;
  
  let html = `
    <h2>任务目标</h2>
    <p>${stage.objective}</p>
    <div class="task-list">
  `;
  
  stage.tasks.forEach(task => {
    const kps = task.knowledgePointIds || [];
    html += `
      <div class="task-item">
        <div class="task-item-content">
          <strong>${task.taskId} ${task.title}</strong>
          <p>${task.objective}</p>
        </div>
        <div class="task-kps">
          <div class="task-kps-title">知识点</div>
          <ul>
            ${kps.map(kpId => {
              const kp = window.KNOWLEDGE_BASE?.knowledgePoints?.[kpId];
              const name = kp ? kp.ChineseName : kpId;
              return `<li>${kpId} ${name}</li>`;
            }).join("")}
          </ul>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  panel.innerHTML = html;
  
  panel.querySelectorAll(".task-kps li").forEach(item => {
    const text = item.textContent || "";
    const kpId = text.split(" ")[0];
    if (kpId) {
      item.addEventListener("click", () => showKpDetail(kpId));
      item.style.cursor = "pointer";
    }
  });
};

const buildKnowledgeItem = (id) => {
  if (!window.KNOWLEDGE_BASE) return `<span>${id}</span>`;
  const kp = window.KNOWLEDGE_BASE.knowledgePoints[id];
  if (!kp) return `<span>${id}</span>`;

  return `
    <details class="kb-item">
      <summary>${id} ${kp.ChineseName}</summary>
      <div class="kb-body">
        <p><strong>定义：</strong>${kp.Definition}</p>
      </div>
    </details>
  `;
};

const renderKnowledgePanel = () => {
  const panel = document.querySelector("[data-knowledge-panel]");
  if (!panel || !window.KNOWLEDGE_BASE) return;
  const content = panel.querySelector("[data-knowledge-content]") || panel;
  const stepId = (document.body.dataset.step || "").toUpperCase();
  const stage = window.KNOWLEDGE_BASE.stages?.find((item) => item.stageId === stepId);

  content.innerHTML = "";
  if (!stage) {
    content.innerHTML = '<div class="kb-empty">暂无知识点配置</div>';
    return;
  }

  stage.tasks.forEach((task) => {
    const wrap = document.createElement("div");
    wrap.className = "kb-task";
    wrap.innerHTML = `
      <div class="kb-task-head">
        <strong>${task.taskId} ${task.title}</strong>
        <span class="kb-count">${task.knowledgePointIds.length} KP</span>
      </div>
    `;
    
    // Add KP items
    task.knowledgePointIds.forEach(id => {
      const el = document.createElement('div');
      el.innerHTML = buildKnowledgeItem(id);
      wrap.appendChild(el.firstElementChild);
    });
    
    content.appendChild(wrap);
  });
};

const renderKnowledgeBoard = () => {
  const board = document.querySelector("[data-knowledge-board]");
  if (!board || !window.KNOWLEDGE_BASE) return;
  
  board.innerHTML = "";
  window.KNOWLEDGE_BASE.stages.forEach(stage => {
    const stageLabel = stage.stageName || stage.title || "";
    const el = document.createElement("details");
    el.className = "kb-stage";
    el.innerHTML = `
      <summary>
        <strong>${stage.stageId} ${stageLabel}</strong>
        <span>${stage.tasks.length} Tasks</span>
      </summary>
      <div class="kb-stage-body"></div>
    `;
    const body = el.querySelector(".kb-stage-body");
    stage.tasks.forEach(task => {
      task.knowledgePointIds.forEach(kpId => {
        const item = document.createElement("div");
        item.innerHTML = buildKnowledgeItem(kpId);
        body.appendChild(item.firstElementChild);
      });
    });
    board.appendChild(el);
  });
};

// --- Full Tutorial with Tabs & Flow ---
const initTutorial = () => {
  const step = document.body.dataset.step;
  if (!step || !window.STEP_CONFIG || !window.STEP_CONFIG[step]) return;
  
  const config = window.STEP_CONFIG[step];
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  
  // Create Modal Structure
  const modal = document.createElement("div");
  modal.className = "tutorial-modal";
  
  // 1. Header
  const header = document.createElement("div");
  header.className = "tutorial-header";
  header.innerHTML = `
    <h2>${config.title} - 知识导览</h2>
    <button class="tutorial-close">&times;</button>
  `;
  header.querySelector(".close")?.addEventListener("click", () => overlay.remove()); // Safety
  header.querySelector(".tutorial-close").addEventListener("click", () => overlay.remove());

  // 2. Tabs
  const tabs = document.createElement("div");
  tabs.className = "tutorial-tabs";
  tabs.innerHTML = `
    <div class="tutorial-tab active" data-tab="flow">知识脉络</div>
    <div class="tutorial-tab" data-tab="case">典型案例</div>
  `;
  
  // 3. Body Container
  const body = document.createElement("div");
  body.className = "tutorial-body";
  
  // 3a. Flow Content
  const flowContent = document.createElement("div");
  flowContent.className = "tutorial-content active";
  flowContent.id = "tab-flow";
  
  const flowWrap = document.createElement("div");
  flowWrap.className = "tutorial-flow";
  
  config.tasks.forEach((task, index) => {
    const taskEl = document.createElement("div");
    taskEl.className = "flow-task";
    taskEl.innerHTML = `
      <div class="flow-task-marker">${index + 1}</div>
      <div class="flow-task-content">
        <div class="flow-task-header">
          <h4 class="flow-task-title">${task.title}</h4>
        </div>
        <div class="flow-connection-label">Linked Knowledge Points</div>
        <div class="flow-kps-grid"></div>
      </div>
    `;
    
    const grid = taskEl.querySelector(".flow-kps-grid");
    task.kps.forEach(kpId => {
      const kp = window.KNOWLEDGE_BASE.knowledgePoints[kpId];
      if (kp) {
        const card = document.createElement("div");
        card.className = "flow-kp-card";
        card.innerHTML = `
          <span class="flow-kp-code">${kpId}</span>
          <div class="flow-kp-name">${kp.ChineseName}</div>
          <div class="flow-kp-desc-tooltip">${kp.Definition}</div>
        `;
        grid.appendChild(card);
      }
    });
    
    flowWrap.appendChild(taskEl);
  });
  
  flowContent.appendChild(flowWrap);
  
  // 3b. Case Content
  const caseContent = document.createElement("div");
  caseContent.className = "tutorial-content";
  caseContent.id = "tab-case";
  
  const caseData = window.CASE_STUDIES && window.CASE_STUDIES[step];
  if (caseData) {
    caseContent.innerHTML = `
      <div class="case-study-box">
        ${caseData.content}
      </div>
    `;
  } else {
    caseContent.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;">暂无案例数据</div>';
  }
  
  // 4. Footer
  const footer = document.createElement("div");
  footer.className = "tutorial-footer";
  const startBtn = document.createElement("button");
  startBtn.className = "button";
  startBtn.textContent = "开始任务";
  startBtn.onclick = () => overlay.remove();
  footer.appendChild(startBtn);
  
  // Assemble
  body.appendChild(flowContent);
  body.appendChild(caseContent);
  
  modal.appendChild(header);
  modal.appendChild(tabs);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  
  document.body.appendChild(overlay);
  
  // Tab Logic
  const tabEls = tabs.querySelectorAll(".tutorial-tab");
  tabEls.forEach(t => {
    t.onclick = () => {
      // Remove active class from all tabs and contents
      tabEls.forEach(x => x.classList.remove("active"));
      body.querySelectorAll(".tutorial-content").forEach(x => x.classList.remove("active"));
      
      // Activate clicked tab
      t.classList.add("active");
      const targetId = `tab-${t.dataset.tab}`;
      document.getElementById(targetId).classList.add("active");
    };
  });

  setTimeout(() => overlay.classList.add("active"), 100);
};

const highlightNav = () => {
  const current = document.body.dataset.step || "index";
  document.querySelectorAll(".nav-link").forEach((link) => {
    const dataTarget = link.dataset.nav;
    let target = "";
    if (dataTarget) {
      target = dataTarget;
    } else {
      const href = link.getAttribute("href") || "";
      const m = href.match(/(s\d+)\.html$/);
      if (/index\.html$/.test(href)) target = "index";
      else if (m) target = m[1];
    }
    if (target && target === current) link.classList.add("active");
  });
};

// --- Project Charter UI ---
const initProjectCharterUI = (step) => {
  if (!step) return;
  const root = document.querySelector('.panel[data-section="t1.2"]');
  if (!root) return;

  const budgetList = root.querySelector('.budget-list');
  const deliverableList = root.querySelector('.deliverable-list');
  const personList = root.querySelector('.person-list');
  const previewBox = root.querySelector('.charter-preview');
  const previewBody = root.querySelector('.charter-preview-body');

  const makeRow = (placeholderLeft, placeholderRight, leftName, rightName) => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex'; wrap.style.gap = '8px'; wrap.style.marginBottom = '6px';
    const left = document.createElement('input'); left.placeholder = placeholderLeft; left.dataset.field = leftName; left.style.flex = '1';
    const right = document.createElement('input'); right.placeholder = placeholderRight; right.dataset.field = rightName; right.style.width = '160px';
    const rm = document.createElement('button'); rm.className = 'button ghost small'; rm.textContent = '删除';
    rm.onclick = () => { wrap.remove(); triggerSave(step); };
    wrap.appendChild(left); wrap.appendChild(right); wrap.appendChild(rm);
    return wrap;
  };

  root.querySelectorAll('[data-budget-add]').forEach(btn => btn.onclick = () => {
    const idx = Date.now();
    const row = makeRow('预算项（例如：译者费）', '金额 (CNY)', `budget_item_${idx}`, `budget_amount_${idx}`);
    budgetList.appendChild(row);
    triggerSave(step);
  });

  root.querySelectorAll('[data-deliverable-add]').forEach(btn => btn.onclick = () => {
    const idx = Date.now();
    const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.marginBottom='6px';
    const inp = document.createElement('input'); inp.placeholder='交付成果描述'; inp.dataset.field = `deliverable_${idx}`; inp.style.flex='1';
    const rm = document.createElement('button'); rm.className='button ghost small'; rm.textContent='删除'; rm.onclick = ()=>{ wrap.remove(); triggerSave(step); };
    wrap.appendChild(inp); wrap.appendChild(rm); deliverableList.appendChild(wrap); triggerSave(step);
  });

  root.querySelectorAll('[data-person-add]').forEach(btn => btn.onclick = () => {
    const idx = Date.now();
    const row = makeRow('人员姓名', '角色/职责', `person_name_${idx}`, `person_role_${idx}`);
    personList.appendChild(row); triggerSave(step);
  });

  // SMART suggest uses AI tool if available; fallback no-op
  root.querySelectorAll('[data-smart-suggest]').forEach(btn => btn.onclick = async () => {
    const spec = document.querySelector('[data-field="objective_specific"]').value || '';
    try {
      btn.disabled = true; btn.textContent = '生成中...';
      const res = await apiCall('/ai-completion', 'POST', { toolId: 'AI01', context: spec || '请协助生成 SMART 目标' });
      // naive split into lines and fill fields if matches
      const txt = res.result || '';
      if (txt) {
        const lines = txt.split('\n');
        if (lines[0]) document.querySelector('[data-field="objective_specific"]').value = lines[0].trim();
        if (lines[1]) document.querySelector('[data-field="objective_measurable"]').value = lines[1].trim();
        if (lines[2]) document.querySelector('[data-field="objective_achievable"]').value = lines[2].trim();
        if (lines[3]) document.querySelector('[data-field="objective_relevant"]').value = lines[3].trim();
        if (lines[4]) document.querySelector('[data-field="objective_timebound"]').value = lines[4].trim();
        triggerSave(step);
      }
    } catch (e) {
      alert('SMART 生成失败: ' + e.message);
    } finally { btn.disabled = false; btn.textContent = 'AI 帮助生成 SMART'; }
  });

  root.querySelectorAll('[data-generate-charter]').forEach(btn => btn.onclick = () => {
    const get = (selector) => root.querySelector(selector)?.value || '';
    const project = get('[data-field="project_name"]');
    const smart = [get('[data-field="objective_specific"]'), get('[data-field="objective_measurable"]'), get('[data-field="objective_achievable"]'), get('[data-field="objective_relevant"]'), get('[data-field="objective_timebound"]')];
    const budget = get('[data-field="budget_total"]');
    // collect dynamic lists
    const budgets = Array.from(budgetList.querySelectorAll('div')).map(div => {
      const k = div.querySelector('input[data-field^="budget_item_"]')?.value || '';
      const v = div.querySelector('input[data-field^="budget_amount_"]')?.value || '';
      return k ? `- ${k}: ${v}` : null;
    }).filter(Boolean);
    const deliverables = Array.from(deliverableList.querySelectorAll('input')).map(i=>i.value).filter(Boolean);
    // include any AI-generated deliverable textarea content
    const aiDeliverable = root.querySelector('[data-deliverable]')?.value || '';
    if (aiDeliverable) deliverables.unshift(aiDeliverable);
    const persons = Array.from(personList.querySelectorAll('div')).map(div=>{
      const name = div.querySelector('input[data-field^="person_name_"]')?.value || '';
      const role = div.querySelector('input[data-field^="person_role_"]')?.value || '';
      return name ? `- ${name} (${role})` : null;
    }).filter(Boolean);
    const scope = get('[data-field="scope_and_risks"]');
    const roles = get('[data-field="roles_responsibilities"]');
    // collect gantt rows to include in charter
    const ganttBody = root.querySelector('[data-gantt-body]');
    const ganttRows = [];
    if (ganttBody) {
      Array.from(ganttBody.querySelectorAll('tr')).forEach(tr => {
        const inputs = tr.querySelectorAll('input');
        const name = inputs[0]?.value || '';
        const start = inputs[1]?.value || '';
        const end = inputs[2]?.value || '';
        const owner = inputs[3]?.value || '';
        const accept = inputs[4]?.value || '';
        if (name) ganttRows.push({ name, start, end, owner, accept });
      });
    }

    const lines = [];
    lines.push(`# 项目章程：${project}`);
    lines.push(`\n## 目标（SMART）\n${smart.map((s,i)=>`${['S','M','A','R','T'][i]}: ${s}`).join('\n')}`);
    lines.push(`\n## 预算\n总预算: ${budget}\n${budgets.join('\n')}`);
    lines.push(`\n## 可交付成果\n${deliverables.map(d=>`- ${d}`).join('\n')}`);
    if (ganttRows.length > 0) {
      lines.push('\n## 里程碑计划（甘特表）');
      const header = '| 里程碑 | 开始 | 结束 | 责任人 | 验收标准 |';
      const divider = '|---|---|---|---|---|';
      lines.push(header);
      lines.push(divider);
      ganttRows.forEach(r => {
        lines.push(`| ${r.name} | ${r.start} | ${r.end} | ${r.owner} | ${r.accept} |`);
      });
    }
    lines.push(`\n## 范围与风险\n${scope}`);
    lines.push(`\n## 人员名单\n${persons.join('\n')}`);
    lines.push(`\n## 团队角色与职责\n${roles}`);

    previewBody.textContent = lines.join('\n\n');
    previewBox.style.display = 'block';
  });

  root.querySelectorAll('[data-export-charter]').forEach(btn => btn.onclick = () => {
    const pre = root.querySelector('.charter-preview-body');
    const text = pre.textContent || '';
    if (!text) { alert('请先生成章程预览'); return; }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = (document.querySelector('[data-field="project_name"]')?.value || 'charter') + '.md'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
};
