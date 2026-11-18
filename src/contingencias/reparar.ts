import {
  type Bloques, type PlanReparacion, type SolicitudContingencia, bloques, franjas, cantidadBloques,
  indices, dias, slots, comoSlot, igual, manana, preparar, medir, mejora, puntaje, opcionesApoyo
} from './modelo'

const copiar = <T>(o: T): T => structuredClone(o)
type Contexto = ReturnType<typeof preparar>

function permite(c: Contexto, id: string, d: number, b: Bloques) {
  const nombre = c.p.colaboradores.find(p => p.id === id)!.nombre
  for (const e of c.p.excepciones?.filter(e => e.colaboradorNombre === nombre) ?? []) {
    if (e.tipo === 'franco_dia' && (d === Number(e.valor)) !== !b.length) return false
    if (!b.length) continue
    const inicio = b[0][0], fin = b[b.length - 1][1]
    if (e.tipo === 'no_antes_de' && e.valor && inicio < comoSlot(e.valor)) return false
    if (e.tipo === 'no_despues_de' && e.valor && fin > comoSlot(e.valor)) return false
    if (e.tipo === 'solo_matutino' && inicio > 4) return false
    if (e.tipo === 'solo_nocturno' && inicio < 18) return false
    if (e.tipo === 'siempre_cierre' && !manana(b) && fin < 28) return false
  }
  return true
}

function reponerApoyo(plan: PlanReparacion, c: Contexto) {
  const { p, modificable } = c
  const normal = indices(dias).map(d => indices(slots).map(s =>
    Object.entries(plan.jornadas).filter(([i,w]) => !c.ausente(i,d) && franjas(bloques(w[d])).includes(s)).length))
  for (const tabla of [plan.AUX,plan.EVENTUAL]) for (const w of Object.values(tabla)) {
    for (const d of indices(dias).filter(i => modificable[i])) w[d] = []
  }
  for (const d of indices(dias).filter(i => modificable[i])) {
    const ops = opcionesApoyo(c,d).franjas
    const primero = ops[0].aux.find(i => c.base.AUX[i][d].includes(0)) ?? ops[0].aux[0]
    for (const s of indices(slots)) {
      const o = ops[s]
      let residual = Math.max(0,p.demanda[d][s] - normal[d][s])
      if (s < 2 && p.apertura_solo_aux !== false) {
        if (primero) plan.AUX[primero][d].push(s)
        continue
      }
      const ordenar = (tabla: typeof plan.AUX, ids: string[]) => [...ids].sort((a,b) =>
        Number(tabla[b][d].includes(s)) - Number(tabla[a][d].includes(s)) || a.localeCompare(b))
      for (const id of ordenar(c.base.AUX,o.aux).slice(0,Math.min(o.cap,residual))) {
        plan.AUX[id][d].push(s)
        residual--
      }
      for (const id of ordenar(c.base.EVENTUAL,o.ev)) {
        const w = plan.EVENTUAL[id]
        if (!residual) break
        if (w.reduce((n,dia) => n+dia.length,0) >= (p.max_caja_eventual_slots?.[id] ?? 210) ||
            cantidadBloques([...w[d],s]) > (p.max_bloques_caja_eventual_dia ?? 30)) continue
        w[d].push(s)
        residual--
      }
    }
  }
  return plan
}

