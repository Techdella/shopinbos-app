// Markdown → rich text document, for old blog posts (written in Markdown), Markdown pasted into the editor's
// import box, and posts Peggy and Rex write. Covers what those use: headings, paragraphs, bold, italic,
// strike, inline code, links, images, lists, quotes, code blocks, rules and pipe tables. Pure.

import type { RichDoc, RichNode } from "./richtext.ts";

type Mark = NonNullable<RichNode["marks"]>[number];

function inline(source: string, marks: Mark[] = []): RichNode[] {
  const out: RichNode[] = [];
  const pattern = /(!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*|__([^_]+)__)|(~~([^~]+)~~)|(`([^`]+)`)|(\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (value: string, extra: Mark[] = marks) => {
    if (!value) return;
    out.push(extra.length ? { type: "text", text: value, marks: extra } : { type: "text", text: value });
  };
  while ((match = pattern.exec(source))) {
    push(source.slice(last, match.index));
    if (match[1]) out.push({ type: "image", attrs: { src: match[3], alt: match[2], title: match[4] ?? null } });
    else if (match[5]) out.push(...inline(match[6], [...marks, { type: "link", attrs: { href: match[7] } }]));
    else if (match[8]) out.push(...inline(match[9] ?? match[10], [...marks, { type: "bold" }]));
    else if (match[11]) out.push(...inline(match[12], [...marks, { type: "strike" }]));
    else if (match[13]) push(match[14], [...marks, { type: "code" }]);
    else if (match[15]) out.push(...inline(match[16] ?? match[17], [...marks, { type: "italic" }]));
    last = pattern.lastIndex;
  }
  push(source.slice(last));
  return out;
}

function paragraph(lines: string[]): RichNode {
  const content: RichNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    content.push(...inline(line.trim()));
  });
  // A paragraph that is only an image becomes the image block itself.
  if (content.length === 1 && content[0].type === "image") return content[0];
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function markdownToDoc(markdown: string): RichDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: RichNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line.trim());
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) code.push(lines[i++]);
      i++;
      blocks.push({ type: "codeBlock", attrs: { language: fence[1] || null }, content: code.length ? [{ type: "text", text: code.join("\n") }] : undefined });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", attrs: { level: Math.min(4, heading[1].length) }, content: inline(heading[2]) });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "blockquote", content: markdownToDoc(quoted.join("\n")).content });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      const row = (values: string[], type: "tableHeader" | "tableCell"): RichNode => ({
        type: "tableRow",
        content: header.map((_, index) => ({ type, content: [{ type: "paragraph", content: inline(values[index] ?? "") }] })),
      });
      blocks.push({ type: "table", content: [row(header, "tableHeader"), ...rows.map((values) => row(values, "tableCell"))] });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items: RichNode[] = [];
      while (i < lines.length) {
        const current = LIST_ITEM.exec(lines[i]);
        if (!current || /\d/.test(current[2]) !== ordered) break;
        const body = [current[3]];
        i++;
        // Indented continuation lines belong to the same item.
        while (i < lines.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !LIST_ITEM.exec(lines[i])) body.push(lines[i++].trim());
        items.push({ type: "listItem", content: [paragraph(body)] });
      }
      blocks.push(ordered ? { type: "orderedList", attrs: { start: Number.parseInt(item[2], 10) || 1 }, content: items } : { type: "bulletList", content: items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>)/.test(lines[i]) && !LIST_ITEM.exec(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    blocks.push(paragraph(para));
  }
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}
