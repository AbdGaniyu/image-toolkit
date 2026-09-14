"""The error shape every endpoint uses.

Errors are JSON: {"code": "file_too_large", "message": "..."}. `code` is stable
(the web app switches on it); `message` is written to be shown to users.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

# Codes for errors Starlette raises itself (unknown route, wrong method).
_STATUS_CODES = {404: "not_found", 405: "method_not_allowed"}


class ApiError(HTTPException):
    # Subclasses FastAPI's HTTPException so FastAPI passes it through untouched
    # even when raised while parsing the request body (see uploads.BodySizeLimit).
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code, message)
        self.code = code


def error_body(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = getattr(exc, "code", None) or _STATUS_CODES.get(exc.status_code, "http_error")
        return JSONResponse(error_body(code, str(exc.detail)), exc.status_code, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        error = exc.errors()[0]
        field = error["loc"][-1] if error["loc"] else "request"
        if field == "file" and error["type"] == "missing":
            return JSONResponse(error_body("missing_file", "Attach an image in the 'file' field."), 422)
        return JSONResponse(error_body("invalid_params", f"{field}: {error['msg']}"), 422)
