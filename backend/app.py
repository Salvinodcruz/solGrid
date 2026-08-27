"""Flask app entrypoint for SolGrid Thermal Sync."""

import os
import sys
from pathlib import Path

from flask import Flask
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.routes import bp


def create_app():
    app = Flask(__name__)
    CORS(app, origins="*")
    app.register_blueprint(bp)
    return app


app = create_app()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

