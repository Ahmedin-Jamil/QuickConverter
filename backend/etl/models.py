
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime

@dataclass
class Transaction:
    date: str
    description: str
    amount: float
    category: Optional[str] = None
    balance: Optional[float] = None
    flags: List[str] = None

    def to_dict(self):
        return {
            "Post Date": self.date,
            "Description": self.description,
            "Amount": self.amount,
            "Category": self.category or "Uncategorized",
            "Balance": self.balance,
            "DQ_Flag": ", ".join(self.flags) if self.flags else "OK"
        }

class TransactionSchema:
    REQUIRED_FIELDS = ["Post Date", "Description", "Amount"]
    
    @staticmethod
    def validate(row: Dict[str, Any]) -> List[str]:
        errors = []
        # Check required fields
        for field in TransactionSchema.REQUIRED_FIELDS:
            if field not in row or row[field] is None or str(row[field]).strip() == "":
                errors.append(f"Missing {field}")
        
        # Validate Amount
        if "Amount" in row:
            try:
                float(str(row["Amount"]).replace(",", ""))
            except ValueError:
                errors.append("Invalid Amount format")
                
        return errors
