# youcam

The YouCam integration: files, tasks, polling, the unit ledger and every feature.

**Decisions and tradeoffs:** Units are reserved before any network call and a create is never blindly retried, because a repeat could be charged. The agent imports only from `index.ts`, so the rest can change freely.

## Files

- [analysis.ts](analysis.ts): Mapping of the skin-tone and face-attribute results (API-NOTES §2.6, §2.7) into FaceProfile.
- [client.ts](client.ts): HTTP client for the YouCam API.
- [color.ts](color.ts): Small colour helpers.
- [errors.ts](errors.ts): Error types and the mapping from YouCam error codes to messages a person can act on.
- [features.ts](features.ts): The YouCam features.
- [files.ts](files.ts): File API upload with caching (API-NOTES §1.4) and the chain-by-URL registry.
- [hair-templates.ts](hair-templates.ts): Hair template catalog.
- [images.ts](images.ts): Per-feature input images (API-NOTES §1.5, §5.2).
- [index.ts](index.ts): Public surface of the YouCam module.
- [ledger.ts](ledger.ts): Unit cap and ledger.
- [limiter.ts](limiter.ts): One token bucket in front of every YouCam API call (task create, poll, file API).
- [makeup.ts](makeup.ts): Makeup VTO.
- [results.ts](results.ts): Result download.
- [task-journal.ts](task-journal.ts): A saved record of YouCam tasks for the turn in progress.
- [tasks.ts](tasks.ts): Runs one billable task end to end.
- [test-config.ts](test-config.ts): Test-only.
- [test-helpers.ts](test-helpers.ts): Test-only.
- [tuning.ts](tuning.ts): Switches for behaviour that is INFERRED in docs/API-NOTES.md.

## Where to look

To find the analysis logic visit [analysis.ts](analysis.ts).

To find the client logic visit [client.ts](client.ts).

To find the color logic visit [color.ts](color.ts).

To find the errors logic visit [errors.ts](errors.ts).

To find the features logic visit [features.ts](features.ts).

To find the files logic visit [files.ts](files.ts).

To find the hair-templates logic visit [hair-templates.ts](hair-templates.ts).

To find the images logic visit [images.ts](images.ts).

To find the index logic visit [index.ts](index.ts).

To find the ledger logic visit [ledger.ts](ledger.ts).

To find the limiter logic visit [limiter.ts](limiter.ts).

To find the makeup logic visit [makeup.ts](makeup.ts).

To find the results logic visit [results.ts](results.ts).

To find the task-journal logic visit [task-journal.ts](task-journal.ts).

To find the tasks logic visit [tasks.ts](tasks.ts).

To find the test-config logic visit [test-config.ts](test-config.ts).

To find the test-helpers logic visit [test-helpers.ts](test-helpers.ts).

To find the tuning logic visit [tuning.ts](tuning.ts).
