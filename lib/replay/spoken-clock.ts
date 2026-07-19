function ordinal(value: number): string {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function spokenClockLead(clockLabel: string): string {
  const normalized = clockLabel.trim();
  if (normalized === "HT") return "At half-time,";
  if (normalized === "FT") return "At full-time,";
  if (normalized === "00'" || normalized === "0'") return "At kick-off,";

  const range = normalized.match(/^(\d+)'[–-](\d+)'$/);
  if (range) {
    return `Between the ${ordinal(Number(range[1]))} and ${ordinal(Number(range[2]))} minutes,`;
  }

  const stoppage = normalized.match(/^(\d+)'\+(\d+)'$/);
  if (stoppage) {
    const base = Number(stoppage[1]);
    const added = Number(stoppage[2]);
    const period = base <= 45 ? "first-half" : base <= 90 ? "second-half" : "extra-time";
    return `In the ${ordinal(added)} minute of ${period} stoppage time,`;
  }

  const minute = normalized.match(/^(\d+)'$/);
  if (minute) return `In the ${ordinal(Number(minute[1]))} minute,`;

  return `At ${normalized},`;
}

function finishSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export function stripSpokenClockEcho(clockLabel: string, text: string): string {
  const normalized = clockLabel.trim();
  let cleaned = text.trim();
  if (normalized === "HT") {
    cleaned = cleaned
      .replace(/^(?:at\s+half[- ]time|half[- ]time|at\s+the\s+interval)\s*[:,;.–-]?\s*/i, "")
      .replace(/\s+(?:at\s+half[- ]time|at\s+the\s+interval)\.?$/i, "");
  } else if (normalized === "FT") {
    cleaned = cleaned
      .replace(/^(?:at\s+full[- ]time|full[- ]time)\s*[:,;.–-]?\s*/i, "")
      .replace(/\s+that\s+is\s+(?:the\s+)?full[- ]time\.?$/i, "");
  } else if (normalized === "00'" || normalized === "0'") {
    cleaned = cleaned.replace(/^at\s+kick[- ]off\s*[:,;.–-]?\s*/i, "");
  }
  return finishSentence(cleaned || text.trim());
}
