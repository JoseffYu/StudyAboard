import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from macos import launcher


class MacAppTests(unittest.TestCase):
    def test_mobile_preview_opens_phone_layout(self):
        with tempfile.TemporaryDirectory() as folder:
            webview = Mock()
            httpd = Mock(server_port=49154)
            with patch.object(launcher.server, 'DB'), \
                    patch.object(launcher.server, 'ThreadingHTTPServer', return_value=httpd):
                launcher.run_app(webview, Path(folder), mobile=True)
            self.assertEqual(webview.create_window.call_args.args[1],
                             'http://127.0.0.1:49154/mobile/')
            self.assertEqual(webview.create_window.call_args.kwargs['width'], 390)
            self.assertEqual(webview.create_window.call_args.kwargs['min_size'], (320, 568))
            httpd.shutdown.assert_called_once()

    def test_native_window_uses_isolated_database_and_stops_backend(self):
        with tempfile.TemporaryDirectory() as folder:
            data_dir = Path(folder) / 'Application Support' / 'StudyAboard'
            webview = Mock()
            httpd = Mock(server_port=49152)
            with patch.object(launcher.server, 'DB'), \
                    patch.object(launcher.server, 'ThreadingHTTPServer', return_value=httpd) as factory:
                launcher.run_app(webview, data_dir)
                self.assertTrue((data_dir / 'journal.sqlite3').is_file())
                with launcher.server.connect() as db:
                    self.assertEqual(db.execute('SELECT count(*) FROM users').fetchone()[0], 0)
                factory.assert_called_once_with(('127.0.0.1', 0), launcher.AppHandler)
                self.assertEqual(webview.create_window.call_args.args[1],
                                 'http://127.0.0.1:49152/desktop/')
                webview.start.assert_called_once_with(
                    private_mode=False, storage_path=str(data_dir / 'webview'))
                httpd.shutdown.assert_called_once()
                httpd.server_close.assert_called_once()

    def test_window_failure_still_closes_backend(self):
        with tempfile.TemporaryDirectory() as folder:
            webview = Mock()
            webview.start.side_effect = RuntimeError('UI failed')
            httpd = Mock(server_port=49153)
            with patch.object(launcher.server, 'DB'), \
                    patch.object(launcher.server, 'ThreadingHTTPServer', return_value=httpd):
                with self.assertRaisesRegex(RuntimeError, 'UI failed'):
                    launcher.run_app(webview, Path(folder))
            httpd.shutdown.assert_called_once()
            httpd.server_close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
