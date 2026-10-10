import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

const pageTypes = [
  { id: "home", name: "Home", icon: "home" as const, desc: "Your homepage. Rex will craft a compelling hero and brand intro." },
  { id: "product", name: "Product", icon: "box" as const, desc: "Showcase your products with filters and categories." },
  { id: "collection", name: "Collection", icon: "layers" as const, desc: "Group products into collections or categories." },
  { id: "about", name: "About", icon: "info" as const, desc: "Tell your brand story and what makes you different." },
  { id: "contact", name: "Contact", icon: "mail" as const, desc: "Contact form and your business details." },
  { id: "faq", name: "FAQ", icon: "chat" as const, desc: "Frequently asked questions with answers." },
  { id: "blog", name: "Blog", icon: "book" as const, desc: "Articles, updates, and stories from your brand." },
  { id: "custom", name: "Custom page", icon: "code" as const, desc: "A blank page with full control over sections." },
];

export default async function NewPageModal() {
  await requireRole(["seller"], "/login");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 40,
        background: "var(--color-paper)",
      }}
    >
      <div
        style={{
          background: "var(--paper)",
          borderRadius: 24,
          boxShadow: "var(--shd-pop)",
          width: "100%",
          maxWidth: 920,
          overflow: "hidden",
          border: "1px solid var(--ink-100)",
        }}
      >
        <div
          style={{
            padding: "22px 28px",
            borderBottom: "1px solid var(--ink-100)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", margin: 0 }}>
              New page
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-500)", margin: "2px 0 0" }}>
              Choose a page type to get started. Rex can fill in the content.
            </p>
          </div>
          <Link
            href="/home/pages"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--ink-100)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-600)",
              textDecoration: "none",
              fontSize: 16,
            }}
          >
            ✕
          </Link>
        </div>

        <div style={{ padding: "24px 28px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 14,
            }}
          >
            Page types
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 24,
            }}
          >
            {pageTypes.map((pt) => (
              <div
                key={pt.id}
                style={{
                  border: "1px solid var(--ink-100)",
                  borderRadius: 14,
                  padding: 16,
                  cursor: "pointer",
                  transition: "border-color .15s, background .15s",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "var(--teal-100)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    color: "var(--teal-700)",
                  }}
                >
                  <Icon name={pt.icon} size={16} />
                </div>
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{pt.name}</h4>
                <p style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.45, margin: 0 }}>
                  {pt.desc}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 14,
            }}
          >
            Page settings
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--ink-600)",
                }}
              >
                Page name
              </label>
              <input
                type="text"
                placeholder="e.g. About Us"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid var(--ink-150)",
                  background: "var(--paper)",
                  borderRadius: 999,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--ink-600)",
                }}
              >
                URL slug
              </label>
              <input
                type="text"
                placeholder="/about-us"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid var(--ink-150)",
                  background: "var(--ink-50)",
                  borderRadius: 999,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  color: "var(--ink-600)",
                }}
              />
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(140deg, var(--color-navy), #07181C)",
              color: "var(--paper)",
              padding: 16,
              borderRadius: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                background: "linear-gradient(140deg, #65D4BB, #2EB39A)",
                borderRadius: "10px 10px 12px 12px",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 9,
                  left: 7,
                  width: 4,
                  height: 5,
                  background: "#062424",
                  borderRadius: 2,
                  boxShadow: "11px 0 0 #062424",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 7,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 9,
                  height: 4,
                  borderRadius: "0 0 5px 5px",
                  background: "#062424",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: "var(--color-mint)",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                REX CAN HELP
              </span>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--paper)", margin: "0 0 10px" }}>
                Describe the page you want in a sentence. Rex will draft the content, pick sections, and
                suggest a layout.
              </p>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: "var(--teal-700)",
                  color: "white",
                  fontWeight: 600,
                  fontSize: 12.5,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Ask Rex →
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "18px 28px",
            borderTop: "1px solid var(--ink-100)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--ink-50)",
          }}
        >
          <Link
            href="/home/pages"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--ink-600)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ← Back
          </Link>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                borderRadius: 999,
                background: "var(--teal-700)",
                color: "white",
                fontWeight: 600,
                fontSize: 14,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Create page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
