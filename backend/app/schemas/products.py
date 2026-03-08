from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProductVariantCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=100)
    price_cents: int = Field(ge=0)
    attributes_json: dict[str, object] = Field(default_factory=dict)
    stock: int = Field(default=0)


class ProductImageCreate(BaseModel):
    object_key: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1, max_length=500)
    position: int = Field(default=0)


class ProductCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    active: bool = True
    variants: list[ProductVariantCreate] = Field(default_factory=list)
    images: list[ProductImageCreate] = Field(default_factory=list)


class ProductVariantRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    sku: str
    price_cents: int
    attributes_json: dict[str, object]
    stock: int


class ProductImageRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: int
    product_id: UUID
    object_key: str
    url: str
    position: int


class ProductRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    active: bool
    created_at: datetime
    variants: list[ProductVariantRead]
    images: list[ProductImageRead]
