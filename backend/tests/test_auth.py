from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from app.main import create_app
from app.security import create_session_token
from tests.helpers import TEST_EMAIL, TEST_PASSWORD


def test_login_sets_an_http_only_cookie_and_me_returns_the_host(
    client: TestClient,
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )

    assert response.status_code == 200
    host = response.json()
    assert host["email"] == TEST_EMAIL
    assert host["timezone"] == "Europe/Moscow"
    assert "password" not in host

    set_cookie = response.headers["set-cookie"].lower()
    assert "host_session=" in set_cookie
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie
    assert "max-age=604800" in set_cookie
    assert "secure" not in set_cookie

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == host["id"]


def test_login_normalises_email_and_token_expires_in_seven_days(
    client: TestClient, settings
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": f"  {TEST_EMAIL.upper()} ", "password": TEST_PASSWORD},
    )

    assert response.status_code == 200
    token = client.cookies.get(settings.cookie_name)
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=["HS256"],
        options={"require": ["sub", "iat", "exp"]},
    )
    assert payload["sub"] == response.json()["id"]
    assert payload["exp"] - payload["iat"] == 7 * 24 * 60 * 60


def test_login_rejects_wrong_credentials_without_a_cookie(
    client: TestClient,
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": "wrong password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthorized"
    assert "set-cookie" not in response.headers
    assert client.get("/auth/me").status_code == 401

    unknown = client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": TEST_PASSWORD},
    )
    assert unknown.status_code == 401


def test_me_rejects_missing_invalid_and_expired_tokens(
    client: TestClient, settings
) -> None:
    assert client.get("/auth/me").status_code == 401

    invalid = client.get(
        "/auth/me", headers={"Cookie": f"{settings.cookie_name}=not-a-jwt"}
    )
    assert invalid.status_code == 401

    login = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    host_id = login.json()["id"]
    expired_token = create_session_token(
        host_id,
        settings,
        now=datetime.now(UTC) - timedelta(days=8),
    )
    expired = client.get(
        "/auth/me",
        headers={"Cookie": f"{settings.cookie_name}={expired_token}"},
    )
    assert expired.status_code == 401


def test_logout_clears_the_cookie(client: TestClient, settings) -> None:
    client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert client.get("/auth/me").status_code == 200

    response = client.post("/auth/logout")

    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"].lower()
    assert "host_session=" in set_cookie
    assert "max-age=0" in set_cookie
    assert "path=/" in set_cookie
    assert client.get("/auth/me").status_code == 401


def test_production_login_uses_a_secure_cookie(app, settings) -> None:
    production_settings = settings.model_copy(update={"environment": "production"})
    app = create_app(production_settings)

    with TestClient(app) as client:
        response = client.post(
            "/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )

    assert response.status_code == 200
    assert "secure" in response.headers["set-cookie"].lower()


def test_production_app_does_not_expose_dev_cors(settings) -> None:
    production_settings = settings.model_copy(update={"environment": "production"})
    app = create_app(production_settings)

    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert "access-control-allow-origin" not in response.headers


def test_host_availability_endpoint_requires_authentication(
    client: TestClient,
) -> None:
    assert client.get("/hosts/me/availabilities").status_code == 401

    client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    response = client.get("/hosts/me/availabilities")

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


def test_validation_errors_do_not_echo_passwords(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"password": "super-secret-password"},
    )

    assert response.status_code == 422
    assert "super-secret-password" not in response.text
    assert all(
        set(error) <= {"loc", "msg", "type"}
        for error in response.json()["detail"]
    )
