'use strict';

document.documentElement.dataset.journalReady = 'true';
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const tierNames = { basic: '普通会员', plus: 'Plus 会员', pro: 'Pro 会员' };
const state = { user: null, entries: [], view: 'home', authMode: 'login', cardFlipped: false };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 2600);
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('当前页面不是由应用服务提供。请在项目目录运行 python3 server.py，再打开 http://localhost:8080。');
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || '请求失败'); error.status = response.status; throw error; }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('连接超时，请确认应用服务已启动后重试。');
    throw error;
  } finally { clearTimeout(timeout); }
}
function safeStorage() { try { return window.localStorage; } catch (_) { return null; } }
function calendarKey() { return `studyaboard.calendar.${state.user?.id || 'guest'}`; }
function loadCalendar() {
  const fallback = { summerDate: '', summerSource: '', holidays: [] };
  const storage = safeStorage();
  if (!storage) return fallback;
  try { const value = JSON.parse(storage.getItem(calendarKey()) || 'null'); return value && Array.isArray(value.holidays) ? { ...fallback, ...value } : fallback; }
  catch (_) { return fallback; }
}
function saveCalendar(value) { const storage = safeStorage(); if (storage) storage.setItem(calendarKey(), JSON.stringify(value)); }
function localDate(value) { return value ? new Date(`${value}T12:00:00`) : null; }
function daysUntil(value) {
  const target = localDate(value);
  if (!target || Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.ceil((target - today) / 86400000);
}
function countdownText(days) { if (days === null) return '—'; if (days === 0) return '今天'; return `${days} 天`; }
function formatDate(value) { const date = localDate(value); return date ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''; }
function upcoming(kind) {
  return state.entries.filter(entry => entry.kind === kind && !entry.done && entry.date && daysUntil(entry.date) >= 0)
    .sort((a, b) => `${a.date} ${a.start || ''}`.localeCompare(`${b.date} ${b.start || ''}`))[0] || null;
}
function renderOverview() {
  const calendar = loadCalendar();
  const summerDays = daysUntil(calendar.summerDate);
  $('#summer-countdown').textContent = summerDays === null ? '待设置' : summerDays < 0 ? '日期已过' : countdownText(summerDays);
  $('#summer-source').textContent = calendar.summerSource || '请按校历确认日期';
  const assignment = upcoming('assignment');
  $('#assignment-countdown').textContent = assignment ? countdownText(daysUntil(assignment.date)) : '—';
  $('#assignment-name').textContent = assignment ? assignment.title : '暂无待交作业';
  const exam = upcoming('exam');
  $('#exam-countdown').textContent = exam ? countdownText(daysUntil(exam.date)) : '—';
  $('#next-exam-name').textContent = exam ? exam.title : '暂无考试安排';
}
function renderHolidayList() {
  const calendar = loadCalendar();
  const rows = [];
  if (calendar.summerDate) rows.push(`<article><div><strong>暑假</strong><span>${escapeHtml(formatDate(calendar.summerDate))} · ${escapeHtml(calendar.summerSource || '来源未填写')}</span></div><b>${escapeHtml(daysUntil(calendar.summerDate) < 0 ? '已开始' : countdownText(daysUntil(calendar.summerDate)))}</b></article>`);
  calendar.holidays.forEach((holiday, index) => rows.push(`<article><div><strong>${escapeHtml(holiday.name)}</strong><span>${escapeHtml(formatDate(holiday.date))} · ${escapeHtml(holiday.source)}</span></div><b>${escapeHtml(daysUntil(holiday.date) < 0 ? '已结束' : countdownText(daysUntil(holiday.date)))}</b><button type="button" data-delete-holiday="${index}" aria-label="删除${escapeHtml(holiday.name)}">×</button></article>`));
  $('#holiday-list').innerHTML = rows.length ? rows.join('') : '<p class="holiday-empty">还没有设置假期日期。</p>';
}
function openHolidayDialog() {
  const calendar = loadCalendar();
  const form = $('#holiday-form');
  form.elements.summerDate.value = calendar.summerDate;
  form.elements.summerSource.value = calendar.summerSource;
  form.elements.holidayName.value = '';
  form.elements.holidayDate.value = '';
  form.elements.holidaySource.value = '';
  renderHolidayList();
  $('#holiday-dialog').showModal();
}
function playCardTone(flipped) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(flipped ? 520 : 620, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(flipped ? 700 : 480, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.018); gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.17); oscillator.addEventListener('ended', () => context.close());
  } catch (_) { /* Audio is an optional enhancement. */ }
}
function setCardFlipped(flipped, withEffects = true) {
  state.cardFlipped = flipped;
  $('#member-card-inner').classList.toggle('flipped', flipped);
  $('#member-card-front').setAttribute('aria-hidden', String(flipped)); $('#member-card-front').inert = flipped;
  $('#member-card-back').setAttribute('aria-hidden', String(!flipped)); $('#member-card-back').inert = !flipped;
  if (withEffects) {
    const card = $('#member-card'); card.classList.toggle('is-glowing', false);
    setTimeout(() => card.classList.toggle('is-glowing', true), 0); setTimeout(() => card.classList.toggle('is-glowing', false), 650); playCardTone(flipped);
  }
}
const viewCopy = {
  home: ['首页', 'MEMBERSHIP, MADE PERSONAL', '我的会员卡', '轻触卡片，看看属于你的会员权益。'],
  all: ['日程', 'WHAT MATTERS NEXT', '重要的事', '把最近的假期、作业和考试放在眼前。'],
  ai: ['AI 助手', 'YOUR STUDY COMPANION', 'AI 助手', '一个更轻松的对话入口。'],
  profile: ['个人信息', 'YOUR PROFILE', '个人信息', '管理你的账号与会员身份。'],
  membership: ['会员等级', 'MEMBERSHIP', '会员等级', '查看当前会员身份与已开放权益。'],
};
function setView(view) {
  if (!viewCopy[view]) view = 'home'; state.view = view;
  $('#workspace').dataset.view = view;
  const [breadcrumb, eyebrow, title, description] = viewCopy[view];
  $('#breadcrumb').textContent = breadcrumb; $('#page-eyebrow').textContent = eyebrow; $('#page-title').textContent = title; $('#page-description').textContent = description;
  $('#home-content').hidden = view !== 'home'; $('#schedule-content').hidden = view !== 'all'; $('#ai-content').hidden = view !== 'ai'; $('#profile-content').hidden = view !== 'profile'; $('#membership-content').hidden = view !== 'membership';
  $$('.nav-item[data-view], .mobile-nav [data-view]').forEach(button => button.classList.toggle('selected', button.dataset.view === view));
  if (view === 'all') renderOverview();
}
function fillProfile() {
  const name = state.user.name || state.user.email?.split('@')[0] || '同学'; const tier = tierNames[state.user.membership] || tierNames.basic; const initial = name.trim().charAt(0).toUpperCase() || '我';
  $('#profile-name').textContent = name; $('#profile-tier').textContent = tier; $('#avatar').textContent = initial;
  $('#profile-name-large').textContent = name; $('#profile-email').textContent = state.user.email || ''; $('#profile-tier-large').textContent = tier; $('#profile-avatar-large').textContent = initial;
  $('#member-card-owner').textContent = name; $('#member-card-tier').textContent = tier; $('#member-card-code').textContent = `${String(state.user.membership || 'basic').toUpperCase()} MEMBER`; $('#member-card').dataset.tier = state.user.membership || 'basic'; $('#current-membership').textContent = tier;
  $$('.plan-status').forEach(status => { status.textContent = status.dataset.tier === state.user.membership ? '当前等级' : '暂未开放'; });
}
function showAuth(message = '') {
  state.user = null; state.entries = []; $('#workspace').hidden = true; $('#auth').hidden = false; $('#loading').hidden = true; $('#auth-error').textContent = message; $('#auth-submit').disabled = false; setCardFlipped(false, false);
}
async function enterWorkspace(user) {
  state.user = user;
  try { state.entries = await api('/api/entries'); } catch (error) { state.entries = []; toast(error.message); }
  fillProfile(); $('#auth').hidden = true; $('#loading').hidden = true; $('#workspace').hidden = false; setView('home');
}
function configureAuth(mode) {
  state.authMode = mode; const registering = mode === 'register'; $('#name-label').hidden = !registering;
  $('#auth-title').textContent = registering ? '创建你的手记' : '欢迎回来'; $('#auth-description').textContent = registering ? '注册后，从普通会员开始记录。' : '登录，接着安排属于你的日常。';
  $('#auth-submit').innerHTML = registering ? '创建账号 <span>↗</span>' : '登录我的手记 <span>↗</span>'; $$('.auth-tabs [data-auth]').forEach(button => button.classList.toggle('selected', button.dataset.auth === mode));
}
$$('[data-auth]').forEach(button => button.addEventListener('click', () => configureAuth(button.dataset.auth)));
$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('#profile-entry').addEventListener('click', () => setView('profile'));
$('#member-card-details').addEventListener('click', () => setView('membership'));
$('#member-card-front').addEventListener('click', () => setCardFlipped(true));
$('#member-card-back').addEventListener('click', event => { if (!event.target.closest('button')) setCardFlipped(false); });
$('#member-card-back').addEventListener('keydown', event => { if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return; event.preventDefault(); setCardFlipped(false); });
$('#holiday-card').addEventListener('click', openHolidayDialog); $('#calendar-settings').addEventListener('click', openHolidayDialog);
$('#close-holiday-dialog').addEventListener('click', () => $('#holiday-dialog').close()); $('#cancel-holiday-dialog').addEventListener('click', () => $('#holiday-dialog').close());
$('#holiday-list').addEventListener('click', event => {
  const button = event.target.closest('[data-delete-holiday]'); if (!button) return; const calendar = loadCalendar(); calendar.holidays.splice(Number(button.dataset.deleteHoliday), 1); saveCalendar(calendar); renderHolidayList(); renderOverview();
});
$('#holiday-form').addEventListener('submit', event => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  if (values.summerDate && !values.summerSource.trim()) return toast('请填写暑假日期来源');
  if ((values.holidayName || values.holidayDate || values.holidaySource) && !(values.holidayName && values.holidayDate && values.holidaySource.trim())) return toast('请完整填写其他假期的名称、日期和来源');
  const calendar = loadCalendar(); calendar.summerDate = values.summerDate; calendar.summerSource = values.summerSource.trim();
  if (values.holidayName) calendar.holidays.push({ name: values.holidayName.trim(), date: values.holidayDate, source: values.holidaySource.trim() });
  saveCalendar(calendar); renderOverview(); $('#holiday-dialog').close(); toast('校历日期已保存');
});
$('#ai-demo-form').addEventListener('submit', event => { event.preventDefault(); toast('当前为界面预览，暂未接入 AI 服务'); });
$('#logout').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch (_) {} showAuth('已安全退出。'); });
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#auth-error').textContent = ''; $('#auth-submit').disabled = true; const values = Object.fromEntries(new FormData(event.currentTarget));
  try { const user = await api(`/api/${state.authMode}`, { method: 'POST', body: JSON.stringify(values) }); event.currentTarget.reset(); await enterWorkspace(user); }
  catch (error) { $('#auth-error').textContent = error.message; } finally { $('#auth-submit').disabled = false; }
});
$('#today-label').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
(async function bootstrap() {
  $('#loading').hidden = true; $('#auth').hidden = false;
  try { const user = await api('/api/me'); await enterWorkspace(user); }
  catch (error) { showAuth(error.status === 401 ? '' : error.message); }
})();
