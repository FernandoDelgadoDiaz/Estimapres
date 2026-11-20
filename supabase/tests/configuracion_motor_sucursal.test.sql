-- Pruebas de integridad, aislamiento, atomicidad y concurrencia de configuracion_motor_sucursal (AH2-042).
-- Se ejecutan con scripts/db/probar-configuracion-motor.sh sobre un Postgres local efímero. Datos sintéticos.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(u text, anonimo boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'is_anonymous', anonimo)::text, false) $$;
create or replace function pg_temp.falla(sql text, esperado text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(esperado in sqlerrm) = 0 and sqlstate <> esperado then raise exception 'Falló con "%" (%) y se esperaba %', sqlerrm, sqlstate, esperado; end if;
    return;
  end;
  raise exception 'Debía fallar con %: %', esperado, sql;
end $$;
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLA: %', msg; end if; end $$;

set role authenticated;
select pg_temp.como('11111111-1111-1111-1111-111111111111');

-- 1. Crear permanentes y una excepción temporal superpuesta (permitido: distinta clase).
select (public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-11-23","datos":{"FULL":{"activo":true,"horas":12},"PART":{"activo":true,"horas":8}}}')).id as topes_id \gset
select public.cms_crear('{"sucursal_id":"S1","clase":"temporal","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-12-09","vigencia_hasta":"2026-12-11","datos":{"FULL":{"activo":true,"horas":6},"PART":{"activo":true,"horas":4}}}');
select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"perfil_caja_eventual","colaborador_id":"aaaaaaaa-0000-0000-0000-000000000001","vigencia_desde":"2026-11-23","datos":{"acreditacion":"TODA_LA_PRESENCIA"}}');
select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"perfil_caja_eventual","colaborador_id":"aaaaaaaa-0000-0000-0000-000000000002","vigencia_desde":"2026-11-23","datos":{"acreditacion":"TODA_LA_PRESENCIA"}}');

-- 2. Integridad: superposición de igual clase y alcance → rechazada sin efectos; otro alcance → permitida.
select pg_temp.falla($q$select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2027-01-04","datos":{"FULL":{"activo":true,"horas":1},"PART":{"activo":true,"horas":1}}}')$q$, 'cms_sin_superposicion');
select pg_temp.falla($q$select public.cms_crear('{"sucursal_id":"S1","clase":"temporal","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-12-10","vigencia_hasta":"2026-12-20","datos":{"FULL":{"activo":true,"horas":1},"PART":{"activo":true,"horas":1}}}')$q$, 'cms_sin_superposicion');
select pg_temp.falla($q$select public.cms_crear('{"sucursal_id":"S1","clase":"temporal","tipo":"perfil_caja_eventual","colaborador_id":"aaaaaaaa-0000-0000-0000-000000000001","vigencia_desde":"2026-12-01","datos":{"acreditacion":"NO_ACREDITADA"}}')$q$, 'cms_temporal_con_fin');
select pg_temp.falla($q$select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"excepcion_apertura_aux_unico","vigencia_desde":"2026-11-23","datos":{"dias":[0]}}')$q$, 'cms_datos_por_tipo');
select public.cms_crear('{"sucursal_id":"S2","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-11-23","datos":{"FULL":{"activo":false},"PART":{"activo":false}}}');
select pg_temp.ok((select count(*) from public.configuracion_motor_sucursal where activa) = 5, 'las fallas no dejaron filas');

-- 3. Escritura directa prohibida (solo funciones atómicas).
select pg_temp.falla($q$insert into public.configuracion_motor_sucursal(sucursal_id,clase,tipo,vigencia_desde,datos) values ('S1','permanente','topes_caja_eventual_contrato','2030-01-07','{"FULL":{},"PART":{}}')$q$, '42501');
select pg_temp.falla($q$update public.configuracion_motor_sucursal set activa=false$q$, '42501');
select pg_temp.falla($q$delete from public.configuracion_motor_sucursal$q$, '42501');

-- 4. Reemplazo atómico desde una fecha: cierra la anterior el día previo, enlaza la nueva, no toca las demás.
select (public.cms_reemplazar(:'topes_id', 1, '{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-12-14","datos":{"FULL":{"activo":true,"horas":10},"PART":{"activo":true,"horas":6}},"motivo":"cambio"}')).id as nuevo_id \gset
select pg_temp.ok((select vigencia_hasta = '2026-12-13' and version = 2 and activa from public.configuracion_motor_sucursal where id = :'topes_id'), 'anterior cerrada el día previo');
select pg_temp.ok((select reemplaza_a = :'topes_id'::uuid from public.configuracion_motor_sucursal where id = :'nuevo_id'), 'nueva enlazada (historial)');
select pg_temp.ok((select count(*) from public.configuracion_motor_sucursal where activa and tipo = 'perfil_caja_eventual') = 2, 'perfiles intactos');
-- versión vieja → conflicto concurrente, sin cambios
select pg_temp.falla(format($q$select public.cms_reemplazar(%L, 1, '{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2027-01-04","datos":{"FULL":{"activo":true,"horas":1},"PART":{"activo":true,"horas":1}}}')$q$, :'topes_id'), 'CONFLICTO_CONCURRENTE');
-- reemplazo que chocaría con otra permanente → falla todo (la anterior NO queda cerrada)
select (public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"excepcion_apertura_aux_unico","vigencia_desde":"2026-11-23","vigencia_hasta":"2026-12-31","datos":{"franjas":[{"dia":0,"desde":"08:00","hasta":"09:00"}]}}')).id as ap1 \gset
select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"excepcion_apertura_aux_unico","vigencia_desde":"2027-01-01","datos":{"franjas":[]}}');
select pg_temp.falla(format($q$select public.cms_reemplazar(%L, 1, '{"sucursal_id":"S1","clase":"permanente","tipo":"excepcion_apertura_aux_unico","vigencia_desde":"2026-12-01","datos":{"franjas":[{"dia":1,"desde":"08:00","hasta":"09:00"}]}}')$q$, :'ap1'), 'cms_sin_superposicion');
select pg_temp.ok((select vigencia_hasta = '2026-12-31' and version = 1 from public.configuracion_motor_sucursal where id = :'ap1'), 'reemplazo fallido no dejó cambios (atómico)');
select pg_temp.falla(format($q$select public.cms_reemplazar(%L, 1, '{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-12-01","datos":{"FULL":{},"PART":{}}}')$q$, :'ap1'), 'ALCANCE_DISTINTO');

