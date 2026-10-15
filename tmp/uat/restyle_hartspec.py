from pathlib import Path
import json, re
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
TMP=ROOT/'tmp'/'uat'
OUT=ROOT/'output'/'pdf'/'CSIS_IT_Ticket_Log_System_UAT_HartSpec_Style.pdf'
data=json.loads((TMP/'manifest.json').read_text(encoding='utf-8'))
cases=data['cases']
clarified={
 'F01':'NWU email and password authenticate users and route each role to its dashboard using a secure session; invalid credentials show a clear error. Reporter entry follows approved D01.',
 'F03':'The structured submission form captures Title, Issue Description, Category, Urgency, Location and Station ID using predefined category and urgency choices, and confirms successful submission.',
 'F08':'Authorized technicians see the permitted ticket queue, filter by status, inspect history and sort by priority. Cards show Station ID, Priority and time since submission. Labels follow D04.',
 'F22':'Administrators filter historical tickets by date range, technician and hardware/category. Only matching records are returned and supply consistent inputs to reports.',
 'T06':'Core workflows remain usable on a 2 GB RAM dual-core desktop at 720p and a 2 GB quad-core mobile device with a 5-inch display, using keyboard/mouse or touch. Stable LAN, Wi-Fi or approved mobile access and 10/100 campus networking are supported.',
 'T12':'Nodemailer sends notifications through the NWU gateway to @nwu.ac.za or @student.g.nwu.ac.za addresses. Port 587 with STARTTLS is the secure baseline; any port 25 use cited in TS p. 20 requires an approved encrypted relay configuration.',
 'T18':'Server validation using express-validator prevents NoSQL/injection attacks, XSS script execution and unauthorized database access, including when client validation is bypassed.',
 'T20':'Personal and operational records have documented encryption and secure handling controls; names and NWU emails support incident resolution. Attach POPIA and university policy review evidence for acceptance.',
 'T23':'At least 50 concurrent connections are supported without data corruption or service decline. Capture response times, error counts and evidence that the notification queue drains.',
 'T33':'Hardware-fault submission displays approved NWU laboratory safety reminders, including power-down guidance. Digital records show reported hazards and actions for institutional safety review and OHSA evidence.',
 'T38':'A downloadable PDF quick-start guide, login-page FAQ and user/technician/Admin manuals cover access/login and password recovery, submission, categories, ticket status, timers, secure comments, reports, user roles and troubleshooting.',
 'P05':'The CSIS Network Administrator receives repository ownership, VM/SSH and MongoDB administrative access through secure channels, environment/IP/connection documentation and user guides. Sponsor reviews deployment and handover evidence.'
}
for item in cases:
 key=item['id'].replace('UAT-','')
 if key in clarified:item['expected']=clarified[key]
for name,file in [('Arial','arial.ttf'),('ArialB','arialbd.ttf'),('ArialI','ariali.ttf'),('ArialBI','arialbi.ttf'),('Cover','georgiab.ttf')]:
 pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialB',italic='ArialI',boldItalic='ArialBI')
W,H=595.2,841.92; X=72.; R=531.6; WIDTH=R-X; SPLIT=323.64
BLUE=HexColor('#313896'); GREEN=HexColor('#538135'); INKBLUE=HexColor('#0000FF'); GRAY=HexColor('#808080')
C=canvas.Canvas(str(OUT),pagesize=(W,H))
C.setTitle('User Acceptance Testing Form For CSIS IT Ticket and Log System')
C.setAuthor('CSIS IT Ticket and Log System Project Team')
fields=[]; page_num=0
styles={
 'body':ParagraphStyle('body',fontName='Arial',fontSize=10.08,leading=11.8),
 'entry':ParagraphStyle('entry',fontName='ArialI',fontSize=9.12,leading=10.5,textColor=INKBLUE),
 'green':ParagraphStyle('green',fontName='Arial',fontSize=10.08,leading=11,textColor=GREEN),
 'bullet':ParagraphStyle('bullet',fontName='Arial',fontSize=10.08,leading=11,textColor=GREEN,leftIndent=18,firstLineIndent=0,bulletIndent=4,spaceAfter=2.5),
 'small':ParagraphStyle('small',fontName='Arial',fontSize=9.12,leading=10.8),
 'smallblue':ParagraphStyle('smallblue',fontName='ArialI',fontSize=9.12,leading=10.8,textColor=INKBLUE),
 'tinyblue':ParagraphStyle('tinyblue',fontName='ArialI',fontSize=8.5,leading=10.2,textColor=INKBLUE),
}

