from collections.abc import Mapping
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

checkout_router = APIRouter(tags=["checkout"])


def _read_checkout_result_redirect_base_url() -> str:
    configured = os.getenv("CHECKOUT_RESULT_REDIRECT_BASE_URL")
    if configured is not None and configured.strip() != "":
        return configured.strip()

    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").strip()
    first_origin = frontend_origin.split(",", 1)[0].strip()
    if first_origin == "":
        first_origin = "http://localhost:3000"
    return f"{first_origin.rstrip('/')}/checkout/result"


def _append_query_params(url: str, params: Mapping[str, str]) -> str:
    parsed = urlsplit(url)
    query_items = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_items.update(params)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query_items), parsed.fragment))


@checkout_router.get("/checkout/result")
async def checkout_result_redirect(request: Request) -> RedirectResponse:
    target_url = _read_checkout_result_redirect_base_url()
    query_params = {key: value for key, value in request.query_params.multi_items()}
    redirect_url = _append_query_params(target_url, query_params)
    return RedirectResponse(url=redirect_url, status_code=307)
