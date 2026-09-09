"""Encrypts OwnerPayoutAccount bank account numbers at rest. Replaces the
old plaintext details["full_account"] JSON field, which cafe_service.py
would return unmasked if bank_account_number_masked was ever null."""
from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    return Fernet(settings.PAYOUT_ENCRYPTION_KEY.encode())


def encrypt_bank_account_number(raw: str) -> str:
    return _get_fernet().encrypt(raw.encode()).decode()


def decrypt_bank_account_number(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()
