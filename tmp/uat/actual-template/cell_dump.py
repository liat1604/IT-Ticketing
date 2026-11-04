import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
p='tmp/uat/actual-template/reference.docx'
d=Document(p); t=d.tables[0]
for i in [1,3,4,6,8,10,11]:
 c=t.rows[i].cells[0]
 print('\nROW',i,'CELL paras:')
 for j,para in enumerate(c.paragraphs): print(j,repr(para.text))
 if c.tables:
  print('NESTED:',len(c.tables))
  nt=c.tables[0]
  for ri,row in enumerate(nt.rows):
   print(' NROW',ri)
   for ci,cc in enumerate(row.cells): print('  C',ci,'PARAS',[x.text for x in cc.paragraphs])
