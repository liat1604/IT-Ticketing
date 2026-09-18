from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "csis-it-support-user-guide.pdf"
LOGO = ROOT / "client" / "public" / "ticket-logo.png"

PURPLE = colors.HexColor("#4B2C70")
PURPLE_DARK = colors.HexColor("#35204E")
PURPLE_LIGHT = colors.HexColor("#F2ECF8")
SLATE = colors.HexColor("#334155")
SLATE_LIGHT = colors.HexColor("#F1F5F9")
MUTED = colors.HexColor("#64748B")
GREEN = colors.HexColor("#15803D")
GREEN_LIGHT = colors.HexColor("#DCFCE7")
AMBER = colors.HexColor("#B45309")
AMBER_LIGHT = colors.HexColor("#FEF3C7")
RED = colors.HexColor("#B91C1C")
RED_LIGHT = colors.HexColor("#FEE2E2")
BLUE_LIGHT = colors.HexColor("#E0F2FE")
WHITE = colors.white


def make_styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=28,
            leading=32,
            textColor=WHITE,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=17,
            textColor=colors.HexColor("#E9DDF6"),
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=PURPLE,
            spaceBefore=2,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=SLATE,
            spaceBefore=9,
            spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=13.2,
            textColor=SLATE,
            spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=MUTED,
        ),
        "label": ParagraphStyle(
            "Label",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=PURPLE,
            spaceAfter=2,
        ),
        "card_title": ParagraphStyle(
            "CardTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=PURPLE_DARK,
            spaceAfter=3,
        ),
        "badge": ParagraphStyle(
            "Badge",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=WHITE,
            alignment=TA_CENTER,
        ),
        "card_body": ParagraphStyle(
            "CardBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=SLATE,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=WHITE,
            alignment=TA_LEFT,
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            textColor=SLATE,
        ),
        "faq_question": ParagraphStyle(
            "FaqQuestion",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=12,
            textColor=PURPLE_DARK,
            spaceAfter=2,
        ),
    }


STYLES = make_styles()


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def bullet(text: str) -> Paragraph:
    return p(f"- {text}")


def section_title(title: str, subtitle: str | None = None):
    items = [p(title, "h1")]
    if subtitle:
        items.append(p(subtitle))
    items.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D8CBE6"), spaceAfter=8))
    return items


