// Contest Logic: Voting, Submissions, File Upload/Delete

import { db, storage } from './firebase-config.js';
import { state, setEntriesUnsubscribe, setUploadsUnsubscribe, setMyVoteUnsubscribe, entriesUnsubscribe, uploadsUnsubscribe, myVoteUnsubscribe } from './state.js';
import { updateHomeUI, renderGallery, renderUploadView } from './ui.js';
import { updateStorageDropdown } from './admin.js';

// --- DATA SYNC ENGINE (v3.1 - Robust Sync) ---
export function startDataSync() {
    console.log("🔌 Connecting to DB (Multi-Contest Mode)...");
    
    db.collection("contests").onSnapshot(snapshot => {
        if (snapshot.empty) {
            handleNoContests();
            return;
        }

        const allContests = snapshot.docs.map(d => ({...d.data(), id: d.id}));
        const userTeamId = state.currentUser?.teamId;
        const isSuperAdmin = state.currentUser?.role === 'super_admin';
        
        // TASK 3: Team Isolation - Filter contests by user's team
        state.availableContests = allContests
            .filter(c => {
                if (!['voting', 'submissions_open', 'skipped'].includes(c.status)) return false;
                
                // Super Admin sees all, otherwise filter by team
                if (isSuperAdmin) return true;
                if (!userTeamId) return true;
                return c.teamId === userTeamId || !c.teamId || c.type === 'monthly';
            })
            .sort((a, b) => {
                if (a.createdAt && b.createdAt) return b.createdAt.seconds - a.createdAt.seconds;
                return b.id.localeCompare(a.id);
            });
        
        console.log(`📊 Found ${state.availableContests.length} active contest(s)`);
        
        if (state.availableContests.length === 0) {
            handleNoContests();
            return; // Stop here if no contests
        }

        // --- 1. DEFINE SUBMISSION TARGET (FIX FOR 0/3 BUG) ---
        // Always identify the submission contest and sync uploads immediately
        const subContest = allContests.find(c => c.status === 'submissions_open');
        state.submissionContest = subContest || { 
            id: state.nextMonthId || 'virtual-next', 
            monthName: state.nextMonthName || 'Next Month', 
            status: 'virtual' 
        };

        // CRITICAL FIX: Always sync uploads if we have a valid submission target
        // This ensures the "0/3" badge works even if you are on the Landing page
        if (state.submissionContest.id) {
            console.log("🔄 Background Sync: Fetching user uploads...");
            syncMyUploads(state.submissionContest.id);
        }

        // --- 2. SELECT ACTIVE CONTEST (FIX FOR GALLERY) ---
        const currentId = state.activeContest?.id;
        const stillValid = currentId && state.availableContests.find(c => c.id === currentId);
        
        if (stillValid) {
            // Update the data for the currently selected contest
            const updatedContest = state.availableContests.find(c => c.id === currentId);
            state.activeContest = updatedContest;
            // Force gallery refresh in case data changed
            if(state.activeContest.status === 'voting') renderGallery(); 
        } else {
            // Auto-Select Logic
            const votingContest = state.availableContests.find(c => c.status === 'voting');
            const submissionContest = state.availableContests.find(c => c.status === 'submissions_open');
            
            console.log("🎯 Auto-Selecting Contest...");
            if (votingContest) {
                selectContest(votingContest.id);
            } else if (submissionContest) {
                selectContest(submissionContest.id);
            } else {
                selectContest(state.availableContests[0].id);
            }
        }
        
        // Ensure UI updates
        updateHomeUI(state.activeContest);
    });

    db.collection("archives").onSnapshot(snap => {
        state.archives = snap.docs.map(d => d.data()).sort((a,b) => b.id.localeCompare(a.id));
        if(document.getElementById('storagePurgeSelect')) updateStorageDropdown();
    });
}

export function selectContest(contestId) {
    console.log(`👉 Selecting Contest: ${contestId}`); // Debug Log
    const contest = state.availableContests.find(c => c.id === contestId);
    if (!contest) return;
    
    state.activeContest = contest;
    
    if (entriesUnsubscribe) entriesUnsubscribe();
    if (myVoteUnsubscribe) myVoteUnsubscribe();
    // Note: We do NOT stop uploadsUnsubscribe here, as we want that to persist for the badge
    
    // Only load entries if it's a voting contest
    if (contest.status === 'voting') {
        console.log("📥 This is a voting contest. Syncing entries...");
        syncEntries(contestId);
        syncMyVote(contestId);
    } 
    
    updateHomeUI(contest);
    renderGallery();
    
    window.dispatchEvent(new CustomEvent('contestChanged', { detail: { contestId, contest } }));
}

export function handleNoContests() {
    state.activeContest = null;
    state.submissionContest = { 
        id: state.nextMonthId, 
        monthName: state.nextMonthName, 
        status: 'virtual' 
    };
    syncMyUploads(state.nextMonthId);
    state.entries = [];
    updateHomeUI(null);
    renderGallery();
}

