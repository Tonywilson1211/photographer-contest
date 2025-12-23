// Admin Panel Logic

import { db, storage } from './firebase-config.js';
import { state } from './state.js';
import { populateLoginDropdown } from './auth.js';
import { navTo } from './ui.js';

export function showAdminPanel() { 
    const view = document.getElementById('view-admin');
    view.classList.remove('hidden');
    
    renderAdminTeamList();
    updateStorageDropdown();
}

export function renderAdminTeamList() {
    const list = document.getElementById('adminTeamList');
    if(!list) return;
    
    list.innerHTML = '';
    state.teamMembers.sort().forEach(m => {
        const div = document.createElement('div');
        div.className = "bg-gray-900 border border-gray-700 rounded p-2 flex justify-between items-center group hover:border-red-500/50 transition";
        div.innerHTML = `
            <span class="text-xs text-gray-300 font-bold truncate">${m}</span>
            <button data-remove-member="${m}" class="text-gray-600 hover:text-red-500 font-bold px-2">×</button>
        `;
        list.appendChild(div);
    });
}

export async function adminAddTeamMember() {
    const input = document.getElementById('newMemberName');
    const name = input.value.trim();
    
    if (!name) return;
    if (state.teamMembers.includes(name)) {
        alert("Name already exists in the list.");
        input.value = '';
        return;
    }

    const originalList = [...state.teamMembers];

    try {
        state.teamMembers.push(name);
        state.teamMembers.sort();
        
        await db.collection('config').doc('settings').set({ 
            teamMembers: state.teamMembers 
        }, { merge: true });

        input.value = '';
        renderAdminTeamList();
        populateLoginDropdown();
        alert(`Success: "${name}" added to the team.`);

    } catch (e) {
        console.error(e);
        state.teamMembers = originalList;
        alert("Error saving to database: " + e.message);
    }
}

export async function adminRemoveTeamMember(name) {
    if (!confirm(`Remove ${name}? They will lose login access.`)) return;
    state.teamMembers = state.teamMembers.filter(m => m !== name);
    await db.collection('config').doc('settings').update({ teamMembers: state.teamMembers });
    renderAdminTeamList();
    populateLoginDropdown();
}

export function updateStorageDropdown() {
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

export async function adminPurgeImages() {
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

export async function adminCreateContest() {
    const n = document.getElementById('newContestName').value;
    const i = document.getElementById('newContestId').value;
    if(!n || !i) return;
    await db.collection("contests").doc(i).set({ monthName: n, status: "voting" });
    alert("Created!"); 
    document.getElementById('view-admin').classList.add('hidden');
    navTo('landing');
}

export async function adminCheckVotes() {
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

export async function adminFinalizeArchive() {
    if(!state.activeContest || !confirm("Finalize & Close?")) return;
    
    const votesSnap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const votes = votesSnap.docs.map(d => d.data().votes);
    
    let tally = {};
    state.entries.forEach(e => { 
        tally[e.id] = { points: 0, gold: 0, silver: 0, bronze: 0, id: e.id, ...e }; 
    });
    
    // CRITICAL: Preserve 3-2-1 points system
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

export async function refreshAdminUploads() {
    const grid = document.getElementById('adminUploadsGrid');
    if(!grid) return;

    grid.innerHTML = '<div class="col-span-full text-center py-8 text-[#94c120] animate-pulse">Scanning Database...</div>';

    let targetId = state.nextMonthId;
    let targetName = state.nextMonthName;
    
    if (state.submissionContest && state.submissionContest.status === 'submissions_open') {
        targetId = state.submissionContest.id;
        targetName = state.submissionContest.monthName;
    }

    try {
        const snapshot = await db.collection("contests").doc(targetId).collection("entries").get();
        const entries = snapshot.docs.map(d => d.data());

        const tally = {};
        state.teamMembers.forEach(member => tally[member] = 0);
        entries.forEach(e => {
            if (tally[e.photographer] !== undefined) {
                tally[e.photographer]++;
            } else {
                tally[e.photographer] = 1;
            }
        });

        grid.innerHTML = '';
        
        const sortedNames = Object.keys(tally).sort((a,b) => tally[b] - tally[a]);

        sortedNames.forEach(name => {
            const count = tally[name];
            let statusClass = "border-gray-700 opacity-50";
            let statusIcon = "⚪";
            
            if (count === 3) {
                statusClass = "border-green-500 bg-green-900/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]";
                statusIcon = "✅";
            } else if (count > 0) {
                statusClass = "border-yellow-500 bg-yellow-900/10";
                statusIcon = "⏳";
            }

            grid.innerHTML += `
                <div class="bg-gray-900 rounded-xl border ${statusClass} p-3 transition flex items-center justify-between">
                    <div>
                        <div class="font-bold text-gray-200 text-sm truncate w-32">${name}</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider">Entries</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-mono font-bold text-white">${count}<span class="text-gray-600 text-sm">/3</span></div>
                        <div class="text-xs">${statusIcon}</div>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div class="col-span-full text-center text-red-500">Error scanning uploads: ${e.message}</div>`;
    }
}
