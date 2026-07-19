"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MatrixMode = "idle" | "listening" | "thinking" | "speaking" | "error";

type MatrixProps = {
  rows?: number;
  cols?: number;
  levels?: number[];
  mode?: MatrixMode;
  ariaLabel?: string;
  className?: string;
};

function ambientLevels(cols: number, tick: number, mode: MatrixMode): number[] {
  if (mode === "error") return Array.from({ length: cols }, (_, index) => (index % 4 === 0 ? 0.9 : 0.12));
  const energy = mode === "thinking" ? 0.55 : mode === "speaking" ? 0.72 : 0.28;
  return Array.from({ length: cols }, (_, index) => {
    const primary = (Math.sin(tick * 0.07 + index * 0.66) + 1) / 2;
    const secondary = (Math.cos(tick * 0.035 - index * 0.31) + 1) / 2;
    return Math.min(1, 0.06 + (primary * 0.64 + secondary * 0.36) * energy);
  });
}

export function Matrix({
  rows = 8,
  cols = 20,
  levels,
  mode = "idle",
  ariaLabel = "The Quant voice activity display",
  className = "",
}: MatrixProps) {
  const frameRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (levels?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    const animate = (time: number) => {
      if (time - last > 65) {
        setTick((value) => value + 1);
        last = time;
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [levels]);

  const displayLevels = useMemo(
    () => (levels?.length ? levels.slice(0, cols) : ambientLevels(cols, tick, mode)),
    [cols, levels, mode, tick],
  );
  const cell = 10;
  const gap = 5;
  const width = cols * cell + (cols - 1) * gap;
  const height = rows * cell + (rows - 1) * gap;
  const cells = useMemo(
    () =>
      Array.from({ length: rows * cols }, (_, index) => ({
        row: Math.floor(index / cols),
        col: index % cols,
      })),
    [cols, rows],
  );

  return (
    <div className={`matrix matrix--${mode} ${className}`} role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        {cells.map(({ row, col }) => {
          const columnLevel = displayLevels[col] ?? 0;
          const threshold = 1 - (row + 1) / rows;
          const distance = columnLevel - threshold;
          const opacity = distance >= 0 ? Math.min(1, 0.52 + distance * 2.3) : 0.08;
          return (
            <circle
              key={`${row}-${col}`}
              cx={col * (cell + gap) + cell / 2}
              cy={row * (cell + gap) + cell / 2}
              r={cell / 2}
              style={{ opacity }}
            />
          );
        })}
      </svg>
    </div>
  );
}
