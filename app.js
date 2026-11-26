const API_URL =
  "https://script.google.com/macros/s/AKfycbzFjomVWd23La1f_F7NUMqignYCitGjFTQr_mZ9VAUopnOwPxpdRwQ6WvKIk6vtwiJKbA/exec";

const STORAGE_KEYS = {
  kategori: "hd_master_kategori_v1",
  sumberDana: "hd_master_sumber_dana_v1",
};

const TRX_CACHE_KEY = "hd_trx_cache_v1";

const DEFAULT_KATEGORI = [
  "Food and Beverage",
  "Snack",
  "Coffe n Drink",
  "Cooking Ingredients",
  "Tools Kitchen",
  "Drinking water",
  "Fruite",
  "Gifts & Donations",
  "Fun Money",
  "Transportation",
  "Gas Oline",
  "Parking",
  "Vehicle Maintenance",
  "Tax Vehicle",
  "Electricity Bill",
  "Internet Bill",
  "Gas Bill",
  "Netflix Bill",
  "Home Maintenance",
  "Medical Bills",
  "Insurance",
  "Makeup",
  "Other Outcome",
  "Salary",
  "Other Income",
];

const DEFAULT_SUMBER_DANA = [
  "Mandir Dana",
  "BSI Dana",
  "BRI Dana",
  "BCA Syariah Hasna",
  "BSI Hasna",
  "Cash Hasna",
  "Cash Dana",
];

const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

let masterKategori = loadMasterList("kategori", DEFAULT_KATEGORI);
let masterSumberDana = loadMasterList("sumberDana", DEFAULT_SUMBER_DANA);
let activeMasterTab = "kategori";

let allData = [];
let selectedPic = "ALL";
let searchQuery = "";

const fmtRp = (n) => "Rp " + (Number(n) || 0).toLocaleString("id-ID");

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadMasterList(type, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[type]);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...fallback];
  } catch (_) {
    return [...fallback];
  }
}

function saveMasterList(type, list) {
  try {
    localStorage.setItem(STORAGE_KEYS[type], JSON.stringify(list));
  } catch (_) {}
}

