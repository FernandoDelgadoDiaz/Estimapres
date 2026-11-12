# Entrega 1 — Seguridad, CI, rutas y privacidad: publicación, verificación y reversión

**Estado:** preparado por Claude (2026-11-12). **No ejecutado.** Requiere la autorización consolidada del §8.
**Release candidato completo:** PR #30 (`release/ah2-f1`, CI aprobado). **Entrega 1:** PR de la rama `release/ah2-f1-entrega1`, que es un **prefijo exacto del #30**.

## 1. Alcance

| Incluye | PR | Efecto en producción |
|---|---|---|
| Lockfile + CI | #16 | Ninguno visible. CI en cada PR |
| Proxy Anthropic bloqueado + runbook | #15 | `/.netlify/functions/claude-proxy` → 503. Desaparece la alerta opcional «💡» |
| Fallback SPA | #26 | `/nueva-semana`, `/colaboradores`, etc. dejan de dar 404 al recargar |
| Nombres sintéticos | #27 | El JS publicado deja de contener nombres de personas. El roster de ejemplo (solo para sucursales vacías) pasa a «Full A», «Part A», … |
| Documentación | #25 + este documento | Ninguno |

**No incluye:** contrato POM (#17), IDs (#18), validador (#19), **motor con 12 h reales (#20)**, validación en UI/PDF (#21), reglas v2 (#22) ni AUX/eventuales (#29). Quedan en el #30 para una entrega posterior.

**Verificado sobre `77d4e14`** (contenido de código de la entrega 1):
- `npm ci` ✅, vitest **99/99**, `tsc` ✅, build ✅.
- **El motor produce exactamente lo mismo que `main`**: se comparó la salida completa sobre el fixture, aplicando el mapeo de nombres.
- El bundle no contiene nombres ni `anthropic.com` / `dangerouslyAllowBrowser`.
- Diff contra `main`: en `src/algoritmo` solo cambian nombres de fixtures y tests y un comentario.
- Sin migraciones, sin cambios en Supabase ni en variables.

## 2. Riesgos del despliegue

Un merge a `main` dispara un build de producción en **dos sitios Netlify** que publican este mismo repositorio. Estado verificado por la API de Netlify (solo lectura):

| Sitio | Deploy de producción actual (rollback) | Commit | Riesgo específico |
|---|---|---|---|
| `al-iada.netlify.app` | `6af5ff7184f60b0849ef3c79` | `9909e87` | Sitio operativo de la sucursal 091 |
| `prestify.netlify.app` | `6af5ff713eac55707eeb3c28` | `9909e87` | Publica **la misma app** Aliada Horarios (y las funciones de pago `create-payment` / `webhook-mp`, que no cambian). Si `prestify` debía servir otro producto, es un tema previo, independiente de esta entrega |

| Riesgo | Probabilidad / impacto | Mitigación |
|---|---|---|
| El build falla en Netlify por el lockfile nuevo | Baja: los *deploy previews* de #16, #26 y #30 compilaron en **ambos** sitios | Si falla, Netlify mantiene el deploy anterior publicado (no hay corte) |
| Las rutas profundas quedan tapadas por el fallback | Baja: verificado en el preview de #26/#30 (assets 200, funciones 405/503) | Rollback §6 |
| Un usuario pierde la sugerencia «💡» de IA | Esperado: es la mitigación de seguridad | — |
| Una sucursal **vacía** siembra el roster de ejemplo con nombres sintéticos | Solo si se crea una sucursal sin colaboradores. La 091 ya tiene roster | Ninguna acción |
| Deploys viejos (permalinks y previews) siguen sirviendo el proxy viejo y los nombres | Seguro: el merge no los cambia | **Lote 0** (revocar la clave). Opcional: borrar o proteger deploys viejos en Netlify |
| **Squash o rebase** del PR | **Alto**: verificado, provoca conflictos al integrar luego el resto del #30 | Usar **«Create a merge commit»** (§4) |

## 3. Prerrequisitos (propietario, antes del merge)
1. **Revocar o rotar** en la consola de Anthropic la clave usada como `CLAUDE_API_KEY` (o confirmar que no existe). Revisar el consumo desde julio de 2026.
2. Netlify, **ambos sitios** → *Environment variables*: eliminar `CLAUDE_API_KEY`, `VITE_CLAUDE_API_KEY` y `VITE_ANTHROPIC_API_KEY` si existen.
3. Elegir un momento sin uso de la app (el build tarda alrededor de 1 minuto por sitio).

## 4. Publicación
1. En el PR de la entrega 1, quitar el modo borrador y confirmar que el check `test-build` está en verde.
2. **Merge con «Create a merge commit»**. **No** usar «Squash and merge» ni «Rebase and merge»: rompen la integración posterior del #30 (verificado). **No** borrar la rama.
3. Netlify construye y publica `al-iada` y `prestify` desde `main` automáticamente.
4. Anotar en la épica #3 el SHA del merge y los IDs de deploy nuevos de cada sitio.

## 5. Verificación posterior (sin escribir datos)
Desde cualquier terminal con el repositorio:
```bash
# 1. Proxy cerrado en ambos sitios (tras el prerrequisito 1 se puede agregar --post)
scripts/sec01-verify-proxy.sh https://al-iada.netlify.app https://prestify.netlify.app
#    esperado: SEGURO  OPTIONS=204 ACAO=none GET=405

# 2. Rutas profundas
for s in al-iada prestify; do for r in / /nueva-semana /colaboradores /reglas; do
  printf "%s%s -> " $s $r; curl -s -o /dev/null -w '%{http_code}\n' https://$s.netlify.app$r; done; done
#    esperado: 200 en todas

# 3. El bundle no publica nombres ni el SDK de IA
for s in al-iada prestify; do js=$(curl -s https://$s.netlify.app/ | grep -o 'assets/index-[^"]*\.js' | head -1)
  printf "%s: " $s; curl -s https://$s.netlify.app/$js | grep -c -i -E "Mansilla|Alanoca|Ciarlante|Oyarzo|api\.anthropic\.com|dangerouslyAllowBrowser"; done
#    esperado: 0
```
Prueba manual en `al-iada`, sin generar:
- Iniciar sesión.
- Recargar `/nueva-semana`.
- Subir el POM y llegar a «Revisar».
- **Solo** apretar «Generar» si es la generación semanal real (escribe historial, como siempre).

Registrar los resultados en la épica #3.

## 6. Reversión (rollback)
**Inmediata, sin código (cada sitio por separado):** Netlify → *Deploys* → abrir el deploy anterior → **«Publish deploy»**.
- al-iada → `6af5ff7184f60b0849ef3c79`
- prestify → `6af5ff713eac55707eeb3c28`

Al publicar un deploy anterior, Netlify **bloquea la publicación automática** del sitio. Hay que reactivarla («Unlock / Start auto publishing») cuando se corrija el problema.

**Efecto de revertir:** vuelven el proxy viejo (inofensivo si la clave está revocada), los 404 al recargar y los nombres en el JS.

**Reversión en el repositorio** (si hace falta que `main` deje de contener la entrega): PR con `git revert -m 1 <SHA-del-merge>`.
> ⚠️ Si se revierte el merge en `main`, antes de integrar el resto del #30 hay que **revertir la reversión** (`git revert <SHA-del-revert>`). Si no, Git considera ya integrados esos commits y el #30 entraría **sin** los cambios de la entrega 1.

## 7. Después de la entrega 1
- El resto del #30 se integra **más tarde**, con otro «Create a merge commit» del #30 sobre `main`. Requiere autorización propia, porque #20 cambia los horarios generados.
- **Verificado por simulación:** `main` + merge de la entrega 1 + merge del #30 → **sin conflictos**, **árbol idéntico** a `release/ah2-f1` y **0 commits duplicados**. Con squash o rebase, en cambio, hay conflictos.

## 8. Validación del PDF POM real (sin exponer datos ni escribir en Supabase)
Se hace **en la computadora del propietario**, nunca en un *deploy preview* ni en producción.

**A. Contrato del PDF (solo números en pantalla):**
```bash
git clone https://github.com/FernandoDelgadoDiaz/Estimapres && cd Estimapres
git checkout release/ah2-f1            # contiene el contrato POM v2 (#17)
npm ci
POM_PDF="/ruta/FUERA/del/repo/Programacion semanal 2026-11-16 - 2026-11-22.pdf" npx vitest run pom-real.local
```
- Corre en Node, sin red y sin Supabase. Imprime solo la semana, las horas-caja por día, el máximo y los avisos.
- Esperado: semana `2026-11-16`–`2026-11-22`, **406 horas-caja**, pico 7 el sábado 19:30–21:00.
- Si falla, copiar **solo el mensaje de error** en #8. Nunca el PDF ni nombres.

**B. Recorrido completo en local (opcional):**
1. Verificar que **no exista** un archivo `.env` con `VITE_SUPABASE_*` (`ls .env*`; solo debe aparecer `.env.example`).
2. `npm run dev`, abrir `http://localhost:5173` en una **ventana privada**.
3. Sin variables de Supabase la app funciona en **modo local** (localStorage): **no hay escritura posible** en la base.
4. Cargar el roster en Colaboradores (solo queda en ese navegador), subir el POM, generar, revisar el estado de validación y exportar el PDF.
5. Cerrar la ventana privada para borrar los datos locales.

**Reglas:**
- El PDF debe estar fuera de la carpeta del repo. `*.pdf` está en `.gitignore` como protección adicional.
- No usar *deploy previews* con sesión de la sucursal: pueden compilar con las variables de Supabase y escribir historial real.
- No pegar en GitHub capturas, nombres ni horarios individuales. Solo métricas agregadas.

## 9. Solicitud consolidada de autorización — entrega 1
Se pide al propietario, en un solo acto:
1. **Lote 0:** revocar o rotar la clave de Anthropic y quitar las variables de IA en ambos sitios de Netlify (§3).
2. **Merge** del PR de la entrega 1 con **«Create a merge commit»** a `main`, con el **despliegue automático** resultante en `al-iada` y `prestify` (§4).
3. **Ejecutar la verificación del §5** y, si algo falla, **el rollback del §6** sin pedir una nueva autorización.

**No se pide:** integrar el resto del #30, migraciones, cambios de visibilidad ni reescritura del historial (#23).
