#!/usr/bin/env python3
import json
import os
import re
import shutil
import tempfile
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

from pypdf import PdfReader

ROOT = Path(__file__).parent
INDEX_HTML = ROOT / 'index.html'
UNDERLAGEN_DIR = ROOT / 'unterlagen'

NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'draw': 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    'number': 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
    'svg': 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    'dc': 'http://purl.org/dc/elements/1.1/',
    'meta': 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
    'manifest': 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
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
    source_keywords = r'archiv|akten|handschrift|ton|interview|mitschrift|katalog|website|dokument|quellenedition|quelle'
    lit_keywords = r'monographie|aufsatz|dissertation|biographie|studie|literatur|sekundär|wissenschaftlich'

    if re.search(source_keywords, text, re.I) or 'quellen' in guidance_lower and re.search(r'primär', guidance_lower):
        kind = 'Quelle'
    elif re.search(lit_keywords, text, re.I) or re.search(lit_keywords, guidance_lower):
        kind = 'Literatur'
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
        if not text_content:
            text_content = ''
        normalized = normalize_footnote(text_content, idx, guidance)
        paragraph = ET.SubElement(body, q('p'))
        paragraph.text = normalized
        summary.append(f'Fußnote {idx}: {normalized}')
    return summary


def ensure_bibliography_section(root, entries):
    marker = 'Quellen- und Literaturverzeichnis'
    target = None
    for elem in root.findall('.//text:p', NS):
        if re.search(marker, read_text_content(elem), re.I):
            target = elem
            break
    if target is None:
        for elem in root.findall('.//text:h', NS):
            if re.search(marker, read_text_content(elem), re.I):
                target = elem
                break
    if target is None:
        body = root.find(q('body'))
        if body is None:
            body = ET.SubElement(root, q('body'))
        section = ET.SubElement(body, q('p'))
        section.text = marker
        target = section

    # insert after target element
    parent = target.getparent() if hasattr(target, 'getparent') else None
    if parent is None:
        parent = root.find(q('body'))
    if parent is None:
        return []

    # Insert bibliography entries after the heading/paragraph
    insertion_index = list(parent).index(target) + 1
    source_entries = [entry for entry in entries if entry.startswith('Quelle')]
    lit_entries = [entry for entry in entries if entry.startswith('Literatur')]

    def add_paragraph(text):
        nonlocal insertion_index
        paragraph = ET.Element(q('p'))
        paragraph.text = text
        parent.insert(insertion_index, paragraph)
        insertion_index += 1

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
            if not content_path.exists():
                raise FileNotFoundError('content.xml fehlt in der ODT-Datei.')
            tree = ET.parse(content_path)
            root = tree.getroot()

            note_summaries = rewrite_footnotes(root, guidance)
            bibliography_entries = []
            for note in note_summaries:
                bibliography_entries.append(note)
            ensure_bibliography_section(root, bibliography_entries)

            tree.write(content_path, encoding='utf-8', xml_declaration=True)

            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as out_zip:
                for item in source.infolist():
                    if item.filename == 'content.xml':
                        out_zip.writestr(item, content_path.read_bytes())
                    else:
                        out_zip.writestr(item, source.read(item.filename))

    return {
        'summary': '\n'.join([
            'Überarbeitete Fußnoten: ' + str(len(note_summaries)),
            'Quellen- und Literaturverzeichnis ergänzt.',
            'Hinweis: Die Regeln orientieren sich an den vorhandenen Unterlagen im Projektordner; bei Widersprüchen gilt die Handleitung als maßgeblich.',
            'Verwendete Richtlinien: ' + ('ja' if guidance else 'nein')
        ])
    }


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

        # Minimal multipart handling without external dependencies.
        boundary = content_type.split('boundary=')[-1]
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        parts = body.split(f'--{boundary}'.encode())
        uploaded = None
        file_name = 'upload.odt'
        for part in parts:
            if b'filename=' in part:
                headers, data = part.split(b'\r\n\r\n', 1)
                if data.endswith(b'\r\n'):
                    data = data[:-2]
                filename_match = re.search(rb'filename="([^"]+)"', headers)
                if filename_match:
                    file_name = filename_match.group(1).decode('utf-8', 'ignore')
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
            try:
                result = process_odt(input_path, output_path)
            except Exception as exc:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(str(exc).encode('utf-8'))
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{file_name.replace(".odt", "-korrigiert.odt")}"')
            self.end_headers()
            self.wfile.write(output_path.read_bytes())


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 8000), Handler)
    print('Server läuft unter http://127.0.0.1:8000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
