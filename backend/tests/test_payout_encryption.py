from app.core.payout_encryption import encrypt_bank_account_number, decrypt_bank_account_number


def test_encrypt_decrypt_round_trips():
    raw = "9180200192847291"
    token = encrypt_bank_account_number(raw)
    assert token != raw
    assert decrypt_bank_account_number(token) == raw


def test_encrypted_value_is_not_substring_of_plaintext():
    raw = "9180200192847291"
    token = encrypt_bank_account_number(raw)
    assert raw not in token
