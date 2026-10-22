import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';

const statuses = ['Pending', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const emptyTask = { title: '', description: '', assignedTo: '', priority: 'Medium', status: 'Pending', progress: 0, startDate: '', dueDate: '', tags: '' };

function request(path, token, options = {}) {
  return fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
    return data;
  });
}

function personName(person) {
  if (!person) return 'Unassigned';
  if (typeof person === 'string') return person;
  return person.name || 'Unknown user';
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TF';
}

function dateLabel(value) {
  if (!value) return 'No due date';
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${days === -1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('taskflow-session') || 'null'); } catch { return null; }
  });
  const [authMode, setAuthMode] = useState('login');
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [view, setView] = useState('Overview');
  const [filter, setFilter] = useState('All tasks');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('dueDate');
  const [priorityFilter, setPriorityFilter] = useState('Any priority');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activity, setActivity] = useState([]);
  const [comments, setComments] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const token = session?.token;
  const user = session?.user;

  async function loadWorkspace(activeToken = token) {
    if (!activeToken) return;
    const [taskData, userData] = await Promise.all([
      request('/api/tasks', activeToken),
      request('/api/users', activeToken).catch(() => [])
    ]);
    setTasks(Array.isArray(taskData) ? taskData : taskData.tasks || []);
    setUsers(Array.isArray(userData) ? userData : userData.users || []);
  }

  useEffect(() => {
    if (!token) return;
    loadWorkspace().catch((loadError) => {
      if (/session|token|auth/i.test(loadError.message)) signOut();
      else setError(loadError.message);
    });
  }, [token]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const assignedToMe = (task.assignedTo?._id || task.assignedTo) === user?.id;
      const assignedByMe = (task.assignedBy?._id || task.assignedBy) === user?.id;
      const overdue = task.dueDate && new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) && !['Completed', 'Cancelled'].includes(task.status);
      const matchesTab = filter === 'All tasks' ||
        (filter === 'Assigned to me' && assignedToMe) ||
        (filter === 'Assigned by me' && assignedByMe) ||
        (filter === 'Overdue' && overdue) || task.status === filter;
      const matchesQuery = !query || `${task.title} ${task.description || ''} ${(task.tags || []).join(' ')}`.toLowerCase().includes(query);
      return matchesTab && matchesQuery && (priorityFilter === 'Any priority' || task.priority === priorityFilter);
    }).sort((left, right) => {
      if (sort === 'priority') return priorities.indexOf(right.priority) - priorities.indexOf(left.priority);
      if (sort === 'updatedAt') return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
      return new Date(left.dueDate || '9999-12-31') - new Date(right.dueDate || '9999-12-31');
    });
  }, [tasks, filter, search, sort, priorityFilter, user?.id]);

  const counts = useMemo(() => ({
    total: tasks.length,
    open: tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length,
    inProgress: tasks.filter((task) => task.status === 'In Progress').length,
    overdue: tasks.filter((task) => task.dueDate && new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) && !['Completed', 'Cancelled'].includes(task.status)).length,
    completed: tasks.filter((task) => task.status === 'Completed').length
  }), [tasks]);

  function signOut() {
    localStorage.removeItem('taskflow-session');
    setSession(null);
    setTasks([]);
    setUsers([]);
    setView('Overview');
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const data = await request(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, null, { method: 'POST', body: JSON.stringify(payload) });
      const nextSession = { token: data.token, user: { ...data.user, id: data.user.id || data.user._id } };
      localStorage.setItem('taskflow-session', JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (authError) { setError(authError.message); }
    finally { setBusy(false); }
  }

  async function submitTask(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.progress = Number(payload.progress || 0);
    payload.tags = payload.tags ? payload.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
    try {
      const created = await request('/api/tasks', token, { method: 'POST', body: JSON.stringify(payload) });
      setTasks((current) => [created, ...current]);
      setShowCreate(false);
      setNotice('Task created');
      event.currentTarget.reset();
    } catch (taskError) { setError(taskError.message); }
  }

  async function updateTask(taskId, changes) {
    try {
      const updated = await request(`/api/tasks/${taskId}`, token, { method: 'PATCH', body: JSON.stringify(changes) });
      setTasks((current) => current.map((task) => task._id === taskId ? { ...task, ...updated } : task));
      setSelectedTask((current) => current?._id === taskId ? { ...current, ...updated } : current);
      setNotice('Task updated');
      const history = await request(`/api/tasks/${taskId}/activity`, token);
      setActivity(history);
    } catch (taskError) { setError(taskError.message); }
  }

  async function openTask(task) {
    setSelectedTask(task);
    setComments([]);
    setActivity([]);
    const [history, discussion] = await Promise.all([
      request(`/api/tasks/${task._id}/activity`, token).catch(() => []),
      request(`/api/tasks/${task._id}/comments`, token).catch(() => [])
    ]);
    setActivity(history);
    setComments(discussion);
  }

  async function submitComment(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = form.get('message')?.toString().trim();
    if (!message || !selectedTask) return;
    try {
      const comment = await request(`/api/tasks/${selectedTask._id}/comments`, token, { method: 'POST', body: JSON.stringify({ message }) });
      setComments((current) => [...current, comment]);
      setNotice('Comment added');
      event.currentTarget.reset();
      const history = await request(`/api/tasks/${selectedTask._id}/activity`, token);
      setActivity(history);
    } catch (commentError) { setError(commentError.message); }
  }

  async function changeUser(userId, changes) {
    try {
      const updated = await request(`/api/users/${userId}`, token, { method: 'PATCH', body: JSON.stringify(changes) });
      setUsers((current) => current.map((member) => member._id === userId ? { ...member, ...updated } : member));
      setNotice('Team member updated');
    } catch (userError) { setError(userError.message); }
  }

  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} submit={submitAuth} busy={busy} error={error} />;

  const canCreate = ['Admin', 'Manager'].includes(user?.role);
  const canManageUsers = user?.role === 'Admin';

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={() => setView('Overview')}><span className="brand-mark">T</span><span>taskflow</span></a>
      <div className="workspace-chip"><span className="workspace-dot" /><span><b>Acme Studio</b><small>Product workspace</small></span><span className="chevron">⌄</span></div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="navigation" aria-label="Main navigation">
        <NavButton symbol="⌂" label="Overview" view={view} setView={setView} />
        <NavButton symbol="▤" label="My tasks" view={view} setView={setView} badge={counts.open} />
        <NavButton symbol="◫" label="All tasks" view={view} setView={setView} />
        <NavButton symbol="♧" label="Team" view={view} setView={setView} />
        <NavButton symbol="◒" label="Reports" view={view} setView={setView} />
      </nav>
      <p className="nav-label nav-label-spaced">PERSONAL</p>
      <button className="nav-item" onClick={() => setNotice('You are all caught up')}><span className="nav-symbol">◌</span> Inbox</button>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><span className="note-kicker">TEAMWORK, IN FLOW</span><b>Good work moves together.</b><p>Keep tasks, conversations and deadlines in one place.</p></div>
        <div className="account-row"><span className="avatar">{initials(user?.name)}</span><span className="account-name"><b>{user?.name}</b><small>{user?.role}</small></span><button className="icon-button logout" title="Sign out" onClick={signOut}>↗</button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">Acme Studio <span>/</span> <b>{view}</b></div><div className="top-actions"><span className="role-pill">{user?.role}</span><button className="icon-button notification-button" aria-label="Notifications" title="Notifications" onClick={() => setNotice('No new notifications')}>♧<i /></button><button className="avatar top-avatar" title={user?.name}>{initials(user?.name)}</button></div></header>
      {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
      {view === 'Team' ? <TeamView users={users} currentUser={user} changeUser={changeUser} /> : view === 'Reports' ? <ReportsView tasks={tasks} counts={counts} /> : <>
        <section className="page-heading">
          <div><p className="eyebrow">THURSDAY, OCTOBER 22, 2026 <span>·</span> YOUR WORKSPACE</p><h1>{view === 'Overview' ? `Good morning, ${user?.name?.split(' ')[0] || 'there'}` : view}</h1><p className="heading-subtitle">{view === 'Overview' ? 'Here is the pulse of your work today.' : 'A clear view of the work moving through your team.'}</p></div>
          {canCreate && <button className="primary-button" onClick={() => { setError(''); setShowCreate(true); }}><span>+</span> New task</button>}
        </section>
        {view === 'Overview' && <section className="metric-grid" aria-label="Task summary">
          <Metric title="Open tasks" value={counts.open} foot="Across your workspace" tone="mint" symbol="↗" />
          <Metric title="In progress" value={counts.inProgress} foot="Currently being worked on" tone="sky" symbol="◷" />
          <Metric title="Overdue" value={counts.overdue} foot={counts.overdue ? 'Needs attention' : 'Nothing overdue'} tone="rose" symbol="!" />
          <Metric title="Completed" value={counts.completed} foot={`${counts.total} total tasks`} tone="gold" symbol="✓" />
        </section>}
        <section className="work-area">
          <div className="section-heading"><div><span className="section-kicker">TASK MONITOR</span><h2>{view === 'Overview' ? 'Work in motion' : 'Task list'}</h2><p>Track assignments, deadlines and progress in one place.</p></div><button className="text-button" onClick={() => { setView('All tasks'); setFilter('All tasks'); }}>Open task list <span>→</span></button></div>
          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="Task filters">{['All tasks', 'Assigned to me', 'Assigned by me', 'In Progress', 'Overdue', 'Completed'].map((name) => <button key={name} role="tab" aria-selected={filter === name} className={filter === name ? 'tab selected' : 'tab'} onClick={() => setFilter(name)}>{name}</button>)}</div>
            <div className="filter-row"><label className="search-box"><span>⌕</span><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>Any priority</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select><select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value)}><option value="dueDate">Due date</option><option value="priority">Priority</option><option value="updatedAt">Recently updated</option></select></div>
          </div>
          <div className="task-table-wrap"><table className="task-table"><thead><tr><th>TASK</th><th>ASSIGNEE</th><th>PRIORITY</th><th>STATUS</th><th>DUE DATE</th><th>PROGRESS</th></tr></thead><tbody>
            {visibleTasks.map((task) => <tr key={task._id} onClick={() => openTask(task)} tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && openTask(task)}>
              <td><div className="task-title-cell"><span className={`priority-mark ${task.priority?.toLowerCase()}`} /><span><b>{task.title}</b><small>{task.description || 'No description'}</small></span></div></td>
              <td><span className="assignee-cell"><span className="avatar tiny">{initials(personName(task.assignedTo))}</span>{personName(task.assignedTo)}</span></td>
              <td><span className={`priority-label ${task.priority?.toLowerCase()}`}>{task.priority}</span></td>
              <td><span className={`status-label ${task.status?.toLowerCase().replace(' ', '-')}`}><i />{task.status}</span></td>
              <td><span className={`due-label ${task.dueDate && new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) && !['Completed', 'Cancelled'].includes(task.status) ? 'late' : ''}`}>{dateLabel(task.dueDate)}</span></td>
              <td><div className="progress-cell"><span className="progress-track"><i style={{ width: `${task.progress || 0}%` }} /></span><small>{task.progress || 0}%</small></div></td>
            </tr>)}
          </tbody></table>
          {!visibleTasks.length && <div className="empty-state"><span>▤</span><b>No tasks match this view</b><p>Try adjusting your filters or create a task to get started.</p>{canCreate && <button className="secondary-button" onClick={() => setShowCreate(true)}>Create a task</button>}</div>}
          </div>
          <footer className="table-footer"><span>Showing <b>{visibleTasks.length}</b> of <b>{tasks.length}</b> tasks</span><span>Updated just now</span></footer>
        </section>
      </>}
      <footer className="page-footer"><span>TaskFlow <i>·</i> Work, in flow.</span><span>Signed in as {user?.email}</span></footer>
    </main>
    {showCreate && <Modal title="Create a task" close={() => setShowCreate(false)}><form className="task-form" onSubmit={submitTask}>
      <label className="field full"><span>Task title</span><input name="title" required maxLength="140" placeholder="What needs to get done?" /></label>
      <label className="field full"><span>Description</span><textarea name="description" rows="3" placeholder="Add context, expected outcome, or useful links." /></label>
      <label className="field"><span>Assign to</span><select name="assignedTo" required defaultValue=""><option value="" disabled>Select a team member</option>{users.filter((member) => member.isActive !== false).map((member) => <option key={member._id} value={member._id}>{member.name} · {member.role}</option>)}</select></label>
      <label className="field"><span>Priority</span><select name="priority" defaultValue="Medium">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
      <label className="field"><span>Start date</span><input name="startDate" type="date" /></label>
      <label className="field"><span>Due date</span><input name="dueDate" type="date" /></label>
      <label className="field full"><span>Tags <small>Separate with commas</small></span><input name="tags" placeholder="Design, launch" /></label>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit">Create task</button></div>
    </form></Modal>}
    {selectedTask && <Modal title="Task details" close={() => setSelectedTask(null)} wide><div className="detail-layout">
      <div className="detail-main"><div className="detail-meta"><span className={`priority-label ${selectedTask.priority?.toLowerCase()}`}>{selectedTask.priority} priority</span><span className={`status-label ${selectedTask.status?.toLowerCase().replace(' ', '-')}`}><i />{selectedTask.status}</span></div><h2>{selectedTask.title}</h2><p className="detail-description">{selectedTask.description || 'No description has been added.'}</p>
        <div className="detail-grid"><Detail label="Assigned to" value={personName(selectedTask.assignedTo)} /><Detail label="Assigned by" value={personName(selectedTask.assignedBy)} /><Detail label="Start date" value={selectedTask.startDate ? new Date(selectedTask.startDate).toLocaleDateString() : 'Not set'} /><Detail label="Due date" value={dateLabel(selectedTask.dueDate)} /></div>
        {(user?.role === 'Admin' || (selectedTask.assignedTo?._id || selectedTask.assignedTo) === user?.id || (selectedTask.assignedBy?._id || selectedTask.assignedBy) === user?.id) && <div className="task-controls"><label className="field"><span>Update status</span><select value={selectedTask.status} onChange={(event) => updateTask(selectedTask._id, { status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label className="field"><span>Progress <b>{selectedTask.progress || 0}%</b></span><input type="range" min="0" max="100" step="5" value={selectedTask.progress || 0} onChange={(event) => setSelectedTask({ ...selectedTask, progress: Number(event.target.value) })} onMouseUp={(event) => updateTask(selectedTask._id, { progress: Number(event.currentTarget.value) })} onTouchEnd={(event) => updateTask(selectedTask._id, { progress: Number(event.currentTarget.value) })} /></label></div>}
        <section className="discussion"><div className="detail-section-title"><h3>Discussion</h3><span>{comments.length} comments</span></div><div className="comment-list">{comments.map((comment) => <article className="comment" key={comment._id}><span className="avatar tiny">{initials(comment.userId?.name || user?.name)}</span><div><b>{comment.userId?.name || user?.name}</b><small>{new Date(comment.createdAt).toLocaleString()}</small><p>{comment.message}</p></div></article>)}{!comments.length && <p className="muted-copy">No comments yet. Start the conversation.</p>}</div><form className="comment-form" onSubmit={submitComment}><textarea name="message" rows="2" required maxLength="2000" placeholder="Write a comment..." /><button className="primary-button" type="submit">Send</button></form></section>
      </div>
      <aside className="activity-panel"><div className="detail-section-title"><h3>Activity</h3></div>{activity.length ? activity.map((item) => <div className="activity-item" key={item._id}><span className="activity-dot" /><div><b>{item.userId?.name || 'A teammate'}</b><p>{item.action}{item.field ? ` · ${item.field}` : ''}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div></div>) : <p className="muted-copy">Task history will appear here.</p>}</aside>
    </div></Modal>}
    {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
  </div>;
}

function AuthScreen({ mode, setMode, submit, busy, error }) {
  const registering = mode === 'register';
  return <main className="auth-screen"><section className="auth-panel"><a className="brand auth-brand" href="#"><span className="brand-mark">T</span><span>taskflow</span></a><div className="auth-copy"><p className="eyebrow">A CALMER WAY TO GET IT DONE</p><h1>{registering ? 'Make room for good work.' : 'Good work starts here.'}</h1><p>Bring tasks, timelines and team conversations into one clear view.</p></div><form className="auth-form" onSubmit={submit}>{registering && <label className="field"><span>Your name</span><input name="name" autoComplete="name" required maxLength="100" placeholder="Alex Morgan" /></label>}<label className="field"><span>Work email</span><input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength="8" required placeholder="At least 8 characters" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}<span>→</span></button></form><p className="auth-switch">{registering ? 'Already part of TaskFlow?' : 'New to TaskFlow?'} <button onClick={() => setMode(registering ? 'login' : 'register')}>{registering ? 'Sign in' : 'Create an account'}</button></p><p className="auth-footnote">Secure workspace access · Role-based permissions</p></section><aside className="auth-art"><div className="art-grid" /><div className="art-content"><span className="art-label">TASKFLOW / 01</span><h2>Less chasing.<br />More making.</h2><p>A shared space for clear ownership, thoughtful collaboration and work that moves forward.</p><div className="art-lines"><span /><span /><span /></div></div><div className="art-caption">ASSIGN <i>·</i> COLLABORATE <i>·</i> COMPLETE</div></aside></main>;
}

function NavButton({ symbol, label, view, setView, badge }) {
  return <button className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => { setView(label); if (label === 'My tasks') document.querySelector('.tabs .tab:nth-child(2)')?.click(); }}>{/* Symbols are paired with text labels for screen-reader context. */}<span className="nav-symbol" aria-hidden="true">{symbol}</span>{label}{badge > 0 && <small>{badge}</small>}</button>;
}

function Metric({ title, value, foot, tone, symbol }) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{title}</span><i>{symbol}</i></div><strong>{value}</strong><small>{foot}</small></article>;
}