def step(number: int, title: str, body: str) -> Table:
    badge = Table(
        [[p(str(number), "badge")]],
        colWidths=[10 * mm],
        rowHeights=[10 * mm],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PURPLE),
                ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 0.5, PURPLE),
            ]
        ),
    )
    content = [p(title, "card_title"), p(body, "card_body")]
    table = Table([[badge, content]], colWidths=[13 * mm, 151 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 3 * mm),
                ("LEFTPADDING", (1, 0), (1, 0), 0),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def callout(title: str, body: str, background=PURPLE_LIGHT, accent=PURPLE) -> Table:
    table = Table(
        [[[p(title, "card_title"), p(body, "card_body")]]],
        colWidths=[166 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.75, accent),
                ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 11),
                ("RIGHTPADDING", (0, 0), (-1, -1), 11),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def role_cards() -> Table:
    cards = [
        ["Reporter", "Submit and follow requests, exchange public comments, and review the final resolution."],
        ["Technician", "Claim work, run timers, update status, add notes, escalate issues, and complete job cards."],
        ["Administrator", "Monitor service performance, manage users, review all tickets, reports, calendars, and audit activity."],
    ]
    cells = []
    for title, body in cards:
        cells.append([p(title, "card_title"), p(body, "card_body")])
    table = Table([cells], colWidths=[54 * mm, 54 * mm, 54 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SLATE_LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def workflow_table() -> Table:
    rows = [
        [p("Status", "table_header"), p("Meaning", "table_header"), p("What happens next", "table_header")],
        [p("New / Assigned", "table_body"), p("Logged and waiting, or allocated to a technician.", "table_body"), p("A technician claims or begins the request.", "table_body")],
        [p("In Progress", "table_body"), p("Active investigation or repair is underway.", "table_body"), p("Updates and recorded work time appear on the ticket.", "table_body")],
        [p("Awaiting Feedback", "table_body"), p("Support needs information or confirmation.", "table_body"), p("Reply in the public conversation thread.", "table_body")],
        [p("Escalated", "table_body"), p("The issue has been referred to NWU Central IT.", "table_body"), p("Track the reason and external reference on the ticket.", "table_body")],
        [p("Resolved", "table_body"), p("Work is complete and a resolution is recorded.", "table_body"), p("Review the resolution and retain the ticket as history.", "table_body")],
    ]
    table = Table(rows, colWidths=[31 * mm, 63 * mm, 72 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, SLATE_LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def faq_block(question: str, answer: str):
    return KeepTogether([p(question, "faq_question"), p(answer, "body"), Spacer(1, 2 * mm)])


def first_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PURPLE_DARK)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#6D4990"))
    canvas.circle(width - 28 * mm, height - 28 * mm, 48 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#5A377D"))
    canvas.circle(width - 4 * mm, 26 * mm, 42 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#D8CBE6"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(22 * mm, 13 * mm, "CSIS IT Support - North-West University")
    canvas.drawRightString(width - 22 * mm, 13 * mm, "User guide | September 2026")
    canvas.restoreState()


def later_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PURPLE)
    canvas.rect(0, height - 13 * mm, width, 13 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(22 * mm, height - 8.2 * mm, "CSIS IT SUPPORT")
    canvas.setStrokeColor(colors.HexColor("#D8CBE6"))
    canvas.line(22 * mm, 15 * mm, width - 22 * mm, 15 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(22 * mm, 9 * mm, "North-West University - Ticket and Log System")
    canvas.drawRightString(width - 22 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_story():
    story = []
    if LOGO.exists():
        logo = Image(str(LOGO), width=24 * mm, height=24 * mm)
        logo.hAlign = "LEFT"
        story.extend([Spacer(1, 18 * mm), logo, Spacer(1, 9 * mm)])
    else:
        story.append(Spacer(1, 42 * mm))

    story.extend(
        [
            p("CSIS IT Support", "cover_title"),
            p("Ticket and Log System - User Guide", "cover_title"),
            p("A practical guide for students, staff, technicians, and administrators.", "cover_subtitle"),
            Spacer(1, 14 * mm),
            role_cards(),
            Spacer(1, 12 * mm),
            callout(
                "Start here",
                "Open the CSIS IT Support portal in your browser and sign in with your @mynwu.ac.za email address. Students and staff may register a reporter account from the login page. Technician and administrator accounts are provisioned by an administrator.",
                colors.HexColor("#FFFFFF"),
                colors.HexColor("#D8CBE6"),
            ),
            Spacer(1, 8 * mm),
            p("Keep your ticket number", "card_title"),
            p("Every request receives a unique CSIS ticket number. Use it when discussing the issue, checking its history, or contacting support.", "cover_subtitle"),
            PageBreak(),
        ]
    )

    story.extend(section_title("1. Reporter quick start", "Use the reporter portal to submit faults and follow every update through resolution."))
    story.extend(
        [
            step(1, "Sign in or register", "Use a valid @mynwu.ac.za address. New passwords must be at least 12 characters and include uppercase, lowercase, and a number."),
            step(2, "Submit a ticket", "Choose the issue category and urgency, identify the building, room, station, or asset, and describe what happened and what you already tried."),
            step(3, "Track progress", "Open My tickets to view status, assigned technician, recorded work, escalation details, sub-issues, and the complete activity history."),
            step(4, "Reply to support", "Use the public conversation thread when a technician asks for information. Reporter messages are visible to the support team."),
            step(5, "Review the outcome", "Resolved tickets display the technician's resolution summary and remain available as historical records."),
            Spacer(1, 3 * mm),
            callout(
                "Safety first",
                "Select Physical Hazard for smoke, burning smells, exposed wiring, overheating equipment, or electrical danger. The portal sets the priority to Critical. Keep people away and follow campus emergency or facilities procedures where necessary.",
                RED_LIGHT,
                RED,
            ),
            Spacer(1, 3 * mm),
            p("Ticket workflow", "h2"),
            workflow_table(),
            Spacer(1, 3 * mm),
            p("Writing a useful fault report", "h2"),
            bullet("State what you expected, what happened, when it started, and who else is affected."),
            bullet("Include the exact laboratory, office, workstation, or asset ID."),
            bullet("Record any restart, cable, network, or sign-in checks already attempted."),
            PageBreak(),
        ]
    )

    story.extend(section_title("2. Technician workflow", "The technician workspace combines the priority queue, job cards, timers, conversations, escalation, and service calendar."))
    story.extend(
        [
            step(1, "Review the priority queue", "Search by ticket, requester, or category and filter by priority. Critical and high-priority requests appear ahead of lower-priority work."),
            step(2, "Claim the ticket", "Claim an unassigned request before starting work. The assignment and status change are recorded in the audit history."),
            step(3, "Start the timer", "Start work when investigation begins and stop it when pausing or finishing. Only one live timer is allowed per technician and per ticket."),
            step(4, "Keep the record current", "Update the lifecycle status, add public progress messages, and use Internal only for technical notes that reporters must not see."),
            step(5, "Resolve or escalate", "Resolution requires a meaningful summary. If the issue exceeds local CSIS capability, record the Central IT escalation reason and external reference."),
            Spacer(1, 4 * mm),
            p("Technician job cards", "h2"),
            bullet("Create a job card linked to a primary ticket and optional related tickets."),
            bullet("Assign a technician, schedule the work, set a target, and record the location or station."),
            bullet("Use checklist items and internal work notes to document execution."),
            bullet("Start, pause, resume, and complete the card while preserving time entries and activity history."),
            Spacer(1, 4 * mm),
            p("Walk-in and verbal faults", "h2"),
            p("Use Add ticket in the technician queue. Search for the existing reporter, then capture the same category, urgency, location, station, title, and description required for web submissions."),
            Spacer(1, 4 * mm),
            callout(
                "Public or internal?",
                "Use public comments for information the requester needs. Use internal notes for diagnostics, credentials-free technical observations, handover notes, and administrative coordination.",
                AMBER_LIGHT,
                AMBER,
            ),
            PageBreak(),
        ]
    )

    story.extend(section_title("3. Administrator guide", "Administrators oversee operations, users, reporting, scheduling, and the permanent application audit trail."))
    story.extend(
        [
            p("Operational overview and reports", "h2"),
            bullet("Select a reporting period or custom date range."),
            bullet("Review active, created, resolved, escalated, critical, unassigned, and overdue totals."),
            bullet("Compare category volume, status distribution, backlog age, service targets, and ticket flow."),
            bullet("Review technician workload, handled tickets, walk-ins, recorded time, and average resolution."),
            bullet("Download summary, ticket, and technician reports for the selected period."),
            p("Users and access", "h2"),
            bullet("Create reporter, technician, and administrator accounts using valid @mynwu.ac.za email addresses."),
            bullet("Change roles, activate or deactivate accounts, and reset temporary passwords."),
            bullet("System administrators can grant the System Administrator role and export an operational backup."),
            p("Calendar and audit", "h2"),
            bullet("Schedule SLA targets, site visits, maintenance, and follow-ups for staff."),
            bullet("Link calendar events to active tickets where appropriate."),
            bullet("Use the audit trail to review the actor, timestamp, ticket, action, and recorded change."),
            Spacer(1, 6 * mm),
            callout(
                "Data protection",
                "Do not place passwords, one-time codes, personal financial information, or unnecessary sensitive data in tickets, comments, or internal notes.",
                BLUE_LIGHT,
                PURPLE,
            ),
            Spacer(1, 8 * mm),
        ]
    )

    story.extend(section_title("4. Frequently asked questions"))
    story.extend(
        [
            faq_block("Who can create a reporter account?", "Students and staff with a valid @mynwu.ac.za email address can register on the login page. Technician and administrator access must be provisioned by an administrator."),
            faq_block("Why can I not see an internal note?", "Internal notes are intentionally restricted to technicians and administrators. Reporters only see public comments and appropriate workflow history."),
            faq_block("Why can I not resolve a ticket?", "Only the assigned technician or an administrator may manage the workflow. A resolution summary is required, active timers are stopped automatically, and all child issues must be resolved first."),
            faq_block("What should be escalated to Central IT?", "Escalate issues that require central identity, network, infrastructure, or access privileges beyond the CSIS support team's authority. Record the reason and external service-desk reference."),
            faq_block("What happens when email delivery is unavailable?", "The application retains notification events in its outbox. The ticket and its full history remain available in the portal even if SMTP delivery is delayed."),
            faq_block("Where can I find older tickets?", "Reporters use My tickets. Administrators use Tickets for the operational register and Reports for date-based historical analysis and exports."),
            Spacer(1, 6 * mm),
            callout(
                "Need help?",
                "Sign in and add a public comment to the relevant ticket. Include the CSIS ticket number whenever contacting the support team through another approved channel.",
                GREEN_LIGHT,
                GREEN,
            ),
        ]
    )
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=22 * mm,
        leftMargin=22 * mm,
        topMargin=23 * mm,
        bottomMargin=22 * mm,
        title="CSIS IT Support User Guide",
        author="CSIS IT Support",
        subject="Onboarding guide for the CSIS Ticket and Log System",
    )
    doc.build(build_story(), onFirstPage=first_page, onLaterPages=later_page)
    print(OUTPUT)


if __name__ == "__main__":
    main()
