from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_spa_routes_serve_index_and_static_files(
    settings: Settings,
    tmp_path: Path,
) -> None:
    static_dir = tmp_path / "static"
    assets_dir = static_dir / "assets"
    assets_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text("<html>spa</html>", encoding="utf-8")
    (assets_dir / "app.js").write_text("console.log('ok')", encoding="utf-8")

    app = create_app(settings, static_dir=static_dir)

    with TestClient(app) as client:
        assert client.get("/dashboard").text == "<html>spa</html>"
        assert client.get("/assets/app.js").text == "console.log('ok')"
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/api/missing").status_code == 404
