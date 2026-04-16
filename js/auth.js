async function loginWithSupabase() {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const message = document.getElementById("loginMessage");

  message.textContent = "";

  if (!window.APP_CONFIG.useSupabase || !window.supabaseClient) {
    message.textContent = "Supabase is not configured.";
    return;
  }

  const { error } = await window.supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = error.message;
    return;
  }

  window.location.href = "dashboard.html";
}

document.getElementById("loginBtn").addEventListener("click", loginWithSupabase);