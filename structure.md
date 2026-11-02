# Project structure

```
.
├── app/                 the product: one SvelteKit app, built for Vercel and for Cloud Run
│   ├── db/migrations/   Postgres schema
│   ├── scripts/         database scripts
│   ├── src/lib/client/  browser state and API calls
│   ├── src/lib/components/  UI
│   ├── src/lib/server/  agent, YouCam, storage, accounts, units
│   ├── src/routes/      pages and API
│   └── static/          public images
├── capability-checks/   live YouCam tests, run before the app was built
├── docs/                requirements, rules, architecture, API notes, claims, submission text
└── evidence/            committed proof behind the README's claims
```

## Where related logic lives

| Logic | Location |
|---|---|
| The shared contract between server and UI | [app/src/lib/types.ts](app/src/lib/types.ts) |
| The agent's rules and personality | [app/src/lib/server/agent/prompt.ts](app/src/lib/server/agent/prompt.ts) |
| The turn loop | [app/src/lib/server/agent/loop.ts](app/src/lib/server/agent/loop.ts) |
| Agent tools | [app/src/lib/server/agent/tools/](app/src/lib/server/agent/tools/README.md) |
| Every YouCam feature | [app/src/lib/server/youcam/features.ts](app/src/lib/server/youcam/features.ts) |
| Unit reservation and limits | [app/src/lib/server/youcam/ledger.ts](app/src/lib/server/youcam/ledger.ts), [app/src/lib/server/units/](app/src/lib/server/units/README.md) |
| No double charge after an interruption | [app/src/lib/server/youcam/task-journal.ts](app/src/lib/server/youcam/task-journal.ts) |
| The showcase video | [app/src/lib/server/agent/showcase-plan.ts](app/src/lib/server/agent/showcase-plan.ts), [app/src/lib/server/images/head-paste.ts](app/src/lib/server/images/head-paste.ts) |
| Product search and shopping | [app/src/lib/server/agent/tools/products.ts](app/src/lib/server/agent/tools/products.ts), [app/src/lib/server/agent/tools/shopping.ts](app/src/lib/server/agent/tools/shopping.ts) |
| Accounts | [app/src/lib/server/auth/](app/src/lib/server/auth/README.md) |
| Sessions and images | [app/src/lib/server/store/](app/src/lib/server/store/README.md), [app/src/lib/server/images/](app/src/lib/server/images/README.md) |
| The model provider layer | [app/src/lib/server/llm/](app/src/lib/server/llm/README.md) |
| Deployment | [app/README.md](app/README.md), [app/Dockerfile](app/Dockerfile), [app/vercel.json](app/vercel.json) |

## Every folder README

  - [.agents](.agents/README.md)
- [Godmother (root)](README.md)
    - [.vscode](app/.vscode/README.md)
  - [app](app/README.md)
    - [db](app/db/README.md)
      - [migrations](app/db/migrations/README.md)
    - [scripts](app/scripts/README.md)
    - [src](app/src/README.md)
      - [lib](app/src/lib/README.md)
        - [client](app/src/lib/client/README.md)
        - [components](app/src/lib/components/README.md)
          - [blocks](app/src/lib/components/blocks/README.md)
          - [canvas](app/src/lib/components/canvas/README.md)
          - [chat](app/src/lib/components/chat/README.md)
          - [studio](app/src/lib/components/studio/README.md)
          - [ui](app/src/lib/components/ui/README.md)
        - [server](app/src/lib/server/README.md)
          - [agent](app/src/lib/server/agent/README.md)
            - [tools](app/src/lib/server/agent/tools/README.md)
          - [auth](app/src/lib/server/auth/README.md)
          - [db](app/src/lib/server/db/README.md)
          - [email](app/src/lib/server/email/README.md)
          - [images](app/src/lib/server/images/README.md)
          - [llm](app/src/lib/server/llm/README.md)
          - [shop](app/src/lib/server/shop/README.md)
          - [store](app/src/lib/server/store/README.md)
          - [units](app/src/lib/server/units/README.md)
          - [youcam](app/src/lib/server/youcam/README.md)
      - [routes](app/src/routes/README.md)
        - [account](app/src/routes/account/README.md)
          - [reset](app/src/routes/account/reset/README.md)
        - [api](app/src/routes/api/README.md)
          - [account](app/src/routes/api/account/README.md)
            - [claim](app/src/routes/api/account/claim/README.md)
            - [sessions](app/src/routes/api/account/sessions/README.md)
            - [units](app/src/routes/api/account/units/README.md)
          - [assets](app/src/routes/api/assets/README.md)
            - [[id]](app/src/routes/api/assets/%5Bid%5D/README.md)
          - [auth](app/src/routes/api/auth/README.md)
            - [forgot](app/src/routes/api/auth/forgot/README.md)
            - [login](app/src/routes/api/auth/login/README.md)
            - [logout](app/src/routes/api/auth/logout/README.md)
            - [me](app/src/routes/api/auth/me/README.md)
            - [resend](app/src/routes/api/auth/resend/README.md)
            - [reset](app/src/routes/api/auth/reset/README.md)
            - [signup](app/src/routes/api/auth/signup/README.md)
            - [verify](app/src/routes/api/auth/verify/README.md)
          - [health](app/src/routes/api/health/README.md)
          - [sessions](app/src/routes/api/sessions/README.md)
            - [[id]](app/src/routes/api/sessions/%5Bid%5D/README.md)
              - [assets](app/src/routes/api/sessions/%5Bid%5D/assets/README.md)
              - [messages](app/src/routes/api/sessions/%5Bid%5D/messages/README.md)
              - [turn](app/src/routes/api/sessions/%5Bid%5D/turn/README.md)
        - [studio](app/src/routes/studio/README.md)
          - [[id]](app/src/routes/studio/%5Bid%5D/README.md)
    - [static](app/static/README.md)
      - [landing](app/static/landing/README.md)
  - [capability-checks](capability-checks/README.md)
    - [inputs](capability-checks/inputs/README.md)
    - [src](capability-checks/src/README.md)
  - [docs](docs/README.md)
  - [evidence](evidence/README.md)
    - [capability-checks](evidence/capability-checks/README.md)
