from pathlib import Path
import ast,json,re
import pdfplumber
from docx import Document
from docx.shared import Pt,RGBColor
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT,WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH,WD_BREAK,WD_LINE_SPACING
from docx.oxml import OxmlElement,parse_xml
from docx.oxml.ns import qn,nsdecls

ROOT=Path(__file__).resolve().parents[2];TMP=ROOT/'tmp'/'uat'
OUT=ROOT/'output'/'doc'/'CSIS_IT_Ticket_Log_System_UAT_HartSpec_Style.docx'
SRC=ROOT/'output'/'pdf'/'CSIS_IT_Ticket_Log_System_UAT_HartSpec_Style.pdf'
content={}
for stmt in ast.parse((TMP/'restyle_hartspec.py').read_text(encoding='utf-8')).body:
 if isinstance(stmt,ast.Assign):
  for target in stmt.targets:
   if isinstance(target,ast.Name) and target.id in ['clarified','decisions','desc','body','refs']:
    try:content[target.id]=ast.literal_eval(stmt.value)
    except ValueError:pass
cases=json.loads((TMP/'manifest.json').read_text())['cases']
lookup={}
for item in cases:
 key=item['id'].replace('UAT-','');lookup[key]=content['clarified'].get(key,item['expected'])
chunks=[]
with pdfplumber.open(SRC) as pdf:
 for n in range(1,6):
  top=547 if n==1 else 72
  pair=[]
  for x0,x1 in [(72,323.64),(323.64,531.6)]:
   s=pdf.pages[n].crop((x0+.5,top,x1-.5,770 if n==1 else 748)).extract_text() or ''
   pair.append(re.findall(r'\((F\d{2}|T\d{2}|P\d{2}|O\d{2})\)',s))
  chunks.append(pair)
assert sum(len(v) for pair in chunks for v in pair)==79

BLUE='313896';GREEN='538135';INK='0000FF';WIDTH=459.6
D=Document()
normal=D.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(10.08)
normal.paragraph_format.space_before=Pt(0);normal.paragraph_format.space_after=Pt(0)
normal.paragraph_format.line_spacing=Pt(11)
for st in ['Title','Heading 1','Heading 2']:
 D.styles[st].font.color.rgb=RGBColor.from_string('000000')
 D.styles[st].paragraph_format.space_after=Pt(0)

def fmt(p,size=10.08,leading=11,after=0,before=0,keep=False):
 p.paragraph_format.space_before=Pt(before);p.paragraph_format.space_after=Pt(after)
 p.paragraph_format.line_spacing=Pt(leading);p.paragraph_format.keep_together=keep
 p.paragraph_format.keep_with_next=False;p.paragraph_format.widow_control=False
 return p
def run(p,s,size=10.08,color='000000',bold=False,italic=False,font='Arial'):
 r=p.add_run(s);r.font.name=font;r.font.size=Pt(size);r.font.color.rgb=RGBColor.from_string(color)
 r.bold=bold;r.italic=italic;return r
def cellmargins(cell,top=6,bottom=6,left=5.76,right=5.76):
 pr=cell._tc.get_or_add_tcPr();m=pr.find(qn('w:tcMar'))
 if m is None:m=OxmlElement('w:tcMar');pr.append(m)
 for child in list(m):m.remove(child)
 for k,v in [('top',top),('bottom',bottom),('left',left),('right',right)]:
  e=OxmlElement('w:'+k);e.set(qn('w:w'),str(round(v*20)));e.set(qn('w:type'),'dxa');m.append(e)
 cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
def shade(cell,color):
 e=OxmlElement('w:shd');e.set(qn('w:fill'),color);cell._tc.get_or_add_tcPr().append(e)
def table(parent,widths):
 t=parent.add_table(rows=0,cols=len(widths));t.alignment=WD_TABLE_ALIGNMENT.LEFT;t.autofit=False
 for col,width in zip(t.columns,widths):col.width=Pt(width)
 pr=t._tbl.tblPr
 ind=OxmlElement('w:tblInd');ind.set(qn('w:w'),'122');ind.set(qn('w:type'),'dxa');pr.append(ind)
 borders=OxmlElement('w:tblBorders')
 for edge in ['top','left','bottom','right','insideH','insideV']:
  e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'6');e.set(qn('w:color'),'000000');borders.append(e)
 pr.append(borders)
 layout=pr.find(qn('w:tblLayout'))
 if layout is None:layout=OxmlElement('w:tblLayout');pr.append(layout)
 layout.set(qn('w:type'),'fixed')
 spacing=OxmlElement('w:tblCellSpacing');spacing.set(qn('w:w'),'0');spacing.set(qn('w:type'),'dxa');pr.append(spacing)
 return t
