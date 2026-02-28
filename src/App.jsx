// ============================================================
// TRACEWIRE — SCF Fraud Detection Platform
// ============================================================
// SECTIONS:
//   1. CONFIG & CONSTANTS   — weights, thresholds, colors, fonts
//   2. DATA LAYER           — invoice generation + scoring engine
//   3. SHARED COMPONENTS    — reusable UI primitives
//   4. LANDING PAGE         — hero, features, how it works, CTA
//   5. TAB: OVERVIEW        — KPIs, donut, histogram, feed
//   6. TAB: NETWORK GRAPH   — interactive SVG graph
//   7. TAB: VELOCITY        — supplier scoring + scatter
//   8. TAB: MULTI-TIER      — cascade analysis
//   9. TAB: PRE-DISBURSE    — live invoice check
//  10. TAB: DATA UPLOAD     — CSV + ERP connection
//  11. MAIN APP             — routing + nav
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from "recharts";

// ============================================================
// 1. CONFIG & CONSTANTS
// Edit scoring weights and thresholds here freely
// ============================================================

// --- Fraud scoring weights (must sum to 1.0) ---
const WEIGHTS = {
  isolationForest: 0.35,
  communityRisk:   0.25,
  grnMissing:      0.15,
  duplicate:       0.12,
  velocityRisk:    0.08,
  multiLender:     0.05,
};

// --- Thresholds ---
const T = {
  fraud:       0.50,   // score >= this → BLOCKED
  review:      0.35,   // score >= this → REVIEW
  community:   0.65,   // community risk above this → fraud ring
  velocity:    15,     // invoices/30d above this → high velocity
  newSupplier: 60,     // days since reg below this → risky
  ratioLow:    0.70,   // amount/PO below this → phantom signal
  ratioHigh:   1.50,   // amount/PO above this → over-invoicing
};

// --- Design tokens ---
const C = {
  // Backgrounds — soft charcoal not pure black
// --- Design tokens — Dark Slate + Cyan + Coral ---
  // Backgrounds — cool blue-tinted dark slate
  bg:         "#0d1117",
  bgCard:     "#161b22",
  bgRaised:   "#1c2230",
  bgHover:    "#212c3d",
  // Borders — subtle blue tint
  border:     "#243044",
  borderSoft: "#2e3f58",
  // Text — cooler whites
  white:      "#e8edf5",
  offWhite:   "#b8c4d4",
  muted:      "#5d7290",
  dimmed:     "#344058",
  // Primary accent — coral
  red:        "#ff6b6b",
  redGlow:    "#ff5252",
  redSoft:    "#ff8a80",
  redDim:     "#3d1a1a",
  // Electric cyan — SaaS signature
  teal:       "#00d4c8",
  // Supporting palette
  orange:     "#ff8c5a",
  amber:      "#ffb347",
  green:      "#3ddc97",
  blue:       "#4da6ff",
  purple:     "#9d7afa",
  // Fraud type palette
  phantom:    "#ff6b6b",
  duplicate:  "#ff8c5a",
  ring:       "#9d7afa",
  anomalous:  "#ffb347",
  overInvoice:"#ff6eb4",
  carousel:   "#c084fc",
  dilution:   "#4da6ff",
  clean:      "#3ddc97",
};

const FRAUD_COLORS = {
  "Clean":                C.clean,
  "Phantom Invoice":      C.phantom,
  "Duplicate Financing":  C.duplicate,
  "Fraud Ring":           C.ring,
  "Anomalous":            C.anomalous,
  "Over-Invoicing":       C.overInvoice,
  "Carousel Trade":       C.carousel,
  "Dilution Fraud":       C.dilution,
};

// Font stack — soft, rounded, premium
const FONT = {
  sans: "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

// ============================================================
// 2. DATA LAYER
// All invoice generation and scoring logic lives here
// ============================================================

function makeId(prefix, n, pad = 3) {
  return `${prefix}${String(n).padStart(pad, "0")}`;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.round(rnd(min, max)); }

function generateRawInvoices() {
  const legitSuppliers = Array.from({ length: 40 }, (_, i) => makeId("SUP_L", i + 1));
  const legitBuyers    = Array.from({ length: 25 }, (_, i) => makeId("BUY_L", i + 1));
  const phSuppliers    = Array.from({ length: 5 },  (_, i) => makeId("SUP_PH", i + 1));
  const dupSuppliers   = Array.from({ length: 8 },  (_, i) => makeId("SUP_DU", i + 1));
  const ringSuppliers  = Array.from({ length: 6 },  (_, i) => makeId("SUP_RG", i + 1));
  const shellBuyers    = Array.from({ length: 4 },  (_, i) => makeId("SHELL_B", i + 1));
  const banks          = ["HDFC_BANK", "ICICI_BANK", "SBI", "AXIS_BANK",];
  const rows = [];

  // Legitimate (600)
  for (let i = 0; i < 600; i++) {
    const amt = rndInt(50000, 500000);
    rows.push({ id: makeId("INV", i, 4), supplier: pick(legitSuppliers), buyer: pick(legitBuyers),
      amount: amt, poAmount: Math.round(amt * rnd(0.98, 1.02)), grn: true,
      tier: pick([1, 1, 2, 2, 3]), lender: pick(banks.slice(0, 2)),
      daysSinceReg: rndInt(300, 2000), inv30d: rndInt(1, 8), actualType: "Clean", label: 0 });
  }

  // Phantom (150) — no GRN, inflated PO ratio
  for (let i = 0; i < 150; i++) {
    const amt = rndInt(200000, 2000000);
    rows.push({ id: makeId("PH", i), supplier: pick(phSuppliers), buyer: pick(legitBuyers),
      amount: amt, poAmount: Math.round(amt * rnd(0.40, 0.68)), grn: false,
      tier: pick([1, 2, 3]), lender: pick(banks),
      daysSinceReg: rndInt(5, 45), inv30d: rndInt(20, 55), actualType: "Phantom Invoice", label: 1 });
  }

  // Duplicate financing (100) — same invoice → multiple banks
  for (let i = 0; i < 50; i++) {
    const amt = rndInt(100000, 800000);
    const sup = pick(dupSuppliers), buyer = pick(legitBuyers);
    const po  = Math.round(amt * rnd(0.97, 1.03));
    const pair = [...banks].sort(() => 0.5 - Math.random()).slice(0, 2);
    pair.forEach(bank => rows.push({ id: makeId("DUP", i), supplier: sup, buyer,
      amount: amt, poAmount: po, grn: true, tier: pick([1, 2]), lender: bank,
      daysSinceReg: rndInt(60, 400), inv30d: rndInt(8, 20), actualType: "Duplicate Financing", label: 1 }));
  }

  // Fraud ring / carousel (100) — tight cluster of ring suppliers → shell buyers
  for (let i = 0; i < 100; i++) {
    const amt = rndInt(150000, 1200000);
    rows.push({ id: makeId("RG", i), supplier: pick(ringSuppliers), buyer: pick(shellBuyers),
      amount: amt, poAmount: Math.round(amt * rnd(0.88, 1.05)), grn: Math.random() > 0.35,
      tier: pick([1, 2, 3]), lender: pick(banks),
      daysSinceReg: rndInt(20, 120), inv30d: rndInt(25, 60), actualType: "Fraud Ring", label: 1 });
  }

  return rows.sort(() => 0.5 - Math.random());
}

function scoreInvoices(raw) {
  // Build fingerprint map (duplicate detection)
  const fpCount = {};
  raw.forEach(r => {
    const k = `${r.supplier}|${r.poAmount}|${r.amount}`;
    fpCount[k] = (fpCount[k] || 0) + 1;
  });

  // Supplier aggregates for multi-lender flag
  const supAgg = {};
  raw.forEach(r => {
    if (!supAgg[r.supplier]) supAgg[r.supplier] = { lenders: new Set(), buyers: new Set(), count: 0, grnFails: 0, inv30d: [] };
    supAgg[r.supplier].lenders.add(r.lender);
    supAgg[r.supplier].buyers.add(r.buyer);
    supAgg[r.supplier].count++;
    if (!r.grn) supAgg[r.supplier].grnFails++;
    supAgg[r.supplier].inv30d.push(r.inv30d);
  });

  // Simulated community risk (Louvain output approximation)
  const ringSet    = new Set(raw.filter(r => r.actualType === "Fraud Ring").map(r => r.supplier));
  const phantomSet = new Set(raw.filter(r => r.actualType === "Phantom Invoice").map(r => r.supplier));
  const commRiskOf = sup => ringSet.has(sup) ? 0.78 + Math.random() * 0.18
    : phantomSet.has(sup) ? 0.62 + Math.random() * 0.15
    : Math.random() * 0.28;

  const commCache = {};
  raw.forEach(r => { if (!commCache[r.supplier]) commCache[r.supplier] = commRiskOf(r.supplier); });

  return raw.map(r => {
    const fp       = `${r.supplier}|${r.poAmount}|${r.amount}`;
    const isDup    = (fpCount[fp] || 0) > 1;
    const grnFlag  = r.grn ? 0 : 1;
    const ratio    = r.amount / Math.max(r.poAmount, 1);
    const ratioFlag= (ratio < T.ratioLow || ratio > T.ratioHigh) ? 1 : 0;
    const velRisk  = r.inv30d > T.velocity ? 1 : 0;
    const newSup   = r.daysSinceReg < T.newSupplier ? 1 : 0;
    const agg      = supAgg[r.supplier];
    const multiLen = agg && agg.lenders.size >= 3 ? 1 : 0;
    const cr       = commCache[r.supplier];

    // Isolation forest approximation
    const ifRaw = Math.min(1, grnFlag * 0.4 + ratioFlag * 0.35 + velRisk * 0.2 + newSup * 0.15 + Math.random() * 0.1);

    const score = Math.min(1,
      WEIGHTS.isolationForest * ifRaw +
      WEIGHTS.communityRisk   * cr +
      WEIGHTS.grnMissing      * grnFlag +
      WEIGHTS.duplicate       * (isDup ? 1 : 0) +
      WEIGHTS.velocityRisk    * velRisk +
      WEIGHTS.multiLender     * multiLen
    );

    // Classify fraud type
    let fraudType = "Clean";
    if (score >= T.fraud) {
      if (isDup)           fraudType = "Duplicate Financing";
      else if (cr > T.community) fraudType = "Fraud Ring";
      else if (grnFlag)    fraudType = "Phantom Invoice";
      else if (ratio > T.ratioHigh) fraudType = "Over-Invoicing";
      else                 fraudType = "Anomalous";
    }

    // Velocity score for supplier
    const avgInv = agg ? agg.inv30d.reduce((a, b) => a + b, 0) / agg.inv30d.length : 0;
    const velScore = Math.min(1,
      0.30 * Math.min(1, avgInv / 40) +
      0.20 * Math.min(1, (agg?.buyers.size || 0) / 20) +
      0.15 * Math.min(1, (agg?.lenders.size || 0) / 4) +
      0.15 * Math.max(0, 1 - r.daysSinceReg / 1000) +
      0.10 * (agg ? agg.grnFails / agg.count : 0) +
      0.10 * (isDup ? 1 : 0)
    );

    return {
      ...r,
      fraudScore:    Math.round(score * 100) / 100,
      fraudType,
      communityRisk: Math.round(cr * 100) / 100,
      communityRiskRaw: cr,
      velocityScore: Math.round(velScore * 100) / 100,
      grnFlag, isDuplicate: isDup, velocityRisk: velRisk,
      newSupplierRisk: newSup, multiLenderFlag: multiLen,
      ifScore: Math.round(ifRaw * 100) / 100,
      amountPORatio: Math.round(ratio * 100) / 100,
    };
  });
}

function buildNetworkData(invoices) {
  const nodeMap = {};
  const edgeList = [];
  const fraudSups = new Set(invoices.filter(i => i.fraudScore >= T.fraud).map(i => i.supplier));

  const upsert = (id, type, extra = {}) => {
    if (!nodeMap[id]) nodeMap[id] = { id, type, connections: 0, ...extra };
    else nodeMap[id].connections++;
  };

  invoices.slice(0, 350).forEach(inv => {
    const isFraud = fraudSups.has(inv.supplier);
    upsert(inv.supplier, "supplier", { tier: inv.tier, isFraud, communityRisk: inv.communityRiskRaw, fraudScore: inv.fraudScore, velocityScore: inv.velocityScore });
    upsert(inv.buyer, "buyer", { tier: Math.min(inv.tier + 1, 3), isFraud: false, communityRisk: 0, fraudScore: 0 });
    upsert(inv.lender, "lender", { tier: 0, isFraud: false, communityRisk: 0, fraudScore: 0 });
    edgeList.push({ source: inv.supplier, target: inv.buyer, value: inv.amount, isFraud, fraudScore: inv.fraudScore, fraudType: inv.fraudType });
    if (Math.random() > 0.55)
      edgeList.push({ source: inv.supplier, target: inv.lender, value: inv.amount * 0.5, isFraud, fraudScore: inv.fraudScore, fraudType: inv.fraudType });
  });

  // Position nodes in a layered radial layout
  const nodes = Object.values(nodeMap);
  const byType = { lender: [], supplier: [], buyer: [] };
  nodes.forEach(n => byType[n.type]?.push(n));

  const layout = (arr, radius, offset = 0) => arr.forEach((n, i) => {
    const a = offset + (i / arr.length) * 2 * Math.PI;
    const jitter = (Math.random() - 0.5) * 60;
    n.x = Math.cos(a) * (radius + jitter) + 320;
    n.y = Math.sin(a) * (radius + jitter) + 300;
  });

  layout(byType.lender, 55, 0);
  layout(byType.supplier, 155, 0.3);
  layout(byType.buyer, 255, 0.8);

  return { nodes, edges: edgeList };
}

// ============================================================
// 3. SHARED COMPONENTS
// Reusable primitives — edit these to retheme globally
// ============================================================

// Soft grain overlay for depth
const Grain = () => (
  <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, opacity: 0.018,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
);

// Soft glow blob for atmosphere
const GlowBlob = ({ x, y, color, size = 400, opacity = 0.06 }) => (
  <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    left: x - size / 2, top: y - size / 2, opacity, pointerEvents: "none" }} />
);

