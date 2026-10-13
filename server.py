"""Local-first student journal. Python 3.12+, no third-party dependencies."""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import threading
from contextlib import contextmanager
from datetime import date, time as clock_time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import chatbot

ROOT = Path(__file__).resolve().parent
DB = ROOT / 'data' / 'journal.sqlite3'
CHAT_LOCKS = {}
CHAT_LOCKS_GUARD = threading.Lock()


@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()


class FormError(ValueError):
    pass


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL,
            membership TEXT NOT NULL DEFAULT 'basic' CHECK(membership IN ('basic','plus','pro'))
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            expires REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL DEFAULT '',
            start TEXT NOT NULL DEFAULT '', end TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
            done INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS entries_owner ON entries(user_id);
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user','assistant')),
            content TEXT NOT NULL,
            mode TEXT NOT NULL,
            shared INTEGER NOT NULL DEFAULT 0,
            turn_id TEXT NOT NULL,
            created REAL NOT NULL,
            UNIQUE(user_id, turn_id, role)
        );
        CREATE INDEX IF NOT EXISTS chat_owner ON chat_messages(user_id,id);
        ''')


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 20000:
            raise FormError('请求内容过大或为空')
        data = json.loads(self.rfile.read(size))
        if not isinstance(data, dict):
            raise FormError('请求格式错误')
        return data

    def user(self, db):
        jar = cookies.SimpleCookie()
        try:
            jar.load(self.headers.get('Cookie', ''))
            token = jar['session'].value if 'session' in jar else ''
        except cookies.CookieError:
            return None
        return db.execute('SELECT u.id,u.name,u.email,u.membership FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?', (token, time.time())).fetchone()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/api/'):
            with connect() as db:
                user = self.user(db)
                if not user:
                    return self.reply(401, {'error': '请先登录'})
                if path == '/api/me':
                    return self.reply(200, dict(user))
                if path == '/api/chat':
                    rows = db.execute('SELECT id,role,content,mode,created FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 100', (user['id'],)).fetchall()
                    return self.reply(200, {'mode': chatbot.mode(), 'messages': [dict(row) for row in reversed(rows)]})
                if path == '/api/entries':
                    rows = db.execute('SELECT id,kind,title,date,start,end,location,notes,done FROM entries WHERE user_id=? ORDER BY CASE WHEN date="" THEN 1 ELSE 0 END,date,start,id', (user['id'],)).fetchall()
                    return self.reply(200, [dict(row) for row in rows])
            return self.reply(404, {'error': '页面不存在'})
        pages = {
            '/': 'desktop/index.html',
            '/desktop': 'desktop/index.html',
            '/desktop/': 'desktop/index.html',
            '/mobile': 'mobile/index.html',
            '/mobile/': 'mobile/index.html',
            '/mobile-preview': 'mobile/preview.html',
        }
        files = {route: (filename, 'text/html; charset=utf-8') for route, filename in pages.items()}
        files.update({
            '/shared/app.js': ('shared/app.js', 'text/javascript; charset=utf-8'),
            '/shared/startup.js': ('shared/startup.js', 'text/javascript; charset=utf-8'),
            '/shared/aurora.css': ('shared/aurora.css', 'text/css; charset=utf-8'),
            '/shared/base.css': ('shared/base.css', 'text/css; charset=utf-8'),
            '/shared/favicon.svg': ('shared/favicon.svg', 'image/svg+xml'),
            '/desktop/style.css': ('desktop/style.css', 'text/css; charset=utf-8'),
            '/mobile/style.css': ('mobile/style.css', 'text/css; charset=utf-8'),
            '/mobile/preview.css': ('mobile/preview.css', 'text/css; charset=utf-8'),
            '/favicon.svg': ('shared/favicon.svg', 'image/svg+xml'),
        })
        if path not in files:
            return self.reply(404, {'error': '页面不存在'})
        filename, mime = files[path]
        content = (ROOT / filename).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        ancestors = "'self'" if path in pages and path != '/mobile-preview' else "'none'"
        self.send_header('Content-Security-Policy', f"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; frame-ancestors {ancestors}; base-uri 'self'; form-action 'self'")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        self.mutate()

    def do_PUT(self):
        self.mutate()

    def do_DELETE(self):
        self.mutate()

    def mutate(self):
        # All mutations require a custom same-origin header; cross-site forms cannot send it.
        if self.headers.get('X-Journal-Request') != '1':
            return self.reply(403, {'error': '请求来源无效'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.reply(403, {'error': '请求来源无效'})
        path = urlsplit(self.path).path
        if path == '/api/chat' and self.command in ('POST', 'DELETE'):
            return self.chat()
        try:
            with connect() as db:
                if self.command == 'POST' and path in ('/api/register', '/api/login'):
                    data = self.body()
                    email = str(data.get('email', '')).strip().lower()
                    password = data.get('password', '')
                    if not isinstance(password, str) or not 8 <= len(password) <= 128:
                        raise FormError('密码需为 8–128 个字符')
                    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254:
                        raise FormError('请输入有效的邮箱地址')
                    if path == '/api/register':
                        name = str(data.get('name', '')).strip()
                        if not 1 <= len(name) <= 40:
                            raise FormError('昵称需为 1–40 个字符')
                        salt = secrets.token_hex(16)
                        try:
                            uid = db.execute('INSERT INTO users(email,name,salt,password) VALUES(?,?,?,?)', (email, name, salt, password_hash(password, salt))).lastrowid
                        except sqlite3.IntegrityError:
                            return self.reply(409, {'error': '该邮箱已注册，请直接登录'})
                    else:
                        row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
                        salt = row['salt'] if row else '00' * 16
                        hashed = password_hash(password, salt)
                        if not row or not hmac.compare_digest(row['password'], hashed):
                            return self.reply(401, {'error': '邮箱或密码不正确'})
                        uid = row['id']
                    token = secrets.token_urlsafe(32)
                    db.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
                    db.execute('INSERT INTO sessions VALUES(?,?,?)', (token, uid, time.time() + 7 * 86400))
                    user = db.execute('SELECT id,name,email,membership FROM users WHERE id=?', (uid,)).fetchone()
                    db.commit()
                    secure = '; Secure' if os.environ.get('JOURNAL_SECURE_COOKIE') == '1' else ''
                    return self.reply(200, dict(user), f'session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800{secure}')
                user = self.user(db)
                if not user:
                    return self.reply(401, {'error': '请先登录'})
                if self.command == 'POST' and path == '/api/logout':
                    jar = cookies.SimpleCookie(self.headers.get('Cookie', ''))
                    db.execute('DELETE FROM sessions WHERE token=?', (jar['session'].value,))
                    db.commit()
                    return self.reply(200, {'ok': True}, 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
                match = re.fullmatch(r'/api/entries/(\d+)', path)
                if match and self.command in ('PUT', 'DELETE'):
                    eid = int(match[1])
                    if not db.execute('SELECT id FROM entries WHERE id=? AND user_id=?', (eid, user['id'])).fetchone():
                        return self.reply(404, {'error': '记录不存在'})
                    if self.command == 'DELETE':
                        db.execute('DELETE FROM entries WHERE id=? AND user_id=?', (eid, user['id']))
                        db.commit()
                        return self.reply(200, {'ok': True})
                elif not (path == '/api/entries' and self.command == 'POST'):
                    return self.reply(404, {'error': '页面不存在'})
                data = self.body()
                values = {}
                for key, limit in [('kind', 10), ('title', 120), ('date', 10), ('start', 5), ('end', 5), ('location', 160), ('notes', 4000)]:
                    value = data.get(key, '')
                    if not isinstance(value, str) or len(value) > limit:
                        raise FormError('字段格式有误或内容过长')
                    values[key] = value.strip()
                if values['kind'] not in ('course', 'exam', 'daily') or not values['title']:
                    raise FormError('请选择类型并填写标题')
                if values['date']:
                    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', values['date']):
                        raise FormError('日期格式无效')
                    date.fromisoformat(values['date'])
                for key in ('start', 'end'):
                    if values[key]:
                        if not re.fullmatch(r'\d{2}:\d{2}', values[key]):
                            raise FormError('时间格式应为 HH:MM')
                        clock_time.fromisoformat(values[key])
                if values['start'] and values['end'] and values['end'] <= values['start']:
                    raise FormError('结束时间必须晚于开始时间')
                done = data.get('done', False)
                if done not in (0, 1, False, True):
                    raise FormError('完成状态无效')
                values['done'] = int(done)
                if match:
                    db.execute('UPDATE entries SET kind=:kind,title=:title,date=:date,start=:start,end=:end,location=:location,notes=:notes,done=:done WHERE id=:id AND user_id=:uid', {**values, 'id': eid, 'uid': user['id']})
                else:
                    eid = db.execute('INSERT INTO entries(user_id,kind,title,date,start,end,location,notes,done) VALUES(:uid,:kind,:title,:date,:start,:end,:location,:notes,:done)', {**values, 'uid': user['id']}).lastrowid
                db.commit()
                return self.reply(200, {'id': eid, **values})
        except FormError as error:
            return self.reply(400, {'error': str(error)})
        except (ValueError, TypeError):
            return self.reply(400, {'error': '请检查填写内容：日期、时间及文字长度需有效，结束时间需晚于开始时间。'})
        except sqlite3.Error:
            return self.reply(500, {'error': '暂时无法保存，请稍后重试'})

    def chat(self):
        try:
            with connect() as db:
                user = self.user(db)
                if not user:
                    return self.reply(401, {'error': '请先登录'})
                user = dict(user)
            with CHAT_LOCKS_GUARD:
                lock = CHAT_LOCKS.setdefault(user['id'], threading.Lock())
            if not lock.acquire(blocking=False):
                return self.reply(409, {'error': '上一条消息仍在处理中，请稍后再试。'})
            try:
                if self.command == 'DELETE':
                    with connect() as db:
                        db.execute('DELETE FROM chat_messages WHERE user_id=?', (user['id'],))
                    return self.reply(200, {'ok': True})
                data = self.body()
                message = data.get('message', '')
                if not isinstance(message, str) or not 1 <= len(message.strip()) <= 2000:
                    raise FormError('消息需为 1–2000 个字符')
                message = message.strip()
                turn_id = data.get('turn_id', '')
                if not isinstance(turn_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,80}', turn_id):
                    raise FormError('消息标识无效，请刷新页面重试')
                local_date = data.get('today', '')
                if not isinstance(local_date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', local_date):
                    raise FormError('当前日期无效，请刷新页面重试')
                try:
                    today = date.fromisoformat(local_date)
                except ValueError:
                    raise FormError('当前日期无效，请刷新页面重试') from None
                share = data.get('share_schedule', False)
                if not isinstance(share, bool):
                    raise FormError('日程授权选项无效')
                active_mode = chatbot.mode()
                with connect() as db:
                    previous = db.execute('SELECT id,role,content,mode,created FROM chat_messages WHERE user_id=? AND turn_id=? ORDER BY id', (user['id'], turn_id)).fetchall()
                    if previous:
                        return self.reply(200, {'mode': active_mode, 'messages': [dict(row) for row in previous]})
                    history = [dict(row) for row in db.execute('SELECT role,content,mode,shared FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 100', (user['id'],)).fetchall()][::-1]
                    entries = [dict(row) for row in db.execute('SELECT id,kind,title,date,start,end,location,done FROM entries WHERE user_id=? ORDER BY CASE WHEN date="" THEN 1 ELSE 0 END,date,start,id', (user['id'],)).fetchall()] if active_mode == 'local' or share else []
                if active_mode == 'ai':
                    # Never silently export local-helper history or previously shared schedules after consent is disabled.
                    ai_history = [item for item in history if item['mode'] == 'ai' and bool(item['shared']) == share]
                    answer = chatbot.ai_reply(message, ai_history, entries, today, share)
                else:
                    answer = chatbot.local_reply(message, history, entries, today, user['membership'])
                now = time.time()
                with connect() as db:
                    for role, content in [('user', message), ('assistant', answer)]:
                        db.execute('INSERT INTO chat_messages(user_id,role,content,mode,shared,turn_id,created) VALUES(?,?,?,?,?,?,?)', (user['id'], role, content, active_mode, int(share), turn_id, now))
                    rows = db.execute('SELECT id,role,content,mode,created FROM chat_messages WHERE user_id=? AND turn_id=? ORDER BY id', (user['id'], turn_id)).fetchall()
                return self.reply(200, {'mode': active_mode, 'messages': [dict(row) for row in rows]})
            finally:
                lock.release()
        except FormError as error:
            return self.reply(400, {'error': str(error)})
        except (ValueError, TypeError):
            return self.reply(400, {'error': '消息格式无效，请检查后重试'})
        except chatbot.ChatUnavailable as error:
            return self.reply(502, {'error': str(error)})
        except sqlite3.Error:
            return self.reply(500, {'error': '聊天记录暂时无法保存，请稍后重试'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--db', type=Path, default=DB)
    args = parser.parse_args()
    DB = args.db.resolve()
    initialize()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'留学手记 http://{args.host}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
