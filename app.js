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
const storage = firebase.storage();

// --- 2. STATE ---
let state = {
    currentUser: localStorage.getItem('photoUser') || null,
    isAdmin: false,
    activeContest: null,      
    submissionContest: null,
    nextMonthId: null,
    nextMonthName: null,
    entries: [],
    archives: [],
    shuffledEntries: [],
    votes: { 1: null, 2: null, 3: null },
    hasVotedLocally: false,
    myUploads: [],
    teamMembers: [] 
};

let entriesUnsubscribe = null;
let uploadsUnsubscribe = null;

const DEFAULT_TEAM = [
    "Ivan Pecek", "Jack Wickes", "James Wilson", "James Denton",
    "Jemma Ridyard", "Jennifer Turnham", "Kacper Chodyra", "Kyle Plastock", 
    "Lloyd Woodger", "Luke Evans", "Paul Udogaranya", "Rainer Knappe", 
    "Raul Caramizaru", "Thomas McPherson", "William Howe", "Anthony Wilson"
];

// --- 3. INIT ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App Initializing...");
    calculateNextMonth();
    initTeam();
});

function calculateNextMonth() {
    const now = new Date();
    let nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    state.nextMonthId = `${y}-${m}`;
    state.nextMonthName = nextDate.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// --- 4. TEAM & AUTH ---
async function initTeam() {
    try {
        const doc = await db.collection('config').doc('settings').get();
        if (doc.exists && doc.data().teamMembers) {
            state.teamMembers = doc.data().teamMembers.sort();
        } else {
            state.teamMembers = DEFAULT_TEAM;
        }
    } catch (e) {
        state.teamMembers = DEFAULT_TEAM;
    }
    populateLoginDropdown();
    if (state.currentUser) {
        const input = document.getElementById('loginName');
        if(input) input.value = state.currentUser;
        checkPinRequirement();
    }
}

function populateLoginDropdown() {
    const s = document.getElementById('loginName');
    if(!s) return;
    s.innerHTML = '<option value="" disabled selected>Tap to select name...</option>';
    state.teamMembers.forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n;
        s.appendChild(o);
    });
}

function checkPinRequirement() {
    const s = document.getElementById('loginName');
    if(!s) return;
    const pinEl = document.getElementById('pinSection');
    if(pinEl) pinEl.classList.toggle('hidden', s.value !== "Anthony Wilson");
}

function attemptLogin() {
    const s = document.getElementById('loginName');
    if(!s) return;
    const name = s.value;
    if (!name) return;
    
    if (name === "Anthony Wilson") {
        const pin = document.getElementById('loginPin').value;
        if (pin !== "673191") return alert("Wrong PIN");
        state.isAdmin = true;
    }

    state.currentUser = name;
    localStorage.setItem('photoUser', name);
    
    auth.signInAnonymously().then(() => {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userNameDisplay').textContent = name.split(' ')[0]; 
        
        if (state.isAdmin) {
            const navAdmin = document.getElementById('navAdmin');
            if(navAdmin) navAdmin.classList.remove('hidden');
            if(document.getElementById('adminTeamList')) renderAdminTeamList();
        }
        
        startDataSync(); 
        navTo('landing');
    }).catch(e => {
        console.error("Login Error", e);
        alert("Login failed: " + e.message);
    });
}

