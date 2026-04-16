let db = {
  apartments: [],
  waterMeter: [],
  monthlyBills: [],
  payments: []
};

let currentUser = null;

function getMonthKey(dateValue) {
  return (dateValue || "").slice(0, 7);
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function apartmentOptions(selectedValue = "") {
  return db.apartments.map(a => `
    <option value="${a.apartment_id}" ${a.apartment_id === selectedValue ? "selected" : ""}>
      ${a.apartment_id}
    </option>
  `).join("");
}

function calculateWaterFees(wm) {
  const usage = Number(wm.new_counter || 0) - Number(wm.previous_counter || 0);

  const waterBillRow = db.monthlyBills.find(
    b => getMonthKey(b.month) === getMonthKey(wm.counter_month)
  );

  const waterBill = Number((waterBillRow && waterBillRow.water_bill) || 0);

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

    const monthBill = db.monthlyBills.find(
      b => getMonthKey(b.month) === monthKey
    ) || { water_bill: 0, fix_bill: 0 };

    const waterFees = calculateWaterFees(wm);
    const fixBill = Number(monthBill.fix_bill || 0);
    const totalDue = waterFees + fixBill;

    const totalPaid = db.payments
      .filter(p => p.apartment_id === wm.apartment_id && getMonthKey(p.month) === monthKey)
      .reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

    let status = "Overdue";
    if (totalPaid >= totalDue && totalDue > 0) {
      status = "Paid";
    } else if (totalPaid > 0 && totalPaid < totalDue) {
      status = "Partial";
    }

    return {
      id: wm.id,
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
    if (item.total_paid >= item.total_due && item.total_due > 0) {
      item.status = "Paid";
    } else if (item.total_paid > 0 && item.total_paid < item.total_due) {
      item.status = "Partial";
    } else {
      item.status = "Overdue";
    }
  });

  return Object.values(grouped);
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

async function fetchAllData() {
  const [apartmentsRes, waterRes, billsRes, paymentsRes] = await Promise.all([
    window.supabaseClient.from("apartments").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("water_meter").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("monthly_bills").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("payments").select("*").order("id", { ascending: true })
  ]);

  if (apartmentsRes.error) throw apartmentsRes.error;
  if (waterRes.error) throw waterRes.error;
  if (billsRes.error) throw billsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  db = {
    apartments: apartmentsRes.data || [],
    waterMeter: waterRes.data || [],
    monthlyBills: billsRes.data || [],
    payments: paymentsRes.data || []
  };
}

async function saveRow(tableName, id) {
  const elements = document.querySelectorAll(`[data-table="${tableName}"][data-id="${id}"]`);
  const payload = {};

  elements.forEach(el => {
    let value = el.value;
    if (el.type === "number") value = Number(value || 0);
    payload[el.dataset.field] = value;
  });

  let table = "";
  if (tableName === "apartments") table = "apartments";
  if (tableName === "waterMeter") table = "water_meter";
  if (tableName === "monthlyBills") table = "monthly_bills";

  const { error } = await window.supabaseClient
    .from(table)
    .update(payload)
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();

  if (tableName === "apartments") renderApartmentsTable();
  if (tableName === "waterMeter") renderWaterMeterTable();
  if (tableName === "monthlyBills") renderMonthlyBillsTable();
}

async function deleteRow(tableName, id) {
  let table = "";
  if (tableName === "apartments") table = "apartments";
  if (tableName === "waterMeter") table = "water_meter";
  if (tableName === "monthlyBills") table = "monthly_bills";

  const { error } = await window.supabaseClient
    .from(table)
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();

  if (tableName === "apartments") renderApartmentsTable();
  if (tableName === "waterMeter") renderWaterMeterTable();
  if (tableName === "monthlyBills") renderMonthlyBillsTable();
}

function renderSidebar() {
  const sidebar = document.getElementById("sidebar");

  if (currentUser.owner_role === "Admin") {
    sidebar.innerHTML = `
      <h3>Admin Menu</h3>
      <button class="menu-btn" type="button" onclick="renderAdminOverview()">Overview</button>
      <button class="menu-btn" type="button" onclick="renderApartmentsTable()">Add Apartment</button>
      <button class="menu-btn" type="button" onclick="renderWaterMeterTable()">Add WaterMeter</button>
      <button class="menu-btn" type="button" onclick="renderMonthlyBillsTable()">Add MonthlyBills</button>
      <button class="menu-btn" type="button" onclick="renderPaymentsTable()">Add Payments</button>
    `;
  } else {
    sidebar.innerHTML = `
      <h3>User Menu</h3>
      <button class="menu-btn" type="button" onclick="renderUserDashboard()">My Overview</button>
      <button class="menu-btn" type="button" onclick="renderUserPaymentHistory()">My Payment History</button>
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
      <div class="card-title">
        <h3>Combined_Dashboard</h3>
      </div>

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

function openAddApartmentModal() {
  openModal("Add Apartment", `
    <div class="grid-2">
      <div class="form-group">
        <label>Apartment ID</label>
        <input id="new_apartment_id" type="text">
      </div>
      <div class="form-group">
        <label>Owner Name</label>
        <input id="new_owner_name" type="text">
      </div>
      <div class="form-group">
        <label>Owner Email</label>
        <input id="new_owner_email" type="email">
      </div>
      <div class="form-group">
        <label>Owner Mobile</label>
        <input id="new_owner_mobile" type="text">
      </div>
      <div class="form-group">
        <label>Owner Role</label>
        <select id="new_owner_role">
          <option value="User">User</option>
          <option value="Admin">Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label>Created_at</label>
        <input id="new_created_at" type="date">
      </div>
    </div>

    <button class="btn-primary" type="button" onclick="addApartment()">Add</button>
  `);
}

async function addApartment() {
  const payload = {
    apartment_id: document.getElementById("new_apartment_id").value,
    owner_name: document.getElementById("new_owner_name").value,
    owner_email: document.getElementById("new_owner_email").value,
    owner_mobile: document.getElementById("new_owner_mobile").value,
    owner_role: document.getElementById("new_owner_role").value,
    created_at: document.getElementById("new_created_at").value
  };

  const { error } = await window.supabaseClient.from("apartments").insert([payload]);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  closeModal();
  renderApartmentsTable();
}

function renderApartmentsTable() {
  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>Apartments</h3>
        <button class="btn-primary" type="button" onclick="openAddApartmentModal()">Add New Record</button>
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
              <th>Created_at</th>
              <th style="min-width: 160px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${db.apartments.map(r => `
              <tr>
                <td><input type="text" data-table="apartments" data-id="${r.id}" data-field="apartment_id" value="${escapeHtml(r.apartment_id)}"></td>
                <td><input type="text" data-table="apartments" data-id="${r.id}" data-field="owner_name" value="${escapeHtml(r.owner_name)}"></td>
                <td><input type="email" data-table="apartments" data-id="${r.id}" data-field="owner_email" value="${escapeHtml(r.owner_email)}"></td>
                <td><input type="text" data-table="apartments" data-id="${r.id}" data-field="owner_mobile" value="${escapeHtml(r.owner_mobile || "")}"></td>
                <td>
                  <select data-table="apartments" data-id="${r.id}" data-field="owner_role">
                    <option value="User" ${r.owner_role === "User" ? "selected" : ""}>User</option>
                    <option value="Admin" ${r.owner_role === "Admin" ? "selected" : ""}>Admin</option>
                  </select>
                </td>
                <td><input type="date" data-table="apartments" data-id="${r.id}" data-field="created_at" value="${escapeHtml(r.created_at)}"></td>
                <td>
                  <div style="display:flex; gap:6px; min-width:140px;">
                    <button type="button" onclick="saveRow('apartments', ${r.id})">Save</button>
                    <button type="button" class="btn-danger" onclick="deleteRow('apartments', ${r.id})">Del</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAddWaterMeterModal() {
  openModal("Add WaterMeter", `
    <div class="grid-2">
      <div class="form-group">
        <label>Apartment ID</label>
        <select id="wm_apartment_id">
          ${apartmentOptions()}
        </select>
      </div>
      <div class="form-group">
        <label>Counter Month</label>
        <input id="wm_counter_month" type="date">
      </div>
      <div class="form-group">
        <label>Previous Counter</label>
        <input id="wm_previous_counter" type="number">
      </div>
      <div class="form-group">
        <label>New Counter</label>
        <input id="wm_new_counter" type="number">
      </div>
      <div class="form-group">
        <label>Created_at</label>
        <input id="wm_created_at" type="date">
      </div>
    </div>

    <button class="btn-primary" type="button" onclick="addWaterMeter()">Add</button>
  `);
}

async function addWaterMeter() {
  const payload = {
    apartment_id: document.getElementById("wm_apartment_id").value,
    counter_month: document.getElementById("wm_counter_month").value,
    previous_counter: Number(document.getElementById("wm_previous_counter").value || 0),
    new_counter: Number(document.getElementById("wm_new_counter").value || 0),
    created_at: document.getElementById("wm_created_at").value
  };

  const { error } = await window.supabaseClient.from("water_meter").insert([payload]);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  closeModal();
  renderWaterMeterTable();
}

function renderWaterMeterTable() {
  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>WaterMeter</h3>
        <button class="btn-primary" type="button" onclick="openAddWaterMeterModal()">Add New Record</button>
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
              <th style="min-width: 160px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${db.waterMeter.map(r => `
              <tr>
                <td>
                  <select data-table="waterMeter" data-id="${r.id}" data-field="apartment_id">
                    ${apartmentOptions(r.apartment_id)}
                  </select>
                </td>
                <td><input type="date" data-table="waterMeter" data-id="${r.id}" data-field="counter_month" value="${escapeHtml(r.counter_month)}"></td>
                <td><input type="number" data-table="waterMeter" data-id="${r.id}" data-field="previous_counter" value="${escapeHtml(r.previous_counter)}"></td>
                <td><input type="number" data-table="waterMeter" data-id="${r.id}" data-field="new_counter" value="${escapeHtml(r.new_counter)}"></td>
                <td><input type="date" data-table="waterMeter" data-id="${r.id}" data-field="created_at" value="${escapeHtml(r.created_at)}"></td>
                <td>
                  <div style="display:flex; gap:6px; min-width:140px;">
                    <button type="button" onclick="saveRow('waterMeter', ${r.id})">Save</button>
                    <button type="button" class="btn-danger" onclick="deleteRow('waterMeter', ${r.id})">Del</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAddMonthlyBillModal() {
  openModal("Add MonthlyBills", `
    <div class="grid-2">
      <div class="form-group">
        <label>Month</label>
        <input id="mb_month" type="date">
      </div>
      <div class="form-group">
        <label>Water Bill</label>
        <input id="mb_water_bill" type="number">
      </div>
      <div class="form-group">
        <label>Fix Bill</label>
        <input id="mb_fix_bill" type="number">
      </div>
      <div class="form-group">
        <label>Created_at</label>
        <input id="mb_created_at" type="date">
      </div>
    </div>

    <button class="btn-primary" type="button" onclick="addMonthlyBill()">Add</button>
  `);
}

async function addMonthlyBill() {
  const payload = {
    month: document.getElementById("mb_month").value,
    water_bill: Number(document.getElementById("mb_water_bill").value || 0),
    fix_bill: Number(document.getElementById("mb_fix_bill").value || 0),
    created_at: document.getElementById("mb_created_at").value
  };

  const { error } = await window.supabaseClient.from("monthly_bills").insert([payload]);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  closeModal();
  renderMonthlyBillsTable();
}

function renderMonthlyBillsTable() {
  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>MonthlyBills</h3>
        <button class="btn-primary" type="button" onclick="openAddMonthlyBillModal()">Add New Record</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Water Bill</th>
              <th>Fix Bill</th>
              <th>Created_at</th>
              <th style="min-width: 160px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${db.monthlyBills.map(r => `
              <tr>
                <td><input type="date" data-table="monthlyBills" data-id="${r.id}" data-field="month" value="${escapeHtml(r.month)}"></td>
                <td><input type="number" data-table="monthlyBills" data-id="${r.id}" data-field="water_bill" value="${escapeHtml(r.water_bill)}"></td>
                <td><input type="number" data-table="monthlyBills" data-id="${r.id}" data-field="fix_bill" value="${escapeHtml(r.fix_bill)}"></td>
                <td><input type="date" data-table="monthlyBills" data-id="${r.id}" data-field="created_at" value="${escapeHtml(r.created_at)}"></td>
                <td>
                  <div style="display:flex; gap:6px; min-width:140px;">
                    <button type="button" onclick="saveRow('monthlyBills', ${r.id})">Save</button>
                    <button type="button" class="btn-danger" onclick="deleteRow('monthlyBills', ${r.id})">Del</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAddPaymentModal() {
  openModal("Add Payment", `
    <div class="grid-2">
      <div class="form-group">
        <label>Apartment ID</label>
        <select id="pay_apartment_id">
          ${apartmentOptions()}
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

    <button class="btn-primary" type="button" onclick="addPayment()">Add</button>
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

    <button class="btn-primary" type="button" onclick="addPayment()">Add</button>
  `);
}

async function addPayment() {
  const payload = {
    apartment_id: document.getElementById("pay_apartment_id").value,
    month: document.getElementById("pay_month").value,
    amount_paid: Number(document.getElementById("pay_amount_paid").value || 0),
    payment_date: document.getElementById("pay_payment_date").value,
    notes: document.getElementById("pay_notes").value
  };

  const { error } = await window.supabaseClient.from("payments").insert([payload]);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  closeModal();
  renderPaymentsTable();
}

function renderPaymentsTable() {
  const rows = getDetailedDashboardRows();

  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>Add Payments</h3>
        <button class="btn-primary" type="button" onclick="openAddPaymentModal()">Add New Record</button>
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
              <th style="min-width: 120px;">Action</th>
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
                  <button type="button" onclick="openAddPaymentFromDashboard('${r.apartment_id}', '${r.counter_month}')">Pay</button>
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
      <div class="card-title">
        <h3>My Dashboard</h3>
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
      <div class="card-title">
        <h3>My Payment History</h3>
      </div>

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

async function initDashboard() {
  if (!window.APP_CONFIG.useSupabase || !window.supabaseClient) {
    window.location.href = "index.html";
    return;
  }

  const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();

  if (authError || !authData?.user) {
    window.location.href = "index.html";
    return;
  }

  const authUser = authData.user;

  const { data: apartmentRow, error: apartmentError } = await window.supabaseClient
    .from("apartments")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .single();

  if (apartmentError || !apartmentRow) {
    alert("No apartment profile is linked to this user.");
    await window.supabaseClient.auth.signOut();
    window.location.href = "index.html";
    return;
  }

  currentUser = apartmentRow;

  await fetchAllData();

  document.getElementById("app").classList.remove("hidden");
  document.getElementById("loggedInUserText").textContent = currentUser.owner_email;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await window.supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });

  document.getElementById("savePdfBtn").addEventListener("click", savePDF);
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  renderSidebar();

  if (currentUser.owner_role === "Admin") {
    renderAdminOverview();
  } else {
    renderUserDashboard();
  }
}

initDashboard();
