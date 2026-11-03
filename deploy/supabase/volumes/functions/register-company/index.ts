import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  if (!email || password.length < 10 || !fullName || !company)
    return Response.json(
      { error: 'Заполните все поля. Пароль должен быть не короче 10 символов.' },
      { status: 400 },
    );
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: auth, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !auth.user)
    return Response.json(
      { error: error?.message || 'Не удалось создать аккаунт' },
      { status: 400 },
    );
  const { data: org, error: orgError } = await db
    .from('companies')
    .insert({ name: company })
    .select('id')
    .single();
  if (orgError) {
    await db.auth.admin.deleteUser(auth.user.id);
    return Response.json({ error: orgError.message }, { status: 500 });
  }
  const { error: profileError } = await db.from('profiles').insert({
    id: auth.user.id,
    full_name: fullName,
    role: 'manager',
    company_id: org.id,
    password_change_required: false,
  });
  if (profileError) {
    await db.from('companies').delete().eq('id', org.id);
    await db.auth.admin.deleteUser(auth.user.id);
    return Response.json({ error: profileError.message }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
});
