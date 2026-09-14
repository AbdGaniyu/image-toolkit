from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import ops.remove_bg
from main import app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def fixture_bytes():
    return lambda name: (FIXTURES / name).read_bytes()


@pytest.fixture
def upload(client, fixture_bytes):
    """POST a fixture to an endpoint: upload("/resize", "bands.png", width=100)."""

    def _upload(path: str, name: str, filename: str | None = None, **fields):
        return client.post(
            path,
            files={"file": (filename or name, fixture_bytes(name))},
            data={key: str(value) for key, value in fields.items()},
        )

    return _upload


class FakeU2net:
    """Stands in for the u2net session: the left half of any image is 'foreground'."""

    def predict(self, img, *args, **kwargs):
        mask = Image.new("L", img.size, 0)
        mask.paste(255, (0, 0, img.width // 2, img.height))
        return [mask]


@pytest.fixture
def fake_u2net(monkeypatch):
    monkeypatch.setattr(ops.remove_bg, "_session", FakeU2net)
