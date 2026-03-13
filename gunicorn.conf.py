# gunicorn.conf.py
import multiprocessing

# 监听地址和端口
bind = "127.0.0.1:8000"

# 工作进程数
# 建议为 CPU 核心数 * 2 + 1
workers = multiprocessing.cpu_count() * 2 + 1

# 工作模式
worker_class = "sync"

# 日志配置
accesslog = "-"  # 输出到 stdout
errorlog = "-"   # 输出到 stderr
loglevel = "info"

# 超时时间
timeout = 300

# 进程名
proc_name = "publishing_lab"
