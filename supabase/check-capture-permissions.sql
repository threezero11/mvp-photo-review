select jsonb_build_object(
'rls',(select jsonb_build_object('enabled',relrowsecurity,'forced',relforcerowsecurity) from pg_class where oid='public.capture_receipts'::regclass),
'roles',(select jsonb_agg(jsonb_build_object('role',role,'read',has_table_privilege(role,'public.capture_receipts','SELECT'),'insert',has_table_privilege(role,'public.capture_receipts','INSERT'),'update',has_table_privilege(role,'public.capture_receipts','UPDATE'),'delete',has_table_privilege(role,'public.capture_receipts','DELETE'),'reserve',has_function_privilege(role,'public.reserve_capture(text,text,text,text,text)','EXECUTE'))) from(values('anon'),('authenticated')) as roles(role)),
'bucket',(select jsonb_build_object('id',id,'public',public,'max_bytes',file_size_limit) from storage.buckets where id='capture-originals'),
'storage_policies',(select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'qual',qual,'with_check',with_check)),'[]'::jsonb) from pg_policies where schemaname='storage' and tablename='objects')
) as permissions;
