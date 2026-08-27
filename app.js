const tasks = [
  { title: 'Finalize pricing page', detail: 'Marketing website · Product launch', status: 'in-progress', statusLabel: 'In progress', priority: 'High', due: 'Due today', color: 'coral' },
  { title: 'Prepare user interview script', detail: 'Research · Discovery sprint', status: 'pending', statusLabel: 'Pending', priority: 'Medium', due: 'Due tomorrow', color: 'yellow' },
  { title: 'Mobile onboarding flow', detail: 'Mobile app · UX improvements', status: 'in-progress', statusLabel: 'In progress', priority: 'High', due: 'Due Aug 29', color: 'coral' },
  { title: 'Design system audit', detail: 'Brand foundations · Q3', status: 'completed', statusLabel: 'Completed', priority: 'Low', due: 'Completed Aug 26', color: 'green' },
  { title: 'Q3 research synthesis', detail: 'Research · Strategy', status: 'pending', statusLabel: 'Pending', priority: 'Low', due: 'Due Sep 02', color: 'purple' },
  { title: 'Accessibility review', detail: 'Product · Quality', status: 'completed', statusLabel: 'Completed', priority: 'Medium', due: 'Completed Aug 25', color: 'green' },
  { title: 'Analytics event mapping', detail: 'Product · Instrumentation', status: 'in-progress', statusLabel: 'In progress', priority: 'Medium', due: 'Due Sep 04', color: 'yellow' },
  { title: 'Update component library', detail: 'Design system · Foundations', status: 'in-progress', statusLabel: 'In progress', priority: 'Low', due: 'Due Sep 06', color: 'green' }
];

const taskList = document.querySelector('#taskList');
const toast = document.querySelector('#toast');
let activeFilter = 'all';

function renderTasks() {
  const visible = activeFilter === 'all' ? tasks : tasks.filter((task) => task.status === activeFilter);
  taskList.innerHTML = visible.map((task) => `<article class="task-row" tabindex="0"><span class="task-dot" style="background:var(--${task.color === 'green' ? 'green-strong' : task.color === 'yellow' ? 'yellow-strong' : task.color === 'purple' ? 'blue-strong' : 'coral-strong'})"></span><div class="task-main"><b>${task.title}</b><small>${task.detail}</small></div><span class="status-badge ${task.status}">${task.statusLabel}</span><span class="priority ${task.priority.toLowerCase()}">${task.priority}</span><span class="task-meta">${task.due}</span></article>`).join('');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

renderTasks();
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelector('.tab.active').classList.remove('active');
  tab.classList.add('active');
  activeFilter = tab.dataset.filter;
  renderTasks();
}));
document.querySelector('#viewAllButton').addEventListener('click', () => {
  activeFilter = 'all';
  document.querySelector('.tab.active').classList.remove('active');
  document.querySelector('[data-filter="all"]').classList.add('active');
  renderTasks();
  showToast('Showing all 8 tasks');
});
document.querySelector('#notificationButton').addEventListener('click', () => showToast('You have 3 unread notifications'));
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));

const backdrop = document.querySelector('#modalBackdrop');
function closeModal() { backdrop.hidden = true; }
document.querySelector('#newTaskButton').addEventListener('click', () => { backdrop.hidden = false; document.querySelector('[name="title"]').focus(); });
document.querySelector('#closeModal').addEventListener('click', closeModal);
document.querySelector('#cancelModal').addEventListener('click', closeModal);
backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
document.querySelector('#taskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  tasks.unshift({ title: form.get('title'), detail: form.get('description') || 'New workspace task', status: 'pending', statusLabel: 'Pending', priority: form.get('priority'), due: 'Due soon', color: 'yellow' });
  closeModal();
  event.target.reset();
  activeFilter = 'all';
  document.querySelector('.tab.active').classList.remove('active');
  document.querySelector('[data-filter="all"]').classList.add('active');
  renderTasks();
  showToast('Task created successfully');
});