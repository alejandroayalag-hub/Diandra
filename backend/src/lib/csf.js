const pdfParse = require('pdf-parse');

// La CSF del SAT, leída con pdf-parse, pega palabras ("Amástardareldía17delmesinmediato") y une la
// descripción con el vencimiento ("…salariosAmástardar…"). Por eso la clasificación usa texto sin espacios.

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MANUAL = { periodicidad: 'manual', dia: null, mes: null };
// Inicio del texto de vencimiento, con espacios opcionales entre palabras.
const INICIO_VENC = /A\s*m[aá]s\s*tardar|Dentro\s*de|Se\s*presenta|En\s*el\s*mes/i;
const FILA = /(.+?)\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*(\d{2})\/(\d{2})\/(\d{4}))?/g;
const RUIDO = /Descripci[oó]n\s*de\s*la\s*Obligaci[oó]n|P[aá]gina\s*\[?\d+\]?\s*de\s*\[?\d+/i;

function clasificar(vencimiento) {
  const t = vencimiento.toLowerCase().replace(/\s+/g, '');
  if (t.includes('ejercicio')) {
    const nombre = Object.keys(MESES).find(m => t.includes(m));
    const mes = nombre ? MESES[nombre] : t.includes('tresmeses') ? 3 : null;
    if (!mes) return { ...MANUAL };
    const dia = nombre && Number((t.match(new RegExp(`(\\d{1,2})de${nombre}`)) || [])[1]);
    return { periodicidad: 'anual', dia: dia || 31, mes };
  }
  if (t.includes('mesinmediatoposterior')) {
    const dia = /[uú]ltimod[ií]a/.test(t) ? 31 : Number((t.match(/d[ií]a(\d{1,2})/) || [])[1]);
    if (!dia) return { ...MANUAL };
    const periodicidad = t.includes('bimestre') ? 'bimestral' : t.includes('trimestre') ? 'trimestral' : 'mensual';
    return { periodicidad, dia, mes: null };
  }
  return { ...MANUAL };
}

function parseCsfText(texto) {
  const ini = texto.search(/Obligaciones:/i);
  if (ini < 0) return [];
  let seccion = texto.slice(ini).replace(/^Obligaciones:/i, '');
  const fin = seccion.search(/Sus\s*datos\s*personales|Cadena\s*Original/i);
  if (fin >= 0) seccion = seccion.slice(0, fin);
  const plano = seccion.split('\n').filter(l => !RUIDO.test(l)).join(' ').replace(/\s+/g, ' ');

  return [...plano.matchAll(FILA)].map(m => {
    const fila = m[1].trim();
    const corte = fila.search(INICIO_VENC);
    const descripcion = (corte > 0 ? fila.slice(0, corte) : fila).trim().replace(/\.$/, '');
    const vencimiento = corte > 0 ? fila.slice(corte).trim() : '';
    return {
      descripcion, vencimiento_texto: vencimiento, ...clasificar(vencimiento),
      fecha_inicio: `${m[4]}-${m[3]}-${m[2]}`, fecha_fin: m[5] ? `${m[7]}-${m[6]}-${m[5]}` : null,
    };
  });
}

// Nunca lanza por un PDF malo: devuelve aviso para que Diana capture a mano.
async function leerCsf(buffer, rfcCliente) {
  let texto;
  try {
    texto = (await pdfParse(buffer)).text || '';
  } catch {
    return { obligaciones: [], aviso: 'No se pudo leer el PDF. Captura las obligaciones a mano.' };
  }
  if (!texto.trim()) {
    return { obligaciones: [], aviso: 'La CSF no tiene texto legible (¿es escaneada?). Descarga la del portal del SAT o captura a mano.' };
  }
  const obligaciones = parseCsfText(texto);
  const avisos = [];
  if (!obligaciones.length) avisos.push('No se encontraron obligaciones en la CSF; captúralas a mano.');
  if (rfcCliente && !texto.replace(/\s+/g, '').toUpperCase().includes(rfcCliente.toUpperCase())) {
    avisos.push(`Esta CSF no parece ser del RFC del cliente (${rfcCliente}). Revisa el archivo antes de confirmar.`);
  }
  return { obligaciones, aviso: avisos.join(' ') || null };
}

module.exports = { parseCsfText, clasificar, leerCsf };
