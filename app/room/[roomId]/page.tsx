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
import { SectionCard } from "@/app/components/ui/SectionCard";
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
  const myIcon = useMemo(() => {
    if (!state || !playerId) return "blue";
    return state.players.find((player) => player.id === playerId)?.icon ?? "blue";
  }, [state, playerId]);
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
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-white/30 bg-white/10 p-5 shadow-xl backdrop-blur sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div className="flex flex-wrap items-center gap-3">
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
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                ルームID
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl font-semibold tracking-[0.25em]">
                  {roomId}
                </span>
                <GhostButton onClick={handleCopyRoomId}>コピー</GhostButton>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {isHost ? (
                <>
                  <OutlineButton onClick={handleReset} disabled={busy}>
                    リセット
                  </OutlineButton>
                  <DangerButton onClick={handleDeleteRoom} disabled={busy}>
                    削除
                  </DangerButton>
                </>
              ) : (
                <OutlineButton onClick={handleLeaveRoom} disabled={busy}>
                  退出
                </OutlineButton>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <IconCircle className={resolveIconClass(myIcon)} />
              <span className="text-sm font-semibold">
                あなた: {myName ?? "未取得"}
              </span>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
              フェーズ: {phaseLabel}
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
          <aside className="order-2 flex flex-col gap-6 lg:order-0 lg:sticky lg:top-6 lg:h-fit">
            <SectionCard title="プレイヤー" badge="ランキング">
              <div className="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
                {rankedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`min-w-[180px] rounded-2xl border px-3 py-2 ${
                      player.rank === 1
                        ? "border-amber-300 bg-amber-50"
                        : player.rank === 2
                          ? "border-slate-200 bg-slate-50"
                          : player.rank === 3
                            ? "border-slate-200 bg-slate-50"
                            : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <IconCircle
                        className={resolveIconClass(player.icon)}
                        badge={isPlayerReady(player)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {player.name}
                        </p>
                        <p className="text-xs font-semibold text-zinc-600">
                          {player.score}点
                        </p>
                      </div>
                      <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                        {player.rank}位
                      </span>
                    </div>
                    {isHost && player.id !== playerId ? (
                      <button
                        type="button"
                        onClick={() => handleKick(player.id, player.name)}
                        disabled={busy}
                        className="mt-2 rounded-full border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600 disabled:opacity-50"
                      >
                        退出させる
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="進行状況" badge="ステータス">
              <div className="grid gap-2 text-sm text-zinc-700">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-semibold">フェーズ</span>
                  <span className="font-semibold text-indigo-700">
                    {phaseLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-semibold">ラウンド</span>
                  <span className="font-semibold">{state?.round ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-semibold">
                    {isVotingPhase ? "投票数" : "選択数"}
                  </span>
                  <span className="font-semibold">
                    {isVotingPhase
                      ? `${state?.votesCount ?? 0}/${state?.voterCount ?? 0}`
                      : `${submittedCount ?? 0}/${totalPlayers}`}
                  </span>
                </div>
              </div>
            </SectionCard>
          </aside>

          <div className="order-1 flex flex-col gap-6">
            <SectionCard title="お題カード" badge="お題">
              <div
                className={`rounded-3xl border-2 border-dashed border-indigo-200 bg-indigo-50/70 text-center font-semibold text-indigo-900 ${
                  isVotingPhase ? "p-5 text-base" : "p-8 text-lg sm:text-xl"
                }`}
              >
                {state?.prompt?.text ?? "ホストがお題をめくるまで待機中..."}
              </div>
            </SectionCard>

            <SectionCard title="カード設置エリア" badge="選択">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`flex min-h-[140px] items-center justify-center rounded-3xl border-2 border-dashed px-6 text-center text-sm font-semibold ${
                  canSubmit
                    ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {selectedCard ? (
                  <div className="rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-base font-semibold text-zinc-900 shadow-sm">
                    {selectedCard.text}
                  </div>
                ) : canSubmit ? (
                  <p>ここにカードをドラッグするか、ダブルタップで提出</p>
                ) : (
                  <p>手札選択フェーズでカードをここに置きます</p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="あなたの手札"
              badge="カード"
              description="ダブルタップかドラッグで選択します。"
            >
              {!playerToken ? (
                <p className="text-sm text-zinc-600">
                  参加すると手札が配られます。
                </p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
                  {visibleHand.map((card) => (
                    <button
                      type="button"
                      key={card.id}
                      draggable={canSubmit}
                      onDragStart={(event) => handleDragStart(event, card.id)}
                      onClick={() => handleCardTap(card.id)}
                      disabled={!canSubmit}
                      className={`min-w-[200px] rounded-3xl border bg-white p-4 text-left text-sm font-semibold shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 disabled:cursor-not-allowed sm:min-w-0 ${
                        card.id === focusCardId
                          ? "border-fuchsia-400 ring-2 ring-fuchsia-200"
                          : "border-slate-200"
                      } ${!canSubmit ? "opacity-60" : ""}`}
                    >
                      {card.text}
                    </button>
                  ))}
                </div>
              )}
              {hasSubmitted ? (
                <p className="mt-3 text-sm font-semibold text-emerald-600">
                  提出済みです。ほかのプレイヤーを待っています。
                </p>
              ) : null}
            </SectionCard>

            {isVotingPhase ? (
              <SectionCard
                title={state?.phase === "VOTING" ? "投票" : "結果発表"}
                badge={state?.phase === "VOTING" ? "投票中" : "結果"}
                description={
                  state?.phase === "VOTING"
                    ? "自分以外のカードをタップして投票してください。"
                    : undefined
                }
              >
                <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
                  {(state.revealedCards ?? []).map((card, index) =>
                    state.phase === "VOTING" ? (
                      <button
                        type="button"
                        key={`${card.text}-${index}`}
                        onClick={() => handleVote(card.playerId)}
                        disabled={!canVote || card.playerId === playerId}
                        className={`min-w-[220px] rounded-3xl border bg-white p-4 text-left text-sm font-semibold shadow-sm transition hover:-translate-y-1 disabled:cursor-not-allowed sm:min-w-0 ${
                          votedForId === card.playerId
                            ? "border-indigo-500 shadow-md"
                            : "border-slate-200"
                        } ${!canVote || card.playerId === playerId ? "opacity-60" : "hover:border-indigo-300"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-8 w-8 rounded-full ${resolveIconClass(card.playerIcon)}`}
                          />
                          <p className="text-xs text-zinc-500">
                            {card.playerName}
                            {card.playerId === playerId ? "（自分）" : ""}
                          </p>
                        </div>
                        <p className="mt-2 text-base font-semibold text-zinc-900">
                          {card.text}
                        </p>
                      </button>
                    ) : (
                      <div
                        key={`${card.text}-${index}`}
                        className={`min-w-[220px] rounded-3xl border bg-white p-4 text-sm shadow-sm sm:min-w-0 ${
                          maxVotes > 0 && card.voteCount === maxVotes
                            ? "border-amber-400 bg-amber-50 shadow-md"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-8 w-8 rounded-full ${resolveIconClass(card.playerIcon)}`}
                          />
                          <p className="text-xs text-zinc-500">
                            {card.playerName}
                            {card.playerId === playerId ? "（自分）" : ""}
                          </p>
                        </div>
                        <p className="mt-2 text-base font-semibold text-zinc-900">
                          {card.text}
                        </p>
                        <p className="mt-2 text-xs text-zinc-600">
                          得票: {card.voteCount ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          投票者: {(card.voters ?? []).join("、") || "なし"}
                        </p>
                      </div>
                    ),
                  )}
                </div>
                {state?.phase === "VOTING" && votedForId ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-600">
                    投票済みです。結果発表を待っています。
                  </p>
                ) : null}
              </SectionCard>
            ) : null}
          </div>

          <aside className="order-3 flex flex-col gap-6 lg:sticky lg:top-6 lg:h-fit">
            <SectionCard
              title="プレイガイド"
              badge="ヒント"
              description="進行に合わせてカードを選びましょう。"
            >
              <div className="space-y-2 text-sm text-zinc-600">
                <p>お題が出たら手札を1枚選択します。</p>
                <p>全員が選択すると自動で投票が始まります。</p>
                <p>投票が揃うと結果発表に移ります。</p>
              </div>
            </SectionCard>
          </aside>
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

