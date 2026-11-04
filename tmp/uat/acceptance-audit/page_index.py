import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
for name in ('functional','technical'):
 p=Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\tmp\uat\acceptance-audit')/(name+'.txt')
 txt=p.read_text(encoding='utf-8')
 pages=txt.split('--- PAGE ')[1:]
 print('\n###',name.upper())
 for pg in pages:
  idx,body=pg.split(' ---\n',1)
  lines=[x.strip() for x in body.splitlines() if x.strip()]
  print(f"PAGE {idx}: {' | '.join(lines[:8])[:500]}")
