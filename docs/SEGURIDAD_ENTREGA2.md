# Seguridad de Entrega 2

## Apertura de PDF

El lector del navegador (`src/utils/pdfParser.ts`) y el lector local de Node que usan las comprobaciones de POM y los PDF exportados pasan `isEvalSupported: false` a PDF.js. La prueba `pdfSeguridad.test.ts` verifica la opción que recibe la biblioteca en ambas rutas. [Aviso de PDF.js para CVE-2024-4367](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)

**Deuda técnica.** El lockfile conserva `pdfjs-dist 3.11.174`. En una actualización posterior, migrar a una versión mantenida que incluya la corrección y probar el worker de Vite, el POM de referencia y la relectura de los PDF A4. Mantener la evaluación desactivada. La mitigación de este release será efectiva en producción al publicar el nuevo build.

## Roster y datos operativos

Las cuentas leen el padrón de su sucursal desde Supabase. Cargar una pantalla no escribe colaboradores ni recupera ejemplos. Los grupos vacíos se conservan y las ediciones y altas explícitas mantienen los IDs existentes. El modo local conserva su propio padrón. La decisión para una futura importación supervisada está en [MASTER §9, AH2-013](ALIADA_HORARIOS_MASTER.md#9-registro-único-de-decisiones).

La verificación de Supabase se conserva en [Issue #5](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/5#issuecomment-6839785095). Este cambio no requiere migraciones.

## Reversión

`al-iada` y `prestify` despliegan al fusionar a `main`. Antes del merge, confirmar una sesión con permisos para publicar en ambos sitios y conservar como referencia los deploys de Entrega 1 en `8aa104d`.

| Sitio | Deploy de reversión |
|---|---|
| al-iada | [6af6266feb1a7e267dfa1aa8](https://app.netlify.com/projects/al-iada/deploys/6af6266feb1a7e267dfa1aa8) |
| prestify | [6af6266f137817f4541290c9](https://app.netlify.com/projects/prestify/deploys/6af6266f137817f4541290c9) |

Si hay una regresión, seleccionar el deploy anterior y usar **Publish deploy** en el sitio afectado. Comprobar el SHA activo y pausar la autopublicación si se necesita mantener esa versión mientras se corrige. La reversión restaura el frontend anterior, incluida su carga histórica de roster y el lector PDF anterior. Si se revierte Aliada, pausar el piloto hasta publicar otra vez un build corregido. [Procedimiento oficial de Netlify](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#rollbacks)
