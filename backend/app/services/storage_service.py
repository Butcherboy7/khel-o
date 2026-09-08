import uuid
from typing import Any

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings
from app.core.exceptions import BadRequestException
from app.core.logging import logger

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

_client: Any = None


def _get_client() -> Any:
    global _client
    if _client is None:
        if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
            raise BadRequestException("Photo storage is not configured")
        _client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            endpoint_url=f"https://s3.{settings.AWS_REGION}.amazonaws.com",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _client


def build_public_url(key: str) -> str:
    return f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"


def key_from_url(url: str) -> str | None:
    """Return the S3 object key if this URL points at our bucket, else None."""
    prefix = f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/"
    if url.startswith(prefix):
        return url[len(prefix):]
    return None


def create_presigned_upload(cafe_id: uuid.UUID, content_type: str) -> dict[str, str]:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise BadRequestException("Only JPEG, PNG, or WebP images are allowed")

    ext = ALLOWED_CONTENT_TYPES[content_type]
    key = f"cafes/{cafe_id}/{uuid.uuid4().hex}.{ext}"

    client = _get_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.AWS_S3_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=300,
    )
    return {
        "uploadUrl": upload_url,
        "publicUrl": build_public_url(key),
        "key": key,
    }


def delete_object(key: str) -> None:
    """Delete one object. Never raises — callers have already committed the
    database change, and a failed cleanup must not fail the user's request.

    It does log, though. Callers remove the DB reference *before* calling this,
    so a silently swallowed failure leaves an object in the bucket that nothing
    will ever point at again — invisible, unbilled-for-nothing storage that
    only a bucket audit could find. `scripts/reconcile_s3_orphans.py` sweeps up
    whatever this misses.
    """
    client = _get_client()
    try:
        client.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    except ClientError as exc:
        logger.error(f"s3_delete_failed key={key} error={exc} (orphaned object left in bucket)")


def iter_object_keys(prefix: str = "cafes/"):
    """Yield (key, last_modified) for every object under `prefix`.

    Paginated: a bucket with more than 1000 objects would otherwise silently
    report only the first page, and an orphan sweep that sees a partial bucket
    is worse than none — it would look clean while orphans accumulated.
    """
    client = _get_client()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.AWS_S3_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            yield obj["Key"], obj["LastModified"]


def delete_objects(keys: list[str]) -> int:
    """Batch-delete keys, 1000 at a time (the S3 API's per-call maximum).
    Returns the number actually deleted."""
    if not keys:
        return 0
    client = _get_client()
    deleted = 0
    for start in range(0, len(keys), 1000):
        batch = keys[start:start + 1000]
        response = client.delete_objects(
            Bucket=settings.AWS_S3_BUCKET,
            Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
        )
        deleted += len(batch) - len(response.get("Errors", []))
        for err in response.get("Errors", []):
            logger.error(f"s3_batch_delete_failed key={err.get('Key')} code={err.get('Code')}")
    return deleted
