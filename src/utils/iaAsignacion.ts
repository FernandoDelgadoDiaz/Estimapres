import Anthropic from '@anthropic-ai/sdk'
import { Franja, Colaborador, ResultadoAsignacion } from '../types'
import {
  validarDistribucionFull,
  validarJornadaCorridaPart,
  validarDescanso12h,
  validarDescanso3hBloques,
  validarHorasSemanales
} from './validaciones'

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function asignarHorariosConIA(
  necesidad: Franja[],
  colaboradores: Colaborador[],
  fechas: string[]
): Promise<ResultadoAsignacion> {

  const necesidadTexto = necesidad.map(f =>
    `${f.hora} | ${f.necesidad.join(' | ')}`
  ).join('\n')

  const colaboradoresTexto = colaboradores
    .filter(c => c.activo)
    .map(c => `- ${c.nombre} | ${c.tipo} | ${c.horasSemanales}h`)
    .join('\n')

  const prompt = `
Sos un experto en programación de turnos de cajeros de supermercado.
Tu tarea es generar un horario semanal óptimo dado la necesidad de
cajas por franja horaria y la dotación disponible.

REGLAS OBLIGATORIAS:
- Franjas de 30 minutos entre 07:00 y 22:00
- Cada colaborador trabaja 6 días y tiene exactamente 1 franco por semana
- Mínimo 12 horas de descanso entre fin de jornada e inicio del día siguiente. Fin 22:00 → inicio siguiente mínimo 10:00. Fin 23:00 → inicio siguiente mínimo 11:00. Verificar TODOS los pares de días consecutivos antes de devolver el JSON.
- Máximo 2 colaboradores con franco el mismo día
- Los AUX deben tener francos en días distintos entre sí

CAJEROS FULL (48h semanales):
- Distribución EXACTA: 3 jornadas de 9h + 2 jornadas de 8h + 1 jornada de 5h = 48h
- Pueden tener turno corrido o cortado
- Si es cortado: mínimo 3h de descanso entre bloques

CAJEROS PART (32h semanales sin excepción):
- SOLO turno corrido (un único bloque continuo por día, sin cortes)
- Cada PART debe trabajar exactamente 32h semanales sin excepción.
- Ignorar las horas contractuales del listado, siempre usar 32h.
- Distribuir en 6 días, turno corrido, entre 4h y 8h por día.

AUXILIARES SUPERVISORES AUX (48h semanales):
- Mismas reglas que FULL (3x9h + 2x8h + 1x5h)
- Usar SOLO si con FULL + PART no alcanza a cubrir la necesidad

PRIORIDAD: Primero cubrir con FULL, luego PART, luego AUX si es necesario.

DÍAS DE LA SEMANA: 0=lunes, 1=martes, 2=miércoles, 3=jueves, 4=viernes, 5=sábado, 6=domingo
FECHAS DE ESTA SEMANA: ${fechas.join(', ')}

NECESIDAD DE CAJAS POR FRANJA (horario | lun | mar | mié | jue | vie | sáb | dom):
${necesidadTexto}

COLABORADORES DISPONIBLES:
${colaboradoresTexto}

Generá el horario semanal completo que cubra la mayor cantidad de
franjas posible respetando todas las reglas.

PRIORIDAD DE COBERTURA:
Las franjas más críticas a cubrir son las de TARDE-NOCHE (17:00-22:00)
todos los días, especialmente sábado y domingo donde la necesidad
llega a 6-7 cajeros simultáneos.
Al asignar turnos, priorizar que la mayoría del personal esté
disponible entre 14:00 y 22:00.
Los turnos matutinos (08:00-14:00) tienen menor necesidad (1-4 cajeros)
y pueden cubrirse con menos personal.

ORDEN DE TURNOS EN JSON:
Cuando un colaborador tiene turno cortado (2 bloques), los turnos
deben estar ordenados cronológicamente: primero el bloque más
temprano, luego el más tardío.
Ejemplo correcto: [{"inicio":"09:00","fin":"14:00"},{"inicio":"18:00","fin":"22:00"}]
Ejemplo incorrecto: [{"inicio":"18:00","fin":"22:00"},{"inicio":"09:00","fin":"14:00"}]

Respondé ÚNICAMENTE con un JSON válido con esta estructura exacta,
sin texto adicional, sin markdown, sin explicaciones:

{
  "horarios": [
    {
      "colaboradorNombre": "NOMBRE EXACTO IGUAL AL LISTADO",
      "jornadas": [
        {
          "dia": 0,
          "esFranco": false,
          "turnos": [{"inicio": "HH:MM", "fin": "HH:MM"}],
          "horas": 8
        },
        {
          "dia": 1,
          "esFranco": true,
          "turnos": [],
          "horas": 0
        }
      ],
      "totalHoras": 48
    }
  ]
}

IMPORTANTE:
- Incluir los 7 días (0 al 6) para cada colaborador
- Para día franco: esFranco=true, turnos=[], horas=0
- Para PART: turnos siempre tiene exactamente 1 elemento por día activo
- Para FULL/AUX con turno cortado: turnos tiene 2 elementos
- Los horarios deben estar entre 07:00 y 22:00
- Verificar que cada colaborador cumpla exactamente sus horas semanales
`

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  })

  const texto = response.content[0].type === 'text'
    ? response.content[0].text
    : ''

  return parsearRespuestaIA(texto, necesidad, colaboradores)
}

