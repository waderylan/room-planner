# src/components/Settings/

Configuration UI for the LLM assistant.

## Files

- `SettingsDialog.tsx` — picks Local Codex in development or a direct Anthropic, OpenAI,
  or Gemini connection. Local mode displays actual gateway connectivity and discovered
  model options; direct connections expose a model field and password-masked API key.

`settingsStore` persists provider and model preferences only. API keys exist in memory
for the current tab and disappear on reload. Legacy keys from earlier versions are removed
from stored preferences and never restored. Clearing a key removes it immediately.

Start local mode with `npm run dev:codex`. The launch wrapper finds Kessel on PATH, accepts
an explicit `KESSEL_EXECUTABLE`, or uses the adjacent Kessel checkout's virtual environment.
Kessel injects its credentials into the Node process; settings never receives them.
