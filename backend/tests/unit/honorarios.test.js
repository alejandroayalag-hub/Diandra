const { meses, estadoCuenta } = require('../../src/lib/honorarios');

test('meses cruza de año', () => {
  expect(meses('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  expect(meses('2026-11', '2026-10')).toEqual([]);
});

test('pagos se aplican al mes más antiguo; abono parcial', () => {
  const r = estadoCuenta({ honorario: '1500.00', desde: '2026-08', hasta: '2026-10', pagos: [{ monto: '1500' }, { monto: 500.5 }] });
  expect(r.meses.map(m => [m.periodo, m.estado, m.abonado])).toEqual([
    ['2026-08', 'pagado', 1500], ['2026-09', 'parcial', 500.5], ['2026-10', 'pendiente', 0],
  ]);
  expect(r).toMatchObject({ cargado: 4500, pagado: 2000.5, saldo: 2499.5 });
});

test('saldo a favor queda negativo; sin honorario no hay cargos', () => {
  expect(estadoCuenta({ honorario: 100, desde: '2026-10', hasta: '2026-10', pagos: [{ monto: 250 }] }).saldo).toBe(-150);
  expect(estadoCuenta({ honorario: null, desde: '2026-01', hasta: '2026-10', pagos: [] })).toMatchObject({ meses: [], saldo: 0 });
});
