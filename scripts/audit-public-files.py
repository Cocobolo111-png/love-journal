"""Audit the staged publication set, including binary media structure.
Run after staging; does not inspect or modify browser storage.
"""
from pathlib import Path
import re
import struct
import subprocess
import sys
import wave

root = Path(__file__).resolve().parents[1]
files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
files = [f for f in files if f]
errors = []
text_count = 0
for name in files:
    path = root / name
    data = subprocess.check_output(['git', 'show', ':' + name], cwd=root)
    if path.is_symlink():
        errors.append(name + ': symlink')
    if len(data) > 10 * 1024 * 1024:
        errors.append(name + ': large file >10MB')
    if any(p in Path(name).parts for p in ['.git', 'node_modules', 'deploy', '.openai', 'dist', 'uploads', 'backups', '.wrangler']):
        errors.append(name + ': forbidden directory')
    if path.suffix.lower() in ['.zip', '.sql', '.db', '.sqlite', '.pem', '.key', '.dump', '.bak', '.log', '.mp4', '.mov', '.jpg', '.jpeg']:
        errors.append(name + ': unreviewed private or binary type')
    if Path(name).name.startswith('.env') and name != '.env.example':
        errors.append(name + ': environment file')
    if data.startswith(b'version https://git-lfs.github.com/spec/v1'):
        errors.append(name + ': LFS pointer')
    if path.suffix == '.png':
        assert data[:8] == b'\x89PNG\r\n\x1a\n'
        offset, chunks = 8, []
        while offset < len(data):
            size = struct.unpack('!I', data[offset:offset+4])[0]
            tag = data[offset+4:offset+8].decode('ascii')
            chunks.append(tag)
            offset += size + 12
        # caBX is AI generation provenance, not private EXIF/GPS.
        if set(chunks) - {'IHDR', 'IDAT', 'IEND', 'caBX'}:
            errors.append(name + ': unreviewed PNG metadata ' + str(chunks))
        print(name, 'PNG chunks:', ','.join(dict.fromkeys(chunks)))
    elif path.suffix == '.wav':
        offset, chunks = 12, []
        while offset < len(data):
            tag = data[offset:offset+4]
            size = struct.unpack('<I', data[offset+4:offset+8])[0]
            chunks.append(tag)
            offset += 8 + size + size % 2
        if chunks != [b'fmt ', b'data']:
            errors.append(name + ': unreviewed WAV metadata')
        with wave.open(str(path)) as audio:
            assert audio.getnchannels() == 1 and audio.getframerate() == 22050
    else:
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            errors.append(name + ': unreviewed binary')
            continue
        text_count += 1
        rules = {
            'private key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
            'credential URL': r'(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s]+:[^\s]+@',
            'absolute home path': r'/(?:Users|home)/[a-zA-Z0-9_-]+/',
            'cloud host': r'\b(?:[a-z0-9-]+\.)+(?:aliyuncs\.com|myqcloud\.com)\b',
        }
        for label, pattern in rules.items():
            if re.search(pattern, text):
                errors.append(name + ': ' + label)
print(f'Audited {len(files)} staged files ({text_count} UTF-8 text files).')
for error in errors:
    print('FAIL:', error)
sys.exit(bool(errors) or not files)
