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

const TEAM_MEMBERS = [
    "Ivan Pecek", "Jack Wickes", "James Wilson", "James Denton",
    "Jemma Ridyard", "Kacper Chodyra", "Kyle Plastock", "Lloyd Woodger",
    "Paul Udogaranya", "Rainer Knappe", "Raul Caramizaru",
    "Thomas McPherson", "William Howe", "Anthony Wilson"
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
        
        // Hide dynamic BG when inside the app
        document.getElementById('dynamicBg').classList.add('hidden');

        if (state.isAdmin) document.getElementById('navAdmin').classList.remove('hidden');
        
        startDataSync(); 
        navTo('landing');
    });
}

function logout() {
    localStorage.removeItem('photoUser');
    document.getElementById('dynamicBg').classList.remove('hidden');
    location.reload();
}

function navTo(sectionId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${sectionId}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isTarget = btn.dataset.target === sectionId;
        const icon = btn.querySelector('svg');
        if(isTarget) {
            btn.classList.add('text-[#94c120]');
            btn.classList.remove('text-gray-500');
            if(icon) icon.classList.add('drop-shadow-[0_0_5px_rgba(148,193,32,0.5)]');
        } else {
            btn.classList.remove('text-[#94c120]');
            btn.classList.add('text-gray-500');
            if(icon) icon.classList.remove('drop-shadow-[0_0_5px_rgba(148,193,32,0.5)]');
        }
    });

    if (sectionId === 'gallery') renderGallery();
    if (sectionId === 'archives') renderArchives();
    if (sectionId === 'leaderboard') renderLeaderboard();
}

// --- 5. DATA ENGINE ---
function startDataSync() {
    // 1. Archives (History)
    db.collection("archives").onSnapshot(snap => {
        state.archives = snap.docs.map(d => d.data()).sort((a,b) => b.id.localeCompare(a.id));
        
        // LOGIN SCREEN BACKGROUND LOGIC (Latest Winner)
        if(state.archives.length > 0) {
            const lastWinId = state.archives[0].winners.gold;
            const entry = state.archives[0].entries.find(e => e.id === lastWinId);
            if(entry) document.getElementById('dynamicBg').style.backgroundImage = `url('${entry.url}')`;
        }
    });

    // 2. Active Contests
    db.collection("contests").onSnapshot(snapshot => {
        if (snapshot.empty) {
            // No active contest exists (e.g. all deleted)
            state.activeContest = null;
            state.entries = [];
            updateHomeUI(null);
            return;
        }

        const allContests = snapshot.docs.map(d => ({...d.data(), id: d.id}));
        allContests.sort((a, b) => b.id.localeCompare(a.id));
        
        // Find the newest contest that IS NOT CLOSED
        const latest = allContests.find(c => c.status !== 'closed');
        
        if (!latest) {
             state.activeContest = null;
             state.entries = [];
             updateHomeUI(null);
        } else {
             // If we switched months/IDs, reset local entries listener
             if(!state.activeContest || state.activeContest.id !== latest.id) {
                 syncEntries(latest.id);
             }
             state.activeContest = latest;
             state.hasVotedLocally = !!localStorage.getItem(`voted_${latest.id}`);
             updateHomeUI(latest);
        }
    });
}

