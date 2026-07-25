const ScoreManager = (function() {

    let config = {
        totalPairs: 6,
        storageKey: 'scoreManager_v2_leaderboard',
        maxEntries: 10,
        uploadUrl: 'https://script.google.com/macros/s/AKfycbxVG3QeYIF6ja1FH_OPxXzccXoEYY7RHpwt-46meSjl0RseQjNTuGUVwf94_Iy9PdYnwQ/exec',
        uploadEnabled: true,
        apiKey: 'ThanksLRScoreManager#26',
        uploadTimeout: 5000
    };

    let currentScore = null;
    let currentGameId = 'default';
    let currentMode = 'normal';
    let uploadQueue = [];
    let isOnline = navigator.onLine;
    const VALID_GAME_IDS = [
        'kantin', 'kelas', 'lapanganolahraga', 'perpustakaan', 'toilet',
        'uks', 'safezoo', 'dangerzoo', 'bpmalefemale', 'professionmalefemale',
        'kantin_hard', 'kelas_hard', 'lapanganolahraga_hard', 'perpustakaan_hard',
        'toilet_hard', 'uks_hard', 'safezoo_hard', 'dangerzoo_hard',
        'bpmalefemale_hard', 'professionmalefemale_hard'
    ];

    const GAME_LABELS = {
        'kantin': '🍽️ Kantin',
        'kelas': '📚 Kelas',
        'lapanganolahraga': '⚽ Lapangan Olahraga',
        'perpustakaan': '📖 Perpustakaan',
        'toilet': '🚻 Toilet',
        'uks': '🏥 UKS',
        'safezoo': '🦁 Kebun Binatang',
        'dangerzoo': '☠️ Kebun Binatang Berbahaya',
        'bpmalefemale': '👫 BP Male Female',
        'professionmalefemale': '💼 Profession Male Female',
        'kantin_hard': '🍽️ Kantin Hard',
        'kelas_hard': '📚 Kelas Hard',
        'lapanganolahraga_hard': '⚽ Lapangan Olahraga Hard',
        'perpustakaan_hard': '📖 Perpustakaan Hard',
        'toilet_hard': '🚻 Toilet Hard',
        'uks_hard': '🏥 UKS Hard',
        'safezoo_hard': '🦁 Kebun Binatang Hard',
        'dangerzoo_hard': '☠️ Kebun Binatang Berbahaya Hard',
        'bpmalefemale_hard': '👫 BP Male Female Hard',
        'professionmalefemale_hard': '💼 Profession Male Female Hard'
    };
    /**
     * @param {Object} options - { gameId, totalPairs, maxEntries, mode, uploadUrl, uploadEnabled, apiKey }
     */
    function init(options = {}) {
        const gameId = options.gameId || 'default';
        
        if (!VALID_GAME_IDS.includes(gameId) && gameId !== 'default') {
            console.warn('⚠️ ScoreManager: gameId "' + gameId + '" tidak dikenal.');
        }

        config.totalPairs = options.totalPairs || config.totalPairs;
        config.maxEntries = options.maxEntries || config.maxEntries;
        
        if (options.uploadUrl) {
            config.uploadUrl = options.uploadUrl;
            config.uploadEnabled = true;
        }
        if (options.hasOwnProperty('uploadEnabled')) {
            config.uploadEnabled = options.uploadEnabled;
        }
        if (options.apiKey) {
            config.apiKey = options.apiKey;
        }
        config.uploadTimeout = options.uploadTimeout || config.uploadTimeout;

        currentGameId = gameId;
        currentMode = gameId.endsWith('_hard') ? 'hard' : 
                     (gameId !== 'default' ? 'normal' : (options.mode || 'normal'));

        setupConnectivityMonitoring();
        processUploadQueue();

        if (config.uploadEnabled && gameId !== 'default') {
            syncFromCloud(gameId).then(() => {
                if (typeof showLeaderboard === 'function') {
                    showLeaderboard();
                }
            });
        }

        console.log('✅ ScoreManager siap | Game:', GAME_LABELS[gameId] || gameId, 
                    '| Mode:', currentMode,
                    '| Cloud:', config.uploadEnabled ? '☁️ ON' : '💾 Local Only');
        
        return getStats();
    }

    function setupConnectivityMonitoring() {
        window.addEventListener('online', () => {
            isOnline = true;
            console.log('🌐 Online - Memproses upload tertunda...');
            processUploadQueue();
        });
        
        window.addEventListener('offline', () => {
            isOnline = false;
            console.log('📡 Offline - Skor akan diupload saat online');
        });
    }

    function getRank(attempts, totalPairs) {
        const tp = totalPairs || config.totalPairs;

        if (attempts <= tp) {
            return { label: 'Super Genius', emoji: '🌟', color: '#FFD700', textColor: '#8B6914' };
        }
        if (attempts <= tp + 4) {
            return { label: 'Genius', emoji: '⭐', color: '#4169E1', textColor: '#FFFFFF' };
        }
        if (attempts <= tp + 9) {
            return { label: 'Enough', emoji: '💪', color: '#FF6347', textColor: '#FFFFFF' };
        }
        return { label: 'Idiot', emoji: '😊', color: '#A9A9A9', textColor: '#FFFFFF' };
    }

    function getScores() {
        try {
            const data = localStorage.getItem(config.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.warn('⚠️ ScoreManager: Gagal membaca localStorage');
            return {};
        }
    }

    function saveScores(allScores) {
        try {
            localStorage.setItem(config.storageKey, JSON.stringify(allScores));
        } catch (e) {
            console.warn('⚠️ ScoreManager: Gagal menyimpan ke localStorage');
        }
    }

    function getLeaderboard(gameId) {
        const gid = gameId || currentGameId;
        const allScores = getScores();
        return allScores[gid] || [];
    }

    function saveLeaderboard(leaderboard) {
        const allScores = getScores();
        allScores[currentGameId] = leaderboard;
        saveScores(allScores);
    }

    function isTopScore(score, leaderboard, maxEntries) {
        if (leaderboard.length < maxEntries) return true;
        const lastEntry = leaderboard[leaderboard.length - 1];
        return score.attempts < lastEntry.attempts || 
               (score.attempts === lastEntry.attempts && score.timeSeconds < lastEntry.timeSeconds);
    }

    function addToLeaderboard(leaderboard, score) {
        const newBoard = [...leaderboard, score];
        newBoard.sort((a, b) => a.attempts !== b.attempts ? a.attempts - b.attempts : a.timeSeconds - b.timeSeconds);
        return newBoard.slice(0, config.maxEntries);
    }

    async function uploadScoreToCloud(scoreData) {
        if (!config.uploadEnabled || !config.uploadUrl) {
            return { success: false, reason: 'Upload not enabled' };
        }

        if (!isOnline) {
            uploadQueue.push(scoreData);
            console.log('📦 Skor di-queue untuk upload nanti');
            return { success: false, reason: 'Offline - queued' };
        }

        const payload = {
            apiKey: config.apiKey,
            gameId: currentGameId,
            mode: currentMode,
            date: new Date().toISOString().split('T')[0],
            name: scoreData.name || 'Anonymous',
            attempts: scoreData.attempts,
            timeSeconds: scoreData.timeSeconds,
            rank: scoreData.rank || '',
            userAgent: navigator.userAgent
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.uploadTimeout);
            const response = await fetch(config.uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('☁️ Skor berhasil dikirim ke cloud:', result);
            return { success: true, data: result };

        } catch (error) {
            console.warn('⚠️ Gagal upload ke cloud:', error.message);
            uploadQueue.push(scoreData);
            saveUploadQueue();
            return { success: false, reason: error.message };
        }
    }

    async function processUploadQueue() {
        if (!isOnline || uploadQueue.length === 0) return;
        
        console.log(`📤 Memproses ${uploadQueue.length} upload tertunda...`);
        
        const queue = [...uploadQueue];
        uploadQueue = [];
        
        for (const scoreData of queue) {
            await uploadScoreToCloud(scoreData);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        saveUploadQueue();
    }

    function saveUploadQueue() {
        try {
            localStorage.setItem('scoreManager_upload_queue', JSON.stringify(uploadQueue));
        } catch (e) {
            console.warn('⚠️ Gagal menyimpan upload queue');
        }
    }

    function loadUploadQueue() {
        try {
            const data = localStorage.getItem('scoreManager_upload_queue');
            if (data) {
                uploadQueue = JSON.parse(data);
            }
        } catch (e) {
            console.warn('⚠️ Gagal membaca upload queue');
        }
    }

    loadUploadQueue();

    async function syncFromCloud(gameId) {
        const gid = gameId || currentGameId;
        try {
            const response = await fetch(`${config.uploadUrl}?action=leaderboard&id=${encodeURIComponent(gid)}`);
            const data = await response.json();
            if (data.status === 'success' && Array.isArray(data.leaderboard)) {
                const allScores = getScores();
                allScores[gid] = data.leaderboard;
                saveScores(allScores);
                console.log(`✅ ${GAME_LABELS[gid]} disinkronkan dari cloud (${data.leaderboard.length} entry)`);
                return true;
            } else {
                console.warn('⚠️ Gagal sinkronisasi:', data.message || 'Data tidak valid');
                return false;
            }
        } catch (e) {
            console.warn('⚠️ Sinkronisasi gagal:', e.message);
            return false;
        }
    }

    async function resetCloudGame(gameId) {
        const gid = gameId || currentGameId;
        try {
            const response = await fetch(`${config.uploadUrl}?action=reset_game&id=${encodeURIComponent(gid)}&key=${encodeURIComponent(config.apiKey)}`);
            const data = await response.json();
            if (data.status === 'success') {
                const allScores = getScores();
                allScores[gid] = [];
                saveScores(allScores);
                console.log(`☁️ Data ${GAME_LABELS[gid]} direset di cloud & lokal.`);
                return true;
            } else {
                alert('Gagal mereset: ' + data.message);
                return false;
            }
        } catch (e) {
            alert('Gagal menghubungi server: ' + e.message);
            return false;
        }
    }

    async function submitScore(data) {
        const attempts = data.attempts || 0;
        const timeSeconds = data.timeSeconds || 0;
        const rankObj = getRank(attempts);

        currentScore = {
            name: data.playerName || '',
            attempts: attempts,
            timeSeconds: timeSeconds,
            rank: rankObj.label,
            rankEmoji: rankObj.emoji,
            mode: currentMode,
            date: new Date().toISOString().split('T')[0]
        };

        const leaderboard = getLeaderboard();
        const isTop = isTopScore(currentScore, leaderboard, config.maxEntries);

        if (isTop) {
            showNameInputModal(leaderboard);
        } else {
            await uploadScoreToCloud(currentScore);
            renderLeaderboard(leaderboard);
            showGameMessage(`😊 Skor: ${attempts} percobaan, ${formatTime(timeSeconds)} — Belum masuk Top ${config.maxEntries}`, 'info');
        }

        return { rank: rankObj, isTop, leaderboard };
    }

    function showNameInputModal(leaderboard) {
        removeModal();

        const overlay = document.createElement('div');
        overlay.id = 'sm-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.75); display: flex; align-items: center;
            justify-content: center; z-index: 10000;
            font-family: 'Reem Kufi', 'Amiri', sans-serif;
            animation: smFadeIn 0.3s ease-out;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(180deg, #faf6ef, #efe5d5);
            padding: 32px 28px; border-radius: 20px; text-align: center;
            max-width: 440px; width: 90%;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5),
                        0 0 0 6px #7a5540, 0 0 0 10px #5c3d2e, 0 0 0 14px #3e2216;
            animation: smSlideUp 0.4s cubic-bezier(0.22,1,0.36,1);
        `;

        const rankObj = getRank(currentScore.attempts);
        const gameLabel = GAME_LABELS[currentGameId] || currentGameId;
        const modeIcon = currentMode === 'hard' ? '🔥 ' : '';

        modal.innerHTML = `
            <div style="font-size:4rem;margin-bottom:8px;animation:smBounce 0.6s ease-out;">${rankObj.emoji}</div>
            <h3 style="color:#2c1810;margin:0 0 2px;font-size:1.6rem;">🏆 مَبْرُوكٌ 🏆</h3>
            <p style="color:#5c3d2e;margin:0 0 6px;">Selamat! Kamu masuk Top ${config.maxEntries}</p>
            <div style="background:${rankObj.color};color:${rankObj.textColor};display:inline-block;
                        padding:6px 18px;border-radius:25px;font-weight:700;font-size:1.2rem;margin-bottom:10px;">
                ${rankObj.emoji} ${rankObj.label}
            </div>
            <p style="color:#3e2a1e;margin:4px 0;font-size:0.95rem;">
                ${modeIcon}${gameLabel}<br>
                ⏱️ ${formatTime(currentScore.timeSeconds)} | 🔄 ${currentScore.attempts} percobaan
            </p>
            <div style="margin:8px 0;font-size:0.8rem;color:#7a6a5a;" id="sm-cloud-status">
                ${config.uploadEnabled ? '☁️ Skor akan dikirim ke cloud' : '💾 Skor disimpan lokal'}
            </div>
            <input type="text" id="sm-name-input" placeholder="Tulis nama kamu..." 
                   maxlength="20" autocomplete="off"
                   style="width:100%;padding:14px 18px;border-radius:30px;border:2px solid #d4c4a8;
                          font-size:1.15rem;text-align:center;margin:12px 0;outline:none;box-sizing:border-box;
                          font-family:'Reem Kufi',sans-serif;transition:border-color 0.3s;">
            <br>
            <button id="sm-save-btn" style="background:linear-gradient(180deg,#7a5540,#5c3d2e);color:#f5e6d3;
                border:2px solid #3e2216;font-size:1.15rem;font-weight:700;padding:14px 36px;
                border-radius:40px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.3);
                transition:all 0.3s;margin:4px;">💾 Simpan Nama</button>
            <button id="sm-skip-btn" style="background:transparent;color:#8a7a6a;border:1px solid #c4b49a;
                font-size:0.95rem;padding:10px 24px;border-radius:40px;cursor:pointer;
                transition:all 0.3s;margin:4px;">👤 Anonymous</button>
        `;

        const styleEl = document.createElement('style');
        styleEl.textContent = `
            @keyframes smFadeIn { from{opacity:0} to{opacity:1} }
            @keyframes smSlideUp { from{transform:translateY(40px) scale(0.9);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
            @keyframes smBounce { 0%{transform:scale(0)} 50%{transform:scale(1.3)} 100%{transform:scale(1)} }
            #sm-save-btn:hover { background:linear-gradient(180deg,#8c6a50,#6b4830)!important; transform:translateY(-3px)!important; }
            #sm-skip-btn:hover { background:rgba(0,0,0,0.05)!important; }
            #sm-name-input:focus { border-color:#7a5540!important; box-shadow:0 0 0 3px rgba(122,85,64,0.2)!important; }
        `;

        overlay.appendChild(styleEl);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(() => {
            const input = document.getElementById('sm-name-input');
            if (input) input.focus();
        }, 200);

        document.getElementById('sm-save-btn').addEventListener('click', () => saveScoreFromModal(leaderboard));
        document.getElementById('sm-skip-btn').addEventListener('click', () => {
            currentScore.name = 'Anonymous';
            finishScoreSubmission(leaderboard);
        });
        document.getElementById('sm-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveScoreFromModal(leaderboard);
        });
    }

    async function saveScoreFromModal(leaderboard) {
        const nameInput = document.getElementById('sm-name-input');
        currentScore.name = nameInput.value.trim() || 'Anonymous';
        await finishScoreSubmission(leaderboard);
    }

    async function finishScoreSubmission(leaderboard) {
        const updatedBoard = addToLeaderboard(leaderboard, currentScore);
        saveLeaderboard(updatedBoard);
        
        const cloudStatus = document.getElementById('sm-cloud-status');
        if (config.uploadEnabled && cloudStatus) {
            cloudStatus.textContent = '☁️ Mengirim skor...';
            const result = await uploadScoreToCloud(currentScore);
            if (result.success) {
                cloudStatus.textContent = '✅ Skor tersimpan di cloud!';
                cloudStatus.style.color = '#2d7d46';
            } else {
                cloudStatus.textContent = '📦 Skor akan dikirim saat online';
                cloudStatus.style.color = '#8a6a3a';
            }
        }
        
        removeModal();
        renderLeaderboard(updatedBoard);
        showGameMessage('✅ Selamat! Kamu masuk dalam TOP SCORE', 'success');
    }

    function removeModal() {
        const existing = document.getElementById('sm-overlay');
        if (existing) existing.remove();
    }

    function renderLeaderboard(leaderboard) {
        let container = document.getElementById('leaderboard-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'leaderboard-container';
            container.style.cssText = `
                margin-top:18px;text-align:center;
                background:linear-gradient(180deg,#faf6ef,#efe5d5);
                padding:18px 18px 14px;border-radius:16px;
                border:2px solid #d4c4a8;
                box-shadow:inset 0 2px 6px rgba(0,0,0,0.06),0 3px 12px rgba(0,0,0,0.1);
                font-family:'Reem Kufi','Amiri',sans-serif;
            `;
            const gameContainer = document.querySelector('.game-container');
            (gameContainer || document.body).appendChild(container);
        }

        const gameLabel = GAME_LABELS[currentGameId] || currentGameId;
        const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
        const modeIcon = currentMode === 'hard' ? '🔥 ' : '';

        let html = `<h4 style="color:#2c1810;margin:0 0 4px;font-size:1.2rem;">🏆 Top ${config.maxEntries} Terbaik</h4>`;
        html += `<p style="color:#6b4c3b;margin:0 0 10px;font-size:0.85rem;">${modeIcon}${gameLabel}</p>`;
        html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.85rem;color:#3e2a1e;">';
        html += '<thead><tr style="border-bottom:2px solid #d4c4a8;">';
        html += '<th style="padding:7px 4px;">#</th><th style="padding:7px 4px;">Nama</th>';
        html += '<th style="padding:7px 4px;">🔄</th><th style="padding:7px 4px;">⏱️</th>';
        html += '<th style="padding:7px 4px;">Gelar</th></tr></thead><tbody>';

        if (leaderboard.length === 0) {
            html += '<tr><td colspan="5" style="padding:18px;color:#8a7a6a;font-style:italic;">🎮 Belum ada skor... Ayo main</td></tr>';
        } else {
            leaderboard.forEach((entry, i) => {
                const isCurrent = currentScore && entry.attempts === currentScore.attempts &&
                    entry.timeSeconds === currentScore.timeSeconds && entry.name === currentScore.name;
                const highlight = isCurrent ? 'background:#fffde7;font-weight:700;border-radius:6px;' : '';
                const rankEmoji = entry.rankEmoji || getRank(entry.attempts).emoji;

                html += `<tr style="border-bottom:1px solid #e8dcc8;${highlight}">`;
                html += `<td style="padding:9px 4px;font-size:1.1rem;">${medals[i] || (i+1)}</td>`;
                html += `<td style="padding:9px 4px;">${escapeHTML(entry.name)}</td>`;
                html += `<td style="padding:9px 4px;">${entry.attempts}x</td>`;
                html += `<td style="padding:9px 4px;">${formatTime(entry.timeSeconds)}</td>`;
                html += `<td style="padding:9px 4px;font-size:0.75rem;">${rankEmoji} ${entry.rank}</td></tr>`;
            });
        }

        html += '</tbody></table></div>';
        
        if (config.uploadEnabled) {
            html += `<div style="margin-top:8px;font-size:0.7rem;color:#8a7a6a;">Cloud Sync ☁️</div>`;
        }
        
        container.innerHTML = html;
        container.style.display = 'block';
    }

    function showLeaderboard() {
        renderLeaderboard(getLeaderboard());
    }

    function formatTime(totalSeconds) {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showGameMessage(msg, type) {
        const messageEl = document.getElementById('message');
        if (messageEl) {
            messageEl.innerHTML = msg;
            messageEl.className = 'message ' + (type || '');
        }
    }

    function getStats() {
        const leaderboard = getLeaderboard();
        return {
            gameId: currentGameId,
            gameLabel: GAME_LABELS[currentGameId] || currentGameId,
            mode: currentMode,
            totalEntries: leaderboard.length,
            maxEntries: config.maxEntries,
            bestScore: leaderboard.length > 0 ? leaderboard[0] : null,
            leaderboard: leaderboard,
            cloudEnabled: config.uploadEnabled,
            uploadQueueSize: uploadQueue.length
        };
    }

    function getAllStats() {
        const allScores = getScores();
        const stats = {};
        Object.keys(allScores).forEach(gameId => {
            const lb = allScores[gameId];
            stats[gameId] = {
                gameLabel: GAME_LABELS[gameId] || gameId,
                totalEntries: lb.length,
                bestScore: lb.length > 0 ? lb[0] : null
            };
        });
        return stats;
    }

    function exportAsCSV(gameId) {
        const gid = gameId || currentGameId;
        const leaderboard = getLeaderboard(gid);
        
        let csv = 'Rank,Nama,Percobaan,Waktu,Gelar,Mode,Tanggal\n';
        leaderboard.forEach((entry, i) => {
            csv += `${i+1},"${entry.name}",${entry.attempts},${formatTime(entry.timeSeconds)},${entry.rank},${entry.mode},${entry.date}\n`;
        });
        
        return csv;
    }

    function downloadCSV(gameId) {
        const csv = exportAsCSV(gameId);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `leaderboard_${gameId || currentGameId}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function resetLeaderboard() {
        const gameLabel = GAME_LABELS[currentGameId] || currentGameId;
        if (confirm(`⚠️ Hapus semua skor untuk "${gameLabel}"?`)) {
            const allScores = getScores();
            allScores[currentGameId] = [];
            saveScores(allScores);
            currentScore = null;
            showLeaderboard();
            showGameMessage('🗑️ Papan skor telah direset', 'info');
        }
    }

    function resetAllLeaderboards() {
        if (confirm('⚠️⚠️ Hapus SEMUA skor dari SEMUA game?')) {
            localStorage.removeItem(config.storageKey);
            currentScore = null;
            showLeaderboard();
            showGameMessage('🗑️ Semua papan skor telah dihapus', 'info');
        }
    }

    function resetLeaderboardByMode(mode) {
        const label = mode === 'hard' ? 'Hard 🔥' : 'Normal';
        if (confirm(`⚠️ Hapus SEMUA skor mode ${label}?`)) {
            const allScores = getScores();
            Object.keys(allScores).forEach(gameId => {
                const isHard = gameId.endsWith('_hard');
                if ((mode === 'hard' && isHard) || (mode === 'normal' && !isHard)) {
                    allScores[gameId] = [];
                }
            });
            saveScores(allScores);
            currentScore = null;
            showLeaderboard();
            showGameMessage(`🗑️ Semua skor mode ${label} telah dihapus`, 'info');
        }
    }

    function retryUploads() {
        if (uploadQueue.length > 0) {
            console.log('🔄 Mencoba upload ulang...');
            processUploadQueue();
        } else {
            console.log('✅ Tidak ada upload tertunda');
        }
    }

    window.ScoreManager = {
        init,
        submitScore,
        showLeaderboard,
        getLeaderboard,
        getRank,
        getStats,
        getAllStats,
        formatTime,
        resetLeaderboard,
        resetAllLeaderboards,
        resetLeaderboardByMode,
        exportAsCSV,
        downloadCSV,
        retryUploads,
        syncFromCloud,
        resetCloudGame,
        GAME_LABELS,
        VALID_GAME_IDS,
        get isOnline() { return isOnline; },
        get uploadQueueSize() { return uploadQueue.length; }
    };

    return window.ScoreManager;

})();

if (typeof SCOREMANAGER_CONFIG !== 'undefined') {
    ScoreManager.init(SCOREMANAGER_CONFIG);
}