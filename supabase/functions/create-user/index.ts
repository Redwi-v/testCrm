import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authorization = request.headers.get('Authorization');
  if (!authorization) return Response.json({ error: 'Требуется вход в систему' }, { status: 401 });

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user)
    return Response.json({ error: 'Сессия недействительна' }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,company_id,password_change_required')
    .eq('id', authData.user.id)
    .single();
  if (profileError || profile?.role !== 'manager' || profile.password_change_required)
    return Response.json(
      { error: 'Создавать пользователей может только постановщик после первого входа' },
      { status: 403 },
    );

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const role = body.role === 'manager' ? 'manager' : body.role === 'executor' ? 'executor' : null;
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !fullName || !role || password.length < 8)
    return Response.json(
      { error: 'Укажите имя, email, роль и пароль не короче 8 символов' },
      { status: 400 },
    );

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { password_change_required: true },
  });
  if (createError || !created.user)
    return Response.json(
      { error: createError?.message || 'Не удалось создать аккаунт' },
      { status: 400 },
    );
  const { error: insertError } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: fullName,
    role,
    company_id: profile.company_id,
    password_change_required: true,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: 'Аккаунт не создан: ' + insertError.message }, { status: 500 });
  }
  return Response.json({ id: created.user.id, email, full_name: fullName, role }, { status: 201 });
});
