from __future__ import annotations
import copy, hashlib, json, re, shutil, zipfile
from pathlib import Path
from lxml import etree
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing')
TMP = ROOT / 'tmp' / 'uat' / 'actual-template'
REF = TMP / 'reference.docx'
WORK = TMP / 'working.docx'
FINAL = ROOT / 'output' / 'doc' / 'CSIS_IT_Ticket_Log_System_UAT_Actual_Form.docx'
MANIFEST = ROOT / 'tmp' / 'uat' / 'manifest.json'
CONTENT_SOURCE = ROOT / 'output' / 'doc' / 'CSIS_IT_Ticket_Log_System_UAT_HartSpec_Style.docx'
EXPECTED_REFERENCE_SHA = '08e35c31ad7e16167e978931e8e0f3eb58798b5d38bbe242e7d2e35881dce240'

assert hashlib.sha256(REF.read_bytes()).hexdigest() == EXPECTED_REFERENCE_SHA, 'Reference differs from distillation.'
manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
cases = manifest['cases']
assert len(cases) == 79
ids = [c['id'].replace('UAT-', '') for c in cases]
assert len(ids) == len(set(ids))

# Retain the complete criterion wording from the supplied User Acceptance.pdf.
# The earlier editable UAT contains the extracted, clarified criterion text;
# the manifest's expected field is abbreviated for some technical checks.
content_doc = Document(str(CONTENT_SOURCE))
content_text = '\n'.join(p.text for p in content_doc.paragraphs)
for table in content_doc.tables:
    for row in table.rows:
        for cell in row.cells:
            content_text += '\n' + cell.text
source_criteria = {
    ident: statement.strip(' \t•�')
    for statement, ident in re.findall(r'([^\r\n]+?)\s*\(([FTPO]\d{2})\)', content_text)
}
assert set(source_criteria) == set(ids), (len(source_criteria), sorted(set(ids) - set(source_criteria)))
for case in cases:
    case['expected'] = source_criteria[case['id'].replace('UAT-', '')]

def tag(name): return qn('w:' + name)
def child(parent, name): return parent.find(tag(name))
def txt_of(p): return ''.join(t.text or '' for t in p.iter(tag('t')))

def run_xml(text, size=9, color='000000', bold=False, italic=False):
    r = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    fonts = OxmlElement('w:rFonts')
    for a in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
        fonts.set(tag(a), 'Arial')
    rpr.append(fonts)
    if bold:
        rpr.append(OxmlElement('w:b'))
    if italic:
        rpr.append(OxmlElement('w:i'))
    if color:
        c = OxmlElement('w:color'); c.set(tag('val'), color); rpr.append(c)
    sz = OxmlElement('w:sz'); sz.set(tag('val'), str(round(size * 2))); rpr.append(sz)
    szcs = OxmlElement('w:szCs'); szcs.set(tag('val'), str(round(size * 2))); rpr.append(szcs)
    r.append(rpr)
    t = OxmlElement('w:t')
    if text.startswith(' ') or text.endswith(' ') or '  ' in text:
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    t.text = text
    r.append(t)
    return r

def paragraph_xml(template_ppr=None, spacing_before=0, spacing_after=35):
    p = OxmlElement('w:p')
    if template_ppr is not None:
        ppr = copy.deepcopy(template_ppr)
        # Criteria rows are prose, not list paragraphs.
        num = ppr.find(tag('numPr'))
        if num is not None: ppr.remove(num)
        spacing = ppr.find(tag('spacing'))
        if spacing is None:
            spacing = OxmlElement('w:spacing'); ppr.append(spacing)
        spacing.set(tag('before'), str(spacing_before))
        spacing.set(tag('after'), str(spacing_after))
        if spacing.get(tag('line')) is None:
            spacing.set(tag('line'), '220'); spacing.set(tag('lineRule'), 'auto')
        p.append(ppr)
    else:
        ppr = OxmlElement('w:pPr')
        spacing = OxmlElement('w:spacing'); spacing.set(tag('before'), str(spacing_before)); spacing.set(tag('after'), str(spacing_after)); spacing.set(tag('line'), '220'); spacing.set(tag('lineRule'), 'auto')
        ppr.append(spacing); p.append(ppr)
    return p

