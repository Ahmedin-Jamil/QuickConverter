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
        self.url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
        self.key = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
        self.service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
        
        self.client = None
        self.admin_client = None
        self.last_error = None
        
        if self.url and self.key:
            try:
                self.client = create_client(self.url, self.key)
                if self.service_key:
                    self.admin_client = create_client(self.url, self.service_key)
                logging.info(f"Supabase initialized. Master: {bool(self.admin_client)}")
            except Exception as e:
                self.last_error = f"Init Error: {str(e)}"
                logging.warning(self.last_error)

    def log_conversion(self, stats: Dict[str, Any], user_id: str = None, tool_type: str = "general", browser: str = None, ip: str = None) -> None:
        # Crucial: Use Admin Client to bypass RLS
        client = self.admin_client or self.client
        if not client:
             self.last_error = "Log Error: No Supabase client initialized."
             return

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
                "ip_address": ip if ip else "Unknown",
                "created_at": datetime.now().isoformat()
            }
            
            # Use data property to ensure we capture the return
            res = client.table("conversions").insert(payload).execute()
            if not res.data:
                self.last_error = f"Insert empty. Response: {res}"
            else:
                logging.info(f"DB Success for IP {ip}")
                self.last_error = None # Clear error on success
                
        except Exception as e:
            self.last_error = f"Insert Exception: {str(e)}"
            logging.error(f"Supabase LOG_CONVERSION FAIL: {e}")

    def get_user_usage_count(self, user_id: str = None, ip: str = None) -> int:
        client = self.admin_client or self.client
        if not client: return 0
            
        try:
            start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
            query = client.table("conversions").select("id", count="exact")
            query = query.gte("created_at", start_of_month)
            
            if user_id:
                query = query.eq("user_id", user_id)
            elif ip:
                # Defensive: Try both 'ip_address' and 'ip' if needed, but 'ip_address' is our standard
                query = query.eq("ip_address", ip)
            else:
                return 0
            
            res = query.execute()
            count = res.count if hasattr(res, 'count') else len(res.data)
            return count
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
                "element": element,
                "created_at": datetime.now().isoformat()
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
