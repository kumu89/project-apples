"use client";

import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  DangerButton,
  GhostButton,
  OutlineButton,
  PrimaryButton,
} from "@/app/components/ui/Button";
import { IconCircle } from "@/app/components/ui/IconCircle";
import { resolveIconClass } from "@/lib/profile";

type PlayerSummary = {
  id: string;
  name: string;
  icon: string;
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
    playerIcon: string;
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
  const roomId = (rawRoomId ?? "").toString().replace(/\D/g, "").slice(0, 5);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [hand, setHand] = useState<HandCard[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notFoundReason, setNotFoundReason] = useState<"missing" | "deleted">(
    "missing",
  );
  const [kicked, setKicked] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef(0);
  const notFoundRef = useRef(0);
  const tapRef = useRef<{ id: string; time: number } | null>(null);

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
    setKicked(false);
  }, [roomId]);

  const fetchState = useCallback(async () => {
    if (!roomId || notFound || kicked) return;
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
  }, [roomId, notFound, playerToken, hostToken, state, kicked]);

  const fetchHand = useCallback(async (token: string) => {
    if (!roomId) return;
    try {
      const response = await fetch(`/api/hand?roomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          localStorage.removeItem(`apples:playerToken:${roomId}`);
          setKicked(true);
          return;
        }
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
      setFocusCardId(null);
      setVotedForId(null);
    }
  }, [state?.phase, playerToken, fetchHand]);

  const sortedPlayers = useMemo(() => {
    if (!state) return [];
    return [...state.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.joinedAt - b.joinedAt;
    });
  }, [state]);
  const isPlayerReady = (player: PlayerSummary) => {
    if (state?.phase === "SELECT") {
      return player.submitted;
    }
    if (state?.phase === "VOTING" || state?.phase === "RESULT") {
      return player.voted;
    }
    return false;
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
      <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-fuchsia-900 px-6 py-10 text-white">
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-3xl border border-white/30 bg-white/10 p-8 text-center shadow-xl backdrop-blur">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {notFoundReason === "deleted"
              ? "ルームが削除されました。"
              : "ルームが見つかりません。"}
          </h1>
          <p className="text-sm text-white/80">
            {notFoundReason === "deleted"
              ? "ホストがルームを削除しました。"
              : "ルームが期限切れか、IDが間違っている可能性があります。"}
          </p>
          <PrimaryButton onClick={() => router.push("/")} className="mt-2">
            ホームへ戻る
          </PrimaryButton>
        </main>
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-fuchsia-900 px-6 py-10 text-white">
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-3xl border border-white/30 bg-white/10 p-8 text-center shadow-xl backdrop-blur">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            ルームから退出させられました。
          </h1>
          <p className="text-sm text-white/80">
            ホストによってルームから削除されました。
          </p>
          <PrimaryButton onClick={() => router.push("/")} className="mt-2">
            ホームへ戻る
          </PrimaryButton>
        </main>
      </div>
    );
  }

  const isHost = Boolean(hostToken);
  const canSubmit = state?.phase === "SELECT" && !hasSubmitted && !busy;
  const canRevealPrompt =
    (state?.phase === "WAITING" || state?.phase === "RESULT") && !busy;
  const canVote =
    state?.phase === "VOTING" && !votedForId && !busy && Boolean(playerId);
  const phaseLabel =
    state?.phase === "WAITING"
      ? "待機中"
      : state?.phase === "SELECT"
        ? "手札選択中"
        : state?.phase === "VOTING"
          ? "投票中"
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
  const badgeType = state?.phase === "SELECT" ? "submit" : "vote";
  const displayError =
    error && /[A-Za-z]/.test(error) ? "エラーが発生しました。" : error;
  const isVotingPhase = state?.phase === "VOTING" || state?.phase === "RESULT";
  const visibleHand = hand.filter((card) => card.id !== selectedCardId);
  const selectedCard =
    hand.find((card) => card.id === selectedCardId) ?? null;

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
      setFocusCardId(null);
    } catch {
      setError("カードの提出に失敗しました。");
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

  const handleKick = async (targetPlayerId: string, name: string) => {
    if (!hostToken) return;
    const ok = window.confirm(
      `${name}をルームから退出させてもよいですか？`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room/kick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hostToken}`,
        },
        body: JSON.stringify({ roomId, targetPlayerId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "退出処理に失敗しました。");
      }
    } catch {
      setError("退出処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
    } catch {
      setError("ルームIDのコピーに失敗しました。");
    }
  };

  const handleCardTap = (cardId: string) => {
    if (!canSubmit) return;
    const now = Date.now();
    if (tapRef.current && tapRef.current.id === cardId) {
      if (now - tapRef.current.time < 350) {
        tapRef.current = null;
        handleSubmit(cardId);
        return;
      }
    }
    tapRef.current = { id: cardId, time: now };
    setFocusCardId(cardId);
  };

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    cardId: string,
  ) => {
    event.dataTransfer.setData("text/plain", cardId);
    setFocusCardId(cardId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const cardId = event.dataTransfer.getData("text/plain");
    if (cardId) {
      handleSubmit(cardId);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-fuchsia-900 px-4 py-6 text-white sm:px-6">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl border border-white/30 bg-white/10 p-5 shadow-xl backdrop-blur sm:p-6">
          <div className="lg:hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
              <div className="flex flex-col items-start gap-2">
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                  {isHost ? "ホスト" : "プレイヤー"}
                </span>
                {isHost ? (
                  <PrimaryButton
                    onClick={handleRevealPrompt}
                    disabled={!canRevealPrompt}
                    className="px-4 py-2 text-xs"
                  >
                    お題をめくる
                  </PrimaryButton>
                ) : null}
              </div>
              <div className="flex flex-col items-center text-center">
                <p className="text-[11px] font-semibold tracking-widest text-white/70">
                  ルームID
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-2xl font-semibold tracking-[0.25em]">
                    {roomId}
                  </span>
                  <GhostButton onClick={handleCopyRoomId}>コピー</GhostButton>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {isHost ? (
                  <>
                    <OutlineButton onClick={handleReset} disabled={busy}>
                      ゲームリセット
                    </OutlineButton>
                    <DangerButton onClick={handleDeleteRoom} disabled={busy}>
                      ルーム削除
                    </DangerButton>
                  </>
                ) : (
                  <OutlineButton onClick={handleLeaveRoom} disabled={busy}>
                    退出
                  </OutlineButton>
                )}
              </div>
            </div>
          </div>
          <div className="hidden lg:flex lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white/70">
                  ルームID
                </span>
                <span className="text-2xl font-semibold tracking-[0.25em]">
                  {roomId}
                </span>
                <GhostButton onClick={handleCopyRoomId}>コピー</GhostButton>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                  {isHost ? "ホスト" : "プレイヤー"}
                </span>
                {isHost ? (
                  <PrimaryButton
                    onClick={handleRevealPrompt}
                    disabled={!canRevealPrompt}
                    className="px-4 py-2 text-xs"
                  >
                    お題をめくる
                  </PrimaryButton>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isHost ? (
                <>
                  <OutlineButton onClick={handleReset} disabled={busy}>
                    ゲームリセット
                  </OutlineButton>
                  <DangerButton onClick={handleDeleteRoom} disabled={busy}>
                    ルーム削除
                  </DangerButton>
                </>
              ) : (
                <OutlineButton onClick={handleLeaveRoom} disabled={busy}>
                  退出
                </OutlineButton>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="order-1 rounded-3xl border border-white/30 bg-white/10 p-4 shadow-xl backdrop-blur lg:order-0 lg:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">メンバー</h2>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                {phaseLabel}
              </span>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
              {rankedPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`relative min-w-[110px] rounded-2xl border p-3 text-center ${
                    player.rank === 1
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-white/30 bg-white/95 text-zinc-900"
                  }`}
                >
                  <p className="text-xs font-semibold text-zinc-600">
                    {player.score}点
                  </p>
                  <div className="mt-2 flex items-center justify-center">
                    <IconCircle
                      className={resolveIconClass(player.icon)}
                      badge={isPlayerReady(player)}
                      badgeType={badgeType}
                    />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">
                    {player.name}
                  </p>
                  {isHost && player.id !== playerId ? (
                    <button
                      type="button"
                      onClick={() => handleKick(player.id, player.name)}
                      disabled={busy}
                      className="mt-2 w-full rounded-full border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 disabled:opacity-50"
                    >
                      退出させる
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="order-2 flex flex-col gap-6">
            <section className="rounded-3xl border border-white/30 bg-white/10 p-5 shadow-xl backdrop-blur">
              <div
                className={`rounded-3xl border-2 border-dashed border-indigo-200 bg-indigo-50/80 text-center font-semibold text-indigo-900 ${
                  isVotingPhase ? "p-4 text-sm sm:text-base" : "p-7 text-lg"
                }`}
              >
                {state?.prompt?.text ?? "ホストがお題をめくるまで待機中..."}
              </div>
            </section>

            <section className="rounded-3xl border border-white/30 bg-white/10 p-5 shadow-xl backdrop-blur">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`rounded-3xl border-2 border-dashed px-4 py-5 text-center text-sm font-semibold ${
                  canSubmit
                    ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                    : "border-white/30 bg-white/95 text-zinc-600"
                }`}
              >
                {isVotingPhase ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                    {(state?.revealedCards ?? []).map((card, index) =>
                      state?.phase === "VOTING" ? (
                        <button
                          type="button"
                          key={`${card.text}-${index}`}
                          onClick={() => handleVote(card.playerId)}
                          disabled={!canVote || card.playerId === playerId}
                          className={`rounded-2xl border bg-white p-3 text-left text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed ${
                            votedForId === card.playerId
                              ? "border-indigo-500 shadow-md"
                              : "border-slate-200"
                          } ${!canVote || card.playerId === playerId ? "opacity-60" : "hover:border-indigo-300"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-7 w-7 rounded-full ${resolveIconClass(card.playerIcon)}`}
                            />
                            <p className="text-[11px] text-zinc-500">
                              {card.playerName}
                              {card.playerId === playerId ? "（自分）" : ""}
                            </p>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-zinc-900">
                            {card.text}
                          </p>
                        </button>
                      ) : (
                        <div
                          key={`${card.text}-${index}`}
                          className={`rounded-2xl border bg-white p-3 text-left text-xs shadow-sm ${
                            maxVotes > 0 && card.voteCount === maxVotes
                              ? "border-amber-400 bg-amber-50 shadow-md"
                              : "border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-7 w-7 rounded-full ${resolveIconClass(card.playerIcon)}`}
                            />
                            <p className="text-[11px] text-zinc-500">
                              {card.playerName}
                              {card.playerId === playerId ? "（自分）" : ""}
                            </p>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-zinc-900">
                            {card.text}
                          </p>
                          <p className="mt-2 text-[11px] text-zinc-600">
                            得票: {card.voteCount ?? 0}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            投票者: {(card.voters ?? []).join("、") || "なし"}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : selectedCard ? (
                  <div className="mx-auto w-fit rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-base font-semibold text-zinc-900 shadow-sm">
                    {selectedCard.text}
                  </div>
                ) : canSubmit ? (
                  <p>ここにカードをドラッグするか、ダブルタップで提出</p>
                ) : (
                  <p>手札選択フェーズでカードをここに置きます</p>
                )}
              </div>
              {state?.phase === "VOTING" && votedForId ? (
                <p className="mt-3 text-sm font-semibold text-emerald-200">
                  投票済みです。全員の投票を待っています。
                </p>
              ) : null}
            </section>

            <section
              className={`rounded-3xl border border-white/30 bg-white/10 p-5 shadow-xl backdrop-blur ${
                isVotingPhase ? "hidden lg:block" : ""
              }`}
            >
              {!playerToken ? (
                <p className="text-sm text-white/80">
                  参加すると手札が配られます。
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-white/70">
                    ダブルタップで選択（ドラッグもOK）
                  </p>
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
                    {visibleHand.map((card) => (
                      <button
                        type="button"
                        key={card.id}
                        draggable={canSubmit}
                        onDragStart={(event) => handleDragStart(event, card.id)}
                        onClick={() => handleCardTap(card.id)}
                        disabled={!canSubmit}
                        className={`min-w-[200px] rounded-3xl border bg-white p-4 text-left text-sm font-semibold shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 disabled:cursor-not-allowed lg:min-w-0 ${
                          card.id === focusCardId
                            ? "border-fuchsia-400 ring-2 ring-fuchsia-200"
                            : "border-slate-200"
                        } ${!canSubmit ? "opacity-60" : ""}`}
                      >
                        {card.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {hasSubmitted ? (
                <p className="mt-3 text-sm font-semibold text-emerald-200">
                  提出済みです。ほかのプレイヤーを待っています。
                </p>
              ) : null}
            </section>
          </div>
        </section>

        {displayError ? (
          <div className="rounded-2xl border border-red-200 bg-white/95 px-4 py-3 text-sm font-semibold text-red-700 shadow-lg">
            {displayError}
          </div>
        ) : null}
      </main>
    </div>
  );
}

