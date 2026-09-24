create or replace function public.alerta_app_command(p_user uuid,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 a text:=p_body->>'action'; c uuid; target uuid; n text; tn text;
 l public.alerta_app_links; e public.alerta_app_events; i public.alerta_app_inbox;
 t timestamptz; count_sos integer;
begin
 -- p_user is bound by internal-sos after Auth.getUser validates confirmation.
 -- No client EXECUTE grant; no additional access to auth.users is necessary.
 if a='health' then return jsonb_build_object('ready',coalesce((select heartbeat>now()-interval '60 seconds' from alerta_private.app_runtime where singleton),false),'serverTime',floor(extract(epoch from clock_timestamp())*1000)); end if;
 if a='code' then
   insert into alerta_private.app_codes(user_id) values(p_user) on conflict(user_id) do nothing;
   select code into c from alerta_private.app_codes where user_id=p_user;
   return jsonb_build_object('code',c);
 end if;
 if a='invite' then
   perform pg_advisory_xact_lock(hashtextextended(p_user::text,81));
   if (select count(*) from alerta_private.app_invite_attempts where user_id=p_user and created_at>now()-interval '1 day')>=10 then return jsonb_build_object('error','Límite de solicitudes: espera 24 horas antes de intentar otra vez'); end if;
   insert into alerta_private.app_invite_attempts(user_id) values(p_user);
   select name into n from public.alerta_profiles where user_id=p_user;
   if n is null then return jsonb_build_object('error','Completa tu nombre en Perfil antes de agregar un amigo'); end if;
   select user_id into target from alerta_private.app_codes where code=(p_body->>'code')::uuid;
   select name into tn from public.alerta_profiles where user_id=target;
   if target is null or tn is null then return jsonb_build_object('error','Código no disponible. Pide a tu amigo que complete su perfil y copie su código de Contactos'); end if;
   if target=p_user then return jsonb_build_object('error','No puedes agregarte como contacto'); end if;
   select * into l from public.alerta_app_links where sender_id=p_user and recipient_id=target;
   if found and l.status<>'removed' then return jsonb_build_object('error','Ya existe una solicitud para esta persona. Revisa su estado en Contactos'); end if;
   if (select count(*) from public.alerta_app_links where sender_id=p_user and status in ('pending','accepted'))>=5 then return jsonb_build_object('error','Máximo 5 amigos por cuenta. Elimina uno antes de agregar otro'); end if;
   insert into public.alerta_app_links(sender_id,recipient_id,sender_name,recipient_name,relation)
     values(p_user,target,n,tn,trim(p_body->>'relation')) on conflict(sender_id,recipient_id) do update
     set status='pending',sender_name=excluded.sender_name,recipient_name=excluded.recipient_name,relation=excluded.relation,created_at=now() returning * into l;
   return jsonb_build_object('link',to_jsonb(l));
 end if;
 if a in ('respond','remove') then
   select * into l from public.alerta_app_links where id=(p_body->>'id')::uuid and p_user in (sender_id,recipient_id) for update;
   if not found then return jsonb_build_object('error','Solicitud no encontrada'); end if;
   if a='respond' then
     if l.recipient_id<>p_user or l.status<>'pending' then return jsonb_build_object('error','Esta solicitud ya no está pendiente para tu cuenta'); end if;
     update public.alerta_app_links set status=case when (p_body->>'accept')::boolean then 'accepted' else 'declined' end where id=l.id;
   else
     update public.alerta_app_links set status=case when l.recipient_id=p_user or l.status='declined' then 'declined' else 'removed' end where id=l.id;
   end if;
   return jsonb_build_object('ok',true);
 end if;
 if a='create' then
   perform pg_advisory_xact_lock(hashtextextended(p_user::text,82));
   select * into e from public.alerta_app_events where sender_id=p_user and request_id=(p_body->>'requestId')::uuid;
   if found then return jsonb_build_object('event',to_jsonb(e),'serverTime',floor(extract(epoch from clock_timestamp())*1000)); end if;
   if exists(select 1 from public.alerta_app_events where sender_id=p_user and status='pending') then return jsonb_build_object('error','Ya hay un SOS interno pendiente'); end if;
   if not coalesce((select heartbeat>now()-interval '60 seconds' from alerta_private.app_runtime where singleton),false) then return jsonb_build_object('error','El procesador interno no está disponible. Intenta actualizar el estado'); end if;
   if (select count(*) from public.alerta_app_events where sender_id=p_user and created_at>now()-interval '15 minutes')>=3 or (select count(*) from public.alerta_app_events where sender_id=p_user and created_at>now()-interval '1 day')>=10 then return jsonb_build_object('error','Límite de SOS: máximo 3 cada 15 minutos y 10 al día'); end if;
   select name into n from public.alerta_profiles where user_id=p_user;
   if n is null then return jsonb_build_object('error','Completa tu nombre en Perfil'); end if;
   if not exists(select 1 from public.alerta_app_links where sender_id=p_user and status='accepted') then return jsonb_build_object('error','Agrega un amigo y espera que acepte tu solicitud'); end if;
   t:=clock_timestamp();
   insert into public.alerta_app_events(sender_id,request_id,sender_name,created_at,send_after) values(p_user,(p_body->>'requestId')::uuid,n,t,t+interval '10 seconds') returning * into e;
   insert into public.alerta_app_outbox(event_id,sender_id,recipient_id,link_id,recipient_name)
     select e.id,p_user,recipient_id,id,recipient_name from public.alerta_app_links where sender_id=p_user and status='accepted';
   return jsonb_build_object('event',to_jsonb(e),'serverTime',floor(extract(epoch from clock_timestamp())*1000));
 end if;
 if a in ('cancel','location') then
   select * into e from public.alerta_app_events where id=(p_body->>'eventId')::uuid and sender_id=p_user for update;
   if not found then return jsonb_build_object('error','SOS no encontrado'); end if;
   if a='cancel' and e.status='canceled' then return jsonb_build_object('event',to_jsonb(e)); end if;
   if e.status<>'pending' or clock_timestamp()>=e.send_after then return jsonb_build_object('error','El plazo terminó; no se puede modificar este SOS'); end if;
   if a='cancel' then
     update public.alerta_app_events set status='canceled',finished_at=clock_timestamp() where id=e.id returning * into e;
     update public.alerta_app_outbox set status='canceled' where event_id=e.id;
     return jsonb_build_object('event',to_jsonb(e));
   end if;
   update public.alerta_app_events set latitude=(p_body->>'latitude')::double precision,longitude=(p_body->>'longitude')::double precision where id=e.id;
   return jsonb_build_object('saved',true);
 end if;
 if a='read' then
   update public.alerta_app_inbox set read_at=coalesce(read_at,clock_timestamp()) where id=(p_body->>'id')::uuid and recipient_id=p_user returning * into i;
   if not found then return jsonb_build_object('error','Alerta no encontrada'); end if;
   update public.alerta_app_outbox set status='read',read_at=i.read_at where event_id=i.event_id and recipient_id=p_user;
   return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','Acción desconocida');
end $$;
revoke all on function public.alerta_app_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.alerta_app_command(uuid,jsonb) to service_role;

