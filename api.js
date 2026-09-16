/**
 * api.js - UID to Masked PAN API Handler
 * Yeh file GitHub Pages pe index.html ke saath chalegi
 * 
 * NOTE: Browser CORS block karta hai direct API call ko.
 * Isliye hum multiple proxies try karte hain.
 */

(function() {
    const uidInput = document.getElementById('uidInput');
    const progressFill = document.getElementById('progressFill');
    const resultContainer = document.getElementById('resultContainer');

    const API_KEY = 'temppanx2408';
    const API_BASE = 'https://anon-pan-info.vercel.app/aadhar';

    let currentRequestId = 0;
    let debounceTimer = null;
    let lastFetchedUid = '';
    let timerInterval = null;

    // ============ UI HELPERS ============
    function showLoading(uid) {
        let seconds = 0;
        resultContainer.innerHTML = `
            <div class="empty-state">
                <div class="spinner"></div>
                <span>Fetching status for <strong style="color:#2dd4bf;">${uid}</strong></span>
                <span class="loading-timer" id="loadingTimer">0s elapsed...</span>
            </div>`;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            seconds++;
            const t = document.getElementById('loadingTimer');
            if (t) t.textContent = `${seconds}s elapsed...`;
            if (seconds >= 40) clearInterval(timerInterval);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    function showError(msg, detail = '') {
        stopTimer();
        resultContainer.innerHTML = `
            <div class="status-header">
                <i class="fas fa-exclamation-triangle" style="color: #f97316;"></i>
                <span>Request failed</span>
            </div>
            <div class="error-message">
                <i class="fas fa-times-circle"></i>
                <span>${msg} ${detail ? '· ' + detail : ''}</span>
            </div>`;
    }

    function showEmpty(msg) {
        stopTimer();
        resultContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-keyboard"></i>
                <span>${msg}</span>
            </div>`;
    }

    function renderResponse(data) {
        stopTimer();
        const resp = data.response;
        const params = resp.parameters;
        const success = params.success;
        const uid = params.value;
        const service = params.service;
        const arr = resp.data || [];

        let html = `<div class="status-header">
            <i class="fas ${success ? 'fa-check-circle' : 'fa-info-circle'}" style="color: ${success ? '#2dd4bf' : '#f97316'};"></i>
            <span>${service} · ${success ? 'Linked ✅' : 'Not Linked ❌'}</span>
        </div>`;

        if (success) {
            const rec = arr[0] || {};
            const pan = rec.masked_pan || '—';
            const linked = rec.linked === true ? 'Yes' : 'No';
            html += `<div class="data-row">
                <div class="field"><span class="label"><i class="fas fa-id-card"></i> Aadhaar</span><span class="value">${rec.aadhar || uid}</span></div>
                <div class="field"><span class="label"><i class="fas fa-credit-card"></i> Masked PAN</span><span class="value masked-pan">${pan}</span></div>
                <div class="field"><span class="label"><i class="fas fa-link"></i> Linked</span>
                    <span class="badge ${linked === 'Yes' ? 'linked' : 'not-linked'}">
                        <i class="fas ${linked === 'Yes' ? 'fa-check-circle' : 'fa-times-circle'}"></i> ${linked}
                    </span>
                </div>
            </div>`;
        } else {
            const err = arr[0] || {};
            html += `<div class="data-row">
                <div class="field"><span class="label"><i class="fas fa-id-card"></i> Aadhaar</span><span class="value">${uid}</span></div>
                <div class="field"><span class="label"><i class="fas fa-exclamation-circle"></i> Status</span>
                    <span class="badge not-linked"><i class="fas fa-times-circle"></i> Not Linked</span>
                </div>
                <div class="error-message" style="margin-top: 0.8rem;">
                    <i class="fas fa-ban"></i>
                    <span><strong>${err.error_code || 404}</strong> · ${err.message || 'PAN Not Found or Not Linked'}</span>
                </div>
            </div>`;
        }

        if (resp.developer) {
            html += `<div style="margin-top: 1.2rem; font-size: 0.75rem; color: #52637a; text-align: right; border-top: 1px solid #1e2a3a; padding-top: 0.7rem;">
                <i class="fas fa-code-branch"></i> ${resp.developer}
            </div>`;
        }
        resultContainer.innerHTML = html;
    }

    // ============ FETCH API WITH PROXY FALLBACK ============
    async function tryFetch(url) {
        // ✅ Multiple working proxies
        const proxies = [
            { name: 'AllOrigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
            { name: 'CodeTabs',   url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
            { name: 'CorsProxy',  url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
            { name: 'WhateverOrigin', url: `https://www.whateverorigin.org/get?url=${encodeURIComponent(url)}`, wrap: true },
        ];

        let lastError = '';
        for (let i = 0; i < proxies.length; i++) {
            const p = proxies[i];
            try {
                console.log(`[Proxy ${i+1}/${proxies.length}] ${p.name}...`);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 20000);
                const res = await fetch(p.url, { signal: controller.signal });
                clearTimeout(timeout);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                let data;
                if (p.wrap) {
                    const j = await res.json();
                    data = JSON.parse(j.contents);
                } else {
                    data = await res.json();
                }

                if (!data.response || !data.response.parameters) {
                    throw new Error('Invalid response');
                }
                console.log(`✅ ${p.name} success`);
                return data;
            } catch (err) {
                console.warn(`❌ ${p.name} failed:`, err.message);
                lastError = err.message;
            }
        }
        throw new Error(lastError || 'All proxies failed');
    }

    async function fetchMaskedPan(uid) {
        if (uid === lastFetchedUid) return;
        lastFetchedUid = uid;
        const reqId = ++currentRequestId;
        showLoading(uid);

        const targetUrl = `${API_BASE}?key=${API_KEY}&id=${uid}`;

        try {
            const data = await tryFetch(targetUrl);
            if (reqId !== currentRequestId) return;
            renderResponse(data);
        } catch (error) {
            if (reqId !== currentRequestId) return;
            console.error('Final error:', error);
            showError('Failed to fetch', error.message);
        }
    }

    // ============ AUTO-FETCH ON INPUT ============
    uidInput.addEventListener('input', function() {
        let val = this.value.replace(/\D/g, '').slice(0, 12);
        this.value = val;
        progressFill.style.width = (val.length / 12 * 100) + '%';

        if (val.length < 12) {
            if (lastFetchedUid !== '') {
                lastFetchedUid = '';
                currentRequestId++;
                stopTimer();
                showEmpty(`Type ${12 - val.length} more digit${12 - val.length > 1 ? 's' : ''}...`);
            }
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (val.length === 12) {
                lastFetchedUid = '';
                fetchMaskedPan(val);
            }
        }, 400);
    });

    uidInput.addEventListener('paste', function(e) {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pasted.replace(/\D/g, '').slice(0, 12);
        this.value = digits;
        this.dispatchEvent(new Event('input'));
    });

    // Enter key to force re-fetch
    uidInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && this.value.length === 12) {
            e.preventDefault();
            lastFetchedUid = '';
            fetchMaskedPan(this.value);
        }
    });

    console.log('✅ api.js loaded');
})();