function Modal({ title, close, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close">×</button></header>{children}</section></div>;
}

function Detail({ label, value }) { return <div className="detail"><span>{label}</span><b>{value}</b></div>; }

function TeamView({ users, currentUser, changeUser }) {
  const canManage = currentUser?.role === 'Admin';
  return <section className="work-area team-work"><div className="section-heading"><div><span className="section-kicker">PEOPLE</span><h2>Team directory</h2><p>Active collaborators and their workspace roles.</p></div></div><div className="team-list">{users.map((member) => <article className="team-row" key={member._id}><span className="avatar">{initials(member.name)}</span><span className="team-person"><b>{member.name}</b><small>{member.email}</small></span><span className={`account-state ${member.isActive === false ? 'inactive' : ''}`}><i />{member.isActive === false ? 'Inactive' : 'Active'}</span>{canManage ? <select aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => changeUser(member._id, { role: event.target.value })}><option>Admin</option><option>Manager</option><option>Team Member</option></select> : <span className="role-pill">{member.role}</span>}{canManage && <button className="secondary-button compact" onClick={() => changeUser(member._id, { isActive: member.isActive === false })}>{member.isActive === false ? 'Activate' : 'Deactivate'}</button>}</article>)}{!users.length && <div className="empty-state"><b>No team members available</b><p>Registered users will appear here.</p></div>}</div></section>;
}

function ReportsView({ tasks, counts }) {
  const distribution = statuses.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length }));
  return <section className="work-area reports-work"><div className="section-heading"><div><span className="section-kicker">TEAM PULSE</span><h2>Workload &amp; progress</h2><p>A live summary of tasks you have access to.</p></div></div><div className="report-metrics"><Metric title="Total tasks" value={counts.total} foot="In your workspace" tone="mint" symbol="▤" /><Metric title="Open tasks" value={counts.open} foot="Still in motion" tone="sky" symbol="↗" /><Metric title="Overdue" value={counts.overdue} foot="Past their due date" tone="rose" symbol="!" /><Metric title="Completed" value={counts.completed} foot="Finished tasks" tone="gold" symbol="✓" /></div><section className="distribution"><h3>Status distribution</h3>{distribution.map(({ status, count }) => <div className="distribution-row" key={status}><span>{status}</span><span className="distribution-track"><i className={status.toLowerCase().replace(' ', '-')} style={{ width: `${tasks.length ? (count / tasks.length) * 100 : 0}%` }} /></span><b>{count}</b></div>)}</section></section>;
}

createRoot(document.getElementById('root')).render(<App />);