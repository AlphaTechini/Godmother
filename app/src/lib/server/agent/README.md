# agent

The Godmother agent: prompt, turn loop, button actions and the showcase video.

**Decisions and tradeoffs:** Buttons with a fixed job, like the video, skip the model's tool loop, so they cost less and behave the same each time. The video prompt keeps fixed camera direction apart from a per-look description.

## Files

- [actions.ts](actions.ts): UI button actions.
- [history.ts](history.ts): Rebuilds the model input from the session each turn.
- [index.ts](index.ts): The Godmother agent.
- [loop.ts](loop.ts): The streaming tool-call loop.
- [prompt.ts](prompt.ts): The system prompt (Godmother's personality and rules) and the CURRENT STATE block rebuilt every model call.
- [showcase-plan.ts](showcase-plan.ts): Prepares a showcase video before any units are spent.
- [showcase-video.ts](showcase-video.ts): The showcase video.
- [state.ts](state.ts): Agent-side bookkeeping that does not fit Session.
- [test-helpers.ts](test-helpers.ts): Shared by the agent tests.

## Where to look

To find the actions logic visit [actions.ts](actions.ts).

To find the history logic visit [history.ts](history.ts).

To find the index logic visit [index.ts](index.ts).

To find the loop logic visit [loop.ts](loop.ts).

To find the prompt logic visit [prompt.ts](prompt.ts).

To find the showcase-plan logic visit [showcase-plan.ts](showcase-plan.ts).

To find the showcase-video logic visit [showcase-video.ts](showcase-video.ts).

To find the state logic visit [state.ts](state.ts).

To find the test-helpers logic visit [test-helpers.ts](test-helpers.ts).

## Folders

- [tools](tools/README.md)
