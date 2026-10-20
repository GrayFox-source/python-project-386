from typing import NoReturn

from fastapi import HTTPException


def domain_error(status_code: int, code: str, message: str) -> NoReturn:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def validation_error(
    loc: list[str | int],
    message: str,
    *,
    code: str | None = None,
) -> NoReturn:
    issue: dict[str, object] = {
        "loc": ["body", *loc],
        "msg": message,
        "type": "value_error",
    }
    if code is not None:
        issue["code"] = code
    raise HTTPException(status_code=422, detail=[issue])
