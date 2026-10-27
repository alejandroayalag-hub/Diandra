// Estado de cuenta de honorarios calculado al vuelo: un cargo por mes desde `desde` hasta `hasta` ('YYYY-MM').
// Los pagos no se ligan a un mes: se aplican al más antiguo pendiente (abonos parciales incluidos).
// ponytail: cambiar el honorario recalcula todo el historial; guardar cargos por mes si Diana sube precios a media relación.

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const centavos = n => Math.round(Number(n || 0) * 100);

function meses(desde, hasta) {
  const out = [];
  let [a, m] = desde.split('-').map(Number);
  for (let p = desde; p <= hasta; p = `${a}-${String(m).padStart(2, '0')}`) {
    out.push(p);
    if (++m > 12) { m = 1; a++; }
  }
  return out;
}

function estadoCuenta({ honorario, desde, hasta, pagos }) {
  const cargo = centavos(honorario);
  let disponible = pagos.reduce((s, p) => s + centavos(p.monto), 0);
  const pagado = disponible;
  const lista = cargo > 0 && desde <= hasta ? meses(desde, hasta) : [];
  const out = lista.map(periodo => {
    const aplicado = Math.min(cargo, disponible);
    disponible -= aplicado;
    return { periodo, cargo: cargo / 100, abonado: aplicado / 100,
      estado: aplicado === cargo ? 'pagado' : aplicado > 0 ? 'parcial' : 'pendiente' };
  });
  const cargado = cargo * lista.length;
  return { meses: out, cargado: cargado / 100, pagado: pagado / 100, saldo: (cargado - pagado) / 100 };
}

module.exports = { PERIODO_RE, meses, estadoCuenta };
