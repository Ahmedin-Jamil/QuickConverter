/**
 * main.js - QDoc Platform Logic
 * Handles tool selection, file uploads, and deterministic pipeline visualization.
 */
// --- CONFIGURATION ---
// Set this to your live backend URL when deploying (e.g., 'https://your-app.onrender.com')
const API_BASE_URL = 'https://quickconverter-2wn9.onrender.com';

// Supabase Configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;
  } catch (err) {
    console.warn("Supabase initialization failed (check config):", err);
  }
} else {
  console.warn("Supabase credentials missing. Auth features will be disabled.");
}

// State
let currentTool = 'bank_to_excel';
let userTier = 'guest';
let usageCount = 0;
let currentUser = null;
let isSignUpMode = false;
let processingStartTime = 0;
let timerInterval = null;

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
const infoModal = document.getElementById('info-modal');
const mobileInfoBtn = document.getElementById('mobile-info-btn');
const closeInfoBtn = document.getElementById('close-info-modal');
const authForm = document.getElementById('auth-form');
const authSubmit = document.getElementById('auth-submit');
const modalTitle = document.getElementById('modal-title');
const nameGroup = document.getElementById('name-group');
// const profileSection = document.getElementById('profile-section'); // Removed from DOM
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
  // Initial quota display (placeholder until fetch finishes)
  updateQuotaDisplay();

  // Sidebar Toggle Logic
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const mobileToggle = document.getElementById('mobile-toggle');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const wrapper = document.querySelector('.dashboard-wrapper');

  const closeSidebar = () => {
    if (sidebar) sidebar.classList.remove('mobile-active');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  };

  if (sidebarToggle && sidebar && wrapper) {
    sidebarToggle.onclick = () => {
      if (window.innerWidth <= 768) {
        closeSidebar();
      } else {
        wrapper.classList.toggle('sidebar-collapsed');
      }
    };
  }

  if (mobileToggle && sidebar && sidebarOverlay) {
    mobileToggle.onclick = () => {
      sidebar.classList.add('mobile-active');
      sidebarOverlay.classList.add('active');
    };
    sidebarOverlay.onclick = closeSidebar;

    // Auto-close sidebar on link click (for mobile)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    });
  }

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      handleAuthStateChange(session);

      supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthStateChange(session);
      });
    } catch (err) {
      console.error("Supabase session check failed:", err);
      // Fallback for guest mode if Auth fails
      fetchUsage('guest');
    }
  } else {
    // Supabase not configured -> Guest Mode
    fetchUsage('guest');
  }
}

