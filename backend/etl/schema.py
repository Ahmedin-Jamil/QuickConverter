"""
Transaction Schema - Strict TypedDict for deterministic ETL pipeline.

This schema enforces consistent data structure across all ETL layers,
enabling predictable output and easy enterprise migration to Spark/Java.
"""
from typing import TypedDict, Dict, Any, Optional, List

class TransactionMetadata(TypedDict):
    """Audit metadata for each transaction"""
    source_file_id: str           # SHA256 hash of source document
    extraction_method: str        # 'table' | 'heuristic'
    dq_flag: str                  # 'clean' | 'recovered' | 'suspect'
    processing_timestamp: str     # ISO 8601 timestamp

class Transaction(TypedDict):
    """
    Core transaction record - single source of truth.
    
    This schema maps directly to enterprise patterns:
    - Spark: StructType with matching fields
    - Java: POJO with Jackson annotations
    - Database: Normalized table schema
    """
    post_date: str                # Normalized date (MM/DD/YYYY)
    description: str              # Cleaned description (max 100 chars)
    amount: float                 # Absolute transaction value
    tx_type: str                  # 'debit' | 'credit' | 'balance'
    category: str                 # 'Uncategorized' | 'Summary'
    balance: Optional[float]      # Running balance if available
    metadata: TransactionMetadata

class ExtractionPayload(TypedDict):
    """Output from Extract layer"""
    document_hash: str            # SHA256 for idempotency
    fragments: List[Dict]         # Table rows with page numbers
    raw_text: str                 # Full text for heuristic fallback
    source_file: str              # Original filename

class PipelineResult(TypedDict):
    """Final output from ETL pipeline"""
    success: bool
    transactions: List[Transaction]
    stats: Dict[str, Any]         # row_count, processing_time, dq_stats
    audit: Dict[str, Any]         # document_hash, timestamps
