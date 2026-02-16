import os
import logging
from datetime import datetime
from supabase import create_client

# Load vars (Manually for testing if needed)
url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")

print(f"URL found: {bool(url)}")
print(f"Service Key found: {bool(service_key)}")

if url and service_key:
    client = create_client(url, service_key)
    try:
        payload = {
            "user_id": None,
            "document_hash": "test_hash_" + datetime.now().strftime("%Y%m%d%H%M%S"),
            "total_rows": 0,
            "tool_type": "diagnostic",
            "ip_address": "1.1.1.1",
            "created_at": datetime.now().isoformat()
        }
        res = client.table("conversions").insert(payload).execute()
        print("Insert Success!")
        print("Result:", res.data)
    except Exception as e:
        print("Insert FAILED!")
        print("Error:", str(e))
else:
    print("Keys missing, cannot test.")
