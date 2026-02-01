
import os
from supabase import create_client

def load_dotenv(path):
    with open(path) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                key, value = line.strip().split('=', 1)
                os.environ[key] = value

def check_auth():
    load_dotenv(".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)
    
    print("--- Auth Users ---")
    try:
        res = client.auth.admin.list_users()
        if res:
            for u in res[:3]: # last 3
                print(f"ID: {u.id}, Email: {u.email}")
        else:
            print("No users found")
    except Exception as e:
        print(f"Error Auth: {e}")

if __name__ == "__main__":
    check_auth()
