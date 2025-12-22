const {setGlobalOptions} = require("firebase-functions");
const {onSchedule} = require("firebase-functions/scheduler");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Get Firestore instance
const db = admin.firestore();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onSchedule({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

/**
 * Helper function to calculate date boundaries for contest lifecycle
 */
function calculateDateBoundaries(currentDate = new Date()) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11
  
  // Previous month (just ended)
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  
  // Current month (starting now)
  const currentMonth = month;
  const currentYear = year;
  
  // Next month (upcoming)
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  
  // Format as ISO keys (e.g., "2025-12")
  const prevMonthKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const nextMonthKey = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
  
  // Human readable names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const prevMonthName = `${monthNames[prevMonth]} ${prevYear}`;
  const currentMonthName = `${monthNames[currentMonth]} ${currentYear}`;
  const nextMonthName = `${monthNames[nextMonth]} ${nextYear}`;
  
  return {
    previous: { key: prevMonthKey, name: prevMonthName, year: prevYear, month: prevMonth },
    current: { key: currentMonthKey, name: currentMonthName, year: currentYear, month: currentMonth },
    next: { key: nextMonthKey, name: nextMonthName, year: nextYear, month: nextMonth }
  };
}

/**
 * Calculate winners based on votes from a contest
 */
async function calculateWinners(contestId, entries) {
  logger.info(`Calculating winners for contest ${contestId}`);
  
  try {
    // Get all votes for this contest
    const votesSnapshot = await db.collection('contests').doc(contestId)
      .collection('votes')
      .get();
    
    const voteCounts = {};
    
    // Count votes for each entry
    votesSnapshot.forEach(doc => {
      const vote = doc.data();
      if (vote.entryId) {
        voteCounts[vote.entryId] = (voteCounts[vote.entryId] || 0) + 1;
      }
    });
    
    // Sort entries by vote count
    const sortedEntries = entries
      .map(entry => ({
        ...entry,
        votes: voteCounts[entry.id] || 0
      }))
      .sort((a, b) => b.votes - a.votes);
    
    // Determine winners (top 3)
    const winners = {
      gold: sortedEntries.length > 0 ? sortedEntries[0] : null,
      silver: sortedEntries.length > 1 ? sortedEntries[1] : null,
      bronze: sortedEntries.length > 2 ? sortedEntries[2] : null
    };
    
    logger.info(`Winners calculated for ${contestId}:`, winners);
    return winners;
    
  } catch (error) {
    logger.error(`Error calculating winners for contest ${contestId}:`, error);
    throw error;
  }
}

/**
 * Archive a completed contest
 */
async function archiveContest(contestId, contestData, winners) {
  logger.info(`Archiving contest ${contestId}`);
  
  try {
    const archiveData = {
      monthName: contestData.monthName,
      monthKey: contestId,
      winners: {
        gold: winners.gold ? { id: winners.gold.id, photographer: winners.gold.photographer, votes: winners.gold.votes } : null,
        silver: winners.silver ? { id: winners.silver.id, photographer: winners.silver.photographer, votes: winners.silver.votes } : null,
        bronze: winners.bronze ? { id: winners.bronze.id, photographer: winners.bronze.photographer, votes: winners.bronze.votes } : null
      },
      stats: {
        totalEntries: contestData.entries ? contestData.entries.length : 0,
        votesCast: contestData.votesCast || 0,
        archivedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      entries: contestData.entries || [],
      status: 'archived'
    };
    
    // Save to archives collection
    await db.collection('archives').doc(contestId).set(archiveData);
    
    // Update original contest status
    await db.collection('contests').doc(contestId).update({
      status: 'archived',
      archivedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info(`Contest ${contestId} archived successfully`);
    
  } catch (error) {
    logger.error(`Error archiving contest ${contestId}:`, error);
    throw error;
  }
}

/**
 * Main monthly contest automation function
 * Runs automatically on the 1st of every month at 00:01 UTC
 */
exports.monthlyContestTrigger = onSchedule({
  schedule: "1 0 1 * *", // Minute 1, Hour 0 (UTC), Day 1, Every month
  timeZone: "UTC"
}, async (event) => {
  logger.info("Monthly contest automation trigger started", {
    timestamp: new Date().toISOString()
  });
  
  try {
    // Calculate date boundaries
    const dates = calculateDateBoundaries();
    logger.info("Date boundaries calculated:", dates);
    
    // Step 1: Archive Previous Month Contest
    const prevContestRef = db.collection('contests').doc(dates.previous.key);
    const prevContestDoc = await prevContestRef.get();
    
    if (prevContestDoc.exists && prevContestDoc.data().status === 'voting') {
      logger.info(`Processing previous month contest: ${dates.previous.key}`);
      
      const contestData = prevContestDoc.data();
      const winners = await calculateWinners(dates.previous.key, contestData.entries || []);
      await archiveContest(dates.previous.key, contestData, winners);
      
    } else {
      logger.info(`No active voting contest found for previous month: ${dates.previous.key}`);
    }
    
    // Step 2: Activate Current Month Contest (submissions_open -> voting)
    const currentContestRef = db.collection('contests').doc(dates.current.key);
    const currentContestDoc = await currentContestRef.get();
    
    if (currentContestDoc.exists && currentContestDoc.data().status === 'submissions_open') {
      logger.info(`Activating current month contest for voting: ${dates.current.key}`);
      
      await currentContestRef.update({
        status: 'voting',
        votingStartedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Contest ${dates.current.key} activated for voting`);
      
    } else {
      logger.warn(`Current month contest ${dates.current.key} not found or not in submissions_open status`);
    }
    
    // Step 3: Create Next Month Contest
    const nextContestRef = db.collection('contests').doc(dates.next.key);
    const nextContestDoc = await nextContestRef.get();
    
    if (!nextContestDoc.exists) {
      logger.info(`Creating new contest for next month: ${dates.next.key}`);
      
      const newContestData = {
        monthName: dates.next.name,
        monthKey: dates.next.key,
        year: dates.next.year,
        monthIndex: dates.next.month,
        status: 'submissions_open',
        submissionsOpenAt: admin.firestore.FieldValue.serverTimestamp(),
        votesCast: 0,
        entries: [],
        createdBy: 'monthlyContestTrigger'
      };
      
      await nextContestRef.set(newContestData);
      logger.info(`New contest created for ${dates.next.key}`);
      
    } else {
      logger.info(`Contest already exists for next month: ${dates.next.key}`);
    }
    
    logger.info("Monthly contest automation completed successfully", {
      processed: {
        archived: dates.previous.key,
        activated: dates.current.key,
        created: dates.next.key
      }
    });
    
  } catch (error) {
    logger.error("Monthly contest automation failed:", error);
    throw error;
  }
});
