// STATE
let state = {
    currentUser: null,
    data: null,
    currentPhase: 'preview',
    hasVotedLocally: false,
    activeArchiveMonth: null,
    activeViewList: [], 
    votes: { 1: null, 2: null, 3: null },
    filters: { 1: false, 2: false, 3: false }
};

// INIT
document.addEventListener('DOMContentLoaded', () => {
    fetch('database.json')
        .then(res => res.json())
        .then(json => {
            state.data = json;
            checkLocalVoteHistory();
            determinePhase();
            setLandingBackground();
        })
        .catch(err => console.error("Database error:", err));
});

// --- LEADERBOARD LOGIC ---
function showLeaderboard() {
    hideAll();
    document.getElementById('leaderboardPage').classList.remove('hidden');
    
    let scores = {};
    state.data.teamMembers.forEach(member => {
        scores[member] = { name: member, total: 0, gold: 0, silver: 0, bronze: 0 };
    });

    state.data.archive.forEach(month => {
        const winners = month.winners;
        if (!winners) return;

        const findName = (id) => {
            const entry = month.entries.find(e => e.id === id);
            return entry ? entry.photographer : null;
        };

        const goldName = findName(winners.gold);
        const silverName = findName(winners.silver);
        const bronzeName = findName(winners.bronze);

        if (goldName && scores[goldName]) { scores[goldName].total += 3; scores[goldName].gold++; }
        if (silverName && scores[silverName]) { scores[silverName].total += 2; scores[silverName].silver++; }
        if (bronzeName && scores[bronzeName]) { scores[bronzeName].total += 1; scores[bronzeName].bronze++; }
    });

    const sorted = Object.values(scores).sort((a, b) => b.total - a.total);
    const grid = document.getElementById('leaderboardGrid');
    grid.innerHTML = '';

    sorted.forEach((p, index) => {
        let rowClass = "p-4 border-b border-gray-800 grid grid-cols-12 items-center hover:bg-gray-800/50 transition";
        let rankDisplay = `<span class="text-gray-500">#${index + 1}</span>`;
        
        if (index === 0) rankDisplay = `<span class="text-yellow-500 font-bold text-xl">🥇</span>`;
        if (index === 1) rankDisplay = `<span class="text-gray-300 font-bold text-xl">🥈</span>`;
        if (index === 2) rankDisplay = `<span class="text-orange-500 font-bold text-xl">🥉</span>`;

        if (p.total === 0 && index > 2) return; // Optional: Hide people with 0 points if not top 3

        grid.innerHTML += `
            <div class="${rowClass}">
                <div class="col-span-2 text-center">${rankDisplay}</div>
                <div class="col-span-6 font-medium text-white">${p.name}</div>
                <div class="col-span-2 text-center text-xs text-gray-500 tracking-widest">${p.gold} / ${p.silver} / ${p.bronze}</div>
                <div class="col-span-2 text-center text-xl font-bold text-blue-400">${p.total}</div>
            </div>
        `;
    });
}

// --- HELPER: SHUFFLE ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- LIGHTBOX ---
function viewImage(url) {
    const box = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    img.src = url;
    box.classList.remove('hidden');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
}

// --- VISUALS ---
function setLandingBackground() {
    if (state.data.archive && state.data.archive.length > 0) {
        const lastMonth = state.data.archive[0];
        const winnerId = lastMonth.winners.gold;
        const winnerEntry = lastMonth.entries.find(e => e.id === winnerId);
        if (winnerEntry) {
            document.getElementById('dynamicBg').style.backgroundImage = `url('${winnerEntry.filename}')`;
        }
    }
}

// --- PHASE LOGIC ---
function checkLocalVoteHistory() {
    if (!state.data.activeContest) return;
    const key = `voted_${state.data.activeContest.monthName}`;
    if (localStorage.getItem(key)) {
        state.hasVotedLocally = true;
    }
}

