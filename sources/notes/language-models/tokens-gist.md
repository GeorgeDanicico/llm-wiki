# Capture metadata

- Title: Tokens: the gist
- Captured: 2026-09-25
- Source type: User-supplied explanatory note
- Origin: Local ChatGPT project file `tokens-gist.md`
- Provenance note: Authorship and independent verification status were not supplied.

---

# Tokens: the gist

A token is a piece of text that a language model processes. It can be a whole word, part of a word, punctuation, or a piece that includes a space.

Token count is not the same as word count or character count. A common word such as `cat` is likely to be one token, while a less common word such as `Kubernetes` may be split into several. Word length can matter, but the tokenizer's learned vocabulary and the particular model matter too. A long word can still be one token, and different models may split the same text differently.

This matters because prompts and responses use tokens for context limits, API costs, and processing time. For accurate estimates, use the tokenizer for the specific model rather than counting characters or words.

**Takeaway:** tokens are the text pieces recognized by a particular model's tokenizer; the same amount of text can produce different token counts.
