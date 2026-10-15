from pathlib import Path
import json, math, re
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output'/'pdf'/'CSIS_IT_Ticket_Log_System_UAT_Form.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
BLUE=HexColor('#363992'); LIGHT=HexColor('#F2F3FA'); GRAY=HexColor('#666666'); BORDER=HexColor('#A7A7B4')
W,H=A4; M=42; CW=W-2*M
styles={k:ParagraphStyle(k,fontName='Helvetica',fontSize=s,leading=l,textColor=black,spaceAfter=0) for k,s,l in [('body',10,13),('small',8.7,10.6),('tiny',7.6,9),('title',21,25)]}
C=canvas.Canvas(str(OUT),pagesize=A4)
C.setTitle('CSIS IT Ticket and Log System User Acceptance Testing Form')
C.setAuthor('CSIS IT Ticket and Log System Project Team')
pages=[]; fields=[]

def para(text,x,y,width=CW,style='body'):
 p=Paragraph(text,styles[style]); _,height=p.wrap(width,1000); p.drawOn(C,x,y-height); return y-height
def field(name,x,y,width,height=19,value='',multi=False):
 assert name not in fields,name
 fields.append(name)
 C.acroForm.textfield(name=name,tooltip=name.replace('_',' '),x=x,y=y,width=width,height=height,value=value,fontName='Helvetica',fontSize=9,borderWidth=.5,borderColor=BORDER,fillColor=white,textColor=black,forceBorder=True,fieldFlags='multiline' if multi else '')
def choice(name,x,y,width=102,options=None):
 assert name not in fields,name
 fields.append(name)
 options=options or ['Not run','Pass','Fail','Blocked','N/A']
 C.acroForm.choice(name=name,tooltip=name.replace('_',' '),x=x,y=y,width=width,height=18,options=options,value=options[0],fontName='Helvetica',fontSize=8.7,borderWidth=.5,borderColor=BORDER,fillColor=white,textColor=black,forceBorder=True,fieldFlags='combo')
def bar(title,y):
 C.setFillColor(BLUE); C.rect(M,y-22,CW,22,fill=1,stroke=0); C.setFillColor(white); C.setFont('Helvetica-Bold',10); C.drawString(M+8,y-15,title); return y-32
def start(title,sub=''):
 if pages: C.showPage()
 first=title not in pages
 pages.append(title)
 if first:
  key='section_'+str(len(pages)); C.bookmarkPage(key); C.addOutlineEntry(title,key,level=0,closed=False)
 C.setFillColor(BLUE); C.setFont('Helvetica-Bold',11); C.drawString(M,H-39,'Acceptance Form')
 C.setFillColor(GRAY); C.setFont('Helvetica',8); C.drawRightString(W-M,H-39,'CSIS IT Ticket and Log System  |  Version 1.0')
 C.setFillColor(BLUE); C.setFont('Helvetica-Bold',15); C.drawString(M,H-67,title)
 if sub: para(sub,M,H-77,CW,'small')
 C.setFillColor(GRAY); C.setFont('Helvetica',8); C.drawString(M,25,'UAT record  |  Complete results during testing')
 C.drawRightString(W-M,25,f'{len(pages)}')
 return H-100
def labeled(label,name,y,value='',height=20):
 C.setFillColor(black); C.setFont('Helvetica-Bold',9); C.drawString(M+8,y-14,label)
 field(name,M+145,y-height,CW-153,height,value); return y-height-9

# Each UAT identifier belongs to this form. Original technical FR identifiers are retained in sources.
F=[]; T=[]; P=[]; O=[]
def add(target,title,source,steps,expected): target.append(dict(title=title,source=source,steps=steps,expected=expected))

