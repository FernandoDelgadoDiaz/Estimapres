## PUNTO ÚNICO DE RETOMA — AH2-060 modo prueba visible (PR) · 23/11/2026, Claude

**Estado de producción:** ver relevo anterior (AH2-058 publicado; AH2-059 fusionado en `main@bc2f80a`, pendiente de Publish deploy por el propietario). **Dato de producción cambiado (autorizado):** borrada la v5 de la semana 23/11 de la 091 (prueba con una regla de turno, generada 23/11 12:46 UTC); la semana queda con v1–v4 y la v4 es la vigente. La regla de prueba la borró el propietario.

**AH2-060 en PR (sin publicar):** «Modo prueba» siempre visible junto al botón, botón «Generar prueba (no se guarda)», arranca siempre apagado. Rama `fix/ah2-060-modo-prueba-visible`. Solo Netlify. Pruebas: Vitest 648 passed / 4 skipped; Playwright 23 passed (nueva prueba: con modo prueba no se guarda); build OK.

### Pendiente
- Publicar AH2-059 y AH2-060 (autorización).
- Reemplazo asistido de supervisor ausente; motor B en «Mejor cobertura» (opcional); rangos de turnos por sucursal; salida máxima de cajeros por local en pantalla; motor B por local.
---

## RELEVO ANTERIOR — AH2-059 barra de progreso al generar (PR) · 23/11/2026, Claude

**Estado de producción:** Netlify deploy `6b042cfd171bf0326c06a3ea` = `main@ea378d4` (**AH2-058 publicado 23/11 12:26 UTC**; incluye AH2-057). Rollback `6b037a9c349bf3265d201eeb` (AH2-057). Cloud Run `aliada-optimizer-00010-29t` sin cambios.

**AH2-059 en PR (sin publicar):** barra de progreso en Nueva semana mientras se genera (tiempo transcurrido, paso y aviso). Rama `feat/ah2-059-barra-progreso`. Solo Netlify. Pruebas: Vitest 648 passed / 4 skipped; Playwright 22 passed (Nueva semana verifica la barra); build OK.

### Pendiente
- Publicar AH2-059 (autorización).
- Reemplazo asistido de supervisor ausente; motor B en «Mejor cobertura» (opcional); rangos de turnos por sucursal; salida máxima de cajeros por local en pantalla; motor B por local.
---

## RELEVO ANTERIOR — AH2-058 turnos sin opciones repetidas (PR) · 23/11/2026, Claude

**Estado de producción:** Netlify deploy `6b037a9c349bf3265d201eeb` = `main@cdd45a8` (**AH2-057 ausencias, publicado 22/11 23:40 UTC**). Rollback `6b034a7184c8162aa08bc1c5` (AH2-056). Cloud Run `aliada-optimizer-00010-29t` sin cambios.

**AH2-058 en PR (sin publicar):** Reglas por persona sin «Siempre de mañana» ni «Siempre de cierre» (redundantes con «Turno»). Nuevo turno «Solo cierre» para FULL y PART. Las reglas existentes de esos tipos siguen funcionando. Rama `fix/ah2-058-turnos-sin-redundancia`. Solo Netlify. Pruebas: Vitest 645 passed / 4 skipped; Playwright 22 passed; build OK.

### Pendiente
- Publicar AH2-058 (autorización).
- Reemplazo asistido de supervisor ausente; motor B en «Mejor cobertura» (opcional); rangos de turnos por sucursal; salida máxima de cajeros por local en pantalla; motor B por local.
---

## RELEVO ANTERIOR — AH2-057 ausencias sobre un horario generado (PR) · 22/11/2026, Claude

**Estado de producción:** Netlify `main@3ccc992` (AH2-047…056; deploy `6b034a7184c8162aa08bc1c5`, rollback `6b022c71209659fc76963615`). Cloud Run `aliada-optimizer-00010-29t` (`optimizer:aaa0f40`, 4 vCPU, `AH2_SEARCH_WORKERS=4`), rollback `00009-9wb`. Semana 23/11: última guardada v4.

**AH2-057 en PR (sin publicar):** Horarios → «Cargar ausencia» → dos propuestas (menor impacto / mejor cobertura) desde el día siguiente al aviso → aprueba el supervisor → versión nueva + PDF. Rama Estimapres `feat/ah2-057-ausencias`. **Solo Netlify** (no requiere Cloud Run ni migración: corre en la app, para cualquier sucursal). Módulos: `src/contingencias/{ausencias,reparar,semana}.ts`, `src/components/semana/PanelAusencia.tsx`; validador con ausencias acreditadas (`validadorIndependiente`, `validacionSemana`, `auditoriaV2`, `revalidacionIntegrada`); recálculo de apoyo con topes, reservas y disponibilidad acreditada (`recalculoSemana`); celda «AUSENTE» en tabla y PDF y nota de versión en el PDF.

**Pruebas:** Vitest 643 passed / 4 skipped (incluye `src/contingencias/__tests__/reparar.test.ts`: congelamiento hasta el aviso, sin horas nuevas, ausencia de eventual, «mejor cobertura» mueve francos cuando conviene, validador acredita la ausencia y detecta contradicciones, versión aprobada). Playwright 22 passed (incluye `e2e/ausencias.e2e.ts` de punta a punta: cargar, proponer, aprobar, versión 2 con AUSENTE, sin violaciones, PDF). Build OK. **Simulación local con la entrada real de la 091 (semana 23/11, sin datos en el repo):** 64 casos (16 personas × 4 rangos); propuestas en 0,2–2,5 s; ninguna propuesta agrega incumplimientos. Ausencia de un cajero: la semana real no tiene franjas con sobrante y los eventuales están en su tope, así que «menor impacto» no cambia a nadie (dice que no hay forma de cubrir más sin agregar horas) y «mejor cobertura» reparte el faltante. Ausencia de un eventual: «mejor cobertura» recupera todo (p. ej. 49 → 42,5 h, igual que sin ausencia). Ausencia de un supervisor: queda apertura o supervisión sin cubrir y la app bloquea la aprobación pidiendo cargar el reemplazo.

### Pendiente
- Publicar AH2-057 (autorización): fusionar → Publish deploy.
- Reemplazo de supervisor ausente asistido (hoy se carga a mano la presencia del reemplazo y se vuelve a buscar).
- Rangos de ingreso de los turnos editables por sucursal; salida máxima de cajeros por local en pantalla; motor B por local.
---

## RELEVO ANTERIOR — AH2-056 pedido de turno por persona (PR) · 22/11/2026, Claude

**Estado de producción:** Netlify `main@f7f6780` (AH2-047…054), publicado 22/11 17:07 UTC. Cloud Run `aliada-optimizer-00009-9wb` (`optimizer:19a6b52`, 4 vCPU, `AH2_SEARCH_WORKERS=4`, AH2-055), rollback `aliada-optimizer-00008-zpp`. Alertas de presupuesto: US$ 1, US$ 5 y US$ 100. Semana 23/11: última guardada v4 (99,3 %); PDF impreso con eventuales repartidos generado aparte (no guardado como v5).

**AH2-056 en PR (sin publicar):** regla «Turno» por persona con vigencia, en Configuración → Reglas por persona. Estimapres: rama `claude/ah2-056-turnos-por-persona`. aliada-optimizer: rama `feat/ah2-056-turnos-por-persona` (base `feat/minimo-impacto-semanal`). Sin migración (el turno se guarda en `parametros` jsonb de `reglas_configurables`). **Orden de publicación:** primero Cloud Run (el motor actual rechaza los tipos de excepción nuevos), después Netlify. Pruebas: Vitest 636 passed / 4 skipped; Playwright 21 passed / 1 skipped; build y lint OK; pytest 174 passed / 1 skipped; prueba de punta a punta A → CP-SAT → validador de A con pedidos (FULL cortado = 4 cortadas, FULL tarde, PART noche): óptimo y 0 infracciones.

### Pendiente
- Publicar AH2-056 (autorización): Cloud Run → Netlify.
- Rangos de ingreso de los turnos editables por sucursal (hoy precargados en código).
- Configuración por local de la salida máxima de cajeros en pantalla.
- Resto: ver relevos anteriores.
---

## RELEVO ANTERIOR — v4 del 23/11 en uso; AH2-054 en PR · 21/11/2026, Claude

**Estado:** producción = Netlify `main@490e294` (AH2-047…053) y Cloud Run `aliada-optimizer-00008-zpp` (`optimizer:5ee87b1`, AH2-053; rollback `aliada-optimizer-00007-vzq`). **Semana 23/11 versión 4** (21/11 23:13 UTC): 99,3 % de cobertura, 3 h sin cubrir, estado «Listo», sin preferencias heredadas y sin cajeros después de las 22:30; el propietario la considera correcta. La mejora 95,5 → 99,3 % vino sobre todo de quitar las 7 preferencias heredadas de la v2 (eventuales +9 h y supervisores +5,5 h de caja).

