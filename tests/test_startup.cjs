const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const client = process.env.JOURNAL_TEST_CLIENT || 'desktop';
assert.ok(['desktop', 'mobile'].includes(client));
const html = fs.readFileSync(`${client}/index.html`, 'utf8');
const app = fs.readFileSync('shared/app.js', 'utf8');
const startup = fs.readFileSync('shared/startup.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function environment(fetch) {
  // These checks exercise script initialization against IDs in the actual HTML.
  const nodes = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => [id, {
    hidden: /\shidden(?:\s|>)/.test(tag), disabled: /\sdisabled(?:\s|>)/.test(tag),
    textContent: '', value: '', checked: false, handlers: {}, dataset: {},
    focus() {}, showModal() { this.open = true; }, close() { this.open = false; },
    addEventListener(type, callback) { this.handlers[type] = callback; },
    setAttribute() {}, classList: { toggle() {} },
  }]));
  nodes.set('.profile-details', { setAttribute() {}, addEventListener() {} });
  const timers = new Map();
  const events = {};
  const document = {
    documentElement: { dataset: {} },
    querySelector(selector) {
      const node = nodes.get(selector.startsWith('#') ? selector.slice(1) : selector);
      assert.ok(node, `Missing markup for ${selector}`);
      return node;
    },
    querySelectorAll() { return []; },
  };
  const context = vm.createContext({ document, fetch, AbortController, URL, crypto: require('node:crypto').webcrypto,
    location: { href: 'http://localhost:8080/' },
    window: { addEventListener(type, callback) { events[type] = callback; } },
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { nodes, timers, events, context };
}
function jsonResponse(status, data) {
  return { status, ok: status < 400, headers: { get: () => 'application/json' }, json: async () => data };
}

test('login page is visible before JavaScript or API responses', () => {
  const env = environment(() => new Promise(() => {}));
  assert.equal(env.nodes.get('auth').hidden, false);
  assert.equal(env.nodes.get('loading').hidden, true);
});

test('unsigned user reaches enabled login without a loading screen', async () => {
  const env = environment(async () => jsonResponse(401, { error: '请先登录' }));
  vm.runInContext(startup, env.context);
  vm.runInContext(app, env.context);
  await flush();
  assert.equal(env.nodes.get('auth').hidden, false);
  assert.equal(env.nodes.get('loading').hidden, true);
  assert.equal(env.nodes.get('auth-submit').disabled, false);
  assert.equal(env.nodes.get('auth-error').textContent, '');
});

test('stalled API aborts after eight seconds and displays a timeout', async () => {
  let aborted = false;
  const env = environment((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      aborted = true;
      const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
    });
  }));
  vm.runInContext(app, env.context);
  assert.equal(env.nodes.get('auth').hidden, false);
  [...env.timers.values()].find(timer => timer.delay === 8000).callback();
  await flush();
  assert.equal(aborted, true);
  assert.match(env.nodes.get('auth-error').textContent, /连接超时/);
  assert.equal(env.nodes.get('auth-submit').disabled, false);
});

test('wrong static server shows an actionable error instead of loading forever', async () => {
  const env = environment(async () => ({ headers: { get: () => 'text/html' } }));
  vm.runInContext(app, env.context);
  await flush();
  assert.match(env.nodes.get('auth-error').textContent, /python3 server.py/);
  assert.equal(env.nodes.get('auth').hidden, false);
});

test('failed main script shows a refresh instruction', () => {
  const env = environment(() => {});
  vm.runInContext(startup, env.context);
  env.nodes.get('app-script').handlers.error();
  assert.match(env.nodes.get('auth-error').textContent, /脚本未能启动/);
  assert.equal(env.nodes.get('auth').hidden, false);
  assert.equal(env.nodes.get('auth-submit').disabled, true);
});

test('main script that never starts is caught by the watchdog', () => {
  const env = environment(() => {});
  vm.runInContext(startup, env.context);
  [...env.timers.values()].find(timer => timer.delay === 10000).callback();
  assert.match(env.nodes.get('auth-error').textContent, /脚本未能启动/);
});

test('chat loads saved history and escapes message HTML', async () => {
  const env = environment(async path => path === '/api/me' ? jsonResponse(401, { error: '请先登录' }) : jsonResponse(200, { mode: 'local', messages: [{ id: 1, role: 'assistant', mode: 'local', content: '<img src=x onerror=alert(1)>' }] }));
  vm.runInContext(app, env.context);
  await flush();
  vm.runInContext('state.user = {id:1}', env.context);
  await env.nodes.get('chat-launcher').handlers.click();
  assert.match(env.nodes.get('chat-messages').innerHTML, /&lt;img/);
  assert.doesNotMatch(env.nodes.get('chat-messages').innerHTML, /<img/);
  assert.equal(env.nodes.get('chat-send').disabled, false);
  assert.equal(env.nodes.get('chat-share-label').hidden, true);
});

