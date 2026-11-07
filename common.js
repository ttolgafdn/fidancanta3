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

// Global Fiş / İrsaliye Modalını Açma (Teklif Fişi Formatında)
function renderWaybillReceipt(record, partyInfo = {}) {
    const modal = document.getElementById("dayDetailsModal");
    if (!modal) return;

    const isSupplier = partyInfo.type === "Toptancı";
    const titleText = isSupplier ? "GELEN MAL / İRSALİYE FİŞİ" : "SATIŞ / SEVK İRSALİYESİ";
    const partyLabel = isSupplier ? "Toptancı:" : "Sayın / Müşteri:";

    let itemsHtml = "";
    const items = record.items || [];
    const hasItems = Array.isArray(items) && items.length > 0;

    if (hasItems) {
        items.forEach(item => {
            const qty = Number(item.qty || 0);
            const unit = item.unit || "AD";
            const name = item.name || "-";
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
                    <span class="party-name">${partyInfo.name || "Belirtilmedi"}</span>
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
                    <div class="note-body">${record.waybillText}</div>
                </div>
            ` : ""}

            ${record.waybill ? `
                <div class="receipt-image-section">
                    <span class="note-label">📷 Eklenen Fiş / İrsaliye Fotoğrafı:</span>
                    <div class="receipt-image-wrap">
                        <img src="${record.waybill}" alt="Fiş Görseli" onclick="window.open(this.src, '_blank')">
                    </div>
                </div>
            ` : ""}

            <div class="receipt-footer" style="flex-wrap: wrap; gap: 8px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="shareReceiptViaWhatsApp(${JSON.stringify(record).replace(/"/g, '&quot;')}, '${(partyInfo.name || '').replace(/'/g, "\\'")}', '${partyInfo.type || ''}')">💬 WhatsApp ile Paylaş</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">🖨️ Yazdır</button>
                <button type="button" class="btn btn-danger-outline btn-sm" onclick="if(window.deleteRecordById) window.deleteRecordById(${record.id})">🗑️ Bu Hareketi Sil</button>
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
    modal.style.display = "block";
}

function closeDayDetailsModal() {
    const modal = document.getElementById("dayDetailsModal");
    if (modal) modal.style.display = "none";
}

// WhatsApp Paylaşım Fonksiyonu
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
    if (record.waybillText) {
        text += `📝 *Not:* ${record.waybillText}\n`;
    }

    text += `\n*FİDAN ÇANTA İmalat & Toptan*\nİyi çalışmalar dileriz.`;

    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}
