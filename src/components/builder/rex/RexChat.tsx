"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Mascot, MicIcon, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { transcribe } from "@/components/onboarding/seller/api";
import { REX_STARTERS } from "@/lib/ai/rex/starters";
import { uploadStudioPhoto } from "./api";
import { RexCardView, type RexCardHandlers } from "./RexCards";
import type { ChatMessage } from "./types";

const MAX_PHOTOS = 4;

function RexAvatar() {
  return <Mascot name="rex" alt="" className="mt-0.5 h-8 w-8 shrink-0" />;
}

/**
 * The Rex Studio conversation. Wide (preview closed) it reads like Peggy's page: a centred column with the
 * starter cards; narrow (preview open beside it) it is a side chat.
 */
export function RexChat({
  messages,
  busy,
  busyLabel,
  chips,
  wide,
  disabledReason,
  initialText,
  onSend,
  onUndo,
  onOpenPreview,
  undoingId,
}: {
  messages: ChatMessage[];
  busy: boolean;
  busyLabel: string;
  chips: string[];
  /** True when the chat has the whole width (no preview beside it). */
  wide: boolean;
  /** Set when Rex can't take requests (AI not configured); the composer explains instead. */
  disabledReason: string | null;
  initialText?: string;
  onSend: (text: string, imageUrls: string[]) => Promise<void> | void;
  onUndo: (undoTo: string) => Promise<boolean>;
  onOpenPreview: (page: string | null) => void;
  undoingId: string | null;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!initialText) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [initialText]);

  const blocked = busy || Boolean(disabledReason);
  const fresh = !messages.some((message) => message.role === "seller");
  const handlers: RexCardHandlers = { onAsk: (prompt) => void onSend(prompt, []), onOpenPreview, onUndo, busy: blocked };
  const column = wide ? "mx-auto w-full max-w-[880px]" : "w-full";

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message || blocked || uploading) return;
    setText("");
    const attached = photos;
    setPhotos([]);
    setNote(null);
    await onSend(message, attached);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setNote(`Up to ${MAX_PHOTOS} photos per message.`);
      return;
    }
    setUploading(true);
    setNote(null);
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const url = await uploadStudioPhoto(file);
        setPhotos((prev) => [...prev, url]);
      }
      if (!text.trim()) setText("Make this photo brighter on a clean white background");
      inputRef.current?.focus();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That photo didn't upload.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addLink(event: FormEvent) {
    event.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setNote("Paste a full link that starts with https://");
      return;
    }
    setText((prev) => `${prev.trim() ? `${prev.trim()} ` : ""}${url}`);
    setLink("");
    setLinkOpen(false);
    setNote(null);
    inputRef.current?.focus();
  }

  async function toggleMic() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNote("Voice notes don't work in this browser. Type it instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setTranscribing(true);
        try {
          const heard = await transcribe(new Blob(chunks, { type: "audio/webm" }));
          if (heard) setText((prev) => `${prev.trim() ? `${prev.trim()} ` : ""}${heard}`);
          else setNote("Rex didn't catch that. Try again or type it.");
        } catch (error) {
          setNote(error instanceof Error ? error.message : "Rex couldn't hear that.");
        } finally {
          setTranscribing(false);
          inputRef.current?.focus();
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setNote(null);
    } catch {
      setNote("Allow the microphone to talk to Rex, or type instead.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite" aria-label="Chat with Rex">
        <div className={cx("flex flex-col gap-4", column)}>
          {messages.map((message) =>
            message.role === "seller" ? (
              <div key={message.id} className="flex flex-col items-end gap-2">
                {message.images?.length ? (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {message.images.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="Photo you sent" className="h-20 w-20 rounded-[12px] object-cover" />
                    ))}
                  </div>
                ) : null}
                <p className="m-0 max-w-[88%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[6px] bg-app-ink px-4 py-2.5 text-[14.5px] leading-[1.45] text-white sm:max-w-[75%]">{message.text}</p>
              </div>
            ) : (
              <div key={message.id} className="flex gap-2.5">
                <RexAvatar />
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  {message.text ? (
                    <div
                      className={cx(
                        "max-w-full self-start rounded-[18px] rounded-tl-[6px] px-4 py-3 text-[14.5px] leading-[1.5] sm:max-w-[85%]",
                        message.tone === "error" ? "bg-app-danger-tint text-app-danger" : message.changes?.length ? "border border-app-line bg-white" : "bg-app-peach",
                      )}
                    >
                      {message.changes?.length ? (
                        <ul className="m-0 mb-2 list-none space-y-1.5 p-0">
                          {message.changes.map((change) => (
                            <li key={change} className="flex items-start gap-2 text-[13.5px] font-bold">
                              <Icon name="check" size={15} className="mt-0.5 shrink-0 text-app-success" />
                              <span className="min-w-0">{change}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="m-0 whitespace-pre-wrap break-words">{message.text}</p>
                      {message.version ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-app-canvas px-2.5 py-1 text-[12px] font-bold">Version {message.version.n}</span>
                          {message.undone ? (
                            <span className="text-[12.5px] font-bold text-app-ink-soft">Undone</span>
                          ) : message.undoTo ? (
                            <button
                              type="button"
                              onClick={() => void onUndo(message.undoTo!)}
                              disabled={busy || undoingId !== null}
                              className="min-h-[32px] rounded-full text-[13px] font-bold text-app-accent-ink hover:underline disabled:opacity-50"
                            >
                              {undoingId === message.undoTo ? "Undoing…" : "Undo this"}
                            </button>
                          ) : null}
                          <button type="button" onClick={() => onOpenPreview(null)} className="min-h-[32px] rounded-full text-[13px] font-bold hover:underline">
                            See it
                          </button>
                        </div>
                      ) : null}
                      {message.offer ? (
                        <button
                          type="button"
                          onClick={() => void onSend(message.offer!, [])}
                          disabled={blocked}
                          className="mt-3 inline-flex min-h-[36px] items-center rounded-full bg-app-ink px-4 text-[13px] font-bold text-white disabled:opacity-50"
                        >
                          {message.offer}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {message.cards?.map((card, index) => (
                    <div key={index} className="min-w-0">
                      <RexCardView card={card} {...handlers} />
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}

          {fresh && !busy ? (
            <section aria-labelledby="rex-starters" className="pt-1">
              <h2 id="rex-starters" className="sr-only">What Rex can do</h2>
              <ul className={cx("m-0 grid list-none gap-2.5 p-0", wide ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1")}>
                {REX_STARTERS.map((starter) => (
                  <li key={starter.id} className="min-w-0">
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => void onSend(starter.prompt, [])}
                      className="flex h-full min-h-[64px] w-full items-start gap-3 rounded-[18px] border border-app-line bg-white p-3.5 text-left hover:border-app-line-strong hover:shadow-[0_6px_20px_rgba(22,20,31,0.06)] disabled:opacity-50"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-peach">
                        <Icon name={starter.icon} size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-extrabold leading-tight">{starter.title}</span>
                        <span className="mt-1 block text-[12.5px] leading-[1.35] text-app-ink-soft">{starter.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {busy ? (
            <div className="flex items-center gap-2.5">
              <RexAvatar />
              <div className="flex items-center gap-2 rounded-[18px] rounded-tl-[6px] bg-app-peach px-4 py-3 text-[14px]">
                <Spinner className="h-4 w-4" /> {busyLabel}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-app-line bg-white px-4 pb-4 pt-3 sm:px-6">
        <div className={column}>
          {chips.length && !fresh ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Ideas for Rex">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={blocked}
                  onClick={() => void onSend(chip, [])}
                  className="min-h-[36px] shrink-0 whitespace-nowrap rounded-full bg-app-canvas px-3.5 text-[13px] font-bold hover:bg-app-lilac disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          {disabledReason ? (
            <p className="m-0 rounded-[16px] bg-app-peach px-4 py-3 text-[13.5px] leading-[1.5]">{disabledReason}</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="rounded-[22px] border border-app-line-strong bg-white p-2 focus-within:border-app-ink">
              {photos.length ? (
                <div className="flex flex-wrap gap-2 px-2 pt-1">
                  {photos.map((url) => (
                    <span key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Photo to send" className="h-14 w-14 rounded-[10px] object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((entry) => entry !== url))}
                        aria-label="Remove this photo"
                        className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-app-ink text-white"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <label htmlFor="rex-composer" className="sr-only">Message Rex</label>
              <textarea
                id="rex-composer"
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={2000}
                placeholder="Ask Rex to edit a photo, make a logo, change your store, build a campaign…"
                className="block max-h-40 min-h-[52px] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[15px] leading-[1.45] outline-none placeholder:text-app-ink-faint"
              />
              {linkOpen ? (
                <div className="mx-1 mb-2 flex gap-2">
                  <label htmlFor="rex-link" className="sr-only">Link</label>
                  <input
                    id="rex-link"
                    type="url"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addLink(event);
                      if (event.key === "Escape") setLinkOpen(false);
                    }}
                    placeholder="https://instagram.com/…"
                    className="h-10 min-w-0 flex-1 rounded-full border border-app-line bg-app-canvas px-4 text-[13.5px] outline-none focus:border-app-ink"
                    autoFocus
                  />
                  <button type="button" onClick={addLink} className="h-10 shrink-0 rounded-full bg-app-ink px-4 text-[13px] font-bold text-white">Add</button>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 px-1">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" tabIndex={-1} onChange={(event) => void addPhotos(event.target.files)} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || blocked}
                  aria-label="Attach photos"
                  title="Attach photos"
                  className="grid h-10 w-10 place-items-center rounded-full border border-app-line hover:bg-app-canvas disabled:opacity-50"
                >
                  {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="paperclip" size={17} />}
                </button>
                <button
                  type="button"
                  onClick={() => setLinkOpen((open) => !open)}
                  aria-label="Paste a link"
                  aria-expanded={linkOpen}
                  title="Paste a link"
                  className={cx("grid h-10 w-10 place-items-center rounded-full border border-app-line hover:bg-app-canvas", linkOpen && "bg-app-canvas")}
                >
                  <Icon name="link" size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => void toggleMic()}
                  disabled={transcribing || busy}
                  aria-label={recording ? "Stop and use what I said" : "Speak"}
                  aria-pressed={recording}
                  title={recording ? "Stop" : "Speak"}
                  className={cx(
                    "grid h-10 w-10 place-items-center rounded-full border hover:bg-app-canvas disabled:opacity-50",
                    recording ? "border-app-accent bg-app-accent text-white hover:bg-app-accent" : "border-app-line",
                  )}
                >
                  {transcribing ? <Spinner className="h-4 w-4" /> : <MicIcon size={17} />}
                </button>
                <button
                  type="submit"
                  disabled={!text.trim() || blocked || uploading}
                  aria-label="Send to Rex"
                  className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-app-ink text-white disabled:opacity-40"
                >
                  <Icon name="arrowUp" size={17} />
                </button>
              </div>
            </form>
          )}
          {note ? <p className="m-0 mt-2 text-[12.5px] text-app-danger" role="status">{note}</p> : null}
          {recording ? <p className="m-0 mt-2 text-[12.5px] font-bold text-app-accent-ink" role="status">Listening… press the mic again when you&apos;re done.</p> : null}
        </div>
      </div>
    </div>
  );
}
