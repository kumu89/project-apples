"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import {
  OutlineButton,
  PrimaryButton,
} from "@/app/components/ui/Button";
import { IconCircle } from "@/app/components/ui/IconCircle";
import {
  DEFAULT_PROFILE,
  PROFILE_ICONS,
  resolveIconClass,
  type Profile,
} from "@/lib/profile";

const PROFILE_KEY = "wordcrush:profile";

const normalizeRoomIdInput = (value: string) =>
  value.replace(/\D/g, "").slice(0, 5);

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<Profile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const displayError =
    error && /[A-Za-z]/.test(error) ? "エラーが発生しました。" : error;

  useEffect(() => {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Profile;
      if (parsed?.name && parsed?.icon) {
        setProfile(parsed);
        setProfileDraft(parsed);
      }
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }
  }, []);

  const openProfile = () => {
    setProfileDraft(profile);
    setProfileError(null);
    setProfileOpen(true);
  };

  const saveProfile = () => {
    const trimmed = profileDraft.name.trim();
    if (!trimmed) {
      setProfileError("名前を入力してください。");
      return;
    }
    const next = { ...profileDraft, name: trimmed.slice(0, 24) };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    setProfile(next);
    setProfileOpen(false);
  };

  const handleCreate = async () => {
    if (!profile.name.trim()) {
      setProfileError("名前を入力してください。");
      setProfileOpen(true);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, icon: profile.icon }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "ルーム作成に失敗しました。");
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
      setError("ルーム作成に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const normalizedRoomId = normalizeRoomIdInput(joinRoomId);
    if (normalizedRoomId.length !== 5) {
      setJoinError("5桁のルームIDを入力してください。");
      return;
    }
    if (!profile.name.trim()) {
      setProfileError("名前を入力してください。");
      setProfileOpen(true);
      return;
    }
    setError(null);
    setJoinError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: normalizedRoomId,
          name: profile.name,
          icon: profile.icon,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setJoinError(data?.error ?? "ルーム参加に失敗しました。");
        return;
      }
      localStorage.setItem(
        `apples:playerToken:${normalizedRoomId}`,
        data.playerToken,
      );
      router.push(`/room/${normalizedRoomId}`);
    } catch {
      setJoinError("ルーム参加に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-600 via-fuchsia-600 to-amber-400 px-5 py-10 text-white sm:px-8">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between rounded-3xl border border-white/30 bg-white/10 px-4 py-3 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <IconCircle className={resolveIconClass(profile.icon)} />
            <div>
              <p className="text-xs font-semibold text-white/70">プロフィール</p>
              <p className="text-sm font-semibold">{profile.name}</p>
            </div>
          </div>
          <OutlineButton
            onClick={openProfile}
            className="border-white/40 bg-white/15 text-white hover:border-white/70"
          >
            プロフィール編集
          </OutlineButton>
        </header>

        <div className="rounded-3xl border border-white/30 bg-white/15 p-8 text-center shadow-xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            ワードクラッシュ
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            ワードクラッシュ
          </h1>
          <p className="mt-3 text-sm text-white/90 sm:text-base">
            ルームを作成して、みんなでカードバトルを始めましょう。
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <PrimaryButton
            onClick={handleCreate}
            disabled={busy}
            className="w-full text-base"
          >
            新規ルーム作成
          </PrimaryButton>
          <OutlineButton
            onClick={() => {
              setJoinRoomId("");
              setJoinError(null);
              setJoinOpen(true);
            }}
            disabled={busy}
            className="w-full border-white/50 bg-white/10 text-white hover:border-white/80"
          >
            友達のルームに入る
          </OutlineButton>
        </div>

        {displayError ? (
          <div className="rounded-2xl border border-red-200 bg-white/95 px-4 py-3 text-sm font-semibold text-red-700 shadow-lg">
            {displayError}
          </div>
        ) : null}
      </main>

      <Modal
        open={profileOpen}
        title="プロフィール編集"
        description="名前とアイコンを設定してください。"
        onClose={() => setProfileOpen(false)}
      >
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            名前
            <input
              value={profileDraft.name}
              onChange={(event) =>
                setProfileDraft((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="プレイヤー名"
              className="rounded-xl border border-zinc-200 px-4 py-3 text-base shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-semibold">アイコン</p>
            <div className="grid grid-cols-4 gap-3">
              {PROFILE_ICONS.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() =>
                    setProfileDraft((prev) => ({ ...prev, icon: icon.id }))
                  }
                  className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${
                    profileDraft.icon === icon.id
                      ? "border-indigo-500"
                      : "border-transparent"
                  }`}
                >
                  <span
                    className={`h-10 w-10 rounded-full ${icon.className}`}
                  />
                </button>
              ))}
            </div>
          </div>
          {profileError ? (
            <p className="text-sm font-semibold text-red-600">{profileError}</p>
          ) : null}
          <div className="flex gap-3">
            <OutlineButton
              onClick={() => setProfileOpen(false)}
              className="flex-1"
            >
              キャンセル
            </OutlineButton>
            <PrimaryButton onClick={saveProfile} className="flex-1">
              保存する
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={joinOpen}
        title="ルームに参加"
        description="5桁のルームIDを入力してください。"
        onClose={() => setJoinOpen(false)}
      >
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            ルームID
            <input
              value={joinRoomId}
              onChange={(event) =>
                setJoinRoomId(normalizeRoomIdInput(event.target.value))
              }
              placeholder="12345"
              inputMode="numeric"
              pattern="[0-9]*"
              className="rounded-xl border border-zinc-200 px-4 py-3 text-base shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>
          {joinError ? (
            <p className="text-sm font-semibold text-red-600">{joinError}</p>
          ) : null}
          <div className="flex gap-3">
            <OutlineButton
              onClick={() => setJoinOpen(false)}
              className="flex-1"
            >
              キャンセル
            </OutlineButton>
            <PrimaryButton onClick={handleJoin} className="flex-1">
              OK
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
