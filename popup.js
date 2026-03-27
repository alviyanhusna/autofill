const presetList = document.getElementById("presetList");
const saveBtn = document.getElementById("savePreset");
const delimiterSelect = document.getElementById("delimiter");
const customInput = document.getElementById("customDelimiter");

// --- TAB SWITCHING LOGIC ---
const btnTab1 = document.getElementById("btnTab1");
const btnTab2 = document.getElementById("btnTab2");
const tab1 = document.getElementById("tab1");
const tab2 = document.getElementById("tab2");

btnTab1.addEventListener("click", () => {
    tab1.style.display = "block";
    tab2.style.display = "none";
    btnTab1.style.background = "#38bdf8";
    btnTab1.style.color = "#0f172a";
    btnTab2.style.background = "#1e293b";
    btnTab2.style.color = "white";
});

btnTab2.addEventListener("click", () => {
    tab1.style.display = "none";
    tab2.style.display = "block";
    btnTab2.style.background = "#38bdf8";
    btnTab2.style.color = "#0f172a";
    btnTab1.style.background = "#1e293b";
    btnTab1.style.color = "white";
});

// --- TAB 1 LOGIC ---
delimiterSelect.addEventListener("change", () => {
    customInput.style.display = delimiterSelect.value === "custom" ? "block" : "none";
});

function persistShortcutConfigFromUI() {
    const selector = document.getElementById("selector").value || "";
    const mode = document.getElementById("mode").value || "pair";
    const delimiter = delimiterSelect.value || " ";
    chrome.storage.local.set({ selector, delimiter, mode });
}

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
            persistShortcutConfigFromUI();

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
            persistShortcutConfigFromUI();
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
        persistShortcutConfigFromUI();
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
    persistShortcutConfigFromUI();

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

// ====== TAB 2: PROFILE RECORD & RECORD ENGINE ======
const recordFormSelector = document.getElementById("recordFormSelector");
const recordProfileList = document.getElementById("recordProfileList");
const newProfileInput = document.getElementById("newProfileInput");
const saveRecordProfileBtn = document.getElementById("saveRecordProfile");
const deleteRecordProfileBtn = document.getElementById("deleteRecordProfile");
const btnRecordForm = document.getElementById("btnRecordForm");
const btnRecordInput = document.getElementById("btnRecordInput");
const btnClearRecord = document.getElementById("btnClearRecord");
const recordedDataTextarea = document.getElementById("recordedData");
const btnEksekusi = document.getElementById("btnEksekusi");

// Load Record Profiles
function loadRecordProfiles() {
    chrome.storage.local.get(["recordProfiles", "lastRecordProfile"], (data) => {
        const profiles = data.recordProfiles || {};
        const lastProfile = data.lastRecordProfile;
        
        recordProfileList.innerHTML = '<option value="">-- profile --</option>';
        Object.keys(profiles).forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            recordProfileList.appendChild(opt);
        });

        if (lastProfile && profiles[lastProfile]) {
            recordProfileList.value = lastProfile;
            recordFormSelector.value = profiles[lastProfile].selector || "";
            displayRecordedData(profiles[lastProfile].steps);
            return;
        }

        if (Object.keys(profiles).length === 1) {
            const only = Object.keys(profiles)[0];
            recordProfileList.value = only;
            recordFormSelector.value = profiles[only].selector || "";
            displayRecordedData(profiles[only].steps);
        }
    });
}

// Apply Record Profile
recordProfileList.addEventListener("change", () => {
    const name = recordProfileList.value;
    chrome.storage.local.set({ lastRecordProfile: name });
    chrome.storage.local.get(["recordProfiles"], (data) => {
        const profile = data.recordProfiles?.[name];
        if (!profile) return;
        recordFormSelector.value = profile.selector || "";
        chrome.storage.local.set({ recordedSteps: profile.steps }, () => {
            displayRecordedData(profile.steps);
        });
    });
});

// Save Record Profile
saveRecordProfileBtn.addEventListener("click", () => {
    let name = newProfileInput.value.trim();
    if (!name) {
        name = recordProfileList.value;
    }

    if (!name) {
        alert("Masukkan nama di kolom input, atau pilih profile yang ada untuk diupdate!");
        return;
    }

    chrome.storage.local.get(["recordProfiles", "recordedSteps"], (data) => {
        const profiles = data.recordProfiles || {};
        const steps = data.recordedSteps || [];
        profiles[name] = { 
            selector: recordFormSelector.value.trim(),
            steps: steps 
        };
        chrome.storage.local.set({ recordProfiles: profiles, lastRecordProfile: name }, () => {
            loadRecordProfiles();
            newProfileInput.value = "";
            alert(`Profile "${name}" berhasil disimpan!`);
        });
    });
});

// Delete Record Profile
deleteRecordProfileBtn.addEventListener("click", () => {
    const name = recordProfileList.value;
    if (!name) return alert("Pilih profile dulu!");
    if (!confirm(`Hapus profile "${name}"?`)) return;

    chrome.storage.local.get(["recordProfiles", "lastRecordProfile"], (data) => {
        const profiles = data.recordProfiles || {};
        delete profiles[name];
        
        chrome.storage.local.set({ recordProfiles: profiles }, () => {
            if (data.lastRecordProfile === name) chrome.storage.local.remove("lastRecordProfile");
            loadRecordProfiles();
            alert("Profile dihapus!");
        });
    });
});

function displayRecordedData(steps) {
    if (!steps || steps.length === 0) {
        recordedDataTextarea.value = "Belum ada data rekaman.";
        return;
    }
    recordedDataTextarea.value = JSON.stringify(steps, null, 2);
}

