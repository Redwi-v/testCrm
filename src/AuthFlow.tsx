import { useEffect, useState } from 'react';
import { client } from './client';
import Workspace from './Workspace';
import { Building2, HardHat, ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
export default function AuthFlow() {
  const [session, setSession] = useState<any>(null),
    [profile, setProfile] = useState<any>(null),
    [profileLoading, setProfileLoading] = useState(false),
    [mode, setMode] = useState<'login' | 'register'>('login'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [needsPassword, setNeedsPassword] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [company, setCompany] = useState(''),
    [nextPassword, setNextPassword] = useState('');
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setNeedsPassword(false);
        setProfileLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session?.user) localStorage.setItem('crm-active-user', session.user.id);
    else localStorage.removeItem('crm-active-user');
  }, [session]);
  useEffect(() => {
    if (session && client) {
      setProfileLoading(true);
      client
        .from('profiles')
        .select('full_name,role,company_id,password_change_required,companies(name)')
        .eq('id', session.user.id)
        .single()
        .then(({ data, error }: any) => {
          setProfile(data || null);
          setNeedsPassword(Boolean(data?.password_change_required));
          if (error) setError('Не удалось загрузить профиль: ' + error.message);
          setProfileLoading(false);
        });
    }
  }, [session]);
  async function submit(e: any) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await client.functions.invoke('register-company', {
          body: { email, password, full_name: name, company },
        });
        if (error || data?.error) throw new Error(data?.error || error.message);
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (e: any) {
      setError(e.message || 'Не удалось выполнить вход');
    } finally {
      setBusy(false);
    }
  }
  async function updatePassword(e: any) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError('');
    if (nextPassword.length < 10) {
      setError('Новый пароль должен содержать не менее 10 символов');
      setBusy(false);
      return;
    }
    const { error: finishError } = await client.functions.invoke('complete-password-change', {
      body: { password: nextPassword },
    });
    if (finishError) {
      setError(finishError.message);
      setBusy(false);
      return;
    }
    await client.auth.refreshSession();
    setNeedsPassword(false);
    setBusy(false);
  }
  if (loading || (session && profileLoading))
    return (
      <div className="auth-loading">
        КОНТУР <span>Загрузка рабочего пространства…</span>
      </div>
    );
  if (!client)
    return (
      <div className="auth-root">
        <div className="auth-card">
          <h1>Подключите рабочую базу</h1>
          <p>
            Укажите локальный Supabase URL и публичный ключ в `.env.local`, затем перезапустите
            приложение.
          </p>
        </div>
      </div>
    );
  if (session && needsPassword)
    return (
      <div className="auth-root">
        <div className="auth-art">
          <div className="auth-logo">
            <b>КОНТУР</b>
            <span>УПРАВЛЕНИЕ СТРОИТЕЛЬСТВОМ</span>
          </div>
          <div className="auth-art-copy">
            <span>ДОСТУП В КОМАНДУ</span>
            <h1>
              Ваш первый
              <br />
              вход на объект.
            </h1>
            <p>Задайте личный пароль, чтобы открыть рабочее пространство.</p>
          </div>
          <div className="auth-art-foot">ПЛОЩАДКА · КОМАНДА · РЕЗУЛЬТАТ</div>
        </div>
        <section className="auth-side">
          <form className="auth-form password-change-form" onSubmit={updatePassword}>
            <div className="auth-icon">
              <LockKeyhole />
            </div>
            <div className="auth-kicker">ЗАЩИТА УЧЁТНОЙ ЗАПИСИ</div>
            <h2>Смените временный пароль</h2>
            <p>
              Придумайте новый пароль длиной не менее 10 символов. После смены откроются задачи
              вашей компании.
            </p>
            <label>
              Новый пароль
              <input
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                required
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить пароль'} <ArrowRight size={16} />
            </button>
          </form>
        </section>
      </div>
    );
  if (session && profile) return <Workspace />;
  return (
    <div className="auth-root">
      <div className="auth-art">
        <div className="auth-logo">
          <div className="auth-symbol">
            <span />
            <span />
            <span />
          </div>
          <div>
            <b>КОНТУР</b>
            <span>УПРАВЛЕНИЕ СТРОИТЕЛЬСТВОМ</span>
          </div>
        </div>
        <div className="auth-art-copy">
          <span>ЕДИНЫЙ РИТМ РАБОТ</span>
          <h1>
            Порядок
            <br />
            на каждом
            <br />
            <em>объекте.</em>
          </h1>
          <p>Задачи, команда и ход строительства — в одном рабочем пространстве.</p>
        </div>
        <div className="auth-art-stats">
          <div>
            <b>01</b>
            <span>ОБЪЕКТЫ</span>
          </div>
          <div>
            <b>02</b>
            <span>ЗАДАЧИ</span>
          </div>
          <div>
            <b>03</b>
            <span>КОНТРОЛЬ</span>
          </div>
        </div>
        <div className="auth-art-foot">
          РАБОЧАЯ СИСТЕМА СТРОЙГРУПП <span>МОСКВА · 2026</span>
        </div>
      </div>
      <section className="auth-side">
        <div className="auth-mobile-logo">
          КОНТУР <small>СТРОИТЕЛЬСТВО</small>
        </div>
        <div className="auth-form">
          <div className="auth-kicker">
            {mode === 'login' ? 'РАБОЧЕЕ ПРОСТРАНСТВО' : 'НОВАЯ КОМПАНИЯ'}
          </div>
          <h2>{mode === 'login' ? 'С возвращением' : 'Начните работу'}</h2>
          <p>
            {mode === 'login'
              ? 'Войдите, чтобы увидеть актуальные задачи и объекты.'
              : 'Создайте компанию и станьте её первым постановщиком.'}
          </p>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <>
                <label>
                  Ваше имя
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя и фамилия"
                    required
                  />
                </label>
                <label>
                  Название компании
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Например, СтройГрупп"
                    required
                  />
                </label>
              </>
            )}
            <label>
              <span>Email</span>
              <div className="auth-input">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.ru"
                  required
                />
              </div>
            </label>
            <label>
              <span>Пароль</span>
              <div className="auth-input">
                <LockKeyhole size={16} />
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Не менее 10 символов' : 'Ваш пароль'}
                  required
                  minLength={mode === 'register' ? 10 : 1}
                />
              </div>
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" disabled={busy}>
              {busy ? 'Подождите…' : mode === 'login' ? 'Войти в систему' : 'Создать компанию'}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                Впервые здесь?{' '}
                <button
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                >
                  Создать компанию
                </button>
              </>
            ) : (
              <>
                Уже есть аккаунт?{' '}
                <button
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                >
                  Войти
                </button>
              </>
            )}
          </div>
          <div className="auth-security">
            <ShieldCheck size={16} />
            <span>Доступ к объектам ограничен ролью и компанией</span>
          </div>
        </div>
      </section>
    </div>
  );
}
