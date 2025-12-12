// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyBIvsnCd2apt1rNQAY1FESN_enD_UOte6w",
  authDomain: "photographer-contest.firebaseapp.com",
  projectId: "photographer-contest",
  storageBucket: "photographer-contest.firebasestorage.app",
  messagingSenderId: "147304996816",
  appId: "1:147304996816:web:f41d39a37485afa010a3d5"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// --- 2. STATE ---
let state = {
    currentUser: localStorage.getItem('photoUser') || null,
    isAdmin: false,
    activeContest: null,
    entries: [],
    archives: [],
    megaEntries: [],
    shuffledEntries: [],
    votes: { 1: null, 2: null, 3: null },
    hasVotedLocally: false
};

let entriesUnsubscribe = null;

const TEAM_MEMBERS = [
    "Ivan Pecek", 
    "Jack Wickes", 
    "James Wilson", 
    "James Denton",
    "Jemma Ridyard", 
    "Kacper Chodyra", 
    "Kyle Plastock", 
    "Lloyd Woodger",
    "Paul Udogaranya", 
    "Rainer Knappe", 
    "Raul Caramizaru",
    "Thomas McPherson", 
    "William Howe", 
    "Anthony Wilson"
];

// --- 3. INIT ---
document.addEventListener('DOMContentLoaded', () => {
    populateLoginDropdown();
    if (state.currentUser) {
        document.getElementById('loginName').value = state.currentUser;
        checkPinRequirement();
    }
});

// --- 4. AUTH & NAVIGATION ---
function populateLoginDropdown() {
    const s = document.getElementById('loginName');
    TEAM_MEMBERS.sort().forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n;
        s.appendChild(o);
    });
}

function checkPinRequirement() {
    const n = document.getElementById('loginName').value;
    document.getElementById('pinSection').classList.toggle('hidden', n !== "Anthony Wilson");
}

function attemptLogin() {
    const name = document.getElementById('loginName').value;
    if (!name) return;
    
    if (name === "Anthony Wilson") {
        if (document.getElementById('loginPin').value !== "673191") return alert("Wrong PIN");
        state.isAdmin = true;
    }

    state.currentUser = name;
    localStorage.setItem('photoUser', name);
    
    auth.signInAnonymously().then(() => {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userNameDisplay').textContent = name.split(' ')[0]; 
        if (state.isAdmin) document.getElementById('navAdmin').classList.remove('hidden');
        
        startDataSync(); 
        navTo('landing');
    });
}

function navTo(sectionId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    const target = document.getElementById(`view-${sectionId}`);
    if (target) target.classList.remove('hidden');

    // Background Logic: Show only on Login, Hide on Dashboard
    // But since this function runs INSIDE the dashboard context, we actually want to HIDE it here.
    // The background is already on <body> or fixed div.
    // We want the photo background GONE for readability inside the app.
    const bg = document.getElementById('dynamicBg');
    const grad = document.getElementById('gradientOverlay');
    
    // We keep opacity low/off for dashboard
    bg.classList.add('opacity-0');
    bg.classList.remove('opacity-60');
    
    // Make gradient fully opaque dark for readability
    grad.classList.remove('from-gray-900', 'via-gray-900/70', 'to-gray-900/50');
    grad.classList.add('bg-gray-900'); // Solid color

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isTarget = btn.dataset.target === sectionId;
        btn.className = `nav-btn flex flex-col items-center justify-center w-full h-full transition ${isTarget ? 'text-[#94c120]' : 'text-gray-600'}`;
        const icon = btn.querySelector('span');
        if(isTarget) icon.classList.add('drop-shadow-[0_0_8px_rgba(148,193,32,0.5)]');
        else icon.classList.remove('drop-shadow-[0_0_8px_rgba(148,193,32,0.5)]');
    });

    if (sectionId === 'gallery') renderGallery();
    if (sectionId === 'archives') renderArchives();
    if (sectionId === 'leaderboard') renderLeaderboard();
}