export function syncEntries(contestId) {
    if (entriesUnsubscribe) entriesUnsubscribe();

    // 1. Build Query
    let query = db.collection("contests").doc(contestId).collection("entries");
    
    // 2. CRITICAL FIX: Filter by Team ID to match Security Rules
    // Even though these are children of the contest, the rules likely require
    // resource.data.teamId == request.auth.token.teamId for EVERY document read.
    if (state.currentUser.teamId) {
        query = query.where('teamId', '==', state.currentUser.teamId);
    }

    const unsub = query.onSnapshot(snap => {
        state.entries = snap.docs.map(d => d.data());
        
        if (state.shuffledEntries.length === 0 || state.shuffledEntries.length !== state.entries.length) {
            state.shuffledEntries = [...state.entries];
            state.shuffledEntries.sort(() => Math.random() - 0.5);
        }
        renderGallery();
    }, (error) => {
        console.error("❌ Gallery Sync Error (Check Rules/TeamID):", error);
    });
    
    setEntriesUnsubscribe(unsub);
}

export function syncMyUploads(contestId) {
    if (uploadsUnsubscribe) uploadsUnsubscribe();
    
    // 1. Build Query: Get my photos
    let query = db.collection("contests").doc(contestId).collection("entries")
        .where("photographer", "==", state.currentUser.name);

    // 2. CRITICAL FIX: Add Team ID filter here too
    if (state.currentUser.teamId) {
        query = query.where("teamId", "==", state.currentUser.teamId);
    }

    const unsub = query.onSnapshot(snap => {
        state.myUploads = snap.docs.map(d => d.data());
        renderUploadView();
    }, (error) => {
        console.error("❌ My Uploads Sync Error:", error);
    });
    
    setUploadsUnsubscribe(unsub);
}

export function syncMyVote(contestId) {
    if (myVoteUnsubscribe) myVoteUnsubscribe();
    const unsub = db.collection("contests").doc(contestId).collection("votes").doc(state.currentUser.name)
        .onSnapshot(doc => {
            if (doc.exists) {
                state.hasVotedLocally = true;
                state.votes = doc.data().votes;
            } else {
                state.hasVotedLocally = false;
                state.votes = { 1: null, 2: null, 3: null };
            }
            updateHomeUI(state.activeContest);
            renderGallery();
        });
    setMyVoteUnsubscribe(unsub);
}

// --- FILE UPLOAD ---
export async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg'].includes(file.type)) return alert("JPG only.");
    if (file.size / 1024 / 1024 > 1) return alert("File too large (>1MB).");
    
    const targetContest = state.submissionContest;
    if (!targetContest) return alert("No submission contest active.");
    if (state.myUploads.length >= 3) return alert("Max 3 entries.");

    const orderNum = document.getElementById('inputOrderNum').value.trim();
    const photoNum = document.getElementById('inputPhotoNum').value.trim();
    
    // Check if metadata is required (default to true for backwards compatibility)
    const isMetadataRequired = targetContest.is_metadata_required !== false;
    
    if (isMetadataRequired && (!orderNum || !photoNum)) {
        return alert("Enter Order # and Photo #.");
    }

    const status = document.getElementById('uploadStatus');
    status.textContent = "Uploading...";

    try {
        const contestRef = db.collection("contests").doc(targetContest.id);
        const docSnap = await contestRef.get();
        
        if (!docSnap.exists) {
            await contestRef.set({
                monthName: targetContest.monthName,
                status: 'submissions_open',
                teamId: state.currentUser.teamId,
                is_metadata_required: true, // Default to true
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        const storageRef = storage.ref(`contest_photos/${targetContest.id}/${state.currentUser.name}/${file.name}`);
        const snapshot = await storageRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        const entryId = `${state.currentUser.name}-${Date.now()}`.replace(/[^a-zA-Z0-9]/g, "_");
        
        // Build entry object - only include metadata if provided
        const entryData = {
            id: entryId,
            photographer: state.currentUser.name,
            teamId: state.currentUser.teamId,
            url: downloadUrl,
            fileType: 'jpg',
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            votes: 0
        };
        
        // Add metadata fields if they exist
        if (orderNum) entryData.orderNum = orderNum;
        if (photoNum) entryData.photoNum = photoNum;
        
        await contestRef.collection("entries").doc(entryId).set(entryData);

        status.textContent = "Success! ✅";
        setTimeout(() => status.textContent = "", 3000);
        document.getElementById('inputOrderNum').value = '';
        document.getElementById('inputPhotoNum').value = '';

    } catch (error) {
        console.error(error);
        status.textContent = "Error: " + error.message;
    }
    input.value = "";
}

export async function deleteEntry(entryId, fileUrl) {
    if (!confirm("Delete?")) return;
    try {
        await db.collection("contests").doc(state.submissionContest.id).collection("entries").doc(entryId).delete();
        try { await storage.refFromURL(fileUrl).delete(); } catch (e) {}
    } catch (error) { alert(error.message); }
}

window.selectContest = selectContest;

export function castVote(rank, id) {
    if(state.hasVotedLocally) return;
    if(state.votes[rank] === id) state.votes[rank] = null; 
    else {
        if(state.votes[1]===id) state.votes[1]=null;
        if(state.votes[2]===id) state.votes[2]=null;
        if(state.votes[3]===id) state.votes[3]=null;
        state.votes[rank] = id; 
    }
    renderGallery();
}

export async function submitVotes() {
    if(!confirm("Submit votes?")) return;
    await db.collection("contests").doc(state.activeContest.id).collection("votes").doc(state.currentUser.name).set({
        voter: state.currentUser.name,
        votes: state.votes,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    const { navTo } = await import('./ui.js');
    navTo('landing');
}