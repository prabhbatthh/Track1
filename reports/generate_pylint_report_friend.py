from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Preformatted,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from xml.sax.saxutils import escape

SCORE = "7.92/10"
COMMAND = "uv run --with pylint pylint src/app --output-format=text"

# Checkers actually run and observed in this report (not a generic description).
FEATURES_USED = [
    "invalid-name (C0103) — PEP8 / naming convention checker",
    "duplicate-code (R0801) — design / similarity checker",
]

findings = [
    {
        "category": "Convention (Naming)",
        "code": "C0103",
        "location": "api/deps.py:14",
        "message": "Constant name 'CredentialsError' doesn't conform to "
                   "UPPER_CASE naming style",
        "code_snippet": (
            "CredentialsError = HTTPException(\n"
            "    status_code=status.HTTP_401_UNAUTHORIZED,\n"
            "    detail=\"Could not validate credentials\",\n"
            "    headers={\"WWW-Authenticate\": \"Bearer\"},\n"
            ")"
        ),
        "output": "src\\app\\api\\deps.py:14:0: C0103: Constant name "
                  "\"CredentialsError\" doesn't conform to UPPER_CASE naming "
                  "style (invalid-name)",
    },
    {
        "category": "Refactor (Duplicate Code)",
        "code": "R0801",
        "location": "modules/translate/__init__.py:1",
        "message": "Similar lines in 2 files (admin/repository.py & "
                   "members/repository.py)",
        "code_snippet": (
            "# modules/admin/repository.py [92:101]\n"
            "if search:\n"
            "    where[\"OR\"] = [\n"
            "        {\"fullName\": {\"contains\": search, \"mode\": "
            "\"insensitive\"}},\n"
            "        {\"email\": {\"contains\": search, \"mode\": "
            "\"insensitive\"}},\n"
            "    ]\n\n"
            "# modules/members/repository.py [53:62]  (same block repeated)\n"
            "if search:\n"
            "    where[\"OR\"] = [\n"
            "        {\"fullName\": {\"contains\": search, \"mode\": "
            "\"insensitive\"}},\n"
            "        {\"email\": {\"contains\": search, \"mode\": "
            "\"insensitive\"}},\n"
            "    ]"
        ),
        "output": "src\\app\\modules\\translate\\__init__.py:1:0: R0801: "
                  "Similar lines in 2 files\n"
                  "==app.modules.admin.repository:[92:101]\n"
                  "==app.modules.members.repository:[53:62]",
    },
]

styles = getSampleStyleSheet()
title_style = ParagraphStyle("TitleStyle", parent=styles["Title"], fontSize=18)
heading_style = styles["Heading3"]
normal = styles["BodyText"]
normal.fontSize = 9
normal.leading = 11

code_style = ParagraphStyle(
    "Code",
    fontName="Courier",
    fontSize=8,
    leading=10,
    backColor=colors.HexColor("#f4f4f4"),
    borderPadding=6,
)

doc = SimpleDocTemplate(
    "pylint_report_friend.pdf",
    pagesize=A4,
    topMargin=1.5 * cm,
    bottomMargin=1.5 * cm,
    leftMargin=1.5 * cm,
    rightMargin=1.5 * cm,
)

table_header = ["Category", "Code", "Location", "Message"]
table_data = [table_header] + [
    [
        Paragraph(f["category"], normal),
        Paragraph(f["code"], normal),
        Paragraph(f["location"], normal),
        Paragraph(f["message"], normal),
    ]
    for f in findings
]

table = Table(table_data, colWidths=[4.5 * cm, 2 * cm, 5 * cm, 6.7 * cm])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, 0), 10),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))

features_html = "<br/>".join(f"&bull; {escape(f)}" for f in FEATURES_USED)

elements = [
    Paragraph("Pylint Code Quality Report", title_style),
    Spacer(1, 0.3 * cm),
    Paragraph("Target: backend/src/app", normal),
    Spacer(1, 0.5 * cm),
    table,
    Spacer(1, 0.6 * cm),
    Paragraph(f"<b>Overall Code Score:</b> {SCORE}", heading_style),
    Spacer(1, 0.3 * cm),
    Paragraph("<b>Command Used:</b>", heading_style),
    Paragraph(f"<font face='Courier'>{escape(COMMAND)}</font>", normal),
    Spacer(1, 0.3 * cm),
    Paragraph("<b>Pylint Features Used:</b>", heading_style),
    Paragraph(features_html, normal),
    Spacer(1, 0.6 * cm),
    Paragraph("<b>Code &amp; Output Detail</b>", heading_style),
    Spacer(1, 0.2 * cm),
]

for f in findings:
    elements.append(
        Paragraph(f"<b>{f['category']} — {f['code']}</b> ({f['location']})", normal)
    )
    elements.append(Spacer(1, 0.1 * cm))
    elements.append(Paragraph("<i>Code:</i>", normal))
    elements.append(Preformatted(f["code_snippet"], code_style))
    elements.append(Spacer(1, 0.1 * cm))
    elements.append(Paragraph("<i>Pylint Output:</i>", normal))
    elements.append(Preformatted(f["output"], code_style))
    elements.append(Spacer(1, 0.4 * cm))

doc.build(elements)
print("PDF written")
