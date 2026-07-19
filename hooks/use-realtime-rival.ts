"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  RealtimeSession,
} from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "react";

type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
type MeterChannel = "listener" | "ash";
type AudioMeter = {
  analyser: AnalyserNode;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  timer: number;
};

function readFrequencyLevels(analyser: AnalyserNode, bins: Uint8Array<ArrayBuffer>, columns = 21): number[] {
  analyser.getByteFrequencyData(bins);
  return Array.from({ length: columns }, (_, column) => {
    const start = Math.floor((column / columns) * bins.length);
    const end = Math.max(start + 1, Math.floor(((column + 1) / columns) * bins.length));
    let total = 0;
    for (let bin = start; bin < end; bin += 1) total += bins[bin] ?? 0;
    return Math.min(1, (total / (end - start) / 255) * 1.7);
  });
}

function companionInstructions(context: string): string {
  return `# Role & Objective
You are Ash, the voice-only football companion inside Replay. You are speaking with a listener who is revisiting one completed match. Help them understand, relive, and emotionally connect with the verified match story.

# Personality & Tone
- Warm, perceptive, vivid, and conversational.
- Sound emotionally alive when the verified sequence warrants it, but never manufacture drama or facts.
- Speak like a brilliant radio companion in excellent headphones, not a generic assistant or a shouting announcer.
- Use one to three sentences for a focused question. For a broad recap, use three to five chronological sentences.
- Do not include sound effects, crowd noises, or onomatopoeia.

# Conversation
- The microphone stays open and automatic turn detection manages turns.
- Respond after the listener finishes a clear thought. Welcome natural interruptions and stop your response when interrupted.
- Answer in audio only. Do not mention a text interface.
- If audio is unclear or incomplete, ask one short clarifying question.

# Match Grounding
- Treat the VERIFIED MATCH RECORD below as the complete factual boundary.
- For every event you mention, include its exact verified minute naturally in the spoken answer.
- For summaries, tell the story chronologically and include the minutes of the decisive moments.
- Preserve every player, score, clock, and event exactly. Never invent tactics, motives, incidents, statistics, or causal explanations.
- If the record does not establish an answer, say so plainly.
- Never use wagering language.

# VERIFIED MATCH RECORD
${context.slice(0, 14_000)}`;
}

