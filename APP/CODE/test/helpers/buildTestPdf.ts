/**
 * Minimal hand-rolled PDF builder for tests -- no external PDF-generation
 * dependency needed. pdfjs (via pdf-parse) tolerates the simplified/incomplete
 * xref table this produces. Each line is placed on its own Tj at a fixed
 * vertical step so it stays within page width (pdf-parse's text extraction is
 * tied to render geometry -- verified empirically before writing this file:
 * an unwrapped long line at a large font size gets silently clipped).
 */
interface PdfLine {
  text: string;
  fontSize?: number;
}

function escapePdfString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPageContentStream(lines: readonly PdfLine[]): string {
  let y = 730;
  const ops: string[] = [];
  for (const line of lines) {
    const size = line.fontSize ?? 10;
    ops.push(`BT\n/F1 ${size} Tf\n50 ${y} Td\n(${escapePdfString(line.text)}) Tj\nET\n`);
    y -= size + 12;
  }
  return ops.join('');
}

/** Builds a valid, minimal multi-page text-native PDF from lines-per-page. */
export function buildTestPdf(pages: readonly (readonly PdfLine[])[]): Buffer {
  const objects: string[] = [];
  const catalogObj = 1;
  const pagesObj = 2;
  const fontObj = 3;
  let nextObj = 4;
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(nextObj);
    nextObj += 1;
    contentObjIds.push(nextObj);
    nextObj += 1;
  }

  objects.push(`${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj`);
  objects.push(
    `${pagesObj} 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`,
  );
  objects.push(`${fontObj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);

  for (let i = 0; i < pages.length; i++) {
    const pageObj = pageObjIds[i];
    const contentObj = contentObjIds[i];
    objects.push(
      `${pageObj} 0 obj\n<< /Type /Page /Parent ${pagesObj} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R >>\nendobj`,
    );
    const stream = buildPageContentStream(pages[i] ?? []);
    const streamLen = Buffer.byteLength(stream, 'latin1');
    objects.push(`${contentObj} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}endstream\nendobj`);
  }

  const body = objects.join('\n');
  const pdf = `%PDF-1.4\n${body}\nxref\n0 ${nextObj}\n0000000000 65535 f \ntrailer\n<< /Size ${nextObj} /Root ${catalogObj} 0 R >>\nstartxref\n0\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** A PDF with valid structure but zero extractable text (simulates a scanned/image-only page). */
export function buildScannedLikePdf(pageCount = 1): Buffer {
  const catalogObj = 1;
  const pagesObj = 2;
  let nextObj = 3;
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageObjIds.push(nextObj);
    nextObj += 1;
    contentObjIds.push(nextObj);
    nextObj += 1;
  }
  const objects: string[] = [];
  objects.push(`${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj`);
  objects.push(
    `${pagesObj} 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj`,
  );
  for (let i = 0; i < pageCount; i++) {
    objects.push(
      `${pageObjIds[i]} 0 obj\n<< /Type /Page /Parent ${pagesObj} 0 R /Resources << >> /MediaBox [0 0 612 792] /Contents ${contentObjIds[i]} 0 R >>\nendobj`,
    );
    objects.push(`${contentObjIds[i]} 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj`);
  }
  const body = objects.join('\n');
  const pdf = `%PDF-1.4\n${body}\nxref\n0 ${nextObj}\n0000000000 65535 f \ntrailer\n<< /Size ${nextObj} /Root ${catalogObj} 0 R >>\nstartxref\n0\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
