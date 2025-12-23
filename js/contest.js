// Contest Logic: Voting, Submissions, File Upload/Delete

import { db, storage } from './firebase-config.js';
import { state, setEntriesUnsubscribe, setUploadsUnsubscribe, setMyVoteUnsubscribe, entriesUnsubscribe, uploadsUnsubscribe, myVoteUnsubscribe } from './state.js';
import { updateHomeUI, renderGallery, renderUploadView } from './ui.js';
import { updateStorageDropdown } from './admin.js';

// --- DATA SYNC ENGINE ---
export function startDataSync() {
    console.log("🔌 Connecting to DB...");
    
    db.collection("contests").onSnapshot(snapshot => {
        if (snapshot.empty) {
            handleNoContests();
            return;
        }

        const allContests = snapshot.docs.map(d => ({...d.data(), id: d.id}));
        
        let votingContest = allContests.find(c => c.status === 'voting');
        let subContest = allContests.find(c => c.status === 'submissions_open');

        // Submission Logic
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

        // Voting Logic
        if (votingContest) {
            const idChanged = !state.activeContest || state.activeContest.id !== votingContest.id;
            state.activeContest = votingContest;
            
            if(idChanged) {
                syncEntries(votingContest.id);
                syncMyVote(votingContest.id);
            }
        } else {
            state.activeContest = null;
            state.entries = [];
            state.votes = {1:null, 2:null, 3:null};
            state.hasVotedLocally = false;
            if(entriesUnsubscribe) entriesUnsubscribe();
            if(myVoteUnsubscribe) myVoteUnsubscribe();
        }

        updateHomeUI(votingContest);
        
        // Safe refreshes
        if(document.getElementById('view-gallery') && !document.getElementById('view-gallery').classList.contains('hidden')) renderGallery();
        if(document.getElementById('view-upload') && !document.getElementById('view-upload').classList.contains('hidden')) renderUploadView();
    });

    db.collection("archives").onSnapshot(snap => {
        state.archives = snap.docs.map(d => d.data()).sort((a,b) => b.id.localeCompare(a.id));
        if(document.getElementById('storagePurgeSelect')) updateStorageDropdown();
    });
}

export function handleNoContests() {
    state.activeContest = null;
    state.submissionContest = { id: state.nextMonthId, monthName: state.nextMonthName, status: 'virtual' };
    syncMyUploads(state.nextMonthId);
    state.entries = [];
    updateHomeUI(null);
    renderGallery();
}

