# Text Tokens and Tokenization

## What a token is

A token is a piece of text processed by a language model. Depending on the tokenizer, it can be a whole word, part of one, punctuation, or a piece that includes a space. The source uses `cat` as an example likely to be one token and `Kubernetes` as an example that may split into several; neither example is a guaranteed split for every model. [Source](../../sources/notes/language-models/tokens-gist.md)

## Why counts vary

Token count is distinct from word count and character count. Word length can affect it, but the tokenizer's vocabulary and the particular model also matter. A long word can be one token, and different models can split the same text differently. [Source](../../sources/notes/language-models/tokens-gist.md)

## When the count matters

The note connects prompt and response token counts to context limits, API costs, and processing time. For an accurate count or estimate, use the tokenizer for the specific model instead of converting from word or character count. [Source](../../sources/notes/language-models/tokens-gist.md)

**Uncertainty:** The note does not name a model, tokenizer, API pricing rule, or latency relationship. Its cost and processing-time statements are general guidance; the actual effect depends on the service and workload. No conflicting wiki claim was found. This usage of “token” is distinct from [tokens in rate limiting](../infrastructure/token-buckets-and-network-bandwidth-shaping.md).
