// Firebase Configuration and Initialization
// Note: Using Firebase v9 compat mode for easier migration

const firebaseConfig = {
    apiKey: "AIzaSyBIvsnCd2apt1rNQAY1FESN_enD_UOte6w",
    authDomain: "photographer-contest.firebaseapp.com",
    projectId: "photographer-contest",
    storageBucket: "photographer-contest.firebasestorage.app",
    messagingSenderId: "147304996816",
    appId: "1:147304996816:web:f41d39a37485afa010a3d5"
};

// Initialize Firebase (compat mode)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export Firebase services
export const db = firebase.firestore();
export const auth = firebase.auth();
export const storage = firebase.storage();

// Main Entry Point - Event Listener Attachments

// IMPORTS: These pull logic from your OTHER files. 
// The bug was that the code for these files was ALSO pasted below, causing a crash.
import { initAuth, attemptLogin, populateUserSearch } from './auth.js';
import { calculateNextMonth } from './utils.js';
import { navTo, viewImage, renderArchives, loadMegaArchive, filterMega, openArchiveDetail, closeArchiveDetail } from './ui.js';
import { handleFileUpload, castVote, submitVotes, deleteEntry } from './contest.js';
import { 
    showAdminPanel,
    showAdminTab,
    refreshAdminUploads, 
    adminCreateContest, 
    adminCheckVotes, 
    adminFinalizeArchive,
    adminPurgeImages 
} from './admin.js';

// Initialize app on DOM load
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App Initializing v3.0...");
    
    // Ensure these functions exist in utils.js and auth.js
    calculateNextMonth(); 
    initAuth();
    
    // Attach all event listeners
    attachLoginListeners();
    attachHeaderListeners();
    attachLandingListeners();
    attachNavigationListeners();
    attachUploadListeners();
    attachGalleryListeners();
    attachArchiveListeners();
    attachAdminListeners();
    attachLightboxListeners();
    
    // Content protection
    document.addEventListener('contextmenu', e => e.preventDefault());
    
    console.log("✅ Event listeners attached");
});

// === LOGIN SCREEN ===
function attachLoginListeners() {
    const loginNameSearch = document.getElementById('loginNameSearch');
    const loginBtn = document.querySelector('#loginScreen button');
    
    // Filter the list as the user types
    if (loginNameSearch) {
        loginNameSearch.addEventListener('input', (e) => {
            populateUserSearch(e.target.value);
        });
    }
    
    if (loginBtn) {
        loginBtn.addEventListener('click', attemptLogin);
    }
}

// === HEADER ===
function attachHeaderListeners() {
    const adminBtn = document.getElementById('navAdmin');
    const reloadBtn = document.querySelector('header button:last-child');
    
    if (adminBtn) {
        adminBtn.addEventListener('click', showAdminPanel);
    }
    
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => location.reload());
    }
}

// === LANDING PAGE ===
function attachLandingListeners() {
    const landing = document.getElementById('view-landing');
    if (!landing) return;
    
    // Use event delegation for buttons
    landing.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        if (btn.hasAttribute('onclick')) return; // Skip if has inline handler
        
        // Navigation buttons
        const navTargets = {
            'Go to Gallery': 'gallery',
            'Submit for Next Month': 'upload',
            'Rankings': 'leaderboard',
            'History': 'archives',
            'Latest Winners': 'winners'
        };
        
        const text = btn.textContent.trim();
        for (const [key, target] of Object.entries(navTargets)) {
            if (text.includes(key)) {
                navTo(target);
                return;
            }
        }
    });
}

// === BOTTOM NAVIGATION ===
function attachNavigationListeners() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            if (target) navTo(target);
        });
    });
}

// === UPLOAD VIEW ===
function attachUploadListeners() {
    const fileInput = document.getElementById('fileInput');
    const uploadGrid = document.getElementById('uploadGrid');
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleFileUpload(e.target);
        });
    }
    
    // Event delegation for delete buttons
    if (uploadGrid) {
        uploadGrid.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('[data-delete-entry]');
            if (deleteBtn) {
                const entryId = deleteBtn.dataset.deleteEntry;
                const fileUrl = deleteBtn.dataset.fileUrl;
                deleteEntry(entryId, fileUrl);
            }
        });
    }
}

