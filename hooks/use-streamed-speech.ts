"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechState = "idle" | "loading" | "playing" | "error";
type SpeakOptions = { kind?: string; intensity?: number; rate?: number; audioUrl?: string };
type ScheduledChunk = {
  buffer: AudioBuffer;
  generation: number;
  offset: number;
  rate: number;
  source: AudioBufferSourceNode | null;
  startTime: number;
};

const PCM_SAMPLE_RATE = 24_000;

function joinBytes(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left);
  joined.set(right, left.length);
  return joined;
}

export function useStreamedSpeech() {
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<ScheduledChunk[]>([]);
  const nextStartRef = useRef(0);
  const rateRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>([]);

  const ensureContext = useCallback(async () => {
    if (!contextRef.current) {
      contextRef.current = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      const analyser = contextRef.current.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      analyser.connect(contextRef.current.destination);
      analyserRef.current = analyser;
    }
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
    return contextRef.current;
  }, []);

  const stopMeter = useCallback(() => {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    setLevels([]);
  }, []);

  const startMeter = useCallback((generation: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (meterFrameRef.current || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (generation !== generationRef.current) {
        meterFrameRef.current = null;
        return;
      }
      analyser.getByteFrequencyData(bins);
      setLevels(Array.from({ length: 21 }, (_, index) => {
        const start = Math.floor((index / 21) * bins.length);
        const end = Math.max(start + 1, Math.floor(((index + 1) / 21) * bins.length));
        let total = 0;
        for (let bin = start; bin < end; bin += 1) total += bins[bin] ?? 0;
        return Math.min(1, (total / (end - start) / 255) * 1.55);
      }));
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    meterFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const scheduleChunk = useCallback((chunk: ScheduledChunk, startTime: number, offset: number, rate: number) => {
    const context = contextRef.current;
    if (!context || offset >= chunk.buffer.duration) return startTime;
    const source = context.createBufferSource();
    source.buffer = chunk.buffer;
    source.playbackRate.value = rate;
    if (analyserRef.current) source.connect(analyserRef.current);
    else source.connect(context.destination);
    chunk.source = source;
    chunk.startTime = startTime;
    chunk.offset = offset;
    chunk.rate = rate;
    source.onended = () => {
      if (chunk.source !== source) return;
      chunk.source = null;
      chunksRef.current = chunksRef.current.filter((item) => item !== chunk);
    };
    source.start(startTime, offset);
    return startTime + (chunk.buffer.duration - offset) / rate;
  }, []);

  const setPlaybackRate = useCallback((value: number) => {
    const nextRate = Math.max(0.75, Math.min(1.5, value));
    rateRef.current = nextRate;
    const context = contextRef.current;
    if (!context || chunksRef.current.length === 0) return;

    const switchTime = context.currentTime + 0.018;
    const pending: Array<{ chunk: ScheduledChunk; offset: number }> = [];
    for (const chunk of chunksRef.current) {
      if (chunk.generation !== generationRef.current) continue;
      const source = chunk.source;
      if (!source) continue;
      const elapsed = Math.max(0, switchTime - chunk.startTime);
      const offset = chunk.startTime < switchTime ? chunk.offset + elapsed * chunk.rate : chunk.offset;
      try { source.stop(switchTime); } catch { /* The chunk may have completed at the switch boundary. */ }
      if (offset < chunk.buffer.duration - 0.001) pending.push({ chunk, offset });
    }

    chunksRef.current = pending.map(({ chunk }) => chunk);
    let cursor = switchTime;
    for (const { chunk, offset } of pending) cursor = scheduleChunk(chunk, cursor, offset, nextRate);
    nextStartRef.current = cursor;
  }, [scheduleChunk]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    for (const chunk of chunksRef.current) {
      try { chunk.source?.stop(); } catch { /* The source may already have ended. */ }
      chunk.source = null;
    }
    chunksRef.current = [];
    nextStartRef.current = 0;
    stopMeter();
    setState("idle");
  }, [stopMeter]);

  const speak = useCallback(async (text: string, options: SpeakOptions = {}) => {
    stop();
    if (!text.trim()) return false;

    const generation = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setState("loading");

    try {
      const context = await ensureContext();
      rateRef.current = Math.max(0.75, Math.min(1.5, options.rate ?? rateRef.current));

      if (options.audioUrl) {
        const cachedResponse = await fetch(options.audioUrl, { signal: controller.signal });
        if (!cachedResponse.ok) throw new Error("This cached Ash recording is unavailable");
        const audioBuffer = await context.decodeAudioData(await cachedResponse.arrayBuffer());
        if (generation !== generationRef.current) return false;
        const chunk: ScheduledChunk = {
          buffer: audioBuffer,
          generation,
          offset: 0,
          rate: rateRef.current,
          source: null,
          startTime: 0,
        };
        chunksRef.current.push(chunk);
        nextStartRef.current = scheduleChunk(chunk, context.currentTime + 0.045, 0, rateRef.current);
        startMeter(generation);
        setState("playing");
        await new Promise<void>((resolve) => {
          const waitForPlayback = () => {
            if (generation !== generationRef.current || chunksRef.current.length === 0) {
              resolve();
              return;
            }
            window.setTimeout(waitForPlayback, 40);
          };
          waitForPlayback();
        });
        if (generation === generationRef.current) {
          abortRef.current = null;
          stopMeter();
          setState("idle");
          return true;
        }
        return false;
      }

      const response = await fetch("/api/openai/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind: options.kind, intensity: options.intensity }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Ash narration is unavailable");
      }

      const reader = response.body.getReader();
      let pending = new Uint8Array(0);
      nextStartRef.current = context.currentTime + 0.08;
      let scheduled = false;

      const schedule = (bytes: Uint8Array) => {
        const usableLength = bytes.length - (bytes.length % 2);
        if (!usableLength || generation !== generationRef.current) return;
        const samples = usableLength / 2;
        const audioBuffer = context.createBuffer(1, samples, PCM_SAMPLE_RATE);
        const channel = audioBuffer.getChannelData(0);
        const view = new DataView(bytes.buffer, bytes.byteOffset, usableLength);
        for (let index = 0; index < samples; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;

        const chunk: ScheduledChunk = {
          buffer: audioBuffer,
          generation,
          offset: 0,
          rate: rateRef.current,
          source: null,
          startTime: 0,
        };
        chunksRef.current.push(chunk);
        const startTime = Math.max(nextStartRef.current, context.currentTime + 0.035);
        nextStartRef.current = scheduleChunk(chunk, startTime, 0, rateRef.current);
        if (!scheduled) {
          scheduled = true;
          startMeter(generation);
          setState("playing");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (generation !== generationRef.current) return false;
        if (value?.length) pending = joinBytes(pending, value);
        if (pending.length >= 4_800 || (done && pending.length)) {
          const usableLength = pending.length - (pending.length % 2);
          schedule(pending.subarray(0, usableLength));
          pending = pending.slice(usableLength);
        }
        if (done) break;
      }

      await new Promise<void>((resolve) => {
        const waitForPlayback = () => {
          if (generation !== generationRef.current || chunksRef.current.length === 0) {
            resolve();
            return;
          }
          window.setTimeout(waitForPlayback, 40);
        };
        waitForPlayback();
      });
      if (generation === generationRef.current) {
        abortRef.current = null;
        stopMeter();
        setState("idle");
        return true;
      }
      return false;
    } catch (cause) {
      if (controller.signal.aborted) return false;
      setError(cause instanceof Error ? cause.message : "Unable to play Ash narration");
      setState("error");
      return false;
    }
  }, [ensureContext, scheduleChunk, startMeter, stop, stopMeter]);

  useEffect(() => () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    for (const chunk of chunksRef.current) {
      try { chunk.source?.stop(); } catch { /* The source may already have ended. */ }
      chunk.source = null;
    }
    chunksRef.current = [];
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    void contextRef.current?.close();
  }, []);

  return { state, levels, error, speak, stop, setPlaybackRate, unlock: ensureContext };
}
