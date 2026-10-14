const { parseCsfText, clasificar, leerCsf } = require('../../src/lib/csf');
const { CSF_LINEAS } = require('../fixtures/csf');
const { pdfConLineas } = require('../fixtures/pdf');

describe('parseCsfText', () => {
  test('lee las 5 obligaciones de una CSF real de persona moral', () => {
    const r = parseCsfText(CSF_LINEAS.join('\n'));
    expect(r.map(o => [o.descripcion, o.periodicidad, o.dia, o.mes, o.fecha_inicio, o.fecha_fin])).toEqual([
      ['Declaración de proveedores de IVA', 'mensual', 31, null, '2014-07-28', null],
      ['Entero de retenciones mensuales de ISR por sueldos y salarios', 'mensual', 17, null, '2014-07-28', null],
      ['Pago provisional mensual de ISR personas morales régimen general', 'mensual', 17, null, '2022-01-01', null],
      ['Declaración anual de ISR del ejercicio Personas morales', 'anual', 31, 3, '2022-01-01', null],
      ['Pago definitivo mensual de IVA', 'mensual', 17, null, '2022-01-01', '2030-12-31'],
    ]);
    expect(r[1].vencimiento_texto).toMatch(/^Amástardareldía17/);
  });

  test('sin sección de obligaciones → []', () => {
    expect(parseCsfText('CONSTANCIA\nRégimen 01/01/2022')).toEqual([]);
  });

  test('renglón sin vencimiento reconocible → descripción completa y manual', () => {
    const r = parseCsfText('Obligaciones:\nAviso de algo raro.Conformealaley.\n01/01/2022\nSus datos personales');
    expect(r).toEqual([{ descripcion: 'Aviso de algo raro.Conformealaley', vencimiento_texto: '',
      periodicidad: 'manual', dia: null, mes: null, fecha_inicio: '2022-01-01', fecha_fin: null }]);
  });
});

describe('clasificar', () => {
  test.each([
    ['A más tardar el día 17 del mes inmediato posterior al bimestre que corresponda.', 'bimestral', 17, null],
    ['A más tardar el día 17 del mes inmediato posterior al trimestre.', 'trimestral', 17, null],
    ['Se presenta en el mes de abril del ejercicio siguiente.', 'anual', 31, 4],
    ['A más tardar el 31 de marzo del ejercicio siguiente.', 'anual', 31, 3],
    ['Dentrodelostresmesessiguientesalcierredelejercicio.', 'anual', 31, 3],
    ['Amástardarelúltimodíadelmesinmediatoposterioral periodo', 'mensual', 31, null],
    ['Cuando se realice el acto.', 'manual', null, null],
  ])('%s', (texto, periodicidad, dia, mes) => {
    expect(clasificar(texto)).toEqual({ periodicidad, dia, mes });
  });
});

describe('leerCsf', () => {
  test('lee un PDF con texto y no avisa si el RFC coincide', async () => {
    const r = await leerCsf(pdfConLineas(CSF_LINEAS), 'AUR010101AB1');
    expect(r.aviso).toBeNull();
    expect(r.obligaciones).toHaveLength(5);
  });

  test('aviso si el RFC no coincide', async () => {
    const r = await leerCsf(pdfConLineas(CSF_LINEAS), 'XYZ010101AB1');
    expect(r.aviso).toMatch(/XYZ010101AB1/);
    expect(r.obligaciones).toHaveLength(5);
  });

  test('PDF sin texto (escaneado) → aviso, sin error', async () => {
    const r = await leerCsf(pdfConLineas([]), 'AUR010101AB1');
    expect(r).toEqual({ obligaciones: [], aviso: expect.stringMatching(/texto legible/) });
  });

  test('archivo que no es PDF → aviso, sin error', async () => {
    const r = await leerCsf(Buffer.from('no soy pdf'), 'AUR010101AB1');
    expect(r).toEqual({ obligaciones: [], aviso: expect.stringMatching(/No se pudo leer/) });
  });
});