-- 5. Desactivar: solo esa fila, con versión; las demás siguen válidas.
select pg_temp.falla(format($q$select public.cms_desactivar(%L, 7)$q$, :'ap1'), 'CONFLICTO_CONCURRENTE');
select public.cms_desactivar(:'ap1', 1);
select pg_temp.ok((select not activa and desactivada_en is not null from public.configuracion_motor_sucursal where id = :'ap1'), 'desactivada con fecha');
select pg_temp.ok((select count(*) from public.configuracion_motor_sucursal where activa) = 7, 'resto intacto');

-- 6. Importación atómica: si una fila falla, no queda ninguna.
select pg_temp.falla($q$select public.cms_importar('[{"sucursal_id":"S3","clase":"permanente","tipo":"perfil_caja_eventual","colaborador_id":"aaaaaaaa-0000-0000-0000-000000000009","vigencia_desde":"2026-11-23","datos":{"acreditacion":"TODA_LA_PRESENCIA"}},{"sucursal_id":"S3","clase":"temporal","tipo":"perfil_caja_eventual","colaborador_id":"aaaaaaaa-0000-0000-0000-000000000009","vigencia_desde":"2026-11-23","datos":{"acreditacion":"NO_ACREDITADA"}}]')$q$, 'cms_temporal_con_fin');
select pg_temp.ok((select count(*) from public.configuracion_motor_sucursal where sucursal_id = 'S3') = 0, 'importación todo o nada');

-- 7. Aislamiento: otro usuario no ve ni modifica; sesión anónima y sin sesión rechazadas.
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok((select count(*) from public.configuracion_motor_sucursal) = 0, 'otro usuario no ve filas ajenas');
select pg_temp.falla(format($q$select public.cms_desactivar(%L, 1)$q$, :'nuevo_id'), 'NO_ENCONTRADA');
select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-11-23","datos":{"FULL":{"activo":true,"horas":1},"PART":{"activo":true,"horas":1}}}');
select pg_temp.como('33333333-3333-3333-3333-333333333333', true);
select pg_temp.ok((select count(*) from public.configuracion_motor_sucursal) = 0, 'anónimo no ve');
select pg_temp.falla($q$select public.cms_crear('{"sucursal_id":"S1","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-11-23","datos":{"FULL":{},"PART":{}}}')$q$, 'SESION_REQUERIDA');
reset role;
set role anon;
select pg_temp.falla($q$select public.cms_crear('{}')$q$, '42501');
reset role;
select 'PRUEBAS_SQL_OK';