// Refresh display
chrome.storage.local.get(["recordedSteps", "isRecordingInput", "recordedFormSelector"], (data) => {
    if (data.recordedFormSelector !== undefined) {
        recordFormSelector.value = data.recordedFormSelector;
    }
    displayRecordedData(data.recordedSteps || []);
    if (data.isRecordingInput) {
        btnRecordInput.textContent = "⏹ Stop Record Input";
        btnRecordInput.style.background = "#64748b";
    }
});

// Listener for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.recordedSteps) {
        displayRecordedData(changes.recordedSteps.newValue);
    }
});

// Buttons Tab 2
btnRecordInput.addEventListener("click", async () => {
    chrome.storage.local.get(["isRecordingInput"], (data) => {
        const isRec = !data.isRecordingInput;
        const fSelStr = recordFormSelector.value.trim();
        
        chrome.storage.local.set({ isRecordingInput: isRec, recordedFormSelector: fSelStr }, async () => {
            if (isRec) {
                btnRecordInput.textContent = "⏹ Stop Record Input";
                btnRecordInput.style.background = "#64748b";
            } else {
                btnRecordInput.textContent = "● Start Record Input";
                btnRecordInput.style.background = "#f43f5e";
            }
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const fSelStr = recordFormSelector.value.trim();
            
            if (isRec) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (fSel) => {
                        function getOptimalSelector(el) {
                            if (el.id) return `#${CSS.escape(el.id)}`;
                            if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
                            
                            let path = el.tagName.toLowerCase();
                            if (el.className && typeof el.className === 'string') {
                                const classes = el.className.trim().split(/\s+/).filter(c => c);
                                if (classes.length > 0) {
                                    path += '.' + classes.join('.');
                                }
                            }
                            if (el.tagName.toLowerCase() === 'input' && el.type) {
                                path += `[type="${el.type}"]`;
                            }
                            return path;
                        }

                        let wrapper = document;
                        if (fSel) {
                            wrapper = document.querySelector(fSel);
                            if (!wrapper) {
                                alert(`Target form "${fSel}" tidak ditemukan di layar! Batal Merekam.`);
                                return;
                            }
                        }

                        const inputs = Array.from(wrapper.querySelectorAll('input, textarea, select')).filter(el => {
                            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
                            
                            // Cek atribut standar, custom framework, dan styling
                            if (el.readOnly || el.disabled || 
                                el.hasAttribute('readonly') || el.hasAttribute('disabled') ||
                                el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true' ||
                                el.classList.contains('disabled') || el.classList.contains('readonly') || el.classList.contains('bg-secondary') // kadang framework pakai bg abu-abu
                            ) return false;

                            const rect = el.getBoundingClientRect();
                            // Kombinasikan getBoundingClientRect dan offsetWidth/Height sebagai jaring pengaman
                            return (rect.width > 0 && rect.height > 0) || (el.offsetWidth > 0 || el.offsetHeight > 0);
                        });

                        const steps = inputs.map(input => ({
                            selector: getOptimalSelector(input),
                            value: input.value || ''
                        }));

                        chrome.storage.local.get(["recordedSteps", "recordProfiles", "lastRecordProfile"], (data) => {
                            let existing = data.recordedSteps || [];
                            if (existing.length === 0) {
                                existing = steps;
                            } else {
                                steps.forEach(s => {
                                    const idx = existing.findIndex(e => e.selector === s.selector);
                                    if (idx === -1) existing.push(s);
                                });
                            }
                            
                            const toSave = { recordedSteps: existing };
                            
                            // Auto-save jika sudah ada profile yang aktif terpilih
                            if (data.lastRecordProfile) {
                                let profiles = data.recordProfiles || {};
                                if (profiles[data.lastRecordProfile]) {
                                    profiles[data.lastRecordProfile].steps = existing;
                                    profiles[data.lastRecordProfile].selector = fSel;
                                    toSave.recordProfiles = profiles;
                                }
                            }
                            
                            chrome.storage.local.set(toSave, () => {
                                window.postMessage({ type: 'TOGGLE_RECORD_INPUT', state: true, formSelector: fSel }, '*');
                                console.log(`AutoFill: Form scanned within ${fSel || 'document'}. Found ${steps.length} inputs. Tracking started.`);
                            });
                        });
                    },
                    args: [fSelStr]
                });
            } else {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        window.postMessage({ type: 'TOGGLE_RECORD_INPUT', state: false }, '*');
                        console.log("AutoFill: Tracking stopped.");
                    }
                });
            }
        });
    });
});

btnClearRecord.addEventListener("click", () => {
    if(confirm("Hapus semua data rekaman saat ini?")) {
        chrome.storage.local.set({ recordedSteps: [] }, () => {
            displayRecordedData([]);
        });
    }
});

btnEksekusi.addEventListener("click", async () => {
    chrome.storage.local.get(["recordedSteps"], async (data) => {
        const steps = data.recordedSteps || [];
        if(steps.length === 0) {
            alert("Tidak ada data untuk dieksekusi!");
            return;
        }
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Simpan nilainya agar tak hilang pas klik eksekusi
        const fSelStr = recordFormSelector.value.trim();
        chrome.storage.local.set({ recordedFormSelector: fSelStr });
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: fillRecordedData,
            args: [steps, fSelStr]
        });
    });
});

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
                el.value = step.value;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                successCount++;
            }
        } catch(e) {}
    });
    console.log(`Berhasil mengeksekusi autofill pada ${successCount} field.`);
}

loadPresets();
loadRecordProfiles();