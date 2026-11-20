-- PREPARADA, NO APLICADA. Requiere aprobación del propietario antes de ejecutarse en al-iada horarios.
-- AH2-042 · Configuración editable del motor híbrido por sucursal: reglas PERMANENTES y EXCEPCIONES TEMPORALES.
-- No cambia el motor matemático: guarda datos que el cliente resuelve por FECHA al formato que el motor ya valida.
--
-- Garantías de integridad (no dependen del cliente):
--  * Aislamiento: RLS por usuario autenticado no anónimo; todas las consultas filtran por (local_id, sucursal_id).
--  * Sin superposición ambigua: una restricción de exclusión impide dos reglas ACTIVAS de la misma clase y el mismo
--    alcance (sucursal + tipo + persona/condición) con fechas superpuestas. Permanente y temporal sí pueden convivir:
--    la temporal es la excepción.
--  * Escrituras SOLO mediante funciones atómicas (cms_crear, cms_reemplazar, cms_desactivar, cms_importar): sin
--    INSERT/UPDATE/DELETE directos. Cada función toca únicamente las filas indicadas; nunca borra.
--  * Concurrencia optimista: cada fila tiene `version`; reemplazar o desactivar exige la versión leída y bloquea la
--    fila (FOR UPDATE). Si otro usuario/pestaña la cambió antes → error CONFLICTO_CONCURRENTE, sin cambios.
--  * Historial: reemplazar cierra la versión anterior (vigencia_hasta) o la desactiva, y enlaza la nueva (reemplaza_a).
--  * Escala (160 sucursales): un único esquema, índices por (local_id, sucursal_id), sin datos de sucursal en el código.

create extension if not exists btree_gist;

create table if not exists public.configuracion_motor_sucursal (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  sucursal_id text not null check (length(sucursal_id) between 1 and 32),
  clase text not null check (clase in ('permanente', 'temporal')),
  tipo text not null check (tipo in ('topes_caja_eventual_contrato', 'perfil_caja_eventual',
                                     'excepcion_apertura_aux_unico', 'condicion_supervisor')),
  colaborador_id uuid,
  vigencia_desde date not null,
  vigencia_hasta date,
  datos jsonb not null,
  activa boolean not null default true,
  motivo text not null default '' check (length(motivo) <= 500),
  version integer not null default 1,
  reemplaza_a uuid references public.configuracion_motor_sucursal (id),
  creado_por uuid not null default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  desactivada_en timestamptz,
  -- Alcance de precedencia: persona (perfiles), identificador de condición, o la sucursal.
  alcance text generated always as (
    coalesce(colaborador_id::text, '') ||
    case when tipo = 'condicion_supervisor' then '|' || coalesce(datos ->> 'id', '') else '' end) stored,
  constraint cms_temporal_con_fin check (clase = 'permanente' or vigencia_hasta is not null),
  constraint cms_vigencia_ordenada check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  constraint cms_alcance_segun_tipo check (
    (tipo = 'perfil_caja_eventual' and colaborador_id is not null) or
    (tipo in ('topes_caja_eventual_contrato', 'excepcion_apertura_aux_unico') and colaborador_id is null) or
    tipo = 'condicion_supervisor'),
  constraint cms_datos_por_tipo check (
    jsonb_typeof(datos) = 'object' and (
      (tipo = 'topes_caja_eventual_contrato' and datos ? 'FULL' and datos ? 'PART') or
      (tipo = 'perfil_caja_eventual' and datos ? 'acreditacion') or
      (tipo = 'excepcion_apertura_aux_unico' and datos ? 'franjas' and coalesce(jsonb_typeof(datos -> 'franjas') = 'array', false)) or
      (tipo = 'condicion_supervisor' and datos ? 'id' and datos ? 'tipo' and datos ? 'modo'))),
  constraint cms_desactivada_coherente check (activa or desactivada_en is not null),
  constraint cms_sin_superposicion exclude using gist (
    local_id with =, sucursal_id with =, tipo with =, alcance with =, clase with =,
    daterange(vigencia_desde, vigencia_hasta, '[]') with &&) where (activa)
);

create index if not exists idx_cms_local_sucursal
  on public.configuracion_motor_sucursal (local_id, sucursal_id, activa, vigencia_desde);

alter table public.configuracion_motor_sucursal enable row level security;

