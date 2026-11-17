import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { PERFIL_HORAS_VIGENTE } from '../../contratos'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../../types'
import { perfilNormativoDesdeHoras } from '../../validadorIndependiente'
import { normalizarId } from '../../adapter'
import { HORAS_FRANJAS, type Auxiliar, type Colaborador, type Eventual, type HorarioColaborador } from '../../../types'
import { manifiestoHistorial } from '../../../utils/historialIntercambio'
import { historialEfectivo } from '../../../planificacion/historial'
import { generarConCiclo, type DiaSimulado } from '../../../utils/optimizacionCiclos'
import { sumarDias } from '../../../planificacion/fechas'
import type { CicloPlanificacion } from '../../../planificacion/ciclos'

const origen = process.env.AH2_CICLOS_ORIGEN
const destino = process.env.AH2_CICLOS_DESTINO
const hora = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`
const turnos = (j: Jornada) => j.bloques.map(b => ({ inicio: hora(b.slot_inicio), fin: hora(b.slot_fin) }))
const horario = (fila: string[], ausente: string) => fila.flatMap((v, s) => {
  if (v === ausente || (s > 0 && fila[s - 1] !== ausente)) return []
  let fin = s + 1
  while (fin < fila.length && fila[fin] !== ausente) fin++
  return [`${hora(s)}-${hora(fin)}`]
}).join('|')

type InputSerie = Omit<InputAlgoritmo, 'colaboradores'> & { semana: string; colaboradores: (InputAlgoritmo['colaboradores'][number] & { horasSemanales?: number })[] }
type Caso = {
  escenario: string
  input: InputSerie
  profile: { branch_id: string; version: number }
  simulated?: boolean
  absences?: { id: string; date: string }[]
  history: { branch_id: string; week: string; replacement?: Record<string,Jornada[]>; jornadas: Record<string, Jornada[]> }[]
}


function exportar(caso: Caso, i: number, inicioDeclarado?: string) {
  const { input: p, history, profile } = caso
  const sucursalId = profile.branch_id
  const lunes = p.semana
  const previo = history.find(h => h.week === sumarDias(lunes, -7))
  const inicio = inicioDeclarado ?? (i % 2 === 0 ? lunes : sumarDias(lunes, -7))
  // Los ciclos no se deducen del mes. La cadena declara cuatro cortes de 28 días.
  const inicios = inicioDeclarado ? [-3,-2,-1,0].map(i => sumarDias(inicio, i*28))
    : [sumarDias(inicio, -28), inicio]
  const calendario: CicloPlanificacion[] = inicios.map(inicio => ({
    id: inicio, sucursalId, nombre: `Ciclo ${inicio}`, inicio, fin: sumarDias(inicio, 27),
    modalidad: 'mensual', estado: inicio === inicios[inicios.length - 1] ? 'abierto' : 'cerrado', origen: 'sucursal',
  }))
  const idAnterior = (fecha: string) => [...inicios].reverse().find(d => d <= fecha) ?? inicios[0]
  const horasPerfil = { ...PERFIL_HORAS_VIGENTE, maximoHoras: { FULL: 48, PART: 36 } }
  const cajeros: Colaborador[] = p.colaboradores.flatMap(q => q.rol === 'FULL' || q.rol === 'PART' ? [
    { id: q.id, nombre: q.nombre, tipo: q.rol, activo: true, horasSemanales: q.rol === 'FULL' ? 48 : q.horasSemanales },
  ] : [])
  const auxiliares: Auxiliar[] = p.colaboradores.filter(q => q.rol === 'AUX').map(q => ({
    ...q, activo: true, horarioSemanal: p.presencia_aux[q.id].map(f => horario(f, 'NO_PRESENTE')),
  }))
  const eventuales: Eventual[] = p.colaboradores.filter(q => q.rol === 'EVENTUAL').map(q => ({
    ...q, activo: true, sector: 'Prueba', horarioSemanal: p.disponibilidad_eventual[q.id].map(f => horario(f, 'NO_DISPONIBLE')),
  }))
  for (const q of p.colaboradores) expect(normalizarId(q.nombre)).toBe(q.id)
  const necesidad = HORAS_FRANJAS.map((hora, s) => ({ hora, necesidad: p.demanda.map(f => f[s - 2] ?? 0) }))
  const operativa = {
    aperturaSoloAux: p.apertura_solo_aux ?? true, sinAuxCierre: p.sin_aux_cierre ?? true,
    supervisorJornadaCompleta: p.supervisor_jornada_completa ?? false, francoMedioCorridos: p.franco_medio_corridos ?? false,
    maxBloquesCajaEventualDia: 2, eventualesCajaHoraLimite: '22:00',
  }
  const horariosDe = (h: typeof previo): HorarioColaborador[] => Object.entries(h?.jornadas ?? {}).map(([colaboradorId, semana]) => ({
    colaboradorId, errores: [], rolGeneral: 'cajero', totalHoras: 0,
    jornadas: semana.map(j => ({ dia: j.dia, turnos: turnos(j), rol: 'cajero', horas: 0, esFranco: !j.bloques.length })),
  }))
  const oficiales = history.filter(h => h.week >= calendario[0].inicio && h.week < lunes)
  const versiones = oficiales.flatMap(h => (h.replacement ? [h, { ...h, jornadas: h.replacement }] : [h]).map((v, i) => ({
    version: { id: `${v.week}-${i}`, sucursalId, cicloId: idAnterior(v.week), fechaLunes: v.week, numero: i + 1,
      estado: 'PUBLICADO' as const, ambito: 'servidor' as const, huellaEntradas: 'sintetica', creadaPor: 'fixture' },
    semana: { fechaLunes: v.week, horarios: horariosDe(v) },
  })))
  const tramos = oficiales.flatMap(h => {
    const tramo = (i: number, desde: string, hasta: string) => ({
      id: `${h.week}-${i}`, sucursalId, publicacionId: 'fixture', versionId: `${h.week}-${i}`, desde,
      hasta: sumarDias(h.week, 6), hastaEfectivo: hasta,
    })
    return h.replacement ? [tramo(0,h.week,sumarDias(h.week,3)),tramo(1,sumarDias(h.week,4),sumarDias(h.week,6))]
      : [tramo(0,h.week,sumarDias(h.week,6))]
  })
  const historial = { versiones, tramos, desde: calendario[0].inicio, hasta: sumarDias(lunes,-1), hoy: lunes }
  const calidadOffline = process.env.AH2_CICLOS_CALIDAD === '1'
  if (caso.simulated && (!sucursalId.startsWith('lab-') || history.some(h => h.branch_id !== sucursalId))) throw Error('Simulación fuera de su sucursal')
  const diasSimulados: DiaSimulado[] | undefined = caso.simulated ? tramos.flatMap(t => {
    const semana = versiones.find(v => v.version.id === t.versionId)!.semana
    return Array.from({ length: 7 }, (_, d) => sumarDias(semana.fechaLunes, d))
      .filter(f => f >= t.desde && f <= t.hastaEfectivo).map(fecha => {
        const ausentes = (caso.absences ?? []).filter(a => a.date === fecha).map(a => a.id)
        return { fecha, fuente: 'efectivo-simulado', versionId: t.versionId, tramoId: t.id, ausentes,
          jornadas: semana.horarios.filter(h => !ausentes.includes(h.colaboradorId)).flatMap(h =>
            h.jornadas.filter(j => sumarDias(semana.fechaLunes,j.dia) === fecha)
              .map(jornada => ({ colaboradorId: h.colaboradorId, jornada }))) }
      })
  }) : undefined
  const ctxCiclo = { sucursalId, lunes, calendario, calidadOffline, diasSimulados,
    historial: diasSimulados ? { ...historial, versiones: [], tramos: [] } : historial }
  const resHistorial = historialEfectivo({ ...ctxCiclo.historial, sucursalId })
  if (!resHistorial.ok) throw Error('fixture de historial inválido')
  const domingo = (diasSimulados ?? resHistorial.valor).find(d => d.fecha === sumarDias(lunes,-1))
  const fins = Object.fromEntries((domingo?.jornadas ?? []).filter(x => cajeros.some(c => c.id === x.colaboradorId)).map(({ colaboradorId, jornada }) => [
    colaboradorId, jornada.turnos[jornada.turnos.length - 1]?.fin ?? null,
  ]))
  const finDomingo = Object.fromEntries(Object.entries(fins).flatMap(([id, h]) => {
    if (h === null) return []
    const [a, b] = h.split(':').map(Number)
    return [[id, (a*60 + b - 480)/30]]
  }))
  const input = { ...p, max_bloques_caja_eventual_dia: 2, eventuales_caja_hora_limite: '22:00',
    inicio_minimo_lunes_por_colaborador: Object.fromEntries(Object.entries(finDomingo).map(([id,b]) => [id,Math.max(0,b-24)])),
  }
  const t0 = performance.now()
  const a = generarConCiclo({ input, cajeros, auxiliares, eventuales, contexto: {
    necesidad, operativa, excepciones: p.excepciones ?? [], perfil: perfilNormativoDesdeHoras(horasPerfil),
    maxFrancosDia: p.max_francos_dia, finDomingoAnteriorPorId: fins,
  } }, ctxCiclo)
  const baseline_ms = performance.now() - t0
  const r: ResultadoSemanal = a.resultadoV2
  return {
    escenario: caso.escenario, profile, baseline_ms, cicloA: a.ciclo, referencia_validada_a: a.elegibleHibrido,
    input: { ...input, fin_domingo_anterior: finDomingo, cycle: { id: inicio, start: inicio, end: sumarDias(inicio,27), previous_id: sumarDias(inicio,-28) } },
    history_segments: caso.simulated ? {
      kind: 'simulated', branch_id: sucursalId, as_of: lunes, absences: caso.absences ?? [],
      versions: oficiales.flatMap(h => (h.replacement ? [h.jornadas,h.replacement] : [h.jornadas]).map((jornadas, i) => ({
        id: `${h.week}-${i}`, branch_id: sucursalId, week: h.week, cycle_id: idAnterior(h.week),
        scope: 'offline', state: 'SIMULADA_EFECTIVA', jornadas,
      }))),
      segments: tramos.map(t => ({ branch_id: sucursalId, version_id: t.versionId, start: t.desde, effective_end: t.hastaEfectivo })),
    } : manifiestoHistorial(ctxCiclo, new Map(versiones.flatMap(v => v.semana.horarios.map(h => [h.colaboradorId,h.colaboradorId] as const)))),
    baseline: { jornadas_full: r.jornadas_full, jornadas_part: r.jornadas_part, asignacion_aux: r.asignacion_aux, asignacion_eventual: r.asignacion_eventual },
  }
}

it.skipIf(!origen || !destino)('regenera referencias A con los mismos escenarios y domingo que B', () => {
  mkdirSync(destino!, { recursive: true })
  const archivos = readdirSync(origen!).filter(n => /\.json$/.test(n)).sort()
  expect(archivos).toHaveLength(200)
  for (const [i, archivo] of archivos.entries()) {
    const caso = JSON.parse(readFileSync(join(origen!, archivo), 'utf8')) as Caso
    writeFileSync(join(destino!, archivo), JSON.stringify(exportar(caso, i)))
  }
}, 240_000)

const peticion = process.env.AH2_CICLOS_PETICION
const respuesta = process.env.AH2_CICLOS_RESPUESTA
it.skipIf(!peticion || !respuesta)('genera una semana offline a partir de su propio historial efectivo simulado', () => {
  const { caso, inicio } = JSON.parse(readFileSync(peticion!, 'utf8')) as { caso: Caso; inicio: string }
  expect(caso.simulated).toBe(true)
  writeFileSync(respuesta!, JSON.stringify(exportar(caso, 0, inicio)))
}, 60_000)

const cadena = process.env.AH2_CICLOS_CADENA
it.skipIf(!origen || !cadena)('ejecuta 16 semanas encadenadas con cuatro ciclos explícitos', () => {
  mkdirSync(cadena!, { recursive: true })
  const caso = JSON.parse(readFileSync(join(origen!, 'serie-100.json'), 'utf8')) as Caso
  const history: Caso['history'] = []
  for (let i = 0; i < 16; i++) {
    const semana = sumarDias('2026-11-02', i*7)
    const inicio = sumarDias('2026-11-02', Math.floor(i/4)*28)
    const demanda = caso.input.demanda.map((f,d) => f.map((n,s) => i % 4 === 1 && s >= 20 && s <= 28 ? n + 2 :
      i % 4 === 2 && d >= 5 && s >= 8 && s <= 13 ? n + 1 : n))
    const sinPart = i === 5 ? caso.input.colaboradores.find(c => c.rol === 'PART')?.id : undefined
    const colaboradores = caso.input.colaboradores.filter(c => c.id !== sinPart)
    const excepciones = (caso.input.excepciones ?? []).filter(x => colaboradores.some(c => c.nombre === x.colaboradorNombre))
    const r = exportar({ ...caso, escenario: 'cadena-' + semana, input: { ...caso.input, semana, demanda, colaboradores, excepciones }, history },
      0, inicio)
    if (r.referencia_validada_a) {
      const jornadas = { ...r.baseline.jornadas_full, ...r.baseline.jornadas_part }
      history.push({ branch_id: caso.profile.branch_id, week: semana, jornadas, ...(i === 6 ? { replacement: jornadas } : {}) })
    }
    writeFileSync(join(cadena!, `cadena-${semana}.json`), JSON.stringify(r))
  }
}, 120_000)
