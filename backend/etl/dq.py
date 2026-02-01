"""
Data Quality Engine - Deterministic DQ scoring, flagging, and reconciliation.

DQ Classification:
- CLEAN: Table-extracted eligible transaction
- RECOVERED_TRANSACTION: Heuristic-extracted eligible transaction
- SUSPECT: Missing required fields (true anomaly)
- NON_TRANSACTION: Summary/metadata row

All logic is rule-based and fully traceable.
"""
from typing import List, Dict, Any, Optional
from .schema import Transaction


# Valid DQ flags
DQ_FLAGS = ["CLEAN", "RECOVERED_TRANSACTION", "SUSPECT", "NON_TRANSACTION"]


class DataQualityEngine:
    """
    Deterministic DQ scoring engine with reconciliation validation.
    No ML, no AI - rule-based quality assessment for full auditability.
    """
    
    def __init__(self):
        self.stats = {
            "total": 0,
            "CLEAN": 0,
            "RECOVERED_TRANSACTION": 0,
            "SUSPECT": 0,
            "NON_TRANSACTION": 0
        }
        self.flagged_rows: List[Dict[str, Any]] = []
        self.reconciliation: Dict[str, Any] = {}
        self.statement_metadata: Dict[str, Any] = {}
    
    def assess(self, transactions: List[Transaction], 
               metadata_rows: List[Transaction] = None,
               extracted_metadata: Dict[str, Any] = None) -> List[Transaction]:
        """
        Assess and flag each transaction with DQ score.
        Uses extracted metadata for accurate reconciliation.
        """
        self.stats = {"total": 0, "CLEAN": 0, "RECOVERED_TRANSACTION": 0, "SUSPECT": 0, "NON_TRANSACTION": 0}
        self.flagged_rows = []
        self.statement_metadata = extracted_metadata or {}
        
        # Count non-transaction rows
        if metadata_rows:
            self.stats["NON_TRANSACTION"] = len(metadata_rows)
        
        seen_signatures: Dict[str, int] = {}
        
        for idx, tx in enumerate(transactions):
            self.stats["total"] += 1
            row_num = idx + 1
            
            sig = self._get_signature(tx)
            is_duplicate = sig in seen_signatures
            if is_duplicate:
                prev_row = seen_signatures[sig]
                self._add_flag(row_num, tx, "DUPLICATE", f"Duplicate of row {prev_row}")
            else:
                seen_signatures[sig] = row_num
            
            # Calculate DQ flag
            dq_flag = self._calculate_dq(tx)
            tx["metadata"]["dq_flag"] = dq_flag
            self.stats[dq_flag] = self.stats.get(dq_flag, 0) + 1
            
            if dq_flag == "SUSPECT":
                self._add_flag(row_num, tx, "FORMAT_ISSUE", "Missing required fields")
        
        self._check_reconciliation(transactions, extracted_metadata)
        return transactions
    
    def _get_signature(self, tx: Transaction) -> str:
        return f"{tx.get('post_date')}|{tx.get('amount')}|{tx.get('description', '')[:30]}"
    
    def _add_flag(self, row_num: int, tx: Transaction, flag_type: str, reason: str) -> None:
        self.flagged_rows.append({
            "row": row_num,
            "date": tx.get("post_date", ""),
            "description": tx.get("description", "")[:50],
            "amount": tx.get("amount", 0),
            "flag_type": flag_type,
            "reason": reason
        })
    
    def _calculate_dq(self, tx: Transaction) -> str:
        # Check if already filtered out
        if not tx.get("metadata", {}).get("is_eligible", True):
            return "NON_TRANSACTION"
            
        method = tx.get("metadata", {}).get("extraction_method", "unknown")
        
        has_date = bool(tx.get("post_date"))
        has_desc = bool(tx.get("description"))
        has_amount = tx.get("amount", 0) > 0
        
        is_complete = has_date and has_desc and has_amount
        
        if not is_complete:
            return "SUSPECT"
        elif method == "table":
            return "CLEAN"
        else:
            return "RECOVERED_TRANSACTION"
    
    def _check_reconciliation(self, transactions: List[Transaction], 
                               extracted_metadata: Dict[str, Any] = None) -> None:
        meta = extracted_metadata or {}
        opening_balance = meta.get("opening_balance", 0.0)
        closing_balance = meta.get("closing_balance", 0.0)
        
        total_credits = 0.0
        total_debits = 0.0
        
        for tx in transactions:
            if tx.get("metadata", {}).get("is_eligible", True):
                tx_type = tx.get("tx_type", "")
                amount = tx.get("amount", 0.0)
                if tx_type == "credit": total_credits += amount
                elif tx_type == "debit": total_debits += amount
        
        expected_closing = opening_balance + total_credits - total_debits
        delta = abs(expected_closing - closing_balance)
        is_balanced = delta < 0.02
        
        if not is_balanced:
            if opening_balance == 0 and closing_balance == 0:
                failure_reason = "Missing balance information in statement"
            elif abs(delta) > 1000:
                failure_reason = "Large discrepancy - possible missing transactions"
            else:
                failure_reason = f"Small mismatch (${delta:.2f}) - rounding or fees"
        else:
            failure_reason = None
        
        self.reconciliation = {
            "opening_balance": opening_balance,
            "total_credits": total_credits,
            "total_debits": total_debits,
            "expected_closing": round(expected_closing, 2),
            "actual_closing": closing_balance,
            "delta": round(delta, 2),
            "is_balanced": is_balanced,
            "status": "✅ Balanced" if is_balanced else f"⚠️ Mismatch (${delta:.2f})",
            "failure_reason": failure_reason
        }
        
        if not is_balanced and len(transactions) > 0:
            self._add_flag(0, transactions[-1], "IMBALANCE", failure_reason or f"Reconciliation mismatch: ${delta:.2f}")
    
    def get_stats(self) -> Dict[str, Any]:
        return self.stats.copy()
    
    def get_flagged_rows(self) -> List[Dict[str, Any]]:
        return self.flagged_rows.copy()
    
    def get_reconciliation(self) -> Dict[str, Any]:
        return self.reconciliation.copy()
    
    def get_full_report(self) -> Dict[str, Any]:
        return {
            "stats": self.get_stats(),
            "reconciliation": self.get_reconciliation(),
            "flagged_rows": self.get_flagged_rows(),
            "summary": {
                "eligible_count": self.stats["CLEAN"] + self.stats["RECOVERED_TRANSACTION"] + self.stats["SUSPECT"],
                "non_transaction_count": self.stats["NON_TRANSACTION"],
                "clean_count": self.stats["CLEAN"],
                "recovered_count": self.stats["RECOVERED_TRANSACTION"],
                "suspect_count": self.stats["SUSPECT"],
                "total_flags": len(self.flagged_rows),
                "has_duplicates": any(f["flag_type"] == "DUPLICATE" for f in self.flagged_rows),
                "has_imbalance": not self.reconciliation.get("is_balanced", True)
            }
        }
