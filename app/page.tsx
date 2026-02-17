"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NAME_PLACEHOLDER = "Player name";

export default function Home() {
  const router = useRouter();
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to create room.");
        return;
      }
      localStorage.setItem(
        `apples:playerToken:${data.roomId}`,
        data.playerToken,
      );
      localStorage.setItem(
        `apples:hostToken:${data.roomId}`,
        data.hostToken,
      );
      router.push(`/room/${data.roomId}`);
    } catch {
      setError("Failed to create room.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: joinRoomId, name: joinName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to join room.");
        return;
      }
      localStorage.setItem(
        `apples:playerToken:${joinRoomId.toUpperCase()}`,
        data.playerToken,
      );
      router.push(`/room/${joinRoomId.toUpperCase()}`);
    } catch {
      setError("Failed to join room.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight">
            Apples to Apples MVP
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Create a room or join with a room ID.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Create Room</h2>
            <label className="mt-4 flex flex-col gap-2 text-sm">
              Your name
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={NAME_PLACEHOLDER}
                className="rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Create Room
            </button>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Join Room</h2>
            <label className="mt-4 flex flex-col gap-2 text-sm">
              Room ID
              <input
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value)}
                placeholder="ABC123"
                className="rounded-lg border border-zinc-300 px-3 py-2 uppercase"
              />
            </label>
            <label className="mt-4 flex flex-col gap-2 text-sm">
              Your name
              <input
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder={NAME_PLACEHOLDER}
                className="rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={handleJoin}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Join Room
            </button>
          </section>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </main>
    </div>
  );
}
