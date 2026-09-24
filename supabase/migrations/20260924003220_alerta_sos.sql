-- Additive: no existing forum/users tables are changed. Uses Supabase Auth.
create schema if not exists alerta_private;
revoke all on schema alerta_private from public, anon, authenticated;
grant usage on schema alerta_private to service_role;
create table alerta_private.runtime (
  singleton boolean primary key default true check(singleton),
  dispatch_hash text,
  heartbeat timestamptz
);
insert into alerta_private.runtime(singleton) values(true);
alter table alerta_private.runtime enable row level security;
grant all on alerta_private.runtime to service_role;

create table public.alerta_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 100),
  phone text not null default '' check(phone='' or phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now()
);
create table public.alerta_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 80),
  phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  relation text not null check(char_length(trim(relation)) between 1 and 50),
  whatsapp_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id,phone)
);
create table public.alerta_sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  name text not null,
  authorized_test boolean not null,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default (now()+interval '10 seconds'),
  status text not null default 'pending' check(status in ('pending','dispatching','processed','canceled','expired')),
  latitude double precision check(latitude between -90 and 90),
  longitude double precision check(longitude between -180 and 180),
  finished_at timestamptz,
  unique(user_id,request_id),
  check((latitude is null)=(longitude is null))
);
create index alerta_sos_owner_time on public.alerta_sos_events(user_id,created_at desc);
create index alerta_sos_pending on public.alerta_sos_events(send_after) where status in ('pending','dispatching');
create table public.alerta_sos_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.alerta_sos_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.alerta_contacts(id) on delete set null,
  contact_name text not null,
  phone text not null,
  status text not null default 'queued' check(status in ('queued','sending','accepted','sent','delivered','read','failed','unknown','canceled')),
  provider_message_id text unique,
  attempted_at timestamptz,
  status_at timestamptz,
  error_code text,
  unique(event_id,phone)
);
create index alerta_deliveries_owner on public.alerta_sos_deliveries(user_id,event_id);
create index alerta_deliveries_contact on public.alerta_sos_deliveries(contact_id);
create table alerta_private.webhook_receipts (
  message_id text not null, status text not null, occurred_at timestamptz not null,
  primary key(message_id,status,occurred_at)
);
alter table alerta_private.webhook_receipts enable row level security;
grant all on alerta_private.webhook_receipts to service_role;

