
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import io
import traceback
from datetime import datetime
import logging

# Setup Logging
log_file = os.environ.get('LOG_FILE', 'server.log')
logging.basicConfig(
    filename=log_file,
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s'
)
logging.info("Server starting up...")

# Assuming the file structure is:
# backend/
#   app.py
#   etl/
#     __init__.py
#     pipeline.py
#     ...

# Robust Import Logic for Script Execution
import sys
# Add the project root (parent of backend) to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

try:
    from backend.etl.pipeline import ETLPipeline
    from backend.supabase_client import SupabaseLogger
except ImportError as e:
    # Fallback for direct module execution
    logging.warning(f"Standard import failed: {e}. Trying local import.")
    try:
        from etl.pipeline import ETLPipeline
        from supabase_client import SupabaseLogger
    except ImportError as e2:
        logging.critical(f"CRITICAL: Could not import ETLPipeline or SupabaseLogger. Path: {sys.path}")
        raise e2


app = Flask(__name__)
# Enable CORS for production (Allow specific domain or all for simplicity in MVP)
CORS(app, resources={r"/*": {"origins": ["https://q-convert.com", "http://localhost:5173", "http://localhost:3000"]}})

# Folders
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'temp_uploads')
OUTPUT_FOLDER = os.path.join(os.getcwd(), 'outputs')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Usage stores removed (replaced by Supabase persistence)

# Initialize Pipeline & Logger
etl_pipeline = ETLPipeline()
db_logger = SupabaseLogger()

# Environment variables for dynamic URL (used in success frame & logs)
# Defaulting to the production URL to ensure reliability if Render environment variables aren't yet configured.
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://quickconverter-2wn9.onrender.com').rstrip('/')

import requests

# Geo-IP is used solely for abuse prevention and guest-tier usage enforcement,
# not analytics or profiling. This protects against automated scraping and 
# ensures fair distribution of guest resources.
GEO_CACHE = {}

def get_geo_info(ip):
    if not ip or ip == '127.0.0.1':
        return {"country": "Local", "city": "Developer"}
    if ip in GEO_CACHE:
        return GEO_CACHE[ip]
    try:
        r = requests.get(f"http://ip-api.com/json/{ip}", timeout=2)
        if r.status_code == 200:
            data = r.json()
            geo = {"country": data.get("country", "Unknown"), "city": data.get("city", "Unknown")}
            GEO_CACHE[ip] = geo
            return geo
    except:
        pass
    return {"country": "Unknown", "city": "Unknown"}

@app.route('/user/usage', methods=['GET'])
def get_user_usage():
    user_id = request.args.get('user_id')
    tier = request.args.get('tier', 'guest')
    
    if tier == 'pro':
        return jsonify({"used": 0, "limit": "unlimited"})
        
    if tier == 'guest':
        ip = request.remote_addr
        used = db_logger.get_user_usage_count(ip=ip)
        return jsonify({"used": used, "limit": 3})

    # Registered Free User
    used = db_logger.get_user_usage_count(user_id=user_id)
    return jsonify({"used": used, "limit": 10})

@app.route('/admin/verify', methods=['GET'])
def verify_admin_config():
    """Debug endpoint to verify Supabase Admin connectivity."""
    admin_secret = request.headers.get('X-Admin-Secret')
    if admin_secret != os.environ.get('ADMIN_SECRET', 'qc_super_secret_admin_2026'):
        return jsonify({"error": "Unauthorized"}), 403
        
    status = {
        "supabase_url": db_logger.url,
        "supabase_anon_configured": db_logger.client is not None,
        "supabase_admin_configured": db_logger.admin_client is not None,
        "env_check": {
            "URL": "SUPABASE_URL" in os.environ,
            "KEY": "SUPABASE_KEY" in os.environ,
            "SERVICE_ROLE": "SUPABASE_SERVICE_ROLE_KEY" in os.environ
        }
    }
    return jsonify(status)

import json
from flask import Response, stream_with_context