add(F,'Login and role routing','FS pp. 6, 10-11, Authentication; TS pp. 11, 24; D01','Log in as Student/Staff, Technician and Admin; repeat with invalid credentials.','Valid users reach the correct role dashboard using a secure session; invalid login shows a clear error. Student entry follows approved D01.')
add(F,'Profile and role administration','FS pp. 6-7, 9; TS p. 9, User Overview','Review a user profile and exercise authorized user and role management; repeat as an ordinary user.','Names, NWU email and assigned roles persist correctly; only authorized administrators can change permissions.')
add(F,'Structured fault submission','FS p. 11, Ticket Logging; TS pp. 13-14, FR1.1','Submit title, detailed description, category, location, lab station ID and urgency from the portal.','The form captures all required fault details, uses predefined categories and urgency selections, and confirms a successful submission.')
add(F,'Required fields and email validation','FS pp. 11, 13, Error Prevention; TS p. 18, 3.5.3','Omit each mandatory field, enter invalid field values and an invalid NWU email, then correct them.','Clear validation prevents incomplete or invalid tickets; corrected input is accepted. Record the approved institutional email domains.')
add(F,'Unique identity and ticket persistence','FS pp. 7, 11; TS p. 14, FR1.3','Create multiple tickets, reload them and inspect their saved records with an authorized tester.','Each ticket has a unique Ticket ID, creation time, correct reporter association and initial state; all fields persist in MongoDB. See D04.')
add(F,'Urgency and queue ordering','FS pp. 6, 11; TS p. 14, FR1.2','Create Low, Medium and High urgency tickets and inspect the technician queue.','Priority is saved accurately and organizes the queue so higher urgency work is visible first; hazardous priority is tested separately in T cases.')
add(F,'Reporter ticket visibility','FS pp. 6, 9, 13; TS pp. 17-18, 24','As two different reporters, view recent requests, open a ticket and track its status; try the other reporter ticket.','Each reporter sees their own requests and status history; another reporter ticket is inaccessible through both UI and API.')
add(F,'Technician queue and filters','FS pp. 9-10; TS p. 14, FR2.1','Open the technician dashboard, filter each lifecycle state and inspect priority ordering and ticket cards.','Authorized technicians see the permitted queue, status filters and history; cards show station ID, priority and time since submission. Labels follow D04.')
add(F,'Claim and technician assignment','TS p. 14, Feature 2 sequence; FS p. 6; D04','Claim a pending ticket and reopen it as the assigned technician.','The ticket records the technician and claim time, moves to the approved active state and updates the dashboard and history.')
add(F,'Controlled lifecycle changes','FS pp. 6, 12; TS p. 14, FR2.2; D04','Move a ticket through each approved state and attempt an unsupported state change.','Only approved transitions succeed; the ticket, queue and audit history remain consistent for New/Pending, Assigned, In Progress, Escalated and Resolved as agreed.')
add(F,'Start and stop job card timer','FS pp. 11-12, Job Cards; PP Appendix A UAT-02','Start a timer, wait a measured interval and stop it; inspect the job card and time log.','Start and stop timestamps persist, active work changes the state to In Progress, duration is calculated to the second and the displayed total matches MongoDB.')
add(F,'Accumulated work sessions','FS p. 12, Job Cards','Start and stop two measured work sessions for the same ticket, then reopen the job card.','The total adds both sessions correctly in minutes/hours, persists after reload and has timestamped audit entries for the time records.')
add(F,'Claim to resolution elapsed time','TS p. 15, FR2.5; FS p. 12; D06','Record a claim time, pause active work and later resolve the ticket; compare reported durations.','Claim-to-resolution elapsed time is calculated and saved separately from accumulated active timer time and creation-to-closure turnaround, using approved D06 definitions.')
add(F,'Resolve with mandatory summary','FS p. 12, Resolution; TS p. 14, FR2.3','Attempt resolution with no summary, then enter troubleshooting steps and resolve.','An empty summary prevents closure; valid resolution records notes and closure time, archives the ticket from active queues and triggers the user notification.')
add(F,'NWU Central IT escalation','TS pp. 8, 11, 14-15, FR2.4; FS p. 16 ISS-03','Escalate a ticket with a reason and inspect the hand-off record with the supervisor.','Status becomes Escalated to NWU IT with reason and traceable administrative hand-off; integration records referrals without requiring write access to central IT databases.')
add(F,'Chronological ticket conversation','FS p. 12, Communication; TS p. 16, FR5.1','Reporter and assigned technician exchange several comments on one ticket; reload the thread.','Messages remain linked to the correct Ticket ID, in time order, with sender identity and timestamp; both permitted parties see the same persisted conversation.')
add(F,'Comment notification to counterparty','FS p. 12; TS p. 17, FR5.2','Add a public technician comment, then a reporter reply; inspect both NWU inboxes.','Each new public comment triggers an alert to the other party with the relevant ticket link and without exposing another ticket conversation.')
add(F,'Internal technician notes','FS p. 7; TS p. 17, FR5.3','Post an Internal Only note, then inspect the ticket and notification content as IT staff and as reporter.','Authorized IT staff can read the note; the student/staff reporter cannot view it in the UI, API responses or notification contents.')
add(F,'Immutable communication history','TS p. 17, FR5.4','Post comments and attempt to edit or delete the existing communication through the UI and API.','Posted communication remains immutable and cannot be deleted; the complete troubleshooting history persists under the approved retention approach D08.')
add(F,'Ticket receipt email','FS pp. 11-12; TS p. 15, FR3.3','Submit a valid ticket and inspect the generated email and delivery evidence.','An automatic receipt contains the unique Ticket ID and submitted summary, reaches the correct NWU inbox and links to the ticket.')
add(F,'Creation claim status and resolution alerts','FS p. 12, Notifications; TS p. 15, FR3.1-3.2','Create, claim, change status and resolve a ticket; capture the resulting notification for each event.','The NWU SMTP service dispatches correctly addressed, template-based updates for all specified events with the right status, dynamic data and direct ticket link.')
add(F,'Historical search and filtering','FS pp. 12-13, Reporting; TS p. 16, FR4.2','Filter historical tickets by date range, technician and hardware/category; compare selected records.','Only matching tickets are returned and the filters produce consistent inputs for management reports.')
add(F,'Management metrics and charts','FS pp. 6-7, 12-13; TS p. 16, FR4.3','Use a known dataset to calculate turnaround, response times, resolution rates, category counts and workload totals.','Admin graphs and tables match the source data, show workload distribution and recurring faults, and use correct time definitions including creation-to-closure turnaround.')
add(F,'CSV and PDF reporting','FS p. 13, Admin Reporting','Apply report filters and download the report in CSV and PDF; open both downloads.','Both report formats contain the selected data and accurate metrics; files are readable and accessible only to the authorized role.')
add(F,'Permanent ticket audit trail','FS pp. 6-7, 13; TS p. 16, FR4.1; pp. 24, 26','Perform login attempts, claims, state changes, time entries and closure; review the audit data as Admin.','Critical actions have actor and timestamp records, every state change exists in audit_logs and each resolved ticket identifies its technician and closure time; records resist modification.')
add(F,'Live status and dashboard updates','FS p. 13, Performance; TS pp. 18, 21-22','Open reporter and technician views in separate sessions; create a ticket, change status and post a comment.','Ticket lists, status and public messages update asynchronously without a full page refresh, with near real-time visibility and recorded latency.')
add(F,'End to end student and staff workflow','FS pp. 6, 11-13; PP M6','As Student and Staff, submit an issue, read the receipt, reply to the technician and follow the ticket to resolution.','Both user groups complete the full reporting and communication workflow successfully and receive the final resolution update.')
add(F,'End to end technician and Admin workflow','FS pp. 9-13; TS pp. 14-17; PP M6','As Technician, claim, time, discuss and resolve a fault; as Admin, inspect its history and report.','All job card, notification, audit and reporting records agree for the same ticket, with role boundaries maintained throughout.')

