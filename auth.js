
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// --- Supabase Config ---
const supabaseUrl = "https://mzmcbokizekxumbdgxsa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWNib2tpemVreHVtYmRneHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTA5MTAsImV4cCI6MjA4NjYyNjkxMH0.KDzxSZ7p3gWGfJYp49cWpPEA85h5cVVMBLjNzzt1BFg";

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- UI References ---
// Elements are selected dynamically to ensure DOM is ready

// --- Event Listeners ---
export function initAuth() {
  const authBtn = document.getElementById('authBtn');
  const closeAuth = document.getElementById('closeAuth');
  const doLoginBtn = document.getElementById('doLogin');
  const authModal = document.getElementById('authModal');

  if (authBtn) authBtn.addEventListener('click', () => openModal());
  if (closeAuth) closeAuth.addEventListener('click', () => closeModal());
  if (doLoginBtn) doLoginBtn.addEventListener('click', handleLogin);
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) closeModal();
    });
  }

  checkSession();
}

function openModal() {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.style.display = 'flex';
    authModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => authModal.classList.add('is-open'), 10);
  }
}

function closeModal() {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.classList.remove('is-open');
    setTimeout(() => {
      authModal.style.display = 'none';
      authModal.setAttribute('aria-hidden', 'true');
    }, 300);
  }
}

async function handleLogin() {
  const emailInput = document.getElementById('email');
  const email = emailInput?.value;

  if (!email) {
    showStatus("Please enter your email.", "error");
    return;
  }

  showStatus("Sending magic link...", "info");

  const { error } = await supabase.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: window.location.href
    }
  });

  if (error) {
    showStatus(error.message, "error");
  } else {
    showStatus("Magic link sent! Check your email.", "success");
    emailInput.value = "";
  }
}

function showStatus(msg, type) {
  const authStatus = document.getElementById('authStatus');
  if (authStatus) {
    authStatus.textContent = msg;
    authStatus.className = `auth-status ${type}`;
  }
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    updateAuthButton("Sign Out");
    console.log("User logged in:", session.user.email);
  } else {
    updateAuthButton("Log In");
  }

  // Listen for changes
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      updateAuthButton("Sign Out");
      closeModal();
    } else {
      updateAuthButton("Log In");
    }
  });
}


function updateAuthButton(text) {
  // Always get the latest element from DOM to be safe
  const currentBtn = document.getElementById('authBtn');
  if (!currentBtn) return;

  // Update text
  currentBtn.textContent = text;

  // Remove ALL known listeners.
  // Note: This requires the callback functions to be stable references (which they are: openModal, handleSignOut)
  currentBtn.removeEventListener('click', openModal);
  currentBtn.removeEventListener('click', handleSignOut);

  // Add the correct listener
  if (text === "Sign Out") {
    currentBtn.addEventListener('click', handleSignOut);
  } else {
    currentBtn.addEventListener('click', openModal);
  }
}

async function handleSignOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
