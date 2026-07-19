# Replay architecture

## Trust boundary

Replay separates truth, story, performance, and conversation:

1. **Source records say what happened.** TxLINE defines the covered fixture set and supplies available ordered histories and live streams. FIFA supplies identity/results and a labelled event fallback only inside that TxLINE-covered set.
2. **The deterministic reducer chooses the chapters.** It collapses duplicate confirmations, detects score/corner changes, and summarizes dense pressure windows. No model decides which events occurred.
3. **GPT-5.6 Luna shapes the story.** It receives compact verified chapters and must return the same chapter IDs.
4. **GPT-4o mini TTS performs.** The server applies the Ash voice plus expanded delivery direction and streams raw 24 kHz PCM to the browser.
5. **GPT Realtime converses.** A separate, optional WebRTC session accepts spoken questions and answers from bounded verified context.

## Deployment modes

| Mode | Story | Narration | Realtime | Credentials |
| --- | --- | --- | --- | --- |
| Full local Replay | Live GPT-5.6 Luna | Streamed `gpt-4o-mini-tts` PCM with Ash | `gpt-realtime-2.1-mini` WebRTC | Server-side workspace key |
| Public Vercel demo | Pre-generated manifest | 480 cached Ash MP3 chapters | Explicitly disabled | None |

The Vercel edition is a build profile, not a separate implementation. `NEXT_PUBLIC_REPLAY_DEMO=1` selects cached client behavior at build time, while `VERCEL=1` or `REPLAY_DEMO_MODE=1` makes all OpenAI routes fail closed with `403`. This keeps the public mirror aligned with the full product while preventing accidental runtime token spend.

## Replay pipeline

```text
TxLINE fixture coverage + histories ─┐
                                     ├─> local covered-fixture archive
FIFA metadata / labelled fallback ───┘           |
                                       v
                           deterministic reducer
                          /                     \
               verified chapters          visible evidence
                       |                         |
                       v                         |
             GPT-5.6 Luna story                  |
                       |                         |
                       v                         |
        GPT-4o mini TTS · Ash · PCM ───────────> browser player
                       |                         |
                       └──── audio analyser ─────┘

listener microphone ─> gpt-realtime-2.1-mini WebRTC
                              ^
                              |
                    verified context per turn
```

For the public demo, the lower branch is replaced by:

```text
verified chapters ─> one-time Luna story shaping ─> one-time Ash MP3 generation
                                                           |
                                                           v
                                                public/demo/replays/
                                                           |
                                                           v
                                        browser AudioBuffer + analyser

Realtime control ─> disabled disclosure (no microphone, no token endpoint)
```

## Narration lifecycle

1. Replay and chapter text load without touching the microphone.
2. Pressing **Play** creates or resumes a browser `AudioContext`.
3. `/api/openai/speech` sends a server-only Speech API request using `gpt-4o-mini-tts`, `voice: "ash"`, expanded performance instructions, and `response_format: "pcm"`.
4. The route passes the upstream body through without buffering the complete response.
5. The browser reads each chunk, converts signed little-endian 16-bit samples to float audio, and schedules buffers at 24 kHz.
6. A speed change preserves the active chunk's sample offset, switches at a short audio-clock boundary, and reschedules only the remaining buffered chunks at the new rate.
7. An `AnalyserNode` drives the 21-band visualizer from real output audio. Pause, chapter changes, and unmount abort the request and stop scheduled sources.

## Conversation lifecycle

1. **Talk with Ash** is the only action that requests microphone access.
2. The server mints a short-lived client secret for `gpt-realtime-2.1-mini` with the Ash voice.
3. The Agents SDK opens WebRTC with semantic voice-activity detection and keeps the microphone available for natural multi-turn conversation.
4. Pausing at the end of a clear thought commits the turn automatically; Ash answers aloud and can be interrupted naturally.
5. The complete timestamped match chapter record is injected into the session instructions before the microphone opens.
6. Independent Web Audio meters analyze the microphone and the remote WebRTC stream. The UI switches from green listener energy to red/ember Ash energy when the response audio starts.
7. **End Conversation** or leaving closes the session, stops every media track, closes audio contexts, and removes the hidden output element.

## Grounding and degradation

| Failure | User experience |
| --- | --- |
| TTS request unavailable | Full chapter text, timeline, and evidence remain usable |
| Realtime/WebRTC or microphone unavailable | Streamed Ash narration and the timestamped chapter record remain available |
| Luna story unavailable | Deterministic verified fact lines remain playable through Ash |
| Live TxLINE connection unavailable | Archived completed matches remain usable |
| Covered fixture's full TxLINE history unavailable | Labelled FIFA-official moment fallback, never misrepresented |

## Security

- `.solana/`, environment files, API tokens, JWTs, and wallet keys remain server-side and gitignored.
- The Speech route proxies audio; it never exposes the OpenAI key.
- Realtime receives only a short-lived client secret.
- Solana devnet only activates the free TxLINE feed and is not part of the consumer interaction.
- Vercel has no API key or wallet material; cached MP3s and manifests are the only generated assets used at runtime.
- OpenAI routes are retained for source parity but return `403` immediately in the public deployment.