add(T,'MERN architecture and frontend baseline','FS pp. 6-8, 10; TS pp. 12, 19, 3.7.1; D02','Inspect deployed components, dependency versions and the approved frontend decision.','MongoDB, Express and Node.js implement persistence and backend logic. React SPA in FS versus Vanilla JavaScript in TS is resolved and evidenced under D02.')
add(T,'Runtime framework and server OS','TS pp. 10, 19-20, 3.7.1-3.7.3','Record installed versions and verify startup in the target server environment.','Node.js is v20.x or greater; Express.js v4.x baseline is verified; target is Ubuntu Server 22.04 LTS or configured Windows Server with a Node process manager such as PM2.')
add(T,'Approved hosting and local data storage','FS pp. 7-8; TS pp. 10, 19; PP Procurement; D05','Inspect application/DB hosting, data locations, server allocation and available storage.','The approved CSIS physical/virtual host supports the runtime and persistent ticket/audit storage; data location follows the agreed university boundary and D05.')
add(T,'Browser and desktop platform coverage','FS p. 7; TS pp. 10, 20, 25-26','Run submission, dashboard and notification-link workflows in Chrome, Firefox, Edge and Safari on supported desktops.','Functional parity is recorded for Chrome/Firefox/Edge, with FS Safari coverage; Windows 10/11, macOS and Linux browser access works without client installation.')
add(T,'Mobile compatibility and touch workflow','FS pp. 7, 10, 13; TS pp. 10, 17-19, 25-26','Use Android and iOS phones/tablets to submit, claim, time, comment and resolve tickets.','Mobile workflows match desktop functionality with readable responsive layouts and touch-friendly controls; FS Android 8.0+ and iOS 11.3+ support is documented or dispositioned.')
add(T,'Minimum client hardware and campus network','FS p. 7; TS pp. 18-19, 21','Exercise workflows on a 2 GB RAM dual-core desktop at 720p and a 2 GB quad-core mobile device with a 5-inch display.','Core functions remain usable with keyboard/mouse or touch over stable LAN, Wi-Fi or approved mobile access; standard 10/100 campus networking is sufficient.')
add(T,'NWU branding and status indicators','FS p. 13, Usability; TS pp. 17-18, 3.5.1-3.5.2','Inspect the portal, job cards and Admin views against the approved NWU identity.','Purple/white branding and typography are consistent; deep purple #4B2C70 primary elements, slate secondary actions and labelled green/amber/red statuses follow the specified design.')
add(T,'WCAG accessibility and keyboard navigation','TS p. 17, 3.5.1; PP M4','Review WCAG 2.1 evidence and manually navigate login, submission, timers, comments and reports using only the keyboard.','The specified WCAG 2.1 requirements, including contrast and keyboard access, are met; focus and labels support the workflows. Attach the audit scope and findings.')
add(T,'Clear UI and conceptual screen coverage','FS pp. 10, 13; TS pp. 12, 18, 3.5.4','Review the submission portal, recent tickets, job card board and analytics screen with end users.','Labels and errors are understandable; Log New Fault/recent-ticket access, station/priority/time details and lab/category analytics are present. Conceptual layouts are reviewed against approved designs.')
add(T,'HTTP API and JSON data exchange','FS pp. 10-11; TS pp. 20-21, 3.7.4, 3.8.1-3.8.2','Trace browser requests for create, read and update actions using authorized technical tools.','REST methods such as GET, POST and PUT exchange structured JSON between browser and backend; MongoDB storage and outbound Admin metrics follow the specified data flow.')
add(T,'HTTPS and TLS protection','FS pp. 7, 11, 13; TS pp. 20-21, 24','Inspect web endpoints and TLS negotiation for login, ticket operations and report downloads.','Web traffic uses HTTPS with TLS 1.2 or higher, protecting credentials and ticket data in transit; unencrypted access cannot expose protected data.')
add(T,'Secure institutional SMTP integration','FS pp. 7, 11-12; TS pp. 19-21, 3.7.2, 3.8.2','Inspect Nodemailer configuration, relay permissions, transport encryption and test deliveries.','Notifications use the NWU gateway and approved NWU addresses. Port 587 with STARTTLS meets the secure baseline; any port 25 use cited in TS p. 20 has an approved encrypted relay configuration.')
add(T,'Asynchronous notification processing','TS pp. 21-22, 3.8.1, 3.9.3','Generate multiple notification events while submitting and updating tickets; inspect delivery queue evidence.','Email processing does not block application requests and sustained test traffic leaves no unresolved notification backlog.')
add(T,'JWT session enforcement','FS p. 11; TS pp. 11, 20-21, 24','Call management APIs with a valid token, no token, an altered token and an expired token.','Signed JWTs establish identity and role for protected requests; invalid or absent tokens cannot claim, close or alter tickets or audit data. D01 governs reporter entry.')
add(T,'Standalone authentication boundary','TS p. 20, 3.7.5; FS p. 16 ISS-05','Review login dependencies and management access with central SSO unavailable.','Management authentication operates using the internal module; no unavailable central Active Directory/SSO API is required for the initial release. Future integrations remain separately scoped.')
add(T,'Role and object authorization','FS p. 13, Security; TS p. 24, 3.11.1','Attempt own/other reporter reads and edits, technician ticket actions, role changes and Admin report/log access.','Reporters are limited to their own tickets; technicians manage approved workloads; reports/system logs and permission changes are restricted to authorized administrators. Resolve queue scope in D04.')
add(T,'bcrypt credential storage','TS p. 24, 3.11.1','Inspect test-account credential records and password verification configuration with an authorized administrator.','Stored passwords are salted bcrypt hashes with the configured high work factor; no plaintext credential storage is present. Record configuration evidence without copying secrets.')
add(T,'Server input sanitization','TS pp. 21, 24, 3.8.3, 3.11.2','In the test environment submit malformed values, NoSQL operators and inert XSS/injection test strings through forms and API calls.','Server validation using express-validator prevents injection, unauthorized database access and browser script execution, including when client validation is bypassed.')
add(T,'MongoDB network access restriction','TS p. 24, 3.11.3','Review database firewall/bind rules and attempt database connections from permitted and unpermitted test hosts.','Only the application server IP can connect to MongoDB; direct client or unapproved-host access is denied.')
add(T,'Personal information purpose and protection','FS pp. 7-8, 13; TS pp. 23-24','Review collected names, NWU emails, ticket content, access permissions and encryption/security evidence with the responsible reviewer.','Personal data supports incident resolution and follows documented POPIA and university handling controls; access and data protection evidence is attached for acceptance review.')
add(T,'Retention archive and anonymization','TS p. 24, 3.11.3; FS p. 13; D08','Review the approved post-2026 retention procedure and exercise it on test records.','Records are archived or anonymized after the academic cycle according to the approved policy, while audit traceability and immutable operational history are handled as agreed in D08.')
add(T,'UI response within two seconds','FS p. 13, Performance; TS p. 22, 3.9.1; PP M4','Measure login, ticket acknowledgement, timer start and ordinary status/message interactions under normal network conditions.','Standard input responses and ticket acknowledgement are within 2.0 seconds; record timings, network conditions and any failures. PP page-load checks are also captured.')
add(T,'Fifty concurrent connections','TS p. 22, 3.9.3; D07','Run at least 50 simultaneous connections exercising submissions, status changes and notifications.','Service remains responsive without data corruption or service decline; capture response times, error counts and notification queue drain evidence.')
add(T,'Large histories and resource efficiency','TS p. 22, 3.9.2; FS p. 13','Load representative large ticket histories and monthly reports on older lab and mobile clients; record CPU/RAM and timings.','The system remains usable without client slowdown or significant lag. Record observed limits and agree a dataset and qualitative acceptance decision where no numeric budget is specified.')
add(T,'Concurrent dashboard synchronization','TS p. 22, 3.8.4','Open two technician sessions, create a new fault and attempt to claim the same ticket from both sessions.','Polling or supported WebSockets promptly refresh both views; one consistent technician assignment is retained and conflicting claims do not overwrite each other silently.')
add(T,'Functional specification availability target','FS p. 13, Availability; D03','Review monitoring logs for the agreed academic-hours observation window and calculate uptime.','Measure against the FS target of 99.9% during standard academic hours; record window, downtime and result separately from the technical target until D03 is approved.')
add(T,'Technical availability and downtime target','TS p. 25, 3.12.2; D03','Review logs for 07:30-18:00 Monday-Friday and semester unplanned downtime.','Measure both TS requirements: 98% uptime in that window and no more than 9.5 hours unplanned downtime per semester. Record period and resolve the differing targets under D03.')
add(T,'Unassisted student learnability','TS p. 25, 3.12.3','Have 10 new students independently submit a fault without training or verbal assistance; record each elapsed time.','All 10 students submit successfully without verbal help and each submission takes less than 60 seconds; attach participant timing evidence.')
add(T,'Hazard priority and visual alert','TS p. 23, 3.10.1; D09','Submit safe test descriptions of live-wire/burning-equipment hazards and inspect the technician dashboard.','Physical-risk tickets receive Critical/Hazardous priority and a prominent red labelled alert for immediate attention; no actual hazardous equipment is needed for testing.')
add(T,'Recurring hardware fault visibility','TS pp. 18, 23, 3.10.1','Create recurring hardware-failure examples for the same lab location/server rack and inspect historical reports.','Technicians and management can identify repeated location-specific failures for investigation, including potential overheating/cooling patterns.')
add(T,'Crash safe ticket updates','TS p. 23, 3.10.2','In an isolated test environment interrupt a status update, recover the service and inspect ticket and audit data.','Transactional handling restores the last known good state or a fully committed update; no partial or lost hazard ticket remains.')
add(T,'Unanswered physical hazard escalation','TS p. 23, 3.10.2','Set and record the approved hazard timeout, leave a Physical Hazard test ticket unanswered and observe escalation.','At the predetermined interval the Lab Manager receives the escalation notification. Thirty minutes is an example in TS, not a fixed threshold until approved.')
add(T,'Safety records and reminders','TS p. 23, 3.10.3','Review a hardware fault submission and retrieve the hazard handling history with the safety reviewer.','The form displays approved NWU laboratory safety reminders; digital records show reported hazards and actions for the institution safety review and OHSA evidence.')
add(T,'Daily automated database backups','TS p. 26, 3.12.6; PP Risk Plan','Inspect backup schedules, logs and artifacts for consecutive 24-hour windows.','MongoDB backups run automatically and successfully at least once per 24-hour window; evidence identifies the latest recoverable backup.')
add(T,'Restore within two hours','TS p. 26, 3.12.6','Restore a backup into an isolated environment using the documented procedure; time the operation and validate records.','The database returns to its last known good backed-up state within 2 hours, with ticket, user, time-log and audit integrity verified.')
add(T,'Endpoint documentation and code quality','FS pp. 8-9, 13; TS p. 25, 3.12.1','Review all backend endpoints, code comments, schema naming and static analysis results.','Every endpoint has JSDoc or Swagger documentation; ESLint or equivalent reports no critical style violations. snake_case data names and PascalCase modules follow TS conventions or documented exceptions.')
add(T,'Developer onboarding and modular maintenance','FS pp. 8-9, 13; TS p. 25, 3.12.1','Give a new maintainer the README and repository; time setup and review separation of major modules.','The maintainer can run the application in less than 20 minutes using the README; commented modular code supports future maintenance and deployment to other departments.')
add(T,'End user help and manuals','FS p. 9, User Documentation; TS pp. 11-12','Open the quick-start PDF, login-page FAQ and user/technician/Admin manuals; follow a workflow from each.','Help covers access/login and password recovery, submission/categories, ticket status, timer use, secure comments, reports, user roles and troubleshooting in clear visual steps.')
add(T,'Technical documentation and models','FS pp. 9, 15; TS pp. 11-12, 27-28','Review the handover set and referenced analysis models against the release.','Architecture, ERD, state transitions, wireframes, schemas, server deployment, SMTP setup and failure troubleshooting are available, current and professionally typed; external references follow NWU Harvard style.')
add(T,'Version control and update delivery','FS p. 8; TS pp. 12-13, 20','Review GitHub history, repository documentation and the departmental deployment/update procedure.','Source and technical documents are version controlled, secure SSH/HTTPS supports repository access and the documented update process delivers the approved release to the departmental server.')
add(T,'Zero licence cost and launch scope','FS p. 8; TS p. 11, 2.5.2-2.5.3; PP Financial Plan','Review production dependencies, service plans and permitted deployment audience.','The release uses approved free/open-source tooling and university resources with zero new licensing costs; initial launch is restricted to CSIS labs/offices within the 2026 scope.')