function navTo(sectionId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    const target = document.getElementById(`view-${sectionId}`);
    if (target) target.classList.remove('hidden');

    const bg = document.getElementById('dynamicBg');
    const grad = document.getElementById('gradientOverlay');
    if(bg) { bg.classList.add('opacity-0'); bg.classList.remove('opacity-60'); }
    if(grad) { grad.classList.remove('from-gray-900', 'via-gray-900/70', 'to-gray-900/50'); grad.classList.add('bg-gray-900'); }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isTarget = btn.dataset.target === sectionId;
        btn.className = `nav-btn flex flex-col items-center justify-center w-full h-full transition ${isTarget ? 'text-[#94c120]' : 'text-gray-600'}`;
        const icon = btn.querySelector('span');
        if(icon) {
            if(isTarget) icon.classList.add('drop-shadow-[0_0_8px_rgba(148,193,32,0.5)]');
            else icon.classList.remove('drop-shadow-[0_0_8px_rgba(148,193,32,0.5)]');
        }
    });

    if (sectionId === 'gallery') renderGallery();
    if (sectionId === 'archives') renderArchives();
    if (sectionId === 'leaderboard') renderLeaderboard();
    if (sectionId === 'upload') renderUploadView();
}

// --- 5. DATA ENGINE ---
function startDataSync() {
    console.log("🔌 Connecting to DB...");
    
    db.collection("contests").onSnapshot(snapshot => {
        if (snapshot.empty) {
            handleNoContests();
            return;
        }

        const allContests = snapshot.docs.map(d => ({...d.data(), id: d.id}));
        
        let votingContest = allContests.find(c => c.status === 'voting');
        let subContest = allContests.find(c => c.status === 'submissions_open');

        if (!subContest) {
            state.submissionContest = { 
                id: state.nextMonthId, 
                monthName: state.nextMonthName, 
                status: 'virtual' 
            };
            syncMyUploads(state.nextMonthId);
        } else {
            const subIdChanged = !state.submissionContest || state.submissionContest.id !== subContest.id;
            state.submissionContest = subContest;
            if(subIdChanged) syncMyUploads(subContest.id);
        }

        if (votingContest) {
            const idChanged = !state.activeContest || state.activeContest.id !== votingContest.id;
            state.activeContest = votingContest;
            
            const userKey = `voted_${votingContest.id}_${state.currentUser}`;
            state.hasVotedLocally = !!localStorage.getItem(userKey);
            
            const savedVotes = localStorage.getItem(userKey + '_data');
            if(savedVotes) state.votes = JSON.parse(savedVotes);

            if(idChanged) syncEntries(votingContest.id);
        } else {
            state.activeContest = null;
            state.entries = [];
            if(entriesUnsubscribe) entriesUnsubscribe();
        }

        updateHomeUI(votingContest);
        if(document.getElementById('view-gallery') && !document.getElementById('view-gallery').classList.contains('hidden')) renderGallery();
        if(document.getElementById('view-upload') && !document.getElementById('view-upload').classList.contains('hidden')) renderUploadView();
    });

    db.collection("archives").onSnapshot(snap => {
        state.archives = snap.docs.map(d => d.data()).sort((a,b) => b.id.localeCompare(a.id));
        if(document.getElementById('storagePurgeSelect')) updateStorageDropdown();
    });
}

function handleNoContests() {
    state.activeContest = null;
    state.submissionContest = { id: state.nextMonthId, monthName: state.nextMonthName, status: 'virtual' };
    syncMyUploads(state.nextMonthId);
    state.entries = [];
    updateHomeUI(null);
    renderGallery();
}

function syncEntries(contestId) {
    if (entriesUnsubscribe) entriesUnsubscribe();
    console.log("📥 Syncing entries for:", contestId);

    entriesUnsubscribe = db.collection("contests").doc(contestId).collection("entries").onSnapshot(snap => {
        state.entries = snap.docs.map(d => d.data());
        
        if (state.shuffledEntries.length === 0 || state.shuffledEntries.length !== state.entries.length) {
            state.shuffledEntries = [...state.entries];
            for (let i = state.shuffledEntries.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [state.shuffledEntries[i], state.shuffledEntries[j]] = [state.shuffledEntries[j], state.shuffledEntries[i]];
            }
        }
        
        renderGallery();
    });
}

