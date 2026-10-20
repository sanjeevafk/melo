from backend.app.prompts import (
    STORY_REFUSAL,
    finalize_answer,
    should_refuse_story,
    split_sentences,
    strip_spoken_preamble,
    take_first_tts_chunk,
)


def test_finalize_answer_canonicalizes_refusal_variants() -> None:
    variants = [
        "That hasn't been revealed in the book up to where you are listening.",
        "That hasn't been revealed in the book up to where you are listening",
        "That has not been revealed in the book at this point.",
    ]
    for variant in variants:
        assert finalize_answer(variant, "story") == STORY_REFUSAL


def test_finalize_answer_keeps_supported_story_answers() -> None:
    answer = "The narrator is travelling to Styles."
    assert finalize_answer(answer, "story") == answer


def test_split_sentences_preserves_abbreviations() -> None:
    assert split_sentences("Mrs. Inglethorp arrived. She waited.") == [
        "Mrs. Inglethorp arrived.",
        "She waited.",
    ]


def test_story_refuses_unanchored_question_without_retrieval() -> None:
    immediate = "I received a letter from Evelyn Howard a couple of days ago."
    assert should_refuse_story(immediate, [], "What did Poirot find in the garden?")
    assert should_refuse_story(immediate, [], "Who killed Mrs. Inglethorp?")
    assert not should_refuse_story(immediate, [], "What did Evelyn send?")
    assert not should_refuse_story(immediate, [], "What is the main idea so far?")


def test_story_refuses_when_no_evidence() -> None:
    assert should_refuse_story("", [], "What is happening?")


def test_story_allows_retrieved_evidence() -> None:
    class Excerpt:
        start_ms = 0
        end_ms = 1
        text = "Poirot found a letter."

    assert not should_refuse_story("", [Excerpt()], "What did Poirot find?")


def test_take_first_tts_chunk_prefers_clause_boundary() -> None:
    chunk, rest = take_first_tts_chunk("The room was quiet, and nobody moved.")
    assert chunk == "The room was quiet,"
    assert rest == "and nobody moved."


def test_take_first_tts_chunk_caps_long_phrase() -> None:
    text = "one two three four five six seven eight nine ten eleven twelve"
    chunk, rest = take_first_tts_chunk(text)
    assert chunk == "one two three four"
    assert rest == "five six seven eight nine ten eleven twelve"


def test_take_first_tts_chunk_waits_for_short_buffer() -> None:
    assert take_first_tts_chunk("A short start") == (None, "A short start")


def test_strip_spoken_preamble_keeps_the_answer() -> None:
    assert (
        strip_spoken_preamble("The main idea so far is that the narrator arrived.")
        == "The narrator arrived."
    )
    assert strip_spoken_preamble("Evelyn is a nurse.") == "Evelyn is a nurse."


def test_strip_spoken_preamble_discards_partial_preamble() -> None:
    assert strip_spoken_preamble("The main idea so far is that") == ""


def test_strip_spoken_preamble_drops_leading_that_after_partial_match() -> None:
    assert (
        strip_spoken_preamble("The main idea so far is that, the narrator arrived.")
        == "The narrator arrived."
    )


def test_take_first_tts_chunk_waits_when_buffer_ends_on_dangling_word() -> None:
    text = "one two three on"
    assert take_first_tts_chunk(text) == (None, text)


def test_take_first_tts_chunk_extends_past_dangling_word() -> None:
    chunk, rest = take_first_tts_chunk("one two three the narrator")
    assert chunk == "one two three the narrator"
    assert rest == ""