add(P,'Automated API and security acceptance evidence','PP Acceptance Plan M3; Quality Plan','Review the release automated API/unit test suite and security assessment.','Automated API tests have a 100% pass rate and there are zero critical security vulnerabilities; attach the release-specific reports.')
add(P,'One hundred user performance exercise','PP Quality Plan, Performance Load Testing; D07','Simulate up to 100 users performing representative workflows and capture response-time and integrity results.','The project-plan sub-2.0-second response target is assessed at the 100-user profile; retain this evidence separately from the TS minimum of 50 connections.')
add(P,'Resolution email within two minutes','PP Appendix A UAT-03; FS p. 12','Change a test ticket to Resolved; record trigger, dispatch and inbox arrival times.','The resolution email dispatches within 2 minutes of the trigger. Record inbox arrival separately so dispatch and delivery are distinguishable.')
add(P,'Infrastructure and relay readiness','FS p. 16 ISS-02; TS p. 28 ISS-001/002; PP Procurement','Review the allocated host, database access, network paths, SMTP credentials and relay permission evidence.','The dedicated environment and email relay are provisioned and verified; unresolved dependencies have owners and cannot be recorded as passed without evidence.')
add(P,'Operational transfer and deployment verification','PP Appendix D; Acceptance Plan M7','Review repository ownership, VM/SSH and MongoDB access transfer with the CSIS Network Administrator; verify deployed workflows.','The permanent maintainer receives ownership/access through secure channels, environment/IP/connection documentation and user guides; sponsor reviews deployment and handover evidence.')
add(P,'User adoption and escalation readiness','FS p. 16 ISS-01/03/04/06; PP Risk Plan','Review assigned maintenance capacity, the approved NWU escalation procedure and transition from the legacy support mailbox.','A support owner, clear user guide and escalation hand-off exist; the planned automatic legacy-mailbox reply directs users to the portal and outstanding project issues have recorded actions.')

