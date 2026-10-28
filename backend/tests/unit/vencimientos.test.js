const {
  vencimientos, esInhabil, estado, armarCalendario, validarObligaciones, periodoValido, sumarDias, finDeMes,
} = require('../../src/lib/vencimientos');

const base = { id: 1, empresa_id: 1, razon_social: 'ACME', descripcion: 'IVA mensual', periodicidad: 'mensual',
  dia: 17, mes: null, fecha_inicio: '2022-01-01', fecha_fin: null, alta: '2026-10-14' };

describe('vencimientos', () => {
  test('mensual día 17: desde el alta, sábado 17-oct se recorre al lunes 19', () => {
    expect(vencimientos(base, '2026-12-31')).toEqual([
      { periodo: '2026-09', fecha_vence: '2026-10-19' },
      { periodo: '2026-10', fecha_vence: '2026-11-17' },
      { periodo: '2026-11', fecha_vence: '2026-12-17' },
    ]);
  });

  test('no genera vencimientos anteriores al alta aunque la CSF diga 2014', () => {
    const r = vencimientos({ ...base, fecha_inicio: '2014-07-28' }, '2026-10-31');
    expect(r).toEqual([{ periodo: '2026-09', fecha_vence: '2026-10-19' }]);
  });

  test('día 31: último día del mes; febrero 2027 domingo 28 → lunes 1-mar', () => {
    const r = vencimientos({ ...base, dia: 31, alta: '2027-01-01' }, '2027-03-05');
    expect(r).toEqual([
      { periodo: '2026-12', fecha_vence: '2027-02-02' },   // 31-ene domingo → 1-feb primer lunes de feb (inhábil) → 2-feb
      { periodo: '2027-01', fecha_vence: '2027-03-01' },
    ]);
  });

  test('fecha_inicio posterior al alta: empieza en el periodo de inicio', () => {
    const r = vencimientos({ ...base, fecha_inicio: '2026-11-01' }, '2026-12-31');
    expect(r).toEqual([{ periodo: '2026-11', fecha_vence: '2026-12-17' }]);
  });

  test('fecha_fin corta los periodos posteriores', () => {
    const r = vencimientos({ ...base, fecha_fin: '2026-10-31' }, '2027-03-31');
    expect(r.map(v => v.periodo)).toEqual(['2026-09', '2026-10']);
  });

  test('bimestral: bimestre sep-oct vence 17-nov', () => {
    const r = vencimientos({ ...base, periodicidad: 'bimestral' }, '2026-12-31');
    expect(r).toEqual([{ periodo: '2026-B5', fecha_vence: '2026-11-17' }]);
  });

  test('trimestral: trimestre jul-sep vence 17-oct (sábado) → 19-oct', () => {
    const r = vencimientos({ ...base, periodicidad: 'trimestral' }, '2026-12-31');
    expect(r).toEqual([{ periodo: '2026-T3', fecha_vence: '2026-10-19' }]);
  });

  test('anual persona moral: ejercicio 2026 vence 31-mar-2027', () => {
    const r = vencimientos({ ...base, periodicidad: 'anual', dia: 31, mes: 3 }, '2027-12-31');
    expect(r).toEqual([{ periodo: '2026', fecha_vence: '2027-03-31' }]);
  });

  test('anual persona física: abril día 31 → 30-abr', () => {
    const r = vencimientos({ ...base, periodicidad: 'anual', dia: 31, mes: 4 }, '2027-12-31');
    expect(r).toEqual([{ periodo: '2026', fecha_vence: '2027-04-30' }]);
  });

  test('manual o sin día: no genera nada', () => {
    expect(vencimientos({ ...base, periodicidad: 'manual', dia: null }, '2027-12-31')).toEqual([]);
    expect(vencimientos({ ...base, dia: null }, '2027-12-31')).toEqual([]);
    expect(vencimientos({ ...base, periodicidad: 'anual', mes: null }, '2027-12-31')).toEqual([]);
  });
});

describe('estado', () => {
  test('presentada gana; vencida si ya pasó; próxima ≤ 7 días; si no, pendiente', () => {
    expect(estado('2026-10-01', true, '2026-11-01')).toBe('presentada');
    expect(estado('2026-10-31', false, '2026-11-01')).toBe('vencida');
    expect(estado('2026-11-01', false, '2026-11-01')).toBe('proxima');
    expect(estado('2026-11-08', false, '2026-11-01')).toBe('proxima');
    expect(estado('2026-11-09', false, '2026-11-01')).toBe('pendiente');
  });
});

