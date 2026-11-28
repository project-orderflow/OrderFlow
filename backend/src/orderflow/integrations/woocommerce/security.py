import base64
import binascii
import hashlib
import hmac


def verify_webhook_signature(body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    try:
        supplied_signature = base64.b64decode(signature, validate=True)
    except (binascii.Error, ValueError):
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).digest()
    return hmac.compare_digest(expected_signature, supplied_signature)
