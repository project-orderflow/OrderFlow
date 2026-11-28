"""Create repeatable local demo users and products without modifying existing rows."""

import argparse
import asyncio
import os
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from orderflow.modules.catalog.models import Product
from orderflow.modules.identity.models import Role, User
from orderflow.modules.identity.security import hash_password
from orderflow.shared.db.session import SessionFactory, engine


DEMO_USERS = (
    ("admin@orderflow.local", "ADMIN"),
    ("operator@orderflow.local", "OPERATOR"),
    ("warehouse@orderflow.local", "WAREHOUSE"),
)

DEMO_PRODUCTS = (
    ("DEMO-MOUSE-001", "Беспроводная мышь", Decimal("1490.00")),
    ("DEMO-KEYBOARD-001", "Механическая клавиатура", Decimal("5990.00")),
    ("DEMO-MONITOR-001", "Монитор 24 дюйма", Decimal("12990.00")),
    ("DEMO-HEADSET-001", "Гарнитура для видеосвязи", Decimal("3490.00")),
    ("DEMO-WEBCAM-001", "Веб-камера Full HD", Decimal("2790.00")),
    ("DEMO-DOCK-001", "Док-станция USB-C", Decimal("7490.00")),
    ("DEMO-LAMP-001", "Настольная лампа", Decimal("2190.00")),
    ("DEMO-BACKPACK-001", "Рюкзак для ноутбука", Decimal("4290.00")),
    ("DEMO-CABLE-001", "Кабель USB-C 1 м", Decimal("490.00")),
    ("DEMO-STAND-001", "Подставка для ноутбука", Decimal("1890.00")),
)


async def seed_demo_data(
    session: AsyncSession, password: str, *, users_only: bool = False,
) -> tuple[int, int]:
    roles: dict[str, Role] = {}
    for role_name in ("ADMIN", "OPERATOR", "WAREHOUSE"):
        role = await session.scalar(select(Role).where(Role.name == role_name))
        if role is None:
            role = Role(name=role_name)
            session.add(role)
            await session.flush()
        roles[role_name] = role

    created_users = 0
    for email, role_name in DEMO_USERS:
        existing_user = await session.scalar(
            select(User).where(User.email == email)
        )
        if existing_user is None:
            session.add(
                User(
                    email=email,
                    hashed_password=hash_password(password),
                    role=roles[role_name],
                )
            )
            created_users += 1

    created_products = 0
    if not users_only:
        for sku, name, price in DEMO_PRODUCTS:
            existing_product = await session.scalar(
                select(Product).where(Product.sku == sku)
            )
            if existing_product is None:
                session.add(Product(sku=sku, name=name, price=price, active=True))
                created_products += 1

    await session.commit()
    return created_users, created_products


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--users-only", action="store_true", help="Skip demo products.")
    args = parser.parse_args()

    password = os.environ.get("ORDERFLOW_DEMO_PASSWORD", "").strip()
    if len(password) < 12:
        raise SystemExit(
            "Set ORDERFLOW_DEMO_PASSWORD to a demo password of at least 12 characters."
        )

    try:
        async with SessionFactory() as session:
            created_users, created_products = await seed_demo_data(
                session, password, users_only=args.users_only,
            )
    finally:
        await engine.dispose()

    print(
        "Demo seed complete: "
        f"created {created_users} users and {created_products} products; "
        "existing rows were left unchanged."
    )


if __name__ == "__main__":
    asyncio.run(main())
