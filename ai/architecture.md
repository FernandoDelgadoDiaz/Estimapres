---
# ARCHITECTURE LOCK — ESTIMAPRES v2.0
# MIGRATION: Firebase → Supabase
# FECHA: 2026-03-28
# AUTORIDAD: Claude (Anthropic)

STACK:
- Frontend: HTML/CSS/JS vanilla
- Auth: Supabase Auth (email/password)
- DB: Supabase PostgreSQL (proyecto AL-iada, prefijo ep_)
- Pagos: MercadoPago (Netlify Functions, sin cambios)
- Deploy: Netlify

TABLAS:
- ep_lenders
- ep_settings

SUPER_ADMIN: identificado por email, NO por UID hardcodeado

MÓDULOS A MIGRAR (en orden):
1. Auth (signUp, signIn, signOut, onAuthStateChange)
2. Onboarding (guardar en ep_lenders + ep_settings)
3. SuperAdmin (listar, activar, suspender)
4. Status listener (tiempo real con sb.channel)
5. Panel prestamista

PROHIBIDO:
- Cambiar UI/CSS
- Cambiar lógica de MercadoPago
- Tomar decisiones fuera de este documento
---