describe('armarCalendario', () => {
  const cumpl = [{ id: 5, obligacion_id: 1, periodo: '2026-09', fecha_presentacion: '2026-10-15', acuse: 'a.pdf' }];

  test('incluye lo vencido anterior a "desde" pero no lo ya presentado', () => {
    const r = armarCalendario([base], cumpl, { desde: '2026-11-01', hasta: '2026-12-31', hoy: '2026-11-20' });
    expect(r.map(i => [i.periodo, i.estado])).toEqual([['2026-10', 'vencida'], ['2026-11', 'pendiente']]);
  });

  test('marca presentada con datos del cumplimiento', () => {
    const r = armarCalendario([base], cumpl, { desde: '2026-10-01', hasta: '2026-10-31', hoy: '2026-10-20' });
    expect(r).toEqual([expect.objectContaining({
      periodo: '2026-09', estado: 'presentada', cumplimiento_id: 5, fecha_presentacion: '2026-10-15', tiene_acuse: true,
    })]);
  });

  test('ordena por fecha y luego por cliente', () => {
    const otra = { ...base, id: 2, empresa_id: 2, razon_social: 'AAA' };
    const r = armarCalendario([base, otra], [], { desde: '2026-11-01', hasta: '2026-11-30', hoy: '2026-10-01' });
    expect(r.map(i => i.razon_social)).toEqual(['AAA', 'ACME']);
  });

  test('vencidas anteriores a "desde" se incluyen; presentadas anteriores a "desde" se excluyen', () => {
    const r = armarCalendario([base], [], { desde: '2026-12-01', hasta: '2026-12-31', hoy: '2026-12-20' });
    expect(r.map(i => [i.periodo, i.estado])).toEqual([['2026-09', 'vencida'], ['2026-10', 'vencida'], ['2026-11', 'vencida']]);
    const r2 = armarCalendario([base], [{ id: 6, obligacion_id: 1, periodo: '2026-10', fecha_presentacion: '2026-11-10', acuse: null }],
      { desde: '2026-12-01', hasta: '2026-12-31', hoy: '2026-12-20' });
    expect(r2.map(i => [i.periodo, i.estado])).toEqual([['2026-09', 'vencida'], ['2026-11', 'vencida']]);
  });
});

describe('validaciones y fechas', () => {
  test('validarObligaciones', () => {
    expect(validarObligaciones([{ descripcion: 'IVA', periodicidad: 'mensual', dia: 17 }])).toBeNull();
    expect(validarObligaciones([{ descripcion: 'Rara', periodicidad: 'manual' }])).toBeNull();
    expect(validarObligaciones('x')).toMatch(/lista/);
    expect(validarObligaciones([{ descripcion: ' ', periodicidad: 'mensual', dia: 17 }])).toMatch(/descripción/);
    expect(validarObligaciones([{ descripcion: 'IVA', periodicidad: 'diaria', dia: 1 }])).toMatch(/Periodicidad/);
    expect(validarObligaciones([{ descripcion: 'IVA', periodicidad: 'mensual', dia: 32 }])).toMatch(/Día/);
    expect(validarObligaciones([{ descripcion: 'Anual', periodicidad: 'anual', dia: 31 }])).toMatch(/Mes/);
    expect(validarObligaciones([
      { descripcion: 'IVA', periodicidad: 'mensual', dia: 17 }, { descripcion: 'IVA ', periodicidad: 'mensual', dia: 17 },
    ])).toMatch(/repetida/);
  });

  test('periodoValido', () => {
    expect(periodoValido('mensual', '2026-09')).toBe(true);
    expect(periodoValido('mensual', '2026-13')).toBe(false);
    expect(periodoValido('bimestral', '2026-B6')).toBe(true);
    expect(periodoValido('trimestral', '2026-T5')).toBe(false);
    expect(periodoValido('anual', '2026')).toBe(true);
    expect(periodoValido('manual', '2026')).toBe(false);
    expect(periodoValido('mensual', undefined)).toBe(false);
  });

  test('sumarDias y finDeMes', () => {
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04');
    expect(finDeMes('2026-12-15', 0)).toBe('2026-12-31');
    expect(finDeMes('2026-12-15', 2)).toBe('2027-02-28');
  });
});

test('vencimientos sin hasta → []', () => {
  expect(vencimientos({ periodicidad: 'mensual', dia: 17, alta: '2026-10-14' }, undefined)).toEqual([]);
});

describe('días inhábiles (CFF art. 12)', () => {
  const d = (f) => new Date(f + 'T00:00:00Z');
  test.each([
    ['2026-01-01', true], ['2026-02-02', true], ['2026-03-16', true], ['2026-05-01', true], ['2026-05-05', true],
    ['2026-09-16', true], ['2026-11-16', true], ['2026-12-25', true], ['2026-10-17', true],
    ['2026-02-09', false], ['2026-03-09', false], ['2026-11-17', false], ['2026-10-19', false],
  ])('%s inhábil = %s', (f, esperado) => expect(esInhabil(d(f))).toBe(esperado));

  test('16-nov-2026 (tercer lunes de noviembre) recorre al martes 17', () => {
    const r = vencimientos({ ...base, dia: 16, alta: '2026-11-01' }, '2026-11-30');
    expect(r).toEqual([{ periodo: '2026-10', fecha_vence: '2026-11-17' }]);
  });

  test('anual persona física: 30-abr-2028 domingo → 1-may inhábil → 2-may', () => {
    const r = vencimientos({ ...base, periodicidad: 'anual', dia: 30, mes: 4, alta: '2027-06-01' }, '2028-12-31');
    expect(r).toEqual([{ periodo: '2027', fecha_vence: '2028-05-02' }]);
  });
});