@app.route('/convert/document', methods=['POST'])
def convert_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    target_format = request.form.get('target_format', 'xlsx')
    user_tier = request.form.get('tier', 'guest')
    user_id = request.form.get('user_id')
    tool_type = request.form.get('tool_type', 'unknown')
    
    # ─── 0. Grab Metadata Before Request Finishes ───
    ip = request.remote_addr
    geo = get_geo_info(ip)
    browser = request.headers.get('User-Agent', 'Unknown')
    file_ext = file.filename.split('.')[-1].lower()

    # ─── 1. Size Validation (Must happen now while file is open) ───
    size_limits = {'guest': 2, 'free': 10, 'pro': 50}
    max_mb = size_limits.get(user_tier, 2)
    
    file.seek(0, os.SEEK_END)
    file_size_mb = file.tell() / (1024 * 1024)
    file.seek(0)

    if file_size_mb > max_mb:
        return jsonify({"status": "failed", "error": f"File too large ({file_size_mb:.1f}MB). Max is {max_mb}MB."}), 400

    # ─── 2. Persistent Storage (Save immediately) ───
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    temp_path = os.path.join(UPLOAD_FOLDER, safe_filename)
    file.save(temp_path)

    def generate():
        # Inside the generator, we ONLY use strings (temp_path, user_id, etc.)
        # NO more accessing request.files['file']
        
        usage_used = 0
        usage_limit = 0

        # Quota Logic
        if user_tier == 'guest':
            usage_used = db_logger.get_user_usage_count(ip=ip)
            usage_limit = 3
            if usage_used >= usage_limit:
                yield json.dumps({"status": "limit_reached", "error": "Guest limit reached (3 conversions)."}) + "\n"
                return
        elif user_tier == 'free' and user_id:
            try:
                usage_used = db_logger.get_user_usage_count(user_id=user_id)
                usage_limit = 10
                if usage_used >= usage_limit:
                    yield json.dumps({"status": "limit_reached", "error": "Free tier limit reached (10 conversions)."}) + "\n"
                    return
            except: pass

        yield json.dumps({"p": 5, "status": "Initializing..."}) + "\n"

        try:
            # Start the ETL Pipeline Generator
            pipeline_gen = etl_pipeline.process(temp_path, file_ext, target_format)
            
            last_stats = None
            final_result = None

            for p, msg, res in pipeline_gen:
                if res:
                    final_result = res
                    last_stats = res.get("stats")
                else:
                    yield json.dumps({"p": p, "status": msg}) + "\n"

            if not final_result or not final_result["success"]:
                error_msg = final_result.get("error", "Unknown ETL error") if final_result else "Pipeline failed"
                yield json.dumps({"status": "failed", "error": error_msg}) + "\n"
                return

            # Save Output
            ext = target_format if target_format != 'text' else 'txt'
            out_filename = f"converted_{os.path.splitext(safe_filename)[0]}.{ext}"
            out_path = os.path.join(OUTPUT_FOLDER, out_filename)
            
            with open(out_path, 'wb') as f:
                f.write(final_result["output_buffer"].getvalue())
            
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            if user_tier == 'guest':
                # No longer incrementing GUEST_SESSIONS here as it is deleted
                pass

            yield json.dumps({"p": 98, "status": "Finalizing..."}) + "\n"
            
            # Log to Supabase
            db_status = "success"
            try:
                db_logger.log_conversion(last_stats, user_id=user_id, tool_type=tool_type, geo=geo, browser=browser, ip=ip)
            except Exception as ex:
                logging.error(f"DB Log failed: {ex}")
                db_status = "failed"

            # Final Success Frame
            yield json.dumps({
                "status": "success",
                "tier": user_tier,
                "format": target_format,
                "stats": last_stats,
                "total_rows": last_stats["total_rows"],
                "processing_time_ms": last_stats["processing_time_ms"],
                "dq_summary": last_stats["dq_stats"],
                "preview": final_result.get("preview_data", []),
                "download_url": f"{API_BASE_URL}/download/{out_filename}",
                "document_hash": last_stats["document_hash"],
                "usage": {"used": db_logger.get_user_usage_count(user_id=user_id, ip=ip), "limit": usage_limit},
                "db_log": db_status
            }) + "\n"

        except Exception as e:
            logging.error(f"Streaming Error: {traceback.format_exc()}")
            yield json.dumps({"status": "failed", "error": str(e)}) + "\n"
            if os.path.exists(temp_path):
                os.remove(temp_path)

    return Response(stream_with_context(generate()), mimetype='application/x-ndjson')

