import { it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { generarPDF } from '../exportPDF'
import { fechasDeSemana } from '../pomContrato'
import type { Colaborador, Auxiliar, Eventual, ResultadoAsignacion } from '../../types'
const folder = process.env.AH2_QA_DIR
it.skipIf(!folder)('render local de la semana con nombres sustituidos', () => {
  const input: {
    metricas: Pick<ResultadoAsignacion, 'coberturaFranjas' | 'faltantesFranjas' | 'porcentajeCobertura'> & { necesidadFranjas?: number[][] };
    horarios: ResultadoAsignacion['horarios'];
    cajaAux?: ResultadoAsignacion['cajaAux']; cajaEventual?: ResultadoAsignacion['cajaEventual'];
    roster: (Colaborador & Auxiliar & Eventual & { grupo: string })[];
  } = JSON.parse(readFileSync(folder + '/real.local.json', 'utf8'))
  const resultado: ResultadoAsignacion = { ...input.metricas, horarios: input.horarios, cajaAux: input.cajaAux ?? [], cajaEventual: input.cajaEventual ?? [], alertas: [] }
  const cajeros: Colaborador[] = input.roster.filter(r => r.grupo === 'cajero')
  const aux: Auxiliar[] = input.roster.filter(r => r.grupo === 'auxiliar')
  const ev: Eventual[] = input.roster.filter(r => r.grupo === 'eventual')
  const pdf = generarPDF(resultado, cajeros, 'Semana 47', aux, ev, { sucursal: '091', fechas: fechasDeSemana('2026-11-16'), version: 1, necesidadFranjas: input.metricas.necesidadFranjas })
  writeFileSync(folder + '/' + (process.env.AH2_QA_TAG || 'candidato') + '.pdf', Buffer.from(pdf.output('arraybuffer')))
})
