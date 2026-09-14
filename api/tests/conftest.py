from pathlib import Path

import pytest
from fastapi.testclient import TestClient

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
