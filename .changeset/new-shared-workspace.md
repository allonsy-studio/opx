---
"@allons-y/opx-shared": minor
---

Adds `@allons-y/opx-shared`, a private workspace for source that several opx packages need but the engine should not carry. It holds the ESLint runner shared by the lint plugins, which `prepack` copies into each plugin. It is never published.
