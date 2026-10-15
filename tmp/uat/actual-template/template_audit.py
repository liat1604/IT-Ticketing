import sys,zipfile,hashlib
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
p=Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\tmp\uat\actual-template\reference.docx')
d=Document(str(p))
def rgb(el,tag):
 x=el.find(qn(tag)); return x.get(qn('w:val')) if x is not None else None
print('FILE',p,'SHA256',hashlib.sha256(p.read_bytes()).hexdigest())
print('SECTION DATA')
for i,s in enumerate(d.sections): print(i, s.page_width/914400, s.page_height/914400, s.top_margin/914400,s.bottom_margin/914400,s.left_margin/914400,s.right_margin/914400, s.header_distance/914400,s.footer_distance/914400, 'titlepg',s.different_first_page_header_footer)
print('BLOCKS')
for bi,el in enumerate(d.element.body.iterchildren()):
 if el.tag==qn('w:p'):
  p1=Paragraph(el,d)
  print('P',bi,'style',p1.style.name,'align',p1.alignment,'before',p1.paragraph_format.space_before.pt if p1.paragraph_format.space_before else None,'after',p1.paragraph_format.space_after.pt if p1.paragraph_format.space_after else None,'keepnext',p1.paragraph_format.keep_with_next,'text',repr(p1.text[:160]))
  for run in p1.runs:
   if run.text.strip():
    print('  RUN',repr(run.text[:130]),'font',run.font.name,'size',run.font.size.pt if run.font.size else None,'bold',run.bold,'italic',run.italic,'color',run.font.color.rgb if run.font.color and run.font.color.rgb else None,'underline',run.underline)
 elif el.tag==qn('w:tbl'):
  t=Table(el,d)
  pr=el.tblPr
  print('TABLE',bi,'rows',len(t.rows),'colsgrid',[int(g.get(qn('w:w'))) for g in el.tblGrid.gridCol_lst],'width',pr.find(qn('w:tblW')).get(qn('w:w')) if pr.find(qn('w:tblW')) is not None else None,'layout',rgb(pr,'w:tblLayout'))
  for ri,row in enumerate(t.rows):
   cells=[]
   for c in row.cells:
    txt=' / '.join(pp.text.replace('\t',' ') for pp in c.paragraphs if pp.text.strip())
    tcpr=c._tc.tcPr
    shade=tcpr.find(qn('w:shd'))
    fill=shade.get(qn('w:fill')) if shade is not None else None
    w=tcpr.find(qn('w:tcW')); cw=w.get(qn('w:w')) if w is not None else None
    cells.append(f'[{cw};{fill};{txt[:120]}]')
   print(' R',ri+1,' || '.join(cells))
print('STYLES')
for name in ['Normal','Body Text','Title','Subtitle','Heading 1','Heading 2']:
 st=d.styles[name]
 print(name,'font',st.font.name,st.font.size.pt if st.font.size else None,st.font.bold,st.font.italic,st.font.color.rgb if st.font.color and st.font.color.rgb else None,'space',st.paragraph_format.space_before.pt if st.paragraph_format.space_before else None,st.paragraph_format.space_after.pt if st.paragraph_format.space_after else None)
 print(' pPr',st._element.pPr.xml if st._element.pPr is not None else '')
print('PARTS')
with zipfile.ZipFile(p) as z:
 for n in z.namelist():
  b=z.read(n); print(n,len(b),hashlib.sha256(b).hexdigest()[:16])
