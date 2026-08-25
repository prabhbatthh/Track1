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
    "missing-function-docstring (C0116) — PEP8 / convention checker",
    "too-many-arguments (R0913) — design checker",
    "broad-exception-caught (W0718) — exception checker",
    "no-member (E1101) — error checker",
]

findings = [
    {
        "category": "Style (PEP8 / Convention)",
        "code": "C0116",
        "location": "main.py:53",
        "message": "Missing function or method docstring",
        "code_snippet": (
            "@asynccontextmanager\n"
            "async def lifespan(app: FastAPI) -> AsyncIterator[None]:\n"
            "    settings = get_settings()\n"
            "    reminder_task: asyncio.Task | None = None"
        ),
        "output": "src\\app\\main.py:53:0: C0116: Missing function or method "
                  "docstring (missing-function-docstring)",
    },
    {
        "category": "Design (Refactor)",
        "code": "R0913",
        "location": "db/pagination.py:9",
        "message": "Too many arguments (6/5)",
        "code_snippet": (
            "async def paginate[T](\n"
            "    model: _PaginatableModel[T],\n"
            "    *,\n"
            "    where: dict,\n"
            "    order: dict,\n"
            "    skip: int,\n"
            "    take: int,\n"
            "    ..."
        ),
        "output": "src\\app\\db\\pagination.py:9:0: R0913: Too many arguments "
                  "(6/5) (too-many-arguments)",
    },
    {
        "category": "Exceptions (Warning)",
        "code": "W0718",
        "location": "modules/chat/orchestrator.py:197",
        "message": "Catching too general exception 'Exception'",
        "code_snippet": (
            "except Exception as exc:  # noqa: BLE001\n"
            "    return ChatResponse(reply=f\"Something went wrong: {exc}\", "
            "source=\"error\")"
        ),
        "output": "src\\app\\modules\\chat\\orchestrator.py:197:11: W0718: "
                  "Catching too general exception Exception "
                  "(broad-exception-caught)",
    },
    {
        "category": "Other (Error)",
        "code": "E1101",
        "location": "modules/payments/service.py:37",
        "message": "Instance of 'Client' has no 'order' member",
        "code_snippet": (
            "order = client.order.create(\n"
            "    {\n"
            "        \"amount\": amount * 100,\n"
            "        \"currency\": \"INR\",\n"
            "        ...\n"
            "    }\n"
            ")"
        ),
        "output": "src\\app\\modules\\payments\\service.py:37:12: E1101: "
                  "Instance of 'Client' has no 'order' member (no-member)",
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
    "pylint_report.pdf",
    pagesize=A4,
    topMargin=1.5 * cm,
    bottomMargin=1.5 * cm,
    leftMargin=1.5 * cm,
    rightMargin=1.5 * cm,
)

# Summary table
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

table = Table(table_data, colWidths=[4.2 * cm, 2 * cm, 5 * cm, 7 * cm])
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
