/**
 * Fix a common export quirk where a grand-staff score splits its initial
 * <attributes> across two blocks in the first measure — the treble clef in
 * the first block and the bass clef in a second block that appears after a
 * <backup> element.  Verovio renders the second block at its literal position
 * in the measure, so the bass clef ends up after the time signature.
 *
 * This function consolidates all <clef> elements from every <attributes>
 * block in a measure into the very first one, then removes blocks that are
 * left empty (or contain only a redundant <staves> element).
 */
export function preprocessMusicXML(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return xml;

  for (const measure of doc.querySelectorAll('measure')) {
    const attrBlocks = Array.from(measure.children).filter(
      el => el.tagName === 'attributes',
    );
    if (attrBlocks.length < 2) continue;

    const first = attrBlocks[0];

    for (const block of attrBlocks.slice(1)) {
      // Move every <clef> not already present in the first block
      for (const clef of Array.from(block.children).filter(el => el.tagName === 'clef')) {
        const num = clef.getAttribute('number') ?? '1';
        const already = Array.from(first.children).some(
          el => el.tagName === 'clef' && (el.getAttribute('number') ?? '1') === num,
        );
        if (!already) {
          first.appendChild(clef); // moves the node (no clone needed)
        } else {
          block.removeChild(clef);
        }
      }

      // Drop the block if nothing meaningful remains
      const leftover = Array.from(block.children).filter(el => el.tagName !== 'staves');
      if (leftover.length === 0) {
        measure.removeChild(block);
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
