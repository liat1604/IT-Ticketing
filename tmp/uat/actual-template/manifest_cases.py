import json,sys
sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open('tmp/uat/manifest.json',encoding='utf-8'))
for x in d['cases'][:2]+d['cases'][-5:]:
 print('KEYS',x.keys()); print(json.dumps(x,ensure_ascii=False,indent=2)[:1200])