def row(t,height=None,merge=True,margins=(6,6)):
 r=t.add_row()
 if height:r.height=Pt(max(1,height-margins[0]-margins[1]));r.height_rule=WD_ROW_HEIGHT_RULE.AT_LEAST
 cells=r.cells
 if merge and len(cells)>1:cells=(cells[0].merge(cells[-1]),)
 for c in cells:cellmargins(c,top=margins[0],bottom=margins[1]);fmt(c.paragraphs[0])
 return r,cells
def band(t,s):
 r,cs=row(t,25);c=cs[0];shade(c,BLUE);fmt(c.paragraphs[0],11.04,13)
 run(c.paragraphs[0],s,11.04,'FFFFFF',True)
 return r
def spacer(p):fmt(p,1,1);run(p,'',1)
def pagebreak():
 p=D.add_paragraph();fmt(p,1,1);p.paragraph_format.page_break_before=True
def entry(p,label,value='',bold=False,after=0):
 fmt(p,10.08,11.5,after)
 p.paragraph_format.tab_stops.add_tab_stop(Pt(105))
 run(p,label,10.08,bold=bold);run(p,'\t',9.12)
 run(p,value or '________________________________________',9.12,INK,italic=True)
def setsection(sec,top=72,bottom=72):
 sec.page_width=Pt(595.2);sec.page_height=Pt(841.92)
 sec.left_margin=Pt(72);sec.right_margin=Pt(63.6)
 sec.top_margin=Pt(top);sec.bottom_margin=Pt(bottom)
 sec.header_distance=Pt(0);sec.footer_distance=Pt(43)

cover=D.sections[0];setsection(cover)
headerp=cover.header.paragraphs[0];fmt(headerp,1,1)
r=headerp.add_run();r.add_picture(str(TMP/'cover_source_0_Im1.png'),width=Pt(600.1),height=Pt(842.9723))
drawing=r._r.find(qn('w:drawing'));inline=drawing[0]
anchor=OxmlElement('wp:anchor')
for k,v in {'distT':'0','distB':'0','distL':'0','distR':'0','simplePos':'0','relativeHeight':'0','behindDoc':'1','locked':'0','layoutInCell':'1','allowOverlap':'1'}.items():anchor.set(k,v)
simple=OxmlElement('wp:simplePos');simple.set('x','0');simple.set('y','0');anchor.append(simple)
for tag in ['positionH','positionV']:
 pos=OxmlElement('wp:'+tag);pos.set('relativeFrom','page');off=OxmlElement('wp:posOffset');off.text='0';pos.append(off);anchor.append(pos)
for tag in ['extent','effectExtent']:
 e=inline.find(qn('wp:'+tag))
 if e is not None:anchor.append(e)
anchor.append(OxmlElement('wp:wrapNone'))
for tag in ['docPr','cNvGraphicFramePr']:
 e=inline.find(qn('wp:'+tag))
 if e is not None:anchor.append(e)
anchor.append(inline.find(qn('a:graphic')));drawing.replace(inline,anchor)
for i,(s,size,color,leading) in enumerate([('User Acceptance',36,'000000',45.36),('Testing Form For',36,'000000',45.36),('CSIS IT Ticket',33,BLUE,42),('and Log System',33,BLUE,42)]):
 p=D.add_paragraph(style='Title');fmt(p,size,leading,before=280 if i==0 else 0)
 p.alignment=WD_ALIGN_PARAGRAPH.CENTER;run(p,s,size,color,True,font='Georgia')

