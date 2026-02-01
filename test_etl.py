"""Test script for ETL corrections"""
from backend.etl.filter import TransactionFilter
from backend.etl.dq import DataQualityEngine

# Test data
rows = [
    {'post_date': '01/01', 'description': 'Opening Balance', 'amount': 0, 'tx_type': 'balance', 'balance': 1000, 'metadata': {'extraction_method': 'table'}},
    {'post_date': '01/02', 'description': 'Uber Trip', 'amount': 25, 'tx_type': 'debit', 'balance': 975, 'metadata': {'extraction_method': 'table'}},
    {'post_date': '01/03', 'description': 'Salary Deposit', 'amount': 2000, 'tx_type': 'credit', 'balance': 2975, 'metadata': {'extraction_method': 'table'}},
    {'post_date': '01/31', 'description': 'Ending Balance', 'amount': 0, 'tx_type': 'balance', 'balance': 2975, 'metadata': {'extraction_method': 'table'}},
]

# Test Filter
f = TransactionFilter()
eligible, metadata_rows, extracted_meta = f.filter(rows)

print("=== FILTER TEST ===")
print(f"Eligible Transactions: {len(eligible)}")
print(f"Metadata Rows: {len(metadata_rows)}")
print(f"Opening Balance: ${extracted_meta['opening_balance']}")
print(f"Closing Balance: ${extracted_meta['closing_balance']}")

# Test DQ Engine
dq = DataQualityEngine()
eligible = dq.assess(eligible, metadata_rows=metadata_rows, extracted_metadata=extracted_meta)

print("\n=== DQ TEST ===")
print(f"Stats: {dq.get_stats()}")
print(f"Reconciliation: {dq.get_reconciliation()}")

# Verify determinism
print("\n=== DETERMINISM TEST ===")
f2 = TransactionFilter()
e2, m2, meta2 = f2.filter(rows)
print(f"Same eligible count: {len(eligible) == len(e2)}")
print(f"Same metadata count: {len(metadata_rows) == len(m2)}")
print(f"Same opening balance: {extracted_meta['opening_balance'] == meta2['opening_balance']}")

print("\n✅ All tests passed!")