def replace_tc(tc, para_runs):
    # Keep cell geometry, fill, borders and margins; replace only editable paragraphs.
    oldp = tc.find(tag('p'))
    base_ppr = copy.deepcopy(oldp.find(tag('pPr'))) if oldp is not None and oldp.find(tag('pPr')) is not None else None
    tcpr = tc.find(tag('tcPr'))
    for el in list(tc):
        if el is not tcpr:
            tc.remove(el)
    for runs in para_runs:
        p = paragraph_xml(base_ppr)
        for spec in runs:
            p.append(run_xml(**spec))
        tc.append(p)
    if not para_runs:
        tc.append(paragraph_xml(base_ppr))

def one(text, size=9, color='000000', bold=False, italic=False):
    return [{'text': text, 'size': size, 'color': color, 'bold': bold, 'italic': italic}]

def field_line(label, value, value_color='0000FF', value_italic=True, label_size=10, value_size=9, underline=None):
    line = [
        {'text':label, 'size':label_size, 'color':'000000', 'bold':True, 'italic':False},
        {'text':value, 'size':value_size, 'color':value_color, 'bold':False, 'italic':value_italic},
    ]
    if underline:
        line2 = [{'text':underline, 'size':9, 'color':'0000FF', 'bold':False, 'italic':True}]
        return [line, line2]
    return [line]

def make_band_row(template):
    row=copy.deepcopy(template)
    tc=row.find(tag('tc'))
    return row, tc

def keep_row_with_next(row):
    trpr=row.find(tag('trPr'))
    if trpr is None:
        trpr=OxmlElement('w:trPr')
        row.insert(0,trpr)
    if trpr.find(tag('cantSplit')) is None:
        trpr.append(OxmlElement('w:cantSplit'))
    for p in row.iter(tag('p')):
        ppr=p.find(tag('pPr'))
        if ppr is None:
            ppr=OxmlElement('w:pPr')
            p.insert(0,ppr)
        if ppr.find(tag('keepNext')) is None:
            ppr.append(OxmlElement('w:keepNext'))

def make_case_row(template, ident, expected):
    row=copy.deepcopy(template)
    tc=row.find(tag('tc'))
    title = next((c['title'] for c in cases if c['id'].replace('UAT-','')==ident), None)
    ppr=copy.deepcopy(tc.find(tag('p')).find(tag('pPr'))) if tc.find(tag('p')) is not None and tc.find(tag('p')).find(tag('pPr')) is not None else None
    # Rebuild row body using the template's body paragraph properties.
    replace_tc(tc, [[
        {'text':ident, 'size':9, 'color':'313896', 'bold':True, 'italic':False},
        {'text':'  ', 'size':9, 'color':'000000', 'bold':False, 'italic':False},
        {'text':expected, 'size':9, 'color':'000000', 'bold':False, 'italic':False},
    ]])
    return row

def set_direct_para(p, runs, size=9):
    ppr = p.find(tag('pPr'))
    for el in list(p):
        if el is not ppr: p.remove(el)
    for spec in runs:
        p.append(run_xml(**spec))

def cell_paras(tc):
    return tc.findall(tag('p'))