sec=D.add_section(WD_SECTION_START.NEW_PAGE);setsection(sec,90,60)
sec.header.is_linked_to_previous=False;sec.footer.is_linked_to_previous=False
sec.header.paragraphs[0].clear();fmt(sec.header.paragraphs[0],1,1)
f=sec.footer.paragraphs[0];f.alignment=WD_ALIGN_PARAGRAPH.CENTER;fmt(f,10,11)
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');f._p.append(field)
num=OxmlElement('w:pgNumType');num.set(qn('w:start'),'1');sec._sectPr.append(num)
p=D.add_paragraph();fmt(p,13.92,17,after=22.6);run(p,'Acceptance Form',13.92,BLUE,True)
t=table(D,[251.64,207.96])
band(t,'PROJECT DETAILS')
r,cs=row(t,108,margins=(12,10));c=cs[0]
entry(c.paragraphs[0],'Project Name:','CSIS IT Ticket and Log System',True,24.5)
entry(c.add_paragraph(),'Project Manager:','',True,24.5)
entry(c.add_paragraph(),'Project Lead:','',True)
band(t,'ACCEPTANCE DETAILS')
r,cs=row(t,97,margins=(12,10));c=cs[0]
entry(c.paragraphs[0],'Acceptance ID:','',after=17)
entry(c.add_paragraph(),'Requested By:','CSIS IT Ticket and Log System Development Team',after=17)
entry(c.add_paragraph(),'Date Requested:')
r,cs=row(t,119,margins=(8,8));c=cs[0]
fmt(c.paragraphs[0],10.08,11.5,after=10);run(c.paragraphs[0],'Description:')
p=c.add_paragraph();fmt(p,9.12,10.5);run(p,content['desc'],9.12,INK,italic=True)
band(t,'ACCEPTANCE CRITERIA')

def criteria(cell,ids,first=False,right=False,baseline=False):
 cellmargins(cell,top=10,bottom=8)
 used=False
 def pnew():
  nonlocal used
  if not used:used=True;return cell.paragraphs[0]
  return cell.add_paragraph()
 def heading(s):
  p=pnew();fmt(p,10.08,11.8,after=12);run(p,s,bold=True)
 def bullet(s,id=None):
  p=pnew();fmt(p,10.08,11,after=2.5,keep=True)
  p.paragraph_format.left_indent=Pt(18);p.paragraph_format.first_line_indent=Pt(-14)
  p.paragraph_format.tab_stops.add_tab_stop(Pt(18))
  run(p,'\u2022\t',10.08,GREEN);run(p,s,10.08,GREEN)
  if id:run(p,' ('+id+')',10.08,GREEN,True)
 if first:
  heading('Criteria 2:' if right else 'Criteria 1:')
  p=pnew();fmt(p,10.08,11,after=4)
  run(p,('Technical and Non-Functional' if right else 'Functional')+' Requirements determined for the CSIS IT Ticket and Log System:',10.08,GREEN)
 for id in ids:
  if id=='P01':heading('Supporting Project Plan Requirements:')
  if id=='O01':heading('Optional and Future Requirements:')
  bullet(lookup[id],id)
 if baseline:
  heading('Baseline Decisions Before Sign-off:')
  for s in content['decisions']:bullet(s)

r,cs=row(t,200,False,margins=(10,8));criteria(cs[0],chunks[0][0],True);criteria(cs[1],chunks[0][1],True,True)

# Native tables continue the two-column form; all text remains editable.
for index,pair in enumerate(chunks[1:],1):
 pagebreak();t=table(D,[251.64,207.96]);r,cs=row(t,676,False,margins=(10,8))
 criteria(cs[0],pair[0],baseline=index==4);criteria(cs[1],pair[1],right=True)

pagebreak();t=table(D,[459.6]);band(t,'ACCEPTANCE RESULTS')
r,cs=row(t,274,margins=(10,10));c=cs[0]
for j,(s,after) in enumerate([('Testing methods used:',38),('Reviewer for undertaking the UAT: ___________________________',13),('Date the test was completed: ______________________________',13),('Overall results: Not assessed',13),('Total: ______    Passed: ______    Failed: ______    Blocked / Not run: ______',13),('Remedial Action Required:',48)]):
 p=c.paragraphs[0] if j==0 else c.add_paragraph();fmt(p,9.12,11,after=after);run(p,s,9.12,INK,True,True)
