import json,sys
sys.stdout.reconfigure(encoding='utf-8')
p='tmp/uat/manifest.json'
d=json.load(open(p,encoding='utf-8'))
print('keys',d.keys())
for k,v in d.items(): print(k,type(v).__name__,len(v) if hasattr(v,'__len__') else '')
for case in d.get('cases',[]): print(case.get('id'),case.get('category'),case.get('requirement','')[:200],case.get('source',''))