function syncMyUploads(contestId) {
    if (uploadsUnsubscribe) uploadsUnsubscribe();
    
    uploadsUnsubscribe = db.collection("contests").doc(contestId).collection("entries")
        .where("photographer", "==", state.currentUser)
        .onSnapshot(snap => {
            state.myUploads = snap.docs.map(d => d.data());
            renderUploadView();
        });
}

// --- 6. UPLOAD LOGIC ---
async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const targetContest = state.submissionContest;

    if (state.myUploads.length >= 3) {
        alert("You have already uploaded 3 images for this contest.");
        input.value = "";
        return;
    }

    const status = document.getElementById('uploadStatus');
    if(status) status.textContent = "Uploading... please wait.";
    
    try {
        const contestRef = db.collection("contests").doc(targetContest.id);
        const docSnap = await contestRef.get();
        if (!docSnap.exists) {
            await contestRef.set({
                monthName: targetContest.monthName,
                status: 'submissions_open'
            });
        }

        const storageRef = storage.ref(`contest_photos/${targetContest.id}/${state.currentUser}/${file.name}`);
        const snapshot = await storageRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();

        const entryId = `${state.currentUser}-${Date.now()}`.replace(/[^a-zA-Z0-9]/g, "_");
        
        await contestRef.collection("entries").doc(entryId).set({
            id: entryId,
            photographer: state.currentUser,
            url: downloadUrl,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            votes: 0
        });

        if(status) {
            status.textContent = "Upload Complete! ✅";
            setTimeout(() => status.textContent = "", 3000);
        }

    } catch (error) {
        console.error("Upload failed", error);
        if(status) status.textContent = "Error uploading. Try again.";
    }
    input.value = "";
}

function renderUploadView() {
    const view = document.getElementById('view-upload');
    if(!view || view.classList.contains('hidden')) return;

    const title = document.getElementById('uploadTitle');
    const container = document.getElementById('uploadContainer');
    const grid = document.getElementById('uploadGrid');
    const count = document.getElementById('uploadCount');

    if (!state.submissionContest) {
        if(title) title.textContent = "Loading...";
        return;
    }

    if(title) title.textContent = `Enter ${state.submissionContest.monthName}`;
    if(container) container.classList.remove('opacity-50', 'pointer-events-none');
    if(count) count.textContent = state.myUploads.length;

    if(grid) {
        grid.innerHTML = '';
        state.myUploads.forEach(entry => {
            grid.innerHTML += `
                <div class="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-600 aspect-square">
                    <img src="${entry.url}" class="w-full h-full object-cover opacity-80">
                    <div class="absolute bottom-0 w-full bg-black/60 p-1 text-center text-[10px] text-green-400 font-bold">EMBEDDED</div>
                </div>
            `;
        });
    }
}

