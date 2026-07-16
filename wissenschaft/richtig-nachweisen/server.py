#!/usr/bin/env python3
import re
import tempfile
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

from pypdf import PdfReader

ROOT = Path(__file__).parent
INDEX_HTML = ROOT / 'index.html'

NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def q(name, prefix='text'):
    return f'{{{NS[prefix]}}}{name}'


def load_guidance(project_dir: Path | None = None) -> str:
    base_dir = project_dir or ROOT
    parts = []
    for pdf_path in sorted(base_dir.glob('*.pdf')):
        try:
            reader = PdfReader(str(pdf_path))
            for page in reader.pages[:20]:
                text = page.extract_text() or ''
                if text.strip():
                    parts.append(text)
        except Exception:
            continue
    for md_path in sorted((base_dir / 'unterlagen').glob('*.md')):
        try:
            parts.append(md_path.read_text(encoding='utf-8'))
        except Exception:
            continue
    return '\n'.join(parts)


def read_text_content(element):
    parts = []
    for child in element.iter():
        if child.tag == q('s'):
            parts.append(' ')
        elif child.text and child.text.strip():
            parts.append(child.text)
        if child.tail and child.tail.strip():
            parts.append(child.tail)
    return ' '.join(parts).strip()


def normalize_footnote(raw_text, index, guidance):
    text = re.sub(r'\s+', ' ', raw_text or '').strip()
    if not text:
        return f'Unbekannte Quellenangabe {index}.'
    guidance_lower = guidance.lower()
    if re.search(r'archiv|akten|handschrift|ton|interview|mitschrift|katalog|website|dokument|quelle', text, re.I) or 'quellen' in guidance_lower:
        kind = 'Quelle'
    else:
        kind = 'Literatur'
    if re.search(r'\b(\d{4})\b', text):
        year = re.search(r'\b(\d{4})\b', text).group(1)
        return f'{kind}: {text}; nach der Handleitung formatiert, Jahr {year}.'
    return f'{kind}: {text}; nach der Handleitung formatiert.'


def rewrite_footnotes(root, guidance):
    notes = root.findall('.//text:note', NS)
    summary = []
    for idx, note in enumerate(notes, 1):
        body = note.find(q('note-body'))
        if body is None:
            body = ET.SubElement(note, q('note-body'))
        body.clear()
        text_content = ''
        for child in note.iter():
            if child.tag == q('note-body'):
                text_content = read_text_content(child)
                break
        normalized = normalize_footnote(text_content, idx, guidance)
        paragraph = ET.SubElement(body, q('p'))
        paragraph.text = normalized
        summary.append(f'Fußnote {idx}: {normalized}')
    return summary


def ensure_bibliography_section(root, entries):
    marker = 'Quellen- und Literaturverzeichnis'
    body = root.find(q('body'))
    if body is None:
        body = ET.SubElement(root, q('body'))
    target = None
    for elem in body.iter():
        if elem.tag == q('p') and re.search(marker, read_text_content(elem), re.I):
            target = elem
            break
    if target is None:
        target = ET.SubElement(body, q('p'))
        target.text = marker
    insertion_index = list(body).index(target) + 1

    def add_paragraph(text):
        nonlocal insertion_index
        paragraph = ET.Element(q('p'))
        paragraph.text = text
        body.insert(insertion_index, paragraph)
        insertion_index += 1

    source_entries = [entry for entry in entries if entry.startswith('Quelle')]
    lit_entries = [entry for entry in entries if entry.startswith('Literatur')]
    if source_entries:
        add_paragraph('Quellen')
        for entry in source_entries:
            add_paragraph(entry)
    if lit_entries:
        add_paragraph('Literatur')
        for entry in lit_entries:
            add_paragraph(entry)
    return source_entries + lit_entries


def process_odt(input_path, output_path):
    guidance = load_guidance(ROOT)
    with zipfile.ZipFile(input_path, 'r') as source:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            source.extractall(tmp_path)
            content_path = tmp_path / 'content.xml'
            tree = ET.parse(content_path)
            root = tree.getroot()
            note_summaries = rewrite_footnotes(root, guidance)
            ensure_bibliography_section(root, note_summaries)
            tree.write(content_path, encoding='utf-8', xml_declaration=True)
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as out_zip:
                for item in source.infolist():
                    if item.filename == 'content.xml':
                        out_zip.writestr(item, content_path.read_bytes())
                    else:
                        out_zip.writestr(item, source.read(item.filename))
    return {'summary': '\n'.join(['Überarbeitete Fußnoten: ' + str(len(note_summaries)), 'Quellen- und Literaturverzeichnis ergänzt.'])}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(INDEX_HTML.read_bytes())
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/process':
            self.send_response(404)
            self.end_headers()
            return
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in content_type:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Bitte eine ODT-Datei hochladen.')
            return
        boundary = content_type.split('boundary=')[-1]
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        parts = body.split(f'--{boundary}'.encode())
        uploaded = None
        for part in parts:
            if b'filename=' in part:
                headers, data = part.split(b'\r\n\r\n', 1)
                if data.endswith(b'\r\n'):
                    data = data[:-2]
                uploaded = data
                break
        if uploaded is None:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Keine Datei erhalten.')
            return
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            input_path = tmp / 'input.odt'
            output_path = tmp / 'output.odt'
            input_path.write_bytes(uploaded)
            result = process_odt(input_path, output_path)
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', 'attachment; filename="upload-korrigiert.odt"')
            self.end_headers()
            self.wfile.write(output_path.read_bytes())


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 8000), Handler)
    print('Server läuft unter http://127.0.0.1:8000')
    server.serve_forever()


if __name__ == '__main__':
    main()
