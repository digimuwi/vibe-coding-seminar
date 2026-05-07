import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import type { BeatChord } from '../types/music';

type InMessage =
  | { type: 'render'; xml: string; chords: BeatChord[] };

type OutMessage =
  | { type: 'ready' }
  | { type: 'result'; svgPages: string[]; pageCount: number }
  | { type: 'error'; message: string };

const RENDER_OPTIONS = {
  scale: 45,
  adjustPageWidth: 1,
  adjustPageHeight: 0,
  pageHeight: 2970,
  pageWidth: 2100,
  footer: 'none',
  header: 'none',
  spacingSystem: 3,
};

let toolkit: VerovioToolkit | null = null;
let pendingMsg: { xml: string; chords: BeatChord[] } | null = null;

async function init() {
  const VerovioModule = await createVerovioModule();
  toolkit = new VerovioToolkit(VerovioModule);
  (self as unknown as Worker).postMessage({ type: 'ready' } satisfies OutMessage);

  if (pendingMsg !== null) {
    renderXml(pendingMsg.xml, pendingMsg.chords);
    pendingMsg = null;
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Inject <harm> elements into a MEI string without DOMParser / XMLSerializer
 * (neither is available inside a Vite Web Worker).
 *
 * Strategy:
 *  - Extract the time-signature beat unit from the first <meterSig> so we can
 *    convert our 0-indexed quarter-note beat positions to MEI's 1-indexed
 *    @tstamp values (which use the beat-type denominator as their unit).
 *  - Count <staffDef> elements to identify the bottom staff; harm elements are
 *    placed below it so they appear under the grand staff.
 *  - Splice a <harm> string before each </measure> closing tag.  The element
 *    carries an explicit xmlns so Verovio recognises it as a MEI element even
 *    when the injection is done as a raw string.
 */
function injectHarmLabels(meiString: string, chords: BeatChord[]): string {
  // Beat unit: denominator of the time signature (4 = quarter, 8 = eighth, …)
  const beatUnitMatch = meiString.match(/\bmeterSig\b[^>]+\bunit="(\d+)"/);
  const beatUnit = parseInt(beatUnitMatch?.[1] ?? '4', 10) || 4;
  // beatPosition is 0-indexed quarter notes; MEI @tstamp is 1-indexed beat-unit ticks
  const toTstamp = (beat: number) => (beat * (beatUnit / 4) + 1).toFixed(4);

  // Number of staves (place harm below the last / bottom staff)
  const staffDefCount = (meiString.match(/<staffDef\b/g) ?? []).length;
  const harmStaff = staffDefCount > 0 ? String(staffDefCount) : '1';

  // Group labeled chords by measure index
  const byMeasure = new Map<number, Array<{ tstamp: string; label: string }>>();
  for (const chord of chords) {
    const label = chord.romanNumeral ?? chord.chordName;
    if (!label) continue;
    if (!byMeasure.has(chord.measureIndex))
      byMeasure.set(chord.measureIndex, []);
    byMeasure.get(chord.measureIndex)!.push({
      tstamp: toTstamp(chord.beatPosition),
      label,
    });
  }

  if (byMeasure.size === 0) return meiString;

  // Replace each </measure> with injected harm elements + </measure>
  let mi = 0;
  return meiString.replace(/<\/measure>/g, () => {
    const entries = byMeasure.get(mi++) ?? [];
    const harmStr = entries
      .map(
        ({ tstamp, label }) =>
          `<harm xmlns="http://www.music-encoding.org/ns/mei" tstamp="${tstamp}" place="below" staff="${harmStaff}">${escapeXml(label)}</harm>`,
      )
      .join('');
    return `${harmStr}</measure>`;
  });
}

function renderXml(xml: string, chords: BeatChord[]) {
  if (!toolkit) return;
  try {
    toolkit.setOptions(RENDER_OPTIONS);
    const loaded = toolkit.loadData(xml);
    if (!loaded) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        message: 'Verovio failed to load the score. The file may not be valid MusicXML.',
      } satisfies OutMessage);
      return;
    }

    // Get the MEI, inject harm labels, then re-render so Verovio positions them.
    // noLayout:1 strips pre-computed positions so Verovio re-lays out with the
    // new harm elements rather than trying to fit them into an existing layout.
    const mei = toolkit.getMEI({ noLayout: 1 });
    const modifiedMei = injectHarmLabels(mei, chords);

    toolkit.setOptions(RENDER_OPTIONS);
    const loaded2 = toolkit.loadData(modifiedMei);
    if (!loaded2) {
      // Harm injection failed – fall back to plain rendering without labels
      toolkit.setOptions(RENDER_OPTIONS);
      toolkit.loadData(xml);
    }

    const pageCount = toolkit.getPageCount();
    const svgPages: string[] = [];
    for (let p = 1; p <= pageCount; p++) {
      svgPages.push(toolkit.renderToSVG(p, false));
    }

    (self as unknown as Worker).postMessage({
      type: 'result',
      svgPages,
      pageCount,
    } satisfies OutMessage);
  } catch (e) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    } satisfies OutMessage);
  }
}

(self as unknown as Worker).onmessage = (event: MessageEvent<InMessage>) => {
  if (event.data.type === 'render') {
    if (!toolkit) {
      pendingMsg = { xml: event.data.xml, chords: event.data.chords };
    } else {
      renderXml(event.data.xml, event.data.chords);
    }
  }
};

init();