function determinePhase() {
    const dbStatus = state.data.config.status;
    
    if (state.hasVotedLocally) {
        state.currentPhase = 'voted';
        updateStatusBadge(`✅ You have voted for ${state.data.activeContest.monthName}`, 'green');
        document.getElementById('mainBtnTitle').textContent = "View Gallery (Voted)";
        document.getElementById('mainActionBtn').onclick = () => enterCurrentMonth();
        
    } else if (dbStatus === 'voting') {
        state.currentPhase = 'voting';
        updateStatusBadge(`🗳️ Voting Open: ${state.data.activeContest.monthName}`, 'blue');
        document.getElementById('mainBtnTitle').textContent = "Vote Now";
        document.getElementById('mainActionBtn').onclick = () => {
            initDropdown();
            hideAll();
            document.getElementById('loginModal').classList.remove('hidden');
        };

    } else {
        state.currentPhase = 'preview';
        updateStatusBadge(`📅 Upload / Preview Phase`, 'gray');
        document.getElementById('mainBtnTitle').textContent = "Preview Current Gallery";
        document.getElementById('mainActionBtn').onclick = () => enterCurrentMonth();
    }
}

function updateStatusBadge(text, color) {
    const el = document.getElementById('statusBadge');
    el.textContent = text;
    let colorClasses = "bg-gray-800 border-gray-600 text-gray-300";
    if (color === 'blue') colorClasses = "bg-blue-900/50 border-blue-500 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]";
    if (color === 'green') colorClasses = "bg-green-900/50 border-green-500 text-green-300";
    el.className = `mb-10 px-6 py-2 rounded-full border backdrop-blur-md text-sm font-mono shadow-lg ${colorClasses}`;
}

