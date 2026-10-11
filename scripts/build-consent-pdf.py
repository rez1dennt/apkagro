"""Render the supplied consent text as a public, printable PDF."""
import json
import os
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'content' / 'consent.json').read_text(encoding='utf-8'))
fonts = [Path(os.environ.get('PDF_FONT_REGULAR', 'C:/Windows/Fonts/arial.ttf')), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
font = next((item for item in fonts if item.is_file()), None)
if font is None:
    raise RuntimeError('Set PDF_FONT_REGULAR to a Cyrillic-capable TrueType font.')
pdfmetrics.registerFont(TTFont('ConsentText', str(font)))
output = root / 'public' / 'documents' / 'consent.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
document = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=52, rightMargin=52, topMargin=52, bottomMargin=52,
    title=source['title'], author='АНО «Возрождение»')
heading = ParagraphStyle('ConsentTitle', fontName='ConsentText', fontSize=15, leading=20, alignment=TA_CENTER, spaceAfter=22)
body = ParagraphStyle('ConsentBody', fontName='ConsentText', fontSize=11, leading=17, spaceAfter=13)
story = [Paragraph(escape(source['title']), heading)]
for text in source['paragraphs']:
    story.append(Paragraph(escape(text), body))
document.build(story)
print('Built public consent PDF from supplied text.')
