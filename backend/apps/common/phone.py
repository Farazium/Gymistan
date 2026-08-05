"""One shape for every Pakistani mobile number we store.

Accountants type the same number four different ways — 3121234567, 03121234567,
+92 312 1234567, 0312-1234567 — and each spelling would otherwise be a different
row, breaking the one-phone-per-gym rule and the WhatsApp lookups. Everything
that accepts a phone runs it through here first and stores 03xxxxxxxxx.
"""


def normalize_pk_mobile(raw):
    """Return the number as 03xxxxxxxxx, or None if it isn't a plausible
    Pakistani mobile (too few digits, too many, or not a 3xx network code)."""
    digits = ''.join(ch for ch in str(raw or '') if ch.isdigit())
    if digits.startswith('92'):
        digits = digits[2:]
    digits = digits.lstrip('0')
    if len(digits) == 10 and digits.startswith('3'):
        return '0' + digits
    return None
