# chat

The conversation column.

**Decisions and tradeoffs:** Text streams in by message id, so reconnects don't duplicate it.

## Files

- [ActivityLine.svelte](ActivityLine.svelte): A live progress line such as "Trying look 2 on you".
- [Composer.svelte](Composer.svelte): The message box and attachments.
- [Markdown.svelte](Markdown.svelte): Renders assistant text through the safe markdown renderer.
- [Message.svelte](Message.svelte): One chat message and its blocks.
- [Suggestions.svelte](Suggestions.svelte): Suggested replies under the last message.
- [Thread.svelte](Thread.svelte): The conversation, including the continue button after an interruption.

## Where to look

To find the ActivityLine logic visit [ActivityLine.svelte](ActivityLine.svelte).

To find the Composer logic visit [Composer.svelte](Composer.svelte).

To find the Markdown logic visit [Markdown.svelte](Markdown.svelte).

To find the Message logic visit [Message.svelte](Message.svelte).

To find the Suggestions logic visit [Suggestions.svelte](Suggestions.svelte).

To find the Thread logic visit [Thread.svelte](Thread.svelte).
