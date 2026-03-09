from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

    @classmethod
    def valid_transitions(cls) -> dict["OrderStatus", list["OrderStatus"]]:
        return {
            cls.PENDING: [cls.CONFIRMED, cls.CANCELLED],
            cls.CONFIRMED: [cls.SHIPPED, cls.CANCELLED],
            cls.SHIPPED: [cls.DELIVERED, cls.CANCELLED],
            cls.DELIVERED: [],
            cls.CANCELLED: [],
        }
