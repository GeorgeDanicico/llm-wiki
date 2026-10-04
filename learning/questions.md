# Review Questions

Active-recall prompts covering recall, explanation, comparison, application, and diagnosis. Each topic has its own file under [`questions/`](questions/); every question has a stable identifier, a link to the wiki page that supports it, and expected answer points. The same files feed the flashcards.

## Topics

- [Language models](questions/language-models.md)
- [Java and JVM](questions/java.md)
- [Frameworks](questions/frameworks.md)
- [Data access](questions/data-access.md)
- [Reliability and operations](questions/reliability.md)
- [Distributed systems](questions/distributed-systems.md)
- [Infrastructure](questions/infrastructure.md)

## Adding questions

Add a question to the topic file that matches its supporting wiki page, or create a new topic file and list it above. Use the next free number in the identifier's series and follow the format documented in [`scripts/question_bank.py`](../scripts/question_bank.py). Run `python3 scripts/validate.py` to check the result.
