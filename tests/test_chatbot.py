import io
import json
import unittest
from datetime import date
from unittest.mock import patch

import chatbot


class ChatbotTests(unittest.TestCase):
    def test_pending_exams_and_completed_records(self):
        entries = [dict(id=index, kind='exam', title=title, date=day, start='', end='', location='', done=done) for index, (title, day, done) in enumerate([('待定考试', '', 0), ('过期考试', '2026-10-01', 0), ('已完成考试', '', 1)])]
        answer = chatbot.local_reply('接下来有哪些考试？', [], entries, date(2026, 10, 9), 'basic')
        self.assertIn('待定考试', answer)
        self.assertNotIn('过期考试', answer)
        self.assertNotIn('已完成考试', answer)
        self.assertIn('关键词', chatbot.local_reply('你是谁？', [], [], date.today(), 'basic'))

    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-secret', 'OPENAI_MODEL': 'test-model'})
    def test_api_adapter_uses_all_output_messages_and_server_credentials(self):
        response = {'output': [{'type': 'reasoning'}, {'type': 'message', 'content': [{'type': 'output_text', 'text': '第一段'}]}, {'type': 'message', 'content': [{'type': 'output_text', 'text': '第二段'}]}]}
        with patch('chatbot.urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as transport:
            result = chatbot.ai_reply('你好', [], [], date(2026, 10, 9), False)
        self.assertEqual(result, '第一段\n第二段')
        request = transport.call_args.args[0]
        payload = json.loads(request.data)
        self.assertFalse(payload['store'])
        self.assertEqual(payload['model'], 'test-model')
        self.assertEqual(payload['input'][-1]['content'], '你好')
        self.assertNotIn('test-secret', request.data.decode())
        self.assertEqual(transport.call_args.kwargs['timeout'], 30)

    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-secret', 'OPENAI_MODEL': 'test-model'})
    def test_api_bad_output_and_timeout_are_recoverable(self):
        for response in ({'output': []}, {'output': 'invalid'}, []):
            with patch('chatbot.urlopen', return_value=io.BytesIO(json.dumps(response).encode())):
                with self.assertRaises(chatbot.ChatUnavailable):
                    chatbot.ai_reply('你好', [], [], date.today(), False)
        with patch('chatbot.urlopen', side_effect=TimeoutError):
            with self.assertRaises(chatbot.ChatUnavailable):
                chatbot.ai_reply('你好', [], [], date.today(), False)

    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-secret', 'OPENAI_MODEL': 'test-model'})
    def test_api_schedule_summary_excludes_notes(self):
        entry = dict(kind='daily', title='散步', date='', start='', end='', location='', done=0, notes='不要发送这段正文')
        response = {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': '好的'}]}]}
        with patch('chatbot.urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as transport:
            chatbot.ai_reply('我的安排', [], [entry], date.today(), True)
        payload = json.loads(transport.call_args.args[0].data)
        self.assertIn('散步', payload['input'][0]['content'])
        self.assertNotIn('不要发送', payload['input'][0]['content'])


if __name__ == '__main__':
    unittest.main()
