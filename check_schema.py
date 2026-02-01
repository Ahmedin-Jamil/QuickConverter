
import os
from supabase import create_client

def load_dotenv(path):
    with open(path) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                os.environ[key] = value

def check_schema():
    load_dotenv(".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)
    
    print("--- Conversions Columns ---")
    try:
        res = client.table("conversions").select("*").limit(1).execute()
        if res.data:
            print(f"Columns: {list(res.data[0].keys())}")
            if 'ip_address' in res.data[0]:
                print("SUCCESS: 'ip_address' column found!")
            else:
                print("WARNING: 'ip_address' column MISSING!")
        else:
            print("Conversions table is empty - cannot check columns this way")
            # Try a dummy insert and catch error
            try:
                client.table("conversions").select("ip_address").limit(1).execute()
                print("SUCCESS: 'ip_address' column exists (query succeeded)")
            except Exception as e:
                print(f"FAILED: 'ip_address' column likely missing: {e}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_schema()