test('failed chat restores the draft and retries the same turn identifier', async () => {
  const ids = [];
  const env = environment(async (path, options) => {
    if (path === '/api/me') return jsonResponse(401, { error: '请先登录' });
    if (options.method === 'GET') return jsonResponse(200, { mode: 'ai', messages: [] });
    ids.push(JSON.parse(options.body).turn_id);
    return jsonResponse(502, { error: 'AI 服务连接失败' });
  });
  vm.runInContext(app, env.context); await flush();
  vm.runInContext('state.user = {id:1}', env.context);
  await env.nodes.get('chat-launcher').handlers.click();
  env.nodes.get('chat-input').value = '我的考试安排';
  const event = { preventDefault() {} };
  await env.nodes.get('chat-form').handlers.submit(event);
  assert.equal(env.nodes.get('chat-input').value, '我的考试安排');
  assert.equal(env.nodes.get('chat-send').disabled, false);
  assert.match(env.nodes.get('chat-error').textContent, /连接失败/);
  await env.nodes.get('chat-form').handlers.submit(event);
  assert.equal(ids[0], ids[1]);
});

test('chat reply arriving after logout cannot leak into the next session', async () => {
  let reply;
  const env = environment(async (path, options) => {
    if (path === '/api/me') return jsonResponse(401, { error: '请先登录' });
    if (options.method === 'GET') return jsonResponse(200, { mode: 'local', messages: [] });
    return new Promise(resolve => { reply = resolve; });
  });
  vm.runInContext(app, env.context); await flush();
  vm.runInContext('state.user = {id:1}', env.context);
  await env.nodes.get('chat-launcher').handlers.click();
  env.nodes.get('chat-input').value = '我的课程';
  const pending = env.nodes.get('chat-form').handlers.submit({ preventDefault() {} });
  vm.runInContext('state.user = null; showAuth()', env.context);
  reply(jsonResponse(200, { mode: 'local', messages: [{ id: 1, role: 'assistant', mode: 'local', content: '之前账号的课程' }] }));
  await pending;
  assert.equal(vm.runInContext('chat.messages.length', env.context), 0);
  assert.equal(env.nodes.get('chat-messages').textContent, '');
  assert.equal(env.nodes.get('chat-launcher').hidden, true);
});

test('member home opens first and navigation reveals schedule and membership', async () => {
  const env = environment(async path => jsonResponse(200,
    path === '/api/me' ? { id: 1, name: 'Yu', membership: 'basic' } : []));
  env.nodes.get('auth-form').reset = () => {};
  env.nodes.set('empty-new', { addEventListener() {} });
  vm.runInContext(app, env.context); await flush();
  assert.equal(env.nodes.get('home-content').hidden, false);
  assert.equal(env.nodes.get('schedule-content').hidden, true);
  assert.equal(env.nodes.get('member-card-owner').textContent, 'Yu');
  assert.equal(env.nodes.get('member-card-tier').textContent, '普通会员');
  vm.runInContext("setView('all')", env.context);
  assert.equal(env.nodes.get('home-content').hidden, true);
  assert.equal(env.nodes.get('schedule-content').hidden, false);
  assert.equal(env.nodes.get('new-entry').hidden, false);
  vm.runInContext("setView('membership')", env.context);
  assert.equal(env.nodes.get('membership-content').hidden, false);
  assert.equal(env.nodes.get('schedule-content').hidden, true);
  vm.runInContext("setView('home')", env.context);
  env.nodes.get('member-card-front').handlers.click();
  assert.equal(env.nodes.get('home-content').hidden, false);
  assert.equal(env.nodes.get('member-card-front').inert, true);
  assert.equal(env.nodes.get('member-card-back').inert, false);
  assert.equal(env.nodes.has('member-card-return'), false);
  const back = env.nodes.get('member-card-back');
  back.handlers.click({ target: { closest: () => ({ tagName: 'BUTTON' }) } });
  assert.equal(back.inert, false); // The membership details button keeps its own action.
  back.handlers.click({ target: { closest: () => null } });
  assert.equal(back.inert, true);
  assert.equal(env.nodes.get('member-card-front').inert, false);
  env.nodes.get('member-card-front').handlers.click();
  let prevented = false;
  back.handlers.keydown({ target: back, currentTarget: back, key: 'Enter',
    preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(back.inert, true);
});
