# Actual UAT form template contract

## Reference and evidence

- Retained reference: `reference.docx`, copied byte-for-byte from `C:\Users\CSIS_PostGrad\Documents\ITRI 624 ISE\Use Acceptance Testing Form _2_.docx`.
- SHA-256: `08e35c31ad7e16167e978931e8e0f3eb58798b5d38bbe242e7d2e35881dce240`.
- Four Word-rendered pages reviewed at full page scale: `reference-page-1.png` through `reference-page-4.png`; rendering used Microsoft Word because the bundled `render_docx.py` could not find `soffice.exe`.
- Package and style evidence: `template_audit.py`, `template_audit2.py`, `template-style-evidence.json`, `section_audit.py`, `heading_audit.py`, `images_audit.py`, `fields_report.py`, `footnotes_report.py`, and `content_controls.py list --json` results.

## Page system

- Two portrait A4 sections, 8.268 x 11.693 inches; all margins 1 inch; header and footer distances 0.5 inch.
- Section 1 has a distinct first-page header/footer. Cover has no visible page number. Section 2 continues page numbering from 1 on the Acceptance Form page; page number fields sit at the lower right.
- The first page is a white cover with centered title, centered 2.89-inch square CSIS ticketing logo, project name, author names, and course code. Preserve the logo relationship and all cover-page positioning.
- Pages 2-4 use one black-outline form table, width 9180 DXA, with merged full-width navy section bars. The original main grid is 5026/4154 DXA; one criteria row uses those two columns.

## Typography and colors

- Cover title and subtitle use Arial 22 pt, centered; project title is bold gray `#808080`, author and course lines are bold black.
- `Acceptance Form` uses the source Heading 1 role: Imago Book 14 pt bold, navy `#313896`.
- Body fields use Arial, generally 9-10 pt. The template's instructional/blank-entry text is Arial 9 pt, italic, bright blue `#0000FF`; labels are black and typically 10 pt.
- Section-bar cells use navy `#313896` with bold white text. The review table header is bright yellow `#FFFF00` with bold black text. The outer form and result grids use thin black borders.
- The Normal style defaults to Tahoma 11 pt and justified paragraphs; Body Text is Arial and left aligned. Use the source's direct formatting and component styles for new content.

## Table and component patterns

- The main form is a 12-row, 2-column table. Rows 1, 3, 6, 8, and 10 (one-based) are full-width navy section bars: PROJECT DETAILS, ACCEPTANCE DETAILS, ACCEPTANCE CRITERIA, ACCEPTANCE RESULTS, CUSTOMER APPROVAL.
- Metadata is in a full-width merged row; Description is a separate full-width cell. Acceptance Criteria is a two-column row with a prompt on the left and a category/value on the right.
- Acceptance Results contains editable blue italic entry lines, reviewer/date/overall-result fields, a nested four-column table, and a yellow header row. Nested result widths are 2203/1417/1619/3545 DXA.
- Customer Approval has a full-width supporting-documents cell and a signature/date cell.
- No content controls or footnotes are present. Two PAGE fields occur in footer parts. One inline logo image is in `word/document.xml` and targets `word/media/image1.png`.

## Content flow and editable slots

1. Cover: retain exact title, logo, project name, team, and course layout.
2. Acceptance Form heading: retain source Heading 1 formatting.
3. PROJECT DETAILS: set project name `CSIS IT Ticket and Log System`, project manager `Mej Selouna Visser`, and leads `Shani Nezar & Lia Theunissen` in the source's editable fields.
4. ACCEPTANCE DETAILS: set Acceptance ID `(N/A)`, requester, date requested `15 October 2026`, and the supplied project description. Preserve the source labels and line treatment.
5. ACCEPTANCE CRITERIA: retain the original prompt/value row and add a multi-page criteria register immediately after it, using the same border, Arial text, navy section bars, and blue ID accents. Include all current F01-F28, T01-T41, P01-P06, O01-O04 and D01-D09 text; keep P/O/D clearly identified by their existing meanings.
6. ACCEPTANCE RESULTS: retain tester/method/date/overall-result/remedial-action areas; keep results unassessed and editable. Keep the four-column yellow-header review table and summary categories.
7. Supporting acceptance record: preserve the existing form's release/build, environment, acceptance decision, evidence location, and decision/conditions fields in an added navy-bar component based on the source table pattern.
8. CUSTOMER APPROVAL: retain supporting-document, signature, and date areas; include functional/technical specifications, project plan, and linked UAT evidence as supporting material.