alter table public.alerta_profiles enable row level security;
alter table public.alerta_contacts enable row level security;
alter table public.alerta_sos_events enable row level security;
alter table public.alerta_sos_deliveries enable row level security;
revoke all on public.alerta_profiles,public.alerta_contacts,public.alerta_sos_events,public.alerta_sos_deliveries from anon,authenticated;
grant select,insert,update,delete on public.alerta_contacts to authenticated;
grant select,insert,update on public.alerta_profiles to authenticated;
grant select on public.alerta_sos_events,public.alerta_sos_deliveries to authenticated;
grant all on public.alerta_profiles,public.alerta_contacts,public.alerta_sos_events,public.alerta_sos_deliveries to service_role;
create policy profiles_read on public.alerta_profiles for select to authenticated using ((select auth.uid())=user_id and not (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy profiles_add on public.alerta_profiles for insert to authenticated with check ((select auth.uid())=user_id and not (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy profiles_edit on public.alerta_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and not (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy contacts_read on public.alerta_contacts for select to authenticated using ((select auth.uid())=user_id and not (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy contacts_add on public.alerta_contacts for insert to authenticated with check ((select auth.uid())=user_id and not (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy contacts_edit on public.alerta_contacts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and not (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy contacts_remove on public.alerta_contacts for delete to authenticated using ((select auth.uid())=user_id);
create policy sos_read on public.alerta_sos_events for select to authenticated using ((select auth.uid())=user_id);
create policy deliveries_read on public.alerta_sos_deliveries for select to authenticated using ((select auth.uid())=user_id);

create function public.alerta_contact_limit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,42));
  if (select count(*) from public.alerta_contacts where user_id=new.user_id and id<>new.id)>=5 then
    raise exception 'Máximo 5 contactos por cuenta';
  end if;
  return new;
end $$;
revoke all on function public.alerta_contact_limit() from public,anon,authenticated;
create trigger alerta_contact_limit before insert or update on public.alerta_contacts for each row execute function public.alerta_contact_limit();

-- These RPCs are server-only, SECURITY INVOKER, with no browser EXECUTE grants.
create function public.alerta_create_sos(p_user uuid,p_request uuid,p_test boolean) returns public.alerta_sos_events
language plpgsql security invoker set search_path='' as $$
declare e public.alerta_sos_events; n text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,43));
  select * into e from public.alerta_sos_events where user_id=p_user and request_id=p_request;
  if found then return e; end if;
  if exists(select 1 from public.alerta_sos_events where user_id=p_user and status in ('pending','dispatching')) then raise exception 'Ya hay un SOS pendiente'; end if;
  if (select count(*) from public.alerta_sos_events where user_id=p_user and created_at>now()-interval '15 minutes')>=3
    or (select count(*) from public.alerta_sos_events where user_id=p_user and created_at>now()-interval '1 day')>=10 then raise exception 'Límite de SOS: espera antes de volver a intentar'; end if;
  select name into n from public.alerta_profiles where user_id=p_user;
  if n is null then raise exception 'Completa tu nombre en Perfil'; end if;
  if not exists(select 1 from public.alerta_contacts where user_id=p_user and whatsapp_opt_in) then raise exception 'Agrega un contacto con consentimiento para WhatsApp'; end if;
  insert into public.alerta_sos_events(user_id,request_id,name,authorized_test) values(p_user,p_request,n,p_test) returning * into e;
  insert into public.alerta_sos_deliveries(event_id,user_id,contact_id,contact_name,phone)
  select e.id,p_user,id,name,phone from public.alerta_contacts where user_id=p_user and whatsapp_opt_in;
  return e;
end $$;
create function public.alerta_cancel_sos(p_user uuid,p_event uuid) returns public.alerta_sos_events
language plpgsql security invoker set search_path='' as $$
declare e public.alerta_sos_events;
begin
  select * into e from public.alerta_sos_events where id=p_event and user_id=p_user for update;
  if not found then raise exception 'SOS no encontrado'; end if;
  if e.status='canceled' then return e; end if;
  if e.status<>'pending' or clock_timestamp()>=e.send_after then raise exception 'El plazo terminó; no se puede confirmar la cancelación'; end if;
  update public.alerta_sos_events set status='canceled',finished_at=now() where id=e.id returning * into e;
  update public.alerta_sos_deliveries set status='canceled',status_at=now() where event_id=e.id;
  return e;
end $$;
create function public.alerta_set_location(p_user uuid,p_event uuid,p_lat double precision,p_lng double precision) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.alerta_sos_events set latitude=p_lat,longitude=p_lng where id=p_event and user_id=p_user and status='pending' and send_after>clock_timestamp();
  return found;
end $$;
create function public.alerta_claim_sos() returns setof public.alerta_sos_events
language plpgsql security invoker set search_path='' as $$
begin
  -- Do not unexpectedly send old alerts after an outage.
  update public.alerta_sos_events set status='expired',finished_at=now() where status='pending' and send_after<now()-interval '2 minutes';
  update public.alerta_sos_deliveries d set status='failed',error_code='DISPATCH_EXPIRED',status_at=now()
    where d.status='queued' and exists(select 1 from public.alerta_sos_events e where e.id=d.event_id and e.status='expired');
  -- A crashed worker must not retry an ambiguous irreversible POST.
  update public.alerta_sos_deliveries d set status=case when d.status='sending' then 'unknown' else 'failed' end,error_code='WORKER_INTERRUPTED',status_at=now()
    where d.status in ('sending','queued') and exists(select 1 from public.alerta_sos_events e where e.id=d.event_id and e.status='dispatching' and e.send_after<now()-interval '3 minutes');
  update public.alerta_sos_events set status='processed',finished_at=now() where status='dispatching' and send_after<now()-interval '3 minutes';
  return query update public.alerta_sos_events e set status='dispatching'
    where e.id in (select id from public.alerta_sos_events where status='pending' and send_after<=now() order by send_after for update skip locked limit 2)
    returning e.*;
end $$;
create function public.alerta_worker_auth(p_token text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update alerta_private.runtime set heartbeat=now() where singleton and dispatch_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  return found;
end $$;
create function public.alerta_worker_health() returns boolean language sql security invoker set search_path='' as $$
 select coalesce((select heartbeat>now()-interval '120 seconds' from alerta_private.runtime where singleton),false);
$$;
create function public.alerta_delivery_result(p_id uuid,p_status text,p_message text,p_error text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('accepted','failed','unknown') then raise exception 'Invalid result'; end if;
  update public.alerta_sos_deliveries set status=p_status,provider_message_id=coalesce(p_message,provider_message_id),error_code=p_error,status_at=now() where id=p_id and status='sending';
end $$;
create function public.alerta_webhook_status(p_id uuid,p_message text,p_phone text,p_status text,p_at timestamptz,p_error text) returns void
language plpgsql security invoker set search_path='' as $$
declare d public.alerta_sos_deliveries; rank_old int; rank_new int;
begin
  if p_status not in ('sent','delivered','read','failed') then return; end if;
  select * into d from public.alerta_sos_deliveries where (provider_message_id=p_message or (id=p_id and provider_message_id is null and status in ('sending','unknown'))) and phone=p_phone for update;
  if not found then return; end if;
  insert into alerta_private.webhook_receipts values(p_message,p_status,p_at) on conflict do nothing;
  if not found then return; end if;
  rank_old:=case d.status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 1 end;
  rank_new:=case p_status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 0 end;
  if rank_new>rank_old or (p_status='failed' and rank_old<3 and (d.status_at is null or p_at>=d.status_at)) then
    update public.alerta_sos_deliveries set status=p_status,provider_message_id=p_message,status_at=p_at,error_code=case when p_status='failed' then p_error else null end where id=d.id;
  end if;
end $$;
revoke all on function public.alerta_create_sos(uuid,uuid,boolean),public.alerta_cancel_sos(uuid,uuid),public.alerta_set_location(uuid,uuid,double precision,double precision),public.alerta_claim_sos(),public.alerta_worker_auth(text),public.alerta_worker_health(),public.alerta_delivery_result(uuid,text,text,text),public.alerta_webhook_status(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.alerta_create_sos(uuid,uuid,boolean),public.alerta_cancel_sos(uuid,uuid),public.alerta_set_location(uuid,uuid,double precision,double precision),public.alerta_claim_sos(),public.alerta_worker_auth(text),public.alerta_worker_health(),public.alerta_delivery_result(uuid,text,text,text),public.alerta_webhook_status(uuid,text,text,text,timestamptz,text) to service_role;
