"""
Transform Layer - Deterministic transaction normalization and deduplication.

This module implements:
1. Header detection for table column mapping
2. Regex-based heuristic fallback for raw text
3. Transaction type detection (debit/credit/balance)
4. Deduplication using signature hashing
"""
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
from .schema import Transaction, ExtractionPayload


class HeuristicTransformer:
    """
    Deterministic transformer using regex patterns.
    No AI, no ML - pure pattern matching for reproducible results.
    """
    
    def __init__(self):
        self.date_pattern = re.compile(r'(\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?)')
        self.amount_pattern = re.compile(r'[$]?[\d,]+\.\d{1,2}')
        self.column_map: Dict[str, int] = {}

    def transform(self, raw_data: Dict[str, Any]) -> List[Transaction]:
        """
        Main entry point: Extract → Transform pipeline.
        
        Args:
            raw_data: ExtractionPayload from extract layer
            
        Returns:
            List of normalized Transaction records
        """
        source_id = raw_data.get("document_hash", "unknown")
        fragments = raw_data.get("fragments", [])
        raw_text = raw_data.get("raw_text", "")
        
        results: List[Transaction] = []
        seen_sigs: set = set()
        self.column_map = {}

        # Pass 1: Table fragments (high confidence)
        for frag in fragments:
            if frag["type"] == "table_row":
                row = frag["data"]
                
                if self._is_header_row(row):
                    self._build_column_map(row)
                    continue
                
                tx = self._map_table_row_by_position(row, source_id)
                if tx and self._get_sig(tx) not in seen_sigs:
                    results.append(tx)
                    seen_sigs.add(self._get_sig(tx))

        # Pass 2: Raw text fallback (recovery)
        for line in raw_text.split('\n'):
            tx = self._parse_line_heuristic(line, source_id)
            if tx:
                sig = self._get_sig(tx)
                if sig not in seen_sigs:
                    results.append(tx)
                    seen_sigs.add(sig)

        return results

    # ─────────────────────────────────────────────────────────────
    # Table Parsing
    # ─────────────────────────────────────────────────────────────

    def _is_header_row(self, row: List[Any]) -> bool:
        """Detect header rows by keyword count"""
        row_text = ' '.join([str(c).lower() for c in row if c])
        keywords = ['date', 'description', 'debit', 'credit', 'balance', 'amount', 'check']
        matches = sum(1 for kw in keywords if kw in row_text)
        return matches >= 2

    def _build_column_map(self, header_row: List[Any]) -> None:
        """Build column index mapping from header row"""
        self.column_map = {}
        for i, cell in enumerate(header_row):
            if not cell:
                continue
            cell_lower = str(cell).lower().strip()
            
            # Prioritize 'transaction' or 'post' date if multiple date columns exist
            if 'date' in cell_lower:
                if 'date' not in self.column_map or any(k in cell_lower for k in ['tran', 'post', 'eff']):
                    self.column_map['date'] = i
            elif any(k in cell_lower for k in ['description', 'details', 'check', 'vendor', 'payee']):
                self.column_map['description'] = i
            elif 'debit' in cell_lower or 'withdrawal' in cell_lower:
                self.column_map['debit'] = i
            elif 'credit' in cell_lower or 'deposit' in cell_lower:
                self.column_map['credit'] = i
            elif 'balance' in cell_lower:
                self.column_map['balance'] = i
            elif 'amount' in cell_lower:
                self.column_map['amount'] = i

    def _map_table_row_by_position(self, row: List[Any], source_id: str) -> Optional[Transaction]:
        """Map table cells to transaction fields using column index map"""
        if not self.column_map:
            return None
            
        date_val = self._safe_get(row, self.column_map.get('date'))
        desc_val = self._safe_get(row, self.column_map.get('description'))
        debit_val = self._parse_amount(self._safe_get(row, self.column_map.get('debit')))
        credit_val = self._parse_amount(self._safe_get(row, self.column_map.get('credit')))
        balance_val = self._parse_amount(self._safe_get(row, self.column_map.get('balance')))
        amount_val = self._parse_amount(self._safe_get(row, self.column_map.get('amount')))

        # Heuristic if debit/credit are merged in one 'amount' column
        if debit_val == 0 and credit_val == 0:
            if amount_val != 0:
                # Use mapped amount column if available
                debit_val = amount_val
            else:
                # Fallback to scanning all cells
                for i, cell in enumerate(row):
                    cell_str = str(cell).lower()
                    if self.amount_pattern.search(cell_str):
                        val = self._parse_amount(cell_str)
                        if val != 0:
                            debit_val = val
                            break
        
        # Validate: must have date
        if not date_val or not self.date_pattern.search(str(date_val)):
            return None
            
        # Determine transaction type
        if credit_val > 0 and debit_val == 0:
            tx_type = 'credit'
            amount = credit_val
        elif debit_val > 0:
            tx_type = 'debit'
            amount = debit_val
        else:
            tx_type = self._detect_tx_type(desc_val or "")
            amount = credit_val or debit_val
        
        if amount == 0 and balance_val:
            return None  # Skip summary rows
            
        return {
            "post_date": str(date_val).strip(),
            "description": str(desc_val or "")[:100].strip(),
            "amount": amount,
            "tx_type": tx_type,
            "category": "Uncategorized",
            "balance": balance_val if balance_val else None,
            "metadata": {
                "source_file_id": source_id,
                "extraction_method": "table",
                "dq_flag": "clean",
                "processing_timestamp": datetime.now().isoformat()
            }
        }

    # ─────────────────────────────────────────────────────────────
    # Raw Text Heuristic Parsing
    # ─────────────────────────────────────────────────────────────

    def _parse_line_heuristic(self, line: str, source_id: str) -> Optional[Transaction]:
        """Parse raw text line using regex patterns."""
        line_clean = line.strip()
        if not line_clean:
            return None

        alpha_date_pattern = re.compile(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(,?\s+\d{2,4})?', re.I)
        
        date_match = self.date_pattern.search(line_clean)
        if not date_match:
            date_match = alpha_date_pattern.search(line_clean)
            
        if not date_match:
            if any(kw in line_clean.lower() for kw in ['opening balance', 'beginning balance', 'ending balance']):
                date_val = datetime.now().strftime("%m/%d/%Y") 
            else:
                return None
        else:
            date_val = date_match.group(0)

        prefix = line_clean[:date_match.start()].strip() if date_match else ""
        suffix = line_clean[date_match.end():].strip() if date_match else line_clean

        amount_pattern = re.compile(r'\$?[\d,]+\.\d{2}')
        amounts = amount_pattern.findall(suffix)
        
        if not amounts:
            return None
            
        parsed_amounts = [self._parse_amount(a) for a in amounts]
        
        if len(parsed_amounts) >= 2:
            tx_amount = parsed_amounts[-2]
            balance_val = parsed_amounts[-1]
        else:
            tx_amount = parsed_amounts[0]
            balance_val = None
            
        desc_parts = suffix
        for amt in amounts:
            desc_parts = desc_parts.replace(amt, '')
        
        full_desc = f"{prefix} {desc_parts}".strip()
        full_desc = ' '.join(full_desc.split())

        if len(full_desc) < 3 and tx_amount == 0:
            return None
            
        desc_lower = full_desc.lower()
        skip_patterns = ['your payment will be', 'statement period', 'total credits', 'total debits']
        if any(p in desc_lower for p in skip_patterns):
            return None
        
        balance_patterns = ['previous balance', 'ending balance', 'opening balance', 'beginning balance']
        is_balance_row = any(bp in desc_lower for bp in balance_patterns)
        
        if is_balance_row:
            final_balance = balance_val if balance_val is not None else tx_amount
            final_tx_amount = 0
            tx_type = 'balance'
        else:
            final_tx_amount = tx_amount
            final_balance = balance_val
            tx_type = self._detect_tx_type(full_desc)

        return {
            "post_date": date_val,
            "description": full_desc[:100],
            "amount": final_tx_amount,
            "tx_type": tx_type,
            "category": "Uncategorized",
            "balance": final_balance,
            "metadata": {
                "source_file_id": source_id,
                "extraction_method": "heuristic",
                "dq_flag": "clean" if is_balance_row else "recovered",
                "processing_timestamp": datetime.now().isoformat()
            }
        }

    # ─────────────────────────────────────────────────────────────
    # Utility Methods
    # ─────────────────────────────────────────────────────────────

    def _safe_get(self, row: List[Any], idx: Optional[int]) -> str:
        if idx is None or idx >= len(row):
            return ""
        return str(row[idx]).strip() if row[idx] else ""

    def _parse_amount(self, val: Any) -> float:
        if not val:
            return 0.0
        val_str = str(val).replace('$', '').replace(',', '').replace('(', '-').replace(')', '').strip()
        try:
            return abs(float(val_str))
        except:
            return 0.0

    def _get_sig(self, tx: Transaction) -> str:
        return f"{tx['post_date']}|{tx['amount']}|{tx['description'][:30]}"

    def _detect_tx_type(self, description: str) -> str:
        desc_lower = description.lower()
        credit_keywords = ['deposit', 'credit', 'refund', 'transfer in', 'payment received', 
                           'direct deposit', 'interest', 'cashback', 'reward']
        debit_keywords = ['withdrawal', 'debit', 'payment', 'purchase', 'fee', 'charge',
                          'atm', 'pos', 'transfer out', 'bill pay', 'check']
        for kw in credit_keywords:
            if kw in desc_lower: return 'credit'
        for kw in debit_keywords:
            if kw in desc_lower: return 'debit'
        return 'debit'
