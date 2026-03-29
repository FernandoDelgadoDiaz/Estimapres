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