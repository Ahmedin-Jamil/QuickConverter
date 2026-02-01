"""Final Determinism check for QC ETL"""
from backend.etl.pipeline import ETLPipeline
import os
import json

# Sample CSV structure to simulate bank statement
CSV_CONTENT = """Date,Description,Amount,Balance
01/01/2026,Opening Balance,0.00,1000.00
01/02/2026,Uber Trip,25.00,975.00
01/03/2026,Salary Deposit,2000.00,2975.00
01/31/2026,Ending Balance,0.00,2975.00"""

def test_determinism():
    test_file = "determinism_test.csv"
    with open(test_file, "w") as f:
        f.write(CSV_CONTENT)
    
    pipeline = ETLPipeline()
    
    # Run 1
    gen1 = pipeline.process(test_file, "csv")
    res1 = None
    for _, _, r in gen1:
        if r: res1 = r
        
    # Run 2
    gen2 = pipeline.process(test_file, "csv")
    res2 = None
    for _, _, r in gen2:
        if r: res2 = r
        
    # Validation
    s1 = res1["stats"]
    s2 = res2["stats"]
    
    print("=== DETERMINISM RESULTS ===")
    print(f"Row count Match: {s1['total_rows'] == s2['total_rows']} ({s1['total_rows']})")
    print(f"DQ Stats Match: {s1['dq_stats'] == s2['dq_stats']}")
    print(f"Reconciliation Match: {s1['reconciliation']['is_balanced'] == s2['reconciliation']['is_balanced']}")
    print(f"Hash Match: {s1['document_hash'] == s2['document_hash']}")
    
    if s1['total_rows'] == 2 and s1['metadata_rows'] == 2 and s1['reconciliation']['is_balanced']:
        print("\n✅ Enterprise Logic Verified: 2 transactions, 2 metadata rows, balanced.")
    else:
        print("\n❌ Logic Error: Expected 2 transactions and 2 metadata rows.")
        print(f"Actual: {s1['total_rows']} tx, {s1['metadata_rows']} meta")

    os.remove(test_file)

if __name__ == "__main__":
    test_determinism()
