"""Replace every person's name, email and phone in the DEV database with fake
values, keeping every row (counts stay the same, links between rows still work).

Dev runs on a copy of prod, so without this a dev bug or leak exposes real
customers. NEVER for prod: it refuses unless every guard below agrees this is
not the production database.

    # dry run (default): shows how many rows each step would change
    CONFIRM=anonymize-dev python scripts/anonymize_dev_db.py
    # do it
    CONFIRM=anonymize-dev APPLY=1 python scripts/anonymize_dev_db.py

On the server: bash scripts/ops/dev_python.sh backend/scripts/anonymize_dev_db.py CONFIRM=anonymize-dev APPLY=1

Accounts on @example.com (seeded QA accounts) are left as they are.
"""
from __future__ import annotations

import asyncio
import os
import sys
from urllib.parse import urlparse

from sqlalchemy import text

# The production database, as named in docker-compose.prod.yml / .env.prod.example.
PROD_DB_NAMES = {"khel_o_db"}
PROD_DB_HOSTS = {"khel_o_postgres"}
PROD_SITE_URLS = {"https://khel-o.com", "https://www.khel-o.com"}


def refuse(why: str) -> None:
    print(f"REFUSED: {why}")
    sys.exit(2)


def guard_settings(environment: str, database_url: str, frontend_url: str) -> None:
    """Pure checks on configuration. Raises SystemExit when anything looks like prod."""
    if environment.strip().lower() == "production":
        refuse("ENVIRONMENT is production")
    parsed = urlparse(database_url.replace("+asyncpg", ""))
    host = (parsed.hostname or "").lower()
    name = (parsed.path or "/").lstrip("/").lower()
    if host in PROD_DB_HOSTS:
        refuse(f"database host {host!r} is the prod database container")
    if name in PROD_DB_NAMES:
        refuse(f"database name {name!r} is the prod database")
    if "dev" not in name and "test" not in name:
        refuse(f"database name {name!r} doesn't say dev or test")
    if frontend_url.rstrip("/").lower() in PROD_SITE_URLS:
        refuse("FRONTEND_URL is the live site")
    if os.environ.get("CONFIRM") != "anonymize-dev":
        refuse("set CONFIRM=anonymize-dev to run")


KEEP = "email ILIKE '%@example.com'"
FAKE_NAME = "'Player ' || substr(md5(id::text), 1, 6)"
# 00000 + 5 digits: shaped like a number, never a real one.
FAKE_PHONE = "'00000' || lpad((abs(hashtext(id::text)) % 100000)::text, 5, '0')"


def nullable(col: str, fake: str) -> str:
    return f"{col} = CASE WHEN {col} IS NULL THEN NULL ELSE {fake} END"


STEPS: list[tuple[str, str]] = [
    ("users", f"""UPDATE users SET
        email = 'user-' || replace(id::text, '-', '') || '@anon.invalid',
        full_name = {FAKE_NAME},
        {nullable('phone_number', FAKE_PHONE)},
        avatar_url = NULL, google_id = NULL, password_hash = NULL,
        sessions_valid_from = now()
      WHERE NOT ({KEEP}) AND email NOT LIKE '%@anon.invalid'"""),
    ("challenge_entries", f"""UPDATE challenge_entries SET name = {FAKE_NAME},
        {nullable('display_name', FAKE_NAME)}, phone = {FAKE_PHONE}"""),
    ("launch_signups", f"""UPDATE launch_signups SET name = {FAKE_NAME}, phone = {FAKE_PHONE},
        {nullable('email', "'signup-' || substr(md5(id::text),1,10) || '@anon.invalid'")}"""),
    ("cafe_waitlist", f"""UPDATE cafe_waitlist SET {nullable('phone', FAKE_PHONE)},
        {nullable('contact', FAKE_PHONE)}"""),
    ("owner_intros", f"""UPDATE owner_intros SET {nullable('owner_name', FAKE_NAME)},
        {nullable('owner_phone', FAKE_PHONE)}"""),
    ("staff_invitations", f"""UPDATE staff_invitations SET
        email = 'invite-' || substr(md5(id::text),1,10) || '@anon.invalid',
        full_name = {FAKE_NAME}, {nullable('phone_number', FAKE_PHONE)},
        token = 'void-' || replace(id::text, '-', '')"""),
    ("cafes (contact only)", f"""UPDATE cafes SET {nullable('phone_number', FAKE_PHONE)},
        {nullable('email', "'cafe-' || substr(md5(id::text),1,10) || '@anon.invalid'")}"""),
    ("owner_payout_accounts", f"""UPDATE owner_payout_accounts SET
        {nullable('account_holder_name', FAKE_NAME)},
        bank_account_number_encrypted = NULL,
        {nullable('bank_account_number_masked', "'XXXX0000'")},
        {nullable('bank_ifsc', "'TEST0000000'")},
        {nullable('bank_name', "'Test Bank'")},
        business_pan = NULL,
        {nullable('upi_vpa', "'test@upi'")},
        {nullable('verified_name', FAKE_NAME)}"""),
    ("cafe_payouts", f"""UPDATE cafe_payouts SET
        {nullable('destination_account_holder_name', FAKE_NAME)},
        {nullable('destination_bank_account_masked', "'XXXX0000'")},
        {nullable('destination_bank_ifsc', "'TEST0000000'")},
        {nullable('destination_upi_vpa', "'test@upi'")}"""),
    ("support_tickets", """UPDATE support_tickets SET description = '(removed on dev)', admin_notes = NULL"""),
    ("admin_audit_logs", """UPDATE admin_audit_logs SET admin_email = 'admin-' || substr(md5(coalesce(admin_email,'')),1,8) || '@anon.invalid'
        WHERE admin_email IS NOT NULL AND admin_email NOT ILIKE '%@example.com'"""),
    ("bookings (notes)", """UPDATE bookings SET notes = NULL WHERE notes IS NOT NULL"""),
    # Dev must never push to a real person's phone or reset a real account.
    ("push_subscriptions", """UPDATE push_subscriptions SET endpoint = 'https://push.invalid/' || id::text,
        p256dh_key = 'void', auth_key = 'void'"""),
    ("password_reset_tokens", """UPDATE password_reset_tokens SET token = 'void-' || replace(id::text, '-', ''),
        expires_at = now() - interval '1 day'"""),
    ("auth_attempts", """UPDATE auth_attempts SET ip = '0.0.0.0', email_hash = NULL"""),
]


async def main() -> None:
    from app.config import settings
    from app.database import AsyncSessionLocal

    guard_settings(settings.ENVIRONMENT, settings.DATABASE_URL, settings.FRONTEND_URL)
    apply = os.environ.get("APPLY") == "1"
    async with AsyncSessionLocal() as db:
        live_name = (await db.execute(text("SELECT current_database()"))).scalar_one()
        if live_name.lower() in PROD_DB_NAMES or "dev" not in live_name.lower():
            refuse(f"connected database is {live_name!r}")
        before = (await db.execute(text("SELECT count(*) FROM users"))).scalar_one()
        print(f"database={live_name} users={before} mode={'APPLY' if apply else 'DRY RUN'}")
        for label, sql in STEPS:
            result = await db.execute(text(sql))
            print(f"  {label}: {result.rowcount} rows")
        after = (await db.execute(text("SELECT count(*) FROM users"))).scalar_one()
        assert after == before, "row count changed"
        if apply:
            await db.commit()
            print("done: committed")
        else:
            await db.rollback()
            print("dry run: rolled back, nothing changed")


if __name__ == "__main__":
    asyncio.run(main())
