# Language models

Review questions for the [Language models](../../wiki/language-models/index.md) topic.

## LLM-TOK-001 — Why can equal-length texts have different token counts?

Source: [Text tokens and tokenization](../../wiki/language-models/text-tokens-and-tokenization.md)

Expected points:

- A token may be a word, word fragment, punctuation, or a piece including a space.
- Token count is not the same as word count or character count.
- The tokenizer's vocabulary and model affect how text is split.
- Use the specific model's tokenizer for accurate counts.

## LLM-TOK-002 — Why does token count matter when planning a prompt and response?

Source: [Text tokens and tokenization](../../wiki/language-models/text-tokens-and-tokenization.md)

Expected points:

- Prompt and response tokens relate to context limits.
- They can affect API costs and processing time.
- The exact cost and timing depend on the model or service.
