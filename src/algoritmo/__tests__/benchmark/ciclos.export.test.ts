import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { PERFIL_HORAS_VIGENTE } from '../../contratos'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../../types'
import { perfilNormativoDesdeHoras } from '../../validadorIndependiente'
import { normalizarId } from '../../adapter'
import { HORAS_FRANJAS, type Auxiliar, type Colaborador, type Eventual, type HorarioColaborador } from '../../../types'
import { generarConCiclo } from '../../../utils/optimizacionCiclos'
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
  history: { branch_id: string; week: string; jornadas: Record<string, Jornada[]> }[]
}


function exportar(caso: Caso, i: number, inicioDeclarado?: string) {
  const { input: p, history, profile } = caso
  const sucursalId = profile.branch_id
  const lunes = p.semana
  const previo = history.find(h => h.week === sumarDias(lunes, -7))
  const inicio = inicioDeclarado ?? (i % 2 === 0 ? lunes : sumarDias(lunes, -7))
  // Fronteras declaradas para el experimento. Los casos pares empiezan un ciclo.
  const calendario: CicloPlanificacion[] = [sumarDias(inicio, -28), inicio].map((inicio, n) => ({
    id: String(n), sucursalId, nombre: `Ciclo ${n}`, inicio, fin: sumarDias(inicio, 27),
    modalidad: 'mensual', estado: n ? 'abierto' : 'cerrado', origen: 'sucursal',
  }))
  const idAnterior = (fecha: string) => fecha < inicio ? '0' : '1'
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
  const finDomingo = Object.fromEntries(Object.entries(previo?.jornadas ?? {}).flatMap(([id, semana]) => {
    const b = semana.find(j => j.dia === 6)?.bloques
    return b?.length ? [[id, b[b.length - 1].slot_fin]] : []
  }))
  const input = {
    ...p, max_bloques_caja_eventual_dia: 2, eventuales_caja_hora_limite: '22:00',
    inicio_minimo_lunes_por_colaborador: Object.fromEntries(Object.entries(finDomingo).map(([id, b]) => [id, Math.max(0, b - 24)])),
  }
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
  const horarios = horariosDe(previo)
  const oficiales = history.filter(h => h.week >= calendario[0].inicio && h.week < lunes)
  const versiones = oficiales.map(h => ({
    version: { id: h.week, sucursalId, cicloId: idAnterior(h.week), fechaLunes: h.week, numero: 1,
      estado: 'PUBLICADO' as const, ambito: 'servidor' as const, huellaEntradas: 'sintetica', creadaPor: 'fixture' },
    semana: { fechaLunes: h.week, horarios: horariosDe(h) },
  }))
  const tramos = oficiales.map(h => ({
    id: h.week, sucursalId, publicacionId: 'fixture', versionId: h.week, desde: h.week,
    hasta: sumarDias(h.week, 6), hastaEfectivo: sumarDias(h.week, 6),
  }))
  const t0 = performance.now()
  const a = generarConCiclo({ input, cajeros, auxiliares, eventuales, contexto: {
    necesidad, operativa, excepciones: p.excepciones ?? [], perfil: perfilNormativoDesdeHoras(horasPerfil),
    maxFrancosDia: p.max_francos_dia, semanaAnterior: horarios,
  } }, { sucursalId, lunes, calendario, historial: { versiones, tramos, desde: calendario[0].inicio, hasta: sumarDias(lunes, -1), hoy: lunes } })
  const baseline_ms = performance.now() - t0
  const r: ResultadoSemanal = a.resultadoV2
  return {
    escenario: caso.escenario, profile, baseline_ms, cicloA: a.ciclo,
    input: { ...input, fin_domingo_anterior: finDomingo, cycle: { id: '1', start: inicio, end: calendario[1].fin, previous_id: '0' } },
    history: oficiales.map(h => ({ ...h, cycle_id: idAnterior(h.week), state: 'effective' })),
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

const cadena = process.env.AH2_CICLOS_CADENA
it.skipIf(!origen || !cadena)('ejecuta cuatro semanas encadenadas con dos ciclos explícitos', () => {
  mkdirSync(cadena!, { recursive: true })
  const caso = JSON.parse(readFileSync(join(origen!, 'serie-100.json'), 'utf8')) as Caso
  const history: Caso['history'] = []
  for (const semana of ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']) {
    const demanda = caso.input.demanda.map(f => f.map((n, s) => semana === '2026-11-23' && s >= 20 && s <= 28 ? n + 2 : n))
    const r = exportar({ ...caso, escenario: 'cadena-' + semana, input: { ...caso.input, semana, demanda }, history },
      0, semana < '2026-11-30' ? '2026-11-02' : '2026-11-30')
    history.push({ branch_id: caso.profile.branch_id, week: semana, jornadas: { ...r.baseline.jornadas_full, ...r.baseline.jornadas_part } })
    writeFileSync(join(cadena!, `cadena-${semana}.json`), JSON.stringify(r))
  }
}, 40_000)