All form text and criteria must remain native editable Word text/table content. Do not convert the cover or criteria to page images. Criteria source body comes from the existing editable UAT in `output/doc/CSIS_IT_Ticket_Log_System_UAT_HartSpec_Style.docx` and the approved manifest in `tmp/uat/manifest.json`; retain the current 79 unique IDs and the nine baseline decisions.

## Package preservation and fidelity gates

Only `word/document.xml` is an intended change. Preserve all other package parts byte-for-byte, including section properties, footer parts and fields, document relationships, image, themes, styles, numbering, settings, font table, notes, content types, and document properties. Preserve the reference file unchanged. Use the actual template's styles, colors, cover, and page furniture. Any added criteria tables must use cloned source table components; no generic style pack or second color system.

Final comparison must confirm the retained reference SHA-256 is unchanged; non-document package part hashes match; section count, page size, margins, title-page behavior, footer page numbering, logo, navy/blue/yellow palette, and form table borders remain. Render the final DOCX in Word, inspect every page, and check that each criterion ID occurs once, no criterion text is clipped, all results/signature slots stay blank/Not assessed, and optional scope/decision labels remain clear.

## Package inventory (reference)

| Package part | Bytes | SHA-256 | Classification |
|---|---:|---|---|
| `[Content_Types].xml` | 2140 | `5202313584e7c7c04aa440664a3613e995c264c6f31f4a1f41543438834e85a3` | preserve-only |
| `_rels/.rels` | 737 | `c30fe099dbcfed4ecc4ae544ccf82f432c8d3bb665e2a301df283738b196d803` | preserve-only |
| `word/document.xml` | 89271 | `4b95dd952e8fe94dd3a1319e24af20b8028a4f01aa5aad05690d2cd3d11fde91` | editable slots |
| `word/_rels/document.xml.rels` | 1604 | `e5965112b26096cdc562b547dc609abab444432324904130a661585fd455c092` | preserve-only |
| `word/footnotes.xml` | 3018 | `d2ec663fcafcd516ad1d6eaecc13986b73f60d06a98d9b0cd027f7878d629d76` | preserve-only |
| `word/endnotes.xml` | 3012 | `43e8c05e0aa8de01517267fa8c8d2079807e9eee95400b143541519b5c87c1a7` | preserve-only |
| `word/footer1.xml` | 3351 | `e92dcd5ba3e08ce4357501f79e09fe302071afa6a4219e4444712ed3a3ee03c3` | preserve-only |
| `word/footer2.xml` | 4567 | `bdd3d89582e31149c9268ef5ceee0d57a12d9c9458b991019202b1fc9b05a6b5` | preserve-only |
| `word/media/image1.png` | 361359 | `6b18e01949e4b1693aec0214c5a585ffb09c01d398268845ca8c36dd70d5fe4e` | preserve-only |
| `word/theme/theme1.xml` | 8393 | `70a70d84494772c1855ec6c2f9a16e0fc6cc41bdb0ce3743563ed943b63e07b8` | preserve-only |
| `word/settings.xml` | 4591 | `d969d8c9abd6f9beb1da3c3e1fddc7b7a70eb3ed90f60f67e6a2105e6665809d` | preserve-only |
| `word/numbering.xml` | 11976 | `b0aa7a4314a673d74e6fa2933cfee167893f367c9606f09687819a27217e3030` | preserve-only |
| `word/styles.xml` | 28801 | `c9fdd6ff027809d563f70ac61a8a5d7a9de1ac501f262734b1871d5088ffbd26` | preserve-only |
| `word/webSettings.xml` | 1056 | `600e4e5bea53730ec3419ad3690c272e1796011c0e1c66c6dbdd27e9cb517af5` | preserve-only |
| `word/fontTable.xml` | 3483 | `f31990197f086cd143d8e774fd4d76d146df4afa4c223b85798228993fc25c1e` | preserve-only |
| `docProps/core.xml` | 728 | `10553138cc5462d4794534eeaf2579f327408bb8dd59754fef268dbc9bed7820` | preserve-only |
| `docProps/app.xml` | 1005 | `60f66aa502c047bef9dcaae297343a7e32b2926616c7a5d419e2882645dd213c` | preserve-only |
| `docProps/custom.xml` | 404 | `dd141dd344765a10b313f1579ebb500b96ccae1e688cf87fcc81e9043b9f836f` | preserve-only |