function parsearRespuestaIA(
  texto: string,
  necesidad: Franja[],
  colaboradores: Colaborador[]
): ResultadoAsignacion {
  const limpio = texto
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()

  let datos: any
  try {
    datos = JSON.parse(limpio)
  } catch {
    throw new Error('Claude devolvió un JSON inválido. Intentá de nuevo.')
  }

  const horarios = datos.horarios.map((h: any) => {
    const colaborador = colaboradores.find(
      c => c.nombre.toLowerCase() === h.colaboradorNombre.toLowerCase()
    )
    return {
      colaboradorId: colaborador?.id ?? h.colaboradorNombre,
      jornadas: h.jornadas,
      totalHoras: h.totalHoras,
      errores: []
    }
  })

  // Validaciones de reglas
  const alertasValidacion: string[] = []
  horarios.forEach((horario: any, _index: number) => {
    const colaborador = colaboradores.find(c => c.id === horario.colaboradorId)
    if (!colaborador) return
    const { tipo, horasSemanales } = colaborador
    let errores: string[] = []

    if (tipo === 'FULL' || tipo === 'AUX') {
      errores = [
        ...validarDistribucionFull(horario.jornadas),
        ...validarDescanso12h(horario.jornadas),
        ...validarHorasSemanales(horario.jornadas, horasSemanales, tipo),
      ]
      // Validar descanso entre bloques para jornadas cortadas
      horario.jornadas.forEach((j: any) => {
        if (j.turnos.length > 1) {
          errores.push(...validarDescanso3hBloques(j.turnos))
        }
      })
    } else if (tipo === 'PART') {
      errores = [
        ...validarJornadaCorridaPart(horario.jornadas),
        ...validarDescanso12h(horario.jornadas),
        ...validarHorasSemanales(horario.jornadas, 32, tipo), // PART max 32h
      ]
    }
    // Validar franco (ya incluido en validarDistribucionFull para FULL/AUX, pero agregamos para PART)
    const francos = horario.jornadas.filter((j: any) => j.esFranco).length
    if (francos !== 1) {
      errores.push(`Debe tener exactamente 1 franco (tiene ${francos})`)
    }
    horario.errores = errores
    if (errores.length > 0) {
      alertasValidacion.push(...errores.map(e => `${colaborador.nombre}: ${e}`))
    }
  })

  const coberturaFranjas = necesidad.map(() => Array(7).fill(0))
  const faltantesFranjas = necesidad.map((f) => f.necesidad.map(n => n))

  horarios.forEach((horario: any) => {
    horario.jornadas.forEach((jornada: any) => {
      if (jornada.esFranco || !jornada.turnos.length) return
      jornada.turnos.forEach((turno: any) => {
        const inicioMin = timeToMinutes(turno.inicio)
        const finMin = timeToMinutes(turno.fin)
        necesidad.forEach((franja, fi) => {
          const franjaMin = timeToMinutes(franja.hora)
          if (franjaMin >= inicioMin && franjaMin < finMin) {
            coberturaFranjas[fi][jornada.dia]++
            faltantesFranjas[fi][jornada.dia]--
          }
        })
      })
    })
  })

  let franjasCubiertas = 0
  let franjasConNecesidad = 0
  for (let fi = 0; fi < necesidad.length; fi++) {
    for (let di = 0; di < 7; di++) {
      const nec = necesidad[fi].necesidad[di]
      if (nec > 0) {
        franjasConNecesidad++
        if (coberturaFranjas[fi][di] >= nec) franjasCubiertas++
      }
    }
  }
  const porcentajeCobertura = franjasConNecesidad > 0
    ? Math.round((franjasCubiertas / franjasConNecesidad) * 100)
    : 100

  const alertas: string[] = []
  necesidad.forEach((franja, fi) => {
    franja.necesidad.forEach((nec, di) => {
      const diff = nec - coberturaFranjas[fi][di]
      if (diff > 0) {
        const dias = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']
        alertas.push(`Falta ${diff} cajero(s) en ${franja.hora} el ${dias[di]}`)
      }
    })
  })
  // Agregar alertas de validación
  if (alertasValidacion.length > 0) {
    alertas.push(...alertasValidacion)
  }

  return {
    horarios,
    coberturaFranjas,
    faltantesFranjas,
    alertas,
    porcentajeCobertura
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}