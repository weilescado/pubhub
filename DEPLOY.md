# 部署指南 (Deployment Guide)

这个项目是一个基于 Flask (后端) + 原生 HTML/JS (前端) + SQLite (数据库) 的全栈应用。
由于使用了 SQLite 文件数据库 (`publishing_lab.db`)，为了保证数据不丢失，**强烈建议使用云服务器 (VPS)** 进行部署，而不是使用无状态的 PaaS 平台 (如 Vercel/Netlify/Render 的免费版)，否则每次重启服务器数据都会重置。

以下是在 Linux 云服务器 (推荐 Ubuntu 20.04/22.04) 上的标准部署流程。

## 1. 准备工作 (本地开发环境)

在部署前，确保项目依赖包含生产级 WSGI 服务器 `gunicorn`。

1. **添加 gunicorn 到依赖**:
   ```bash
   pip install gunicorn
   pip freeze > requirements.txt
   ```

2. **检查代码**:
   确保 `server.py` 中的 `app` 对象是可导出的 (已确认)。
   确保 `.gitignore` 包含了 `.env` 和 `publishing_lab.db` (已确认)。

3. **推送代码**:
   将代码推送到 GitHub 或其他 Git 仓库，方便在服务器上拉取。

---

## 2. 服务器环境设置 (云服务器)

假设你已经购买了一台 Ubuntu 服务器，并以 `root` 或具有 `sudo` 权限的用户登录。

### 2.1 更新系统并安装基础软件
```bash
sudo apt update
sudo apt install python3-pip python3-venv nginx git -y
```

### 2.2 拉取代码
```bash
# 进入 www 目录 (推荐)
cd /var/www
# 克隆你的仓库 (替换为你的仓库地址)
sudo git clone https://github.com/your-username/your-repo.git publishing_lab
cd publishing_lab
```

### 2.3 设置 Python 虚拟环境
```bash
# 创建虚拟环境
python3 -m venv venv

# 激活环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2.4 配置环境变量
在服务器项目根目录下创建 `.env` 文件：
```bash
nano .env
```
粘贴以下内容 (记得修改为你的真实 Key):
```ini
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
SECRET_KEY=generate-a-random-secure-key-here
PORT=3000
```
按 `Ctrl+O` 保存，`Ctrl+X` 退出。

---

## 3. 配置 Gunicorn (应用服务器)

我们将使用 Systemd 来管理 Gunicorn 进程，确保它在后台运行并开机自启。

### 3.1 创建 Systemd 服务文件
```bash
sudo nano /etc/systemd/system/publishing_lab.service
```

粘贴以下内容 (注意修改 `User` 和 `WorkingDirectory`):
```ini
[Unit]
Description=Gunicorn instance to serve publishing_lab
After=network.target

[Service]
# 修改为你的服务器用户名，如果是 root 部署则写 root，推荐使用普通用户
User=root
# 组名，通常与用户名相同
Group=root
# 项目根目录路径
WorkingDirectory=/var/www/publishing_lab
# 环境变量路径
Environment="PATH=/var/www/publishing_lab/venv/bin"
# 启动命令: 绑定到 127.0.0.1:8000
ExecStart=/var/www/publishing_lab/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 server:app

[Install]
WantedBy=multi-user.target
```

### 3.2 启动并启用服务
```bash
sudo systemctl start publishing_lab
sudo systemctl enable publishing_lab
sudo systemctl status publishing_lab
```
如果状态是 `active (running)`，说明应用已成功启动在 8000 端口。

---

## 4. 配置 Nginx (反向代理)

Nginx 将作为对外的 Web 服务器，接收 80 端口流量并转发给 Gunicorn。

### 4.1 创建 Nginx 配置文件
```bash
sudo nano /etc/nginx/sites-available/publishing_lab
```

粘贴以下内容 (将 `your_domain_or_ip` 替换为你的域名或服务器 IP):
```nginx
server {
    listen 80;
    server_name your_domain_or_ip;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 如果有静态文件加载问题，可以显式配置 (本项目 server.py 已处理静态文件，通常不需要)
}
```

### 4.2 启用配置并重启 Nginx
```bash
sudo ln -s /etc/nginx/sites-available/publishing_lab /etc/nginx/sites-enabled
sudo nginx -t  # 测试配置是否有误
sudo systemctl restart nginx
```

---

## 5. 完成

现在，你应该可以通过浏览器访问 `http://你的服务器IP` 来使用你的应用了！

### 维护常用命令
- **查看应用日志**: `journalctl -u publishing_lab`
- **重启应用**: `sudo systemctl restart publishing_lab`
- **更新代码**:
  ```bash
  cd /var/www/publishing_lab
  git pull
  sudo systemctl restart publishing_lab
  ```

---

## 其他部署方式 (PaaS)

如果你不想管理服务器，可以使用 **PythonAnywhere** (推荐 Flask 初学者):
1. 注册账号。
2. 上传代码。
3. 在 Web 界面配置 WSGI 文件指向 `server.py`。
4. **注意**: 免费版无法访问外网 API (DeepSeek API 会报错)，需要升级到 $5/月的 Hacker 套餐。

**不推荐 Render/Vercel 免费版**，因为它们的文件系统是临时的，重启后你的 SQLite 数据库 (`publishing_lab.db`) 会被清空，用户数据会丢失。