function loadCachedTransactions() {
  try {
    const raw = localStorage.getItem(TRX_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveCachedTransactions(list) {
  try {
    const clean = (Array.isArray(list) ? list : []).filter(
      (x) => !x._pendingSync
    );
    localStorage.setItem(TRX_CACHE_KEY, JSON.stringify(clean));
  } catch (_) {}
}

function syncSelectOptions(selectEl, list, currentVal, placeholderText) {
  const merged = [...list];
  if (currentVal && !merged.includes(currentVal)) {
    merged.unshift(currentVal);
  }
  const opts = [];
  if (placeholderText) {
    opts.push(`<option value="">${esc(placeholderText)}</option>`);
  }
  merged.forEach((item) => {
    opts.push(`<option value="${esc(item)}">${esc(item)}</option>`);
  });
  selectEl.innerHTML = opts.join("");
  if (currentVal) {
    selectEl.value = currentVal;
  }
}

function refreshFormDropdowns(keepCat = "", keepSrc = "") {
  const catSel = document.getElementById("kategoriInput");
  const srcSel = document.getElementById("sumberDanaInput");
  const curCat = keepCat || catSel.value;
  const curSrc = keepSrc || srcSel.value;
  syncSelectOptions(catSel, masterKategori, curCat, "-- Pilih Kategori --");
  syncSelectOptions(srcSel, masterSumberDana, curSrc, "");
}

function renderMasterModal() {
  const isCat = activeMasterTab === "kategori";
  const list = isCat ? masterKategori : masterSumberDana;
  const input = document.getElementById("newMasterInput");
  input.placeholder = isCat
    ? "Nama kategori baru..."
    : "Nama sumber dana baru...";

  document.querySelectorAll("[data-master]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.master === activeMasterTab);
  });

  const listEl = document.getElementById("masterList");
  if (!list.length) {
    listEl.innerHTML =
      '<div class="empty">Daftar kosong. Tambahkan item baru di atas.</div>';
    return;
  }

  listEl.innerHTML = list
    .map(
      (name, idx) => `
    <div class="option-row">
      <span class="option-name">${esc(name)}</span>
      <div class="option-btns">
        <button type="button" class="btn-edit-item" onclick="editMasterItem(${idx})">Edit</button>
        <button type="button" class="btn-del-item" onclick="deleteMasterItem(${idx})">Hapus</button>
      </div>
    </div>
  `
    )
    .join("");
}

async function syncMasterToSheet() {
  saveMasterList("kategori", masterKategori);
  saveMasterList("sumberDana", masterSumberDana);
  try {
    await apiPost({
      action: "saveMaster",
      kategori: masterKategori,
      sumberDana: masterSumberDana,
    });
  } catch (err) {
    alert(
      "Tersimpan di perangkat, tapi gagal sinkron ke Sheet: " + err.message
    );
  }
}

window.editMasterItem = async function (index) {
  const isCat = activeMasterTab === "kategori";
  const list = isCat ? masterKategori : masterSumberDana;
  const currentName = list[index];
  if (!currentName) return;

  const label = isCat ? "kategori" : "sumber dana";
  const nextRaw = prompt(`Ubah nama ${label}:`, currentName);
  if (nextRaw === null) return;

  const nextName = nextRaw.trim();
  if (!nextName) {
    alert("Nama tidak boleh kosong.");
    return;
  }

  const duplicate = list.some(
    (item, i) => i !== index && item.toLowerCase() === nextName.toLowerCase()
  );
  if (duplicate) {
    alert("Nama tersebut sudah ada di daftar.");
    return;
  }

  const updated = [...list];
  updated[index] = nextName;
  if (isCat) {
    masterKategori = updated;
  } else {
    masterSumberDana = updated;
  }

  refreshFormDropdowns();
  renderMasterModal();
  await syncMasterToSheet();
};

window.deleteMasterItem = async function (index) {
  const isCat = activeMasterTab === "kategori";
  const list = isCat ? masterKategori : masterSumberDana;
  const target = list[index];
  if (!target) return;
  if (list.length <= 1) {
    alert("Minimal harus ada 1 item tersisa.");
    return;
  }
  if (!confirm(`Hapus "${target}" dari daftar?`)) return;

  const updated = list.filter((_, i) => i !== index);
  if (isCat) {
    masterKategori = updated;
  } else {
    masterSumberDana = updated;
  }
  refreshFormDropdowns();
  renderMasterModal();
  await syncMasterToSheet();
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parsePartsTanggal(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    let day, month;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    return { year, month, day };
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    };
  }
  return null;
}

function formatTanggalIndo(raw) {
  const p = parsePartsTanggal(raw);
  if (!p || p.month < 1 || p.month > 12) return String(raw || "-");
  return `${p.day} ${BULAN_ID[p.month - 1]} ${p.year}`;
}

function toSortableKey(raw) {
  const p = parsePartsTanggal(raw);
  if (!p) return String(raw || "");
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function compareNewestFirst(a, b) {
  if (a._pendingSync && !b._pendingSync) return -1;
  if (!a._pendingSync && b._pendingSync) return 1;
  const ka = toSortableKey(a.tanggal);
  const kb = toSortableKey(b.tanggal);
  if (ka !== kb) return kb.localeCompare(ka);
  return (Number(b.rowNumber) || 0) - (Number(a.rowNumber) || 0);
}

function getRowAmounts(item) {
  const exp = Math.abs(Number(item.pengeluaran) || 0);
  const inc = Math.abs(Number(item.pemasukan) || 0);
  if (exp > 0) {
    return { isIncome: false, exp, inc: 0 };
  }
  if (inc > 0) {
    return { isIncome: true, exp: 0, inc };
  }
  return { isIncome: false, exp: 0, inc: 0 };
}

function setJenis(jenis) {
  document.getElementById("jenisInput").value = jenis;
  document.querySelectorAll(".seg-btn[data-jenis]").forEach((b) => {
    b.classList.toggle("active", b.dataset.jenis === jenis);
  });
  document.getElementById("nominalLabel").textContent =
    jenis === "income" ? "Pemasukan (Rp) *" : "Pengeluaran (Rp) *";
}

function getCurrentMonthItems() {
  const ym = todayISO().slice(0, 7);
  return allData.filter((x) => toSortableKey(x.tanggal).startsWith(ym));
}

function renderHeroAndStats() {
  const monthItems = getCurrentMonthItems();
  const totalExp = monthItems.reduce((s, x) => s + getRowAmounts(x).exp, 0);
  const totalInc = monthItems.reduce((s, x) => s + getRowAmounts(x).inc, 0);

  const needs = monthItems
    .filter(
      (x) => String(x.tipeKebutuhan || "").trim().toLowerCase() === "needs"
    )
    .reduce((s, x) => s + getRowAmounts(x).exp, 0);
  const wants = monthItems
    .filter(
      (x) => String(x.tipeKebutuhan || "").trim().toLowerCase() === "wants"
    )
    .reduce((s, x) => s + getRowAmounts(x).exp, 0);
  const nwTotal = needs + wants;
  const needsPct = nwTotal ? Math.round((needs / nwTotal) * 100) : 0;
  const wantsPct = nwTotal ? 100 - needsPct : 0;

  document.getElementById("heroExpense").textContent = fmtRp(totalExp);
  document.getElementById("heroIncome").textContent = fmtRp(totalInc);
  document.getElementById("heroNeedsWants").textContent =
    `${needsPct}% / ${wantsPct}%`;

  renderBarGroup("picStats", monthItems, "pic", totalExp);
  renderBarGroup("sourceStats", monthItems, "sumberDana", totalExp);
  renderBarGroup("catStats", monthItems, "kategori", totalExp);
}

function renderBarGroup(elId, items, key, totalExp) {
  const container = document.getElementById(elId);
  const map = {};
  items.forEach((x) => {
    const { exp } = getRowAmounts(x);
    if (exp > 0) {
      const k = x[key] || "Lainnya";
      map[k] = (map[k] || 0) + exp;
    }
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    container.innerHTML =
      '<div style="font-size:13px;color:#6b7280;">Belum ada pengeluaran bulan ini.</div>';
    return;
  }
  container.innerHTML = sorted
    .map(([label, val]) => {
      const pct = totalExp ? Math.round((val / totalExp) * 100) : 0;
      return `
      <div class="bar-item">
        <div class="bar-label"><span>${esc(label)} (${pct}%)</span><strong>${fmtRp(val)}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
    })
    .join("");
}

function renderList() {
  const listEl = document.getElementById("trxList");
  const filtered = allData
    .filter((item) => {
      const matchPic = selectedPic === "ALL" || item.pic === selectedPic;
      const q = searchQuery.toLowerCase();
      const matchQuery =
        !q ||
        String(item.uraian || "").toLowerCase().includes(q) ||
        String(item.kategori || "").toLowerCase().includes(q) ||
        String(item.sumberDana || "").toLowerCase().includes(q);
      return matchPic && matchQuery;
    })
    .sort(compareNewestFirst);

  if (!filtered.length) {
    listEl.innerHTML =
      '<div class="empty">Tidak ada transaksi yang cocok.</div>';
    return;
  }

  const groups = new Map();
  filtered.forEach((item) => {
    const key = toSortableKey(item.tanggal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const htmlParts = [];
  groups.forEach((rows) => {
    const sortedRows = [...rows].sort(compareNewestFirst);
    const rawDate = sortedRows[0].tanggal;
    const dayExp = sortedRows.reduce((s, r) => s + getRowAmounts(r).exp, 0);

    const cards = sortedRows
      .map((r) => {
        const { isIncome, exp, inc } = getRowAmounts(r);
        const amountHtml = isIncome
          ? `<div class="amt-inc">+${inc.toLocaleString("id-ID")}</div>`
          : `<div class="amt-exp">-${exp.toLocaleString("id-ID")}</div>`;

        const statusBadge = r._pendingSync
          ? `<span class="sync-pending">Waiting sync...</span>`
          : r._syncError
            ? `<span class="sync-error">Gagal sync</span>`
            : "";

        const actionsHtml = r._pendingSync
          ? `<div class="trx-actions"><span style="font-size:11px;color:#92400e;">Waiting sync...</span></div>`
          : `<div class="trx-actions">
               <button class="act-btn" onclick="openEdit(${Number(r.rowNumber)})">Edit</button>
               <button class="act-btn del" onclick="removeItem(${Number(r.rowNumber)}, '${esc(r.id)}')">Hapus</button>
             </div>`;

        return `
        <div class="trx-card">
          <div class="trx-top">
            <div>
              <div class="trx-cat">${esc(r.kategori)} (${esc(r.pic)})${statusBadge}</div>
              ${r.uraian ? `<div class="trx-uraian">${esc(r.uraian)}</div>` : ""}
              <div class="trx-meta">${esc(r.sumberDana)} • ${esc(r.tipeKebutuhan)}${r.catatan ? " • " + esc(r.catatan) : ""}</div>
            </div>
            ${amountHtml}
          </div>
          ${actionsHtml}
        </div>
      `;
      })
      .join("");

    htmlParts.push(`
      <div class="date-group">
        <div class="date-header">
          <span>${esc(formatTanggalIndo(rawDate))}</span>
          <span class="date-badge">${dayExp.toLocaleString("id-ID")}</span>
        </div>
        ${cards}
      </div>
    `);
  });

  listEl.innerHTML = htmlParts.join("");
}

async function apiPost(bodyObj) {
  const resp = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(bodyObj),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || "Permintaan gagal");
  return json.result;
}

async function loadData() {
  const btn = document.getElementById("refreshBtn");
  const listEl = document.getElementById("trxList");
  const labelEl = btn ? btn.querySelector(".sync-label") : null;

  if (btn) {
    btn.disabled = true;
    btn.classList.add("syncing");
    if (labelEl) labelEl.textContent = "Sync...";
  }

  if (listEl) {
    listEl.innerHTML =
      '<div class="empty">Memuat data dari Google Sheets...</div>';
  }

  try {
    const resp = await fetch(`${API_URL}?action=read&t=${Date.now()}`, {
      method: "GET",
      redirect: "follow",
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Gagal memuat data");

    if (json.master) {
      if (
        Array.isArray(json.master.kategori) &&
        json.master.kategori.length
      ) {
        masterKategori = json.master.kategori;
        saveMasterList("kategori", masterKategori);
      }
      if (
        Array.isArray(json.master.sumberDana) &&
        json.master.sumberDana.length
      ) {
        masterSumberDana = json.master.sumberDana;
        saveMasterList("sumberDana", masterSumberDana);
      }
      refreshFormDropdowns();
      if (
        document.getElementById("masterBackdrop").classList.contains("open")
      ) {
        renderMasterModal();
      }
    }

    const pendingItems = allData.filter((x) => x._pendingSync);
    const serverItems = Array.isArray(json.data) ? json.data : [];
    allData = [...pendingItems, ...serverItems].sort(compareNewestFirst);
    saveCachedTransactions(allData);
    renderHeroAndStats();
    renderList();
  } catch (err) {
    const detail = err && err.message ? err.message : "Gagal memuat";
    if (listEl) {
      listEl.innerHTML = `<div class="empty">Error: ${esc(detail)}<br><small>Cek akses Anyone di Apps Script atau matikan blocker/VPN di Safari, lalu tekan ↻ Sync.</small></div>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("syncing");
      if (labelEl) labelEl.textContent = "Sync";
    }
  }
}

function openAdd() {
  document.getElementById("trxForm").reset();
  refreshFormDropdowns("", masterSumberDana[0] || "");
  document.getElementById("rowNumberInput").value = "";
  document.getElementById("idInput").value = "";
  document.getElementById("tanggalInput").value = todayISO();
  document.getElementById("modalTitle").textContent = "Tambah Transaksi";
  setJenis("expense");
  document.getElementById("modalBackdrop").classList.add("open");
}

window.openEdit = function (rowNumber) {
  const item = allData.find((x) => x.rowNumber === rowNumber);
  if (!item) return;

  refreshFormDropdowns(item.kategori, item.sumberDana);
  document.getElementById("modalTitle").textContent = "Edit Transaksi";
  document.getElementById("rowNumberInput").value = item.rowNumber;
  document.getElementById("idInput").value = item.id;
  document.getElementById("tanggalInput").value = toSortableKey(item.tanggal);
  document.getElementById("kategoriInput").value = item.kategori;
  document.getElementById("uraianInput").value = item.uraian;

  const { isIncome, exp, inc } = getRowAmounts(item);
  setJenis(isIncome ? "income" : "expense");
  document.getElementById("nominalInput").value = isIncome ? inc : exp;

  document.getElementById("picInput").value = item.pic;
  document.getElementById("sumberDanaInput").value = item.sumberDana;
  document.getElementById("tipeKebutuhanInput").value = item.tipeKebutuhan;
  document.getElementById("catatanInput").value = item.catatan;

  document.getElementById("modalBackdrop").classList.add("open");
};

window.removeItem = async function (rowNumber, id) {
  if (!confirm("Hapus transaksi ini dari Google Sheets?")) return;
  try {
    await apiPost({ action: "delete", rowNumber: rowNumber, id: id });
    await loadData();
  } catch (err) {
    alert("Gagal menghapus: " + err.message);
  }
};

document.getElementById("addBtn").addEventListener("click", openAdd);
document.getElementById("cancelBtn").addEventListener("click", () => {
  document.getElementById("modalBackdrop").classList.remove("open");
});
document.getElementById("refreshBtn").addEventListener("click", loadData);

document.querySelectorAll(".seg-btn[data-jenis]").forEach((btn) => {
  btn.addEventListener("click", () => setJenis(btn.dataset.jenis));
});

document.getElementById("masterBtn").addEventListener("click", () => {
  activeMasterTab = "kategori";
  document.getElementById("newMasterInput").value = "";
  renderMasterModal();
  document.getElementById("masterBackdrop").classList.add("open");
});

function closeMasterModal() {
  document.getElementById("masterBackdrop").classList.remove("open");
}

document
  .getElementById("closeMasterBtn")
  .addEventListener("click", closeMasterModal);
document
  .getElementById("doneMasterBtn")
  .addEventListener("click", closeMasterModal);

document.querySelectorAll("[data-master]").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeMasterTab = btn.dataset.master;
    document.getElementById("newMasterInput").value = "";
    renderMasterModal();
  });
});

