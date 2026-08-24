from scouting.context import conversation_messages


def test_conversation_context_includes_assistant_answer_and_current_question():
    messages = [
        {"role": "user", "content": "who pitched the most?"},
        {"role": "assistant", "content": "Ben Ellis pitched the most."},
    ]
    assert conversation_messages(messages, "show me his locations") == [
        {"role": "user", "content": "who pitched the most?"},
        {"role": "assistant", "content": "Ben Ellis pitched the most."},
        {"role": "user", "content": "show me his locations"},
    ]
