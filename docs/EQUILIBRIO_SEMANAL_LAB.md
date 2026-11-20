# AH2-038: equilibrio semanal y protección de picos (laboratorio)

20/11/2026. La intención de producto está aprobada en MASTER AH2-032/038. Esta formulación es una implementación experimental para validar; no homologa políticas ni habilita publicación.

## Formulación implementada

Activación explícita: `equilibrio_semanal_version: 1`. Se usa en el laboratorio y en el ejecutor privado; ausente conserva el comportamiento anterior. El motor productivo no la activa.

1. Todas las restricciones obligatorias y de recursos se mantienen.
2. Minimizar faltantes totales.
3. Minimizar faltantes con los pesos de franja explícitos de la sucursal.
4. Minimizar sobrantes.
5. Proteger picos: día pico = máxima demanda diaria de la semana (todos los empates); franja pico = máximo de demanda dentro de su día o peso explícito mayor que uno. Se incluyen todas las franjas positivas del día pico. No hay umbral comercial, día fijo ni preferencia de fin de semana.
6. Minimizar déficit relativo diario en orden de peor a mejor día, comparando fracciones exactas. Un día sin demanda no entra en el cociente. Los desempates sucesivos evitan conservar una concentración evitable cuando el peor día empata.
7. Uso EVENTUAL y objetivos secundarios anteriores, en su orden original.

El costo de picos es `sum(faltante[d,s] * demanda[d,s] * demandaDiaria[d] * pesoLocal[s])` sobre las franjas identificadas. Son intensidades derivadas del POM, **no pesos comerciales aprobados**. La definición permanece experimental. La protección de picos precede al equilibrio; se informa su compensación: en el ensayo el día pico queda al 100 % y el déficit se reparte entre los restantes días.

A es referencia validada y respaldo. El sobre con hash incluye su plan; B lo revalida. Ningún candidato aceptado aumenta faltantes totales, faltantes ponderados, sobrantes ni el déficit de ninguna franja pico respecto de A. Las franjas restantes pueden intercambiar cobertura. Esto reemplaza únicamente para esta versión el guard histórico que congelaba el déficit de **todas** las franjas y hacía imposible redistribuirlo.

A y la selección híbrida recalculan las mismas métricas desde cada plan; no confían en un puntaje recibido de B. B utiliza rangos de todas las fracciones diarias alcanzables, ordenados exactamente. Red de ordenación y objetivos lexicográficos; los desempates se agrupan en base entera solo si su rango completo es menor que `2**50`. El peor déficit se resuelve por separado para que un presupuesto agotado durante desempates conserve una solución con el mejor peor día ya demostrado. No se redondean porcentajes para seleccionar. A sigue siendo la heurística existente; no se afirma que A resuelva por sí sola este nuevo objetivo.

## Ensayo real 091: misma entrada, 120 segundos

POM 23–29/11, 402 h, misma dotación, perfiles y reglas. Línea base reproducida antes de editar. Archivos personales fuera de ambos repositorios.

| Día | Demanda h | Faltantes base h | Faltantes nuevos h | Cobertura nueva |
|---|---:|---:|---:|---:|
| Lunes | 57,5 | 3 | 8 | 86,087 % |
| Martes | 57 | 1,5 | 8 | 85,965 % |
| Miércoles | 55 | 3 | 7,5 | 86,364 % |
| Jueves | 56 | 4 | 7,5 | 86,607 % |
| Viernes | 58 | 8 | 8 | 86,207 % |
| Sábado (pico) | 61 | 10 | 0 | 100 % |
| Domingo | 57,5 | 17,5 | 8 | 86,087 % |
| Total | 402 | 47 | 47 | 88,308 % |

- Peor déficit relativo: 30,435 % → 14,035 %. Costo de picos nuevo: 0.
- Cero sobrantes; 272 h FULL/PART, 39 h AUX y 44 h EVENTUAL. Infracciones de A y B: 0.
- Conserva exclusión manual, horas contractuales, supervisión, excepción 08–09, DIAS, topes 12/8, dos bloques diarios y corte 22:00.
- Fases faltantes, ponderados, sobrantes, picos y peor déficit relativo: OPTIMAL. Desempates siguientes: FEASIBLE al agotarse los 120 s. **Solución completa factible, no óptimo total certificado.** La prueba del mejor peor déficit es condicional a los objetivos anteriores y a las protecciones de A.
- Sin antecedente dominical: no se certifica descanso intersemanal ni conformidad jurídica.
- PDF privado A4 revisado visualmente; no se incorpora al repositorio.

## Evidencia técnica

Métricas/selección A: `src/hibrido/equilibrio.ts`, `orquestador.ts`, `contrato.ts`. B: `optimizer/weekly_balance.py`, `solver.py`, `selection.py`. Tests de picos en distintos días, demanda desigual/cero, cocientes exactos, empates, enumeración exhaustiva pequeña, prioridad AUX y topes.

Reproducir: `AH2_ENSAYO_DIR=<carpeta privada> AH2_ENSAYO_SEGUNDOS=120 npx vitest run src/hibrido/__tests__/ensayo-privado.local.test.ts`. Para reproducir el comportamiento base sin nuevo criterio: `AH2_EQUILIBRIO=0`. No repetir decisiones aprobadas ni subir archivos privados.
