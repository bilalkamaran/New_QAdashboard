// ==UserScript==
// @name        AppSheetSave Pro API (Supabase)
// @namespace   bilalkamaran-qa
// @version     1.0.0
// @description Saves AppSheet cases to Supabase
// @updateURL   https://raw.githubusercontent.com/bilalkamaran/New_QAdashboard/main/AppSheetSave_Supabase.user.js
// @downloadURL https://raw.githubusercontent.com/bilalkamaran/New_QAdashboard/main/AppSheetSave_Supabase.user.js
// @match       *://*.appsheet.com/*
// @grant       GM_xmlhttpRequest
// @connect     supabase.co
// @connect     *
// ==/UserScript==
(function() {
    'use strict';

    // ** Put your Supabase project values here (Project Settings -> API) **
    const SUPABASE_URL = 'https://uzsevbbgoxtgxfdkiwcy.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_vNkb5nnDwFTq0RwHYZuFMg_MOyGa9r2';

    const REST = SUPABASE_URL + '/rest/v1';
    const authHeaders = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json"
    };

    let currentTabName = localStorage.getItem('appsheet_target_tab') || '';

    // Same rule as before: the user must already exist (before: the tab must exist in the Sheet)
    // onNetworkError(reason) gets a clear reason, so the alert says WHAT is wrong
    function verifyUser(name, onOk, onDenied, onNetworkError) {
        if (SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1 || (SUPABASE_KEY.indexOf('YOUR-') === 0 || SUPABASE_KEY.indexOf('PASTE_') === 0)) {
            return onNetworkError("SUPABASE_URL and SUPABASE_KEY are not filled in at the top of the script.");
        }
        GM_xmlhttpRequest({
            method: "GET",
            url: REST + '/users?select=name&name=eq.' + encodeURIComponent(name),
            headers: authHeaders,
            timeout: 20000,
            onload: function(response) {
                const st = response.status, txt = response.responseText || "";
                if (st === 401 || st === 403) return onNetworkError("Wrong key (" + st + "). Use the 'anon public' key from Supabase -> Project Settings -> API.\n\n" + txt.slice(0, 200));
                if (st === 404 || /PGRST205|does not exist/i.test(txt)) return onNetworkError("Table 'users' not found. Run supabase_setup.sql in Supabase SQL Editor.\n\n" + txt.slice(0, 200));
                if (st < 200 || st >= 300) return onNetworkError("Supabase answered " + st + ":\n" + txt.slice(0, 300));
                try {
                    let res = JSON.parse(txt);
                    if (Array.isArray(res) && res.length > 0) onOk();
                    else onDenied();
                } catch (e) {
                    console.error("Verification parsing error:", e, txt);
                    onNetworkError("Unexpected answer (check SUPABASE_URL):\n" + txt.slice(0, 200));
                }
            },
            onerror: function(error) {
                console.error("Network error during verification:", error);
                const why = (error && (error.error || error.statusText)) || "";
                onNetworkError("Could not reach " + SUPABASE_URL + "\n" + why +
                    "\n\nCheck: 1) the URL is correct  2) Tampermonkey asked to allow the connection -> click 'Always allow'.");
            },
            ontimeout: function() { onNetworkError("Timeout: " + SUPABASE_URL + " did not answer."); }
        });
    }

    function checkUserAndInitialize() {
        while (!currentTabName || currentTabName.trim() === "" || currentTabName === "Default_User") {
            let initialUser = prompt("Please enter your username:");
            if (initialUser && initialUser.trim() !== "" && initialUser.trim() !== "Default_User") {
                currentTabName = initialUser.trim();
            } else {
                alert("Username cannot be empty or 'Default_User'. Please enter a valid name.");
            }
        }

        verifyUser(currentTabName,
            function() {
                localStorage.setItem('appsheet_target_tab', currentTabName);
                initApp();
            },
            function() {
                alert("Access Denied: The user '" + currentTabName + "' does not exist.");
                localStorage.removeItem('appsheet_target_tab');
                location.reload();
            },
            function(reason) {
                alert("Network error: Failed to connect to the database.\n\n" + (reason || ""));
            }
        );
    }

    if (!currentTabName || currentTabName === "Default_User") {
        checkUserAndInitialize();
    } else {
        verifyUser(currentTabName,
            function() { initApp(); },
            function() { localStorage.removeItem('appsheet_target_tab'); checkUserAndInitialize(); },
            // Offline but this user was verified before: keep working, rows wait in the pending queue
            function() { initApp(); }
        );
    }

    function initApp() {
        let allSavedRows = JSON.parse(localStorage.getItem('appsheet_saved_rows') || '[]');
        let totalSavesCount = allSavedRows.length;
        let lastSavedData = totalSavesCount > 0 ? allSavedRows[totalSavesCount - 1] : null;

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let isDarkMode = prefersDark;
        let isMinimized = false;

        const panel = document.createElement('div');
        panel.id = 'appsheet-pro-panel';

        function updateThemeStyles() {
            if (isDarkMode) {
                panel.style.background = 'linear-gradient(135deg, rgba(18, 22, 33, 0.85), rgba(10, 13, 20, 0.9))';
                panel.style.border = '1px solid rgba(255, 255, 255, 0.12)';
                panel.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                panel.style.color = '#f3f4f6';
            } else {
                panel.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(240, 244, 248, 0.9))';
                panel.style.border = '1px solid rgba(255, 255, 255, 0.8)';
                panel.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 1)';
                panel.style.color = '#1e293b';
            }
        }

        panel.style.cssText = `
            position: fixed;
            top: 30px;
            right: 30px;
            width: 380px;
            max-width: 380px;
            box-sizing: border-box;
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border-radius: 18px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            user-select: none;
            will-change: transform, left, top;
        `;
        updateThemeStyles();

        /* ---------- Sending to Supabase (with a small retry queue so nothing is lost) ---------- */

        // Same rule as the old Apps Script formatValue: blob: links only work in the original browser, so skip them
        function cleanRow(dataObj) {
            const out = {};
            Object.keys(dataObj).forEach(k => {
                let v = dataObj[k];
                // blob: links only work in this browser; data: images are huge base64 text
                if (typeof v === "string" && (v.indexOf("blob:") === 0 || v.indexOf("data:") === 0)) v = "";
                out[k] = v;
            });
            return out;
        }

        function getPending() { return JSON.parse(localStorage.getItem('appsheet_pending_rows') || '[]'); }
        function setPending(a) { localStorage.setItem('appsheet_pending_rows', JSON.stringify(a)); }

        // onFail(retryable): true = network / server problem (try later), false = the row itself was rejected
        // "cols" = the values in page order, exactly like the old Google Sheet row (A, B, C, D, ...)
        let sendCols = true;
        let lastApiError = "";

        // Small status line in the panel: ✅ sent / ⏳ waiting / ❌ refused (with the reason)
        function setSendStatus(kind, text) {
            const el = document.getElementById('appsheet-send-status');
            if (!el) return;
            const c = { ok: ['#dcfce7', '#166534', '#86efac'], wait: ['#fef3c7', '#92400e', '#fcd34d'], bad: ['#fee2e2', '#991b1b', '#fca5a5'] }[kind];
            el.style.display = 'block';
            el.style.background = c[0]; el.style.color = c[1]; el.style.border = '1px solid ' + c[2];
            el.innerText = text;
        }   // becomes false if the database has no "cols" column yet
        function postRow(dataObj, onSuccess, onFail) {
            const clean = cleanRow(dataObj);
            const body = {
                user_name: clean["Username"] || currentTabName,
                page_title: clean["Page_Title"] || "",
                date_time: clean["Date_Time"] || "",
                page_url: clean["Page_URL"] || "",
                data: clean
            };
            if (sendCols) body.cols = Object.keys(clean).map(k => clean[k] == null ? "" : String(clean[k]));
            GM_xmlhttpRequest({
                method: "POST",
                url: REST + '/cases',
                headers: Object.assign({ "Prefer": "return=minimal" }, authHeaders),
                timeout: 20000,
                data: JSON.stringify(body),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) return onSuccess();
                    console.error("API Error:", response.status, response.responseText);
                    lastApiError = response.status + " " + (response.responseText || "").slice(0, 250);
                    // the SQL for "cols" was not run yet: send again without it, nothing is lost
                    if (sendCols && /cols/.test(response.responseText || "") && response.status >= 400 && response.status < 500) {
                        sendCols = false;
                        return postRow(dataObj, onSuccess, onFail);
                    }
                    // 0 / 408 / 429 / 5xx = temporary. Other 4xx = bad row, retrying will never help
                    const s = response.status;
                    onFail(s === 0 || s === 408 || s === 429 || s >= 500);
                },
                onerror: function(error) { console.error("Error sending data to API:", error); onFail(true); },
                ontimeout: function() { console.error("Timeout sending data to API"); onFail(true); }
            });
        }

        // Rows the database refused are kept here (not lost, not blocking the queue)
        function keepRejected(dataObj) {
            const r = JSON.parse(localStorage.getItem('appsheet_rejected_rows') || '[]');
            r.push(dataObj);
            localStorage.setItem('appsheet_rejected_rows', JSON.stringify(r));
        }

        let isFlushing = false;   // only one flush at a time, so a row is never sent twice
        function flushPending() {
            if (isFlushing) return;
            const list = getPending();
            if (!list.length) return;
            isFlushing = true;
            postRow(list[0], function() {
                setPending(getPending().slice(1));
                isFlushing = false;
                flushPending();
            }, function(retryable) {
                if (!retryable) {
                    setSendStatus('bad', '❌ Database refused a waiting case:\n' + lastApiError);
                    keepRejected(list[0]);
                    setPending(getPending().slice(1));
                    isFlushing = false;
                    flushPending();
                } else {
                    isFlushing = false;   // still offline, the timer below tries again
                }
            });
        }

        function sendToDatabase(dataObj) {
            setSendStatus('wait', '⏳ Sending...');
            postRow(dataObj, function() {
                setSendStatus('ok', '✅ Saved to database (' + new Date().toLocaleTimeString('en-GB') + ')');
                flushPending();
            }, function(retryable) {
                if (!retryable) {
                    keepRejected(dataObj);
                    setSendStatus('bad', '❌ Database refused this case:\n' + lastApiError);
                    return;
                }
                const p = getPending(); p.push(dataObj); setPending(p);
                setSendStatus('wait', '⏳ No connection - ' + p.length + ' case(s) waiting, will send automatically');
            });
        }

        flushPending();
        window.addEventListener('online', flushPending);
        setInterval(flushPending, 30000);

        function renderPanelContent() {
            const headerBg = isDarkMode ? 'linear-gradient(135deg, #1e293b, #0f172a)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
            const headerColor = '#fff';
            const contentBg = isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.4)';
            const cardBg = isDarkMode ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.7))' : 'linear-gradient(145deg, #ffffff, #f8fafc)';
            const cardBorder = isDarkMode ? 'rgba(255, 255, 255, 0.07)' : '#e2e8f0';
            const textColor = isDarkMode ? '#cbd5e1' : '#334155';
            const subTextColor = isDarkMode ? '#94a3b8' : '#64748b';
            const badgeBg = isDarkMode ? 'rgba(59, 130, 246, 0.25)' : '#dbeafe';
            const badgeColor = isDarkMode ? '#60a5fa' : '#1e40af';
            const badgeBorder = isDarkMode ? 'rgba(59, 130, 246, 0.4)' : '#93c5fd';

            const bodyDisplay = isMinimized ? 'none' : 'flex';
            const minimizeIcon = isMinimized ? '+' : '−';

            panel.innerHTML = `
                <div id="appsheet-pro-header" style="background: ${headerBg}; color: ${headerColor}; padding: 14px 16px; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; cursor: grab; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 16px;">⚡</span>
                        <span style="letter-spacing: 0.4px;">Save Data</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button id="appsheet-theme-btn" title="Toggle Dark/Light Mode" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">${isDarkMode ? '🌞' : '🌙'}</button>
                        <button id="appsheet-minimize-btn" title="Minimize / Expand" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px; font-weight: bold; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">${minimizeIcon}</button>
                        <button id="appsheet-close-btn" title="Close" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer; font-size: 16px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">&times;</button>
                    </div>
                </div>

                <div id="appsheet-body-content" style="padding: 16px; background: ${contentBg}; display: ${bodyDisplay}; flex-direction: column; gap: 12px;">

                    <div style="display: flex; justify-content: space-between; align-items: center; background: ${cardBg}; padding: 10px 14px; border: 1px solid ${cardBorder}; border-radius: 10px;">
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-size: 11px; font-weight: 500; color: ${subTextColor};">Active User:</span>
                            <span style="font-size: 13px; font-weight: 700; color: ${isDarkMode ? '#60a5fa' : '#2563eb'};">👤 ${currentTabName}</span>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; background: ${cardBg}; padding: 10px 14px; border: 1px solid ${cardBorder}; border-radius: 10px;">
                        <span style="font-size: 13px; font-weight: 500; color: ${subTextColor};">Total Saves:</span>
                        <span id="appsheet-counter-badge" style="background: ${badgeBg}; color: ${badgeColor}; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; border: 1px solid ${badgeBorder};">${totalSavesCount} Saves</span>
                    </div>

                    <div id="appsheet-send-status" style="display: none; padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; white-space: pre-wrap; word-break: break-word; user-select: text;"></div>

                    <div style="background: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: ${isDarkMode ? '#60a5fa' : '#2563eb'}; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${cardBorder}; padding-bottom: 6px;">
                            <span>📌 Last Saved Data</span>
                            <span id="appsheet-last-time" style="font-size: 11px; color: ${subTextColor};">${totalSavesCount > 0 && lastSavedData?.Username ? lastSavedData.Username : (totalSavesCount > 0 && lastSavedData?.Date_Time ? lastSavedData.Date_Time : "No data yet")}</span>
                        </div>
                        <div id="appsheet-last-content" style="max-height: 240px; overflow-y: auto; font-size: 12px; color: ${textColor}; display: flex; flex-direction: column; gap: 8px;">
                            ${getInitialLastContentHtml()}
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; margin-top: 2px;">
                        <button id="appsheet-reset-btn" style="flex: 1; background: ${isDarkMode ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'}; color: ${isDarkMode ? '#f87171' : '#991b1b'}; border: 1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.4)' : '#fca5a5'}; padding: 10px 12px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600;">Reset</button>
                        <button id="appsheet-download-btn" style="flex: 2; background: ${isDarkMode ? 'rgba(22, 163, 74, 0.25)' : '#dcfce7'}; color: ${isDarkMode ? '#4ade80' : '#166534'}; border: 1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.4)' : '#86efac'}; padding: 10px 12px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600;">Download CSV</button>
                    </div>
                </div>
            `;
            attachEventListeners();
        }

        if (!document.getElementById('appsheet-pro-panel')) {
            document.body.appendChild(panel);
        }

        function generateCardHtml(dataObj) {
            if (!dataObj) return '<span style="color: #94a3b8; font-style: italic;">No records saved yet.</span>';
            let html = "";
            const itemBg = isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#ffffff';
            const itemBorder = isDarkMode ? 'rgba(255, 255, 255, 0.04)' : '#e2e8f0';

            let keys = Object.keys(dataObj);
            keys.sort((a, b) => {
                if (a === "Username") return -1;
                if (b === "Username") return 1;
                if (a === "Page_Title") return -1;
                if (b === "Page_Title") return 1;
                if (a === "Date_Time") return -1;
                if (b === "Date_Time") return 1;
                return 0;
            });

            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            keys.forEach(key => {
                let val = dataObj[key] == null ? "" : String(dataObj[key]);
                let displayVal = esc(val);

                if (key === "Page_URL") {
                    displayVal = `<div style="margin-top: 4px;"><a href="${esc(val)}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-weight: 600; word-break: break-all;">🔗 Open Link ↗️</a></div>`;
                } else if (val.startsWith('http') || val.startsWith('blob:') || val.startsWith('data:image')) {
                    displayVal = `<div style="margin-top: 4px;"><a href="${esc(val)}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-weight: 600; word-break: break-all;">🖼️ View Media ↗️</a></div>`;
                }
                key = esc(key);

                html += `
                    <div style="display: flex; flex-direction: column; background: ${itemBg}; padding: 10px 12px; border-radius: 8px; border: 1px solid ${itemBorder}; gap: 4px;">
                        <span style="font-weight: 600; color: ${isDarkMode ? '#94a3b8' : '#64748b'}; font-size: 11px; line-height: 1.4;">${key}</span>
                        <span style="color: ${isDarkMode ? '#f1f5f9' : '#0f172a'}; font-size: 12px; word-break: break-word; line-height: 1.4;">${displayVal}</span>
                    </div>
                `;
            });
            return html;
        }

        function getInitialLastContentHtml() {
            return generateCardHtml(lastSavedData);
        }

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        function attachEventListeners() {
            const header = document.getElementById('appsheet-pro-header');
            if (!header) return;

            header.onmousedown = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                header.style.cursor = 'grabbing';
                const rect = panel.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initialLeft = rect.left;
                initialTop = rect.top;
                panel.style.right = 'auto';
                panel.style.left = initialLeft + 'px';
                panel.style.top = initialTop + 'px';
                e.preventDefault();
            };

            document.onmousemove = (e) => {
                if (!isDragging) return;
                let dx = e.clientX - startX;
                let dy = e.clientY - startY;
                requestAnimationFrame(() => {
                    panel.style.left = (initialLeft + dx) + 'px';
                    panel.style.top = (initialTop + dy) + 'px';
                });
            };

            document.onmouseup = () => {
                if (isDragging) {
                    isDragging = false;
                    header.style.cursor = 'grab';
                }
            };

            document.getElementById('appsheet-theme-btn').onclick = () => {
                isDarkMode = !isDarkMode;
                updateThemeStyles();
                renderPanelContent();
            };

            document.getElementById('appsheet-close-btn').onclick = () => { panel.style.display = 'none'; };

            document.getElementById('appsheet-minimize-btn').onclick = () => {
                isMinimized = !isMinimized;
                const bodyContent = document.getElementById('appsheet-body-content');
                bodyContent.style.display = isMinimized ? 'none' : 'flex';
                document.getElementById('appsheet-minimize-btn').innerText = isMinimized ? '+' : '−';
            };

            document.getElementById('appsheet-reset-btn').onclick = () => {
                allSavedRows = [];
                totalSavesCount = 0;
                lastSavedData = null;
                localStorage.removeItem('appsheet_saved_rows');
                document.getElementById('appsheet-counter-badge').innerText = "0 Saves";
                document.getElementById('appsheet-last-time').innerText = "No data yet";
                document.getElementById('appsheet-last-content').innerHTML = '<span style="color: #94a3b8; font-style: italic;">No records saved yet.</span>';
            };

            document.getElementById('appsheet-download-btn').onclick = () => {
                if (allSavedRows.length === 0) {
                    alert("No data available!");
                    return;
                }
                let allKeysSet = new Set(["Username", "Page_Title", "Date_Time", "Page_URL"]);
                allSavedRows.forEach(rowObj => Object.keys(rowObj).forEach(k => allKeysSet.add(k)));
                let headers = Array.from(allKeysSet);

                let csvContent = "\uFEFF" + headers.map(h => '"' + h.replace(/"/g, '""') + '"').join(",") + "\n";
                allSavedRows.forEach(rowObj => {
                    let rowValues = headers.map(header => '"' + String(rowObj[header] !== undefined ? rowObj[header] : "").replace(/"/g, '""') + '"');
                    csvContent += rowValues.join(",") + "\n";
                });

                let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                let url = URL.createObjectURL(blob);
                let a = document.createElement('a');
                a.href = url;
                a.download = 'Form_Data_Export_' + new Date().toISOString().slice(0,10) + '.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }

        renderPanelContent();

        // Optimized event listener: removed UI blocking alerts/logs during submission
        document.addEventListener("mousedown", function(e){
            let el = e.target;
            while(el){
                let textVal = el.innerText ? el.innerText.trim().toLowerCase() : "";
                if(textVal === "save" || textVal === "submit" || textVal === "next" || textVal === "validate"){

                    let rowData = {};

                    rowData["Username"] = currentTabName;

                    let pageHeaderEl = document.querySelector('h6[class*="jss"], h5[class*="jss"], h4[class*="jss"], span[class*="heading"], header');
                    if (pageHeaderEl && pageHeaderEl.innerText && pageHeaderEl.innerText.trim() !== "") {
                        let headerText = pageHeaderEl.innerText.trim();
                        headerText = headerText.replace(/\s+[A-Za-z]$/, '');
                        rowData["Page_Title"] = headerText;
                    } else {
                        rowData["Page_Title"] = document.title || "AppSheet View";
                    }

                    let now = new Date();
                    rowData["Date_Time"] = `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`;
                    rowData["Page_URL"] = window.location.href;

                    let controlGroups = document.querySelectorAll('[data-testid*="form-entry"], [class*="Formentry"], div[class*="control-group"], div[class*="question"], div[class*="field"], .question-container');

                    controlGroups.forEach((group) => {
                        let testId = group.getAttribute('data-testid') || "";
                        let fieldName = "";

                        let match = testId.match(/Attr_[a-zA-Z0-9_]+/);
                        if (match) {
                            fieldName = match[0];
                        } else {
                            let parts = testId.split('_');
                            if (parts.length > 1) fieldName = parts[parts.length - 1];
                        }

                        if (!fieldName || fieldName === "form-entry") {
                            let label = group.querySelector('label, .control-label, span[class*="label"], span[class*="heading"], .question-label, [class*="heading-label-text"]');
                            if (label) fieldName = label.innerText.trim();
                        }

                        let img = group.querySelector('img');
                        let bgElement = group.querySelector('[style*="background-image"]');
                        let input = group.querySelector('input:not([type="range"]), textarea, select');
                        let textDisplay = group.querySelector('[data-testid*="text-type-display"], .TextTypeDisplay__text');

                        let fieldValue = "";

                        if (img && img.src && !img.src.includes('data:image/svg')) {
                            fieldValue = img.src;
                        } else if (bgElement) {
                            let style = bgElement.getAttribute('style');
                            let urlMatch = style ? style.match(/url\(['"]?(.*?)['"]?\)/) : null;
                            if (urlMatch) fieldValue = urlMatch[1];
                        } else if (input && input.value !== undefined && input.value !== "") {
                            fieldValue = input.value.trim();
                        } else if (textDisplay && textDisplay.innerText) {
                            fieldValue = textDisplay.innerText.trim();
                        }

                        if (fieldName) {
                            fieldName = fieldName.replace(/_URL$/i, '').replace(/[":]/g, "").trim();
                            let isSystemId = /^mui-/.test(fieldName) || /^\d+$/.test(fieldName);
                            let lowerName = fieldName.toLowerCase();

                            if (!isSystemId && fieldName.length < 180 &&
                                !lowerName.includes('search') &&
                                !lowerName.includes('reset') &&
                                // same rule as the old script: an empty field is skipped,
                                // unless its name has pic / image / meter / number
                                (fieldValue || lowerName.includes('pic') || lowerName.includes('image') || lowerName.includes('meter') || lowerName.includes('number'))) {

                                if (!rowData[fieldName]) {
                                    rowData[fieldName] = fieldValue || "";
                                }
                            }
                        }
                    });

                    let inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="range"]), textarea');
                    const groupList = Array.from(controlGroups);
                    inputs.forEach(inp => {
                        // already saved as part of a form field above: do not add it a second time
                        if (groupList.some(g => g.contains(inp))) return;
                        let name = inp.name || inp.getAttribute('placeholder') || inp.id;
                        if (name && inp.value !== "") {
                            let cleanName = name.replace(/_URL$/i, '').replace(/[":]/g, "").trim();
                            let isSystemId = /^mui-/.test(cleanName) || /^\d+$/.test(cleanName);
                            let lowerCleanName = cleanName.toLowerCase();

                            if (!isSystemId &&
                                !lowerCleanName.includes('search') &&
                                !lowerCleanName.includes('reset') &&
                                !lowerCleanName.includes('rotation') &&
                                !lowerCleanName.includes('rotate') &&
                                !rowData[cleanName]) {
                                rowData[cleanName] = inp.value.trim();
                            }
                        }
                    });

                    if (Object.keys(rowData).length > 3) {
                        allSavedRows.push(rowData);
                        totalSavesCount++;
                        lastSavedData = rowData;
                        localStorage.setItem('appsheet_saved_rows', JSON.stringify(allSavedRows));

                        document.getElementById('appsheet-counter-badge').innerText = `${totalSavesCount} Saves`;
                        document.getElementById('appsheet-last-time').innerText = rowData["Username"];
                        document.getElementById('appsheet-last-content').innerHTML = generateCardHtml(lastSavedData);

                        sendToDatabase(rowData);
                    }
                    break;
                }
                el = el.parentElement;
            }
        }, true);
    }

})();