let entriesUnsubscribe = null;
function syncEntries(contestId) {
    if(entriesUnsubscribe) entriesUnsubscribe(); // Unsubscribe previous listener
    
    entriesUnsubscribe = db.collection("contests").doc(contestId).collection("entries").onSnapshot(snap => {
        state.entries = snap.docs.map(d => d.data());
        
        // Shuffle logic for voting
        if (state.shuffledEntries.length === 0) {
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

    if (!contest) {
        title.textContent = "No Contest Active";
        badge.textContent = "Idle";
        badge.className = "inline-block px-3 py-1 rounded-full bg-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wider mb-3";
        desc.textContent = "Wait for Admin to launch a new month.";
        return;
    }

    title.textContent = contest.monthName;
    
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

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';
    
    if(!state.activeContest) {
        grid.innerHTML = `<div class="col-span-3 text-center text-gray-500 py-10">Waiting for photos...</div>`;
        return;
    }

    const isVoting = state.activeContest.status === 'voting';
    const isLocked = state.hasVotedLocally;
    
    // Show shuffled/nameless ONLY if voting is open AND user hasn't voted yet
    const showShuffled = isVoting && !isLocked;
    const list = showShuffled ? state.shuffledEntries : state.entries;

    document.getElementById('galleryTitle').textContent = isLocked ? "Gallery (Results Pending)" : "Cast Your Votes";
    document.getElementById('voteCounter').textContent = isLocked ? "Completed" : `Votes: ${Object.values(state.votes).filter(x=>x).length}/3`;

    list.forEach(entry => {
        const isMine = entry.photographer === state.currentUser;
        
        let rank = 0;
        if(state.votes[1] === entry.id) rank = 1;
        if(state.votes[2] === entry.id) rank = 2;
        if(state.votes[3] === entry.id) rank = 3;

        let borderClass = 'border-gray-700';
        let opacityClass = 'opacity-100';
        
        if (rank === 1) borderClass = 'border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]';
        if (rank === 2) borderClass = 'border-gray-300 ring-2 ring-gray-300';
        if (rank === 3) borderClass = 'border-orange-500 ring-2 ring-orange-500';
        
        const clickAction = (isVoting && !isLocked && !isMine) ? '' : `viewImage('${entry.url}')`;
        
        const el = document.createElement('div');
        el.className = `bg-gray-800 rounded-xl overflow-hidden border transition-all duration-300 transform ${borderClass} ${opacityClass}`;
        el.innerHTML = `
            <div class="w-full h-auto bg-gray-900 group" onclick="${clickAction}">
                <img src="${entry.url}" loading="lazy" class="w-full h-auto object-contain">
                ${isMine ? '<span class="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">YOU</span>' : ''}
            </div>
            
            ${ (!showShuffled || isMine) ? `<div class="p-2 text-center text-xs font-bold text-gray-400 border-t border-gray-700">${entry.photographer}</div>` : '' }

            ${ (isVoting && !isLocked && !isMine) ? `
                <div class="p-2 flex gap-1 justify-center bg-gray-800">
                    <button onclick="castVote(1, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===1 ? 'bg-yellow-400 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">1st</button>
                    <button onclick="castVote(2, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===2 ? 'bg-gray-200 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">2nd</button>
                    <button onclick="castVote(3, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===3 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">3rd</button>
                </div>
            ` : '' }
        `;
        grid.appendChild(el);
    });

    const votes = Object.values(state.votes).filter(x=>x).length;
    const btn = document.getElementById('submitBtn');
    if(votes === 3 && !isLocked) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

function castVote(rank, id) {
    if(state.votes[rank] === id) {
        state.votes[rank] = null; 
    } else {
        if(state.votes[1]===id) state.votes[1]=null;
        if(state.votes[2]===id) state.votes[2]=null;
        if(state.votes[3]===id) state.votes[3]=null;
        state.votes[rank] = id; 
    }
    renderGallery();
}

async function submitVotes() {
    if(!confirm("Submit these 3 votes?")) return;
    
    await db.collection("contests").doc(state.activeContest.id).collection("votes").doc(state.currentUser).set({
        voter: state.currentUser,
        votes: state.votes,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    localStorage.setItem(`voted_${state.activeContest.id}`, 'true');
    state.hasVotedLocally = true;
    navTo('landing');
    alert("Votes Submitted Successfully! 🚀");
}

// --- 7. LEADERBOARD & ARCHIVES ---
function renderLeaderboard() {
    let scores = {};
    TEAM_MEMBERS.forEach(m => scores[m] = { name: m, points: 0, gold: 0, silver: 0, bronze: 0, entries: 0 });

    // Tally All History
    state.archives.forEach(contest => {
        contest.entries.forEach(e => {
            if(scores[e.photographer]) scores[e.photographer].entries++;
        });

        const findName = (id) => { const e = contest.entries.find(x => x.id === id); return e ? e.photographer : null; };
        const g = findName(contest.winners.gold);
        const s = findName(contest.winners.silver);
        const b = findName(contest.winners.bronze);

        if(g && scores[g]) { scores[g].points += 3; scores[g].gold++; }
        if(s && scores[s]) { scores[s].points += 2; scores[s].silver++; }
        if(b && scores[b]) { scores[b].points += 1; scores[b].bronze++; }
    });

    // Sort High -> Low
    const sorted = Object.values(scores).sort((a,b) => b.points - a.points);
    
    // UI Render
    const grid = document.getElementById('leaderboardGrid');
    grid.innerHTML = `
        <div class="grid grid-cols-12 bg-[#151b2b] p-4 text-xs text-gray-500 font-bold uppercase tracking-wider border-b border-gray-800">
            <div class="col-span-2 text-center">Rank</div>
            <div class="col-span-4 pl-2">Photographer</div>
            <div class="col-span-2 text-center">Entries</div>
            <div class="col-span-2 text-center">Wins</div>
            <div class="col-span-2 text-center text-[#94c120]">Pts</div>
        </div>
    `;

    sorted.forEach((p, idx) => {
        let rankDisplay = `<span class="text-gray-600 font-bold text-lg">#${idx+1}</span>`;
        if(idx===0) rankDisplay = '🥇';
        if(idx===1) rankDisplay = '🥈';
        if(idx===2) rankDisplay = '🥉';

        // Fake Trend Logic (For MVP - Random or Static)
        // Real trend logic requires storing previous month's snapshot. 
        // For now, we use a static 'dash' unless we implement full history tracking.
        const trend = `<span class="text-gray-600 ml-2">➖</span>`;

        grid.innerHTML += `
            <div class="grid grid-cols-12 items-center p-4 border-b border-gray-800/50 hover:bg-white/5 transition bg-[#151b2b]">
                <div class="col-span-2 flex justify-center items-center">${rankDisplay} ${trend}</div>
                <div class="col-span-4 font-bold text-white text-sm pl-2 truncate">${p.name}</div>
                <div class="col-span-2 text-center text-gray-400 font-mono">${p.entries}</div>
                <div class="col-span-2 text-center text-xs text-gray-500 font-mono">${p.gold}/${p.silver}/${p.bronze}</div>
                <div class="col-span-2 text-center text-xl font-bold text-[#94c120]">${p.points}</div>
            </div>
        `;
    });
}

function renderArchives() {
    const grid = document.getElementById('archiveGrid');
    grid.innerHTML = '';
    document.getElementById('megaArchive').classList.add('hidden');
    document.getElementById('archiveGrid').classList.remove('hidden');

    state.archives.forEach(a => {
        // Winner Thumbnail
        const winEntry = a.entries.find(e => e.id === a.winners.gold);
        const thumb = winEntry ? winEntry.url : '';
        
        const card = document.createElement('div');
        card.className = "glass p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-gray-800 transition relative group";
        
        let deleteBtn = '';
        if(state.isAdmin) {
            deleteBtn = `<button onclick="deleteArchive('${a.id}', event)" class="absolute top-2 right-2 text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 p-1 rounded-full px-2 text-xs">✕</button>`;
        }

        card.innerHTML = `
            <div class="h-16 w-16 bg-gray-800 rounded-lg bg-cover bg-center" style="background-image: url('${thumb}')"></div>
            <div onclick="openArchiveDetail('${a.id}')" class="flex-grow">
                <h3 class="font-bold text-white">${a.monthName}</h3>
                <p class="text-xs text-gray-400">${a.entries.length} Entries</p>
            </div>
            ${deleteBtn}
        `;
        grid.appendChild(card);
    });
}

function openArchiveDetail(id) {
    const archive = state.archives.find(a => a.id === id);
    if(!archive) return;

    document.getElementById('archiveGrid').classList.add('hidden');
    document.getElementById('megaArchive').classList.remove('hidden');

    const megaGrid = document.getElementById('megaGrid');
    megaGrid.innerHTML = `
        <div class="col-span-full mb-6">
            <h2 class="text-2xl font-bold text-white mb-4 text-center">🏆 Winners: ${archive.monthName}</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${renderWinnerCard(archive, 'gold', '🥇')}
                ${renderWinnerCard(archive, 'silver', '🥈')}
                ${renderWinnerCard(archive, 'bronze', '🥉')}
            </div>
            <h3 class="text-xl font-bold text-white mt-8 mb-4 border-b border-gray-700 pb-2">All Entries</h3>
        </div>
    `;

    // Render the rest
    archive.entries.forEach(entry => {
        // Don't show winners again? Optional. For now show all.
        megaGrid.innerHTML += `
            <div class="relative group cursor-zoom-in" onclick="viewImage('${entry.url}')">
                <img src="${entry.url}" class="w-full h-auto rounded-lg shadow-lg opacity-80 hover:opacity-100 transition">
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-lg">
                    <span class="text-white font-bold text-xs">${entry.photographer}</span>
                </div>
            </div>
        `;
    });
}

function renderWinnerCard(archive, rankKey, icon) {
    const entryId = archive.winners[rankKey];
    const entry = archive.entries.find(e => e.id === entryId);
    if(!entry) return '';
    
    return `
        <div class="bg-[#151b2b] rounded-xl overflow-hidden border border-[#94c120]/30 shadow-lg">
            <img src="${entry.url}" class="w-full h-64 object-contain bg-black">
            <div class="p-4 text-center">
                <div class="text-2xl mb-1">${icon}</div>
                <div class="font-bold text-white text-lg">${entry.photographer}</div>
            </div>
        </div>
    `;
}

// --- 8. ADMIN ---
function showAdminPanel() { document.getElementById('view-admin').classList.remove('hidden'); }

async function adminCreateContest() {
    const n = document.getElementById('newContestName').value;
    const i = document.getElementById('newContestId').value;
    if(!n || !i) return;
    
    // Status defaults to voting immediately
    await db.collection("contests").doc(i).set({ monthName: n, status: "voting" });
    alert("Created & Live!"); 
    location.reload();
}

async function adminFinalizeArchive() {
    if(!state.activeContest) return;

    // Auto-Tally Logic
    const votesSnap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    let scores = {};
    
    votesSnap.forEach(doc => {
        const v = doc.data().votes;
        if(v[1]) scores[v[1]] = (scores[v[1]] || 0) + 3;
        if(v[2]) scores[v[2]] = (scores[v[2]] || 0) + 2;
        if(v[3]) scores[v[3]] = (scores[v[3]] || 0) + 1;
    });

    // Sort by points
    const sortedIds = Object.keys(scores).sort((a,b) => scores[b] - scores[a]);
    const gold = sortedIds[0] || "none";
    const silver = sortedIds[1] || "none";
    const bronze = sortedIds[2] || "none";

    // Archive
    await db.collection("archives").doc(state.activeContest.id).set({
        id: state.activeContest.id,
        monthName: state.activeContest.monthName,
        winners: {gold, silver, bronze},
        entries: state.entries
    });

    // Close
    await db.collection("contests").doc(state.activeContest.id).update({status:'closed'});
    
    alert(`Archived! Winner: ${gold}`);
    location.reload();
}

async function deleteArchive(id, event) {
    if(event) event.stopPropagation();
    if(!confirm(`DELETE ${id}? This cannot be undone.`)) return;

    // 1. Delete Firestore Docs
    await db.collection("contests").doc(id).delete();
    await db.collection("archives").doc(id).delete();

    // 2. Clear LocalStorage Lock
    localStorage.removeItem(`voted_${id}`);

    // 3. Clear State
    state.activeContest = null;
    state.entries = [];
    state.hasVotedLocally = false;

    alert("Deleted. Please remove the folder from your PC to prevent re-sync.");
    renderArchives();
    updateHomeUI(null);
}

function viewImage(url) {
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
}