// === GALLERY VIEW ===
function attachGalleryListeners() {
    const galleryGrid = document.getElementById('galleryGrid');
    const submitBtn = document.getElementById('submitBtn');
    
    // Event delegation for vote buttons
    if (galleryGrid) {
        galleryGrid.addEventListener('click', (e) => {
            // Handle vote buttons
            const voteBtn = e.target.closest('[data-vote-rank]');
            if (voteBtn) {
                const rank = parseInt(voteBtn.dataset.voteRank);
                const entryId = voteBtn.dataset.entryId;
                castVote(rank, entryId);
                return;
            }
            
            // Handle image clicks (lightbox)
            const imageContainer = e.target.closest('[data-image-url]');
            if (imageContainer) {
                const url = imageContainer.dataset.imageUrl;
                viewImage(url);
                return;
            }
        });
    }
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitVotes);
    }
}

// === ARCHIVES VIEW ===
function attachArchiveListeners() {
    const archiveGrid = document.getElementById('archiveGrid');
    const megaArchive = document.getElementById('megaArchive');
    const megaGrid = document.getElementById('megaGrid');
    const archiveDetailView = document.getElementById('archiveDetailView');
    
    // Load mega archive button
    const loadMegaBtn = document.querySelector('#view-archives > button');
    if (loadMegaBtn) {
        loadMegaBtn.addEventListener('click', loadMegaArchive);
    }
    
    // Archive cards - event delegation
    if (archiveGrid) {
        archiveGrid.addEventListener('click', (e) => {
            const card = e.target.closest('[data-archive-id]');
            if (card) {
                const archiveId = card.dataset.archiveId;
                openArchiveDetail(archiveId);
            }
        });
    }
    
    // Mega archive filters and back button
    if (megaArchive) {
        megaArchive.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            // Back to folders button
            if (btn.textContent.includes('Folders')) {
                renderArchives();
                return;
            }
            
            // Filter buttons
            if (btn.id === 'filter-all') filterMega('all');
            else if (btn.id === 'filter-winners') filterMega('winners');
            else if (btn.id === 'filter-mine') filterMega('mine');
        });
    }
    
    // Mega grid images - event delegation
    if (megaGrid) {
        megaGrid.addEventListener('click', (e) => {
            const imageContainer = e.target.closest('[data-image-url]');
            if (imageContainer) {
                const url = imageContainer.dataset.imageUrl;
                viewImage(url);
            }
        });
    }
    
    // Archive detail view - event delegation
    if (archiveDetailView) {
        archiveDetailView.addEventListener('click', (e) => {
            // Close button
            const closeBtn = e.target.closest('[data-close-archive]');
            if (closeBtn) {
                closeArchiveDetail();
                return;
            }
            
            // Image clicks
            const imageContainer = e.target.closest('[data-image-url]');
            if (imageContainer) {
                const url = imageContainer.dataset.imageUrl;
                viewImage(url);
            }
        });
    }
}

// === ADMIN PANEL ===
function attachAdminListeners() {
    const adminPanel = document.getElementById('view-admin');
    if (!adminPanel) return;
    
    // Close admin panel button
    const closeBtn = adminPanel.querySelector('button');
    if (closeBtn && closeBtn.textContent.includes('Close')) {
        closeBtn.addEventListener('click', () => {
            adminPanel.classList.add('hidden');
        });
    }
    
    // Tab switching
    const tabButtons = adminPanel.querySelectorAll('.admin-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.id.replace('admin-tab-', '');
            showAdminTab(tabId);
        });
    });
    
    // Event delegation for all admin buttons
    adminPanel.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        // Skip if it's a tab button (already handled above)
        if (btn.classList.contains('admin-tab-btn')) return;
        
        // Refresh uploads
        if (btn.textContent.includes('Refresh')) {
            refreshAdminUploads();
            return;
        }
        
        // Create contest
        if (btn.textContent.includes('Create New Contest') || btn.textContent.includes('Create Contest')) {
            adminCreateContest();
            return;
        }
        
        // Check votes
        if (btn.textContent.includes('Check Current Votes') || btn.textContent.includes('Check Votes')) {
            adminCheckVotes();
            return;
        }
        
        // Finalize archive
        if (btn.textContent.includes('End Contest')) {
            adminFinalizeArchive();
            return;
        }
        
        // Purge images
        if (btn.textContent.includes('Purge')) {
            adminPurgeImages();
            return;
        }
    });
}

// === LIGHTBOX ===
function attachLightboxListeners() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.addEventListener('click', () => {
            lightbox.classList.add('hidden');
        });
    }
}

// Make helper functions available globally for inline onclicks if necessary
import { selectContest } from './contest.js';
window.selectContest = selectContest;
window.navTo = navTo;