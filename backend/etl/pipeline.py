"""
ETL Pipeline Orchestrator - Coordinates Extract, Filter, Transform, DQ, and Load.

Flow: Extract → Filter → Transform → Categorize → DQ → Load

Filter step separates transactions from metadata for accurate reconciliation.
"""
import time
import os
from datetime import datetime
from typing import Dict, Any
from .extract import ParserFactory
from .transform import HeuristicTransformer
from .filter import TransactionFilter
from .dq import DataQualityEngine
from .load import UniversalLoader
from .categorize import CategoryMapper


class ETLPipeline:
    """
    Enterprise ETL Pipeline with Transaction Eligibility Filtering.
    """
    
    def __init__(self):
        self.transformer = HeuristicTransformer()
        self.tx_filter = TransactionFilter()
        self.dq_engine = DataQualityEngine()
        self.loader = UniversalLoader()
        self.category_mapper = CategoryMapper()

    def process(self, file_path: str, file_type: str, target_format: str = "xlsx"):
        """
        Process a file through the complete ETL pipeline.
        Yields (percentage, message, result_dict)
        """
        start_time = time.time()
        
        try:
            # ─── 1. Extract (0-20%) ───
            yield 10, "Reading Document...", None
            parser = ParserFactory.get_parser(file_type)
            raw_data = parser.parse(file_path)
            yield 20, "Document Read Successful.", None
            
            # ─── 2. Transform (20-40%) ───
            yield 25, "Extracting transactions...", None
            all_rows = self.transformer.transform(raw_data)
            yield 40, "Transformation Complete.", None
            
            # ─── 3. Filter: Separate Transactions from Metadata (40-55%) ───
            yield 45, "Filtering eligible transactions...", None
            eligible_transactions, metadata_rows, extracted_metadata = self.tx_filter.filter(all_rows)
            yield 55, f"Found {len(eligible_transactions)} transactions, {len(metadata_rows)} metadata rows.", None

            # ─── 4. Categorization Guardrail (55-60%) ───
            # Only categorize eligible transactions
            yield 58, "Categorizing transactions...", None
            for tx in eligible_transactions:
                tx["category"] = self.category_mapper.categorize(tx.get("description", ""))
            
            # ─── 5. Data Quality (60-75%) ───
            yield 60, "Validating data...", None
            eligible_transactions = self.dq_engine.assess(
                eligible_transactions, 
                metadata_rows=metadata_rows,
                extracted_metadata=extracted_metadata
            )
            dq_stats = self.dq_engine.get_stats()
            dq_report = self.dq_engine.get_full_report()
            yield 75, "Validation Complete.", None
            
            # ─── Summary & Audit Data ───
            processing_time = (time.time() - start_time) * 1000
            
            total_debits = sum(tx.get("amount", 0) for tx in eligible_transactions if tx.get("tx_type") == "debit")
            total_credits = sum(tx.get("amount", 0) for tx in eligible_transactions if tx.get("tx_type") == "credit")
            
            # ─── Anomaly Detection ───
            seen_txs = set()
            duplicates = 0
            round_numbers = 0
            
            for tx in eligible_transactions:
                key = (tx.get("post_date"), tx.get("description"), tx.get("amount"))
                if key in seen_txs:
                    duplicates += 1
                else:
                    seen_txs.add(key)
                
                amt = tx.get("amount", 0)
                if amt > 0 and float(amt).is_integer():
                    round_numbers += 1

            audit_data = {
                "document_hash": raw_data.get("document_hash"),
                "source_file": raw_data.get("source_file"),
                "processing_time_ms": processing_time,
                "total_rows": len(eligible_transactions),
                "metadata_rows": len(metadata_rows),
                "dq_stats": dq_stats,
                "dq_report": dq_report,
                "anomalies": {
                    "duplicate_count": duplicates,
                    "round_amounts": round_numbers
                },
                "timestamp": datetime.now().isoformat(),
                "financials": {
                    "total_debits": total_debits,
                    "total_credits": total_credits,
                    "opening_balance": extracted_metadata.get("opening_balance", 0.0),
                    "closing_balance": extracted_metadata.get("closing_balance", 0.0)
                },
                "reconciliation": dq_report.get("reconciliation", {}),
                "statement_metadata": extracted_metadata
            }
            
            yield 85, "Preparing document...", None
            output_buffer = self.loader.generate(eligible_transactions, audit_data, target_format)
            yield 95, "Finalizing...", None
            
            yield 100, "Done", {
                "success": True,
                "output_buffer": output_buffer,
                "stats": audit_data,
                "preview_data": eligible_transactions,
                "metadata_rows": metadata_rows,
                "summary": audit_data.get("summary_highlights")
            }
            
        except Exception as e:
            logging.exception("PIPELINE_ERROR")
            yield 0, f"Error: {str(e)}", {
                "success": False,
                "error": str(e),
                "stats": {}
            }

