chrome.commands.onCommand.addListener(async (command) => {
    if (command === "auto-fill") {

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.storage.local.get(["selector", "delimiter", "mode"], async (data) => {

            if (!data.selector) {
                alert("Preset belum diset!");
                return;
            }

            let text = "";

            try {
                text = await navigator.clipboard.readText();
            } catch {
                alert("Clipboard gagal dibaca!");
                return;
            }

            let delimiter = data.delimiter || " ";

            const values = text.split(new RegExp(`[${delimiter}\\s]+`)).filter(v => v);

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: fillAdvanced,
                args: [data.selector, values, data.mode || "pair"]
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
        input.value = values[vi];

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        vi++;
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
                el.value = step.value;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                successCount++;
            }
        } catch(e) {}
    });
    console.log(`Berhasil mengeksekusi autofill pada ${successCount} field.`);
}