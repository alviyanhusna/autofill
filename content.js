let lastClicked = null;

document.addEventListener("click", (e) => {
    if (e.target.matches("input, textarea")) {
        lastClicked = e.target;
    }
});

window.getLastClickedInput = () => lastClicked;

// --- RECORDING ENGINE ---

// Helper to generate a somewhat robust selector
function getOptimalSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    
    // Fallback: create a path or generic selector
    let path = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) {
            path += '.' + classes.join('.');
        }
    }
    
    // Add type if input
    if (el.tagName.toLowerCase() === 'input' && el.type) {
        path += `[type="${el.type}"]`;
    }
    
    return path;
}

window.addEventListener('message', (event) => {
    if (event.data.type === 'START_RECORD_FORM') {
        const inputs = Array.from(document.querySelectorAll('input, textarea, select')).filter(el => {
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
            const rect = el.getBoundingClientRect();
            return (rect.width > 0 && rect.height > 0); // only visible
        });

        if (inputs.length === 0) {
            alert("Tidak ada form input yang terlihat di layar saat ini.");
            return;
        }

        const steps = [];
        inputs.forEach(input => {
            steps.push({
                selector: getOptimalSelector(input),
                value: input.value || ''
            });
        });

        chrome.storage.local.get(["recordedSteps"], (data) => {
            chrome.storage.local.set({ recordedSteps: steps }, () => {
                alert(`Berhasil membaca ${steps.length} field dari layar! Nilainya saat ini ikut terekam. Lanjutkan dengan "Record Input" jika Anda ingin memonitor perubahan nilai.`);
            });
        });
    }
    
    if (event.data.type === 'TOGGLE_RECORD_INPUT') {
        window.isRecordingInput = event.data.state;
        window.recordedFormSelector = event.data.formSelector || "";
        if (window.isRecordingInput) {
            console.log(`AutoFill: Start Record Input (Scope: ${window.recordedFormSelector || 'document'})`);
            document.addEventListener('change', recordInputChangeHandler, true);
        } else {
            console.log("AutoFill: Stop Record Input");
            document.removeEventListener('change', recordInputChangeHandler, true);
        }
    }
});

function recordInputChangeHandler(e) {
    if (!window.isRecordingInput) return;
    
    const el = e.target;
    if (window.recordedFormSelector && !el.closest(window.recordedFormSelector)) return;

    if (el.matches('input, textarea, select')) {
        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
        
        // Cek atribut standar, custom framework, dan styling
        if (el.readOnly || el.disabled || 
            el.hasAttribute('readonly') || el.hasAttribute('disabled') ||
            el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true' ||
            el.classList.contains('disabled') || el.classList.contains('readonly')
        ) return;
        
        const step = {
            selector: getOptimalSelector(el),
            value: el.value || ''
        };
        
        chrome.storage.local.get(["recordedSteps", "recordProfiles", "lastRecordProfile", "recordedFormSelector"], (data) => {
            let steps = data.recordedSteps || [];
            
            // Check if selector exists in the recorded structure, update its value.
            const existingIndex = steps.findIndex(s => s.selector === step.selector);
            
            if (existingIndex !== -1) {
                steps[existingIndex].value = step.value;
            } else {
                // Not found (maybe Record Form wasn't clicked), so just append
                const lastStep = steps[steps.length - 1];
                if (lastStep && lastStep.selector === step.selector) {
                    lastStep.value = step.value;
                } else {
                    steps.push(step);
                }
            }
            
            const toSave = { recordedSteps: steps };
            
            // Auto-save jika sudah ada profile yang terpilih (Seamless Sync)
            if (data.lastRecordProfile) {
                let profiles = data.recordProfiles || {};
                if (profiles[data.lastRecordProfile]) {
                    profiles[data.lastRecordProfile].steps = steps;
                    if (data.recordedFormSelector) {
                        profiles[data.lastRecordProfile].selector = data.recordedFormSelector;
                    }
                    toSave.recordProfiles = profiles;
                }
            }
            
            chrome.storage.local.set(toSave);
        });
    }
}

// Check startup state for recording input
chrome.storage.local.get(["isRecordingInput", "recordedFormSelector"], (data) => {
    if (data.isRecordingInput) {
        window.isRecordingInput = true;
        window.recordedFormSelector = data.recordedFormSelector || "";
        document.addEventListener('change', recordInputChangeHandler, true);
    }
});