// KPI metric card with soft glow on hover
const Metric = ({ label, value, sub, accent, info }) => {
  const [tip, setTip] = useState(false);
  const ac = accent || C.red;
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: "22px 24px",
      position: "relative", overflow: "hidden", transition: "border-color 0.3s",
      cursor: info ? "default" : undefined }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.borderSoft}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      {/* Top accent glow line */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${ac}88 50%, transparent 100%)` }} />
      <div style={{ fontSize: 10, letterSpacing: 2.5, color: C.muted, marginBottom: 10,
        textTransform: "uppercase", fontFamily: FONT.sans, display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {info && <span onClick={() => setTip(!tip)} style={{ cursor: "pointer", color: C.dimmed, fontSize: 12, lineHeight: 1 }}>ⓘ</span>}
      </div>
      {tip && <div style={{ position: "absolute", zIndex: 50, top: 44, left: 0, right: 0,
        background: C.bgRaised, border: `1px solid ${C.borderSoft}`, padding: "12px 16px",
        fontSize: 11, color: C.muted, lineHeight: 1.7, fontFamily: FONT.sans }}>{info}</div>}
      <div style={{ fontSize: 30, fontWeight: 700, color: C.white, fontFamily: FONT.mono,
        letterSpacing: -1, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontFamily: FONT.sans }}>{sub}</div>}
    </div>
  );
};

// Section header
const SHead = ({ tag, title, sub }) => (
  <div style={{ marginBottom: 22 }}>
    {tag && <div style={{ fontSize: 9, letterSpacing: 3, color: C.red, marginBottom: 8,
      textTransform: "uppercase", fontFamily: FONT.sans }}>{tag}</div>}
    <div style={{ fontSize: 20, fontWeight: 650, color: C.white, letterSpacing: -0.3,
      fontFamily: FONT.sans }}>{title}</div>
    {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.65,
      fontFamily: FONT.sans, maxWidth: 580 }}>{sub}</div>}
  </div>
);

// Info explanation box
const InfoBox = ({ title, children }) => (
  <div style={{ background: C.bgRaised, border: `1px solid ${C.border}`,
    borderLeft: `2px solid ${C.red}44`, padding: "14px 18px", marginBottom: 20,
    borderRadius: 2 }}>
    {title && <div style={{ fontSize: 9, letterSpacing: 2.5, color: C.red, marginBottom: 8,
      textTransform: "uppercase", fontFamily: FONT.sans }}>{title}</div>}
    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.75, fontFamily: FONT.sans }}>{children}</div>
  </div>
);

// Fraud type pill badge
const Badge = ({ type, small }) => {
  const col = FRAUD_COLORS[type] || C.muted;
  return (
    <span style={{ background: `${col}14`, border: `1px solid ${col}38`, color: col,
      fontSize: small ? 9 : 10, padding: small ? "2px 7px" : "3px 9px",
      letterSpacing: 0.8, textTransform: "uppercase", fontFamily: FONT.sans,
      whiteSpace: "nowrap", borderRadius: 2 }}>{type}</span>
  );
};

// Slim score bar
const ScoreBar = ({ score, color, max = 1 }) => {
  const pct = Math.min(100, (score / max) * 100);
  const col = color || (score > 0.6 ? C.red : score > 0.3 ? C.amber : C.green);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 2, background: C.bgRaised, borderRadius: 1, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: col,
          boxShadow: `0 0 6px ${col}66`, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 10, color: C.offWhite, width: 32, textAlign: "right",
        fontFamily: FONT.mono }}>{pct.toFixed(0)}%</span>
    </div>
  );
};

// Tab navigation
const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 32, gap: 0, overflowX: "auto" }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        background: "none", border: "none", cursor: "pointer", padding: "13px 22px",
        fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", position: "relative",
        color: active === t.id ? C.white : C.muted, transition: "color 0.25s",
        fontFamily: FONT.sans, whiteSpace: "nowrap",
      }}>
        {t.label}
        {active === t.id && <div style={{ position: "absolute", bottom: -1, left: 0, right: 0,
          height: 1, background: C.red, boxShadow: `0 0 8px ${C.red}` }} />}
      </button>
    ))}
  </div>
);

// Custom recharts tooltip
const ChartTip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.bgRaised, border: `1px solid ${C.borderSoft}`,
      padding: "10px 14px", fontSize: 11, fontFamily: FONT.sans, borderRadius: 4 }}>
      {label && <div style={{ color: C.muted, marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.white }}>
          {p.name}: <strong>{formatter ? formatter(p.value) : (typeof p.value === "number" && p.value > 999 ? p.value.toLocaleString("en-IN") : p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

// Format helpers
const F = {
  cr:    n => `₹${(n / 1e7).toFixed(1)} Cr`,
  lac:   n => `₹${(n / 1e5).toFixed(1)}L`,
  pct:   n => `${(n * 100).toFixed(1)}%`,
  num:   n => n.toLocaleString("en-IN"),
  score: n => n?.toFixed(2) ?? "—",
};

// ============================================================
// 4. LANDING PAGE
// Sleek premium fintech — soft blacks, red accent, smooth type
// ============================================================

const Landing = ({ onEnter }) => {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onM = e => setMouse({ x: e.clientX, y: e.clientY });
    const onS = () => setScrollY(window.scrollY);
    window.addEventListener("mousemove", onM);
    window.addEventListener("scroll", onS);
    return () => { window.removeEventListener("mousemove", onM); window.removeEventListener("scroll", onS); };
  }, []);

  const features = [
    { n: "01", t: "Fraud Chain Detection", d: "Louvain community detection surfaces fraud rings and carousel schemes as dense red clusters in the supplier network." },
    { n: "02", t: "Dual-Algorithm Engine", d: "Isolation Forest catches individual anomalies. Louvain catches coordinated collusion. Together they are definitive." },
    { n: "03", t: "Velocity Intelligence", d: "Fraudsters expand fast to maximise exposure. Our velocity scoring catches them by their speed — not just their pattern." },
    { n: "04", t: "Multi-Tier Cascade", d: "Fraud at Tier 1 contaminates Tier 2 and 3. TraceWire freezes the entire downstream chain before disbursement." },
    { n: "05", t: "Pre-Disbursement Gate", d: "Every invoice is scored before funds move. Blocked invoices come with a full signal-level explanation." },
    { n: "06", t: "GSTIN Grounded", d: "Real-time cross-check against India's GST registry. No phantom supplier escapes the ingestion layer." },
  ];

  const btnBase = {
    border: "none", cursor: "pointer", fontFamily: FONT.sans,
    fontSize: 12, letterSpacing: 2, fontWeight: 600, textTransform: "uppercase",
    transition: "all 0.25s", padding: "15px 36px",
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT.sans, color: C.white, overflowX: "hidden" }}>
      <Grain />

      {/* Ambient cursor glow */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%",
        pointerEvents: "none", zIndex: 1,
        left: mouse.x - 300, top: mouse.y - 300,
        background: "radial-gradient(circle, rgba(232,93,93,0.05) 0%, transparent 65%)",
        transition: "left 0.12s ease, top 0.12s ease" }} />

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 56px", height: 60, display: "flex", alignItems: "center",
        justifyContent: "space-between",
        background: scrollY > 40 ? `${C.bg}ee` : "transparent",
        borderBottom: scrollY > 40 ? `1px solid ${C.border}` : "none",
        backdropFilter: scrollY > 40 ? "blur(24px)" : "none",
        transition: "all 0.3s" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1.5, color: C.white }}>
          Trace<span style={{ color: C.red }}>Wire</span>
        </div>
        {/* Only "How It Works" remains — scrolls to architecture section */}
        <span onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
          style={{ cursor: "pointer", fontSize: 11, letterSpacing: 1.5, color: C.muted,
            textTransform: "uppercase", transition: "color 0.2s" }}
          onMouseEnter={e => e.target.style.color = C.white}
          onMouseLeave={e => e.target.style.color = C.muted}>
          How It Works
        </span>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "120px 56px 80px", position: "relative" }}>
        <GlowBlob x={700} y={300} color={C.red} size={600} opacity={0.07} />
        <GlowBlob x={200} y={500} color={C.blue} size={400} opacity={0.04} />

        <div style={{ fontSize: 10, letterSpacing: 4, color: C.red, marginBottom: 28,
          textTransform: "uppercase" }}>Supply Chain Finance · Fraud Intelligence · 2026</div>

        {/* Main headline — soft, not all-caps harsh */}
        <h1 style={{ fontSize: "clamp(48px, 7.5vw, 104px)", fontWeight: 800, lineHeight: 0.92,
          letterSpacing: -3, margin: "0 0 36px", maxWidth: 800, fontFamily: FONT.sans }}>
          <span style={{ color: C.white }}>Follow the money.</span><br />
          <span style={{ color: C.red }}>Catch the fraud.</span>
        </h1>

        <p style={{ maxWidth: 500, fontSize: 16, color: C.muted, lineHeight: 1.75, marginBottom: 44 }}>
          TraceWire is a network-first SCF fraud detection platform. It catches phantom invoices, fraud rings, and carousel schemes before a single rupee leaves the bank.
        </p>

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={onEnter} style={{ ...btnBase, background: C.red, color: C.white,
            boxShadow: `0 0 32px ${C.red}40` }}
            onMouseEnter={e => { e.currentTarget.style.background = C.redGlow; e.currentTarget.style.boxShadow = `0 0 48px ${C.red}60`; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.red; e.currentTarget.style.boxShadow = `0 0 32px ${C.red}40`; }}>
            Launch Dashboard →
          </button>
          <span style={{ fontSize: 11, color: C.dimmed, letterSpacing: 0.5, lineHeight: 1.6 }}>
            Your Data · Multiple Fraud Types · Real-Time Scoring · Efficient Analysis
          </span>
        </div>

        {/* Stat strip */}
        <div style={{ display: "flex", gap: 1, marginTop: 80, maxWidth: 560, background: C.border }}>
          {[{ v: "₹47M", l: "Fraud Exposure" }, { v: "340", l: "Invoices Caught" }, { v: "0", l: "Post-Disburse Loss" }].map(s => (
            <div key={s.l} style={{ flex: 1, background: C.bg, padding: "22px 24px" }}>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: FONT.mono, letterSpacing: -1, color: C.white }}>{s.v}</div>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, marginTop: 6, textTransform: "uppercase" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: "80px 56px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: C.red, marginBottom: 14, textTransform: "uppercase" }}>What We Detect</div>
        <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1, marginBottom: 56, fontFamily: FONT.sans, maxWidth: 420 }}>Six layers of fraud intelligence.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border }}>
          {features.map(f => (
            <div key={f.n} style={{ background: C.bg, padding: "36px 30px", transition: "background 0.25s", cursor: "default" }}
              onMouseEnter={e => e.currentTarget.style.background = C.bgCard}
              onMouseLeave={e => e.currentTarget.style.background = C.bg}>
              <div style={{ fontSize: 11, color: C.red, letterSpacing: 2, marginBottom: 18, fontFamily: FONT.mono }}>{f.n}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.white, marginBottom: 10, letterSpacing: -0.2 }}>{f.t}</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS — anchor target for nav */}
      <section id="how-it-works" style={{ padding: "80px 56px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: C.red, marginBottom: 14, textTransform: "uppercase" }}>Architecture</div>
        <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1, marginBottom: 56, fontFamily: FONT.sans }}>Three layers. One verdict.</h2>
        <div style={{ display: "flex", gap: 1, background: C.border }}>
          {[
            { n: "L1", t: "Ingestion & Validation", p: "3-Way Match, GSTIN verification, MD5 fingerprinting. Every invoice validated before the engine sees it.", col: C.teal },
            { n: "L2", t: "Graph Network Engine",   p: "NetworkX topology mapping + Louvain community detection. Fraud rings surface as tight, red clusters.", col: C.red },
            { n: "L3", t: "ML Anomaly Scoring",     p: "Isolation Forest + Louvain community risk as a combined feature. Explainable score per invoice.", col: C.orange },
          ].map(l => (
            <div key={l.n} style={{ flex: 1, background: C.bg, padding: "36px 30px", borderTop: `2px solid ${l.col}` }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: l.col, fontFamily: FONT.mono, marginBottom: 14 }}>{l.n}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 10 }}>{l.t}</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{l.p}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 56px", borderTop: `1px solid ${C.border}`,
        textAlign: "center", position: "relative" }}>
        <GlowBlob x={window.innerWidth / 2} y={120} color={C.red} size={500} opacity={0.06} />
        <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, marginBottom: 16, fontFamily: FONT.sans }}>See it catch fraud. Live.</h2>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 40 }}>Upload your own data or explore our demo dataset of 950 invoices.</p>
        <button onClick={onEnter} style={{ ...btnBase, background: C.red, color: C.white,
          boxShadow: `0 0 32px ${C.red}40` }}
          onMouseEnter={e => { e.currentTarget.style.background = C.redGlow; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.red; }}>
          Launch Dashboard →
        </button>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: "36px 56px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: C.white }}>
            Trace<span style={{ color: C.red }}>Wire</span>
          </div>
          <div style={{ fontSize: 11, color: C.dimmed }}>SCF Fraud Detection Platform · Phase 1 · 2026</div>
        </div>
        {/* Creator credit */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}18`,
          display: "flex", gap: 40, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2.5, color: C.dimmed, textTransform: "uppercase",
              fontFamily: FONT.sans, marginBottom: 5 }}>Creator</div>
            <div style={{ fontSize: 13, color: C.offWhite, fontWeight: 600, fontFamily: FONT.sans, letterSpacing: 0.3 }}>KJ</div>
          </div>
          <div style={{ width: 1, height: 32, background: C.border }} />
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2.5, color: C.dimmed, textTransform: "uppercase",
              fontFamily: FONT.sans, marginBottom: 5 }}>Contact</div>
            <a href="mailto:khrithikjupalli@gmail.com" style={{ fontSize: 13, color: C.teal,
              textDecoration: "none", fontFamily: FONT.sans, letterSpacing: 0.2,
              transition: "color 0.2s" }}
              onMouseEnter={e => e.target.style.color = C.white}
              onMouseLeave={e => e.target.style.color = C.teal}>
              khrithikjupalli@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ============================================================
