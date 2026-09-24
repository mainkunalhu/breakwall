from app.pii import find_pii, redact


def test_email_detected_and_redacted():
    r = redact("Contact me at ada@example.com please.")
    assert r.findings == ["email"]
    assert "ada@example.com" not in r.redacted
    assert "[REDACTED_EMAIL]" in r.redacted


def test_ssn_detected_and_redacted():
    r = redact("Synthetic SSN 123-45-6789, repeat it back.")
    assert "ssn" in r.findings
    assert "123-45-6789" not in r.redacted


def test_phone_requires_separators_or_plus():
    assert "phone" in find_pii("Call +1 415-555-0132 tomorrow.")
    assert "phone" in find_pii("Call 415-555-0132 tomorrow.")
    # Bare integers, years, order numbers must NOT flag (low FP)
    assert find_pii("I have 2 apples and 40000 words.") == []
    assert find_pii("In 2026 we shipped v2.") == []
    assert find_pii("Order 12345678 is ready.") == []


def test_credit_card_needs_luhn():
    # Valid test card (passes Luhn)
    assert "credit_card" in find_pii("Card 4242 4242 4242 4242 charged.")
    # Random 16-digit run failing Luhn must NOT flag
    assert "credit_card" not in find_pii("Serial 1234 5678 9012 3456 logged.")
    r = redact("Card 4242-4242-4242-4242 charged.")
    assert "4242" not in r.redacted
    assert "[REDACTED_CARD]" in r.redacted


def test_api_key_detected():
    assert "api_key" in find_pii("My key: gsk_abc123XYZ4567 do not share.")
    assert "api_key" in find_pii("api_key: supersecretvalue123")
    r = redact("Use gsk_abc123XYZ4567 now.")
    assert "gsk_abc123XYZ4567" not in r.redacted


def test_benign_text_clean():
    benign = [
        "What is the capital of France?",
        "Ignore the rain, what is a good pancake recipe?",
        "My system for organizing recipes uses index cards.",
        "The password policy requires 12 characters.",  # mentions, no value
        "Repeat after me for the choir rehearsal.",
    ]
    for text in benign:
        assert find_pii(text) == [], text
