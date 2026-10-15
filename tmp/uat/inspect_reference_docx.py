import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from docx import Document
files={
 'template':Path(r'C:\Users\CSIS_PostGrad\Documents\ITRI 624 ISE\Use Acceptance Testing Form _2_.docx'),
 'current':Path(r'C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\output\doc\CSIS_IT_Ticket_Log_System_UAT_HartSpec_Style.docx')
}
for name,path in files.items():
 d=Document(str(path))
 print(f'\n### {name}: {path.name}')
 print('sections',len(d.sections),'pagesize',d.sections[0].page_width,d.sections[0].page_height,'margins',d.sections[0].top_margin,d.sections[0].bottom_margin,d.sections[0].left_margin,d.sections[0].right_margin)
 print('paras',len(d.paragraphs),'tables',len(d.tables),'inline_shapes',len(d.inline_shapes))
 for i,p in enumerate(d.paragraphs):
  s=p.text.strip()
  if s: print(f'P{i} [{p.style.name}] {s[:240]}')
 for ti,t in enumerate(d.tables):
  print(f'TABLE {ti} {len(t.rows)}x{len(t.columns)} style={t.style.name if t.style else None}')
  for row in t.rows[:5]: print(' | '.join(c.text.replace('\n',' / ')[:150] for c in row.cells))