add(O,'Future file attachments','TS p. 17, FR5.5','Review architecture and any separately approved attachment scope.','The design can be extended to screenshot/log uploads; implemented upload functionality is a future enhancement unless explicitly included in this release.')
add(O,'Optional offline queue viewing','FS p. 14, Offline Resilience','Review service-worker/cache design and, only if implemented, view a queue during a simulated disconnection.','Offline access is optional/future scope; record implementation evidence or an approved N/A disposition without making it a current mandatory gate.')
add(O,'Optional browser printing','TS p. 19, 3.6.3','If in scope, use browser print on a job card or solution report.','The optional printed output is readable through standard OS/browser printing; otherwise record approved N/A.')
add(O,'Future Outlook or central system integrations','FS p. 16 ISS-05; TS pp. 11, 20','Review proposed integration boundaries and MFA/SSO dependencies with the supervisor.','Future Outlook/calendar and full central-system integration remain separately approved work; initial escalation record and local management login remain testable without them.')

groups=[('Criteria 1 Functional requirements','F',F),('Criteria 2 Technical and nonfunctional requirements','T',T),('Supporting project plan acceptance checks','P',P),('Optional and future requirements','O',O)]
allcases=[]
for _,prefix,items in groups:
 for i,item in enumerate(items,1): item['id']=f'UAT-{prefix}{i:02d}'; allcases.append(item)

