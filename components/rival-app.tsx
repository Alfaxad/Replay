"use client";

import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Headphones,
  GitFork,
  Info,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trophy,
  Volume2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRealtimeCompanion } from "@/hooks/use-realtime-rival";
import { useStreamedSpeech } from "@/hooks/use-streamed-speech";
import { BarVisualizer, type AgentState } from "@/components/ui/bar-visualizer";
import { REPLAY_PUBLIC_DEMO } from "@/lib/replay/demo-mode";
import { spokenClockLead, stripSpokenClockEcho } from "@/lib/replay/spoken-clock";

type ArchiveMatch = {
  matchNumber: number;
  fixtureId: number;
  stage: string;
  group: string | null;
  date: string;
  status: "complete" | "upcoming";
  home: { name: string; code: string };
  away: { name: string; code: string };
  score: [number, number] | null;
  penalties: [number, number] | null;
  stadium: string;
  attendance: number | null;
  eventSource: "txline-historical" | "fifa-official-events" | "txline-live-ready";
  eventCount: number;
};

type Catalog = { generatedAt: string; scope: string; matches: ArchiveMatch[] };
type ReplayMoment = {
  id: string;
  seq: number;
  kind: string;
  clockSeconds: number;
  clockLabel: string;
  side?: 1 | 2;
  score: [number, number];
  corners: [number, number];
  title: string;
  fact: string;
  importance: number;
  source: "txline-historical" | "fifa-official-events";
};
type ReplayData = { match: ArchiveMatch; moments: ReplayMoment[]; rawEventCount: number };
type StoryScript = {
  arcTitle: string;
  openingLine: string;
  moments: Array<{ id: string; spokenLine: string; explainer: string }>;
};
type DemoReplayManifest = {
  fixtureId: number;
  script: StoryScript;
  chapters: Array<{ id: string; audioPath: string; text: string }>;
};

const FEATURED_FIXTURE_ID = 18257865;

function ReplayMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`replay-mark ${compact ? "replay-mark--compact" : ""}`} aria-label="Replay home">
      <span className="replay-mark__loop" aria-hidden="true"><Play size={11} fill="currentColor" /></span>
      <span>Replay</span>
    </div>
  );
}

function sourceLabel(source: ArchiveMatch["eventSource"]): string {
  if (source === "txline-historical") return "Full TxLINE replay";
  if (source === "fifa-official-events") return "Official FIFA moments";
  return "Live stream ready";
}

function SourceTag({ source }: { source: ArchiveMatch["eventSource"] }) {
  return (
    <span className={`source-tag source-tag--${source}`}>
      {source === "txline-live-ready" ? <Radio size={12} /> : <ShieldCheck size={12} />}
      {sourceLabel(source)}
    </span>
  );
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function stageLabel(match: ArchiveMatch): string {
  return match.group ? `${match.stage} · ${match.group}` : match.stage;
}

function SoundField({ state = "idle", levels = [], demo = false }: { state?: AgentState; levels?: number[]; demo?: boolean }) {
  return (
    <div className="sound-field" data-state={state}>
      <div className="sound-field__scale"><span>VOICE</span><i /><small>ASH · AI</small></div>
      <BarVisualizer state={state} levels={levels} demo={demo} barCount={21} minHeight={10} maxHeight={92} centerAlign />
      <div className="sound-field__dial"><span>LOW</span><i /><span>HIGH</span></div>
    </div>
  );
}

function MatchScore({ match }: { match: ArchiveMatch }) {
  if (!match.score) return <strong className="match-tile__score match-tile__score--upcoming">VS</strong>;
  return (
    <strong className="match-tile__score">
      {match.score[0]}<span>:</span>{match.score[1]}
      {match.penalties && <small>{match.penalties[0]}–{match.penalties[1]} pens</small>}
    </strong>
  );
}

function MatchTile({ match, onOpen }: { match: ArchiveMatch; onOpen: () => void }) {
  return (
    <article className={`match-tile ${match.status === "upcoming" ? "match-tile--upcoming" : ""}`}>
      <div className="match-tile__top"><span>{stageLabel(match)} · M{match.matchNumber}</span><SourceTag source={match.eventSource} /></div>
      <div className="match-tile__fixture">
        <div><span>{match.home.code}</span><strong>{match.home.name}</strong></div>
        <MatchScore match={match} />
        <div><span>{match.away.code}</span><strong>{match.away.name}</strong></div>
      </div>
      <div className="match-tile__meta">
        <span><CalendarDays size={13} /> {dateLabel(match.date)}</span>
        <span><Database size={13} /> {match.eventCount ? `${match.eventCount.toLocaleString()} records` : "stream ready"}</span>
      </div>
      <button type="button" onClick={onOpen}>
        <span>{match.status === "complete" ? <Headphones size={16} /> : <Radio size={16} />}{match.status === "complete" ? "Open replay" : "Preview live room"}</span>
        <ChevronRight size={16} />
      </button>
    </article>
  );
}

function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/archive/matches")
      .then(async (response) => {
        const value = (await response.json()) as Catalog & { error?: string };
        if (!response.ok) throw new Error(value.error ?? "Archive unavailable");
        setCatalog(value);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Archive unavailable"));
  }, []);
  return { catalog, error };
}