document
  .getElementById("addMasterItemBtn")
  .addEventListener("click", async () => {
    const input = document.getElementById("newMasterInput");
    const val = input.value.trim();
    if (!val) return;

    const isCat = activeMasterTab === "kategori";
    const list = isCat ? masterKategori : masterSumberDana;
    const exists = list.some((x) => x.toLowerCase() === val.toLowerCase());
    if (exists) {
      alert("Item tersebut sudah ada.");
      return;
    }

    const updated = [...list, val];
    if (isCat) {
      masterKategori = updated;
    } else {
      masterSumberDana = updated;
    }

    input.value = "";
    refreshFormDropdowns();
    renderMasterModal();
    await syncMasterToSheet();
  });

document.getElementById("newMasterInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("addMasterItemBtn").click();
  }
});

document
  .getElementById("resetMasterBtn")
  .addEventListener("click", async () => {
    const label = activeMasterTab === "kategori" ? "kategori" : "sumber dana";
    if (!confirm(`Kembalikan daftar ${label} ke bawaan awal?`)) return;

    if (activeMasterTab === "kategori") {
      masterKategori = [...DEFAULT_KATEGORI];
    } else {
      masterSumberDana = [...DEFAULT_SUMBER_DANA];
    }
    refreshFormDropdowns();
    renderMasterModal();
    await syncMasterToSheet();
  });

