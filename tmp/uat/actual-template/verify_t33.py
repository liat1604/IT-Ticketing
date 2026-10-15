import re,sys
sys.stdout.reconfigure(encoding='utf-8')
txt=open('tmp/uat/acceptance-audit/technical.txt',encoding='utf-8').read()
for p in ['power-down','reminders','hazard','danger']:
 ms=list(re.finditer(p,txt,re.I));print(p,len(ms))
 for m in ms[:8]:print(txt[max(0,m.start()-160):m.end()+320].replace('\n',' '))
