"""Build a redistributable source archive without installation identity or runtime data."""
import json
import subprocess
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
paths = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
output = root / 'public/recoord-source.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in sorted(set(paths)):
        if not relative or relative.endswith(('.zip', '.tar', '.tar.gz')):
            continue
        path = root / relative
        if not path.is_file() or path.is_symlink():
            continue
        if relative == '.openai/hosting.json':
            manifest = json.loads(path.read_text())
            manifest.pop('project_id', None)
            archive.writestr('recoord/' + relative, json.dumps(manifest, indent=2) + '\n')
        else:
            archive.write(path, 'recoord/' + relative)
print(output)