// --- NAVIGATION ---
function showArchiveHub() {
    hideAll();
    document.getElementById('archiveHub').classList.remove('hidden');
    
    const grid = document.getElementById('archiveGrid');
    grid.innerHTML = '';
    
    state.data.archive.forEach((arch, index) => {
        const btn = document.createElement('button');
        btn.className = "bg-gray-800 p-6 rounded-xl border border-gray-700 hover:bg-gray-700 hover:border-gray-500 transition text-left group shadow-lg";
        btn.onclick = () => loadArchiveMonth(index);
        
        const goldId = arch.winners.gold;
        const goldEntry = arch.entries.find(e => e.id === goldId);
        const thumb = goldEntry ? goldEntry.filename : '';

        const voters = arch.stats.votesCast;
        const totalPossible = arch.stats.totalVotersSnapshot || 13;
        const percent = Math.round((voters / totalPossible) * 100);

        btn.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-bold text-white group-hover:text-blue-400 transition">${arch.monthName}</h3>
                <span class="text-xs bg-gray-900 px-2 py-1 rounded text-gray-500 border border-gray-800">${percent}% Turnout</span>
            </div>
            ${thumb ? `<div class="h-32 w-full bg-cover bg-center rounded-lg opacity-60 group-hover:opacity-100 transition duration-500" style="background-image: url('${thumb}')"></div>` : ''}
        `;
        grid.appendChild(btn);
    });
}

function showUpload() {
    hideAll();
    document.getElementById('uploadPage').classList.remove('hidden');
}

function goHome() {
    hideAll();
    state.currentUser = null;
    state.votes = {1:null, 2:null, 3:null};
    resetFilters();
    document.getElementById('landingPage').classList.remove('hidden');
}

function hideAll() {
    ['landingPage', 'uploadPage', 'loginModal', 'app', 'archiveHub', 'adminModal', 'leaderboardPage'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
}

// --- MODES ---
function enterCurrentMonth() {
    hideAll();
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('contestTitle').textContent = state.data.activeContest.monthName;
    document.getElementById('submitBtn').classList.add('hidden');
    document.getElementById('filterBar').classList.add('hidden');
    
    // Only shuffle if it's empty (first load of the session) to keep it stable
    if(state.activeViewList.length === 0) {
        const rawEntries = [...state.data.activeContest.entries];
        state.activeViewList = shuffleArray(rawEntries);
    }

    if (state.currentPhase === 'voting') {
        document.getElementById('contestSubtitle').textContent = "Cast your votes (Names Hidden)";
        document.getElementById('submitBtn').classList.remove('hidden');
        renderGallery(state.activeViewList, false, true); 
    } else if (state.currentPhase === 'voted') {
        document.getElementById('contestSubtitle').textContent = "Votes Submitted. Gallery Locked.";
        renderGallery(state.activeViewList, false, false); 
    } else {
        document.getElementById('contestSubtitle').textContent = "Preview Mode (Voting Closed)";
        renderGallery(state.activeViewList, false, false); 
    }
    checkAdminAccess();
}

function loadArchiveMonth(index) {
    state.activeArchiveMonth = state.data.archive[index];
    state.activeViewList = [...state.activeArchiveMonth.entries];
    
    const winners = state.activeArchiveMonth.winners;
    if(winners) {
        state.activeViewList.sort((a, b) => {
            const getScore = (id) => id === winners.gold ? 3 : id === winners.silver ? 2 : id === winners.bronze ? 1 : 0;
            return getScore(b.id) - getScore(a.id);
        });
    }

    hideAll();
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('contestTitle').textContent = state.activeArchiveMonth.monthName;
    
    const stats = state.activeArchiveMonth.stats;
    let subtitle = "Official Results";
    if(stats) {
        const totalPossible = stats.totalVotersSnapshot || state.data.teamMembers.length;
        const percent = Math.round((stats.votesCast / totalPossible) * 100);
        subtitle += ` • ${stats.votesCast}/${totalPossible} Votes (${percent}%)`;
    }
    document.getElementById('contestSubtitle').textContent = subtitle;

    document.getElementById('submitBtn').classList.add('hidden');
    document.getElementById('filterBar').classList.add('hidden');
    document.getElementById('adminControls')?.classList.add('hidden'); 
    
    renderGallery(state.activeViewList, true, false, state.activeArchiveMonth.winners); 
}

function loadAllArchives() {
    hideAll();
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('contestTitle').textContent = "Full Archive";
    document.getElementById('contestSubtitle').textContent = "All Entries • All Time";
    document.getElementById('submitBtn').classList.add('hidden');
    document.getElementById('filterBar').classList.remove('hidden');
    renderAllGallery();
}

// --- ADMIN ---
function checkAdminAccess() {
    const adminBtn = document.getElementById('adminControls');
    if (state.currentUser === "Anthony Wilson") {
        adminBtn.classList.remove('hidden');
    } else {
        adminBtn.classList.add('hidden');
    }
}

function openAdminModal() {
    document.getElementById('adminModal').classList.remove('hidden');
}

function generateCloseJSON() {
    const goldId = parseInt(document.getElementById('adminGold').value);
    const silverId = parseInt(document.getElementById('adminSilver').value);
    const bronzeId = parseInt(document.getElementById('adminBronze').value);
    const votesCount = parseInt(document.getElementById('adminVotes').value);
    
    if(!goldId || !silverId || !bronzeId) return alert("Please enter all IDs");

    const newArchive = {
        monthName: state.data.activeContest.monthName,
        winners: { gold: goldId, silver: silverId, bronze: bronzeId },
        stats: {
            votesCast: votesCount,
            totalVotersSnapshot: state.data.teamMembers.length
        },
        entries: state.data.activeContest.entries
    };

    const jsonString = JSON.stringify(newArchive, null, 2);
    const output = document.getElementById('adminOutput');
    output.value = `${jsonString},`; 
    output.classList.remove('hidden');
}

// --- LOGIN & CORE ---
function initDropdown() {
    const select = document.getElementById('userSelect');
    select.innerHTML = '<option value="" disabled selected>Select Name...</option>';
    state.data.teamMembers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });
}

function login() {
    const val = document.getElementById('userSelect').value;
    if (!val) return;
    state.currentUser = val;
    hideAll();
    enterCurrentMonth();
}

// --- RENDERING ---
function toggleFilter(rank) {
    state.filters[rank] = !state.filters[rank];
    const colors = { 1: 'yellow-500', 2: 'gray-300', 3: 'orange-500' };
    const btn = document.getElementById(rank === 1 ? 'filterGold' : rank === 2 ? 'filterSilver' : 'filterBronze');
    
    if (state.filters[rank]) {
        btn.classList.remove('opacity-50');
        btn.classList.add('bg-gray-700', 'border-' + colors[rank], 'text-' + colors[rank]);
    } else {
        btn.classList.add('opacity-50');
        btn.classList.remove('bg-gray-700', 'border-' + colors[rank], 'text-' + colors[rank]);
    }
    renderAllGallery();
}

function resetFilters() {
    state.filters = { 1: false, 2: false, 3: false };
    ['filterGold', 'filterSilver', 'filterBronze'].forEach(id => {
        document.getElementById(id).classList.add('opacity-50');
        document.getElementById(id).classList.remove('bg-gray-700');
    });
    if (document.getElementById('contestTitle').textContent === "Full Archive") {
        renderAllGallery();
    }
}

function renderAllGallery() {
    let allEntries = [];
    state.data.archive.forEach(month => {
        month.entries.forEach(entry => {
            let rank = 0;
            if (entry.id === month.winners.gold) rank = 1;
            if (entry.id === month.winners.silver) rank = 2;
            if (entry.id === month.winners.bronze) rank = 3;
            allEntries.push({ ...entry, monthName: month.monthName, rank: rank });
        });
    });

    const isFiltering = state.filters[1] || state.filters[2] || state.filters[3];
    if (isFiltering) {
        allEntries = allEntries.filter(e => state.filters[e.rank] === true);
    }
    renderGallery(allEntries, true, false, null, true);
}

function renderGallery(entries, isResults, allowVoting, specificWinners = null, isMixed = false) {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';

    entries.forEach(entry => {
        const isMine = entry.photographer === state.currentUser;
        
        // --- RANK CALCULATION ---
        let rank = 0;
        let userSelectionRank = 0;

        // 1. Result/Archive Mode Rank
        if (isMixed) {
            rank = entry.rank;
        } else if (specificWinners) {
            if (entry.id === specificWinners.gold) rank = 1;
            else if (entry.id === specificWinners.silver) rank = 2;
            else if (entry.id === specificWinners.bronze) rank = 3;
        }

        // 2. Voting Mode Rank (User's personal selection)
        if (allowVoting) {
            if (state.votes[1] === entry.id) userSelectionRank = 1;
            if (state.votes[2] === entry.id) userSelectionRank = 2;
            if (state.votes[3] === entry.id) userSelectionRank = 3;
        }

        // --- BORDER LOGIC ---
        // Prioritize: Result Rank > User Selection Rank > Default Gray
        let border = 'border-gray-700';
        let glow = '';

        if (isResults && rank > 0) {
            if (rank === 1) { border = 'border-yellow-500 ring-2 ring-yellow-500'; glow = 'shadow-[0_0_20px_rgba(234,179,8,0.5)]'; }
            else if (rank === 2) { border = 'border-gray-300 ring-2 ring-gray-300'; }
            else if (rank === 3) { border = 'border-orange-600 ring-2 ring-orange-600'; }
        } 
        else if (allowVoting && userSelectionRank > 0) {
            if (userSelectionRank === 1) { border = 'border-yellow-500 ring-4 ring-yellow-500'; glow = 'shadow-[0_0_20px_rgba(234,179,8,0.5)] transform scale-[1.02]'; }
            else if (userSelectionRank === 2) { border = 'border-gray-400 ring-4 ring-gray-400'; glow = 'shadow-[0_0_20px_rgba(156,163,175,0.5)] transform scale-[1.02]'; }
            else if (userSelectionRank === 3) { border = 'border-orange-500 ring-4 ring-orange-500'; glow = 'shadow-[0_0_20px_rgba(249,115,22,0.5)] transform scale-[1.02]'; }
        }

        // --- CARD HTML ---
        const card = document.createElement('div');
        card.className = `bg-gray-800 rounded-xl overflow-hidden shadow-lg border transition-all duration-300 ${border} ${glow} flex flex-col`;
        const idDisplay = `#${entry.id}`;

        // Overlay for Results
        let overlay = '';
        if (isResults && rank > 0) {
            const label = rank===1 ? '🏆 1st Place' : rank===2 ? '🥈 2nd Place' : '🥉 3rd Place';
            const color = rank===1 ? 'bg-yellow-500 text-black' : rank===2 ? 'bg-gray-300 text-black' : 'bg-orange-600 text-white';
            overlay = `<div class="absolute top-0 w-full ${color} font-bold text-center py-1 z-10">${label}</div>`;
        }

        card.innerHTML = `
            <div class="relative group h-64 overflow-hidden cursor-zoom-in" onclick="viewImage('${entry.filename}')">
                ${overlay}
                <img src="${entry.filename}" class="w-full h-full object-cover transition duration-500 group-hover:scale-110">
                ${allowVoting && isMine ? '<div class="absolute top-2 right-2 bg-red-600 px-2 rounded text-xs z-10">Yours</div>' : ''}
                ${!isResults ? `<div class="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-xs backdrop-blur-md z-10 font-mono">${idDisplay}</div>` : ''}
            </div>
            
            <div class="p-4 flex-grow flex flex-col justify-between">
                <div>
                    ${!allowVoting ? `<h3 class="font-bold text-white text-lg">${entry.photographer}</h3>` : ''}
                    ${isMixed ? `<p class="text-xs text-gray-400 mt-1">${entry.monthName}</p>` : ''}
                </div>
                
                ${allowVoting && !isMine ? `
                    <div class="mt-3">
                        ${renderVoteButtons(entry.id, userSelectionRank)}
                    </div>
                ` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
    
    if(allowVoting) updateSubmitButton();
}

function renderVoteButtons(id, currentSelection) {
    // If NOT selected, show 3 small buttons
    if (currentSelection === 0) {
        return `
            <div class="flex gap-1 transition-all duration-300">
                <button onclick="vote(1, ${id})" class="flex-1 py-2 text-xs rounded font-bold bg-gray-700 text-gray-400 hover:bg-yellow-900 hover:text-yellow-500 hover:border-yellow-500 border border-transparent transition">🥇 3pts</button>
                <button onclick="vote(2, ${id})" class="flex-1 py-2 text-xs rounded font-bold bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-300 hover:border-gray-400 border border-transparent transition">🥈 2pts</button>
                <button onclick="vote(3, ${id})" class="flex-1 py-2 text-xs rounded font-bold bg-gray-700 text-gray-400 hover:bg-orange-900 hover:text-orange-500 hover:border-orange-500 border border-transparent transition">🥉 1pt</button>
            </div>
        `;
    } 
    // If SELECTED, show 1 big expanded button
    else {
        const colorClass = currentSelection === 1 ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' 
                         : currentSelection === 2 ? 'bg-gray-300 text-black shadow-lg shadow-gray-300/20' 
                         : 'bg-orange-500 text-white shadow-lg shadow-orange-500/20';
        
        const label = currentSelection === 1 ? '🥇 1st Place Selected' : currentSelection === 2 ? '🥈 2nd Place Selected' : '🥉 3rd Place Selected';

        return `
            <div class="transition-all duration-300">
                <button onclick="vote(${currentSelection}, ${id})" class="w-full py-3 text-sm font-bold rounded ${colorClass} hover:opacity-90 transition transform scale-105">
                    ${label} (Tap to Undo)
                </button>
            </div>
        `;
    }
}

function vote(rank, id) {
    if (state.votes[rank] === id) state.votes[rank] = null;
    else {
        [1,2,3].forEach(r => { if(state.votes[r] === id) state.votes[r] = null; });
        state.votes[rank] = id;
    }
    // Re-render using the STABLE view list (no jumping)
    renderGallery(state.activeViewList, false, true);
}

function updateSubmitButton() {
    const count = [1,2,3].filter(r => state.votes[r]).length;
    document.getElementById('voteCountBadge').textContent = `${count}/3`;
    const btn = document.getElementById('submitBtn');
    if(count === 3) {
        btn.classList.remove('hidden');
        btn.disabled = false;
    } else {
        btn.classList.add('hidden');
        btn.disabled = true;
    }
}

function submitVotes() {
    const getDetails = (r) => {
        const e = state.data.activeContest.entries.find(x => x.id === state.votes[r]);
        const pts = r === 1 ? '3pts' : r === 2 ? '2pts' : '1pt';
        return `Rank ${r} (${pts}): ID #${e.id} by ${e.photographer}`;
    };
    const body = `Voter: ${state.currentUser}\n\n${getDetails(1)}\n${getDetails(2)}\n${getDetails(3)}`;
    window.open(`mailto:${state.data.config.adminEmail}?subject=Votes&body=${encodeURIComponent(body)}`);
    
    const key = `voted_${state.data.activeContest.monthName}`;
    localStorage.setItem(key, 'true');
    
    alert("Vote submitted! The gallery will now lock for you.");
    location.reload();
}