# INTERFAZ LEGACY — algoritmoAsignacion.ts

## Firma de la función principal

```typescript
export function generarHorariosDeterministicos(
  necesidad: Franja[],
  cajeros: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  _fechas: string[],
  excepciones: ExcepcionSemanal[]
): ResultadoAsignacion
```

## Archivos que importan esta función

1. `src/utils/iaAsignacion.ts` línea 3:
   ```ts
   import { generarHorariosDeterministicos } from './algoritmoAsignacion'
   ```
2. `src/utils/iaAsignacion.ts` línea 70:
   ```ts
   const resultado = generarHorariosDeterministicos(...)
   ```

## Tipo de retorno `ResultadoAsignacion`

Definido en `src/types/index.ts`:

```typescript
export interface ResultadoAsignacion {
  horarios: HorarioColaborador[];           // lista de horarios por colaborador
  coberturaFranjas: number[][];             // [franja][dia] = cajeros asignados
  faltantesFranjas: number[][];             // [franja][dia] = diferencia (negativo = falta)
  alertas: string[];                        // mensajes de advertencia
  porcentajeCobertura: number;              // % de franjas cubiertas
}
```

### Estructura de `HorarioColaborador`

```typescript
export interface HorarioColaborador {
  colaboradorId: string;
  jornadas: JornadaAsignada[];  // 7 elementos, uno por día
  totalHoras: number;
  errores: string[];
  rolGeneral: 'cajero' | 'aux_supervisor' | 'aux_eventual' | 'eventual_sector';
}
```

### Estructura de `JornadaAsignada`

```typescript
export interface JornadaAsignada {
  dia: number;           // 0=lunes ... 6=domingo
  turnos: Turno[];       // 1 turno para PART/corrido, 2 para cortado
  horas: number;
  esFranco: boolean;
  rol: 'cajero' | 'aux_supervisor' | 'aux_cierre' | 'aux_eventual' | 'eventual_sector' | 'franco' | 'franco_medio';
}
```

### Estructura de `Turno`

```typescript
export interface Turno {
  inicio: string; // HH:MM
  fin: string;    // HH:MM
}
```

## Dependencias de tipos

- `Franja`, `Colaborador`, `Auxiliar`, `Eventual`, `ExcepcionSemanal` también definidos en `src/types/index.ts`.

## Flujo de llamadas

```
NuevaSemanaPage.tsx → useAsignacion → asignarHorariosConIA → generarHorariosDeterministicos
```

## Notas de migración

La nueva interfaz `ResultadoSemanal` (definida en `src/algoritmo/types.ts`) difiere en:
- Organiza jornadas por rol (`jornadas_full`, `jornadas_part`, `asignacion_aux`, `asignacion_eventual`).
- Incluye métricas de cobertura detalladas (`MetricasCobertura`).
- Incluye reporte de reglas duras (`ReporteReglas`).
- No incluye `alertas` como array de strings; las advertencias van en `reporte_reglas.advertencias`.
- No incluye `faltantesFranjas` como matriz separada; se deriva de `metricas.deficit_por_slot`.
- No incluye `porcentajeCobertura` directo; se deriva de `metricas.cobertura_total_pct`.

La adaptación deberá mapear el nuevo resultado al formato esperado por la UI (si es necesario) o actualizar la UI para consumir el nuevo formato.