// --- 5. DATA ENGINE (FIXED) ---
function startDataSync() {
    db.collection("contests").onSnapshot(snapshot => {
        if (snapshot.empty) {
            state.activeContest = null;
            state.entries = [];
            if(entriesUnsubscribe) entriesUnsubscribe();
            updateHomeUI(null); 
            renderGallery();
            return;
        }

        const allContests = snapshot.docs.map(d => ({...d.data(), id: d.id}));
        allContests.sort((a, b) => b.id.localeCompare(a.id));

        const latest = allContests[0];
        
        // Check if ID changed to force re-sync
        const idChanged = !state.activeContest || state.activeContest.id !== latest.id;

        if (latest.status === 'closed') {
             state.activeContest = null;
             state.entries = [];
             if(entriesUnsubscribe) entriesUnsubscribe();
             updateHomeUI(null);
             renderGallery();
        } else {
             state.activeContest = latest;
             const userKey = `voted_${latest.id}_${state.currentUser}`;
             state.hasVotedLocally = !!localStorage.getItem(userKey);
             updateHomeUI(latest);
             if(idChanged) syncEntries(latest.id);
        }
    });

    // Sync Archives separateley
    db.collection("archives").onSnapshot(snap => {
        state.archives = snap.docs.map(d => d.data()).sort((a,b) => b.id.localeCompare(a.id));
    });
}

function syncEntries(contestId) {
    if (entriesUnsubscribe) entriesUnsubscribe();

    entriesUnsubscribe = db.collection("contests").doc(contestId).collection("entries").onSnapshot(snap => {
        state.entries = snap.docs.map(d => d.data());
        
        // Shuffle only if needed (on first load or reset)
        if (state.shuffledEntries.length === 0 || state.shuffledEntries.length !== state.entries.length) {
            state.shuffledEntries = [...state.entries];
            for (let i = state.shuffledEntries.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [state.shuffledEntries[i], state.shuffledEntries[j]] = [state.shuffledEntries[j], state.shuffledEntries[i]];
            }
        }
        
        if (!document.getElementById('view-gallery').classList.contains('hidden')) {
            renderGallery();
        }
    });
}

