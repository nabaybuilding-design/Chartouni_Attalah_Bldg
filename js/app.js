const STORAGE_KEY = "chartouni_attalah_building_local_db";
const SESSION_KEY = "chartouni_attalah_building_session";

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

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

let db = loadDB();
let currentUser = loadSession();

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return clone(defaultData);
  }
  return JSON.parse(raw);
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

function savePDF() {
  window.print();
}

function getMonthKey(dateValue) {
  return (dateValue || "").slice(0, 7);
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function calculateWaterFees(wm) {
  const usage = Number(wm.new_counter || 0) - Number(wm.previous_counter || 0);

  const waterBillRow = db.monthlyBills.find(
    b => getMonthKey(b.month) === getMonthKey(wm.counter_month)
  );

  const waterBill = Number(waterBillRow?.water_bill || 0);

  const totalUsageSameMonth = db.waterMeter
    .filter(row => getMonthKey(row.counter_month) === getMonthKey(wm.counter_month))
    .reduce((sum, row) => {
      return sum + (Number(row.new_counter || 0) - Number(row.previous_counter || 0));
    }, 0);

  return totalUsageSameMonth > 0
    ? (usage * waterBill) / totalUsageSameMonth
    : 0;
}

function getDetailedDashboardRows() {
  return db.waterMeter.map(wm => {
    const apartment = db.apartments.find(a => a.apartment_id === wm.apartment_id) || {};
    const monthKey = getMonthKey(wm.counter_month);
    const usage = Number(wm.new_counter || 0) - Number(wm.previous_counter || 0);
    const monthBill = db.monthlyBills.find(b => getMonthKey(b.month) === monthKey) || {
      water_bill: 0,
      fix_bill: 0
    };

    const waterFees = calculateWaterFees(wm);
    const fixBill = Number(monthBill.fix_bill || 0);
    const totalDue = waterFees + fixBill;

    const totalPaid = db.payments
      .filter(p => p.apartment_id === wm.apartment_id && getMonthKey(p.month) === monthKey)
      .reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

    let status = "Overdue";
    if (totalPaid >= totalDue && totalDue > 0) status = "Paid";
    else if (totalPaid > 0 && totalPaid < totalDue) status = "Partial";

    return {
      apartment_id: wm.apartment_id,
      owner_name: apartment.owner_name || "",
      counter_month: wm.counter_month,
      usage,
      water_fees: waterFees,
      fix_bill: fixBill,
      total_due: totalDue,
      total_paid: totalPaid,
      pending_dues: totalPaid - totalDue,
      status
    };
  });
}

function getCombinedDashboardRows() {
  const grouped = {};

  getDetailedDashboardRows().forEach(row => {
    if (!grouped[row.apartment_id]) {
      grouped[row.apartment_id] = {
        apartment_id: row.apartment_id,
        owner_name: row.owner_name,
        total_usage: 0,
        total_water_fees: 0,
        total_fix_bill: 0,
        total_due: 0,
        total_paid: 0,
        pending_dues: 0,
        status: "Overdue"
      };
    }

    grouped[row.apartment_id].total_usage += row.usage;
    grouped[row.apartment_id].total_water_fees += row.water_fees;
    grouped[row.apartment_id].total_fix_bill += row.fix_bill;
    grouped[row.apartment_id].total_due += row.total_due;
    grouped[row.apartment_id].total_paid += row.total_paid;
    grouped[row.apartment_id].pending_dues += row.pending_dues;
  });

  Object.values(grouped).forEach(item => {
    if (item.total_paid >= item.total_due && item.total_due > 0) item.status = "Paid";
    else if (item.total_paid > 0 && item.total_paid < item.total_due) item.status = "Partial";
    else item.status = "Overdue";
  });

  return Object.values(grouped);
}

function nextId(tableName) {
  return db[tableName].length
    ? Math.max(...db[tableName].map(row => row.id)) + 1
    : 1;
}

function openModal(title, bodyHTML) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHTML;
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("modalBody").innerHTML = "";
}

