/**
 * main.js - QDoc Platform Logic
 * Handles tool selection, file uploads, and deterministic pipeline visualization.
 */
// --- CONFIGURATION ---
// Set this to your live backend URL when deploying (e.g., 'https://your-app.onrender.com')
const API_BASE_URL = 'http://localhost:5000';

// Supabase Configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// State
let currentTool = 'bank_to_excel';
let userTier = 'guest';
let usageCount = 0;
let currentUser = null;
let isSignUpMode = false;

const QUOTA_LIMITS = {
  'guest': 3,
  'free': 10,
  'pro': Infinity
};

const toolConfig = {
  'bank_to_excel': { title: 'Bank Statement to Excel', format: 'xlsx', view: 'upload', accept: '.pdf,.csv' },
  'pdf_to_csv': { title: 'PDF to CSV', format: 'csv', view: 'upload', accept: '.pdf' },
  'csv_to_excel': { title: 'CSV to Excel', format: 'xlsx', view: 'upload', accept: '.csv' },
  'excel_to_csv': { title: 'Excel to CSV', format: 'csv', view: 'upload', accept: '.xlsx,.xls' },
  'history': { title: 'Your History', view: 'history' },
  'subscription': { title: 'Subscription', view: 'subscription' }
};

// DOM Elements
const browseBtn = document.getElementById('browse-btn');
const fileInput = document.getElementById('file-input');
const uploadView = document.getElementById('upload-view');
const processingView = document.getElementById('processing-view');
const resultView = document.getElementById('result-view');
const historyView = document.getElementById('history-view');
const subscriptionView = document.getElementById('subscription-view');
const navItems = document.querySelectorAll('.nav-item');
const toolTitle = document.getElementById('tool-title');

// New DOM Elements for Auth
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authSubmit = document.getElementById('auth-submit');
const modalTitle = document.getElementById('modal-title');
const nameGroup = document.getElementById('name-group');
const profileSection = document.getElementById('profile-section');
const authGroup = document.querySelector('.auth-group');

// Initialize
async function setupFlipCard() {
  const container = document.getElementById('instruction-card-flip');
  const triggers = document.querySelectorAll('.flip-trigger');

  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      container.classList.toggle('flipped');
    });
  });
}

async function init() {
  setupNav();
  setupUpload();
  setupLegalLinks();
  setupFlipCard();
  updateQuotaDisplay();

  // Limit Modal Handlers
  const limitModal = document.getElementById('limit-modal');
  document.getElementById('close-limit-modal').onclick = () => limitModal.classList.add('hidden');
  document.getElementById('limit-signup-btn').onclick = () => {
    limitModal.classList.add('hidden');
    isSignUpMode = true;
    updateModalUI();
    authModal.classList.remove('hidden');
  };
  document.getElementById('limit-upgrade-btn').onclick = () => {
    limitModal.classList.add('hidden');
    const checkoutUrl = new URL(import.meta.env.VITE_LEMON_SQUEEZY_CHECKOUT_URL);
    if (currentUser) checkoutUrl.searchParams.set('checkout[custom][user_id]', currentUser.id);
    window.location.href = checkoutUrl.toString();
  };

  // Set initial file filter
  if (toolConfig[currentTool].accept) {
    fileInput.accept = toolConfig[currentTool].accept;
  } else {
    fileInput.accept = "";
  }

  // Check Auth State
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    handleAuthStateChange(session);

    supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthStateChange(session);
    });
  }
}

