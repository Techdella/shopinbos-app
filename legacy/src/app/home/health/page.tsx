"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, MascotAvatar } from "@/components/ui";

interface HealthFactor {
  name: string;
  score: number;
  maxScore: number;
}

interface HealthData {
  score: number;
  factors: HealthFactor[];
  recommendations: Array<{ text: string; action?: string; actionUrl?: string }>;
}

function getScoreColor(score: number): string {
  if (score < 50) return "var(--rose-500)";
  if (score < 75) return "var(--amber-500)";
  return "var(--success)";
}

function getScoreBg(score: number): string {
  if (score < 50) return "var(--rose-50)";
  if (score < 75) return "var(--amber-50)";
  return "var(--success-bg)";
}

function getScoreLabel(score: number): string {
  if (score < 50) return "Needs Attention";
  if (score < 75) return "Fair";
  return "Good";
}

export default function StoreHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [notice, setNotice] = useState("");

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health-score");
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      setNotice("Could not load health data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHealth();
  }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch("/api/health-score", { method: "POST" });
      if (res.ok) {
        await fetchHealth();
        setNotice("Health score recalculated!");
      }
    } catch {
      setNotice("Could not recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  const score = data?.score ?? 0;
  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const circumference = 2 * Math.PI * 60;
  const offset = circumference - (score / 100) * circumference;

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
        <PageHead
          title="Store Health"
          sub="Your store performance score"
          actions={
            <button onClick={handleRecalculate} disabled={recalculating}
              className="dbtn dBtn-mint"
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="refresh" size={14} /> {recalculating ? "Recalculating..." : "Recalculate"}
            </button>
          }
        />

        {notice && (
          <div style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, background: "var(--mint-bg)", color: "var(--mint)", border: "1px solid var(--mint-border)" }}>
            {notice}
            <button onClick={() => setNotice("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>✕</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading health data...</div>
        ) : data ? (
          <>
            <div className="card" style={{ padding: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", width: 150, height: 150, flexShrink: 0 }}>
                <svg width="150" height="150" viewBox="0 0 150 150">
                  <circle cx="75" cy="75" r="60" fill="none" stroke="var(--ink-100)" strokeWidth="10" />
                  <circle
                    cx="75" cy="75" r="60"
                    fill="none" stroke={scoreColor}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform="rotate(-90 75 75)"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                    {score}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor, marginTop: 2 }}>
                    {scoreLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
                Factor Breakdown
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.factors.map(f => {
                  const pct = f.maxScore > 0 ? Math.round((f.score / f.maxScore) * 100) : 0;
                  const barColor = getScoreColor(pct);
                  return (
                    <div key={f.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>{f.name}</span>
                        <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{f.score}/{f.maxScore}</span>
                      </div>
                      <div style={{
                        height: 8, borderRadius: 4,
                        background: "var(--ink-100)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 4,
                          background: barColor,
                          width: `${pct}%`,
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {data.recommendations.length > 0 && (
              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
                  Recommendations
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.recommendations.map((rec, idx) => (
                    <div key={idx} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 12px", borderRadius: 10,
                      background: "var(--ink-50)",
                    }}>
                      <Icon name="sparkle" size={16} color="var(--teal-600)" style={{ marginTop: 1, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, color: "var(--ink-700)", lineHeight: 1.4 }}>
                        {rec.text}
                      </div>
                      {rec.action && (
                        <button className="dbtn dBtn-sm dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                          {rec.action}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <MascotAvatar role="seller" size={56} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-600)" }}>No health data available</div>
            <div style={{ fontSize: 13, color: "var(--ink-400)", maxWidth: 300 }}>
              Store health score will appear once your store has sufficient activity.
            </div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