-- Lectura: solo filas propias, sesión no anónima.
drop policy if exists "cms_select_propias" on public.configuracion_motor_sucursal;
create policy "cms_select_propias" on public.configuracion_motor_sucursal for select to authenticated
  using (local_id = (select auth.uid()) and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- Sin políticas de escritura: las tablas solo se modifican mediante las funciones de abajo.
revoke insert, update, delete on public.configuracion_motor_sucursal from anon, authenticated;
grant select on public.configuracion_motor_sucursal to authenticated;

-- ── Funciones de escritura (SECURITY DEFINER con verificación explícita de identidad) ─────────────────────────────
create or replace function public.cms_usuario() returns uuid
language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  return u;
end $$;

create or replace function public.cms_insertar(p jsonb, p_reemplaza uuid default null)
returns public.configuracion_motor_sucursal
language plpgsql security definer set search_path = '' as $$
declare r public.configuracion_motor_sucursal;
begin
  insert into public.configuracion_motor_sucursal
    (local_id, creado_por, sucursal_id, clase, tipo, colaborador_id, vigencia_desde, vigencia_hasta, datos, motivo, reemplaza_a)
  values (public.cms_usuario(), public.cms_usuario(), p ->> 'sucursal_id', p ->> 'clase', p ->> 'tipo',
          nullif(p ->> 'colaborador_id', '')::uuid, (p ->> 'vigencia_desde')::date, nullif(p ->> 'vigencia_hasta', '')::date,
          p -> 'datos', coalesce(p ->> 'motivo', ''), p_reemplaza)
  returning * into r;
  return r;
end $$;

-- Crear una regla nueva. Falla (sin efectos) si se superpone con otra activa de la misma clase y alcance.
create or replace function public.cms_crear(p jsonb) returns public.configuracion_motor_sucursal
language plpgsql security definer set search_path = '' as $$
begin
  return public.cms_insertar(p, null);
end $$;

-- Reemplazar una regla desde una fecha, atómicamente: cierra (o desactiva si la nueva empieza antes o igual) la
-- anterior y crea la nueva enlazada. Exige la versión leída: si cambió, CONFLICTO_CONCURRENTE y nada se modifica.
create or replace function public.cms_reemplazar(p_id uuid, p_version integer, p jsonb)
returns public.configuracion_motor_sucursal
language plpgsql security definer set search_path = '' as $$
declare a public.configuracion_motor_sucursal; u uuid := public.cms_usuario(); desde date := (p ->> 'vigencia_desde')::date;
begin
  select * into a from public.configuracion_motor_sucursal where id = p_id and local_id = u for update;
  if not found then raise exception 'NO_ENCONTRADA' using errcode = 'P0002'; end if;
  if a.version <> p_version then raise exception 'CONFLICTO_CONCURRENTE' using errcode = '40001'; end if;
  if not a.activa then raise exception 'REGLA_INACTIVA' using errcode = '22023'; end if;
  if a.sucursal_id <> p ->> 'sucursal_id' or a.tipo <> p ->> 'tipo' or a.clase <> p ->> 'clase'
     or a.colaborador_id is distinct from nullif(p ->> 'colaborador_id', '')::uuid then
    raise exception 'ALCANCE_DISTINTO' using errcode = '22023';
  end if;
  if desde <= a.vigencia_desde then
    update public.configuracion_motor_sucursal set activa = false, desactivada_en = now(), version = version + 1, actualizado_en = now()
      where id = a.id;
  else
    update public.configuracion_motor_sucursal set vigencia_hasta = desde - 1, version = version + 1, actualizado_en = now()
      where id = a.id;
  end if;
  return public.cms_insertar(p, a.id);
end $$;

-- Desactivar una regla (sin borrar). Solo esa fila; exige la versión leída.
create or replace function public.cms_desactivar(p_id uuid, p_version integer)
returns public.configuracion_motor_sucursal
language plpgsql security definer set search_path = '' as $$
declare r public.configuracion_motor_sucursal; u uuid := public.cms_usuario();
begin
  select * into r from public.configuracion_motor_sucursal where id = p_id and local_id = u for update;
  if not found then raise exception 'NO_ENCONTRADA' using errcode = 'P0002'; end if;
  if r.version <> p_version then raise exception 'CONFLICTO_CONCURRENTE' using errcode = '40001'; end if;
  if not r.activa then return r; end if;
  update public.configuracion_motor_sucursal set activa = false, desactivada_en = now(), version = version + 1, actualizado_en = now()
    where id = p_id returning * into r;
  return r;
end $$;

-- Importación inicial: todas las filas o ninguna (una sola transacción).
create or replace function public.cms_importar(p_filas jsonb) returns setof public.configuracion_motor_sucursal
language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 500 then
    raise exception 'IMPORTACION_INVALIDA' using errcode = '22023';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    return next public.cms_insertar(f, null);
  end loop;
end $$;

revoke all on function public.cms_usuario(), public.cms_insertar(jsonb, uuid), public.cms_crear(jsonb),
  public.cms_reemplazar(uuid, integer, jsonb), public.cms_desactivar(uuid, integer), public.cms_importar(jsonb) from public, anon;
grant execute on function public.cms_crear(jsonb), public.cms_reemplazar(uuid, integer, jsonb),
  public.cms_desactivar(uuid, integer), public.cms_importar(jsonb) to authenticated;

-- Rollback (solo con aprobación y si no hay datos que conservar):
--   drop function if exists public.cms_importar(jsonb), public.cms_desactivar(uuid, integer),
--     public.cms_reemplazar(uuid, integer, jsonb), public.cms_crear(jsonb), public.cms_insertar(jsonb, uuid), public.cms_usuario();
--   drop table if exists public.configuracion_motor_sucursal;