async function handleAuthStateChange(session) {
  if (session) {
    currentUser = session.user;
    authGroup.classList.add('hidden');
    profileSection.classList.remove('hidden');

    // Admin Access Check
    const adminEmail = 'admin@q-convert.com'; // Replace with your actual email
    if (currentUser.email === adminEmail) {
      document.getElementById('admin-nav-group').classList.remove('hidden');
    }

    // Fetch Profile for Tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (profile) {
      userTier = profile.tier || 'guest';
      document.getElementById('user-name').textContent = profile.full_name || currentUser.email.split('@')[0];
      const displayTier = userTier === 'pro' ? 'Unlimited' : `${QUOTA_LIMITS[userTier]} Conversions`;
      const tierLabel = document.getElementById('user-tier-label');
      tierLabel.textContent = displayTier.toUpperCase();
      tierLabel.className = `tier-tag ${userTier === 'pro' ? 'pro-tier' : ''}`;
      document.getElementById('user-avatar').textContent = (profile.full_name || 'U')[0].toUpperCase();

      // Update badge display
      document.getElementById('display-user-name').textContent = profile.full_name || currentUser.email.split('@')[0];
      const tierBadge = document.getElementById('display-tier-badge');
      tierBadge.textContent = displayTier.toUpperCase();
      tierBadge.className = `tier-tag ${userTier === 'pro' ? 'pro-tier' : ''}`;

      fetchUsage();
      updateSizeLimitUI();
    }
  } else {
    currentUser = null;
    userTier = 'guest';
    authGroup.classList.remove('hidden');
    profileSection.classList.add('hidden');
    document.getElementById('admin-nav-group').classList.add('hidden');

    // Reset badge
    document.getElementById('display-user-name').textContent = 'Guest User';
    const tierBadge = document.getElementById('display-tier-badge');
    tierBadge.textContent = '3 CONVERSIONS';
    tierBadge.className = 'tier-tag';

    fetchUsage('guest');
    updateSizeLimitUI();
  }
}

function updateSizeLimitUI() {
  const label = document.getElementById('size-limit-label');
  if (!label) return;

  const limits = {
    'guest': '2MB (3 Docs Limit)',
    'free': '10MB (10 Docs Limit)',
    'pro': '50MB (Unlimited Docs)'
  };

  const currentLimit = limits[userTier] || '2MB';
  label.innerHTML = `Max file size: <strong>${currentLimit}</strong>`;
}

function showLimitModal() {
  const modal = document.getElementById('limit-modal');
  const text = document.getElementById('limit-modal-text');
  const signupBtn = document.getElementById('limit-signup-btn');

  if (modal) {
    if (currentUser) {
      // User is logged in but reached Free limit
      text.innerHTML = `You've reached your free limit of <strong>10 conversions</strong>. Upgrade to <strong>QC Pro</strong> for unlimited processing and 50MB file support.`;
      signupBtn.classList.add('hidden');
    } else {
      // User is Guest
      text.innerHTML = `You've reached your guest limit. <strong>Create a free account</strong> to unlock 10 more conversions, or go Pro for unlimited access.`;
      signupBtn.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    resetUI();
  }
}

async function fetchUsage(targetTier) {
  const tier = targetTier || userTier;
  const url = currentUser
    ? `http://localhost:5000/user/usage?user_id=${currentUser.id}&tier=${tier}`
    : `http://localhost:5000/user/usage?tier=guest`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    usageCount = data.used || 0;
    updateQuotaDisplay();
  } catch (err) {
    console.warn("Failed to fetch usage quota", err);
  }
}

function updateQuotaDisplay() {
  const limit = QUOTA_LIMITS[userTier];
  const quotaSection = document.getElementById('quota-section');
  const quotaLabel = document.getElementById('quota-label');
  const quotaBar = document.getElementById('quota-bar');

  if (!quotaSection) return;

  if (limit === Infinity) {
    quotaSection.classList.add('hidden');
    return;
  }

  quotaSection.classList.remove('hidden');
  quotaLabel.innerText = `${usageCount}/${limit}`;
  const percent = (usageCount / limit) * 100;
  quotaBar.style.width = `${Math.min(percent, 100)}%`;

  if (percent >= 100) {
    quotaBar.style.background = '#ef4444'; // Red for warning
  } else {
    quotaBar.style.background = 'var(--accent)';
  }
}

