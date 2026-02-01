
import os
from supabase import create_client

def load_dotenv(path):
    with open(path) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                os.environ[key] = value

def check_usage():
    load_dotenv(".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)
    
    # Check for local developer "IP"
    ip = "127.0.0.1" 
    try:
        res = client.table("conversions").select("id", count="exact").eq("ip_address", ip).execute()
        count = res.count if hasattr(res, 'count') else len(res.data)
        print(f"Current usage for {ip}: {count}/3")
        if count >= 3:
            print("STATUS: Limit should be enforced!")
        else:
            print(f"STATUS: {3-count} conversions remaining.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_usage()
