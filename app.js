// =========================================================
// FİDAN ÇANTA — KASA & GENEL UYGULAMA MANTIĞI
// =========================================================

// Eğer sunucuda common.js yüklenmemişse veya eski önbellekte kalmışsa yedek tanımlar
if (typeof DB_SCHEMAS === "undefined") {
    window.DB_SCHEMAS = {
        financeDB: {
            version: 2,
            upgrade(db) {
                if (!db.objectStoreNames.contains("records")) {
                    const s = db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
                    s.createIndex("date", "date", { unique: false });
                }
            },
            stores: ["records"]
        },
        customerDB: {
            version: 2,
            upgrade(db) {
                if (!db.objectStoreNames.contains("customers")) {
                    db.createObjectStore("customers", { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains("customerRecords")) {
                    db.createObjectStore("customerRecords", { keyPath: "id", autoIncrement: true });
                }
            },
            stores: ["customers", "customerRecords"]
        },
        supplierDB: {
            version: 2,
            upgrade(db) {
                if (!db.objectStoreNames.contains("suppliers")) {
                    db.createObjectStore("suppliers", { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains("supplierRecords")) {
                    db.createObjectStore("supplierRecords", { keyPath: "id", autoIncrement: true });
                }
            },
            stores: ["suppliers", "supplierRecords"]
        }
    };
}

if (typeof openVerifiedDB === "undefined") {
    window.openVerifiedDB = function(dbName, targetVersion) {
        return new Promise((resolve, reject) => {
            const schema = window.DB_SCHEMAS[dbName];
            const ver = targetVersion || (schema ? schema.version : 2);
            let req;
            try {
                req = indexedDB.open(dbName, ver);
            } catch (err) {
                reject(err);
                return;
            }

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (schema) schema.upgrade(db);
            };

            req.onsuccess = (e) => {
                const db = e.target.result;
                if (schema && schema.stores.some(s => !db.objectStoreNames.contains(s))) {
                    const nextVer = db.version + 1;
                    db.close();
                    window.openVerifiedDB(dbName, nextVer).then(resolve).catch(reject);
                    return;
                }
                resolve(db);
            };

            req.onerror = () => {
                if (req.error && req.error.name === "VersionError" && !targetVersion) {
                    const fallbackReq = indexedDB.open(dbName);
                    fallbackReq.onsuccess = (ev) => {
                        const db = ev.target.result;
                        if (schema && schema.stores.some(s => !db.objectStoreNames.contains(s))) {
                            const nextVer = db.version + 1;
                            db.close();
                            window.openVerifiedDB(dbName, nextVer).then(resolve).catch(reject);
                            return;
                        }
                        resolve(db);
                    };
                    fallbackReq.onerror = () => reject(fallbackReq.error);
                    return;
                }
                reject(req.error);
            };
        });
    };
}

if (typeof formatTL === "undefined") {
    window.formatTL = function(val) {
        const num = Number(val) || 0;
        return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
    };
}

if (typeof formatDateTR === "undefined") {
    window.formatDateTR = function(dateStr) {
        if (!dateStr) return "-";
        const parts = String(dateStr).split("T")[0].split("-");
        if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    };
}

if (typeof getLocalDateString === "undefined") {
    window.getLocalDateString = function(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
}

// =======================
// DATABASE
// =======================

let db;
let dbReady = false;
let currentKasaPhotoBase64 = null;
let kasaFeedbackTimer = null;
let editingKasaRecordId = null;
let editingKasaOriginalRecord = null;
let editingKasaPhotoBase64 = null;

openVerifiedDB("financeDB").then(database => {
    db = database;
    dbReady = true;
    updateDateUI();
    loadDashboardSummary();
    loadKasaCustomerSuggestions();
    refreshKasaSearch();
}).catch(err => {
    console.error("financeDB hatası:", err);
});

// =======================
// DATE CONTROL
// =======================

let selectedDate = new Date();

function formatDate(date) {
    return date.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function getISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function updateDateUI() {
    const curDateEl = document.getElementById("currentDate");
    if (curDateEl && typeof loadDayRecords === "function" && document.getElementById("cash")) {
        curDateEl.value = getISODate(selectedDate);
        loadDayRecords();
    }
}

function changeDay(step) {
    selectedDate.setDate(selectedDate.getDate() + step);
    updateDateUI();
}

function onDateChange() {
    const input = document.getElementById("currentDate").value;
    if (!input) return;

    const parts = input.split("-").map(Number);
    if (parts.length === 3 && parts.every(n => !isNaN(n))) {
        selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        selectedDate = new Date(input);
    }
    loadDayRecords();
}

// =======================
// KASA FORM YARDIMCILARI
// =======================

function parseKasaAmount(raw) {
    if (raw === null || raw === undefined) return NaN;
    let str = String(raw).trim().replace(/\s+/g, "");
    if (!str) return 0;

    if (str.includes(",") && str.includes(".")) {
        str = str.replace(/\./g, "").replace(",", ".");
    } else if (str.includes(",")) {
        str = str.replace(",", ".");
    }

    const num = Number(str);
    return Number.isFinite(num) ? num : NaN;
}

function readKasaPhotoInput(inputId, onLoad) {
    const input = document.getElementById(inputId);
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        onLoad(e.target.result);
    };
    reader.readAsDataURL(file);
}

function previewKasaPhoto() {
    readKasaPhotoInput("kasaPhotoInput", (dataUrl) => {
        currentKasaPhotoBase64 = dataUrl;
        const preview = document.getElementById("kasaPhotoPreview");
        const removeBtn = document.getElementById("removeKasaPhotoBtn");
        if (preview) {
            preview.src = currentKasaPhotoBase64;
            preview.style.display = "block";
        }
        if (removeBtn) removeBtn.style.display = "inline-flex";
    });
}

function removeKasaPhoto() {
    currentKasaPhotoBase64 = null;
    const input = document.getElementById("kasaPhotoInput");
    const preview = document.getElementById("kasaPhotoPreview");
    const removeBtn = document.getElementById("removeKasaPhotoBtn");
    if (input) input.value = "";
    if (preview) {
        preview.src = "";
        preview.style.display = "none";
    }
    if (removeBtn) removeBtn.style.display = "none";
}

function showKasaSaveFeedback(message) {
    const el = document.getElementById("kasaSaveFeedback");
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    if (kasaFeedbackTimer) clearTimeout(kasaFeedbackTimer);
    kasaFeedbackTimer = setTimeout(() => {
        el.style.display = "none";
    }, 2500);
}

function loadKasaCustomerSuggestions() {
    const datalist = document.getElementById("kasaCustomerSuggestions");
    if (!datalist) return;
    if (!dbReady || !db || !db.objectStoreNames.contains("records")) return;

    const namesMap = new Map();
    const addName = (name) => {
        const clean = String(name || "").trim();
        if (!clean) return;
        const key = clean.toLocaleLowerCase("tr-TR");
        if (!namesMap.has(key)) namesMap.set(key, clean);
    };

    try {
        const tx = db.transaction("records", "readonly");
        tx.objectStore("records").getAll().onsuccess = e => {
            (e.target.result || []).forEach(r => addName(r && r.customerName));
            datalist.innerHTML = "";
            const sortedNames = Array.from(namesMap.values()).sort((a, b) => a.localeCompare(b, "tr-TR"));
            sortedNames.forEach(name => {
                const opt = document.createElement("option");
                opt.value = name;
                datalist.appendChild(opt);
            });
        };
    } catch (err) {
        console.error("Kasa müşteri önerileri yüklenemedi:", err);
    }
}

// =======================
// SAVE RECORD
// =======================

function save() {
    if (!dbReady) return alert("Veritabanı hazır değil");

    const amountEl = document.getElementById("amount");
    const rawAmount = amountEl ? amountEl.value : "";
    const parsedAmount = parseKasaAmount(rawAmount);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return alert("Lütfen geçerli bir tutar girin.");
    }

    if (parsedAmount <= 0 && !currentKasaPhotoBase64) {
        return alert("Lütfen tutar girin veya fotoğraf ekleyin.");
    }

    const customerNameEl = document.getElementById("customerName");
    const descriptionEl = document.getElementById("description");

    const record = {
        payment: document.getElementById("payment").value, // cash | visa | transfer
        amount: parsedAmount,
        date: getISODate(selectedDate),
        customerName: customerNameEl ? customerNameEl.value.trim() : "",
        description: descriptionEl ? descriptionEl.value.trim() : "",
        photo: currentKasaPhotoBase64 || null,
        createdAt: new Date().toISOString()
    };

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").add(record);

    tx.oncomplete = () => {
        if (amountEl) amountEl.value = "";
        if (customerNameEl) customerNameEl.value = "";
        if (descriptionEl) descriptionEl.value = "";
        removeKasaPhoto();
        loadDayRecords();
        loadKasaCustomerSuggestions();
        refreshKasaSearch();
        showKasaSaveFeedback("Satış kaydedildi ✅");
    };

    tx.onerror = () => {
        alert("Kayıt sırasında bir hata oluştu ❌");
    };
}

// =======================
// LOAD DAY TOTALS & ROWS
// =======================

function escapeKasaHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatPaymentLabel(payment) {
    if (payment === "cash") return "Nakit";
    if (payment === "visa") return "Visa";
    if (payment === "transfer") return "Havale";
    return payment || "-";
}

function formatRecordTime(createdAt) {
    if (!createdAt) return "";
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function renderKasaRecordsTable(tbodyId, records, countElId, emptyMessage) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const countEl = countElId ? document.getElementById(countElId) : null;
    if (countEl) countEl.textContent = `${records.length} kayıt`;

    tbody.innerHTML = "";
    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeKasaHtml(emptyMessage)}</td></tr>`;
        return;
    }

    records.forEach(r => {
        const tr = document.createElement("tr");
        const dateText = formatDateTR(r.date);
        const timeText = formatRecordTime(r.createdAt);
        const customerText = r.customerName ? escapeKasaHtml(r.customerName) : "";
        const descText = r.description ? escapeKasaHtml(r.description) : "";
        const payClass = ["cash", "visa", "transfer"].includes(r.payment) ? `pay-${r.payment}` : "";
        const payLabel = formatPaymentLabel(r.payment);
        const hasPhoto = Boolean(r.photo);
        const hasId = r.id !== undefined && r.id !== null;

        if (hasId) {
            tr.className = "clickable-row";
            tr.onclick = () => openKasaEditModal(r.id);
        }

        tr.innerHTML = `
            <td style="font-weight: 600;">
                ${escapeKasaHtml(dateText)}
                ${timeText ? `<div style="font-size: 11px; color: var(--text-3); font-weight: 400;">${escapeKasaHtml(timeText)}</div>` : ""}
            </td>
            <td class="col-left">${customerText ? `<strong>${customerText}</strong>` : `<span class="muted">-</span>`}</td>
            <td class="col-left"><span class="pay-badge ${payClass}">${escapeKasaHtml(payLabel)}</span></td>
            <td class="col-wrap">${descText || `<span class="muted">-</span>`}</td>
            <td class="money"><strong>${formatTL(r.amount || 0)}</strong></td>
            <td class="col-center">
                <button type="button" class="view-btn" title="Düzenle / Detay">
                    ${hasPhoto ? "📷" : "✏️"}
                </button>
            </td>
        `;

        if (hasId) {
            const viewBtn = tr.querySelector(".view-btn");
            if (viewBtn) {
                viewBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openKasaEditModal(r.id);
                });
            }
        }
        tbody.appendChild(tr);
    });
}

// =======================
// SATIŞ DETAY & DÜZENLEME MODALI
// =======================

function updateEditKasaPhotoUI() {
    const wrap = document.getElementById("editKasaPhotoWrap");
    const preview = document.getElementById("editKasaPhotoPreview");
    if (!wrap || !preview) return;

    if (editingKasaPhotoBase64) {
        preview.src = editingKasaPhotoBase64;
        wrap.style.display = "block";
    } else {
        preview.src = "";
        wrap.style.display = "none";
    }
}

function previewEditKasaPhoto() {
    readKasaPhotoInput("editKasaPhotoInput", (dataUrl) => {
        editingKasaPhotoBase64 = dataUrl;
        updateEditKasaPhotoUI();
    });
}

function removeEditKasaPhoto() {
    editingKasaPhotoBase64 = null;
    const input = document.getElementById("editKasaPhotoInput");
    if (input) input.value = "";
    updateEditKasaPhotoUI();
}

function openKasaImageFull(src) {
    if (!src) return;
    const lightbox = document.getElementById("kasaLightboxModal");
    const img = document.getElementById("kasaLightboxImg");
    if (!lightbox || !img) return;
    img.src = src;
    lightbox.classList.add("open");
}

function closeKasaImageFull() {
    const lightbox = document.getElementById("kasaLightboxModal");
    const img = document.getElementById("kasaLightboxImg");
    if (lightbox) lightbox.classList.remove("open");
    if (img) img.src = "";
}

function openKasaEditModal(recordId) {
    if (!dbReady) return alert("Veritabanı hazır değil");

    const tx = db.transaction("records", "readonly");
    tx.objectStore("records").get(recordId).onsuccess = (e) => {
        const record = e.target.result;
        if (!record) return alert("Kayıt bulunamadı.");

        editingKasaRecordId = record.id;
        editingKasaOriginalRecord = record;
        editingKasaPhotoBase64 = record.photo || null;

        const dateEl = document.getElementById("editKasaDate");
        const payEl = document.getElementById("editKasaPayment");
        const amtEl = document.getElementById("editKasaAmount");
        const custEl = document.getElementById("editKasaCustomerName");
        const descEl = document.getElementById("editKasaDescription");
        const photoInput = document.getElementById("editKasaPhotoInput");

        if (dateEl) dateEl.value = record.date || getISODate(selectedDate);
        if (payEl) payEl.value = record.payment || "cash";
        if (amtEl) amtEl.value = record.amount !== undefined && record.amount !== null ? String(record.amount) : "";
        if (custEl) custEl.value = record.customerName || "";
        if (descEl) descEl.value = record.description || "";
        if (photoInput) photoInput.value = "";

        updateEditKasaPhotoUI();

        const modal = document.getElementById("kasaEditModal");
        if (modal) modal.style.display = "block";
    };
}

function closeKasaEditModal() {
    const modal = document.getElementById("kasaEditModal");
    if (modal) modal.style.display = "none";
    editingKasaRecordId = null;
    editingKasaOriginalRecord = null;
    editingKasaPhotoBase64 = null;
}

function saveKasaRecordEdit() {
    if (!dbReady || editingKasaRecordId === null) return;

    const dateVal = document.getElementById("editKasaDate")?.value;
    if (!dateVal) return alert("Lütfen tarih seçin.");

    const rawAmount = document.getElementById("editKasaAmount")?.value || "";
    const parsedAmount = parseKasaAmount(rawAmount);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return alert("Lütfen geçerli bir tutar girin.");
    }

    if (parsedAmount <= 0 && !editingKasaPhotoBase64) {
        return alert("Lütfen tutar girin veya fotoğraf ekleyin.");
    }

    const updatedRecord = {
        ...(editingKasaOriginalRecord || {}),
        id: editingKasaRecordId,
        date: dateVal,
        payment: document.getElementById("editKasaPayment")?.value || "cash",
        amount: parsedAmount,
        customerName: document.getElementById("editKasaCustomerName")?.value.trim() || "",
        description: document.getElementById("editKasaDescription")?.value.trim() || "",
        photo: editingKasaPhotoBase64 || null,
        updatedAt: new Date().toISOString()
    };

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(updatedRecord);

    tx.oncomplete = () => {
        closeKasaEditModal();
        loadDayRecords();
        loadKasaCustomerSuggestions();
        if (typeof refreshKasaSearch === "function") refreshKasaSearch();
        showKasaSaveFeedback("Kayıt güncellendi ✅");
    };

    tx.onerror = () => {
        alert("Güncelleme sırasında hata oluştu ❌");
    };
}

function deleteKasaRecord() {
    if (!dbReady || editingKasaRecordId === null) return;
    if (!confirm("Bu satış kaydı tamamen silinecek. Emin misiniz?")) return;

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").delete(editingKasaRecordId);

    tx.oncomplete = () => {
        closeKasaEditModal();
        loadDayRecords();
        loadKasaCustomerSuggestions();
        if (typeof refreshKasaSearch === "function") refreshKasaSearch();
        showKasaSaveFeedback("Kayıt silindi ✅");
    };

    tx.onerror = () => {
        alert("Silme sırasında hata oluştu ❌");
    };
}

function loadDayRecords() {
    if (!dbReady) return;

    const day = getISODate(selectedDate);

    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");
    const req = store.getAll();

    req.onsuccess = () => {
        let cash = 0;
        let visa = 0;
        let transfer = 0;
        const dayRecords = [];

        (req.result || []).forEach(r => {
            if (r && r.date === day) {
                const amt = Number(r.amount || 0);
                if (r.payment === "cash") cash += amt;
                else if (r.payment === "visa") visa += amt;
                else if (r.payment === "transfer") transfer += amt;
                dayRecords.push(r);
            }
        });

        dayRecords.sort((a, b) => (b.id || 0) - (a.id || 0));

        const cashEl = document.getElementById("cash");
        const visaEl = document.getElementById("visa");
        const transferEl = document.getElementById("transfer");
        const balanceEl = document.getElementById("balance");

        if (cashEl) animateNumber(cashEl, cash);
        if (visaEl) animateNumber(visaEl, visa);
        if (transferEl) animateNumber(transferEl, transfer);
        if (balanceEl) animateNumber(balanceEl, cash + visa + transfer);

        renderKasaRecordsTable(
            "kasaDayRecordsBody",
            dayRecords,
            "kasaDayRecordsCount",
            "Bu tarihte henüz satış kaydı bulunmuyor."
        );
    };
}

// =======================
// MÜŞTERİ ADINA GÖRE ARAMA (TÜM TARİHLER)
// =======================

function onKasaSearchInput() {
    refreshKasaSearch();
}

function clearKasaSearch() {
    const input = document.getElementById("kasaCustomerSearch");
    if (input) {
        input.value = "";
        input.focus();
    }
    refreshKasaSearch();
}

function refreshKasaSearch() {
    const input = document.getElementById("kasaCustomerSearch");
    if (!input) return;

    const rawQuery = input.value.trim();
    const clearBtn = document.getElementById("clearKasaSearchBtn");
    const hintEl = document.getElementById("kasaSearchHint");
    const resultsWrap = document.getElementById("kasaSearchResultsWrap");

    if (!rawQuery) {
        if (clearBtn) clearBtn.style.display = "none";
        if (hintEl) hintEl.style.display = "block";
        if (resultsWrap) resultsWrap.style.display = "none";
        const tbody = document.getElementById("kasaSearchResultsBody");
        if (tbody) tbody.innerHTML = "";
        return;
    }

    if (clearBtn) clearBtn.style.display = "inline-flex";
    if (hintEl) hintEl.style.display = "none";
    if (resultsWrap) resultsWrap.style.display = "block";

    if (!dbReady) return;

    const normalizedQuery = rawQuery.replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");

    const tx = db.transaction("records", "readonly");
    tx.objectStore("records").getAll().onsuccess = (e) => {
        const all = e.target.result || [];
        const matches = all.filter(r => {
            if (!r || !r.customerName) return false;
            const normName = String(r.customerName).replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
            return normName.includes(normalizedQuery);
        });

        matches.sort((a, b) => {
            const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
            if (dateCmp !== 0) return dateCmp;
            return (b.id || 0) - (a.id || 0);
        });

        let totalAmount = 0;
        let cashSum = 0;
        let visaSum = 0;
        let transferSum = 0;

        matches.forEach(r => {
            const amt = Number(r.amount || 0);
            totalAmount += amt;
            if (r.payment === "cash") cashSum += amt;
            else if (r.payment === "visa") visaSum += amt;
            else if (r.payment === "transfer") transferSum += amt;
        });

        const titleEl = document.getElementById("kasaSearchSummaryTitle");
        const totalEl = document.getElementById("kasaSearchTotal");
        const breakdownEl = document.getElementById("kasaSearchBreakdown");

        if (titleEl) titleEl.textContent = `“${rawQuery}” için satışlar`;
        if (totalEl) totalEl.textContent = formatTL(totalAmount);

        if (breakdownEl) {
            const parts = [];
            if (cashSum > 0) parts.push(`Nakit: ${formatTL(cashSum)}`);
            if (visaSum > 0) parts.push(`Visa: ${formatTL(visaSum)}`);
            if (transferSum > 0) parts.push(`Havale: ${formatTL(transferSum)}`);
            breakdownEl.textContent = parts.length > 0 ? parts.join(" · ") : "Eşleşen satış özeti";
        }

        renderKasaRecordsTable(
            "kasaSearchResultsBody",
            matches,
            "kasaSearchCount",
            "Bu müşteri adına ait satış kaydı bulunamadı."
        );
    };
}

function getDBData(dbName, version, stores) {
    return openVerifiedDB(dbName).then(database => {
        return new Promise((resolve, reject) => {
            const data = {};
            const validStores = stores.filter(s => database.objectStoreNames.contains(s));
            if (validStores.length === 0) {
                database.close();
                resolve(data);
                return;
            }
            const tx = database.transaction(validStores, "readonly");
            let completed = 0;
            validStores.forEach(storeName => {
                tx.objectStore(storeName).getAll().onsuccess = ev => {
                    data[storeName] = ev.target.result || [];
                    completed++;
                    if (completed === validStores.length) {
                        database.close();
                        resolve(data);
                    }
                };
            });
            tx.onerror = () => {
                database.close();
                reject(tx.error);
            };
        });
    });
}

function exportData() {
    Promise.all([
        getDBData("financeDB", 2, ["records"]),
        getDBData("customerDB", 2, ["customers", "customerRecords"]),
        getDBData("supplierDB", 2, ["suppliers", "supplierRecords"])
    ]).then(results => {
        const allData = {
            finance: results[0],
            customers: results[1],
            suppliers: results[2]
        };

        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "tum-veriler.json";
        a.click();
        URL.revokeObjectURL(url);
    }).catch(err => {
        alert("Dışa aktarma sırasında hata oluştu!");
        console.error(err);
    });
}

function toggleMenu() {
    const menu = document.getElementById("sideMenu");
    if (menu) {
        menu.classList.toggle("open");
        document.body.classList.toggle("menu-open", menu.classList.contains("open"));
    }
}

function loadMonthlySummary() {
    if (!dbReady) return;

    const value = document.getElementById("monthPicker").value;
    if (!value) return;

    const [year, month] = value.split("-");

    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");
    const req = store.getAll();

    req.onsuccess = () => {
        const daily = {};

        req.result.forEach(r => {
            const [y, m, d] = r.date.split("-");
            if (y === year && m === month) {
                if (!daily[d]) {
                    daily[d] = { cash: 0, visa: 0, transfer: 0 };
                }

                if (daily[d][r.payment] !== undefined) {
                    daily[d][r.payment] += r.amount;
                } else {
                    daily[d][r.payment] = r.amount;
                }
            }
        });

        renderMonthlyTable(daily, year, month);
    };
}

function renderMonthlyTable(data, year, month) {
    const tbody = document.querySelector("#summaryTable tbody");
    tbody.innerHTML = "";

    let totalCash = 0;
    let totalVisa = 0;
    let totalTransfer = 0;

    Object.keys(data).sort().forEach(day => {
        const cash = data[day].cash || 0;
        const visa = data[day].visa || 0;
        const transfer = data[day].transfer || 0;
        const total = cash + visa + transfer;

        totalCash += cash;
        totalVisa += visa;
        totalTransfer += transfer;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${day}.${month}.${year}</td>
            <td>${cash.toLocaleString("tr-TR")} ₺</td>
            <td>${visa.toLocaleString("tr-TR")} ₺</td>
            <td>${transfer.toLocaleString("tr-TR")} ₺</td>
            <td><strong>${total.toLocaleString("tr-TR")} ₺</strong></td>
        `;
        tbody.appendChild(tr);
    });

    const tcEl = document.getElementById("totalCash");
    const tvEl = document.getElementById("totalVisa");
    const ttEl = document.getElementById("totalTransfer");
    const taEl = document.getElementById("totalAll");

    if (tcEl) tcEl.textContent = totalCash.toLocaleString("tr-TR") + " ₺";
    if (tvEl) tvEl.textContent = totalVisa.toLocaleString("tr-TR") + " ₺";
    if (ttEl) ttEl.textContent = totalTransfer.toLocaleString("tr-TR") + " ₺";
    if (taEl) taEl.textContent = (totalCash + totalVisa + totalTransfer).toLocaleString("tr-TR") + " ₺";
}

