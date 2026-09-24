-- Independent internal channel: no Meta credentials and no calls to WhatsApp.
create table alerta_private.app_codes (
 user_id uuid primary key references auth.users(id) on delete cascade,
 code uuid not null unique default gen_random_uuid()
);
create table alerta_private.app_invite_attempts (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index app_invite_attempts_user on alerta_private.app_invite_attempts(user_id,created_at desc);
create table alerta_private.app_runtime (singleton boolean primary key default true check(singleton), heartbeat timestamptz);
insert into alerta_private.app_runtime(singleton) values(true);
alter table alerta_private.app_codes enable row level security;
alter table alerta_private.app_invite_attempts enable row level security;
alter table alerta_private.app_runtime enable row level security;
grant all on alerta_private.app_codes,alerta_private.app_invite_attempts,alerta_private.app_runtime to service_role;
grant usage,select on sequence alerta_private.app_invite_attempts_id_seq to service_role;

create table public.alerta_app_links (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 sender_name text not null, recipient_name text not null,
 relation text not null check(char_length(trim(relation)) between 1 and 50),
 status text not null default 'pending' check(status in ('pending','accepted','declined','removed')),
 created_at timestamptz not null default now(),
 unique(sender_id,recipient_id), check(sender_id<>recipient_id)
);
create index app_links_recipient on public.alerta_app_links(recipient_id,status);
create table public.alerta_app_events (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, sender_name text not null,
 created_at timestamptz not null default clock_timestamp(),
 send_after timestamptz not null,
 status text not null default 'pending' check(status in ('pending','published','canceled','expired','failed')),
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 finished_at timestamptz,
 unique(sender_id,request_id), check((latitude is null)=(longitude is null))
);
create index app_events_sender on public.alerta_app_events(sender_id,created_at desc);
create index app_events_pending on public.alerta_app_events(send_after) where status='pending';
create table public.alerta_app_outbox (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.alerta_app_events(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 link_id uuid not null references public.alerta_app_links(id) on delete cascade,
 recipient_name text not null,
 status text not null default 'queued' check(status in ('queued','available','read','skipped','canceled','expired')),
 read_at timestamptz,
 unique(event_id,recipient_id)
);
create index app_outbox_sender on public.alerta_app_outbox(sender_id,event_id);
create index app_outbox_recipient on public.alerta_app_outbox(recipient_id);
create index app_outbox_link on public.alerta_app_outbox(link_id);
create table public.alerta_app_inbox (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.alerta_app_events(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 sender_name text not null,
 created_at timestamptz not null, available_at timestamptz not null default clock_timestamp(),
 latitude double precision, longitude double precision,
 read_at timestamptz,
 unique(event_id,recipient_id)
);
create index app_inbox_recipient on public.alerta_app_inbox(recipient_id,available_at desc);
create index app_inbox_sender on public.alerta_app_inbox(sender_id);
alter table public.alerta_app_links enable row level security;
alter table public.alerta_app_events enable row level security;
alter table public.alerta_app_outbox enable row level security;
alter table public.alerta_app_inbox enable row level security;
revoke all on public.alerta_app_links,public.alerta_app_events,public.alerta_app_outbox,public.alerta_app_inbox from public,anon,authenticated;
grant select on public.alerta_app_links,public.alerta_app_events,public.alerta_app_outbox,public.alerta_app_inbox to authenticated;
grant all on public.alerta_app_links,public.alerta_app_events,public.alerta_app_outbox,public.alerta_app_inbox to service_role;
create policy app_links_read on public.alerta_app_links for select to authenticated using ((select auth.uid()) in (sender_id,recipient_id));
create policy app_events_read on public.alerta_app_events for select to authenticated using ((select auth.uid())=sender_id);
create policy app_outbox_read on public.alerta_app_outbox for select to authenticated using ((select auth.uid())=sender_id);
create policy app_inbox_read on public.alerta_app_inbox for select to authenticated using ((select auth.uid())=recipient_id);

-- All mutations are server-only. The Edge Function supplies p_user from getUser().
create function public.alerta_app_command(p_user uuid,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 a text:=p_body->>'action'; c uuid; target uuid; n text; tn text;
 l public.alerta_app_links; e public.alerta_app_events; i public.alerta_app_inbox;
 t timestamptz; count_sos integer;
begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and not is_anonymous) then
   return jsonb_build_object('error','Necesitas una cuenta con correo confirmado');
 end if;
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

create function public.alerta_publish_app_sos() returns integer
language plpgsql security invoker set search_path='' as $$
declare e public.alerta_app_events; d public.alerta_app_outbox; total integer:=0; permitted boolean;
begin
 update alerta_private.app_runtime set heartbeat=clock_timestamp() where singleton;
 for e in select * from public.alerta_app_events where status='pending' and send_after<=clock_timestamp() order by send_after for update skip locked limit 100 loop
   if e.send_after<clock_timestamp()-interval '2 minutes' then
     update public.alerta_app_events set status='expired',finished_at=clock_timestamp() where id=e.id;
     update public.alerta_app_outbox set status='expired' where event_id=e.id;
     continue;
   end if;
   for d in select * from public.alerta_app_outbox where event_id=e.id loop
     -- Lock consent against simultaneous revocation. No notification exists until publication.
     select status='accepted' into permitted from public.alerta_app_links where id=d.link_id for share;
     if coalesce(permitted,false) then
       insert into public.alerta_app_inbox(event_id,recipient_id,sender_id,sender_name,created_at,latitude,longitude)
         values(e.id,d.recipient_id,e.sender_id,e.sender_name,e.created_at,e.latitude,e.longitude) on conflict(event_id,recipient_id) do nothing;
       update public.alerta_app_outbox set status='available' where id=d.id;
     else update public.alerta_app_outbox set status='skipped' where id=d.id;
     end if;
   end loop;
   update public.alerta_app_events set status=case when exists(select 1 from public.alerta_app_inbox where event_id=e.id) then 'published' else 'failed' end,finished_at=clock_timestamp() where id=e.id;
   total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.alerta_publish_app_sos() from public,anon,authenticated;
grant execute on function public.alerta_publish_app_sos() to service_role;
select cron.schedule('alerta-internal-sos','5 seconds','select public.alerta_publish_app_sos();');
