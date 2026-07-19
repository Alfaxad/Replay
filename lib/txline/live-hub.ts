import "server-only";

import {
  openTxlineStream,
  type TxlineStreamKind,
} from "@/lib/txline/client";

type Subscriber = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  lifetime: ReturnType<typeof setTimeout>;
};
type LiveChannel = {
  subscribers: Set<Subscriber>;
  abort?: AbortController;
  task?: Promise<void>;
  connected: boolean;
  reconnects: number;
};

const encoder = new TextEncoder();
const MAX_SUBSCRIBERS_PER_CHANNEL = 24;
const MAX_SUBSCRIBER_LIFETIME_MS = 15 * 60 * 1_000;
const globalStore = globalThis as typeof globalThis & {
  __rivalTxlineChannels?: Map<TxlineStreamKind, LiveChannel>;
};
const channels = globalStore.__rivalTxlineChannels ?? new Map<TxlineStreamKind, LiveChannel>();
globalStore.__rivalTxlineChannels = channels;

function channelFor(kind: TxlineStreamKind): LiveChannel {
  const existing = channels.get(kind);
  if (existing) return existing;
  const created: LiveChannel = {
    subscribers: new Set(),
    connected: false,
    reconnects: 0,
  };
  channels.set(kind, created);
  return created;
}

function statusFrame(kind: TxlineStreamKind, status: string): Uint8Array {
  return encoder.encode(
    `event: rival_status\ndata: ${JSON.stringify({ kind, status, at: new Date().toISOString() })}\n\n`,
  );
}

function broadcast(channel: LiveChannel, frame: Uint8Array) {
  for (const subscriber of channel.subscribers) {
    const { controller } = subscriber;
    try {
      if (controller.desiredSize !== null && controller.desiredSize <= 0) {
        controller.error(new Error("TxLINE stream reader is too slow"));
        clearTimeout(subscriber.lifetime);
        channel.subscribers.delete(subscriber);
        continue;
      }
      controller.enqueue(frame);
    } catch {
      clearTimeout(subscriber.lifetime);
      channel.subscribers.delete(subscriber);
    }
  }
  if (!channel.subscribers.size) channel.abort?.abort();
}

function waitForReconnect(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pump(kind: TxlineStreamKind, channel: LiveChannel) {
  while (channel.subscribers.size) {
    const abort = new AbortController();
    channel.abort = abort;
    try {
      broadcast(channel, statusFrame(kind, channel.reconnects ? "reconnecting" : "connecting"));
      const upstream = await openTxlineStream(kind, abort.signal);
      const reader = upstream.body!.getReader();
      channel.connected = true;
      broadcast(channel, statusFrame(kind, "connected"));
      while (channel.subscribers.size) {
        const { done, value } = await reader.read();
        if (done) break;
        broadcast(channel, value);
      }
      await reader.cancel();
    } catch (error) {
      if (!abort.signal.aborted) {
        broadcast(channel, statusFrame(kind, "retrying"));
      }
    } finally {
      channel.connected = false;
      channel.abort = undefined;
    }

    if (channel.subscribers.size) {
      channel.reconnects += 1;
      await waitForReconnect(Math.min(4_000, 500 * 2 ** Math.min(channel.reconnects, 3)));
    }
  }
  channel.task = undefined;
}

function ensurePump(kind: TxlineStreamKind, channel: LiveChannel) {
  if (!channel.task) channel.task = pump(kind, channel);
}

export function subscribeTxlineStream(kind: TxlineStreamKind): ReadableStream<Uint8Array> {
  const channel = channelFor(kind);
  let subscriber: Subscriber | undefined;

  if (channel.subscribers.size >= MAX_SUBSCRIBERS_PER_CHANNEL) {
    throw new Error("TxLINE stream subscriber limit reached");
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const lifetime = setTimeout(() => {
        if (!subscriber) return;
        channel.subscribers.delete(subscriber);
        try {
          controller.close();
        } catch {
          // The reader may already have disconnected.
        }
        if (!channel.subscribers.size) channel.abort?.abort();
      }, MAX_SUBSCRIBER_LIFETIME_MS);
      subscriber = { controller, lifetime };
      channel.subscribers.add(subscriber);
      controller.enqueue(statusFrame(kind, channel.connected ? "connected" : "queued"));
      ensurePump(kind, channel);
    },
    cancel() {
      if (subscriber) {
        clearTimeout(subscriber.lifetime);
        channel.subscribers.delete(subscriber);
      }
      if (!channel.subscribers.size) channel.abort?.abort();
    },
  });
}

export function txlineLiveStatus() {
  return (["scores", "odds"] as const).map((kind) => {
    const channel = channelFor(kind);
    return {
      kind,
      connected: channel.connected,
      subscribers: channel.subscribers.size,
      reconnects: channel.reconnects,
    };
  });
}
