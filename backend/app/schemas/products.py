from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProductVariantCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=100)
    price_cents: int = Field(ge=0)
    attributes_json: dict[str, object] = Field(default_factory=dict)
    stock: int = Field(default=0)
    weight_kg: float | None = Field(default=None, ge=0)
    width_cm: int | None = Field(default=None, ge=0)
    height_cm: int | None = Field(default=None, ge=0)
    length_cm: int | None = Field(default=None, ge=0)


class ProductVariantUpdate(BaseModel):
    sku: str | None = None
    price_cents: int | None = Field(default=None, ge=0)
    attributes_json: dict[str, object] | None = None
    stock: int | None = None
    weight_kg: float | None = Field(default=None, ge=0)
    width_cm: int | None = Field(default=None, ge=0)
    height_cm: int | None = Field(default=None, ge=0)
    length_cm: int | None = Field(default=None, ge=0)


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


class ProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    active: bool | None = None
    variants: list[ProductVariantUpdate] | None = None


class ProductVariantRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    sku: str
    price_cents: int
    attributes_json: dict[str, object]
    stock: int
    weight_kg: float | None
    width_cm: int | None
    height_cm: int | None
    length_cm: int | None


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
