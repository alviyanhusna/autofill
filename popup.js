const presetList = document.getElementById("presetList");
const saveBtn = document.getElementById("savePreset");
const delimiterSelect = document.getElementById("delimiter");
const customInput = document.getElementById("customDelimiter");

delimiterSelect.addEventListener("change", () => {
    customInput.style.display = delimiterSelect.value === "custom" ? "block" : "none";
});

function loadPresets() {
    chrome.storage.local.get(["presets", "lastPreset"], (data) => {
        const presets = data.presets || {};
        const lastPreset = data.lastPreset;

        presetList.innerHTML = '<option value="">-- preset --</option>';

        Object.keys(presets).forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            presetList.appendChild(opt);
        });

        // 🔥 PRIORITAS 1: pakai preset terakhir
        if (lastPreset && presets[lastPreset]) {
            presetList.value = lastPreset;

            const preset = presets[lastPreset];
            document.getElementById("selector").value = preset.selector;
            document.getElementById("delimiter").value = preset.delimiter;
            document.getElementById("mode").value = preset.mode;

            return; // penting biar gak lanjut ke bawah
        }

        // 🔥 PRIORITAS 2: kalau cuma ada 1 preset → auto pilih
        if (Object.keys(presets).length === 1) {
            const only = Object.keys(presets)[0];
            presetList.value = only;

            const preset = presets[only];
            document.getElementById("selector").value = preset.selector;
            document.getElementById("delimiter").value = preset.delimiter;
            document.getElementById("mode").value = preset.mode;
        }
    });
}

// APPLY PRESET
presetList.addEventListener("change", () => {
    const name = presetList.value;

    chrome.storage.local.set({ lastPreset: name }); // 🔥 simpan terakhir

    chrome.storage.local.get(["presets"], (data) => {
        const preset = data.presets?.[name];
        if (!preset) return;

        document.getElementById("selector").value = preset.selector;
        document.getElementById("delimiter").value = preset.delimiter;
        document.getElementById("mode").value = preset.mode;
    });
});

// SAVE PRESET
saveBtn.addEventListener("click", () => {
    const name = prompt("Nama preset:");
    if (!name) return;

    const selector = document.getElementById("selector").value;
    const delimiter = delimiterSelect.value;
    const mode = document.getElementById("mode").value;

    chrome.storage.local.get(["presets"], (data) => {
        const presets = data.presets || {};
        presets[name] = { selector, delimiter, mode };

        chrome.storage.local.set({ presets }, () => {
            loadPresets();
            alert("Preset tersimpan!");
        });
    });
});

// AUTO FILL BUTTON
document.getElementById("fill").addEventListener("click", async () => {
    const selector = document.getElementById("selector").value;
    const values = document.getElementById("values").value;
    const mode = document.getElementById("mode").value;
    const onlyNumber = document.getElementById("onlyNumber").checked;

    let delimiter = delimiterSelect.value;
    if (delimiter === "custom") {
        delimiter = customInput.value || " ";
    }

    // simpan config
    chrome.storage.local.set({ lastPreset: presetList.value });

    let text = values;

    // kalau kosong → ambil clipboard
    if (!text) {
        try {
            text = await navigator.clipboard.readText();
        } catch {
            alert("Clipboard gagal dibaca!");
            return;
        }
    }

    let splitValues;

    // =========================
    // 🔥 MODE ANGKA SAJA
    // =========================
    if (onlyNumber) {
        splitValues = text.match(/[\d.,]+/g) || []   // ambil hanya angka
    } else {
        let delimiter = delimiterSelect.value;
        if (delimiter === "custom") {
            delimiter = customInput.value || " ";
        }

        splitValues = text.split(new RegExp(`[${delimiter}\\s]+`)).filter(v => v);
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillAdvanced,
        args: [selector, splitValues, mode]
    });
});

const deleteBtn = document.getElementById("deletePreset");

// DELETE PRESET
deleteBtn.addEventListener("click", () => {
    const name = presetList.value;

    if (!name) {
        alert("Pilih preset dulu!");
        return;
    }

    if (!confirm(`Hapus preset "${name}"?`)) return;

    chrome.storage.local.get(["presets"], (data) => {
        const presets = data.presets || {};

        delete presets[name];

        chrome.storage.local.set({ presets }, () => {
            // reset lastPreset kalau yang dihapus sama
            chrome.storage.local.get(["lastPreset"], (d) => {
                if (d.lastPreset === name) {
                    chrome.storage.local.remove("lastPreset");
                }
            });

            loadPresets();
            alert("Preset dihapus!");
        });
    });
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
        input.value = values[vi];

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        vi++;
    }
}

loadPresets();