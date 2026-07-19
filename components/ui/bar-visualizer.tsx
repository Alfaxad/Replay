"use client";

import { type HTMLAttributes, useEffect, useMemo, useState } from "react";

export type AgentState = "idle" | "connecting" | "initializing" | "listening" | "speaking" | "thinking";

export type BarVisualizerProps = HTMLAttributes<HTMLDivElement> & {
  state: AgentState;
  barCount?: number;
  levels?: number[];
  minHeight?: number;
  maxHeight?: number;
  demo?: boolean;
  centerAlign?: boolean;
};

export function useBarAnimator(state: AgentState, columns: number, interval = 92) {
  const [frame, setFrame] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (state === "idle" || reduceMotion) return;
    const timer = window.setInterval(() => setFrame((value) => value + 1), interval);
    return () => window.clearInterval(timer);
  }, [interval, reduceMotion, state]);
  return useMemo(() => Array.from({ length: columns }, (_, index) => {
    if (state === "idle") return 0.12;
    if (reduceMotion) return state === "listening" ? 0.34 : state === "thinking" ? 0.28 : 0.42;
    if (state === "connecting" || state === "initializing") return index === frame % columns ? 0.86 : 0.16;
    if (state === "thinking") return 0.18 + Math.max(0, Math.sin((index + frame) * 0.72)) * 0.42;
    if (state === "listening") return 0.2 + Math.abs(Math.sin(index * 0.55 + frame * 0.32)) * 0.45;
    return 0.22 + Math.abs(Math.sin(index * 0.73 + frame * 0.45)) * 0.68;
  }), [columns, frame, reduceMotion, state]);
}

export function BarVisualizer({
  state,
  barCount = 21,
  levels = [],
  minHeight = 12,
  maxHeight = 100,
  demo = false,
  centerAlign = true,
  className = "",
  ...props
}: BarVisualizerProps) {
  const animated = useBarAnimator(state, barCount);
  const values = Array.from({ length: barCount }, (_, index) => {
    const measured = levels.length ? levels[index % levels.length] : undefined;
    const normalized = measured ?? (demo || state !== "idle" ? animated[index] : 0.12);
    return Math.max(0, Math.min(1, normalized));
  });

  return (
    <div className={`bar-visualizer ${centerAlign ? "bar-visualizer--center" : ""} ${className}`} data-state={state} role="img" aria-label={`Audio visualizer: ${state}`} {...props}>
      {values.map((value, index) => {
        const height = minHeight + value * (maxHeight - minHeight);
        const scale = (height / 100).toFixed(6);
        return <i key={index} style={{ transform: `scaleY(${scale})` }} />;
      })}
    </div>
  );
}
