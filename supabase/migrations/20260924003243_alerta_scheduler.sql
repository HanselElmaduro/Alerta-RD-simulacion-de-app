create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Token generated inside Postgres: never embedded in source or returned to the client.
do $$
declare token text;
begin
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  perform vault.create_secret(token,'alerta_dispatch_token','Internal SOS dispatcher');
  update alerta_private.runtime set dispatch_hash=encode(sha256(convert_to(token,'UTF8')),'hex') where singleton;
end $$;
-- Set alerta_project_url in Vault separately; safe to deploy before Meta is configured.
select cron.schedule('alerta-sos-dispatch','5 seconds',$job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='alerta_project_url') || '/functions/v1/sos-dispatch',
   headers := jsonb_build_object('Content-Type','application/json','x-dispatch-token',(select decrypted_secret from vault.decrypted_secrets where name='alerta_dispatch_token')),
   body := '{}'::jsonb,
   timeout_milliseconds := 60000
 ) where exists(select 1 from vault.decrypted_secrets where name='alerta_project_url')
 and (exists(select 1 from public.alerta_sos_events where status in ('pending','dispatching'))
      or exists(select 1 from alerta_private.runtime where heartbeat is null or heartbeat<now()-interval '60 seconds'));
$job$);
