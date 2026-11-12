> **DOCUMENTO HISTÓRICO — NO VIGENTE (Fase 0 de Aliada Horarios 2.0, 2026-11-12).** Las atribuciones de autoridad a un modelo («AUTORIDAD: Claude», «implementar exactamente lo definido por Claude», registrar decisiones aquí) quedaron **reemplazadas**. Autoridad: el propietario. Fuente normativa: [`docs/ALIADA_HORARIOS_MASTER.md`](../docs/ALIADA_HORARIOS_MASTER.md); protocolo: [`AGENTS.md`](../AGENTS.md); estado: [`docs/CURRENT_WORK.md`](../docs/CURRENT_WORK.md). Se conserva solo como antecedente.

---
# CONTRATOS — ESTIMAPRES

## Lender
{
  uid: string,
  email: string,
  nombre_completo: string,
  dni: string,
  nombre_negocio: string,
  ciudad: string,
  tna: number,
  dia_vencimiento: number (1-28),
  gastos_admin: number,
  whatsapp: string,
  pay_method: 'mp' | 'manual',
  mp_token: string,
  mp_public_key: string,
  status: 'pendiente' | 'activo' | 'pausado',
  onboarding_done: boolean,
  firma_base64: string
}
---