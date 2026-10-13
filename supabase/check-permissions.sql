select jsonb_build_object(
  'rls', (select jsonb_build_object('enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'applications'),
  'permissions', (select jsonb_agg(jsonb_build_object(
    'role', role,
    'can_insert_name', has_column_privilege(role, 'public.applications', 'name', 'INSERT'),
    'can_insert_contact', has_column_privilege(role, 'public.applications', 'contact', 'INSERT'),
    'can_insert_message', has_column_privilege(role, 'public.applications', 'message', 'INSERT'),
    'can_set_created_at', has_column_privilege(role, 'public.applications', 'created_at', 'INSERT'),
    'can_read', has_table_privilege(role, 'public.applications', 'SELECT'),
    'can_update', has_table_privilege(role, 'public.applications', 'UPDATE'),
    'can_delete', has_table_privilege(role, 'public.applications', 'DELETE')
  )) from (values ('anon'), ('authenticated')) as roles(role)),
  'policies', (select jsonb_agg(jsonb_build_object('name', policyname, 'command', cmd, 'roles', roles))
    from pg_policies where schemaname = 'public' and tablename = 'applications')
) as verification;
