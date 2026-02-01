"""
Debug script to analyze what pdfplumber extracts from the Sample-Statement.pdf
"""
import pdfplumber

PDF_PATH = r"C:\Users\john-PC\Desktop\QFE\temp_uploads\20260131_145516_Sample-Statement.pdf"

# Custom table settings to try
table_settings = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
    "snap_tolerance": 3,
    "join_tolerance": 3,
}

with pdfplumber.open(PDF_PATH) as pdf:
    print(f"Total pages: {len(pdf.pages)}")
    
    for page_num, page in enumerate(pdf.pages[:2], 1):  # First 2 pages
        print(f"\n{'='*60}")
        print(f"PAGE {page_num}")
        print(f"{'='*60}")
        
        # Try with custom settings
        tables = page.extract_tables(table_settings)
        print(f"\nWith custom settings: Found {len(tables)} table(s)")
        
        if tables:
            for t_idx, table in enumerate(tables):
                print(f"\n--- Table {t_idx + 1} ({len(table)} rows) ---")
                for row_idx, row in enumerate(table[:8]):
                    print(f"Row {row_idx}: {row}")
        
        # Also show raw text for first 30 lines
        print(f"\n--- Raw Text (first 30 lines) ---")
        text = page.extract_text()
        if text:
            for i, line in enumerate(text.split('\n')[:30]):
                print(f"[{i}] {line}")

