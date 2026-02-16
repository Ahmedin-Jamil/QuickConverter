"""
Supabase Logging Client - Hardened for Quota Persistence Debugging.
"""
import os
import logging
from typing import Dict, Any
from datetime import datetime

try:
    from supabase import create_client, Client
except ImportError:
    Client = Any

class SupabaseLogger:
    def __init__(self):
        # Allow both standard and VITE_ prefixed keys for compatibility
        self.url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
        self.key = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
        
        # Aggressive Search for Service Key
        self.service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
        if not self.service_key:
            for k, v in os.environ.items():
                if "SERVICE_ROLE_KEY" in k.upper():
                    self.service_key = v
                    logging.info(f"Aggressive Match: Found Service Key in {k}")
                    break

        self.client = None
        self.admin_client = None
        self.last_error = None
        
        if self.url and self.key:
            try:
                self.client = create_client(self.url, self.key)
                if self.service_key:
                    self.admin_client = create_client(self.url, self.service_key)
                logging.info(f"Supabase Init - Master Client: {bool(self.admin_client)}")
            except Exception as e:
                self.last_error = f"Init Error: {str(e)}"
                logging.warning(self.last_error)

    def log_conversion(self, stats: Dict[str, Any], user_id: str = None, tool_type: str = "general", browser: str = None, ip: str = None) -> bool:
        """Logs conversion with a [HARDENED-V3] Minimal-First strategy."""
        client = self.admin_client or self.client
        if not client:
             self.last_error = "[V3] No client"
             return False

        try:
            dq_stats = stats.get("dq_stats", {}) if stats else {}
            
            # THE CORE PAYLOAD - These columns are 100% confirmed
            payload = {
                "user_id": user_id,
                "document_hash": stats.get("document_hash") if stats else "unknown",
                "total_rows": stats.get("total_rows") if stats else 0,
                "ip_address": ip if ip else "Unknown"
            }
            
            logging.info(f"[DEBUG-DB] [V3] Minimal Insert for {ip}")
            
            # Step 1: Save the core record first
            try:
                res = client.table("conversions").insert(payload).execute()
                if not res.data:
                    self.last_error = "[V3] No data returned"
                    return False
                
                # Success! Record is saved. Now try to enrich with optional DQ stats.
                conv_id = res.data[0].get("id")
                if conv_id:
                    enrichment = {
                        "processing_time_ms": stats.get("processing_time_ms") if stats else 0,
                        "dq_clean": dq_stats.get("CLEAN", dq_stats.get("clean", 0)),
                        "dq_recovered": dq_stats.get("RECOVERED_TRANSACTION", dq_stats.get("recovered", 0)),
                        "dq_suspect": dq_stats.get("SUSPECT", dq_stats.get("suspect", 0))
                    }
                    try:
                        client.table("conversions").update(enrichment).eq("id", conv_id).execute()
                    except:
                        logging.warning("[V3] Enrichment failed (minor)")
                
                self.last_error = None
                return True

            except Exception as e:
                err_str = str(e)
                # Fallback for 'ip_address' vs 'ip'
                if "ip_address" in err_str:
                    payload.pop("ip_address")
                    payload["ip"] = ip if ip else "Unknown"
                    res = client.table("conversions").insert(payload).execute()
                    if res.data:
                        self.last_error = None
                        return True
                
                self.last_error = f"[V3] Insert Error: {err_str}"
                return False
                
        except Exception as e:
            self.last_error = f"[V3] Critical: {str(e)}"
            return False

    def get_user_usage_count(self, user_id: str = None, ip: str = None) -> int:
        client = self.admin_client or self.client
        if not client: return 0
            
        try:
            # Filter by current month
            start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
            
            if user_id:
                res = client.table("conversions").select("id", count="exact").gte("created_at", start_of_month).eq("user_id", user_id).execute()
                return res.count if hasattr(res, 'count') else len(res.data)
            elif ip:
                # Try both 'ip_address' and 'ip' for reading
                try:
                    res = client.table("conversions").select("id", count="exact").gte("created_at", start_of_month).eq("ip_address", ip).execute()
                    return res.count if hasattr(res, 'count') else len(res.data)
                except:
                    res = client.table("conversions").select("id", count="exact").gte("created_at", start_of_month).eq("ip", ip).execute()
                    return res.count if hasattr(res, 'count') else len(res.data)
            else:
                return 0
        except Exception as e:
            self.last_error = f"Usage Fetch Exception: {str(e)}"
            logging.error(f"Supabase USAGE_FETCH FAIL for {user_id or ip}: {e}")
            return 0

    def get_user_tier(self, user_id: str) -> str:
        """Fetches the actual tier for a given user_id."""
        client = self.admin_client or self.client
        if not client or not user_id:
            return "guest"
        try:
            res = client.table("profiles").select("tier").eq("id", user_id).single().execute()
            if res.data:
                return res.data.get("tier", "free")
            return "free" # Default for logged in users
        except Exception as e:
            logging.error(f"Failed to fetch tier for {user_id}: {e}")
            return "free" # Safe fallback for auth users

    def log_event(self, event_type: str, element: str, user_id: str = None) -> None:
        client = self.admin_client or self.client
        if not client: return
        try:
            payload = {
                "user_id": user_id,
                "event_type": event_type,
                "element": element
            }
            client.table("events").insert(payload).execute()
        except Exception as e:
            logging.error(f"Event Log fail: {e}")

    def get_conversion_history(self, user_id: str):
        if not self.client: return []
        try:
            res = self.client.table("conversions").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
            return res.data
        except: return []

    def get_admin_stats(self) -> Dict[str, Any]:
        if not self.admin_client: return {}
        try:
            conversions = self.admin_client.table("conversions").select("*").execute().data
            return {"total": len(conversions)}
        except: return {}
