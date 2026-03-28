chrome.commands.onCommand.addListener(async (command) => {
    if (command === "auto-fill") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        chrome.storage.local.get(["selector", "delimiter", "mode", "presets", "lastPreset"], async (data) => {
            let selector = data.selector || "";
            let delimiter = data.delimiter || "";
            let mode = data.mode || "";

            if (!selector && data.lastPreset && data.presets?.[data.lastPreset]) {
                const preset = data.presets[data.lastPreset];
                selector = preset.selector || "";
                delimiter = preset.delimiter || "";
                mode = preset.mode || "";
            }

            if (!selector) {
                await notifyInTab(tab.id, "Preset belum diset! Pilih preset dulu di popup.");
                return;
            }

            let text = "";
            try {
                // 1. Prioritas: Ambil langsung dari Background SW (Chrome/Edge 116+ mendukung akses ini)
                if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
                    text = await navigator.clipboard.readText();
                }
            } catch (e) {
                console.warn("Background clipboard failed", e);
            }

            if (!text) {
                // 2. Fallback: Eksekusi di page (Edge lama / policy tertentu bisa memblokir ini)
                try {
                    const result = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: readClipboardInPage
                    });
                    text = result?.[0]?.result || "";
                } catch {
                    await notifyInTab(tab.id, "Clipboard gagal dibaca! Fokuskan halaman lalu coba lagi.");
                    return;
                }
            }

            if (!text || !text.trim()) {
                await notifyInTab(tab.id, "Clipboard kosong atau tidak bisa diakses.\n\n[INFO EDGE]: Jika shortcut diblokir browser, coba klik ikon 'Site Info' gembok di URL -> Izinkan Clipboard/Paste, atau gunakan klik manual tombol Auto Fill dari popup extension.");
                return;
            }

            delimiter = delimiter || " ";
            const values = text.split(new RegExp(`[${delimiter}\\s]+`)).filter(v => v);

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: fillAdvanced,
                args: [selector, values, mode || "pair"]
            });
        });
    }

    if (command === "auto-fill-record") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.storage.local.get(["recordedSteps", "recordedFormSelector"], (data) => {
            const steps = data.recordedSteps || [];
            if(steps.length === 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => alert("Tidak ada data record untuk dieksekusi!")
                });
                return;
            }

            const fSelStr = data.recordedFormSelector || "";
            
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: fillRecordedData,
                args: [steps, fSelStr]
            });
        });
    }
});

function fillAdvanced(selector, values, mode) {
    let inputs = Array.from(document.querySelectorAll(selector));

    let startIndex = 0;

    if (window.getLastClickedInput) {
        const last = window.getLastClickedInput();
        const idx = inputs.findIndex(el => el === last);
        if (idx !== -1) startIndex = idx;
    }

    let vi = 0;

    for (let i = startIndex; i < inputs.length; i++) {
        if (values[vi] === undefined) break;

        const input = inputs[i];
        if (
            input?.tagName?.toLowerCase?.() === "input" &&
            input?.type?.toLowerCase?.() === "file"
        ) {
            continue;
        }
        if (input?.disabled || input?.readOnly) {
            continue;
        }
        const raw = values[vi];
        // Pastikan yang di-set hanya angka (buang semua huruf).
        let candidate = String(raw ?? "").replace(/[^\d.,\-]/g, "");
        
        // Skip nilai yang benar-benar kosong (tanpa angka) agar tidak membuang urutan input
        if (candidate === "") {
            vi++;
            i--;
            continue;
        }

        const inputType = input?.type?.toLowerCase?.() || "";

        if (inputType === "number") {
            // input[type="number"] biasanya tidak menerima format dengan koma ribuan.
            candidate = candidate.replace(/[,\s]+/g, "");

            // Jika ada lebih dari 1 titik, anggap yang selain titik terakhir adalah pemisah ribuan.
            if (candidate.includes(".")) {
                const parts = candidate.split(".");
                if (parts.length > 2) {
                    candidate = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
                }
            }
        }

        let success = false;
        try {
            input.value = candidate;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            success = true;
        } catch (e) {}

        // Hanya konsumsi nilai jika set value berhasil.
        if (success) vi++;
    }
}

function fillRecordedData(steps, fSel) {
    let successCount = 0;
    
    let wrapper = document;
    if (fSel) {
        wrapper = document.querySelector(fSel);
        if (!wrapper) {
            alert(`Target form "${fSel}" tidak ditemukan di layar!`);
            return;
        }
    }

    steps.forEach(step => {
        try {
            const el = wrapper.querySelector(step.selector);
            if (el) {
                const inputType = el?.type?.toLowerCase?.() || "";
                if (inputType === "file" || el?.disabled) return;

                let candidate = String(step.value ?? "").replace(/[^\d.,\-]/g, "");
                if (inputType === "number") {
                    candidate = candidate.replace(/[,\s]+/g, "");
                    if (candidate.includes(".")) {
                        const parts = candidate.split(".");
                        if (parts.length > 2) {
                            candidate = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
                        }
                    }
                }

                try {
                    el.value = candidate;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                    successCount++;
                } catch (e) {}
            }
        } catch(e) {}
    });
    console.log(`Berhasil mengeksekusi autofill pada ${successCount} field.`);
}

async function notifyInTab(tabId, message) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (msg) => alert(msg),
            args: [message]
        });
    } catch (e) {
        console.warn("AutoFill notification failed:", e);
    }
}

async function readClipboardInPage() {
    try {
        return await navigator.clipboard.readText();
    } catch (e) {
        // Fallback untuk browser Edge/Chrome yang membatasi API clipboard di content script
        try {
            const t = document.createElement("textarea");
            document.body.appendChild(t);
            t.focus();
            document.execCommand("paste");
            const val = t.value;
            document.body.removeChild(t);
            return val;
        } catch (err) {
            return "";
        }
    }
}