import logging
import sys
import structlog
from app.config import settings

def setup_logging():
    log_level = logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if settings.ENVIRONMENT == "development":
        processor = structlog.dev.ConsoleRenderer(colors=True)
    else:
        processor = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=shared_processors + [processor],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

logger = structlog.get_logger()