// --- 7. UI RENDERERS ---
function updateHomeUI(contest) {
    const title = document.getElementById('homeMainTitle');
    const badge = document.getElementById('homeStatusBadge');
    const desc = document.getElementById('homeMainDesc');
    const endBtn = document.getElementById('btnEndContest');

    if(!title) return;

    if (!contest) {
        title.textContent = "No Active Voting";
        badge.textContent = "Waiting";
        badge.className = "inline-block px-3 py-1 rounded-full bg-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wider mb-3";
        desc.textContent = "Check back later or submit for next month.";
        if(endBtn) endBtn.disabled = true;
        return;
    }

    if(endBtn) {
        endBtn.disabled = false;
        endBtn.classList.remove('opacity-50', 'cursor-not-allowed');
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
    if(!grid) return;
    grid.innerHTML = '';
    
    if(!state.activeContest || state.entries.length === 0) {
        grid.innerHTML = `<div class="col-span-3 text-center text-gray-500 py-10">Waiting for photos...</div>`;
        return;
    }

    const isLocked = state.hasVotedLocally;
    // Anonymity: Show names ONLY if contest is closed OR it is my photo
    const showNames = state.activeContest.status === 'closed'; 
    const list = showNames ? state.entries : state.shuffledEntries; 

    const titleEl = document.getElementById('galleryTitle');
    const counterEl = document.getElementById('voteCounter');
    if(titleEl) titleEl.textContent = isLocked ? "Gallery (My Votes)" : "Cast Your Votes";
    if(counterEl) counterEl.textContent = isLocked ? "Submitted" : `Votes: ${Object.values(state.votes).filter(x=>x).length}/3`;

    list.forEach(entry => {
        const isMine = entry.photographer === state.currentUser;
        
        let rank = 0;
        if(state.votes[1] === entry.id) rank = 1;
        if(state.votes[2] === entry.id) rank = 2;
        if(state.votes[3] === entry.id) rank = 3;

        let borderClass = 'border-gray-700';
        let opacityClass = 'opacity-100';
        
        if (rank === 1) borderClass = 'border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]';
        else if (rank === 2) borderClass = 'border-gray-300 ring-2 ring-gray-300';
        else if (rank === 3) borderClass = 'border-orange-500 ring-2 ring-orange-500';
        else if (isLocked) opacityClass = 'opacity-40 grayscale';
        else {
            const votesCast = Object.values(state.votes).filter(x=>x).length;
            if (votesCast === 3 && rank === 0) opacityClass = 'opacity-40 grayscale';
        }

        const el = document.createElement('div');
        el.className = `bg-gray-800 rounded-xl overflow-hidden border transition-all duration-300 transform ${borderClass} ${opacityClass}`;
        
        el.innerHTML = `
            <div class="relative bg-gray-900 group cursor-pointer" onclick="viewImage('${entry.url}')">
                <img src="${entry.url}" loading="lazy" class="w-full h-auto object-contain">
                ${isMine ? '<span class="absolute top-2 right-2 bg-[#94c120] text-black text-[10px] font-bold px-2 py-1 rounded">YOU</span>' : ''}
            </div>
            
            ${ (showNames || isMine) ? `<div class="p-2 text-center text-xs font-bold text-gray-400 border-t border-gray-700">${entry.photographer}</div>` : '' }

            ${ (!isMine && !showNames) ? `
                <div class="p-2 flex gap-1 justify-center bg-gray-800">
                    <button ${isLocked ? 'disabled' : ''} onclick="castVote(1, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===1 ? 'bg-[#94c120] text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">1st</button>
                    <button ${isLocked ? 'disabled' : ''} onclick="castVote(2, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===2 ? 'bg-gray-200 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">2nd</button>
                    <button ${isLocked ? 'disabled' : ''} onclick="castVote(3, '${entry.id}')" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===3 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">3rd</button>
                </div>
            ` : '' }
        `;
        grid.appendChild(el);
    });

    const btn = document.getElementById('submitBtn');
    if(btn) {
        if(isLocked) {
            btn.textContent = "Votes Submitted ✅";
            btn.disabled = true;
            btn.classList.remove('hidden', 'bg-[#94c120]', 'hover:bg-[#82a81c]', 'shadow-[0_0_20px_rgba(148,193,32,0.4)]');
            btn.classList.add('bg-gray-700', 'text-gray-400', 'cursor-default');
        } else {
            const votes = Object.values(state.votes).filter(x=>x).length;
            if(votes === 3) {
                btn.textContent = "Submit 3 Votes ✅";
                btn.classList.remove('hidden');
            } else btn.classList.add('hidden');
        }
    }
}

function castVote(rank, id) {
    if(state.hasVotedLocally) return;
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
    if(!confirm("Submit these 3 votes? This cannot be undone.")) return;
    
    await db.collection("contests").doc(state.activeContest.id).collection("votes").doc(state.currentUser).set({
        voter: state.currentUser,
        votes: state.votes,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    const userKey = `voted_${state.activeContest.id}_${state.currentUser}`;
    localStorage.setItem(userKey, 'true');
    localStorage.setItem(userKey + '_data', JSON.stringify(state.votes));
    
    state.hasVotedLocally = true;
    navTo('landing');
    alert("Votes Submitted Successfully! 🚀");
}

// --- 8. ADMIN UPDATES ---
function showAdminPanel() { 
    document.getElementById('view-admin').classList.remove('hidden');
    updateStorageDropdown(); 
}

function renderAdminTeamList() {
    const list = document.getElementById('adminTeamList');
    if(!list) return; // Safety
    list.innerHTML = '';
    state.teamMembers.sort().forEach(m => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center text-gray-300 border-b border-white/10 pb-1";
        row.innerHTML = `
            <span>${m}</span>
            <button onclick="adminRemoveTeamMember('${m}')" class="text-red-500 hover:text-white px-2">×</button>
        `;
        list.appendChild(row);
    });
}

async function adminAddTeamMember() {
    const input = document.getElementById('newMemberName');
    const name = input.value.trim();
    if (!name) return;
    if (state.teamMembers.includes(name)) return alert("Already exists");
    state.teamMembers.push(name);
    await db.collection('config').doc('settings').update({ teamMembers: state.teamMembers });
    input.value = '';
    renderAdminTeamList();
    populateLoginDropdown();
}

async function adminRemoveTeamMember(name) {
    if (!confirm(`Remove ${name}? They will lose login access.`)) return;
    state.teamMembers = state.teamMembers.filter(m => m !== name);
    await db.collection('config').doc('settings').update({ teamMembers: state.teamMembers });
    renderAdminTeamList();
    populateLoginDropdown();
}

function updateStorageDropdown() {
    const sel = document.getElementById('storagePurgeSelect');
    if(!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select Archive to Purge...</option>';
    state.archives.forEach(a => {
        const o = document.createElement('option');
        o.value = a.id;
        o.textContent = `${a.monthName} (${a.entries.length} images)`;
        sel.appendChild(o);
    });
}

async function adminPurgeImages() {
    const id = document.getElementById('storagePurgeSelect').value;
    if(!id) return;
    if(!confirm(`WARNING: This will permanently delete all image files for ${id}. Continue?`)) return;
    try {
        const archive = state.archives.find(a => a.id === id);
        if(!archive) return;
        let deletedCount = 0;
        for (const entry of archive.entries) {
            if(entry.url) {
                try {
                    const ref = storage.refFromURL(entry.url);
                    await ref.delete();
                    deletedCount++;
                } catch(err) { console.log("Skip", entry.url); }
            }
        }
        alert(`Purged ${deletedCount} images.`);
    } catch (e) { console.error(e); alert("Error purging."); }
}

async function adminCreateContest() {
    const n = document.getElementById('newContestName').value;
    const i = document.getElementById('newContestId').value;
    if(!n || !i) return;
    await db.collection("contests").doc(i).set({ monthName: n, status: "voting" });
    alert("Created!"); 
    document.getElementById('view-admin').classList.add('hidden');
    navTo('landing');
}

async function deleteArchive(id) {
    if(!confirm(`Delete history for ${id}?`)) return;
    await db.collection("contests").doc(id).delete();
    await db.collection("archives").doc(id).delete();
    alert("Deleted.");
}

async function adminCheckVotes() {
    if (!state.activeContest) return alert("No active contest.");
    const list = document.getElementById('adminVoteList');
    if(!list) return;
    list.classList.remove('hidden');
    const snap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const voters = new Set(snap.docs.map(d => d.id)); 
    const voted = state.teamMembers.filter(m => voters.has(m));
    const pending = state.teamMembers.filter(m => !voters.has(m));
    list.innerHTML = `
        <div class="text-xs text-gray-400 mb-2">Voted: ${voted.length}/${state.teamMembers.length}</div>
        <div class="grid grid-cols-2 gap-2 text-xs">
            ${voted.map(n => `<div class="text-green-400">✅ ${n}</div>`).join('')}
            ${pending.map(n => `<div class="text-red-400">⏳ ${n}</div>`).join('')}
        </div>
    `;
}

async function adminFinalizeArchive() {
    if(!state.activeContest || !confirm("Finalize & Close?")) return;
    const votesSnap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const votes = votesSnap.docs.map(d => d.data().votes);
    let tally = {};
    state.entries.forEach(e => { tally[e.id] = { points: 0, gold: 0, silver: 0, bronze: 0, id: e.id, ...e }; });
    votes.forEach(v => {
        if(v['1'] && tally[v['1']]) { tally[v['1']].points += 3; tally[v['1']].gold++; }
        if(v['2'] && tally[v['2']]) { tally[v['2']].points += 2; tally[v['2']].silver++; }
        if(v['3'] && tally[v['3']]) { tally[v['3']].points += 1; tally[v['3']].bronze++; }
    });
    const results = Object.values(tally).sort((a,b) => b.points - a.points);
    if(results.length < 3) return alert("Not enough entries/votes.");
    
    await db.collection("archives").doc(state.activeContest.id).set({
        id: state.activeContest.id,
        monthName: state.activeContest.monthName,
        winners: {gold: results[0].id, silver: results[1].id, bronze: results[2].id},
        entries: results
    });
    await db.collection("contests").doc(state.activeContest.id).update({status:'closed'});
    location.reload();
}

function renderLeaderboard() {
    // 1. Calculate Historical Points
    const calculateScores = (archivesSubset) => {
        let sc = {};
        // Use loaded team members if possible, otherwise iterate names found in history
        state.teamMembers.forEach(m => sc[m] = { name: m, points: 0, gold: 0, silver: 0, bronze: 0, entries: 0 });
        
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
    if(!grid) return;
    
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
                <div class="col-span-2 flex items-center pl-1 md:pl-2">
                    <div class="w-6 md:w-8 flex justify-center mr-1">${rankDisplay}</div>
                    <div>${trend}</div>
                </div>
                
                <div class="col-span-3 font-bold text-white text-xs md:text-sm truncate tracking-tight pl-1">
                    ${p.name}
                </div>

                <div class="col-span-2 text-center text-gray-400 font-mono text-xs md:text-sm">
                    ${p.entries}
                </div>

                <div class="col-span-3 font-mono text-[10px] md:text-xs text-gray-500 text-center whitespace-nowrap">
                    ${winsStr}
                </div>

                <div class="col-span-2 font-bold text-[#94c120] text-sm md:text-xl text-right pr-1 md:pr-2">
                    ${p.points}
                </div>
            </div>
        `;
    });
}

function viewImage(url) {
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
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
    ['all','winners','mine'].forEach(t => {
        const btn = document.getElementById(`filter-${t}`);
        if(t === type) btn.className = "px-4 py-2 bg-[#94c120] text-black rounded-lg text-sm font-bold shadow-[0_0_10px_rgba(148,193,32,0.5)] whitespace-nowrap";
        else btn.className = "px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm font-bold whitespace-nowrap hover:text-white";
    });
    const grid = document.getElementById('megaGrid');
    grid.innerHTML = '';
    let items = [];
    if (type === 'all') {
        state.archives.forEach(a => items.push(...a.entries));
        items.sort(() => Math.random() - 0.5);
    } else if (type === 'winners') {
        state.archives.forEach(a => {
            const w = a.winners;
            const gold = a.entries.find(e=>e.id===w.gold);
            const silver = a.entries.find(e=>e.id===w.silver);
            const bronze = a.entries.find(e=>e.id===w.bronze);
            if(gold) items.push({...gold, rank: 1, month: a.monthName});
            if(silver) items.push({...silver, rank: 2, month: a.monthName});
            if(bronze) items.push({...bronze, rank: 3, month: a.monthName});
        });
    } else if (type === 'mine') {
        state.archives.forEach(a => items.push(...a.entries.filter(e => e.photographer === state.currentUser)));
    }
    if(items.length === 0) { grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No images found.</div>`; return; }
    items.forEach(img => {
        let border = '';
        if(type==='winners') {
            if(img.rank===1) border = 'border-2 border-yellow-400';
            if(img.rank===2) border = 'border-2 border-gray-300';
            if(img.rank===3) border = 'border-2 border-orange-500';
        }
        grid.innerHTML += `<div class="bg-gray-800 overflow-hidden cursor-pointer ${border}" onclick="viewImage('${img.url}')"><img src="${img.url}" loading="lazy" class="w-full h-auto object-cover hover:opacity-90 transition"></div>`;
    });
}

function openArchiveDetail(archiveId) {
    const archive = state.archives.find(a => a.id === archiveId);
    if(!archive) return;
    document.getElementById('archiveGrid').classList.add('hidden');
    const detail = document.getElementById('archiveDetailView');
    detail.classList.remove('hidden');
    
    const g = archive.entries.find(e=>e.id===archive.winners.gold);
    const s = archive.entries.find(e=>e.id===archive.winners.silver);
    const b = archive.entries.find(e=>e.id===archive.winners.bronze);
    const winnerIds = [archive.winners.gold, archive.winners.silver, archive.winners.bronze];
    const rest = archive.entries.filter(e => !winnerIds.includes(e.id));

    detail.innerHTML = `
        <div class="mb-8 fade-in">
            <button onclick="closeArchiveDetail()" class="mb-6 px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-400 hover:text-white flex items-center gap-2 transition">Back</button>
            <h2 class="text-3xl font-bold text-white mb-8 text-center">${archive.monthName} <span class="text-[#94c120]">Winners</span></h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div class="order-1 md:order-2">
                    ${g ? `<div class="bg-gray-800/50 rounded-2xl overflow-hidden border-2 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.2)]">
                        <img src="${g.url}" class="w-full h-64 md:h-80 object-cover" onclick="viewImage('${g.url}')">
                        <div class="p-4 text-center bg-[#151b2b]"><div class="text-3xl mb-1">🥇</div><div class="font-bold text-white text-xl">${g.photographer}</div><div class="text-[#94c120] font-mono text-sm">${g.points || '?'} pts</div></div></div>` : ''}
                </div>
                <div class="order-2 md:order-1 mt-4 md:mt-12">
                    ${s ? `<div class="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-400">
                        <img src="${s.url}" class="w-full h-56 md:h-64 object-cover" onclick="viewImage('${s.url}')">
                        <div class="p-4 text-center bg-[#151b2b]"><div class="text-2xl mb-1">🥈</div><div class="font-bold text-gray-200 text-lg">${s.photographer}</div><div class="text-gray-500 font-mono text-sm">${s.points || '?'} pts</div></div></div>` : ''}
                </div>
                <div class="order-3 md:order-3 mt-4 md:mt-12">
                    ${b ? `<div class="bg-gray-800/50 rounded-2xl overflow-hidden border border-orange-500">
                        <img src="${b.url}" class="w-full h-56 md:h-64 object-cover" onclick="viewImage('${b.url}')">
                        <div class="p-4 text-center bg-[#151b2b]"><div class="text-2xl mb-1">🥉</div><div class="font-bold text-gray-200 text-lg">${b.photographer}</div><div class="text-gray-500 font-mono text-sm">${b.points || '?'} pts</div></div></div>` : ''}
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                ${rest.map(e => `<div class="bg-gray-800 overflow-hidden cursor-pointer relative group rounded-lg" onclick="viewImage('${e.url}')"><img src="${e.url}" loading="lazy" class="w-full h-auto object-contain"><div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center flex-col p-2 text-center"><span class="text-white font-bold text-xs">${e.photographer}</span></div></div>`).join('')}
            </div>
        </div>
    `;
}