y=start('User Acceptance Testing Form')
y=bar('PROJECT DETAILS',y)
y=labeled('Project Name','project_name',y,'CSIS IT Ticket and Log System')
y=labeled('Project Team','project_team',y,'Shani Nezar and Lia Theunissen')
y=labeled('Project Manager','project_manager',y)
y=labeled('Project Lead','project_lead',y)
y=labeled('Project Sponsor','project_sponsor',y,'Selouna Visser')
y-=8; y=bar('ACCEPTANCE DETAILS',y)
y=labeled('Acceptance ID','acceptance_id',y)
y=labeled('Requested By','requested_by',y,'CSIS IT Ticket and Log System Project Team')
y=labeled('Date Requested','date_requested',y)
y=labeled('Release or Build','release_build',y)
y=labeled('Environment and URL','environment_url',y)
y=labeled('UAT Dates','uat_dates',y)
y-=7; y=bar('DESCRIPTION',y)
y=para('The CSIS IT Ticket and Log System is a web application for students and staff to report IT faults and for technicians to manage tickets, record job card time, communicate with reporters and escalate issues to NWU Central IT. Administrators use historical records, audit trails and performance reports to oversee departmental support.',M+8,y,CW-16)
y-=9
y=para(f'This acceptance form records whether the release meets the functional and technical specifications. It contains {len(F)} functional checks, {len(T)} technical checks, {len(P)} supporting project-plan checks and {len(O)} optional or future checks. Complete actual outcomes and evidence during execution before customer approval.',M+8,y,CW-16)
y-=14; y=bar('ACCEPTANCE CRITERIA',y)
para('Criteria 1 covers user-visible workflows. Criteria 2 covers architecture, interfaces, security, safety, performance and software quality. Supporting project-plan checks capture additional quality and handover gates. Technical evidence is reviewed by the technical lead or system administrator alongside user testing.',M+8,y,CW-16,'small')

y=start('Test preparation and source references')
y=bar('EXECUTION INSTRUCTIONS',y)
instructions=[
'Use a sandbox or agreed test environment, representative sample tickets and controlled NWU test inboxes. Record the release, browser, device, network and dataset used. Use authorized technical reviewers for API, security, backup and infrastructure evidence.',
'Execute each check and select Pass, Fail, Blocked or N/A. Not run is the initial state. Enter the actual result and an evidence or defect reference. Page-level reviewer and date fields apply to the checks on that page; note exceptions in the evidence field.',
'Pass requires the expected result and supporting evidence. Blocked identifies a dependency or unresolved baseline decision. N/A requires an approved reason or scope decision. Optional/future checks do not become mandatory without scope approval.',
'Use continuation records for lengthy evidence. Link defects to their UAT IDs and record ownership, remedial action and retest evidence. Results and customer approval are completed after execution; this form does not certify that testing has occurred.'
]
for t in instructions: y=para(t,M+8,y,CW-16,'small')-10
y=bar('SUPPORTING DOCUMENTATION',y-4)
sources=[
('FS','CSIS IT Ticket Log System Functional Specification','Version 1.0.2; cover dated 11 May 2026; 16 PDF pages.'),
('TS','CSIS IT Ticket Log System Technical Specification','Version 1.0.1; dated 9 May 2026; 28 PDF pages.'),
('PP','IT Ticket and Log System Project Plan','DOCX revision 1.2 dated 28 May 2026, plus the supplied PDF project plan. References use named sections and appendices.'),
('Template','HartSpec GUI User Acceptance Testing Form','Supplied 4-page PDF; section structure adapted for the CSIS project.')]
for code,title,detail in sources:
 y=para(f'<b>{code} - {title}</b><br/>{detail}',M+8,y,CW-16,'small')-10
y=para('FS and TS page references use the PDF page sequence, including covers, because the technical contents page and printed numbering differ. UAT IDs are local identifiers created for this form; original FR1.1 through FR5.5 identifiers are retained in the relevant source references. Descriptive and repeated requirements are consolidated into testable checks.',M+8,y-2,CW-16,'small')-15
y=bar('TEST DATA AND REVIEWERS',y)
y=labeled('Dataset Reference','dataset_ref',y)
y=labeled('User Reviewers','user_reviewers',y)
y=labeled('Technical Reviewers','technical_reviewers',y)
y=labeled('Evidence Location','evidence_location',y)

