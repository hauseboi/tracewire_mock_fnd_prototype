# TraceWire — SCF Fraud Detection Platform

> **Follow the money. Catch the fraud.**

TraceWire is a network-first Supply Chain Finance (SCF) fraud detection platform that combines **Isolation Forest** anomaly detection and **Louvain community detection** to identify phantom invoices, fraud rings, and carousel schemes — before a single rupee leaves the bank.

This repository contains the **React frontend prototype** deployed on Vercel. The Python ML backend (FastAPI + scikit-learn + NetworkX) is being built and runs locally — frontend wiring is in progress.

---

## Live Demo

**[tracewire-mock-fnd-prototype.vercel.app](https://tracewire-mock-fnd-prototype.vercel.app/)**

The demo runs on 950 synthetic invoices with mock scoring that mirrors the real Python engine's logic. Use the threshold slider in the top nav to adjust the fraud cutoff live across all tabs.

---

## What It Detects

| Fraud Type | Signal |
|---|---|
| **Phantom Invoice** | No GRN · Amount/PO ratio anomaly · New supplier |
| **Duplicate Financing** | MD5 fingerprint collision across lenders |
| **Fraud Ring** | Louvain community risk > 0.55 · Tight supplier-buyer clusters |
| **Anomalous** | Isolation Forest outlier · High velocity · Multi-lender |

---

## Dashboard — 6 Tabs

### Overview
KPI cards (total invoices, fraud flagged, exposure, fraud chains, avg score), fraud type donut chart, exposure breakdown by type, score distribution histogram, live scored invoice feed.

### Network Graph
Interactive SVG supplier-buyer-lender network. Fraud nodes glow red. Pan by dragging, scroll to zoom, `+` / `−` buttons for precise zoom, fullscreen mode. Hover any node for quick stats, click for full detail panel. Hover edges for transaction value and fraud type. Fraud-only filter toggle.

### Velocity Scoring
Suppliers ranked by velocity score (HIGH / MEDIUM / LOW). Risk distribution bar chart. Scatter plot of velocity vs fraud score — validates that fraud clusters top-right, clean invoices bottom-left.

### Multi-Tier Analysis
Tier 1 / 2 / 3 breakdown with invoice count, fraud rate, and exposure. Cascade risk detection — flags invoices where the buyer is a known fraud supplier in a downstream tier.

### Pre-Disbursement Check
Real-time single invoice scoring form. Returns **APPROVED / REVIEW / BLOCKED** verdict in under 1 second with a full signal-by-signal breakdown: GRN check, amount/PO ratio, velocity, new supplier risk, duplicate fingerprint, fraud chain membership.

### Data Import
CSV / Excel drag-and-drop upload. Google sign-in (UI prototype). ERP connectors — SAP, Oracle Financials, Microsoft Dynamics 365, Tally ERP Prime, Zoho Books (unlocks after sign-in). Analysis is processed in-memory and discarded unless saved to account.This feature is yet to be developed.

---

## Fraud Scoring Formula

```
Fraud Score = 0.35 × Isolation Forest Score
            + 0.25 × Louvain Community Risk
            + 0.15 × GRN Missing Flag
            + 0.12 × Duplicate Fingerprint
            + 0.08 × Velocity Risk
            + 0.05 × Multi-Lender Flag
```

**Thresholds:**
- `≥ 0.50` → **BLOCKED**
- `0.35 – 0.49` → **REVIEW**
- `< 0.35` → **APPROVED**

---

## Three-Layer Architecture

```
L1 — Ingestion & Validation
     3-Way Match · GSTIN Verification · MD5 Duplicate Fingerprinting · GRN Check

L2 — Graph Network Engine
     NetworkX topology · Louvain community detection · Fraud ring clustering

L3 — ML Anomaly Scoring
     Isolation Forest (300 trees) · 8 engineered features · Weighted final score
```

---

## Tech Stack

**Frontend (this repo)**
- React 18 — hooks, state management, component architecture
- Recharts — donut, bar, scatter, histogram charts
- SVG — interactive network graph (pan, zoom, fullscreen, hover, click)
- Vite — build tooling
- Vercel — deployment

**Backend (separate repo — local)**
- FastAPI — REST API, 11 endpoints
- Pydantic — typed request/response schemas
- scikit-learn — Isolation Forest anomaly detection
- NetworkX — graph construction and 3D spring layout
- python-louvain — Louvain community detection
- pandas — feature engineering and pipeline
- Railway — deployment target

---

## Repository Structure

```
TraceWire/
├── src/
│   └── TraceWire.jsx       # Full React dashboard (landing + 6 tabs)
├── public/
├── index.html
├── vite.config.js
├── package.json
└── README.md
```

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/tracewire-frontend.git
cd tracewire-frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Opens at `http://localhost:5173`

---

## Backend

The Python ML backend is built and tested. It exposes the following endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/data/generate` | Generate 950 synthetic invoices + run full pipeline |
| `POST` | `/data/upload` | Upload CSV/Excel + run pipeline |
| `GET` | `/invoices/summary` | KPI overview |
| `GET` | `/network` | Three.js-ready graph (3D coords, index-based edges) |
| `GET` | `/velocity` | Supplier velocity scores |
| `GET` | `/tiers` | Multi-tier cascade analysis |
| `POST` | `/check` | Real-time single invoice scoring |

Frontend wiring (replacing mock JS data with real `fetch()` calls) is the current sprint.

---

## Roadmap

| Week | Milestone | Status |
|------|-----------|--------|
| Week 1 | Python ML engine + FastAPI backend + all endpoints | In progress|
| Week 2 | React → FastAPI wiring · Real data in all 6 tabs | 📋 Planned |
| Week 3 | Three.js 3D network graph · Community-based node clustering | 📋 Planned |
| Week 4 | Railway deployment · Google OAuth · End-to-end demo | 📋 Planned |

---

## Team Lead

**KJ** — [khrithikjupalli@gmail.com](mailto:khrithikjupalli@gmail.com)

---
## Team Members

**Varun Prakash** — [@gmail.com](mailto:varunpk2005@gmail.com)
---
**Sri Ram Kumar V** — [sriramkumarv6@gmail.com](mailto:sriramkumarv6@gmail.com)

*TraceWire · SCF Fraud Detection Platform · 2026*
