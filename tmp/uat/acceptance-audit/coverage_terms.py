import sys,re
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
root=Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\tmp\uat\acceptance-audit')
for fn in ('functional.txt','technical.txt'):
 txt=(root/fn).read_text(encoding='utf-8')
 print('\n###',fn)
 for pat in [r'100\s*(?:users|concurrent)',r'50\s*concurrent',r'10\s*students?',r'60\s*seconds?',r'100%\s*(?:pass|success)',r'2\s*minutes?',r'2\.0\s*seconds?',r'legacy.{0,35}(?:mail|email)',r'Network Administrator',r'VM/SSH',r'zero\s+(?:new\s+)?licensing',r'99\.9%',r'98%',r'NWU Harvard',r'Outlook',r'central.{0,20}IT']:
  ms=list(re.finditer(pat,txt,re.I))
  if ms:
   print(pat,':', ' | '.join(txt[max(0,m.start()-85):m.end()+100].replace('\n',' ') for m in ms[:3]))
  else: print(pat,': NOT FOUND')
