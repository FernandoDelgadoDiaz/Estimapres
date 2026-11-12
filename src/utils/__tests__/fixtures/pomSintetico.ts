// POM-01 (#8) — Fixture SINTÉTICO equivalente a la matriz «Estimado de cajas necesarias»
// del POM de referencia 16–22/11/2026 (MASTER §2). No contiene datos reales ni nombres:
// reproduce solo las propiedades documentadas:
//   - 31 filas 07:00–22:00 × 7 días (217 valores, revisables a mano abajo);
//   - 07:00 y 07:30 en 0 (la demanda empieza a las 08:00);
//   - sábado 21/11 con 7 cajas entre 19:30 y 21:00 (filas 19:30, 20:00, 20:30), máximo de la semana;
//   - total 812 celdas = 406 horas-caja.
// El TEXTO generado imita la extracción de pdf.js; su maquetación exacta NO está
// verificada contra el PDF real (ver test local `pom-real.local.test.ts`).

export const SEMANA_REFERENCIA = { lunes: '2026-11-16', domingo: '2026-11-22' }

export const MATRIZ_POM_SINTETICA: Array<[string, number[]]> = [
  ['07:00', [0, 0, 0, 0, 0, 0, 0]],
  ['07:30', [0, 0, 0, 0, 0, 0, 0]],
  ['08:00', [1, 1, 1, 1, 2, 2, 1]],
  ['08:30', [1, 1, 1, 1, 2, 2, 1]],
  ['09:00', [2, 2, 2, 2, 3, 3, 2]],
  ['09:30', [2, 2, 2, 2, 3, 3, 2]],
  ['10:00', [3, 3, 3, 3, 4, 4, 3]],
  ['10:30', [3, 3, 3, 3, 4, 4, 3]],
  ['11:00', [4, 4, 4, 4, 5, 5, 4]],
  ['11:30', [4, 4, 4, 4, 5, 5, 4]],
  ['12:00', [4, 4, 4, 4, 5, 5, 5]],
  ['12:30', [4, 4, 4, 4, 5, 5, 4]],
  ['13:00', [3, 3, 3, 3, 4, 4, 3]],
  ['13:30', [3, 3, 3, 3, 4, 4, 3]],
  ['14:00', [3, 3, 3, 3, 4, 4, 3]],
  ['14:30', [3, 3, 3, 3, 4, 4, 3]],
  ['15:00', [3, 3, 3, 3, 4, 4, 3]],
  ['15:30', [3, 3, 3, 3, 4, 4, 3]],
  ['16:00', [4, 4, 4, 4, 5, 5, 4]],
  ['16:30', [4, 4, 4, 4, 5, 5, 4]],
  ['17:00', [5, 5, 5, 5, 6, 6, 5]],
  ['17:30', [5, 5, 5, 5, 6, 6, 5]],
  ['18:00', [5, 5, 5, 5, 6, 6, 5]],
  ['18:30', [5, 5, 5, 5, 6, 6, 5]],
  ['19:00', [5, 5, 5, 5, 6, 6, 5]],
  ['19:30', [6, 6, 6, 6, 6, 7, 6]],
  ['20:00', [6, 6, 6, 6, 6, 7, 6]],
  ['20:30', [6, 6, 6, 6, 6, 7, 6]],
  ['21:00', [5, 5, 5, 5, 6, 6, 5]],
  ['21:30', [4, 4, 4, 4, 5, 5, 4]],
  ['22:00', [2, 2, 2, 2, 3, 3, 2]],
]

const filasTexto = (filas: Array<[string, number[]]>) =>
  filas.map(([h, v]) => `${h}:00 ${v.join(' ')}`).join(' ')

/** Texto sintético estilo pdf.js: encabezado, «Diferencia» (con negativos) y «Estimado». */
export function textoPOMSintetico(opts: {
  encabezado?: string
  estimado?: Array<[string, number[]]>
  diferenciaPrimero?: boolean
} = {}): string {
  const encabezado = opts.encabezado ?? 'Programación semanal 2026-11-16 - 2026-11-22 Sucursal XXX'
  const estimado = opts.estimado ?? MATRIZ_POM_SINTETICA
  const diferencia = MATRIZ_POM_SINTETICA.map(([h, v]) => [h, v.map((x, i) => (i % 2 ? -x : x - 1))] as [string, number[]])
  const cab = 'Horario Lunes Martes Miércoles Jueves Viernes Sábado Domingo'
  const tDif = `Diferencia de cajas necesarias ${cab} ${filasTexto(diferencia)}`
  const tEst = `Estimado de cajas necesarias ${cab} ${filasTexto(estimado)}`
  const pag1 = 'Programación de personal Colaborador A 08:00 16:00'
  return [encabezado, pag1, ...(opts.diferenciaPrimero === false ? [tEst, tDif] : [tDif, tEst])].join(' ')
}