decisions=[
('D01','Reporter authentication','FS p. 11 requires email/password login and a logged-in reporter. TS p. 11 permits NWU-email reporting without account creation. Confirm entry, identity verification and secure access to own tickets.'),
('D02','Frontend technology','FS pp. 6-10 specifies a React MERN single-page application. TS p. 19 specifies HTML5, CSS3 and Vanilla JavaScript. Confirm the release architecture and any accepted deviation.'),
('D03','Availability target and period','FS p. 13 targets 99.9% during academic hours. TS p. 25 specifies 98% during 07:30-18:00 Monday-Friday and a 9.5-hour semester downtime cap. Agree target, calendar and measurement period.'),
('D04','Lifecycle labels and technician access','FS uses New, Assigned, In Progress and Resolved and assigned workloads. TS uses Pending and Escalated, claim-to-In Progress, and an all-open-ticket dashboard. Agree transitions, label mapping and permission scope.'),
('D05','Hosting boundary','FS p. 7 and TS p. 19 require CSIS internal hosting; TS p. 10 also mentions cloud hosting. Confirm the approved environment and university data-location boundary.'),
('D06','Definitions of time metrics','FS requires accumulated start/stop work time and creation-to-closure turnaround. TS FR2.5 requires claim-to-resolution elapsed time. Keep all three distinct and agree the report labels/calculations.'),
('D07','Concurrent load profiles','TS p. 22 requires at least 50 connections. The project Quality Plan tests up to 100 users with sub-2.0-second responses. Record both profiles and identify the approved release gate.'),
('D08','Audit permanence and retention','FS p. 13 and TS FR4.1/FR5.4 require permanent/immutable history; TS p. 24 requires post-2026 archiving or anonymization. Agree how retention preserves approved audit requirements.'),
('D09','Hazard priority and escalation interval','TS FR1.2 lists Low/Medium/High; TS p. 23 adds Critical/Hazardous and a predetermined timeout, with 30 minutes as an example. Approve the expanded priority set, timeout and Lab Manager recipient.')]
for chunk in range(0,len(decisions),5):
 y=start('Acceptance baseline decisions', 'Record the approved interpretation before passing affected checks. Retain both source requirements until resolved.')
 for code,title,body in decisions[chunk:chunk+5]:
  y=bar(f'{code}  {title.upper()}',y)
  y=para(body,M+8,y,CW-16,'small')-6
  field(f'{code}_decision',M+8,y-26,CW-16,26,multi=True); y-=48
 y=para('Decision approver and date',M,y-3,CW,'small')-5
 field(f'decision_approver_{chunk}',M,y-20,CW,20)

for title,prefix,items in groups:
 page_count=math.ceil(len(items)/5)
 batches=[]; cursor=0
 for n in range(page_count):
  size=len(items)//page_count+(n<len(items)%page_count)
  batches.append((cursor,items[cursor:cursor+size]));cursor+=size
 for offset,batch in batches:
  y=start(title, f'{batch[0]["id"]} to {batch[-1]["id"]}  |  Record actual outcomes, evidence links and defect IDs in the fields below.')
  for case in batch:
   top=y
   C.setStrokeColor(BORDER); C.setLineWidth(.5); C.rect(M,top-121,CW,121,fill=0,stroke=1)
   C.setFillColor(LIGHT); C.rect(M+.3,top-20,CW-.6,19.5,fill=1,stroke=0)
   C.setFillColor(BLUE); C.setFont('Helvetica-Bold',9.5); C.drawString(M+7,top-13,case['id']+'  '+case['title'])
   yy=para(escape(case['source']),M+7,top-24,CW-14,'tiny')-3
   yy=para('<b>Test</b> '+escape(case['steps']),M+7,yy,CW-14,'small')-3
   yy=para('<b>Expected</b> '+escape(case['expected']),M+7,yy,CW-14,'small')
   assert yy>=top-88,(case['id'],top-yy)
   C.setFillColor(GRAY); C.setFont('Helvetica',7.7); C.drawString(M+7,top-98,'Result')
   choice(case['id']+'_result',M+38,top-116,87)
   C.drawString(M+134,top-94,'Actual outcome / evidence / defect reference')
   field(case['id']+'_evidence',M+134,top-116,CW-141,20,multi=True)
   y-=129
  C.setFillColor(black); C.setFont('Helvetica',8.5); C.drawString(M,64,'Reviewer')
  field(f'{prefix}_{offset}_reviewer',M+45,57,270,20)
  C.drawString(M+330,64,'Date'); field(f'{prefix}_{offset}_date',M+358,57,CW-358,20)

y=start('Acceptance results')
y=bar('ACCEPTANCE RESULTS',y)
y=labeled('Testing Methods Used','testing_methods',y,height=40)
y=labeled('Lead UAT Reviewer','lead_uat_reviewer',y)
y=labeled('Date Completed','date_completed',y)
y=labeled('Release Tested','release_tested',y)
y=para('Summarize the executed checks below. Totals are entered by the reviewer; they do not calculate automatically. Count optional checks separately from the mandatory release baseline.',M+8,y-5,CW-16,'small')-12
widths=[187,58,58,58,67,83]; labels=['Acceptance group','Total','Pass','Fail','Blocked','Not run / N/A']
xx=M
for lab,ww in zip(labels,widths):
 C.setFillColor(BLUE); C.rect(xx,y-25,ww,25,fill=1,stroke=0); para(f'<font color="white"><b>{lab}</b></font>',xx+5,y-5,ww-10,'small'); xx+=ww
