import { useCallback, useEffect, useMemo, useState } from 'react';
import { client } from './client';
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  Users,
  Plus,
  Search,
  MapPin,
  ChevronRight,
  ArrowLeft,
  Check,
  Clock3,
  HardHat,
  Send,
  Archive,
  MapPinned,
  RefreshCw,
  LogOut,
  TriangleAlert,
  Filter,
  CalendarDays,
  MessageSquare,
} from 'lucide-react';
type Status = 'Новая' | 'В работе' | 'На проверке' | 'Принята' | 'На доработке';
type Profile = { id: string; full_name: string; role: 'manager' | 'executor'; company_id: string };
type Obj = { id: string; name: string; address: string; created_at: string };
type Task = {
  id: string;
  title: string;
  description: string;
  object_id: string;
  assignee_id: string;
  author_id: string;
  status: Status;
  created_at: string;
  object?: Obj;
  assignee?: Profile;
  author?: Profile;
};
const statusKey = (s: Status) =>
  ({
    Новая: 'new',
    'В работе': 'progress',
    'На проверке': 'review',
    Принята: 'done',
    'На доработке': 'rework',
  })[s];
const date = (x: string) =>
  new Date(x).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
export default function Workspace() {
  const navPrefix = 'crm:' + (localStorage.getItem('crm-active-user') || 'default') + ':';
  const [profile, setProfile] = useState<Profile | null>(null),
    [company, setCompany] = useState('Компания'),
    [objects, setObjects] = useState<Obj[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [staff, setStaff] = useState<Profile[]>([]),
    [page, setPage] = useState<'Объекты' | 'Мои задачи' | 'Команда'>(() => {
      const v = localStorage.getItem(navPrefix + 'page');
      return v === 'Мои задачи' || v === 'Команда' ? v : 'Объекты';
    }),
    [selectedObject, setSelectedObject] = useState<string | null>(() =>
      localStorage.getItem(navPrefix + 'object'),
    ),
    [selectedTask, setSelectedTask] = useState<Task | null>(null),
    [pendingTaskId, setPendingTaskId] = useState<string | null>(() =>
      localStorage.getItem(navPrefix + 'task'),
    ),
    [dataLoaded, setDataLoaded] = useState(false),
    [history, setHistory] = useState<any[]>([]),
    [search, setSearch] = useState(''),
    [statusFilter, setStatusFilter] = useState('Все статусы'),
    [inviteOpen, setInviteOpen] = useState(false),
    [dialog, setDialog] = useState<'object' | 'task' | null>(null),
    [editing, setEditing] = useState<Obj | Task | null>(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const manager = profile?.role === 'manager';
  const toast = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 3200);
  };
  useEffect(() => {
    localStorage.setItem(navPrefix + 'page', page);
    selectedObject
      ? localStorage.setItem(navPrefix + 'object', selectedObject)
      : localStorage.removeItem(navPrefix + 'object');
    pendingTaskId
      ? localStorage.setItem(navPrefix + 'task', pendingTaskId)
      : localStorage.removeItem(navPrefix + 'task');
  }, [page, selectedObject, pendingTaskId, navPrefix]);
  const load = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setError('');
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      setBusy(false);
      setDataLoaded(true);
      return;
    }
    const { data: p, error: pe } = await client
      .from('profiles')
      .select('id,full_name,role,company_id,companies(name)')
      .eq('id', session.user.id)
      .single();
    if (pe) {
      setError(pe.message);
      setBusy(false);
      setDataLoaded(true);
      return;
    }
    setProfile(p);
    setCompany((p as any).companies?.name || 'Компания');
    const [{ data: o, error: oe }, { data: t, error: te }, { data: s, error: se }] =
      await Promise.all([
        client
          .from('objects')
          .select('id,name,address,created_at')
          .order('created_at', { ascending: false }),
        client
          .from('tasks')
          .select(
            'id,title,description,object_id,assignee_id,author_id,status,created_at,object:objects(id,name,address),assignee:profiles!tasks_assignee_id_fkey(id,full_name,role,company_id),author:profiles!tasks_author_id_fkey(id,full_name,role,company_id)',
          )
          .order('created_at', { ascending: false }),
        client.from('profiles').select('id,full_name,role,company_id').order('full_name'),
      ]);
    if (oe || te || se) setError([oe, te, se].find(Boolean)?.message || 'Ошибка загрузки');
    setObjects(o || []);
    setTasks((t || []) as any);
    setStaff(s || []);
    setBusy(false);
    setDataLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const taskList = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!selectedObject || t.object_id === selectedObject) &&
          (!search ||
            `${t.title} ${t.object?.name || ''} ${t.assignee?.full_name || ''}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (statusFilter === 'Все статусы' || t.status === statusFilter),
      ),
    [tasks, selectedObject, search, statusFilter],
  );
  async function openTask(t: Task) {
    setSelectedTask(t);
    setPendingTaskId(t.id);
    setError('');
    const { data, error } = await client!
      .from('task_history')
      .select('id,from_status,to_status,comment,created_at,actor_id')
      .eq('task_id', t.id)
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      setHistory([]);
      return;
    }
    const ids = [...new Set((data || []).map((h: any) => h.actor_id))];
    const { data: people } = await client!.from('profiles').select('id,full_name').in('id', ids);
    setHistory(
      (data || []).map((h: any) => ({
        ...h,
        actor: people?.find((p: any) => p.id === h.actor_id),
      })),
    );
  }
  async function saveObject(v: any) {
    if (!client || !profile) return;
    setBusy(true);
    const r = editing
      ? await client
          .from('objects')
          .update({ name: v.name, address: v.address })
          .eq('id', (editing as Obj).id)
      : await client
          .from('objects')
          .insert({ name: v.name, address: v.address, company_id: profile.company_id });
    setBusy(false);
    if (r.error) {
      setError(r.error.message);
      return;
    }
    setDialog(null);
    setEditing(null);
    await load();
    toast(editing ? 'Объект обновлён' : 'Объект создан');
  }
  async function archiveObject(o: Obj) {
    if (!confirm(`Архивировать объект «${o.name}»? Его задачи и история останутся в базе.`)) return;
    const { error } = await client!
      .from('objects')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', o.id);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
    toast('Объект перемещён в архив');
  }
  async function saveTask(v: any) {
    if (!client || !profile) return;
    setBusy(true);
    const r = editing
      ? await client
          .from('tasks')
          .update({
            title: v.title,
            description: v.description,
            object_id: v.object_id,
            assignee_id: v.assignee_id,
          })
          .eq('id', (editing as Task).id)
      : await client.from('tasks').insert({
          title: v.title,
          description: v.description,
          object_id: v.object_id,
          assignee_id: v.assignee_id,
          author_id: profile.id,
          status: 'Новая',
        });
    setBusy(false);
    if (r.error) {
      setError(r.error.message);
      return;
    }
    setDialog(null);
    setEditing(null);
    await load();
    toast(editing ? 'Задача обновлена' : 'Задача создана');
  }
  async function archiveTask(t: Task) {
    if (!confirm(`Архивировать задачу «${t.title}»? История изменений сохранится.`)) return;
    const { error } = await client!
      .from('tasks')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', t.id);
    if (error) {
      setError(error.message);
      return;
    }
    setSelectedTask(null);
    setPendingTaskId(null);
    await load();
    toast('Задача перемещена в архив');
  }
  async function changeStatus(t: Task, to: Status, comment = '') {
    if (!client) return;
    if (to === 'На доработке' && !comment.trim()) {
      setError('Для возврата на доработку нужен комментарий');
      return;
    }
    setBusy(true);
    const { error } = await client.rpc('change_task_status', {
      p_task: t.id,
      p_status: to,
      p_comment: comment || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
    const updated = tasks.find((x) => x.id === t.id);
    if (updated) await openTask({ ...updated, status: to });
    toast(`Статус изменён: ${to}`);
  }
  useEffect(() => {
    if (!dataLoaded || !pendingTaskId) return;
    const task = tasks.find((t) => t.id === pendingTaskId);
    if (task) {
      if (selectedTask?.id !== task.id) void openTask(task);
    } else setPendingTaskId(null);
  }, [dataLoaded, tasks, pendingTaskId, selectedTask?.id]);
  const heading = selectedTask
    ? 'Карточка задачи'
    : selectedObject
      ? objects.find((o) => o.id === selectedObject)?.name
      : page;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <b>контур</b>
            <small>СТРОИТЕЛЬСТВО</small>
          </div>
        </div>
        <div className="workspace">
          <div className="workspace-logo">{company[0]?.toUpperCase()}</div>
          <div>
            <b>{company}</b>
            <small>Рабочее пространство</small>
          </div>
        </div>
        <div className="nav-label">РАБОЧИЙ ЖУРНАЛ</div>
        <nav>
          <button
            className={`nav-item ${page === 'Объекты' ? 'active' : ''}`}
            onClick={() => {
              setPage('Объекты');
              setSelectedObject(null);
              setSelectedTask(null);
              setPendingTaskId(null);
            }}
          >
            <Building2 size={18} />
            Объекты
          </button>
          <button
            className={`nav-item ${page === 'Мои задачи' ? 'active' : ''}`}
            onClick={() => {
              setPage('Мои задачи');
              setSelectedObject(null);
              setSelectedTask(null);
              setPendingTaskId(null);
            }}
          >
            <ClipboardList size={18} />
            Мои задачи{' '}
            <i>
              {tasks.filter((t) => t.assignee_id === profile?.id && t.status !== 'Принята').length}
            </i>
          </button>
          {manager && (
            <button
              className={`nav-item ${page === 'Команда' ? 'active' : ''}`}
              onClick={() => {
                setPage('Команда');
                setSelectedObject(null);
                setSelectedTask(null);
                setPendingTaskId(null);
              }}
            >
              <Users size={18} />
              Команда
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help">
            <div className="help-icon">
              <MapPinned size={18} />
            </div>
            <b>Рабочий журнал</b>
            <p>История задач хранится вместе с объектом и доступна команде.</p>
          </div>
          <button className="profile" onClick={() => client?.auth.signOut()}>
            <div className="avatar">
              {profile?.full_name
                .split(' ')
                .map((x) => x[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <b>{profile?.full_name}</b>
              <small>{manager ? 'Постановщик' : 'Исполнитель'} · Выйти</small>
            </div>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            {company}
            <ChevronRight size={14} />
            <b>{heading}</b>
          </div>
          <div className="top-actions">
            <span className="today">
              <CalendarDays size={15} />
              {new Date().toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            {manager && (
              <button className="primary top-invite" onClick={() => setInviteOpen(true)}>
                <Plus size={15} />
                Добавить участника
              </button>
            )}
            <button className="icon-btn" onClick={() => void load()} title="Обновить">
              <RefreshCw size={17} />
            </button>
            <div className="avatar mini">
              {profile?.full_name
                .split(' ')
                .map((x) => x[0])
                .slice(0, 2)
                .join('')}
            </div>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="inline-error">
              <TriangleAlert size={16} />
              {error}
              <button onClick={() => setError('')}>Закрыть</button>
            </div>
          )}
          {selectedTask ? (
            <>
              <button
                className="back"
                onClick={() => {
                  setSelectedTask(null);
                  setPendingTaskId(null);
                }}
              >
                <ArrowLeft size={16} />К списку
              </button>
              <div className="detail-grid">
                <section className="detail-card">
                  <div className="detail-title">
                    <span className={`badge ${statusKey(selectedTask.status)}`}>
                      <i />
                      {selectedTask.status}
                    </span>
                    {manager && (
                      <div className="detail-tools">
                        <button
                          onClick={() => {
                            setEditing(selectedTask);
                            setDialog('task');
                          }}
                        >
                          Изменить
                        </button>
                        <button onClick={() => void archiveTask(selectedTask)}>
                          <Archive size={14} /> Архивировать
                        </button>
                      </div>
                    )}
                  </div>
                  <h1>{selectedTask.title}</h1>
                  <p className="detail-description">
                    {selectedTask.description || 'Описание не добавлено'}
                  </p>
                  <div className="detail-fields">
                    <div>
                      <small>ОБЪЕКТ</small>
                      <b>
                        <Building2 size={15} />
                        {selectedTask.object?.name || '—'}
                      </b>
                    </div>
                    <div>
                      <small>ИСПОЛНИТЕЛЬ</small>
                      <b>{selectedTask.assignee?.full_name || '—'}</b>
                    </div>
                    <div>
                      <small>СОЗДАНА</small>
                      <b>
                        <CalendarDays size={15} />
                        {date(selectedTask.created_at)}
                      </b>
                    </div>
                    <div>
                      <small>АВТОР</small>
                      <b>{selectedTask.author?.full_name || 'Постановщик'}</b>
                    </div>
                  </div>
                  {!manager &&
                    (selectedTask.status === 'Новая' || selectedTask.status === 'На доработке') && (
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void changeStatus(selectedTask, 'В работе')}
                        >
                          <HardHat size={16} />
                          Взять в работу
                        </button>
                      </div>
                    )}
                  {!manager && selectedTask.status === 'В работе' && (
                    <div className="actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void changeStatus(selectedTask, 'На проверке')}
                      >
                        <Send size={15} />
                        Отправить на проверку
                      </button>
                    </div>
                  )}
                  {manager && selectedTask.status === 'На проверке' && (
                    <ReviewControls
                      disabled={busy}
                      review={(comment: string) =>
                        void changeStatus(selectedTask, 'На доработке', comment)
                      }
                      accept={() => void changeStatus(selectedTask, 'Принята')}
                    />
                  )}
                </section>
                <section className="history-card">
                  <div className="panel-head">
                    <div>
                      <h2>История задачи</h2>
                      <p>Записи аудита из базы данных</p>
                    </div>
                    <Clock3 size={17} />
                  </div>
                  {history.length ? (
                    <div className="timeline">
                      {history.map((h) => (
                        <div className="timeline-item" key={h.id}>
                          <div className={`timeline-marker ${statusKey(h.to_status)}`} />
                          <div>
                            <b>{h.to_status}</b>
                            <small>
                              {h.actor?.full_name || 'Участник команды'} ·{' '}
                              {new Date(h.created_at).toLocaleString('ru-RU')}
                            </small>
                            {h.comment && <p>{h.comment}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">История пока пуста</div>
                  )}
                </section>
              </div>
            </>
          ) : selectedObject ? (
            <>
              <button className="back" onClick={() => setSelectedObject(null)}>
                <ArrowLeft size={16} />
                Все объекты
              </button>
              {(() => {
                const o = objects.find((x) => x.id === selectedObject);
                if (!o) return null;
                return (
                  <>
                    <div className="site-banner">
                      <div className="site-photo">
                        <Building2 size={34} />
                      </div>
                      <div className="site-title">
                        <div className="eyebrow">СТРОИТЕЛЬНЫЙ ОБЪЕКТ</div>
                        <h2>{o.name}</h2>
                        <p>
                          <MapPin size={15} />
                          {o.address}
                        </p>
                      </div>
                      {manager && (
                        <button className="archive-link" onClick={() => void archiveObject(o)}>
                          <Archive size={15} />
                          Архивировать
                        </button>
                      )}
                    </div>
                    <TaskTable
                      tasks={taskList}
                      manager={manager}
                      open={openTask}
                      edit={(t: Task) => {
                        setEditing(t);
                        setDialog('task');
                      }}
                      archive={archiveTask}
                      create={() => {
                        setEditing(null);
                        setDialog('task');
                      }}
                      empty="На этом объекте пока нет задач."
                    />
                  </>
                );
              })()}
            </>
          ) : page === 'Команда' ? (
            <>
              <div className="greeting">
                <div>
                  <div className="eyebrow">КОМАНДА ОБЪЕКТА</div>
                  <h1>Сотрудники</h1>
                  <p>Роли и доступ в компании {company}.</p>
                </div>
              </div>
              <section className="staff-list">
                {staff.map((p) => (
                  <article className="staff-card" key={p.id}>
                    <div className="avatar">
                      {p.full_name
                        .split(' ')
                        .map((x) => x[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className="staff-person">
                      <b>{p.full_name}</b>
                      <small>{p.role === 'manager' ? 'Постановщик' : 'Исполнитель'}</small>
                    </div>
                    <span className={`role-chip ${p.role}`}>
                      {p.role === 'manager' ? 'Все объекты' : 'Назначенные задачи'}
                    </span>
                  </article>
                ))}
              </section>
            </>
          ) : page === 'Мои задачи' ? (
            <>
              <PageTitle
                kicker="НАЗНАЧЕНО ВАМ"
                title="Мои задачи"
                subtitle="Ваш рабочий список по всем объектам."
              />
              <TaskControls
                search={search}
                setSearch={setSearch}
                status={statusFilter}
                setStatus={setStatusFilter}
              />
              <TaskTable
                tasks={tasks.filter(
                  (t) =>
                    t.assignee_id === profile?.id &&
                    (!search ||
                      `${t.title} ${t.object?.name}`
                        .toLowerCase()
                        .includes(search.toLowerCase())) &&
                    (statusFilter === 'Все статусы' || t.status === statusFilter),
                )}
                manager={false}
                open={openTask}
                empty="Вам пока не назначили задачи."
              />
            </>
          ) : (
            <>
              <PageTitle
                kicker="РАБОЧЕЕ ПРОСТРАНСТВО"
                title="Объекты"
                subtitle={`${objects.length} активных площадок · ${tasks.length} задач`}
              />
              <div className="work-toolbar">
                <div className="search">
                  <Search size={16} />
                  <input
                    placeholder="Найти объект или задачу"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {manager && (
                  <button
                    className="primary"
                    onClick={() => {
                      setEditing(null);
                      setDialog('object');
                    }}
                  >
                    <Plus size={16} />
                    Новый объект
                  </button>
                )}
              </div>
              {objects.filter((o) =>
                `${o.name} ${o.address}`.toLowerCase().includes(search.toLowerCase()),
              ).length ? (
                <div className="db-object-grid">
                  {objects
                    .filter((o) =>
                      `${o.name} ${o.address}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((o) => {
                      const ot = tasks.filter((t) => t.object_id === o.id);
                      return (
                        <article className="db-object-card" key={o.id}>
                          <button
                            className="db-object-open"
                            onClick={() => setSelectedObject(o.id)}
                          >
                            <div className="db-building-thumb">
                              <Building2 size={23} />
                              <span>СТРОЙПЛОЩАДКА</span>
                            </div>
                            <div className="db-object-copy">
                              <h2>{o.name}</h2>
                              <p>
                                <MapPin size={14} />
                                {o.address}
                              </p>
                              <div className="object-card-bottom">
                                <span>{ot.length} задач</span>
                                <span className="mini-status">
                                  {ot.filter((t) => t.status !== 'Принята').length} активных{' '}
                                  <ChevronRight size={14} />
                                </span>
                              </div>
                            </div>
                          </button>
                          {manager && (
                            <button
                              className="object-edit"
                              title="Изменить объект"
                              onClick={() => {
                                setEditing(o);
                                setDialog('object');
                              }}
                            >
                              Изменить
                            </button>
                          )}
                        </article>
                      );
                    })}
                </div>
              ) : (
                <div className="empty-card">
                  <Building2 size={28} />
                  <h3>{busy ? 'Загружаем объекты' : 'Пока нет объектов'}</h3>
                  <p>
                    {manager
                      ? 'Создайте строительный объект, чтобы назначать на нём задачи.'
                      : 'Здесь появятся площадки, где у вас есть назначенные задачи.'}
                  </p>
                  {manager && (
                    <button
                      className="primary"
                      onClick={() => {
                        setEditing(null);
                        setDialog('object');
                      }}
                    >
                      <Plus size={15} />
                      Создать объект
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {inviteOpen && (
            <InviteDialog
              close={() => setInviteOpen(false)}
              created={async () => {
                setInviteOpen(false);
                await load();
                toast('Участник добавлен. Передайте ему временный пароль.');
              }}
            />
          )}
          {dialog && (
            <RecordDialog
              kind={dialog}
              record={editing}
              objects={objects}
              staff={staff}
              profile={profile}
              close={() => {
                setDialog(null);
                setEditing(null);
              }}
              save={dialog === 'object' ? saveObject : saveTask}
              busy={busy}
            />
          )}
        </div>
      </main>
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
function PageTitle({ kicker, title, subtitle }: any) {
  return (
    <div className="greeting">
      <div>
        <div className="eyebrow">{kicker}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function TaskControls({ search, setSearch, status, setStatus }: any) {
  return (
    <div className="toolbar">
      <div className="search">
        <Search size={16} />
        <input
          placeholder="Поиск задач или объектов"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <label className="filter-btn">
        <Filter size={14} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {['Все статусы', 'Новая', 'В работе', 'На проверке', 'Принята', 'На доработке'].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
      </label>
    </div>
  );
}
function TaskTable({ tasks, manager, open, edit, archive, create, empty }: any) {
  return (
    <section className="task-panel db-tasks">
      <div className="panel-head">
        <div>
          <h2>Задачи</h2>
          <p>Текущие статусы и назначенные исполнители</p>
        </div>
        {manager && create && (
          <button className="text-btn" onClick={create}>
            <Plus size={15} />
            Новая задача
          </button>
        )}
      </div>
      {tasks.length ? (
        tasks.map((t: Task) => (
          <div className="task-row" key={t.id}>
            <div className={`task-marker ${statusKey(t.status)}`} />
            <div className="task-main" onClick={() => open(t)}>
              <b>{t.title}</b>
              <div className="task-meta">
                <span>
                  <Building2 size={13} />
                  {t.object?.name || 'Объект'}
                </span>
                <span>·</span>
                <span>{t.assignee?.full_name || 'Исполнитель'}</span>
              </div>
            </div>
            <span className={`badge ${statusKey(t.status)}`}>
              <i />
              {t.status}
            </span>
            {manager && (
              <div className="db-row-actions">
                <button onClick={() => edit?.(t)}>Изменить</button>
                <button onClick={() => archive?.(t)}>
                  <Archive size={13} />
                </button>
              </div>
            )}
            <button className="row-open" onClick={() => open(t)}>
              <ChevronRight size={17} />
            </button>
          </div>
        ))
      ) : (
        <div className="empty">{empty || 'Задачи не найдены'}</div>
      )}
    </section>
  );
}
function RecordDialog({ kind, record, objects, staff, profile, close, save, busy }: any) {
  const [title, setTitle] = useState(record?.title || record?.name || ''),
    [description, setDescription] = useState(record?.description || ''),
    [address, setAddress] = useState(record?.address || ''),
    [objectId, setObject] = useState(record?.object_id || objects[0]?.id || ''),
    [assignee, setAssignee] = useState(
      record?.assignee_id || staff.find((x: Profile) => x.role === 'executor')?.id || '',
    );
  return (
    <div className="modal-backdrop" onClick={close}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save(
            kind === 'object'
              ? { name: title, address }
              : { title, description, object_id: objectId, assignee_id: assignee },
          );
        }}
      >
        <div className="modal-head">
          <div>
            <h2>
              {kind === 'object'
                ? record
                  ? 'Изменить объект'
                  : 'Новый объект'
                : record
                  ? 'Изменить задачу'
                  : 'Новая задача'}
            </h2>
            <p>
              {kind === 'object'
                ? 'Площадка вашей компании'
                : 'Задача сразу попадёт в статус «Новая»'}
            </p>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          {kind === 'object' ? 'Название объекта' : 'Название задачи'}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === 'object' ? 'ЖК «Северный парк»' : 'Например, залить фундаментную плиту'
            }
          />
        </label>
        {kind === 'object' ? (
          <label>
            Адрес объекта
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Город, улица, дом"
            />
          </label>
        ) : (
          <>
            <label>
              Описание
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Работы, объём, требования к результату"
              />
            </label>
            <label>
              Объект
              <select required value={objectId} onChange={(e) => setObject(e.target.value)}>
                {objects.map((o: Obj) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Исполнитель
              <select required value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {staff
                  .filter((x: Profile) => x.role === 'executor')
                  .map((x: Profile) => (
                    <option key={x.id} value={x.id}>
                      {x.full_name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
function ReviewControls({ disabled, review, accept }: any) {
  const [comment, setComment] = useState('');
  return (
    <div className="review-actions">
      <div className="comment-input">
        <MessageSquare size={15} />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий обязателен при возврате"
        />
      </div>
      <button
        className="return-btn"
        disabled={disabled || !comment.trim()}
        onClick={() => review(comment)}
      >
        Вернуть на доработку
      </button>
      <button className="accept-btn" disabled={disabled} onClick={accept}>
        <Check size={15} />
        Принять
      </button>
    </div>
  );
}

function InviteDialog({ close, created }: any) {
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [role, setRole] = useState('executor'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: any) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError('');
    const { data, error } = await client.functions.invoke('create-user', {
      body: { full_name: name, email, password, role },
    });
    setBusy(false);
    if (error || data?.error) {
      setError(data?.error || error.message);
      return;
    }
    await created();
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Добавить участника</h2>
            <p>Сотрудник сменит временный пароль при первом входе.</p>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Имя и фамилия
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя сотрудника"
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.ru"
          />
        </label>
        <label>
          Временный пароль
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Не менее 8 символов"
          />
        </label>
        <label>
          Роль
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="executor">Исполнитель</option>
            <option value="manager">Постановщик</option>
          </select>
        </label>
        {error && <div className="inline-error">{error}</div>}
        <div className="modal-actions">
          <button className="cancel" type="button" onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Создаём…' : 'Добавить участника'}
          </button>
        </div>
      </form>
    </div>
  );
}
