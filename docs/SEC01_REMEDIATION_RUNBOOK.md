# SEC-01 — Runbook de remediación de la exposición del proxy Anthropic

**Issue:** [#4](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/4) · **PR:** [#15](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/15) · **Estado:** preparado por Claude (2026-11-12), **no ejecutado**. Los pasos marcados 🔐 requieren al propietario (credenciales / producción).

## 1. Situación verificada (2026-11-12)

| Hecho | Evidencia |
|---|---|
| El repo despliega **dos** sitios Netlify desde `main`: `al-iada` (`52ae0ab4-…`) y `prestify` (`6f56c841-…`). Todo merge a `main` publica **ambos** en producción | Netlify API (lectura): deploy de producción `6af5ff7184f60b0849ef3c79` = commit `9909e87` (merge de PR #2), `context: production`, funciones `claude-proxy`, `create-payment`, `webhook-mp` |
| Producción sirve el relé vulnerable | `scripts/sec01-verify-proxy.sh`: `al-iada.netlify.app` y `prestify.netlify.app` → OPTIONS 200 `Access-Control-Allow-Origin: *` |
| Los **deploys antiguos** conservan su función: previews (`deploy-preview-2--*`) y *permalinks* (`https://<deploy-id>--al-iada.netlify.app`) | mismo script → VULNERABLE en ambos |
| El PR #15 corrige el código | `deploy-preview-15--*` → OPTIONS 204 sin CORS, GET 405, POST 503 |
| Existencia de `CLAUDE_API_KEY` en Netlify | **No verificada** (leerla expondría el valor; probarla exige un POST que usa la clave) |

**Consecuencia:** desplegar PR #15 solo protege el deploy nuevo. Cada deploy antiguo desde que existe la función (julio 2026) sigue siendo un relé mientras la clave que se le inyectó en su momento siga válida. Las variables de entorno de una función quedan fijadas al desplegar: **borrar la variable en Netlify no afecta a los deploys viejos**. La única medida que los neutraliza a todos es **revocar la clave en Anthropic**.

## 2. Pasos (en este orden)

1. 🔐 **Revocar la clave en Anthropic** (Console → API Keys): desactivar/borrar la clave usada como `CLAUDE_API_KEY` en `al-iada` y `prestify`. Si no hay ninguna clave o nunca se cargó, registrarlo en #4. Revisar en Console → Usage si hubo consumo no reconocido desde julio 2026.
2. 🔐 **Netlify, ambos sitios** → Site configuration → Environment variables: eliminar `CLAUDE_API_KEY` (y cualquier `VITE_CLAUDE_API_KEY` / `VITE_ANTHROPIC_API_KEY`, que además quedarían incrustadas en el bundle). No crear una nueva hasta la solución autenticada.
3. 🔐 **Autorizar merge de PR #15** → despliegue automático de producción en ambos sitios.
4. **Verificar** (cualquier desarrollador, sin riesgo de gasto):
   ```bash
   scripts/sec01-verify-proxy.sh https://al-iada.netlify.app https://prestify.netlify.app
   # tras el paso 1, también:
   scripts/sec01-verify-proxy.sh --post https://al-iada.netlify.app https://prestify.netlify.app https://deploy-preview-2--al-iada.netlify.app
   ```
   Esperado en producción: `SEGURO OPTIONS=204 ACAO=none GET=405 POST=503`. Los deploys antiguos seguirán marcando VULNERABLE por CORS, pero con la clave revocada su POST devuelve el error de autenticación de Anthropic (no hay consumo); registrar ese código en #4.
5. Opcional 🔐: si el plan de Netlify lo permite, activar protección por contraseña / acceso de visitantes para *deploy previews* y permalinks; y valorar si `prestify` debe seguir desplegando este repo (decisión de producto).
6. Registrar en #4: fecha de revocación, salida del script y decisión sobre el paso 5.

## 3. Qué NO resuelve esta mitigación
La solución definitiva autenticada (JWT, payload tipado, allowlist de modelo/`max_tokens`, cuotas y tope de gasto) queda pendiente en #4 / F3 (#14). Hasta entonces, las sugerencias IA permanecen desactivadas; el motor de horarios no depende de ellas.
