"""macOS application entry point; UI and backend share one process lifetime."""
import argparse
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


def run_app(webview, data_dir, mobile=False):
    data_dir.mkdir(parents=True, exist_ok=True)
    server.DB = data_dir / 'journal.sqlite3'
    server.initialize()
    httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), AppHandler)
    worker = threading.Thread(target=httpd.serve_forever, daemon=True)
    worker.start()
    try:
        page = 'mobile' if mobile else 'desktop'
        webview.create_window(
            '留学手记 · 手机版预览' if mobile else '留学手记 · StudyAboard',
            f'http://127.0.0.1:{httpd.server_port}/{page}/',
            width=390 if mobile else 1280,
            height=844 if mobile else 860,
            min_size=(320, 568) if mobile else (960, 640),
            text_select=True,
        )
        webview.start(private_mode=False, storage_path=str(data_dir / 'webview'))
    finally:
        httpd.shutdown()
        httpd.server_close()
        worker.join(timeout=5)


def main():
    parser = argparse.ArgumentParser(description='留学手记桌面客户端')
    parser.add_argument('--mobile', action='store_true', help='以手机尺寸打开手机版界面')
    args = parser.parse_args()
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
            run_app(webview, data_dir, mobile=args.mobile)
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