async function handleAuthStateChange(session) {
  const signOutBtn = document.getElementById('sign-out-btn-footer');

  if (session) {
    currentUser = session.user;
    authGroup.classList.add('hidden');
    if (signOutBtn) signOutBtn.classList.remove('hidden');

    // Fetch Profile for Tier
    if (supabase) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (profile) {
        userTier = profile.tier || 'guest';
        // OWNER BYPASS: matching backend logic
        if (currentUser.email === 'jamil.al.amin1100@gmail.com') userTier = 'pro';

        document.getElementById('user-avatar-small').textContent = (profile.full_name || 'U')[0].toUpperCase();

        // Update badge display
        const nameEl = document.getElementById('display-user-name');
        if (nameEl) nameEl.textContent = profile.full_name || currentUser.email.split('@')[0];

        const tierBadge = document.getElementById('display-tier-badge');
        if (tierBadge) {
          tierBadge.textContent = displayTier.toUpperCase();
          tierBadge.className = `tier-tag ${userTier === 'pro' ? 'pro-tier' : ''}`;
        }

        fetchUsage();
        updateSizeLimitUI();
      }
    }
  } else {
    currentUser = null;
    userTier = 'guest';
    authGroup.classList.remove('hidden');
    if (signOutBtn) signOutBtn.classList.add('hidden');

    // Reset badge
    const nameEl = document.getElementById('display-user-name');
    if (nameEl) nameEl.textContent = 'Guest User';

    const tierBadge = document.getElementById('display-tier-badge');
    if (tierBadge) {
      tierBadge.textContent = '3 CONVERSIONS';
      tierBadge.className = 'tier-tag';
    }

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
    ? `${API_BASE_URL}/user/usage?user_id=${currentUser.id}&tier=${tier}&t=${Date.now()}`
    : `${API_BASE_URL}/user/usage?tier=guest&t=${Date.now()}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('[DEBUG-USAGE] Fetch:', data, 'Current Tier:', userTier);
    usageCount = data.used || 0;

    // Auto-correct tier based on response
    if (data.limit === 'unlimited' || data.limit > 50) {
      userTier = 'pro';
    }

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

  if (limit === Infinity || userTier === 'pro') {
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

const signOutBtn = document.getElementById('sign-out-btn-footer');
if (signOutBtn) signOutBtn.onclick = () => supabase.auth.signOut();

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
  const container = document.getElementById('history-container');
  const emptyState = document.getElementById('history-empty');
  // Use new ID or fallback to querySelector
  const tbody = document.getElementById('history-body') || document.getElementById('history-table').querySelector('tbody');

  tbody.innerHTML = '';

  try {
    const resp = await fetch(`${API_BASE_URL}/user/history?user_id=${currentUser.id}`);
    const data = await resp.json();

    if (!data || data.length === 0) {
      if (container) container.classList.add('custom-hidden');
      if (emptyState) emptyState.classList.remove('custom-hidden');
      return;
    }

    // Has data
    if (emptyState) emptyState.classList.add('custom-hidden');
    if (container) container.classList.remove('custom-hidden');

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
    console.warn("Failed to load history", err);
    // On error, show empty state with safety check
    if (container) container.classList.add('custom-hidden');
    if (emptyState) emptyState.classList.remove('custom-hidden');
  }
}

function updateSubscriptionUI() {
  const isPro = userTier === 'pro';
  const isFree = userTier === 'free';
  const isGuest = userTier === 'guest';

  // Update Plan Name & Badge
  document.getElementById('sub-plan-name').textContent = isPro ? 'QC Pro Platform' : (isFree ? 'Free Forever' : 'Guest Tier');
  document.getElementById('sub-badge').textContent = userTier.toUpperCase();
  document.getElementById('sub-badge').className = `tier-tag ${isPro ? 'pro-tier' : ''}`;

  // Update Description (Guest: 3, Free: 10, Pro: Unlimited)
  const descEl = document.getElementById('sub-plan-desc');
  if (isPro) {
    descEl.textContent = 'Full access to all professional features.';
  } else if (isFree) {
    descEl.textContent = 'Limited to 10 conversions per month.';
  } else {
    descEl.textContent = 'Limited to 3 conversions per session.';
  }

  // Handle Price Tag Visibility (Only show if Pro)
  const priceTag = document.getElementById('sub-price-tag');
  if (priceTag) priceTag.style.display = isPro ? 'block' : 'none';

  // Handle Benefits Card (Hide if already pro)
  const benefitsCard = document.getElementById('pro-benefits-card');
  if (benefitsCard) benefitsCard.style.display = isPro ? 'none' : 'block';

  const manageBtn = document.getElementById('manage-sub-btn');
  const portalLink = document.getElementById('sub-portal-link');

  if (isPro) {
    manageBtn.textContent = 'Active Subscription';
    manageBtn.classList.add('btn-ghost');
    manageBtn.style.cursor = 'default';
    manageBtn.onclick = null;
    portalLink.classList.remove('hidden');
  } else {
    manageBtn.textContent = 'Upgrade to Pro — $9.00';
    manageBtn.classList.remove('btn-ghost');
    manageBtn.style.cursor = 'pointer';
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

function updateProgressUI(p, status, subStatus = "", isError = false) {
  const bar = document.getElementById('conversion-progress-bar');
  const percentTxt = document.getElementById('progress-percent');
  const statusTxt = document.getElementById('progress-status');
  const subStatusTxt = document.getElementById('progress-sub-status');
  const loaderContainer = document.querySelector('.loader-container');

  if (bar) {
    bar.style.width = `${p}%`;
    bar.style.background = isError ? 'var(--error)' : 'var(--accent)';
  }

  if (percentTxt) {
    percentTxt.innerText = isError ? "!" : `${p}%`;
    percentTxt.style.color = isError ? 'var(--error)' : 'var(--accent)';
  }

  if (statusTxt) {
    statusTxt.innerText = p === 100 ? "Success!" : status;
    statusTxt.style.color = isError ? 'var(--error)' : 'var(--text-primary)';
  }

  // Handle Pulse Ring Color on Error
  const ring = document.querySelector('.pulse-ring');
  if (ring) {
    ring.style.borderColor = isError ? 'var(--error)' : 'var(--accent)';
  }

  // Update Status Text only (Timer handled by startTimer)
  subStatusTxt.innerText = subStatus;

  // Hide estimation box if error occurs
  const estBox = document.getElementById('estimated-time-container');
  if (estBox) {
    estBox.style.display = isError ? 'none' : 'flex';
  }
}

function startTimer() {
  processingStartTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsedEl = document.getElementById('elapsed-timer-val');
    const percentTxt = document.getElementById('progress-percent');

    // Check if we are in an error state (percentTxt would be "!")
    const isError = percentTxt && percentTxt.innerText === "!";
    const pStr = percentTxt ? percentTxt.innerText.replace('%', '') : "0";
    const p = parseInt(pStr) || 0;

    if (processingStartTime > 0 && p < 100 && !isError && elapsedEl) {
      const elapsed = ((Date.now() - processingStartTime) / 1000).toFixed(1);
      elapsedEl.innerText = `${elapsed}s`;
    }
  }, 100);
}

function stopTimer() {
  clearInterval(timerInterval);
  processingStartTime = 0;
}

async function processFile(file) {
  // 1. Check Size Constraint
  const maxSize = TIER_LIMITS[userTier] || TIER_LIMITS['guest'];
  if (file.size > maxSize) {
    showFileTooLargeModal(file.size, maxSize);
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

  const estTimeVal = document.getElementById('estimated-time-val');
  if (estTimeVal) {
    estTimeVal.innerText = estimateConversionTime(file.size);
  }

  showView('processing');
  startTimer();
  updateProgressUI(0, "Initiating Extraction Pipeline...", "Establishing Secure Audit Stream");

  const formData = new FormData();
  formData.append('file', file);
  formData.append('target_format', toolConfig[currentTool].format);
  formData.append('tool_type', currentTool);
  formData.append('tier', userTier);
  if (currentUser) {
    formData.append('user_id', currentUser.id);
    formData.append('user_email', currentUser.email);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/convert/document`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json();
      stopTimer();
      updateProgressUI(0, "Conversion Failed", errData.error || 'Request failed', true);
      // Add a "Back to Upload" button dynamically if it doesn't exist
      addErrorResetButton();
      return;
    }

    if (!response.body) throw new Error("ReadableStream not supported");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Final update
        updateProgressUI(100, "Processing Complete", "Finalizing spreadsheet...");
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep partial line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (handleChunk(chunk)) return;
        } catch (e) {
          console.warn("Error parsing chunk", e, line);
        }
      }
    }

    // Process final buffer if stream closed but last chunk remained
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        handleChunk(chunk);
      } catch (e) {
        console.warn("Error parsing final buffer", e, buffer);
      }
    }

    function handleChunk(chunk) {
      if (chunk.status === 'success') {
        stopTimer();
        updateProgressUI(100, "Success", "Rendering ledger...");
        renderResults(chunk);
        updateQuotaFromResponse(chunk.usage);
        return true;
      } else if (chunk.status === 'failed' || chunk.status === 'limit_reached') {
        stopTimer();
        if (chunk.status === 'limit_reached') {
          updateProgressUI(0, "Limit Reached", "Monthly quota exceeded. Please upgrade.", true);
          showLimitModal();
          addErrorResetButton();
        } else {
          updateProgressUI(0, "Processing Error", chunk.error || 'Extraction failed', true);
          addErrorResetButton();
        }
        return true;
      } else if (typeof chunk.p !== 'undefined') {
        let status = chunk.status;
        let sub = chunk.sub || "";
        if (chunk.p < 30) {
          status = "Parsing Data Structures...";
          sub = "Executing OCR & Layout Assessment";
        } else if (chunk.p < 60) {
          status = "Normalizing Transactions...";
          sub = "Applying Deterministic Cleaning Rules";
        } else if (chunk.p < 90) {
          status = "Reconciling Balances...";
          sub = "Validating Mathematical Integrity";
        }
        updateProgressUI(chunk.p, status, sub);
      }
      return false;
    }
  } catch (err) {
    stopTimer();
    console.error(err);
    updateProgressUI(0, "Network Error", "Server failed to respond. Please check connection.", true);
    addErrorResetButton();
  }
}

