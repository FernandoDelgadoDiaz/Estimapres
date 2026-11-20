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

---

## 6. Integración operativa de laboratorio (20/11/2026, segunda entrega)

### 6.1 Interfaz

Página única de laboratorio: `lab-condiciones.html`. Se extendió la existente; no se creó una paralela. El flujo tiene cinco pasos:

1. **POM y dotación.** Se puede elegir:
   - demostración de un cajero;
   - demostración de una sucursal sintética con AUX y EVENTUALES;
   - archivo JSON local, leído en el navegador (`src/hibrido/paquete.ts`). Acepta el paquete de pantalla `aliada-lab-paquete/1`, que pasa por el **mismo** `convertirInputAV2` de la aplicación, o la entrada del motor.
2. **Condiciones DEBE/PREFERIRÍA** por colaborador. Se reutilizan el preflight existente y los mensajes de conflicto.
3. **Generar:** A + CP-SAT, o solo A si no hay CP-SAT local. Muestra el **progreso real** con tiempos: preparación, A, sobre enviado, cada fase de CP-SAT al terminar, respuesta, validación independiente y selección. Permite cancelar.
4. **Propuesta única:**
   - origen y motivo;
   - **bloqueos de política** destacados;
   - cobertura POM, faltantes y sobrantes;
   - horarios de la semana: FULL/PART, AUX (caja o supervisa) y EVENTUAL;
   - horas-caja por persona;
   - supervisión AUX por día;
   - AH2-040: pares EVENTUAL ≤ AUX con horas, EVENTUAL sin AUX comparable, faltantes atribuibles a la regla y faltantes imposibles por falta de personal;
   - faltantes por franja y conflictos.
5. **Descargar PDF no oficial** (A4, marca en cada página).

### 6.2 Política v1 de laboratorio y motores

**Política (`src/hibrido/politica.ts` ↔ `optimizer/contrato.py`):** con `politica_recursos_version = 1` y sin modo explícito, la comparabilidad es **DIAS**. Solo la aplica el flujo de laboratorio: el motor productivo y el comportamiento heredado no cambian.

**Motor A bajo la política:** `motorAConPolitica` usa `ejecutarAH2040`.
- **Defecto corregido:** el orquestador llamaba a `ejecutarAlgoritmo`, que en política v1 deja en **0 h** a todo EVENTUAL sin tope explícito.
- Ahora el EVENTUAL queda acotado por la regla DIAS y por su perfil.

**Preflight coherente con B:** con un modo de comparación vigente, la pasada 2 ya no emite «comparación pendiente» (`pasada2-auxiliares.ts`), igual que `support.static_violations` de B. Sin modo, el bloqueo se conserva.

### 6.3 Ejecución de CP-SAT desde la interfaz

Middleware **solo de `vite dev`** (`src/hibrido/servidorLab.ts`, `pluginLabCpSat` en `vite.config.ts`):
- se activa únicamente con `AH2_LAB_CPSAT_DIR`;
- acepta solo conexiones loopback y sobres de 2 MB como máximo;
- usa `python -m optimizer.contrato --progreso`;
- responde en NDJSON (progreso por fase y respuesta);
- mata el proceso si el cliente cancela o vence el plazo.

**No forma parte del build:** `dist/` contiene solo `index.html`, sin `child_process` ni rutas `/__lab`.

**Navegador:** `transporteHttpLab` lee el NDJSON en streaming.

### 6.4 Pruebas

| Prueba | Qué verifica |
|---|---|
| `src/hibrido/__tests__/laboratorio.test.ts` (6) | Política DIAS solo en v1 y sin modo explícito; A con DIAS usa EVENTUALES sin tope cero y valida. Orden y monotonía del progreso; supervisión, comparables, sin comparable y atribución. Bloqueos de tres o más AUX y de apertura con AUX único. Carga de paquete y de entrada del motor con errores. Servidor HTTP con CP-SAT real: estado, 405, 413, al menos 3 fases en vivo y OPTIMAL. |
| `e2e/hibrido.e2e.ts` (2) | (a) Solo A, que corre siempre, también en CI: sucursal sintética, propuesta, horas-caja, supervisión, AH2-040, descarga del PDF (`%PDF-`), sin escrituras ni almacenamiento local. (b) **Prueba integral** interfaz → A + CP-SAT real con progreso por fase → validación → selección → PDF. Corre con `AH2_LAB_CPSAT_DIR`; en CI se omite porque no está el repositorio hermano. |
