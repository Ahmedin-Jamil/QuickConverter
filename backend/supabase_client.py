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
        """Logs conversion and returns True on success, False otherwise."""
        client = self.admin_client or self.client
        if not client:
             self.last_error = "Log Error: No Supabase client initialized."
             return False

        try:
            dq_stats = stats.get("dq_stats", {}) if stats else {}
            payload = {
                "user_id": user_id,
                "document_hash": stats.get("document_hash") if stats else "unknown",
                "total_rows": stats.get("total_rows") if stats else 0,
                "metadata_rows": stats.get("metadata_rows", 0) if stats else 0,
                "processing_time_ms": stats.get("processing_time_ms") if stats else 0,
                "dq_clean": dq_stats.get("CLEAN", dq_stats.get("clean", 0)),
                "dq_recovered": dq_stats.get("RECOVERED_TRANSACTION", dq_stats.get("recovered", 0)),
                "dq_suspect": dq_stats.get("SUSPECT", dq_stats.get("suspect", 0)),
                "dq_non_transaction": dq_stats.get("NON_TRANSACTION", dq_stats.get("non_transaction", 0)),
                "tool_type": tool_type,
                "ip_address": ip if ip else "Unknown"
            }
            logging.info(f"[DEBUG-DB] Attempting insert for {ip}")
            
            try:
                res = client.table("conversions").insert(payload).execute()
                if res.data:
                    logging.info(f"DB Success for IP {ip}")
                    self.last_error = None
                    return True
            except Exception as e:
                if 'ip_address' in str(e):
                    payload.pop("ip_address")
                    payload["ip"] = ip if ip else "Unknown"
                    res = client.table("conversions").insert(payload).execute()
                    if res.data:
                        logging.info(f"DB Success for IP {ip} (used 'ip' column)")
                        self.last_error = None
                        return True
                raise e
            
            return False # Fallthrough
                
        except Exception as e:
            self.last_error = f"Insert Exception: {str(e)}"
            logging.error(f"Supabase LOG_CONVERSION FAIL: {e}")
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
