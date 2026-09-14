"""Upload limits: 15 MB per file, and a cap on the whole request body."""

from fastapi import UploadFile
from fastapi.responses import JSONResponse

import codec
from errors import ApiError, error_body

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
# Room for two max-size files (an image plus a logo) and the form fields.
MAX_BODY_BYTES = 2 * MAX_UPLOAD_BYTES + 1024 * 1024

_TOO_LARGE = ("file_too_large", "That file is over 15 MB. Please use a smaller image.")


def read_upload(file: UploadFile) -> codec.Decoded:
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ApiError(413, *_TOO_LARGE)
    if not data:
        raise ApiError(400, "empty_file", "The uploaded file is empty.")
    return codec.decode(data)


class BodySizeLimit:
    """ASGI middleware: reject bodies over max_bytes before they are buffered.

    Checks Content-Length up front, and counts bytes as they arrive for
    requests that don't send one (chunked uploads).
    """

    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        length = dict(scope["headers"]).get(b"content-length", b"")
        if length.isdigit() and int(length) > self.max_bytes:
            await JSONResponse(error_body(*_TOO_LARGE), 413)(scope, receive, send)
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise ApiError(413, *_TOO_LARGE)
            return message

        await self.app(scope, limited_receive, send)
