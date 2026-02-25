"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PlayerSummary = {
  id: string;
  name: string;
  submitted: boolean;
  joinedAt: number;
  score: number;
  voted: boolean;
};

type RoomState = {
  roomId: string;
  phase: "WAITING" | "SELECT" | "VOTING" | "RESULT";
  prompt: { id: string; text: string } | null;
  players: PlayerSummary[];
  submittedCount: number;
  playerCount: number;
  revealed: boolean;
  votesCount: number;
  voterCount: number;
  round: number;
  revealedCards?: Array<{
    text: string;
    playerName: string;
    playerId: string;
    voteCount?: number;
    voters?: string[];
  }>;
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
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notFoundReason, setNotFoundReason] = useState<"missing" | "deleted">(
    "missing",
  );
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
    setSelectedCardId(null);
    setVotedForId(null);
    setNotFoundReason("missing");
  }, [roomId]);

  const fetchState = useCallback(async () => {
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
          setNotFoundReason(state ? "deleted" : "missing");
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
  }, [roomId, notFound, playerToken, hostToken, state]);

  const fetchHand = useCallback(async (token: string) => {
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
  }, [roomId]);

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
  }, [roomId, notFound, playerToken, hostToken, fetchState]);

  useEffect(() => {
    if (playerToken) {
      fetchHand(playerToken);
    }
  }, [playerToken, fetchHand]);

  useEffect(() => {
    if ((state?.phase === "WAITING" || state?.phase === "SELECT") && playerToken) {
      fetchHand(playerToken);
      setSelectedCardId(null);
      setVotedForId(null);
    }
  }, [state?.phase, playerToken, fetchHand]);

  const submittedCount = state?.submittedCount ?? 0;
  const totalPlayers = state?.playerCount ?? 0;
  const sortedPlayers = useMemo(() => {
    if (!state) return [];
    return [...state.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.joinedAt - b.joinedAt;
    });
  }, [state]);
  const myName = useMemo(() => {
    if (!state || !playerId) return null;
    return state.players.find((player) => player.id === playerId)?.name ?? null;
  }, [state, playerId]);
  const statusForPlayer = (player: PlayerSummary) => {
    switch (state?.phase) {
      case "WAITING":
      case "RESULT":
        return "待機中";
      case "SELECT":
        return player.submitted ? "選択済み" : "選択中";
      case "VOTING":
        return player.voted ? "投票済み" : "投票中";
      default:
        return "待機中";
    }
  };
  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "待機中":
        return "bg-zinc-100 text-zinc-600";
      case "選択中":
        return "bg-amber-100 text-amber-700";
      case "選択済み":
        return "bg-emerald-100 text-emerald-700";
      case "投票中":
        return "bg-sky-100 text-sky-700";
      case "投票済み":
        return "bg-violet-100 text-violet-700";
      default:
        return "bg-zinc-100 text-zinc-600";
    }
  };
  const rankedPlayers = useMemo(() => {
    let currentRank = 0;
    let seen = 0;
    let lastScore: number | null = null;
    return sortedPlayers.map((player) => {
      seen += 1;
      if (lastScore === null || player.score !== lastScore) {
        currentRank = seen;
        lastScore = player.score;
      }
      return { ...player, rank: currentRank };
    });
  }, [sortedPlayers]);
  const hasSubmitted = useMemo(() => {
    if (!state || !playerId) return false;
    return state.players.find((player) => player.id === playerId)?.submitted;
  }, [state, playerId]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-900">
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">
            {notFoundReason === "deleted"
              ? "ルームが削除されました。"
              : "ルームが見つかりません。"}
          </h1>
          <p className="text-sm text-zinc-600">
            {notFoundReason === "deleted"
              ? "ホストがルームを削除しました。"
              : "ルームが期限切れか、IDが間違っている可能性があります。"}
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
  const canSubmit = state?.phase === "SELECT" && !hasSubmitted && !busy;
  const canRevealPrompt =
    (state?.phase === "WAITING" || state?.phase === "RESULT") && !busy;
  const canRevealSubmissions =
    state?.phase === "SELECT" &&
    submittedCount > 0 &&
    submittedCount === totalPlayers &&
    !busy;
  const canRevealResults =
    state?.phase === "VOTING" &&
    (state?.votesCount ?? 0) > 0 &&
    (state?.votesCount ?? 0) === (state?.voterCount ?? 0) &&
    !busy;
  const canVote =
    state?.phase === "VOTING" && !votedForId && !busy && Boolean(playerId);
  const phaseLabel =
    state?.phase === "WAITING"
      ? "待機中"
      : state?.phase === "SELECT"
        ? "手札選択"
        : state?.phase === "VOTING"
          ? "投票"
          : state?.phase === "RESULT"
            ? "結果発表"
            : "読み込み中";
  const maxVotes =
    state?.phase === "RESULT"
      ? Math.max(
          0,
          ...(state?.revealedCards ?? []).map(
            (card) => card.voteCount ?? 0,
          ),
        )
      : 0;

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

  const handleRevealResults = async () => {
    if (!hostToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/revealResults", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "結果発表に失敗しました。");
      }
    } catch {
      setError("結果発表に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (targetPlayerId: string) => {
    if (!playerToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${playerToken}`,
        },
        body: JSON.stringify({ roomId, targetPlayerId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "投票に失敗しました。");
        return;
      }
      setVotedForId(targetPlayerId);
    } catch {
      setError("投票に失敗しました。");
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
        <header className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
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
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-zinc-100 px-3 py-1">
                  フェーズ: {phaseLabel}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1">
                  ターン: {state?.round ?? 0}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1">
                  {state?.phase === "VOTING" || state?.phase === "RESULT"
                    ? `投票: ${state?.votesCount ?? 0}/${state?.voterCount ?? 0}`
                    : `選択: ${submittedCount ?? 0}/${totalPlayers}`}
                </span>
                {isHost ? (
                  <span className="rounded-full bg-zinc-900 px-3 py-1 text-white">
                    ホスト
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
              <span className="rounded-full border border-zinc-200 px-3 py-1">
                あなた: {myName ?? "未取得"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={busy}
                  className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-50"
                >
                  新しいゲーム
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRoom}
                  disabled={busy}
                  className="rounded-full border border-red-300 px-3 py-1 text-red-600 disabled:opacity-50"
                >
                  ルーム削除
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleLeaveRoom}
                disabled={busy}
                className="rounded-full border border-zinc-300 px-3 py-1 disabled:opacity-50"
              >
                ルーム退出
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">プレイヤー</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {rankedPlayers.map((player) => {
                  const status = statusForPlayer(player);
                  return (
                    <li
                      key={player.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        player.rank === 1
                          ? "border-amber-300 bg-amber-50"
                          : player.rank === 2
                            ? "border-zinc-200 bg-zinc-50"
                            : player.rank === 3
                              ? "border-zinc-200 bg-zinc-50"
                              : "border-zinc-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            player.rank === 1
                              ? "bg-amber-200 text-amber-900"
                              : player.rank === 2
                                ? "bg-zinc-200 text-zinc-700"
                                : player.rank === 3
                                  ? "bg-zinc-200 text-zinc-700"
                                  : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {player.rank}位
                        </span>
                        <span>{player.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}
                        >
                          {status}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-600">
                        {player.score}点
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

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

            {state?.phase === "VOTING" || state?.phase === "RESULT" ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">
                  {state?.phase === "VOTING" ? "投票" : "結果発表"}
                </h2>
                {state?.phase === "VOTING" ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    自分以外のカードをタップして投票してください。
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(state.revealedCards ?? []).map((card, index) => (
                    state.phase === "VOTING" ? (
                      <button
                        type="button"
                        key={`${card.text}-${index}`}
                        onClick={() => handleVote(card.playerId)}
                        disabled={!canVote || card.playerId === playerId}
                        className={`rounded-xl border p-4 text-left text-sm shadow-sm disabled:cursor-not-allowed ${
                          votedForId === card.playerId
                            ? "border-zinc-900 bg-white shadow-md"
                            : "border-zinc-200 bg-zinc-50"
                        } ${!canVote || card.playerId === playerId ? "opacity-60" : "hover:border-zinc-400"}`}
                      >
                        <p className="text-xs text-zinc-500">
                          {card.playerName}
                          {card.playerId === playerId ? "（自分）" : ""}
                        </p>
                        <p className="mt-1 font-semibold text-zinc-900">
                          {card.text}
                        </p>
                      </button>
                    ) : (
                      <div
                        key={`${card.text}-${index}`}
                        className={`rounded-xl border p-4 text-sm ${
                          maxVotes > 0 && card.voteCount === maxVotes
                            ? "border-amber-400 bg-amber-50 shadow-md"
                            : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <p className="text-xs text-zinc-500">
                          {card.playerName}
                          {card.playerId === playerId ? "（自分）" : ""}
                        </p>
                        <p className="mt-1 font-semibold text-zinc-900">
                          {card.text}
                        </p>
                        <p className="mt-2 text-xs text-zinc-600">
                          得票: {card.voteCount ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          投票者: {(card.voters ?? []).join("、") || "なし"}
                        </p>
                      </div>
                    )
                  ))}
                </div>
                {state?.phase === "VOTING" && votedForId ? (
                  <p className="mt-3 text-sm text-green-600">
                    投票済みです。結果発表を待っています。
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
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
                    次のお題をめくる
                  </button>
                  <button
                    type="button"
                    onClick={handleRevealSubmissions}
                    disabled={!canRevealSubmissions}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    カード公開
                  </button>
                  <button
                    type="button"
                    onClick={handleRevealResults}
                    disabled={!canRevealResults}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    結果発表
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