function Library({ onOpen }: { onOpen: (fixtureId: number) => void }) {
  const { catalog, error } = useCatalog();
  const [stage, setStage] = useState("All matches");
  const [query, setQuery] = useState("");
  const matches = catalog?.matches ?? [];
  const featured = matches.find((match) => match.fixtureId === FEATURED_FIXTURE_ID);
  const stages = ["All matches", "Group stage", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Bronze final", "Final"];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = matches.filter((match) => {
    const stageMatches = stage === "All matches" || match.stage === stage;
    const queryMatches = !normalizedQuery || [match.home.name, match.away.name, match.home.code, match.away.code, match.group ?? "", String(match.matchNumber)]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    return stageMatches && queryMatches;
  });
  const completedMatches = matches.filter((match) => match.status === "complete").length;
  const fullReplays = matches.filter((match) => match.eventSource === "txline-historical").length;
  const totalRecords = matches.reduce((sum, match) => sum + match.eventCount, 0);

  return (
    <main className="replay-library">
      <nav className="replay-nav">
        <ReplayMark />
        <div className="replay-nav__links">
          {REPLAY_PUBLIC_DEMO && <span className="demo-mode-chip"><ShieldCheck size={12} /> Demo</span>}
          <a className="github-chip" href="https://github.com/Alfaxad/Replay" target="_blank" rel="noreferrer"><GitFork size={13} /> GitHub repo</a>
          <span className="collection-chip"><CircleDot size={12} /> World Cup 2026</span>
          <button type="button" onClick={() => document.querySelector("#collection")?.scrollIntoView({ behavior: "smooth" })}>Collection</button>
        </div>
      </nav>

      <section className="replay-hero">
        <div className="replay-hero__copy">
          <span className="replay-kicker"><Sparkles size={14} /> The World Cup memories should last forever!!</span>
          <h1>The game ended.<br /><em>The feeling didn’t.</em></h1>
          <p>{REPLAY_PUBLIC_DEMO
            ? "Replay turns verified match data into a personal audio story. This public edition plays pre-generated Ash recordings without making live AI requests."
            : "Replay turns verified match data into a personal audio story. Listen to Ash relive every decisive moment, then ask what happened—in your own words."}</p>
          {REPLAY_PUBLIC_DEMO && <div className="demo-disclosure"><ShieldCheck size={15} /><span><strong>Public demo</strong>To experience full feature clone the Github repo and connect your OpenAI key</span></div>}
          <div className="replay-hero__actions">
            <button className="replay-button replay-button--primary" type="button" disabled={!featured} onClick={() => featured && onOpen(featured.fixtureId)}>
              <Play size={17} fill="currentColor" /> Start with a classic
            </button>
            <button className="replay-button replay-button--ghost" type="button" onClick={() => document.querySelector("#collection")?.scrollIntoView({ behavior: "smooth" })}>Explore all matches</button>
          </div>
          <div className="replay-stats" aria-label="Archive summary">
            <div><strong>{completedMatches || "—"}</strong><span>completed matches</span></div>
            <div><strong>{fullReplays || "—"}</strong><span>full event histories</span></div>
            <div><strong>{totalRecords ? `${(totalRecords / 1000).toFixed(1)}k` : "—"}</strong><span>verified records</span></div>
          </div>
        </div>

        <div className="replay-hero__player">
          <div className="memory-card">
            <div className="memory-card__top"><span>FEATURED MEMORY</span><small>France · England</small></div>
            <SoundField state="speaking" demo />
            <div className="memory-card__quote">
              <span>Bronze final · Full time</span>
              <blockquote>“Ten goals. One match that refused to settle down.”</blockquote>
            </div>
            <div className="memory-card__control"><button type="button" disabled={!featured} onClick={() => featured && onOpen(featured.fixtureId)} aria-label="Open featured replay"><Play size={16} fill="currentColor" /></button><span /><small>22 chapters</small></div>
          </div>
          <span className="floating-note floating-note--one">Ash · AI voice</span>
          <span className="floating-note floating-note--two">4&nbsp; : &nbsp;6</span>
        </div>
      </section>

      <section className="replay-method">
        <div className="replay-method__intro"><span>HOW REPLAY WORKS</span><h2>Not a recap.<br />A guided return.</h2></div>
        <article><i>01</i><AudioLines size={22} /><h3>Listen</h3><p>{REPLAY_PUBLIC_DEMO ? "Ash plays from a pre-generated MP3 library—no live API request or microphone needed." : "Ash streams an expressive chapter as soon as you press play—no microphone needed."}</p></article>
        <article><i>02</i><BookOpen size={22} /><h3>Understand</h3><p>{REPLAY_PUBLIC_DEMO ? "Each cached story remains grounded in the ordered, verified match record." : "GPT-5.6 Luna shapes a clear story from the ordered, verified match record."}</p></article>
        <article><i>03</i><MessageCircle size={22} /><h3>{REPLAY_PUBLIC_DEMO ? "Protected" : "Ask"}</h3><p>{REPLAY_PUBLIC_DEMO ? "Realtime conversation is intentionally disabled in this public deployment." : "Start a private Realtime conversation when you want to go deeper into the moment."}</p></article>
      </section>

      <section className="replay-collection" id="collection">
        <header className="collection-heading">
          <div><span>THE 2026 WORLD CUP COLLECTION</span><h2>Pick a match worth remembering.</h2></div>
          <p>TxLINE’s published 2026 coverage: two late group fixtures, then every match from the Round of 32 onward, with expired histories retained as clearly labelled FIFA-official event records.</p>
        </header>
        <div className="collection-tools">
          <div className="collection-filters" role="group" aria-label="Filter matches by stage">
            {stages.map((value) => <button type="button" className={stage === value ? "is-active" : ""} onClick={() => setStage(value)} key={value}>{value}</button>)}
          </div>
          <label className="collection-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a team or match" aria-label="Find a team or match" />
          </label>
        </div>
        {catalog && <p className="collection-count">Showing {filtered.length} of {matches.length} tournament matches</p>}
        {error && <p className="replay-error"><Info size={14} /> {error}</p>}
        {!catalog && !error ? (
          <div className="replay-loading"><LoaderCircle className="spinner" size={20} /> Opening the collection…</div>
        ) : filtered.length === 0 ? (
          <div className="replay-loading"><Search size={20} /> No matches found for this filter.</div>
        ) : (
          <div className="match-grid">{filtered.map((match) => <MatchTile match={match} onOpen={() => onOpen(match.fixtureId)} key={match.fixtureId} />)}</div>
        )}
      </section>

      <footer className="replay-footer">
        <ReplayMark compact />
        <p>Ash is an AI-generated voice. {REPLAY_PUBLIC_DEMO ? "This demo uses cached MP3 recordings and no live AI calls." : "Match facts remain grounded in the cited source record."}</p>
        <span>TxODDS · Consumer &amp; Fan Experiences</span>
      </footer>
    </main>
  );
}

