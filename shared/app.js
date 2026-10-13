'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const labels = { home: '会员首页', all: '日程总览', course: '课程表', exam: '考试表', daily: '日常记录', membership: '我的会员' };
const tiers = { basic: '普通会员', plus: 'Plus 会员', pro: 'Pro 会员' };
const kindLabels = { course: '课程', exam: '考试', daily: '日常' };
const state = { user: null, entries: [], view: 'all', filter: 'all', mode: 'list', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), date: '', auth: 'login', deleteId: null };
const chat = { messages: [], loaded: false, busy: false, mode: 'local', epoch: 0, retry: null };
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = () => dayKey(new Date());
const friendlyDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) : '日期待定';
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
async function api(path, method = 'GET', data, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`/api/${path}`, { method, signal: controller.signal, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Journal-Request': '1' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('当前地址没有返回应用接口，请确认使用 python3 server.py 启动，并访问对应的 8080 端口。');
    }
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && state.user) { state.user = null; state.entries = []; showAuth(); }
      throw new Error(result.error || '操作失败，请重试');
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(path === 'chat' ? '助手回复超时，请稍后重新发送。' : '连接超时，请检查服务是否仍在运行，以及 8080 端口转发是否正常。');
    if (error instanceof TypeError) throw new Error('无法连接服务，请检查启动服务的终端和浏览器地址。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function showAuth() {
  chat.epoch += 1;
  chat.messages = []; chat.loaded = false; chat.busy = false; chat.retry = null;
  $('#chat-launcher').hidden = true;
  $('#chat-input').value = '';
  $('#chat-share').checked = false;
  $('#chat-messages').textContent = '';
  $('#loading').hidden = true;
  $('#workspace').hidden = true;
  $('#auth').hidden = false;
  $$('dialog[open]').forEach(dialog => dialog.close());
}
async function enterWorkspace() {
  state.entries = await api('entries');
  state.view = 'home'; state.filter = 'all'; state.date = ''; state.mode = 'list';
  $('#search').value = '';
  $('#hide-done').checked = false;
  $('#auth-form').reset();
  $('#auth-error').textContent = '';
  $('#profile-name').textContent = state.user.name;
  $('#profile-tier').textContent = tiers[state.user.membership];
  $('#avatar').textContent = [...state.user.name][0];
  $('#today-label').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#loading').hidden = true; $('#auth').hidden = true; $('#workspace').hidden = false;
  $('#chat-launcher').hidden = false;
  flipMemberCard(false);
  render();
}
$$('[data-auth]').forEach(button => button.addEventListener('click', () => {
  state.auth = button.dataset.auth;
  $$('[data-auth]').forEach(b => b.classList.toggle('selected', b === button));
  const register = state.auth === 'register';
  $('#auth-title').textContent = register ? '写下新的开始' : '欢迎回来';
  $('#auth-description').textContent = register ? '创建账号，收好你的留学日常。' : '登录，接着安排属于你的日常。';
  $('#name-label').hidden = !register;
  $('#auth-form').elements.name.required = register;
  $('#auth-form').elements.password.autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = register ? '创建我的手记 ↗' : '登录我的手记 ↗';
  $('#auth-error').textContent = '';
}));
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#auth-submit').disabled = true;
  $('#auth-error').textContent = '';
  try {
    state.user = await api(state.auth, 'POST', Object.fromEntries(new FormData(event.target)));
    await enterWorkspace();
  } catch (error) { $('#auth-error').textContent = error.message; }
  finally { $('#auth-submit').disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  try { await api('logout', 'POST', {}); state.user = null; state.entries = []; showAuth(); }
  catch (error) { toast(error.message); }
});
function setView(view) {
  flipMemberCard(false);
  state.view = view; state.filter = ['membership', 'home'].includes(view) ? 'all' : view; state.date = '';
  $('#search').value = '';
  render();
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
function flipMemberCard(flipped, moveFocus = false) {
  $('#member-card-inner').classList.toggle('is-flipped', flipped);
  $('#member-card-front').inert = flipped;
  $('#member-card-front').setAttribute('aria-hidden', String(flipped));
  $('#member-card-back').inert = !flipped;
  $('#member-card-back').setAttribute('aria-hidden', String(!flipped));
  if (moveFocus) $(flipped ? '#member-card-return' : '#member-card-front').focus();
}
$('#member-card-front').addEventListener('click', () => flipMemberCard(true, true));
$('#member-card-return').addEventListener('click', () => flipMemberCard(false, true));
$('#member-card-details').addEventListener('click', () => {
  setView('membership');
  $('#page-title').setAttribute('tabindex', '-1');
  $('#page-title').focus();
});
// The profile gives mobile users access to membership when the sidebar is compact.
$('.profile-details').setAttribute('role', 'button');
$('.profile-details').setAttribute('tabindex', '0');
$('.profile-details').setAttribute('aria-label', '查看我的会员');
$('.profile-details').addEventListener('click', () => setView('membership'));
$('.profile-details').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setView('membership'); } });
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  state.view = 'all';
  state.date = '';
  render();
}));
$('#search').addEventListener('input', renderEntries);
$('#hide-done').addEventListener('change', renderEntries);
$('#list-view').addEventListener('click', () => { state.mode = 'list'; render(); });
$('#calendar-view').addEventListener('click', () => { state.mode = 'calendar'; state.date = ''; render(); });
$('#previous-month').addEventListener('click', () => { state.month.setMonth(state.month.getMonth() - 1); render(); });
$('#next-month').addEventListener('click', () => { state.month.setMonth(state.month.getMonth() + 1); render(); });
$('#clear-date').addEventListener('click', () => { state.date = ''; render(); });
function filteredEntries() {
  const search = $('#search').value.trim().toLowerCase();
  return state.entries.filter(entry => (state.filter === 'all' || (state.filter === 'pending' ? (!entry.date || !entry.start) && !entry.done : entry.kind === state.filter)) && (!state.date || entry.date === state.date) && (!$('#hide-done').checked || !entry.done) && `${entry.title} ${entry.location} ${entry.notes}`.toLowerCase().includes(search));
}
function render() {
  const membership = state.view === 'membership';
  const home = state.view === 'home';
  $('#workspace').dataset.view = state.view;
  $('#home-content').hidden = !home;
  $('#home-owner').textContent = `${state.user.name} 的专属留学手记`;
  $('#member-card').hidden = !home;
  $('#member-card').dataset.tier = state.user.membership;
  $('#member-card-tier').textContent = tiers[state.user.membership];
  $('#member-card-owner').textContent = state.user.name;
  $('#member-card-code').textContent = `${state.user.membership.toUpperCase()} MEMBER`;
  $('#member-card-front').setAttribute('aria-label', `${tiers[state.user.membership]}，翻转查看会员权益`);
  $('#schedule-content').hidden = membership || home;
  $('#membership-content').hidden = !membership;
  $('#new-entry').hidden = membership || home;
  $('#breadcrumb').textContent = labels[state.view];
  $('#page-title').textContent = { home: '你的世界，正在展开。', all: '让日常，井井有条。', course: '每一堂课，都有安排。', exam: '从容迎接每一场考试。', daily: '把生活的小事，收好。', membership: '陪伴你的每一段旅程。' }[state.view];
  $('#page-description').textContent = { home: '每一程，都值得。', all: '课程、考试与生活，把每一件小事安放好。', course: '记录课程、教室与学习事项，时间可以稍后补充。', exam: '记录考试与准备事项，确定时间后随时更新。', daily: '记录待办，也写下异国生活中的小小感受。', membership: '查看你的会员等级，以及后续的权益规划。' }[state.view];
  $$('[data-view]').forEach(b => { const active = b.dataset.view === state.view; b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  $('#course-count').innerHTML = `${state.entries.filter(e => e.kind === 'course' && e.date >= dayKey(weekStart) && e.date < dayKey(weekEnd)).length}<small> 门</small>`;
  $('#exam-count').innerHTML = `${state.entries.filter(e => e.kind === 'exam' && !e.done && (!e.date || e.date >= todayKey())).length}<small> 场</small>`;
  $('#pending-count').innerHTML = `${state.entries.filter(e => (!e.date || !e.start) && !e.done).length}<small> 项</small>`;
  $$('.filters [data-filter]').forEach(b => { b.classList.toggle('selected', b.dataset.filter === state.filter); b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)); });
  $('#list-view').classList.toggle('selected', state.mode === 'list');
  $('#calendar-view').classList.toggle('selected', state.mode === 'calendar');
  $('#list-view').setAttribute('aria-pressed', String(state.mode === 'list'));
  $('#calendar-view').setAttribute('aria-pressed', String(state.mode === 'calendar'));
  if (membership) {
    $('#current-membership').textContent = tiers[state.user.membership];
    $$('.plan [data-tier]').forEach(el => { const current = el.dataset.tier === state.user.membership; el.textContent = current ? '当前等级' : '暂未开放升级'; el.closest('.plan').classList.toggle('current', current); });
  }
  renderCalendar(); renderEntries();
}
function monthCells() {
  const year = state.month.getFullYear(), month = state.month.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  return [...Array(offset).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => dayKey(new Date(year, month, i + 1)))];
}
function pickDate(date) { state.date = state.date === date ? '' : date; state.mode = 'list'; render(); }
function renderCalendar() {
  $('#month-label').textContent = state.month.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
  $('#clear-date').hidden = !state.date;
  $('#mini-days').innerHTML = monthCells().map(date => date ? `<button type="button" data-date="${date}" aria-label="${date}，查看日程" aria-pressed="${date === state.date}" class="${date === todayKey() ? 'today' : ''} ${date === state.date ? 'picked' : ''} ${state.entries.some(e => e.date === date) ? 'has-events' : ''}">${Number(date.slice(-2))}</button>` : '<span class="pad"></span>').join('');
  $$('#mini-days [data-date]').forEach(b => b.addEventListener('click', () => pickDate(b.dataset.date)));
}
function renderEntries() {
  const entries = filteredEntries();
  if (state.mode === 'calendar') {
    const days = monthCells(); while (days.length % 7) days.push(null);
    $('#entries').innerHTML = `<div class="large-month"><h3>${escapeHTML($('#month-label').textContent)}</h3><div class="weekdays">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<span>${d}</span>`).join('')}</div><div class="large-days">${days.map(date => `<div class="large-day ${date === todayKey() ? 'today' : ''}">${date ? `<button data-date="${date}" aria-label="查看 ${date} 的日程">${Number(date.slice(-2))}</button>${entries.filter(e => e.date === date).map(e => `<button class="calendar-entry ${e.kind}" data-edit="${e.id}" title="${escapeHTML(e.title)}">${escapeHTML(e.title)}</button>`).join('')}` : ''}</div>`).join('')}</div><p class="calendar-pending">${entries.filter(e => !e.date).length} 项记录尚未确定日期，可在日程列表中查看和补充。</p></div>`;
    $$('#entries [data-date]').forEach(b => b.addEventListener('click', () => pickDate(b.dataset.date)));
  } else if (!entries.length) {
    const filtered = state.entries.length > 0 || state.date || $('#search').value;
    $('#entries').innerHTML = `<div class="empty"><div class="empty-icon">✎</div><h3>${filtered ? '这里暂时没有符合条件的记录' : '你的新一页，从这里开始'}</h3><p>${filtered ? '试试调整筛选，或为这一天添加一条日程。' : '记下一堂课、一场考试，或今天的小小计划。<br>日期和时间还没确定，也可以先留空。'}</p><button class="button secondary" id="empty-new">＋ 记下第一件事</button></div>`;
    $('#empty-new').addEventListener('click', () => openEntry());
  } else {
    let lastDate = null;
    $('#entries').innerHTML = entries.map(entry => {
      const heading = entry.date !== lastDate ? `<div class="entry-group-heading">${escapeHTML(friendlyDate(entry.date))}${entry.date === todayKey() ? ' · 今天' : ''}</div>` : '';
      lastDate = entry.date;
      const time = entry.start ? entry.start + (entry.end ? ` – ${entry.end}` : '') : (entry.end ? `结束于 ${entry.end} · 开始待定` : '时间待定');
      return `${heading}<article class="entry-row ${entry.done ? 'completed' : ''}"><div class="entry-accent ${entry.kind}"></div><div class="entry-text"><div class="entry-title-line"><span class="entry-title">${escapeHTML(entry.title)}</span><span class="badge ${entry.kind}">${kindLabels[entry.kind]}</span></div><div class="entry-meta"><span>◷ ${escapeHTML(time)}</span>${entry.location ? `<span>⌖ ${escapeHTML(entry.location)}</span>` : ''}</div>${entry.notes ? `<p class="entry-notes">${escapeHTML(entry.notes)}</p>` : ''}</div><div class="entry-actions"><input class="completion" type="checkbox" data-done="${entry.id}" ${entry.done ? 'checked' : ''} aria-label="${escapeHTML(entry.title)}：标记完成"><button data-edit="${entry.id}">编辑</button><button class="delete" data-delete="${entry.id}">删除</button></div></article>`;
    }).join('');
  }
  $$('#entries [data-edit]').forEach(b => b.addEventListener('click', () => openEntry(state.entries.find(e => e.id === Number(b.dataset.edit)))));
  $$('#entries [data-delete]').forEach(b => b.addEventListener('click', () => { state.deleteId = Number(b.dataset.delete); $('#delete-dialog').showModal(); }));
  $$('#entries [data-done]').forEach(b => b.addEventListener('change', async () => {
    const entry = state.entries.find(e => e.id === Number(b.dataset.done));
    b.disabled = true;
    try { const saved = await api(`entries/${entry.id}`, 'PUT', { ...entry, done: b.checked }); state.entries = state.entries.map(e => e.id === saved.id ? saved : e); render(); }
    catch (error) { b.checked = !b.checked; toast(error.message); }
    finally { b.disabled = false; }
  }));
}
function openEntry(entry) {
  const form = $('#entry-form'); form.reset();
  form.elements.id.value = entry?.id || '';
  form.elements.kind.value = entry?.kind || (['course', 'exam', 'daily'].includes(state.filter) ? state.filter : 'course');
  form.elements.date.value = state.date;
  if (entry) for (const field of ['title', 'date', 'start', 'end', 'location', 'notes']) form.elements[field].value = entry[field];
  $('#dialog-title').textContent = entry ? '编辑日程' : '新建日程';
  $('#entry-error').textContent = '';
  $('#entry-dialog').showModal();
  form.elements.title.focus();
}
$('#new-entry').addEventListener('click', () => openEntry());
$('#close-dialog').addEventListener('click', () => $('#entry-dialog').close());
$('#cancel-dialog').addEventListener('click', () => $('#entry-dialog').close());
$('#entry-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  $('#entry-error').textContent = '';
  if (data.start && data.end && data.end <= data.start) { $('#entry-error').textContent = '结束时间需晚于开始时间。'; return; }
  const existing = state.entries.find(e => e.id === Number(data.id));
  data.done = existing?.done || false;
  $('#save-entry').disabled = true;
  try {
    await api(data.id ? `entries/${data.id}` : 'entries', data.id ? 'PUT' : 'POST', data);
    state.entries = await api('entries');
    // A saved record should be visible even if its type or date changed.
    state.view = 'all'; state.filter = data.kind; state.date = ''; state.mode = 'list';
    $('#search').value = ''; $('#hide-done').checked = false;
    $('#entry-dialog').close(); render(); toast(existing ? '修改已保存' : '已记下这件小事');
  } catch (error) { $('#entry-error').textContent = error.message; }
  finally { $('#save-entry').disabled = false; }
});
$('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
$('#confirm-delete').addEventListener('click', async () => {
  $('#confirm-delete').disabled = true;
  try { await api(`entries/${state.deleteId}`, 'DELETE'); state.entries = state.entries.filter(e => e.id !== state.deleteId); $('#delete-dialog').close(); render(); toast('记录已删除'); }
  catch (error) { toast(error.message); }
  finally { $('#confirm-delete').disabled = false; }
});

function chatError(message, retryLoad = false) {
  $('#chat-feedback').hidden = !message;
  $('#chat-error').textContent = message;
  $('#chat-reload').hidden = !retryLoad;
}
function renderChat() {
  const box = $('#chat-messages');
  box.innerHTML = chat.messages.length ? chat.messages.map(message => `<article class="chat-message ${message.role}"><span class="chat-speaker">${message.role === 'user' ? '你' : (message.mode === 'ai' ? 'AI 助手' : '本地助手')}</span><p>${escapeHTML(message.content)}</p></article>`).join('') : '<div class="chat-welcome"><span aria-hidden="true">✦</span><h3>给留学生活一点小帮助</h3><p>查课程、看考试，或一起整理待定的安排。<br>从下面的快捷问题开始吧。</p></div>';
  box.scrollTop = box.scrollHeight;
  const disabled = chat.busy || !chat.loaded;
  $('#chat-input').disabled = disabled;
  $('#chat-send').disabled = disabled;
  $('#chat-clear').disabled = disabled || !chat.messages.length;
  $('#chat-share').disabled = disabled;
  $$('.chat-prompts button').forEach(button => { button.disabled = disabled; });
  $('#chat-pending').hidden = !chat.busy || !chat.loaded;
  $('#chat-send').textContent = chat.busy ? '回复中…' : '发送 ↗';
  $('#chat-mode').textContent = !chat.loaded ? '正在连接…' : chat.mode === 'ai' ? 'AI 对话 · 已连接' : '本地助手 · 关键词查询';
  $('#chat-share-label').hidden = !chat.loaded || chat.mode !== 'ai';
  $('#chat-privacy').textContent = !chat.loaded ? '正在连接助手。对话记录按账号保存在本机数据库。' : chat.mode === 'ai' ? '对话会发送至 AI 服务；勾选后还会发送日程摘要，不含备注正文。助手不会自动修改日程。' : '本地模式按关键词查询，数据不会发送至外部模型。聊天记录按账号保存。';
}
async function loadChat() {
  if (chat.busy || !state.user) return;
  const epoch = chat.epoch;
  chat.busy = true; chatError(''); renderChat();
  try {
    const result = await api('chat');
    if (chat.epoch !== epoch) return;
    chat.messages = result.messages; chat.mode = result.mode; chat.loaded = true;
  } catch (error) {
    if (chat.epoch === epoch) chatError(error.message, true);
  } finally {
    if (chat.epoch === epoch) { chat.busy = false; renderChat(); }
  }
}
$('#chat-launcher').addEventListener('click', async () => {
  $('#chat-dialog').showModal();
  if (!chat.loaded) await loadChat();
  if (chat.loaded && !chat.busy && $('#chat-dialog').open) $('#chat-input').focus();
});
$('#chat-close').addEventListener('click', () => $('#chat-dialog').close());
$('#chat-reload').addEventListener('click', loadChat);
$$('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  $('#chat-input').value = button.dataset.prompt;
  $('#chat-form').requestSubmit();
}));
$('#chat-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!chat.busy && chat.loaded) $('#chat-form').requestSubmit();
  }
});
$('#chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('#chat-input').value.trim();
  if (!message || chat.busy || !chat.loaded || !state.user) return;
  const epoch = chat.epoch;
  const share = $('#chat-share').checked;
  const turn = chat.retry?.message === message && chat.retry?.share === share ? chat.retry : { message, share, id: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('') };
  chat.retry = turn;
  chat.busy = true; chatError('');
  const originalMessages = [...chat.messages];
  chat.messages.push({ role: 'user', content: message });
  $('#chat-input').value = ''; renderChat();
  try {
    const result = await api('chat', 'POST', { message, turn_id: turn.id, today: todayKey(), share_schedule: share }, 45000);
    if (chat.epoch !== epoch) return;
    const known = new Set(originalMessages.map(item => item.id));
    chat.messages = [...originalMessages, ...result.messages.filter(item => !known.has(item.id))];
    chat.mode = result.mode; chat.retry = null;
  } catch (error) {
    if (chat.epoch === epoch) {
      chat.messages = originalMessages;
      $('#chat-input').value = message;
      chatError(error.message);
    }
  } finally {
    if (chat.epoch === epoch) {
      chat.busy = false; renderChat();
      if ($('#chat-dialog').open) $('#chat-input').focus();
    }
  }
});
$('#chat-clear').addEventListener('click', async () => {
  if (chat.busy || !window.confirm('清空全部聊天记录？此操作无法恢复，日程不会被删除。')) return;
  const epoch = chat.epoch;
  chat.busy = true; chatError(''); renderChat();
  try {
    await api('chat', 'DELETE');
    if (chat.epoch === epoch) { chat.messages = []; chat.retry = null; }
  } catch (error) {
    if (chat.epoch === epoch) chatError(error.message);
  } finally {
    if (chat.epoch === epoch) { chat.busy = false; renderChat(); }
  }
});
(async () => {
  document.documentElement.dataset.journalReady = 'true';
  showAuth();
  try { state.user = await api('me'); await enterWorkspace(); }
  catch (error) {
    state.user = null;
    showAuth();
    $('#auth-error').textContent = error.message === '请先登录' ? '' : error.message;
  } finally {
    $('#auth-submit').disabled = false;
  }
})();

$('#home-chat').addEventListener('click', () => $('#chat-launcher').click());