def main():
    shutil.copy2(REF, WORK)
    doc = Document(str(WORK))
    main_table = doc.tables[0]._tbl
    original_rows = list(main_table.findall(tag('tr')))
    assert len(original_rows) == 12, len(original_rows)
    band_template = copy.deepcopy(original_rows[0])
    body_template = copy.deepcopy(original_rows[1])
    keep_row_with_next(original_rows[7])  # Prevent the results heading from being stranded at a page bottom.

    # Project details row, using the template's label, underline and spacing treatment.
    project_tc = original_rows[1].find(tag('tc'))
    replace_tc(project_tc, [
        field_line('Project Name: ', 'CSIS IT Ticket and Log System', '000000', True, 10, 9)[0],
        one('____________________________________________________________', 9, '000000', False, False),
        one('', 9),
        field_line('Project Manager: ', 'Mej Selouna Visser', '000000', True, 10, 9)[0],
        one('____________________________________________________________', 9, '000000'),
        one('', 9),
        field_line('Project Lead: ', 'Shani Nezar & Lia Theunissen', '000000', True, 10, 9)[0],
        one('____________________________________________________________', 9, '000000'),
    ])

    acceptance_tc = original_rows[3].find(tag('tc'))
    replace_tc(acceptance_tc, [
        field_line('Acceptance ID: ', '(N/A)', '0000FF', True, 10, 9)[0],
        one('', 9),
        field_line('Requested By: ', 'CSIS IT Ticket and Log System Development Team', '0000FF', True, 10, 9)[0],
        one('____________________________________________________________', 9, '0000FF', False, True),
        one('', 9),
        field_line('Date Requested: ', '15 October 2026', '0000FF', True, 10, 9)[0],
        one('____________________________________________________________', 9, '0000FF', False, True),
    ])

    description = (
        'The CSIS IT Ticket and Log System is a web-based application for the NWU Computer Science and Information Systems department. '
        'It replaces manual email-based IT reporting with structured fault submission, unique ticket tracking, technician job cards and start/stop time recording. '
        'Students and staff can follow requests and exchange comments with technicians. The system provides automated NWU email notifications, '
        'escalation records for Central IT, immutable audit history and management reporting. This form records acceptance against the functional and technical specifications. '
        'Results, remedial actions and customer approval are completed after testing.'
    )
    desc_tc = original_rows[4].find(tag('tc'))
    replace_tc(desc_tc, [one('Description:',10,'000000',False,False), one(description,9,'000000',False,False)])

    criteria_cells = original_rows[6].findall(tag('tc'))
    assert len(criteria_cells)==2
    replace_tc(criteria_cells[1], [
        one('Functionality and Technical Usability', 10, '808080', False, True),
        one('Detailed criteria continue below.', 9, '0000FF', False, True),
    ])

    # Criteria register, grouped to preserve the source form's navy band and full-width bordered body rows.
    groups = [
        ('FUNCTIONAL REQUIREMENTS - F01-F28', [c for c in cases if c['id'].startswith('UAT-F')]),
        ('TECHNICAL AND NON-FUNCTIONAL REQUIREMENTS - T01-T41', [c for c in cases if c['id'].startswith('UAT-T')]),
        ('SUPPORTING PROJECT PLAN REQUIREMENTS - P01-P06', [c for c in cases if c['id'].startswith('UAT-P')]),
        ('OPTIONAL AND FUTURE REQUIREMENTS - O01-O04', [c for c in cases if c['id'].startswith('UAT-O')]),
    ]
    decision_text = [
        ('D01','Confirm mandatory reporter login versus NWU-email submission without account creation.'),
        ('D02','Confirm React MERN frontend versus the Vanilla JavaScript frontend stated in the technical specification.'),
        ('D03','Approve the uptime target, operating calendar and measurement period; both source targets remain listed.'),
        ('D04','Agree New/Pending and Assigned/In Progress transitions, escalation labels and technician queue permissions.'),
        ('D05','Confirm internal hosting and the university data-location boundary versus the cloud option mentioned in the technical specification.'),
        ('D06','Keep active work time, claim-to-resolution elapsed time and creation-to-closure turnaround distinct.'),
        ('D07','Record both the 50-connection technical minimum and the 100-user project-plan performance profile.'),
        ('D08','Agree how post-2026 archiving or anonymization preserves approved immutable audit history.'),
        ('D09','Approve Critical/Hazardous priority, the hazard escalation timeout and Lab Manager recipient.'),
    ]
    insertion_cursor = original_rows[6]
    generated_case_rows=[]
    generated_decision_rows=[]
    for label, group_cases in groups:
        brow, btc = make_band_row(band_template)
        replace_tc(btc, [one(label,9,'FFFFFF',True,False)])
        keep_row_with_next(brow)
        insertion_cursor.addnext(brow); insertion_cursor=brow
        for c in group_cases:
            ident=c['id'].replace('UAT-','')
            r=make_case_row(body_template, ident, c['expected'])
            insertion_cursor.addnext(r); insertion_cursor=r
            generated_case_rows.append((ident,r))
    band, btc = make_band_row(band_template)
    replace_tc(btc, [one('BASELINE DECISIONS BEFORE SIGN-OFF - D01-D09',9,'FFFFFF',True,False)])
    keep_row_with_next(band)
    insertion_cursor.addnext(band); insertion_cursor=band
    for ident, decision in decision_text:
        r=make_case_row(body_template, ident, decision)
        insertion_cursor.addnext(r); insertion_cursor=r
        generated_decision_rows.append((ident,r))

    # Result form: keep testing outcomes unassessed and add project-plan/future-scope review categories.
    results_row = original_rows[8]
    results_tc = results_row.find(tag('tc'))
    direct_ps=results_tc.findall(tag('p'))
    for p in direct_ps:
        text=txt_of(p)
        if text.startswith('Within the following table'):
            set_direct_para(p,one('Record a reviewer, date and result for each acceptance category below. Use linked evidence for individual checks.',9,'0000FF',False,True))
        elif text.startswith('Overall result'):
            set_direct_para(p,[
                {'text':'Overall result: ', 'size':9, 'color':'000000', 'bold':True, 'italic':False},
                {'text':'Not assessed (complete after testing).', 'size':9, 'color':'0000FF', 'bold':False, 'italic':True},
            ])
        elif text.strip().startswith('Total'):
            set_direct_para(p,[{'text':'Total: _____   Passed: _____   Failed: _____   Blocked / Not run: _____', 'size':9,'color':'0000FF','bold':False,'italic':True}])
        elif text.strip().startswith('_') and len(text.strip()) > 20:
            # Replace only the first line immediately following the original Total label with count fields.
            prev = p.getprevious()
            if prev is not None and txt_of(prev).strip().startswith('Total'):
                set_direct_para(p,one(' ',9,'0000FF',False,True))

    nested=results_tc.find(tag('tbl'))
    assert nested is not None
    review_rows=list(nested.findall(tag('tr')))
    assert len(review_rows)==3
    criteria_summaries=[
        ('Criteria 1: Functional Specification.','Refer to F01-F28 in the criteria register.'),
        ('Criteria 2: Technical Specification.','Refer to T01-T41 in the criteria register.'),
    ]
    for source_row,(heading,detail) in zip(review_rows[1:3],criteria_summaries):
        tc=source_row.findall(tag('tc'))[0]
        replace_tc(tc,[one(heading,10,'000000'),one(detail,9,'0000FF',False,True)])
    for heading,detail in [
        ('Criteria 3: Supporting Project Plan Requirements.','Refer to P01-P06 in the criteria register.'),
        ('Criteria 4: Optional and Future Requirements.','Refer to O01-O04; record approved N/A when not in release.'),
    ]:
        new_row=copy.deepcopy(review_rows[2])
        tc=new_row.findall(tag('tc'))[0]
        replace_tc(tc,[one(heading,10,'000000'),one(detail,9,'0000FF',False,True)])
        nested.append(new_row)

    # Supporting acceptance record follows the test results and uses the same source table components.
    customer_header = original_rows[9]
    support_header, support_tc = make_band_row(band_template)
    replace_tc(support_tc,[one('SUPPORTING ACCEPTANCE RECORD',9,'FFFFFF',True,False)])
    keep_row_with_next(support_header)
    support_body=copy.deepcopy(body_template)
    support_tc=support_body.find(tag('tc'))
    replace_tc(support_tc,[
        field_line('Project Team: ','Shani Nezar and Lia Theunissen','000000',False,9,9)[0],
        field_line('Project Sponsor: ','Selouna Visser','000000',False,9,9)[0],
        field_line('Release or Build: ','________________________________________','0000FF',True,9,9)[0],
        field_line('Environment and URL: ','________________________________________','0000FF',True,9,9)[0],
        field_line('Acceptance Decision: ','Not assessed','0000FF',True,9,9)[0],
        field_line('Evidence and defect record location: ','________________________________________','0000FF',True,9,9)[0],
        field_line('Conditions and baseline decisions: ','Resolve D01-D09 before sign-off.','000000',False,9,9)[0],
        one('Record Pass, Fail, Blocked, Not run or approved N/A for each check in linked evidence. Record defect owners, remedial actions and retest outcomes before customer approval.',9,'000000'),
    ])
    customer_header.addprevious(support_header)
    customer_header.addprevious(support_body)

    # Customer supporting documents, while retaining the template signature and date fields.
    docs_tc=original_rows[10].find(tag('tc'))
    replace_tc(docs_tc,[
        one('Supporting Documentation:',10,'000000'),
        one('CSIS IT Ticket Log System Functional Specification v1.0.2',9,'000000'),
        one('CSIS IT Ticket Log System Technical Specification v1.0.1',9,'000000'),
        one('IT Ticket and Log System Project Plan, revision 1.2, and UAT evidence record',9,'000000'),
    ])

    doc.save(str(WORK))
    # Use only the edited document.xml; preserve the reference package's image, styles, sections, numbering, fields, relationships, and properties.
    FINAL.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(REF,'r') as zin, zipfile.ZipFile(WORK,'r') as zw:
        new_document_xml=zw.read('word/document.xml')
        with zipfile.ZipFile(FINAL,'w',zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = new_document_xml if info.filename=='word/document.xml' else zin.read(info.filename)
                zout.writestr(info,data)
    with zipfile.ZipFile(FINAL,'r') as z:
        bad=z.testzip(); assert bad is None, bad
        for info in zipfile.ZipFile(REF,'r').infolist():
            if info.filename!='word/document.xml':
                assert hashlib.sha256(z.read(info.filename)).digest()==hashlib.sha256(zipfile.ZipFile(REF,'r').read(info.filename)).digest(), info.filename
    final_doc=Document(str(FINAL))
    final_rows=final_doc.tables[0].rows
    assert len(final_rows)==12+len(cases)+len(decision_text)+5+2, len(final_rows)
    all_text='\n'.join(p.text for p in final_doc.paragraphs)
    # Criteria live inside the main form table; verify their exact ordered IDs from the generated row list.
    extracted=[]
    for ident,row in generated_case_rows+generated_decision_rows:
        tc=row.find(tag('tc')); extracted.append(txt_of(tc.find(tag('p'))).split()[0])
    expected_sequence=ids+[d[0] for d in decision_text]
    assert extracted==expected_sequence, (len(extracted),len(expected_sequence))
    assert len(final_doc.tables[0].rows)==107, len(final_doc.tables[0].rows)
    assert final_doc.sections[0].page_width==doc.sections[0].page_width
    print(json.dumps({'output':str(FINAL),'case_count':len(cases),'decision_count':len(decision_text),'main_table_rows':len(final_doc.tables[0].rows),'section_count':len(final_doc.sections),'summary_rows':5,'reference_sha256':hashlib.sha256(REF.read_bytes()).hexdigest(),'output_bytes':FINAL.stat().st_size},ensure_ascii=False))

if __name__=='__main__': main()

