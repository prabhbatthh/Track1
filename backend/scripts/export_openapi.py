"""Exports the FastAPI app's live OpenAPI schema to backend-api-swagger.yaml at the
repo root — the same document FastAPI serves at /openapi.json, just written to a file
so it can be committed, imported into Postman, or handed off without a running server.

Run from backend/: `uv run python scripts/export_openapi.py`
Re-run any time routes/schemas change — this is a snapshot, not auto-kept-in-sync.
"""

from pathlib import Path

import yaml

from app.main import app

if __name__ == "__main__":
    out_path = Path(__file__).resolve().parent.parent.parent / "backend-api-swagger.yaml"
    out_path.write_text(yaml.dump(app.openapi(), sort_keys=False), encoding="utf-8", newline="\n")
    print(f"Wrote {out_path}")
