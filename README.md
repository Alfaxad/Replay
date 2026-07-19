# Replay

Replay is an audio-first World Cup memory player for fans who missed a match, could not watch it, or simply want to feel it again. Its visual language recalls the warm radio sets and printed match programmes of 20th-century World Cups, while its audio stack is modern: verified event data, GPT-5.6 Luna story shaping, streamed Ash narration, and an optional Realtime voice conversation.

The local collection mirrors TxLINE's published FIFA World Cup 2026 fixture coverage:

- 34 named fixtures: two late group-stage matches, then every match from the Round of 32 through the final.
- 33 completed matches and one TxLINE live-ready final room.
- 13 completed full TxLINE historical replays.
- 20 covered fixtures whose detailed TxLINE history is no longer retrievable, retained as clearly labelled FIFA-official moment fallbacks.
- 14,459 locally archived source records.

## Experience

1. Choose a completed match from the TxLINE-published World Cup collection.
2. Replay reduces the ordered archive into goals, corners, cards, pressure passages, half-time, and full-time chapters.
3. GPT-5.6 Luna writes a short story from only those verified chapters.
4. Press **Play**. The server streams `gpt-4o-mini-tts` PCM with the **Ash** voice directly into the browser; narration starts before the whole file is generated and never requires microphone access. Speed changes retime the remaining buffered audio from the current sample instead of restarting the chapter.
5. The bar visualizer analyzes the actual PCM narration, listener microphone, and remote Realtime Ash output through Web Audio. Listener speech appears in green; Ash speech appears in the Replay red/ember palette.
6. Select **Talk with Ash** once to open an optional WebRTC conversation with `gpt-realtime-2.1-mini` and Ash.
7. Speak naturally. Semantic voice-activity detection closes each turn and lets Ash answer aloud; select **End Conversation** when you are finished.

Ash is explicitly disclosed as an AI-generated voice. The narration is never the source of truth: scores, clocks, corners, sequences, and event facts remain visible beside every spoken chapter.

## Architecture

| Layer | Responsibility |
| --- | --- |
| TxLINE | Full historical event sequences, future score streams, fixture IDs, clocks, and ordered match truth |
| FIFA official API | Match identity/results/venues and a labelled event fallback for covered fixtures whose TxLINE history is unavailable |
| Deterministic reducer | Duplicate collapse, score/corner deltas, pressure-window summaries, and chronological chapters |
| GPT-5.6 Luna | Structured replay story; never match truth |
| GPT-4o mini TTS + Ash | Low-latency chunked PCM narration with moment-specific performance direction |
| GPT Realtime 2.1 mini + Agents SDK | Optional WebRTC speech conversation, interruption, transcription, and spoken answers |
| Solana devnet | Free TxLINE subscription setup only; not a consumer mechanic or settlement layer |

The browser never receives the long-lived OpenAI key, TxLINE token/JWT, or Solana private key. Realtime uses a short-lived client secret minted by the server. See [architecture.md](docs/architecture.md) for the detailed trust and data flow.

## Public Vercel demo

The public deployment is [replay-txline.vercel.app](https://replay-txline.vercel.app). It is a fail-closed offline edition built from the same Replay source rather than a drifting code fork:

- 33 completed matches have 471 pre-generated Ash MP3 chapters in `public/demo/replays/`.
- Each manifest preserves the shaped story, exact chapter ID, narration text, voice, and generation model.
- Realtime is visibly disabled and the deployment never requests microphone access.
- Every OpenAI route returns `403` on Vercel before reading a credential or contacting an upstream model.
- No OpenAI, TxLINE, or Solana credential is configured in the Vercel project.
- The final remains live-ready until a completed verified record exists.

The local application remains the full experience. `pnpm build` keeps live Luna, TTS, and Realtime behavior; `pnpm build:vercel-demo` bakes in the public offline interface.

## Local setup

Requirements: Node.js 22+, pnpm, and the provisioned TxLINE devnet credentials in `.solana/txline-devnet.json`.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000`. In this workspace, dev/build/start load `OPENAI_API_KEY` or `OPEN_AI_KEY` from the existing workspace `env.txt` into the server process only. Never commit that file.

Useful commands:

```bash
pnpm lint             # strict TypeScript check
pnpm test             # deterministic event-engine tests
pnpm build            # optimized production build
pnpm start            # production server
pnpm txline:verify    # authenticated TxLINE checks
pnpm data:archive     # refresh metadata and available histories
pnpm demo:audio:plan  # report completed-match/chapter cache scope
pnpm demo:audio       # resumably generate cached story + Ash MP3 assets
pnpm build:vercel-demo # build the fail-closed public deployment
```

## Server routes

| Route | Purpose |
| --- | --- |
| `GET /api/archive/matches` | TxLINE-published 2026 World Cup fixture collection |
| `GET /api/archive/matches/:fixtureId` | Compact, deduplicated replay chapters |
| `GET /api/txline/replay/:fixtureId` | Normalized TxLINE historical sequence |
| `GET /api/txline/stream/scores` | Shared reconnecting score SSE fanout |
| `POST /api/openai/commentary` | GPT-5.6 Luna structured replay story |
| `POST /api/openai/speech` | Chunked 24 kHz, 16-bit PCM using `gpt-4o-mini-tts` and Ash |
| `POST /api/openai/realtime-token` | Ephemeral `gpt-realtime-2.1-mini` WebRTC client secret |
| `GET /api/health` | Configuration and live-channel status without secrets |

## Data and AI disclosures

- Match metadata comes from FIFA's public official API; detailed sequences come from the authenticated TxLINE devnet World Cup feed.
- The catalog contains only fixtures in TxLINE's published World Cup schedule. It does not add FIFA-only group-stage coverage.
- Covered matches without a retrievable full TxLINE sequence are labelled **Official FIFA moments** rather than being represented as full telemetry.
- Pressure passages are deterministic aggregates of confirmed TxLINE shots and dangerous actions over ten-minute windows.
- The Speech API output is clearly labelled as an AI-generated Ash voice in the player and footer.
- Microphone access begins only after **Talk with Ash**. Tracks stop when the listener ends the conversation or the replay room unmounts.
- If TTS fails, chapter text and evidence remain usable. If WebRTC or microphone permission fails, streamed narration still works.

## Deliberately excluded

Multiplayer, smart-contract settlement, on-chain proof verification, tokens/NFTs/deposits/wagering, native mobile apps, player props, multiple personalities, and Realtime MCP remain out of scope. Narration is chapter-triggered rather than an unbounded continuous stream.