**Hallazgo:** en producción el motor CP-SAT no llega en 120 s a cerrar la primera fase (faltantes): v3 FEASIBLE, v4 UNKNOWN; las fases posteriores (sobrantes, reparto, preferencias) no se aplican. Pendiente evaluar si conviene más tiempo o reordenar objetivos.

**AH2-054 (PR, sin publicar):** reparto parejo de horas de caja de eventuales entre días, como paso posterior validado (rama `claude/ah2-054-reparto-eventual`). No requiere Cloud Run. Pruebas: Vitest 627 passed / 4 skipped; Playwright 21 passed / 1 skipped; build y lint OK.

### Pendiente
- Publicar AH2-054 (autorización) → regenerar o usar la v4.
- Verificar que las preferencias, cuando vuelvan a existir, nunca bajen la cobertura (propuesto al propietario).
- Configuración por local de la salida máxima de cajeros en pantalla.
- Resto: ver relevos anteriores.
---

## RELEVO ANTERIOR — Primera semana real guardada; AH2-053 en PR · 21/11/2026, Claude

**Estado:** producción = Netlify `main@488f75c` (AH2-047…052) una vez publicado por el propietario (rollback `6b021ba4879fb3820039d6b9`). **Semana 23/11, versión 3** guardada 21/11 22:38 UTC: 8 cajeros (con Gabriel Silva), Maite 6 h, cobertura 95,5 % (18 h sin cubrir: cierre 21:00–21:30, jueves 11–14 sin segundo supervisor), estado «Listo», motor B. Primera semana real de la 091.

**AH2-053 (PR, sin publicar):** cajeros terminan como máximo a las 22:30 (configurable por local). Estimapres: rama `claude/ah2-053-cierre-cajeros` (no requiere Cloud Run: el límite viaja como excepción «no después de»). aliada-optimizer: rama `feat/ah2-053-cierre-cajeros` (base `feat/minimo-impacto-semanal`), parámetro `cajeros_fin_hora_limite` con 22:30 por defecto; requiere build y deploy de Cloud Run (autorización). Pruebas: Vitest 625 passed / 4 skipped; Playwright 21 passed / 1 skipped; build y lint OK; pytest 168 passed / 1 skipped.

### Pendiente
- Fusionar AH2-053 Estimapres → Publish deploy. Cloud Run de AH2-053 cuando el propietario lo autorice (no bloquea).
- Configuración por local de la salida máxima de cajeros en la pantalla de Configuración (hoy: valor por defecto 22:30).
- Resto: ver relevos anteriores.
---

## RELEVO ANTERIOR — Producción con AH2-047…051; AH2-052 en PR · 21/11/2026, Claude

**Estado:** producción = Netlify deploy `6b021ba4879fb3820039d6b9` = `main@a951414` (AH2-047 a AH2-051), publicado 21/11 22:33 UTC. Rollback: `6b02005b0d69a4f75257d273`. Semana 23/11: versión 2 guardada 21:22 UTC (87,8 %, origen B) **sin Gabriel Silva** (generada antes de desactivar su exclusión). AH2-052 en PR (rama `claude/ah2-052-rotacion-semanas-previas`): la rotación ya no toma versiones previas de la misma semana. Pruebas: Vitest 623 passed / 4 skipped; Playwright 21 passed / 1 skipped; build y lint OK.

### Pendiente
- Publicar AH2-052 (autorización) → regenerar la semana del 23/11 (versión 3, con Gabriel) → verificar.
- Resto: ver relevos anteriores.
---

## RELEVO ANTERIOR — AH2-047 a AH2-051 fusionados; falta Publish deploy · 21/11/2026, Claude

**Estado:** en `main`, autorizados por el propietario: #75 (AH2-047), #76 (AH2-048), #77 (AH2-049), #78 (AH2-050, leyenda de horas) y #79 (AH2-051: el aprendizaje de la 091 usa solo semanas generadas desde el 21/11 20:39 UTC; lo anterior queda archivado, sin borrar). Producción sigue en Netlify `6b02005b0d69a4f75257d273` (= `main@d7ec41d`, AH2-046) hasta que el propietario haga **Publish deploy** del último deploy de `main`; ese deploy es también el rollback si algo falla. Dato de producción cambiado (autorizado): exclusión manual de Gabriel Silva desactivada (ver AH2-049). Pruebas en cada PR: Vitest, Playwright, build y lint en verde.

### Pendiente
- Publish deploy del último `main` (propietario) → generar la semana del 23/11 → verificar que quede guardada (versión 2) y registrar el deploy aquí.
- Resto: ver relevos anteriores.
---

## RELEVO ANTERIOR — AH2-050 leyenda de horas (PR) · 21/11/2026, Claude

