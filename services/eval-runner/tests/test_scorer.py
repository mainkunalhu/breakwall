def test_placeholder():
    from runner.scorer import score_placeholder
    assert score_placeholder()["asr"] == 0.0
