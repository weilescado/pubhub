# 高校国际出版流程模拟实训平台 (University International Publishing Process Simulation Training Platform)

这是一个基于 Web 的高校国际出版全流程模拟实训平台。旨在通过模拟真实的出版流程（从选题立项到结项存档），结合 AI 辅助工具，帮助学生掌握国际出版的核心技能。

## ✨ 功能特性

- **全流程模拟**：覆盖 S1 选题立项至 S9 结项存档的 9 个完整阶段。
- **AI 智能辅助**：集成 DeepSeek API，提供选题分析、邮件起草、翻译辅助、术语规范等 5 大 AI 工具。
- **知识库集成**：内置丰富的出版专业知识点和资源库，通过徽章和模态框实时查阅。
- **实时进度保存**：基于 SQLite 的自动保存机制，确保实训数据不丢失。
- **角色扮演**：模拟编辑、版权经理、翻译家等不同角色进行任务操作。

## 🛠 技术栈

### 前端 (Frontend)
- **语言**: HTML5, CSS3, JavaScript (ES6+)
- **逻辑**: 原生 JS (`app.js`) 实现 SPA 体验
- **UI**: 自定义 CSS (`styles.css`) + 响应式布局

### 后端 (Backend)
- **语言**: Python 3
- **框架**: Flask (RESTful API)
- **数据库**: SQLite (`publishing_lab.db`)
- **AI**: DeepSeek API 集成

## 📂 目录结构

```
.
├── server.py             # 后端入口 (Flask App)
├── app.js                # 前端核心逻辑
├── knowledge-base.js     # 静态知识库数据
├── publishing_lab.db     # 数据库 (自动生成)
├── *.html                # 页面文件 (S1-S9, Login, Index)
├── Dockerfile            # Docker 构建文件
├── docker-compose.yml    # Docker 编排文件
└── requirements.txt      # Python 依赖
```

## 🚀 快速开始

### 方式一：使用 Docker (推荐)

确保已安装 Docker 和 Docker Compose。

1. **配置环境变量**
   复制 `.env` 文件并填入你的 DeepSeek API Key：
   ```bash
   # .env
   DEEPSEEK_API_KEY=sk-xxxx
   SECRET_KEY=your-secret-key
   ```

2. **启动服务**
   ```bash
   docker-compose up -d --build
   ```

3. **访问应用**
   打开浏览器访问 `http://localhost:3000`

### 方式二：本地 Python 运行

1. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

2. **配置环境变量**
   创建 `.env` 文件并配置 `DEEPSEEK_API_KEY`。

3. **初始化数据库并运行**
   ```bash
   python server.py
   ```

## 📝 部署指南

本项目已配置为生产就绪状态：
- **静态托管**: Flask 已配置为直接托管静态资源。
- **Gunicorn**: `requirements.txt` 包含 Gunicorn 用于生产环境运行。
- **Docker**: 提供了完整的 `Dockerfile` 和 `docker-compose.yml`。

## 📄 许可证

MIT License