function loadYearlySummary() {
    if (!dbReady) return;

    const value = document.getElementById("yearSelector").value;
    if (!value) return;

    const year = value.split("-")[0]; // YYYY

    const tx = db.transaction("records", "readonly");
    const store = tx.objectStore("records");
    const req = store.getAll();

    req.onsuccess = () => {
        const tbody = document.querySelector("#yearlyTable tbody");
        tbody.innerHTML = "";

        let totalCash = 0;
        let totalVisa = 0;
        let totalTransfer = 0;

        const months = Array.from({ length: 12 }, () => ({
            cash: 0,
            visa: 0,
            transfer: 0
        }));

        req.result.forEach(r => {
            const d = new Date(r.date);
            if (d.getFullYear() == year) {
                const m = d.getMonth();
                if (r.payment === "cash") months[m].cash += r.amount;
                else if (r.payment === "visa") months[m].visa += r.amount;
                else if (r.payment === "transfer") months[m].transfer += r.amount;
            }
        });

        months.forEach((m, i) => {
            const sum = m.cash + m.visa + m.transfer;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${new Date(year, i).toLocaleString("tr-TR", { month: "long" })}</td>
                <td>${m.cash.toLocaleString("tr-TR")} ₺</td>
                <td>${m.visa.toLocaleString("tr-TR")} ₺</td>
                <td>${m.transfer.toLocaleString("tr-TR")} ₺</td>
                <td><strong>${sum.toLocaleString("tr-TR")} ₺</strong></td>
            `;

            tbody.appendChild(row);

            totalCash += m.cash;
            totalVisa += m.visa;
            totalTransfer += m.transfer;
        });

        const yCash = document.getElementById("yearCash");
        const yVisa = document.getElementById("yearVisa");
        const yTransfer = document.getElementById("yearTransfer");
        const yAll = document.getElementById("yearAll");

        if (yCash) yCash.textContent = totalCash.toLocaleString("tr-TR") + " ₺";
        if (yVisa) yVisa.textContent = totalVisa.toLocaleString("tr-TR") + " ₺";
        if (yTransfer) yTransfer.textContent = totalTransfer.toLocaleString("tr-TR") + " ₺";
        if (yAll) yAll.textContent = (totalCash + totalVisa + totalTransfer).toLocaleString("tr-TR") + " ₺";
    };
}

// Eski Service Worker önbelleklerini temizle (sayfa geçişlerini kilitlemesini önler)
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    }).catch(() => {});
    if ("caches" in window) {
        caches.keys().then(keys => {
            keys.forEach(k => caches.delete(k));
        }).catch(() => {});
    }
}

function loadDashboardSummary() {
    const recEl = document.getElementById("homeTotalReceivable");
    const payEl = document.getElementById("homeTotalPayable");
    if (!recEl && !payEl) return;

    // Müşterilerden Toplam Alacak (openVerifiedDB ile güvenli açılış)
    openVerifiedDB("customerDB").then(cdb => {
        if (cdb.objectStoreNames.contains("customerRecords")) {
            const tx = cdb.transaction("customerRecords", "readonly");
            tx.objectStore("customerRecords").getAll().onsuccess = e => {
                let totalReceivable = 0;
                (e.target.result || []).forEach(r => {
                    totalReceivable += (Number(r.total || 0) - Number(r.paid || 0));
                });
                if (recEl) recEl.textContent = formatTL(totalReceivable);
                cdb.close();
            };
        } else {
            cdb.close();
        }
    }).catch(() => {});

    // Toptancılara Toplam Borç (openVerifiedDB ile güvenli açılış)
    openVerifiedDB("supplierDB").then(sdb => {
        if (sdb.objectStoreNames.contains("supplierRecords")) {
            const tx = sdb.transaction("supplierRecords", "readonly");
            tx.objectStore("supplierRecords").getAll().onsuccess = e => {
                let totalPayable = 0;
                (e.target.result || []).forEach(r => {
                    totalPayable += (Number(r.total || 0) - Number(r.paid || 0));
                });
                if (payEl) payEl.textContent = formatTL(totalPayable);
                sdb.close();
            };
        } else {
            sdb.close();
        }
    }).catch(() => {});
}

function clearDay() {
    if (!dbReady) return alert("Veritabanı hazır değil");

    if (!confirm("Seçili günün TÜM kayıtları silinecek. Emin misin?")) {
        return;
    }

    const day = getISODate(selectedDate);

    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const req = store.getAll();

    req.onsuccess = () => {
        req.result.forEach(r => {
            if (r.date === day) {
                store.delete(r.id);
            }
        });
    };

    tx.oncomplete = () => {
        loadDayRecords();
        loadKasaCustomerSuggestions();
        if (typeof refreshKasaSearch === "function") refreshKasaSearch();
        alert("Seçili gün temizlendi ✅");
    };
}

function removeAmount() {
    if (!dbReady) return alert("Veritabanı hazır değil");

    const amountToRemove = parseKasaAmount(document.getElementById("amount").value);
    const paymentType = document.getElementById("payment").value;
    const day = getISODate(selectedDate);

    if (!amountToRemove || Number.isNaN(amountToRemove) || amountToRemove <= 0) {
        alert("Silinecek tutarı gir");
        return;
    }

    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const req = store.getAll();

    req.onsuccess = () => {
        let remaining = amountToRemove;

        const todays = req.result
            .filter(r => r.date === day && r.payment === paymentType)
            .sort((a, b) => b.id - a.id);

        for (let r of todays) {
            if (remaining <= 0) break;
            const amt = Number(r.amount || 0);
            if (amt <= 0) continue;

            if (amt <= remaining) {
                remaining -= amt;
                store.delete(r.id);
            } else {
                store.put({
                    ...r,
                    amount: amt - remaining
                });
                remaining = 0;
            }
        }
    };

    tx.oncomplete = () => {
        document.getElementById("amount").value = "";
        loadDayRecords();
        if (typeof refreshKasaSearch === "function") refreshKasaSearch();
    };
}

const amountInput = document.getElementById("amount");

if (amountInput) {
    amountInput.addEventListener("input", () => {
        if (amountInput.value.trim() === "") return;

        amountInput.classList.remove("pulse");
        void amountInput.offsetWidth;
        amountInput.classList.add("pulse");
    });
}

function pulseAmountInput() {
    if (amountInput) {
        amountInput.classList.remove("pulse");
        void amountInput.offsetWidth;
        amountInput.classList.add("pulse");
    }
}

function animateNumber(el, target, duration = 500) {
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const value = progress < 1 ? Math.floor(progress * target) : target;
        el.textContent = value.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " ₺";

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

function clearAndInsertDB(dbName, version, stores, dataObj) {
    if (!dataObj) return Promise.resolve();
    return openVerifiedDB(dbName).then(database => {
        return new Promise((resolve, reject) => {
            const validStores = stores.filter(s => database.objectStoreNames.contains(s));
            if (validStores.length === 0) {
                database.close();
                resolve();
                return;
            }
            const tx = database.transaction(validStores, "readwrite");

            validStores.forEach(storeName => {
                const store = tx.objectStore(storeName);
                store.clear().onsuccess = () => {
                    const arr = dataObj[storeName];
                    if (Array.isArray(arr)) {
                        arr.forEach(item => store.add(item));
                    }
                };
            });
            tx.oncomplete = () => {
                database.close();
                resolve();
            };
            tx.onerror = () => {
                database.close();
                reject(tx.error);
            };
        });
    });
}

function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = evt => {
            try {
                let data = JSON.parse(evt.target.result);

                if (Array.isArray(data)) {
                    data = { finance: { records: data } };
                } else if (data.customers && !data.finance) {
                    data = { customers: data };
                } else if (data.suppliers && !data.finance) {
                    data = { suppliers: data };
                }

                // Açık bağlantıları kapat ki yazma işlemi takılmasın
                if (db) { try { db.close(); } catch(e) {} }

                Promise.all([
                    clearAndInsertDB("financeDB", 2, ["records"], data.finance),
                    clearAndInsertDB("customerDB", 2, ["customers", "customerRecords"], data.customers),
                    clearAndInsertDB("supplierDB", 2, ["suppliers", "supplierRecords"], data.suppliers)
                ]).then(() => {
                    alert("Tüm veriler başarıyla içe aktarıldı ✅\nSayfa yenileniyor...");
                    location.reload();
                }).catch(err => {
                    alert("Veritabanına yazılırken hata oluştu ❌");
                    console.error(err);
                });

            } catch (err) {
                alert("Geçersiz JSON dosyası ❌");
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
