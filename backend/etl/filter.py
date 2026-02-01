"""
Transaction Eligibility Filter - Separates transactions from metadata.

Bank statements contain:
- Actual transactions (debits, credits)
- Metadata rows (opening balance, ending balance, summary)

This filter separates them for accurate reconciliation and reporting.
"""
from typing import List, Dict, Tuple, Any
from datetime import datetime
import re


# ─────────────────────────────────────────────────────────────
# Summary Keywords to Exclude from Transactions
# ─────────────────────────────────────────────────────────────
SUMMARY_KEYWORDS = [
    "previous balance",
    "ending balance",
    "opening balance",
    "beginning balance",
    "closing balance",
    "summary",
    "statement period",
    "your payment will be debited",
    "balance forward",
    "total",
    "subtotal",
]


class TransactionFilter:
    """
    Filters rows into eligible transactions and metadata.
    
    Eligibility Rules:
    - Has a valid parsed date
    - Has amount > 0 (debit OR credit)
    - Description does NOT match summary keywords
    """
    
    def __init__(self):
        self.summary_keywords = [kw.lower() for kw in SUMMARY_KEYWORDS]
    
    def filter(self, rows: List[Dict]) -> Tuple[List[Dict], List[Dict], Dict[str, Any]]:
        """
        Separate rows into eligible transactions and metadata.
        
        Args:
            rows: List of raw transaction dicts
            
        Returns:
            Tuple of (eligible_transactions, metadata_rows, extracted_metadata)
        """
        eligible = []
        metadata = []
        
        # Track balances from metadata rows
        opening_balance = None
        closing_balance = None
        
        for row in rows:
            is_metadata, balance_type = self._is_metadata_row(row)
            
            if is_metadata:
                # Extract balance values from metadata rows
                balance = row.get("balance")
                if balance_type == "opening" and balance is not None:
                    opening_balance = balance
                elif balance_type == "closing" and balance is not None:
                    closing_balance = balance
                
                # Mark as non-transaction
                row["metadata"] = row.get("metadata", {})
                row["metadata"]["dq_flag"] = "non_transaction"
                row["metadata"]["is_eligible"] = False
                metadata.append(row)
            elif self._is_eligible(row):
                row["metadata"] = row.get("metadata", {})
                row["metadata"]["is_eligible"] = True
                eligible.append(row)
            else:
                # Not metadata but also not eligible (e.g., zero amount)
                row["metadata"] = row.get("metadata", {})
                row["metadata"]["dq_flag"] = "non_transaction"
                row["metadata"]["is_eligible"] = False
                metadata.append(row)
        
        # If no explicit opening/closing found, use first/last balance values
        if opening_balance is None and eligible:
            first_balance = eligible[0].get("balance")
            if first_balance is not None:
                # Calculate what opening would have been
                first_amt = eligible[0].get("amount", 0)
                first_type = eligible[0].get("tx_type", "")
                if first_type == "credit":
                    opening_balance = first_balance - first_amt
                elif first_type == "debit":
                    opening_balance = first_balance + first_amt
                else:
                    opening_balance = first_balance
        
        if closing_balance is None and eligible:
            closing_balance = eligible[-1].get("balance")
        
        extracted_metadata = {
            "opening_balance": opening_balance or 0.0,
            "closing_balance": closing_balance or 0.0,
            "total_rows": len(rows),
            "eligible_count": len(eligible),
            "metadata_count": len(metadata),
        }
        
        return eligible, metadata, extracted_metadata
    
    def _is_metadata_row(self, row: Dict) -> Tuple[bool, str]:
        """
        Check if row is a metadata/summary row.
        
        Returns:
            Tuple of (is_metadata, balance_type)
            balance_type is 'opening', 'closing', or 'other'
        """
        desc = str(row.get("description", "")).lower()
        tx_type = row.get("tx_type", "")
        amount = row.get("amount", 0)
        
        # Check for explicit balance row type
        if tx_type == "balance":
            # Determine if opening or closing based on keywords
            if any(kw in desc for kw in ["opening", "previous", "beginning", "forward"]):
                return True, "opening"
            elif any(kw in desc for kw in ["ending", "closing", "final"]):
                return True, "closing"
            return True, "other"
        
        # Check for summary keywords
        for keyword in self.summary_keywords:
            if keyword in desc:
                if any(kw in desc for kw in ["opening", "previous", "beginning"]):
                    return True, "opening"
                elif any(kw in desc for kw in ["ending", "closing"]):
                    return True, "closing"
                return True, "other"
        
        return False, ""
    
    def _is_eligible(self, row: Dict) -> bool:
        """
        Check if row is an eligible transaction.
        
        Rules:
        - Has valid date
        - Amount > 0
        - Not a summary row
        """
        # Must have a date
        date = row.get("post_date")
        if not date or date == "":
            return False
        
        # Must have positive amount
        amount = row.get("amount", 0)
        if amount <= 0:
            return False
        
        # Already checked for summary in caller
        return True
    
    def get_summary_keywords(self) -> List[str]:
        """Return list of summary keywords for transparency."""
        return SUMMARY_KEYWORDS.copy()
