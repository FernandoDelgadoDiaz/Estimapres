# Integración híbrida A + CP-SAT B: laboratorio v1

**20/11/2026 · Claude · Solo laboratorio.**
- La generación híbrida productiva **no** está habilitada.
- No hay persistencia oficial ni servicio desplegado.
- No hay red: el transporte de prueba es un proceso local.
- Todos los datos son sintéticos.

Autoridad: contrato `docs/INTEGRACION_HIBRIDA_WORK_CLAUDE.md` §4–5 y MASTER.

## 1. Auditoría del contrato de datos A ↔ B

| Aspecto | Hallazgo | Resolución |
|---|---|---|
| Entrada | `InputAlgoritmo` (A) y la entrada de `validate_input` (B) comparten nombres y unidades en 25 campos: demanda, colaboradores, matrices AUX/EVENTUAL, contratos, reglas operativas, política de recursos, perfiles de caja EVENTUAL, comparabilidad, condiciones del supervisor, sucursal y semana. | Lista blanca explícita en `src/hibrido/contrato.ts` (`aEntradaB`). |
| Antecedente dominical | A usa `inicio_minimo_lunes_por_colaborador`; B usa `fin_domingo_anterior`. | Conversión exacta: `fin = inicio + 24` franjas. Hay prueba. |
| Campos solo de A | Semillas, impacto de horas, campos experimentales, objetivo de cobertura y auditorías compiladas. | No se envían: no cambian las reglas que B debe cumplir. |
| Campos desconocidos | Antes se perdían en silencio. | `CAMPOS_NO_TRANSPORTABLES`: se informa el conflicto y **no** se llama a B. |
| Integridad | No había versión ni huella de la entrada. | Sobre `aliada-hibrido/1` con SHA-256 de la forma canónica de la entrada. El hash es idéntico en TypeScript y Python, verificado con el sobre de referencia generado por B. |
| Salida de B | El formato del plan coincidía, pero no se validaba en A. | `validarRespuesta`: rechaza versión, id, hash, estado, `publicable`, plan ausente con OPTIMAL/FEASIBLE, dotación, ids de apoyo, matrices y bloques fuera de rango. |

## 2. Transporte

- **Interfaz:** `TransporteB = (sobre) => Promise<unknown>`, inyectable (`src/hibrido/transporte.ts`). La aplicación no importa ninguna implementación.
- **Laboratorio:** `transporteProceso` (`src/hibrido/transporteProceso.ts`, solo Node). Ejecuta `python -m optimizer.contrato` (aliada-optimizer) por stdin/stdout.
  - Mata el proceso al vencer el plazo.
  - No usa red, archivos temporales ni persistencia.
- **Lado B:** `optimizer/contrato.py`.
  - Valida el sobre: forma, versión, id, hash, parámetros y un tamaño máximo de 2 MB.
  - Responde con estado `OPTIMAL | FEASIBLE | UNKNOWN | INFEASIBLE | DATOS_INCOMPLETOS | ERROR_CONTRATO | ERROR_INTERNO`.
  - **Nunca** devuelve trazas ni datos de la entrada (solo el hash), y `publicable` es siempre `false`.
- **Pendiente:** el transporte productivo (worker o servicio) requiere decidir alojamiento, costos, autenticación, cola y limpieza de datos. No se eligió ni se contrató nada.

## 3. Orquestador y salida única (`src/hibrido/orquestador.ts`)

1. Se compilan los perfiles de caja EVENTUAL (AH2-037).
2. **A se calcula siempre primero** y queda como respaldo determinístico.
3. Si hay transporte, se arma el sobre y se llama a B con un **timeout** (`conTimeout`).
4. La respuesta se valida contra el contrato y el plan de B se convierte a la forma de A.
5. **Validación independiente** de cada candidato con los validadores de A: `auditarEscenario`, que incluye la regla de totales AH2-040 del modo activo, y `verificarDisponibilidadCaja`.
6. **Selección:**
   - nunca se usa un candidato con infracciones operativas o normativas;
   - B se elige solo si es válido y **estrictamente** mejor que A en faltantes → sobrantes → horas EVENTUAL; en empate se queda A;
   - si ningún candidato es válido, **no hay propuesta**;
   - timeout, error de transporte, respuesta inválida, INFEASIBLE o UNKNOWN de B → A válido, con el motivo registrado.
7. **Salida única** `aliada-salida-unica/1`:
   - marcas `noOficial: true` y `publicable: false`;
   - origen, motivo de selección, estado y fases de B, hash;
   - propuesta semanal y % de cobertura POM;
   - faltantes y sobrantes por franja;
   - horas por persona (contrato o presencia, caja, reservas de función habitual, disponibilidad y saldo);
   - conflictos con su origen (A, B, transporte, contrato o datos);
   - condiciones **DEBE/PREFERIRÍA** solicitadas y auditoría aplicada;
   - diagnósticos de disponibilidad EVENTUAL;
   - comparabilidad AH2-040: modo, relaciones, incumplimientos y estado «activación definitiva BLOQUEADA».
8. **PDF A4 de prueba** (`src/hibrido/pdfPrueba.ts`):
   - cada página lleva «PRUEBA NO OFICIAL — NO PUBLICAR»;
   - secciones: resumen, horas por persona, faltantes y sobrantes por franja, conflictos, condiciones, disponibilidad EVENTUAL y relaciones AH2-040;
   - muestra sintética versionada: `docs/evidencia/salida-unica-sintetica.json`;
   - el PDF no se versiona (`*.pdf` está en `.gitignore`) y se regenera con `AH2_HIBRIDO_OUT=docs/evidencia npx vitest run src/hibrido`.

## 4. Pruebas

| Área | Cobertura |
|---|---|
| **A** `src/hibrido/__tests__/hibrido.test.ts` (12) | Canónico y hash iguales a Python; lista blanca y mapeo dominical; 9 rechazos de respuesta; sin transporte → A; B mejor y válido → B, con la suma de faltantes por franja igual al total; empate → A; timeout, error de transporte, hash distinto, INFEASIBLE y UNKNOWN → A; B que viola la regla de totales → nunca se usa; sin candidato válido → sin propuesta; condiciones DEBE y PREFERIRÍA; reservas EVENTUAL; PDF A4 con la marca en cada página. |
| **Proceso real** (en la misma suite) | A → sobre → CP-SAT → validación A → selección, y plazo vencido que mata el proceso. Se ejecuta solo si `../aliada-optimizer` y OR-Tools están presentes; en la CI de Estimapres queda omitido. |
| **B** `tests/test_contrato.py` (5) | Hash de referencia; errores de contrato; fallos del solver sin trazas; JSON inválido; proceso aislado real con OPTIMAL e INFEASIBLE. |

## 5. Lo que falta para una prueba operativa privada en la 091

1. Decisión de homologación de AH2-040 (`docs/AH2-040_COMPARABILIDAD.md` §5.4).
2. Elegir y autorizar dónde corre B: worker o servicio, con sus costos.
3. Conectar la interfaz al orquestador con el progreso visible, sin aprobar ni publicar automáticamente.
4. Datos reales de la 091 solo en un entorno privado autorizado, nunca en GitHub.
