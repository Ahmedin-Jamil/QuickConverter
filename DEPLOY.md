# Deployment Guide for q-convert.com (GoDaddy)

Since **q-convert.com** is now a 100% client-side static site, you can host it on any GoDaddy shared hosting plan (cPanel).

## How to Deploy to GoDaddy

### 1. Build the Project
In your local terminal, run the build command:
```bash
npm run build
```
This will create a folder named `dist` in your project directory. This folder contains the final, optimized website files.

### 2. Upload to GoDaddy (via cPanel File Manager)
1. Log in to your **GoDaddy Dashboard**.
2. Go to **My Products** > **Web Hosting** > **Manage**.
3. Click **cPanel Admin**.
4. Open the **File Manager**.
5. Navigate to the `public_html` folder (this is the root directory for your main domain).
6. **Upload everything INSIDE the `dist` folder**:
   - Open your local `dist` folder.
   - Upload all files and folders (assets, index.html, privacy-policy.html) directly to `public_html`.
   - *Note: Do not upload the `dist` folder itself, just its contents.*

### 3. Verification
- Open `https://q-convert.com` in your browser.
- Ensure all images and conversion tools are working.

---

### Important Notes
- **HTTPS:** Ensure GoDaddy's "AutoSSL" is active for `q-convert.com` so your site uses `https://`.
- **Clean Slate:** If you had a previous version of the site on GoDaddy, delete the old files from `public_html` before uploading the new `dist` contents.
- **Node.js:** You do **NOT** need to install Node.js on GoDaddy. Node is only used on your computer to build the files. GoDaddy just hosts the static HTML/JS.
