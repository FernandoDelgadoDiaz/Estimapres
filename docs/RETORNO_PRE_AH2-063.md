# Punto de retorno: volver a la versión anterior a AH2-063 (rotación mensual)

Pedido del propietario (23/11/2026): poder volver siempre a la versión vigente antes de publicar AH2-063.

## La versión a la que se vuelve
- **Código:** `main@1f46a570de5c8f9faa89b7de75f7247438f01751` (AH2-047 … AH2-062). Queda guardada para siempre en la rama **`retorno/pre-ah2-063`**: no se modifica ni se borra.
- **Netlify (producción):** deploy **`6b0445415809b6e33efd8a88`** (publicado el 23/11/2026).
- **Cloud Run:** sin cambios en AH2-063 (`aliada-optimizer-00010-29t`). No hay que tocarlo.
- **Base de datos:** AH2-063 no tiene migraciones. No hay que tocarla.

## Opción 1 — Rápida (minutos, sin programar)
1. Entrar a https://app.netlify.com/projects/al-iada/deploys/6b0445415809b6e33efd8a88
2. Tocar **Publish deploy**.
3. Listo: horarios.aliadaapps.com vuelve a la versión anterior.

Netlify conserva los deploys viejos por un tiempo limitado según el plan. Si ese deploy ya no aparece, usar la Opción 2.

## Opción 2 — Permanente (siempre disponible)
1. En GitHub, revertir el commit de AH2-063 en `main` (PR #89; botón **Revert** del PR, o `git revert <sha del merge de #89>`), o reemplazar el contenido por la rama `retorno/pre-ah2-063`.
2. Fusionar el PR de reversión.
3. En Netlify, publicar el deploy nuevo de `main` (**Publish deploy**).

## Qué pasa con los datos al volver
- Las semanas generadas con AH2-063 siguen siendo válidas: tienen el mismo formato.
- Las reglas nuevas que se hayan cargado (**«Prefiere trabajar los domingos»** y el **margen de Rotación de horarios**) quedan guardadas, pero la versión anterior no las usa. Si se quieren borrar, se hace desde Configuración o con este SQL, que borra solo esos dos tipos:
  ```sql
  delete from reglas_configurables
  where parametros->>'tipo' in ('prefiere_domingos', 'margen_continuidad');
  ```

## Alternativa sin volver de versión
Para quitar solo la continuidad dentro del mes, sin volver atrás: Configuración → **Rotación de horarios** → poner el margen en **0**. La rotación al cambiar de mes y el reparto de domingos siguen activos.
