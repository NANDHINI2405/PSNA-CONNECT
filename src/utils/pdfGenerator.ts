/**
 * Generates a valid single-page PDF 1.4 Blob URL in pure TypeScript
 * so seeded and composed circulars open inside an embedded PDF viewer.
 */
function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 76): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export function buildPdfDataUrl(
  title: string,
  subtitle: string,
  sections: string[]
): string {
  const commands: string[] = [];
  commands.push('BT');
  commands.push('/F1 10 Tf');
  commands.push('50 760 Td');
  commands.push(`(${escapePdfText('PSNA COLLEGE OF ENGINEERING AND TECHNOLOGY, DINDIGUL')}) Tj`);
  commands.push('0 -22 Td');
  commands.push('/F2 16 Tf');
  commands.push(`(${escapePdfText(title)}) Tj`);
  commands.push('0 -18 Td');
  commands.push('/F1 10 Tf');
  commands.push(`(${escapePdfText(subtitle)}) Tj`);
  commands.push('0 -24 Td');

  let remainingY = 696;
  for (const para of sections) {
    const wrapped = wrapLine(para, 78);
    for (const line of wrapped) {
      if (remainingY < 70) break;
      commands.push('/F1 11 Tf');
      commands.push(`(${escapePdfText(line)}) Tj`);
      commands.push('0 -16 Td');
      remainingY -= 16;
    }
    if (remainingY < 70) break;
    commands.push('0 -8 Td');
    remainingY -= 8;
  }

  commands.push('ET');
  const streamContent = commands.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return `data:application/pdf;base64,${btoa(pdf)}`;
}
