# QC: Financial Data Connector (Enterprise ETL)

**Interview-Grade System for Bank Statement Ingestion & Normalization**

QC is a specialized **Financial ETL Connector** designed to transform heterogeneous bank statement formats into standardized schemas consumable by downstream accounting systems. This project demonstrates professional Data Engineering patterns suitable for Accenture-style ETL & Connector roles.

---

## 🎯 Core Capabilities

### 1. Transaction Categorization (Rule-Based)
- Deterministic keyword-based categorization engine
- 10 predefined categories: `Transport`, `Meals`, `Utilities`, `Subscriptions`, `Transfers`, `ATM/Cash`, `Income`, `Shopping`, `Healthcare`, `Fees`
- Fully transparent rules in `categorize.py` — no black-box AI
- Configurable and extensible for enterprise customization

### 2. Reconciliation Check
- Validates: `Opening Balance + Credits − Debits = Closing Balance`
- Flags mismatches with delta amount in Excel output
- Visual status indicator in UI: ✅ Balanced / ⚠️ Mismatch

### 3. Data Quality Report
- DQ flags: `CLEAN` (table-extracted), `RECOVERED` (heuristic), `SUSPECT` (true anomaly), `NON_TRANSACTION` (metadata)
- Transaction eligibility filtering separates actual transactions from balance/summary rows
- Dedicated Excel sheet showing:
  - Summary statistics (clean/recovered/suspect/non-transaction counts)
  - Flagged rows table with reasons (duplicate, imbalance, format issue)
- Human-readable, audit-friendly output

---

## 🏗️ ETL Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   EXTRACT   │───▶│   FILTER    │───▶│  TRANSFORM  │───▶│     DQ      │───▶│    LOAD     │
│ pdfplumber  │    │ Eligibility │    │ Categorize  │    │ Validate    │    │ Multi-sheet │
│ CSV Parser  │    │ Separation  │    │ Normalize   │    │ Reconcile   │    │   Excel     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Deterministic** | Same input → Same output. Zero randomness. |
| **Auditable** | Every extraction rule traceable in code. |
| **No AI Dependency** | Runs without LLM/API calls. Sub-second latency. |
| **Schema-First** | Strict `TypedDict` schemas for data integrity. |
| **API-First** | All processing via REST endpoints. UI-independent. |

---

## 📂 Project Structure

```
backend/
├── etl/
│   ├── extract.py      # PDF/CSV Hybrid Parsers
│   ├── filter.py       # Transaction Eligibility Filtering
│   ├── transform.py    # Regex Normalization & Dedup
│   ├── categorize.py   # Rule-Based Transaction Categorization
│   ├── dq.py           # Data Quality Engine + Reconciliation
│   ├── load.py         # Multi-sheet Excel Writer
│   ├── pipeline.py     # Orchestrator
│   └── schema.py       # Strict Schema Definitions
├── app.py              # Flask API
└── supabase_client.py  # Observability Layer

src/
└── main.js             # Frontend Logic

index.html              # Finance-First UI
style.css               # Professional Styling
```

---

## 📊 Excel Output Structure

| Sheet | Contents |
|-------|----------|
| **Transactions** | Date, Description, Category, Debit, Credit, Balance, DQ Flag |
| **Financial Summary** | Opening/Closing Balance, Totals, Net Change, Reconciliation Check |
| **Data Quality Report** | Summary stats, Flagged rows table with reasons |

---

## 📈 Enterprise Scalability

This Python MVP maps directly to enterprise patterns:

| Component | MVP (Python) | Enterprise (Spark/Java) |
|-----------|--------------|-------------------------|
| **Compute** | Flask / Single Node | Apache Spark / AWS Lambda |
| **Parsing** | `pdfplumber` | Apache Tika / AWS Textract |
| **Storage** | Local / Outputs | S3 Data Lake / Delta Lake |
| **Logging** | Supabase | Kafka + ELK Stack |
| **Categorization** | Python Dict Rules | External Config / Rules Engine |

---

## 🚦 Getting Started

```bash
# Backend
pip install -r requirements.txt
python backend/app.py

# Frontend
npm install
npm run dev
```

Open `http://localhost:5173` and upload a bank statement PDF.

---

## 🎓 Interview Talking Points

1. **Why Deterministic over AI?**
   - Reproducibility for financial auditing
   - Zero API costs per transaction
   - Sub-second latency vs 10-30s for LLM reasoning
   - Fully traceable extraction rules

2. **Why separate Transactions from Metadata?**
   - Bank statements mix actual transactions with summary rows (opening/closing balance)
   - Counting balance rows as transactions breaks reconciliation
   - QC intentionally filters them using keyword rules (`filter.py`)
   - Result: Transactions sheet contains only debits/credits with financial impact

3. **How does Reconciliation work?**
   - Extracts Opening/Closing balance from metadata rows
   - Sums debits/credits from eligible transactions only
   - Validates: `Opening + Credits - Debits = Closing`
   - Attribution on failure: "Missing rows" vs "Rounding/fees"

4. **What makes DQ "audit-friendly"?**
   - Row-level flagging with specific reasons
   - Separate sheet for flagged records
   - Four-tier classification: CLEAN → RECOVERED → SUSPECT → NON_TRANSACTION

5. **How would you scale this?**
   - Stateless pipeline → horizontal scaling behind load balancer
   - Replace pdfplumber with distributed parsers (Tika, Textract)
   - Category rules → external config service for runtime updates

---

Built for demonstrating **Data Engineering** and **ETL Connector** expertise.

