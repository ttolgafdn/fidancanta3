// =========================================================
// MÜŞTERİLER / CARİ HESAP & İRSALİYE YÖNETİMİ
// =========================================================

let customerDB = null;
let customerDBReady = false;
let currentCustomerData = null;

const params = new URLSearchParams(location.search);
const customerId = Number(params.get("id"));

let activeActionTab = "dispatch"; // 'dispatch' (mal verildi) veya 'payment' (tahsilat)
let currentWaybillBase64 = null;
window.currentRenderedRecords = [];

// IndexedDB Başlat
const customerRequest = indexedDB.open("customerDB", 1);

customerRequest.onupgradeneeded = e => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains("customers")) {
        db.createObjectStore("customers", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("customerRecords")) {
        db.createObjectStore("customerRecords", { keyPath: "id", autoIncrement: true });
    }
};

customerRequest.onsuccess = e => {
    customerDB = e.target.result;
    customerDBReady = true;

    loadCustomersToMenu();

    if (customerId) {
        showActiveCustomerView();
        loadCustomerName();
        loadRecords();
    } else {
        showOverviewList();
    }
};

customerRequest.onerror = () => alert("Müşteri veritabanı açılamadı");

// Tarih kutusunu bugünün yerel tarihi ile doldur
function initDefaultDate() {
    const dateInput = document.getElementById("currentDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = typeof getLocalDateString === "function" ? getLocalDateString() : new Date().toISOString().split("T")[0];
    }
}

// Görünüm Değişimi: Müşteri seçili değilse liste, seçiliyse detay
function showOverviewList() {
    document.getElementById("noCustomerCard").style.display = "block";
    document.getElementById("customerActiveArea").style.display = "none";
    loadCustomersOverview();
}

function showActiveCustomerView() {
    document.getElementById("noCustomerCard").style.display = "none";
    document.getElementById("customerActiveArea").style.display = "block";
    initDefaultDate();
    resetItems();
}