document.getElementById("picFilters").addEventListener("click", (e) => {
  if (!e.target.matches(".chip")) return;
  document
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  selectedPic = e.target.dataset.pic;
  renderList();
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderList();
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    document
      .getElementById("tabLaporan")
      .classList.toggle("hidden", target !== "tabLaporan");
    document
      .getElementById("tabBulanIni")
      .classList.toggle("hidden", target !== "tabBulanIni");
  });
});

document.getElementById("trxForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = Object.fromEntries(new FormData(e.target).entries());
  payload.action = "save";

  const isIncome = payload.jenis === "income";
  const nominalVal = Math.abs(Number(payload.nominal) || 0);
  const existingRowNumber = Number(payload.rowNumber) || 0;
  const existingId = String(payload.id || "").trim();
  const tempKey = `TEMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const optimisticItem = {
    rowNumber: existingRowNumber || Number.MAX_SAFE_INTEGER,
    id: existingId || tempKey,
    tanggal: payload.tanggal,
    kategori: payload.kategori,
    uraian: payload.uraian || "",
    pengeluaran: isIncome ? 0 : nominalVal,
    pemasukan: isIncome ? nominalVal : 0,
    pic: payload.pic || "Together",
    sumberDana: payload.sumberDana || "",
    tipeKebutuhan: payload.tipeKebutuhan || "Needs",
    catatan: payload.catatan || "",
    _pendingSync: true,
    _syncError: false,
    _tempKey: tempKey,
  };

  if (existingRowNumber > 0) {
    allData = allData.map((item) =>
      Number(item.rowNumber) === existingRowNumber ? optimisticItem : item
    );
  } else {
    allData = [optimisticItem, ...allData];
  }

  allData.sort(compareNewestFirst);
  renderHeroAndStats();
  renderList();
  document.getElementById("modalBackdrop").classList.remove("open");

  try {
    const result = await apiPost(payload);
    allData = allData.map((item) =>
      item._tempKey === tempKey
        ? {
            ...item,
            rowNumber: Number(result && result.rowNumber) || item.rowNumber,
            id: (result && result.id) || item.id,
            _pendingSync: false,
            _syncError: false,
          }
        : item
    );
    saveCachedTransactions(allData);
    renderHeroAndStats();
    renderList();
  } catch (err) {
    allData = allData.map((item) =>
      item._tempKey === tempKey
        ? { ...item, _pendingSync: false, _syncError: true }
        : item
    );
    renderList();
    alert(
      "Transaksi tampil lokal, tapi gagal sync ke Google Sheets: " + err.message
    );
  }
});

const cachedTrx = loadCachedTransactions();
if (cachedTrx.length) {
  allData = cachedTrx.sort(compareNewestFirst);
  renderHeroAndStats();
  renderList();
}

refreshFormDropdowns("", masterSumberDana[0] || "");
loadData();
