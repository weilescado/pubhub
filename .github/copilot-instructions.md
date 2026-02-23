# Copilot 使用说明（项目专用）

目的：帮助 AI 编码代理快速进入仓库、发现关键边界、并在安全可验证的小步改动中提出补丁或建议。

快速入口（必执行的探索命令）
```bash
# 列出顶层文件，寻找项目类型线索
ls -la

# 查找常见清单/入口文件
grep -R --line-number "package.json\|pyproject.toml\|setup.py\|go.mod\|Cargo.toml\|Dockerfile" || true

# 查看 Git 状态与分支（用于判断是否处于工作树）
git status --porcelain --branch
```

如何判断“项目类型 / 架构”
- 首先查找顶级清单（`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`）决定语言与包管理器。
- 若存在 `Dockerfile` / `docker-compose.yml`，将此视为容器化服务；查看 `EXPOSE`、`CMD`、`ENTRYPOINT` 来判别运行入口。
- 若存在 `.github/workflows`，打开 CI 文件（例如 `build` / `test` job）可直接获得官方构建与测试命令。

关键位置与优先阅读的文件
- README: 项目目标与运行示例。
- `src/`, `app/`, `server/`, `pkg/`：核心代码。
- `tests/`、`spec/`、`__tests__`：验证方式与期望行为。
- `Makefile`、`package.json` scripts、`.github/workflows/*`：推荐的开发命令。

常见工作流命令示例（按发现的清单对应执行）
- Node.js: `npm install` → `npm run build` → `npm test`
- Python: `python -m venv .venv` → `pip install -r requirements.txt` → `pytest -q`
- Go: `go build ./...` → `go test ./...`
- 如果存在 `Makefile`，优先查看 `make help`。

代码风格与约定（如何发现并遵守）
- 查找 `.eslintrc`, `pyproject.toml` (black/flake8), `.prettierrc` 等，按仓库已有配置应用格式化与 lint 规则。
- 若无格式化配置，优先不自动重构大范围样式；提出小、局部改动并在 PR 描述中说明理由。

改动建议风格（用于生成补丁/提交）
- 小而明确：一次 PR 聚焦单一修复或小特性（改动文件 <~10 个且每个文件变更量较小）。
- 包含可复现的验证步骤（在 PR 描述写出如何运行相关测试/命令）。
- 遵循仓库现有测试/CI 命令；若 CI 未定义，测试运行命令应在 PR 中注明。

遇到缺失信息时的优先动作
1. 提交一个简短的问题注释（比如在 PR 或 issue），询问首选运行命令或目标平台。
2. 在本地尝试安全只读探查（`grep`, `git status`, 读取 `README` 与 CI`），并把发现写在草案中。

示例触发器（当你看到这些文件时的立即动作）
- 发现 `package.json`：打开 `scripts` 字段并记录 `build/test` 命令。
- 发现 `.github/workflows`：复制 CI 的 `run` 步骤来推断本地可运行命令。
- 发现 `Dockerfile`：记录镜像基础、端口与默认命令。

注意事项
- 本指南基于仓库可被“读到”的文件；如果仓库为空或缺少清晰入口，请先向代码库所有者询问项目类型与运行命令。
- 避免大规模自动重构或风格统一，除非仓库已有相关配置文件并且包含 CI 护栏。

要我做下一步吗？
- 我可以：1) 运行一组自动化搜索并把发现摘要贴回；2) 直接草拟 PR 内容；3) 等你提供更多仓库信息。

***
生成者：AI 代理助手（若需调整此文件，请告知要补充的具体文件/命令样例）
