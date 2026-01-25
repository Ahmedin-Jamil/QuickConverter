## Automated Deployment: GitHub to GoDaddy

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

### Manual Upload (Alternative)
... (existing instructions)
- **HTTPS:** Ensure GoDaddy's "AutoSSL" is active for `q-convert.com` so your site uses `https://`.
- **Clean Slate:** If you had a previous version of the site on GoDaddy, delete the old files from `public_html` before uploading the new `dist` contents.
- **Node.js:** You do **NOT** need to install Node.js on GoDaddy. Node is only used on your computer to build the files. GoDaddy just hosts the static HTML/JS.
