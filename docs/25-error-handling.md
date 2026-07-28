# Error Handling — KHEL-O

## Overview

Exception hierarchy, error mapping, and standardized error response generation for KHEL-O backend services.

---

## 1. Exception Hierarchy

```python
class KhelOException(Exception):
    """Base exception for all domain errors."""
    def __init__(self, message: str, code: str, status_code: int = 400, details: list = None):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or []

class EntityNotFoundError(KhelOException):
    def __init__(self, entity_name: str, identifier: str):
        super().__init__(
            message=f"{entity_name} with identifier {identifier} was not found.",
            code=f"{entity_name.upper()}_NOT_FOUND",
            status_code=404
        )

class InvalidStateTransitionError(KhelOException):
    def __init__(self, entity: str, current_state: str, requested_state: str):
        super().__init__(
            message=f"Cannot transition {entity} from {current_state} to {requested_state}.",
            code="INVALID_STATE_TRANSITION",
            status_code=400
        )

class HardwareTierFullyBookedError(KhelOException):
    def __init__(self, tier_id: str, time_slot: str):
        super().__init__(
            message=f"Hardware tier {tier_id} has no available capacity for {time_slot}.",
            code="TIER_FULLY_BOOKED",
            status_code=409
        )
```

---

## 2. Global Exception Handler Registration (FastAPI)

```python
from fastapi import Request, FastAPI
from fastapi.responses import JSONResponse

def register_exception_handlers(app: FastAPI):
    @app.exception_handler(KhelOException)
    async def khel_o_exception_handler(request: Request, exc: KhelOException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details
                },
                "meta": {
                    "timestamp": datetime.utcnow().isoformat(),
                    "requestId": request.state.correlation_id
                }
            }
        )
```