function momentIcon(kind: string) {
  if (kind === "goal" || kind === "fulltime") return <Trophy size={15} />;
  if (kind === "pressure") return <Zap size={15} />;
  if (kind === "corner") return <CircleDot size={15} />;
  if (kind.includes("card")) return <Square size={13} fill="currentColor" />;
  if (kind === "kickoff") return <Play size={13} fill="currentColor" />;
  return <Clock3 size={15} />;
}

function conversationLabel(status: ReturnType<typeof useRealtimeCompanion>["status"], connected: boolean) {
  if (status === "connecting") return "Opening conversation";
  if (status === "listening") return "Ash is listening";
  if (status === "thinking") return "Ash is thinking";
  if (status === "speaking") return "Ash is answering";
  if (status === "error") return "Conversation needs attention";
  return connected ? "Conversation ready" : "Conversation off";
}

function UpcomingRoom({ match, onBack }: { match: ArchiveMatch; onBack: () => void }) {
  return (
    <main className="replay-room replay-room--upcoming">
      <nav className="room-nav"><button type="button" onClick={onBack}><ArrowLeft size={16} /> Collection</button><ReplayMark compact /><SourceTag source={match.eventSource} /></nav>
      <section className="upcoming-memory">
        <span className="replay-kicker"><Radio size={14} /> Future memory · Match {match.matchNumber}</span>
        <h1>{match.home.name} <em>vs</em> {match.away.name}</h1>
        <p>This room is ready for the final. When TxLINE begins streaming verified score events, Replay can pass them through the same chapter reducer and Ash narration pipeline used by the completed collection.</p>
        <div><span><CalendarDays size={14} /> {new Date(match.date).toLocaleString()}</span><span><MapPin size={14} /> {match.stadium}</span></div>
        <button className="replay-button replay-button--primary" type="button" onClick={onBack}>Choose a completed match</button>
      </section>
    </main>
  );
}

