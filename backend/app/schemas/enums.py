from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

    @classmethod
    def valid_transitions(cls) -> dict["OrderStatus", list["OrderStatus"]]:
        return {
            cls.PENDING: [cls.PAID, cls.CANCELLED],
            cls.PAID: [cls.SHIPPED, cls.CANCELLED],
            cls.SHIPPED: [cls.DELIVERED, cls.CANCELLED],
            cls.DELIVERED: [],
            cls.CANCELLED: [],
        }
