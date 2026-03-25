# pyright: reportMissingImports=false

import json
import os
from typing import BinaryIO
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error


def _read_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _normalize_minio_endpoint(endpoint: str) -> tuple[str, bool]:
    value = endpoint.strip()
    if value.startswith("http://") or value.startswith("https://"):
        parsed = urlparse(value)
        if parsed.netloc == "":
            raise RuntimeError("MINIO_ENDPOINT must include host when using http(s) scheme")
        return parsed.netloc, parsed.scheme == "https"
    return value, False


def read_minio_bucket() -> str:
    return _read_required_env("MINIO_BUCKET")


def _read_minio_public_base_url(bucket: str) -> str:
    configured = os.getenv("MINIO_PUBLIC_BASE_URL")
    if configured is not None and configured.strip() != "":
        return configured.rstrip("/")
    return f"http://localhost:9000/{bucket}"


class MinioStorage:
    def __init__(self, client: Minio, bucket: str, public_base_url: str):
        self._client = client
        self._bucket = bucket
        self._public_base_url = public_base_url.rstrip("/")

    def _ensure_bucket_exists(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def _ensure_public_read_policy(self) -> None:
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{self._bucket}/*"],
                }
            ],
        }
        self._client.set_bucket_policy(self._bucket, json.dumps(policy))

    def upload_file(self, *, object_key: str, file_obj: BinaryIO, content_type: str | None) -> None:
        self._ensure_bucket_exists()
        self._ensure_public_read_policy()
        self._client.put_object(
            bucket_name=self._bucket,
            object_name=object_key,
            data=file_obj,
            length=-1,
            part_size=10 * 1024 * 1024,
            content_type=content_type or "application/octet-stream",
        )

    def delete_object(self, object_key: str) -> None:
        try:
            self._client.remove_object(bucket_name=self._bucket, object_name=object_key)
        except S3Error as exc:
            if exc.code not in {"NoSuchKey", "NoSuchObject"}:
                raise

    def build_url(self, object_key: str) -> str:
        return f"{self._public_base_url}/{object_key}"


def get_minio_storage() -> MinioStorage:
    endpoint, secure = _normalize_minio_endpoint(_read_required_env("MINIO_ENDPOINT"))
    access_key = _read_required_env("MINIO_ACCESS_KEY")
    secret_key = _read_required_env("MINIO_SECRET_KEY")
    bucket = read_minio_bucket()
    public_base_url = _read_minio_public_base_url(bucket)

    client = Minio(endpoint=endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
    return MinioStorage(client=client, bucket=bucket, public_base_url=public_base_url)