function openAddPaymentModal() {
  openModal("Add Payment", `
    <div class="grid-2">
      <div class="form-group">
        <label>Apartment ID</label>
        <select id="pay_apartment_id">
          ${db.apartments.map(a => `
            <option value="${a.apartment_id}">${a.apartment_id}</option>
          `).join("")}
        </select>
      </div>

      <div class="form-group">
        <label>Month</label>
        <input id="pay_month" type="date">
      </div>

      <div class="form-group">
        <label>Amount Paid</label>
        <input id="pay_amount_paid" type="number">
      </div>

      <div class="form-group">
        <label>Payment Date</label>
        <input id="pay_payment_date" type="date">
      </div>

      <div class="form-group" style="grid-column: 1 / -1;">
        <label>Notes</label>
        <textarea id="pay_notes"></textarea>
      </div>
    </div>

    <button class="btn-primary" onclick="addPayment()">Add</button>
  `);
}

function openAddPaymentFromDashboard(apartmentId, month) {
  openModal("Pay Apartment Bill", `
    <div class="grid-2">
      <div class="form-group">
        <label>Apartment ID</label>
        <input id="pay_apartment_id" type="text" value="${apartmentId}" readonly>
      </div>

      <div class="form-group">
        <label>Month</label>
        <input id="pay_month" type="date" value="${month}" readonly>
      </div>

      <div class="form-group">
        <label>Amount Paid</label>
        <input id="pay_amount_paid" type="number">
      </div>

      <div class="form-group">
        <label>Payment Date</label>
        <input id="pay_payment_date" type="date">
      </div>

      <div class="form-group" style="grid-column: 1 / -1;">
        <label>Notes</label>
        <textarea id="pay_notes"></textarea>
      </div>
    </div>

    <button class="btn-primary" onclick="addPayment()">Add</button>
  `);
}

function addPayment() {
  db.payments.push({
    id: nextId("payments"),
    apartment_id: document.getElementById("pay_apartment_id").value,
    month: document.getElementById("pay_month").value,
    amount_paid: Number(document.getElementById("pay_amount_paid").value || 0),
    payment_date: document.getElementById("pay_payment_date").value,
    notes: document.getElementById("pay_notes").value
  });

  saveDB();
  closeModal();
  renderPaymentsTable();
}

function renderSidebar() {
  const sidebar = document.getElementById("sidebar");

  if (currentUser.owner_role === "Admin") {
    sidebar.innerHTML = `
      <h3>Admin Menu</h3>
      <button class="menu-btn" onclick="renderAdminOverview()">Overview</button>
      <button class="menu-btn" onclick="renderApartmentsTable()">Add Apartment</button>
      <button class="menu-btn" onclick="renderWaterMeterTable()">Add WaterMeter</button>
      <button class="menu-btn" onclick="renderMonthlyBillsTable()">Add MonthlyBills</button>
      <button class="menu-btn" onclick="renderPaymentsTable()">Add Payments</button>
    `;
  } else {
    sidebar.innerHTML = `
      <h3>User Menu</h3>
      <button class="menu-btn" onclick="renderUserDashboard()">My Overview</button>
      <button class="menu-btn" onclick="renderUserPaymentHistory()">My Payment History</button>
    `;
  }
}

