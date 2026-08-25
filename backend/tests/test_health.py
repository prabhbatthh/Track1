import os

os.environ["APP_ENV"] = "test"

from fastapi.testclient import TestClient

from app.main import create_app


def test_live_health() -> None:
    client = TestClient(create_app())

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_health() -> None:
    client = TestClient(create_app())

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_security_headers_are_set_on_every_response() -> None:
    client = TestClient(create_app())

    response = client.get("/health/live")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    # HSTS is production-only — sending it over plain HTTP in development would pin
    # browsers to https://localhost. This suite runs with APP_ENV=test.
    assert "Strict-Transport-Security" not in response.headers
