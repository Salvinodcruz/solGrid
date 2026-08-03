"""Flask app entrypoint for SolGrid Thermal Sync."""

import sys
from pathlib import Path

from flask import Flask
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.routes import bp


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(bp)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)
