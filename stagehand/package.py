"""Package only the prebuilt extension, with manifest.json at the zip root."""
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
version = json.loads((root / 'package.json').read_text())['version']
assert json.loads((root / 'dist/manifest.json').read_text())['version'] == version
artifacts = root / 'artifacts'
artifacts.mkdir(exist_ok=True)
output = artifacts / f'Stagehand-extension-{version}.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(root / 'dist'))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('manifest.json'))['version'] == version
    assert not any('node_modules' in name or name.startswith('src/') for name in archive.namelist())
print(output)