function updateQuotaFromResponse(usage) {
  if (usage && typeof usage.used !== 'undefined') {
    usageCount = usage.used;
    updateQuotaDisplay();
  }
}

// Auth Handlers
document.querySelectorAll('.btn-signin, .btn-signup').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (e.target.classList.contains('btn-signup') && currentUser) {
      // If already logged in and clicking "Get Started", go to checkout
      const checkoutUrl = new URL(import.meta.env.VITE_LEMON_SQUEEZY_CHECKOUT_URL);
      checkoutUrl.searchParams.set('checkout[custom][user_id]', currentUser.id);
      window.location.href = checkoutUrl.toString();
      return;
    }
    isSignUpMode = e.target.classList.contains('btn-signup');
    updateModalUI();
    authModal.classList.remove('hidden');
  });
});

document.getElementById('close-modal').onclick = () => authModal.classList.add('hidden');
document.getElementById('modal-switch-btn').onclick = (e) => {
  e.preventDefault();
  isSignUpMode = !isSignUpMode;
  updateModalUI();
};

function updateModalUI() {
  modalTitle.textContent = isSignUpMode ? 'Create Account' : 'Sign In';
  authSubmit.textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
  nameGroup.style.display = isSignUpMode ? 'block' : 'none';
  document.getElementById('modal-switch-text').textContent = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('modal-switch-btn').textContent = isSignUpMode ? 'Sign In' : 'Sign Up';
}

authForm.onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const fullName = document.getElementById('auth-name').value;

  try {
    if (isSignUpMode) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      alert('Check your email for confirmation!');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    authModal.classList.add('hidden');
  } catch (err) {
    alert(err.message);
  }
};

document.getElementById('sign-out-btn').onclick = () => supabase.auth.signOut();

function setupNav() {
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      const toolKey = item.getAttribute('data-tool');
      if (!toolKey) return;

      // Log Tool Click Event
      logEvent('tool_select', toolKey);

      currentTool = toolKey;
      const config = toolConfig[currentTool];
      toolTitle.textContent = config.title;

      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update File Input Filter
      if (config.accept) {
        fileInput.accept = config.accept;
      } else {
        fileInput.accept = "";
      }

      if (currentTool === 'history') {
        fetchHistory();
      } else if (currentTool === 'subscription') {
        updateSubscriptionUI();
      }

      showView(config.view);
    });
  });

  // Global Click Tracking for Admin Analytics
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a, .nav-item');
    if (target) {
      const label = target.innerText || target.getAttribute('aria-label') || target.id || 'unlabeled_element';
      logEvent('ui_click', label.trim());
    }
  });
}

