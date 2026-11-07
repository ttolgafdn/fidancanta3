

// =======================
// DATABASE
// =======================

let db;
let dbReady = false;

const request = indexedDB.open("financeDB", 2);

request.onupgradeneeded = e => {
    db = e.target.result;
    const store = db.createObjectStore("records", {
        keyPath: "id",
        autoIncrement: true
    });
    store.createIndex("date", "date", { unique: false });
};

request.onsuccess = e => {
    db = e.target.result;
    dbReady = true;
    updateDateUI();
    loadDashboardSummary();
};

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

    selectedDate = new Date(input);
    loadDayRecords();
}
// =======================
// SAVE RECORD
// =======================

function save() {
    if (!dbReady) return alert("Veritabanı hazır değil");

    const record = {
        payment: document.getElementById("payment").value, // cash | visa
        amount: Number(document.getElementById("amount").value),
        date: getISODate(selectedDate)
    };

    if (!record.amount) return;

    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").add(record);

    tx.oncomplete = () => {
        loadDayRecords();
    };

    document.getElementById("amount").value = "";
}


// =======================
// LOAD DAY TOTALS
// =======================

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

        req.result.forEach(r => {
            if (r.date === day) {
                if (r.payment === "cash") cash += r.amount;
                else if (r.payment === "visa") visa += r.amount;
                else if (r.payment === "transfer") transfer += r.amount;
            }
        });

        const cashEl = document.getElementById("cash");
        const visaEl = document.getElementById("visa");
        const transferEl = document.getElementById("transfer");
        const balanceEl = document.getElementById("balance");

        if (cashEl) animateNumber(cashEl, cash);
        if (visaEl) animateNumber(visaEl, visa);
        if (transferEl) animateNumber(transferEl, transfer);
        if (balanceEl) animateNumber(balanceEl, cash + visa + transfer);
    };
}


function getDBData(dbName, version, stores) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, version);
        request.onsuccess = e => {
            const db = e.target.result;
            const data = {};
            let validStores = stores.filter(s => db.objectStoreNames.contains(s));
            if (validStores.length === 0) {
                resolve(data);
                return;
            }
            const tx = db.transaction(validStores, "readonly");
            let completed = 0;
            validStores.forEach(storeName => {
                tx.objectStore(storeName).getAll().onsuccess = ev => {
                    data[storeName] = ev.target.result || [];
                    completed++;
                    if (completed === validStores.length) resolve(data);
                };
            });
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}

