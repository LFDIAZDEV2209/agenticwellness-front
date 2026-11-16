"""Hashes READ ONLY de sentinelas existentes, sin credenciales ni datos clínicos en salida."""
import importlib.util
import json
from pathlib import Path
import sys

root, output, phase = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
assert phase in ("before", "after")
ops = root / '.ai/operations/organizar-experiencia-bienestar'
spec = importlib.util.spec_from_file_location('protected222', ops / '4.8-fixture-helper.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
snapshot = helper.protected_snapshot()
target = output / (phase + '-protected.json')
target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, default=str) + '\n', encoding='utf-8')
if phase == 'after':
    assert snapshot == json.loads((output / 'before-protected.json').read_text(encoding='utf-8')), 'Sentinelas cambiaron durante QA'
print(json.dumps({'phase': phase, 'protectedEqual': True if phase == 'after' else None}))
