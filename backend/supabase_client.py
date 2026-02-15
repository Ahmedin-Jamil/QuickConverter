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
        self.url = os.environ.get("SUPABASE_URL")
        self.key = os.environ.get("SUPABASE_KEY")
        self.client = None
        
        if self.url and self.key:
            try:
                self.client = create_client(self.url, self.key)
                
                # Admin client for tier updates (S2S)
                service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
                if service_key:
                    self.admin_client = create_client(self.url, service_key)
                else:
                    self.admin_client = None
                    
                logging.info("Supabase clients initialized.")
            except Exception as e:
                logging.warning(f"Failed to initialize Supabase client: {e}")

    def update_user_tier(self, user_id: str, tier: str, subscription_id: str = None) -> bool:
        """
        Update a user's tier in the profiles table.
        Requires Service Role Key.
        """
        if not self.admin_client:
            logging.error("Admin Supabase client not initialized. Cannot update tier.")
            return False

        try:
            data = {"tier": tier}
            if subscription_id:
                data["ls_subscription_id"] = subscription_id
            
            self.admin_client.table("profiles").update(data).eq("id", user_id).execute()
            logging.info(f"Updated user {user_id} to tier: {tier}")
            return True
        except Exception as e:
            logging.error(f"Failed to update user tier: {e}")
            return False

    def log_conversion(self, stats: Dict[str, Any], user_id: str = None, tool_type: str = "general", browser: str = None, ip: str = None) -> None:
        """
        Log conversion metrics to 'conversions' table with geo/tool data.
        """
        if not self.admin_client:
            logging.info("Supabase Admin not configured. Using Anon client (may fail RLS).")
            # Fallback to anon client if admin is missing (though expected to be present)
            client = self.admin_client or self.client
        else:
            client = self.admin_client

        if not client:
             logging.info("Supabase not configured. Skipping log.")
             return

        try:
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
            logging.info(f"Conversion metrics (tool: {tool_type}) logged to Supabase.")
            
        except Exception as e:
            logging.error(f"Failed to log to Supabase: {e}")

    def log_event(self, event_type: str, element: str, user_id: str = None) -> None:
        """
        Log UI events (clicks, navigations) for heatmaps/behavioral analysis.
        """
        if not self.admin_client and not self.client: return
        client = self.admin_client or self.client
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

    def get_conversion_history(self, user_id: str):
        """
        Fetch last 50 conversions for a user.
        """
        if not self.client: return []
        try:
            res = self.client.table("conversions").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
            return res.data
        except Exception as e:
            logging.error(f"Failed to fetch history: {e}")
            return []

    def get_user_usage_count(self, user_id: str = None, ip: str = None) -> int:
        """
        Query Supabase to count conversions for a user or IP address.
        """
        if not self.admin_client: return 0
        try:
            query = self.admin_client.table("conversions").select("id", count="exact")
            if user_id:
                query = query.eq("user_id", user_id)
            elif ip:
                query = query.eq("ip_address", ip)
            else:
                return 0
            
            res = query.execute()
            return res.count if hasattr(res, 'count') else len(res.data)
        except Exception as e:
            logging.error(f"Failed to fetch usage count: {e}")
            return 0

    def get_admin_stats(self) -> Dict[str, Any]:
        """
        Aggregate platform-wide metrics for the Super Admin dashboard.
        """
        # Default empty structure to prevent JS "undefined"
        default_stats = {
            "total_users": 0,
            "pro_users": 0,
            "total_conversions": 0,
            "total_rows": 0,
            "tool_ranking": {},
            "geo_ranking": {},
            "click_ranking": {},
            "recent_conversions": []
        }

        if not self.admin_client: 
            logging.error("ADMIN_CLIENT_FAIL: Service role key missing or invalid.")
            return default_stats

        try:
            logging.info("Fetching admin stats from Supabase...")
            # 1. Total Users
            profiles = self.admin_client.table("profiles").select("id, tier").execute()
            total_users = len(profiles.data)
            pro_users = len([u for u in profiles.data if u.get('tier') == 'pro'])
            
            # 2. Total Conversions & Aggregations
            conversions_res = self.admin_client.table("conversions").select("*").execute()
            conversions = conversions_res.data or []
            total_conversions = len(conversions)
            total_rows_processed = sum([(c.get('total_rows') or 0) for c in conversions])

            # Tool Usage Ranking
            tool_ranking = {}
            for c in conversions:
                t = c.get('tool_type') or 'unknown'
                tool_ranking[t] = tool_ranking.get(t, 0) + 1
            
            # Geo Ranking (Countries)
            geo_ranking = {}
            for c in conversions:
                country = c.get('country') or 'Unknown'
                geo_ranking[country] = geo_ranking.get(country, 0) + 1

            # 3. Events Ranking (Most Clicked Elements)
            try:
                events_res = self.admin_client.table("events").select("element").execute()
                events = events_res.data
                click_ranking = {}
                for e in events:
                    el = e.get('element') or 'unlabeled'
                    click_ranking[el] = click_ranking.get(el, 0) + 1
            except:
                click_ranking = {}

            # 4. Fetch User Emails for Mapping (Admin only)
            user_map = {}
            try:
                users = self.admin_client.auth.admin.list_users()
                for u in users:
                    user_map[u.id] = u.email
            except Exception as auth_err:
                logging.warning(f"Failed to fetch user emails: {auth_err}")

            # Clean up rankings and recent items for JSON safety
            clean_recent = []
            for c in conversions[-10:]:
                # Ensure all keys are strings and values are JSON serializable
                clean_c = {str(k): v for k, v in c.items() if k is not None}
                # Inject user email
                u_id = c.get('user_id')
                clean_c['user_email'] = user_map.get(u_id, 'Guest') if u_id else 'Guest'
                clean_recent.append(clean_c)

            return {
                "total_users": int(total_users),
                "pro_users": int(pro_users),
                "total_conversions": int(total_conversions),
                "total_rows": int(total_rows_processed),
                "tool_ranking": {str(k): v for k, v in tool_ranking.items()},
                "geo_ranking": {str(k): v for k, v in geo_ranking.items()},
                "click_ranking": {str(k): v for k, v in click_ranking.items()},
                "recent_conversions": clean_recent
            }
        except Exception as e:
            logging.error(f"ADMIN_STATS_CRITICAL_FAIL: {str(e)}")
            import traceback
            logging.error(traceback.format_exc())
            return default_stats

    def get_conversion_trends(self):
        """
        Fetch daily conversion volume for charts.
        """
        if not self.client: return []
        try:
            # Simple aggregation for chart visualization
            res = self.client.table("conversions").select("created_at").execute()
            return res.data
        except Exception as e:
            logging.error(f"Failed to fetch trends: {e}")
            return []

    def log_conversion(self, stats: Dict[str, Any], user_id: str = None, tool_type: str = 'general', browser: str = None, ip: str = None) -> None:
        logging.info(f'Logging conversion for IP: {ip}, User: {user_id}')
        # ... rest of function
