// =========================================================
// FİDAN ÇANTA — ORTAK YARDIMCI VE VERİTABANI FONKSİYONLARI
// =========================================================

// Veritabanı Şemaları ve Otomatik Onarımlı Açıcı
const DB_SCHEMAS = {
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

function openVerifiedDB(dbName, targetVersion) {
    return new Promise((resolve, reject) => {
        const schema = DB_SCHEMAS[dbName];
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
            // Eğer daha önce tabloları eksik oluşturulmuş bir veritabanı varsa sürüm yükselterek otomatik onar
            if (schema && schema.stores.some(s => !db.objectStoreNames.contains(s))) {
                const nextVer = db.version + 1;
                db.close();
                openVerifiedDB(dbName, nextVer).then(resolve).catch(reject);
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
                        openVerifiedDB(dbName, nextVer).then(resolve).catch(reject);
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
}

// Para formatı (Örn: 3.900,00 ₺)
function formatTL(val) {
    const num = Number(val) || 0;
    return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

// Tarih formatı (YYYY-MM-DD -> DD.MM.YYYY)
function formatDateTR(dateStr) {
    if (!dateStr) return "-";
    const parts = String(dateStr).split("T")[0].split("-");
    if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// Yerel tarih ISO formatı (YYYY-MM-DD) - Gece saatlerindeki UTC kaymasını önler
function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// Yan menü aç/kapa
function toggleMenu() {
    const menu = document.getElementById("sideMenu");
    if (menu) {
        menu.classList.toggle("open");
        document.body.classList.toggle("menu-open", menu.classList.contains("open"));
    }
}

// HTML metin kaçışı
function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Tam ekran fotoğraf önizleme (Fiş / İrsaliye düzenleme ortak)
function openSharedLightbox(src) {
    if (!src) return;
    let lightbox = document.getElementById("sharedLightboxModal");
    if (!lightbox) {
        lightbox = document.createElement("div");
        lightbox.id = "sharedLightboxModal";
        lightbox.className = "kasa-lightbox";
        lightbox.innerHTML = `
            <img id="sharedLightboxImg" src="" alt="Tam Boy Görsel" onclick="event.stopPropagation()" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeSharedLightbox()">Kapat</button>
        `;
        lightbox.addEventListener("click", closeSharedLightbox);
        document.body.appendChild(lightbox);
    }
    const img = document.getElementById("sharedLightboxImg");
    if (img) img.src = src;
    lightbox.classList.add("open");
}

function closeSharedLightbox() {
    const lightbox = document.getElementById("sharedLightboxModal");
    const img = document.getElementById("sharedLightboxImg");
    if (lightbox) lightbox.classList.remove("open");
    if (img) img.src = "";
}

// Global Fiş / İrsaliye Modalını Açma (Teklif Fişi Formatında)
function renderWaybillReceipt(record, partyInfo = {}) {
    const modal = document.getElementById("dayDetailsModal");
    if (!modal) return;

    window._currentWaybillReceipt = { record, partyInfo };

    const isSupplier = partyInfo.type === "Toptancı";
    const titleText = isSupplier ? "GELEN MAL / İRSALİYE FİŞİ" : "SATIŞ / SEVK İRSALİYESİ";
    const partyLabel = isSupplier ? "Toptancı:" : "Sayın / Müşteri:";

    let itemsHtml = "";
    const items = record.items || [];
    const hasItems = Array.isArray(items) && items.length > 0;

    if (hasItems) {
        items.forEach(item => {
            const qty = Number(item.qty || 0);
            const unit = escapeHtml(item.unit || "AD");
            const name = escapeHtml(item.name || "-");
            const price = Number(item.price || 0);
            const total = Number(item.total || (qty * price));
            itemsHtml += `
                <tr>
                    <td class="col-qty">${qty}</td>
                    <td class="col-unit">${unit}</td>
                    <td class="col-name">${name}</td>
                    <td class="col-price">${formatTL(price)}</td>
                    <td class="col-total">${formatTL(total)}</td>
                </tr>
            `;
        });
    }

    const grandTotal = Number(record.total || 0);
    const paidAmount = Number(record.paid || 0);
    const canEdit = typeof window.editRecordById === "function";

    const receiptHtml = `
        <div class="receipt-paper">
            <div class="receipt-header">
                <div class="receipt-title">${titleText}</div>
                <div class="receipt-meta">
                    <div class="receipt-company">
                        <strong>FİDAN ÇANTA</strong>
                        <div class="receipt-sub">İmalat & Toptan Satış</div>
                    </div>
                    <div class="receipt-date">
                        <div><strong>Tarih:</strong> ${formatDateTR(record.date)}</div>
                        <div class="receipt-no">#${record.id || ""}</div>
                    </div>
                </div>
                <div class="receipt-party">
                    <span class="party-label">${partyLabel}</span>
                    <span class="party-name">${escapeHtml(partyInfo.name || "Belirtilmedi")}</span>
                </div>
            </div>

            ${hasItems ? `
                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th class="col-qty">MİKTAR</th>
                            <th class="col-unit">BİRİM</th>
                            <th class="col-name">CİNSİ / ÜRÜN ADI</th>
                            <th class="col-price">FİYAT</th>
                            <th class="col-total">TUTAR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            ` : `
                <div class="receipt-empty-items">
                    <em>Kalem detayı girilmemiş (Toplu tutar kaydedildi)</em>
                </div>
            `}

            <div class="receipt-summary">
                ${grandTotal > 0 ? `
                    <div class="summary-line grand">
                        <span>${isSupplier ? "Alınan Mal Tutarı:" : "Mal / İrsaliye Tutarı:"}</span>
                        <span>${formatTL(grandTotal)}</span>
                    </div>
                ` : ""}
                ${paidAmount > 0 ? `
                    <div class="summary-line paid">
                        <span>${isSupplier ? "Yapılan Ödeme:" : "Tahsilat / Alınan:"}</span>
                        <span>${formatTL(paidAmount)}</span>
                    </div>
                ` : ""}
            </div>

            ${record.waybillText ? `
                <div class="receipt-note">
                    <span class="note-label">Not / Açıklama:</span>
                    <div class="note-body">${escapeHtml(record.waybillText)}</div>
                </div>
            ` : ""}

            ${record.waybill ? `
                <div class="receipt-image-section">
                    <span class="note-label">📷 Eklenen Fiş / İrsaliye Fotoğrafı:</span>
                    <div class="receipt-image-wrap">
                        <img src="${record.waybill}" alt="Fiş Görseli" onclick="openSharedLightbox(this.src)">
                    </div>
                </div>
            ` : ""}

            <div class="receipt-footer" style="flex-wrap: wrap; gap: 8px;">
                ${canEdit ? `<button type="button" class="btn btn-primary btn-sm" onclick="window.editRecordById(${Number(record.id)})">✏️ Düzenle</button>` : ""}
                <button type="button" class="btn btn-secondary btn-sm" onclick="shareCurrentWaybillViaWhatsApp()">💬 WhatsApp ile Paylaş</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Yazdır</button>
                <button type="button" class="btn btn-danger-outline btn-sm" onclick="if(window.deleteRecordById) window.deleteRecordById(${Number(record.id)})">🗑️ Bu Hareketi Sil</button>
            </div>
        </div>
    `;

    const contentBox = modal.querySelector(".modal-content");
    if (contentBox) {
        contentBox.innerHTML = `
            <span class="close" onclick="closeDayDetailsModal()">&times;</span>
            ${receiptHtml}
        `;
    }
    modal.onclick = (e) => {
        if (e.target === modal) closeDayDetailsModal();
    };
    setActivePrintableModal(modal);
    modal.style.display = "block";
}

function shareCurrentWaybillViaWhatsApp() {
    const current = window._currentWaybillReceipt;
    if (!current) return;
    shareReceiptViaWhatsApp(current.record, current.partyInfo?.name || "", current.partyInfo?.type || "");
}

function closeDayDetailsModal() {
    const modal = document.getElementById("dayDetailsModal");
    if (modal) {
        modal.style.display = "none";
        if (modal.classList.contains("print-active-modal")) {
            setActivePrintableModal(null);
        }
    }
}

// =========================================================
// ORTAK CARİ HAREKET / İRSALİYE DÜZENLEME MODALI
// (Müşteriler & Toptancılar)
// =========================================================

function closePartyRecordEditModal() {
    const modal = document.getElementById("partyEditModal");
    if (modal) {
        modal.style.display = "none";
        modal.innerHTML = "";
    }
}

function openPartyRecordEditModal(record, config) {
    if (!record || !config) return;
    closeDayDetailsModal();

    let modal = document.getElementById("partyEditModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "partyEditModal";
        modal.className = "modal";
        document.body.appendChild(modal);
    }

    const UNIT_LABELS = {
        AD: "Adet",
        DZ: "Düzine",
        PK: "Paket",
        KG: "Kg",
        MT: "Metre",
        "ÇİFT": "Çift",
        TOP: "Top"
    };
    const baseUnits = Array.isArray(config.unitOptions) && config.unitOptions.length > 0
        ? config.unitOptions
        : ["AD", "DZ", "PK", "KG", "MT", "ÇİFT"];

    const hasDispatchData = Number(record.total || 0) > 0 || (Array.isArray(record.items) && record.items.length > 0);
    const hasPaymentData = Number(record.paid || 0) > 0;
    let editTab = (!hasDispatchData && hasPaymentData) ? "payment" : "dispatch";

    let rawNote = String(record.waybillText || "");
    let parsedMethod = "Nakit";
    const methodMatch = rawNote.match(/\s*\[Ödeme:\s*([^\]]+)\]\s*$/);
    if (methodMatch) {
        parsedMethod = methodMatch[1].trim();
        rawNote = rawNote.slice(0, methodMatch.index).trim();
    }

    const paymentMethods = ["Nakit", "Havale/EFT", "Kredi Kartı", "Çek / Senet"];
    if (parsedMethod && !paymentMethods.includes(parsedMethod)) {
        paymentMethods.push(parsedMethod);
    }

    let editWaybillBase64 = record.waybill || null;
    let lastEditItemsSum = 0;

    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" id="peCloseBtn">&times;</span>
            <h3 class="modal-title">✏️ ${escapeHtml(config.partyType || "Cari")} Hareketini Düzenle</h3>
            ${config.partyName ? `<div style="font-size: 13px; color: var(--text-2); margin: -8px 0 12px; font-weight: 600;">${escapeHtml(config.partyName)}</div>` : ""}

            <div class="button-row" style="margin-bottom: 14px;">
                <button type="button" id="peTabDispatch" class="btn ${editTab === "dispatch" ? "btn-primary" : "btn-secondary"}">${escapeHtml(config.dispatchTabLabel)}</button>
                <button type="button" id="peTabPayment" class="btn ${editTab === "payment" ? "btn-primary" : "btn-secondary"}">${escapeHtml(config.paymentTabLabel)}</button>
            </div>

            <div class="form">
                <label class="field">
                    <span class="field-label">İşlem Tarihi</span>
                    <input type="date" id="peDate" value="${escapeHtml(record.date || "")}">
                </label>

                <div id="peDispatchSection" style="display: ${editTab === "dispatch" ? "block" : "none"};">
                    <div class="items-card">
                        <div class="items-header">
                            <h4>${escapeHtml(config.itemsTitle || "İrsaliye Kalemleri")}</h4>
                            <button type="button" id="peAddItemBtn" class="btn btn-secondary btn-sm">+ Satır Ekle</button>
                        </div>
                        <div id="peItemsContainer"></div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border);">
                            <span style="font-size: 13px; font-weight: 600; color: var(--text-2);">Kalemler Toplamı:</span>
                            <strong id="peItemsSumDisplay" style="font-size: 15px; color: var(--accent);">0,00 ₺</strong>
                        </div>
                    </div>

                    <div class="divider-text">VEYA DİREKT TUTAR GİRİN</div>

                    <label class="field">
                        <span class="field-label">${escapeHtml(config.totalLabel || "Toplam Mal Tutarı (₺)")}</span>
                        <input type="number" step="0.01" inputmode="decimal" id="peTotal" placeholder="0.00" value="${Number(record.total || 0) > 0 ? Number(record.total) : ""}">
                    </label>
                </div>

                <div id="pePaymentSection" style="display: ${editTab === "payment" ? "block" : "none"};">
                    <label class="field">
                        <span class="field-label">${escapeHtml(config.paidLabel || "Ödeme Tutarı (₺)")}</span>
                        <input type="number" step="0.01" inputmode="decimal" id="pePaid" placeholder="0.00" value="${Number(record.paid || 0) > 0 ? Number(record.paid) : ""}">
                    </label>
                    <label class="field" style="margin-top: 12px;">
                        <span class="field-label">Ödeme Yolu</span>
                        <select id="pePaymentMethod">
                            ${paymentMethods.map(m => `<option value="${escapeHtml(m)}"${m === parsedMethod ? " selected" : ""}>${escapeHtml(m)}</option>`).join("")}
                        </select>
                    </label>
                </div>

                <label class="field">
                    <span class="field-label">Açıklama / İrsaliye Notu</span>
                    <textarea id="peWaybillText" rows="2" placeholder="Açıklama veya not...">${escapeHtml(rawNote)}</textarea>
                </label>

                <label class="file-upload-btn">
                    📷 İrsaliye / Fiş Fotoğrafı Ekle / Değiştir
                    <input type="file" id="peWaybillImage" accept="image/*" style="display:none;">
                </label>

                <div id="pePhotoWrap" style="display: ${editWaybillBase64 ? "block" : "none"}; text-align: center;">
                    <img id="peWaybillPreview" class="image-preview" style="display: block; cursor: pointer;" src="${editWaybillBase64 || ""}" alt="İrsaliye Önizleme" title="Büyütmek için dokunun">
                    <div style="display: flex; gap: 8px; justify-content: center; margin-top: 6px;">
                        <button type="button" id="peZoomImgBtn" class="btn btn-secondary btn-sm">🔍 Büyüt</button>
                        <button type="button" id="peRemoveImgBtn" class="btn btn-danger-outline btn-sm">🗑️ Resmi Kaldır</button>
                    </div>
                </div>

                <div class="button-row" style="margin-top: 6px;">
                    <button type="button" id="peDeleteBtn" class="btn btn-danger-outline">🗑️ Kaydı Sil</button>
                    <button type="button" id="peSaveBtn" class="btn btn-primary">💾 Güncelle</button>
                </div>
            </div>
        </div>
    `;

    const tabDispatchBtn = modal.querySelector("#peTabDispatch");
    const tabPaymentBtn = modal.querySelector("#peTabPayment");
    const dispatchSec = modal.querySelector("#peDispatchSection");
    const paymentSec = modal.querySelector("#pePaymentSection");
    const itemsContainer = modal.querySelector("#peItemsContainer");
    const itemsSumDisplay = modal.querySelector("#peItemsSumDisplay");
    const peTotal = modal.querySelector("#peTotal");
    const pePaid = modal.querySelector("#pePaid");
    const pePaymentMethod = modal.querySelector("#pePaymentMethod");
    const peDate = modal.querySelector("#peDate");
    const peWaybillText = modal.querySelector("#peWaybillText");
    const peImageInput = modal.querySelector("#peWaybillImage");
    const pePhotoWrap = modal.querySelector("#pePhotoWrap");
    const pePreview = modal.querySelector("#peWaybillPreview");

    function switchEditTab(tab) {
        editTab = tab;
        const isDispatch = tab === "dispatch";
        tabDispatchBtn.className = isDispatch ? "btn btn-primary" : "btn btn-secondary";
        tabPaymentBtn.className = isDispatch ? "btn btn-secondary" : "btn btn-primary";
        dispatchSec.style.display = isDispatch ? "block" : "none";
        paymentSec.style.display = isDispatch ? "none" : "block";
    }

    function recalcEditItemsSum(isUserChange = false) {
        let sum = 0;
        itemsContainer.querySelectorAll(".item-row").forEach(row => {
            const qty = parseFloat(row.querySelector(".item-qty")?.value) || 0;
            const price = parseFloat(row.querySelector(".item-price")?.value) || 0;
            sum += qty * price;
        });

        itemsSumDisplay.textContent = formatTL(sum);
        if (sum > 0) {
            peTotal.value = sum.toFixed(2);
        } else if (isUserChange && lastEditItemsSum > 0) {
            peTotal.value = "";
        }
        lastEditItemsSum = sum;
    }

    function addEditItemRow(initialData = null, isUserAction = false) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "item-row";

        const initialUnit = initialData && initialData.unit ? String(initialData.unit) : "AD";
        const unitList = baseUnits.includes(initialUnit) ? baseUnits : [...baseUnits, initialUnit];

        rowDiv.innerHTML = `
            <div class="item-row-top">
                <input type="text" class="item-name" placeholder="${escapeHtml(config.itemPlaceholder || "Ürün Adı / Cinsi")}" style="flex: 1;">
                <button type="button" class="item-remove-btn" title="Satırı Sil">✕</button>
            </div>
            <div class="item-row-grid">
                <label class="field">
                    <span class="field-label">Miktar / Adet</span>
                    <input type="number" step="any" inputmode="decimal" class="item-qty" placeholder="0">
                </label>
                <label class="field">
                    <span class="field-label">Birimi</span>
                    <select class="item-unit">
                        ${unitList.map(u => `<option value="${escapeHtml(u)}"${u === initialUnit ? " selected" : ""}>${escapeHtml(UNIT_LABELS[u] || u)}</option>`).join("")}
                    </select>
                </label>
                <label class="field">
                    <span class="field-label">Birim Fiyatı (₺)</span>
                    <input type="number" step="0.01" inputmode="decimal" class="item-price" placeholder="0.00">
                </label>
            </div>
            <div style="display: flex; justify-content: flex-end; align-items: baseline; gap: 6px; font-size: 13px;">
                <span style="color: var(--text-3);">Satır Tutarı:</span>
                <strong class="item-total" style="color: var(--ink); font-variant-numeric: tabular-nums;">0,00 ₺</strong>
            </div>
        `;

        const nameEl = rowDiv.querySelector(".item-name");
        const qtyEl = rowDiv.querySelector(".item-qty");
        const unitEl = rowDiv.querySelector(".item-unit");
        const priceEl = rowDiv.querySelector(".item-price");
        const totalEl = rowDiv.querySelector(".item-total");
        const removeBtn = rowDiv.querySelector(".item-remove-btn");

        const updateRow = (triggerUser = true) => {
            const qty = parseFloat(qtyEl.value) || 0;
            const price = parseFloat(priceEl.value) || 0;
            totalEl.textContent = formatTL(qty * price);
            recalcEditItemsSum(triggerUser);
        };

        if (initialData) {
            if (initialData.name) nameEl.value = initialData.name;
            if (initialData.qty) qtyEl.value = initialData.qty;
            if (initialData.price) priceEl.value = initialData.price;
        }

        nameEl.addEventListener("input", () => recalcEditItemsSum(true));
        qtyEl.addEventListener("input", () => updateRow(true));
        unitEl.addEventListener("change", () => updateRow(true));
        priceEl.addEventListener("input", () => updateRow(true));
        removeBtn.addEventListener("click", () => {
            rowDiv.remove();
            recalcEditItemsSum(true);
        });

        itemsContainer.appendChild(rowDiv);
        updateRow(isUserAction);
    }

    const existingItems = Array.isArray(record.items) ? record.items : [];
    if (existingItems.length > 0) {
        existingItems.forEach(item => addEditItemRow(item, false));
    } else {
        addEditItemRow(null, false);
    }

    modal.querySelector("#peCloseBtn").addEventListener("click", closePartyRecordEditModal);
    modal.onclick = (e) => {
        if (e.target === modal) closePartyRecordEditModal();
    };
    tabDispatchBtn.addEventListener("click", () => switchEditTab("dispatch"));
    tabPaymentBtn.addEventListener("click", () => switchEditTab("payment"));
    modal.querySelector("#peAddItemBtn").addEventListener("click", () => addEditItemRow(null, true));

    peImageInput.addEventListener("change", () => {
        const file = peImageInput.files && peImageInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            editWaybillBase64 = ev.target.result;
            pePreview.src = editWaybillBase64;
            pePhotoWrap.style.display = "block";
        };
        reader.readAsDataURL(file);
    });

    pePreview.addEventListener("click", () => openSharedLightbox(editWaybillBase64));
    modal.querySelector("#peZoomImgBtn").addEventListener("click", () => openSharedLightbox(editWaybillBase64));
    modal.querySelector("#peRemoveImgBtn").addEventListener("click", () => {
        editWaybillBase64 = null;
        peImageInput.value = "";
        pePreview.src = "";
        pePhotoWrap.style.display = "none";
    });

    modal.querySelector("#peDeleteBtn").addEventListener("click", () => {
        if (typeof config.onDelete === "function") {
            config.onDelete(record.id);
        }
    });

    modal.querySelector("#peSaveBtn").addEventListener("click", () => {
        const dateVal = peDate.value;
        if (!dateVal) return alert("Lütfen işlem tarihini seçin.");

        let total = 0;
        let paid = 0;
        let items = [];
        let waybillText = peWaybillText.value.trim();

        if (editTab === "dispatch") {
            itemsContainer.querySelectorAll(".item-row").forEach(r => {
                const name = r.querySelector(".item-name")?.value.trim() || "";
                const qty = parseFloat(r.querySelector(".item-qty")?.value) || 0;
                const unit = r.querySelector(".item-unit")?.value || "AD";
                const price = parseFloat(r.querySelector(".item-price")?.value) || 0;
                const rowTotal = qty * price;
                if (name || qty > 0 || price > 0) {
                    items.push({ name, qty, unit, price, total: rowTotal });
                }
            });

            const itemsSum = items.reduce((acc, it) => acc + Number(it.total || 0), 0);
            const manualTotal = parseFloat(peTotal.value) || 0;
            total = itemsSum > 0 ? itemsSum : manualTotal;

            if (total <= 0 && !editWaybillBase64) {
                return alert("Lütfen en az bir ürün kalemi girin, tutar yazın veya irsaliye resmi ekleyin.");
            }
        } else {
            paid = parseFloat(pePaid.value) || 0;
            if (paid <= 0 && !editWaybillBase64) {
                return alert("Lütfen ödeme / tahsilat tutarını girin.");
            }
            const method = pePaymentMethod.value || "Nakit";
            waybillText = (waybillText ? waybillText + " " : "") + `[Ödeme: ${method}]`;
        }

        if (typeof config.onSave === "function") {
            config.onSave({
                date: dateVal,
                total,
                paid,
                items,
                waybill: editWaybillBase64,
                waybillText
            });
        }
    });

    modal.style.display = "block";
}

// Yazdırılacak aktif modalı işaretleme (temiz sayfa yazdırma / PDF çıktısı için)
function setActivePrintableModal(modalEl) {
    document.querySelectorAll(".print-active-modal").forEach(el => {
        el.classList.remove("print-active-modal");
    });
    if (modalEl) {
        modalEl.classList.add("print-active-modal");
        document.body.classList.add("print-modal-active");
    } else {
        document.body.classList.remove("print-modal-active");
    }
}

// Panoya metin kopyalama (modern API + eski tarayıcı yedeği)
function copyTextToClipboard(text, feedbackBtn = null) {
    const showCopied = () => {
        if (!feedbackBtn) return;
        const original = feedbackBtn.dataset.origText || feedbackBtn.textContent;
        feedbackBtn.dataset.origText = original;
        feedbackBtn.textContent = "✅ Kopyalandı";
        setTimeout(() => {
            if (feedbackBtn) feedbackBtn.textContent = original;
        }, 1800);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard.writeText(text).then(() => {
            showCopied();
            return true;
        }).catch(() => fallbackCopyText(text, showCopied));
    }
    return Promise.resolve(fallbackCopyText(text, showCopied));
}

function fallbackCopyText(text, onSuccess) {
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok && onSuccess) onSuccess();
        return ok;
    } catch (_) {
        return false;
    }
}

// WhatsApp paylaşım açıcı (uzun tablolarda URL sınırını aşarsa panoya kopyalar)
function openWhatsAppWithText(text) {
    const encoded = encodeURIComponent(text || "");
    if (encoded.length <= 6000) {
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, "_blank");
        return;
    }

    copyTextToClipboard(text).then(copied => {
        if (copied) {
            alert("Tablo çok uzun olduğu için metnin tamamı panoya kopyalandı. Açılan WhatsApp penceresine yapıştırarak gönderebilirsiniz.");
            window.open("https://api.whatsapp.com/send", "_blank");
        } else {
            const truncated = text.slice(0, 2200) + "\n...\n(Liste uzun olduğu için kısaltıldı)";
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(truncated)}`, "_blank");
        }
    });
}

