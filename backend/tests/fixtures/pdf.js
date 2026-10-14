// PDF mínimo de una página (Helvetica, WinAnsi) con un renglón por línea, para probar subidas de CSF.
function pdfConLineas(lineas) {
  const esc = s => s.replace(/[\\()]/g, m => `\\${m}`);
  const stream = `BT /F1 6 Tf 12 TL 20 820 Td\n${lineas.map(l => `(${esc(l)}) '`).join('\n')}\nET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  // Relleno (comentario PDF): pdf-parse 1.1.1 lee mal los buffers < 4 KB (pool de Buffer + byteOffset), así que el PDF debe pasar de 4 KB.
  let pdf = `%PDF-1.4\n%${'-'.repeat(4200)}\n`;
  const offsets = objs.map((o, i) => {
    const off = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return off;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

module.exports = { pdfConLineas };
