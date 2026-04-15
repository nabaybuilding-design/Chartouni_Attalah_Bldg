const STORAGE_KEY = "chartouni_attalah_building_local_db";
const SESSION_KEY = "chartouni_attalah_building_session";

const defaultData = {
  apartments: [
    {
      id: 1,
      apartment_id: "A-101",
      owner_name: "Dummy User 101",
      owner_email: "user101@chartouniattalah.com",
      owner_mobile: "71111111",
      owner_role: "User",
      password: "user123",
      created_at: "2026-04-15"
    },
    {
      id: 2,
      apartment_id: "A-102",
      owner_name: "Dummy User 102",
      owner_email: "user102@chartouniattalah.com",
      owner_mobile: "72222222",
      owner_role: "User",
      password: "user102",
      created_at: "2026-04-15"
    },
    {
      id: 3,
      apartment_id: "A-103",
      owner_name: "Dummy User 103",
      owner_email: "user103@chartouniattalah.com",
      owner_mobile: "73333333",
      owner_role: "User",
      password: "user103",
      created_at: "2026-04-15"
    },
    {
      id: 4,
      apartment_id: "A-ADMIN",
      owner_name: "System Admin",
      owner_email: "admin@chartouniattalah.com",
      owner_mobile: "70000000",
      owner_role: "Admin",
      password: "admin123",
      created_at: "2026-04-15"
    }
  ],
  waterMeter: [
    {
      id: 1,
      apartment_id: "A-101",
      counter_month: "2026-04-01",
      previous_counter: 1200,
      new_counter: 1280,
      created_at: "2026-04-10"
    },
    {
      id: 2,
      apartment_id: "A-102",
      counter_month: "2026-04-01",
      previous_counter: 2200,
      new_counter: 2275,
      created_at: "2026-04-10"
    },
    {
      id: 3,
      apartment_id: "A-103",
      counter_month: "2026-04-01",
      previous_counter: 500,
      new_counter: 560,
      created_at: "2026-04-10"
    }
  ],
  monthlyBills: [
    {
      id: 1,
      month: "2026-04-01",
      water_bill: 120,
      fix_bill: 35,
      created_at: "2026-04-02"
    }
  ],
  payments: [
    {
      id: 1,
      apartment_id: "A-101",
      month: "2026-04-01",
      amount_paid: 80,
      payment_date: "2026-04-12",
      notes: "Partial payment"
    },
    {
      id: 2,
      apartment_id: "A-102",
      month: "2026-04-01",
      amount_paid: 155,
      payment_date: "2026-04-12",
      notes: "Paid in full"
    }
  ]
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return clone(defaultData);
  }
  return JSON.parse(raw);
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function loginLocal() {
  const db = loadDB();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const message = document.getElementById("loginMessage");

  const user = db.apartments.find(
    row =>
      (row.owner_email || "").toLowerCase() === email &&
      (row.password || "") === password
  );

  if (!user) {
    message.textContent = "Invalid email or password.";
    return;
  }

  saveSession(user);
  window.location.href = "dashboard.html";
}

document.getElementById("loginBtn").addEventListener("click", loginLocal);