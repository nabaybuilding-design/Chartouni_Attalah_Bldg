let db = {
  apartments: [],
  waterMeter: [],
  monthlyBills: [],
  payments: [],
  otherDebts: []
};

let currentUser = null;

function getMonthKey(dateValue) {
  return (dateValue || "").slice(0, 7);
}

function formatNumber(value) {
  return Math.round(Number(value || 0));
}

function savePDF() {
  window.print();
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

function getFilteredDetailedRows() {
  const statusFilter = document.getElementById("paymentsStatusFilter")?.value || "";
  const monthFilter = document.getElementById("paymentsMonthFilter")?.value || "";
  let rows = getDetailedDashboardRows();

  if (statusFilter) {
    rows = rows.filter(r => r.status === statusFilter);
  }

  if (monthFilter) {
    rows = rows.filter(r => getMonthKey(r.counter_month) === getMonthKey(monthFilter));
  }

  return rows;
}

function getFilteredOtherDebtsRows() {
  const statusFilter = document.getElementById("otherDebtsStatusFilter")?.value || "";
  let rows = db.otherDebts || [];

  if (statusFilter) {
    rows = rows.filter(r => r.transaction_status === statusFilter);
  }

  return rows;
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
  const groupedByApartment = {};

  db.waterMeter.forEach(wm => {
    if (!groupedByApartment[wm.apartment_id]) {
      groupedByApartment[wm.apartment_id] = [];
    }
    groupedByApartment[wm.apartment_id].push(wm);
  });

  const rows = [];

  Object.keys(groupedByApartment).forEach(apartmentId => {
    const apartment = db.apartments.find(a => a.apartment_id === apartmentId) || {};
    const apartmentRows = groupedByApartment[apartmentId]
      .slice()
      .sort((a, b) => new Date(a.counter_month) - new Date(b.counter_month));

    let carryAdvance = 0;

    apartmentRows.forEach(wm => {
      const monthKey = getMonthKey(wm.counter_month);
      const usage = Number(wm.new_counter || 0) - Number(wm.previous_counter || 0);

      const monthBill = db.monthlyBills.find(
        b => getMonthKey(b.month) === monthKey
      ) || { water_bill: 0, fix_bill: 0 };

      const waterFees = calculateWaterFees(wm);
      const fixBill = Number(monthBill.fix_bill || 0);
      const raw_due = waterFees + fixBill;

      const currentMonthPayment = db.payments
        .filter(p => p.apartment_id === apartmentId && getMonthKey(p.month) === monthKey)
        .reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

      const applied_credit = Math.min(carryAdvance, raw_due);
      const net_due = raw_due - applied_credit;

      const paid_toward_due = Math.min(currentMonthPayment, net_due);
      const total_paid = applied_credit + paid_toward_due;

      const pending_dues = Math.max(0, net_due - currentMonthPayment);

      const remaining_old_advance = Math.max(0, carryAdvance - applied_credit);
      const new_advance_from_payment = Math.max(0, currentMonthPayment - net_due);
      const advance_credit = remaining_old_advance + new_advance_from_payment;

      const roundedAdvance = Math.round(Number(advance_credit || 0));
      const roundedPending = Math.round(Number(pending_dues || 0));
      const roundedPaid = Math.round(Number(total_paid || 0));
      const roundedNetDue = Math.round(Number(net_due || 0));

      let status = "Overdue";
      if (roundedAdvance > 0) {
        status = "Advance";
      } else if (roundedPending === 0 && (roundedPaid > 0 || roundedNetDue === 0)) {
        status = "Paid";
      } else if (roundedPaid > 0 && roundedPending > 0) {
        status = "Partial";
      } else {
        status = "Overdue";
      }

      rows.push({
        id: wm.id,
        apartment_id: apartmentId,
        owner_name: apartment.owner_name || "",
        counter_month: wm.counter_month,
        usage,
        water_fees: waterFees,
        fix_bill: fixBill,
        raw_due,
        applied_credit,
        total_due: net_due,
        total_paid,
        pending_dues,
        advance_credit,
        balance: advance_credit - pending_dues,
        status
      });

      carryAdvance = advance_credit;
    });
  });

  return rows.sort((a, b) => {
    const aptCompare = String(a.apartment_id).localeCompare(String(b.apartment_id), undefined, {
      numeric: true,
      sensitivity: "base"
    });
    if (aptCompare !== 0) return aptCompare;
    return new Date(a.counter_month) - new Date(b.counter_month);
  });
}

function getCombinedDashboardRows() {
  const grouped = {};
  const detailedRows = getDetailedDashboardRows();

  detailedRows.forEach(row => {
    if (!grouped[row.apartment_id]) {
      grouped[row.apartment_id] = {
        apartment_id: row.apartment_id,
        owner_name: row.owner_name,
        total_usage: 0,
        total_water_fees: 0,
        total_fix_bill: 0,
        raw_due: 0,
        applied_credit: 0,
        total_due: 0,
        total_paid: 0,
        pending_dues: 0,
        advance_credit: 0,
        status: "Overdue",
        last_month: row.counter_month
      };
    }

    grouped[row.apartment_id].total_usage += Number(row.usage || 0);
    grouped[row.apartment_id].total_water_fees += Number(row.water_fees || 0);
    grouped[row.apartment_id].total_fix_bill += Number(row.fix_bill || 0);
    grouped[row.apartment_id].raw_due += Number(row.raw_due || 0);
    grouped[row.apartment_id].applied_credit += Number(row.applied_credit || 0);
    grouped[row.apartment_id].total_due += Number(row.total_due || 0);
    grouped[row.apartment_id].pending_dues += Number(row.pending_dues || 0);

    if (new Date(row.counter_month) >= new Date(grouped[row.apartment_id].last_month)) {
      grouped[row.apartment_id].last_month = row.counter_month;
    
      grouped[row.apartment_id].total_paid = db.payments
        .filter(p => p.apartment_id === row.apartment_id)
        .reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
    
      
      grouped[row.apartment_id].advance_credit = Number(row.advance_credit || 0);
    }
  });

  Object.values(grouped).forEach(item => {
    const advance = Math.round(Number(item.advance_credit || 0));
    const pending = Math.round(Number(item.pending_dues || 0));
    const paid = Math.round(Number(item.total_paid || 0));

    if (advance > 0) {
      item.status = "Advance";
    } else if (pending === 0 && paid > 0) {
      item.status = "Paid";
    } else if (paid > 0 && pending > 0) {
      item.status = "Partial";
    } else {
      item.status = "Overdue";
    }
  });

  const result = Object.values(grouped).map(item => {
    delete item.last_month;
    return item;
  });

  return result.sort((a, b) =>
    String(a.apartment_id).localeCompare(String(b.apartment_id), undefined, { numeric: true, sensitivity: "base" })
  );
}

async function getBuildingCaisseSummary() {
  const { data, error } = await window.supabaseClient.rpc("get_building_caisse_summary");

  if (error) {
    throw error;
  }

  const row = data && data[0] ? data[0] : {
    total_credits: 0,
    water_debts: 0,
    other_debts: 0,
    total_debts: 0,
    building_balance: 0
  };

  return {
    totalCredits: Number(row.total_credits || 0),
    automaticDebts: Number(row.water_debts || 0),
    manualDebts: Number(row.other_debts || 0),
    totalDebts: Number(row.total_debts || 0),
    buildingBalance: Number(row.building_balance || 0),
    totalAdvance: Number(row.total_advance || 0),
    netPosition: Number(row.net_position || 0)
  };
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
  const [apartmentsRes, waterRes, billsRes, paymentsRes, otherDebtsRes] = await Promise.all([
    window.supabaseClient.from("apartments").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("water_meter").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("monthly_bills").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("payments").select("*").order("id", { ascending: true }),
    window.supabaseClient.from("other_debts").select("*").order("id", { ascending: true })
  ]);

  if (apartmentsRes.error) throw apartmentsRes.error;
  if (waterRes.error) throw waterRes.error;
  if (billsRes.error) throw billsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (otherDebtsRes.error) throw otherDebtsRes.error;

  db = {
    apartments: apartmentsRes.data || [],
    waterMeter: waterRes.data || [],
    monthlyBills: billsRes.data || [],
    payments: paymentsRes.data || [],
    otherDebts: otherDebtsRes.data || []
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
      <button class="menu-btn" type="button" onclick="renderOtherDebtsTable()">Other Debts</button>
    `;
  } else {
    sidebar.innerHTML = `
      <h3>User Menu</h3>
      <button class="menu-btn" type="button" onclick="renderUserDashboard()">My Overview</button>
      <button class="menu-btn" type="button" onclick="renderUserPaymentHistory()">My Payment History</button>
    `;
  }
}

async function renderAdminOverview() {
  const rows = getCombinedDashboardRows();
  const totalDue = rows.reduce((s, r) => s + Number(r.total_due || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.total_paid || 0), 0);
  const totalRemaining = rows.reduce((s, r) => s + (Number(r.total_paid || 0) - Number(r.total_due || 0)), 0);
  const totalPending = rows.reduce((s, r) => s + Number(r.pending_dues || 0), 0);
  const totalAdvance = rows.reduce((s, r) => s + Number(r.advance_credit || 0), 0);
  const caisse = await getBuildingCaisseSummary();

  document.getElementById("mainContent").innerHTML = `
    <div class="summary-boxes">
      <div class="summary-box">Apartments<strong>${db.apartments.length}</strong></div>
      <div class="summary-box">Total Due<strong>${formatNumber(totalDue)}</strong></div>
      <div class="summary-box">Total Paid<strong>${formatNumber(totalPaid)}</strong></div>
      <div class="summary-box">Net Balance<strong>${formatNumber(totalRemaining)}</strong></div>
      <div class="summary-box">Outstanding Dues<strong>${formatNumber(totalPending)}</strong></div>
      <div class="summary-box">Advance Credits<strong>${formatNumber(totalAdvance)}</strong></div>
      <div class="summary-box">Net Position<strong>${formatNumber(caisse.buildingBalance - totalAdvance)}</strong></div>
      <div class="summary-box">Total Credits<strong>${formatNumber(caisse.totalCredits)}</strong></div>
      <div class="summary-box">Water Debts<strong>${formatNumber(caisse.automaticDebts)}</strong></div>
      <div class="summary-box">Other Debits<strong>${formatNumber(caisse.manualDebts)}</strong></div>
      <div class="summary-box">Building Caisse<strong>${formatNumber(caisse.buildingBalance)}</strong></div>
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
              <th>Original Due</th>
              <th>Credit Used</th>
              <th>Net Due</th>
              <th>Total Paid</th>
              <th>Pending Dues</th>
              <th>Advance Credit</th>
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
                <td>${formatNumber(r.raw_due || 0)}</td>
                <td>${formatNumber(r.applied_credit || 0)}</td>
                <td>${formatNumber(r.total_due)}</td>
                <td>${formatNumber(r.total_paid)}</td>
                <td>${formatNumber(r.pending_dues)}</td>
                <td>${formatNumber(r.advance_credit || 0)}</td>
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
  const rows = getFilteredDetailedRows();

  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>Add Payments</h3>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label for="paymentsStatusFilter">Status</label>
          <select id="paymentsStatusFilter" onchange="renderPaymentsTable()">
            <option value="">All</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Overdue">Overdue</option>
            <option value="Advance">Advance</option>
          </select>
          
          <label for="paymentsMonthFilter">Counter Month</label>
          <input id="paymentsMonthFilter" type="month" onchange="renderPaymentsTable()">
          
          <button class="btn-primary" type="button" onclick="openAddPaymentModal()">Add New Record</button>
        </div>
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
              <th>Original Due</th>
              <th>Credit Used</th>
              <th>Net Due</th>
              <th>Total Paid</th>
              <th>Pending Dues</th>
              <th>Advance Credit</th>
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
                <td>${formatNumber(r.raw_due || 0)}</td>
                <td>${formatNumber(r.applied_credit || 0)}</td>
                <td>${formatNumber(r.total_due)}</td>
                <td>${formatNumber(r.total_paid)}</td>
                <td>${formatNumber(r.pending_dues)}</td>
                <td>${formatNumber(r.advance_credit || 0)}</td>
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

async function renderUserDashboard() {
  const rows = getCombinedDashboardRows().filter(
    r => r.apartment_id === currentUser.apartment_id
  );

  const caisse = await getBuildingCaisseSummary();

  document.getElementById("mainContent").innerHTML = `
    <div class="summary-boxes">
      <div class="summary-box">
        Building Caisse
        <strong>${formatNumber(caisse.buildingBalance)}</strong>
      </div>

      <div class="summary-box">
        Net Position
        <strong>${formatNumber(caisse.netPosition)}</strong>
      </div>
    </div>

    <!-- Desktop Table -->
    <div class="card user-desktop-table">
      <div class="card-title">
        <h3>My Overview</h3>
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
              <th>Original Due</th>
              <th>Credit Used</th>
              <th>Net Due</th>
              <th>Total Paid</th>
              <th>Pending Dues</th>
              <th>Advance Credit</th>
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
                <td>${formatNumber(r.raw_due || 0)}</td>
                <td>${formatNumber(r.applied_credit || 0)}</td>
                <td>${formatNumber(r.total_due)}</td>
                <td>${formatNumber(r.total_paid)}</td>
                <td>${formatNumber(r.pending_dues)}</td>
                <td>${formatNumber(r.advance_credit || 0)}</td>
                <td>${r.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Mobile Cards -->
    <div class="user-mobile-cards">
      ${rows.map(r => `
        <div class="user-card">
          <h4>${r.apartment_id} - ${r.owner_name}</h4>

          <div class="status-line">
            Status: ${r.status}
          </div>

          <div class="user-card-grid">
            <div class="user-card-item">
              Total Due
              <strong>${formatNumber(r.total_due)}</strong>
            </div>

            <div class="user-card-item">
              Total Paid
              <strong>${formatNumber(r.total_paid)}</strong>
            </div>

            <div class="user-card-item">
              Pending
              <strong>${formatNumber(r.pending_dues)}</strong>
            </div>

            <div class="user-card-item">
              Advance
              <strong>${formatNumber(r.advance_credit || 0)}</strong>
            </div>
          </div>
        </div>
      `).join("")}
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

/* =========================
   Other Debts
========================= */

function renderOtherDebtsTable() {
  const rows = getFilteredOtherDebtsRows();

  document.getElementById("mainContent").innerHTML = `
    <div class="card">
      <div class="card-title">
        <h3>Other Debts</h3>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label for="otherDebtsStatusFilter">Status</label>
          <select id="otherDebtsStatusFilter" onchange="renderOtherDebtsTable()">
            <option value="">All</option>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
          <button class="btn-primary" type="button" onclick="openAddOtherDebtModal()">Add New Record</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Label</th>
              <th>Amount</th>
              <th>Transaction Status</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><input type="date" value="${escapeHtml(r.debt_date || "")}" onchange="updateOtherDebt(${r.id}, 'debt_date', this.value)"></td>
              
                <td><input type="text" value="${escapeHtml(r.label || "")}" onchange="updateOtherDebt(${r.id}, 'label', this.value)"></td>
              
                <td><input type="number" value="${escapeHtml(r.amount || 0)}" onchange="updateOtherDebt(${r.id}, 'amount', this.value)"></td>
              
                <td>
                  <select onchange="updateOtherDebt(${r.id}, 'transaction_status', this.value)">
                    <option value="debit" ${r.transaction_status === "debit" ? "selected" : ""}>Debit (-)</option>
                    <option value="credit" ${r.transaction_status === "credit" ? "selected" : ""}>Credit (+)</option>
                  </select>
                </td>
              
                <td><input type="text" value="${escapeHtml(r.notes || "")}" onchange="updateOtherDebt(${r.id}, 'notes', this.value)"></td>
              
                <td>
                  <button type="button" onclick="saveOtherDebt(${r.id})">Save</button>
                  <button type="button" class="btn-danger" onclick="deleteOtherDebt(${r.id})">Del</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function updateOtherDebt(id, field, value) {
  const row = db.otherDebts.find(r => r.id === id);
  if (row) {
    row[field] = field === "amount" ? Number(value || 0) : value;
  }
}

function openAddOtherDebtModal() {
  openModal("Add Other Debt", `
    <div class="grid-2">
      <div class="form-group">
        <label>Date</label>
        <input id="other_debt_date" type="date">
      </div>
      <div class="form-group">
        <label>Label</label>
        <input id="other_debt_label" type="text">
      </div>
      <div class="form-group">
        <label>Amount</label>
        <input id="other_debt_amount" type="number">
      </div>
      <div class="form-group" style="grid-column: 1 / -1;">
        <label>Notes</label>
        <textarea id="other_debt_notes"></textarea>
      </div>
      <div class="form-group">
        <label>Transaction Status</label>
        <select id="other_debt_transaction_status">
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
      </div>
    </div>

    <button class="btn-primary" type="button" onclick="insertOtherDebt()">Add</button>
  `);
}

async function insertOtherDebt() {
  const payload = {
    debt_date: document.getElementById("other_debt_date").value,
    label: document.getElementById("other_debt_label").value,
    amount: Number(document.getElementById("other_debt_amount").value || 0),
    transaction_status: document.getElementById("other_debt_transaction_status").value,
    notes: document.getElementById("other_debt_notes").value
  };

  const { error } = await window.supabaseClient
    .from("other_debts")
    .insert([payload]);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  closeModal();
  renderOtherDebtsTable();
}

async function saveOtherDebt(id) {
  const row = db.otherDebts.find(r => r.id === id);
  if (!row) return;

  const { error } = await window.supabaseClient
    .from("other_debts")
    .update({
      debt_date: row.debt_date,
      label: row.label,
      amount: Number(row.amount || 0),
      transaction_status: row.transaction_status || "debit",
      notes: row.notes
    })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  renderOtherDebtsTable();
}

async function deleteOtherDebt(id) {
  const { error } = await window.supabaseClient
    .from("other_debts")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await fetchAllData();
  renderOtherDebtsTable();
}

async function initDashboard() {
  try {
    if (!window.APP_CONFIG.useSupabase || !window.supabaseClient) {
      alert("Supabase is not configured.");
      window.location.href = "index.html";
      return;
    }

    const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();

    if (authError || !authData?.user) {
      alert("Auth error: " + (authError?.message || "No logged in user"));
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
      alert("Apartment query error: " + (apartmentError?.message || "No apartment row found"));
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
      await renderAdminOverview();
    } else {
      await renderUserDashboard();
    }

  } catch (err) {
    console.error(err);
    alert("Dashboard load error: " + err.message);
  }
}

initDashboard();
