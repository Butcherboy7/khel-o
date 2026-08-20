import uuid
from typing import Any

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings
from app.core.exceptions import BadRequestException

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
    client = _get_client()
    try:
        client.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    except ClientError:
        pass
