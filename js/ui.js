// UI Rendering and Navigation

import { state, DEFAULT_TEAM } from './state.js';
import { getFormattedDeadline } from './utils.js';

export function navTo(sectionId) {
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

export function updateHomeUI(contest) {
    const title = document.getElementById('homeMainTitle');
    const badge = document.getElementById('homeStatusBadge');
    const desc = document.getElementById('homeMainDesc');
    const endBtn = document.getElementById('btnEndContest');
    const deadlineText = document.getElementById('homeDeadline');

    if (deadlineText) {
         deadlineText.textContent = `⏳ Voting Closes: ${getFormattedDeadline()}`;
    }

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

export function renderGallery() {
    const deadlineText = document.getElementById('galleryDeadline');
    if (deadlineText) {
        deadlineText.textContent = `Voting ends: ${getFormattedDeadline()}`;
    }
    
    const grid = document.getElementById('galleryGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    if(!state.activeContest || state.entries.length === 0) {
        grid.innerHTML = `<div class="col-span-3 text-center text-gray-500 py-10">Waiting for photos...</div>`;
        return;
    }

    const isLocked = state.hasVotedLocally;
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
        
        if (!isLocked) {
            if (rank === 1) borderClass = 'border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]';
            else if (rank === 2) borderClass = 'border-gray-300 ring-2 ring-gray-300';
            else if (rank === 3) borderClass = 'border-orange-500 ring-2 ring-orange-500';
            
            const votesCast = Object.values(state.votes).filter(x=>x).length;
            if (votesCast === 3 && rank === 0) opacityClass = 'opacity-40 grayscale';
        } else {
            borderClass = 'border-gray-800'; 
        }

        const el = document.createElement('div');
        el.className = `bg-gray-800 rounded-xl overflow-hidden border transition-all duration-300 transform ${borderClass} ${opacityClass} protect-content`;
        
        let footerContent = '';
        
        if (isLocked) {
            if (rank === 1) {
                footerContent = `<div class="w-full py-3 bg-[#94c120] text-black font-bold text-center uppercase tracking-widest text-xs">1st Place</div>`;
            } else if (rank === 2) {
                footerContent = `<div class="w-full py-3 bg-gray-300 text-black font-bold text-center uppercase tracking-widest text-xs">2nd Place</div>`;
            } else if (rank === 3) {
                footerContent = `<div class="w-full py-3 bg-orange-500 text-white font-bold text-center uppercase tracking-widest text-xs">3rd Place</div>`;
            } else {
                footerContent = `<div class="w-full py-3 bg-gray-900/50 text-gray-700 text-center text-[10px] uppercase tracking-widest">&nbsp;</div>`;
            }
        } else if (!isMine && !showNames) {
            // Use data attributes instead of onclick
            footerContent = `
                <div class="p-2 flex gap-1 justify-center bg-gray-800">
                    <button data-vote-rank="1" data-entry-id="${entry.id}" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===1 ? 'bg-[#94c120] text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">1st</button>
                    <button data-vote-rank="2" data-entry-id="${entry.id}" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===2 ? 'bg-gray-200 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">2nd</button>
                    <button data-vote-rank="3" data-entry-id="${entry.id}" class="flex-1 py-2 rounded text-xs font-bold transition ${rank===3 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}">3rd</button>
                </div>
            `;
        } else if (showNames || isMine) {
            footerContent = `<div class="p-2 text-center text-xs font-bold text-gray-400 border-t border-gray-700">${entry.photographer}</div>`;
        }

        el.innerHTML = `
            <div class="relative bg-gray-900 group cursor-pointer" data-image-url="${entry.url}">
                <img src="${entry.url}" loading="lazy" class="w-full h-auto object-contain">
                ${isMine ? '<span class="absolute top-2 right-2 bg-[#94c120] text-black text-[10px] font-bold px-2 py-1 rounded">YOU</span>' : ''}
            </div>
            ${footerContent}
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

export function renderUploadView() {
    const view = document.getElementById('view-upload');
    if(!view || view.classList.contains('hidden')) return;

    const deadlineText = document.getElementById('uploadDeadline');
    if (deadlineText) {
        deadlineText.textContent = `Entries Close: ${getFormattedDeadline()}`;
    }

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
            const card = document.createElement('div');
            card.className = 'relative bg-gray-800 rounded-lg overflow-hidden border border-gray-600 aspect-square group protect-content';
            card.innerHTML = `
                <img src="${entry.url}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition">
                
                <div class="absolute top-0 left-0 bg-black/60 p-1 text-[8px] text-white">
                    #${entry.orderNum || '?'}/${entry.photoNum || '?'}
                </div>

                <button 
                    data-delete-entry="${entry.id}" 
                    data-file-url="${entry.url}"
                    class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Delete entry">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
                <div class="absolute bottom-0 w-full bg-[#94c120] p-1 text-center text-[10px] text-black font-bold tracking-wider">
                    Submitted!
                </div>
            `;
            grid.appendChild(card);
        });
    }
}

export function renderLeaderboard() {
    const grid = document.getElementById('leaderboardGrid');
    if(!grid) return;

    let sc = {};
    const roster = state.teamMembers.length > 0 ? state.teamMembers : DEFAULT_TEAM;
    
    roster.forEach(m => {
        sc[m] = { name: m, points: 0, gold: 0, silver: 0, bronze: 0, entries: 0 };
    });

    state.archives.forEach(contest => {
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
        
        contest.entries.forEach(e => {
            if(sc[e.photographer]) sc[e.photographer].entries++;
        });
    });

    const sortedCurrent = Object.values(sc).sort((a, b) => b.points - a.points);
    
    grid.innerHTML = `
        <div class="grid grid-cols-12 gap-2 p-2 md:p-4 text-[10px] md:text-xs uppercase font-bold text-gray-500 tracking-widest border-b border-gray-800 bg-gray-900/50 sticky top-0">
            <div class="col-span-2 flex items-center pl-2">Rank</div>
            <div class="col-span-3 flex items-center">Name</div>
            <div class="col-span-2 flex items-center justify-center"><span class="md:hidden">ENT</span><span class="hidden md:inline">Entries</span></div>
            <div class="col-span-3 flex items-center justify-center"><span class="md:hidden">WINS</span><span class="hidden md:inline">Wins (G/S/B)</span></div>
            <div class="col-span-2 flex items-center justify-end pr-2"><span class="md:hidden">PTS</span><span class="hidden md:inline">Total Pts</span></div>
        </div>
    `;

    let lastRankDisplay = 0;
    sortedCurrent.forEach((p, idx) => {
        let currentRank = idx + 1;
        if (idx > 0) {
            const prev = sortedCurrent[idx - 1];
            const isTied = prev.points === p.points && prev.gold === p.gold && prev.silver === p.silver && prev.bronze === p.bronze;
            if (isTied) currentRank = lastRankDisplay;
        }
        lastRankDisplay = currentRank;

        let rankDisplay = `<span class="text-gray-500 font-mono font-bold text-sm md:text-lg">#${currentRank}</span>`;
        if(currentRank===1) rankDisplay = '<span class="text-lg md:text-2xl filter drop-shadow-lg">🥇</span>';
        if(currentRank===2) rankDisplay = '<span class="text-lg md:text-2xl filter drop-shadow-lg">🥈</span>';
        if(currentRank===3) rankDisplay = '<span class="text-lg md:text-2xl filter drop-shadow-lg">🥉</span>';

        const winsStr = `${p.gold} <span class="text-gray-700">/</span> ${p.silver} <span class="text-gray-700">/</span> ${p.bronze}`;

        grid.innerHTML += `
            <div class="grid grid-cols-12 gap-2 items-center p-2 md:p-4 border-b border-gray-800/50 hover:bg-white/5 transition group">
                <div class="col-span-2 flex items-center pl-1 md:pl-2">
                    <div class="w-6 md:w-8 flex justify-center mr-1">${rankDisplay}</div>
                </div>
                <div class="col-span-3 font-bold text-white text-xs md:text-sm truncate tracking-tight pl-1">${p.name}</div>
                <div class="col-span-2 text-center text-gray-400 font-mono text-xs md:text-sm">${p.entries}</div>
                <div class="col-span-3 font-mono text-[10px] md:text-xs text-gray-500 text-center whitespace-nowrap">${winsStr}</div>
                <div class="col-span-2 font-bold text-[#94c120] text-sm md:text-xl text-right pr-1 md:pr-2">${p.points}</div>
            </div>
        `;
    });
}