y-=25
for label,prefix,items in groups:
 hh=44; C.setStrokeColor(BORDER); C.rect(M,y-hh,CW,hh)
 para(label,M+5,y-7,177,'small'); xx=M+187
 for col,ww in zip(['total','pass','fail','blocked','remaining'],widths[1:]):
  field(f'summary_{prefix}_{col}',xx+4,y-34,ww-8,22,str(len(items)) if col=='total' else '');xx+=ww
 y-=hh
y-=20; y=bar('OVERALL RESULTS',y)
choice('overall_result',M+8,y-22,CW-16,['Not assessed','Accepted','Accepted pending changes','Not accepted'])
y-=40
y=para('Record overall findings, residual risk and remedial action required. Every failed or blocked check needs a defect/action reference, an owner and a retest or approved disposition.',M+8,y,CW-16,'small')-8
field('overall_findings',M+8,y-60,CW-16,60,multi=True)
y-=82
y=para('Criteria 1 reviewer and date',M+8,y,235,'small');field('functional_signoff',M+8,y-24,CW-16,22)
y-=40; y=para('Criteria 2 technical reviewer and date',M+8,y,300,'small');field('technical_signoff',M+8,y-24,CW-16,22)

y=start('Remedial action and retest record')
y=para('Use the UAT ID and a linked defect record to preserve the full reproduction steps and evidence. Copy this page or attach a controlled continuation sheet if more rows are required.',M,y,CW,'small')-16
for i in range(1,4):
 y=bar(f'ACTION {i}',y)
 C.setFillColor(black); C.setFont('Helvetica',8.5)
 C.drawString(M+8,y-12,'UAT ID / defect');field(f'action_{i}_id',M+95,y-19,153,20)
 C.drawString(M+263,y-12,'Severity');field(f'action_{i}_severity',M+315,y-19,CW-323,20)
 y-=29
 C.drawString(M+8,y-12,'Owner / due date');field(f'action_{i}_owner_due',M+95,y-19,CW-103,20)
 y-=28;C.drawString(M+8,y-10,'Remedial action and actual retest evidence')
 field(f'action_{i}_details',M+8,y-44,CW-16,30,multi=True)
 y-=53
 C.drawString(M+8,y-11,'Retest result');choice(f'action_{i}_result',M+82,y-18,100)
 C.drawString(M+197,y-11,'Retester / date');field(f'action_{i}_retester',M+279,y-19,CW-287,20)
 y-=37

y=start('Customer approval')
y=bar('CUSTOMER APPROVAL',y)
y=para('The customer reviewer assesses the completed UAT record, supporting technical evidence, baseline decisions and remedial actions before recording the acceptance decision. Acceptance pending changes must identify the conditions and responsible owners.',M+8,y,CW-16)-15
y=labeled('Customer Reviewer','customer_reviewer',y)
y=labeled('Role','customer_role',y,'CSIS IT Supervisor / Project Sponsor')
y=labeled('Release Approved','release_approved',y)
y=labeled('Acceptance Record ID','approval_record_id',y)
y-=9; y=bar('ACCEPTANCE DECISION',y)
choice('customer_decision',M+8,y-22,CW-16,['Not assessed','Accepted','Accepted pending changes','Not accepted'])
y-=41
y=para('Conditions of acceptance or reasons for nonacceptance',M+8,y,CW-16,'small')-6
field('acceptance_conditions',M+8,y-85,CW-16,85,multi=True);y-=105
y=labeled('Customer Signature','customer_signature',y,height=28)
y=labeled('Date','customer_signature_date',y)
y=labeled('Project Manager','pm_approval_name',y)
y=labeled('Signature and Date','pm_signature_date',y,height=28)
y=labeled('Technical Reviewer','technical_approval_name',y)
y=labeled('Signature and Date','technical_signature_date',y,height=28)
y-=9;y=bar('SUPPORTING DOCUMENTATION',y)
para('Functional Specification v1.0.2; Technical Specification v1.0.1; Project Plan and acceptance/quality appendices; completed test evidence; approved baseline decisions; defect and retest records; operational handover evidence.',M+8,y,CW-16,'small')

C.save()
reader=PdfReader(OUT)
assert len(reader.pages)==len(pages)
actual=reader.get_fields() or {}
assert set(actual)==set(fields),(len(actual),len(fields))
assert all(actual[c['id']+'_result'].get('/V')=='Not run' for c in allcases)
assert all(actual[c['id']+'_evidence'].get('/V','')=='' for c in allcases)
text='\n'.join(p.extract_text() or '' for p in reader.pages)
assert 'HartSpec GUI Development Team' not in text
assert 'Passed into Exceeded' not in text
for case in allcases: assert case['id'] in text,case['id']
manifest=dict(output=str(OUT),pages=pages,field_count=len(fields),counts={p:len(v) for _,p,v in groups},cases=allcases)
(ROOT/'tmp'/'uat'/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(dict(path=str(OUT),pages=len(pages),cases=len(allcases),fields=len(fields))))
