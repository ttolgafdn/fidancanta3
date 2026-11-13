// =========================================================
// TOPTANCILAR / BORÇLAR & GELEN MAL İRSALİYELERİ
// =========================================================

let supplierDB = null;
let supplierDBReady = false;
let currentSupplierData = null;

const params = new URLSearchParams(location.search);
const supplierId = Number(params.get("id"));

let activeActionTab = "dispatch"; // 'dispatch' (mal alındı) veya 'payment' (ödeme yapıldı)
let currentWaybillBase64 = null;
window.currentRenderedRecords = [];

// IndexedDB Başlat (Otomatik Tablo Onarımlı)
openVerifiedDB("supplierDB").then(database => {
    supplierDB = database;
    supplierDBReady = true;

    loadSuppliersToMenu();

    if (supplierId) {
        showActiveSupplierView();
        loadSupplierName();
        loadRecords();
    } else {
        showOverviewList();
    }
}).catch(err => {
    console.error("Toptancı veritabanı hatası:", err);
    alert("Toptancı veritabanı açılamadı");
});

// Tarih kutusunu bugünün yerel tarihi ile doldur
function initDefaultDate() {
    const dateInput = document.getElementById("currentDate");
    if (dateInput && !dateInput.value) {
        dateInput.value = typeof getLocalDateString === "function" ? getLocalDateString() : new Date().toISOString().split("T")[0];
    }
}

// Görünüm Değişimi: Toptancı seçili değilse liste, seçiliyse detay
function showOverviewList() {
    const noCard = document.getElementById("noSupplierCard");
    const activeArea = document.getElementById("supplierActiveArea");
    if (noCard) noCard.style.display = "block";
    if (activeArea) activeArea.style.display = "none";
    loadSuppliersOverview();
}

function showActiveSupplierView() {
    const noCard = document.getElementById("noSupplierCard");
    const activeArea = document.getElementById("supplierActiveArea");
    if (noCard) noCard.style.display = "none";
    if (activeArea) activeArea.style.display = "block";
    initDefaultDate();
    resetItems();
}

