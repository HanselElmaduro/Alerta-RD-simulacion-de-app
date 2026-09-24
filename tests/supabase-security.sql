-- Safe integration test. One transaction, fake Auth users, no commits or HTTP.
-- Run as database administrator against the migrations. All rows are rolled back.
begin;
select set_config('test.user_a',gen_random_uuid()::text,true);
select set_config('test.user_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user_a')::uuid,'sos-a@example.invalid'),(current_setting('test.user_b')::uuid,'sos-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_a'),'role','authenticated','is_anonymous',false)::text,true);
insert into public.alerta_profiles(name) values('Persona ficticia A');
insert into public.alerta_contacts(name,phone,relation,whatsapp_opt_in) values('Contacto ficticio A','+12025550100','Prueba',true);
do $$ begin
  begin
    insert into public.alerta_contacts(user_id,name,phone,relation) values(current_setting('test.user_b')::uuid,'Ajeno','+12025550101','Prueba');
    raise exception 'FAIL: insert de otro propietario permitido';
  exception when insufficient_privilege then null; end;
  begin
    update public.alerta_contacts set user_id=current_setting('test.user_b')::uuid;
    raise exception 'FAIL: cambio de propietario permitido';
  exception when insufficient_privilege then null; end;
  begin
    perform public.alerta_create_sos(current_setting('test.user_a')::uuid,gen_random_uuid(),true);
    raise exception 'FAIL: RPC accesible desde cliente';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_b'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
  if (select count(*) from public.alerta_contacts)<>0 then raise exception 'FAIL: lectura cruzada de contactos'; end if;
  if (select count(*) from public.alerta_profiles)<>0 then raise exception 'FAIL: lectura cruzada de perfil'; end if;
  update public.alerta_contacts set name='No autorizado';
  if found then raise exception 'FAIL: edición cruzada'; end if;
  delete from public.alerta_contacts;
  if found then raise exception 'FAIL: borrado cruzado'; end if;
end $$;
set local role service_role;
do $$
declare u uuid:=current_setting('test.user_a')::uuid; r uuid:=gen_random_uuid();e public.alerta_sos_events;d public.alerta_sos_deliveries;num int;
begin
  e:=public.alerta_create_sos(u,r,true);
  if e.send_after-e.created_at<>interval '10 seconds' then raise exception 'FAIL: plazo incorrecto'; end if;
  if (public.alerta_create_sos(u,r,true)).id<>e.id then raise exception 'FAIL: idempotencia'; end if;
  e:=public.alerta_cancel_sos(u,e.id);
  if e.status<>'canceled' then raise exception 'FAIL: cancelación'; end if;
  select count(*) into num from public.alerta_claim_sos();
  if num<>0 then raise exception 'FAIL: envío antes del plazo o cancelado'; end if;
  e:=public.alerta_create_sos(u,gen_random_uuid(),true);
  if e.latitude is not null then raise exception 'FAIL: ubicación inventada'; end if;
  update public.alerta_sos_events set send_after=now()-interval '1 second' where id=e.id;
  begin
    perform public.alerta_cancel_sos(u,e.id);
    raise exception 'FAIL: cancelación fuera de plazo';
  exception when raise_exception then if SQLERRM not like 'El plazo terminó%' then raise; end if; end;
  select count(*) into num from public.alerta_claim_sos();
  if num<>1 then raise exception 'FAIL: trabajo vencido no reclamado'; end if;
  select count(*) into num from public.alerta_claim_sos();
  if num<>0 then raise exception 'FAIL: doble reclamación'; end if;
  select * into d from public.alerta_sos_deliveries where event_id=e.id;
  update public.alerta_sos_deliveries set status='sending',attempted_at=now() where id=d.id;
  perform public.alerta_delivery_result(d.id,'accepted','wamid.sql.test',null);
  if (select status from public.alerta_sos_deliveries where id=d.id)<>'accepted' then raise exception 'FAIL: aceptación'; end if;
  perform public.alerta_webhook_status(d.id,'wamid.sql.test',d.phone,'delivered',now()+interval '1 second',null);
  perform public.alerta_webhook_status(d.id,'wamid.sql.test',d.phone,'sent',now(),null);
  perform public.alerta_webhook_status(d.id,'wamid.sql.test',d.phone,'failed',now()+interval '2 seconds','META_FAKE');
  if (select status from public.alerta_sos_deliveries where id=d.id)<>'delivered' then raise exception 'FAIL: webhook regresó estado'; end if;
  perform public.alerta_webhook_status(d.id,'wamid.sql.test',d.phone,'delivered',now()+interval '1 second',null);
  if (select count(*) from alerta_private.webhook_receipts where message_id='wamid.sql.test')<>3 then raise exception 'FAIL: deduplicación webhook'; end if;
  update public.alerta_sos_events set status='processed' where id=e.id;
  e:=public.alerta_create_sos(u,gen_random_uuid(),true);
  perform public.alerta_cancel_sos(u,e.id);
  begin
    perform public.alerta_create_sos(u,gen_random_uuid(),true);
    raise exception 'FAIL: límite no aplicado';
  exception when raise_exception then if SQLERRM not like 'Límite de SOS%' then raise; end if; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_b'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
  if (select count(*) from public.alerta_sos_events)<>0 or (select count(*) from public.alerta_sos_deliveries)<>0 then raise exception 'FAIL: historial ajeno visible'; end if;
end $$;
rollback;
select 'PASS: RLS, propiedad, RPC privada, 10 segundos, cancelación, idempotencia, reclamación única, límites y webhooks; sin persistir datos ni enviar mensajes.' as verification;