function addErrorResetButton() {
  const card = document.querySelector('.processing-details');
  if (card && !document.getElementById('error-reset-btn')) {
    const btn = document.createElement('button');
    btn.id = 'error-reset-btn';
    btn.className = 'btn-secondary';
    btn.style.marginTop = '2rem';
    btn.style.width = '100%';
    btn.innerText = 'Back to Workspace';
    btn.onclick = () => {
      resetUI();
      btn.remove();
    };
    card.appendChild(btn);
  }
}

function renderResults(data) {
  showView('result');

  const resRows = document.getElementById('res-rows');
  const resTime = document.getElementById('res-time');
  const resHash = document.getElementById('res-hash');

  if (resRows) resRows.textContent = data.total_rows;
  if (resTime) resTime.textContent = `${data.processing_time_ms.toFixed(0)}ms`;
  if (resHash) resHash.textContent = `${data.document_hash.substring(0, 10)}...`;

  const dqSpan = document.getElementById('res-dq');
  const dqStats = data.dq_summary || {};
  const cleanCount = dqStats.CLEAN || dqStats.clean || 0;
  const total = data.total_rows || 0;

  if (dqSpan) {
    if (total > 0 && cleanCount / total > 0.8) {
      dqSpan.textContent = "High Fidelity";
      dqSpan.className = "stat-value emerald";
    } else {
      dqSpan.textContent = "Recovered";
      dqSpan.className = "stat-value warning";
    }
  }

  // DQ Breakdown
  if (dqStats) {
    const dqClean = document.getElementById('dq-clean');
    const dqRecovered = document.getElementById('dq-recovered');
    const dqSuspect = document.getElementById('dq-suspect');
    const dqNonTx = document.getElementById('dq-non-transaction');

    if (dqClean) dqClean.textContent = dqStats.CLEAN || dqStats.clean || 0;
    if (dqRecovered) dqRecovered.textContent = dqStats.RECOVERED_TRANSACTION || dqStats.recovered || 0;
    if (dqSuspect) dqSuspect.textContent = dqStats.SUSPECT || dqStats.suspect || 0;
    if (dqNonTx) dqNonTx.textContent = dqStats.NON_TRANSACTION || dqStats.non_transaction || 0;
  }

  // Reconciliation Status
  if (data.stats && data.stats.reconciliation) {
    const recon = data.stats.reconciliation;
    const statusEl = document.getElementById('recon-status');
    const expectedEl = document.getElementById('recon-expected');
    const actualEl = document.getElementById('recon-actual');
    const cardEl = document.getElementById('reconciliation-card');

    if (statusEl) statusEl.textContent = recon.is_balanced ? 'Integrity Verified' : 'Discrepancy Detected';
    if (expectedEl) expectedEl.textContent = `$${(recon.expected_closing || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (actualEl) actualEl.textContent = `$${(recon.actual_closing || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    if (cardEl) {
      if (recon.is_balanced) {
        cardEl.style.borderColor = 'var(--accent-glow)';
        if (statusEl) statusEl.className = 'recon-status-text';
      } else {
        cardEl.style.borderColor = 'var(--error)';
        if (statusEl) {
          statusEl.className = 'recon-status-text';
          statusEl.style.color = 'var(--error)';
        }
      }
    }
  }

  const downloadBtn = document.getElementById('download-btn');
  if (downloadBtn) downloadBtn.href = data.download_url;

  // Render Preview Table
  const tbody = document.getElementById('preview-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    (data.preview || []).forEach(tx => {
      const row = document.createElement('tr');
      const isDebit = tx.tx_type === 'debit';
      const isCredit = tx.tx_type === 'credit';
      const dqFlag = tx.metadata?.dq_flag || 'clean';
      const category = tx.category || 'Uncategorized';

      row.innerHTML = `
          <td>${tx.post_date}</td>
          <td class="tx-desc" title="${tx.description}">${tx.description}</td>
          <td><span class="category-badge">${category}</span></td>
          <td style="text-align:right" class="${isDebit ? 'debit-val' : ''}">${isDebit ? tx.amount.toFixed(2) : '-'}</td>
          <td style="text-align:right" class="${isCredit ? 'credit-val' : ''}">${isCredit ? tx.amount.toFixed(2) : '-'}</td>
          <td style="text-align:right; font-weight:600">${tx.balance ? tx.balance.toFixed(2) : '-'}</td>
          <td><span class="flag-badge flag-${dqFlag}">${dqFlag.toUpperCase()}</span></td>
        `;
      tbody.appendChild(row);
    });
  }
}
function showView(viewName) {
  const uploadView = document.getElementById('upload-view');
  const processingView = document.getElementById('processing-view');
  const resultView = document.getElementById('result-view');
  const historyView = document.getElementById('history-view');
  const subscriptionView = document.getElementById('subscription-view');

  if (uploadView) uploadView.classList.add('hidden');
  if (processingView) processingView.classList.add('hidden');
  if (resultView) resultView.classList.add('hidden');
  if (historyView) historyView.classList.add('hidden');
  if (subscriptionView) subscriptionView.classList.add('hidden');

  if (viewName === 'upload' && uploadView) uploadView.classList.remove('hidden');
  if (viewName === 'processing' && processingView) processingView.classList.remove('hidden');
  if (viewName === 'result' && resultView) resultView.classList.remove('hidden');
  if (viewName === 'history' && historyView) historyView.classList.remove('hidden');
  if (viewName === 'subscription' && subscriptionView) subscriptionView.classList.remove('hidden');
}