// WhatsApp Paylaşım Fonksiyonu (Tek Fiş / İrsaliye)
function shareReceiptViaWhatsApp(record, partyName, partyType) {
    const isSupplier = partyType === "Toptancı";
    const headerTitle = isSupplier ? "*FİDAN ÇANTA — GELEN MAL İRSALİYESİ*" : "*FİDAN ÇANTA — İRSALİYE / HESAP FİŞİ*";
    const partyLabel = isSupplier ? "Toptancı:" : "Sayın:";

    let text = `${headerTitle}\n`;
    text += `📅 *Tarih:* ${formatDateTR(record.date)}\n`;
    text += `👤 *${partyLabel}* ${partyName || 'Belirtilmedi'}\n`;
    text += `--------------------------------\n`;

    const items = record.items || [];
    if (Array.isArray(items) && items.length > 0) {
        items.forEach((it, idx) => {
            const qty = Number(it.qty || 0);
            const unit = it.unit || "AD";
            const name = it.name || "Ürün";
            const price = Number(it.price || 0);
            const tot = Number(it.total || (qty * price));
            text += `${idx + 1}. *${name}*\n   ${qty} ${unit} x ${formatTL(price)} = *${formatTL(tot)}*\n`;
        });
        text += `--------------------------------\n`;
    }

    if (record.total > 0) {
        text += `💰 *Genel Toplam:* ${formatTL(record.total)}\n`;
    }
    if (record.paid > 0) {
        text += `💵 *Yapılan/Alınan Ödeme:* ${formatTL(record.paid)}\n`;
    }

    text += `\n*FİDAN ÇANTA İmalat & Toptan*\nİyi günler.`;

    openWhatsAppWithText(text);
}

