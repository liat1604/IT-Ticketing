import sys,zipfile,hashlib
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
p=Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\tmp\uat\actual-template\reference.docx')
d=Document(str(p))
print('STYLES')
for name in ['Normal','Body Text','Subtitle','Heading 1','Heading 2','List Paragraph']:
 try: st=d.styles[name]
 except KeyError: continue
 print(name,'font=',st.font.name,'size=',st.font.size.pt if st.font.size else None,'bold=',st.font.bold,'italic=',st.font.italic,'color=',str(st.font.color.rgb) if st.font.color and st.font.color.rgb else None,'paragraph=',st._element.pPr.xml if st._element.pPr is not None else '')
print('\nBODY SEQUENCE')
for bi,el in enumerate(d.element.body.iterchildren()):
 if el.tag==qn('w:p'):
  pa=Paragraph(el,d)
  if pa.text.strip():
   print('P',bi,pa.style.name,repr(pa.text[:180]))
 elif el.tag==qn('w:tbl'):
  t=Table(el,d)
  print('TABLE',bi,'rows',len(t.rows),'grid',[int(g.get(qn('w:w'))) for g in el.tblGrid.gridCol_lst])
  for ri,row in enumerate(t.rows):
   print(' ROW',ri,'cantSplit',row._tr.trPr.xml if row._tr.trPr is not None else '')
   for ci,c in enumerate(row.cells):
    texts=[]
    for sub in c.paragraphs:
     if sub.text.strip():
      runs=[]
      for r in sub.runs:
       if r.text.strip():
        color=str(r.font.color.rgb) if r.font.color and r.font.color.rgb else None
        runs.append(f'{r.text[:48]!r}(font={r.font.name},sz={r.font.size.pt if r.font.size else None},b={r.bold},i={r.italic},c={color})')
      texts.append(f'[{sub.style.name},align={sub.alignment}] '+','.join(runs))
    tcpr=c._tc.tcPr
    shade=tcpr.find(qn('w:shd')); fill=shade.get(qn('w:fill')) if shade is not None else None
    borders=tcpr.find(qn('w:tcBorders'))
    print(f'  CELL {ci} width={c.width.twips if c.width else None} gridSpan={tcpr.find(qn("w:gridSpan")).get(qn("w:val")) if tcpr.find(qn("w:gridSpan")) is not None else None} fill={fill} paras:',*texts,sep='\n    ')
    for ni,nt in enumerate(c.tables):
     print('    NESTED TABLE',ni,'rows',len(nt.rows),'grid',[cc.width.twips if cc.width else None for cc in nt.columns])
     for nr,nrow in enumerate(nt.rows):
      print('     NR',nr,' | '.join(' / '.join(pp.text for pp in nc.paragraphs) for nc in nrow.cells))
      for nc in nrow.cells:
       for np in nc.paragraphs:
        for rr in np.runs:
         if rr.text.strip():
          print('      RUN',repr(rr.text[:70]),'sz',rr.font.size.pt if rr.font.size else None,'font',rr.font.name,'bold',rr.bold,'italic',rr.italic,'color',str(rr.font.color.rgb) if rr.font.color and rr.font.color.rgb else None)
print('\nSECTIONS')
for i,s in enumerate(d.sections):
 print(i, 'headers', [p.text for p in s.header.paragraphs], 'footers', [p.text for p in s.footer.paragraphs], 'firstfooter',[p.text for p in s.first_page_footer.paragraphs])
with zipfile.ZipFile(p) as z:
 print('\nPARTS')
 for n in z.namelist():
  b=z.read(n); print(n,len(b),hashlib.sha256(b).hexdigest())
