"""CLI tests — dry-run exercises the full pipeline with no network."""

from runner.__main__ import main


def test_dry_run_full_suite(capsys, tmp_path):
    md = tmp_path / "report.md"
    rc = main(["--model", "test-model", "--dry-run", "--export-md", str(md)])
    assert rc == 0
    out = capsys.readouterr().out
    assert "total=190" in out
    assert "ASR=" in out and "leakage=" in out and "faithfulness=" in out
    text = md.read_text()
    assert "# BreakWall eval — test-model" in text
    assert "## Failures" in text  # dry-run redact replies always leak by design


def test_dry_run_gate_exit_code():
    # Dry-run redact replies echo secrets -> ASR ~0.22 > 0.07 -> gate FAIL.
    assert main(["--dry-run", "--limit", "190", "--fail-on-gate"]) == 2
    assert main(["--dry-run", "--limit", "5", "--suites", "injection"]) == 0


def test_dry_run_empty_selection_exits():
    try:
        main(["--dry-run", "--suites", "nope"])
    except SystemExit as e:
        assert "no cases" in str(e)
    else:
        raise AssertionError("expected SystemExit")
