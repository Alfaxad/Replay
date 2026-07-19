# Replay public demo

Production URL: <https://replay-txline.vercel.app>

The Vercel deployment is intentionally API-free at runtime. It uses the same application source and verified archive as full Replay, with a separate build profile that selects cached story manifests and MP3 narration.

## Asset generation

```bash
pnpm demo:audio:plan
pnpm demo:audio
```

Generation is resumable. Existing MP3s are reused when their narration text is unchanged; only missing or revised chapters are requested again. The current library contains 33 completed matches and 471 Ash MP3 chapters. The generated index declares `runtimeOpenAICalls: 0` and is covered by the integrity tests.

## Build and deploy

```bash
pnpm build:vercel-demo
vercel deploy --prod --yes
```

`vercel.json` selects the demo build command. The client receives `NEXT_PUBLIC_REPLAY_DEMO=1`; Vercel itself supplies `VERCEL=1`, which disables every OpenAI route before credential access. The Vercel project must not be configured with OpenAI, TxLINE, or Solana secrets.

## Verification

```bash
pnpm lint
pnpm test
```

In the deployed UI, confirm cached narration enters the **Ash is narrating** state, the audio bars animate, speed controls preserve the current playback position, and the Realtime button remains disabled. `/api/health` must report `mode: public-offline-demo` and `openai: disabled`.
