from fastapi import APIRouter, Depends, Query

from app.auth import UNAUTHORIZED_RESPONSES, get_current_host
from app.models import HostRecord
from generated.models import AvailabilityListResponse

router = APIRouter(prefix="/hosts/me/availabilities", tags=["Availabilities"])


@router.get(
    "",
    response_model=AvailabilityListResponse,
    responses=UNAUTHORIZED_RESPONSES,
)
def list_host_availabilities(
    _host: HostRecord = Depends(get_current_host),
    limit: int = Query(default=50, ge=1),
    offset: int = Query(default=0, ge=0),
) -> AvailabilityListResponse:
    return AvailabilityListResponse(items=[], total=0)
