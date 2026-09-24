-- Explicit server-only policies; browser roles have no schema/table grants.
create policy runtime_server on alerta_private.runtime to service_role using (true) with check (true);
create policy receipts_server on alerta_private.webhook_receipts to service_role using (true) with check (true);

create or replace function public.alerta_webhook_status(p_id uuid,p_message text,p_phone text,p_status text,p_at timestamptz,p_error text) returns void
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
  if (rank_new>rank_old and (d.status<>'failed' or rank_new>=3 or p_at>d.status_at))
    or (p_status='failed' and rank_old<3 and (d.status in ('sending','accepted','unknown') or d.status_at is null or p_at>=d.status_at)) then
    update public.alerta_sos_deliveries set status=p_status,provider_message_id=p_message,status_at=p_at,error_code=case when p_status='failed' then p_error else null end where id=d.id;
  end if;
end $$;