// Genel Müşteri Listesi & Bakiyeler
function loadCustomersOverview() {
    if (!customerDBReady) return;
    const container = document.getElementById("customersOverviewList");
    if (!container) return;

    const tx = customerDB.transaction(["customers", "customerRecords"], "readonly");
    const custStore = tx.objectStore("customers");
    const recStore = tx.objectStore("customerRecords");

    Promise.all([
        new Promise(res => custStore.getAll().onsuccess = ev => res(ev.target.result || [])),
        new Promise(res => recStore.getAll().onsuccess = ev => res(ev.target.result || []))
    ]).then(([customers, records]) => {
        container.innerHTML = "";
        if (customers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    Kayıtlı müşteri bulunamadı.<br>
                    <strong>+ Yeni Müşteri Ekle</strong> butonuna tıklayarak ilk müşterinizi oluşturun.
                </div>
            `;
            return;
        }

        customers.forEach(c => {
            let balance = 0;
            records.filter(r => r && r.customerId === c.id).forEach(r => {
                balance += Number(r.total || 0) - Number(r.paid || 0);
            });

            const card = document.createElement("div");
            card.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;";
            card.onclick = () => location.href = `musteri.html?id=${c.id}`;
            card.innerHTML = `
                <div>
                    <strong style="font-size: 15px; color: var(--ink);">👤 ${c.name}</strong>
                    <div style="font-size: 11px; color: var(--text-3); margin-top: 2px;">Hesap hareketlerini gör ›</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 15px; font-weight: 700; color: ${balance > 0 ? 'var(--accent)' : 'var(--positive)'};">${formatTL(balance)}</div>
                    <div style="font-size: 10px; color: var(--text-3); text-transform: uppercase;">Alacak Bakiyesi</div>
                </div>
            `;
            container.appendChild(card);
        });
    });
}

// Sol Menüdeki Listeyi Doldurma
function loadCustomersToMenu() {
    if (!customerDBReady) return;
    const list = document.getElementById("customerList");
    if (!list) return;
    list.innerHTML = "";
    const tx = customerDB.transaction("customers", "readonly");
    tx.objectStore("customers").getAll().onsuccess = e => {
        (e.target.result || []).forEach(s => {
            if (!s || !s.name) return;
            const btn = document.createElement("a");
            btn.className = "menu-item" + (s.id === customerId ? " active" : "");
            btn.textContent = "👤 " + s.name;
            btn.href = `musteri.html?id=${s.id}`;
            list.appendChild(btn);
        });
    };
}

// Müşteri Adı Getir
function loadCustomerName() {
    if (!customerDBReady || !customerId) return;
    const tx = customerDB.transaction("customers", "readonly");
    tx.objectStore("customers").get(customerId).onsuccess = e => {
        currentCustomerData = e.target.result;
        const title = document.getElementById("customerTitle");
        if (title && currentCustomerData) {
            title.textContent = currentCustomerData.name;
        }
    };
}

// Sekme Değişimi: Mal Verildi / Tahsilat
function switchActionTab(tab) {
    activeActionTab = tab;
    const isDispatch = tab === "dispatch";

    document.getElementById("tabDispatchBtn").className = isDispatch ? "btn btn-primary" : "btn btn-secondary";
    document.getElementById("tabPaymentBtn").className = isDispatch ? "btn btn-secondary" : "btn btn-primary";

    document.getElementById("dispatchSection").style.display = isDispatch ? "block" : "none";
    document.getElementById("paymentSection").style.display = isDispatch ? "none" : "block";
}

// =========================================================
// KALEM GİRİŞİ (ÜRÜN / ADET / BİRİM / FİYAT / TUTAR)
// =========================================================

let itemRowCounter = 0;

function addItemRow(initialData = null) {
    const container = document.getElementById("itemsContainer");
    if (!container) return;

    itemRowCounter++;
    const rowId = `item_row_${itemRowCounter}`;
    const rowDiv = document.createElement("div");
    rowDiv.className = "item-row";
    rowDiv.id = rowId;

    rowDiv.innerHTML = `
        <div class="item-row-top">
            <input type="text" class="item-name" placeholder="Ürün Adı / Cinsi (Örn: Gizli Burs Vidalı)" style="flex: 1;" oninput="onItemInputChange('${rowId}')">
            <button type="button" class="item-remove-btn" title="Satırı Sil" onclick="removeItemRow('${rowId}')">✕</button>
        </div>
        <div class="item-row-grid">
            <label class="field">
                <span class="field-label">Miktar / Adet</span>
                <input type="number" step="any" inputmode="decimal" class="item-qty" placeholder="0" oninput="onItemInputChange('${rowId}')">
            </label>
            <label class="field">
                <span class="field-label">Birimi</span>
                <select class="item-unit" onchange="onItemInputChange('${rowId}')">
                    <option value="AD" selected>Adet</option>
                    <option value="DZ">Düzine</option>
                    <option value="PK">Paket</option>
                    <option value="KG">Kg</option>
                    <option value="MT">Metre</option>
                    <option value="ÇİFT">Çift</option>
                </select>
            </label>
            <label class="field">
                <span class="field-label">Birim Fiyatı (₺)</span>
                <input type="number" step="0.01" inputmode="decimal" class="item-price" placeholder="0.00" oninput="onItemInputChange('${rowId}')">
            </label>
        </div>
        <div style="display: flex; justify-content: flex-end; align-items: baseline; gap: 6px; font-size: 13px;">
            <span style="color: var(--text-3);">Satır Tutarı:</span>
            <strong class="item-total" style="color: var(--ink); font-variant-numeric: tabular-nums;">0,00 ₺</strong>
        </div>
    `;

    container.appendChild(rowDiv);

    if (initialData) {
        if (initialData.name) rowDiv.querySelector(".item-name").value = initialData.name;
        if (initialData.qty) rowDiv.querySelector(".item-qty").value = initialData.qty;
        if (initialData.unit) rowDiv.querySelector(".item-unit").value = initialData.unit;
        if (initialData.price) rowDiv.querySelector(".item-price").value = initialData.price;
        onItemInputChange(rowId);
    }
}

function removeItemRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        recalcItemsSum();
    }
}

function onItemInputChange(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseFloat(row.querySelector(".item-price").value) || 0;
    const total = qty * price;

    row.querySelector(".item-total").textContent = formatTL(total);
    recalcItemsSum();
}

function recalcItemsSum() {
    const container = document.getElementById("itemsContainer");
    if (!container) return;

    let sum = 0;
    const rows = container.querySelectorAll(".item-row");
    rows.forEach(r => {
        const qty = parseFloat(r.querySelector(".item-qty")?.value) || 0;
        const price = parseFloat(r.querySelector(".item-price")?.value) || 0;
        sum += (qty * price);
    });

    const display = document.getElementById("itemsSumDisplay");
    if (display) display.textContent = formatTL(sum);

    // Eğer kalem girilmişse, toplam mal tutarı kutusuna otomatik aktar
    const manualTotal = document.getElementById("total");
    if (manualTotal && sum > 0) {
        manualTotal.value = sum.toFixed(2);
    }
}

function onManualTotalInput() {
    // Kullanıcı elle direkt tutar yazarsa kalem toplamını sıfırlama, kullanıcı serbesttir
}

function resetItems() {
    const container = document.getElementById("itemsContainer");
    if (container) container.innerHTML = "";
    itemRowCounter = 0;
    recalcItemsSum();
    addItemRow(); // Başlangıç için tek boş satır
}

function collectItems() {
    const container = document.getElementById("itemsContainer");
    if (!container) return [];

    const items = [];
    const rows = container.querySelectorAll(".item-row");
    rows.forEach(r => {
        const name = r.querySelector(".item-name")?.value.trim() || "";
        const qty = parseFloat(r.querySelector(".item-qty")?.value) || 0;
        const unit = r.querySelector(".item-unit")?.value || "AD";
        const price = parseFloat(r.querySelector(".item-price")?.value) || 0;
        const total = qty * price;

        if (name || qty > 0 || price > 0) {
            items.push({ name, qty, unit, price, total });
        }
    });
    return items;
}

// =========================================================
// RESİM ÖNİZLEME & KALDIRMA
// =========================================================

function previewWaybill() {
    const file = document.getElementById("waybillImage").files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        currentWaybillBase64 = e.target.result;
        const preview = document.getElementById("waybillPreview");
        const removeBtn = document.getElementById("removeImgBtn");
        preview.src = currentWaybillBase64;
        preview.style.display = "block";
        if (removeBtn) removeBtn.style.display = "inline-flex";
    };
    reader.readAsDataURL(file);
}

function removeUploadedImage() {
    currentWaybillBase64 = null;
    const input = document.getElementById("waybillImage");
    const preview = document.getElementById("waybillPreview");
    const removeBtn = document.getElementById("removeImgBtn");
    if (input) input.value = "";
    if (preview) { preview.src = ""; preview.style.display = "none"; }
    if (removeBtn) removeBtn.style.display = "none";
}

// =========================================================
// KAYIT EKLEME
// =========================================================

function addRecord() {
    if (!customerDBReady || !customerId) return alert("Lütfen önce bir müşteri seçin.");

    const date = document.getElementById("currentDate")?.value;
    if (!date) return alert("Lütfen işlem tarihini seçin.");

    let total = 0;
    let paid = 0;
    let items = [];

    if (activeActionTab === "dispatch") {
        items = collectItems();
        const manualTotal = parseFloat(document.getElementById("total")?.value) || 0;
        
        let itemsSum = 0;
        items.forEach(it => itemsSum += it.total);

        // Tutar belirleme: Kalem toplamı varsa onu al, yoksa elle yazılan tutarı al
        total = itemsSum > 0 ? itemsSum : manualTotal;

        // Esneklik kontrolü: Ne kalem, ne tutar, ne de resim yoksa uyar
        if (total <= 0 && !currentWaybillBase64) {
            return alert("Lütfen en az bir ürün kalemi girin, tutar yazın veya irsaliye resmi ekleyin.");
        }
    } else {
        // Tahsilat sekmesi
        paid = parseFloat(document.getElementById("paid")?.value) || 0;
        if (paid <= 0 && !currentWaybillBase64) {
            return alert("Lütfen alınan tahsilat tutarını girin.");
        }
    }

    let waybillText = document.getElementById("waybillText")?.value.trim() || "";
    if (activeActionTab === "payment") {
        const method = document.getElementById("paymentMethod")?.value || "Nakit";
        waybillText = (waybillText ? waybillText + " " : "") + `[Ödeme: ${method}]`;
    }

    const record = {
        customerId,
        date,
        total,
        paid,
        items,
        waybill: currentWaybillBase64,
        waybillText
    };

    const tx = customerDB.transaction("customerRecords", "readwrite");
    tx.objectStore("customerRecords").add(record);

    tx.oncomplete = () => {
        // Formu temizle
        document.getElementById("total").value = "";
        document.getElementById("paid").value = "";
        document.getElementById("waybillText").value = "";
        removeUploadedImage();
        resetItems();
        loadRecords();
        alert("Hareket başarıyla kaydedildi ✅");
    };
}

// =========================================================
// HAREKETLERİ LİSTELEME & CARİ EKSTRE
// =========================================================

function loadRecords() {
    if (!customerDBReady || !customerId) return;
    const tbody = document.getElementById("recordBody");
    const totalDebtEl = document.getElementById("totalDebt");
    if (!tbody) return;

    tbody.innerHTML = "";
    let runningDebt = 0;
    window.currentRenderedRecords = [];

    const tx = customerDB.transaction("customerRecords", "readonly");
    tx.objectStore("customerRecords").getAll().onsuccess = e => {
        const records = (e.target.result || [])
            .filter(r => r && r.customerId === customerId)
            .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Henüz bir hareket veya irsaliye kaydı bulunmuyor.</td></tr>`;
            if (totalDebtEl) totalDebtEl.textContent = formatTL(0);
            return;
        }

        records.forEach(r => {
            const dateStr = formatDateTR(r.date);
            const total = Number(r.total || 0);
            const paid = Number(r.paid || 0);

            runningDebt += total;
            runningDebt -= paid;
            window.currentRenderedRecords.push(r);

            const hasItems = Array.isArray(r.items) && r.items.length > 0;
            const hasImg = Boolean(r.waybill);
            const badge = (hasItems ? "📋" : "") + (hasImg ? "📷" : "");

            const tr = document.createElement("tr");
            tr.style.cursor = "pointer";
            tr.onclick = (ev) => {
                // Eğer doğrudan buton değil de satıra tıklandıysa da fişi aç
                openDayDetailsModal(r.id);
            };

            tr.innerHTML = `
                <td style="font-weight: 600;">${dateStr}</td>
                <td style="color: ${total > 0 ? 'var(--text)' : 'var(--text-3)'}; font-weight: ${total > 0 ? '700' : 'normal'};">
                    ${total > 0 ? formatTL(total) : "-"}
                </td>
                <td style="color: ${paid > 0 ? 'var(--positive)' : 'var(--text-3)'}; font-weight: ${paid > 0 ? '700' : 'normal'};">
                    ${paid > 0 ? formatTL(paid) : "-"}
                </td>
                <td style="font-weight: 700; color: ${runningDebt > 0 ? 'var(--accent)' : 'var(--text)'};">
                    ${formatTL(runningDebt)}
                </td>
                <td style="text-align: center;">
                    <button class="view-btn" title="İrsaliye Fişini Görüntüle" onclick="event.stopPropagation(); openDayDetailsModal(${r.id})">
                        ${badge || "🧾"}
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (totalDebtEl) totalDebtEl.textContent = formatTL(runningDebt);
    };
}

// =========================================================
// İRSALİYE / FİŞ AÇMA (TEKLİF FİŞİ FORMATI)
// =========================================================

function openDayDetailsModal(recordId) {
    const record = window.currentRenderedRecords.find(r => r.id === recordId);
    if (!record) return;

    const partyName = currentCustomerData ? currentCustomerData.name : "Müşteri";
    renderWaybillReceipt(record, { type: "Müşteri", name: partyName });
}

// Fiş modalı içindeki silme fonksiyonu
window.deleteRecordById = function(recordId) {
    if (!confirm("Bu hareket ve irsaliye kaydı tamamen silinecek. Emin misiniz?")) return;

    const tx = customerDB.transaction("customerRecords", "readwrite");
    tx.objectStore("customerRecords").delete(recordId);

    tx.oncomplete = () => {
        closeDayDetailsModal();
        loadRecords();
        alert("Kayıt başarıyla silindi ✅");
    };
};

// =========================================================
// MÜŞTERİ YÖNETİMİ (EKLEME / SİLME)
// =========================================================

function openAddCustomerModal() {
    const modal = document.getElementById("addCustomerModal");
    if (modal) {
        modal.style.display = "block";
        const input = document.getElementById("newCustomerName");
        if (input) { input.value = ""; input.focus(); }
    }
}

function closeAddCustomerModal() {
    const modal = document.getElementById("addCustomerModal");
    if (modal) modal.style.display = "none";
}

function saveNewCustomer() {
    if (!customerDBReady) return alert("Veritabanı hazır değil.");
    const input = document.getElementById("newCustomerName");
    const name = input ? input.value.trim() : "";

    if (!name) return alert("Lütfen müşteri adını girin.");

    const tx = customerDB.transaction("customers", "readwrite");
    const req = tx.objectStore("customers").add({ name });

    req.onsuccess = (e) => {
        const newId = e.target.result;
        closeAddCustomerModal();
        location.href = `musteri.html?id=${newId}`;
    };
}

function deleteCurrentCustomer() {
    if (!customerDBReady || !customerId) return alert("Müşteri bulunamadı");
    if (!confirm(`${currentCustomerData ? currentCustomerData.name : 'Müşteri'} ve TÜM cari kayıtları silinecek.\nEmin misiniz?`)) return;

    const tx = customerDB.transaction(["customers", "customerRecords"], "readwrite");
    tx.objectStore("customers").delete(customerId);

    const recStore = tx.objectStore("customerRecords");
    recStore.getAll().onsuccess = e => {
        (e.target.result || []).forEach(r => {
            if (r.customerId === customerId) recStore.delete(r.id);
        });
    };

    tx.oncomplete = () => {
        alert("Müşteri ve tüm hareketleri silindi ✅");
        location.href = "musteri.html";
    };
}
