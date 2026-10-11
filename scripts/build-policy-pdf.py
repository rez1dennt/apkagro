"""Create the downloadable policy from the published legal-page text."""
import os
import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate


class PolicyBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tag = None
        self.markup = []
        self.plain = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        if tag in ("h2", "p", "li") and self.tag is None:
            self.tag, self.markup, self.plain = tag, [], []
        elif self.tag:
            if tag in ("strong", "b"):
                self.markup.append("<b>")
            elif tag == "a":
                href = dict(attrs).get("href", "")
                if not href.startswith(("https://", "mailto:", "tel:")):
                    raise ValueError("Unexpected link in policy text")
                self.markup.append('<link href="' + escape(href, {'"': '&quot;'}) + '">')
            elif tag == "br":
                self.markup.append("<br/>")
                self.plain.append(" ")

    def handle_endtag(self, tag):
        if tag == self.tag:
            self.blocks.append((tag, "".join(self.markup).strip(), "".join(self.plain).strip()))
            self.tag = None
        elif self.tag:
            if tag in ("strong", "b"):
                self.markup.append("</b>")
            elif tag == "a":
                self.markup.append("</link>")

    def handle_data(self, data):
        if self.tag:
            self.markup.append(escape(data))
            self.plain.append(data)


root = Path(__file__).resolve().parent.parent
html = (root / "public" / "privacy" / "index.html").read_text(encoding="utf-8")
title = unescape(re.search(r"<h1>(.*?)</h1>", html).group(1))
body = re.search(r'<div class="legal-body">([\s\S]*)</div></div></main>', html).group(1)
body = re.sub(r'<div class="document-downloads">.*?</div>', "", body, flags=re.S)
parser = PolicyBlocks()
parser.feed(body)
if len([block for block in parser.blocks if block[0] == "h2"]) != 9:
    raise RuntimeError("Policy must contain all nine published sections")

regular_fonts = [Path(os.environ.get("PDF_FONT_REGULAR", "C:/Windows/Fonts/arial.ttf")), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
bold_fonts = [Path(os.environ.get("PDF_FONT_BOLD", "C:/Windows/Fonts/arialbd.ttf")), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]
regular = next((font for font in regular_fonts if font.is_file()), None)
if regular is None:
    raise RuntimeError("Set PDF_FONT_REGULAR to a Cyrillic-capable TrueType font")
bold = next((font for font in bold_fonts if font.is_file()), regular)
pdfmetrics.registerFont(TTFont("PolicyText", str(regular)))
pdfmetrics.registerFont(TTFont("PolicyBold", str(bold)))
pdfmetrics.registerFontFamily("PolicyText", normal="PolicyText", bold="PolicyBold", italic="PolicyText", boldItalic="PolicyBold")

output = root / "public" / "documents" / "privacy-policy.pdf"
output.parent.mkdir(parents=True, exist_ok=True)
document = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=52, rightMargin=52, topMargin=48, bottomMargin=48,
    title=title, author="АНО «Возрождение»")
title_style = ParagraphStyle("PolicyTitle", fontName="PolicyBold", fontSize=17, leading=23, alignment=TA_CENTER, spaceAfter=18)
heading_style = ParagraphStyle("PolicyHeading", fontName="PolicyBold", fontSize=11.5, leading=16, spaceBefore=12, spaceAfter=7, keepWithNext=True)
body_style = ParagraphStyle("PolicyBody", fontName="PolicyText", fontSize=10.5, leading=14.5, spaceAfter=8)
bullet_style = ParagraphStyle("PolicyBullet", parent=body_style, leftIndent=12, bulletIndent=0, bulletFontName="PolicyText", spaceAfter=5)
story = [Paragraph(escape(title), title_style)]
for tag, markup, plain in parser.blocks:
    style = heading_style if tag == "h2" else bullet_style if tag == "li" else body_style
    story.append(Paragraph(markup, style, bulletText="•" if tag == "li" else None))


def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("PolicyText", 9)
    canvas.drawRightString(A4[0] - 52, 24, f"Страница {doc.page}")
    canvas.restoreState()


document.build(story, onFirstPage=page_number, onLaterPages=page_number)
reader = PdfReader(output)
normalize = lambda text: "".join(text.split())
rendered_text = normalize(" ".join(page.extract_text() for page in reader.pages))
for text in [title] + [block[2] for block in parser.blocks]:
    if normalize(text) not in rendered_text:
        raise RuntimeError("Generated PDF text differs from the published policy")
print(f"Built public policy PDF: {len(reader.pages)} pages; all {len(parser.blocks)} text blocks match the website.")