async function logEvent(type, element) {
  try {
    fetch(`${API_BASE_URL}/log/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: type,
        element: element,
        user_id: currentUser ? currentUser.id : null
      })
    });
  } catch (err) {
    console.warn("Analytics event failed", err);
  }
}

async function fetchHistory() {
  if (!currentUser) return;
  const tbody = document.getElementById('history-table').querySelector('tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Loading history...</td></tr>';

  try {
    const res = await fetch(`http://localhost:5000/user/history?user_id=${currentUser.id}`);
    const data = await res.json();

    tbody.innerHTML = '';
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No conversions yet.</td></tr>';
      return;
    }

    data.forEach(item => {
      const row = document.createElement('tr');
      const date = new Date(item.created_at).toLocaleDateString();
      row.innerHTML = `
        <td>${date}</td>
        <td>${item.total_rows}</td>
        <td>${item.processing_time_ms.toFixed(0)}ms</td>
        <td><span class="tier-tag ${item.dq_clean > 0 ? 'pro-tier' : ''}">Clean</span></td>
        <td style="font-family:monospace; font-size:0.75rem">${item.document_hash.substring(0, 12)}...</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent)">Failed to load history.</td></tr>';
  }
}

function updateSubscriptionUI() {
  const isPro = userTier === 'pro';
  document.getElementById('sub-plan-name').textContent = isPro ? 'Pro Platform' : 'Free Tier';
  document.getElementById('sub-badge').textContent = userTier.toUpperCase();
  document.getElementById('sub-badge').className = `tier-tag ${isPro ? 'pro-tier' : ''}`;

  const manageBtn = document.getElementById('manage-sub-btn');
  const portalLink = document.getElementById('sub-portal-link');

  if (isPro) {
    manageBtn.textContent = 'Active Subscription';
    manageBtn.classList.add('btn-ghost');
    manageBtn.style.cursor = 'default';
    portalLink.classList.remove('hidden');
  } else {
    manageBtn.textContent = 'Upgrade to Pro';
    manageBtn.classList.remove('btn-ghost');
    manageBtn.onclick = () => {
      const checkoutUrl = new URL(import.meta.env.VITE_LEMON_SQUEEZY_CHECKOUT_URL);
      if (currentUser) checkoutUrl.searchParams.set('checkout[custom][user_id]', currentUser.id);
      window.location.href = checkoutUrl.toString();
    };
    portalLink.classList.add('hidden');
  }
}

function setupUpload() {
  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  });

  // Drag-and-drop
  uploadView.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadView.classList.add('dragover');
  });

  uploadView.addEventListener('dragleave', () => {
    uploadView.classList.remove('dragover');
  });

  uploadView.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadView.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  });
}

const TIER_LIMITS = {
  'guest': 2 * 1024 * 1024,
  'free': 10 * 1024 * 1024,
  'pro': 50 * 1024 * 1024
};

function updateProgressUI(p, status, subStatus = "") {
  const bar = document.getElementById('conversion-progress-bar');
  const percentTxt = document.getElementById('progress-percent');
  const statusTxt = document.getElementById('progress-status');
  const subStatusTxt = document.getElementById('progress-sub-status');

  if (bar) bar.style.width = `${p}%`;
  if (percentTxt) percentTxt.innerText = `${p}%`;
  if (statusTxt) statusTxt.innerText = p === 100 ? "Success!" : status;
  if (subStatusTxt) subStatusTxt.innerText = subStatus;
}

async function processFile(file) {
  // 1. Check Size Constraint
  const maxSize = TIER_LIMITS[userTier] || TIER_LIMITS['guest'];
  if (file.size > maxSize) {
    alert(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max for your tier is ${maxSize / 1024 / 1024}MB.`);
    return;
  }
  // 1b. Check Extension Constraint (for Drag-and-Drop)
  const allowed = toolConfig[currentTool].accept;
  if (allowed) {
    const ext = "." + file.name.split('.').pop().toLowerCase();
    if (!allowed.split(',').includes(ext)) {
      alert(`Invalid file type. Please upload: ${allowed}`);
      return;
    }
  }

  showView('processing');
  updateProgressUI(0, "Connecting to Auditor...", "Establishing Secure Stream");

  const formData = new FormData();
  formData.append('file', file);
  formData.append('target_format', toolConfig[currentTool].format);
  formData.append('tool_type', currentTool);
  formData.append('tier', userTier);
  if (currentUser) {
    formData.append('user_id', currentUser.id);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/convert/document`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json();
      alert(`Error: ${errData.error || 'Request failed'}`);
      resetUI();
      return;
    }

    if (!response.body) throw new Error("ReadableStream not supported");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep partial line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);

          if (chunk.status === 'success') {
            updateProgressUI(100, "Done", "Rendering data...");
            renderResults(chunk);
            updateQuotaFromResponse(chunk.usage);
            return;
          } else if (chunk.status === 'failed' || chunk.status === 'limit_reached') {
            if (chunk.status === 'limit_reached') {
              showLimitModal();
            } else {
              alert(`Error: ${chunk.error || 'Processing failed'}`);
              resetUI();
            }
            return;
          } else if (typeof chunk.p !== 'undefined') {
            updateProgressUI(chunk.p, chunk.status, chunk.sub || "");
          }
        } catch (e) {
          console.warn("Error parsing chunk", e, line);
        }
      }
    }
  } catch (err) {
    console.error(err);
    alert('Network error or server failed to respond.');
    resetUI();
  }
}

function renderResults(data) {
  showView('result');

  document.getElementById('res-rows').textContent = data.total_rows;
  document.getElementById('res-time').textContent = `${data.processing_time_ms.toFixed(0)}ms`;
  document.getElementById('res-hash').textContent = `${data.document_hash.substring(0, 10)}...`;

  const dqSpan = document.getElementById('res-dq');
  const dqStats = data.dq_summary || {};
  const cleanCount = dqStats.CLEAN || dqStats.clean || 0;
  const total = data.total_rows || 0;

  if (total > 0 && cleanCount / total > 0.8) {
    dqSpan.textContent = "High Accuracy";
    dqSpan.style.color = "var(--success)";
  } else {
    dqSpan.textContent = "Recovered";
    dqSpan.style.color = "var(--warning)";
  }

  // DQ Breakdown
  if (dqStats) {
    document.getElementById('dq-clean').textContent = dqStats.CLEAN || dqStats.clean || 0;
    document.getElementById('dq-recovered').textContent = dqStats.RECOVERED_TRANSACTION || dqStats.recovered || 0;
    document.getElementById('dq-suspect').textContent = dqStats.SUSPECT || dqStats.suspect || 0;

    const dqNonTx = document.getElementById('dq-non-transaction');
    if (dqNonTx) dqNonTx.textContent = dqStats.NON_TRANSACTION || dqStats.non_transaction || 0;
  }

  // Reconciliation Status
  if (data.stats && data.stats.reconciliation) {
    const recon = data.stats.reconciliation;
    const statusEl = document.getElementById('recon-status');
    const expectedEl = document.getElementById('recon-expected');
    const actualEl = document.getElementById('recon-actual');
    const cardEl = document.getElementById('reconciliation-card');

    statusEl.textContent = recon.status || 'N/A';
    expectedEl.textContent = `$${(recon.expected_closing || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    actualEl.textContent = `$${(recon.actual_closing || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    if (recon.is_balanced) {
      cardEl.style.borderLeftColor = 'var(--success)';
      statusEl.style.color = 'var(--success)';
    } else {
      cardEl.style.borderLeftColor = '#ef4444';
      statusEl.style.color = '#ef4444';
    }
  }

  // Anomaly Stats
  if (data.stats && data.stats.anomalies) {
    const dups = data.stats.anomalies.duplicate_count;
    const rounds = data.stats.anomalies.round_amounts;

    let html = `<p style="font-size:0.8rem; margin-top:0.5rem; color:var(--text-muted)">Risk Signals:</p>`;

    if (dups > 0) html += `<span class="tier-tag" style="background:#fee2e2; color:#ef4444; margin-right:0.5rem">⚠️ ${dups} Duplicates</span>`;
    if (rounds > 0) html += `<span class="tier-tag" style="background:#ffedd5; color:#f97316">⚠️ ${rounds} Round Figures</span>`;

    if (dups === 0 && rounds === 0) html += `<span class="tier-tag" style="background:#dcfce7; color:#166534">✅ No Anomalies</span>`;

    let container = document.getElementById('anomaly-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'anomaly-container';
      container.style.marginTop = '1rem';
      document.querySelector('#result-view').appendChild(container);
    }
    container.innerHTML = html;
  }

  const downloadBtn = document.getElementById('download-btn');
  downloadBtn.href = `${API_BASE_URL}/download/${data.filename}`;

  // Render Preview Table (with Category and Flag)
  const tbody = document.getElementById('preview-table').querySelector('tbody');
  tbody.innerHTML = '';

  (data.preview || []).forEach(tx => {
    const row = document.createElement('tr');
    const isDebit = tx.tx_type === 'debit';
    const isCredit = tx.tx_type === 'credit';
    const dqFlag = tx.metadata?.dq_flag || 'clean';
    const category = tx.category || 'Uncategorized';

    row.innerHTML = `
      <td>${tx.post_date}</td>
      <td>${tx.description}</td>
      <td><span class="category-badge">${category}</span></td>
      <td style="text-align:right">${isDebit ? tx.amount.toFixed(2) : '-'}</td>
      <td style="text-align:right">${isCredit ? tx.amount.toFixed(2) : '-'}</td>
      <td style="text-align:right; font-weight:600">${tx.balance ? tx.balance.toFixed(2) : '-'}</td>
      <td><span class="flag-badge flag-${dqFlag}">${dqFlag.toUpperCase()}</span></td>
    `;
    tbody.appendChild(row);
  });

  // Render Summary Preview
  const summaryDiv = document.getElementById('summary-preview');
  if (data.stats && data.stats.financials) {
    summaryDiv.classList.remove('hidden');
    const fin = data.stats.financials;
    document.getElementById('sum-credits').textContent = `$${fin.total_credits.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('sum-debits').textContent = `$${fin.total_debits.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('sum-closing').textContent = `$${fin.closing_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }
}

function showView(viewName) {
  uploadView.classList.add('hidden');
  processingView.classList.add('hidden');
  resultView.classList.add('hidden');
  historyView.classList.add('hidden');
  subscriptionView.classList.add('hidden');

  if (viewName === 'upload') uploadView.classList.remove('hidden');
  if (viewName === 'processing') processingView.classList.remove('hidden');
  if (viewName === 'result') resultView.classList.remove('hidden');
  if (viewName === 'history') historyView.classList.remove('hidden');
  if (viewName === 'subscription') subscriptionView.classList.remove('hidden');
}

function resetUI() {
  showView('upload');
  fileInput.value = '';
  // Ensure the correct title is restored
  toolTitle.textContent = toolConfig[currentTool].title;
  updateSizeLimitUI();
}

const legalModal = document.getElementById('legal-modal');
const legalModalTitle = document.getElementById('legal-modal-title');
const legalModalBody = document.getElementById('legal-modal-body');
const closeLegalModalBtn = document.getElementById('close-legal-modal');

function setupLegalLinks() {
  const links = {
    'link-privacy': { title: 'Privacy Policy', url: 'privacy-policy.html' },
    'link-tos': { title: 'Terms of Service', url: 'terms-of-service.html' },
    'link-cookies': { title: 'Cookie Policy', url: 'cookie-policy.html' },
    'link-agreements': { title: 'User Agreements', url: 'agreements.html' }
  };

  Object.entries(links).forEach(([id, config]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => showLegalModal(config.title, config.url));
    }
  });

  closeLegalModalBtn.addEventListener('click', () => {
    legalModal.classList.add('hidden');
  });

  legalModal.addEventListener('click', (e) => {
    if (e.target === legalModal) {
      legalModal.classList.add('hidden');
    }
  });
}

async function showLegalModal(title, url) {
  legalModalTitle.textContent = title;
  legalModalBody.innerHTML = '<div class="processing-loader" style="margin-top:2rem"></div>';
  legalModal.classList.remove('hidden');

  try {
    const response = await fetch(url);
    const html = await response.text();

    // Create a temporary parser to extract the main content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const content = doc.querySelector('.legal-container') || doc.querySelector('main') || doc.body;

    // Remove the back link if it exists in the fetched content
    const backLink = content.querySelector('.back-link');
    if (backLink) backLink.remove();
    // Remove the h1 if it exists since we have it in the header
    const h1 = content.querySelector('h1');
    if (h1) h1.remove();

    legalModalBody.innerHTML = content.innerHTML;
  } catch (err) {
    legalModalBody.innerHTML = '<p style="color:red; text-align:center; padding:2rem;">Failed to load the policy content.</p>';
  }
}

document.getElementById('reset-btn').addEventListener('click', resetUI);

init();
