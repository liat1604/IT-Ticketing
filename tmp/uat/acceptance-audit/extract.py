from pathlib import Path
from pypdf import PdfReader
files = {
  "acceptance": Path(r"C:\Users\CSIS_PostGrad\Documents\ITRI 624 ISE\User Acceptance.pdf"),
  "functional": Path(r"C:\Users\CSIS_PostGrad\Downloads\ITRI614 ISE\CSIS IT Ticket Log System _ Functional Specification.pdf"),
  "technical": Path(r"C:\Users\CSIS_PostGrad\Downloads\ITRI614 ISE\CSIS IT Ticket Log System – Technical Specification.pdf"),
}
out = Path(r"C:\Users\CSIS_PostGrad\Documents\GitHub\IT-Ticketing\tmp\uat\acceptance-audit")
for name, path in files.items():
  reader = PdfReader(str(path))
  text = "\n\n".join(f"--- PAGE {i+1} ---\n{page.extract_text() or ''}" for i,page in enumerate(reader.pages))
  (out / f"{name}.txt").write_text(text, encoding="utf-8")
  print(f"{name}: {len(reader.pages)} pages, {len(text)} chars")