def text(s,x,top,font='Arial',size=10.08,color=black):
 C.setFont(font,size);C.setFillColor(color);C.drawString(x,H-top-size*.82,s)
def para(s,x,top,width,style='body',draw=True,bullet=None):
 p=Paragraph(s,styles[style],bulletText=bullet)
 _,h=p.wrap(width,1000)
 if draw:p.drawOn(C,x,H-top-h)
 return h
def line(x1,t1,x2,t2,width=.72,color=black):
 C.setStrokeColor(color);C.setLineWidth(width);C.line(x1,H-t1,x2,H-t2)
def box(x,top,w,height,fill=None):
 C.setLineWidth(.72);C.setStrokeColor(black)
 if fill:C.setFillColor(fill)
 C.rect(x,H-top-height,w,height,fill=bool(fill),stroke=1)
def bar(s,top):
 box(X,top,WIDTH,25,BLUE);text(s,X+5.76,top+7,'ArialB',11.04,white)
def foot():
 text(str(page_num),W/2-2,785,'Arial',10,GRAY)
def newpage(label):
 global page_num
 C.showPage();page_num+=1
 C.bookmarkPage('p'+str(page_num)); C.addOutlineEntry(label,'p'+str(page_num),0)
 foot()
def field(name,x,top,w,height=16,value='',multi=False,underline=True,size=9.12):
 assert name not in fields
 fields.append(name)
 C.acroForm.textfield(name=name,tooltip=name.replace('_',' '),x=x,y=H-top-height,width=w,height=height,value=value,fontName='Helvetica-Oblique',fontSize=size,borderWidth=0,borderColor=INKBLUE,fillColor=white,textColor=INKBLUE,forceBorder=False,fieldFlags='multiline' if multi else '')
 if underline:line(x,top+height+1,x+w,top+height+1,.45,INKBLUE)
def dropdown(name,x,top,w,values=None):
 fields.append(name);values=values or ['Not assessed','Accepted','Accepted pending changes','Not accepted']
 C.acroForm.choice(name=name,tooltip=name.replace('_',' '),x=x,y=H-top-20,width=w,height=20,options=values,value=values[0],fontName='Helvetica-Oblique',fontSize=9,borderWidth=0,fillColor=white,textColor=INKBLUE,fieldFlags='combo')

# The original image is reused as a PDF background asset without altering the image.
cover=TMP/'cover_source_0_Im1.png'
C.drawImage(ImageReader(str(cover)),0,-1.052274,width=600.1,height=842.9723)
C.bookmarkPage('cover');C.addOutlineEntry('Cover','cover',0)
for s,top,color,size in [('User Acceptance',359.5,black,36),('Testing Form For',404.86,black,36),('CSIS IT Ticket',453,BLUE,33),('and Log System',495,BLUE,33)]:
 C.setFont('Cover',size);C.setFillColor(color);C.drawCentredString(W/2,H-top-size*.84,s)