**Estado:** `main@87a3cb6` (AH2-047 #75, AH2-048 #76, AH2-049 #77) espera el Publish deploy del propietario (rollback: `6b02005b0d69a4f75257d273`). AH2-050 en PR (rama `claude/ah2-050-horas-disponibles`): solo se corrige la leyenda (horas de contrato de cajeros; eventuales y supervisores los calcula el motor al generar). Decisión del propietario: no estimar antes de generar. Pruebas: Vitest 621 passed / 4 skipped; Playwright 21 passed / 1 skipped; build y lint OK.

### Pendiente
- Publicar AH2-050 (autorización) y generar la semana del 23/11.
- Resto: ver relevo anterior.
---

## RELEVO ANTERIOR — AH2-049 reglas por persona visibles (PR) · 21/11/2026, Claude

**Estado:** `main@97101ce` (AH2-047 #75 + AH2-048 #76) espera el Publish deploy del propietario en Netlify (rollback: `6b02005b0d69a4f75257d273`). **Dato de producción cambiado (autorizado):** se desactivó la exclusión manual temporal de Gabriel Silva (fila `eab627c5…`, 23–29/11) con `cms_desactivar`, versión 2, 21/11 21:46 UTC; era la única regla por persona activa en la 091. AH2-049 en PR (rama `claude/ah2-049-reglas-por-persona`): las reglas por persona se muestran en Nueva semana y Personal con botón para quitarlas. Pruebas: Vitest 621 passed / 4 skipped; Playwright 20 passed / 1 skipped; build y lint OK; captura de Personal revisada contra Supabase simulado.

### Pendiente
- Publicar AH2-049 (autorización del propietario) y generar la semana del 23/11 (con Gabriel Silva y Maite en 6 h).
- Resto: ver relevo anterior.
---

## RELEVO ANTERIOR — AH2-048 supervisores por horas en caja (PR) · 21/11/2026, Claude

**Estado:** AH2-047 fusionado en `main@9f3eee5` (PR #75); el propietario hace Publish deploy en Netlify (rollback: `6b02005b0d69a4f75257d273`). AH2-048 en PR (rama `claude/ah2-048-aux-en-caja`), sin publicar: la tabla «Horario por persona» muestra a los AUX por sus horas en caja (como el PDF), y franco / medio franco van en amarillo en la tabla y el PDF. Pruebas: Vitest 619 passed / 4 skipped; Playwright 20 passed / 1 skipped (nueva `horarios-caja-aux.e2e.ts`); build OK.

### Pendiente
- Publicar AH2-048 (autorización del propietario) y verificar que la semana del 23/11 quede guardada.
- Resto: ver relevo anterior.
---

## RELEVO ANTERIOR — AH2-047 correcciones del supervisor en PR · 21/11/2026, Claude

**Estado:** producción = Netlify deploy `6b02005b0d69a4f75257d273` = `main@d7ec41d` (PR #74, AH2-046: domingo anterior automático, guardado por defecto), publicado 21/11 20:39 UTC. Rollback: `6b01bed8ecf0a43bb39c5131`. Cloud Run `aliada-optimizer-00007-vzq` y Supabase sin cambios. AH2-047 en PR (rama `claude/ah2-047-correcciones-supervisor`), **sin publicar**.

### Qué pasó en la primera generación real (21/11 20:44 UTC)
El motor terminó bien (Cloud Run 200, 126 s), pero el horario **no se guardó**: el validador encontró incumplimientos y la pantalla solo lo mostraba como «Borrador», sin decir que no se guardaba ni permitir guardarlo tras corregir. El motivo exacto no quedó registrado. Lo que el propietario vio luego en Horarios era la **versión 1 del 23/11** (guardada el 19/11 con correcciones manuales: Carlos Paz lunes 10:00–14:00 / 17:30–22:30 = corte 3,5 h; Maite Oyanarte 8 h 30 contra 6 h de ficha). Además, al corregir en la tabla, a un EVENTUAL se le exigía el corte de 4 h entre intervalos de caja.

### AH2-047 (PR)
1. Edición: intervalos de EVENTUAL sin reglas de jornada de cajero (H-F7, 2 bloques, 12 h). Test `edicionManual.test.ts`.
2. Nueva semana: recuadro rojo «Este horario NO se guardó porque…» + botón **Guardar horario** que se habilita cuando ya no hay incumplimientos.
3. Horarios: incumplimientos en rojo («No cumple las reglas…»).
4. Tope de caja de cada EVENTUAL = el menor entre la ficha (Personal) y el máximo por contrato de Configuración (decisión del propietario: las 8 h son techo, no tope único; Maite Oyanarte 6 h). Test `topesFichaEventual.test.ts`.

Pruebas: Vitest 618 passed / 4 skipped; Playwright 19 passed / 1 skipped; build OK; captura de Horarios revisada.

### Pendiente / decisiones abiertas
- Publicar AH2-047 (autorización del propietario) y volver a generar la semana del 23/11.
- Resto de pendientes: ver relevo anterior.
---

## RELEVO ANTERIOR — AH2-044 interfaz del supervisor publicada en producción · 21/11/2026, Claude

**Estado:** sin trabajo en curso. Producción:
- **Netlify (al-iada):** deploy `6b01bed8ecf0a43bb39c5131` = `main@9d7b128` (Estimapres #69: tablas en cuadrícula, resumen a todo el ancho, Configuración sin opciones avanzadas), publicado 21/11 15:56 UTC. Anterior: `6b01b13fecf0a43bb39962db` (#67).
- **Cloud Run:** revisión `aliada-optimizer-00007-vzq` (`optimizer:4e23804`), sin cambios.
- **Supabase:** sin cambios.

Publicado: menú de 5 opciones, Inicio con el estado de la semana, Horarios (último + anteriores, cobertura por franja con picos marcados), Configuración en una página, Nueva semana corta, PDF en lenguaje del supervisor y Personal simple (detalle en MASTER AH2-044 y en el relevo anterior). «Qué eventuales atienden caja» y «lo armo yo» quedaron solo en Opciones avanzadas: para que un contrato EVENTUAL no atienda caja se usa el máximo semanal en 0 h (decisión del propietario).

### Pendiente / decisiones abiertas
- **Plan multi-sucursal:** `docs/PLAN_MULTISUCURSAL.md`. Aprobado como horizonte; **corto plazo: 40 locales, un usuario por local y el supervisor como administrador** (propietario, 21/11/2026). Alcance mínimo: puntos A–H. **Fase actual: la 091 como piloto en producción real** (propietario, 21/11/2026). **Supabase:** el proyecto «al-iada horarios» sigue en la organización «Solo pausados» (plan gratuito); el propietario ya tiene un plan Pro, pero **no se cambia por ahora**: se migra al ampliar a más locales. Riesgos aceptados mientras tanto: pausa del proyecto tras unos 7 días sin uso (poco probable con uso semanal) y sin backups diarios restaurables. Faltan decisiones: locales piloto siguientes, presupuesto de Google Cloud y quién hace la validación jurídica.
- Revisión del propietario en uso real; ajustes que surjan.
- Hasta el 21/11 todas las generaciones fueron en «modo prueba» (no guardan), que en la 091 venía activado por defecto. Corregido (PR #74, AH2-046): arranca **sin modo prueba** y el domingo anterior ya no se carga a mano: se toma del horario guardado de la semana previa; sin semana previa se guarda igual con la limitación informada. Cambiar de pantalla dentro de la app cancela la generación (cambiar de pestaña del navegador no). Propuesta pendiente: avisar antes de salir mientras se genera.
- Máximos 12/8 permanentes (editables en Configuración).
- Cadena aliada-optimizer #1–#5 hacia `main` (producción no depende de ella).

### Rollback
Netlify: deploy `6b01b13fecf0a43bb39962db` (antes de #69) o `6b0198cdc2dd14bb7be3bb3e` (antes de AH2-044) · Cloud Run: `aliada-optimizer-00006-5wg` / `00005-rsm` · Configuración: editor · Base: bloque de rollback de la migración.
---

## RELEVO ANTERIOR — AH2-044 4 etapas en PR #67 (luego publicado) · 21/11/2026, Claude

**Estado:** producción sin cambios (Netlify `main@c1b1f0c`, Cloud Run `aliada-optimizer-00007-vzq`). El propietario pidió publicar **las 4 etapas juntas**. Todo está en el PR #67 (rama `feat/ux-etapa1-navegacion`). **Falta:** autorización para fusionar y Publish deploy en Netlify. Sin cambios en motor, validadores, base ni Cloud Run.

### Hecho
1. **Menú, Inicio y Horarios:** 5 opciones (Inicio, Nueva semana, Horarios, Personal, Configuración); Historial y Efectividad fuera del menú (siguen por detrás; rutas de administración). Inicio con próxima semana + una acción, último horario con cobertura y dónde faltan cajas. Horarios: último + semanas anteriores, edición con registro de correcciones (aprendizaje intacto), **cobertura por franja siempre visible con horas pico marcadas** y cajas de más.
2. **Configuración:** una página con interruptores y campos (apertura y supervisión, francos, eventuales en caja, reglas por persona, mínimo de cajeros). En la 091 escribe en la configuración persistente AH2-042 (máximos EVENTUAL y horarios de supervisor solo en caja; «qué eventuales atienden caja» y «lo armo yo» solo en Opciones avanzadas, decisión del propietario), con simulación de conflictos e historial; rige desde el próximo lunes. Historial de versiones, importación y backup en «Opciones avanzadas».
3. **Nueva semana:** paso 2 corto (semana con horas necesarias/disponibles, domingo anterior, cambios de la semana, opciones plegadas); resultado con resumen, estado «Listo / Borrador», cobertura con picos y horario por persona. Sin «¡Todo perfecto!» ni códigos.
4. **PDF y Personal:** estado en palabras («Listo», «Borrador (revisar antes de publicar)», «Sin verificar»), página «Resumen de la semana» con cobertura y lo que hay que revisar, sin códigos ni la página de alertas del motor. Personal: «Supervisores», una línea de activos, acciones en texto, sin notas técnicas.

### Pruebas
Vitest **613 passed / 4 skipped**; Playwright **18 passed / 1 skipped** (nueva: Configuración); build OK. Pantalla de Configuración de la 091 revisada contra un Supabase simulado con datos sintéticos.

### Para publicar (autorización del propietario)
Fusionar PR #67 → Publish deploy del deploy de `main` en Netlify. Rollback: deploy `6b0198cdc2dd14bb7be3bb3e`.
---

## RELEVO ANTERIOR — AH2-044 etapa 1 en PR · 21/11/2026, Claude

**Estado:** producción sin cambios (Netlify `main@c1b1f0c`, Cloud Run `aliada-optimizer-00007-vzq`). Decisión del propietario AH2-044 (MASTER): pantallas simples para el supervisor (computadora; configura y corrige; el aprendizaje de correcciones sigue por detrás). Etapa 1 en PR (rama `feat/ux-etapa1-navegacion`), **sin publicar**.

### Etapa 1 (hecha)
- Menú de 5 opciones con íconos de línea: Inicio, Nueva semana, Horarios, Personal, Configuración. Historial y Efectividad fuera del menú (rutas solo para administración; `/ultimo-horario` redirige a `/horarios`).
- **Inicio:** próxima semana con una acción (Generar / Ver horario / Cargar personal), último horario con cobertura, horas sin cubrir y dónde faltan cajas, y personal en una línea. Sin textos de bienvenida ni instructivos.
- **Horarios:** abre en el último generado, selector de semanas anteriores (última versión de cada lunes), resumen en vivo, edición con registro de correcciones (sin cambios), validación completa por detrás y visible solo si hay algo que revisar; cobertura por franja desplegable.
- Barra superior: fecha y sucursal. Tabla de horario: «Horario por persona», sin «Objetivo: Sin configurar» ni leyenda con nombres internos.
- `src/utils/resumenSemana.ts` (+ pruebas): resumen en lenguaje del supervisor.

### Pruebas
Vitest **607 passed / 4 skipped**; Playwright **17 passed / 1 skipped**; build OK.

### Próximas etapas
2. Configuración simple (reglas como campos; configuración del motor 091 integrada; backup a administración).
3. Nueva semana y resultado sin mensajes técnicos.
4. PDF y Personal.
---

## RELEVO ANTERIOR — AH2-042 y AH2-043 publicados y verificados en producción · 21/11/2026, Claude

**Estado:** sin trabajo en curso. Producción:
- **Netlify (al-iada):** deploy `6b0198cdc2dd14bb7be3bb3e` = `main@c1b1f0c` (Estimapres #65), publicado 21/11 13:16 UTC.
- **Cloud Run:** revisión `aliada-optimizer-00007-vzq`, imagen `optimizer:4e23804` (aliada-optimizer #8), mín. 0 / máx. 1, CPU por solicitud. Controles de seguridad idénticos.
- **Supabase:** `configuracion_motor_sucursal` con la configuración de la 091 (perfiles EVENTUAL y topes 12/8 permanentes; excepción temporal del supervisor hasta 29/11). Secret Manager ya no es fuente de configuración de la 091.

### Verificación del propietario (semana 23–29/11, generada en producción 21/11 13:28 UTC)
- Cobertura **88,3 %**, 47 h faltantes (límite de dotación), 0 sobrantes; el PDF muestra «Cobertura al generar: 88.3 %» (antes 0,0 %).
- **Ninguna franja con 2 o más cajas faltantes**; horas pico de cada día completas.
- Faltante por día parejo: Lun 11 %, Mar 12 %, Mié 13 %, Jue 12 %, Vie 11 %, Sáb 10 %, Dom 12 %. Peores franjas: 1/2 en aperturas 09:00 y cierres 22:00.
- Máximos respetados: EVENTUAL FULL 12 h, PART 8 h. FULL 48 h, PART 32 h.
- Avisos de datos (no infracciones): falta el domingo 22/11 confirmado para verificar el descanso domingo→lunes.

### Pendiente / decisiones abiertas
- **Interfaz del supervisor (decisión del propietario, 21/11):** la complejidad (motor, validadores, estadísticas) queda por detrás; definir pantalla por pantalla qué ve el supervisor (p. ej. mensajes técnicos del PDF, «SIN VERIFICAR», pantalla de configuración del motor). Registrar como regla de producto en MASTER cuando se defina. No mostrar estadísticas del motor hasta entonces.
- Máximos 12/8 permanentes (editables desde el editor).
- Cadena aliada-optimizer #1–#5 hacia `main` (producción no depende de ella).

### Rollback
Netlify: deploy `6b0177b930ae92e7fd26bc4c` (v1) · Cloud Run: `aliada-optimizer-00006-5wg` o `00005-rsm` · Configuración: editor de reglas · Base: bloque de rollback de la migración.
---

## RELEVO ANTERIOR — AH2-043 corregido (sin concentrar en el miércoles), antes de publicar · 21/11/2026, Claude

**Estado:** publicación de AH2-043 autorizada por el propietario (21/11). Primera versión ya fusionada (Estimapres #64 `d0ea79e`, aliada-optimizer #7 `c0602af`) y Cloud Run con `optimizer:b81462f` (revisión `aliada-optimizer-00006-5wg`), pero **el Publish deploy de Netlify no se hizo**: producción sigue con `6b0177b930ae92e7fd26bc4c` (equilibrio v1). El propietario detectó que esa versión **concentraba los faltantes en el miércoles** (22 %). Corregido en una segunda versión (este PR + PR de aliada-optimizer, rama `feat/ah2-043-equilibrio-dias`). **No publicar `d0ea79e`.**

### Corrección
- Día pico **proporcional** (100 · demanda del día / día más fuerte), no escalado del más flojo (0) al más fuerte (100).
- **Equilibrio entre días** dentro del reparto: la F-ésima media hora faltante de un mismo día cuesta F × peso del día.
- Sin cambios en restricciones, faltante total ni corrección del PDF (cobertura medida por el orquestador).

### Evidencia (semana 23–29/11 real, A + CP-SAT local, 120 s)
| | v1 (producción) | v2 primera (no publicada) | v2 corregida |
|---|---|---|---|
| Cobertura / faltantes | 88,3 % / 47 h | 88,3 % / 47 h | 88,3 % / 47 h |
| Franjas con 2+ cajas faltantes | 26 | 0 | **0** |
| Faltantes en la franja máxima del día | 0 | 0 | 0 |
| Faltante por día | 0–15 % (sáb 0) | Mié 22 %, Jue 20 %, Vie 4 % | **Lun–Vie 12–13 %, Sáb y Dom 10 %** |

### Pruebas
pytest **167 passed / 1 skipped** (nueva: dos días casi iguales no concentran el faltante en el más flojo); Vitest **603 passed / 4 skipped**; Playwright **17 passed / 1 skipped**; build OK.

### Para publicar (autorizado)
1. Fusionar el PR de aliada-optimizer, imagen nueva y revisión de Cloud Run. Rollback: `aliada-optimizer-00006-5wg` / `00005-rsm`.
2. Fusionar el PR de Estimapres; el propietario hace Publish deploy del deploy de ese merge. Rollback: `6b0177b930ae92e7fd26bc4c`.
3. Generar 23/11 de nuevo y revisar el PDF.

## RELEVO ANTERIOR — AH2-043 primera versión (reemplazada: concentraba en el miércoles) · 21/11/2026, Claude

**Estado:** AH2-042 **publicado completo** (Netlify `main@ff6fcd4`, deploy `6b0177b930ae92e7fd26bc4c`, publicado 21/11 10:53 UTC; Cloud Run `aliada-optimizer-00005-rsm`). El propietario generó la semana 23–29/11 en producción: 88,3 %, 47 h faltantes (límite de dotación), reglas cumplidas. A partir de ese análisis pidió (21/11): corregir el PDF y que el motor **balancee y priorice horas y días pico**. Implementado como AH2-043 en PR de Estimapres (rama `feat/ah2-043-reparto-picos`) y de aliada-optimizer (misma rama, SHA `b81462ffeacf456a6dc4ab07f302f1ebd8e5b16f`). **No publicado.**

### Cambios
1. **PDF «Cobertura al generar: 0.0 %»:** cuando gana CP-SAT su propuesta no trae `cobertura_total_pct`; ahora el resultado usa la cobertura medida por el orquestador (validadores de A) para A y B.
2. **Motor (equilibrio v2):** tras faltantes, faltantes ponderados y sobrantes, el faltante restante se reparte con coste convexo por franja (1 + 2 + … + k) × prioridad = peso × (100 + hora pico + día pico). Detalle en MASTER AH2-043. Igual en CP-SAT y en el selector de A (prueba de paridad). v1 intacta.

### Evidencia (semana 23–29/11 real, A + CP-SAT local, 120 s, parámetros de producción)
| | v1 (hoy) | v2 (AH2-043) |
|---|---|---|
| Cobertura / faltantes / sobrantes | 88,3 % / 47 h / 0 | 88,3 % / 47 h / 0 |
| Franjas con 2+ cajas faltantes | 26 | **0** |
| Faltantes en la franja máxima de cada día | 0 | 0 |
| Faltantes en franjas ≥ 80 % del máximo del día | 5,5 h | 4,5 h |
| Sábado (día pico) | 0 h | 0 h |
| Peores franjas | Vie 16:00 0/4, Mié/Lun/Dom 0/2 | 1/2 en aperturas 09:00 y cierres 22:00 |
| Domingo 21:30 / 22:00 | 3/5 / 0/2 | 5/5 / 1/2 |
Los faltantes caen en los días de menor demanda (miércoles 22 %, jueves 20 %), de a una caja.

### Pruebas
pytest **166 passed / 1 skipped**; Vitest **603 passed / 4 skipped**; Playwright **17 passed / 1 skipped**; build OK.

### Para publicar (requiere autorización del propietario)
1. Fusionar el PR de aliada-optimizer, reconstruir la imagen con `b81462f` y desplegar revisión nueva (mín. 0 / máx. 1). Rollback: `aliada-optimizer-00005-rsm`.
2. Fusionar el PR de Estimapres y Publish deploy en Netlify. Rollback: deploy `6b0177b930ae92e7fd26bc4c`.
3. Orden: primero Cloud Run (acepta v1 y v2), después Netlify.

### Decisiones abiertas
- Escala de prioridad (100–300). Si el propietario quiere que los días flojos absorban menos faltante, se reduce el peso de «día pico».
- Máximos 12/8 permanentes (de AH2-042); cadena aliada-optimizer #1–#5 hacia `main`.
---

## RELEVO ANTERIOR — AH2-042 publicado en backend; falta Publish deploy (luego publicado) · 21/11/2026, Claude

**Estado:** publicación autorizada por el propietario (20/11/2026). Backend completo; la interfaz nueva espera el **Publish deploy** de `main@e8032c1` en Netlify (al-iada, producción bloqueada). Deploy activo al 21/11: `6b00af11bb927938de720319` (anterior). Prestify sin cambios.

### Hecho
- **Cloud Run (CP-SAT):** revisión `aliada-optimizer-00005-rsm`, imagen `optimizer:ca87283`, 100 % del tráfico; mín. 0 / máx. 1 instancia; CPU solo por solicitud. Controles de seguridad (origen, JWT, rutas, CORS) idénticos a la revisión anterior.
- **PR fusionados:** Estimapres #62 → `main` (`e8032c1`); aliada-optimizer #6 → `feat/minimo-impacto-semanal` (`f255dfc`). La cadena aliada-optimizer #1–#5 (borradores) sigue abierta hacia `main`; no afecta producción porque Cloud Run ya corre `ca87283`.
- **Migración AH2-042 aplicada** en Supabase al-iada horarios (por el propietario desde el SQL Editor; el conector no mostró la confirmación). Verificado: tabla, restricciones (`cms_sin_superposicion`, `cms_topes_semana_completa`, etc.), RLS, funciones SECURITY DEFINER, sin INSERT directo para `authenticated`, sin ejecución para `anon`.
- **Configuración 091 importada** con `cms_importar` (identidad del usuario de la 091, todo o nada), desde la configuración del servicio:
  - Permanentes desde 23/11: perfiles de los 4 EVENTUAL (toda la presencia), máximos FULL 12 h / PART 8 h, AUX único 08:00–09:00 los 7 días.
  - Temporal: «gestionar manualmente» de un supervisor, 23/11–29/11 (vence sola).
  - Lectura con RLS como el usuario: correcta. Semana 23–29/11 resuelve igual que la del servicio.
- **Verificación semana 30/11–06/12 sin Secret Manager:** flujo real de configuración con el servicio devolviendo opciones vacías → fuente `persistida`; A + CP-SAT `ca87283` local con los parámetros de producción (120 s, global, semilla 20261119) sobre la entrada del ensayo 091 llevada a esa semana: **origen B (FEASIBLE) válido**, cobertura **99,6 %**, 1,5 h faltantes, 0 sobrantes, sin infracciones en el validador de A; EVENTUAL FULL 12 h y PART 8 h de caja; la excepción temporal ya no aplica.

### Pendiente
1. **Propietario:** Netlify → al-iada → Deploys → `main@e8032c1` → **Publish deploy**.
2. Generar la semana 30/11 en la app con el POM real y confirmar que Nueva semana indica «configuración guardada de la sucursal».
3. Registrar el resultado aquí.

### Decisiones abiertas
- Máximos 12/8 importados como **permanentes** (en Secret Manager vencían el 29/11; MASTER los registra como elección de la 091). Se cambian desde Reglas → Configuración del motor si se prefiere otra vigencia.
- Llevar la cadena aliada-optimizer #1–#5 a `main`.

### Rollback
Cloud Run: revisión `aliada-optimizer-00004-966`. Netlify: deploy `6b00af11bb927938de720319`. Configuración: cambiar o desactivar reglas desde el editor (no vuelve a Secret Manager). Base: bloque de rollback al final de la migración. Secret Manager intacto (ya no es la fuente de configuración de la 091).
---

## RELEVO ANTERIOR — AH2-042 segunda ronda de correcciones; PR #62 listo para publicación · 20/11/2026, Claude

**Estado:** las 4 correcciones de la segunda ronda del propietario están implementadas, con pruebas de regresión, en el PR #62 (Estimapres, rama `feat/ah2-config-persistente-sucursal`) y en el PR #6 de aliada-optimizer (rama `feat/integracion-aliada-work-claude`, SHA `ca872838c830cd4b9b8f0eeae3d185f969613a93`). **Migración NO aplicada.** Nada cambiado en Supabase, Netlify, Cloud Run ni Secret Manager. Prestify sin cambios. Las demás reglas aprobadas se conservan.

### Correcciones (segunda ronda)
1. **Sin prorrateo de máximos semanales.** Topes por contrato: solo por semanas completas (inicio lunes, fin domingo), exigido en el cliente y en la base (`cms_topes_semana_completa`); un cambio dentro de la semana → conflicto. Perfil EVENTUAL: máximo individual y mínimo de función habitual son semanales; si difieren entre días con caja de la misma semana → conflicto explícito (nunca un valor intermedio).
2. **Sin retorno automático a Secret Manager.** Cuando la sucursal guardó o importó configuración (cualquier fila, activa o no), la guardada es la única fuente para siempre; desactivar todo deja al motor solo con lo vigente. Solo una sucursal que nunca guardó usa el servicio. El editor ya no ofrece reimportar si hay filas.
3. **Condiciones del supervisor día por día.** Alcance = tipo de condición + persona (también en la columna generada `alcance`). La excepción temporal rige solo en sus días y la permanente en los demás; cada tramo continuo va al motor con sus fechas reales. Turno homónimo con otra definición → clave propia. «Gestionar manualmente» y «franco y medio corrido» parciales → conflicto (regla del motor).
4. **Excepción de AUX único sin franja fija.** El validador ya no limita a 08:00–09:00: rige en las franjas autorizadas por la sucursal (matriz 7×30), con un único AUX presente. H-A2, R3, H-A3 sin cambios fuera de eso. Cambiado en A (`politicaRecursos`, pasada 2, AH2-040, comparabilidad, validador independiente, orquestador) y en B (`support`, `domain`, máscaras, comparación). Con matrices que solo autorizan la apertura, resultados idénticos.

### Pruebas de regresión
- `configuracionPersistente.test.ts` (31): topes por semana completa, perfil con máximo distinto → conflicto / igual → conserva, importar y desactivar todo → fuente persistida, turno temporal miércoles–jueves sobre permanente (verificado con `compilarCondiciones`), franjas libres de AUX único.
- `excepcionApertura.test.ts` + `aliada-optimizer/tests/test_excepcion_apertura.py`: mismo fixture en A y CP-SAT; AUX único en franja autorizada fuera de la apertura atiende caja; sin autorización queda de pie; A valida el plan de CP-SAT y rechaza sentarlo fuera de la franja (H-A2).
- SQL (`scripts/db/probar-configuracion-motor.sh`, job `database` en CI): alcance de condiciones por tipo y persona, topes solo semanas completas, más integridad, RLS, atomicidad, historial y concurrencia real.

### Resultados
Vitest **601 passed / 4 skipped**; pytest **163 passed / 1 skipped**; Playwright **17 passed / 1 skipped**; build OK; SQL OK. Configuración real 091 (local, sin versionar): resuelve idéntica y sin conflictos.

### Para publicar (requiere autorización del propietario)
0. **CP-SAT:** reconstruir la imagen con aliada-optimizer `ca87283` (Cloud Build) y desplegar una revisión nueva de `aliada-optimizer` (min 0 / max 1). Rollback: revisión `aliada-optimizer-00004-966`. Sin esto, CP-SAT rechaza franjas fuera de 08:00–09:00 y Horarios usa el motor A.
1. Aprobar y fusionar el PR #6 (aliada-optimizer) y el PR #62.
2. Autorizar la migración en Supabase al-iada horarios.
3. Publish deploy en al-iada.
4. Reglas → Configuración del motor → Importar → revisar → Confirmar.
5. «Ver semana» y generar. Rollback: cambiar/desactivar reglas en el editor (no vuelve a Secret Manager), republicar deploy anterior o rollback SQL documentado.
---

## RELEVO ANTERIOR — primera ronda de correcciones AH2-042 · 20/11/2026, Claude


**Estado:** concepto AH2-042 **aprobado**; las 6 correcciones pedidas están implementadas y validadas en el PR #62 (borrador). **Migración NO aplicada.** Nada cambiado en Supabase, Netlify, Cloud Run ni Secret Manager. Motor matemático y Prestify sin cambios.

### Correcciones implementadas
1. **Apertura configurable** por sucursal, día y franja (día, desde, hasta) sobre la grilla del motor; sin horarios fijos en esta capa: la franja admitida la decide el validador del motor (`erroresDatosRecursos`).
2. **Vigencia por fecha:** resolución día a día; excepciones que empiezan o terminan a mitad de semana. Perfiles: días sin acreditación → reserva de franja completa; reservas por día; cantidades semanales prorrateadas. Topes: prorrateo por días. Condiciones: fechas reales (el motor ya las evalúa por día); «gestionar manualmente» y «franco y medio corrido» exigen semana completa (regla del motor) → conflicto explicado.
3. **Integridad:** conflictos y reglas inválidas aislados por alcance; el resto se resuelve. Una semana con conflictos bloquea solo la generación híbrida, con detalle (motor anterior disponible). Simulación previa de cada cambio sobre las semanas afectadas: no se guarda si crearía un conflicto.
4. **Atomicidad y concurrencia:** escrituras solo por `cms_crear`/`cms_reemplazar`/`cms_desactivar`/`cms_importar`; versión + `FOR UPDATE`; exclusión de superposiciones en la base; reemplazo fallido sin cambios; importación todo o nada.
5. **Editor completo:** reservas horarias + mínimo de función habitual; todas las condiciones (franco, turno con definición, gestionar manualmente, máximo de francos, franco y medio corrido) con DEBE/PREFERIRÍA; Cambiar/Desactivar con versión; «Ver semana» con conflictos.
6. **Escala e historial:** esquema único, RLS por usuario, índices por usuario/sucursal, `reemplaza_a`, sin borrados.

### Validación
- Vitest **596 passed / 4 skipped** (28 de AH2-042); Playwright **17 passed / 1 skipped**; tsc y build OK.
- **Migración probada en Postgres 16 real** (`scripts/db/probar-configuracion-motor.sh`, nuevo job `database` en CI): integridad, RLS, atomicidad, historial y concurrencia real con dos sesiones. La prueba encontró y corrigió un `CHECK` que aceptaba una apertura mal formada (NULL en SQL).
- Configuración real 091 (local, sin versionar): semana 23–29/11 idéntica a la actual; semana siguiente sin conflictos.

### Para aprobar y publicar (propietario)
1. Aprobar el PR #62.
2. Autorizar la migración en Supabase al-iada horarios (Claude puede aplicarla con el conector si se autoriza explícitamente).
3. Fusionar y Publish deploy en al-iada.
4. Reglas → Configuración del motor → Importar → revisar → Confirmar (decidir si los perfiles EVENTUAL quedan permanentes).
5. «Ver semana» y generar. Rollback: desactivar reglas (vuelve el servicio), republicar deploy anterior o rollback SQL documentado.
---

## RELEVO ANTERIOR — motor híbrido 091 PUBLICADO en Horarios · 20/11/2026, Claude

**Estado: PUBLICADO.** #61 fusionado a `main` (merge `e91dd19f0e9499a261a527184bac41c6337313aa`, CI verde en `c5bcc0f`/`cd250de`). El propietario publicó en al-iada el deploy **`6b00af11bb927938de720319`** (commit `e91dd19`, producción, **bloqueado** contra auto publicación); `horarios.aliadaapps.com` sirve el bundle con `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL` del servicio. Otras sucursales mantienen el generador anterior; en la 091 el selector conserva el respaldo por generación.

**Servicio CP-SAT:** Cloud Run `aliada-optimizer` (proyecto `aliada-horarios`, `southamerica-east1`), imagen `optimizer:5b98417` (`sha256:c855db31…`), revisión **`aliada-optimizer-00004-966`**, min 0 / máx 1, concurrencia 1, facturación por solicitud, origen permitido solo `https://horarios.aliadaapps.com`, usuario y configuración 091 en Secret Manager (v2). Presupuesto de guardia USD 1. Prueba real: `POST /v1/optimizar` 200 en 125,6 s; conteos Supabase idénticos antes/después.

**Rollback (en orden de alcance):**
1. Por generación: selector «Usar motor anterior» en Nueva semana.
2. Solo el híbrido: `VITE_AH2_HIBRIDO_091=false` en al-iada + rebuild de `main` + Publish deploy.
3. Frontend completo: Netlify al-iada → Deploys → `6afba0e1c0b8e64caa476f2c` (commit `a7006e4`) → Publish deploy; mantener bloqueo.
4. Servicio: `gcloud run services update-traffic aliada-optimizer --region southamerica-east1 --to-revisions <revisión>=100` o `gcloud run services delete aliada-optimizer --region southamerica-east1` (la app cae al respaldo A).
Sin migraciones: ningún rollback requiere revertir datos. Prestify sin cambios.

**Pendientes no bloqueantes:** antecedente del domingo previo sigue SIN VERIFICAR si no se confirma en la app; Safari de escritorio no probado (iPhone visto por el propietario); vigencias de la configuración privada son 23–29/11: para semanas siguientes hay que cargar una versión nueva de `ah2-pilot-options` (no se renuevan solas). Notas del entorno Claude: `unset CLOUDSDK_AUTH_ACCESS_TOKEN` antes de gcloud; `*.run.app` solo alcanzable vía Cloud Build.

---

## RELEVO ANTERIOR — prueba real 091 aprobada en preview; fusión de #61 y publicación de al-iada · 20/11/2026, Claude

**Prueba real autenticada (preview `deploy-preview-61--al-iada.netlify.app`, build de `cd250de`, código = `c5bcc0f`):** el propietario inició sesión y generó la semana 23–29/11 de la 091 con el híbrido; no guardó. Cloud Run (revisión `00003-mtl`, origen temporal de la preview): `GET /v1/sesion` 200 (0,7–0,9 s), `POST /v1/optimizar` **200 en 125,6 s**, sin advertencias ni errores. Supabase al-iada horarios (solo lectura, usuario/091) **idéntico antes y después**: colaboradores 17 (15 activos), reglas 5 (4 activas), semanas_historial 18 (1 de la semana 23/11, previa del 19/11), correcciones 38, aprendizajes 0. Los 5 IDs de la configuración privada existen, activos, 091 y del mismo usuario. Visualización en iPhone aceptada por el propietario (uso principal en computadora).

**Cierre de la prueba:** origen de Cloud Run devuelto a `https://horarios.aliadaapps.com` (revisión **`aliada-optimizer-00004-966`**); controles negativos repetidos: 401 sin sesión/JWT inválido, 403 origen ajeno, preflight solo del dominio productivo.

**Publicación:** fusionar #61 a `main` (base `a7006e4` sin cambios). Producción de al-iada sigue con auto publicación bloqueada: el build de `main` queda listo sin publicarse; el propietario pulsa **Publish deploy** en ese build. Rollback: republicar `6afba0e1c0b8e64caa476f2c` (commit `a7006e4`) y bloquear; desactivar el híbrido con `VITE_AH2_HIBRIDO_091=false` + rebuild; servicio: `update-traffic` a una revisión anterior o borrarlo. Prestify no se toca (si el repositorio dispara un build suyo, queda sin publicar por su bloqueo).

---

## RELEVO ANTERIOR — CP-SAT operativo para 091 en Cloud Run; falta solo la parte Netlify · 20/11/2026, Claude

**Hecho:** el propietario entregó el UID Supabase verificado y la configuración privada original de la 091 (perfiles EVENTUAL, topes 12/8, exclusión manual, excepción de apertura). Validada contra `Config` y `ev_caja` del backend `5b98417` antes de cargarla. Secret Manager: `ah2-allowed-user-id` v2 y `ah2-pilot-options` v2 (v1 provisorias **deshabilitadas**). Revisión **`aliada-optimizer-00002-b77`** sirve 100 % con esos secretos; arranque sin errores; controles negativos repetidos desde Cloud Build: 401 sin sesión/JWT inválido, 403 origen ajeno, preflight solo `https://horarios.aliadaapps.com`. Rollback del servicio: `gcloud run services update-traffic aliada-optimizer --region southamerica-east1 --to-revisions aliada-optimizer-00001-wvt=100` (revisión que rechaza todo) o borrar el servicio. Ningún dato personal en repositorios.

**Actualización:** el propietario cargó en al-iada `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL` (URL del servicio, con barra final; el transporte la normaliza). Verificado por lectura de Netlify. Siguiente: preview de #61 con ese build, origen temporal en Cloud Run, recorrido autenticado del propietario y promoción.

**Bloqueo actual (Netlify, no Google):** el conector Netlify de Claude lee pero devuelve **403 al escribir variables de entorno**, y el despliegue por CLI quedó bloqueado por los permisos de la sesión Claude. Falta, con la sesión Netlify del propietario o un conector con permiso de escritura:
1. En al-iada → Environment variables (scope builds, contexto all): `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL=https://aliada-optimizer-925852091572.southamerica-east1.run.app`.
2. Rebuild del deploy preview de #61 (o un push documental a la rama) → Claude habilita temporalmente el origen exacto de esa preview en Cloud Run (`AH2_ALLOWED_ORIGIN`), el propietario inicia sesión y genera la semana 23–29/11 de la 091, Claude verifica logs/latencia/conteos y vuelve el origen al canónico.
3. Merge de #61 a `main` (producción sigue bloqueada: el build no se publica solo) y **Publish deploy** de ese build en al-iada por el propietario. Rollback: republicar `6afba0e1c0b8e64caa476f2c`. Prestify no se toca.

---

## RELEVO ANTERIOR — CP-SAT desplegado en Cloud Run (bloqueado por diseño hasta cargar usuario y configuración privada) · 20/11/2026, Claude

**Acceso resuelto:** gcloud autenticado con la cuenta del propietario (rol `owner` en `aliada-horarios`, facturación `017DA5-3AEF78-DC684E` vinculada). Nota del entorno Claude: la variable preconfigurada `CLOUDSDK_AUTH_ACCESS_TOKEN` debe quitarse (`unset`) para usar la sesión gcloud; `*.run.app` no es alcanzable desde el proxy del entorno, por eso los controles HTTP se ejecutan desde Cloud Build.

### Recursos creados (proyecto `aliada-horarios`, región `southamerica-east1`)
- APIs habilitadas: Cloud Build, Secret Manager, Billing Budgets (Cloud Run y Artifact Registry ya estaban).
- Artifact Registry `aliada` · imagen `optimizer:5b98417` (backend #6 `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`, sin cambios), digest `sha256:c855db31cb07c1e4503bfb1ef500232f4d299c767ea58b71f7d471cff1e24147`, 123 MB. Construida con Cloud Build (1 min 3 s).
- Cloud Run `aliada-optimizer`, revisión `aliada-optimizer-00001-wvt`, URL `https://aliada-optimizer-925852091572.southamerica-east1.run.app`. **min 0 / máx 1 instancia, concurrencia 1, CPU solo durante solicitudes (facturación por solicitud), sin CPU boost**, 1 vCPU / 2 GiB, timeout 300 s, ingreso público (la autenticación la hace el servicio contra Supabase Auth en cada solicitud).
- Variables: `SUPABASE_URL` y `SUPABASE_PUBLIC_KEY` (rol anon, tomadas del bundle público de Horarios), `AH2_ALLOWED_BRANCH=091`, `AH2_ALLOWED_ORIGIN=https://horarios.aliadaapps.com`.
- Secret Manager (réplica São Paulo): `ah2-allowed-user-id` y `ah2-pilot-options`, hoy con valores **provisorios que bloquean todo acceso** (`PENDIENTE-PROPIETARIO` y `{}`); accesibles solo por la cuenta de servicio de ejecución.
- Presupuesto de guardia **USD 1** en la cuenta de facturación, filtrado al proyecto, con alertas al 1 %, 50 % y 100 %.

### Controles verificados (desde Cloud Build, datos sintéticos)
Sin JWT → 401 `SESSION_REQUIRED` (estado, optimizar); JWT inválido → 401; origen ajeno → 403 `ORIGIN_DENIED` (incluido preflight); preflight del origen productivo → 204 con `Access-Control-Allow-Origin: https://horarios.aliadaapps.com` exacto; ruta inexistente → 404. `/healthz` no llega al contenedor (ruta reservada de Cloud Run); el frontend no la usa (`/v1/sesion`, `/v1/estado`, `/v1/optimizar`).

### Costo
Todo dentro de los tramos gratuitos: Cloud Build ~2 min de 2.500/mes; Artifact Registry 123 MB de 0,5 GB; Secret Manager 2 versiones activas de 6; Cloud Run en reposo = 0 instancias (free tier mensual: 180.000 vCPU-s, 360.000 GiB-s, 2 M solicitudes; una generación de 120 s ≈ 120 vCPU-s y 240 GiB-s). Bucket de fuentes de Cloud Build ~0,7 MB. No es promesa de factura cero; el presupuesto de USD 1 alerta ante cualquier consumo.

### Rollback
- Servicio: `gcloud run services delete aliada-optimizer --region southamerica-east1` (el frontend productivo no lo usa todavía) o volver a una revisión anterior con `gcloud run services update-traffic`.
- Frontend: producción sigue en el deploy bloqueado `6afba0e1c0b8e64caa476f2c` (commit `a7006e4`), verificado en lectura; sin cambios en Netlify. Prestify sin cambios.

### Falta para publicar (datos del propietario, no autenticación)
1. **ID de usuario Supabase (Auth) del supervisor autorizado de la 091** → versión nueva de `ah2-allowed-user-id`.
2. **Configuración privada vigente** (`Aliada_091_S48_config_piloto_privada.json`: perfiles EVENTUAL, topes 12/8, condiciones, excepción de apertura con los IDs reales de producción) → versión nueva de `ah2-pilot-options`. Revisar vigencias para la semana a generar.
3. Con ambos: nueva revisión de Cloud Run, preview Netlify del SHA de #61 con `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL` = URL del servicio, recorrido autenticado real, conteos antes/después y promoción solo de al-iada según `docs/PUBLICACION_HIBRIDO_091.md`. Una preview usa otro origen: habilitarlo temporalmente y volver al canónico.

---

## RELEVO ANTERIOR — facturación/API informadas; sesión Google presente, consola y Shell inaccesibles · 20/11/2026

**Nueva información del propietario:** proyecto `aliada-horarios` creado, facturación vinculada y API Cloud Run habilitada. Autoriza completar despliegue CP-SAT, conexión y publicación controlada 091, con consumo mínimo y **cero instancias mínimas/en reposo**; sin Prestify ni gastos no autorizados. No pedir nuevamente crear proyecto, vincular facturación, habilitar esa API ni aprobar el alcance funcional.

### Evidencia de esta retoma

- Se leyó de nuevo CURRENT_WORK y PR #61: HEAD documental `14f104d6021154076c56a57a9fc31db81c845bab`, sin merge. Código congelado frontend `c5bcc0f604234850d8348f904347e84006a780c2`, backend `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`; conservar CI aprobada y ensayos, sin repetirlos.
- Cloud Run sobre la URL exacta del proyecto sigue mostrando **Site Unavailable / Unable to access this site**, incluso tras la recarga de esta retoma.
- **La sesión Google del propietario sí está presente:** abrir el acceso oficial de Google redirigió a su Cuenta de Google autenticada. No se pidieron ni leyeron contraseñas, tokens o cookies. Una pestaña nueva de verificación de Cloud Run con esa sesión siguió mostrando el mismo error. No confundir este bloqueo con falta de login Google.
- Cloud Shell del mismo proyecto (`https://shell.cloud.google.com/?project=aliada-horarios`) también devolvió Site Unavailable. Se registró el obstáculo, sin intentos de eludir controles ni otros proveedores. No hay conector suficiente Cloud Run ni gcloud/configuración/ADC/credencial Google en el entorno local.
- No se pudo inspeccionar IAM, facturación/cuotas o configuración efectiva de Cloud Run; las acciones del propietario son información recibida, no verificadas desde consola. **No se desplegó, conectó ni publicó. Cero instancias no fue aplicado todavía.** No recursos remotos creados, permisos cambiados, datos operativos transferidos/escritos, merges, cambios Netlify/Prestify ni gastos por esta retoma.

### Continuación exacta

La ejecución requiere un entorno con acceso operativo a la consola o Cloud Shell de Google Cloud, o un cliente autorizado ya autenticado. La cuenta Google del navegador ya está autenticada; no volver a solicitar credenciales solo por este error. No insistir en cambiar proyecto/facturación/API para resolver el acceso del entorno.

Con acceso efectivo, verificar proyecto/cuenta/costos reales y desplegar el contenedor aprobado con `min-instances=0`, facturación por solicitudes y límite inicial de una instancia/concurrencia uno; seleccionar CPU/memoria mínimas compatibles con la ejecución validada y sin CPU permanente. Esta es la configuración deseada, no una configuración aplicada ni una promesa de factura cero. Si la operación implica gastos no cubiertos/autorizados, presentar costo concreto antes de ejecutar. Después controles del servicio, sesión real, conteos, rollback y publicación únicamente 091/al-iada según `docs/PUBLICACION_HIBRIDO_091.md`.

Este relevo es solo documental. El código con CI aprobada permanece en los SHAs anteriores; no repetir instalación/build/tests por este documento.

---

## RELEVO ANTERIOR — proyecto Google Cloud informado; acceso a consola bloqueado · 20/11/2026

**Orden actual del propietario:** informa que creó el proyecto Google Cloud `aliada-horarios` y autoriza desplegar CP-SAT, conectarlo a Horarios y completar la publicación controlada exclusivamente para 091. Sin instalar otros servicios, generar gastos sin autorización ni afectar Prestify. No volver a pedir autorización funcional; interrumpir solo por autenticación/costos, salvo un bloqueo técnico de acceso que impida materialmente continuar.

### Comprobado en esta retoma

- Leídos CURRENT_WORK de #61, MASTER AH2-041 y guía de publicación. #61 sigue abierto/borrador y sin merge; código frontend **`c5bcc0f604234850d8348f904347e84006a780c2`**, CI **44782995884 SUCCESS**, verificada de nuevo sin ejecutar tests. Backend #6 **`5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`**, CI **44782328398 SUCCESS**. No rehacer ensayos.
- Intento sobre la URL exacta del propietario: `https://console.cloud.google.com/run?project=aliada-horarios`. El navegador de esta sesión muestra **Site Unavailable / Unable to access this site**, antes de una pantalla de autenticación. Se registró el obstáculo y se hizo una única recarga, con igual resultado. No se infiere que el proyecto no exista ni que Google esté caído; no fue posible verificar cuenta, proyecto, facturación, cuotas o permisos.
- Sin alternativa autenticada por comandos: no hay gcloud disponible, configuración gcloud, credenciales ADC ni variables de acceso Google/Cloud SDK en el entorno. No se instaló SDK, servicio ni proveedor alternativo, ni se solicitaron/extrajeron claves del navegador.
- **No desplegado ni conectado.** No se creó recurso Cloud Run, imagen remota, cuenta, permiso o facturación; no se fusionó/publicó #61, no se modificó Netlify/Prestify ni la BD. Sin transferencia de dotación y sin gastos realizados por esta retoma. Los conteos anteriores son antecedentes, no un control nuevo de despliegue.

### Próximo paso exacto

Continuar con acceso operativo autenticado al proyecto `aliada-horarios`, desde una sesión/entorno donde la consola o herramientas Google Cloud estén disponibles. Primero verificar proyecto/cuenta y facturación/costo real antes de crear recursos; si habilitar facturación o gastar es necesario, presentar la aprobación concreta. Reutilizar el contenedor y SHAs anteriores y la configuración privada ya conservada; después controles negativos del servicio, recorrido autenticado, conteos y rollback, promoción solo de al-iada y 091. No abrir otros proveedores ni repetir las etapas aprobadas. **El bloqueo actual es de acceso de esta sesión, no falta de código ni de autorización funcional.**

Este commit es **solo documental**; el código congelado con CI aprobada es `c5bcc0f604234850d8348f904347e84006a780c2`. No confundir su SHA con un HEAD documental posterior. No se volvió a ejecutar CI/build para este relevo.

---

## RELEVO ANTERIOR — motor híbrido dentro de Aliada Horarios existente · 20/11/2026

**Orden vigente del propietario:** cancelar el piloto independiente, reutilizar lo validado e integrar en Horarios; primera activación 091, generador anterior como respaldo, publicación controlada con rollback. Sin otra app, cambios Prestify ni gastos. MASTER AH2-041. No retomar instalaciones de Render ni otro sitio piloto.

### Candidato de publicación

- Rama activa: `feat/ah2-hibrido-integrado-091`, creada desde `main` **`a7006e48476226976d8b698881ac5274eb568a7d`**, coincidente con producción de Horarios. No fusionar #60 completo: sigue como evidencia de laboratorio.
- Fuente validada reutilizada: #60 HEAD documental `1adaecbb170e9614e597fd098a483f20ab300f71`, código `aa410f74717e5c02bc7041204354a99cce8dedeb`; #6 HEAD documental `2550fb91422355a5e8268df01e2c27154bb7164d`, código/contenedor `361d7271b417d55a8a80fa10b104697d19de2d61`.
- Cambios nuevos: selector 091 en Nueva semana, Auth y configuración privada, relectura de dotación/reglas reales antes de enviar, Worker híbrido y progreso/cancelación, adaptación al ResultadoAsignacion habitual, revalidación de ediciones desde snapshot y snapshot en el jsonb existente del historial/PDF. Contrato/objetivos/solver reutilizados, sin repetir el ensayo real.
- Activación requiere `VITE_AH2_HIBRIDO_091=true` y URL HTTPS CP-SAT; por defecto desactivada. Otras sucursales conservan la ruta previa. `src/utils/generacionMultiArranque.ts`, `netlify.toml` y funciones de pago permanecen idénticos a main base. Se excluyeron sitio piloto, páginas de laboratorio, contingencias/ciclos y el refinamiento experimental del multi-arranque.
- Domingo confirmado/modo prueba se incluyen solo en la activación 091; sin antecedente no se certifica descanso ni se guarda operativamente. No se alteran automáticamente condiciones/vigencias ni se transforma un sello de laboratorio en aprobación; la revalidación vuelve a comprobar plan, perfiles, condiciones y DIAS.

### SHAs y CI verificados durante preparación

- Primer candidato integrado `e9f24d18c7e8883fac01895f80c950d672fb20df`: CI `44782412210`, **test-build y browser SUCCESS**. Incluye Worker HTTPS/PDF/cancelación, selector 091 y regresiones de la ruta anterior. No equivale a servicio real desplegado ni Safari físico.
- Backend emparejado `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`: CI `44782328398` **SUCCESS**, 161 pytest / 1 omisión histórica, smoke, build Docker y ejecución HTTP del contenedor.
- Revisión final de esta entrega conserva también los mínimos de caja en el snapshot de generación, para no releer reglas posteriores al reexportar. TypeScript y las 9 pruebas de integración aprobados. Confirmar el SHA/CI de este ajuste en **PR #61**, que es el candidato vigente, no publicar el primer SHA por memoria. El commit que contiene este relevo tiene SHA posterior a los anteriores.

### Evidencia nueva y conservada

- TypeScript y build de la integración aprobados localmente; Worker híbrido emitido en dist. Pruebas nuevas de integración: 9 aprobadas; frontera Auth/HTTP reutilizada: 9; antecedente: 4. Backend: 7 pruebas HTTP aprobadas para `/v1/sesion` protegido/configuración privada; no se repitió el benchmark CP-SAT.
- Se releyó el checkpoint privado existente a través de la nueva adaptación/revalidación: **cero infracciones, 47 h faltantes y 0 sobrantes**; SIN VERIFICAR por ausencia del domingo real. Sin ejecutar nuevamente el solver ni extraer POM.
- La regresión local inicial dio 567 aprobadas/4 omitidas y una prueba de **multi-arranque experimental con condiciones** fuera del alcance de este candidato. Ese generador nuevo se excluyó para mantener el productivo exacto; su prueba permanece en #60, junto a cierre/ciclos. Verificar CI del SHA nuevo para el conjunto final.
- Playwright local no pudo arrancar Chromium (`socket() failed: Operation not permitted`); no equivale a prueba funcional aprobada. Los nuevos e2e de Worker HTTPS/adaptación/PDF/cancelación y selector 091/otras sucursales sí pasaron en la CI remota del primer candidato. Exigir la CI del ajuste final. No declarar ensayo real autenticado ni Safari físico.
- Evidencia matemática anterior se conserva: 355/402 h cubiertas, 47 faltantes, cero sobrantes; déficit diario 8 / 8 / 7,5 / 7,5 / 8 / 0 / 8. Primeros cinco objetivos OPTIMAL, resto FEASIBLE a 120 s; no óptimo total. No rehacer AH2-036–040.

### Estado real, límites y siguiente paso

**No publicado. No hay servicio CP-SAT operativo.** Netlify autenticado sí está disponible: se vio producción de Horarios bloqueada en deploy `6afba0e1c0b8e64caa476f2c`, SHA `a7006e4`; botón de republicación observado en deploy anterior. Prestify sigue bloqueado y publicado en `905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. No se pulsó publicación/desbloqueo/rollback ni se modificaron esos proyectos.

Cloud Run y Cloud Shell no abrieron en esta sesión. El bloqueo restante de infraestructura es **alojar el contenedor CP-SAT en infraestructura disponible del propietario**, con acceso operativo y sin activar facturación ni gastos. No pedir otra app/proveedor. Código del servicio ya preparado; configurar origen exacto de Horarios, Auth, usuario y sucursal solo en servidor. No afirmar A+B efectivo cuando solo corre A.

RLS real revisada en lectura en esta sesión amplia: 15 activos (8 cajeros/3 AUX/4 EVENTUAL), 5 reglas; otro usuario/anon/sesión anónima ven 0 mediante transacciones READ ONLY con roles/claims y ROLLBACK. Esto no sustituye login real. Configuración privada conservada como `Aliada_091_S48_config_piloto_privada.json`; reutilizarla solo en servidor, revisar vigencia/semana. No incluir IDs personales ni nombres en código/bundle/PR.

Conteos de preparación (solo lectura, misma cuenta/091): colaboradores **17** (15 activos), reglas **5**, semanas **18**, correcciones **38**, aprendizajes **0**. Refrescar antes/después del despliegue; no confundir este registro con un control posterior a publicación.

**Próxima acción exacta:** verificar CI y SHAs del candidato/#6; con acceso efectivo al alojamiento sin costo, ejecutar controles sintéticos del servicio y luego el recorrido autenticado en preview del mismo proyecto. Revisar Safari, conteos operativos y rollback antes de proponer la promoción concreta. Guía ejecutable: [PUBLICACION_HIBRIDO_091.md](PUBLICACION_HIBRIDO_091.md). No migraciones, escrituras/borrados operativos, cambios Prestify, merges, despliegue manual ni gastos realizados en esta preparación.

---

Relevo previo de producción conservado en Git: [CURRENT_WORK de main base](https://github.com/FernandoDelgadoDiaz/Estimapres/blob/a7006e48476226976d8b698881ac5274eb568a7d/docs/CURRENT_WORK.md). La historia del laboratorio permanece en #60.
