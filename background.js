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