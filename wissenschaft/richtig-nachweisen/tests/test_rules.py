from pathlib import Path

from server import load_guidance


def test_load_guidance_reads_rule_files():
    guidance = load_guidance(Path(__file__).resolve().parents[1])
    assert len(guidance) > 0
    assert 'handleitung' in guidance.lower() or 'quellen' in guidance.lower() or 'literatur' in guidance.lower()
