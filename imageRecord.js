/**
 * Tab 3: parsing hasil OCR / record read -> recordedSteps
 */
(function (global) {
    /** Ekstrak token angka dari teks (OCR atau manual). */
    function extractTokens(text) {
        const normalized = String(text ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "");
        const matches = normalized.match(/-?\d[\d.,]*/g);
        return matches ? matches.map((m) => m.trim()).filter(Boolean) : [];
    }

    /** Format angka ke notasi ribuan Indonesia (92.480.000). */
    function formatIndonesianThousands(raw) {
        const digits = String(raw ?? "").replace(/\D/g, "");
        if (!digits) return "";
        const n = parseInt(digits, 10);
        if (Number.isNaN(n)) return String(raw);
        return n.toLocaleString("id-ID");
    }

    /** Selector untuk indeks token setelah skip token ke-2. */
    function selectorForIndex(i) {
        if (i === 0) return "#target0";
        if (i === 1) return "#target1";
        const offset = i - 2;
        if (offset % 2 === 0) return `#pagu${offset / 2 + 1}`;
        return `#target${Math.floor((i - 1) / 2) + 1}`;
    }

    /** Buang hanya token ke-2 (indeks 1). */
    function skipSecondToken(tokens) {
        if (tokens.length < 2) return [...tokens];
        return tokens.filter((_, idx) => idx !== 1);
    }

    /** Record read tampilan: satu nilai per baris agar mudah dikoreksi. */
    function tokensToRecordRead(tokens) {
        return tokens.join("\n");
    }

    /** Bangun array { selector, value } dari token. */
    function buildRecordedSteps(tokens) {
        const filtered = skipSecondToken(tokens);
        return filtered.map((raw, i) => {
            const selector = selectorForIndex(i);
            const isPagu = selector.startsWith("#pagu");
            const value = isPagu
                ? formatIndonesianThousands(raw)
                : String(raw).replace(/\D/g, "") || String(raw);
            return { selector, value };
        });
    }

    /** Pipeline lengkap: teks -> record read + steps */
    function parseFromText(text) {
        const tokens = extractTokens(text);
        return parseFromTokens(tokens);
    }

    /** Pipeline dari array token hasil OCR per-sel. */
    function parseFromTokens(tokens) {
        const list = (tokens || []).filter(Boolean);
        return {
            tokens: list,
            recordRead: tokensToRecordRead(list),
            steps: buildRecordedSteps(list),
        };
    }

    global.ImageRecord = {
        extractTokens,
        formatIndonesianThousands,
        selectorForIndex,
        skipSecondToken,
        tokensToRecordRead,
        buildRecordedSteps,
        parseFromText,
        parseFromTokens,
    };
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