// --- 6. UI UPDATERS ---
function updateHomeUI(contest) {
    const title = document.getElementById('homeMainTitle');
    const badge = document.getElementById('homeStatusBadge');
    const desc = document.getElementById('homeMainDesc');
    const endBtn = document.getElementById('btnEndContest');

    if (!contest || contest.status === 'closed') {
        title.textContent = "No Contest Active";
        badge.textContent = "Idle";
        badge.className = "inline-block px-3 py-1 rounded-full bg-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wider mb-3";
        desc.textContent = "Check back later or view archives.";
        
        if(endBtn) {
            endBtn.disabled = true;
            endBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        return;
    }

    // Active Contest Logic
    if(endBtn) {
        endBtn.disabled = false;
        endBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    title.textContent = contest.monthName;
    
    if (contest.status === 'voting') {
        if (state.hasVotedLocally) {
            badge.textContent = "Votes Submitted";
            badge.className = "inline-block px-3 py-1 rounded-full bg-green-900/50 text-green-400 text-xs font-bold uppercase tracking-wider mb-3";
            desc.textContent = "Thanks for voting! View the gallery.";
        } else {
            badge.textContent = "Voting Open";
            badge.className = "inline-block px-3 py-1 rounded-full bg-[#94c120]/20 text-[#94c120] text-xs font-bold uppercase tracking-wider mb-3";
            desc.textContent = "Tap 'Go to Gallery' to cast your votes.";
        }
    }
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';
    
    if(!state.activeContest || state.entries.length === 0) {
        grid.innerHTML = `<div class="col-span-3 text-center text-gray-500 py-10">Waiting for photos...</div>`;
        return;
    }

    const isVoting = state.activeContest.status === 'voting';
    const isLocked = state.hasVotedLocally;
    
    // STRICT Voting Mode Check
    const blindMode = isVoting && !isLocked;
    const list = blindMode ? state.shuffledEntries : state.entries;

    document.getElementById('galleryTitle').textContent = isLocked ? "Gallery (Results Pending)" : "Cast Your Votes";
    document.getElementById('voteCounter').textContent = isLocked ? "Completed" : `Votes: ${Object.values(state.votes).filter(x=>x).length}/3`;

    list.forEach(entry => {
        const isMine = entry.photographer === state.currentUser;
        
        // Find Rank
        let rank = 0;
        if(state.votes[1] === entry.id) rank = 1;
        if(state.votes[2] === entry.id) rank = 2;
        if(state.votes[3] === entry.id) rank = 3;

        // Styles
        let borderClass = 'border-gray-700';
        let opacityClass = 'opacity-100';
        
        if (rank === 1) borderClass = 'border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]';
        if (rank === 2) borderClass = 'border-gray-300 ring-2 ring-gray-300';
        if (rank === 3) borderClass = 'border-orange-500 ring-2 ring-orange-500';
        
        // If we have 3 votes and this isn't one of them, fade it out slightly
        const votesCast = Object.values(state.votes).filter(x=>x).length;
        if (votesCast === 3 && rank === 0 && !isLocked) opacityClass = 'opacity-40 grayscale';

        const el = document.createElement('div');
        el.className = `bg-gray-800 rounded-xl overflow-hidden border transition-all duration-300 transform ${borderClass} ${opacityClass}`;
        
        // Interaction Logic: Lightbox Always Active
        
        el.innerHTML = `
            <div class="relative bg-gray-900 group cursor-pointer" onclick="viewImage('${entry.url}')">
                <img src="${entry.url}" loading="lazy" class="w-full h-auto object-contain">
                ${isMine ? '<span class="absolute top-2 right-2 bg-[#94c120] text-black text-[10px] font-bold px-2 py-1 rounded">YOU</span>' : ''}
            </div>
            
            ${ (!blindMode || isMine) ? `<div class="p-2 text-center text-xs font-bold text-gray-400 border-t border-gray-700">${entry.photographer}</div>` : '' }

            ${ (blindMode && !isMine) ? `
                <div class="p-2 flex gap-1 justify-center bg-gray-800">
                    <button onclick="castVote(1, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===1 ? 'bg-[#94c120] text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">1st</button>
                    <button onclick="castVote(2, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===2 ? 'bg-gray-200 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">2nd</button>
                    <button onclick="castVote(3, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===3 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">3rd</button>
                </div>
            ` : '' }
        `;
        grid.appendChild(el);
    });

    // Toggle Submit Button
    const votes = Object.values(state.votes).filter(x=>x).length;
    const btn = document.getElementById('submitBtn');
    if(votes === 3 && !isLocked) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

function castVote(rank, id) {
    if(state.votes[rank] === id) {
        state.votes[rank] = null; // Toggle off
    } else {
        // Remove ID from other slots if present
        if(state.votes[1]===id) state.votes[1]=null;
        if(state.votes[2]===id) state.votes[2]=null;
        if(state.votes[3]===id) state.votes[3]=null;
        
        state.votes[rank] = id; // Set new
    }
    renderGallery();
}

async function submitVotes() {
    if(!confirm("Submit these 3 votes? This cannot be undone.")) return;
    
    await db.collection("contests").doc(state.activeContest.id).collection("votes").doc(state.currentUser).set({
        voter: state.currentUser,
        votes: state.votes,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    const userKey = `voted_${state.activeContest.id}_${state.currentUser}`;
    localStorage.setItem(userKey, 'true');
    state.hasVotedLocally = true;
    
    navTo('landing');
    alert("Votes Submitted Successfully! 🚀");
}

// --- 7. LEADERBOARD & ARCHIVES ---
function renderLeaderboard() {
    // 1. Calculate Historical Points
    const calculateScores = (archivesSubset) => {
        let sc = {};
        TEAM_MEMBERS.forEach(m => sc[m] = { name: m, points: 0, gold: 0, silver: 0, bronze: 0, entries: 0 });
        
        archivesSubset.forEach(contest => {
            const findName = (id) => {
                const e = contest.entries.find(x => x.id === id);
                return e ? e.photographer : null;
            };
            const g = findName(contest.winners.gold);
            const s = findName(contest.winners.silver);
            const b = findName(contest.winners.bronze);
            
            if(g && sc[g]) { sc[g].points += 3; sc[g].gold++; }
            if(s && sc[s]) { sc[s].points += 2; sc[s].silver++; }
            if(b && sc[b]) { sc[b].points += 1; sc[b].bronze++; }
        });
        return sc;
    };

    const currentScores = calculateScores(state.archives);
    const prevScores = calculateScores(state.archives.slice(1));

    // Entry Counts (Iterate all archives)
    state.archives.forEach(a => {
        a.entries.forEach(e => {
            if(currentScores[e.photographer]) {
                currentScores[e.photographer].entries++;
            }
        });
    });

    const sortLogic = (a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        return b.bronze - a.bronze;
    };

    const getRank = (scoreObj, playerName) => {
        const sorted = Object.values(scoreObj).sort(sortLogic);
        const idx = sorted.findIndex(p => p.name === playerName);
        return idx === -1 ? null : idx + 1;
    };

    const sortedCurrent = Object.values(currentScores).sort(sortLogic);

    const grid = document.getElementById('leaderboardGrid');
    
    // Updated 12-Column Header
    grid.innerHTML = `
        <div class="grid grid-cols-12 gap-2 p-2 md:p-4 text-[10px] md:text-xs uppercase font-bold text-gray-500 tracking-widest border-b border-gray-800">
            <div class="col-span-2 flex items-center pl-2">Rank</div>
            <div class="col-span-3 flex items-center">Name</div>
            <div class="col-span-2 flex items-center justify-center">
                <span class="md:hidden">ENT</span><span class="hidden md:inline">Entries</span>
            </div>
            <div class="col-span-3 flex items-center justify-center">
                <span class="md:hidden">WINS</span><span class="hidden md:inline">Wins (G/S/B)</span>
            </div>
            <div class="col-span-2 flex items-center justify-end pr-2">
                <span class="md:hidden">PTS</span><span class="hidden md:inline">Total Pts</span>
            </div>
        </div>
    `;

    let lastRankDisplay = 0;
    sortedCurrent.forEach((p, idx) => {
        let currentRank = idx + 1;
        
        if (idx > 0) {
            const prev = sortedCurrent[idx - 1];
            const isTied = prev.points === p.points && 
                           prev.gold === p.gold && 
                           prev.silver === p.silver && 
                           prev.bronze === p.bronze;
            if (isTied) currentRank = lastRankDisplay;
        }
        lastRankDisplay = currentRank;

        const prevRank = getRank(prevScores, p.name);
        
        let trend = '<span class="text-gray-700 text-xs ml-1">➖</span>'; 
        if (prevRank) {
            if (currentRank < prevRank) trend = '<span class="text-green-500 text-xs ml-1">▲</span>'; 
            else if (currentRank > prevRank) trend = '<span class="text-red-500 text-xs ml-1">▼</span>'; 
        }

        let rankDisplay = `<span class="text-gray-500 font-mono font-bold text-sm md:text-lg">#${currentRank}</span>`;
        if(currentRank===1) rankDisplay = '<span class="text-lg md:text-2xl filter drop-shadow-lg">🥇</span>';
        if(currentRank===2) rankDisplay = '<span class="text-lg md:text-2xl filter drop-shadow-lg">🥈</span>';
        if(currentRank===3) rankDisplay = '<span class="text-lg md:text-2xl filter drop-shadow-lg">🥉</span>';

        const winsStr = `${p.gold} <span class="text-gray-700">/</span> ${p.silver} <span class="text-gray-700">/</span> ${p.bronze}`;

        grid.innerHTML += `
            <div class="grid grid-cols-12 gap-2 items-center p-2 md:p-4 border-b border-gray-800/50 hover:bg-white/5 transition group">
                <!-- Rank (2 cols) -->
                <div class="col-span-2 flex items-center pl-1 md:pl-2">
                    <div class="w-6 md:w-8 flex justify-center mr-1">${rankDisplay}</div>
                    <div>${trend}</div>
                </div>
                
                <!-- Name (3 cols) -->
                <div class="col-span-3 font-bold text-white text-xs md:text-sm truncate tracking-tight pl-1">
                    ${p.name}
                </div>

                <!-- Entries (2 cols) -->
                <div class="col-span-2 text-center text-gray-400 font-mono text-xs md:text-sm">
                    ${p.entries}
                </div>

                <!-- Wins (3 cols) -->
                <div class="col-span-3 font-mono text-[10px] md:text-xs text-gray-500 text-center whitespace-nowrap">
                    ${winsStr}
                </div>

                <!-- Points (2 cols) -->
                <div class="col-span-2 font-bold text-[#94c120] text-sm md:text-xl text-right pr-1 md:pr-2">
                    ${p.points}
                </div>
            </div>
        `;
    });
}

function renderArchives() {
    const grid = document.getElementById('archiveGrid');
    grid.innerHTML = '';
    document.getElementById('megaArchive').classList.add('hidden');
    document.getElementById('archiveDetailView').classList.add('hidden'); // Ensure detail is hidden
    
    state.archives.forEach(a => {
        const winEntry = a.entries.find(e => e.id === a.winners.gold);
        const thumb = winEntry ? winEntry.url : '';
        
        const card = document.createElement('div');
        card.className = "glass p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-gray-800 transition relative group";
        
        // Delete Button for Admins
        const deleteBtn = state.isAdmin ? 
            `<button onclick="event.stopPropagation(); deleteArchive('${a.id}')" class="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs hover:bg-red-600 hidden group-hover:block">×</button>` 
            : '';

        card.onclick = () => openArchiveDetail(a.id); // Pass ID
        card.innerHTML = `
            ${deleteBtn}
            <div class="h-16 w-16 bg-gray-800 rounded-lg bg-cover bg-center" style="background-image: url('${thumb}')"></div>
            <div>
                <h3 class="font-bold text-white">${a.monthName}</h3>
                <p class="text-xs text-gray-400">${a.entries.length} Entries</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openArchiveDetail(archiveId) {
    const archive = state.archives.find(a => a.id === archiveId);
    if(!archive) return;

    document.getElementById('archiveGrid').classList.add('hidden');
    const detail = document.getElementById('archiveDetailView');
    detail.classList.remove('hidden');
    
    // Find winners
    const g = archive.entries.find(e=>e.id===archive.winners.gold);
    const s = archive.entries.find(e=>e.id===archive.winners.silver);
    const b = archive.entries.find(e=>e.id===archive.winners.bronze);
    
    // Filter out winners for the "Rest" grid
    const winnerIds = [archive.winners.gold, archive.winners.silver, archive.winners.bronze];
    const rest = archive.entries.filter(e => !winnerIds.includes(e.id));

    detail.innerHTML = `
        <div class="mb-8 fade-in">
            <button onclick="closeArchiveDetail()" class="mb-6 px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-400 hover:text-white flex items-center gap-2 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                Back to History
            </button>
            
            <h2 class="text-3xl font-bold text-white mb-8 text-center tracking-tight">${archive.monthName} <span class="text-[#94c120]">Winners</span></h2>
            
            <!-- PODIUM -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <!-- Gold (First on mobile order for impact, center on desktop) -->
                <div class="order-1 md:order-2">
                    ${g ? `
                    <div class="bg-gray-800/50 rounded-2xl overflow-hidden border-2 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.2)]">
                        <img src="${g.url}" class="w-full h-64 md:h-80 object-cover" onclick="viewImage('${g.url}')">
                        <div class="p-4 text-center bg-[#151b2b]">
                            <div class="text-3xl mb-1">🥇</div>
                            <div class="font-bold text-white text-xl">${g.photographer}</div>
                            <div class="text-[#94c120] font-mono text-sm">${g.points || '?'} pts</div>
                        </div>
                    </div>` : ''}
                </div>

                <!-- Silver -->
                <div class="order-2 md:order-1 mt-4 md:mt-12">
                    ${s ? `
                    <div class="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-400">
                        <img src="${s.url}" class="w-full h-56 md:h-64 object-cover" onclick="viewImage('${s.url}')">
                        <div class="p-4 text-center bg-[#151b2b]">
                            <div class="text-2xl mb-1">🥈</div>
                            <div class="font-bold text-gray-200 text-lg">${s.photographer}</div>
                            <div class="text-gray-500 font-mono text-sm">${s.points || '?'} pts</div>
                        </div>
                    </div>` : ''}
                </div>

                <!-- Bronze -->
                <div class="order-3 md:order-3 mt-4 md:mt-12">
                    ${b ? `
                    <div class="bg-gray-800/50 rounded-2xl overflow-hidden border border-orange-500">
                        <img src="${b.url}" class="w-full h-56 md:h-64 object-cover" onclick="viewImage('${b.url}')">
                        <div class="p-4 text-center bg-[#151b2b]">
                            <div class="text-2xl mb-1">🥉</div>
                            <div class="font-bold text-gray-200 text-lg">${b.photographer}</div>
                            <div class="text-gray-500 font-mono text-sm">${b.points || '?'} pts</div>
                        </div>
                    </div>` : ''}
                </div>
            </div>

            <!-- THE REST -->
            <div class="flex items-center gap-4 mb-6">
                <div class="h-px bg-gray-800 flex-grow"></div>
                <h3 class="text-gray-500 text-sm font-bold uppercase tracking-widest">Other Entries</h3>
                <div class="h-px bg-gray-800 flex-grow"></div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                ${rest.map(e => `
                    <div class="bg-gray-800 overflow-hidden cursor-pointer relative group rounded-lg" onclick="viewImage('${e.url}')">
                        <img src="${e.url}" loading="lazy" class="w-full h-auto object-contain">
                        <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center flex-col p-2 text-center">
                            <span class="text-white font-bold text-xs">${e.photographer}</span>
                            ${e.points ? `<span class="text-[#94c120] text-xs font-mono mt-1">${e.points} pts</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    mega.innerHTML = podiumHTML;
}

function closeArchiveDetail() {
    document.getElementById('archiveDetailView').classList.add('hidden');
    document.getElementById('archiveGrid').classList.remove('hidden');
}

function loadMegaArchive() {
    document.getElementById('archiveGrid').classList.add('hidden');
    document.getElementById('megaArchive').classList.remove('hidden');
    filterMega('all');
}

function closeMegaArchive() {
    document.getElementById('megaArchive').classList.add('hidden');
    document.getElementById('archiveGrid').classList.remove('hidden');
}

function filterMega(type) {
    // Highlight active button
    ['all','winners','mine'].forEach(t => {
        const btn = document.getElementById(`filter-${t}`);
        if(t === type) {
            btn.className = "px-4 py-2 bg-[#94c120] text-black rounded-lg text-sm font-bold shadow-[0_0_10px_rgba(148,193,32,0.5)] whitespace-nowrap";
        } else {
            btn.className = "px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm font-bold whitespace-nowrap hover:text-white";
        }
    });

    const grid = document.getElementById('megaGrid');
    grid.innerHTML = '';

    let items = [];

    if (type === 'all') {
        state.archives.forEach(a => items.push(...a.entries));
        items.sort(() => Math.random() - 0.5);
    } 
    else if (type === 'winners') {
        state.archives.forEach(a => {
            const w = a.winners;
            const gold = a.entries.find(e=>e.id===w.gold);
            const silver = a.entries.find(e=>e.id===w.silver);
            const bronze = a.entries.find(e=>e.id===w.bronze);
            if(gold) items.push({...gold, rank: 1, month: a.monthName});
            if(silver) items.push({...silver, rank: 2, month: a.monthName});
            if(bronze) items.push({...bronze, rank: 3, month: a.monthName});
        });
        // Sort by newest archive first (implicit in archives order)
    } 
    else if (type === 'mine') {
        state.archives.forEach(a => {
            items.push(...a.entries.filter(e => e.photographer === state.currentUser));
        });
    }

    if(items.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No images found for this filter.</div>`;
        return;
    }

    items.forEach(img => {
        // For winners, maybe add a border?
        let border = '';
        if(type==='winners') {
            if(img.rank===1) border = 'border-2 border-yellow-400';
            if(img.rank===2) border = 'border-2 border-gray-300';
            if(img.rank===3) border = 'border-2 border-orange-500';
        }

        grid.innerHTML += `
            <div class="bg-gray-800 overflow-hidden cursor-pointer ${border}" onclick="viewImage('${img.url}')">
                <img src="${img.url}" loading="lazy" class="w-full h-auto object-cover hover:opacity-90 transition">
            </div>
        `;
    });
}

// --- 8. ADMIN ---
function showAdminPanel() { document.getElementById('view-admin').classList.remove('hidden'); }

async function adminCreateContest() {
    const n = document.getElementById('newContestName').value;
    const i = document.getElementById('newContestId').value;
    if(!n || !i) return;
    
    // Use 'voting' directly as requested
    await db.collection("contests").doc(i).set({ monthName: n, status: "voting" });
    alert("Created & Voting Opened!"); 
    document.getElementById('view-admin').classList.add('hidden');
    navTo('landing');
}

async function deleteArchive(id) {
    if(!confirm(`Delete history for ${id}? This cannot be undone.`)) return;
    
    try {
        await db.collection("contests").doc(id).delete();
        await db.collection("archives").doc(id).delete();
        
        // CLEANUP: LocalStorage & State
        localStorage.removeItem('voted_' + id + '_' + state.currentUser);
        
        if (state.activeContest && state.activeContest.id === id) {
            state.activeContest = null;
            state.entries = [];
            state.votes = {1: null, 2: null, 3: null};
            state.hasVotedLocally = false;
            
            if(entriesUnsubscribe) entriesUnsubscribe();
            
            renderGallery();
            updateHomeUI(null);
        }

        alert("Deleted.");
    } catch(e) {
        console.error(e);
        alert("Error deleting.");
    }
}

async function adminCheckVotes() {
    if (!state.activeContest) return alert("No active contest to check.");

    const list = document.getElementById('adminVoteList');
    
    // Toggle Logic
    if (!list.classList.contains('hidden')) {
        list.classList.add('hidden');
        return;
    }

    list.classList.remove('hidden');
    list.innerHTML = '<div class="text-xs text-gray-500 text-center">Loading...</div>';

    const snap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const voters = new Set(snap.docs.map(d => d.id)); // ID is username

    const voted = [];
    const pending = [];

    TEAM_MEMBERS.sort().forEach(m => {
        if (voters.has(m)) voted.push(m);
        else pending.push(m);
    });

    let html = `<div class="text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest text-center">Progress: <span class="text-white">${voted.length}</span> / ${TEAM_MEMBERS.length}</div>`;
    html += `<div class="grid grid-cols-2 gap-2 text-xs">`;

    voted.forEach(n => {
        html += `<div class="flex items-center gap-2 text-green-400"><span class="text-sm">✅</span> ${n}</div>`;
    });

    pending.forEach(n => {
        html += `<div class="flex items-center gap-2 text-red-400 opacity-60"><span class="text-sm">⏳</span> ${n}</div>`;
    });

    html += `</div>`;
    list.innerHTML = html;
    list.classList.remove('hidden'); // Ensure visible after load
}

async function adminFinalizeArchive() {
    if(!state.activeContest || !confirm("Are you sure? This will calculate votes and end the contest.")) return;

    const votesSnap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const votes = votesSnap.docs.map(d => d.data().votes);

    // Tally Points
    let tally = {};
    state.entries.forEach(e => {
        tally[e.id] = { points: 0, gold: 0, silver: 0, bronze: 0, id: e.id, ...e }; // Spread existing entry data
    });

    votes.forEach(v => {
        if(v['1'] && tally[v['1']]) { 
            tally[v['1']].points += 3; 
            tally[v['1']].gold += 1; 
        }
        if(v['2'] && tally[v['2']]) { 
            tally[v['2']].points += 2; 
            tally[v['2']].silver += 1;
        }
        if(v['3'] && tally[v['3']]) { 
            tally[v['3']].points += 1; 
            tally[v['3']].bronze += 1;
        }
    });

    const results = Object.values(tally).sort((a,b) => {
        const scoreDiff = b.points - a.points;
        if (scoreDiff !== 0) return scoreDiff; // 1. Winner has most points

        const goldDiff = b.gold - a.gold;
        if (goldDiff !== 0) return goldDiff; // 2. Winner has most Golds

        const silverDiff = b.silver - a.silver;
        return silverDiff; // 3. Winner has most Silvers
    });

    const gold = results[0] ? results[0].id : null;
    const silver = results[1] ? results[1].id : null;
    const bronze = results[2] ? results[2].id : null;

    if(!gold) return alert("No votes cast yet!");

    // Save with calculated points attached to entries!
    await db.collection("archives").doc(state.activeContest.id).set({
        id: state.activeContest.id,
        monthName: state.activeContest.monthName,
        winners: {gold, silver, bronze},
        entries: results // Save the sorted results which include points
    });

    await db.collection("contests").doc(state.activeContest.id).update({status:'closed'});

    alert("Contest Closed! Winners Calculated. 🏆");
    document.getElementById('view-admin').classList.add('hidden');
    
    location.reload(); 
}

function viewImage(url) {
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
}