@app.route('/log/event', methods=['POST'])
def log_event():
    data = request.json
    event_type = data.get('event_type')
    element = data.get('element')
    user_id = data.get('user_id')
    ip = request.remote_addr
    geo = get_geo_info(ip)
    
    db_logger.log_event(event_type, element, user_id=user_id, geo=geo)
    return jsonify({"status": "success"})


@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    path = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    return jsonify({"error": "File not found"}), 404


import hmac
import hashlib

@app.route('/webhook/lemonsqueezy', methods=['POST'])
def lemonsqueezy_webhook():
    payload = request.get_data()
    sig = request.headers.get('X-Signature')
    secret = os.environ.get('LEMON_SQUEEZY_WEBHOOK_SECRET')

    if not sig or not secret:
        return jsonify({"status": "forbidden"}), 403

    digest = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, digest):
        return jsonify({"status": "invalid_signature"}), 401

    data = request.json
    event_name = data.get('meta', {}).get('event_name')
    custom_data = data.get('meta', {}).get('custom_data', {})
    user_id = custom_data.get('user_id')
    
    if event_name in ['subscription_created', 'subscription_updated']:
        obj = data.get('data', {})
        attributes = obj.get('attributes', {})
        status = attributes.get('status')
        subscription_id = obj.get('id')

        if user_id:
            if status in ['active', 'on_trial']:
                db_logger.update_user_tier(user_id, 'pro', subscription_id)
            elif status in ['cancelled', 'expired', 'unpaid']:
                # Downgrade user if subscription is no longer valid
                db_logger.update_user_tier(user_id, 'free', subscription_id)
                
    return jsonify({"status": "success"}), 200

@app.route('/user/history', methods=['GET'])
def get_user_history():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    return jsonify(db_logger.get_conversion_history(user_id))

@app.route('/user/subscription_portal', methods=['GET'])
def get_subscription_portal():
    portal_url = "https://quickconvert.lemonsqueezy.com/billing"
    return jsonify({"portal_url": portal_url})

@app.route('/admin/stats', methods=['GET'])
def get_admin_dashboard_stats():
    admin_secret = request.headers.get('X-Admin-Secret')
    if admin_secret != os.environ.get('ADMIN_SECRET', 'qc_super_secret_admin_2026'):
        return jsonify({"error": "Unauthorized"}), 403

    return jsonify({
        "summary": db_logger.get_admin_stats(),
        "trends": db_logger.get_conversion_trends()
    })


@app.route('/admin/verify', methods=['GET'])
def admin_verify():
    """Diagnostic endpoint to verify Supabase connections."""
    status = {
        "supabase_url": db_logger.url,
        "client_auth": db_logger.client is not None,
        "admin_auth": db_logger.admin_client is not None,
        "env_check": {
            "URL": "SET" if os.environ.get("SUPABASE_URL") else "MISSING",
            "SERVICE_ROLE": "SET" if os.environ.get("SUPABASE_SERVICE_ROLE_KEY") else "MISSING"
        }
    }
    
    # Simple Query Test
    if db_logger.admin_client:
        try:
            res = db_logger.admin_client.table("conversions").select("id").limit(1).execute()
            status["db_query"] = "SUCCESS"
            status["conversions_count"] = len(res.data)
        except Exception as e:
            status["db_query"] = "FAILED"
            status["error"] = str(e)
    
    return jsonify(status)

# API_BASE_URL moved to top for scope visibility

if __name__ == '__main__':
    # Use environment port for Render/Railway
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG', 'False') == 'True')
