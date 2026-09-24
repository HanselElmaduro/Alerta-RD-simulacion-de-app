-- All fictional data rolled back; no inbox notifications committed and no external messages.
begin;
select set_config('test.a',gen_random_uuid()::text,true);
select set_config('test.b',gen_random_uuid()::text,true);
select set_config('test.c',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 (current_setting('test.a')::uuid,'internal-a@example.invalid',now(),false),
 (current_setting('test.b')::uuid,'internal-b@example.invalid',now(),false),
 (current_setting('test.c')::uuid,'internal-c@example.invalid',now(),false);
insert into public.alerta_profiles(user_id,name) values(current_setting('test.a')::uuid,'Prueba A'),(current_setting('test.b')::uuid,'Prueba B');
set local role service_role;
do $$
declare a uuid:=current_setting('test.a')::uuid; b uuid:=current_setting('test.b')::uuid; c uuid:=current_setting('test.c')::uuid;
 code text; r jsonb; link uuid; e uuid; request uuid:=gen_random_uuid(); inbox uuid; first_id uuid;
begin
 code:=public.alerta_app_command(b,'{"action":"code"}') ->> 'code';
 if code is null then raise exception 'FAIL: no code'; end if;
 r:=public.alerta_app_command(a,jsonb_build_object('action','invite','code',code,'relation','Amigo'));link:=(r->'link'->>'id')::uuid;
 if link is null then raise exception 'FAIL: invite: %',r; end if;
 r:=public.alerta_app_command(c,jsonb_build_object('action','respond','id',link,'accept',true));
 if r->>'error' is null then raise exception 'FAIL: unrelated account accepts'; end if;
 r:=public.alerta_app_command(a,jsonb_build_object('action','create','requestId',request));
 if r->>'error' is null then raise exception 'FAIL: alert before acceptance'; end if;
 r:=public.alerta_app_command(b,jsonb_build_object('action','respond','id',link,'accept',true));
 if r->>'error' is not null then raise exception 'FAIL: acceptance %',r; end if;
 r:=public.alerta_app_command(a,jsonb_build_object('action','create','requestId',request));e:=(r->'event'->>'id')::uuid;first_id:=e;
 if e is null then raise exception 'FAIL: create %',r; end if;
 if (select send_after-created_at from public.alerta_app_events where id=e)<>interval '10 seconds' then raise exception 'FAIL: deadline'; end if;
 if (public.alerta_app_command(a,jsonb_build_object('action','create','requestId',request))->'event'->>'id')::uuid<>e then raise exception 'FAIL: dedup'; end if;
 perform public.alerta_publish_app_sos();
 if exists(select 1 from public.alerta_app_inbox where event_id=e) then raise exception 'FAIL: early inbox'; end if;
 r:=public.alerta_app_command(b,jsonb_build_object('action','cancel','eventId',e));if r->>'error' is null then raise exception 'FAIL: foreign cancel'; end if;
 perform public.alerta_app_command(a,jsonb_build_object('action','cancel','eventId',e));
 update public.alerta_app_events set send_after=now()-interval '1 second' where id=e;
 perform public.alerta_publish_app_sos();
 if exists(select 1 from public.alerta_app_inbox where event_id=e) then raise exception 'FAIL: canceled delivered'; end if;
 r:=public.alerta_app_command(a,jsonb_build_object('action','create','requestId',gen_random_uuid()));e:=(r->'event'->>'id')::uuid;
 update public.alerta_app_events set send_after=now()-interval '1 second' where id=e;
 r:=public.alerta_app_command(a,jsonb_build_object('action','cancel','eventId',e));if r->>'error' is null then raise exception 'FAIL: late cancel'; end if;
 perform public.alerta_publish_app_sos();perform public.alerta_publish_app_sos();
 if (select count(*) from public.alerta_app_inbox where event_id=e)<>1 then raise exception 'FAIL: no or duplicate inbox'; end if;
 if (select latitude from public.alerta_app_inbox where event_id=e) is not null then raise exception 'FAIL: invented location'; end if;
 select id into inbox from public.alerta_app_inbox where event_id=e;
 r:=public.alerta_app_command(a,jsonb_build_object('action','read','id',inbox));if r->>'error' is null then raise exception 'FAIL: sender confirmed recipient read'; end if;
 perform public.alerta_app_command(b,jsonb_build_object('action','read','id',inbox));
 if (select status from public.alerta_app_outbox where event_id=e)<>'read' then raise exception 'FAIL: read acknowledgement'; end if;
 r:=public.alerta_app_command(a,jsonb_build_object('action','create','requestId',gen_random_uuid()));e:=(r->'event'->>'id')::uuid;
 perform public.alerta_app_command(b,jsonb_build_object('action','remove','id',link));
 update public.alerta_app_events set send_after=now()-interval '1 second' where id=e;
 perform public.alerta_publish_app_sos();
 if exists(select 1 from public.alerta_app_inbox where event_id=e) then raise exception 'FAIL: revoked consent'; end if;
 if (select status from public.alerta_app_events where id=e)<>'failed' then raise exception 'FAIL: empty delivery state'; end if;
 r:=public.alerta_app_command(a,jsonb_build_object('action','create','requestId',gen_random_uuid()));
 if r->>'error' not like 'Límite%' then raise exception 'FAIL: SOS rate limit %',r; end if;
 for idx in 1..11 loop perform public.alerta_app_command(a,jsonb_build_object('action','invite','code',gen_random_uuid(),'relation','Fake')); end loop;
 r:=public.alerta_app_command(a,jsonb_build_object('action','invite','code',code,'relation','Amigo'));
 if r->>'error' not like 'Límite%' then raise exception 'FAIL: invalid invite guesses not rate limited'; end if;
 perform set_config('test.event',e::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.b'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if (select count(*) from public.alerta_app_inbox)<>1 then raise exception 'FAIL: recipient inbox RLS'; end if;
 if (select count(*) from public.alerta_app_events)<>0 then raise exception 'FAIL: recipient can see sender events'; end if;
 if (select count(*) from public.alerta_app_outbox)<>0 then raise exception 'FAIL: recipient can see other recipients'; end if;
 begin
   perform public.alerta_app_command(current_setting('test.a')::uuid,'{"action":"code"}');
   raise exception 'FAIL: client invokes server RPC';
 exception when insufficient_privilege then null; end;
 begin
   update public.alerta_app_inbox set read_at=now();raise exception 'FAIL: direct mutation';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.c'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.alerta_app_inbox) or exists(select 1 from public.alerta_app_links) or exists(select 1 from public.alerta_app_events) or exists(select 1 from public.alerta_app_outbox) then raise exception 'FAIL: third party reads data'; end if;
end $$;
rollback;
select 'PASS: invitation acceptance, 10 seconds, cancellation, idempotency, no location, recipient privacy, read acknowledgement, revocation and rate limits. Fictional rows rolled back; no messages sent.' as result;