// Satır Satır Tablo / Ekstre Paylaşım ve Yazdırma Modalı
function closeTableShareModal() {
    const modal = document.getElementById("sharedTableModal");
    if (modal) {
        modal.style.display = "none";
        if (modal.classList.contains("print-active-modal")) {
            setActivePrintableModal(null);
        }
    }
    window._currentTableShareState = null;
}

function openTableShareModal(options) {
    if (!options) return;
    window._currentTableShareState = options;

    let modal = document.getElementById("sharedTableModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "sharedTableModal";
        modal.className = "modal modal-top";
        modal.onclick = (e) => {
            if (e.target === modal) closeTableShareModal();
        };
        document.body.appendChild(modal);
    }

    const columns = Array.isArray(options.columns) ? options.columns : [];
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const summaryLines = Array.isArray(options.summaryLines) ? options.summaryLines : [];

    const thHtml = columns.map(col => {
        const cls = [
            col.align === "left" ? "col-left" : (col.align === "center" ? "col-center" : "col-right"),
            col.wrap ? "col-wrap" : ""
        ].filter(Boolean).join(" ");
        return `<th class="${cls}">${escapeHtml(col.label)}</th>`;
    }).join("");

    const rowsHtml = rows.map(row => {
        const cells = Array.isArray(row.cells) ? row.cells : [];
        const tds = cells.map((cell, idx) => {
            const col = columns[idx] || {};
            const isObj = cell && typeof cell === "object";
            const text = isObj ? cell.text : cell;
            const subtext = isObj ? cell.subtext : "";
            const cls = [
                col.align === "left" ? "col-left" : (col.align === "center" ? "col-center" : "col-right"),
                col.wrap ? "col-wrap" : "",
                isObj && cell.bold ? "cell-bold" : "",
                isObj && cell.tone ? `tone-${cell.tone}` : ""
            ].filter(Boolean).join(" ");
            const subHtml = subtext ? `<div class="receipt-row-sub">${escapeHtml(subtext)}</div>` : "";
            const cellText = (text !== undefined && text !== null && text !== "") ? text : "-";
            return `<td class="${cls}">${escapeHtml(cellText)}${subHtml}</td>`;
        }).join("");
        return `<tr>${tds}</tr>`;
    }).join("");

    const summaryHtml = summaryLines.map(line => {
        const cls = line.highlight === "grand"
            ? "summary-line grand"
            : (line.highlight === "paid" ? "summary-line paid" : "summary-line");
        return `
            <div class="${cls}">
                <span>${escapeHtml(line.label)}</span>
                <span>${escapeHtml(line.value)}</span>
            </div>
        `;
    }).join("");

    const canNativeShare = typeof navigator.share === "function";

    modal.innerHTML = `
        <div class="modal-content modal-wide">
            <span class="close" onclick="closeTableShareModal()">&times;</span>
            <div class="receipt-paper">
                <div class="receipt-header">
                    <div class="receipt-title">${escapeHtml(options.reportTitle || "SATIŞ TABLOSU")}</div>
                    <div class="receipt-meta">
                        <div class="receipt-company">
                            <strong>FİDAN ÇANTA</strong>
                            <div class="receipt-sub">${escapeHtml(options.subtitle || "İmalat & Toptan Satış")}</div>
                        </div>
                        <div class="receipt-date">
                            <div><strong>Tarih:</strong> ${escapeHtml(options.reportDate || formatDateTR(getLocalDateString()))}</div>
                            ${options.countText ? `<div class="receipt-no">${escapeHtml(options.countText)}</div>` : ""}
                        </div>
                    </div>
                    ${options.partyValue ? `
                        <div class="receipt-party">
                            <span class="party-label">${escapeHtml(options.partyLabel || "İlgili:")}</span>
                            <span class="party-name">${escapeHtml(options.partyValue)}</span>
                        </div>
                    ` : ""}
                </div>

                ${rows.length > 0 ? `
                    <div class="table-responsive">
                        <table class="receipt-table receipt-statement-table">
                            <thead>
                                <tr>${thHtml}</tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                ` : ""}

                ${summaryHtml ? `<div class="receipt-summary">${summaryHtml}</div>` : ""}

                ${options.noteText ? `
                    <div class="receipt-note">
                        <span class="note-label">Not / Açıklama:</span>
                        <div class="note-body">${escapeHtml(options.noteText)}</div>
                    </div>
                ` : ""}

                ${options.imageSrc ? `
                    <div class="receipt-image-section">
                        <span class="note-label">📷 Eklenen Fiş / Satış Fotoğrafı:</span>
                        <div class="receipt-image-wrap">
                            <img src="${escapeHtml(options.imageSrc)}" alt="Fiş Görseli" onclick="openSharedLightbox(this.src)">
                        </div>
                    </div>
                ` : ""}

                <div class="receipt-footer receipt-footer-wrap">
                    <button type="button" class="btn btn-primary btn-sm" id="tsWhatsappBtn">💬 WhatsApp ile Paylaş</button>
                    ${canNativeShare ? `<button type="button" class="btn btn-secondary btn-sm" id="tsNativeShareBtn">📤 Paylaş</button>` : ""}
                    <button type="button" class="btn btn-secondary btn-sm" id="tsCopyBtn">📋 Metni Kopyala</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="tsPrintBtn">🖨️ Yazdır</button>
                </div>
            </div>
        </div>
    `;

    const waBtn = modal.querySelector("#tsWhatsappBtn");
    const nativeBtn = modal.querySelector("#tsNativeShareBtn");
    const copyBtn = modal.querySelector("#tsCopyBtn");
    const printBtn = modal.querySelector("#tsPrintBtn");

    if (waBtn) {
        waBtn.addEventListener("click", () => {
            openWhatsAppWithText(options.whatsappText || "");
        });
    }

    if (nativeBtn) {
        nativeBtn.addEventListener("click", () => {
            navigator.share({
                title: options.shareTitle || options.reportTitle || "Fidan Çanta Tablo",
                text: options.whatsappText || ""
            }).catch(err => {
                if (err && err.name !== "AbortError") {
                    openWhatsAppWithText(options.whatsappText || "");
                }
            });
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            copyTextToClipboard(options.whatsappText || "", copyBtn).then(ok => {
                if (!ok) alert("Metin panoya kopyalanamadı.");
            });
        });
    }

    if (printBtn) {
        printBtn.addEventListener("click", () => {
            setActivePrintableModal(modal);
            window.print();
        });
    }

    setActivePrintableModal(modal);
    modal.style.display = "block";

    if (options.autoPrint) {
        void modal.offsetHeight;
        window.print();
    }
}

