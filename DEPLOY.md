## Automated Deployment: GitHub to GoDaddy (Frontend)

This is the most professional way to deploy. Every time you `git push`, your site will automatically build and update on GoDaddy.

### 1. Get FTP Credentials from GoDaddy
1. Log in to **GoDaddy cPanel**.
2. Go to **FTP Accounts**.
3. Create a new account or use your main one. You need:
   - **FTP Server** (usually `ftp.q-convert.com` or your IP)
   - **FTP Username**
   - **FTP Password**

### 2. Add Secrets to GitHub
1. Go to your repository on GitHub.
2. Go to **Settings** > **Secrets and variables** > **Actions**.
3. Click **New repository secret** for each of these:
   - `FTP_SERVER`
   - `FTP_USERNAME`
   - `FTP_PASSWORD`

### 3. The Deployment Workflow
I have created a file at `.github/workflows/deploy.yml`. When you push this to GitHub, the automation will start.

---

## 🚀 Step 2: Deploying the Backend (API)

GoDaddy basic hosting doesn't support Python/Flask easily. We recommend **Render.com** (it's free and fast).

### 1. Connect Render to GitHub
1. Go to [Render.com](https://render.com/) and sign up.
2. Click **New** > **Web Service**.
3. Connect your GitHub account and select your `QuickConverter` repo.

### 2. Configure Build Settings
- **Runtime:** `Python 3`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn --chdir backend app:app`

### 3. Add Environment Variables
In the **Environment** tab on Render, add these:
- `SUPABASE_URL`: (Copy from your Supabase dashboard)
- `SUPABASE_KEY`: (Your `anon` key)
- `SUPABASE_SERVICE_ROLE_KEY`: (Your `service_role` key)
- `ADMIN_SECRET`: (e.g., `qc_super_secret_admin_2026`)
- `API_BASE_URL`: (Leave empty for now, it's used if the backend needs to know its own URL)

### 4. Connect Frontend to Backend
Once Render gives you a URL (e.g., `https://qc-api.onrender.com`), do this:
1. Open [main.js](file:///c:/Users/john-PC/Desktop/QFE/src/main.js)
2. Change `const API_BASE_URL = 'http://localhost:5000';` to your Render URL.
3. `git commit` and `git push`. GitHub will automatically update GoDaddy!

---

### Manual Upload (Alternative)
- **HTTPS:** Ensure GoDaddy's "AutoSSL" is active for `q-convert.com` so your site uses `https://`.
- **Node.js:** You do **NOT** need to install Node.js on GoDaddy. Node is used locally to build `dist`.