function exportData() {
    Promise.all([
        getDBData("financeDB", 2, ["records"]),
        getDBData("customerDB", 1, ["customers", "customerRecords"]),
        getDBData("supplierDB", 1, ["suppliers", "supplierRecords"])
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
    document.getElementById("sideMenu").classList.toggle("open");
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

// Service Worker Kaydı (Hem service-worker.js hem service-worker-off.js için güvenli kayıt)
if ("serviceWorker" in navigator) {
    const swPath = "service-worker.js";
    navigator.serviceWorker.register(swPath)
        .then(reg => {
            console.log("Service Worker aktif:", reg.scope);
            // Varsa güncellemeyi hemen kontrol et
            reg.update();
        })
        .catch(err => console.warn("SW uyarısı:", err));
}


function loadDashboardSummary() {
    const recEl = document.getElementById("homeTotalReceivable");
    const payEl = document.getElementById("homeTotalPayable");
    if (!recEl && !payEl) return;

    // Müşterilerden Toplam Alacak
    try {
        const custReq = indexedDB.open("customerDB", 1);
        custReq.onsuccess = ev => {
            const cdb = ev.target.result;
            if (cdb.objectStoreNames.contains("customerRecords")) {
                const tx = cdb.transaction("customerRecords", "readonly");
                tx.objectStore("customerRecords").getAll().onsuccess = e => {
                    let totalReceivable = 0;
                    (e.target.result || []).forEach(r => {
                        totalReceivable += (Number(r.total || 0) - Number(r.paid || 0));
                    });
                    if (recEl) recEl.textContent = typeof formatTL === "function" ? formatTL(totalReceivable) : totalReceivable.toLocaleString("tr-TR") + " ₺";
                };
            }
        };
    } catch(e) {}

    // Toptancılara Toplam Borç
    try {
        const suppReq = indexedDB.open("supplierDB", 1);
        suppReq.onsuccess = ev => {
            const sdb = ev.target.result;
            if (sdb.objectStoreNames.contains("supplierRecords")) {
                const tx = sdb.transaction("supplierRecords", "readonly");
                tx.objectStore("supplierRecords").getAll().onsuccess = e => {
                    let totalPayable = 0;
                    (e.target.result || []).forEach(r => {
                        totalPayable += (Number(r.total || 0) - Number(r.paid || 0));
                    });
                    if (payEl) payEl.textContent = typeof formatTL === "function" ? formatTL(totalPayable) : totalPayable.toLocaleString("tr-TR") + " ₺";
                };
            }
        };
    } catch(e) {}
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
        alert("Seçili gün temizlendi ✅");
    };
}

function removeAmount() {
    if (!dbReady) return alert("Veritabanı hazır değil");

    const amountToRemove = Number(document.getElementById("amount").value);
    const paymentType = document.getElementById("payment").value;
    const day = getISODate(selectedDate);

    if (!amountToRemove || amountToRemove <= 0) {
        alert("Silinecek tutarı gir");
        return;
    }

    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const req = store.getAll();

    req.onsuccess = () => {
        let remaining = amountToRemove;

        // bugüne + ödeme tipine göre filtrele
        const todays = req.result
            .filter(r => r.date === day && r.payment === paymentType)
            .sort((a, b) => b.id - a.id); // en son eklenenlerden başla

        for (let r of todays) {
            if (remaining <= 0) break;

            if (r.amount <= remaining) {
                remaining -= r.amount;
                store.delete(r.id);
            } else {
                // kaydı güncelle
                store.put({
                    ...r,
                    amount: r.amount - remaining
                });
                remaining = 0;
            }
        }
    };

    tx.oncomplete = () => {
        document.getElementById("amount").value = "";
        loadDayRecords();
    };
}

const amountInput = document.getElementById("amount");

if (amountInput) {
    amountInput.addEventListener("input", () => {
        // sadece sayı girildiğinde pulse atsın
        if (amountInput.value.trim() === "") return;

        amountInput.classList.remove("pulse");
        void amountInput.offsetWidth; // animasyonu resetler
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
    const start = 0;
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const value = Math.floor(progress * target);
        el.textContent = value.toLocaleString("tr-TR") + " ₺";

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

function clearAndInsertDB(dbName, version, stores, dataObj) {
    return new Promise((resolve, reject) => {
        if (!dataObj) { resolve(); return; }
        const request = indexedDB.open(dbName, version);
        
        request.onupgradeneeded = e => {
            const db = e.target.result;
            if (dbName === "financeDB" && !db.objectStoreNames.contains("records")) {
                const s = db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
                s.createIndex("date", "date", { unique: false });
            }
            if (dbName === "customerDB") {
                if (!db.objectStoreNames.contains("customers")) db.createObjectStore("customers", { keyPath: "id", autoIncrement: true });
                if (!db.objectStoreNames.contains("customerRecords")) db.createObjectStore("customerRecords", { keyPath: "id", autoIncrement: true });
            }
            if (dbName === "supplierDB") {
                if (!db.objectStoreNames.contains("suppliers")) db.createObjectStore("suppliers", { keyPath: "id", autoIncrement: true });
                if (!db.objectStoreNames.contains("supplierRecords")) db.createObjectStore("supplierRecords", { keyPath: "id", autoIncrement: true });
            }
        };
        
        request.onsuccess = e => {
            const db = e.target.result;
            let validStores = stores.filter(s => db.objectStoreNames.contains(s));
            if (validStores.length === 0) { resolve(); return; }
            const tx = db.transaction(validStores, "readwrite");
            
            validStores.forEach(storeName => {
                const store = tx.objectStore(storeName);
                store.clear().onsuccess = () => {
                    const arr = dataObj[storeName];
                    if (Array.isArray(arr)) {
                        arr.forEach(item => store.add(item));
                    }
                };
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
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
                
                // Eski yedekler (sadece finance veya sadece customer/supplier) ile uyumluluk
                if (Array.isArray(data)) {
                    data = { finance: { records: data } };
                } else if (data.customers && !data.finance) {
                    data = { customers: data };
                } else if (data.suppliers && !data.finance) {
                    data = { suppliers: data };
                }

                Promise.all([
                    clearAndInsertDB("financeDB", 2, ["records"], data.finance),
                    clearAndInsertDB("customerDB", 1, ["customers", "customerRecords"], data.customers),
                    clearAndInsertDB("supplierDB", 1, ["suppliers", "supplierRecords"], data.suppliers)
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
