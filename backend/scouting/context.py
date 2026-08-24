def conversation_messages(history: list[dict[str, str]], question: str) -> list[dict[str, str]]:
    return [*history[-6:], {"role": "user", "content": question}]