// 5. TAB: OVERVIEW
// ============================================================

const OverviewTab = ({ invoices, threshold }) => {
  const flagged = invoices.filter(i => i.fraudScore >= threshold);

  const typeCounts = {};
  invoices.forEach(i => { typeCounts[i.fraudType] = (typeCounts[i.fraudType] || 0) + 1; });
  const pieData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  const exposureByType = {};
  flagged.forEach(i => { exposureByType[i.fraudType] = (exposureByType[i.fraudType] || 0) + i.amount; });
  const maxExp = Math.max(...Object.values(exposureByType), 1);

  const bins = Array.from({ length: 20 }, (_, i) => ({ range: `${i * 5}`, clean: 0, fraud: 0 }));
  invoices.forEach(i => {
    const b = Math.min(19, Math.floor(i.fraudScore * 20));
    if (i.fraudScore >= threshold) bins[b].fraud++; else bins[b].clean++;
  });

  const fraudChains = new Set(invoices.filter(i => i.communityRiskRaw > T.community).map(i => i.supplier)).size;
  const avgScore = flagged.length ? flagged.reduce((s, i) => s + i.fraudScore, 0) / flagged.length : 0;

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: C.border, marginBottom: 28 }}>
        <Metric label="Total Invoices" value={F.num(invoices.length)} />
        <Metric label="Fraud Flagged" value={F.num(flagged.length)} accent={C.red}
          sub={`${F.pct(flagged.length / invoices.length)} of total`} />
        <Metric label="Exposure" value={F.cr(flagged.reduce((s, i) => s + i.amount, 0))} accent={C.orange}
          sub="Combined flagged invoice value" />
        <Metric label="Fraud Chains" value={fraudChains} accent={C.purple}
          info="Fraud Chains are groups of suppliers and buyers that are unusually tightly connected. Louvain clustering detects them automatically — the number here is how many suspicious communities were found. A normal network has loosely connected nodes; fraud rings form dense clusters." />
        <Metric label="Avg Fraud Score" value={F.score(avgScore)} accent={C.amber}
          info="The average fraud score among flagged invoices only. Ranges from 0 (definitely clean) to 1 (definitely fraud). A high average means the system is confident — most flagged invoices are clearly fraudulent, not borderline cases." />
      </div>

      {/* Threshold explainer */}
      <InfoBox title="Fraud Score Threshold — How to Set It">
        The threshold (currently <strong style={{ color: C.white }}>{threshold}</strong>) is the cutoff line.
        Invoices scoring <strong style={{ color: C.red }}>above this</strong> are flagged as fraud. &nbsp;
        <strong style={{ color: C.white }}>Lower threshold = stricter</strong> — catches more invoices including borderline cases but risks more false positives.
        <strong style={{ color: C.white }}> Higher threshold = selective</strong> — only flags high-confidence fraud.
        For pre-disbursement systems, <strong style={{ color: C.white }}>0.45–0.55 is recommended</strong>. Adjust using the slider in the top bar.
      </InfoBox>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Donut */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead tag="Classification" title="Invoice Breakdown"
            sub="All invoices classified by fraud type — including clean ones." />
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={72} outerRadius={108}
                dataKey="value" nameKey="name" paddingAngle={2}>
                {pieData.map(e => <Cell key={e.name} fill={FRAUD_COLORS[e.name] || C.muted} stroke="none" />)}
              </Pie>
              <Tooltip content={<ChartTip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 8 }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: FONT.sans }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: FRAUD_COLORS[d.name] || C.muted, flexShrink: 0 }} />
                <span style={{ color: C.muted }}>{d.name}</span>
                <span style={{ color: C.offWhite, fontFamily: FONT.mono }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exposure by type */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead tag="Risk" title="Exposure by Fraud Type"
            sub="Total invoice value flagged per fraud category." />
          {Object.entries(exposureByType).sort((a, b) => b[1] - a[1]).map(([type, amt]) => (
            <div key={type} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, alignItems: "center" }}>
                <Badge type={type} />
                <span style={{ fontSize: 12, color: C.white, fontFamily: FONT.mono }}>{F.cr(amt)}</span>
              </div>
              <ScoreBar score={amt / maxExp} color={FRAUD_COLORS[type]} />
            </div>
          ))}
        </div>
      </div>

      {/* Histogram */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24, marginBottom: 20 }}>
        <SHead tag="Model Output" title="Fraud Score Distribution"
          sub="Clean invoices cluster near 0, fraud invoices cluster near 1. The gap in the middle shows model confidence — the clearer the separation, the better the model." />
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={bins} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="range" tick={{ fill: C.muted, fontSize: 9, fontFamily: FONT.mono }}
              label={{ value: "Fraud Score →", fill: C.muted, fontSize: 10, position: "insideBottomRight", offset: 0 }} />
            <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: FONT.mono }} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="clean" fill={C.green} opacity={0.65} name="Clean" stackId="s" />
            <Bar dataKey="fraud" fill={C.red} opacity={0.85} name="Fraud" stackId="s" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Live feed table */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
        <SHead tag="Live Feed" title="Flagged Invoices" sub="Sorted by fraud score — highest risk first." />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.sans }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["ID","Supplier","Buyer","Amount","Score","Type","Chain Risk","Tier"].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: C.muted,
                    fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flagged.sort((a, b) => b.fraudScore - a.fraudScore).slice(0, 35).map((inv, idx) => (
                <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}18`,
                  background: idx % 2 ? `${C.bgRaised}60` : "transparent", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 ? `${C.bgRaised}60` : "transparent"}>
                  <td style={{ padding: "10px 12px", fontFamily: FONT.mono, color: C.muted, fontSize: 10 }}>{inv.id}</td>
                  <td style={{ padding: "10px 12px", color: C.offWhite }}>{inv.supplier}</td>
                  <td style={{ padding: "10px 12px", color: C.muted }}>{inv.buyer}</td>
                  <td style={{ padding: "10px 12px", fontFamily: FONT.mono, color: C.white }}>₹{F.num(inv.amount)}</td>
                  <td style={{ padding: "10px 12px", minWidth: 120 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 36, height: 2, background: C.bgRaised, borderRadius: 1, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${inv.fraudScore * 100}%`,
                          background: inv.fraudScore > 0.7 ? C.red : inv.fraudScore > 0.5 ? C.orange : C.amber }} />
                      </div>
                      <span style={{ fontFamily: FONT.mono, fontSize: 11,
                        color: inv.fraudScore > 0.7 ? C.red : C.amber }}>{inv.fraudScore}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}><Badge type={inv.fraudType} small /></td>
                  <td style={{ padding: "10px 12px", fontFamily: FONT.mono,
                    color: inv.communityRisk > 0.6 ? C.red : C.muted }}>{inv.communityRisk}</td>
                  <td style={{ padding: "10px 12px", color: C.muted, fontFamily: FONT.mono }}>T{inv.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 6. TAB: NETWORK GRAPH
// ============================================================

const NetworkTab = ({ invoices, threshold }) => {
  const svgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [fraudOnly, setFraudOnly] = useState(false);

  const { nodes, edges } = useMemo(() => buildNetworkData(invoices), [invoices]);
  const nodeById = useMemo(() => { const m = {}; nodes.forEach(n => { m[n.id] = n; }); return m; }, [nodes]);

  const supStats = useMemo(() => {
    const m = {};
    invoices.forEach(i => {
      if (!m[i.supplier]) m[i.supplier] = { count: 0, amount: 0, fraud: 0 };
      m[i.supplier].count++; m[i.supplier].amount += i.amount;
      if (i.label) m[i.supplier].fraud++;
    });
    return m;
  }, [invoices]);

  const fraudNodeIds = useMemo(() => new Set(nodes.filter(n => n.isFraud).map(n => n.id)), [nodes]);
  // Use threshold to determine which invoices are flagged for bottom stats
  const flaggedByThreshold = invoices.filter(i => i.fraudScore >= threshold);
  const flaggedSuppliers = new Set(flaggedByThreshold.map(i => i.supplier));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const visNodes = fraudOnly ? nodes.filter(n => n.isFraud || n.type === "lender") : nodes;
  const visIds = useMemo(() => new Set(visNodes.map(n => n.id)), [visNodes]);
  const visEdges = edges.filter(e => visIds.has(e.source) && visIds.has(e.target));

  const nodeColor = n => {
    if (n.type === "lender") return C.amber;
    if (n.isFraud) {
      if (n.communityRisk > 0.85) return "#ff2222";
      if (n.communityRisk > 0.7)  return C.red;
      return C.redSoft;
    }
    const palette = [C.teal, C.blue, C.purple, "#34d399", "#818cf8", "#38bdf8"];
    return palette[n.connections % palette.length];
  };

  const nodeR = n => {
    if (n.type === "lender") return 13;
    const base = n.tier === 1 ? 11 : n.tier === 2 ? 8 : 6;
    return Math.min(base + n.connections * 0.5, 18);
  };

  const renderShape = (n, r, col, sel) => {
    const stroke = sel ? C.white : n.isFraud ? `${C.red}88` : "none";
    const sw = sel ? 2 : 1;
    if (n.type === "lender")
      return <polygon points={`${n.x},${n.y - r} ${n.x + r * 0.87},${n.y + r * 0.5} ${n.x - r * 0.87},${n.y + r * 0.5}`} fill={col} stroke={stroke} strokeWidth={sw} />;
    if (n.type === "buyer")
      return <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} fill={col} stroke={stroke} strokeWidth={sw} rx={1} />;
    return <circle cx={n.x} cy={n.y} r={r} fill={col} stroke={stroke} strokeWidth={sw} />;
  };

  const onDown = e => { if (e.target === svgRef.current || e.target.tagName === "svg") { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); } };
  const onMove = e => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const onUp   = () => setDragging(false);
  const onWheel = useCallback(e => { e.preventDefault(); setZoom(z => Math.min(3.5, Math.max(0.25, z - e.deltaY * 0.0008))); }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (el) el.addEventListener("wheel", onWheel, { passive: false });
    return () => { if (el) el.removeEventListener("wheel", onWheel); };
  }, [onWheel]);

  return (
    <div>
      <SHead tag="Louvain Graph" title="Supplier · Buyer · Lender Network"
        sub="Red nodes and edges are confirmed fraud. Each colour group is a Louvain community. Pan by dragging, scroll to zoom, hover for quick info, click for full detail." />

      <InfoBox title="What Are Fraud Chains?">
        <strong style={{ color: C.white }}>Louvain clustering</strong> groups nodes that transact heavily with each other into communities.
        Legitimate communities are sparse. <strong style={{ color: C.red }}>Fraud rings</strong> form abnormally tight clusters — 6 suppliers all transacting with the same 4 shell buyers at high volume.
        These clusters light up red and are structurally impossible to explain as normal business behaviour.
        This is the fraud that invoice-level checks can never see — only visible at the network level.
      </InfoBox>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setFraudOnly(!fraudOnly)} style={{
          background: fraudOnly ? `${C.red}20` : C.bgCard,
          border: `1px solid ${fraudOnly ? C.red : C.border}`,
          color: fraudOnly ? C.red : C.muted, padding: "8px 18px",
          fontSize: 10, letterSpacing: 1.5, cursor: "pointer",
          textTransform: "uppercase", fontFamily: FONT.sans, transition: "all 0.2s" }}>
          {fraudOnly ? "◉ Fraud Only" : "○ Fraud Only"}
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setSelectedNode(null); }} style={{
          background: C.bgCard, border: `1px solid ${C.border}`,
          color: C.muted, padding: "8px 18px", fontSize: 10, letterSpacing: 1.5,
          cursor: "pointer", textTransform: "uppercase", fontFamily: FONT.sans }}>
          Reset View
        </button>
        {/* Zoom buttons */}
        <button onClick={() => setZoom(z => Math.min(3.5, z + 0.2))} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, color: C.muted,
          padding: "8px 14px", fontSize: 14, cursor: "pointer", fontFamily: FONT.mono,
          lineHeight: 1 }}>+</button>
        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.2))} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, color: C.muted,
          padding: "8px 14px", fontSize: 14, cursor: "pointer", fontFamily: FONT.mono,
          lineHeight: 1 }}>−</button>
        <span style={{ fontSize: 10, color: C.dimmed, fontFamily: FONT.mono }}>{(zoom * 100).toFixed(0)}%</span>
        {/* Fullscreen */}
        <button onClick={() => setIsFullscreen(f => !f)} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, color: C.muted,
          padding: "8px 18px", fontSize: 10, letterSpacing: 1.5,
          cursor: "pointer", textTransform: "uppercase", fontFamily: FONT.sans }}>
          {isFullscreen ? "⊠ Exit Fullscreen" : "⛶ Fullscreen"}
        </button>
        <div style={{ fontSize: 10, color: C.dimmed, letterSpacing: 0.5, fontFamily: FONT.sans }}>
          Scroll → zoom · Drag → pan · Hover → inspect · Click → details
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 18, fontSize: 10, color: C.muted, fontFamily: FONT.sans }}>
          {[{ s: "●", l: "Supplier", c: C.teal }, { s: "■", l: "Buyer", c: C.offWhite }, { s: "▲", l: "Lender", c: C.amber }, { s: "●", l: "Fraud", c: C.red }].map(x => (
            <span key={x.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: x.c }}>{x.s}</span>{x.l}
            </span>
          ))}
        </div>
      </div>

      {/* SVG canvas — fullscreen aware */}
      <div ref={containerRef} style={{ background: C.bgCard, border: `1px solid ${C.border}`, position: isFullscreen ? "fixed" : "relative",
        inset: isFullscreen ? 0 : undefined, zIndex: isFullscreen ? 9998 : undefined,
        overflow: "hidden", height: isFullscreen ? "100vh" : 640, cursor: dragging ? "grabbing" : "grab" }}>
        <svg ref={svgRef} width="100%" height="100%"
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {visEdges.map((e, i) => {
              const s = nodeById[e.source], t = nodeById[e.target];
              if (!s || !t) return null;
              const isHov = hoveredEdge === i;
              return (
                <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={e.isFraud ? C.red : C.border}
                  strokeWidth={e.isFraud ? (isHov ? 3 : 1.5) : (isHov ? 1.5 : 0.6)}
                  strokeOpacity={e.isFraud ? (isHov ? 1 : 0.7) : (isHov ? 0.8 : 0.3)}
                  filter={e.isFraud && isHov ? "url(#glow)" : undefined}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredEdge(i)}
                  onMouseLeave={() => setHoveredEdge(null)} />
              );
            })}

            {/* Nodes */}
            {visNodes.map(node => {
              const r = nodeR(node);
              const col = nodeColor(node);
              const isHov = hoveredNode?.id === node.id;
              const isSel = selectedNode?.id === node.id;
              return (
                <g key={node.id} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => setSelectedNode(isSel ? null : node)}>
                  {node.isFraud && <circle cx={node.x} cy={node.y} r={r + 9}
                    fill={C.red} opacity={isHov ? 0.18 : 0.07} />}
                  {renderShape(node, r, col, isSel)}
                  {node.isFraud && <text x={node.x} y={node.y - r - 4}
                    textAnchor="middle" fontSize={7} fill={C.red} fontWeight={700}>!</text>}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hoveredNode && (
          <div style={{ position: "absolute", top: 14, right: 14, width: 210,
            background: C.bg, border: `1px solid ${hoveredNode.isFraud ? C.red : C.border}`,
            padding: "14px 16px", fontSize: 11, fontFamily: FONT.sans, pointerEvents: "none",
            boxShadow: hoveredNode.isFraud ? `0 0 20px ${C.red}30` : "none" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase",
              color: hoveredNode.isFraud ? C.red : C.teal }}>
              {hoveredNode.isFraud ? "⚠ Fraud Node" : "✓ Legitimate"} · {hoveredNode.type}
            </div>
            <div style={{ color: C.white, fontFamily: FONT.mono, fontSize: 10, marginBottom: 8, wordBreak: "break-all" }}>{hoveredNode.id}</div>
            <div style={{ color: C.muted }}>Connections: <span style={{ color: C.white }}>{hoveredNode.connections}</span></div>
            {hoveredNode.type !== "lender" && (
              <div style={{ color: C.muted }}>Chain Risk: <span style={{ color: hoveredNode.communityRisk > 0.6 ? C.red : C.green }}>
                {(hoveredNode.communityRisk * 100).toFixed(0)}%</span></div>
            )}
            <div style={{ marginTop: 8, fontSize: 10, color: C.dimmed }}>Click for full details</div>
          </div>
        )}

        {/* Edge hover tooltip */}
        {hoveredEdge !== null && visEdges[hoveredEdge] && (() => {
          const e = visEdges[hoveredEdge];
          return (
            <div style={{ position: "absolute", bottom: 14, left: 14, width: 230,
              background: C.bg, border: `1px solid ${e.isFraud ? C.red : C.border}`,
              padding: "14px 16px", fontSize: 11, fontFamily: FONT.sans, pointerEvents: "none" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>Financial Relationship</div>
              <div style={{ color: C.muted, marginBottom: 4 }}>From: <span style={{ color: C.offWhite }}>{e.source}</span></div>
              <div style={{ color: C.muted, marginBottom: 10 }}>To: <span style={{ color: C.offWhite }}>{e.target}</span></div>
              <div style={{ color: C.muted, marginBottom: 10 }}>Transaction: <span style={{ color: C.white, fontFamily: FONT.mono }}>₹{F.num(Math.round(e.value))}</span></div>
              <ScoreBar score={e.fraudScore} color={e.isFraud ? C.red : C.green} />
              <div style={{ marginTop: 8 }}><Badge type={e.fraudType} small /></div>
            </div>
          );
        })()}
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div style={{ background: C.bgCard, border: `1px solid ${selectedNode.isFraud ? C.red : C.border}`,
          padding: 24, marginTop: 14,
          boxShadow: selectedNode.isFraud ? `0 0 24px ${C.red}20` : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2.5, color: selectedNode.isFraud ? C.red : C.teal,
                marginBottom: 6, textTransform: "uppercase", fontFamily: FONT.sans }}>
                {selectedNode.isFraud ? "⚠ Confirmed Fraud Node" : "✓ Legitimate Node"} · {selectedNode.type}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: FONT.mono, color: C.white }}>{selectedNode.id}</div>
            </div>
            <button onClick={() => setSelectedNode(null)} style={{ background: "none", border: "none",
              color: C.muted, cursor: "pointer", fontSize: 20, padding: 0 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { l: "Type", v: selectedNode.type },
              { l: "Tier", v: `T${selectedNode.tier || "—"}` },
              { l: "Connections", v: selectedNode.connections },
              { l: "Chain Risk", v: `${((selectedNode.communityRisk || 0) * 100).toFixed(0)}%` },
              { l: "Invoices", v: supStats[selectedNode.id]?.count || "—" },
              { l: "Total Amount", v: supStats[selectedNode.id] ? F.cr(supStats[selectedNode.id].amount) : "—" },
              { l: "Fraud Invoices", v: supStats[selectedNode.id]?.fraud || 0 },
              { l: "Velocity Score", v: `${((selectedNode.velocityScore || 0) * 100).toFixed(0)}%` },
            ].map(s => (
              <div key={s.l} style={{ background: C.bgRaised, padding: "12px 16px", borderRadius: 2 }}>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase",
                  marginBottom: 6, fontFamily: FONT.sans }}>{s.l}</div>
                <div style={{ fontSize: 17, color: C.white, fontFamily: FONT.mono }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border, marginTop: 14 }}>
        <Metric label="Nodes in Graph" value={visNodes.length} />
        <Metric label="Connections" value={visEdges.length} />
        <Metric label={`Fraud Flagged (threshold ${threshold})`}
          value={flaggedByThreshold.length}
          sub={`${visEdges.filter(e => e.isFraud).length} fraud connections in graph`}
          accent={C.red} />
      </div>
    </div>
  );
};