export function viewImage(url) {
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
}

export function renderArchives() {
    const archiveGrid = document.getElementById('archiveGrid');
    if (!archiveGrid) return;
    
    archiveGrid.innerHTML = '';
    archiveGrid.classList.remove('hidden');
    document.getElementById('megaArchive').classList.add('hidden');
    document.getElementById('archiveDetailView').classList.add('hidden');
    
    if (state.archives.length === 0) {
        archiveGrid.innerHTML = '<div class="text-center text-gray-500 py-10">No archives yet.</div>';
        return;
    }
    
    state.archives.forEach(a => {
        const card = document.createElement('div');
        card.className = 'glass p-6 rounded-2xl border border-gray-700 hover:border-[#94c120] transition cursor-pointer';
        card.dataset.archiveId = a.id;
        card.innerHTML = `
            <h3 class="text-xl font-bold text-white mb-2">${a.monthName}</h3>
            <div class="text-sm text-gray-400">${a.entries.length} Entries</div>
        `;
        archiveGrid.appendChild(card);
    });
}

export function openArchiveDetail(archiveId) {
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
            <button data-close-archive class="mb-6 px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-400 hover:text-white flex items-center gap-2 transition">Back</button>
            <h2 class="text-3xl font-bold text-white mb-8 text-center">${archive.monthName} <span class="text-[#94c120]">Winners</span></h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div class="order-1 md:order-2">${g ? `<div class="bg-gray-800/50 rounded-2xl overflow-hidden border-2 border-yellow-400"><img src="${g.url}" class="w-full h-64 object-cover protect-content" data-image-url="${g.url}"><div class="p-4 text-center">🥇 ${g.photographer}</div></div>` : ''}</div>
                <div class="order-2 md:order-1 mt-4 md:mt-12">${s ? `<div class="bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-400"><img src="${s.url}" class="w-full h-56 object-cover protect-content" data-image-url="${s.url}"><div class="p-4 text-center">🥈 ${s.photographer}</div></div>` : ''}</div>
                <div class="order-3 md:order-3 mt-4 md:mt-12">${b ? `<div class="bg-gray-800/50 rounded-2xl overflow-hidden border border-orange-500"><img src="${b.url}" class="w-full h-56 object-cover protect-content" data-image-url="${b.url}"><div class="p-4 text-center">🥉 ${b.photographer}</div></div>` : ''}</div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                ${rest.map(e => `<div class="bg-gray-800 overflow-hidden rounded-lg protect-content" data-image-url="${e.url}"><img src="${e.url}" loading="lazy" class="w-full h-auto object-contain"></div>`).join('')}
            </div>
        </div>
    `;
}

export function closeArchiveDetail() {
    document.getElementById('archiveDetailView').classList.add('hidden');
    document.getElementById('archiveGrid').classList.remove('hidden');
}

export function loadMegaArchive() {
    document.getElementById('archiveGrid').classList.add('hidden');
    document.getElementById('megaArchive').classList.remove('hidden');
    filterMega('all');
}

export function filterMega(type) {
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
        const div = document.createElement('div');
        div.className = `bg-gray-800 overflow-hidden cursor-pointer ${border} protect-content`;
        div.dataset.imageUrl = img.url;
        div.innerHTML = `<img src="${img.url}" loading="lazy" class="w-full h-auto object-cover hover:opacity-90 transition">`;
        grid.appendChild(div);
    });
}
