from pathlib import Path
import zipfile,hashlib
p=Path('tmp/uat/actual-template/reference.docx')
a=Path('tmp/uat/actual-template/artifact.md')
s=a.read_text(encoding='utf-8').split('## Package inventory (reference)')[0]
rows=[]
with zipfile.ZipFile(p) as z:
 for n in z.namelist():
  b=z.read(n); cls='editable slots' if n=='word/document.xml' else 'preserve-only'
  rows.append(f'| `{n}` | {len(b)} | `{hashlib.sha256(b).hexdigest()}` | {cls} |')
tail='## Package inventory (reference)\n\n| Package part | Bytes | SHA-256 | Classification |\n|---|---:|---|---|\n'+'\n'.join(rows)+'\n'
a.write_text(s+tail,encoding='utf-8')
print('inventory entries',len(rows),'sha entries',all(len(row.split('`')[3])==64 for row in rows))