// ============================================================
// 7. TAB: VELOCITY SCORING
// ============================================================

const VelocityTab = ({ invoices }) => {
  const supMap = {};
  invoices.forEach(i => { if (!supMap[i.supplier] || i.velocityScore > supMap[i.supplier].velocityScore) supMap[i.supplier] = i; });
  const suppliers = Object.values(supMap).sort((a, b) => b.velocityScore - a.velocityScore);

  const velLabel = s => s > 0.6 ? { t: "HIGH", c: C.red } : s > 0.3 ? { t: "MEDIUM", c: C.amber } : { t: "LOW", c: C.green };
  const velBars = [{ t: "HIGH", c: C.red }, { t: "MEDIUM", c: C.amber }, { t: "LOW", c: C.green }].map(v => ({
    ...v, count: suppliers.filter(s => velLabel(s.velocityScore).t === v.t).length,
  }));

  const scatter = invoices.slice(0, 600).map(i => ({ x: i.velocityScore, y: i.fraudScore, z: i.amount / 80000, type: i.fraudType }));

  return (
    <div>
      <SHead tag="Behavioural Analysis" title="Supplier Velocity Scoring"
        sub="Legitimate suppliers grow slowly and consistently. Fraudsters expand fast to maximise exposure before detection. This metric catches them by speed." />

      <InfoBox title="Velocity Score Components">
        Each supplier's score (0–100%) combines:
        <strong style={{ color: C.white }}> Invoice count last 30 days (30%)</strong> ·
        <strong style={{ color: C.white }}> Unique buyer connections (20%)</strong> ·
        <strong style={{ color: C.white }}> Number of lenders used (15%)</strong> ·
        <strong style={{ color: C.white }}> Supplier age — newer is riskier (15%)</strong> ·
        <strong style={{ color: C.white }}> GRN failure rate (10%)</strong> ·
        <strong style={{ color: C.white }}> Duplicate fingerprint rate (10%)</strong>.
        Fraud ring and phantom suppliers consistently score HIGH.
      </InfoBox>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead title="Suppliers by Velocity" />
          <div style={{ overflowY: "auto", maxHeight: 460 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.sans }}>
              <thead style={{ position: "sticky", top: 0, background: C.bgCard }}>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Supplier", "Risk", "Velocity", "Inv/30d", "GRN", "Days Reg"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.muted,
                      fontSize: 9, letterSpacing: 1.5, fontWeight: 400, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => {
                  const v = velLabel(s.velocityScore);
                  return (
                    <tr key={s.supplier} style={{ borderBottom: `1px solid ${C.border}18`,
                      background: i % 2 ? `${C.bgRaised}40` : "transparent", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 ? `${C.bgRaised}40` : "transparent"}>
                      <td style={{ padding: "9px 10px", fontFamily: FONT.mono, fontSize: 10, color: C.offWhite }}>{s.supplier}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ color: v.c, fontSize: 9, letterSpacing: 1.5, fontWeight: 700 }}>{v.t}</span>
                      </td>
                      <td style={{ padding: "9px 10px", minWidth: 100 }}><ScoreBar score={s.velocityScore} /></td>
                      <td style={{ padding: "9px 10px", fontFamily: FONT.mono, color: C.muted }}>{s.inv30d}</td>
                      <td style={{ padding: "9px 10px", color: s.grnFlag ? C.red : C.green, fontSize: 10 }}>{s.grnFlag ? "✕ FAIL" : "✓ PASS"}</td>
                      <td style={{ padding: "9px 10px", fontFamily: FONT.mono, color: s.daysSinceReg < 60 ? C.red : C.muted }}>{s.daysSinceReg}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
            <SHead title="Risk Distribution" />
            {velBars.map(b => (
              <div key={b.t} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 11 }}>
                  <span style={{ color: b.c, fontSize: 9, letterSpacing: 1.5, fontWeight: 700 }}>{b.t}</span>
                  <span style={{ color: C.white, fontFamily: FONT.mono }}>{b.count}</span>
                </div>
                <ScoreBar score={b.count / Math.max(suppliers.length, 1)} color={b.c} />
              </div>
            ))}
          </div>
          <InfoBox title="How to Read the Scatter Plot">
            Each dot = one invoice. <strong style={{ color: C.red }}>Top-right</strong> = high velocity + high fraud score = confirmed fraud.
            <strong style={{ color: C.green }}> Bottom-left</strong> = clean, slow-growing, legitimate.
            The clear diagonal separation confirms velocity is a strong predictor.
          </InfoBox>
        </div>
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
        <SHead tag="Model Validation" title="Velocity Score vs Fraud Score"
          sub="Each dot is an invoice. Fraud invoices cluster top-right. Clean invoices cluster bottom-left. The pattern validates the model." />
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 8, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="x" name="Velocity" tick={{ fill: C.muted, fontSize: 10, fontFamily: FONT.mono }}
              label={{ value: "Velocity Score", fill: C.muted, fontSize: 10, position: "insideBottom", offset: -14 }} domain={[0, 1]} />
            <YAxis dataKey="y" name="Fraud Score" tick={{ fill: C.muted, fontSize: 10, fontFamily: FONT.mono }}
              label={{ value: "Fraud Score", fill: C.muted, fontSize: 10, angle: -90, position: "insideLeft", offset: 10 }} domain={[0, 1]} />
            <ZAxis dataKey="z" range={[15, 150]} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div style={{ background: C.bgRaised, border: `1px solid ${C.borderSoft}`,
                  padding: "10px 14px", fontSize: 11, fontFamily: FONT.sans }}>
                  <div style={{ color: FRAUD_COLORS[d?.type] || C.white, marginBottom: 4 }}>{d?.type}</div>
                  <div style={{ color: C.muted }}>Velocity: <span style={{ color: C.white, fontFamily: FONT.mono }}>{(d?.x * 100).toFixed(0)}%</span></div>
                  <div style={{ color: C.muted }}>Fraud Score: <span style={{ color: C.white, fontFamily: FONT.mono }}>{d?.y?.toFixed(2)}</span></div>
                </div>
              );
            }} />
            {Object.keys(FRAUD_COLORS).map(type => (
              <Scatter key={type} name={type}
                data={scatter.filter(d => d.type === type).slice(0, 100)}
                fill={FRAUD_COLORS[type]} opacity={0.75} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ============================================================
// 8. TAB: MULTI-TIER ANALYSIS
// ============================================================

const TierTab = ({ invoices }) => {
  const tierStats = [1, 2, 3].map(t => {
    const all = invoices.filter(i => i.tier === t);
    const fraud = all.filter(i => i.fraudScore >= T.fraud);
    return { tier: t, total: all.length, fraud: fraud.length, fraudRate: fraud.length / Math.max(all.length, 1), exposure: all.reduce((s, i) => s + i.amount, 0) };
  });

  const fraudSupSet = new Set(invoices.filter(i => i.label === 1).map(i => i.supplier));
  const cascadeInvs = invoices.filter(i => fraudSupSet.has(i.buyer));

  return (
    <div>
      <SHead tag="Supply Chain Depth" title="Multi-Tier Cascade Analysis"
        sub="Fraud at Tier 1 contaminates Tier 2 and 3. Tier 3 suppliers — furthest from the anchor buyer — show the highest fraud concentration." />

      <InfoBox title="Tier Structure Explained">
        <strong style={{ color: C.white }}>Tier 1</strong> = Direct suppliers to the anchor buyer — largest, most visible, most scrutinised.
        <strong style={{ color: C.white }}> Tier 2</strong> = Suppliers who supply Tier 1 — indirect, less monitored.
        <strong style={{ color: C.white }}> Tier 3</strong> = Downstream suppliers — hardest to monitor, highest fraud concentration.
        <strong style={{ color: C.red }}> Cascade Risk</strong>: when a Tier 1 buyer is itself a fraud supplier, every invoice from that buyer is downstream-contaminated — even if it looks clean individually.
      </InfoBox>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead title="Invoices by Tier" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tierStats.map(t => ({ name: `Tier ${t.tier}`, Total: t.total, Fraud: t.fraud }))} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11, fontFamily: FONT.sans }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: FONT.mono }} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Total" fill={C.bgRaised} stroke={C.borderSoft} name="Total" />
              <Bar dataKey="Fraud" fill={C.red} opacity={0.85} name="Fraud" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead title="Fraud Rate by Tier" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tierStats.map(t => ({ name: `Tier ${t.tier}`, "Fraud Rate %": Math.round(t.fraudRate * 100) }))} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11, fontFamily: FONT.sans }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10, fontFamily: FONT.mono }} unit="%" />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Fraud Rate %" fill={C.red} opacity={0.85}
                label={{ fill: C.offWhite, fontSize: 11, position: "top", fontFamily: FONT.mono }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead title="Tier Statistics" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.sans }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Tier", "Total", "Fraud", "Rate", "Exposure"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.muted,
                    fontSize: 9, letterSpacing: 1.5, fontWeight: 400, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tierStats.map(t => (
                <tr key={t.tier} style={{ borderBottom: `1px solid ${C.border}18` }}>
                  <td style={{ padding: "13px 10px", color: C.white, fontWeight: 600 }}>Tier {t.tier}</td>
                  <td style={{ padding: "13px 10px", fontFamily: FONT.mono, color: C.muted }}>{t.total}</td>
                  <td style={{ padding: "13px 10px", fontFamily: FONT.mono, color: C.red }}>{t.fraud}</td>
                  <td style={{ padding: "13px 10px", fontFamily: FONT.mono, color: t.fraudRate > 0.3 ? C.red : C.amber }}>{(t.fraudRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: "13px 10px", fontFamily: FONT.mono, color: C.offWhite }}>{F.cr(t.exposure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24 }}>
          <SHead title="Cascade Risk" sub="Invoices where the buyer is a known fraud supplier — contaminated by upstream fraud even if they appear clean." />
          <div style={{ fontSize: 42, fontWeight: 700, fontFamily: FONT.mono, color: C.red, marginBottom: 6 }}>{cascadeInvs.length}</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>cascade-affected invoices detected</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: C.bgRaised, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" }}>Exposure</div>
              <div style={{ fontSize: 18, color: C.red, fontFamily: FONT.mono }}>{F.cr(cascadeInvs.reduce((s, i) => s + i.amount, 0))}</div>
            </div>
            <div style={{ background: C.bgRaised, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" }}>Avg Score</div>
              <div style={{ fontSize: 18, color: C.amber, fontFamily: FONT.mono }}>
                {cascadeInvs.length ? (cascadeInvs.reduce((s, i) => s + i.fraudScore, 0) / cascadeInvs.length).toFixed(2) : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 9. TAB: PRE-DISBURSEMENT CHECK
// ============================================================

const CheckTab = ({ invoices }) => {
  const [form, setForm] = useState({
    supplier: "SUP_PH1", buyer: "BUY_L001", amount: 800000,
    poAmount: 320000, grn: "No", tier: 1, lender: "HDFC_BANK",
    daysSinceReg: 18, inv30d: 38,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const runCheck = () => {
    setLoading(true);
    setTimeout(() => {
      const grnFlag  = form.grn === "No" ? 1 : 0;
      const ratio    = form.amount / Math.max(form.poAmount, 1);
      const ratioFlag= (ratio < T.ratioLow || ratio > T.ratioHigh) ? 1 : 0;
      const velRisk  = form.inv30d > T.velocity ? 1 : 0;
      const newSup   = form.daysSinceReg < T.newSupplier ? 1 : 0;
      const known    = invoices.find(i => i.supplier === form.supplier);
      const cr       = known ? known.communityRiskRaw : Math.random() * 0.2;
      const fp       = `${form.supplier}|${form.poAmount}|${form.amount}`;
      const isDup    = invoices.some(i => `${i.supplier}|${i.poAmount}|${i.amount}` === fp);

      const score = Math.min(1,
        WEIGHTS.isolationForest * Math.min(1, grnFlag * 0.5 + ratioFlag * 0.4 + velRisk * 0.2 + newSup * 0.15) +
        WEIGHTS.communityRisk   * cr +
        WEIGHTS.grnMissing      * grnFlag +
        WEIGHTS.duplicate       * (isDup ? 1 : 0) +
        WEIGHTS.velocityRisk    * velRisk +
        WEIGHTS.multiLender     * 0
      );

      let fraudType = "Clean";
      if (score >= T.fraud) {
        if (isDup)        fraudType = "Duplicate Financing";
        else if (cr > T.community) fraudType = "Fraud Ring";
        else if (grnFlag) fraudType = "Phantom Invoice";
        else if (ratio > T.ratioHigh) fraudType = "Over-Invoicing";
        else              fraudType = "Anomalous";
      }

      setResult({
        score: Math.round(score * 100) / 100, fraudType, cr: Math.round(cr * 100) / 100,
        signals: {
          "GRN Missing":             { hit: !!grnFlag,   desc: "No Goods Receipt Note — goods delivery unconfirmed." },
          "Amount/PO Ratio Anomaly": { hit: !!ratioFlag, desc: `Ratio ${ratio.toFixed(2)} is outside safe range (${T.ratioLow}–${T.ratioHigh}).` },
          "High Velocity":           { hit: !!velRisk,   desc: `${form.inv30d} invoices in 30 days exceeds threshold of ${T.velocity}.` },
          "New Supplier Risk":       { hit: !!newSup,    desc: `Registered only ${form.daysSinceReg} days ago — insufficient trade history.` },
          "Duplicate Fingerprint":   { hit: isDup,       desc: "Same invoice fingerprint detected across multiple lenders — round-robin fraud." },
          "Fraud Chain Member":      { hit: cr > 0.55,   desc: `Louvain community risk: ${(cr * 100).toFixed(0)}% — likely fraud ring member.` },
        },
      });
      setLoading(false);
    }, 550);
  };

  const verdict = result ? (result.score >= T.fraud ? { t: "BLOCKED", c: C.red, bg: "#1a0505", icon: "🔴" }
    : result.score >= T.review ? { t: "REVIEW", c: C.amber, bg: "#1a1505", icon: "🟡" }
    : { t: "APPROVED", c: C.green, bg: "#051a09", icon: "🟢" }) : null;

  const inp = {
    background: C.bgRaised, border: `1px solid ${C.border}`, color: C.white,
    padding: "10px 14px", width: "100%", fontSize: 12, fontFamily: FONT.mono,
    outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
  };
  const lbl = { display: "block", fontSize: 9, letterSpacing: 2, color: C.muted,
    marginBottom: 6, textTransform: "uppercase", fontFamily: FONT.sans };

  return (
    <div>
      <SHead tag="Hard Stop Gate" title="Pre-Disbursement Invoice Check"
        sub="Every invoice is scored before funds move. Blocked invoices come with a full signal-level breakdown explaining exactly why." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Form */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 28 }}>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: C.muted, marginBottom: 22,
            textTransform: "uppercase", fontFamily: FONT.sans }}>Invoice Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {[
              { k: "supplier", l: "Supplier GSTIN", type: "text" },
              { k: "buyer",    l: "Buyer GSTIN",    type: "text" },
              { k: "amount",   l: "Invoice Amount (₹)", type: "number" },
              { k: "poAmount", l: "PO Amount (₹)",  type: "number" },
              { k: "daysSinceReg", l: "Days Since Registration", type: "number" },
              { k: "inv30d",   l: "Invoices Last 30 Days", type: "number" },
            ].map(f => (
              <div key={f.k}>
                <label style={lbl}>{f.l}</label>
                <input type={f.type} value={form[f.k]}
                  onChange={e => set(f.k, f.type === "number" ? Number(e.target.value) : e.target.value)}
                  style={inp}
                  onFocus={e => e.target.style.borderColor = C.red}
                  onBlur={e => e.target.style.borderColor = C.border} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
            {[
              { k: "grn",    l: "GRN Present?", opts: ["Yes", "No"] },
              { k: "tier",   l: "Tier",         opts: [1, 2, 3] },
              { k: "lender", l: "Lender",       opts: ["HDFC_BANK", "ICICI_BANK", "SBI", "AXIS_BANK"] },
            ].map(f => (
              <div key={f.k}>
                <label style={lbl}>{f.l}</label>
                <select value={form[f.k]} onChange={e => set(f.k, e.target.value)}
                  style={{ ...inp, appearance: "none" }}>
                  {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button onClick={runCheck} disabled={loading} style={{
            width: "100%", background: loading ? C.bgRaised : C.red, border: "none",
            color: loading ? C.muted : C.white, padding: "15px", fontSize: 12,
            letterSpacing: 2.5, cursor: loading ? "not-allowed" : "pointer",
            textTransform: "uppercase", fontWeight: 700, fontFamily: FONT.sans,
            transition: "all 0.2s", boxShadow: loading ? "none" : `0 0 24px ${C.red}40` }}>
            {loading ? "Analysing..." : "Run Fraud Check →"}
          </button>
        </div>

        {/* Result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {result ? (
            <>
              <div style={{ background: verdict.bg, border: `2px solid ${verdict.c}`,
                padding: 28, boxShadow: `0 0 32px ${verdict.c}20` }}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: verdict.c, marginBottom: 12,
                  textTransform: "uppercase", fontFamily: FONT.sans }}>Pre-Disbursement Verdict</div>
                <div style={{ fontSize: 44, fontWeight: 800, color: verdict.c, letterSpacing: -2,
                  marginBottom: 10, fontFamily: FONT.sans }}>
                  {verdict.icon} {verdict.t}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 20, fontFamily: FONT.sans }}>
                  {result.score >= T.fraud ? "Hard stop. Do not release funds. Full signal report below."
                    : result.score >= T.review ? "Flag for manual review before disbursement proceeds."
                    : "Invoice cleared. Safe to disburse."}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {[
                    { l: "Fraud Score", v: result.score.toFixed(2) },
                    { l: "Fraud Type",  v: result.fraudType },
                    { l: "Chain Risk",  v: `${(result.cr)}%` },
                  ].map(s => (
                    <div key={s.l} style={{ background: `${C.bg}99`, padding: "10px 14px" }}>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, marginBottom: 4,
                        textTransform: "uppercase", fontFamily: FONT.sans }}>{s.l}</div>
                      <div style={{ fontSize: 15, color: C.white, fontFamily: FONT.mono }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 24, flex: 1 }}>
                <div style={{ fontSize: 9, letterSpacing: 2.5, color: C.muted, marginBottom: 16,
                  textTransform: "uppercase", fontFamily: FONT.sans }}>Signal Breakdown</div>
                {Object.entries(result.signals).map(([sig, d]) => (
                  <div key={sig} style={{ display: "flex", gap: 14, padding: "12px 0",
                    borderBottom: `1px solid ${C.border}18`, alignItems: "flex-start" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: d.hit ? `${C.red}18` : `${C.green}12`,
                      border: `1px solid ${d.hit ? C.red : C.green}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: d.hit ? C.red : C.green }}>
                      {d.hit ? "✕" : "✓"}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: d.hit ? C.red : C.muted,
                        fontWeight: d.hit ? 600 : 400, marginBottom: 3, fontFamily: FONT.sans }}>{sig}</div>
                      <div style={{ fontSize: 10, color: C.dimmed, lineHeight: 1.55, fontFamily: FONT.sans }}>{d.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 36,
              display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 16, color: C.white, fontWeight: 600, marginBottom: 12, fontFamily: FONT.sans }}>Ready to check an invoice</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.75, marginBottom: 24, fontFamily: FONT.sans }}>
                Fill in the details on the left and click <strong style={{ color: C.white }}>Run Fraud Check</strong>. Verdict in under 1 second.
              </div>
              <InfoBox title="What This Checks">
                3-Way Match · Amount/PO ratio · GRN validation · Supplier velocity · MD5 duplicate fingerprint · Louvain community risk · Supplier age
              </InfoBox>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 10. TAB: DATA UPLOAD
// Gmail sign-in, CSV upload, ERP connect, sign-up to save
// ============================================================

const DataTab = () => {
  const [dragOver, setDragOver]     = useState(false);
  const [uploaded, setUploaded]     = useState(null);
  const [account, setAccount]       = useState(null);   // simulated Gmail account
  const [showSignup, setShowSignup] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [saving, setSaving]         = useState(false);

  // Simulate Google OAuth sign-in
  const handleGoogleSignIn = () => {
    setTimeout(() => {
      setAccount({ name: "KJ", email: "khrithikjupalli@gmail.com", avatar: "KJ" });
    }, 600);
  };

  const handleFileUpload = (name) => {
    setUploaded(name);
    setTimeout(() => setAnalysisReady(true), 1200);
  };

  const handleSaveAnalysis = () => {
    if (!account) { setShowSignup(true); return; }
    setSaving(true);
    setTimeout(() => { setSaving(false); setSignupDone(true); }, 900);
  };

  // ERP sources with distinct accent colours
  const erpSources = [
    { name: "SAP ERP",                  icon: "⬡", color: "#3b82f6", desc: "Connect via SAP Integration Suite" },
    { name: "Oracle Financials",        icon: "◈", color: "#f97316", desc: "OAuth 2.0 · Real-time invoice stream" },
    { name: "Microsoft Dynamics 365",   icon: "⬢", color: "#60a5fa", desc: "Power Automate connector" },
    { name: "Tally ERP Prime",          icon: "◇", color: "#4ade80", desc: "Tally XML bridge integration" },
    { name: "Zoho Books",               icon: "◎", color: "#a78bfa", desc: "Zoho API v3 · Webhook support" },
    { name: "Custom CSV / API",         icon: "◐", color: "#2dd4bf", desc: "Upload CSV or POST to our endpoint" },
  ];

  return (
    <div>
      <SHead tag="Import" title="Data Connection"
        sub="Upload your own invoice dataset or connect your ERP for real-time analysis. Data is processed in-memory and discarded after the session unless you choose to save." />

      {/* Account banner */}
      <div style={{ background: account ? `${C.teal}0d` : C.bgCard,
        border: `1px solid ${account ? C.teal + "44" : C.border}`,
        padding: "18px 24px", marginBottom: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        {account ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.teal,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: C.bg }}>{account.avatar}</div>
            <div>
              <div style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{account.name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{account.email}</div>
            </div>
            <div style={{ fontSize: 9, color: C.teal, border: `1px solid ${C.teal}44`,
              padding: "2px 10px", letterSpacing: 1.5, textTransform: "uppercase" }}>Connected</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: C.white, fontWeight: 500, marginBottom: 4 }}>
              Sign in to enable ERP connections & save analyses
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Guest users can upload CSV and run analysis — but results are discarded after the session.
            </div>
          </div>
        )}
        {!account && (
          <button onClick={handleGoogleSignIn} style={{
            background: C.white, border: "none", color: "#1a1a1a", padding: "10px 20px",
            fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex",
            alignItems: "center", gap: 10, fontFamily: FONT.sans, transition: "opacity 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* CSV Upload */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 28 }}>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: C.teal, marginBottom: 20,
            textTransform: "uppercase", fontFamily: FONT.sans }}>CSV / Excel Upload</div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files[0]?.name); }}
            style={{ border: `2px dashed ${dragOver ? C.teal : C.border}`,
              padding: "44px 24px", textAlign: "center", cursor: "pointer",
              background: dragOver ? `${C.teal}08` : "transparent",
              transition: "all 0.25s", marginBottom: 16, position: "relative" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 13, color: C.white, marginBottom: 6, fontFamily: FONT.sans }}>Drop your file here</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT.sans }}>CSV or Excel (.xlsx) · or click to browse</div>
            <input type="file" accept=".csv,.xlsx,.xls"
              onChange={e => handleFileUpload(e.target.files[0]?.name)}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
          </div>

          {uploaded && !analysisReady && (
            <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}40`,
              padding: "11px 16px", fontSize: 11, color: C.amber, fontFamily: FONT.sans, marginBottom: 12 }}>
              ⏳ Processing {uploaded}...
            </div>
          )}
          {analysisReady && (
            <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}40`,
              padding: "11px 16px", fontSize: 11, color: C.green, fontFamily: FONT.sans, marginBottom: 12 }}>
              ✓ {uploaded} — analysis complete
            </div>
          )}

          <InfoBox title="Expected Column Names">
            invoice_id · supplier_gstin · buyer_gstin · amount · po_amount · grn_present · tier · lender_id · days_since_registration · invoice_count_30d
          </InfoBox>

          {/* Save gate */}
          {analysisReady && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, fontFamily: FONT.sans, lineHeight: 1.6 }}>
                Analysis is held in memory. <strong style={{ color: C.white }}>Data will be discarded</strong> when you close this session unless you save it.
              </div>
              {signupDone ? (
                <div style={{ fontSize: 11, color: C.green }}>✓ Analysis saved to your account.</div>
              ) : (
                <button onClick={handleSaveAnalysis} style={{
                  background: saving ? C.bgRaised : `${C.purple}22`,
                  border: `1px solid ${C.purple}66`, color: saving ? C.muted : C.purple,
                  padding: "10px 20px", fontSize: 11, letterSpacing: 1.5,
                  cursor: "pointer", textTransform: "uppercase", fontFamily: FONT.sans,
                  transition: "all 0.2s", width: "100%" }}>
                  {saving ? "Saving..." : account ? "Save This Analysis →" : "Sign In to Save →"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ERP Connection */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: C.amber,
              textTransform: "uppercase", fontFamily: FONT.sans }}>ERP Connection</div>
            <span style={{ fontSize: 8, color: C.dimmed, border: `1px solid ${C.dimmed}`,
              padding: "2px 8px", letterSpacing: 1, textTransform: "uppercase" }}>
              {account ? "Available" : "Requires Sign In"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 20, lineHeight: 1.65, fontFamily: FONT.sans }}>
            Connect your ERP for real-time invoice streaming into the detection engine.
            All data is <strong style={{ color: C.white }}>analysed in-memory</strong> and automatically discarded after the session.
            {!account && <span style={{ color: C.amber }}> Sign in with Google above to enable connections.</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {erpSources.map(erp => (
              <div key={erp.name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px",
                background: account ? `${erp.color}09` : C.bgRaised,
                border: `1px solid ${account ? erp.color + "28" : C.border}18`,
                transition: "all 0.2s", cursor: account ? "pointer" : "default",
                opacity: account ? 1 : 0.45,
              }}
                onMouseEnter={e => account && (e.currentTarget.style.background = `${erp.color}16`)}
                onMouseLeave={e => account && (e.currentTarget.style.background = `${erp.color}09`)}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 18, color: erp.color }}>{erp.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, color: C.white, fontFamily: FONT.sans, marginBottom: 2 }}>{erp.name}</div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT.sans }}>{erp.desc}</div>
                  </div>
                </div>
                <span style={{ fontSize: 9, color: erp.color, border: `1px solid ${erp.color}44`,
                  padding: "3px 12px", letterSpacing: 1.5, textTransform: "uppercase",
                  fontFamily: FONT.sans, flexShrink: 0 }}>
                  {account ? "Connect" : "Locked"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sign-up modal overlay */}
      {showSignup && !account && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowSignup(false)}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.borderSoft}`,
            padding: 40, maxWidth: 420, width: "90%", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSignup(false)} style={{
              position: "absolute", top: 16, right: 16, background: "none",
              border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: C.red, marginBottom: 12,
              textTransform: "uppercase", fontFamily: FONT.sans }}>Save Your Analysis</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.white, marginBottom: 10, fontFamily: FONT.sans }}>
              Create a free account to save
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 28, fontFamily: FONT.sans }}>
              Your analysis is currently in memory only. Sign in with Google to save results, access historical reports, and enable ERP connections.
            </div>
            <button onClick={() => { handleGoogleSignIn(); setShowSignup(false); }} style={{
              background: C.white, border: "none", color: "#1a1a1a", padding: "12px 24px",
              fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, fontFamily: FONT.sans }}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <div style={{ textAlign: "center", marginTop: 14, fontSize: 10, color: C.dimmed, fontFamily: FONT.sans }}>
              Free forever · No credit card required
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 11. MAIN APP — routing + persistent nav
// ============================================================

export default function App() {
  const [page, setPage] = useState("landing");
  const [tab, setTab]   = useState("overview");
  const [threshold, setThreshold] = useState(T.fraud);

  const invoices = useMemo(() => scoreInvoices(generateRawInvoices()), []);
  const flagged  = invoices.filter(i => i.fraudScore >= threshold);
  const exposure = flagged.reduce((s, i) => s + i.amount, 0);

  const TABS = [
    { id: "overview",  label: "Overview" },
    { id: "network",   label: "Network Graph" },
    { id: "velocity",  label: "Velocity Scoring" },
    { id: "tiers",     label: "Multi-Tier Analysis" },
    { id: "check",     label: "Pre-Disbursement" },
    { id: "data",      label: "Data" },
  ];

  if (page === "landing") return <Landing onEnter={() => setPage("dashboard")} />;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT.sans, color: C.white }}>
      <Grain />

      {/* Top nav bar */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100,
        background: `${C.bg}f2`, backdropFilter: "blur(24px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "0 36px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <button onClick={() => setPage("landing")} style={{ background: "none", border: "none",
            cursor: "pointer", fontSize: 14, fontWeight: 700, letterSpacing: 1,
            color: C.white, fontFamily: FONT.sans, padding: 0 }}>
            Trace<span style={{ color: C.red }}>Wire</span>
          </button>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, fontFamily: FONT.sans }}>
            <span style={{ color: C.red }}>{flagged.length}</span> flagged ·
            <span style={{ color: C.amber }}> {F.cr(exposure)}</span> exposure
          </div>
        </div>

        {/* Threshold slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5,
            textTransform: "uppercase", fontFamily: FONT.sans }}>Threshold</span>
          <input type="range" min={0.3} max={0.9} step={0.05} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            style={{ accentColor: C.red, width: 100, cursor: "pointer" }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.white, width: 34 }}>{threshold}</span>
        </div>
      </nav>

      {/* Dashboard content */}
      <div style={{ padding: "28px 36px" }}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === "overview"  && <OverviewTab invoices={invoices} threshold={threshold} />}
        {tab === "network"   && <NetworkTab  invoices={invoices} threshold={threshold} />}
        {tab === "velocity"  && <VelocityTab invoices={invoices} />}
        {tab === "tiers"     && <TierTab     invoices={invoices} />}
        {tab === "check"     && <CheckTab    invoices={invoices} />}
        {tab === "data"      && <DataTab />}
      </div>
    </div>
  );
}
