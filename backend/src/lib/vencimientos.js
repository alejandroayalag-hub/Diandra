// Vencimientos calculados al vuelo a partir de la regla de cada obligación.
// Todas las fechas son texto 'YYYY-MM-DD' y se operan en UTC: sin zonas horarias de por medio.

const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'anual', 'manual'];
const MESES_POR_PERIODO = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 };
const PERIODO_RE = {
  mensual: /^\d{4}-(0[1-9]|1[0-2])$/, bimestral: /^\d{4}-B[1-6]$/, trimestral: /^\d{4}-T[1-4]$/, anual: /^\d{4}$/,
};

const iso = d => d.toISOString().slice(0, 10);
const utc = (anio, mes0, dia) => new Date(Date.UTC(anio, mes0, dia)); // Date.UTC normaliza meses > 11
const partes = f => [Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))];

// ponytail: Date.now() (no new Date()) para que las pruebas fijen "hoy" con jest.spyOn(Date, 'now').
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(Date.now());
const sumarDias = (f, n) => { const [a, m, d] = partes(f); return iso(utc(a, m, d + n)); };
const finDeMes = (f, mesesAdelante) => { const [a, m] = partes(f); return iso(utc(a, m + mesesAdelante + 1, 0)); };

// Día N del mes (o el último si no existe); sábado/domingo → lunes.
// ponytail: sin días festivos oficiales; agregar tabla de inhábiles si Diana la necesita.
function fechaVence(anio, mes0, dia) {
  const ultimo = utc(anio, mes0 + 1, 0).getUTCDate();
  const f = utc(anio, mes0, Math.min(dia, ultimo));
  const dow = f.getUTCDay();
  if (dow === 6) f.setUTCDate(f.getUTCDate() + 2);
  if (dow === 0) f.setUTCDate(f.getUTCDate() + 1);
  return iso(f);
}

function etiqueta(periodicidad, anio, idx) {
  if (periodicidad === 'mensual') return `${anio}-${String(idx + 1).padStart(2, '0')}`;
  if (periodicidad === 'bimestral') return `${anio}-B${idx + 1}`;
  if (periodicidad === 'trimestral') return `${anio}-T${idx + 1}`;
  return String(anio);
}

// Periodos cuyo vencimiento cae entre el alta en el sistema y `hasta`.
// El alta como inicio evita cientos de "vencidas" de clientes con años en el SAT.
function vencimientos(ob, hasta) {
  const n = MESES_POR_PERIODO[ob.periodicidad];
  if (!n || !ob.dia || (n === 12 && !ob.mes)) return [];
  // Un periodo de antes de (año de alta − 1) no puede vencer después del alta.
  const anioInicio = Math.max(Number((ob.fecha_inicio || ob.alta).slice(0, 4)), Number(ob.alta.slice(0, 4)) - 1);
  const out = [];
  for (let anio = anioInicio; ; anio++) {
    for (let idx = 0; idx < 12 / n; idx++) {
      const mes0 = idx * n;
      const inicioPeriodo = iso(utc(anio, mes0, 1));
      const finPeriodo = iso(utc(anio, mes0 + n, 0));
      const vence = n === 12 ? fechaVence(anio + 1, ob.mes - 1, ob.dia) : fechaVence(anio, mes0 + n, ob.dia);
      if (vence > hasta) return out;
      if (ob.fecha_fin && inicioPeriodo > ob.fecha_fin) return out;
      if (ob.fecha_inicio && finPeriodo < ob.fecha_inicio) continue;
      if (vence < ob.alta) continue;
      out.push({ periodo: etiqueta(ob.periodicidad, anio, idx), fecha_vence: vence });
    }
  }
}

function estado(fechaVence, presentada, hoy) {
  if (presentada) return 'presentada';
  if (fechaVence < hoy) return 'vencida';
  if (fechaVence <= sumarDias(hoy, 7)) return 'proxima';
  return 'pendiente';
}

// Vencimientos en [desde, hasta] más todo lo vencido sin presentar, ordenados por fecha y cliente.
function armarCalendario(obligaciones, cumplimientos, { desde, hasta, hoy }) {
  const hechos = new Map(cumplimientos.map(c => [`${c.obligacion_id}|${c.periodo}`, c]));
  const out = [];
  for (const ob of obligaciones) {
    for (const v of vencimientos(ob, hasta)) {
      const c = hechos.get(`${ob.id}|${v.periodo}`);
      const est = estado(v.fecha_vence, !!c, hoy);
      if (v.fecha_vence < desde && est !== 'vencida') continue;
      out.push({
        obligacion_id: ob.id, empresa_id: ob.empresa_id, razon_social: ob.razon_social, descripcion: ob.descripcion,
        periodo: v.periodo, fecha_vence: v.fecha_vence, estado: est,
        cumplimiento_id: c ? c.id : null, fecha_presentacion: c ? c.fecha_presentacion : null, tiene_acuse: !!(c && c.acuse),
      });
    }
  }
  return out.sort((a, b) => a.fecha_vence.localeCompare(b.fecha_vence) || String(a.razon_social).localeCompare(String(b.razon_social)));
}

const entero = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max && v !== null && v !== '';

function validarObligaciones(lista) {
  if (!Array.isArray(lista)) return 'obligaciones debe ser una lista';
  const vistas = new Set();
  for (const o of lista) {
    const d = String((o && o.descripcion) || '').trim();
    if (!d) return 'Cada obligación necesita descripción';
    if (vistas.has(d)) return `Obligación repetida: ${d}`;
    vistas.add(d);
    if (!PERIODICIDADES.includes(o.periodicidad)) return `Periodicidad inválida en "${d}"`;
    if (o.periodicidad !== 'manual' && !entero(o.dia, 1, 31)) return `Día de vencimiento inválido en "${d}"`;
    if (o.periodicidad === 'anual' && !entero(o.mes, 1, 12)) return `Mes de vencimiento inválido en "${d}"`;
  }
  return null;
}

const periodoValido = (periodicidad, periodo) => !!(PERIODO_RE[periodicidad] && PERIODO_RE[periodicidad].test(String(periodo || '')));

module.exports = {
  PERIODICIDADES, vencimientos, estado, armarCalendario, validarObligaciones, periodoValido, hoyMx, sumarDias, finDeMes,
};
