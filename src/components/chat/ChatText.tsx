"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { markdownToDoc } from "@/lib/cms/markdown";
import { safeLinkUrl, sanitizeDoc, type RichNode } from "@/lib/cms/richtext";

// What Rex and Peggy write, shown as rich text: their replies are Markdown (**bold**, lists, ## headings, links,
// tables), parsed with the CMS's Markdown reader and drawn as React elements, so nothing is injected as HTML. A
// chat can pass `renderText` to treat plain text its own way (Peggy turns app paths into links and buttons).

export function ChatText({ text, className, renderText }: { text: string; className?: string; renderText?: (text: string) => ReactNode }) {
  const doc = useMemo(() => sanitizeDoc(markdownToDoc(text)), [text]);
  const plain = renderText ?? ((value: string) => value);

  const marks = (node: RichNode, key: number): ReactNode => {
    let out: ReactNode = plain(node.text ?? "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") out = <strong>{out}</strong>;
      else if (mark.type === "italic") out = <em>{out}</em>;
      else if (mark.type === "strike") out = <s>{out}</s>;
      else if (mark.type === "code") out = <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>;
      else if (mark.type === "link") {
        const href = safeLinkUrl(mark.attrs?.href);
        if (href) out = <a href={href} className="font-semibold underline underline-offset-2" {...(/^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{node.text}</a>;
      }
    }
    return <Fragment key={key}>{out}</Fragment>;
  };

  const kids = (node: RichNode) => (node.content ?? []).map((child, index) => block(child, index));

  function block(node: RichNode, key: number): ReactNode {
    switch (node.type) {
      case "text": return marks(node, key);
      case "hardBreak": return <br key={key} />;
      case "paragraph": return <p key={key} className="m-0">{kids(node)}</p>;
      case "heading": return <p key={key} className="m-0 font-extrabold">{kids(node)}</p>;
      case "bulletList": return <ul key={key} className="m-0 list-disc space-y-1 pl-5">{kids(node)}</ul>;
      case "orderedList": return <ol key={key} className="m-0 list-decimal space-y-1 pl-5" start={Number(node.attrs?.start) || 1}>{kids(node)}</ol>;
      case "listItem": return <li key={key} className="[&>p]:inline">{kids(node)}</li>;
      case "blockquote": return <blockquote key={key} className="m-0 border-l-2 border-current/30 pl-3 opacity-90">{kids(node)}</blockquote>;
      case "codeBlock": return <pre key={key} className="m-0 overflow-x-auto rounded-[10px] bg-black/5 p-2 font-mono text-[12.5px]">{(node.content ?? []).map((child) => child.text ?? "").join("")}</pre>;
      case "horizontalRule": return <hr key={key} className="my-1 border-current/20" />;
      case "table":
        return (
          <div key={key} className="max-w-full overflow-x-auto">
            <table className="border-collapse text-[0.92em]">
              <tbody>
                {(node.content ?? []).map((row, r) => (
                  <tr key={r}>
                    {(row.content ?? []).map((cell, c) => {
                      const Cell = cell.type === "tableHeader" ? "th" : "td";
                      return <Cell key={c} className="border border-current/15 px-2 py-1 text-left align-top [&>p]:m-0">{kids(cell)}</Cell>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      // Pictures, videos and store blocks don't belong in a chat bubble: their text (if any) stays.
      default: return <Fragment key={key}>{kids(node)}</Fragment>;
    }
  }

  return <div className={cx("grid gap-2 break-words", className)}>{doc.content.map((node, index) => block(node, index))}</div>;
}
