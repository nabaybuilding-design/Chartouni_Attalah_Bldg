async function loginWithSupabase(event) {
  if (event) event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const message = document.getElementById("loginMessage");

  message.textContent = "";

  if (!window.APP_CONFIG.useSupabase || !window.supabaseClient) {
    message.textContent = "Supabase is not configured.";
    return;
  }

  const { data, error } = await window.supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = error.message;
    return;
  }

  if (!data?.user) {
    message.textContent = "Login failed.";
    return;
  }

  window.location.href = "dashboard.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", loginWithSupabase);
  }
});