function resetUI() {
  showView('upload');
  fileInput.value = '';
  // Ensure the correct title is restored
  toolTitle.textContent = toolConfig[currentTool].title;
  updateSizeLimitUI();
}

function estimateConversionTime(fileSize) {
  const mb = fileSize / 1024 / 1024;
  if (mb < 0.5) return "3-5 seconds";
  if (mb < 2) return "10-20 seconds";
  if (mb < 10) return "45-90 seconds";
  return "~2-3 minutes";
}

function showFileTooLargeModal(actualSize, limit) {
  const modal = document.getElementById('limit-modal');
  const text = document.getElementById('limit-modal-text');
  const signupBtn = document.getElementById('limit-signup-btn');
  const actualMB = (actualSize / 1024 / 1024).toFixed(1);
  const limitMB = (limit / 1024 / 1024).toFixed(0);
  const estTime = estimateConversionTime(actualSize);

  if (modal) {
    text.innerHTML = `
      <div style="margin-top:1.5rem; text-align:left; background:rgba(255,191,36,0.05); border:1px solid var(--warning); padding:1rem; border-radius: var(--radius-md);">
        <p style="color:var(--warning); font-weight:800; font-size:0.7rem; text-transform:uppercase; margin-bottom:0.5rem;">⚠️ High Density Document</p>
        <p style="color:var(--text-primary); font-size:0.9rem;">
          This file is <strong>${actualMB}MB</strong>. Processing high-density statements of this size involves 
          complex ETL orchestration and usually takes <strong>${estTime}</strong> for full normalization.
        </p>
      </div>
      <p style="margin-top:1.5rem; font-size:0.9rem; color:var(--text-secondary);">
        Your current tier limit is <strong>${limitMB}MB</strong>. 
        Upgrade to <strong>QC Pro</strong> to process documents up to 50MB.
      </p>
    `;
    if (currentUser) {
      signupBtn.classList.add('hidden');
    } else {
      signupBtn.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
    resetUI();
  }
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
      el.addEventListener('click', (e) => {
        e.preventDefault();
        showLegalModal(config.title, config.url);
      });
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

// --- Mobile Info Modal Logic ---
if (mobileInfoBtn && infoModal && closeInfoBtn) {
  mobileInfoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    infoModal.classList.remove('hidden');
  });

  closeInfoBtn.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  // Close on outside click
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) {
      infoModal.classList.add('hidden');
    }
  });

  // Mobile Privacy Toggle Logic
  const privacyTrigger = document.getElementById('mobile-privacy-trigger');
  const privacyBack = document.getElementById('mobile-privacy-back');
  const instructionsView = document.getElementById('mobile-instructions-view');
  const privacyView = document.getElementById('mobile-privacy-view');
  const modalTitle = document.getElementById('info-modal-title');

  if (privacyTrigger && privacyBack && instructionsView && privacyView) {
    privacyTrigger.addEventListener('click', () => {
      instructionsView.classList.add('hidden');
      privacyView.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = "Privacy Policy";
    });

    privacyBack.addEventListener('click', () => {
      privacyView.classList.add('hidden');
      instructionsView.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = "How It Works";
    });

    // Reset view when closing
    const resetInfoModal = () => {
      privacyView.classList.add('hidden');
      instructionsView.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = "How It Works";
    };

    closeInfoBtn.addEventListener('click', resetInfoModal);
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) resetInfoModal();
    });
  }
}

document.getElementById('reset-btn').addEventListener('click', resetUI);

document.getElementById('reset-btn').addEventListener('click', resetUI);

init();
