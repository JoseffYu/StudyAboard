import http.client
import io
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import server


class MemoryConnection:
    """Exercise real HTTP parsing/handlers without opening a listening socket."""
    def __init__(self, request):
        self.request = request
        self.output = bytearray()

    def makefile(self, mode, *args):
        return io.BytesIO(self.request)

    def sendall(self, data):
        self.output.extend(data)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.DB = Path(cls.temp.name) / 'test.sqlite3'
        server.initialize()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def request(self, method, path, data=None, cookie='', extra=None):
        body = json.dumps(data).encode() if data is not None else b''
        headers = {'Host': '127.0.0.1:8080', 'Connection': 'close', 'Content-Length': str(len(body)), 'Content-Type': 'application/json', 'X-Journal-Request': '1', 'Cookie': cookie}
        headers.update(extra or {})
        request = f'{method} {path} HTTP/1.1\r\n' + ''.join(f'{key}: {value}\r\n' for key, value in headers.items()) + '\r\n'
        connection = MemoryConnection(request.encode() + body)
        server.Handler(connection, ('127.0.0.1', 12345), None)
        response = http.client.HTTPResponse(MemoryConnection(bytes(connection.output)))
        response.begin()
        body = response.read()
        result = json.loads(body) if 'application/json' in response.getheader('Content-Type', '') else body
        output = response.status, result, response.getheader('Set-Cookie', '')
        response.close()
        return output

    def register(self, email):
        status, user, cookie = self.request('POST', '/api/register', {'name': '小林', 'email': email, 'password': 'test-pass123', 'membership': 'pro'})
        self.assertEqual(status, 200)
        self.assertEqual(user['membership'], 'basic')
        self.assertIn('HttpOnly', cookie)
        return cookie.split(';')[0]

    def test_account_lifecycle(self):
        cookie = self.register('account@example.com')
        self.assertEqual(self.request('GET', '/api/me', cookie=cookie)[0], 200)
        self.assertEqual(self.request('POST', '/api/register', {'name': '重复', 'email': 'account@example.com', 'password': 'test-pass123'})[0], 409)
        self.assertEqual(self.request('POST', '/api/login', {'email': 'account@example.com', 'password': 'wrong-pass'})[0], 401)
        status, user, login_cookie = self.request('POST', '/api/login', {'email': 'ACCOUNT@example.com', 'password': 'test-pass123'})
        self.assertEqual(status, 200)
        self.assertNotIn('password', user)
        with server.connect() as db:
            row = db.execute('SELECT * FROM users WHERE email=?', ('account@example.com',)).fetchone()
            self.assertNotEqual(row['password'], 'test-pass123')
        self.assertEqual(self.request('POST', '/api/logout', {}, cookie)[0], 200)
        self.assertEqual(self.request('GET', '/api/me', cookie=cookie)[0], 401)
        self.assertEqual(self.request('GET', '/api/me', cookie=login_cookie.split(';')[0])[0], 200)

    def test_crud_optional_time_and_isolation(self):
        owner = self.register('owner@example.com')
        other = self.register('other@example.com')
        data = {'kind': 'course', 'title': '统计学', 'date': '', 'start': '', 'end': '', 'notes': '时间稍后补充'}
        self.assertEqual(self.request('POST', '/api/entries', data)[0], 401)
        status, entry, _ = self.request('POST', '/api/entries', data, owner)
        self.assertEqual(status, 200)
        self.assertEqual(entry['start'], '')
        eid = entry['id']
        self.assertEqual(self.request('GET', '/api/entries', cookie=other)[1], [])
        self.assertEqual(self.request('PUT', f'/api/entries/{eid}', data, other)[0], 404)
        self.assertEqual(self.request('DELETE', f'/api/entries/{eid}', cookie=other)[0], 404)
        updated = {**data, 'kind': 'exam', 'date': '2026-12-01', 'start': '09:00', 'end': '11:00', 'done': True}
        self.assertEqual(self.request('PUT', f'/api/entries/{eid}', updated, owner)[0], 200)
        self.assertEqual(self.request('GET', '/api/entries', cookie=owner)[1][0]['done'], 1)
        # Reinitializing the app must not erase stored records.
        server.initialize()
        self.assertEqual(len(self.request('GET', '/api/entries', cookie=owner)[1]), 1)
        self.assertEqual(self.request('DELETE', f'/api/entries/{eid}', cookie=owner)[0], 200)
        self.assertEqual(self.request('GET', '/api/entries', cookie=owner)[1], [])

    def test_validation_and_csrf(self):
        cookie = self.register('validation@example.com')
        valid = {'kind': 'daily', 'title': '散步'}
        for invalid in ({'title': ''}, {'kind': 'invalid'}, {'date': '2026-02-30'}, {'start': '25:00'}, {'start': '12:00', 'end': '11:00'}, {'notes': 'x' * 4001}):
            self.assertEqual(self.request('POST', '/api/entries', {**valid, **invalid}, cookie)[0], 400)
        self.assertEqual(self.request('POST', '/api/entries', valid, cookie, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('POST', '/api/entries', valid, cookie, {'X-Journal-Request': ''})[0], 403)
        self.assertEqual(self.request('POST', '/api/entries', {**valid, 'end': '16:00'}, cookie)[0], 200)
        status, assignment, _ = self.request('POST', '/api/entries', {'kind': 'assignment', 'title': '研究报告', 'date': '2027-01-20'}, cookie)
        self.assertEqual(status, 200)
        self.assertEqual(assignment['kind'], 'assignment')
        self.assertEqual(self.request('GET', '/../../server.py')[0], 404)

    def test_static_page(self):
        status, body, _ = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn('留学手记'.encode(), body)
        for path in ('/shared/aurora.css', '/shared/base.css', '/shared/guidance.css', '/desktop/style.css', '/mobile/style.css', '/mobile/preview.css', '/shared/startup.js', '/shared/app.js', '/favicon.svg', '/desktop/', '/mobile/', '/mobile-preview'):
            self.assertEqual(self.request('GET', path)[0], 200)
        desktop = self.request('GET', '/desktop/')[1].decode()
        mobile = self.request('GET', '/mobile/')[1].decode()
        self.assertIn('data-client="desktop"', desktop)
        self.assertIn('data-client="mobile"', mobile)
        self.assertIn('/desktop/style.css', desktop)
        self.assertNotIn('/mobile/style.css', desktop)
        self.assertIn('/mobile/style.css', mobile)
        self.assertNotIn('/desktop/style.css', mobile)
        self.assertIn('src="/mobile/"', self.request('GET', '/mobile-preview')[1].decode())

    def send_chat(self, cookie, message, turn='chat-turn-00000001', share=False):
        return self.request('POST', '/api/chat', {'message': message, 'turn_id': turn, 'today': '2026-10-09', 'share_schedule': share}, cookie)

    @patch('chatbot.mode', return_value='local')
    def test_chat_queries_followup_and_persistence(self, _mode):
        owner = self.register('chat-owner@example.com')
        other = self.register('chat-other@example.com')
        for title, day, kind in [('今日课程', '2026-10-09', 'course'), ('明日课程', '2026-10-10', 'course'), ('明日考试', '2026-10-10', 'exam'), ('待定课程', '', 'course')]:
            self.request('POST', '/api/entries', {'title': title, 'date': day, 'kind': kind}, owner)
        self.request('POST', '/api/entries', {'title': '另一个人的秘密课程', 'date': '2026-10-09', 'kind': 'course'}, other)
        self.assertEqual(self.request('GET', '/api/chat')[0], 401)
        self.assertEqual(self.send_chat('', '你好')[0], 401)
        status, response, _ = self.send_chat(owner, '今天有哪些课程？')
        self.assertEqual(status, 200)
        answer = response['messages'][1]['content']
        self.assertIn('今日课程', answer)
        self.assertIn('开始时间待定', answer)
        self.assertNotIn('秘密', answer)
        status, response, _ = self.send_chat(owner, '那明天呢？', 'chat-turn-00000002')
        self.assertEqual(status, 200)
        self.assertIn('明日课程', response['messages'][1]['content'])
        self.assertNotIn('明日考试', response['messages'][1]['content'])
        server.initialize()
        history = self.request('GET', '/api/chat', cookie=owner)[1]['messages']
        self.assertEqual(len(history), 4)
        # Retrying a completed turn returns the same pair, never duplicating history.
        self.send_chat(owner, '今天有哪些课程？')
        self.assertEqual(len(self.request('GET', '/api/chat', cookie=owner)[1]['messages']), 4)
        self.assertEqual(self.request('GET', '/api/chat', cookie=other)[1]['messages'], [])
        self.send_chat(other, '你好', 'chat-other-0000001')
        self.assertEqual(self.request('DELETE', '/api/chat', cookie=owner)[0], 200)
        self.assertEqual(self.request('GET', '/api/chat', cookie=owner)[1]['messages'], [])
        self.assertEqual(len(self.request('GET', '/api/chat', cookie=other)[1]['messages']), 2)
        self.assertEqual(len(self.request('GET', '/api/entries', cookie=owner)[1]), 4)

    def test_chat_validation_and_ai_failure(self):
        owner = self.register('chat-validation@example.com')
        base = {'message': '你好', 'turn_id': 'valid-turn-000001', 'today': '2026-10-09'}
        for invalid in ({'message': ''}, {'message': 'x' * 2001}, {'message': []}, {'turn_id': ''}, {'today': '2026-02-30'}, {'share_schedule': 'true'}):
            self.assertEqual(self.request('POST', '/api/chat', {**base, **invalid}, owner)[0], 400)
        with patch('chatbot.mode', return_value='ai'), patch('chatbot.ai_reply', side_effect=server.chatbot.ChatUnavailable('AI 服务连接失败')):
            self.assertEqual(self.send_chat(owner, '你好')[0], 502)
        self.assertEqual(self.request('GET', '/api/chat', cookie=owner)[1]['messages'], [])

    def test_chat_ai_respects_schedule_consent_and_history_mode(self):
        owner = self.register('chat-consent@example.com')
        self.request('POST', '/api/entries', {'title': '私人课程', 'kind': 'course'}, owner)
        with patch('chatbot.mode', return_value='local'):
            self.send_chat(owner, '有哪些课程？')
        with patch('chatbot.mode', return_value='ai'), patch('chatbot.ai_reply', return_value='AI 回复') as model:
            self.send_chat(owner, '你好', 'consent-turn-00001')
            self.assertEqual(model.call_args.args[1], [])  # Local history stays local.
            self.assertEqual(model.call_args.args[2], [])  # No schedule without consent.
            self.send_chat(owner, '今天有哪些课程？', 'consent-turn-00002', share=True)
            self.assertEqual(model.call_args.args[2][0]['title'], '私人课程')
            self.send_chat(owner, '继续聊聊', 'consent-turn-00003')
            self.assertEqual(model.call_args.args[2], [])
            self.assertEqual(len(model.call_args.args[1]), 2)  # Only previous non-shared AI turn.


if __name__ == '__main__':
    unittest.main()
