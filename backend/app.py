"""Flask app entrypoint for SolGrid Thermal Sync."""

import base64
import os
import sys
from pathlib import Path

from flask import Flask, send_from_directory
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.routes import bp


def create_app():
    static_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', 'frontend')
    )
    app = Flask(
        __name__,
        static_folder=static_dir,
        static_url_path=''
    )
    CORS(app, origins="*")

    @app.route('/')
    def serve_index():
        return send_from_directory(
            app.static_folder, 'index.html'
        )

    @app.route('/config.js')
    def serve_config():
        local_cfg = os.path.join(app.static_folder, 'config.js')
        if os.path.exists(local_cfg):
            return send_from_directory(app.static_folder, 'config.js')
        token = os.environ.get('MAPBOX_TOKEN')
        if not token:
            token = base64.b64decode(
                b'cGsuZXlKMUlqb2ljMkZzZG1sdWJ5MWtZM0oxZWlJc0ltRWlPaUpqYlhObWVXSnRjVEV3T0RWeU1ucHhiM05uY1RWcGFXODRJbjAuSTFhNDktdFY5ak9QRUVlYUdJUVhnQQ=='
            ).decode('utf-8')
        js_content = f'window.CONFIG = {{ MAPBOX_TOKEN: "{token}" }};\nconst MAPBOX_TOKEN = "{token}";\n'
        return js_content, 200, {'Content-Type': 'application/javascript'}

    @app.route('/<path:path>')
    def serve_static(path):
        file_path = os.path.join(
            app.static_folder, path
        )
        if os.path.exists(file_path):
            return send_from_directory(
                app.static_folder, path
            )
        return send_from_directory(
            app.static_folder, 'index.html'
        )

    app.register_blueprint(bp)
    return app


app = create_app()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
