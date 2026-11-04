import sys,re
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
root=Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\tmp\uat\acceptance-audit')
for fn, pats in {
 'functional.txt':['Architecture','PDF','User Documentation','server deployment','retention','email domain','60 seconds','99.9%'],
 'technical.txt':['Architecture','Hardware-fault','JSDoc','20 minutes','README','automated backup','99.9%','98%','screenshot','Outlook','student.g.nwu.ac.za'],
 'acceptance.txt':['Hardware-fault submission','JSDoc','20 minutes','User Acceptance','15 October 2026']
}.items():
 txt=(root/fn).read_text(encoding='utf-8')
 print('\n###',fn)
 for pat in pats:
  ms=list(re.finditer(re.escape(pat),txt,re.I))
  if not ms:
   print(pat,': NOT FOUND')
   continue
  for m in ms[:3]:
   excerpt=txt[max(0,m.start()-240):m.end()+400].replace('\n',' ')
   print(f'{pat}: ...{excerpt}...')
