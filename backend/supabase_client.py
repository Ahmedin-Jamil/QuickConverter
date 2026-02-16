"""
Supabase Logging Client - For ETL observability.

Logs processing metrics to Supabase for monitoring and audit.
Designed to fail gracefully if keys are not provided.
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
    """
    Deterministic logger for ETL metrics.
    """
    
    def __init__(self):
        # Allow both standard and VITE_ prefixed keys for compatibility
        self.url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
        self.key = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
        self.service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
        self.client = None
        self.admin_client = None
        
        if self.url and self.key:
            try:
                self.client = create_client(self.url, self.key)
                if self.service_key:
                    self.admin_client = create_client(self.url, self.service_key)
                logging.info(f"Supabase initialized. Admin: {bool(self.admin_client)}")
            except Exception as e:
                logging.warning(f"Failed to initialize Supabase client: {e}")

    def log_conversion(self, stats: Dict[str, Any], user_id: str = None, tool_type: str = "general", browser: str = None, ip: str = None) -> None:
        client = self.admin_client or self.client
        if not client:
             logging.info("Supabase not configured. Skipping log.")
             return

        try:
            logging.info(f"Logging conversion for IP: {ip}, User: {user_id}")
            dq_stats = stats.get("dq_stats", {})
            payload = {
                "user_id": user_id,
                "document_hash": stats.get("document_hash"),
                "total_rows": stats.get("total_rows"),
                "metadata_rows": stats.get("metadata_rows", 0),
                "processing_time_ms": stats.get("processing_time_ms"),
                "dq_clean": dq_stats.get("CLEAN", dq_stats.get("clean", 0)),
                "dq_recovered": dq_stats.get("RECOVERED_TRANSACTION", dq_stats.get("recovered", 0)),
                "dq_suspect": dq_stats.get("SUSPECT", dq_stats.get("suspect", 0)),
                "dq_non_transaction": dq_stats.get("NON_TRANSACTION", dq_stats.get("non_transaction", 0)),
                "tool_type": tool_type,
                "ip_address": ip if ip else "Unknown",
                "created_at": datetime.now().isoformat()
            }
            
            client.table("conversions").insert(payload).execute()
        except Exception as e:
            logging.error(f"Failed to log to Supabase: {e}")

    def get_user_usage_count(self, user_id: str = None, ip: str = None) -> int:
        # Fallback to standard client if admin is not available
        client = self.admin_client or self.client
        if not client:
            return 0
            
        try:
            start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
            query = client.table("conversions").select("id", count="exact")
            query = query.gte("created_at", start_of_month)
            
            if user_id:
                query = query.eq("user_id", user_id)
            elif ip:
                query = query.eq("ip_address", ip)
            else:
                return 0
            
            res = query.execute()
            count = res.count if hasattr(res, 'count') else len(res.data)
            logging.info(f"Usage count for {user_id or ip}: {count}")
            return count
        except Exception as e:
            logging.error(f"Failed to fetch usage count: {e}")
            return 0

    def get_conversion_history(self, user_id: str):
        if not self.client: return []
        try:
            res = self.client.table("conversions").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
            return res.data
        except Exception as e:
            logging.error(f"Failed to fetch history: {e}")
            return []

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
            logging.error(f"Failed to log event: {e}")
            
    def get_admin_stats(self) -> Dict[str, Any]:
        if not self.admin_client: return {}
        try:
            profiles = self.admin_client.table("profiles").select("id, tier").execute()
            conversions_res = self.admin_client.table("conversions").select("*").execute()
            conversions = conversions_res.data or []
            return {
                "total_users": len(profiles.data),
                "total_conversions": len(conversions),
                "total_rows": sum([(c.get('total_rows') or 0) for c in conversions])
            }
        except Exception:
            return {}