export function useRealtimeCompanion() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const metersRef = useRef<Record<MeterChannel, AudioMeter | null>>({ listener: null, ash: null });
  const outputMeterProbeRef = useRef<number | null>(null);
  const connectingRef = useRef<Promise<RealtimeSession> | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [listenerLevels, setListenerLevels] = useState<number[]>([]);
  const [ashLevels, setAshLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ensureAudioElement = useCallback(() => {
    if (audioElementRef.current) return audioElementRef.current;
    const element = document.createElement("audio");
    element.autoplay = true;
    element.setAttribute("playsinline", "true");
    element.dataset.replayCompanion = "output";
    element.style.position = "fixed";
    element.style.width = "1px";
    element.style.height = "1px";
    element.style.opacity = "0";
    element.style.pointerEvents = "none";
    document.body.appendChild(element);
    audioElementRef.current = element;
    return element;
  }, []);

  const stopMeter = useCallback((channel: MeterChannel) => {
    const meter = metersRef.current[channel];
    if (meter) {
      window.clearInterval(meter.timer);
      meter.source.disconnect();
      meter.analyser.disconnect();
      void meter.context.close();
      metersRef.current[channel] = null;
    }
    if (channel === "listener") setListenerLevels([]);
    else setAshLevels([]);
  }, []);

  const startMeter = useCallback((stream: MediaStream, channel: MeterChannel) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const current = metersRef.current[channel];
    if (current?.stream === stream) {
      void current.context.resume();
      return;
    }
    stopMeter(channel);
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.78;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const publish = channel === "listener" ? setListenerLevels : setAshLevels;
    const timer = window.setInterval(() => publish(readFrequencyLevels(analyser, bins)), 65);
    metersRef.current[channel] = { analyser, context, source, stream, timer };
    void context.resume();
  }, [stopMeter]);

  const monitorAshOutput = useCallback((output: HTMLAudioElement) => {
    if (outputMeterProbeRef.current !== null) cancelAnimationFrame(outputMeterProbeRef.current);
    let attempts = 0;
    const probe = () => {
      const stream = output.srcObject;
      if (stream instanceof MediaStream && stream.getAudioTracks().length > 0) {
        outputMeterProbeRef.current = null;
        startMeter(stream, "ash");
        return;
      }
      attempts += 1;
      outputMeterProbeRef.current = attempts < 180 ? requestAnimationFrame(probe) : null;
    };
    probe();
  }, [startMeter]);

  const releaseMedia = useCallback(() => {
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    if (outputMeterProbeRef.current !== null) cancelAnimationFrame(outputMeterProbeRef.current);
    outputMeterProbeRef.current = null;
    stopMeter("listener");
    stopMeter("ash");
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }
  }, [stopMeter]);

  const connect = useCallback(async (context: string): Promise<RealtimeSession> => {
    if (sessionRef.current) return sessionRef.current;
    if (connectingRef.current) return connectingRef.current;
    const verifiedContext = context.trim();
    if (!verifiedContext) throw new Error("The verified match record is not ready yet");
    const pending = (async () => {
      setStatus("connecting");
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not expose microphone access");
      const output = ensureAudioElement();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaRef.current = stream;
      startMeter(stream, "listener");

      const transport = new OpenAIRealtimeWebRTC({ mediaStream: stream, audioElement: output });
      const agent = new RealtimeAgent({
        name: "Ash · Replay companion",
        instructions: companionInstructions(verifiedContext),
      });
      const session = new RealtimeSession(agent, {
        transport,
        model: "gpt-realtime-2.1-mini",
        tracingDisabled: true,
        config: {
          outputModalities: ["audio"],
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
              noiseReduction: { type: "near_field" },
              turnDetection: {
                type: "semantic_vad",
                eagerness: "auto",
                createResponse: true,
                interruptResponse: true,
              },
            },
            output: { voice: "ash" },
          },
        },
      });
      session.on("agent_start", () => setStatus("thinking"));
      session.on("audio_start", () => {
        setStatus("speaking");
        monitorAshOutput(output);
        void output.play().catch((cause: unknown) => {
          setError(cause instanceof Error ? `Audio playback was blocked: ${cause.message}` : "Audio playback was blocked");
        });
      });
      session.on("audio_stopped", () => setStatus("listening"));
      session.on("audio_interrupted", () => setStatus("listening"));
      session.on("transport_event", (event) => {
        if (event.type === "input_audio_buffer.speech_started") setStatus("listening");
        if (event.type === "input_audio_buffer.speech_stopped") setStatus("thinking");
      });
      session.on("error", (event) => {
        setError(event.error instanceof Error ? event.error.message : "Voice session error");
        setStatus("error");
      });

      const tokenResponse = await fetch("/api/openai/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: crypto.randomUUID(), context: verifiedContext }),
      });
      const token = (await tokenResponse.json()) as { value?: string; error?: string };
      if (!tokenResponse.ok || !token.value) throw new Error(token.error ?? "Voice token unavailable");
      await session.connect({ apiKey: token.value, model: "gpt-realtime-2.1-mini" });
      monitorAshOutput(output);
      session.mute(false);
      sessionRef.current = session;
      connectingRef.current = null;
      setConnected(true);
      setStatus("listening");
      return session;
    })();
    connectingRef.current = pending;
    try {
      return await pending;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to connect voice";
      const failedSession = sessionRef.current as RealtimeSession | null;
      failedSession?.close();
      sessionRef.current = null;
      releaseMedia();
      setConnected(false);
      setError(message);
      setStatus("error");
      connectingRef.current = null;
      throw cause;
    }
  }, [ensureAudioElement, monitorAshOutput, releaseMedia, startMeter]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    connectingRef.current = null;
    releaseMedia();
    setConnected(false);
    setStatus("idle");
    setError(null);
  }, [releaseMedia]);

  useEffect(() => () => {
    sessionRef.current?.close();
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    if (outputMeterProbeRef.current !== null) cancelAnimationFrame(outputMeterProbeRef.current);
    for (const channel of ["listener", "ash"] as const) {
      const meter = metersRef.current[channel];
      if (!meter) continue;
      window.clearInterval(meter.timer);
      meter.source.disconnect();
      meter.analyser.disconnect();
      void meter.context.close();
    }
    audioElementRef.current?.remove();
  }, []);

  return {
    status,
    levels: status === "speaking" ? ashLevels : status === "listening" ? listenerLevels : [],
    error,
    connected,
    connect,
    disconnect,
  };
}
