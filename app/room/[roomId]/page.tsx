"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PlayerSummary = {
  id: string;
  name: string;
  submitted: boolean;
};

type RoomState = {
  roomId: string;
  phase: "WAITING" | "PROMPT" | "REVEALED";
  prompt: { id: string; text: string } | null;
  players: PlayerSummary[];
  submittedCount: number;
  playerCount: number;
  revealed: boolean;
  revealedCards?: Array<{ text: string; playerName: string; playerId: string }>;
};

type HandCard = {
  id: string;
  text: string;
};

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const rawRoomId =
    typeof params?.roomId === "string" ? params.roomId : params?.roomId?.[0];
  const roomId = (rawRoomId ?? "").toUpperCase();
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [hand, setHand] = useState<HandCard[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef(0);
  const notFoundRef = useRef(0);

  useEffect(() => {
    const storedPlayer = localStorage.getItem(
      `apples:playerToken:${roomId}`,
    );
    const storedHost = localStorage.getItem(`apples:hostToken:${roomId}`);
    setPlayerToken(storedPlayer);
    setHostToken(storedHost);
  }, [roomId]);

  useEffect(() => {
    setNotFound(false);
    retryRef.current = 0;
    notFoundRef.current = 0;
    setError(null);
  }, [roomId]);

  const fetchState = async () => {
    if (!roomId || notFound) return;
    try {
      const response = await fetch(`/api/room/state?roomId=${roomId}`);
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          notFoundRef.current += 1;
          const notFoundThreshold = playerToken || hostToken ? 8 : 3;
          if (notFoundRef.current < notFoundThreshold) {
            return;
          }
          setNotFound(true);
          setError(null);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          return;
        }
        retryRef.current += 1;
        if (retryRef.current <= 3) {
          return;
        }
        setError(data?.error ?? "ルームの取得に失敗しました。");
        return;
      }
      notFoundRef.current = 0;
      retryRef.current = 0;
      setState(data);
      setError(null);
    } catch {
      retryRef.current += 1;
      if (retryRef.current > 3) {
        setError("ルームの取得に失敗しました。");
      }
    }
  };

  const fetchHand = async (token: string) => {
    if (!roomId) return;
    try {
      const response = await fetch(`/api/hand?roomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "手札の取得に失敗しました。");
        return;
      }
      setHand(data.cards ?? []);
      setPlayerId(data.playerId ?? null);
      setError(null);
    } catch {
      setError("手札の取得に失敗しました。");
    }
  };

  useEffect(() => {
    if (!roomId || notFound) return;
    fetchState();
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    pollRef.current = setInterval(fetchState, 1000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [roomId, notFound, playerToken, hostToken]);

  useEffect(() => {
    if (playerToken) {
      fetchHand(playerToken);
    }
  }, [playerToken]);

  useEffect(() => {
    if (state?.phase === "WAITING" && playerToken) {
      fetchHand(playerToken);
      setSelectedCardId(null);
    }
  }, [state?.phase, playerToken]);

  const submittedCount = state?.submittedCount ?? 0;
  const totalPlayers = state?.playerCount ?? 0;
  const hasSubmitted = useMemo(() => {
    if (!state || !playerId) return false;
    return state.players.find((player) => player.id === playerId)?.submitted;
  }, [state, playerId]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-900">
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">ルームが見つかりません。</h1>
          <p className="text-sm text-zinc-600">
            ルームが期限切れか、IDが間違っている可能性があります。
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Homeに戻る
          </button>
        </main>
      </div>
    );
  }

  const isHost = Boolean(hostToken);
  const canSubmit = state?.phase === "PROMPT" && !hasSubmitted && !busy;
  const canRevealPrompt = state?.phase === "WAITING" && !busy;
  const canRevealSubmissions =
    state?.phase === "PROMPT" &&
    submittedCount > 0 &&
    submittedCount === totalPlayers &&
    !busy;
  const canNextRound = state?.phase === "REVEALED" && !busy;

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
        setError(data?.error ?? "お題をめくれませんでした。");
      }
    } catch {
      setError("お題をめくれませんでした。");
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
        setError(data?.error ?? "カードの提出に失敗しました。");
        return;
      }
      setSelectedCardId(cardId);
    } catch {
      setError("カードの提出に失敗しました。");
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
        setError(data?.error ?? "提出の公開に失敗しました。");
      }
    } catch {
      setError("提出の公開に失敗しました。");
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
        setError(data?.error ?? "次のラウンドに進めませんでした。");
      }
    } catch {
      setError("次のラウンドに進めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!hostToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "リセットに失敗しました。");
        return;
      }
      setSelectedCardId(null);
      if (playerToken) {
        fetchHand(playerToken);
      }
      fetchState();
    } catch {
      setError("リセットに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!hostToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "ルーム削除に失敗しました。");
        return;
      }
      localStorage.removeItem(`apples:playerToken:${roomId}`);
      localStorage.removeItem(`apples:hostToken:${roomId}`);
      router.push("/");
    } catch {
      setError("ルーム削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!playerToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${playerToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "ルーム退出に失敗しました。");
        return;
      }
      localStorage.removeItem(`apples:playerToken:${roomId}`);
      router.push("/");
    } catch {
      setError("ルーム退出に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
    } catch {
      setError("Room IDのコピーに失敗しました。");
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
                コピー
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              フェーズ: {state?.phase ?? "読み込み中"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1">
              提出: {submittedCount ?? 0}/{totalPlayers}
            </span>
            {isHost ? (
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-white">
                ホスト
              </span>
            ) : null}
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={busy}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  新しいゲーム
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRoom}
                  disabled={busy}
                  className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50"
                >
                  ルーム削除
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleLeaveRoom}
                disabled={busy}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold disabled:opacity-50"
              >
                ルーム退出
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">お題</h2>
              <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-lg">
                {state?.prompt?.text ?? "ホストがお題をめくるまで待機中..."}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">あなたの手札</h2>
              {!playerToken ? (
                <p className="mt-3 text-sm text-zinc-600">
                  参加すると手札が配られます。
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {hand.map((card) => (
                    <button
                      type="button"
                      key={card.id}
                      onClick={() => handleSubmit(card.id)}
                      disabled={!canSubmit}
                      className={`rounded-xl border bg-white p-4 text-left text-sm shadow-sm hover:border-zinc-400 disabled:cursor-not-allowed ${
                        card.id === selectedCardId
                          ? "border-zinc-900 shadow-lg"
                          : "border-zinc-200"
                      } ${!canSubmit && card.id !== selectedCardId ? "opacity-50" : ""}`}
                    >
                      {card.text}
                    </button>
                  ))}
                </div>
              )}
              {hasSubmitted ? (
                <p className="mt-3 text-sm text-green-600">
                  提出済みです。ほかのプレイヤーを待っています。
                </p>
              ) : null}
            </div>

            {state?.phase === "REVEALED" ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">公開されたカード</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(state.revealedCards ?? []).map((card, index) => (
                    <div
                      key={`${card.text}-${index}`}
                      className={`rounded-xl border p-4 text-sm ${
                        card.playerId === playerId
                          ? "border-zinc-900 bg-white shadow-md"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <p className="text-xs text-zinc-500">{card.playerName}</p>
                      <p className="mt-1 font-semibold text-zinc-900">
                        {card.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">プレイヤー</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {state?.players.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2"
                  >
                    <span>{player.name}</span>
                    <span className="text-xs text-zinc-500">
                      {player.submitted ? "提出済み" : "待機中"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {isHost ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">ホスト操作</h2>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleRevealPrompt}
                    disabled={!canRevealPrompt}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    お題をめくる
                  </button>
                  <button
                    type="button"
                    onClick={handleRevealSubmissions}
                    disabled={!canRevealSubmissions}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    提出を公開
                  </button>
                  <button
                    type="button"
                    onClick={handleNextRound}
                    disabled={!canNextRound}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    次のラウンド
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

