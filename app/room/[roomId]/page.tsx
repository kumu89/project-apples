"use client";

import { useEffect, useMemo, useState } from "react";

type PlayerSummary = {
  id: string;
  name: string;
  submitted: boolean;
};

type RoomState = {
  phase: "LOBBY" | "PROMPT" | "REVEALED";
  promptCard: { text: string } | null;
  players: PlayerSummary[];
  submissionsRevealed: boolean;
  revealedCards?: Array<{ text: string }>;
};

type HandCard = {
  id: string;
  text: string;
};

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId.toUpperCase();
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [hand, setHand] = useState<HandCard[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const storedPlayer = localStorage.getItem(
      `apples:playerToken:${roomId}`,
    );
    const storedHost = localStorage.getItem(`apples:hostToken:${roomId}`);
    setPlayerToken(storedPlayer);
    setHostToken(storedHost);
  }, [roomId]);

  const fetchState = async () => {
    try {
      const response = await fetch(`/api/room/state?roomId=${roomId}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to load room.");
        return;
      }
      setState(data);
      setError(null);
    } catch {
      setError("Failed to load room.");
    }
  };

  const fetchHand = async (token: string) => {
    try {
      const response = await fetch(`/api/hand?roomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to load hand.");
        return;
      }
      setHand(data.cards ?? []);
      setPlayerId(data.playerId ?? null);
      setError(null);
    } catch {
      setError("Failed to load hand.");
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [roomId]);

  useEffect(() => {
    if (playerToken) {
      fetchHand(playerToken);
    }
  }, [playerToken]);

  const submittedCount = state?.players.filter((player) => player.submitted)
    .length;
  const totalPlayers = state?.players.length ?? 0;
  const hasSubmitted = useMemo(() => {
    if (!state || !playerId) return false;
    return state.players.find((player) => player.id === playerId)?.submitted;
  }, [state, playerId]);

  const isHost = Boolean(hostToken);
  const canSubmit = state?.phase === "PROMPT" && !hasSubmitted && !busy;

  const handleRevealPrompt = async () => {
    if (!hostToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/revealPrompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to reveal prompt.");
      }
    } catch {
      setError("Failed to reveal prompt.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (cardId: string) => {
    if (!playerToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${playerToken}`,
        },
        body: JSON.stringify({ roomId, cardId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to submit card.");
      }
    } catch {
      setError("Failed to submit card.");
    } finally {
      setBusy(false);
    }
  };

  const handleRevealSubmissions = async () => {
    if (!hostToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/revealSubmissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to reveal submissions.");
      }
    } catch {
      setError("Failed to reveal submissions.");
    } finally {
      setBusy(false);
    }
  };

  const handleNextRound = async () => {
    if (!hostToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/nextRound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to start next round.");
      }
    } catch {
      setError("Failed to start next round.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
    } catch {
      setError("Failed to copy Room ID.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Room ID
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-2xl font-semibold">{roomId}</span>
              <button
                type="button"
                onClick={handleCopyRoomId}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Phase: {state?.phase ?? "Loading"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1">
              Submitted: {submittedCount ?? 0}/{totalPlayers}
            </span>
            {isHost ? (
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-white">
                Host
              </span>
            ) : null}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Prompt</h2>
              <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-lg">
                {state?.promptCard?.text ?? "Waiting for host to reveal..."}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Your Hand</h2>
              {!playerToken ? (
                <p className="mt-3 text-sm text-zinc-600">
                  Join the room to receive cards.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {hand.map((card) => (
                    <button
                      type="button"
                      key={card.id}
                      onClick={() => handleSubmit(card.id)}
                      disabled={!canSubmit}
                      className="rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm shadow-sm hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {card.text}
                    </button>
                  ))}
                </div>
              )}
              {hasSubmitted ? (
                <p className="mt-3 text-sm text-green-600">
                  Submitted! Waiting for others.
                </p>
              ) : null}
            </div>

            {state?.phase === "REVEALED" ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Revealed Cards</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(state.revealedCards ?? []).map((card, index) => (
                    <div
                      key={`${card.text}-${index}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm"
                    >
                      {card.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Players</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {state?.players.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2"
                  >
                    <span>{player.name}</span>
                    <span className="text-xs text-zinc-500">
                      {player.submitted ? "Submitted" : "Waiting"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {isHost ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Host Controls</h2>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleRevealPrompt}
                    disabled={busy}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Reveal Prompt
                  </button>
                  <button
                    type="button"
                    onClick={handleRevealSubmissions}
                    disabled={busy}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Reveal Submissions
                  </button>
                  <button
                    type="button"
                    onClick={handleNextRound}
                    disabled={busy}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Next Round
                  </button>
                </div>
              </div>
            ) : null}
          </aside>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </main>
    </div>
  );
}