export function validarLocal(s: SolicitudContingencia, plan: PlanReparacion) {
  const c = preparar(s)
  const errores: string[] = []
  const inicial = medir(c.base,c).faltantes
  if (medir(plan,c).faltantes.some((r,d) => r.some((n,i) => n > inicial[d][i]))) errores.push('Traslada faltante a otra franja')
  for (const [id,w] of Object.entries(plan.jornadas)) {
    let fin = c.p.fin_domingo_anterior?.[id]
    for (const d of indices(dias)) {
      const b = bloques(w[d]), anterior = bloques(c.base.jornadas[id][d])
      if (!c.modificable[d] && !igual(b,anterior)) errores.push('Jornada congelada')
      if (c.modificable[d] && c.ausente(id,d) && b.length) errores.push('Jornada en ausencia')
      if (c.modificable[d] && !c.ausente(id,d) && (!permite(c,id,d,b) ||
        manana(b) !== manana(anterior) || !igual(b.map(([a,z]) => z-a),anterior.map(([a,z]) => z-a)) ||
        b.some(([a,z]) => a < (c.p.apertura_solo_aux === false ? 0 : 2) || z > slots) ||
        (b.length === 2 && b[0][0] > 3) || b.some(([a],i) => i > 0 && a-b[i-1][1] < 8))) errores.push('Jornada fuera del perfil')
      const efectiva = c.ausente(id,d) ? [] : b
      if (efectiva.length && fin !== undefined && efectiva[0][0] + 48 - fin < 24) errores.push('Descanso insuficiente')
      fin = efectiva[efectiva.length - 1]?.[1]
      if (d === 6 && !igual(b,anterior) && !c.ausente(id,d)) {
        const sig = s.aperturaSiguiente?.[id]
        if (sig === undefined || (sig !== null && fin !== undefined && sig + 48 - fin < 24)) errores.push('Límite intersemanal sin validar')
      }
    }
  }
  for (const d of indices(dias).filter(i => c.modificable[i])) {
    const ops = opcionesApoyo(c,d)
    if (!ops.supervision) errores.push('Supervisión de cajas sin cobertura')
    const caja = indices(slots).map(s => Object.entries(plan.jornadas).filter(([id,w]) =>
      !c.ausente(id,d) && franjas(bloques(w[d])).includes(s)).length)
    for (const slot of indices(slots)) {
      const o = ops.franjas[slot]
      const a = Object.keys(plan.AUX).filter(id => plan.AUX[id][d].includes(slot))
      const e = Object.keys(plan.EVENTUAL).filter(id => plan.EVENTUAL[id][d].includes(slot))
      if (a.some(id => !o.aux.includes(id)) || e.some(id => !o.ev.includes(id)) || a.length > o.cap) errores.push('Apoyo no disponible')
      if (slot < 2 && c.p.apertura_solo_aux !== false) {
        if (caja[slot] || a.length !== 1 || !plan.AUX[a[0]]?.[d].includes(1-slot)) errores.push('Apertura sin responsable')
      } else if (slot < 2 && c.p.demanda[d][slot] && !caja[slot]) errores.push('Apertura sin cajero')
      else if (a.length+e.length > Math.max(0,c.p.demanda[d][slot]-caja[slot]) ||
        (e.length && a.length < Math.min(o.cap,o.aux.length))) errores.push('Orden de apoyo o exceso evitable')
    }
  }
  for (const rol of ['AUX','EVENTUAL'] as const) for (const [id,w] of Object.entries(plan[rol])) {
    if (w.some((r,d) => !c.modificable[d] && !igual(r,c.base[rol][id][d]))) errores.push('Apoyo congelado')
    if (rol === 'EVENTUAL' && (w.some(r => cantidadBloques(r) > (c.p.max_bloques_caja_eventual_dia ?? 30)) ||
        w.reduce((n,r) => n+r.length,0) > (c.p.max_caja_eventual_slots?.[id] ?? 210))) errores.push('Tope eventual')
  }
  return [...new Set(errores)]
}

export function repararA(s: SolicitudContingencia) {
  const c = preparar(s)
  const antes = medir(c.base,c)
  const base = copiar(c.base)
  for (const [id,w] of Object.entries(base.jornadas)) for (const d of indices(dias)) {
    if (c.modificable[d] && c.ausente(id,d)) w[d].bloques = []
  }
  let plan = reponerApoyo(base,c)
  // Se conserva cada duración diaria y franco. La búsqueda cambia la ubicación del turno
  // completo y recalcula las dos pasadas de apoyo. El comparador mide el cambio efectivo.
  let errores = validarLocal(s,plan)
  let datos = medir(plan,c)
  for (let pasada = 0; pasada < 2; pasada++) {
    const fija = plan
    for (const [id,w] of Object.entries(fija.jornadas)) for (const d of indices(dias)) {
      if (!c.modificable[d] || c.ausente(id,d) || !w[d].bloques.length) continue
      const original = bloques(w[d])
      for (const delta of [-2,-1,1,2]) {
        const nuevo: Bloques = original.map(([a,z]) => [a+delta,z+delta])
        if (manana(nuevo) !== manana(original) || nuevo.some(([a,z]) => a < (c.p.apertura_solo_aux === false ? 0 : 2) || z > slots)) continue
        const candidato = copiar(fija)
        candidato.jornadas[id][d].bloques = nuevo.map(([a,z]) => ({ slot_inicio: a,slot_fin: z }))
        reponerApoyo(candidato,c)
        const m = medir(candidato,c), v = validarLocal(s,candidato)
        if (!v.length && (errores.length || mejora(puntaje(m),puntaje(datos)))) {
          plan = candidato
          datos = m
          errores = v
        }
      }
    }
    if (plan === fija || datos.deficit === 0) break
  }
  return { plan, antes, despues: datos, errores, solicitud: JSON.stringify(s),
    desde: c.fechas.find((_,d) => c.modificable[d]) ?? null }
}