# Add results rows to the main table using a nested, fully editable Word table.
r,cs=row(t,206,margins=(4,14));c=cs[0];spacer(c.paragraphs[0])
rt=table(c,[110,71,81,174.6])
r2,cc=row(rt,19,False,margins=(3,3))
for cell,s in zip(cc,['Acceptance','Reviewer','Date','Result']):
 shade(cell,'FFFF00');p=cell.paragraphs[0];fmt(p,9.12,11);p.alignment=WD_ALIGN_PARAGRAPH.CENTER;run(p,s,9.12,bold=True)
for label,ids in [('Criteria 1: Functional Specification.','F01 to F28'),('Criteria 2: Technical Specification.','T01 to T41')]:
 r2,cc=row(rt,82,False,margins=(5,5));p=cc[0].paragraphs[0];fmt(p,9.12,10.8,after=8);run(p,label,9.12,bold=True)
 p=cc[0].add_paragraph();fmt(p,9.12,10.8);run(p,'Refer to requirements '+ids+' stated above.',9.12)
 for cell in cc[1:]:fmt(cell.paragraphs[0],9.12,10.8)
spacer(c.paragraphs[-1])
band(t,'CUSTOMER APPROVAL')
r,cs=row(t,83,margins=(10,10));c=cs[0];p=c.paragraphs[0];fmt(p,10.08,11,after=12);run(p,'Supporting Documentation:',bold=True)
p=c.add_paragraph();fmt(p,9.12,10.8);run(p,'CSIS IT Ticket Log System Functional Specification v1.0.2\nCSIS IT Ticket Log System Technical Specification v1.0.1\nIT Ticket and Log System Project Plan and completed UAT evidence',9.12,INK,italic=True)
r,cs=row(t,53,margins=(10,10));p=cs[0].paragraphs[0];fmt(p,10.08,12)
run(p,'Signature: ',bold=True);run(p,'_______________________',9.12,INK,italic=True);run(p,'       Date: ',bold=True);run(p,'____________________',9.12,INK,italic=True)

pagebreak();t=table(D,[459.6]);band(t,'SUPPORTING ACCEPTANCE RECORD')
r,cs=row(t,620,margins=(12,12));c=cs[0]
for i,s in enumerate(['Project Team: Shani Nezar and Lia Theunissen','Project Sponsor: Selouna Visser']):
 p=c.paragraphs[0] if i==0 else c.add_paragraph();fmt(p,10.08,11,after=13);run(p,s,bold=True)
for label,value in [('Release or Build:',''),('Environment and URL:',''),('Acceptance Decision:','Not assessed')]:
 p=c.add_paragraph();entry(p,label,value,after=14)
for label,height in [('Evidence and defect record location:',30),('Conditions of acceptance and approved baseline decisions:',58)]:
 p=c.add_paragraph();fmt(p,10.08,11,after=height);run(p,label,bold=True)
 p=c.add_paragraph();fmt(p,9.12,10.5,after=15);run(p,'____________________________________________________________________',9.12,INK)
p=c.add_paragraph();fmt(p,10.08,11,after=10);run(p,'Execution and review:',bold=True)
p=c.add_paragraph();fmt(p,9.12,10.8,after=15);run(p,content['body'],9.12)
p=c.add_paragraph();fmt(p,10.08,11,after=10);run(p,'Source references:',bold=True)
p=c.add_paragraph();fmt(p,9.12,10.8);run(p,content['refs'],9.12,INK,italic=True)

D.core_properties.title='CSIS IT Ticket and Log System User Acceptance Testing Form'
D.core_properties.author='CSIS IT Ticket and Log System Project Team'
D.core_properties.subject='Editable acceptance form in the HartSpec layout'
for root in [D._element,D.styles._element]:
 for border in root.iter(qn('w:pBdr')):
  border.getparent().remove(border)
D.save(OUT)
from zipfile import ZipFile
from lxml import etree
with ZipFile(OUT) as z:
 root=etree.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 s=' '.join(root.xpath('//w:t/text()',namespaces=ns));found=re.findall(r'\((F\d{2}|T\d{2}|P\d{2}|O\d{2})\)',s)
 assert len(set(found))==79,(len(found),len(set(found)))
 assert len([n for n in z.namelist() if n.startswith('word/media/')])==1
 assert not root.xpath('//w:documentProtection',namespaces=ns)
print(json.dumps({'path':str(OUT),'criteria':len(found),'native_text_characters':len(s),'criterion_page_chunks':chunks}))