function renderAdminOverview() {
  const rows = getCombinedDashboardRows();
  const totalDue = rows.reduce((s, r) => s + r.total_due, 0);
  const totalPaid = rows.reduce((s, r) => s + r.total_paid, 0);
  const totalRemaining = rows.reduce((s, r) => s + (r.total_paid - r.total_due), 0);

  document.getElementById("mainContent").innerHTML = `
    <div class="summary-boxes">
      <div class="summary-box">Apartments<strong>${db.apartments.length}</strong></div>
      <div class="summary-box">Total Due<strong>${formatNumber(totalDue)}</strong></div>
      <div class="summary-box">Total Paid<strong>${formatNumber(totalPaid)}</strong></div>
      <div class="summary-box">Remaining Balance<strong>${formatNumber(totalRemaining)}</strong></div>
    </div>

    <div class="card">
      <div class="card-title"><h3>Combined_Dashboard</h3></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartment ID</th>
              <th>Owner Name</th>
              <th>Total Usage</th>
              <th>Total Water Fees</th>
              <th>Total Fix Bill</th>
              <th>Total Due</th>
              <th>Total Paid</th>
              <th>Pending Dues</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.apartment_id}</td>
                <td>${r.owner_name}</td>
                <td>${formatNumber(r.total_usage)}</td>
                <td>${formatNumber(r.total_water_fees)}</td>
                <td>${formatNumber(r.total_fix_bill)}</td>
                <td>${formatNumber(r.total_due)}</td>
                <td>${formatNumber(r.total_paid)}</td>
                <td>${formatNumber(r.pending_dues)}</td>
                <td>${r.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderApartmentsTable() {
  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>Apartments</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartment ID</th>
              <th>Owner Name</th>
              <th>Owner Email</th>
              <th>Owner Mobile</th>
              <th>Owner Role</th>
              <th>Password</th>
              <th>Created_at</th>
            </tr>
          </thead>
          <tbody>
            ${db.apartments.map(r => `
              <tr>
                <td>${r.apartment_id}</td>
                <td>${r.owner_name}</td>
                <td>${r.owner_email}</td>
                <td>${r.owner_mobile}</td>
                <td>${r.owner_role}</td>
                <td>${r.password || ""}</td>
                <td>${r.created_at}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWaterMeterTable() {
  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>WaterMeter</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartment ID</th>
              <th>Counter Month</th>
              <th>Previous Counter</th>
              <th>New Counter</th>
              <th>Created_at</th>
            </tr>
          </thead>
          <tbody>
            ${db.waterMeter.map(r => `
              <tr>
                <td>${r.apartment_id}</td>
                <td>${r.counter_month}</td>
                <td>${r.previous_counter}</td>
                <td>${r.new_counter}</td>
                <td>${r.created_at}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMonthlyBillsTable() {
  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>MonthlyBills</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Water Bill</th>
              <th>Fix Bill</th>
              <th>Created_at</th>
            </tr>
          </thead>
          <tbody>
            ${db.monthlyBills.map(r => `
              <tr>
                <td>${r.month}</td>
                <td>${r.water_bill}</td>
                <td>${r.fix_bill}</td>
                <td>${r.created_at}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPaymentsTable() {
  const rows = getDetailedDashboardRows();

  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>Add Payments</h3>
        <button onclick="openAddPaymentModal()">Add New Record</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartment ID</th>
              <th>Owner Name</th>
              <th>Counter Month</th>
              <th>Usage</th>
              <th>Water Fees</th>
              <th>Fix Bill</th>
              <th>Total Due</th>
              <th>Total Paid</th>
              <th>Pending Dues</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.apartment_id}</td>
                <td>${r.owner_name}</td>
                <td>${r.counter_month}</td>
                <td>${formatNumber(r.usage)}</td>
                <td>${formatNumber(r.water_fees)}</td>
                <td>${formatNumber(r.fix_bill)}</td>
                <td>${formatNumber(r.total_due)}</td>
                <td>${formatNumber(r.total_paid)}</td>
                <td>${formatNumber(r.pending_dues)}</td>
                <td>${r.status}</td>
                <td>
                  <button onclick="openAddPaymentFromDashboard('${r.apartment_id}', '${r.counter_month}')">Pay</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderUserDashboard() {
  const rows = getDetailedDashboardRows().filter(
    r => r.apartment_id === currentUser.apartment_id
  );

  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title"><h3>My Dashboard</h3></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartment ID</th>
              <th>Owner Name</th>
              <th>Counter Month</th>
              <th>Usage</th>
              <th>Water Fees</th>
              <th>Fix Bill</th>
              <th>Total Due</th>
              <th>Total Paid</th>
              <th>Pending Dues</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.apartment_id}</td>
                <td>${r.owner_name}</td>
                <td>${r.counter_month}</td>
                <td>${formatNumber(r.usage)}</td>
                <td>${formatNumber(r.water_fees)}</td>
                <td>${formatNumber(r.fix_bill)}</td>
                <td>${formatNumber(r.total_due)}</td>
                <td>${formatNumber(r.total_paid)}</td>
                <td>${formatNumber(r.pending_dues)}</td>
                <td>${r.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderUserPaymentHistory() {
  const rows = db.payments.filter(p => p.apartment_id === currentUser.apartment_id);

  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title"><h3>My Payment History</h3></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Apartment ID</th>
              <th>Month</th>
              <th>Amount Paid</th>
              <th>Payment Date</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.apartment_id}</td>
                <td>${r.month}</td>
                <td>${formatNumber(r.amount_paid)}</td>
                <td>${r.payment_date}</td>
                <td>${r.notes || ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function initDashboard() {
  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }

  document.getElementById("app").classList.remove("hidden");
  document.getElementById("loggedInUserText").textContent = currentUser.owner_email;

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("savePdfBtn").addEventListener("click", savePDF);
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  renderSidebar();

  if (currentUser.owner_role === "Admin") renderAdminOverview();
  else renderUserDashboard();
}

initDashboard();