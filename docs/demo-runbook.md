# Replay demo runbook

## Before the demo

```bash
pnpm txline:verify
pnpm lint
pnpm test
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000` and confirm 34 TxLINE-covered collection cards appear.

For the public, API-free path, open [replay-txline.vercel.app](https://replay-txline.vercel.app). Confirm the **Offline demo** chip, cached-MP3 label, and disabled Realtime card are visible.

## 90-second path

1. State the promise: **“The World Cup memories should last forever!!”** Replay gives someone who missed or could not access a game a personal way to feel it.
2. Let the Pelé-era radio visual language register: walnut casework, amber tuning glass, physical controls, printed chapter cards—paired with modern data and voice tools.
3. Point out the collection facts: two late group fixtures plus Round of 32 through final, 13 full TxLINE replays, 14,459 records, and honest source labels.
4. Open France 4–6 England. Call out the 1,197 source records and 22 reduced chapters.
5. Press **Play** without enabling Live Voice. Ash begins streaming through `gpt-4o-mini-tts`; the 21-band display responds to actual PCM output. No microphone permission is required.
6. Jump to a goal chapter. Show that the score, clock, corners, source, and sequence remain visible below the performed line.
7. Point out that every spoken chapter begins with its verified minute, including natural phrasing for stoppage time and pressure ranges.
8. Select **Talk with Ash**, grant microphone permission, and ask “Catch me up.” Semantic voice-activity detection commits the turn automatically; `gpt-realtime-2.1-mini` answers in Ash's voice from the complete verified match context. Select **End Conversation** when finished.

## Public Vercel path

1. Point out the **Public offline demo** disclosure: no key, microphone, or live model connection is used.
2. Open France 4–6 England and press **Play**. A pre-generated Ash MP3 begins and the same 21-band analyser responds to the real audio output.
3. Change playback speed or jump between chapters; cached audio preserves the normal Replay controls.
4. Show **Realtime disabled — Public demo safeguard**. The button cannot request microphone access.
5. Explain that all 33 completed matches and 471 chapters are cached; the final stays live-ready until it has a verified completed record.

## Judge talking points

- Source records and deterministic reduction decide what happened; the models never do.
- Luna writes the chapter, TTS performs it, and Realtime handles optional conversation. Each model has one clear job.
- Narration is independent from the microphone, fixing the earlier coupling between playback and WebRTC permission.
- The archive makes the product useful after the World Cup and after provider history expires.
- Ash is visibly disclosed as AI-generated, and covered fixtures without retrievable full histories are visibly labelled FIFA fallbacks.
- Solana devnet is free feed-access infrastructure, not settlement, tokens, wagering, or a consumer mechanic.
