export interface NormalizedImage {
  originalSrc: string;
  resolvedSrc: string;
  placeholder: string;
  alt: string;
  editable: boolean;
}

const PLACEHOLDER_COLORS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

export function normalizeImage(
  src: string | undefined | null,
  alt: string,
  templateBasePath?: string,
  templateId?: string,
): NormalizedImage {
  if (!src) {
    return {
      originalSrc: "",
      resolvedSrc: "",
      placeholder: hashColor(alt || "default"),
      alt: alt || "Image",
      editable: true,
    };
  }

  const isAbsolute = /^(https?:|data:|blob:)/i.test(src);
  const isRootRelative = src.startsWith("/");

  let resolvedSrc: string;
  if (isAbsolute) {
    resolvedSrc = src;
  } else if (isRootRelative) {
    resolvedSrc = src;
  } else if (templateBasePath) {
    const base = templateBasePath.replace(/\/+$/, "");
    resolvedSrc = `${base}/${src.replace(/^\.\//, "")}`;
  } else {
    resolvedSrc = src;
  }

  return {
    originalSrc: src,
    resolvedSrc,
    placeholder: hashColor(alt || src),
    alt: alt || "Image",
    editable: true,
  };
}

export function validateImageUrl(url: string): boolean {
  if (!url) return false;
  if (/^(https?:|data:|blob:)/i.test(url)) return true;
  if (url.startsWith("/")) return true;
  if (url.startsWith("./")) return true;
  return false;
}

export function imageBlock(
  id: string,
  src: string | undefined | null,
  alt: string,
  templateBasePath?: string,
  templateId?: string,
) {
  const normalized = normalizeImage(src, alt, templateBasePath, templateId);
  return {
    id,
    type: "image" as const,
    content: {
      originalSrc: normalized.originalSrc,
      resolvedSrc: normalized.resolvedSrc,
      alt: normalized.alt,
      placeholder: normalized.placeholder,
      editable: true,
      width: null,
      height: null,
      objectFit: "cover",
    },
  };
}