// Müşteriler ve Toptancılar için Hesap Hareketleri Tablosu Paylaşımı
function sharePartyRecordsTable(partyType, partyName, records) {
    const list = Array.isArray(records) ? records : [];
    if (list.length === 0) {
        alert("Paylaşılacak hareket kaydı bulunmuyor.");
        return;
    }

    const isSupplier = partyType === "Toptancı";
    const cleanName = partyName || (isSupplier ? "Toptancı" : "Müşteri");
    const totalColLabel = isSupplier ? "Alınan Mal" : "Verilen Mal";
    const paidColLabel = isSupplier ? "Ödenen" : "Tahsilat";
    const balanceColLabel = isSupplier ? "Kalan Borç" : "Kalan Bakiye";

    let runningBalance = 0;
    let sumTotal = 0;
    let sumPaid = 0;
    const rows = [];
    const waLines = [];

    list.forEach((r, idx) => {
        const total = Number(r.total || 0);
        const paid = Number(r.paid || 0);
        runningBalance += total;
        runningBalance -= paid;
        sumTotal += total;
        sumPaid += paid;

        const dateStr = formatDateTR(r.date);
        const noteParts = [];
        if (Array.isArray(r.items) && r.items.length > 0) {
            noteParts.push(`${r.items.length} kalem`);
        }
        if (r.waybillText) {
            noteParts.push(String(r.waybillText).trim());
        }
        const subNote = noteParts.join(" · ");

        rows.push({
            cells: [
                { text: dateStr, subtext: subNote, bold: true },
                { text: total > 0 ? formatTL(total) : "-", bold: total > 0 },
                { text: paid > 0 ? formatTL(paid) : "-", bold: paid > 0, tone: paid > 0 ? "positive" : "" },
                { text: formatTL(runningBalance), bold: true, tone: runningBalance > 0 ? "accent" : "" }
            ]
        });

        const txParts = [];
        if (total > 0) txParts.push(`${totalColLabel}: ${formatTL(total)}`);
        if (paid > 0) txParts.push(`${paidColLabel}: ${formatTL(paid)}`);
        txParts.push(`${balanceColLabel}: *${formatTL(runningBalance)}*`);
        waLines.push(`${idx + 1}. *${dateStr}* — ${txParts.join(" | ")}`);
    });

    const headerTitle = isSupplier ? "*FİDAN ÇANTA — TOPTANCI HESAP EKSTRESİ*" : "*FİDAN ÇANTA — CARİ HESAP EKSTRESİ*";
    const partyLabelText = isSupplier ? "Toptancı:" : "Sayın / Müşteri:";
    const finalBalanceLabel = isSupplier ? "Güncel Borcumuz (Bakiye):" : "Güncel Alacağımız (Bakiye):";
    const todayStr = formatDateTR(getLocalDateString());

    let waText = `${headerTitle}\n`;
    waText += `👤 *${partyLabelText}* ${cleanName}\n`;
    waText += `--------------------------------\n`;
    waText += waLines.join("\n");
    waText += `\n--------------------------------\n`;
    waText += `📦 *Toplam ${totalColLabel}:* ${formatTL(sumTotal)}\n`;
    waText += `💵 *Toplam ${paidColLabel}:* ${formatTL(sumPaid)}\n`;
    waText += `💰 *${finalBalanceLabel}* ${formatTL(runningBalance)}\n`;
    waText += `\n*FİDAN ÇANTA İmalat & Toptan*\nİyi günler.`;

    openTableShareModal({
        reportTitle: isSupplier ? "TOPTANCI HESAP EKSTRESİ" : "MÜŞTERİ HESAP EKSTRESİ",
        subtitle: "Hesap Hareketleri & İrsaliyeler",
        reportDate: todayStr,
        countText: `${list.length} hareket`,
        partyLabel: partyLabelText,
        partyValue: cleanName,
        columns: [
            { label: "Tarih", align: "left", wrap: true },
            { label: totalColLabel, align: "right" },
            { label: paidColLabel, align: "right" },
            { label: balanceColLabel, align: "right" }
        ],
        rows,
        summaryLines: [
            { label: `Toplam ${totalColLabel}:`, value: formatTL(sumTotal) },
            { label: `Toplam ${paidColLabel}:`, value: formatTL(sumPaid), highlight: "paid" },
            { label: finalBalanceLabel, value: formatTL(runningBalance), highlight: "grand" }
        ],
        whatsappText: waText,
        shareTitle: `${cleanName} - Hesap Ekstresi`
    });
}
