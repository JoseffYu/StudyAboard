"""macOS application entry point; UI and backend share one process lifetime."""
import logging
from pathlib import Path
import sys
import threading

if not getattr(sys, 'frozen', False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class AppHandler(server.Handler):
    def log_message(self, format, *args):
        logging.info(format, *args)


def run_app(webview, data_dir):
    data_dir.mkdir(parents=True, exist_ok=True)
    server.DB = data_dir / 'journal.sqlite3'
    server.initialize()
    httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), AppHandler)
    worker = threading.Thread(target=httpd.serve_forever, daemon=True)
    worker.start()
    try:
        webview.create_window(
            '留学手记 · StudyAboard',
            f'http://127.0.0.1:{httpd.server_port}/desktop/',
            width=1280, height=860, min_size=(960, 640),
            text_select=True,
        )
        webview.start(private_mode=False, storage_path=str(data_dir / 'webview'))
    finally:
        httpd.shutdown()
        httpd.server_close()
        worker.join(timeout=5)


def main():
    if sys.platform != 'darwin':
        raise SystemExit('桌面客户端请在 macOS 上运行。')
    data_dir = Path.home() / 'Library' / 'Application Support' / 'StudyAboard'
    data_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=data_dir / 'app.log', level=logging.INFO,
                        format='%(asctime)s %(levelname)s %(message)s')
    # Windowed bundles have no terminal streams. Keep library diagnostics safe.
    with (data_dir / 'runtime.log').open('a', buffering=1) as log:
        original_streams = sys.stdout, sys.stderr
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log
        try:
            import webview
            run_app(webview, data_dir)
        except Exception:
            logging.exception('Application startup failed')
            # Native alert also works before the main webview is available.
            import subprocess
            subprocess.run([
                'osascript', '-e',
                'display alert "留学手记启动失败" message '
                '"请查看 ~/Library/Application Support/StudyAboard/app.log"',
            ], check=False)
            raise
        finally:
            sys.stdout, sys.stderr = original_streams


if __name__ == '__main__':
    main()
