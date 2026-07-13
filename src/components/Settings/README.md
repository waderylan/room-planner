# src/components/Settings/

Configuration UI for the LLM assistant.

## Files

- `SettingsDialog.tsx` — dialog to pick the active provider (Anthropic / OpenAI / Gemini), set
  the model name per provider, and enter the API key. Reads and writes `settingsStore`; keys
  are stored only in the browser's `localStorage`.
