"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import {
  SCHEDULE_HOURS,
  defaultScheduleTime,
  lagosParts,
  lagosTime,
  scheduleDays,
  scheduleProblem,
  scheduleWhen,
  type ScheduledPublish,
} from "@shared/store-editor";

// "Schedule for later" next to Publish in the web builder: the phone's Publish sheet (design SE-13) on the computer.
// Same API and rules (GET/POST/DELETE /api/store/editor/schedule → src/lib/store-editor/scheduled-publish.server.ts):
// the draft as saved now goes live at a day and time (Lagos time); one publish waits per store (again: reschedule);
// Publish now replaces a waiting one (publishStoreDraft supersedes it on the server, so we just read it again).

const ENDPOINT = "/api/store/editor/schedule";
const HALF_HOURS = SCHEDULE_HOURS.flatMap((hour) => [{ hour, minute: 0 }, { hour, minute: 30 }]);

class ScheduleRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(ENDPOINT, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || !json?.data) throw new ScheduleRequestError(json?.error?.message ?? "", response.status);
  return json.data;
}

/** The publish waiting for this store (if any), and scheduling, rescheduling and cancelling it. */
export function useScheduledPublish(enabled: boolean) {
  const [scheduled, setScheduled] = useState<ScheduledPublish | null>(null);
  const refresh = useCallback(async () => {
    try {
      const data = await call<{ scheduled: ScheduledPublish | null }>("GET");
      setScheduled(data.scheduled);
    } catch {
      // Not there yet (no table, signed out): the button still offers to schedule.
    }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  const schedule = useCallback(async (at: Date, version: string | null) => {
    const data = await call<{ scheduled: ScheduledPublish }>("POST", { at: at.toISOString(), version });
    setScheduled(data.scheduled);
    return data.scheduled;
  }, []);
  const cancel = useCallback(async () => {
    await call<{ cancelled: boolean }>("DELETE");
    setScheduled(null);
  }, []);
  return { scheduled, refresh, schedule, cancel };
}

export type ScheduledPublishState = ReturnType<typeof useScheduledPublish>;

/** "Sat 9:00", "Today 18:30", "Tomorrow 9:00" (Lagos time) in the seller's language, as on the phone. */
function useScheduleWords() {
  const t = useT("storeEditor");
  return useCallback(
    (at: Date | string, now = new Date()) => {
      const when = scheduleWhen(at, now);
      const day = when.day === "today" ? t("day.today") : when.day === "tomorrow" ? t("day.tomorrow") : t.dynamic(`day.${when.weekday}`, "");
      return when.day === "date" ? t("schedule.whenDate", { day, date: when.date, month: when.month + 1, time: when.time }) : t("schedule.when", { day, time: when.time });
    },
    [t],
  );
}

/**
 * The clock next to Publish, or "Scheduled for Sat 9:00" once a publish waits (Change time / Cancel). `save` saves
 * the latest edits first and gives the draft's version (null: it couldn't be saved), so what goes live is exactly
 * what the seller sees.
 */
export function ScheduleControl({
  state,
  save,
  draftVersion,
  disabled,
  compact,
  onMessage,
}: {
  state: ScheduledPublishState;
  save: () => Promise<string | null>;
  /** The draft's save stamp now (to tell when it changed after scheduling). */
  draftVersion: string | null;
  disabled: boolean;
  /** Narrow screens: the chip shows just the clock and the time. */
  compact?: boolean;
  onMessage: (message: string, tone?: "ok" | "error") => void;
}) {
  const t = useT("storeEditor");
  const when = useScheduleWords();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { scheduled } = state;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setProblem(null);
    setPicking(!scheduled);
    setOpen((now) => !now);
  };

  async function cancel() {
    setBusy(true);
    setProblem(null);
    try {
      await state.cancel();
      setOpen(false);
      onMessage(t("schedule.cancelled"));
    } catch (error) {
      setProblem(error instanceof Error && error.message ? error.message : t("schedule.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(at: Date) {
    setBusy(true);
    setProblem(null);
    try {
      const version = await save();
      if (version === null) throw new ScheduleRequestError(t("schedule.failed"), 0);
      const next = await state.schedule(at, version || null);
      setOpen(false);
      setPicking(false);
      onMessage(t("schedule.done", { when: when(next.runAt) }));
    } catch (error) {
      setProblem(error instanceof ScheduleRequestError && error.status === 409 ? t("conflict.body") : error instanceof Error && error.message ? error.message : t("schedule.failed"));
    } finally {
      setBusy(false);
    }
  }

  const changedSince = Boolean(scheduled && draftVersion && scheduled.draftVersion && draftVersion !== scheduled.draftVersion);
  const label = scheduled ? t("schedule.badge", { when: when(scheduled.runAt) }) : t("schedule.button");
  return (
    <div ref={ref} className="relative shrink-0">
      {scheduled ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={label}
          aria-label={label}
          className="inline-flex min-h-10 max-w-[230px] items-center gap-1.5 rounded-full bg-[#FFF3DC] px-3 text-[13px] font-bold text-[#8A5A00] transition hover:bg-[#FCE9C2]"
        >
          <Icon name="clock" size={15} />
          <span className="truncate">{compact ? when(scheduled.runAt) : label}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={label}
          aria-label={label}
          className="inline-grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-ink transition hover:border-app-line-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="clock" size={17} />
        </button>
      )}
      {open ? (
        <div role="dialog" aria-label={scheduled && !picking ? label : t("schedule.title")} className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-24px))] rounded-[16px] border border-app-line bg-white p-4 shadow-[0_18px_50px_rgba(22,20,31,.16)]">
          {scheduled && !picking ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2 text-[14.5px] font-bold text-app-ink">
                <Icon name="clock" size={17} />
                <span className="min-w-0 flex-1">{label}</span>
              </div>
              {changedSince ? <p className="text-[13px] leading-5 text-app-ink-soft">{t("schedule.changed")}</p> : null}
              {problem ? <p role="alert" className="text-[13px] text-app-danger">{problem}</p> : null}
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setPicking(true)} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full border border-app-line bg-white px-3 text-[13.5px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-50">{t("schedule.reschedule")}</button>
                <button type="button" disabled={busy} onClick={() => void cancel()} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full border border-app-line bg-white px-3 text-[13.5px] font-bold text-app-danger hover:border-app-line-strong disabled:opacity-50">{t("schedule.cancel")}</button>
              </div>
            </div>
          ) : (
            <SchedulePicker initial={scheduled ? new Date(scheduled.runAt) : null} busy={busy} problem={problem} onBack={scheduled ? () => setPicking(false) : undefined} onConfirm={(at) => void confirm(at)} />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A day (today and the next week) and a time (6:00 to 23:30), Lagos time, as the phone's picker. */
function SchedulePicker({ initial, busy, problem, onBack, onConfirm }: { initial: Date | null; busy: boolean; problem: string | null; onBack?: () => void; onConfirm: (at: Date) => void }) {
  const t = useT("storeEditor");
  const when = useScheduleWords();
  const [now] = useState(() => new Date());
  const days = useMemo(() => scheduleDays(now, 8), [now]);
  const start = initial && !scheduleProblem(initial, now) ? initial : defaultScheduleTime(now);
  const startParts = lagosParts(start);
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex((day) => day.year === startParts.year && day.month === startParts.month && day.day === startParts.day)));
  const [time, setTime] = useState({ hour: startParts.hour, minute: startParts.minute >= 30 ? 30 : 0 });
  const day = days[dayIndex] ?? days[0]!;
  const at = lagosTime(day.year, day.month, day.day, time.hour, time.minute);
  const wrong = scheduleProblem(at, new Date());
  const times = HALF_HOURS.filter((entry) => !scheduleProblem(lagosTime(day.year, day.month, day.day, entry.hour, entry.minute), now));
  const dayName = (entry: (typeof days)[number]) => (entry.offset === 0 ? t("day.today") : entry.offset === 1 ? t("day.tomorrow") : t.dynamic(`day.${entry.weekday}`, ""));
  const clock = (entry: { hour: number; minute: number }) => `${entry.hour}:${String(entry.minute).padStart(2, "0")}`;

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label={t("schedule.back")} title={t("schedule.back")} className="grid h-8 w-8 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink">
            <Icon name="arrowLeft" size={15} />
          </button>
        ) : null}
        <h3 className="text-[15px] font-bold text-app-ink">{t("schedule.title")}</h3>
      </div>
      <p className="text-[13px] leading-5 text-app-ink-soft">{t("schedule.body")}</p>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12.5px] font-bold text-app-ink-soft">{t("schedule.day")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {days.map((entry, index) => (
            <button
              key={entry.offset}
              type="button"
              aria-pressed={index === dayIndex}
              onClick={() => setDayIndex(index)}
              className={cx("min-h-8 rounded-full border px-3 text-[13px] font-semibold", index === dayIndex ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {entry.offset > 1 ? `${dayName(entry)} ${entry.day}` : dayName(entry)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1.5">
        <span className="text-[12.5px] font-bold text-app-ink-soft">{t("schedule.time")}</span>
        <select
          value={clock(time)}
          onChange={(event) => {
            const [hour, minute] = event.target.value.split(":").map(Number);
            setTime({ hour: hour ?? 9, minute: minute ?? 0 });
          }}
          className="h-10 w-full rounded-[10px] border border-app-line bg-white px-3 text-[14px] text-app-ink outline-none focus:border-[#2F66F6]"
        >
          {times.some((entry) => entry.hour === time.hour && entry.minute === time.minute) ? null : <option value={clock(time)}>{clock(time)}</option>}
          {times.map((entry) => (
            <option key={clock(entry)} value={clock(entry)}>{clock(entry)}</option>
          ))}
        </select>
      </label>
      <p className="flex items-start gap-2 text-[12.5px] leading-5 text-app-ink-soft">
        <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
        <span>{t("schedule.note")}</span>
      </p>
      {wrong ? <p role="alert" className="text-[13px] text-app-danger">{t("schedule.tooSoon")}</p> : null}
      {problem ? <p role="alert" className="text-[13px] text-app-danger">{problem}</p> : null}
      <button
        type="button"
        disabled={busy || Boolean(wrong)}
        onClick={() => onConfirm(at)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-app-ink px-4 text-[14px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="clock" size={16} />
        {busy ? t("schedule.scheduling") : t("schedule.confirm", { when: when(at) })}
      </button>
    </div>
  );
}