// Genel Toptancı Listesi & Bakiyeler
function loadSuppliersOverview() {
    if (!supplierDBReady) return;
    const container = document.getElementById("suppliersOverviewList");
    if (!container) return;

    const tx = supplierDB.transaction(["suppliers", "supplierRecords"], "readonly");
    const suppStore = tx.objectStore("suppliers");
    const recStore = tx.objectStore("supplierRecords");

    Promise.all([
        new Promise(res => suppStore.getAll().onsuccess = ev => res(ev.target.result || [])),
        new Promise(res => recStore.getAll().onsuccess = ev => res(ev.target.result || []))
    ]).then(([suppliers, records]) => {
        container.innerHTML = "";
        if (suppliers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    Kayıtlı toptancı bulunamadı.<br>
                    <strong>+ Yeni Toptancı Ekle</strong> butonuna tıklayarak ilk toptancınızı oluşturun.
                </div>
            `;
            return;
        }

        suppliers.forEach(s => {
            let balance = 0;
            records.filter(r => r && r.supplierId === s.id).forEach(r => {
                balance += Number(r.total || 0) - Number(r.paid || 0);
            });

            const card = document.createElement("div");
            card.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;";
            card.onclick = () => location.href = `toptanci.html?id=${s.id}`;
            card.innerHTML = `
                <div>
                    <strong style="font-size: 15px; color: var(--ink);">📦 ${s.name}</strong>
                    <div style="font-size: 11px; color: var(--text-3); margin-top: 2px;">Borç ve hareketleri gör ›</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 15px; font-weight: 700; color: ${balance > 0 ? 'var(--accent)' : 'var(--positive)'};">${formatTL(balance)}</div>
                    <div style="font-size: 10px; color: var(--text-3); text-transform: uppercase;">Borç Bakiyemiz</div>
                </div>
            `;
            container.appendChild(card);
        });
    });
}

// Sol Menüdeki Listeyi Doldurma
function loadSuppliersToMenu() {
    if (!supplierDBReady) return;
    const list = document.getElementById("supplierList");
    if (!list) return;
    list.innerHTML = "";
    const tx = supplierDB.transaction("suppliers", "readonly");
    tx.objectStore("suppliers").getAll().onsuccess = e => {
        (e.target.result || []).forEach(s => {
            if (!s || !s.name) return;
            const div = document.createElement("div");
            div.className = "menu-item" + (s.id === supplierId ? " active" : "");
            div.textContent = "📦 " + s.name;
            div.onclick = () => location.href = `toptanci.html?id=${s.id}`;
            list.appendChild(div);
        });
    };
}

// Toptancı Adı Getir
function loadSupplierName() {
    if (!supplierDBReady || !supplierId) return;
    const tx = supplierDB.transaction("suppliers", "readonly");
    tx.objectStore("suppliers").get(supplierId).onsuccess = e => {
        currentSupplierData = e.target.result;
        const title = document.getElementById("supplierTitle");
        if (title && currentSupplierData) {
            title.textContent = currentSupplierData.name;
        }
    };
}

// Sekme Değişimi: Mal Alındı / Ödeme Yapıldı
function switchActionTab(tab) {
    activeActionTab = tab;
    const isDispatch = tab === "dispatch";

    document.getElementById("tabDispatchBtn").className = isDispatch ? "btn btn-primary" : "btn btn-secondary";
    document.getElementById("tabPaymentBtn").className = isDispatch ? "btn btn-secondary" : "btn btn-primary";

    document.getElementById("dispatchSection").style.display = isDispatch ? "block" : "none";
    document.getElementById("paymentSection").style.display = isDispatch ? "none" : "block";
}

// =========================================================
// KALEM GİRİŞİ (ÜRÜN / MALZEME / ADET / BİRİM / FİYAT / TUTAR)
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
            <input type="text" class="item-name" placeholder="Malzeme / Ürün Adı (Örn: Astar Kumaş / Metal Fermuar)" style="flex: 1;" oninput="onItemInputChange('${rowId}')">
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
                    <option value="TOP">Top</option>
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

    // Eğer kalem girilmişse, toplam alınan mal tutarı kutusuna otomatik aktar
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
    if (!supplierDBReady || !supplierId) return alert("Lütfen önce bir toptancı seçin.");

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
            return alert("Lütfen en az bir malzeme kalemi girin, tutar yazın veya irsaliye resmi ekleyin.");
        }
    } else {
        // Ödeme sekmesi
        paid = parseFloat(document.getElementById("paid")?.value) || 0;
        if (paid <= 0 && !currentWaybillBase64) {
            return alert("Lütfen yapılan ödeme tutarını girin.");
        }
    }

    let waybillText = document.getElementById("waybillText")?.value.trim() || "";
    if (activeActionTab === "payment") {
        const method = document.getElementById("paymentMethod")?.value || "Nakit";
        waybillText = (waybillText ? waybillText + " " : "") + `[Ödeme: ${method}]`;
    }

    const record = {
        supplierId,
        date,
        total,
        paid,
        items,
        waybill: currentWaybillBase64,
        waybillText
    };

    const tx = supplierDB.transaction("supplierRecords", "readwrite");
    tx.objectStore("supplierRecords").add(record);

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
    if (!supplierDBReady || !supplierId) return;
    const tbody = document.getElementById("recordBody");
    const totalDebtEl = document.getElementById("totalDebt");
    if (!tbody) return;

    tbody.innerHTML = "";
    let runningDebt = 0;
    window.currentRenderedRecords = [];

    const tx = supplierDB.transaction("supplierRecords", "readonly");
    tx.objectStore("supplierRecords").getAll().onsuccess = e => {
        const records = (e.target.result || [])
            .filter(r => r && r.supplierId === supplierId)
            .sort((a, b) => {
                const dateDiff = new Date(a.date || 0) - new Date(b.date || 0);
                if (dateDiff !== 0) return dateDiff;
                return (a.id || 0) - (b.id || 0);
            });

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
                    <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: center;">
                        <button type="button" class="view-btn" title="İrsaliye Fişini Görüntüle" onclick="event.stopPropagation(); openDayDetailsModal(${r.id})">
                            ${badge || "🧾"}
                        </button>
                        <button type="button" class="view-btn" style="font-size: 16px !important;" title="Hareketi / İrsaliyeyi Düzenle" onclick="event.stopPropagation(); editRecordById(${r.id})">
                            ✏️
                        </button>
                    </div>
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

    const partyName = currentSupplierData ? currentSupplierData.name : "Toptancı";
    renderWaybillReceipt(record, { type: "Toptancı", name: partyName });
}

function shareSupplierRecordsTable() {
    const partyName = currentSupplierData ? currentSupplierData.name : "Toptancı";
    sharePartyRecordsTable("Toptancı", partyName, window.currentRenderedRecords);
}

// Fiş modalı / satır üzerinden düzenleme fonksiyonu
window.editRecordById = function(recordId) {
    if (!supplierDBReady || !supplierId) return;

    const tx = supplierDB.transaction("supplierRecords", "readonly");
    tx.objectStore("supplierRecords").get(recordId).onsuccess = (e) => {
        const record = e.target.result || window.currentRenderedRecords.find(r => r.id === recordId);
        if (!record) return alert("Düzenlenecek kayıt bulunamadı.");

        openPartyRecordEditModal(record, {
            partyType: "Toptancı",
            partyName: currentSupplierData ? currentSupplierData.name : "Toptancı",
            dispatchTabLabel: "📦 Mal Alındı (İrsaliye)",
            paymentTabLabel: "💳 Ödeme Yapıldı",
            itemsTitle: "İrsaliye Kalemleri (Gelen Mal / Malzeme)",
            itemPlaceholder: "Malzeme / Ürün Adı (Örn: Astar Kumaş / Metal Fermuar)",
            totalLabel: "Alınan Mal Tutarı (₺)",
            paidLabel: "Ödenen Tutar (₺)",
            unitOptions: ["AD", "DZ", "PK", "KG", "MT", "ÇİFT", "TOP"],
            onSave: (updatedFields) => {
                const writeTx = supplierDB.transaction("supplierRecords", "readwrite");
                const updatedRecord = {
                    ...record,
                    ...updatedFields,
                    id: record.id,
                    supplierId
                };
                writeTx.objectStore("supplierRecords").put(updatedRecord);
                writeTx.oncomplete = () => {
                    closePartyRecordEditModal();
                    loadRecords();
                    alert("Hareket ve irsaliye güncellendi ✅");
                };
                writeTx.onerror = () => {
                    alert("Güncelleme sırasında hata oluştu ❌");
                };
            },
            onDelete: (id) => window.deleteRecordById(id)
        });
    };
};

// Fiş modalı içindeki silme fonksiyonu
window.deleteRecordById = function(recordId) {
    if (!confirm("Bu hareket ve irsaliye kaydı tamamen silinecek. Emin misiniz?")) return;

    const tx = supplierDB.transaction("supplierRecords", "readwrite");
    tx.objectStore("supplierRecords").delete(recordId);

    tx.oncomplete = () => {
        closeDayDetailsModal();
        closePartyRecordEditModal();
        loadRecords();
        alert("Kayıt başarıyla silindi ✅");
    };
};

// =========================================================
// TOPTANCI YÖNETİMİ (EKLEME / SİLME)
// =========================================================

function openAddSupplierModal() {
    const modal = document.getElementById("addSupplierModal");
    if (modal) {
        modal.style.display = "block";
        const input = document.getElementById("newSupplierName");
        if (input) { input.value = ""; input.focus(); }
    }
}

function closeAddSupplierModal() {
    const modal = document.getElementById("addSupplierModal");
    if (modal) modal.style.display = "none";
}

function saveNewSupplier() {
    if (!supplierDBReady) return alert("Veritabanı hazır değil.");
    const input = document.getElementById("newSupplierName");
    const name = input ? input.value.trim() : "";

    if (!name) return alert("Lütfen toptancı adını girin.");

    const tx = supplierDB.transaction("suppliers", "readwrite");
    const req = tx.objectStore("suppliers").add({ name });

    req.onsuccess = (e) => {
        const newId = e.target.result;
        closeAddSupplierModal();
        location.href = `toptanci.html?id=${newId}`;
    };
}

function deleteCurrentSupplier() {
    if (!supplierDBReady || !supplierId) return alert("Toptancı bulunamadı");
    if (!confirm(`${currentSupplierData ? currentSupplierData.name : 'Toptancı'} ve TÜM borç kayıtları silinecek.\nEmin misiniz?`)) return;

    const tx = supplierDB.transaction(["suppliers", "supplierRecords"], "readwrite");
    tx.objectStore("suppliers").delete(supplierId);

    const recStore = tx.objectStore("supplierRecords");
    recStore.getAll().onsuccess = e => {
        (e.target.result || []).forEach(r => {
            if (r.supplierId === supplierId) recStore.delete(r.id);
        });
    };

    tx.oncomplete = () => {
        alert("Toptancı ve tüm hareketleri silindi ✅");
        location.href = "./toptanci.html";
    };
}