# Match the template's first form page and its field positions.
newpage('Acceptance form and criteria')
text('Acceptance Form',X,90,'ArialB',13.92,BLUE)
bar('PROJECT DETAILS',129.6)
box(X,154.6,WIDTH,111.6)
text('Project Name:',X+5.76,168,'ArialB')
field('project_name',183,165,300,value='CSIS IT Ticket and Log System')
text('Project Manager:',X+5.76,204,'ArialB');field('project_manager',183,201,270)
text('Project Lead:',X+5.76,240,'ArialB');field('project_lead',183,237,270)
bar('ACCEPTANCE DETAILS',266.2)
box(X,291.2,WIDTH,101.8)
text('Acceptance ID:',X+5.76,305);field('acceptance_id',183,302,270)
text('Requested By:',X+5.76,330);field('requested_by',183,325,330,26,'CSIS IT Ticket and Log System Development Team',True)
text('Date Requested:',X+5.76,364);field('date_requested',183,361,160)
box(X,393,WIDTH,129)
text('Description:',X+5.76,407)
desc='The CSIS IT Ticket and Log System is a web-based application for the NWU Computer Science and Information Systems department. It replaces manual email-based IT reporting with structured fault submission, unique ticket tracking, technician job cards and start/stop time recording. Students and staff can follow requests and exchange comments with technicians. The system provides automated NWU email notifications, escalation records for Central IT, immutable audit history and management reporting. This form records acceptance against the functional and technical specifications. Results, remedial actions and customer approval are completed after testing.'
para(escape(desc),X+5.76,429,WIDTH-11.52,'entry')
bar('ACCEPTANCE CRITERIA',522)

groups={k:[v for v in cases if v['id'].startswith('UAT-'+k)] for k in ['F','T','P','O']}

# Preserve every criterion while following the original two-column green bullet layout.
left=[('head','Criteria 1:'),('intro','Functional Requirements determined for the CSIS IT Ticket and Log System:')]
right=[('head','Criteria 2:'),('intro','Technical and Non-Functional Requirements determined for the CSIS IT Ticket and Log System:')]
for item in groups['F']:
 left.append(('bullet',f"{escape(item['expected'])} <b>({item['id'].replace('UAT-','')})</b>"))
left += [('head','Supporting Project Plan Requirements:')]
for item in groups['P']:
 left.append(('bullet',f"{escape(item['expected'])} <b>({item['id'].replace('UAT-','')})</b>"))
left += [('head','Optional and Future Requirements:')]
for item in groups['O']:
 left.append(('bullet',f"{escape(item['expected'])} <b>({item['id'].replace('UAT-','')})</b>"))
left += [('head','Baseline Decisions Before Sign-off:')]
decisions=[
 'D01: Confirm mandatory reporter login versus NWU-email submission without account creation.',
 'D02: Confirm React MERN frontend versus the Vanilla JavaScript frontend stated in the technical specification.',
 'D03: Approve the uptime target, operating calendar and measurement period; both source targets remain listed.',
 'D04: Agree New/Pending and Assigned/In Progress transitions, escalation labels and technician queue permissions.',
 'D05: Confirm internal hosting and the university data-location boundary versus the cloud option mentioned in TS.',
 'D06: Keep active work time, claim-to-resolution elapsed time and creation-to-closure turnaround distinct.',
 'D07: Record both the 50-connection technical minimum and the 100-user project-plan performance profile.',
 'D08: Agree how post-2026 archiving or anonymization preserves approved immutable audit history.',
 'D09: Approve Critical/Hazardous priority, the hazard escalation timeout and Lab Manager recipient.'
]
for s in decisions:left.append(('bullet',escape(s)))
for item in groups['T']:
 right.append(('bullet',f"{escape(item['expected'])} <b>({item['id'].replace('UAT-','')})</b>"))

def itemheight(kind,s,width):
 if kind=='head':return para('<b>'+s+'</b>',0,0,width,'body',False)+12
 if kind=='intro':return para(s,0,0,width,'green',False)+4
 return para(s,0,0,width,'bullet',False,bullet='\u2022')+2.5
