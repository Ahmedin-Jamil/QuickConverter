import requests
import os

BASE_URL = "http://localhost:5000"
ADMIN_SECRET = "qc_super_secret_admin_2026"

def verify():
    # 1. Get initial stats
    print("Fetching initial stats...")
    try:
        r = requests.get(f"{BASE_URL}/admin/stats", headers={"X-Admin-Secret": ADMIN_SECRET}, timeout=5)
        stats = r.json()
        initial_conversions = stats['summary']['total_conversions']
        print(f"Initial conversions: {initial_conversions}")
    except Exception as e:
        print(f"Failed to fetch stats: {e}")
        return

    # 2. Perform conversion
    print("Performing test conversion...")
    files = {'file': ('test.txt', b'dummy content', 'text/plain')}
    data = {'tier': 'guest', 'tool_type': 'test_tool'}
    try:
        r = requests.post(f"{BASE_URL}/convert/document", files=files, data=data, timeout=10)
        print(f"Conversion status: {r.status_code}")
        print(r.text[:500]) # Preview response
    except Exception as e:
        print(f"Conversion failed: {e}")
        return

    # 3. Get final stats
    print("Fetching final stats...")
    try:
        r = requests.get(f"{BASE_URL}/admin/stats", headers={"X-Admin-Secret": ADMIN_SECRET}, timeout=5)
        stats = r.json()
        final_conversions = stats['summary']['total_conversions']
        print(f"Final conversions: {final_conversions}")
        
        if final_conversions > initial_conversions:
            print("SUCCESS: Conversion count incremented!")
        else:
            print("FAILURE: Conversion count did not increment.")
    except Exception as e:
        print(f"Failed to fetch stats: {e}")

if __name__ == "__main__":
    verify()
