import os
import sys
import io

# Force UTF-8 for stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def get_tree(path, prefix='', exclude_dirs=None):
    if exclude_dirs is None:
        exclude_dirs = {'.git', 'node_modules', '.next', 'dist', 'output', 'tmp', '.gemini', '.claude'}
    
    try:
        entries = os.listdir(path)
    except PermissionError:
        return []
        
    entries = [e for e in entries if e not in exclude_dirs]
    
    # Sort: directories first, then files
    dirs = [e for e in entries if os.path.isdir(os.path.join(path, e))]
    files = [e for e in entries if os.path.isfile(os.path.join(path, e))]
    
    dirs.sort()
    files.sort()
    
    lines = []
    
    for i, d in enumerate(dirs):
        # The README uses 📁 for directories
        if prefix == '':
             lines.append(f"📁 {d}")
             lines.extend(get_tree(os.path.join(path, d), '│   ', exclude_dirs))
        else:
             connector = '├───' if (i < len(dirs) - 1) or (len(files) > 0) else '└───'
             lines.append(f"{prefix}{connector}{d}")
             new_prefix = prefix + ('│   ' if connector == '├───' else '    ')
             lines.extend(get_tree(os.path.join(path, d), new_prefix, exclude_dirs))
        
    for i, f in enumerate(files):
        if prefix == '':
            lines.append(f"📄 {f}")
        else:
            connector = '└───' if i == len(files) - 1 else '├───'
            lines.append(f"{prefix}{connector}{f}")
        
    return lines

root_path = os.getcwd()
tree = []
target_dirs = ['.claude', 'config', 'data', 'src']
for d in target_dirs:
    full_path = os.path.join(root_path, d)
    if os.path.exists(full_path) and os.path.isdir(full_path):
        tree.append(f"📁 {d}")
        tree.extend(get_tree(full_path, '│   '))

output_path = os.path.join(root_path, 'scratch', 'tree_output.txt')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(tree))

print(f"Tree written to {output_path}")
