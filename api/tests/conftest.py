from pathlib import Path

import numpy as np
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
    """Stands in for the onnxruntime session: the left half of any image is 'foreground'."""

    def __init__(self):
        self.seen = []  # shapes of the tensors the model was given

    def run(self, output_names, feeds):
        (tensor,) = feeds.values()
        self.seen.append(tensor.shape)
        pred = np.zeros((1, 1, *tensor.shape[2:]), np.float32)
        pred[..., : tensor.shape[3] // 2] = 1
        return [pred]


@pytest.fixture
def fake_u2net(monkeypatch):
    fake = FakeU2net()
    monkeypatch.setattr(ops.remove_bg, "SESSION", fake)
    return fake
