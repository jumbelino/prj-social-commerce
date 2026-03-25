# pyright: reportMissingImports=false, reportImplicitRelativeImport=false

"""Regression tests for MinioStorage bucket policy enforcement.

These tests verify that upload_file() enforces bucket policy in both cases:
- bucket missing (new bucket) -> make_bucket, set_bucket_policy, put_object
- bucket already exists -> set_bucket_policy (ensures policy stays public), put_object

The bug: if set_bucket_policy is only called inside the `if not bucket_exists` block,
the policy won't be applied when the bucket already exists.
"""

from collections.abc import Iterator
from io import BytesIO

import pytest

from app.integrations.minio_storage import MinioStorage


class FakeMinioClient:
    """Minimal MinIO client stub that records method calls in order."""

    def __init__(self, bucket_exists: bool = True) -> None:
        self._bucket_exists = bucket_exists
        self.calls: list[str] = []

    def bucket_exists(self, bucket: str) -> bool:
        self.calls.append("bucket_exists")
        return self._bucket_exists

    def make_bucket(self, bucket: str) -> None:
        self.calls.append("make_bucket")

    def set_bucket_policy(self, bucket: str, policy: str) -> None:
        self.calls.append("set_bucket_policy")

    def put_object(
        self,
        *,
        bucket_name: str,
        object_name: str,
        data: object,
        length: int,
        part_size: int,
        content_type: str,
    ) -> None:
        self.calls.append("put_object")


@pytest.fixture
def fake_client_new_bucket() -> Iterator[FakeMinioClient]:
    """Client where bucket does not exist (simulates first upload)."""
    yield FakeMinioClient(bucket_exists=False)


@pytest.fixture
def fake_client_existing_bucket() -> Iterator[FakeMinioClient]:
    """Client where bucket already exists (simulates subsequent uploads)."""
    yield FakeMinioClient(bucket_exists=True)


@pytest.fixture
def storage() -> MinioStorage:
    """MinioStorage with deterministic config for unit testing."""
    client = FakeMinioClient(bucket_exists=True)
    return MinioStorage(
        client=client,
        bucket="test-bucket",
        public_base_url="http://localhost:9000/test-bucket",
    )


class TestUploadFileNewBucket:
    """Scenario: bucket does not exist yet."""

    def test_make_bucket_is_called(self, fake_client_new_bucket: FakeMinioClient) -> None:
        storage = MinioStorage(
            client=fake_client_new_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert "make_bucket" in fake_client_new_bucket.calls

    def test_set_bucket_policy_is_called(self, fake_client_new_bucket: FakeMinioClient) -> None:
        storage = MinioStorage(
            client=fake_client_new_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert "set_bucket_policy" in fake_client_new_bucket.calls

    def test_put_object_is_called(self, fake_client_new_bucket: FakeMinioClient) -> None:
        storage = MinioStorage(
            client=fake_client_new_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert "put_object" in fake_client_new_bucket.calls

    def test_call_order(self, fake_client_new_bucket: FakeMinioClient) -> None:
        """Verify make_bucket -> set_bucket_policy -> put_object for new bucket."""
        storage = MinioStorage(
            client=fake_client_new_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert fake_client_new_bucket.calls == [
            "bucket_exists",
            "make_bucket",
            "set_bucket_policy",
            "put_object",
        ]


class TestUploadFileExistingBucket:
    """Scenario: bucket already exists (regression tests).

    These tests ensure the bug is NOT reintroduced: set_bucket_policy must be
    called even when the bucket already exists, to guarantee the policy is in place.
    """

    def test_make_bucket_is_not_called(self, fake_client_existing_bucket: FakeMinioClient) -> None:
        storage = MinioStorage(
            client=fake_client_existing_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert "make_bucket" not in fake_client_existing_bucket.calls

    def test_set_bucket_policy_is_still_called(self, fake_client_existing_bucket: FakeMinioClient) -> None:
        """Regression check: policy must be set even for existing bucket.

        The original bug only called set_bucket_policy inside the `if not bucket_exists`
        block. This test ensures the policy is applied on every upload to guarantee
        the bucket remains publicly readable.
        """
        storage = MinioStorage(
            client=fake_client_existing_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert "set_bucket_policy" in fake_client_existing_bucket.calls

    def test_put_object_is_called(self, fake_client_existing_bucket: FakeMinioClient) -> None:
        storage = MinioStorage(
            client=fake_client_existing_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert "put_object" in fake_client_existing_bucket.calls

    def test_call_order_existing_bucket(self, fake_client_existing_bucket: FakeMinioClient) -> None:
        """Verify bucket_exists -> set_bucket_policy -> put_object (no make_bucket)."""
        storage = MinioStorage(
            client=fake_client_existing_bucket,
            bucket="test-bucket",
            public_base_url="http://localhost:9000/test-bucket",
        )
        storage.upload_file(
            object_key="products/test.jpg",
            file_obj=BytesIO(b"test data"),
            content_type="image/jpeg",
        )
        assert fake_client_existing_bucket.calls == [
            "bucket_exists",
            "set_bucket_policy",
            "put_object",
        ]


class TestBuildUrl:
    """Unit tests for build_url() contract."""

    def test_build_url_returns_public_base_url_with_object_key(self, storage: MinioStorage) -> None:
        """build_url must return exactly <public_base_url>/<object_key>."""
        result = storage.build_url("products/test.jpg")
        assert result == "http://localhost:9000/test-bucket/products/test.jpg"

    def test_build_url_with_nested_path(self, storage: MinioStorage) -> None:
        result = storage.build_url("products/2024/03/image.png")
        assert result == "http://localhost:9000/test-bucket/products/2024/03/image.png"

    def test_build_url_with_special_characters(self, storage: MinioStorage) -> None:
        result = storage.build_url("products/test%20file.jpg")
        assert result == "http://localhost:9000/test-bucket/products/test%20file.jpg"

    def test_build_url_preserves_exact_object_key(self, storage: MinioStorage) -> None:
        """Object key must not be modified or double-encoded."""
        object_key = "products/uuid-folder/my-image.JPEG"
        result = storage.build_url(object_key)
        # The URL must contain the exact key, not mangled
        assert result.endswith(f"/{object_key}")
