import { useRef, useState, useEffect, useCallback } from 'react';
import type { HarmonyAnalysis } from '../types/music';
import styles from './ScoreViewer.module.css';

interface Overlay {
  x: number;
  y: number;
  label: string;
  secondary: string;
}

interface Props {
  svgPages: string[];
  analysis: HarmonyAnalysis;
}

/** Walk up the DOM to find the nearest ancestor <svg> element. */
function containingSvg(el: Element): SVGSVGElement | null {
  let cur: Element | null = el;
  while (cur) {
    if (cur.tagName.toLowerCase() === 'svg') return cur as SVGSVGElement;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Convert a harm element's CTM (SVG user-unit transform) to a CSS-pixel
 * position relative to the scroll container.  Works even when the element has
 * no visible content (e.g. font-size="0px").
 */
function harmPosition(
  el: Element,
  containerRect: DOMRect,
): { x: number; y: number } | null {
  const svgEl = containingSvg(el);
  if (!svgEl) return null;
  const svgRect = svgEl.getBoundingClientRect();
  const vb = svgEl.viewBox?.baseVal;
  if (!vb || vb.width === 0 || vb.height === 0) return null;

  const ctm = (el as SVGGraphicsElement).getCTM?.();
  if (!ctm) return null;

  const scaleX = svgRect.width / vb.width;
  const scaleY = svgRect.height / vb.height;
  return {
    x: svgRect.left - containerRect.left + ctm.e * scaleX,
    y: svgRect.top - containerRect.top + ctm.f * scaleY,
  };
}

export default function ScoreViewer({ svgPages, analysis }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);

  const computeOverlays = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    // Chords that actually have a label (in render order)
    const labeledChords = analysis.chords.filter(
      c => c.romanNumeral || c.chordName,
    );

    // --- Primary path: use <harm> elements that Verovio placed in the SVG ---
    const harmEls = Array.from(
      container.querySelectorAll<SVGGElement>('g.harm'),
    );

    if (harmEls.length > 0 && harmEls.length === labeledChords.length) {
      // Check whether Verovio rendered the harm text with a visible font-size
      const firstText = harmEls[0].querySelector('text');
      const renderedFontSize = parseFloat(
        firstText?.getAttribute('font-size') ?? '0',
      );

      if (renderedFontSize > 0) {
        // Verovio rendered the labels natively – no React overlay needed
        setOverlays([]);
        return;
      }

      // Font-size is 0 (common Verovio quirk): use the harm element's SVG
      // transform to derive the correct x position, then show our own overlay.
      {
        const next: Overlay[] = [];
        labeledChords.forEach((chord, i) => {
          const el = harmEls[i];
          const pos = harmPosition(el, containerRect);
          if (!pos) return;
          const label = chord.romanNumeral ?? chord.chordName ?? '';
          next.push({
            x: pos.x,
            y: pos.y,
            label,
            secondary: chord.romanNumeral && chord.chordName ? chord.chordName : '',
          });
        });
        setOverlays(next);
        return;
      }
    }

    // --- Fallback: linear interpolation within each measure ---
    const measureEls = Array.from(
      container.querySelectorAll<SVGGElement>('g.measure'),
    );
    const byMeasure = new Map<number, typeof analysis.chords>();
    for (const chord of analysis.chords) {
      if (!byMeasure.has(chord.measureIndex))
        byMeasure.set(chord.measureIndex, []);
      byMeasure.get(chord.measureIndex)!.push(chord);
    }

    const next: Overlay[] = [];
    const bpm = analysis.beatsPerMeasure;

    measureEls.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const measureLeft = rect.left - containerRect.left;
      const measureBottom = rect.bottom - containerRect.top + 2;

      for (const chord of byMeasure.get(i) ?? []) {
        const label = chord.romanNumeral ?? chord.chordName ?? '';
        if (!label) continue;
        const x = measureLeft + (chord.beatPosition / bpm) * rect.width;
        next.push({
          x,
          y: measureBottom,
          label,
          secondary:
            chord.romanNumeral && chord.chordName ? chord.chordName : '',
        });
      }
    });

    setOverlays(next);
  }, [analysis]);

  useEffect(() => {
    const id = requestAnimationFrame(computeOverlays);
    window.addEventListener('resize', computeOverlays);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', computeOverlays);
    };
  }, [svgPages, computeOverlays]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.scoreContainer} ref={containerRef}>
        {svgPages.map((svg, i) => (
          <div
            key={i}
            className={styles.svgPage}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Verovio output is trusted SVG
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ))}
        {overlays.map((o, i) =>
          o.label ? (
            <div
              key={i}
              className={styles.romanLabel}
              style={{ left: o.x, top: o.y }}
              title={o.secondary || undefined}
            >
              {o.label}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
