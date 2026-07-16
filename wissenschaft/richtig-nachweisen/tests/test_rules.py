from pathlib import Path

from server import load_guidance


def test_load_guidance_reads_pdf_files():
    project_dir = Path(__file__).resolve().parents[1]
    guidance = load_guidance(project_dir)
    text = guidance.lower()
    assert len(guidance) > 0
    assert 'handleitung' in text or 'quellen' in text or 'literatur' in text
