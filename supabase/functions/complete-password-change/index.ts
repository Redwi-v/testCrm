import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const auth = request.headers.get('Authorization');
  if (!auth) return Response.json({ error: 'Требуется вход' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 10)
    return Response.json(
      { error: 'Новый пароль должен содержать не менее 10 символов' },
      { status: 400 },
    );
  const url = Deno.env.get('SUPABASE_URL')!,
    anon = Deno.env.get('SUPABASE_ANON_KEY')!,
    service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user)
    return Response.json({ error: 'Сессия недействительна' }, { status: 401 });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, { password });
  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });
  const { error: profileError } = await admin
    .from('profiles')
    .update({ password_change_required: false })
    .eq('id', data.user.id);
  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });
  return Response.json({ ok: true });
});
