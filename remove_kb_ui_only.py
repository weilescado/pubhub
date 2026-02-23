import os
import re

files = [f"s{i}.html" for i in range(1, 10)]
base_dir = "/Users/wenqinchen/vscode/网页"

# 正则表达式匹配知识库模块 HTML 结构
# 匹配 <div class="panel" data-knowledge-panel> ... </div>
# 使用非贪婪匹配，确保只删除该特定的 div
kb_pattern = re.compile(
    r'\s*<div class="panel" data-knowledge-panel>\s*'
    r'<h2>知识库</h2>\s*'
    r'<p>当前步骤与任务对应的知识点与关键说明。</p>\s*'
    r'<div data-knowledge-content></div>\s*'
    r'</div>',
    re.DOTALL
)

for file_name in files:
    file_path = os.path.join(base_dir, file_name)
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue

    print(f"Processing {file_name}...")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 只删除 HTML 结构，不删除 JS 引用
    new_content = kb_pattern.sub('', content)
    
    if content != new_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {file_name}")
    else:
        print(f"No changes made to {file_name} (pattern not found)")

print("Done.")