export function syncEntries(contestId) {
    if (entriesUnsubscribe) entriesUnsubscribe();
    
    const unsub = db.collection("contests").doc(contestId).collection("entries").onSnapshot(snap => {
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
    
    setEntriesUnsubscribe(unsub);
}

export function syncMyUploads(contestId) {
    if (uploadsUnsubscribe) uploadsUnsubscribe();
    
    const unsub = db.collection("contests").doc(contestId).collection("entries")
        .where("photographer", "==", state.currentUser)
        .onSnapshot(snap => {
            state.myUploads = snap.docs.map(d => d.data());
            renderUploadView();
        });
    
    setUploadsUnsubscribe(unsub);
}

export function syncMyVote(contestId) {
    if (myVoteUnsubscribe) myVoteUnsubscribe();

    const unsub = db.collection("contests").doc(contestId).collection("votes").doc(state.currentUser)
        .onSnapshot(doc => {
            if (doc.exists) {
                state.hasVotedLocally = true;
                state.votes = doc.data().votes;
                console.log("☁️ Vote synced from cloud:", state.votes);
            } else {
                state.hasVotedLocally = false;
                state.votes = { 1: null, 2: null, 3: null };
            }
            updateHomeUI(state.activeContest);
            renderGallery();
        });
    
    setMyVoteUnsubscribe(unsub);
}

// --- FILE UPLOAD WITH VALIDATION ---
export async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    // 1. Validate File Type (JPG only)
    const validTypes = ['image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
        alert("Invalid file format. Please upload a JPG or JPEG image.");
        input.value = "";
        return;
    }

    // 2. Validate File Size (Max 1MB) - CRITICAL CONSTRAINT
    const fileSizeMB = file.size / 1024 / 1024;
    if (fileSizeMB > 1) {
        alert(`File is too large (${fileSizeMB.toFixed(2)}MB).\nPlease ensure it is under 1MB.`);
        input.value = "";
        return;
    }

    // 3. Validate Context
    const targetContest = state.submissionContest;
    if (!targetContest) return alert("No submission contest active.");
    
    // 4. Validate Limit (Max 3)
    if (state.myUploads.length >= 3) {
        input.value = "";
        return alert("Maximum of 3 entries reached. Delete one to upload new.");
    }

    // 5. Validate Metadata (Order # and Photo #)
    const orderNum = document.getElementById('inputOrderNum').value.trim();
    const photoNum = document.getElementById('inputPhotoNum').value.trim();

    if (!orderNum || !photoNum) {
        input.value = "";
        return alert("Please enter both Order Number and Photo Number.");
    }

    // --- PROCEED WITH UPLOAD ---
    const status = document.getElementById('uploadStatus');
    status.textContent = "Uploading JPG... please wait.";
    status.className = "text-center text-xs text-[#94c120] font-bold h-4";

    try {
        // Ensure contest doc exists
        const contestRef = db.collection("contests").doc(targetContest.id);
        const docSnap = await contestRef.get();
        if (!docSnap.exists) {
            await contestRef.set({
                monthName: targetContest.monthName,
                status: 'submissions_open',
                area: 'area2'
            });
        }

        // Upload to Storage
        const storageRef = storage.ref(`contest_photos/${targetContest.id}/${state.currentUser}/${file.name}`);
        const snapshot = await storageRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();

        // Create DB Entry
        const entryId = `${state.currentUser}-${Date.now()}`.replace(/[^a-zA-Z0-9]/g, "_");
        
        await contestRef.collection("entries").doc(entryId).set({
            id: entryId,
            photographer: state.currentUser,
            url: downloadUrl,
            orderNum: orderNum,
            photoNum: photoNum,
            fileType: 'jpg',
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            votes: 0
        });

        status.textContent = "Success! JPG Entered. ✅";
        setTimeout(() => status.textContent = "", 3000);

        // Clear inputs
        document.getElementById('inputOrderNum').value = '';
        document.getElementById('inputPhotoNum').value = '';

    } catch (error) {
        console.error("Upload failed", error);
        status.textContent = "Error: " + error.message;
        status.className = "text-center text-xs text-red-500 font-bold h-4";
    }
    input.value = "";
}

// --- DELETE ENTRY ---
export async function deleteEntry(entryId, fileUrl) {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    
    try {
        await db.collection("contests")
            .doc(state.submissionContest.id)
            .collection("entries")
            .doc(entryId)
            .delete();
        
        try {
            const storageRef = storage.refFromURL(fileUrl);
            await storageRef.delete();
            console.log("✅ Storage file deleted");
        } catch (storageError) {
            console.warn("Storage deletion skipped:", storageError.message);
        }
        
        console.log("✅ Entry deleted successfully");
        
    } catch (error) {
        console.error("Error deleting entry:", error);
        alert("Error deleting entry: " + error.message);
    }
}

// --- VOTING ---
export function castVote(rank, id) {
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

export async function submitVotes() {
    if(!confirm("Submit these 3 votes? This cannot be undone.")) return;
    
    await db.collection("contests").doc(state.activeContest.id).collection("votes").doc(state.currentUser).set({
        voter: state.currentUser,
        votes: state.votes,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    const { navTo } = await import('./ui.js');
    navTo('landing');
    alert("Votes Submitted Successfully! 🚀");
}