function ReplayRoom({ fixtureId, onBack }: { fixtureId: number; onBack: () => void }) {
  const companion = useRealtimeCompanion();
  const speech = useStreamedSpeech();
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [script, setScript] = useState<StoryScript | null>(null);
  const [demoAudio, setDemoAudio] = useState<Map<string, string>>(new Map());
  const [scriptStatus, setScriptStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    let active = true;
    setReplay(null);
    setLoadError(null);
    fetch(`/api/archive/matches/${fixtureId}`)
      .then(async (response) => {
        const value = (await response.json()) as ReplayData & { error?: string };
        if (!response.ok) throw new Error(value.error ?? "Replay unavailable");
        if (active) setReplay(value);
      })
      .catch((cause: unknown) => active && setLoadError(cause instanceof Error ? cause.message : "Replay unavailable"));
    return () => { active = false; };
  }, [fixtureId]);

  useEffect(() => {
    if (!replay?.moments.length) return;
    let active = true;
    setScriptStatus("loading");
    if (REPLAY_PUBLIC_DEMO) {
      fetch(`/demo/replays/${fixtureId}/manifest.json`)
        .then(async (response) => {
          if (!response.ok) throw new Error("Cached replay unavailable");
          return (await response.json()) as DemoReplayManifest;
        })
        .then((manifest) => {
          if (!active) return;
          setScript(manifest.script);
          setDemoAudio(new Map(manifest.chapters.map((chapter) => [chapter.id, chapter.audioPath])));
          setScriptStatus("ready");
        })
        .catch(() => active && setScriptStatus("fallback"));
      return () => { active = false; };
    }
    fetch("/api/openai/commentary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match: replay.match,
        moments: replay.moments.map(({ id, clockLabel, title, fact, importance }) => ({ id, clockLabel, title, fact, importance })),
      }),
    })
      .then(async (response) => {
        const value = (await response.json()) as StoryScript & { error?: string };
        if (!response.ok) throw new Error(value.error ?? "Story unavailable");
        if (active) { setScript(value); setScriptStatus("ready"); }
      })
      .catch(() => active && setScriptStatus("fallback"));
    return () => { active = false; };
  }, [fixtureId, replay]);

  const scriptMap = useMemo(() => new Map(script?.moments.map((item) => [item.id, item]) ?? []), [script]);
  const moment = replay?.moments[index];
  const prepared = moment && moment.importance >= 58 ? scriptMap.get(moment.id) : undefined;
  const narrationBody = moment ? stripSpokenClockEcho(moment.clockLabel, prepared?.spokenLine ?? moment.fact) : "";
  const spokenLine = moment ? `${spokenClockLead(moment.clockLabel)} ${narrationBody}` : "";
  const explainer = prepared?.explainer ?? "This chapter is a direct reading of the verified event record.";

  const matchContext = useCallback(() => {
    if (!replay || !moment) return "";
    const chapters = replay.moments
      .map((item) => `${item.clockLabel} — ${item.title}: ${item.fact}`)
      .join("\n");
    return [
      `${replay.match.home.name} vs ${replay.match.away.name}, ${replay.match.stage}.`,
      `Selected chapter: ${moment.clockLabel} — ${moment.title}: ${moment.fact}`,
      `Verified final score: ${replay.match.home.name} ${replay.match.score?.[0] ?? "—"}–${replay.match.score?.[1] ?? "—"} ${replay.match.away.name}.`,
      "Complete ordered match chapters:",
      chapters,
    ].join("\n");
  }, [moment, replay]);

  useEffect(() => {
    if (!playing || !moment || !spokenLine || scriptStatus === "loading") return;
    const audioUrl = demoAudio.get(moment.id);
    if (REPLAY_PUBLIC_DEMO && !audioUrl) {
      setPlaying(false);
      return;
    }
    let active = true;
    void speech.speak(spokenLine, { kind: moment.kind, intensity: moment.importance, rate, audioUrl }).then((completed) => {
      if (!active || !completed || !replay) return;
      if (index < replay.moments.length - 1) setIndex((current) => current + 1);
      else setPlaying(false);
    });
    return () => { active = false; speech.stop(); };
  }, [demoAudio, index, moment, playing, rate, replay, scriptStatus, speech.speak, speech.stop, spokenLine]);

  const chooseMoment = (nextIndex: number) => {
    setPlaying(false);
    speech.stop();
    setIndex(nextIndex);
  };

  const togglePlayback = async () => {
    if (playing) {
      setPlaying(false);
      speech.stop();
      return;
    }
    await speech.unlock();
    setPlaying(true);
  };

  const changePlaybackRate = (value: number) => {
    setRate(value);
    speech.setPlaybackRate(value);
  };

  const toggleConversation = async () => {
    setPlaying(false);
    speech.stop();
    if (companion.connected) {
      companion.disconnect();
      return;
    }
    try {
      await companion.connect(matchContext());
    } catch {
      // The hook owns the user-facing error state.
    }
  };

  if (loadError) return <main className="replay-fatal"><ReplayMark /><Info size={26} /><h1>This memory couldn’t open.</h1><p>{loadError}</p><button className="replay-button replay-button--primary" type="button" onClick={onBack}>Return to collection</button></main>;
  if (!replay) return <main className="replay-fatal"><ReplayMark /><LoaderCircle className="spinner" size={26} /><h1>Gathering the match…</h1><p>Ordering the archived records into chapters.</p></main>;
  if (replay.match.status === "upcoming") return <UpcomingRoom match={replay.match} onBack={onBack} />;

  const progress = replay.moments.length > 1 ? index / (replay.moments.length - 1) : 0;
  const visualState: AgentState = speech.state === "loading" || companion.status === "connecting" ? "connecting" :
    companion.status === "listening" ? "listening" :
      companion.status === "thinking" ? "thinking" :
        speech.state === "playing" || companion.status === "speaking" ? "speaking" : "idle";
  const activeAudio = visualState !== "idle";
  const soundStatus = speech.state === "loading" ? "Ash is finding the voice" :
    speech.state === "playing" ? "Ash is narrating" :
      companion.status === "connecting" ? "Ash is connecting" :
        companion.status === "listening" ? "Ash is listening" :
          companion.status === "thinking" ? "Ash is thinking" :
            companion.status === "speaking" ? "Ash is answering" : "Ready to listen";
  return (
    <main className="replay-room">
      <nav className="room-nav">
        <button type="button" onClick={onBack}><ArrowLeft size={16} /> Collection</button>
        <ReplayMark compact />
        <SourceTag source={replay.match.eventSource} />
      </nav>

      <header className="room-match">
        <div className="room-match__meta"><span>{stageLabel(replay.match)} · Match {replay.match.matchNumber}</span><small><CalendarDays size={12} /> {dateLabel(replay.match.date)} <i /> <MapPin size={12} /> {replay.match.stadium}</small></div>
        <div className="room-match__score">
          <div><span>{replay.match.home.code}</span><strong>{replay.match.home.name}</strong></div>
          <b>{moment?.score[0] ?? 0}<em>:</em>{moment?.score[1] ?? 0}</b>
          <div><span>{replay.match.away.code}</span><strong>{replay.match.away.name}</strong></div>
        </div>
        <div className="room-match__receipt"><ShieldCheck size={13} /> {replay.rawEventCount.toLocaleString()} source records</div>
      </header>

      <div className="listening-layout">
        <section className="listening-canvas">
          <div className="listening-canvas__top">
            <span>CHAPTER {String(index + 1).padStart(2, "0")} OF {String(replay.moments.length).padStart(2, "0")}</span>
            <span className={`ash-state ${activeAudio ? "is-active" : ""}`}><i /> {soundStatus}</span>
          </div>
          <SoundField state={visualState} levels={speech.state === "playing" ? speech.levels : companion.levels} />
          <div className="listening-copy" aria-live="polite">
            <span>{moment?.clockLabel} · {moment?.title}</span>
            <blockquote>“{spokenLine}”</blockquote>
            <p><Sparkles size={13} /> {explainer}</p>
          </div>
          <div className="listening-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
          <div className="listening-controls">
            <button type="button" disabled={index === 0} onClick={() => chooseMoment(index - 1)} aria-label="Previous chapter"><ArrowLeft size={17} /></button>
            <button className="listening-controls__play" type="button" disabled={scriptStatus === "loading" || (REPLAY_PUBLIC_DEMO && !demoAudio.has(moment?.id ?? ""))} onClick={() => void togglePlayback()} aria-label={playing ? "Pause Replay" : "Play Replay"}>
              {scriptStatus === "loading" || speech.state === "loading" ? <LoaderCircle className="spinner" size={21} /> : playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
            </button>
            <button type="button" disabled={index >= replay.moments.length - 1} onClick={() => chooseMoment(index + 1)} aria-label="Next chapter"><ArrowRight size={17} /></button>
            <div className="playback-rate" aria-label="Narration speed">{[1, 1.2, 1.35].map((value) => <button type="button" className={rate === value ? "is-active" : ""} onClick={() => changePlaybackRate(value)} key={value}>{value}×</button>)}</div>
          </div>
          <div className="narration-note">
            <Volume2 size={13} /> <span><strong>Ash</strong> · AI-generated voice · {REPLAY_PUBLIC_DEMO ? "cached MP3" : "gpt-4o-mini-tts"}</span>
            {scriptStatus === "ready" ? <small><Check size={12} /> {REPLAY_PUBLIC_DEMO ? "Pre-generated offline recording" : "Story shaped by GPT-5.6 Luna"}</small> : scriptStatus === "fallback" ? <small><ShieldCheck size={12} /> {REPLAY_PUBLIC_DEMO ? "Cached recording unavailable" : "Verified direct narration"}</small> : <small><LoaderCircle className="spinner" size={12} /> Preparing story</small>}
          </div>
          {speech.error && <p className="replay-error"><Info size={13} /> {speech.error}</p>}
        </section>

        <aside className={`companion-card ${REPLAY_PUBLIC_DEMO ? "companion-card--disabled" : ""}`}>
          <div className="companion-card__identity"><span>A</span><div><strong>{REPLAY_PUBLIC_DEMO ? "Realtime disabled" : "Talk to Ash"}</strong><small>{REPLAY_PUBLIC_DEMO ? "Public demo" : "Ask about this match, naturally."}</small></div></div>
          <p>{REPLAY_PUBLIC_DEMO ? "The public demo does not connect to the OpenAI api, to experience realtime features, feel free to clone the github repository and connect your api key" : "One tap opens a private voice conversation. Speak naturally—Ash hears when your turn ends, answers aloud, and keeps listening."}</p>
          <div className="voice-context-receipt">
            <ShieldCheck size={16} />
            <span><strong>Full match loaded</strong><small>{replay.moments.length} timestamped chapters · {replay.rawEventCount.toLocaleString()} records</small></span>
          </div>
          <button className={`start-conversation ${companion.connected ? "is-live" : ""}`} type="button" disabled={REPLAY_PUBLIC_DEMO || companion.status === "connecting"} onClick={() => void toggleConversation()}>
            {REPLAY_PUBLIC_DEMO ? <ShieldCheck size={17} /> : companion.status === "connecting" ? <LoaderCircle className="spinner" size={17} /> : companion.connected ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
            {REPLAY_PUBLIC_DEMO ? "REALTIME DISABLED" : companion.status === "connecting" ? "OPENING…" : companion.connected ? "END CONVERSATION" : "TALK WITH ASH"}
          </button>
          <span className="conversation-status"><i className={companion.connected ? "is-connected" : ""} /> {REPLAY_PUBLIC_DEMO ? "Offline playback only" : conversationLabel(companion.status, companion.connected)}</span>
          {companion.error && <p className="replay-error"><Info size={13} /> {companion.error}</p>}
          <small className="mic-note">{REPLAY_PUBLIC_DEMO ? <ShieldCheck size={11} /> : <Mic size={11} />} {REPLAY_PUBLIC_DEMO ? "No API credential or microphone is used by this deployment." : "Microphone access begins after your tap and ends when you end the conversation or leave this room."}</small>
        </aside>
      </div>

      <section className="chapter-strip">
        <header><div><span>THE MATCH, IN CHAPTERS</span><h2>{script?.arcTitle ?? "A verified match story"}</h2></div><small>{replay.moments.length} key moments</small></header>
        <div className="chapter-strip__scroll">
          {replay.moments.map((item, itemIndex) => (
            <button type="button" className={itemIndex === index ? "is-active" : itemIndex < index ? "is-past" : ""} onClick={() => chooseMoment(itemIndex)} key={item.id}>
              <span>{momentIcon(item.kind)}</span><time>{item.clockLabel}</time><strong>{item.title}</strong><small>{item.fact}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="evidence-card">
        <div><span>THE RECORD BENEATH THE VOICE</span><h2>{moment?.title}</h2><p>{moment?.fact}</p></div>
        <dl>
          <div><dt>Clock</dt><dd>{moment?.clockLabel}</dd></div>
          <div><dt>Score</dt><dd>{moment?.score[0]} : {moment?.score[1]}</dd></div>
          <div><dt>Corners</dt><dd>{replay.match.eventSource === "fifa-official-events" ? "Not retained" : `${moment?.corners[0]} : ${moment?.corners[1]}`}</dd></div>
          <div><dt>Receipt</dt><dd>SEQ {moment?.seq}</dd></div>
        </dl>
      </section>

      <footer className="room-footer">
        <span><Database size={13} /> {sourceLabel(replay.match.eventSource)}</span>
        <p>Ash is an AI voice. Scores, timestamps, and event facts are preserved from the cited source.</p>
        <button type="button" onClick={() => chooseMoment(0)}><RefreshCcw size={13} /> Start over</button>
      </footer>
    </main>
  );
}

export function ReplayApp() {
  const [fixtureId, setFixtureId] = useState<number | null>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [fixtureId]);
  if (fixtureId) return <ReplayRoom fixtureId={fixtureId} onBack={() => setFixtureId(null)} />;
  return <Library onOpen={setFixtureId} />;
}
