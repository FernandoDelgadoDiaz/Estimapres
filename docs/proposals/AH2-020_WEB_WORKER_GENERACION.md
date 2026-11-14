# PROPUESTA — Generación de horarios en un Web Worker (AH2-020)

**Estado:** PROPUESTO. Va en un PR separado del #45, que no se amplía con esto. No requiere migraciones, Supabase, Netlify ni Prestify.

## 1. Problema medido

La generación (multi-arranque con respaldo) es síncrona y corre en el hilo de la interfaz. Mientras calcula, la pantalla no responde: no hay scroll, ni clics, ni animaciones.

Medición en navegador (`e2e/rendimiento.perf.ts`, build de producción, Chromium; la CPU se ralentiza por CDP para emular equipos lentos). Valores en segundos: tarea larga más larga = interfaz congelada.

| Dotación (cajeros) | Respaldo solo, 1× | Respaldo solo, 4× | Respaldo solo, 6× | **Multi-arranque, 1×** | **Multi-arranque, 4×** | **Multi-arranque, 6×** |
|---|---|---|---|---|---|---|
| 9 (tamaño 091) | 0,2 | 0,5 | 0,7 | **0,5** | **2,0** | **3,0** |
| 20 | 0,3 | 1,2 | 1,9 | **1,1** | **4,7** | **7,4** |
| 35 | 0,6 | 2,3 | 3,2 | **3,2** | **13,8** | **20,6** |
| 55 | 0,7 | 3,0 | 4,5 | **3,3** | **13,8** | **21,2** |

- El multi-arranque multiplica el congelamiento entre 3 y 5,5 veces.
- En la 091 (9 cajeros) el congelamiento es tolerable: menos de 1 s en equipos normales y unos 3 s en equipos muy lentos.
- Con dotaciones de 20 o más en equipos lentos supera los 5 s. Chrome puede ofrecer «La página no responde».
- Con 35 a 6×, el presupuesto de 20 s se agotó en una de dos corridas y se omitió `alternada-ms-2`. **En equipos lentos el resultado puede depender del equipo.** Queda registrado en `generacion.omitidas`, pero no es reproducible entre equipos.
- Mitigación ya incluida en el PR #45: antes de calcular se cede un cuadro, así el indicador «generando…» llega a pintarse. Medido: antes no se pintaba; ahora sí, en las 12 combinaciones. **No resuelve el congelamiento.**

## 2. Propuesta

1. `src/workers/generacion.worker.ts` (worker de tipo módulo; Vite lo empaqueta con `new Worker(new URL('./generacion.worker.ts', import.meta.url), { type: 'module' })`):
   - recibe por `postMessage` la entrada ya convertida (`InputAlgoritmo`, cajeros, auxiliares, eventuales y contexto de validación; todos son datos serializables);
   - ejecuta `generarConMultiArranque` y devuelve `{ resultado, seleccion }`.
2. `asignarHorariosConIA` usa el worker si `typeof Worker !== 'undefined'`. Si no está disponible (o en pruebas), corre en el hilo principal como hoy. **Mismo resultado** en ambos caminos; se verifica con una prueba de equivalencia.
3. Interfaz: indicador con estado («Calculando alternativas…») y botón **Cancelar** (`worker.terminate()`), que vuelve al estado previo sin guardar.
4. Progreso opcional: el worker emite `{ estrategia, i, n }` por candidato.
5. **Determinismo:** el presupuesto de 20 s y el de 6 s de la pasada 1 siguen midiendo tiempo real. El worker no los acelera; solo libera la interfaz. Para que el resultado no dependa del equipo, se puede cambiar el corte por tiempo por un corte **por trabajo** (número fijo de pasadas y estrategias), dejando el tiempo solo como límite de seguridad. Esto cambia el comportamiento del motor, así que requiere decisión del propietario.

## 3. Pruebas propuestas

- Equivalencia worker / hilo principal sobre los 40 escenarios sintéticos y la semana 47.
- Playwright: durante la generación la interfaz responde (un clic en otro control se procesa en < 200 ms) y Cancelar funciona.
- `e2e/rendimiento.perf.ts`: tarea larga máxima < 200 ms en el hilo principal para 9, 20, 35 y 55 cajeros a 1×, 4× y 6×.

## 4. Esfuerzo y riesgo

- Esfuerzo: 0,5–1 día, más pruebas.
- Riesgo: bajo. El cálculo no cambia y el respaldo en el hilo principal se conserva.

## 5. Recomendación

- Para la 091 actual (9 cajeros), el PR #45 es aceptable sin worker.
- **Antes de habilitar sucursales con 20 o más cajeros, o si se esperan equipos lentos**, conviene incorporar este worker. El corte por trabajo del punto 2.5 también es recomendable para que el resultado sea reproducible.