def fillcolumn(items,x,top,width,bottom):
 y=top
 while items:
  kind,s=items[0];h=itemheight(kind,s,width)
  if kind=='head' and s=='Baseline Decisions Before Sign-off:':
   remaining=sum(itemheight(k,v,width) for k,v in items)
   if y+remaining>bottom:break
  if y+h>bottom:break
  items.pop(0)
  if kind=='head':para('<b>'+s+'</b>',x,y,width,'body')
  elif kind=='intro':para(s,x,y,width,'green')
  else:para(s,x,y,width,'bullet',bullet='\u2022')
  y+=h
 return y

top=547
while True:
 box(X,top,WIDTH,770-top if page_num==1 else 748-top)
 line(SPLIT,top,SPLIT,770 if page_num==1 else 748)
 bottom=762 if page_num==1 else 740
 fillcolumn(left,X+5.76,top+12,SPLIT-X-11.52,bottom)
 fillcolumn(right,SPLIT+5.76,top+12,R-SPLIT-11.52,bottom)
 if not left and not right:break
 newpage('Acceptance criteria continued '+str(page_num))
 top=72

# The yellow results table and customer approval panel follow the reference.
newpage('Acceptance results and customer approval')
bar('ACCEPTANCE RESULTS',72)
box(X,97,WIDTH,500)
text('Testing methods used:',X+5.76,110,'ArialBI',9.12,INKBLUE)
field('testing_methods',X+9,124,WIDTH-18,40,multi=True,underline=False)
text('Reviewer for undertaking the UAT:',X+5.76,171,'ArialBI',9.12,INKBLUE)
field('uat_reviewer',X+174,167,264,18,underline=True)
text('Date the test was completed:',X+5.76,198,'ArialBI',9.12,INKBLUE)
field('test_completed_date',X+174,194,180,18)
text('Overall results:',X+5.76,225,'ArialBI',9.12,INKBLUE)
dropdown('overall_result',X+126,219,304)
text('Total:',X+15,251,'ArialBI',8.5,INKBLUE);field('tested_total',X+53,245,48)
text('Passed:',X+111,251,'ArialBI',8.5,INKBLUE);field('passed_total',X+159,245,48)
text('Failed:',X+218,251,'ArialBI',8.5,INKBLUE);field('failed_total',X+260,245,48)
text('Blocked / Not run:',X+318,251,'ArialBI',8.5,INKBLUE);field('remaining_total',X+407,245,36)
text('Remedial Action Required:',X+15,279,'ArialBI',9.12,INKBLUE)
field('remedial_action',X+15,295,WIDTH-30,62,multi=True,underline=False)
line(X+42,371,R-6,371,1.3)
cols=[X+5.76,X+115.76,X+186.76,X+267.76,R-14]
tabletop=383;heights=[19,82,82]
for row,h in enumerate(heights):
 for j in range(4):box(cols[j],tabletop,cols[j+1]-cols[j],h,HexColor('#FFFF00') if row==0 else None)
 if row==0:
  for j,s in enumerate(['Acceptance','Reviewer','Date','Result']):
   C.setFont('ArialB',9.12);C.setFillColor(black);C.drawCentredString((cols[j]+cols[j+1])/2,H-tabletop-13,s)
 else:
  kind='functional' if row==1 else 'technical'
  criterion='Criteria 1: Functional Specification.' if row==1 else 'Criteria 2: Technical Specification.'
  ids='F01 to F28' if row==1 else 'T01 to T41'
  para('<b>'+criterion+'</b><br/><br/>Refer to requirements '+ids+' stated above.',cols[0]+4,tabletop+6,cols[1]-cols[0]-8,'small')
  field(kind+'_reviewer',cols[1]+3,tabletop+6,cols[2]-cols[1]-6,67,multi=True,underline=False,size=8)
  field(kind+'_date',cols[2]+3,tabletop+6,cols[3]-cols[2]-6,67,multi=True,underline=False,size=8)
  field(kind+'_result',cols[3]+4,tabletop+6,cols[4]-cols[3]-8,67,multi=True,underline=False,size=8)
 tabletop+=h

bar('CUSTOMER APPROVAL',597)
box(X,622,WIDTH,83)
text('Supporting Documentation:',X+5.76,635,'ArialB',10.08)
para('CSIS IT Ticket Log System Functional Specification v1.0.2<br/>CSIS IT Ticket Log System Technical Specification v1.0.1<br/>IT Ticket and Log System Project Plan and completed UAT evidence',X+5.76,658,WIDTH-12,'smallblue')
box(X,705,WIDTH,53)
text('Signature:',X+5.76,718,'ArialB',10.08);field('customer_signature',X+58,714,173,22)
text('Date:',X+244,718,'ArialB',10.08);field('customer_date',X+277,714,159,22)

# Keep source traceability and execution details in a compact companion record.
newpage('Supporting acceptance record')
bar('SUPPORTING ACCEPTANCE RECORD',72)
box(X,97,WIDTH,620)
y=111
text('Project Team: Shani Nezar and Lia Theunissen',X+5.76,y,'ArialB');y+=24
text('Project Sponsor: Selouna Visser',X+5.76,y,'ArialB');y+=26
text('Release or Build:',X+5.76,y);field('release_build',X+126,y-4,300);y+=28
text('Environment and URL:',X+5.76,y);field('environment_url',X+126,y-4,300);y+=29
text('Acceptance Decision:',X+5.76,y);dropdown('customer_decision',X+126,y-5,300);y+=39
text('Evidence and defect record location:',X+5.76,y,'ArialB');y+=18
field('evidence_location',X+5.76,y,WIDTH-12,34,multi=True);y+=50
text('Conditions of acceptance and approved baseline decisions:',X+5.76,y,'ArialB');y+=18
field('conditions_and_decisions',X+5.76,y,WIDTH-12,70,multi=True);y+=86
text('Execution and review:',X+5.76,y,'ArialB');y+=20
body='Use an agreed test environment and record actual results and evidence against the F, T, P and O identifiers. F01-F28 are functional criteria; T01-T41 are technical criteria; P01-P06 are supporting project-plan checks; O01-O04 are optional or future scope. Record Pass, Fail, Blocked or approved N/A for each executed check in the linked evidence record. Summarize the outcomes on the acceptance results page. Leave unexecuted checks as Not run. Technical reviewers supply API, security, performance and recovery evidence. Record defect owners, remedial actions and retest outcomes before customer approval.'
y+=para(escape(body),X+5.76,y,WIDTH-12,'small')+18
text('Source references:',X+5.76,y,'ArialB');y+=19
refs='Functional Specification v1.0.2, cover dated 11 May 2026, 16 PDF pages. Technical Specification v1.0.1, dated 9 May 2026, 28 PDF pages. Project Plan DOCX revision 1.2, dated 28 May 2026, and the supplied Project Plan PDF. The acceptance criteria consolidate repeated statements while preserving the requirement scope. The HartSpec form supplies the visual layout; its completed project results are not carried over.'
y+=para(escape(refs),X+5.76,y,WIDTH-12,'smallblue')+10
assert y<708,y
C.save()
r=PdfReader(OUT); actual=r.get_fields() or {}
assert set(actual)==set(fields),(len(actual),len(fields))
full='\n'.join(p.extract_text() or '' for p in r.pages)
for item in cases:assert item['id'].replace('UAT-','') in full,item['id']
assert all(actual[n].get('/V','')=='' for n in ['customer_signature','functional_result','technical_result'])
for i,p in enumerate(r.pages):
 for a in p.get('/Annots',[]):
  w=a.get_object()
  if w.get('/Subtype')=='/Widget':
   assert w.get('/AP',{}).get('/N'),(i,w.get('/T'))
   x0,y0,x1,y1=map(float,w['/Rect']);assert 0<=x0<x1<W and 0<=y0<y1<H
print(json.dumps({'output':str(OUT),'pages':len(r.pages),'fields':len(fields),'criteria':len(cases)}))
